let state = JSON.parse(localStorage.getItem('pomodo_state') || 'null') || {
  onboarded: false,
  currentScreen: 'onboarding',
  prevScreen: 'timer',
  darkMode: false,
  timer: {
    mode: 'focus',
    running: false,
    timeLeft: 25 * 60,
    sessions: 0,
    totalSessions: 0,
    totalMinutes: 0,
    streakDays: 0,
    lastDate: null,
    goal: 8,
    sound: true,
    durations: { focus: 25, short: 5, long: 15 }
  },
  tasks: [
    { id: 1, title: 'Compléter la proposition de projet', cat: 'Travail', color: '#E5534B', done: false, subs: 6, subsDone: 2, priority: 'high' },
    { id: 2, title: 'Revoir les pull requests', cat: 'Dev', color: '#3B82F6', done: false, subs: 4, subsDone: 1, priority: 'normal' },
    { id: 3, title: 'Mise à jour documentation', cat: 'Dev', color: '#3B82F6', done: false, subs: 3, subsDone: 3, priority: 'low' },
    { id: 4, title: 'Préparer le stand-up équipe', cat: 'Réunion', color: '#8B5CF6', done: true, subs: 2, subsDone: 2, priority: 'normal' },
    { id: 5, title: 'Apprendre React Native', cat: 'Perso', color: '#F59E0B', done: false, subs: 2, subsDone: 0, priority: 'normal' }
  ],
  history: {}
};

let timerInterval = null;
let obSlide = 0;
let taskTab = 'active';
let wakeLock = null;
let newTaskColor = '#E5534B';
let newTaskCat = 'Travail';

const COLORS = ['#E5534B','#3B82F6','#22C55E','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
const CATS = ['Travail','Dev','Perso','Réunion','Santé','Autre'];
const CIRC = 2 * Math.PI * 104;

function save() { localStorage.setItem('pomodo_state', JSON.stringify(state)); }

function init() {
  if (state.darkMode) { document.documentElement.setAttribute('data-dark','true'); document.getElementById('dark-toggle').checked = true; }
  if (!state.onboarded) { showRaw('onboarding'); }
  else { document.getElementById('bottom-nav').style.display='flex'; showRaw(state.currentScreen==='onboarding'?'timer':state.currentScreen); }
  renderStreakDots();
  renderTimerTasks();
  renderTasks();
  renderSettings();
  renderReports();
  updateTimerDisplay();
}

function showRaw(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('slide-left');
  });

  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById('nav-'+id);
  if (nav) nav.classList.add('active');
  const onboard = id === 'onboarding' || id === 'settings';
  document.getElementById('bottom-nav').style.display = onboard ? 'none' : 'flex';
}

function showScreen(id) {
  if (id === state.currentScreen) return;
  state.prevScreen = state.currentScreen;
  state.currentScreen = id;
  save();
  showRaw(id);
  if (id === 'tasks') { renderTasks(); }
  if (id === 'reports') { renderReports(); }
  if (id === 'settings') { renderSettings(); }
  if (id === 'timer') { renderTimerTasks(); renderStreakDots(); }
}

function goBack() {
  showScreen(state.prevScreen || 'timer');
}

