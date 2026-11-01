import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {credentialVault,protect,runCredentialCommand} from '../cli/credentials.js';

async function scratch(run){const home=await mkdtemp(path.join(os.tmpdir(),'apex-credential-fixture-'));try{await run(home);}finally{await rm(home,{recursive:true,force:true});}}
// Matches the documented security -i quotation/escape states, without a shell.
function securityWords(line){const words=[];let value='',quote=null,escaped=false,active=false;for(const c of line){if(escaped){value+=c;escaped=false;active=true;continue;}if(c==='\\'){escaped=true;active=true;continue;}if(quote){if(c===quote){quote=null;words.push(value);value='';active=false;}else value+=c;continue;}if(c==='"'||c==="'"){quote=c;active=true;}else if(/\s/.test(c)){if(active){words.push(value);value='';active=false;}}else{value+=c;active=true;}}assert.equal(quote,null);assert.equal(escaped,false);if(active)words.push(value);return words;}
function fixture(platform){
 const values=new Map(),calls=[];let failure=null,available=true;
 const options={platform,available:async()=>available,run:async(file,args,{input})=>{
  calls.push({file,args:[...args],input});if(failure){if(failure instanceof Error)throw failure;return failure;}
  if(platform==='win32'){const decrypt=args.at(-1).includes('::Unprotect(');return {code:0,stderr:'',stdout:decrypt?Buffer.from(input.slice(7),'base64').toString():'cipher:'+Buffer.from(input).toString('base64')};}
  let name,scope,action,key;
  if(platform==='darwin'){const words=args[0]==='-i'?securityWords(input):args;action=words[0];name=words[words.indexOf('-a')+1];scope=words[words.indexOf('-s')+1];if(action==='add-generic-password')key=words[words.indexOf('-w')+1];}
  else{action=args[0];name=args[args.indexOf('provider')+1];scope=args[args.indexOf('profile')+1];if(action==='store')key=input;}
  const id=scope+'|'+name;
  if(['store','add-generic-password'].includes(action)){values.set(id,key);return {code:0,stdout:'',stderr:''};}
  if(['lookup','find-generic-password'].includes(action))return values.has(id)?{code:0,stdout:values.get(id)+(platform==='darwin'?'\n':''),stderr:''}:{code:platform==='darwin'?44:1,stdout:'',stderr:platform==='darwin'?'item not found':''};
  const removed=values.delete(id);return {code:removed?0:platform==='darwin'?44:1,stdout:'',stderr:''};
 }};
 return {options,calls,values,setFailure(value){failure=value;},setAvailable(value){available=value;}};
}

for(const platform of ['win32','darwin','linux'])test(platform+': fixture vault saves, reloads, updates, removes, and never passes a token in argv',()=>scratch(async home=>{
 const backend=fixture(platform),vault=credentialVault(home,backend.options),key='fixture-key-not-real-quote"slash\\tick`dollar$(x);apostrophe\'';
 assert.equal(await vault.get('openrouter'),null);await vault.set('openrouter',key);
 const disk=await readFile(path.join(home,'credentials.enc.json'),'utf8');assert.ok(!disk.includes(key));
 if(platform!=='win32')assert.ok(!disk.includes('encrypted'));
 assert.equal(await credentialVault(home,backend.options).get('openrouter'),key);
 assert.ok(backend.calls.every(call=>!call.args.some(arg=>arg.includes(key))));
 const before=backend.calls.length,status=(await vault.status()).find(row=>row.provider==='openrouter');assert.equal(status.saved,true);assert.equal(status.storageAvailable,true);assert.equal(backend.calls.length,before,'status must not retrieve plaintext secrets or trigger keychain reads');
 await vault.set('openrouter',key+'changed');assert.equal(await vault.get('openrouter'),key+'changed');await vault.remove('openrouter');assert.equal(await vault.get('openrouter'),null);assert.equal((await vault.status()).find(row=>row.provider==='openrouter').saved,false);
 await assert.rejects(()=>vault.set('wrong',key),/configured API provider/);
}));

test('macOS uses only security -i stdin, properly quotes command punctuation, and rejects its 4096-byte input boundary',()=>scratch(async home=>{
 const backend=fixture('darwin'),vault=credentialVault(home,backend.options),key='fixture-"\\\'`$();-not-shell';await vault.set('openai',key);
 const write=backend.calls[0];assert.equal(write.file,'/usr/bin/security');assert.deepEqual(write.args,['-i']);assert.equal(write.input.split('\n').length,2);assert.ok(!write.input.includes('\nquit'));assert.equal(securityWords(write.input).at(-1),key);
 const count=backend.calls.length;await assert.rejects(()=>vault.set('openai','a'.repeat(4096)),/macOS secure stdin command limit/);assert.equal(backend.calls.length,count);assert.equal(await vault.get('openai'),key);
}));

test('Linux stores through a fixed secret-tool path, keeps stdin exact, and scopes different profiles independently',()=>scratch(async home=>{
 const backend=fixture('linux'),first=credentialVault(home,backend.options),other=credentialVault(path.join(home,'other'),backend.options);
 await first.set('openai','fixture-first-token');await other.set('openai','fixture-other-token');assert.equal(await first.get('openai'),'fixture-first-token');assert.equal(await other.get('openai'),'fixture-other-token');
 const write=backend.calls[0];assert.equal(write.file,'/usr/bin/secret-tool');assert.equal(write.args[0],'store');assert.equal(write.input,'fixture-first-token');assert.ok(write.args.includes('profile'));assert.equal(backend.values.size,2);
}));

