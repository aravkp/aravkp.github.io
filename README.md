# aravkp.github.io

My portfolio, built as a small game. Live at **https://aravkp.github.io**.

- **Overworld**: a tile map drawn on a canvas. Click or tap to walk, and step through a door to jump to that section. There are 8 coins to find.
- **XP and levels**: reading quests, flipping project cartridges and inspecting skills earn XP.
- **Achievements**: 14 of them, including a hidden CRT mode.
- **Pause menu**: the pause button in the top bar.

No frameworks or build step: plain HTML, CSS and JavaScript. Progress is saved in `localStorage`.

```
index.html      page markup
css/style.css   styles
js/data.js      projects, quests, skills, achievements
js/game.js      the overworld (map, sprites, pathfinding)
js/main.js      XP, achievements, sound, menus
```

Run locally with any static server, e.g. `python3 -m http.server`.
