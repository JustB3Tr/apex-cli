import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,rm,symlink,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {TerminalUI} from '../cli/terminal.js';
import {autoPermission,commandCatalog} from '../cli/permissions.js';
import {firstRunSetup} from '../cli/setup.js';
import {executeShell,shellTurn,shareShellReceipt} from '../cli/shell-command.js';
import {createStore} from '../server/store.js';
import {createHub} from '../server/hub.js';
import {roomClient} from '../server/rooms.js';

async function fixture(fn){const home=await mkdtemp(path.join(os.tmpdir(),'apex-ux-'));try{const {store}=await createStore(home),project=await store.createProject({name:'Fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});await fn({home,store,project,session});}finally{await rm(home,{recursive:true,force:true});}}

test('slash picker selects, completes, submits exact commands and excludes secret prompts',async()=>{
 const input=new PassThrough(),output=new PassThrough();output.columns=80;input.setRawMode=()=>{};let rendered='';output.on('data',b=>rendered+=b);const ui=new TerminalUI(input,output);
 try{
  ui.commands=commandCatalog(' /setup  Configure\n /sessions  Sessions\n /plan /build  Modes');
  assert.ok(ui.commands.some(c=>c.command==='/build'));
  const answer=ui.question('',{history:true});ui.key('/s',{});assert.equal(ui.suggestions().length,2);assert.equal(ui.footerOffset,6);
  ui.key('',{name:'down'});ui.key('',{name:'tab'});assert.equal(ui.active.text,'/setup');ui.key('',{name:'return'});assert.equal(await answer,'/setup');
  const partial=ui.question('',{history:true});ui.key('/sess',{});ui.key('',{name:'return'});assert.ok(ui.active);assert.equal(ui.active.text,'/sessions');ui.key('',{name:'return'});assert.equal(await partial,'/sessions');
  let changes=0;ui.on('permissions',()=>changes++);const shell=ui.question('',{history:true});ui.key('!echo fixture',{});assert.match(rendered,/SHELL/);ui.key('',{ctrl:true,name:'p'});assert.equal(changes,1);ui.key('',{name:'escape'});assert.equal(ui.active.text,'');ui.cancelQuestion();await shell;
  const pasted=ui.question('',{history:true});ui.insertPaste('!echo pasted');ui.key('',{name:'return'});assert.equal(await pasted,'!echo pasted');assert.equal(ui.lastSubmission.pasted,true);
  const secret=ui.question('',{secret:true});ui.key('/s',{});assert.equal(ui.suggestions().length,0);ui.cancelQuestion();await secret;
 }finally{ui.close();input.destroy();output.destroy();}
});

test('Auto allows bounded source edits, prompts for protected and escaping paths, denies Plan',()=>fixture(async({home,project})=>{
 const request={tool:'write_file',args:{path:'src/main.ts',content:'fixture'},root:project.path,mode:'build',permissions:'auto'};
 assert.equal((await autoPermission(request)).decision,'allow');
 for(const target of ['../outside.txt','.env','package.json','.github/workflows/run.yml','AGENTS.md','README','.apex/settings.json'])assert.equal((await autoPermission({...request,args:{...request.args,path:target}})).decision,'ask',target);
 for(const tool of ['run_shell','mcp_call','delegate_team','memory_save','peer_message'])assert.equal((await autoPermission({...request,tool})).decision,'ask');
 assert.equal((await autoPermission({...request,tool:'run_shell',args:{command:'pwd'}})).decision,'allow');
 for(const command of ['pwd; exit 1','pwd && rm -rf .','npm test','git status','Get-Location | Invoke-Expression'])assert.equal((await autoPermission({...request,tool:'run_shell',args:{command}})).decision,'ask');
 assert.equal((await autoPermission({...request,mode:'plan'})).decision,'deny');
 await mkdir(path.join(home,'outside'));await symlink(path.join(home,'outside'),path.join(project.path,'escape'),process.platform==='win32'?'junction':'dir');
 assert.equal((await autoPermission({...request,args:{...request.args,path:'escape/file.ts'}})).decision,'ask');
}));

test('first-run setup persists an opt-out once, creates an optional vault only by choice',()=>fixture(async({store,project})=>{
 let prompts=0,permission;const c={store,project:()=>project,print:()=>{},confirm:async()=>{prompts++;return false;},question:async()=>'',setPermissions:async value=>permission=value};
 await firstRunSetup(c);assert.equal(permission,'read-only');assert.equal((await store.readSettings()).vaultPreference,'disabled');assert.equal((await store.getProject(project.id)).vaultPath,undefined);
 const count=prompts;assert.equal((await firstRunSetup(c)).skipped,true);assert.equal(prompts,count);
 const answers=[true,false];await firstRunSetup({...c,confirm:async()=>answers.shift()},{force:true});
 const saved=await store.getProject(project.id);assert.equal(saved.vaultPath,path.join(project.path,'APEX-Vault'));assert.match(await readFile(path.join(saved.vaultPath,'Home.md'),'utf8'),/APEX project vault/);
}));

test('collaboration honors vault opt-out while retaining encrypted room messages',()=>fixture(async({home,store,project})=>{
 const hub=await createHub({home:path.join(home,'hub'),bootstrapToken:'fixture-admin'}),entries=new Map();
 try{
  await store.writeSettings({vaultPreference:'disabled'});
  const client=roomClient(store,{secrets:{get:async id=>entries.get(id),set:async(id,v)=>entries.set(id,v),remove:async id=>entries.delete(id)}});
  const room=await client.create(project.id,hub.endpoint,'fixture-admin','No vault');
  await client.post(room.id,{type:'message',content:'Shared without a vault'});await client.pull(room.id);
  assert.equal((await store.getProject(project.id)).vaultPath,undefined);
  assert.equal((await client.context(room.id))[0].content,'Shared without a vault');
  await assert.rejects(readFile(path.join(project.path,'APEX-Vault','Home.md')),error=>error.code==='ENOENT');
 }finally{await hub.close();}
}));

test('shell receipts survive failures and remain outside model history until explicit sharing',()=>fixture(async({store,project,session})=>{
 let sends=0;const c={store,project:()=>project,session:()=>session,model:()=> 'fixture:model',print:()=>{},confirm:async()=>false,chat:async text=>{assert.match(text,/untrusted data/);sends++;},execute:command=>executeShell(command,{cwd:project.path})};
 const saved=await shellTurn(c,process.platform==='win32'?"Write-Output 'fixture-output'; exit 7":"printf 'fixture-output'; exit 7");
 assert.equal(saved.data.exitCode,7);assert.match(saved.data.stdout,/fixture-output/);assert.equal(sends,0);assert.equal((await store.getSession(session.id)).messages.length,0);
 assert.equal((await store.records('events',{type:'shell_command'})).length,1);
 await shareShellReceipt({...c,confirm:async()=>true},saved);assert.equal(sends,1);
}));

test('shell execution bounds output, cancels and times out without sending model requests',()=>fixture(async({project})=>{
 const sleep=process.platform==='win32'?'Start-Sleep -Seconds 30':'sleep 30';
 const timed=await executeShell(sleep,{cwd:project.path,timeout:300});assert.equal(timed.timedOut,true);assert.ok(timed.elapsedMs<10000);
 const controller=new AbortController();const pending=executeShell(sleep,{cwd:project.path,signal:controller.signal});setTimeout(()=>controller.abort(),200);assert.equal((await pending).cancelled,true);
 const loud=process.platform==='win32'?"Write-Output ('x' * 100000)":"yes x";
 const bounded=await executeShell(loud,{cwd:project.path,maxBytes:1000});assert.equal(bounded.truncated,true);assert.ok(Buffer.byteLength(bounded.stdout)+Buffer.byteLength(bounded.stderr)<=1000);
 const missing=await executeShell('pwd',{cwd:path.join(project.path,'missing-directory')});assert.equal(missing.spawnError,'ENOENT');assert.equal(missing.exitCode,null);
}));
