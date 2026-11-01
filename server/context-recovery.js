import {contractContext} from './project-contracts.js';
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {projectVault} from './vault.js';
import {scopedPath} from './runtime/files.js';
import {digest,scrub,privatePath} from './safe-content.js';
import {latestCache} from './runtime/cache.js';

export function recoveryTrigger({session,model,projection,previous,now=Date.now()}){
 const cache=latestCache(session.messages||[],model),windows=cache?.windows||[],elapsed=windows.length>0&&windows.every(w=>Number.isFinite(w.expiresAt)&&w.expiresAt<=now),omitted=projection.omittedTurns||0;
 const boundary=omitted?(session.messages||[]).filter(m=>m.role==='user')[omitted-1]?.id||String(omitted):null;
 const key=digest(JSON.stringify({model,boundary,cache:elapsed?cache.observedAt:null}));
 return {needed:Boolean((omitted||elapsed)&&previous?.key!==key),key,omittedTurns:omitted,cacheWindowElapsed:elapsed,reason:omitted?'Saved turns exceed the current context selection':'Estimated provider cache window elapsed',notice:'Cache expiry affects reuse/pricing, not saved chat history. Vault retrieval is selective and may miss details. No request has been sent yet.'};
}
export async function readVaultContext(store,projectId,file,{shared=false,maxChars=6000}={}){
 const vault=await projectVault(store,projectId);if(!vault)throw Error('No project vault configured');
 if(typeof file!=='string'||file.length>400||!file.endsWith('.md')||path.isAbsolute(file)||file.split(/[\\/]/).some(v=>v==='..'||v.startsWith('.'))||privatePath(file)&&!/^Private\//.test(file)||/^[a-z][a-z0-9+.-]*:/i.test(file)||shared&&/^Private\//.test(file))throw Error('Select an allowed vault note, not a private path or draft');
 const actual=await scopedPath(vault.root,file,{allowPrivate:true}),canonical=path.relative(await realpath(vault.root),actual).replaceAll('\\','/');if(canonical.split('/').some(v=>v.startsWith('.'))||(privatePath(canonical)&&!/^Private\//.test(canonical))||shared&&/^Private\//i.test(canonical))throw Error('Private canonical vault path');if((await stat(actual)).size>100000)throw Error('Vault note exceeds 100KB');const raw=await readFile(actual,'utf8');if(shared&&(/^visibility:\s*["']?private/mi.test(raw)||! /^(Home\.md$|Shared\/|Chats\/|Tasks\/|Decisions\/|Agents\/)/.test(canonical)&&!/^visibility:\s*["']?shared/mi.test(raw)))throw Error('Shared context excludes private or undeclared notes');
 const text=scrub(raw),links=[...text.matchAll(/(?<!!)\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map(m=>m[1]).filter(v=>v.length<300&&!v.includes(':')&&!v.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.'))).slice(0,30);
 return {file,citation:'vault:'+file,sourceHash:digest(raw),observedAt:new Date().toISOString(),text:text.slice(0,Math.min(12000,Math.max(0,maxChars))),truncated:text.length>maxChars,links,policy:'Untrusted saved reference; not approval or verified execution. Links are names only; no remote resources loaded.'};
}
export async function recoverVaultContext(store,projectId,query,{shared=false}={}){
 const contracts=await contractContext(store,projectId,query,{shared,maxChars:4000}),vault=await projectVault(store,projectId);if(!vault)return {notes:[],contracts,missingVault:true};
 const hits=await vault.search(query,{visibility:shared?'shared':'private',maxChars:10000}),notes=[];let chars=10000;
 for(const hit of hits.slice(0,5)){if(chars<=0)break;const note=await readVaultContext(store,projectId,hit.file,{shared,maxChars:Math.min(3000,chars)});notes.push(note);chars-=note.text.length;}
 let resolved=[];try{const {buildVaultGraph}=await import('./vault-graph.js'),graph=await buildVaultGraph(store,projectId,{includePrivate:!shared}),selected=new Set(notes.map(n=>'note:'+n.file));resolved=graph.edges.filter(e=>selected.has(e.from)).map(e=>graph.nodes.find(n=>n.id===e.to)?.file).filter(Boolean);}catch{}
 const linked=new Set([...resolved,...notes.flatMap(n=>n.links)]);for(const link of linked){if(notes.length>=9||chars<=0)break;const file=link.endsWith('.md')?link:link+'.md';if(notes.some(n=>n.file===file))continue;try{const note=await readVaultContext(store,projectId,file,{shared,maxChars:Math.min(1800,chars)});notes.push({...note,reachedVia:'explicit wikilink from selected note'});chars-=note.text.length;}catch{}}
 return {notes,contracts,bounded:true,notice:'Selected keyword matches and one-hop local links, not every connection or a complete transcript. Recheck current files and evidence.'};
}
export async function saveRecoveryCheckpoint(store,projectId,session,omittedTurns){
 const vault=await projectVault(store,projectId);if(!vault||!omittedTurns)return null;
 let turns=0;const omitted=[];for(const m of session.messages||[]){if(m.role==='user')turns++;if(turns>omittedTurns)break;if(!m.agentId&&['user','assistant'].includes(m.role)&&typeof m.content==='string')omitted.push({id:m.id,role:m.role,createdAt:m.createdAt,hash:digest(m.content),excerpt:scrub(m.content).slice(0,1200),classification:m.role==='assistant'?'saved model text; not execution proof':'saved user text'});}
 const boundary=omitted.at(-1)?.id||omittedTurns;return vault.note({id:'recovery:'+session.id+':'+boundary,title:'Chat recovery · '+session.title,kind:'context',visibility:'private',source:'session:'+session.id,content:'Saved context checkpoint. Full original messages remain in APEX chat history. Excerpts may omit details.\n\n```json\n'+JSON.stringify(omitted.slice(-16),null,2)+'\n```'});
}
