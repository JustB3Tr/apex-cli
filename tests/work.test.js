import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createStore} from '../server/store.js';
import {createHub} from '../server/hub.js';
import {roomClient} from '../server/rooms.js';
import {collaboration,reduceCollaboration,claimPath} from '../server/collaboration.js';
import {projectPassport,exportPassport,importPassport,validatePassport,passportPrompt} from '../server/passport.js';
import {integrations} from '../server/integrations.js';
import {rehearseCollaboration} from '../server/rehearsal.js';
import {dashboardRows} from '../cli/dashboard.js';
import {createMcpManager} from '../server/runtime/mcp.js';
import {mcpMarketplace,catalogRecipe} from '../server/mcp-catalog.js';
import {extensionManager} from '../server/extensions.js';
import {createRuntime} from '../server/runtime/index.js';
import {captureAccountBackup,restoreAccountBackup} from '../server/account-backup.js';
import {localVault} from '../server/vault.js';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-work-'));try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Fixture',path:path.join(root,'project')});await fn({root,store,project});}finally{await rm(root,{recursive:true,force:true});}}
async function peers(fn){return fixture(async base=>{const hub=await createHub({home:path.join(base.root,'hub'),bootstrapToken:'fixture-admin'});try{const people=[];for(const name of ['Alice','Bob','Carol']){const {store}=await createStore(path.join(base.root,name,'state')),project=await store.createProject({name,path:path.join(base.root,name,'project')}),secrets=new Map(),client=roomClient(store,{secrets:{get:async id=>secrets.get(id),set:async(id,v)=>secrets.set(id,v),remove:async id=>secrets.delete(id)}});await store.writeSettings({identity:{name},vaultPreference:'disabled'});people.push({store,project,client,work:collaboration(store,client)});}const [a,b,c]=people,room=await a.client.create(a.project.id,hub.endpoint,hub.bootstrapToken,'Fixture');for(const person of [b,c])await person.client.join(person.project.id,await a.client.invite(room.id));for(const p of people)p.memberId=(await p.client.membership(room.id)).memberId;await fn({a,b,c,room,hub,...base});}finally{await hub.close();}});}

test('chat forks snapshot exact lineage and complete tool receipts without double-counting usage',()=>fixture(async({store,project})=>{
 const parent=await store.createSession({projectId:project.id,title:'Original'});await store.appendMessage(parent.id,{id:'user',role:'user',content:'Inspect'});await store.appendMessage(parent.id,{id:'assistant',role:'assistant',content:'',tool_calls:[{id:'call',type:'function',function:{name:'read_file',arguments:'{}'}}],usage:{model:'fixture',inputTokens:100,outputTokens:10,cost:.01}});await store.appendMessage(parent.id,{id:'tool',role:'tool',tool_call_id:'call',content:'observed'});
 const child=await store.forkSession(parent.id,{title:'Alternative'});assert.equal(child.fork.parentId,parent.id);assert.equal(child.messages.length,3);assert.equal(child.messages[2].tool_call_id,'call');assert.notEqual(child.messages[0].id,'user');assert.equal(child.messages[1].usage.inherited,true);
 assert.match(dashboardRows({messages:child.messages,model:'fixture'})[0].text,/unknown/);await store.appendMessage(child.id,{role:'user',content:'Different direction'});assert.equal((await store.getSession(parent.id)).messages.length,3);
 const early=await store.forkSession(parent.id,{messageId:'user'});assert.equal(early.messages.length,1);await assert.rejects(()=>store.forkSession(parent.id,{messageId:'missing'}),/Choose a message/);
}));

test('task negotiation binds human actors and exact versions through delivery acknowledgment',()=>peers(async({a,b,c,room})=>{
 const task=await a.work.offer(room.id,{target:b.memberId,goal:'Review parser',maxUSD:0,files:['src/parser.ts']});
 await assert.rejects(()=>c.work.task(room.id,task.id,'accept'),/recipient/);
 await b.work.task(room.id,task.id,'counter',{terms:{acceptance:'Include edge cases'}});
 await assert.rejects(()=>b.work.task(room.id,task.id,'accept'),/sender must accept/);
 await assert.rejects(()=>b.work.task(room.id,task.id,'accept',{version:1,hash:task.hash}),/Stale/);
 await a.work.task(room.id,task.id,'confirm-counter');await b.work.task(room.id,task.id,'accept');
 await assert.rejects(()=>c.work.task(room.id,task.id,'deliver',{result:'Forged'}),/owner/);
 await b.work.task(room.id,task.id,'deliver',{result:'Observed code; tests not run',evidence:['src/parser.ts:12']});await a.work.task(room.id,task.id,'ack');
 const saved=(await b.work.view(room.id)).tasks[0];assert.equal(saved.status,'acknowledged');assert.equal(saved.version,2);assert.equal(saved.previous[0].hash,task.hash);assert.equal(saved.history.length,6);
}));

