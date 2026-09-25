/* ============================================================
   Caro — five in a row on a 30×30 board.
   vs Computer, 2 players on one device, or online peer-to-peer
   (WebRTC via PeerJS — no game server of our own).
   Original implementation; sounds by Kenney (CC0). See CREDITS.md.
   ============================================================ */
(() => {
'use strict';

const N    = 30;
const SIZE = N * N;
const WIN  = 5;
const X = 1, O = 2;
const KEY  = 'caro.v1';
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

const $ = s => document.querySelector(s);
const other = p => 3 - p;
const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

// ---------- Persistence ----------
const store = {
  data: { muted: false, mode: 'ai', level: 'normal', blockRule: false, tally: { ai: [0, 0], local: [0, 0] } },
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
// Same scheme as 2048: fetch each .ogg once, share it across a small voice pool, and
// fall back to WebAudio tones where Vorbis can't be decoded (or fetch is blocked).
const sfx = (() => {
  const FILES = ['place', 'win', 'lose', 'click', 'undo'];
  const TONES = {
    place: [520, 0.05, 'triangle'],
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
    for (const k of FILES) {
      fetch(`assets/sounds/${k}.ogg`)
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
let board  = new Uint8Array(SIZE);
let moves  = [];
let gameNo = 0;            // the side that opens alternates: even games X, odd games O
let over   = null;         // { winner: X|O|0, line: [...] } once the game ends
let mode   = store.data.mode;
let aiTimer = null;
const tally = { ai: store.data.tally.ai || [0, 0], local: store.data.tally.local || [0, 0], online: [0, 0] };

const starter = () => (gameNo % 2 === 0 ? X : O);
const turn    = () => (moves.length % 2 === 0 ? starter() : other(starter()));

// ---------- Rules ----------
// The run of `p` through `i` that makes five, or null. With the block rule on, a run
// whose two ends are both capped by the opponent doesn't count; the board edge is not
// the opponent, so it never blocks.
function winLine(b, i, p) {
  const r = (i / N) | 0, c = i % N, opp = other(p);
  for (const [dr, dc] of DIRS) {
    const cells = [i];
    let rr = r + dr, cc = c + dc;
    while (inb(rr, cc) && b[rr * N + cc] === p) { cells.push(rr * N + cc); rr += dr; cc += dc; }
    const endA = inb(rr, cc) ? b[rr * N + cc] : -1;
    rr = r - dr; cc = c - dc;
    while (inb(rr, cc) && b[rr * N + cc] === p) { cells.unshift(rr * N + cc); rr -= dr; cc -= dc; }
    const endB = inb(rr, cc) ? b[rr * N + cc] : -1;
    if (cells.length < WIN) continue;
    if (store.data.blockRule && endA === opp && endB === opp) continue;
    return cells;
  }
  return null;
}

function winsAt(b, i, p) {
  b[i] = p;
  const w = winLine(b, i, p);
  b[i] = 0;
  return !!w;
}

// ---------- Computer player ----------
// Every 5-cell window through a square that holds none of the opponent's stones is a
// place a five could still form; the fuller it already is, the more it's worth.
// Summing those windows rewards open lines, broken lines (X_XX) and double threats
// without special-casing any of them.
const W = [0, 1, 12, 130, 1600, 1e6];   // index = stones in the window counting the new one

function potential(b, i, p) {
  const r = (i / N) | 0, c = i % N, opp = other(p);
  let s = 0;
  for (const [dr, dc] of DIRS) {
    for (let k = -4; k <= 0; k++) {
      let cnt = 0, ok = true;
      for (let t = k; t < k + 5; t++) {
        const rr = r + dr * t, cc = c + dc * t;
        if (!inb(rr, cc)) { ok = false; break; }
        const v = b[rr * N + cc];
        if (v === opp) { ok = false; break; }
        if (v === p) cnt++;
      }
      if (ok) s += W[cnt + 1];
    }
  }
  return s;
}

function candidates(b) {
  const out = [];
  let any = false;
  for (let i = 0; i < SIZE; i++) {
    if (b[i]) { any = true; continue; }
    const r = (i / N) | 0, c = i % N;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (inb(rr, cc) && b[rr * N + cc]) { near = true; break; }
      }
    }
    if (near) out.push(i);
  }
  if (!any) return [((N / 2) | 0) * N + ((N / 2) | 0)];
  return out;
}

const LEVELS = {
  //        attack  defend  noise  sees-your-win  lookahead
  easy:   { a: 1.0,  d: 0.55, n: 0.45, block: 0.6, look: false },
  normal: { a: 1.05, d: 1.0,  n: 0.08, block: 1,   look: false },
  hard:   { a: 1.1,  d: 1.0,  n: 0,    block: 1,   look: true  },
};

function aiMove(me) {
  const L = LEVELS[store.data.level] || LEVELS.normal;
  const b = board, you = other(me);
  const cands = candidates(b);
  if (cands.length === 1) return cands[0];

  for (const i of cands) if (winsAt(b, i, me)) return i;
  if (Math.random() < L.block) for (const i of cands) if (winsAt(b, i, you)) return i;

  const scored = cands.map(i => {
    const s = potential(b, i, me) * L.a + potential(b, i, you) * L.d;
    return { i, s: s * (1 + (Math.random() * 2 - 1) * L.n) };
  }).sort((p, q) => q.s - p.s);

  if (!L.look) return scored[0].i;

  // Hard: for the ten most promising squares, see how good the reply is and prefer
  // the move that leaves the opponent the least.
  let best = scored[0].i, bestV = -Infinity;
  for (const { i, s } of scored.slice(0, 10)) {
    b[i] = me;
    let reply = 0;
    for (const j of candidates(b)) {
      if (winsAt(b, j, you)) { reply = 1e7; break; }
      const v = potential(b, j, you) * 1.1 + potential(b, j, me) * 0.8;
      if (v > reply) reply = v;
    }
    b[i] = 0;
    const v = s - reply * 0.7;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

const cancelAI = () => { clearTimeout(aiTimer); aiTimer = null; };

function maybeAI() {
  if (mode !== 'ai' || over || turn() !== O || aiTimer) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (mode !== 'ai' || over || turn() !== O) return;
    place(aiMove(O));
  }, 260 + Math.random() * 240);
  render();
}

// ---------- Online (WebRTC, peer-to-peer) ----------
// PeerJS only brokers the handshake through its free public signalling server; once
// the two browsers are connected, moves travel directly between them. The host is X,
// the guest O. The host's board is the source of truth: whenever the two disagree
// (a race on "new game", a dropped message) the host sends its whole state.
const net = { peer: null, conn: null, role: null, room: null, me: X, timer: null, seen: 0 };
const connected = () => !!(net.conn && net.conn.open);

// A tab that is closed or a phone that locks can drop the channel without it ever
// reporting "close", so both sides ping and treat 15s of silence as a disconnect.
setInterval(() => {
  if (!connected()) return;
  if (Date.now() - net.seen > 15000) { net.conn.close(); return; }
  send({ t: 'ping' });
}, 4000);

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the networking library.'));
    document.head.appendChild(s);
  });
}

const roomUrl = id => `${location.origin}${location.pathname}?room=${encodeURIComponent(id)}`;

function randomId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, v => 'abcdefghjkmnpqrstuvwxyz23456789'[v % 31]).join('');
}

