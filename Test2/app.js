/* CSC Adherence Timer app.js (r30) */
(() => {
  'use strict';
  if (window.__CSC_BOOTED__) return;
  window.__CSC_BOOTED__ = true;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
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
    },
    selectedDay: null,
    inlineEditing: null,   // index of left-side schedule card being edited
    plannerEdit: null,     // { day, index } for planner popup editing
    ackStatus: null,
    lastStage: null,
    lastEventKey: null,
    deferredPrompt: null
  };

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Button ids and canonical labels for comparison (don't trust textContent)
  const BTN_IDS = ['onQueue','available','c2c','break','meal','meeting','busy','shiftEnd'];
  const LABELS = {
    onQueue: 'On Queue',
    available: 'Available',
    c2c: 'C2C',
    break: 'Break',
    meal: 'Meal',
    meeting: 'Meeting',
    busy: 'Busy',
    shiftEnd: 'Shift End'
  };
  const btnLabel = id => LABELS[id] || ($(id)?.textContent.trim() || id);

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  const prof = () => ($('profileSwitcher')?.value || 'default');
  function getWeek(p){ try { return JSON.parse(localStorage.getItem(`schedule_week_${p}`)) || {}; } catch { return {}; } }
  function setWeek(p, data){ try { localStorage.setItem(`schedule_week_${p}`, JSON.stringify(data)); } catch {} }

  function loadAll() {
    const current = localStorage.getItem('currentProfile') || 'default';
    $('profileSwitcher') && ($('profileSwitcher').value = current);
    try { state.schedule[current] = JSON.parse(localStorage.getItem(`schedule_${current}`)) || []; }
    catch { state.schedule[current] = []; }
    try { Object.assign(state.settings, JSON.parse(localStorage.getItem('settings') || '{}')); } catch {}
    try { const cs = JSON.parse(localStorage.getItem('customSounds') || '{}'); if (cs && typeof cs === 'object') state.settings.customSounds = cs; } catch {}
  }
  function saveAll() {
    const p = prof();
    try { localStorage.setItem(`schedule_${p}`, JSON.stringify(state.schedule[p] || [])); } catch {}
    try { localStorage.setItem('settings', JSON.stringify(state.settings)); } catch {}
    try { localStorage.setItem('currentProfile', p); } catch {}
    try { localStorage.setItem('customSounds', JSON.stringify(state.settings.customSounds||{})); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  const isTime = s => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
  function todayShort(){ return DAYS[new Date().getDay()]; }

  function parseHM(hm){ const [H,M]=hm.split(':').map(Number); const d=new Date(); d.setHours(H,M,0,0); return d; }
  function displayTime(hm){
    const [H,M] = hm.split(':').map(Number);
    if (state.settings.timeFormat === '24') return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;
    const d = new Date(2000,1,1,H,M,0);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    for (const ev of list) if (parseHM(ev.time) > now) return ev;
    return null;
  }
  function currentEvent(){
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    const now = new Date(); let curr = null;
    for (const ev of list){ const t=parseHM(ev.time); if (t <= now) curr = ev; else break; }
    return curr || null;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function syncProfileLabel(){
    const lab = $('currentProfileLabel'); if (!lab) return;
    lab.textContent = `Current: ${prof()}`;
  }

  function renderSchedule() {
    const wrap = $('scheduleCards'); if (!wrap) return;
    wrap.innerHTML = '';
    const now = new Date();
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    list.forEach((ev,i)=>{
      const t=parseHM(ev.time), diffMin=(t-now)/60000;
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

    // Inline editor panel
    $('inlineEditor').hidden = (state.inlineEditing == null);
    if (state.inlineEditing != null) {
      const ev = list[state.inlineEditing];
      $('editType').value = ev?.type || 'On Queue';
      $('editTime').value = ev?.time || '';
    }

    wrap.querySelectorAll('.card-edit').forEach(b=>b.addEventListener('click', ()=>{
      state.inlineEditing = +b.dataset.index;
      $('inlineEditor').hidden = false;
      const ev = list[state.inlineEditing];
      $('editType').value = ev.type; $('editTime').value = ev.time;
    }));
    wrap.querySelectorAll('.card-delete').forEach(b=>b.addEventListener('click', ()=>deleteEvent(+b.dataset.index)));

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
    if (dEl){
      dEl.textContent = new Date().toLocaleDateString([], { weekday:'long', year:'numeric', month:'short', day:'numeric' });
    }
  }

  // ---------------------------------------------------------------------------
  // Sounds
  // ---------------------------------------------------------------------------
  function soundSrc(name){
    if (state.settings.customSounds && state.settings.customSounds[name]) return state.settings.customSounds[name];
    return '/sounds/' + name.replace(/^\//,'');
  }
  function playStage(stage, eventType){
    if (!state.settings.enableSounds) return;
    if (state.settings.escalation && !/^(break|meal)$/i.test(eventType||'')) return;
    const pick = k => (state.settings.sounds?.[k]?.file) || 'a.mp3';
    const file = ({lead:pick('lead'), at:pick('at'), over1:pick('over1'), over2:pick('over2')})[stage];
    if (!file || !window.Howl) return;
    try { new Howl({src:[soundSrc(file)], html5:false, volume: state.settings.clickVolume ?? 0.5}).play(); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Status + timeline
  // ---------------------------------------------------------------------------
  function updateStatus(){
    const cd=$('countdown'), es=$('expectedStatus');
    const list = activeList().slice().sort((a,b)=>a.time.localeCompare(b.time));
    const nxt = nextEvent();
    const cur = currentEvent();

    let notScheduled = (list.length === 0);
    if (!notScheduled){
      const first = parseHM(list[0].time);
      const last  = parseHM(list[list.length-1].time);
      const now = new Date();
      if (now < first || now > last) notScheduled = true;
    }

    const lead = state.settings.leadTime*60000, o1=state.settings.firstWarn*60000, o2=state.settings.secondWarn*60000;

    let expectedType = cur ? cur.type : 'None';
    let stage = null;

    if (notScheduled){
      expectedType = 'Not scheduled';
      stage = 'off';
      if (cd) cd.textContent = '🕒 Countdown to next event: --';
      if (es) es.textContent = 'You are not scheduled to work at this time';
    } else if (nxt){
      const t=parseHM(nxt.time), now=new Date(), diff=t-now;
      if (diff>0){
        if (diff<=lead) stage='lead';
        const abs=Math.max(0,t-now), mins=Math.floor(abs/60000), secs=Math.floor((abs%60000)/1000);
        if (cd) cd.textContent = `🕒 Countdown to next event: ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')} (${nxt.type})`;
        if (es) es.textContent = `Current Expected Status: ${expectedType}`;
      } else {
        const od=Math.abs(diff);
        if (od<o1) stage='at';
        else if (od<o2) stage='over1';
        else stage='over2';
        expectedType = nxt.type;
        if (cd) cd.textContent = `🕒 Countdown to next event: 00:00 (${nxt.type})`;
        if (es) es.textContent = `Current Expected Status: ${expectedType}`;
      }
    } else {
      if (es) es.textContent = `Current Expected Status: ${expectedType}`;
      if (cd) cd.textContent = '🕒 Countdown to next event: --';
    }

    // clock color by stage + acknowledgement result
    const tc = document.querySelector('.time-container');
    if (tc){
      const ackOK = state.ackStatus && state.ackStatus.toLowerCase() === (expectedType||'').toLowerCase();
      let key='upcoming';
      if (stage==='off') key='overdue';
      else if (stage==='lead' && !ackOK) key='nearing';
      else if ((stage==='at'||stage==='over1'||stage==='over2') && !ackOK) key='overdue';
      tc.classList.remove('state-upcoming','state-nearing','state-overdue');
      tc.classList.add('state-'+key);
    }

    // button styles
    BTN_IDS.forEach(id=>{
      const b=$(id); if(!b) return;
      b.classList.remove('expected','current','ack-ok','ack-wrong','danger');
      if (btnLabel(id).toLowerCase() === (expectedType||'').toLowerCase()){
        b.classList.add('expected');
      }
      if (state.ackStatus && btnLabel(id).toLowerCase() === state.ackStatus.toLowerCase()){
        if ((expectedType||'').toLowerCase() === state.ackStatus.toLowerCase()){
          b.classList.add('ack-ok');
        } else {
          b.classList.add('ack-wrong');
        }
      }
    });

    // Shift End only red when due/overdue
    const se=$('shiftEnd');
    if (se){
      const exp=(expectedType||'').toLowerCase();
      if (exp==='shift end' && (stage==='at'||stage==='over1'||stage==='over2')) se.classList.add('danger');
      else se.classList.remove('danger');
    }

    // timeline fill using scaleX for accurate 100%
    const bar=$('timelineProgress');
    if (bar){
      const n=new Date();
      const secs=n.getHours()*3600+n.getMinutes()*60+n.getSeconds();
      let pct=(secs/86400);
      if (secs>=86399) pct=1;
      bar.style.transform = `scaleX(${pct})`;
    }

    const evKey = nxt ? `${nxt.time}|${nxt.type}` : (notScheduled ? 'off' : 'none');
    if (evKey !== state.lastEventKey){ state.lastEventKey=evKey; state.lastStage=null; state.ackStatus=null; }
    if (stage && stage!=='off' && stage!==state.lastStage){ playStage(stage, nxt?.type); state.lastStage=stage; }
  }

  // Timeline markers (event dots)
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
      host.appendChild(dot);
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD (left-side list)
  // ---------------------------------------------------------------------------
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
    saveAll(); renderSchedule(); renderWeek();
  }
  function deleteEvent(i){
    if (state.selectedDay){ const p=prof(), w=getWeek(p); w[state.selectedDay].splice(i,1); setWeek(p,w); }
    else { const p=prof(); (state.schedule[p]||[]).splice(i,1); }
    if (state.inlineEditing === i) state.inlineEditing = null;
    saveAll(); renderSchedule(); renderWeek();
  }

  // Inline editor actions
  $('saveChanges')?.addEventListener('click', ()=>{
    if (state.inlineEditing == null) return;
    const t = $('editTime').value, type = $('editType').value;
    if (!isTime(t)) return;
    if (state.selectedDay){
      const p=prof(), w=getWeek(p); w[state.selectedDay][state.inlineEditing] = {time:t,type}; w[state.selectedDay].sort((a,b)=>a.time.localeCompare(b.time)); setWeek(p,w);
    } else {
      const p=prof(); state.schedule[p][state.inlineEditing] = {time:t,type}; state.schedule[p].sort((a,b)=>a.time.localeCompare(b.time));
    }
    state.inlineEditing = null; saveAll(); renderSchedule(); renderWeek();
    $('inlineEditor').hidden = true;
  });
  $('cancelChanges')?.addEventListener('click', ()=>{ state.inlineEditing=null; $('inlineEditor').hidden = true; });

  // ---------------------------------------------------------------------------
  // Planner (right-side week table)
  // ---------------------------------------------------------------------------
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
        div.className=`event-item ${typeClass(ev.type)}`; div.draggable=true;
        div.innerHTML=`<span>${displayTime(ev.time)} – ${ev.type}</span>
          <div>
            <button class="edit" type="button" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="kill" type="button" title="Delete"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
        div.querySelector('.kill').addEventListener('click',()=>{
          (week[day]||[]).splice(idx,1); setWeek(p,week); renderWeek(); if(state.selectedDay===day) renderSchedule();
        });
        div.querySelector('.edit').addEventListener('click',()=>{
          openPlannerPopup(day, idx, ev);
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
      btn.onclick=()=>openPlannerPopup(btn.dataset.day);
    });

    renderTimelineMarkers();
  }

  function openPlannerPopup(day, index=null, ev=null){
    const pop=$('plannerPopup'); if(!pop) return;
    state.plannerEdit = index!=null ? {day,index} : null;
    pop.hidden=false; pop.dataset.day=day;
    $('ppTime').value=ev?.time || ''; $('ppType').value=ev?.type || 'On Queue';
  }
  $('ppCancel')?.addEventListener('click',()=> $('plannerPopup').hidden=true);
  $('ppSave')?.addEventListener('click',()=>{
    const day=$('plannerPopup').dataset.day; const time=$('ppTime').value; const type=$('ppType').value;
    if(!isTime(time)) return;
    const p=prof(); const week=getWeek(p);
    if (state.plannerEdit){ week[day][state.plannerEdit.index] = {time, type}; }
    else { (week[day] ||= []).push({time, type}); }
    week[day].sort((a,b)=>a.time.localeCompare(b.time)); setWeek(p,week);
    $('plannerPopup').hidden=true; if(state.selectedDay===day) renderSchedule(); renderWeek();
    state.plannerEdit=null;
  });

  // ---------------------------------------------------------------------------
  // Sound pickers
  // ---------------------------------------------------------------------------
  async function listSoundFiles(){
    const set = new Set();
    Object.keys(state.settings.customSounds||{}).forEach(k=>set.add(k));
    try{
      const r=await fetch('/sounds/manifest.json',{cache:'no-store'});
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
      const file=sel.value||'a.mp3'; try{ new Howl({src:[soundSrc(file)],html5:false,volume:state.settings.clickVolume??0.5}).play(); }catch{}
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
      alert('Uploaded. Select it from the dropdowns.');
    });
  }

  // ---------------------------------------------------------------------------
  // Wiring (PWA, profiles, controls)
  // ---------------------------------------------------------------------------
  function wireAll(){
    $('toggleSettings')?.addEventListener('click',()=>{ const p=$('settingsPanel'); if(p) p.hidden=!p.hidden; });

    // PWA prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); state.deferredPrompt = e; const btn = $('installApp'); if (btn) btn.disabled = false;
    });
    $('installApp')?.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      const e = state.deferredPrompt; state.deferredPrompt = null;
      await e.prompt(); try { await e.userChoice; } catch {}
      $('installApp').disabled = true;
    });
    window.addEventListener('appinstalled', () => { $('installApp') && ($('installApp').disabled = true); });

    // Escalation
    const esc=$('managerEscalation');
    if(esc){
      const sync=()=>{ esc.classList.toggle('on', !!state.settings.escalation); esc.textContent=`Manager Escalation: ${state.settings.escalation?'ON':'OFF'}`; };
      esc.addEventListener('click',()=>{ state.settings.escalation=!state.settings.escalation; saveAll(); sync(); });
      sync();
    }

    // General settings
    $('timeFormat')?.addEventListener('change',e=>{ state.settings.timeFormat=e.target.value; saveAll(); renderSchedule(); renderWeek(); });
    $('timeZone')?.addEventListener('change',e=>{ state.settings.timeZone=e.target.value; saveAll(); });

    const bindCB=(id,key)=>{ const cb=$(id); if(!cb) return; cb.checked=!!state.settings[key]; cb.addEventListener('change',()=>{ state.settings[key]=cb.checked; saveAll(); }); };
    bindCB('enableSounds','enableSounds'); bindCB('enableClicks','enableClicks');

    const setSlider=(id,valId,key)=>{ const el=$(id),out=$(valId); if(!el||!out) return; el.value=state.settings[key]; out.textContent=String(state.settings[key]); el.addEventListener('input',()=>{ state.settings[key]=parseInt(el.value,10); out.textContent=el.value; saveAll(); }); };
    setSlider('leadSlider','leadVal','leadTime'); setSlider('over1Slider','over1Val','firstWarn'); setSlider('over2Slider','over2Val','secondWarn');

    // Status acknowledgement buttons
    BTN_IDS.forEach(id=> $(id)?.addEventListener('click',()=>{
      BTN_IDS.forEach(x=>$(x)?.classList.remove('current'));
      $(id)?.classList.add('current');
      state.ackStatus = btnLabel(id);
      saveAll();
    }));

    // Profiles
    $('addProfile')?.addEventListener('click',()=>{
      const name=prompt('New profile name:','New'); if(!name) return;
      if (!$('profileSwitcher').querySelector(`option[value="${name}"]`)){
        const sel=$('profileSwitcher'); const o=document.createElement('option'); o.value=name; o.textContent=name; sel.appendChild(o); sel.value=name;
      } else { $('profileSwitcher').value=name; }
      state.schedule[name]=state.schedule[name]||[]; state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek();
    });
    $('deleteProfile')?.addEventListener('click',()=>{
      const sel=$('profileSwitcher'); if(!sel) return;
      if (sel.options.length <= 1){ alert('You need at least one profile. Create another before deleting this one.'); return; }
      const name=sel.value; if(name==='default'){ alert('Default profile cannot be deleted.'); return; }
      if(!confirm(`Delete profile "${name}" and its schedules?`)) return;
      localStorage.removeItem(`schedule_${name}`); localStorage.removeItem(`schedule_week_${name}`);
      [...sel.querySelectorAll('option')].find(o=>o.value===name)?.remove();
      sel.value='default'; state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek();
    });
    $('profileSwitcher')?.addEventListener('change',()=>{ state.selectedDay = todayShort(); saveAll(); syncProfileLabel(); renderSchedule(); renderWeek(); });

    // Left list quick add
    $('addEvent')?.addEventListener('click', addEvent);

    // Import/Export
    $('importBtn')?.addEventListener('click',()=>{ const f=$('importFile')?.files?.[0]; if(f) importFlexible(f); });
    $('exportSchedule')?.addEventListener('click', exportSchedule);
    $('exportAll')?.addEventListener('click', exportAll);
    $('resetApp')?.addEventListener('click',()=>{ if(confirm('Reset all data?')) { localStorage.clear(); location.reload(); } });
  }

  function wireTimezones(){
    const sel=$('timeZone'); if(!sel) return;
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    zones.forEach(z=>{ const o=document.createElement('option'); o.value=z; o.textContent=z; sel.appendChild(o); });
    sel.value = state.settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------
  function importFlexible(file){
    const r=new FileReader();
    r.onload=()=>{ try{
      const data=JSON.parse(r.result);
      const p=prof();
      if (Array.isArray(data)){ // legacy: list only
        if (state.selectedDay){ const w=getWeek(p); w[state.selectedDay]=data; setWeek(p,w); }
        else { state.schedule[p]=data; }
      } else if (data && typeof data==='object'){
        if (data.week){ const w=getWeek(p); Object.assign(w, data.week); setWeek(p,w); }
        if (Array.isArray(data.adhoc)) state.schedule[p]=data.adhoc;
      } else throw new Error('Unsupported format');
      saveAll(); renderSchedule(); renderWeek(); alert('Import complete');
    }catch(e){ alert('Import failed: '+e.message); } };
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

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init(){
    loadAll();
    state.selectedDay = todayShort();
    syncProfileLabel();
    wireAll();
    wireTimezones();
    setupSoundPickers();
    renderSchedule();
    renderWeek();
    renderTimelineMarkers();
    updateClock(); updateStatus();
    setInterval(()=>{ updateClock(); updateStatus(); }, 1000);
    try { if ('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js'); } catch {}
  }
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', init, {once:true}) : init();
})();
