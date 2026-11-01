import path from 'node:path';import {document} from './document.js';import {protect} from '../cli/credentials.js';
export function roomSecrets(home,{encrypt=v=>protect(v),decrypt=v=>protect(v,true)}={}){
 const doc=document(path.join(home,'room-secrets.enc.json'),{version:1,entries:{}}),cache=new Map();
 return {
  async set(id,value){const encrypted=await encrypt(JSON.stringify(value));await doc.mutate(s=>{s.entries[id]=encrypted;});cache.set(id,{encrypted,value:structuredClone(value)});},
  async get(id){const encrypted=(await doc.read()).entries[id];if(!encrypted){cache.delete(id);return null;}const old=cache.get(id);if(old?.encrypted===encrypted)return structuredClone(old.value);const value=JSON.parse(await decrypt(encrypted));cache.set(id,{encrypted,value});return structuredClone(value);},
  async remove(id){await doc.mutate(s=>{delete s.entries[id];});cache.delete(id);}
 };
}
