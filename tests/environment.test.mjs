import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentConnection, environmentIdentity} from '../lib/mail.ts';

test('server environment tokens are required, validated, cached, rotated, and never returned in errors',async()=>{
 const originalFetch=globalThis.fetch;
 const originalToken=process.env.HOSTINGER_MAIL_API_TOKEN;
 const originalLabel=process.env.HOSTINGER_MAIL_CONNECTION_NAME;
 const calls=[];
 try{
  delete process.env.HOSTINGER_MAIL_API_TOKEN;
  assert.equal(environmentConnection(),null);
  await assert.rejects(()=>environmentIdentity(),e=>e.status===503);
  process.env.HOSTINGER_MAIL_API_TOKEN='bad\ntoken-that-must-not-leak';
  assert.throws(()=>environmentConnection(),e=>e.status===503&&!e.message.includes('must-not-leak'));
  process.env.HOSTINGER_MAIL_API_TOKEN='synthetic-token-one';
  process.env.HOSTINGER_MAIL_CONNECTION_NAME='  Company mail  ';
  globalThis.fetch=async(url,options)=>{
   calls.push(options.headers.Authorization);
   assert.equal(url,'https://api.mail.hostinger.com/api/v1/me');
   return Response.json({data:{orderResourceId:'order-test',mailboxes:[{resourceId:'box-test',address:'owner@example.com'}],unexpectedSecret:'not-to-be-forwarded'}});
  };
  const [first,second]=await Promise.all([environmentIdentity(),environmentIdentity()]);
  assert.equal(calls.length,1);
  assert.equal(first.label,'Company mail');assert.deepEqual(first,second);
  assert.equal(first.unexpectedSecret,undefined);
  await environmentIdentity(true);assert.equal(calls.length,2);
  process.env.HOSTINGER_MAIL_API_TOKEN='synthetic-token-two';
  assert.equal((await environmentIdentity()).token,'synthetic-token-two');
  assert.equal(calls.at(-1),'Bearer synthetic-token-two');assert.equal(calls.length,3);
  delete process.env.HOSTINGER_MAIL_API_TOKEN;
  await assert.rejects(()=>environmentIdentity(),e=>e.status===503);
  process.env.HOSTINGER_MAIL_API_TOKEN='synthetic-invalid-token';
  globalThis.fetch=async()=>new Response('private provider response',{status:401});
  await assert.rejects(()=>environmentIdentity(),e=>e.status===401&&!e.message.includes('synthetic')&&!e.message.includes('private'));
  globalThis.fetch=async()=>Response.json({data:{orderResourceId:'order-test',mailboxes:[]}});
  assert.deepEqual((await environmentIdentity()).mailboxes,[],'Failed validation is not cached');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of [['HOSTINGER_MAIL_API_TOKEN',originalToken],['HOSTINGER_MAIL_CONNECTION_NAME',originalLabel]]){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
