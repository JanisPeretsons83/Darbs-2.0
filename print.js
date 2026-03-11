
(function(){
  'use strict';
  const pad2 = n => String(n).padStart(2,'0');
  const fmt = (n, d = 2) => (Number(n)||0).toLocaleString('lv-LV',{minimumFractionDigits:d, maximumFractionDigits:d});
  const parseISO = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
  const localISO = d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  // LV svētku aprēķins (kā jūsu oriģinālā);
  const easterSunday = (Y)=>{const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(Y,month-1,day)};
  const addDays = (d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x};
  const lvHolidaySet = (y)=>{const s=new Set(),add=dt=>s.add(localISO(dt)); add(new Date(y,0,1)); const eas=easterSunday(y); add(addDays(eas,-2)); add(eas); add(addDays(eas,1)); add(new Date(y,4,1)); add(new Date(y,4,4)); add(new Date(y,5,23)); add(new Date(y,5,24)); add(new Date(y,10,18)); add(new Date(y,11,24)); add(new Date(y,11,25)); add(new Date(y,11,26)); add(new Date(y,11,31)); return s; };
  const isWeekend = iso=>{ const d=parseISO(iso); const g=d.getDay(); return g===0||g===6; };
  const isHoliday = iso=> lvHolidaySet(parseISO(iso).getFullYear()).has(iso);

  function getBadgeClass(h, isHoli=false, isWknd=false, thr=8){
    if (isHoli||isWknd) return h>0 ? 'orange' : 'gray';
    if (h==null) return 'gray';
    if (h>thr) return 'orange';
    if (Math.abs(h-thr) < 1e-9) return 'green';
    if (h>0 && h<thr) return 'blue';
    return 'gray';
  }

  // ===== Dati no localStorage (v2) =====
  function readFromLocalStorage(monthStr){
    const entries = (()=>{ try { return JSON.parse(localStorage.getItem('worklog.entries.v2'))||[] } catch { return [] } })();
    const settings = (()=>{ const def={threshold:8}; try { return Object.assign(def, JSON.parse(localStorage.getItem('worklog.settings.v2'))||{}) } catch { return def } })();
    if (!/^\d{4}-\d{2}$/.test(monthStr||'')) return {items:[], settings};
    const [y,m] = monthStr.split('-').map(Number); const y0=y, m0=m-1;
    const byDay = {};
    for (const e of entries){ const d=parseISO(e.date); if (d.getFullYear()===y0 && d.getMonth()===m0) (byDay[e.date] ||= []).push(e); }
    const items=[]; const days=Object.keys(byDay).sort();
    for (const iso of days){
      const rows = byDay[iso];
      const d = parseISO(iso);
      const weekday = d.toLocaleDateString('lv-LV',{weekday:'short'});
      const dd = pad2(d.getDate()); const monthName=d.toLocaleDateString('lv-LV',{month:'long'});
      const dateText = `${weekday}, ${dd}. ${monthName}`;
      const thr = rows[0]?.threshold ?? settings.threshold ?? 8;
      const hours = rows.reduce((s,r)=> s + (Number(r.hours)||0), 0);
      const over = Math.max(0, hours - thr);
      const acts = rows.map(r=> (r.activity||'').trim()).filter(Boolean);
      items.push({ iso, dateText, hours, over, acts, isWeekend:isWeekend(iso), isHoliday:isHoliday(iso) });
    }
    return {items, settings};
  }

  function renderHeader(monthStr){
    const [y,m] = monthStr.split('-').map(Number);
    const y0=y, m0=m-1; const start=new Date(y0,m0,1), end=new Date(y0,m0+1,0);
    const holidaySet = lvHolidaySet(y0);
    const workdays = Array.from({length:end.getDate()}, (_,i)=>{ const iso=localISO(new Date(y0,m0,i+1)); const d=parseISO(iso); const dow=(d.getDay()+6)%7; return (dow<=4 && !holidaySet.has(iso)) ? 1:0;}).reduce((a,b)=>a+b,0);
    const settings = (()=>{ const def={threshold:8}; try { return Object.assign(def, JSON.parse(localStorage.getItem('worklog.settings.v2'))||{}) } catch { return def } })();
    const required = workdays * (Number(settings.threshold)||8);
    const entries = (()=>{ try { return JSON.parse(localStorage.getItem('worklog.entries.v2'))||[] } catch { return [] } })();
    let total=0; for (const e of entries){ const d=parseISO(e.date); if (d.getFullYear()===y0 && d.getMonth()===m0) total += Number(e.hours)||0; }
    const monthName = start.toLocaleDateString('lv-LV',{month:'long'}); const monthTitle = monthName.replace(/^./, ch=>ch.toUpperCase());
    document.getElementById('headerTitle').textContent = `${y0}. gada ${monthTitle}`;
    document.getElementById('headerLine1').textContent = `${monthTitle}: ${workdays} darba dienas · ${required.toFixed(0)} obligātās stundas · Kopsummā ${total.toFixed(1)} h.`;
  }

  function render(items, monthStr){
    renderHeader(monthStr);
    const body = document.getElementById('tbody');
    body.innerHTML = '';
    if (!items.length){
      const row = document.createElement('div'); row.className='tr';
      row.innerHTML = '<div class="td col-date"></div><div class="td col-ko-ot"></div><div class="td col-entries"><span class="entry-line muted">Šim mēnesim nav ierakstu.</span></div>';
      body.appendChild(row); return;
    }
    for (const it of items){
      const row = document.createElement('div'); row.className='tr';

      // Datums + lentes
      const date = document.createElement('div'); date.className='td col-date';
      const dateBadge = document.createElement('span');
      dateBadge.className = 'badge-date'+(it.isHoliday?' holi':(!it.isHoliday&&it.isWeekend?' wknd':''));
      dateBadge.textContent = it.dateText; date.appendChild(dateBadge);

      // Kopā · O/t chips vienā kolonnā
      const ko = document.createElement('div'); ko.className='td col-ko-ot';
      const totalChip = document.createElement('span'); totalChip.className='chip ' + getBadgeClass(it.hours, it.isHoliday, it.isWeekend, 8);
      totalChip.textContent = `Kopā: ${fmt(it.hours,2)} h`;
      const overChip = document.createElement('span'); overChip.className='chip ' + (it.over>0? 'orange':'gray');
      overChip.textContent = `O/t: ${fmt(it.over,2)} h`;
      ko.appendChild(totalChip); ko.appendChild(overChip);

      // Ieraksti kā vairākas rindiņas (12px)
      const entries = document.createElement('div'); entries.className='td col-entries';
      const acts = (it.acts && it.acts.length) ? it.acts : [];
      if (acts.length){ for (const a of acts){ const line=document.createElement('div'); line.className='entry-line'; line.textContent=a; entries.appendChild(line); } }

      row.appendChild(date); row.appendChild(ko); row.appendChild(entries);
      body.appendChild(row);
    }
  }

  function init(){
    const mi = document.getElementById('monthInput');
    const monthStr = new URLSearchParams(location.search).get('month') || `${new Date().getFullYear()}-${pad2(new Date().getMonth()+1)}`;
    if (mi){ mi.value = monthStr; mi.addEventListener('change', ()=>{ const {items} = readFromLocalStorage(mi.value); render(items, mi.value); }); }
    const {items} = readFromLocalStorage(monthStr);
    render(items, monthStr);
    document.getElementById('printBtn')?.addEventListener('click', ()=> window.print());
    document.getElementById('exitBtn')?.addEventListener('click', ()=> location.href = './index.html');
  }

  init();
})();
