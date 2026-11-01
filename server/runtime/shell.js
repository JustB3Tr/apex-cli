import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,mkdtemp,realpath,lstat,readdir,open,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digest,privatePath,scrub} from '../safe-content.js';

const MAX_FILE=2*1024*1024,MAX_INPUT=24*1024*1024,MAX_FILES=1000,MAX_OUTPUT=200000;
const sensitive=name=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|APEX|_BASE_URL|NODE_OPTIONS|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|LD_PRELOAD|LD_LIBRARY_PATH|BASH_ENV|^ENV$|PYTHONPATH/i.test(name);
const within=(root,file)=>file===root||file.startsWith(root+path.sep);
const cleanEnvironment=environment=>Object.fromEntries(Object.entries(environment||{}).filter(([name,value])=>!sensitive(name)&&typeof value==='string'));
const literal=file=>{if(typeof file!=='string'||!file||file.length>500||path.isAbsolute(file)||/[\\:*?\x00-\x1f]/.test(file)||file.split('/').some(p=>!p||p==='.'||p==='..')||privatePath(file))throw Error('Select literal public project-relative files or directories');return file;};
const redactWith=environment=>{const secrets=Object.entries(environment||{}).filter(([name,value])=>sensitive(name)&&typeof value==='string'&&value.length>=4).map(([,value])=>value);return value=>{let output=scrub(String(value??''));for(const secret of secrets)output=output.split(secret).join('[REDACTED]');return output;};};

function processRun(command,args,{cwd,env,timeout=30000,signal,maxBuffer=MAX_OUTPUT,encoding='utf8'}={}){
 return new Promise(resolve=>{const started=Date.now();try{execFile(command,args,{cwd,env,timeout,signal,maxBuffer,encoding,windowsHide:true},(error,stdout='',stderr='')=>resolve({exitCode:typeof error?.code==='number'?error.code:error?null:0,stdout,stderr,spawnError:typeof error?.code==='string'?error.code:null,timedOut:Boolean(error?.killed)&&!signal?.aborted,cancelled:Boolean(signal?.aborted),elapsedMs:Date.now()-started}));}catch(error){resolve({exitCode:null,stdout:'',stderr:error.message,spawnError:error.code||'SPAWN_ERROR',timedOut:false,cancelled:Boolean(signal?.aborted),elapsedMs:Date.now()-started});}});
}

async function readPublic(root,file){
 const parts=file.split('/');let cursor=root;for(const part of parts){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw Error('Symlinks are excluded from isolated shell input');}
 const canonical=await realpath(cursor);if(!within(root,canonical)||privatePath(path.relative(root,canonical)))throw Error('Isolated shell input escapes public project files');
 const handle=await open(canonical,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const info=await handle.stat();if(!info.isFile()||info.size>MAX_FILE)throw Error('Isolated shell files must be regular files under 2MB');const bytes=Buffer.alloc(MAX_FILE+1);let length=0;while(length<bytes.length){const part=await handle.read(bytes,length,bytes.length-length,length);if(!part.bytesRead)break;length+=part.bytesRead;}if(length>MAX_FILE)throw Error('Isolated shell input changed beyond the 2MB limit');if(await realpath(cursor)!==canonical)throw Error('Isolated shell input changed its canonical destination');return bytes.subarray(0,length);}finally{await handle.close();}
}

