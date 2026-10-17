import {validateRows,scoreCandidate} from '../dist/engine.js';
export const quoteIdentifier=value=>'"'+String(value).replaceAll('"','""')+'"';
const aliases={date:['date','дата','order_date','sale_date'],revenue:['revenue','выручка','amount','sales_amount'],cost:['cost','расходы','expense','expenses','затраты'],product:['product','продукт','product_name'],category:['category','категория','статья','expense_category'],channel:['channel','канал','source']};
export function mappingFor(columns,overrides={}) {const names=columns.map(c=>typeof c==='string'?c:c.name);return Object.fromEntries(Object.entries(aliases).map(([key,options])=>[key,overrides[key]||names.find(n=>options.includes(n.toLowerCase()))]));}
export function financeSQL(schema,source={}) {
 const table=source.table?schema.tables.find(t=>t.name===source.table):schema.tables.find(t=>{const m=mappingFor(t.columns);return m.date&&m.revenue&&m.cost;});
 if(!table)throw Error('Не найдена финансовая таблица. Укажите таблицу и поля date / revenue / cost в интеграциях или выберите CSV / JSON / XLSX.');
 const mapping=mappingFor(table.columns,source.mapping);const names=new Set(table.columns.map(c=>c.name));
 for(const key of ['date','revenue','cost'])if(!mapping[key]||!names.has(mapping[key]))throw Error(`Не найдено поле ${key}. Настройте соответствие колонок.`);
 for(const value of Object.values(mapping))if(value&&!names.has(value))throw Error('Поле отсутствует в выбранной таблице.');
 const select=Object.keys(aliases).map(k=>mapping[k]?`${quoteIdentifier(mapping[k])} AS ${quoteIdentifier(k)}`:`'${k==='category'?'Прочее':k==='channel'?'Не указан':'Без продукта'}' AS ${quoteIdentifier(k)}`).join(', ');
 return {table:table.name,query:`SELECT ${select} FROM ${quoteIdentifier(table.name)} ORDER BY ${quoteIdentifier(mapping.date)}`,mapping};
}
export function recordsToFinance(records,mapping={}) {
 if(!Array.isArray(records))throw Error('Финансовый файл должен содержать массив записей.');
 const m=mappingFor(Object.keys(records[0]||{}),mapping);
 return validateRows(records.map(r=>Object.fromEntries(Object.keys(aliases).map(k=>[k,r[m[k]||k]]))));
}
export function normalizeCandidates(records) {
 if(!Array.isArray(records)||records.length>500)throw Error('Ожидается до 500 резюме.');
 return records.map((r,i)=>{const skills=Array.isArray(r.skills)?r.skills:typeof r.skills==='string'?(r.skills.trim().startsWith('[')?JSON.parse(r.skills):r.skills.split(',')):[];
 if(typeof r.name!=='string'||!r.name.trim()||!Number.isFinite(Number(r.experience))||Number(r.experience)<0||Number(r.experience)>60||skills.some(s=>typeof s!=='string'))throw Error(`Некорректное резюме №${i+1}: name, experience, skills обязательны.`);
 return scoreCandidate({...r,id:String(r.id||`local-${i}`),name:r.name.trim(),experience:Number(r.experience),skills:skills.map(s=>s.trim()),resume:String(r.resume||''),role:String(r.role||'Менеджер по продажам'),status:'Локальное резюме'});});
}
export async function loadFinance(config,tools,call,onPlan=()=>{}) {
 if(config.source?.type==='file') {
  const file=await call('read_workspace_file',{path:config.source.path,sheet:config.source.sheet});
  const rows=recordsToFinance(file.records,config.source.mapping);return {rows,source:config.source.path};
 }
 const schema=await call('get_db_schema',{});const plan=financeSQL(schema,config.source);onPlan(plan);
 const data=await call('execute_sql_query',{query:plan.query});
 if(data.truncated)throw Error('Финансовая таблица содержит больше 10 000 строк. Используйте reporting-view с агрегатами; частичные данные не выдаются за полный отчёт.');
 return {rows:validateRows(data.rows),source:`${config.database} → ${plan.table}`,sql:plan.query};
}
export async function loadCandidates(config,call) {
 if(config.hrFile){const file=await call('read_workspace_file',{path:config.hrFile});return normalizeCandidates(file.records);}
 const schema=await call('get_db_schema',{});const table=schema.tables.find(t=>['name','experience','skills'].every(c=>t.columns.some(col=>col.name===c)));
 if(!table)return [];
 const data=await call('execute_sql_query',{query:`SELECT * FROM ${quoteIdentifier(table.name)}`,limit:501});
 if(data.truncated||data.rows.length>500)throw Error('Более 500 резюме. Уточните HR-источник.');return normalizeCandidates(data.rows);
}
export async function loadThreads(config,tools) {
 if(!config.messagesFile)return [];
 const f=await tools.read_workspace_file({path:config.messagesFile});
 if(!Array.isArray(f.records)||f.records.length>100)throw Error('Файл диалогов должен быть массивом до 100 элементов.');
 return f.records.map((t,i)=>{if(typeof t.name!=='string'||!Array.isArray(t.messages)||!t.messages.length||t.messages.some(m=>typeof m.text!=='string'||!['client','agent'].includes(m.from)))throw Error('Некорректная структура диалога.');return {...t,id:String(t.id||`thread-${i}`),initials:t.name.split(' ').map(s=>s[0]).slice(0,2).join(''),channel:t.channel==='Instagram'?'Instagram':'WhatsApp',time:t.time||'',unread:!!t.unread};});
}
