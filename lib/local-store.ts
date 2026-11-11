import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';

let database:DatabaseSync|undefined;
export function dataDirectory(){return resolve(process.env.MAILDESK_DATA_DIR || '.maildesk');}
export function sql(){
 if(database)return database;
 const directory=dataDirectory();mkdirSync(directory,{recursive:true,mode:0o700});
 database=new DatabaseSync(join(directory,'maildesk.sqlite'));
 database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,owner TEXT NOT NULL,label TEXT NOT NULL,order_id TEXT NOT NULL,secret TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mailboxes(id TEXT NOT NULL,owner TEXT NOT NULL,connection_id TEXT NOT NULL,address TEXT NOT NULL,PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS records(owner TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,key));
 CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_limit(id INTEGER PRIMARY KEY CHECK(id=1),attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
 chmodSync(join(directory,'maildesk.sqlite'),0o600);
 return database;
}
class Statement {
 private values:SQLInputValue[]=[];
 constructor(private query:string){}
 bind(...values:SQLInputValue[]){this.values=values;return this;}
 async first<T=Record<string,unknown>>():Promise<T|null>{return (sql().prepare(this.query).get(...this.values) as T|undefined)??null;}
 async all<T=Record<string,unknown>>(){return {results:sql().prepare(this.query).all(...this.values) as T[]};}
 runNow(){return sql().prepare(this.query).run(...this.values);}
 async run(){return this.runNow();}
}
export function db(){return {
 prepare:(query:string)=>new Statement(query),
 async batch(statements:Statement[]){const database=sql();database.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runNow());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}
};}
export function encryptionKey(){
 sql();const filename=join(dataDirectory(),'encryption.key');
 try{writeFileSync(filename,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const value=readFileSync(filename,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid local encryption key. Restore it from backup.');return value;
}
function derive(password:string,salt:string){return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt)).toString('hex');}
export async function checkPassword(password:string,stored:string){const [salt,value]=stored.split(':');if(!salt||!value)return false;const actual=await derive(password,salt),expected=Buffer.from(value,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function hasOwner(){return !!sql().prepare('SELECT id FROM owner WHERE id=1').get();}
export async function createOwner(password:string){const hash=await hashPassword(password);sql().prepare('INSERT INTO owner(id,password_hash) VALUES(1,?)').run(hash);}
export async function verifyOwner(password:string){const owner=sql().prepare('SELECT password_hash FROM owner WHERE id=1').get() as {password_hash:string}|undefined;return !!owner&&await checkPassword(password,owner.password_hash);}
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export function createSession(){const token=randomBytes(32).toString('hex');sql().prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());sql().prepare('INSERT INTO sessions(token_hash,expires) VALUES(?,?)').run(digest(token),Date.now()+12*60*60*1000);return token;}
export function validSession(token:string|undefined){if(!token||!/^[a-f0-9]{64}$/.test(token))return false;return !!sql().prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now());}
export function deleteSession(token:string|undefined){if(token)sql().prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
export function takeLoginAttempt(){const now=Date.now();const current=sql().prepare('SELECT attempts,reset_at FROM login_limit WHERE id=1').get() as {attempts:number;reset_at:number}|undefined;if(current&&current.reset_at>now&&current.attempts>=10)return false;sql().prepare('INSERT INTO login_limit(id,attempts,reset_at) VALUES(1,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').run(now+15*60*1000,now,now);return true;}
export function clearLoginAttempts(){sql().prepare('DELETE FROM login_limit').run();}
export function allowedOrigin(request:Request){const origin=request.headers.get('origin');const host=request.headers.get('host')||new URL(request.url).host;return ['127.0.0.1:4387','localhost:4387'].includes(host)&&origin===`http://${host}`;}
