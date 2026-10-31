import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRuntime} from '../server/runtime/index.js';
import {createStore} from '../server/store.js';
import {BUILTIN_PROVIDERS,customProvider,validateBaseURL,providerCatalog,modelPrice} from '../server/runtime/providers.js';

for(const [id,spec] of Object.entries(BUILTIN_PROVIDERS).filter(([id])=>id!=='zen'))test(`${id}: authenticated model/tool/result round-trip and honest unknown cost`,async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-provider-')),key='fixture-'+id+'-key-not-real',oldKey=spec.keyEnv?process.env[spec.keyEnv]:undefined,baseEnv=id.toUpperCase()+'_BASE_URL',oldBase=process.env[baseEnv];delete process.env[baseEnv];if(spec.keyEnv)process.env[spec.keyEnv]=key;
 let runtime;
 try{
  const {store}=await createStore(path.join(home,'state')),project=await store.createProject({name:'Fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});await writeFile(path.join(project.path,'fixture.txt'),'actual file');let requests=0;
  const baseURL=spec.baseURL||'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';if(!spec.baseURL)await store.writeSettings({providerEndpoints:{[id]:baseURL}});
  runtime=createRuntime({store,openrouterBaseURL:BUILTIN_PROVIDERS.openrouter.baseURL,models:[{id:id+':fixture',inputPrice:1e-7,outputPrice:2e-7}],fetch:async(url,options)=>{
   requests++;const body=JSON.parse(options.body);assert.equal(options.redirect,'error');assert.equal(body.model,'fixture');assert.equal(url,baseURL+(spec.protocol==='anthropic'?'/messages':'/chat/completions'));
   if(spec.protocol==='anthropic'){
    assert.equal(options.headers['x-api-key'],key);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['anthropic-version'],'2023-06-01');assert.ok(body.tools.some(t=>t.name==='list_files'&&t.input_schema));
    if(requests===2)assert.ok(body.messages.some(m=>m.role==='user'&&m.content.some(b=>b.type==='tool_result'&&b.content.includes('fixture.txt'))));
    return new Response(JSON.stringify({type:'message',role:'assistant',content:requests===1?[{type:'tool_use',id:'tool1',name:'list_files',input:{path:'.'}}]:[{type:'text',text:'Verified listing.'}],usage:{input_tokens:7,cache_read_input_tokens:3,output_tokens:4}}));
   }
   assert.equal(options.headers.Authorization,spec.keyEnv?'Bearer '+key:undefined);
   if(spec.completionLimit==='max_completion_tokens'){assert.equal(body.max_completion_tokens,4096);assert.equal(body.max_tokens,undefined);}else assert.equal(body.max_tokens,4096);
   if(requests===2)assert.ok(body.messages.some(m=>m.role==='tool'&&m.content.includes('fixture.txt')));
   if(id==='deepseek'&&requests===3)assert.ok(body.messages.some(m=>m.reasoning_content==='fixture-protocol-reasoning'));
   return new Response(JSON.stringify({choices:[{message:requests===1?{role:'assistant',content:'',...(id==='deepseek'?{reasoning_content:'fixture-protocol-reasoning'}:{}),tool_calls:[{id:'tool1',type:'function',function:{name:'list_files',arguments:'{"path":"."}'}}]}:{role:'assistant',content:'Verified listing.'}}],usage:{prompt_tokens:7,completion_tokens:4}}));
  }});
  const result=await runtime.chat({projectId:project.id,sessionId:session.id,message:'Inspect listing',model:id+':fixture'});assert.equal(result.content,'Verified listing.');assert.equal(requests,2);assert.equal(result.usage.cost,null);assert.equal(result.usage.inputTokens,id==='anthropic'?20:14);
  if(id==='deepseek'){await runtime.chat({projectId:project.id,sessionId:session.id,message:'Continue from saved history',model:id+':fixture'});assert.equal(requests,3);}
 }finally{await runtime?.close();if(spec.keyEnv){if(oldKey===undefined)delete process.env[spec.keyEnv];else process.env[spec.keyEnv]=oldKey;}if(oldBase===undefined)delete process.env[baseEnv];else process.env[baseEnv]=oldBase;await rm(home,{recursive:true,force:true});}
});
test('custom endpoints reject embedded credentials, unsafe transport, shadowing and fake prices',()=>{
 for(const url of ['http://remote.example/v1','https://key@example.com/v1','https://example.com/v1?api_key=x','file:///tmp/api'])assert.throws(()=>validateBaseURL(url));
 assert.equal(customProvider('company','http://127.0.0.1:9000/v1','COMPANY_API_KEY').baseURL,'http://127.0.0.1:9000/v1');
 assert.throws(()=>customProvider('openai','https://example.com','KEY'));assert.throws(()=>customProvider('custom','https://example.com','sk-secret-value'));
 assert.throws(()=>modelPrice({inputPerMillion:-1,outputPerMillion:1}));assert.throws(()=>modelPrice({inputPerMillion:Infinity,outputPerMillion:1}));
});
test('paid requests require prices, use updated operator rates, and never retry a rejection',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-pricing-')),previous=process.env.APEX_ALLOW_UNPRICED;delete process.env.APEX_ALLOW_UNPRICED;let runtime;
 try{
  const {store}=await createStore(path.join(home,'state')),project=await store.createProject({name:'Fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});let sends=0;
  const endpoint=customProvider('company','https://company.example/v1','COMPANY_FIXTURE_KEY');await store.writeSettings({providers:{company:endpoint}});
  runtime=createRuntime({store,getCredential:async()=> 'fake-key-no-inference',models:[],fetch:async()=>{sends++;return new Response('{}',{status:429});}});
  const first=await runtime.chat({projectId:project.id,sessionId:session.id,message:'test',model:'company:fixture'});assert.match(first.error,/Price unavailable/);assert.equal(sends,0);
  await store.writeSettings({modelPrices:{'company:fixture':{inputPerMillion:.1,outputPerMillion:.2}}});
  const second=await runtime.chat({projectId:project.id,sessionId:session.id,message:'test',model:'company:fixture'});assert.match(second.error,/429/);assert.equal(sends,1);
  assert.equal((await runtime.listModels('company'))[0].priceSource,'operator configured estimate');
 }finally{await runtime?.close();if(previous!==undefined)process.env.APEX_ALLOW_UNPRICED=previous;await rm(home,{recursive:true,force:true});}
});
