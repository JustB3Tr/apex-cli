import http from 'node:http';import https from 'node:https';
import {randomBytes,randomUUID} from 'node:crypto';import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {document} from './document.js';import {digest} from './safe-content.js';
const token=()=>randomBytes(32).toString('base64url'),uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v),fail=(code,message)=>{const e=Error(message);e.status=code;throw e;};
export const HUB_LIMITS={maxRooms:100,maxMembersPerRoom:64,maxInvitesPerRoom:256,maxEventsPerRoom:10000,maxRoomBytes:16*1024*1024,maxHubBytes:64*1024*1024};
export function safeEndpoint(input){const u=new URL(input);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use HTTPS outside loopback, without URL credentials or query');return u.origin;}
export async function createHub({home,host='127.0.0.1',port=0,tls,bootstrapToken,limits:overrides={}}={}){
 if(!['localhost','127.0.0.1','::1'].includes(host)&&!tls)throw Error('Non-loopback hub requires TLS');
 if(Object.keys(overrides).some(key=>!Object.hasOwn(HUB_LIMITS,key)))throw Error('Unknown hub limit');const limits={...HUB_LIMITS,...overrides};if(Object.values(limits).some(v=>!Number.isSafeInteger(v)||v<1))throw Error('Hub limits must be positive safe integers');
 await mkdir(home,{recursive:true,mode:0o700});const adminFile=path.join(home,'hub-owner-token');if(!bootstrapToken){try{bootstrapToken=(await readFile(adminFile,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;bootstrapToken=token();await writeFile(adminFile,bootstrapToken,{flag:'wx',mode:0o600});}}
 const adminHash=digest(bootstrapToken),doc=document(path.join(home,'hub.json'),{version:1,rooms:[]}),size=value=>Buffer.byteLength(JSON.stringify(value,null,2));
 function capacity(state,room){if(state.rooms.length>limits.maxRooms||size(state)>limits.maxHubBytes||room&&(room.members.length>limits.maxMembersPerRoom||room.invites.length>limits.maxInvitesPerRoom||room.events.length>limits.maxEventsPerRoom||size(room)>limits.maxRoomBytes))fail(409,'Hub storage limit reached. Existing history is preserved; inspect room status and archive locally or use a new hub. Nothing was discarded.');}
 function membership(room,auth){const member=room.members.find(m=>!m.revoked&&m.tokenHash===digest(auth||''));if(!member)fail(401,'Membership unavailable or revoked');return member;}
 async function body(req){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>180000)fail(413,'Body exceeds limit');chunks.push(part);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail(400,'Invalid JSON');}}
 const handler=async(req,res)=>{try{
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');const url=new URL(req.url,'http://localhost'),parts=url.pathname.split('/').filter(Boolean),auth=req.headers.authorization?.replace(/^Bearer /,''),data=req.method==='POST'?await body(req):{},send=value=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(parts[0]!=='rooms'||parts.length>3)fail(404,'Unknown route');
  if(parts.length===1&&req.method==='POST'){
   if(!auth||digest(auth)!==adminHash)fail(401,'Hub owner token required to create a room');const memberToken=token(),room={id:randomUUID(),name:String(data.name||'APEX room').slice(0,100),members:[{id:randomUUID(),name:String(data.memberName||'Owner').slice(0,100),role:'owner',tokenHash:digest(memberToken),revoked:false}],invites:[],events:[],sequence:0};
   await doc.mutate(s=>{s.rooms.push(room);capacity(s,room);});return send({id:room.id,name:room.name,memberId:room.members[0].id,role:'owner',token:memberToken});
  }
  const roomId=parts[1],action=parts[2];if(!uuid(roomId))fail(400,'Invalid room');
  if(req.method==='GET'){
   // Reads take a consistent atomic snapshot and never mutate/rewrite hub.json.
   const state=await doc.read(),room=state.rooms.find(r=>r.id===roomId);if(!room)fail(404,'Room not found');const member=membership(room,auth);
   if(action==='members')return send(room.members.map(({id,name,role,revoked})=>({id,name,role,revoked})));
   if(action==='status')return send({id:room.id,events:room.events.length,members:room.members.length,invites:room.invites.length,roomBytes:size(room),hubBytes:size(state),limits,historyPreserved:true});
   if(action==='events'){const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)fail(400,'Invalid cursor');return send({events:room.events.filter(e=>e.seq>after&&(!e.audience.length||e.audience.includes(member.id)||e.sender===member.id)).slice(0,200),latest:room.sequence});}
   fail(404,'Unknown room action');
  }
  return send(await doc.mutate(s=>{
   const room=s.rooms.find(r=>r.id===roomId);if(!room)fail(404,'Room not found');
   if(action==='join'){
    const invite=room.invites.find(i=>i.hash===digest(String(data.invite||'')));if(!invite||invite.used||Date.parse(invite.expiresAt)<Date.now())fail(403,'Invitation expired or used');const memberToken=token(),m={id:randomUUID(),name:String(data.name||'Member').slice(0,100),role:invite.role,tokenHash:digest(memberToken),revoked:false};invite.used=true;room.members.push(m);capacity(s,room);return {id:room.id,name:room.name,memberId:m.id,role:m.role,token:memberToken};
   }
   const member=membership(room,auth);
   if(action==='invite'){if(member.role!=='owner')fail(403,'Only owner can invite');if(!['member','viewer'].includes(data.role||'member'))fail(400,'Invalid invite role');const invite=token(),expiresAt=new Date(Date.now()+Math.min(86400000,Math.max(60000,Number(data.ttlMs)||3600000))).toISOString();room.invites.push({hash:digest(invite),role:data.role||'member',expiresAt,used:false});capacity(s,room);return {invite,expiresAt};}
   if(action==='revoke'){if(member.role!=='owner')fail(403,'Only owner can revoke');const peer=room.members.find(m=>m.id===data.memberId);if(!peer||peer.role==='owner')fail(400,'Choose a non-owner member');peer.revoked=true;return {revoked:peer.id};}
   if(action==='leave'){member.revoked=true;return {left:roomId};}
   if(action==='events'){
    if(member.role==='viewer')fail(403,'Viewers cannot publish');if(!uuid(data.id)||!Array.isArray(data.audience)||data.audience.length>20||data.audience.some(id=>!room.members.some(m=>m.id===id&&!m.revoked)))fail(400,'Invalid event audience');const envelope=data.envelope;if(!envelope||!['iv','tag','data'].every(k=>typeof envelope[k]==='string'&&/^[A-Za-z0-9+/=]*$/.test(envelope[k]))||envelope.data.length>140000||Buffer.from(envelope.iv,'base64').length!==12||Buffer.from(envelope.tag,'base64').length!==16)fail(400,'Invalid encrypted envelope');
    const duplicate=room.events.find(e=>e.id===data.id);if(duplicate){if(duplicate.sender!==member.id||JSON.stringify(duplicate.envelope)!==JSON.stringify(envelope)||JSON.stringify(duplicate.audience)!==JSON.stringify(data.audience))fail(409,'Idempotency key already has different content');return duplicate;}
    const event={id:data.id,seq:++room.sequence,sender:member.id,audience:data.audience,envelope,createdAt:new Date().toISOString()};room.events.push(event);capacity(s,room);return event;
   }
   fail(404,'Unknown room action');
  }));
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:e.status?e.message:'Hub operation failed; inspect local state'}));}};
 const server=tls?https.createServer(tls,handler):http.createServer(handler);server.requestTimeout=15000;server.headersTimeout=10000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});const endpoint=(tls?'https':'http')+'://'+(host==='::1'?'[::1]':host)+':'+server.address().port;
 return {endpoint,adminFile,bootstrapToken,limits,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();})};
}
export async function hubMain(args){const values={};for(let i=0;i<args.length;i+=2){if(!['--home','--host','--port','--cert','--key'].includes(args[i])||!args[i+1])throw Error('hub --home PATH [--host IP --port N --cert FILE --key FILE]');values[args[i].slice(2)]=args[i+1];}if(!values.home)throw Error('hub --home PATH required');const tls=values.cert&&values.key?{cert:await readFile(values.cert),key:await readFile(values.key)}:undefined;const hub=await createHub({home:path.resolve(values.home),host:values.host,port:Number(values.port)||8789,tls});console.log('APEX collaboration hub '+hub.endpoint+'\nOwner bootstrap token file: '+hub.adminFile+'\nKeep this token private. No provider credentials are used.');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>hub.close().then(()=>process.exit()));}
