/* ========== Змейка · SKLN 2026 · FINAL FIX ========== */

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { desynchronized: true, alpha: false });

const COLORS = { bg:'', fg:'', grid:'', snake:'', food:'', accent:'' };
function refreshColors(){
  const s = getComputedStyle(document.body);
  COLORS.bg = s.getPropertyValue('--bg').trim();
  COLORS.fg = s.getPropertyValue('--fg').trim();
  COLORS.grid = s.getPropertyValue('--grid').trim();
  COLORS.snake = s.getPropertyValue('--snake').trim();
  COLORS.food = s.getPropertyValue('--food').trim();
  COLORS.accent = s.getPropertyValue('--accent').trim();
}

const STATE = {
  cell: 20, cols: 20, rows: 20,
  snake: [], dir: {x:1,y:0}, nextDir: {x:1,y:0},
  food: {x:10,y:10}, score:0, best:0,
  running:false, paused:false, gameOver:false,
  speed:140, lastTime:0, accumulator:0,
  sound:true, theme:'dark',
  profile:'Игрок 1', profiles:{},
  controlScheme:'dpad',
  joystickSide:'left',
  history:[],
  animFrame:null,
  idleTimer:null,
  dirty:true,
  version:null // НОВОЕ: данные версии
};

// ===== НОВОЕ: Загрузка версии из version.json =====
async function loadVersion(){
  try{
    const r = await fetch('version.json?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok) throw new Error('no version.json');
    STATE.version = await r.json();
    renderVersion();
  }catch(e){
    STATE.version = {version:'1.0.0', commit:'local', date:new Date().toISOString(), message:'Локальная сборка'};
    renderVersion();
  }
}

function renderVersion(){
  const v = STATE.version;
  if(!v) return;
  
  const date = new Date(v.date);
  const dateStr = date.toLocaleDateString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric'
  });
  const timeStr = date.toLocaleTimeString('ru-RU', {
    hour:'2-digit', minute:'2-digit'
  });
  
  // Определяем репозиторий для ссылки на коммит
  const repoUrl = getRepoUrl();
  const commitLink = repoUrl && v.commit !== 'local'
    ? `<a href="${repoUrl}/commit/${v.commit}" target="_blank" rel="noopener">${v.commit}</a>`
    : `<span>${v.commit}</span>`;
  
  const splashEl = $('splash-version');
  if(splashEl){
    splashEl.innerHTML = `
      <div class="v-row">
        <span class="v-label">Версия</span>
        <span class="v-value v-version">v${v.version}</span>
      </div>
      <div class="v-row">
        <span class="v-label">Коммит</span>
        <span class="v-value">${commitLink}</span>
      </div>
      <div class="v-row">
        <span class="v-label">Дата</span>
        <span class="v-value">${dateStr}, ${timeStr}</span>
      </div>
      <div class="v-row">
        <span class="v-label">Описание</span>
        <span class="v-value">${escapeHtml(v.message || '—')}</span>
      </div>
    `;
  }
  
  // Обновляем футер
  const footer = $('footer-version');
  if(footer){
    footer.textContent = `SKLN · 2026 · v${v.version} · ${v.commit}`;
  }
}

