import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {customProvider} from '../server/runtime/providers.js';
import {taskIntelligence,childEnvironment} from '../server/task-intelligence.js';
import {PlainTerminalUI} from '../cli/plain-terminal.js';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-boundary-'));try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Fixture',path:path.join(root,'code')}),session=await store.createSession({projectId:project.id});await store.writeSettings({vaultPreference:'disabled'});await fn({root,store,project,session});}finally{await rm(root,{recursive:true,force:true});}}
const tool=(name,args)=>({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'call',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
const done=()=>({choices:[{message:{role:'assistant',content:'Fixture complete'}}]});
const local=[{id:'ollama:fixture',inputPrice:0,outputPrice:0}];

test('shared ranged reads cannot use the private generated-team-board exception',()=>fixture(async({store,project,session})=>{
 const board='.apex/teams/00000000-0000-0000-0000-000000000000/TASKS.md';await mkdir(path.dirname(path.join(project.path,board)),{recursive:true});await writeFile(path.join(project.path,board),'PRIVATE_TEAM_GOAL');let sends=0,body;const runtime=createRuntime({store,models:local,fetch:async(u,o)=>{body=JSON.parse(o.body);return Response.json(++sends===1?tool('read_range',{path:board}):done());}});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',contextPolicy:'shared',mode:'plan',message:'Inspect only shared files'});assert.equal(result.error,undefined);assert.ok(!JSON.stringify(body).includes('PRIVATE_TEAM_GOAL'));assert.match(JSON.stringify(body),/excludes private paths/);}finally{await runtime.close();}
}));

test('generic recognizable secrets are scrubbed even when they are not this runtime’s configured key',()=>fixture(async({store,project,session})=>{
 const secret='sk-or-v1-'+'a'.repeat(64),runtime=createRuntime({store,models:local,fetch:async()=>Response.json({choices:[{message:{role:'assistant',content:'Do not print '+secret}}]})});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Inspect output'});assert.ok(!result.content.includes(secret));assert.ok(!JSON.stringify(await store.getSession(session.id)).includes(secret));assert.match(result.content,/REDACTED/);}finally{await runtime.close();}
}));

test('split generic tokens stay out of incremental previews and saved final text',()=>fixture(async({store,project,session})=>{
 const secret='sk-or-v1-'+'z'.repeat(180),events=[],encoder=new TextEncoder();const chunks=['visible '.repeat(40),secret.slice(0,30),secret.slice(30,95),secret.slice(95)+' ','tail '.repeat(50)];const runtime=createRuntime({store,models:local,emit:e=>events.push(e),fetch:async()=>new Response(new ReadableStream({start(controller){for(const text of chunks)controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:text},index:0}]})+'\n\n'));controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{},index:0,finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'content-type':'text/event-stream'}})});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Stream a fixture'});assert.equal(result.error,undefined);const output=JSON.stringify(events);assert.ok(!output.includes(secret));assert.ok(!events.filter(e=>e.partial).map(e=>e.text).join('').includes('z'.repeat(24)));assert.match(result.content,/REDACTED/);}finally{await runtime.close();}
}));

test('custom provider credential names and credential URLs are excluded from shell children',()=>fixture(async({store,project,session})=>{
 const saved=process.env.AI_ACCESS;process.env.AI_ACCESS='fixture-private-provider-value';await store.writeSettings({providers:{company:customProvider('company','https://fixture.invalid/v1','AI_ACCESS')}});let posts=0;let runtime;runtime=createRuntime({store,models:local,emit:e=>{if(e.type==='approval')queueMicrotask(()=>runtime.approve({id:e.id,approved:true}));},fetch:async()=>Response.json(++posts===1?tool('run_shell',{command:process.platform==='win32'?"if (Test-Path Env:AI_ACCESS) { exit 9 } else { Write-Output clean }":"test -z \"$AI_ACCESS\" && printf clean",reason:'Check sanitized fixture environment'}):done())});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Inspect child environment'});assert.equal(result.error,undefined);const event=(await store.records('events',{projectId:project.id,type:'tool_evidence'}))[0];assert.equal(event.data.result.exitCode,0);assert.match(event.data.result.stdout,/clean/);assert.deepEqual(childEnvironment({AI_ACCESS:'secret',DATABASE_URL:'postgres://u:p@host/db',CUSTOM_URL:'https://u:p@host',PATH:'safe'},{secretNames:['AI_ACCESS']}),{PATH:'safe'});}finally{await runtime.close();if(saved===undefined)delete process.env.AI_ACCESS;else process.env.AI_ACCESS=saved;}
}));

test('successful commands that also change source are not called current verified source',()=>fixture(async({store,project,session})=>{
 await writeFile(path.join(project.path,'source.txt'),'before');let posts=0,runtime;runtime=createRuntime({store,models:local,emit:e=>{if(e.type==='approval')queueMicrotask(()=>runtime.approve({id:e.id,approved:true}));},fetch:async()=>Response.json(++posts===1?tool('run_shell',{command:process.platform==='win32'?"Set-Content -LiteralPath source.txt -Value after; Write-Output passed":"printf after > source.txt; printf passed",reason:'Fixture changes source after a simulated check'}):done())});try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Check source'});const evidence=await taskIntelligence(store).evidence(project.id,result.jobId);assert.equal(evidence.checks[0].passed,true);assert.equal(evidence.checks[0].sourceUnchangedDuringCommand,false);assert.equal(evidence.checks[0].sourceCurrent,false);assert.match(evidence.statement,/stale/);}finally{await runtime.close();}
}));

test('plain terminal menus are escape-free, keep prompt state and refuse echoed secret entry',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',chunk=>text+=chunk);const ui=new PlainTerminalUI(input,output);try{ui.write('\x1b[31mSafe\x1b[0m');const answer=ui.dialog({title:'Select a mode',items:[{value:'plan',label:'Plan'},{value:'build',label:'Build'}]});input.write('2\n');assert.equal(await answer,'build');await assert.rejects(()=>ui.question('Token',{secret:true}),/Hidden credential/);const command=ui.question('',{history:true});input.write('!pwd\n');assert.equal(await command,'!pwd');assert.equal(ui.lastSubmission.pasted,true);assert.ok(!text.includes('\x1b'));}finally{ui.close();input.destroy();output.destroy();}
});
