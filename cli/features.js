import path from 'node:path';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {jobs} from '../server/jobs.js';import {startWorker} from '../server/worker.js';import * as git from '../server/git-project.js';import {localVault,projectVault} from '../server/vault.js';import {retrieveMemory} from '../server/memory.js';import {installPack,validatePack,exportChat,importChat,evaluationCase} from '../server/bundles.js';import {roomClient} from '../server/rooms.js';import {peerPool} from '../server/pool.js';import {portableMessage} from '../server/safe-content.js';import {installPlugin} from '../server/obsidian.js';

export const FEATURE_HELP=`

Persistent work and collaboration:

 /board                         Jobs, agents, approvals/evidence and budget holds

 /job new <JSON>                {goal,model,maxUSD,mode}; creates a saved job

 /job show|start|cancel|resume ID  Inspect, detached start, stop or explicitly queue

 /job reconcile REQUEST USD     Record an actual reconciled charge

 /timeline [JOB_ID]             Saved tool evidence, checkpoints and reviews

 /repo init|status|connect URL|sync|save MESSAGE|push MESSAGE

 /repo clone <JSON>             {remote,destination}; clone and select project

 /repo watch SECONDS|off        Explicit opt-in periodic save/push/fast-forward

 /project-copy DESTINATION      Copy safe files, preserving conflicts

 /checkpoint [LABEL]            Bookmark clean committed Git state

 /rewind CHECKPOINT_ID          Switch to a new restoration branch

 /integrate AGENT_BRANCH        Explicitly merge a reviewed agent branch

 /context inspect               Last model-context selection and interrupted tool notices

 /context private|shared|combined  Select local and/or published context

 /memory find QUERY             Ranked facts with citations and stale markers

 /vault init [PATH]             Create/configure a local Markdown vault

 /vault search QUERY            Bounded local note excerpts with citations

 /vault note <JSON>             {title,content,visibility,kind}; linked local note

 /vault import                 Import Obsidian outbox drafts locally, once

 /vault plugin                 Install plugin files into selected vault, never enable

 /pack inspect|install FILE     Validate/install MCP pack, no auto-connection

 /share export|import FILE      Portable selected-chat bundle, secrets scrubbed

 /share publish                Confirm publishing this chat to the joined room

 /eval <JSON>                   {file,expected,jobId,trainingCandidate}; selected chat

 /room create URL              Hidden hub owner token; create and connect a group

 /room join                    Hidden invitation prompt

 /room invite [member|viewer]  Display a private single-use invitation after warning

 /room say TEXT                Publish this text only, not private history

 /room watch SECONDS|off        Opt-in periodic group pull into the local vault

 /room pull|members|leave      Sync group notes, inspect members or leave
 /room status                 Inspect room and hub storage usage/limits

 /room tell MEMBER_ID TEXT     Send a targeted peer-agent message

 /room revoke MEMBER_ID        Owner revokes a member's hub access

 /pool on MODEL USD|off         Opt in with your own local key and total allowance

 /pool offer <JSON>            {target,goal,maxUSD}; ask another member's agent

 /pool inbox|accept TASK|cancel TASK  Explicitly accept read-only work or cancel



Headless commands: apex hub --home PATH [--port 8789 --cert FILE --key FILE]

Workers and hub start only when explicitly requested. Keys stay on their owner.

`;

