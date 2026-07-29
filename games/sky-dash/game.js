/* ============================================================
   Sky Dash — a one-tap "flap through the gaps" arcade game.
   Art + audio: Kenney (CC0). See CREDITS.md.
   ============================================================ */
(() => {
'use strict';

// ---------- Constants (logical pixels; the world is always 480 tall) ----------
const H          = 480;
const MIN_W      = 400;
const MAX_W      = 1100;
const GROUND_H   = 71;
const PLAY_H     = H - GROUND_H;

const PIPE_W     = 108;
const ROCK_H     = 239;
const PIPE_SPACE = 240;
const GAP_BASE   = 158;
const GAP_MIN    = 132;
const EDGE_PAD   = 55;   // keeps a gap from touching the sky / the ground

const PLANE_W    = 55;
const PLANE_H    = 46;
const HIT_R      = 17;

const GRAVITY    = 1450;
const FLAP_VY    = -400;
const MAX_FALL   = 640;
const SPEED_BASE  = 195;
const SPEED_MAX   = 270;

const STAR_EVERY = 4;    // a bonus star sits in every 4th gap
const STAR_R     = 19;

const PLANES  = ['Blue', 'Red', 'Green', 'Yellow'];
const THEMES  = [
  { ground: 'groundGrass', up: 'rockGrass',     down: 'rockGrassDown', sky: '#8fd4e8' },
  { ground: 'groundSnow',  up: 'rockSnow',      down: 'rockSnowDown',  sky: '#bfe4f2' },
  { ground: 'groundIce',   up: 'rockIce',       down: 'rockIceDown',   sky: '#a7dcef' },
  { ground: 'groundRock',  up: 'rock',          down: 'rockDown',      sky: '#9fd0e4' },
  { ground: 'groundDirt',  up: 'rock',          down: 'rockDown',      sky: '#e8c98f' },
];

const STATE = { LOAD: 0, MENU: 1, READY: 2, PLAY: 3, DYING: 4, OVER: 5, PAUSE: 6 };

// ---------- Persistence ----------
const KEY = 'skydash.v1';
const store = {
  data: { best: 0, plays: 0, plane: 0, muted: false },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (_) { /* private mode / disabled storage — run with defaults */ }
    this.data.plane = ((this.data.plane % PLANES.length) + PLANES.length) % PLANES.length;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) {}
  },
};
store.load();

// ---------- Asset loading ----------
const IMAGES = {
  background: 'assets/sprites/background.png',
  puffSmall:  'assets/sprites/puffSmall.png',
  puffLarge:  'assets/sprites/puffLarge.png',
  starGold:   'assets/sprites/starGold.png',
  rock:       'assets/sprites/rock.png',
  rockDown:   'assets/sprites/rockDown.png',
  textGetReady: 'assets/sprites/ui/textGetReady.png',
  tap:          'assets/sprites/ui/tap.png',
  tapTick:      'assets/sprites/ui/tapTick.png',
};
for (const t of THEMES) {
  IMAGES[t.ground] = `assets/sprites/${t.ground}.png`;
  IMAGES[t.up]     = `assets/sprites/${t.up}.png`;
  IMAGES[t.down]   = `assets/sprites/${t.down}.png`;
}
for (const c of PLANES) {
  for (let f = 1; f <= 3; f++) IMAGES[`plane${c}${f}`] = `assets/sprites/planes/plane${c}${f}.png`;
}
for (let n = 0; n <= 9; n++) IMAGES[`n${n}`] = `assets/sprites/numbers/number${n}.png`;
for (const m of ['Bronze', 'Silver', 'Gold']) IMAGES[`medal${m}`] = `assets/sprites/ui/medal${m}.png`;

const img = {};

function loadImages(onProgress) {
  const names = Object.keys(IMAGES);
  let done = 0;
  return Promise.all(names.map(name => new Promise(resolve => {
    const el = new Image();
    const finish = () => { done++; onProgress(done / names.length); resolve(); };
    el.onload = finish;
    el.onerror = finish;               // a missing sprite must not wedge the loader
    el.src = IMAGES[name];
    img[name] = el;
  })));
}

