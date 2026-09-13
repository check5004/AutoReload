import './core.js';
const C=globalThis.AR;
const PK=o=>'profile:'+o, RK=t=>'run:'+t;
const locks=new Map();
const serial=(key,fn)=>{const prior=locks.get(key)||Promise.resolve();const next=prior.catch(()=>{}).then(fn);locks.set(key,next);next.finally(()=>{if(locks.get(key)===next)locks.delete(key);}).catch(()=>{});return next;};
const get=async(area,key)=>(await chrome.storage[area].get(key))[key];
const getProfile=async o=>C.profile(await get('local',PK(o)));
const getRun=async t=>(await get('session',RK(t)))||null;
const scriptId=o=>'ar-'+Array.from(new TextEncoder().encode(o)).map(b=>b.toString(16).padStart(2,'0')).join('');
async function register(o,enabled){
  const id=scriptId(o);await chrome.scripting.unregisterContentScripts({ids:[id]}).catch(()=>{});
  if(enabled&&await chrome.permissions.contains({origins:[C.pattern(o)]}))await chrome.scripting.registerContentScripts([{id,matches:[C.pattern(o)],js:['core.js','dom.js','content.js'],runAt:'document_idle',persistAcrossSessions:true}]);
}
async function badge(tabId,run){await chrome.action.setBadgeText({tabId,text:run?.active?'ON':run?.status==='recovered'?'✓':''}).catch(()=>{});await chrome.action.setBadgeBackgroundColor({tabId,color:run?.active?'#2258e8':'#18765f'}).catch(()=>{});}
async function putRun(tabId,run){await chrome.storage.session.set({[RK(tabId)]:run});await badge(tabId,run);return run;}
async function wake(tabId){await chrome.tabs.sendMessage(tabId,{type:'WAKE'}).catch(()=>{});}
async function inject(tabId){await chrome.scripting.executeScript({target:{tabId},files:['core.js','dom.js','content.js']});}
function trustedUI(sender){return typeof sender.url==='string'&&sender.url.startsWith(chrome.runtime.getURL(''));}
async function context(message,sender){
  if(sender.tab&&!trustedUI(sender)){if(sender.frameId!==0)throw new Error('メイン画面で操作してください');const origin=C.origin(sender.url);if(!origin)throw new Error('対象外のページです');return {tabId:sender.tab.id,origin,ui:false};}
  if(!trustedUI(sender))throw new Error('この操作は拡張機能の画面から実行してください');
  if(message.tabId!=null){const tab=await chrome.tabs.get(message.tabId);const origin=C.origin(tab.url);if(!origin)throw new Error('通常のWebページを開いてください');return {tabId:tab.id,origin,ui:true};}
  const origin=C.origin(message.origin);return {origin,ui:true};
}
async function handle(m,sender){
  if(!m||typeof m.type!=='string')throw new Error('操作が不正です');
  const ctx=await context(m,sender),{tabId,origin,ui}=ctx;
  if(['LIST','UPDATE_CHECK','UPDATE_DISMISS','UPDATE_CONFIG','UPDATE_INFO','OPEN_TUTORIAL'].includes(m.type)){
    if(!ui)throw new Error('設定画面から操作してください');
    if(m.type==='LIST'){const all=await chrome.storage.local.get(null);return Object.keys(all).filter(k=>k.startsWith('profile:')).map(k=>({origin:k.slice(8),profile:C.profile(all[k])}));}
    if(m.type==='UPDATE_CHECK'){await checkUpdates(true);return updateInfo();}
    if(m.type==='UPDATE_INFO')return updateInfo();
    if(m.type==='UPDATE_CONFIG'){const repo=C.repository(m.repository);if(!repo)throw new Error('owner/repository の形式で指定してください');await chrome.storage.local.set({updateConfig:{repository:repo,enabled:m.enabled!==false},updateState:{}});return updateInfo();}
    if(m.type==='UPDATE_DISMISS'){const s=await get('local','updateState')||{};await chrome.storage.local.set({updateState:{...s,dismissedUntil:Date.now()+7*86400000}});return updateInfo();}
    if(m.type==='OPEN_TUTORIAL'){const release=await releaseConfig();await chrome.tabs.create({url:release.tutorialUrl||'https://check5004.github.io/AutoReload/'});return true;}
  }
  if(!origin)throw new Error('対象ドメインを選んでください');
  if(m.type==='GET'){const p=await getProfile(origin);return {origin,profile:p,run:tabId!=null?await getRun(tabId):null};}
  if(m.type==='SAVE'){
    if(!ui)throw new Error('設定画面から保存してください');
    return serial(PK(origin),async()=>{const old=await getProfile(origin);const p=C.profile({...m.profile,enabled:old.enabled});await chrome.storage.local.set({[PK(origin)]:p});return p;});
  }
  if(m.type==='ENABLE'){
    if(!ui)throw new Error('ポップアップから切り替えてください');
    return serial(PK(origin),async()=>{
      const p=await getProfile(origin);if(m.enabled&&!await chrome.permissions.contains({origins:[C.pattern(origin)]}))throw new Error('このサイトへのアクセス許可が必要です');
      p.enabled=m.enabled===true;await chrome.storage.local.set({[PK(origin)]:p});await register(origin,p.enabled);
      const tabs=await chrome.tabs.query({url:C.pattern(origin)});for(const tab of tabs){if(C.origin(tab.url)!==origin)continue;if(!p.enabled)await serial(RK(tab.id),async()=>{await chrome.alarms.clear(RK(tab.id));await putRun(tab.id,null);});else await inject(tab.id).catch(()=>{});await wake(tab.id);}
      return p;
    });
  }
  if(m.type==='APPEND_STEP'||m.type==='READY_TARGET'){
    if(!(await getProfile(origin)).enabled)throw new Error('このドメインをONにしてください');
    return serial(PK(origin),async()=>{const p=await getProfile(origin);if(m.type==='READY_TARGET')p.readyTarget=C.descriptor(m.target);else {if(p.steps.length>=40)throw new Error('操作は40件まで登録できます');p.steps.push(m.step);}const valid=C.profile(p);await chrome.storage.local.set({[PK(origin)]:valid});return valid;});
  }
  if(m.type==='OPEN_OPTIONS'){await chrome.tabs.create({url:chrome.runtime.getURL('options.html')+'?origin='+encodeURIComponent(origin)+(tabId!=null?'&tab='+tabId:'')});return true;}
  if(tabId==null)throw new Error('操作するタブがありません');
  if(m.type==='PICK'||m.type==='PREVIEW'){if(!ui)throw new Error('拡張機能から操作してください');await inject(tabId);return chrome.tabs.sendMessage(tabId,{type:m.type,kind:m.kind||'step',step:m.step||null});}
  if(m.type==='START'){
    const p=await getProfile(origin);if(!p.enabled)throw new Error('このドメインをONにしてください');
    const kind=m.kind==='recipe'?'recipe':'recovery';if(kind==='recipe'&&!p.steps.some(s=>s.enabled))throw new Error('先に操作を覚えさせてください');
    const startAt=Number(m.startAt)||Date.now();if(startAt<Date.now()-5000||startAt>Date.now()+7*86400000)throw new Error('予約時刻は今から7日以内を指定してください');
    return serial('start:'+origin,()=>serial(RK(tabId),async()=>{
      // Only one active tab per origin avoids duplicated selections and reloads.
      const all=await chrome.storage.session.get(null);for(const [key,r] of Object.entries(all)){if(key.startsWith('run:')&&r?.active&&r.origin===origin&&key!==RK(tabId))throw new Error('このドメインは別のタブで実行中です。先に停止してください');}
      const run={id:crypto.randomUUID(),origin,kind,active:true,status:startAt>Date.now()+1000?'scheduled':'watching',message:'待機中',createdAt:Date.now(),startAt,activatedAt:null,index:0,reloads:0,nextReloadAt:0,stepStartedAt:0};
      await chrome.alarms.create(RK(tabId),{when:Math.max(Date.now()+1000,startAt)});await putRun(tabId,run);await wake(tabId);return run;
    }));
  }
  if(m.type==='STOP')return serial(RK(tabId),async()=>{await chrome.alarms.clear(RK(tabId));const r=await getRun(tabId);if(r)await putRun(tabId,{...r,active:false,status:'stopped',message:'停止しました'});await wake(tabId);return true;});
  if(m.type==='PATCH_RUN'||m.type==='RELOAD')return serial(RK(tabId),async()=>{
    const r=await getRun(tabId),p=await getProfile(origin);if(!p.enabled||!r?.active||r.id!==m.id||r.origin!==origin)return null;
    if(m.type==='RELOAD'){
      if(C.expired(r,p))return putRun(tabId,{...r,active:false,status:'paused',message:'監視の上限に達しました'});
      if(Date.now()<r.nextReloadAt)return {allowed:false,run:r};
      const next={...r,reloads:r.reloads+1,nextReloadAt:Date.now()+C.delay(p,r.reloads),message:'混雑ページを再読み込みしています'};
      await putRun(tabId,next);return {allowed:true,run:next};
    }
    const patch=m.patch||{};const next={...r};
    for(const k of ['activatedAt','stepStartedAt','nextReloadAt','lastStepAt'])if(Number.isFinite(patch[k]))next[k]=patch[k];
    if(Number.isInteger(patch.index)&&patch.index>=0&&patch.index<=p.steps.length)next.index=patch.index;
    if(typeof patch.message==='string')next.message=patch.message.slice(0,500);
    if(['scheduled','watching','running','recovered','complete','paused','stopped'].includes(patch.status))next.status=patch.status;
    if(patch.active===false)next.active=false;
    if(patch.startReloaded===true)next.startReloaded=true;
    await putRun(tabId,next);return next;
  });
  throw new Error('未対応の操作です');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{handle(message,sender).then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error.message}));return true;});
