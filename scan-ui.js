'use strict';
const S=JobScanner,feedCache=S.createCache(window.indexedDB);
const scanKey=storageKey+':scan';
let scanRunning=false,scanController=null,pendingPreferenceScan=false,lastScan=null;
try{lastScan=JSON.parse(localStorage.getItem(scanKey)||'null');}catch{}
function scanSignature(){return JSON.stringify(state.preferences);}
function writeScanReport(report){lastScan=report;try{localStorage.setItem(scanKey,JSON.stringify(report));}catch{}showScanReport();}
function showScanReport(){
  if(!lastScan){$('scanStatus').textContent='設定 Preference 後自動掃描。也可按「立刻掃描」。';return;}
  $('scanStatus').textContent=lastScan.message;
  $('scanDetails').innerHTML=(lastScan.reports||[]).map(r=>`<li>${esc(r.label)}：${r.ok?`${r.cached?'快取重新比對':'已讀取'} ${r.count} 筆，符合 ${r.matched} 筆（來源更新 ${esc(displayTime(new Date(r.fetchedAt).toISOString()))}）`:'讀取失敗 · '+esc(r.error)}</li>`).join('')+(lastScan.errors||[]).map(e=>`<li>${esc(e)}</li>`).join('');
  $('scanResultDetails').hidden=!(lastScan.reports?.length||lastScan.errors?.length);
}
function configuredForScan(){return C.tokens(state.preferences.roles).length||C.tokens(state.preferences.keywords).length;}
async function executeScan(){
  if(scanRunning)return;
  if(!configuredForScan()){notify('請先設定目標職稱或技能關鍵字，再儲存 Preference。');switchTab('preferences');return;}
  if(!canWrite){notify('瀏覽器儲存目前不可用，請先處理上方提示。');return;}
  scanRunning=true;scanController=new AbortController();const signature=scanSignature(),preferences={...state.preferences};
  $('scanBtn').disabled=true;$('scanBtn').textContent='掃描中…';$('cancelScan').hidden=false;$('scanStatus').textContent='正在依 Preference 讀取公開職缺…';
  try{
    const result=await S.scan(preferences,{cache:feedCache,signal:scanController.signal,onProgress:message=>$('scanStatus').textContent=message});
    if(signature!==scanSignature())throw Error('偏好已變更，舊條件的掃描結果未寫入。');
    const successes=result.reports.filter(r=>r.ok).length;
    if(!successes){writeScanReport({at:Date.now(),signature,reports:result.reports,errors:result.errors,message:'所有來源都讀取失敗，原有紀錄保持不變。請展開來源結果確認。'});return;}
    const merged=S.merge(state.jobs,result.jobs,preferences);
    if(!save({...state,jobs:merged.jobs}))throw Error('掃描結果未能儲存，原紀錄未覆寫。');
    render();
    const limited=merged.overflow?`；另有 ${merged.overflow} 筆因單次新增 300 筆／總數 10,000 筆上限未加入，請縮小偏好條件`:'';
    const cached=result.reports.filter(r=>r.ok).every(r=>r.cached)?'（依六小時快取重新比對）':'';
    writeScanReport({at:Date.now(),signature,reports:result.reports,errors:result.errors,message:`${displayTime(C.now())} · ${successes}/${result.reports.length} 個來源成功${cached}，新增 ${merged.added} 個職缺、${merged.refreshed} 個已存在${limited}。`});
    notify(merged.added?`掃描完成，新增 ${merged.added} 個符合偏好的職缺`:'掃描完成，沒有新符合的職缺；可查看來源結果。');
  }catch(error){$('scanStatus').textContent=error.message;notify(error.message);}
  finally{scanRunning=false;scanController=null;$('scanBtn').disabled=false;$('scanBtn').textContent='立刻掃描 →';$('cancelScan').hidden=true;if(pendingPreferenceScan){pendingPreferenceScan=false;setTimeout(()=>automaticScan(true),0);}}
}
async function startScan(){
  // One scan across tabs on this origin. Requests never carry preferences or private notes.
  if(navigator.locks){await navigator.locks.request('job-hunter-public-scan',{ifAvailable:true},async lock=>{if(!lock){notify('另一個分頁正在掃描，請稍後再試。');return;}await executeScan();});}
  else await executeScan();
}
function automaticScan(force=false){
  if(state.preferences.scanSchedule!=='auto'||!configuredForScan()||document.hidden||!canWrite)return;
  if(force||!lastScan||lastScan.signature!==scanSignature()||Date.now()-lastScan.at>=S.INTERVAL)return startScan().catch(e=>notify(e.message));
}
window.preferenceChanged=()=>{
  if(!state.preferencesUpdatedAt&&!state.jobs.length){lastScan=null;try{localStorage.removeItem(scanKey);}catch{}showScanReport();}
  if(scanRunning){pendingPreferenceScan=true;scanController?.abort();return;}
  renderJobs();return automaticScan(true);
};
$('scanBtn').onclick=()=>startScan().catch(e=>notify(e.message));
$('cancelScan').onclick=()=>{pendingPreferenceScan=false;scanController?.abort();};
document.addEventListener('visibilitychange',()=>automaticScan());
window.addEventListener('storage',e=>{if(e.key===scanKey){try{lastScan=JSON.parse(e.newValue);showScanReport();}catch{}}});
setInterval(()=>automaticScan(),60000);
showScanReport();setTimeout(()=>automaticScan(),1200);
