import {randomUUID} from 'node:crypto';
import {repoInfo} from './git-project.js';
import {jobs} from './jobs.js';
import {reduceCollaboration} from './collaboration.js';
import {projectVault} from './vault.js';
import {scrub,digest} from './safe-content.js';

export async function buildHandoff(store,projectId){
 const project=await store.getProject(projectId),repo=await repoInfo(project.path),room=project.roomId?await store.record('rooms',project.roomId):null,events=await store.records('events',{projectId}),board=reduceCollaboration(events.filter(e=>e.type==='room_event'&&e.roomId===project.roomId)),actor=room?.memberId||null;
 const ledger=jobs(store),records=(await store.records('jobs',{projectId})).slice(-20),summaries=await Promise.all(records.map(j=>ledger.summary(j.id))),previous=events.filter(e=>e.type==='handoff_snapshot').at(-1)?.data?.brief;
 const pending=[];
 for(const t of board.tasks){const recipient=t.terms.target===actor,sender=t.creator===actor;let action;
  if(recipient&&['offered','countered'].includes(t.status))action='Review/negotiation; acceptance does not execute';
  if(sender&&t.status==='countered'&&t.counterBy!==actor)action='Confirm or revise recipient counteroffer';
  if(recipient&&t.status==='accepted')action='Inspect saved run, then explicitly run or deliver evidence';
  if(sender&&t.status==='delivered')action='Review delivery and acknowledge or discuss';
  if(action)pending.push({kind:'task',id:t.id,title:t.terms.goal,version:t.version,hash:t.hash,status:t.status,action,staleBase:Boolean(t.terms.base&&t.terms.base!==repo.head),citation:'task:'+t.id});
 }
 for(const d of board.decisions)if(d.terms.owner===actor&&d.status==='proposed')pending.push({kind:'decision',id:d.id,title:d.terms.title,version:d.version,hash:d.hash,action:'Inspect comments and accept/revise this exact proposal',citation:'decision:'+d.id});
 const unresolved=events.filter(e=>e.type==='integration_action'&&['sending','unknown'].includes(e.data.state)).map(e=>({id:e.id,service:e.data.service,action:e.data.action,target:e.data.target,state:e.data.state,citation:'event:'+e.id}));
 const checks=events.filter(e=>e.type==='tool_evidence').slice(-12).map(e=>({id:e.id,jobId:e.jobId,tool:e.data.tool,kind:e.data.tool==='run_shell'?'local shell receipt':'tool observation; not automatically a test',exitCode:e.data.tool==='run_shell'?e.data.result?.exitCode??null:null,excerpt:scrub(JSON.stringify(e.data.result)).slice(0,1800),citation:'event:'+e.id}));
 const snapshots=previous?.pending||[],brief={schema:1,type:'apex-human-handoff',id:randomUUID(),createdAt:new Date().toISOString(),visibility:'local-private',project:{id:project.id,name:project.name},forMember:actor,repository:{branch:repo.branch||null,base:repo.head||null,dirty:repo.dirty??null,changedPaths:repo.status?repo.status.split('\n').slice(0,30).map(s=>scrub(s)):[]},pending,changesSincePrevious:previous?{previousId:previous.id,branchChanged:previous.repository.branch!==repo.branch,baseChanged:previous.repository.base!==repo.head,newPending:pending.filter(p=>!snapshots.some(s=>s.id===p.id&&s.hash===p.hash)).map(p=>p.id),noLongerPending:snapshots.filter(s=>!pending.some(p=>p.id===s.id)).map(p=>p.id)}:null,jobs:summaries.map(j=>({id:j.id,status:j.status,model:j.model,goal:scrub(j.goal).slice(0,300),billedUSD:j.billedUSD,heldUSD:j.heldUSD,committedUSD:j.committedUSD,unresolvedRequests:j.requests.filter(r=>['reserved','sent','unknown','estimated'].includes(r.state)).map(r=>({id:r.id,state:r.state,amount:r.amount})),citation:'job:'+j.id})),unresolvedIntegrations:unresolved,checks,claims:board.claims.filter(c=>c.owner===actor).map(c=>({id:c.id,resource:c.resource,active:c.active,expiresAt:c.expiresAt})),warnings:['This is a deterministic snapshot, not execution approval or a claim that a job is safe to resume.','Held/estimated costs are not verified final charges. Inspect actual receipts before repeating work.']};
 return JSON.parse(scrub(JSON.stringify(brief)));
}
export async function saveHandoff(store,projectId){const brief=await buildHandoff(store,projectId),hash=digest(JSON.stringify(brief));const row=await store.saveRecord('events',{id:brief.id,type:'handoff_snapshot',projectId,createdAt:brief.createdAt,data:{brief,hash}});const vault=await projectVault(store,projectId);if(vault)await vault.note({id:'handoff:'+brief.id,title:'Handoff '+brief.createdAt,kind:'handoff',visibility:'private',content:'```json\n'+JSON.stringify(brief,null,2).slice(0,85000)+'\n```'});return row;}
export async function sharedHandoff(store,projectId){const local=await buildHandoff(store,projectId);return {type:'apex-shared-handoff',schema:1,createdAt:local.createdAt,visibility:'shared',project:local.project.name,forMember:local.forMember,pending:local.pending,repository:{branch:local.repository.branch,base:local.repository.base},claims:local.claims,policy:'Shared records only; private jobs, held costs, integration actions, memories and shell output omitted. No execution approval.'};}
