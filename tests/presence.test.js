import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createHub} from '../server/hub.js';
import {createStore} from '../server/store.js';
import {roomClient,encryptEvent} from '../server/rooms.js';
import {groupView} from '../server/group-chat.js';

async function fixture(fn,{limits={},now}={}){
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-presence-'));let hub;
 try{hub=await createHub({home:path.join(home,'hub'),bootstrapToken:'fixture-owner',limits,now});const profiles=[];
  async function person(name){const {store}=await createStore(path.join(home,name)),project=await store.createProject({name,path:path.join(home,name,'project')}),values=new Map(),secrets={get:async id=>values.get(id),set:async(id,value)=>values.set(id,value),remove:async id=>values.delete(id)},client=roomClient(store,{secrets});await store.writeSettings({vaultPreference:'disabled',identity:{name}});const result={store,project,client,secrets};profiles.push(result);return result;}
  const owner=await person('owner'),room=await owner.client.create(owner.project.id,hub.endpoint,hub.bootstrapToken,'Presence fixture');await fn({home,hub,owner,room,person});
 }finally{await hub?.close();await rm(home,{recursive:true,force:true});}
}

test('10020 authenticated heartbeat updates never consume durable room event quota or rewrite hub history',()=>fixture(async({home,hub,owner,room})=>{
 const member=await owner.client.membership(room.id),headers={'content-type':'application/json',Authorization:'Bearer '+member.token},event={roomId:room.id,id:randomUUID(),sender:member.memberId,audience:[]},envelope=encryptEvent(member.key,event,{type:'group_presence',groupSchema:1}),body=JSON.stringify({id:event.id,audience:[],envelope}),file=path.join(home,'hub','hub.json'),before=await readFile(file),mtime=(await stat(file)).mtimeMs;
 let done=0;while(done<10020){await Promise.all(Array.from({length:Math.min(60,10020-done)},async()=>{const result=await fetch(hub.endpoint+'/rooms/'+room.id+'/presence',{method:'POST',headers,body});assert.equal(result.status,200);const value=await result.json();assert.equal(value.ephemeral,true);}));done+=Math.min(60,10020-done);}
 assert.deepEqual(await readFile(file),before);assert.equal((await stat(file)).mtimeMs,mtime);const status=await owner.client.status(room.id);assert.equal(status.events,0);assert.equal(status.presence.active,1);assert.equal(status.presence.memoryOnly,true);
 await owner.client.post(room.id,{type:'message',content:'still has room for real work'});assert.equal((await owner.client.status(room.id)).events,1);assert.equal((await owner.client.pull(room.id)).length,1);assert.equal((await owner.store.record('rooms',room.id)).cursor,1);assert.equal((await owner.store.records('events',{roomId:room.id,type:'room_presence'})).length,1);
 assert.ok(!(await readFile(file,'utf8')).includes('group_presence'));
},{limits:{maxEventsPerRoom:1}}));

test('client heartbeats are bounded replaceable snapshots, not outgoing messages; durable old presence stays compatible',()=>fixture(async({owner,room,person})=>{
 const peer=await person('peer');await peer.client.join(peer.project.id,await owner.client.invite(room.id));const me=await owner.client.membership(room.id),capability={type:'group_capability',groupSchema:1,enabled:true,multiAgent:true,model:'ollama:fixture',mode:'plan',maxUSD:0,turnUSD:0,scope:[],capabilityId:randomUUID()};await owner.client.post(room.id,capability);
 const first=await owner.client.post(room.id,{type:'group_presence',groupSchema:1});const second=await owner.client.post(room.id,{type:'group_presence',groupSchema:1});assert.equal(first.seq,null);assert.equal(second.ephemeral,true);assert.equal((await owner.client.status(room.id)).events,1);assert.equal((await owner.store.records('events',{type:'room_outgoing'})).length,1);
 assert.equal((await peer.client.pull(room.id)).length,1);assert.equal((await peer.client.pull(room.id)).length,0);const ephemeral=await peer.store.records('events',{roomId:room.id,type:'room_presence'});assert.equal(ephemeral.length,1);assert.equal(ephemeral[0].sender,me.memberId);assert.equal(ephemeral[0].seq,Number.MAX_SAFE_INTEGER);assert.equal((await peer.store.record('rooms',room.id)).cursor,1);
 const old=[{sender:me.memberId,seq:1,data:capability,createdAt:new Date(Date.now()-200000).toISOString()},{sender:me.memberId,seq:2,data:{type:'group_presence',groupSchema:1},createdAt:new Date().toISOString()}];assert.equal(groupView(old,await peer.client.members(room.id)).agents[0].online,true);assert.equal(groupView([old[0],...ephemeral],await peer.client.members(room.id)).agents[0].online,true);
 await assert.rejects(()=>owner.client.post(room.id,{type:'group_presence',groupSchema:1,excessive:'x'.repeat(1500)}),/1024/);
}));

