import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {serveRequest} from './http-fixture.mjs';
import '../extension/core.js';
const C=globalThis.AR;
const {chromium}=await import(process.env.AUTORELOAD_PLAYWRIGHT?pathToFileURL(process.env.AUTORELOAD_PLAYWRIGHT).href:'playwright');
test('bundled practice page works offline with the production manifest',{timeout:150000},async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'autoreload-native-'));
  const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:true,channel:'chromium',viewport:{width:1440,height:1100},args:[`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`]});
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    await context.addInitScript(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.hasAttribute('data-autoreload-root'))globalThis.__testPanel=root;return root;};});
    await context.setOffline(true);
    const ui=await context.newPage();await ui.goto(`chrome-extension://${id}/options.html`);
    const pagePromise=context.waitForEvent('page');await ui.locator('#tutorial').click();const page=await pagePromise;await page.waitForLoadState('load');
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const origin=C.PRACTICE;const tabId=await page.evaluate(async()=>(await chrome.tabs.getCurrent()).id);
    const send=async(type,extra={})=>{const result=await ui.evaluate(m=>chrome.runtime.sendMessage(m),{type,origin,...extra});assert(result.ok,result.error);return result.data;};
    const waitRun=async(predicate,timeout=25000)=>{const until=Date.now()+timeout;let run;do{run=(await send('GET',{tabId})).run;if(predicate(run))return run;await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<until);throw new Error('Practice run timeout: '+JSON.stringify(run));};
    const panelClick=selector=>page.evaluate(s=>globalThis.__testPanel.querySelector(s).click(),selector);
    await t.test('settings and popup open the same built-in tab without a permission grant',async()=>{
      assert.equal(page.url(),`chrome-extension://${id}/tutorial/index.html`);await page.waitForFunction(()=>!!globalThis.__testPanel);
      const data=await send('GET',{tabId});assert.equal(data.origin,C.PRACTICE);assert.equal(data.profile.enabled,true);
      assert.deepEqual(await worker.evaluate(()=>chrome.permissions.getAll().then(p=>p.origins)),['https://api.github.com/*']);
      const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await page.bringToFront();await popup.reload();
      await popup.waitForFunction(()=>document.getElementById('domain').textContent==='内蔵の練習ページ');
      assert.equal(await popup.locator('#toggle').getAttribute('aria-checked'),'true');await popup.locator('#tutorial').click();await popup.close();
      assert.equal(context.pages().filter(p=>p.url()===page.url()).length,1);
      const settingsPromise=context.waitForEvent('page');await page.locator('#practice-settings').click();const settings=await settingsPromise;await settings.waitForLoadState('load');assert.equal(await settings.locator('#domains').inputValue(),C.PRACTICE);await settings.close();
    });
    await t.test('recording and target preview use the shared engine inside the extension',async()=>{
      await page.locator('#event-date').fill('2026-10-14');await page.locator('#start').click();
      await send('PICK',{tabId,kind:'ready'});await page.locator('#ticket-app h4').click();await new Promise(r=>setTimeout(r,100));
      assert.equal((await send('GET',{tabId})).profile.readyTarget.text,'公演を選ぶ');
      const pick=async selector=>{await send('PICK',{tabId,kind:'step'});await page.locator(selector).click({force:true});await panelClick('#save-step');await new Promise(r=>setTimeout(r,100));};
      await pick('[data-date="2026-10-14"]');await page.locator('#sample-form').click();
      for(const selector of ['[name=name]','[name=email]','[name=visit]','[name=quantity]','button[type=submit]'])await pick(selector);
      const profile=(await send('GET',{tabId})).profile;assert.equal(profile.steps.length,6);assert.equal(profile.steps[0].target.path,'/tutorial/index.html');
      const preview=await send('PREVIEW',{tabId,step:profile.steps[1]});assert.equal(preview.ok,true);assert.equal(preview.count,1);
      await ui.goto(`chrome-extension://${id}/options.html?origin=${encodeURIComponent(origin)}&tab=${tabId}`);
      for(const [field,value] of [['var-date','2026-10-15'],['var-name','練習 花子'],['var-email','practice@example.com'],['var-quantity','2'],['interval','2'],['maxInterval','3']])await ui.locator('#'+field).fill(value);
      await ui.locator('#save').click();await ui.waitForFunction(()=>document.getElementById('save-status').textContent.startsWith('保存しました'));
    });
    await t.test('changing just the date finds the newly available ticket and fills the form offline',async()=>{
      await page.locator('#event-date').fill('2026-10-15');await page.locator('[data-scenario=sale]').click();await page.locator('#sale-delay').selectOption('15');await page.locator('#start').click();
      await send('START',{tabId,kind:'recipe'});const run=await waitRun(r=>r&&!r.active,40000);assert.equal(run.status,'complete',run.message);
      const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ar-lab')));assert.equal(state.selected.date,'2026-10-15');assert.equal(state.fields.name,'練習 花子');assert.equal(state.fields.visit,'2026-10-15');assert.equal(state.screen,'review');assert.equal(await page.locator('#confirm-purchase').count(),1);
    });
    await t.test('congestion reloads the bundled HTML and preserves run progress',async()=>{
      await page.locator('[data-scenario=busy]').click();await page.locator('#busy-delay').selectOption('10');await page.locator('#start').click();await send('START',{tabId,kind:'recovery'});
      const run=await waitRun(r=>r&&!r.active);assert.equal(run.status,'recovered',run.message);assert(run.reloads>=2);assert.equal(page.url(),`chrome-extension://${id}/tutorial/index.html`);
    });
    await t.test('tab-specific commands do not start recording in another practice tab',async()=>{
      const second=await context.newPage();await second.goto(page.url());await second.waitForFunction(()=>!!globalThis.__testPanel);
      await send('PICK',{tabId,kind:'step'});assert.match(await page.evaluate(()=>globalThis.__testPanel.getElementById('mini').textContent),/クリック|記録/);assert.equal(await second.evaluate(()=>globalThis.__testPanel.getElementById('mini').textContent),'AutoReload');
      await page.keyboard.press('Escape');await second.close();
    });
    await t.test('practice settings remain separate, and OFF/ON works without host permissions',async()=>{
      await worker.evaluate(()=>chrome.storage.local.set({'profile:https://tickets.example':{enabled:false,variables:{name:'本番用'}}}));
      await send('START',{tabId,kind:'recovery',startAt:Date.now()+10000});await send('ENABLE',{tabId,enabled:false});assert.equal((await send('GET',{tabId})).run,null);
      await page.reload();assert.equal((await send('GET',{tabId})).profile.enabled,false);await send('ENABLE',{tabId,enabled:true});assert.equal((await send('GET',{tabId})).profile.steps.length,6);
      const real=await send('GET',{origin:'https://tickets.example'});assert.equal(real.profile.variables.name,'本番用');
      await send('START',{tabId,kind:'recovery',startAt:Date.now()+10000});await page.locator('a[href="./guide.html"]').click();
      let result;const deadline=Date.now()+3000;do{result=await worker.evaluate(async key=>(await chrome.storage.session.get(key))[key],'run:'+tabId);if(!result.active)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);assert.equal(result.active,false);assert.equal(result.status,'paused');
      await page.locator('a[href="./index.html"]').first().click();assert.equal(page.url(),`chrome-extension://${id}/tutorial/index.html`);
    });
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('unpacked MV3 extension and ticket rehearsal end-to-end',{timeout:150000},async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'autoreload-e2e-'));
  const extension=path.join(temp,'extension');await cp('extension',extension,{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
  // Only the test copy pre-grants localhost. Production still prompts per domain.
  manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  let retryRequests=0;
  const server=http.createServer((req,res)=>{
    if(req.url==='/one-retry'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(retryRequests++===0?'<p>アクセスが集中しています</p>':'<h2>販売再開</h2><button>選択する</button>');return;}
    if(req.url==='/flow/first'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<a id="next" href="/flow/second">申込情報へ進む</a>');return;}
    if(req.url==='/flow/second'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<label for="fresh-name">お名前</label><input id="fresh-name" name="name"><button data-ar-final>購入を確定する</button>');return;}
    return serveRequest(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let context;
  try{
    context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:true,channel:'chromium',viewport:{width:1440,height:1100},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    const ui=await context.newPage();await ui.goto(`chrome-extension://${id}/options.html?origin=${encodeURIComponent(origin)}`);
    const send=async(type,extra={})=>{const r=await ui.evaluate(m=>chrome.runtime.sendMessage(m),{type,origin,...extra});assert(r.ok,r.error);return r.data;};
    const tabId=await worker.evaluate(async o=>(await chrome.tabs.query({url:o+'/*'}))[0].id,origin);
    // Capture the closed shadow root in the isolated test world before injection.
    // This is test instrumentation only and introduces no production test bridge.
    await worker.evaluate(async tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.hasAttribute('data-autoreload-root'))globalThis.__testPanel=root;return root;};}}),tabId);
    await send('ENABLE',{tabId,enabled:true});
    const waitRun=async(predicate,timeout=12000)=>{const until=Date.now()+timeout;let r;do{r=(await send('GET',{tabId})).run;if(predicate(r))return r;await new Promise(r=>setTimeout(r,200));}while(Date.now()<until);throw new Error('Run timeout: '+JSON.stringify(r));};
    const panelClick=async selector=>worker.evaluate(async({tabId,selector})=>chrome.scripting.executeScript({target:{tabId},func:selector=>globalThis.__testPanel.querySelector(selector).click(),args:[selector]}),{tabId,selector});
    let recorded;
    await t.test('learn disabled target and fields by clicking, without submitting',async()=>{
      await page.locator('#event-date').fill('2026-10-14');await page.locator('#start').click();
      const pick=async(selector)=>{await send('PICK',{tabId,kind:'step'});await page.locator(selector).click({force:true});await panelClick('#save-step');await new Promise(r=>setTimeout(r,100));};
      await pick('[data-date="2026-10-14"]');
      assert.equal(await page.locator('#sample-form').count(),1,'recording should not navigate');
      await page.locator('#sample-form').click();
      for(const selector of ['[name=name]','[name=email]','[name=visit]','[name=quantity]','button[type=submit]'])await pick(selector);
      recorded=(await send('GET',{tabId})).profile;
      assert.equal(recorded.steps.length,6);assert.equal(recorded.steps[0].matchText,'{{date}} | {{grade}}');assert.equal(recorded.steps[1].value,'{{name}}');
      assert.equal(recorded.steps[4].action,'select');assert.equal(await page.locator('#booking-form').count(),1);
      recorded.variables={date:'2026-10-14',grade:'S席',name:'テスト 花子',email:'rehearsal@example.com',quantity:'2'};recorded.interval=2000;recorded.maxInterval=3000;
      await send('SAVE',{profile:recorded});
    });
    await t.test('wait for hidden future item then fill fields despite changed IDs and order',async()=>{
      await page.locator('[data-scenario=sale]').click();await page.locator('#sale-delay').selectOption('15');await page.locator('#start').click();
      assert.equal(await page.locator('[data-date="2026-10-14"]').count(),0);
      await send('START',{tabId,kind:'recipe'});
      const result=await waitRun(r=>r&&!r.active,25000);assert.equal(result.status,'complete',result.message);
      assert.equal(await page.locator('#confirm-purchase').count(),1);
      const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ar-lab')));
      assert.deepEqual(saved.selected,{date:'2026-10-14',grade:'S席'});assert.deepEqual(saved.fields,{quantity:'2',visit:'2026-10-14',email:'rehearsal@example.com',name:'テスト 花子'});
      assert.equal(saved.screen,'review','final purchase must remain manual');
      await page.locator('#confirm-purchase').click();assert.equal(await page.getByRole('heading',{name:'リハーサル完了'}).count(),1);
    });
    await t.test('reload congestion page until recovery, then stop reloading',async()=>{
      await page.locator('[data-scenario=busy]').click();await page.locator('#busy-delay').selectOption('10');await page.locator('#start').click();await send('START',{tabId,kind:'recovery'});
      const result=await waitRun(r=>r&&!r.active,22000);assert.equal(result.status,'recovered',result.message);assert(result.reloads>=2);
      const count=result.reloads;await new Promise(r=>setTimeout(r,3500));assert.equal((await send('GET',{tabId})).run.reloads,count);
      assert.equal(await page.locator('[data-date="2026-10-14"]').count(),1);
    });
    await t.test('ambiguous ticket cards pause instead of choosing one',async()=>{
      await page.evaluate(()=>{const card=document.querySelector('[data-date="2026-10-14"]').closest('article');const clone=card.cloneNode(true);clone.querySelector('button').removeAttribute('id');card.after(clone);});
      await send('START',{tabId,kind:'recipe'});const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'paused');assert.match(result.message,/複数/);assert.equal(await page.locator('#booking-form').count(),0);
    });
    await t.test('verification and actual waiting-room text stop without reloading',async()=>{
      await page.evaluate(()=>{document.getElementById('ticket-app').innerHTML='<h2>Verify you are human</h2><p>アクセスが集中しています</p>';});
      await send('START',{tabId,kind:'recovery'});const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'paused');assert.equal(result.reloads,0);assert.match(result.message,/順番待ち・認証/);
    });
    await t.test('navigation persists progress and rejects final purchase clicks',async()=>{
      await page.goto(origin+'/flow/first');
      const p=C.defaults();p.steps=[{id:'next',action:'click',enabled:true,value:'',matchText:'',target:{tag:'a',text:'申込情報へ進む',id:'next',path:'/flow/first'}},{id:'name',action:'fill',enabled:true,value:'{{name}}',matchText:'',target:{tag:'input',label:'お名前',name:'name',id:'old-name',path:'/flow/second'}},{id:'final',action:'click',enabled:true,value:'',matchText:'',target:{tag:'button',text:'購入を確定する',path:'/flow/second'}}];p.variables.name='ナビゲーション テスト';
      await send('SAVE',{profile:p});await send('START',{tabId,kind:'recipe'});const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'paused',result.message);assert.match(result.message,/確定/);assert.equal(page.url(),origin+'/flow/second');assert.equal(await page.locator('[name=name]').inputValue(),'ナビゲーション テスト');assert.equal(result.index,2);
    });
    await t.test('manual input pauses monitoring',async()=>{
      await send('SAVE',{profile:{...C.defaults(),readyText:'never-visible'}});await send('START',{tabId,kind:'recovery'});await waitRun(r=>r?.activatedAt);await page.locator('[name=name]').fill('手入力');const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'paused');assert.match(result.message,/手動入力/);
    });
    await t.test('CSS-hidden congestion and verification text do not trigger monitoring',async()=>{
      await page.goto(origin+'/flow/second');await page.evaluate(()=>{const hidden=document.createElement('div');hidden.style.display='none';hidden.innerHTML='<span>アクセスが集中しています。Verify you are human</span>';document.body.append(hidden);});
      await send('SAVE',{profile:{...C.defaults(),readyText:'never-visible'}});await send('START',{tabId,kind:'recovery'});await waitRun(r=>r?.activatedAt);await new Promise(r=>setTimeout(r,700));const result=(await send('GET',{tabId})).run;assert.equal(result.active,true);assert.equal(result.reloads,0);await send('STOP',{tabId});
    });
    await t.test('last permitted reload still detects recovery with an unfinished recipe',async()=>{
      await page.goto(origin+'/one-retry');const p=C.defaults();p.interval=2000;p.maxInterval=2000;p.maxReloads=1;p.steps=[{action:'click',target:{tag:'button',path:'/one-retry'},matchText:'{{date}}'}];await send('SAVE',{profile:p});await send('START',{tabId,kind:'recovery'});const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'recovered',result.message);assert.equal(result.reloads,1);
    });
    await t.test('scheduled flow waits, reloads once, and fills at activation',async()=>{
      await page.goto(origin+'/flow/second');const p=C.defaults();p.variables.name='予約 テスト';p.steps=[{id:'name',action:'fill',target:{tag:'input',name:'name',label:'お名前',path:'/flow/second'},value:'{{name}}',enabled:true}];await send('SAVE',{profile:p});
      await send('START',{tabId,kind:'recipe',startAt:Date.now()+2500});assert.equal(await page.locator('[name=name]').inputValue(),'');const result=await waitRun(r=>r&&!r.active);assert.equal(result.status,'complete');assert.equal(result.startReloaded,true);assert.equal(await page.locator('[name=name]').inputValue(),'予約 テスト');
    });
    await t.test('settings UI renders saved profiles and domain OFF stops operation',async()=>{
      await ui.reload();assert.equal(await ui.locator('#var-name').inputValue(),'予約 テスト');await ui.locator('#var-name').fill('保存 テスト');await ui.locator('#save').click();await ui.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('保存しました'));assert.equal((await send('GET',{tabId})).profile.variables.name,'保存 テスト');
      await send('START',{tabId,kind:'recovery'});await send('ENABLE',{tabId,enabled:false});assert.equal((await send('GET',{tabId})).run,null);assert.equal((await send('GET',{tabId})).profile.steps.length,1);
    });
    assert.deepEqual(errors,[],'No uncaught errors in the rehearsal site');
  }finally{await context?.close();await new Promise(resolve=>server.close(resolve));}
});
