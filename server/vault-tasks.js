import {readFile,readdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {scopedPath} from './runtime/files.js';
import {digest,scrub} from './safe-content.js';
import {projectVault} from './vault.js';
import {collaboration,taskTerms} from './collaboration.js';
import {roomClient} from './rooms.js';
import {repoInfo} from './git-project.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export function parseTaskDraft(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>50000)throw Error('Task draft exceeds 50KB');const block=text.match(/(?:^|\n)```apex-task\s*\n([\s\S]*?)\n```(?:\n|$)/);if(!block)throw Error('Expected an apex-task JSON block');const draft=JSON.parse(block[1]);
 if(draft.type!=='apex-task-draft'||draft.schema!==1||!uuid(draft.id)||!Number.isInteger(draft.revision)||draft.revision<1||typeof draft.title!=='string'||!draft.title.trim()||draft.title.length>200)throw Error('Invalid versioned task draft');
 const allowed=['type','schema','id','revision','title','goal','target','acceptance','files','interfaces','dependsOn','maxUSD'];if(Object.keys(draft).some(k=>!allowed.includes(k)))throw Error('Unsupported draft fields; draft text never grants permissions');
 taskTerms({...draft,target:draft.target||'recipient-selected-in-APEX'});return draft;
}
export function vaultTasks(store,client=roomClient(store)){
 const work=collaboration(store,client);
 async function read(projectId,file){const p=await store.getProject(projectId);if(!p.vaultPath)throw Error('Choose a vault first');if(typeof file!=='string'||!/^Outbox\/[A-Za-z0-9_.-]+\.task\.md$/.test(file))throw Error('Select a .task.md draft from Outbox');const actual=await scopedPath(p.vaultPath,file,{allowPrivate:true});if((await stat(actual)).size>50000)throw Error('Task draft too large');const text=await readFile(actual,'utf8');return {project:p,file,hash:digest(text),draft:parseTaskDraft(text)};}
 return {read,
  async list(projectId){const p=await store.getProject(projectId);if(!p.vaultPath)return [];let files;try{files=await readdir(await scopedPath(p.vaultPath,'Outbox',{allowPrivate:true}));}catch(e){if(e.code==='ENOENT')return [];throw e;}const rows=[];for(const name of files.filter(n=>n.endsWith('.task.md')).slice(0,100)){try{const r=await read(projectId,'Outbox/'+name);rows.push({file:r.file,hash:r.hash,draft:r.draft});}catch(error){rows.push({file:'Outbox/'+name,error:error.message});}}return rows;},
  async promote(projectId,file,{expectedHash,target}={}){
   const selected=await read(projectId,file);if(selected.hash!==expectedHash)throw Error('Draft changed since preview');const {project,draft}=selected;if(!project.roomId)throw Error('Join a room before promoting a task');
   const prior=(await store.records('events',{projectId,type:'vault_task_promotion'})).filter(e=>e.data.draftId===draft.id),same=prior.find(e=>e.data.revision===draft.revision);
   if(same){if(same.data.sourceHash!==selected.hash)throw Error('Changed content requires an explicit new draft revision');if(same.data.state==='published')return {taskId:same.data.taskId,alreadyPromoted:true};throw Error('Prior promotion outcome is unresolved; reconcile from room history first');}
   if(prior.some(e=>e.data.revision>=draft.revision))throw Error('Draft revision must increase');
   const repo=await repoInfo(project.path),terms=taskTerms({...draft,target:target||draft.target,base:repo.head||'',branch:repo.branch||'',repository:repo.remote||''}),taskId=randomUUID(),intent=await store.saveRecord('events',{projectId,type:'vault_task_promotion',createdAt:new Date().toISOString(),data:{draftId:draft.id,revision:draft.revision,sourceHash:selected.hash,file,roomId:project.roomId,taskId,title:scrub(draft.title),approvedTerms:JSON.parse(scrub(JSON.stringify(terms))),state:'prepared'}});
   try{const latest=await read(projectId,file);if(latest.hash!==expectedHash)throw Error('Draft changed before publication');await work.offer(project.roomId,intent.data.approvedTerms,{id:taskId});await store.saveRecord('events',{...intent,data:{...intent.data,state:'published'}});await work.view(project.roomId);return {taskId,draftId:draft.id,revision:draft.revision,executionStarted:false};}
   catch(error){await store.saveRecord('events',{...intent,data:{...intent.data,state:'unknown',error:scrub(error.message)}});throw Error('Promotion preserved for reconciliation: '+intent.id+' · '+error.message);}
  },
  async reconcile(projectId,intentId){const intent=await store.record('events',intentId);if(!intent||intent.projectId!==projectId||intent.type!=='vault_task_promotion')throw Error('Choose a promotion from this project');const state=await work.view(intent.data.roomId),task=state.tasks.find(t=>t.id===intent.data.taskId),member=await client.membership(intent.data.roomId);if(!task||task.creator!==member.memberId||![task.hash,...(task.previous||[]).map(p=>p.hash)].includes(digest(JSON.stringify(intent.data.approvedTerms))))throw Error('No matching published offer; nothing replayed');await store.saveRecord('events',{...intent,data:{...intent.data,state:'published'}});await work.view(intent.data.roomId);return {taskId:task.id,reconciled:true};}
 };
}
export async function syncTaskOutcomes(store,projectId,board){
 const vault=await projectVault(store,projectId);if(!vault)return [];
 const promotions=await store.records('events',{projectId,type:'vault_task_promotion'}),events=await store.records('events',{projectId}),results=[];
 for(const promotion of promotions.filter(p=>p.data.state==='published').slice(-100)){
  const t=board.tasks.find(t=>t.id===promotion.data.taskId);if(!t)continue;const run=events.find(e=>e.type==='agreement_run'&&e.data.taskId===t.id),job=run?await store.record('jobs',run.data.jobId):null;
  const outcome={type:'apex-task-outcome',schema:1,draftId:promotion.data.draftId,draftRevision:promotion.data.revision,taskId:t.id,taskVersion:t.version,taskHash:t.hash,status:t.status,branch:t.terms.branch,base:t.terms.base,acceptance:t.terms.acceptance,result:t.result||null,evidence:t.evidence||[],job:job?{id:job.id,status:job.status,model:job.model}:null,executionApprovedByDraft:false},hash=digest(JSON.stringify(outcome)),markerId='vault-outcome:'+promotion.id;
  if((await store.record('events',markerId))?.data.hash===hash)continue;
  const result=await vault.note({id:'draft-outcome:'+promotion.data.draftId+':'+promotion.data.revision,title:'Outcome · '+promotion.data.title,kind:'task',visibility:'private',source:promotion.data.file,content:'[[Outbox/'+path.basename(promotion.data.file,'.md')+']]\n\n```apex-outcome\n'+JSON.stringify(outcome,null,2)+'\n```\n\nOriginal draft and freeform notes are preserved. Acceptance and execution require APEX confirmation.'});
  await store.saveRecord('events',{id:markerId,type:'vault_task_outcome',projectId,data:{hash,outcome,result}});results.push(result);
 }
 return results;
}
