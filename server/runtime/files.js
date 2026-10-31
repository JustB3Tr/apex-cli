import { realpath, stat, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {privatePath} from '../safe-content.js';

// This generated task board is the only model-readable file in private APEX state.
const modelPrivate=relative=>privatePath(relative)&&!/^\.apex\/teams\/[a-f0-9-]{36}\/TASKS\.md$/i.test(relative.replaceAll('\\','/'));

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
export async function fileList(root,target='.') {const p=await scopedPath(root,target);return (await readdir(p,{withFileTypes:true})).filter(x=>!modelPrivate(path.relative(root,path.join(p,x.name)))).slice(0,200).map(x=>({name:x.name,directory:x.isDirectory()}));}
export async function fileWrite(root,target,content){if(typeof content!=='string'||Buffer.byteLength(content)>200000)throw Error('Write exceeds 200KB limit');const p=await scopedPath(root,target,{write:true});await mkdir(path.dirname(p),{recursive:true});await writeFile(p,content,'utf8');return {written:target,bytes:Buffer.byteLength(content)};}
export function withinOwnership(target,scopes){if(!scopes?.length)return true;const normal=v=>{const n=path.posix.normalize(v.replaceAll('\\','/')).replace(/^\.\//,'');return process.platform==='win32'?n.toLowerCase():n;};const t=normal(target);if(t.startsWith('../')||path.isAbsolute(t))return false;return scopes.some(s=>t===normal(s)||t.startsWith(normal(s).replace(/\/$/,'')+'/'));}

export async function assertOwnership(root,target,scopes){
 if(!scopes?.length)return;
 if(!withinOwnership(target,scopes))throw Error('Write outside assigned ownership');
 const base=await realpath(root),canonical=await scopedPath(root,target,{write:true});
 if(!withinOwnership(path.relative(base,canonical),scopes))throw Error('Canonical write path escapes assigned ownership');
}
