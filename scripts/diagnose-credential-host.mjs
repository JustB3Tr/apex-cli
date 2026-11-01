import assert from 'node:assert/strict';
import {protect,runCredentialCommand} from '../cli/credentials.js';
console.log(JSON.stringify({node:process.version,platform:process.platform}));
const at=Date.now(),options={run:(f,a,o)=>runCredentialCommand(f,a,{...o,timeoutMs:7000})};
const encrypted=await protect('fixture-only',false,options);
assert.notEqual(encrypted,'fixture-only');
assert.equal(await protect(encrypted,true,options),'fixture-only');
console.log(JSON.stringify({actualAdapter:'passed',encryptionAndDecryption:true,ms:Date.now()-at,realCredentialsUsed:false}));