// ---------- Audio ----------
// Kenney's packs ship .ogg only. Browsers that can't decode Vorbis fall back to
// short WebAudio blips so the game never plays silent-and-broken.
const sfx = (() => {
  const FILES = {
    flap:  'assets/sounds/flap.ogg',
    score: 'assets/sounds/score.ogg',
    hit:   'assets/sounds/hit.ogg',
    fall:  'assets/sounds/fall.ogg',
    click: 'assets/sounds/click.ogg',
    medal: 'assets/sounds/medal.ogg',
  };
  const TONES = {                       // freq, duration, waveform
    flap:  [520, 0.09, 'triangle'],
    score: [880, 0.12, 'square'],
    hit:   [150, 0.16, 'sawtooth'],
    fall:  [90,  0.28, 'sine'],
    click: [660, 0.05, 'square'],
    medal: [1040, 0.20, 'triangle'],
  };
  const canOgg = !!document.createElement('audio')
    .canPlayType('audio/ogg; codecs="vorbis"').replace('no', '');

  // One network fetch per sound; the pool voices all share the resulting blob URL
  // so overlapping playback never re-requests the file.
  // One network fetch per sound; the pool voices all share the resulting blob URL
  // so overlapping playback never re-requests the file.
  const pools = {};
  let oggFailed = false;
  if (canOgg) {
    for (const [k, src] of Object.entries(FILES)) {
      fetch(src)
        .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then(blob => {
          const url = URL.createObjectURL(blob);
          pools[k] = { i: 0, els: Array.from({ length: 4 }, () => { const a = new Audio(url); a.preload = 'auto'; a.volume = 0.45; return a; }) };
        })
        .catch(() => { oggFailed = true; });   // e.g. opened over file:// — use the synth
    }
  }
  const useSamples = () => canOgg && !oggFailed;

  let ac = null;
  const ctxAudio = () => {
    if (!ac && window.AudioContext) ac = new AudioContext();
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };

  return {
    get muted() { return store.data.muted; },
    toggle() { store.data.muted = !store.data.muted; store.save(); return store.data.muted; },
    unlock() { if (!useSamples()) ctxAudio(); },
    play(name) {
      if (store.data.muted) return;
      if (useSamples()) {
        const p = pools[name];
        if (!p) return;                    // still downloading — stay quiet rather than blip
        const el = p.els[p.i = (p.i + 1) % p.els.length];
        try { el.currentTime = 0; el.play().catch(() => {}); } catch (_) {}
        return;
      }
      const a = ctxAudio();
      if (!a) return;
      const [freq, dur, type] = TONES[name] || TONES.click;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), a.currentTime + dur);
      g.gain.setValueAtTime(0.14, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      osc.connect(g).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + dur);
    },
  };
})();

// ---------- DOM ----------
const $ = sel => document.querySelector(sel);
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const stage = $('#stage');
const ov = {
  loading: $('#ov-loading'),
  menu:    $('#ov-menu'),
  pause:   $('#ov-pause'),
  over:    $('#ov-over'),
};

// ---------- Viewport ----------
let W = 800;          // logical width, recomputed on resize
let viewScale = 1;

