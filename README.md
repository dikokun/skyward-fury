# SKYWARD FURY — Archipelago Strike

A golden-hour jet-fighter game for the make.fun "Make the best flight game"
bounty: thread glowing rings through volcanic sea arches, dogfight the crimson
squadron with cannon and lock-on missiles, then sink the Dreadnought Carrier —
three waves, one sunset, everything procedural.

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/dikokun/skyward-fury/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/dikokun/skyward-fury/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Competition: https://make.fun/bounty/best-flight-game-20261126-0057

## Play

Open `game/index.html` (any static server). Mouse steers with auto-bank, WASD
overrides, Shift is the afterburner, click/Space fires the twin cannon, F or
right-click launches a homing missile once the lock diamond settles, C swaps
chase and cockpit cameras.

## Layout

- `game/index.html` — page, overlays and styles
- `game/game.js` — the whole game: audio synth, world, waves, combat, HUD
- `game/vendor/three.min.js` — vendored three.js r147 (UMD, MIT)
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` out and
  writes `dossier.json` with the kit's `buildDossier`
- `screenshots/` — the four judged stills, staged from live engine states
  (`?state=title|canyon|dogfight|boss`, `&hold=1` freezes the composed frame)
