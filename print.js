(function(){
'use strict';

// ===== Helpers =====
const lsKey = 'worklog.entries.v2';
const settingsKey = 'worklog.settings.v2';
const pad2 = n => String(n).padStart(2,'0');

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

const fmtNumber = (n, d=1) =>
  (Number(n)||0).toLocaleString('lv-LV', { minimumFractionDigits:d, maximumFractionDigits:d });

const parseISO  = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
const localISO  = d   => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

// ===== LV brīvdienas =====
const easterSunday = (Y) => {
  const a=Y%19, b=Math.floor(Y/100), c=Y%100, d=Math.floor(b/4), e=b%4,
        f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4,
        l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451),
        month=Math.floor((h+l-7*m+114)/31), day=((h+l-7*m+114)%31)+1;
  return new Date(Y,month-1,day);
};
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const lvHolidaySet = (y) => {
  const s=new Set(), add = dt => s.add(localISO(dt));
  add(new Date(y,0,1));
  const eas=easterSunday(y); add(addDays(eas,-2)); add(eas); add(addDays(eas,1));
  add(new Date(y,4,1)); add(new Date(y,4,4));
  add(new Date(y,5,23)); add(new Date(y,5,24));
  add(new Date(y,10,18));
  add(new Date(y,11,24)); add(new Date(y,11,25)); add(new Date(y,11,26)); add(new Date(y,11,31));
  return s;
};
const isWeekend = iso => { const d=parseISO(iso); const g=d.getDay(); return g===0 || g===6; };
const isHoliday = iso => lvHolidaySet(parseISO(iso).getFullYear()).has(iso);
const isWorkday = iso => { const d=parseISO(iso); const dow=(d.getDay()+6)%7; return dow<=4 && !isHoliday(iso); }; // Mon–Fri

// ===== Storage =====
function loadEntries(){ try{ return JSON.parse(localStorage.getItem(lsKey))||[]; }catch{ return []; } }
function loadSettings(){ const def={ rate:0, rateOver:0, threshold:8 }; try{ return Object.assign(def, JSON.parse(localStorage.getItem(settingsKey))||{}); }catch{ return def; } }

function countWorkdaysInMonth(y, mi){
  const start=new Date(y,mi,1), end=new Date(y,mi+1,0); let c=0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    if(isWorkday(localISO(d))) c++;
  }
  return c;
}
function dayHoursFor(entries, iso){
  return entries.filter(e=>e.date===iso).reduce((s,e)=> s + (Number(e.hours)||0), 0);
}

// ===== dayTotals (saīsināta app loģika) =====
function dayTotals(entries, iso, settings){
  const rows = entries.filter(e => e.date === iso);
  const hDay = rows.reduce((s,r) => s + (Number(r.hours)||0), 0);
  const thr  = rows[0]?.threshold ?? settings.threshold ?? 8;

  const weekend = isWeekend(iso);
  const holiday = isHoliday(iso);
  const workday = isWorkday(iso);

  let normal=0, over=0;
  if ((weekend || holiday) && hDay > 0){ normal = 0; over = hDay; }
  else if (workday){ normal = Math.min(hDay, thr); over = Math.max(0, hDay - thr); }
  else { normal = 0; over = hDay; }

  return { rows, hDay, normal, over, weekend, holiday, workday };
}

// ===== URL param: ?month=YYYY-MM =====
function getQueryMonth(){
  const m = new URLSearchParams(location.search).get('month');
  return (/^\d{4}-\d{2}$/.test(m||'')) ? m : null;
}

