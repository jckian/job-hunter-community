const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),S=require('../scanner.js');
const p=(patch={})=>({...C.emptyPreferences(),roles:'Software Engineer',...patch});
const source=S.sources(p({scanCatalog:'custom',scanSources:'https://jobs.ashbyhq.com/example'})).list[0];
const raw=(patch={})=>({id:'1',title:'Software Engineer',location:'San Francisco, California',workplaceType:'Hybrid',jobUrl:'https://jobs.ashbyhq.com/example/1',descriptionPlain:'Build with JavaScript and Python',...patch});
const row=(patch={})=>S.normalize({jobs:[raw(patch)]},source)[0];
const cache=()=>{const map=new Map();return{get:async key=>map.get(key),set:async(key,v)=>map.set(key,v)};};
test('expanded catalog includes aggregators and remains opt-out for custom-only profiles',()=>{
  const list=S.sources(p()).list;assert.equal(list.length,17);assert.equal(new Set(list.map(s=>s.key)).size,17);
  assert.ok(list.some(s=>s.kind==='remoteok'));assert.ok(list.some(s=>s.kind==='jobicy'));
  assert.equal(S.sources(p({scanCatalog:'custom'})).list.length,0);
});
test('Remote OK metadata is skipped and geographic restrictions are never invented',()=>{
  const src={kind:'remoteok',key:'remoteok:remote',label:'Remote OK'};
  const jobs=S.normalize([{legal:'Feed attribution'},null,{id:'9',position:'Software Engineer',company:'Example',url:'https://remoteok.com/remote-jobs/9',location:'',description:'<p>Build software</p>',date:'2026-11-10'}],src);
  assert.equal(jobs.length,1);assert.equal(jobs[0].company,'Example');assert.equal(jobs[0].source,'Remote OK');assert.equal(jobs[0].workMode,'remote');assert.equal(jobs[0].location,'');
  assert.equal(S.assess(jobs[0],p({locations:'Taiwan'})).eligible,false);
  assert.equal(jobs[0].description,'Build software');assert.equal(jobs[0].postedAt,'2026-11-10');
});
test('Jobicy maps titles, employer, restrictions, source URLs and monthly salary safely',()=>{
  const jobs=S.normalize({jobs:[{id:1,jobTitle:'Software Engineer',companyName:'Example',jobGeo:'USA',url:'https://jobicy.com/jobs/1',jobDescription:'<p>Python</p>',salaryMin:4000,salaryMax:6000,salaryCurrency:'USD',salaryPeriod:'monthly',pubDate:'2026-11-10'}]}, {kind:'jobicy',key:'jobicy:remote',label:'Jobicy'});
  const j=jobs[0];assert.equal(j.title,'Software Engineer');assert.equal(j.company,'Example');assert.equal(j.source,'Jobicy');assert.equal(j.location,'USA');assert.equal(j.workMode,'remote');assert.equal(j.url,'https://jobicy.com/jobs/1');assert.equal(j.description,'Python');assert.match(j.salary,/monthly/);assert.equal(j.salaryMaximum,'');
  assert.equal(S.assess(j,p({locations:'Taiwan'})).eligible,false);
  assert.equal(S.assess(j,p({locations:'US',salaryMin:'100000',currency:'USD'})).eligible,true);
});
test('old preferences and backups migrate without requiring new fields',()=>{const old={roles:'Designer',workMode:'any'};const result=C.validateState({schemaVersion:1,preferences:old,jobs:[]});assert.equal(result.preferences.scanSchedule,'auto');assert.equal(result.preferences.scanCatalog,'default');assert.equal(result.preferences.roles,'Designer');});
test('custom sources support board and posting links, deduplicate and reject untrusted hosts',()=>{
  const result=S.sources(p({scanCatalog:'custom',scanSources:'https://jobs.ashbyhq.com/example/1\nhttps://jobs.ashbyhq.com/example\nhttps://job-boards.greenhouse.io/example/jobs/3\nhttps://evil.example/jobs\nhttp://localhost:8765/\nhttps://jobs.ashbyhq.com@evil.example/x'}));
  assert.equal(result.list.length,2);assert.equal(result.errors.length,3);assert.match(result.list[0].url,/^https:\/\/api.ashbyhq.com\//);
});
test('roles, locations, workplace type and exclusions actually filter results',()=>{
  assert.equal(S.assess(row(),p()).eligible,true);
  assert.equal(S.assess(row(),p({roles:'軟體工程師',locations:'美國'})).eligible,true);
  assert.equal(S.assess(row({title:'Sales Manager'}),p()).eligible,false);
  assert.equal(S.assess(row(),p({locations:'Taipei'})).eligible,false);
  assert.equal(S.assess(row(),p({workMode:'remote'})).eligible,false);
  assert.equal(S.assess(row({title:'Senior Software Engineer'}),p({exclude:'Senior'})).eligible,false);
  assert.equal(S.contains('Taipei developer','AI'),false);
  assert.equal(S.assess(row({location:'Worldwide',workplaceType:'Remote'}),p({locations:'Taipei',workMode:'remote'})).eligible,true);
  assert.equal(S.assess(row({location:'United States only',workplaceType:'Remote'}),p({locations:'Taipei',workMode:'remote'})).eligible,false);
});
test('skill-only profiles scan; role profiles rank skill and company preferences',()=>{
  assert.equal(S.assess(row(),p({roles:'',keywords:'Python'})).eligible,true);
  assert.equal(S.assess(row(),p({roles:'',keywords:'Figma'})).eligible,false);
  assert.ok(S.assess(row(),p({keywords:'Python'})).score>S.assess(row(),p({keywords:'Figma'})).score);
  assert.equal(S.assess(row(),C.emptyPreferences()).eligible,false);
});
test('normalizers preserve public attribution and exclude hidden/unsafe jobs',()=>{
  assert.equal(S.normalize({jobs:[raw({isListed:false}),raw({jobUrl:'javascript:alert(1)'})]},source).length,0);
  const gh={kind:'greenhouse',key:'greenhouse:example',label:'Example'};
  const jobs=S.normalize({jobs:[{id:2,title:'Designer',absolute_url:'https://example.com/job/2',location:{name:'London'},content:'<p>Design <b>products</b></p>'}]},gh);
  assert.equal(jobs[0].description,'Design products');assert.equal(jobs[0].status,'discovered');assert.equal(jobs[0].appliedDate,'');
  const remote=S.normalize({jobs:[{id:9,title:'Engineer',company_name:'Example',url:'https://remotive.com/remote-jobs/example',candidate_required_location:'Europe',description:'Remote'}]},{kind:'remotive',key:'remotive:remote',label:'Remotive'});
  assert.equal(remote[0].source,'Remotive');assert.match(remote[0].url,/remotive.com/);assert.equal(remote[0].workMode,'remote');
});
test('only comparable structured yearly salary can exclude a listing',()=>{
  const j={...row(),salaryMaximum:'90000',salaryCurrency:'USD'};
  assert.equal(S.assess(j,p({salaryMin:'100000',currency:'USD'})).eligible,false);
  assert.equal(S.assess(j,p({salaryMin:'100000',currency:'TWD'})).eligible,true);
  assert.equal(S.assess(row(),p({salaryMin:'100000',currency:'USD'})).eligible,true);
});
test('repeat scans deduplicate URL trackers and preserve every user-edited field',()=>{
  const j=row();const first=S.merge([], [j,j],p());assert.equal(first.added,1);
  const applied={...C.transition(first.jobs[0],'applied'),notes:'My private note',company:'My corrected company',followupDate:'2026-12-01'};
  const fresh={...j,url:j.url+'?utm_source=test',title:'Updated Software Engineer',description:'Updated description'};
  const second=S.merge([applied],[fresh],p());assert.equal(second.added,0);assert.equal(second.jobs.length,1);
  for(const key of ['notes','company','title','followupDate','appliedDate','status','history'])assert.deepEqual(second.jobs[0][key],applied[key]);
  const manual={...applied,source:''};assert.deepEqual(S.merge([manual],[fresh],p()).jobs[0],manual);
  assert.equal(S.canonical('https://example.com/?gh_jid=1'), 'https://example.com/?gh_jid=1');
});
test('scan fetches public feeds, supports partial failure, and re-filters cached data without network',async()=>{
  let calls=0;const c=cache(),prefs=p({scanCatalog:'custom',scanSources:'https://jobs.ashbyhq.com/example\nhttps://job-boards.greenhouse.io/broken'});
  const fetcher=async(url,options)=>{calls++;assert.equal(options.credentials,'omit');assert.ok(!url.includes('Software'));if(url.includes('broken'))throw Error('network error');return{ok:true,json:async()=>({jobs:[raw()]})};};
  const first=await S.scan(prefs,{fetcher,cache:c});assert.equal(first.reports.filter(r=>r.ok).length,1);assert.equal(first.jobs.length,1);
  const next=await S.scan({...prefs,scanSources:'https://jobs.ashbyhq.com/example',roles:'Accountant'},{fetcher,cache:c});
  assert.equal(calls,2);assert.equal(next.reports[0].cached,true);assert.equal(next.reports[0].matched,0);
});
test('expired cache refreshes and failures are explicit',async()=>{
  let calls=0;const c=cache(),prefs=p({scanCatalog:'custom',scanSources:'https://jobs.ashbyhq.com/example'}),fetcher=async()=>{calls++;return{ok:true,json:async()=>({jobs:[raw()]})};};
  await S.scan(prefs,{cache:c,fetcher,now:()=>100});await S.scan(prefs,{cache:c,fetcher,now:()=>S.INTERVAL+101});assert.equal(calls,2);
  const failed=await S.scan(prefs,{fetcher:async()=>({ok:false,status:429})});assert.equal(failed.jobs.length,0);assert.match(failed.reports[0].error,/429/);
});
test('empty preference, no sources and cancellation cannot silently scan',async()=>{
  await assert.rejects(()=>S.scan(C.emptyPreferences()),/目標職稱/);
  await assert.rejects(()=>S.scan(p({scanCatalog:'custom'})),/職涯頁/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>S.scan(p(),{signal:controller.signal}),/取消/);
});
