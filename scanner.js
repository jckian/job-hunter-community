(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.JobScanner=factory(root.JobCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const INTERVAL=6*60*60*1000;
  // Public starting catalog, not a user's preferred employers. Custom-only is available.
  const DEFAULTS=[
    {kind:'remotive',slug:'remote',label:'Remotive · 遠端職缺',url:'https://remotive.com/api/remote-jobs'},
    {kind:'arbeitnow',slug:'europe',label:'Arbeitnow · 歐洲近期職缺（前 300 筆）',url:'https://www.arbeitnow.com/api/job-board-api'},
    {kind:'greenhouse',slug:'stripe',label:'Stripe'},
    {kind:'greenhouse',slug:'airbnb',label:'Airbnb'},
    {kind:'greenhouse',slug:'figma',label:'Figma'},
    {kind:'ashby',slug:'notion',label:'Notion'}
  ];
  function source(s){return {...s,key:s.kind+':'+s.slug,url:s.url||(s.kind==='greenhouse'?`https://boards-api.greenhouse.io/v1/boards/${s.slug}/jobs?content=true`:`https://api.ashbyhq.com/posting-api/job-board/${s.slug}?includeCompensation=true`)};}
  function sources(p){
    const list=p.scanCatalog==='custom'?[]:DEFAULTS.map(source),errors=[];
    const lines=(p.scanSources||'').split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);
    if(lines.length>20)errors.push('自訂來源最多 20 個，超出的來源未掃描。');
    for(const line of lines.slice(0,20)){
      try{
        const u=new URL(line);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error();
        let kind,slug;
        if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(u.hostname)){kind='greenhouse';slug=u.pathname.split('/').filter(Boolean)[0];}
        else if(u.hostname==='jobs.ashbyhq.com'){kind='ashby';slug=u.pathname.split('/').filter(Boolean)[0];}
        else throw Error();
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(slug||''))throw Error();
        list.push(source({kind,slug,label:slug}));
      }catch{errors.push('不支援的職涯頁：'+line+'（請使用 Greenhouse 或 Ashby 的 https 職涯頁）');}
    }
    return {list:[...new Map(list.map(s=>[s.key,s])).values()],errors};
  }
  const plain=value=>String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[s]).replace(/&#(\d+);/g,(s,n)=>+n<=0x10ffff?String.fromCodePoint(+n):' ').replace(/\s+/g,' ').trim();
  const fold=v=>plain(v).normalize('NFKC').toLowerCase().replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
  const aliases=[['軟體工程師','软件工程师','software engineer','software developer'],['前端工程師','前端','frontend','front end'],['後端工程師','後端','backend','back end'],['產品設計師','product designer','product design'],['產品經理','product manager'],['資料分析師','数据分析师','data analyst'],['人工智慧','人工智能','ai','artificial intelligence'],['美國','美国','us','usa','united states','united states of america'],['台灣','台湾','taiwan'],['台北','臺北','taipei'],['德國','德国','germany','deutschland'],['英國','英国','uk','united kingdom'],['遠端','远端','remote'],['紐約','纽约','new york','nyc'],['舊金山','旧金山','san francisco'],['初階','初级','junior','entry level'],['資深','高级','senior','sr']];
  function contains(hay,term){
    hay=fold(hay);term=fold(term);if(!term)return false;
    const choices=aliases.find(a=>a.includes(term))||[term];
    return choices.some(x=>{const escaped=x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return /[\u3400-\u9fff]/.test(x)?hay.includes(x):new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','u').test(hay);});
  }
  function locationMatches(location,term){
    if(contains(location,term))return true;
    if(['美國','美国','us','usa','united states','united states of america'].includes(fold(term)))return /\b(san francisco|new york|seattle|boston|chicago|los angeles|austin|atlanta|denver|california|washington|texas|massachusetts)\b/i.test(location);
    if(['台灣','台湾','taiwan'].includes(fold(term)))return /taipei|taichung|kaohsiung|台北|臺北|新竹/.test(fold(location));
    return false;
  }
  function assess(j,p){
    const roles=C.tokens(p.roles),keywords=C.tokens(p.keywords),locations=C.tokens(p.locations),hay=[j.title,j.company,j.location,j.description].join(' '),reasons=[];
    const excluded=C.tokens(p.exclude).filter(t=>contains(j.title+' '+j.description,t));
    if(excluded.length)reasons.push('排除：'+excluded.join('、'));
    if(roles.length&&!roles.some(t=>contains(j.title,t)))reasons.push('職稱不符');
    if(!roles.length&&keywords.length&&!keywords.some(t=>contains(hay,t)))reasons.push('關鍵字不符');
    if(locations.length&&!locations.some(t=>locationMatches(j.location,t))&&!/^(worldwide|anywhere|全球|不限地點)$/i.test(j.location.trim()))reasons.push('地點不符或未註明');
    if(p.workMode!=='any'&&j.workMode!==p.workMode)reasons.push('工作型態不符或未註明');
    if(p.salaryMin&&p.currency&&j.salaryCurrency&&fold(p.currency)===fold(j.salaryCurrency)&&Number(j.salaryMaximum)>0&&Number(j.salaryMaximum)<Number(p.salaryMin))reasons.push('已公布的年薪上限低於期望');
    const tests=[];
    if(roles.length)tests.push(roles.some(t=>contains(j.title,t)));
    if(keywords.length)tests.push(keywords.some(t=>contains(hay,t)));
    if(locations.length)tests.push(!reasons.includes('地點不符或未註明'));
    if(p.workMode!=='any')tests.push(j.workMode===p.workMode);
    if(C.tokens(p.companies).length)tests.push(C.tokens(p.companies).some(t=>contains(hay,t)));
    if(p.seniority&&!/^(不限|any)$/i.test(p.seniority))tests.push(C.tokens(p.seniority).some(t=>contains(j.title,t)));
    return {eligible:(roles.length+keywords.length)>0&&!reasons.length,score:excluded.length?0:tests.length?Math.round(tests.filter(Boolean).length/tests.length*100):null,reasons,excluded};
  }
  function canonical(url){const safe=C.safeUrl(url);if(!safe)return '';const u=new URL(safe);for(const key of [...u.searchParams.keys()])if(/^utm_|^(source|ref|referrer|gh_src|lever-source)$/i.test(key))u.searchParams.delete(key);u.hash='';u.searchParams.sort();return u.href.replace(/\/$/,'');}
  function hash(s){let a=2166136261,b=5381;for(const c of s){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(16)+(b>>>0).toString(16);}
  function normalize(data,s,at=C.now()){
    const items=s.kind==='arbeitnow'?data?.data:data?.jobs;
    if(!Array.isArray(items))throw new Error('來源回應格式不正確');
    const out=[];
    for(const raw of items.slice(0,5000)){
      if(raw.isListed===false)continue;
      const url=C.safeUrl(raw.absolute_url||raw.jobUrl||raw.url),title=plain(raw.title);if(!url||!title)continue;
      const company=plain(raw.company_name||s.label),location=plain(s.kind==='greenhouse'?raw.location?.name:s.kind==='remotive'?raw.candidate_required_location:[raw.location,...(raw.secondaryLocations||[]).map(x=>x.location)].filter(Boolean).join('; '));
      const mode=fold(raw.workplaceType);const workMode=mode.includes('hybrid')?'hybrid':s.kind==='remotive'||raw.remote===true||raw.isRemote===true||mode==='remote'?'remote':mode==='onsite'||mode==='on site'?'onsite':/\bhybrid\b/i.test(location)?'hybrid':/\bremote\b/i.test(location)?'remote':'unknown';
      const components=(raw.compensation?.compensationTiers||[]).flatMap(t=>t.components||[]).filter(c=>c.compensationType==='Salary'&&c.interval==='YEAR'&&c.currencyCode);
      const currencies=[...new Set(components.map(c=>c.currencyCode))],salaryCurrency=currencies.length===1?currencies[0]:'';
      const mins=components.map(c=>c.minValue).filter(n=>typeof n==='number'),maxs=components.map(c=>c.maxValue).filter(n=>typeof n==='number');
      out.push(C.validateJob({id:'scan-'+hash(canonical(url)),company,title,url,location,workMode,status:'discovered',appliedDate:'',followupDate:'',salary:plain(raw.salary||raw.compensation?.scrapeableCompensationSalarySummary||''),salaryMinimum:salaryCurrency&&mins.length?String(Math.min(...mins)):'',salaryMaximum:salaryCurrency&&maxs.length?String(Math.max(...maxs)):'',salaryCurrency,description:plain(raw.descriptionPlain||raw.content||raw.descriptionHtml||raw.description).slice(0,10000),notes:'',createdAt:at,updatedAt:at,source:s.kind==='remotive'?'Remotive':s.kind==='arbeitnow'?'Arbeitnow':s.kind+' · '+s.label,sourceId:s.key+':'+String(raw.id||raw.slug||hash(url)),fetchedAt:at,postedAt:String(raw.publishedAt||raw.publication_date||raw.updated_at||''),history:[]}));
    }
    return out;
  }
  function merge(existing,incoming,p,at=C.now()){
    const result=existing.map(j=>({...j})),urls=new Map(result.map((j,i)=>[canonical(j.url)||'id:'+j.id,i]));
    let added=0,refreshed=0,overflow=0;
    const accepted=incoming.filter(j=>assess(j,p).eligible).sort((a,b)=>assess(b,p).score-assess(a,p).score);
    for(const j of accepted){
      const key=canonical(j.url),index=urls.get(key);
      if(index!==undefined){const old=result[index];if(old.source){result[index]={...old,fetchedAt:at};refreshed++;}continue;}
      if(result.length>=10000||added>=300){overflow++;continue;}
      urls.set(key,result.length);result.push({...j,createdAt:at,updatedAt:at});added++;
    }
    return {jobs:result,added,refreshed,matched:accepted.length,overflow};
  }
  function createCache(idb){
    const memory=new Map();let dbPromise;
    function db(){return dbPromise||(dbPromise=new Promise(resolve=>{if(!idb){resolve(null);return;}const timer=setTimeout(()=>resolve(null),2000);try{const r=idb.open('job-hunter-public-feed-cache',1);r.onupgradeneeded=()=>r.result.createObjectStore('feeds');r.onerror=()=>{clearTimeout(timer);resolve(null);};r.onsuccess=()=>{clearTimeout(timer);resolve(r.result);};}catch{clearTimeout(timer);resolve(null);}}));}
    async function access(key,value){const conn=await db();if(!conn)return;return new Promise(resolve=>{const timer=setTimeout(()=>resolve(),2000);try{const tx=conn.transaction('feeds',value?'readwrite':'readonly'),s=tx.objectStore('feeds'),r=value?s.put(value,key):s.get(key);tx.oncomplete=()=>{clearTimeout(timer);resolve(r.result);};tx.onerror=tx.onabort=()=>{clearTimeout(timer);resolve();};}catch{clearTimeout(timer);resolve();}});}
    return {get:async k=>memory.get(k)||await access(k),set:async(k,v)=>{memory.set(k,v);await access(k,v);}};
  }
  async function scan(p,{fetcher=globalThis.fetch,cache=createCache(),signal,onProgress=()=>{},now=Date.now}={}){
    if(!C.tokens(p.roles).length&&!C.tokens(p.keywords).length)throw Error('請先填寫目標職稱或技能關鍵字，再儲存 Preference。');
    const configured=sources(p);if(!configured.list.length)throw Error(configured.errors.join('；')||'請加入至少一個 Greenhouse 或 Ashby 職涯頁。');
    let cursor=0;const rows=[],reports=[];
    async function worker(){while(cursor<configured.list.length){if(signal?.aborted)throw Error('掃描已取消');const s=configured.list[cursor++];let timer;try{
      const prior=await cache.get(s.key);let jobs,cached=false,fetchedAt;
      if(prior&&now()-prior.at<INTERVAL){jobs=prior.jobs;cached=true;fetchedAt=prior.at;}
      else{
        onProgress('讀取 '+s.label+'…');const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(abort,20000);
        try{if(signal?.aborted)throw Error('掃描已取消');const response=await fetcher(s.url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('HTTP '+response.status);jobs=normalize(await response.json(),s);fetchedAt=now();await cache.set(s.key,{at:fetchedAt,jobs});}
        finally{signal?.removeEventListener('abort',abort);clearTimeout(timer);}
      }
      rows.push(...jobs);reports.push({key:s.key,label:s.label,ok:true,count:jobs.length,matched:jobs.filter(j=>assess(j,p).eligible).length,cached,fetchedAt});
    }catch(e){reports.push({key:s.key,label:s.label,ok:false,error:e.name==='AbortError'?'連線逾時或已取消':e.message});}finally{clearTimeout(timer);}}
    }
    await Promise.all([worker(),worker()]);if(signal?.aborted)throw Error('掃描已取消');
    return {jobs:rows,reports,errors:configured.errors};
  }
  return {INTERVAL,sources,normalize,assess,canonical,merge,createCache,scan,contains};
});
