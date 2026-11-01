import path from 'node:path';
import {projectContracts} from '../server/project-contracts.js';

export const CONTRACT_HELP=`
 /requirements                 Human requirements, source-bound checks and freshness
 /requirements draft JSON      {title,statement,files,checks:[{name,command}],visibility}
 /requirements approve ID HASH | inspect ID | check JSON | publish ID HASH | export ID HASH FILE
 /teach                        Three-question project interview with exact approval
 /teach draft JSON | approve ID HASH | inspect ID
 /changeset                    Coordinate producer/consumer repositories and acceptance
 /changeset draft JSON | approve ID HASH | inspect ID | accept ID HASH PROJECT_ID
`;
const item=(value,label,description='')=>({value,label,description}),split=s=>{const n=s.indexOf(' ');return n<0?[s,'']:[s.slice(0,n),s.slice(n+1).trim()];};
export function projectContractCommands(c){
 const api=projectContracts(c.store),pid=()=>c.project().id,report=v=>c.print(typeof v==='string'?v:JSON.stringify(v,null,2));
 const choose=(title,items,description='')=>c.ui.dialog({title,items,description});
 const ask=async(title,placeholder='',description='')=>{const value=await c.ui.dialog({title,input:true,placeholder,description});if(value===null)throw Error('Menu cancelled');return value.trim();};
 const inspect=(title,value)=>choose(title,JSON.stringify(value,null,2).split('\n').flatMap(line=>line.match(/.{1,68}/gu)||['']).map(line=>item(true,line||' ')),'Exact selected record. Enter/Esc closes; inspection grants no permission.');
 const confirm=(title,description)=>choose(title,[item(false,'Cancel'),item(true,'Confirm')],description).then(v=>v===true);
 const guard=()=>{if(c.mode()==='plan')throw Error('Switch to Build before executing a local check');};
 async function requirementDraft(prior){
  const title=await ask('Requirement',prior?.terms.title),statement=await ask('What must remain true?',prior?.terms.statement),files=(await ask('Relevant source files · comma separated',prior?.terms.files.join(', '))).split(',').map(s=>s.trim()).filter(Boolean),checks=[];
  for(let n=0;n<8;n++){
   const old=prior?.terms.checks[n],name=await ask(n?'Another check name · blank ends':'Check name · blank skips',old?.name||'');if(!name)break;const command=await ask('Exact local check command',old?.command||'','Saving a command does not run it.');checks.push({...(old?{id:old.id}:{}),name,command});
  }
  const visibility=await choose('Context visibility',[item('private','Private project context'),item('shared','Shared-eligible context','Does not automatically publish to a room')]);if(!visibility)return;
  const r=await api.draftRequirement(pid(),{title,statement,files,checks,visibility},prior?{id:prior.id,expectedHash:prior.hash}:{});await inspect('Requirement draft v'+r.version,r);report('Draft '+r.id+' · approve its exact hash to make it context.');return r;
 }
 async function orientationDraft(prior){
  const purpose=await ask('1 / 3 · Who is this project for?',prior?.terms.purpose||'','Describe the people and outcome.'),constraints=await ask('2 / 3 · What must not break?',prior?.terms.constraints||''),authority=await ask('3 / 3 · Who gets the final say?',prior?.terms.authority||''),unknowns=await ask('Anything uncertain? · optional',prior?.terms.unknowns||''),visibility=await choose('Keep this orientation where?',[item('private','Private project context'),item('shared','Shared-eligible context','Review before any room publication')]);if(!visibility)return;
  const r=await api.draftOrientation(pid(),{purpose,constraints,authority,unknowns,visibility},prior?{id:prior.id,expectedHash:prior.hash}:{});await inspect('Project orientation draft',r);if(await confirm('Approve this orientation?',r.hash)){report(await api.approve(pid(),r.id,r.hash));}return r;
 }
 async function run(r,check){
  guard();const current=await api.inspect(pid(),r.id);if(current.hash!==r.hash)throw Error('Requirement changed; inspect it again');await inspect('Exact local command',{requirement:r.terms.title,version:r.version,hash:r.hash,check:check.name,command:check.command,cwd:c.project().path,limits:'30 seconds, 60KB output; shell is not an OS sandbox'});
  if(!await confirm('Execute this exact check locally?',check.command))return;
  const action=signal=>api.runCheck(pid(),r.id,r.hash,check.id,{approved:true,signal});report(c.runTask?await c.runTask(action):await action());report(await api.status(pid(),r.id));
 }
 async function recordMenu(kind){
  const list=await api.list(pid(),kind),value=await choose(kind==='requirement'?'Project requirements':'Teach the project',[item('new',kind==='requirement'?'New requirement':'Start three-question interview'),...list.slice(-40).reverse().map(r=>item(r.id,r.terms.title+' · v'+r.version,r.status+' · '+r.id.slice(0,8)))]);if(!value)return;if(value==='new')return kind==='requirement'?requirementDraft():orientationDraft();
  const r=await api.inspect(pid(),value),state=kind==='requirement'?await api.status(pid(),r.id):r;
  const action=await choose(r.terms.title+' · '+(state.state||r.status),[item('details','Inspect full record and evidence'),item('revise','Revise this version'),...(r.status==='draft'?[item('approve','Approve exact draft')]:[]),...(kind==='requirement'&&r.status==='approved'?state.checks.map(check=>item('check:'+check.id,'Run '+check.name,check.state)):[]),...(r.status==='approved'&&r.terms.visibility==='shared'?[item('publish','Publish shared contract snapshot')]:[]),item('export','Export inspected JSON')],(r.terms.statement||r.terms.purpose||'').slice(0,180));
  if(action==='details')return inspect(r.terms.title,state);
  if(action==='revise')return kind==='requirement'?requirementDraft(r):orientationDraft(r);
  if(action==='approve'){await inspect('Exact version to approve',r);if(await confirm('Approve this exact version?',r.hash))report(await api.approve(pid(),r.id,r.hash));}
  if(action?.startsWith('check:'))await run(r,r.terms.checks.find(x=>x.id===action.slice(6)));
  if(action==='publish'){guard();if(await confirm('Publish this exact approved context?',r.hash+' · includes declared command text, no check output or private revision history'))report(await api.publish(pid(),r.id,r.hash,c.rooms));}
  if(action==='export'){const file=await ask('New JSON file',path.join(c.project().path,'apex-'+kind+'.json'));if(await confirm('Export this inspected context?',file))report(await api.export(pid(),r.id,r.hash,file));}
 }
 async function changesetDraft(prior){
  const projects=await c.store.listProjects();if(projects.length<2)throw Error('Register at least two Git projects with /project before making a cross-repository changeset');
  const title=await ask('Change across repositories',prior?.terms.title||''),contract=await ask('Producer/consumer contract',prior?.terms.contract||'','Describe exact API/schema/version compatibility.'),participants=[];
  for(let i=0;i<10;i++){
   const available=projects.filter(p=>!participants.some(x=>x.projectId===p.id)),projectId=await choose(i?'Add consumer/repository':'Producer repository',[...(i>=2?[item(null,'Finish repositories')]:[]),...available.map(p=>item(p.id,p.name))]);if(!projectId){if(i<2)throw Error('Two repositories required');break;}
   const role=i?'consumer':'producer',requirements=(await api.list(projectId,'requirement')).filter(r=>r.status==='approved');if(!requirements.length)throw Error('Create and approve a requirement in '+projects.find(p=>p.id===projectId).name+' first');const requirementId=await choose('Bind '+role+' requirement',requirements.map(r=>item(r.id,r.terms.title,'v'+r.version)));if(!requirementId)return;participants.push({projectId,role,requirementId});if(participants.length===projects.length)break;
  }
  const visibility=await choose('Changeset context visibility',[item('private','Private'),item('shared','Shared-eligible')]);if(!visibility)return;
  const r=await api.changeset(pid(),{title,contract,participants,visibility},prior?{id:prior.id,expectedHash:prior.hash}:{});await inspect('Cross-repository changeset draft',r);report('Draft '+r.id+' · exact approval and each component acceptance remain separate.');
 }
 async function changesetMenu(){
  const list=await api.list(pid(),'changeset'),value=await choose('Cross-repository changesets',[item('new','New producer/consumer change'),...list.slice(-40).reverse().map(r=>item(r.id,r.terms.title,'v'+r.version+' · '+r.status))]);if(!value)return;if(value==='new')return changesetDraft();
  const r=await api.inspect(pid(),value),state=await api.changesetStatus(pid(),r.id);const action=await choose(r.terms.title+' · '+state.state,[item('details','Inspect exact contract and components'),item('revise','Revise declared contract'),...(r.status==='draft'?[item('approve','Approve exact changeset')]:state.participants.map(p=>item('accept:'+p.projectId,'Accept '+p.name,p.role+' · '+p.state+(p.accepted?' · already accepted':''))))]);
  if(action==='details')return inspect('Declared rollout · '+state.state,state);if(action==='revise')return changesetDraft(r);if(action==='approve'){await inspect('Exact cross-repository contract',r);if(await confirm('Approve this exact cross-repo contract?',r.hash))report(await api.approve(pid(),r.id,r.hash));}if(action?.startsWith('accept:')&&await confirm('Accept this exact component?','All bound selected checks must be current. This is not a deployment.'))report(await api.acceptParticipant(pid(),r.id,r.hash,action.slice(7)));
 }
 return {async command(name,rest){
  if(!['/requirements','/teach','/changeset'].includes(name))return false;
  if(!rest&&c.ui){if(name==='/requirements')await recordMenu('requirement');else if(name==='/teach')await recordMenu('orientation');else await changesetMenu();return true;}
  const [action,arg]=split(rest),kind=name==='/requirements'?'requirement':name==='/teach'?'orientation':'changeset';
  if(action==='draft'){const input=JSON.parse(arg);report(kind==='requirement'?await api.draftRequirement(pid(),input,input.id?{id:input.id,expectedHash:input.expectedHash}:{}):kind==='orientation'?await api.draftOrientation(pid(),input,input.id?{id:input.id,expectedHash:input.expectedHash}:{}):await api.changeset(pid(),input,input.id?{id:input.id,expectedHash:input.expectedHash}:{}));}
  else if(action==='approve'){const [id,hash]=arg.split(/\s+/);report(await api.approve(pid(),id,hash));}
  else if(action==='publish'){guard();const [id,hash]=arg.split(/\s+/);report(await api.publish(pid(),id,hash,c.rooms));}
  else if(action==='inspect')report(kind==='requirement'?await api.status(pid(),arg):kind==='changeset'?await api.changesetStatus(pid(),arg):await api.inspect(pid(),arg));
  else if(action==='check'&&kind==='requirement'){const input=JSON.parse(arg);guard();if(input.approved!==true)throw Error('Set approved:true only after reviewing the exact bound command');const fn=signal=>api.runCheck(pid(),input.id,input.hash,input.checkId,{approved:true,signal});report(c.runTask?await c.runTask(fn):await fn());}
  else if(action==='accept'&&kind==='changeset'){const [id,hash,projectId]=arg.split(/\s+/);report(await api.acceptParticipant(pid(),id,hash,projectId));}
  else if(action==='export'){const [id,hash,...file]=arg.split(/\s+/);report(await api.export(pid(),id,hash,file.join(' ')));}
  else report(await api.list(pid(),kind));return true;
 }};
}
