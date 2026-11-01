const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const count=v=>finite(v)?Math.round(v).toLocaleString('en-US'):'unknown';
export function dashboardRows({messages=[],model,settings={},projection,mcps=[]}={}){
 const calls=messages.filter(m=>!m.agentId&&m.usage&&!m.usage.inherited),usage=calls.map(m=>m.usage),last=usage.filter(u=>u.model===model).at(-1),meta=settings.modelMetadata?.[model]||{},prices=settings.modelPrices?.[model];
 const sum=key=>usage.length&&usage.every(u=>finite(u[key]))?usage.reduce((n,u)=>n+u[key],0):null;
 const context=last&&finite(last.inputTokens)?last.inputTokens+(finite(last.outputTokens)?last.outputTokens:0):null;
 const input=prices?.inputPerMillion??(finite(meta.inputPrice)?meta.inputPrice*1e6:null),output=prices?.outputPerMillion??(finite(meta.outputPrice)?meta.outputPrice*1e6:null),cost=sum('cost');
 const rows=[
  {text:`Usage · ${count(sum('inputTokens'))} in / ${count(sum('outputTokens'))} out · ${cost===null?'cost unknown':'reported $'+cost.toFixed(4)}`},
  {text:`Context · ${count(context)} / ${count(meta.contextLength)} tokens (last request + reply) · effort ${settings.defaultEffort||'auto'}${last?.effort?.control?.includes('prompt guidance')?' (prompt only)':''}`},
  {text:`Price · ${meta.local?'local, no provider charge assumed':finite(input)&&finite(output)?'$'+input.toFixed(3)+' in / $'+output.toFixed(3)+' out per 1M tokens (estimate)':'unknown · configure /pricing'}`},
  {text:`Auto-compact · ${projection?.compactAtTokens?'~'+count(projection.compactAtTokens)+' tokens (80% window) or ':''}${projection?.maxMessages||40} history msgs / ${count(projection?.maxBytes||500000)} bytes · rolling trim, originals saved`},
  {text:'MCP · click a server or F4 to configure'},
  ...mcps.slice(0,4).map(r=>({id:r.id,text:`  ${r.connected?'● active':r.enabled===false?'○ disabled':'○ inactive'} · ${r.name}`}))
 ];
 if(!mcps.length)rows.push({id:'browse',text:'  + Add MCP server'});if(mcps.length>4)rows.push({id:'',text:`  + ${mcps.length-4} more · F4 opens all servers`});
 return rows;
}
