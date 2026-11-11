'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowDownToLine,Check,Clock,FileText,LoaderCircle,Mail,MessageCircle,Paperclip,RefreshCw,Search,Send,TriangleAlert,X} from 'lucide-react';
import {Account,Message,messageKey} from '../lib/demo';
import {buildConversations,Conversation,isOutgoing,mergeMessages,replySubject} from '../lib/conversations';
type Attachment={filename:string;content:string;contentType:string};
type Pending={id:string;chat:string;text:string;subject:string;files:Attachment[];date:string;status:'sending'|'accepted'|'failed'|'unknown'|'demo';error?:string;baseline:string[]};
type Props={active:boolean;accounts:Account[];account:string;setAccount:(id:string)=>void;demo:boolean;demoMessages:Message[];api:(body:unknown)=>Promise<any>;saveDraft:(key:string,value:any)=>Promise<boolean>;notify:(text:string)=>void};
function plain(html:string){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style').forEach(x=>x.remove());doc.querySelectorAll('p,div,br,tr').forEach(x=>x.append('\n'));return doc.body.textContent||'';}
export default function Conversations({active,accounts,account,setAccount,demo,demoMessages,api,saveDraft,notify}:Props){
 const [messages,setMessages]=useState<Message[]>([]),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[visible,setVisible]=useState(20),[bodies,setBodies]=useState<Record<string,string>>({}),[bodyErrors,setBodyErrors]=useState<Record<string,string>>({}),[drafts,setDrafts]=useState<Record<string,{text:string;files:Attachment[]}>>({}),[pending,setPending]=useState<Pending[]>([]),[sending,setSending]=useState(false),[lastSync,setLastSync]=useState('');
 const loadId=useRef(0),loadingRef=useRef(false),bodyCache=useRef(new Map<string,string>()),bodyRequests=useRef(new Map<string,Promise<string>>()),fileInput=useRef<HTMLInputElement>(null),scroller=useRef<HTMLDivElement>(null),sendLock=useRef(false);
 const accountsKey=accounts.map(a=>a.id).join('|');
 const groups=useMemo(()=>buildConversations(demo?demoMessages:messages,accounts),[demo,demoMessages,messages,accounts]);
 const listed=groups.filter(g=>(account==='all'||g.account.id===account)&&`${g.name} ${g.peers.join(' ')} ${g.messages.map(m=>m.subject||'').join(' ')}`.toLowerCase().includes(search.toLowerCase()));
 const chat=groups.find(g=>g.id===selected),draft=drafts[selected]||{text:'',files:[]};
 const visibleMessages=chat?.messages.slice(-visible)||[];
 const ownPending=pending.filter(p=>p.chat===selected);
 function editDraft(value:Partial<{text:string;files:Attachment[]}>){setDrafts(old=>({...old,[selected]:{...(old[selected]||{text:'',files:[]}),...value}}));}
 async function load(next=1){
  if(demo||!active)return;if(loadingRef.current)return;loadingRef.current=true;
  const run=++loadId.current;setLoading(true);setError('');const boxes=accounts.filter(a=>account==='all'||a.id===account);let cursor=0,more=false;const incoming:Message[]=[],errors:string[]=[];
  try{await Promise.all(Array.from({length:Math.min(3,boxes.length)},async()=>{while(cursor<boxes.length){const a=boxes[cursor++];try{
   const folderData=await api({op:'folders',mailbox:a.id});const folders=folderData.data.filter((f:any)=>f.path==='INBOX'||f.specialUse==='\\Sent'||f.name.toLowerCase()==='sent');
   for(const folder of folders){try{const data=await api({op:'messages',mailbox:a.id,folder:folder.path,page:next});incoming.push(...data.data.map((m:Message)=>({...m,account:a.id,sent:folder.specialUse==='\\Sent'||folder.name.toLowerCase()==='sent'})));if(data.pagination?.page<data.pagination?.totalPages)more=true;}catch(e){errors.push(`${a.address} / ${folder.name}: ${(e as Error).message}`);}}
  }catch(e){errors.push(`${a.address}: ${(e as Error).message}`);}}}));
  if(run===loadId.current){setMessages(old=>mergeMessages(old,incoming));if(next>1||page===1)setHasMore(more);if(next>1)setPage(next);setLastSync(new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));setError(errors.join(' '));}
  }finally{if(run===loadId.current){setLoading(false);loadingRef.current=false;}}
 }
 useEffect(()=>{setSelected('');setPage(1);setHasMore(false);},[demo,account,accountsKey]);
 useEffect(()=>{loadId.current++;loadingRef.current=false;if(active&&!demo)void load(1);return()=>{loadId.current++;};},[active,demo,account,accountsKey]);
 useEffect(()=>{if(demo||!active)return;const t=setInterval(()=>{if(!document.hidden)void load(1);},60000);return()=>clearInterval(t);},[active,demo,account,accountsKey,page]);
 const visibleKeys=visibleMessages.map(messageKey).join('|');
 useEffect(()=>{
  if(!chat)return;let cancelled=false,cursor=0;
  const list=visibleMessages;
  async function work(){while(cursor<list.length){const m=list[cursor++],key=messageKey(m);try{
   let text=bodyCache.current.get(key);
   if(text===undefined){let request=bodyRequests.current.get(key);if(!request){request=demo?Promise.resolve(m.body||''):api({op:'detail',mailbox:m.account,folder:m.path,uid:m.uid}).then(data=>data.data.text||plain(data.data.html||''));bodyRequests.current.set(key,request);}
    try{text=await request;bodyCache.current.set(key,text!);}finally{bodyRequests.current.delete(key);}}
   if(!cancelled)setBodies(old=>({...old,[key]:text!}));
  }catch(e){if(!cancelled)setBodyErrors(old=>({...old,[key]:(e as Error).message}));}}}
  void Promise.all(Array.from({length:Math.min(3,list.length)},()=>work()));return()=>{cancelled=true;};
 },[selected,visibleKeys,demo]);
 useEffect(()=>{
  // Match a newly observed Sent copy to at most one accepted local send.
  const used=new Set<string>();setPending(previous=>previous.filter(p=>{
   if(p.status!=='accepted')return true;
   const group=groups.find(g=>g.id===p.chat);if(!group)return true;
   const match=group.messages.find(m=>isOutgoing(m,group.account)&&!p.baseline.includes(messageKey(m))&&!used.has(messageKey(m))&&Math.abs(Date.parse(m.date)-Date.parse(p.date))<300000&&(m.subject||'')===p.subject&&bodies[messageKey(m)]?.trim()===p.text.trim());
   if(!match)return true;used.add(messageKey(match));return false;
  }));
 },[messages,bodies]);
 useEffect(()=>{scroller.current?.scrollTo({top:scroller.current.scrollHeight});},[selected,chat?.messages.length,ownPending.length]);
 function select(g:Conversation){setSelected(g.id);setVisible(20);}
 async function send(e:React.FormEvent){e.preventDefault();if(!chat||sendLock.current||!draft.text.trim()||!chat.peers.length)return;
  sendLock.current=true;setSending(true);const current=chat,content={...draft},id=crypto.randomUUID();
  const source=[...current.messages].reverse().find(m=>!isOutgoing(m,current.account));
  const subject=replySubject(source?.subject??current.latest.subject);
  const item:Pending={id,chat:current.id,text:content.text,files:content.files,subject,date:new Date().toISOString(),status:'sending',baseline:current.messages.map(messageKey)};
  setPending(old=>[...old,item]);setDrafts(old=>({...old,[current.id]:{text:'',files:[]}}));
  try{
   if(!demo)await api({op:'send',mailbox:current.account.id,message:{to:current.peers,subject,text:content.text,attachments:content.files,...(source?{inReplyTo:{uid:source.uid,folder:source.path}}:{})}});
   setPending(old=>old.map(p=>p.id===id?{...p,status:demo?'demo':'accepted'}:p));if(!demo)void load(1);
  }catch(e){const message=(e as Error).message;const unknown=/uncertain|fetch|network|load failed/i.test(message);setPending(old=>old.map(p=>p.id===id?{...p,status:unknown?'unknown':'failed',error:message}:p));
  }finally{sendLock.current=false;setSending(false);}
 }
 async function addFiles(list:FileList|null){if(!list||!chat)return;const target=selected,old=draft.files,files=[...list];if(files.length+old.length>10||files.reduce((n,f)=>n+f.size,0)+old.reduce((n,f)=>n+f.content.length*.75,0)>5000000){notify('Attach up to 10 files, totaling 5 MB.');return;}
  const additions=await Promise.all(files.map(f=>new Promise<Attachment>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({filename:f.name,content:String(reader.result).split(',')[1],contentType:f.type||'application/octet-stream'});reader.onerror=reject;reader.readAsDataURL(f);})));setDrafts(previous=>({...previous,[target]:{...(previous[target]||{text:'',files:[]}),files:[...old,...additions]}}));
 }
 async function markRead(){if(!chat)return;try{for(const m of visibleMessages.filter(m=>m.unseen&&!isOutgoing(m,chat.account))){if(!demo)await api({op:'flag',mailbox:m.account,folder:m.path,uid:m.uid,flag:'\\Seen',enabled:true});setMessages(old=>old.map(x=>messageKey(x)===messageKey(m)?{...x,unseen:false}:x));}notify(demo?'Sample conversation opened.':'Visible messages marked as read.');}catch(e){notify((e as Error).message);}}
 return <section className="conversation-workspace">
  <div className="conversation-toolbar"><div><MessageCircle size={18}/><strong>Conversations</strong><span>{demo?'Sample emails':`Inbox + Sent · ${lastSync?'updated '+lastSync:'not yet refreshed'}`}</span></div><button className="button" onClick={()=>demo?notify('Demo conversations use sample emails.'):load(1)} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/>Refresh conversations</button></div>
  {error&&<div className="error-banner" role="alert">{error}</div>}
  <div className={`conversation-layout ${chat?'chat-open':''}`}>
   <aside className="conversation-list"><div className="conversation-filters"><label className="search"><Search size={16}/><input aria-label="Search conversations" placeholder="Search people or subjects" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Conversation mailbox" value={account} onChange={e=>setAccount(e.target.value)}><option value="all">All mailboxes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.address}</option>)}</select></div>
   <div className="chat-list-scroll">{listed.map(g=><button className={`chat-list-item ${g.id===selected?'selected':''}`} key={g.id} onClick={()=>select(g)}><span className="sender-avatar">{g.name.slice(0,2).toUpperCase()}</span><span className="chat-list-copy"><strong>{g.name}</strong><small>{g.latest.subject||'(No subject)'}</small><span className="chat-account">{g.account.address} · {g.messages.length} emails</span></span><span className="chat-list-meta"><time>{new Date(g.latest.date).toLocaleDateString([],{month:'short',day:'numeric'})}</time>{g.unread>0&&<b>{g.unread}</b>}</span></button>)}{!listed.length&&<div className="empty"><MessageCircle size={30}/><h3>{loading?'Loading conversations…':'No conversations yet'}</h3><p>{search?'No loaded conversations match your search.':'Connect a mailbox to see its incoming and sent emails here.'}</p></div>}{!demo&&hasMore&&<button className="button load-more" disabled={loading} onClick={()=>load(page+1)}>Load older emails</button>}</div><div className="conversation-list-note">{demo?'Sample emails only':'Shows loaded Inbox and Sent emails. Refreshes every minute.'}</div></aside>
   <div className="conversation-chat">{chat?<><header className="chat-header"><button className="icon-button chat-back" aria-label="Back to conversations" onClick={()=>setSelected('')}><ArrowLeft size={18}/></button><div><h2>{chat.name}</h2><p>{chat.peers.join(', ')||'Sender address unavailable'}</p><small>Using {chat.account.address}</small></div><button className="icon-button" title="Mark visible messages read" aria-label="Mark visible messages read" onClick={markRead}><Check size={18}/></button></header>
    <div className="chat-timeline" ref={scroller} role="log" aria-label="Email conversation" aria-live="polite"><div className="chat-explainer">Emails with these participants · subjects remain separate below</div>{chat.messages.length>visible&&<button className="button earlier-messages" onClick={()=>setVisible(v=>v+20)}>Show earlier loaded messages</button>}
     {visibleMessages.map(m=>{const outgoing=isOutgoing(m,chat.account),key=messageKey(m);return <article key={key} className={`email-bubble ${outgoing?'outgoing':'incoming'}`}><div className="bubble-sender">{outgoing?'You':m.from?.name||m.from?.address||'Unknown sender'}</div><div className="bubble-subject">{m.subject||'(No subject)'}</div><div className="bubble-text">{bodies[key]!==undefined?bodies[key]||'(No text content)':bodyErrors[key]?<div role="alert">{bodyErrors[key]}<button className="button" onClick={()=>{setBodyErrors(old=>{const next={...old};delete next[key];return next;});api({op:'detail',mailbox:m.account,folder:m.path,uid:m.uid}).then(data=>{const value=data.data.text||plain(data.data.html||'');bodyCache.current.set(key,value);setBodies(old=>({...old,[key]:value}));}).catch(e=>setBodyErrors(old=>({...old,[key]:e.message})));}}>Retry loading</button></div>:<span className="loading-text"><LoaderCircle size={13} className="spin"/>Loading email…</span>}</div>{m.attachments.length>0&&<div className="bubble-files">{m.attachments.map(a=><a key={a.id} href={`/api/mail?${new URLSearchParams({op:'attachment',mailbox:m.account,folder:m.path,uid:String(m.uid),attachment:a.id,filename:a.filename||'attachment'})}`}><Paperclip size={13}/>{a.filename||'Attachment'}<ArrowDownToLine size={13}/></a>)}</div>}<footer><time>{new Date(m.date).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span>{outgoing?'In Sent':'Received'}</span></footer></article>;})}
     {ownPending.map(p=><article key={p.id} className={`email-bubble outgoing pending-${p.status}`}><div className="bubble-sender">You</div><div className="bubble-subject">{p.subject}</div><div className="bubble-text">{p.text}</div>{p.files.map((f,i)=><div className="pending-file" key={i}><Paperclip size={13}/>{f.filename}</div>)}<footer><time>{new Date(p.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><span>{p.status==='sending'?<><LoaderCircle size={12} className="spin"/>Sending…</>:p.status==='accepted'?<><Clock size={12}/>Accepted for sending · syncing to Sent</>:p.status==='demo'?'Demo only · not sent':p.status==='unknown'?'Sending status unknown':'Not sent'}</span></footer>{p.error&&<div className="send-error" role="alert"><TriangleAlert size={14}/>{p.error}{p.status==='unknown'&&' Check Sent before sending again.'}</div>}{['failed','unknown'].includes(p.status)&&<button className="button" onClick={()=>{if(draft.text||draft.files.length){notify('Save or clear the current reply before restoring this message.');return;}editDraft({text:p.text,files:p.files});}}>Copy back to reply box</button>}</article>)}
    </div>
    <form className="chat-composer" onSubmit={send}><div className="chat-recipient"><ReplyLabel/>To: {chat.peers.join(', ')||'No recipient'}</div><textarea aria-label="Write an email reply" placeholder="Write an email reply…" value={draft.text} onChange={e=>editDraft({text:e.target.value})} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><div className="compose-attachments">{draft.files.map((f,i)=><span key={i}><Paperclip size={13}/>{f.filename}<button type="button" aria-label={`Remove ${f.filename}`} onClick={()=>editDraft({files:draft.files.filter((_,index)=>index!==i)})}><X size={13}/></button></span>)}</div><div className="chat-compose-actions"><input ref={fileInput} type="file" multiple hidden onChange={e=>{void addFiles(e.target.files).catch(()=>notify('Could not read the attachment.'));e.target.value='';}}/><button className="icon-button" type="button" title="Attach files" aria-label="Attach files to reply" onClick={()=>fileInput.current?.click()}><Paperclip size={18}/></button><button type="button" className="chat-save" disabled={!draft.text.trim()||sending} onClick={async()=>{const id=crypto.randomUUID();const source=[...chat.messages].reverse().find(m=>!isOutgoing(m,chat.account));if(await saveDraft('draft:'+id,{id,account:chat.account.id,to:chat.peers.join(', '),cc:'',subject:replySubject(source?.subject??chat.latest.subject),text:draft.text,...(source?{kind:'reply',ref:{uid:source.uid,folder:source.path}}:{})})){editDraft({text:'',files:[]});notify('Saved in Drafts. Reattach any files when reopening.');}}}><FileText size={14}/>Save draft</button><button type="submit" className="primary" disabled={sending||!draft.text.trim()||!chat.peers.length}>{sending?<LoaderCircle size={15} className="spin"/>:<Send size={15}/>} {demo?'Simulate reply':'Send reply'}</button></div><p className="delivery-note">Email delivery and read receipts are not confirmed here. Ctrl+Enter to send.</p></form>
   </>:<div className="reader-empty"><MessageCircle size={46} strokeWidth={1.2}/><h2>Your email, in conversation.</h2><p>Choose a person to see incoming emails and your replies together.</p><div className="reader-hint"><Mail size={14}/>Same mailbox. A more familiar view.</div></div>}</div>
  </div>
 </section>;
}
function ReplyLabel(){return <span className="reply-label">REPLY</span>;}
