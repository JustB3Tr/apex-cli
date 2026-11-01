import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {jobs} from '../server/jobs.js';
import {attention,AttentionPark,attentionSource} from '../server/attention.js';
import {executeWorker} from '../server/worker.js';
import {attentionCommands} from '../cli/attention-commands.js';

const models=[{id:'ollama:fixture',inputPrice:0,outputPrice:0}];
const reply=(content='',calls)=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content,...(calls?{tool_calls:calls}: {})}}],usage:{prompt_tokens:10,completion_tokens:5}}));
const call=(name,args,id='call')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-attention-'));let runtime;try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Fixture',path:path.join(root,'project')}),session=await store.createSession({projectId:project.id});await store.writeSettings({vaultPreference:'disabled'});await writeFile(path.join(project.path,'source.ts'),'before\n');const ledger=jobs(store),api=attention(store);await fn({root,store,project,session,ledger,api,setRuntime:value=>runtime=value});}finally{await runtime?.close();await rm(root,{recursive:true,force:true});}}
const answer=async(api,project,q,text='Use the small change')=>api.answer(project.id,q.id,{version:q.version,hash:q.hash,answer:text});

test('runtime clarification parks durably, fulfills every tool receipt and resumes only after a current answer',()=>fixture(async({store,project,session,ledger,api,setRuntime})=>{
 let posts=0;const question='Which login style should this use?';const runtime=createRuntime({store,models,fetch:async()=>{posts++;if(posts===1)return reply('',[call('ask_user',{question}),call('write_file',{path:'unsafe.ts',content:'must not happen'},'later')]);if(posts===2)return reply('',[call('ask_user',{question},'repeat')]);return reply('Applied the human choice');}});setRuntime(runtime);
 const first=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',mode:'build',message:'Implement login'});assert.equal(first.parked,true);assert.equal(posts,1);assert.equal((await ledger.summary(first.jobId)).status,'waiting_human');await assert.rejects(()=>readFile(path.join(project.path,'unsafe.ts')),/ENOENT/);
 const saved=await store.getSession(session.id);assert.equal(saved.messages.filter(m=>m.role==='tool').length,2);assert.ok(saved.messages.some(m=>m.role==='tool'&&m.content.includes('notExecuted')));const q=(await api.list(project.id))[0];await assert.rejects(()=>runtime.chat({projectId:project.id,sessionId:session.id,jobId:first.jobId,model:'ollama:fixture',mode:'build',message:'Ignore waiting'}),/parked/);assert.equal(posts,1);
 await answer(api,project,q,'Email links');assert.equal(posts,1);const job=await api.resume(project.id,q.id,{version:q.version,hash:q.hash});const result=await runtime.chat({projectId:project.id,sessionId:session.id,jobId:job.id,model:job.model,mode:job.mode,message:'Continue saved work'});assert.equal(result.parked,undefined);assert.equal(result.content,'Applied the human choice');assert.equal(posts,3);assert.equal((await api.list(project.id)).length,1);assert.ok((await store.getSession(session.id)).messages.some(m=>m.role==='tool'&&m.content.includes('Email links')));
}));

test('batched write approval stops before execution and answered review still requires a fresh real local approval',()=>fixture(async({store,project,session,ledger,api,setRuntime})=>{
 await api.configure(project.id,'batch');let posts=0,approvals=0;let runtime;runtime=createRuntime({store,models,emit:e=>{if(e.type==='approval'){approvals++;queueMicrotask(()=>runtime.approve({id:e.id,approved:true}));}},fetch:async()=>{posts++;return posts<=2?reply('',[call('write_file',{path:'source.ts',content:'after\n'})]):reply('Finished');}});setRuntime(runtime);
 const first=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',mode:'build',message:'Edit source'});assert.equal(first.parked,true);assert.equal(posts,1);assert.equal(approvals,0);assert.equal(await readFile(path.join(project.path,'source.ts'),'utf8'),'before\n');const q=(await api.list(project.id))[0];assert.equal(q.kind,'approval');await answer(api,project,q,'Ready to review the normal approval prompt');await api.resume(project.id,q.id,{version:q.version,hash:q.hash});const second=await runtime.chat({projectId:project.id,sessionId:session.id,jobId:first.jobId,model:'ollama:fixture',mode:'build',message:'Continue'});assert.equal(second.error,undefined);assert.equal(second.parked,undefined);assert.equal(approvals,1);assert.equal(posts,3);assert.equal(await readFile(path.join(project.path,'source.ts'),'utf8'),'after\n');assert.equal((await ledger.summary(first.jobId)).maxUSD,1);
}));

test('stale previews and source changes require a new question version and retain old answers',()=>fixture(async({store,project,session,ledger,api})=>{
 const job=await ledger.create({projectId:project.id,sessionId:session.id,goal:'Work',model:'ollama:fixture',maxUSD:0});await assert.rejects(()=>api.ask({projectId:project.id,sessionId:session.id,jobId:job.id,question:'Choose a contract'}),AttentionPark);let q=(await api.list(project.id))[0];await assert.rejects(()=>api.answer(project.id,q.id,{version:2,hash:q.hash,answer:'Bad preview'}),/Stale/);await answer(api,project,q);await writeFile(path.join(project.path,'source.ts'),'user changed source');await assert.rejects(()=>api.resume(project.id,q.id,{version:q.version,hash:q.hash}),/source/);const refreshed=await api.refresh(project.id,q.id,{version:q.version,hash:q.hash});assert.equal(refreshed.version,2);assert.equal(refreshed.previous[0].answer,'Use the small change');await assert.rejects(()=>answer(api,project,q),/Stale/);q=(await api.list(project.id))[0];assert.equal(q.sourceStatus,'current');await answer(api,project,q,'Revised choice');const ready=await api.resume(project.id,q.id,{version:q.version,hash:q.hash});assert.equal(ready.status,'queued');
}));