function setNet(state, text) {
  $('#net-dot').className = 'dot ' + (state || '');
  $('#net-status').textContent = text;
}

function teardown() {
  clearTimeout(net.timer);
  const peer = net.peer;
  net.peer = net.conn = null;
  if (peer) try { peer.destroy(); } catch (_) {}
}

function send(msg) { if (connected()) try { net.conn.send(msg); } catch (_) {} }

function sendSync() {
  if (net.role === 'host') send({ t: 'sync', g: gameNo, moves, rule: store.data.blockRule, tally: tally.online });
}

async function hostRoom() {
  teardown();
  Object.assign(net, { role: 'host', me: X, room: null });
  setNet('wait', 'Opening a room…');
  showRoomUI();
  try { await loadPeerJS(); } catch (e) { return setNet('err', e.message); }
  const id = 'caro-' + randomId();
  const peer = net.peer = new Peer(id, { debug: 0 });
  peer.on('open', () => {
    if (net.peer !== peer) return;
    net.room = id;
    $('#room-link').value = roomUrl(id);
    showRoomUI();
    setNet('wait', 'Waiting for your friend to open the link…');
  });
  peer.on('connection', c => {
    if (connected()) {                       // two's company
      c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 400); });
      return;
    }
    bindConn(c);
  });
  peer.on('disconnected', () => { if (net.peer === peer && !peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (net.peer !== peer) return;
    if (e.type === 'unavailable-id') return hostRoom();
    netError(e);
  });
}