function resize() {
  const vw = stage.clientWidth || window.innerWidth;
  const vh = stage.clientHeight || window.innerHeight;
  W = Math.round(Math.max(MIN_W, Math.min(MAX_W, H * (vw / vh))));
  viewScale = Math.min(vw / W, vh / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = W * viewScale, cssH = H * viewScale;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---------- Game world ----------
const game = {
  state: STATE.LOAD,
  prevState: STATE.MENU,
  t: 0,
  score: 0,
  bgX: 0,
  groundX: 0,
  pipes: [],
  pipesMade: 0,
  puffs: [],
  sparks: [],
  flash: 0,
  shake: 0,
  plane: { x: 0, y: 0, vy: 0, angle: 0, frame: 0 },
  newBest: false,
};

const theme = () => THEMES[Math.floor(game.score / 10) % THEMES.length];
const speed = () => Math.min(SPEED_MAX, SPEED_BASE + game.score * 2.2);
const gapSize = () => Math.max(GAP_MIN, GAP_BASE - Math.floor(game.score / 8) * 4);

function resetWorld() {
  game.score = 0;
  game.pipes = [];
  game.pipesMade = 0;
  game.puffs = [];
  game.sparks = [];
  game.flash = 0;
  game.shake = 0;
  game.newBest = false;
  game.plane.x = Math.round(W * 0.28);
  game.plane.y = PLAY_H * 0.45;
  game.plane.vy = 0;
  game.plane.angle = 0;
}

function spawnPipe() {
  const gap = gapSize();
  const maxTop = PLAY_H - gap - EDGE_PAD;
  const gapTop = EDGE_PAD + Math.random() * Math.max(1, maxTop - EDGE_PAD);
  game.pipes.push({
    x: W + PIPE_W * 0.5,
    gapTop,
    gap,
    scored: false,
    star: (game.pipesMade % STAR_EVERY) === STAR_EVERY - 1,
    starTaken: false,
  });
  game.pipesMade++;
}

function flap() {
  game.plane.vy = FLAP_VY;
  sfx.play('flap');
  for (let i = 0; i < 2; i++) {
    game.puffs.push({
      x: game.plane.x - PLANE_W * 0.42,
      y: game.plane.y + 6 + (Math.random() * 8 - 4),
      vx: -90 - Math.random() * 60,
      vy: 20 + Math.random() * 45,
      life: 1,
      big: Math.random() < 0.35,
      rot: Math.random() * Math.PI,
    });
  }
}

function addSparks(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.random();
    const s = 90 + Math.random() * 130;
    game.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, rot: Math.random() * 6 });
  }
}

// ---------- Collision ----------
function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function planeCenter() {
  return { x: game.plane.x, y: game.plane.y };
}

function checkCollisions() {
  const c = planeCenter();

  if (c.y + HIT_R >= PLAY_H) {          // the ground is fatal
    game.plane.y = PLAY_H - HIT_R;
    die(true);
    return;
  }

  for (const p of game.pipes) {
    if (p.x + PIPE_W * 0.5 < c.x - HIT_R || p.x - PIPE_W * 0.5 > c.x + HIT_R) continue;
    const left = p.x - PIPE_W * 0.5;
    // The sprite's rocky silhouette is narrower than the PNG — inset a little so
    // near-misses read as fair.
    const rx = left + 8, rw = PIPE_W - 16;
    if (circleHitsRect(c.x, c.y, HIT_R, rx, -400, rw, 400 + p.gapTop) ||
        circleHitsRect(c.x, c.y, HIT_R, rx, p.gapTop + p.gap, rw, PLAY_H)) {
      die(false);
      return;
    }
  }
}

function collectStars() {
  const c = planeCenter();
  for (const p of game.pipes) {
    if (!p.star || p.starTaken) continue;
    const sx = p.x, sy = p.gapTop + p.gap * 0.5;
    const dx = c.x - sx, dy = c.y - sy;
    if (dx * dx + dy * dy < (HIT_R + STAR_R) * (HIT_R + STAR_R)) {
      p.starTaken = true;
      game.score++;
      sfx.play('score');
      addSparks(sx, sy);
    }
  }
}

// ---------- State transitions ----------
function toMenu() {
  game.state = STATE.MENU;
  resetWorld();
  $('#menu-best').textContent = store.data.best;
  $('#menu-plays').textContent = store.data.plays;
  updatePlanePreview();
  show('menu');
}

function toReady() {
  resetWorld();
  game.state = STATE.READY;
  show(null);
}