test('missing secure backend leaves environment-only operation and never creates a plaintext credential file',()=>scratch(async home=>{
 const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='fixture-environment-only';
 try{for(const platform of ['darwin','linux','freebsd']){const backend=fixture(platform);backend.setAvailable(false);const vault=credentialVault(path.join(home,platform),backend.options);assert.equal(await vault.get('openrouter'),null);const status=(await vault.status()).find(row=>row.provider==='openrouter');assert.equal(status.environment,true);assert.equal(status.storageAvailable,false);await assert.rejects(()=>vault.set('openrouter','fixture-must-not-save'),/environment variable.*no plaintext fallback/);assert.equal(backend.calls.length,0);await assert.rejects(()=>readFile(path.join(home,platform,'credentials.enc.json')),error=>error.code==='ENOENT');}}
 finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
}));

test('helper errors are scrubbed and failed write/removal preserves prior credential metadata',()=>scratch(async home=>{
 const backend=fixture('linux'),vault=credentialVault(home,backend.options);await vault.set('openrouter','fixture-old-token');const before=await readFile(path.join(home,'credentials.enc.json'),'utf8'),secret='fixture-MUST-NOT-BE-IN-DIAGNOSTICS';
 for(const error of [{code:1,stdout:secret,stderr:'locked '+secret},new Error(secret),{code:0,stdout:'x'.repeat(32769),stderr:''}]){backend.setFailure(error);await assert.rejects(()=>vault.set('openrouter',secret),failure=>{assert.ok(!failure.message.includes(secret));assert.match(failure.message,/failed|denied/);return true;});assert.equal(await readFile(path.join(home,'credentials.enc.json'),'utf8'),before);}
 backend.setFailure({code:1,stdout:'',stderr:'locked '+secret});await assert.rejects(()=>vault.remove('openrouter'),/failed/);assert.equal(await readFile(path.join(home,'credentials.enc.json'),'utf8'),before);
 backend.setFailure(null);assert.equal(await vault.get('openrouter'),'fixture-old-token');
}));

test('external missing key is distinct from a locked keychain and does not silently replace evidence',()=>scratch(async home=>{
 for(const platform of ['darwin','linux']){const backend=fixture(platform),vault=credentialVault(path.join(home,platform),backend.options);await vault.set('deepseek','fixture-not-real-token');backend.values.clear();assert.equal(await vault.get('deepseek'),null);assert.equal((await vault.status()).find(row=>row.provider==='deepseek').saved,true);backend.setFailure({code:platform==='darwin'?36:1,stdout:'',stderr:'locked'});await assert.rejects(()=>vault.get('deepseek'),/failed/);backend.setFailure(null);await vault.remove('deepseek');}
}));

test('concurrent provider saves serialize with metadata and custom provider names are supported',()=>scratch(async home=>{
 const backend=fixture('linux'),vault=credentialVault(home,backend.options);vault.configureProviders({company:'COMPANY_API_KEY'});
 await Promise.all(['openrouter','openai','company'].map(name=>vault.set(name,'fixture-'+name+'-token')));for(const name of ['openrouter','openai','company'])assert.equal(await vault.get(name),'fixture-'+name+'-token');assert.equal((await vault.status()).filter(row=>row.saved).length,3);
 for(const key of ['short','fixture\nnewline','fixture\x1bcontrol','x'.repeat(8193)])await assert.rejects(()=>vault.set('openai',key),/single token/);
 assert.ok((await readdir(home)).every(file=>!file.endsWith('.tmp')));
}));

test('cross-OS metadata never triggers the wrong backend and may be replaced only by an explicit save',()=>scratch(async home=>{
 const windows=fixture('win32'),mac=fixture('darwin');await credentialVault(home,windows.options).set('openai','fixture-windows-key');await assert.rejects(()=>credentialVault(home,mac.options).get('openai'),/another OS/);assert.equal(mac.calls.length,0);
 await credentialVault(home,mac.options).set('openai','fixture-macos-key');assert.equal(await credentialVault(home,mac.options).get('openai'),'fixture-macos-key');await credentialVault(home,windows.options).set('openai','fixture-windows-again');assert.equal(await credentialVault(home,windows.options).get('openai'),'fixture-windows-again');
 await assert.rejects(()=>protect('document data',false,mac.options),/account\/room documents/);
}));

test('process runner enforces output/time bounds and strips unrelated API tokens from helper environment',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-not-for-helper';
 try{const result=await runCredentialCommand(process.execPath,['-e','process.stdout.write(String(Boolean(process.env.OPENAI_API_KEY)))']);assert.equal(result.stdout,'false');await assert.rejects(()=>runCredentialCommand(process.execPath,['-e','process.stdout.write("x".repeat(10000))'],{maxBytes:100}),/failed/);await assert.rejects(()=>runCredentialCommand(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:50}),/timed out/);}
 finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
