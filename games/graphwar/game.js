/* ============================================================
   Graphwar — turn-based artillery where the shot flies along a
   function you type. Original implementation; sounds by Kenney (CC0).
   ============================================================ */
(() => {
'use strict';

const $ = s => document.querySelector(s);

/* ============================================================
   1. Expression parser
   User input is parsed into a tree of closures — never eval()'d, so a typo
   is a friendly error and no page state is reachable from the input box.
   ============================================================ */

class FnError extends Error {}

const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

const F1 = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log, log2: Math.log2, log10: Math.log10,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
};
const F2 = {
  pow: Math.pow, atan2: Math.atan2,
  mod: (a, b) => a - b * Math.floor(a / b),      // true modulo, unlike JS %
};
const FN = { min: Math.min, max: Math.max };

function tokenize(src) {
  const s = src.toLowerCase();
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c >= '0' && c <= '9' || c === '.') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      const text = s.slice(i, j);
      const v = parseFloat(text);
      if (!isFinite(v)) throw new FnError(`"${text}" is not a number`);
      out.push({ t: 'num', v });
      i = j; continue;
    }
    if (c >= 'a' && c <= 'z') {
      let j = i;
      while (j < s.length && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= '0' && s[j] <= '9') || s[j] === '_')) j++;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j; continue;
    }
    if ('+-*/^%(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new FnError(`I don't understand the character "${src[i]}"`);
  }
  return out;
}

function compile(src) {
  if (!src.trim()) throw new FnError('Type a function first');
  const T = tokenize(src);
  if (!T.length) throw new FnError('Type a function first');
  let i = 0;

  const at = () => T[i];
  const isOp = o => at() && at().t === 'op' && at().v === o;
  const expect = o => { if (!isOp(o)) throw new FnError(`Expected "${o}"`); i++; };
  const startsAtom = () => {
    const t = at();
    return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('));
  };

  function additive() {
    let f = multiplicative();
    while (isOp('+') || isOp('-')) {
      const plus = at().v === '+'; i++;
      const a = f, b = multiplicative();
      f = plus ? x => a(x) + b(x) : x => a(x) - b(x);
    }
    return f;
  }

  function multiplicative() {
    let f = unary();
    for (;;) {
      if (isOp('*') || isOp('/') || isOp('%')) {
        const op = at().v; i++;
        const a = f, b = unary();
        f = op === '*' ? x => a(x) * b(x)
          : op === '/' ? x => a(x) / b(x)
          : x => a(x) % b(x);
      } else if (startsAtom()) {
        const a = f, b = unary();          // implicit product: 2x, 3sin(x), (x+1)(x-1)
        f = x => a(x) * b(x);
      } else break;
    }
    return f;
  }

  function unary() {
    if (isOp('-')) { i++; const a = unary(); return x => -a(x); }
    if (isOp('+')) { i++; return unary(); }
    return power();
  }

  function power() {
    const base = atom();
    if (isOp('^')) {
      i++;
      const a = base, b = unary();        // right-associative, and 2^-1 parses
      return x => Math.pow(a(x), b(x));
    }
    return base;
  }

  function argList(name) {
    expect('(');
    const list = [];
    if (!isOp(')')) {
      list.push(additive());
      while (isOp(',')) { i++; list.push(additive()); }
    }
    if (!isOp(')')) throw new FnError(`Missing ")" after ${name}(`);
    i++;
    return list;
  }

  function atom() {
    const t = at();
    if (!t) throw new FnError('The function ends unexpectedly');
    if (t.t === 'num') { i++; const v = t.v; return () => v; }
    if (t.t === 'op' && t.v === '(') {
      i++;
      const f = additive();
      if (!isOp(')')) throw new FnError('Missing ")"');
      i++;
      return f;
    }
    if (t.t === 'id') {
      const name = t.v;
      if (name === 'x') { i++; return x => x; }
      if (name in CONSTS) { i++; const v = CONSTS[name]; return () => v; }
      if (name in F1) {
        i++; const g = F1[name]; const a = argList(name);
        if (a.length !== 1) throw new FnError(`${name}() takes exactly 1 argument`);
        const p = a[0];
        return x => g(p(x));
      }
      if (name in F2) {
        i++; const g = F2[name]; const a = argList(name);
        if (a.length !== 2) throw new FnError(`${name}() takes exactly 2 arguments`);
        const [p, q] = a;
        return x => g(p(x), q(x));
      }
      if (name in FN) {
        i++; const g = FN[name]; const a = argList(name);
        if (a.length < 1) throw new FnError(`${name}() needs at least 1 argument`);
        return x => g(...a.map(p => p(x)));
      }
      throw new FnError(`I don't know "${name}"`);
    }
    throw new FnError(`Unexpected "${t.v}"`);
  }

  const f = additive();
  if (i < T.length) throw new FnError(`Unexpected "${T[i].v}" — check your brackets and operators`);

  // Smoke-test the compiled function so obvious mistakes surface before firing.
  for (const probe of [0, 1, 2.5, 7, 20]) {
    const v = f(probe);
    if (typeof v !== 'number') throw new FnError('That does not evaluate to a number');
  }
  return f;
}

