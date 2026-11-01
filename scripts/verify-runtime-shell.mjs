import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {executeRuntimeShell} from '../server/runtime/shell.js';
const root=await mkdtemp(path.join(os.tmpdir(),'apex-real-shell-')),image='sha256:59227fe6bfa27d55d205bfe2f931123a88b2aea937872aa5ae8993496aac8678';
try{
 await writeFile(path.join(root,'fixture.txt'),'unchanged fixture');
 const result=await executeRuntimeShell({projectPath:root,command:'id -u; test -z "$OPENROUTER_API_KEY" && printf no-forwarded-key; printf isolated > output.txt; cat fixture.txt',environment:{...process.env,OPENROUTER_API_KEY:'fixture-not-real'},profile:{mode:'docker',image,files:['fixture.txt'],timeoutMs:30000,artifactsRoot:path.resolve('artifacts/runtime-shell')}});
 assert.equal(result.exitCode,0,JSON.stringify(result));assert.match(result.stdout,/65534/);assert.match(result.stdout,/no-forwarded-key/);assert.equal(result.artifacts.partial,false,JSON.stringify(result.artifacts));assert.ok(result.changes.some(c=>JSON.stringify(c).includes('output.txt')));assert.equal(await readFile(path.join(result.artifacts.after,'output.txt'),'utf8'),'isolated');assert.equal(await readFile(path.join(root,'fixture.txt'),'utf8'),'unchanged fixture');assert.equal(result.cleanup,'removed owned container');
 const receipt={at:new Date().toISOString(),actualLinuxDocker:true,image,nonRoot:true,noForwardedCredential:true,outputRetained:true,hostSourceUnchanged:true,ownedContainerRemoved:true,paidCalls:0,imagePulls:0,result};await mkdir('artifacts',{recursive:true});await writeFile('artifacts/runtime-shell-0.17.0-proof.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({passed:true,actualLinuxDocker:true,outputRetained:true,hostSourceUnchanged:true,paidCalls:0}));
}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
