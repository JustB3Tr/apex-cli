import {access,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

/** Resolve executables without shell-interpolating prompts or credentials. */
export async function nativeExecutable(provider){
 if(!['codex','claude'].includes(provider))throw Error('Choose codex or claude');
 for(const folder of (process.env.PATH||'').split(path.delimiter)){
  for(const suffix of process.platform==='win32'?['.exe','.cmd']:['']){
   const file=path.join(folder,provider+suffix);try{await access(file);}catch{continue;}
   if(suffix!=='.cmd')return file;
   // Native Claude npm shim forwards to this binary. Do not execute a command string.
   const claude=path.join(folder,'node_modules','@anthropic-ai','claude-code','bin','claude.exe');
   if(provider==='claude'){try{await access(claude);return claude;}catch{}}
   const script=await readFile(file,'utf8');
   if(script.includes('@openai/codex')){const binary=path.join(folder,'node_modules','@openai','codex','bin','codex.js');try{await access(binary);return {command:process.execPath,prefix:[binary]};}catch{}}
  }
 }
 throw Error(`${provider} CLI is not installed on PATH. Install the official CLI first.`);
}
export function nativeArguments(provider,{login=false,status=false,logout=false,mode='build',prompt=''}={}){
 if(!['codex','claude'].includes(provider))throw Error('Unknown native provider');
 if(login)return provider==='codex'?['login']:['auth','login'];
 if(status)return provider==='codex'?['login','status']:['auth','status','--text'];
 if(logout)return provider==='codex'?['logout']:['auth','logout'];
 const args=provider==='codex'?['--sandbox',mode==='plan'?'read-only':'workspace-write']:['--permission-mode',mode==='plan'?'plan':'default'];
 if(mode==='plan'&&provider==='claude')args.push('--tools','Read,Glob,Grep');
 // End option parsing. Prompts are literal argv values, never shell code.
 if(prompt)args.push('--',prompt);
 return args;
}
export async function runNative(provider,{cwd,apiKey,apiLogin=false,...options}={}){
 const resolved=await nativeExecutable(provider),command=typeof resolved==='string'?resolved:resolved.command,args=[...(resolved.prefix||[]),...(apiLogin&&provider==='codex'?['login','--with-api-key']:nativeArguments(provider,options))];
 const env={...process.env,NODE_TLS_REJECT_UNAUTHORIZED:'1'};
 if(apiKey&&provider==='claude')env.ANTHROPIC_API_KEY=apiKey;
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,stdio:apiLogin?['pipe','inherit','inherit']:'inherit',windowsHide:false,env});if(apiLogin){child.stdin.on('error',()=>{});child.stdin.end(apiKey+'\n');}child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}
