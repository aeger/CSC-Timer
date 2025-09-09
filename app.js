/*
PROJECT: CSC Adherence Timer — build1 baseline
Version: v0.5-build1
Generated: 2025-09-08 21:59:53
*/

const VERSION = 'v0.5-build1';

function showToast(msg, ms=3500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  window.clearTimeout(showToast._h);
  showToast._h = setTimeout(()=> { t.style.display='none'; }, ms);
}

async function loadDemo() {
  const res = await fetch('demo-week-schedule.json', {cache: 'no-store'});
  const data = await res.json();
  const container = document.getElementById('schedule');
  container.innerHTML = '';
  for (const ev of data.events) {
    const el = document.createElement('div');
    el.className = 'event';
    const durMin = (new Date(ev.end) - new Date(ev.start))/60000;
    el.innerHTML = `<strong>${ev.title}</strong><br><small>${ev.start} → ${ev.end} (${durMin} min)</small>`;
    container.appendChild(el);
  }
  showToast('Demo week loaded');
}

function toICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CSC Adherence Timer//EN'
  ];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.id + '@csc-timer');
    lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'));
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    function fmt(d){ return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
    lines.push('DTSTART:' + fmt(s));
    lines.push('DTEND:' + fmt(e));
    lines.push('SUMMARY:' + ev.title.replace(/[,;]/g,' '));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function exportICS() {
  const res = await fetch('demo-week-schedule.json', {cache: 'no-store'});
  const data = await res.json();
  const ics = toICS(data.events);
  const blob = new Blob([ics], {type: 'text/calendar'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'csc-adherence-timer-' + VERSION + '.ics';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('iCal export downloaded');
}

document.getElementById('btn-load').addEventListener('click', loadDemo);
document.getElementById('btn-export-ics').addEventListener('click', exportICS);

// Register service worker if available and in secure context
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
