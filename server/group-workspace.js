import path from 'node:path';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {changedFiles,git,repoHead} from './git-project.js';
import {scopedPath,withinOwnership,assertOwnership} from './runtime/files.js';
import {digest,scrub,privatePath} from './safe-content.js';

const allowed=p=>typeof p==='string'&&p.length<300&&!p.startsWith('/')&&!/[\\:*?]/.test(p)&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!privatePath(p);
async function bytes(root,file){try{await assertOwnership(root,file,[file]);const resolved=await scopedPath(root,file,{write:true});if(privatePath(path.relative(root,resolved)))throw Error('Sensitive canonical path');const b=await readFile(resolved);if(b.length>50000||b.includes(0)||Buffer.from(b.toString('utf8')).compare(b))throw Error('Share only UTF-8 text files under 50KB');return b;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function workspaceSnapshot(config){
 if(config?.mode!=='build'||!config.workspace)throw Error('Enable a scoped Build agent first');
 const {path:root,baseCommit}=config.workspace,files=await changedFiles(root),entries=[];
 for(const file of files){if(!allowed(file)||!withinOwnership(file,config.scope))throw Error('Unowned/private change cannot be published: '+file);const after=await bytes(root,file);if(after===null)throw Error('Deleted files require a reviewed Git merge; no destructive snapshot sync');if(scrub(after.toString('utf8'))!==after.toString('utf8'))throw Error('Possible secret in '+file+'; nothing published');const blob=await git(root,['rev-parse','--verify',baseCommit+':'+file],{failure:true});
  entries.push({file,baseBlob:blob.code?null:blob.stdout,content:after.toString('utf8'),sha256:digest(after)});
 }
 if(!entries.length)throw Error('No changed source files to share');const bundle={version:1,baseCommit,branch:config.workspace.branch,scope:config.scope,entries};if(Buffer.byteLength(JSON.stringify(bundle))>60000)throw Error('Changes exceed 60KB. Use the connected Git repository for larger changes');return bundle;
}
export async function previewWorkspace(root,bundle){
 if(bundle?.version!==1||!Array.isArray(bundle.entries)||!bundle.entries.length||bundle.entries.length>30||Buffer.byteLength(JSON.stringify(bundle))>60000||!Array.isArray(bundle.scope))throw Error('Invalid shared changes');
 if(await repoHead(root)!==bundle.baseCommit)throw Error('Different Git baseline; use a reviewed branch merge');
 const seen=new Set(),rows=[];
 for(const e of bundle.entries){if(!allowed(e.file)||!withinOwnership(e.file,bundle.scope)||seen.has(e.file)||typeof e.content!=='string'||Buffer.byteLength(e.content)>50000||digest(Buffer.from(e.content))!==e.sha256||scrub(e.content)!==e.content)throw Error('Invalid/private/duplicate shared file');seen.add(e.file);const current=await bytes(root,e.file);if(current&&digest(current)===e.sha256){rows.push({...e,unchanged:true});continue;}
  if(e.baseBlob!==null&&!/^[a-f0-9]{40,64}$/.test(e.baseBlob))throw Error('Invalid source blob');
  const blob=b=>createHash(e.baseBlob?.length===64?'sha256':'sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
  const hashes=current?[blob(current),blob(Buffer.from(current.toString('utf8').replaceAll('\r\n','\n')))]:[null];
  if(!hashes.includes(e.baseBlob))throw Error('Local conflict preserved: '+e.file);rows.push({...e,before:current?.toString('utf8')??null});
 }
 return {bundleHash:digest(JSON.stringify(bundle)),baseCommit:bundle.baseCommit,rows};
}
export async function applyWorkspace(store,project,bundle,expectedHash){
 const root=project.path,lockPath=path.join(store.home,'group-workspace.lock');let lock;try{lock=await open(lockPath,'wx');}catch(e){if(e.code==='EEXIST')throw Error('A workspace sync is active or interrupted. Inspect its receipt before recovery');throw e;}
 const backup=path.join(store.home,'group-workspace-backups',randomUUID()),written=[];
 try{
  const preview=await previewWorkspace(root,bundle);if(preview.bundleHash!==expectedHash)throw Error('Shared changes changed after preview');await mkdir(backup,{recursive:true});await writeFile(path.join(backup,'receipt.json'),JSON.stringify({...preview,projectId:project.id},null,2));
  for(const row of preview.rows.filter(r=>!r.unchanged)){const current=await bytes(root,row.file);if((current?.toString('utf8')??null)!==row.before)throw Error('Local file changed during sync: '+row.file);const target=await scopedPath(root,row.file,{write:true});await mkdir(path.dirname(target),{recursive:true});await writeFile(target,row.content,{flag:row.before===null?'wx':'w'});written.push(row.file);}
  await store.event({projectId:project.id,type:'group_workspace_applied',data:{bundleHash:expectedHash,files:written,backup}});return {files:written,backup,committed:false};
 }catch(e){await store.event({projectId:project.id,type:'group_workspace_attention',data:{reason:e.message,written,backup}});throw Error(e.message+'; preserved sync receipt: '+backup);
 }finally{await lock.close();const {unlink}=await import('node:fs/promises');await unlink(lockPath);}
}
