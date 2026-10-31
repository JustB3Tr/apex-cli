import path from 'node:path';import {mkdir} from 'node:fs/promises';
import {exportBackup,verifyDeletionArchive,openArchiveWithPassword} from '../server/backup-export.js';import {restoreAccountBackup} from '../server/account-backup.js';
const ordered=rows=>[...rows].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
export function accountRetention(c){
 async function confirm(text){if(!c.confirm||!await c.confirm(text))throw Error('Operation cancelled. Existing remote data is preserved.');}
 return async(action,arg)=>{
  if(!['storage','export','delete','prune','restore-file'].includes(action))return false;
  if(action==='restore-file'){
   c.guard();const options=JSON.parse(arg);if(!options.file||!options.path)throw Error('Use /account restore-file {"file":"ARCHIVE","path":"RESTORE_FOLDER"}');const password=await c.secret('Archive master password (hidden; no network login):',{trim:false}),{archive,backup}=await openArchiveWithPassword(options.file,password);
   c.print({archive:archive.id,encrypted:true,restoreFolder:path.resolve(options.path),projects:backup.projects?.length??0,sourceAccount:archive.email});await confirm('Restore this authenticated archive into the selected folder, preserving existing files?');c.print(await restoreAccountBackup(c.store,backup,{basePath:options.path,accountId:archive.userId}));return true;
  }
  const value=await c.saved(),api=c.client(value);
  async function clearDeleted(ids){const current=await c.sessionStore.get();if(!current||current.userId!==value.userId||current.endpoint!==value.endpoint)return;let changed=false;if(ids.includes(current.pendingBackup?.id)){delete current.pendingBackup;changed=true;}if(ids.includes(current.lastBackupId)){delete current.lastBackupId;delete current.lastBackupHash;changed=true;}if(changed)await c.sessionStore.save(current);}
  if(action==='storage'){c.print(await api.storage());return true;}
  const options=JSON.parse(arg);
  if(action==='export'){
   if(!options.file)throw Error('Choose an export file with {"id":"BACKUP_ID","file":"PATH"}');const id=options.id||ordered(await api.backups()).at(-1)?.id;if(!id)throw Error('No saved backup');c.print(await exportBackup(api,value,id,options.file));return true;
  }
  c.guard();if(action==='delete'){
   if(!options.id||!options.export)throw Error('Deletion requires {"id":"BACKUP_ID","export":"VERIFIED_LOCAL_ARCHIVE"}');const proof=await verifyDeletionArchive(api,value,options.id,options.export);c.print(proof);await confirm('Delete exactly remote backup '+options.id+'? Its verified encrypted local export remains at '+proof.file+'. Keep your master password; keys are not exported.');await verifyDeletionArchive(api,value,options.id,options.export);const result=await api.deleteBackup(options.id);await clearDeleted([options.id]);c.print(result);return true;
  }
  if(!Number.isSafeInteger(options.keep)||options.keep<1||!options.exportDirectory)throw Error('Use /account prune {"keep":3,"exportDirectory":"EXISTING_OR_NEW_FOLDER"}; keep must be at least 1');
  const versions=ordered(await api.backups()),eligible=versions.slice(0,Math.max(0,versions.length-options.keep)),selected=eligible.slice(0,50);if(!selected.length){c.print({deleted:[],notice:'No versions exceed the selected retention count.'});return true;}
  const folder=path.resolve(options.exportDirectory);await mkdir(folder,{recursive:true});const proofs=[];
  // Export and authenticate every selected version before asking to delete any.
  for(const row of selected){const file=path.join(folder,row.id+'.apex-backup.json');await exportBackup(api,value,row.id,file);proofs.push(await verifyDeletionArchive(api,value,row.id,file));}
  c.print({keep:options.keep,selected:proofs,additionalOldVersions:eligible.length-selected.length,exportDirectory:folder});await confirm('Delete these '+proofs.length+' exact remote backup versions? Each local encrypted export has been reread and authenticated. Newer versions remain. Keep your master password; keys are not exported.');for(const proof of proofs)await verifyDeletionArchive(api,value,proof.id,proof.file);const ids=selected.map(row=>row.id),result=await api.pruneBackups(ids);await clearDeleted(ids);c.print(result);return true;
 };
}