test('dependency cycles, cancelled tasks, forged actors and revoked members cannot trigger work',()=>peers(async({a,b,c,room})=>{
 const first=await a.work.offer(room.id,{target:b.memberId,goal:'First',maxUSD:0}),second=await a.work.offer(room.id,{target:b.memberId,goal:'Second',dependsOn:[first.id],maxUSD:0});
 await assert.rejects(()=>b.work.task(room.id,second.id,'accept'),/Dependencies/);
 await assert.rejects(()=>a.work.task(room.id,first.id,'counter',{terms:{dependsOn:[second.id]}}),/cyclic|dependency/);
 await a.work.task(room.id,first.id,'cancel');await assert.rejects(()=>b.work.task(room.id,first.id,'accept'),/recipient/);
 const forged={id:'forged',seq:1,sender:c.memberId,createdAt:new Date().toISOString(),data:{schema:1,type:'collaboration',kind:'task.offer',actor:a.memberId,entityId:randomUUID(),terms:{target:b.memberId,goal:'Fake',maxUSD:0}}};assert.match(reduceCollaboration([forged]).invalid[0].reason,/actor/);
 await a.client.revoke(room.id,b.memberId);await assert.rejects(()=>b.work.run(room.id,second.id,{model:'ollama:fixture'}),/revoked|HTTP|token/i);assert.equal((await b.store.records('jobs')).length,0);
}));

test('decision comments and superseding revisions preserve human ownership and old acceptance',()=>peers(async({a,b,room})=>{
 const vaultPath=path.join(b.project.path,'Notes');await localVault(vaultPath).init();await b.store.updateProject(b.project.id,{vaultPath});
 const proposed=await a.work.propose(room.id,{title:'Use explicit schema',rationale:'Avoid guessing',alternatives:['Loose text']});await b.work.decision(room.id,proposed.id,'comment',{comment:'What about migrations?'});
 await assert.rejects(()=>b.work.decision(room.id,proposed.id,'accept'),/owner/);await a.work.decision(room.id,proposed.id,'accept');await a.work.decision(room.id,proposed.id,'supersede',{terms:{rationale:'Version schema and migrations'}});
 let d=(await b.work.view(room.id)).decisions[0];assert.equal(d.status,'proposed');assert.equal(d.version,2);assert.equal(d.previous[0].status,'accepted');assert.equal(d.comments.length,1);
 await assert.rejects(()=>a.work.decision(room.id,proposed.id,'accept',{version:1,hash:proposed.hash}),/Stale/);await a.work.decision(room.id,proposed.id,'accept');d=(await a.work.view(room.id)).decisions[0];assert.equal(d.status,'accepted');
 await b.work.view(room.id);const notes=await localVault(vaultPath).search('Use explicit schema');assert.ok(notes.some(n=>n.text.includes('"status": "accepted"')));
}));

test('replicated task hashes do not depend on the receiving machine secret environment',()=>{
 const actor=randomUUID(),id=randomUUID(),events=[{id:'event',seq:1,sender:actor,createdAt:new Date().toISOString(),data:{schema:1,type:'collaboration',actor,entityId:id,kind:'task.offer',terms:{target:randomUUID(),goal:'A public phrase used in a regression fixture',maxUSD:0}}}];
 const first=reduceCollaboration(events).tasks[0],prior=process.env.APEX_REDUCER_TEST_SECRET;process.env.APEX_REDUCER_TEST_SECRET='A public phrase used in a regression fixture';try{const second=reduceCollaboration(events).tasks[0];assert.equal(second.hash,first.hash);assert.equal(second.terms.goal,first.terms.goal);}finally{if(prior===undefined)delete process.env.APEX_REDUCER_TEST_SECRET;else process.env.APEX_REDUCER_TEST_SECRET=prior;}
});

test('cross-person file/interface claims warn on overlap, expire, require owner release and preserve acknowledgments',()=>peers(async({a,b,room})=>{
 await a.work.claim(room.id,{resourceType:'file',resource:'src',hours:1});await b.work.claim(room.id,{resourceType:'file',resource:'src/parser.ts',hours:1});let state=await a.work.view(room.id);assert.equal(state.overlaps.length,1);assert.equal(state.overlaps[0].acknowledged,false);
 const [ac,bc]=state.overlaps[0].claims;await a.work.claimAction(room.id,bc,'ack');await b.work.claimAction(room.id,ac,'ack');state=await a.work.view(room.id);assert.equal(state.overlaps[0].acknowledged,true);await assert.rejects(()=>b.work.claimAction(room.id,ac,'release'),/owner/);
 const expired=reduceCollaboration(await a.store.records('events',{roomId:room.id,type:'room_event'}),{now:Date.now()+86400000});assert.equal(expired.overlaps.length,0);assert.ok(expired.claims.every(c=>!c.active));await a.work.claimAction(room.id,ac,'release');assert.equal((await a.work.view(room.id)).overlaps.length,0);
 for(const p of ['../x','.env','.git/config','C:/outside','src/*'])assert.throws(()=>claimPath(p));
}));

