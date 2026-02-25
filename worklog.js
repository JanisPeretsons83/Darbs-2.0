(function(){
'use strict';

// ===== Keys =====
const lsKey = 'worklog.entries.v2';
const settingsKey = 'worklog.settings.v2';

// ===== Format/parse =====
const fmtNumber = (n, decimals = 2) => (Number(n)||0).toLocaleString('lv-LV',{minimumFractionDigits:decimals, maximumFractionDigits:decimals});
const fmtMoney = (n) => (Number(n)||0).toLocaleString('lv-LV',{style:'currency', currency:'EUR'});
const parseNum = (s) => { if(s==null) return 0; const v=parseFloat(String(s).replace(',','.').trim()); return isNaN(v)?0:v; };

function localISO(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
const todayISO = ()=> localISO(new Date());
const parseISO = (iso)=>{ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };

function weekBounds(date){
  const d=new Date(date);
  const day=(d.getDay()+6)%7; // Mon=0
  const start=new Date(d); start.setHours(0,0,0,0); start.setDate(d.getDate()-day);
  const end=new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  return [start,end];
}
function monthBounds(date){
  const d=new Date(date);
  const start=new Date(d.getFullYear(), d.getMonth(), 1,0,0,0,0);
  const end=new Date(d.getFullYear(), d.getMonth()+1, 0,23,59,59,999);
  return [start,end];
}
function formatRange(a,b){
  const opts={day:'2-digit', month:'short'};
  return `${a.toLocaleDateString('lv-LV', opts)} – ${b.toLocaleDateString('lv-LV', opts)}`;
}
function monthTitle(d){
  return d.toLocaleDateString('lv-LV',{month:'long', year:'numeric'});
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

// ===== Latvia holidays (public holidays) =====
function easterSunday(year){
  // Meeus/Jones/Butcher Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month-1, day);
}
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

function lvHolidaySet(year){
  const set = new Set();
  const push = (dt)=> set.add(localISO(dt));
  push(new Date(year,0,1)); // Jan 1
  const eas = easterSunday(year);
  push(addDays(eas,-2)); // Good Friday
  push(eas); // Easter Sunday
  push(addDays(eas,1)); // Easter Monday
  push(new Date(year,4,1)); // May 1
  push(new Date(year,4,4)); // May 4
  push(new Date(year,5,23)); // Jun 23
  push(new Date(year,5,24)); // Jun 24
  push(new Date(year,10,18)); // Nov 18
  push(new Date(year,11,24)); // Dec 24
  push(new Date(year,11,25)); // Dec 25
  push(new Date(year,11,26)); // Dec 26
  push(new Date(year,11,31)); // Dec 31
  return set;
}
function isWeekend(iso){
  const d=parseISO(iso);
  const dow=d.getDay(); // Sun=0
  return dow===0 || dow===6;
}
function isHoliday(iso){
  const y=parseISO(iso).getFullYear();
  return lvHolidaySet(y).has(iso);
}
function isWorkday(iso){
  // Workday = Mon-Fri and not holiday
  const d=parseISO(iso);
  const dow=(d.getDay()+6)%7; // Mon=0
  const weekday = dow<=4;
  return weekday && !isHoliday(iso);
}

// ===== Storage =====
function loadEntries(){ try{ return JSON.parse(localStorage.getItem(lsKey)) || []; }catch{ return []; } }
function saveEntries(arr){ localStorage.setItem(lsKey, JSON.stringify(arr)); }

function loadSettings(){
  const def = { rate:0.00, rateOver: null, rateWeekend: null, threshold: 8 };
  try{
    const s = JSON.parse(localStorage.getItem(settingsKey)) || def;
    if(s.rateOver==null) s.rateOver = s.rate;
    return s;
  }catch{ return def; }
}
function saveSettings(s){ localStorage.setItem(settingsKey, JSON.stringify(s)); }

function addEntry(obj){ const list=loadEntries(); list.push(obj); saveEntries(list); }
function updateEntry(id, patch){ const list=loadEntries().map(e=> e.id===id ? ({...e,...patch}) : e); saveEntries(list); }
function deleteEntry(id){ const list=loadEntries().filter(e=> e.id!==id); saveEntries(list); }

// ===== Day classification and money calc =====
function splitHours(hours, thr){
  const over = Math.max(0, hours - thr);
  const normal = Math.max(0, hours - over);
  return {normal, over};
}

function dayTotals(entries, iso, settings){
  const rows = entries.filter(e=>e.date===iso);
  const hDay = rows.reduce((s,r)=> s + (Number(r.hours)||0), 0);
  const thr = rows[0]?.threshold ?? settings.threshold ?? 8;

  const weekend = isWeekend(iso);
  const holiday = isHoliday(iso);
  const workday = isWorkday(iso);

  // Rules:
  // - Weekend or holiday: all hours overtime
  // - Workday: up to threshold = normal, rest overtime
  let normal=0, over=0;
  if((weekend || holiday) && hDay>0){
    normal = 0;
    over = hDay;
  } else if(workday){
    const sp = splitHours(hDay, thr);
    normal = sp.normal;
    over = sp.over;
  } else {
    // non-workday but not holiday/weekend? (rare) treat as overtime when >0
    normal = 0;
    over = hDay;
  }

  // Money: allocate proportional by row hours, using snapshot rates
  let amount=0;
  rows.forEach(r=>{
    const share = hDay>0 ? (r.hours / hDay) : 0;
    const nPart = normal * share;
    const oPart = over * share;
    const rate = Number(r.rate ?? settings.rate ?? 0);
    const rateOver = Number(r.rateOver ?? settings.rateOver ?? rate);
    const rateWeekend = Number(r.rateWeekend ?? settings.rateWeekend ?? rateOver);

    if(weekend || holiday){
      amount += oPart * rateWeekend; // all overtime
    } else if(workday){
      amount += nPart * rate + oPart * rateOver;
    } else {
      amount += oPart * rateWeekend;
    }
  });

  return { rows, hDay, normal, over, thr, weekend, holiday, workday, amount };
}

function sumPeriod(entries, startISO, endISO, settings){
  // group by day
  const byDay = {};
  entries.filter(e=> e.date>=startISO && e.date<=endISO).forEach(e=>{
    byDay[e.date] = byDay[e.date] || [];
    byDay[e.date].push(e);
  });

  let total=0, normal=0, over=0, amount=0;
  Object.keys(byDay).forEach(iso=>{
    const t = dayTotals(entries, iso, settings);
    total += t.hDay;
    normal += t.normal;
    over += t.over;
    amount += t.amount;
  });
  return { total, normal, over, amount };
}

// ===== UI =====
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tabpanel');

tabs.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.remove('active'));
    panels.forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab+'Tab').classList.add('active');
    if(btn.dataset.tab==='week') renderWeek();
    if(btn.dataset.tab==='month') renderMonth();
    if(btn.dataset.tab==='settings') renderSettings();
  });
});

