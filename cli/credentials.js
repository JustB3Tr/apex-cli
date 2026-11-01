import {spawn} from 'node:child_process';
import {stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {document} from '../server/document.js';
import {BUILTIN_PROVIDERS,providerKeyMap} from '../server/runtime/providers.js';

export const KEY_PROVIDERS=providerKeyMap(BUILTIN_PROVIDERS);
const PROTECTION={win32:'windows-dpapi-current-user',darwin:'macos-keychain',linux:'linux-secret-service'};
const MAX_OUTPUT=32768,TIMEOUT_MS=30000;
const keyValid=value=>typeof value==='string'&&value.length>=10&&value.length<=8192&&!/[\s\x00-\x1f\x7f]/.test(value)&&Buffer.byteLength(value)<=8192;
const unavailable=()=>Error('Secure credential storage is unavailable. Use the provider environment variable; no plaintext fallback.');
const failed=action=>Error(`Secure credential ${action} failed or was denied. Check the OS keychain/session; no plaintext fallback.`);

// Never resolve a keychain helper through a project-controlled PATH. Unix
// executables, including symlink targets, must be root-owned and not writable
// by other users. A missing desktop service still fails closed at invocation.
async function trustedExecutable(file,platform){
 try{const resolved=await realpath(file),info=await stat(resolved);return info.isFile()&&(platform==='win32'||info.uid===0&&(info.mode&0o022)===0&&(info.mode&0o111)!==0);}catch{return false;}
}
function executableCandidates(platform){
 if(platform==='darwin')return ['/usr/bin/security'];
 if(platform==='linux')return ['/usr/bin/secret-tool','/bin/secret-tool'];
 if(platform==='win32')return [path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')];
 return [];
}
function childEnvironment(platform){
 const names=['HOME','USER','LOGNAME','LANG','LC_ALL','LC_CTYPE','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','GNOME_KEYRING_CONTROL'];
 if(platform==='win32')names.push('SystemRoot','SYSTEMROOT','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP');
 const env=Object.fromEntries(names.filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
 env.PATH=platform==='win32'?path.win32.join(process.env.SystemRoot||'C:\\Windows','System32'):'/usr/bin:/bin';return env;
}
export function runCredentialCommand(file,args,{input='',platform=process.platform,timeoutMs=TIMEOUT_MS,maxBytes=MAX_OUTPUT}={}){
 return new Promise((resolve,reject)=>{
  let child,stdout='',stderr='',bytes=0,done=false,timer;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
  try{child=spawn(file,args,{windowsHide:true,shell:false,env:childEnvironment(platform),stdio:['pipe','pipe','pipe']});}catch{return finish(failed('operation'));}
  const collect=target=>value=>{bytes+=Buffer.byteLength(value);if(bytes>maxBytes){child.kill();finish(failed('operation'));return;}if(target==='stdout')stdout+=value;else stderr+=value;};
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  child.on('error',()=>finish(unavailable()));child.on('close',(code,signal)=>finish(null,{code,signal,stdout,stderr}));
  child.stdin.on('error',()=>{});child.stdin.end(input);
  timer=setTimeout(()=>{child.kill();finish(failed('operation (timed out)'));},timeoutMs);timer.unref();
 });
}
async function utility(platform,available){for(const file of executableCandidates(platform))if(await available(file,platform))return file;return null;}
async function runPrivate(run,file,args,options){try{const result=await run(file,args,options);if(!result||!Number.isInteger(result.code)||typeof result.stdout!=='string'||typeof result.stderr!=='string'||Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)>MAX_OUTPUT)throw failed('operation');return result;}catch{throw failed('operation');}}

// Preserve the DPAPI ciphertext contract used by encrypted account/room files.
// A native keychain reference must not be passed off as encrypted document data.
export async function protect(value,decrypt=false,{platform=process.platform,run=runCredentialCommand,available=trustedExecutable}={}){
 if(platform!=='win32')throw Error('Encrypted account/room documents currently require Windows DPAPI. Provider API keys also support macOS Keychain and Linux Secret Service.');
 const file=await utility(platform,available);if(!file)throw unavailable();
 // Resolve the exact framework assembly directly. Add-Type triggers PowerShell
 // module discovery, which can hang on hosted Windows under a sanitized env.
 const script=`$ErrorActionPreference='Stop'; $null=[Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); $v=[Console]::In.ReadToEnd(); $b=${decrypt?'[Convert]::FromBase64String($v)':'[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($r)':'[Convert]::ToBase64String($r)'})`;
 const result=await runPrivate(run,file,['-NoProfile','-NonInteractive','-Command',script],{input:value,platform});
 if(result.code!==0||!result.stdout)throw failed(decrypt?'decryption':'encryption');return result.stdout;
}

// Apple's interactive parser supports quoted arguments and backslash escaping,
// without shell expansion. One command + EOF preserves a failed write's status.
const securityQuote=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
export function credentialVault(home,{platform=process.platform,run=runCredentialCommand,available=trustedExecutable}={}){
 let providers={...KEY_PROVIDERS};const protection=PROTECTION[platform]||null;
 const scope=createHash('sha256').update(path.resolve(home)).digest('hex'),service='apex-cli.'+scope;
 const doc=document(path.join(home,'credentials.enc.json'),{version:1,protection:protection||'environment-only',keys:{}},value=>{
  if(value?.version!==1||![...Object.values(PROTECTION),'environment-only'].includes(value.protection)||!value.keys||Array.isArray(value.keys)||typeof value.keys!=='object')throw Error('Invalid credential vault');
  for(const record of Object.values(value.keys)){if(!record||typeof record!=='object'||Array.isArray(record)||record.protection!==undefined&&!Object.values(PROTECTION).includes(record.protection))throw Error('Invalid credential vault');const backend=record.protection||value.protection;if(backend===PROTECTION.win32&&typeof record.encrypted!=='string')throw Error('Invalid credential vault');}
  return value;
 });
 const provider=name=>{if(!/^[a-z][a-z0-9_-]{1,31}$/.test(name)||['constructor','prototype','__proto__'].includes(name)||!Object.hasOwn(providers,name))throw Error('Choose a configured API provider from /providers');return name;};
 const helper=()=>utility(platform,available);
 const assertBackend=(data,record)=>{if((record.protection||data.protection)!==protection)throw Error('This credential belongs to another OS credential backend. Supply an environment key or save a new local credential.');};
 const attributes=name=>['service','apex-cli','profile',scope,'provider',name];
 async function keychain(action,name,key){
  const file=await helper();if(!file)throw unavailable();let args,input='';
  if(platform==='darwin'){
   if(action==='set'){
    const command=['add-generic-password','-U','-a',name,'-s',service,'-l','APEX CLI '+name,'-w',key].map(securityQuote).join(' ');
    if(Buffer.byteLength(command+'\n')>=4096)throw Error('This token exceeds the macOS secure stdin command limit. Use the provider environment variable; the token was not saved.');
    args=['-i'];input=command+'\n';
   }else args=[action==='get'?'find-generic-password':'delete-generic-password','-a',name,'-s',service,...(action==='get'?['-w']:[])];
  }else if(platform==='linux'){
   if(action==='set'){args=['store','--label=APEX CLI '+name,...attributes(name)];input=key;}
   else args=[action==='get'?'lookup':'clear',...attributes(name)];
  }else throw unavailable();
  const result=await runPrivate(run,file,args,{input,platform});
  if(result.code!==0){if(action!=='set'&&(platform==='darwin'&&result.code===44||platform==='linux'&&result.code===1&&!result.stderr.trim()))return null;throw failed(action);}
  if(action==='get'){const value=result.stdout.replace(/\r?\n$/,'');if(!keyValid(value))throw failed('read (invalid stored token)');return value;}
  return true;
 }
 return {
  configureProviders(values){providers={...KEY_PROVIDERS,...values};},
  async set(name,key){
   provider(name);if(!keyValid(key))throw Error('API key must be a single token, 10-8192 UTF-8 bytes');if(!protection)throw unavailable();
   // DPAPI does not depend on existing vault contents. Keep native helper startup
   // outside the document lock so cold Windows hosts cannot block unrelated keys.
   const encrypted=platform==='win32'?await protect(key,false,{platform,run,available}):null;
   await doc.mutate(async data=>{if(platform==='win32'){data.keys[name]={encrypted,...(data.protection!==protection?{protection}:{}),updatedAt:new Date().toISOString()};}
    else{await keychain('set',name,key);data.keys[name]={protection,updatedAt:new Date().toISOString()};}});
  },
  async get(name){provider(name);const data=await doc.read(),record=data.keys[name];if(!record)return null;assertBackend(data,record);const value=platform==='win32'?await protect(record.encrypted,true,{platform,run,available}):await keychain('get',name);if(value!==null&&!keyValid(value))throw failed('read (invalid stored token)');return value;},
  async remove(name){provider(name);await doc.mutate(async data=>{const record=data.keys[name];if(!record)return;assertBackend(data,record);if(platform!=='win32')await keychain('remove',name);delete data.keys[name];});},
  async status(){const data=await doc.read(),storageAvailable=Boolean(protection&&await helper());return Object.entries(providers).map(([name,env])=>({provider:name,saved:Boolean(data.keys[name]),environment:Boolean(process.env[env]),protection:data.keys[name]?data.keys[name].protection||data.protection:null,storageAvailable}));}
 };
}
