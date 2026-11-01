import {roomClient} from '../server/rooms.js';
import {groupChat} from '../server/group-chat.js';

export const GROUP_HELP=`
 /group                       Open shared chat and start live sync in this terminal
 /group pool [JSON]           Opt in your model, total/per-turn caps and Build scopes
 /group off                   Stop accepting new @apex calls on your key
 /group agents                People, live agents, scopes and pooled usage receipts
 /group target MEMBER_ID      Choose whose opted-in agent answers @apex (auto resets)
 /group steer TURN_ID TEXT    Steer your request at its next model boundary
 /group pull                  Copy bounded shared context into this personal chat
 /group resolve TURN_ID       Release reconciled billing holds without replaying work
 /group changes [publish]     Review source snapshots; explicitly share scoped changes
 /group apply CHANGE_ID       Preview and accept a collaborator's source changes
 /tabs [personal|group|ID]     Switch saved personal chats or the shared group tab
`;

const short=id=>id?.split(':').at(-1).slice(0,8);
export function groupCommands(c){
 let tab='personal',target,timer,syncing=false,lastBoard,activeRoom,closed=false;
 const shown=new Set(),active=new Map();
 const client=c.client||roomClient(c.store);
 const control=groupChat(c.store,client,{runtime:c.runtime,onChange:event=>{
  if(event.type==='timeline'){
   lastBoard=event.board;
   for(const row of event.board.messages){if(shown.has(row.id))continue;shown.add(row.id);if(tab==='group'&&event.roomId===activeRoom)c.print(`${row.data.role==='assistant'?'APEX':event.board.members.find(m=>m.id===row.sender)?.name||row.sender.slice(0,8)}: ${row.data.content}${row.invocation?'\n  @apex turn '+short(row.id)+' · owner '+row.invocation.target.slice(0,8):''}`);}
  }else if(event.type==='started'){active.set(event.messageId,event);c.print('Group agent started · '+short(event.messageId));}
  else if(event.type==='finished'){active.delete(event.messageId);c.print('Group agent '+event.status+' · '+short(event.messageId));}
  else if(event.type==='error'){active.delete(event.messageId);c.print('Group sync: '+event.message+'; saved work is not replayed.');}
  c.refresh?.();
 }});
 async function room(){const p=await c.store.getProject(c.project().id);if(!p.roomId)throw Error('Create or join with /room create URL or /room join first');return p.roomId;}
 async function sync(){if(syncing||closed||!activeRoom)return;syncing=true;try{await control.tick(activeRoom);}catch(e){c.print('Group sync paused: '+e.message);clearInterval(timer);timer=null;}finally{syncing=false;}}
 function start(){if(!timer){timer=setInterval(()=>sync(),3000);timer.unref();}}
 async function open(){activeRoom=await room();tab='group';c.ui?.setChatChannel('group:'+activeRoom);const board=await control.view(activeRoom);for(const row of board.messages.slice(-30)){shown.add(row.id);c.print(`${row.data.role==='assistant'?'APEX':board.members.find(m=>m.id===row.sender)?.name||row.sender.slice(0,8)}: ${row.data.content}`);}c.print('GROUP · ordinary text talks to people · @apex asks an opted-in agent · /tabs switches');start();await sync();}
 async function pool(){
  const roomId=await room(),old=(await c.store.record('rooms',roomId)).group||{},ui=c.ui;if(!ui)throw Error('Use /group pool JSON with explicit caps');
  const model=await ui.dialog({title:'Your group agent',description:'Your key stays here. Active members may call this allowance with @apex.',input:true,placeholder:old.model||c.model()});if(!model)return;
  const mode=await ui.dialog({title:'What may it do?',items:[{value:'plan',label:'Plan · inspect and answer'},{value:'build',label:'Build · isolated Git branch and file scopes'}]});if(!mode)return;
  const total=await ui.dialog({title:'Total allowance in USD',input:true,placeholder:String(old.maxUSD||0)});if(total===null)return;
  const turn=await ui.dialog({title:'Maximum per @apex turn in USD',input:true,placeholder:String(old.turnUSD||0)});if(turn===null)return;
  const multi=await ui.dialog({title:'Concurrent group agents?',description:'Each person owns their agent and approves its tools locally.',items:[{value:true,label:'Allow concurrent agents'},{value:false,label:'One group agent at a time'}]});if(multi===null)return;
  let scope=[];if(mode==='build'){const entered=await ui.dialog({title:'Owned paths, comma separated',description:'Public relative paths. No overlaps; clean committed Git repository required.',input:true,placeholder:old.scope?.join(',')||'src/login'});if(!entered)return;scope=entered.split(',').map(x=>x.trim());}
  await control.configure(roomId,{enabled:true,model,mode,maxUSD:Number(total),turnUSD:Number(turn),multiAgent:multi,scope});activeRoom=roomId;start();c.print('Group agent enabled with your explicit allowance. No key was shared.');await sync();
 }
 async function tabs(value){
  if(!value&&c.ui){const sessions=await c.store.listSessions(c.project().id);value=await c.ui.dialog({title:'Chats',items:[{value:'personal',label:'Personal agent',description:'Your current private chat'},{value:'group',label:'Shared group',description:'People + @apex'},...sessions.filter(s=>!s.title.startsWith('Group agent ')).slice(-20).map(s=>({value:s.id,label:s.title,description:s.id}))]});}
  if(!value)return;
  if(value==='group')return open();
  if(value!=='personal'){const s=await c.store.getSession(value);if(s.projectId!==c.project().id)throw Error('Chat belongs to a different project');c.selectSession(s);}
  tab='personal';c.ui?.setChatChannel('personal:'+c.session().id);c.print('PERSONAL · private agent · /group pull explicitly imports shared context');c.refresh?.();
 }
 return {control,client,channel(){return tab==='group'?'group:'+activeRoom:'personal:'+c.session().id;},get tab(){return tab;},get activeCount(){return active.size;},get sessionIds(){return [...active.values()].map(e=>e.sessionId);},label(){return (tab==='group'?'[ Group ]  Personal':'Group  [ Personal ]')+' · Ctrl+G tabs'+(active.size?' · '+active.size+' group agent active':'');},
  dashboard(){if(tab!=='group'||!lastBoard)return null;const b=lastBoard;return [{text:'Shared chat · '+b.members.length+' people · '+b.agents.filter(a=>a.enabled&&a.online).length+' online opted-in agents'},{text:'Owner-reported pool · $'+b.agents.reduce((n,a)=>n+a.spentUSD,0).toFixed(4)+' committed + $'+b.agents.reduce((n,a)=>n+a.reservedUSD,0).toFixed(4)+' active reservations'},{text:'Agent calls · target '+(target||'automatic')+' · @apex invokes / steers your active request'},{text:'Context · last 60 shared messages / 14,000 chars maximum · private history stays personal'},...b.runs.filter(r=>r.status==='running').slice(0,8).map(r=>({text:'Working · '+r.owner.slice(0,8)+' · '+(r.scope?.join(', ')||'read-only')}))];},
  async submit(content){if(tab!=='group')return false;activeRoom=await room();await control.send(activeRoom,content,{target});await sync();return true;},
  async menu(){return tabs();},
  async command(name,rest){
   if(tab==='group'&&['/history','/usage'].includes(name)){const board=await control.view(await room());if(name==='/history')c.print(board.messages.map(e=>e.sender.slice(0,8)+': '+e.data.content).join('\n\n'));else c.print(JSON.stringify(board.agents.map(a=>({memberId:a.memberId,model:a.model,ownerReportedUSD:a.spentUSD,reservedUSD:a.reservedUSD,allowanceUSD:a.maxUSD})),null,2));return true;}
   if(name==='/tabs'){await tabs(rest);return true;}if(name!=='/group')return false;
   const [action,...parts]=rest.split(/\s+/),arg=parts.join(' ');
   if(!rest)await open();
   else if(action==='pool'){if(arg){activeRoom=await room();await control.configure(activeRoom,JSON.parse(arg));start();await sync();c.print('Group agent enabled with your explicit allowance.');}else await pool();}
   else if(action==='off'){const id=await room(),config=(await c.store.record('rooms',id)).group;if(!config)throw Error('No local group allowance configured');await control.configure(id,{...config,enabled:false});c.print('Group agent disabled; saved usage retained.');}
   else if(action==='agents'){const board=await control.view(await room());c.print(board.agents.map(a=>`${a.name} · ${a.memberId}\n  ${a.enabled?'enabled':'off'} · ${a.online?'online':'offline'} · ${a.model} · ${a.mode} · concurrent ${a.multiAgent}\n  owner-reported committed $${a.spentUSD.toFixed(4)}, active reservations $${a.reservedUSD.toFixed(4)} / $${a.maxUSD} · ${a.scope.join(', ')||'read-only'}${a.conflicts.length?' · OWNERSHIP CONFLICT':''}`).join('\n')||'No agent allowances configured. /group pool');c.print(board.runs.filter(r=>r.status==='running').map(r=>'Working: '+r.owner+' · '+short(r.messageId)+' · '+r.scope?.join(', ')).join('\n'));}
   else if(action==='resolve'){c.print(JSON.stringify(await control.resolve(await room(),arg)));}
   else if(action==='target'){target=arg==='auto'?undefined:arg;c.print('Next @apex owner: '+(target||'automatic, least committed available allowance'));}
   else if(action==='steer'){const [id,...words]=parts;await control.steer(await room(),id,words.join(' '));c.print('Steering sent. Current request/tool finishes before the next model boundary.');}
   else if(action==='pull'){if(tab!=='personal')throw Error('Switch to your personal tab before importing context');c.print('Imported '+await control.pullContext(await room(),c.session().id)+' shared references.');}
   else if(action==='changes'){
    const id=await room();if(arg==='publish'){
     if(c.active?.())throw Error('Finish local agent work before publishing a stable source snapshot');
     const bundle=await control.snapshot(id);c.print(bundle.entries.map(e=>e.file+' · '+Buffer.byteLength(e.content)+' bytes · '+e.sha256.slice(0,12)).join('\n'));
     if(!c.ui||await c.ui.dialog({title:'Share these source files?',description:'Every room member can read these files. Review for secrets; private chat history is excluded.',items:[{value:false,label:'Cancel'},{value:true,label:'Publish to group'}]})!==true)throw Error('Source publication cancelled');
     const sent=await control.publishChanges(id,bundle);c.print('Shared change '+sent.id);
    }else{const board=await control.view(id);c.print(board.changes.map(e=>e.id+' · '+e.sender.slice(0,8)+' · '+e.data.bundle.entries.map(f=>f.file).join(', ')).join('\n')||'No shared source snapshots. Each owner publishes explicitly.');}
   }
   else if(action==='apply'){
    if(c.active?.()||c.mode?.()==='plan')throw Error('Switch to Build and finish active local work before applying source changes');
    const id=await room(),board=await control.view(id),change=board.changes.find(e=>e.id===arg||e.id.endsWith(':'+arg));if(!change)throw Error('Choose a shared change from /group changes');const config=(await c.store.record('rooms',id)).group;let workspace=false;if(config?.workspace&&c.ui){const destination=await c.ui.dialog({title:'Where should these files go?',items:[{value:'project',label:'Project checkout'},{value:'workspace',label:'Your agent worktree',description:'Agent can inspect the imported code on its next turn'}]});if(!destination)throw Error('Source sync cancelled');workspace=destination==='workspace';}const preview=await control.previewChanges(id,change.id,{workspace});c.print('Destination: '+preview.destination);c.print(preview.rows.map(r=>r.file+(r.unchanged?' · already present':' · '+Buffer.byteLength(r.content)+' bytes')).join('\n'));
    if(!c.ui||await c.ui.dialog({title:'Apply collaborator files?',description:'Existing local changes are preserved on conflicts. Backup receipt retained; no code is executed or committed.',items:[{value:false,label:'Cancel'},{value:true,label:'Apply source snapshot'}]})!==true)throw Error('Source sync cancelled');c.print(JSON.stringify(await control.applyChanges(id,change.id,preview.bundleHash,{workspace})));
   }
   else throw Error('Use /group, pool, off, agents, target, steer or pull');return true;
  },async cancel(){for(const e of active.values())await c.runtime.cancel({sessionId:e.sessionId});},async close(){closed=true;clearInterval(timer);await control.close();}};
}
