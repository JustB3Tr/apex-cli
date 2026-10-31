// Content-Length is only a hint. Enforce the limit while reading, before JSON
// parsing or retaining an arbitrarily large provider response in memory.
export async function boundedJSON(response,{maxBytes=4*1024*1024}={}) {
 const reader=response.body?.getReader();
 if(!reader)throw Error('Response has no JSON body');
 let size=0;const chunks=[];
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error(`Response exceeds ${maxBytes} byte JSON limit`);chunks.push(value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}
