import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.js';
import {jobs} from '../server/jobs.js';
import {attention,AttentionPark} from '../server/attention.js';
import {createRemoteHost,remoteClient} from '../server/remote.js';

async function fixture(run,{allowAttention=true}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-remote-attention-'));let host;
 try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Selected project',path:path.join(root,'project')}),other=await store.createProject({name:'Other project',path:path.join(root,'other-project')}),session=await store.createSession({projectId:project.id}),otherSession=await store.createSession({projectId:project.id}),otherProjectSession=await store.createSession({projectId:other.id});await store.writeSettings({vaultPreference:'disabled'});await writeFile(path.join(project.path,'source.ts'),'original');const api=attention(store),ledger=jobs(store);let sends=0;
  async function question(p=project,s=session,text='Choose a contract',kind='clarification'){
   const job=await ledger.create({projectId:p.id,sessionId:s.id,goal:'Parked review',model:'ollama:fixture',maxUSD:0});let q;try{await api.ask({projectId:p.id,sessionId:s.id,jobId:job.id,question:text,context:'Review exact selected context',kind,...(kind==='approval'?{tool:'write_file',args:{path:'unsafe.txt',content:'must not execute'}}:{}),visibility:'private'});}catch(error){assert.ok(error instanceof AttentionPark);q=error.question;}return {q,job};
  }
  host=await createRemoteHost({store,projectId:project.id,sessionId:session.id,model:'ollama:fixture',maxUSD:0,allowAttention,runtimeOptions:{models:[{id:'ollama:fixture'}],fetch:async()=>{sends++;throw Error('No model requests allowed in attention-only fixture');}}});
  async function paired(role='controller'){const client=remoteClient(host.endpoint),device=await client.pair(host.pair(role).code,'Fixture '+role);return {client,device,async post(route,input,{csrf=true}={}){const res=await fetch(host.endpoint+'/api/'+route,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+device.token,...(csrf?{'x-apex-csrf':device.csrf}:{})},body:JSON.stringify(input)});return {status:res.status,data:await res.json()};}};}
  await run({root,store,project,other,session,otherSession,otherProjectSession,host,api,ledger,question,paired,sends:()=>sends});
 }finally{await host?.close();await rm(root,{recursive:true,force:true});}
}
const input=q=>({id:q.id,version:q.version,hash:q.hash,answer:'Use the existing contract'});

test('remote human answers require explicit host opt-in and controllers; viewers receive no private questions',async()=>{
 await fixture(async({question,paired,ledger,sends})=>{const {q,job}=await question(),controller=await paired();assert.deepEqual((await controller.client.state()).attentionInbox,[]);assert.equal((await controller.post('attention-answer',input(q))).status,403);assert.equal((await ledger.summary(job.id)).status,'waiting_human');assert.equal(sends(),0);},{allowAttention:false});
 await fixture(async({question,paired,ledger,sends})=>{const {q,job}=await question(),viewer=await paired('viewer');assert.deepEqual((await viewer.client.state()).attentionInbox,[]);assert.equal((await viewer.post('attention-answer',input(q))).status,403);assert.equal((await ledger.summary(job.id)).status,'waiting_human');assert.equal(sends(),0);});
});

test('attention inbox and answer endpoint are bound to the exact selected project and session',()=>fixture(async({project,other,session,otherSession,otherProjectSession,question,paired,sends})=>{
 const selected=await question(project,session,'Selected private question'),sameProject=await question(project,otherSession,'OTHER SESSION PRIVATE TEXT'),otherProject=await question(other,otherProjectSession,'OTHER PROJECT PRIVATE TEXT'),controller=await paired(),state=await controller.client.state();
 assert.deepEqual(state.attentionInbox.map(q=>q.id),[selected.q.id]);assert.ok(!JSON.stringify(state).includes('OTHER SESSION PRIVATE TEXT'));assert.ok(!JSON.stringify(state).includes('OTHER PROJECT PRIVATE TEXT'));assert.ok(!Object.hasOwn(state.attentionInbox[0],'sourceRoot'));
 for(const q of [sameProject.q,otherProject.q])assert.equal((await controller.post('attention-answer',{...input(q),sessionId:session.id,projectId:project.id})).status,404);
 const response=await controller.post('attention-answer',input(selected.q));assert.equal(response.status,200);assert.equal(response.data.status,'answered');assert.ok(!Object.hasOwn(response.data,'sourceRoot'));assert.equal(sends(),0);
}));

test('stale version/hash and source changes are rejected; refresh retains history and requires a new exact answer',()=>fixture(async({project,api,question,paired,sends})=>{
 const {q}=await question(),controller=await paired();for(const changed of [{version:q.version+1},{hash:'0'.repeat(64)}]){const response=await controller.post('attention-answer',{...input(q),...changed});assert.equal(response.status,409);assert.match(response.data.error,/Stale/);}
 await writeFile(path.join(project.path,'source.ts'),'human changed source');let state=await controller.client.state();assert.equal(state.attentionInbox[0].sourceStatus,'stale');assert.equal((await controller.post('attention-answer',input(q))).status,409);
 const current=await api.refresh(project.id,q.id,{version:q.version,hash:q.hash});assert.equal(current.version,2);assert.equal(current.previous.length,1);assert.equal((await controller.post('attention-answer',input(q))).status,409);assert.equal((await controller.post('attention-answer',input(current))).status,200);state=await controller.client.state();assert.equal(state.attentionInbox[0].status,'answered');assert.equal(sends(),0);
}));

test('answering an approval question records direction but never resumes, executes, approves or raises budgets',()=>fixture(async({store,project,question,paired,ledger,sends})=>{
 const {q,job}=await question(project,undefined,'Review proposed write_file action','approval'),controller=await paired(),before=await ledger.summary(job.id);assert.equal((await controller.post('attention-answer',input(q),{csrf:false})).status,403);
 const answer=await controller.post('attention-answer',input(q));assert.equal(answer.status,200);assert.equal(answer.data.status,'answered');assert.equal((await ledger.summary(job.id)).status,'waiting_human');assert.equal((await ledger.summary(job.id)).maxUSD,before.maxUSD);assert.equal((await store.record('jobs',job.id)).attentionContinuation,undefined);assert.equal((await store.records('requests',{jobId:job.id})).length,0);await assert.rejects(()=>readFile(path.join(project.path,'unsafe.txt')),error=>error.code==='ENOENT');
 assert.equal((await controller.post('attention-resume',input(q))).status,404);assert.equal((await controller.post('approve',{id:q.id,approved:true})).status,403);assert.equal(sends(),0);
 const repeat=await controller.post('attention-answer',input(q));assert.equal(repeat.status,200);assert.equal((await controller.post('attention-answer',{...input(q),answer:'Different answer'})).status,409);
}));
