import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.js';
import {createHub} from '../server/hub.js';
import {roomClient} from '../server/rooms.js';
import {groupChat,groupView,groupScopes} from '../server/group-chat.js';
import {createRuntime} from '../server/runtime/index.js';
import {git} from '../server/git-project.js';
import {jobs} from '../server/jobs.js';
import {TerminalUI} from '../cli/terminal.js';
import {PassThrough} from 'node:stream';
import {roomSecrets} from '../server/room-secrets.js';

const models=[{id:'ollama:fixture',inputPrice:0,outputPrice:0}];
const reply=content=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content}}],usage:{prompt_tokens:12,completion_tokens:4}}));
async function peers(count,fn){
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-group-')),hub=await createHub({home:path.join(root,'hub'),bootstrapToken:'fixture-only'}),people=[];
 try{
  for(let i=0;i<count;i++){
   const {store}=await createStore(path.join(root,'person'+i)),project=await store.createProject({name:'Person '+i,path:path.join(root,'project'+i)}),secrets=new Map(),client=roomClient(store,{secrets:{get:async id=>secrets.get(id),set:async(id,v)=>secrets.set(id,v),remove:async id=>secrets.delete(id)}});
   await store.writeSettings({identity:{name:'Person '+i},vaultPreference:'disabled'});people.push({store,project,client});
  }
  const room=await people[0].client.create(people[0].project.id,hub.endpoint,hub.bootstrapToken,'Shared project');
  for(const p of people.slice(1))await p.client.join(p.project.id,await people[0].client.invite(room.id));
  for(const p of people){p.memberId=(await p.client.membership(room.id)).memberId;p.group=groupChat(p.store,p.client);}
  await fn({root,room,people,hub});
 }finally{for(const p of people){await p.runtime?.close();await p.group.close();}await hub.close();await rm(root,{recursive:true,force:true});}
}
const config={enabled:true,model:'ollama:fixture',maxUSD:0,turnUSD:0,multiAgent:true};

test('ten separate people share one encrypted timeline, without importing personal chat',()=>peers(10,async({people,room})=>{
 for(const [i,p] of people.entries())await p.group.send(room.id,'Hello from '+i);
 const privateSession=await people[0].store.createSession({projectId:people[0].project.id,title:'Private'});await people[0].store.appendMessage(privateSession.id,{role:'user',content:'PRIVATE_SENTINEL'});
 for(const p of people){const board=await p.group.view(room.id);assert.equal(board.messages.length,10);assert.equal(board.members.length,10);assert.ok(!JSON.stringify(board).includes('PRIVATE_SENTINEL'));}
 await assert.rejects(()=>people[0].group.send(room.id,'@apex help'),/No opted-in agent/);
}));

test('mention is explicit, bound to one opted-in owner, and never replays after re-poll',()=>peers(3,async({people,room})=>{
 const [a,b,c]=people;let calls=0;b.group=groupChat(b.store,b.client,{runtime:{chat:async()=>{calls++;return {content:'A shared answer'};}}});
 await b.group.configure(room.id,config);await a.group.send(room.id,'A quoted @apex in ordinary discussion');await b.group.tick(room.id);await b.group.wait();assert.equal(calls,0);
 await a.group.send(room.id,'@apex inspect the parser',{target:b.memberId});await Promise.all([b.group.tick(room.id),c.group.tick(room.id)]);await b.group.wait();await b.group.tick(room.id);await b.group.wait();assert.equal(calls,1);
 const board=await c.group.view(room.id);assert.equal(board.runs.length,1);assert.equal(board.runs[0].status,'complete');assert.ok(board.messages.some(m=>m.data.content==='A shared answer'));
 const restarted=groupChat(b.store,b.client,{runtime:{chat:async()=>{throw Error('REPLAY');}}});await restarted.tick(room.id);await restarted.wait();await restarted.close();assert.equal(calls,1);
}));

