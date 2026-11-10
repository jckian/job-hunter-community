'use strict';
const C = JobCore;
const $ = id => document.getElementById(id);
// A distinct key for every deployment path; never reads an older app's storage.
const storageKey = C.KEY + location.pathname.replace(/index\.html$/,'');
const themeKey = storageKey + ':theme';
let state=C.emptyState(), canWrite=true, preferenceHandle=null, fileAuthorized=false, fileBusy=false, importKind='';
let lastStoredRaw=null;
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('message').textContent=message; $('message').hidden=false; clearTimeout(notify.timer); notify.timer=setTimeout(()=>$('message').hidden=true,6500); }
function warning(message) { $('persistentWarning').textContent=message; $('persistentWarning').hidden=!message; }
try {
  const raw=localStorage.getItem(storageKey); lastStoredRaw=raw;
  if (raw) state=C.validateState(JSON.parse(raw));
  const probe=storageKey+':probe'; localStorage.setItem(probe,'1'); localStorage.removeItem(probe);
} catch (e) { canWrite=false; warning('無法讀取或儲存本機資料，原始資料未被覆寫。請先匯出可讀取的資料、檢查瀏覽器儲存權限，再重新整理。'+e.message); }
function save(next) {
  try {
    if (!canWrite) throw new Error('目前無法安全寫入，請檢查上方提示');
    if (localStorage.getItem(storageKey)!==lastStoredRaw) throw new Error('另一個分頁已更新資料，請重新整理後再編輯');
    const valid=C.validateState(next), raw=JSON.stringify(valid);
    localStorage.setItem(storageKey,raw); lastStoredRaw=raw; state=valid; return true;
  } catch (e) { warning('未儲存：'+e.message+'。請下載備份，避免遺失資料。'); notify('儲存失敗：'+e.message); return false; }
}
window.addEventListener('storage',e=>{ if (e.key===storageKey) warning('另一個分頁已變更這份資料。請重新整理後再編輯，避免覆蓋新內容。'); });
function displayTime(s) { const d=new Date(s); return Number.isFinite(d.getTime())?d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未儲存'; }
function setTheme(theme) { document.documentElement.dataset.theme=theme; $('tLight').classList.toggle('on',theme==='light'); $('tDark').classList.toggle('on',theme==='dark'); try {localStorage.setItem(themeKey,theme);}catch{} }
let savedTheme; try {savedTheme=localStorage.getItem(themeKey);}catch{}
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
$('tLight').onclick=()=>setTheme('light'); $('tDark').onclick=()=>setTheme('dark');
function switchTab(id) {
  if (!['find','save','log','stats','preferences','backup'].includes(id)) id='find';
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==id);
  document.querySelectorAll('nav button').forEach(el=>{el.classList.toggle('active',el.dataset.tab===id); if(el.dataset.tab===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if (location.hash!=='#'+id) history.replaceState(null,'','#'+id);
}
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>switchTab(el.dataset.tab));
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1)));
function populatePreferences() {
  for (const key of C.PREF_FIELDS) $('preferenceForm').elements.namedItem(key).value=state.preferences[key];
  $('preferenceSaved').textContent=state.preferencesUpdatedAt?'上次儲存 '+displayTime(state.preferencesUpdatedAt):'尚未設定';
}
let ranked=true,logFilter='all';
const logFilters={all:['投遞總數',()=>true],waiting:['等待回覆',j=>['applied','screening'].includes(j.status)],interview:['面試中',j=>['interview','interview2'].includes(j.status)],offer:['Offer',j=>j.status==='offer'],rejected:['婉拒',j=>j.status==='rejected'],withdrawn:['已撤回',j=>j.status==='withdrawn']};
function render() {
  const p=state.preferences,applied=state.jobs.filter(j=>j.appliedDate),saved=state.jobs.filter(j=>j.status==='saved');
  $('chipSave').textContent=saved.length||'';$('chipApps').textContent=applied.length?'('+applied.length+')':'';
  const q=[C.tokens(p.roles)[0],C.tokens(p.locations)[0]].filter(Boolean).join(' ');
  $('searchLinks').innerHTML=q?`<a class="link" href="https://www.google.com/search?q=${encodeURIComponent(q+' jobs')}" target="_blank" rel="noopener noreferrer">搜尋職缺 ↗</a>`:'<button class="link" id="setPreferenceLink">設定偏好 →</button>';
  if($('setPreferenceLink'))$('setPreferenceLink').onclick=()=>switchTab('preferences');
  $('saveHint').textContent=`之後要投的職缺 · ${saved.length} 個`;
  $('saveRows').innerHTML=saved.map(jobRow).join('')||'<div class="empty"><b>還沒有待投職缺</b><br>從「職缺」加入待投，或在上方貼網址補上公司與職稱。</div>';
  $('backupStatus').textContent=state.lastBackupAt?'上次下載完整備份：'+displayTime(state.lastBackupAt):'尚未下載過完整備份。';
  renderJobs();renderLog();renderStats();renderHeat(applied.map(j=>({...j,applied_date:j.appliedDate})));
}
function jobRow(j) {
  const m=C.match(j,state.preferences),url=C.safeUrl(j.url);
  return `<div class="row jobrow"><div class="score" title="${esc(m.excluded.length?'排除條件：'+m.excluded.join('、'):'依設定的職稱、地點、技能與工作型態比對')}">${m.score??'–'}</div><div class="sub">${esc(j.company)}</div><div class="big">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a>`:esc(j.title)}</div><div class="tags">${esc(j.location||'—')}</div><div class="tags">${C.STATUS[j.status]}</div><div class="rowbtns"><button class="act" data-edit="${esc(j.id)}">編輯</button>${j.status==='discovered'?`<button class="act" data-move="${esc(j.id)}" data-status="saved">＋ 待投</button>`:''}${j.status==='saved'?`<button class="act" data-move="${esc(j.id)}" data-status="applied">✓ 已投遞</button><button class="x" data-move="${esc(j.id)}" data-status="discovered" title="移出待投">✕</button>`:''}</div></div>`;
}
function renderJobs() {
  const q=$('jobSearch').value.trim().toLocaleLowerCase();
  const jobs=state.jobs.filter(j=>[j.company,j.title,j.location,j.notes].join(' ').toLocaleLowerCase().includes(q));
  jobs.sort((a,b)=>ranked?(C.match(b,state.preferences).score??-1)-(C.match(a,state.preferences).score??-1):b.updatedAt.localeCompare(a.updatedAt));
  $('rankJobs').textContent=ranked?'依偏好排名 ↓':'最近更新 ↓';
  $('findCount').textContent=jobs.length+' 個職缺';
  $('jobRows').innerHTML=jobs.map(jobRow).join('')||'<div class="empty"><b>還沒有符合條件的職缺</b><br>按「新增職缺」開始整理自己的清單。</div>';
}
function renderLog() {
  const applied=state.jobs.filter(j=>j.appliedDate),q=$('logSearch').value.toLocaleLowerCase();
  $('funnel').innerHTML=Object.entries(logFilters).map(([key,[label,test]])=>`<button class="stat f-${key}${logFilter===key?' on':''}" data-filter="${key}"><div class="n">${applied.filter(test).length}</div><div class="k">${label}</div></button>`).join('');
  const jobs=applied.filter(logFilters[logFilter][1]).filter(j=>[j.company,j.title,j.notes].join(' ').toLocaleLowerCase().includes(q)).sort((a,b)=>b.appliedDate.localeCompare(a.appliedDate));
  $('appScope').textContent=(logFilter==='all'?'我投過的工作':logFilters[logFilter][0])+' · '+jobs.length+' 筆';
  $('appRows').innerHTML=jobs.map(j=>`<div class="row approw"><div><input type="date" class="dateinput" aria-label="${esc(j.company)} 投遞日期" data-date="${esc(j.id)}" value="${j.appliedDate}"></div><div class="sub">${esc(j.company)}</div><div class="big">${C.safeUrl(j.url)?`<a href="${esc(C.safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">${esc(j.title)}</a>`:esc(j.title)}${j.followupDate?`<small class="followup">追蹤 ${j.followupDate}</small>`:''}</div><div class="tags">${esc(j.location||'—')}</div><div><select aria-label="${esc(j.company)} 進度" class="st-${j.status}" data-progress="${esc(j.id)}">${Object.entries(C.STATUS).filter(([key])=>!['discovered','saved'].includes(key)).map(([key,label])=>`<option value="${key}" ${j.status===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="acts"><button class="act" data-edit="${esc(j.id)}">編輯</button></div></div>`).join('')||'<div class="empty"><b>這個條件下還沒有投遞紀錄</b></div>';
}
function updateJob(id,change) {
  try{const job=state.jobs.find(j=>j.id===id);if(!job)return;const updated=change(job);if(save({...state,jobs:state.jobs.map(j=>j.id===id?updated:j)})){render();notify('紀錄已更新');}else render();}catch(e){notify(e.message);render();}
}
document.addEventListener('click',e=>{const move=e.target.closest('[data-move]'),filter=e.target.closest('[data-filter]');if(move)updateJob(move.dataset.move,j=>C.transition(j,move.dataset.status));if(filter){logFilter=logFilter===filter.dataset.filter?'all':filter.dataset.filter;renderLog();}});
document.addEventListener('change',e=>{if(e.target.dataset.progress)updateJob(e.target.dataset.progress,j=>C.transition(j,e.target.value));if(e.target.dataset.date)updateJob(e.target.dataset.date,j=>C.validateJob({...j,appliedDate:e.target.value,updatedAt:C.now()}));});
function renderStats() {
  const jobs=state.jobs.filter(j=>j.appliedDate),s=C.statistics(jobs);
  const totals=[['投遞總數',s.applied,''],['有回覆',s.responded,s.response_rate+'%'],['進面試',s.interview,s.interview_rate+'%'],['二面',s.interview2,''],['OFFER',s.offer,s.offer_rate+'%']];
  $('statTotals').innerHTML=totals.map(([k,n,sub])=>`<div class="stat flat"><div class="n">${n}</div><div class="k">${k} ${sub}</div></div>`).join('');
  const nodes=[{key:'total',label:'投遞總數',n:jobs.length,col:0}],links=[];
  const mapping={offer:'offer',interview2:'i2',interview:'i1',screening:'screening',applied:'waiting',rejected:'rej_resume',withdrawn:'silent'};
  for(const [status,label] of [['offer','Offer'],['interview2','二面'],['interview','一面'],['screening','履歷篩選'],['applied','等待回覆'],['rejected','未錄取'],['withdrawn','已撤回']]){
    const n=jobs.filter(j=>j.status===status).length;if(n){const key=mapping[status];nodes.push({key,label,n,col:1});links.push({source:'total',target:key,n});}
  }
  renderSankey({nodes,links});
  $('rates').innerHTML=jobs.length?[['title','職稱'],['company','公司'],['location','地點']].map(([field,label])=>{
    const groups=new Map();for(const j of jobs){const key=j[field]||'未註明';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j);}
    return `<div class="listhead"><b>${label}</b><span class="u-meta">面試率 = 曾進面試 ÷ 投遞數</span></div><div class="sheet"><div class="row head raterow"><div>${label}</div><div>投遞</div><div>回覆</div><div>面試</div><div>面試率</div></div>${[...groups].sort((a,b)=>b[1].length-a[1].length).map(([key,rows])=>{const x=C.statistics(rows);return `<div class="row raterow${rows.length<8?' thin':''}"><div class="big">${esc(key)}</div><div>${x.applied}</div><div>${x.responded}</div><div>${x.interview}</div><div class="barwrap"><span class="bar wide"><i style="width:${x.interview_rate}%"></i></span>${x.interview_rate}%</div></div>`;}).join('')}</div>`;
  }).join(''):'<div class="empty">新增投遞紀錄後，這裡會依職稱、公司與地點統計。</div>';
  $('reads').innerHTML=`<li>投了 <b>${s.applied}</b> 份，有回覆 <b>${s.responded}</b> 份、進到面試 <b>${s.interview}</b> 份、Offer <b>${s.offer}</b> 份。</li><li>面試及 Offer 統計包含已記錄的歷程；流向圖顯示目前進度。少於 8 筆的分類樣本有限，僅供參考。</li>`;
}

