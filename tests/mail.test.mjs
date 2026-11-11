import test from 'node:test';
import assert from 'node:assert/strict';
import {hostinger,messagePath,messageText,parseMessageText,sendSchema,MailError} from '../lib/mail.ts';

test('encodes mailbox and folder path segments independently',()=>{
 assert.equal(messagePath('AC123','INBOX/Client work',25),'/mailboxes/AC123/folders/INBOX%2FClient%20work/messages/25');
});
test('validates recipients and rejects conflicting reply/forward references',()=>{
 const payload={to:['client@example.com'],subject:'Hello',text:'Test'};
 assert.equal(sendSchema.safeParse(payload).success,true);
 assert.equal(sendSchema.safeParse({...payload,to:['bad address']}).success,false);
 assert.equal(sendSchema.safeParse({...payload,inReplyTo:{uid:1,folder:'INBOX'},forwardOf:{uid:1,folder:'INBOX'}}).success,false);
 assert.equal(sendSchema.safeParse({...payload,attachments:[{filename:'test.txt',content:'not base64!',contentType:'text/plain'}]}).success,false);
});
test('keeps sending payload intact and recognizes acceptance without JSON',async()=>{
 const original=globalThis.fetch;
 let seen;
 globalThis.fetch=async(url,options)=>{seen={url,options};return new Response(null,{status:204});};
 try{const payload={to:['client@example.com'],subject:'Hello',text:'Test',inReplyTo:{uid:12,folder:'INBOX'}};
 assert.equal(await hostinger('test-token','/mailboxes/AC123/send','POST',payload),null);
 assert.equal(seen.url,'https://api.mail.hostinger.com/api/v1/mailboxes/AC123/send');
 assert.equal(seen.options.headers.Authorization,'Bearer test-token');
 assert.equal(seen.options.redirect,'error');
 assert.deepEqual(JSON.parse(seen.options.body),payload);
 }finally{globalThis.fetch=original;}
});
test('rate limits are actionable and upstream response contents are not exposed',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('{"error":"private upstream details"}',{status:429});
 try{await assert.rejects(()=>hostinger('test-token','/me'),e=>e instanceof MailError&&e.status===429&&e.message.includes('Wait a minute')&&!e.message.includes('private'));}finally{globalThis.fetch=original;}
});
test('send network failures warn about uncertain delivery and do not retry',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('network');};
 try{await assert.rejects(()=>hostinger('test-token','/mailboxes/AC123/send','POST',{}),/Check Sent before trying again/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

const mime = (headers, body) => new Response(`${headers}\r\n\r\n${body}`);
test('reads original source and preserves base64-looking plain text without transfer encoding',async()=>{
 const original=globalThis.fetch;const calls=[];
 // A synthetic body that could be misread as base64; never decode by appearance.
 const text='HelloWorldHelloWorld';
 globalThis.fetch=async(url,options)=>{calls.push({url,method:options.method});return mime('Content-Type: text/plain; charset=utf-8',text);};
 try{
  assert.deepEqual(await messageText('test-token','/mailboxes/AC123/folders/INBOX.Sent/messages/1'),{data:{text,html:''}});
  assert.deepEqual(calls,[{url:'https://api.mail.hostinger.com/api/v1/mailboxes/AC123/folders/INBOX.Sent/messages/1/source',method:'GET'}]);
 }finally{globalThis.fetch=original;}
});
test('decodes declared base64 UTF-8 and preserves unencoded Unicode',async()=>{
 const text='Hello — café, Привет, 你好 👋';
 for(const encoding of ['base64','8bit','7bit']){
  const body=encoding==='base64'?Buffer.from(text).toString('base64'):text;
  const result=await parseMessageText(mime(`Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: ${encoding}`,body));
  assert.equal(result.data.text,text);
 }
});
test('decodes quoted-printable with the declared legacy character set',async()=>{
 const result=await parseMessageText(mime('Content-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable','caf=E9 =\r\nau lait'));
 assert.equal(result.data.text,'café au lait');
});
test('keeps multipart alternatives separate and drains attachments without exposing them',async()=>{
 const source=[
  'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="outer"','',
  '--outer','Content-Type: multipart/alternative; boundary="inner"','',
  '--inner','Content-Type: text/plain; charset=utf-8','','Plain body',
  '--inner','Content-Type: text/html; charset=utf-8','','<p>HTML body</p>',
  '--inner--','--outer','Content-Type: application/octet-stream',
  'Content-Disposition: attachment; filename="example.bin"','Content-Transfer-Encoding: base64','',
  Buffer.alloc(256*1024,65).toString('base64'),'--outer--',''
 ].join('\r\n');
 const result=await parseMessageText(new Response(source));
 assert.deepEqual(result,{data:{text:'Plain body',html:'<p>HTML body</p>'}});
});
test('returns HTML for the existing safe text display and handles an empty body',async()=>{
 const html='<p>Hello &amp; welcome</p><script>throw new Error("Do not execute")</script>';
 assert.deepEqual(await parseMessageText(mime('Content-Type: text/html; charset=utf-8',html)),{data:{text:'',html}});
 assert.deepEqual(await parseMessageText(mime('Content-Type: text/plain','')),{data:{text:'',html:''}});
});
test('bounds streamed source size and cancels oversized advertised downloads',async()=>{
 await assert.rejects(()=>parseMessageText(mime('Content-Type: text/plain','x'.repeat(512)),256),e=>e instanceof MailError&&e.status===413);
 let cancelled=false;
 const body=new ReadableStream({cancel(){cancelled=true;}});
 await assert.rejects(()=>parseMessageText(new Response(body,{headers:{'content-length':'512'}}),256),e=>e.status===413);
 assert.equal(cancelled,true);
});
test('does not expose upstream details or return partial text after a download failure',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('Content-Type: text/plain\r\n\r\nPartial body'));controller.error(new Error('private upstream error'));}});
 await assert.rejects(()=>parseMessageText(new Response(stream)),e=>e instanceof MailError&&e.status===502&&!e.message.includes('private'));
});
