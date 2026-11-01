import {readFile} from 'node:fs/promises';
import {digest,scrub} from './safe-content.js';
import {scopedPath} from './runtime/files.js';
import {repoHead} from './git-project.js';

export async function retrieveMemory(store,projectId,query,{shared=false,maxChars=6000}={}){
 const project=await store.getProject(projectId),terms=[...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}_]+/gu)||[])],head=await repoHead(project.path),ranked=[];
 for(const note of await store.listMemory(projectId)){
  if(shared&&note.visibility!=='shared')continue;
  const pinned=['pinned','user_preference','constraint'].includes(note.kind),score=terms.reduce((n,t)=>n+(note.text.toLowerCase().includes(t)?1:0),0);
  if(!pinned&&!score)continue;
  let stale=Boolean(note.expiresAt&&Date.parse(note.expiresAt)<Date.now()||note.commit&&head!==note.commit);
  for(const [file,hash] of Object.entries(note.fileHashes||{})){try{if(digest(await readFile(await scopedPath(project.path,file)))!==hash)stale=true;}catch{stale=true;}}
  ranked.push({...note,text:scrub(note.text),stale,score,pinned,citation:'memory:'+note.id,provenance:note.source||'saved note; source not recorded'});
 }
 let remaining=Math.max(0,Math.min(16000,maxChars));
 return ranked.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(a.stale)-Number(b.stale)||b.score-a.score||String(b.updatedAt).localeCompare(String(a.updatedAt))).map(n=>{const text=n.text.slice(0,remaining);remaining-=text.length;return {...n,text};}).filter(n=>n.text);
}
