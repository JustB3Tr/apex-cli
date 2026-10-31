import {open} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {Readable} from 'node:stream';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';import {boundedJSON} from './http-json.js';
import {digest} from './safe-content.js';import {deriveAccountKeys,openBackup} from './account-crypto.js';
const uuid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export function validateArchive(value){if(value?.type!=='apex-encrypted-backup-export'||value.version!==1||![value.id,value.userId,value.deviceId,value.serviceId].every(uuid)||typeof value.email!=='string'||!value.envelope||typeof value.envelope!=='object'||typeof value.hash!=='string'||digest(JSON.stringify(value.envelope))!==value.hash)throw Error('Invalid encrypted backup archive or checksum');return value;}
export async function readBackupArchive(file){return validateArchive(await boundedJSON(new Response(Readable.toWeb(createReadStream(file))),{maxBytes:12*1024*1024}));}
export async function exportBackup(api,session,id,destination){
 if(!destination||typeof destination!=='string')throw Error('Choose an explicit export file');const saved=await api.encryptedBackup(id),info=await api.info(),archive=validateArchive({type:'apex-encrypted-backup-export',version:1,serviceId:info.serviceId,endpoint:session.endpoint,email:session.email,userId:session.userId,id:saved.id,deviceId:saved.deviceId,createdAt:saved.createdAt,hash:saved.hash,envelope:saved.envelope});
 openBackup(session.syncKey,[archive.userId,archive.deviceId,archive.id],archive.envelope);const file=path.resolve(destination),text=JSON.stringify(archive,null,2)+'\n';
 try{const handle=await open(file,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}}
 catch(e){if(e.code!=='EEXIST')throw e;if(!isDeepStrictEqual(await readBackupArchive(file),archive))throw Error('Export file exists with different content; preserved without overwrite');}
 const reread=await readBackupArchive(file);if(!isDeepStrictEqual(reread,archive))throw Error('Local export verification failed; no remote deletion permitted');return {id,file,encrypted:true,verified:true,hash:archive.hash,bytes:Buffer.byteLength(text),note:'Keep the master password. Authentication tokens and sync keys are not exported.'};
}
export async function verifyDeletionArchive(api,session,id,file){
 const archive=await readBackupArchive(file),record=await api.backupRecord(id),info=await api.info();
 if(archive.id!==id||archive.userId!==session.userId||archive.serviceId!==info.serviceId||archive.deviceId!==record.deviceId||archive.hash!==record.hash)throw Error('Export does not match this exact account backup; nothing deleted');openBackup(session.syncKey,[archive.userId,archive.deviceId,archive.id],archive.envelope);return {id,file:path.resolve(file),createdAt:record.createdAt,deviceId:record.deviceId,bytes:record.bytes,hash:record.hash,alreadyDeleted:Boolean(record.deletedAt)};
}
export async function openArchiveWithPassword(file,password){const archive=await readBackupArchive(file),keys=await deriveAccountKeys(password,archive.email,archive.serviceId);return {archive,backup:openBackup(keys.syncKey,[archive.userId,archive.deviceId,archive.id],archive.envelope)};}