/* ============================================================
   2. World
   ============================================================ */

const CW = 1280, CH = 720;
const XR = 32, YR = 18;                 // world half-extents (64 x 36 units, 16:9)
const PU = CW / (2 * XR);               // pixels per world unit
const px = wx => (wx + XR) * PU;
const py = wy => (YR - wy) * PU;

const PER_TEAM   = 3;
const SOLDIER_R  = 0.55;
const BLAST_R    = 1.6;
const DT         = 0.02;                // simulation step, in units of travel
const DT_AI      = 0.06;                // coarser step while the AI searches
const MAX_T      = 200;
const SELF_GRACE = 1.3;                 // travel before your own soldier can be hit

const TEAM = {
  a: { key: 'a', name: 'Blue', fill: '#19c2c2', deep: '#0c7d86', trail: '#5fe0e0' },
  b: { key: 'b', name: 'Red',  fill: '#ef8b2c', deep: '#a8530b', trail: '#ffb163' },
};

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let terrain = [];
let soldiers = [];
let trails = [];                        // past shots, drawn faded
let explosions = [];

function genTerrain() {
  const out = [];
  const clusters = 3 + Math.floor(Math.random() * 3);
  for (let k = 0; k < clusters; k++) {
    const cx = clamp(-15 + (30 / Math.max(1, clusters - 1)) * k + rand(-2.5, 2.5), -18, 18);
    const cy = rand(-10.5, 10.5);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      out.push({
        x: clamp(cx + rand(-2.4, 2.4), -19, 19),
        y: clamp(cy + rand(-2.4, 2.4), -14.5, 14.5),
        r: rand(1.6, 3.2),
      });
    }
  }
  return out;
}

const inTerrain = (x, y, pad = 0) =>
  terrain.some(b => { const dx = x - b.x, dy = y - b.y, r = b.r + pad; return dx * dx + dy * dy < r * r; });

// Each team stands in a narrow vertical column with one soldier per horizontal band.
// Two reasons, both learned the hard way: spreading a team across a wide x range puts
// teammates directly downrange of each other, and letting them sit closer together than
// 2 * BLAST_R lets a single shell wipe out half a team.
const BAND_PAD = 2;                     // keeps adjacent bands >= 4 units apart