document.addEventListener('click',e=>{const button=e.target.closest('[data-edit]');if(button)editJob(button.dataset.edit);});
for(const [status,label] of Object.entries(C.STATUS)){ $('jobStatus').add(new Option(label,status)); }
$('jobSearch').oninput=renderJobs; $('logSearch').oninput=renderLog; $('rankJobs').onclick=()=>{ranked=!ranked;renderJobs();};
function editJob(id='',initialStatus='discovered') {
  const job=state.jobs.find(j=>j.id===id),form=$('jobForm'); form.reset();
  for(const key of C.JOB_FIELDS) if(form.elements.namedItem(key)) form.elements.namedItem(key).value=job?.[key] || (key==='status'?initialStatus:key==='workMode'?'unknown':'');
  $('jobDialogTitle').textContent=job?'編輯工作':'新增工作';$('deleteJob').hidden=!job;
  $('jobHistory').innerHTML=job?.history.length?'<details><summary>進度歷程</summary><ul>'+job.history.map(h=>`<li>${esc(displayTime(h.at))} · ${C.STATUS[h.status]}</li>`).join('')+'</ul></details>':'';
  $('jobDialog').showModal();
}
$('addJob').onclick=()=>editJob();
$('addSaved').onclick=()=>editJob('','saved');
$('addApplied').onclick=()=>{editJob('','applied');$('jobForm').elements.appliedDate.value=C.today();};
$('saveUrlButton').onclick=()=>{const url=$('saveUrl').value.trim();if(!C.safeUrl(url)){notify('請貼上有效的 http 或 https 職缺網址');return;}editJob('','saved');$('jobForm').elements.url.value=url;};
$('saveUrl').onkeydown=e=>{if(e.key==='Enter')$('saveUrlButton').click();};
$('closeJob').onclick=()=>$('jobDialog').close();
$('jobStatus').onchange=()=>{const el=$('jobForm').elements.appliedDate;if(!el.value && !['discovered','saved','withdrawn'].includes($('jobStatus').value))el.value=C.today();};
$('jobForm').onsubmit=e=>{
  e.preventDefault();
  try{
    const data=Object.fromEntries(new FormData(e.target)),old=state.jobs.find(j=>j.id===data.id),time=C.now();
    if(['discovered','saved'].includes(data.status)) data.appliedDate='';
    if(!data.company.trim()||!data.title.trim())throw new Error('請填寫公司與職稱');
    const url=C.safeUrl(data.url); if(data.url&&!url)throw new Error('請填入 http 或 https 網址');
    const duplicate=state.jobs.find(j=>j.id!==data.id&&((url&&j.url===url)||(!url&&j.company.toLocaleLowerCase()===data.company.trim().toLocaleLowerCase()&&j.title.toLocaleLowerCase()===data.title.trim().toLocaleLowerCase())));
    if(duplicate&&!confirm('已有相同網址或公司職稱的紀錄，仍要儲存這筆嗎？'))return;
    const history=[...(old?.history||[])]; if(!old||old.status!==data.status)history.push({status:data.status,at:time});
    const id=old?.id||(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
    const job=C.validateJob({...data,url,id,createdAt:old?.createdAt||time,updatedAt:time,history});
    if(save({...state,jobs:[...state.jobs.filter(j=>j.id!==id),job]})){ $('jobDialog').close();render();notify('工作紀錄已儲存'); }
  }catch(error){notify(error.message);}
};
$('deleteJob').onclick=()=>{const id=$('jobForm').elements.id.value;if(confirm('確定刪除這筆工作與其進度歷程？')&&save({...state,jobs:state.jobs.filter(j=>j.id!==id)})){$('jobDialog').close();render();notify('已刪除紀錄');}};

function download(name,content,type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type:type+';charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function downloadPreferences() {download('preference.json',JSON.stringify(C.preferenceDocument(state.preferences),null,2));notify('已下載目前儲存的偏好');}
$('downloadPreference').onclick=downloadPreferences;
$('downloadPreferenceMd').onclick=()=>download('preference.md',C.markdown(state.preferences),'text/markdown');
$('exportCsv').onclick=()=>download('job-records-'+C.today()+'.csv',C.csv(state.jobs),'text/csv');
function exportBackup() {const next={...state,lastBackupAt:C.now()};download('job-hunter-backup-'+C.today()+'.json',JSON.stringify({...next,type:'job-hunter-backup'},null,2));if(canWrite)save(next);render();notify('已下載完整備份，請妥善保存');}
$('exportBackup').onclick=exportBackup;
function openImport(kind){importKind=kind;$('fileInput').value='';$('fileInput').click();}
$('importPreference').onclick=()=>openImport('preferences');$('importBackup').onclick=()=>openImport('backup');
$('fileInput').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>20*1024*1024)throw new Error('檔案超過 20 MB，請選擇較小的備份');
    const value=JSON.parse(await file.text());
    if(importKind==='preferences'){
      const p=C.readPreferenceDocument(value);
      if(!confirm('匯入後會取代目前的偏好；工作紀錄保持不變。繼續嗎？'))return;
      if(save({...state,preferences:p,preferencesUpdatedAt:C.now()})){populatePreferences();render();await syncPreferenceFile();notify('已匯入偏好，原有工作紀錄保持不變');}
    }else{
      if(value.type!=='job-hunter-backup')throw new Error('請選擇完整備份檔');
      const next=C.validateState(value);
      if(!confirm(`備份包含 ${next.jobs.length} 筆工作。還原會取代此網站目前的偏好與工作紀錄。繼續嗎？`))return;
      if(save(next)){populatePreferences();render();await syncPreferenceFile();notify('已還原備份');}
    }
  }catch(error){notify('匯入失敗：'+error.message);}
};

