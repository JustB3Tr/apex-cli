import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.js';import {createRuntime} from '../server/runtime/index.js';import {freeCommands} from '../cli/free-commands.js';import {freeAccess} from '../server/free-access.js';
test('free-only runtime checks live zero prices, refuses paid catalog changes and never falls back on 429',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-free-'));let runtime;try{
 const {store}=await createStore(path.join(root,'state')),p=await store.createProject({path:path.join(root,'work'),name:'Free fixture'}),s=await store.createSession({projectId:p.id});let outputPrice='0',sends=0,gets=0;
 await store.writeSettings({freeAccess:{enabled:true,model:'openrouter:fixture:free',endpoint:'https://openrouter.ai/api/v1'}});
 runtime=createRuntime({store,getCredential:async()=> 'fake-key-no-live-inference',fetch:async(url,options)=>{
  if(!options.method){gets++;return Response.json({data:[{id:'fixture:free',pricing:{prompt:'0',completion:outputPrice},architecture:{output_modalities:['text']},supported_parameters:['tools']},{id:'paid',pricing:{prompt:'.001',completion:'.001'},architecture:{output_modalities:['text']},supported_parameters:['tools']}]});}
  sends++;assert.equal(JSON.parse(options.body).model,'fixture:free');return Response.json({error:'rate limit'},{status:429});
 }});
 const args={projectId:p.id,sessionId:s.id,message:'Test',model:'openrouter:fixture:free'};const first=await runtime.chat(args);assert.match(first.error,/429.*Rate limit/);assert.equal(sends,1);assert.equal(gets,1);
 outputPrice='.001';assert.match((await runtime.chat(args)).error,/Free access could not be verified/);assert.equal(sends,1);
 assert.match((await runtime.chat({...args,model:'openrouter:paid'})).error,/Free-only mode blocks/);assert.equal(sends,1);
 await store.writeSettings({modelPrices:{'openrouter:fixture:free':{inputPerMillion:0,outputPerMillion:0}}});assert.match((await runtime.chat(args)).error,/Free access could not be verified/);assert.equal(sends,1);
 }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});
test('free selectors require account-plan confirmation and keep quota lookups credential-safe',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'apex-free-command-'));try{const {store}=await createStore(root);let selected,confirmed=false,output='';const commands=freeCommands({store,print:s=>output=s,selectModel:m=>selected=m,confirm:async()=>confirmed,getCredential:async()=> 'fake-secret',runtime:{listProviders:async()=>({gemini:{baseURL:'https://gemini.example/v1'},openrouter:{baseURL:'https://openrouter.example/v1'}}),listModels:async()=>[{id:'gemini:gemini-2.5-flash-lite',provider:'gemini'},{id:'gemini:paid-pro',provider:'gemini'}],invalidateModels(){}},fetch:async()=>Response.json({data:{label:'DO NOT PRINT',is_free_tier:true,free_model_daily_requests:{used:1,remaining:49}}})});
 await assert.rejects(()=>commands('/free','use gemini:gemini-2.5-flash-lite'),/cancelled/);assert.equal(selected,undefined);confirmed=true;await commands('/free','use gemini:gemini-2.5-flash-lite');assert.equal(selected,'gemini:gemini-2.5-flash-lite');await assert.rejects(()=>commands('/free','use gemini:paid-pro'),/no verified free-plan route/);
 const settings=await store.readSettings();assert.equal(freeAccess({settings,model:selected,configuration:{baseURL:'https://gemini.example/v1'},pricing:{provider:'gemini'}}).inputPrice,0);assert.throws(()=>freeAccess({settings,model:selected,configuration:{baseURL:'https://different.example/v1'},pricing:{provider:'gemini'}}),/blocks/);
 await commands('/free','limits');assert.ok(!output.includes('fake-secret'));assert.ok(!output.includes('DO NOT PRINT'));assert.match(output,/49/);await commands('/free','off');assert.equal((await store.readSettings()).freeAccess.enabled,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
