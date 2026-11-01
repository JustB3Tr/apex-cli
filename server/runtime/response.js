export const tokenCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export const addTokens=(total,value)=>total===null||value===null||!Number.isSafeInteger(total+value)?null:total+value;
// Completion is separate from message shape. Valid JSON can still contain a
// truncated tool call, a refusal, or an incomplete provider response.
export function completionDiagnostics(provider={},data={}){
 const protocol=provider.protocol||'openai-compatible';let reason=null,status='complete';
 if(data.error)return {status:'failed',finishReason:null,reason:'provider_error'};
 if(protocol==='responses'){
  reason=data.incomplete_details?.reason||data.status||null;
  if(data.status==='incomplete')status=reason==='max_output_tokens'?'truncated':'incomplete';
  else if(data.status&&data.status!=='completed')status='incomplete';
  if(data.output?.some(p=>p.type==='message'&&p.content?.some(c=>c.type==='refusal')))status='refusal';
 }else if(protocol==='anthropic'){
  reason=data.stop_reason??null;
  if(reason==='max_tokens'||reason==='model_context_window_exceeded')status='truncated';
  else if(reason==='refusal')status='refusal';
  else if(reason&& !['end_turn','tool_use','stop_sequence'].includes(reason))status='incomplete';
 }else if(protocol==='google'){
  reason=data.candidates?.[0]?.finishReason??data.promptFeedback?.blockReason??null;
  if(reason==='MAX_TOKENS')status='truncated';
  else if(['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','IMAGE_SAFETY'].includes(reason)||data.promptFeedback?.blockReason)status='refusal';
  else if(reason&&reason!=='STOP')status='incomplete';
 }else{
  reason=data.choices?.[0]?.finish_reason??null;
  if(reason==='length')status='truncated';
  else if(reason==='content_filter'||data.choices?.[0]?.message?.refusal)status='refusal';
  else if(reason&&!['stop','tool_calls','function_call'].includes(reason))status='incomplete';
 }
 return {status,finishReason:reason,reason:reason||'not_reported'};
}
export function responseFailure(completion,{usage,partialText,cause}={}){
 const labels={truncated:'Model response was truncated',incomplete:'Model response did not complete',refusal:'Model response was refused or filtered',failed:'Provider returned an error'};
 const error=new Error((labels[completion.status]||'Model response failed')+` (${completion.reason||'unknown'}); no automatic retry`,cause?{cause}:undefined);
 error.code='APEX_RESPONSE_'+completion.status.toUpperCase();error.category=completion.status;error.completion=completion;
 if(usage!==undefined)error.usage=usage;
 if(partialText)error.partialText=partialText.slice(0,16000);
 return error;
}
export function assistantReply(data){
 if(data?.completion&&data.completion.status!=='complete')throw responseFailure(data.completion,{usage:data.usage,partialText:data.choices?.[0]?.message?.content});
 const reply=data?.choices?.[0]?.message;
 if(!reply||typeof reply!=='object'||Array.isArray(reply)||reply.role!==undefined&&reply.role!=='assistant'||reply.content!==undefined&&reply.content!==null&&typeof reply.content!=='string')throw Error('Provider returned an invalid assistant message');
 if(reply.tool_calls!==undefined){
  if(!Array.isArray(reply.tool_calls)||reply.tool_calls.length>64)throw Error('Provider returned invalid tool calls');
  const seen=new Set();
  for(const call of reply.tool_calls){
   if(!call||typeof call.id!=='string'||!call.id||call.id.length>256||seen.has(call.id)||call.type!==undefined&&call.type!=='function'||typeof call.function?.name!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(call.function.name)||typeof call.function.arguments!=='string'||Buffer.byteLength(call.function.arguments)>200000)throw Error('Provider returned an invalid tool call');
   seen.add(call.id);
  }
 }
 if(reply.reasoning_content!==undefined&&typeof reply.reasoning_content!=='string')throw Error('Provider returned invalid reasoning metadata');
 return {...reply,role:'assistant'};
}
