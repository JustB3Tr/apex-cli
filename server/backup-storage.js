import {mkdir,readFile,open,link,unlink,realpath} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {digest} from './safe-content.js';
const uuid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),fail=(status,message)=>{const e=Error(message);e.status=status;throw e;};
const meta=({file,...row})=>row,held=row=>!row.deletedAt||row.deleteState!=='removed';
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
export function backupStorage({home,db,maxStorageBytes=20*1024*1024,maxVersions=50,maxRecords=10000}){
 if([maxStorageBytes,maxVersions,maxRecords].some(n=>!Number.isSafeInteger(n)||n<1)||maxVersions>maxRecords)throw Error('Invalid backup storage limits');
 const base=realpath(home),expected=row=>path.join(home,'backups',row.userId,row.deviceId,row.id+'.json');
 async function safeFile(row,{missing=false}={}){
  if(![row.id,row.userId,row.deviceId].every(uuid))throw Error('Invalid saved backup identity; preserve service state');const file=expected(row);
  if(row.file&&!samePath(path.resolve(row.file),path.resolve(file)))throw Error('Saved backup path differs; preserve service state');
  try{const actual=await realpath(file),canonical=path.join(await base,'backups',row.userId,row.deviceId,row.id+'.json');if(!samePath(actual,canonical))throw Error('Backup path escapes its canonical storage location');return file;}catch(e){if(missing&&e.code==='ENOENT')return file;throw e;}
 }
 function storage(state,userId){const rows=state.backups.filter(b=>b.userId===userId),pending=rows.filter(b=>b.deletedAt&&b.deleteState!=='removed'),usedBytes=rows.filter(held).reduce((n,b)=>n+b.bytes,0);return {usedBytes,availableBytes:Math.max(0,maxStorageBytes-usedBytes),maxStorageBytes,versions:rows.filter(b=>!b.deletedAt).length,pendingDeletions:pending.length,pendingDeletionIds:pending.map(b=>b.id),tombstones:rows.filter(b=>b.deletedAt).length,maxVersions,maxRecords,retention:'manual; export verified local copies before explicit deletion; no automatic pruning'};}
 async function remove(userId,id){
  if(!uuid(id))fail(400,'Invalid backup ID');const row=await db.mutate(state=>{const row=state.backups.find(b=>b.id===id&&b.userId===userId);if(!row)fail(404,'Backup not found');if(!row.deletedAt){row.deletedAt=new Date().toISOString();row.deleteState='pending';}return row;});
  if(row.deleteState==='removed')return {id,deleted:true,storageReclaimed:true};
  // Logical deletion commits first. A crash or unlink failure retains its quota
  // and a retryable pending record; an upload can never resurrect this ID.
  const file=await safeFile(row,{missing:true});try{await unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  await db.mutate(state=>{const saved=state.backups.find(b=>b.id===id&&b.userId===userId);saved.deleteState='removed';saved.removedAt=new Date().toISOString();});return {id,deleted:true,storageReclaimed:true};
 }
 return {
  async usage(userId){return storage(await db.read(),userId);},
  async list(userId){return (await db.read()).backups.filter(b=>b.userId===userId&&!b.deletedAt).map(meta);},
  async record(userId,id){if(!uuid(id))fail(400,'Invalid backup ID');const row=(await db.read()).backups.find(b=>b.id===id&&b.userId===userId);if(!row)fail(404,'Backup not found');return meta(row);},
  async put(userId,input){
   if(!input||Array.isArray(input)||typeof input!=='object')fail(400,'JSON backup object required');
   if(!uuid(input.deviceId)||!uuid(input.id)||input.envelope?.version!==1||!['iv','tag','data'].every(k=>typeof input.envelope[k]==='string'&&/^[A-Za-z0-9+/=]*$/.test(input.envelope[k]))||Buffer.from(input.envelope.iv,'base64').length!==12||Buffer.from(input.envelope.tag,'base64').length!==16)fail(400,'Invalid encrypted backup');
   const encoded=JSON.stringify(input.envelope),bytes=Buffer.byteLength(encoded),hash=digest(encoded);if(bytes>8*1024*1024)fail(413,'Backup exceeds 8MiB');
   return db.mutate(async state=>{
    const existing=state.backups.find(b=>b.id===input.id);if(existing){if(existing.userId!==userId)fail(409,'Backup ID unavailable');if(existing.deletedAt)fail(410,'This backup ID was explicitly deleted and cannot be uploaded again');if(existing.hash!==hash||existing.deviceId!==input.deviceId)fail(409,'Backup ID already differs');return meta(existing);}
    const usage=storage(state,userId);if(usage.usedBytes+bytes>maxStorageBytes||usage.versions>=maxVersions||usage.versions+usage.tombstones>=maxRecords)fail(409,'Backup storage/version allowance exhausted; old versions preserved. Export and explicitly delete old versions to reclaim space.');
    const row={id:input.id,userId,deviceId:input.deviceId,bytes,hash,createdAt:new Date().toISOString()},file=expected(row),folder=path.dirname(file);await mkdir(folder,{recursive:true,mode:0o700});if(!samePath(await realpath(folder),path.dirname(path.join(await base,'backups',userId,input.deviceId,input.id+'.json'))))throw Error('Backup storage folder escapes its canonical location');
    // A complete orphan from a crash before metadata commit is adoptable only
    // when its immutable ID and bytes match. Never overwrite conflicting data.
    try{if(digest(await readFile(await safeFile(row)))!==hash)fail(409,'Unindexed backup bytes differ; preserve for recovery');}
    catch(e){if(e.code!=='ENOENT')throw e;const temp=file+'.tmp-'+randomUUID(),handle=await open(temp,'wx',0o600);try{await handle.writeFile(encoded);await handle.sync();}finally{await handle.close();}try{await link(temp,file);}finally{await unlink(temp).catch(()=>{});}}
    row.file=file;state.backups.push(row);return meta(row);
   });
  },
  async get(userId,id){if(!uuid(id))fail(400,'Invalid backup ID');const row=(await db.read()).backups.find(b=>b.id===id&&b.userId===userId);if(!row)fail(404,'Backup not found');if(row.deletedAt)fail(410,'Backup was explicitly deleted');const bytes=await readFile(await safeFile(row));if(digest(bytes)!==row.hash)fail(409,'Saved backup checksum failed; preserve it for recovery');return {...meta(row),envelope:JSON.parse(bytes)};},
  remove,
  async prune(userId,ids){if(!Array.isArray(ids)||ids.length<1||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>!uuid(id)))fail(400,'Choose 1-50 distinct backup IDs');const state=await db.read();if(ids.some(id=>!state.backups.some(b=>b.id===id&&b.userId===userId)))fail(404,'Backup not found');const results=[];for(const id of ids)results.push(await remove(userId,id));return {deleted:results,storage:storage(await db.read(),userId)};}
 };
}