// Quick form
const dateInput = document.getElementById('dateInput');
const hoursInput = document.getElementById('hoursInput');
const activityInput = document.getElementById('activityInput');
const quickForm = document.getElementById('quickForm');
const add8hBtn = document.getElementById('add8h');
const saveToast = document.getElementById('saveToast');

function showToast(msg){
  saveToast.textContent = msg;
  saveToast.hidden = false;
  setTimeout(()=> saveToast.hidden = true, 1400);
}

function initToday(){ dateInput.value = todayISO(); }

quickForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const settings = loadSettings();
  const date = dateInput.value || todayISO();
  const hours = parseNum(hoursInput.value);
  const activity = (activityInput.value||'').trim();
  if(hours<=0){ showToast('Ievadi derīgas stundas'); return; }

  const weekendOrHoliday = isWeekend(date) || isHoliday(date);

  const entry = {
    id: 'e_'+Date.now()+'_'+Math.random().toString(36).slice(2),
    date,
    hours,
    activity,
    rate: Number(settings.rate)||0,
    rateOver: Number(settings.rateOver ?? settings.rate)||0,
    // Weekend/Holiday rate: if settings.rateWeekend empty -> use overtime
    rateWeekend: weekendOrHoliday ? Number(settings.rateWeekend ?? settings.rateOver ?? settings.rate)||0 : Number(settings.rateWeekend ?? settings.rateOver ?? settings.rate)||0,
    threshold: Number(settings.threshold)||8
  };
  addEntry(entry);
  hoursInput.value='';

  const [mon] = weekBounds(parseISO(date));
  currentWeekAnchor = mon;
  renderWeek();
  renderMonth();
  showToast('Pievienots');
});

