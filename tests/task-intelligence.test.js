import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {taskIntelligence,recommendModels,childEnvironment,failureCategory,sourceSnapshot} from '../server/task-intelligence.js';
import {retrieveMemory} from '../server/memory.js';
import {contextBudget} from '../server/runtime/context.js';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-intelligence-'));try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Fixture',path:path.join(root,'code')}),session=await store.createSession({projectId:project.id});await store.writeSettings({vaultPreference:'disabled'});await fn({root,store,project,session,api:taskIntelligence(store)});}finally{await rm(root,{recursive:true,force:true});}}
const local=[{id:'ollama:fixture',inputPrice:0,outputPrice:0}];
const reply=content=>Response.json({choices:[{message:{role:'assistant',content}}],usage:{prompt_tokens:100,completion_tokens:5}});

test('task brief revisions are immutable, human-owned, exact-version and private by default',()=>fixture(async({api,project,store})=>{
 const first=await api.save(project.id,{objective:'Fix login',constraints:['Preserve API'],criteria:['Old clients still work']});assert.equal(first.visibility,'private');assert.equal(await api.context(project.id,{shared:true}),'[]');const next=await api.save(project.id,{objective:'Fix the login cookie'},first.id,first.hash);await assert.rejects(()=>api.save(project.id,{status:'accepted'},first.id,first.hash),/Stale/);assert.equal(next.version,2);assert.equal((await store.records('events',{projectId:project.id,type:'task_revision'})).length,2);
 const raced=await Promise.allSettled([api.save(project.id,{objective:'A'},next.id,next.hash),api.save(project.id,{objective:'B'},next.id,next.hash)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
}));

test('saved-chat search is project scoped, cited, literal and does not include tool payloads or private shared context',()=>fixture(async({api,project,session,store,root})=>{
 await store.appendMessage(session.id,{id:'human',role:'user',content:'Prior decision: use SQLite'});await store.appendMessage(session.id,{role:'tool',content:'SQLite PRIVATE_TOOL'});const other=await store.createProject({name:'Other',path:path.join(root,'other')}),s=await store.createSession({projectId:other.id});await store.appendMessage(s.id,{role:'user',content:'SQLite WRONG_PROJECT'});const rows=await api.search(project.id,'SQLite');assert.equal(rows.length,1);assert.match(rows[0].citation,/session:/);assert.ok(!JSON.stringify(rows).includes('WRONG_PROJECT'));assert.deepEqual(await api.search(project.id,'SQLite',{shared:true}),[]);
}));

test('memory retrieval excludes unrelated filler, pins preferences and labels stale source facts',()=>fixture(async({store,project})=>{
 await store.addMemory({projectId:project.id,text:'Use tabs',kind:'user_preference'});await store.addMemory({projectId:project.id,text:'Unrelated astronomy fact'});await store.addMemory({projectId:project.id,text:'Cookie configuration',expiresAt:'2020-01-01'});const rows=await retrieveMemory(store,project.id,'Cookie');assert.equal(rows.length,2);assert.equal(rows[0].text,'Use tabs');assert.equal(rows[1].stale,true);assert.deepEqual(await retrieveMemory(store,project.id,'Cookie',{shared:true}),[]);
}));

test('evidence reports stale successful checks and never converts model claims to verification',()=>fixture(async({store,project,session,api})=>{
 await writeFile(path.join(project.path,'index.js'),'before');const job=await store.saveRecord('jobs',{projectId:project.id,sessionId:session.id,status:'running'});assert.match((await api.evidence(project.id,job.id)).statement,/No successful/);const source=await sourceSnapshot(project.path);await store.event({projectId:project.id,jobId:job.id,type:'tool_evidence',data:{tool:'run_shell',command:'node --test',result:{exitCode:0},source,sourceBefore:source}});assert.equal((await api.evidence(project.id,job.id)).checks[0].sourceCurrent,true);await writeFile(path.join(project.path,'index.js'),'after');const evidence=await api.evidence(project.id,job.id);assert.equal(evidence.checks[0].sourceCurrent,false);assert.match(evidence.statement,/stale/);assert.equal(evidence.humanAcceptanceRequired,true);
}));

test('runtime preserves task brief and scoped project instructions after history trimming, with timing and evidence receipts',()=>fixture(async({store,project,session,api})=>{
 await api.save(project.id,{objective:'Keep the public login API',constraints:['Never replace session storage']});await writeFile(path.join(project.path,'AGENTS.md'),'Use the existing cookie library.');for(let i=0;i<45;i++)await store.appendMessage(session.id,{role:i%2?'assistant':'user',content:'history '+i});let body;const runtime=createRuntime({store,models:local,fetch:async(url,options)=>{body=JSON.parse(options.body);return reply('Implemented, not tested');}});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Continue login'});assert.equal(result.error,undefined);const text=JSON.stringify(body.messages);assert.match(text,/Never replace session storage/);assert.match(text,/existing cookie library/);assert.ok((await api.performance(project.id)).sampleCount>=2);assert.match((await api.evidence(project.id,result.jobId)).statement,/No successful/);assert.equal((await store.records('events',{projectId:project.id,type:'completion_evidence'})).length,1);}finally{await runtime.close();}
}));

test('provider catalog requests are lazy, per-provider and coalesced, with explicit invalidation',()=>fixture(async({store})=>{
 let catalogs=0;const runtime=createRuntime({store,getCredential:async()=>'fixture-key-only',fetch:async url=>{catalogs++;await new Promise(r=>setTimeout(r,30));assert.match(String(url),/127.0.0.1:11434\/api\/tags/);return Response.json({models:[{name:'fixture'}]});}});try{const [a,b]=await Promise.all([runtime.listModels('ollama'),runtime.listModels('ollama')]);assert.equal(catalogs,1);assert.equal(a[0].id,b[0].id);await runtime.listModels('ollama');assert.equal(catalogs,1);runtime.invalidateModels();await runtime.listModels('ollama');assert.equal(catalogs,2);}finally{await runtime.close();}
}));

test('routing explains exclusions, keeps unknown metadata unknown and never sends inference',()=>{
 const result=recommendModels([{id:'openrouter:small',provider:'openrouter',contextLength:8000,supportedParameters:['tools'],inputPrice:1e-7,outputPrice:2e-7},{id:'ollama:unknown',provider:'ollama'}],{contextTokens:10000,localOnly:true});assert.equal(result[0].eligible,false);assert.ok(result.some(m=>m.reasons.includes('local-only policy')));assert.ok(result.some(m=>m.reasons.includes('tool support unconfirmed')));
});

test('context headroom and child environment defaults are bounded and honest',()=>{
 const budget=contextBudget({contextLength:8192});assert.ok(budget.inputEstimateTokens+budget.outputTokens+budget.toolHeadroomTokens<=8192);assert.ok(budget.maxBytes<8192*4);assert.match(budget.estimator,/estimate/);const env=childEnvironment({PATH:'safe',HOME:'safe',OPENROUTER_API_KEY:'secret',NPM_TOKEN:'secret',APEX_HOME:'private',BUILD_ENV:'test'});assert.deepEqual(env,{PATH:'safe',HOME:'safe',BUILD_ENV:'test'});assert.equal(failureCategory(Error('HTTP 429')),'rate_limit');assert.equal(failureCategory(Error('Current turn exceeds the local context bound')),'context_overflow');
});

test('identical failed tool calls are bounded without suppressing unrelated recovery',()=>fixture(async({store,project,session})=>{
 let posts=0;const runtime=createRuntime({store,models:local,fetch:async()=>{posts++;if(posts>3)return reply('Stopped the broken approach');return Response.json({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'call'+posts,type:'function',function:{name:'read_file',arguments:JSON.stringify({path:'missing.txt'})}}]}}]});}});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Debug a missing file'});assert.equal(result.error,undefined);const events=await store.records('events',{projectId:project.id,type:'tool_evidence'});assert.match(events[2].data.result.error,/Repeated identical/);assert.equal(posts,4);}finally{await runtime.close();}
}));