async function joinRoom(id) {
  teardown();
  Object.assign(net, { role: 'guest', me: O, room: id });
  showRoomUI();
  setNet('wait', 'Joining the room…');
  try { await loadPeerJS(); } catch (e) { return setNet('err', e.message); }
  const peer = net.peer = new Peer({ debug: 0 });
  peer.on('open', () => {
    if (net.peer !== peer) return;
    bindConn(peer.connect(id, { reliable: true }));
    net.timer = setTimeout(() => {
      if (net.peer === peer && !connected()) netError({ type: 'timeout' });
    }, 20000);
  });
  peer.on('error', e => { if (net.peer === peer) netError(e); });
}

function netError(e) {
  const msg = {
    'peer-unavailable': 'Room not found — the host may have closed it.',
    'network': 'Lost the connection to the matchmaking server.',
    'server-error': 'The matchmaking server is unavailable. Try again shortly.',
    'browser-incompatible': 'This browser does not support peer-to-peer play.',
    'timeout': 'Couldn’t reach your friend. A strict network may be blocking it.',
  }[e.type] || 'Connection problem. Try again.';
  setNet('err', msg);
  $('#btn-retry').hidden = net.role !== 'guest';
  render();
}

function bindConn(c) {
  net.conn = c;
  c.on('open', () => {
    if (net.conn !== c) return;
    clearTimeout(net.timer);
    net.seen = Date.now();
    setNet('on', net.role === 'host' ? 'Friend connected — you are X.' : 'Connected — you are O.');
    $('#btn-retry').hidden = true;
    sfx.play('click');
    sendSync();
    render();
  });
  c.on('data', m => { if (net.conn === c) { net.seen = Date.now(); onData(m); } });
  c.on('close', () => {
    if (net.conn !== c) return;
    net.conn = null;
    if (net.role === 'host') {
      setNet('wait', 'Your friend left. Waiting for them to reopen the link…');
    } else {
      setNet('err', 'Disconnected from the host.');
      $('#btn-retry').hidden = false;
    }
    render();
  });
  c.on('error', () => {});
}

function onData(m) {
  if (!m || typeof m !== 'object') return;
  const legal = i => Number.isInteger(i) && i >= 0 && i < SIZE && !board[i];
  switch (m.t) {
    case 'sync':
      if (net.role !== 'guest' || !Array.isArray(m.moves) || !m.moves.every(Number.isInteger)) return;
      store.data.blockRule = !!m.rule;
      if (Array.isArray(m.tally)) tally.online = m.tally.slice(0, 2).map(Number);
      loadGame(m.g | 0, m.moves);
      break;
    case 'move':
      if (m.g === gameNo && m.n === moves.length && legal(m.i) && !over && turn() !== net.me) {
        place(m.i, true);
      } else if (net.role === 'host') sendSync();
      else send({ t: 'need' });
      break;
    case 'new':
      if ((m.g | 0) > gameNo) { startGame(m.g | 0); sfx.play('click'); }
      sendSync();
      break;
    case 'need':
      sendSync();
      break;
    case 'bye':
      net.conn.close();
      break;
    case 'full':
      setNet('err', 'That room already has two players.');
      teardown();
      break;
  }
}

