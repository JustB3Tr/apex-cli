export const EFFORT_LEVELS=['auto','low','medium','high','xhigh','max'];
export function effortControl({effort='auto',provider,configuration={},pricing={}}){
 if(!EFFORT_LEVELS.includes(effort))throw Error('Invalid effort setting');
 if(effort==='auto')return {effort,native:'provider default',payload:{},instruction:''};
 const instruction=`\nUser-selected effort: ${effort}. ${effort==='low'?'Prefer a direct solution and minimal necessary checks.':effort==='medium'?'Use proportionate planning and verification.':'Plan carefully, check important assumptions and verify the result within the existing tool, output and spending limits.'} Keep private reasoning private; give useful conclusions and evidence.`;
 if(configuration.sponsored)return {effort,native:'prompt guidance only (sponsored limits)',payload:{},instruction};
 if(provider==='openrouter'&&pricing.supportedParameters?.some(p=>['reasoning','reasoning_effort'].includes(p)))return {effort,native:'OpenRouter reasoning.effort',payload:{reasoning:{effort}},instruction};
 if(configuration.protocol==='responses')return {effort,native:'Responses reasoning.effort (model dependent)',payload:{reasoning:{effort}},instruction};
 return {effort,native:'prompt guidance only',payload:{},instruction};
}
