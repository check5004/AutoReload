const $=id=>document.getElementById(id),C=globalThis.AR;
const params=new URLSearchParams(location.search);let origin=C.origin(params.get('origin')),tabId=Number(params.get('tab'))||undefined,profile=C.defaults(),changed=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function send(type,extra={}){const r=await chrome.runtime.sendMessage({type,origin,...extra});if(!r?.ok)throw new Error(r?.error||'操作に失敗しました');return r.data;}
const error=e=>{$('error').textContent=e.message;};
function mark(){changed=true;$('save-status').textContent='未保存の変更があります';}
function paint(){
  for(const k of Object.keys(profile.variables))$('var-'+k).value=profile.variables[k];
  for(const k of ['maxReloads','maxMinutes','busyText','readyText','position','stepTimeout','scheduledAt'])$(k).value=profile[k];
  $('interval').value=profile.interval/1000;$('maxInterval').value=profile.maxInterval/1000;$('reloadAtStart').checked=profile.reloadAtStart;
  $('ready-target').textContent=profile.readyTarget?'記録した目印：'+(profile.readyTarget.text||profile.readyTarget.label||profile.readyTarget.selector):'クリックで記録した復旧の目印はありません';
  $('clear-ready').hidden=!profile.readyTarget;$('enabled-status').textContent=profile.enabled?'このドメインはONです':'このドメインはOFFです';renderSteps();
}
function renderSteps(){
  $('steps').innerHTML=profile.steps.length?profile.steps.map((s,i)=>`<article class="step" data-index="${i}"><div class="step-head"><span class="step-number">${String(i+1).padStart(2,'0')}</span><strong class="step-name">${esc(s.target.label||s.target.text||s.target.name||s.target.tag)}</strong><button type="button" data-move="up" aria-label="操作${i+1}を上へ" ${i===0?'disabled':''}>↑</button><button type="button" data-move="down" aria-label="操作${i+1}を下へ" ${i===profile.steps.length-1?'disabled':''}>↓</button><button type="button" data-delete class="danger">削除</button></div><div class="grid"><label>操作<select data-prop="action">${[['fill','入力する'],['select','選択肢を選ぶ'],['click','クリックして進む'],['check','チェックを切り替える']].map(([value,title])=>`<option value="${value}" ${s.action===value?'selected':''}>${title}</option>`).join('')}</select></label><label>入力・選択する値<input data-prop="value" value="${esc(s.value)}" placeholder="{{date}} / {{name}} / true"></label><label class="full">対象に含まれる文字（すべて一致）<input data-prop="matchText" value="${esc(s.matchText)}" placeholder="{{date}} | {{grade}}"></label><label class="full">実行するページのパス<input data-path value="${esc(s.target.path)}" placeholder="/tickets"></label></div><p class="step-meta">項目名：${esc(s.target.label||s.target.name||'未指定')} · 記録時の周辺：${esc(s.target.context.slice(0,150))}</p><div class="section-head" style="margin:12px 0 0"><label class="check"><input type="checkbox" data-enabled ${s.enabled?'checked':''}>この操作を使う</label><button type="button" data-preview>対象を確認（実行なし）</button></div></article>`).join(''):'<div class="empty">まだ操作はありません。<br>対象ページで「項目を覚える」を押し、順番に記録してください。</div>';
}
function collect(){
  for(const k of Object.keys(profile.variables))profile.variables[k]=$('var-'+k).value;
  for(const k of ['maxReloads','maxMinutes','busyText','readyText','position','stepTimeout','scheduledAt'])profile[k]=$(k).value;
  profile.interval=Number($('interval').value)*1000;profile.maxInterval=Number($('maxInterval').value)*1000;profile.reloadAtStart=$('reloadAtStart').checked;
  document.querySelectorAll('.step').forEach(el=>{const s=profile.steps[Number(el.dataset.index)];el.querySelectorAll('[data-prop]').forEach(input=>s[input.dataset.prop]=input.value);s.enabled=el.querySelector('[data-enabled]').checked;s.target.path=el.querySelector('[data-path]').value;});
  return C.profile(profile);
}
async function save(){if(!$('profile-form').reportValidity())throw new Error('入力内容を確認してください');profile=collect();if(profile.maxInterval<profile.interval)throw new Error('間隔の上限は最初の間隔以上にしてください');profile=await send('SAVE',{profile});changed=false;$('error').textContent='';$('save-status').textContent='保存しました · '+new Date().toLocaleTimeString('ja-JP');return profile;}
$('profile-form').oninput=mark;$('profile-form').onchange=mark;
$('profile-form').onsubmit=e=>{e.preventDefault();save().catch(error);};
$('steps').onclick=async e=>{const button=e.target.closest('button');if(!button)return;try{profile=collect();const i=Number(button.closest('.step').dataset.index);if(button.hasAttribute('data-delete')){profile.steps.splice(i,1);renderSteps();mark();}else if(button.dataset.move){const n=i+(button.dataset.move==='up'?-1:1);[profile.steps[i],profile.steps[n]]=[profile.steps[n],profile.steps[i]];renderSteps();mark();}else if(button.hasAttribute('data-preview')){const t=await targetTab();const result=await send('PREVIEW',{tabId:t,step:profile.steps[i]});if(result?.ok===false)throw new Error(result.error);await chrome.tabs.update(t,{active:true});}}catch(err){error(err);}};
async function targetTab(){if(tabId){try{const tab=await chrome.tabs.get(tabId);if(C.origin(tab.url)===origin)return tabId;}catch{}}
  const tabs=await chrome.tabs.query({url:C.pattern(origin)});const candidates=tabs.filter(t=>C.origin(t.url)===origin);if(candidates.length!==1)throw new Error('操作したいページで拡張機能を開き「設定・記録した操作」からこの画面を開き直してください');tabId=candidates[0].id;return tabId;
}
$('record-new').onclick=async()=>{try{await save();const id=await targetTab();const result=await send('PICK',{tabId:id,kind:'step'});if(result?.ok===false)throw new Error(result.error);await chrome.tabs.update(id,{active:true});}catch(e){error(e);}};
$('clear-ready').onclick=()=>{profile=collect();profile.readyTarget=null;paint();mark();};
for(const [id,scheduled] of [['run-now',false],['run-scheduled',true]])$(id).onclick=async()=>{try{await save();const t=await targetTab();const startAt=scheduled?Date.parse(profile.scheduledAt):Date.now();if(!Number.isFinite(startAt)||scheduled&&startAt<=Date.now())throw new Error('未来の開始日時を指定してください');await send('START',{tabId:t,kind:'recipe',startAt});await chrome.tabs.update(t,{active:true});}catch(e){error(e);}};
$('stop-run').onclick=async()=>{try{await send('STOP',{tabId:await targetTab()});$('save-status').textContent='実行を停止しました';}catch(e){error(e);}};
$('tutorial').onclick=()=>send('OPEN_TUTORIAL').catch(error);
async function showUpdates(){const info=await send('UPDATE_INFO');$('repository').value=info.config.repository||'';$('update-enabled').checked=info.config.enabled;$('update-status').textContent=`インストール済み v${info.current} · `+(info.state.error||info.state.version?info.state.error||`最新 ${info.state.version}`:'未確認')+(info.state.checkedAt?' · '+new Date(info.state.checkedAt).toLocaleString('ja-JP'):'');$('update-link').hidden=!info.state.url;if(info.state.url)$('update-link').href=info.state.url;}
$('save-update').onclick=()=>send('UPDATE_CONFIG',{repository:$('repository').value,enabled:$('update-enabled').checked}).then(showUpdates).catch(error);
$('check-update').onclick=async()=>{try{$('check-update').disabled=true;await send('UPDATE_CHECK');await showUpdates();}catch(e){error(e);}finally{$('check-update').disabled=false;}};
$('export').onclick=()=>{try{if(!origin)throw new Error('ドメインを選んでください');const data={format:'autoreload-profile',schema:1,origin,profile:collect()};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`autoreload-${new URL(origin).hostname}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error(e);}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(!origin)throw new Error('先にドメインを選んでください');if(file.size>250000)throw new Error('設定ファイルが大きすぎます');const data=JSON.parse(await file.text());if(data.format!=='autoreload-profile'||data.schema!==1||!Array.isArray(data.profile?.steps))throw new Error('AutoReloadの設定ファイルではありません');if(data.origin!==origin)throw new Error('このドメインの設定ファイルを選んでください');profile=C.profile({...data.profile,enabled:profile.enabled});paint();mark();$('save-status').textContent='読み込みました。各操作と入力値を確認して保存してください';}catch(e){error(e);}finally{e.target.value='';}};
async function load(){if(!origin)return;const data=await send('GET');profile=data.profile;paint();changed=false;$('save-status').textContent='変更したら保存してください';}
$('domains').onchange=async()=>{if(changed&&!confirm('未保存の変更を破棄してドメインを切り替えますか？')){$('domains').value=origin;return;}origin=$('domains').value;tabId=undefined;await load().catch(error);};
window.addEventListener('beforeunload',e=>{if(changed){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!changed)load().catch(error);});
(async()=>{try{const list=await send('LIST');if(origin&&!list.some(x=>x.origin===origin))list.push({origin,profile:C.defaults()});$('domains').innerHTML=list.map(x=>`<option value="${esc(x.origin)}">${esc(new URL(x.origin).host)}</option>`).join('');origin=origin||list[0]?.origin;$('no-domain').hidden=!!origin;$('profile-form').hidden=!origin;if(origin){$('domains').value=origin;await load();}await showUpdates();}catch(e){error(e);}})();
