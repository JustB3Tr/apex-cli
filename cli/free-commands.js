import {boundedJSON} from '../server/http-json.js';
import {FREE_OPTIONS,isCatalogFree,supportedFreePlanModel} from '../server/free-access.js';
import {providerHeaders} from '../server/runtime/providers.js';
export const FREE_HELP='\n /free                         Free access options and active policy\n /free models [PROVIDER]       Discover free OpenRouter models or own-key catalog\n /free use PROVIDER:MODEL      Select free-only access explicitly\n /free limits                 Check own OpenRouter free quota (no inference)\n /free off                    Allow ordinary BYOK model selection again\n /motion full|reduced|off      Terminal animation preference\n';
export function freeCommands(c){return async function(name,rest){
 if(name!=='/free')return false;const [action='',...args]=rest.split(/\s+/),value=args.join(' '),settings=await c.store.readSettings();
 if(!action||action==='status'){c.print(JSON.stringify({options:FREE_OPTIONS,policy:settings.freeAccess||{enabled:false},sponsorship:'Optional account service defaults to $0. APEX does not supply a shared provider key.'},null,2));return true;}
 if(action==='off'){await c.store.writeSettings({freeAccess:{enabled:false}});c.print('Free-only mode disabled. Your selected provider account controls billing.');return true;}
 if(action==='models'){const provider=value||'openrouter';if(!['openrouter','gemini','groq','ollama','llamacpp','lmstudio','vllm'].includes(provider))throw Error('Choose a provider listed by /free');const rows=await c.runtime.listModels(provider);c.print(rows.filter(m=>provider!=='openrouter'||isCatalogFree(m)).map(m=>m.id).join('\n')||'No eligible models discovered. Own-key providers require /login PROVIDER and an available model.');return true;}
 if(action==='limits'){const p=(await c.runtime.listProviders()).openrouter,key=await c.getCredential('openrouter');if(!key)throw Error('Use /login openrouter first');const response=await (c.fetch||fetch)(p.baseURL+'/key',{headers:providerHeaders(p,key),redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Quota lookup rejected: HTTP '+response.status);const {data={}}=await boundedJSON(response,{maxBytes:1048576});c.print(JSON.stringify({provider:'openrouter',checkedAt:new Date().toISOString(),freeTier:data.is_free_tier,freeRequests:data.free_model_daily_requests??null,rateLimit:data.rate_limit??null,note:'Missing quota fields mean unknown, not unlimited. No inference sent.'},null,2));return true;}
 if(action!=='use'||!value.includes(':'))throw Error(FREE_HELP);
 const provider=value.split(':')[0],configuration=(await c.runtime.listProviders())[provider];if(!configuration)throw Error('Unknown provider');
 const rows=await c.runtime.listModels(provider),model=rows.find(m=>m.id===value);if(!model)throw Error('Select an exact available model from /free models PROVIDER');
 let confirmed=false;if(!configuration.local&&!isCatalogFree(model)){
  if(!['gemini','groq'].includes(provider)||!supportedFreePlanModel(provider,value))throw Error('This model has no verified free-plan route in APEX. Gemini supports gemini-2.5-flash or gemini-2.5-flash-lite.');
  confirmed=await c.confirm('APEX cannot check or enforce this account billing tier. Confirm your own '+provider+' account/model is on its Free plan, without billed usage. '+(provider==='gemini'?'Free-tier content may be used to improve Google products. ':'' )+'Use this account?');
  if(!confirmed)throw Error('Free-plan selection cancelled');
 }
 await c.store.writeSettings({freeAccess:{enabled:true,model:value,endpoint:configuration.baseURL,accountFreeConfirmed:confirmed,selectedAt:new Date().toISOString()},defaultModel:value});c.selectModel(value);c.runtime.invalidateModels();c.print('Selected '+value+'. Free-only mode blocks other paid model routes. Quota errors stop the turn; no paid fallback.');return true;
};}
