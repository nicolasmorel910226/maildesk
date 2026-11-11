import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConversations,mergeMessages,replySubject,isOutgoing} from '../lib/conversations.ts';
const boxes=[{id:'a',address:'owner@example.com'},{id:'b',address:'other@example.com'}];
const m=(overrides={})=>({account:'a',uid:1,path:'INBOX',date:'2026-11-11T00:00:00Z',subject:null,unseen:true,flags:[],from:{name:'Client',address:'client@example.com'},to:[{name:'',address:'owner@example.com'}],attachments:[],...overrides});
test('combines incoming and sent emails across different subjects',()=>{const groups=buildConversations([m(),m({uid:2,path:'INBOX.Sent',subject:'Re: (No subject)',date:'2026-11-11T00:01:00Z',unseen:false,from:{name:'Me',address:'OWNER@example.com'},to:[{name:'',address:'client@example.com'}]})],boxes);assert.equal(groups.length,1);assert.equal(groups[0].messages.length,2);assert.equal(groups[0].name,'Client');assert.equal(groups[0].unread,1);assert.equal(groups[0].latest.uid,2);});
test('never combines accounts or different group participants',()=>{const groups=buildConversations([m(),m({account:'b',to:[{name:'',address:'other@example.com'}]}),m({uid:2,cc:[{name:'Colleague',address:'colleague@example.com'}]})],boxes);assert.equal(groups.length,3);});
test('deduplicates copies by Message-ID only within the same mailbox',()=>{const merged=mergeMessages([m({messageId:'<one@example.com>'})],[m({path:'INBOX.Sent',uid:5,messageId:'<one@example.com>'}),m({account:'b',messageId:'<one@example.com>'})]);assert.equal(merged.length,2);assert.equal(merged[0].uid,5);});
test('replies to null and empty subjects remain valid',()=>{assert.equal(replySubject(null),'Re: (No subject)');assert.equal(replySubject(''),'Re: (No subject)');assert.equal(replySubject('Re: Project'),'Re: Project');});

test('uses observed folder direction rather than trusting a sender header',()=>{assert.equal(isOutgoing(m({sent:false,from:{name:'Spoof',address:'owner@example.com'}}),boxes[0]),false);assert.equal(isOutgoing(m({sent:true}),boxes[0]),true);});