add8hBtn.addEventListener('click', ()=>{
  const settings = loadSettings();
  const date = todayISO();
  const weekendOrHoliday = isWeekend(date) || isHoliday(date);
  addEntry({
    id:'e_'+Date.now()+'_'+Math.random().toString(36).slice(2),
    date,
    hours:8,
    activity:'',
    rate:Number(settings.rate)||0,
    rateOver:Number(settings.rateOver ?? settings.rate)||0,
    rateWeekend: Number(settings.rateWeekend ?? settings.rateOver ?? settings.rate)||0,
    threshold:Number(settings.threshold)||8
  });
  const [mon] = weekBounds(new Date());
  currentWeekAnchor = mon;
  renderWeek();
  renderMonth();
  showToast('8h pievienotas šodienai');
});

// Week view
let currentWeekAnchor = new Date();
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const weekRangeEl = document.getElementById('weekRange');
const wHoursEl = document.getElementById('wHours');
const wNormalEl = document.getElementById('wNormal');
const wOverEl = document.getElementById('wOver');
const wAmountEl = document.getElementById('wAmount');
const weekDaysEl = document.getElementById('weekDays');

prevWeekBtn.addEventListener('click', ()=>{
  const [mon] = weekBounds(new Date(currentWeekAnchor));
  mon.setDate(mon.getDate()-7);
  currentWeekAnchor = mon;
  renderWeek();
});
nextWeekBtn.addEventListener('click', ()=>{
  const [mon] = weekBounds(new Date(currentWeekAnchor));
  mon.setDate(mon.getDate()+7);
  currentWeekAnchor = mon;
  renderWeek();
});

