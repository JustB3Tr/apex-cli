import {randomUUID} from 'node:crypto';
// API keys are resolved per provider. No automatic credential sharing/fallback.
export const BUILTIN_PROVIDERS={
 apex:{name:'APEX sponsored allowance',baseURL:null,keyEnv:'APEX_ACCESS_TOKEN',completionLimit:'max_completion_tokens',sponsored:true},
 openrouter:{name:'OpenRouter',baseURL:'https://openrouter.ai/api/v1',keyEnv:'OPENROUTER_API_KEY'},
 openai:{name:'OpenAI API',baseURL:'https://api.openai.com/v1',keyEnv:'OPENAI_API_KEY',completionLimit:'max_completion_tokens'},
 anthropic:{name:'Anthropic API',baseURL:'https://api.anthropic.com/v1',keyEnv:'ANTHROPIC_API_KEY',protocol:'anthropic'},
 deepseek:{name:'DeepSeek',baseURL:'https://api.deepseek.com',keyEnv:'DEEPSEEK_API_KEY'},
 groq:{name:'Groq',baseURL:'https://api.groq.com/openai/v1',keyEnv:'GROQ_API_KEY'},
 together:{name:'Together AI',baseURL:'https://api.together.ai/v1',keyEnv:'TOGETHER_API_KEY'},
 fireworks:{name:'Fireworks AI',baseURL:'https://api.fireworks.ai/inference/v1',keyEnv:'FIREWORKS_API_KEY'},
 gemini:{name:'Google Gemini',baseURL:'https://generativelanguage.googleapis.com/v1beta/openai',keyEnv:'GEMINI_API_KEY'},
 mistral:{name:'Mistral',baseURL:'https://api.mistral.ai/v1',keyEnv:'MISTRAL_API_KEY'},
 xai:{name:'xAI',baseURL:'https://api.x.ai/v1',keyEnv:'XAI_API_KEY'},
 zen:{name:'OpenCode Zen / Console',baseURL:'https://opencode.ai/inference',keyEnv:'OPENCODE_API_KEY',catalogPath:'/v1/models',publicCatalog:true,protocol:'zen'},
 baidu:{name:'Baidu Qianfan',baseURL:'https://qianfan.baidubce.com/v2',keyEnv:'QIANFAN_API_KEY'},
 dashscope:{name:'Alibaba Cloud Model Studio',baseURL:null,keyEnv:'DASHSCOPE_API_KEY'},
 moonshot:{name:'Moonshot / Kimi',baseURL:'https://api.moonshot.ai/v1',keyEnv:'MOONSHOT_API_KEY'},
 zai:{name:'Z.AI / GLM',baseURL:'https://api.z.ai/api/paas/v4',keyEnv:'ZAI_API_KEY'},
 minimax:{name:'MiniMax',baseURL:'https://api.minimax.io/v1',keyEnv:'MINIMAX_API_KEY'},
 siliconflow:{name:'SiliconFlow',baseURL:'https://api.siliconflow.com/v1',keyEnv:'SILICONFLOW_API_KEY'},
 cerebras:{name:'Cerebras',baseURL:'https://api.cerebras.ai/v1',keyEnv:'CEREBRAS_API_KEY'},
 ollama:{name:'Ollama',baseURL:'http://127.0.0.1:11434/v1',local:true},
 lmstudio:{name:'LM Studio',baseURL:'http://127.0.0.1:1234/v1',local:true},
 llamacpp:{name:'llama.cpp server',baseURL:'http://127.0.0.1:8080/v1',local:true,keyEnv:'LLAMACPP_API_KEY',optionalKey:true},
 vllm:{name:'vLLM server',baseURL:'http://127.0.0.1:8000/v1',local:true,keyEnv:'VLLM_API_KEY',optionalKey:true}
};
export const providerKeyMap=providers=>Object.fromEntries(Object.entries(providers).filter(([,p])=>p.keyEnv).map(([id,p])=>[id,p.keyEnv]));
export function validateBaseURL(value){
 let url;try{url=new URL(value);}catch{throw Error('Provider URL must be an absolute HTTPS URL, or HTTP on loopback');}
 if(url.username||url.password||url.search||url.hash)throw Error('Provider URL cannot contain credentials, queries or fragments');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Remote providers require HTTPS; HTTP is allowed only on loopback');
 return url.href.replace(/\/+$/,'');
}
export function customProvider(id,baseURL,keyEnv,protocol='openai-compatible'){
 if(!/^[a-z][a-z0-9_-]{1,31}$/.test(id)||Object.hasOwn(BUILTIN_PROVIDERS,id)||['codex','claude','constructor','prototype'].includes(id))throw Error('Choose a unique lowercase provider ID (2-32 letters, digits, hyphens or underscores)');
 if(!/^[A-Z][A-Z0-9_]{1,79}$/.test(keyEnv))throw Error('Supply an environment variable NAME, not an API key');
 if(!['openai-compatible','anthropic','responses','google'].includes(protocol))throw Error('Protocol must be openai-compatible, anthropic, responses or google');
 return {name:id,baseURL:validateBaseURL(baseURL),keyEnv,protocol,custom:true};
}
export function providerCatalog(custom={},endpoints={}){
 const result=Object.fromEntries(Object.entries(BUILTIN_PROVIDERS).map(([id,value])=>[id,{protocol:'openai-compatible',...value}]));
 for(const [id,value] of Object.entries(custom))result[id]=customProvider(id,value.baseURL,value.keyEnv,value.protocol);
 for(const [id,value] of Object.entries(result)){
  const variable=id.toUpperCase()+'_BASE_URL',override=process.env[variable];
  const endpoint=override||endpoints[id];if(endpoint)value.baseURL=validateBaseURL(endpoint)+(id==='ollama'&&!/\/v1\/?$/.test(endpoint)?'/v1':'');
  if(value.local&&value.baseURL&&!['localhost','127.0.0.1','[::1]'].includes(new URL(value.baseURL).hostname))value.local=false;
 }
 return result;
}
export function modelPrice(value){
 if(!value||![value.inputPerMillion,value.outputPerMillion].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e6))throw Error('Supply finite nonnegative input/output USD per million tokens');
 return {inputPrice:value.inputPerMillion/1e6,outputPrice:value.outputPerMillion/1e6,priceSource:'operator configured estimate'};
}
export function providerHeaders(provider,key){
 const headers={'Content-Type':'application/json'};
 if(provider.protocol==='anthropic'){headers['anthropic-version']='2023-06-01';if(key)headers[provider.bearerAuth?'Authorization':'x-api-key']=provider.bearerAuth?'Bearer '+key:key;}
 else if(provider.protocol==='google'&&!provider.bearerAuth){if(key)headers['x-goog-api-key']=key;}
 else if(key)headers.Authorization='Bearer '+key;
 return headers;
}
export function resolveProvider(provider,model){
 if(!provider.baseURL)throw Error('Configure this account endpoint with /endpoint PROVIDER HTTPS_BASE_URL before connecting');
 if(provider.protocol!=='zen')return provider;
 const map={responses:['responses','/openai/v1'],messages:['anthropic','/anthropic/v1'],'generate-content':['google','/google/v1beta'],'chat-completions':['openai-compatible','/openai/v1']};
 const entry=Object.entries(map).find(([family])=>model?.api?.[family]);if(!entry)throw Error('Fetch /models zen and select a supported text/tool model');
 const [family,[protocol,suffix]]=entry,expected=provider.baseURL+suffix;
 if(validateBaseURL(model.api[family].base_url)!==expected)throw Error('OpenCode catalog endpoint does not match its configured provider origin/path');
 return {...provider,protocol,baseURL:expected,bearerAuth:true};
}
export function inferenceURL(provider,model){return provider.baseURL+(provider.protocol==='anthropic'?'/messages':provider.protocol==='responses'?'/responses':provider.protocol==='google'?'/models/'+encodeURIComponent(model)+':generateContent':'/chat/completions');}
export function zenPrices(model){
 const text=model.cost?.text;if(!text)return {inputPrice:null,outputPrice:null};
 const rates=side=>[side?.price,side?.cache?.write,...(side?.overrides||[]).flatMap(o=>[o.price,o.cache?.write])].filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
 const input=rates(text.input),output=rates(text.output);
 return {inputPrice:input.length?Math.max(...input)/1e6:null,outputPrice:output.length?Math.max(...output)/1e6:null,priceSource:'OpenCode catalog, maximum listed token tiers'};
}
export function requestPayload(provider,{model,messages,tools,maxTokens=4096,replayKey}){
 if(provider.protocol==='responses'){
  const input=[];
  for(const m of messages.filter(m=>m.role!=='system')){
   if(m.role==='tool'){input.push({type:'function_call_output',call_id:m.tool_call_id,output:m.content||''});continue;}
   if(m.providerState?.key===replayKey&&m.providerState.protocol==='responses'){input.push(...m.providerState.items);continue;}
   if(m.content)input.push({role:m.role,content:m.content});
   for(const c of m.tool_calls||[])input.push({type:'function_call',call_id:c.id,name:c.function.name,arguments:c.function.arguments});
  }
  return {model,instructions:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),input,tools:tools.map(t=>({type:'function',...t.function,strict:false})),max_output_tokens:maxTokens,store:false,stream:false};
 }
 if(provider.protocol==='google'){
  const contents=[],calls=new Map(messages.flatMap(m=>(m.tool_calls||[]).map(c=>[c.id,c])));
  for(const m of messages.filter(m=>m.role!=='system')){
   const role=m.role==='assistant'?'model':'user';let parts=[];
   if(m.role==='tool'){const c=calls.get(m.tool_call_id);parts=[{functionResponse:{name:c?.function.name||m.tool_call_id,...(c?.googleCallId?{id:c.googleCallId}:{}),response:{result:m.content||''}}}];}
   else if(m.providerState?.key===replayKey&&m.providerState.protocol==='google')parts=m.providerState.parts;
   else{if(m.content)parts.push({text:m.content});for(const c of m.tool_calls||[])parts.push({functionCall:{name:c.function.name,...(c.googleCallId?{id:c.googleCallId}:{}),args:JSON.parse(c.function.arguments||'{}')}});}
   if(!parts.length)continue;if(contents.at(-1)?.role===role)contents.at(-1).parts.push(...parts);else contents.push({role,parts:[...parts]});
  }
  return {systemInstruction:{parts:[{text:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n')}]},contents,tools:[{functionDeclarations:tools.map(t=>({name:t.function.name,description:t.function.description,parametersJsonSchema:t.function.parameters}))}],generationConfig:{maxOutputTokens:maxTokens}};
 }
 if(provider.protocol!=='anthropic')return {model,messages:messages.map(({providerState,...m})=>({...m,...(m.tool_calls?{tool_calls:m.tool_calls.map(({googleCallId,...c})=>c)}:{})})),tools,[provider.completionLimit||'max_tokens']:maxTokens,stream:false,...(provider.sponsored?{reasoning_effort:'none'}:{})};
 const converted=[];
 for(const message of messages.filter(m=>m.role!=='system')){
  let role=message.role,content=[];
  if(role==='tool'){role='user';content=[{type:'tool_result',tool_use_id:message.tool_call_id,content:message.content||''}];}
  else{
   if(message.content)content.push({type:'text',text:message.content});
   for(const call of message.tool_calls||[])content.push({type:'tool_use',id:call.id,name:call.function.name,input:JSON.parse(call.function.arguments||'{}')});
  }
  if(!content.length)continue;
  if(converted.at(-1)?.role===role)converted.at(-1).content.push(...content);else converted.push({role,content});
 }
 return {model,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),messages:converted,tools:tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters})),max_tokens:maxTokens,stream:false};
}
export function responsePayload(provider,data){
 if(provider.protocol==='responses'){
  if(data.error||!Array.isArray(data.output)||data.status&&data.status!=='completed')throw Error('Responses API did not complete successfully; no automatic retry');
  const items=data.output.filter(p=>['reasoning','message','function_call'].includes(p.type)),calls=items.filter(p=>p.type==='function_call').map(p=>({id:p.call_id,type:'function',function:{name:p.name,arguments:p.arguments}}));
  return {choices:[{message:{role:'assistant',content:items.filter(p=>p.type==='message').flatMap(p=>p.content||[]).filter(p=>p.type==='output_text').map(p=>p.text).join('\n'),...(calls.length?{tool_calls:calls}:{}),providerState:{protocol:'responses',items}}}],usage:{...data.usage,prompt_tokens:data.usage?.input_tokens??null,completion_tokens:data.usage?.output_tokens??null}};
 }
 if(provider.protocol==='google'){
  const parts=data.candidates?.[0]?.content?.parts;if(!Array.isArray(parts))throw Error('Gemini returned no message');
  const calls=parts.filter(p=>p.functionCall).map(p=>({id:p.functionCall.id||randomUUID(),googleCallId:p.functionCall.id||null,type:'function',function:{name:p.functionCall.name,arguments:JSON.stringify(p.functionCall.args||{})}}));
  const usage=data.usageMetadata||{};
  return {choices:[{message:{role:'assistant',content:parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('\n'),...(calls.length?{tool_calls:calls}:{}),providerState:{protocol:'google',parts}}}],usage:{...usage,prompt_tokens:usage.promptTokenCount??null,completion_tokens:typeof usage.candidatesTokenCount==='number'?usage.candidatesTokenCount+(usage.thoughtsTokenCount||0):null}};
 }
 if(provider.protocol!=='anthropic')return data;
 if(data.type!=='message'||!Array.isArray(data.content))throw Error('Anthropic returned no message');
 const calls=data.content.filter(p=>p.type==='tool_use').map(p=>({id:p.id,type:'function',function:{name:p.name,arguments:JSON.stringify(p.input)}}));
 const usage=data.usage||{},input=[usage.input_tokens,usage.cache_read_input_tokens,usage.cache_creation_input_tokens];
 return {choices:[{message:{role:'assistant',content:data.content.filter(p=>p.type==='text').map(p=>p.text).join('\n'),...(calls.length?{tool_calls:calls}:{})}}],usage:{...usage,prompt_tokens:typeof usage.input_tokens==='number'?input.reduce((n,v)=>n+(v||0),0):null,completion_tokens:usage.output_tokens??null}};
}
