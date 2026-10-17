import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoRows,validateRows,parseCSV,analyze,scoreCandidate,resolveAgent,generateReply,generatePlan} from '../dist/engine.js';
test('import: quoted commas, BOM, semicolon, multiline fields, invalid dates and numbers',()=>{
 const csv='\uFEFFdate;product;revenue;cost\r\n2026-09-01;"CRM; Pro";100;30\r\n2026-09-02;"Two\nlines";200;50';
 const rows=validateRows(parseCSV(csv));assert.equal(rows.length,2);assert.equal(rows[0].product,'CRM; Pro');assert.equal(rows[1].product,'Two\nlines');
 assert.throws(()=>validateRows([{date:'2026-02-30',revenue:100,cost:20}]),/date/);
 assert.throws(()=>validateRows([{date:'2026-09-01',revenue:'',cost:20}]),/revenue/);
 assert.throws(()=>parseCSV('date,date\na,b'),/повторяться/);
 assert.throws(()=>parseCSV('date,product\n2026-09-01,"x'),/кавычка/);
});
test('analytics calculates actual rows and selects latest available month, independent of clock',()=>{
 const rows=validateRows([{date:'2025-01-01',revenue:100,cost:40,category:'A'},{date:'2025-02-01',revenue:300,cost:100,category:'B'},{date:'2025-02-02',revenue:200,cost:50,category:'A'}]);
 const a=analyze(rows);assert.equal(a.month,'2025-02');assert.equal(a.revenue,500);assert.equal(a.profit,350);assert.equal(a.margin,70);assert.equal(a.growth,400);assert.deepEqual(a.topCosts,[['B',100],['A',50]]);assert.equal(analyze(rows,'all').revenue,600);assert.equal(analyze(rows,'2026-01').count,0);
});
test('zero revenue is safe; loss remains visible',()=>{
 const a=analyze(validateRows([{date:'2026-09-01',revenue:0,cost:100}]));assert.equal(a.margin,0);assert.equal(a.profit,-100);assert.equal(a.growth,null);
});
test('HR scores professional criteria only and does not use name or protected data',()=>{
 const c={name:'A',experience:5,skills:['CRM','B2B','Переговоры','Аналитика']};assert.equal(scoreCandidate(c).score,100);assert.equal(scoreCandidate({...c,name:'B',age:55,gender:'any'}).score,100);assert.equal(scoreCandidate({...c,experience:0,skills:[]}).score,0);
});
test('agent routes requests and unsupported requests honestly',()=>{
 assert.equal(resolveAgent('Посчитай маржинальность',demoRows).type,'analytics');assert.equal(resolveAgent('Оцени кандидатов',demoRows).type,'hr');assert.equal(resolveAgent('Создай контент-план',demoRows).type,'smm');assert.equal(resolveAgent('Ответ клиентам WhatsApp',demoRows).type,'messages');assert.equal(resolveAgent('Сочини песню',demoRows).type,'help');assert.equal(resolveAgent('Анализ 2026-08',demoRows).data.month,'2026-08');assert.throws(()=>resolveAgent('',demoRows));
});
test('content uses data and reply does not claim a confirmed appointment',()=>{
 const a=analyze(demoRows);assert.equal(generatePlan(a).length,5);assert.ok(generatePlan(a)[1].topic.includes(a.products[0][0]));assert.match(generateReply('Хочу CRM'),/225 000/);assert.match(generateReply('Записаться на консультацию'),/подтвердит/);
});
