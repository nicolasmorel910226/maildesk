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
 const page=await context.newPage();const errors=[];let sent=0;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const subjects=[null,'','Quarterly update'];
 const messages=subjects.map((subject,i)=>({uid:i+1,path:'INBOX',date:new Date().toISOString(),flags:[],unseen:false,subject,from:{name:`Test sender ${i}`,address:`sender${i}@example.com`},to:[{name:'Me',address:'owner@example.com'}],attachments:[],account:'test-mailbox'}));
 await page.route('**/api/mail',async route=>{
  const b=route.request().postDataJSON();let data;
  switch(b.op){
   case 'bootstrap':data={connections:[{id:'test-connection',label:'Test'}],accounts:[{id:'test-mailbox',address:'owner@example.com',connection_id:'test-connection'}],records:{}};break;
   case 'folders':data={data:[]};break;
   case 'messages':data={data:messages,pagination:{page:1,totalPages:1}};break;
   case 'detail':data={data:{text:'A test message with an optional subject.',html:''}};break;
   case 'send':sent++;throw new Error('This regression test must not send email');
   default:throw new Error(`Unexpected request: ${b.op}`);
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin);
 await page.getByRole('button',{name:/^All inboxes/}).click();
 for(let i=0;i<subjects.length;i++){
  await page.locator('.message-main').filter({hasText:`Test sender ${i}`}).click();
  for(const kind of ['Reply','Forward']){
   await page.getByRole('button',{name:kind,exact:true}).click();
   await page.getByRole('dialog').waitFor();
   assert.equal(await page.getByLabel('Subject',{exact:true}).inputValue(),`${kind==='Reply'?'Re':'Fwd'}: ${subjects[i]||'(No subject)'}`);
   assert.equal(await page.getByLabel('To',{exact:true}).inputValue(),kind==='Reply'?`sender${i}@example.com`:'');
   assert.equal(await page.getByLabel('Sender account').inputValue(),'test-mailbox');
   assert.ok((await page.getByLabel('Message body').inputValue()).includes(`Subject: ${subjects[i]||'(No subject)'}`));
   await page.getByRole('button',{name:'Close composer'}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});
  }
 }
 assert.deepEqual(errors,[]);assert.equal(sent,0);
 console.log('PASS: Reply and Forward open for null, empty, and normal subjects; recipient, sender, and quoted content are correct. No email sent.');
}finally{
 if(browser)await browser.close();
 const exited=once(server,'exit');server.kill('SIGTERM');await exited;
 sql().close();rmSync(temporary,{recursive:true,force:true});
}
