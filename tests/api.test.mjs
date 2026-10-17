import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,cp,rm,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {python} from '../local/tools.mjs';
let child,root,outside,origin;
before(async()=>{
 root=await mkdtemp(join(tmpdir(),'orbit-api-'));outside=await mkdtemp(join(tmpdir(),'orbit-outside-'));
 await cp(new URL('../workspace/',import.meta.url),root,{recursive:true});
 await writeFile(join(outside,'secret.json'),'[{"secret":"outside"}]');await symlink(join(outside,'secret.json'),join(root,'escape.json'));await writeFile(join(root,'.env'),'secret');
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',ORBIT_WORKSPACE:root,ORBIT_DB:'company.sqlite',ORBIT_HR_FILE:'hr/candidates.json',ORBIT_MESSAGES_FILE:'communications/threads.json',ORBIT_OLLAMA_MODEL:''},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(Error('API startup timed out')),5000);child.stdout.on('data',d=>{output+=d;const url=output.match(/http:\/\/localhost:(\d+)/);if(url){origin='http://127.0.0.1:'+url[1];clearTimeout(timeout);resolve();}});child.once('error',reject);child.once('exit',code=>{if(code!==null)reject(Error('Server exited '+code));});});
});
after(async()=>{child?.kill();await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
const rawGet=(path,headers)=>new Promise((resolve,reject)=>{const req=request(origin+path,{headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
const post=(path,body)=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const result=async(path,body)=>{const r=await post(path,body);const json=await r.json();assert.equal(r.status,200,JSON.stringify(json));return json;};
test('local health, static assets, config, real context and workspace inventory',async()=>{
 const r=await fetch(origin+'/api/health');assert.equal(r.status,200);assert.equal((await r.json()).mode,'local');
 for(const p of ['/','/app.js','/engine.js','/local-client.js','/style.css'])assert.equal((await fetch(origin+p)).status,200);
 const context=await(await fetch(origin+'/api/context')).json();assert.deepEqual(context.errors,[]);assert.equal(context.rows.length,96);assert.equal(context.candidates.length,4);assert.equal(context.threads.length,3);
 const files=await(await fetch(origin+'/api/workspace/files')).json();assert.ok(files.files.some(f=>f.path==='finance/sales.xlsx'));assert.ok(!files.files.some(f=>f.path.includes('escape')||f.path.includes('.env')));
});
test('schema, actual SQL aggregation, and streamed tool observations',async()=>{
 const schema=await result('/api/tools/get_db_schema',{});assert.equal(schema.readonly,true);assert.ok(schema.tables.some(t=>t.name==='sales'&&t.columns.some(c=>c.name==='revenue')));
 const sql=await result('/api/tools/execute_sql_query',{query:'SELECT COUNT(*) AS n, SUM(revenue) AS revenue FROM sales'});assert.equal(sql.rows[0].n,96);
 const response=await fetch(origin+'/api/agent',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:JSON.stringify({query:'Посчитай маржинальность за последний месяц'})});
 const events=(await response.text()).trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.event==='step'&&e.data.name==='get_db_schema'&&e.data.status==='completed'));assert.ok(events.some(e=>e.event==='step'&&e.data.name==='execute_sql_query'&&e.data.status==='completed'));assert.equal(events.at(-1).event,'result');assert.equal(events.at(-1).data.data.profit,3187967);
});
test('changing SQLite on disk changes next agent run, without browser supplied rows',async()=>{
 const p=spawnSync(python,['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('UPDATE sales SET revenue=revenue+1000 WHERE id=49'); c.commit(); c.close()",join(root,'company.sqlite')]);assert.equal(p.status,0);
 const answer=await result('/api/agent',{query:'Посчитай выручку 2026-09',rows:[{date:'2026-09-01',revenue:1,cost:0}]});assert.equal(answer.data.revenue,7701400);
 spawnSync(python,['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('UPDATE sales SET revenue=revenue-1000 WHERE id=49'); c.commit(); c.close()",join(root,'company.sqlite')]);
});
test('SELECT-only DB policy denies writes, attachments, PRAGMA, unsafe functions and stacked statements',async()=>{
 const original=await readFile(join(root,'company.sqlite'));
 for(const query of ['DELETE FROM sales','UPDATE sales SET cost=0','DROP TABLE sales',"ATTACH DATABASE ':memory:' AS other",'PRAGMA writable_schema=ON',"SELECT load_extension('/tmp/x')",'SELECT 1; DELETE FROM sales',"SELECT readfile('/etc/passwd')","WITH x AS (SELECT 1) DELETE FROM sales"]){const r=await post('/api/tools/execute_sql_query',{query});assert.equal(r.status,400,query);}
 assert.deepEqual(await readFile(join(root,'company.sqlite')),original);
 const read=await result('/api/tools/execute_sql_query',{query:'WITH x AS (SELECT revenue FROM sales) SELECT sum(revenue) AS total FROM x'});assert.ok(read.rows[0].total>0);
});
test('file tool reads actual CSV, JSON and XLSX, confines symlinks and traversal',async()=>{
 for(const path of ['finance/sales.csv','finance/sales.json','finance/sales.xlsx']){const r=await result('/api/tools/read_workspace_file',{path});assert.equal(r.records.length,96);}
 for(const path of ['../secret.json','/etc/passwd','escape.json','.env','../orbit-outside/secret.json'])assert.equal((await post('/api/tools/read_workspace_file',{path})).status,400,path);
 await writeFile(join(root,'hr','actual.txt'),'Резюме из локального файла');assert.match((await result('/api/tools/read_workspace_file',{path:'hr/actual.txt'})).text,/Резюме/);
});
test('file source changes chart context and local HR / reply / content API calls',async()=>{
 await writeFile(join(root,'finance','tiny.csv'),'date,product,revenue,cost,category\n2026-09-01,Local product,1000,300,Team\n');
 await result('/api/config',{source:{type:'file',path:'finance/tiny.csv'}});
 const a=await result('/api/analytics',{});assert.equal(a.revenue,1000);assert.equal(a.margin,70);
 const run=await result('/api/agent',{query:'Проанализируй прибыль'});assert.equal(run.data.profit,700);assert.ok(run.events.some(e=>e.name==='read_workspace_file'));
 const hr=await result('/api/hr/score',{});assert.equal(hr[0].score,100);
 const reply=await result('/api/reply',{threadId:'t1'});assert.ok(reply.draft.includes('CRM'));assert.equal(reply.delivery,'draft-only');
 const plan=await result('/api/content-plan',{});assert.ok(plan.posts[1].topic.includes('Local product'));
 await result('/api/config',{source:{type:'db'}});
});
test('SQL limits report truncation and expensive recursive queries are interrupted',async()=>{
 const r=await result('/api/tools/execute_sql_query',{query:'SELECT * FROM sales',limit:3});assert.equal(r.rowCount,3);assert.equal(r.truncated,true);
 const start=Date.now();const response=await post('/api/tools/execute_sql_query',{query:'WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT sum(n) FROM x'});assert.equal(response.status,400);assert.ok(Date.now()-start<6000);
});
test('bad requests, cross-origin, rebinding host and nonpublic paths are denied',async()=>{
 assert.equal((await post('/api/agent',{query:''})).status,400);assert.equal((await fetch(origin+'/api/analytics')).status,405);
 assert.equal((await fetch(origin+'/api/config',{headers:{Origin:'https://unrelated.example'}})).status,403);
 assert.equal(await rawGet('/api/health',{Host:'evil.example'}),403);
 assert.equal(await rawGet('/api/context',{'Sec-Fetch-Site':'cross-site'}),403);
 assert.equal((await fetch(origin+'/.env')).status,404);assert.equal((await fetch(origin+'/workspace/company.sqlite')).status,404);
 assert.equal((await post('/api/tools/no_such_tool',{})).status,404);
});

test('failed connection update does not replace the active configuration',async()=>{
 const before=await(await fetch(origin+'/api/config')).json();
 assert.equal((await post('/api/config',{database:'missing.sqlite'})).status,400);
 const after=await(await fetch(origin+'/api/config')).json();assert.deepEqual(after,before);
 assert.equal((await post('/api/config',{model:'example-cloud'})).status,400);
});
