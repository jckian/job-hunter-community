(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JobCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const STATUS = Object.freeze({discovered:'未投遞',saved:'待投遞',applied:'已投遞',screening:'履歷篩選',interview:'一面',interview2:'二面',offer:'收到 Offer',rejected:'未錄取',withdrawn:'已撤回'});
  const KEY = 'job-hunter-community:v1:';
  const PREF_FIELDS = ['displayName','roles','locations','workMode','companies','seniority','salaryMin','currency','keywords','exclude','authorization','notes'];
  const JOB_FIELDS = ['id','company','title','url','location','workMode','status','appliedDate','followupDate','salary','description','notes','createdAt','updatedAt'];
  const modes = ['any','remote','hybrid','onsite'];
  const text = (v,max=30000) => typeof v === 'string' ? v.slice(0,max) : '';
  const tokens = v => text(v).split(/[,，、\n;]/u).map(x=>x.trim()).filter(Boolean);
  const lower = s => String(s || '').normalize('NFKC').toLocaleLowerCase();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function validDate(value) {
    if (!value) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式須為 YYYY-MM-DD');
    const d = new Date(value+'T12:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==value) throw new Error('日期不正確');
    return value;
  }
  const now = () => new Date().toISOString();
  function safeUrl(value) {
    if (!value) return '';
    try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function emptyPreferences() {
    return Object.fromEntries(PREF_FIELDS.map(k=>[k,k==='workMode'?'any':'']));
  }
  function validatePreferences(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('偏好內容格式不正確');
    const out = emptyPreferences();
    for (const key of PREF_FIELDS) {
      if (p[key]!==undefined && typeof p[key]!=='string' && !(key==='salaryMin' && typeof p[key]==='number')) throw new Error(`偏好欄位 ${key} 格式不正確`);
      out[key] = p[key]===undefined ? out[key] : String(p[key]).trim().slice(0,8000);
    }
    if (!modes.includes(out.workMode)) throw new Error('工作型態不正確');
    if (out.salaryMin && (!/^\d+$/.test(out.salaryMin) || Number(out.salaryMin)>1e9)) throw new Error('期望年薪請填入非負整數');
    return out;
  }
  function emptyState() { return {schemaVersion:VERSION,preferences:emptyPreferences(),preferencesUpdatedAt:'',jobs:[],lastBackupAt:''}; }
  function validateJob(j) {
    if (!j || typeof j!=='object' || Array.isArray(j)) throw new Error('工作紀錄格式不正確');
    const out = {};
    for (const key of JOB_FIELDS) out[key] = text(j[key]).trim();
    if (!out.id || out.id.length>150 || !out.company || !out.title || !Object.hasOwn(STATUS,out.status)) throw new Error('工作紀錄缺少必要欄位或進度不正確');
    if (out.url && !safeUrl(out.url)) throw new Error('職缺網址必須是有效的 http 或 https 網址');
    if (!['unknown','remote','hybrid','onsite'].includes(out.workMode)) out.workMode='unknown';
    out.appliedDate=validDate(out.appliedDate); out.followupDate=validDate(out.followupDate);
    if (['applied','screening','interview','interview2','offer','rejected'].includes(out.status) && !out.appliedDate) throw new Error('已投遞的工作請填寫投遞日期');
    out.createdAt = Number.isFinite(Date.parse(out.createdAt)) ? out.createdAt : now();
    out.updatedAt = Number.isFinite(Date.parse(out.updatedAt)) ? out.updatedAt : out.createdAt;
    if (j.history!==undefined && !Array.isArray(j.history)) throw new Error('工作進度歷程格式不正確');
    out.history = (j.history || []).slice(-1000).map(h=> {
      if (!h || !Object.hasOwn(STATUS,h.status) || typeof h.at!=='string' || !Number.isFinite(Date.parse(h.at))) throw new Error('工作進度歷程格式不正確');
      return {status:h.status,at:h.at};
    });
    return out;
  }
  function validateState(value) {
    if (!value || value.schemaVersion!==VERSION || !Array.isArray(value.jobs) || value.jobs.length>10000) throw new Error('不支援此備份格式（需要 schemaVersion: 1）');
    const jobs=value.jobs.map(validateJob);
    if (new Set(jobs.map(j=>j.id)).size!==jobs.length) throw new Error('備份含有重複的工作 ID');
    return {schemaVersion:VERSION,preferences:validatePreferences(value.preferences),preferencesUpdatedAt:text(value.preferencesUpdatedAt,100),jobs,lastBackupAt:text(value.lastBackupAt,100)};
  }
  function preferenceDocument(p) { return {type:'job-hunter-preferences',schemaVersion:VERSION,updatedAt:now(),preferences:validatePreferences(p)}; }
  function readPreferenceDocument(value) {
    if (value?.type!=='job-hunter-preferences' || value.schemaVersion!==VERSION) throw new Error('請使用本工具產生的 preference.json 格式');
    return validatePreferences(value.preferences);
  }
  function match(job,p) {
    const hay=lower([job.title,job.company,job.location,job.description].join(' '));
    const excluded=tokens(p.exclude).filter(t=>hay.includes(lower(t)));
    const criteria=[];
    for (const [label, terms, value] of [['職稱',tokens(p.roles),job.title],['地點',tokens(p.locations),job.location],['技能',tokens(p.keywords),hay]]) {
      if (terms.length) criteria.push({label,matched:terms.filter(t=>lower(value).includes(lower(t))),terms});
    }
    if (p.workMode!=='any') criteria.push({label:'工作型態',matched:job.workMode===p.workMode?[p.workMode]:[],terms:[p.workMode]});
    const matched=criteria.filter(c=>c.matched.length>0).length;
    return {score:excluded.length?0:criteria.length?Math.round(matched/criteria.length*100):null,excluded,criteria};
  }
  function csv(jobs) {
    const cell = v => { let s=String(v??''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
    const rows=[['公司','職稱','地點','網址','進度','投遞日期','追蹤日期','待遇','筆記'],...jobs.map(j=>[j.company,j.title,j.location,j.url,STATUS[j.status],j.appliedDate,j.followupDate,j.salary,j.notes])];
    return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
  }
  function markdown(p) {
    const labels=['稱呼','目標職稱','工作地點','工作型態','偏好公司／產業','資歷','最低期望年薪','幣別','技能／關鍵字','排除條件','工作許可／簽證','其他偏好'];
    return '# 求職偏好\n\n'+PREF_FIELDS.map((k,i)=>`## ${labels[i]}\n\n${p[k] || '未設定'}\n`).join('\n');
  }
  async function writePreferences(handle, preferences) {
    if (await handle.queryPermission({mode:'readwrite'})!=='granted') return {written:false,reason:'permission'};
    const content=JSON.stringify(preferenceDocument(preferences),null,2);
    const stream=await handle.createWritable();
    try { await stream.write(content); await stream.close(); }
    catch(error) { try { await stream.abort(); } catch {} throw error; }
    return {written:true};
  }
  function transition(job,status) {
    const at=now();
    return validateJob({...job,status,updatedAt:at,appliedDate:['discovered','saved'].includes(status)?'':job.appliedDate||today(),history:job.status===status?job.history:[...job.history,{status,at}]});
  }
  function statistics(jobs) {
    const applied=jobs.filter(j=>j.appliedDate);
    const reached=(j,states)=>states.includes(j.status)||(j.history||[]).some(h=>states.includes(h.status));
    const interview=applied.filter(j=>reached(j,['interview','interview2','offer'])).length;
    const responded=applied.filter(j=>reached(j,['screening','interview','interview2','offer','rejected'])).length;
    const offer=applied.filter(j=>reached(j,['offer'])).length;
    const rate=n=>applied.length?Math.round(100*n/applied.length):0;
    return {applied:applied.length,responded,interview,interview2:applied.filter(j=>reached(j,['interview2','offer'])).length,offer,response_rate:rate(responded),interview_rate:rate(interview),offer_rate:rate(offer)};
  }
  return {VERSION,STATUS,KEY,PREF_FIELDS,JOB_FIELDS,tokens,today,now,safeUrl,emptyPreferences,emptyState,validatePreferences,validateJob,validateState,preferenceDocument,readPreferenceDocument,match,csv,markdown,writePreferences,transition,statistics};
});
