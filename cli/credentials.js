import {spawn} from 'node:child_process';
import path from 'node:path';
import {document} from '../server/document.js';
import {BUILTIN_PROVIDERS,providerKeyMap} from '../server/runtime/providers.js';

export const KEY_PROVIDERS=providerKeyMap(BUILTIN_PROVIDERS);
export function protect(value,decrypt=false){
 if(process.platform!=='win32')throw Error('Saved-key vault currently requires Windows DPAPI. Use provider environment variables on other platforms.');
 const script=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=${decrypt?'[Convert]::FromBase64String($v)':'[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($r)':'[Convert]::ToBase64String($r)'})`;
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>out+=s);child.stderr.resume();child.on('error',()=>reject(Error('Windows credential encryption is unavailable')));child.on('exit',code=>code===0?resolve(out):reject(Error('Windows credential encryption failed; no plaintext fallback')));child.stdin.on('error',()=>{});child.stdin.end(value);
 });
}
export function credentialVault(home){
 let providers={...KEY_PROVIDERS};
 const doc=document(path.join(home,'credentials.enc.json'),{version:1,protection:'windows-dpapi-current-user',keys:{}},value=>{
  if(value?.version!==1||value.protection!=='windows-dpapi-current-user'||!value.keys||Array.isArray(value.keys)||typeof value.keys!=='object')throw Error('Invalid credential vault');
  return value;
 });
 const provider=name=>{if(!Object.hasOwn(providers,name))throw Error('Choose a configured API provider from /providers');return name;};
 return {
  configureProviders(values){providers={...KEY_PROVIDERS,...values};},
  async set(name,key){provider(name);if(typeof key!=='string'||key.length<10||key.length>8192||/\s|\x00/.test(key))throw Error('API key must be a single token, 10-8192 characters');const encrypted=await protect(key);await doc.mutate(data=>{data.keys[name]={encrypted,updatedAt:new Date().toISOString()};});},
  async get(name){provider(name);const record=(await doc.read()).keys[name];return record?protect(record.encrypted,true):null;},
  async remove(name){provider(name);await doc.mutate(data=>{delete data.keys[name];});},
  async status(){const data=await doc.read();return Object.entries(providers).map(([name,env])=>({provider:name,saved:Boolean(data.keys[name]),environment:Boolean(process.env[env]),protection:data.keys[name]?data.protection:null}));}
 };
}
