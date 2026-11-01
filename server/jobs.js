import {randomUUID} from 'node:crypto';
const live=pid=>{if(!pid)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
const at=()=>new Date().toISOString();
const used=request=>request.state==='settled'?request.cost:request.state==='rejected'||request.state==='not_sent'?0:request.amount;
export function jobs(store){
 return {
  async create({projectId,sessionId,goal,model,maxUSD=1,mode='plan',...rest}){
   if(!['plan','build'].includes(mode))throw Error('Mode must be plan or build');if(!Number.isFinite(maxUSD)||maxUSD<0||maxUSD>1000)throw Error('Job budget must be finite, between 0 and 1000 USD');await store.getProject(projectId);
   return store.saveRecord('jobs',{...rest,id:randomUUID(),projectId,sessionId,goal:String(goal||'Task').slice(0,100000),model,maxUSD,mode,status:'queued',createdAt:at()});
  },
  async reserve(jobId,{id=randomUUID(),amount,model,agentId,local=false}){
   if(!Number.isFinite(amount)||amount<0)throw Error('A finite request reservation is required');
   return store.transaction(s=>{const job=s.jobs.find(j=>j.id===jobId);if(!job)throw Error('Job not found');if(['waiting_human','cancelled','needs_attention','over_budget','complete','failed'].includes(job.status))throw Error('Job is '+job.status);if(s.requests.some(r=>r.id===id))throw Error('Request already reserved; do not replay it');const committed=s.requests.filter(r=>r.jobId===jobId).reduce((sum,r)=>sum+used(r),0);if(committed+amount>job.maxUSD+1e-10)throw Error('Shared job budget reached before next request');const row={id,jobId,model,agentId,local,amount,state:'reserved',createdAt:at()};s.requests.push(row);job.status='running';job.activePid=process.pid;job.updatedAt=at();return row;});
  },
  async sent(id){return store.transaction(s=>{const r=s.requests.find(r=>r.id===id);if(!r||r.state!=='reserved')throw Error('Request cannot be sent again');r.state='sent';r.sentAt=at();return r;});},
  async settle(id,cost,{rejected=false,notSent=false,reason}={}){
   return store.transaction(s=>{const r=s.requests.find(r=>r.id===id);if(!r)throw Error('Request not found');if(['settled','estimated','rejected','not_sent'].includes(r.state))return r;
    if(cost!==null&&cost!==undefined&&(!Number.isFinite(cost)||cost<0))throw Error('Invalid billed cost');
    r.state=rejected?'rejected':notSent?'not_sent':cost!=null?'settled':'estimated';r.cost=cost??null;r.reason=reason;r.completedAt=at();const job=s.jobs.find(j=>j.id===r.jobId);if(job&&s.requests.filter(q=>q.jobId===job.id).reduce((n,q)=>n+used(q),0)>job.maxUSD+1e-10)job.status='over_budget';return r;});
  },
  async unknown(id,reason){return store.transaction(s=>{const r=s.requests.find(r=>r.id===id);if(!r)return;r.state='unknown';r.reason=String(reason).slice(0,300);r.completedAt=at();const job=s.jobs.find(j=>j.id===r.jobId);if(job)job.status='needs_attention';return r;});},
  async summary(id){const job=await store.record('jobs',id);if(!job)throw Error('Job not found');const requests=await store.records('requests',{jobId:id});return {...job,requests,billedUSD:requests.filter(r=>r.state==='settled').reduce((n,r)=>n+r.cost,0),heldUSD:requests.filter(r=>!['settled','rejected','not_sent'].includes(r.state)).reduce((n,r)=>n+r.amount,0),committedUSD:requests.reduce((n,r)=>n+used(r),0)};},
  async finish(id,status='complete',result){return store.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job)throw Error('Job not found');if(!['waiting_human','needs_attention','over_budget','cancelled'].includes(job.status))job.status=status;job.activePid=null;job.result=result;job.updatedAt=at();return job;});},
  async cancel(id){return store.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job)throw Error('Job not found');job.status='cancelled';job.updatedAt=at();return job;});},
  async resume(id){return store.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job)throw Error('Job not found');if(job.status==='waiting_human')throw Error('Use /attention to answer and explicitly resume parked work');if(job.status==='complete'||job.status==='running'&&live(job.workerPid||job.activePid))throw Error('Completed or running job cannot be resumed');if(job.workerPid){try{process.kill(job.workerPid,0);throw Error('Worker is still alive');}catch(e){if(e.code!=='ESRCH')throw e;}}if(s.requests.some(r=>r.jobId===id&&['unknown','sent','reserved'].includes(r.state)))throw Error('Unresolved request; reconcile its billing before resuming. No replay performed.');job.status='queued';return job;});},
  async reconcile(requestId,cost){if(!Number.isFinite(cost)||cost<0)throw Error('Supply the actual reconciled cost');return store.transaction(s=>{const r=s.requests.find(r=>r.id===requestId);if(!r||!['unknown','sent','reserved','estimated'].includes(r.state))throw Error('No unresolved request with that ID');r.state='settled';r.cost=cost;r.reconciledAt=at();return r;});}
 };
}
