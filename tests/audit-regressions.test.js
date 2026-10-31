import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {TerminalUI} from '../cli/terminal.js';
import {terminalText} from '../cli/output.js';
import {credentialVault} from '../cli/credentials.js';
import {document} from '../server/document.js';
import {fileRead,fileList} from '../server/runtime/files.js';
import {git,initRepo,connectRepo,saveRepo,repoInfo} from '../server/git-project.js';
import {retrieveMemory} from '../server/memory.js';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {extensionManager} from '../server/extensions.js';
import {localVault} from '../server/vault.js';
import {remoteCommands} from '../cli/remote-commands.js';
import {boundedJSON} from '../server/http-json.js';
import {captureAccountBackup,restoreAccountBackup} from '../server/account-backup.js';
import {createMcpManager} from '../server/runtime/mcp.js';

async function scratch(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-audit-fix-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const child=source=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',source],{cwd:process.cwd(),windowsHide:true});let error='';p.stderr.on('data',b=>error+=b);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(error)));});

test('untrusted terminal output cannot clear screen, set title, clipboard or inject carriage returns',()=>{
 const attack='before\x1b[2J\x1b]52;c;ZmFrZQ==\x07\x1b]0;fake title\x07after\rrewrite\x00\x9b2J';
 const safe=terminalText(attack);assert.doesNotMatch(safe,/[\x00-\x08\x0b-\x1f\x7f-\x9f]/);assert.match(safe,/beforeafter\nrewrite/);
 const input=new PassThrough(),output=new PassThrough();input.setRawMode=()=>{};input.isTTY=true;output.columns=90;let text='';output.on('data',b=>text+=b);const ui=new TerminalUI(input,output);
 try{const start=text.length;ui.write(attack);assert.equal(text.slice(start),safe+'\n');ui.write('\x1b[31mAPEX\x1b[0m',{trusted:true});assert.ok(text.includes('\x1b[31mAPEX'));}finally{ui.close();}
});

test('model read/list policy blocks private state and canonical aliases but allows exact generated task board',()=>scratch(async root=>{
 for(const name of ['auth-token','hub-owner-token','remote-control.json','.apex-cli/state.json','.apex/private.md','credentials.enc.json']){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),'private fixture');await assert.rejects(()=>fileRead(root,name),/Sensitive/);}
 const id=randomUUID(),board=`.apex/teams/${id}/TASKS.md`;await mkdir(path.dirname(path.join(root,board)),{recursive:true});await writeFile(path.join(root,board),'public assignment');assert.equal(await fileRead(root,board),'public assignment');
 await symlink(path.join(root,'.apex'),path.join(root,'alias'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>fileRead(root,'alias/private.md'),/Sensitive/);
 const names=(await fileList(root)).map(x=>x.name);assert.ok(!names.includes('auth-token'));assert.ok(!names.includes('.apex'));
}));

test('credential saves survive separate instances and separate OS processes',{skip:process.platform!=='win32'},()=>scratch(async root=>{
 await Promise.all(['openrouter','openai','deepseek'].map(provider=>credentialVault(root).set(provider,'fixture-'+provider+'-not-real')));
 for(const provider of ['openrouter','openai','deepseek'])assert.equal(await credentialVault(root).get(provider),'fixture-'+provider+'-not-real');
 await Promise.all(['groq','anthropic','mistral'].map(provider=>child(`import {credentialVault} from './cli/credentials.js';await credentialVault(${JSON.stringify(root)}).set(${JSON.stringify(provider)},${JSON.stringify('fixture-'+provider+'-not-real')});`)));
 for(const provider of ['groq','anthropic','mistral'])assert.equal(await credentialVault(root).get(provider),'fixture-'+provider+'-not-real');
 assert.equal((await credentialVault(root).status()).filter(x=>x.saved).length,6);
}));

test('empty crash lock is atomically claimable; known live owner remains exclusive',()=>scratch(async root=>{
 const file=path.join(root,'counter.json');await mkdir(file+'.lock');const a=document(file,{count:0}),b=document(file,{count:0});let inside=0,peak=0;
 await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).mutate(async value=>{inside++;peak=Math.max(peak,inside);await new Promise(r=>setTimeout(r,4));value.count++;inside--;})));
 assert.equal(peak,1);assert.equal((await a.read()).count,12);
 // Race several stale-owner recoverers; the old nonce may only be retired once.
 await mkdir(file+'.lock');await writeFile(path.join(file+'.lock','owner.json'),JSON.stringify({pid:2147483647,token:randomUUID()}));
 await Promise.all([a,b,document(file,{count:0})].map(d=>d.mutate(value=>{value.count++;})));assert.equal((await a.read()).count,15);
}));

