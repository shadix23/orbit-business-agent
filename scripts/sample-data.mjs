// Fictional fixtures used only to initialize the example workspace.
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
