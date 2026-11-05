/* ========== Змейка · SKLN 2026 · v1.0 · OPTIMIZED ========== */

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');

// ----- Состояние -----
const STATE = {
  cell: 20, cols: 20, rows: 20,
  snake: [], dir: {x:1,y:0}, nextDir: {x:1,y:0},
  food: {x:10,y:10}, score:0, best:0,
  running:false, paused:false, gameOver:false,
  speed:140, lastTime:0, accumulator:0,
  sound:true, theme:'dark',
  profile:'Игрок 1', profiles:{},
  controlScheme:'dpad', // dpad, swipe, joystick, tapzones, turns, hybrid
  animFrame:null
};

// ----- Заставка -----
setTimeout(() => {
  $('splash').classList.add('hidden');
  $('app').classList.remove('hidden');
  resizeCanvas();
  showOverlay('Готовы?', 'Нажмите «Старт» или пробел');
}, 10000);

// ----- Canvas: адаптивный размер -----
function resizeCanvas(){
  const stage = document.querySelector('.stage');
  const maxW = stage.clientWidth - 16;
  const maxH = stage.clientHeight - 16;
  const cell = Math.max(10, Math.floor(Math.min(maxW/20, maxH/20)));
  STATE.cell = cell;
  canvas.width = cell * STATE.cols;
  canvas.height = cell * STATE.rows;
  draw();
}
window.addEventListener('resize', resizeCanvas);

// ----- Сохранение / загрузка -----
function saveAll(){
  const data = {
    profiles: STATE.profiles,
    currentProfile: STATE.profile,
    theme: STATE.theme,
    sound: STATE.sound,
    controlScheme: STATE.controlScheme
  };
  localStorage.setItem('snake_save', JSON.stringify(data));
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
    document.body.dataset.theme = STATE.theme;
    $('theme').value = STATE.theme;
    $('btn-sound').textContent = STATE.sound ? '🔊' : '🔇';
    loadProfile();
    renderProfiles();
    applyControlScheme();
  }catch(e){console.warn('load fail',e)}
}
function loadProfile(){
  const p = STATE.profiles[STATE.profile] || {best:0, score:0};
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

// ----- Экспорт / Импорт -----
$('btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(STATE.profiles, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `snake-save-${Date.now()}.json`;
  a.click();
  beep(880, .1);
};
$('btn-import').onclick = () => $('file-import').click();
$('file-import').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      STATE.profiles = data;
      saveAll(); renderProfiles(); loadProfile();
      showOverlay('Импорт ✓', 'Данные загружены');
      setTimeout(hideOverlay, 1500);
      beep(660, .15);
    }catch(err){ alert('Ошибка файла'); }
  };
  r.readAsText(f);
};

// ----- Профили -----
$('profile').onchange = e => {
  if(e.target.value === '__new__'){
    const name = prompt('Имя профиля:', 'Игрок '+(Object.keys(STATE.profiles).length+1));
    if(!name) return;
    STATE.profiles[name] = {best:0};
    STATE.profile = name;
    saveAll(); renderProfiles(); loadProfile();
  } else {
    STATE.profile = e.target.value;
    saveAll(); loadProfile();
    resetGame();
  }
};

// ----- Тема -----
$('theme').onchange = e => {
  STATE.theme = e.target.value;
  document.body.dataset.theme = STATE.theme;
  saveAll(); draw();
};

// ----- Звук -----
let audioCtx;
function beep(freq=440, dur=.1, type='square'){
  if(!STATE.sound) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = .08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime+dur);
    o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
$('btn-sound').onclick = () => {
  STATE.sound = !STATE.sound;
  $('btn-sound').textContent = STATE.sound ? '🔊' : '🔇';
  saveAll();
};

// ----- Мгновенная смена направления -----
function changeDirection(newDir){
  // Запрет разворота на 180°
  if(newDir.x === -STATE.dir.x && newDir.y === -STATE.dir.y) return;
  STATE.nextDir = newDir;
  STATE.dir = newDir; // Мгновенное применение!
}

