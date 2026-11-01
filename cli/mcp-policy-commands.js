import {mcpPermissions,canonicalMcpJSON,mcpArgumentsHash,mcpSchemaHash} from '../server/mcp-permissions.js';
import {scrub} from '../server/safe-content.js';

export const MCP_POLICY_HELP='\n /mcp-policy [menu|list|revoke GRANT_ID]\n Exact MCP tool + arguments only; Build mode, at most 60 minutes / 10 uses. Default per-call approval remains.\n';
const item=(value,label,description='')=>({value,label,description});
export function mcpPolicyCommands(c){
 const tools=projectId=>c.runtime.listMcpTools(projectId),api=mcpPermissions(c.store,{listTools:tools}),print=value=>c.print(typeof value==='string'?value:JSON.stringify(value,null,2));
 async function menu(){
  if(!c.ui?.dialog||!c.ui?.question)throw Error('Grant creation requires the local interactive MCP permission menu');
  const projectId=c.project().id,advertised=await tools(projectId),rows=await api.list(projectId);
  const action=await c.ui.dialog({title:'MCP permissions',description:'Grant one exact call temporarily. Default is approval for every call. Grants never enable tools in Plan mode.',items:[item('grant','Allow an exact advertised call'),item('list','Inspect this project’s grants'),...rows.filter(row=>row.active).map(row=>item('revoke:'+row.id,'Revoke '+row.toolId,row.remainingUses+' uses · expires '+row.expiresAt))]});
  if(!action)return;if(action==='list'){print(rows);return;}if(action.startsWith('revoke:')){print(await api.revoke({projectId,id:action.slice(7)}));return;}
  if(action!=='grant')throw Error('Choose an MCP permission action');if(!Array.isArray(advertised)||!advertised.length)throw Error('No connected advertised MCP tools. Connect a configured server through /mcp first.');
  const toolId=await c.ui.dialog({title:'Exact MCP tool',description:'Only currently advertised tools are eligible. Server route/configuration and input schema are pinned.',items:advertised.map(t=>item(t.id,scrub(String(t.serverName||t.serverId||'MCP'))+' / '+scrub(String(t.name||t.id)),t.id))});if(!toolId)return;const matches=advertised.filter(t=>t.id===toolId);if(matches.length!==1)throw Error('Ambiguous advertised MCP tool');const tool=matches[0];
  const raw=await c.ui.question('Exact arguments as a JSON object (hidden; values are never saved):',{secret:true,preserveWhitespace:true});if(raw===null||!String(raw).trim())return;if(Buffer.byteLength(raw)>16384)throw Error('Use at most 16KB of arguments in the review menu');let args;try{args=JSON.parse(raw);}catch{throw Error('Invalid JSON arguments; no grant created');}const canonical=canonicalMcpJSON(args),argsHash=mcpArgumentsHash(args),schemaHash=mcpSchemaHash(tool.inputSchema);
  const ttlMinutes=await c.ui.dialog({title:'Grant lifetime',items:[item(5,'5 minutes'),item(15,'15 minutes'),item(1,'1 minute'),item(60,'60 minutes maximum')]});if(!ttlMinutes)return;
  const uses=await c.ui.dialog({title:'Maximum exact calls',items:[item(1,'Once'),item(3,'3 calls'),item(10,'10 calls maximum')]});if(!uses)return;
  const confirmed=await c.ui.dialog({title:'Allow this exact MCP call?',description:`Project: ${scrub(c.project().name||projectId)}\nTool: ${scrub(String(tool.serverName||''))} / ${scrub(String(tool.name||toolId))}\nServer identity: ${tool.identityHash}\nSchema: ${schemaHash}\nArguments hash: ${argsHash}\n${uses} use(s), ${ttlMinutes} minutes. Build mode only.\nArguments preview (redacted, never saved):\n${scrub(canonical)}`,items:[item(false,'Cancel'),item(true,'Allow this exact scope')]});if(confirmed!==true)return;
  // Read advertised metadata again inside grant(). A changed configuration or
  // schema must not accidentally approve the newly advertised version instead.
  const current=(await tools(projectId)).filter(t=>t.id===toolId);if(current.length!==1||current[0].identityHash!==tool.identityHash||mcpSchemaHash(current[0].inputSchema)!==schemaHash)throw Error('MCP tool changed during review; reopen the menu');
  print(await api.grant({projectId,toolId,args,expectedIdentityHash:tool.identityHash,expectedSchemaHash:schemaHash,ttlMinutes,uses,confirmedByHuman:true}));
 }
 return {api,async command(name,rest=''){
  if(name!=='/mcp-policy')return false;const [action='',...parts]=rest.trim().split(/\s+/),projectId=c.project().id;if(action==='list'){print(await api.list(projectId));return true;}if(action==='revoke'){const grantId=parts.join(' ');if(!grantId)throw Error('Use /mcp-policy revoke GRANT_ID');print(await api.revoke({projectId,id:grantId}));return true;}if(action&&action!=='menu'){print(MCP_POLICY_HELP);return true;}await menu();return true;
 }};
}
