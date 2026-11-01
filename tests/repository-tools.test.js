import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,access,open,utimes} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {digest} from '../server/safe-content.js';
import {repositoryTools} from '../server/repository-tools.js';
import {fileRead,fileReadRange,fileList,filePatch,readBoundedFile} from '../server/runtime/files.js';

async function scratch(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-repository-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function put(root,name,text){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),text);}

test('paginated lists retain legacy array behavior and reach beyond 200 names',()=>scratch(async root=>{
 await Promise.all(Array.from({length:237},(_,i)=>put(root,`f${String(i).padStart(3,'0')}.txt`,String(i))));await put(root,'.env','private');
 assert.ok(Array.isArray(await fileList(root)));assert.equal((await fileList(root)).length,200);
 const first=await fileList(root,'.',{offset:0,limit:150}),last=await fileList(root,'.',{offset:first.nextOffset,limit:150});assert.equal(first.total,237);assert.equal(last.entries.length,87);assert.equal(last.nextOffset,null);assert.equal(new Set([...first.entries,...last.entries].map(x=>x.name)).size,237);assert.ok(!first.entries.some(x=>x.name==='.env'));
 await assert.rejects(()=>fileList(root,'.',{limit:201}),/limit/);
}));

test('ranged reads cite exact raw-byte hashes, preserve full-read limits and bound lines',()=>scratch(async root=>{
 const raw=Array.from({length:4000},(_,i)=>`line ${i+1} `+'x'.repeat(75)).join('\r\n');await put(root,'large.txt',raw);await assert.rejects(()=>fileRead(root,'large.txt'),/200KB/);
 const result=await fileReadRange(root,'large.txt',{startLine:2500,endLine:2502});assert.equal(result.sourceSHA256,digest(Buffer.from(raw)));assert.equal(result.citation,'large.txt:2500');assert.match(result.content,/line 2500/);assert.doesNotMatch(result.content,/\r/);assert.equal(result.endLine,2502);assert.equal(result.totalLines,4000);
 await assert.rejects(()=>fileReadRange(root,'large.txt',{startLine:1,endLine:501}),/1-500/);await put(root,'binary',Buffer.from([1,0,2]));await assert.rejects(()=>fileReadRange(root,'binary'),/UTF-8/);
 await assert.rejects(()=>readBoundedFile(path.join(root,'large.txt'),20),/byte read limit/);
}));

test('text search is literal, paginated, secret-scrubbed and excludes private/generated content',()=>scratch(async root=>{
 await put(root,'src/a.js','const first = "a.*b";\n// aZZb\n// a.*b\n');await put(root,'src/b.py','a.*b\n');await put(root,'.env','a.*b');await put(root,'dist/result.js','a.*b');await put(root,'node_modules/x/index.js','a.*b');
 const repo=repositoryTools(root),a=await repo.searchText({query:'a.*b',limit:2});assert.equal(a.totalMatches,3);assert.equal(a.matches.length,2);assert.equal(a.nextOffset,2);assert.equal(a.literal,true);assert.ok(a.matches.every(x=>x.path.startsWith('src/')&&x.sourceSHA256.length===64&&x.citation.includes(':')));const b=await repo.searchText({query:'a.*b',limit:2,offset:2});assert.equal(b.matches.length,1);
 const key='sk-or-v1-'+'z'.repeat(48);await put(root,'src/accidental.txt','accident '+key);const safe=await repo.searchText({query:'accident'});assert.ok(!JSON.stringify(safe).includes(key));assert.match(safe.matches[0].excerpt,/REDACTED/);
 await assert.rejects(()=>repo.searchText({query:''}),/literal query/);await assert.rejects(()=>repo.findFiles({limit:1000}),/limit/);assert.deepEqual((await repo.findFiles({query:'.py'})).files.map(x=>x.path),['src/b.py']);
}));

