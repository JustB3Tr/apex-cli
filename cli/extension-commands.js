import {extensionManager} from '../server/extensions.js';import {mcpMarketplace,catalogRecipe} from '../server/mcp-catalog.js';
const split=s=>{const i=s.indexOf(' ');return i<0?[s,'']:[s.slice(0,i),s.slice(i+1).trim()];};
export const EXTENSION_HELP=`
MCP and plugin marketplaces:
 /mcp browse [QUERY]              Curated working integration recipes
 /mcp search QUERY                Search the live official MCP Registry
 /mcp inspect ID|REGISTRY_NAME     Publisher, version, permissions and setup
 /mcp install ID|REGISTRY_NAME     Inspect and confirm configuration, no auto-start
 /mcp enable|disable ID           Control an installed server
 /mcp auth ID                     Save declared credentials/env values at hidden prompts
 /mcp resources|prompts ID        Approved resource/prompt discovery
 /mcp read ID URI                 Approved resource read
 /mcp get-prompt ID NAME          Approved prompt retrieval
 /plugin marketplace add SOURCE   Local/Git marketplace; 'builtin' for APEX originals
 /plugin marketplace list|update NAME|remove NAME
 /plugin browse [QUERY]           Search registered plugin catalogs
 /plugin inspect NAME@MARKET      Review a frozen source snapshot
 /plugin install NAME@MARKET      Confirm install; MCP connections still need approval
 /plugin list|enable ID|disable ID|uninstall ID
 /skills                         Discover user, project and installed plugin workflows
 /skills show NAME               Read one skill
 /skills install FOLDER          Snapshot a local SKILL.md directory
 /skills enable|disable NAME      Control workflow availability
 /skill NAME [ARGUMENTS]          Invoke a selected workflow
 /PLUGIN:SKILL [ARGUMENTS]        Namespaced Claude-style invocation

Supports .claude-plugin manifests, skills/, commands/ and standard MCP configs.
Hooks, install scripts, LSPs and pre-approved tools never execute automatically.
`;
export function extensionCommands(c){const extensions=extensionManager(c.store.home),market=mcpMarketplace(c.store.home),print=v=>c.print((typeof v==='string'?v:JSON.stringify(v,null,2)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,''));const guard=()=>{if(c.mode()==='plan')throw Error('Switch to Build before changing extensions');};return async(name,rest)=>{const [action,arg]=split(rest),project=c.project();
 if(name==='/mcp'&&['browse','search','inspect','install','enable','disable','auth','resources','read','prompts','get-prompt'].includes(action)){
  if(action==='browse'){print(market.list(arg).map(e=>e.id+' · '+e.name+'\n  '+e.description).join('\n'));return true;}
  if(action==='search'){print(await market.search(arg));return true;}
  if(action==='inspect'){print(arg.includes('/')?await market.cached(arg):market.inspect(arg));return true;}
  if(action==='install'){guard();const entry=arg.includes('/')?await market.cached(arg):market.inspect(arg);if(!entry)throw Error('Search and inspect the registry entry first');const recipe=arg.includes('/')?await market.registryRecipe(arg,{home:c.store.home,project}):catalogRecipe(entry,{home:c.store.home,project});print({publisher:entry.publisher||entry.repository||entry.name,recipe,warning:'Configuration only. Connection may install/start third-party code or contact a service. Listing is not a safety endorsement.'});if(!await c.confirm('Install this MCP configuration?'))throw Error('MCP installation cancelled');print(await c.runtime.addMcp(recipe));return true;}
  guard();if(action==='enable'||action==='disable'){print(await c.runtime.setMcpEnabled(arg,action==='enable'));return true;}
  if(action==='auth'){const config=(await c.runtime.listMcp()).find(m=>m.id===arg);if(!config)throw Error('Unknown server');const values={};for(const key of [...new Set([...(config.envNames||[]),...(config.authEnv?[config.authEnv]:[])])]){const value=await c.secret(key+' (hidden; leave blank to keep):');if(value)values[key]=value;}print(await c.runtime.setMcpAuth(arg,values));return true;}
  const [id,more]=split(arg),[prompt,args]=split(more);print(await c.runtime.mcpAction({id,action,uri:more,name:prompt,args:args?JSON.parse(args):{},sessionId:c.session().id}));return true;
 }
 if(name==='/plugin'){
  if(action==='marketplace'){const [op,value]=split(arg);if(op==='list'||!op)print(await extensions.markets());else{guard();if(op==='add')print(await extensions.addMarket(value));else if(op==='update')print(await extensions.refreshMarket(value));else if(op==='remove')print(await extensions.removeMarket(value));else throw Error('Use marketplace add/list/update/remove');}return true;}
  if(action==='browse'||!action){if(!(await extensions.markets()).some(m=>m.id==='apex-official'))await extensions.addMarket('builtin');print(await extensions.search(arg));return true;}
  if(action==='list'){print(await extensions.list());return true;}
  if(action==='inspect'){const value=await extensions.inspect(arg,project);print({id:value.id,manifest:value.manifest,sourceCommit:value.commit,files:Object.keys(value.hashes).length,mcp:value.mcp,unsupported:value.unsupported,recipes:value.recipes,executedHooks:false});return true;}
  guard();if(action==='install'){const value=await extensions.inspect(arg,project);print({id:value.id,manifest:value.manifest,sourceCommit:value.commit,files:Object.keys(value.hashes).length,mcp:value.mcp,unsupported:value.unsupported,recipes:value.recipes});if(!await c.confirm('Install this frozen plugin snapshot? Unsupported components remain inert.'))throw Error('Plugin installation cancelled');print(await extensions.install(arg,project,value));}else if(action==='enable'||action==='disable'){print(await extensions.enable(arg,action==='enable',project));await c.runtime.syncMcp?.();}else if(action==='uninstall'){print(await extensions.uninstall(arg,project));await c.runtime.syncMcp?.();}else throw Error('Use /plugin browse, inspect, install, list, enable, disable or uninstall');return true;
 }
 if(name==='/skills'){if(!action){print((await extensions.skills(project)).map(s=>s.id+' · '+s.description+(s.explicitOnly?' · explicit invocation':' · model discoverable')).join('\n')||'No skills. /plugin browse or add a project .apex/skills/NAME/SKILL.md.');return true;}if(action==='show')print(await extensions.readSkill(project,arg,{explicit:true}));else{guard();if(action==='install')print(await extensions.installSkill(arg));else if(action==='enable'||action==='disable')print(await extensions.setSkillEnabled(arg,action==='enable'));else throw Error('Use /skills show/install/enable/disable');}return true;}
 if(name==='/skill'||name.startsWith('/')&&name.includes(':')){const id=name==='/skill'?action:name.slice(1),args=name==='/skill'?arg:rest;const skill=await extensions.readSkill(project,id,{explicit:true,args});if(!skill.userInvocable)throw Error('This skill is not user-invocable');await c.chat('Use the selected workflow '+id+' for this task: '+args,{workflow:{name:id,args}});return true;}
 return false;
 };}
