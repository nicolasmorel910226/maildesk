// Loaded only by the isolated integration-test server; all upstream mail is fake.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(!url.startsWith('https://api.mail.hostinger.com/'))return originalFetch(input,options);
 if(options.headers?.Authorization!=='Bearer synthetic-environment-test-token')throw new Error('Unexpected test credential');
 if(options.method!=='GET')throw new Error('The integration fixture must never send or mutate email');
 if(url.endsWith('/me'))return Response.json({data:{orderResourceId:'order-test',mailboxes:[{resourceId:'box-test',address:'owner@example.com'}]}});
 if(url.endsWith('/folders'))return Response.json({data:[{name:'Inbox',path:'INBOX',specialUse:null}]});
 if(url.includes('/messages?'))return Response.json({data:[],pagination:{page:1,totalPages:1}});
 throw new Error('Unexpected upstream test endpoint');
};
