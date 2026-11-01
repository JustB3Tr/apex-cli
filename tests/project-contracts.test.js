import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.js';
import {projectContracts,contractContext,contractMap} from '../server/project-contracts.js';
import {git} from '../server/git-project.js';
import {localVault} from '../server/vault.js';
import {projectContractCommands} from '../cli/project-contract-commands.js';

const pass='node -e "process.exit(0)"',fail='node -e "process.exit(7)"';
async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'apex-contracts-'));try{const {store}=await createStore(path.join(root,'state')),project=await store.createProject({name:'Producer',path:path.join(root,'producer')});await writeFile(path.join(project.path,'source.txt'),'initial\n');await git(project.path,['init']);await git(project.path,['add','source.txt']);await git(project.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']);await fn({root,store,project,api:projectContracts(store)});}finally{await rm(root,{recursive:true,force:true});}}
async function approved(api,projectId,{command=pass,visibility='private',title='Keep schema compatible'}={}){const r=await api.draftRequirement(projectId,{title,statement:'The producer and consumer must agree on version 1.',files:['source.txt'],checks:[{name:'Selected deterministic check',command}],visibility});await api.approve(projectId,r.id,r.hash);return r;}

test('requirement approvals bind the human owner and exact revision; drafts never become recalled policy',()=>fixture(async({store,project,api})=>{
 const r=await api.draftRequirement(project.id,{title:'Offline work',statement:'Must work offline',files:['source.txt'],checks:[],visibility:'shared'});assert.deepEqual(await contractContext(store,project.id,'offline',{shared:true}),[]);await assert.rejects(()=>api.approve(project.id,r.id,'stale'),/exact version/);await api.approve(project.id,r.id,r.hash);assert.equal((await contractContext(store,project.id,'offline',{shared:true}))[0].state,'unknown');
 const next=await api.draftRequirement(project.id,{statement:'Must work offline after initial setup'},{id:r.id,expectedHash:r.hash});assert.equal(next.version,2);assert.equal(next.history[0].status,'approved');assert.deepEqual(await contractContext(store,project.id,'offline',{shared:true}),[]);await assert.rejects(()=>api.approve(project.id,next.id,r.hash),/exact version/);
 const identity=await store.identity();await store.writeSettings({identity:{...identity,id:'different-person'}});await assert.rejects(()=>api.approve(project.id,next.id,next.hash),/owner/);await store.writeSettings({identity});await api.approve(project.id,next.id,next.hash);assert.equal((await api.inspect(project.id,next.id)).status,'approved');
}));

test('actual approved checks produce finite process receipts and stale evidence after source changes',()=>fixture(async({store,project,api})=>{
 const r=await approved(api,project.id);assert.equal((await api.status(project.id,r.id)).state,'unknown');await assert.rejects(()=>api.runCheck(project.id,r.id,r.hash,r.terms.checks[0].id),/explicit approval/);assert.equal((await store.records('events',{type:'contract_check'})).length,0);
 const observed=await api.runCheck(project.id,r.id,r.hash,r.terms.checks[0].id,{approved:true});assert.equal(observed.data.receipt.exitCode,0);assert.ok(observed.data.receipt.elapsedMs>=0);assert.equal((await api.status(project.id,r.id)).state,'current');await writeFile(path.join(project.path,'source.txt'),'changed\n');assert.equal((await api.status(project.id,r.id)).state,'stale');
 const changed=await api.draftRequirement(project.id,{statement:'Revised requirement'},{id:r.id,expectedHash:r.hash});await api.approve(project.id,changed.id,changed.hash);assert.equal((await api.status(project.id,changed.id)).state,'stale');
}));

test('failed checks and commands that change their declared inputs cannot claim current evidence',()=>fixture(async({project,api})=>{
 const r=await approved(api,project.id,{command:fail});await api.runCheck(project.id,r.id,r.hash,r.terms.checks[0].id,{approved:true});assert.equal((await api.status(project.id,r.id)).state,'failing');
 const mutating=await approved(api,project.id,{title:'Mutating check',command:'node -e "require(\'fs\').writeFileSync(\'source.txt\',\'changed\')"'});await api.runCheck(project.id,mutating.id,mutating.hash,mutating.terms.checks[0].id,{approved:true});assert.equal((await api.status(project.id,mutating.id)).state,'stale');
}));

test('orientation interview records remain editable and private unless explicitly approved shared',()=>fixture(async({store,project,api,root})=>{
 const vaultPath=path.join(root,'vault');await localVault(vaultPath).init();await store.updateProject(project.id,{vaultPath});const r=await api.draftOrientation(project.id,{purpose:'Helpers for volunteers',constraints:'Never lose offline edits',authority:'Maintainer reviews writes',unknowns:'Hosting still undecided',visibility:'private'});await api.approve(project.id,r.id,r.hash);assert.equal((await contractContext(store,project.id,'volunteers')).length,1);assert.equal((await contractContext(store,project.id,'volunteers',{shared:true})).length,0);assert.ok((await localVault(vaultPath).search('volunteers')).some(n=>n.file.startsWith('Private/')));
 const revised=await api.draftOrientation(project.id,{visibility:'shared'},{id:r.id,expectedHash:r.hash});await api.approve(project.id,revised.id,revised.hash);assert.equal((await contractContext(store,project.id,'volunteers',{shared:true}))[0].kind,'orientation');assert.ok((await localVault(vaultPath).search('volunteers',{visibility:'shared'})).length);
}));

test('cross-repository changes remain incomplete until each exact component passes and is accepted',()=>fixture(async({root,store,project,api})=>{
 const consumer=await store.createProject({name:'Consumer',path:path.join(root,'consumer')});await writeFile(path.join(consumer.path,'source.txt'),'initial\n');await git(consumer.path,['init']);await git(consumer.path,['add','source.txt']);await git(consumer.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','consumer']);const producerRequirement=await approved(api,project.id),consumerRequirement=await approved(api,consumer.id);const set=await api.changeset(project.id,{title:'API v1 rollout',contract:'Return {version:1}; consumer rejects other versions.',participants:[{projectId:project.id,role:'producer',requirementId:producerRequirement.id},{projectId:consumer.id,role:'consumer',requirementId:consumerRequirement.id}]});await api.approve(project.id,set.id,set.hash);
 await assert.rejects(()=>api.acceptParticipant(project.id,set.id,set.hash,project.id),/missing, stale or failing/);for(const [p,r] of [[project,producerRequirement],[consumer,consumerRequirement]])await api.runCheck(p.id,r.id,r.hash,r.terms.checks[0].id,{approved:true});await api.acceptParticipant(project.id,set.id,set.hash,project.id);let state=await api.changesetStatus(project.id,set.id);assert.equal(state.state,'incomplete');assert.equal(state.acceptedCount,1);await api.acceptParticipant(project.id,set.id,set.hash,consumer.id);assert.equal((await api.changesetStatus(project.id,set.id)).state,'accepted-all');
 await writeFile(path.join(consumer.path,'source.txt'),'changed');state=await api.changesetStatus(project.id,set.id);assert.equal(state.state,'incomplete');assert.equal(state.participants.find(p=>p.projectId===consumer.id).state,'stale');assert.equal(state.participants.find(p=>p.projectId===consumer.id).accepted,false);
}));

test('registered repository and owner boundaries reject arbitrary participant paths or forged acceptances',()=>fixture(async({root,store,project,api})=>{
 const first=await approved(api,project.id);await assert.rejects(()=>api.changeset(project.id,{title:'Invalid',contract:'test',participants:[{projectId:project.id,role:'producer',requirementId:first.id},{projectId:'C:/private',role:'consumer',requirementId:first.id}]}),/Project not found/);await assert.rejects(()=>api.draftRequirement(project.id,{title:'Private',statement:'No',files:['.env'],checks:[]}),/public literal/);await assert.rejects(()=>api.draftRequirement(project.id,{title:'Escape',statement:'No',files:['../elsewhere'],checks:[]}),/public literal/);
 const second=await store.createProject({name:'Consumer',path:path.join(root,'consumer')});await writeFile(path.join(second.path,'source.txt'),'copy');await git(second.path,['init']);await git(second.path,['add','source.txt']);await git(second.path,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','consumer']);const secondReq=await approved(api,second.id),set=await api.changeset(project.id,{title:'Other owner',contract:'v1',participants:[{projectId:project.id,role:'producer',requirementId:first.id},{projectId:second.id,role:'consumer',owner:'another-human',requirementId:secondReq.id}]});await api.approve(project.id,set.id,set.hash);await assert.rejects(()=>api.acceptParticipant(project.id,set.id,set.hash,second.id),/declared owner/);
}));

test('requirements and changesets supply typed graph nodes without inventing compliance',()=>fixture(async({store,project,api})=>{
 const r=await approved(api,project.id,{visibility:'shared'}),map=await contractMap(store,project.id,{shared:true});assert.ok(map.nodes.find(n=>n.kind==='requirement'&&n.metadata.state==='unknown'));assert.ok(map.nodes.find(n=>n.kind==='check'&&n.metadata.state==='unknown'));assert.ok(map.edges.find(e=>e.relation==='requires-check-of'));await api.runCheck(project.id,r.id,r.hash,r.terms.checks[0].id,{approved:true});assert.equal((await contractMap(store,project.id,{shared:true})).nodes.find(n=>n.kind==='requirement').metadata.state,'current');
}));

test('native teaching popup asks three focused questions, previews, approves and never contacts a model',()=>fixture(async({store,project,api})=>{
 const responses=['new','Volunteer coordinators','Never lose notes','Brady approves changes','', 'private',true,true],titles=[],ui={dialog:async spec=>{titles.push(spec.title);return responses.shift();}},command=projectContractCommands({store,project:()=>project,mode:()=> 'plan',print:()=>{},ui});assert.equal(await command.command('/teach',''),true);assert.ok(titles.includes('1 / 3 · Who is this project for?'));assert.ok(titles.includes('2 / 3 · What must not break?'));assert.ok(titles.includes('3 / 3 · Who gets the final say?'));assert.ok(titles.includes('Project orientation draft'));assert.equal((await api.list(project.id,'orientation'))[0].status,'approved');assert.equal((await store.records('requests')).length,0);
}));
