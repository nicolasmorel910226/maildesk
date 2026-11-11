import { z } from 'zod';
import { MailParser, type AttachmentStream, type MessageText } from 'mailparser';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export const folderSchema = z.string().min(1).max(250);
export const refSchema = z.object({ uid: z.number().int().positive(), folder: folderSchema });
export const sendSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50), cc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().min(1).max(998), text: z.string().max(500000),
  attachments: z.array(z.object({ filename: z.string().min(1).max(255), content: z.string().max(8000000).regex(/^[A-Za-z0-9+/]*={0,2}$/), contentType: z.string().max(200) })).max(10).optional(),
  inReplyTo: refSchema.optional(), forwardOf: refSchema.optional(),
}).refine(x => !(x.inReplyTo && x.forwardOf), 'Choose reply or forward, not both');
export function messagePath(mailbox: string, folder: string, uid?: number) {
  return `/mailboxes/${encodeURIComponent(mailbox)}/folders/${encodeURIComponent(folder)}/messages${uid === undefined ? '' : `/${uid}`}`;
}
export class MailError extends Error { constructor(message: string, public status = 400) { super(message); } }
const identitySchema = z.object({ data: z.object({
  orderResourceId: z.string().min(1),
  mailboxes: z.array(z.object({resourceId: z.string().min(1), address: z.string().email()})),
}) });
let environmentCache: {token:string;expires:number;request:Promise<z.infer<typeof identitySchema>['data']>} | undefined;
export function environmentConnection() {
  const token = process.env.HOSTINGER_MAIL_API_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 10 || token.length > 4096 || /\s/.test(token))
    throw new MailError('The server email token is invalid. Ask the workspace administrator to update it.', 503);
  const label = process.env.HOSTINGER_MAIL_CONNECTION_NAME?.trim() || 'Business email';
  return {token, label: label.slice(0,80)};
}
export async function environmentIdentity(force = false) {
  const config = environmentConnection();
  if (!config) throw new MailError('Email is not configured on this server. Ask the workspace administrator to configure it.', 503);
  if (force || !environmentCache || environmentCache.token !== config.token || environmentCache.expires <= Date.now()) {
    const request = hostinger(config.token, '/me').then(value => {
      const parsed = identitySchema.safeParse(value);
      if (!parsed.success) throw new MailError('Hostinger returned an invalid mailbox list. Try refreshing the connection.', 502);
      return parsed.data.data;
    });
    const entry = {token:config.token, expires:Date.now()+60000, request};
    environmentCache = entry;
    request.catch(() => {if (environmentCache === entry) environmentCache = undefined;});
  }
  return {...config, ...await environmentCache.request};
}
// Decode the original MIME source, not Hostinger's rendered /text response:
// that endpoint can incorrectly base64-decode a plain, unencoded message body.
export async function parseMessageText(response: Response, limit = 32 * 1024 * 1024) {
  if (!response.body) throw new MailError('The original email content is unavailable. Try opening it again.', 502);
  const tooLarge = () => new MailError('This email is too large to display here (32 MB source limit). Open it in Hostinger Webmail.', 413);
  if (Number(response.headers.get('content-length') || 0) > limit) {
    await response.body.cancel(); throw tooLarge();
  }
  let bytes = 0;
  const bounds = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length; done(bytes > limit ? tooLarge() : null, chunk);
  }});
  const parser = new MailParser({ skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  const data = { text: '', html: '' };
  const sink = new Writable({ objectMode: true, write(part: AttachmentStream | MessageText, _encoding, done) {
    if (part.type === 'attachment') {
      // Drain attachments without buffering, saving, or returning their contents.
      part.content.once('error', error => parser.destroy(error));
      part.content.once('end', () => part.release?.());
      part.content.resume();
    } else {
      data.text = part.text || '';
      data.html = typeof part.html === 'string' ? part.html : '';
    }
    done();
  }});
  try { await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), bounds, parser, sink); }
  catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError('The original email could not be decoded. Try opening it again or use Hostinger Webmail.', 502);
  }
  return { data };
}
export async function messageText(token: string, path: string) {
  return parseMessageText(await hostinger(token, `${path}/source`, 'GET', undefined, true));
}
export async function hostinger(token: string, path: string, method = 'GET', body?: unknown, raw = false): Promise<any> {
  let response: Response;
  try { response = await fetch(`https://api.mail.hostinger.com/api/v1${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error',
  }); } catch { throw new MailError(method === 'POST' && path.endsWith('/send') ? 'Delivery status is uncertain. Check Sent before trying again.' : 'Hostinger could not be reached. Please try again shortly.', 502); }
  if (!response.ok) {
    if(method==='POST' && path.endsWith('/send') && response.status>=500) throw new MailError('Delivery status is uncertain. Check Sent before trying again.',502);
    const explanations: Record<number, string> = {401:'Hostinger rejected this token. Check or replace your Mail API token.',403:'This token does not have permission for this mailbox or action.',404:'This message or folder is no longer available.',422:'Hostinger could not accept this request. Check addresses, attachments, and mailbox permissions.',429:'Hostinger is limiting requests. Wait a minute before refreshing.'};
    throw new MailError(explanations[response.status] || 'Hostinger could not complete this request. Please try again later.', response.status);
  }
  if (raw) return response;
  return response.status === 204 ? null : await response.json();
}