function startPlay() {
  game.state = STATE.PLAY;
  store.data.plays++;
  store.save();
  flap();
}

function die(fromGround) {
  if (game.state !== STATE.PLAY) return;
  sfx.play('hit');
  game.flash = 1;
  game.shake = 10;
  if (fromGround) {
    finish();
  } else {
    game.state = STATE.DYING;
    game.plane.vy = Math.max(game.plane.vy, -140);
  }
}

function finish() {
  game.state = STATE.OVER;
  sfx.play('fall');
  if (game.score > store.data.best) {
    store.data.best = game.score;
    game.newBest = true;
  }
  store.save();

  $('#final-score').textContent = game.score;
  $('#final-best').textContent = store.data.best;
  $('#new-best').classList.toggle('hidden', !game.newBest);

  const medal = $('#medal');
  const tier = game.score >= 30 ? 'Gold' : game.score >= 20 ? 'Silver' : game.score >= 10 ? 'Bronze' : null;
  if (tier) {
    medal.src = `assets/sprites/ui/medal${tier}.png`;
    medal.hidden = false;
    setTimeout(() => sfx.play('medal'), 260);
  } else {
    medal.hidden = true;
  }
  show('over');
}

function pause() {
  if (game.state !== STATE.PLAY && game.state !== STATE.READY) return;
  game.prevState = game.state;
  game.state = STATE.PAUSE;
  show('pause');
}

function resume() {
  if (game.state !== STATE.PAUSE) return;
  game.state = game.prevState;
  show(null);
}

function show(which) {
  for (const [name, el] of Object.entries(ov)) el.classList.toggle('hidden', name !== which);
}

// ---------- Update ----------
function update(dt) {
  game.t += dt;

  const scrolling = game.state === STATE.PLAY || game.state === STATE.READY || game.state === STATE.MENU;
  const v = game.state === STATE.PLAY ? speed() : 110;

  if (scrolling) {
    game.bgX     += v * 0.28 * dt;
    game.groundX += v * dt;
  }

  game.plane.frame = (game.plane.frame + dt * 16) % 3;

  if (game.state === STATE.MENU) {
    game.plane.y = PLAY_H * 0.45 + Math.sin(game.t * 2.6) * 12;
    game.plane.angle = Math.sin(game.t * 2.6) * 0.13;
  }

  if (game.state === STATE.READY) {
    game.plane.y = PLAY_H * 0.45 + Math.sin(game.t * 3.4) * 9;
    game.plane.angle = Math.sin(game.t * 3.4) * 0.1;
  }

  if (game.state === STATE.PLAY || game.state === STATE.DYING) {
    game.plane.vy = Math.min(MAX_FALL, game.plane.vy + GRAVITY * dt);
    game.plane.y += game.plane.vy * dt;
    if (game.plane.y < HIT_R) { game.plane.y = HIT_R; game.plane.vy = Math.max(game.plane.vy, 0); }
    const target = Math.max(-0.38, Math.min(1.35, game.plane.vy / 430));
    game.plane.angle += (target - game.plane.angle) * Math.min(1, dt * 9);
  }

  if (game.state === STATE.PLAY) {
    for (const p of game.pipes) p.x -= v * dt;
    while (game.pipes.length && game.pipes[0].x + PIPE_W < -20) game.pipes.shift();
    const last = game.pipes[game.pipes.length - 1];
    if (!last || last.x < W - PIPE_SPACE) spawnPipe();

    for (const p of game.pipes) {
      if (!p.scored && p.x + PIPE_W * 0.5 < game.plane.x) {
        p.scored = true;
        game.score++;
        sfx.play('score');
      }
    }
    collectStars();
    checkCollisions();
  }

  if (game.state === STATE.DYING && game.plane.y + HIT_R >= PLAY_H) {
    game.plane.y = PLAY_H - HIT_R;
    finish();
  }

  // particles
  for (const q of game.puffs) {
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= 0.94; q.vy *= 0.96;
    q.life -= dt * 1.5;
  }
  game.puffs = game.puffs.filter(q => q.life > 0);

  for (const s of game.sparks) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vy += 520 * dt;
    s.life -= dt * 1.9;
  }
  game.sparks = game.sparks.filter(s => s.life > 0);

  game.flash = Math.max(0, game.flash - dt * 3.2);
  game.shake = Math.max(0, game.shake - dt * 34);
}