function showRoomUI() {
  const hosting = net.role === 'host' && net.room;
  $('#room-idle').hidden = !!net.role;
  $('#room-open').hidden = !hosting;
  $('#btn-share').hidden = !hosting || !navigator.share;
  $('#btn-leave').hidden = !net.role;
  $('#btn-retry').hidden = true;
  render();
}

function leaveRoom() {
  teardown();
  Object.assign(net, { role: null, room: null, me: X });
  if (location.search) history.replaceState(null, '', location.pathname);
  showRoomUI();
  setNet('', 'Not connected');
  tally.online = [0, 0];
  gameNo = 0;
  startGame(0);
}

// ---------- Game flow ----------
function loadGame(g, list) {
  cancelAI();
  gameNo = g;
  board = new Uint8Array(SIZE);
  moves = [];
  over = null;
  for (const i of list) {
    if (board[i]) break;
    const p = turn();
    board[i] = p;
    moves.push(i);
    const w = winLine(board, i, p);
    if (w) { over = { winner: p, line: w, counted: true }; break; }
  }
  if (!over && moves.length === SIZE) over = { winner: 0, line: [], counted: true };
  hideEnd();
  render();
  if (moves.length) reveal(moves[moves.length - 1]); else centerView();
  if (over) showEnd(false);
}

function startGame(g) {
  loadGame(g, []);
  maybeAI();
}

function newGame() {
  if (mode === 'online') {
    if (!connected()) return flash('Waiting for your friend to join.');
    startGame(gameNo + 1);
    send({ t: 'new', g: gameNo });
  } else {
    startGame(gameNo + 1);
  }
  sfx.play('click');
}

function place(i, fromNet) {
  const p = turn();
  board[i] = p;
  moves.push(i);
  sfx.play('place');
  if (mode === 'online' && !fromNet) send({ t: 'move', g: gameNo, n: moves.length - 1, i });

  const line = winLine(board, i, p);
  if (line) {
    over = { winner: p, line, counted: true };
    tally[mode][p - 1]++;
    saveTally();
  } else if (moves.length === SIZE) {
    over = { winner: 0, line: [], counted: true };
  }
  render(i);
  if (!mine(p)) reveal(i);
  if (over) return setTimeout(() => showEnd(true), 450);
  maybeAI();
}

function mine(p) {
  if (mode === 'ai') return p === X;
  if (mode === 'online') return p === net.me;
  return true;
}

function canTap() {
  if (over || aiTimer) return false;
  if (mode === 'online') return connected() && turn() === net.me;
  return mine(turn());
}

function undo() {
  if (mode === 'online' || !moves.length) return;
  if (mode === 'ai' && !moves.some(i => board[i] === X)) return;
  cancelAI();
  if (over && over.winner) { tally[mode][over.winner - 1]--; saveTally(); }
  over = null;
  const pop = () => { board[moves.pop()] = 0; };
  pop();
  if (mode === 'ai') while (moves.length && turn() !== X) pop();
  hideEnd();
  sfx.play('undo');
  render();
  maybeAI();
}

function saveTally() {
  store.data.tally = { ai: tally.ai, local: tally.local };
  store.save();
}

function setMode(m) {
  if (m === mode) return;
  if (mode === 'online') leaveRoom();
  cancelAI();
  mode = m;
  store.data.mode = m;
  store.save();
  $('#panel-online').hidden = m !== 'online';
  gameNo = 0;
  startGame(0);
  sfx.play('click');
}