function renderWeek(){
  const entries = loadEntries();
  const settings = loadSettings();
  const [ws, we] = weekBounds(currentWeekAnchor);
  const startISO = localISO(ws);
  const endISO = localISO(we);
  weekRangeEl.textContent = formatRange(ws, we);

  const totals = sumPeriod(entries, startISO, endISO, settings);
  wHoursEl.textContent = fmtNumber(totals.total, 2);
  wNormalEl.textContent = fmtNumber(totals.normal, 2);
  wOverEl.textContent = fmtNumber(totals.over, 2);
  wAmountEl.textContent = fmtMoney(totals.amount);

  weekDaysEl.innerHTML='';
  for(let i=0;i<7;i++){
    const d=new Date(ws);
    d.setDate(ws.getDate()+i);
    const iso = localISO(d);
    const t = dayTotals(entries, iso, settings);

    // Background color rules:
    // Workday: <8 blue, =8 green, >8 orange
    // Weekend/holiday: >0 orange, 0 gray
    // Any 0h gray
    let bg='bg-gray';
    if(t.hDay===0){ bg='bg-gray'; }
    else if(t.weekend || t.holiday){ bg='bg-orange'; }
    else if(t.workday){
      if(t.hDay<8) bg='bg-blue';
      else if(Math.abs(t.hDay-8)<1e-9) bg='bg-green';
      else bg='bg-orange';
    } else {
      bg='bg-orange';
    }

    const card=document.createElement('div');
    card.className = `day-card ${bg}`;

    const dateLabel = d.toLocaleDateString('lv-LV',{weekday:'short', day:'2-digit', month:'short'});
    const holidayClass = t.holiday ? 'holiday' : '';

    card.innerHTML = `
      <div class="day-head">
        <div class="day-date ${holidayClass}">${dateLabel}</div>
        <div class="badge">${fmtNumber(t.hDay,2)} h</div>
      </div>
      <div class="small">Obligātās: ${fmtNumber(t.normal,2)} h · Virsstundas: ${fmtNumber(t.over,2)} h</div>
      <div class="small">Bruto: ${fmtMoney(t.amount)}</div>
    `;

    // Existing rows
    if(t.rows.length){
      t.rows.forEach(r=>{
        const row=document.createElement('div');
        row.className='entry';

        const weekendOrHoliday = t.weekend || t.holiday;
        const rateLine = weekendOrHoliday
          ? `Likme (brīvd./svētki): €${fmtNumber(r.rateWeekend ?? (settings.rateWeekend ?? settings.rateOver ?? r.rateOver ?? r.rate),2)}`
          : `Likme: €${fmtNumber(r.rate,2)} · O/T: €${fmtNumber(r.rateOver ?? r.rate,2)}`;

        row.innerHTML = `
          <div class="entry-line">
            <div><strong>${fmtNumber(r.hours,2)} h</strong>${r.activity ? ` · <span class="note">${escapeHtml(r.activity)}</span>` : ''}</div>
            <div class="row-actions">
              <button class="btn-small" data-act="edit">Rediģēt</button>
              <button class="btn-small" data-act="rate">Likme</button>
              <button class="btn-small" data-act="del">Dzēst</button>
            </div>
          </div>
          <div class="small">${rateLine}</div>
        `;

        row.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(confirm('Dzēst ierakstu?')){ deleteEntry(r.id); renderWeek(); renderMonth(); }
        });

        row.querySelector('[data-act="edit"]').addEventListener('click', ()=>{
          const newH = prompt('Jaunas stundas', String(r.hours).replace('.',','));
          if(newH==null) return;
          const hh = parseNum(newH);
          if(hh<=0) return alert('Nederīgs skaitlis');
          const newAct = prompt('Aktivitāte (pēc izvēles)', r.activity || '');
          updateEntry(r.id, { hours: hh, activity: (newAct ?? '').trim() });
          renderWeek(); renderMonth();
        });

        // Rate edit: for weekends/holidays allow change; for weekdays allow change overtime and normal separately
        row.querySelector('[data-act="rate"]').addEventListener('click', ()=>{
          const s = loadSettings();
          const isWH = isWeekend(r.date) || isHoliday(r.date);
          if(isWH){
            const current = (r.rateWeekend ?? s.rateWeekend ?? s.rateOver ?? r.rateOver ?? r.rate);
            const newR = prompt('Brīvdienu/svētku likme (€ / h)', String(current).replace('.',','));
            if(newR==null) return;
            const rr = parseNum(newR);
            if(rr<=0) return alert('Nederīgs skaitlis');
            updateEntry(r.id, { rateWeekend: rr });
          } else {
            const newRate = prompt('Parastā likme (€ / h)', String(r.rate).replace('.',','));
            if(newRate!=null){
              const rr = parseNum(newRate);
              if(rr>0) updateEntry(r.id, { rate: rr });
            }
            const curOT = (r.rateOver ?? r.rate);
            const newOT = prompt('Virsstundu likme (€ / h)', String(curOT).replace('.',','));
            if(newOT!=null){
              const oo = parseNum(newOT);
              if(oo>0) updateEntry(r.id, { rateOver: oo });
            }
          }
          renderWeek(); renderMonth();
        });

        card.appendChild(row);
      });
    } else {
      const empty=document.createElement('div');
      empty.className='entry';
      empty.innerHTML = `<div class="small">Nav ierakstu šai dienai.</div>`;
      card.appendChild(empty);
    }

    // Quick add
    const quick=document.createElement('div');
    quick.className='entry';
    quick.innerHTML = `
      <div class="entry-line"><div class="small">Pievienot ierakstu šai dienai</div></div>
      <div class="entry-line">
        <input type="text" placeholder="stundas" style="flex:1" />
        <input type="text" placeholder="aktivitāte" style="flex:2" />
        <button class="btn-small primary">Pievienot</button>
      </div>
    `;
    const [hEl, aEl, btn] = quick.querySelectorAll('input,button');
    btn.addEventListener('click', ()=>{
      const hh = parseNum(hEl.value);
      if(hh<=0) return alert('Ievadi derīgas stundas');
      const s = loadSettings();
      const isWH = isWeekend(iso) || isHoliday(iso);
      addEntry({
        id:'e_'+Date.now()+'_'+Math.random().toString(36).slice(2),
        date: iso,
        hours: hh,
        activity: (aEl.value||'').trim(),
        rate: Number(s.rate)||0,
        rateOver: Number(s.rateOver ?? s.rate)||0,
        rateWeekend: Number(s.rateWeekend ?? s.rateOver ?? s.rate)||0,
        threshold: Number(s.threshold)||8
      });
      renderWeek(); renderMonth();
      showToast('Pievienots');
    });
    card.appendChild(quick);

    weekDaysEl.appendChild(card);
  }
}

