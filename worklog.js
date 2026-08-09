
(function(){
'use strict';

const lsKey='worklog.entries.v2';
const settingsKey='worklog.settings.v2';

const fmtNumber=(n,d=2)=>(Number(n)||0).toLocaleString('lv-LV',{minimumFractionDigits:d, maximumFractionDigits:d});
const fmtMoney =(n)=>(Number(n)||0).toLocaleString('lv-LV',{style:'currency', currency:'EUR'});
const parseNum =(s)=>{ if(s==null) return 0; const v=parseFloat(String(s).replace(',','.').trim()); return isNaN(v)?0:v; };
function localISO(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
const parseISO=(iso)=>{ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };

function isoWeekNumber(date){ const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())); const day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d-yearStart)/86400000)+1)/7); }
function weekBounds(date){ const d=new Date(date); const day=(d.getDay()+6)%7; const s=new Date(d); s.setHours(0,0,0,0); s.setDate(d.getDate()-day); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return [s,e]; }
function monthBounds(date){ const d=new Date(date); const s=new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0); const e=new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999); return [s,e]; }
function formatRange(a,b){ const o={day:'2-digit', month:'short'}; return `${a.toLocaleDateString('lv-LV', o)} – ${b.toLocaleDateString('lv-LV', o)}`; }
function monthTitle(d){ return d.toLocaleDateString('lv-LV',{month:'long', year:'numeric'}); }
function escapeHtml(s){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

function easterSunday(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return new Date(y,mo-1,da); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function lvHolidaySet(y){ const s=new Set(),p=(dt)=>s.add(localISO(dt)); p(new Date(y,0,1)); const eas=easterSunday(y); p(addDays(eas,-2)); p(eas); p(addDays(eas,1)); p(new Date(y,4,1)); p(new Date(y,4,4)); p(new Date(y,5,23)); p(new Date(y,5,24)); p(new Date(y,10,18)); p(new Date(y,11,24)); p(new Date(y,11,25)); p(new Date(y,11,26)); p(new Date(y,11,31)); return s; }
function isWeekend(iso){ const d=parseISO(iso); const dow=d.getDay(); return dow===0||dow===6; }
function isHoliday(iso){ const y=parseISO(iso).getFullYear(); return lvHolidaySet(y).has(iso); }
function isWorkday(iso){ const d=parseISO(iso); const dow=(d.getDay()+6)%7; return dow<=4 && !isHoliday(iso); }

function loadEntries(){ try{ return JSON.parse(localStorage.getItem(lsKey)) || []; }catch{ return []; } }
function saveEntries(arr){ localStorage.setItem(lsKey, JSON.stringify(arr)); }
function loadSettings(){ const def={rate:0.00, rateOver:null, rateWeekend:null, threshold:8}; try{ const s=JSON.parse(localStorage.getItem(settingsKey))||def; if(s.rateOver==null) s.rateOver=s.rate; return s; }catch{ return def; } }
function saveSettings(s){ localStorage.setItem(settingsKey, JSON.stringify(s)); }
function addEntry(obj){ const list=loadEntries(); list.push(obj); saveEntries(list); }
function updateEntry(id, patch){ const list=loadEntries().map(e=> e.id===id ? ({...e,...patch}) : e); saveEntries(list); }
function deleteEntry(id){ const list=loadEntries().filter(e=> e.id!==id); saveEntries(list); }

function splitHours(hours, thr){ const over=Math.max(0,hours-thr); const normal=Math.max(0,hours-over); return {normal,over}; }
function dayTotals(entries, iso, settings){
  const rows = entries.filter(e=>e.date===iso);
  const hDay = rows.reduce((s,r)=> s + (Number(r.hours)||0), 0);
  const thr = rows[0]?.threshold ?? settings.threshold ?? 8;
  const weekend = isWeekend(iso), holiday = isHoliday(iso), workday = isWorkday(iso);
  let normal=0, over=0;
  if((weekend||holiday) && hDay>0){ normal=0; over=hDay; }
  else if(workday){ const sp=splitHours(hDay,thr); normal=sp.normal; over=sp.over; }
  else { normal=0; over=hDay; }

  let amount=0;
  rows.forEach(r=>{
    const share = hDay>0 ? (r.hours/hDay) : 0;
    const nPart = normal*share, oPart=over*share;
    const rate = Number(r.rate ?? settings.rate ?? 0);
    const rateOver = Number(r.rateOver ?? settings.rateOver ?? rate);
    const rateWeekend = Number(r.rateWeekend ?? settings.rateWeekend ?? rateOver);
    if(weekend||holiday) amount += oPart * rateWeekend;
    else if(workday)     amount += nPart * rate + oPart * rateOver;
    else                 amount += oPart * rateWeekend;
  });
  return { rows, hDay, normal, over, thr, weekend, holiday, workday, amount };
}
function sumPeriod(entries, startISO, endISO, settings){ const byDay={}; entries.filter(e=>e.date>=startISO && e.date<=endISO).forEach(e=>{ byDay[e.date]=byDay[e.date]||[]; byDay[e.date].push(e); }); let total=0, normal=0, over=0, amount=0; Object.keys(byDay).forEach(iso=>{ const t=dayTotals(entries,iso,settings); total+=t.hDay; normal+=t.normal; over+=t.over; amount+=t.amount; }); return { total, normal, over, amount }; }

function setActiveTab(name){
  document.querySelectorAll('.tabpanel').forEach(p=>{ const is=p.id===name+'Tab'; p.classList.toggle('active',is); p.hidden=!is; p.setAttribute('aria-hidden', String(!is)); });
  if(name==='week') renderWeek();
  if(name==='month') renderMonth();
  if(name==='settings') renderSettings();
}

document.getElementById('homeBtn')?.addEventListener('click', ()=> setActiveTab('week'));
document.getElementById('btnWeek')?.addEventListener('click', ()=> setActiveTab('week'));
document.getElementById('btnMonth')?.addEventListener('click', ()=> setActiveTab('month'));
document.getElementById('btnSettings')?.addEventListener('click', ()=> setActiveTab('settings'));

// ===== Sheet =====
const scrim=document.getElementById('scrim');
const sheet=document.getElementById('daySheet');
const sheetClose=document.getElementById('sheetClose');
const sheetDateLabel=document.getElementById('sheetDateLabel');
const sheetMeta=document.getElementById('sheetMeta');
const sheetEntries=document.getElementById('sheetEntries');
const sheetHours=document.getElementById('sheetHours');
const sheetActivity=document.getElementById('sheetActivity');
const sheetAdd=document.getElementById('sheetAdd');
const sheetCancel=document.getElementById('sheetCancel');

let selectedISO=null;
function openDaySheet(iso){ selectedISO=iso; fillDaySheet(iso); scrim.hidden=false; sheet.hidden=false; requestAnimationFrame(()=> sheet.classList.add('open')); document.body.classList.add('noscroll'); }
function closeDaySheet(){ sheet.classList.remove('open'); setTimeout(()=>{ scrim.hidden=true; sheet.hidden=true; },200); document.body.classList.remove('noscroll'); }
scrim?.addEventListener('click', closeDaySheet); sheetClose?.addEventListener('click', closeDaySheet); sheetCancel?.addEventListener('click', closeDaySheet);

function fillDaySheet(iso){
  const entries=loadEntries(); const settings=loadSettings(); const t=dayTotals(entries,iso,settings);
  const d=parseISO(iso);
  sheetDateLabel.textContent=d.toLocaleDateString('lv-LV', {weekday:'long', day:'2-digit', month:'long'});
  sheetMeta.textContent=`Kopā: ${fmtNumber(t.hDay,2)} h · Obligātās: ${fmtNumber(t.normal,2)} h · Virsst.: ${fmtNumber(t.over,2)} h · Bruto: ${fmtMoney(t.amount)}`;
  sheetEntries.innerHTML='';
  if(t.rows.length){
    t.rows.forEach(r=>{
      const row=document.createElement('div'); row.className='entry';
      row.innerHTML=`<div class="entry-line"><div><strong>${fmtNumber(r.hours,2)} h</strong>${r.activity?` · <span class=\"note\">${escapeHtml(r.activity)}</span>`:''}</div><div class="row-actions"><button class="btn-small" data-act="edit">Rediģēt</button><button class="btn-small" data-act="rate">Likme</button><button class="btn-small" data-act="del">Dzēst</button></div></div>`;
      row.querySelector('[data-act="del"]').addEventListener('click', ()=>{ if(confirm('Dzēst ierakstu?')){ deleteEntry(r.id); renderWeek(); renderMonth(); fillDaySheet(iso); } });
      row.querySelector('[data-act="edit"]').addEventListener('click', ()=>{ const newH=prompt('Jaunas stundas', String(r.hours).replace('.',',')); if(newH==null) return; const hh=parseNum(newH); if(hh<=0) return alert('Nederīgs skaitlis'); const newAct=prompt('Aktivitāte (pēc izvēles)', r.activity ?? ''); updateEntry(r.id, {hours:hh, activity:(newAct??'').trim()}); renderWeek(); renderMonth(); fillDaySheet(iso); });
      row.querySelector('[data-act="rate"]').addEventListener('click', ()=>{ const s=loadSettings(); const isWH=isWeekend(r.date)||isHoliday(r.date); if(isWH){ const current=(r.rateWeekend??s.rateWeekend??s.rateOver??r.rateOver??r.rate); const newR=prompt('Brīvdienu/svētku likme (€ / h)', String(current).replace('.',',')); if(newR==null) return; const rr=parseNum(newR); if(rr<=0) return alert('Nederīgs skaitlis'); updateEntry(r.id, {rateWeekend:rr}); } else { const newRate=prompt('Parastā likme (€ / h)', String(r.rate).replace('.',',')); if(newRate!=null){ const rr=parseNum(newRate); if(rr>0) updateEntry(r.id, {rate:rr}); } const curOT=(r.rateOver??r.rate); const newOT=prompt('Virsstundu likme (€ / h)', String(curOT).replace('.',',')); if(newOT!=null){ const oo=parseNum(newOT); if(oo>0) updateEntry(r.id, {rateOver:oo}); } } renderWeek(); renderMonth(); fillDaySheet(iso); });
      sheetEntries.appendChild(row);
    });
  } else {
    const empty=document.createElement('div'); empty.className='entry'; empty.innerHTML=`<div class="small">Nav ierakstu šai dienai.</div>`; sheetEntries.appendChild(empty);
  }
  sheetHours.value=''; sheetActivity.value='';
}

sheetAdd?.addEventListener('click', ()=>{
  if(!selectedISO) return; const hh=parseNum(sheetHours.value); if(hh<=0) return alert('Ievadi derīgas stundas');
  const s=loadSettings(); addEntry({ id:'e_'+Date.now()+'_'+Math.random().toString(36).slice(2), date:selectedISO, hours:hh,
    activity:(sheetActivity.value??'').trim(), rate:Number(s.rate)||0, rateOver:Number(s.rateOver??s.rate)||0, rateWeekend:Number(s.rateWeekend??s.rateOver??s.rate)||0, threshold:Number(s.threshold)||8 });
  renderWeek(); renderMonth(); closeDaySheet();
});

let currentWeekAnchor=new Date();
const prevWeekBtn=document.getElementById('prevWeek');
const nextWeekBtn=document.getElementById('nextWeek');
const weekNoEl=document.getElementById('weekNo');
const weekRangeEl=document.getElementById('weekRange');
const wHoursEl=document.getElementById('wHours');
const wNormalEl=document.getElementById('wNormal');
const wOverEl=document.getElementById('wOver');
const wAmountEl=document.getElementById('wAmount');
const leftColEl=document.getElementById('weekColLeft');
const rightColEl=document.getElementById('weekColRight');

prevWeekBtn?.addEventListener('click', ()=>{ const [mon]=weekBounds(new Date(currentWeekAnchor)); mon.setDate(mon.getDate()-7); currentWeekAnchor=mon; renderWeek(); });
nextWeekBtn?.addEventListener('click', ()=>{ const [mon]=weekBounds(new Date(currentWeekAnchor)); mon.setDate(mon.getDate()+7); currentWeekAnchor=mon; renderWeek(); });

function renderWeek(){
  const entries=loadEntries(); const settings=loadSettings(); const [ws,we]=weekBounds(currentWeekAnchor);
  weekNoEl.textContent=isoWeekNumber(ws); weekRangeEl.textContent=formatRange(ws,we);
  const totals=sumPeriod(entries, localISO(ws), localISO(we), settings);
  wHoursEl.textContent=fmtNumber(totals.total,2); wNormalEl.textContent=fmtNumber(totals.normal,2); wOverEl.textContent=fmtNumber(totals.over,2); wAmountEl.textContent=fmtMoney(totals.amount);
  leftColEl.innerHTML=''; rightColEl.innerHTML='';
  for(let i=0;i<7;i++){
    const d=new Date(ws); d.setDate(ws.getDate()+i);
    const iso=localISO(d); const t=dayTotals(entries,iso,settings);
    let bg='bg-gray'; if(t.hDay===0) bg='bg-gray'; else if(t.weekend||t.holiday) bg='bg-orange'; else if(t.workday){ if(t.hDay<8) bg='bg-blue'; else if(Math.abs(t.hDay-8)<1e-9) bg='bg-green'; else bg='bg-orange'; } else bg='bg-orange';
    const card=document.createElement('div'); card.className=`day-card ${bg}`;
    const label=d.toLocaleDateString('lv-LV',{weekday:'short', day:'2-digit', month:'short'});
    card.innerHTML=`<div class="day-head"><div class="day-date ${t.holiday?'holiday':''}">${label}</div><div class="badge">${fmtNumber(t.hDay,2)} h</div></div>`;
    if(t.rows.length){ t.rows.forEach(r=>{ const row=document.createElement('div'); row.className='entry'; row.innerHTML=`<div class="entry-line"><div><strong>${fmtNumber(r.hours,2)} h</strong>${r.activity?` · <span class=\"note\">${escapeHtml(r.activity)}</span>`:''}</div></div>`; card.appendChild(row); }); }
    else{ const empty=document.createElement('div'); empty.className='entry'; empty.innerHTML=`<div class="small">Nav ierakstu šai dienai.</div>`; card.appendChild(empty); }
    const bottom=document.createElement('div'); bottom.className='day-bottom'; bottom.textContent=`Obligātās: ${fmtNumber(t.normal,2)} h · Virsstundas: ${fmtNumber(t.over,2)} h · Bruto: ${fmtMoney(t.amount)}`; card.appendChild(bottom);
    card.addEventListener('click', ()=> openDaySheet(iso));
    (i<=2?leftColEl:rightColEl).appendChild(card);
  }
}

let currentMonthAnchor=new Date();
const prevMonthBtn=document.getElementById('prevMonth');
const nextMonthBtn=document.getElementById('nextMonth');
const monthTitleEl=document.getElementById('monthTitle');
const mWorkdaysEl=document.getElementById('mWorkdays');
const mRequiredEl=document.getElementById('mRequired');
const mRemainingDaysEl=document.getElementById('mRemainingDays');
const mRemainingHoursEl=document.getElementById('mRemainingHours');
const mNormalHoursEl=document.getElementById('mNormalHours');
const mOverHoursEl=document.getElementById('mOverHours');
const mTotalHoursEl=document.getElementById('mTotalHours');
const mAmountEl=document.getElementById('mAmount');
const monthListEl=document.getElementById('monthList');

prevMonthBtn?.addEventListener('click', ()=>{ currentMonthAnchor=new Date(currentMonthAnchor.getFullYear(), currentMonthAnchor.getMonth()-1,1); renderMonth(); });
nextMonthBtn?.addEventListener('click', ()=>{ currentMonthAnchor=new Date(currentMonthAnchor.getFullYear(), currentMonthAnchor.getMonth()+1,1); renderMonth(); });

document.getElementById('openPrint')?.addEventListener('click', ()=>{ const y=currentMonthAnchor.getFullYear(); const mm=String(currentMonthAnchor.getMonth()+1).padStart(2,'0'); window.open(`./print.html?month=${y}-${mm}`,'_blank','noopener,noreferrer'); });

function countWorkdaysInMonth(year,mi){ const s=new Date(year,mi,1),e=new Date(year,mi+1,0); let c=0; for(let d=new Date(s); d<=e; d.setDate(d.getDate()+1)){ if(isWorkday(localISO(d))) c++; } return c; }
function remainingWorkdaysFromToday(year,mi){ const now=new Date(); if(now.getFullYear()!==year||now.getMonth()!==mi) return 0; const s=new Date(now.getFullYear(),now.getMonth(),now.getDate()),e=new Date(year,mi+1,0); let c=0; for(let d=new Date(s); d<=e; d.setDate(d.getDate()+1)){ if(isWorkday(localISO(d))) c++; } return c; }

function renderMonth(){ const entries=loadEntries(); const settings=loadSettings(); const [ms,me]=monthBounds(currentMonthAnchor); monthTitleEl.textContent=monthTitle(ms); const startISO=localISO(ms), endISO=localISO(me); const totals=sumPeriod(entries,startISO,endISO,settings); const y=ms.getFullYear(), mi=ms.getMonth(); const workdays=countWorkdaysInMonth(y,mi), required=workdays*8; const remainingDays=remainingWorkdaysFromToday(y,mi), remainingHours=remainingDays*8; mWorkdaysEl.textContent=workdays; mRequiredEl.textContent=required; mRemainingDaysEl.textContent=remainingDays; mRemainingHoursEl.textContent=remainingHours; mNormalHoursEl.textContent=fmtNumber(totals.normal,2); mOverHoursEl.textContent=fmtNumber(totals.over,2); mTotalHoursEl.textContent=fmtNumber(totals.total,2); mTotalHoursEl.classList.remove('total-green','total-orange'); mTotalHoursEl.classList.add(totals.over>0?'total-orange':'total-green'); mAmountEl.textContent=fmtMoney(totals.amount); const byDay={}; entries.filter(e=> e.date>=startISO && e.date<=endISO).forEach(e=>{ byDay[e.date]=byDay[e.date]||[]; byDay[e.date].push(e); }); const days=Object.keys(byDay).sort(); monthListEl.innerHTML=''; if(days.length===0){ const empty=document.createElement('div'); empty.className='month-row'; empty.innerHTML=`<div class="small">Šim mēnesim nav ierakstu.</div><div class="right"></div>`; monthListEl.appendChild(empty); return; } days.forEach(iso=>{ const d=parseISO(iso); const t=dayTotals(entries,iso,settings); const label=d.toLocaleDateString('lv-LV',{weekday:'short', day:'2-digit', month:'short'}); const row=document.createElement('div'); row.className='month-row'; row.innerHTML=`<div><strong class="${isHoliday(iso)?'holiday':''}">${label}</strong><div class="small">${t.rows.length} ieraksti · ${fmtNumber(t.hDay,2)} h · Obligātās ${fmtNumber(t.normal,2)} h · Virsst. ${fmtNumber(t.over,2)} h</div></div><div class="right"><strong>${fmtMoney(t.amount)}</strong></div>`; monthListEl.appendChild(row); }); }

// Settings
const settingsForm=document.getElementById('settingsForm');
const rateDefaultEl=document.getElementById('rateDefault');
const rateOverEl=document.getElementById('rateOver');
const rateWeekendEl=document.getElementById('rateWeekend');
const overtimeThrEl=document.getElementById('overtimeThreshold');

function renderSettings(){ const s=loadSettings(); rateDefaultEl.value=String(s.rate).replace('.',','); rateOverEl.value=String(s.rateOver??s.rate).replace('.',','); rateWeekendEl.value=(s.rateWeekend==null?'':String(s.rateWeekend).replace('.',',')); overtimeThrEl.value=String(s.threshold).replace('.',','); }
settingsForm?.addEventListener('submit',(e)=>{ e.preventDefault(); const rate=parseNum(rateDefaultEl.value); const rateOver=parseNum(rateOverEl.value); const thr=parseNum(overtimeThrEl.value); const rateWeekend=rateWeekendEl.value.trim()===''?null:parseNum(rateWeekendEl.value); if(rate<=0||rateOver<=0||thr<=0) return alert('Pārbaudi iestatījumu vērtības'); if(rateWeekend!=null&&rateWeekend<=0) return alert('Brīvdienu likmei jābūt pozitīvai'); saveSettings({rate,rateOver,rateWeekend,threshold:thr}); renderWeek(); renderMonth(); });

(function init(){ const s=loadSettings(); if(s.rateOver==null){ s.rateOver=s.rate; saveSettings(s); } const [mon]=weekBounds(new Date()); window.currentWeekAnchor=mon; window.currentMonthAnchor=new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderSettings(); setActiveTab('week'); })();
})();