function nextSlide() {
  const slides = document.querySelectorAll('.ob-slide');
  if (obSlide < slides.length - 1) {
    slides[obSlide].style.transform = 'translateX(-100%)';
    obSlide++;
    slides[obSlide].style.transform = 'translateX(0)';
    document.querySelectorAll('.ob-dot').forEach((d,i) => {
      d.classList.toggle('active', i === obSlide);
    });
    if (obSlide === slides.length - 1) {
      document.getElementById('ob-btn').innerHTML = 'Commencer <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    }
  } else {
    finishOnboarding();
  }
}

function finishOnboarding() {
  state.onboarded = true;
  state.currentScreen = 'timer';
  save();
  document.getElementById('bottom-nav').style.display = 'flex';
  showRaw('timer');
  renderTimerTasks();
  renderStreakDots();
}

function switchMode(mode, btn) {
  if (state.timer.running) { clearInterval(timerInterval); timerInterval = null; state.timer.running = false; }
  state.timer.mode = mode;
  const d = state.timer.durations;
  const mins = { focus: d.focus, short: d.short, long: d.long }[mode];
  state.timer.timeLeft = mins * 60;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const labels = { focus:'FOCUS TIME', short:'PAUSE COURTE', long:'GRANDE PAUSE' };
  document.getElementById('timer-mode-label').textContent = labels[mode];
  const colors = { focus:'#E5534B', short:'#22C55E', long:'#3B82F6' };
  document.getElementById('timer-ring').style.stroke = colors[mode];
  document.getElementById('play-btn').style.background = colors[mode];
  document.getElementById('play-btn').style.boxShadow = `0 4px 20px ${colors[mode]}66`;
  updateTimerDisplay();
  updatePlayIcon(false);
  save();
}

function toggleTimer() {
  if (state.timer.running) {
    clearInterval(timerInterval); timerInterval = null;
    state.timer.running = false;
    updatePlayIcon(false);
  } else {
    state.timer.running = true;
    updatePlayIcon(true);
    timerInterval = setInterval(tick, 1000);
  }
  save();
}

function tick() {
  if (state.timer.timeLeft <= 0) {
    clearInterval(timerInterval); timerInterval = null;
    state.timer.running = false;
    updatePlayIcon(false);
    if (state.timer.mode === 'focus') {
      state.timer.sessions++;
      state.timer.totalSessions++;
      state.timer.totalMinutes += state.timer.durations.focus;

      const today = new Date().toISOString().split('T')[0];
      state.history[today] = (state.history[today] || 0) + 1;

      const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
      if (state.timer.lastDate === today) {}
      else if (state.timer.lastDate === yesterday) { state.timer.streakDays++; }
      else { state.timer.streakDays = 1; }
      state.timer.lastDate = today;
      renderStreakDots();
      renderSessionCount();
      updateSessionIndicator();
      if (state.timer.sound) playBeep();

      const mode = state.timer.sessions % 4 === 0 ? 'long' : 'short';
      const btn = document.getElementById('tab-'+mode);
      switchMode(mode, btn);
    } else {
      if (state.timer.sound) playBeep();
      const btn = document.getElementById('tab-focus');
      switchMode('focus', btn);
    }
    save();
    return;
  }
  state.timer.timeLeft--;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const t = state.timer.timeLeft;
  const m = Math.floor(t/60);
  const s = t % 60;
  document.getElementById('timer-display').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const mode = state.timer.mode;
  const d = state.timer.durations;
  const total = { focus: d.focus*60, short: d.short*60, long: d.long*60 }[mode];
  const progress = 1 - t / total;
  document.getElementById('timer-ring').style.strokeDashoffset = CIRC * (1 - progress);
}

function updatePlayIcon(playing) {
  document.getElementById('play-icon').outerHTML = playing
    ? `<svg id="play-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg id="play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

function skipTimer() {
  clearInterval(timerInterval); timerInterval = null;
  state.timer.running = false;
  updatePlayIcon(false);
  const modes = ['focus','short','long'];
  const next = modes[(modes.indexOf(state.timer.mode)+1)%3];
  const btn = document.getElementById('tab-'+next);
  switchMode(next, btn);
}

function resetTimer() {
  clearInterval(timerInterval); timerInterval = null;
  state.timer.running = false;
  updatePlayIcon(false);
  const d = state.timer.durations;
  const mins = { focus: d.focus, short: d.short, long: d.long }[state.timer.mode];
  state.timer.timeLeft = mins * 60;
  updateTimerDisplay();
  save();
}

function renderStreakDots() {
  const goal = state.timer.goal || 8;
  const done = state.timer.sessions;
  let html = '';
  for (let i = 0; i < goal; i++) {
    html += `<div class="streak-dot${i<done?' done':''}"></div>`;
  }
  document.getElementById('streak-dots').innerHTML = html;
}

function renderSessionCount() {
  const n = state.timer.sessions;
  document.getElementById('session-count').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>${n} session${n!==1?'s':''} complétée${n!==1?'s':''}</span>`;
}

function updateSessionIndicator() {}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.6);
    osc.start(); osc.stop(ctx.currentTime+0.6);
  } catch(e) {}
}

