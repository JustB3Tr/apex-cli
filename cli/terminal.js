import {emitKeypressEvents} from 'node:readline';
import {EventEmitter} from 'node:events';
import {stripVTControlCharacters} from 'node:util';
import {PassThrough} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';
import {terminalText} from './output.js';
import {graphRows} from './vault-graph-view.js';
import {fg,PALETTE,footerLine,workingLine,completionLine,PHRASES,fit,bold,visibleWidth} from './look.js';

const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export const graphemes=text=>Array.from(segments.segment(text),s=>s.segment);
export function cellWidth(text){
 return graphemes(stripVTControlCharacters(text)).reduce((n,ch)=>{
  const cp=ch.codePointAt(0);
  if(/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(ch))return n+2;
  return n+(cp>=0x1100&&(cp<=0x115f||cp>=0x2e80&&cp<=0xa4cf||cp>=0xac00&&cp<=0xd7a3||cp>=0xf900&&cp<=0xfaff||cp>=0xfe10&&cp<=0xfe6f||cp>=0xff00&&cp<=0xff60||cp>=0x20000)?2:1);
 },0);
}
export function inputWindow(text,cursor,capacity){
 const chars=graphemes(text);cursor=Math.max(0,Math.min(cursor,chars.length));let start=cursor,end=cursor,used=0;
 while(start>0&&used+cellWidth(chars[start-1])<=capacity-1)used+=cellWidth(chars[--start]);
 while(end<chars.length&&used+cellWidth(chars[end])<=capacity)used+=cellWidth(chars[end++]);
 return {text:chars.slice(start,end).join(''),cursor:cellWidth(chars.slice(start,cursor).join('')),width:used};
}
const clean=text=>stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g,' ');

