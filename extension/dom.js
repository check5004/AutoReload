(() => {
  'use strict';
  const C=globalThis.AR;
  const FIELDS='input:not([type=hidden]),textarea,select,[contenteditable=true]';
  const CLICKS='button,a[href],[role=button],input[type=button],input[type=submit],[role=option],[role=radio]';
  const own = el => !!el?.closest?.('[data-autoreload-root]');
  function visible(el){if(!el?.isConnected||own(el)||el.closest('[hidden],[inert],[aria-hidden=true]'))return false;if(el.checkVisibility&&!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&el.getClientRects().length>0;}
  function available(el){return visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.readOnly;}
  function label(el){const ids=(el.getAttribute('aria-labelledby')||'').split(/\s+/);return (el.getAttribute('aria-label')||ids.map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||Array.from(el.labels||[]).map(x=>x.textContent).join(' ').trim()||el.getAttribute('placeholder')||'').trim().slice(0,500);}
  function text(el){return (el.innerText||el.textContent||el.value||el.getAttribute('title')||'').trim().slice(0,500);}
  function context(el){const group=el.closest('[data-ar-item],article,tr,li,[role=row],.ticket,.product,.card');return group?text(group):text(el);}
  function selector(el){if(el.id)return '#'+CSS.escape(el.id);if(el.getAttribute('name'))return el.tagName.toLowerCase()+'[name="'+CSS.escape(el.getAttribute('name'))+'"]';const parts=[];let current=el;while(current&&current!==document.body&&parts.length<5){let part=current.tagName.toLowerCase();if(current.id){parts.unshift('#'+CSS.escape(current.id));break;}const siblings=Array.from(current.parentElement?.children||[]).filter(s=>s.tagName===current.tagName);if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(current)+1})`;parts.unshift(part);current=current.parentElement;}return parts.join(' > ');}
  function describe(el){return {tag:el.tagName.toLowerCase(),type:el.getAttribute('type')||'',id:el.id||'',name:el.getAttribute('name')||'',label:label(el),text:text(el),context:context(el),selector:selector(el),role:el.getAttribute('role')||'',testid:el.getAttribute('data-testid')||'',path:location.pathname};}
  function sensitive(el){return el.matches('input[type=password],input[type=file],input[type=hidden]')||/^(?:cc-|one-time-code)/i.test(el.autocomplete||'')||/(?:クレジット|カード番号|セキュリティコード|認証コード|暗証|パスワード|cvv|cvc|card.?number|credit.?card|otp|password)/i.test([el.name,el.id,label(el)].join(' '));}
  function finalAction(el){return el.hasAttribute('data-ar-final')||C.FINAL.test([text(el),label(el),el.getAttribute('name')||'',el.id||''].join(' '));}
  function matches(step,vars,{allowDisabled=false}={}){
    const d=step.target;if(!d)return [];
    if(d.path&&d.path!==location.pathname)return [];
    const filter=step.matchText?C.template(step.matchText,vars):'';
    let candidates=Array.from(document.querySelectorAll(step.action==='click'?CLICKS:FIELDS)).filter(el=>!own(el)&&(allowDisabled?visible(el):available(el)));
    if(step.action!=='click')candidates=candidates.filter(el=>!sensitive(el));
    const ranked=candidates.map(el=>{
      if(filter&&!C.includesAll(context(el)+' '+label(el),filter))return {el,score:0};
      let score=0;const exact=(a,b)=>!!a&&C.normalized(a)===C.normalized(b);
      if(exact(d.label,label(el)))score+=70;
      if(exact(d.name,el.getAttribute('name')))score+=55;
      if(exact(d.testid,el.getAttribute('data-testid')))score+=70;
      if(exact(d.id,el.id))score+=45;
      if(exact(d.text,text(el)))score+=45;
      if(filter)score+=85;
      if(d.tag===el.tagName.toLowerCase())score+=8;
      if(d.type&&(el.getAttribute('type')||'')===d.type)score+=8;
      try{if(d.selector&&el.matches(d.selector))score+=15;}catch{}
      if(step.action==='select'&&el.tagName!=='SELECT')score=0;
      if(step.action==='check'&&!el.matches('input[type=checkbox],input[type=radio]'))score=0;
      if(step.action==='fill'&&el.matches('input[type=button],input[type=submit],input[type=checkbox],input[type=radio],select'))score=0;
      return {el,score};
    }).filter(x=>x.score>=50).sort((a,b)=>b.score-a.score);
    if(!ranked.length)return [];
    // Explicit matching text must never silently select one of several matching cards.
    if(filter&&step.action==='click')return ranked.map(x=>x.el);
    return ranked.filter(x=>x.score>=ranked[0].score-12).map(x=>x.el);
  }
  function setValue(el,value){
    if(sensitive(el))throw new Error('この項目は手動で入力してください');
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    if(el.isContentEditable)el.textContent=value;else Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  }
  function apply(step,el,vars){
    if(!available(el))throw new Error('項目がまだ操作できません');
    if(step.action==='click'){
      if(finalAction(el))throw new Error('購入・申込の確定は手動で操作してください');
      const href=el.getAttribute('href');if(href&&new URL(href,location.href).origin!==location.origin)throw new Error('別ドメインへの遷移は手動で進めてください');
      el.click();return;
    }
    const value=C.template(step.value,vars);
    if(step.action==='check'){
      const desired=value==='true';if(!['true','false'].includes(value))throw new Error('チェック欄は true / false を指定します');
      if(el.type==='radio'&&!desired)throw new Error('ラジオボタンは true で選択してください');
      if(el.checked!==desired)el.click();if(el.checked!==desired)throw new Error('チェック状態を確認できません');return;
    }
    let actual=value;
    if(step.action==='select'){
      const opts=Array.from(el.options).filter(o=>!o.disabled&&!o.parentElement?.disabled&&(C.normalized(o.value)===C.normalized(value)||C.normalized(o.textContent)===C.normalized(value)));
      if(opts.length!==1)throw new Error('選択肢が見つからないか、複数あります');actual=opts[0].value;
    }
    setValue(el,actual);
    if(!el.isContentEditable&&el.value!==actual)throw new Error('値が反映されませんでした。形式やサイト側の制約を確認してください');
  }
  function pageText(){if(!document.body)return '';const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node,result='';while((node=walker.nextNode())&&result.length<150000){const parent=node.parentElement;if(!parent||parent.closest('script,style,noscript,template,[data-autoreload-root]')||!node.nodeValue.trim()||!visible(parent))continue;result+=node.nodeValue+' ';}return result.slice(0,150000);}
  globalThis.ARDOM=Object.freeze({FIELDS,CLICKS,visible,available,label,text,context,describe,sensitive,finalAction,matches,apply,pageText});
})();
