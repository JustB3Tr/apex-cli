// Free model selection is explicit, account-owned and never a paid fallback.
export const FREE_OPTIONS=[
 {provider:'local',access:'Ollama, llama.cpp, LM Studio or vLLM on loopback',cost:'No provider API charge; your hardware and electricity',privacy:'Context stays with your configured local server.'},
 {provider:'openrouter',access:'Live zero-price :free models with tool support',cost:'Own key; limited free requests; no paid fallback',docs:'https://openrouter.ai/docs/api_reference/limits',privacy:'Requests go to OpenRouter and the selected host. Check their data policies.'},
 {provider:'gemini',access:'Selected models on your own Free-tier project',cost:'Account-dependent; a billed project can charge',docs:'https://ai.google.dev/gemini-api/docs/pricing',privacy:'Google says Free-tier content may be used to improve products.'},
 {provider:'groq',access:'Your own Free-plan account and supported tool model',cost:'Account-dependent; verify your plan and model limits',docs:'https://console.groq.com/docs/rate-limits',privacy:'Review the provider data policy before sending private project context.'}
];
export function isCatalogFree(model){return model?.provider==='openrouter'&&model.id.endsWith(':free')&&model.catalogFree===true&&model.inputPrice===0&&model.outputPrice===0;}
export const supportedFreePlanModel=(provider,id)=>provider==='groq'||provider==='gemini'&&['gemini-2.5-flash','gemini-2.5-flash-lite'].includes(id.replace(/^gemini:/,''));
export function freeAccess({settings,model,configuration,pricing}){
 const policy=settings.freeAccess;if(!policy?.enabled)return null;
 if(configuration.local)return {inputPrice:0,outputPrice:0,priceSource:'local server; hardware costs excluded'};
 if(policy.model!==model||policy.endpoint!==configuration.baseURL)throw Error('Free-only mode blocks this model/endpoint. Select /free use MODEL, or explicitly /free off. No request sent.');
 if(isCatalogFree(pricing))return {inputPrice:0,outputPrice:0,priceSource:'live zero-price OpenRouter catalog'};
 if(['gemini','groq'].includes(pricing?.provider)&&supportedFreePlanModel(pricing.provider,model)&&policy.accountFreeConfirmed===true)return {inputPrice:0,outputPrice:0,priceSource:'user-confirmed free account plan; APEX cannot enforce provider billing tier'};
 throw Error('Free access could not be verified. No inference request sent; refresh /free models.');
}