function getRepoUrl(){
  // Пытаемся определить GitHub Pages URL
  const host = window.location.hostname;
  if(host.endsWith('github.io')){
    const parts = host.replace('.github.io','');
    const path = window.location.pathname.split('/')[1];
    return `https://github.com/${parts}/${path}`;
  }
  return null;
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Запускаем загрузку версии сразу
loadVersion();

// ===== Заставка =====
setTimeout(() => {
  $('splash').classList.add('done');
  $('app').classList.remove('hidden');
  refreshColors();
  resizeCanvas();
  showOverlay('Готовы?', 'Нажмите «Старт» или пробел');
}, 10000);

function resizeCanvas(){
  const stage = document.querySelector('.stage');
  const maxW = stage.clientWidth - 16;
  const maxH = stage.clientHeight - 16;
  const cell = Math.max(10, Math.floor(Math.min(maxW/20, maxH/20)));
  STATE.cell = cell;
  canvas.width = cell * STATE.cols;
  canvas.height = cell * STATE.rows;
  STATE.dirty = true;
  scheduleIdleDraw();
}
window.addEventListener('resize', resizeCanvas);

function scheduleIdleDraw(){
  if(STATE.idleTimer) clearInterval(STATE.idleTimer);
  STATE.idleTimer = setInterval(()=>{
    if(!STATE.running && STATE.dirty){
      draw();
      STATE.dirty = false;
    }
  }, 100);
}

function saveAll(){
  const data = {
    profiles: STATE.profiles,
    currentProfile: STATE.profile,
    theme: STATE.theme,
    sound: STATE.sound,
    controlScheme: STATE.controlScheme,
    joystickSide: STATE.joystickSide,
    history: STATE.history
  };
  try{ localStorage.setItem('snake_save', JSON.stringify(data)); }catch(e){}
}
function loadAll(){
  try{
    const raw = localStorage.getItem('snake_save');
    if(!raw) return;
    const d = JSON.parse(raw);
    STATE.profiles = d.profiles || {};
    STATE.profile = d.currentProfile || 'Игрок 1';
    STATE.theme = d.theme || 'dark';
    STATE.sound = d.sound !== false;
    STATE.controlScheme = d.controlScheme || 'dpad';
    STATE.joystickSide = d.joystickSide || 'left';
    STATE.history = d.history || [];
    document.body.dataset.theme = STATE.theme;
    $('theme').value = STATE.theme;
    $('btn-sound').textContent = STATE.sound ? '🔊' : '🔇';
    refreshColors();
    loadProfile();
    renderProfiles();
    applyControlScheme();
  }catch(e){console.warn('load fail',e)}
}
function loadProfile(){
  const p = STATE.profiles[STATE.profile] || {best:0};
  STATE.best = p.best || 0;
  STATE.score = 0;
  $('best').textContent = STATE.best;
  $('score').textContent = 0;
}
function saveProfile(){
  if(!STATE.profiles[STATE.profile]) STATE.profiles[STATE.profile] = {best:0};
  STATE.profiles[STATE.profile].best = STATE.best;
  saveAll();
}
function renderProfiles(){
  const sel = $('profile');
  sel.innerHTML = '';
  Object.keys(STATE.profiles).forEach(name=>{
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    if(name === STATE.profile) o.selected = true;
    sel.appendChild(o);
  });
  const add = document.createElement('option');
  add.value = '__new__'; add.textContent = '+ Новый профиль';
  sel.appendChild(add);
}

$('btn-export').addEventListener('click', (e) => {
  e.stopPropagation();
  const data = { profiles: STATE.profiles, history: STATE.history };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `snake-save-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  beep(880, .1);
});

$('btn-import').addEventListener('click', (e) => {
  e.stopPropagation();
  $('file-import').click();
});

$('file-import').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      if(data.profiles) STATE.profiles = data.profiles;
      if(data.history) STATE.history = data.history;
      saveAll(); renderProfiles(); loadProfile();
      showOverlay('Импорт ✓', 'Данные загружены');
      setTimeout(hideOverlay, 1500);
      beep(660, .15);
    }catch(err){ alert('Ошибка файла'); }
  };
  r.readAsText(f);
  e.target.value = '';
});

$('profile').addEventListener('change', e => {
  if(e.target.value === '__new__'){
    const name = prompt('Имя профиля:', 'Игрок '+(Object.keys(STATE.profiles).length+1));
    if(!name){ renderProfiles(); return; }
    STATE.profiles[name] = {best:0};
    STATE.profile = name;
    saveAll(); renderProfiles(); loadProfile();
  } else {
    STATE.profile = e.target.value;
    saveAll(); loadProfile();
    resetGame();
  }
});

$('theme').addEventListener('change', e => {
  STATE.theme = e.target.value;
  document.body.dataset.theme = STATE.theme;
  refreshColors();
  saveAll();
  STATE.dirty = true;
  draw();
});

let audioCtx;
function beep(freq=440, dur=.1, type='square'){
  if(!STATE.sound) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = .08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime+dur);
    o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
$('btn-sound').addEventListener('click', () => {
  STATE.sound = !STATE.sound;
  $('btn-sound').textContent = STATE.sound ? '🔊' : '🔇';
  saveAll();
});

function changeDirection(newDir){
  if(newDir.x === -STATE.dir.x && newDir.y === -STATE.dir.y) return;
  STATE.dir = newDir;
  STATE.nextDir = newDir;
}

function gameLoop(timestamp){
  if(!STATE.running || STATE.paused){
    STATE.animFrame = null;
    return;
  }
  if(!STATE.lastTime) STATE.lastTime = timestamp;
  const delta = timestamp - STATE.lastTime;
  STATE.lastTime = timestamp;
  STATE.accumulator += delta;
  
  let steps = 0;
  while(STATE.accumulator >= STATE.speed && steps < 5){
    step();
    STATE.accumulator -= STATE.speed;
    steps++;
  }
  if(STATE.accumulator > STATE.speed * 5) STATE.accumulator = 0;
  
  draw();
  STATE.animFrame = requestAnimationFrame(gameLoop);
}

function resetGame(){
  STATE.snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  STATE.dir = {x:1,y:0}; STATE.nextDir = {x:1,y:0};
  STATE.score = 0; STATE.speed = 140;
  STATE.gameOver = false; STATE.paused = false;
  STATE.accumulator = 0; STATE.lastTime = 0;
  $('score').textContent = 0;
  placeFood();
  STATE.dirty = true;
  draw();
}
function placeFood(){
  const occupied = new Set(STATE.snake.map(s => s.x + ',' + s.y));
  let f;
  do {
    f = {x: Math.floor(Math.random()*STATE.cols), y: Math.floor(Math.random()*STATE.rows)};
  } while(occupied.has(f.x + ',' + f.y));
  STATE.food = f;
}
function step(){
  const head = {x: STATE.snake[0].x + STATE.dir.x, y: STATE.snake[0].y + STATE.dir.y};
  head.x = (head.x + STATE.cols) % STATE.cols;
  head.y = (head.y + STATE.rows) % STATE.rows;

  for(let i = 0; i < STATE.snake.length; i++){
    if(STATE.snake[i].x === head.x && STATE.snake[i].y === head.y){
      gameOver(); return;
    }
  }

  STATE.snake.unshift(head);

  if(head.x === STATE.food.x && head.y === STATE.food.y){
    STATE.score++;
    $('score').textContent = STATE.score;
    if(STATE.score > STATE.best){
      STATE.best = STATE.score;
      $('best').textContent = STATE.best;
      saveProfile();
    }
    placeFood();
    beep(880, .08, 'sine');
    if(STATE.speed > 70) STATE.speed -= 3;
  } else {
    STATE.snake.pop();
  }
}
function gameOver(){
  STATE.running = false; STATE.gameOver = true;
  if(STATE.animFrame){ cancelAnimationFrame(STATE.animFrame); STATE.animFrame = null; }
  beep(120, .4, 'sawtooth');
  
  const result = {
    profile: STATE.profile,
    score: STATE.score,
    date: new Date().toISOString(),
    timestamp: Date.now()
  };
  STATE.history.unshift(result);
  if(STATE.history.length > 50) STATE.history.length = 50;
  saveAll();
  
  showGameOverDialog();
}

function showGameOverDialog(){
  const modal = document.createElement('div');
  modal.className = 'settings-modal';
  modal.innerHTML = `
    <div class="settings-box">
      <h2>🎮 Игра окончена!</h2>
      <p style="margin:1rem 0; font-size:1.2rem">Ваш счёт: <b style="color:var(--accent)">${STATE.score}</b></p>
      <div class="setting-group">
        <label>Сохранить результат для игрока:</label>
        <input type="text" id="save-name" value="${STATE.profile}" />
      </div>
      <div class="settings-actions">
        <button class="btn" id="btn-gameover-close">Закрыть</button>
        <button class="btn primary" id="btn-gameover-save">Сохранить и начать заново</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('#btn-gameover-close').addEventListener('click', () => {
    modal.remove();
    showOverlay('Игра окончена', 'Нажмите «Старт» для новой игры');
    STATE.dirty = true;
    scheduleIdleDraw();
  });
  modal.querySelector('#btn-gameover-save').addEventListener('click', () => {
    const name = modal.querySelector('#save-name').value.trim();
    if(name && name !== STATE.profile){
      if(!STATE.profiles[name]) STATE.profiles[name] = {best:0};
      if(STATE.score > (STATE.profiles[name].best || 0)){
        STATE.profiles[name].best = STATE.score;
      }
      STATE.profile = name;
      saveAll(); renderProfiles(); loadProfile();
    }
    modal.remove();
    resetGame();
    startGame();
  });
}

$('btn-start').addEventListener('click', (e) => {
  e.stopPropagation();
  startGame();
});

$('btn-reset').addEventListener('click', (e) => {
  e.stopPropagation();
  if(STATE.animFrame){ cancelAnimationFrame(STATE.animFrame); STATE.animFrame = null; }
  STATE.running = false;
  resetGame();
  showOverlay('Готовы?', 'Нажмите «Старт»');
  scheduleIdleDraw();
});

$('btn-pause').addEventListener('click', () => {
  togglePause();
});

function startGame(){
  if(STATE.gameOver || !STATE.snake.length) resetGame();
  STATE.running = true; STATE.paused = false;
  STATE.lastTime = 0; STATE.accumulator = 0;
  if(STATE.idleTimer){ clearInterval(STATE.idleTimer); STATE.idleTimer = null; }
  hideOverlay();
  if(!STATE.animFrame) STATE.animFrame = requestAnimationFrame(gameLoop);
}

function togglePause(){
  if(!STATE.running){ startGame(); return; }
  STATE.paused = !STATE.paused;
  if(STATE.paused){
    showOverlay('Пауза', 'Нажмите ▶ для продолжения');
    STATE.dirty = true;
    scheduleIdleDraw();
  } else {
    hideOverlay();
    STATE.lastTime = 0;
    if(!STATE.animFrame) STATE.animFrame = requestAnimationFrame(gameLoop);
  }
}

function showOverlay(t, p){
  $('overlay-title').textContent = t;
  $('overlay-text').textContent = p;
  $('overlay').classList.remove('hidden');
}
function hideOverlay(){ $('overlay').classList.add('hidden'); }

function draw(){
  const c = STATE.cell;
  const w = canvas.width, h = canvas.height;
  
  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i = 0; i <= STATE.cols; i++){
    const x = i * c + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for(let i = 0; i <= STATE.rows; i++){
    const y = i * c + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();

  const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.08;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(STATE.food.x * c + c/2, STATE.food.y * c + c/2, c * 0.35 * pulse, 0, Math.PI * 2);
  ctx.fill();

  const snakeLen = STATE.snake.length;
  if(snakeLen > 1){
    ctx.fillStyle = COLORS.snake;
    ctx.beginPath();
    for(let i = 1; i < snakeLen; i++){
      const s = STATE.snake[i];
      const x = s.x * c + 1, y = s.y * c + 1, sz = c - 2;
      ctx.moveTo(x + 3, y);
      ctx.arcTo(x + sz, y, x + sz, y + sz, 3);
      ctx.arcTo(x + sz, y + sz, x, y + sz, 3);
      ctx.arcTo(x, y + sz, x, y, 3);
      ctx.arcTo(x, y, x + sz, y, 3);
    }
    ctx.fill();
  }
  
  if(snakeLen > 0){
    const head = STATE.snake[0];
    ctx.fillStyle = COLORS.accent;
    const x = head.x * c + 1, y = head.y * c + 1, sz = c - 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.arcTo(x + sz, y, x + sz, y + sz, 4);
    ctx.arcTo(x + sz, y + sz, x, y + sz, 4);
    ctx.arcTo(x, y + sz, x, y, 4);
    ctx.arcTo(x, y, x + sz, y, 4);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    const ex = head.x * c + c/2 + STATE.dir.x * c * 0.2;
    const ey = head.y * c + c/2 + STATE.dir.y * c * 0.2;
    ctx.beginPath();
    ctx.arc(ex - STATE.dir.y * 3, ey + STATE.dir.x * 3, 2, 0, Math.PI * 2);
    ctx.arc(ex + STATE.dir.y * 3, ey - STATE.dir.x * 3, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

document.addEventListener('keydown', e => {
  const k = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  if(k === ' '){ togglePause(); return; }
  const map = {
    ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1},
    ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
    w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0},
    W:{x:0,y:-1}, S:{x:0,y:1}, A:{x:-1,y:0}, D:{x:1,y:0}
  };
  if(map[k]) changeDirection(map[k]);
}, {passive:false});

let touchStart = null;
canvas.addEventListener('touchstart', e => {
  if(STATE.controlScheme === 'swipe' || STATE.controlScheme === 'hybrid'){
    touchStart = {x: e.touches[0].clientX, y: e.touches[0].clientY};
  }
}, {passive:true});
canvas.addEventListener('touchend', e => {
  if(!touchStart) return;
  if(STATE.controlScheme !== 'swipe' && STATE.controlScheme !== 'hybrid') return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if(Math.abs(dx) < 20 && Math.abs(dy) < 20){ touchStart = null; return; }
  let d;
  if(Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? {x:1,y:0} : {x:-1,y:0};
  else d = dy > 0 ? {x:0,y:1} : {x:0,y:-1};
  changeDirection(d);
  touchStart = null;
}, {passive:true});

document.addEventListener('click', e => {
  if(e.target.closest('.overlay')) return;
  const dirBtn = e.target.closest('[data-dir]');
  if(dirBtn){
    e.preventDefault();
    const map = {up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}};
    changeDirection(map[dirBtn.dataset.dir]);
    return;
  }
  const turnBtn = e.target.closest('[data-turn]');
  if(turnBtn){
    e.preventDefault();
    const turn = turnBtn.dataset.turn;
    if(turn === 'left'){
      const d = STATE.dir.x === 0 ? {x:STATE.dir.y,y:0} : {x:0,y:-STATE.dir.x};
      changeDirection(d);
    } else {
      const d = STATE.dir.x === 0 ? {x:-STATE.dir.y,y:0} : {x:0,y:STATE.dir.x};
      changeDirection(d);
    }
  }
});

document.addEventListener('touchstart', e => {
  if(e.target.closest('.overlay')) return;
  const dirBtn = e.target.closest('[data-dir]');
  if(dirBtn){
    e.preventDefault();
    const map = {up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}};
    changeDirection(map[dirBtn.dataset.dir]);
    return;
  }
  const turnBtn = e.target.closest('[data-turn]');
  if(turnBtn){
    e.preventDefault();
    const turn = turnBtn.dataset.turn;
    if(turn === 'left'){
      const d = STATE.dir.x === 0 ? {x:STATE.dir.y,y:0} : {x:0,y:-STATE.dir.x};
      changeDirection(d);
    } else {
      const d = STATE.dir.x === 0 ? {x:-STATE.dir.y,y:0} : {x:0,y:STATE.dir.x};
      changeDirection(d);
    }
  }
}, {passive:false});

function applyControlScheme(){
  const bottom = $('controls-bottom');
  bottom.innerHTML = '';
  document.querySelectorAll('.tap-zones-overlay').forEach(el => el.remove());
  
  const scheme = STATE.controlScheme;
  
  if(scheme === 'dpad' || scheme === 'hybrid'){
    const dpad = document.createElement('div');
    dpad.className = 'dpad';
    dpad.innerHTML = `
      <button class="up" data-dir="up">▲</button>
      <button class="left" data-dir="left">◀</button>
      <button class="right" data-dir="right">▶</button>
      <button class="down" data-dir="down">▼</button>
    `;
    bottom.appendChild(dpad);
  }
  
  if(scheme === 'joystick'){
    const zone = document.createElement('div');
    zone.className = 'joystick-zone';
    zone.innerHTML = '<div class="joystick-knob"></div>';
    if(STATE.joystickSide === 'right') zone.style.marginLeft = 'auto';
    bottom.appendChild(zone);
    initJoystick(zone);
  }
  
  if(scheme === 'tapzones'){
    const zones = document.createElement('div');
    zones.className = 'tap-zones-overlay active';
    zones.innerHTML = `
      <div class="top" data-dir="up">▲</div>
      <div class="left" data-dir="left">◀</div>
      <div class="right" data-dir="right">▶</div>
      <div class="bottom" data-dir="down">▼</div>
    `;
    document.querySelector('.stage').appendChild(zones);
  }
  
  if(scheme === 'turns'){
    const btns = document.createElement('div');
    btns.className = 'turn-btns';
    btns.innerHTML = `
      <button data-turn="left">◀</button>
      <button data-turn="right">▶</button>
    `;
    bottom.appendChild(btns);
  }
}

function initJoystick(zone){
  const knob = zone.querySelector('.joystick-knob');
  let active = false, startX, startY, lastDir = null;
  const maxDist = 45;
  
  function update(touch){
    let dx = touch.clientX - startX;
    let dy = touch.clientY - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist > maxDist){
      dx = dx/dist*maxDist;
      dy = dy/dist*maxDist;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    if(dist > 20){
      let newDir;
      if(Math.abs(dx) > Math.abs(dy)){
        newDir = dx > 0 ? {x:1,y:0} : {x:-1,y:0};
      } else {
        newDir = dy > 0 ? {x:0,y:1} : {x:0,y:-1};
      }
      if(!lastDir || lastDir.x !== newDir.x || lastDir.y !== newDir.y){
        changeDirection(newDir);
        lastDir = newDir;
      }
    }
  }
  
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    active = true; lastDir = null;
    const rect = zone.getBoundingClientRect();
    startX = rect.left + rect.width/2;
    startY = rect.top + rect.height/2;
    update(e.touches[0]);
  }, {passive:false});
  
  zone.addEventListener('touchmove', e => {
    if(!active) return;
    e.preventDefault();
    update(e.touches[0]);
  }, {passive:false});
  
  zone.addEventListener('touchend', e => {
    active = false; lastDir = null;
    knob.style.transform = 'translate(-50%, -50%)';
  });
  
  zone.addEventListener('mousedown', e => {
    e.preventDefault();
    active = true; lastDir = null;
    const rect = zone.getBoundingClientRect();
    startX = rect.left + rect.width/2;
    startY = rect.top + rect.height/2;
    update(e);
    
    const moveHandler = e => { if(active) update(e); };
    const upHandler = () => {
      active = false; lastDir = null;
      knob.style.transform = 'translate(-50%, -50%)';
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  });
}

$('btn-menu').addEventListener('click', () => {
  const modal = document.createElement('div');
  modal.className = 'settings-modal';
  
  let historyHTML = '';
  if(STATE.history.length > 0){
    historyHTML = '<div class="history-list">';
    STATE.history.slice(0, 10).forEach(h => {
      const date = new Date(h.date);
      const dateStr = date.toLocaleDateString('ru-RU');
      const timeStr = date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
      historyHTML += `
        <div class="history-item">
          <span>${h.profile}</span>
          <span class="date">${dateStr} ${timeStr}</span>
          <span class="score">${h.score}</span>
        </div>
      `;
    });
    historyHTML += '</div>';
  }
  
  // Информация о версии
  const v = STATE.version || {version:'?', commit:'?', date:new Date().toISOString(), message:''};
  const vDate = new Date(v.date);
  const vInfoHtml = `
    <div class="setting-group" style="padding:.8rem; background:rgba(255,255,255,.03); border-radius:10px; font-size:.8rem; line-height:1.6">
      <label style="margin-bottom:.3rem">📦 Текущая версия</label>
      <div><b style="color:var(--accent)">v${v.version}</b> · коммит <code>${v.commit}</code></div>
      <div style="opacity:.7">${vDate.toLocaleDateString('ru-RU')} ${vDate.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</div>
      ${v.message ? `<div style="opacity:.6; font-style:italic; margin-top:.3rem">"${escapeHtml(v.message)}"</div>` : ''}
    </div>
  `;
  
  modal.innerHTML = `
    <div class="settings-box">
      <h2>⚙ Настройки</h2>
      ${vInfoHtml}
      <div class="setting-group">
        <label>Схема управления</label>
        <select id="sel-control">
          <option value="dpad">1. D-Pad (крестовина)</option>
          <option value="swipe">2. Свайпы по полю</option>
          <option value="joystick">3. Виртуальный джойстик</option>
          <option value="tapzones">4. Тап-зоны экрана</option>
          <option value="turns">5. Повороты ◀ ▶</option>
          <option value="hybrid">6. Гибрид (свайпы + D-Pad)</option>
        </select>
      </div>
      <div class="setting-group" id="joystick-side-group" style="${STATE.controlScheme === 'joystick' ? '' : 'display:none'}">
        <label>Позиция джойстика</label>
        <select id="sel-joystick-side">
          <option value="left">Слева (для левой руки)</option>
          <option value="right">Справа (для правой руки)</option>
        </select>
      </div>
      ${STATE.history.length > 0 ? `
        <div class="setting-group">
          <label>Последние результаты (топ-10)</label>
          ${historyHTML}
        </div>
      ` : ''}
      <div class="settings-actions">
        <button class="btn" id="btn-settings-close">Закрыть</button>
        <button class="btn primary" id="btn-settings-save">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const selControl = modal.querySelector('#sel-control');
  const selSide = modal.querySelector('#sel-joystick-side');
  const sideGroup = modal.querySelector('#joystick-side-group');
  
  selControl.value = STATE.controlScheme;
  selSide.value = STATE.joystickSide;
  
  selControl.addEventListener('change', () => {
    if(selControl.value === 'joystick'){
      sideGroup.style.display = '';
    } else {
      sideGroup.style.display = 'none';
    }
  });
  
  modal.querySelector('#btn-settings-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#btn-settings-save').addEventListener('click', () => {
    STATE.controlScheme = selControl.value;
    STATE.joystickSide = selSide.value;
    saveAll();
    applyControlScheme();
    modal.remove();
  });
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
});

loadAll();
if(!Object.keys(STATE.profiles).length){
  STATE.profiles['Игрок 1'] = {best:0};
  saveAll(); renderProfiles();
}
resetGame();
scheduleIdleDraw();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
