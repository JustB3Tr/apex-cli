import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {TerminalUI,inputWindow,cellWidth} from '../cli/terminal.js';
import {headerLines,workingLine,completionLine,footerLine,visibleWidth} from '../cli/look.js';

test('APEX branding, footer and activity fit narrow and wide terminals',()=>{
 for(let width=8;width<=160;width++){
  const lines=[...headerLines(width),workingLine('Working on your request…',73,width),footerLine({cwd:'C:/projects/apex-cli',model:'openrouter:provider/model'},width),footerLine({cwd:'C:/projects/'.repeat(15),model:'openai:gpt-6-luna',cache:{reported:true,readTokens:100,windows:[{expiresAt:Date.now()+300000}]}},width)];
  for(const line of lines)assert.ok(visibleWidth(line)<=width,`width ${width}`);
 }
 const header=headerLines(100).join('\n');assert.match(stripVTControlCharacters(header),/Welcome to APEX/);assert.doesNotMatch(header,/ANUS|free models/);
});

test('activity and completion animate within width, honor reduced motion and close cleanly',async()=>{
 const oldTerm=process.env.TERM;process.env.TERM='xterm-256color';
 for(let width=8;width<140;width++)for(let frame=0;frame<8;frame++){assert.ok(visibleWidth(workingLine('Waiting for model',61,width,frame,'full'))<=width);assert.ok(visibleWidth(completionLine('Vault ready',frame,width))<=width);}
 const input=new PassThrough(),output=new PassThrough();output.columns=80;input.setRawMode=()=>{};let text='';output.on('data',b=>text+=b);const ui=new TerminalUI(input,output);
 try{ui.setMotion('full');ui.startWorking();ui.setActivity('Running list_files');await new Promise(r=>setTimeout(r,170));assert.match(text,/Running list_files/);assert.ok(ui.frame>0);ui.stopWorking();await ui.celebrate({title:'Vault ready',detail:'fixture vault'});assert.match(text,/✓ Vault ready/);assert.equal(ui.celebrationTimer,null);
 ui.setMotion('reduced');const before=Date.now();await ui.celebrate({title:'Reduced completion'});assert.ok(Date.now()-before<100);ui.setMotion('off');ui.startWorking();assert.equal(ui.timer,null);ui.stopWorking();
 const secret=ui.question('Master password',{secret:true,preserveWhitespace:true});ui.insertPaste('  fixture password  ');ui.key('',{name:'return'});assert.equal(await secret,'  fixture password  ');assert.ok(!text.includes('fixture password'));
 ui.setMotion('full');const animation=ui.celebrate({title:'Closing'});ui.close();await animation;assert.equal(ui.celebrationTimer,null);
 }finally{ui.close();input.destroy();output.destroy();}
});
test('long, wide and combined input preserves cursor and terminal width',()=>{
 for(const text of ['a'.repeat(300),'你好世界🙂abc','e\u0301👩‍💻 project'])for(let capacity=4;capacity<30;capacity++){
  const length=Array.from(new Intl.Segmenter().segment(text)).length;
  for(let cursor=0;cursor<=length;cursor++){const win=inputWindow(text,cursor,capacity);assert.ok(win.width<=capacity);assert.ok(win.cursor<=capacity);assert.equal(cellWidth(win.text),win.width);}
 }
});
test('terminal input edits, recalls history, survives async output, cancels and restores raw mode',async()=>{
 const input=new PassThrough(),output=new PassThrough();let result='';output.on('data',b=>result+=b);output.columns=70;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value;};
 const ui=new TerminalUI(input,output);ui.footer={cwd:'fixture',model:'offline'};
 try{
  const answer=ui.question('',{history:true});ui.key('hello',{});ui.key('',{name:'left'});ui.key('',{name:'backspace'});ui.key('p',{});
  ui.write('background shell output');ui.key('',{name:'return'});assert.equal(await answer,'helpo');
  const second=ui.question('',{history:true});ui.key('',{name:'up'});ui.key('',{name:'home'});ui.key('X',{});ui.key('',{name:'return'});assert.equal(await second,'Xhelpo');
  const unicode=ui.question();ui.key('e',{});ui.key('\u0301',{});ui.key('👩',{});ui.key('\u200d',{});ui.key('💻',{});ui.key('',{name:'return'});assert.equal(await unicode,'e\u0301👩‍💻');
  let cancelled=false;ui.on('cancel',()=>cancelled=true);ui.startWorking();ui.key('',{name:'escape'});assert.equal(cancelled,true);ui.stopWorking();
  const approval=ui.question('Allow?');ui.cancelQuestion();assert.equal(await approval,'');
  assert.match(result,/╭─/);assert.match(result,/background shell output/);assert.match(result,/Working on your request/);
  const closing=ui.question();ui.close();await assert.rejects(closing,/closed/);assert.equal(input.isRaw,false);
 }finally{ui.close();input.destroy();output.destroy();}
});
test('NO_COLOR disables decorative color codes',async()=>{
 const before=process.env.NO_COLOR;process.env.NO_COLOR='1';try{assert.equal(headerLines(100).join(''),stripVTControlCharacters(headerLines(100).join('')));}finally{if(before===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=before;}
});
test('multiline bracketed paste collapses, preserves all lines, and never submits during paste',async()=>{
 const input=new PassThrough(),output=new PassThrough();let rendered='';output.on('data',b=>rendered+=b);output.columns=90;input.setRawMode=()=>{};const ui=new TerminalUI(input,output);
 try{
  const answer=ui.question('',{history:true});let submitted=false;answer.then(()=>submitted=true);
  input.write('\x1b[200~first line\nsecond line\nthird line\x1b[201~');await new Promise(r=>setImmediate(r));
  assert.equal(submitted,false);assert.match(rendered,/Pasted 3 lines/);assert.ok(!rendered.includes('second line'));
  ui.key('',{name:'return'});assert.equal(await answer,'first line\nsecond line\nthird line');
  const recall=ui.question('',{history:true});ui.key('',{name:'up'});ui.key('',{name:'return'});assert.equal(await recall,'first line\nsecond line\nthird line');
  let toggled=false;ui.on('mode',()=>toggled=true);const prompt=ui.question();ui.key('',{name:'tab',shift:true});assert.equal(toggled,true);ui.cancelQuestion();await prompt;
 }finally{ui.close();input.destroy();output.destroy();}
});
test('hidden API entry never renders or records the credential, including pasted input',async()=>{
 const input=new PassThrough(),output=new PassThrough();let rendered='';output.on('data',b=>rendered+=b);output.columns=80;input.setRawMode=()=>{};const ui=new TerminalUI(input,output),key='not-real-key-fixture-678901';
 try{const answer=ui.question('API key',{secret:true,history:true});ui.insertPaste(key);assert.ok(!rendered.includes(key));ui.key('',{name:'return'});assert.equal(await answer,key);assert.ok(!rendered.includes(key));assert.deepEqual(ui.history,[]);}finally{ui.close();input.destroy();output.destroy();}
});
