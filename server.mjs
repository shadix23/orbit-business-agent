import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createTools} from './local/tools.mjs';
import {loadFinance,loadCandidates,loadThreads} from './local/context.mjs';
import {runAgent} from './local/agent.mjs';
import {analyze,generatePlan,generateReply} from './dist/engine.js';
const project=fileURLToPath(new URL('.',import.meta.url));
let config={workspace:resolve(process.env.ORBIT_WORKSPACE||resolve(project,'workspace')),database:process.env.ORBIT_DB||'company.sqlite',source:{type:'db'},hrFile:process.env.ORBIT_HR_FILE||'',messagesFile:process.env.ORBIT_MESSAGES_FILE||'',model:process.env.ORBIT_OLLAMA_MODEL||''};
// Samples are local files. Existing company data is never created or modified by this server.
if(!process.env.ORBIT_WORKSPACE){config.hrFile=config.hrFile||'hr/candidates.json';config.messagesFile=config.messagesFile||'communications/threads.json';}
const port=Number(process.env.PORT||3000);
const staticFiles={'/theme-init.js':['dist/theme-init.js','text/javascript; charset=utf-8'],'/appearance.js':['dist/appearance.js','text/javascript; charset=utf-8'],'/appearance.css':['dist/appearance.css','text/css; charset=utf-8'],'/':['dist/index.html','text/html; charset=utf-8'],'/index.html':['dist/index.html','text/html; charset=utf-8'],'/app.js':['dist/app.js','text/javascript; charset=utf-8'],'/local-client.js':['dist/local-client.js','text/javascript; charset=utf-8'],'/engine.js':['dist/engine.js','text/javascript; charset=utf-8'],'/style.css':['dist/style.css','text/css; charset=utf-8']};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(res,status,data)=>{if(res.destroyed)return;res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('Content-Type must be application/json'),{status:415});let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>5*1024*1024)throw Object.assign(Error('Request exceeds 5 MB'),{status:413});chunks.push(c);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw Error('Expected JSON object');}}
async function updateConfig(input){
 const next={...config,source:{...config.source}};
 if(input.workspace!==undefined){if(typeof input.workspace!=='string'||!input.workspace.trim())throw Error('Укажите абсолютный путь рабочей папки.');if(!input.workspace.startsWith('/'))throw Error('Нужен абсолютный путь workspace.');next.workspace=await realpath(input.workspace);if(!(await stat(next.workspace)).isDirectory())throw Error('Workspace должен быть папкой.');}
 for(const key of ['database','hrFile','messagesFile','model'])if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>1000)throw Error('Некорректная настройка '+key);next[key]=input[key];}
 if(input.source){if(!['db','file'].includes(input.source.type))throw Error('Источник: db или file.');next.source={type:input.source.type,table:String(input.source.table||''),path:String(input.source.path||''),sheet:String(input.source.sheet||''),mapping:input.source.mapping||{}};}
 if(next.model&&(!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(next.model)||/cloud/i.test(next.model)))throw Error('Укажите имя локальной Ollama-модели; cloud-модели не поддерживаются.');
 const tools=createTools(next);await tools.list_workspace_files();if(next.database)await tools.get_db_schema();
 if(next.source.type==='file')await tools.read_workspace_file({path:next.source.path,sheet:next.source.sheet});
 if(next.hrFile)await tools.read_workspace_file({path:next.hrFile});if(next.messagesFile)await tools.read_workspace_file({path:next.messagesFile});
 config=next;return config;
}
async function context(snapshot,signal){const tools=createTools(snapshot,{signal}),call=(n,a={})=>tools[n](a),errors=[];let finance={rows:[],source:'Источник не настроен'},candidates=[],threads=[];
 try{finance=await loadFinance(snapshot,tools,call);}catch(e){errors.push('Аналитика: '+e.message);}
 try{candidates=await loadCandidates(snapshot,call);}catch(e){errors.push('HR: '+e.message);}
 try{threads=await loadThreads(snapshot,tools);}catch(e){errors.push('Диалоги: '+e.message);}
 return {...finance,candidates,threads,config:snapshot,errors};}
