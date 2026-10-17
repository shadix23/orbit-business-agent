import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {demoRows,demoCandidates,validateRows,analyze,scoreCandidate,generateReply,generatePlan,resolveAgent} from './dist/engine.js';
const port=Number(process.env.PORT||3000);
const staticFiles={'/theme-init.js':['dist/theme-init.js','text/javascript; charset=utf-8'],'/appearance.js':['dist/appearance.js','text/javascript; charset=utf-8'],'/appearance.css':['dist/appearance.css','text/css; charset=utf-8'],'/':['dist/index.html','text/html; charset=utf-8'],'/index.html':['dist/index.html','text/html; charset=utf-8'],'/app.js':['dist/app.js','text/javascript; charset=utf-8'],'/engine.js':['dist/engine.js','text/javascript; charset=utf-8'],'/style.css':['dist/style.css','text/css; charset=utf-8']};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('Content-Type must be application/json'),{status:415});let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>5*1024*1024)throw Object.assign(Error('Request exceeds 5 MB'),{status:413});chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid JSON');}}
const candidateInput=input=>{if(!Array.isArray(input)||input.length>500)throw Error('Expected up to 500 candidates');return input.map(c=>{if(!c||typeof c.name!=='string'||!c.name.trim()||!Array.isArray(c.skills)||c.skills.some(s=>typeof s!=='string')||!Number.isFinite(Number(c.experience))||Number(c.experience)<0||Number(c.experience)>60)throw Error('Candidate requires name, skills[] and experience (0–60)');return c;});};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{app:'orbit',mode:'simulated',version:'1.0.0',llm:false});
 if(url.pathname.startsWith('/api/')){
  if(req.method!=='POST')return json(res,405,{error:'Use POST'});
  const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`)return json(res,403,{error:'Cross-origin requests disabled'});
  const input=await body(req);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected an object');
  if(url.pathname==='/api/analytics')return json(res,200,analyze(validateRows(input.rows||demoRows),input.period||'latest'));
  if(url.pathname==='/api/agent'){if(typeof input.query!=='string'||!input.query.trim()||input.query.length>2000)throw Error('Query must contain 1–2000 characters');return json(res,200,resolveAgent(input.query,validateRows(input.rows||demoRows),candidateInput(input.candidates||demoCandidates)));}
  if(url.pathname==='/api/hr/score')return json(res,200,candidateInput(input.candidates||demoCandidates).map(scoreCandidate).sort((a,b)=>b.score-a.score));
  if(url.pathname==='/api/reply'){if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw Error('text must contain 1–4000 characters');return json(res,200,{draft:generateReply(input.text,String(input.business||'Orbit Studio').slice(0,60)),simulated:true});}
  if(url.pathname==='/api/content-plan')return json(res,200,{posts:generatePlan(analyze(validateRows(input.rows||demoRows))),simulated:true});
  return json(res,404,{error:'Unknown API endpoint'});
 }
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
 const file=staticFiles[url.pathname];if(!file)return json(res,404,{error:'Not found'});
 const content=await readFile(fileURLToPath(new URL(file[0],import.meta.url)));
 res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){json(res,error.status||400,{error:error.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Orbit Business OS · Local: http://localhost:${port}\nMock API enabled · No API keys required`));