test('three independent agent owners execute concurrently and only publish shared context',()=>peers(3,async({people,room})=>{
 let active=0,peak=0;const inputs=[];let release;const gate=new Promise(r=>release=r);
 for(const p of people){const runtime=createRuntime({store:p.store,models,fetch:async(url,options)=>{inputs.push(JSON.parse(options.body));active++;peak=Math.max(peak,active);await gate;active--;return reply('Owner '+p.memberId);}});p.runtime=runtime;p.group=groupChat(p.store,p.client,{runtime});await p.group.configure(room.id,config);}
 for(const p of people)await people[0].group.send(room.id,'@apex inspect for '+p.memberId,{target:p.memberId});
 await Promise.all(people.map(p=>p.group.tick(room.id)));for(let i=0;i<1500&&inputs.length<3;i++)await new Promise(r=>setTimeout(r,10));release();await Promise.all(people.map(p=>p.group.wait()));
 assert.equal(peak,3);assert.equal(inputs.length,3);for(const body of inputs){assert.ok(body.messages.some(m=>m.content?.includes('Shared group request')));assert.ok(!body.tools.some(t=>t.function.name==='memory_save'||t.function.name==='delegate_team'));}
 assert.equal((await people[0].group.view(room.id)).runs.filter(r=>r.status==='complete').length,3);for(const p of people)await p.runtime.close();
}));

test('single-agent opt-out serializes pending calls across different people',()=>peers(2,async({people,room})=>{
 const [a,b]=people;let calls=0,release;const gate=new Promise(r=>release=r);
 for(const p of people){p.group=groupChat(p.store,p.client,{runtime:{chat:async()=>{calls++;await gate;return {content:'done'};}}});await p.group.configure(room.id,{...config,multiAgent:false});}
 await a.group.send(room.id,'@apex first',{target:a.memberId});await a.group.send(room.id,'@apex second',{target:b.memberId});await Promise.all(people.map(p=>p.group.tick(room.id)));for(let i=0;i<1000&&calls<1;i++)await new Promise(r=>setTimeout(r,10));const before=calls;release();assert.equal(before,1);await Promise.all(people.map(p=>p.group.wait()));await b.group.tick(room.id);await b.group.wait();assert.equal(calls,2);
}));

test('owner allowance uses atomic full-turn reservations and preserves unknown billing holds',()=>peers(2,async({people,room})=>{
 const [a,b]=people;let calls=0;b.group=groupChat(b.store,b.client,{runtime:{chat:async({jobId})=>{calls++;const ledger=jobs(b.store),r=await ledger.reserve(jobId,{amount:.4,model:'fixture'});await ledger.sent(r.id);await ledger.unknown(r.id,'Read failed after send');return {error:'Unknown outcome'};}}});await b.group.configure(room.id,{...config,maxUSD:.5,turnUSD:.4});
 await a.group.send(room.id,'@apex one',{target:b.memberId});await a.group.send(room.id,'@apex two',{target:b.memberId});await b.group.tick(room.id);await b.group.wait();await b.group.tick(room.id);await b.group.wait();assert.equal(calls,1);
 const saved=(await b.store.record('rooms',room.id)).group;assert.equal(saved.spentUSD,.4);assert.equal((await a.group.view(room.id)).runs[0].status,'needs_attention');await assert.rejects(()=>b.group.configure(room.id,{...config,maxUSD:.1}),/below committed/);
 const run=(await b.store.records('events',{type:'group_local_run'}))[0];await assert.rejects(()=>b.group.resolve(room.id,run.messageId),/Reconcile/);await jobs(b.store).reconcile((await b.store.records('requests'))[0].id,.1);assert.deepEqual(await b.group.resolve(room.id,run.messageId),{resolved:true,replayed:false});assert.equal((await b.store.record('rooms',room.id)).group.spentUSD,.1);assert.equal(calls,1);
}));

test('authenticated steering is delivered during a live request without cancelling or replaying it',()=>peers(3,async({people,room})=>{
 const [a,b,c]=people;const requests=[];let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const runtime=createRuntime({store:b.store,models,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));if(requests.length===1){entered();await gate;}return reply(requests.length===1?'First response':'Adjusted response');}});b.group=groupChat(b.store,b.client,{runtime});await b.group.configure(room.id,config);await a.group.send(room.id,'@apex inspect login',{target:b.memberId});await b.group.tick(room.id);await started;
 const source=(await a.group.view(room.id)).messages.find(m=>m.invocation);await assert.rejects(()=>c.group.steer(room.id,source.id,'Hijack task'),/Only/);await a.group.steer(room.id,source.id,'Use the email flow, preserve OAuth');release();await b.group.wait();
 assert.equal(requests.length,2);assert.ok(requests[1].messages.some(m=>m.role==='user'&&m.content.includes('preserve OAuth')));const history=(await b.store.getSession((await b.store.records('events',{type:'group_local_run'}))[0].sessionId)).messages;assert.equal(history.filter(m=>m.steeringId).length,1);await runtime.close();
}));

