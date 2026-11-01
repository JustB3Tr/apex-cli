import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,access,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../server/store.js';
import {createRuntime} from '../server/runtime/index.js';
import {credentialVault} from '../cli/credentials.js';
import {nativeArguments,nativeExecutable} from '../cli/native.js';
import {parseArgs} from '../cli/main.js';
import {fileRead} from '../server/runtime/files.js';

test('Plan mode rejects adversarial writes, shell, delegation, memory and MCP before approval',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-plan-'));
 try{
  const {store}=await createStore(path.join(home,'state')),project=await store.createProject({name:'Plan fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id});let calls=0;const events=[];
  const tools=['write_file','run_shell','delegate_team','memory_save','mcp_connect','mcp_unknown','peer_message'];
  const runtime=createRuntime({store,models:[{id:'ollama:fixture'}],emit:e=>events.push(e),fetch:async(url,options)=>{
   const request=JSON.parse(options.body);assert.deepEqual(request.tools.map(t=>t.function.name).sort(),['ask_user','code_symbols','find_files','list_files','mcp_servers','project_conventions','project_instructions','project_map_query','read_file','read_range','search_text','team_status','vault_read','vault_search']);assert.match(request.messages[0].content,/PLAN MODE/);
   const message=calls++===0?{role:'assistant',content:'Trying blocked actions',tool_calls:tools.map((name,i)=>({id:'t'+i,type:'function',function:{name,arguments:JSON.stringify({path:'bad.txt',content:'bad',command:'exit 1',reason:'test',text:'bad',id:'bad',goal:'bad',agents:[]})}}))}:{role:'assistant',content:'Read-only plan.'};
   if(calls===2)assert.equal(request.messages.filter(m=>m.role==='tool'&&m.content.includes('Plan mode blocks')).length,7);
   return new Response(JSON.stringify({choices:[{message}]}));
  }});
  try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'ollama:fixture',message:'Plan only',mode:'plan'});assert.equal(result.content,'Read-only plan.');assert.equal(events.filter(e=>e.type==='approval').length,0);await assert.rejects(access(path.join(project.path,'bad.txt')));assert.equal((await store.listMemory(project.id)).length,0);assert.equal((await store.listAgents(project.id)).length,0);}finally{await runtime.close();}
 }finally{await rm(home,{recursive:true,force:true});}
});
test('saved-key lookup authenticates the request and redacts returned credentials from persisted messages',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-vault-runtime-')),previous=process.env.OPENROUTER_API_KEY;delete process.env.OPENROUTER_API_KEY;
 try{
  const {store}=await createStore(home),project=await store.createProject({name:'Fixture',path:path.join(home,'project')}),session=await store.createSession({projectId:project.id}),key='fixture-vault-key-not-real';
  const runtime=createRuntime({store,getCredential:async provider=>{assert.equal(provider,'openrouter');return key;},models:[{id:'openrouter:fixture',inputPrice:0,outputPrice:0}],fetch:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+key);return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Echo '+key}}]}));}});
  try{const result=await runtime.chat({projectId:project.id,sessionId:session.id,model:'openrouter:fixture',message:'test'});assert.ok(!result.content.includes(key));assert.ok(!(await readFile(path.join(home,'state.json'),'utf8')).includes(key));}finally{await runtime.close();}
 }finally{if(previous!==undefined)process.env.OPENROUTER_API_KEY=previous;await rm(home,{recursive:true,force:true});}
});
test('Windows DPAPI vault encrypts, reloads, updates and removes fake credentials',{skip:process.platform!=='win32'},async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'apex-dpapi-')),key='not-a-real-api-key-fixture-12345';
 try{const vault=credentialVault(home);await vault.set('openrouter',key);const disk=await readFile(path.join(home,'credentials.enc.json'),'utf8');assert.ok(!disk.includes(key));await assert.rejects(()=>fileRead(home,'credentials.enc.json'),/Sensitive/);assert.equal(await credentialVault(home).get('openrouter'),key);assert.equal((await vault.status()).find(s=>s.provider==='openrouter').saved,true);await vault.set('openrouter',key+'changed');assert.equal(await vault.get('openrouter'),key+'changed');await vault.remove('openrouter');assert.equal(await vault.get('openrouter'),null);await assert.rejects(()=>vault.set('wrong',key));}finally{await rm(home,{recursive:true,force:true});}
});
test('native login and mode arguments use official commands and literal prompts',()=>{
 assert.deepEqual(nativeArguments('codex',{login:true}),['login']);assert.deepEqual(nativeArguments('claude',{login:true}),['auth','login']);
 assert.deepEqual(nativeArguments('codex',{mode:'plan',prompt:'$(touch BAD)'}),['--sandbox','read-only','--','$(touch BAD)']);
 assert.deepEqual(nativeArguments('claude',{mode:'plan'}),['--permission-mode','plan','--tools','Read,Glob,Grep']);
 assert.equal(parseArgs(['--mode','plan']).mode,'plan');assert.throws(()=>parseArgs(['--mode','nonsense']),/Mode/);
});
