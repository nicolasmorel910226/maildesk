import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const temporary=mkdtempSync(join(tmpdir(),'maildesk-reply-'));
process.env.MAILDESK_DATA_DIR=temporary;
const {createSession,sql}=await import('../lib/local-store.ts');
const session=createSession();
const stage=resolve(process.argv[2]||'.');
const server=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','4388'],{cwd:stage,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let browser;
try{
 const origin='http://127.0.0.1:4388';let ready=false;
 for(let i=0;i<60;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Staged dashboard starts');
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
 const context=await browser.newContext();await context.addCookies([{name:'maildesk_session',value:session,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());

 const me={name:'Me',address:'owner@example.com'},client={name:'Client Person',address:'client@example.com'};
 let inbox=[{uid:1,path:'INBOX',date:new Date(Date.now()-60000).toISOString(),flags:[],unseen:false,subject:null,from:client,to:[me],attachments:[{id:'file-one',filename:'brief.txt',sizeBytes:12,contentType:'text/plain'}],messageId:'<in-one>'}];
 const sent=[{uid:2,path:'INBOX.Sent',date:new Date(Date.now()-30000).toISOString(),flags:['\\Seen'],unseen:false,subject:'Re: (No subject)',from:me,to:[client],attachments:[],messageId:'<sent-one>'}];
 const text={1:'Incoming email body',2:'Earlier reply body'};
 let releaseSend,sendMode='hold',showSent=false;const submitted=[];
 await page.route('**/api/mail',async route=>{
  const b=route.request().postDataJSON();let data;
  switch(b.op){
   case 'bootstrap':data={connections:[{id:'c',label:'Test'}],accounts:[{id:'a',address:me.address,connection_id:'c'},{id:'b',address:'second@example.com',connection_id:'c'}],records:{}};break;
   case 'folders':data={data:[{path:'INBOX',name:'Inbox',specialUse:null},{path:'INBOX.Sent',name:'Sent',specialUse:'\\Sent'}]};break;
   case 'messages':{
    let list=b.folder==='INBOX'?[...inbox]:sent.filter(m=>m.uid!==3||showSent);
    if(b.mailbox==='b')list=b.folder==='INBOX'?[{...inbox[0],to:[{name:'',address:'second@example.com'}]}]:[];
    if(b.mailbox==='a'&&b.folder==='INBOX')list.push({...inbox[0],uid:9,messageId:'<group>',cc:[{name:'Colleague',address:'colleague@example.com'}]});
    data={data:list,pagination:{page:1,totalPages:1}};break;
   }
   case 'detail':data={data:{text:text[b.uid]||'Group email body',html:''}};break;
   case 'send':{
    submitted.push(b);
    if(sendMode==='fail'){await route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'Test rejection from mail provider.'})});return;}
    if(sendMode==='unknown'){await route.abort('failed');return;}
    await new Promise(r=>releaseSend=r);
    sent.push({uid:3,path:'INBOX.Sent',date:new Date().toISOString(),flags:['\\Seen'],unseen:false,subject:b.message.subject,from:me,to:[client],attachments:[],messageId:'<sent-new>'});text[3]=b.message.text;
    data={accepted:true};break;
   }
   default:throw new Error(`Unexpected request: ${b.op}`);
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin);
 await page.getByRole('heading',{name:'Conversations',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.chat-list-item').length===3);
 await page.locator('.chat-list-item').filter({hasText:'Client Person'}).filter({hasText:'owner@example.com'}).click();
 await page.getByText('Incoming email body',{exact:true}).waitFor();
 await page.getByText('Earlier reply body',{exact:true}).waitFor();
 assert.equal(await page.locator('.email-bubble.incoming').count(),1);
 assert.equal(await page.locator('.email-bubble.outgoing').count(),1);
 assert.ok((await page.getByRole('link',{name:'brief.txt'}).getAttribute('href')).includes('folder=INBOX'));
 await page.getByLabel('Write an email reply').fill('A new reply');
 await page.getByLabel('Write an email reply').press('Enter');assert.equal(submitted.length,0);
 await page.getByLabel('Write an email reply').fill('A new reply');
 await page.getByRole('button',{name:'Send reply',exact:true}).click();
 await page.getByText('Sending…',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Send reply',exact:true}).isDisabled(),true);
 assert.equal(submitted.length,1);assert.equal(submitted[0].mailbox,'a');assert.deepEqual(submitted[0].message.to,['client@example.com']);assert.deepEqual(submitted[0].message.inReplyTo,{uid:1,folder:'INBOX'});assert.equal(submitted[0].message.subject,'Re: (No subject)');
 releaseSend();await page.getByText('Accepted for sending · syncing to Sent',{exact:true}).waitFor();
 showSent=true;await page.getByRole('button',{name:'Refresh conversations'}).click();
 await page.waitForFunction(()=>!document.querySelector('.pending-accepted'));
 assert.equal(await page.getByText('A new reply',{exact:true}).count(),1);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'outputs/conversation-desktop.png',fullPage:true});
 inbox.push({...inbox[0],uid:4,subject:'New incoming reply',date:new Date().toISOString(),messageId:'<new-in>',attachments:[]});text[4]='A newly received reply';
 await page.getByRole('button',{name:'Refresh conversations'}).click();await page.getByText('A newly received reply',{exact:true}).waitFor();
 sendMode='fail';await page.getByLabel('Write an email reply').fill('Rejected reply');await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByText('Not sent',{exact:true}).waitFor();await page.getByRole('button',{name:'Copy back to reply box'}).click();assert.equal(await page.getByLabel('Write an email reply').inputValue(),'Rejected reply');
 sendMode='unknown';await page.getByLabel('Write an email reply').fill('Unknown reply');await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByText('Sending status unknown',{exact:true}).waitFor();assert.equal(submitted.length,3);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'outputs/conversation-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log(await page.evaluate(()=>Object.fromEntries(['.conversation-workspace','.conversation-toolbar','.conversation-layout','.conversation-chat','.chat-timeline','.chat-composer','.email-bubble'].map(s=>{const e=document.querySelector(s);return [s,{width:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().width}]}))));
 await page.getByRole('button',{name:'Back to conversations'}).click();await page.locator('.chat-list-item').first().waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
 console.log('PASS: mailbox/group isolation; Inbox + Sent bubbles; null subject replies; correct sender/recipient; sending/accepted/Sent reconciliation; new received messages; failed/uncertain sends; attachment links; mobile layout. All sends were mocked.');
}finally{
 if(browser)await browser.close();
 const exited=once(server,'exit');server.kill('SIGTERM');await exited;
 sql().close();rmSync(temporary,{recursive:true,force:true});
}