test('personal steering preserves current tool receipts before a new model turn',()=>peers(1,async({people})=>{
 const {store,project}=people[0],session=await store.createSession({projectId:project.id}),bodies=[];let entered,release;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const runtime=createRuntime({store,models,fetch:async(url,options)=>{bodies.push(JSON.parse(options.body));if(bodies.length===1){entered();await gate;return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'inspect',type:'function',function:{name:'list_files',arguments:'{}'}}]}}],usage:{}}));}return reply('Updated');}});
 const pending=runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',mode:'plan',message:'Inspect'});await started;await runtime.steer({sessionId:session.id,content:'Focus on accessibility'});release();const result=await pending;assert.equal(result.error,undefined);assert.equal(bodies.length,2);assert.ok(bodies[1].messages.find(m=>m.role==='tool'&&m.tool_call_id==='inspect'));assert.ok(bodies[1].messages.find(m=>m.content==='Focus on accessibility'));await assert.rejects(()=>runtime.steer({sessionId:session.id,content:'Late'}),/No active/);await runtime.close();
}));

test('scope conflicts, mismatched baselines and private paths block Build configuration',()=>peers(2,async({people,room})=>{
 const [a,b]=people;for(const p of people){await git(p.project.path,['init']);await writeFile(path.join(p.project.path,'README.md'),'Shared baseline');await git(p.project.path,['add','README.md']);await git(p.project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']);}
 await a.group.configure(room.id,{...config,mode:'build',scope:['src/login']});await assert.rejects(()=>b.group.configure(room.id,{...config,mode:'build',scope:['src/Login/form.ts']}),/overlapping/);
 for(const bad of ['../escape','Private/key','.env','src/*','C:/outside'])assert.throws(()=>groupScopes([bad]));
 await writeFile(path.join(b.project.path,'README.md'),'Different baseline');await git(b.project.path,['add','README.md']);await git(b.project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','different']);await assert.rejects(()=>b.group.configure(room.id,{...config,mode:'build',scope:['src/checkout']}),/different Git bases/);
 const workspace=(await a.store.record('rooms',room.id)).group.workspace;assert.ok(workspace.path.includes('worktrees'));assert.equal(await readFile(path.join(workspace.path,'README.md'),'utf8'),'Shared baseline');
}));

test('pulling room context into a personal tab requires an explicit scoped import',()=>peers(2,async({people,room})=>{
 const [a,b]=people;await a.group.send(room.id,'Public interface contract');const session=await b.store.createSession({projectId:b.project.id});assert.equal((await b.store.getSession(session.id)).messages.length,0);assert.equal(await b.group.pullContext(room.id,session.id),1);assert.match((await b.store.getSession(session.id)).messages[0].content,/Public interface contract/);const other=await b.store.createProject({name:'Other',path:path.join(b.project.path,'other')});const wrong=await b.store.createSession({projectId:other.id});await assert.rejects(()=>b.group.pullContext(room.id,wrong.id),/mismatch/);
}));

test('revoked members and assistant mentions cannot launch an opted-in agent',()=>peers(2,async({people,room})=>{
 const [a,b]=people;let calls=0;b.group=groupChat(b.store,b.client,{runtime:{chat:async()=>{calls++;return {content:'unexpected'};}}});await b.group.configure(room.id,config);await a.client.post(room.id,{type:'message',groupSchema:1,role:'assistant',content:'@apex run',invocation:{target:b.memberId}});await b.group.tick(room.id);await b.group.wait();assert.equal(calls,0);await a.group.send(room.id,'@apex do not start after revocation',{target:b.memberId});await a.client.revoke(room.id,b.memberId);await assert.rejects(()=>b.group.tick(room.id),/token|revoked|member/i);assert.equal(calls,0);
}));

test('source changes cross profiles through reviewed snapshots, preserve conflicts and retain backups',()=>peers(2,async({people,room})=>{
 const [a,b]=people;await git(a.project.path,['init']);await writeFile(path.join(a.project.path,'README.md'),'baseline\n');await mkdir(path.join(a.project.path,'src/login'),{recursive:true});await writeFile(path.join(a.project.path,'src/login/legacy.ts'),'export const legacy = true;\n');await writeFile(path.join(a.project.path,'shared.ts'),'Public shared source');await mkdir(path.join(a.project.path,'sharedDir'));await writeFile(path.join(a.project.path,'sharedDir/public.ts'),'Public source');await git(a.project.path,['add','.']);await git(a.project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']);
 await git(b.project.path,['-c','protocol.file.allow=always','clone',a.project.path,'.']);
 await a.group.configure(room.id,{...config,mode:'build',scope:['src/login']});await b.group.configure(room.id,{...config,mode:'build',scope:['src/checkout']});const workspace=(await a.store.record('rooms',room.id)).group.workspace;await mkdir(path.join(workspace.path,'src/login'),{recursive:true});await writeFile(path.join(workspace.path,'src/login/form.ts'),'export const login = true;\n');
 await writeFile(path.join(workspace.path,'src/login/legacy.ts'),'export const legacy = false;\n');const bundle=await a.group.snapshot(room.id);await a.group.publishChanges(room.id,bundle);const board=await b.group.view(room.id),change=board.changes[0];assert.ok(change);assert.equal((await readFile(path.join(b.project.path,'README.md'),'utf8')).replaceAll('\r\n','\n'),'baseline\n');
 const preview=await b.group.previewChanges(room.id,change.id);await assert.rejects(()=>b.group.applyChanges(room.id,change.id,'stale'),/changed after preview/);const applied=await b.group.applyChanges(room.id,change.id,preview.bundleHash);assert.equal(await readFile(path.join(b.project.path,'src/login/form.ts'),'utf8'),'export const login = true;\n');assert.ok((await readFile(path.join(applied.backup,'receipt.json'),'utf8')).includes(preview.bundleHash));
 const ownPreview=await b.group.previewChanges(room.id,change.id,{workspace:true});await b.group.applyChanges(room.id,change.id,ownPreview.bundleHash,{workspace:true});assert.match(await readFile(path.join(ownPreview.destination,'src/login/legacy.ts'),'utf8'),/false/);
 await writeFile(path.join(b.project.path,'src/login/form.ts'),'local edit\n');await assert.rejects(()=>b.group.previewChanges(room.id,change.id),/Local conflict preserved/);assert.equal(await readFile(path.join(b.project.path,'src/login/form.ts'),'utf8'),'local edit\n');
 await writeFile(path.join(workspace.path,'src/login/form.ts'),'changed after approval');await assert.rejects(()=>a.group.publishChanges(room.id,bundle),/changed after preview/);await symlink(path.join(workspace.path,'sharedDir'),path.join(workspace.path,'src/login/alias'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>a.group.snapshot(room.id),/Canonical write path escapes/);
}));

test('personal and shared tabs isolate drafts, pasted content and input history across switches',async()=>{
 const input=new PassThrough(),output=new PassThrough();input.setRawMode=()=>{};output.columns=100;const ui=new TerminalUI(input,output);
 try{ui.setChatChannel('personal');const first=ui.question('',{history:true});ui.insertPaste('Private\nnever shared');const privateDraft=ui.expanded();ui.setChatChannel('group');assert.equal(ui.active.text,'');assert.equal(ui.history.length,0);ui.key('Hello group',{});ui.key('',{name:'return'});assert.equal(await first,'Hello group');const next=ui.question('',{history:true});ui.setChatChannel('personal');assert.equal(ui.expanded(),privateDraft);assert.equal(ui.history.length,0);ui.key('',{name:'return'});assert.equal(await next,privateDraft);ui.setChatChannel('group');assert.deepEqual(ui.history,['Hello group']);}finally{ui.close();input.destroy();output.destroy();}
});

test('encrypted room credentials cache only identical ciphertext and never expose mutable cached objects',()=>peers(1,async({root})=>{
 let decrypts=0;const options={encrypt:async s=>'encrypted:'+Buffer.from(s).toString('base64'),decrypt:async s=>{decrypts++;return Buffer.from(s.slice(10),'base64').toString();}},home=path.join(root,'cache'),first=roomSecrets(home,options),other=roomSecrets(home,options);await first.set('room',{token:'fixture',key:'first'});const value=await first.get('room');value.key='mutated';assert.equal((await first.get('room')).key,'first');assert.equal(decrypts,0);await other.set('room',{token:'fixture',key:'changed'});assert.equal((await first.get('room')).key,'changed');assert.equal(decrypts,1);await first.get('room');assert.equal(decrypts,1);await other.remove('room');assert.equal(await first.get('room'),null);
}));

test('login and checkout agents write separate worktrees, reject cross-scope writes and exclude private context',()=>peers(2,async({people,room})=>{
 const [a,b]=people;await git(a.project.path,['init']);await writeFile(path.join(a.project.path,'README.md'),'Shared');await git(a.project.path,['add','README.md']);await git(a.project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']);await git(b.project.path,['-c','protocol.file.allow=always','clone',a.project.path,'.']);
 const bodies=[];
 for(const [i,p] of people.entries()){
  const scope=i?'src/checkout':'src/login',other=i?'src/login':'src/checkout';await p.store.addMemory({projectId:p.project.id,text:'PRIVATE_AGENT_MEMORY',visibility:'private'});await p.store.saveAgent({id:'private-'+i,projectId:p.project.id,name:'PRIVATE_TEAM_NAME',role:'Personal work',goal:'PRIVATE_GOAL'});let runtime;
  runtime=createRuntime({store:p.store,models,emit:e=>{if(e.type==='approval')queueMicrotask(()=>runtime.approve({id:e.id,approved:true}));},fetch:async(url,options)=>{
   const body=JSON.parse(options.body);bodies.push(body);if(body.messages.some(m=>m.role==='tool'))return reply('Implemented '+scope);
   const calls=[['write_file',{path:scope+'/index.ts',content:'export const owned = true;\n'}],['write_file',{path:other+'/intrusion.ts',content:'forbidden'}],['memory_save',{text:'forbidden private access'}],['team_status',{}]].map(([name,args],j)=>({id:'call'+j,type:'function',function:{name,arguments:JSON.stringify(args)}}));return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Working',tool_calls:calls}}],usage:{prompt_tokens:10,completion_tokens:10}}));
  }});p.runtime=runtime;p.group=groupChat(p.store,p.client,{runtime});await p.group.configure(room.id,{...config,mode:'build',scope:[scope]});
 }
 for(const p of people)await a.group.send(room.id,'@apex implement your owned component',{target:p.memberId});await Promise.all(people.map(p=>p.group.tick(room.id)));await Promise.all(people.map(p=>p.group.wait()));
 for(const [i,p] of people.entries()){const workspace=(await p.store.record('rooms',room.id)).group.workspace,scope=i?'src/checkout':'src/login',other=i?'src/login':'src/checkout';assert.match(await readFile(path.join(workspace.path,scope,'index.ts'),'utf8'),/owned/);await assert.rejects(()=>readFile(path.join(workspace.path,other,'intrusion.ts')),/ENOENT/);await assert.rejects(()=>readFile(path.join(p.project.path,scope,'index.ts')),/ENOENT/);}
 assert.ok(bodies.some(body=>JSON.stringify(body).includes('outside assigned ownership')));assert.ok(!JSON.stringify(bodies).includes('PRIVATE_AGENT_MEMORY'));assert.ok(!JSON.stringify(bodies).includes('PRIVATE_TEAM_NAME'));assert.ok(!JSON.stringify(bodies).includes('PRIVATE_GOAL'));
}));

test('lost result acknowledgment republishes the same encrypted event without rerunning inference',()=>peers(2,async({people,room})=>{
 const [a,b]=people;let calls=0,lost=false;const client={...b.client,async post(id,value,options){const result=await b.client.post(id,value,options);if(value.type==='group_run'&&value.status==='complete'&&!lost){lost=true;throw Error('Fixture dropped response after hub stored result');}return result;}};
 b.group=groupChat(b.store,client,{runtime:{chat:async()=>{calls++;return {content:'Saved once'};}}});await b.group.configure(room.id,config);await a.group.send(room.id,'@apex inspect once',{target:b.memberId});await b.group.tick(room.id);await b.group.wait();let row=(await b.store.records('events',{type:'group_local_run'}))[0];assert.equal(row.publication.acknowledged,false);await b.group.tick(room.id);await b.group.wait();row=(await b.store.records('events',{type:'group_local_run'}))[0];assert.equal(row.publication.acknowledged,true);assert.equal(calls,1);assert.equal((await a.group.view(room.id)).messages.filter(e=>e.data.content==='Saved once').length,1);
}));