export function featureCommands(c){const ledger=jobs(c.store),rooms=c.rooms||roomClient(c.store),pool=peerPool(c.store,rooms);let watcher=null,watchBusy=false,roomWatcher=null,roomBusy=false;

 const output=value=>c.print(typeof value==='string'?value:JSON.stringify(value,null,2)),split=text=>{const i=text.indexOf(' ');return i<0?[text,'']:[text.slice(0,i),text.slice(i+1).trim()];};

 async function roomId(){const p=await c.store.getProject(c.project().id);if(!p.roomId)throw Error('Create or join a room first');return p.roomId;}

 const writeGuard=()=>{if(c.mode()==='plan')throw Error('Plan mode blocks this action. Switch with /build first.');};

 async function command(name,rest){const p=c.project(),s=c.session(),[action,arg]=split(rest);

  if(name==='/board'){const rows=await c.store.records('jobs',{projectId:p.id}),summaries=await Promise.all(rows.slice(-12).map(j=>ledger.summary(j.id))),agents=await c.store.listAgents(p.id),events=await c.store.records('events',{projectId:p.id});const context=(await c.store.getProject(p.id)).contextMode||'private';output(['APEX workspace · '+p.name,'Context '+context.toUpperCase()+' · approvals '+(c.pendingApprovals?.()||0)+' · tool evidence '+events.filter(e=>e.type==='tool_evidence').length+' · reviews '+events.filter(e=>e.type==='team_review').length,'','JOBS',...(summaries.length?summaries.map(j=>j.id.slice(0,8)+'  '+j.status+'  '+j.goal.slice(0,70)+'\n  '+j.model+' · billed $'+j.billedUSD.toFixed(4)+' · held $'+j.heldUSD.toFixed(4)+' · budget $'+j.maxUSD.toFixed(4)):['No saved jobs. Create one with /job new {goal,model,maxUSD}.']),'','AGENTS',...(agents.length?agents.map(a=>a.name+' · '+a.status+' · '+a.model+'\n  '+(a.branch||'')+' · '+a.scope.join(', ')):['No active team. /team proposes isolated workers.'])].join('\n'));return true;}

  if(name==='/job'){if(action==='new'){const input=JSON.parse(arg);if(input.maxUSD===undefined)throw Error('Specify maxUSD explicitly');output(await ledger.create({...input,projectId:p.id,sessionId:s.id,model:input.model||c.model(),mode:input.mode||'plan'}));}else if(action==='show')output(await ledger.summary(arg));else if(action==='start'){const job=await ledger.summary(arg);if(job.projectId!==p.id)throw Error('Select the job project first');if(job.mode==='build')writeGuard();output(await startWorker(c.store.home,arg));}else if(action==='cancel')output(await ledger.cancel(arg));else if(action==='resume')output(await ledger.resume(arg));else if(action==='reconcile'){const [id,cost]=split(arg);output(await ledger.reconcile(id,Number(cost)));}else output(await c.store.records('jobs',{projectId:p.id}));return true;}

  if(name==='/timeline'){output(await c.store.records('events',rest?{projectId:p.id,jobId:rest}:{projectId:p.id}));return true;}

  if(name==='/repo'){if(action==='status'||!action){output(await git.repoInfo(p.path));return true;}writeGuard();if(action==='init')output(await git.initRepo(p.path));else if(action==='connect')output(await git.connectRepo(p.path,arg));else if(action==='clone'){const input=JSON.parse(arg);const result=await git.cloneRepo(input.remote,input.destination);await c.selectProject(result.root);output(result);}else if(action==='sync')output(await git.syncRepo(p.path));else if(action==='save'||action==='push')output(await git.saveRepo(p.path,arg,{push:action==='push'}));else if(action==='watch'){if(watcher)clearInterval(watcher);watcher=null;if(arg==='off'){output('Git watch stopped.');return true;}const seconds=Number(arg);if(!Number.isFinite(seconds)||seconds<15||seconds>3600)throw Error('Choose 15-3600 seconds or off');const watched=p;watcher=setInterval(async()=>{if(watchBusy)return;watchBusy=true;try{await git.saveRepo(watched.path,'APEX watched project save',{push:true});const sync=await git.syncRepo(watched.path);if(!sync.synced)throw Error(sync.reason);}catch(e){clearInterval(watcher);watcher=null;output('Git watch stopped: '+e.message);}finally{watchBusy=false;}},seconds*1000);watcher.unref();output('Opt-in Git save/push/sync watch enabled. Stops on conflicts/errors.');}else throw Error('Use /repo status, init, connect, clone, sync, save, push or watch');return true;}

  if(name==='/project-copy'){writeGuard();output(await git.copyProject(p.path,rest));return true;}

  if(name==='/checkpoint'){writeGuard();output(await git.checkpoint(c.store,p.id,rest));return true;}

  if(name==='/rewind'){writeGuard();output(await git.restoreCheckpoint(c.store,p.id,rest));return true;}

  if(name==='/integrate'){writeGuard();const agent=(await c.store.listAgents(p.id)).find(a=>a.branch===rest);if(!agent||agent.status!=='review_pending')throw Error('Choose a reviewed agent branch from /agents');output(await git.integrateBranch(p.path,rest));return true;}

  if(name==='/context'){if(rest==='inspect'){const rows=await c.store.records('events',{projectId:p.id,type:'context_projection'});output(rows.filter(e=>e.data.sessionId===c.session().id&&!e.data.agentId).at(-1)?.data||{notice:'No model context projection recorded for this chat yet.'});}else if(rest)output(await rooms.setContext(p.id,rest));else output((await c.store.getProject(p.id)).contextMode||'private');return true;}

  if(name==='/memory'&&action==='find'){output(await retrieveMemory(c.store,p.id,arg));return true;}

  if(name==='/vault'){if(action==='init'){writeGuard();const root=path.resolve(arg||path.join(p.path,'APEX-Vault')),vault=localVault(root);output(await vault.init());await c.store.updateProject(p.id,{vaultPath:root});await c.celebrate?.({title:'Vault ready',detail:root});return true;}const vault=await projectVault(c.store,p.id);if(!vault)throw Error('Choose /vault init [PATH] first');if(action==='search')output(await vault.search(arg));else if(action==='note'){writeGuard();output(await vault.note(JSON.parse(arg)));}else if(action==='import'){writeGuard();output(await vault.importOutbox());}else if(action==='plugin'){writeGuard();output(await installPlugin(vault.root));}else output({root:vault.root});return true;}

  if(name==='/pack'){const raw=await readFile(arg);if(raw.length>200000)throw Error('Tool pack exceeds 200KB');const pack=validatePack(JSON.parse(raw));if(action==='inspect')output(pack);else if(action==='install'){writeGuard();output(await installPack(c.store,pack));}else throw Error('Use /pack inspect|install FILE');return true;}

  if(name==='/share'){if(action==='export'){writeGuard();output(await exportChat(c.store,s.id,path.resolve(arg)));}else if(action==='import'){writeGuard();const session=await importChat(c.store,p.id,path.resolve(arg));c.selectSession(session);output({sessionId:session.id});}else if(action==='publish'){const id=await roomId(),messages=(await c.store.getSession(s.id)).messages.filter(m=>['user','assistant'].includes(m.role));if(!await c.confirm(`Publish ${messages.length} messages from this chat to room ${id}? Private text in these selected messages will be shared.`))throw Error('Publication cancelled');for(const m of messages)await rooms.post(id,{type:'message',...portableMessage(m),source:{sessionId:s.id,messageId:m.id}});output({published:messages.length});}else throw Error('Use /share export FILE, import FILE or publish');return true;}

  if(name==='/eval'){writeGuard();output(await evaluationCase(c.store,{...JSON.parse(rest),sessionId:s.id}));return true;}

  if(name==='/room'){if(action==='create'){const token=await c.secret('Hub owner token (hidden):');output(await rooms.create(p.id,arg,token,p.name));}else if(action==='join'){const invitation=await c.secret('Single-use room invitation (hidden):');output(await rooms.join(p.id,invitation));}else{const id=await roomId();if(action==='invite'){if(!await c.confirm('Show a private room invitation? Anyone holding it can join once and read shared room history.'))throw Error('Invitation cancelled');output(await rooms.invite(id,arg||'member'));}else if(action==='say')output(await rooms.post(id,{type:'message',role:'user',content:arg}));else if(action==='tell'){const [target,text]=split(arg);output(await rooms.post(id,{type:'message',role:'peer',content:text},{audience:[target]}));}else if(action==='pull'){const events=await rooms.pull(id);output({received:events.length,messages:events.filter(e=>e.data.type==='message').map(e=>({sender:e.sender,content:e.data.content}))});}else if(action==='watch'){if(roomWatcher)clearInterval(roomWatcher);roomWatcher=null;if(arg==='off'){output('Group sync stopped.');return true;}const seconds=Number(arg||10);if(!Number.isFinite(seconds)||seconds<5||seconds>3600)throw Error('Choose 5-3600 seconds or off');roomWatcher=setInterval(async()=>{if(roomBusy)return;roomBusy=true;try{const events=await rooms.pull(id);if(events.length)output({groupMessagesReceived:events.length,vault:'Updated local linked notes'});}catch(e){clearInterval(roomWatcher);roomWatcher=null;output('Group sync stopped: '+e.message);}finally{roomBusy=false;}},seconds*1000);roomWatcher.unref();output('Group sync enabled for this terminal session.');}else if(action==='status')output(await rooms.status(id));else if(action==='members')output(await rooms.members(id));else if(action==='revoke')output(await rooms.revoke(id,arg));else if(action==='leave')output(await rooms.leave(id));else output(await c.store.record('rooms',id));}return true;}

  if(name==='/pool'){const id=await roomId();if(action==='on'){const [model,usd]=split(arg);output(await pool.configure(id,{enabled:true,model,maxUSD:Number(usd)}));}else if(action==='off'){const current=await c.store.record('rooms',id);output(await pool.configure(id,{enabled:false,model:current.pool?.model,maxUSD:current.pool?.maxUSD||0}));}else if(action==='offer')output(await pool.offer(id,JSON.parse(arg)));else if(action==='inbox')output(await pool.inbox(id));else if(action==='accept'){if(!await c.confirm('Accept this peer task using your local model/key within your configured pool allowance? Execution is read-only and interactive tools are denied.'))throw Error('Task acceptance cancelled');output(await pool.accept(id,arg));}else if(action==='cancel')output(await pool.cancel(id,arg));else output((await c.store.record('rooms',id)).pool||{enabled:false});return true;}

  return false;

 }

 return {command,close(){if(watcher)clearInterval(watcher);if(roomWatcher)clearInterval(roomWatcher);watcher=null;roomWatcher=null;}};

}

