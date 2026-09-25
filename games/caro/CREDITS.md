# Caro — credits

The board, marks and layout are drawn in CSS/SVG — no third-party artwork.

## Library

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `vendor/peerjs.min.js` | PeerJS | 1.5.5 | [github.com/peers/peerjs](https://github.com/peers/peerjs) · npm `peerjs` | MIT |

Vendored unchanged from the npm package's `dist/peerjs.min.js` (only the trailing
`sourceMappingURL` comment was removed, since the map isn't shipped). It is loaded only
when the player opens **Online** mode.

At runtime online mode uses PeerJS's **free public signalling server** (`0.peerjs.com`)
to introduce the two browsers, plus the public STUN/TURN servers PeerJS configures by
default. After the handshake the moves travel directly between the players. No game data
is stored anywhere.

## Audio

All sounds are **CC0 (public domain)** by **Kenney**, shared with [`../2048`](../2048/CREDITS.md):

| File | Original | Pack |
|---|---|---|
| `sounds/place.ogg` | `switch_002.ogg` | Interface Sounds |
| `sounds/win.ogg` | `confirmation_004.ogg` | Interface Sounds |
| `sounds/click.ogg` | `click_002.ogg` | Interface Sounds |
| `sounds/undo.ogg` | `back_001.ogg` | Interface Sounds |
| `sounds/lose.ogg` | `impactSoft_heavy_000.ogg` | Impact Sounds |

Packs: [kenney.nl/assets/interface-sounds](https://kenney.nl/assets/interface-sounds) ·
[kenney.nl/assets/impact-sounds](https://kenney.nl/assets/impact-sounds) —
CC0 1.0 Universal: <https://creativecommons.org/publicdomain/zero/1.0/>

## Graphics

`assets/thumb.svg` and `assets/thumb-icon.svg` are original SVGs written for this project
(hub card art and favicon).

## Code

`index.html`, `style.css` and `game.js` are an original implementation. Caro / Gomoku is a
traditional public-domain game; no code or artwork was copied from any existing version.