chrome.tabs.onRemoved.addListener(tabId=>{chrome.storage.session.remove(RK(tabId));chrome.alarms.clear(RK(tabId));});
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{if(change.url)serial(RK(tabId),async()=>{const r=await getRun(tabId);if(r?.active&&C.origin(change.url)!==r.origin){await putRun(tabId,{...r,active:false,status:'paused',message:'別ドメインへ移動したため停止しました'});await chrome.alarms.clear(RK(tabId));}}).catch(()=>{});});
chrome.permissions.onRemoved.addListener(()=>restore().catch(()=>{}));
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='updates')checkUpdates().catch(()=>{});else if(alarm.name.startsWith('run:'))wake(Number(alarm.name.slice(4)));});
async function restore(){
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const all=await chrome.storage.local.get(null);
  for(const [key,value] of Object.entries(all))if(key.startsWith('profile:')){const o=key.slice(8),p=C.profile(value);if(!C.origin(o))continue;if(p.enabled&&!await chrome.permissions.contains({origins:[C.pattern(o)]})){p.enabled=false;await chrome.storage.local.set({[key]:p});}await register(o,p.enabled);}
  await chrome.alarms.create('updates',{delayInMinutes:1,periodInMinutes:1440});
}
chrome.runtime.onInstalled.addListener(()=>restore().then(()=>checkUpdates()).catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>restore().then(()=>checkUpdates()).catch(()=>{}));
async function releaseConfig(){return fetch(chrome.runtime.getURL('release.json')).then(r=>r.json());}
async function updateInfo(){const release=await releaseConfig();const config=await get('local','updateConfig')||{repository:release.repository,enabled:true};const state=await get('local','updateState')||{};const current=chrome.runtime.getManifest().version;return {config,state,current,available:config.enabled&&C.isNewer(state.version,current)&&!(state.dismissedUntil>Date.now())};}
let updatePromise;
async function checkUpdates(force=false){
  if(updatePromise)return updatePromise;
  updatePromise=(async()=>{
    const info=await updateInfo();if(!info.config.enabled||!C.repository(info.config.repository))return;
    if(!force&&Date.now()-(info.state.checkedAt||0)<86400000)return;
    if(force&&Date.now()-(info.state.checkedAt||0)<60000)return;
    const state={...info.state,checkedAt:Date.now(),error:''};
    try{
      const response=await fetch(`https://api.github.com/repos/${info.config.repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json',...(state.etag?{'If-None-Match':state.etag}:{})},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(response.status!==304){if(!response.ok)throw new Error(response.status===404?'まだ公開リリースがありません':`更新を確認できませんでした (${response.status})`);const data=await response.json();if(data.draft||data.prerelease||!/^v?\d+\.\d+\.\d+$/.test(data.tag_name))throw new Error('安定版リリースが見つかりません');state.version=data.tag_name;state.url=`https://github.com/${info.config.repository}/releases/tag/${encodeURIComponent(data.tag_name)}`;state.etag=response.headers.get('etag')||'';}
    }catch(error){state.error=error.message;}
    await chrome.storage.local.set({updateState:state});
  })();try{await updatePromise;}finally{updatePromise=null;}
}
