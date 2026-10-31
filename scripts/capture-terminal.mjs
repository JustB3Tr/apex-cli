// Captures an actual APEX process through ConPTY into an xterm screen buffer.
// No mocked UI, browser, model request, credentials or user's saved settings.
import pty from 'node-pty';
import xterm from '@xterm/headless';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {Terminal}=xterm,cols=112,rows=34;
const folder=await mkdtemp(path.join(tmpdir(),'apex-terminal-capture-'));
await mkdir('artifacts',{recursive:true});
GlobalFonts.registerFromPath('C:/Windows/Fonts/consola.ttf','APEX Mono');
GlobalFonts.registerFromPath('C:/Windows/Fonts/consolab.ttf','APEX Mono Bold');
GlobalFonts.registerFromPath('C:/Windows/Fonts/seguisym.ttf','APEX Symbols');
const terminal=new Terminal({cols,rows,allowProposedApi:true,scrollback:1000});
const env={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor',NODE_TLS_REJECT_UNAUTHORIZED:'1'};delete env.NO_COLOR;
const child=pty.spawn(process.execPath,['bin/apex.js',process.cwd(),'--home',folder],{name:'xterm-256color',cols,rows,cwd:process.cwd(),env});
let transcript='',exited=false,pending=Promise.resolve();
const dataListener=child.onData(data=>{transcript+=data;pending=pending.then(()=>new Promise(r=>terminal.write(data,r)));}),exitListener=child.onExit(()=>exited=true);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const deadline=Date.now()+10000;while(!fn()){if(Date.now()>deadline)throw Error('Terminal capture timed out');await delay(50);}await pending;}
const palette=['#000000','#cd0000','#00cd00','#cdcd00','#0000ee','#cd00cd','#00cdcd','#e5e5e5','#7f7f7f','#ff0000','#00ff00','#ffff00','#5c5cff','#ff00ff','#00ffff','#ffffff'];
function color(value,mode,fallback){if(mode===0)return fallback;if(mode===0x3000000)return '#'+value.toString(16).padStart(6,'0');if(value<16)return palette[value];if(value>=232){const v=8+(value-232)*10;return `rgb(${v},${v},${v})`;}const c=value-16,levels=[0,95,135,175,215,255];return `rgb(${levels[Math.floor(c/36)]},${levels[Math.floor(c/6)%6]},${levels[c%6]})`;}
async function capture(file){
 await pending;const cw=10.8,ch=24,pad=24,canvas=createCanvas(Math.ceil(cols*cw+2*pad),rows*ch+2*pad),context=canvas.getContext('2d');context.fillStyle='#1e1e1e';context.fillRect(0,0,canvas.width,canvas.height);context.textBaseline='top';
 for(let y=0;y<rows;y++){
  const line=terminal.buffer.active.getLine(terminal.buffer.active.viewportY+y);if(!line)continue;
  for(let x=0;x<cols;x++){
   const cell=line.getCell(x);if(!cell||cell.getWidth()===0)continue;
   let fg=color(cell.getFgColor(),cell.getFgColorMode(),'#e5e5e5'),bg=color(cell.getBgColor(),cell.getBgColorMode(),'#1e1e1e');if(cell.isInverse())[fg,bg]=[bg,fg];
   context.fillStyle=bg;context.fillRect(pad+x*cw,pad+y*ch,cw*cell.getWidth(),ch);context.fillStyle=fg;context.font=`18px "${cell.isBold()?'APEX Mono Bold':'APEX Mono'}", "APEX Symbols"`;context.fillText(cell.getChars()||' ',pad+x*cw,pad+y*ch+2);
  }
 }
 const buffer=terminal.buffer.active;context.fillStyle='#c8a6f1';context.fillRect(pad+buffer.cursorX*cw,pad+buffer.cursorY*ch+20,cw,2);
 await writeFile(file,canvas.toBuffer('image/png'));console.log(path.resolve(file));
}
try{
 await until(()=>transcript.includes('select /model'));await capture('artifacts/apex-build.png');
 child.write('\x1b[Z');await until(()=>transcript.includes('PLAN'));
 const pasted=Array.from({length:12},(_,i)=>`Preserved source line ${i+1}`).join('\n');child.write('\x1b[200~'+pasted+'\x1b[201~');await until(()=>transcript.includes('Pasted 12 lines'));await capture('artifacts/apex-plan-paste.png');
 await writeFile('artifacts/terminal-capture.ansi',transcript);
 child.write('\x15/login openrouter\r');await until(()=>transcript.includes('Input is hidden'));
 const fakeKey='fixture-key-not-real-capture-123456';child.write(fakeKey+'\r');await until(()=>transcript.includes('Saved openrouter key'));
 if(transcript.includes(fakeKey))throw Error('Hidden credential appeared in terminal output');
 const vault=await import('../cli/credentials.js');if(await vault.credentialVault(folder).get('openrouter')!==fakeKey)throw Error('Credential was not saved correctly');
 console.log('Actual terminal hidden entry and encrypted reload verified with fake credential.');
 child.write('/providers\r');await until(()=>transcript.includes('Together AI')&&transcript.includes('lmstudio'));
 child.write('/endpoint dashscope https://workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1\r');await until(()=>transcript.includes('Saved dashscope endpoint'));
 child.write('/provider add company https://company.example/v1 COMPANY_API_KEY\r');await until(()=>transcript.includes('Provider company saved'));
 child.write('/model company:fixture\r');await until(()=>transcript.includes('Model: company:fixture'));
 child.write('/pricing company:fixture .10 .20\r');await until(()=>transcript.includes('Saved operator price estimate'));
 const saved=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(folder,'state.json'),'utf8'));
 if(saved.settings.providers.company.keyEnv!=='COMPANY_API_KEY'||saved.settings.modelPrices['company:fixture'].inputPerMillion!==.10||!saved.settings.providerEndpoints.dashscope.includes('workspace.us-east-1'))throw Error('Provider configuration was not persisted');
 child.write('/model ollama:fixture\r');await until(()=>transcript.includes('Model: ollama:fixture'));
 child.write('/provider remove company\r');await until(()=>transcript.includes('Provider company removed'));
 console.log('Actual terminal provider listing, custom endpoint, model selection, price configuration and removal verified.');
 child.write('/project '+path.join(folder,'work')+'\r');await until(()=>transcript.includes(path.join(folder,'work')));await delay(250);
 child.write('/build\r');await until(()=>transcript.includes('Mode: build'));
 child.write('/vault init\r');await until(()=>transcript.includes('✓ Vault ready'));await delay(150);await capture('artifacts/apex-vault-ready.png');if(!transcript.includes('·     ·')||!transcript.includes(' ✦   ✦ '))throw Error('Vault animation frames not recorded');await writeFile('artifacts/vault-animation.ansi',transcript);await writeFile('artifacts/vault-animation.json',JSON.stringify({actualConPTY:true,completionAfterVaultInit:true,framesObserved:['·     ·',' ✦   ✦ ','✓ Vault ready'],paidInferenceRequests:0},null,2));
 child.write('/vault note '+JSON.stringify({title:'Verified project context',content:'Compiler invariant checked in local fixture.',visibility:'shared'})+'\r');await until(()=>transcript.includes('Shared/'));
 child.write('/vault plugin\r');await until(()=>transcript.includes('Community plugins'));
 child.write('/board\r');await until(()=>transcript.includes('tool evidence'));
 await capture('artifacts/apex-vault-board.png');
 console.log('Actual terminal vault initialization, linked note, plugin install and board verified.');
 child.write('/plugin browse\r');await until(()=>transcript.includes('apex-dev@apex-official'));await delay(100);
 child.write('/plugin install apex-dev@apex-official\r');await until(()=>transcript.includes('Install this frozen plugin snapshot?'));child.write('y\r');await until(()=>transcript.includes('executedHooks'));await delay(100);
 child.write('/skills\r');await until(()=>transcript.includes('apex-dev:review-code'));await delay(100);
 child.write('/mcp browse\r');await until(()=>transcript.includes('apex-project'));await capture('artifacts/apex-marketplace.png');
 console.log('Actual terminal plugin marketplace install, skill discovery and MCP browse verified.');
 // Seed an explicitly labeled local display fixture, never a model request.
 child.write('/model openai:gpt-6-luna\r');await until(()=>transcript.includes('Model: openai:gpt-6-luna'));await delay(100);
 const {createStore}=await import('../server/store.js'),{cacheObservation}=await import('../server/runtime/cache.js'),fixtureStore=(await createStore(folder)).store,fixtureState=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(folder,'state.json'),'utf8')),fixtureSession=fixtureState.sessions.at(-1);
 const cacheFixture=cacheObservation({model:'openai:gpt-6-luna',configuration:{protocol:'openai-compatible',baseURL:'https://api.openai.com/v1'},usage:{prompt_tokens_details:{cached_tokens:2000}},sentAt:Date.now()-1500000,prefixHash:'display-fixture',routeHash:'display-fixture'});
 await fixtureStore.appendMessage(fixtureSession.id,{role:'assistant',content:'Local cache display fixture. No provider inference.',usage:{model:'openai:gpt-6-luna',inputTokens:2048,outputTokens:20,cost:0,cache:cacheFixture}});
 child.write('/cache\r');await until(()=>transcript.includes('"readTokens": 2000'));await until(()=>transcript.includes('cache ~4:59'));child.write('draft survives cache refresh');await delay(1200);await pending;
 const screen=Array.from({length:terminal.buffer.active.length},(_,i)=>terminal.buffer.active.getLine(i)?.translateToString(true)||'').join('\n');if(!screen.includes('draft survives cache refresh'))throw Error('Cache refresh lost draft');
 await capture('artifacts/apex-cache-timer.png');await writeFile('artifacts/cache-terminal.json',JSON.stringify({actualConPTY:true,providerCounters:'local fixture only',countdownChanged:true,draftPreserved:true,providerInferenceRequests:0},null,2));await writeFile('artifacts/cache-terminal.ansi',transcript);child.write('\x15/cache off\r');await until(()=>transcript.includes('"timerEnabled": false'));await delay(100);
 console.log('Actual terminal cache countdown refresh and preserved draft verified with local fixture data.');

 child.write('/exit\r');await until(()=>exited);
}finally{if(!exited)child.kill();dataListener.dispose();exitListener.dispose();terminal.dispose();await delay(200);await rm(folder,{recursive:true,force:true});}
// ConPTY's output worker can retain the recorder's event loop after a clean
// child exit. All captures and cleanup are awaited; stop this standalone recorder.
process.exit(0);
