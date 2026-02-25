(function(){
'use strict';

// ===== Helpers =====
const lsKey = 'worklog.entries.v2';
const settingsKey = 'worklog.settings.v2';
const pad2 = n => String(n).padStart(2,'0');

const escapeHtml = s => String(s || '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const parseISO = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
const localISO = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

// LV svētku palīgi
const easterSunday = (Y) => { 
  const a=Y%19; const b=Math.floor(Y/100); const c=Y%100; const d=Math.floor(b/4);
  const e=b%4; const f=Math.floor((b+8)/25); const g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30; const i=Math.floor(c/4); const k=c%4;
  const l=(32+2*e+2*i-h-k)%7; const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31); const day=((h+l-7*m+114)%31)+1; 
  return new Date(Y,month-1,day);
};
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const lvHolidaySet = (y) => { 
  const s=new Set(); const add = dt => s.add(localISO(dt));
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
const isWorkday = iso => { const d=parseISO(iso); const dow=(d.getDay()+6)%7; return dow<=4 && !isHoliday(iso); }; // Mon–Fri & not holiday

function loadEntries(){ try{ return JSON.parse(localStorage.getItem(lsKey)) || []; } catch{ return []; } }
function loadSettings(){ const def = { rate:0, rateOver:0, threshold:8 };
  try{ return Object.assign(def, JSON.parse(localStorage.getItem(settingsKey)) || {}); } catch{ return def; } }

function countWorkdaysInMonth(y, mi){
  const start = new Date(y, mi, 1);
  const end   = new Date(y, mi+1, 0);
  let c=0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    if(isWorkday(localISO(d))) c++;
  }
  return c;
}

function dayHoursFor(entries, iso){
  return entries.filter(e => e.date === iso)
                .reduce((s,e) => s + (Number(e.hours) || 0), 0);
}

function render(monthStr){
  const entries  = loadEntries();
  const settings = loadSettings();
  const [y, m]   = monthStr.split('-').map(Number);
  const y0 = y, m0 = m - 1;

  const start = new Date(y0, m0, 1);
  const end   = new Date(y0, m0 + 1, 0);

  // Mēneša nosaukumi
  const monthName  = start.toLocaleDateString('lv-LV', { month:'long' }); // "februāris"
  const cap        = s => s.charAt(0).toUpperCase() + s.slice(1);
  const monthTitle = cap(monthName); // "Februāris"

  // Darba dienu skaits un obligātās stundas
  const workdays = countWorkdaysInMonth(y0, m0);
  const required = workdays * (Number(settings.threshold) || 8);

  // Kopējās stundas šim mēnesim
  let totalHours = 0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const iso = localISO(d);
    totalHours += dayHoursFor(entries, iso);
  }

  // Virsraksta teksti
  document.getElementById('headerTitle').textContent = `${y0}. gada ${monthTitle}`; // piem., "2026. gada Februāris"
  document.getElementById('headerLine1').textContent = `${monthTitle} kopā ir ${workdays} darba dienas un ${required} obligātās darba stundas.`;
  document.getElementById('headerLine2').textContent = `${monthTitle} kopsummā ir nostrādātas ${totalHours.toFixed(0)} stundas.`;

  // Rindas (tikai dienas, kur ir ieraksti)
  const byDay = {};
  entries
    .filter(e => { const d=parseISO(e.date); return d.getFullYear()===y0 && d.getMonth()===m0; })
    .forEach(e => { (byDay[e.date] ||= []).push(e); });

  const days = Object.keys(byDay).sort();
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  if(days.length === 0){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'empty';
    td.textContent = 'Šim mēnesim nav ierakstu.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  days.forEach(iso => {
    const d = parseISO(iso);
    const h = dayHoursFor(entries, iso);
    const acts = byDay[iso]
      .map(r => (r.activity || '').trim())
      .filter(Boolean)
      .map(a => escapeHtml(a))
      .join('; ');

    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth()+1);

    // Čipa krāsa (tā pati loģika kā appā)
    let chipClass = 'chip-blue';
    if(isWeekend(iso) || isHoliday(iso)){
      chipClass = (h > 0 ? 'chip-orange' : 'chip-gray');
    }else{
      const thr = Number(settings.threshold) || 8;
      if(h < thr) chipClass = 'chip-blue';
      else if(Math.abs(h - thr) < 1e-9) chipClass = 'chip-green';
      else chipClass = 'chip-orange';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cell-date"><strong>${dd}.${mm}</strong></td>
      <td class="cell-hours"><span class="chip ${chipClass}">${Math.round(h)}h</span></td>
      <td class="cell-activity">${acts}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Ja izmanto manu drukas moduli ar <input type="month" id="monthInput"> un <button id="printBtn">
function init(){
  const mi = document.getElementById('monthInput');
  if(mi){
    const today = new Date();
    const monthStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}`;
    mi.value = monthStr;
    render(monthStr);
    mi.addEventListener('change', ()=> render(mi.value));
  }else{
    // Ja nav input, vismaz uzzīmē aktuālo mēnesi
    const today = new Date();
    render(`${today.getFullYear()}-${pad2(today.getMonth()+1)}`);
  }
  const pb = document.getElementById('printBtn');
  if(pb) pb.addEventListener('click', ()=> window.print());
}

init(); // <- BEZ ŠĪ nekas nesāksies

})(); // IIFE — pareizi aizvērts ar () aiz } un ;