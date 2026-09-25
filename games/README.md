# Games

Static browser games served from GitHub Pages at `https://danhquyen.io.vn/games/`.

No build step, no dependencies, no framework — each game is plain HTML + CSS + JS and
runs straight off the filesystem the way it is committed.

```
games/
├── index.html        ← the hub (game list)
├── README.md
├── sky-dash/         ← one folder per game
│   ├── index.html
│   ├── style.css
│   ├── game.js
│   ├── CREDITS.md    ← asset licences for that game
│   └── assets/
│       ├── sprites/
│       └── sounds/
├── 2048/
│   ├── index.html
│   ├── style.css
│   ├── game.js
│   ├── CREDITS.md
│   └── assets/
│       ├── sounds/
│       ├── thumb.svg
│       └── thumb-tile.svg
├── graphwar/
│   ├── index.html
│   ├── style.css
│   ├── game.js
│   ├── CREDITS.md
│   └── assets/
│       ├── sounds/
│       ├── thumb.svg
│       └── thumb-icon.svg
└── caro/
    ├── index.html
    ├── style.css
    ├── game.js
    ├── CREDITS.md
    ├── vendor/peerjs.min.js   ← loaded only for online play
    └── assets/
        ├── sounds/
        ├── thumb.svg
        └── thumb-icon.svg
```

## Adding a new game

1. Create `games/<slug>/` with its own `index.html` (self-contained — it must not
   depend on anything outside its folder except relative links back to `../`).
2. Add a `CREDITS.md` in the game folder listing every third-party asset and its licence.
3. Append one entry to the `GAMES` array near the bottom of [`index.html`](index.html):

```js
const GAMES = [
  {
    slug:   'sky-dash',                                   // folder name
    title:  'Sky Dash',
    tag:    'New',                                        // optional corner badge
    blurb:  'One tap keeps you airborne…',
    chips:  ['Arcade', 'One-tap', 'Endless'],
    art:    'sky-dash/assets/sprites/background.png',     // card background
    sprite: 'sky-dash/assets/sprites/planes/planeRed1.png',// floating card sprite
  },
];
```

The card, the live-game counter and the "Play now" link all derive from that entry —
nothing else needs touching.

## Games

### Sky Dash — [`sky-dash/`](sky-dash/)

Endless one-tap flyer: hold altitude with taps, thread the gaps between rock columns,
collect the gold star that sits in every 4th gap.

| | |
|---|---|
| Controls | Click / tap, `Space`, `↑`, `W` · `Esc`/`P` pause · `M` mute |
| Difficulty | Speed ramps 195→270 px/s, gap tightens 158→132 px as the score climbs |
| Themes | Ground and rock textures rotate every 10 points (grass → snow → ice → rock → dirt) |
| Medals | Bronze ≥ 10, Silver ≥ 20, Gold ≥ 30 |
| Saved locally | Best score, plays, chosen plane, mute — `localStorage` key `skydash.v1` |
| Assets | Kenney, CC0 — see [`sky-dash/CREDITS.md`](sky-dash/CREDITS.md) |

Implementation notes:

- The world is a fixed **480 logical pixels tall**; width is derived from the viewport
  aspect and clamped to 400–1100, then the canvas is letterboxed to fit. One code path
  covers phone, tablet and desktop, portrait or landscape.
- Kenney's audio packs ship `.ogg` only. Each sound is fetched **once** and shared across
  a 4-voice pool via a blob URL. Browsers that cannot decode Vorbis (and `file://` opens,
  where `fetch` is blocked) fall back to short WebAudio tones, so the game is never
  silently broken.
- No code or artwork is copied from any existing game.

### 2048 — [`2048/`](2048/)

Sliding-tile number puzzle: merge equal tiles into their double and try to build a 2048.

| | |
|---|---|
| Controls | Arrow keys / `WASD` / swipe · `U` undo · `N` new game · `M` mute · `Esc` close |
| Undo | Up to 12 moves deep, also offered from the game-over card |
| Win | A 2048 tile prompts once; "Keep going" continues without re-prompting |
| Saved locally | Board, score, best, mute — `localStorage` key `g2048.v1`, so a refresh resumes |
| Assets | Board and tiles are CSS/SVG; sounds by Kenney, CC0 — see [`2048/CREDITS.md`](2048/CREDITS.md) |

Implementation notes:

- Tiles are absolutely positioned in **percent** of the board and moved by transitioning
  `left`/`top`, so the whole thing scales to any board size with no JS layout maths. The
  single JS-set variable `--u` (a hundredth of the board width) drives font size.
