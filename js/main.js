(() => {
  const D = window.PORTFOLIO_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const XP_PER_LEVEL = 100;

  // ---------- save state ----------
  const STORE_KEY = "ak-portfolio-v1";
  const defaults = () => ({ xp: 0, claimed: [], ach: [], coins: [], visited: [], sound: false, crt: false });
  const state = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === "object") return { ...defaults(), ...s };
    } catch {}
    return defaults();
  })();
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} };

  // ---------- sound ----------
  const sfx = (() => {
    let ctx;
    function play(notes, type = "square", vol = 0.035) {
      if (!state.sound) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        let t = ctx.currentTime;
        for (const [f, d] of notes) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = type;
          o.frequency.value = f;
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + d);
          t += d * 0.9;
        }
      } catch {}
    }
    return {
      coin: () => play([[988, 0.07], [1319, 0.16]]),
      xp: () => play([[660, 0.05], [880, 0.07]], "triangle", 0.05),
      ach: () => play([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.25]]),
      level: () => play([[392, 0.1], [523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]]),
      enter: () => play([[330, 0.06], [440, 0.06], [554, 0.12]]),
      select: () => play([[880, 0.05]], "square", 0.025),
      flip: () => play([[523, 0.05], [784, 0.07]], "triangle", 0.05),
    };
  })();

  // ---------- pixel icons ----------
  function pixelIcon(name) {
    const rows = D.icons[name] || D.icons.star;
    let rects = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }));
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  // ---------- HUD, XP, levels ----------
  const level = (xp) => 1 + Math.floor(xp / XP_PER_LEVEL);

  function renderHud() {
    const lv = level(state.xp);
    const into = state.xp % XP_PER_LEVEL;
    $("#hud-level").textContent = lv;
    $("#hud-xp").textContent = `${into} / ${XP_PER_LEVEL} XP`;
    $("#xp-fill").style.width = into + "%";
    $("#xp-bar").setAttribute("aria-valuenow", into);
    $("#hud-coins").textContent = state.coins.length;
    $("#map-coins").textContent = `${state.coins.length}/${game.coinCount}`;
    $("#hud-trophies").textContent = state.ach.length;
    $("#final-xp").textContent = state.xp;
    $("#final-lv").textContent = lv;
  }

  function floatText(text, at, cls = "") {
    if (!at) {
      const r = $("#xp-bar").getBoundingClientRect();
      at = { x: r.left + r.width / 2, y: r.bottom + 10 };
    } else if (at instanceof Element) {
      const r = at.getBoundingClientRect();
      at = { x: r.left + r.width / 2, y: r.top + 8 };
    }
    const el = document.createElement("span");
    el.className = "xp-float " + cls;
    el.textContent = text;
    el.style.left = at.x + "px";
    el.style.top = at.y + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function grant(key, amount, at) {
    if (state.claimed.includes(key)) return false;
    state.claimed.push(key);
    const before = level(state.xp);
    state.xp += amount;
    save();
    renderHud();
    floatText(`+${amount} XP`, at);
    const bar = $("#xp-bar");
    bar.classList.remove("pulse");
    void bar.offsetWidth;
    bar.classList.add("pulse");
    if (level(state.xp) > before) {
      sfx.level();
      toast("LEVEL UP!", `You reached level ${level(state.xp)}.`, "star", "levelup");
    } else {
      sfx.xp();
    }
    return true;
  }

  // ---------- toasts ----------
  function toast(title, body, icon, cls = "") {
    const el = document.createElement("div");
    el.className = "toast " + cls;
    el.innerHTML = `<span class="toast-icon">${pixelIcon(icon)}</span><span><b></b><span></span></span>`;
    el.querySelector("b").textContent = title;
    el.querySelector("span span").textContent = body;
    $("#toasts").appendChild(el);
    setTimeout(() => el.classList.add("out"), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  // ---------- achievements ----------
  function unlock(id) {
    if (state.ach.includes(id)) return;
    const a = D.achievements.find((x) => x.id === id);
    if (!a) return;
    state.ach.push(id);
    save();
    sfx.ach();
    toast("ACHIEVEMENT UNLOCKED", a.name, a.icon, "ach");
    grant("ach:" + id, 50);
    renderTrophies();
    renderHud();
    const others = D.achievements.filter((x) => x.id !== "complete");
    if (others.every((x) => state.ach.includes(x.id))) unlock("complete");
  }

  function renderTrophies() {
    const grid = $("#trophy-grid");
    grid.innerHTML = "";
    for (const a of D.achievements) {
      const got = state.ach.includes(a.id);
      const el = document.createElement("div");
      el.className = "trophy panel" + (got ? " got" : "");
      el.innerHTML = `<span class="trophy-icon">${pixelIcon(got ? a.icon : "lock")}</span>
        <span class="trophy-text"><b></b><span></span></span>`;
      el.querySelector("b").textContent = a.name;
      el.querySelector(".trophy-text span").textContent = got ? a.desc : a.hint;
      grid.appendChild(el);
    }
    const n = state.ach.length, total = D.achievements.length;
    $("#trophy-count").textContent = `${n} / ${total} unlocked`;
    $("#trophy-fill").style.width = (n / total) * 100 + "%";
  }

  // ---------- navigation ----------
  function goTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  // ---------- overworld ----------
  let started = false;
  function startGame() {
    $("#map-overlay").hidden = true;
    if (!started) { started = true; unlock("start"); }
  }

  const game = window.Overworld.create($("#map"), {
    collected: state.coins,
    visited: state.visited,
    onStart: startGame,
    onFirstMove: () => unlock("firststep"),
    onCoin(i, total, at) {
      if (!state.coins.includes(i)) state.coins.push(i);
      save();
      sfx.coin();
      grant("coin:" + i, 10, at);
      unlock("coin1");
      if (state.coins.length >= total) unlock("coins");
      renderHud();
    },
    onEnter(id) {
      if (!state.visited.includes(id)) state.visited.push(id);
      save();
      sfx.enter();
      document.body.classList.add("warp");
      setTimeout(() => document.body.classList.remove("warp"), 450);
      setTimeout(() => {
        goTo(id);
        grant("enter:" + id, 25);
        if (state.visited.length >= game.spotCount) unlock("explorer");
      }, reduced ? 0 : 220);
    },
  });

  $("#map-overlay").addEventListener("click", () => {
    startGame();
    $("#map").focus({ preventScroll: true });
  });
  $("#press-start").addEventListener("click", () => {
    startGame();
    sfx.select();
    goTo("world");
    setTimeout(() => $("#map").focus({ preventScroll: true }), reduced ? 0 : 500);
  });

  // portrait on the character sheet reuses the player sprite
  (() => {
    const c = $("#portrait");
    c.getContext("2d").drawImage(window.Overworld.sprite("down", 0), 0, 0);
  })();

  // ---------- high scores count-up ----------
  const counters = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      counters.unobserve(e.target);
      const el = e.target;
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || "0", 10);
      const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (reduced) { el.textContent = fmt(end); continue; }
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 1100);
        el.textContent = fmt(end * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  $$("[data-count]").forEach((el) => counters.observe(el));

  // ---------- quests: reading one claims its reward ----------
  const questEls = $$("[data-quest]");
  const questSeen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      questSeen.unobserve(e.target);
      e.target.classList.add("seen");
      const id = e.target.dataset.quest;
      setTimeout(() => {
        grant("quest:" + id, 30, $(".reward", e.target));
        if (questEls.every((q) => state.claimed.includes("quest:" + q.dataset.quest))) unlock("lore");
      }, reduced ? 0 : 900);
    }
  }, { threshold: 0.55 });
  questEls.forEach((q) => {
    if (state.claimed.includes("quest:" + q.dataset.quest)) q.classList.add("seen", "instant");
    else questSeen.observe(q);
  });

  // degree progress, Aug 2024 → May 2028
  (() => {
    const start = new Date(2024, 7, 1), end = new Date(2028, 4, 31);
    const pct = Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
    $("#degree-fill").style.width = pct.toFixed(0) + "%";
    $("#degree-text").textContent = `${pct.toFixed(0)}% complete`;
  })();

  // ---------- level select ----------
  const grid = $("#levels-grid");
  const tabs = $("#world-tabs");
  let activeWorld = "all";

  function renderTabs() {
    tabs.innerHTML = "";
    for (const w of D.worlds) {
      const n = w.id === "all" ? D.projects.length : D.projects.filter((p) => p.world === w.id).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.setAttribute("aria-pressed", String(w.id === activeWorld));
      b.innerHTML = `<span></span> <small>${n}</small>`;
      b.querySelector("span").textContent = w.label;
      b.addEventListener("click", () => {
        activeWorld = w.id;
        sfx.select();
        $$(".tab", tabs).forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
        $$(".level", grid).forEach((card) => {
          card.hidden = !(activeWorld === "all" || card.dataset.world === activeWorld);
        });
      });
      tabs.appendChild(b);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderLevels() {
    grid.innerHTML = "";
    for (const p of D.projects) {
      const card = document.createElement("article");
      card.className = "level";
      card.dataset.world = p.world;
      card.dataset.id = p.id;
      const loot = p.loot.map((l) => `<li>${esc(l)}</li>`).join("");
      const links = p.links.map((l) =>
        `<a class="link" href="${esc(l.href)}" target="_blank" rel="noopener"${l.repo ? " data-repo" : ""}>${esc(l.label)}</a>`
      ).join("");
      card.innerHTML = `
        <div class="level-inner">
          <div class="face front panel">
            <div class="cart-top">
              <span class="cart-level">LEVEL ${esc(p.level)}</span>
              ${p.badge ? `<span class="tag tag-live">${esc(p.badge)}</span>` : ""}
            </div>
            <h3>${esc(p.title)}</h3>
            <p class="genre">${esc(p.genre)}</p>
            <p class="tagline">${esc(p.tagline)}</p>
            <ul class="loot" aria-label="Tech">${loot}</ul>
            <button class="flip-btn" type="button" aria-expanded="false">INSPECT</button>
          </div>
          <div class="face back panel" inert>
            <div class="cart-top"><span class="cart-level">LEVEL ${esc(p.level)} · INTEL</span></div>
            <h3>${esc(p.title)}</h3>
            <ul class="objectives tight">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
            <div class="back-foot">
              ${links || `<span class="private">🔒 ${esc(p.privateNote || "Private")}</span>`}
              <button class="flip-btn flip-back" type="button">BACK</button>
            </div>
          </div>
        </div>`;
      grid.appendChild(card);
    }
  }

  function flip(card) {
    const open = !card.classList.contains("flipped");
    card.classList.toggle("flipped", open);
    const [front, back] = $$(".face", card);
    front.inert = open;
    back.inert = !open;
    $(".front .flip-btn", card).setAttribute("aria-expanded", String(open));
    (open ? $(".back .flip-btn", card) : $(".front .flip-btn", card)).focus({ preventScroll: true });
    sfx.flip();
    if (open) {
      grant("level:" + card.dataset.id, 20, card);
      const seen = D.projects.filter((p) => state.claimed.includes("level:" + p.id)).length;
      if (seen >= 5) unlock("levels");
    }
  }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".level");
    if (!card) return;
    if (e.target.closest("a")) return;
    if (e.target.closest(".flip-btn") || e.target.closest(".front")) flip(card);
  });

  // ---------- inventory ----------
  const RARITY = { legendary: "Legendary", epic: "Epic", rare: "Rare", common: "Common" };
  function showItem(item, group) {
    const card = $("#item-card");
    card.className = `panel item-card r-${item.rarity}`;
    card.innerHTML = `
      <p class="item-rarity">${RARITY[item.rarity]} · ${esc(group)}</p>
      <h3>${esc(item.name)}</h3>
      <p class="item-label">Found in</p>
      <ul>${item.used.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>`;
  }
  function renderBags() {
    const bags = $("#bags");
    bags.innerHTML = "";
    let first = true;
    for (const g of D.inventory) {
      const bag = document.createElement("div");
      bag.className = "bag";
      bag.innerHTML = `<h3 class="bag-title"></h3><div class="slots" role="list"></div>`;
      $(".bag-title", bag).textContent = g.group;
      const slots = $(".slots", bag);
      for (const item of g.items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `slot r-${item.rarity}`;
        b.setAttribute("role", "listitem");
        b.setAttribute("aria-pressed", "false");
        b.textContent = item.name;
        b.addEventListener("click", () => {
          $$(".slot").forEach((s) => s.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          showItem(item, g.group);
          sfx.select();
          grant("item:" + item.name, 5, b);
          const n = state.claimed.filter((k) => k.startsWith("item:")).length;
          if (n >= 10) unlock("appraiser");
        });
        slots.appendChild(b);
        if (first) { showItem(item, g.group); b.setAttribute("aria-pressed", "true"); first = false; }
      }
      bags.appendChild(bag);
    }
  }

  // ---------- links ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-repo]")) unlock("source");
    if (e.target.closest("[data-contact]")) unlock("contact");
  });

  // ---------- pause menu ----------
  const pause = $("#pause");
  let lastFocus = null;
  function openPause() {
    lastFocus = document.activeElement;
    pause.hidden = false;
    document.body.classList.add("paused");
    $("button", pause).focus();
    sfx.select();
    unlock("pause");
  }
  function closePause() {
    pause.hidden = true;
    document.body.classList.remove("paused");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $("#menu-btn").addEventListener("click", openPause);
  pause.addEventListener("click", (e) => {
    if (e.target === pause || e.target.closest("[data-close]")) return closePause();
    const go = e.target.closest("[data-goto]");
    if (go) { closePause(); goTo(go.dataset.goto); }
    if (e.target.closest("[data-sound]")) toggleSound();
  });
  pause.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = $$("button", pause);
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i === 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  });

  // ---------- sound toggle ----------
  function renderSound() {
    $("#sound-btn").setAttribute("aria-pressed", String(state.sound));
    $("[data-sound]").textContent = `Sound: ${state.sound ? "on" : "off"}`;
  }
  function toggleSound() {
    state.sound = !state.sound;
    save();
    renderSound();
    sfx.select();
  }
  $("#sound-btn").addEventListener("click", toggleSound);

  // ---------- keyboard: pause + konami ----------
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  let konamiAt = 0;
  window.addEventListener("keydown", (e) => {
    konamiAt = e.code === KONAMI[konamiAt] ? konamiAt + 1 : e.code === KONAMI[0] ? 1 : 0;
    if (konamiAt === KONAMI.length) {
      konamiAt = 0;
      state.crt = !state.crt;
      save();
      document.body.classList.toggle("crt", state.crt);
      toast(state.crt ? "CRT MODE ON" : "CRT MODE OFF", "Enter the code again to switch back.", "arrow");
      unlock("konami");
    }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      pause.hidden ? openPause() : closePause();
    } else if ((e.key === "p" || e.key === "P") && document.activeElement !== $("#map")) {
      pause.hidden ? openPause() : closePause();
    }
  });

  // ---------- credits + continue ----------
  new IntersectionObserver(([e]) => { if (e.isIntersecting) unlock("end"); }, { threshold: 0.6 }).observe($("#credits"));
  $("#continue-btn").addEventListener("click", () => goTo("start"));

  // ---------- active nav link ----------
  const navLinks = $$(".hud-nav a");
  const navObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("[data-section]").forEach((s) => navObserver.observe(s));

  // ---------- reset ----------
  $("#reset-btn").addEventListener("click", () => {
    if (!confirm("Reset your XP, coins and achievements?")) return;
    const sound = state.sound;
    Object.assign(state, defaults(), { sound });
    save();
    location.reload();
  });

  // ---------- boot ----------
  document.body.classList.toggle("crt", state.crt);
  renderTabs();
  renderLevels();
  renderBags();
  renderTrophies();
  renderSound();
  renderHud();
})();
