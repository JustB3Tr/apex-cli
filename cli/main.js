import {mcpPolicyCommands,MCP_POLICY_HELP} from './mcp-policy-commands.js';
import {PlainTerminalUI} from './plain-terminal.js';
import {inspectorCommands,INSPECTOR_HELP} from './inspector-commands.js';
import {experimentCommands,EXPERIMENT_HELP} from './experiment-commands.js';
import {projectContractCommands,CONTRACT_HELP} from './project-contract-commands.js';
import {attentionCommands,ATTENTION_HELP} from './attention-commands.js';
import {groupCommands,GROUP_HELP} from './group-commands.js';
import {vaultCommands,VAULT_GRAPH_HELP} from './vault-commands.js';
import {continuityCommands,CONTINUITY_HELP} from './continuity-commands.js';
import {communityCommands,COMMUNITY_HELP} from './community-commands.js';
import {insightCommands,INSIGHT_HELP} from './insight-commands.js';
import {integrationLogin} from '../server/integrations.js';
import {workCommands,WORK_HELP} from './work-commands.js';
import {popupSetup,modelMenu,effortMenu,mcpMenu} from './menus.js';
import {dashboardRows} from './dashboard.js';
import {cacheCommands,CACHE_HELP} from './cache-commands.js';
import {latestCache} from '../server/runtime/cache.js';
import {freeCommands,FREE_HELP} from './free-commands.js';
import {accountCommands,ACCOUNT_HELP} from './account-commands.js';
import {remoteCommands,REMOTE_HELP} from './remote-commands.js';

import {extensionCommands,EXTENSION_HELP} from './extension-commands.js';

import {featureCommands,FEATURE_HELP} from './features.js';

import {stdin,stdout,stderr} from 'node:process';

import {readFile,mkdir,appendFile} from 'node:fs/promises';

import {spawn} from 'node:child_process';

import path from 'node:path';

import os from 'node:os';

import {createStore} from '../server/store.js';

import {createRuntime} from '../server/runtime/index.js';

import {TerminalUI} from './terminal.js';

import {headerLines,starAnswer,fg,PALETTE} from './look.js';

import {credentialVault} from './credentials.js';
import {terminalText} from './output.js';
import {COLLABORATE_GUIDE} from './setup.js';
import {autoPermission,commandCatalog,PERMISSIONS} from './permissions.js';
import {executeShell,shellTurn,shareShellReceipt} from './shell-command.js';

import {runNative,nativeVersion} from './native.js';

import {providerCatalog,providerKeyMap,customProvider,modelPrice,validateBaseURL} from '../server/runtime/providers.js';



export const HELP=`APEX CLI - terminal-native coding agent



  apex [folder]                         Start an interactive session

  apex [folder] --continue              Resume the last project session

  apex [folder] --mode plan             Start in enforced read-only mode

  apex [folder] --model ollama:MODEL     Select a local model

  apex -p "request" --model MODEL       Run one turn and exit

  apex --plain                         Line-oriented terminal, no animations
  apex -p "request" --json              Emit a structured result



Models use provider:MODEL. Use /providers to see built-in and custom services.

Set OPENROUTER_API_KEY in your environment for OpenRouter.

OLLAMA_BASE_URL configures local Ollama (default localhost:11434).



Flags: --home PATH, --approve (explicitly approve tools in one-shot mode),

       --mode build|plan, --version, --help



Commands:

 /help                  This guide
 /setup                 Vault, provider, model and permissions setup
 /effort [auto|low|medium|high|xhigh|max]   Reasoning effort menu
 /permissions [ask|auto|read-only]   Show or change permissions (Ctrl+P)
 /commands [ID|send ID]  Inspect saved local shell receipts; explicitly send one
 !command               Run a local command, save output, then offer model help
 /collaborate           One two-person project workflow

 /plan /build           Switch mode (also Shift+Tab)

 /mode [build|plan]     Show or switch mode

 /login <provider>      codex/claude sign-in, or hidden API key for any API provider

 /auth                  Show credential presence, never values

 /logout <provider>     Remove a saved API key, or official CLI logout

 /codex [request]       Hand terminal to official Codex using its saved login

 /claude [request]      Hand terminal to official Claude Code using its saved login

 /model [id]            Show or select model

 /models [filter]       List provider models; choose a model with tool support

 /providers             List providers and credential presence

 /provider add <id> <https-base-url> <API_KEY_ENV_NAME> [protocol]   Add endpoint

 /endpoint <provider> <https-base-url>   Set account/region-specific endpoint

 /provider remove <id>  Remove a custom endpoint (retains saved key)

 /pricing <provider:model> <input USD/M> <output USD/M>  Set price estimate

 /new [title]           Create a saved chat

 /sessions              List saved project chats

 /resume <id|number>    Resume a saved chat

 /history               Print this chat

 /usage                 Saved token and cost totals

 /project [folder]      Show or switch project

 /memory                List editable project notes

 /memory add <text>     Save an explicit note

 /memory delete <id>    Delete a note

 /mcp                   List configured MCP servers

 /mcp add <JSON>        Add stdio or HTTP configuration; no embedded secrets

 /mcp connect <id>      Approve connection and discover tools

 /mcp remove <id>       Disconnect/remove a server

 /team <goal>           Propose a scoped team; approval required

 /agents                Show colleagues, scopes and status

 /terminal new [name]   Open another background shell

 /terminal list         Show terminal sessions

 /terminal send <id> <command>   Execute in a named shell

 /terminal close <id>   Stop a shell

 /shell                 Temporarily attach an interactive foreground shell

 /multiline             Compose until a line containing .end

 /exit                  Save and quit



Ask permissions prompt for writes, execution, memory, delegation and external calls.
Auto may approve bounded project source/text writes and literal location/time inspection.
Other actions still ask. Esc or Ctrl+C cancels an active turn. Shells are not OS sandboxes.

Input: arrows edit, up/down recall history, Ctrl+A/E move, Ctrl+U/K clear.

Bracketed multiline pastes collapse to [Pasted N lines]; content is preserved.

API keys use hidden input and Windows DPAPI storage, outside chat history.

Normal startup opens no browser or HTTP server. An optional hub is explicit. State defaults to ~/.apex-cli.

`;



