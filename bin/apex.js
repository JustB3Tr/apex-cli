#!/usr/bin/env node
process.env.NODE_TLS_REJECT_UNAUTHORIZED="1";
import {run} from "../cli/main.js";
import {terminalText} from '../cli/output.js';
const action=process.argv[2]==='cloud'?import('../cli/account-commands.js').then(m=>m.cloudMain(process.argv.slice(3))):['login','signup','logout','sync'].includes(process.argv[2])?import('../cli/account-commands.js').then(m=>m.accountMain(process.argv.slice(2))):process.argv[2]==='remote'?import('../cli/remote-commands.js').then(m=>m.remoteMain(process.argv.slice(3))):process.argv[2]==='mcp-server'?import('../server/project-mcp.js').then(m=>m.projectMcpMain(process.argv.slice(3))):process.argv[2]==='hub'?import('../server/hub.js').then(m=>m.hubMain(process.argv.slice(3))):process.argv[2]==='worker'?import('../server/worker.js').then(m=>m.workerMain(process.argv.slice(3))):run();
action.catch(error=>{console.error(terminalText(`APEX: ${error.message}`));process.exitCode=1});
