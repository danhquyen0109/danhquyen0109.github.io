/* ============================================================
   2048 — slide, merge, reach 2048.
   Original implementation; sounds by Kenney (CC0). See CREDITS.md.
   ============================================================ */
(() => {
'use strict';

const N        = 4;
const SLIDE_MS = 110;          // must match --slide in style.css
const WIN_AT   = 2048;
const UNDO_MAX = 12;
const KEY      = 'g2048.v1';

const $ = s => document.querySelector(s);

// ---------- Persistence ----------
const store = {
  data: { best: 0, muted: false, grid: null, score: 0, won: false },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (_) { /* private mode — play without saving */ }
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) {}
  },
};
store.load();

// ---------- Audio ----------
// Each sound is fetched once and shared across a small voice pool via a blob URL.
// Browsers that can't decode Vorbis (and file:// opens, where fetch is blocked)
// fall back to short WebAudio tones rather than going silent.
const sfx = (() => {
  const FILES = { move: 'move', merge: 'merge', win: 'win', lose: 'lose', click: 'click', undo: 'undo' };
  const TONES = {
    move:  [420, 0.05, 'triangle'],
    merge: [700, 0.10, 'square'],
    win:   [1040, 0.22, 'triangle'],
    lose:  [130, 0.26, 'sawtooth'],
    click: [660, 0.05, 'square'],
    undo:  [340, 0.09, 'sine'],
  };
  const canOgg = !!document.createElement('audio')
    .canPlayType('audio/ogg; codecs="vorbis"').replace('no', '');
  const pools = {};
  let failed = false;
  if (canOgg) {
    for (const k of Object.keys(FILES)) {
      fetch(`assets/sounds/${FILES[k]}.ogg`)
        .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then(b => {
          const url = URL.createObjectURL(b);
          pools[k] = { i: 0, els: Array.from({ length: 3 }, () => { const a = new Audio(url); a.volume = 0.4; return a; }) };
        })
        .catch(() => { failed = true; });
    }
  }
  const samples = () => canOgg && !failed;
  let ac = null;
  const audioCtx = () => {
    if (!ac && window.AudioContext) ac = new AudioContext();
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  };
  return {
    unlock() { if (!samples()) audioCtx(); },
    toggle() { store.data.muted = !store.data.muted; store.save(); return store.data.muted; },
    play(name) {
      if (store.data.muted) return;
      if (samples()) {
        const p = pools[name];
        if (!p) return;
        const el = p.els[p.i = (p.i + 1) % p.els.length];
        try { el.currentTime = 0; el.play().catch(() => {}); } catch (_) {}
        return;
      }
      const a = audioCtx();
      if (!a) return;
      const [f, d, type] = TONES[name] || TONES.click;
      const osc = a.createOscillator(), g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.6), a.currentTime + d);
      g.gain.setValueAtTime(0.12, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      osc.connect(g).connect(a.destination);
      osc.start(); osc.stop(a.currentTime + d);
    },
  };
})();

// ---------- State ----------
const boardEl = $('#board');
const tilesEl = $('#tiles');

let cells;              // N×N of tile objects or null
let score = 0;
let won = false;        // 2048 reached and acknowledged — stops re-prompting
let dead = false;
let undoStack = [];
let nextId = 1;

// The tail end of a move (drop the absorbed tiles, pop the merges, spawn the new tile)
// runs once the slide finishes. Rather than swallow input during those ~110ms, a move
// arriving early flushes the previous one first, so fast play never loses a keypress.
let pendingTimer = null;
let pendingFinish = null;

function flushPending() {
  if (!pendingFinish) return;
  clearTimeout(pendingTimer);
  const fn = pendingFinish;
  pendingFinish = null; pendingTimer = null;
  fn();
}

function cancelPending() {
  clearTimeout(pendingTimer);
  pendingFinish = null; pendingTimer = null;
}

const inBounds = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const allTiles = () => cells.flat().filter(Boolean);
const emptyCells = () => {
  const out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!cells[r][c]) out.push({ r, c });
  return out;
};

// ---------- Rendering ----------
const coord = i => `calc(var(--gap) + ${i} * var(--step))`;

function buildCells() {
  const frag = document.createDocumentFragment();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.style.left = coord(c);
    d.style.top = coord(r);
    frag.appendChild(d);
  }
  $('#cells').appendChild(frag);
}

function styleTile(t) {
  const digits = String(t.val).length;
  t.el.className = 'tile' + (digits === 4 ? ' d4' : digits >= 5 ? ' d5' : '') + (t.val >= 4096 ? ' huge' : '');
  t.el.dataset.v = t.val;
  t.el.textContent = t.val;
}

