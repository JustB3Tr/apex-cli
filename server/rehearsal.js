import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from './store.js';
import {createHub} from './hub.js';
import {roomClient} from './rooms.js';
import {collaboration} from './collaboration.js';
import {projectPassport,exportPassport} from './passport.js';
import {git,initRepo,connectRepo,saveRepo,cloneRepo} from './git-project.js';

/** A labelled two-person simulation: real Git/HTTP/files, fixture inference, no paid calls. */
export async function rehearseCollaboration(destination){
 const root=path.resolve(destination);await mkdir(root,{recursive:false});let hub;
 try{
  const aPath=path.join(root,'alice','project'),bPath=path.join(root,'bob','project'),remote=path.join(root,'origin.git');
  await mkdir(aPath,{recursive:true});await git(root,['init','--bare','--initial-branch=main',remote]);await initRepo(aPath);await writeFile(path.join(aPath,'sum.mjs'),'export const sum=(a,b)=>a+b;\n');await connectRepo(aPath,remote);await saveRepo(aPath,'Rehearsal source',{push:true});await cloneRepo(remote,bPath);
  hub=await createHub({home:path.join(root,'hub'),bootstrapToken:randomUUID()});const people=[];
  for(const [name,folder] of [['Alice',aPath],['Bob',bPath]]){
   const {store}=await createStore(path.join(root,name.toLowerCase(),'state'));await store.writeSettings({vaultPreference:'disabled',identity:{id:randomUUID(),name,device:'Rehearsal'},maxTurnUSD:0});
   const project=await store.createProject({name:'Rehearsal',path:folder}),values=new Map(),client=roomClient(store,{secrets:{get:async id=>values.get(id),set:async(id,v)=>values.set(id,v),remove:async id=>values.delete(id)}});people.push({store,project,client,collab:collaboration(store,client)});
  }
  const [a,b]=people,room=await a.client.create(a.project.id,hub.endpoint,hub.bootstrapToken,'Two-person rehearsal'),joined=await b.client.join(b.project.id,await a.client.invite(room.id)),alice=(await a.client.membership(room.id)).memberId;
  const task=await a.collab.offer(room.id,{target:joined.memberId,goal:'Inspect sum.mjs and report what it does',files:['sum.mjs'],acceptance:'Cite the actual file; identify untested behavior',maxUSD:0});
  await b.collab.task(room.id,task.id,'counter',{terms:{acceptance:'Cite the file and explicitly label this as fixture inference'}});await a.collab.task(room.id,task.id,'confirm-counter');await b.collab.task(room.id,task.id,'accept');
  await a.collab.claim(room.id,{resourceType:'file',resource:'sum.mjs'});await b.collab.claim(room.id,{resourceType:'file',resource:'sum.mjs',taskId:task.id});const overlap=(await a.collab.view(room.id)).overlaps[0];if(!overlap)throw Error('Expected declared-work overlap');
  await a.collab.claimAction(room.id,overlap.claims[1],'ack');await b.collab.claimAction(room.id,overlap.claims[0],'ack');
  let calls=0,observedFile=false;
  const run=await b.collab.run(room.id,task.id,{model:'ollama:rehearsal-fixture',runtimeOptions:{models:[{id:'ollama:rehearsal-fixture'}],fetch:async(_url,options)=>{
   calls++;const body=JSON.parse(options.body);if(body.tools.some(t=>t.function.name==='write_file'))throw Error('Rehearsal must remain Plan');const receipt=body.messages.findLast(m=>m.role==='tool');if(receipt){observedFile=receipt.content.includes('a+b');}
   return Response.json({choices:[{message:receipt?{role:'assistant',content:'Observed sum.mjs returns a+b. This is fixture inference; no code-quality benchmark or runtime test was performed.'}:{role:'assistant',content:'',tool_calls:[{id:'read',type:'function',function:{name:'read_file',arguments:'{"path":"sum.mjs"}'}}]}}],usage:{prompt_tokens:20,completion_tokens:10,cost:0}});
  }}});
  if(!observedFile||run.result.error)throw Error('Fixture read failed');
  await b.collab.task(room.id,task.id,'deliver',{result:run.result.content,evidence:['Read sum.mjs through a real runtime tool; fixture inference only']});await a.collab.task(room.id,task.id,'ack');
  const decision=await a.collab.propose(room.id,{title:'Require evidence in review handoffs',rationale:'Keep observations separate from unexecuted claims',alternatives:['Unstructured chat'],owner:alice});await b.collab.decision(room.id,decision.id,'comment',{comment:'Include limitations too'});await a.collab.decision(room.id,decision.id,'accept');
  const passport=await projectPassport(a.store,a.project.id,{files:['sum.mjs'],taskIds:[task.id],decisionIds:[decision.id]});await exportPassport(passport,path.join(root,'project-passport.json'));
  const state=await a.collab.view(room.id),report={schema:1,at:new Date().toISOString(),label:'Two-person local rehearsal; fixture inference',profiles:2,realGitCheckouts:2,encryptedLoopbackHTTP:true,task:state.tasks[0].status,decision:state.decisions[0].status,overlapsAcknowledged:state.overlaps.every(o=>o.acknowledged),observedFile,fixtureCalls:calls,paidCalls:0,passport:path.join(root,'project-passport.json'),personalProjectChanged:false,physicalSecondPCVerified:false};
  await writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});return {root,...report};
 }finally{await hub?.close();}
}
