const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const unknownResult=id=>JSON.stringify({error:'apex_interrupted_tool_outcome_unknown',tool_call_id:id,notice:'No durable tool result was saved for this call. The action may already have run. Inspect the project, job timeline and billing evidence before proposing any repeat. This is a context-repair notice, not evidence of success or failure.'});
function validCalls(calls){
 if(!Array.isArray(calls)||!calls.length||calls.length>64)return false;const ids=new Set();
 for(const call of calls){if(!call||typeof call.id!=='string'||!call.id||call.id.length>256||ids.has(call.id)||typeof call.function?.name!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(call.function.name)||typeof call.function.arguments!=='string')return false;ids.add(call.id);try{const args=JSON.parse(call.function.arguments);if(!args||Array.isArray(args)||typeof args!=='object')return false;}catch{return false;}}
 return true;
}
function nativeCallsAgree(message){
 try{
 const state=message.providerState;if(!state)return true;if(state.protocol==='responses'&&!Array.isArray(state.items)||state.protocol==='google'&&!Array.isArray(state.parts))return false;
 const native=state.protocol==='responses'?(state.items||[]).filter(p=>p.type==='function_call').map(p=>p.call_id):state.protocol==='google'?(state.parts||[]).filter(p=>p.functionCall).map(p=>p.functionCall.id||null):[];
 const calls=message.tool_calls||[];return !native.length||native.length===calls.length&&native.every((id,i)=>id===null||id===(calls[i].googleCallId||calls[i].id));
 }catch{return false;}
}
export function repairHistory(input){
 const turns=[],turnReports=[],report={missingResults:0,orphanResults:0,invalidExchanges:0,leadingMessages:0};let current,currentReport;
 const note=key=>{report[key]++;if(currentReport)currentReport[key]++;};
 const rows=input.filter(m=>m&&['user','assistant','tool'].includes(m.role));
 for(let i=0;i<rows.length;i++){
  const source=rows[i];if(source.role==='user'){current=[];currentReport={missingResults:0,orphanResults:0,invalidExchanges:0,leadingMessages:0};turnReports.push(currentReport);turns.push(current);current.push({...source});continue;}
  if(!current){note('leadingMessages');continue;}
  if(source.role==='tool'){note('orphanResults');continue;}
  let message={...source};
  if(source.tool_calls!==undefined&&(!Array.isArray(source.tool_calls)||source.tool_calls.length>0&&!validCalls(source.tool_calls))||!nativeCallsAgree(source)){
   note('invalidExchanges');delete message.tool_calls;delete message.providerState;delete message.reasoning_content;
   message.content=(typeof source.content==='string'?source.content:'')+'\n[APEX omitted an invalid saved tool exchange from model context. Original records remain in history/timeline. No execution outcome is inferred; inspect evidence before repeating an action.]';current.push(message);continue;
  }
  current.push(message);if(!source.tool_calls?.length)continue;
  const results=new Map(),expected=new Set(source.tool_calls.map(c=>c.id));
  while(rows[i+1]?.role==='tool'){const result=rows[++i];if(expected.has(result.tool_call_id)&&!results.has(result.tool_call_id))results.set(result.tool_call_id,result);else note('orphanResults');}
  for(const call of source.tool_calls){const result=results.get(call.id);if(result)current.push({...result});else{note('missingResults');current.push({role:'tool',tool_call_id:call.id,content:unknownResult(call.id),contextRepair:true});}}
 }
 return {turns,turnReports,report};
}
function wire(message,model){return {role:message.role,content:typeof message.content==='string'?message.content:message.content==null?'':JSON.stringify(message.content),...(message.providerState?{providerState:message.providerState}:{}),...(typeof message.reasoning_content==='string'&&message.usage?.model===model?{reasoning_content:message.reasoning_content}:{}),...(message.tool_calls?{tool_calls:message.tool_calls}:{}),...(message.role==='tool'?{tool_call_id:message.tool_call_id}:{})};}
export function projectContext({history,current,system,tools,model,maxBytes=500000,maxMessages=40}){
 const mandatory=[{role:'system',content:system},...current],size=messages=>bytes({messages,tools});
 if(size(mandatory)>maxBytes)throw Error('Current turn exceeds the local context bound. Original history and tool evidence are saved; start a new chat with the necessary references. No request sent.');
 const selected=[];let count=0;
 for(let i=history.turns.length-1;i>=0;i--){const turn=history.turns[i].map(m=>wire(m,model));if(count+turn.length>maxMessages||size([mandatory[0],...turn,...selected.flat(),...current])>maxBytes)break;selected.unshift(turn);count+=turn.length;}
 const used=history.turnReports.slice(history.turns.length-selected.length),repairs=Object.fromEntries(Object.keys(history.report).map(key=>[key,used.reduce((n,r)=>n+r[key],0)]));
 const messages=[mandatory[0],...selected.flat(),...current],report={...repairs,sourceRepairs:history.report,sourceTurns:history.turns.length,includedTurns:selected.length,omittedTurns:history.turns.length-selected.length,includedMessages:count,currentMessages:current.length,contextBytes:size(messages),maxBytes,policy:'whole user turns; missing durable tool receipts are unknown; original transcript unchanged'};
 return {messages,report};
}
