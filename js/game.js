// Tile-based overworld drawn on a 320x176 canvas and scaled up with pixelated rendering.
window.Overworld = (() => {
  const T = 16;
  const MAP = [
    "TTTTTTTTTTTTTTTTTTTT",
    "TGqqqGGFGGGGFGGlllGT",
    "TGqDqGGGGGGGGGGlDlGT",
    "TGGPGGGGGGSGGGGGPGGT",
    "TWGPPPPPPPPPPPPPPGGT",
    "TWWGGGGGGGGGGGGGGGGT",
    "TGiiiGGGGhhhGGGtttGT",
    "TGiDiGGGGhDhGGGtDtGT",
    "TGGPGGFGGGPGGGGGPGFT",
    "TGGPPPPPPPPPPPPPPGGT",
    "TTTTTTTTTTTTTTTTTTTT",
  ];
  const COLS = MAP[0].length;
  const ROWS = MAP.length;
  const W = COLS * T;
  const H = ROWS * T;
  const STEP_MS = 120;
  const SPAWN = [10, 5];

  const BUILDINGS = {
    q: { id: "quests", label: "Quests", roof: "#c0392b", dark: "#8e2a1f" },
    l: { id: "levels", label: "Levels", roof: "#8e44ad", dark: "#5e2c75" },
    i: { id: "inventory", label: "Items", roof: "#2b7bbf", dark: "#1d5687" },
    t: { id: "trophies", label: "Trophies", roof: "#d4a017", dark: "#9a7410" },
    h: { id: "party", label: "Tavern", roof: "#d35400", dark: "#963c00" },
  };
  const SIGN = { id: "stats", label: "About", x: 10, y: 3 };

  // derive each building's footprint and door from the map
  for (const key in BUILDINGS) {
    const b = BUILDINGS[key];
    let minX = COLS, minY = ROWS;
    MAP.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === key) { minX = Math.min(minX, x); minY = Math.min(minY, y); }
    }));
    b.x = minX; b.y = minY; b.door = [minX + 1, minY + 1];
  }

  const COINS = [[6, 1], [13, 1], [18, 3], [5, 5], [12, 6], [1, 8], [7, 8], [18, 9]];

  const tileAt = (x, y) => (MAP[y] || "")[x] || "T";
  const walkable = (x, y) => "GPFSD".includes(tileAt(x, y));
  const isTrigger = (x, y) => "SD".includes(tileAt(x, y));
  const buildingAt = (x, y) => {
    const c = tileAt(x, y);
    if (BUILDINGS[c]) return BUILDINGS[c];
    if (c === "D") return Object.values(BUILDINGS).find((b) => b.door[0] === x && b.door[1] === y);
    return null;
  };
  const hash = (x, y, i) => (((x * 73856093) ^ (y * 19349663) ^ (i * 83492791)) >>> 0);

  // ---------- sprites ----------
  const PAL = {
    k: "#1a1c2c", h: "#3b2a20", s: "#f2c9a0", e: "#1a1c2c",
    b: "#4cc9f0", d: "#2a8fb8", p: "#2b2f55",
  };
  const BODY = [
    "................",
    ".....kkkkkk.....",
    "....khhhhhhk....",
    "...khhhhhhhhk...",
    "...khsssssshk...",
    "...kssessessk...",
    "...kssssssssk...",
    "....kssssssk....",
    "...kkbbbbbbkk...",
    "..ksbbbbbbbbsk..",
    "..ksbdbbbbdbsk..",
    "...kbbbbbbbbk...",
    "...kppppppppk...",
  ];
  const LEGS = [
    ["...kppk..kppk...", "...kkk....kkk...", "................"],
    ["....kppkkppk....", "....kkk..kkk....", "................"],
  ];
  const FACES = {
    down: ["hssssssh", "ssessess"],
    up: ["hhhhhhhh", "hhhhhhhh"],
    left: ["hsssshhh", "sesssshh"],
    right: ["hhhssssh", "hhsssses"],
  };

  function makeSprite(dir, frame) {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d");
    const [hairRow, eyeRow] = FACES[dir];
    const rows = BODY.map((row, i) => {
      if (i === 4) return "...k" + hairRow + "k...";
      if (i === 5) return "...k" + eyeRow + "k...";
      return row;
    }).concat(LEGS[frame]);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }

  function create(root, opts) {
    const canvas = root.querySelector("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const sprites = {};
    for (const dir of Object.keys(FACES)) sprites[dir] = [sprite(dir, 0), sprite(dir, 1)];

    const collected = new Set(opts.collected || []);
    const visited = new Set(opts.visited || []);
    const p = { x: SPAWN[0], y: SPAWN[1], fx: SPAWN[0], fy: SPAWN[1], tx: 0, ty: 0, t: 0, moving: false, dir: "up", steps: 0 };
    let path = [];
    let target = null;
    const held = [];
    let running = false;
    let last = 0;

    // ---------- static layer ----------
    const layer = document.createElement("canvas");
    layer.width = W;
    layer.height = H;
    const g = layer.getContext("2d");
    const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

    function grass(tx, ty) {
      const X = tx * T, Y = ty * T;
      r(X, Y, T, T, "#3a7d44");
      for (let i = 0; i < 6; i++) {
        const h = hash(tx, ty, i);
        r(X + (h % 15), Y + ((h >> 4) % 14), 1, 2, i % 2 ? "#4a9a52" : "#326c3b");
      }
    }
    function pathTile(tx, ty) {
      const X = tx * T, Y = ty * T;
      r(X, Y, T, T, "#c8a46a");
      for (let i = 0; i < 7; i++) {
        const h = hash(tx, ty, i + 9);
        r(X + (h % 15), Y + ((h >> 4) % 15), 1 + (i % 2), 1, i % 3 ? "#b48e56" : "#dcbc84");
      }
      // soften the edges where the road meets grass
      const edge = "#a98950";
      if (!"PSD".includes(tileAt(tx, ty - 1))) r(X, Y, T, 1, edge);
      if (!"PSD".includes(tileAt(tx, ty + 1))) r(X, Y + 15, T, 1, edge);
      if (!"PSD".includes(tileAt(tx - 1, ty))) r(X, Y, 1, T, edge);
      if (!"PSD".includes(tileAt(tx + 1, ty))) r(X + 15, Y, 1, T, edge);
    }
    function tree(tx, ty) {
      grass(tx, ty);
      const X = tx * T, Y = ty * T;
      r(X + 3, Y + 14, 10, 2, "rgba(0,0,0,.22)");
      r(X + 7, Y + 11, 2, 4, "#5a3a22");
      r(X + 4, Y + 1, 8, 1, "#1b4a2b");
      r(X + 2, Y + 2, 12, 8, "#1f5130");
      r(X + 3, Y + 10, 10, 1, "#1b4a2b");
      r(X + 4, Y + 3, 5, 3, "#2e7d43");
      r(X + 5, Y + 4, 2, 1, "#3f9a55");
    }
    function water(tx, ty) {
      const X = tx * T, Y = ty * T;
      r(X, Y, T, T, "#2b6cb0");
      if (tileAt(tx, ty - 1) !== "W") r(X, Y, T, 2, "#4d8fd6");
    }
    function flowers(tx, ty) {
      grass(tx, ty);
      const X = tx * T, Y = ty * T;
      [["#ff6b9a", 3, 4], ["#ffd23f", 10, 3], ["#ffffff", 6, 10], ["#ff6b9a", 12, 11]].forEach(([c, x, y]) => {
        r(X + x, Y + y, 2, 2, c);
        r(X + x, Y + y + 2, 1, 2, "#2e6b37");
      });
    }
    function sign() {
      const X = SIGN.x * T, Y = SIGN.y * T;
      r(X + 4, Y + 14, 8, 2, "rgba(0,0,0,.22)");
      r(X + 7, Y + 9, 2, 6, "#6b4a2a");
      r(X + 1, Y + 2, 14, 8, "#6b4a2a");
      r(X + 2, Y + 3, 12, 6, "#a0703f");
      r(X + 4, Y + 5, 8, 1, "#5a3a22");
      r(X + 4, Y + 7, 5, 1, "#5a3a22");
    }
    function building(b) {
      const X = b.x * T, Y = b.y * T;
      r(X + 3, Y + 30, 44, 2, "rgba(0,0,0,.25)");
      r(X + 3, Y + 12, 42, 19, "#e9dcc0");
      r(X + 3, Y + 13, 42, 2, "#cdbb98");
      r(X + 3, Y + 29, 42, 2, "#b9a47c");
      for (const wx of [X + 7, X + 35]) {
        r(wx, Y + 18, 6, 6, "#2b3a5a");
        r(wx + 1, Y + 19, 4, 4, "#ffe48a");
        r(wx + 3, Y + 18, 1, 6, "#2b3a5a");
        r(wx, Y + 21, 6, 1, "#2b3a5a");
      }
      r(X + 19, Y + 18, 10, 14, "#3d2414");
      r(X + 20, Y + 19, 8, 13, "#6b4226");
      r(X + 23, Y + 19, 1, 13, "#5a361e");
      r(X + 26, Y + 25, 1, 2, "#ffd23f");
      // roof + chimney
      r(X + 36, Y - 3, 5, 6, "#7a4b33");
      r(X + 35, Y - 4, 7, 2, "#5e3826");
      r(X + 2, Y, 44, 2, b.dark);
      r(X, Y + 2, 48, 11, b.roof);
      for (let i = 0; i < 3; i++) r(X, Y + 4 + i * 3, 48, 1, b.dark);
      r(X, Y + 12, 48, 1, b.dark);
    }

    MAP.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === "T") tree(x, y);
      else if (c === "P") pathTile(x, y);
      else if (c === "W") water(x, y);
      else if (c === "F") flowers(x, y);
      else grass(x, y);
    }));
    // the road runs up to every door
    for (const b of Object.values(BUILDINGS)) pathTile(b.door[0], b.door[1] + 1);
    sign();
    Object.values(BUILDINGS).forEach(building);

    // ---------- labels ----------
    const labelWrap = root.querySelector(".map-labels");
    const spots = [
      ...Object.values(BUILDINGS).map((b) => ({ id: b.id, label: b.label, cx: b.x + 1.5, cy: b.y - 0.15 })),
      { id: SIGN.id, label: SIGN.label, cx: SIGN.x + 0.5, cy: SIGN.y - 0.1 },
    ];
    for (const s of spots) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-label";
      btn.dataset.id = s.id;
      btn.textContent = s.label;
      btn.style.left = (s.cx / COLS) * 100 + "%";
      btn.style.top = (s.cy / ROWS) * 100 + "%";
      btn.setAttribute("aria-label", `Walk to ${s.label}`);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        opts.onStart && opts.onStart();
        walkToSpot(s.id);
      });
      labelWrap.appendChild(btn);
    }

    // ---------- pathfinding ----------
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    function findPath(sx, sy, tx, ty) {
      if (!walkable(tx, ty)) return null;
      const key = (x, y) => y * COLS + x;
      const start = key(sx, sy);
      const prev = new Map([[start, -1]]);
      const queue = [[sx, sy]];
      while (queue.length) {
        const [x, y] = queue.shift();
        if (x === tx && y === ty) break;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (prev.has(k) || !walkable(nx, ny)) continue;
          if (isTrigger(nx, ny) && !(nx === tx && ny === ty)) continue;
          prev.set(k, key(x, y));
          queue.push([nx, ny]);
        }
      }
      if (!prev.has(key(tx, ty))) return null;
      const out = [];
      for (let k = key(tx, ty); k !== start; k = prev.get(k)) out.unshift([k % COLS, Math.floor(k / COLS)]);
      return out;
    }
    function walkTo(tx, ty) {
      const b = buildingAt(tx, ty);
      if (b) [tx, ty] = b.door;
      const found = findPath(p.moving ? p.tx : p.x, p.moving ? p.ty : p.y, tx, ty);
      if (!found) return;
      path = found;
      target = [tx, ty];
      wake();
    }
    function walkToSpot(id) {
      if (id === SIGN.id) return walkTo(SIGN.x, SIGN.y);
      const b = Object.values(BUILDINGS).find((x) => x.id === id);
      if (b) walkTo(b.door[0], b.door[1]);
    }

    // ---------- movement ----------
    function dirOf(dx, dy) {
      return dx > 0 ? "right" : dx < 0 ? "left" : dy < 0 ? "up" : "down";
    }
    function startStep(nx, ny) {
      p.dir = dirOf(nx - p.x, ny - p.y);
      if (!walkable(nx, ny)) { path = []; target = null; return; }
      p.tx = nx; p.ty = ny; p.t = 0; p.moving = true;
    }
    function arrive() {
      p.x = p.tx; p.y = p.ty; p.moving = false; p.steps++;
      if (p.steps === 1) opts.onFirstMove && opts.onFirstMove();
      const ci = COINS.findIndex(([cx, cy]) => cx === p.x && cy === p.y);
      if (ci >= 0 && !collected.has(ci)) {
        collected.add(ci);
        opts.onCoin && opts.onCoin(ci, COINS.length, screenPoint(p.x, p.y));
      }
      if (target && target[0] === p.x && target[1] === p.y) target = null;
      if (isTrigger(p.x, p.y)) {
        const id = tileAt(p.x, p.y) === "S" ? SIGN.id : buildingAt(p.x, p.y).id;
        path = []; target = null; held.length = 0;
        visited.add(id);
        // step back out so the door doesn't re-trigger on return
        p.y += 1; p.dir = "down";
        opts.onEnter && opts.onEnter(id);
      }
    }
    function update(dt) {
      if (p.moving) {
        p.t += dt / STEP_MS;
        if (p.t >= 1) arrive();
      }
      if (!p.moving) {
        const d = held[held.length - 1];
        if (d) { path = []; target = null; startStep(p.x + d[0], p.y + d[1]); }
        else if (path.length) { const [nx, ny] = path.shift(); startStep(nx, ny); }
      }
      p.fx = p.moving ? p.x + (p.tx - p.x) * p.t : p.x;
      p.fy = p.moving ? p.y + (p.ty - p.y) * p.t : p.y;
    }

    // ---------- drawing ----------
    function draw(time) {
      ctx.drawImage(layer, 0, 0);
      // water shimmer
      MAP.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== "W") return;
        const off = Math.floor(time / 300 + x * 3 + y * 5) % 12;
        ctx.fillStyle = "#8cc4ff";
        ctx.fillRect(x * T + off, y * T + 6 + ((x + y) % 2) * 4, 3, 1);
      }));
      // quest markers over places not yet visited
      const bob = Math.round(Math.sin(time / 220) * 1.5);
      ctx.fillStyle = "#ffd23f";
      for (const s of spots) {
        if (visited.has(s.id)) continue;
        const mx = Math.round(s.cx * T) - 1;
        const my = Math.round((s.cy + 0.15) * T) - (s.id === SIGN.id ? 9 : 13) + bob;
        ctx.fillStyle = "#1a1c2c";
        ctx.fillRect(mx - 1, my - 1, 4, 9);
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(mx, my, 2, 4);
        ctx.fillRect(mx, my + 5, 2, 2);
      }
      // coins
      const widths = [6, 4, 2, 4];
      COINS.forEach(([cx, cy], i) => {
        if (collected.has(i)) return;
        const w = widths[Math.floor(time / 130 + i) % 4];
        const X = cx * T + 8 - w / 2;
        const Y = cy * T + 4 + Math.round(Math.sin(time / 260 + i) * 1);
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillRect(cx * T + 5, cy * T + 13, 6, 1);
        ctx.fillStyle = "#c9971c";
        ctx.fillRect(X, Y, w, 8);
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(X + (w > 2 ? 1 : 0), Y + 1, Math.max(1, w - 2), 6);
        if (w > 2) { ctx.fillStyle = "#fff3b0"; ctx.fillRect(X + 1, Y + 1, 1, 3); }
      });
      // click target marker
      if (target && Math.floor(time / 200) % 2) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(target[0] * T + 2.5, target[1] * T + 2.5, 11, 11);
      }
      // player
      const px = Math.round(p.fx * T), py = Math.round(p.fy * T);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.fillRect(px + 4, py + 14, 8, 2);
      const frame = p.moving && p.t > 0.5 ? (p.steps % 2) : 0;
      ctx.drawImage(sprites[p.dir][frame], px, py - 2 - (frame ? 1 : 0));
    }

    function loop(now) {
      if (!running) return;
      const dt = Math.min(64, now - (last || now));
      last = now;
      update(dt);
      draw(now);
      requestAnimationFrame(loop);
    }
    function wake() {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(loop);
    }
    function sleep() { running = false; }

    // ---------- input ----------
    const KEYS = {
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    };
    root.addEventListener("keydown", (e) => {
      const d = KEYS[e.code];
      if (!d) return;
      e.preventDefault();
      opts.onStart && opts.onStart();
      if (!held.includes(d)) held.push(d);
      wake();
    });
    root.addEventListener("keyup", (e) => {
      const d = KEYS[e.code];
      if (!d) return;
      const i = held.indexOf(d);
      if (i >= 0) held.splice(i, 1);
    });
    root.addEventListener("blur", () => { held.length = 0; }, true);
    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
      const ty = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
      opts.onStart && opts.onStart();
      root.focus({ preventScroll: true });
      walkTo(tx, ty);
    });

    function screenPoint(x, y) {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((x + 0.5) / COLS) * rect.width, y: rect.top + (y / ROWS) * rect.height };
    }

    new IntersectionObserver(([entry]) => (entry.isIntersecting ? wake() : sleep())).observe(canvas);
    draw(0);

    return {
      coinCount: COINS.length,
      spotCount: spots.length,
      walkToSpot,
      reset() {
        collected.clear(); visited.clear();
        Object.assign(p, { x: SPAWN[0], y: SPAWN[1], fx: SPAWN[0], fy: SPAWN[1], moving: false, dir: "up", steps: 0 });
        path = []; target = null;
        draw(performance.now());
      },
    };
  }

  const spriteCache = {};
  function sprite(dir, frame) {
    const k = dir + frame;
    return spriteCache[k] || (spriteCache[k] = makeSprite(dir, frame));
  }

  return { create, sprite };
})();
