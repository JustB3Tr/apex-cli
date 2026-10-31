import {mkdir,readFile,writeFile,open,rename,rm,link,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
async function replaceFile(source,target){for(let attempt=0;;attempt++){try{return await rename(source,target);}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=8)throw e;await delay(Math.min(150,10*2**attempt));}}}
export function document(file,initial,validate=value=>value){
 const lock=file+'.lock';let pending=Promise.resolve();
 async function read(){try{return validate(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return validate(structuredClone(initial));throw Error(`Saved document cannot be read; preserved: ${path.basename(file)}`);}}
 async function acquire(){
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});const token=randomUUID(),deadline=Date.now()+10000,candidate=lock+'.owner-'+token;
  // Publish complete owner metadata atomically. An abandoned empty directory is
  // claimable, but a live owner is never displaced because its write was slow.
  await writeFile(candidate,JSON.stringify({pid:process.pid,token,at:Date.now()}),{flag:'wx',mode:0o600});
  try{while(true){
   try{await mkdir(lock);}catch(e){if(e.code!=='EEXIST')throw e;}
   try{await link(candidate,path.join(lock,'owner.json'));return token;}
   catch(e){if(e.code==='ENOENT')continue;if(!['EEXIST','EPERM','EACCES'].includes(e.code))throw e;}
   try{
    const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));
    if(Number.isSafeInteger(owner.pid)&&owner.pid>0&&typeof owner.token==='string'&&/^[a-f0-9-]{36}$/.test(owner.token)&&!alive(owner.pid)){
     // Keep a nonce-specific recovery tombstone. Only one contender may retire
     // this owner, so a delayed contender cannot rename a newer live lock.
     const recovery=lock+'.recovered-'+owner.token;
     try{await mkdir(recovery);const current=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));if(current.token===owner.token){const quarantine=path.join(recovery,'retired');await rename(lock,quarantine);await rm(quarantine,{recursive:true,force:true});continue;}}
     catch(e){if(!['EEXIST','ENOENT'].includes(e.code))throw e;}
    }
   }catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
   if(Date.now()>deadline)throw Error(`Document busy; preserve lock and inspect owner: ${path.basename(file)}`);await delay(20);
  }}finally{await unlink(candidate).catch(()=>{});}
 }
 async function release(token){try{const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));if(owner.token===token){const retired=lock+'.released-'+token;await replaceFile(lock,retired);await rm(retired,{recursive:true,force:true});}}catch(e){if(e.code!=='ENOENT')throw e;}}
 function mutate(fn){const operation=pending.then(async()=>{const token=await acquire();try{const value=await read(),result=await fn(value),temp=file+'.'+randomUUID()+'.tmp';validate(value);const handle=await open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();}finally{await handle.close();}await replaceFile(temp,file);return structuredClone(result);}finally{await release(token);}});pending=operation.catch(()=>{});return operation;}
 return {read:async()=>{await pending;return read();},mutate,flush:async()=>{await pending;}};
}
