import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {executeRuntimeShell} from '../server/runtime/shell.js';

const image='sha256:'+'a'.repeat(64),environment={...process.env,SAFE_LABEL:'fixture',API_KEY:'private-fixture-value',DOCKER_HOST:'tcp://unwanted.invalid:2375'};
async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-shell-')),projectPath=path.join(root,'project'),artifactsRoot=path.join(root,'artifacts');await mkdir(path.join(projectPath,'src'),{recursive:true});await writeFile(path.join(projectPath,'src','main.js'),'export const value=1;\n');await writeFile(path.join(projectPath,'src','.env'),'PRIVATE_FIXTURE_ENV');try{await fn({root,projectPath,artifactsRoot});}finally{await rm(root,{recursive:true,force:true});}}
function tarArchive(entries){const blocks=[];for(const {name,type='0',target='',content=''} of entries){const bytes=Buffer.from(content),header=Buffer.alloc(512);header.write(name,0,100);header.write('0000600\0',100);header.write('0000000\0',108);header.write('0000000\0',116);header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write(type,156);header.write(target,157,100);header.write('ustar\0',257);header.write('00',263);header.write(header.reduce((sum,n)=>sum+n,0).toString(8).padStart(6,'0')+'\0 ',148);blocks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));}return Buffer.concat([...blocks,Buffer.alloc(1024)]);}
function dockerFixture({unavailable=false,drift=false,imageSecret=false,execution,exportFailure=false,cleanupFailure=false,archive}={}){
 const calls=[];let before,name;
 return {calls,run:async(command,args,options)=>{
  calls.push({command,args,options});assert.equal(command,'docker');assert.equal(options.env.API_KEY,undefined);assert.equal(options.env.DOCKER_HOST,undefined);assert.equal(options.env.SAFE_LABEL,'fixture');const ok={exitCode:0,stdout:'',stderr:'',cancelled:false,timedOut:false};
  if(unavailable)return {...ok,exitCode:1,stderr:'Fixture daemon unavailable'};
  if(args[0]==='info')return {...ok,stdout:'linux\n'};
  if(args[0]==='image')return {...ok,stdout:JSON.stringify([{Id:image,Os:'linux',Config:{Env:imageSecret?['API_KEY=private-fixture-value']:['PATH=/usr/bin']}}])};
  if(args[0]==='create'){name=args[args.indexOf('--name')+1];before=args[args.indexOf('--mount')+1].match(/source=(.*),target=/)[1];return {...ok,stdout:'container fixture'};}
  if(args[0]==='inspect')return {...ok,stdout:JSON.stringify([{Image:image,Config:{User:'65534:65534',Env:['PATH=/usr/bin']},HostConfig:{NetworkMode:drift?'bridge':'none',ReadonlyRootfs:true,Privileged:false,Memory:268435456,MemorySwap:268435456,NanoCpus:1e9,PidsLimit:64,IpcMode:'none',CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Tmpfs:{'/tmp':'rw,noexec,nosuid,nodev,size=32m,mode=1777','/workspace':'rw,nosuid,nodev,size=64m,mode=1777'},Devices:[],Binds:[]},Mounts:[{Type:'bind',Destination:'/input',Source:before,RW:false}]}])};
  if(args[0]==='exec'&&args[2]==='tar'){assert.equal(options.signal,undefined);assert.equal(options.encoding,'buffer');if(exportFailure)return {...ok,exitCode:1,stderr:'Fixture artifact export failed'};return {...ok,stdout:archive||tarArchive([{name:'src/main.js',content:'export const value=2;\n'},{name:'generated.txt',content:'Fixture output\n'}])};}
  if(args[0]==='exec')return execution?execution({args,options,ok,before,name}):{...ok,stdout:'Fixture command completed'};
  if(args[0]==='rm'){assert.equal(options.signal,undefined);assert.equal(args.at(-1),name);return cleanupFailure?{...ok,exitCode:1,stderr:'Fixture cleanup failed'}:ok;}
  return ok;
 }};
}

test('default runtime shell actually executes on host, preserves ordinary environment and removes credential variables',()=>fixture(async({projectPath})=>{
 const command=process.platform==='win32'?'if(Test-Path Env:API_KEY){exit 9}; [Console]::Write($env:SAFE_LABEL)':'test -z "$API_KEY" || exit 9; printf "%s" "$SAFE_LABEL"',result=await executeRuntimeShell({projectPath,command,environment});assert.equal(result.exitCode,0);assert.equal(result.stdout,'fixture');assert.match(result.isolation,/not OS-confined/);assert.equal(result.artifacts,null);
}));

