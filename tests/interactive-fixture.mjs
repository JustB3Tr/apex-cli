// Offline manual PTY fixture. No external requests or API credentials.
import http from 'node:http';
const server=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'fixture'}]}));return;}
 if(req.method!=='POST'){res.end(JSON.stringify({data:[]}));return;}
 const data=JSON.parse(body),latest=data.messages.findLast(m=>m.role==='user')?.content||'',tool=data.messages.findLast(m=>m.role==='tool');
 if(latest.includes('slow')){setTimeout(()=>{if(!res.destroyed)res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Delayed fixture response.'}}]}));},60000).unref();return;}
 const message=latest.includes('write')&&!tool?{role:'assistant',content:'Requesting fixture write.',tool_calls:[{id:'fixture-write',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'style-fixture.txt',content:'offline terminal approval verified'})}}]}:{role:'assistant',content:tool?'Fixture tool completed.':'Terminal styling fixture response.'};
 res.end(JSON.stringify({choices:[{message}],usage:{prompt_tokens:12,completion_tokens:5,cost:0}}));
});
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