function spawnTeam(key, side) {
  const list = [];
  const bandH = (2 * 15) / PER_TEAM;
  const bands = [...Array(PER_TEAM).keys()].sort(() => Math.random() - 0.5);
  for (let k = 0; k < PER_TEAM; k++) {
    const b = bands[k];
    const lo = -15 + b * bandH + BAND_PAD;
    const hi = -15 + (b + 1) * bandH - BAND_PAD;
    let p = null;
    for (let tries = 0; tries < 200; tries++) {
      const c = { x: side * rand(25.5, 29.2), y: rand(lo, hi) };
      if (inTerrain(c.x, c.y, 1.8)) continue;
      p = c; break;
    }
    if (!p) p = { x: side * 27.5, y: (lo + hi) / 2 };          // never fail to spawn
    list.push({ id: k + 1, team: key, x: p.x, y: p.y, alive: true });
  }
  return list;
}

/* ============================================================
   3. Simulation
   ============================================================ */

function simulate(shooter, f, dir, angleDeg, dt = DT) {
  const th = angleDeg * Math.PI / 180;
  const ca = Math.cos(th), sa = Math.sin(th);
  const pts = [];
  let outcome = { kind: 'out' };

  for (let t = 0; t <= MAX_T; t += dt) {
    let fy;
    try { fy = f(t); } catch (_) { fy = NaN; }
    if (typeof fy !== 'number' || !isFinite(fy)) { outcome = { kind: 'undefined', t }; break; }
    if (Math.abs(fy) > 1e5) { outcome = { kind: 'out' }; break; }

    const wx = shooter.x + dir * (t * ca - fy * sa);
    const wy = shooter.y + (t * sa + fy * ca);
    pts.push(wx, wy);

    if (Math.abs(wx) > XR || Math.abs(wy) > YR + 40) { outcome = { kind: 'out' }; break; }
    if (t > 0 && inTerrain(wx, wy)) { outcome = { kind: 'terrain', x: wx, y: wy }; break; }

    let struck = null;
    for (const s of soldiers) {
      if (!s.alive) continue;
      if (s === shooter && t < SELF_GRACE) continue;
      const dx = wx - s.x, dy = wy - s.y, r = SOLDIER_R + 0.15;
      if (dx * dx + dy * dy < r * r) { struck = s; break; }
    }
    if (struck) { outcome = { kind: 'hit', soldier: struck, x: wx, y: wy }; break; }
  }
  return { pts, outcome };
}

function blastVictims(outcome) {
  if (outcome.kind !== 'hit' && outcome.kind !== 'terrain') return [];
  return soldiers.filter(s =>
    s.alive && Math.hypot(s.x - outcome.x, s.y - outcome.y) <= BLAST_R);
}

/* ============================================================
   4. Game state
   ============================================================ */

const KEY = 'graphwar.v1';
const store = {
  data: { muted: false, wins: 0, losses: 0 },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {} },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) {} },
};
store.load();

const game = {
  phase: 'menu',            // menu | aim | flying | over
  mode: 'ai',               // ai | hotseat
  diff: 'normal',
  turn: 'a',
  idx: { a: 0, b: 0 },      // round-robin cursor per team
  current: null,
  flight: null,
  t: 0,
};

const living = key => soldiers.filter(s => s.alive && s.team === key);

function pickSoldier(key) {
  const team = soldiers.filter(s => s.team === key);
  for (let n = 0; n < team.length; n++) {
    const s = team[(game.idx[key] + n) % team.length];
    if (s.alive) { game.idx[key] = (game.idx[key] + n + 1) % team.length; return s; }
  }
  return null;
}

/* ============================================================
   5. Audio
   ============================================================ */

