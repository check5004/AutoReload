const $ = (id) => document.getElementById(id);
const dateValue = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let saved; try { saved = JSON.parse(sessionStorage.getItem('ar-lab') || 'null'); } catch {}
let state = saved || { scenario:'learn', date:dateValue(new Date(Date.now()+86400000)), grade:'S席', logs:[], screen:'list', shuffle:true };
let chosen = state.scenario;
const names = { learn:'前日の準備', sale:'発売開始待ち', busy:'混雑からの復旧' };
const escape = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){sessionStorage.setItem('ar-lab',JSON.stringify(state));}
function log(message){state.logs.unshift({at:Date.now(),message});state.logs=state.logs.slice(0,30);persist();renderLogs();}
function renderLogs(){$('activity-log').innerHTML=state.logs.length?state.logs.map(x=>`<li><time>${new Date(x.at).toLocaleTimeString('ja-JP')}</time>${escape(x.message)}</li>`).join(''):'<li>左のシナリオを選んで、練習を始めてください。</li>';}
$('event-date').value=state.date;$('event-grade').value=state.grade;$('change-dom').checked=state.shuffle;
function selectScenario(name){chosen=name;document.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===name));}
document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>selectScenario(b.dataset.scenario)));
selectScenario(chosen);
function start(options={}){
  const date=options.date || $('event-date').value;
  const scenario=options.scenario || chosen;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dateValue(new Date(date+'T12:00:00'))!==date||!names[scenario]) throw new Error('日付・シナリオを確認してください');
  state={scenario,date,grade:options.grade || $('event-grade').value,shuffle:$('change-dom').checked,logs:[],started:Date.now(),saleAt:Date.now()+Number($('sale-delay').value)*1000,recoverAt:Date.now()+Number($('busy-delay').value)*1000,screen:'list',reloads:0};
  log(`${names[scenario]}を開始しました。目的：${state.date} / ${state.grade}`);render();
}
$('start').addEventListener('click',()=>{try{start();}catch(e){$('context-hint').textContent=e.message;}});
$('reset').addEventListener('click',()=>{sessionStorage.removeItem('ar-lab');location.reload();});
if(state.scenario==='busy'&&state.started){state.reloads=(state.reloads||0)+1;if(Date.now()>=state.recoverAt){state.scenario='sale';state.saleAt=Date.now();log(`${state.reloads}回目のページ読み込みで復旧しました。`);}else log(`混雑ページを読み込みました（${state.reloads}回目）。`);}
function banner(){return `<div class="event-banner"><span class="event-kicker">AUTUMN SESSION / 2026</span><h3>夜明けの音楽祭</h3><p>東京・リバーサイドホール &nbsp; / &nbsp; 全席指定</p></div>`;}
function render(){
  $('scenario-label').textContent=names[state.scenario];
  const root=$('ticket-app');
  if(state.scenario==='busy'){
    root.innerHTML='<div class="busy-screen"><div class="busy-icon">↻</div><h3>ただいまアクセスが集中しています</h3><p>サイトにつながりにくくなっています。<br>時間をおいてから再読み込みしてください。</p><button id="manual-reload">ページを再読み込み</button><small>この画面は、再読み込みするまで切り替わりません。</small></div>';
    $('manual-reload').onclick=()=>location.reload();
    $('context-hint').textContent='拡張機能の「復旧監視」を開始してください。設定した復旧時間を過ぎた後のリロードで販売画面に戻ります。';
    renderLogs();return;
  }
  if(state.screen==='form'){renderForm();return;}
  if(state.screen==='review'){renderReview();return;}
  if(state.screen==='complete'){root.innerHTML='<div class="busy-screen"><div class="success-mark">✓</div><h3>リハーサル完了</h3><p>公演の選択から入力、最終確認まで練習できました。<br>実際の申込・決済は行われていません。</p><button id="again">もう一度練習する</button></div>';$('again').onclick=()=>start();return;}
  const pending=state.scenario==='sale'&&Date.now()<state.saleAt;
  const previous=dateValue(new Date(new Date(state.date+'T12:00:00').getTime()-86400000));
  let slots=state.scenario==='learn'?[{date:previous,grade:'A席',ready:false},{date:state.date,grade:state.grade,ready:false}]:[{date:previous,grade:'A席',ready:true},...(!pending?[{date:state.date,grade:state.grade,ready:true}]:[])];
  if(state.shuffle&&state.scenario!=='learn')slots.reverse();
  root.innerHTML=banner()+`<div class="sale-content"><div class="section-line"><h4>公演を選ぶ</h4><span>${state.scenario==='learn'?'受付開始前のプレビュー':'先着順受付'}</span></div>${pending?'<div class="countdown-note">発売開始まで <strong id="countdown"></strong> · 対象公演は開始後に表示されます</div>':''}<div>${slots.map((s,i)=>`<article class="slot" data-ar-item><div class="date-tile"><small>${Number(s.date.slice(5,7))}月</small>${s.date.slice(8)}</div><div class="slot-info"><strong>${s.date} / ${s.grade}</strong><span>開場 17:30 · 開演 18:00</span></div><span class="price">${s.grade==='S席'?'¥8,500':'¥6,000'}</span><button type="button" id="${state.scenario==='learn'?'preview':'sale'}-${i}" class="${s.ready?'primary':''}" data-date="${s.date}" data-grade="${s.grade}" aria-disabled="${!s.ready}">${s.ready?'選択する':'受付開始前'}</button></article>`).join('')}</div>${state.scenario==='learn'?'<button id="sample-form" class="text-button">入力欄も準備する →</button>':''}</div>`;
  root.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true')return;state.selected={date:b.dataset.date,grade:b.dataset.grade};state.screen='form';log(`${state.selected.date} / ${state.selected.grade} を選択しました。`);renderForm();});
  if($('sample-form'))$('sample-form').onclick=()=>{state.selected={date:state.date,grade:state.grade};state.screen='form';persist();renderForm();};
  $('context-hint').textContent=state.scenario==='learn'?'「項目を覚える」で受付開始前のボタンを指定できます。ボタンの文字は当日変わるため、操作の「含まれる文字」に {{date}} | {{grade}} を設定します。':'発売開始後に、日時と席種が一致する公演が現れます。別の公演に進まないことも確認しましょう。';
  renderLogs();
}
function renderForm(){
  const prefix=state.scenario==='learn'?'before':'live';const fields=state.fields||{};
  const specs=[['name','お名前','text','name','山田 花子'],['email','メールアドレス','email','email','hanako@example.com'],['visit','来場日','date','off',''],['quantity','枚数','select','off','']];
  if(state.shuffle&&state.scenario!=='learn') specs.reverse();
  $('ticket-app').innerHTML=banner()+`<div class="sale-content"><div class="section-line"><h4>申込情報</h4><span>${escape(state.selected.date)} / ${escape(state.selected.grade)}</span></div><form id="booking-form"><div class="form-grid">${specs.map(([name,label,type,auto,placeholder])=>`<label for="${prefix}-${name}">${label}${type==='select'?`<select id="${prefix}-${name}" name="${name}" required><option value="1">1枚</option><option value="2">2枚</option></select>`:`<input id="${prefix}-${name}" name="${name}" type="${type}" autocomplete="${auto}" placeholder="${placeholder}" value="${escape(fields[name]||'')}" required>`}</label>`).join('')}</div><div class="form-actions"><button type="button" id="back-list">公演選択に戻る</button><button type="submit" class="primary">内容を確認する</button></div></form></div>`;
  $('live-quantity')?.setAttribute('data-changed','true');
  const quantity=document.querySelector('[name=quantity]');quantity.value=fields.quantity||'1';
  $('booking-form').oninput=()=>{state.fields=Object.fromEntries(new FormData($('booking-form')));persist();};
  $('booking-form').onchange=()=>{state.fields=Object.fromEntries(new FormData($('booking-form')));persist();};
  $('booking-form').onsubmit=e=>{e.preventDefault();state.fields=Object.fromEntries(new FormData(e.target));state.screen='review';log('入力が完了し、最終確認に進みました。');renderReview();};
  $('back-list').onclick=()=>{state.screen='list';persist();render();};
}
function renderReview(){
  const f=state.fields||{};
  $('ticket-app').innerHTML=banner()+`<div class="sale-content"><h4>お申し込み内容の最終確認</h4><dl class="review-list"><dt>公演</dt><dd>${escape(state.selected.date)} / ${escape(state.selected.grade)}</dd><dt>お名前</dt><dd>${escape(f.name)}</dd><dt>メール</dt><dd>${escape(f.email)}</dd><dt>来場日</dt><dd>${escape(f.visit)}</dd><dt>枚数</dt><dd>${escape(f.quantity)}枚</dd></dl><p class="local-note">拡張機能の操作はここまで。最後は自分で内容を確認してください。</p><div class="form-actions"><button id="back-form">入力に戻る</button><button id="confirm-purchase" class="primary" data-ar-final>購入を確定する（練習）</button></div></div>`;
  $('back-form').onclick=()=>{state.screen='form';persist();renderForm();};
  $('confirm-purchase').onclick=()=>{state.screen='complete';log('利用者の操作で練習を完了しました。');render();};
}
setInterval(()=>{if($('countdown')){const seconds=Math.max(0,Math.ceil((state.saleAt-Date.now())/1000));$('countdown').textContent=`${seconds}秒`;if(!seconds){log('発売開始：目的の公演が表示されました。');render();}}if(state.started)$('run-clock').textContent=`開始から ${Math.floor((Date.now()-state.started)/1000)}秒`;},250);
render();
document.addEventListener('autoreload:present',()=>{$('extension-state').classList.add('connected');$('extension-state').textContent='拡張機能が有効です。画面端の ↻ パネルから操作できます。';});
document.dispatchEvent(new Event('autoreload:probe'));
const context=document.modelContext;
if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'start_ticket_rehearsal',title:'チケット練習を開始',description:'練習シナリオと公演条件を設定してシミュレーションを開始します。実際の申込はありません。',inputSchema:{type:'object',properties:{scenario:{type:'string',enum:['learn','sale','busy']},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},grade:{type:'string',enum:['S席','A席']}},required:['scenario','date','grade'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(!input||!names[input.scenario]||!['S席','A席'].includes(input.grade)||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))throw new Error('練習条件が不正です');selectScenario(input.scenario);$('event-date').value=input.date;$('event-grade').value=input.grade;start(input);return{scenario:state.scenario,date:state.date,grade:state.grade};}})).catch(()=>{});}catch{}}
