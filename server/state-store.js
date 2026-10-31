import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import {randomUUID,randomBytes} from 'node:crypto';import {document} from './document.js';
const collections=['projects','sessions','memory','agents','jobs','requests','events','rooms','evaluations','packs'];
export async function createStore(home=process.env.APEX_HOME||path.join(os.homedir(),'.apex-cli')){
 home=path.resolve(home);await fs.mkdir(home,{recursive:true,mode:0o700});
 const validate=s=>{for(const name of collections){if(s[name]===undefined)s[name]=[];if(!Array.isArray(s[name]))throw Error('Invalid '+name);}s.settings||={};return s;};
 const doc=document(path.join(home,'state.json'),{settings:{}},validate),stamp=()=>new Date().toISOString();await doc.read();
 const list=async(name,filter=()=>true)=>(await doc.read())[name].filter(filter),known=name=>{if(!collections.includes(name))throw Error('Unknown record collection');};
 const store={home,transaction:fn=>doc.mutate(fn),
  async records(name,filter={}){known(name);return list(name,r=>Object.entries(filter).every(([k,v])=>r[k]===v));},
  async record(name,id){known(name);return (await list(name,r=>r.id===id))[0]||null;},
  async saveRecord(name,row){known(name);return doc.mutate(s=>{const value={...row,id:row.id||randomUUID(),updatedAt:stamp()},i=s[name].findIndex(r=>r.id===value.id);if(i<0)s[name].push(value);else s[name][i]=value;return value;});},
  async removeRecord(name,id){known(name);return doc.mutate(s=>{const old=s[name].length;s[name]=s[name].filter(r=>r.id!==id);return old!==s[name].length;});},
  async event({projectId,jobId,type,data={}}){return store.saveRecord('events',{projectId,jobId,type,data,createdAt:stamp()});},
  async listProjects(){return list('projects');},
  async createProject(input){if(!input.path||!input.name?.trim())throw Error('Project name and absolute folder are required.');const folder=path.resolve(input.path);await fs.mkdir(folder,{recursive:true});const real=await fs.realpath(folder);if(!(await fs.stat(real)).isDirectory())throw Error('Project path is not a directory.');return doc.mutate(s=>{const existing=s.projects.find(p=>p.path.toLowerCase()===real.toLowerCase());if(existing)return existing;const p={id:randomUUID(),name:input.name.trim().slice(0,100),path:real,createdAt:stamp()};s.projects.push(p);return p;});},
  async getProject(id){const value=(await list('projects',p=>p.id===id))[0];if(!value)throw Error('Project not found');return value;},
  async updateProject(id,changes){return doc.mutate(s=>{const p=s.projects.find(p=>p.id===id);if(!p)throw Error('Project not found');for(const key of ['vaultPath','repo','sync','contextMode','roomId'])if(Object.hasOwn(changes,key))p[key]=changes[key];return p;});},
  async listSessions(projectId){return (await list('sessions',s=>s.projectId===projectId)).map(({messages,...s})=>({...s,messageCount:messages.length}));},
  async createSession({projectId,title}){await store.getProject(projectId);return doc.mutate(s=>{const row={id:randomUUID(),projectId,title:String(title||'New chat').slice(0,150),createdAt:stamp(),updatedAt:stamp(),messages:[]};s.sessions.push(row);return row;});},
  async getSession(id){const row=(await list('sessions',s=>s.id===id))[0];if(!row)throw Error('Chat not found');return row;},
  async appendMessage(sessionId,message){return doc.mutate(s=>{const session=s.sessions.find(r=>r.id===sessionId);if(!session)throw Error('Chat not found');const duplicate=message.id&&session.messages.find(m=>m.id===message.id);if(duplicate)return duplicate;const row={...message,id:message.id||randomUUID(),createdAt:message.createdAt||stamp()};session.messages.push(row);session.updatedAt=stamp();return row;});},
  async listMemory(projectId){return list('memory',m=>!m.projectId||m.projectId===projectId);},
  async addMemory({projectId,text,...metadata}){if(projectId)await store.getProject(projectId);if(!text?.trim())throw Error('Memory text required.');const allowed={};for(const k of ['kind','source','visibility','expiresAt','fileHashes','commit','title'])if(metadata[k]!==undefined)allowed[k]=metadata[k];return store.saveRecord('memory',{id:randomUUID(),projectId:projectId||null,text:String(text).trim().slice(0,12000),visibility:'private',...allowed,createdAt:stamp()});},
  async deleteMemory(id){return {deleted:await store.removeRecord('memory',id)};},
  async listAgents(projectId){return list('agents',a=>!projectId||a.projectId===projectId);},async saveAgent(agent){return store.saveRecord('agents',agent);},
  async readSettings(){return (await doc.read()).settings;},async writeSettings(value){return doc.mutate(s=>{s.settings={...s.settings,...value};return s.settings;});},
  async identity(){return doc.mutate(s=>{s.settings.identity||={id:randomUUID(),name:os.userInfo().username,device:os.hostname()};return s.settings.identity;});},async flush(){await doc.flush();}
 };
 let token;const auth=path.join(home,'auth-token');try{token=(await fs.readFile(auth,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('hex');try{await fs.writeFile(auth,token,{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;token=(await fs.readFile(auth,'utf8')).trim();}}
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid local authentication file.');return {store,token};
}
