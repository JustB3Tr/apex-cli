import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import {terminalText} from './output.js';

// Line-oriented, escape-free fallback for SSH, screen readers and TERM=dumb.
// Secret entry fails closed because this interface cannot safely hide OS echo.
export class PlainTerminalUI extends EventEmitter{
 constructor(input,output){super();this.input=input;this.output=output;this.footer={};this.width=80;this.motion='off';this.queue=[];this.plain=true;this.reader=createInterface({input,terminal:false,crlfDelay:Infinity});this.reader.on('line',text=>{if(this.active){const a=this.active;this.active=null;this.lastSubmission={pasted:a.history&&text.startsWith('!')};a.resolve(text);}else if(this.queue.length<30)this.queue.push(text);});this.reader.on('close',()=>{this.ended=true;const a=this.active;this.active=null;a?.reject(Error('Input closed'));});this.reader.on('SIGINT',()=>this.emit('SIGINT'));}
 write(value=''){this.output.write(terminalText(String(value))+'\n');}
 async question(prompt='',{secret=false,history=false}={}){if(secret)throw Error('Hidden credential input is unavailable in plain mode. Use your provider environment variable or a normal interactive terminal.');if(this.active)throw Error('Another prompt is active');this.output.write(terminalText(prompt||'APEX > '));if(this.queue.length){const text=this.queue.shift();this.lastSubmission={pasted:history&&text.startsWith('!')};return text;}if(this.ended)throw Error('Input closed');return new Promise((resolve,reject)=>{this.active={resolve,reject,history};});}
 async withOverlay(fn){if(this.overlayDepth)return fn();const saved=this.active;this.active=null;this.overlayDepth=1;try{return await fn();}finally{this.overlayDepth=0;this.active=saved;if(saved)this.output.write('APEX > ');}}
 async dialog({title,description='',items,input=false,secret=false,allowCustom=false}={}){if(!this.overlayDepth)return this.withOverlay(()=>this.dialog({title,description,items,input,secret,allowCustom}));this.write(title||'APEX');if(description)this.write(description);if(input)return this.question('> ',{secret});for(const [i,row] of (items||[]).entries())this.write(`${i+1}. ${row.label}${row.description?' · '+row.description:''}`);const answer=await this.question('Number, or Enter to cancel: ');if(!answer.trim())return null;const selected=items?.[Number(answer)-1]||items?.find(row=>row.value===answer);if(selected)return selected.value;if(allowCustom)return answer;this.write('Choose a listed number.');return null;}
 async vaultGraph(graph){this.write(JSON.stringify(graph,null,2));return null;}
 setMotion(){this.motion='off';}setActivity(label){if(label!==this.activity){this.activity=label;this.write('[ '+label+' ]');}}
 setLiveResponse(){}setChatChannel(id){this.chatChannel=id;}render(){}refreshFooter(){}startWorking(){this.started=Date.now();}stopWorking(){this.started=null;}pause(){this.reader.pause();}resume(){this.reader.resume();}
 async celebrate({title,detail}){this.write(title+(detail?'\n'+detail:''));}
 close(){if(this.stopped)return;this.stopped=true;this.reader.close();}
}