// ----- Игровой цикл на RAF -----
function gameLoop(timestamp){
  if(!STATE.running || STATE.paused){
    STATE.animFrame = null;
    return;
  }
  
  if(!STATE.lastTime) STATE.lastTime = timestamp;
  const delta = timestamp - STATE.lastTime;
  STATE.lastTime = timestamp;
  STATE.accumulator += delta;
  
  while(STATE.accumulator >= STATE.speed){
    step();
    STATE.accumulator -= STATE.speed;
  }
  
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
  placeFood(); draw();
}
function placeFood(){
  while(true){
    const f = {x: Math.floor(Math.random()*STATE.cols), y: Math.floor(Math.random()*STATE.rows)};
    if(!STATE.snake.some(s=>s.x===f.x && s.y===f.y)){ STATE.food = f; return; }
  }
}
function step(){
  const head = {x: STATE.snake[0].x + STATE.dir.x, y: STATE.snake[0].y + STATE.dir.y};
  head.x = (head.x + STATE.cols) % STATE.cols;
  head.y = (head.y + STATE.rows) % STATE.rows;

  if(STATE.snake.some(s=>s.x===head.x && s.y===head.y)){
    gameOver(); return;
  }

  STATE.snake.unshift(head);

  if(head.x===STATE.food.x && head.y===STATE.food.y){
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
  if(STATE.animFrame) cancelAnimationFrame(STATE.animFrame);
  beep(120, .4, 'sawtooth');
  showOverlay('Игра окончена', `Счёт: ${STATE.score}. Нажмите «Старт» для новой игры`);
}
function startGame(){
  if(STATE.gameOver || !STATE.snake.length) resetGame();
  STATE.running = true; STATE.paused = false;
  STATE.lastTime = 0; STATE.accumulator = 0;
  hideOverlay();
  if(!STATE.animFrame) STATE.animFrame = requestAnimationFrame(gameLoop);
}
function togglePause(){
  if(!STATE.running){ startGame(); return; }
  STATE.paused = !STATE.paused;
  if(STATE.paused){
    showOverlay('Пауза', 'Нажмите ▶ для продолжения');
  } else {
    hideOverlay();
    STATE.lastTime = 0;
    if(!STATE.animFrame) STATE.animFrame = requestAnimationFrame(gameLoop);
  }
}
$('btn-start').onclick = startGame;
$('btn-reset').onclick = () => { 
  if(STATE.animFrame) cancelAnimationFrame(STATE.animFrame);
  STATE.running=false; resetGame(); showOverlay('Готовы?', 'Нажмите «Старт»'); 
};
$('btn-pause').onclick = togglePause;

// ----- Оверлей -----
function showOverlay(t, p){
  $('overlay-title').textContent = t;
  $('overlay-text').textContent = p;
  $('overlay').classList.remove('hidden');
}
function hideOverlay(){ $('overlay').classList.add('hidden'); }

// ----- Отрисовка -----
function draw(){
  const c = STATE.cell;
  ctx.fillStyle = getCSS('--grid'); ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,.03)';
  for(let i=0;i<=STATE.cols;i++){ctx.beginPath();ctx.moveTo(i*c,0);ctx.lineTo(i*c,canvas.height);ctx.stroke()}
  for(let i=0;i<=STATE.rows;i++){ctx.beginPath();ctx.moveTo(0,i*c);ctx.lineTo(canvas.width,i*c);ctx.stroke()}

  const pulse = 1 + Math.sin(Date.now()/200)*.1;
  ctx.fillStyle = getCSS('--food');
  ctx.beginPath();
  ctx.arc(STATE.food.x*c+c/2, STATE.food.y*c+c/2, c/2*.7*pulse, 0, Math.PI*2);
  ctx.fill();

  STATE.snake.forEach((s,i)=>{
    const alpha = 1 - i/STATE.snake.length*.5;
    ctx.fillStyle = i===0 ? getCSS('--accent') : getCSS('--snake');
    ctx.globalAlpha = alpha;
    roundRect(s.x*c+1, s.y*c+1, c-2, c-2, 4);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if(STATE.snake.length){
    const h = STATE.snake[0];
    ctx.fillStyle = '#0f172a';
    const ex = h.x*c + c/2 + STATE.dir.x*c*.2;
    const ey = h.y*c + c/2 + STATE.dir.y*c*.2;
    ctx.beginPath(); ctx.arc(ex-STATE.dir.y*3, ey+STATE.dir.x*3, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex+STATE.dir.y*3, ey-STATE.dir.x*3, 2, 0, Math.PI*2); ctx.fill();
  }
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function getCSS(v){ return getComputedStyle(document.body).getPropertyValue(v).trim(); }

// ----- Клавиатура (мгновенный отклик) -----
document.addEventListener('keydown', e => {
  const k = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  if(k===' '){ togglePause(); return; }
  const map = {
    ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1},
    ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
    w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0},
    W:{x:0,y:-1}, S:{x:0,y:1}, A:{x:-1,y:0}, D:{x:1,y:0}
  };
  if(map[k]) changeDirection(map[k]);
}, {passive:false});

// ----- Свайпы -----
let touchStart = null;
canvas.addEventListener('touchstart', e=>{
  if(STATE.controlScheme === 'swipe' || STATE.controlScheme === 'hybrid'){
    touchStart = {x:e.touches[0].clientX, y:e.touches[0].clientY};
  }
}, {passive:true});
canvas.addEventListener('touchend', e=>{
  if(!touchStart) return;
  if(STATE.controlScheme !== 'swipe' && STATE.controlScheme !== 'hybrid') return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if(Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  let d;
  if(Math.abs(dx) > Math.abs(dy)) d = dx>0 ? {x:1,y:0} : {x:-1,y:0};
  else d = dy>0 ? {x:0,y:1} : {x:0,y:-1};
  changeDirection(d);
  touchStart = null;
});

// ----- Применение схемы управления -----
function applyControlScheme(){
  // Удалить старые элементы
  document.querySelectorAll('.controls-layer').forEach(el=>el.remove());
  
  const layer = document.createElement('div');
  layer.className = 'controls-layer active';
  layer.id = 'controls-layer';
  
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
    layer.appendChild(dpad);
  }
  
  if(scheme === 'joystick'){
    const zone = document.createElement('div');
    zone.className = 'joystick-zone';
    zone.innerHTML = '<div class="joystick-knob"></div>';
    layer.appendChild(zone);
    initJoystick(zone);
  }
  
  if(scheme === 'tapzones'){
    const zones = document.createElement('div');
    zones.className = 'tap-zones';
    zones.innerHTML = `
      <div class="top" data-dir="up">▲</div>
      <div class="left" data-dir="left">◀</div>
      <div class="right" data-dir="right">▶</div>
      <div class="bottom" data-dir="down">▼</div>
    `;
    layer.appendChild(zones);
  }
  
  if(scheme === 'turns'){
    const btns = document.createElement('div');
    btns.className = 'turn-btns';
    btns.innerHTML = `
      <button data-turn="left">◀</button>
      <button data-turn="right">▶</button>
    `;
    layer.appendChild(btns);
  }
  
  document.querySelector('.stage').appendChild(layer);
  
  // Обработчики для всех кнопок
  layer.querySelectorAll('[data-dir]').forEach(btn=>{
    btn.addEventListener('touchstart', e=>{
      e.preventDefault();
      const dir = btn.dataset.dir;
      const map = {up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}};
      changeDirection(map[dir]);
    }, {passive:false});
    btn.addEventListener('mousedown', e=>{
      e.preventDefault();
      const dir = btn.dataset.dir;
      const map = {up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}};
      changeDirection(map[dir]);
    });
  });
  
  layer.querySelectorAll('[data-turn]').forEach(btn=>{
    btn.addEventListener('touchstart', e=>{
      e.preventDefault();
      const turn = btn.dataset.turn;
      if(turn === 'left'){
        const d = STATE.dir.x === 0 ? {x:STATE.dir.y,y:0} : {x:0,y:-STATE.dir.x};
        changeDirection(d);
      } else {
        const d = STATE.dir.x === 0 ? {x:-STATE.dir.y,y:0} : {x:0,y:STATE.dir.x};
        changeDirection(d);
      }
    }, {passive:false});
    btn.addEventListener('mousedown', e=>{
      e.preventDefault();
      const turn = btn.dataset.turn;
      if(turn === 'left'){
        const d = STATE.dir.x === 0 ? {x:STATE.dir.y,y:0} : {x:0,y:-STATE.dir.x};
        changeDirection(d);
      } else {
        const d = STATE.dir.x === 0 ? {x:-STATE.dir.y,y:0} : {x:0,y:STATE.dir.x};
        changeDirection(d);
      }
    });
  });
}

