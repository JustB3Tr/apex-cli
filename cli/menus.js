import path from 'node:path';
import {stat} from 'node:fs/promises';
import {localVault} from '../server/vault.js';
import {modelPrice} from '../server/runtime/providers.js';
import {mcpMarketplace,catalogRecipe} from '../server/mcp-catalog.js';

const item=(value,label,description='')=>({value,label,description});
export const EFFORTS=['auto','low','medium','high','xhigh','max'];
const cancelled=()=>{throw Error('Menu cancelled');};
const field=async(ui,title,placeholder='',secret=false)=>{const value=await ui.dialog({title,input:true,placeholder,secret});return value===null?cancelled():value.trim();};
const yes=async(ui,title,description='')=>await ui.dialog({title,description,items:[item(false,'No'),item(true,'Yes')]})===true;

export async function modelMenu(c,{configure=false}={}){
 const {ui}=c,providers=await c.runtime.listProviders(),presence=await c.vault.status();
 const provider=await ui.dialog({title:'Choose provider',description:'Search providers. Selecting one loads its model catalog.',items:Object.entries(providers).map(([id,p])=>item(id,p.name||id,`${id} · ${p.local?'local':presence.some(k=>k.provider===id&&(k.saved||k.environment))?'key ready':'key needed'}`))});
 if(provider===null)return null;const config=providers[provider];
 if(!config.baseURL)throw Error('Set /endpoint '+provider+' HTTPS_URL first');
 if(config.keyEnv&&!config.optionalKey&&!presence.some(k=>k.provider===provider&&(k.saved||k.environment))&&configure){
  if(process.platform!=='win32')throw Error('Set '+config.keyEnv+' in your environment, then reopen setup');
  const key=await field(ui,'API key · '+provider,'',true);if(!key)return null;
  await c.vault.set(provider,key);c.runtime.invalidateModels();
 }
 const rows=await c.runtime.listModels(provider),choice=await ui.dialog({title:'Choose model · '+provider,description:'Search by name, or type an exact model ID. No inference.',allowCustom:true,items:rows.map(m=>item(m.id,m.id.slice(provider.length+1),m.contextLength?Math.round(m.contextLength/1000)+'k context':''))});
 if(choice===null)return null;
 const id=choice.startsWith(provider+':')?choice:provider+':'+choice;
 if(id.length>300||/\s|[\x00-\x1f]/.test(id)||id===provider+':')throw Error('Use an exact model ID');
 const row=rows.find(m=>m.id===id);let rates;
 if(configure&&!config.local){
  if([row?.inputPrice,row?.outputPrice].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))rates={inputPerMillion:row.inputPrice*1e6,outputPerMillion:row.outputPrice*1e6};
  else{const input=await field(ui,'Input price · USD per million tokens'),output=await field(ui,'Output price · USD per million tokens');if(!input||!output)throw Error('Enter both prices, including 0 only when explicitly free');rates={inputPerMillion:Number(input),outputPerMillion:Number(output)};modelPrice(rates);}
 }
 const settings=await c.store.readSettings(),metadata={...(row||{}),id,provider,local:config.local===true,observedAt:new Date().toISOString()};
 await c.store.writeSettings({modelMetadata:{...settings.modelMetadata,[id]:metadata},...(rates?{modelPrices:{...settings.modelPrices,[id]:{...rates,updatedAt:new Date().toISOString()}}}:{})});
 return {model:id,local:config.local===true,rates};
}

