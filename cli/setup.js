import {modelPrice} from '../server/runtime/providers.js';

export async function guidedSetup(c){
 c.print('APEX setup\nProject: '+c.project().path+'\nChoose your own provider or an already-running local server. Setup installs no model and sends no inference unless you explicitly request the final check.\nPlan permits project reads. Build actions still require approval; approved shell/MCP programs are not an OS sandbox.');
 const providers=await c.runtime.listProviders(),presence=await c.vault.status();
 const entries=Object.entries(providers),hasKey=id=>presence.some(s=>s.provider===id&&(s.saved||s.environment));
 c.print('Local servers: '+entries.filter(([,p])=>p.local).map(([id])=>id).join(', ')+'\nYour API credentials present: '+(entries.filter(([id,p])=>!p.local&&hasKey(id)).map(([id])=>id).join(', ')||'none')+'\nOther provider IDs: '+entries.filter(([id,p])=>!p.local&&!hasKey(id)).map(([id,p])=>id+(p.baseURL?'':' (endpoint setup required)')).join(', '));
 const id=(await c.question('Provider ID, or Enter to cancel:')).trim();if(!id){c.print('Setup cancelled.');return {cancelled:true};}
 const provider=providers[id];if(!provider)throw Error('Choose a provider ID from the list.');
 if(!provider.baseURL)throw Error('Configure /endpoint '+id+' HTTPS_BASE_URL for this account first, then /setup.');
 if(provider.keyEnv&&!provider.optionalKey&&!presence.some(s=>s.provider===id&&(s.saved||s.environment))){
  if(!await c.confirm('Save your own '+id+' key now using Windows account encryption?')){c.print('Set '+provider.keyEnv+' yourself or /login '+id+', then /setup.');return {cancelled:true};}
  const key=await c.secret('Paste '+id+' key. Hidden input; Enter saves this credential:');if(!key.trim()){c.print('No credential saved.');return {cancelled:true};}await c.vault.set(id,key.trim());c.runtime.invalidateModels();
 }
 c.print('Endpoint: '+provider.baseURL+'. A catalog lookup contacts only this selected provider. It is not a model request.');
 let rows=[];if(await c.confirm('Fetch this provider model catalog?'))rows=await c.runtime.listModels(id);
 c.print(rows.slice(0,25).map((m,i)=>(i+1)+'. '+m.id+' · '+(m.capabilities||'Tool support unverified')).join('\n')||'Catalog unavailable or skipped. Supply the exact model ID; compatibility remains unverified.');
 const choice=(await c.question('Model number or exact model ID, or Enter to cancel:')).trim();if(!choice){c.print('Setup cancelled. Any separately saved credential is retained.');return {cancelled:true};}
 const selected=/^\d+$/.test(choice)?rows[Number(choice)-1]?.id:choice.includes(':')?choice:id+':'+choice;
 if(!selected?.startsWith(id+':')||selected.length<=id.length+1||selected.length>300||/\s|[\x00-\x1f]/.test(selected))throw Error('Choose an exact model ID for '+id+'.');
 const row=rows.find(m=>m.id===selected);let rates=null,budget=0;
 if(!provider.local){
  if([row?.inputPrice,row?.outputPrice].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))rates={inputPerMillion:row.inputPrice*1e6,outputPerMillion:row.outputPrice*1e6};
  else{
   c.print('No usable catalog price. Enter the prices from your own provider. These are estimates, not verified charges.');
   const input=await c.question('Input USD per million tokens, or Enter to cancel:');if(!input.trim())return {cancelled:true};
   const output=await c.question('Output USD per million tokens, or Enter to cancel:');if(!output.trim())return {cancelled:true};
   rates={inputPerMillion:Number(input),outputPerMillion:Number(output)};modelPrice(rates);
  }
  const cap=(await c.question('Per-turn USD ceiling [0.10]. Includes tool-loop requests; unknown outcomes remain held:')).trim();budget=cap?Number(cap):.1;
  if(!Number.isFinite(budget)||budget<0||budget>1000)throw Error('Use a finite ceiling from 0 to 1000 USD.');
 }
 c.print('Ready to save\nModel: '+selected+'\nMode: Plan (project reads; no model edits or execution)\nPer-turn ceiling: $'+budget.toFixed(4)+' (the runtime or job limit may lower this)\n'+(rates?'Price estimate: $'+rates.inputPerMillion+'/M input, $'+rates.outputPerMillion+'/M output':'Local server; no provider charge assumed')+'\nTool support: '+(row?.capabilities||'unverified')+'\nActual provider cost is separate. No account fallback, subscription or sponsored allowance is enabled.');
 if(!await c.confirm('Save this model, Plan mode and spending ceiling?')){c.print('Model setup cancelled. Separately saved credentials are retained.');return {cancelled:true};}
 const settings=await c.store.readSettings();await c.store.writeSettings({defaultModel:selected,defaultMode:'plan',maxTurnUSD:budget,setupCompletedAt:new Date().toISOString(),...(rates?{modelPrices:{...settings.modelPrices,[selected]:{...rates,updatedAt:new Date().toISOString()}}}:{})});
 c.select({model:selected,mode:'plan'});c.runtime.invalidateModels();
 c.print('Setup saved. Use /build only when ready to approve changes. Run /setup again to change the ceiling. /collaborate explains the two-person workflow.');
 if(await c.confirm('Run one bounded Plan check now? This sends a model request on your selected account.'))await c.chat('Briefly identify the selected project using list_files only. Do not execute commands, edit files, contact peers or request other tools.');
 return {model:selected,mode:'plan',maxTurnUSD:budget};
}

export const COLLABORATE_GUIDE=`Two-person APEX workflow
1. Each person uses their own APEX home, project checkout and provider credential. Run /setup independently.
2. Person A: /repo init, /repo connect OWNER/REPO, then /repo push Initial source.
3. Person B: /repo clone {"remote":"OWNER/REPO","destination":"C:/projects/shared-project"}.
4. Start your own APEX hub separately. Local rehearsal: apex hub --home PATH --port 8789.
   Different PCs require a reachable HTTPS hub with a trusted certificate. APEX does not provision hosting.
5. A: /room create URL, enter the hub owner token at its hidden prompt, then /room invite member.
   Share that private single-use invitation yourself. B: /room join, paste it at the hidden prompt.
6. A: /room say Please review the parser. B: /room pull. Shared notes appear in each local APEX-Vault.
7. B may opt into /pool on PROVIDER:MODEL USD, inspect /pool inbox, and explicitly /pool accept TASK_ID.
   A offers with /pool offer {"target":"MEMBER_ID","goal":"Review parser","maxUSD":0.05}.
   B's agent uses B's key in Plan with shared-only context. Keys and private chats are not pooled.
8. Review work and real test evidence. /repo save MESSAGE commits locally; /repo push MESSAGE pushes;
   the other person uses /repo sync. Dirty or divergent work is preserved for explicit resolution.
Use /context combined to add published room context to your local context. Publishing a private chat
requires a separate explicit action. /vault search QUERY retrieves bounded linked notes.
See COLLABORATION.md for hub TLS, revocation and recovery limits. The offline rehearsal is
npm run verify:collaboration from an APEX source checkout; it uses two profiles and fixture inference.
`;
