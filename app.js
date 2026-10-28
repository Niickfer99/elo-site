import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
const configured=SUPABASE_URL.startsWith('https://')&&!SUPABASE_ANON_KEY.startsWith('COLE_');
const db=configured?createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATES='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const TRAITS=['Calmo(a)','Animado(a)','Risonho(a)','Brincalhão(ona)','Carinhoso(a)','Romântico(a)','Comunicativo(a)','Paciente','Tímido(a)','Extrovertido(a)','Introvertido(a)','Caseiro(a)','Aventureiro(a)','Criativo(a)','Organizado(a)','Espontâneo(a)','Sociável','Reservado(a)','Sensível','Bem-humorado(a)'];
const empty={display_name:'',birth_date:'',sex:'',state:'',city:'',height_cm:'',whatsapp:'',church:'',denomination:'',ministry:'',faith_time:'',favorite_verse:'',hobbies:'',bio:'',personality:[],wanted_traits:[],relationship_goal:'',min_age:'18',max_age:'35',location_preference:'all',height_preference:'any'};
const s={page:'home',user:null,me:null,profiles:[],interests:[],admin:[],profile:{...empty},step:0,photo:null,invite:'',selected:null,filters:{state:'all',min:'18',max:'50',trait:'',sort:'score'},message:'',busy:false,phone:null,images:{},notifications:[]};
function notify(t){s.message=t;render()}
function field(k,label,placeholder='',type='text'){return `<label>${label}<input data-field="${k}" type="${type}" value="${esc(s.profile[k])}" placeholder="${esc(placeholder)}" ${type==='number'?'min="0"':''}></label>`}
function select(k,label,options){return `<label>${label}<select data-field="${k}"><option value="">Selecione</option>${options.map(x=>`<option value="${esc(x)}" ${s.profile[k]===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`}
function radios(k,label,options){return `<fieldset><legend>${label}</legend>${options.map(([v,t])=>`<label class="radio"><input type="radio" name="${k}" data-field="${k}" value="${v}" ${s.profile[k]===v?'checked':''}> ${t}</label>`).join('')}</fieldset>`}
function traitPick(k,max){return `<div class="wrap">${TRAITS.map(t=>`<button class="chip ${s.profile[k].includes(t)?'selected':''}" data-trait="${k}" data-value="${esc(t)}" ${!s.profile[k].includes(t)&&s.profile[k].length>=max?'disabled':''}>${esc(t)}</button>`).join('')}</div>`}
function go(page){s.page=page;s.message='';render();window.scrollTo(0,0)}
async function rpc(fn,args={}){const {data,error}=await db.rpc(fn,args);if(error)throw error;return data}
async function refresh(){if(!db)return;const {data:{user}}=await db.auth.getUser();s.user=user;s.me=null;s.profiles=[];s.interests=[];s.admin=[];if(user){s.me=await rpc('my_profile');if(s.me?.status==='approved'){s.profiles=await rpc('directory')||[];s.interests=await rpc('my_interests')||[];if(s.me.is_admin)s.admin=await rpc('admin_queue')||[];await loadPhotos();await generateMatchNotifications();await loadNotifications()}}}
async function generateMatchNotifications(){
  if(!s.user || s.me?.status!=='approved')return;

  const now=Date.now();
  const thirtyDays=30*24*60*60*1000;

  const matches=s.profiles.filter(p=>{
    if(!p.approved_at)return false;

    const approved=Date.parse(p.approved_at);

    return Number.isFinite(approved)
      && approved<=now
      && now-approved<=thirtyDays
      && score(p)>=75;
  });

  for(const p of matches){
    await rpc('create_match_notification',{
      p_member:p.id
    });
  }
}async function loadNotifications(){
  if(!s.user || s.me?.status!=='approved'){
    s.notifications=[];
    return;
  }

  s.notifications=await rpc('my_notifications')||[];
}
async function loadPhotos(){const paths=[...s.profiles.map(p=>p.photo_path),s.me?.photo_path].filter(Boolean);const out={};await Promise.all(paths.map(async path=>{const {data,error}=await db.storage.from('elo-photos').createSignedUrl(path,600);if(!error)out[path]=data.signedUrl}));s.images=out}
function age(birth){let d=new Date(birth+'T12:00:00'),n=new Date();return n.getFullYear()-d.getFullYear()-(n.getMonth()<d.getMonth()||n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()?1:0)}
function score(p){if(!s.me)return null;const a=s.me;let aTraits=a.wanted_traits||[],bTraits=p.wanted_traits||[],aSelf=a.personality||[],bSelf=p.personality||[];const overlap=(want,have)=>want.length?want.filter(x=>have.includes(x)).length/want.length:0.5;let personality=(overlap(aTraits,bSelf)+overlap(bTraits,aSelf))/2;let ageFit=(p.age>=a.min_age&&p.age<=a.max_age&&age(a.birth_date)>=p.min_age&&age(a.birth_date)<=p.max_age)?1:0;let place=(a.state===p.state?1:0)+(a.city.toLowerCase()===p.city.toLowerCase()?1:0);let loc=(a.location_preference==='all'||a.location_preference==='state'&&a.state===p.state||a.location_preference==='city'&&place===2)?1:0;let faith=a.denomination===p.denomination?1:0.5;let goals=a.relationship_goal===p.goal?1:0.5;let hobbyWords=a.hobbies.toLowerCase().split(/[,;]+/).map(x=>x.trim()).filter(Boolean),other=p.hobbies.toLowerCase();let hobbies=hobbyWords.length?hobbyWords.filter(x=>other.includes(x)).length/hobbyWords.length:0;return Math.round(30*personality+25*faith+20*goals+15*((ageFit+loc)/2)+10*hobbies)}
function notificationBell(){
  if(!s.user || s.me?.status!=='approved')return '';

  const unread=s.notifications.filter(n=>!n.read_at).length;

  return `<button data-go="notifications">
    🔔 Avisos ${unread>0?'('+unread+')':''}
  </button>`;
}function nav(){const items=[['home','⌂ Início'],['explore','⌕ Explorar'],['requests','♡ Interesses'],['connections','♥ Conexões'],['account','♙ Perfil']];return `<header class="top"><div class="logo">elo.</div><div class="subtitle">CONEXÕES PELA FÉ</div><nav class="nav">${items.map(([k,v])=>`<button data-go="${k}" class="${s.page===k?'active':''}">${v}</button>`).join('')}</nav>${notificationBell()}</header>`}
function home(){return `<div class="hero"><span class="pill">Comunidade cristã por convite • 18+</span><h1>Conexões que começam na fé.</h1><p>Conheça pessoas com valores e interesses semelhantes, em um ambiente privado.</p>${!s.user?'<button data-go="auth">Entrar ou criar conta →</button>':`<button data-go="${s.me?.status==='approved'?'explore':s.me?'account':'signup'}">Continuar →</button>`}</div><div class="card"><h2>Um encontro de histórias e propósitos</h2><p>Perfis detalhados, filtros personalizados, afinidade estimada e WhatsApp liberado somente após aceitação.</p></div>`}
function auth(){return `<h2>Acessar o Elo</h2><div class="card"><label>E-mail<input id="email" type="email" autocomplete="email" placeholder="seu@email.com"></label><label>Senha<input id="password" type="password" autocomplete="current-password" placeholder="Mínimo de 8 caracteres"></label><div class="actions"><button data-action="login">Entrar</button><button class="secondary" data-action="register">Criar conta</button></div><p><button class="outline" data-action="reset">Esqueci minha senha</button></p><p class="muted small">Após criar a conta, confirme seu e-mail. Para finalizar o cadastro será necessário um convite válido.</p></div>`}
function signup(){const p=s.profile;const sections=[()=>`<label>Foto de perfil * (JPG, PNG ou WebP, até 5 MB)<input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="small">${s.photo?esc(s.photo.name):'Nenhuma foto selecionada'}</p>${field('display_name','Nome ou nome de exibição *')}${field('birth_date','Data de nascimento *','','date')}${radios('sex','Sexo *',[['male','Masculino'],['female','Feminino']])}${select('state','Estado *',STATES)}${field('city','Cidade *')}${field('height_cm','Altura em centímetros *','170','number')}${field('whatsapp','WhatsApp privado *','+5511999999999','tel')}  <hr> <h3>✝️ Sua caminhada cristã</h3>  ${field('church','Igreja que frequenta *')}  ${select('denomination','Denominação *',[   'Batista',   'Assembleia de Deus',   'Presbiteriana',   'Metodista',   'Quadrangular',   'Congregacional',   'Interdenominacional',   'Outra' ])}  ${field('ministry','Ministério em que serve *','Nenhum atualmente, se for o caso')}  ${select('faith_time','Tempo de caminhada cristã *',[   'Menos de 1 ano',   '1 a 3 anos',   '4 a 7 anos',   '8 a 15 anos',   'Mais de 15 anos',   'Desde a infância' ])}  ${field('favorite_verse','Versículo favorito *')}`,()=>`${field('church','Igreja que frequenta *')}${select('denomination','Denominação *',['Batista','Assembleia de Deus','Presbiteriana','Metodista','Quadrangular','Congregacional','Interdenominacional','Outra'])}${field('ministry','Ministério em que serve *','Nenhum atualmente, se for o caso')}${select('faith_time','Tempo de caminhada cristã *',['Menos de 1 ano','1 a 3 anos','4 a 7 anos','8 a 15 anos','Mais de 15 anos','Desde a infância'])}${field('favorite_verse','Versículo favorito *')}`,()=>`<label>Como você se define? * (até 6)</label>${traitPick('personality',6)}${field('hobbies','Hobbies *')}<label>Apresentação opcional<textarea data-field="bio">${esc(p.bio)}</textarea></label>`,()=>`${radios('relationship_goal','Objetivo do relacionamento *',[['serious','Relacionamento sério'],['friendship','Somente Amizade']])}<label>Características desejadas *</label>${traitPick('wanted_traits',20)}${field('min_age','Idade mínima *','','number')}${field('max_age','Idade máxima *','','number')}${radios('location_preference','Preferência de localização *',[['city','Mesma cidade'],['state','Mesmo estado'],['all','Qualquer lugar do Brasil']])}${radios('height_preference','Preferência de altura *',[['any','Sem preferência'],['taller','Mais alto(a)'],['shorter','Mais baixo(a)'],['similar','Altura semelhante']])}<p class="muted small">Ao concluir, você solicita aprovação da administração. Seu número não é público e só poderá ser consultado por uma conexão aceita.</p>`];return `<h2>${['Sobre você','Sua caminhada cristã','Sua personalidade','Suas preferências'][s.step]}</h2><p class="muted">Cadastro • etapa ${s.step+1} de 4</p><div class="progress">${[0,1,2,3].map(i=>`<span class="${i<=s.step?'done':''}"></span>`).join('')}</div>${sections[s.step]()}<div class="actions"><button class="secondary" data-action="back">Voltar</button><button data-action="next">${s.step===3?'Enviar para aprovação':'Próxima etapa →'}</button></div>`}
function validate(){const p=s.profile;const keys=[['display_name','birth_date','sex','state','city','height_cm','whatsapp'],['church','denomination','ministry','faith_time','favorite_verse'],['hobbies'],['relationship_goal','min_age','max_age','location_preference','height_preference']][s.step];if(keys.some(k=>!String(p[k]??'').trim()))throw Error('Preencha todos os campos obrigatórios.');if(s.step===0){if(!s.photo)throw Error('Escolha uma foto de perfil.');if(age(p.birth_date)<18||!Number.isFinite(age(p.birth_date)))throw Error('Cadastro exclusivo para maiores de 18 anos.');if(!/^\+[1-9][0-9]{9,14}$/.test(p.whatsapp))throw Error('Use WhatsApp com DDI, por exemplo +5511999999999.');if(+p.height_cm<100||+p.height_cm>250)throw Error('Informe a altura em centímetros (100 a 250).')}if(s.step===2&&!p.personality.length)throw Error('Selecione pelo menos uma característica.');if(s.step===3){if(!p.wanted_traits.length)throw Error('Selecione características desejadas.');if(+p.min_age<18||+p.max_age<+p.min_age)throw Error('Revise a faixa etária.')}}
function photo(path){return s.images[path]?`<img class="avatar" src="${esc(s.images[path])}" alt="Foto do perfil">`:'<div class="avatar placeholder">♙</div>'}
function explore(){const f=s.filters;let people=s.profiles.filter(p=>(f.state==='all'||p.state===f.state)&&p.age>=+f.min&&p.age<=+f.max&&(!f.trait||p.personality.includes(f.trait)));people.sort((a,b)=>f.sort==='score'?(score(b)??0)-(score(a)??0):f.sort==='age'?a.age-b.age:a.name.localeCompare(b.name));return `<h2>Descubra conexões</h2><div class="card soft"><div class="grid"><label>Idade mínima<input data-filter="min" type="number" min="18" value="${esc(f.min)}"></label><label>Idade máxima<input data-filter="max" type="number" min="18" value="${esc(f.max)}"></label></div><label>Estado<select data-filter="state"><option value="all">Todos</option>${STATES.map(x=>`<option ${f.state===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Personalidade<select data-filter="trait"><option value="">Todas</option>${TRAITS.map(x=>`<option ${f.trait===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>Ordenar por<select data-filter="sort"><option value="score" ${f.sort==='score'?'selected':''}>Maior afinidade</option><option value="age" ${f.sort==='age'?'selected':''}>Menor idade</option><option value="name" ${f.sort==='name'?'selected':''}>Nome</option></select></label></div><p class="muted">${people.length} perfis encontrados</p>${people.map(p=>`<div class="card"><div class="flex">${photo(p.photo_path)}<div><h3>${esc(p.name)}, ${p.age}</h3><p class="muted">${esc(p.city)}, ${esc(p.state)} • ${esc(p.denomination)}</p><span class="pill">♡ ${score(p)}% afinidade estimada</span></div></div><p>${p.personality.map(t=>`<span class="pill">${esc(t)}</span>`).join(' ')}</p><button class="outline" data-detail="${p.id}">Conhecer perfil →</button></div>`).join('')||'<div class="card">Nenhum perfil encontrado. Experimente ampliar os filtros.</div>'}<p class="muted small">Afinidade calculada a partir de respostas e preferências; não é uma previsão de sucesso no relacionamento.</p>`}
function detail(){const p=s.profiles.find(x=>x.id===s.selected);if(!p)return '<p>Perfil indisponível.</p>';const req=s.interests.find(x=>x.sender===s.user.id&&x.recipient===p.id);return `<button class="secondary" data-go="${s.previousPage||'explore'}">← Voltar</button><div class="card"><div class="flex">${photo(p.photo_path)}<div><h2>${esc(p.name)}, ${p.age}</h2><p>${esc(p.city)}, ${esc(p.state)}</p><span class="pill">♡ ${score(p)}% de afinidade</span></div></div><hr><h3>Vida cristã</h3><p>Igreja: ${esc(p.church)}<br>Denominação: ${esc(p.denomination)}<br>Ministério: ${esc(p.ministry)}<br>Tempo de fé: ${esc(p.faith_time)}<br>Versículo: ${esc(p.verse)}</p><h3>Sobre</h3><p>${esc(p.bio)}</p><p>Altura: ${p.height_cm} cm • Objetivo: ${esc(({serious:'Relacionamento sério',marriage:'Relacionamento sério',friendship:'Amizade primeiro'})[p.goal]||p.goal)} • Hobbies: ${esc(p.hobbies)}</p><h3>Personalidade</h3>${p.personality.map(t=>`<span class="pill">${esc(t)}</span>`).join(' ')}<hr>${req?.status==='accepted'?'<button data-go="connections">Ver conexão aceita</button>':req?.status==='pending'?'<span class="pill">Solicitação pendente</span>':'<button data-action="interest">♡ Tenho interesse</button>'}<p><button class="secondary" data-action="block">Bloquear</button> <button class="secondary" data-action="report">Denunciar</button></p><p class="muted small">O WhatsApp não é exibido nesta página.</p></div>`}
function requests(){const sent=s.interests.filter(i=>i.sender===s.user.id),received=s.interests.filter(i=>i.recipient===s.user.id);return `<h2>Interesses</h2><div class="card"><h3>Recebidos</h3>${received.map(i=>`<p>${esc(i.name)} — ${esc(({pending:'Aguardando resposta',accepted:'Aceito',rejected:'Recusado',declined:'Recusado',cancelled:'Cancelado'})[i.status]||i.status)} ${s.profiles.some(p=>p.id===i.sender)?`<button class="outline" data-detail="${i.sender}">Ver perfil</button>`:''} ${i.status==='pending'?`<button data-respond="${i.sender}" data-answer="true">Aceitar</button> <button class="secondary" data-respond="${i.sender}" data-answer="false">Recusar</button>`:''}</p>`).join('')||'<p>Nenhuma solicitação.</p>'}</div><div class="card"><h3>Enviados</h3>${sent.map(i=>`<p>${esc(i.name)} — ${esc(({pending:'Aguardando resposta',accepted:'Aceito',rejected:'Recusado',declined:'Recusado',cancelled:'Cancelado'})[i.status]||i.status)} <button class="secondary" data-cancel="${i.recipient}">Cancelar / desfazer</button></p>`).join('')||'<p>Nenhuma solicitação.</p>'}</div>`}
function notifications(){
  const items=(s.notifications||[]).filter(n=>
    s.profiles.some(p=>p.id===n.member_id)
  );

  return `
    <h2>🔔 Minhas notificações</h2>
    <div class="card">
      <h3>Novas conexões</h3>
      <p class="muted">
        Descubra novos membros que combinam com suas preferências!
      </p>
    </div>

    ${items.map(n=>{
      const p=s.profiles.find(x=>x.id===n.member_id);
      return `
        <div class="card">
          <h3>${esc(p.name)}</h3>
          <p>Uma nova conexão pode combinar com você!</p>
          <span class="pill">
            ♡ ${score(p)}% de afinidade estimada
          </span>
          <p>${n.read_at?'Notificação lida':'🔵 Nova notificação'}</p>
          <button data-detail="${esc(p.id)}">
            Conhecer perfil →
          </button>
        </div>
      `;
    }).join('')}

    ${items.length===0?
      '<div class="card">Nenhuma notificação por enquanto. 💙</div>'
      :''}
  `;
}function connections(){const accepted=s.interests.filter(i=>i.status==='accepted');return `<h2>Minhas conexões</h2>${accepted.map(i=>{const other=i.sender===s.user.id?i.recipient:i.sender;return `<div class="card"><h3>${esc(i.name)}</h3><p>Interesse aceito por ambas as partes.</p><button data-phone="${other}">Mostrar WhatsApp</button>${s.phone?.id===other?`<p><a href="https://wa.me/${esc(s.phone.value.replace(/\D/g,''))}" target="_blank" rel="noopener noreferrer">Conversar no WhatsApp: ${esc(s.phone.value)}</a></p>`:''}</div>`}).join('')||'<div class="card">Nenhuma conexão aceita ainda.</div>'}`}
function prepareProfileEdit(){
  if(!s.me || s.me.status!=='approved')return;

  s.profile={
    ...empty,
    ...s.me,
    personality:[...(s.me.personality||[])],
    wanted_traits:[...(s.me.wanted_traits||[])],
    height_cm:String(s.me.height_cm??''),
    min_age:String(s.me.min_age??18),
    max_age:String(s.me.max_age??35)
  };

  s.photo=null;
  s.step=0;
}function editProfile(){
  return `
    <h2>✏️ Editar meu perfil</h2>

    <div class="card">
      <h3>Suas informações</h3>

${field('display_name','Nome ou nome de exibição *')}
${select('state','Estado *',STATES)}
${field('city','Cidade *')}
${field('height_cm','Altura em centímetros *','170','number')}
${field('whatsapp','WhatsApp privado *','+5511999999999','tel')}
      <p class="muted">
        Aqui você poderá atualizar seus dados,
        preferências e foto de perfil.
      </p>

      <p>
        <strong>Nome atual:</strong>
        ${esc(s.me?.display_name)}
      </p>

      <p>
        <strong>Cidade:</strong>
        ${esc(s.me?.city)}
      </p>

      <p>
        <strong>Estado:</strong>
        ${esc(s.me?.state)}
      </p>

      <button class="secondary" data-go="account">
        ← Voltar ao meu perfil
      </button>
    </div>
  `;
}function account(){return `<h2>Minha conta</h2><div class="card"><p>Conectado como ${esc(s.user.email)}</p><h3>${esc(s.me?.display_name||'Cadastro ainda não concluído')}</h3><p>Situação: <strong>${esc(s.me?.status||'Sem cadastro')}</strong></p>${s.me?.status==='pending'?'<p>Aguardando aprovação do administrador.</p>':''}${!s.me?'<button data-go="signup">Completar cadastro</button>':''}${s.me?.status==='approved'?'<p><button data-go="edit">✏️ Editar meu perfil</button></p>':''}<p><button class="secondary" data-action="logout">Sair da conta</button></p><p><button class="secondary" data-action="delete">Excluir perfil e solicitações</button></p></div>${s.me?.is_admin?`<div class="card"><h2>Painel administrativo</h2><h3>Aguardando aprovação</h3>${s.admin.map(x=>`<p>${esc(x.name)} <button data-approve="${x.id}" data-allow="true">Aprovar</button> <button class="secondary" data-approve="${x.id}" data-allow="false">Recusar</button></p>`).join('')||'<p>Nenhum cadastro pendente.</p>'}</div>`:''}`}
function content(){if(!configured)return `<div class="card"><h2>Configuração necessária</h2><p>Preencha <code>config.js</code> com a URL e a chave pública do projeto Supabase e execute <code>schema.sql</code>. Veja o README.</p></div>`;if(s.page==='home')return home();if(!s.user)return auth();if(s.page==='signup'&&!s.me)return signup();if(!s.me)return `<div class="card"><h2>Complete seu cadastro</h2><p>Para participar, é necessário usar um convite válido.</p><button data-go="signup">Cadastrar perfil</button><button class="secondary" data-action="logout">Sair</button></div>`;if(s.me.status!=='approved')return account();return ({explore,detail,requests,connections,notifications,edit:editProfile,account,auth})[s.page]?.()||home()}
function render(){const message=s.message?`<div class="notice" role="status">${esc(s.message)}</div>`:'';$('#app').innerHTML=`<div class="layout">${nav()}<main>${message}${content()}<footer class="muted small">Elo • Comunidade privada • 18+ • Respeito e segurança</footer></main></div>`}
async function run(task){if(s.busy)return;s.busy=true;try{await task()}catch(e){notify(e.message||'Ocorreu um erro. Tente novamente.')}finally{s.busy=false}}
async function signupFinish(){validate();const f=s.photo;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5242880)throw Error('Use uma imagem JPG, PNG ou WebP de até 5 MB.');const path=`${s.user.id}/${crypto.randomUUID()}.${f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg'}`;const up=await db.storage.from('elo-photos').upload(path,f,{contentType:f.type});if(up.error)throw up.error;try{await rpc('register_member',{p_profile:{...s.profile,height_cm:+s.profile.height_cm,min_age:+s.profile.min_age,max_age:+s.profile.max_age,photo_path:path}})}catch(e){await db.storage.from('elo-photos').remove([path]);throw e}await refresh();go('account');notify('Cadastro enviado! Aguarde aprovação da administração.')}
document.addEventListener('input',e=>{const x=e.target;if(x.dataset.field&&x.type!=='radio')s.profile[x.dataset.field]=x.value;if(x.id==='invite')s.invite=x.value;if(x.dataset.filter)s.filters[x.dataset.filter]=x.value});
document.addEventListener('change',e=>{const x=e.target;if(x.dataset.field&&x.type==='radio')s.profile[x.dataset.field]=x.value;if(x.id==='photo')s.photo=x.files?.[0]||null;if(x.dataset.filter)render()});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;run(async()=>{if(b.dataset.go){
  if(b.dataset.go==='edit')prepareProfileEdit();
  go(b.dataset.go);
  return;
}if(b.dataset.trait){const a=s.profile[b.dataset.trait],t=b.dataset.value,max=b.dataset.trait==='personality'?6:20;s.profile[b.dataset.trait]=a.includes(t)?a.filter(x=>x!==t):a.length<max?[...a,t]:a;render();return}if(b.dataset.detail){s.previousPage=s.page;s.selected=b.dataset.detail;go('detail');return}if(b.dataset.respond){await rpc('respond_interest',{p_sender:b.dataset.respond,p_accept:b.dataset.answer==='true'});await refresh();render();return}if(b.dataset.cancel){await rpc('cancel_interest',{p_recipient:b.dataset.cancel});await refresh();render();return}if(b.dataset.phone){const value=await rpc('connection_phone',{p_other:b.dataset.phone});s.phone={id:b.dataset.phone,value};render();return}if(b.dataset.approve){await rpc('admin_approve',{p_member:b.dataset.approve,p_approve:b.dataset.allow==='true'});await refresh();render();return}switch(b.dataset.action){case'login':{const {error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)throw error;await refresh();go('account');break}case'register':{const email=$('#email').value.trim(),password=$('#password').value;if(password.length<8)throw Error('A senha deve ter pelo menos 8 caracteres.');const {error}=await db.auth.signUp({email,password,emailRedirectTo:location.origin+location.pathname});if(error)throw error;notify('Confira seu e-mail para confirmar o cadastro. Depois, faça login.');break}case'reset':{const email=$('#email').value.trim();if(!email)throw Error('Informe seu e-mail.');const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;notify('Se o e-mail existir, você receberá instruções para redefinir a senha.');break}case'back':s.step=Math.max(0,s.step-1);render();break;case'next':validate();if(s.step<3){s.step++;render()}else await signupFinish();break;case'interest':await rpc('send_interest',{p_recipient:s.selected});await refresh();go('requests');break;case'block':if(confirm('Bloquear esta pessoa?')){await rpc('block_member',{p_other:s.selected});await refresh();go('explore')}break;case'report':{const reason=prompt('Descreva o motivo da denúncia (mínimo 5 caracteres):');if(reason){await rpc('report_member',{p_other:s.selected,p_reason:reason});notify('Denúncia enviada para análise.')}break}case'logout':await db.auth.signOut();s.user=null;s.me=null;go('home');break;case'createInvite':{const code=await rpc('admin_invite',{p_days:14});prompt('Copie o código de convite de uso único:',code);break}case'delete':if(confirm('Excluir seu perfil e solicitações? Sua conta de autenticação continuará existindo até a remoção administrativa.')){await rpc('delete_my_account');await refresh();go('home')}break}})});
(async()=>{try{if(configured){await refresh();db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){s.user=null;s.me=null;go('home')}if(event==='PASSWORD_RECOVERY'){const password=prompt('Digite uma nova senha (mínimo 8 caracteres):');if(password?.length>=8)db.auth.updateUser({password}).then(({error})=>notify(error?error.message:'Senha atualizada.'))}})}render()}catch(e){notify(e.message)}})();