const sfx = (() => {
  const NAMES = ['fire', 'explode', 'kill', 'miss', 'win', 'error', 'click'];
  const TONES = {
    fire: [520, 0.10, 'triangle'], explode: [110, 0.30, 'sawtooth'],
    kill: [180, 0.20, 'square'], miss: [300, 0.14, 'sine'],
    win: [1040, 0.24, 'triangle'], error: [190, 0.16, 'square'], click: [660, 0.05, 'square'],
  };
  const canOgg = !!document.createElement('audio')
    .canPlayType('audio/ogg; codecs="vorbis"').replace('no', '');
  const pools = {};
  let failed = false;
  if (canOgg) {
    for (const n of NAMES) {
      fetch(`assets/sounds/${n}.ogg`)
        .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then(b => {
          const url = URL.createObjectURL(b);
          pools[n] = { i: 0, els: Array.from({ length: 3 }, () => { const a = new Audio(url); a.volume = 0.4; return a; }) };
        })
        .catch(() => { failed = true; });
    }
  }
  const samples = () => canOgg && !failed;
  let ac = null;
  const ctxA = () => {
    if (!ac && window.AudioContext) ac = new AudioContext();
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };
  return {
    unlock() { if (!samples()) ctxA(); },
    toggle() { store.data.muted = !store.data.muted; store.save(); return store.data.muted; },
    play(n) {
      if (store.data.muted) return;
      if (samples()) {
        const p = pools[n];
        if (!p) return;
        const el = p.els[p.i = (p.i + 1) % p.els.length];
        try { el.currentTime = 0; el.play().catch(() => {}); } catch (_) {}
        return;
      }
      const a = ctxA();
      if (!a) return;
      const [f, d, type] = TONES[n] || TONES.click;
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.5), a.currentTime + d);
      g.gain.setValueAtTime(0.13, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      osc.connect(g).connect(a.destination);
      osc.start(); osc.stop(a.currentTime + d);
    },
  };
})();

/* ============================================================
   6. Rendering
   ============================================================ */

const canvas = $('#field');
const ctx = canvas.getContext('2d');

function resize() {
  const w = canvas.clientWidth;
  if (!w) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * dpr * CH / CW);
  const k = (w * dpr) / CW;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
window.addEventListener('resize', resize);

function drawGrid() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.beginPath();
  for (let x = -XR; x <= XR; x += 2) { ctx.moveTo(px(x), 0); ctx.lineTo(px(x), CH); }
  for (let y = -YR; y <= YR; y += 2) { ctx.moveTo(0, py(y)); ctx.lineTo(CW, py(y)); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.beginPath();
  for (let x = -30; x <= 30; x += 10) { ctx.moveTo(px(x), 0); ctx.lineTo(px(x), CH); }
  for (let y = -10; y <= 10; y += 10) { ctx.moveTo(0, py(y)); ctx.lineTo(CW, py(y)); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,.19)';
  ctx.beginPath();
  ctx.moveTo(0, py(0)); ctx.lineTo(CW, py(0));
  ctx.moveTo(px(0), 0); ctx.lineTo(px(0), CH);
  ctx.stroke();
}

function drawTerrain() {
  // Two passes of filled circles: the first paints a rim colour, the second an
  // inset body. Overlaps merge cleanly into one silhouette with an outline,
  // which stroking each circle individually would not do.
  ctx.fillStyle = '#47826a';
  ctx.beginPath();
  for (const b of terrain) { ctx.moveTo(px(b.x) + b.r * PU, py(b.y)); ctx.arc(px(b.x), py(b.y), b.r * PU, 0, Math.PI * 2); }
  ctx.fill();

  ctx.fillStyle = '#2c5a45';
  ctx.beginPath();
  for (const b of terrain) {
    const r = (b.r - 0.16) * PU;
    ctx.moveTo(px(b.x) + r, py(b.y)); ctx.arc(px(b.x), py(b.y), r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function strokePath(pts, count, color, width, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let drawing = false;
  const n = Math.min(count, pts.length / 2);
  for (let k = 0; k < n; k++) {
    const wx = pts[k * 2], wy = pts[k * 2 + 1];
    // Break the path when the curve leaves the visible field so wild functions
    // don't smear a straight line across the screen on re-entry.
    if (Math.abs(wy) > YR + 4) { drawing = false; continue; }
    const X = px(wx), Y = py(wy);
    if (drawing) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); drawing = true; }
  }
  ctx.stroke();
  ctx.restore();
}

function drawSoldier(s) {
  const T = TEAM[s.team];
  const X = px(s.x), Y = py(s.y), R = SOLDIER_R * PU;
  if (!s.alive) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X - R * .7, Y - R * .7); ctx.lineTo(X + R * .7, Y + R * .7);
    ctx.moveTo(X + R * .7, Y - R * .7); ctx.lineTo(X - R * .7, Y + R * .7);
    ctx.stroke();
    return;
  }
  if (s === game.current && game.phase === 'aim') {
    const pulse = 1 + Math.sin(game.t * 5) * 0.16;
    ctx.strokeStyle = T.trail;
    ctx.globalAlpha = .55;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, R * 1.9 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = T.fill;
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0f1b24';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f1b24';
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s.id), X, Y + .5);
}