test('host shell timeout reports actual interrupted execution rather than successful completion',()=>fixture(async({projectPath})=>{
 const result=await executeRuntimeShell({projectPath,command:process.platform==='win32'?'Start-Sleep -Seconds 5':'sleep 5',environment,profile:{mode:'host',timeoutMs:1000}});assert.equal(result.exitCode,null);assert.equal(result.timedOut,true);assert.match(result.isolation,/Host process/);
}));

test('Docker shell runs only a pinned selected copy with inspected restrictions, retained diff and no project copyback',()=>fixture(async({projectPath,artifactsRoot})=>{
 const docker=dockerFixture(),command='printf changed > src/main.js',result=await executeRuntimeShell({projectPath,command,environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.equal(result.exitCode,0);assert.match(result.isolation,/Inspected Docker/);assert.equal(result.controls.network,'none');assert.equal(result.controls.copyBack,false);assert.equal(result.cleanup,'removed owned container');assert.equal(result.artifacts.partial,false);
 const created=docker.calls.find(c=>c.args[0]==='create'),args=created.args;for(const flag of ['--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--pids-limit=64','--memory=256m','--memory-swap=256m','--cpus=1','--user=65534:65534','--ipc=none'])assert.ok(args.includes(flag));assert.ok(!args.includes('--env'));assert.ok(!args.includes('--privileged'));assert.ok(!docker.calls.some(c=>c.args[0]==='pull'));assert.equal(docker.calls.filter(c=>c.args[0]==='exec'&&c.args[1]==='--workdir').length,1);assert.equal(docker.calls.find(c=>c.args[0]==='exec').args.at(-1),command);
 assert.equal(await readFile(path.join(projectPath,'src','main.js'),'utf8'),'export const value=1;\n');assert.equal(await readFile(path.join(result.artifacts.after,'src','main.js'),'utf8'),'export const value=2;\n');await assert.rejects(()=>readFile(path.join(result.artifacts.before,'src','.env')),/ENOENT/);assert.deepEqual(result.changes.map(c=>[c.file,c.change]),[['generated.txt','added'],['src/main.js','modified']]);
 const receipt=JSON.parse(await readFile(result.artifacts.manifest,'utf8'));assert.equal(receipt.command,command);assert.equal(receipt.input.length,1);assert.ok(!JSON.stringify(receipt).includes('private-fixture-value'));assert.ok((await readFile(result.artifacts.diff,'utf8')).includes('modified'));
}));

test('Docker unavailable never pulls, creates a container or falls back to the host shell',()=>fixture(async({projectPath,artifactsRoot})=>{
 const docker=dockerFixture({unavailable:true}),result=await executeRuntimeShell({projectPath,command:'echo should-not-run',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.equal(result.exitCode,null);assert.match(result.error,/daemon unavailable/);assert.equal(result.controls,null);assert.equal(result.changes,null);assert.equal(docker.calls.length,1);assert.equal(docker.calls[0].args[0],'info');assert.match(result.isolation,/no host fallback/);
}));

test('mutable images, private/traversal selections, detected public-file credentials and symlinks stop before command execution',()=>fixture(async({root,projectPath,artifactsRoot})=>{
 for(const selection of [{image:'alpine:latest',files:['src']},{image,files:['../outside']},{image,files:['src/.env']}]){const docker=dockerFixture(),result=await executeRuntimeShell({projectPath,command:'echo no',environment,profile:{mode:'docker',artifactsRoot,...selection},run:docker.run});assert.ok(result.error);assert.ok(!docker.calls.some(c=>['create','exec'].includes(c.args[0])));}
 await writeFile(path.join(projectPath,'public.txt'),'private-fixture-value');let docker=dockerFixture(),result=await executeRuntimeShell({projectPath,command:'echo no',environment,profile:{mode:'docker',image,files:['public.txt'],artifactsRoot},run:docker.run});assert.match(result.error,/credential/);assert.ok(!docker.calls.some(c=>c.args[0]==='create'));
 try{await symlink(path.join(projectPath,'src','main.js'),path.join(projectPath,'linked.js'),'file');}catch(error){if(['EPERM','ENOTSUP'].includes(error.code))return;throw error;}
 docker=dockerFixture();result=await executeRuntimeShell({projectPath,command:'echo no',environment,profile:{mode:'docker',image,files:['linked.js'],artifactsRoot},run:docker.run});assert.match(result.error,/Symlinks/);assert.ok(!docker.calls.some(c=>c.args[0]==='create'));
}));

test('image credential environment is rejected and inspection drift removes only the owned container without starting it',()=>fixture(async({projectPath,artifactsRoot})=>{
 let docker=dockerFixture({imageSecret:true}),result=await executeRuntimeShell({projectPath,command:'echo no',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.match(result.error,/credential-like/);assert.ok(!docker.calls.some(c=>c.args[0]==='create'));
 docker=dockerFixture({drift:true});result=await executeRuntimeShell({projectPath,command:'echo no',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.match(result.error,/inspection failed/);assert.ok(!docker.calls.some(c=>['start','exec'].includes(c.args[0])));assert.equal(result.cleanup,'removed owned container');assert.equal(result.artifacts.partial,true);assert.equal(result.changes,null);assert.match(docker.calls.find(c=>c.args[0]==='rm').args.at(-1),/^apex-shell-[a-f0-9-]{36}$/);
}));

test('cancelled isolated commands retain partial output and use fresh uncancelled export/cleanup operations',()=>fixture(async({projectPath,artifactsRoot})=>{
 const controller=new AbortController(),docker=dockerFixture({execution:async({ok})=>{controller.abort();return {...ok,exitCode:null,cancelled:true,stdout:'Partial fixture output'};}}),result=await executeRuntimeShell({projectPath,command:'long task',signal:controller.signal,environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.equal(result.cancelled,true);assert.equal(result.exitCode,null);assert.equal(result.stdout,'Partial fixture output');assert.equal(result.artifacts.partial,true);assert.equal(result.cleanup,'removed owned container');assert.ok(result.changes.some(c=>c.file==='generated.txt'));assert.equal(docker.calls.filter(c=>c.args[0]==='exec'&&c.args[1]==='--workdir').length,1);
}));

test('artifact export and container cleanup faults are explicit, retain input evidence and do not trigger a second execution',()=>fixture(async({projectPath,artifactsRoot})=>{
 const docker=dockerFixture({exportFailure:true,cleanupFailure:true}),result=await executeRuntimeShell({projectPath,command:'fixture',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.equal(result.exitCode,0);assert.equal(result.changes,null);assert.equal(result.artifacts.partial,true);assert.match(result.artifacts.error,/export failed/);assert.match(result.cleanup,/cleanup failed/);assert.equal(await readFile(path.join(result.artifacts.before,'src','main.js'),'utf8'),'export const value=1;\n');assert.equal(docker.calls.filter(c=>c.args[0]==='exec'&&c.args[1]==='--workdir').length,1);
}));

test('untrusted workspace archives cannot traverse out, alias Windows devices or create symlinks and hardlinks',()=>fixture(async({root,projectPath,artifactsRoot})=>{
 for(const name of ['../../escaped.txt','/absolute.txt','C:/absolute.txt','src/CON','src/main.js:stream','src/trailing.']){const docker=dockerFixture({archive:tarArchive([{name,content:'must not escape'}])}),result=await executeRuntimeShell({projectPath,command:'fixture',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.match(result.artifacts.error,/Unsafe archive path/);assert.equal(result.changes,null);assert.equal(result.artifacts.partial,true);assert.equal(result.cleanup,'removed owned container');assert.ok((await readFile(result.artifacts.archive)).length>0);}
 await assert.rejects(()=>readFile(path.join(root,'escaped.txt')),/ENOENT/);
 const docker=dockerFixture({archive:tarArchive([{name:'link',type:'2',target:'../../outside'},{name:'hard',type:'1',target:'../../outside'},{name:'good.txt',content:'safe'}])}),result=await executeRuntimeShell({projectPath,command:'fixture',environment,profile:{mode:'docker',image,files:['src'],artifactsRoot},run:docker.run});assert.equal(result.artifacts.partial,false);assert.equal(await readFile(path.join(result.artifacts.after,'good.txt'),'utf8'),'safe');await assert.rejects(()=>readFile(path.join(result.artifacts.after,'link')),/ENOENT/);assert.equal(result.changes.find(c=>c.file==='link').after.extracted,false);assert.equal(result.changes.find(c=>c.file==='hard').after.type,'hardlink');
}));