test('read-only Git inspection and memory retrieval do not execute configured clean filters',()=>scratch(async root=>{
 const project=path.join(root,'project'),marker=path.join(root,'ran.txt'),filter=path.join(root,'filter.cjs');await mkdir(project);await initRepo(project);await writeFile(path.join(project,'app.txt'),'original');await writeFile(path.join(project,'.gitattributes'),'*.txt filter=audit\n');await saveRepo(project,'initial');
 await writeFile(filter,`require('fs').writeFileSync(${JSON.stringify(marker)},'executed');process.stdin.pipe(process.stdout);`);
 await git(project,['config','filter.audit.clean',`"${process.execPath.replaceAll('\\','/')}" "${filter.replaceAll('\\','/')}"`]);await writeFile(path.join(project,'app.txt'),'modified');
 assert.equal((await repoInfo(project)).dirty,true);const {store}=await createStore(path.join(root,'state')),p=await store.createProject({name:'Fixture',path:project});await retrieveMemory(store,p.id,'test');await assert.rejects(()=>access(marker),/ENOENT/);
 // Prove the fixture really can trigger the filter without inspection overrides.
 await child(`import {execFileSync} from 'node:child_process';execFileSync('git',['-C',${JSON.stringify(project)},'status','--porcelain']);`);await access(marker);
}));

test('push sends an existing local commit even when worktree has nothing to save',()=>scratch(async root=>{
 const remote=path.join(root,'origin.git'),project=path.join(root,'project');await mkdir(project);await git(root,['init','--bare','--initial-branch=main',remote]);await initRepo(project);await writeFile(path.join(project,'app.txt'),'one');await saveRepo(project,'saved earlier');await connectRepo(project,remote);
 const result=await saveRepo(project,'push existing',{push:true});assert.equal(result.saved,false);assert.equal(result.pushed,true);assert.equal((await git(remote,['rev-parse','HEAD'])).stdout,(await repoInfo(project)).head);
}));

test('plugin installs and lifecycle stay scoped to their project',()=>scratch(async root=>{
 const {store}=await createStore(root),a=await store.createProject({name:'A',path:path.join(root,'a')}),b=await store.createProject({name:'B',path:path.join(root,'b')}),m=extensionManager(root),id='apex-dev@apex-official';await m.addMarket('builtin');await m.install(id,a);await m.install(id,b);assert.equal((await m.list()).length,2);assert.ok((await m.skills(a)).length);assert.ok((await m.skills(b)).length);
 await assert.rejects(()=>m.enable(id,false),/Choose the project/);await m.enable(id,false,b);assert.equal((await m.skills(b)).length,0);assert.ok((await m.skills(a)).length);await m.uninstall(id,b);assert.equal((await m.list()).length,1);assert.ok((await m.skills(a)).length);
}));

test('project plugin reinstall and uninstall preserve another project MCP configuration',()=>scratch(async root=>{
 const {store}=await createStore(path.join(root,'state')),a=await store.createProject({name:'A',path:path.join(root,'a')}),b=await store.createProject({name:'B',path:path.join(root,'b')}),source=path.join(root,'market'),plugin=path.join(source,'plugin');await mkdir(path.join(source,'.claude-plugin'),{recursive:true});await mkdir(path.join(plugin,'.claude-plugin'),{recursive:true});await writeFile(path.join(source,'.claude-plugin','marketplace.json'),JSON.stringify({name:'fixture-market',plugins:[{name:'fixture-plugin',source:'./plugin'}]}));await writeFile(path.join(plugin,'.claude-plugin','plugin.json'),JSON.stringify({name:'fixture-plugin'}));await writeFile(path.join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{fixture:{command:'node',args:['-e','console.log("not started")']}}}));const m=extensionManager(store.home),mcp=createMcpManager(store.home),id='fixture-plugin@fixture-market';await m.addMarket(source);await m.install(id,a);await m.install(id,b);await m.install(id,b);assert.equal((await mcp.list()).length,2);await m.uninstall(id,b);const remaining=await mcp.list();assert.equal(remaining.length,1);assert.equal(remaining[0].projectId,a.id);assert.equal(remaining[0].connected,false);await mcp.close();
}));