function drawExplosions(dt) {
  for (const e of explosions) {
    e.age += dt;
    const k = e.age / e.life;
    if (k >= 1) continue;
    const R = BLAST_R * PU * (0.35 + k * 1.15);
    ctx.save();
    ctx.globalAlpha = (1 - k) * .75;
    ctx.fillStyle = '#ffd08a';
    ctx.beginPath(); ctx.arc(px(e.x), py(e.y), R * .6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = (1 - k) * .9;
    ctx.strokeStyle = '#ff8f3c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px(e.x), py(e.y), R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  explosions = explosions.filter(e => e.age < e.life);
}

function draw(dt) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = '#0f1b24';
  ctx.fillRect(0, 0, CW, CH);
  drawGrid();
  drawTerrain();

  for (const tr of trails) strokePath(tr.pts, Infinity, TEAM[tr.team].trail, 1.5, .16);
  if (game.flight) {
    const T = TEAM[game.flight.team];
    strokePath(game.flight.pts, game.flight.shown, T.trail, 2.6, .95);
  }
  for (const s of soldiers) drawSoldier(s);
  drawExplosions(dt);
}

/* ============================================================
   7. Turn flow
   ============================================================ */

const msgEl = $('#msg');
function say(text, cls) {
  msgEl.textContent = text || ' ';
  msgEl.className = 'msg' + (cls ? ' ' + cls : '');
}

function renderRosters() {
  for (const key of ['a', 'b']) {
    const host = $('#roster-' + key);
    host.textContent = '';
    for (const s of soldiers.filter(x => x.team === key)) {
      const d = document.createElement('span');
      d.className = 'pip ' + key + (s.alive ? '' : ' dead') + (s === game.current ? ' active' : '');
      d.textContent = s.id;
      d.title = `${TEAM[key].name} soldier ${s.id}${s.alive ? '' : ' (down)'}`;
      host.appendChild(d);
    }
  }
  const t = $('#turn-label');
  if (game.phase === 'over' || !game.current) { t.textContent = ' '; t.className = 'turn'; return; }
  const who = TEAM[game.turn].name;
  const isAi = game.mode === 'ai' && game.turn === 'b';
  t.textContent = isAi ? `${who} is thinking…` : `${who} — soldier ${game.current.id}`;
  t.className = 'turn ' + game.turn;
}

function setControlsEnabled(on) {
  $('#fn').disabled = !on;
  $('#btn-fire').disabled = !on;
  $('#angle').disabled = !on;
  $('#dir-left').disabled = !on;
  $('#dir-right').disabled = !on;
}

function newGame(keepMode) {
  if (!keepMode) game.phase = 'menu';
  terrain = genTerrain();
  soldiers = [...spawnTeam('a', -1), ...spawnTeam('b', +1)];
  trails = [];
  explosions = [];
  game.flight = null;
  game.idx = { a: 0, b: 0 };
  game.turn = 'a';
  game.current = pickSoldier('a');
  $('#ov-end').classList.add('hidden');
  if (keepMode) {
    game.phase = 'aim';
    $('#ov-menu').classList.add('hidden');
    say('Your move. Type a function and fire.');
  }
  setControlsEnabled(keepMode);
  renderRosters();
}

function nextTurn() {
  const aliveA = living('a').length, aliveB = living('b').length;
  if (!aliveA || !aliveB) { endGame(aliveA, aliveB); return; }
  game.turn = game.turn === 'a' ? 'b' : 'a';
  game.current = pickSoldier(game.turn);
  game.phase = 'aim';
  renderRosters();

  const aiTurn = game.mode === 'ai' && game.turn === 'b';
  setControlsEnabled(!aiTurn);
  if (aiTurn) setTimeout(aiMove, 750);
}

function endGame(aliveA, aliveB) {
  game.phase = 'over';
  game.current = null;
  setControlsEnabled(false);
  renderRosters();
  sfx.play('win');

  const h = $('#end-title'), p = $('#end-sub');
  if (!aliveA && !aliveB) {
    h.textContent = 'Everyone is down';
    h.className = '';
    p.textContent = 'That last blast took out both sides. Call it a draw.';
  } else {
    const key = aliveA ? 'a' : 'b';
    h.textContent = `${TEAM[key].name} wins`;
    h.className = key;
    p.textContent = `${TEAM[key === 'a' ? 'b' : 'a'].name} has no soldiers left.`;
    if (game.mode === 'ai') {
      if (key === 'a') store.data.wins++; else store.data.losses++;
      store.save();
      p.textContent += `  (You ${store.data.wins}–${store.data.losses} Computer)`;
    }
  }
  $('#ov-end').classList.remove('hidden');
}

function fire(f, dir, angle, label) {
  const shooter = game.current;
  const { pts, outcome } = simulate(shooter, f, dir, angle);
  game.flight = { pts, outcome, shown: 0, team: shooter.team, shooter };
  game.phase = 'flying';
  setControlsEnabled(false);
  renderRosters();
  sfx.play('fire');
  if (label) say(label);
}

function landShot() {
  const { outcome, shooter } = game.flight;
  trails.push({ pts: game.flight.pts, team: game.flight.team });
  if (trails.length > 8) trails.shift();

  let text = '', cls = '';
  if (outcome.kind === 'undefined') {
    text = 'The shot fizzled — the function is undefined there.';
    sfx.play('miss');
  } else if (outcome.kind === 'out') {
    text = 'Missed — the shot left the field.';
    sfx.play('miss');
  } else {
    explosions.push({ x: outcome.x, y: outcome.y, age: 0, life: 0.55 });
    sfx.play('explode');
    const victims = blastVictims(outcome);
    for (const v of victims) v.alive = false;
    if (!victims.length) {
      text = 'Hit the terrain — no one caught in the blast.';
    } else {
      const own = victims.filter(v => v.team === shooter.team);
      const foe = victims.filter(v => v.team !== shooter.team);
      const bits = [];
      if (foe.length) bits.push(`${foe.length} ${TEAM[foe[0].team].name.toLowerCase()} down`);
      if (own.length) bits.push(`${own.length} of your own down`);
      text = bits.join(' — ') + '!';
      cls = own.length ? 'err' : 'good';
      setTimeout(() => sfx.play('kill'), 90);
    }
  }
  game.flight = null;
  say(text, cls);
  setTimeout(nextTurn, 620);
}

/* ============================================================
   8. Computer opponent
   Candidates are parabolas forced through the target point, so the search is
   only over how much the shot arcs — which is what clears terrain.
   ============================================================ */

const DIFF = {
  easy:   { tries: 25,  err: 4.6 },
  normal: { tries: 70,  err: 1.9 },
  hard:   { tries: 220, err: 0.15 },
};

const fmt = v => (Math.round(v * 1000) / 1000).toString();

// The parabola y = a*x^2 + b*x that passes through the target, offset by (ex, ey).
// Fixing the endpoint means the search only has to explore how much the shot arcs,
// which is exactly the part that decides whether it clears the terrain.
function shotThrough(shooter, target, a, ex, ey) {
  const dx = target.x - shooter.x;
  const dir = dx >= 0 ? 1 : -1;
  const tx = Math.abs(dx) + ex;
  const ty = (target.y - shooter.y) + ey;
  if (tx < 1) return null;
  const b = (ty - a * tx * tx) / tx;
  if (!isFinite(a) || !isFinite(b)) return null;
  return {
    dir, angle: 0, a, target,
    f: x => a * x * x + b * x,
    src: `${fmt(a)}*x^2 + ${fmt(b)}*x`,
  };
}

function scoreShot(shooter, pts, outcome) {
  const foes = soldiers.filter(s => s.alive && s.team !== shooter.team);
  if (!foes.length) return -1e9;

  let minD = Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    for (const e of foes) {
      const d = Math.hypot(pts[k] - e.x, pts[k + 1] - e.y);
      if (d < minD) minD = d;
    }
  }
  let score = Math.max(0, 300 - minD * 20);

  if (outcome.kind === 'hit' || outcome.kind === 'terrain') {
    for (const s of soldiers) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - outcome.x, s.y - outcome.y);
      if (d > BLAST_R) continue;
      score += s === shooter ? -3000 : s.team === shooter.team ? -1800 : 1000;
    }
  }
  return score;
}

