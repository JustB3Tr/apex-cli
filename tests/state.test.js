import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import os from 'node:os';import {createStore} from '../server/store.js';
test('independent process writers preserve every message and corrupt state',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-state-'));
 try{const {store}=await createStore(home),project=await store.createProject({name:'Fixture',path:path.join(home,'work')}),session=await store.createSession({projectId:project.id});
  const run=n=>new Promise((resolve,reject)=>{const source=`import {createStore} from './server/store.js';const {store}=await createStore(process.argv[1]);for(let i=0;i<8;i++)await store.appendMessage(process.argv[2],{id:process.argv[3]+'-'+i,role:'user',content:'fixture'});`;const p=spawn(process.execPath,['--input-type=module','-e',source,home,session.id,String(n)],{cwd:process.cwd(),windowsHide:true});let err='';p.stderr.on('data',b=>err+=b);p.on('exit',code=>code===0?resolve():reject(Error(err)));});
  await Promise.all([run(1),run(2),run(3)]);assert.equal((await store.getSession(session.id)).messages.length,24);await store.appendMessage(session.id,{id:'1-0',role:'user',content:'duplicate'});assert.equal((await store.getSession(session.id)).messages.length,24);
  const before=await readFile(path.join(home,'state.json'),'utf8');await writeFile(path.join(home,'state.json'),'{broken');await assert.rejects(()=>store.writeSettings({bad:true}),/preserved/);assert.equal(await readFile(path.join(home,'state.json'),'utf8'),'{broken');await writeFile(path.join(home,'state.json'),before);
 }finally{await rm(home,{recursive:true,force:true});}
});
