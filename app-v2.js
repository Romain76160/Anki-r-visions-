const STORAGE_KEY='moocRevisionPWA.v2';
const DAY=86400000, MIN=60000;
const W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];

let state={cards:[],packs:{},progress:{},settings:{retention:.90},tab:'home',selectedCourse:null,sessionCourse:null,session:[],index:0,revealed:false,loading:true,error:null};
const app=document.getElementById('app');
const packInput=document.getElementById('packInput');
const backupInput=document.getElementById('backupInput');

function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
function now(){return Date.now();}
function load(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved)state={...state,...saved,tab:'home',selectedCourse:null,sessionCourse:null,session:[],index:0,revealed:false,loading:true,error:null};}catch(e){console.warn(e);}}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...state,tab:'home',session:[],index:0,revealed:false,loading:false,error:null}));}catch(e){console.warn(e);}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function progressFor(id){return state.progress[id]||{reviewCount:0,lapseCount:0,dueAt:0,lastReviewedAt:null,stability:null,difficulty:null,lastGrade:null,isRelearning:false};}
function initialStability(g){return W[g-1];}
function initialDifficulty(g){return clamp(W[4]-Math.exp(W[5]*(g-1))+1,1,10);}
function nextDifficulty(d,g){const delta=-W[6]*(g-3),damped=d+delta*(10-d)/9,target=initialDifficulty(4);return clamp(W[7]*target+(1-W[7])*damped,1,10);}
function retrievability(t,s){const decay=W[20],factor=Math.pow(.9,-1/decay)-1;return Math.pow(1+factor*t/s,-decay);}
function intervalDays(s){const decay=W[20],factor=Math.pow(.9,-1/decay)-1,r=clamp(state.settings.retention,.70,.97);return s/factor*(Math.pow(r,-1/decay)-1);}
function sameDayStability(s,g){let inc=Math.exp(W[17]*(g-3+W[18]))*Math.pow(s,-W[19]);if(g>=2)inc=Math.max(1,inc);return Math.max(.001,s*inc);}
function recallStability(d,s,r,g){const hard=g===2?W[15]:1,easy=g===4?W[16]:1,growth=Math.exp(W[8])*(11-d)*Math.pow(s,-W[9])*(Math.exp(W[10]*(1-r))-1)*hard*easy;return Math.max(s,s*(growth+1));}
function forgettingStability(d,s,r){const v=W[11]*Math.pow(d,-W[12])*(Math.pow(s+1,W[13])-1)*Math.exp(W[14]*(1-r));return Math.max(.001,Math.min(v,s));}
function reviewCalc(old,g,t=now()){
  const p={...old};
  if(!old.reviewCount||old.stability==null||old.difficulty==null){p.stability=initialStability(g);p.difficulty=initialDifficulty(g);}
  else{
    const s=Math.max(old.stability,.001),d=clamp(old.difficulty,1,10),elapsed=Math.max(0,(t-(old.lastReviewedAt||t))/DAY),r=retrievability(elapsed,s);
    p.difficulty=nextDifficulty(d,g);
    if(elapsed<1)p.stability=sameDayStability(s,g);else if(g===1)p.stability=forgettingStability(d,s,r);else p.stability=recallStability(d,s,r,g);
  }
  p.reviewCount=(old.reviewCount||0)+1;p.lapseCount=(old.lapseCount||0)+(g===1?1:0);p.lastReviewedAt=t;p.lastGrade=g;
  let interval;
  if(g===1){interval=10*MIN;p.isRelearning=true;}else{interval=Math.max(MIN,Math.min(intervalDays(Math.max(p.stability,.001)),36500)*DAY);p.isRelearning=false;}
  p.dueAt=t+interval;return{progress:p,interval};
}
function formatInterval(ms){if(ms<3600000)return`${Math.max(1,Math.round(ms/MIN))} min`;if(ms<DAY)return`${Math.max(1,Math.round(ms/3600000))} h`;const d=ms/DAY;if(d<30)return`${Math.max(1,Math.round(d))} j`;if(d<365)return`${Math.max(1,Math.round(d/30))} mois`;return`${Math.max(1,Math.round(d/365))} an${d>=730?'s':''}`;}
const COURSE_ALIASES={'Bases relationnelles':'Bases de données'};
const COURSE_ORDER=['Statistiques','Bases de données','Algèbre linéaire','Probabilités','Python','Linux'];
function courseName(card){return COURSE_ALIASES[card.subject]||card.subject||'Autre';}
function cardsForCourse(course){return state.cards.filter(c=>courseName(c)===course);}
function courseNames(){
  const names=[...new Set(state.cards.map(courseName))];
  return names.sort((a,b)=>{
    const ai=COURSE_ORDER.indexOf(a),bi=COURSE_ORDER.indexOf(b);
    if(ai>=0&&bi>=0)return ai-bi;
    if(ai>=0)return-1;
    if(bi>=0)return 1;
    return a.localeCompare(b,'fr');
  });
}
function dueCards(course=null){
  const t=now();
  return state.cards.filter(c=>{
    if(course&&courseName(c)!==course)return false;
    const p=progressFor(c.id);
    return !p.reviewCount||(p.dueAt||0)<=t;
  }).sort((a,b)=>(progressFor(a.id).reviewCount?1:0)-(progressFor(b.id).reviewCount?1:0)||(progressFor(a.id).dueAt||0)-(progressFor(b.id).dueAt||0));
}
function counts(course=null){
  const cards=course?cardsForCourse(course):state.cards;
  const t=now();let due=0,newc=0,learned=0;
  for(const c of cards){
    const p=progressFor(c.id);
    if(!p.reviewCount)newc++;else learned++;
    if(!p.reviewCount||(p.dueAt||0)<=t)due++;
  }
  return{due,newc,learned,total:cards.length};
}
function chapterSummary(course){
  const map=new Map();
  for(const c of cardsForCourse(course)){
    const chapter=c.chapter||'Sans chapitre';
    map.set(chapter,(map.get(chapter)||0)+1);
  }
  return[...map.entries()].map(([name,count])=>({name,count}));
}
function courseCardsMarkup(){
  return courseNames().map(course=>{
    const c=counts(course);
    const chapters=chapterSummary(course).length;
    return`<button class="course-card" data-course="${esc(course)}"><span class="course-main"><b>${esc(course)}</b><small>${c.total} cartes · ${chapters} chapitre${chapters>1?'s':''}</small></span><span class="course-side"><b>${c.due}</b><small>à revoir</small></span></button>`;
  }).join('');
}
function mergePack(pack,notify=true){if(!pack||!Array.isArray(pack.questions))throw new Error('Format de pack invalide');const map=new Map(state.cards.map(c=>[c.id,c]));for(const q of pack.questions){if(!q.id||!q.prompt||!q.answer)continue;map.set(q.id,{id:q.id,subject:q.subject||'Autre',chapter:q.chapter||'',prompt:q.prompt,answer:q.answer,explanation:q.explanation||null,tags:q.tags||[],packID:pack.packID||'import'});}state.cards=[...map.values()];const id=pack.packID||`pack-${Date.now()}`;state.packs[id]={title:pack.title||'Pack importé',version:pack.version||1,count:pack.questions.length,importedAt:Date.now()};save();if(notify)toast(`${pack.questions.length} questions importées`);}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),1800);}
function renderTop(title,sub=''){return`<div class="topbar"><div><div class="brand">${esc(title)}</div>${sub?`<div class="muted">${esc(sub)}</div>`:''}</div></div>`;}
function navButton(tab,label){const active=state.tab===tab||(tab==='library'&&state.tab==='course');return`<button data-tab="${tab}" class="${active?'active':''}">${label}</button>`;}
function nav(){return`<div class="nav"><div class="nav-inner">${navButton('home','Révision')}${navButton('library','Bibliothèque')}${navButton('stats','Stats')}${navButton('settings','Réglages')}</div></div>`;}
function installPanel(){return`<div class="section-title">Installation sur iPhone</div><div class="panel"><b>Ajouter l’app à l’écran d’accueil</b><div class="install-steps"><div class="install-step">Ouvre cette page dans Safari.</div><div class="install-step">Appuie sur Partager.</div><div class="install-step">Choisis « Sur l’écran d’accueil ».</div><div class="install-step">Appuie sur « Ajouter ».</div></div></div>`;}
function isIOS(){return/iphone|ipad|ipod/i.test(navigator.userAgent);}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function home(){
  if(state.loading)return`${renderTop('MOOC Révision','Chargement…')}<div class="panel hero"><h1>Chargement des fiches…</h1><p>Initialisation de ta bibliothèque de révision.</p></div>`;
  if(state.error)return`${renderTop('MOOC Révision','Erreur de chargement')}<div class="panel hero"><h1>Impossible de charger les fiches</h1><p>${esc(state.error)}</p><button class="full" id="retrySeed">Réessayer</button></div>`;
  const c=counts();
  return`${renderTop('MOOC Révision','Répétition espacée FSRS-6')}<div class="panel hero"><h1>${c.due?`${c.due} carte${c.due>1?'s':''} à réviser`:'Tout est à jour'}</h1><p>${c.due?'Tu peux tout mélanger ou choisir un cours ci-dessous.':'Aucune carte n’est due pour le moment.'}</p><div class="stats"><div class="stat"><b>${c.due}</b><span>À revoir</span></div><div class="stat"><b>${c.newc}</b><span>Nouvelles</span></div><div class="stat"><b>${c.learned}</b><span>Apprises</span></div></div><div style="height:16px"></div><button class="full" id="startStudy" ${c.due?'':'disabled'}>${c.due?'Tout réviser (mélangé)':'Rien à réviser'}</button></div><div class="section-title">Réviser par cours</div><div class="course-grid">${courseCardsMarkup()}</div>${isIOS()&&!isStandalone()?installPanel():''}`;
}
function study(){const c=state.session[state.index];if(!c)return home();const ints=[1,2,3,4].map(g=>reviewCalc(progressFor(c.id),g).interval);return`${renderTop(`Révision ${state.index+1}/${state.session.length}`)}<div class="card study-card"><div class="row spread"><span class="subject-pill">${esc(courseName(c))}</span><span class="muted">${esc(c.chapter||'')}</span></div>${!state.revealed?`<h2>${esc(c.prompt)}</h2><button id="reveal" class="secondary full">Afficher la réponse</button>`:`<div class="answer"><b>${esc(c.answer)}</b>${c.explanation?`<div class="explanation">${esc(c.explanation)}</div>`:''}</div><div class="grade-grid"><button class="grade again" data-grade="1">Encore<small>${formatInterval(ints[0])}</small></button><button class="grade hard" data-grade="2">Difficile<small>${formatInterval(ints[1])}</small></button><button class="grade good" data-grade="3">Bien<small>${formatInterval(ints[2])}</small></button><button class="grade easy" data-grade="4">Facile<small>${formatInterval(ints[3])}</small></button></div>`}</div>`;}
function library(){
  return`${renderTop('Cours',`${courseNames().length} cours · ${state.cards.length} cartes`)}<div class="section-title">Mes cours</div><div class="course-grid">${courseCardsMarkup()}</div><div class="section-title">Gestion</div><div class="panel"><button class="full secondary" id="importPack">Importer un pack JSON</button><p class="muted">Une mise à jour garde l’historique FSRS des cartes ayant le même ID.</p></div>`;
}
function coursePage(){
  const course=state.selectedCourse;
  if(!course)return library();
  const c=counts(course),chapters=chapterSummary(course);
  return`${renderTop(course,`${c.total} cartes`)}<button class="back-link" id="backLibrary">← Tous les cours</button><div class="panel hero course-hero"><h1>${c.due?`${c.due} carte${c.due>1?'s':''} à revoir`:'Cours à jour'}</h1><p>Révise uniquement les cartes de ce cours. Les intervalles FSRS restent propres à chaque carte.</p><div class="stats"><div class="stat"><b>${c.due}</b><span>À revoir</span></div><div class="stat"><b>${c.newc}</b><span>Nouvelles</span></div><div class="stat"><b>${c.learned}</b><span>Apprises</span></div></div><div style="height:16px"></div><button class="full" id="startCourseStudy" ${c.due?'':'disabled'}>${c.due?'Réviser ce cours':'Rien à réviser'}</button></div><div class="section-title">Chapitres</div><div class="list chapter-list">${chapters.map(ch=>`<div class="list-item chapter-item"><b>${esc(ch.name)}</b><span>${ch.count} carte${ch.count>1?'s':''}</span></div>`).join('')}</div>`;
}
function statsPage(){const c=counts(),reviews=Object.values(state.progress).reduce((a,p)=>a+(p.reviewCount||0),0),lapses=Object.values(state.progress).reduce((a,p)=>a+(p.lapseCount||0),0);return`${renderTop('Statistiques')}<div class="stats"><div class="stat"><b>${reviews}</b><span>Réponses</span></div><div class="stat"><b>${lapses}</b><span>Oublis</span></div><div class="stat"><b>${c.learned}/${c.total}</b><span>Étudiées</span></div></div>`;}
function settings(){return`${renderTop('Réglages')}<div class="panel"><div class="row spread"><b>Rétention cible</b><b>${Math.round(state.settings.retention*100)}%</b></div><input id="retention" type="range" min="80" max="97" step="1" value="${Math.round(state.settings.retention*100)}"><p class="muted">90 % par défaut. Une valeur plus élevée implique davantage de révisions.</p></div><div class="panel"><button class="full secondary" id="exportBackup">Exporter une sauvegarde</button><div style="height:10px"></div><button class="full secondary" id="importBackup">Restaurer une sauvegarde</button><div style="height:10px"></div><button class="full ghost" id="resetProgress">Réinitialiser la progression</button></div>${installPanel()}`;}
function render(){let body=state.tab==='study'?study():state.tab==='course'?coursePage():state.tab==='library'?library():state.tab==='stats'?statsPage():state.tab==='settings'?settings():home();app.innerHTML=`<div class="shell">${body}</div>${state.tab==='study'?'':nav()}`;bind();}
function startStudy(course=null){state.session=dueCards(course);state.sessionCourse=course;state.index=0;state.revealed=false;state.tab='study';render();}
function grade(g){const c=state.session[state.index];if(!c)return;state.progress[c.id]=reviewCalc(progressFor(c.id),g).progress;save();state.index++;state.revealed=false;if(state.index>=state.session.length){state.tab=state.sessionCourse?'course':'home';state.session=[];state.sessionCourse=null;toast('Session terminée');}render();}
function downloadJSON(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportBackup(){downloadJSON({type:'mooc-revision-backup',version:2,exportedAt:new Date().toISOString(),cards:state.cards,packs:state.packs,progress:state.progress,settings:state.settings},`mooc-revision-backup-${new Date().toISOString().slice(0,10)}.json`);}
function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
  document.getElementById('startStudy')?.addEventListener('click',()=>startStudy());
  document.querySelectorAll('[data-course]').forEach(b=>b.addEventListener('click',()=>{state.selectedCourse=b.dataset.course;state.tab='course';render();}));
  document.getElementById('backLibrary')?.addEventListener('click',()=>{state.tab='library';render();});
  document.getElementById('startCourseStudy')?.addEventListener('click',()=>startStudy(state.selectedCourse));
  document.getElementById('reveal')?.addEventListener('click',()=>{state.revealed=true;render();});
  document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(Number(b.dataset.grade)));
  document.getElementById('importPack')?.addEventListener('click',()=>packInput.click());
  document.getElementById('retention')?.addEventListener('input',e=>{state.settings.retention=Number(e.target.value)/100;save();render();});
  document.getElementById('exportBackup')?.addEventListener('click',exportBackup);
  document.getElementById('importBackup')?.addEventListener('click',()=>backupInput.click());
  document.getElementById('resetProgress')?.addEventListener('click',()=>{if(confirm('Effacer toute la progression FSRS ?')){state.progress={};save();render();}});
  document.getElementById('retrySeed')?.addEventListener('click',seed);
}
packInput.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{mergePack(JSON.parse(await f.text()));render();}catch(err){alert('Fichier invalide : '+err.message);}e.target.value='';});
backupInput.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const b=JSON.parse(await f.text());if(b.type!=='mooc-revision-backup')throw new Error('Ce fichier n’est pas une sauvegarde');state.cards=b.cards||[];state.packs=b.packs||{};state.progress=b.progress||{};state.settings=b.settings||{retention:.90};save();render();}catch(err){alert('Sauvegarde invalide : '+err.message);}e.target.value='';});
async function seed(){
  state.loading=true;state.error=null;render();
  try{
    const sources=[
      './starter_questions.json?v=10',
      './python_types_extra.json?v=10',
      './probabilities_extra.json?v=10',
      './statistics_extra.json?v=10',
      './linear_algebra_extra.json?v=10',
      './databases_extra.json?v=10',
      './linux_extra.json?v=10'
    ];
    const packs=await Promise.all(sources.map(async src=>{
      const response=await fetch(src,{cache:'no-store'});
      if(!response.ok)throw new Error(`Pack indisponible : ${src} (${response.status})`);
      return response.json();
    }));
    packs.forEach(pack=>mergePack(pack,false));
    state.loading=false;save();render();
  }catch(err){
    console.error(err);state.loading=false;state.error=err?.message||String(err);render();
  }
}
load();render();seed();