// ---------- Rendering ----------
const boardEl = $('#board');
const cellEls = [];
for (let i = 0; i < SIZE; i++) {
  const b = document.createElement('button');
  b.className = 'cell';
  b.dataset.edge = (i % N === N - 1 ? ' edge-r' : '') + (i >= SIZE - N ? ' edge-b' : '');
  b.setAttribute('role', 'gridcell');
  b.setAttribute('aria-label', `Row ${((i / N) | 0) + 1}, column ${(i % N) + 1}`);
  b.dataset.i = i;
  boardEl.appendChild(b);
  cellEls.push(b);
}

function names() {
  if (mode === 'ai') return ['You', 'Computer'];
  if (mode === 'local') return ['Player X', 'Player O'];
  return net.me === X ? ['You', 'Friend'] : ['Friend', 'You'];
}

function render(fresh) {
  const last = moves[moves.length - 1];
  const win = new Set(over ? over.line : []);
  for (let i = 0; i < SIZE; i++) {
    const v = board[i];
    let cls = 'cell' + cellEls[i].dataset.edge;
    if (v === X) cls += ' x'; else if (v === O) cls += ' o';
    if (i === last && !win.size) cls += ' last';
    if (win.has(i)) cls += ' win';
    if (i === fresh) cls += ' new';
    if (cellEls[i].className !== cls) cellEls[i].className = cls;
  }
  boardEl.classList.toggle('locked', !canTap());

  const [nx, no] = names();
  $('#name-x').textContent = nx;
  $('#name-o').textContent = no;
  $('#wins-x').textContent = tally[mode][0];
  $('#wins-o').textContent = tally[mode][1];
  const t = turn();
  $('#pill-x').classList.toggle('active', !over && t === X);
  $('#pill-o').classList.toggle('active', !over && t === O);

  const turnEl = $('#turn');
  let txt = '';
  if (over) txt = '';
  else if (mode === 'online' && !connected()) txt = net.role ? 'Waiting for opponent' : 'Create a room to play';
  else if (mode === 'ai') txt = t === X ? 'Your turn' : 'Computer is thinking…';
  else if (mode === 'online') txt = t === net.me ? 'Your turn' : 'Friend’s turn';
  else txt = `${t === X ? 'X' : 'O'} to play`;
  turnEl.textContent = txt;
  turnEl.className = 'turn ' + (over ? '' : t === X ? 'x' : 'o');

  document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('#panel-online').hidden = mode !== 'online';
  $('#level-wrap').hidden = mode !== 'ai';
  $('#level').value = store.data.level;
  const rule = $('#block-rule');
  rule.checked = store.data.blockRule;
  rule.disabled = mode === 'online' && net.role === 'guest';
  rule.parentElement.classList.toggle('locked', rule.disabled);
  rule.parentElement.title = rule.disabled ? 'The host chooses the rule' : '';
  $('#btn-undo').disabled = mode === 'online' || !moves.length || (mode === 'ai' && !moves.some(i => board[i] === X));
  $('#btn-new').disabled = mode === 'online' && !connected();
  $('#btn-sound').classList.toggle('off', store.data.muted);
}

function showEnd(withSound) {
  if (!over) return;
  const w = over.winner;
  const h = $('#end-title');
  let title, sub = w ? `Five in a row${store.data.blockRule ? ', not blocked' : ''}.` : 'The board is full.';
  if (!w) title = 'Draw';
  else if (mode === 'local') title = `${w === X ? 'X' : 'O'} wins!`;
  else title = mine(w) ? 'You win!' : mode === 'ai' ? 'Computer wins' : 'Your friend wins';
  h.textContent = title;
  h.className = w ? (w === X ? 'x' : 'o') : '';
  $('#end-sub').textContent = sub;
  $('#btn-again').disabled = mode === 'online' && !connected();
  $('#ov-end').classList.remove('hidden');
  if (withSound) sfx.play(!w || mode === 'local' || mine(w) ? 'win' : 'lose');
}
const hideEnd = () => $('#ov-end').classList.add('hidden');

let flashTimer = null;
function flash(msg) {
  const s = $('#status');
  s.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { s.textContent = ''; }, 2200);
}