function aiMove() {
  if (game.phase !== 'aim' || !game.current) return;
  const shooter = game.current;
  const foes = soldiers.filter(s => s.alive && s.team !== shooter.team);
  if (!foes.length) { nextTurn(); return; }

  const cfg = DIFF[game.diff] || DIFF.normal;
  let best = null;
  for (let k = 0; k < cfg.tries; k++) {
    const target = foes[Math.floor(Math.random() * foes.length)];
    const c = shotThrough(shooter, target, rand(-0.14, 0.14), 0, 0);   // aim true while searching
    if (!c) continue;
    const { pts, outcome } = simulate(shooter, c.f, c.dir, c.angle, DT_AI);
    const score = scoreShot(shooter, pts, outcome);
    if (!best || score > best.score) best = { ...c, score };
  }
  if (!best) {                                   // nothing viable — lob something
    const dir = foes[0].x >= shooter.x ? 1 : -1;
    best = { f: () => 0, src: '0', dir, angle: 0 };
  }

  // Difficulty is applied HERE, not to the candidates. Jittering the candidates
  // does nothing: the best-of-N pick simply selects whichever random error
  // cancelled out, and the opponent lands every shot regardless of setting.
  const aimed = best.target && cfg.err > 0.001
    ? shotThrough(shooter, best.target, best.a, rand(-cfg.err, cfg.err), rand(-cfg.err, cfg.err))
    : null;
  const shot = aimed || best;
  fire(shot.f, shot.dir, shot.angle, `Red fired  y = ${shot.src}`);
}