test('explicit encrypted-backup capture includes private notes and spending ceiling while excluding nested app state',()=>scratch(async root=>{
 const {store}=await createStore(path.join(root,'state')),p=await store.createProject({name:'A',path:path.join(root,'project')}),vault=path.join(p.path,'Vault');await mkdir(path.join(vault,'Private','.apex-cli'),{recursive:true});await writeFile(path.join(vault,'Private','note.md'),'personal note');await writeFile(path.join(vault,'Private','.apex-cli','secret.md'),'must not upload');await store.updateProject(p.id,{vaultPath:vault});await store.writeSettings({maxTurnUSD:.03});const backup=await captureAccountBackup(store);assert.equal(backup.settings.maxTurnUSD,.03);assert.ok(backup.projects[0].vault.some(f=>f.path==='Private/note.md'));assert.doesNotMatch(JSON.stringify(backup),/must not upload/);const restored=(await createStore(path.join(root,'restored-state'))).store;await restoreAccountBackup(restored,backup,{basePath:path.join(root,'restored-projects'),accountId:'fixture'});assert.equal((await restored.readSettings()).maxTurnUSD,.03);
}));

test('remote help works without endpoint, credential lookup or side effects',()=>scratch(async root=>{const output=[],commands=remoteCommands({store:{home:root},print:value=>output.push(value)});try{await commands.command('/remote','');await commands.command('/remote','unknown');assert.equal(output.length,2);assert.match(output[0],/Remote control/);}finally{await commands.close();}}));
test('vault home excludes control files while private vault search remains available locally',()=>scratch(async root=>{const v=localVault(root);await v.init();await v.note({title:'Private local context',content:'banana fixture',visibility:'private'});assert.doesNotMatch(await readFile(path.join(root,'Home.md'),'utf8'),/\[\[\.gitignore/);assert.ok((await v.search('banana')).some(n=>n.file.startsWith('Private/')));assert.equal((await v.search('banana',{visibility:'shared'})).length,0);}));

test('bounded JSON cancels an oversized streaming body before consuming all chunks',async()=>{let pulls=0,cancelled=false;const response=new Response(new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(256));},cancel(){cancelled=true;}}));await assert.rejects(()=>boundedJSON(response,{maxBytes:512}),/exceeds/);assert.equal(cancelled,true);assert.ok(pulls<6);});

test('malformed usage remains unknown and invalid paid replies retain their reservation without replay',()=>scratch(async root=>{
 const {store}=await createStore(root),p=await store.createProject({name:'Fixture',path:path.join(root,'work')}),s=await store.createSession({projectId:p.id});let calls=0;
 const runtime=createRuntime({store,getCredential:async()=> 'fixture-not-real-key',models:[{id:'openai:fixture',inputPrice:1e-7,outputPrice:1e-7}],fetch:async()=>{calls++;return Response.json(calls===1?{choices:[{message:{content:'valid text'}}],usage:{prompt_tokens:'0invalid',completion_tokens:-5,cost:.0001}}:{choices:[{message:{content:{bad:true}}}]});}});
 try{const result=await runtime.chat({projectId:p.id,sessionId:s.id,model:'openai:fixture',message:'usage'});assert.equal(result.usage.inputTokens,null);assert.equal(result.usage.outputTokens,null);const invalid=await runtime.chat({projectId:p.id,sessionId:s.id,model:'openai:fixture',message:'invalid'});assert.match(invalid.error,/invalid assistant/);const requests=await store.records('requests',{});assert.ok(requests.some(r=>r.state==='unknown'&&r.amount>0));assert.equal(calls,2);}finally{await runtime.close();}
}));

test('APEX_ALLOW_UNPRICED=0 never permits an unpriced paid request',()=>scratch(async root=>{
 const old=process.env.APEX_ALLOW_UNPRICED;process.env.APEX_ALLOW_UNPRICED='0';const {store}=await createStore(root),p=await store.createProject({name:'Fixture',path:path.join(root,'work')}),s=await store.createSession({projectId:p.id});let sends=0;const runtime=createRuntime({store,getCredential:async()=> 'fixture-not-real-key',models:[],fetch:async()=>{sends++;throw Error('must not send');}});
 try{const result=await runtime.chat({projectId:p.id,sessionId:s.id,model:'openai:fixture',message:'unpriced'});assert.match(result.error,/Price unavailable/);assert.equal(sends,0);}finally{await runtime.close();if(old===undefined)delete process.env.APEX_ALLOW_UNPRICED;else process.env.APEX_ALLOW_UNPRICED=old;}
}));
