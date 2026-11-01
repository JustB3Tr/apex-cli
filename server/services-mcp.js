import {realpath} from 'node:fs/promises';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {createStore} from './store.js';
import {integrations} from './integrations.js';
import {scrub} from './safe-content.js';
export async function servicesMcpMain(args){
 const options={};for(let i=0;i<args.length;i+=2){if(!['--home','--project','--root'].includes(args[i])||!args[i+1])throw Error('services-mcp --home PATH --project ID --root PATH');options[args[i].slice(2)]=args[i+1];}
 if(!options.home||!options.project||!options.root)throw Error('Explicit home/project/root required');const {store}=await createStore(options.home),project=await store.getProject(options.project);
 if((await realpath(project.path)).toLowerCase()!==(await realpath(options.root)).toLowerCase())throw Error('Integration project/root mismatch');
 const services=integrations(store),server=new McpServer({name:'apex-services',version:'0.11.0'}),answer=value=>({content:[{type:'text',text:scrub(JSON.stringify(value))}]});
 server.registerTool('integration_status',{description:'Inspect user-connected GitHub/Vercel targets. No login, network or credential values.',inputSchema:{}},async()=>answer(await services.status(project.id)));
 server.registerTool('github_read',{description:'Read the user-connected repository, issues or PRs via official gh. No fallback repository.',inputSchema:{action:z.enum(['repo','issues','prs'])}},async({action})=>answer(await services.github(project.id,action)));
 server.registerTool('github_create_issue',{description:'Publish an issue using the owner CLI account. Requires exact confirmTarget and harness user approval.',inputSchema:{confirmTarget:z.string().min(3).max(200),title:z.string().min(1).max(250),body:z.string().min(1).max(10000)}},async input=>answer(await services.github(project.id,'issue-create',input)));
 server.registerTool('github_create_draft_pr',{description:'Publish a draft PR from an explicitly pushed head/base; no automatic Git push, fork or merge. Harness approval required.',inputSchema:{confirmTarget:z.string().min(3).max(200),title:z.string().min(1).max(250),body:z.string().min(1).max(10000),head:z.string().min(1).max(200),base:z.string().min(1).max(200)}},async input=>answer(await services.github(project.id,'pr-create',input)));
 server.registerTool('vercel_read',{description:'Verify and inspect the exact user-linked Vercel project/team using official CLI. No linking/login.',inputSchema:{action:z.enum(['inspect','deployments'])}},async({action})=>answer(await services.vercel(project.id,action)));
 server.registerTool('vercel_deploy_preview',{description:'Uploads and builds project files on Vercel; may consume resources. Exact projectId@orgId plus harness approval required. No production alias.',inputSchema:{confirmTarget:z.string().min(3).max(300)}},async input=>answer(await services.vercel(project.id,'preview',input)));
 await server.connect(new StdioServerTransport());
}