/** Small inline terminal editor. It never starts a browser or hides scrollback. */
export class TerminalUI extends EventEmitter{
 constructor(input,output){
  super();this.input=input;this.output=output;this.history=[];this.footer={cwd:'',model:''};this.mode='build';this.cursorRow=0;this.active=null;this.stopped=false;this.pasteSerial=0;this.motion=process.env.APEX_REDUCED_MOTION==='1'?'reduced':process.env.TERM==='dumb'?'off':'full';this.frame=0;
  this.keyInput=new PassThrough();this.decoder=new StringDecoder('utf8');this.inputBuffer='';emitKeypressEvents(this.keyInput);this.onKey=(text,key)=>this.key(text,key||{});this.onResize=()=>{if(this.active)this.render();};
  this.onData=chunk=>{clearTimeout(this.inputTimer);this.inputBuffer+=typeof chunk==='string'?chunk:this.decoder.write(chunk);this.processInput();};input.on('data',this.onData);
  this.statusTimer=setInterval(()=>{if(this.active&&this.drawn&&this.footer.cache&&this.footer.cacheVisible!==false)this.refreshFooter();},1000);this.statusTimer.unref();
  this.keyInput.on('keypress',this.onKey);output.on('resize',this.onResize);this.previousRaw=Boolean(input.isRaw);input.setRawMode?.(true);input.resume();output.write('\x1b[?2004h');
 }
 processInput(){
  while(this.inputBuffer){
   if(this.stopped){this.inputBuffer='';return;}
   const pos=this.inputBuffer.indexOf('\x1b');if(pos<0){this.keyInput.write(this.inputBuffer);this.inputBuffer='';break;}
   if(pos>0){this.keyInput.write(this.inputBuffer.slice(0,pos));this.inputBuffer=this.inputBuffer.slice(pos);}
   const position=this.inputBuffer.match(/^\x1b\[\??(\d+);(\d+)R/),mouse=this.inputBuffer.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
   if(this.pasting===undefined&&position){this.inputScreenRow=Number(position[1]);this.inputBuffer=this.inputBuffer.slice(position[0].length);continue;}
   if(this.pasting===undefined&&mouse){this.handleMouse(Number(mouse[1]),Number(mouse[2]),Number(mouse[3]),mouse[4]==='m');this.inputBuffer=this.inputBuffer.slice(mouse[0].length);continue;}
   if(/^\x1b(?:\[(?:[<?]?[0-9;]*)?)?$/.test(this.inputBuffer)){this.inputTimer=setTimeout(()=>{this.keyInput.write(this.inputBuffer);this.inputBuffer='';},40);return;}
   // Send one escape sequence at a time so bracketed-paste state is current.
   const sequence=this.inputBuffer.match(/^\x1b\[[0-9;?]*[A-Za-z~]/)?.[0]||this.inputBuffer.slice(0,2);
   this.keyInput.write(sequence);this.inputBuffer=this.inputBuffer.slice(sequence.length);
  }
 }
 get width(){return Math.max(8,(this.output.columns||80)-1);}
 get expandedLayout(){return (this.output.columns||80)>=110&&(this.output.rows||24)>=32;}
 async withOverlay(fn){
  if(this.overlayDepth)return fn();
  if(this.active&&!this.active.history)throw Error('Another prompt is active');
  const suspended=this.active;this.clear();this.active=null;this.stopWorking();this.overlayDepth=1;
  this.output.write('\x1b[?1049h\x1b[2J');
  try{return await fn();}finally{this.clear();this.active=null;this.overlayDepth=0;this.mouse(false);this.output.write('\x1b[?1049l');if(!this.stopped){this.active=suspended;if(suspended)this.render();}else suspended?.reject(Error('Terminal closed'));}
 }
 async dialog({title,description='',items,input=false,secret=false,placeholder='',allowCustom=false}={}){
  if(!this.overlayDepth)return this.withOverlay(()=>this.dialog({title,description,items,input,secret,placeholder,allowCustom}));
  return this.question('',{secret,dialog:{title,description,items,input,placeholder,allowCustom}});
 }
 async vaultGraph(graph,state={}){if(!this.overlayDepth)return this.withOverlay(()=>this.vaultGraph(graph,state));return this.question('',{dialog:{graph,state:{selection:0,zoom:1,panX:0,panY:0,query:'',privateVisible:true,...state}}});}
 renderVaultGraph(){const a=this.active,g=graphRows(a.dialog.graph,{width:this.width,height:Math.max(12,(this.output.rows||24)-1),...a.dialog.state});this.graphSelection=g;this.dialogHits=[];this.output.write('\x1b[H\x1b[2J'+g.lines.join('\n'));this.drawn=false;this.mouse(false);}
 dialogItems(){const a=this.active;if(!a?.dialog?.items)return [];const terms=a.text.toLowerCase().split(/\s+/).filter(Boolean);return a.dialog.items.filter(item=>terms.every(term=>(item.label+' '+(item.description||'')).toLowerCase().includes(term)));}
 mouse(enabled){if(this.mouseEnabled===enabled)return;this.mouseEnabled=enabled;this.output.write(enabled?'\x1b[?1000h\x1b[?1006h':'\x1b[?1000l\x1b[?1006l');}
 renderDialog(){
  const a=this.active,d=a.dialog,w=Math.min(76,this.width),inner=Math.max(1,w-4),items=this.dialogItems(),selected=Math.min(a.selection||0,Math.max(0,items.length-1));a.selection=selected;
  const count=Math.max(1,Math.min(7,(this.output.rows||24)-10)),start=Math.max(0,selected-count+1),rows=items.slice(start,start+count);
  const lines=[bold(fg(PALETTE.purple,clean(d.title))),...(d.description?[fg(PALETTE.dim,clean(d.description))]:[]),'',fg(PALETTE.cyan,(d.items?'Search: ':'> '))+(a.secret?(a.text?'[hidden]':''):clean(a.text)||fg(PALETTE.dim,d.placeholder)),...(d.items?['',...rows.map((item,i)=>(start+i===selected?fg(PALETTE.purple,'› '):'  ')+clean(item.label)+(item.description?fg(PALETTE.dim,' · '+clean(item.description)):'')),...(!items.length?[fg(PALETTE.dim,d.allowCustom?'Enter uses this exact ID':'No matches')]:[])]:[]),'',fg(PALETTE.dim,d.items?'↑↓ choose · Enter select · Esc back':'Enter continue · Esc back')];
  const top=Math.max(1,Math.floor(((this.output.rows||24)-lines.length-2)/2)),left=Math.max(1,Math.floor(((this.output.columns||80)-w)/2)+1),border=s=>fg(PALETTE.gray,s),box=[border('╭'+'─'.repeat(w-2)+'╮'),...lines.map(line=>border('│ ')+fit(line,inner)+' '.repeat(Math.max(0,inner-visibleWidth(fit(line,inner))))+border(' │')),border('╰'+'─'.repeat(w-2)+'╯')];
  this.output.write('\x1b[2J'+box.map((line,i)=>`\x1b[${top+i};${left}H`+line).join(''));
  const inputIndex=d.description?3:2;this.output.write(`\x1b[${top+inputIndex+1};${Math.min(left+w-3,left+2+(d.items?8:2)+cellWidth(a.secret?'':a.text))}H`);
  this.dialogHits=rows.map((item,i)=>({row:top+inputIndex+3+i,item}));this.mouse(Boolean(d.items));this.drawn=false;
 }
 finishDialog(value){const a=this.active;this.active=null;this.mouse(false);a.resolve(value);}
 handleMouse(button,x,y,release=false){
  if(button!==0||release)return;
  if(this.active?.dialog){const hit=this.dialogHits?.find(h=>h.row===y);if(hit)this.finishDialog(hit.item.value);return;}
  if(this.active?.history&&this.chatTabs&&this.inputScreenRow&&this.inputScreenRow+4===y){this.emit('tabs');return;}
  if(this.active?.history&&this.expandedLayout&&this.inputScreenRow){const hit=this.dashboardHits?.find(h=>this.inputScreenRow+h.offset===y);if(hit)this.emit('mcp',hit.id);}
 }
 suggestions(){const a=this.active;if(!a?.history||a.secret||a.dismissed||!/^\/[^\s]*$/.test(a.text))return [];return (this.commands||[]).filter(c=>c.command.startsWith(a.text.toLowerCase())).slice(0,6);}
 clear(){if(!this.drawn)return;this.output.write('\r'+(this.cursorRow?`\x1b[${this.cursorRow}A`:'')+'\x1b[J');this.drawn=false;this.cursorRow=0;}
 render(){
  if(this.active?.dialog?.graph){this.renderVaultGraph();return;}
  if(this.active?.dialog){this.renderDialog();return;}
  if(!this.active)return;this.clear();const width=this.width,capacity=width-6,a=this.active;
  const shell=a.history&&a.text.startsWith('!'),visible=shell?a.text.slice(1):a.text;
  const display=this.display(visible),before=this.display(graphemes(a.text).slice(shell?1:0,a.cursor).join(''));
  const win=inputWindow(display,graphemes(before).length,capacity),border=s=>fg(PALETTE.gray,s),empty=border('│')+' '.repeat(width-2)+border('│');
  const label=bold(fg(this.mode==='plan'?PALETTE.cyan:PALETTE.purple,shell?'SHELL':this.mode.toUpperCase()))+' '+fg(PALETTE.dim,a.secret?'hidden input':shell?'local execution':`permissions: ${this.mode==='plan'?'read-only':this.permissions||'ask'}`);
  const hint=fg(PALETTE.dim,'ctrl+p permissions · shift+tab mode'),gap=width-visibleWidth(label)-visibleWidth(hint)-2;
  const bar=fit(' '+label+(gap>1?' '.repeat(gap)+hint:''),width);
  const suggestions=this.suggestions();a.selection=Math.min(a.selection||0,Math.max(0,suggestions.length-1));
  const menu=suggestions.map((c,i)=>fit((i===a.selection?' > ':'   ')+c.command+'  '+c.description,width));
  const dashboard=this.expandedLayout&&a.history?this.dashboard||[]:[];
  const tabLines=a.history&&this.chatTabs?[fit(' '+terminalText(this.chatTabs),width)]:[];
  const progress=a.history&&this.started?[fit(' '+terminalText(this.activity||'Working'),width)]:[];
  const preview=a.history&&this.liveText?[fit(' '+terminalText(this.liveText).slice(-Math.max(10,width-3)),width)]:[];
  const lines=[border('╭'+'─'.repeat(width-2)+'╮'),empty,border(shell?'│ ! ':'│ > ')+win.text+' '.repeat(capacity-win.width)+border(' │'),empty,border('╰'+'─'.repeat(width-2)+'╯'),bar,...tabLines,...menu,...progress,...preview,...dashboard.map(d=>fit(' '+terminalText(d.text),width)),footerLine(this.footer,width)];
  this.dashboardHits=dashboard.flatMap((d,i)=>d.id?[{id:d.id,offset:4+tabLines.length+menu.length+progress.length+preview.length+i}]:[]);
  this.footerOffset=lines.length-3;this.output.write(lines.join('\n')+`\x1b[${this.footerOffset}A\r\x1b[${4+win.cursor}C`);this.cursorRow=2;this.drawn=true;this.mouse(Boolean(this.dashboardHits.length||tabLines.length));if(this.dashboardHits.length||tabLines.length)this.output.write('\x1b[6n');
 }
 refreshFooter(){if(!this.active||this.active.dialog||!this.drawn||this.stopped)return;this.output.write(`\x1b7\x1b[${this.footerOffset||4}B\r\x1b[2K`+footerLine(this.footer,this.width)+'\x1b8');}
 display(text){if(this.active?.secret)return text?'[hidden input]':'';return graphemes(text).map(ch=>this.active?.pastes.get(ch)?.label??clean(ch)).join('');}
 expanded(){return graphemes(this.active.text).map(ch=>this.active.pastes.get(ch)?.text??ch).join('');}
 insert(text){const a=this.active,chars=graphemes(a.text),prefix=chars.slice(0,a.cursor).join('')+text;a.text=prefix+chars.slice(a.cursor).join('');a.cursor=graphemes(prefix).length;}
 insertPaste(text,{recall=false}={}){
  const a=this.active;if(!a)return;
  text=stripVTControlCharacters(text).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
  if(a.history&&!a.text&&text.startsWith('!')){this.insert('!');text=text.slice(1);}
  if(!text){this.render();return;}
  if(!a.secret&&(a.history&&!recall||text.includes('\n')||text.length>200)){
   const marker=String.fromCodePoint(0xf0000+(++this.pasteSerial%65534)),lines=text.split('\n').length;
   a.pastes.set(marker,{text,label:`[Pasted ${lines} lines #${this.pasteSerial}]`});this.insert(marker);
  }else this.insert(a.secret&&!a.preserveWhitespace?text.trim():text);
  this.render();
 }
 write(value='',{trusted=false}={}){
  this.clear();this.clearWorking();this.output.write((trusted?String(value):terminalText(value))+'\n');
  if(this.active)this.render();else if(this.timer)this.drawWorking();
 }
 setChatChannel(id){
  if(this.chatChannel===id)return;
  this.chatChannels||=new Map();const a=this.active;
  if(this.chatChannel)this.chatChannels.set(this.chatChannel,{history:this.history,draft:a?.history?{text:a.text,cursor:a.cursor,pastes:new Map(a.pastes)}:null});
  this.chatChannel=id;const saved=this.chatChannels.get(id);this.history=saved?.history||[];
  if(a?.history){Object.assign(a,saved?.draft||{text:'',cursor:0,pastes:new Map()});a.index=this.history.length;a.draft='';a.selection=0;this.render();}
 }
 async question(label='',{history=false,secret=false,preserveWhitespace=false,dialog}={}){
  if(this.stopped)throw Error('Terminal closed');if(this.active)throw Error('Another prompt is active');
  this.clearWorking();if(label)this.output.write(terminalText(label)+'\n');
  return new Promise((resolve,reject)=>{this.active={text:'',cursor:0,resolve,reject,history:history&&!secret,secret,preserveWhitespace,dialog,pastes:new Map(),index:this.history.length,draft:''};this.render();});
 }
 cancelQuestion(){const a=this.active;if(!a)return;this.clear();this.active=null;a.resolve('');}
 key(text,key){
  if(this.pasting!==undefined&&key.name!=='paste-end'){this.pasting+=key.sequence??text??'';return;}
  const position=key.sequence?.match(/^\x1b\[(\d+);(\d+)R$/);if(position){this.inputScreenRow=Number(position[1]);return;}
  if(key.sequence==='\x1b[<'){this.mouseSequence='';return;}
  if(this.mouseSequence!==undefined){this.mouseSequence+=key.sequence??text??'';const m=this.mouseSequence.match(/^(\d+);(\d+);(\d+)([Mm])$/);if(m){this.mouseSequence=undefined;this.handleMouse(Number(m[1]),Number(m[2]),Number(m[3]),m[4]==='m');}else if(this.mouseSequence.length>64)this.mouseSequence=undefined;return;}
  if(key.name==='paste-start'){this.pasting='';return;}
  if(key.name==='paste-end'){const pasted=this.pasting;this.pasting=undefined;if(pasted!==undefined)this.insertPaste(pasted);return;}
  if(this.pasting!==undefined){this.pasting+=key.sequence??text??'';return;}
  if(key.ctrl&&key.name==='c'){this.emit('SIGINT');return;}
  if(!this.active){if(key.name==='escape'){if(this.finishCelebration)this.finishCelebration();else this.emit('cancel');}return;}
  const a=this.active,chars=graphemes(a.text),shell=a.history&&a.text.startsWith('!'),start=shell?1:0;
  if(a.dialog?.graph){const s=a.dialog.state,selected=this.graphSelection?.selected;if(key.name==='escape'){this.finishDialog(null);return;}if(['return','enter'].includes(key.name)){this.finishDialog({node:selected,state:s});return;}if(key.ctrl&&key.name==='p')s.privateVisible=!s.privateVisible;else if(key.name==='down'||key.name==='tab'&&!key.shift)s.selection=(s.selection+1)%Math.max(1,this.graphSelection.candidates.length);else if(key.name==='up'||key.name==='tab'&&key.shift)s.selection=(s.selection-1+this.graphSelection.candidates.length)%Math.max(1,this.graphSelection.candidates.length);else if(text==='+')s.zoom=Math.min(8,s.zoom*1.2);else if(text==='-')s.zoom=Math.max(.3,s.zoom/1.2);else if(text==='0'){s.zoom=1;s.panX=s.panY=0;}else if(key.meta&&['w','a','s','d'].includes(key.name)){s.panX+=key.name==='a'?-80:key.name==='d'?80:0;s.panY+=key.name==='w'?-80:key.name==='s'?80:0;}else if(key.name==='backspace'){s.query=s.query.slice(0,-1);s.selection=0;}else if(text&&!key.ctrl&&!key.meta){s.query+=clean(text);s.query=s.query.slice(0,100);s.selection=0;}this.render();return;}
  if(a.dialog){
   const items=this.dialogItems();
   if(key.name==='escape'){this.finishDialog(null);return;}
   if(['up','down'].includes(key.name)&&a.dialog.items){a.selection=((a.selection||0)+(key.name==='up'?-1:1)+Math.max(1,items.length))%Math.max(1,items.length);this.render();return;}
   if(['return','enter'].includes(key.name)){if(!a.dialog.items)this.finishDialog(this.expanded()||a.dialog.placeholder||'');else if(items.length)this.finishDialog(items[a.selection||0].value);else if(a.dialog.allowCustom&&a.text.trim())this.finishDialog(a.text.trim());return;}
   if(key.name==='tab')return;
  }
  if(a.history&&key.ctrl&&key.name==='g'){this.emit('tabs');return;}
  if(a.history&&key.name==='f4'){this.emit('mcp');return;}
  if(a.history&&key.ctrl&&key.name==='p'){this.emit('permissions');return;}
  const suggestions=this.suggestions();
  if(suggestions.length&&['up','down'].includes(key.name)){a.selection=((a.selection||0)+(key.name==='up'?-1:1)+suggestions.length)%suggestions.length;this.render();return;}
  if(suggestions.length&&(key.name==='tab'&&!key.shift||['return','enter'].includes(key.name)&&!suggestions.some(c=>c.command===a.text))){a.text=suggestions[a.selection||0].command;a.cursor=graphemes(a.text).length;a.dismissed=true;this.render();return;}
  if(a.history&&key.name==='escape'){if(suggestions.length){a.dismissed=true;}else if(a.text.startsWith('!')){a.text='';a.cursor=0;}else if(!a.text)this.emit('cancel');this.render();return;}
  if(a.secret&&key.name==='escape'){this.cancelQuestion();return;}
  if(key.name==='tab'&&key.shift){this.emit('mode');return;}
  if(key.name==='return'||key.name==='enter'){
   const answer=this.expanded(),display=this.display(shell?a.text.slice(1):a.text);this.lastSubmission={pasted:[...a.pastes.keys()].some(marker=>a.text.includes(marker))};this.clear();this.active=null;if(a.history&&answer.trim())this.history.push(answer);
   this.output.write(fg(PALETTE.gray,shell?'! ':'> ')+(a.secret?'[credential hidden]':display)+'\n');a.resolve(answer);return;
  }
  if(key.ctrl&&key.name==='d'){if(!a.text)this.close();return;}
  if(key.name==='left')a.cursor=Math.max(start,a.cursor-1);
  else if(key.name==='right')a.cursor=Math.min(chars.length,a.cursor+1);
  else if(key.name==='home'||key.ctrl&&key.name==='a')a.cursor=start;
  else if(key.name==='end'||key.ctrl&&key.name==='e')a.cursor=chars.length;
  else if(key.name==='backspace'){if(a.cursor>0)chars.splice(--a.cursor,1);a.text=chars.join('');}
  else if(key.name==='delete'){chars.splice(a.cursor,1);a.text=chars.join('');}
  else if(key.ctrl&&key.name==='u'){a.text=(shell?'!':'')+chars.slice(a.cursor).join('');a.cursor=start;}
  else if(key.ctrl&&key.name==='k')a.text=chars.slice(0,a.cursor).join('');
  else if(key.ctrl&&key.name==='w'){const before=chars.slice(start,a.cursor).join('').replace(/\s*\S+\s*$/,'');a.text=(shell?'!':'')+before+chars.slice(a.cursor).join('');a.cursor=start+graphemes(before).length;}
  else if(a.history&&(key.name==='up'||key.name==='down')){
   if(a.index===this.history.length)a.draft=this.expanded();
   a.index=Math.max(0,Math.min(this.history.length,a.index+(key.name==='up'?-1:1)));
   a.text='';a.cursor=0;a.pastes.clear();this.insertPaste(this.history[a.index]??a.draft,{recall:true});
  }else if(text&&!key.ctrl&&!key.meta&&key.name!=='escape'&&key.name!=='tab'){
   if(text.includes('\n')||text.length>200)this.insertPaste(text);else this.insert(clean(text));
  }else return;
  a.dismissed=false;a.selection=0;this.render();
 }
 startWorking(){this.stopWorking();this.started=Date.now();this.activity=null;this.frame=0;if(this.motion!=='off'){this.timer=setInterval(()=>{this.frame++;if(!this.active)this.drawWorking();},this.motion==='full'?140:1000);this.timer.unref();}this.drawWorking();}
 setLiveResponse(text){this.liveText=String(text||'').slice(-1200);this.scheduleProgress();}
 scheduleProgress(){if(this.progressTimer||this.stopped)return;this.progressTimer=setTimeout(()=>{this.progressTimer=null;if(this.active?.history)this.render();else if(this.started)this.drawWorking();},60);this.progressTimer.unref();}
 setActivity(label){this.activity=clean(String(label)).slice(0,160);this.scheduleProgress();}
 setMotion(value){if(!['full','reduced','off'].includes(value))throw Error('Choose full, reduced or off');this.motion=process.env.TERM==='dumb'?'off':value;}
 clearWorking(){if(this.workingDrawn){this.output.write('\r\x1b[J');this.workingDrawn=false;}}
 drawWorking(){if(this.active||this.stopped)return;this.clearWorking();const seconds=Math.floor((Date.now()-this.started)/1000),dashboard=this.expandedLayout?(this.dashboard||[]):[];this.output.write(workingLine(this.activity||PHRASES[Math.floor(seconds/12)%PHRASES.length],seconds,this.width,this.frame,this.motion)+(dashboard.length?'\n'+dashboard.map(d=>fit(terminalText(d.text),this.width)).join('\n')+`\x1b[${dashboard.length}A\r`:''));this.workingDrawn=true;}
 stopWorking(){clearInterval(this.timer);this.timer=null;this.started=null;this.clearWorking();}
 async celebrate({title='Complete',detail=''}){
  if(this.stopped)return;if(this.active)throw Error('Cannot animate over an active prompt');this.stopWorking();
  if(this.motion==='full'&&this.output.isTTY!==false){await new Promise(resolve=>{let frame=0;const finish=()=>{clearInterval(this.celebrationTimer);this.celebrationTimer=null;this.finishCelebration=null;this.clearWorking();resolve();};this.finishCelebration=finish;const draw=()=>{if(this.stopped)return finish();this.clearWorking();this.output.write(completionLine(title,frame++,this.width));this.workingDrawn=true;if(frame>6)finish();};draw();this.celebrationTimer=setInterval(draw,90);});}
  if(!this.stopped)this.write('✓ '+clean(title)+(detail?'\n  '+clean(detail):''));
 }
 pause(){this.clear();this.stopWorking();this.mouse(false);this.output.write('\x1b[?2004l');this.input.setRawMode?.(false);this.input.pause();}
 resume(){this.input.setRawMode?.(true);this.input.resume();this.output.write('\x1b[?2004h');}
 close(){if(this.stopped)return;this.stopped=true;clearTimeout(this.progressTimer);clearInterval(this.statusTimer);clearTimeout(this.inputTimer);this.statusTimer=null;this.finishCelebration?.();this.stopWorking();this.clear();this.mouse(false);const a=this.active;this.active=null;a?.reject(Error('Terminal closed'));this.input.removeListener('data',this.onData);this.keyInput.removeListener('keypress',this.onKey);this.keyInput.destroy();this.output.removeListener('resize',this.onResize);this.output.write('\x1b[?2004l');this.input.setRawMode?.(this.previousRaw);this.input.pause();}
}
