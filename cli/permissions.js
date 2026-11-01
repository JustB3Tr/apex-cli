import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {scopedPath} from '../server/runtime/files.js';
import {privatePath} from '../server/safe-content.js';

export const PERMISSIONS=['ask','auto','read-only'];
// Auto is a deterministic local policy. Model claims and shell output cannot grant permission.
export async function autoPermission({tool,args,root,mode,permissions}){
 if(mode==='plan'||permissions==='read-only')return {decision:'deny',reason:'Read-only mode'};
 if(permissions!=='auto')return {decision:'ask',reason:'Ask permissions'};
 if(tool==='run_shell'&&args?.executionProfile?.mode==='docker')return {decision:'ask',reason:'Explicit approval for isolated process execution'};
 if(tool==='run_shell'&&typeof args?.command==='string'&&(process.platform==='win32'?['pwd','Get-Location','Get-Date']:['pwd']).includes(args.command.trim()))return {decision:'allow',reason:'Literal location/time inspection command'};
 if(tool!=='write_file')return {decision:'ask',reason:'Execution, external calls and other actions need approval'};
 const target=args?.path;
 if(typeof target!=='string'||typeof args.content!=='string'||Buffer.byteLength(args.content)>200000)return {decision:'ask',reason:'Unsupported write'};
 try{
  const base=await realpath(root),canonical=await scopedPath(root,target,{write:true}),relative=path.relative(base,canonical);
  const protectedFile=p=>privatePath(p)||/(^|[\\/])(?:\.[^\\/]+|package(?:-lock)?\.json|npm-shrinkwrap\.json|AGENTS\.md|CLAUDE\.md|Modelfile)([\\/]|$)/i.test(p);
  if(!relative||protectedFile(target)||protectedFile(relative)||! /\.(?:md|txt|js|mjs|cjs|ts|tsx|jsx|css|html|json|py|rs|go|java|c|h|cpp|svg|yaml|yml)$/i.test(relative))return {decision:'ask',reason:'Protected or unrecognized file'};
  return {decision:'allow',reason:'Bounded project source/text write'};
 }catch{return {decision:'ask',reason:'Path could not be verified inside the project'};}
}

export function commandCatalog(help){
 const seen=new Set(),out=[];
 for(const line of help.split('\n')){
  const match=line.match(/^\s*(\/[a-z][\w-]*)(.*)$/i);if(!match)continue;
  // Include compact aliases such as /plan /build, but not slash paths in descriptions.
  const commands=[match[1],...(match[2].match(/^\s+(\/[a-z][\w-]*)\b/i)?.slice(1)||[])];
  for(const command of commands)if(!seen.has(command)){seen.add(command);out.push({command,description:match[2].trim().replace(/\s+/g,' ')});}
 }
 return out.sort((a,b)=>a.command.localeCompare(b.command));
}
