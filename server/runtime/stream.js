import {boundedJSON} from '../http-json.js';
import {responsePayload} from './providers.js';
import {assistantReply,completionDiagnostics,responseFailure} from './response.js';

const MAX_BYTES=4*1024*1024,MAX_EVENT_BYTES=256*1024,MAX_CALLS=64,MAX_ARGUMENT_BYTES=200000;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function invalid(reason){const error=new Error('Invalid model stream: '+reason+'; no automatic retry');error.code='APEX_STREAM_INVALID';error.category='protocol';return error;}
function index(value){if(!Number.isSafeInteger(value)||value<0||value>=MAX_CALLS)throw invalid('invalid content/tool index');return value;}
function append(target,key,value){if(value===undefined)return;if(typeof value!=='string')throw invalid('non-text '+key);target[key]=(target[key]||'')+value;if(Buffer.byteLength(target[key])>MAX_ARGUMENT_BYTES&&key==='arguments')throw invalid('tool arguments exceed limit');}
function argumentsObject(value){if(typeof value!=='string'||Buffer.byteLength(value)>MAX_ARGUMENT_BYTES)throw invalid('invalid tool arguments');let parsed;try{parsed=JSON.parse(value);}catch{throw invalid('incomplete or malformed tool arguments');}if(!object(parsed))throw invalid('tool arguments must be a JSON object');return parsed;}
function checked(data,provider){
 const completion=completionDiagnostics(provider,data);
 if(completion.status!=='complete')throw responseFailure(completion,{usage:data.usage||data.usageMetadata});
 const reply=assistantReply(responsePayload(provider,data));
 for(const call of reply.tool_calls||[])argumentsObject(call.function.arguments);
 return data;
}