// Persist only the file handle in IndexedDB. The browser controls file permission.
function handleDb(action,value) {return new Promise((resolve,reject)=>{
  const request=indexedDB.open('job-hunter-community-files',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('handles');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles',action==='get'?'readonly':'readwrite'),store=tx.objectStore('handles');const req=action==='get'?store.get(storageKey):action==='delete'?store.delete(storageKey):store.put(value,storageKey);tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}
function fileMessage(message) {$('fileStatus').textContent=message;$('resumePreference').hidden=!preferenceHandle||fileAuthorized;$('unlinkPreference').hidden=!preferenceHandle;}
async function syncPreferenceFile() {
  if(!preferenceHandle){fileMessage('尚未連結檔案。偏好已保存在瀏覽器，可隨時下載 preference.json。');return;}
  if(fileBusy){fileMessage('正在寫入檔案，請稍後再儲存。');return;}
  fileBusy=true;
  try{
    const result=await C.writePreferences(preferenceHandle,state.preferences);
    if(!result.written){fileAuthorized=false;fileMessage('瀏覽器內偏好已儲存，但檔案尚未更新。請按「重新授權寫入」。');return;}
    fileAuthorized=true;fileMessage('已更新 '+preferenceHandle.name+' · '+displayTime(C.now()));
  }catch(error){fileAuthorized=false;fileMessage('瀏覽器內偏好已儲存，但檔案寫入失敗：'+error.message+'。可重新授權或下載偏好檔。');}
  finally{fileBusy=false;}
}
$('preferenceForm').onsubmit=async e=>{
  e.preventDefault();const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{const p=C.validatePreferences(Object.fromEntries(new FormData(e.target)));if(save({...state,preferences:p,preferencesUpdatedAt:C.now()})){populatePreferences();render();await syncPreferenceFile();notify('偏好已儲存於瀏覽器；檔案狀態請見下方');}}
  catch(error){notify(error.message);}finally{submit.disabled=false;}
};
$('linkPreference').onclick=async()=>{
  if(!window.showSaveFilePicker){notify('此瀏覽器不支援直接寫檔，請使用下載與匯入偏好檔。');return;}
  try{
    const handle=await showSaveFilePicker({suggestedName:'preference.json',types:[{description:'JSON 偏好檔',accept:{'application/json':['.json']}}]});
    const file=await handle.getFile();
    if(file.size>0){
      let existing;try{if(file.size>1024*1024)throw new Error('檔案太大');existing=C.readPreferenceDocument(JSON.parse(await file.text()));}catch{notify('這不是本工具的偏好檔，未覆寫。請選擇新的檔名。');return;}
      if(!confirm('此檔案已有偏好。連結時將先讀取檔案內容，取代目前瀏覽器偏好；之後每次儲存會覆寫這個檔案。繼續嗎？'))return;
      if(!save({...state,preferences:existing,preferencesUpdatedAt:C.now()}))return;
      populatePreferences();render();
    }
    preferenceHandle=handle;fileAuthorized=true;
    try{await handleDb('put',handle);}catch{notify('本次可寫入；瀏覽器無法記住檔案連結，下次需重新連結。');}
    await syncPreferenceFile();
  }catch(error){if(error.name!=='AbortError')notify('無法連結檔案：'+error.message);}
};
$('resumePreference').onclick=async()=>{try{if(await preferenceHandle.requestPermission({mode:'readwrite'})==='granted'){fileAuthorized=true;await syncPreferenceFile();}else fileMessage('尚未取得寫入權限，偏好仍保存在瀏覽器。');}catch(error){fileMessage('授權失敗：'+error.message);}};
$('unlinkPreference').onclick=async()=>{preferenceHandle=null;fileAuthorized=false;try{await handleDb('delete');}catch{}fileMessage('已解除連結，原本的本機檔案沒有刪除。');};
$('resetData').onclick=async()=>{
  if(!confirm('建議先下載完整備份。確定清除這個網站的所有偏好與工作紀錄？'))return;
  if(prompt('請輸入 CLEAR 確認清除')!=='CLEAR')return;
  if(save(C.emptyState())){preferenceHandle=null;fileAuthorized=false;try{await handleDb('delete');}catch{}populatePreferences();render();fileMessage('已解除檔案連結，原本檔案保持不變。');notify('已清除這個版本的資料');}
};
const SK = { W: 1000, H: 420, NODE: 13, GAP: 16, RIGHT: 132 };
function renderSankey(sk) {
  const nodes = sk.nodes || [], links = sk.links || [];
  const total = (nodes.find(n => n.key === "total") || {}).n || 0;
  if (!total) {
    $("sankey").innerHTML = `<div class="empty"><b>還沒有投遞紀錄</b><br>
      在「紀錄」頁新增幾筆,這裡就會畫出流向圖</div>`;
    $("sankeyNote").textContent = "";
    return;
  }
  const maxCol = Math.max(...nodes.map(n => n.col));
  const colX = c => maxCol ? c * (SK.W - SK.RIGHT - SK.NODE) / maxCol : 0;
  // 比例尺要先扣掉「節點最多的那一欄」要用掉的間距,不然那一欄會高過畫布
  const widest = Math.max(...Array.from({ length: maxCol + 1 },
    (_, c) => nodes.filter(n => n.col === c).length));
  const scale = (SK.H - SK.GAP * Math.max(0, widest - 1)) / total;
  const box = {};                                  // key -> {x, y, h, n}
  for (let c = 0; c <= maxCol; c++) {
    const col = nodes.filter(n => n.col === c);
    const hs = col.map(n => Math.max(3, n.n * scale));
    let y = 0;                                     // 頂對齊 → Offer 在最上面
    col.forEach((n, i) => {
      box[n.key] = { x: colX(c), y, h: hs[i], n: n.n, label: n.label, col: c };
      y += hs[i] + SK.GAP;
    });
  }
  // 來源／目標端的縱向配額,照節點順序發,緞帶才不會互相交叉
  const used = {};
  const take = (key, side, h) => {
    const k = key + side;
    const at = (used[k] = (used[k] || 0) + h) - h;
    return box[key].y + at;
  };
  const order = nodes.map(n => n.key);
  const sorted = [...links].sort((a, b) =>
    order.indexOf(a.source) - order.indexOf(b.source) ||
    order.indexOf(a.target) - order.indexOf(b.target));
  const ribbons = sorted.map(l => {
    const h = Math.max(2, l.n * scale);
    const x0 = box[l.source].x + SK.NODE, x1 = box[l.target].x;
    const ya = take(l.source, "-out", h), yb = take(l.target, "-in", h);
    const cx = (x0 + x1) / 2;
    const up = ["i1", "i2", "offer"].includes(l.target);
    const r = v => v.toFixed(1);
    return `<path class="fl ${up ? "up" : "out"}" style="fill:var(--sk-${l.target}, var(--faint))"
      d="M${r(x0)},${r(ya)} C${r(cx)},${r(ya)} ${r(cx)},${r(yb)} ${r(x1)},${r(yb)}
         L${r(x1)},${r(yb + h)} C${r(cx)},${r(yb + h)} ${r(cx)},${r(ya + h)} ${r(x0)},${r(ya + h)} Z"
      ><title>${esc(box[l.source].label)} → ${esc(box[l.target].label)}:${l.n} 筆</title></path>`;
  }).join("");
  const drawn = nodes.map(n => {
    const b = box[n.key];
    return `<rect class="nd" style="fill:var(--sk-${n.key}, var(--fg))" x="${b.x}" y="${b.y.toFixed(1)}"
                  width="${SK.NODE}" height="${b.h.toFixed(1)}"></rect>
      <text x="${b.x + SK.NODE + 8}" y="${(b.y + b.h / 2).toFixed(1)}" dominant-baseline="middle"
        >${esc(n.label)} <tspan class="n">${n.n}・${Math.round(100 * n.n / total)}%</tspan></text>`;
  }).join("");
  $("sankey").innerHTML =
    `<svg viewBox="0 -14 ${SK.W} ${SK.H + 28}" role="img"
          aria-label="投遞流向圖:總共 ${total} 筆投遞">${ribbons}${drawn}</svg>`;
  $("sankeyNote").textContent = '每筆已投遞工作依目前進度計算一次；面試率依已記錄的進度歷程計算。';
}


const HEAT_MID = 5, HEAT_CAP = 10;
const heatShade = n => n <= HEAT_MID
  ? ["on", (n - 1) / (HEAT_MID - 1)]
  : ["on2", (Math.min(n, HEAT_CAP) - HEAT_MID) / (HEAT_CAP - HEAT_MID)];
const WEEKDAY = "日一二三四五六";
let heatCap = "";
function renderHeat(apps) {
  const per = {};
  for (const a of apps) if (a.applied_date) per[a.applied_date] = (per[a.applied_date] || 0) + 1;
  const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  const key = d => d.toLocaleDateString("sv");
  const now = new Date(); now.setHours(12, 0, 0, 0);            // noon keeps day steps DST-safe
  const from = new Date(now); from.setMonth(now.getMonth() - 2);
  if (from.getDate() !== now.getDate()) from.setDate(0);          // e.g. Apr 30 -> Feb 28, not Mar 2
  const start = shift(from, -from.getDay());                      // the Sunday on/before `from`
  const weeks = Math.ceil((Math.round((now - start) / 864e5) + 1) / 7);
  let html = "", total = 0, lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const sun = shift(start, w * 7), m = sun.getMonth();
    // label the column where a month starts; skip a first-column label that would collide
    html += `<span class="hm">${m !== lastMonth && (w > 0 || sun.getDate() <= 21) ? `${m + 1}月` : ""}</span>`;
    lastMonth = m;
    for (let i = 0; i < 7; i++) {
      const d = shift(sun, i);
      if (d > now || d < from) { html += `<i class="hc out"></i>`; continue; }
      const k = key(d), n = per[k] || 0;
      total += n;
      const [tone, t] = n ? heatShade(n) : ["", 0];
      html += `<i class="hc${tone ? " " + tone : ""}${k === key(now) ? " today" : ""}"`
            + `${tone ? ` style="--t:${t.toFixed(3)}"` : ""} data-k="${k}" data-n="${n}"></i>`;
    }
  }
  let week = 0;
  for (let i = 0; i <= now.getDay(); i++) week += per[key(shift(now, -i))] || 0;
  // like GitHub, a streak isn't broken until today ends without an application
  let streak = 0;
  for (let d = per[key(now)] ? now : shift(now, -1); per[key(d)]; d = shift(d, -1)) streak++;

  $("heatGrid").innerHTML = html;
  $("heatSum").textContent = `近兩個月 ${total} 份`;
  heatCap = `本週 ${week} 份 · 連續 ${streak} 天`;
  $("heatCap").textContent = heatCap;
}
function toggleHeat(min = !$("heat").classList.contains("min")) {
  $("heat").classList.toggle("min", min);
  $("heatMin").textContent = min ? "+" : "–";
  $("heatMin").title = min ? "展開" : "收合";
  try {localStorage.setItem(storageKey+":heat-min", min ? "1" : "");}catch{}
}
try { toggleHeat(localStorage.getItem(storageKey+":heat-min") === "1"); } catch {}
$("heatGrid").addEventListener("mouseover", e => {
  const c = e.target.closest(".hc[data-k]");
  if (!c) return;
  const [y, mo, d] = c.dataset.k.split("-").map(Number);
  $("heatCap").textContent = `${mo}月${d}日（${WEEKDAY[new Date(y, mo - 1, d).getDay()]}）· `
    + (+c.dataset.n ? `投了 ${c.dataset.n} 份` : "沒有投遞");
});
$("heatGrid").addEventListener("mouseleave", () => { $("heatCap").textContent = heatCap; });


populatePreferences();render();switchTab(location.hash.slice(1));
fileMessage(window.showSaveFilePicker?'尚未連結檔案，可選擇建立 preference.json。':'此瀏覽器未支援直接覆寫檔案。請用下載／匯入 preference.json，其他功能可正常使用。');
handleDb('get').then(async handle=>{if(handle){preferenceHandle=handle;fileAuthorized=await handle.queryPermission({mode:'readwrite'})==='granted';fileMessage(fileAuthorized?'已連結 '+handle.name+'，下次儲存偏好時會覆寫更新。':'已記住 '+handle.name+'。請重新授權寫入，才能繼續更新本機檔案。');}}).catch(()=>{});
