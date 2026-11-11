import test from 'node:test';
import assert from 'node:assert/strict';
import {hostinger,messagePath,sendSchema,MailError} from '../lib/mail.ts';

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