test('ten member identities reconnect, expire, leave and revoke without presence authority leakage',()=>{let clock=Date.now();return fixture(async({hub,owner,room,person})=>{
 const people=[owner];for(let i=1;i<10;i++){const p=await person('p'+i);await p.client.join(p.project.id,await owner.client.invite(room.id));people.push(p);}await Promise.all(people.map(p=>p.client.post(room.id,{type:'group_presence',groupSchema:1})));assert.equal((await owner.client.status(room.id)).presence.active,10);
 const identity=(await people[1].client.membership(room.id)).memberId,reconnected=roomClient(people[1].store,{secrets:people[1].secrets});await reconnected.post(room.id,{type:'group_presence',groupSchema:1});assert.equal((await owner.client.status(room.id)).presence.active,10);await owner.client.pull(room.id);assert.equal((await owner.store.records('events',{type:'room_presence'})).filter(e=>e.sender===identity).length,1);
 const bad=await fetch(hub.endpoint+'/rooms/'+room.id+'/presence',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer bad'},body:JSON.stringify({leave:true})});assert.equal(bad.status,401);await people[2].client.clearPresence(room.id);assert.equal((await owner.client.status(room.id)).presence.active,9);await people[3].client.leave(room.id);assert.equal((await owner.client.status(room.id)).presence.active,8);const revoked=(await people[4].client.membership(room.id)).memberId;await owner.client.revoke(room.id,revoked);assert.equal((await owner.client.status(room.id)).presence.active,7);await assert.rejects(()=>people[4].client.post(room.id,{type:'group_presence',groupSchema:1}),/revoked/);
 clock+=90001;assert.equal((await owner.client.status(room.id)).presence.active,0);await owner.client.pull(room.id);assert.equal((await owner.store.records('events',{type:'room_presence'})).length,0);await reconnected.post(room.id,{type:'group_presence',groupSchema:1});assert.equal((await owner.client.status(room.id)).presence.active,1);assert.equal((await reconnected.membership(room.id)).memberId,identity);
 const viewer=await person('viewer');await viewer.client.join(viewer.project.id,await owner.client.invite(room.id,'viewer'));await assert.rejects(()=>viewer.client.post(room.id,{type:'group_presence',groupSchema:1}),/Viewers/);await assert.rejects(()=>viewer.client.clearPresence(room.id),/Viewers/);assert.equal((await viewer.client.pull(room.id)).length,0);
},{now:()=>clock});});

test('presence envelope size, audience binding and restart are separate from durable cursor/history',()=>fixture(async({home,hub,owner,room,person})=>{
 const peer=await person('peer'),viewer=await person('viewer');const joined=await peer.client.join(peer.project.id,await owner.client.invite(room.id));await viewer.client.join(viewer.project.id,await owner.client.invite(room.id,'viewer'));await owner.client.post(room.id,{type:'message',content:'durable'});await owner.client.post(room.id,{type:'group_presence',groupSchema:1},{audience:[joined.memberId]});await peer.client.pull(room.id);await viewer.client.pull(room.id);assert.equal((await peer.store.records('events',{type:'room_presence'})).length,1);assert.equal((await viewer.store.records('events',{type:'room_presence'})).length,0);
 const m=await owner.client.membership(room.id),event={roomId:room.id,id:randomUUID(),sender:m.memberId,audience:[]},headers={'content-type':'application/json',Authorization:'Bearer '+m.token};const invalid=await fetch(hub.endpoint+'/rooms/'+room.id+'/presence',{method:'POST',headers,body:JSON.stringify({id:event.id,audience:[],envelope:encryptEvent(m.key,event,{type:'group_presence',groupSchema:1,extra:'x'.repeat(5000)})})});assert.equal(invalid.status,400);
 const durable=JSON.parse(await readFile(path.join(home,'hub','hub.json'),'utf8'));assert.equal(durable.rooms[0].events.length,1);assert.equal(durable.rooms[0].sequence,1);
 // A separately constructed hub has no presence history to restore.
 const second=await createHub({home:path.join(home,'hub'),bootstrapToken:'fixture-owner'});try{await owner.store.saveRecord('rooms',{...await owner.store.record('rooms',room.id),endpoint:second.endpoint});const status=await owner.client.status(room.id);assert.equal(status.presence.active,0);assert.equal(status.events,1);await owner.client.pull(room.id);assert.equal((await owner.store.records('events',{type:'room_presence'})).length,0);}finally{await second.close();}
}));
