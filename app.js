const VERSION='v0.5.2';
/* CSC Adherence Timer app.js (v0.5.2) */
(() => {
  'use strict';
  if (window.__CSC_BOOTED__) return;
  window.__CSC_BOOTED__ = true;

  const $ = id => document.getElementById(id);
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const BTN_IDS = ['onQueue','available','c2c','break','meal','meeting','busy','shiftEnd'];
  const LABELS = { onQueue:'On Queue', available:'Available', c2c:'C2C', break:'Break', meal:'Meal', meeting:'Meeting', busy:'Busy', shiftEnd:'Shift End' };
  const btnLabel = id => LABELS[id] || ($(id)?.textContent.trim() || id);

  // Default order of status buttons used when no custom order is stored.
  const DEFAULT_ORDER = ['onQueue','available','c2c','break','meal','meeting','busy','shiftEnd'];

  const state = {
    schedule: {},
    settings: {
      leadTime: 5, firstWarn: 2, secondWarn: 5,
      enableSounds: true, enableClicks: true, clickVolume: 0.5,
      timeFormat: '12',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      sounds: { lead: {}, at: {}, over1: {}, over2: {} },
      clickPattern: 'click.mp3',
      customSounds: {},
      escalation: false
      ,enableNotifications: false,
      // Current UI theme: 'dark' or 'light'.  Defaults to dark.
      theme: 'dark',
      // Order of status buttons for keyboard shortcuts and drag reorder
      statusOrder: ['onQueue','available','c2c','break','meal','meeting','busy','shiftEnd']
      ,volume: 50
    },
    selectedDay: null,
    // Index of the ad‑hoc schedule entry currently being edited.  When
    // editing, the inline editor slides open above the schedule list.  Null
    // means no ad‑hoc entry is being edited.
    inlineEditing: null,
    // Context for unified editing.  When editing an event, this holds
    // { day: string | null, index: number } to identify the entry.
    editContext: null,
    ackStatus: null,
    lastStage: null,
    lastEventKey: null,
    // Holds the current alert (lead/at/over) Howl so it can be stopped when the user acknowledges the expected status.
    alertSound: null,
    deferredPrompt: null,
    lastShowLead: false
  };

  const prof = () => ($('profileSwitcher')?.value || 'default');
  const isTime = s => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
  function todayShort(){ return DAYS[new Date().getDay()]; }
  function getWeek(p){ try { return JSON.parse(localStorage.getItem(`schedule_week_${p}`)) || {}; } catch { return {}; } }
  function setWeek(p, data){ try { localStorage.setItem(`schedule_week_${p}`, JSON.stringify(data)); } catch {} }
  function loadAll() {
    const current = localStorage.getItem('currentProfile') || 'default';
    $('profileSwitcher') && ($('profileSwitcher').value = current);
    try { state.schedule[current] = JSON.parse(localStorage.getItem(`schedule_${current}`)) || []; }
    catch { state.schedule[current] = []; }
    try { Object.assign(state.settings, JSON.parse(localStorage.getItem('settings') || '{}')); } catch {}
    try { const cs = JSON.parse(localStorage.getItem('customSounds') || '{}'); if (cs && typeof cs === 'object') state.settings.customSounds = cs; } catch {}
    // Ensure theme and status order defaults exist
    if (!state.settings.theme) state.settings.theme = 'dark';
    if (!Array.isArray(state.settings.statusOrder) || state.settings.statusOrder.length === 0) {
      state.settings.statusOrder = DEFAULT_ORDER.slice();
    }
    if (typeof state.settings.volume !== 'number') state.settings.volume = 50;
    // Synchronize profile options based on schedules stored in localStorage
    syncProfileOptions();
  }
  function saveAll() {
    const p = prof();
    try { localStorage.setItem(`schedule_${p}`, JSON.stringify(state.schedule[p] || [])); } catch {}
    try { localStorage.setItem('settings', JSON.stringify(state.settings)); } catch {}
    try { localStorage.setItem('currentProfile', p); } catch {}
    try { localStorage.setItem('customSounds', JSON.stringify(state.settings.customSounds||{})); } catch {}
  }

  /**
   * Build the list of available profiles from localStorage and update the
   * profileSwitcher <select>.  Ensures that all profiles with schedules
   * (schedule_ keys) appear in the dropdown, and that the current value
   * persists when possible.
   */
  function syncProfileOptions() {
    const sel = $('profileSwitcher');
    if (!sel) return;
    const names = new Set(['default']);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (key.startsWith('schedule_') && !key.startsWith('schedule_week_')) {
          const name = key.substring('schedule_'.length);
          names.add(name);
        }
      }
    } catch {}
    const current = sel.value || localStorage.getItem('currentProfile') || 'default';
    sel.innerHTML = '';
    [...names].sort().forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (names.has(current)) {
      sel.value = current;
    } else {
      sel.value = [...names][0];
    }
  }

  /**
   * Apply the current theme by toggling body classes.  When theme is 'light',
   * the <body> element receives class "light" and drops "dark".  Dark mode
   * does the reverse.  This function should be called whenever theme changes.
   */
  function applyTheme() {
    const body = document.body;
    if (!body) return;
    const t = state.settings.theme || 'dark';
    body.classList.toggle('light', t === 'light');
    body.classList.toggle('dark', t !== 'light');
  }

  /**
   * Reorder the status buttons in the DOM to match the user-defined order.  The
   * order is stored in state.settings.statusOrder.  This does not modify
   * BTN_IDS but influences keyboard shortcuts and drag-and-drop persistence.
   */
  function reorderStatusButtons() {
    const order = Array.isArray(state.settings.statusOrder) ? state.settings.statusOrder.slice() : DEFAULT_ORDER.slice();
    const group = document.getElementById('queue-group');
    if (!group) return;
    order.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) group.appendChild(btn);
    });
  }

  /**
   * Show the onboarding popup if it hasn’t been shown before.  Uses
   * localStorage flag 'onboardingShown'.  The popup explains basic
   * functionality to the user.
   */
  function showOnboarding() {
    const pop = $('onboardingPopup');
    if (!pop) return;
    // Check local storage if onboarding has been shown
    let seen = false;
    try { seen = localStorage.getItem('onboardingShown') === 'true'; } catch {}
    if (!seen) pop.hidden = false;
  }
  function hideOnboarding() {
    const pop = $('onboardingPopup');
    if (!pop) return;
    pop.hidden = true;
    try { localStorage.setItem('onboardingShown','true'); } catch {}
  }

  function parseHM(hm){ const [H,M]=hm.split(':').map(Number); const d=new Date(); d.setHours(H,M,0,0); return d; }
  function displayTime(hm){
    const [H,M] = hm.split(':').map(Number);
    if (state.settings.timeFormat === '24') return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;
    const d = new Date(2000,1,1,H,M,0);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Convert a time string into a normalised HH:MM 24‑hour format.  This helper
   * accepts either 24‑hour times like "7:30" or "07:30" and 12‑hour times
   * like "7:30 PM".  It returns a two‑digit hour and minute string (e.g.
   * "07:30" or "19:30").  If the input cannot be parsed, it returns the
   * input unchanged.
   *
   * @param {string} t The raw time string.
   * @returns {string} A normalised time string in 24‑hour HH:MM format.
   */
  function normalizeTimeStr(t) {
    if (!t || typeof t !== 'string') return t;
    const s = t.trim();
    // If AM/PM present, use Date parsing.
    if (/\b(am|pm)\b/i.test(s)) {
      // Use a fixed date so that toLocaleTimeString works reliably
      const d = new Date('2000-01-01 ' + s);
      if (!isNaN(d.getTime())) {
        const h = d.getHours();
        const m = d.getMinutes();
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
    }
    // Otherwise assume 24‑hour input with optional leading zeros
    const parts = s.split(/[:\s]/).filter(Boolean);
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        const hh = ((h % 24) + 24) % 24;
        const mm = ((m % 60) + 60) % 60;
        return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      }
    }
    return t;
  }

  /**
   * Display a brief toast notification at the bottom of the page.  The
   * message will automatically disappear after a few seconds.  The
   * optional type may be 'success', 'error' or 'info', which affects
   * the background colour.  Defaults to 'info'.
   *
   * @param {string} msg The message to display.
   * @param {string} [type] The toast type ('info','success','error').
   */
  function showToast(msg, type = 'info'){
    const cont = $('toastContainer');
    if(!cont) return;
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    cont.appendChild(div);
    // Remove after 4 seconds
    setTimeout(()=>{ div.remove(); }, 4000);
  }

  /**
   * Open the unified edit modal for either a schedule (ad‑hoc) entry or a
   * weekly planner entry.  If `day` is null, the entry belongs to the
   * current ad‑hoc schedule; otherwise it belongs to the weekly planner
   * for that day.  If `idx` is null, the modal will create a new
   * entry on save; otherwise it will update the existing entry at that
   * index.
   * @param {string|null} day The day of week (Sun..Sat) or null for ad‑hoc.
   * @param {number|null} idx The index of the event within the list.
   * @param {object|null} ev The event object being edited, if any.
   */
  function openEditModal(day, idx, ev){
    state.editContext = { day: day || null, index: idx };
    // Set the day label; for ad‑hoc schedules show the selected day or today's day
    const lbl = $('editDayLabel');
    if (lbl) lbl.textContent = day || (state.selectedDay || todayShort());
    // Populate type and time fields
    const typeSel = $('editModalType');
    const timeInput = $('editModalTime');
    if (typeSel) typeSel.value = ev && ev.type ? ev.type : 'On Queue';
    if (timeInput) timeInput.value = ev && ev.time ? ev.time : '';
    // Show the modal
    const modal = $('editModal');
    if (modal) modal.hidden = false;
  }

  function typeClass(tp){ return (tp||'').toLowerCase().replace(/\s+/g,''); }
  function activeList(){
    const p = prof();
    if (state.selectedDay){
      const w = getWeek(p);
      if (Array.isArray(w[state.selectedDay])) return w[state.selectedDay];
    }
    return state.schedule[p] || [];
  }
  function nextEvent(){
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    const now = new Date();
    for (const ev of list) {
      let t = parseHM(ev.time);
      if (t > now) return ev;
    }
    // No future events today, check tomorrow
    for (const ev of list) {
      let t = new Date(parseHM(ev.time).getTime() + 24 * 60 * 60 * 1000);
      if (t > now) return ev;
    }
    return null;
  }
  function currentEvent(){
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    const now = new Date(); let curr = null;
    for (const ev of list){ const t=parseHM(ev.time); if (t <= now) curr = ev; else break; }
    return curr || null;
  }