test('project passports explicitly select source and shared decisions, reject private paths and never execute imports',()=>fixture(async({root,store,project})=>{
 await writeFile(path.join(project.path,'public.ts'),'export const publicValue = 1;');await writeFile(path.join(project.path,'.env'),'SECRET=not-for-model');const session=await store.createSession({projectId:project.id});await store.appendMessage(session.id,{role:'user',content:'PRIVATE CHAT MUST NOT LEAK'});
 const packet=await projectPassport(store,project.id,{files:['public.ts']});assert.equal(packet.files.length,1);assert.ok(!JSON.stringify(packet).includes('PRIVATE CHAT'));assert.match(passportPrompt(packet),/untrusted reference/);
 await assert.rejects(()=>projectPassport(store,project.id,{files:['.env']}),/Sensitive|Private/);await assert.rejects(()=>projectPassport(store,project.id,{files:['../state/state.json']}),/escapes/);
 const file=path.join(root,'passport.json');await exportPassport(packet,file);await assert.rejects(()=>exportPassport(packet,file),e=>e.code==='EEXIST');const imported=await importPassport(store,project.id,file);assert.equal(imported.untrusted,true);assert.equal((await store.getSession(session.id)).messages.length,1);
 assert.throws(()=>validatePassport({...packet,policy:{...packet.policy,permissionGrants:['shell']}}),/cannot grant/);const modified=structuredClone(packet);modified.files[0].content='tampered';assert.throws(()=>validatePassport(modified),/hash/);
 const outside=path.join(root,'outside');await mkdir(outside);await writeFile(path.join(outside,'private.txt'),'outside');await symlink(outside,path.join(project.path,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>projectPassport(store,project.id,{files:['escape/private.txt']}),/Symlink/);
}));

test('GitHub integration pins repositories, preserves literal body files, creates only draft PRs and never retries unknown sends',()=>fixture(async({store,project})=>{
 const calls=[];let fail=false;const service=integrations(store,{run:async(name,args)=>{calls.push({name,args});if(args[0]==='repo')return {stdout:JSON.stringify({nameWithOwner:'owner/repo',url:'https://github.com/owner/repo'})};if(args.includes('create')){const file=args[args.indexOf('--body-file')+1];assert.equal(await readFile(file,'utf8'),'Line 1\n$(not-a-command)');if(fail)throw Error('Read timeout after send');return {stdout:'https://github.com/owner/repo/pull/1\n'};}return {stdout:'[]'};}});
 await service.githubConnect(project.id,'owner/repo');const input={title:'Literal title',body:'Line 1\n$(not-a-command)',head:'feature',base:'master',confirmTarget:'owner/repo'};
 await assert.rejects(()=>service.github(project.id,'pr-create',{...input,confirmTarget:'other/repo'}),/Confirm exact/);await service.github(project.id,'pr-create',input);const args=calls.at(-1).args;assert.ok(args.includes('--draft'));assert.ok(args.includes('--head'));assert.ok(!args.includes('--body'));assert.equal(args[args.indexOf('--repo')+1],'owner/repo');
 fail=true;await assert.rejects(()=>service.github(project.id,'issue-create',input),/may have run/);const before=calls.length;await assert.rejects(()=>service.github(project.id,'issue-create',input),/Unresolved/);assert.equal(calls.length,before);const pending=(await service.status(project.id)).actions.find(e=>e.data.state==='unknown');await service.reconcile(project.id,'github',pending.id,'Checked GitHub manually; no issue exists');assert.equal((await service.status(project.id)).actions.at(-1).data.state,'reconciled');
}));

test('Vercel integration stops on local/remote target drift and exposes preview without production flags',()=>fixture(async({store,project})=>{
 await mkdir(path.join(project.path,'.vercel'));const file=path.join(project.path,'.vercel','project.json');await writeFile(file,JSON.stringify({projectId:'prj_fixture',orgId:'team_fixture'}));let mismatch=false;const calls=[];
 const service=integrations(store,{run:async(name,args)=>{calls.push(args);if(args[0]==='project')return {stdout:JSON.stringify({id:mismatch?'prj_wrong':'prj_fixture',accountId:'team_fixture',name:'fixture'})};return {stdout:'https://fixture.vercel.app\n'};}});
 await service.vercelConnect(project.id);await assert.rejects(()=>service.vercel(project.id,'preview',{confirmTarget:'wrong'}),/Confirm exact/);await service.vercel(project.id,'preview',{confirmTarget:'prj_fixture@team_fixture'});assert.ok(calls.at(-1).includes('--scope'));assert.ok(!calls.at(-1).some(v=>v==='--prod'||v==='--production'));
 mismatch=true;await assert.rejects(()=>service.vercel(project.id,'preview',{confirmTarget:'prj_fixture@team_fixture'}),/does not match/);assert.equal(calls.filter(c=>c[0]==='deploy').length,1);await writeFile(file,JSON.stringify({projectId:'prj_changed',orgId:'team_fixture'}));await assert.rejects(()=>service.vercel(project.id,'inspect'),/link changed/);
}));

test('two-person rehearsal exercises real Git/HTTP, task execution/ack, decisions, overlap and passport at zero paid cost',()=>fixture(async({root})=>{
 const report=await rehearseCollaboration(path.join(root,'rehearsal'));assert.equal(report.task,'acknowledged');assert.equal(report.decision,'accepted');assert.equal(report.observedFile,true);assert.equal(report.overlapsAcknowledged,true);assert.equal(report.paidCalls,0);assert.equal(report.fixtureCalls,2);assert.equal(validatePassport(JSON.parse(await readFile(report.passport,'utf8'))).tasks[0].status,'acknowledged');
}));

test('bundled services/work plugins install as inert skills and services MCP performs real stdio discovery',()=>fixture(async({store,project})=>{
 const extensions=extensionManager(store.home);await extensions.addMarket('builtin');
 for(const plugin of ['apex-work','apex-services']){const inspected=await extensions.inspect(plugin+'@apex-official',project);const installed=await extensions.install(inspected.id,project,inspected);assert.equal(installed.executedHooks,false);}
 assert.ok((await extensions.skills(project)).some(s=>s.id==='apex-services:service-workflows'));
 const manager=createMcpManager(store.home);try{
  const config=await manager.add(catalogRecipe(mcpMarketplace(store.home).inspect('apex-services'),{home:store.home,project}));await manager.connect(config.id);
  assert.ok(manager.tools(project.id).some(t=>t.name==='github_create_draft_pr'));assert.ok(manager.tools(project.id).some(t=>t.name==='vercel_deploy_preview'));
  const status=JSON.parse((await manager.call(config.id,'integration_status',{})).content[0].text);assert.deepEqual(status.connected,{});assert.ok(!JSON.stringify(status).includes('auth-token'));
  assert.equal((await manager.call(config.id,'github_read',{action:'issues'})).isError,true);
  const projectConfig=await manager.add(catalogRecipe(mcpMarketplace(store.home).inspect('apex-project'),{home:store.home,project}));await manager.connect(projectConfig.id);assert.ok((await manager.resources(projectConfig.id)).resources.some(r=>r.uri==='apex://project/passport'));
  const packet=JSON.parse((await manager.call(projectConfig.id,'project_passport',{files:[],taskIds:[],decisionIds:[]})).content[0].text);assert.equal(packet.type,'apex-project-passport');assert.equal(packet.files.length,0);
 }finally{await manager.close();}
}));

test('external cancellation before a task turn prevents inference and preserves an explicit stopped receipt',()=>fixture(async({store,project})=>{
 const session=await store.createSession({projectId:project.id}),signal=new AbortController();signal.abort();let sends=0;const runtime=createRuntime({store,models:[{id:'ollama:fixture'}],fetch:async()=>{sends++;throw Error('Must not send');}});
 try{const result=await runtime.chat({signal:signal.signal,projectId:project.id,sessionId:session.id,message:'Inspect',model:'ollama:fixture',mode:'plan'});assert.match(result.error,/Cancelled/);assert.equal(sends,0);}finally{await runtime.close();}
}));

test('account backups preserve fork lineage and inherited usage without restoring executable tool state',()=>fixture(async({root,store,project})=>{
 const parent=await store.createSession({projectId:project.id,title:'Parent'});await store.appendMessage(parent.id,{id:'original-user',role:'user',content:'A question'});await store.appendMessage(parent.id,{role:'assistant',content:'A reply',usage:{model:'fixture',inputTokens:50,outputTokens:10,cost:.01}});await store.forkSession(parent.id,{title:'Child'});
 const backup=await captureAccountBackup(store),target=(await createStore(path.join(root,'restored-state'))).store;
 await restoreAccountBackup(target,backup,{basePath:path.join(root,'restored-projects'),accountId:'fixture-account'});const restoredProject=(await target.listProjects())[0],sessions=await target.listSessions(restoredProject.id),child=sessions.find(s=>s.title==='Child'),source=sessions.find(s=>s.title==='Parent');
 assert.equal(child.fork.parentId,source.id);const messages=(await target.getSession(child.id)).messages;assert.equal(messages.find(m=>m.usage).usage.inherited,true);assert.ok(messages.every(m=>!m.tool_calls));
}));