/* ============================================================
   9. Loop
   ============================================================ */

let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  game.t += dt;

  if (game.flight) {
    const total = game.flight.pts.length / 2;
    const speed = Math.max(26, total / 110);     // long flights don't crawl
    game.flight.shown += speed;
    if (game.flight.shown >= total) landShot();
  }
  draw(dt);
  requestAnimationFrame(frame);
}

/* ============================================================
   10. UI
   ============================================================ */

let dir = 1;

function setDir(d) {
  dir = d;
  $('#dir-left').classList.toggle('on', d === -1);
  $('#dir-right').classList.toggle('on', d === 1);
}

const EXAMPLES = ['0', 'x', '-x', 'x/3', '0.05*x^2', '-0.05*x^2', '3*sin(x/2)',
                  '2*sin(x)+x/4', '5*cos(x/3)', 'sqrt(x)', 'exp(x/9)', 'x^2/40-x'];

function buildExamples() {
  const host = $('#examples');
  for (const e of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ex';
    b.textContent = e;
    b.addEventListener('click', () => {
      $('#fn').value = e;
      $('#fn').classList.remove('bad');
      $('#fn').focus();
      sfx.unlock(); sfx.play('click');
    });
    host.appendChild(b);
  }
}

$('#controls').addEventListener('submit', ev => {
  ev.preventDefault();
  sfx.unlock();
  if (game.phase !== 'aim' || !game.current) return;
  const src = $('#fn').value;
  let f;
  try {
    f = compile(src);
  } catch (err) {
    $('#fn').classList.add('bad');
    say(err instanceof FnError ? err.message : 'That function could not be read', 'err');
    sfx.play('error');
    return;
  }
  $('#fn').classList.remove('bad');
  fire(f, dir, +$('#angle').value, '');
});

