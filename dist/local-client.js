// Transport boundary: no simulated fallback and no direct browser access to the filesystem.
export async function api(path,body,{signal}={}) {
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
 let data;try{data=await response.json();}catch{throw Error('Локальный сервер недоступен. Запустите ./start.command и откройте http://localhost:3000.');}
 if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
}
export async function streamAgent(input,{onStep,signal}={}) {
 const response=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:JSON.stringify(input),signal});
 if(!response.ok){const data=await response.json();throw Error(data.error||`HTTP ${response.status}`);}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.event==='step')onStep?.(event.data);if(event.event==='result')result=event.data;if(event.event==='error')throw Error(event.error);};
 try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);}buffer+=decoder.decode();if(buffer)consume(buffer);if(!result)throw Error('Сервер завершил поток без результата.');return result;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