// Month view
let currentMonthAnchor = new Date();
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const monthTitleEl = document.getElementById('monthTitle');
const mWorkdaysEl = document.getElementById('mWorkdays');
const mRequiredEl = document.getElementById('mRequired');
const mRemainingDaysEl = document.getElementById('mRemainingDays');
const mRemainingHoursEl = document.getElementById('mRemainingHours');
const mNormalHoursEl = document.getElementById('mNormalHours');
const mOverHoursEl = document.getElementById('mOverHours');
const mTotalHoursEl = document.getElementById('mTotalHours');
const mAmountEl = document.getElementById('mAmount');
const monthListEl = document.getElementById('monthList');

prevMonthBtn.addEventListener('click', ()=>{
  currentMonthAnchor = new Date(currentMonthAnchor.getFullYear(), currentMonthAnchor.getMonth()-1, 1);
  renderMonth();
});
nextMonthBtn.addEventListener('click', ()=>{
  currentMonthAnchor = new Date(currentMonthAnchor.getFullYear(), currentMonthAnchor.getMonth()+1, 1);
  renderMonth();
});

function countWorkdaysInMonth(year, monthIndex){
  // monthIndex 0-11
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex+1, 0);
  let count=0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const iso = localISO(d);
    if(isWorkday(iso)) count++;
  }
  return count;
}

function remainingWorkdaysFromToday(year, monthIndex){
  const now = new Date();
  if(now.getFullYear()!==year || now.getMonth()!==monthIndex) return 0;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(year, monthIndex+1, 0);
  let count=0;
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const iso=localISO(d);
    if(isWorkday(iso)) count++;
  }
  return count;
}