async function stageInput(projectRoot,selected,destination,redact){
 if(!Array.isArray(selected)||!selected.length||selected.length>40)throw Error('Docker shell requires 1-40 explicit public input paths');
 const files=new Set();let total=0;
 async function visit(file){literal(file);const target=path.join(projectRoot,file),info=await lstat(target);if(info.isSymbolicLink())throw Error('Symlinks are excluded from isolated shell input');if(info.isDirectory()){for(const entry of (await readdir(target,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const relative=file+'/'+entry.name;if(privatePath(relative))continue;await visit(relative);}}else if(info.isFile()){if(files.size>=MAX_FILES&&!files.has(file))throw Error('Isolated shell input exceeds 1000 files');files.add(file);}else throw Error('Special files cannot enter the isolated workspace');}
 for(const selectedPath of [...new Set(selected)])await visit(literal(selectedPath));
 if(!files.size)throw Error('No public regular files selected for the isolated workspace');
 const manifest=[];for(const file of [...files].sort()){const bytes=await readPublic(projectRoot,file);if((total+=bytes.length)>MAX_INPUT)throw Error('Isolated shell input exceeds 24MB');const text=bytes.toString('utf8');if(redact(text)!==text)throw Error('Possible credential in selected public file; redact it before isolated execution');const target=path.join(destination,...file.split('/'));await mkdir(path.dirname(target),{recursive:true,mode:0o755});await writeFile(target,bytes,{flag:'wx',mode:0o644});manifest.push({file,bytes:bytes.length,sha256:digest(bytes)});}return manifest;
}

function dockerArguments({name,image,before,timeoutMs}){
 if(!/^apex-shell-[a-f0-9-]{36}$/.test(name)||!/^sha256:[a-f0-9]{64}$/.test(image)||!path.isAbsolute(before)||/[\r\n,]/.test(before))throw Error('Invalid isolated shell specification');
 return ['create','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--pids-limit=64','--memory=256m','--memory-swap=256m','--cpus=1','--user=65534:65534','--ipc=none','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777','--tmpfs=/workspace:rw,nosuid,nodev,size=64m,mode=1777','--mount','type=bind,source='+before+',target=/input,readonly','--workdir=/workspace','--entrypoint=/bin/sh',image,'-c','exec sleep '+(Math.ceil(timeoutMs/1000)+45)];
}

function inspectIsolation(row,{image,before}){
 const h=row?.HostConfig||{},mounts=row?.Mounts||[],input=mounts.find(m=>m.Destination==='/input');
 if(row?.Image!==image||row?.Config?.User!=='65534:65534'||h.NetworkMode!=='none'||h.ReadonlyRootfs!==true||h.Privileged||h.Memory!==268435456||h.MemorySwap!==268435456||h.NanoCpus!==1e9||h.PidsLimit!==64||h.IpcMode!=='none'||!h.CapDrop?.includes('ALL')||!h.SecurityOpt?.includes('no-new-privileges:true')||!input||input.Type!=='bind'||input.RW!==false||path.resolve(input.Source)!==path.resolve(before)||mounts.some(m=>m.Destination!=='/input'&&(!['/tmp','/workspace'].includes(m.Destination)||m.Type!=='tmpfs'))||!h.Tmpfs?.['/tmp']?.includes('size=32m')||!h.Tmpfs?.['/workspace']?.includes('size=64m')||(h.Devices||[]).length||(h.DeviceRequests||[]).length||(h.Binds||[]).length)throw Error('Docker isolation inspection failed; the command did not start');
 if((row.Config.Env||[]).some(value=>sensitive(String(value).split('=')[0])))throw Error('Container inherited credential-like environment; the command did not start');
 return {image:row.Image,network:h.NetworkMode,rootReadonly:h.ReadonlyRootfs,user:row.Config.User,memoryBytes:h.Memory,pids:h.PidsLimit,cpus:1,inputReadonly:true,workspaceLimitMB:64,credentialsForwarded:false,copyBack:false};
}

const tarText=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,Math.max(0,bytes.indexOf(0)<0?bytes.length:bytes.indexOf(0))));
function tarOctal(bytes){const value=tarText(bytes).trim();if(!/^[0-7]*$/.test(value))throw Error('Unsupported binary or invalid archive size');return value?Number.parseInt(value,8):0;}
function archivePath(raw){let file=raw;while(file.startsWith('./'))file=file.slice(2);if(file==='.'||file==='')return '';file=file.replace(/\/$/,'');if(file.length>1000||file.startsWith('/')||/[\\:\x00-\x1f]/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part)))throw Error('Unsafe archive path; raw archive retained without external writes');return file;}
function paxFields(bytes){const fields={};let offset=0;while(offset<bytes.length){const space=bytes.indexOf(32,offset);if(space<0)throw Error('Invalid archive metadata');const token=bytes.subarray(offset,space).toString('ascii');if(!/^\d+$/.test(token))throw Error('Invalid archive metadata length');const size=Number(token);if(!Number.isSafeInteger(size)||size<=space-offset+2||offset+size>bytes.length)throw Error('Invalid archive metadata bounds');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(space+1,offset+size));if(!text.endsWith('\n'))throw Error('Invalid archive metadata ending');const equal=text.indexOf('=');if(equal<1)throw Error('Invalid archive metadata field');fields[text.slice(0,equal)]=text.slice(equal+1,-1);offset+=size;}return fields;}
// A daemon tar stream is untrusted output. Never create archive links or special files.
async function extractArtifacts(archive,destination){
 if(!Buffer.isBuffer(archive)||archive.length>70*1024*1024)throw Error('A bounded binary workspace archive is required');
 const files=[],seen=new Set();let offset=0,entries=0,total=0,pax={},longName=null,longLink=null,ended=false;
 while(offset+512<=archive.length){const header=archive.subarray(offset,offset+512);if(header.every(byte=>byte===0)){ended=true;break;}if(++entries>2000)throw Error('Archive exceeds 2000 entries; raw archive retained');const expected=tarOctal(header.subarray(148,156)),observed=header.reduce((sum,byte,index)=>sum+(index>=148&&index<156?32:byte),0);if(observed!==expected)throw Error('Archive checksum mismatch; raw archive retained');
  const size=tarOctal(header.subarray(124,136)),type=String.fromCharCode(header[156]||48);if(!Number.isSafeInteger(size)||size<0||size>64*1024*1024||offset+512+size>archive.length)throw Error('Archive entry exceeds bounded content');const content=archive.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
  if(type==='x'){pax=paxFields(content);continue;}if(type==='L'){longName=tarText(content);continue;}if(type==='K'){longLink=tarText(content);continue;}if(type==='g')throw Error('Global archive overrides are unsupported; raw archive retained');
  const prefix=tarText(header.subarray(345,500)),raw=pax.path||longName||(prefix?prefix+'/':'')+tarText(header.subarray(0,100)),file=archivePath(raw),target=path.resolve(destination,...file.split('/'));if(!within(destination,target))throw Error('Archive destination escaped retained artifacts');if(pax.size!==undefined&&Number(pax.size)!==size)throw Error('Archive size override is unsupported');const linkTarget=pax.linkpath||longLink||tarText(header.subarray(157,257));pax={};longName=null;longLink=null;
  if(!file){if(type!=='5')throw Error('Archive root must be a directory');continue;}
  if(type==='5'){await mkdir(target,{recursive:true,mode:0o755});continue;}
  const identity=process.platform==='win32'?file.toLowerCase():file;if(seen.has(identity))throw Error('Duplicate archive file; existing artifacts preserved');seen.add(identity);
  if(type==='0'){if((total+=size)>64*1024*1024)throw Error('Archive files exceed 64MB');await mkdir(path.dirname(target),{recursive:true,mode:0o755});await writeFile(target,content,{flag:'wx',mode:0o600});files.push({file,bytes:size,sha256:digest(content)});}
  else files.push({file,type:type==='2'?'symlink':type==='1'?'hardlink':'special',target:linkTarget,extracted:false});
 }
 if(!ended)throw Error('Workspace archive was truncated; raw archive retained');return files;
}
const differences=(before,after)=>{const left=new Map(before.map(f=>[f.file,f])),right=new Map(after.map(f=>[f.file,f]));return [...new Set([...left.keys(),...right.keys()])].sort().flatMap(file=>{const old=left.get(file),next=right.get(file);return old?.sha256===next?.sha256&&old?.type===next?.type?[]:[{file,change:!old?'added':!next?'deleted':'modified',before:old||null,after:next||null}];});};