function syncProfileLabel() {
  const lab = $('currentProfileLabel');
  // Display only the profile name without duplicating the word "Current"
  if (lab) lab.textContent = prof();
}

  function renderSchedule() {
    const wrap = $('scheduleCards'); if (!wrap) return;
    wrap.innerHTML = '';
    const now = new Date();
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    list.forEach((ev,i)=>{
      let t = parseHM(ev.time);
      if (t < now && t.getHours() < 6) {
        t = new Date(t.getTime() + 24 * 60 * 60 * 1000);
      }
      const diffMin = (t - now) / 60000;
      const cls = diffMin < -state.settings.secondWarn ? 'overdue-card'
                : diffMin <= state.settings.leadTime ? 'nearing-card' : 'upcoming-card';
      const card = document.createElement('div');
      card.className = `schedule-card ${cls}`;
      card.innerHTML = `
        <span class="card-time">${displayTime(ev.time)}</span>
        <span class="card-type">${ev.type}</span>
        <div class="card-actions">
          <button type="button" class="card-edit" data-index="${i}" title="Edit event"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="card-delete" data-index="${i}" title="Delete event"><i class="fa-solid fa-trash"></i></button>
        </div>`;
      wrap.appendChild(card);
    });
    // Attach handlers for editing and deleting events.  For ad‑hoc schedule
    // editing we reuse the sliding inline editor instead of the modal.  When
    // a card is edited, display the inline editor populated with the
    // selected event’s type and time.  Weekly planner editing continues to
    // use the modal via openEditModal.
    wrap.querySelectorAll('.card-edit').forEach(b=>b.addEventListener('click', ()=>{
      const idx = +b.dataset.index;
      const ev = list[idx];
      if (!ev) return;
      state.inlineEditing = idx;
      // Populate inline editor fields
      const typeSel = $('editType');
      const timeInput = $('editTime');
      if (typeSel) typeSel.value = ev.type;
      if (timeInput) timeInput.value = ev.time;
      // Show inline editor and hide modal if open
      const inline = $('inlineEditor');
      if (inline) inline.hidden = false;
      const modal = $('editModal');
      if (modal) modal.hidden = true;
    }));
    wrap.querySelectorAll('.card-delete').forEach(b=>b.addEventListener('click', ()=>deleteEvent(+b.dataset.index)));
    // Show or hide the inline editor based on whether a schedule entry is being edited
    const inlineEl = $('inlineEditor');
    if (inlineEl) {
      if (state.inlineEditing == null) {
        inlineEl.hidden = true;
      } else {
        inlineEl.hidden = false;
        const ev = list[state.inlineEditing];
        if (ev) {
          const typeSel = $('editType');
          const timeInput = $('editTime');
          if (typeSel) typeSel.value = ev.type;
          if (timeInput) timeInput.value = ev.time;
        }
      }
    }
    // Recompute timeline markers after rendering cards
    renderTimelineMarkers();
  }

  function fmt(h,m,s){
    if (state.settings.timeFormat==='12') return new Date(2000,1,1,h,m,s).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function updateClock(){
    const el = $('currentTime'); if (!el) return;
    const n = new Date();
    el.textContent = fmt(n.getHours(), n.getMinutes(), n.getSeconds());
    const dEl = $('currentDate');
    if (dEl) dEl.textContent = new Date().toLocaleDateString([], { weekday:'long', year:'numeric', month:'short', day:'numeric' });
  }

  function soundSrc(name){
    // Resolve the sound file path.  If a custom base64 or data URI is stored
    // in settings.customSounds, return it.  Otherwise build a relative
    // URL under the 'sounds/' directory.  Avoid leading slashes so the
    // path works regardless of the hosting subdirectory (e.g. Test1/).
    if (state.settings.customSounds && state.settings.customSounds[name]) return state.settings.customSounds[name];
    return 'sounds/' + name.replace(/^\//,'');
  }
  function playStage(stage, eventType){
    if (!state.settings.enableSounds) return;
    if (state.settings.escalation && !/^(break|meal)$/i.test(eventType||'')) return;
    const pick = k => (state.settings.sounds?.[k]?.file) || 'a.mp3';
    const file = ({lead:pick('lead'), at:pick('at'), over1:pick('over1'), over2:pick('over2')})[stage];
    if (!file || !window.Howl) return;
    try {
      // Stop any existing alert before starting a new one
      if (state.alertSound && typeof state.alertSound.stop === 'function') {
        try { state.alertSound.stop(); } catch {}
      }
      const vol = (typeof state.settings.volume === 'number' ? state.settings.volume : 50) / 100;
      const howl = new Howl({ src: [soundSrc(file)], html5: false, volume: vol });
      state.alertSound = howl;
      howl.play();
    } catch {}
  }

  // Show a desktop notification for the given stage and event type/time
  function notifyStage(stage, eventType, time){
    if (!state.settings.enableNotifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const titles = { lead:'Upcoming Event', at:'Event Time', over1:'First Overdue', over2:'Second Overdue' };
    const title = titles[stage] || 'Event';
    const body = eventType ? `${eventType}${time ? ' at '+displayTime(time) : ''}` : '';
    try {
      const n = new Notification(title, { body });
      setTimeout(()=>{ try { n.close(); } catch {} }, 10000);
    } catch {}
  }

  // Export a full backup of all localStorage data to a JSON file
  function backupAll(){
    const data = {};
    for (let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    const fname = `csc-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Restore a backup (JSON object with key/value pairs for localStorage)
  function restoreBackup(obj){
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key=>{
      try { localStorage.setItem(key, obj[key]); } catch {}
    });
    // reload app state after restore
    loadAll();
    // rebuild profile options after loading schedules
    syncProfileOptions();
    state.selectedDay = todayShort();
    syncProfileLabel();
    renderSchedule();
    renderWeek();
    updateStatus();
  }

  // Show help popup
  function showHelp(){
    const pop = $('helpPopup'); if(pop) pop.hidden = false;
  }
  // Close help popup
  function closeHelp(){
    const pop = $('helpPopup'); if(pop) pop.hidden = true;
  }

  function updateStatus(){
    const cd = $('countdown'), es = $('expectedStatus');
    const list = activeList().slice().sort((a,b) => a.time.localeCompare(b.time));
    const nxt = nextEvent();
    const cur = currentEvent();

    let notScheduled = (list.length === 0);
    if (!notScheduled) {
      const first = parseHM(list[0].time);
      let last  = parseHM(list[list.length - 1].time);
      if (last < first) {
        last = new Date(last.getTime() + 24 * 60 * 60 * 1000); // Last event is next day
      }
      const now = new Date();
      if (now < first || now > last) notScheduled = true;
    }


    const leadMs  = state.settings.leadTime   * 60000;
    const over1Ms = state.settings.firstWarn  * 60000;
    const over2Ms = state.settings.secondWarn * 60000;

    // Determine expected type and stage relative to the current event (if any) or
    // the upcoming event if no current event exists.  `stage` may be null when
    // we are far from any event.
    let expectedType = 'None';
    let stage = null;

    const now = new Date();
    if (notScheduled) {
      // Nothing scheduled at this time
      expectedType = 'Not scheduled';
      stage = 'off';
      cd && (cd.textContent = '🕒 Countdown to next event: --');
      es && (es.textContent = 'You are not scheduled to work at this time');
    } else {
      // There is at least one event.  Show countdown to the next event always.
      if (nxt) {
        let nxtDate = parseHM(nxt.time);
        if (nxtDate < now) {
          nxtDate = new Date(nxtDate.getTime() + 24 * 60 * 60 * 1000);
        }
        const diffAbs = Math.max(0, nxtDate - now);
        const mins = Math.floor(diffAbs / 60000);
        const secs = Math.floor((diffAbs % 60000) / 1000);
        cd && (cd.textContent = `🕒 Countdown to next event: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} (${nxt.type})`);
      } else {
        cd && (cd.textContent = '🕒 Countdown to next event: --');
      }

      // If there is a current event (one scheduled before or at now), compute
      // how long we have been in it.  Otherwise we are before the first event.
      if (cur && parseHM(cur.time) <= now) {
        expectedType = cur.type;
        const startMs = parseHM(cur.time).getTime();
        const elapsed = now.getTime() - startMs;
        if (elapsed < over1Ms) stage = 'at';
        else if (elapsed < over2Ms) stage = 'over1';
        else stage = 'over2';
        es && (es.textContent = `Current Expected Status: ${expectedType}`);
      } else {
        // Before the first event – treat lead time relative to the next event
        expectedType = cur ? cur.type : 'None';
        if (nxt) {
          let nextTime = parseHM(nxt.time);
          if (nextTime < now) {
            nextTime = new Date(nextTime.getTime() + 24 * 60 * 60 * 1000); // Add one day
          }
          const diff = nextTime - now;
          if (diff <= leadMs) {
            // stage = 'lead'; removed
            // expectedType = nxt.type; moved below
          }
        }
        if (showLead) {
          expectedType = nxt.type;
        }
        es && (es.textContent = `Current Expected Status: ${expectedType}`);
      }
    }

    // Check for lead warning to next event, even during current event
    let showLead = false;
    if (nxt && !notScheduled) {
      let nextTime = parseHM(nxt.time);
      if (nextTime < now) {
        nextTime = new Date(nextTime.getTime() + 24 * 60 * 60 * 1000);
      }
      const diff = nextTime - now;
      if (diff <= leadMs) {
        showLead = true;
      }
    }

    // Determine whether the expected status has been acknowledged.  If
    // acknowledged, ackOK will be true; otherwise false.  Only compute
    // acknowledgment when there is a real expectedType (not None/Not scheduled).
    let ackOK = false;
    if (!notScheduled && expectedType && expectedType.toLowerCase() !== 'none') {
      const ack = (state.ackStatus || '').toLowerCase();
      const exp = (expectedType || '').toLowerCase();
      ackOK = (ack && ack === exp);
    }

    // Apply colour state to the clock and expected status.  If the
    // expected status has not been acknowledged, force the display to
    // 'overdue' (red).  Otherwise use the stage to decide between
    // 'nearing' (yellow, within lead) and 'upcoming' (green).  This
    // prevents the clock remaining red after the user selects the
    // correct status.
    const tc = document.querySelector('.time-container');
    if (tc) {
      let key;
      // When nothing is scheduled (before first or after last event),
      // show overdue (red) to indicate you should not be working.
      if (notScheduled) {
        key = 'overdue';
      } else {
        const hasExp = expectedType && expectedType.toLowerCase() !== 'none' && !notScheduled;
        if (showLead || stage === 'lead') { key = 'nearing'; } else if (hasExp && !ackOK) { key = 'overdue'; } else { key = 'upcoming'; }
      }
      tc.classList.remove('state-upcoming', 'state-nearing', 'state-overdue');
      tc.classList.add('state-' + key);
      // Add or remove pulse animation when overdue and not acknowledged.
      const shouldPulse = (stage === 'at' || stage === 'over1' || stage === 'over2') && !ackOK;
      tc.classList.toggle('pulse-alert', shouldPulse);
    }

    // Highlight the current timeline marker when overdue and unacknowledged.
    // Only highlight for the current event (cur), not the upcoming one.
    {
      const markers = document.querySelectorAll('.timeline-events .mark');
      // Determine if highlight should be applied
      const shouldHighlight = (stage === 'at' || stage === 'over1' || stage === 'over2') && !ackOK && cur;
      markers.forEach(marker => {
        if (shouldHighlight && marker.dataset && cur) {
          const mt = marker.dataset.time;
          const et = cur.time;
          // Compare times exactly; highlight if match
          if (mt === et) marker.classList.add('highlight');
          else marker.classList.remove('highlight');
        } else {
          marker.classList.remove('highlight');
        }
      });
    }

    // Highlight the current event in the weekly planner.  Remove any
    // prior highlight classes and add one corresponding to the clock
    // state (upcoming/nearing/overdue) to the event item for `cur` on
    // the current day.  No highlight when there is no current event.
    {
      const items = document.querySelectorAll('.event-item');
      // Always clear existing highlight classes before applying a new one
      items.forEach(it => {
        it.classList.remove('current-upcoming','current-nearing','current-overdue');
      });
      if (cur) {
        // Determine which highlight class to apply based on acknowledgement and stage.
        let eventKey;
        const hasExpEvt = expectedType && expectedType.toLowerCase() !== 'none' && !notScheduled;
        if (hasExpEvt && !ackOK) {
          // If there is an expected status and it has not been acknowledged, mark overdue
          eventKey = 'overdue';
        } else {
          // Otherwise, use the stage: lead -> nearing, else upcoming
          if (stage === 'lead') eventKey = 'nearing';
          else eventKey = 'upcoming';
        }
        const todayStr = todayShort();
        // We highlight the event whose span includes the current time.  For
        // each event item on the current day, compute its start and end
        // boundaries based on the schedule.  Highlight if now is between
        // these boundaries.
        const p = prof();
        const wk = getWeek(p);
        const dayEvents = (wk[todayStr] || []).slice().sort((a,b)=>a.time.localeCompare(b.time));
        const nowMs = (new Date()).getTime();
        items.forEach(it => {
          if (!it.dataset) return;
          if (it.dataset.day !== todayStr) return;
          const itemTimeNorm = normalizeTimeStr(it.dataset.time);
          // find this event in the day's list
          const idx = dayEvents.findIndex(ev => normalizeTimeStr(ev.time) === itemTimeNorm);
          if (idx === -1) return;
          const startMs = parseHM(itemTimeNorm).getTime();
          // Determine end time: next event's start or midnight
          let endMs;
          if (idx + 1 < dayEvents.length) {
            endMs = parseHM(normalizeTimeStr(dayEvents[idx + 1].time)).getTime();
          } else {
            // Use 24:00 as the end of the day (next day's 00:00)
            const d = new Date(); d.setHours(24,0,0,0); endMs = d.getTime();
          }
          if (nowMs >= startMs && nowMs < endMs) {
            it.classList.add('current-' + eventKey);
          }
        });
      }
    }

    // Update button classes
    BTN_IDS.forEach(id => {
      const b = $(id);
      if (!b) return;
      b.classList.remove('expected', 'current', 'ack-ok', 'ack-wrong', 'danger');
      if (btnLabel(id).toLowerCase() === (expectedType || '').toLowerCase()) b.classList.add('expected');
      if (state.ackStatus && btnLabel(id).toLowerCase() === state.ackStatus.toLowerCase()) {
        if ((expectedType || '').toLowerCase() === state.ackStatus.toLowerCase()) b.classList.add('ack-ok');
        else b.classList.add('ack-wrong');
      }
    });

    const se = $('shiftEnd');
    if (se) {
      const exp = (expectedType || '').toLowerCase();
      if (exp === 'shift end' && (stage === 'at' || stage === 'over1' || stage === 'over2')) se.classList.add('danger');
      else se.classList.remove('danger');
    }

    // Update timeline progress bar
    const bar = $('timelineProgress');
    if (bar) {
      const n = new Date();
      const secs = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
      let pct = (secs / 86400);
      if (secs >= 86399) pct = 1;
      bar.style.transform = `scaleX(${pct})`;
    }

    // Determine a key representing the current expected status.  When this key
    // changes, clear the last stage and acknowledgement so the user must
    // acknowledge the new expected status.  Use expectedType (normalized)
    // rather than raw event objects so that keys remain stable across
    // seconds and do not reset unnecessarily when the underlying data
    // structure changes.
    const normExp = (expectedType || '').toLowerCase();
    const evKey = notScheduled ? 'off' : (normExp || 'none');
    if (evKey !== state.lastEventKey) {
      state.lastEventKey = evKey;
      state.lastStage = null;
      state.ackStatus = null;
    }
    // Handle stage change and play notifications/sounds if not acknowledged
    if (stage && stage !== 'off' && stage !== state.lastStage) {
      // v0.5.2: always play configured lead sound on entering lead
      if (stage === 'lead') {
        playStage(stage, expectedType);
        try {
          notifyStage(stage, expectedType, cur ? cur.time : nxt?.time);
        } catch {}
      } else if (!ackOK) {
        playStage(stage, expectedType);
      try {
          notifyStage(stage, expectedType, cur ? cur.time : nxt?.time);
        } catch {}
      }
      state.lastStage = stage;
    }

    // Handle lead warning sound and notification
    if (showLead && !state.lastShowLead) {
      playStage('lead', nxt ? nxt.type : expectedType);
      try {
        notifyStage('lead', nxt ? nxt.type : expectedType, nxt ? nxt.time : (cur ? cur.time : null));
      } catch {}
      state.lastShowLead = true;
    } else if (!showLead) {
      state.lastShowLead = false;
    }
  }

  function renderTimelineMarkers(){
    const host = $('timelineEvents'); if (!host) return;
    host.innerHTML = '';
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    for (const ev of list){
      const [H,M] = ev.time.split(':').map(Number);
      const pct = ((H*3600 + M*60) / 86400) * 100;
      const dot = document.createElement('div');
      dot.className = `mark ${ typeClass(ev.type) }`;
      dot.style.left = `${pct}%`;
      dot.title = `${ev.type} • ${displayTime(ev.time)}`;
      // Store metadata for highlighting by updateStatus().  Use original
      // event time (HH:MM) and lower-case type.
      dot.dataset.time = ev.time;
      dot.dataset.type = (ev.type || '').toLowerCase();
      host.appendChild(dot);
    }
  }

  function addEvent(){
    const t = ($('eventTime')?.value||'').trim();
    const type = $('eventType')?.value || 'On Queue';
    if (!isTime(t)){ $('eventTime')?.classList.add('error-highlight'); return; }
    if (state.selectedDay){
      const p=prof(), w=getWeek(p); (w[state.selectedDay] ||= []).push({time:t,type});
      w[state.selectedDay].sort((a,b)=>a.time.localeCompare(b.time)); setWeek(p,w);
    } else {
      const p=prof(); (state.schedule[p] ||= []).push({time:t,type});
      state.schedule[p].sort((a,b)=>a.time.localeCompare(b.time));
    }
    saveAll(); renderSchedule(); renderWeek(); updateStatus();
  }
  function deleteEvent(i){
    if (state.selectedDay){ const p=prof(), w=getWeek(p); w[state.selectedDay].splice(i,1); setWeek(p,w); }
    else { const p=prof(); (state.schedule[p]||[]).splice(i,1); }
    saveAll(); renderSchedule(); renderWeek();
  }

  // Inline editor handlers for ad-hoc schedules (weekly editing uses modal)

  /**
   * Render the weekly planner.  Each event element includes data attributes
   * (day and time) so that updateStatus() can highlight the current event.
   */
  function renderWeek(){
    const table=$('weekTable'); if(!table) return;
    const p=prof(), week=getWeek(p);

    table.querySelectorAll('th[data-day-h],td[data-day]').forEach(x=>{
      const d = x.getAttribute('data-day-h') || x.getAttribute('data-day');
      x.classList.toggle('selected', !!state.selectedDay && state.selectedDay===d);
    });

    table.querySelectorAll('td[data-day]').forEach(cell=>{
      const day=cell.dataset.day; cell.innerHTML='';
      const list=(week[day]||[]).slice().sort((a,b)=>a.time.localeCompare(b.time));
      list.forEach((ev,idx)=>{
        const div=document.createElement('div');
        div.className=`event-item ${typeClass(ev.type)}`;
        div.draggable=true;
        // Normalise the event time string to HH:MM 24‑hour format.  Some
        // schedules may use 12‑hour notation (e.g. "7:30 PM").  Converting
        // ensures that current events can be matched reliably regardless of
        // input format.
        const normTime = normalizeTimeStr(ev.time);
        // Store metadata for the event so updateStatus can highlight the current event
        div.dataset.day = day;
        div.dataset.time = normTime;
        div.dataset.type = (ev.type || '').toLowerCase();
        // Display uses the original time for readability
        div.innerHTML=`<span>${displayTime(ev.time)} – ${ev.type}</span>
          <div>
            <button class="edit" type="button" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="kill" type="button" title="Delete"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
        div.querySelector('.kill').addEventListener('click',()=>{
          (week[day]||[]).splice(idx,1); setWeek(p,week); renderWeek(); if(state.selectedDay===day) renderSchedule();
        });
        div.querySelector('.edit').addEventListener('click',()=>{
          // Use the unified edit modal for editing weekly events.  Pass
          // the day and index so the event can be updated correctly.
          openEditModal(day, idx, ev);
        });
        div.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',JSON.stringify({fromDay:day,index:idx}))});
        cell.appendChild(div);
      });
      cell.addEventListener('dragover',e=>e.preventDefault());
      cell.addEventListener('drop',e=>{
        e.preventDefault();
        try{
          const data=JSON.parse(e.dataTransfer.getData('text/plain'));
          const moved=week[data.fromDay]?.splice(data.index,1)[0]; if(!moved) return;
          (week[day] ||= []).push(moved); setWeek(p,week); renderWeek();
          if (state.selectedDay===day || state.selectedDay===data.fromDay) renderSchedule();
        }catch{}
      });
    });

    table.querySelectorAll('th[data-day-h]').forEach(th=>{
      const day=th.getAttribute('data-day-h');
      th.onclick=(e)=>{ if(e.target.closest('button')) return; state.selectedDay=day; renderWeek(); renderSchedule(); };
    });
    table.querySelectorAll('thead .add').forEach(btn=>{
      btn.onclick = () => {
        // Open the unified edit modal with day provided and index = null
        // to indicate a new event.  This allows adding events directly
        // from the weekly planner header.
        openEditModal(btn.dataset.day, null, null);
      };
    });

    renderTimelineMarkers();
  }

  // Planner editing popup removed – unified modal handles edits now

  async function listSoundFiles(){
    const set = new Set();
    Object.keys(state.settings.customSounds||{}).forEach(k=>set.add(k));
    try{
      const r=await fetch('sounds/manifest.json',{cache:'no-store'});
      if(r.ok){ const a=await r.json(); if(Array.isArray(a)) a.filter(x=>/\.mp3$/i.test(x)).forEach(x=>set.add(x)); }
    }catch{}
    if(set.size===0) ['click.mp3','a.mp3'].forEach(x=>set.add(x));
    return [...set];
  }
  function setSelect(id,files,current){
    const sel=$(id); if(!sel) return; sel.innerHTML='';
    files.forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent=f; if(current===f) o.selected=true; sel.appendChild(o); });
  }
  function wirePreview(id,selId){
    $(id)?.addEventListener('click',()=>{
      const sel=$(selId); if(!sel||!window.Howl) return;
      const file=sel.value||'a.mp3';
      const vol = (typeof state.settings.volume === 'number' ? state.settings.volume : 50) / 100;
      try{ new Howl({src:[soundSrc(file)],html5:false,volume:vol}).play(); }catch{}
    });
  }
  async function setupSoundPickers(){
    const files=await listSoundFiles();
    const s=state.settings; s.sounds=s.sounds||{lead:{},at:{},over1:{},over2:{}};
    setSelect('clickPattern',files,s.clickPattern||'click.mp3');
    setSelect('leadPattern',files,s.sounds.lead.file||'a.mp3');
    setSelect('atPattern',files,s.sounds.at.file||'a.mp3');
    setSelect('over1Pattern',files,s.sounds.over1.file||'a.mp3');
    setSelect('over2Pattern',files,s.sounds.over2.file||'a.mp3');
    const save=()=>{ try{ localStorage.setItem('settings', JSON.stringify(state.settings)); }catch{} };
    $('clickPattern')?.addEventListener('change',e=>{ s.clickPattern=e.target.value; save(); });
    $('leadPattern') ?.addEventListener('change',e=>{ s.sounds.lead.file=e.target.value; save(); });
    $('atPattern')   ?.addEventListener('change',e=>{ s.sounds.at.file=e.target.value; save(); });
    $('over1Pattern')?.addEventListener('change',e=>{ s.sounds.over1.file=e.target.value; save(); });
    $('over2Pattern')?.addEventListener('change',e=>{ s.sounds.over2.file=e.target.value; save(); });

    wirePreview('previewClick','clickPattern');
    wirePreview('previewLead','leadPattern');
    wirePreview('previewAt','atPattern');
    wirePreview('previewOver1','over1Pattern');
    wirePreview('previewOver2','over2Pattern');

    $('uploadSoundBtn')?.addEventListener('click',()=> $('uploadSound')?.click());
    $('uploadSound')?.addEventListener('change',async e=>{
      const f=e.target.files?.[0]; if(!f||!/\.mp3$/i.test(f.name)) return;
      const buf=await f.arrayBuffer(); const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
      state.settings.customSounds[f.name]=`data:audio/mp3;base64,${b64}`;
      saveAll();
      const list=await listSoundFiles();
      setSelect('clickPattern',list,state.settings.clickPattern);
      setSelect('leadPattern',list,state.settings.sounds.lead.file);
      setSelect('atPattern',list,state.settings.sounds.at.file);
      setSelect('over1Pattern',list,state.settings.sounds.over1.file);
      setSelect('over2Pattern',list,state.settings.sounds.over2.file);
      showToast('Uploaded. Select it from the dropdowns.','success');
    });

    $('deleteSoundBtn')?.addEventListener('click', async () => {
      const selected = $('clickPattern').value;
      if (state.settings.customSounds && state.settings.customSounds[selected]) {
        delete state.settings.customSounds[selected];
        saveAll();
        const list = await listSoundFiles();
        setSelect('clickPattern', list, state.settings.clickPattern || 'click.mp3');
        setSelect('leadPattern', list, state.settings.sounds.lead.file || 'a.mp3');
        setSelect('atPattern', list, state.settings.sounds.at.file || 'a.mp3');
        setSelect('over1Pattern', list, state.settings.sounds.over1.file || 'a.mp3');
        setSelect('over2Pattern', list, state.settings.sounds.over2.file || 'a.mp3');
        showToast('Custom sound deleted', 'success');
      } else {
        showToast('Selected sound is not a custom upload', 'error');
      }
    });
  }

  function wireAll(){
    // Toggle Settings panel visibility and store preference in localStorage
    $('toggleSettings')?.addEventListener('click',()=>{
      const p = $('settingsPanel');
      if(!p) return;
      p.hidden = !p.hidden;
      try { localStorage.setItem('settingsPanelOpen', (!p.hidden).toString()); } catch {}
    });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; const btn = $('installApp'); if (btn) btn.disabled = false; });
    $('installApp')?.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      const e = state.deferredPrompt; state.deferredPrompt = null;
      await e.prompt(); try { await e.userChoice; } catch {}
      $('installApp').disabled = true;
    });
    window.addEventListener('appinstalled', () => { $('installApp') && ($('installApp').disabled = true); });

    const esc=$('managerEscalation');
    if(esc){
      const sync=()=>{ esc.classList.toggle('on', !!state.settings.escalation); esc.querySelector('.state').textContent = state.settings.escalation?'ON':'OFF'; };
      esc.addEventListener('click',()=>{ state.settings.escalation=!state.settings.escalation; saveAll(); sync(); });
      sync();
    }

    $('timeFormat')?.addEventListener('change',e=>{ state.settings.timeFormat=e.target.value; saveAll(); renderSchedule(); renderWeek(); });
    $('timeZone')?.addEventListener('change',e=>{ state.settings.timeZone=e.target.value; saveAll(); });

    const bindCB=(id,key)=>{ const cb=$(id); if(!cb) return; cb.checked=!!state.settings[key]; cb.addEventListener('change',()=>{ state.settings[key]=cb.checked; saveAll(); }); };
    bindCB('enableSounds','enableSounds'); bindCB('enableClicks','enableClicks');
    bindCB('enableNotifications','enableNotifications');
    // when enabling notifications for the first time, request permission
    const notifCb = $('enableNotifications');
    if (notifCb){
      notifCb.addEventListener('change', async ()=>{
        if (notifCb.checked){
          try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted'){
              showToast('Notifications are blocked. Please allow notifications in your browser settings.','error');
              notifCb.checked = false;
              state.settings.enableNotifications = false;
            }
          } catch {}
          saveAll();
        }
      });
    }

    const setSlider=(id,valId,key)=>{ const el=$(id),out=$(valId); if(!el||!out) return; el.value=state.settings[key]; out.textContent=String(state.settings[key]); el.addEventListener('input',()=>{ state.settings[key]=parseInt(el.value,10); out.textContent=el.value; saveAll(); }); };
    setSlider('leadSlider','leadVal','leadTime'); setSlider('over1Slider','over1Val','firstWarn'); setSlider('over2Slider','over2Val','secondWarn');

    // Master volume slider: 0-100 (affects all alert and click sounds)
    setSlider('volumeSlider','volumeVal','volume');

    BTN_IDS.forEach(id => $(id)?.addEventListener('click', () => {
      // Highlight the current button
      BTN_IDS.forEach(x => $(x)?.classList.remove('current'));
      $(id)?.classList.add('current');
      // Update the acknowledged status to the button’s label
      state.ackStatus = (document.getElementById(id)?.textContent || id).trim();
      saveAll();
      // Stop any ongoing alert sound for the lead/overdue stages when the
      // acknowledged status matches the expected state.  Do not stop click
      // sounds – only the stored alertSound is stopped here.
      if (state.alertSound && typeof state.alertSound.stop === 'function') {
        try { state.alertSound.stop(); } catch {}
        state.alertSound = null;
      }
      // Immediately update the UI colours after acknowledging
      updateStatus();
    }));

    $('addProfile')?.addEventListener('click',()=>{
      const name=prompt('New profile name:','New'); if(!name) return;
      if (!$('profileSwitcher').querySelector(`option[value="${name}"]`)){
        const sel=$('profileSwitcher'); const o=document.createElement('option'); o.value=name; o.textContent=name; sel.appendChild(o); sel.value=name;
      } else { $('profileSwitcher').value=name; }
      state.schedule[name]=state.schedule[name]||[]; state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek();
    });
    $('deleteProfile')?.addEventListener('click',()=>{
      const sel=$('profileSwitcher'); if(!sel) return;
      if (sel.options.length <= 1){ showToast('You need at least one profile. Create another before deleting this one.','error'); return; }
      const name=sel.value; if(name==='default'){ showToast('Default profile cannot be deleted.','error'); return; }
      if(!confirm(`Delete profile "${name}" and its schedules?`)) return;
      localStorage.removeItem(`schedule_${name}`); localStorage.removeItem(`schedule_week_${name}`);
      [...sel.querySelectorAll('option')].find(o=>o.value===name)?.remove();
      sel.value='default'; state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek();
    });
    $('profileSwitcher')?.addEventListener('change',()=>{ state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek(); });

    $('addEvent')?.addEventListener('click', addEvent);
    $('importBtn')?.addEventListener('click',()=>{ const f=$('importFile')?.files?.[0]; if(f) importFlexible(f); });
    $('exportSchedule')?.addEventListener('click', exportSchedule);
    $('exportAll')?.addEventListener('click', exportAll);
    $('resetApp')?.addEventListener('click',()=>{ if(confirm('Reset all data?')) { localStorage.clear(); location.reload(); } });

    // backup and restore handlers
    $('backupBtn')?.addEventListener('click', backupAll);
    $('importBackupBtn')?.addEventListener('click', ()=>{
      const f = $('importBackupFile')?.files?.[0];
      if(!f){ showToast('Please choose a backup JSON file first.','error'); return; }
      const r = new FileReader();
      r.onload = ()=>{
        try {
          const obj = JSON.parse(r.result);
          restoreBackup(obj);
          showToast('Backup restored','success');
        } catch (e) {
          showToast('Failed to restore backup: ' + e.message,'error');
        }
      };
      r.readAsText(f);
    });

    // help handlers
    $('helpBtn')?.addEventListener('click', showHelp);
    $('helpClose')?.addEventListener('click', closeHelp);

    // Theme selection dropdown: update theme and persist
    const themeSel = $('themeSelect');
    if (themeSel) {
      // initialize from saved setting
      themeSel.value = state.settings.theme || 'dark';
      themeSel.addEventListener('change', () => {
        state.settings.theme = themeSel.value;
        saveAll();
        applyTheme();
      });
    }

    // Drag-and-drop reordering for status buttons
    const setupStatusDrag = () => {
      // Use DEFAULT_ORDER for event binding; statusOrder will determine ordering
      ['onQueue','available','c2c','break','meal','meeting','busy','shiftEnd'].forEach(id => {
        const btn = $(id);
        if (!btn) return;
        btn.setAttribute('draggable','true');
        btn.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', id);
        });
        btn.addEventListener('dragover', e => {
          e.preventDefault();
        });
        btn.addEventListener('drop', e => {
          e.preventDefault();
          const src = e.dataTransfer.getData('text/plain');
          const dest = id;
          if (!src || !dest || src === dest) return;
          const order = Array.isArray(state.settings.statusOrder) ? state.settings.statusOrder.slice() : DEFAULT_ORDER.slice();
          const sidx = order.indexOf(src);
          const didx = order.indexOf(dest);
          if (sidx < 0 || didx < 0) return;
          order.splice(sidx, 1);
          order.splice(didx, 0, src);
          state.settings.statusOrder = order;
          saveAll();
          reorderStatusButtons();
        });
      });
    };
    setupStatusDrag();

    // Keyboard shortcuts for status acknowledgement (Alt+1..Alt+8).  Uses
    // user-defined order from statusOrder to map keys to buttons.
    document.addEventListener('keydown', e => {
      if (!e.altKey) return;
      const num = parseInt(e.key, 10);
      if (isNaN(num) || num < 1) return;
      const order = Array.isArray(state.settings.statusOrder) ? state.settings.statusOrder : DEFAULT_ORDER;
      const idx = num - 1;
      if (idx >= order.length) return;
      const btnId = order[idx];
      const btn = $(btnId);
      if (btn) {
        btn.click();
        e.preventDefault();
      }
    });

    // Onboarding dismissal handler
    $('onboardingOk')?.addEventListener('click', () => {
      hideOnboarding();
    });

    // Unified edit modal handlers
    const editSaveBtn = $('editModalSave');
    const editCancelBtn = $('editModalCancel');
    if (editSaveBtn) {
      editSaveBtn.addEventListener('click', () => {
        const ctx = state.editContext || {};
        const day = ctx.day || null;
        let idx = ctx.index;
        const type = $('editModalType')?.value || 'On Queue';
        const time = $('editModalTime')?.value || '';
        if (!time) {
          showToast('Please select a time','error');
          return;
        }
        const ev = { time: time, type: type };
        const p = prof();
        if (day) {
          const w = getWeek(p);
          if (!Array.isArray(w[day])) w[day] = [];
          if (idx == null || isNaN(idx)) {
            w[day].push(ev);
          } else {
            w[day][idx] = ev;
          }
          setWeek(p, w);
        } else {
          const list = state.schedule[p] || [];
          if (idx == null || isNaN(idx)) {
            list.push(ev);
          } else {
            list[idx] = ev;
          }
          state.schedule[p] = list;
        }
        saveAll();
        // Re-render schedule and week view after update
        renderSchedule();
        renderWeek();
        // Hide modal and clear edit context
        const modal = $('editModal');
        if (modal) modal.hidden = true;
        state.editContext = null;
        showToast('Event saved','success');
      });
    }
    if (editCancelBtn) {
      editCancelBtn.addEventListener('click', () => {
        const modal = $('editModal');
        if (modal) modal.hidden = true;
        state.editContext = null;
      });
    }

    // Inline editor handlers for ad‑hoc schedules
    const inlineSave = $('saveChanges');
    const inlineCancel = $('cancelChanges');
    if (inlineSave) {
      inlineSave.addEventListener('click', () => {
        const idx = state.inlineEditing;
        if (idx == null || isNaN(idx)) return;
        const p = prof();
        const list = state.schedule[p] || [];
        const typeSel = $('editType');
        const timeInput = $('editTime');
        const type = typeSel?.value || 'On Queue';
        const time = timeInput?.value || '';
        if (!time) {
          showToast('Please select a time','error');
          return;
        }
        list[idx] = { time: time, type: type };
        // Sort list after editing to maintain order
        list.sort((a,b) => a.time.localeCompare(b.time));
        state.schedule[p] = list;
        state.inlineEditing = null;
        saveAll();
        renderSchedule();
        renderWeek();
        showToast('Event updated','success');
      });
    }
    if (inlineCancel) {
      inlineCancel.addEventListener('click', () => {
        state.inlineEditing = null;
        const inlineEl = $('inlineEditor');
        if (inlineEl) inlineEl.hidden = true;
      });
    }
  }

  function wireTimezones(){
    const sel=$('timeZone'); if(!sel) return;
    let zones = [];
    try {
      if (Intl.supportedValuesOf) zones = Intl.supportedValuesOf('timeZone');
    } catch {}
    // Fallback to a small list of common time zones when unsupported
    if (!Array.isArray(zones) || zones.length === 0) {
      zones = ['UTC','America/Phoenix','America/Chicago','America/New_York','America/Los_Angeles','Europe/London','Asia/Shanghai'];
    }
    zones.forEach(z => {
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z;
      sel.appendChild(o);
    });
    // Use saved timeZone or fallback to the browser default
    sel.value = state.settings.timeZone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  function importFlexible(file){
    const r=new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        // Detect full backup format: keys starting with schedule_ or schedule_week_ or settings
        if (data && typeof data === 'object' && (Object.keys(data).some(k => /^schedule_/.test(k)) || 'settings' in data)) {
          // full restore
          restoreBackup(data);
          showToast('Backup restored','success');
          return;
        }
        const p = prof();
        if (Array.isArray(data)) {
          if (state.selectedDay) {
            const w = getWeek(p);
            w[state.selectedDay] = data;
            setWeek(p, w);
          } else {
            state.schedule[p] = data;
          }
        } else if (data && typeof data === 'object') {
          if (data.week) {
            const w = getWeek(p);
            Object.assign(w, data.week);
            setWeek(p, w);
          }
          if (Array.isArray(data.adhoc)) state.schedule[p] = data.adhoc;
        } else throw new Error('Unsupported format');
        saveAll();
        renderSchedule();
        renderWeek();
        showToast('Import complete','success');
      } catch (e) {
        showToast('Import failed: ' + e.message,'error');
      }
    };
    r.readAsText(file);
  }
  function exportSchedule(){
    const name = state.selectedDay ? `${prof()}-${state.selectedDay}` : prof();
    const data = JSON.stringify(activeList(), null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${name}-schedule.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportAll(){
    const p = prof();
    const payload = { profile: p, adhoc: state.schedule[p] || [], week: getWeek(p) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${p}-all-schedules.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  function init(){
    loadAll();
    state.selectedDay = todayShort();
    syncProfileLabel();
    wireAll();
    // Apply saved theme and reorder status buttons before rendering
    applyTheme();
    reorderStatusButtons();
    // Restore settings panel visibility from localStorage. If no value is stored,
    // default to hidden (closed).  This must run after wireAll has attached
    // event handlers, otherwise toggling the panel might not persist state.
    const sp = document.getElementById('settingsPanel');
    if (sp) {
      try {
        const open = localStorage.getItem('settingsPanelOpen');
        if (open === null) {
          sp.hidden = true;
        } else {
          sp.hidden = (open !== 'true');
        }
      } catch {
        sp.hidden = true;
      }
    }
    wireTimezones();
    setupSoundPickers();
    renderSchedule();
    renderWeek();
    updateClock(); updateStatus();
    setInterval(()=>{ updateClock(); updateStatus(); }, 1000);
    try { if ('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js'); } catch {}

    // Show onboarding guidance if this is the first time the user has visited
    showOnboarding();
  }
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', init, {once:true}) : init();
})();

// v0.5.2: populate version label
document.addEventListener('DOMContentLoaded', ()=>{
  try{ const el=document.getElementById('app-version'); if (el) el.textContent = (typeof VERSION!=='undefined'?VERSION:''); }catch{}
});

// v0.5.2: ensure audio context resumes on first interaction
(function(){function u(){try{if(window.Howler&&Howler.ctx&&Howler.ctx.state==='suspended')Howler.ctx.resume()}catch{};
window.removeEventListener('click',u);window.removeEventListener('keydown',u);window.removeEventListener('touchstart',u);} 
window.addEventListener('click',u,{once:true});window.addEventListener('keydown',u,{once:true});window.addEventListener('touchstart',u,{once:true});})();

// v0.5.2 stage→CSS sync
(function(){
  var __lastStageKey = '';
  function applyStageClass(stage) {
    document.body.classList.remove('state-on','state-lead','state-after');
    var key = (stage === 'lead') ? 'lead' : (stage === 'after' ? 'after' : 'on');
    document.body.classList.add('state-' + key);
  }
  setInterval(function(){
    try {
      if (typeof stage !== 'undefined') {
        var key = (stage === 'lead') ? 'lead' : (stage === 'after' ? 'after' : 'on');
        if (key !== __lastStageKey) {
          applyStageClass(stage);
          __lastStageKey = key;
        }
      }
    } catch(e){}
  }, 500);
})();