function renderTimerTasks() {
  const active = state.tasks.filter(t => !t.done).slice(0,3);
  const wrap = document.getElementById('timer-tasks');
  const empty = document.getElementById('empty-tasks');
  if (active.length === 0) { wrap.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  wrap.innerHTML = active.map(t => `
    <div class="task-preview-card" onclick="showScreen('tasks')">
      <div class="task-color-bar" style="background:${t.color}"></div>
      <div class="task-info">
        <div class="task-name">${esc(t.title)}</div>
        <div class="task-meta">${t.cat} · ${t.subsDone}/${t.subs} sous-tâches</div>
      </div>
      <div class="task-check${t.done?' done':''}" onclick="event.stopPropagation();toggleTask(${t.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    </div>`).join('');
}

function renderTasks() {
  const active = state.tasks.filter(t => !t.done);
  const done = state.tasks.filter(t => t.done);
  document.getElementById('active-count').textContent = active.length;
  document.getElementById('done-count').textContent = done.length;
  const list = taskTab === 'active' ? active : done;
  const emptyIcon = taskTab === 'active' ? '🎉' : '📭';
  const emptyText = taskTab === 'active' ? 'Toutes les tâches sont terminées !' : 'Aucune tâche terminée';
  document.getElementById('tasks-list').innerHTML = list.length ? list.map(taskHTML).join('') : `
    <div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:40px;margin-bottom:12px;">${emptyIcon}</div>
      <div style="font-weight:700;font-size:15px;">${emptyText}</div>
    </div>`;
}

function taskHTML(t) {
  const pct = t.subs > 0 ? Math.round(t.subsDone/t.subs*100) : 0;
  const colors = { high:'#FEE2E2', normal:'#F1F5F9', low:'#F0FDF4' };
  const textColors = { high:'#B91C1C', normal:'#475569', low:'#15803D' };
  const labels = { high:'Urgent', normal:'Normal', low:'Faible' };
  return `<div class="task-item">
    <div class="task-cat-bar" style="background:${t.color}"></div>
    <div class="task-body">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="task-title" style="${t.done?'text-decoration:line-through;color:var(--muted);':''}">${esc(t.title)}</div>
        <span class="task-priority" style="background:${colors[t.priority]};color:${textColors[t.priority]};flex-shrink:0;">${labels[t.priority]}</span>
      </div>
      <div class="task-tags"><span class="tag" style="background:${t.color}22;color:${t.color};">${t.cat}</span></div>
      ${t.subs > 0 ? `<div class="task-progress">
        <div class="progress-label">${t.subsDone}/${t.subs} sous-tâches · ${pct}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${t.color};"></div></div>
      </div>` : ''}
    </div>
    <div class="task-done-check${t.done?' done':''}" onclick="toggleTask(${t.id})">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${t.done?'#fff':'var(--muted)'}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
  </div>`;
}

function toggleTask(id) {
  const t = state.tasks.find(t=>t.id===id);
  if (!t) return;
  t.done = !t.done;
  if (t.done && t.subs > 0) t.subsDone = t.subs;
  save();
  renderTasks();
  renderTimerTasks();
}

function switchTaskTab(tab) {
  taskTab = tab;
  document.getElementById('ttab-active').classList.toggle('active', tab==='active');
  document.getElementById('ttab-done').classList.toggle('active', tab==='done');
  renderTasks();
}

function openAddTask() {
  newTaskColor = '#E5534B'; newTaskCat = 'Travail';
  document.getElementById('task-input').value = '';
  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = COLORS.map(c=>`<div class="swatch${c===newTaskColor?' selected':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`).join('');
  const cats = document.getElementById('cat-select');
  cats.innerHTML = CATS.map(c=>`<button class="cat-btn${c===newTaskCat?' active':''}" onclick="selectCat('${c}')">${c}</button>`).join('');
  document.getElementById('add-task-modal').classList.add('open');
  setTimeout(()=>document.getElementById('task-input').focus(),300);
}

function closeAddTask() { document.getElementById('add-task-modal').classList.remove('open'); }
function closeModal(e) { if (e.target.id==='add-task-modal') closeAddTask(); }

function selectColor(c) {
  newTaskColor = c;
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected',s.style.background===c||s.style.backgroundColor===c));
}

function selectCat(c) {
  newTaskCat = c;
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('active',b.textContent===c));
}

