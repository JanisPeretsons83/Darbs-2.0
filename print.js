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


const fmtNumber = (n, d=1) => (Number(n)||0).toLocaleString('lv-LV', {minimumFractionDigits:d, maximumFractionDigits:d});
const parseISO = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
const localISO = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

// LV brīvdienas
const easterSunday=(Y)=>{const a=Y%19;const b=Math.floor(Y/100);const c=Y%100;const d=Math.floor(b/4);const e=b%4;const f=Math.floor((b+8)/25);const g=Math.floor((b-f+1)/3);const h=(19*a+b-d-g+15)%30;const i=Math.floor(c/4);const k=c%4;const l=(32+2*e+2*i-h-k)%7;const m=Math.floor((a+11*h+22*l)/451);const month=Math.floor((h+l-7*m+114)/31);const day=((h+l-7*m+114)%31)+1;return new Date(Y,month-1,day)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const lvHolidaySet=(y)=>{const s=new Set();const add=dt=>s.add(localISO(dt));add(new Date(y,0,1));const eas=easterSunday(y);add(addDays(eas,-2));add(eas);add(addDays(eas,1));add(new Date(y,4,1));add(new Date(y,4,4));add(new Date(y,5,23));add(new Date(y,5,24));add(new Date(y,10,18));add(new Date(y,11,24));add(new Date(y,11,25));add(new Date(y,11,26));add(new Date(y,11,31));return s};
const isWeekend = iso => { const d=parseISO(iso); const g=d.getDay(); return g===0||g===6; };
const isHoliday = iso => lvHolidaySet(parseISO(iso).getFullYear()).has(iso);
const isWorkday = iso => {const d=parseISO(iso); const dow=(d.getDay()+6)%7; return dow<=4 && !isHoliday(iso);} // Mon-Fri & not holiday

function dayTotals(entries, iso, settings){
  const rows = entries.filter(e => e.date === iso);
  const hDay = rows.reduce((s,r) => s + (Number(r.hours)||0), 0);
  const thr  = rows[0]?.threshold ?? settings.threshold ?? 8;

  const weekend = isWeekend(iso);
  const holiday = isHoliday(iso);
  const workday = isWorkday(iso);

  let normal=0, over=0;
  if ((weekend || holiday) && hDay > 0){
    // brīvdienās/svētku dienās visas stundas virsstundas
    normal = 0; over = hDay;
  } else if (workday){
    normal = Math.min(hDay, thr);
    over   = Math.max(0, hDay - thr);
  } else {
    normal = 0; over = hDay;
  }
  return { rows, hDay, normal, over };
}

function render(monthStr){
  const entries = loadEntries();
  const settings = loadSettings();
  const [y,m] = monthStr.split('-').map(Number);
  const y0=y, m0=m-1;

  const start = new Date(y0, m0, 1);
  const end   = new Date(y0, m0+1, 0);

  const monthName  = start.toLocaleDateString('lv-LV',{month:'long'}); // "februāris"
  const monthTitle = monthName.replace(/^./, ch => ch.toUpperCase());  // "Februāris"

  const workdays = countWorkdaysInMonth(y0,m0);
  const required = workdays * (Number(settings.threshold)||8);

  // Kopējās stundas — NEAPAĻOT līdz beigām
  let totalHours = 0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const iso = localISO(d);
    totalHours += dayHoursFor(entries, iso);
  }

  // Virsraksts ar precīzu formātu (neapaļots uz 0)
  document.getElementById('headerTitle').textContent = `${y0}. gada ${monthTitle}`;
  document.getElementById('headerLine1').textContent = `${monthTitle} kopā ir ${workdays} darba dienas un ${required} obligātās darba stundas.`;
  document.getElementById('headerLine2').textContent = `${monthTitle} kopsummā ir nostrādātas ${fmtNumber(totalHours, 1)} stundas.`;

  // Rindas (tikai dienas ar ierakstiem)
  const byDay = {};
  entries
    .filter(e => { const d=parseISO(e.date); return d.getFullYear()===y0 && d.getMonth()===m0; })
    .forEach(e => { (byDay[e.date] ||= []).push(e); });

  const days = Object.keys(byDay).sort();
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  if(days.length===0){
    const tr=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=3; td.className='empty'; td.textContent='Šim mēnesim nav ierakstu.';
    tr.appendChild(td); tbody.appendChild(tr); return;
  }

  
days.forEach(iso=>{
  const d = parseISO(iso);

  // Skaitļi pa dienu no TAVAS loģikas (būs tieši tādi paši kā index.html)
  const t = dayTotals(entries, iso, settings);

  // Teksts "svētd., 01. marts"
  const weekday = d.toLocaleDateString('lv-LV', { weekday:'short' }); // "svētd."
  const dd      = String(d.getDate()).padStart(2,'0');                // "01"
  const month   = d.toLocaleDateString('lv-LV', { month:'long' });    // "marts"
  const dayLabel = `${weekday}, ${dd}. ${month}`;

  // Apvienotas aktivitātes (pēc izvēles)
  const acts = byDay[iso]
    .map(r => (r.activity || '').trim())
    .filter(Boolean)
    .map(a => escapeHtml(a))
    .join('; ');

  // Ierakstu skaits (tavā tekstā tiek lietots “ieraksti” arī vienskaitlim)
  const count = t.rows.length;

  // Izvadām vienu rindu ar vienu šūnu (kolonnu virsraksti nav vajadzīgi šim stilam)
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="daycell" colspan="3">
      <div class="day-head"><strong>${dayLabel}</strong></div>
      <div class="day-meta">
        ${count} ieraksti · ${fmtNumber(t.hDay, 2)} h ·
        Obligātās ${fmtNumber(t.normal, 2)} h · Virsst. ${fmtNumber(t.over, 2)} h
      </div>
      ${acts ? `<div class="day-acts">${acts}</div>` : ``}
    </td>
  `;
  tbody.appendChild(tr);
});


    // chip color
    let chipClass='chip-blue';
    if(isWeekend(iso)||isHoliday(iso)){ chipClass = (h>0?'chip-orange':'chip-gray'); }
    else { const thr=Number(settings.threshold)||8; if(h<thr) chipClass='chip-blue'; else if(Math.abs(h-thr)<1e-9) chipClass='chip-green'; else chipClass='chip-orange'; }

    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td class="cell-date"><strong>${dd}.${mm}</strong></td>
      <td class="cell-hours"><span class="chip ${chipClass}">${fmtNumber(h, 1)}h</span></td>
      <td class="cell-activity">${acts}</td>
    `;
    tbody.appendChild(tr);
  });
}

function tryExit(){
  // ja atnāci no tās pašas vietnes, ej atpakaļ; citādi uz index.html
  try{
    if (document.referrer) {
      const u = new URL(document.referrer);
      if (u.origin === location.origin) { location.href = document.referrer; return; }
    }
  }catch(e){}
  location.href = './index.html';
}

function openInSafari(){
  // mēģinām atvērt to pašu URL jaunā cilnē (tas iOS PWA gadījumā atvērs Safari)
  const url = location.href;
  let win = null;
  try{
    win = window.open(url, '_blank');
  }catch(e){ /* turpinām ar fallback */ }

// Fallback, ja window.open bloķēts
  if(!win){
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