let running=0;
const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host||'';
 if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return json(res,403,{error:'Only localhost / 127.0.0.1 hosts are accepted'});
 const url=new URL(req.url,'http://'+host);
 if(url.pathname.startsWith('/api/')){
  const origin=req.headers.origin;if(origin&&origin!==`http://${host}`)return json(res,403,{error:'Cross-origin requests disabled'});
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return json(res,403,{error:'Cross-site requests disabled'});
  if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{app:'orbit',mode:'local',version:'2.0.0',llm:config.model?`Ollama: ${config.model}`:false,readonly:true});
  if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,config);
  if(url.pathname==='/api/context'&&req.method==='GET')return json(res,200,await context(structuredClone(config)));
  if(url.pathname==='/api/workspace/files'&&req.method==='GET')return json(res,200,await createTools(config).list_workspace_files());
  if(req.method!=='POST')return json(res,405,{error:'Use POST'});
  const input=await body(req),snapshot=structuredClone(config),tools=createTools(snapshot),call=(n,a={})=>tools[n](a);
  if(url.pathname==='/api/config')return json(res,200,await updateConfig(input));
  if(url.pathname.startsWith('/api/tools/')){const name=url.pathname.slice('/api/tools/'.length);if(!Object.hasOwn(tools,name))return json(res,404,{error:'Unknown tool'});return json(res,200,await tools[name](input));}
  if(url.pathname==='/api/agent'){
   if(typeof input.query!=='string'||!input.query.trim()||input.query.length>2000)throw Error('Query must contain 1–2000 characters');
   if(running>=3)return json(res,429,{error:'Не более трёх одновременных задач.'});
   running++;const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});const stream=req.headers.accept==='application/x-ndjson';
   const emit=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
   if(stream)res.writeHead(200,{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});
   try{const result=await runAgent(snapshot,input,{signal:controller.signal,onEvent:e=>{if(stream)emit({event:'step',data:e});}});if(stream){emit({event:'result',data:result});res.end();}else json(res,200,result);}catch(e){if(stream){emit({event:'error',error:e.message});res.end();}else json(res,400,{error:e.message});}finally{running--;}
   return;
  }
  if(url.pathname==='/api/analytics'){const finance=await loadFinance(snapshot,tools,call);return json(res,200,{...analyze(finance.rows,input.period||'latest'),source:finance.source});}
  if(url.pathname==='/api/hr/score')return json(res,200,(await loadCandidates(snapshot,call)).sort((a,b)=>b.score-a.score));
  if(url.pathname==='/api/reply'){
   let text=input.text;if(input.threadId){const threads=await loadThreads(snapshot,tools);text=threads.find(t=>t.id===input.threadId)?.messages.filter(m=>m.from==='client').at(-1)?.text;}
   if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Укажите сообщение клиента.');
   return json(res,200,{draft:generateReply(text,String(input.business||'Orbit Studio').slice(0,60)),delivery:'draft-only',provider:'local-template'});
  }
  if(url.pathname==='/api/content-plan'){const finance=await loadFinance(snapshot,tools,call);return json(res,200,{posts:generatePlan(analyze(finance.rows)),source:finance.source,delivery:'draft-only',provider:'local-template'});}
  return json(res,404,{error:'Unknown API endpoint'});
 }
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
 const file=staticFiles[url.pathname];if(!file)return json(res,404,{error:'Not found'});
 const content=await readFile(resolve(project,file[0]));res.writeHead(200,{...headers,'Content-Type':file[1],'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){json(res,error.status||400,{error:error.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Orbit Local Agent · http://localhost:${server.address().port}\nWorkspace: ${config.workspace}\nSQLite read-only · ${config.model?'Ollama '+config.model:'SQL planner (no LLM)'}`));