function renderMonth(){
  const entries = loadEntries();
  const settings = loadSettings();
  const [ms, me] = monthBounds(currentMonthAnchor);
  monthTitleEl.textContent = monthTitle(ms);

  const startISO = localISO(ms);
  const endISO = localISO(me);

  // Month totals with our rules
  const totals = sumPeriod(entries, startISO, endISO, settings);

  // Workday counts and required hours
  const y = ms.getFullYear();
  const mi = ms.getMonth();
  const workdays = countWorkdaysInMonth(y, mi);
  const required = workdays * 8;
  const remainingDays = remainingWorkdaysFromToday(y, mi);
  const remainingHours = remainingDays * 8;

  mWorkdaysEl.textContent = workdays;
  mRequiredEl.textContent = required;
  mRemainingDaysEl.textContent = remainingDays;
  mRemainingHoursEl.textContent = remainingHours;

  mNormalHoursEl.textContent = fmtNumber(totals.normal, 2);
  mOverHoursEl.textContent = fmtNumber(totals.over, 2);

  // Total hours color: green if no overtime else orange
  mTotalHoursEl.textContent = fmtNumber(totals.total, 2);
  mTotalHoursEl.classList.remove('total-green','total-orange');
  mTotalHoursEl.classList.add(totals.over>0 ? 'total-orange' : 'total-green');

  mAmountEl.textContent = fmtMoney(totals.amount);

  // List by day (only days with entries + show holiday red dates)
  const byDay = {};
  entries.filter(e=> e.date>=startISO && e.date<=endISO).forEach(e=>{
    byDay[e.date] = byDay[e.date] || [];
    byDay[e.date].push(e);
  });

  const days = Object.keys(byDay).sort();
  monthListEl.innerHTML='';
  if(days.length===0){
    const empty=document.createElement('div');
    empty.className='month-row';
    empty.innerHTML = `<div class="small">Šim mēnesim nav ierakstu.</div><div class="right"></div>`;
    monthListEl.appendChild(empty);
    return;
  }

  days.forEach(iso=>{
    const d = parseISO(iso);
    const t = dayTotals(entries, iso, settings);
    const label = d.toLocaleDateString('lv-LV',{weekday:'short', day:'2-digit', month:'short'});
    const cls = isHoliday(iso) ? 'holiday' : '';
    const row = document.createElement('div');
    row.className='month-row';
    row.innerHTML = `
      <div>
        <strong class="${cls}">${label}</strong>
        <div class="small">${t.rows.length} ieraksti · ${fmtNumber(t.hDay,2)} h · Obligātās ${fmtNumber(t.normal,2)} h · Virsst. ${fmtNumber(t.over,2)} h</div>
      </div>
      <div class="right"><strong>${fmtMoney(t.amount)}</strong></div>
    `;
    monthListEl.appendChild(row);
  });
}

// Settings
const settingsForm = document.getElementById('settingsForm');
const rateDefaultEl = document.getElementById('rateDefault');
const rateOverEl = document.getElementById('rateOver');
const rateWeekendEl = document.getElementById('rateWeekend');
const overtimeThrEl = document.getElementById('overtimeThreshold');

function renderSettings(){
  const s = loadSettings();
  rateDefaultEl.value = String(s.rate).replace('.',',');
  rateOverEl.value = String(s.rateOver ?? s.rate).replace('.',',');
  rateWeekendEl.value = (s.rateWeekend==null ? '' : String(s.rateWeekend).replace('.',','));
  overtimeThrEl.value = String(s.threshold).replace('.',',');
}

settingsForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const rate = parseNum(rateDefaultEl.value);
  const rateOver = parseNum(rateOverEl.value);
  const thr = parseNum(overtimeThrEl.value);
  const rateWeekend = rateWeekendEl.value.trim()==='' ? null : parseNum(rateWeekendEl.value);
  if(rate<=0 || rateOver<=0 || thr<=0){ alert('Pārbaudi iestatījumu vērtības'); return; }
  if(rateWeekend!=null && rateWeekend<=0){ alert('Brīvdienu likmei jābūt pozitīvai'); return; }
  saveSettings({ rate, rateOver, rateWeekend, threshold: thr });
  showToast('Iestatījumi saglabāti');
  renderWeek();
  renderMonth();
});

// init
(function init(){
  // init settings
  const s = loadSettings();
  if(s.rateOver==null){ s.rateOver = s.rate; saveSettings(s); }

  initToday();
  const [mon] = weekBounds(new Date());
  currentWeekAnchor = mon;
  currentMonthAnchor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  renderSettings();
  renderWeek();
  renderMonth();
})();

})();