// ---------- Draw ----------
function drawTiled(image, offset, y, h) {
  if (!image.width) return;
  const w = image.width;
  let x = -(((offset % w) + w) % w);
  while (x < W) { ctx.drawImage(image, x, y, w, h); x += w; }
}

function drawPlane() {
  const key = `plane${PLANES[store.data.plane]}${Math.floor(game.plane.frame) + 1}`;
  const sprite = img[key];
  if (!sprite || !sprite.width) return;
  ctx.save();
  ctx.translate(game.plane.x, game.plane.y);
  ctx.rotate(game.plane.angle);
  ctx.drawImage(sprite, -PLANE_W / 2, -PLANE_H / 2, PLANE_W, PLANE_H);
  ctx.restore();
}

function drawNumber(value, cx, cy, scale) {
  const digits = String(value).split('');
  const s = img.n0;
  if (!s || !s.width) return;
  const dw = s.width * scale, dh = s.height * scale, gapPx = 2 * scale;
  const total = digits.length * dw + (digits.length - 1) * gapPx;
  let x = cx - total / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 3 * scale;
  for (const d of digits) {
    ctx.drawImage(img[`n${d}`], x, cy, dw, dh);
    x += dw + gapPx;
  }
  ctx.restore();
}

function draw() {
  const th = theme();

  ctx.save();
  if (game.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }

  ctx.fillStyle = th.sky;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  drawTiled(img.background, game.bgX, 0, H);

  // pipes
  for (const p of game.pipes) {
    const left = p.x - PIPE_W * 0.5;
    const down = img[th.down], up = img[th.up];
    if (down && down.width) ctx.drawImage(down, left, p.gapTop - ROCK_H, PIPE_W, ROCK_H);
    if (up && up.width)     ctx.drawImage(up,   left, p.gapTop + p.gap, PIPE_W, ROCK_H);

    if (p.star && !p.starTaken && img.starGold.width) {
      const sy = p.gapTop + p.gap * 0.5 + Math.sin(game.t * 4 + p.x * 0.02) * 5;
      const sc = 1 + Math.sin(game.t * 6) * 0.06;
      ctx.save();
      ctx.translate(p.x, sy);
      ctx.rotate(Math.sin(game.t * 2 + p.x * 0.01) * 0.25);
      ctx.scale(sc, sc);
      ctx.drawImage(img.starGold, -19, -19, 38, 38);
      ctx.restore();
    }
  }

  // engine puffs sit behind the plane
  for (const q of game.puffs) {
    const sprite = q.big ? img.puffLarge : img.puffSmall;
    if (!sprite.width) continue;
    const k = 1 + (1 - q.life) * 1.3;
    ctx.save();
    ctx.globalAlpha = Math.max(0, q.life) * 0.7;
    ctx.translate(q.x, q.y);
    ctx.rotate(q.rot);
    ctx.drawImage(sprite, -sprite.width * k / 2, -sprite.height * k / 2, sprite.width * k, sprite.height * k);
    ctx.restore();
  }

  drawPlane();

  for (const s of game.sparks) {
    if (!img.starGold.width) break;
    const k = 0.42 * s.life + 0.12;
    ctx.save();
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot * s.life * 3);
    ctx.drawImage(img.starGold, -19 * k, -19 * k, 38 * k, 38 * k);
    ctx.restore();
  }

  drawTiled(img[th.ground], game.groundX, PLAY_H, GROUND_H);

  // HUD
  if (game.state === STATE.PLAY || game.state === STATE.DYING) {
    drawNumber(game.score, W / 2, 22, 0.55);
  }

  if (game.state === STATE.READY) {
    const g = img.textGetReady;
    if (g.width) {
      const gw = Math.min(300, W * 0.62), gh = gw * g.height / g.width;
      ctx.drawImage(g, W / 2 - gw / 2, PLAY_H * 0.16, gw, gh);
    }
    const tapSprite = Math.floor(game.t * 3) % 2 ? img.tapTick : img.tap;
    if (tapSprite.width) {
      const bob = Math.sin(game.t * 5) * 5;
      ctx.drawImage(tapSprite, W / 2 - 29, PLAY_H * 0.58 + bob, 59, 59);
    }
  }

  ctx.restore();

  if (game.flash > 0.01) {
    ctx.save();
    ctx.globalAlpha = game.flash * 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// ---------- Loop ----------
let last = 0;
function frame(now) {
  if (!last) last = now;
  const dt = Math.min(0.05, (now - last) / 1000);   // clamp so tab-switches don't teleport the plane
  last = now;
  if (game.state !== STATE.PAUSE) update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Input ----------
function primaryInput() {
  sfx.unlock();
  if (game.state === STATE.READY) { startPlay(); return; }
  if (game.state === STATE.PLAY)  { flap(); return; }
}

canvas.addEventListener('pointerdown', e => { e.preventDefault(); primaryInput(); });

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (game.state === STATE.MENU) { onPlay(); return; }
    if (game.state === STATE.OVER) { onRetry(); return; }
    if (game.state === STATE.PAUSE) { resume(); return; }
    primaryInput();
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    game.state === STATE.PAUSE ? resume() : pause();
  } else if (e.code === 'KeyM') {
    toggleSound();
  }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- UI wiring ----------
function click(sel, fn) {
  $(sel).addEventListener('click', e => { e.preventDefault(); sfx.unlock(); sfx.play('click'); fn(); });
}

function updatePlanePreview() {
  $('#plane-preview').src = `assets/sprites/planes/plane${PLANES[store.data.plane]}1.png`;
}

function cyclePlane(step) {
  store.data.plane = (store.data.plane + step + PLANES.length) % PLANES.length;
  store.save();
  updatePlanePreview();
}

function onPlay()  { toReady(); }
function onRetry() { toReady(); }

function toggleSound() {
  const muted = sfx.toggle();
  $('#btn-sound').classList.toggle('off', muted);
  $('#btn-sound').innerHTML = muted ? '&#128263;' : '&#9834;';
  if (!muted) sfx.play('click');
}

click('#btn-play', onPlay);
click('#btn-retry', onRetry);
click('#btn-menu', toMenu);
click('#btn-resume', resume);
click('#btn-quit', toMenu);
click('#btn-pause', () => (game.state === STATE.PAUSE ? resume() : pause()));
click('#plane-prev', () => cyclePlane(-1));
click('#plane-next', () => cyclePlane(1));
$('#btn-sound').addEventListener('click', e => { e.preventDefault(); sfx.unlock(); toggleSound(); });

// ---------- Boot ----------
// Same reason as the hub: file:// has no directory index, so the "back to games"
// folder link would open a file listing. Only rewrite it off-server.
if (location.protocol === 'file:') {
  document.querySelectorAll('a[href$="/"]').forEach(a =>
    a.setAttribute('href', a.getAttribute('href') + 'index.html'));
}

resize();
if (store.data.muted) {
  $('#btn-sound').classList.add('off');
  $('#btn-sound').innerHTML = '&#128263;';
}

const fill = $('#bar-fill'), loadText = $('#load-text');
loadImages(p => {
  fill.style.width = Math.round(p * 100) + '%';
  loadText.textContent = `Loading ${Math.round(p * 100)}%`;
}).then(() => {
  resize();
  toMenu();
  requestAnimationFrame(frame);
});

})();
