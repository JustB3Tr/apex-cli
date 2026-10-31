// Observability only: never warms a cache or changes a paid retention policy.
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const first=(...values)=>values.map(count).find(v=>v!==null)??null;
function modernOpenAI(model){const name=model.slice(model.indexOf(':')+1).replace(/^openai\//,''),v=/^gpt-(\d+)(?:\.(\d+))?(?:[.-]|$)/.exec(name);return Boolean(v&&(Number(v[1])>5||Number(v[1])===5&&Number(v[2])>=6));}
export function cacheInputMultiplier(model,configuration){return modernOpenAI(model)&&(configuration.baseURL==='https://api.openai.com/v1'||model.startsWith('openrouter:openai/')&&configuration.baseURL==='https://openrouter.ai/api/v1')?1.25:1;}
export function cacheObservation({usage={},model,configuration,sentAt,observedAt=Date.now(),prefixHash,routeHash,request={}}){
 const readTokens=first(usage.prompt_tokens_details?.cached_tokens,usage.input_tokens_details?.cached_tokens,usage.cache_read_input_tokens,usage.prompt_cache_hit_tokens,usage.cachedContentTokenCount);
 const writeTokens=first(usage.prompt_tokens_details?.cache_write_tokens,usage.input_tokens_details?.cache_write_tokens,usage.cache_creation_input_tokens);
 const active=(readTokens??0)>0||(writeTokens??0)>0,windows=[];
 const window=(seconds,tokens,basis)=>windows.push({seconds,tokens,expiresAt:sentAt+seconds*1000,basis});
 if(configuration.protocol==='anthropic'&&active){
  const five=count(usage.cache_creation?.ephemeral_5m_input_tokens),hour=count(usage.cache_creation?.ephemeral_1h_input_tokens);
  if(five>0)window(300,five,'provider reported 5-minute write');if(hour>0)window(3600,hour,'provider reported 1-hour write');
  // A read does not identify which mixed-TTL segment was reused. Show the
  // documented minimum instead of restarting a speculative one-hour timer.
  if(configuration.baseURL==='https://api.anthropic.com/v1'&&(readTokens>0||writeTokens>0&&!windows.length))window(300,readTokens||writeTokens,'Claude documented minimum; exact read segment unknown');
 }
 const nativeOpenAI=configuration.baseURL==='https://api.openai.com/v1'&&['responses','openai-compatible'].includes(configuration.protocol),modern=modernOpenAI(model);
 if(nativeOpenAI&&modern&&active){const ttl=request.prompt_cache_options?.ttl;if(!ttl||ttl==='30m')window(1800,Math.max(readTokens||0,writeTokens||0),'OpenAI modern-model default minimum, matching prefix/routing required');else if(ttl==='12h'&&writeTokens>0)window(43200,writeTokens,'explicit 12-hour write');}
 return {version:1,model,routeHash,prefixHash,requestStartedAt:sentAt,observedAt,readTokens,writeTokens,reported:readTokens!==null||writeTokens!==null,windows,notice:'Last request evidence only. Next prefix, routing and eviction can change the hit. No keepalive requests.'};
}
export function cacheLabel(record,now=Date.now()){
 if(!record)return 'cache: not observed';if(!record.reported)return 'cache: unreported';
 const active=(record.readTokens??0)>0||(record.writeTokens??0)>0;if(!active)return 'cache: no hit/write reported';
 const windows=record.windows||[];if(!windows.length)return 'cache: hit/write; expiry unknown';
 const remaining=windows.map(w=>Math.max(0,Math.ceil((w.expiresAt-now)/1000)));
 const time=s=>s>=3600?Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m':Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 return remaining.some(Boolean)?'cache ~'+remaining.map(time).join('/'):'cache: estimated window elapsed';
}
export function latestCache(messages,model){return [...messages].reverse().find(m=>!m.agentId&&m.usage?.model===model&&m.usage.cache)?.usage.cache||null;}
