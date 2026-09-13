(() => {
  'use strict';
  if(globalThis.__autoReloadLoaded){document.dispatchEvent(new Event('ar:refresh'));return;}
  globalThis.__autoReloadLoaded=true;
  const C=globalThis.AR,D=globalThis.ARDOM;
  let profile=C.defaults(),run=null,working=false,recording=null,dirty=false,lastPreview=null,errorText='',timer;
  const host=document.createElement('div');host.dataset.autoreloadRoot='';
  host.style.cssText='all:initial!important;position:fixed!important;bottom:18px!important;right:18px!important;z-index:2147483647!important;display:block!important;color-scheme:light!important;';
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>
    :host{font-family:system-ui,"Yu Gothic UI",sans-serif;font-size:14px;color:#1a2a43;line-height:1.6}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #d3deed;border-radius:7px;padding:8px 10px;background:#fff;color:#1a2a43}button:hover{background:#edf3ff}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #6696ff;outline-offset:2px}.launcher{display:flex;gap:8px;align-items:center;margin-left:auto;background:#fff;box-shadow:0 3px 16px #1b2e5120;border-radius:24px;padding:7px 12px;max-width:260px}.symbol{font-size:23px;color:#2258e8;font-weight:700;line-height:28px}.mini{font-size:12px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.panel{width:330px;max-width:calc(100vw - 30px);max-height:calc(100vh - 90px);overflow:auto;background:white;border:1px solid #d4deee;border-radius:12px;box-shadow:0 12px 45px #172d5133;margin-bottom:10px;padding:16px}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.head strong{font-size:15px}.head button{padding:2px 8px;border:0;font-size:18px}.status{background:#edf3ff;color:#355987;padding:10px 12px;border-radius:6px;font-size:13px;overflow-wrap:anywhere;margin-bottom:12px}.row{display:flex;gap:8px;margin:8px 0}.row button{flex:1;font-size:13px}.primary{background:#2258e8;color:white;border-color:#2258e8}.primary:hover{background:#174ad0}.danger{color:#ad3545}.note{font-size:12px;color:#62738e;margin:9px 0}.record label{display:grid;gap:5px;margin:10px 0;font-size:13px}input,select{min-width:0;width:100%;border:1px solid #bdccdf;border-radius:5px;padding:8px;background:white;color:#1a2a43}.error{color:#a53243;font-size:13px;white-space:pre-wrap}.outline{position:fixed;pointer-events:none;border:3px solid #2258e8;background:#2258e814;border-radius:4px;display:none;z-index:2}.hidden,[hidden]{display:none!important}
  </style><div id="outline" class="outline"></div><section id="panel" class="panel" hidden aria-label="AutoReload 操作パネル"><div class="head"><strong>↻ AutoReload</strong><button id="collapse" aria-label="パネルを閉じる">×</button></div><div id="status" class="status" role="status">待機中</div><div id="normal"><div class="row"><button id="watch" class="primary">復旧監視を開始</button><button id="stop" class="danger">停止</button></div><div class="row"><button id="execute">入力補助を実行</button><button id="schedule">時刻予約で実行</button></div><div class="row"><button id="learn">項目を覚える</button><button id="ready">復旧の目印を覚える</button></div><div class="row"><button id="settings">設定・操作を編集</button></div><p class="note">Escで記録・実行を停止。購入確定は手動です。</p></div><div id="record" class="record" hidden><p id="record-title" class="note"></p><label>操作<select id="action"><option value="fill">入力する</option><option value="select">選択肢を選ぶ</option><option value="click">クリックして進む</option><option value="check">チェックを切り替える</option></select></label><label id="value-label">入力・選択する値<input id="value" placeholder="{{date}} / {{name}} など"></label><label>対象に含まれる文字（任意）<input id="match" placeholder="{{date}} | {{grade}}"></label><p class="note">| で区切ると、すべての文字がある項目に限定します。</p><div class="row"><button id="save-step" class="primary">この操作を保存</button><button id="cancel-pick">キャンセル</button></div></div><p id="error" class="error" role="alert"></p></section><button id="launcher" class="launcher" title="AutoReload 操作パネル" aria-expanded="false"><span class="symbol">↻</span><span id="mini" class="mini">AutoReload</span></button>`;
  (document.body||document.documentElement).append(host);
  const $=id=>root.getElementById(id);
  async function send(type,extra={}){const response=await chrome.runtime.sendMessage({type,...extra});if(!response?.ok)throw new Error(response?.error||'拡張機能を再読み込みしてからページを更新してください');return response.data;}
  const open=(yes=true)=>{$('panel').hidden=!yes;$('launcher').setAttribute('aria-expanded',String(yes));};
  const error=e=>{errorText=e?.message||String(e);$('error').textContent=errorText;open();};
  function info(){const active=run?.active;let msg=errorText||(run?.message)||'待機中 · 必要なときに開始できます';if(active&&run.startAt>Date.now())msg=`${new Date(run.startAt).toLocaleTimeString('ja-JP')} に開始 · あと${Math.ceil((run.startAt-Date.now())/1000)}秒`;else if(active&&run.status==='watching'&&run.nextReloadAt>Date.now())msg=`混雑を監視中 · 次の確認まで${Math.ceil((run.nextReloadAt-Date.now())/1000)}秒 / ${run.reloads}回`;
    $('status').textContent=msg;$('mini').textContent=recording?'記録中 · Escで取消':active?run.status==='scheduled'?'開始時刻を待機中':`監視・補助中 ${run.reloads}回`:run?.status==='recovered'?'復旧しました':run?.status==='complete'?'入力補助が完了':run?.status==='paused'?'確認してください':'AutoReload';
    host.style.setProperty(profile.position==='left'?'left':'right','18px','important');host.style.setProperty(profile.position==='left'?'right':'left','auto','important');
  }
  async function refresh(){const data=await send('GET');profile=data.profile;run=data.run;if((run?.active||!profile.enabled)&&recording)cancelPick();host.style.setProperty('display',profile.enabled?'block':'none','important');info();if(profile.enabled)document.dispatchEvent(new Event('autoreload:present'));}
  async function patch(patch){const next=await send('PATCH_RUN',{id:run.id,patch});if(next)run=next;else run=null;info();return next;}
  async function pause(message){if(run?.active)await patch({active:false,status:'paused',message});info();}
  async function start(kind,scheduled=false){cancelPick();errorText='';$('error').textContent='';await refresh();let startAt=Date.now();if(scheduled){startAt=Date.parse(profile.scheduledAt);if(!Number.isFinite(startAt)||startAt<=Date.now())throw new Error('設定画面で未来の開始時刻を保存してください');}dirty=false;run=await send('START',{kind,startAt});info();}
  $('launcher').onclick=()=>open($('panel').hidden);$('collapse').onclick=()=>open(false);
  $('watch').onclick=()=>start('recovery').catch(error);$('execute').onclick=()=>start('recipe').catch(error);$('schedule').onclick=()=>start('recipe',true).catch(error);
  $('stop').onclick=()=>{cancelPick();send('STOP').then(refresh).catch(error);};$('settings').onclick=()=>send('OPEN_OPTIONS').catch(error);
  $('learn').onclick=()=>beginPick('step');$('ready').onclick=()=>beginPick('ready');$('cancel-pick').onclick=cancelPick;
  let picked=null,suppressClick=false;
  function draw(el){if(!el){$('outline').style.display='none';return;}const b=el.getBoundingClientRect();$('outline').style.cssText=`display:block;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;}
  function cancelPick(){recording=null;picked=null;draw(null);$('normal').hidden=false;$('record').hidden=true;info();}
  async function beginPick(kind){await send('STOP');recording=kind;picked=null;errorText='';$('error').textContent='';open(false);info();$('mini').textContent=kind==='ready'?'復旧後の目印をクリック':'覚えさせる項目をクリック';}
  document.addEventListener('pointermove',event=>{if(recording&&!picked&&!event.composedPath().includes(host))draw(recording==='ready'?event.target:event.target.closest?.(D.FIELDS+','+D.CLICKS)||event.target);},true);
  document.addEventListener('pointerdown',event=>{
    if(!recording||picked||event.composedPath().includes(host))return;
    event.preventDefault();event.stopImmediatePropagation();suppressClick=true;
    const el=recording==='ready'?event.target:event.target.closest?.(D.FIELDS+','+D.CLICKS);
    if(!el){error(new Error('入力欄・選択欄・ボタン・リンクを指定してください'));return;}
    if(D.sensitive(el)||D.finalAction(el)){error(new Error('この項目は記録できません。手動で操作してください'));return;}
    const target=D.describe(el);draw(el);
    if(recording==='ready'){send('READY_TARGET',{target}).then(p=>{profile=p;cancelPick();open();$('status').textContent='復旧の目印を保存しました';}).catch(error);return;}
    picked=target;open();$('normal').hidden=true;$('record').hidden=false;
    $('record-title').textContent=target.label||target.text||target.name||target.tag;
    const action=el.tagName==='SELECT'?'select':el.matches('input[type=checkbox],input[type=radio]')?'check':el.matches(D.FIELDS)?'fill':'click';$('action').value=action;
    let value=el.value||'';if(action==='check')value='true';else if(el.type==='date')value='{{date}}';else if(/email|メール/i.test(target.label+' '+target.name))value='{{email}}';else if(/お?名前|氏名|name/i.test(target.label+' '+target.name))value='{{name}}';else if(/枚数|quantity/i.test(target.label+' '+target.name))value='{{quantity}}';
    $('value').value=value;
    const hasDate=/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(target.context);const hasGrade=/[SAＳＡ]席/.test(target.context);
    $('match').value=action==='click'&&hasDate?'{{date}}'+(hasGrade?' | {{grade}}':''):'';
    $('value-label').hidden=action==='click';
  },true);
  // Suppress the corresponding click as well, including on aria-disabled controls.
  document.addEventListener('click',event=>{if((recording||suppressClick)&&!event.composedPath().includes(host)){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
  $('action').onchange=()=>{$('value-label').hidden=$('action').value==='click';};
  $('save-step').onclick=async()=>{try{if(!picked)return;const step={id:crypto.randomUUID(),target:picked,action:$('action').value,value:$('value').value,matchText:$('match').value,enabled:true};profile=await send('APPEND_STEP',{step});cancelPick();$('status').textContent=`操作 ${profile.steps.length} を保存しました。次の項目も記録できます。`;}catch(e){error(e);}};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){cancelPick();send('STOP').then(refresh).catch(()=>{});}},true);
  document.addEventListener('input',event=>{if(event.isTrusted&&!event.composedPath().includes(host)&&run?.active){dirty=true;pause('手動入力を検知したため停止しました').catch(error);}},true);
  document.addEventListener('ar:refresh',()=>refresh().catch(error));
  document.addEventListener('autoreload:probe',()=>{if(profile.enabled)document.dispatchEvent(new Event('autoreload:present'));});
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='WAKE'){refresh().then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;}
    if(message.type==='PICK'){beginPick(message.kind).then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;}
    if(message.type==='PREVIEW'){try{cancelPick();const step=message.step||profile.steps.find(s=>s.enabled);if(!step)throw new Error('操作を登録してください');const els=D.matches(step,profile.variables,{allowDisabled:true});lastPreview=els;draw(els[0]);setTimeout(()=>{if(!recording)draw(null);},5000);open();$('status').textContent=els.length===1?'1件見つかりました（青枠）。操作は実行していません。':els.length>1?`${els.length}件が一致します。対象の文字を絞ってください。`:'この画面に一致する項目はありません。';respond({ok:true,count:els.length});}catch(e){error(e);respond({ok:false,error:e.message});}}
  });
  function isReady(text){
    if(profile.readyText||profile.readyTarget){
      if(profile.readyText&&C.includesAll(text,profile.readyText))return true;
      const target=profile.readyTarget;if(!target)return false;
      try{const els=document.querySelectorAll(target.selector);if(els.length===1&&D.visible(els[0])&&(!target.text||C.normalized(D.text(els[0]))===C.normalized(target.text)))return true;}catch{}
      return !!target.text&&target.text.length>=4&&C.includesAll(text,target.text);
    }
    const step=profile.steps[run?.index||0];if(step&&D.matches(step,profile.variables).length===1)return true;
    return Array.from(document.querySelectorAll(D.CLICKS)).some(el=>D.available(el)&&/選択する|申込む|申し込む|購入へ|購入する|予約する|内容を確認する/.test(D.text(el))&&!D.finalAction(el));
  }
  async function tick(){
    if(working)return;working=true;
    try{
      await refresh();if(!profile.enabled||!run?.active||recording)return;
      if(Date.now()<run.startAt)return;
      if(!run.activatedAt){const now=Date.now();if(!await patch({activatedAt:now,status:run.kind==='recipe'?'running':'watching',message:'画面を確認しています'}))return;}
      if(C.expired(run,profile)){await pause('監視の回数・時間の上限に達しました');return;}
      if(dirty){await pause('手動入力を検知したため停止しました');return;}
      if(run.kind==='recipe'&&run.startAt>run.createdAt+1000&&profile.reloadAtStart&&!run.startReloaded){if(await patch({startReloaded:true,message:'開始時刻になりました。再読み込みしています'}))location.reload();return;}
      const text=D.pageText();let state=C.classify(text,profile);
      if(state==='unknown'&&run.kind==='recovery'&&isReady(text))state='ready';
      if(state==='hold'){await pause('順番待ち・認証画面を検知しました。画面の案内に従ってください');return;}
      if(state==='busy'){
        if(run.status!=='watching')await patch({status:'watching',message:'混雑ページを監視しています',stepStartedAt:0});
        if(!run?.nextReloadAt){await patch({nextReloadAt:Date.now()+profile.interval});return;}
        if(Date.now()>=run.nextReloadAt){const reply=await send('RELOAD',{id:run.id});if(reply?.allowed){run=reply.run;location.reload();}else if(reply?.run)run=reply.run;}
        return;
      }
      if(run.kind==='recovery'){
        if(state==='ready')await patch({active:false,status:'recovered',message:'復旧を検知しました。入力へ進めます'});
        else if(run.message!=='混雑表示がありません。復旧の目印を待っています')await patch({message:'混雑表示がありません。復旧の目印を待っています',nextReloadAt:0});
        return;
      }
      if(run.lastStepAt&&Date.now()-run.lastStepAt<650)return;
      const steps=profile.steps;let index=run.index;while(index<steps.length&&!steps[index].enabled)index++;
      if(index>=steps.length){await patch({active:false,status:'complete',message:'記録した操作が完了しました。内容を確認し、購入確定は手動で進めてください'});return;}
      const step=steps[index];
      if(!run.stepStartedAt)await patch({stepStartedAt:Date.now(),status:'running',message:`操作 ${index+1}/${steps.length} の項目が現れるのを待っています`});
      const elements=D.matches(step,profile.variables);
      if(elements.length>1){await pause(`操作 ${index+1} に複数の候補があります。設定の「含まれる文字」を絞ってください`);return;}
      if(!elements.length){if(Date.now()-run.stepStartedAt>profile.stepTimeout*1000)await pause(`操作 ${index+1} の項目が見つかりません。ページと設定を確認してください`);return;}
      if(step.action==='click'&&D.finalAction(elements[0])){await pause('購入・申込の確定は手動で操作してください');return;}
      // Persist progress before navigation; never click a recorded action twice after a reload.
      const currentId=run.id;
      if(!await patch({index:index+1,stepStartedAt:0,lastStepAt:Date.now(),status:'running',nextReloadAt:0,message:`操作 ${index+1}/${steps.length} を実行中`}))return;
      if(!run?.active||run.id!==currentId)return;
      D.apply(step,elements[0],profile.variables);
    }catch(e){if(run?.active)await pause(e.message).catch(()=>{});error(e);}finally{working=false;timer=setTimeout(tick,profile.enabled&&run?.active?250:1800);}
  }
  tick();
})();