/** The caller still obtains explicit command approval. Docker never falls back to a host shell. */
export async function executeRuntimeShell({projectPath,command,signal,environment=process.env,profile={mode:'host'},run=processRun}={}){
 if(typeof command!=='string'||!command.trim()||command.length>32000||command.includes('\0'))throw Error('Use a nonempty shell command under 32KB');
 const mode=profile?.mode||'host',timeoutMs=profile?.timeoutMs??30000;if(!['host','docker'].includes(mode)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('Choose host or docker isolation with a 1-60 second timeout');
 const projectRoot=await realpath(projectPath),env=cleanEnvironment(environment),redact=redactWith(environment),normalize=result=>({...result,stdout:redact(result.stdout).slice(0,MAX_OUTPUT),stderr:redact(result.stderr).slice(0,MAX_OUTPUT)});
 if(mode==='host'){
  const windows=process.platform==='win32',result=normalize(await run(windows?'powershell.exe':'/bin/sh',windows?['-NoProfile','-NonInteractive','-Command',command]:['-c',command],{cwd:projectRoot,env,timeout:timeoutMs,signal,maxBuffer:MAX_OUTPUT}));
  return {...result,isolation:'Host process with explicit approval and sanitized environment; not OS-confined',credentials:'Credential-named environment variables removed',artifacts:null};
 }
 let artifacts,name,attemptedCreate=false,observed=null,exported=false,result={exitCode:null,stdout:'',stderr:'',cancelled:Boolean(signal?.aborted),timedOut:false},cleanup='not created',input=[],after=[],artifactError=null;const trace=[];
 async function docker(args,{timeout=15000,activeSignal=signal,encoding='utf8',maxBuffer=MAX_OUTPUT}={}){const raw=await run('docker',args,{cwd:projectRoot,env,timeout,signal:activeSignal||undefined,maxBuffer,encoding}),receipt=encoding==='buffer'?{...raw,stderr:redact(raw.stderr).slice(0,MAX_OUTPUT)}:normalize(raw);trace.push({operation:args[0],purpose:encoding==='buffer'?'workspace artifact export':args[0],exitCode:receipt.exitCode,timedOut:Boolean(receipt.timedOut),cancelled:Boolean(receipt.cancelled),stderr:receipt.stderr});return receipt;}
 async function checked(args,options){const receipt=await docker(args,options);if(receipt.exitCode!==0||receipt.cancelled||receipt.timedOut)throw Error('Docker '+args[0]+' failed: '+(receipt.stderr||receipt.spawnError||'nonzero exit').slice(0,600));return receipt;}
 try{
  if(!/^sha256:[a-f0-9]{64}$/.test(profile.image||''))throw Error('Docker isolation requires an immutable, already local sha256 image ID');
  if(signal?.aborted)throw Error('Cancelled before isolated execution');
  const engine=(await checked(['info','--format','{{.OSType}}'])).stdout.trim();if(engine!=='linux')throw Error('Docker isolation requires an available Linux engine; no image will be pulled');
  let image;try{image=JSON.parse((await checked(['image','inspect',profile.image])).stdout)[0];}catch(error){throw Error('Already-local Docker image unavailable or invalid; nothing pulled. '+error.message);}
  if(image?.Id!==profile.image||image?.Os!=='linux')throw Error('Pinned local image identity/platform mismatch');if((image.Config?.Env||[]).some(value=>sensitive(String(value).split('=')[0])))throw Error('Image declares credential-like environment; use a clean image');
  const artifactsRoot=path.resolve(profile.artifactsRoot||path.join(os.tmpdir(),'apex-shell-artifacts'));await mkdir(artifactsRoot,{recursive:true});artifacts=await mkdtemp(path.join(artifactsRoot,'run-'));const before=path.join(artifacts,'before'),output=path.join(artifacts,'after');await mkdir(before,{mode:0o755});await mkdir(output,{mode:0o755});input=await stageInput(projectRoot,profile.files,before,redact);
  name='apex-shell-'+randomUUID();const args=dockerArguments({name,image:profile.image,before,timeoutMs});attemptedCreate=true;await checked(args);
  const inspected=JSON.parse((await checked(['inspect',name])).stdout)[0];observed=inspectIsolation(inspected,{image:profile.image,before});await checked(['start',name]);
  result=await docker(['exec','--workdir','/workspace',name,'/bin/sh','-c','cp -R /input/. /workspace/ && exec /bin/sh -c "$1"','apex-shell',command],{timeout:timeoutMs});
  try{const archive=(await checked(['exec',name,'tar','-C','/workspace','-cf','-','.'],{activeSignal:null,encoding:'buffer',maxBuffer:70*1024*1024})).stdout;await writeFile(path.join(artifacts,'workspace.tar'),archive,{flag:'wx',mode:0o600});after=await extractArtifacts(archive,output);exported=true;}catch(error){artifactError=redact(error.message);}
 }catch(error){result={...result,error:redact(error.message),stderr:[result.stderr,redact(error.message)].filter(Boolean).join('\n'),cancelled:Boolean(signal?.aborted)};}
 finally{if(attemptedCreate&&/^apex-shell-[a-f0-9-]{36}$/.test(name||'')){try{const removed=await docker(['rm','--force','--volumes',name],{activeSignal:null});cleanup=removed.exitCode===0?'removed owned container':'owned container cleanup failed; inspect retained receipt';}catch(error){cleanup='owned container cleanup failed: '+redact(error.message);}}}
 const receipt={...normalize(result),isolation:observed?'Inspected Docker container; selected input copy only, no network, no automatic copyback':'Docker isolation requested; no host fallback or verified command execution',controls:observed,cleanup,artifacts:artifacts?{path:artifacts,before:path.join(artifacts,'before'),after:path.join(artifacts,'after'),archive:path.join(artifacts,'workspace.tar'),manifest:path.join(artifacts,'receipt.json'),diff:path.join(artifacts,'diff.json'),partial:Boolean(result.cancelled||result.timedOut||artifactError||!exported),error:artifactError}:null,changes:exported?differences(input,after):null};
 if(artifacts){await writeFile(path.join(artifacts,'diff.json'),JSON.stringify({schema:1,changes:receipt.changes,artifactError,partial:receipt.artifacts.partial},null,2),{flag:'wx',mode:0o600});await writeFile(path.join(artifacts,'receipt.json'),JSON.stringify({schema:1,command:redact(command),input,output:after,trace,receipt},null,2),{flag:'wx',mode:0o600});}return receipt;
}