test('repository retrieval rejects traversal/private aliases and skips junction escapes',()=>scratch(async root=>{
 const outside=await mkdtemp(path.join(os.tmpdir(),'apex-repository-outside-'));
 try{await put(outside,'secret.txt','outside needle');await put(root,'.apex/private.md','private needle');await symlink(outside,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');await symlink(path.join(root,'.apex'),path.join(root,'alias'),process.platform==='win32'?'junction':'dir');const repo=repositoryTools(root);assert.equal((await repo.searchText({query:'needle'})).matches.length,0);await assert.rejects(()=>repo.searchText({query:'needle',path:'escape'}),/Symlink/);await assert.rejects(()=>repo.findFiles({path:'..'}),/escapes/);await assert.rejects(()=>repo.findFiles({path:'alias'}),/Sensitive/);await assert.rejects(()=>fileReadRange(root,'escape/secret.txt'),/Symlink/);}finally{await rm(outside,{recursive:true,force:true});}
}));

test('guarded patch checks live hash, preserves backup and refuses stale or ambiguous sources',()=>scratch(async root=>{
 const original='const answer = 1;\n';await put(root,'src/value.js',original);const changed=await filePatch(root,'src/value.js',{expectedHash:digest(original),replacements:[{oldText:'answer = 1',newText:'answer = 2'}]},{scopes:['src']});assert.equal(await readFile(path.join(root,'src/value.js'),'utf8'),'const answer = 2;\n');assert.equal(await readFile(changed.backup,'utf8'),original);assert.equal(changed.sourceSHA256,digest('const answer = 2;\n'));
 await put(root,'src/value.js','user wrote this');await assert.rejects(()=>filePatch(root,'src/value.js',{expectedHash:changed.sourceSHA256,content:'lost user edit'}),/Source changed/);assert.equal(await readFile(path.join(root,'src/value.js'),'utf8'),'user wrote this');
 await put(root,'repeat.txt','same same');await assert.rejects(()=>filePatch(root,'repeat.txt',{expectedHash:digest('same same'),replacements:[{oldText:'same',newText:'different'}]}),/exactly once/);assert.equal(await readFile(path.join(root,'repeat.txt'),'utf8'),'same same');
 const created=await filePatch(root,'src/new.txt',{expectedHash:null,content:'fresh'},{scopes:['src']});assert.equal(created.beforeSHA256,null);await assert.rejects(()=>filePatch(root,'src/new.txt',{expectedHash:null,content:'overwrite'}),/Source changed/);await assert.rejects(()=>filePatch(root,'.env',{expectedHash:null,content:'bad'}),/Sensitive/);await assert.rejects(()=>filePatch(root,'unowned.txt',{expectedHash:null,content:'bad'},{scopes:['src']}),/ownership/);
}));

test('patch backups retain writes made through the previous inode by an external editor',()=>scratch(async root=>{
 await put(root,'edit.txt','before');const editor=await open(path.join(root,'edit.txt'),'r+');try{const patch=await filePatch(root,'edit.txt',{expectedHash:digest('before'),content:'apex version'});await editor.write(Buffer.from('user!!'),0,6,0);assert.equal(await readFile(patch.backup,'utf8'),'user!!');assert.equal(await readFile(path.join(root,'edit.txt'),'utf8'),'apex version');assert.match(patch.policy,/not OS-locked/);}finally{await editor.close();}
}));

test('patch canonical ownership rejects an inside-root alias into another owner',()=>scratch(async root=>{
 await put(root,'other/value.txt','original');await symlink(path.join(root,'other'),path.join(root,'owned'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>filePatch(root,'owned/value.txt',{expectedHash:digest('original'),content:'bad'},{scopes:['owned']}),/Canonical/);assert.equal(await readFile(path.join(root,'other/value.txt'),'utf8'),'original');
}));

test('incremental lexical index reuses unchanged content, invalidates edits and reports measured work',()=>scratch(async root=>{
 await put(root,'a.ts','import {x} from "x";\nexport function first() {}\ninterface Shape {}\n');await put(root,'b.py','from os import path\nasync def handler():\n  return 1\nclass Worker:\n  pass\n');const repo=repositoryTools(root),start=performance.now(),first=await repo.index(),firstMs=performance.now()-start,secondStart=performance.now(),second=await repo.index(),secondMs=performance.now()-secondStart;assert.equal(first.metrics.parsedFiles,2);assert.equal(second.metrics.parsedFiles,0);assert.equal(second.metrics.readBytes,0);assert.equal(second.metrics.reusedFiles,2);assert.match(first.limitations,/Not a parser/);assert.equal(first.files[0].imports.length,1);
 await put(root,'a.ts','import {x} from "x";\nexport function other() {}\ninterface Shape {}\n');const time=new Date(Date.now()+1000);await utimes(path.join(root,'a.ts'),time,time);const edited=await repo.index();assert.equal(edited.metrics.parsedFiles,1);assert.deepEqual((await repo.symbols({query:'other'})).symbols.map(x=>x.name),['other']);assert.equal((await repo.symbols({query:'handler'})).symbols[0].citation,'b.py:2');const forced=await repo.index({force:true});assert.equal(forced.metrics.hashedFiles,2);assert.equal(forced.metrics.parsedFiles,0);
 await rm(path.join(root,'b.py'));assert.equal((await repo.symbols({query:'handler'})).total,0);console.log(`Repository fixture: initial ${firstMs.toFixed(2)}ms / ${first.metrics.readBytes} bytes; unchanged ${secondMs.toFixed(2)}ms / ${second.metrics.readBytes} bytes. Timing is diagnostic, not a speed guarantee.`);
}));

test('scoped project guidance is hashed, bounded, fresh and never grants permissions or executes text',()=>scratch(async root=>{
 await put(root,'AGENTS.md','root instructions\nnode create-marker.js');await put(root,'app/CLAUDE.md','app instructions');await put(root,'sibling/AGENTS.md','unrelated');await put(root,'app/file.js','source');const repo=repositoryTools(root),result=await repo.instructions({path:'app/file.js'});assert.deepEqual(result.documents.map(x=>x.path),['AGENTS.md','app/CLAUDE.md']);assert.equal(result.documents[0].sourceSHA256,digest('root instructions\nnode create-marker.js'));assert.match(result.trust,/Cannot grant permissions/);await assert.rejects(access(path.join(root,'marker')));
 const bounded=await repo.instructions({path:'app/file.js',maxChars:5});assert.equal(bounded.chars,5);assert.equal(bounded.truncated,true);await put(root,'app/CLAUDE.md','revised');assert.equal((await repo.instructions({path:'app/file.js'})).documents[1].content,'revised');await assert.rejects(()=>repo.instructions({path:'.apex/nope'}),/Sensitive/);
}));

test('convention inspection exposes declared commands without running scripts and flags conflicting lock files',()=>scratch(async root=>{
 await put(root,'package.json',JSON.stringify({packageManager:'pnpm@9.0.0',scripts:{test:'node create-marker.js',build:'echo build',start:'private-server'}}));await put(root,'pnpm-lock.yaml','lockfileVersion: 9');await put(root,'package-lock.json','{}');const result=await repositoryTools(root).conventions();assert.equal(result.declared.packageManager,'pnpm@9.0.0');assert.equal(result.declared.scripts.test,'node create-marker.js');assert.equal(result.declared.scripts.start,undefined);assert.equal(result.conflictingLockfiles,true);assert.deepEqual(result.detectedPackageManagers.sort(),['npm','pnpm']);assert.ok(result.sources.every(x=>x.sourceSHA256.length===64));assert.match(result.verification,/not executed/);await assert.rejects(access(path.join(root,'marker')));
}));