- A move's tail (removing absorbed tiles, popping merges, spawning the new tile) runs
  after the 110ms slide. Input arriving during that window **flushes the pending move
  instead of being dropped**, so fast play never loses a keypress.
- The palette is this site's teal/ink scheme warming to amber and red on big tiles —
  deliberately not any other implementation's look.

### Graphwar — [`graphwar/`](graphwar/)

Turn-based artillery duel. Your shot flies along `y = f(x)`, where `x` is the distance
travelled from your soldier, so choosing the function *is* the aiming.

| | |
|---|---|
| Controls | Type a function, `Enter` to fire · direction toggle · angle slider · `H` help · `N` new game · `M` mute |
| Modes | vs Computer (easy / normal / hard) and 2-player hot-seat |
| Rules | 3 soldiers a side; terrain blocks shots; the blast kills anyone within 1.6 units, your own team included |
| Saved locally | Mute and a win/loss tally — `localStorage` key `graphwar.v1` |
| Assets | Battlefield is drawn in canvas; sounds by Kenney, CC0 — see [`graphwar/CREDITS.md`](graphwar/CREDITS.md) |

Implementation notes:

- Input is parsed by a hand-written tokenizer plus recursive-descent parser that
  **compiles to a tree of closures — never `eval`**. Supports implicit multiplication
  (`2x`, `3sin(x)`, `(x+1)(x-1)`), right-associative `^`, correct unary-minus
  precedence (`-x^2` is `-(x^2)`), and ~30 functions. A typo produces a readable
  message instead of a crash.
- Teams spawn in a narrow column with one soldier per horizontal band, at least
  `2 × blast radius` apart. Both constraints are load-bearing: spreading a team
  horizontally puts teammates in each other's line of fire, and packing them closer
  lets a single shell wipe out half a side.
- The opponent searches parabolas *forced through the target point*, so it only has to
  explore how much the shot arcs — which is what clears terrain. **Difficulty is applied
  after that search, not to the candidates:** jittering candidates does nothing, because
  best-of-N just picks whichever error cancelled out. Measured hit rates are 19% / 46% /
  100% for easy / normal / hard.
- The name belongs to an existing freeware game of the same concept; see
  [`graphwar/CREDITS.md`](graphwar/CREDITS.md) before publishing this as a product.

### Caro — [`caro/`](caro/)

Five in a row on a 30×30 board, against the computer, two players on one device, or two
players online with a room link.

| | |
|---|---|
| Controls | Click / tap a square · `N` new game · `U` undo · `M` mute · `H` help |
| Modes | vs Computer (easy / normal / hard), 2-player hot-seat, Online (room link) |
| Rules | Five or more in a row wins; optional Vietnamese rule where a five capped by the opponent at *both* ends doesn't count. The opening side alternates every game |
| Saved locally | Mode, level, rule, mute and the win tally — `localStorage` key `caro.v1` |
| Assets | Board and marks are CSS/SVG; sounds by Kenney, CC0; PeerJS, MIT — see [`caro/CREDITS.md`](caro/CREDITS.md) |

Implementation notes:

- The board is 30×30. On a desktop it fits the column at ~23px a square; narrower
  screens keep that minimum so squares stay tappable, and the board scrolls inside its
  frame. A fresh game centres the view, and an opponent's move off-screen scrolls into view.
- **Online play has no backend of ours.** The host's browser registers a random room id
  (`caro-xxxxxx`) with PeerJS's free public signalling server; the link carries that id,
  and the friend's browser uses it to open a WebRTC data channel straight to the host.
  Moves then go peer-to-peer. `vendor/peerjs.min.js` is loaded only when Online is picked.
- The host is X and its board is the source of truth. Every message carries the game
  number and move index; anything that doesn't line up (a race on "new game", a dropped
  message, a reconnect) makes the host resend its full state instead of trying to merge.
- Both sides ping every 4s and treat 15s of silence as a disconnect, because a closed tab
  or a locked phone often drops the channel without ever firing `close`. The host keeps
  the room open, so the friend can reopen the same link and carry on.
- Strict networks (some corporate or mobile carrier NATs) can block the direct
  connection. PeerJS falls back to its default public TURN relays; if those fail too the
  guest sees "Couldn't reach your friend".
- The computer scores each empty square near the stones by summing every 5-cell window
  through it that the opponent hasn't blocked, weighted by how full the window is. That
  single sum covers open lines, broken lines (`X_XX`) and double threats. Hard adds a
  one-move look-ahead over the ten best squares; easy adds noise and sometimes misses
  your winning move.

## Local preview

```sh
cd danhquyen0109.github.io
python3 -m http.server 8123 --bind 127.0.0.1
# → http://127.0.0.1:8123/games/
```
