const byId=id=>document.getElementById(id),pair=byId('pair'),workspace=byId('workspace');
const storageKey='apex.remote.pending.v1',cards=new Map();
let csrf='',device=null,state=null,timer,refreshing=null,running=false,posting=false,lastMessages='',failures=0,stopped=false,pending=null;
const error=e=>{byId('error').textContent=e?.message||String(e||'');};
const recovery=document.createElement('section'),notice=document.createElement('p'),retry=document.createElement('button'),dismiss=document.createElement('button');
recovery.setAttribute('aria-label','Submission recovery');notice.setAttribute('role','status');retry.type=dismiss.type='button';retry.textContent='Retry this exact request ID';dismiss.textContent='Dismiss after checking host jobs';recovery.append(notice,retry,dismiss);byId('prompt').before(recovery);
function scope(){return state?[state.hostId,state.sessionId,device.id].join(':'):'';}
function readPending(){
 const raw=localStorage.getItem(storageKey);if(!raw)return null;
 const p=JSON.parse(raw);if(p.version!==1||typeof p.scope!=='string'||!/^[a-f0-9-]{36}$/.test(p.id)||typeof p.message!=='string'||p.message.length>100000||!['plan','build'].includes(p.mode))throw Error('Saved pending request is invalid. Inspect this browser storage and host jobs before clearing it.');return p;
}
function savePending(value){if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);pending=value;}
function controls(){
 byId('send').disabled=running||posting||Boolean(pending)||!device||device.role==='viewer';
 byId('text').disabled=byId('mode').disabled=!device||device.role==='viewer';byId('cancel').disabled=!device||device.role==='viewer';
 retry.hidden=!pending||pending.scope!==scope();retry.disabled=running||posting||device?.role!=='controller';dismiss.hidden=!pending;dismiss.disabled=posting;
 if(pending)notice.textContent='Unconfirmed request '+pending.id+'. Inspect host status before any retry. '+(pending.scope===scope()?'An explicit retry reuses its saved message, mode and ID.':'This belongs to an earlier host/session/device and cannot be replayed here.');
}
async function api(route,body){
 const response=await fetch('/api/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(csrf?{'x-apex-csrf':csrf}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 let result;try{const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32*1024*1024)throw Error('Response too large');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}catch{throw Error('Unreadable response; inspect host status. No request was replayed.');}
 if(!response.ok){const e=Error(result.error||'Request failed');e.status=response.status;throw e;}return result;
}
function renderApprovals(items){
 const root=byId('approvals'),active=new Set();
 for(const item of items.filter(a=>a.status==='pending')){
  active.add(item.id);let card=cards.get(item.id);
  if(!card){card=document.createElement('article');const title=document.createElement('b'),args=document.createElement('pre');card.append(title,args);card.titleNode=title;card.argsNode=args;cards.set(item.id,card);root.append(card);}
  card.titleNode.textContent='Approval: '+item.tool;card.argsNode.textContent=JSON.stringify(item.args,null,2);
  if(state.allowApprovals&&device.role==='controller'&&!card.querySelector('button'))for(const [label,approved] of [['Allow this action',true],['Deny',false]]){
   const button=document.createElement('button');button.type='button';button.textContent=label;
   button.onclick=async()=>{for(const b of card.querySelectorAll('button'))b.disabled=true;try{await api('approve',{id:item.id,approved});await refresh();}catch(e){error(e);for(const b of card.querySelectorAll('button'))b.disabled=false;}};card.append(button);
  }
 }
 for(const [id,card] of cards)if(!active.has(id)){card.remove();cards.delete(id);}
}
function render(value){
 state=value;csrf=state.device.csrf;device=state.device;pair.hidden=true;workspace.hidden=false;
 byId('connection').textContent=state.project+' / '+state.title+' · '+state.model+' · connected';
 byId('policy').textContent='$'+state.budgetUSD+' per turn / $'+state.remainingUSD.toFixed(4)+' remaining / '+(state.usage.inputTokens??'?')+' in, '+(state.usage.outputTokens??'?')+' out / '+(state.allowApprovals?'remote approvals enabled':'tools requiring approval are denied');
 running=state.turns.some(t=>['queued','running'].includes(t.status));pending=readPending();
 if(pending&&pending.scope===scope()){
  const accepted=state.turns.find(t=>t.id===pending.id);
  if(accepted){const prior=pending;savePending(null);if(byId('text').value===prior.message)byId('text').value='';notice.textContent='Request '+prior.id+' acknowledged by host: '+accepted.status+'.';}
 }
 const encoded=JSON.stringify(state.messages);if(encoded!==lastMessages){lastMessages=encoded;const root=byId('messages');root.replaceChildren();for(const message of state.messages){if(!message.content)continue;const article=document.createElement('article'),role=document.createElement('b'),body=document.createElement('pre');role.textContent=message.role.toUpperCase();body.textContent=message.content;article.append(role,body);root.append(article);}root.scrollTop=root.scrollHeight;}
 renderApprovals(state.approvals);controls();
}
function refresh(){
 if(refreshing)return refreshing;clearTimeout(timer);
 refreshing=(async()=>{try{render(await api('state'));if(failures)error('');failures=0;}catch(e){
  error(e);failures++;byId('connection').textContent=e.status===401?'Device expired or unpaired. Obtain a new pairing code.':'Connection interrupted. Retrying state lookup only; submissions are never replayed.';
  if(e.status===401||e.status===403){stopped=true;pair.hidden=false;}byId('send').disabled=true;
 }finally{refreshing=null;if(!stopped)timer=setTimeout(refresh,failures?Math.min(30000,1500*2**Math.min(failures,5)):1500);}})();return refreshing;
}
async function sendExact(){
 if(!pending||pending.scope!==scope()||posting||running)return;posting=true;controls();const request=pending;
 try{await api('turn',{id:request.id,message:request.message,mode:request.mode});savePending(null);if(byId('text').value===request.message)byId('text').value='';notice.textContent='Request '+request.id+' accepted by host.';error('');}
 catch(e){error(e);/* A send/read failure may already have started work. Keep the ID. */}
 finally{posting=false;controls();await refresh();}
}
pair.onsubmit=async event=>{event.preventDefault();try{const result=await api('pair',{code:byId('code').value,name:'Browser device'});csrf=result.csrf;byId('code').value='';error('');stopped=false;await refresh();}catch(e){error(e);}};
byId('prompt').onsubmit=async event=>{event.preventDefault();if(running||posting||!state||device.role!=='controller')return;
 try{pending=readPending();if(pending){controls();return;}const message=byId('text').value;if(!message.trim())return;savePending({version:1,scope:scope(),id:crypto.randomUUID(),message,mode:byId('mode').value,createdAt:new Date().toISOString()});await sendExact();}catch(e){error(e);controls();}
};
retry.onclick=()=>sendExact();dismiss.onclick=()=>{if(!confirm('Check the host /board, remote status and billing holds first. Dismissing does not cancel work. Clear only this browser recovery record?'))return;try{savePending(null);notice.textContent='Recovery record cleared by you. Host jobs were not cancelled.';controls();}catch(e){error(e);}};
byId('cancel').onclick=async()=>{try{await api('cancel',{});await refresh();}catch(e){error(e);}};
byId('leave').onclick=async()=>{try{await api('revoke-self',{});clearTimeout(timer);stopped=true;workspace.hidden=true;pair.hidden=false;error('Device disconnected. Obtain a new pairing code from your PC. Any unresolved request record is retained.');}catch(e){error(e);}};
window.addEventListener('storage',event=>{if(event.key===storageKey){try{pending=readPending();controls();}catch(e){error(e);}}});
const fragment=new URLSearchParams(location.hash.slice(1)),code=fragment.get('pair');if(code){byId('code').value=code;history.replaceState(null,'',location.pathname);pair.requestSubmit();}else refresh();
