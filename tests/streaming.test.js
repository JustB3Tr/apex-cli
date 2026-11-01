import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {setImmediate as tick} from 'node:timers/promises';
import {readModelResponse} from '../server/runtime/stream.js';
import {requestPayload,responsePayload,inferenceURL} from '../server/runtime/providers.js';
import {assistantReply,completionDiagnostics} from '../server/runtime/response.js';

const frame=(value,name)=>`${name?'event: '+name+'\r\n':''}data: ${typeof value==='string'?value:JSON.stringify(value)}\r\n\r\n`;
const chat=(delta,finish_reason=null)=>({choices:[{index:0,delta,finish_reason}]});
async function fixture(work,run){
 let requests=0;const server=http.createServer(async(req,res)=>{requests++;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.flushHeaders();try{await work(res,req);}catch(error){res.destroy(error);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await run(`http://127.0.0.1:${server.address().port}`,()=>requests);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function send(res,frames,{split=false}={}){const body=Buffer.from(frames.join(''));if(split){for(let i=0;i<body.length;i+=3){if(res.destroyed)break;res.write(body.subarray(i,i+3));await tick();}}else res.write(body);res.end();}
const reply=(provider,native)=>assistantReply(responsePayload(provider,native));

test('real HTTP SSE emits UTF-8 text before completion, assembles parallel calls, and preserves final-only usage',async()=>{
 let streamed;const visible=new Promise(resolve=>streamed=resolve);let gate;const release=new Promise(resolve=>gate=resolve);
 await fixture(async res=>{await sendPrefix();await release;res.end(frame({choices:[],usage:{prompt_tokens:11,completion_tokens:9,cost:0}})+frame('[DONE]'));
  async function sendPrefix(){const data=Buffer.from(': keepalive\r\n\r\n'+frame(chat({role:'assistant',content:'Hi 🦊'}))+frame(chat({tool_calls:[{index:1,id:'b',type:'function',function:{name:'read_',arguments:'{"path":'}},{index:0,id:'a',type:'function',function:{name:'list_files',arguments:'{"path":"."}'}}]}))+frame(chat({tool_calls:[{index:1,function:{name:'file',arguments:'"x"}'}}]}))+frame(chat({},'tool_calls')));for(let i=0;i<data.length;i++){res.write(data.subarray(i,i+1));await tick();}}
 },async(url,count)=>{
  const result=readModelResponse(await fetch(url),{provider:{protocol:'openai-compatible'},onText:text=>{assert.equal(text,'Hi 🦊');streamed();}});
  await visible;gate();const native=await result,answer=reply({},native);assert.equal(answer.content,'Hi 🦊');assert.deepEqual(answer.tool_calls.map(c=>[c.id,c.function.name,JSON.parse(c.function.arguments)]),[['a','list_files',{path:'.'}],['b','read_file',{path:'x'}]]);assert.equal(native.usage.cost,0);assert.equal(native.usage.prompt_tokens,11);assert.equal(count(),1);
 });
});

test('unknown streamed usage remains null, while zero is a measured zero',async()=>{
 for(const usage of [undefined,{prompt_tokens:0,completion_tokens:0}])await fixture(res=>send(res,[frame(chat({content:'ok'})),frame(chat({},'stop')),...(usage?[frame({choices:[],usage})]:[]),frame('[DONE]')]),async url=>{const data=await readModelResponse(await fetch(url));assert.deepEqual(data.usage,usage??null);});
});

test('Responses SSE streams text, validates argument deltas, and preserves native replay items',async()=>{
 const provider={protocol:'responses'},output=[{type:'reasoning',id:'rs_1',summary:[],encrypted_content:'signed-state'},{type:'message',id:'m_1',role:'assistant',content:[{type:'output_text',text:'Inspecting.'}]},{type:'function_call',id:'fc_1',call_id:'c_1',name:'read_file',arguments:'{"path":"x"}'}],events=[{type:'response.created',response:{status:'in_progress'}},{type:'response.output_text.delta',delta:'Inspecting.'},{type:'response.output_item.added',output_index:2,item:{type:'function_call',id:'fc_1',call_id:'c_1',name:'read_file',arguments:''}},{type:'response.function_call_arguments.delta',item_id:'fc_1',output_index:2,delta:'{"path":'},{type:'response.function_call_arguments.delta',item_id:'fc_1',output_index:2,delta:'"x"}'},{type:'response.function_call_arguments.done',item_id:'fc_1',arguments:'{"path":"x"}'},{type:'response.completed',response:{id:'resp_1',status:'completed',output,usage:{input_tokens:8,output_tokens:7}}}];
 await fixture(res=>send(res,events.map(e=>frame(e,e.type)),{split:true}),async url=>{let visible='';const native=await readModelResponse(await fetch(url),{provider,onText:text=>visible+=text}),answer=reply(provider,native);assert.equal(visible,'Inspecting.');assert.equal(answer.tool_calls[0].id,'c_1');assert.deepEqual(answer.providerState.items,output);assert.equal(responsePayload(provider,native).usage.prompt_tokens,8);});
});

test('Anthropic SSE separates thinking from visible text and only assembles closed tool blocks',async()=>{
 const provider={protocol:'anthropic'},events=[{type:'message_start',message:{type:'message',role:'assistant',content:[],usage:{input_tokens:12,cache_read_input_tokens:4,output_tokens:1}}},{type:'ping'},{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'private thought'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed'}},{type:'content_block_stop',index:0},{type:'content_block_start',index:1,content_block:{type:'text',text:''}},{type:'content_block_delta',index:1,delta:{type:'text_delta',text:'Checking.'}},{type:'content_block_stop',index:1},{type:'content_block_start',index:2,content_block:{type:'tool_use',id:'tool_1',name:'read_file',input:{}}},{type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'{"path":'}},{type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'"x"}'}},{type:'content_block_stop',index:2},{type:'message_delta',delta:{stop_reason:'tool_use',stop_sequence:null},usage:{output_tokens:9}},{type:'message_stop'}];
 await fixture(res=>send(res,events.map(e=>frame(e,e.type)),{split:true}),async url=>{let visible='';const native=await readModelResponse(await fetch(url),{provider,onText:text=>visible+=text}),answer=reply(provider,native);assert.equal(visible,'Checking.');assert.equal(answer.content,'Checking.');assert.deepEqual(JSON.parse(answer.tool_calls[0].function.arguments),{path:'x'});assert.equal(responsePayload(provider,native).usage.prompt_tokens,16);assert.equal(native.usage.output_tokens,9);assert.equal(native.content[0].signature,'signed');});
});

test('Google SSE preserves thought signatures and native function arguments without exposing thoughts',async()=>{
 const provider={protocol:'google'},events=[{candidates:[{index:0,content:{parts:[{text:'not visible',thought:true}]}}]},{candidates:[{index:0,content:{parts:[{text:'Inspect.'},{functionCall:{id:'g_1',name:'read_file',args:{path:'x'}},thoughtSignature:'signature'}]},finishReason:'STOP'}]},{usageMetadata:{promptTokenCount:6,candidatesTokenCount:3,thoughtsTokenCount:2}}];
 await fixture(res=>send(res,events.map(e=>frame(e)),{split:true}),async url=>{let visible='';const native=await readModelResponse(await fetch(url),{provider,onText:text=>visible+=text}),answer=reply(provider,native);assert.equal(visible,'Inspect.');assert.equal(answer.tool_calls[0].id,'g_1');assert.equal(answer.providerState.parts.at(-1).thoughtSignature,'signature');assert.equal(responsePayload(provider,native).usage.completion_tokens,5);});
});

test('truncated, incomplete and refused completions do not yield executable assistant replies',async()=>{
 const cases=[{provider:{},events:[chat({content:'partial',tool_calls:[{index:0,id:'x',function:{name:'write_file',arguments:'{"path":'}}]}),chat({},'length')],category:'truncated'},{provider:{protocol:'responses'},events:[{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:5,output_tokens:9}}}],category:'truncated'},{provider:{protocol:'google'},events:[{candidates:[{content:{parts:[{text:'partial'}]},finishReason:'MAX_TOKENS'}]}],category:'truncated'},{provider:{},events:[chat({refusal:'denied'}),chat({},'stop')],category:'refusal'}];
 for(const item of cases)await fixture(res=>send(res,item.events.map(e=>frame(e))),async(url,count)=>{await assert.rejects(async()=>readModelResponse(await fetchResponse(url),{provider:item.provider}),error=>{assert.equal(error.category,item.category);assert.equal(error.billingOutcome,'unknown');return true;});assert.equal(count(),1);});
 async function fetchResponse(url){return fetch(url);}
});

test('valid-looking but unfinished tool arguments never become final calls',async()=>{
 await fixture(res=>send(res,[frame(chat({content:'attempt',tool_calls:[{index:0,id:'x',function:{name:'write_file',arguments:'{"path":'}}]})),frame(chat({},'tool_calls')),frame('[DONE]')]),async url=>{await assert.rejects(()=>readModelResponseResponse(url),error=>{assert.match(error.message,/malformed tool arguments/);assert.equal(error.partialText,'attempt');return true;});});
 async function readModelResponseResponse(url){return readModelResponse(await fetch(url));}
});

test('HTTP disconnect after a paid send keeps partial text only on an error, without replay',async()=>{
 let displayed;const seen=new Promise(resolve=>displayed=resolve);
 await fixture(async res=>{res.write(frame(chat({content:'incomplete evidence'})));await seen;res.destroy();},async(url,count)=>{let text='';await assert.rejects(async()=>readModelResponse(await fetch(url),{onText:value=>{text+=value;displayed();}}),error=>{assert.equal(error.billingOutcome,'unknown');assert.equal(error.partialText,'incomplete evidence');assert.equal(error.category,'transport');return true;});assert.equal(text,'incomplete evidence');assert.equal(count(),1);});
});

test('SSE byte/event bounds, malformed UTF-8, and unterminated events are enforced',async()=>{
 for(const [body,options,pattern] of [[frame(chat({content:'x'.repeat(500)})),{maxEventBytes:128},/byte limit/],[Buffer.from([100,97,116,97,58,32,0xff,10,10]),{},/encoded data|encoding/i],[frame(chat({content:'text'})).trimEnd(),{},/unterminated/],[frame(chat({content:'x'.repeat(500)})),{maxBytes:256,maxEventBytes:128},/byte limit/]])await fixture(res=>{res.end(body);},async url=>{await assert.rejects(async()=>readModelResponse(await fetch(url),options),pattern);});
});

test('cancellation interrupts a waiting stream and marks partial output as nonfinal',async()=>{
 const controller=new AbortController();await fixture(async res=>{res.write(frame(chat({content:'begun'})));},async url=>{await assert.rejects(async()=>readModelResponse(await fetch(url),{signal:controller.signal,onText:()=>controller.abort(new Error('user cancelled'))}),error=>{assert.equal(error.category,'cancelled');assert.equal(error.partialText,'begun');return true;});});
});

test('JSON fallback and stream opt-in retain backwards compatible defaults and require Google route approval',async()=>{
 const data={choices:[{message:{role:'assistant',content:'plain'}}]};assert.deepEqual(await readModelResponse(Response.json(data)),data);
 for(const protocol of ['openai-compatible','anthropic','responses']){const provider={protocol,baseURL:'https://example.com'},input={model:'fixture',messages:[{role:'user',content:'hi'}],tools:[]};assert.equal(requestPayload(provider,input).stream,false);assert.equal(requestPayload(provider,{...input,stream:true}).stream,true);}
 const provider={protocol:'google',baseURL:'https://example.com'},input={model:'fixture',messages:[],tools:[]};assert.equal(inferenceURL(provider,'fixture'),'https://example.com/models/fixture:generateContent');assert.throws(()=>requestPayload(provider,{...input,stream:true}),/explicitly configured/);assert.throws(()=>inferenceURL(provider,'fixture',{stream:true}),/explicitly configured/);assert.equal(inferenceURL({...provider,googleSSE:true},'fixture',{stream:true}),'https://example.com/models/fixture:streamGenerateContent?alt=sse');
});

test('diagnostics retain finish reasons and reject unsafe JSON completions before execution',()=>{
 for(const [provider,data,status] of [[{}, {choices:[{finish_reason:'length',message:{content:'partial'}}]},'truncated'],[{protocol:'anthropic'},{type:'message',content:[],stop_reason:'pause_turn'},'incomplete'],[{protocol:'google'},{promptFeedback:{blockReason:'SAFETY'}},'refusal'],[{protocol:'responses'},{status:'incomplete',output:[],incomplete_details:{reason:'max_output_tokens'}},'truncated']]){assert.equal(completionDiagnostics(provider,data).status,status);assert.throws(()=>reply(provider,data),error=>error.category===status);}
 assert.equal(completionDiagnostics({},{}).reason,'not_reported');assert.equal(reply({}, {choices:[{message:{content:'legacy fixture'}}]}).content,'legacy fixture');
});
