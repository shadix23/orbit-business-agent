// Pure domain layer shared by the browser and the Node API. No network or side effects.
export const demoRows = Array.from({length: 96}, (_, i) => {
  const month = i < 48 ? '2026-08' : '2026-09';
  const day = String((i % 28) + 1).padStart(2, '0');
  const product = ['Консалтинг', 'Подписка Pro', 'Внедрение CRM', 'Обучение'][i % 4];
  const revenue = [148000, 79000, 225000, 68000][i % 4] + (i % 7) * 4200 + (i >= 48 ? 18000 : 0);
  return {date: `${month}-${day}`, product, revenue, cost: Math.round(revenue * (i >= 48 ? .586 : .63)), category: ['Команда', 'Маркетинг', 'Инфраструктура', 'Подрядчики'][i % 4], channel: ['WhatsApp', 'Instagram', 'Сайт'][i % 3]};
});
export const demoCandidates = [
 {id:'c1',name:'Анна Смирнова',role:'Менеджер по продажам',experience:5,skills:['CRM','B2B','Переговоры','Аналитика'],resume:'5 лет в B2B-продажах. Работа с CRM, ведение переговоров и аналитика воронки. Выполнение плана 118%.',status:'Новый'},
 {id:'c2',name:'Марк Ким',role:'Менеджер по продажам',experience:3,skills:['CRM','B2B','Переговоры'],resume:'3 года продаж SaaS-продуктов. CRM, B2B, переговоры. Развивал партнёрский канал.',status:'Новый'},
 {id:'c3',name:'Елена Волкова',role:'Менеджер по продажам',experience:2,skills:['CRM','Аналитика'],resume:'2 года поддержки продаж. Ведение CRM, аналитика и подготовка коммерческих предложений.',status:'Новый'},
 {id:'c4',name:'Даниил Орлов',role:'Менеджер по продажам',experience:1,skills:['B2B'],resume:'1 год работы с B2B-клиентами. Поиск лидов и первичная квалификация.',status:'Новый'}
];
export const demoThreads = [
 {id:'t1',name:'Александр Петров',initials:'АП',channel:'WhatsApp',time:'12:42',text:'Здравствуйте! Сколько стоит внедрение CRM и как быстро можно начать?',messages:[{from:'client',text:'Здравствуйте! Сколько стоит внедрение CRM и как быстро можно начать?'}],unread:true},
 {id:'t2',name:'Студия Forma',initials:'F',channel:'Instagram',time:'12:35',text:'Можно подробнее о подписке Pro? Нас команда из 8 человек.',messages:[{from:'client',text:'Можно подробнее о подписке Pro? Нас команда из 8 человек.'}],unread:true},
 {id:'t3',name:'Мария Иванова',initials:'МИ',channel:'WhatsApp',time:'11:58',text:'Спасибо! Когда можно записаться на консультацию?',messages:[{from:'client',text:'Спасибо! Когда можно записаться на консультацию?'}],unread:false}
];
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
 if(/crm|срм|внедрен/.test(t))return `Здравствуйте! В ${business} внедрение CRM начинается от 225 000 ₸. Сроки зависят от количества пользователей и интеграций. Подскажите, сколько человек будет работать в системе и какую CRM вы используете сейчас?`;
 if(/pro|подписк|команд/.test(t))return `Здравствуйте! Подписка Pro в ${business} — от 79 000 ₸ в месяц: аналитика, сопровождение и ежемесячная сессия с экспертом. Подскажите, какую задачу вашей команды важно решить в первую очередь?`;
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
export function resolveAgent(query,rows,candidates=demoCandidates) {
 const q=String(query||'').trim();if(!q)throw Error('Введите задачу для агента.');
 const a=analyze(rows);const lower=q.toLowerCase();
 if(/кандидат|резюме|найм|hr|персонал/.test(lower)) {const ranked=candidates.map(scoreCandidate).sort((a,b)=>b.score-a.score);return {type:'hr',title:'Скоринг кандидатов готов',text:`Проверено ${ranked.length} резюме по четырём навыкам и опыту. ${ranked[0]?`${ranked[0].name} — ${ranked[0].score}/100. ${ranked[0].recommendation}.`: 'Загрузите резюме для анализа.'} Оценка носит рекомендательный характер.`,logs:['Прочитаны требования вакансии','Проверены навыки и опыт','Подготовлены рекомендации для HR'],data:ranked};}
 if(/контент|smm|пост|инстаграм|instagram/.test(lower))return {type:'smm',title:'Контент-план на 5 дней готов',text:`Приоритетный продукт по выручке — «${a.products[0]?.[0]||'нет данных'}». Подготовлены 5 публикаций: экспертность, продукт, вовлечение и продажи. Черновики доступны в Instagram SMM.`,logs:['Проанализирована выручка по продуктам','Выбраны темы и форматы','Сформированы черновики публикаций'],data:generatePlan(a)};
 if(/сообщен|whatsapp|ответ|клиент/.test(lower))return {type:'messages',title:'Ответы клиентам подготовлены',text:'Могу подготовить ответы по услугам, CRM и подписке Pro. Откройте «Коммуникации», выберите диалог и проверьте черновик перед симуляцией отправки.',logs:['Прочитан контекст Orbit Studio','Проверен каталог услуг','Подготовлен сценарий ответа'],data:null};
 if(!/марж|анал|выруч|расход|затрат|прибыл|продаж|бизнес|отч[её]т|финанс|итог|месяц|обзор|рост/.test(lower))return {type:'help',title:'Уточните задачу',text:'В демо я умею анализировать выручку, расходы и маржинальность, оценивать резюме, готовить ответы клиентам и контент-план. Например: «Посчитай маржинальность за последний месяц».',logs:['Запрос проверен','Показаны доступные инструменты'],data:null};
 const requested=q.match(/\b(20\d{2}-\d{2})\b/)?.[1];
 const selected=/все периоды|весь период/.test(lower)?'all':requested||'latest';const result=analyze(rows,selected);
 return {type:'analytics',title:'Финансовый анализ готов',text:`Период: ${result.month}. Выручка — ${money(result.revenue)}, расходы — ${money(result.cost)}, прибыль — ${money(result.profit)}. Маржинальность — ${result.margin.toFixed(1)}%. Топ затрат: ${result.topCosts.map(([n,v])=>`${n} (${money(v)})`).join(', ')||'нет данных'}. ${result.count?'Начните с проверки самой крупной статьи расходов.':'За этот период записи не найдены.'}`,logs:[`Выбран период ${result.month}`,`Проверено ${result.count} записей`,`Рассчитаны прибыль и маржинальность`,'Сформирован отчёт по статьям расходов'],data:result};
}
