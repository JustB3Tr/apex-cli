import {initRepo,saveRepo} from '../git-project.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../store.js';
import {createRuntime} from './index.js';
import {createMcpManager} from './mcp.js';
import {scopedPath,withinOwnership,assertOwnership} from './files.js';

const dir=await mkdtemp(path.join(tmpdir(),'relay-runtime-')),oldKey=process.env.OPENROUTER_API_KEY;
process.env.OPENROUTER_API_KEY='fixture-key-not-a-real-credential';
try{
 const workspace=path.join(dir,'workspace');await mkdir(workspace);await writeFile(path.join(workspace,'hello.txt'),'hello fixture');await writeFile(path.join(workspace,'.env'),'not available');await mkdir(path.join(workspace,'owned'));await mkdir(path.join(workspace,'other'));
 assert.equal(withinOwnership('owned/../../other',['owned']),false);
 await assert.rejects(()=>scopedPath(workspace,'../escape'));
 await assert.rejects(()=>scopedPath(workspace,'.env'));
 await assert.rejects(()=>assertOwnership(workspace,'owned/../other/a.txt',['owned']));
 let symlinkTests=false;
 try{await mkdir(path.join(workspace,'.secrets'));await writeFile(path.join(workspace,'.secrets','value.txt'),'fixture');await symlink(path.join(workspace,'.secrets'),path.join(workspace,'alias'),'junction');await symlink(path.join(workspace,'other'),path.join(workspace,'owned','link'),'junction');symlinkTests=true;}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
 if(symlinkTests){await assert.rejects(()=>scopedPath(workspace,'alias/value.txt'));await assert.rejects(()=>assertOwnership(workspace,'owned/link/a.txt',['owned']));}
 const {store}=await createStore(path.join(dir,'home'));const project=await store.createProject({name:'Fixture',path:workspace}),session=await store.createSession({projectId:project.id,title:'Test'});
 const events=[],requests=[];let n=0,rt;
 const fetchMock=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});const message=n++===0?{role:'assistant',content:'',tool_calls:[{id:'tool1',type:'function',function:{name:'read_file',arguments:'{"path":"hello.txt"}'}}]}:{role:'assistant',content:'Inspected hello fixture.'};return new Response(JSON.stringify({choices:[{message}],usage:{prompt_tokens:12,completion_tokens:8,cost:.0001}}));};
 rt=createRuntime({store,emit:e=>events.push(e),fetch:fetchMock,models:[{id:'openrouter:fixture',inputPrice:.0000001,outputPrice:.0000001}]});
 const result=await rt.chat({projectId:project.id,sessionId:session.id,message:'Read hello',model:'openrouter:fixture'});
 assert.equal(result.content,'Inspected hello fixture.');assert.equal(requests.length,2);assert(requests[1].body.messages.some(m=>m.role==='tool'&&m.content==='hello fixture'));assert.equal((await store.getSession(session.id)).messages.length,4);assert.equal((await store.getSession(session.id)).messages.filter(m=>m.usage).reduce((sum,m)=>sum+m.usage.cost,0),.0002);assert.equal(events.filter(e=>e.type==='usage').length,2);await rt.close();
 const denied=await store.createSession({projectId:project.id,title:'Denied'});n=0;
 let denyRuntime;denyRuntime=createRuntime({store,emit:e=>{if(e.type==='approval')queueMicrotask(()=>denyRuntime.approve({id:e.id,approved:false}));},models:[{id:'openrouter:fixture',inputPrice:.0000001,outputPrice:.0000001}],fetch:async(url,opts)=>{const req=JSON.parse(opts.body);if(n++===0)return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'deny',type:'function',function:{name:'write_file',arguments:'{"path":"denied.txt","content":"no"}'}}]}}]}));assert(req.messages.some(m=>m.role==='tool'&&m.content.includes('denied')));return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Denied action respected'}}]}));}});
 assert.equal((await denyRuntime.chat({projectId:project.id,sessionId:denied.id,message:'write',model:'openrouter:fixture'})).content,'Denied action respected');await assert.rejects(()=>readFile(path.join(workspace,'denied.txt')));await denyRuntime.close();
 await writeFile(path.join(workspace,'.gitignore'),'.env\n.secrets/\nalias\nowned/link\n.apex/\n');await initRepo(workspace);await saveRepo(workspace,'Fixture baseline');
 const teamSession=await store.createSession({projectId:project.id,title:'Team'});
 const teamRuntime=createRuntime({store,emit:()=>{},models:[{id:'ollama:fixture',inputPrice:null,outputPrice:null}],fetch:async()=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Assignment inspected; no changes claimed.'}}]}))});
 await assert.rejects(()=>teamRuntime.launchTeam({projectId:project.id,sessionId:teamSession.id,goal:'test',model:'ollama:fixture',agents:[{scope:'src'},{scope:'src/a'}]}));
 const team=await teamRuntime.launchTeam({projectId:project.id,sessionId:teamSession.id,goal:'Inspect shared assignments',model:'ollama:fixture',agents:[{name:'A',scope:'a'},{name:'B',scope:'b'}]});assert.equal(team.agents.length,2);assert(team.agents.every(a=>a.status==='review_pending'));assert((await readFile(path.join(workspace,'.apex','teams',team.teamId,'TASKS.md'),'utf8')).includes('Write scope: a'));await teamRuntime.close();
 const cancelled=await store.createSession({projectId:project.id,title:'Cancellation'});let entered;const requestStarted=new Promise(resolve=>entered=resolve);
 const cancelRuntime=createRuntime({store,models:[{id:'ollama:fixture',inputPrice:null,outputPrice:null}],fetch:async(url,opts)=>{entered();return new Promise((resolve,reject)=>{if(opts.signal.aborted)return reject(Error('Cancelled'));opts.signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});}});
 const running=cancelRuntime.chat({projectId:project.id,sessionId:cancelled.id,message:'test cancellation',model:'ollama:fixture'});await requestStarted;assert.equal((await cancelRuntime.cancel({sessionId:cancelled.id})).cancelled,1);assert.equal((await running).error,'Cancelled');await cancelRuntime.close();
 const manager=createMcpManager(path.join(dir,'mcp'));
 await assert.rejects(()=>manager.add({type:'stdio',command:'node',env:{TOKEN:'bad'}}));
 const fixture=path.join(dir,'mcp-fixture.mjs');
 const sdk=path.join(process.cwd(),'node_modules','@modelcontextprotocol','sdk','dist','esm').replaceAll('\\','/');
 await writeFile(fixture,`import {McpServer} from 'file:///${sdk}/server/mcp.js';import {StdioServerTransport} from 'file:///${sdk}/server/stdio.js';const server=new McpServer({name:'fixture',version:'1'});server.registerTool('echo',{description:'Local test echo',inputSchema:{}},async()=>({content:[{type:'text',text:'real MCP fixture'}]}));await server.connect(new StdioServerTransport());`);
 const config=await manager.add({name:'Local fixture',type:'stdio',command:process.execPath,args:[fixture]});assert.equal((await manager.list())[0].connected,false);
 const connection=await manager.connect(config.id);assert.equal(connection.tools[0].name,'echo');assert.equal((await manager.call(config.id,'echo',{})).content[0].text,'real MCP fixture');await manager.close();
 console.log(JSON.stringify({passed:true,checks:['mock model tool loop','durable messages and usage','approval denial','cancel in-flight request','parallel team shared tasks','overlap rejection','scope traversal','secret exclusion','actual local stdio MCP handshake/list/call','MCP secret config rejection'],symlinkTests,paidCalls:0}));
}finally{if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
