const byId=id=>document.getElementById(id),pair=byId('pair'),workspace=byId('workspace');
const storageKey='apex.remote.pending.v1',cards=new Map();
let csrf='',device=null,state=null,timer,refreshing=null,running=false,posting=false,lastMessages='',failures=0,stopped=false,pending=null;
const error=e=>{byId('error').textContent=e?.message||String(e||'');};
const decisionRoot=document.createElement('section');decisionRoot.setAttribute('aria-label','Project decision inbox');byId('approvals').after(decisionRoot);
const decisionToolbar=document.createElement('nav'),inboxTab=document.createElement('button'),chatTab=document.createElement('button');decisionToolbar.setAttribute('aria-label','Companion view');inboxTab.type=chatTab.type='button';inboxTab.textContent='Decision inbox';chatTab.textContent='Chat / tools';decisionToolbar.append(inboxTab,chatTab);byId('messages').before(decisionToolbar);let companionView='inbox';
function companionLayout(enabled){const review=state?.attentionInbox?.some(q=>['open','answered'].includes(q.status));enabled=enabled||review;decisionToolbar.hidden=!enabled;const inbox=enabled&&companionView==='inbox';decisionRoot.hidden=attentionRoot.hidden=!inbox;byId('messages').hidden=byId('approvals').hidden=byId('prompt').hidden=inbox;inboxTab.textContent=review?'Review inbox':'Decision inbox';inboxTab.setAttribute('aria-pressed',String(inbox));chatTab.setAttribute('aria-pressed',String(!inbox));}
inboxTab.onclick=()=>{companionView='inbox';companionLayout(state?.decisionInbox?.enabled);};chatTab.onclick=()=>{companionView='chat';companionLayout(state?.decisionInbox?.enabled);};
const decisionCards=new Map(),decisionPending=new Set();
function renderDecisions(inbox){
 companionLayout(inbox?.enabled);const visible=new Set();for(const item of inbox?.items||[]){visible.add(item.id);if(decisionCards.has(item.id))continue;const card=document.createElement('article'),heading=document.createElement('h2'),reason=document.createElement('p'),rationale=document.createElement('pre'),disclosure=document.createElement('details'),summary=document.createElement('summary'),details=document.createElement('pre'),comment=document.createElement('textarea');heading.textContent=item.terms.title+' · v'+item.version;reason.textContent='Your selected PC owns this proposal. Answering never starts work. Preview expires '+item.expiresAt;rationale.textContent=item.terms.rationale;summary.textContent='Inspect alternatives, evidence, comments and exact version';details.textContent=JSON.stringify({hash:item.hash,terms:item.terms,changes:item.changes,comments:item.comments},null,2);disclosure.append(summary,details);comment.setAttribute('aria-label','Decision comment for '+item.terms.title);comment.placeholder='Comment or reason for requesting changes';comment.maxLength=6000;card.append(heading,reason,rationale,disclosure,comment);
  for(const [label,action] of [['Accept exact proposal','accept'],['Reject proposal','reject'],['Send comment','comment']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{if(decisionPending.has(item.id))return;if(!confirm(label+' v'+item.version+'? This records a project decision only. It does not run the agent.'))return;const requestId=crypto.randomUUID();decisionPending.add(item.id);for(const b of card.querySelectorAll('button'))b.disabled=true;try{await api('decision',{requestId,id:item.id,hash:item.hash,version:item.version,action,...(action==='comment'?{comment:comment.value}:{})});error('');await refresh();}catch(e){error(Error(e.message+' Publication ID '+requestId+'. Inspect the decision history; no answer was replayed.'));}};card.append(button);}
  decisionCards.set(item.id,card);decisionRoot.append(card);
 }
 for(const [id,card] of decisionCards)if(!visible.has(id)){card.remove();decisionCards.delete(id);decisionPending.delete(id);}
 let recovery=decisionRoot.querySelector('[data-decision-recovery]');if(!recovery){recovery=document.createElement('div');recovery.dataset.decisionRecovery='true';decisionRoot.append(recovery);}recovery.replaceChildren();
 for(const action of inbox?.actions||[]){if(!['unknown','sending','preparing'].includes(action.state))continue;const line=document.createElement('p'),button=document.createElement('button');line.textContent='Decision publication '+action.id+' · '+action.state+'. Refresh checks history only.';button.textContent='Check publication';button.onclick=async()=>{button.disabled=true;try{await api('decision-refresh',{id:action.id});await refresh();}catch(e){error(e);}finally{button.disabled=false;}};recovery.append(line,button);}
}
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
const attentionRoot=document.createElement('section'),attentionCards=new Map();attentionRoot.setAttribute('aria-label','Human review questions');byId('prompt').before(attentionRoot);
function renderAttention(questions){
 const visible=new Set();
 for(const q of questions||[]){if(!['open','answered'].includes(q.status))continue;visible.add(q.id);let card=attentionCards.get(q.id);
  const renderKey=[q.hash,q.status,q.sourceStatus].join(':');if(card&&card.dataset.version===renderKey)continue;if(card)card.remove();card=document.createElement('article');card.dataset.version=renderKey;const title=document.createElement('b'),detail=document.createElement('p');title.textContent=q.question;detail.textContent=q.status+' · source '+q.sourceStatus+' · answer only, never execution permission';card.append(title,detail);
  const disclosure=document.createElement('details'),summary=document.createElement('summary'),preview=document.createElement('pre');summary.textContent='Inspect exact question, context and proposed operation';preview.textContent=JSON.stringify({id:q.id,version:q.version,hash:q.hash,kind:q.kind,context:q.context,operation:q.operation,sourceHash:q.source?.hash,sourceStatus:q.sourceStatus,visibility:q.visibility,expiresAt:q.expiresAt,...(q.answer?{answer:q.answer}:{})},null,2);disclosure.append(summary,preview);card.append(disclosure);
  if(q.status==='open'){const answer=document.createElement('textarea'),button=document.createElement('button');answer.setAttribute('aria-label','Answer '+q.question);answer.rows=3;button.type='button';button.textContent='Save answer for host review';button.disabled=q.sourceStatus!=='current';button.onclick=async()=>{if(!answer.value.trim())return;button.disabled=true;try{await api('attention-answer',{id:q.id,version:q.version,hash:q.hash,answer:answer.value});await refresh();}catch(e){error(e);button.disabled=q.sourceStatus!=='current';}};card.append(answer,button);}else{const note=document.createElement('p');note.textContent='Answer saved. Explicit continuation happens on the host.';card.append(note);}
  attentionCards.set(q.id,card);attentionRoot.append(card);
 }
 for(const [id,card] of attentionCards)if(!visible.has(id)){card.remove();attentionCards.delete(id);}
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
 renderApprovals(state.approvals);renderDecisions(state.decisionInbox);renderAttention(state.attentionInbox);controls();
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
