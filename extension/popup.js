const $=id=>document.getElementById(id);let tab,origin,enabled=false;
async function send(type,extra={}){const response=await chrome.runtime.sendMessage({type,tabId:tab?.id,...extra});if(!response?.ok)throw new Error(response?.error||'操作に失敗しました');return response.data;}
const showError=e=>{$('error').textContent=e.message;};
async function refresh(){if(!origin)return;const data=await send('GET');enabled=data.profile.enabled;$('toggle').setAttribute('aria-checked',String(enabled));$('status').textContent=!enabled?'OFF · このドメインをONにすると使えます':data.run?.message||'待機中 · 必要なときに監視を開始';for(const id of ['watch','execute','stop','pick','ready'])$(id).disabled=!enabled;}
$('version').textContent='v'+chrome.runtime.getManifest().version;
$('toggle').onclick=async()=>{try{$('error').textContent='';if(!enabled){const granted=await chrome.permissions.request({origins:[AR.pattern(origin)]});if(!granted)return;}await send('ENABLE',{enabled:!enabled});await refresh();}catch(e){showError(e);}};
for(const [id,kind] of [['watch','recovery'],['execute','recipe']])$(id).onclick=()=>send('START',{kind}).then(refresh).catch(showError);
$('stop').onclick=()=>send('STOP').then(refresh).catch(showError);
for(const [id,kind] of [['pick','step'],['ready','ready']])$(id).onclick=async()=>{try{const result=await send('PICK',{kind});if(result?.ok===false)throw new Error(result.error);window.close();}catch(e){showError(e);}};
$('settings').onclick=()=>send('OPEN_OPTIONS').catch(()=>chrome.runtime.openOptionsPage());
$('tutorial').onclick=()=>send('OPEN_TUTORIAL',{tabId:undefined}).catch(showError);
async function update(){const info=await send('UPDATE_INFO',{tabId:undefined});$('update').hidden=!info.available;if(info.available){$('update-text').textContent=`${info.state.version} が公開されています。`;$('release').href=info.state.url;}}
$('dismiss').onclick=()=>send('UPDATE_DISMISS',{tabId:undefined}).then(update).catch(showError);
(async()=>{try{[tab]=await chrome.tabs.query({active:true,currentWindow:true});origin=AR.origin(tab?.url);if(!origin){$('domain').textContent='このページは対象外です';$('status').textContent='購入ページや練習サイトを開いてください';for(const id of ['watch','execute','stop','pick','ready'])$(id).disabled=true;}else{$('domain').textContent=new URL(origin).host;$('toggle').disabled=false;await refresh();}await update();}catch(e){showError(e);}})();
setInterval(()=>refresh().catch(()=>{}),1500);
