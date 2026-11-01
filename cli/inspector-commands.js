import {taskIntelligence,recommendModels} from '../server/task-intelligence.js';
import {privatePath} from '../server/safe-content.js';

export const INSPECTOR_HELP=`
 /workbench                  Task, context, evidence and diagnostics menus
 /task-brief                 Create or inspect durable objectives and constraints
 /history-search WORDS       Search saved chats in this project without inference
 /evidence JOB_ID            Actual command and edit receipts, never model claims
 /route [local]              Explain configured model eligibility; never substitutes models
 /perf                       Measured local phase durations
 /health                     Waiting work, recent failures and isolation limits
 /isolation                  Choose approved host execution or confined Docker copies
`;
const item=(value,label,description='')=>({value,label,description});
export function inspectorCommands(c){
 const api=taskIntelligence(c.store),show=value=>c.print(typeof value==='string'?value:JSON.stringify(value,null,2));
 async function isolation(){
  const settings=await c.store.readSettings(),current=settings.executionProfiles?.[c.project().id]||{mode:'host'};
  if(!c.ui){show(current);return;}
  const mode=await c.ui.dialog({title:'Command execution',description:'Current: '+current.mode+'. Commands still require approval. Docker needs an already-installed immutable Linux image.',items:[item('inspect','Inspect current profile'),item('host','Host terminal','No OS confinement; approved commands can access this user account'),item('docker','Confined selected-file copy','No network or credentials. Keep outputs for review; never overwrite host source.')]});if(!mode)return;if(mode==='inspect'){show(current);return;}
  let profile={mode};if(mode==='docker'){
   const image=await c.ui.dialog({title:'Installed image SHA-256',description:'sha256: followed by 64 hexadecimal characters. APEX will not download it.',input:true});if(image===null)return;if(!/^sha256:[a-f0-9]{64}$/.test(image.trim()))throw Error('Use an exact installed image SHA-256');
   const value=await c.ui.dialog({title:'Public files or folders to copy',description:'Comma-separated literal project paths. No private state, symlinks, credentials or host mounts.',input:true});if(value===null)return;
   const files=value.split(',').map(v=>v.trim()).filter(Boolean);if(!files.length||files.length>40||files.some(f=>privatePath(f)||/^[\/]|[\\:*?\x00-\x1f]/.test(f)||f.split('/').some(p=>!p||p==='.'||p==='..')))throw Error('Choose 1-40 literal public project paths');profile={mode,image:image.trim(),files,timeoutMs:30000};
  }
  if(await c.ui.dialog({title:'Save this project execution profile?',description:JSON.stringify(profile)+'\nNo command runs now. Isolated outputs stay in local evidence for review.',items:[item(false,'Cancel'),item(true,'Save exact profile')]})!==true)return;
  await c.store.transaction(state=>{state.settings.executionProfiles||={};state.settings.executionProfiles[c.project().id]=profile;});show(profile);
 }
 async function brief(){
  const rows=await api.list(c.project().id);if(!c.ui){show(rows);return;}
  const id=await c.ui.dialog({title:'Durable task brief',description:'Human-owned task guidance survives history trimming and model switches. It never grants permissions.',items:[item('new','Create task brief'),...rows.map(t=>item(t.id,t.objective.slice(0,70),t.status+' · v'+t.version+' · '+t.visibility))]});if(!id)return;
  if(id==='new'){
   const objective=await c.ui.dialog({title:'What should APEX finish?',input:true});if(!objective?.trim())return;
   const criteria=await c.ui.dialog({title:'Acceptance criteria',description:'One per line. Optional. APEX must still record real checks.',input:true});if(criteria===null)return;
   const constraints=await c.ui.dialog({title:'Important constraints',description:'One per line. Optional. Keep instructions short and specific.',input:true});if(constraints===null)return;
   const visibility=await c.ui.dialog({title:'Task visibility',items:[item('private','Private to this profile'),item('shared','Eligible for shared context')]});if(!visibility)return;
   show(await api.save(c.project().id,{objective,criteria:criteria.split('\n'),constraints:constraints.split('\n'),visibility}));return;
  }
  const t=await api.get(c.project().id,id),action=await c.ui.dialog({title:t.objective,description:t.criteria.join('\n')+'\n'+t.constraints.join('\n')+'\nv'+t.version+' · '+t.hash.slice(0,12),items:[item('inspect','Inspect full brief'),item('edit','Revise objective'),item('active','Activate'),item('paused','Pause'),item('accepted','Mark accepted by me'),item('abandoned','Abandon')]});if(!action)return;if(action==='inspect'){show(t);return;}if(action==='edit'){const objective=await c.ui.dialog({title:'Revise task objective',description:t.objective,input:true});if(objective?.trim())show(await api.save(c.project().id,{objective},t.id,t.hash));}else{if(action==='accepted'&&await c.ui.dialog({title:'Record your acceptance?',description:'This records your decision, not an automatic claim that tests prove every requirement.',items:[item(false,'Keep current state'),item(true,'Record my acceptance')]})!==true)return;show(await api.save(c.project().id,{status:action},t.id,t.hash));}
 }
 return {async command(name,rest=''){
  if(name==='/workbench'){
   if(!c.ui){show(INSPECTOR_HELP);return true;}
   const action=await c.ui.dialog({title:'APEX workbench',description:'Inspect work without another model call.',items:[item('/task-brief','Task objectives and constraints'),item('/attention','Questions waiting for you'),item('/context inspect','Current context and recovery'),item('/history-search','Search saved chats'),item('/route','Model eligibility'),item('/perf','Performance timings'),item('/health','Diagnostics'),item('/isolation','Command execution boundaries'),item('/mcp-policy','Exact temporary MCP permissions'),item('/group','Shared workspace'),item('/vault','Vault connections')]});if(action==='/history-search'){const q=await c.ui.dialog({title:'Search this project’s saved chats',input:true});if(q)show(await api.search(c.project().id,q,{shared:c.project().contextMode==='shared'}));}else if(action)await c.command(action);return true;
  }
  if(name==='/task-brief'){await brief();return true;}
  if(name==='/history-search'){show(await api.search(c.project().id,rest,{shared:c.project().contextMode==='shared'}));return true;}
  if(name==='/evidence'){show(await api.evidence(c.project().id,rest.trim()));return true;}
  if(name==='/perf'){show(await api.performance(c.project().id));return true;}
  if(name==='/health'){show(await api.health(c.project().id));return true;}
  if(name==='/isolation'){await isolation();return true;}
  if(name==='/route'){const models=await c.runtime.listModels();const eligible=recommendModels(models,{localOnly:rest.trim()==='local'});show({policy:'Suggestions only. Explicit model selection is preserved. Unknown capabilities are not treated as confirmed.',models:eligible.slice(0,40).map(m=>({id:m.id,eligible:m.eligible,reasons:m.reasons,inputPrice:m.inputPrice,outputPrice:m.outputPrice,contextLength:m.contextLength,capabilities:m.capabilities}))});return true;}
  return false;
 }};
}
