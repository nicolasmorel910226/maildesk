import type { Message, Account } from './demo';
export type Conversation = {id:string;account:Account;peers:string[];name:string;messages:Message[];latest:Message;unread:number};
export const addressKey=(value:string)=>value.trim().toLowerCase();
export const isOutgoing=(message:Message,account:Account)=>message.sent??(addressKey(message.from?.address||'')===addressKey(account.address));
export function participants(message:Message,account:Account){
 const own=addressKey(account.address);
 const addresses=[message.from,...message.to,...(message.cc||[])].filter(Boolean).map(a=>addressKey(a!.address)).filter(a=>a&&a!==own);
 const peers=[...new Set(addresses)].sort();
 if(!peers.length&&addressKey(message.from?.address||'')===own)peers.push(own);
 return peers;
}
export function conversationId(message:Message,account:Account){return JSON.stringify([account.id,participants(message,account)]);}
export function buildConversations(messages:Message[],accounts:Account[]):Conversation[]{
 const groups=new Map<string,Conversation>();
 for(const message of messages){
  const account=accounts.find(a=>a.id===message.account);if(!account)continue;
  const peers=participants(message,account),id=conversationId(message,account);
  if(!groups.has(id))groups.set(id,{id,account,peers,name:peers.join(', ')||'Unknown sender',messages:[],latest:message,unread:0});
  const group=groups.get(id)!;group.messages.push(message);
 }
 for(const group of groups.values()){
  group.messages.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.uid-b.uid);
  group.latest=group.messages[group.messages.length-1];
  group.unread=group.messages.filter(m=>m.unseen&&!isOutgoing(m,group.account)).length;
  if(group.peers.length===1){const incoming=[...group.messages].reverse().find(m=>addressKey(m.from?.address||'')===group.peers[0]);group.name=incoming?.from?.name||group.peers[0];}
 }
 return [...groups.values()].sort((a,b)=>Date.parse(b.latest.date)-Date.parse(a.latest.date));
}
export function mergeMessages(old:Message[],next:Message[]){
 const map=new Map<string,Message>();for(const m of [...old,...next])map.set(JSON.stringify([m.account,m.messageId||[m.path,m.uid]]),m);return [...map.values()];
}
export function replySubject(subject:string|null){return `Re: ${(subject||'(No subject)').replace(/^(Re|Fwd):\s*/i,'')}`;}
