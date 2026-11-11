import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const origin='http://127.0.0.1:4387';const password=randomBytes(24).toString('base64url');const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
const spoof=await context.request.post(origin+'/api/mail',{headers:{Origin:origin,'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.com'},data:{op:'bootstrap'}});assert.equal(spoof.status(),401);
const blocked=await context.request.post(origin+'/api/auth',{headers:{Origin:'https://evil.example'},data:{op:'setup',password}});assert.equal(blocked.status(),403);
await page.goto(origin);await page.getByRole('heading',{name:'Your workspace starts here.'}).waitFor();
await page.getByLabel('Create a password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create local workspace'}).click();
await page.getByRole('heading',{name:'Conversations',exact:true}).waitFor();await page.getByRole('button',{name:/^All inboxes/}).click();await page.getByRole('heading',{name:'All inboxes'}).waitFor();
const cookie=(await context.cookies()).find(c=>c.name==='maildesk_session');assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Strict');
const duplicate=await context.request.post(origin+'/api/auth',{headers:{Origin:origin},data:{op:'setup',password}});assert.equal(duplicate.status(),409);
await page.getByRole('button',{name:/Emma Wilson.*A good time/}).click();await page.getByLabel('Follow-up status').selectOption('Needs reply');
await page.getByRole('button',{name:'Reply',exact:true}).click();assert.equal(await page.getByLabel('Sender account').inputValue(),'demo-1');await page.getByRole('button',{name:'Save draft',exact:true}).click();
const save=await context.request.post(origin+'/api/mail',{headers:{Origin:origin},data:{op:'record',key:'draft:qa-local',value:{id:'qa-local',subject:'Persistence test'}}});assert.equal(save.status(),200);
await page.screenshot({path:'outputs/local-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Lock dashboard'}).click();await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
const denied=await context.request.post(origin+'/api/mail',{headers:{Origin:origin},data:{op:'bootstrap'}});assert.equal(denied.status(),401);
await page.getByLabel('Password',{exact:true}).fill('incorrect-password');await page.getByRole('button',{name:'Open dashboard'}).click();await page.getByRole('alert').filter({hasText:'Incorrect password.'}).waitFor();
await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Open dashboard'}).click();await page.getByRole('heading',{name:'Conversations',exact:true}).waitFor();await page.getByRole('button',{name:/^All inboxes/}).click();await page.getByRole('heading',{name:'All inboxes'}).waitFor();
const restored=await context.request.post(origin+'/api/mail',{headers:{Origin:origin},data:{op:'bootstrap'}});assert.equal((await restored.json()).records['draft:qa-local'].subject,'Persistence test');
const cross=await context.request.post(origin+'/api/mail',{headers:{Origin:'https://evil.example'},data:{op:'bootstrap'}});assert.equal(cross.status(),403);
await page.getByRole('button',{name:'Lock dashboard'}).click();await page.waitForURL('**/login');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/local-login-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]);
console.log('PASS: first-run password, sign-in, incorrect password, logout revocation, spoofed identity rejection, CSRF, session cookie, persistent records, reply sender, drafts, desktop/mobile.');
}finally{await browser.close();}
