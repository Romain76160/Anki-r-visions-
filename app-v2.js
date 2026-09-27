const STORAGE_KEY='moocRevisionPWA.v2';
const DAY=86400000, MIN=60000;
const W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];

let state={cards:[],packs:{},progress:{},settings:{retention:.90},tab:'home',selectedCourse:null,selectedSheet:'BGD701',sessionCourse:null,session:[],index:0,revealed:false,loading:true,error:null};
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
const COURSE_ORDER=['BGD701','Statistiques','Bases de données','Algèbre linéaire','Probabilités','Python','Hadoop','Linux'];
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
function nav(){return`<div class="nav"><div class="nav-inner">${navButton('home','Révision')}${navButton('library','Bibliothèque')}${navButton('sheets','Fiches')}${navButton('stats','Stats')}${navButton('settings','Réglages')}</div></div>`;}
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

const REVISION_SHEETS={
'BGD701':{subtitle:'Big Data, sockets, systèmes distribués et MapReduce',sections:[
{title:'1. Architecture distribuée',bullets:[
'<b>Scale up</b> : augmenter CPU/RAM d’une machine. Simple mais limité et coûteux.',
'<b>Scale out</b> : ajouter plusieurs machines et répartir le travail. C’est l’approche classique du Big Data.',
'Distribuer augmente capacité, parallélisme et tolérance aux pannes, mais ajoute réseau, synchronisation et pannes partielles.',
'Le gain n’est jamais parfaitement linéaire : une partie séquentielle ou des échanges réseau finissent par limiter les performances.'
]},
{title:'2. Sockets TCP — client/serveur',bullets:[
'TCP fournit un <b>flux d’octets fiable et ordonné</b>. Il ne conserve pas les frontières entre messages.',
'Serveur : <code>socket() → bind() → listen() → accept()</code>. Client : <code>socket() → connect()</code>.',
'<code>bind()</code> associe IP/port ; <code>listen()</code> met en écoute ; <code>accept()</code> crée un socket connecté à un client précis.',
'<code>127.0.0.1</code> = local uniquement ; <code>0.0.0.0</code> = toutes les interfaces réseau.',
'Les sockets manipulent des bytes : <code>encode("utf-8")</code> avant envoi, <code>decode("utf-8")</code> après réception.',
'<code>send()</code> peut envoyer partiellement ; <code>sendall()</code> poursuit jusqu’à avoir envoyé tous les octets.'
]},
{title:'3. recv(), fragmentation et framing',bullets:[
'<code>recv(1024)</code> veut dire recevoir au plus 1024 octets, pas recevoir un message complet.',
'Un message peut être fragmenté sur plusieurs recv ; plusieurs send peuvent arriver ensemble dans un recv.',
'Le <b>framing</b> recrée des frontières de messages : délimiteur ou longueur préfixée.',
'Format robuste : <code>[longueur sur 4 octets][JSON UTF-8]</code>.',
'<code>struct.pack("!I", n)</code> encode un entier non signé 32 bits en ordre réseau.',
'<code>recevoir_exactement(sock,n)</code> boucle jusqu’à n octets ou détecte une fermeture prématurée.'
]},
{title:'4. JSON et protocole applicatif',bullets:[
'Envoi : <code>json.dumps(obj).encode("utf-8")</code>, calcul de la taille, envoi de l’en-tête puis du payload.',
'Réception : lire 4 octets, décoder la longueur, lire exactement cette taille, puis <code>json.loads()</code>.',
'Le protocole doit définir requêtes, réponses, erreurs et taille maximale acceptée.',
'Une limite de taille empêche un client malveillant ou buggé de forcer une allocation énorme.'
]},
{title:'5. Threads et concurrence',bullets:[
'Un serveur séquentiel traite un client à la fois ; un client lent bloque les suivants.',
'Un thread par client permet plusieurs connexions simultanées.',
'<code>start()</code> lance réellement le thread ; <code>join()</code> attend sa fin.',
'Une <b>race condition</b> apparaît quand le résultat dépend de l’ordre des accès concurrents.',
'<code>threading.Lock()</code> protège une donnée partagée ou une section critique.',
'<code>ThreadPoolExecutor</code> limite et réutilise un pool de threads.'
]},
{title:'6. Réplication et partitionnement',bullets:[
'<b>Réplication</b> : plusieurs copies d’une même donnée → disponibilité et lectures, mais risque de retard de réplication.',
'<b>Partitionnement</b> : données différentes réparties entre machines → capacité et répartition de charge.',
'Partitionnement par plage : pratique pour les intervalles mais risque de hotspot.',
'Partitionnement par hash : répartition plus homogène, moins naturel pour les requêtes par plage.',
'Mesurer les latences avec p50/p95/p99 : la moyenne seule masque souvent la longue traîne.',
'Un timeout ne prouve pas une panne : la machine peut seulement être lente ou isolée temporairement.'
]},
{title:'7. CAP',bullets:[
'C = cohérence, A = disponibilité, P = tolérance aux partitions réseau.',
'Lors d’une <b>partition réseau</b>, il faut arbitrer entre cohérence et disponibilité.',
'CAP ne veut pas dire choisir arbitrairement deux propriétés sur trois en permanence.'
]},
{title:'8. MapReduce',bullets:[
'<div class="flow">Entrée → Map → Shuffle → Reduce → Sortie</div>',
'<b>Map</b> transforme les entrées en paires clé-valeur.',
'<b>Shuffle</b> regroupe toutes les valeurs d’une même clé et les envoie au bon reducer.',
'<b>Reduce</b> agrège les valeurs de chaque clé.',
'WordCount : map émet <code>(mot,1)</code>, shuffle regroupe les mots, reduce additionne.'
]},
{title:'9. Partitionnement, shuffle et combiner',bullets:[
'Choix classique du reducer : <code>hash(clé) % R</code>. Le hash doit être déterministe entre machines.',
'Le <code>hash()</code> Python standard peut varier entre exécutions : utiliser un hash déterministe.',
'Avec M mappers et R reducers, on peut produire jusqu’à <b>M × R</b> partitions intermédiaires.',
'Le shuffle coûte cher : sérialisation, disque, tri et réseau.',
'Le <b>combiner</b> pré-agrège localement pour réduire le trafic.',
'Piège : moyenne des moyennes incorrecte si tailles différentes ; transporter <code>(somme,effectif)</code>.'
]},
{title:'10. Maître, workers et robustesse',bullets:[
'Le maître orchestre : attribution des tâches, suivi, détection des échecs, relance.',
'Les workers réalisent réellement les maps et reduces.',
'Une tâche échouée peut être redistribuée sur un autre worker.',
'Écrire dans <code>.tmp</code> puis faire <code>os.replace()</code> évite de publier un fichier partiellement écrit.'
]},
{title:'11. Loi d’Amdahl',bullets:[
'<div class="formula">S(p) = 1 / ( f + (1-f)/p )</div>',
'<code>f</code> = fraction séquentielle ; <code>p</code> = nombre de ressources parallèles.',
'Quand p tend vers l’infini : <b>Smax = 1/f</b>.',
'Si 10 % du programme est séquentiel, l’accélération maximale est 10×.',
'Réduire la fraction séquentielle peut être plus utile que continuer à ajouter des machines.'
]},
{title:'12. À savoir refaire sans aide',bullets:[
'Client et serveur TCP simples.',
'<code>recevoir_exactement()</code> et protocole JSON à longueur préfixée.',
'Serveur multithread avec Lock sur une ressource partagée.',
'Explication complète Map → Shuffle → Reduce.',
'Réplication vs partitionnement, CAP, p50/p95/p99.',
'Application numérique de la loi d’Amdahl.'
]}
]},
'Statistiques':{subtitle:'Estimation, tests, régressions et vraisemblance',sections:[
{title:'1. Estimation et échantillonnage',bullets:[
'Population = ensemble étudié ; échantillon = observations disponibles.',
'Un estimateur est une variable aléatoire utilisée pour approcher un paramètre inconnu.',
'Biais : <code>E[estimateur] - paramètre</code>. Variance : dispersion de l’estimateur.',
'La moyenne empirique estime l’espérance. La variance corrigée utilise généralement <code>1/(n-1)</code>.'
]},
{title:'2. LGN, TCL et loi normale',bullets:[
'La loi des grands nombres explique la convergence de la moyenne empirique vers l’espérance.',
'Le TCL explique pourquoi une moyenne correctement centrée/réduite devient approximativement normale sous conditions.',
'Standardisation : <code>Z=(X-μ)/σ</code>.',
'Le TCL justifie de nombreux intervalles de confiance et tests asymptotiques.'
]},
{title:'3. Intervalles de confiance',bullets:[
'Forme générale : <code>estimateur ± quantile × erreur standard</code>.',
'À 95 %, la procédure couvre le vrai paramètre environ 95 % des répétitions d’échantillonnage.',
'Quand n augmente, l’erreur standard diminue souvent comme <code>1/√n</code>.',
'Un intervalle de prédiction est plus large qu’un intervalle sur la moyenne prédite car il inclut la variabilité individuelle de Y.'
]},
{title:'4. Tests et A/B tests',bullets:[
'<code>H0</code> = hypothèse de référence ; <code>H1</code> = hypothèse alternative.',
'La p-value mesure à quel point les données sont extrêmes sous H0.',
'Si <code>p-value < α</code>, on rejette H0 au niveau α.',
'Type I : rejeter H0 vraie. Type II : ne pas rejeter H0 fausse. Puissance = probabilité de détecter un effet réel.',
'Un A/B test exige randomisation, métrique, taille et durée correctement définies.'
]},
{title:'5. Régression linéaire',bullets:[
'Modèle simple : <code>Y = β0 + β1X + ε</code>.',
'<code>β1</code> = variation moyenne de Y pour +1 unité de X.',
'Moindres carrés : minimiser la somme des carrés des résidus <code>yi-ŷi</code>.',
'<code>R²</code> mesure la part de variance expliquée mais ne prouve aucune causalité.',
'Tester <code>H0:β1=0</code> permet de savoir si la pente est statistiquement différente de zéro.'
]},
{title:'6. Régression multiple et validation',bullets:[
'<code>Y = β0 + β1X1 + ... + βpXp + ε</code>.',
'Chaque coefficient s’interprète toutes choses égales par ailleurs.',
'La multicolinéarité rend les coefficients instables et augmente leurs erreurs standards.',
'Un seul train/test split donne une mesure variable ; la cross-validation est plus robuste.',
'Erreur train faible mais test élevée = signe possible de surapprentissage.'
]},
{title:'7. Modèle linéaire gaussien',bullets:[
'Hypothèses classiques : linéarité, erreurs centrées, indépendance, variance constante et normalité pour certaines inférences.',
'Hétéroscédasticité = variance des résidus qui dépend de X.',
'Les graphiques de résidus servent à repérer non-linéarité, variance non constante et points atypiques.'
]},
{title:'8. Maximum de vraisemblance',bullets:[
'La vraisemblance mesure à quel point un paramètre rend les données observées plausibles.',
'On maximise souvent la log-vraisemblance, plus simple numériquement.',
'L’estimateur dépend du modèle probabiliste choisi.'
]},
{title:'9. Régression logistique',bullets:[
'Pour une cible binaire : <code>P(Y=1|X)=σ(β0+βᵀX)</code>.',
'<code>σ(z)=1/(1+e^-z)</code> transforme un score réel en probabilité.',
'Les coefficients agissent sur le log-odds.',
'Accuracy seule peut tromper si les classes sont déséquilibrées.'
]},
{title:'10. Analyse convexe',bullets:[
'Dans un problème convexe, tout minimum local est aussi global.',
'Le gradient indique la direction de plus forte augmentation.',
'La descente de gradient avance dans la direction opposée pour minimiser une fonction.'
]}
]},
'Probabilités':{subtitle:'Lois, moments, variables continues et conditionnement',sections:[
{title:'1. Bases et conditionnement',bullets:[
'<code>P(A∩B)</code> = A et B ensemble.',
'<code>P(A|B)=P(A∩B)/P(B)</code> si <code>P(B)>0</code>.',
'Indépendance : <code>P(A∩B)=P(A)P(B)</code>.',
'Bayes : <code>P(A|B)=P(B|A)P(A)/P(B)</code>.',
'La formule des probabilités totales décompose un événement suivant une partition.'
]},
{title:'2. Lois discrètes',bullets:[
'Bernoulli(p) : E[X]=p, Var(X)=p(1-p).',
'Binomiale(n,p) : E[X]=np, Var(X)=np(1-p).',
'Géométrique(p) : attente jusqu’au premier succès ; propriété sans mémoire.',
'Poisson(λ) : comptage d’événements ; E[X]=Var(X)=λ.'
]},
{title:'3. Espérance, variance, covariance',bullets:[
'<code>E[X]=Σ xP(X=x)</code> en discret.',
'Transfert : <code>E[g(X)] = Σ g(x)P(X=x)</code> ou intégrale en continu.',
'<code>Var(X)=E[X²]-E[X]²</code> et <code>Var(aX+b)=a²Var(X)</code>.',
'<code>Cov(X,Y)=E[XY]-E[X]E[Y]</code>.',
'Corrélation = covariance normalisée entre -1 et 1.'
]},
{title:'4. Variables continues',bullets:[
'Une densité est positive et son intégrale totale vaut 1.',
'Pour une variable continue : <code>P(X=x)=0</code>.',
'<code>P(a≤X≤b)=∫ f(x)dx</code> entre a et b.',
'<code>F(x)=P(X≤x)</code> est la fonction de répartition.',
'<code>E[X]=∫xf(x)dx</code> si elle existe.'
]},
{title:'5. Matrice de covariance et vecteurs gaussiens',bullets:[
'Diagonale = variances ; hors diagonale = covariances.',
'La matrice de covariance est symétrique et positive semi-définie.',
'Un vecteur gaussien est caractérisé par moyenne et covariance.',
'Si <code>Y=AX+b</code> : <code>E[Y]=AE[X]+b</code>, <code>Cov(Y)=A Cov(X) Aᵀ</code>.'
]},
{title:'6. Espérance conditionnelle',bullets:[
'<code>E[X|Y]</code> est une variable aléatoire fonction de Y.',
'Elle représente la meilleure prédiction quadratique de X connaissant Y.',
'Tour d’espérance : <code>E[E[X|Y]]=E[X]</code>.'
]}
]},
'Algèbre linéaire':{subtitle:'Orthogonalité, projections, diagonalisation et SVD',sections:[
{title:'1. Produit scalaire et orthogonalité',bullets:[
'<code>xᵀy = Σxi yi</code>.',
'<code>||x||=√(xᵀx)</code>.',
'Orthogonalité : <code>xᵀy=0</code>.',
'Base orthonormée : vecteurs unitaires orthogonaux deux à deux.',
'<code>cos θ=(xᵀy)/(||x||||y||)</code>.'
]},
{title:'2. Projection orthogonale',bullets:[
'<code>proj_u(x)=(xᵀu/uᵀu)u</code>.',
'Si u est unitaire : <code>proj_u(x)=(xᵀu)u</code>.',
'La projection sur un sous-espace est le point du sous-espace le plus proche.',
'Moindres carrés : <code>Ax̂</code> est la projection de b sur l’espace colonne de A.',
'Équations normales : <code>AᵀAx̂=Aᵀb</code>.'
]},
{title:'3. Diagonalisation',bullets:[
'<code>Av=λv</code> définit un vecteur propre.',
'Valeurs propres : racines de <code>det(A-λI)=0</code>.',
'Si A a une base de vecteurs propres : <code>A=PDP⁻¹</code>.',
'Alors <code>A^k=PD^kP⁻¹</code>.',
'Une matrice symétrique réelle vérifie <code>A=QΛQᵀ</code> avec Q orthogonale.'
]},
{title:'4. SVD',bullets:[
'<code>A=UΣVᵀ</code>.',
'U et V ont des colonnes orthonormées ; Σ contient les valeurs singulières.',
'Les valeurs singulières sont les racines carrées des valeurs propres de <code>AᵀA</code>.',
'Le rang est le nombre de valeurs singulières non nulles.',
'La SVD sert à compression, réduction de dimension, pseudo-inverse et moindres carrés.',
'L’approximation de rang k conserve les k plus grandes valeurs singulières.'
]}
]},
'Python':{subtitle:'Bases du langage et types',sections:[
{title:'1. Types de base',bullets:[
'Python est dynamiquement typé : les variables référencent des objets.',
'Types fréquents : <code>int</code>, <code>float</code>, <code>bool</code>, <code>str</code>, <code>NoneType</code>.',
'<code>type(x)</code> donne le type ; <code>isinstance(x,T)</code> teste un type.',
'Conversions : <code>int()</code>, <code>float()</code>, <code>str()</code>, <code>bool()</code>.'
]},
{title:'2. Collections',bullets:[
'<b>list</b> : ordonnée, mutable, doublons autorisés.',
'<b>tuple</b> : ordonné, immutable.',
'<b>set</b> : éléments uniques, efficace pour appartenance et opérations ensemblistes.',
'<b>dict</b> : association clé → valeur ; les clés doivent être hashables.',
'Slicing : <code>a[start:stop:step]</code>, avec stop exclu.'
]},
{title:'3. Mutabilité et références',bullets:[
'Deux variables peuvent référencer le même objet mutable.',
'<code>==</code> compare les valeurs ; <code>is</code> compare l’identité.',
'Modifier une liste via une référence modifie le même objet pour les autres références.',
'Une copie superficielle ne duplique pas forcément les objets imbriqués.'
]},
{title:'4. Contrôle et fonctions',bullets:[
'<code>if / elif / else</code> pour les conditions ; <code>for</code> et <code>while</code> pour les boucles.',
'<code>range()</code> génère une séquence d’entiers.',
'<code>def</code> définit une fonction ; <code>return</code> renvoie un résultat.',
'<code>try / except / finally</code> gère les exceptions.',
'Lire la dernière ligne pertinente de la traceback est souvent le moyen le plus rapide de diagnostiquer un bug.'
]}
]},
'Bases de données':{subtitle:'Transactions, NoSQL, NewSQL et compromis',sections:[
{title:'1. Transactions ACID',bullets:[
'<b>Atomicité</b> : tout ou rien.',
'<b>Cohérence</b> : les contraintes restent satisfaites.',
'<b>Isolation</b> : les transactions concurrentes ne produisent pas d’état incohérent.',
'<b>Durabilité</b> : après commit, les données persistent malgré une panne.'
]},
{title:'2. Limites du relationnel',bullets:[
'Schéma strict et jointures sont très puissants mais peuvent devenir contraignants à très grande échelle.',
'Les jointures distribuées coûtent cher.',
'Le scale up a des limites matérielles et économiques.',
'Des workloads massifs poussent vers partitionnement, réplication ou modèles spécialisés.'
]},
{title:'3. NoSQL — principes',bullets:[
'NoSQL regroupe plusieurs familles : documents, graphes, clé/valeur, colonnes larges.',
'Objectifs fréquents : scalabilité horizontale, schéma flexible, haute disponibilité.',
'La dénormalisation duplique parfois des données pour éviter des jointures coûteuses.',
'Le modèle doit être choisi en fonction des requêtes principales.'
]},
{title:'4. Documents',bullets:[
'Stockage de documents structurés, souvent proches de JSON.',
'Structure plus flexible qu’une table relationnelle.',
'Adapté quand les données d’un objet métier sont naturellement regroupées.',
'Les index restent essentiels pour les performances.'
]},
{title:'5. Graphes, XML et RDF',bullets:[
'Une base graphe représente explicitement nœuds et relations.',
'Très adaptée aux parcours de relations et dépendances.',
'RDF utilise des triplets sujet-prédicat-objet.'
]},
{title:'6. Clé/valeur et colonnes larges',bullets:[
'Clé/valeur : accès direct très rapide par clé, requêtes complexes limitées.',
'Colonnes larges : grandes tables distribuées organisées autour d’une clé de partition.',
'Une mauvaise clé de partition peut créer un hotspot.'
]},
{title:'7. NewSQL et performances',bullets:[
'NewSQL cherche SQL + transactions fortes + scalabilité distribuée.',
'Aucun modèle n’est optimal pour tous les usages.',
'Choisir selon volume, lectures/écritures, transactions, cohérence, latence et disponibilité.',
'Un index accélère les lectures mais consomme du stockage et ralentit les écritures.'
]}
]},
'Hadoop':{subtitle:'HDFS, YARN, MapReduce, configuration et ZooKeeper',sections:[
{title:'1. Architecture',bullets:[
'<b>HDFS</b> stocke les données ; <b>YARN</b> gère les ressources ; MapReduce réalise le calcul distribué.',
'NameNode = métadonnées HDFS ; DataNodes = blocs de données.',
'ResourceManager = orchestration YARN ; NodeManagers = exécution sur les workers.'
]},
{title:'2. Commandes HDFS',bullets:[
'<code>hdfs dfs -ls</code> lister ; <code>-mkdir -p</code> créer.',
'<code>-put</code> local → HDFS ; <code>-get</code> HDFS → local.',
'<code>-cat</code> lire ; <code>-du -h</code> mesurer ; <code>-rm -r</code> supprimer.',
'Le chemin HDFS est distinct du système de fichiers local.'
]},
{title:'3. Démarrage et diagnostic HDFS',bullets:[
'<code>start-dfs.sh</code> / <code>stop-dfs.sh</code>.',
'<code>hdfs dfsadmin -report</code> affiche DataNodes et capacités.',
'<code>jps</code> vérifie quels démons Java tournent.',
'<code>hdfs namenode -format</code> initialise un nouveau NameNode : ne pas le relancer sur des données à conserver.',
'Les scripts Hadoop utilisent SSH pour démarrer les services à distance.'
]},
{title:'4. YARN',bullets:[
'<code>start-yarn.sh</code> démarre ResourceManager et NodeManagers.',
'<code>yarn node -list</code> vérifie les workers enregistrés.',
'<code>yarn application -status APP_ID</code> suit une application.',
'ResourceManager attribue les ressources ; NodeManagers exécutent les conteneurs.'
]},
{title:'5. MapReduce Hadoop',bullets:[
'<code>hadoop jar ... wordcount /input /output</code> lance un job.',
'Le dossier de sortie ne doit généralement pas déjà exister.',
'Résultats typiques : fichiers <code>part-r-00000</code>.',
'Map → Shuffle → Reduce reste le modèle conceptuel central.'
]},
{title:'6. Configuration',bullets:[
'<code>core-site.xml</code> : paramètres communs, dont <code>fs.defaultFS</code>.',
'<code>hdfs-site.xml</code> : réplication et stockage HDFS.',
'<code>yarn-site.xml</code> : ResourceManager, NodeManagers, shuffle.',
'<code>mapred-site.xml</code> : exécution MapReduce.',
'<code>workers</code> : machines ciblées par les scripts.'
]},
{title:'7. Dépannage',bullets:[
'<b>Disk quota exceeded</b> : distinguer quota, disque local, HDFS et répertoires temporaires.',
'Worker absent de <code>yarn node -list</code> : regarder NodeManager, réseau et configuration.',
'DataNode absent de <code>hdfs dfsadmin -report</code> : regarder HDFS, réseau et logs.',
'Identifier le nœud exact et lire les logs avant de relancer à l’aveugle.'
]},
{title:'8. ZooKeeper',bullets:[
'ZooKeeper fournit coordination distribuée, élection de leader et synchronisation.',
'Un ensemble de serveurs forme un quorum.',
'Un nombre impair de serveurs facilite l’obtention d’une majorité malgré les pannes.'
]}
]},
'Linux':{subtitle:'Commandes, shell, permissions, réseau et SSH',sections:[
{title:'1. Navigation et fichiers',bullets:[
'<code>pwd</code>, <code>ls</code>, <code>cd</code>.',
'<code>mkdir</code>, <code>touch</code>, <code>cp</code>, <code>mv</code>, <code>rm</code>.',
'<code>.</code> = courant ; <code>..</code> = parent ; <code>~</code> = home.',
'Chemin absolu part de <code>/</code> ; chemin relatif part du dossier courant.'
]},
{title:'2. Lecture, recherche et redirections',bullets:[
'<code>cat</code>, <code>less</code>, <code>head</code>, <code>tail</code>.',
'<code>grep</code> recherche du texte.',
'<code>|</code> relie stdout d’une commande à stdin de la suivante.',
'<code>></code> remplace ; <code>>></code> ajoute ; <code>2></code> redirige stderr.'
]},
{title:'3. Processus et ressources',bullets:[
'<code>ps</code>, <code>top</code>, <code>kill</code>.',
'<code>df -h</code> mesure les systèmes de fichiers ; <code>du -sh</code> mesure un dossier.',
'<code>free -h</code> affiche la mémoire.',
'<code>sudo</code> exécute une commande avec des privilèges élevés selon les droits.'
]},
{title:'4. Permissions',bullets:[
'<code>r</code> lecture, <code>w</code> écriture, <code>x</code> exécution.',
'Permissions séparées pour propriétaire, groupe, autres.',
'<code>chmod 700 ~/.ssh</code> et <code>chmod 600 ~/.ssh/authorized_keys</code> sont des réglages SSH classiques.',
'Des permissions trop ouvertes peuvent faire refuser la clé par SSH.'
]},
{title:'5. SSH et clés',bullets:[
'<code>ssh user@machine</code> ouvre une session chiffrée distante.',
'La clé privée reste sur le client ; la clé publique va dans <code>authorized_keys</code> du serveur.',
'<b>Permission denied (publickey)</b> = authentification par clé échouée.',
'<b>Connection refused</b> = aucun service n’accepte la connexion sur le port ou rejet immédiat.',
'<code>nc -vz hôte 22</code> permet de tester l’ouverture du port SSH.'
]},
{title:'6. Réseau et services',bullets:[
'<code>ip addr</code> affiche interfaces et IP.',
'<code>ss -lntp</code> affiche les ports TCP en écoute.',
'<code>curl</code> permet de tester HTTP/HTTPS.',
'Un service lié à <code>127.0.0.1</code> peut fonctionner localement mais rester inaccessible depuis une autre machine.'
]},
{title:'7. Environnement',bullets:[
'<code>echo $PATH</code> affiche les dossiers de recherche des exécutables.',
'<code>export VAR=valeur</code> définit une variable pour le shell courant.',
'Ajouter un export dans <code>~/.bashrc</code> puis <code>source ~/.bashrc</code> le rend disponible dans les sessions bash suivantes.',
'<code>which commande</code> indique quel exécutable est utilisé.'
]},
{title:'8. Disque et quotas',bullets:[
'<b>No space left on device</b> : disque ou inodes saturés.',
'<b>Disk quota exceeded</b> : quota du compte/projet atteint même si le disque global a encore de la place.',
'Distinguer espace local, HDFS et quota est essentiel en dépannage.'
]}
]}
};

