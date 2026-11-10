const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const C=require('../core.js');
const job=(patch={})=>({id:'test-job',company:'Example Company',title:'Product Designer',url:'https://example.com/jobs/1',location:'Taipei',workMode:'hybrid',status:'applied',appliedDate:'2026-11-09',followupDate:'',salary:'',description:'Figma and user research',notes:'First application',createdAt:C.now(),updatedAt:C.now(),history:[{status:'applied',at:C.now()}],...patch});
test('fresh installation has no personal defaults or records',()=>{const state=C.emptyState();assert.deepEqual(state.jobs,[]);assert.equal(state.preferences.roles,'');assert.equal(state.preferences.displayName,'');assert.equal(state.preferences.workMode,'any');assert.deepEqual(C.validateState(state),state);});
test('full backup round trip keeps dates, Unicode notes and status history',()=>{const state={...C.emptyState(),preferences:{...C.emptyPreferences(),roles:'產品設計師'},jobs:[job({notes:'面試準備\n作品集 <script>test</script>'})]};assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state))),state);});
test('invalid backup cannot silently replace valid jobs',()=>{assert.throws(()=>C.validateState({...C.emptyState(),schemaVersion:2}));assert.throws(()=>C.validateState({...C.emptyState(),jobs:[job(),job()]}));assert.throws(()=>C.validateJob(job({status:'__proto__'})));assert.throws(()=>C.validateJob(job({appliedDate:'2026-02-30'})));assert.throws(()=>C.validateJob(job({appliedDate:''})));assert.throws(()=>C.validateJob(job({history:[{status:'constructor',at:C.now()}]})));});
test('unsafe URLs are rejected; normal URLs remain valid',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','file:///private','https://name:secret@example.com']){assert.equal(C.safeUrl(url),'');assert.throws(()=>C.validateJob(job({url})));}assert.equal(C.safeUrl('https://example.com/jobs?q=design'),'https://example.com/jobs?q=design');});
test('preference JSON round trips and strips unrelated fields',()=>{const p={...C.emptyPreferences(),roles:'Engineer, Designer',notes:'遠端優先',salaryMin:'100000'};const doc=C.preferenceDocument(p);assert.deepEqual(C.readPreferenceDocument(JSON.parse(JSON.stringify(doc))),p);assert.equal(C.validatePreferences({...p,secret:'not persisted'}).secret,undefined);assert.throws(()=>C.readPreferenceDocument({preferences:p}));assert.throws(()=>C.validatePreferences({...p,salaryMin:'-1'}));});
test('matching responds to edits, exclusions, mode and empty preferences',()=>{let p=C.emptyPreferences();assert.equal(C.match(job(),p).score,null);p={...p,roles:'Engineer, Designer',locations:'Taipei',keywords:'Figma',workMode:'hybrid'};assert.equal(C.match(job(),p).score,100);assert.equal(C.match(job(),{...p,locations:'Tokyo'}).score,75);assert.equal(C.match(job(),{...p,exclude:'Product Designer'}).score,0);assert.equal(C.match(job({description:''}),p).score,75);});
test('CSV escapes quotes, multiline cells, Unicode and formula prefixes',()=>{const data=C.csv([job({company:'=SUM(1,1)',notes:'Hello "world"\n第二行'})]);assert.match(data,/"'=SUM\(1,1\)"/);assert.ok(data.includes('"Hello ""world""\n第二行"'));assert.ok(data.startsWith('\ufeff'));});
test('one linked preference file is overwritten by subsequent edits',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'job-hunter-test-')),filename=path.join(dir,'preference.json');
  const handle={queryPermission:async()=> 'granted',createWritable:async()=>{let pending;return{write:async s=>{pending=s;},close:async()=>fs.writeFile(filename,pending),abort:async()=>{}};}};
  try{
    const first={...C.emptyPreferences(),roles:'Designer',notes:'A much longer note to check truncation'};
    assert.deepEqual(await C.writePreferences(handle,first),{written:true});
    const second={...first,roles:'Engineer',notes:''};await C.writePreferences(handle,second);
    assert.deepEqual(C.readPreferenceDocument(JSON.parse(await fs.readFile(filename,'utf8'))),second);
    assert.equal((await fs.readdir(dir)).length,1);
  }finally{await fs.unlink(filename).catch(()=>{});await fs.rmdir(dir);}
});
test('permission denial does not open or modify the selected file',async()=>{let opened=false;const result=await C.writePreferences({queryPermission:async()=> 'prompt',createWritable:async()=>{opened=true;}},C.emptyPreferences());assert.deepEqual(result,{written:false,reason:'permission'});assert.equal(opened,false);});
test('write failure aborts the stream and reports the error',async()=>{let aborted=false;await assert.rejects(()=>C.writePreferences({queryPermission:async()=> 'granted',createWritable:async()=>({write:async()=>{throw new Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}})},C.emptyPreferences()),/disk full/);assert.equal(aborted,true);});
test('static application has no outbound upload or original backend calls',async()=>{const script=await fs.readFile(path.join(__dirname,'../app.js'),'utf8');assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localhost:8765|jh-seen|joblog\.v1/);const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');assert.doesNotMatch(html,/<script[^>]+src=["']https?:/);});
