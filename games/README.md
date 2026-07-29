# Games

Static browser games served from GitHub Pages at `https://danhquyen.io.vn/games/`.

No build step, no dependencies, no framework — each game is plain HTML + CSS + JS and
runs straight off the filesystem the way it is committed.

```
games/
├── index.html        ← the hub (game list)
├── README.md
└── sky-dash/         ← one folder per game
    ├── index.html
    ├── style.css
    ├── game.js
    ├── CREDITS.md    ← asset licences for that game
    └── assets/
        ├── sprites/
        └── sounds/
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

## Local preview

```sh
cd danhquyen0109.github.io
python3 -m http.server 8123 --bind 127.0.0.1
# → http://127.0.0.1:8123/games/
```
