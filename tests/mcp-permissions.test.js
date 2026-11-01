import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {digest} from '../server/safe-content.js';
import {mcpPermissions,canonicalMcpJSON,mcpArgumentsHash,mcpSchemaHash} from '../server/mcp-permissions.js';
import {mcpPolicyCommands} from '../cli/mcp-policy-commands.js';

const child=promisify(execFile),schema={type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false};
const advertised={id:'mcp_advertised_fixture',serverId:'server-fixture',serverName:'Fixture MCP',name:'read_item',inputSchema:schema,identityHash:digest('fixture-command-config-route')};
async function scratch(fn){const home=await mkdtemp(path.join(os.tmpdir(),'apex-mcp-policy-'));try{return await fn(home);}finally{await rm(home,{recursive:true,force:true});}}
const apiFor=(home,options={})=>mcpPermissions({home},{listTools:async()=>[advertised],...options});
const grant=(api,extra={})=>api.grant({projectId:'project-one',toolId:advertised.id,args:{path:'src/app.js'},expectedIdentityHash:advertised.identityHash,expectedSchemaHash:mcpSchemaHash(schema),confirmedByHuman:true,...extra});
const consume=(api,extra={})=>api.consume({projectId:'project-one',toolId:advertised.id,identityHash:advertised.identityHash,inputSchema:schema,args:{path:'src/app.js'},mode:'build',...extra});

test('canonical MCP arguments are order independent but strict about JSON values and structural limits',()=>{
 assert.equal(canonicalMcpJSON({b:[1,true,null],a:{z:'yes',x:2}}),canonicalMcpJSON({a:{x:2,z:'yes'},b:[1,true,null]}));assert.notEqual(mcpArgumentsHash({n:'1'}),mcpArgumentsHash({n:1}));assert.notEqual(mcpArgumentsHash({path:'a'}),mcpArgumentsHash({path:'A'}));
 for(const bad of [{n:Infinity},{n:NaN},{n:undefined},{n:-0},{date:new Date()},{fn:()=>{}},{n:1n}])assert.throws(()=>canonicalMcpJSON(bad));const cyclic={};cyclic.a=cyclic;assert.throws(()=>canonicalMcpJSON(cyclic),/acyclic/);assert.throws(()=>mcpArgumentsHash([]),/JSON object/);assert.throws(()=>canonicalMcpJSON({v:'x'.repeat(70000)}),/byte limit/);let deep={};for(let i=0;i<45;i++)deep={deep};assert.throws(()=>canonicalMcpJSON(deep),/structural/);
});

test('exact grants pin project, tool, server route/configuration, schema and canonical arguments',()=>scratch(async home=>{
 const api=apiFor(home),row=await grant(api,{uses:3});assert.equal(row.remainingUses,3);
 const mismatches=[{projectId:'project-two'},{toolId:'other-tool'},{identityHash:digest('new-route')},{inputSchema:{...schema,description:'schema changed'}},{args:{path:'src/other.js'}},{args:{path:'src/app.js',extra:true}},{mode:'plan'},{mode:'auto'}];
 for(const changed of mismatches)assert.equal((await consume(api,changed)).granted,false);assert.equal((await api.list('project-one'))[0].remainingUses,3);assert.equal((await consume(api)).granted,true);assert.equal((await consume(api)).remainingUses,1);assert.equal((await consume(api)).remainingUses,0);assert.equal((await consume(api)).granted,false);assert.equal((await api.list('project-one'))[0].status,'consumed');
}));

test('expiry, explicit revocation, bounds and changed advertised metadata fail closed',()=>scratch(async home=>{
 let clock=Date.now();const api=apiFor(home,{now:()=>clock});const row=await grant(api,{ttlMinutes:1});clock+=60001;assert.equal((await consume(api)).granted,false);assert.equal((await api.list('project-one'))[0].status,'expired');const second=await grant(api);await api.revoke({projectId:'project-one',id:second.id});assert.equal((await consume(api)).granted,false);await assert.rejects(()=>api.revoke({projectId:'other',id:row.id}),/not found/);
 for(const bad of [{uses:11},{uses:0},{uses:1.2},{ttlMinutes:61},{ttlMinutes:0},{confirmedByHuman:false},{expectedIdentityHash:digest('changed')},{expectedSchemaHash:digest('changed')}])await assert.rejects(()=>grant(api,bad));await assert.rejects(()=>grant(apiFor(home,{listTools:async()=>[]})),/advertised/);await assert.rejects(()=>grant(apiFor(home,{listTools:async()=>[advertised,advertised]})),/advertised/);await assert.rejects(()=>grant(mcpPermissions({home})),/human/);
}));

test('new identical allowance replaces the previous one instead of stacking uses',()=>scratch(async home=>{
 const api=apiFor(home),first=await grant(api,{uses:10}),second=await grant(api,{uses:1});const rows=await api.list('project-one');assert.equal(rows.find(r=>r.id===first.id).status,'revoked');assert.equal(rows.find(r=>r.id===second.id).remainingUses,1);assert.equal((await consume(api)).granted,true);assert.equal((await consume(api)).granted,false);
}));

