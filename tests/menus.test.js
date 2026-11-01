import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {TerminalUI} from '../cli/terminal.js';
import {popupSetup,modelMenu,effortMenu,mcpMenu} from '../cli/menus.js';
import {dashboardRows} from '../cli/dashboard.js';
import {effortControl} from '../server/runtime/effort.js';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-menu-'));try{const {store}=await createStore(root),project=await store.createProject({name:'Fixture',path:path.join(root,'project')});await fn({root,store,project});}finally{await rm(root,{recursive:true,force:true});}}

test('popup search, hidden fields, cancellation and overlay return preserve the composer',async()=>{
 const input=new PassThrough(),output=new PassThrough();output.columns=120;output.rows=38;input.setRawMode=()=>{};let screen='';output.on('data',b=>screen+=b);const ui=new TerminalUI(input,output);
 try{
  const main=ui.question('',{history:true});ui.key('unsent draft',{});
  const dialog=ui.dialog({title:'Provider',items:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]});
  ui.key('bet',{});assert.equal(ui.dialogItems().length,1);ui.key('',{name:'return'});assert.equal(await dialog,'b');assert.equal(ui.active.text,'unsent draft');
  const secret=ui.dialog({title:'Key',input:true,secret:true});ui.insertPaste('fixture-private-value');assert.ok(!screen.includes('fixture-private-value'));ui.key('',{name:'return'});assert.equal(await secret,'fixture-private-value');
  const back=ui.dialog({title:'Back',items:[]});ui.key('',{name:'escape'});assert.equal(await back,null);assert.equal(ui.active.text,'unsent draft');
  ui.key('',{name:'return'});assert.equal(await main,'unsent draft');assert.match(screen,/\x1b\[\?1049h/);assert.match(screen,/\x1b\[\?1049l/);
 }finally{ui.close();input.destroy();output.destroy();}
});

test('expanded dashboard responds to resize and SGR mouse clicks without leaking mouse input',async()=>{
 const input=new PassThrough(),output=new PassThrough();output.columns=120;output.rows=38;input.setRawMode=()=>{};let screen='';output.on('data',b=>screen+=b);const ui=new TerminalUI(input,output);
 try{
  ui.dashboard=[{text:'Usage fixture'},{text:'MCP fixture',id:'server-id'}];let selected;ui.on('mcp',id=>selected=id);
  const prompt=ui.question('',{history:true});ui.key('draft',{});ui.key('',{sequence:'\x1b[10;4R'});
  input.write('\x1b[<0;7;15M');await new Promise(r=>setImmediate(r));assert.equal(selected,'server-id');assert.equal(ui.active.text,'draft');assert.match(screen,/Usage fixture/);
  selected=null;input.write('\x1b[200~\x1b[<0;7;15Mfixture paste\x1b[201~');await new Promise(r=>setImmediate(r));assert.equal(selected,null);assert.match(ui.expanded(),/fixture paste/);
  output.columns=80;output.rows=24;output.emit('resize');assert.equal(ui.expandedLayout,false);assert.equal(ui.dashboardHits.length,0);assert.equal(ui.mouseEnabled,false);
  ui.cancelQuestion();await prompt;
 }finally{ui.close();input.destroy();output.destroy();}
});

test('guided popup offers existing/create/skip vault and saves short setup once completed',()=>fixture(async({store,project})=>{
 const existing=path.join(project.path,'existing-vault');await mkdir(existing);const answers=['existing',existing,true,true,'ollama','ollama:fixture',true,false,'read-only'];let permission;
 const ui={withOverlay:fn=>fn(),dialog:async options=>{assert.ok(options.title.length<100);return answers.shift();}};
 const result=await popupSetup({ui,store,project:()=>project,vault:{status:async()=>[]},runtime:{listProviders:async()=>({ollama:{local:true,baseURL:'http://localhost',name:'Ollama'}}),listModels:async id=>{assert.equal(id,'ollama');return [{id:'ollama:fixture',contextLength:128000}];}},setPermissions:async v=>permission=v,select:()=>{}});
 assert.equal(result.completed,true);assert.equal(permission,'read-only');assert.equal((await store.readSettings()).onboardingVersion,2);assert.equal((await store.readSettings()).modelMetadata['ollama:fixture'].contextLength,128000);assert.match(await readFile(path.join(existing,'Home.md'),'utf8'),/APEX project vault/);
 const cancelled=await popupSetup({ui:{withOverlay:fn=>fn(),dialog:async()=>null},store});assert.equal(cancelled.cancelled,true);
}));

test('provider model picker scopes catalog requests and preserves manual exact IDs',()=>fixture(async({store})=>{
 const answers=['local','qwen:custom'];const selected=await modelMenu({store,ui:{dialog:async()=>answers.shift()},vault:{status:async()=>[]},runtime:{listProviders:async()=>({local:{name:'Local',local:true,baseURL:'http://localhost'},other:{name:'Other',baseURL:'https://example.org'}}),listModels:async id=>{assert.equal(id,'local');return [];}}});
 assert.equal(selected.model,'local:qwen:custom');assert.equal(selected.local,true);
}));

test('effort menu persists effort and MCP credential menu keeps input hidden',()=>fixture(async({store,project})=>{
 await effortMenu({store,ui:{dialog:async()=> 'high'},print:()=>{}});assert.equal((await store.readSettings()).defaultEffort,'high');
 const answers=['auth','fixture-not-real'];let saved;
 await mcpMenu({store,project:()=>project,session:()=>({id:'session'}),mode:()=> 'build',ui:{withOverlay:fn=>fn(),dialog:async options=>{if(options.title.includes('hidden credential'))assert.equal(options.secret,true);return answers.shift();}},runtime:{listMcp:async()=>[{id:'server',name:'Fixture',type:'http',authEnv:'FIXTURE_KEY'}],setMcpAuth:async(id,values)=>saved={id,values}}},'server');
 assert.deepEqual(saved,{id:'server',values:{FIXTURE_KEY:'fixture-not-real'}});
}));

test('dashboard separates cumulative usage, latest context, estimates and unknown metadata',()=>{
 const rows=dashboardRows({model:'fixture:model',messages:[{usage:{model:'fixture:model',inputTokens:1000,outputTokens:100,cost:.01}}],settings:{modelMetadata:{'fixture:model':{contextLength:128000,inputPrice:1e-6,outputPrice:2e-6}},defaultEffort:'high'},mcps:[{id:'a',name:'Active',connected:true},{id:'b',name:'Inactive',enabled:true}]});
 assert.match(rows[0].text,/1,000 in \/ 100 out/);assert.match(rows[1].text,/1,100 \/ 128,000/);assert.match(rows[2].text,/estimate/);assert.match(rows[3].text,/rolling trim/);assert.equal(rows.filter(r=>r.id).length,2);
 assert.match(dashboardRows({model:'unknown'})[1].text,/unknown \/ unknown/);
});

test('effort uses native controls only for supported routes and never changes spending/output caps',()=>{
 assert.deepEqual(effortControl({provider:'openrouter',effort:'high',pricing:{supportedParameters:['reasoning']}}).payload,{reasoning:{effort:'high'}});
 assert.deepEqual(effortControl({provider:'custom',configuration:{protocol:'responses'},effort:'low'}).payload,{reasoning:{effort:'low'}});
 const fallback=effortControl({provider:'ollama',effort:'max'});assert.deepEqual(fallback.payload,{});assert.match(fallback.instruction,/spending limits/);assert.equal(fallback.native,'prompt guidance only');
 assert.throws(()=>effortControl({effort:'infinite'}),/Invalid effort/);
});

test('runtime applies effort in actual fixture payload and records catalog context trim threshold',()=>fixture(async({store,project})=>{
 const session=await store.createSession({projectId:project.id});await store.writeSettings({defaultEffort:'high'});let requests=0;
 const runtime=createRuntime({store,getCredential:async()=> 'fixture-key',models:[{id:'openrouter:fixture',inputPrice:0,outputPrice:0,contextLength:16000,supportedParameters:['reasoning']}],fetch:async(url,options)=>{requests++;const body=JSON.parse(options.body);assert.deepEqual(body.reasoning,{effort:'high'});assert.equal(body.max_tokens,4096);return Response.json({choices:[{message:{role:'assistant',content:'Fixture reply'}}],usage:{prompt_tokens:100,completion_tokens:10}});}});
 try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'openrouter:fixture',message:'Check this',mode:'plan'});assert.ok(!result.error,result.error);assert.equal(requests,1);const projection=(await store.records('events',{type:'context_projection'}))[0].data;assert.equal(projection.compactAtTokens,12800);assert.equal(projection.maxBytes,41216);assert.equal(projection.outputReservedTokens,4096);assert.equal(projection.toolHeadroomTokens,1600);const reply=(await store.getSession(session.id)).messages.at(-1);assert.equal(reply.usage.effort.level,'high');}finally{await runtime.close();}
}));