function place(el, r, c) {
  el.style.left = coord(c);
  el.style.top = coord(r);
}

function makeTile(r, c, val, spawn) {
  const el = document.createElement('div');
  const t = { id: nextId++, val, r, c, el, merged: false };
  styleTile(t);
  place(el, r, c);
  if (spawn) el.classList.add('spawn');
  tilesEl.appendChild(el);
  cells[r][c] = t;
  return t;
}

function replay(el, cls) {          // restart a CSS animation
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setUnit() {
  // One hundredth of the board width, so tile type scales with the board.
  boardEl.style.setProperty('--u', (boardEl.clientWidth / 100) + 'px');
}
window.addEventListener('resize', setUnit);

// ---------- Score ----------
function setScore(v, gained) {
  score = v;
  $('#score').textContent = score;
  if (score > store.data.best) {
    store.data.best = score;
    $('#best').textContent = score;
  }
  if (gained > 0) {
    const g = $('#gain');
    g.textContent = '+' + gained;
    replay(g, 'run');
  }
}

// ---------- Snapshots (undo) ----------
function snapshot() {
  return {
    vals: cells.map(row => row.map(t => (t ? t.val : 0))),
    score, won,
  };
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  syncUndoButtons();
}

function syncUndoButtons() {
  const can = undoStack.length > 0;
  $('#btn-undo').disabled = !can;
  $('#btn-undo2').disabled = !can;
}

function loadSnapshot(s) {
  cancelPending();              // the interrupted move's spawn must not land on the restored board
  tilesEl.textContent = '';
  cells = Array.from({ length: N }, () => Array(N).fill(null));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (s.vals[r][c]) makeTile(r, c, s.vals[r][c], false);
  }
  won = s.won;
  dead = false;
  setScore(s.score, 0);
  hideEnd();
  persist();
}

function undo() {
  if (!undoStack.length) return;
  sfx.play('undo');
  loadSnapshot(undoStack.pop());
  syncUndoButtons();
  say('Move undone');
}

// ---------- Moving ----------
const VEC = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

function move(dir) {
  flushPending();               // settle the previous move before starting this one
  if (dead) return;
  const [dr, dc] = VEC[dir];
  const rOrder = dr > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cOrder = dc > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];

  const before = snapshot();
  const absorbed = [];      // tiles that slid into a merge and must be removed
  const popped = [];
  let moved = false, gained = 0;

  for (const t of allTiles()) t.merged = false;

  for (const r of rOrder) for (const c of cOrder) {
    const tile = cells[r][c];
    if (!tile) continue;

    let nr = r, nc = c, mergedInto = null;
    for (;;) {
      const tr = nr + dr, tc = nc + dc;
      if (!inBounds(tr, tc)) break;
      const occ = cells[tr][tc];
      if (!occ) { nr = tr; nc = tc; continue; }
      if (occ.val === tile.val && !occ.merged && !tile.merged) mergedInto = { occ, r: tr, c: tc };
      break;
    }

    if (mergedInto) {
      const { occ, r: tr, c: tc } = mergedInto;
      cells[r][c] = null;
      occ.val *= 2;
      occ.merged = true;
      styleTile(occ);
      gained += occ.val;
      absorbed.push({ tile, r: tr, c: tc });
      popped.push(occ);
      moved = true;
    } else if (nr !== r || nc !== c) {
      cells[r][c] = null;
      cells[nr][nc] = tile;
      tile.r = nr; tile.c = nc;
      moved = true;
    }
  }

  if (!moved) return;

  undoStack.push(before);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  syncUndoButtons();

  // slide everything to its new home
  for (const t of allTiles()) place(t.el, t.r, t.c);
  for (const { tile, r, c } of absorbed) {
    tile.el.style.zIndex = '0';     // slide underneath the tile it merges into
    place(tile.el, r, c);
  }

  setScore(score + gained, gained);
  sfx.play(gained > 0 ? 'merge' : 'move');

  pendingFinish = () => {
    for (const { tile } of absorbed) tile.el.remove();
    for (const t of popped) replay(t.el, 'pop');
    addRandomTile();
    persist();
    checkEnd();
  };
  pendingTimer = setTimeout(flushPending, SLIDE_MS);
}

function addRandomTile() {
  const free = emptyCells();
  if (!free.length) return;
  const { r, c } = free[Math.floor(Math.random() * free.length)];
  makeTile(r, c, Math.random() < 0.9 ? 2 : 4, true);
}

// ---------- End conditions ----------
function hasMoves() {
  if (emptyCells().length) return true;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = cells[r][c].val;
    if ((inBounds(r, c + 1) && cells[r][c + 1].val === v) ||
        (inBounds(r + 1, c) && cells[r + 1][c].val === v)) return true;
  }
  return false;
}

