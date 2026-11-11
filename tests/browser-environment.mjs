import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {request} from 'node:http';
const temporary=mkdtempSync(join(tmpdir(),'maildesk-env-'));
process.env.MAILDESK_DATA_DIR=temporary;
const {createSession,sql}=await import('../lib/local-store.ts');
const session=createSession();
sql().prepare('INSERT INTO connections VALUES(?,?,?,?,?,?)').run('existing','local-owner','Old label','order-test','legacy-encrypted-placeholder',new Date().toISOString());
sql().prepare('INSERT INTO mailboxes VALUES(?,?,?,?)').run('removed-box','local-owner','existing','old@example.com');
const token='synthetic-environment-test-token';
const stage=resolve(process.argv[2]||'.');
const server=spawn(process.execPath,['--import',resolve('tests/hostinger-environment-fixture.mjs'),resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','4388'],{cwd:stage,env:{...process.env,HOSTINGER_MAIL_API_TOKEN:token,HOSTINGER_MAIL_CONNECTION_NAME:'Server test connection',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let browser;
try{
 const origin='http://127.0.0.1:4388';let ready=false;
 for(let i=0;i<60;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Staged dashboard starts');
 async function api(body,{signed=true,requestOrigin='http://127.0.0.1:4387'}={}){
  return new Promise((resolve,reject)=>{
   const req=request(origin+'/api/mail',{method:'POST',headers:{'Content-Type':'application/json',Host:'127.0.0.1:4387',Origin:requestOrigin,...(signed?{Cookie:'maildesk_session='+session}:{})}},response=>{
    const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
    response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode})));
   });req.on('error',reject);req.end(JSON.stringify(body));
  });
 }
 assert.equal((await api({op:'bootstrap'},{signed:false})).status,401);
 assert.equal((await api({op:'bootstrap'},{requestOrigin:'https://evil.example'})).status,403);
 const response=await api({op:'bootstrap'});assert.equal(response.status,200,await response.clone().text());
 const text=await response.text();assert.ok(!text.includes(token)&&!text.includes('legacy-encrypted-placeholder'));
 const data=JSON.parse(text);assert.equal(data.environmentConfigured,true);
 assert.deepEqual(data.connections,[{id:'existing',label:'Server test connection'}]);
 assert.equal(data.accounts[0].id,'box-test');assert.equal(data.accounts.length,1);
 assert.equal(sql().prepare('SELECT secret FROM connections WHERE id=?').get('existing').secret,'');
 assert.equal(sql().prepare('SELECT id FROM mailboxes WHERE id=?').get('removed-box'),undefined);
 assert.equal((await api({op:'folders',mailbox:'box-test'})).status,200);
 assert.equal((await api({op:'folders',mailbox:'removed-box'})).status,403);
 assert.equal((await api({op:'connect',token:'browser-supplied-token',label:'Unwanted'})).status,403);
 assert.equal((await api({op:'disconnect',id:'existing'})).status,403);
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
 const context=await browser.newContext();await context.addCookies([{name:'maildesk_session',value:session,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Proxy to the real isolated API with its required loopback Host/Origin.
 await page.route('**/api/mail',async route=>{
  const result=await api(route.request().postDataJSON());
  await route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});
 });
 await page.goto(origin);
 await page.getByText('Live workspace',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Manage connections'}).click();
 await page.getByRole('heading',{name:'Email connection',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').locator('input').count(),0);
 assert.ok(!(await page.content()).includes(token));
 await page.getByRole('button',{name:'Refresh connection',exact:true}).click();
 await page.getByText('1 mailboxes available.',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 sql().prepare('DELETE FROM mailboxes').run();sql().prepare('DELETE FROM connections').run();
 const fresh=await Promise.all([api({op:'bootstrap'}),api({op:'bootstrap'})]);
 for(const result of fresh)assert.equal(result.status,200);
 assert.equal(sql().prepare('SELECT COUNT(*) AS count FROM connections').get().count,1,'Concurrent first-time synchronization creates one connection');

 console.log('PASS: env-only automatic connection, preserved connection ID, cleared legacy credential, mailbox scope, authentication/CSRF, blocked browser token changes, no token in responses or UI. All upstream mail mocked.');
}finally{
 if(browser)await browser.close();
 const exited=once(server,'exit');server.kill('SIGTERM');await exited;
 sql().close();rmSync(temporary,{recursive:true,force:true});
}
