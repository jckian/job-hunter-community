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
function setTheme(theme) { document.documentElement.dataset.theme=theme; $('themeToggle').textContent=theme==='dark'?'淺色模式':'深色模式'; try {localStorage.setItem(themeKey,theme);}catch{} }
let savedTheme; try {savedTheme=localStorage.getItem(themeKey);}catch{}
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
$('themeToggle').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
function switchTab(id) {
  if (!['overview','jobs','preferences','backup'].includes(id)) id='overview';
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==id);
  document.querySelectorAll('.community-nav button').forEach(el=>{el.classList.toggle('active',el.dataset.tab===id); if(el.dataset.tab===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if (location.hash!=='#'+id) history.replaceState(null,'','#'+id);
}
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>switchTab(el.dataset.tab));
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1)));
function populatePreferences() {
  for (const key of C.PREF_FIELDS) $('preferenceForm').elements.namedItem(key).value=state.preferences[key];
  $('preferenceSaved').textContent=state.preferencesUpdatedAt?'上次儲存 '+displayTime(state.preferencesUpdatedAt):'尚未設定';
}
function render() {
  const jobs=state.jobs,p=state.preferences,applied=jobs.filter(j=>j.appliedDate);
  $('welcome').hidden=Boolean(state.preferencesUpdatedAt);
  $('jobCount').textContent=jobs.length;
  const counts=[['待投遞',jobs.filter(j=>j.status==='saved').length],['已投遞',applied.length],['面試中',jobs.filter(j=>['interview','interview2'].includes(j.status)).length],['收到 Offer',jobs.filter(j=>j.status==='offer').length]];
  $('metrics').innerHTML=counts.map(([label,n])=>`<div class="metric"><b>${n.toString().padStart(2,'0')}</b><span>${label}</span></div>`).join('');
  $('preferenceSummary').innerHTML=state.preferencesUpdatedAt?`${p.displayName?`<h3>${esc(p.displayName)} 的下一站</h3>`:''}<div class="chips">${C.tokens(p.roles).map(t=>`<span class="chip">${esc(t)}</span>`).join('') || '<span class="muted">尚未填寫職稱</span>'}</div><div class="summary-row"><span>地點</span>${esc(p.locations || '不限')}</div><div class="summary-row"><span>技能</span>${esc(p.keywords || '尚未設定')}</div><div class="summary-row"><span>其他期待</span>${esc(p.notes || '由你定義')}</div>`:'<div class="empty"><strong>你的條件，由你定義。</strong>填寫目標職稱、地點與技能，開始整理自己的求職方向。</div>';
  const q=[C.tokens(p.roles)[0],C.tokens(p.locations)[0]].filter(Boolean).join(' ');
  $('searchLinks').innerHTML=q?`<a href="https://www.google.com/search?q=${encodeURIComponent(q+' jobs')}" target="_blank" rel="noopener noreferrer">搜尋相關職缺 ↗</a><a href="https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(C.tokens(p.roles).join(' '))}&location=${encodeURIComponent(C.tokens(p.locations)[0]||'')}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>`:'';
  $('recentJobs').innerHTML=[...jobs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,4).map(j=>`<div class="recent-row"><button data-edit="${esc(j.id)}"><strong>${esc(j.title)}</strong><small>${esc(j.company)}</small></button><span class="status-badge status-${j.status}">${C.STATUS[j.status]}</span></div>`).join('')||'<div class="empty"><strong>第一筆紀錄，從這裡開始。</strong>收藏有興趣的工作，或記下已經投出的履歷。</div>';
  const activity=new Map(); applied.forEach(j=>activity.set(j.appliedDate,(activity.get(j.appliedDate)||0)+1));
  const days=[]; for(let i=83;i>=0;i--) {const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const s=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,n=activity.get(s)||0;days.push({s,n});}
  $('activity').innerHTML=days.map(({s,n})=>`<span class="activity-cell level${Math.min(n,3)}" title="${s} · ${n} 份投遞" aria-label="${s}，${n} 份投遞"></span>`).join('');
  $('activityCaption').textContent=`最近 12 週共 ${days.reduce((s,d)=>s+d.n,0)} 份投遞。顏色越深，當天投遞越多。`;
  $('backupStatus').textContent=state.lastBackupAt?'上次下載完整備份：'+displayTime(state.lastBackupAt):'尚未下載過完整備份。';
  renderJobs();
}
function renderJobs() {
  const query=$('jobSearch').value.trim().toLocaleLowerCase(),status=$('statusFilter').value;
  const jobs=state.jobs.filter(j=>(status==='all'||j.status===status)&&[j.company,j.title,j.location,j.notes].join(' ').toLocaleLowerCase().includes(query));
  const sort=$('jobSort').value;
  jobs.sort((a,b)=>sort==='match'?(C.match(b,state.preferences).score??-1)-(C.match(a,state.preferences).score??-1):sort==='applied'?b.appliedDate.localeCompare(a.appliedDate):sort==='followup'?(a.followupDate||'9999').localeCompare(b.followupDate||'9999'):b.updatedAt.localeCompare(a.updatedAt));
  $('jobList').innerHTML=jobs.map(j=>{
    const m=C.match(j,state.preferences),url=C.safeUrl(j.url),reasons=m.excluded.length?'命中排除條件：'+m.excluded.join('、'):m.criteria.map(c=>c.label+'：'+(c.matched.length?'符合':'未符合／資訊不足')).join(' · ');
    return `<article class="job-card"><div><span class="company">${esc(j.company)}</span><h3>${esc(j.title)}</h3><div class="job-meta"><span>${esc(j.location||'地點未註明')}</span>${j.appliedDate?`<span>投遞 ${j.appliedDate}</span>`:''}${j.followupDate?`<span class="${j.followupDate<=C.today()?'danger-text':''}">追蹤 ${j.followupDate}</span>`:''}</div>${j.notes?`<p>${esc(j.notes.slice(0,180))}${j.notes.length>180?'…':''}</p>`:''}<div class="match-detail">${esc(reasons || '設定職稱、地點或關鍵字後，這裡會顯示偏好符合度。')}</div></div><div class="card-actions"><span class="status-badge status-${j.status}">${C.STATUS[j.status]}</span><span class="match">${m.score===null?'尚未比對':m.score+'% 符合'}</span><button data-edit="${esc(j.id)}" class="text-button">編輯紀錄 ↗</button>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">職缺原文 ↗</a>`:''}</div></article>`;
  }).join('')||'<div class="empty"><strong>這裡還沒有工作紀錄。</strong>按「新增工作」開始記錄，或試試其他篩選條件。</div>';
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-edit]');if(button)editJob(button.dataset.edit);});
for(const [status,label] of Object.entries(C.STATUS)){ $('jobStatus').add(new Option(label,status));$('statusFilter').add(new Option(label,status)); }
$('jobSearch').oninput=renderJobs;$('statusFilter').onchange=renderJobs;$('jobSort').onchange=renderJobs;
function editJob(id='') {
  const job=state.jobs.find(j=>j.id===id),form=$('jobForm'); form.reset();
  for(const key of C.JOB_FIELDS) if(form.elements.namedItem(key)) form.elements.namedItem(key).value=job?.[key] || (key==='status'?'saved':key==='workMode'?'unknown':'');
  $('jobDialogTitle').textContent=job?'編輯工作':'新增工作';$('deleteJob').hidden=!job;
  $('jobHistory').innerHTML=job?.history.length?'<details><summary>進度歷程</summary><ul>'+job.history.map(h=>`<li>${esc(displayTime(h.at))} · ${C.STATUS[h.status]}</li>`).join('')+'</ul></details>':'';
  $('jobDialog').showModal();
}
$('heroAdd').onclick=$('addJob').onclick=()=>editJob();
$('closeJob').onclick=()=>$('jobDialog').close();
$('jobStatus').onchange=()=>{const el=$('jobForm').elements.appliedDate;if(!el.value && !['saved','withdrawn'].includes($('jobStatus').value))el.value=C.today();};
$('jobForm').onsubmit=e=>{
  e.preventDefault();
  try{
    const data=Object.fromEntries(new FormData(e.target)),old=state.jobs.find(j=>j.id===data.id),time=C.now();
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
populatePreferences();render();switchTab(location.hash.slice(1));
fileMessage(window.showSaveFilePicker?'尚未連結檔案，可選擇建立 preference.json。':'此瀏覽器未支援直接覆寫檔案。請用下載／匯入 preference.json，其他功能可正常使用。');
handleDb('get').then(async handle=>{if(handle){preferenceHandle=handle;fileAuthorized=await handle.queryPermission({mode:'readwrite'})==='granted';fileMessage(fileAuthorized?'已連結 '+handle.name+'，下次儲存偏好時會覆寫更新。':'已記住 '+handle.name+'。請重新授權寫入，才能繼續更新本機檔案。');}}).catch(()=>{});
