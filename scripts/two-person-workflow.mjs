import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createStore} from '../server/store.js';import {createHub} from '../server/hub.js';import {roomClient} from '../server/rooms.js';import {peerPool} from '../server/pool.js';
import {credentialVault} from '../cli/credentials.js';import {localVault} from '../server/vault.js';import {git,initRepo,connectRepo,saveRepo,cloneRepo,syncRepo} from '../server/git-project.js';import {digest} from '../server/safe-content.js';
const exec=promisify(execFile),file=fileURLToPath(import.meta.url),version=JSON.parse(await readFile('package.json','utf8')).version;
process.env.NODE_TLS_REJECT_UNAUTHORIZED='1';
const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|PASSWORD|APEX|_BASE_URL/i.test(key)));

if(process.argv[2]==='--peer'){
 const [home,roomId,taskId]=process.argv.slice(3),{store}=await createStore(home),client=roomClient(store),pool=peerPool(store,client);let calls=0,readVerified=false;
 const result=await pool.accept(roomId,taskId,{models:[{id:'fixture:reviewer',inputPrice:0,outputPrice:0}],fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://fixture.invalid/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer fixture-bob-key-not-real');const body=JSON.parse(options.body);assert.match(body.messages[0].content,/PLAN MODE/);assert.ok(!body.tools.some(t=>t.function.name==='write_file'));assert.doesNotMatch(options.body,/ALICE_PRIVATE|BOB_PRIVATE|fixture-alice-key/);
  const tool=body.messages.findLast(m=>m.role==='tool');if(tool){assert.match(tool.content,/a-b/);readVerified=true;}
  return Response.json({choices:[{message:tool?{role:'assistant',content:'Observed add(a,b) returns a-b in math.mjs. Change it to a+b and run the real negative-number test. This fixture review is not a measured model-quality result.'}:{role:'assistant',content:'',tool_calls:[{id:'inspect',type:'function',function:{name:'read_file',arguments:'{"path":"math.mjs"}'}}]}}],usage:{prompt_tokens:20,completion_tokens:10,cost:0}});
 }});assert.equal(readVerified,true);assert.equal(result.receipt.status,'complete');assert.equal(result.receipt.committedUSD,0);console.log(JSON.stringify({calls,readVerified,status:result.receipt.status}));
}else{
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-two-person-'));let hub;
 try{
  const remote=path.join(root,'origin.git'),aPath=path.join(root,'Alice','project'),bPath=path.join(root,'Bob','project');await mkdir(aPath,{recursive:true});await git(root,['init','--bare','--initial-branch=main',remote]);await initRepo(aPath);
  await writeFile(path.join(aPath,'math.mjs'),'export const add=(a,b)=>a-b;\n');await connectRepo(aPath,remote);await saveRepo(aPath,'Initial source',{push:true});await cloneRepo(remote,bPath);
  const people=[];for(const [name,projectPath] of [['Alice',aPath],['Bob',bPath]]){
   const {store}=await createStore(path.join(root,name,'state'));await store.writeSettings({identity:{name,device:name},providers:{fixture:{baseURL:'https://fixture.invalid/v1',keyEnv:'APEX_FIXTURE_TEST_KEY',protocol:'openai-compatible'}}});
   const vault=credentialVault(store.home);vault.configureProviders({fixture:'APEX_FIXTURE_TEST_KEY'});await vault.set('fixture','fixture-'+name.toLowerCase()+'-key-not-real');
   const project=await store.createProject({name:'Shared calculator',path:projectPath}),session=await store.createSession({projectId:project.id});await store.appendMessage(session.id,{role:'user',content:name.toUpperCase()+'_PRIVATE_CHAT'});await store.addMemory({projectId:project.id,text:name.toUpperCase()+'_PRIVATE_MEMORY',visibility:'private'});people.push({name,store,project,client:roomClient(store)});
  }
  const [a,b]=people;hub=await createHub({home:path.join(root,'hub'),bootstrapToken:'fixture-local-owner'});const room=await a.client.create(a.project.id,hub.endpoint,hub.bootstrapToken,'Calculator review');const invitation=await a.client.invite(room.id),joined=await b.client.join(b.project.id,invitation);
  for(const p of people){const project=await p.store.getProject(p.project.id);await localVault(project.vaultPath).note({title:'Local note',content:p.name.toUpperCase()+'_PRIVATE_VAULT',visibility:'private'});}
  await a.client.post(room.id,{type:'message',role:'user',content:'Please inspect add(a,b), including negative numbers. Report observed code and verification separately.'});await b.client.pull(room.id);assert.match(JSON.stringify(await b.client.context(room.id)),/negative numbers/);
  const poolA=peerPool(a.store,a.client),poolB=peerPool(b.store,b.client),offer=await poolA.offer(room.id,{target:joined.memberId,goal:'Inspect math.mjs and explain the likely arithmetic defect.',maxUSD:0});
  await assert.rejects(()=>poolB.accept(room.id,offer.taskId),/not opted in/);await poolB.configure(room.id,{enabled:true,model:'fixture:reviewer',maxUSD:0});
  const peer=JSON.parse((await exec(process.execPath,[file,'--peer',b.store.home,room.id,offer.taskId],{env:{...cleanEnv(),NODE_TLS_REJECT_UNAUTHORIZED:'1'},windowsHide:true,timeout:30000,maxBuffer:100000})).stdout);
  await a.client.pull(room.id);const results=await a.store.records('events',{roomId:room.id,type:'room_event'});assert.ok(results.some(e=>e.data.type==='task_result'&&e.data.result.includes('a-b')));
  // Explicit human-side repair, followed by real executable tests. The fixture
  // model only reviewed source and was never allowed to edit or run commands.
  await writeFile(path.join(bPath,'math.mjs'),'export const add=(a,b)=>a+b;\n');await writeFile(path.join(bPath,'math.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {add} from './math.mjs';test('positive and negative addition',()=>{assert.equal(add(7,3),10);assert.equal(add(-4,2),-2);assert.equal(add(-4,-2),-6);});\n");
  await exec(process.execPath,['--test','math.test.mjs'],{cwd:bPath,env:cleanEnv(),windowsHide:true,timeout:10000});await saveRepo(bPath,'Repair addition after review',{push:true});assert.equal((await syncRepo(aPath)).synced,true);await exec(process.execPath,['--test','math.test.mjs'],{cwd:aPath,env:cleanEnv(),windowsHide:true,timeout:10000});
  await b.client.post(room.id,{type:'message',role:'user',content:'Human applied a+b. Real node --test math.test.mjs passed in both linked checkouts; cases: positive, mixed sign, negative. Fixture model opinion is separate.'});await a.client.pull(room.id);await b.client.pull(room.id);
  const hubBytes=await readFile(path.join(root,'hub','hub.json'),'utf8');assert.doesNotMatch(hubBytes,/fixture-alice-key|fixture-bob-key|PRIVATE_CHAT|PRIVATE_MEMORY|PRIVATE_VAULT|Human applied/);
  for(const p of people){const project=await p.store.getProject(p.project.id);assert.match(await readFile(path.join(project.vaultPath,'Home.md'),'utf8'),/\[\[Shared\//);assert.doesNotMatch(JSON.stringify(await p.client.context(room.id)),/PRIVATE_/);const vault=credentialVault(p.store.home);vault.configureProviders({fixture:'APEX_FIXTURE_TEST_KEY'});assert.equal(await vault.get('fixture'),'fixture-'+p.name.toLowerCase()+'-key-not-real');}
  const source=(await readFile(path.join(aPath,'math.mjs'),'utf8')).replaceAll('\r\n','\n');assert.equal(source,(await readFile(path.join(bPath,'math.mjs'),'utf8')).replaceAll('\r\n','\n'));
  const receipt={at:new Date().toISOString(),profiles:2,separatePeerProcess:true,realGitCheckouts:2,realLoopbackHTTP:true,roomPayloadEncryption:'AES-256-GCM',credentialStorage:'Windows CurrentUser DPAPI, separate fake keys',ownerOptInRequired:true,fixtureInferenceCalls:peer.calls,actualProviderCalls:0,modelObservedRealFile:peer.readVerified,planNoWriteTools:true,privateChatsMemoryVaultExcluded:true,realCodeTestsPassedOnBothCheckouts:true,sharedSourceSHA256:digest(source),linkedVaults:2,physicalSecondPCVerified:false,realModelQualityVerified:false,obsidianDesktopVerified:false};
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/two-person-workflow-'+version+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
 }finally{await hub?.close();await rm(root,{recursive:true,force:true});}
}