$('#fn').addEventListener('input', () => $('#fn').classList.remove('bad'));

$('#dir-left').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); setDir(-1); });
$('#dir-right').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); setDir(1); });

$('#angle').addEventListener('input', e => { $('#angle-val').textContent = e.target.value + '°'; });
$('#btn-reset-angle').addEventListener('click', () => {
  $('#angle').value = 0; $('#angle-val').textContent = '0°';
  sfx.unlock(); sfx.play('click');
});

for (const b of document.querySelectorAll('#ov-menu .btn[data-mode]')) {
  b.addEventListener('click', () => {
    sfx.unlock(); sfx.play('click');
    game.mode = b.dataset.mode;
    game.diff = b.dataset.diff || 'normal';
    setDir(1);
    newGame(true);
  });
}

$('#btn-new').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); openMenu(); });
$('#btn-rematch').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); setDir(1); newGame(true); });
$('#btn-menu').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); openMenu(); });

function openMenu() {
  game.phase = 'menu';
  game.flight = null;
  setControlsEnabled(false);
  $('#ov-end').classList.add('hidden');
  $('#ov-menu').classList.remove('hidden');
  say('');
  renderRosters();
}

const openHelp = () => { $('#ov-help').classList.remove('hidden'); };
const closeHelp = () => { $('#ov-help').classList.add('hidden'); };
$('#btn-help').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); openHelp(); });
$('#btn-help2').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); openHelp(); });
$('#btn-help-close').addEventListener('click', () => { sfx.play('click'); closeHelp(); });
$('#ov-help').addEventListener('click', e => { if (e.target.id === 'ov-help') closeHelp(); });

function toggleSound() {
  const muted = sfx.toggle();
  const b = $('#btn-sound');
  b.classList.toggle('off', muted);
  b.setAttribute('aria-pressed', String(muted));
  b.title = muted ? 'Sound off' : 'Sound on';
  if (!muted) sfx.play('click');
}
$('#btn-sound').addEventListener('click', () => { sfx.unlock(); toggleSound(); });

window.addEventListener('keydown', e => {
  if (!$('#ov-help').classList.contains('hidden')) {
    if (e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); closeHelp(); }
    return;
  }
  const typing = document.activeElement === $('#fn');
  if (e.code === 'KeyH' && !typing) { e.preventDefault(); openHelp(); }
  else if (e.code === 'KeyN' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openMenu(); }
  else if (e.code === 'KeyM' && !typing) { toggleSound(); }
});

/* ============================================================
   11. Boot
   ============================================================ */

// file:// has no directory index, so a folder link would open a file listing.
if (location.protocol === 'file:') {
  document.querySelectorAll('a[href$="/"]').forEach(a =>
    a.setAttribute('href', a.getAttribute('href') + 'index.html'));
}

if (store.data.muted) {
  $('#btn-sound').classList.add('off');
  $('#btn-sound').setAttribute('aria-pressed', 'true');
  $('#btn-sound').title = 'Sound off';
}

buildExamples();
setDir(1);
resize();
newGame(false);
setControlsEnabled(false);
requestAnimationFrame(frame);

})();
