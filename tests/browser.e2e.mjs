import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {serveRequest} from '../scripts/serve.mjs';
import '../extension/core.js';
const C=globalThis.AR;
const {chromium}=await import(process.env.AUTORELOAD_PLAYWRIGHT?pathToFileURL(process.env.AUTORELOAD_PLAYWRIGHT).href:'playwright');
test('unpacked MV3 extension and ticket rehearsal end-to-end',{timeout:150000},async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'autoreload-e2e-'));
  const extension=path.join(temp,'extension');await cp('extension',extension,{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
  // Only the test copy pre-grants localhost. Production still prompts per domain.
  manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  const server=http.createServer((req,res)=>{
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
