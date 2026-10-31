export const tokenCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export const addTokens=(total,value)=>total===null||value===null||!Number.isSafeInteger(total+value)?null:total+value;
export function assistantReply(data){
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