export function parseArgs(args){

 const options={folder:process.cwd(),continue:false,json:false,approve:false};let positional=false;

 const values={'--home':'home','--model':'model','--mode':'mode','--prompt':'prompt','-p':'prompt'};

 for(let i=0;i<args.length;i++){

  const a=args[i];if(values[a]){if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for ${a}`);options[values[a]]=args[++i];}

  else if(['--continue','--json','--approve','--help','--version','--plain'].includes(a))options[a.slice(2)]=true;

  else if(a==='-h')options.help=true;

  else if(a.startsWith('-'))throw Error(`Unknown option ${a}`);

  else if(!positional){options.folder=path.resolve(a);positional=true;}else throw Error('Pass one project folder; use -p for a prompt');

 }

 if(options.mode&&!['plan','build'].includes(options.mode))throw Error('Mode must be plan or build');return options;

}



export async function run(args=process.argv.slice(2)){

 const options=parseArgs(args);if(options.help){stdout.write(HELP+FEATURE_HELP+EXTENSION_HELP+REMOTE_HELP+ACCOUNT_HELP+FREE_HELP+CACHE_HELP+WORK_HELP+INSIGHT_HELP+COMMUNITY_HELP+CONTINUITY_HELP+VAULT_GRAPH_HELP+GROUP_HELP+EXPERIMENT_HELP+CONTRACT_HELP+ATTENTION_HELP+INSPECTOR_HELP+MCP_POLICY_HELP);return;}

 if(options.version){stdout.write(JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version+'\n');return;}

 const interactive=Boolean(options.plain||stdin.isTTY&&stdout.isTTY);

 if(!interactive&&options.prompt===undefined)throw Error('Use an interactive terminal, or pass -p "request" for one-shot mode.');

 const output=options.json?stderr:stdout;

 const {store}=await createStore(options.home||process.env.APEX_HOME||path.join(os.homedir(),'.apex-cli'));

 let project=await store.createProject({name:path.basename(options.folder)||'Project',path:options.folder});

 let settings=await store.readSettings(),model=options.model||settings.defaultModel||'',session;

 let permissions=PERMISSIONS.includes(settings.permissions)?settings.permissions:'ask';
 let shellAbort,lastProjection,nextRecovery;
 let mode=options.mode||settings.defaultMode||'build';if(!['build','plan'].includes(mode))mode='build';if(options.mode==='build'&&permissions==='read-only')permissions='ask';

 if(options.mode)await store.writeSettings({defaultMode:mode});

 const vault=credentialVault(store.home);

 vault.configureProviders(providerKeyMap(providerCatalog(settings.providers)));

 const sessions=await store.listSessions(project.id);

 session=options.continue&&sessions.length?await store.getSession(sessions.at(-1).id):await store.createSession({projectId:project.id,title:options.prompt?.slice(0,80)||'Terminal chat'});

 const rl=interactive&&!options.json?new (options.plain||process.env.TERM==='dumb'?PlainTerminalUI:TerminalUI)(stdin,stdout):null;

 if(rl){rl.commands=commandCatalog(HELP+FEATURE_HELP+EXTENSION_HELP+REMOTE_HELP+ACCOUNT_HELP+FREE_HELP+CACHE_HELP+WORK_HELP+INSIGHT_HELP+COMMUNITY_HELP+CONTINUITY_HELP+VAULT_GRAPH_HELP+GROUP_HELP+EXPERIMENT_HELP+CONTRACT_HELP+ATTENTION_HELP+INSPECTOR_HELP+MCP_POLICY_HELP);rl.permissions=permissions;rl.mode=mode;rl.setMotion(settings.motion||rl.motion);}

 const print=(value='')=>rl?rl.write(value):output.write(terminalText(value)+'\n');
 const rendered=value=>rl?rl.write(value,{trusted:true}):print(value);

 let groupControl;const personalTurns=new Map(),personalTasks=new Set();
 const livePreviews=new Map();
 let busy=false,approvalQueue=Promise.resolve(),lastPrinted='',closing=false,nativeBusy=false;

 const shells=new Map(),pendingApprovals=new Set();

 const runtime=createRuntime({store,getCredential:provider=>vault.get(provider),requestContextRecovery:rl?async info=>{rl.stopWorking();try{return await rl.dialog({title:'Recover project context',description:info.omittedTurns?'Older turns omitted. Cache expiry does not delete saved history.':'Estimated cache window elapsed. Saved history is intact.',items:[...(info.vaultAvailable?[{value:'vault',label:'Look through vault and connections',description:'Relevant notes and local links; may miss details'}]:[]),{value:'reread',label:'Reread saved chat history',description:'Must fit the context limit; may cost more'},{value:'recent',label:'Keep recent context',description:info.omittedTurns+' older turns outside current selection'},{value:'cancel',label:'Cancel before model request'}]});}finally{rl.startWorking();}}:undefined,emit:event=>{

  if(event.type==='approval'){pendingApprovals.add(event.id);

   approvalQueue=approvalQueue.then(async()=>{

    print(`\nApproval: ${event.tool}\n${JSON.stringify(event.args,null,2)}`);

    let approved=options.approve===true;

    if(rl){
     const approvalSession=await store.getSession(event.sessionId),approvalMode=approvalSession.messages.findLast(m=>m.role==='user')?.mode||mode;
     const policy=await autoPermission({tool:event.tool,args:event.args,root:project.path,mode:approvalMode,permissions:event.sessionId!==session.id?'ask':permissions});
     await store.saveRecord('events',{type:'permission_decision',projectId:project.id,sessionId:session.id,data:{tool:event.tool,...policy}});
     if(policy.decision==='allow'){approved=true;print('Auto approved: '+policy.reason);}
     else if(policy.decision==='deny'){approved=false;print('Denied: '+policy.reason);}
     else{approved=await rl.dialog({title:'Allow '+event.tool+'?',description:'Agent chat '+event.sessionId+'. Local permission only.',items:[{value:false,label:'Deny'},{value:true,label:'Allow this action'}]})===true;}
    }

    else if(!approved)print('Denied: non-interactive mode requires explicit --approve.');

    await runtime.approve({id:event.id,approved}).catch(e=>print(e.message));pendingApprovals.delete(event.id);

   }).catch(e=>print(e.message));

  }else if(event.type==='activity'){rl?.setActivity(event.label);}
  else if(event.type==='delta'&&event.partial){if(event.sessionId===session.id&&(!groupControl||groupControl.tab==='personal')){const id=event.sessionId+':'+(event.agentId||'main'),text=(livePreviews.get(id)||'')+event.text;livePreviews.set(id,text.slice(-1200));rl?.setLiveResponse(text);rl?.setActivity('Receiving response · '+(event.streamedChars||0)+' characters');}}
  else if(event.type==='verification'&&!options.json&&event.sessionId===session.id&&(event.checks||event.edits)){print('Evidence: '+event.statement+' /evidence '+event.jobId);}
  else if(event.type==='delta'&&!options.json&&(!groupControl||groupControl.tab==='personal')&&event.sessionId===session.id){livePreviews.delete(event.sessionId+':'+(event.agentId||'main'));rl?.setLiveResponse('');rendered('\n'+(rl?starAnswer(terminalText((event.agentId?'agent '+event.agentId.slice(0,8)+': ':'')+event.text)):`APEX > ${event.text}`));lastPrinted=event.text;}

  else if(event.type==='agent')print(`[${event.agent.name}] ${event.agent.status} · ${event.agent.scope?.join(', ')}`);

  else if(event.type==='attention')print('Waiting for human review · '+(event.questionId||event.id||'')+' · /attention');
  else if(event.type==='steering')print('Steering '+event.status+' · '+event.id);
  else if(event.type==='error'){rl?.setLiveResponse('');print(`APEX stopped: ${event.message}`);}

  else if(event.type==='context'&&!options.json){lastProjection=event;if(event.omittedTurns||event.missingResults||event.invalidExchanges||event.orphanResults)print(`Context: ${event.includedTurns}/${event.sourceTurns} saved turns included; ${event.missingResults} tool outcomes unknown. Original history preserved. /context inspect`);refreshDashboard().catch(()=>{});}
  else if(event.type==='usage'&&!options.json){refreshDashboard().catch(()=>{});if(rl&&!event.agentId&&event.sessionId===session.id&&event.model===model)rl.footer.cache=event.cache;print(`  tokens ${event.inputTokens??'?'} in / ${event.outputTokens??'?'} out · cost ${event.cost==null?'unknown'+(event.estimatedCost!=null?` · estimate ceiling $${event.estimatedCost.toFixed(6)}`:''):'$'+event.cost.toFixed(6)}`);}

 }});

 const features=featureCommands({store,celebrate:async value=>rl?rl.celebrate(value):print('✓ '+value.title+' '+value.detail),pendingApprovals:()=>pendingApprovals.size,project:()=>project,session:()=>session,model:()=>model,mode:()=>mode,print,selectSession:value=>{session=value;},selectProject:async folder=>{project=await store.createProject({name:path.basename(folder),path:folder});session=await store.createSession({projectId:project.id,title:'Terminal chat'});},secret:async title=>{if(!rl)throw Error('Use an interactive terminal for hidden group credentials');return (await rl.question(title,{secret:true})).trim();},confirm:async message=>rl?/^y(?:es)?$/i.test((await rl.question(message+' [y/N]')).trim()):options.approve===true});

 const chat=async (message,extra={})=>{

  if(!model)throw Error('Select provider:MODEL with /model. Use /providers and /models for choices.');

  const currentSession=session,currentProject=project,currentModel=model,currentMode=mode;
  if(personalTurns.has(currentSession.id)){print(JSON.stringify(await runtime.steer({sessionId:currentSession.id,content:message})));return;}
  busy=true;lastPrinted='';rl?.startWorking();const token={};personalTurns.set(currentSession.id,token);try{

   const recoveryChoice=nextRecovery;nextRecovery=undefined;
   const result=await runtime.chat({projectId:currentProject.id,sessionId:currentSession.id,message,model:currentModel,mode:currentMode,contextPolicy:'private',recoveryChoice,...extra});

   if(options.json)stdout.write(JSON.stringify(result)+'\n');

   else if(result.content&&result.content!==lastPrinted&&session.id===currentSession.id&&groupControl?.tab!=='group')rendered(rl?starAnswer(terminalText(result.content)):result.content);

   if(result.parked)print('Work parked with saved progress. Review /attention; no model requests continue while waiting.');
   if(result.error)process.exitCode=1;

  }finally{personalTurns.delete(currentSession.id);busy=personalTurns.size>0||Boolean(groupControl?.activeCount);if(!busy)rl?.stopWorking();await refreshDashboard();}

 };

 const interrupt=()=>{if(nativeBusy)return;for(const id of pendingApprovals)runtime.approve({id,approved:false}).catch(()=>{});if(busy){shellAbort?.abort();rl?.cancelQuestion();runtime.cancel({sessionId:session.id});if(groupControl?.tab==='group')groupControl.cancel().catch(e=>print(e.message));print('\nCancelling…');}else{closing=true;rl?.close();}};

 process.on('SIGINT',interrupt);rl?.on('SIGINT',interrupt);

 const escape=()=>{if(busy||groupControl?.activeCount)interrupt();};rl?.on('cancel',escape);

 async function setMode(value){if(!['build','plan'].includes(value))throw Error('Choose build or plan');mode=value;if(value==='build'&&permissions==='read-only')permissions='ask';if(rl){rl.permissions=permissions;}if(rl){rl.mode=mode;rl.render();}await store.writeSettings({defaultMode:mode,permissions});}

 async function setPermissions(value){
  if(!PERMISSIONS.includes(value))throw Error('Choose ask, auto or read-only');
  permissions=value;mode=value==='read-only'?'plan':'build';
  if(rl){rl.permissions=value;rl.mode=mode;rl.render();}
  await store.writeSettings({permissions:value,defaultMode:mode});
 }
 rl?.on('permissions',()=>{if(!busy&&rl.active?.history){const current=mode==='plan'?'read-only':permissions;setPermissions(PERMISSIONS[(PERMISSIONS.indexOf(current)+1)%PERMISSIONS.length]).catch(e=>print(e.message));}});
 const menuContext={ui:rl,store,runtime,vault,project:()=>project,session:()=>session,mode:()=>mode,print,command:line=>command(line),select:value=>{model=value.model;mode=value.mode;if(rl)rl.mode=mode;},setPermissions};
 const setup=()=>popupSetup(menuContext);
 async function refreshDashboard(){
  if(!rl)return;
  const messages=(await store.getSession(session.id)).messages;
  const projection=(await store.records('events',{projectId:project.id,type:'context_projection'})).filter(e=>e.data.sessionId===session.id&&!e.data.agentId).at(-1)?.data;
  const groupDashboard=groupControl?.dashboard();if(groupDashboard){rl.dashboard=groupDashboard;rl.footer.model='shared chat · owner-local model pool';rl.footer.cache=null;rl.footer.cacheVisible=false;if(rl.active?.history)rl.render();return;}
  const savedUsage=messages.filter(m=>m.usage&&!m.usage.inherited).map(m=>m.usage),totalTokens=savedUsage.length&&savedUsage.every(u=>u.inputTokens!=null&&u.outputTokens!=null)?savedUsage.reduce((n,u)=>n+u.inputTokens+u.outputTokens,0):null;rl.footer.model=(model||'select /model')+(totalTokens!=null?' · '+totalTokens+' tokens':'');rl.footer.cache=latestCache(messages,model);rl.footer.cacheVisible=(await store.readSettings()).cacheTimer!==false;
  rl.dashboard=dashboardRows({messages,model,settings:await store.readSettings(),projection:projection||lastProjection,mcps:(await runtime.listMcp()).filter(m=>!m.projectId||m.projectId===project.id)});
  if(rl.active?.history)rl.render();
 }
 let menuBusy=false;
 rl?.on('mcp',id=>{if(busy||menuBusy||!rl.active?.history)return;menuBusy=true;rl.withOverlay(()=>mcpMenu(menuContext,id)).catch(e=>print(e.message)).finally(async()=>{menuBusy=false;await refreshDashboard().catch(e=>print(e.message));});});
 const shellContext={store,project:()=>project,session:()=>session,model:()=>model,print,chat,
  confirm:async text=>/^y(?:es)?$/i.test((await rl.question(text+' [y/N]')).trim()),
  execute:async command=>{
   shellAbort=new AbortController();busy=true;rl.startWorking();rl.setActivity('Running local command');
   try{return await executeShell(command,{cwd:project.path,signal:shellAbort.signal});}
   finally{busy=false;shellAbort=null;rl.stopWorking();}
  }};

 rl?.on('mode',()=>{if(!busy&&rl.active?.history)setMode(mode==='build'?'plan':'build').catch(e=>print(e.message));});

 async function native(provider,options={}){

  if(!rl)throw Error('Native CLI handoff needs an interactive terminal');

  print(`Opening official ${provider} CLI. It owns this terminal and uses its own tools, MCP, permissions, history and billing. Exit it to return to APEX.`);

  const apiKey=provider==='claude'?(process.env.ANTHROPIC_API_KEY||await vault.get('anthropic')):options.apiKey;

  nativeBusy=true;rl.pause();try{const code=await runNative(provider,{cwd:project.path,mode,apiKey,...options});print(`${provider} exited (${code}). Returned to APEX.`);}finally{nativeBusy=false;rl.resume();}

 }

 const accountControl=accountCommands({store,mode:()=>mode,print,confirm:async text=>rl?/^y(?:es)?$/i.test((await rl.question(text+' [y/N]')).trim()):false,invalidateModels:()=>runtime.invalidateModels(),secret:async (text,{trim=true}={})=>{if(!rl)throw Error('Account login needs hidden interactive input');const result=await rl.question(text,{secret:true,preserveWhitespace:!trim});return trim?result.trim():result;}});
 const remoteControl=remoteCommands({store,project:()=>project,session:()=>session,model:()=>model,mode:()=>mode,print,secret:async text=>{if(!rl)throw Error('Hidden pairing needs an interactive terminal');return (await rl.question(text,{secret:true})).trim();},confirm:async text=>rl?/^y(?:es)?$/i.test((await rl.question(text+' [y/N]')).trim()):options.approve===true});

 groupControl=groupCommands({ui:rl,store,runtime,mode:()=>mode,active:()=>personalTurns.size>0||Boolean(groupControl?.activeCount),project:()=>project,session:()=>session,model:()=>model,print,selectSession:value=>{session=value;},refresh:()=>{busy=personalTurns.size>0||Boolean(groupControl?.activeCount);if(rl){rl.chatTabs=groupControl?.label();if(rl.active?.history)refreshDashboard().catch(e=>print(e.message));}}});
 rl?.on('tabs',()=>{if(menuBusy||pendingApprovals.size||!rl.active?.history)return;menuBusy=true;groupControl.menu().catch(e=>print(e.message)).finally(()=>{menuBusy=false;rl.chatTabs=groupControl.label();rl.render();});});

 const visionaryContext={ui:rl,store,runtime,project:()=>project,session:()=>session,mode:()=>mode,print,
  confirm:async message=>rl?await rl.dialog({title:message,items:[{value:false,label:'Cancel'},{value:true,label:'Confirm this exact action'}]})===true:false,
  runTask:async fn=>{if(busy)throw Error('Finish or park active work first');shellAbort=new AbortController();busy=true;rl?.startWorking();try{return await fn(shellAbort.signal);}finally{busy=false;shellAbort=null;rl?.stopWorking();await refreshDashboard();}}
 };
 const mcpPolicyControl=mcpPolicyCommands(visionaryContext);
 const inspectorControl=inspectorCommands({...visionaryContext,command:line=>command(line)});
 const experimentControl=experimentCommands(visionaryContext),contractControl=projectContractCommands(visionaryContext),attentionControl=attentionCommands(visionaryContext);
 const vaultCommand=vaultCommands({ui:rl,store,project:()=>project,mode:()=>mode,print});
 const continuityCommand=continuityCommands({ui:rl,store,runtime,project:()=>project,model:()=>model,mode:()=>mode,print,runTask:async fn=>{shellAbort=new AbortController();busy=true;rl?.startWorking();try{return await fn(shellAbort.signal);}finally{busy=false;shellAbort=null;rl?.stopWorking();}}});
 const communityCommand=communityCommands({ui:rl,store,runtime,project:()=>project,session:()=>session,model:()=>model,mode:()=>mode,print,command:line=>command(line),setRecovery:value=>{nextRecovery=value;},runTask:async fn=>{shellAbort=new AbortController();busy=true;rl?.startWorking();try{return await fn(shellAbort.signal);}finally{busy=false;shellAbort=null;rl?.stopWorking();}}});
 const insightCommand=insightCommands({ui:rl,store,project:()=>project,session:()=>session,mode:()=>mode,print,chat,selectSession:value=>{session=value;}});
 const workCommand=workCommands({ui:rl,store,runtime,vault,project:()=>project,session:()=>session,model:()=>model,mode:()=>mode,print,selectSession:value=>{session=value;},insight:name=>insightCommand.command('/'+name,''),community:name=>['outbox','support','research','eval','lab'].includes(name)?continuityCommand.command('/'+name,''):communityCommand.command('/'+name,''),native,nativeVersion,runTask:async fn=>{shellAbort=new AbortController();busy=true;rl?.startWorking();try{return await fn(shellAbort.signal);}finally{busy=false;shellAbort=null;rl?.stopWorking();}},integrationLogin:async service=>{if(!rl)throw Error('Login needs an interactive terminal');nativeBusy=true;rl.pause();try{return await integrationLogin(service,project.path);}finally{nativeBusy=false;rl.resume();}}});
 const extensionCommand=extensionCommands({store,runtime,project:()=>project,session:()=>session,model:()=>model,mode:()=>mode,print,chat,secret:async title=>{if(!rl)throw Error('Hidden credentials need an interactive terminal');return (await rl.question(title,{secret:true})).trim();},confirm:async message=>rl?/^y(?:es)?$/i.test((await rl.question(message+' [y/N]')).trim()):options.approve===true});

 const cacheCommand=cacheCommands({store,print,session:()=>session,model:()=>model,setVisible:visible=>{if(rl){rl.footer.cacheVisible=visible;rl.refreshFooter();}}});
 const freeCommand=freeCommands({store,runtime,print,getCredential:id=>process.env[providerCatalog()[id]?.keyEnv]||vault.get(id),selectModel:value=>{model=value;},confirm:async text=>rl?/^y(?:es)?$/i.test((await rl.question(text+' [y/N]')).trim()):false});
 async function command(line){

  const space=line.indexOf(' '),name=(space<0?line:line.slice(0,space)).toLowerCase(),rest=space<0?'':line.slice(space+1).trim();

  if(name==='/exit'||name==='/quit'){closing=true;return;}

  if((personalTurns.size||groupControl?.activeCount)&&!['/tabs','/group','/history','/usage','/help','/exit','/quit','/attention','/perf','/health','/evidence','/history-search'].includes(name))throw Error('An agent is active. Switch tabs, send steering or cancel before changing configuration.');
  if(await mcpPolicyControl.command(name,rest))return;
  if(await inspectorControl.command(name,rest))return;
  if(await attentionControl.command(name,rest))return;
  if(await experimentControl.command(name,rest))return;
  if(await contractControl.command(name,rest))return;
  if(await groupControl.command(name,rest))return;
  if(name==='/help')return print(HELP+FEATURE_HELP+EXTENSION_HELP+REMOTE_HELP+ACCOUNT_HELP+FREE_HELP+CACHE_HELP+WORK_HELP+INSIGHT_HELP+COMMUNITY_HELP+CONTINUITY_HELP+VAULT_GRAPH_HELP+GROUP_HELP+EXPERIMENT_HELP+CONTRACT_HELP+ATTENTION_HELP+INSPECTOR_HELP+MCP_POLICY_HELP);
  if(name==='/collaborate-guide')return print(COLLABORATE_GUIDE);
  if(await vaultCommand.command(name,rest))return;
  if(await continuityCommand.command(name,rest))return;
  if(await communityCommand.command(name,rest))return;
  if(await insightCommand.command(name,rest))return;
  if(await workCommand.command(name,rest))return;
  if(name==='/effort'){await effortMenu(menuContext,rest);return;}
  if(name==='/model'&&!rest&&rl){const selected=await rl.withOverlay(()=>modelMenu(menuContext));if(selected){model=selected.model;await store.writeSettings({defaultModel:model});print('Model: '+model);}return;}
  if(name==='/mcp'&&!rest&&rl)return mcpMenu(menuContext);
  if(name==='/setup'){if(!rl)throw Error('Setup needs an interactive terminal');return setup();}
  if(name==='/permissions'){
   if(rest){await setPermissions(rest);}
   return print('Permissions: '+(mode==='plan'?'read-only':permissions)+'. Auto allows bounded project source/text writes and exact location/time commands; other execution, external calls and protected files ask. Shells are not sandboxed.');
  }
  if(name==='/commands'){
   const rows=await store.records('events',{projectId:project.id,type:'shell_command'});
   if(!rest)return print(rows.slice(-20).map(r=>r.id+'  '+r.data.command+'  exit '+r.data.exitCode).join('\n')||'No saved shell receipts. Type !command to execute one locally.');
   const send=rest.startsWith('send '),id=send?rest.slice(5).trim():rest,row=rows.find(r=>r.id===id);
   if(!row)throw Error('Choose a receipt ID from /commands');
   if(send)return shareShellReceipt(shellContext,row);
   return print(JSON.stringify(row.data,null,2));
  }

  if(await cacheCommand(name,rest))return;
  if(await freeCommand(name,rest))return;
  if(name==='/motion'){if(rest){if(!['full','reduced','off'].includes(rest))throw Error('Choose full, reduced or off');await store.writeSettings({motion:rest});rl?.setMotion(rest);}return print('Motion: '+((await store.readSettings()).motion||rl?.motion||'off'));}
  if(name==='/login'&&(!rest||/^apex(?:\s|$)/.test(rest)))return accountControl.command('/account','login '+rest.replace(/^apex\s*/,''));
  if(name==='/logout'&&rest==='apex')return accountControl.command('/account','logout');
  if(await accountControl.command(name,rest))return;
  if(await remoteControl.command(name,rest))return;

  if(await extensionCommand(name,rest))return;

  if(await features.command(name,rest))return;

  if(name==='/providers'){

   const providers=await runtime.listProviders(),keys=await vault.status();

   return print(Object.entries(providers).map(([id,p])=>{const auth=keys.find(k=>k.provider===id);return `${id.padEnd(12)} ${p.name} · ${p.local?'local':auth?.environment?'environment key':auth?.saved?'saved key':'/login '+id} · ${p.baseURL||'set /endpoint '+id+' URL'}`;}).join('\n'));

  }

  if(name==='/endpoint'){

   const [id,url,...extra]=rest.split(/\s+/),providers=await runtime.listProviders();if(!Object.hasOwn(providers,id)||!url||extra.length)throw Error('Usage: /endpoint PROVIDER HTTPS_BASE_URL');

   const current=await store.readSettings();await store.writeSettings({providerEndpoints:{...current.providerEndpoints,[id]:validateBaseURL(url)}});runtime.invalidateModels();return print(`Saved ${id} endpoint. ${id.toUpperCase()}_BASE_URL in the environment takes precedence.`);

  }

  if(name==='/provider'){

   const [action,id,url,keyEnv,protocol,...extra]=rest.split(/\s+/),current=await store.readSettings(),custom={...current.providers};

   if(action==='add'&&id&&url&&keyEnv&&!extra.length)custom[id]=customProvider(id,url,keyEnv,protocol);

   else if(action==='remove'&&id&&!url){if(!Object.hasOwn(custom,id))throw Error('Only custom providers can be removed');if(model.startsWith(id+':'))throw Error('Select another model before removing its provider');delete custom[id];}

   else throw Error('Usage: /provider add ID HTTPS_BASE_URL API_KEY_ENV_NAME [openai-compatible|anthropic|responses|google], or /provider remove ID');

   await store.writeSettings({providers:custom});vault.configureProviders(providerKeyMap(providerCatalog(custom)));runtime.invalidateModels();return print(`Provider ${id} ${action==='add'?'saved':'removed'}. Saved credentials are retained separately.`);

  }

  if(name==='/pricing'){

   const [id,input,output,...extra]=rest.split(/\s+/),providers=await runtime.listProviders();

   if(!id?.includes(':')||!Object.hasOwn(providers,id.split(':')[0])||input===undefined||output===undefined||extra.length)throw Error('Usage: /pricing provider:model INPUT_USD_PER_M OUTPUT_USD_PER_M');

   const value={inputPerMillion:Number(input),outputPerMillion:Number(output),updatedAt:new Date().toISOString()};modelPrice(value);

   const current=await store.readSettings();await store.writeSettings({modelPrices:{...current.modelPrices,[id]:value}});runtime.invalidateModels();return print('Saved operator price estimate. Actual provider cost remains unknown unless reported by the API.');

  }

  if(name==='/plan'||name==='/build'||name==='/mode'){const value=name==='/mode'?rest:name.slice(1);if(value)await setMode(value);return print(`Mode: ${mode}${mode==='plan'?' (model actions are read-only)':' (edits require approval)'}`);}

  if(name==='/auth'){if(['codex','claude'].includes(rest))return native(rest,{status:true});return print(JSON.stringify({apiKeys:await vault.status(),native:'Use /auth codex or /auth claude for native login status; /login codex or /login claude to sign in.'},null,2));}

  if(name==='/codex'||name==='/claude')return native(name.slice(1),{prompt:rest});

  if(name==='/login'){

   if(['codex','claude'].includes(rest))return native(rest,{login:true});

   if(rest==='codex-api'){const key=process.env.OPENAI_API_KEY||await vault.get('openai');if(!key)throw Error('Save an OpenAI key with /login openai first');return native('codex',{apiLogin:true,apiKey:key});}

   const keys=providerKeyMap(await runtime.listProviders());

   if(!Object.hasOwn(keys,rest))throw Error('Choose /login codex, /login claude, or /login PROVIDER from /providers. Paste a key only at the hidden prompt.');

   if(!rl)throw Error('Saving a credential needs an interactive terminal');

   const key=(await rl.question(`Paste ${rest} API key. Input is hidden; Enter saves it.`,{secret:true})).trim();

   if(!key)return print('No credential saved.');

   await vault.set(rest,key);runtime.invalidateModels();print(`Saved ${rest} key with Windows account encryption. Environment variables take precedence.`);return;

  }

  if(name==='/logout'){

   if(['codex','claude'].includes(rest))return native(rest,{logout:true});

   await vault.remove(rest);return print(`Removed saved ${rest} key. An existing environment variable remains active until you remove it.`);

  }

  if(mode==='plan'&&((name==='/terminal'&&/^(new|send)(\s|$)/.test(rest))||name==='/shell'||name==='/team'||name==='/mcp'&&rest.startsWith('connect ')))throw Error('Plan mode blocks execution. Switch with /build first.');

  if(name==='/model'){if(rest){const [provider,...parts]=rest.split(':'),providers=await runtime.listProviders();if(!Object.hasOwn(providers,provider)||!parts.join(':'))throw Error('Use provider:MODEL from /providers');model=rest;await store.writeSettings({defaultModel:model});}return print('Model: '+(model||'not selected'));}

  if(name==='/models'){const providers=await runtime.listProviders(),models=await runtime.listModels(Object.hasOwn(providers,rest)?rest:undefined);return print(models.filter(m=>!rest||m.id.toLowerCase().includes(rest.toLowerCase())).map(m=>`${m.id} · ${m.inputPrice==null?'price unknown; configure /pricing':`$${(m.inputPrice*1e6).toFixed(3)}/M input, $${(m.outputPrice*1e6).toFixed(3)}/M output`}${m.priceSource?' (estimate)':''}`).join('\n')||'No matching models discovered. Login to that provider, or select its exact provider:model ID. Tool support depends on the selected model.');}

  if(name==='/new'){session=await store.createSession({projectId:project.id,title:rest||'Terminal chat'});return print('Session: '+session.id);}

  if(name==='/sessions'){return print((await store.listSessions(project.id)).map((s,i)=>`${i+1}. ${s.id}  ${s.title} (${s.messageCount} messages)`).join('\n')||'No saved chats.');}

  if(name==='/resume'){const rows=await store.listSessions(project.id),id=/^\d+$/.test(rest)?rows[Number(rest)-1]?.id:rest;if(!rows.some(s=>s.id===id))throw Error('Choose a chat from /sessions');session=await store.getSession(id);return print('Resumed '+session.title);}

  if(name==='/history'){return print((await store.getSession(session.id)).messages.map(m=>`${m.role}${m.agentId?' ['+m.agentId.slice(0,8)+']':''}: ${m.content}`).join('\n\n'));}

  if(name==='/usage'){const messages=(await store.getSession(session.id)).messages,usage=messages.filter(m=>m.usage&&!m.usage.inherited).map(m=>m.usage);return print(JSON.stringify({calls:usage.length,inputTokens:usage.every(u=>u.inputTokens!=null)?usage.reduce((a,u)=>a+u.inputTokens,0):null,outputTokens:usage.every(u=>u.outputTokens!=null)?usage.reduce((a,u)=>a+u.outputTokens,0):null,cost:usage.length&&usage.every(u=>u.cost!=null)?usage.reduce((a,u)=>a+u.cost,0):null},null,2));}

  if(name==='/project'){if(rest){project=await store.createProject({name:path.basename(path.resolve(rest)),path:path.resolve(rest)});session=await store.createSession({projectId:project.id,title:'Terminal chat'});}return print(project.path);}

  if(name==='/memory'){if(rest.startsWith('add '))await store.addMemory({projectId:project.id,text:rest.slice(4)});else if(rest.startsWith('delete '))await store.deleteMemory(rest.slice(7));return print((await store.listMemory(project.id)).map(m=>`${m.id}  ${m.text}`).join('\n')||'No saved notes.');}

  if(name==='/mcp'){if(rest.startsWith('add '))return print(JSON.stringify(await runtime.addMcp(JSON.parse(rest.slice(4))),null,2));if(rest.startsWith('remove '))return print(JSON.stringify(await runtime.removeMcp(rest.slice(7))));if(rest.startsWith('connect '))return print(JSON.stringify(await runtime.connectMcp({id:rest.slice(8),sessionId:session.id}),null,2));return print(JSON.stringify(await runtime.listMcp(),null,2));}

  if(name==='/agents')return print(JSON.stringify(await store.listAgents(project.id),null,2));

  if(name==='/team'){if(!rest)throw Error('Usage: /team goal');return chat(`Use delegate_team to propose a bounded team for this goal: ${rest}. Assign disjoint explicit file scopes and explain each role. Do not start before user approval.`);}

  if(name==='/multiline'){const lines=[];while(!closing){const next=await rl.question('… ');if(next==='.end')break;lines.push(next);}if(lines.length)return chat(lines.join('\n'));return;}

  if(name==='/terminal'){

   const [op,id,...words]=rest.split(/\s+/);

   if(op==='new'){const name=id||`shell-${shells.size+1}`;if(shells.has(name)||shells.size>=6)throw Error('Choose a unique name; maximum six shells');const shell=process.platform==='win32'?(process.env.COMSPEC||'cmd.exe'):(process.env.SHELL||'/bin/sh');const child=spawn(shell,[],{cwd:project.path,windowsHide:true,stdio:'pipe'});shells.set(name,child);for(const stream of [child.stdout,child.stderr])stream.on('data',d=>print(`[${name}] ${d.toString().trimEnd()}`));child.on('error',e=>print(`[${name}] ${e.message}`));child.on('exit',()=>shells.delete(name));return print(`Started ${name} (pipe shell; full-screen TUIs unsupported here)`);}

   if(op==='send'){const child=shells.get(id);if(!child)throw Error('Unknown terminal');child.stdin.write(words.join(' ')+(process.platform==='win32'?'\r\n':'\n'));return;}

   if(op==='close'){const child=shells.get(id);if(!child)throw Error('Unknown terminal');stopShell(child);shells.delete(id);return;}

   return print([...shells].map(([n,p])=>`${n} · PID ${p.pid}`).join('\n')||'No background shells.');

  }

  if(name==='/shell'){print('Type exit to return to APEX. Shell is not sandboxed.');rl.pause();try{await new Promise((resolve,reject)=>{const child=spawn(process.platform==='win32'?(process.env.COMSPEC||'cmd.exe'):(process.env.SHELL||'/bin/sh'),[],{cwd:project.path,stdio:'inherit'});child.once('exit',resolve);child.once('error',reject)});}finally{rl.resume();}return;}

  throw Error('Unknown command. Use /help.');

 }

 function stopShell(child){if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();}

 try{

  if(options.prompt!==undefined){await chat(options.prompt);return;}

  if(!rl)throw Error('Interactive --json requires -p "request".');

  await accountControl.start();rendered(headerLines(rl.width).join('\n'));

  print(fg(PALETTE.dim,`Session ${session.id} · /model to select a provider · Esc cancels\n`));
  if((await store.readSettings()).onboardingVersion<2||!(await store.readSettings()).onboardingVersion){
   try{await setup();}catch(error){if(closing)return;print('Setup incomplete: '+error.message+'. Saved choices are retained. /setup retries the guide.');}
  }
  if(options.continue){const next=await rl.dialog({title:'Resume project',description:session.title,items:[{value:'continue',label:'Continue chat'},{value:'handoff',label:'Inspect the project handoff first'}]});if(next==='handoff')await insightCommand.handoffMenu();}
  if(!model)print('First run: /setup guides provider, model, price and Plan mode. /collaborate walks through a two-person project.');

  while(!closing){

   const messages=(await store.getSession(session.id)).messages,usage=messages.filter(m=>m.usage&&!m.usage.inherited).map(m=>m.usage);

   const tokens=usage.length&&usage.every(u=>u.inputTokens!=null&&u.outputTokens!=null)?usage.reduce((n,u)=>n+u.inputTokens+u.outputTokens,0):null;

   const cost=usage.length&&usage.every(u=>u.cost!=null)?'$'+usage.reduce((n,u)=>n+u.cost,0).toFixed(4):'cost unknown';

   rl.footer={cache:latestCache(messages,model),cacheVisible:(await store.readSettings()).cacheTimer!==false,cwd:project.path,model:(model||'select /model')+(tokens!=null?` · ${tokens} tokens · ${cost}`:'')};

   if(rl){rl.chatTabs=groupControl.label();rl.setChatChannel(groupControl.channel());}
   await refreshDashboard();
   let line;try{line=(await rl.question('',{history:true})).trim();}catch{break;}

   if(!line)continue;
   try{
    if(line.startsWith('/')&&!rl.lastSubmission?.pasted)await command(line);
    else if(line.startsWith('!')){
     if(personalTurns.size||groupControl.activeCount)throw Error('Finish or cancel active work before entering a local shell command');
     if(rl.lastSubmission?.pasted&&!await shellContext.confirm('Run this pasted shell command locally? Shells are not sandboxed.')){print('Command not executed or sent to the model.');continue;}
     await shellTurn(shellContext,line.slice(1));
    }else if(!await groupControl.submit(line)){const task=chat(line).catch(error=>print('APEX: '+error.message));personalTasks.add(task);task.finally(()=>personalTasks.delete(task));}
   }catch(error){print('APEX: '+error.message);}

  }

 }finally{closing=true;await groupControl?.close();for(const id of personalTurns.keys())await runtime.cancel({sessionId:id});for(const child of shells.values())stopShell(child);features.close();await accountControl.close();await remoteControl.close();await runtime.close();await Promise.allSettled([...personalTasks]);await store.flush();rl?.close();process.removeListener('SIGINT',interrupt);}

}

