export type Account = {id:string;address:string;connection_id?:string};
export type Message = {uid:number;path:string;date:string;flags:string[];unseen:boolean;subject:string|null;from:{name:string;address:string}|null;to:{name:string;address:string}[];cc?:{name:string;address:string}[];attachments:{id:string;filename:string;sizeBytes:number;contentType:string}[];account:string;sent?:boolean;messageId?:string|null;inReplyTo?:string|null;body?:string};
export const demoAccounts:Account[]=['hello','sales','support','billing','partnerships','careers','operations','marketing','projects','team'].map((name,i)=>({id:`demo-${i}`,address:`${name}@northstar.example`}));
const rows=[
 ['Emma Wilson','emma@acme.example','A good time to discuss the proposal?','sales','Hi there,\n\nThank you for sharing the proposal. We’ve reviewed it with our team and would love to move forward.\n\nCould we find 30 minutes this week to walk through the timeline and next steps? Thursday afternoon would work well on our side.\n\nLooking forward to working together.\n\nBest,\nEmma Wilson\nPartnerships · Acme Studio'],
 ['Oliver Chen','oliver@studio.example','Website project — final feedback','projects','Hi team,\n\nThe latest version is looking great. We have a few final notes on the contact page. Could you take a look before Friday?\n\nThanks,\nOliver'],
 ['Sofia Martinez','sofia@atlas.example','Invoice #1042 — payment confirmation','billing','Hello,\n\nWe’ve processed payment for invoice #1042. Please let us know once it arrives.\n\nThank you,\nSofia'],
 ['James Parker','james@bright.example','Question about your business plan','support','Hello,\n\nWe’re expanding our team. Can you share more details about adding new users to our current plan?\n\nBest,\nJames'],
 ['Lena Fischer','lena@bloom.example','Let’s build something together','partnerships','Hi,\n\nI’d love to explore a partnership between our teams. Are you available for an introductory call next week?\n\nLena'],
 ['Daniel Kim','daniel@orbit.example','Re: Q4 delivery schedule','operations','Hi team,\n\nThe updated delivery schedule is confirmed. We’ll send the tracking details as soon as everything ships.\n\nDaniel'],
 ['Maya Thompson','maya@field.example','Thank you for the introduction','hello','Hello,\n\nIt was a pleasure meeting you yesterday. Thank you for introducing us to the team.\n\nWarm regards,\nMaya'],
 ['Alex Morgan','alex@candidate.example','Application — Product designer','careers','Hello,\n\nI’m interested in your product designer role and would love to learn more about the team.\n\nAlex'],
 ['Nora Patel','nora@wave.example','November campaign ideas','marketing','Hi team,\n\nHere are the directions we discussed for the November campaign. Let’s choose our favorite at the next meeting.\n\nNora'],
 ['Ben Wright','ben@acme.example','Our next workshop','team','Hello everyone,\n\nLooking forward to the workshop next week. Please bring your ideas and any questions.\n\nBen'],
 ['Emma Wilson','emma@acme.example','Re: Partnership introduction','sales','Hi,\n\nThanks for getting in touch. I’ll share the brief with our team and get back to you soon.\n\nEmma'],
 ['Sofia Martinez','sofia@atlas.example','October account statement','billing','Hello,\n\nOur October accounts are now complete. Thank you for another great month.\n\nSofia'],
];
export function makeDemo():Message[]{return rows.map((r,i)=>({uid:i+1,path:'INBOX',date:new Date(Date.now()-(i*47+8)*60000).toISOString(),flags:i===0||i===4?['\\Flagged']:[],unseen:i<5,subject:r[2],from:{name:r[0],address:r[1]},to:[{name:'',address:`${r[3]}@northstar.example`}],attachments:[],account:demoAccounts.find(a=>a.address.startsWith(r[3]+'@'))!.id,body:r[4]}));}
export const messageKey=(m:Message)=>`${m.account}:${m.path}:${m.uid}`;
