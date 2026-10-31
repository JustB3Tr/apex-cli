import {emitKeypressEvents} from 'node:readline';
import {EventEmitter} from 'node:events';
import {stripVTControlCharacters} from 'node:util';
import {terminalText} from './output.js';
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
  emitKeypressEvents(input);this.onKey=(text,key)=>this.key(text,key||{});this.onResize=()=>{if(this.active)this.render();};
  this.statusTimer=setInterval(()=>{if(this.active&&this.drawn&&this.footer.cache&&this.footer.cacheVisible!==false)this.refreshFooter();},1000);this.statusTimer.unref();
  input.on('keypress',this.onKey);output.on('resize',this.onResize);this.previousRaw=Boolean(input.isRaw);input.setRawMode?.(true);input.resume();output.write('\x1b[?2004h');
 }
 get width(){return Math.max(8,(this.output.columns||80)-1);}
 clear(){if(!this.drawn)return;this.output.write('\r'+(this.cursorRow?`\x1b[${this.cursorRow}A`:'')+'\x1b[J');this.drawn=false;this.cursorRow=0;}
 render(){
  if(!this.active)return;this.clear();const width=this.width,capacity=width-6,a=this.active;
  const display=this.display(a.text),before=this.display(graphemes(a.text).slice(0,a.cursor).join(''));
  const win=inputWindow(display,graphemes(before).length,capacity),border=s=>fg(PALETTE.gray,s),empty=border('│')+' '.repeat(width-2)+border('│');
  const label=bold(fg(this.mode==='plan'?PALETTE.cyan:PALETTE.purple,this.mode.toUpperCase()))+' '+fg(PALETTE.dim,a.secret?'hidden input':this.mode==='plan'?'read-only':'edits ask permission');
  const hint=fg(PALETTE.dim,'shift+tab switch mode'),gap=width-visibleWidth(label)-visibleWidth(hint)-2;
  const bar=fit(' '+label+(gap>1?' '.repeat(gap)+hint:''),width);
  const lines=[border('╭'+'─'.repeat(width-2)+'╮'),empty,border('│ > ')+win.text+' '.repeat(capacity-win.width)+border(' │'),empty,border('╰'+'─'.repeat(width-2)+'╯'),bar,footerLine(this.footer,width)];
  this.output.write(lines.join('\n')+`\x1b[4A\r\x1b[${4+win.cursor}C`);this.cursorRow=2;this.drawn=true;
 }
 refreshFooter(){if(!this.active||!this.drawn||this.stopped)return;this.output.write('\x1b7\x1b[4B\r\x1b[2K'+footerLine(this.footer,this.width)+'\x1b8');}
 display(text){if(this.active?.secret)return text?'[hidden input]':'';return graphemes(text).map(ch=>this.active?.pastes.get(ch)?.label??clean(ch)).join('');}
 expanded(){return graphemes(this.active.text).map(ch=>this.active.pastes.get(ch)?.text??ch).join('');}
 insert(text){const a=this.active,chars=graphemes(a.text),prefix=chars.slice(0,a.cursor).join('')+text;a.text=prefix+chars.slice(a.cursor).join('');a.cursor=graphemes(prefix).length;}
 insertPaste(text){
  const a=this.active;if(!a)return;
  text=stripVTControlCharacters(text).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
  if(!a.secret&&(text.includes('\n')||text.length>200)){
   const marker=String.fromCodePoint(0xf0000+(++this.pasteSerial%65534)),lines=text.split('\n').length;
   a.pastes.set(marker,{text,label:`[Pasted ${lines} lines #${this.pasteSerial}]`});this.insert(marker);
  }else this.insert(a.secret&&!a.preserveWhitespace?text.trim():text);
  this.render();
 }
 write(value='',{trusted=false}={}){
  this.clear();this.clearWorking();this.output.write((trusted?String(value):terminalText(value))+'\n');
  if(this.active)this.render();else if(this.timer)this.drawWorking();
 }
 async question(label='',{history=false,secret=false,preserveWhitespace=false}={}){
  if(this.stopped)throw Error('Terminal closed');if(this.active)throw Error('Another prompt is active');
  this.clearWorking();if(label)this.output.write(terminalText(label)+'\n');
  return new Promise((resolve,reject)=>{this.active={text:'',cursor:0,resolve,reject,history:history&&!secret,secret,preserveWhitespace,pastes:new Map(),index:this.history.length,draft:''};this.render();});
 }
 cancelQuestion(){const a=this.active;if(!a)return;this.clear();this.active=null;a.resolve('');}
 key(text,key){
  if(key.name==='paste-start'){this.pasting='';return;}
  if(key.name==='paste-end'){const pasted=this.pasting;this.pasting=undefined;if(pasted!==undefined)this.insertPaste(pasted);return;}
  if(this.pasting!==undefined){this.pasting+=key.sequence??text??'';return;}
  if(key.ctrl&&key.name==='c'){this.emit('SIGINT');return;}
  if(!this.active){if(key.name==='escape'){if(this.finishCelebration)this.finishCelebration();else this.emit('cancel');}return;}
  const a=this.active,chars=graphemes(a.text);
  if(a.secret&&key.name==='escape'){this.cancelQuestion();return;}
  if(key.name==='tab'&&key.shift){this.emit('mode');return;}
  if(key.name==='return'||key.name==='enter'){
   const answer=this.expanded(),display=this.display(a.text);this.lastSubmission={pasted:[...a.pastes.keys()].some(marker=>a.text.includes(marker))};this.clear();this.active=null;if(a.history&&answer.trim())this.history.push(answer);
   this.output.write(fg(PALETTE.gray,'> ')+(a.secret?'[credential hidden]':display)+'\n');a.resolve(answer);return;
  }
  if(key.ctrl&&key.name==='d'){if(!a.text)this.close();return;}
  if(key.name==='left')a.cursor=Math.max(0,a.cursor-1);
  else if(key.name==='right')a.cursor=Math.min(chars.length,a.cursor+1);
  else if(key.name==='home'||key.ctrl&&key.name==='a')a.cursor=0;
  else if(key.name==='end'||key.ctrl&&key.name==='e')a.cursor=chars.length;
  else if(key.name==='backspace'){if(a.cursor>0)chars.splice(--a.cursor,1);a.text=chars.join('');}
  else if(key.name==='delete'){chars.splice(a.cursor,1);a.text=chars.join('');}
  else if(key.ctrl&&key.name==='u'){a.text=chars.slice(a.cursor).join('');a.cursor=0;}
  else if(key.ctrl&&key.name==='k')a.text=chars.slice(0,a.cursor).join('');
  else if(key.ctrl&&key.name==='w'){const before=chars.slice(0,a.cursor).join('').replace(/\s*\S+\s*$/,'');a.text=before+chars.slice(a.cursor).join('');a.cursor=graphemes(before).length;}
  else if(a.history&&(key.name==='up'||key.name==='down')){
   if(a.index===this.history.length)a.draft=this.expanded();
   a.index=Math.max(0,Math.min(this.history.length,a.index+(key.name==='up'?-1:1)));
   a.text='';a.cursor=0;a.pastes.clear();this.insertPaste(this.history[a.index]??a.draft);
  }else if(text&&!key.ctrl&&!key.meta&&key.name!=='escape'&&key.name!=='tab'){
   if(text.includes('\n')||text.length>200)this.insertPaste(text);else this.insert(clean(text));
  }else return;
  this.render();
 }
 startWorking(){this.stopWorking();this.started=Date.now();this.activity=null;this.frame=0;if(this.motion!=='off'){this.timer=setInterval(()=>{this.frame++;if(!this.active)this.drawWorking();},this.motion==='full'?140:1000);this.timer.unref();}this.drawWorking();}
 setActivity(label){this.activity=clean(String(label)).slice(0,160);if(this.started&&!this.active)this.drawWorking();}
 setMotion(value){if(!['full','reduced','off'].includes(value))throw Error('Choose full, reduced or off');this.motion=process.env.TERM==='dumb'?'off':value;}
 clearWorking(){if(this.workingDrawn){this.output.write('\r\x1b[2K');this.workingDrawn=false;}}
 drawWorking(){if(this.active||this.stopped)return;this.clearWorking();const seconds=Math.floor((Date.now()-this.started)/1000);this.output.write(workingLine(this.activity||PHRASES[Math.floor(seconds/12)%PHRASES.length],seconds,this.width,this.frame,this.motion));this.workingDrawn=true;}
 stopWorking(){clearInterval(this.timer);this.timer=null;this.started=null;this.clearWorking();}
 async celebrate({title='Complete',detail=''}){
  if(this.stopped)return;if(this.active)throw Error('Cannot animate over an active prompt');this.stopWorking();
  if(this.motion==='full'&&this.output.isTTY!==false){await new Promise(resolve=>{let frame=0;const finish=()=>{clearInterval(this.celebrationTimer);this.celebrationTimer=null;this.finishCelebration=null;this.clearWorking();resolve();};this.finishCelebration=finish;const draw=()=>{if(this.stopped)return finish();this.clearWorking();this.output.write(completionLine(title,frame++,this.width));this.workingDrawn=true;if(frame>6)finish();};draw();this.celebrationTimer=setInterval(draw,90);});}
  if(!this.stopped)this.write('✓ '+clean(title)+(detail?'\n  '+clean(detail):''));
 }
 pause(){this.clear();this.stopWorking();this.output.write('\x1b[?2004l');this.input.setRawMode?.(false);this.input.pause();}
 resume(){this.input.setRawMode?.(true);this.input.resume();this.output.write('\x1b[?2004h');}
 close(){if(this.stopped)return;this.stopped=true;clearInterval(this.statusTimer);this.statusTimer=null;this.finishCelebration?.();this.stopWorking();this.clear();const a=this.active;this.active=null;a?.reject(Error('Terminal closed'));this.input.removeListener('keypress',this.onKey);this.output.removeListener('resize',this.onResize);this.output.write('\x1b[?2004l');this.input.setRawMode?.(this.previousRaw);this.input.pause();}
}
