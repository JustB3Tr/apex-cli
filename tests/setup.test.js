import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {guidedSetup} from '../cli/setup.js';import {createStore} from '../server/store.js';import {createRuntime} from '../server/runtime/index.js';
async function fixture(fn){const home=await mkdtemp(path.join(os.tmpdir(),'apex-setup-'));try{const {store}=await createStore(home);await fn(store);}finally{await rm(home,{recursive:true,force:true});}}
test('cancelled setup saves no model and makes no catalog or inference calls',()=>fixture(async store=>{
 let calls=0;const result=await guidedSetup({store,project:()=>({path:'fixture'}),runtime:{listProviders:async()=>({ollama:{name:'Ollama',local:true,baseURL:'http://127.0.0.1:11434/v1'}}),listModels:async()=>{calls++;}},vault:{status:async()=>[]},question:async()=>'',print:()=>{}});
 assert.equal(result.cancelled,true);assert.equal(calls,0);assert.equal((await store.readSettings()).defaultModel,undefined);
}));
test('local guided setup saves Plan and zero-dollar ceiling without inference',()=>fixture(async store=>{
 const answers=['ollama','1'],confirm=[true,true,false];let selected,catalogs=0,inference=0;
 const result=await guidedSetup({store,project:()=>({path:'fixture'}),runtime:{listProviders:async()=>({ollama:{name:'Ollama',local:true,baseURL:'http://127.0.0.1:11434/v1'}}),listModels:async id=>{assert.equal(id,'ollama');catalogs++;return [{id:'ollama:fixture'}];},invalidateModels:()=>{}},vault:{status:async()=>[]},question:async()=>answers.shift(),confirm:async()=>confirm.shift(),select:v=>selected=v,chat:async()=>inference++,print:()=>{}});
 assert.equal(result.maxTurnUSD,0);assert.equal(catalogs,1);assert.equal(inference,0);assert.deepEqual(selected,{model:'ollama:fixture',mode:'plan'});assert.equal((await store.readSettings()).defaultMode,'plan');
}));
test('BYOK setup records explicit prices/cap; bounded Plan check is separately opt-in',()=>fixture(async store=>{
 const answers=['openai','fixture','.2','.8','.03'],confirm=[false,true,true];let inference=0;
 await guidedSetup({store,project:()=>({path:'fixture'}),runtime:{listProviders:async()=>({openai:{name:'OpenAI',keyEnv:'OPENAI_API_KEY',baseURL:'https://api.openai.com/v1'}}),invalidateModels:()=>{}},vault:{status:async()=>[{provider:'openai',saved:true}]},question:async()=>answers.shift(),confirm:async()=>confirm.shift(),select:()=>{},chat:async message=>{assert.match(message,/list_files only/);inference++;},print:()=>{}});
 const settings=await store.readSettings();assert.equal(settings.defaultModel,'openai:fixture');assert.equal(settings.maxTurnUSD,.03);assert.equal(settings.modelPrices['openai:fixture'].inputPerMillion,.2);assert.equal(inference,1);
}));
test('saved setup ceiling blocks the first paid send if its reservation would exceed it',()=>fixture(async store=>{
 const p=await store.createProject({name:'Fixture',path:path.join(store.home,'project')}),s=await store.createSession({projectId:p.id});await store.writeSettings({maxTurnUSD:0});let sends=0;const runtime=createRuntime({store,getCredential:async()=> 'fake-key-no-request',models:[{id:'openai:fixture',inputPrice:1e-7,outputPrice:1e-7}],fetch:async()=>{sends++;throw Error('must not send');}});
 try{const result=await runtime.chat({projectId:p.id,sessionId:s.id,model:'openai:fixture',message:'test',mode:'plan'});assert.match(result.error,/ceiling/);assert.equal(sends,0);}finally{await runtime.close();}
}));
