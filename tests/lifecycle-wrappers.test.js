import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createHub} from '../server/hub.js';
import {roomClient} from '../server/rooms.js';
import {groupChat} from '../server/group-chat.js';
import {peerPool} from '../server/pool.js';
import {experiments} from '../server/experiments.js';
import {createRuntime} from '../server/runtime/index.js';
import {attention} from '../server/attention.js';
import {jobs} from '../server/jobs.js';
import {executeWorker} from '../server/worker.js';
import {git} from '../server/git-project.js';

const model='openai:fixture',models=[{id:model,provider:'openai',inputPrice:.00000001,outputPrice:.00000001}],options={models,getCredential:async()=>'fixture-only'};
const reply=(content='',question)=>Response.json({choices:[{message:{role:'assistant',content,...(question?{tool_calls:[{id:'question-'+question,type:'function',function:{name:'ask_user',arguments:JSON.stringify({question})}}]}:{})}}],usage:{cost:.01,prompt_tokens:10,completion_tokens:5}});
async function reviewedJob(store,projectId,jobId){
 const api=attention(store),q=(await api.list(projectId)).find(q=>q.jobId===jobId&&q.status==='open');assert.ok(q,'an exact current human question must exist');
 await api.answer(projectId,q.id,{version:q.version,hash:q.hash,answer:'Use the existing project convention'});
 return api.resume(projectId,q.id,{version:q.version,hash:q.hash});
}
async function continueRuntime(runtime,store,job){
 const continuation=job.attentionContinuation,result=await runtime.chat({projectId:job.projectId,sessionId:job.sessionId,jobId:job.id,model:job.model,mode:job.mode,workingPath:continuation.sourceRoot,contextPolicy:continuation.execution.contextPolicy,groupRestricted:continuation.execution.groupRestricted,agent:continuation.execution.agent,agentId:continuation.execution.agent?.id,message:'Continue saved work after explicit human review'});
 if(!result.parked)await jobs(store).finish(job.id,result.error?'failed':'complete',result.content||result.error);return result;
}
async function fixture(fn,{repo=false}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-lifecycle-')),people=[];let hub;
 try{
  hub=await createHub({home:path.join(root,'hub'),bootstrapToken:'fixture-only'});
  for(const name of ['sender','owner']){
   const {store}=await createStore(path.join(root,name)),project=await store.createProject({name,path:path.join(root,name+'-project')}),secrets=new Map(),client=roomClient(store,{secrets:{get:async id=>secrets.get(id),set:async(id,value)=>secrets.set(id,value),remove:async id=>secrets.delete(id)}});
   await store.writeSettings({identity:{name},vaultPreference:'disabled'});await writeFile(path.join(project.path,'source.txt'),'Fixture source\n');people.push({store,project,client});
  }
  const [sender,owner]=people,room=await sender.client.create(sender.project.id,hub.endpoint,hub.bootstrapToken,'Lifecycle fixture');await owner.client.join(owner.project.id,await sender.client.invite(room.id));
  for(const p of people)p.memberId=(await p.client.membership(room.id)).memberId;
  if(repo){await git(owner.project.path,['init']);await git(owner.project.path,['add','.']);await git(owner.project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture baseline']);}
  await fn({root,sender,owner,room});
 }finally{for(const p of people){await p.group?.close();await p.runtime?.close();}await hub?.close();await rm(root,{recursive:true,force:true});}
}

test('group clarification keeps the whole allowance through repeated parks, explicit continuations and lost publication acknowledgments',()=>fixture(async({sender,owner,room})=>{
 let calls=0,lost=false;const posted=[],client={...owner.client,post:async(...args)=>{posted.push(args);const result=await owner.client.post(...args);if(args[1].status==='waiting_human'&&!lost){lost=true;throw Error('Fixture lost acknowledgment after delivery');}return result;}};
 owner.runtime=createRuntime({store:owner.store,...options,fetch:async()=>{calls++;return calls<3?reply('',calls===1?'Which interface?':'Which error convention?'):reply('Human-reviewed group result');}});
 owner.group=groupChat(owner.store,client,{runtime:owner.runtime});const senderGroup=groupChat(sender.store,sender.client);
 await owner.group.configure(room.id,{enabled:true,model,mode:'plan',maxUSD:.4,turnUSD:.2,multiAgent:true});await senderGroup.send(room.id,'@apex inspect this source',{target:owner.memberId});await owner.group.tick(room.id);await owner.group.wait();
 let row=(await owner.store.records('events',{type:'group_local_run'}))[0];assert.equal(row.status,'waiting_human',row.result);assert.equal(row.fundingSettled,undefined);assert.equal(calls,1);
 let pool=(await owner.store.record('rooms',room.id)).group;assert.equal(pool.reservedUSD,.2);assert.equal(pool.spentUSD,0);
 await owner.group.tick(room.id);await owner.group.tick(room.id);let board=await senderGroup.view(room.id);assert.equal(board.runs[0].status,'waiting_human');assert.ok(Math.abs(board.agents[0].reservedUSD+board.agents[0].spentUSD-.2)<1e-9);assert.equal(calls,1);
 const firstPark=posted.filter(args=>args[1].status==='waiting_human');assert.equal(firstPark.length,2);assert.equal(firstPark[0][2].id,firstPark[1][2].id);assert.equal(board.messages.filter(m=>m.data.status==='waiting_human').length,1);
 await owner.group.close();owner.group=groupChat(owner.store,client,{runtime:owner.runtime});await owner.group.tick(room.id);assert.equal(calls,1);
 let job=await reviewedJob(owner.store,owner.project.id,row.jobId);await owner.group.tick(room.id);assert.equal((await senderGroup.view(room.id)).runs[0].status,'running');assert.equal((await owner.store.record('rooms',room.id)).group.reservedUSD,.2);
 assert.equal((await continueRuntime(owner.runtime,owner.store,job)).parked,true);await owner.group.tick(room.id);assert.equal((await senderGroup.view(room.id)).runs[0].status,'waiting_human');assert.equal(calls,2);assert.equal((await owner.store.record('rooms',room.id)).group.reservedUSD,.2);
 job=await reviewedJob(owner.store,owner.project.id,row.jobId);await owner.group.tick(room.id);assert.equal((await continueRuntime(owner.runtime,owner.store,job)).content,'Human-reviewed group result');await owner.group.tick(room.id);await owner.group.tick(room.id);
 row=await owner.store.record('events',row.id);pool=(await owner.store.record('rooms',room.id)).group;board=await senderGroup.view(room.id);assert.equal(row.status,'complete');assert.equal(row.fundingSettled,true);assert.equal(pool.reservedUSD,0);assert.ok(Math.abs(pool.spentUSD-.03)<1e-9);assert.equal(calls,3);assert.equal(board.messages.filter(m=>m.data.status==='complete').length,1);assert.equal(board.runs[0].content,'Human-reviewed group result');assert.ok(row.publications.every(p=>p.acknowledged));await senderGroup.close();
}));

test('peer workers keep their funding hold until explicitly resumed saved work actually ends, and settle once across restarts',()=>fixture(async({sender,owner,room})=>{
 const source=peerPool(sender.store,sender.client);let target=peerPool(owner.store,owner.client),calls=0;const runtimeOptions={...options,fetch:async()=>{calls++;return calls<3?reply('',calls===1?'Which output format?':'Which naming convention?'):reply('Peer task finished');}};
 await target.configure(room.id,{enabled:true,model,maxUSD:.3});const offer=await source.offer(room.id,{target:owner.memberId,goal:'Inspect this project',maxUSD:.2}),first=await target.accept(room.id,offer.taskId,runtimeOptions);assert.equal(first.result.parked,true,first.result.error);assert.equal(first.receipt.status,'waiting_human');assert.equal((await owner.store.record('rooms',room.id)).pool.reservedUSD,.2);assert.equal((await owner.store.record('rooms',room.id)).pool.spentUSD,0);
 await target.inbox(room.id);await target.inbox(room.id);assert.equal(calls,1);await assert.rejects(()=>target.accept(room.id,offer.taskId,runtimeOptions),/already accepted/);await target.reconcile(room.id);assert.equal((await owner.store.record('rooms',room.id)).pool.reservedUSD,.2);
 await reviewedJob(owner.store,owner.project.id,first.jobId);assert.equal((await executeWorker(owner.store.home,first.jobId,runtimeOptions)).parked,true);await target.inbox(room.id);assert.equal((await owner.store.record('rooms',room.id)).pool.reservedUSD,.2);assert.equal((await owner.store.record('jobs',first.jobId)).poolReportedStatus,'waiting_human');assert.equal(calls,2);
 await reviewedJob(owner.store,owner.project.id,first.jobId);assert.equal((await executeWorker(owner.store.home,first.jobId,runtimeOptions)).content,'Peer task finished');target=peerPool(owner.store,owner.client);await target.inbox(room.id);await target.reconcile(room.id);await target.reconcile(room.id);
 const pool=(await owner.store.record('rooms',room.id)).pool,job=await owner.store.record('jobs',first.jobId);assert.equal(pool.reservedUSD,0);assert.ok(Math.abs(pool.spentUSD-.03)<1e-9);assert.equal(job.poolSettled,true);assert.equal(calls,3);
 const reports=(await source.inbox(room.id)).filter(e=>e.data.type==='task_result'&&e.data.taskId===offer.taskId);assert.equal(reports.at(-1).data.status,'complete');assert.equal(reports.filter(e=>e.data.status==='complete').length,1);assert.equal(reports.filter(e=>e.data.status==='waiting_human').length,2);
}));

test('implementation comparisons retain waiting evidence and reserved budgets, then reconcile explicit continuations without running the other approach',()=>fixture(async({owner})=>{
 let calls=0;owner.runtime=createRuntime({store:owner.store,...options,fetch:async()=>{calls++;return calls<3?reply('',calls===1?'Which API contract?':'Which compatibility target?'):reply('Selected implementation reviewed');}});
 const api=experiments(owner.store,{runtime:owner.runtime}),comparison=await api.comparison(owner.project.id,{title:'Human-reviewed alternatives',acceptance:'exit 0',totalUSD:.4,alternatives:['A','B'].map(label=>({label,instructions:'Inspect the selected implementation',model,maxUSD:.2,scope:['source.txt']}))}),selected=comparison.data.alternatives[0],plan=await api.comparisonPlan(owner.project.id,comparison.id,selected.id,'implement');
 const first=await api.runComparison(owner.project.id,plan.id,plan.data.hash,{approved:true});assert.equal(first.status,'waiting_human',first.result.error);assert.equal(first.result.parked,true);assert.equal(first.funding.reservedUSD,.2);assert.equal((await owner.store.record('events',plan.id)).data.runState,'waiting_human');await api.compare(owner.project.id,comparison.id);await api.compare(owner.project.id,comparison.id);assert.equal(calls,1);
 let job=await reviewedJob(owner.store,owner.project.id,first.jobId);let report=await api.compare(owner.project.id,comparison.id);assert.equal(report.alternatives[0].runs[0].status,'running');assert.equal(report.alternatives[0].runs[0].funding.reservedUSD,.2);assert.equal((await continueRuntime(owner.runtime,owner.store,job)).parked,true);
 report=await api.compare(owner.project.id,comparison.id);assert.equal(report.alternatives[0].runs[0].status,'waiting_human');assert.equal(report.alternatives[0].runs[0].funding.status,'reserved');assert.equal(report.alternatives[1].runs.length,0);assert.equal(calls,2);
 job=await reviewedJob(owner.store,owner.project.id,first.jobId);await continueRuntime(owner.runtime,owner.store,job);report=await api.compare(owner.project.id,comparison.id);const finished=report.alternatives[0].runs[0];assert.equal(finished.status,'complete');assert.equal(finished.result.content,'Selected implementation reviewed');assert.equal(finished.result.parked,undefined);assert.equal(finished.funding.reservedUSD,0);assert.ok(Math.abs(finished.funding.committedUSD-.03)<1e-9);assert.equal(report.alternatives[0].checkStatus,'unknown');assert.equal(report.alternatives[1].runs.length,0);assert.equal((await owner.store.record('events',plan.id)).data.runState,'complete');await api.compare(owner.project.id,comparison.id);await assert.rejects(()=>api.runComparison(owner.project.id,plan.id,plan.data.hash,{approved:true}),/already started/);assert.equal(calls,3);
},{repo:true}));

test('a peer send with unknown billing is never replayed and reconciled actual cost updates the original settlement only',()=>fixture(async({sender,owner,room})=>{
 const source=peerPool(sender.store,sender.client),target=peerPool(owner.store,owner.client);await target.configure(room.id,{enabled:true,model,maxUSD:.3});const offer=await source.offer(room.id,{target:owner.memberId,goal:'Inspect without retries',maxUSD:.2});let calls=0;
 const first=await target.accept(room.id,offer.taskId,{...options,fetch:async()=>{calls++;throw Error('Fixture connection lost after send');}});assert.equal(first.receipt.status,'needs_attention',first.result.error);assert.ok(first.receipt.heldUSD>0);await target.inbox(room.id);await target.reconcile(room.id);await assert.rejects(()=>target.accept(room.id,offer.taskId,{...options,fetch:async()=>{calls++;return reply('Forbidden replay');}}),/already accepted/);assert.equal(calls,1);
 const request=first.receipt.requests[0];await jobs(owner.store).reconcile(request.id,.001);await target.reconcile(room.id);await target.reconcile(room.id);const pool=(await owner.store.record('rooms',room.id)).pool;assert.equal(pool.reservedUSD,0);assert.ok(Math.abs(pool.spentUSD-.001)<1e-9);assert.equal(calls,1);
}));
