import {validateBaseURL} from './providers.js';
import {document} from '../document.js';
import {roomSecrets} from '../room-secrets.js';
import {scrub} from '../safe-content.js';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function createMcpManager(home) {
 const file=path.join(home,'mcp.json'),clients=new Map(),secretValues=new Set();
 const clean=value=>JSON.parse(JSON.stringify(value,(_key,v)=>{if(typeof v!=='string')return v;let text=scrub(v);for(const secret of secretValues)text=text.split(secret).join('[REDACTED]');return text;}));
 const doc=document(file,[],value=>{if(!Array.isArray(value))throw Error('Invalid MCP configuration');return value;}),secrets=roomSecrets(home);
 const safeCall=async fn=>{try{return clean(await fn());}catch(e){throw Error(clean(String(e.message||e.name)).slice(0,1000));}};
 const configs=()=>doc.read();
 const save=transform=>doc.mutate(rows=>{const next=transform(rows);rows.splice(0,rows.length,...next);return rows;});
 return {
  async list(){return (await configs()).map(c=>({...c,connected:clients.has(c.id)}));},
  async add(config){
   const type=config.type||config.transport||'stdio';if(!['stdio','http'].includes(type))throw Error('MCP type must be stdio or http');
   if(config.env||config.headers||config.apiKey||config.token)throw Error('Use environment variable names, never secret values in MCP configuration');
   const c={id:randomUUID(),name:String(config.name||'MCP server').slice(0,100),type,enabled:config.enabled!==false};if(config.projectId)c.projectId=String(config.projectId);if(config.cwd)c.cwd=path.resolve(config.cwd);if(config.source)c.source=JSON.parse(scrub(JSON.stringify(config.source)));if(config.ownerPlugin)c.ownerPlugin=String(config.ownerPlugin);
   if(type==='stdio'){if(typeof config.command!=='string'||!config.command.trim())throw Error('MCP command required');c.command=config.command;c.args=Array.isArray(config.args)?config.args.map(String):[];c.envNames=Array.isArray(config.envNames)?config.envNames.filter(x=>/^[A-Z_][A-Z0-9_]*$/.test(x)):[];if(c.args.some(x=>/(sk-[a-z0-9]|bearer\s|api[_-]?key=|token=)/i.test(x)))throw Error('Secrets are not allowed in process arguments');}
   else {validateBaseURL(config.url);const url=new URL(config.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use an HTTP MCP URL without embedded credentials/query');c.url=url.href;if(config.authEnv){if(!/^[A-Z_][A-Z0-9_]*$/.test(config.authEnv))throw Error('Invalid authEnv');c.authEnv=config.authEnv;}}
   await save(rows=>[...rows,c]);return c;
  },
  async setEnabled(id,enabled){if(!enabled){await clients.get(id)?.client.close();clients.delete(id);}await save(rows=>rows.map(c=>c.id===id?{...c,enabled:enabled===true}:c));return {id,enabled:enabled===true};},
  async setAuth(id,values){const c=(await configs()).find(c=>c.id===id);if(!c)throw Error('Unknown MCP server');const names=[...(c.envNames||[]),...(c.authEnv?[c.authEnv]:[])];if(Object.entries(values).some(([k,v])=>!names.includes(k)||typeof v!=='string'||v.length>8192))throw Error('Use declared environment names only');await secrets.set('mcp:'+id,{...(await secrets.get('mcp:'+id)||{}),...values});return {id,savedNames:Object.keys(values)};},
  async remove(id){await clients.get(id)?.client.close();clients.delete(id);await save(rows=>rows.filter(c=>c.id!==id));return {removed:id};},
  async connect(id){
   if(clients.has(id))return clients.get(id);
   const c=(await configs()).find(c=>c.id===id);if(!c)throw Error('Unknown MCP server');if(c.enabled===false)throw Error('MCP server is disabled');const stored=await secrets.get('mcp:'+id)||{};for(const key of [...(c.envNames||[]),...(c.authEnv?[c.authEnv]:[])]){const value=process.env[key]||stored[key];if(value?.length>=6&&(/KEY|TOKEN|SECRET|PASSWORD/i.test(key)||key===c.authEnv))secretValues.add(value);}
   const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
   const client=new Client({name:'apex-agent-cli',version:'0.6.0'},{capabilities:{}});let transport;
   if(c.type==='stdio'){
    const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
    const env={NODE_TLS_REJECT_UNAUTHORIZED:'1'};for(const n of ['PATH','Path','SystemRoot','TEMP','TMP',...c.envNames])if(process.env[n]||stored[n])env[n]=process.env[n]||stored[n];
    transport=new StdioClientTransport({command:c.command,args:c.args,env,cwd:c.cwd,stderr:'pipe'});
   }else{
    const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const headers={};if(c.authEnv){const key=process.env[c.authEnv]||stored[c.authEnv];if(!key)throw Error('Configure '+c.authEnv+' with /mcp auth '+id);headers.Authorization='Bearer '+key;}
    transport=new StreamableHTTPClientTransport(new URL(c.url),{requestInit:{headers}});
   }
   try {await client.connect(transport);transport.stderr?.on('data',()=>{});const result=await client.listTools();const item={client,config:c,tools:clean(result.tools||[])};clients.set(id,item);return item;}
   catch(e){await client.close().catch(()=>{});throw Error('MCP connection failed: '+clean(String(e.message||e.name)).slice(0,400));}
  },
  tools(projectId){return [...clients.values()].filter(item=>!projectId||!item.config.projectId||item.config.projectId===projectId).flatMap(item=>item.tools.map(t=>({serverId:item.config.id,serverName:item.config.name,...t})));},
  async call(id,name,args){const item=clients.get(id);if(!item)throw Error('Connect MCP server first');return safeCall(()=>item.client.callTool({name,arguments:args},undefined,{timeout:30000}));},
  async resources(id){const item=clients.get(id);if(!item)throw Error('Connect MCP first');return safeCall(()=>item.client.listResources());},
  async readResource(id,uri){const item=clients.get(id);if(!item)throw Error('Connect MCP first');return safeCall(()=>item.client.readResource({uri}));},
  async prompts(id){const item=clients.get(id);if(!item)throw Error('Connect MCP first');return safeCall(()=>item.client.listPrompts());},
  async getPrompt(id,name,args={}){const item=clients.get(id);if(!item)throw Error('Connect MCP first');return safeCall(()=>item.client.getPrompt({name,arguments:args}));},
  async sync(){const rows=await configs();for(const [id,item] of clients)if(!rows.some(c=>c.id===id&&c.enabled!==false)){await item.client.close();clients.delete(id);}},
  async close(){await Promise.allSettled([...clients.values()].map(x=>x.client.close()));clients.clear();}
 };
}
