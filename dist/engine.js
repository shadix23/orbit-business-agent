// Pure domain layer shared by the browser and the Node API. No network or side effects.
export const money = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n) + ' ₸';
export function parseCSV(text) {
 const clean=text.replace(/^\uFEFF/,'');
 const first=clean.split(/\r?\n/)[0]; const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const records=[]; let record=[],cell='',quoted=false;
 for(let i=0;i<clean.length;i++) {const c=clean[i];if(c==='"'){if(quoted&&clean[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){record.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&clean[i+1]==='\n')i++;record.push(cell);if(record.some(v=>v.trim()))records.push(record);record=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Незакрытая кавычка в CSV.');
 record.push(cell); if(record.some(v=>v.trim()))records.push(record);
 const headers=records.shift()?.map(h=>h.trim().toLowerCase());
 if(!headers?.length||!records.length)throw Error('Файл пуст или не содержит строк данных.');
 if(new Set(headers).size!==headers.length)throw Error('Названия колонок не должны повторяться.');
 return records.map((r,i)=>{if(r.length!==headers.length)throw Error(`Строка ${i+2}: число колонок не совпадает с заголовком.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
}
export function validateRows(input) {
 if(!Array.isArray(input)||!input.length)throw Error('Ожидается непустой массив записей.');
 if(input.length>10000)throw Error('Максимум 10 000 строк в демо-режиме.');
 return input.map((r,i)=>{
  if(!r||typeof r!=='object')throw Error(`Строка ${i+1}: ожидается объект.`);
  const date=String(r.date||'');const parsed=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)throw Error(`Строка ${i+1}: date должна быть действительной датой YYYY-MM-DD.`);
  const number=(v,key)=>{if(v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0)throw Error(`Строка ${i+1}: ${key} должна быть числом ≥ 0.`);return Number(v);};
  return {date,revenue:number(r.revenue,'revenue'),cost:number(r.cost,'cost'),product:String(r.product||'Без продукта').slice(0,120),category:String(r.category||'Прочее').slice(0,120),channel:String(r.channel||'Не указан').slice(0,60)};
 });
}
export function analyze(rows,month='latest') {
 const months=[...new Set(rows.map(r=>r.date.slice(0,7)))].sort();
 const selected=month==='all'?null:month==='latest'?months.at(-1):month;
 const data=selected?rows.filter(r=>r.date.startsWith(selected)):rows;
 const revenue=data.reduce((s,r)=>s+r.revenue,0),cost=data.reduce((s,r)=>s+r.cost,0);
 const categories={},products={},days={};
 for(const r of data){categories[r.category]=(categories[r.category]||0)+r.cost;products[r.product]=(products[r.product]||0)+r.revenue;const key=r.date;days[key]??={revenue:0,cost:0};days[key].revenue+=r.revenue;days[key].cost+=r.cost;}
 const priorMonth=selected?months[months.indexOf(selected)-1]:null;const prior=priorMonth?rows.filter(r=>r.date.startsWith(priorMonth)):[];
 const prevRevenue=prior.reduce((s,r)=>s+r.revenue,0);
 return {month:selected||'Все периоды',months,revenue,cost,profit:revenue-cost,margin:revenue?(revenue-cost)/revenue*100:0,count:data.length,growth:prevRevenue?(revenue-prevRevenue)/prevRevenue*100:null,topCosts:Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,3),products:Object.entries(products).sort((a,b)=>b[1]-a[1]),series:Object.entries(days).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,...v})),data};
}
export function scoreCandidate(c) {
 const required=['CRM','B2B','Переговоры','Аналитика'];const skills=Array.isArray(c.skills)?c.skills:[];
 const matched=required.filter(s=>skills.some(x=>String(x).toLowerCase()===s.toLowerCase()));
 const experience=Math.max(0,Number(c.experience)||0);
 const score=Math.round(matched.length/4*70+Math.min(experience/5,1)*30);
 return {...c,score,matched,missing:required.filter(x=>!matched.includes(x)),recommendation:score>=80?'Пригласить на интервью':score>=55?'Уточнить опыт':'Недостаточно подтверждённых навыков'};
}
export function generateReply(text,business='Orbit Studio') {
 const t=text.toLowerCase();
 if(/crm|срм|внедрен/.test(t))return `Здравствуйте! В ${business} можем обсудить внедрение CRM. Стоимость и сроки нужно подтвердить по вашим требованиям. Подскажите, сколько человек будет работать в системе и какую CRM вы используете сейчас?`;
 if(/pro|подписк|команд/.test(t))return `Здравствуйте! Спасибо за интерес к подписке Pro в ${business}. Состав услуг и стоимость уточнит менеджер. Подскажите, какую задачу вашей команды важно решить в первую очередь?`;
 if(/консультац|запис|когда/.test(t))return `С удовольствием организуем консультацию с экспертом ${business}. Подскажите удобные дни и время — менеджер подтвердит доступный слот. Какая задача сейчас для вас приоритетна?`;
 return `Спасибо за обращение в ${business}! Помогаем с бизнес-аналитикой, CRM и развитием команды. Расскажите подробнее о вашей задаче, чтобы мы предложили подходящий вариант.`;
}
export function generatePlan(analytics) {
 const product=analytics.products[0]?.[0]||'наши услуги';
 return [
 {day:'ПН',date:'19 окт',type:'Карусель',topic:'3 процесса, которые пора автоматизировать',pillar:'Экспертность',color:'lilac',body:`Сколько часов ваша команда тратит на рутину? Собрали 3 процесса для автоматизации: отчётность, первичные ответы клиентам и сбор данных. Начните с одного — и измерьте результат. Хотите разбор вашего бизнеса? Напишите «АУДИТ» в директ.\n\n#автоматизация #бизнес #OrbitStudio`},
 {day:'ВТ',date:'20 окт',type:'Reels',topic:`За кулисами: ${product}`,pillar:'Продукт',color:'mint',body:`Как устроен ${product.toLowerCase()} в Orbit Studio? Показываем путь от первого брифа до результата. Основа — понятные цели, прозрачные метрики и работа вместе с вашей командой. Подробности — в директ.\n\n#команда #процессы #бизнес`},
 {day:'СР',date:'21 окт',type:'Stories',topic:'Какая рутина забирает ваше время?',pillar:'Вовлечение',color:'peach',body:'Опрос для Stories: что отнимает больше времени? 1. Отчёты 2. Сообщения 3. Поиск клиентов 4. Всё сразу. Следующий кадр: разберём самый популярный ответ на примере.'},
 {day:'ЧТ',date:'22 окт',type:'Карусель',topic:'Выручка растёт. А прибыль?',pillar:'Экспертность',color:'lilac',body:`Выручка и прибыль — разные показатели. В нашем демо-периоде маржинальность составляет ${analytics.margin.toFixed(1)}%. Чтобы видеть картину целиком, учитывайте затраты по категориям. Сохраните этот чек-лист: выручка → расходы → прибыль → маржа.\n\n#аналитика #финансы #предприниматель`},
 {day:'ПТ',date:'23 окт',type:'Пост',topic:`Разберём ваш бизнес за одну встречу`,pillar:'Продажи',color:'mint',body:`Не знаете, с чего начать автоматизацию? На консультации Orbit Studio определим, где команда теряет время, и составим план действий. Без универсальных рецептов — с учётом ваших процессов. Напишите «СТАРТ», чтобы узнать детали.\n\n#консалтинг #ростбизнеса`}
 ];
}
