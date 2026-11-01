import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {document} from './document.js';
import {digest} from './safe-content.js';

const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
const reject=message=>{throw Error(message);};

// Stable JSON is deliberately strict. Omitted undefined values, special numeric
// values, custom prototypes and cycles must never widen an exact argument grant.
export function canonicalMcpJSON(value,{maxBytes=65536}={}){
 let nodes=0;const ancestors=new Set();
 function visit(item,depth){
  if(++nodes>10000||depth>40)reject('MCP JSON exceeds structural limit');
  if(item===null||typeof item==='boolean'||typeof item==='string')return JSON.stringify(item);
  if(typeof item==='number'){if(!Number.isFinite(item)||Object.is(item,-0))reject('MCP JSON requires finite ordinary numbers');return JSON.stringify(item);}
  if(typeof item!=='object'||ancestors.has(item))reject('MCP JSON must contain only acyclic JSON values');
  if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)reject('MCP JSON requires plain objects');
  ancestors.add(item);let result;
  if(Array.isArray(item)){if(Object.keys(item).length!==item.length)reject('MCP JSON arrays cannot contain holes or extra fields');result='['+item.map(v=>visit(v,depth+1)).join(',')+']';}
  else result='{'+Object.keys(item).sort().map(key=>JSON.stringify(key)+':'+visit(item[key],depth+1)).join(',')+'}';
  ancestors.delete(item);if(Buffer.byteLength(result)>maxBytes)reject('MCP JSON exceeds byte limit');return result;
 }
 const text=visit(value,0);if(Buffer.byteLength(text)>maxBytes)reject('MCP JSON exceeds byte limit');return text;
}
export function mcpArgumentsHash(args){if(!args||typeof args!=='object'||Array.isArray(args))reject('MCP arguments must be a JSON object');return digest(canonicalMcpJSON(args));}
export const mcpSchemaHash=schema=>{if(!schema||typeof schema!=='object'||Array.isArray(schema))reject('MCP input schema must be a JSON object');return digest(canonicalMcpJSON(schema,{maxBytes:131072}));};

function validate(state){
 if(state?.version!==1||!Array.isArray(state.grants)||state.grants.length>1000)reject('Invalid saved MCP permission document');
 for(const g of state.grants){if(!id(g.id)||!id(g.projectId)||!id(g.toolId)||!hash(g.identityHash)||!hash(g.schemaHash)||!hash(g.argsHash)||!Number.isSafeInteger(g.remainingUses)||g.remainingUses<0||g.remainingUses>10||!Number.isSafeInteger(g.maxUses)||g.maxUses<1||g.maxUses>10||g.remainingUses>g.maxUses||!Number.isFinite(Date.parse(g.createdAt))||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.parse(g.createdAt)||Date.parse(g.expiresAt)-Date.parse(g.createdAt)>3600000||g.confirmedBy!=='local_human_menu'||g.revokedAt!==null&&!Number.isFinite(Date.parse(g.revokedAt)))reject('Invalid saved MCP permission record');}
 return state;
}

export function mcpPermissions(store,{listTools,now=Date.now}={}){
 const doc=document(path.join(store.home,'mcp-permissions.json'),{version:1,grants:[]},validate);
 const active=g=>!g.revokedAt&&g.remainingUses>0&&Date.parse(g.expiresAt)>now();
 const matching=(g,key)=>g.projectId===key.projectId&&g.toolId===key.toolId&&g.identityHash===key.identityHash&&g.schemaHash===key.schemaHash&&g.argsHash===key.argsHash;
 function fingerprint({projectId,toolId,identityHash,inputSchema,args}){if(!id(projectId)||!id(toolId)||!hash(identityHash))reject('Exact project, advertised tool and identity hash required');return {projectId,toolId,identityHash,schemaHash:mcpSchemaHash(inputSchema),argsHash:mcpArgumentsHash(args)};}
 return {
  async list(projectId){if(!id(projectId))reject('Project required');return (await doc.read()).grants.filter(g=>g.projectId===projectId).map(g=>({...g,active:active(g),status:g.revokedAt?'revoked':g.remainingUses===0?'consumed':Date.parse(g.expiresAt)<=now()?'expired':'active'}));},
  async grant({projectId,toolId,args,expectedIdentityHash,expectedSchemaHash,ttlMinutes=15,uses=1,confirmedByHuman=false}={}){
   if(confirmedByHuman!==true||typeof listTools!=='function')reject('MCP grants require explicit local human menu confirmation and current advertised tools');
   if(!id(projectId)||!id(toolId)||!hash(expectedIdentityHash)||!hash(expectedSchemaHash)||!Number.isSafeInteger(ttlMinutes)||ttlMinutes<1||ttlMinutes>60||!Number.isSafeInteger(uses)||uses<1||uses>10)reject('Choose an exact reviewed project/tool identity/schema, 1-60 minutes and 1-10 uses');
   if(typeof store.getProject==='function')await store.getProject(projectId);
   const tools=await listTools(projectId),matches=Array.isArray(tools)?tools.filter(t=>t.id===toolId):[];if(matches.length!==1)reject('Choose one currently advertised MCP tool; no grant created');const tool=matches[0],key=fingerprint({projectId,toolId,identityHash:tool.identityHash,inputSchema:tool.inputSchema,args});if(key.identityHash!==expectedIdentityHash||key.schemaHash!==expectedSchemaHash)reject('MCP tool identity or schema changed during review; no grant created');const createdAt=new Date(now()).toISOString(),expiresAt=new Date(now()+ttlMinutes*60000).toISOString();
   return doc.mutate(state=>{
    if(state.grants.length>=1000)reject('MCP permission history is full; inspect saved metadata before adding more grants');
    // Reconfirming an identical scope replaces its live allowance rather than
    // stacking more uses behind the human's selected ten-use ceiling.
    for(const previous of state.grants)if(active(previous)&&matching(previous,key))previous.revokedAt=createdAt;
    const row={id:randomUUID(),...key,createdAt,expiresAt,maxUses:uses,remainingUses:uses,confirmedBy:'local_human_menu',revokedAt:null,lastUsedAt:null};state.grants.push(row);return {...row,active:true};
   });
  },
  async revoke({projectId,id:grantId}={}){if(!id(projectId)||!id(grantId))reject('Choose a project and grant ID');return doc.mutate(state=>{const row=state.grants.find(g=>g.projectId===projectId&&g.id===grantId);if(!row)reject('MCP grant not found in this project');row.revokedAt||=new Date(now()).toISOString();return {id:row.id,revoked:true};});},
  async consume({projectId,toolId,identityHash,inputSchema,args,mode}={}){
   if(mode!=='build')return {granted:false,reason:'plan_or_unknown_mode'};const key=fingerprint({projectId,toolId,identityHash,inputSchema,args});
   // Lock acquisition and decrement are shared across independent OS processes.
   // A failed/uncertain MCP call does not automatically refund or replay a use.
   if(!(await doc.read()).grants.some(g=>active(g)&&matching(g,key)))return {granted:false,reason:'no_exact_active_grant'};
   return doc.mutate(state=>{const row=state.grants.find(g=>active(g)&&matching(g,key));if(!row)return {granted:false,reason:'no_exact_active_grant'};row.remainingUses--;row.lastUsedAt=new Date(now()).toISOString();return {granted:true,grantId:row.id,remainingUses:row.remainingUses,expiresAt:row.expiresAt,scope:'exact_project_tool_identity_schema_arguments'};});
  },
  flush:()=>doc.flush()
 };
}