export async function popupSetup(c){
 const {ui}=c;
 return ui.withOverlay(async()=>{
  const vault=await ui.dialog({title:'Welcome to APEX',description:'1 / 3 · Project vault',items:[item('existing','Use an existing vault'),item('create','Create a new vault'),item('skip','Skip vault setup')]});
  if(vault===null)return {cancelled:true};
  if(vault==='skip')await c.store.writeSettings({vaultPreference:'disabled'});
  else{
   const folder=await field(ui,vault==='existing'?'Existing vault folder':'New vault folder',vault==='create'?path.join(c.project().path,'APEX-Vault'):'');
   if(!folder)throw Error('Choose a vault folder');const root=path.resolve(c.project().path,folder);
   if(vault==='existing'&&!(await stat(root)).isDirectory())throw Error('Vault folder must exist');
   await localVault(root).init();await c.store.updateProject(c.project().id,{vaultPath:root});await c.store.writeSettings({vaultPreference:'enabled'});
   await ui.dialog({title:'Vault ready',description:root,items:[item(true,'Continue')]});
  }
  let add=await yes(ui,'2 / 3 · Add a provider?','Your keys stay local. No model request.');
  while(add){
   const selected=await modelMenu(c,{configure:true});if(selected){
    let cap=selected.local?0:Number(await field(ui,'Per-turn spending ceiling · USD','0.10'));
    if(!Number.isFinite(cap)||cap<0||cap>1000)throw Error('Choose a finite ceiling from $0 to $1000');
    if(await yes(ui,'Save model?',selected.model+' · ceiling $'+cap.toFixed(4)+' / turn')){
     await c.store.writeSettings({defaultModel:selected.model,defaultMode:'plan',maxTurnUSD:cap,setupCompletedAt:new Date().toISOString()});c.select({model:selected.model,mode:'plan'});
    }
   }
   add=await yes(ui,'Add another provider?');
  }
  const permissions=await ui.dialog({title:'3 / 3 · Permissions',description:'Shells are not sandboxed. Change later with Ctrl+P.',items:[item('read-only','Plan · read-only','No model execution or edits'),item('ask','Build · ask','Approve model actions'),item('auto','Build · auto','Routine edits; other actions ask')]});
  if(permissions===null)return {cancelled:true};await c.setPermissions(permissions);
  await c.store.writeSettings({onboardingVersion:2,onboardingCompletedAt:new Date().toISOString()});
  return {completed:true};
 });
}

export async function effortMenu(c,value){
 const selected=value||await c.ui.dialog({title:'Reasoning effort',description:'Native control where supported; otherwise prompt guidance. Same spending cap.',items:EFFORTS.map(e=>item(e,e,e==='auto'?'Provider default':''))});
 if(selected===null)return;if(!EFFORTS.includes(selected))throw Error('Choose '+EFFORTS.join(', '));
 await c.store.writeSettings({defaultEffort:selected});c.print('Effort: '+selected);
}

export async function mcpMenu(c,id){
 return c.ui.withOverlay(async()=>{
  let rows=(await c.runtime.listMcp()).filter(r=>!r.projectId||r.projectId===c.project().id);
  if(!id)id=await c.ui.dialog({title:'MCP servers',description:'Active = connected. Inactive servers do not start here.',items:[...rows.map(r=>item(r.id,r.name,r.connected?'active':r.enabled===false?'disabled':'inactive')),item('browse','Add from marketplace')]});
  if(!id)return;if(id==='browse'){
   const market=mcpMarketplace(c.store.home),entries=market.list(''),selected=await c.ui.dialog({title:'MCP marketplace',description:'Configuration only. Connections require separate approval.',items:entries.map(e=>item(e.id,e.name,e.description))});
   if(!selected)return;if(c.mode()==='plan')throw Error('Switch to Build before installing MCP');
   const entry=market.inspect(selected),recipe=catalogRecipe(entry,{home:c.store.home,project:c.project()});
   if(await yes(c.ui,'Add MCP configuration?',entry.name+' · third-party code starts only after approval'))await c.runtime.addMcp(recipe);
   return;
  }
  const row=rows.find(r=>r.id===id);if(!row)return;
  const action=await c.ui.dialog({title:row.name,description:row.type+' · '+(row.connected?'active':row.enabled===false?'disabled':'inactive'),items:[item('inspect','View configuration'),item(row.enabled===false?'enable':'disable',row.enabled===false?'Enable':'Disable / disconnect'),item('connect','Connect','Approval required'),item('auth','Configure credentials','Hidden input'),item('remove','Remove configuration')]});
  if(!action)return;
  if(action==='inspect'){await c.ui.dialog({title:row.name,description:row.type==='http'?row.url:row.command+' '+(row.args||[]).join(' '),items:[item(true,'Back')]});return;}
  if(action==='remove'&&!await yes(c.ui,'Remove this MCP configuration?',row.name))return;
  if(c.mode()==='plan')throw Error('Switch to Build before changing or connecting MCP');
  if(action==='auth'){
   const values={};for(const key of [...new Set([...(row.envNames||[]),...(row.authEnv?[row.authEnv]:[])])]){const value=await field(c.ui,key+' · hidden credential','',true);if(value)values[key]=value;}
   await c.runtime.setMcpAuth(id,values);
  }else if(action==='enable'||action==='disable')await c.runtime.setMcpEnabled(id,action==='enable');
  else if(action==='connect')await c.runtime.connectMcp({id,sessionId:c.session().id});
  else if(action==='remove')await c.runtime.removeMcp(id);
 });
}