// Stone outlines scale with the squares: --cell is one square's width in pixels.
boardEl.style.setProperty('--n', N);
const sizeBoard = () => boardEl.style.setProperty('--cell', (boardEl.clientWidth / N) + 'px');
if (window.ResizeObserver) new ResizeObserver(sizeBoard).observe(boardEl);
else window.addEventListener('resize', sizeBoard);
sizeBoard();

// Where the board is bigger than its frame (phones), keep the action in view: centre
// on a fresh game, and slide an opponent's move into view if it landed off-screen.
const scroller = $('#scroller');
function centerView() {
  scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
  scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
}
function reveal(i) {
  const el = cellEls[i], pad = el.offsetWidth * 2;
  const { scrollLeft: x, scrollTop: y, clientWidth: w, clientHeight: h } = scroller;
  const l = el.offsetLeft, t = el.offsetTop;
  if (l - pad >= x && l + el.offsetWidth + pad <= x + w && t - pad >= y && t + el.offsetHeight + pad <= y + h) return;
  scroller.scrollTo({ left: l - w / 2, top: t - h / 2, behavior: 'smooth' });
}

// ---------- Input ----------
const on = (sel, fn) => $(sel).addEventListener('click', fn);

boardEl.addEventListener('click', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  sfx.unlock();
  const i = +cell.dataset.i;
  if (board[i] || !canTap()) {
    if (mode === 'online' && !connected() && !over) flash('Your friend isn’t connected yet.');
    return;
  }
  place(i);
});

document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('#level').addEventListener('change', e => {
  store.data.level = e.target.value;
  store.save();
  flash(`Level: ${e.target.selectedOptions[0].textContent}`);
});

$('#block-rule').addEventListener('change', e => {
  store.data.blockRule = e.target.checked;
  store.save();
  if (mode === 'online') sendSync();
  flash(e.target.checked ? 'Blocked fives don’t count' : 'Any five wins');
});

on('#btn-new',   newGame);
on('#btn-again', newGame);
on('#btn-undo',  undo);
on('#btn-look',  hideEnd);
on('#btn-sound', () => { const m = sfx.toggle(); render(); if (!m) sfx.play('click'); });
const closeHelp = () => $('#ov-help').classList.add('hidden');
on('#btn-help',  () => { sfx.play('click'); $('#ov-help').classList.remove('hidden'); });
on('#btn-help-close', closeHelp);
$('#ov-help').addEventListener('click', e => { if (e.target.id === 'ov-help') closeHelp(); });

on('#btn-create', () => { sfx.unlock(); hostRoom(); });
on('#btn-leave',  () => { sfx.play('click'); leaveRoom(); });
on('#btn-retry',  () => { if (net.room) joinRoom(net.room); });
on('#btn-copy', async () => {
  const input = $('#room-link');
  try { await navigator.clipboard.writeText(input.value); }
  catch (_) { input.select(); document.execCommand('copy'); }
  flash('Link copied — send it to your friend');
});
on('#btn-share', () => {
  navigator.share({ title: 'Play Caro with me', text: 'Join my Caro game:', url: $('#room-link').value }).catch(() => {});
});

window.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const helpOpen = !$('#ov-help').classList.contains('hidden');
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (helpOpen) closeHelp(); else hideEnd(); return; }
  if (helpOpen) return;
  if (k === 'n') newGame();
  else if (k === 'u') undo();
  else if (k === 'm') $('#btn-sound').click();
  else if (k === 'h' || k === '?') $('#btn-help').click();
});

window.addEventListener('pagehide', () => { send({ t: 'bye' }); if (net.peer) teardown(); });

// ---------- Boot ----------
const room = new URLSearchParams(location.search).get('room');
if (room && /^caro-[a-z0-9]{4,20}$/.test(room)) {
  mode = 'online';
  joinRoom(room);
} else if (mode === 'online') {
  mode = 'ai';                        // a stale "online" choice has no room to rejoin
}
startGame(0);

})();
