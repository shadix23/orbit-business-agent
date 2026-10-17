import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {runAgent} from '../local/agent.mjs';
import {financeSQL} from '../local/context.mjs';
const config={workspace:fileURLToPath(new URL('../workspace',import.meta.url)),database:'company.sqlite',source:{type:'db'},hrFile:'hr/candidates.json',messagesFile:'communications/threads.json',model:''};
test('planner supports schema, raw SELECT, files, HR, analytics and truthful unsupported intent',async()=>{
 assert.equal((await runAgent(config,{query:'Покажи схему базы'})).type,'schema');
 assert.equal((await runAgent(config,{query:'SELECT count(*) AS n FROM sales'})).data.rows[0].n,96);
 assert.equal((await runAgent(config,{query:'Прочитай finance/sales.xlsx'})).data.records.length,96);
 assert.equal((await runAgent(config,{query:'Оцени кандидатов'})).data.length,4);
 assert.equal((await runAgent(config,{query:'Контент-план'})).data.length,5);
 assert.equal((await runAgent(config,{query:'Сочини песню'})).type,'help');
});
test('schema-based SQL quotes identifiers and accepts explicit nonstandard column mapping',()=>{
 const schema={tables:[{name:'order"table',columns:['Date of sale','Net total','Unit costs'].map(name=>({name}))}]};
 const plan=financeSQL(schema,{table:'order"table',mapping:{date:'Date of sale',revenue:'Net total',cost:'Unit costs'}});assert.ok(plan.query.includes('"order""table"'));assert.ok(plan.query.includes('"Date of sale" AS "date"'));
 assert.throws(()=>financeSQL(schema,{table:'order"table',mapping:{date:'missing',revenue:'Net total',cost:'Unit costs'}}));
});
test('cancellation aborts real tool execution',async()=>{
 const controller=new AbortController();await assert.rejects(runAgent(config,{query:'Проанализируй прибыль'},{signal:controller.signal,onEvent:e=>{if(e.name==='get_db_schema'&&e.status==='running')controller.abort();}}),/остановлена/);
});
test('Ollama adapter performs actual tool calls and feeds observations back to model (mocked model only)',async()=>{
 const original=globalThis.fetch;let count=0;globalThis.fetch=async(url,options)=>{assert.equal(url,'http://127.0.0.1:11434/api/chat');const body=JSON.parse(options.body);count++;
 const message=count===1?{content:'',tool_calls:[{function:{name:'get_db_schema',arguments:{}}}]}:count===2?{content:'',tool_calls:[{function:{name:'execute_sql_query',arguments:{query:'SELECT COUNT(*) AS n FROM sales'}}}]}:{content:'В таблице sales 96 записей.'};
 if(count===3)assert.ok(body.messages.some(m=>m.role==='tool'&&m.content.includes('96')));return new Response(JSON.stringify({message}),{headers:{'Content-Type':'application/json'}});};
 try{const r=await runAgent({...config,model:'test-local'},{query:'Сколько записей?'});assert.equal(r.type,'local');assert.match(r.text,/96/);assert.equal(count,3);}finally{globalThis.fetch=original;}
});