test('permission records persist hashes and counts only, never argument or schema values',()=>scratch(async home=>{
 const api=apiFor(home),secret='fixture-api-secret-never-persist-817541',args={path:'src/app.js',secret};const row=await grant(api,{args});const raw=await readFile(path.join(home,'mcp-permissions.json'),'utf8');assert.ok(!raw.includes(secret));assert.ok(!raw.includes('src/app.js'));assert.ok(!raw.includes('properties'));assert.ok(!raw.includes('fixture-command-config-route'));assert.equal(row.argsHash,mcpArgumentsHash(args));assert.equal((await consume(api,{args})).granted,true);
}));

test('absent, expired or unrelated grants do not rewrite the permissions document',()=>scratch(async home=>{
 const api=apiFor(home);assert.equal((await consume(api)).granted,false);await assert.rejects(access(path.join(home,'mcp-permissions.json')));await grant(api);const file=path.join(home,'mcp-permissions.json'),before=await readFile(file),stamp=(await stat(file)).mtimeMs;assert.equal((await consume(api,{args:{path:'different'}})).granted,false);assert.deepEqual(await readFile(file),before);assert.equal((await stat(file)).mtimeMs,stamp);
}));

test('independent operating-system processes atomically consume no more than ten exact uses',()=>scratch(async home=>{
 const api=apiFor(home);await grant(api,{uses:10});const moduleURL=new URL('../server/mcp-permissions.js',import.meta.url).href,input={projectId:'project-one',toolId:advertised.id,identityHash:advertised.identityHash,inputSchema:schema,args:{path:'src/app.js'},mode:'build'};
 const source=`import {mcpPermissions} from ${JSON.stringify(moduleURL)};const api=mcpPermissions({home:process.argv[1]});let granted=0;for(let i=0;i<4;i++)if((await api.consume(${JSON.stringify(input)})).granted)granted++;process.stdout.write(JSON.stringify({granted}));`;
 const results=await Promise.all(Array.from({length:7},()=>child(process.execPath,['--input-type=module','-e',source,home],{windowsHide:true,maxBuffer:10000})));assert.equal(results.reduce((sum,r)=>sum+JSON.parse(r.stdout).granted,0),10);assert.equal((await api.list('project-one'))[0].remainingUses,0);
}));

test('corrupt permission storage throws and never grants a bypass',()=>scratch(async home=>{
 await writeFile(path.join(home,'mcp-permissions.json'),'{broken');await assert.rejects(()=>consume(apiFor(home)),/cannot be read/);await writeFile(path.join(home,'mcp-permissions.json'),JSON.stringify({version:1,grants:[{remainingUses:100}]}));await assert.rejects(()=>consume(apiFor(home)),/cannot be read/);
}));

test('CLI grant menu needs interactive human confirmation and supports list/revoke without argument history',()=>scratch(async home=>{
 const store={home},printed=[],base={store,runtime:{listMcpTools:async()=>[advertised]},project:()=>({id:'project-one',name:'Fixture'}),print:value=>printed.push(value)},without=mcpPolicyCommands(base);await assert.rejects(()=>without.command('/mcp-policy','menu'),/interactive/);assert.equal(await without.command('/other',''),false);assert.equal(await without.command('/mcp-policy','list'),true);
 const choices=['grant',advertised.id,5,3,true],questions=[],ui={dialog:async options=>{questions.push(options);return choices.shift();},question:async(label,options)=>{assert.equal(options.secret,true);return '{"path":"src/app.js","secret":"fixture-secret-menu"}';}},command=mcpPolicyCommands({...base,ui});await command.command('/mcp-policy','menu');const rows=await command.api.list('project-one');assert.equal(rows.length,1);assert.equal(rows[0].remainingUses,3);assert.ok(!JSON.stringify(printed).includes('fixture-secret-menu'));assert.ok(questions.some(q=>q.title==='Allow this exact MCP call?'));await command.command('/mcp-policy','revoke '+rows[0].id);assert.equal((await command.api.list('project-one'))[0].status,'revoked');
 const cancelled=mcpPolicyCommands({...base,ui:{dialog:async options=>options.title==='MCP permissions'?'grant':options.title==='Exact MCP tool'?advertised.id:options.title==='Grant lifetime'?5:options.title==='Maximum exact calls'?1:false,question:async()=>'{"path":"src/app.js"}'}});await cancelled.command('/mcp-policy','menu');assert.equal((await cancelled.api.list('project-one')).length,1);
}));

test('CLI refuses an MCP route change during review rather than approving its new configuration',()=>scratch(async home=>{
 let changed=false;const original=advertised,altered={...advertised,identityHash:digest('replacement-route')},choices=['grant',advertised.id,5,1,true],command=mcpPolicyCommands({store:{home},project:()=>({id:'project-one',name:'Fixture'}),print:()=>{},runtime:{listMcpTools:async()=>[changed?altered:original]},ui:{question:async()=>'{"path":"src/app.js"}',dialog:async options=>{if(options.title==='Allow this exact MCP call?')changed=true;return choices.shift();}}});await assert.rejects(()=>command.command('/mcp-policy','menu'),/changed during review/);await assert.rejects(access(path.join(home,'mcp-permissions.json')));
}));
