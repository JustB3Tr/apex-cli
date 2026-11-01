import {attention} from '../server/attention.js';
import {jobs} from '../server/jobs.js';

export const ATTENTION_HELP=`
 /attention                    Review grouped human questions and parked work
 /attention list               Plain-text briefing, without inference
 /attention policy immediate|batch   Choose live approvals or durable review batching
 /attention answer ID          Answer an exact preview; execution is never approved here
 /attention resume ID          Explicitly continue answered, source-current work
 /attention refresh ID         Pin a new source/version and require a new answer
`;
const item=(value,label,description='')=>({value,label,description});
export function attentionCommands(c){
 const api=attention(c.store),ledger=jobs(c.store);
 async function select(id){const rows=await api.list(c.project().id);if(id){const found=rows.filter(q=>q.id===id||q.id.startsWith(id));if(found.length!==1)throw Error('Choose one unambiguous question ID');return found[0];}if(!c.ui){c.print(JSON.stringify(await api.briefing(c.project().id),null,2));return null;}const chosen=await c.ui.dialog({title:'Human review',description:'Parked work uses no inference while waiting. Answers never grant tool execution.',items:rows.filter(q=>q.status!=='closed').map(q=>item(q.id,q.question.slice(0,76),q.status+' · '+q.sourceStatus+' · '+q.jobId.slice(0,8)))});return rows.find(q=>q.id===chosen)||null;}
 async function answer(q){if(!c.ui)throw Error('Answering requires the exact interactive preview');const value=await c.ui.dialog({title:'Answer this version',description:q.question+'\n'+q.context+'\n'+(q.operation?'Proposed operation: '+JSON.stringify(q.operation).slice(0,1000)+'\n':'')+'v'+q.version+' · '+q.hash.slice(0,12)+' · '+q.sourceStatus+' source. This is task guidance, never tool permission.',input:true});if(value===null||!value.trim())return;await api.answer(c.project().id,q.id,{version:q.version,hash:q.hash,answer:value});c.print('Answer saved. Work remains parked until you explicitly resume it.');}
 async function refresh(q){await api.refresh(c.project().id,q.id,{version:q.version,hash:q.hash});c.print('Question refreshed against current public source. Previous answers retained; review and answer this new version.');}
 async function resume(q){
  if(!c.runtime)throw Error('Resume from the interactive APEX runtime');const before=await ledger.summary(q.jobId);if(before.mode==='build'&&c.mode?.()==='plan')throw Error('Switch to Build before continuing a Build job');
  if(!c.ui||await c.ui.dialog({title:'Continue this saved job?',description:before.model+' · '+before.mode+' · original budget $'+before.maxUSD+' · committed $'+before.committedUSD.toFixed(4)+'. Source must still match; tool actions ask again.',items:[item(false,'Keep parked'),item(true,'Continue within original budget')]})!==true)return;
  const job=await api.resume(c.project().id,q.id,{version:q.version,hash:q.hash}),context=job.attentionContinuation,run=async signal=>{const result=await c.runtime.chat({projectId:job.projectId,sessionId:job.sessionId,jobId:job.id,message:'Continue the saved job from its recorded history after human review. Do not repeat completed actions. Goal: '+job.goal,model:job.model,mode:job.mode,workingPath:context.sourceRoot,contextPolicy:context.execution.contextPolicy,agent:context.execution.agent,agentId:context.execution.agent?.id,groupRestricted:context.execution.groupRestricted===true,signal});if(!result.parked)await ledger.finish(job.id,result.error?'failed':'complete',result.content||result.error);c.print(result.content||result.error||JSON.stringify(result));await c.onResumeResult?.(job,result);return result;};
  if(c.runTask)return c.runTask(run);return run();
 }
 return {api,async command(name,rest){if(name!=='/attention')return false;const [action,...parts]=rest.split(/\s+/),id=parts.join(' ');
  if(action==='policy'){c.print(JSON.stringify(await api.configure(c.project().id,id),null,2));return true;}
  if(action==='list'){c.print(JSON.stringify(await api.briefing(c.project().id),null,2));return true;}
  const q=await select(id);if(!q)return true;
  if(action==='answer'){await answer(q);return true;}if(action==='resume'){await resume(q);return true;}if(action==='refresh'){await refresh(q);return true;}
  if(action)throw Error('Use /attention, list, policy, answer, resume or refresh');
  const selected=await c.ui.dialog({title:'Review parked work',description:q.question+' · '+q.status+' · '+q.sourceStatus,items:[item('answer','Answer this version'),item('resume','Continue answered work'),item('refresh','Refresh stale source / answer'),item('inspect','Inspect source and exact operation')]});if(selected==='answer')await answer(q);else if(selected==='resume')await resume(q);else if(selected==='refresh')await refresh(q);else if(selected==='inspect')c.print(JSON.stringify(q,null,2));return true;
 }};
}
