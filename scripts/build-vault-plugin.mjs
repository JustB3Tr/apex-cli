import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file=new URL('../obsidian-plugin/main.js',import.meta.url),coreFile=new URL('../obsidian-plugin/graph-core.cjs',import.meta.url),raw=await readFile(coreFile,'utf8'),core=raw.replace(/\r\n/g,'\n'),hash=createHash('sha256').update(core).digest('hex');if(raw!==core)await writeFile(coreFile,core);
const block='// BEGIN GENERATED APEX GRAPH CORE '+hash+'\nconst APEX_GRAPH_CORE=(()=>{\n'+core.replace('module.exports=','return ')+'\n})();\n// END GENERATED APEX GRAPH CORE\n';
let main=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');main=main.replace(/\/\/ BEGIN GENERATED APEX GRAPH CORE[\s\S]*?\/\/ END GENERATED APEX GRAPH CORE\r?\n/,'');await writeFile(file,block+main);console.log('Bundled portable graph core '+hash.slice(0,12));