function revisionSheets(){
  const names=COURSE_ORDER.filter(function(name){return REVISION_SHEETS[name];});
  const selected=REVISION_SHEETS[state.selectedSheet]?state.selectedSheet:names[0];
  const sheet=REVISION_SHEETS[selected];
  const selectors=names.map(function(name){
    return '<button class="sheet-course '+(name===selected?'active':'')+'" data-sheet-course="'+esc(name)+'"><b>'+esc(name)+'</b><small>'+REVISION_SHEETS[name].sections.length+' parties</small></button>';
  }).join('');
  const sections=sheet.sections.map(function(section){
    return '<section class="panel revision-sheet"><h2>'+section.title+'</h2><ul>'+section.bullets.map(function(item){return '<li>'+item+'</li>';}).join('')+'</ul></section>';
  }).join('');
  return renderTop('Fiches de révision','Une fiche complète par cours')
    +'<div class="section-title">Choisir un cours</div>'
    +'<div class="sheet-course-grid">'+selectors+'</div>'
    +'<div class="panel sheet-intro"><span class="subject-pill">'+esc(selected)+'</span><h1>'+esc(sheet.subtitle)+'</h1><p class="muted">Synthèse structurée du cours : définitions, formules, commandes, pièges et points à savoir refaire.</p></div>'
    +'<div class="sheet-grid">'+sections+'</div>';
}
function statsPage(){const c=counts(),reviews=Object.values(state.progress).reduce((a,p)=>a+(p.reviewCount||0),0),lapses=Object.values(state.progress).reduce((a,p)=>a+(p.lapseCount||0),0);return`${renderTop('Statistiques')}<div class="stats"><div class="stat"><b>${reviews}</b><span>Réponses</span></div><div class="stat"><b>${lapses}</b><span>Oublis</span></div><div class="stat"><b>${c.learned}/${c.total}</b><span>Étudiées</span></div></div>`;}
function settings(){return`${renderTop('Réglages')}<div class="panel"><div class="row spread"><b>Rétention cible</b><b>${Math.round(state.settings.retention*100)}%</b></div><input id="retention" type="range" min="80" max="97" step="1" value="${Math.round(state.settings.retention*100)}"><p class="muted">90 % par défaut. Une valeur plus élevée implique davantage de révisions.</p></div><div class="panel"><button class="full secondary" id="exportBackup">Exporter une sauvegarde</button><div style="height:10px"></div><button class="full secondary" id="importBackup">Restaurer une sauvegarde</button><div style="height:10px"></div><button class="full ghost" id="resetProgress">Réinitialiser la progression</button></div>${installPanel()}`;}
function render(){let body=state.tab==='study'?study():state.tab==='course'?coursePage():state.tab==='library'?library():state.tab==='sheets'?revisionSheets():state.tab==='stats'?statsPage():state.tab==='settings'?settings():home();app.innerHTML=`<div class="shell">${body}</div>${state.tab==='study'?'':nav()}`;bind();}
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
  document.querySelectorAll('[data-sheet-course]').forEach(b=>b.onclick=()=>{state.selectedSheet=b.dataset.sheetCourse;save();render();});
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
      './starter_questions.json?v=11',
      './python_types_extra.json?v=11',
      './probabilities_extra.json?v=11',
      './statistics_extra.json?v=11',
      './linear_algebra_extra.json?v=11',
      './databases_extra.json?v=11',
      './linux_extra.json?v=11',
      './hadoop_extra.json?v=11',
      './bgd701_extra.json?v=12'
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
