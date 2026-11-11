import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {sql} from '../lib/local-store.ts';
const prompt=createInterface({input:stdin,output:stdout});
const confirmation=await prompt.question('Stop Maildesk first. Type RESET to remove the local password and invalidate all sessions: ');prompt.close();
if(confirmation!=='RESET'){console.log('Nothing changed.');process.exit(0);}
const database=sql();database.exec('BEGIN IMMEDIATE; DELETE FROM sessions; DELETE FROM owner; DELETE FROM login_limit; COMMIT;');
console.log('Restart Maildesk and choose a new password. Connections, drafts, and encryption key were preserved.');
