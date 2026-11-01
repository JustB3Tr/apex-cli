import { realpath, stat, readFile, readdir, writeFile, mkdir, open, rename, link, unlink } from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {privatePath,digest} from '../safe-content.js';

// This generated task board is the only model-readable file in private APEX state.
const modelPrivate=relative=>privatePath(relative)&&!/^\.apex\/teams\/[a-f0-9-]{36}\/TASKS\.md$/i.test(relative.replaceAll('\\','/'));

export async function readBoundedFile(file,maxBytes){
 const handle=await open(file,'r');try{if((await handle.stat()).size>maxBytes)throw Error(`File exceeds ${maxBytes} byte read limit`);const buffer=Buffer.alloc(maxBytes+1);let size=0;while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);if(!bytesRead)break;size+=bytesRead;}if(size>maxBytes)throw Error(`File exceeds ${maxBytes} byte read limit`);return buffer.subarray(0,size);}finally{await handle.close();}
}

export async function scopedPath(root, target='.', { write=false,allowPrivate=false }={}) {
  const base=await realpath(root), resolved=path.resolve(base,target);
  const inside=p=>p===base||p.startsWith(base+path.sep);
  if (!inside(resolved)) throw Error('Path escapes the project root');
  let current=resolved,canonical;
  while (true) {
    try { const actual=await realpath(current); if(!inside(actual))throw Error('Symlink escapes the project root');canonical=path.join(actual,path.relative(current,resolved));if(!inside(canonical))throw Error('Path escapes the project root');break; }
    catch(e) { if(e.code!=='ENOENT'||!write)throw e;const parent=path.dirname(current);if(parent===current)throw e;current=parent; }
  }
  if (!write && !allowPrivate && (modelPrivate(path.relative(base,resolved))||modelPrivate(path.relative(base,canonical)))) throw Error('Sensitive files are not available to model tools');
  return canonical;
}
export async function fileRead(root,target){const p=await scopedPath(root,target);if((await stat(p)).size>200000)throw Error('File exceeds 200KB tool limit');return readFile(p,'utf8');}
export async function fileList(root,target='.',options) {
 const p=await scopedPath(root,target),rows=(await readdir(p,{withFileTypes:true})).filter(x=>!x.isSymbolicLink()&&!modelPrivate(path.relative(root,path.join(p,x.name)))).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({name:x.name,directory:x.isDirectory()}));
 if(options===undefined)return rows.slice(0,200);
 const {offset=0,limit=100}=options;if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('Use offset 0-100000 and limit 1-200');
 return {path:target,entries:rows.slice(offset,offset+limit),offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,truncated:offset+limit<rows.length};
}
export async function fileReadRange(root,target,{startLine=1,endLine=startLine+119,maxChars=40000}={}){
 if(!Number.isSafeInteger(startLine)||startLine<1||!Number.isSafeInteger(endLine)||endLine<startLine||endLine-startLine>=500||!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>60000)throw Error('Read 1-500 lines and at most 60000 characters');
 const p=await scopedPath(root,target);if((await stat(p)).size>2000000)throw Error('File exceeds 2MB ranged-read limit');const data=await readBoundedFile(p,2000000);if(data.includes(0))throw Error('Choose UTF-8 text under 2MB');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw Error('Choose UTF-8 text');}
 const lines=text.split(/\r\n|\n|\r/),chosen=lines.slice(startLine-1,endLine),content=chosen.join('\n').slice(0,maxChars),actualEnd=chosen.length?startLine+content.split('\n').length-1:startLine-1;
 return {path:target,startLine,endLine:actualEnd,totalLines:lines.length,content,sourceSHA256:digest(data),citation:target+':'+startLine,bytes:data.length,truncated:chosen.join('\n').length>maxChars||endLine<lines.length,lineEndingsNormalized:true};
}
export async function fileWrite(root,target,content){if(typeof content!=='string'||Buffer.byteLength(content)>200000)throw Error('Write exceeds 200KB limit');const p=await scopedPath(root,target,{write:true});await mkdir(path.dirname(p),{recursive:true});await writeFile(p,content,'utf8');return {written:target,bytes:Buffer.byteLength(content)};}
export function withinOwnership(target,scopes){if(!scopes?.length)return true;const normal=v=>{const n=path.posix.normalize(v.replaceAll('\\','/')).replace(/^\.\//,'');return process.platform==='win32'?n.toLowerCase():n;};const t=normal(target);if(t.startsWith('../')||path.isAbsolute(t))return false;return scopes.some(s=>t===normal(s)||t.startsWith(normal(s).replace(/\/$/,'')+'/'));}

export async function assertOwnership(root,target,scopes){
 if(!scopes?.length)return;
 if(!withinOwnership(target,scopes))throw Error('Write outside assigned ownership');
 const base=await realpath(root),canonical=await scopedPath(root,target,{write:true});
 if(!withinOwnership(path.relative(base,canonical),scopes))throw Error('Canonical write path escapes assigned ownership');
}

// Capture the old inode before replacement. An intervening editor version is
// retained, and exclusive link creation never overwrites a newly created path.
// The retained backup also preserves writes from editors holding the old inode.
export async function filePatch(root,target,{expectedHash,replacements,content}={}, {scopes}={}){
 if(expectedHash!==null&&!/^[a-f0-9]{64}$/.test(expectedHash||''))throw Error('Supply the exact source SHA256, or null to create a new file');
 const base=await realpath(root);if(privatePath(target))throw Error('Sensitive file cannot be patched');await assertOwnership(root,target,scopes);const p=await scopedPath(root,target,{write:true});if(privatePath(path.relative(base,p)))throw Error('Sensitive canonical file cannot be patched');
 const lockFolder=await scopedPath(base,'.apex/file-locks',{write:true});await mkdir(lockFolder,{recursive:true});const lockPath=path.join(lockFolder,digest(p)+'.lock');let lock;
 try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,path:target,createdAt:new Date().toISOString()}));}catch(e){if(lock){await lock.close().catch(()=>{});await unlink(lockPath).catch(()=>{});}if(e.code==='EEXIST')throw Error('Another or interrupted patch owns this file; inspect its saved lock before recovery');throw e;}
 let temp,backup,captured=false;
 try{
  let before=null;try{if((await stat(p)).size>2000000)throw Error('File exceeds 2MB patch limit');before=await readBoundedFile(p,2000000);}catch(e){if(e.code!=='ENOENT')throw e;}
  if((before===null?null:digest(before))!==expectedHash)throw Error('Source changed since read; no patch applied');
  if(before?.includes(0))throw Error('Patch only UTF-8 text');let oldText='';try{if(before)oldText=new TextDecoder('utf-8',{fatal:true}).decode(before);}catch{throw Error('Patch only UTF-8 text');}
  let after;
  if(content!==undefined){if(typeof content!=='string'||Buffer.byteLength(content)>200000)throw Error('New content exceeds 200KB');if(replacements!==undefined)throw Error('Choose content or replacements');after=content;}
  else{
   if(before===null)throw Error('Creating a file requires content and expectedHash:null');if(!Array.isArray(replacements)||replacements.length<1||replacements.length>20)throw Error('Choose 1-20 exact replacements');after=oldText;
   for(const r of replacements){if(!r||typeof r.oldText!=='string'||!r.oldText||typeof r.newText!=='string'||Buffer.byteLength(r.oldText)+Buffer.byteLength(r.newText)>200000)throw Error('Invalid bounded replacement');const first=after.indexOf(r.oldText);if(first<0||after.indexOf(r.oldText,first+1)>=0)throw Error('Replacement must match exactly once; include more source context');after=after.slice(0,first)+r.newText+after.slice(first+r.oldText.length);}
  }
  const next=Buffer.from(after);if(next.length>2000000)throw Error('Patched file exceeds 2MB');if(before?.equals(next))return {path:target,changed:false,sourceSHA256:expectedHash};
  await mkdir(path.dirname(p),{recursive:true});temp=path.join(path.dirname(p),'.'+path.basename(p)+'.apex-patch-'+randomUUID()+'.tmp');await writeFile(temp,next,{flag:'wx',mode:before?(await stat(p)).mode:0o600});
  if(before!==null){const folder=await scopedPath(base,'.apex/patch-backups/'+randomUUID(),{write:true});await mkdir(folder,{recursive:true});backup=path.join(folder,path.basename(p));await rename(p,backup);captured=true;let capturedHash;try{capturedHash=digest(await readBoundedFile(backup,2000000));}catch{try{await link(backup,p);}catch{}throw Error('Source changed during patch; latest version retained at '+backup);}if(capturedHash!==expectedHash){try{await link(backup,p);}catch{}throw Error('Source changed during patch; latest version retained at '+backup);}}
  try{await link(temp,p);}catch(e){if(captured){try{await link(backup,p);}catch{}}throw Error('Destination changed or exclusive patch installation unavailable; preserved backup: '+(backup||'new file not installed'));}
  return {path:target,changed:true,beforeSHA256:expectedHash,sourceSHA256:digest(next),bytes:next.length,backup:backup||null,policy:'Exact hash + exclusive installation; old version retained. External editors are not OS-locked.'};
 }finally{if(temp)await unlink(temp).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});}
}
