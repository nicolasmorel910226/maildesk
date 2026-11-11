import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(project);
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13)){console.error('Maildesk needs Node.js 22.13 or newer. Install a current Node.js LTS release, then run this launcher again.');process.exit(1);}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(args){const result=spawnSync(npm,args,{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});if(result.status!==0)process.exit(result.status||1);}
if(!existsSync('node_modules/next/package.json'))run(['ci','--no-audit','--no-fund']);
if(!existsSync('.next/BUILD_ID'))run(['run','build']);
console.log('\nOpen http://127.0.0.1:4387 in your browser.\nKeep this window open while using Maildesk. Press Ctrl+C to stop.\n');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4387'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill('SIGINT'));