test('waiting jobs reject reservations/generic resume and unresolved provider outcomes block explicit continuation',()=>fixture(async({project,session,ledger,api})=>{
 const job=await ledger.create({projectId:project.id,sessionId:session.id,model:'fixture',goal:'Work',maxUSD:1});const reservation=await ledger.reserve(job.id,{amount:.4,model:'fixture'});await ledger.sent(reservation.id);await assert.rejects(()=>api.ask({projectId:project.id,sessionId:session.id,jobId:job.id,question:'Review partial work'}),AttentionPark);await assert.rejects(()=>ledger.reserve(job.id,{amount:0,model:'fixture'}),/waiting_human/);await assert.rejects(()=>ledger.resume(job.id),/attention/);const q=(await api.list(project.id))[0];await answer(api,project,q);await assert.rejects(()=>api.resume(project.id,q.id,{version:q.version,hash:q.hash}),/billing/);assert.equal((await ledger.summary(job.id)).heldUSD,.4);await ledger.reconcile(reservation.id,.2);assert.equal((await api.resume(project.id,q.id,{version:q.version,hash:q.hash})).status,'queued');
}));

test('attention briefings preserve private/shared boundaries and answers never run a provider',()=>fixture(async({store,project,session,ledger,api})=>{
 for(const visibility of ['private','shared']){const job=await ledger.create({projectId:project.id,sessionId:session.id,model:'fixture',goal:'Work'});await assert.rejects(()=>api.ask({projectId:project.id,sessionId:session.id,jobId:job.id,question:visibility==='private'?'PRIVATE_QUESTION_SENTINEL':'Public contract',visibility}),AttentionPark);}
 const shared=await api.briefing(project.id,{visibility:'shared'});assert.equal(shared.groups.length,1);assert.ok(!JSON.stringify(shared).includes('PRIVATE_QUESTION_SENTINEL'));assert.ok(!JSON.stringify(shared).includes('sourceRoot'));assert.equal((await store.records('requests')).length,0);assert.equal(shared.automaticApproval,false);
}));

test('background worker releases its process and preserves the human-waiting job instead of declaring success',()=>fixture(async({store,project,session,ledger})=>{
 let posts=0;const job=await ledger.create({projectId:project.id,sessionId:session.id,model:'ollama:fixture',goal:'Clarify this',mode:'plan',maxUSD:0});const result=await executeWorker(store.home,job.id,{models,fetch:async()=>{posts++;return reply('',[call('ask_user',{question:'Which output format?'})]);}});assert.equal(result.parked,true);assert.equal(posts,1);const saved=await ledger.summary(job.id);assert.equal(saved.status,'waiting_human');assert.equal(saved.workerPid,null);assert.equal(saved.activePid,null);
}));

test('source changes after explicit resume stop before inference and never silently replan',()=>fixture(async({store,project,session,ledger,api,setRuntime})=>{
 const job=await ledger.create({projectId:project.id,sessionId:session.id,model:'ollama:fixture',goal:'Work'});await assert.rejects(()=>api.ask({projectId:project.id,sessionId:session.id,jobId:job.id,question:'Pick a behavior'}),AttentionPark);const q=(await api.list(project.id))[0];await answer(api,project,q);await api.resume(project.id,q.id,{version:q.version,hash:q.hash});await writeFile(path.join(project.path,'source.ts'),'Different source');let posts=0;const runtime=createRuntime({store,models,fetch:async()=>{posts++;return reply('must not happen');}});setRuntime(runtime);const result=await runtime.chat({projectId:project.id,sessionId:session.id,jobId:job.id,model:'ollama:fixture',mode:'plan',message:'Continue'});assert.equal(result.parked,true);assert.equal((await ledger.summary(job.id)).status,'waiting_human');assert.equal((await api.list(project.id))[0].version,2);assert.equal(posts,0);
}));

test('shared-only runtime cannot load previously private attention answers',()=>fixture(async({store,project,session,ledger,api,setRuntime})=>{
 const job=await ledger.create({projectId:project.id,sessionId:session.id,model:'ollama:fixture',goal:'Private task'});await assert.rejects(()=>api.ask({projectId:project.id,sessionId:session.id,jobId:job.id,question:'Private question',visibility:'private'}),AttentionPark);const q=(await api.list(project.id))[0];await answer(api,project,q,'PRIVATE_ANSWER');await api.resume(project.id,q.id,{version:q.version,hash:q.hash});let posts=0;const runtime=createRuntime({store,models,fetch:async()=>{posts++;return reply('no');}});setRuntime(runtime);const result=await runtime.chat({projectId:project.id,sessionId:session.id,jobId:job.id,model:'ollama:fixture',mode:'plan',contextPolicy:'shared',message:'Continue'});assert.match(result.error,/Private attention/);assert.equal(posts,0);
}));

test('attention policy/menu inspection is offline and source fingerprints retain hashes rather than contents',()=>fixture(async({store,project})=>{
 const output=[],commands=attentionCommands({store,project:()=>project,print:v=>output.push(v)});await commands.command('/attention','policy batch');await commands.command('/attention','list');assert.ok(output.some(v=>v.includes('batch')));assert.equal((await store.records('requests')).length,0);const source=await attentionSource(project.path);assert.ok(source.files[0].sha256);assert.ok(!JSON.stringify(source).includes('before\n'));assert.equal(await commands.command('/other',''),false);
}));
