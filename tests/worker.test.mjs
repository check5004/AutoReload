import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const source=await readFile('extension/background.js','utf8'),core=await readFile('extension/core.js','utf8');
function event(){const handlers=[];return {addListener:fn=>handlers.push(fn),handlers};}
async function setup(){
  const local={},session={},scripts=new Map(),alarms=new Map(),grants=new Set(['https://tickets.example/*','https://other.example/*']);
  const tabs=new Map([[1,{id:1,url:'https://tickets.example/list'}],[2,{id:2,url:'https://tickets.example/list'}],[3,{id:3,url:'https://other.example/list'}]]);
  const area=obj=>({async get(key){return key==null?structuredClone(obj):{[key]:structuredClone(obj[key])};},async set(values){Object.assign(obj,structuredClone(values));},async remove(key){delete obj[key];},async setAccessLevel(){}});
  const chrome={storage:{local:area(local),session:area(session)},runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({version:'0.1.0'}),onMessage:event(),onInstalled:event(),onStartup:event()},permissions:{contains:async p=>p.origins.every(x=>grants.has(x)),onRemoved:event()},scripting:{unregisterContentScripts:async({ids})=>ids.forEach(id=>scripts.delete(id)),registerContentScripts:async xs=>xs.forEach(x=>scripts.set(x.id,x)),executeScript:async()=>[]},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},tabs:{get:async id=>{if(!tabs.has(id))throw new Error('Missing tab');return tabs.get(id);},query:async()=>[...tabs.values()],sendMessage:async()=>({ok:true}),create:async()=>{},onRemoved:event(),onUpdated:event()},alarms:{create:async(k,v)=>alarms.set(k,v),clear:async k=>alarms.delete(k),onAlarm:event()}};
  const delivered=[],created=[];
  chrome.runtime.getContexts=async filter=>[...tabs.values()].filter(tab=>tab.url?.startsWith('chrome-extension://test/')&&(!filter.tabIds||filter.tabIds.includes(tab.id))).map(tab=>({contextType:'TAB',frameId:0,tabId:tab.id,documentUrl:tab.url}));
  chrome.runtime.sendMessage=async message=>{delivered.push(message);return {ok:true};};
  chrome.tabs.create=async options=>{const tab={id:100+created.length,...options};tabs.set(tab.id,tab);created.push(tab);return tab;};
  chrome.tabs.update=async(id,options)=>Object.assign(tabs.get(id),options);
  chrome.windows={update:async()=>{}};
  let requests=0;
  const context=vm.createContext({chrome,URL,TextEncoder,crypto:webcrypto,AbortSignal,console,structuredClone,setTimeout,clearTimeout,fetch:async url=>{if(String(url).startsWith('chrome-extension:'))return{json:async()=>({repository:'check5004/AutoReload'})};requests++;return{ok:true,status:200,headers:{get:()=>null},json:async()=>({tag_name:'v0.2.0',html_url:'https://evil.example',draft:false,prerelease:false})};}});
  vm.runInContext(core,context);vm.runInContext(source.replace("import './core.js';",''),context);
  const ui={url:'chrome-extension://test/options.html'},content=id=>({url:tabs.get(id).url,tab:tabs.get(id),frameId:0});
  const message=(data,sender=ui)=>new Promise(resolve=>chrome.runtime.onMessage.handlers[0](data,sender,resolve));
  const enable=()=>message({type:'ENABLE',tabId:1,enabled:true});
  return{message,enable,local,session,grants,scripts,tabs,chrome,ui,content,delivered,created,requests:()=>requests};
}
test('enabling requires a grant and registers only that host',async()=>{const s=await setup();s.grants.clear();assert.equal((await s.enable()).ok,false);s.grants.add('https://tickets.example/*');assert.equal((await s.enable()).ok,true);assert.equal(s.scripts.size,1);assert.deepEqual([...s.scripts.values()][0].matches[0],'https://tickets.example/*');});
test('practice opens a bundled tab, reuses it, and requires no host permission',async()=>{
  const s=await setup();s.grants.clear();const opened=await s.message({type:'OPEN_TUTORIAL'});assert.equal(opened.ok,true);assert.equal(s.created[0].url,'chrome-extension://test/tutorial/index.html');
  const again=await s.message({type:'OPEN_TUTORIAL'});assert.equal(again.data.tabId,opened.data.tabId);assert.equal(s.created.length,1);
  assert.equal(s.local['profile:autoreload:practice'].enabled,true);assert.equal(s.scripts.size,0);assert.equal(s.requests(),0);
  await s.message({type:'START',tabId:opened.data.tabId});assert.deepEqual(structuredClone(s.delivered[0]),{type:'WAKE',targetTabId:opened.data.tabId});
});
test('practice messages are restricted to practice data and cannot modify real-site settings',async()=>{
  const s=await setup();await s.enable();const opened=await s.message({type:'OPEN_TUTORIAL'});const sender=s.content(opened.data.tabId);
  const got=await s.message({type:'GET',tabId:1,origin:'https://tickets.example'},sender);assert.equal(got.data.origin,'autoreload:practice');
  assert.equal((await s.message({type:'SAVE',origin:'https://tickets.example',profile:{enabled:false}},sender)).ok,false);
  assert.equal((await s.message({type:'GET',origin:'autoreload:practice'},s.content(1))).data.origin,'https://tickets.example');
  assert.equal(s.local['profile:https://tickets.example'].enabled,true);
});
test('practice remains addressable when tabs metadata hides extension URLs',async()=>{
  const s=await setup();const opened=await s.message({type:'OPEN_TUTORIAL'});const id=opened.data.tabId;
  s.chrome.tabs.get=async tabId=>({id:tabId});
  assert.equal((await s.message({type:'GET',tabId:id})).data.origin,'autoreload:practice');
  assert.equal((await s.message({type:'OPEN_TUTORIAL'})).data.tabId,id);assert.equal(s.created.length,1);
  assert.equal((await s.message({type:'START',tabId:id})).ok,true);assert.equal(s.delivered.at(-1).targetTabId,id);
  s.tabs.get(id).url='chrome-extension://test/tutorial/guide.html';
  await s.chrome.tabs.onUpdated.handlers[0](id,{status:'complete'},{});await new Promise(r=>setTimeout(r,10));
  assert.equal(s.session['run:'+id].active,false);
});
test('content messages cannot read or write another origin or update config',async()=>{const s=await setup();await s.enable();const r=await s.message({type:'GET',origin:'https://other.example',tabId:3},s.content(1));assert.equal(r.data.origin,'https://tickets.example');for(const type of ['SAVE','ENABLE','LIST','UPDATE_CONFIG'])assert.equal((await s.message({type,profile:{},enabled:true,repository:'evil/repo'},s.content(1))).ok,false);assert.equal((await s.message({type:'GET'},{...s.content(1),frameId:2})).ok,false);});
test('an options page opened in a tab is still trusted extension UI',async()=>{const s=await setup();const result=await s.message({type:'ENABLE',tabId:1,enabled:true},{url:'chrome-extension://test/options.html',tab:{id:99,url:'chrome-extension://test/options.html'},frameId:0});assert.equal(result.ok,true);});
test('concurrent starts in two tabs allow only one running tab per origin',async()=>{const s=await setup();await s.enable();const r=await Promise.all([s.message({type:'START',tabId:1}),s.message({type:'START',tabId:2})]);assert.equal(r.filter(x=>x.ok).length,1);assert.equal(Object.values(s.session).filter(x=>x.active).length,1);});
test('reload count and spacing survive page reload, with stale tokens rejected',async()=>{const s=await setup();await s.enable();const start=await s.message({type:'START',tabId:1});const id=start.data.id;const first=await s.message({type:'RELOAD',id},s.content(1));assert.equal(first.data.allowed,true);assert.equal(first.data.run.reloads,1);assert.equal((await s.message({type:'RELOAD',id},s.content(1))).data.allowed,false);assert.equal((await s.message({type:'PATCH_RUN',id:'stale',patch:{index:3}},s.content(1))).data,null);await s.message({type:'STOP',tabId:1});assert.equal((await s.message({type:'RELOAD',id},s.content(1))).data,null);});
test('OFF removes registration and stops active tabs without losing recipe',async()=>{const s=await setup();await s.enable();await s.message({type:'SAVE',origin:'https://tickets.example',profile:{variables:{date:'2026-09-14'},steps:[{target:{tag:'input',label:'来場日'},action:'fill',value:'{{date}}'}]}});await s.message({type:'START',tabId:1,kind:'recipe'});await s.message({type:'ENABLE',tabId:1,enabled:false});assert.equal(s.scripts.size,0);assert.equal(s.session['run:1'],null);assert.equal(s.local['profile:https://tickets.example'].steps.length,1);});
test('external navigation pauses the tab session',async()=>{const s=await setup();await s.enable();await s.message({type:'START',tabId:1});await s.chrome.tabs.onUpdated.handlers[0](1,{url:'https://other.example/'},{});await new Promise(r=>setTimeout(r,10));assert.equal(s.session['run:1'].active,false);});
test('update checks use a trusted release URL, throttle checks and can be muted',async()=>{const s=await setup();assert.equal((await s.message({type:'UPDATE_CHECK'})).ok,true);const r=await s.message({type:'UPDATE_INFO'});assert.equal(r.data.available,true);assert.equal(r.data.state.url,'https://github.com/check5004/AutoReload/releases/tag/v0.2.0');await s.message({type:'UPDATE_CHECK'});assert.equal(s.requests(),1);await s.message({type:'UPDATE_DISMISS'});assert.equal((await s.message({type:'UPDATE_INFO'})).data.available,false);await s.message({type:'UPDATE_CONFIG',repository:'check5004/AutoReload',enabled:false});await s.message({type:'UPDATE_CHECK'});assert.equal(s.requests(),1);});