// ----- Джойстик -----
function initJoystick(zone){
  const knob = zone.querySelector('.joystick-knob');
  let active = false, startX, startY;
  const maxDist = 45;
  
  zone.addEventListener('touchstart', e=>{
    e.preventDefault();
    active = true;
    const rect = zone.getBoundingClientRect();
    startX = rect.left + rect.width/2;
    startY = rect.top + rect.height/2;
  }, {passive:false});
  
  zone.addEventListener('touchmove', e=>{
    if(!active) return;
    e.preventDefault();
    const touch = e.touches[0];
    let dx = touch.clientX - startX;
    let dy = touch.clientY - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist > maxDist){
      dx = dx/dist*maxDist;
      dy = dy/dist*maxDist;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    if(dist > 20){
      if(Math.abs(dx) > Math.abs(dy)){
        changeDirection(dx > 0 ? {x:1,y:0} : {x:-1,y:0});
      } else {
        changeDirection(dy > 0 ? {x:0,y:1} : {x:0,y:-1});
      }
    }
  }, {passive:false});
  
  zone.addEventListener('touchend', e=>{
    active = false;
    knob.style.transform = 'translate(-50%, -50%)';
  });
}

// ----- Меню настроек -----
$('btn-menu').onclick = () => {
  const modal = document.createElement('div');
  modal.className = 'settings-modal';
  modal.innerHTML = `
    <div class="settings-box">
      <h2>⚙ Настройки</h2>
      <div class="setting-group">
        <label>Схема управления (мобильная)</label>
        <select id="sel-control">
          <option value="dpad">1. D-Pad (крестовина)</option>
          <option value="swipe">2. Свайпы по полю</option>
          <option value="joystick">3. Виртуальный джойстик</option>
          <option value="tapzones">4. Тап-зоны экрана</option>
          <option value="turns">5. Повороты ◀ ▶</option>
          <option value="hybrid">6. Гибрид (свайпы + D-Pad)</option>
        </select>
      </div>
      <div class="settings-actions">
        <button class="btn" id="btn-settings-close">Закрыть</button>
        <button class="btn primary" id="btn-settings-save">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const sel = modal.querySelector('#sel-control');
  sel.value = STATE.controlScheme;
  
  modal.querySelector('#btn-settings-close').onclick = () => modal.remove();
  modal.querySelector('#btn-settings-save').onclick = () => {
    STATE.controlScheme = sel.value;
    saveAll();
    applyControlScheme();
    modal.remove();
  };
  modal.onclick = e => { if(e.target === modal) modal.remove(); };
};

// ----- Старт -----
loadAll();
if(!Object.keys(STATE.profiles).length){
  STATE.profiles['Игрок 1'] = {best:0};
  saveAll(); renderProfiles();
}
resetGame();

// Анимация еды в покое
setInterval(()=>{ if(!STATE.running) draw(); }, 80);

// ----- Service Worker -----
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
