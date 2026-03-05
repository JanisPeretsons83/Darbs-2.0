(function () {
  'use strict';

  /* ===== Palīgi ===== */
  const pad2 = n => String(n).padStart(2, '0');
  const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('lv-LV', { minimumFractionDigits: d, maximumFractionDigits: d });
  const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const localISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // korekts HTML escaper (bez dubultām &amp;)
  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /* ===== LV svētki / brīvdienas ===== */
  const easterSunday = (Y) => { const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1; return new Date(Y,month-1,day) };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const lvHolidaySet = (y) => { const s=new Set(), add=dt=>s.add(localISO(dt)); add(new Date(y,0,1)); const eas=easterSunday(y); add(addDays(eas,-2)); add(eas); add(addDays(eas,1)); add(new Date(y,4,1)); add(new Date(y,4,4)); add(new Date(y,5,23)); add(new Date(y,5,24)); add(new Date(y,10,18)); add(new Date(y,11,24)); add(new Date(y,11,25)); add(new Date(y,11,26)); add(new Date(y,11,31)); return s; };
  const isWeekend = iso => { const d = parseISO(iso); const g = d.getDay(); return g === 0 || g === 6; };
  const isHoliday = iso => lvHolidaySet(parseISO(iso).getFullYear()).has(iso);

  /* ===== Krāsa tikai badge ===== */
  function getBadgeClass(h, isHoli = false, isWknd = false, thr = 8) {
    if (isHoli || isWknd) return h > 0 ? 'orange' : 'gray';
    if (h == null) return 'gray';
    if (h > thr) return 'orange';
    if (Math.abs(h - thr) < 1e-9) return 'green';
    if (h > 0 && h < thr) return 'blue';
    return 'gray';
  }

  /* ===== Dati no DOM (.daylist .daycard) ===== */
  function readFromDom() {
    const cards = Array.from(document.querySelectorAll('.daylist .daycard'));
    if (!cards.length) return null;
    const items = [];
    for (const c of cards) {
      const dateText = (c.querySelector('.day-head')?.textContent || '').trim();

      let totalStr = c.querySelector('.chip')?.textContent || '';
      if (!totalStr) {
        const m = (c.querySelector('.day-meta')?.textContent || '').match(/([0-9]+(?:,[0-9]+)?)\s*h/);
        totalStr = m ? m[1] + 'h' : '';
      }
      const h = totalStr ? Number(totalStr.replace(/[^0-9,\.]/g, '').replace(',', '.')) || 0 : 0;

      let normal = h, over = 0;
      const metaTxt = (c.querySelector('.day-meta')?.textContent || '');
      const m1 = metaTxt.match(/Obligāt(?:ās|ie)\s+([0-9]+(?:,[0-9]+)?)\s*h/i);
      const m2 = metaTxt.match(/Virsst\.?\s*([0-9]+(?:,[0-9]+)?)\s*h/i);
      if (m1 && m2) { normal = Number(m1[1].replace(',', '.')) || 0; over = Number(m2[1].replace(',', '.')) || 0; }
      else { const thr = 8; normal = Math.min(h, thr); over = Math.max(0, h - thr); }

      const desc = (c.querySelector('.day-acts')?.textContent || '').trim();
      const wknd = c.classList.contains('weekend');
      const holi = c.classList.contains('holiday');

      items.push({ dateText, hours: h, normal, over, desc, isWeekend: wknd, isHoliday: holi });
    }
    return { kind: 'dom', items };
  }

  /* ===== Dati no localStorage ===== */
  function readFromLocalStorage(monthStr) {
    const entries = (() => { try { return JSON.parse(localStorage.getItem('worklog.entries.v2')) || []; } catch { return []; } })();
    const settings = (() => { const def = { threshold: 8 }; try { return Object.assign(def, JSON.parse(localStorage.getItem('worklog.settings.v2')) || {}); } catch { return def; } })();

    if (!/^\d{4}-\d{2}$/.test(monthStr || '')) return { kind: 'ls', items: [] };

    const [y, m] = monthStr.split('-').map(Number);
    const y0 = y, m0 = m - 1;
    const byDay = {};
    for (const e of entries) {
      const d = parseISO(e.date);
      if (d.getFullYear() === y0 && d.getMonth() === m0) (byDay[e.date] ||= []).push(e);
    }

    const items = [];
    const days = Object.keys(byDay).sort();
    for (const iso of days) {
      const rows = byDay[iso];
      const d = parseISO(iso);
      const weekday = d.toLocaleDateString('lv-LV', { weekday: 'short' });
      const dd = pad2(d.getDate());
      const monthName = d.toLocaleDateString('lv-LV', { month: 'long' });
      const dateText = `${weekday}, ${dd}. ${monthName}`;
      const thr = rows[0]?.threshold ?? settings.threshold ?? 8;
      const hours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
      const normal = Math.min(hours, thr), over = Math.max(0, hours - thr);
      const desc = rows.map(r => (r.activity || '').trim()).filter(Boolean).join('; ');
      items.push({ dateText, hours, normal, over, desc, isWeekend: isWeekend(iso), isHoliday: isHoliday(iso) });
    }
    return { kind: 'ls', items };
  }

  /* ===== Header LS režīmā ===== */
  function renderHeaderForLocalStorage(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const y0 = y, m0 = m - 1;
    const start = new Date(y0, m0, 1), end = new Date(y0, m0 + 1, 0);

    const holidaySet = lvHolidaySet(y0);
    const workdays = Array.from({ length: end.getDate() }, (_, i) => localISO(new Date(y0, m0, i + 1)))
      .filter(iso => { const d = parseISO(iso); const dow = (d.getDay() + 6) % 7; return dow <= 4 && !holidaySet.has(iso); }).length;
    const settings = (() => { const def = { threshold: 8 }; try { return Object.assign(def, JSON.parse(localStorage.getItem('worklog.settings.v2')) || {}); } catch { return def; } })();
    const required = workdays * (Number(settings.threshold) || 8);

    const entries = (() => { try { return JSON.parse(localStorage.getItem('worklog.entries.v2')) || []; } catch { return []; } })();
    let total = 0; for (const e of entries) { const d = parseISO(e.date); if (d.getFullYear() === y0 && d.getMonth() === m0) total += Number(e.hours) || 0; }

    const monthName = start.toLocaleDateString('lv-LV', { month: 'long' });
    const monthTitle = monthName.replace(/^./, ch => ch.toUpperCase());
    document.getElementById('headerTitle').textContent = `${y0}. gada ${monthTitle}`;
    document.getElementById('headerLine1').textContent = `${monthTitle}: ${workdays} darba dienas · ${required} obligātās stundas · Kopsummā ${fmt(total, 1)} h.`;
  }

  /* ===== Render ===== */
  function renderItems(items, { monthStr, source }) {
    const list = document.getElementById('rows');
    list.innerHTML = '';

    if (source === 'ls') renderHeaderForLocalStorage(monthStr);
    else {
      const h2 = document.getElementById('headerLine1');
      if (!h2.textContent.trim() || /—/.test(h2.textContent)) {
        const total = items.reduce((s, it) => s + (it.hours || 0), 0);
        h2.textContent = `Kopsummā ${fmt(total, 1)} h · Ieraksti: ${items.length}`;
      }
    }

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'entry';
      empty.innerHTML = '<div class="row-top one-line"><span class="meta">Šim mēnesim nav ierakstu.</span></div>';
      list.appendChild(empty);
      return;
    }

    for (const it of items) {
      const div = document.createElement('div');
      div.className = 'entry' + (it.isHoliday ? ' holiday' : '') + (!it.isHoliday && it.isWeekend ? ' weekend' : '');

      // — VIENA RINDA ar ellipsi aprakstam —
      const row = document.createElement('div');
      row.className = 'row-top one-line'; // <<< svarīgi: “one-line” atslēdz wrap

      const dateEl = document.createElement('span');
      dateEl.className = 'date';
      dateEl.textContent = it.dateText;

      const badgeEl = document.createElement('span');
      badgeEl.className = 'badge ' + getBadgeClass(it.hours, it.isHoliday, it.isWeekend, 8);
      badgeEl.textContent = `${fmt(it.hours, 2)} h`;

      const descEl = document.createElement('span');
      descEl.className = 'desc';
      descEl.textContent = it.desc || '';

      const overEl = document.createElement('span');
      overEl.className = 'meta';
      overEl.textContent = `Virsst. ${fmt(it.over, 2)} h`;

      row.appendChild(dateEl);
      row.appendChild(badgeEl);
      if (it.desc) row.appendChild(descEl);
      row.appendChild(overEl);

      div.appendChild(row);
      list.appendChild(div);
    }
  }

  /* ===== Init ===== */
  function init() {
    const mi = document.getElementById('monthInput');
    const monthStr = new URLSearchParams(location.search).get('month') || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
    if (mi) {
      mi.value = monthStr;
      mi.addEventListener('change', () => {
        const ls = readFromLocalStorage(mi.value);
        renderItems(ls.items, { monthStr: mi.value, source: 'ls' });
      });
    }

    const dom = readFromDom();
    if (dom) renderItems(dom.items, { monthStr, source: 'dom' });
    else { const ls = readFromLocalStorage(monthStr); renderItems(ls.items, { monthStr, source: 'ls' }); }

    document.getElementById('printBtn')?.addEventListener('click', () => window.print());
    document.getElementById('exitBtn')?.addEventListener('click', () => location.href = './index.html');
  }

  init();
})();