function checkEnd() {
  if (!won && allTiles().some(t => t.val >= WIN_AT)) {
    won = true;
    persist();
    sfx.play('win');
    showEnd('You win!', `You built a ${WIN_AT} tile. Keep going for a bigger score?`, true);
    return;
  }
  if (!hasMoves()) {
    dead = true;
    sfx.play('lose');
    showEnd('Game over', `No moves left. Final score ${score}.`, false);
  }
}

function showEnd(title, sub, isWin) {
  const h = $('#end-title');
  h.textContent = title;
  h.classList.toggle('win', isWin);
  $('#end-sub').textContent = sub;
  $('#btn-keep').hidden = !isWin;
  $('#btn-again').textContent = isWin ? 'New game' : 'Try again';
  $('#ov-end').classList.remove('hidden');
  say(title);
}

const hideEnd = () => $('#ov-end').classList.add('hidden');
const say = msg => { $('#status').textContent = msg; };

// ---------- New game / persistence ----------
function persist() {
  store.data.grid = cells.map(row => row.map(t => (t ? t.val : 0)));
  store.data.score = score;
  store.data.won = won;
  store.save();
}

function newGame() {
  cancelPending();
  tilesEl.textContent = '';
  cells = Array.from({ length: N }, () => Array(N).fill(null));
  undoStack = [];
  syncUndoButtons();
  won = false; dead = false;
  setScore(0, 0);
  addRandomTile();
  addRandomTile();
  hideEnd();
  persist();
  say('New game');
}

function restoreOrNew() {
  const g = store.data.grid;
  const valid = Array.isArray(g) && g.length === N && g.every(row => Array.isArray(row) && row.length === N);
  if (!valid || !g.flat().some(Boolean)) { newGame(); return; }
  cells = Array.from({ length: N }, () => Array(N).fill(null));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (g[r][c]) makeTile(r, c, g[r][c], false);
  }
  won = !!store.data.won;
  setScore(store.data.score || 0, 0);
  if (!hasMoves()) { dead = true; showEnd('Game over', `No moves left. Final score ${score}.`, false); }
}

// ---------- Input ----------
const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
};

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('#ov-help').classList.contains('hidden')) {
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); closeHelp(); }
    return;
  }
  const dir = KEYS[e.code];
  if (dir) { e.preventDefault(); sfx.unlock(); move(dir); return; }
  if (e.code === 'KeyU') { e.preventDefault(); undo(); }
  else if (e.code === 'KeyN') { e.preventDefault(); newGame(); }
  else if (e.code === 'KeyM') { toggleSound(); }
  else if (e.code === 'Escape') { hideEnd(); }
});

// Swipe
let sx = 0, sy = 0, tracking = false;
boardEl.addEventListener('pointerdown', e => {
  tracking = true; sx = e.clientX; sy = e.clientY;
  sfx.unlock();
});
boardEl.addEventListener('pointerup', e => {
  if (!tracking) return;
  tracking = false;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < 24) return;                   // a tap, not a swipe
  move(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
boardEl.addEventListener('pointercancel', () => { tracking = false; });

// ---------- UI wiring ----------
function on(sel, fn) {
  $(sel).addEventListener('click', e => { e.preventDefault(); sfx.unlock(); fn(); });
}

function toggleSound() {
  const muted = sfx.toggle();
  const b = $('#btn-sound');
  b.classList.toggle('off', muted);
  b.setAttribute('aria-pressed', String(muted));
  b.title = muted ? 'Sound off' : 'Sound on';
  if (!muted) sfx.play('click');
}

const closeHelp = () => $('#ov-help').classList.add('hidden');

on('#btn-new',   () => { sfx.play('click'); newGame(); });
on('#btn-undo',  undo);
on('#btn-undo2', () => { undo(); });
on('#btn-again', () => { sfx.play('click'); newGame(); });
on('#btn-keep',  () => { sfx.play('click'); hideEnd(); });
on('#btn-help',  () => { sfx.play('click'); $('#ov-help').classList.remove('hidden'); });
on('#btn-help-close', () => { sfx.play('click'); closeHelp(); });
$('#btn-sound').addEventListener('click', e => { e.preventDefault(); sfx.unlock(); toggleSound(); });
$('#ov-help').addEventListener('click', e => { if (e.target.id === 'ov-help') closeHelp(); });

// ---------- Boot ----------
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
$('#best').textContent = store.data.best;

buildCells();
setUnit();
restoreOrNew();
syncUndoButtons();

})();
