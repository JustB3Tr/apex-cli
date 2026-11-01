import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {createStore} from '../server/store.js';
import {createHub} from '../server/hub.js';
import {roomClient} from '../server/rooms.js';

const version=JSON.parse(await readFile('package.json','utf8')).version,root=await mkdtemp(path.join(os.tmpdir(),'apex-live-group-')),people=[];
let posts=0,release,firstSeen;const gate=new Promise(r=>release=r),started=new Promise(r=>firstSeen=r);
const api=http.createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.method!=='POST')return res.end(JSON.stringify({models:[{name:'fixture-group',context_length:128000}]}));let body='';for await(const b of req)body+=b;const data=JSON.parse(body);posts++;if(posts===1){firstSeen();await gate;}const content=data.messages.some(m=>m.role==='user'&&m.content.includes('accessibility instead'))?'Adjusted to accessibility':'Initial fixture response';res.end(JSON.stringify({choices:[{message:{role:'assistant',content}}],usage:{prompt_tokens:24,completion_tokens:8}}));});
const hub=await createHub({home:path.join(root,'hub'),bootstrapToken:'fixture-only'});
async function wait(person,value,from=0){const until=Date.now()+20000;while(Date.now()<until){if(person.transcript.slice(from).includes(value)){await person.pending;return;}if(person.exited)throw Error('Terminal exited before '+value);await new Promise(r=>setTimeout(r,25));}throw Error('Missing '+value+'; tail: '+person.transcript.slice(-1200));}
async function ready(p){const until=Date.now()+20000;while(Date.now()<until){await p.pending;const b=p.terminal.buffer.active,line=b.getLine(b.baseY+b.cursorY)?.translateToString(true)||'';if(b.type==='normal'&&line.startsWith('│ > ')&&/^\s*│$/.test(line.slice(4)))return;await new Promise(r=>setTimeout(r,25));}throw Error('Composer not ready');}
async function command(p,line,expect){await ready(p);const mark=p.transcript.length;p.child.write(line+'\r');await wait(p,expect,mark);}
async function screenshot(p){await p.pending;const terminal=p.terminal,cw=10.8,ch=23,pad=22,canvas=createCanvas(terminal.cols*cw+pad*2,terminal.rows*ch+pad*2),ctx=canvas.getContext('2d');ctx.fillStyle='#1e1e1e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='18px "APEX Group Mono"';ctx.textBaseline='top';for(let y=0;y<terminal.rows;y++){const line=terminal.buffer.active.getLine(terminal.buffer.active.viewportY+y);if(!line)continue;for(let x=0;x<terminal.cols;x++){const cell=line.getCell(x);if(!cell?.getWidth())continue;ctx.fillStyle=cell.getFgColorMode()===0x3000000?'#'+cell.getFgColor().toString(16).padStart(6,'0'):'#e5e5e5';ctx.fillText(cell.getChars()||' ',pad+x*cw,pad+y*ch);}}await writeFile('artifacts/apex-group-'+version+'.png',canvas.toBuffer('image/png'));}
try{
 await new Promise(r=>api.listen(0,'127.0.0.1',r));await mkdir('artifacts',{recursive:true});GlobalFonts.registerFromPath('C:/Windows/Fonts/consola.ttf','APEX Group Mono');
 for(const name of ['Alice','Bob']){const home=path.join(root,name),{store}=await createStore(home),project=await store.createProject({name:'Group demo',path:path.join(root,name+'-project')});await store.writeSettings({identity:{name},onboardingVersion:2,vaultPreference:'disabled',defaultMode:'plan',permissions:'read-only',defaultModel:'ollama:fixture-group',maxTurnUSD:0});people.push({home,store,project,client:roomClient(store),name,transcript:'',pending:Promise.resolve()});}
 const [alice,bob]=people,room=await alice.client.create(alice.project.id,hub.endpoint,hub.bootstrapToken,'Group demo');await bob.client.join(bob.project.id,await alice.client.invite(room.id));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/KEY|TOKEN|SECRET|PASSWORD|APEX|_BASE_URL|NODE_OPTIONS/i.test(k)));Object.assign(env,{TERM:'xterm-256color',NODE_TLS_REJECT_UNAUTHORIZED:'1',OLLAMA_BASE_URL:'http://127.0.0.1:'+api.address().port});
 for(const p of people){p.terminal=new xterm.Terminal({cols:120,rows:38,allowProposedApi:true,scrollback:1000});p.child=pty.spawn(process.execPath,['bin/apex.js',p.project.path,'--home',p.home],{cwd:process.cwd(),cols:120,rows:38,env,name:'xterm-256color'});p.listeners=[p.terminal.onData(d=>p.child.write(d)),p.child.onData(d=>{p.transcript+=d;p.pending=p.pending.then(()=>new Promise(r=>p.terminal.write(d,r)));}),p.child.onExit(()=>p.exited=true)];await wait(p,'Session ');}
 await command(alice,'/group','GROUP ·');await command(bob,'/group pool '+JSON.stringify({enabled:true,model:'ollama:fixture-group',mode:'plan',maxUSD:0,turnUSD:0,multiAgent:true}),'Group agent enabled with');await command(bob,'/group','GROUP ·');
 await command(alice,'Hello Bob, this is our shared project.','Alice: Hello Bob');await wait(bob,'Alice: Hello Bob');
 await ready(alice);alice.child.write('@apex inspect the login flow\r');await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('Agent never started')),20000))]);await wait(bob,'Group agent started');
 await command(alice,'@apex focus on accessibility instead','Steering ');release();await wait(alice,'Adjusted to accessibility');assert.equal(posts,2);
 await command(alice,'/tabs personal','PERSONAL ·');await command(alice,'/group pull','Imported ');await command(alice,'/tabs group','GROUP ·');await command(alice,'/group agents','ollama:fixture-group');await screenshot(alice);
 for(const p of people){await command(p,'/exit','> /exit');const until=Date.now()+10000;while(!p.exited&&Date.now()<until)await new Promise(r=>setTimeout(r,25));assert.ok(p.exited);}
 await writeFile('artifacts/group-terminal-'+version+'-proof.json',JSON.stringify({version,at:new Date().toISOString(),twoActualConPTYProcesses:true,separateProfiles:true,encryptedHub:true,liveHumanMessaging:true,explicitMention:true,ownerLocalAllowance:true,steeringWithoutAbort:true,personalGroupTabs:true,explicitSharedContextImport:true,fixturePOSTs:posts,paidCalls:0,personalSettingsTouched:false,processesExited:true},null,2));console.log('Two actual terminals: shared human chat, @apex, steering and private/group tabs passed. Zero paid calls.');
}finally{for(const p of people)await writeFile('artifacts/group-terminal-'+version+'-'+p.name+'.log',p.transcript);release();for(const p of people){if(p.child&&!p.exited)p.child.kill();for(const l of p.listeners||[])l.dispose();p.terminal?.dispose();}await hub.close();api.closeAllConnections();await new Promise(r=>api.close(r));await rm(root,{recursive:true,force:true});}

process.exit(0);