// Parse SSE without assuming that TCP chunks align with lines, events, or UTF-8.
// No EventSource reconnect is used: a read failure may already have been billed.
async function consumeSSE(response,{signal,maxBytes,maxEventBytes,onEvent}){
 const reader=response.body?.getReader();if(!reader)throw invalid('missing response body');
 const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',data=[],event='',size=0,eventSize=0,eventCount=0,aborted=false;
 const abort=()=>{aborted=true;void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 const dispatch=async()=>{if(!data.length){event='';eventSize=0;return;}if(++eventCount>50000)throw invalid('too many events');const payload=data.join('\n'),name=event;data=[];event='';eventSize=0;await onEvent(name,payload);};
 const line=async value=>{
  if(value===''){await dispatch();return;}
  eventSize+=Buffer.byteLength(value)+1;if(eventSize>maxEventBytes)throw invalid('event exceeds byte limit');
  if(value.startsWith(':'))return;
  const colon=value.indexOf(':'),field=colon<0?value:value.slice(0,colon);let valueText=colon<0?'':value.slice(colon+1);if(valueText.startsWith(' '))valueText=valueText.slice(1);
  if(field==='data')data.push(valueText);else if(field==='event')event=valueText;
 };
 const lines=async final=>{
  while(true){const found=/\r\n|\r|\n/.exec(pending);if(!found)break;if(!final&&found[0]==='\r'&&found.index===pending.length-1)break;const value=pending.slice(0,found.index);pending=pending.slice(found.index+found[0].length);await line(value);}
  if(Buffer.byteLength(pending)+eventSize>maxEventBytes)throw invalid('event exceeds byte limit');
  if(final&&pending){await line(pending);pending='';}
 };
 try{
  if(signal?.aborted)abort();
  while(true){if(aborted)throw signal.reason||new Error('Cancelled');const {done,value}=await reader.read();if(aborted)throw signal.reason||new Error('Cancelled');if(done)break;size+=value.byteLength;if(size>maxBytes)throw invalid('response exceeds byte limit');pending+=decoder.decode(value,{stream:true});await lines(false);}
  pending+=decoder.decode();await lines(true);
  // An unterminated SSE event is evidence of an interrupted transport, not a
  // completed response. Even a JSON-looking partial event must not be executed.
  if(data.length)throw invalid('unterminated event');
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

function chatAdapter(text){
 let ended=false,finished=false,usage=null,id,model;const message={role:'assistant',content:''},calls=new Map();let finishReason=null;
 return {
  get usage(){return usage;},
  async event(name,data){
   if(data==='[DONE]'){ended=true;return;}
   if(ended)throw invalid('data after stream completion');
   const value=JSON.parse(data);if(value.error)throw responseFailure({status:'failed',reason:'provider_error'});
   if(value.usage!==undefined&&value.usage!==null){if(!object(value.usage))throw invalid('invalid usage');usage={...(usage||{}),...value.usage};}
   id=value.id||id;model=value.model||model;
   if(value.choices===undefined)return;if(!Array.isArray(value.choices))throw invalid('invalid choices');
   for(const choice of value.choices){
    if(choice.index!==undefined&&choice.index!==0)throw invalid('multiple completion choices are unsupported');
    const delta=choice.delta||{};if(!object(delta))throw invalid('invalid delta');
    if(finished&&(delta.content||delta.tool_calls?.length||delta.reasoning_content))throw invalid('content after finish reason');
    if(delta.role!==undefined&&delta.role!=='assistant')throw invalid('unexpected message role');
    if(delta.content!==undefined&&delta.content!==null){append(message,'content',delta.content);await text(delta.content);}
    if(delta.reasoning_content!==undefined)append(message,'reasoning_content',delta.reasoning_content);
    if(delta.refusal!==undefined&&delta.refusal!==null)append(message,'refusal',delta.refusal);
    if(delta.tool_calls!==undefined){
     if(!Array.isArray(delta.tool_calls))throw invalid('invalid tool call delta');
     for(const deltaCall of delta.tool_calls){const n=index(deltaCall.index);let call=calls.get(n);if(!call){call={id:'',type:'function',function:{name:'',arguments:''}};calls.set(n,call);}if(deltaCall.type!==undefined&&deltaCall.type!=='function')throw invalid('unsupported tool call type');append(call,'id',deltaCall.id);append(call.function,'name',deltaCall.function?.name);append(call.function,'arguments',deltaCall.function?.arguments);}
    }
    if(choice.finish_reason!==undefined&&choice.finish_reason!==null){finishReason=choice.finish_reason;finished=true;}
   }
  },
  finish(){if(!finished)throw invalid('connection ended without a finish reason');if(calls.size)message.tool_calls=[...calls].sort(([a],[b])=>a-b).map(([,call])=>call);return {id,model,choices:[{index:0,message,finish_reason:finishReason}],usage};}
 };
}

function responsesAdapter(text){
 let completed=null,usage=null,ended=false;const calls=new Map();
 const callFor=value=>{const key=value.item_id??value.output_index;if(key===undefined)throw invalid('missing response item ID');let call=calls.get(key);if(!call){call={arguments:'',done:false};calls.set(key,call);}return call;};
 return {
  get usage(){return usage;},
  async event(name,data){
   if(data==='[DONE]')return;
   const value=JSON.parse(data),type=value.type||name;if(ended)throw invalid('data after response completion');
   if(type==='error'||type==='response.failed')throw responseFailure({status:'failed',reason:'provider_error'},{usage:value.response?.usage});
   if(type==='response.incomplete'){const response=value.response||{};throw responseFailure(completionDiagnostics({protocol:'responses'},{...response,status:'incomplete'}),{usage:response.usage});}
   if(type==='response.output_text.delta'){if(typeof value.delta!=='string')throw invalid('invalid response text');await text(value.delta);}
   else if(type==='response.function_call_arguments.delta'){const call=callFor(value);if(call.done)throw invalid('arguments after completion');append(call,'arguments',value.delta);}
   else if(type==='response.function_call_arguments.done'){const call=callFor(value);if(typeof value.arguments!=='string')throw invalid('invalid completed arguments');if(call.arguments&&call.arguments!==value.arguments)throw invalid('tool arguments changed after streaming');call.arguments=value.arguments;call.done=true;argumentsObject(call.arguments);}
   else if(type==='response.completed'){completed=value.response;if(!object(completed)||completed.status!=='completed'||!Array.isArray(completed.output))throw invalid('missing completed response');usage=completed.usage??null;ended=true;}
  },
  finish(){if(!completed)throw invalid('connection ended before response.completed');for(const [key,call] of calls){const item=completed.output.find((item,n)=>item.id===key||n===key);if(!item||item.type!=='function_call'||item.arguments!==call.arguments)throw invalid('incomplete streamed function call');}return completed;}
 };
}

function anthropicAdapter(text){
 let message=null,stopped=false,usage=null,finished=false;const blocks=new Map();
 return {
  get usage(){return usage;},
  async event(name,data){
   const value=JSON.parse(data),type=value.type||name;if(type==='ping')return;if(stopped)throw invalid('data after message_stop');
   if(type==='error')throw responseFailure({status:'failed',reason:'provider_error'},{usage});
   if(type==='message_start'){if(message||!object(value.message)||value.message.type!=='message')throw invalid('invalid message_start');message={...value.message,content:[]};usage=value.message.usage??null;return;}
   if(!message)throw invalid('message event before message_start');
   if(type==='content_block_start'){
    const n=index(value.index);if(blocks.has(n)||!object(value.content_block))throw invalid('invalid content block');
    const block={...value.content_block};blocks.set(n,{block,closed:false,json:''});if(block.type==='text'){if(typeof block.text!=='string')throw invalid('invalid text block');await text(block.text);}return;
   }
   if(type==='content_block_delta'||type==='content_block_stop'){
    const state=blocks.get(index(value.index));if(!state||state.closed)throw invalid('delta for missing or closed content block');
    if(type==='content_block_stop'){if(state.block.type==='tool_use'&&state.json)state.block.input=argumentsObject(state.json);state.closed=true;return;}
    const delta=value.delta;if(!object(delta))throw invalid('invalid content delta');
    if(delta.type==='text_delta'&&state.block.type==='text'){append(state.block,'text',delta.text);await text(delta.text);}
    else if(delta.type==='input_json_delta'&&state.block.type==='tool_use'){if(typeof delta.partial_json!=='string')throw invalid('invalid input JSON delta');state.json+=delta.partial_json;if(Buffer.byteLength(state.json)>MAX_ARGUMENT_BYTES)throw invalid('tool arguments exceed limit');}
    else if(delta.type==='thinking_delta'&&state.block.type==='thinking')append(state.block,'thinking',delta.thinking);
    else if(delta.type==='signature_delta'&&state.block.type==='thinking')append(state.block,'signature',delta.signature);
    else if(delta.type!=='citations_delta')throw invalid('incompatible content delta');
    return;
   }
   if(type==='message_delta'){Object.assign(message,value.delta||{});if(value.delta?.stop_reason)finished=true;if(value.usage)usage={...(usage||{}),...value.usage};}
   else if(type==='message_stop')stopped=true;
  },
  finish(){if(!stopped||!finished)throw invalid('connection ended before message completion');if([...blocks.values()].some(s=>!s.closed))throw invalid('unclosed content block');message.content=[...blocks].sort(([a],[b])=>a-b).map(([,s])=>s.block);message.usage=usage;return message;}
 };
}

function googleAdapter(text){
 let usage=null,candidate=null,finished=false,promptFeedback;const parts=[],callIDs=new Map();
 return {
  get usage(){return usage;},
  async event(name,data){
   const value=JSON.parse(data);if(value.error)throw responseFailure({status:'failed',reason:'provider_error'});
   if(value.usageMetadata)usage={...(usage||{}),...value.usageMetadata};if(value.promptFeedback)promptFeedback=value.promptFeedback;
   if(promptFeedback?.blockReason)throw responseFailure({status:'refusal',reason:promptFeedback.blockReason},{usage});
   if(!value.candidates)return;if(!Array.isArray(value.candidates)||value.candidates.length>1)throw invalid('multiple Gemini candidates are unsupported');
   for(const item of value.candidates){
    if(item.index!==undefined&&item.index!==0)throw invalid('invalid Gemini candidate');candidate={...(candidate||{}),...item};
    for(const part of item.content?.parts||[]){
     if(finished)throw invalid('content after Gemini finish reason');
     if(part.functionCall){const call=part.functionCall;if(typeof call.name!=='string'||call.args!==undefined&&!object(call.args))throw invalid('incomplete Gemini function call');if(call.id){if(callIDs.has(call.id)){if(callIDs.get(call.id)!==JSON.stringify(part))throw invalid('Gemini function call changed after delivery');continue;}callIDs.set(call.id,JSON.stringify(part));}}
     if(Object.hasOwn(part,'text')){if(typeof part.text!=='string')throw invalid('invalid Gemini text');if(!part.thought)await text(part.text);}
     parts.push(part);
    }
    if(item.finishReason){candidate.finishReason=item.finishReason;finished=true;}
   }
  },
  finish(){if(!candidate||!finished)throw invalid('connection ended without Gemini finish reason');return {candidates:[{...candidate,content:{role:'model',parts}}],usageMetadata:usage,promptFeedback};}
 };
}

/** Returns provider-native final JSON. The caller still runs responsePayload.
 * Text callbacks are display-only. Failed/partial streams never yield a final
 * assistant message and must never cause an automatic paid-request replay.
 */
export async function readModelResponse(response,{provider={},onText,signal,maxBytes=MAX_BYTES,maxEventBytes=MAX_EVENT_BYTES}={}){
 if(typeof provider==='string')provider={protocol:provider};
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||!Number.isSafeInteger(maxEventBytes)||maxEventBytes<1||maxEventBytes>maxBytes)throw Error('Invalid model response byte limits');
 if(!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream'))return boundedJSON(response,{maxBytes});
 let partialText='',adapter;
 const text=async value=>{if(!value)return;partialText=(partialText+value).slice(0,16000);if(onText)await onText(value);};
 const protocol=provider.protocol||'openai-compatible';adapter=protocol==='responses'?responsesAdapter(text):protocol==='anthropic'?anthropicAdapter(text):protocol==='google'?googleAdapter(text):chatAdapter(text);
 try{await consumeSSE(response,{signal,maxBytes,maxEventBytes,onEvent:(name,data)=>adapter.event(name,data)});return checked(adapter.finish(),provider);}
 catch(cause){const known=typeof cause?.code==='string'&&cause.code.startsWith('APEX_'),error=known?cause:new Error(cause?.message||String(cause),{cause});if(!known){error.code=signal?.aborted?'APEX_STREAM_CANCELLED':cause instanceof SyntaxError?'APEX_STREAM_INVALID':'APEX_STREAM_INTERRUPTED';error.category=signal?.aborted?'cancelled':cause instanceof SyntaxError?'protocol':'transport';}error.partialText=partialText;error.usage??=adapter.usage;error.billingOutcome='unknown';throw error;}
}
