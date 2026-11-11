import { db, encryptionKey, allowedOrigin } from '../../../lib/local-store';
import { getDashboardUser } from '../../../lib/auth';
import { folderSchema, hostinger, MailError, messagePath, sendSchema } from '../../../lib/mail';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: {'Cache-Control':'no-store'} });
export const runtime = 'nodejs';
async function key() {
  return crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encryptionKey()))), 'AES-GCM', false, ['encrypt','decrypt']);
}
async function encrypt(value: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12)); const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...ciphertext));
}
async function decrypt(value: string) {
  const [iv,data]=value.split('.').map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(),data));
}
async function access(owner: string, mailbox: string) {
  const row=await db().prepare('SELECT c.secret FROM connections c JOIN mailboxes m ON m.connection_id=c.id AND m.owner=c.owner WHERE m.owner=? AND m.id=?').bind(owner,mailbox).first<{secret:string}>();
  if (!row) throw new MailError('Connect this mailbox first.',403);
  return decrypt(row.secret);
}
async function discover(owner: string, connection: string, token: string) {
  const info=await hostinger(token,'/me');
  const boxes=z.array(z.object({resourceId:z.string(),address:z.string().email()})).parse(info.data.mailboxes);
  const statements=[db().prepare('DELETE FROM mailboxes WHERE owner=? AND connection_id=?').bind(owner,connection), ...boxes.map(m=>db().prepare('INSERT INTO mailboxes (id,owner,connection_id,address) VALUES (?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET connection_id=excluded.connection_id,address=excluded.address').bind(m.resourceId,owner,connection,m.address))];
  await db().batch(statements);
}
async function bootstrap(owner: string) {
  const [connections,mailboxes,records]=await Promise.all([
    db().prepare('SELECT id,label,created_at FROM connections WHERE owner=? ORDER BY created_at').bind(owner).all(),
    db().prepare('SELECT id,address,connection_id FROM mailboxes WHERE owner=? ORDER BY address').bind(owner).all(),
    db().prepare('SELECT key,value FROM records WHERE owner=?').bind(owner).all<{key:string,value:string}>(),
  ]);
  return {connections:connections.results,accounts:mailboxes.results,records:Object.fromEntries(records.results.map(r=>[r.key,JSON.parse(r.value)]))};
}
async function handle(request: Request, download=false) {
  try {
    const user=await getDashboardUser(); if(!user) return json({error:'Please sign in to use your mailboxes.'},401);
    if (!download && !allowedOrigin(request)) return json({error:'Invalid request origin.'},403);
    if (!download && !request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON is required.'},415);
    if (Number(request.headers.get('content-length')||0)>9000000) throw new MailError('Attachments must total less than 5 MB.',413);
    let b: Record<string, any>;
    if(download) b=Object.fromEntries(new URL(request.url).searchParams);
    else { const text=await request.text(); if(text.length>9000000) throw new MailError('Message is too large.',413); b=JSON.parse(text); }
    if(download && b.op!=='attachment') return json({error:'Method not allowed.'},405);
    const owner=user.userId;
    if (b.op==='bootstrap') return json(await bootstrap(owner));
    if (b.op==='connect') {
      const token=z.string().trim().min(10).max(4096).parse(b.token), label=z.string().trim().min(1).max(80).parse(b.label);
      const info=await hostinger(token,'/me'); const order=z.string().parse(info.data.orderResourceId);
      const existing=await db().prepare('SELECT id FROM connections WHERE owner=? AND order_id=?').bind(owner,order).first<{id:string}>();
      const id=existing?.id||crypto.randomUUID();
      await db().prepare('INSERT INTO connections(id,owner,label,order_id,secret,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,secret=excluded.secret').bind(id,owner,label,order,await encrypt(token),new Date().toISOString()).run();
      await discover(owner,id,token); return json(await bootstrap(owner));
    }
    if(b.op==='disconnect') {
      const id=z.string().parse(b.id);
      await db().batch([db().prepare('DELETE FROM mailboxes WHERE owner=? AND connection_id=?').bind(owner,id),db().prepare('DELETE FROM connections WHERE owner=? AND id=?').bind(owner,id)]);
      return json(await bootstrap(owner));
    }
    if(b.op==='discover') {
      const rows=await db().prepare('SELECT id,secret FROM connections WHERE owner=?').bind(owner).all<{id:string,secret:string}>();
      const errors:string[]=[];
      for(const row of rows.results) { try {await discover(owner,row.id,await decrypt(row.secret));} catch(e) {errors.push(e instanceof Error?e.message:'Connection failed');} }
      return json({...await bootstrap(owner),errors});
    }
    if(b.op==='record') {
      const key=z.string().regex(/^(draft|status):/).max(600).parse(b.key);
      if(b.value===null) await db().prepare('DELETE FROM records WHERE owner=? AND key=?').bind(owner,key).run();
      else {const value=JSON.stringify(b.value);if(value.length>100000)throw new MailError('Draft is too large.');await db().prepare('INSERT INTO records(owner,key,value) VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value').bind(owner,key,value).run();}
      return json({ok:true});
    }
    const mailbox=z.string().min(1).max(150).parse(b.mailbox); const token=await access(owner,mailbox);
    if(b.op==='send') {await hostinger(token,`/mailboxes/${encodeURIComponent(mailbox)}/send`,'POST',sendSchema.parse(b.message));return json({accepted:true});}
    if(b.op==='folders') return json(await hostinger(token,`/mailboxes/${encodeURIComponent(mailbox)}/folders`));
    const folder=folderSchema.parse(b.folder||'INBOX');
    if(b.op==='messages') {
      const page=z.coerce.number().int().min(1).max(100000).parse(b.page||1), q=z.string().max(320).parse(b.query||'');
      const search=q||b.starred;
      return json(await hostinger(token,`${messagePath(mailbox,folder)}${search?'/search':''}?page=${page}&perPage=25&sort=-date`,search?'POST':'GET',search?{...(q?{subject:q,from:q,to:q,body:q}:{}),...(b.starred?{flags:['\\Flagged']}:{} )}:undefined));
    }
    const uid=z.coerce.number().int().positive().parse(b.uid), path=messagePath(mailbox,folder,uid);
    if(b.op==='detail') return json(await hostinger(token,`${path}/text`));
    if(b.op==='flag') {
      const flag=z.enum(['\\Seen','\\Flagged']).parse(b.flag), enabled=z.boolean().parse(b.enabled);
      return json(await hostinger(token,path,'PATCH',{[enabled?'addFlags':'removeFlags']:[flag]}));
    }
    if(b.op==='move') {return json(await hostinger(token,`${path}/move`,'POST',{targetFolder:folderSchema.parse(b.destination)}));}
    if(download&&b.op==='attachment') {
      const attachment=z.string().min(1).max(1000).parse(b.attachment);
      const result=await hostinger(token,`${path}/attachments/${encodeURIComponent(attachment)}`,'GET',undefined,true) as Response;
      return new Response(result.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(b.filename||'attachment').replace(/[\r\n]/g,''))}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    throw new MailError('Unknown action.');
  } catch(e) {
    if(e instanceof z.ZodError||e instanceof SyntaxError) return json({error:'Please check the fields and try again.'},400);
    return json({error:e instanceof MailError?e.message:'The request failed. Please try again.'},e instanceof MailError?e.status:500);
  }
}
export const POST=(request:Request)=>handle(request);
export const GET=(request:Request)=>handle(request,true);
