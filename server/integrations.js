import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {access,readFile,stat,realpath,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scrub,digest} from './safe-content.js';
import {randomUUID} from 'node:crypto';
const exec=promisify(execFile);
export async function integrationLogin(service,cwd){const binary=await integrationExecutable(service);return new Promise((resolve,reject)=>{const child=spawn(binary.command,[...binary.prefix,...(service==='github'?['auth','login']:['login'])],{cwd,stdio:'inherit',windowsHide:false,env:{...process.env,NODE_TLS_REJECT_UNAUTHORIZED:'1'}});child.once('error',reject);child.once('exit',code=>resolve(code??1));});}
export async function integrationExecutable(service){
 const name=service==='github'?'gh':service==='vercel'?'vercel':null;if(!name)throw Error('Unknown integration');
 for(const dir of (process.env.PATH||'').split(path.delimiter))for(const suffix of process.platform==='win32'?['.exe','.cmd']:['']){
  const file=path.join(dir,name+suffix);try{await access(file);}catch{continue;}
  if(suffix!=='.cmd')return {command:file,prefix:[]};
  if(service==='vercel'){const script=path.join(dir,'node_modules','vercel','dist','index.js');try{await access(script);return {command:process.execPath,prefix:[script]};}catch{}}
 }
 throw Error('Install the official '+(service==='github'?'GitHub CLI (gh)':'Vercel CLI (npm install -g vercel)')+' first, then sign in yourself');
}
export async function runIntegrationCLI(service,args,{cwd,timeout=30000}={}){
 const binary=await integrationExecutable(service);
 try{const r=await exec(binary.command,[...binary.prefix,...args],{cwd,windowsHide:true,timeout,maxBuffer:500000,env:{...process.env,NODE_TLS_REJECT_UNAUTHORIZED:'1',GH_PROMPT_DISABLED:'1',GH_PAGER:'cat',GIT_TERMINAL_PROMPT:'0',VERCEL_TELEMETRY_DISABLED:'1',CI:'1',NO_COLOR:'1'}});return {stdout:scrub(r.stdout),stderr:scrub(r.stderr)};}
 catch(error){throw Error(scrub(error.stderr||error.message).slice(0,1500)+'; no automatic retry or login');}
}
const repoName=value=>{if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/.test(value))throw Error('Use OWNER/REPOSITORY');return value;};
const bounded=(value,max=10000)=>{if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))throw Error('Nonempty bounded text required');return value;};
const parse=r=>{try{return JSON.parse(r.stdout);}catch{throw Error('CLI returned no structured result; inspect the installed CLI/version');}};
export function integrations(store,{run=runIntegrationCLI}={}){
 async function project(id){return store.getProject(id);}
 async function target(id,service){const p=await project(id),t=p.integrations?.[service];if(!t)throw Error('Connect '+service+' for this project first');return {p,t};}
 async function save(id,service,value){await store.transaction(s=>{const p=s.projects.find(p=>p.id===id);if(!p)throw Error('Project not found');p.integrations={...p.integrations,[service]:value};});return value;}
 async function vercelLocal(p){const file=path.join(p.path,'.vercel','project.json');if((await stat(file)).size>16000)throw Error('Vercel link too large');const canonical=await realpath(file),root=await realpath(p.path);if(!canonical.startsWith(root+path.sep))throw Error('Vercel link escapes project');const data=JSON.parse(await readFile(file,'utf8'));if(!/^[A-Za-z0-9][\w-]*$/.test(data.projectId||'')||!/^[A-Za-z0-9][\w-]*$/.test(data.orgId||''))throw Error('Run vercel link yourself for the intended project first');return {projectId:data.projectId,orgId:data.orgId};}
 async function verifyVercel(p,t){const local=await vercelLocal(p);if(local.projectId!==t.projectId||local.orgId!==t.orgId)throw Error('Vercel link changed; reconnect explicitly');const info=parse(await run('vercel',['project','inspect','--non-interactive'],{cwd:p.path})),data=info.project||info;if((data.id||data.projectId)!==t.projectId||(data.accountId||data.orgId||data.teamId)!==t.orgId)throw Error('CLI project/team does not match saved target; no deployment sent');return data;}
 async function receipt(projectId,service,action,result){await store.event({projectId,type:'integration_receipt',data:{service,action,result}});return result;}
 async function mutate(projectId,service,action,exactTarget,payload,operation){
  const id=randomUUID();await store.transaction(s=>{if(s.events.some(e=>e.projectId===projectId&&e.type==='integration_action'&&e.data.service===service&&['sending','unknown'].includes(e.data.state)))throw Error('Unresolved '+service+' action; inspect/reconcile it before another publication');s.events.push({id,projectId,type:'integration_action',createdAt:new Date().toISOString(),data:{service,action,target:exactTarget,payloadHash:digest(JSON.stringify(payload)),state:'sending',pid:process.pid}});});
  try{const result=await operation();await store.transaction(s=>{const e=s.events.find(e=>e.id===id);e.data.state='complete';e.data.result=result;e.data.completedAt=new Date().toISOString();});return result;}
  catch(error){await store.transaction(s=>{const e=s.events.find(e=>e.id===id);e.data.state='unknown';e.data.error=scrub(error.message);});throw Error(error.message+' · preserved action '+id+' may have run; no automatic replay');}
 }
 return {
  async status(projectId){const p=await project(projectId);return {projectId,connected:p.integrations||{},actions:await store.records('events',{projectId,type:'integration_action'}),credentials:'Owned by official CLIs/environment; never copied to APEX'};},
  async reconcile(projectId,service,id,observation){bounded(observation,2000);return store.transaction(s=>{const e=s.events.find(e=>e.id===id&&e.projectId===projectId&&e.type==='integration_action'&&e.data.service===service);if(!e||!['sending','unknown'].includes(e.data.state))throw Error('Choose an unresolved integration action');let alive=false;try{process.kill(e.data.pid,0);alive=true;}catch(error){alive=error.code==='EPERM';}if(e.data.state==='sending'&&alive)throw Error('Action is still running');e.data.state='reconciled';e.data.humanObservation=scrub(observation);return e;});},
  async githubConnect(projectId,repository){repository=repoName(repository);const p=await project(projectId),info=parse(await run('github',['repo','view',repository,'--json','nameWithOwner,url,defaultBranchRef'],{cwd:p.path}));if(info.nameWithOwner?.toLowerCase()!==repository.toLowerCase())throw Error('GitHub target mismatch');return save(projectId,'github',{repository:info.nameWithOwner,url:info.url,verifiedAt:new Date().toISOString()});},
  async github(projectId,action,input={}){
   const {p,t}=await target(projectId,'github'),repo=repoName(t.repository);let args;
   if(action==='issues'||action==='prs')args=[action==='issues'?'issue':'pr','list','--repo',repo,'--limit','30','--json','number,title,state,url'];
   else if(action==='repo')args=['repo','view',repo,'--json','nameWithOwner,url,defaultBranchRef,description'];
   else if(action==='issue-create'||action==='pr-create'){
    if(input.confirmTarget!==repo)throw Error('Confirm exact GitHub target '+repo);
    const title=bounded(input.title,250);bounded(input.body);args=[action==='issue-create'?'issue':'pr','create','--repo',repo,'--title='+title];
    if(action==='pr-create'){const head=bounded(input.head,200),base=bounded(input.base,200);if([head,base].some(b=>b.startsWith('-')||/[\s~^:?*\[\\]/.test(b)))throw Error('Use explicit branch names');args.push('--head',head,'--base',base,'--draft');}
   }else throw Error('Unknown GitHub action');
   let output;if(['issue-create','pr-create'].includes(action)){
    if(scrub(input.body)!==input.body||scrub(input.title)!==input.title)throw Error('Possible secret in publication text');
    output=await mutate(projectId,'github',action,repo,input,async()=>{const folder=await mkdtemp(path.join(os.tmpdir(),'apex-gh-body-'));try{const file=path.join(folder,'body.md');await writeFile(file,input.body,{flag:'wx',mode:0o600});return await run('github',[...args,'--body-file',file],{cwd:p.path});}finally{const parent=path.resolve(os.tmpdir());if(!path.resolve(folder).startsWith(parent+path.sep+'apex-gh-body-'))throw Error('Unexpected temporary body path');await rm(folder,{recursive:true,force:true});}});
   }else output=await run('github',args,{cwd:p.path});
   return receipt(projectId,'github',action,['issues','prs','repo'].includes(action)?parse(output):{url:output.stdout.trim(),target:repo});
  },
  async vercelConnect(projectId){const p=await project(projectId),local=await vercelLocal(p),info=await verifyVercel(p,local);return save(projectId,'vercel',{...local,name:info.name||local.projectId,verifiedAt:new Date().toISOString()});},
  async vercel(projectId,action,input={}){
   const {p,t}=await target(projectId,'vercel'),info=await verifyVercel(p,t);
   if(action==='inspect')return receipt(projectId,'vercel',action,{projectId:t.projectId,orgId:t.orgId,name:info.name});
   if(action==='deployments'){if(typeof info.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(info.name))throw Error('Unrecognized Vercel project name');return receipt(projectId,'vercel',action,parse(await run('vercel',['list',info.name,'--scope',t.orgId,'--status','READY','--format','json','--non-interactive'],{cwd:p.path})));}
   if(action!=='preview')throw Error('Only inspect, deployments and preview are supported; production deployment is not exposed');
   if(input.confirmTarget!==t.projectId+'@'+t.orgId)throw Error('Confirm exact Vercel project and team');
   const result=await mutate(projectId,'vercel',action,t.projectId+'@'+t.orgId,input,()=>run('vercel',['deploy','--yes','--non-interactive','--scope',t.orgId],{cwd:p.path,timeout:120000}));return receipt(projectId,'vercel',action,{target:t.projectId+'@'+t.orgId,output:result.stdout,production:false});
  }
 };
}
