import { z } from 'zod';
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
