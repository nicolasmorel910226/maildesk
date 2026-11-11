import { cookies } from 'next/headers';
import { allowedOrigin,clearLoginAttempts,createOwner,createSession,deleteSession,hasOwner,takeLoginAttempt,verifyOwner } from '../../../lib/local-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function POST(request:Request){
 if(!allowedOrigin(request))return json({error:'Invalid request origin.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
 try{
 const text=await request.text();if(text.length>2048)return json({error:'Request too large.'},413);
 const {op,password}=JSON.parse(text);
 if(op==='logout'){deleteSession((await cookies()).get('maildesk_session')?.value);return json({ok:true},200,'maildesk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
 if(!['setup','login'].includes(op)||typeof password!=='string'||password.length>128||password.length<1)return json({error:'Enter a valid password.'},400);
 if(!takeLoginAttempt())return json({error:'Too many attempts. Try again in 15 minutes.'},429);
 if(op==='setup'){
 if(hasOwner())return json({error:'This workspace already has a password. Please sign in.'},409);
 if(password.length<12)return json({error:'Use at least 12 characters.'},400);
 await createOwner(password);
 }else if(!await verifyOwner(password))return json({error:'Incorrect password.'},401);
 clearLoginAttempts();const token=createSession();return json({ok:true},200,`maildesk_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
 }catch{return json({error:'Could not complete sign-in. Please try again.'},400);}
}