// ===== Render =====
function render(monthStr){
  const entries  = loadEntries();
  const settings = loadSettings();
  const [y,m]    = monthStr.split('-').map(Number);
  const y0=y, m0=m-1;

  const start = new Date(y0, m0, 1);
  const end   = new Date(y0, m0+1, 0);

  const monthName  = start.toLocaleDateString('lv-LV',{month:'long'}); // “februāris”
  const monthTitle = monthName.replace(/^./, ch => ch.toUpperCase());  // “Februāris”

  const workdays = countWorkdaysInMonth(y0,m0);
  const required = workdays * (Number(settings.threshold)||8);

  // Kopējās stundas mēnesī
  let totalHours = 0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const iso = localISO(d);
    totalHours += dayHoursFor(entries, iso);
  }

  // Virsraksts
  document.getElementById('headerTitle').textContent = `${y0}. gada ${monthTitle}`;
  document.getElementById('headerLine1').textContent = `${monthTitle} kopā ir ${workdays} darba dienas un ${required} obligātās darba stundas.`;
  document.getElementById('headerLine2').textContent = `${monthTitle} kopsummā ir nostrādātas ${fmtNumber(totalHours, 1)} stundas.`;

  // Grupē pa dienām (tikai izvēlētajā mēnesī)
  const byDay = {};
  entries
    .filter(e => { const d=parseISO(e.date); return d.getFullYear()===y0 && d.getMonth()===m0; })
    .forEach(e => { (byDay[e.date] ||= []).push(e); });

  const days  = Object.keys(byDay).sort();
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  if(days.length===0){
    const tr=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=3; td.className='empty';
    td.textContent='Šim mēnesim nav ierakstu.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }

  // Katras dienas bloks (kā tavā paraugā) + kopējā stundu izcelšana
  days.forEach(iso=>{
    const d = parseISO(iso);
    const t = dayTotals(entries, iso, settings);

    const weekday  = d.toLocaleDateString('lv-LV', { weekday:'short' }); // “svētd.”
    const dd       = String(d.getDate()).padStart(2,'0');                // “01”
    const month    = d.toLocaleDateString('lv-LV', { month:'long' });    // “marts”
    const dayLabel = `${weekday}, ${dd}. ${month}`;

    const acts = byDay[iso]
      .map(r => (r.activity || '').trim())
      .filter(Boolean)
      .map(a => escapeHtml(a))
      .join('; ');

    const count = t.rows.length;

    // Krāsu klase (tāda pati loģika kā appā)
    let totalClass = 'total-blue';
    if (t.weekend || t.holiday){
      totalClass = (t.hDay > 0 ? 'total-orange' : 'total-gray');
    } else {
      const thr = Number(settings.threshold) || 8;
      if      (t.hDay <  thr) totalClass = 'total-blue';
      else if (Math.abs(t.hDay - thr) < 1e-9) totalClass = 'total-green';
      else    totalClass = 'total-orange';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="daycell" colspan="3">
        <div class="day-head"><strong>${dayLabel}</strong></div>
        <div class="day-meta">
          ${count} ieraksti ·
          <span class="total ${totalClass}">${fmtNumber(t.hDay, 2)} h</span> ·
          Obligātās ${fmtNumber(t.normal, 2)} h ·
          Virsst. ${fmtNumber(t.over, 2)} h
        </div>
        ${acts ? `<div class="day-acts">${acts}</div>` : ``}
      </td>
    `;
    tbody.appendChild(tr);
  });
} // <— render beigas

// ===== Navigācija / drukas uzvedība =====
function tryExit(){
  try{
    if (document.referrer) {
      const u = new URL(document.referrer);
      if (u.origin === location.origin) { location.href = document.referrer; return; }
    }
  }catch(e){}
  location.href = './index.html';
}

function openInSafari(){
  const url = location.href;
  let win = null;
  try{ win = window.open(url, '_blank'); }catch(e){}
  if(!win){
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
}

function init(){
  const mi = document.getElementById('monthInput');
  const monthStr = getQueryMonth() || `${new Date().getFullYear()}-${pad2(new Date().getMonth()+1)}`;
  if(mi){ mi.value = monthStr; mi.addEventListener('change', ()=> render(mi.value)); }
  render(monthStr);

  const pb = document.getElementById('printBtn'); if(pb) pb.addEventListener('click', ()=> window.print());
  const xb = document.getElementById('exitBtn');  if(xb) xb.addEventListener('click', tryExit);

  // Rādīt “Atvērt Safari” tikai PWA režīmā (Add to Home Screen)
  const isPWA = window.matchMedia('(display-mode: standalone)').matches
             || window.navigator.standalone === true;
  const ois = document.getElementById('openInSafariBtn');
  if (isPWA && ois){
    ois.hidden = false;
    ois.addEventListener('click', openInSafari, { passive:true });
  }

  window.addEventListener('afterprint', ()=> setTimeout(tryExit, 100));
}

init();
})();
