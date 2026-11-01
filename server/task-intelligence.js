import {createHash,randomUUID} from 'node:crypto';
import {scrub} from './safe-content.js';
import {attentionSource} from './attention.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=()=>new Date().toISOString();
const clean=(value,max=2000)=>scrub(String(value||'')).trim().slice(0,max);
const list=(value,max=20)=>Array.isArray(value)?value.slice(0,max).map(v=>clean(v)).filter(Boolean):[];
const visible=(row,shared)=>!shared||row.visibility==='shared';
export function failureCategory(error){
 const text=String(error?.message||error||'');
 if(error?.category)return error.category;
 if(/cancel|abort/i.test(text))return 'cancelled';
 if(/HTTP 401|HTTP 403|API key|authentication/i.test(text))return 'authentication';
 if(/HTTP 429|rate.limit/i.test(text))return 'rate_limit';
 if(/context.*bound|context.*exceed|overflow/i.test(text))return 'context_overflow';
 if(/denied|permission|approval.*expired/i.test(text))return 'permission';
 if(/hash.*match|stale|patch.*conflict/i.test(text))return 'source_conflict';
 if(/ceiling|budget|price unavailable/i.test(text))return 'budget';
 if(/stream|provider.*message|tool.call|schema|incompatible/i.test(text))return 'provider_protocol';
 if(/timeout|timed out/i.test(text))return 'timeout';
 if(/fetch|connect|ECONN|HTTP 5/i.test(text))return 'provider_transport';
 if(/repeated.*fail|Maximum tool turns/i.test(text))return 'progress_limit';
 return 'execution';
}
export function childEnvironment(input=process.env,{secretNames=[],secretValues=[]}={}){
 // Filtering limits accidental inheritance. It does not confine a host process.
 const names=new Set(secretNames.filter(Boolean).map(k=>k.toLowerCase()));
 return Object.fromEntries(Object.entries(input).filter(([key,value])=>!names.has(key.toLowerCase())&&!/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE|AUTH|APEX_HOME|_BASE_URL|DATABASE_URL|CONNECTION_STRING|(?:^|_)DSN$|NODE_OPTIONS|LD_PRELOAD|BASH_ENV/i.test(key)&&!secretValues.some(secret=>secret&&String(value).includes(secret))&&!/\w+:\/\/[^\s/@]+:[^\s/@]+@/.test(String(value))));
}
export async function sourceSnapshot(root){try{const snapshot=await attentionSource(root);return {hash:snapshot.hash,fileCount:snapshot.files.length,coverage:'bounded public project files',complete:true};}catch(error){return {hash:null,complete:false,reason:clean(error.message,300)};}}
export function taskIntelligence(store){
 async function rows(projectId,{shared=false}={}){await store.getProject(projectId);return (await store.records('events',{projectId,type:'task_brief'})).map(e=>e.data).filter(r=>visible(r,shared)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 async function get(projectId,id,options){const found=(await rows(projectId,options)).filter(r=>r.id===id||r.id.startsWith(id));if(found.length!==1)throw Error('Choose one unambiguous task ID');return found[0];}
 async function save(projectId,body,id,expected){
  await store.getProject(projectId);const old=id?await get(projectId,id):null;
  if(old&&expected!==old.hash)throw Error('Stale task preview; inspect the latest version before editing');
  const value={id:old?.id||'task_'+randomUUID(),projectId,version:(old?.version||0)+1,objective:clean(body.objective??old?.objective,6000),criteria:list(body.criteria??old?.criteria),constraints:list(body.constraints??old?.constraints),scope:list(body.scope??old?.scope),steps:list(body.steps??old?.steps),questions:list(body.questions??old?.questions),visibility:body.visibility??old?.visibility??'private',status:body.status??old?.status??'active',updatedAt:stamp(),createdAt:old?.createdAt||stamp()};
  if(!value.objective)throw Error('Task objective required');if(!['private','shared'].includes(value.visibility)||!['active','paused','accepted','abandoned'].includes(value.status))throw Error('Invalid task visibility/status');
  value.hash=hash(value);
  await store.transaction(state=>{const index=state.events.findIndex(e=>e.id===value.id),current=index>=0?state.events[index]:null;if(old&&current?.data.hash!==expected)throw Error('Stale task preview; another editor revised it');const event={id:value.id,type:'task_brief',projectId,data:value,updatedAt:stamp()};if(index<0)state.events.push(event);else state.events[index]=event;state.events.push({id:randomUUID(),projectId,type:'task_revision',createdAt:stamp(),data:{...value,source:'human-authored task guidance; never tool or spending authorization'}});});
  return value;
 }
 async function context(projectId,{shared=false,maxChars=6000}={}){const selected=(await rows(projectId,{shared})).filter(r=>r.status==='active').slice(0,3);return JSON.stringify(selected.map(r=>({citation:'task:'+r.id,version:r.version,objective:r.objective,criteria:r.criteria,constraints:r.constraints,scope:r.scope,steps:r.steps,questions:r.questions}))).slice(0,maxChars);}
 async function search(projectId,query,{shared=false,limit=15}={}){
  await store.getProject(projectId);const terms=clean(query,500).toLowerCase().split(/\s+/).filter(Boolean);if(!terms.length)return [];
  const sessions=(await store.records('sessions',{projectId})).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,200),matches=[];let scannedChars=0;
  for(const s of sessions){const session=s;if(shared&&session.visibility!=='shared')continue;for(const m of [...(session.messages||[])].reverse()){if(m.role==='tool')continue;const text=String(m.content||'');if(scannedChars+text.length>4000000)break;scannedChars+=text.length;const score=terms.reduce((n,t)=>n+(text.toLowerCase().includes(t)?1:0),0);if(!score)continue;const at=Math.max(0,text.toLowerCase().indexOf(terms.find(t=>text.toLowerCase().includes(t)))-120);matches.push({sessionId:s.id,messageId:m.id,role:m.role,createdAt:m.createdAt,score,excerpt:clean(text.slice(at,at+1000),1000),citation:'session:'+s.id+'#'+m.id});}}
  return matches.sort((a,b)=>b.score-a.score||String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,Math.min(50,Math.max(1,limit)));
 }
 async function evidence(projectId,jobId){
  const job=await store.record('jobs',jobId);if(!job||job.projectId!==projectId)throw Error('Job/project mismatch');
  const events=await store.records('events',{projectId,jobId}),requests=await store.records('requests',{jobId}),project=await store.getProject(projectId),snapshots=new Map(),checkEvents=events.filter(e=>e.type==='tool_evidence'&&e.data.tool==='run_shell');
  for(const e of checkEvents){const root=e.data.executionRoot||job.workingPath||project.path;if(!snapshots.has(root))snapshots.set(root,await sourceSnapshot(root));}
  const checks=checkEvents.map(e=>{const current=snapshots.get(e.data.executionRoot||job.workingPath||project.path),unchanged=e.data.sourceBefore?.complete&&e.data.source?.complete?e.data.sourceBefore.hash===e.data.source.hash:null;return {id:e.id,command:e.data.command||null,exitCode:e.data.result?.exitCode??null,ran:e.data.result?.exitCode!==undefined,passed:e.data.result?.exitCode===0,sourceUnchangedDuringCommand:unchanged,executionMode:e.data.result?.executionMode||'not recorded',sourceCurrent:e.data.result?.executionMode==='docker'?null:current.complete&&e.data.source?.complete&&unchanged!==null?unchanged&&current.hash===e.data.source.hash:null,sourceCoverage:e.data.source?.coverage||'not recorded'};});
  const edits=events.filter(e=>e.type==='tool_evidence'&&['write_file','patch_file'].includes(e.data.tool)&&!e.data.result?.error&&!e.data.result?.notExecuted).map(e=>({id:e.id,tool:e.data.tool}));
  return {jobId,status:job.status,edits,checks,unresolvedRequests:requests.filter(r=>['reserved','sent','unknown'].includes(r.state)).map(r=>r.id),statement:checks.some(c=>c.passed&&c.sourceCurrent===true)?'Recorded commands passed against current bounded public source. Check command coverage before accepting behavior.':checks.some(c=>c.passed)?'Commands passed, but their source is stale or freshness is unknown. Recheck before accepting behavior.':'No successful command execution receipt. Model text does not verify behavior.',humanAcceptanceRequired:true};
 }
 async function performance(projectId){const records=(await store.records('events',{projectId,type:'phase_timing'})).slice(-500),byPhase={};for(const e of records){const p=byPhase[e.data.phase]||={count:0,totalMs:0,maxMs:0};p.count++;p.totalMs+=e.data.durationMs;p.maxMs=Math.max(p.maxMs,e.data.durationMs);}return {sampleCount:records.length,byPhase,source:'local measured phase durations; overlapping phases must not be summed as wall-clock time'};}
 async function health(projectId){const project=await store.getProject(projectId),events=await store.records('events',{projectId}),jobs=await store.records('jobs',{projectId});return {project:project.name,waiting:jobs.filter(j=>j.status==='waiting_human').map(j=>j.id),failed:jobs.filter(j=>j.status==='failed').slice(-10).map(j=>({id:j.id,reason:j.summary||j.error||'Inspect job timeline'})),recentFailures:events.filter(e=>e.type==='runtime_failure').slice(-10).map(e=>e.data),isolation:'Host commands are not OS-confined. /isolation can select an explicit confined Docker copy for this project; /rehearse remains a separate trial.',sponsoredUsage:'disabled unless separately configured',telemetry:'local records only'};}
 return {list:rows,get,save,context,search,evidence,performance,health};
}

export function recommendModels(models,{contextTokens=0,localOnly=false,requireTools=true,maxInputPrice=null}={}){
 return models.map(m=>{const reasons=[];if(localOnly&&!m.local&&!['ollama','llamacpp','lmstudio'].includes(m.provider))reasons.push('local-only policy');if(contextTokens&&(!Number.isFinite(m.contextLength)||m.contextLength<contextTokens))reasons.push('context capacity unconfirmed or too small');if(requireTools&&!m.supportedParameters?.includes('tools')&&!/confirmed/i.test(m.capabilities||''))reasons.push('tool support unconfirmed');if(maxInputPrice!==null&&(!Number.isFinite(m.inputPrice)||m.inputPrice>maxInputPrice))reasons.push('input price unknown or above ceiling');return {...m,eligible:!reasons.length,reasons,score:Number.isFinite(m.inputPrice)&&Number.isFinite(m.outputPrice)?m.inputPrice+m.outputPrice:Infinity};}).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.score-b.score||a.id.localeCompare(b.id)).map(({score,...m})=>m);
}
