import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {resolveProvider,BUILTIN_PROVIDERS,zenPrices,customProvider,providerCatalog,requestPayload} from '../server/runtime/providers.js';

const families={'chat-completions':['openai/v1','/chat/completions'],messages:['anthropic/v1','/messages'],responses:['openai/v1','/responses'],'generate-content':['google/v1beta','/models/fixture:generateContent']};
for(const [family,[subpath,suffix]] of Object.entries(families))test(`OpenCode Zen ${family} tool loop, saved protocol state and billed cost`,async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-zen-')),old=process.env.OPENCODE_API_KEY;process.env.OPENCODE_API_KEY='fake-zen-key-not-real';let runtime;
 try{
  const {store}=await createStore(path.join(home,'state')),project=await store.createProject({name:'Zen fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});await writeFile(path.join(project.path,'fixture.txt'),'test');let n=0;
  const endpoint='https://opencode.ai/inference/'+subpath;
  runtime=createRuntime({store,models:[{id:'zen:fixture',inputPrice:1e-7,outputPrice:2e-7,api:{[family]:{base_url:endpoint}}}],fetch:async(url,options)=>{
   const body=JSON.parse(options.body);n++;assert.equal(url,endpoint+suffix);assert.equal(options.headers.Authorization,'Bearer fake-zen-key-not-real');
   if(family==='responses'){
    assert.equal(body.store,false);assert.equal(body.max_output_tokens,4096);assert.ok(body.tools.some(t=>t.name==='list_files'&&t.parameters));
    if(n===2){assert.ok(body.input.some(p=>p.type==='reasoning'&&p.encrypted_content==='opaque-test'));assert.ok(body.input.some(p=>p.type==='function_call_output'&&p.output.includes('fixture.txt')));}
    if(n===3)assert.ok(body.input.some(p=>p.type==='reasoning'&&p.encrypted_content==='opaque-test'));
    return Response.json({status:'completed',output:n===1?[{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque-test'},{type:'function_call',call_id:'t',name:'list_files',arguments:'{"path":"."}'}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Checked.'}]}],usage:{input_tokens:7,output_tokens:4,cost:.001}});
   }
   if(family==='messages'){
    assert.equal(options.headers['x-api-key'],undefined);
    if(n===2)assert.ok(body.messages.some(m=>m.content.some(p=>p.type==='tool_result'&&p.content.includes('fixture.txt'))));
    return Response.json({type:'message',content:n===1?[{type:'tool_use',id:'t',name:'list_files',input:{path:'.'}}]:[{type:'text',text:'Checked.'}],usage:{input_tokens:7,output_tokens:4,cost:.001}});
   }
   if(family==='generate-content'){
    assert.equal(body.model,undefined);assert.ok(body.tools[0].functionDeclarations[0].parametersJsonSchema);
    if(n>=2)assert.ok(body.contents.some(m=>m.parts.some(p=>p.thoughtSignature==='opaque-signature')));
    if(n===2)assert.ok(body.contents.some(m=>m.parts.some(p=>p.functionResponse?.response.result.includes('fixture.txt'))));
    return Response.json({candidates:[{content:{parts:n===1?[{functionCall:{id:'t',name:'list_files',args:{path:'.'}},thoughtSignature:'opaque-signature'}]:[{text:'Checked.'}]}}],usageMetadata:{promptTokenCount:7,candidatesTokenCount:4,cost:.001}});
   }
   if(n===2)assert.ok(body.messages.some(m=>m.role==='tool'&&m.content.includes('fixture.txt')));
   return Response.json({choices:[{message:n===1?{role:'assistant',content:'',tool_calls:[{id:'t',type:'function',function:{name:'list_files',arguments:'{"path":"."}'}}]}:{role:'assistant',content:'Checked.'}}],usage:{prompt_tokens:7,completion_tokens:4,cost:.001}});
  }});
  const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'zen:fixture',message:'Inspect project'});assert.equal(result.content,'Checked.');assert.equal(result.usage.cost,.002);assert.equal(n,2);
  await runtime.chat({projectId:project.id,sessionId:session.id,model:'zen:fixture',message:'Continue saved chat'});assert.equal(n,3);
 }finally{await runtime?.close();if(old===undefined)delete process.env.OPENCODE_API_KEY;else process.env.OPENCODE_API_KEY=old;await rm(home,{recursive:true,force:true});}
});
test('Zen endpoints stay on the configured origin/path and reserve highest listed price tiers',()=>{
 assert.throws(()=>resolveProvider(BUILTIN_PROVIDERS.zen,{api:{responses:{base_url:'https://evil.example/v1'}}}),/does not match/);
 assert.throws(()=>resolveProvider(BUILTIN_PROVIDERS.zen,{api:{systemone:{base_url:'https://opencode.ai/inference/systemone/v1'}}}),/supported text/);
 const rates=zenPrices({cost:{text:{input:{price:3,cache:{write:3.75},overrides:[{price:6,cache:{write:7.5}}]},output:{price:15,overrides:[{price:22.5}]}}}});assert.equal(rates.inputPrice,7.5e-6);assert.equal(rates.outputPrice,22.5e-6);
 assert.equal(customProvider('company','https://company.example/v1','COMPANY_KEY','responses').protocol,'responses');
 assert.equal(providerCatalog({}, {dashscope:'https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1'}).dashscope.baseURL,'https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1');
});
test('private replay state stays with its original provider/model',()=>{
 const message={role:'assistant',content:'Visible answer',providerState:{key:'original-provider/model',protocol:'responses',items:[{type:'reasoning',encrypted_content:'do-not-forward'}]}};
 const body=requestPayload({protocol:'responses'},{model:'different',messages:[message],tools:[],replayKey:'other-provider/model'});assert.ok(!JSON.stringify(body).includes('do-not-forward'));assert.match(JSON.stringify(body),/Visible answer/);
});
test('local llama.cpp works without a key and Zen byok estimates remain unknown actual cost',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-local-'));let runtime;
 try{
  const {store}=await createStore(path.join(home,'state')),project=await store.createProject({name:'Local fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});
  runtime=createRuntime({store,getCredential:async()=>null,models:[{id:'llamacpp:fixture'}],fetch:async(url,options)=>{assert.equal(options.headers.Authorization,undefined);return Response.json({choices:[{message:{role:'assistant',content:'Local fixture.'}}],usage:{cost:.25,opencode:{estimated:true},prompt_tokens:1,completion_tokens:1}});}});
  const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'llamacpp:fixture',message:'test'});assert.equal(result.content,'Local fixture.');assert.equal(result.usage.cost,null);
 }finally{await runtime?.close();await rm(home,{recursive:true,force:true});}
});
test('Zen discovery excludes restricted free/non-chat models while retaining native API routes',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-zen-discovery-'));let runtime;
 try{
  const {store}=await createStore(home);runtime=createRuntime({store,getCredential:async()=>null,fetch:async url=>{assert.equal(url,'https://opencode.ai/inference/v1/models');return Response.json({data:[{id:'paid',type:'chat',capabilities:{tools:{supported:true}},cost:{text:{input:{price:1},output:{price:2}}},api:{responses:{base_url:'https://opencode.ai/inference/openai/v1'}}},{id:'restricted-free',type:'chat',capabilities:{tools:{supported:true}},cost:{text:{input:{price:0},output:{price:0}}}},{id:'not-chat',type:'systemone'}]});}});
  const models=await runtime.listModels('zen');assert.deepEqual(models.map(m=>m.id),['zen:paid']);assert.equal(models[0].inputPrice,1e-6);assert.ok(models[0].api.responses);
 }finally{await runtime?.close();await rm(home,{recursive:true,force:true});}
});