function saveTask() {
  const title = document.getElementById('task-input').value.trim();
  if (!title) { document.getElementById('task-input').focus(); return; }
  const id = Date.now();
  state.tasks.unshift({ id, title, cat: newTaskCat, color: newTaskColor, done: false, subs: 0, subsDone: 0, priority: 'normal' });
  save();
  closeAddTask();
  renderTasks();
  renderTimerTasks();
}

function renderSettings() {
  const d = state.timer.durations;
  renderChips('focus', [15,25,50], d.focus);
  renderChips('short', [5,10,15], d.short);
  renderChips('long', [10,15,30], d.long);

  document.getElementById('goal-val').textContent = state.timer.goal;
  document.getElementById('dark-toggle').checked = state.darkMode;
  document.getElementById('sound-toggle').checked = state.timer.sound;

  document.getElementById('prof-tasks').textContent = state.tasks.length;
  document.getElementById('prof-sessions').textContent = state.timer.totalSessions;
  document.getElementById('prof-mins').textContent = state.timer.totalMinutes;
}

function renderChips(key, opts, val) {
  document.getElementById('chips-'+key).innerHTML = opts.map(v=>`
    <button class="preset-chip${v===val?' active':''}" onclick="setDuration('${key}',${v})">${v}</button>
  `).join('');
}

function setDuration(key, val) {
  state.timer.durations[key] = val;
  renderChips(key, key==='focus'?[15,25,50]:key==='short'?[5,10,15]:[10,15,30], val);
  if (state.timer.mode===key && !state.timer.running) {
    state.timer.timeLeft = val*60;
    updateTimerDisplay();
  }
  save();
}

function toggleDarkMode(cb) {
  state.darkMode = cb.checked;
  document.documentElement.setAttribute('data-dark', state.darkMode?'true':'false');
  save();
}

function adjGoal(d) {
  state.timer.goal = Math.max(1, Math.min(20, (state.timer.goal||8)+d));
  document.getElementById('goal-val').textContent = state.timer.goal;
  renderStreakDots();
  save();
}

function saveSetting(key, val) {
  state.timer[key] = val; save();
}

function toggleWakeLock(cb) {
  if (cb.checked && 'wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(l=>{ wakeLock=l; }).catch(()=>{});
  } else if (wakeLock) { wakeLock.release(); wakeLock=null; }
}

function renderReports() {
  document.getElementById('total-sessions').textContent = state.timer.totalSessions;
  document.getElementById('total-minutes').textContent = state.timer.totalMinutes;
  document.getElementById('streak-days').textContent = state.timer.streakDays;
  document.getElementById('tasks-done').textContent = state.tasks.filter(t=>t.done).length;
  renderWeekChart();
  renderHeatmap();
}

function renderWeekChart() {
  const days = ['L','M','M','J','V','S','D'];
  const now = new Date();
  const data = days.map((_,i)=>{
    const d = new Date(now);
    d.setDate(d.getDate() - (6-i));
    const key = d.toISOString().split('T')[0];
    return { label: days[i], val: state.history[key]||0 };
  });
  const max = Math.max(...data.map(d=>d.val), 1);
  document.getElementById('week-chart').innerHTML = data.map(d=>`
    <div class="chart-bar-item">
      <span class="chart-bar-label">${d.label}</span>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width:${Math.round(d.val/max*100)}%"></div>
      </div>
      <span class="chart-bar-val">${d.val}</span>
    </div>`).join('');
}

function renderHeatmap() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const offset = (firstDay + 6) % 7;

  let cells = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ d, n: state.history[key]||0 });
  }
  const maxN = Math.max(...cells.filter(Boolean).map(c=>c.n), 1);
  document.getElementById('heatmap').innerHTML = cells.map(c=>{
    if (!c) return '<div class="heat-cell"></div>';
    const lvl = c.n===0?'':c.n/maxN<0.25?'h1':c.n/maxN<0.5?'h2':c.n/maxN<0.75?'h3':'h4';
    return `<div class="heat-cell ${lvl}" title="${c.d}: ${c.n} sessions"></div>`;
  }).join('');
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

init();