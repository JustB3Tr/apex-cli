import {readFile,stat,realpath,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {digest,scrub,privatePath} from './safe-content.js';
import {scopedPath,fileRead} from './runtime/files.js';
import {repoInfo} from './git-project.js';
import {repositoryIdentity,reduceCollaboration} from './collaboration.js';
import {roomClient} from './rooms.js';

export const packetHash=packet=>digest(JSON.stringify(packet));
const id=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export function validatePacket(packet){
 if(!packet||packet.type!=='apex-context-packet'||packet.schema!==1||!id(packet.id)||!Number.isInteger(packet.version)||packet.version<1||typeof packet.purpose!=='string'||!packet.purpose.trim()||packet.purpose.length>1000||!Array.isArray(packet.sources)||packet.sources.length>30||!Array.isArray(packet.recipients)||packet.recipients.length>30||packet.recipients.some(v=>!id(v))||!Number.isFinite(Date.parse(packet.expiresAt))||!Number.isFinite(Date.parse(packet.createdAt))||Date.parse(packet.expiresAt)<=Date.parse(packet.createdAt)||Date.parse(packet.expiresAt)-Date.parse(packet.createdAt)>7*86400000)throw Error('Invalid context packet');
 if(packet.policy?.untrusted!==true||!Array.isArray(packet.policy?.permissionGrants)||packet.policy.permissionGrants.length!==0||packet.policy?.executable!==false)throw Error('Packets grant no permissions');
 if(packet.roomId!==null&&(!id(packet.roomId)||!id(packet.authorMemberId)))throw Error('Invalid destination/author');
 for(const source of packet.sources){if(!source||typeof source.key!=='string'||typeof source.content!=='string'||source.content.length>30000||source.contentHash!==digest(source.content)||!['file','vault-note','chat-message','task','decision'].includes(source.kind)||!source.provenance||typeof source.provenance.observedAt!=='string')throw Error('Invalid packet source/hash');}if(new Set(packet.sources.map(s=>s.key)).size!==packet.sources.length)throw Error('Duplicate packet source');
 if(Buffer.byteLength(JSON.stringify(packet))>60000)throw Error('Packet exceeds 60KB; select less context');
 return packet;
}
export function assertPacketClean(packet){validatePacket(packet);if(scrub(JSON.stringify(packet))!==JSON.stringify(packet))throw Error('Possible secret in packet; revise and review it');return packet;}
export function packetDiff(previous,current){
 const before=new Map((previous?.sources||[]).map(s=>[s.key,s])),after=new Map(current.sources.map(s=>[s.key,s]));
 return {previousVersion:previous?.version||null,version:current.version,purposeChanged:Boolean(previous&&previous.purpose!==current.purpose),expiryChanged:Boolean(previous&&previous.expiresAt!==current.expiresAt),audienceChanged:Boolean(previous&&(previous.roomId!==current.roomId||JSON.stringify(previous.recipients)!==JSON.stringify(current.recipients))),added:[...after.keys()].filter(k=>!before.has(k)),removed:[...before.keys()].filter(k=>!after.has(k)),changed:[...after.keys()].filter(k=>before.has(k)&&before.get(k).contentHash!==after.get(k).contentHash),sourceChanged:[...after.keys()].filter(k=>before.has(k)&&before.get(k).provenance.sourceHash!==after.get(k).provenance.sourceHash)};
}
export function contextPackets(store,client=roomClient(store)){
 async function rows(projectId){return store.records('events',{projectId,type:'context_packet'});}
 async function current(projectId,packetId){return (await rows(projectId)).filter(e=>e.data.packet.id===packetId).sort((a,b)=>b.data.packet.version-a.data.packet.version)[0];}
 async function sourceValue(project,selection){
  if(selection.kind==='file'||selection.kind==='vault-note'){
   const root=selection.kind==='file'?project.path:project.vaultPath;if(!root)throw Error('Choose a vault first');
   const relative=selection.path;if(typeof relative!=='string'||privatePath(relative)||selection.kind==='vault-note'&&!/^(Shared|Tasks|Decisions|Chats)\//.test(relative.replaceAll('\\','/')))throw Error('Only explicit non-private source paths are allowed');
   const actual=await scopedPath(root,relative),base=await realpath(root);if(privatePath(path.relative(base,actual)))throw Error('Private canonical source');
   const text=await fileRead(root,relative),lines=text.split(/\r?\n/),start=selection.start??1,end=selection.end??lines.length;
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>lines.length)throw Error('Invalid selected line range');
   const info=await stat(actual);return {key:selection.kind+':'+relative+':'+start+'-'+end,kind:selection.kind,content:lines.slice(start-1,end).join('\n'),provenance:{path:relative,start,end,sourceHash:digest(text),modifiedAt:info.mtime.toISOString(),observedAt:new Date().toISOString()},locator:{kind:selection.kind,path:relative,sourceHash:digest(text)}};
  }
  if(selection.kind==='chat-message'){
   const session=await store.getSession(selection.sessionId);if(session.projectId!==project.id)throw Error('Chat belongs to a different project');const message=session.messages.find(m=>m.id===selection.messageId&&!m.agentId&&['user','assistant'].includes(m.role));if(!message||typeof message.content!=='string')throw Error('Choose a saved user/assistant text message');
   return {key:'chat:'+session.id+':'+message.id,kind:selection.kind,content:message.content,provenance:{sessionId:session.id,messageId:message.id,role:message.role,createdAt:message.createdAt,observedAt:new Date().toISOString(),privateSelection:true},locator:{kind:selection.kind,sessionId:session.id,messageId:message.id,sourceHash:digest(message.content)}};
  }
  if(!['task','decision'].includes(selection.kind)||!project.roomId)throw Error('Choose a supported source');
  const board=reduceCollaboration(await store.records('events',{roomId:project.roomId,type:'room_event'})),record=board[selection.kind==='task'?'tasks':'decisions'].find(r=>r.id===selection.id);if(!record)throw Error('Shared source not found; pull the room first');
  const text=JSON.stringify(record);return {key:selection.kind+':'+record.id,kind:selection.kind,content:text,provenance:{roomId:project.roomId,id:record.id,version:record.version,termsHash:record.hash,observedAt:new Date().toISOString()},locator:{kind:selection.kind,id:record.id,sourceHash:digest(text)}};
 }
 async function freshness(row){const p=await store.getProject(row.projectId),changed=[];for(const source of row.data.locators){try{const value=await sourceValue(p,source);if(value.locator.sourceHash!==source.sourceHash)changed.push(source.kind+':'+(source.path||source.messageId||source.id));}catch(error){changed.push(source.kind+': unavailable ('+error.message+')');}}return {stale:changed.length>0,changed};}
 return {list:rows,current,freshness,
  async draft(projectId,{packetId,purpose,roomId=null,recipients=[],expiresMinutes=60,sources=[],redactions=[]}={}){
   const project=await store.getProject(projectId),prior=packetId?await current(projectId,packetId):null;if(packetId&&!prior)throw Error('Unknown packet in this project');if(prior&&['sending','unknown'].includes(prior.data.state))throw Error('Reconcile the uncertain prior publication before creating a new revision');
   if(!Array.isArray(sources)||sources.length>30||!Array.isArray(redactions)||redactions.length>30||redactions.some(v=>typeof v!=='string'||!v||v.length>500))throw Error('Bounded source/redaction selections required');
   if(!Number.isFinite(expiresMinutes)||expiresMinutes<1||expiresMinutes>10080)throw Error('Choose 1 minute to 7 days');
   let authorMemberId=null;if(roomId){if(roomId!==project.roomId)throw Error('Choose this project room');const m=await client.membership(roomId),members=await client.members(roomId);authorMemberId=m.memberId;if(recipients.some(r=>!members.some(m=>m.id===r&&!m.revoked)))throw Error('Choose active room recipients');}
   const built=[];for(const selection of sources)built.push(await sourceValue(project,selection));
   const repo=await repoInfo(project.path),packet={type:'apex-context-packet',schema:1,id:prior?.data.packet.id||randomUUID(),version:(prior?.data.packet.version||0)+1,previousHash:prior?.data.hash||null,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+expiresMinutes*60000).toISOString(),purpose:scrub(String(purpose||'')).trim(),roomId,authorMemberId,recipients:[...new Set(recipients)],project:{name:scrub(project.name),repository:repositoryIdentity(repo.remote)||null,base:repo.head||null},sources:built.map(({locator,...s})=>{let content=scrub(s.content);for(const secret of redactions)content=content.split(secret).join('[REDACTED BY USER]');return {...s,content,contentHash:digest(content)};}),policy:{untrusted:true,executable:false,permissionGrants:[],expiryCannotEraseReceivedCopies:true}};
   assertPacketClean(packet);const hash=packetHash(packet),eventId=randomUUID();return store.transaction(s=>{const latest=s.events.filter(e=>e.projectId===projectId&&e.type==='context_packet'&&e.data.packet.id===packet.id).sort((a,b)=>b.data.packet.version-a.data.packet.version)[0];if((latest?.data.hash||null)!==packet.previousHash)throw Error('Packet changed while drafting; inspect current version');const row={id:randomUUID(),projectId,type:'context_packet',createdAt:packet.createdAt,data:{packet,hash,eventId,state:'draft',locators:built.map(s=>s.locator),diff:packetDiff(prior?.data.packet,packet)}};s.events.push(row);return row;});
  },
  async publish(projectId,packetId,expectedHash){
   const row=await current(projectId,packetId);if(!row||row.data.hash!==expectedHash||packetHash(row.data.packet)!==expectedHash)throw Error('Packet changed since preview');const {packet,hash,eventId}=row.data;assertPacketClean(packet);if(!packet.roomId)throw Error('This is a local-only packet');if(Date.parse(packet.expiresAt)<=Date.now())throw Error('Packet expired');
   const m=await client.membership(packet.roomId);if(m.projectId!==projectId||m.memberId!==packet.authorMemberId)throw Error('Packet author/destination mismatch');
   await client.pull(packet.roomId);const received=(await store.records('events',{roomId:packet.roomId,type:'room_event'})).find(e=>e.id.endsWith(':'+eventId)&&e.sender===m.memberId&&e.data?.packetHash===hash);
   if(received){await store.saveRecord('events',{...row,data:{...row.data,state:'published',publishedAt:received.createdAt}});return {packetId,hash,alreadyPublished:true};}
   if(row.data.state!=='draft')throw Error('Publication outcome unknown; inspect/pull the room before retrying');if((await freshness(row)).stale)throw Error('Source changed since preview; create a fresh packet revision');
   const members=await client.members(packet.roomId);if(packet.recipients.some(id=>!members.some(m=>m.id===id&&!m.revoked)))throw Error('A recipient is no longer active');
   await store.saveRecord('events',{...row,data:{...row.data,state:'sending'}});
   try{await client.post(packet.roomId,{type:'context_packet',schema:1,packetHash:hash,packet},{id:eventId,audience:packet.recipients});await store.saveRecord('events',{...row,data:{...row.data,state:'published',publishedAt:new Date().toISOString()}});return {packetId,version:packet.version,hash,published:true};}
   catch(error){await store.saveRecord('events',{...row,data:{...row.data,state:'unknown',error:scrub(error.message)}});throw Error('Packet publication uncertain; preserved event '+eventId+'. Pull/inspect before any retry.');}
  },
  async export(projectId,packetId,expectedHash,file){if(path.extname(file).toLowerCase()!=='.json')throw Error('Context packets export as .json only');const row=await current(projectId,packetId);if(!row||row.data.hash!==expectedHash||packetHash(row.data.packet)!==expectedHash)throw Error('Packet changed since preview');assertPacketClean(row.data.packet);if((await freshness(row)).stale)throw Error('Selected source changed; revise the packet');await writeFile(file,JSON.stringify({packet:row.data.packet,hash:row.data.hash},null,2),{flag:'wx',mode:0o600});return {file,hash:row.data.hash};}
 };
}
