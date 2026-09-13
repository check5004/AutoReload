/* Shared pure logic. Loaded in the isolated content-script world and the worker. */
(() => {
  'use strict';
  const BUSY = ['ただいまアクセスが集中','アクセスが集中しています','つながりにくくなっています','混み合っています','混雑しています','service unavailable','temporarily unavailable','too many requests','503 service','502 bad gateway'];
  const HOLD = ['あなたの順番','待ち人数','順番待ち','待機列','仮想待合室','queue-it','you are in line','waiting room','verify you are human','人間であることを確認','私はロボットではありません','セキュリティチェック','captcha'];
  const FINAL = /(?:購入|注文|予約|申[し]?込[み]?).{0,8}(?:確定|完了)|(?:確定|完了).{0,6}(?:購入|注文|申込)|支払[いう]|決済|place\s*order|pay\s*now|confirm\s*(?:purchase|order|booking)|complete\s*(?:purchase|order)/i;
  const clip = (v, n=500) => typeof v === 'string' ? v.slice(0,n) : '';
  const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.min(max,Math.max(min,Number(v))) : fallback;
  function defaults(){return {enabled:false,interval:5000,maxInterval:30000,maxReloads:120,maxMinutes:15,busyText:BUSY.join('\n'),readyText:'',readyTarget:null,stepTimeout:45,reloadAtStart:true,position:'right',variables:{date:'',grade:'S席',quantity:'1',name:'',email:''},steps:[],scheduledAt:''};}
  function descriptor(d){if(!d||typeof d!=='object')return null;return Object.fromEntries(['tag','type','id','name','label','text','context','selector','role','testid','path'].map(k=>[k,clip(d[k],k==='selector'?2000:500)]));}
  function profile(input={}){
    const d=defaults(), p=input&&typeof input==='object'?input:{};
    const variables={};for(const k of Object.keys(d.variables))variables[k]=clip(p.variables?.[k]??d.variables[k],500);
    return {...d,enabled:p.enabled===true,interval:number(p.interval,d.interval,2000,60000),maxInterval:number(p.maxInterval,d.maxInterval,2000,120000),maxReloads:Math.floor(number(p.maxReloads,d.maxReloads,1,300)),maxMinutes:number(p.maxMinutes,d.maxMinutes,1,60),busyText:clip(p.busyText??d.busyText,4000),readyText:clip(p.readyText,1000),readyTarget:descriptor(p.readyTarget),stepTimeout:number(p.stepTimeout,d.stepTimeout,5,180),reloadAtStart:p.reloadAtStart!==false,position:p.position==='left'?'left':'right',variables,scheduledAt:clip(p.scheduledAt,40),steps:(Array.isArray(p.steps)?p.steps:[]).slice(0,40).map(s=>({id:clip(s.id,80)||crypto.randomUUID(),action:['fill','select','click','check'].includes(s.action)?s.action:'fill',target:descriptor(s.target),value:clip(s.value,1000),matchText:clip(s.matchText,1000),enabled:s.enabled!==false})).filter(s=>s.target)};
  }
  function origin(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.origin:null;}catch{return null;}}
  const PRACTICE='autoreload:practice';
  function isPracticeURL(url,extensionRoot){try{const u=new URL(url),root=new URL(extensionRoot);return u.protocol==='chrome-extension:'&&u.host===root.host&&u.pathname==='/tutorial/index.html';}catch{return false;}}
  function tabScope(url,extensionRoot){return isPracticeURL(url,extensionRoot)?PRACTICE:origin(url);}
  async function resolveTabScope(tab,runtime){
    const root=runtime.getURL(''),known=tabScope(tab.url,root);if(known)return known;
    // Own extension URLs may be omitted from tabs metadata without the tabs permission.
    // Use Chrome's extension contexts instead of requesting access to browsing history.
    const contexts=await runtime.getContexts({contextTypes:['TAB'],tabIds:[tab.id]});
    return contexts.some(c=>c.frameId===0&&isPracticeURL(c.documentUrl,root))?PRACTICE:null;
  }
  async function practiceTabs(runtime,tabs){const contexts=await runtime.getContexts({contextTypes:['TAB']});const ids=[...new Set(contexts.filter(c=>c.frameId===0&&isPracticeURL(c.documentUrl,runtime.getURL(''))).map(c=>c.tabId))];return Promise.all(ids.map(id=>tabs.get(id)));}
  function profileScope(value){return value===PRACTICE?PRACTICE:origin(value);}
  function scopeLabel(value){return value===PRACTICE?'内蔵の練習ページ':new URL(value).host;}
  function pattern(url){const o=origin(url);if(!o)throw new Error('通常のWebページで使ってください');const u=new URL(o);return `${u.protocol}//${u.hostname}/*`;}
  function normalized(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?/g,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).replace(/\s+/g,' ').trim();}
  function includesAll(text, terms){const hay=normalized(text);const needles=String(terms||'').split(/[|\n]/).map(normalized).filter(Boolean);return needles.length>0&&needles.every(n=>hay.includes(n));}
  function classify(text,p,positive=false){const t=normalized(text);if(HOLD.some(w=>t.includes(normalized(w))))return 'hold';if(String(p.busyText).split('\n').filter(w=>w.trim()).some(w=>t.includes(normalized(w))))return 'busy';if(positive||includesAll(t,p.readyText))return 'ready';return 'unknown';}
  function dateString(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function template(value,vars,now=new Date()){
    return String(value??'').replace(/\{\{\s*([a-z]+)([+-]\d+)?\s*\}\}/gi,(_,key,offset)=>{
      if(key==='date'||key==='today'){
        const raw=key==='today'?dateString(now):vars.date;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(raw||''))throw new Error('目的の日付を設定してください');
        const d=new Date(raw+'T12:00:00');if(!Number.isFinite(d.getTime())||dateString(d)!==raw)throw new Error('日付が不正です');
        d.setDate(d.getDate()+Number(offset||0));return dateString(d);
      }
      if(offset||!Object.hasOwn(vars,key))throw new Error(`未対応の変数: ${key}${offset||''}`);
      if(!String(vars[key]).trim())throw new Error(`変数「${key}」が空です`);return String(vars[key]);
    });
  }
  function delay(p,attempt,random=Math.random){const max=Math.max(p.interval,p.maxInterval);return Math.round(Math.min(max,p.interval*Math.pow(1.25,Math.max(0,attempt)))*(1+random()*0.12));}
  function expired(run,p,now=Date.now()){return now-(run.activatedAt||run.createdAt)>p.maxMinutes*60000||(run.reloads||0)>=p.maxReloads;}
  function isNewer(a,b){const parse=v=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(v||'')?.slice(1).map(Number);const x=parse(a),y=parse(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
  function repository(s){const v=clip(s,160).trim().replace(/^https:\/\/github\.com\//,'').replace(/\/$/,'');return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/.test(v)&&!v.split('/').includes('..')?v:null;}
  globalThis.AR=Object.freeze({BUSY,HOLD,FINAL,PRACTICE,isPracticeURL,tabScope,resolveTabScope,practiceTabs,profileScope,scopeLabel,defaults,profile,descriptor,origin,pattern,normalized,includesAll,classify,dateString,template,delay,expired,isNewer,repository});
})();
