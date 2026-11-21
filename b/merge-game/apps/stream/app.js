(() => {
  // core/store.js
  var PREFIX = "cs:";
  function createStore(space) {
    const p = PREFIX + space + ":";
    return {
      get(k) {
        try {
          const v = localStorage.getItem(p + k);
          return v == null ? null : JSON.parse(v);
        } catch (e) {
          return null;
        }
      },
      set(k, v) {
        try {
          localStorage.setItem(p + k, JSON.stringify(v));
        } catch (e) {
        }
      },
      remove(k) {
        try {
          localStorage.removeItem(p + k);
        } catch (e) {
        }
      },
      keys() {
        const out = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(p)) out.push(k.slice(p.length));
          }
        } catch (e) {
        }
        return out;
      }
    };
  }

  // core/settings.js
  var DEFAULTS = { bgm: 0.5, sfx: 0.8, voice: true, rate: 1 };
  function createSettings(defaultTheme) {
    const st = createStore("core");
    const v = Object.assign({}, DEFAULTS, { theme: defaultTheme || "chic" }, st.get("settings") || {});
    const apply = () => {
      try {
        document.documentElement.dataset.theme = v.theme;
        if (v.theme === "cute" && !document.getElementById("cs-cutefont")) {
          const l = document.createElement("link");
          l.id = "cs-cutefont";
          l.rel = "stylesheet";
          l.href = "https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&family=Zen+Maru+Gothic:wght@500;700;900&display=swap";
          document.head.appendChild(l);
        }
      } catch (e) {
      }
    };
    apply();
    const subs = /* @__PURE__ */ new Set();
    return {
      get: (k) => v[k],
      all: () => Object.assign({}, v),
      set(k, val) {
        v[k] = val;
        st.set("settings", v);
        if (k === "theme") apply();
        subs.forEach((f) => {
          try {
            f(k, val, v);
          } catch (e) {
          }
        });
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/speech.js
  function createSpeech(settings) {
    let voice2 = null;
    const pick = () => {
      try {
        const vs = speechSynthesis.getVoices() || [], en = vs.filter((x) => /^en[-_]?/i.test(x.lang || ""));
        voice2 = en.find((x) => /US/i.test(x.lang)) || en[0] || null;
      } catch (e) {
      }
    };
    try {
      pick();
      speechSynthesis.addEventListener("voiceschanged", pick);
    } catch (e) {
    }
    return {
      speak(text, opt = {}) {
        if (!settings.get("voice")) {
          opt.onend && setTimeout(opt.onend, 0);
          return;
        }
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          if (voice2) u.voice = voice2;
          u.rate = (opt.rate || 1) * settings.get("rate");
          if (opt.onend) u.onend = u.onerror = opt.onend;
          speechSynthesis.speak(u);
        } catch (e) {
          opt.onend && opt.onend();
        }
      },
      stop() {
        try {
          speechSynthesis.cancel();
        } catch (e) {
        }
      },
      get voice() {
        return voice2;
      }
    };
  }

  // core/sound.js
  function createSound(settings) {
    let ac2 = null, sfx = null, bgm = null;
    const ensure = () => {
      if (!ac2) {
        try {
          ac2 = new (window.AudioContext || window.webkitAudioContext)();
          sfx = ac2.createGain();
          bgm = ac2.createGain();
          sfx.connect(ac2.destination);
          bgm.connect(ac2.destination);
          apply();
        } catch (e) {
          ac2 = null;
        }
      }
      if (ac2 && ac2.state === "suspended") ac2.resume();
      return ac2;
    };
    const apply = () => {
      if (!ac2) return;
      sfx.gain.value = settings.get("sfx");
      bgm.gain.value = settings.get("bgm");
    };
    settings.onChange(apply);
    return {
      ctx: ensure,
      get sfxBus() {
        ensure();
        return sfx;
      },
      get bgmBus() {
        ensure();
        return bgm;
      },
      /* かんたんな効果音：beep(高さHz, 長さ秒, 波形) */
      beep(f = 660, d = 0.08, type = "triangle", vol = 0.15) {
        const c = ensure();
        if (!c) return;
        const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
        o.type = type;
        o.frequency.value = f;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(1e-3, t + d);
        o.connect(g);
        g.connect(sfx);
        o.start(t);
        o.stop(t + d + 0.02);
      }
    };
  }

  // core/rights.js
  function createRights(grants = []) {
    const st = createStore("core");
    const owned = /* @__PURE__ */ new Set([...st.get("rights") || [], ...grants]);
    const subs = /* @__PURE__ */ new Set();
    const has = (id) => owned.has(id) || id.startsWith("game:") && owned.has("sub:all");
    return {
      has,
      list: () => [...owned],
      grant(id) {
        if (owned.has(id)) return;
        owned.add(id);
        st.set("rights", [...owned].filter((x) => !grants.includes(x)));
        subs.forEach((f) => f(id));
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/events.js
  function createEvents() {
    const st = createStore("core");
    const stats = st.get("stats") || { first: null, last: null, count: {} };
    const subs = /* @__PURE__ */ new Set();
    return {
      report(game, name, data = {}) {
        const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), key = game + ":" + name;
        stats.first = stats.first || now;
        stats.last = now;
        stats.count[key] = (stats.count[key] || 0) + 1;
        st.set("stats", stats);
        subs.forEach((f) => {
          try {
            f(game, name, data);
          } catch (e) {
          }
        });
      },
      stats: () => JSON.parse(JSON.stringify(stats)),
      on(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/profile.js
  function createProfile(events, base) {
    const st = createStore("core");
    const p = Object.assign({ name: "", avatar: "default" }, st.get("profile") || {});
    return {
      get name() {
        return p.name;
      },
      setName(n) {
        p.name = String(n).slice(0, 12);
        st.set("profile", p);
      },
      avatarURL() {
        return base + "core/avatar/" + p.avatar + ".svg";
      },
      status() {
        const s = events.stats(), c = s.count, plays = Object.keys(c).filter((k) => k.endsWith(":open")).reduce((a, k) => a + c[k], 0);
        return [{ label: "\u904A\u3093\u3060\u56DE\u6570", value: plays + "\u56DE" }, { label: "\u306F\u3058\u3081\u305F\u65E5", value: s.first || "\u2014" }, { label: "\u6700\u5F8C\u306B\u904A\u3093\u3060\u65E5", value: s.last || "\u2014" }];
      }
    };
  }

  // core/ui.js
  function createUI(core2) {
    const root = document.createElement("div");
    root.className = "cs-ui";
    document.body.appendChild(root);
    const esc3 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const sheet = (html, bind) => {
      const ov = document.createElement("div");
      ov.className = "cs-ov";
      ov.innerHTML = '<div class="cs-sheet" role="dialog">' + html + '<button class="cs-btn cs-close">\u3068\u3058\u308B</button></div>';
      root.appendChild(ov);
      const close = () => ov.remove();
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close();
      });
      ov.querySelector(".cs-close").onclick = close;
      bind && bind(ov, close);
      return close;
    };
    const toast2 = (t) => {
      const d = document.createElement("div");
      d.className = "cs-toast";
      d.textContent = t;
      root.appendChild(d);
      setTimeout(() => d.remove(), 2200);
    };
    const settings = () => {
      const s = core2.settings, row = (k, label, min, max, step) => `<label class="cs-row"><span>${label}</span><input type="range" id="cs-${k}" min="${min}" max="${max}" step="${step}" value="${s.get(k)}"></label>`;
      sheet(`<h3>\u8A2D\u5B9A</h3>${row("bgm", "BGM", 0, 1, 0.05)}${row("sfx", "\u52B9\u679C\u97F3", 0, 1, 0.05)}
      <label class="cs-row"><span>\u898B\u305F\u76EE</span><select id="cs-theme"><option value="cute" ${s.get("theme") === "cute" ? "selected" : ""}>\u304B\u308F\u3044\u3044</option><option value="chic" ${s.get("theme") === "chic" ? "selected" : ""}>\u30B7\u30C3\u30AF</option></select></label>
      <label class="cs-row"><span>\u82F1\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052</span><input type="checkbox" id="cs-voice" ${s.get("voice") ? "checked" : ""}></label>
      ${row("rate", "\u8AAD\u307F\u4E0A\u3052\u306E\u901F\u3055", 0.7, 1.3, 0.05)}<button class="cs-btn" id="cs-try">\u8AAD\u307F\u4E0A\u3052\u3092\u8A66\u3059</button>`, (ov) => {
        ["bgm", "sfx", "rate"].forEach((k) => ov.querySelector("#cs-" + k).oninput = (e) => s.set(k, +e.target.value));
        ov.querySelector("#cs-theme").onchange = (e) => s.set("theme", e.target.value);
        ov.querySelector("#cs-voice").onchange = (e) => s.set("voice", e.target.checked);
        ov.querySelector("#cs-try").onclick = () => core2.speech.speak("Hello! Let\u2019s read English in chunks.");
      });
    };
    const profile = () => {
      const p = core2.profile;
      sheet(`<h3>\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB</h3><div class="cs-prof"><img src="${p.avatarURL()}" alt="\u30A2\u30D0\u30BF\u30FC"><div>
      <label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input id="cs-name" maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc3(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D\uFF08\u3044\u307E\u306F\u4EEE\u306E\u7D75\uFF09\u3002\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u9805\u76EE\u3082\u3053\u308C\u304B\u3089\u6C7A\u3081\u307E\u3059\u3002</p>
      <ul class="cs-stat">${p.status().map((x) => `<li><span>${esc3(x.label)}</span><b>${esc3(x.value)}</b></li>`).join("")}</ul>`, (ov) => {
        ov.querySelector("#cs-name").onchange = (e) => p.setName(e.target.value);
      });
    };
    return { sheet, toast: toast2, settings, profile };
  }

  // core/host.js
  var loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((ok, ng) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => {
        delete loaded[src];
        ng(new Error(src));
      };
      document.head.appendChild(s);
    }));
  }
  function createHost(core2, layer, backBtn) {
    let cur = null;
    const close = () => {
      if (!cur) return;
      const c = cur;
      cur = null;
      try {
        c.inst && c.inst.unmount && c.inst.unmount();
      } catch (e) {
        console.error(e);
      }
      core2.speech.stop();
      c.el.remove();
      layer.hidden = true;
      backBtn.hidden = true;
      document.body.classList.remove("cs-in-game");
      core2.onClose && core2.onClose(c.game.id);
    };
    backBtn.addEventListener("click", close);
    return {
      get current() {
        return cur && cur.game.id;
      },
      async open(game, opts = {}) {
        if (cur) close();
        if (game.right && !core2.rights.has(game.right)) {
          core2.ui.toast("\u3053\u306E\u30B2\u30FC\u30E0\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
          return;
        }
        const el = document.createElement("div");
        el.className = "cs-mount";
        layer.appendChild(el);
        layer.hidden = false;
        backBtn.hidden = !core2.config.backButton;
        document.body.classList.add("cs-in-game");
        const ctx = {
          core: core2,
          store: createStore(game.id),
          settings: core2.settings,
          speech: core2.speech,
          sound: core2.sound,
          opts,
          base: core2.base + "g/" + game.id + "/",
          loadScript,
          report: (name, data) => core2.events.report(game.id, name, data),
          showBack: (on) => {
            backBtn.hidden = !(on && core2.config.backButton);
          },
          exit: close
        };
        cur = { game, el, inst: null };
        ctx.report("open");
        try {
          const inst = await game.mount(el, ctx);
          if (cur && cur.el === el) cur.inst = inst || {};
          else inst && inst.unmount && inst.unmount();
        } catch (e) {
          console.error(e);
          el.innerHTML = '<p class="cs-err">\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F</p>';
          backBtn.hidden = false;
        }
      },
      close
    };
  }

  // core/dict.js
  var POSN = { v: "\u52D5\u8A5E", aux: "\u52A9\u52D5\u8A5E", n: "\u540D\u8A5E", adj: "\u5F62\u5BB9\u8A5E", adv: "\u526F\u8A5E", prep: "\u524D\u7F6E\u8A5E", conj: "\u63A5\u7D9A\u8A5E", pr: "\u4EE3\u540D\u8A5E", det: "\u9650\u5B9A\u8A5E", art: "\u51A0\u8A5E", num: "\u6570", int: "\u9593\u6295\u8A5E" };
  function createDict(base) {
    const D = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map(), PH = /* @__PURE__ */ new Map();
    let state = 0, wait = null;
    window.__csDictLoad = (rows, phr) => {
      rows.split("\n").forEach((l) => {
        const [w, pos, forms] = l.split("	");
        if (!w || !pos) return;
        const e = { w, pos: pos.split(";").map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i), x.slice(i + 1).replace(/,/g, "\u3001")];
        }) };
        const k = w.toLowerCase();
        if (!D.has(k)) D.set(k, e);
        (forms || "").split(",").filter(Boolean).forEach((f) => {
          const fk = f.toLowerCase();
          if (!F.has(fk)) F.set(fk, []);
          F.get(fk).push({ ...e, form: f });
        });
      });
      phr.split("\n").forEach((l) => {
        const [p, m] = l.split("	");
        if (!p || !m) return;
        const ws = p.split(" ");
        if (!PH.has(ws[0])) PH.set(ws[0], []);
        PH.get(ws[0]).push([ws, m]);
      });
    };
    const ready = () => {
      if (state === 2) return Promise.resolve();
      if (!wait) {
        state = 1;
        wait = loadScript(base + "core/dict/data.js").then(() => {
          state = 2;
        }, (e) => {
          state = 0;
          wait = null;
          throw e;
        });
      }
      return wait;
    };
    const norm = (w) => String(w).toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9']+$/g, "");
    function lookupAll(raw) {
      const w = norm(raw).replace(/'s$/, "");
      if (!w) return [];
      const out = [], seen = /* @__PURE__ */ new Set(), push = (e) => {
        if (e && !seen.has(e.w)) {
          seen.add(e.w);
          out.push(e);
        }
      };
      push(D.get(w));
      (F.get(w) || []).forEach(push);
      if (/n't$/.test(w)) {
        const b = w === "can't" ? "can" : w === "won't" ? "will" : w.slice(0, -3), e = D.get(b);
        if (e) push({ ...e, form: raw, neg: true });
      }
      const tries = [], add = (b) => tries.push(b);
      if (/ies$/.test(w)) add(w.slice(0, -3) + "y");
      if (/es$/.test(w)) add(w.slice(0, -2));
      if (/s$/.test(w)) add(w.slice(0, -1));
      if (/ied$/.test(w)) add(w.slice(0, -3) + "y");
      if (/ed$/.test(w)) {
        add(w.slice(0, -2));
        add(w.slice(0, -1));
        if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
      }
      if (/ing$/.test(w)) {
        add(w.slice(0, -3));
        add(w.slice(0, -3) + "e");
        if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
      }
      if (/er$/.test(w)) {
        add(w.slice(0, -2));
        add(w.slice(0, -1));
        if (/(.)\1er$/.test(w)) add(w.slice(0, -3));
      }
      if (/est$/.test(w)) {
        add(w.slice(0, -3));
        add(w.slice(0, -2));
      }
      if (/ly$/.test(w)) {
        add(w.slice(0, -2));
        if (/ily$/.test(w)) add(w.slice(0, -3) + "y");
      }
      for (const b of tries) {
        const e = D.get(b);
        if (e) push({ ...e, form: raw });
      }
      return out;
    }
    function lookup(raw, prefer) {
      const all = lookupAll(raw);
      if (!all.length) return null;
      if (!prefer || all.length === 1) return all[0];
      const rk = (e) => Math.min(...e.pos.map((p) => {
        const i = prefer.indexOf(p[0]);
        return i < 0 ? 99 : i;
      }));
      return all.reduce((a, e) => rk(e) < rk(a) ? e : a);
    }
    function phraseAt(words, wi) {
      const lem = (w) => {
        const e = lookup(w);
        return e ? e.w.toLowerCase() : norm(w);
      };
      let best = null;
      for (let i = Math.max(0, wi - 3); i <= wi; i++) {
        [.../* @__PURE__ */ new Set([norm(words[i]), lem(words[i])])].forEach((k) => (PH.get(k) || []).forEach(([ws, m]) => {
          const end = i + ws.length - 1;
          if (end < wi || end >= words.length) return;
          for (let j = 1; j < ws.length; j++) {
            const w = words[i + j];
            if (ws[j] !== norm(w) && ws[j] !== lem(w)) return;
          }
          if (!best || ws.length > best.ws.length) best = { ws, m, s: i, e: end };
        }));
      }
      return best;
    }
    return { ready, lookup, lookupAll, phraseAt, POSN, get loaded() {
      return state === 2;
    }, get loading() {
      return state === 1;
    }, get size() {
      return D.size;
    } };
  }

  // core/chunk.js
  var RN = { S: ["\u8AB0\u304C\u30FB\u4F55\u304C", "\u4E3B\u8A9E"], V: ["\u3059\u308B", "\u52D5\u8A5E"], O: ["\u4F55\u3092\u30FB\u8AB0\u3092", "\u76EE\u7684\u8A9E"], I: ["\u8AB0\u306B", "\u9593\u63A5\u76EE\u7684\u8A9E"], C: ["\u3069\u3046\u3060", "\u88DC\u8A9E"], P: ["\u3069\u3053\u3067", "\u5834\u6240"], T: ["\u3044\u3064", "\u6642"], M: ["\u3069\u3046\u3084\u3063\u3066", "\u69D8\u5B50\u30FB\u624B\u6BB5"], R: ["\u306A\u305C", "\u7406\u7531"], F: ["\u3082\u3057", "\u6761\u4EF6"], X: ["\u8AAC\u660E", "\u4FEE\u98FE\u8A9E\u53E5"] };
  function parseSentence(str, ja) {
    const units = [], words = [], unitOf = [];
    let who = null;
    if (str[0] === "@") {
      who = str[1];
      str = str.slice(3);
    }
    str.split(" | ").forEach((us) => {
      const role = us[0];
      let rest = us.slice(2), note = null;
      const hi = rest.indexOf("#");
      if (hi >= 0) {
        note = rest.slice(hi + 1).split("|");
        rest = rest.slice(0, hi);
      }
      const ei = rest.indexOf("=");
      const en = ei >= 0 ? rest.slice(0, ei) : rest;
      let jp = ei >= 0 ? rest.slice(ei + 1) : "", subJp = null;
      const m = jp.match(/^(.*)\{(.*)\}$/);
      if (m) {
        jp = m[1];
        subJp = m[2].split("/");
      }
      const u = { role, jp, note, s: words.length, subs: null };
      const parts = en.split(" / ");
      if (parts.length > 1) u.subs = [];
      parts.forEach((p, pi) => {
        const s = words.length;
        p.split(" ").forEach((w) => {
          words.push(w);
          unitOf.push(units.length);
        });
        if (u.subs) u.subs.push({ s, e: words.length - 1, jp: subJp ? subJp[pi] || "" : "" });
      });
      u.e = words.length - 1;
      u.text = words.slice(u.s, u.e + 1).join(" ");
      units.push(u);
    });
    return { units, words, unitOf, ja, en: words.join(" "), who };
  }
  function wordRole(sen, i) {
    const u = sen.units[sen.unitOf[i]];
    if (u.subs && u.role !== "V") {
      const pi = u.subs.findIndex((p) => i >= p.s && i <= p.e);
      if (pi > 0) return "X";
    }
    return u.role;
  }
  function gradeRange(sen, q, ans) {
    const eq = (x, y) => x && y && x.si === y.si && x.a === y.a && x.b === y.b, W2 = (a, b) => sen.words.slice(a, b + 1).join(" ");
    if (!ans) return { mark: "x", why: "\u672A\u56DE\u7B54" };
    if (eq(ans, q) || (q.alts || []).some((x) => x.a >= 0 && eq(ans, x))) return { mark: "o", why: "" };
    if ((q.partials || []).some((x) => eq(ans, x))) return { mark: "t", why: "\u90E8\u5206\u70B9" };
    if (ans.si !== q.si) return { mark: "x", why: "\u5225\u306E\u6587\u3092\u9078\u3093\u3067\u3044\u308B" };
    if (ans.b < q.a || ans.a > q.b) return { mark: "x", why: "\u7B54\u3048\u3068\u91CD\u306A\u3063\u3066\u3044\u306A\u3044" };
    const unitRole = (i) => sen.units[sen.unitOf[i]].role;
    if (ans.a >= q.a && ans.b <= q.b) {
      const u = sen.units[sen.unitOf[q.a]], part = u.subs ? u.subs.find((p) => q.a >= p.s && q.a <= p.e) : u;
      const head = { a: Math.max(q.a, part.s), b: Math.min(q.b, part.e) };
      const miss = [];
      for (let i = q.a; i <= q.b; i++) if (i < ans.a || i > ans.b) miss.push(i);
      if (ans.a <= head.a && ans.b >= head.b) return { mark: "t", why: `\u77ED\u3044\uFF08\u8DB3\u308A\u306A\u3044\uFF1A${miss.map((i) => sen.words[i]).join(" ")}\uFF09` };
      return { mark: "x", why: "\u7B54\u3048\u306E\u4E2D\u5FC3\u304C\u5165\u3063\u3066\u3044\u306A\u3044" };
    }
    if (ans.a <= q.a && ans.b >= q.b) {
      const roles = /* @__PURE__ */ new Set();
      for (let i = q.a; i <= q.b; i++) roles.add(unitRole(i));
      const extra = [];
      for (let i = ans.a; i <= ans.b; i++) if (i < q.a || i > q.b) extra.push(i);
      const bad = extra.filter((i) => !roles.has(unitRole(i)));
      if (!bad.length) return { mark: "t", why: `\u9577\u3044\uFF08\u4F59\u5206\uFF1A${extra.map((i) => sen.words[i]).join(" ")}\uFF09` };
      const br = [...new Set(bad.map(unitRole))].map((r) => RN[r][1]).join("\u30FB");
      return { mark: "x", why: `\u9577\u3044\uFF08\u4F59\u5206\uFF1A${W2(bad[0], bad[bad.length - 1])} \uFF1D${br}\uFF09` };
    }
    return { mark: "x", why: "\u7BC4\u56F2\u304C\u305A\u308C\u3066\u3044\u308B" };
  }

  // core/reader.js
  var FONT = { xs: 14, s: 17, m: 20, l: 23, xl: 28 };
  var FK = Object.keys(FONT);
  var POSPREF = {
    S: ["n", "pr", "art", "det", "adj", "num"],
    O: ["n", "pr", "art", "det", "adj", "num"],
    I: ["pr", "n"],
    C: ["adj", "n", "pr"],
    P: ["prep", "n", "art", "det", "adj", "adv"],
    T: ["prep", "conj", "n", "adv", "det", "art"],
    M: ["prep", "adv", "n", "art", "det", "adj"],
    R: ["conj", "prep"],
    F: ["conj"]
  };
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HTML = `<header class="rdTop"><button class="gear" data-k="back"></button><div class="rdStory" data-k="title"></div>
  <button class="gear" data-k="fontM" aria-label="\u6587\u5B57\u3092\u5C0F\u3055\u304F">A\u2212</button><button class="gear" data-k="fontP" aria-label="\u6587\u5B57\u3092\u5927\u304D\u304F">A\uFF0B</button><button class="gear" data-k="set" aria-label="\u8868\u793A\u306E\u8A2D\u5B9A">\u2699</button></header>
<div class="rdModeRow" data-k="modeRow"><div class="rdSeg" data-k="seg"><button data-v="read">\u8AAD\u3080</button><button data-v="solve">\u89E3\u304F</button></div><button class="gear" data-k="gram">\u30C1\u30E3\u30F3\u30AF</button><button class="gear" data-k="jaBtn">\u8A33</button><button class="gear" data-k="hint">\u{1F4A1}\u30D2\u30F3\u30C8</button></div>
<div class="rdQ"><button data-k="qPrev" class="qNav" aria-label="\u524D\u306E\u554F\u984C">\u2039</button>
  <div class="rdQText"><span class="rdQNum" data-k="qNum"></span><b data-k="q"></b><span class="rdAns" data-k="ans"></span></div>
  <button data-k="qNext" class="qNav" aria-label="\u6B21\u306E\u554F\u984C">\u203A</button></div>
<div class="rdChoices" data-k="choices"></div>
<div class="rdGest" data-k="gest"><div class="rdPad"><div class="rdPadHint">\u3053\u306E\u5E83\u3044\u5834\u6240\u306E\u3069\u3053\u3092\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u3082\u3001\u82F1\u6587\u304C\u52D5\u304F\u3088</div>
  <div class="rdCtxBox" data-k="prevLine"></div>
  <section class="rdLane" data-k="lane" aria-label="\u304A\u8A71\u306E\u6587"><div class="strip" data-k="strip"></div><div class="cutline" data-k="cutline" data-lbl="\u7DDA\u306E\u4F4D\u7F6E"></div><div class="fadeL"></div><div class="fadeR"></div></section>
  <div class="rdCtxBox" data-k="nextLine"></div></div>
<div class="rdInfo" data-k="info" hidden></div>
<div class="rdSenNav"><button data-k="up" class="navBtn" aria-label="\u524D\u306E\u6587">\u25B2</button><span data-k="senNum"></span><button data-k="down" class="navBtn" aria-label="\u6B21\u306E\u6587">\u25BC</button><button data-k="say" class="navBtn wide" aria-label="\u3053\u306E\u6587\u3092\u8AAD\u307F\u4E0A\u3052\u308B">\u{1F50A} \u805E\u304F</button><button data-k="lines" class="navBtn wide" aria-label="\u8868\u793A\u3059\u308B\u6587\u306E\u6570">\u8868\u793A 1</button></div>
<input type="range" data-k="bar" class="scrub" min="0" max="10" step="1" aria-label="\u6587\u306E\u4E2D\u306E\u4F4D\u7F6E">
<p class="rdHelp" data-k="help"></p></div>
<div class="rdBtns" data-k="btns"></div>
<button class="primary rdCheck" data-k="check">\u7B54\u3048\u5408\u308F\u305B</button>
<div class="rdModal" data-k="modal" hidden><div class="rdSheet" data-k="sheet" role="dialog" aria-modal="true"></div></div>`;
  function createReader(core2) {
    const store = createStore("reader");
    const S = Object.assign({ font: "m", lines: 1, seg: true, role: true, ja: true, always: false, view: "read", disp: "easy" }, store.get("settings") || {});
    const save2 = () => store.set("settings", S);
    let cur = null;
    function open(story, opts = {}) {
      if (cur) cur.close(true);
      const root = document.createElement("div");
      root.className = "cs-reader";
      root.innerHTML = HTML;
      document.body.appendChild(root);
      const $2 = (k) => root.querySelector(`[data-k="${k}"]`);
      const dict = core2.dict;
      let dictReady = dict.loaded;
      const sens = story.list.map(([en, ja]) => parseSentence(en, ja));
      const qs = (story.questions || []).map((q) => {
        if (Array.isArray(q)) {
          const [si, ui, qq] = q, u = sens[si].units[ui];
          return { type: "range", si, a: u.s, b: u.e, alts: [], partials: [], q: qq, ans: null };
        }
        return { alts: [], partials: [], ...q, ans: null };
      });
      const test = story.mode === "test";
      const RD = {
        qi: 0,
        si: 0,
        p: 0,
        start: null,
        sel: null,
        hints: 0,
        hintOn: false,
        hintQ: /* @__PURE__ */ new Set(),
        gpos: [],
        view: S.view,
        gramOn: !!S.always,
        showJa: false,
        info: null,
        fullOpen: false,
        saying: false,
        hintPolicy: test ? story.hint || "none" : "grammar",
        hintCost: test ? story.hintCost == null ? 20 : +story.hintCost : 0
      };
      const sen = () => sens[RD.si];
      const view = () => test ? "solve" : qs.length ? RD.view : "read";
      const applyFont = () => root.style.setProperty("--laneFont", FONT[S.font] + "px");
      const speak2 = (t) => core2.speech.speak(t, { rate: 0.9 });
      const stopSay = () => {
        core2.speech.stop();
        RD.saying = false;
        $2("say").textContent = "\u{1F50A} \u805E\u304F";
      };
      const beep = (k) => {
        const s = core2.sound;
        ({ mini: () => s.beep(1250, 0.04, "triangle", 0.07), great: () => s.beep(988, 0.09, "sine", 0.13), excellent: () => {
          s.beep(880, 0.07, "sine", 0.14);
          setTimeout(() => s.beep(1320, 0.09, "sine", 0.12), 55);
        } }[k] || (() => {
        }))();
      };
      const lineX = () => Math.round($2("lane").clientWidth * 0.34);
      const ro = new ResizeObserver(() => render(true));
      if (!dictReady) dict.ready().then(() => {
        dictReady = true;
        if (cur && cur.root === root) infoUI();
      }, () => {
      });
      const sheet = (html, closable = true) => {
        $2("sheet").innerHTML = html;
        $2("modal").hidden = false;
        $2("modal").onclick = (e) => {
          if (closable && e.target === $2("modal")) closeSheet();
        };
      };
      const closeSheet = () => {
        $2("modal").hidden = true;
        $2("sheet").innerHTML = "";
      };
      const ask = (msg, yes) => new Promise((ok) => {
        sheet(`<p class="note" style="white-space:pre-line;font-size:14px">${esc(msg)}</p><div class="btns"><button class="ghost" data-a="no">\u3084\u3081\u308B</button><button class="primary" data-a="yes">${esc(yes)}</button></div>`, false);
        $2("sheet").querySelector("[data-a=no]").onclick = () => {
          closeSheet();
          ok(false);
        };
        $2("sheet").querySelector("[data-a=yes]").onclick = () => {
          closeSheet();
          ok(true);
        };
      });
      function modeUI(v) {
        const hasQ = qs.length > 0;
        $2("seg").hidden = test || !hasQ;
        $2("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
        $2("gram").hidden = v !== "read";
        $2("gram").classList.toggle("on", !!RD.gramOn);
        $2("jaBtn").hidden = v !== "read" || test || S.ja === false;
        $2("jaBtn").classList.toggle("on", !!RD.showJa);
        $2("hint").hidden = v !== "solve" || RD.hintPolicy === "none";
        $2("hint").classList.toggle("on", !!RD.hintOn);
        $2("hint").textContent = "\u{1F4A1}\u30D2\u30F3\u30C8" + (RD.hintCost ? `\uFF08\u2212${RD.hintCost}\u70B9\uFF09` : "");
        $2("modeRow").hidden = [...$2("modeRow").children].every((c) => c.hidden);
      }
      function wordInfoHTML(sn, wi, ja) {
        const raw = sn.words[wi], clean = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'’]+$/g, ""), u = sn.units[sn.unitOf[wi]];
        let pref = POSPREF[u.role] || [];
        if (u.role === "V") pref = wi < u.e ? ["aux", "v"] : ["v", "aux"];
        const e = dict.lookup(raw, pref);
        const ph = dict.phraseAt(sn.words, wi), phH = ph ? `<div class="riNote">\u719F\u8A9E\u30FB\u8907\u5408\u8A9E\uFF1A<b>${esc(ph.ws.join(" "))}</b>${ja ? ` \uFF1D ${esc(ph.m)}` : ""}</div>` : "";
        if (!e) return `<div><span class="posTag">${!dictReady ? "\u8F9E\u66F8\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" : /^[A-Z]/.test(clean) && wi > 0 ? "\u540D\u524D\u306A\u3069" : "\u8F9E\u66F8\u306B\u306A\u3044\u5358\u8A9E"}</span> <b>${esc(clean)}</b>${phH}</div>`;
        if (u.role === "V" && wi < u.e && !e.pos.some((p) => p[0] === "aux")) pref = ["v", "aux"];
        const rk = (t) => {
          const i = pref.indexOf(t);
          return i < 0 ? 99 : i;
        };
        const [main, ...rest] = [...e.pos].sort((x, y) => rk(x[0]) - rk(y[0]));
        const P2 = dict.POSN, base = e.w.toLowerCase() !== clean.toLowerCase() ? `<small class="riBase">\uFF08\u5143\u306E\u5F62 ${esc(e.w)}${e.neg ? "\uFF0Bnot" : ""}\uFF09</small>` : "";
        return `<div><span class="posTag">${P2[main[0]] || main[0]}</span> <b>${esc(clean)}</b>${base}${ja ? ` \uFF1D ${esc(main[1])}` : ""}` + (rest.length ? `<div class="riNote">\u307B\u304B\u306B\uFF1A${rest.map(([t, m]) => (P2[t] || t) + (ja ? `\uFF08${esc(m)}\uFF09` : "")).join("\u3001")}</div>` : "") + phH + "</div>";
      }
      function infoUI() {
        const el = $2("info");
        if (view() !== "read") {
          el.innerHTML = "";
          el.hidden = true;
          return;
        }
        const sn = sen(), d2 = S.disp, ja = RD.showJa, roleOn = RD.gramOn && S.role !== false;
        let h = "";
        const inf = RD.info && RD.info.si === RD.si && RD.info.chunk === !!RD.gramOn ? RD.info : null;
        if (inf && inf.chunk) {
          const u = sn.units[inf.u], rn = RN[u.role] || ["", u.role], note = u.note || [];
          const tag = d2 === "gram" ? rn[1] : d2 === "both" ? `${rn[0]}\uFF0F${rn[1]}` : rn[0];
          const nt = d2 === "gram" ? note[1] || "" : d2 === "both" ? [note[0], note[1]].filter(Boolean).join("\uFF0F") : note[0] || "";
          h += `<div><span class="roleTag r${u.role}">${esc(tag) || "\u3000"}</span> <b>${esc(u.text)}</b>${ja && u.jp ? ` \uFF1D ${esc(u.jp)}` : ""}${nt ? `<div class="riNote">${esc(nt)}</div>` : ""}</div>`;
        }
        if (inf && !inf.chunk) h += wordInfoHTML(sn, inf.wi, ja);
        if (ja) {
          h += `<button class="riFull" data-a="full">\u5168\u6587\u306E\u8A33 ${RD.fullOpen ? "\u25B2" : "\u25BC"}</button>`;
          if (RD.fullOpen) {
            if (sn.units.some((u) => u.jp)) h += `<div class="il">${sn.units.map((u) => `<span class="ilItem"${roleOn ? ` style="--c:var(--c${u.role})"` : ""}><span class="ilEn">${esc(u.text)}</span>${u.jp ? `<span class="ilJp">${esc(u.jp)}</span>` : ""}</span>`).join("")}</div>`;
            if (sn.ja) h += `<div class="riJa">${esc(sn.ja)}</div>`;
          }
        }
        el.innerHTML = h;
        el.hidden = !h;
        const f = el.querySelector("[data-a=full]");
        if (f) f.onclick = () => {
          RD.fullOpen = !RD.fullOpen;
          infoUI();
        };
      }
      function infoTap(wi) {
        if (wi < 0) {
          RD.info = null;
          render(true);
          return;
        }
        const sn = sen(), ui = sn.unitOf[wi], u = sn.units[ui], chunk = !!RD.gramOn;
        if (!test) {
          stopSay();
          speak2(chunk ? u.text : sn.words[wi].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'’]+$/g, ""));
        }
        const same = RD.info && RD.info.si === RD.si && RD.info.chunk === chunk && (chunk ? RD.info.u === ui : RD.info.wi === wi);
        RD.info = same ? null : chunk ? { si: RD.si, chunk: true, u: ui, s: u.s, e: u.e } : { si: RD.si, chunk: false, wi, s: wi, e: wi };
        render(true);
      }
      function settingsUI() {
        const sel = (k, v, list) => `<select data-s="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v) === a ? " selected" : ""}>${b}</option>`).join("")}</select>`;
        const onoff = (k, v) => sel(k, v ? "on" : "off", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]]);
        sheet(`<h2>\u8868\u793A\u306E\u8A2D\u5B9A</h2>
        ${test ? "" : `<p class="note">\u300C\u8AAD\u3080\u300D\u3067\u300C\u30C1\u30E3\u30F3\u30AF\u300D\u3092\u62BC\u3057\u305F\u3068\u304D\u306E\u898B\u3048\u65B9\u3092\u9078\u3079\u307E\u3059\u3002</p>
        <div class="row"><label>\u533A\u5207\u308A</label>${onoff("seg", S.seg !== false)}</div>
        <div class="row"><label>\u5F79\u5272\u306E\u8272</label>${onoff("role", S.role !== false)}</div>
        <div class="row"><label>\u65E5\u672C\u8A9E\u306E\u300C\u8A33\u300D\u30DC\u30BF\u30F3</label>${onoff("ja", S.ja !== false)}</div>
        <div class="row"><label>\u6700\u521D\u304B\u3089\u30C1\u30E3\u30F3\u30AF\u3067\u898B\u308B</label>${onoff("always", !!S.always)}</div>
        <div class="row"><label>\u5F79\u5272\u306E\u540D\u524D</label>${sel("disp", S.disp, [["easy", "\u304B\u3093\u305F\u3093\uFF08\u8AB0\u304C\u30FB\u3059\u308B\uFF09"], ["gram", "\u6587\u6CD5\uFF08\u4E3B\u8A9E\u30FB\u52D5\u8A5E\uFF09"], ["both", "\u4E21\u65B9"]])}</div>`}
        <div class="row"><label>\u8868\u793A\u3059\u308B\u6587\u306E\u6570</label>${sel("lines", S.lines, [["1", "1\u6587\uFF08\u4ECA\u306E\u6587\u3060\u3051\uFF09"], ["2", "2\u6587\uFF08\u6B21\u306E\u6587\u3082\uFF09"], ["3", "3\u6587\uFF08\u524D\u5F8C\u306E\u6587\u3082\uFF09"]])}</div>
        <p class="note" style="font-size:10px">\u5358\u8A9E\u306E\u8F9E\u66F8\uFF1AEJDict\uFF08CC0\uFF09\uFF0F\u54C1\u8A5E\uFF1AWordNet 3.1\uFF08Princeton University\uFF09\uFF0F\u8A9E\u306E\u9078\u3073\u65B9\uFF1AFrequencyWords\uFF08CC BY-SA 4.0\uFF09</p>
        <div class="btns"><button class="primary" data-a="close">\u9589\u3058\u308B</button></div>`);
        $2("sheet").querySelectorAll("select").forEach((s) => s.onchange = () => {
          const k = s.dataset.s, v = s.value;
          if (k === "lines") S.lines = +v;
          else if (k === "disp") S.disp = v;
          else {
            S[k] = v === "on";
            if (k === "always") RD.gramOn = S.always;
          }
          save2();
        });
        $2("sheet").querySelector("[data-a=close]").onclick = () => {
          closeSheet();
          render(true);
        };
      }
      function range() {
        if (RD.sel && RD.sel.si === RD.si) return [RD.sel.a, RD.sel.b];
        if (RD.start && RD.start.si === RD.si) {
          const g1 = Math.min(RD.start.g, RD.p), g2 = Math.max(RD.start.g, RD.p);
          return [g1, g2 - 1];
        }
        return [-1, -2];
      }
      function render(noAnim) {
        if (!root.isConnected) return;
        const sn = sen(), n = sn.words.length, [ra, rb] = range(), q = qs[RD.qi];
        const unitEnds = new Set(sn.units.map((u) => u.e));
        const v = view(), gOn = v === "read" ? RD.gramOn : RD.hintOn && RD.hintPolicy === "grammar";
        const segOn = gOn && (v !== "read" || S.seg !== false), roleOn = gOn && (v !== "read" || S.role !== false);
        const st = $2("strip");
        const selOn = RD.sel && RD.sel.si === RD.si, startOn = RD.start && RD.start.si === RD.si;
        st.innerHTML = sn.words.map((w, i) => {
          let cls = "w";
          if (i >= ra && i <= rb) cls += " sel";
          else if (roleOn) cls += " r" + wordRole(sn, i);
          if (RD.info && RD.info.si === RD.si && i >= RD.info.s && i <= RD.info.e) cls += " hl";
          const pre = selOn && i === ra || startOn && i === RD.start.g ? '<span class="cutmark brk">\uFF3B</span>' : "";
          let post = selOn && i === rb ? '<span class="cutmark brk">\uFF3D</span>' : "";
          if (!post && segOn && unitEnds.has(i) && i < n - 1) post = '<span class="cutmark hint">\uFF5C</span>';
          return `${pre}<span class="${cls}">${esc(w)}</span>${post}`;
        }).join("");
        const ws = [...st.querySelectorAll(".w")];
        RD.gpos = [];
        for (let g = 0; g <= n; g++) {
          if (g === 0) RD.gpos.push(ws[0].offsetLeft - 4);
          else if (g === n) RD.gpos.push(ws[n - 1].offsetLeft + ws[n - 1].offsetWidth + 6);
          else RD.gpos.push((ws[g - 1].offsetLeft + ws[g - 1].offsetWidth + ws[g].offsetLeft) / 2);
        }
        st.classList.toggle("step", !noAnim);
        st.style.transform = `translate(${lineX() - RD.gpos[RD.p]}px,-50%)`;
        $2("cutline").style.left = lineX() + "px";
        const bar = $2("bar");
        bar.max = n;
        bar.value = RD.p;
        const k = S.lines === 3 ? 2 : S.lines === 2 ? 1 : 0, ctxL = (step, mark) => {
          const out = [];
          for (let j = 1; j <= k; j++) {
            const t = sens[RD.si + step * j];
            if (t) out.push(`<div class="rdCtx${j > 1 ? " far" : ""}">${mark} ${esc(t.en)}</div>`);
          }
          return out;
        };
        $2("prevLine").innerHTML = ctxL(-1, "\u25B2").reverse().join("");
        $2("nextLine").innerHTML = ctxL(1, "\u25BC").join("");
        $2("lines").textContent = "\u8868\u793A " + S.lines;
        $2("say").hidden = test;
        $2("senNum").textContent = `${RD.si + 1} / ${sens.length} \u6587\u76EE`;
        $2("up").disabled = RD.si === 0;
        $2("down").disabled = RD.si === sens.length - 1;
        root.classList.toggle("vRead", v === "read");
        modeUI(v);
        infoUI();
        if (v === "read") {
          $2("help").textContent = RD.gramOn ? `\u30C1\u30E3\u30F3\u30AF\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u5F79\u5272${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059` : `\u5358\u8A9E\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u54C1\u8A5E${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059\u3002\u300C\u30C1\u30E3\u30F3\u30AF\u300D\u3067\u30C1\u30E3\u30F3\u30AF\u3054\u3068\u306B\u898B\u3089\u308C\u307E\u3059`;
          return;
        }
        if (!q) {
          $2("qNum").textContent = "";
          $2("q").textContent = "\uFF08\u554F\u984C\u306A\u3057\uFF1A\u8AAD\u3080\u3060\u3051\uFF09";
          $2("ans").textContent = "";
          $2("choices").innerHTML = "";
          $2("btns").innerHTML = "";
          $2("help").textContent = "\u5DE6\u53F3\u30FB\u4E0A\u4E0B\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u8AAD\u3081\u307E\u3059";
          $2("check").hidden = true;
          return;
        }
        $2("check").hidden = false;
        $2("qNum").textContent = `Q${RD.qi + 1} / ${qs.length}`;
        $2("q").textContent = q.q;
        $2("qPrev").disabled = RD.qi === 0;
        $2("qNext").disabled = RD.qi === qs.length - 1;
        const answered = qs.filter((x) => x.ans).length;
        $2("check").textContent = test ? `\u63D0\u51FA\u3059\u308B\uFF08${answered}/${qs.length}\u554F\uFF09` : `\u7B54\u3048\u5408\u308F\u305B\uFF08${answered}/${qs.length}\u554F\uFF09`;
        if (q.type === "choice") {
          $2("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + q.options[q.ans.choice] : "";
          $2("choices").innerHTML = q.options.map((o, i) => `<button data-c="${i}" class="${q.ans && q.ans.choice === i ? "on" : ""}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`).join("");
          $2("choices").querySelectorAll("button").forEach((b) => b.onclick = () => {
            q.ans = { choice: +b.dataset.c };
            beep("mini");
            render(true);
            const qi = RD.qi;
            setTimeout(() => {
              if (RD.qi === qi) nextUnanswered();
            }, 350);
          });
          $2("btns").innerHTML = "";
          $2("help").textContent = "\u82F1\u6587\u3092\u8AAD\u3093\u3067\u3001\u9078\u629E\u80A2\u304B\u3089\u7B54\u3048\u3092\u9078\u307C\u3046";
          return;
        }
        $2("choices").innerHTML = "";
        $2("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + sens[q.ans.si].words.slice(q.ans.a, q.ans.b + 1).join(" ") : "";
        const help = RD.sel ? "\u3053\u306E\u7BC4\u56F2\u3067\u3044\u3044\uFF1F" : startOn ? "\u7B54\u3048\u306E\u7D42\u308F\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\u3053\u3053\u307E\u3067 \uFF3D\u300D" : "\u7B54\u3048\u306E\u59CB\u307E\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\uFF3B \u3053\u3053\u304B\u3089\u300D\uFF08\u30EC\u30FC\u30F3\u3092\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u52D5\u304B\u3059\uFF09";
        $2("help").textContent = (RD.hintQ.has(RD.qi) && q.si != null ? `\u{1F4A1} \u7B54\u3048\u306F ${q.si + 1} \u6587\u76EE\u306B\u3042\u308B\u3088\u3002 ` : "") + help;
        $2("btns").innerHTML = RD.sel ? '<button data-a="redo">\u9078\u3073\u306A\u304A\u3057</button><button data-a="ok" class="ok">\u6C7A\u5B9A</button>' : `${startOn ? '<button data-a="redo">\u3084\u3081\u308B</button>' : ""}<button data-a="cut" class="cutMain">${startOn ? "\u3053\u3053\u307E\u3067 \uFF3D" : "\uFF3B \u3053\u3053\u304B\u3089"}</button>`;
        const B = (a) => $2("btns").querySelector(`[data-a=${a}]`);
        if (B("redo")) B("redo").onclick = () => {
          RD.sel = null;
          RD.start = null;
          render(true);
        };
        if (B("ok")) B("ok").onclick = decide;
        if (B("cut")) B("cut").onclick = cut;
      }
      function cut() {
        if (RD.sel) return;
        if (!RD.start || RD.start.si !== RD.si) RD.start = { si: RD.si, g: RD.p };
        else {
          if (RD.p === RD.start.g) return;
          RD.sel = { si: RD.si, a: Math.min(RD.start.g, RD.p), b: Math.max(RD.start.g, RD.p) - 1 };
          RD.start = null;
        }
        beep("mini");
        const lw = $2("lane");
        lw.classList.remove("flash");
        void lw.offsetWidth;
        lw.classList.add("flash");
        render(true);
      }
      function decide() {
        const q = qs[RD.qi];
        q.ans = RD.sel;
        RD.sel = null;
        RD.start = null;
        beep("great");
        nextUnanswered();
      }
      function nextUnanswered() {
        const next = qs.findIndex((x, i) => i > RD.qi && !x.ans), first = qs.findIndex((x) => !x.ans), to = next >= 0 ? next : first;
        if (to >= 0 && to !== RD.qi) {
          RD.qi = to;
          render(true);
          qFlash(1);
        } else {
          render(true);
          if (to < 0) toast2(test ? "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u63D0\u51FA\u3059\u308B\u300D\u3078" : "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3078");
        }
      }
      const qFlash = (d2) => $2("q").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateX(${d2 * 30}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      const toast2 = (t) => {
        const el = $2("help");
        el.textContent = t;
        el.animate([{ color: "var(--accent)" }, { color: "var(--muted)" }], { duration: 1600 });
      };
      const goQ = (i, d2) => {
        if (i < 0 || i >= qs.length || i === RD.qi) return;
        RD.qi = i;
        RD.hintOn = false;
        RD.sel = null;
        RD.start = null;
        render(true);
        qFlash(d2);
      };
      const move = (p, noAnim) => {
        const n = sen().words.length;
        p = Math.max(0, Math.min(n, p));
        if (p === RD.p) return;
        RD.p = p;
        render(noAnim);
      };
      function say2() {
        if (test) return;
        if (RD.saying) {
          stopSay();
          return;
        }
        if (!core2.settings.get("voice")) {
          toast2("\u8AAD\u307F\u4E0A\u3052\u304C\u30AA\u30D5\u306B\u306A\u3063\u3066\u3044\u307E\u3059\uFF08\u2699 \u8A2D\u5B9A\u3067\u5909\u3048\u3089\u308C\u307E\u3059\uFF09");
          return;
        }
        RD.saying = true;
        $2("say").textContent = "\u25A0 \u6B62\u3081\u308B";
        core2.speech.speak(sen().en, { rate: 0.9, onend: () => {
          if (RD.saying) {
            RD.saying = false;
            $2("say").textContent = "\u{1F50A} \u805E\u304F";
          }
        } });
      }
      function sentence(d2) {
        const si = RD.si + d2;
        if (si < 0 || si >= sens.length) return;
        stopSay();
        RD.si = si;
        RD.p = 0;
        RD.fullOpen = false;
        RD.start = null;
        if (RD.sel && RD.sel.si !== si) RD.sel = null;
        render(true);
        $2("lane").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateY(${d2 * 18}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      }
      const RV = { i: 0, on: false, tok: 0 };
      const rvStop = () => {
        RV.on = false;
        RV.tok++;
        core2.speech.stop();
      };
      const rvUI = () => {
        const b = $2("sheet").querySelector("[data-a=rvPlay]");
        if (!b) return;
        b.textContent = RV.on ? "\u23F8 \u4E00\u6642\u505C\u6B62" : RV.i > 0 ? "\u25B6 \u3064\u3065\u304D" : "\u25B6 \u6700\u521D\u304B\u3089";
        $2("sheet").querySelectorAll(".rvSen").forEach((el) => el.classList.toggle("on", RV.on && +el.dataset.i === RV.i));
      };
      function rvSpeak() {
        if (RV.i >= sens.length) {
          RV.on = false;
          RV.i = 0;
          rvUI();
          return;
        }
        const tok = ++RV.tok;
        RV.on = true;
        rvUI();
        const el = $2("sheet").querySelector(`.rvSen[data-i="${RV.i}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        core2.speech.speak(sens[RV.i].en, { rate: 0.9, onend: () => {
          if (tok !== RV.tok || !RV.on) return;
          RV.i++;
          rvSpeak();
        } });
      }
      const judge = (q) => q.type === "choice" ? q.ans && q.ans.choice === q.correct ? "o" : "x" : gradeRange(sens[q.si], q, q.ans).mark;
      const spanHTML = (sn, exp, mine) => sn.words.map((w, i) => {
        const e = exp && i >= exp.a && i <= exp.b, m = mine && mine.si === exp.si && i >= mine.a && i <= mine.b;
        return `<span class="spw${e ? " spE" : ""}${m ? " spM" : ""}">${esc(w)}</span>`;
      }).join(" ");
      const summary = () => qs.map((q, i) => {
        if (q.type === "choice") return { q: q.q, mine: q.ans ? q.options[q.ans.choice] : "", mark: judge(q), why: "", pts: q.pts || 100, hint: RD.hintQ.has(i) };
        const g = gradeRange(sens[q.si], q, q.ans);
        return { q: q.q, mine: q.ans ? sens[q.ans.si].words.slice(q.ans.a, q.ans.b + 1).join(" ") : "", mark: g.mark, why: g.why, pts: q.pts || 100, hint: RD.hintQ.has(i) };
      });
      async function grade() {
        const pending = RD.sel || RD.start ? RD.qi : -1;
        const un = qs.map((q, i) => !q.ans ? i : -1).filter((i) => i >= 0), names = un.map((i) => `Q${i + 1}`).join("\u30FB");
        const pendNote = pending >= 0 && !qs[pending].ans ? `<p class="note">Q${pending + 1} \u306F\u7BC4\u56F2\u3092\u9078\u3073\u304B\u3051\u305F\u307E\u307E\u300C\u6C7A\u5B9A\u300D\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002</p>` : "";
        const goUn = () => {
          closeSheet();
          if (!(pending >= 0 && un[0] === pending)) goQ(un[0], 1);
        };
        if (un.length && !test) {
          sheet(`<h2>\u307E\u3060\u7B54\u3048\u3066\u3044\u306A\u3044\u554F\u984C\u304C\u3042\u308A\u307E\u3059</h2><p class="note">${names} \u306B\u7B54\u3048\u3066\u304B\u3089\u3001\u7B54\u3048\u5408\u308F\u305B\u3092\u3057\u307E\u3057\u3087\u3046\u3002</p>${pendNote}<div class="btns"><button class="primary" data-a="go">${names.split("\u30FB")[0]} \u3078</button></div>`);
          $2("sheet").querySelector("[data-a=go]").onclick = goUn;
          return;
        }
        if (test) {
          if (un.length) {
            const go = await new Promise((ok) => {
              sheet(`<h2>\u672A\u56DE\u7B54\u306E\u554F\u984C\u304C\u3042\u308A\u307E\u3059</h2><p class="note"><b>${names}</b> \u304C\u672A\u56DE\u7B54\u3067\u3059\u3002<br>\u672A\u56DE\u7B54\u306E\u554F\u984C\u306F\u70B9\u6570\u304C\u5165\u308A\u307E\u305B\u3093\u3002\u672C\u5F53\u306B\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F</p>${pendNote}
            <div class="btns"><button class="primary" data-a="go">\u672A\u56DE\u7B54\u306E\u554F\u984C\u3078</button><button class="ghost" data-a="force">\u305D\u308C\u3067\u3082\u63D0\u51FA\u3059\u308B</button></div>`);
              $2("sheet").querySelector("[data-a=go]").onclick = () => ok(false);
              $2("sheet").querySelector("[data-a=force]").onclick = () => ok(true);
            });
            if (!go) {
              goUn();
              return;
            }
            if (!await ask(`\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u307E\u3059\u3002
${names} \u306F0\u70B9\u306B\u306A\u308A\u307E\u3059\u3002\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F`, "\u63D0\u51FA\u3059\u308B")) return;
          } else if (!await ask("\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F\n\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002", "\u63D0\u51FA\u3059\u308B")) return;
          const sm = summary(), cost = RD.hintCost;
          const score = sm.reduce((a, x) => a + Math.max(0, Math.round(x.pts * { o: 1, t: 0.4, x: 0 }[x.mark]) - (x.hint ? cost : 0)), 0), max = sm.reduce((a, x) => a + x.pts, 0);
          opts.onSubmit && opts.onSubmit({ answers: sm, score, max });
          sheet('<h2>\u63D0\u51FA\u3057\u307E\u3057\u305F</h2><p class="note">\u7B54\u3048\u306F\u5148\u751F\u304C\u78BA\u8A8D\u3057\u307E\u3059\u3002</p><div class="btns"><button class="primary" data-a="back">\u3082\u3069\u308B</button></div>', false);
          $2("sheet").querySelector("[data-a=back]").onclick = () => close();
          return;
        }
        const res = qs.map(judge), pts = res.reduce((a, r, i) => a + Math.round((qs[i].pts || 100) * { o: 1, t: 0.4, x: 0 }[r]), 0);
        beep(res.every((r) => r === "o") ? "excellent" : "great");
        core2.events.report("reader", "grade", { title: story.title, n: qs.length, o: res.filter((r) => r === "o").length, hints: RD.hints });
        const extra = opts.onGrade ? opts.onGrade({ res, pts, hints: RD.hints, n: qs.length }) : "";
        const MK = { o: ["\u25EF", "k-excellent"], t: ["\u25B3", "k-good"], x: ["\xD7", "k-miss"] };
        sheet(`<h2>\u7B54\u3048\u5408\u308F\u305B</h2>
        <div class="big">${Math.max(0, pts)} pt <span style="font-size:14px;color:var(--muted)">\u25EF${res.filter((r) => r === "o").length}\uFF0F${qs.length}\u554F\u3000\u30D2\u30F3\u30C8\u4F7F\u7528${RD.hints}\u554F</span></div>
        ${extra ? `<p class="note" style="color:var(--accent);font-weight:800">${esc(extra)}</p>` : ""}
        ${qs.map((q, i) => {
          const r = res[i];
          if (q.type === "choice") return `<div class="rvw"><span class="lab">Q${i + 1}. ${esc(q.q)}</span><div class="en"><span class="mk ${MK[r][1]}">${MK[r][0]}</span>\u3042\u306A\u305F\uFF1A${q.ans ? esc(q.options[q.ans.choice]) : "\uFF08\u672A\u56DE\u7B54\uFF09"}</div><div class="en">\u7B54\u3048\uFF1A${esc(q.options[q.correct] || "")}</div></div>`;
          const sn = sens[q.si], g = gradeRange(sn, q, q.ans);
          return `<div class="rvw"><span class="lab">Q${i + 1}. ${esc(q.q)}</span><div class="en"><span class="mk ${MK[g.mark][1]}">${MK[g.mark][0]}</span>${g.why ? `<small class="why">${esc(g.why)}</small>` : ""}</div>
            <div class="en">${spanHTML(sn, q, q.ans)}</div><small class="legendSp"><span class="spE">\u60F3\u5B9A\u3057\u305F\u7B54\u3048</span>\u3000<span class="spM">\u3042\u306A\u305F\u306E\u9078\u629E</span></small><div class="ja">${esc(sn.ja)}</div></div>`;
        }).join("")}
        <div class="rvAll"><div class="rvAllHead"><b>\u5168\u6587\u3092\u805E\u304F</b><button class="primary" data-a="rvPlay">\u25B6 \u6700\u521D\u304B\u3089</button></div><small class="note">\u6587\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u305D\u3053\u304B\u3089\u4E0B\u3092\u8AAD\u307F\u307E\u3059\u3002</small>
          ${sens.map((sn, i) => `<div class="rvSen" data-i="${i}"><div class="en">${esc(sn.en)}</div><div class="ja">${esc(sn.ja)}</div></div>`).join("")}</div>
        <div class="btns"><button class="ghost" data-a="back">${esc(opts.backLabel || "\u3082\u3069\u308B")}</button><button class="ghost" data-a="again">\u3082\u3046\u4E00\u5EA6</button>${opts.next ? `<button class="primary" data-a="next">${esc(opts.next.label)}</button>` : ""}</div>`, false);
        const B = (a) => $2("sheet").querySelector(`[data-a=${a}]`);
        RV.i = 0;
        RV.on = false;
        RV.tok++;
        rvUI();
        B("rvPlay").onclick = () => {
          if (RV.on) {
            rvStop();
            rvUI();
          } else rvSpeak();
        };
        $2("sheet").querySelectorAll(".rvSen").forEach((el) => el.onclick = () => {
          RV.i = +el.dataset.i;
          RV.tok++;
          rvSpeak();
        });
        B("back").onclick = () => close();
        B("again").onclick = () => {
          rvStop();
          closeSheet();
          open(story, opts);
        };
        if (B("next")) B("next").onclick = () => {
          rvStop();
          close(true);
          opts.next.fn();
        };
      }
      const gest = $2("gest");
      let d = null;
      $2("set").onclick = settingsUI;
      $2("lines").onclick = () => {
        S.lines = S.lines >= 3 ? 1 : S.lines + 1;
        save2();
        render(true);
      };
      $2("seg").querySelectorAll("button").forEach((b) => b.onclick = () => {
        S.view = b.dataset.v;
        save2();
        RD.view = b.dataset.v;
        RD.sel = null;
        RD.start = null;
        RD.info = null;
        RD.hintOn = false;
        render(true);
      });
      $2("gram").onclick = () => {
        RD.gramOn = !RD.gramOn;
        RD.info = null;
        render(true);
      };
      $2("jaBtn").onclick = () => {
        RD.showJa = !RD.showJa;
        RD.fullOpen = false;
        render(true);
      };
      gest.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button,.rdInfo")) return;
        const onBar = e.target.dataset.k === "bar";
        if (!onBar) {
          e.preventDefault();
          try {
            gest.setPointerCapture(e.pointerId);
          } catch (_) {
          }
        }
        const w = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains("w") && root.contains(x));
        d = { onBar, onLane: !onBar, wi: w ? [...$2("strip").querySelectorAll(".w")].indexOf(w) : -1, x: e.clientX, y: e.clientY, g0: RD.gpos[RD.p], moved: false, axis: null };
      });
      gest.addEventListener("pointermove", (e) => {
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.axis && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) d.axis = Math.abs(dy) >= Math.abs(dx) * 2 ? "y" : "x";
        if (d.axis === "x" && !d.onBar) {
          d.moved = true;
          const target = d.g0 + dx;
          let best = 0;
          RD.gpos.forEach((g, i) => {
            if (Math.abs(g - target) < Math.abs(RD.gpos[best] - target)) best = i;
          });
          move(best, true);
        }
        if (d.axis === "y") {
          d.moved = true;
          if (!d.done && Math.abs(dy) >= 20) {
            d.done = true;
            sentence(dy < 0 ? 1 : -1);
            $2("senNum").animate([{ color: "var(--accent)", transform: "scale(1.25)" }, { color: "var(--muted)", transform: "none" }], { duration: 500 });
          }
        }
      });
      const end = (e) => {
        if (!d) return;
        if (!d.moved && e.type === "pointerup" && d.onLane) {
          if (view() === "read") infoTap(d.wi);
          else cut();
        }
        d = null;
      };
      gest.addEventListener("pointerup", end);
      gest.addEventListener("pointercancel", end);
      $2("bar").addEventListener("input", (e) => move(+e.target.value, true));
      $2("say").onclick = say2;
      $2("up").onclick = () => sentence(-1);
      $2("down").onclick = () => sentence(1);
      $2("qPrev").onclick = () => goQ(RD.qi - 1, -1);
      $2("qNext").onclick = () => goQ(RD.qi + 1, 1);
      {
        const box = $2("q").parentElement;
        let dd = null;
        box.addEventListener("pointerdown", (e) => {
          dd = { x: e.clientX, y: e.clientY, done: false };
        });
        box.addEventListener("pointermove", (e) => {
          if (!dd || dd.done) return;
          const dx = e.clientX - dd.x, dy = e.clientY - dd.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            dd.done = true;
            dx < 0 ? goQ(RD.qi + 1, 1) : goQ(RD.qi - 1, -1);
          }
        });
        ["pointerup", "pointercancel"].forEach((ev) => box.addEventListener(ev, () => {
          dd = null;
        }));
      }
      $2("back").textContent = opts.backLabel || "\u2190 \u3082\u3069\u308B";
      $2("back").onclick = () => close();
      $2("fontM").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i > 0) {
          S.font = FK[i - 1];
          save2();
          applyFont();
          render(true);
        }
      };
      $2("fontP").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i < FK.length - 1) {
          S.font = FK[i + 1];
          save2();
          applyFont();
          render(true);
        }
      };
      $2("hint").onclick = () => {
        if (RD.hintOn) {
          RD.hintOn = false;
          render(true);
          return;
        }
        const q = qs[RD.qi];
        if (q && q.type === "choice" && RD.hintPolicy !== "grammar") {
          toast2("\u3053\u306E\u554F\u984C\u3067\u306F\u3001\u30D2\u30F3\u30C8\u306F\u4F7F\u3048\u307E\u305B\u3093");
          return;
        }
        RD.hintOn = RD.hintPolicy === "grammar";
        if (!RD.hintQ.has(RD.qi)) {
          RD.hintQ.add(RD.qi);
          RD.hints++;
        }
        render(true);
      };
      $2("check").onclick = grade;
      $2("title").textContent = `${opts.label ? opts.label + "\uFF5C" : test ? "TEST\uFF5C" : ""}${story.title || ""}${story.level && !opts.label ? `\uFF08Lv${story.level}\uFF09` : ""}`;
      function close(silent) {
        if (!cur || cur.root !== root) return;
        cur = null;
        RV.tok++;
        core2.speech.stop();
        ro.disconnect();
        root.remove();
        if (!silent && opts.onClose) opts.onClose();
      }
      cur = { root, close };
      applyFont();
      ro.observe($2("lane"));
      render(true);
      core2.events.report("reader", "open", { title: story.title });
      return { close: () => close(true) };
    }
    return { open, close: () => cur && cur.close(true), get isOpen() {
      return !!cur;
    } };
  }

  // core/index.js
  function createCore(config) {
    const base = config.base || "./";
    const core2 = { config, base };
    core2.settings = createSettings(config.theme);
    core2.speech = createSpeech(core2.settings);
    core2.sound = createSound(core2.settings);
    core2.rights = createRights(config.grants || []);
    core2.events = createEvents();
    core2.profile = createProfile(core2.events, base);
    core2.ui = createUI(core2);
    core2.dict = createDict(base);
    core2.reader = createReader(core2);
    const layer = document.createElement("div");
    layer.className = "cs-layer";
    layer.hidden = true;
    const back = document.createElement("button");
    back.className = "cs-back";
    back.hidden = true;
    back.textContent = config.backLabel || "\u2190 \u3082\u3069\u308B";
    document.body.append(layer, back);
    core2.host = createHost(core2, layer, back);
    return core2;
  }

  // games/stream/src/stream.html
  var stream_default = '<div class="bgflow"></div>\n<div class="rotate"><div class="ph"></div><b>\u6A2A\u5411\u304D\u306B\u3057\u3066\u306D</b><span>\u30C1\u30E3\u30F3\u30AF\u30B9\u30C8\u30EA\u30FC\u30E0\u306F\u6A2A\u753B\u9762\u3067\u904A\u3076\u30B2\u30FC\u30E0\u3067\u3059</span></div>\n<div class="app" id="app">\n\n<section class="scr" id="sTitle">\n  <div class="l">\n    <div class="logo"><div class="k">CHUNK STREAM</div><h1>\u30C1\u30E3\u30F3\u30AF<span>\u30B9\u30C8\u30EA\u30FC\u30E0</span></h1></div>\n    <div class="tagline">\u82F1\u8A9E\u306E\u9577\u6587\u304C\u3001\u53F3\u304B\u3089\u6D41\u308C\u3066\u304F\u308B\u3002\u805E\u3044\u3066\u3001\u9078\u3093\u3067\u3001\u3064\u306A\u3052\u308B\u3002</div>\n    <div class="river" aria-hidden="true">\n      <div class="row" style="top:8px;animation-duration:30s" id="rv1"></div>\n      <div class="row" style="top:52px;animation-duration:36s" id="rv2"></div>\n    </div>\n  </div>\n  <div class="r">\n    <img class="hero-chara" id="heroChara" alt="" src="img/chara/girl/joy.webp">\n    <button class="btn-main" id="btnStart">\u306F\u3058\u3081\u308B</button>\n    <button class="read-btn" id="btnHowT" style="margin-top:10px">\u2753 \u904A\u3073\u65B9</button>\n    <div class="small">\u5358\u8A9E \u2192 \u30C1\u30E3\u30F3\u30AF \u2192 \u7A74\u3046\u3081 \u2192 \u9577\u6587\u5B8C\u6210</div>\n  </div>\n</section>\n\n<section class="scr" id="sHome" hidden>\n  <div class="bar">\n    <h2>\u9577\u6587\u3092\u3048\u3089\u3076</h2>\n    <div class="tabs" id="tabs"></div>\n    <button class="icon-btn" id="btnFull" aria-label="\u5168\u753B\u9762"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>\n    <button class="icon-btn" id="btnSettings" aria-label="\u8A2D\u5B9A"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg></button>\n  </div>\n  <div class="list" id="plist"></div>\n</section>\n\n<section class="scr" id="sWords" hidden>\n  <div class="bar"><button class="icon-btn" data-back="home" aria-label="\u623B\u308B"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><h2 id="wTitle">\u5358\u8A9E\u7DF4\u7FD2</h2></div>\n  <div class="wtabs" id="wtabs"></div>\n  <p class="wnote" id="wNote"></p>\n  <div class="wtools" id="wtools"></div>\n  <div class="wsets" id="wsets"></div>\n</section>\n<section class="scr" id="sDetail" hidden>\n  <div class="bar">\n    <button class="icon-btn" data-back="home" aria-label="\u623B\u308B"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>\n    <h2 id="dTag"></h2>\n    <div class="modes"><button class="mode on">\u30BF\u30A4\u30E0\u30A2\u30BF\u30C3\u30AF</button><button class="mode soon" id="modeRh">\u30EA\u30BA\u30E0\uFF08\u6E96\u5099\u4E2D\uFF09</button></div>\n  </div>\n  <div class="dwrap">\n    <div class="dleft">\n      <div class="t" id="dTitle"></div><div class="j" id="dJa"></div>\n      <div class="runbest" id="dRun"></div>\n      <button class="read-btn" id="btnRead">\u{1F4D6} \u4E88\u7FD2\uFF1A\u672C\u6587\u3092\u8AAD\u3080</button>\n      <button class="read-btn" id="btnHow">\u2753 \u904A\u3073\u65B9</button>\n      <button class="btn-run" id="btnRun">\u901A\u3057\u3067\u30B9\u30BF\u30FC\u30C8<small>\u5358\u8A9E \u2192 \u30C1\u30E3\u30F3\u30AF \u2192 \u7A74\u3046\u3081 \u2192 \u9577\u6587\u5B8C\u6210</small></button>\n    </div>\n    <div class="stages" id="stages"></div>\n  </div>\n</section>\n\n<section class="scr" id="sReader" hidden>\n  <div class="bar">\n    <button class="icon-btn" data-back="detail" aria-label="\u623B\u308B"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>\n    <h2 id="rTitle"></h2>\n    <button class="chip on" id="btnJp">\u8A33</button>\n    <button class="chip" id="btnReadAll">\u25B6 \u5168\u6587</button>\n  </div>\n  <div class="reader" id="reader"></div>\n</section>\n\n<section class="scr" id="sPlay" hidden>\n  <div class="hbar">\n    <button class="icon-btn sm" id="btnPause" aria-label="\u4E00\u6642\u505C\u6B62"><svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg></button>\n    <div class="stno">STAGE <b id="hudNo">1</b></div><div class="stnm" id="hudName"></div>\n    <div class="hprog"><i id="hudProg"></i></div><div class="cnt" id="hudCount"></div>\n    <div class="tm" id="hudTime">0.0</div><div class="cmb" id="hudCombo"></div>\n  </div>\n  <div class="arena" id="arena">\n    <div class="sp"></div>\n    <div class="band">\n      <div class="side" id="side"><div class="grid up" id="g0"></div><div class="grid dn" id="g1"></div><button class="rep" id="rep" aria-label="\u3082\u3046\u4E00\u5EA6\u805E\u304F" hidden>\u{1F50A}</button></div>\n      <div class="field" id="field"><div class="flow"></div><div class="dz"></div><div class="zone" id="zone"></div><div class="seam" id="seam"></div><div id="layer"></div><div class="fx" id="fx"></div></div>\n    </div>\n    <div class="txt" id="txt"><div class="para" id="para"></div></div>\n  </div>\n</section>\n\n<section class="scr" id="sResult" hidden>\n  <div class="res-l">\n    <div class="res-top">\n      <div class="rank" id="resRank">S</div>\n      <div><div class="lab" id="resLab"></div><div class="tt" id="resTitle"></div><div class="tot" id="resTot"></div></div>\n      <img class="res-chara" id="resChara" alt="" src="img/chara/girl/joy.webp">\n    </div>\n    <div class="stt" id="resStages"></div>\n    <div class="res-btns" id="resBtns"></div>\n  </div>\n  <div class="res-r"><div class="review" id="review"></div></div>\n</section>\n\n<div class="ov" id="ov" hidden><div id="ovBody"></div></div>\n</div>\n';

  // games/stream/src/base.js
  var $ = (id) => document.getElementById(id);
  var ENV = { root: null, ctx: null, core: null, base: "", offs: [] };
  var TIMERS = { to: /* @__PURE__ */ new Set(), iv: /* @__PURE__ */ new Set() };
  var setTimeout2 = (f, t) => {
    const i = window.setTimeout(() => {
      TIMERS.to.delete(i);
      f();
    }, t);
    TIMERS.to.add(i);
    return i;
  };
  var setInterval2 = (f, t) => {
    const i = window.setInterval(f, t);
    TIMERS.iv.add(i);
    return i;
  };
  var addEventListener2 = (t, f, o) => {
    window.addEventListener(t, f, o);
    ENV.offs.push(() => window.removeEventListener(t, f, o));
  };
  var onDoc = (t, f, o) => {
    document.addEventListener(t, f, o);
    ENV.offs.push(() => document.removeEventListener(t, f, o));
  };
  function stopAll() {
    TIMERS.to.forEach((i) => window.clearTimeout(i));
    TIMERS.iv.forEach((i) => window.clearInterval(i));
    TIMERS.to.clear();
    TIMERS.iv.clear();
    ENV.offs.forEach((f) => f());
    ENV.offs = [];
  }
  var LS = { getItem: (k) => {
    const v = ENV.ctx.store.get(k);
    return v == null ? null : v;
  }, setItem: (k, v) => ENV.ctx.store.set(k, v) };
  var sfxOn = () => ENV.core.settings.get("sfx") > 0;
  var bgmOn = () => ENV.core.settings.get("bgm") > 0;
  var rnd = (n) => Math.floor(Math.random() * n);
  var shuf = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  var esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  var LV = [null, { name: "\u521D\u7D1A", sub: "\u9AD8\u6821\u53D7\u9A13", col: "var(--lv1)" }, { name: "\u4E2D\u7D1A", sub: "\u5171\u901A\u30C6\u30B9\u30C8", col: "var(--lv2)" }, { name: "\u4E0A\u7D1A", sub: "\u96E3\u95A2\u5927", col: "var(--lv3)" }];
  var STAGES = [
    { id: 1, name: "\u5358\u8A9E\u30C0\u30C3\u30B7\u30E5", desc: "\u805E\u3053\u3048\u305F\u5358\u8A9E\u306E\u610F\u5473\u3092\u9078\u3076\u3002\u4E0A\u306F\u4E0A\u306E4\u629E\u3001\u4E0B\u306F\u4E0B\u306E4\u629E", note: "\u8AAD\u307F\u4E0A\u3052\u3092\u805E\u3044\u3066\u3001\u610F\u5473\u3092\u30BF\u30C3\u30D7\uFF01 \u4E0A\u4E0B\u3069\u3061\u3089\u304B\u3089\u3067\u3082OK" },
    { id: 2, name: "\u30C1\u30E3\u30F3\u30AF\u30AD\u30E3\u30C3\u30C1", desc: "\u805E\u3053\u3048\u305F\u30C1\u30E3\u30F3\u30AF\uFF08\u610F\u5473\u306E\u304B\u305F\u307E\u308A\uFF09\u306E\u610F\u5473\u3092\u9078\u3076", note: "\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u5473\u3092\u30BF\u30C3\u30D7\uFF01" },
    { id: 3, name: "\u30C1\u30E3\u30F3\u30AF\u30D1\u30BA\u30EB", desc: "\u4E0A\u306E\u65E5\u672C\u8A9E\u306B\u5408\u3046\u3088\u3046\u306B\u3001\u6B20\u3051\u305F1\u8A9E\u3092\u57CB\u3081\u308B", note: "\u65E5\u672C\u8A9E\u306B\u5408\u30461\u8A9E\u3067\u7A74\u3092\u57CB\u3081\u3088\u3046" },
    { id: 4, name: "\u30ED\u30F3\u30B0\u30B9\u30C8\u30EA\u30FC\u30E0", desc: "\u30C1\u30E3\u30F3\u30AF\u3092\u9806\u756A\u306B\u3064\u306A\u3044\u3067\u9577\u6587\u3092\u5B8C\u6210\u3055\u305B\u308B", note: "\u9806\u756A\u306B\u3064\u306A\u3044\u3067\u9577\u6587\u3092\u5B8C\u6210\uFF01 \u5149\u3063\u3066\u3044\u308B\u5074\u306E4\u629E\u3067\u7B54\u3048\u3088\u3046" }
  ];
  var POSJ = { n: "\u540D", v: "\u52D5", a: "\u5F62", r: "\u526F", ph: "\u719F", pp: "\u524D", cj: "\u63A5", pn: "\u4EE3", ij: "\u9593" };
  var SKEY = "chunkstream.v1";
  var SV = { best: {}, seen: {}, set: { nav: "girl", voice: 1, rate: 1, se: 1, bgm: 1, jp4: 1 }, mode: "ta", lv: 1 };
  function loadSave() {
    try {
      const s = JSON.parse(LS.getItem(SKEY) || "null");
      if (s) {
        SV = { ...SV, ...s, set: { ...SV.set, ...s.set || {} } };
      }
    } catch (e) {
    }
  }
  function save() {
    try {
      LS.setItem(SKEY, JSON.stringify(SV));
    } catch (e) {
    }
  }
  function rec(pid, st, mode) {
    return ((SV.best[pid] || {})[st] || {})[mode] || null;
  }
  function starsOf(pid, st) {
    const a = rec(pid, st, "ta"), b = rec(pid, st, "rh");
    return Math.max(a ? a.stars : 0, b ? b.stars : 0);
  }
  var chara = (f) => `${ENV.base}img/chara/${SV.set.nav}/${f}.webp`;

  // games/stream/src/sound.js
  var AC = null;
  var SEG;
  var BGG;
  var VOG;
  function ac() {
    if (!AC) {
      try {
        const cs = ENV.core.sound;
        AC = cs.ctx();
        SEG = AC.createGain();
        SEG.gain.value = 0.9;
        SEG.connect(cs.sfxBus);
        BGG = AC.createGain();
        BGG.gain.value = 0.55;
        BGG.connect(cs.bgmBus);
        VOG = AC.createGain();
        VOG.gain.value = 0.5;
        VOG.connect(cs.sfxBus);
        loadVoices();
      } catch (e) {
        AC = null;
      }
    }
    if (AC && AC.state === "suspended" && !PAUSED) AC.resume();
    return AC;
  }
  function tone(f, d, type, vol, when, f2, dest) {
    if (!AC) return;
    const t = when || AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 5e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, t + d);
    o.connect(g).connect(dest || SEG);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  var NOISE = null;
  function noiseBuf() {
    if (!NOISE) {
      NOISE = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
      const d = NOISE.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return NOISE;
  }
  function noise(d, vol, ff, ft, when, dest) {
    if (!AC) return;
    const t = when || AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf();
    f.type = ft || "highpass";
    f.frequency.value = ff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + d);
    s.connect(f).connect(g).connect(dest || SEG);
    s.start(t);
    s.stop(t + d + 0.02);
  }
  var SE = {
    tap() {
      tone(880, 0.05, "triangle", 0.08);
    },
    ok(c) {
      if (!sfxOn()) return;
      const b = 660 * Math.pow(2, Math.min(c, 14) / 24);
      tone(b, 0.09, "triangle", 0.16);
      tone(b * 1.5, 0.16, "sine", 0.12, AC.currentTime + 0.05);
    },
    ng() {
      if (!sfxOn()) return;
      tone(170, 0.18, "square", 0.07, 0, 110);
      tone(120, 0.2, "sawtooth", 0.04);
    },
    miss() {
      if (!sfxOn()) return;
      tone(400, 0.25, "triangle", 0.1, 0, 180);
    },
    merge() {
      if (!sfxOn()) return;
      noise(0.18, 0.08, 2400, "bandpass");
      tone(1320, 0.18, "sine", 0.06, AC.currentTime + 0.03);
    },
    count(h) {
      if (!sfxOn()) return;
      tone(h ? 1046 : 523, h ? 0.35 : 0.12, "triangle", 0.16);
    },
    clear() {
      if (!sfxOn()) return;
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, "triangle", 0.14, AC.currentTime + i * 0.08));
    },
    star(i) {
      if (!sfxOn()) return;
      tone(988 * Math.pow(1.19, i), 0.22, "sine", 0.14);
    }
  };
  var VO = {};
  var VOLIST = ["nice", "good", "excellent", "perfect", "combo", "stage_clear", "try_again", "wow", "yes"];
  function loadVoices() {
    VOLIST.forEach((n) => {
      fetch(`${ENV.base}audio/voice/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => AC.decodeAudioData(b)).then((buf) => VO[n] = buf).catch(() => {
      });
    });
  }
  function voice(n) {
    if (!AC || !sfxOn() || !VO[n]) return;
    const s = AC.createBufferSource();
    s.buffer = VO[n];
    s.connect(VOG);
    s.start();
  }
  var BGM = { on: false, bpm: 120, t0: 0, step: 0, next: 0, timer: 0, style: "game", bar: 0 };
  var PROG = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  var mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function bgmStart(bpm, style, at) {
    if (!ac()) return;
    bgmStop();
    BGM.on = true;
    BGM.bpm = bpm;
    BGM.style = style;
    BGM.t0 = at || AC.currentTime + 0.05;
    BGM.next = BGM.t0;
    BGM.step = 0;
    BGG.gain.cancelScheduledValues(AC.currentTime);
    BGG.gain.setValueAtTime(bgmOn() ? style === "menu" ? 0.35 : 0.5 : 0, AC.currentTime);
    BGM.timer = setInterval2(bgmTick, 25);
    bgmTick();
  }
  function bgmStop() {
    BGM.on = false;
    clearInterval(BGM.timer);
  }
  function bgmTick() {
    if (!BGM.on || !AC) return;
    const sd = 60 / BGM.bpm / 4;
    while (BGM.next < AC.currentTime + 0.15) {
      bgmStep(BGM.step, BGM.next);
      BGM.next += sd;
      BGM.step++;
    }
  }
  function bgmStep(s, t) {
    const st = s % 16, bar = Math.floor(s / 16) % 4, ch = PROG[bar], root = 48 + ch[0], menu = BGM.style === "menu";
    if (menu) {
      if (st === 0) ch.forEach((n) => tone(mtof(60 + n), 3.2, "sine", 0.035, t, 0, BGG));
      if (st % 4 === 2) tone(mtof(72 + ch[(st / 4 | 0) % 3]), 0.5, "triangle", 0.045, t, 0, BGG);
      if (st === 0) tone(mtof(root - 12), 1.4, "triangle", 0.07, t, 0, BGG);
      return;
    }
    if (st % 4 === 0) {
      tone(120, 0.16, "sine", 0.5, t, 45, BGG);
    }
    if (st === 4 || st === 12) noise(0.13, 0.22, 1600, "bandpass", t, BGG);
    if (st % 2 === 1) noise(0.03, st % 4 === 3 ? 0.09 : 0.05, 7e3, "highpass", t, BGG);
    if (st % 2 === 0) tone(mtof(root + (st % 8 === 6 ? 12 : 0)), 0.16, "triangle", 0.17, t, 0, BGG);
    const arp = [0, 1, 2, 1][st % 4];
    tone(mtof(72 + ch[arp] + (st >= 8 && bar % 2 ? 12 : 0)), 0.11, "square", 0.022, t, 0, BGG);
    if (st === 0) ch.forEach((n) => tone(mtof(60 + n), 1.6, "sawtooth", 0.012, t, 0, BGG));
  }
  function bgmDuck(on) {
    if (!AC || !BGM.on || !bgmOn()) return;
    BGG.gain.setTargetAtTime(on ? 0.22 : BGM.style === "menu" ? 0.35 : 0.5, AC.currentTime, 0.08);
  }
  var TTS = { id: 0, pend: null, busy: false, kind: "", wd: 0 };
  function speak(text, cb, kind) {
    const id = ++TTS.id;
    clearTimeout(TTS.wd);
    TTS.pend = null;
    TTS.busy = true;
    TTS.kind = kind || "";
    const sp = ENV.core.speech, vOn = ENV.core.settings.get("voice"), rate = ENV.core.settings.get("rate") || 1, est = (500 + text.split(/\s+/).length * 380) / rate;
    let fin = false;
    const t0 = performance.now();
    const done = (late) => {
      if (fin) return;
      const el = performance.now() - t0;
      if (!late && el < est * 0.55) {
        fin = true;
        setTimeout2(() => {
          fin = false;
          done(true);
        }, est * 0.55 - el);
        return;
      }
      fin = true;
      if (id !== TTS.id) return;
      clearTimeout(TTS.wd);
      TTS.busy = false;
      bgmDuck(false);
      cb && cb();
      if (TTS.pend && id === TTS.id) {
        const p = TTS.pend;
        TTS.pend = null;
        speak(p, null, "post");
      }
    };
    if (!vOn || !window.speechSynthesis) {
      TTS.wd = setTimeout2(() => done(true), vOn ? est : 200);
      return;
    }
    bgmDuck(true);
    sp.speak(text, { onend: () => done() });
    TTS.wd = setTimeout2(() => done(true), est * 1.8 + 1500);
  }
  function speakAfter(text) {
    if (TTS.busy && TTS.kind === "post") {
      TTS.pend = text;
      return;
    }
    speak(text, null, "post");
  }
  function hush() {
    TTS.id++;
    TTS.pend = null;
    clearTimeout(TTS.wd);
    TTS.busy = false;
    ENV.core.speech.stop();
    bgmDuck(false);
  }
  function say(t) {
    speak(t, null, "ui");
  }

  // games/stream/src/fx.js
  function faceSVG(k) {
    const O = "#4a3436", E = `<ellipse cx="27" cy="31" rx="3.2" ry="4.2" fill="${O}"/><ellipse cx="45" cy="31" rx="3.2" ry="4.2" fill="${O}"/>`;
    const eyes = {
      N: E,
      S: E,
      O: `<ellipse cx="27" cy="30" rx="3.6" ry="4.8" fill="${O}"/><ellipse cx="45" cy="30" rx="3.6" ry="4.8" fill="${O}"/>`,
      J: `<path d="M23 32q4-5.5 8 0M41 32q4-5.5 8 0" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/>`,
      D: `<path d="M24 27l6 7M30 27l-6 7M42 27l6 7M48 27l-6 7" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`
    }[k];
    const wavy = `<path d="M30 41q3-3 6 0t6 0" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`;
    const mouth = {
      N: `<path d="M31.5 37.5q4.5 8 9 0z" fill="#e8737a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>`,
      J: `<path d="M30 36.5q6 10 12 0z" fill="#e8737a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>`,
      D: wavy,
      S: wavy,
      O: `<ellipse cx="36" cy="41" rx="3.6" ry="4.4" fill="#e8737a" stroke="${O}" stroke-width="1.8"/>`
    }[k];
    const ex = k === "S" ? `<path d="M57 10q4.5 6.5 0 10q-4.5-3.5 0-10z" fill="#9fd4ff" stroke="${O}" stroke-width="1.2"/>` : k === "J" ? `<path d="M15 7l2 5M23 2v6M8 13l5 3" stroke="#ffd166" stroke-width="2.4" stroke-linecap="round"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="#f5f6fc"/><stop offset="1" stop-color="#e3e8f8"/></linearGradient></defs><ellipse cx="7" cy="27" rx="5" ry="7" transform="rotate(-28 7 27)" fill="${O}"/><ellipse cx="27" cy="55.5" rx="6" ry="4" fill="${O}"/><rect x="9" y="8" width="52" height="46" rx="22" fill="url(#g)" stroke="${O}" stroke-width="2.6"/><ellipse cx="21" cy="40" rx="5.5" ry="3.6" fill="#f4aaa2" opacity=".85"/><ellipse cx="51" cy="40" rx="5.5" ry="3.6" fill="#f4aaa2" opacity=".85"/>${eyes}${mouth}${ex}</svg>`;
  }
  var FWC = ["#ffd166", "#7cc4ff", "#ff8fab", "#8ef0c5", "#ffb23e", "#ffffff", "#c3a6ff"];
  function fireworks(host, x, y, n, spread) {
    const b = document.createElement("div");
    b.className = "fw";
    b.style.left = x + "px";
    b.style.top = y + "px";
    let h = "<b></b>";
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283 + Math.random() * 0.3, r = spread * (0.55 + Math.random() * 0.5), c = FWC[(k + rnd(3)) % FWC.length];
      h += `<i class="${k % 3 ? "" : "st"}" style="--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r).toFixed(0)}px;--c:${c};--t:${(0.7 + Math.random() * 0.35).toFixed(2)}s"></i>`;
    }
    b.innerHTML = h;
    host.appendChild(b);
    setTimeout2(() => b.remove(), 1250);
  }
  function crowd() {
    let c = $("crowd");
    if (!c) {
      c = document.createElement("div");
      c.id = "crowd";
      c.className = "crowd";
      $("txt").appendChild(c);
    }
    return c;
  }
  function mkMini(lane, segs, joy) {
    const m = document.createElement("i");
    m.className = "mk l" + lane + (joy ? " j" : "");
    m.style.setProperty("--d", (Math.random() * 1.6).toFixed(2) + "s");
    m.innerHTML = '<b class="h"></b>' + "<s></s>".repeat(Math.max(1, Math.min(4, segs)));
    return m;
  }
  function segsOf(it) {
    return it.kind === 1 ? 1 : it.ci != null && G && G.p.chunks[it.ci] ? G.p.chunks[it.ci].tk.length : Math.max(1, String(it.en || "").split(/\s+/).length);
  }
  var BK = { S: 1, last: 0 };
  function bigK() {
    const c = crowd();
    let k = c.querySelector(".mk.big");
    if (!k) {
      k = document.createElement("i");
      k.className = "mk big pop";
      k.innerHTML = '<b class="h"></b>';
      c.appendChild(k);
      setTimeout2(() => k.classList.remove("pop"), 420);
      bkApply(k);
    }
    return k;
  }
  function bkApply(k) {
    k = k || bigK();
    const c = crowd(), max = Math.max(2, Math.min(4.2, (c.clientHeight - 10) / 31));
    k.style.setProperty("--sc", (1.6 + (max - 1.6) * (BK.S - 1) / 2).toFixed(2));
  }
  function bkGrow() {
    const now = performance.now(), dt = (now - BK.last) / 1e3;
    BK.last = now;
    BK.S = Math.min(3, BK.S + (dt < 1.6 ? 0.42 : dt < 3 ? 0.3 : 0.18));
    const k = bigK();
    k.classList.remove("sad");
    k.classList.add("j");
    clearTimeout(BK.t);
    BK.t = setTimeout2(() => k.classList.remove("j"), 700);
    bkApply(k);
    if (BK.S >= 3) bkBurst(false);
  }
  function bkShrink(v) {
    if (!$("crowd")) return;
    BK.S = Math.max(1, BK.S - v);
    const k = bigK();
    k.classList.add("sad");
    setTimeout2(() => k.classList.remove("sad"), 800);
    bkApply(k);
  }
  function joinCrowd(it, el, segs) {
    const k = bigK(), f = mkMini(it.lane || 0, 0, true);
    f.innerHTML = '<b class="h"></b>';
    f.classList.add("mkfly");
    ENV.root.appendChild(f);
    const a = el.getBoundingClientRect(), b = k.getBoundingClientRect();
    const sx = a.left - 12, sy = a.top + a.height / 2 - 16, tx = b.left + b.width / 2 - 16, ty = b.top + b.height / 2 - 15, mx = (sx + tx) / 2, my = Math.min(sy, ty) - 60;
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });
    setTimeout2(() => el.remove(), 170);
    f.animate([{ transform: `translate(${sx}px,${sy}px) scale(1.2)` }, { transform: `translate(${mx}px,${my}px) scale(1)`, offset: 0.45 }, { transform: `translate(${tx}px,${ty}px) scale(.5)`, opacity: 0.5 }], { duration: 480, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => {
      f.remove();
      if (k.isConnected) bkGrow();
    };
  }
  var BPAT = ["ring", "double", "spiral", "fountain", "heart"];
  function fwLayer() {
    let l = document.querySelector(".fwl");
    if (!l) {
      l = document.createElement("div");
      l.className = "fwl";
      ENV.root.appendChild(l);
    }
    return l;
  }
  function burstMinis(cx, cy, big) {
    const pat = BPAT[rnd(BPAT.length)], n = pat === "double" ? 24 : pat === "heart" ? 22 : 18, R = Math.min(innerWidth, innerHeight) * (big ? 0.36 : 0.28);
    for (let i = 0; i < n; i++) {
      let x, y, delay = 0, fall = 36;
      if (pat === "ring") {
        const a = i / n * 6.283;
        x = Math.cos(a) * R;
        y = Math.sin(a) * R;
      } else if (pat === "double") {
        const k = i % 2, a = (i >> 1) / (n / 2) * 6.283 + (k ? 0.13 : 0), r = R * (k ? 0.55 : 1);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
      } else if (pat === "spiral") {
        const a = i * 0.7, r = R * (0.25 + i / n * 0.85);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        delay = i * 32;
      } else if (pat === "fountain") {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7, r = R * (0.6 + Math.random() * 0.6);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        fall = R * 0.9;
      } else {
        const t = i / n * 6.283;
        x = 16 * Math.pow(Math.sin(t), 3) * R / 17;
        y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * R / 17;
      }
      const m = document.createElement("i");
      m.className = "bm" + (i % 3 ? "" : " n");
      ENV.root.appendChild(m);
      const rot = (Math.random() - 0.5) * 140, sc = 0.8 + Math.random() * 0.5;
      m.animate([
        { transform: `translate(${cx - 14}px,${cy - 13}px) scale(.3)`, opacity: 1 },
        { transform: `translate(${cx - 14 + x}px,${cy - 13 + y}px) scale(${sc}) rotate(${rot}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${cx - 14 + x}px,${cy - 13 + y + fall}px) scale(${sc * 0.8}) rotate(${rot * 1.4}deg)`, opacity: 0 }
      ], { duration: 1350, delay, easing: "cubic-bezier(.2,.75,.35,1)", fill: "both" }).onfinish = () => m.remove();
    }
    const L = fwLayer();
    for (let k = 0; k < (big ? 4 : 2); k++) setTimeout2(() => fireworks(L, cx + (Math.random() - 0.5) * R * 1.2, cy + (Math.random() - 0.5) * R * 0.8, 18, R * 0.45), 120 + k * 160);
    return pat;
  }
  function bkBurst(final) {
    const c = $("crowd"), k = c && c.querySelector(".mk.big");
    if (!k) return;
    const r = k.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (final && BK.S < 1.15) {
      k.classList.add("j");
      return;
    }
    k.classList.add("j");
    k.animate([{ scale: "1" }, { scale: "1.25" }, { scale: "0", opacity: 0 }], { duration: 260, easing: "ease-in", fill: "forwards", composite: "add" });
    try {
      SE.clear();
    } catch (e) {
    }
    if (RUN && !final) voice("wow");
    setTimeout2(() => {
      burstMinis(cx, cy, final || BK.S >= 3);
      k.remove();
      BK.S = 1;
      if (!final) setTimeout2(() => {
        if (RUN && $("crowd")) bigK();
      }, 700);
    }, 240);
  }
  var CWORD = { 5: "Nice!", 10: "Great!", 15: "Excellent!!", 20: "Amazing!!", 25: "Fantastic!!", 30: "Wonderful!!", 40: "Incredible!!", 50: "Perfect!!" };
  var popTurn = 0;
  function comboPop() {
    const c = RUN.combo;
    if (c < 5 || c % 5) return;
    $("arena").querySelectorAll(".cpop").forEach((e) => e.remove());
    const who = popTurn++ % 2 ? "boy" : "girl";
    const d = document.createElement("div");
    d.className = "cpop";
    d.innerHTML = `<div class="say"><b>${CWORD[c] || (c % 20 ? "Excellent!!" : "Unstoppable!!")}</b><span>${c} COMBO</span></div><img alt="" src="img/chara/${who}/joy.webp">`;
    $("arena").appendChild(d);
    if (innerHeight > innerWidth) {
      const t = $("txt");
      d.style.top = Math.max(4, t.offsetTop + t.offsetHeight - d.offsetHeight + 6) + "px";
    }
    setTimeout2(() => d.remove(), innerHeight > innerWidth ? 1700 : 1300);
    if (c % 10 === 0) voice({ 10: "nice", 20: "excellent", 30: "wow", 40: "excellent", 50: "perfect" }[c] || "wow");
  }
  function penFx(t) {
    const d = document.createElement("div");
    d.className = "pen";
    d.textContent = t;
    $("sPlay").appendChild(d);
    setTimeout2(() => d.remove(), 900);
  }
  function face() {
  }
  function hud() {
    if (!G) return;
    $("hudCount").textContent = `${G.done}/${G.total}`;
    $("hudProg").style.width = G.done / G.total * 100 + "%";
    $("hudTime").textContent = (G.t + G.pen).toFixed(1);
    $("hudCombo").innerHTML = RUN && RUN.combo >= 3 ? `${RUN.combo}<small>COMBO</small>` : "";
  }
  function init_fx() {
    ["N", "J", "D", "S", "O"].forEach((k) => ENV.root.style.setProperty("--f" + k, `url("data:image/svg+xml,${encodeURIComponent(faceSVG(k))}")`));
    setInterval2(() => {
      if (RUN && G && G.started && !G.over && !PAUSED && BK.S > 1 && $("crowd")) {
        BK.S = Math.max(1, BK.S - 0.018);
        bkApply();
      }
    }, 150);
  }

  // games/stream/src/words.js
  var WJA = null;
  function wja(pos) {
    if (!WJA) {
      WJA = {};
      [1, 2, 3].forEach((l) => {
        WORDS[l].forEach((w) => (WJA[w[1]] = WJA[w[1]] || []).push(w[2]));
        IDIOMS[l].forEach((w) => (WJA.ph = WJA.ph || []).push(w[2]));
      });
    }
    return pos === "x" ? WJA.n.concat(WJA.v) : WJA[pos] || WJA.n;
  }
  function wordSet(lv, k, kind) {
    const src = kind === "i" ? IDIOMS : WORDS, n = WSET[lv], ws = src[lv].slice(k * n, k * n + n), nm = kind === "i" ? "\u719F\u8A9E" : "\u5358\u8A9E";
    return { id: `${kind === "i" ? "i" : "w"}${lv}-${k + 1}`, lv, word: true, title: `${LV[lv].name}\u306E${nm} \u30BB\u30C3\u30C8${k + 1}`, ja: `${ws[0][0]} \u301C ${ws[ws.length - 1][0]}`, tag: `${LV[lv].name}\u30FB${nm}\u7DF4\u7FD2`, words: ws, chunks: [] };
  }
  var ULKEY = "cs-wordlists";
  var USET = 20;
  var UL_DOC_MAX = 25e4;
  function myLists() {
    try {
      return JSON.parse(LS.getItem(ULKEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveLists(l) {
    try {
      LS.setItem(ULKEY, JSON.stringify(l));
      return true;
    } catch (e) {
      return false;
    }
  }
  var lineToW = (l) => {
    const c = String(l).split("	");
    return [c[0], c[2] || "x", c[1] || ""];
  };
  var WDB = null;
  var WME = null;
  var WADMIN = false;
  var SHL = null;
  var UCAT = "";
  async function initWDB() {
    try {
      if (!window.claude || !claude.use) return;
      WDB = await claude.use("db");
      if (!WDB) return;
      const u = await claude.use("user");
      if (u) {
        try {
          WADMIN = !!await u.canEdit();
        } catch (e) {
        }
        try {
          WME = await u.id();
        } catch (e) {
        }
      }
      await loadSharedLists();
      if (!$("sWords").hidden && SV.wtab === "u") renderWords();
    } catch (e) {
      WDB = null;
    }
  }
  async function loadSharedLists() {
    if (!WDB) return;
    try {
      const sn = await WDB.collection("wordlists").get();
      SHL = sn.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (e) {
      SHL = SHL || [];
    }
  }
  function allLists() {
    const mine = myLists(), sid = new Set(mine.map((l) => l.sid).filter(Boolean));
    return mine.map((l) => ({ ...l, mine: true })).concat((SHL || []).filter((d) => !sid.has(d.id)).map((d) => ({ ...d, shared: true, sid: d.id })));
  }
  function parseWordLines(text) {
    const ok = [], errs = [], long = [], seen = /* @__PURE__ */ new Set();
    String(text).replace(/\r/g, "").split("\n").forEach((raw, i) => {
      const l = raw.trim();
      if (!l || l.startsWith("#")) return;
      let m = null;
      for (const re of [/\t/, /\s##\s/, /\s*[=＝]\s*/, /\s*,\s*/, /[ 　]+(?=[^\x00-\x7f])/]) {
        if (re.test(l)) {
          const k2 = l.search(re), mm = l.match(re)[0];
          m = [l.slice(0, k2), l.slice(k2 + mm.length).split(/\t|\s##\s/)[0]];
          break;
        }
      }
      const cl = (t) => (t || "").trim().replace(/^"(.*)"$/, "$1").trim();
      const en = m ? cl(m[0]) : "", ja = m ? cl(m[1]) : "";
      if (!en || !ja || !/[a-zA-Z]/.test(en) || /[^\x00-\x7f’‘“”–—]/.test(en)) {
        errs.push(`${i + 1}\u884C\u76EE\u300C${l.slice(0, 24)}\u300D`);
        return;
      }
      const k = en.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      if (ja.length > 12) long.push(en);
      ok.push(en.replace(/\s+/g, " ") + "	" + ja);
    });
    return { ok, errs, long };
  }
  function ulPlay(L, k) {
    const ws = L.lines.map(lineToW), a = k * USET, part = ws.slice(a, a + USET);
    return { id: `u-${L.sid || L.lid}-${k + 1}`, lv: +L.lv || 1, word: true, title: `${L.title}\uFF08${a + 1}\u301C${a + part.length}\uFF09`, ja: `${part[0][0]} \u301C ${part[part.length - 1][0]}`, tag: `${L.cat || "\u5358\u8A9E\u96C6"}\u30FB\u5358\u8A9E\u7DF4\u7FD2`, words: part, chunks: [] };
  }
  function renderWords() {
    const t = SV.wtab || "w", lv = SV.lv;
    $("wtabs").innerHTML = [["w", "\u5358\u8A9E"], ["i", "\u719F\u8A9E"], ["u", "\u5358\u8A9E\u96C6"]].map(([k, n2]) => `<button data-t="${k}" class="${k === t ? "on" : ""}">${n2}</button>`).join("");
    $("wtabs").querySelectorAll("button").forEach((b) => b.onclick = () => {
      SE.tap();
      SV.wtab = b.dataset.t;
      save();
      renderWords();
    });
    $("wtools").innerHTML = "";
    $("wsets").classList.toggle("ul", t === "u");
    if (t === "u") {
      renderUL();
      return;
    }
    const src = t === "i" ? IDIOMS : WORDS, n = WSET[lv], m = Math.ceil(src[lv].length / n), nm = t === "i" ? "\u719F\u8A9E" : "\u5358\u8A9E";
    $("wTitle").textContent = `${LV[lv].name}\u306E${nm}\u7DF4\u7FD2`;
    $("wNote").textContent = t === "i" ? `${LV[lv].name}\u306B\u3088\u304F\u51FA\u308B\u719F\u8A9E\u3092${n}\u500B\u305A\u3064\u3002\u8AAD\u307F\u4E0A\u3052\u3092\u805E\u3044\u3066\u3001\u610F\u5473\u3092\u9078\u3076\u3002` : `\u3088\u304F\u4F7F\u308F\u308C\u308B\u9806\u306B${n}\u8A9E\u305A\u3064\u3002\u8AAD\u307F\u4E0A\u3052\u3092\u805E\u3044\u3066\u3001\u610F\u5473\u3092\u9078\u3076\uFF08\u5358\u8A9E\u30C0\u30C3\u30B7\u30E5\uFF09\u3002`;
    $("wsets").innerHTML = Array.from({ length: m }, (_, k) => {
      const id = `${t === "i" ? "i" : "w"}${lv}-${k + 1}`, st = starsOf(id, 1), b = rec(id, 1, "ta");
      return `<button class="wset" data-k="${k}"><b>${k + 1}</b><span class="ws">${esc2(src[lv][k * n][0])}\u2026</span><span class="st">${"\u2605".repeat(st)}<i>${"\u2605".repeat(3 - st)}</i></span>${b ? `<small>${b.time.toFixed(1)}s</small>` : ""}</button>`;
    }).join("");
    $("wsets").querySelectorAll(".wset").forEach((b) => b.onclick = () => {
      SE.tap();
      CUR = wordSet(lv, +b.dataset.k, t);
      startRun(1);
    });
  }
  function renderUL() {
    const all = allLists(), cats = [...new Set(all.map((l) => l.cat).filter(Boolean))];
    if (UCAT && !cats.includes(UCAT)) UCAT = "";
    $("wTitle").textContent = "\u5358\u8A9E\u96C6";
    $("wNote").textContent = WDB ? "\u81EA\u5206\u3067\u4F5C\u3063\u305F\u5358\u8A9E\u96C6\u3068\u3001\u307F\u3093\u306A\u304C\u5171\u6709\u3057\u305F\u5358\u8A9E\u96C6\uFF08\u{1F310}\uFF09\u3002\u30AB\u30C6\u30B4\u30EA\u30FC\u3067\u7D5E\u308A\u8FBC\u3081\u307E\u3059\u3002" : "\u81EA\u5206\u3067\u4F5C\u3063\u305F\u5358\u8A9E\u96C6\u3002\u82F1\u8A9E\u3068\u8A33\u30921\u884C\u305A\u3064\u8CBC\u308A\u4ED8\u3051\u308B\u304B\u3001\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3081\u307E\u3059\u3002";
    $("wtools").innerHTML = [["", "\u3059\u3079\u3066"], ...cats.map((c) => [c, c])].map(([c, n]) => `<button class="chip ${c === UCAT ? "on" : ""}" data-c="${esc2(c)}">${esc2(n)}</button>`).join("") + `<button class="chip add" id="ulAdd">\uFF0B \u4F5C\u308B\u30FB\u8AAD\u307F\u8FBC\u3080</button>`;
    $("wtools").querySelectorAll(".chip[data-c]").forEach((b) => b.onclick = () => {
      UCAT = b.dataset.c;
      renderUL();
    });
    $("ulAdd").onclick = () => ulEdit();
    const ls = all.filter((l) => !UCAT || l.cat === UCAT);
    $("wsets").innerHTML = ls.length ? ls.map((l, i) => `<button class="ulc" data-i="${i}"><span class="t"><b>${l.shared ? "\u{1F310} " : ""}${esc2(l.title || "\u7121\u984C")}</b><small>${l.lines.length}\u8A9E${l.lv ? "\u30FB" + LV[l.lv].name : ""}${l.mine && l.sid ? "\u30FB\u5171\u6709\u4E2D" : ""}</small></span>${l.cat ? `<span class="cat">${esc2(l.cat)}</span>` : ""}</button>`).join("") : `<div class="ulempty">\u307E\u3060\u5358\u8A9E\u96C6\u304C\u3042\u308A\u307E\u305B\u3093\u3002<br>\u300C\uFF0B \u4F5C\u308B\u30FB\u8AAD\u307F\u8FBC\u3080\u300D\u304B\u3089\u3001\u5B66\u6821\u306E\u5358\u8A9E\u30C6\u30B9\u30C8\u306E\u7BC4\u56F2\u3084\u3001\u5E02\u8CA9\u306E\u5358\u8A9E\u5E33\u306E\u30DA\u30FC\u30B8\u306A\u3069\u3092\u5165\u308C\u3066\u307F\u3088\u3046\u3002</div>`;
    $("wsets").querySelectorAll(".ulc").forEach((b) => b.onclick = () => {
      SE.tap();
      ulOpen(ls[+b.dataset.i]);
    });
  }
  function ulOpen(L) {
    const n = Math.ceil(L.lines.length / USET), own = L.mine, canDrop = L.sid && WDB && (own || L.by && L.by === WME || WADMIN);
    overlay(`<div class="sheet"><h3>${esc2(L.title || "\u7121\u984C")}</h3><p class="hint">${L.lines.length}\u8A9E${L.cat ? "\u30FB" + esc2(L.cat) : ""}${L.lv ? "\u30FB" + LV[L.lv].name : ""}${L.shared ? "\u30FB\u307F\u3093\u306A\u306E\u5358\u8A9E\u96C6" : ""}</p>
    <div class="usets">${Array.from({ length: n }, (_, k) => {
      const id = `u-${L.sid || L.lid}-${k + 1}`, st = starsOf(id, 1);
      return `<button class="wset" data-k="${k}"><b>${k + 1}</b><span class="ws">${esc2(L.lines[k * USET].split("	")[0])}\u2026</span><span class="st">${"\u2605".repeat(st)}<i>${"\u2605".repeat(3 - st)}</i></span></button>`;
    }).join("")}</div>
    ${own ? `<button class="sbtn" id="uEd">\u7DE8\u96C6\u3059\u308B</button>` : ""}${own && WDB ? `<button class="sbtn" id="uSh">${L.sid ? "\u5171\u6709\u3092\u4ECA\u306E\u5185\u5BB9\u3067\u4E0A\u66F8\u304D\u3059\u308B" : "\u{1F310} \u307F\u3093\u306A\u306B\u5171\u6709\u3059\u308B"}</button>` : ""}
    ${canDrop ? `<button class="sbtn" id="uDr">\u5171\u6709\u3092\u53D6\u308A\u4E0B\u3052\u308B</button>` : ""}${!own ? `<button class="sbtn" id="uCp">\u81EA\u5206\u306E\u5358\u8A9E\u96C6\u306B\u30B3\u30D4\u30FC</button>` : ""}
    ${own ? `<button class="sbtn" id="uDel" style="color:var(--bad)">\u3053\u306E\u5358\u8A9E\u96C6\u3092\u6D88\u3059</button>` : ""}<button class="sbtn" id="uX">\u9589\u3058\u308B</button></div>`, (b) => {
      b.querySelectorAll(".wset").forEach((x) => x.onclick = () => {
        SE.tap();
        closeOv();
        CUR = ulPlay(L, +x.dataset.k);
        startRun(1);
      });
      b.querySelector("#uX").onclick = closeOv;
      const q = (id) => b.querySelector(id);
      q("#uEd") && (q("#uEd").onclick = () => ulEdit(L));
      q("#uSh") && (q("#uSh").onclick = () => ulShare(L));
      q("#uDr") && (q("#uDr").onclick = async () => {
        const x = q("#uDr");
        if (!x.dataset.c) {
          x.dataset.c = 1;
          x.textContent = "\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u53D6\u308A\u4E0B\u3052\uFF08\u307F\u3093\u306A\u306E\u753B\u9762\u304B\u3089\u6D88\u3048\u307E\u3059\uFF09";
          return;
        }
        try {
          await WDB.doc("wordlists/" + L.sid).delete();
          SHL = (SHL || []).filter((d) => d.id !== L.sid);
          if (own) {
            const l = myLists();
            const m = l.find((z) => z.lid === L.lid);
            if (m) {
              delete m.sid;
              saveLists(l);
            }
          }
          toast("\u53D6\u308A\u4E0B\u3052\u307E\u3057\u305F");
          closeOv();
          renderUL();
        } catch (e) {
          toast("\u53D6\u308A\u4E0B\u3052\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u6A29\u9650\u304B\u901A\u4FE1\u306E\u554F\u984C\uFF09");
        }
      });
      q("#uCp") && (q("#uCp").onclick = () => {
        const l = myLists();
        l.unshift({ lid: "l" + Date.now().toString(36), title: L.title, cat: L.cat || "", lv: L.lv || 0, lines: L.lines.slice(), at: Date.now() });
        saveLists(l) ? toast("\u81EA\u5206\u306E\u5358\u8A9E\u96C6\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F") : toast("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
        closeOv();
        renderUL();
      });
      q("#uDel") && (q("#uDel").onclick = () => {
        const x = q("#uDel");
        if (!x.dataset.c) {
          x.dataset.c = 1;
          x.textContent = L.sid ? "\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u6D88\u3059\uFF08\u5171\u6709\u306F\u305D\u306E\u307E\u307E\u6B8B\u308A\u307E\u3059\uFF09" : "\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u6D88\u3059";
          return;
        }
        saveLists(myLists().filter((z) => z.lid !== L.lid));
        toast("\u6D88\u3057\u307E\u3057\u305F");
        closeOv();
        renderUL();
      });
    });
  }
  async function ulShare(L) {
    if (!WDB) return;
    const doc = { title: L.title, cat: L.cat || "", lv: +L.lv || 0, lines: L.lines, by: WME || "", at: Date.now() };
    if (new TextEncoder().encode(JSON.stringify(doc)).length > UL_DOC_MAX) {
      toast("\u5927\u304D\u3059\u304E\u3066\u5171\u6709\u3067\u304D\u307E\u305B\u3093\u3002\u5358\u8A9E\u96C6\u3092\u5206\u3051\u3066\u304F\u3060\u3055\u3044");
      return;
    }
    const id = L.sid || "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await WDB.doc("wordlists/" + id).set(doc);
      const l = myLists(), m = l.find((z) => z.lid === L.lid);
      if (m) {
        m.sid = id;
        saveLists(l);
      }
      SHL = (SHL || []).filter((d) => d.id !== id).concat([{ ...doc, id }]);
      toast("\u307F\u3093\u306A\u306E\u5358\u8A9E\u96C6\u306B\u9001\u308A\u307E\u3057\u305F");
      closeOv();
      renderUL();
    } catch (e) {
      toast(e && e.code === "quota_exceeded" ? "\u5171\u6709\u306E\u4FDD\u5B58\u6570\u304C\u3044\u3063\u3071\u3044\u3067\u3059\u3002\u4E0D\u8981\u306A\u5358\u8A9E\u96C6\u3092\u53D6\u308A\u4E0B\u3052\u3066\u304F\u3060\u3055\u3044" : "\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u5171\u6709\u306E\u6A29\u9650\u304C\u306A\u3044\u304B\u3001\u901A\u4FE1\u306E\u554F\u984C\uFF09");
    }
  }
  var UCATS = ["\u5B66\u6821\u306E\u5358\u8A9E\u30C6\u30B9\u30C8", "\u82F1\u691C", "\u53D7\u9A13", "TOEIC", "\u719F\u8A9E", "\u4F1A\u8A71", "\u305D\u306E\u4ED6"];
  function ulEdit(L) {
    const cats = [...new Set(UCATS.concat(allLists().map((l) => l.cat).filter(Boolean)))];
    overlay(`<div class="sheet wide"><h3>${L ? "\u5358\u8A9E\u96C6\u3092\u7DE8\u96C6" : "\u5358\u8A9E\u96C6\u3092\u4F5C\u308B\u30FB\u8AAD\u307F\u8FBC\u3080"}</h3>
    <label>\u540D\u524D<input id="uT" maxlength="40" placeholder="\u4F8B\uFF1A\u4E2D2 2\u5B66\u671F \u5358\u8A9E\u30C6\u30B9\u30C8" value="${esc2(L ? L.title : "")}"></label>
    <div class="row2"><label>\u30AB\u30C6\u30B4\u30EA\u30FC<input id="uC" list="ucats" maxlength="20" placeholder="\u4F8B\uFF1A\u82F1\u691C" value="${esc2(L ? L.cat || "" : "")}"><datalist id="ucats">${cats.map((c) => `<option value="${esc2(c)}">`).join("")}</datalist></label>
    <label>\u30EC\u30D9\u30EB<select id="uL"><option value="0">\u306A\u3057</option>${[1, 2, 3].map((l) => `<option value="${l}" ${L && +L.lv === l ? "selected" : ""}>${LV[l].name}</option>`).join("")}</select></label></div>
    <label>\u82F1\u8A9E\u3068\u8A33\uFF081\u884C\u306B1\u3064\uFF09<textarea id="uX" spellcheck="false" placeholder="apple = \u308A\u3093\u3054&#10;look forward to = \u301C\u3092\u697D\u3057\u307F\u306B\u5F85\u3064&#10;improve	\u5411\u4E0A\u3055\u305B\u308B">${L ? esc2(L.lines.map((x) => x.replace("	", " = ")).join("\n")) : ""}</textarea></label>
    <p class="hint">\u533A\u5207\u308A\u306F <code>=</code>\u30FB\u30BF\u30D6\u30FB\u30AB\u30F3\u30DE\u30FB<code> ## </code> \u306E\u3069\u308C\u3067\u3082OK\uFF08Excel\u3084\u30B9\u30D7\u30EC\u30C3\u30C9\u30B7\u30FC\u30C8\u304B\u3089\u306E\u30B3\u30D4\u30FC\u3001CSV\u30D5\u30A1\u30A4\u30EB\u3082\u305D\u306E\u307E\u307E\uFF09\u3002\u719F\u8A9E\u3082\u305D\u306E\u307E\u307E\u66F8\u3051\u307E\u3059\u3002\u8A33\u306F12\u5B57\u307E\u3067\u304C\u304A\u3059\u3059\u3081\uFF08\u9577\u3044\u3068\u6587\u5B57\u304C\u5C0F\u3055\u304F\u306A\u308A\u307E\u3059\uFF09\u3002\u300C#\u300D\u3067\u59CB\u307E\u308B\u884C\u306F\u30E1\u30E2\u3002</p>
    <label>\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u8AAD\u307F\u8FBC\u3080\uFF08.txt / .csv / .tsv\uFF09<input type="file" id="uF" accept=".txt,.csv,.tsv,text/plain,text/csv"></label>
    <p class="msg" id="uM"></p><button class="sbtn pri" id="uS">\u4FDD\u5B58\u3059\u308B</button><button class="sbtn" id="uN">\u3084\u3081\u308B</button></div>`, (b) => {
      const q = (id) => b.querySelector(id), chk = () => {
        const r = parseWordLines(q("#uX").value), m = q("#uM");
        m.className = "msg" + (r.errs.length ? " ng" : "");
        m.innerHTML = `${r.ok.length}\u8A9E${r.ok.length < 4 ? "\uFF084\u8A9E\u4EE5\u4E0A\u5FC5\u8981\uFF09" : ""}${r.long.length ? `\u30FB\u8A33\u304C\u9577\u3044\uFF1A${esc2(r.long.slice(0, 5).join(", "))}${r.long.length > 5 ? " \u307B\u304B" : ""}` : ""}${r.errs.length ? `<br>\u8AAD\u3081\u306A\u3044\u884C\uFF08\u98DB\u3070\u3057\u307E\u3059\uFF09\uFF1A${esc2(r.errs.slice(0, 3).join("\u3001"))}${r.errs.length > 3 ? ` \u307B\u304B${r.errs.length - 3}\u884C` : ""}` : ""}`;
        return r;
      };
      q("#uX").oninput = chk;
      if (L) chk();
      q("#uF").onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const t = await f.text();
        q("#uX").value = (q("#uX").value.trim() ? q("#uX").value.trim() + "\n" : "") + t;
        if (!q("#uT").value) q("#uT").value = f.name.replace(/\.[^.]+$/, "").slice(0, 40);
        chk();
      };
      q("#uN").onclick = closeOv;
      q("#uS").onclick = () => {
        const r = chk();
        if (r.ok.length < 4) {
          SE.ng();
          toast("4\u8A9E\u4EE5\u4E0A\u5165\u308C\u3066\u304F\u3060\u3055\u3044");
          return;
        }
        const l = myLists(), o = { lid: L ? L.lid : "l" + Date.now().toString(36), title: q("#uT").value.trim() || "\u7121\u984C\u306E\u5358\u8A9E\u96C6", cat: q("#uC").value.trim(), lv: +q("#uL").value, lines: r.ok, at: Date.now() };
        if (L && L.sid) o.sid = L.sid;
        const i = l.findIndex((z) => z.lid === o.lid);
        i >= 0 ? l.splice(i, 1, o) : l.unshift(o);
        if (!saveLists(l)) {
          toast("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u7AEF\u672B\u306E\u5BB9\u91CF\uFF09");
          return;
        }
        SE.tap();
        toast(L && L.sid ? "\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF08\u5171\u6709\u306F\u300C\u4E0A\u66F8\u304D\u300D\u3067\u53CD\u6620\uFF09" : "\u4FDD\u5B58\u3057\u307E\u3057\u305F");
        closeOv();
        UCAT = "";
        renderUL();
      };
    });
  }

  // games/stream/src/play.js
  var tutFace = (w, f) => `${ENV.base}img/chara/${w === "b" ? "boy" : "girl"}/${f || "normal"}.webp`;
  var RUN = null;
  var G = null;
  var PAUSED = false;
  var RAF = 0;
  var LAST = 0;
  var TRAV = { 1: 9, 2: 12, 3: 12, 4: 15 };
  var PAR = { 1: 1.7, 2: 2.5, 3: 2.5, 4: 2.3 };
  var MAXVIS = { 1: 4, 2: 4, 3: 3 };
  var W = 700;
  var H = 200;
  var XJ = 140;
  function gapPick(c) {
    const auth = c.s3.filter((x) => Array.isArray(x[1]));
    const pick = auth.length && Math.random() < 0.45 ? auth[rnd(auth.length)] : c.s3[rnd(c.s3.length)];
    const [ti, src] = pick;
    const ans = c.tk[ti][1];
    let ds;
    if (Array.isArray(src)) ds = src.slice(0, 3);
    else {
      const own = c.tk.map((t) => t[1].toLowerCase());
      ds = shuf(POOL[src].filter((w) => w !== ans.toLowerCase() && !own.includes(w))).slice(0, 3);
    }
    const up = /^[A-Z]/.test(ans) && ans !== "I";
    ds = ds.map((d) => up ? cap(d) : d);
    return { gs: ti, ge: ti + 1, ans, opts: shuf([ans, ...ds]) };
  }
  function buildItems(st, p) {
    if (st === 1) return shuf(p.words).map((w) => ({ kind: 1, en: w[0], pos: w[1], ans: w[2] }));
    const n = Math.min(p.lv === 1 ? 14 : 16, p.chunks.length);
    if (st === 2) return shuf(p.chunks.map((c, i) => i)).slice(0, n).map((i) => ({ kind: 2, ci: i, en: plain(p.chunks[i]), ans: p.chunks[i].ja }));
    if (st === 3) return shuf(p.chunks.map((c, i) => i).filter((i) => p.chunks[i].s3.length)).slice(0, n).map((i) => ({ kind: 3, ci: i, ...gapPick(p.chunks[i]), ja: p.chunks[i].ja }));
    return p.chunks.map((c, i) => {
      const gp = c.s3.length && Math.random() < 0.6 ? gapPick(c) : { gs: c.g[0], ge: c.g[1], ans: c.g[2][0], opts: shuf(c.g[2]) };
      return { kind: 4, ci: i, ...gp, ja: c.ja, lane: i % 2 };
    });
  }
  function chunkHTML(c, gs, ge, fill) {
    const h = [];
    for (let j = 0; j < c.tk.length; j++) {
      const t = c.tk[j];
      if (j === gs) {
        h.push(esc2(c.tk[gs][0]) + (fill == null ? `<span class="blank">?</span>` : `<b>${esc2(fill)}</b>`) + esc2(c.tk[ge - 1][2]));
        j = ge - 1;
        continue;
      }
      h.push(esc2(t[0] + t[1] + t[2]));
    }
    return h.join(" ");
  }
  function startRun(from) {
    goFull();
    hush();
    closeOv();
    RUN = { p: CUR2, from, res: [], combo: 0, maxc: 0, review: [], flow: true };
    show("sPlay");
    ac();
    bgmStart(118, "game");
    crowd().innerHTML = "";
    BK.S = 1;
    setTimeout2(() => {
      try {
        bigK();
      } catch (e) {
      }
    }, 300);
    buildGrids();
    cancelAnimationFrame(RAF);
    LAST = performance.now();
    RAF = requestAnimationFrame(loop);
    const beat = 60 / 118 * 1e3;
    [3, 2, 1].forEach((n, i) => setTimeout2(() => {
      if (!RUN) return;
      inter(`<div class="cd">${n}</div>`, 0);
      SE.count(false);
    }, i * beat));
    setTimeout2(() => {
      if (RUN) beginStage(from);
    }, 3 * beat);
  }
  function inter(html, ms) {
    const f = $("arena");
    f.querySelectorAll(".inter").forEach((e) => e.remove());
    if (!html) return;
    const d = document.createElement("div");
    d.className = "inter";
    d.innerHTML = html;
    f.appendChild(d);
    if (ms) setTimeout2(() => d.remove(), ms);
    return d;
  }
  function beginStage(st) {
    const p = RUN.p;
    $("layer").innerHTML = "";
    $("fx").innerHTML = "";
    G = {
      st,
      p,
      done: 0,
      first: 0,
      wrong: 0,
      miss: 0,
      t: 0,
      pen: 0,
      started: false,
      ribbon: [],
      lanes: [{ i: 0, q: [], list: [], slots: null, lock: 0 }, { i: 1, q: [], list: [], slots: null, lock: 0 }],
      cq: [],
      list: [],
      rq: [],
      rqCur: null,
      rqLast: 0
    };
    const items = buildItems(st, p);
    G.total = items.length;
    $("para").innerHTML = "";
    $("para").className = "para" + (st === 4 ? "" : " log");
    $("para").style.transform = "";
    if (st === 1) items.forEach((it, i) => G.lanes[i % 2].list.push(it));
    else if (st <= 3) items.forEach((it) => G.lanes[0].list.push(it));
    else G.list = items;
    G.prev = /* @__PURE__ */ new Set();
    layout();
    hud();
    $("hudNo").textContent = st;
    $("hudName").textContent = STAGES[st - 1].name;
    G.lanes.forEach((L) => {
      L.slots = null;
      renderGrid(L.i);
    });
    SE.count(true);
    inter(`<div class="sub" style="color:var(--accent)">STAGE ${st}</div><div class="big" style="font-size:clamp(28px,9vh,44px)">${STAGES[st - 1].name}</div><div class="note">${STAGES[st - 1].note}</div>`, 1350);
    setTimeout2(() => {
      if (G && G.st === st) {
        G.started = true;
      }
    }, 1350);
  }
  var LY = [60, 140];
  function layout() {
    const r = $("field").getBoundingClientRect();
    W = r.width;
    H = r.height;
    XJ = Math.round(Math.min(W * 0.18, 150));
    $("zone").style.left = XJ + "px";
    LY = innerHeight > innerWidth ? [H / 2, H / 2] : [0, 1].map((l) => {
      const g = $("g" + l).getBoundingClientRect();
      return g.top + g.height / 2 - r.top;
    });
    $("seam").style.top = (LY[0] + LY[1]) / 2 + "px";
  }
  function laneY(l) {
    const mid = (LY[0] + LY[1]) / 2;
    if (!G || G.st === 2 || G.st === 3) return mid;
    const fs = +(SV.set.fs || 1.2), ch = fs * 15 * 1.25 + 12, off = ch / 2 + (G.st === 4 ? fs * 9 : 7);
    const o = innerHeight > innerWidth && G.st === 4 ? fs * 15 * 1.25 + 10 : off;
    return mid + (l ? o : -o);
  }
  function mkCard(it) {
    const e = document.createElement("div");
    e.className = "card l" + it.lane;
    const p = G.p;
    if (it.kind === 1) e.innerHTML = `${POSJ[it.pos] ? `<span class="pos ${it.pos}">${POSJ[it.pos]}</span>` : ""}${esc2(it.en)}`;
    else if (it.kind === 2) {
      e.textContent = it.en;
    } else {
      e.innerHTML = chunkHTML(p.chunks[it.ci], it.gs, it.ge);
    }
    e.insertAdjacentHTML("beforeend", '<span class="ft"></span>');
    $("layer").appendChild(e);
    const mw = innerHeight > innerWidth ? Math.round(W * 0.6) : W - 24;
    if (e.offsetWidth > mw) {
      e.style.whiteSpace = "normal";
      e.style.width = mw + "px";
    }
    it.el = e;
    it.w = e.offsetWidth;
    it.h = e.offsetHeight;
    it.y = laneY(it.lane);
    it.ready = 0;
    place(it);
    return e;
  }
  function place(it) {
    it.el.style.transform = `translate3d(${it.x.toFixed(1)}px,${(it.y - it.h / 2).toFixed(1)}px,0)`;
  }
  function setJa(it, txt) {
    let j = it.el.querySelector(".jp");
    if (!txt) {
      j && j.remove();
      return;
    }
    if (!j) {
      j = document.createElement("span");
      j.className = "jp";
      it.el.appendChild(j);
    }
    j.textContent = txt;
  }
  function loop() {
    RAF = requestAnimationFrame(loop);
    if (PAUSED) return;
    const tn = performance.now(), dt = Math.min(0.05, (tn - LAST) / 1e3);
    LAST = tn;
    if (!G || !G.started || G.over) {
      if (G) stepRibbon(dt);
      return;
    }
    G.t += dt;
    G.lanes.forEach((L) => L.lock = Math.max(0, L.lock - dt));
    G.lock4 = Math.max(0, (G.lock4 || 0) - dt);
    G.st <= 3 ? stepLanes(dt) : stepLong(dt);
    heal();
    stepRibbon(dt);
    hud();
    if (G.done >= G.total) stageEnd();
  }
  function speedOf() {
    return (W + 40) / (TRAV[G.st] + (G.p.lv - 1)) * (SV.set.spd || 0.5);
  }
  var ENTER = 1100;
  var inView = (it) => W - it.w - 12;
  var LIMIT = { 1: 9, 2: 13, 3: 13, 4: 16 };
  function limitOf() {
    return (LIMIT[G.st] + (G.p.lv - 1)) * (0.5 / (SV.set.spd || 0.5)) * (innerHeight > innerWidth ? 1.25 : 1);
  }
  function moveFront(it, v, dt) {
    const ex = inView(it);
    if (it.x > ex) {
      it.x = Math.max(ex, it.x - ENTER * dt);
      return v * 2;
    }
    if (it.v == null) it.v = Math.max(3, (it.x - 38) / limitOf());
    it.age = (it.age || 0) + dt;
    let sp = it.v;
    if (false) {
      const over = it.x - W * 0.5;
      if (over > 0) sp += over * 2.4 * (SV.set.spd || 0.5);
      else it.boost = false;
    }
    it.x = Math.max(6, it.x - sp * dt);
    return sp;
  }
  function stepLanes(dt) {
    const v = speedOf();
    let fast = false;
    G.lanes.forEach((L) => {
      while (L.q.length < MAXVIS[G.st] && L.list.length) {
        const last = L.q[L.q.length - 1];
        if (last && last.x + last.w > W - 12) break;
        const it = L.list.shift();
        it.lane = L.i;
        it.x = Math.max(W + 8, last ? last.x + last.w + 30 : 0);
        mkCard(it);
        L.q.push(it);
        if (L.q.length === 1) laneFront(L);
      }
      L.q.forEach((it, k) => {
        if (k === 0) {
          if (moveFront(it, v, dt) > v * 1.6) fast = true;
          if (it.x + it.w < W) it.ready += dt;
          if (!it.el.classList.contains("front")) {
            it.el.classList.add("front");
            it.el.classList.remove("next");
          }
          if (it.v != null) {
            const r = Math.max(0, 1 - it.age / limitOf());
            if (!it.tb) {
              it.tb = document.createElement("span");
              it.tb.className = "tb";
              it.tb.innerHTML = "<i></i>";
              it.el.appendChild(it.tb);
            }
            it.tb.firstChild.style.transform = `scaleX(${r})`;
            it.tb.classList.toggle("low", r < 0.3);
            if (r <= 0) {
              place(it);
              missIt(L, it);
              return;
            }
          }
        } else {
          const a = L.q[k - 1];
          it.x = Math.max(a.x + a.w + 30, it.x > inView(it) ? Math.max(inView(it), it.x - ENTER * dt) : it.x - (L.q[0].v || v) * dt);
          it.el.classList.add("next");
        }
        place(it);
      });
    });
    if (G.st <= 2) readTick();
    $("field").classList.toggle("fast", fast || RUN.combo >= 10);
  }
  function stepLong(dt) {
    const v = speedOf();
    let fast = false;
    const Q = G.cq;
    while (Q.length < 14 && G.list.length) {
      const last = Q[Q.length - 1];
      if (last && last.x > W - 30) break;
      const it = G.list.shift();
      const pp = Q[Q.length - 2];
      it.x = Math.max(W + 8, last ? last.x + last.w * 0.5 + 18 : 0, pp ? pp.x + pp.w + 16 : 0);
      mkCard(it);
      Q.push(it);
      if (Q.length === 1) front4();
    }
    Q.forEach((it, k) => {
      if (k === 0) {
        if (it.x > 40) {
          if (moveFront(it, v, dt) > v * 1.6) fast = true;
          it.x = Math.max(40, it.x);
        }
        if (it.x + it.w < W) it.ready += dt;
        const r = it.ready / limitOf();
        if (SV.set.jp4 && r >= 0.5 && !it.jaOn) {
          it.jaOn = 1;
          setJa(it, it.ja);
        }
        if (r >= 0.85 && !TTS.busy && G.t - (it.hintT || -99) > 5) hint4(it);
        tbar(it, 1 - Math.min(1, r / 0.85));
      } else {
        const a = Q[k - 1], b = Q[k - 2];
        const tx = Math.max(a.x + a.w * 0.5 + 18, b ? b.x + b.w + 16 : 0);
        it.x = Math.max(tx, it.x > inView(it) ? Math.max(inView(it), it.x - ENTER * dt) : it.x - (Q[0].v || v) * dt);
      }
      place(it);
    });
    $("field").classList.toggle("fast", fast || RUN.combo >= 10);
  }
  function heal() {
    const ok = (S, f) => S && S.some((x) => x && x.text === f.ans);
    if (G.st === 4) {
      const f = G.cq[0];
      if (f && !ok(G.s4, f)) front4();
    } else if (G.st >= 2) {
      const f = G.lanes[0].q[0];
      if (f && !ok(G.s4, f)) laneFront(G.lanes[0]);
    } else G.lanes.forEach((L) => {
      const f = L.q[0];
      if (f && !ok(L.slots, f)) laneFront(L);
    });
  }
  function tbar(it, r) {
    if (!it.el) return;
    if (!it.tb) {
      it.tb = document.createElement("span");
      it.tb.className = "tb";
      it.tb.innerHTML = "<i></i>";
      it.el.appendChild(it.tb);
    }
    it.tb.firstChild.style.transform = `scaleX(${Math.max(0, r)})`;
    it.tb.classList.toggle("low", r < 0.3);
    it.el.classList.toggle("sweat", r < 0.3);
  }
  function hint4(it) {
    it.hintT = G.t;
    it.el.classList.add("spk");
    speak(plain(G.p.chunks[it.ci]), () => {
      it.el && it.el.classList.remove("spk");
    }, "hint");
    face("think");
  }
  function isFront(it) {
    return G.lanes[it.lane].q[0] === it;
  }
  function readEnq(it, first) {
    if (!it || G.rq.includes(it)) return;
    first ? G.rq.unshift(it) : G.rq.push(it);
    readPump();
  }
  function readPump() {
    if (!G || G.rqCur || !G.started) return;
    while (G.rq.length) {
      const it = G.rq.shift();
      if (!isFront(it)) continue;
      G.rqCur = it;
      it.el.classList.add("spk");
      const g = G;
      speak(it.en, () => {
        it.el && it.el.classList.remove("spk");
        if (G !== g) return;
        it.heard = G.t;
        if (G.rqCur === it) G.rqCur = null;
        G.rqLast = G.t;
        readPump();
      }, "read");
      return;
    }
  }
  function readTick() {
    if (G.rqCur && !isFront(G.rqCur)) {
      G.rqCur.el.classList.remove("spk");
      G.rqCur = null;
    }
    if (G.st === 1) {
      readPump();
      return;
    }
    if (!G.rqCur && !G.rq.length) {
      const fr = G.lanes.map((L) => L.q[0]).filter((f) => f && f.x < W - 20);
      if (fr.length && G.t - G.rqLast > 2.2) {
        fr.sort((a, b) => (a.heard ?? -1) - (b.heard ?? -1));
        readEnq(fr[0]);
      }
    } else readPump();
  }
  function buildGrids() {
    [0, 1].forEach((l) => {
      const g = $("g" + l);
      g.innerHTML = [0, 1, 2, 3].map((i) => `<button class="ch" data-i="${i}"><span class="tx"></span></button>`).join("");
      g.querySelectorAll(".ch").forEach((b) => b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        press(l, +b.dataset.i);
      }));
    });
  }
  function slotAt(l, i) {
    if (G.st >= 2) {
      const k = l === 0 ? i >= 2 ? i - 2 : -1 : i < 2 ? i + 2 : -1;
      return k < 0 ? void 0 : G.s4 ? G.s4[k] : null;
    }
    const L = G.lanes[l];
    return L.slots ? L.slots[i] : null;
  }
  function fitCh(b, t) {
    t.style.fontSize = "";
    let f = parseFloat(getComputedStyle(t).fontSize), n = 0;
    while (n++ < 12 && b.scrollHeight > b.clientHeight + 1 && f > 8.5) {
      f -= 0.6;
      t.style.fontSize = f + "px";
    }
  }
  var LASTCH = 0;
  function posRep() {
    const r = $("rep"), sd = $("side");
    if (!r) return;
    const on = !!(G && G.st === 1);
    r.hidden = !on;
    sd.classList.toggle("wd", on);
    if (!on) return;
    const g = $("g0"), g1 = $("g1");
    r.style.top = (g.offsetTop + g.offsetHeight + g1.offsetTop) / 2 + "px";
  }
  function repTap(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!G || G.st !== 1 || !G.started || G.over || PAUSED) return;
    if (performance.now() - LASTCH < 300) return;
    const lim = limitOf(), fr = G.lanes.map((L) => L.q[0]).filter((f) => f && f.v != null).sort((a, b) => b.age - a.age);
    if (!fr.length) return;
    fr.slice().reverse().forEach((f) => {
      G.rq = G.rq.filter((x) => x !== f);
      readEnq(f, true);
    });
    const r = $("rep");
    r.classList.add("on");
    setTimeout2(() => r.classList.remove("on"), 400);
  }
  function renderGrid(l) {
    const g = $("g" + l), en = G.st >= 3, st4 = G.st >= 2, cl = G.st === 1 ? l : G.st === 4 ? G.cq[0] ? G.cq[0].lane : 0 : 0;
    g.classList.toggle("c0", cl === 0);
    g.classList.toggle("c1", cl === 1);
    g.classList.toggle("off", st4 ? !G.s4 : !G.lanes[l].slots);
    g.classList.toggle("m4", st4);
    [...g.children].forEach((b, i) => {
      const s = slotAt(l, i), tx = s ? s.text : "";
      b.classList.toggle("hide", s === void 0);
      const el = b.querySelector(".tx");
      if (el.textContent !== tx) {
        el.textContent = tx;
        b.classList.remove("swap");
        void b.offsetWidth;
        b.classList.add("swap");
        fitCh(b, el);
      }
      b.classList.toggle("en", en);
      b.classList.toggle("long", tx.length > (en ? 22 : 16));
      b.classList.remove("ng", "ok");
      b.classList.toggle("dis", !!(s && s.dis));
    });
  }
  function laneFront(L) {
    const f = L.q[0];
    if (G.st >= 2) {
      G.s4 = f ? (G.st === 3 ? f.opts : shuf([f.ans, ...distract(f, /* @__PURE__ */ new Set([f.ans]))])).map((t) => ({ text: t })) : null;
      if (f) {
        G.s4.forEach((x) => G.prev.add(x.text));
        if (G.st === 3) setJa(f, f.ja);
      }
      renderGrid(0);
      renderGrid(1);
      if (f && G.st === 2 && G.started) readEnq(f, false);
      return;
    }
    if (!f) {
      L.slots = null;
      renderGrid(L.i);
      return;
    }
    const other = G.lanes[1 - L.i].q[0], ex = /* @__PURE__ */ new Set([f.ans, other && other.ans]);
    const old = L.prevOpts || /* @__PURE__ */ new Set();
    (L.slots || []).forEach((x) => old.add(x.text));
    L.slots = shuf([f.ans, ...distract(f, ex, old)]).map((t) => ({ text: t }));
    L.prevOpts = new Set(L.slots.map((x) => x.text));
    renderGrid(L.i);
    if (G.started) readEnq(f, false);
  }
  function distract(f, ex, old) {
    const p = G.p, bad = (t) => ex.has(t) || old && old.has(t) || G.prev && G.st === 2 && G.prev.has(t);
    const out = [];
    if (G.st === 1) {
      const own = f.pos === "x" ? 3 : 2;
      shuf(p.words.filter((w) => w[0] !== f.en && (w[1] === f.pos || f.pos === "x")).map((w) => w[2])).forEach((t) => {
        if (out.length < own && !bad(t) && !out.includes(t)) out.push(t);
      });
      shuf(wja(f.pos)).forEach((t) => {
        if (out.length < 3 && !bad(t) && !out.includes(t)) out.push(t);
      });
      shuf(p.words.map((w) => w[2])).forEach((t) => {
        if (out.length < 3 && t !== f.ans && !ex.has(t) && !out.includes(t)) out.push(t);
      });
    } else {
      const pool = shuf(p.chunks.map((c) => c.ja)).concat(shuf(PASSAGES.filter((q) => q !== p && q.lv === p.lv).flatMap((q) => q.chunks.map((c) => c.ja))));
      pool.forEach((t) => {
        if (out.length < 3 && !bad(t) && !out.includes(t)) out.push(t);
      });
      if (out.length < 3) pool.forEach((t) => {
        if (out.length < 3 && !ex.has(t) && !out.includes(t)) out.push(t);
      });
    }
    return out;
  }
  function front4() {
    const f = G.cq[0];
    G.lanes.forEach((L) => L.slots = null);
    G.cq.forEach((it, k) => {
      if (k) setJa(it, null);
      it.el.classList.toggle("front", k === 0);
      it.el.classList.toggle("next", k > 0);
    });
    G.s4 = f ? f.opts.map((t) => ({ text: t })) : null;
    renderGrid(0);
    renderGrid(1);
  }
  function press(l, i) {
    if (!G || !G.started || G.over || PAUSED) return;
    if (G.st >= 2) {
      const s2 = slotAt(l, i), f2 = G.st === 4 ? G.cq[0] : G.lanes[0].q[0];
      if (!s2 || s2.dis || !f2 || G.lock4 > 0) return;
      const btn2 = $("g" + l).children[i], LL = G.st === 4 ? G.lanes[f2.lane] : G.lanes[0];
      if (s2.text === f2.ans) correct(LL, f2, btn2);
      else wrong(LL, f2, s2, btn2);
      return;
    }
    const L = G.lanes[l];
    if (L.lock > 0 || !L.slots) return;
    const f = G.st <= 3 ? L.q[0] : G.cq[0];
    if (!f || f.lane !== l) return;
    const s = L.slots[i];
    if (!s || s.dis) return;
    const btn = $("g" + l).children[i];
    if (s.text === f.ans) correct(L, f, btn);
    else wrong(L, f, s, btn);
  }
  function resolve(it) {
    G.done++;
    if (it.flawed) RUN.review.push({ st: G.st, it, p: G.p });
    else G.first++;
  }
  function correct(L, it, btn) {
    G.lastBtn = btn;
    if (G.st <= 3) {
      L.q.shift();
      if (L.q[0]) L.q[0].boost = true;
    } else {
      G.cq.shift();
      if (G.cq[0]) G.cq[0].boost = true;
    }
    if (G.st >= 2) G.lock4 = 0.08;
    resolve(it);
    RUN.combo++;
    RUN.maxc = Math.max(RUN.maxc, RUN.combo);
    L.lock = 0.08;
    btn.classList.remove("ok");
    void btn.offsetWidth;
    btn.classList.add("ok");
    setTimeout2(() => btn.classList.remove("ok"), 170);
    try {
      SE.ok(RUN.combo);
      fxCorrect(it);
      comboPop();
    } catch (e) {
    }
    const c = it.ci != null ? G.p.chunks[it.ci] : null;
    if (G.st <= 2) {
      if (G.rqCur === it) {
        G.rqCur = null;
        it.el.classList.remove("spk");
      }
      flyTo(it, `${esc2(it.en)}<i>${esc2(it.ans)}</i>`);
      laneFront(L);
      if (G.rqCur == null) {
        const nf = L.q[0];
        if (nf) {
          G.rq = G.rq.filter((x) => x !== nf);
          readEnq(nf, true);
        }
      }
    } else if (G.st === 3) {
      speakAfter(fromGap(c, it.gs));
      flyTo(it, chunkHTML(c, it.gs, it.ge, it.ans) + `<i>${esc2(c.ja)}</i>`);
      laneFront(L);
    } else {
      G.lock4 = 0.08;
      front4();
      try {
        speakAfter(fromGap(c, it.gs));
        SE.merge();
        flyTo(it, chunkHTML(c, it.gs, it.ge, it.ans));
      } catch (e) {
        it.el && it.el.remove();
      }
    }
  }
  function wrong(L, it, s, btn) {
    G.wrong++;
    RUN.combo = 0;
    SE.ng();
    face("surprise");
    it.flawed = true;
    s.dis = true;
    try {
      bkShrink(0.5);
    } catch (e) {
    }
    if (it.el) {
      const e = it.el;
      e.classList.remove("oops");
      void e.offsetWidth;
      e.classList.add("oops");
      setTimeout2(() => e.classList.remove("oops"), 460);
    }
    btn.classList.remove("ng");
    void btn.offsetWidth;
    btn.classList.add("ng", "dis");
    G.pen += 2;
    penFx("+2.0");
    if (navigator.vibrate) try {
      navigator.vibrate(30);
    } catch (e) {
    }
  }
  function missIt(L, it) {
    try {
      bkShrink(0.6);
    } catch (e) {
    }
    L.q.shift();
    it.flawed = true;
    resolve(it);
    G.miss++;
    RUN.combo = 0;
    SE.miss();
    face("sad");
    G.pen += 3;
    penFx("+3.0");
    if (G.rqCur === it) G.rqCur = null;
    it.el.classList.add("miss");
    it.el.classList.remove("spk");
    setJa(it, null);
    const a = document.createElement("div");
    a.className = "ans";
    a.textContent = it.ans;
    it.el.appendChild(a);
    const g = G, c = it.ci != null ? G.p.chunks[it.ci] : null;
    setTimeout2(() => {
      if (G === g && it.el.isConnected) flyTo(it, c && G.st === 3 ? chunkHTML(c, it.gs, it.ge, it.ans) + `<i>${esc2(c.ja)}</i>` : `${esc2(it.en)}<i>${esc2(it.ans)}</i>`, "bad");
    }, 650);
    laneFront(L);
  }
  function flyTo(it, html, cls) {
    const el = it.el, g = G;
    if (!el || !el.isConnected) return;
    const segs = segsOf(it);
    if (cls === "bad") {
      el.classList.add("dizzy");
      el.animate([{ opacity: 1, translate: "0 0", rotate: "0deg" }, { opacity: 0, translate: "-10px 44px", rotate: "-18deg" }], { duration: 650, easing: "ease-in", fill: "forwards" });
      setTimeout2(() => el.remove(), 660);
      return;
    }
    el.classList.remove("front", "next", "sweat", "spk", "oops");
    el.classList.add("joy");
    const go = () => {
      if (!el.isConnected) return;
      el.style.animation = "st-ccJump .26s ease-out forwards";
      const r = el.getBoundingClientRect(), fr = $("fx").getBoundingClientRect(), big = RUN && RUN.combo >= 10;
      fireworks($("fx"), r.left - fr.left + r.width / 2, r.top - fr.top + r.height / 2, big ? 18 : 12, big ? 64 : 48);
      setTimeout2(() => joinCrowd(it, el, segs), 220);
    };
    const bl = el.querySelector(".blank"), btn = g && g.lastBtn;
    if (bl && btn && it.ci != null) {
      const pc = document.createElement("div");
      pc.className = "piece";
      pc.textContent = it.ans;
      ENV.root.appendChild(pc);
      const a = btn.getBoundingClientRect(), b = bl.getBoundingClientRect();
      pc.animate([{ transform: `translate(${a.left + a.width / 2 - 24}px,${a.top}px) scale(.9)` }, { transform: `translate(${b.left}px,${b.top - 2}px) scale(1)` }], { duration: 200, easing: "ease-in" }).onfinish = () => {
        pc.remove();
        const c = g.p.chunks[it.ci];
        if (c) {
          el.innerHTML = chunkHTML(c, it.gs, it.ge, it.ans) + '<span class="ft"></span>';
        }
        el.classList.add("snap");
        try {
          SE.merge();
        } catch (e) {
        }
        setTimeout2(go, 130);
      };
    } else go();
  }
  function stepRibbon(dt) {
    if (!G) return;
    const R = G.ribbon;
    if (!R.length) return;
    R[R.length - 1].x -= 30 * dt;
    for (let i = R.length - 2; i >= 0; i--) {
      const a = R[i], b = R[i + 1];
      a.x += (b.x - (a.end ? 14 : 7) - a.w - a.x) * Math.min(1, dt * 18);
    }
    R.forEach((it) => {
      it.y += (it.ty - it.y) * Math.min(1, dt * 14);
      place(it);
    });
    while (R.length && R[0].x + R[0].w < -20) R.shift().el.remove();
  }
  function fxCorrect(it) {
    return;
    const cx = it.x + it.w / 2, cy = it.y, b = document.createElement("div");
    b.className = "burst";
    b.style.left = cx + "px";
    b.style.top = cy + "px";
    const col = RUN.combo >= 20 ? "var(--gold)" : it.lane ? "var(--dn)" : "var(--up)";
    b.innerHTML = Array.from({ length: 10 }, (_, k) => {
      const a = k / 10 * 6.283, r = 34 + rnd(24);
      return `<i style="--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r).toFixed(0)}px;background:${col}"></i>`;
    }).join("");
    $("fx").appendChild(b);
    setTimeout2(() => b.remove(), 520);
  }
  function init_play() {
    $("btnPause").onclick = () => pause();
    $("rep").addEventListener("pointerdown", repTap);
    $("side").addEventListener("pointerdown", (e) => {
      if (e.target.closest(".ch")) LASTCH = performance.now();
    }, true);
    initWDB();
    window.__G = () => G;
    addEventListener2("resize", () => {
      if (G && !$("sPlay").hidden) layout();
    });
    onDoc("pointerdown", () => {
      if (WANTF && !isFull()) goFull();
    }, true);
    onDoc("fullscreenchange", () => {
      ENV.root.classList.toggle("fsb", !!document.fullscreenElement);
      if (G && !$("sPlay").hidden) setTimeout2(layout, 50);
    });
    addEventListener2("keydown", (e) => {
      if ($("sPlay").hidden || !G) return;
      const m = { "1": [0, 0], "2": [0, 1], "q": [0, 2], "w": [0, 3], "9": [1, 0], "0": [1, 1], "o": [1, 2], "p": [1, 3] }[e.key];
      if (m) press(m[0], m[1]);
      if (e.key === "Escape" || e.key === " ") pause();
    });
    if (!layout.__rep) {
      const L0 = layout;
      layout = function() {
        L0.apply(this, arguments);
        try {
          posRep();
        } catch (e) {
        }
      };
      layout.__rep = 1;
      const R0 = renderGrid;
      renderGrid = function(l) {
        R0.apply(this, arguments);
        if (l === 1) try {
          posRep();
        } catch (e) {
        }
      };
    }
  }
  function pause() {
    if (!RUN || PAUSED || $("sPlay").hidden) return;
    PAUSED = true;
    hush();
    if (AC) AC.suspend();
    overlay(`<div class="sheet"><h3>\u4E00\u6642\u505C\u6B62</h3><button class="sbtn pri" id="pRes">\u3064\u3065\u3051\u308B</button>${!isFull() && canFull() ? '<button class="sbtn" id="pFull">\u5168\u753B\u9762\u306B\u3059\u308B</button>' : ""}<div class="row2"><button class="sbtn" id="pRe">\u6700\u521D\u304B\u3089\u3084\u308A\u76F4\u3059</button><button class="sbtn" id="pQuit">\u3084\u3081\u308B</button></div></div>`, (b) => {
      const go = () => {
        closeOv();
        PAUSED = false;
        if (AC) AC.resume();
        LAST = performance.now();
      };
      b.querySelector("#pRes").onclick = go;
      const pf = b.querySelector("#pFull");
      if (pf) pf.onclick = () => {
        goFull();
        go();
      };
      b.querySelector("#pRe").onclick = () => {
        go();
        const f = RUN.from;
        endRun();
        startRun(f);
      };
      b.querySelector("#pQuit").onclick = () => {
        go();
        endRun();
        bgmStart(84, "menu");
        if (CUR2 && CUR2.word) {
          renderWords();
          show("sWords");
        } else {
          renderDetail();
          show("sDetail");
        }
      };
    });
  }
  function endRun() {
    cancelAnimationFrame(RAF);
    hush();
    bgmStop();
    if (G) G.over = true;
    G = null;
    RUN = null;
    $("arena").querySelectorAll(".inter,.cpop").forEach((e) => e.remove());
  }
  function rankOf(acc, time, par) {
    const rank = acc >= 0.95 && time <= par ? "S" : acc >= 0.85 && time <= par * 1.35 ? "A" : acc >= 0.7 ? "B" : "C";
    return { rank, stars: acc < 0.6 ? 0 : rank === "S" ? 3 : acc >= 0.8 ? 2 : 1 };
  }
  function stageEnd() {
    const g = G;
    g.over = true;
    g.started = false;
    hush();
    try {
      bkBurst(true);
    } catch (e) {
    }
    const acc = g.first / g.total, time = g.t + g.pen, par = g.total * PAR[g.st] * (1 + (g.p.lv - 1) * 0.15), { rank, stars } = rankOf(acc, time, par);
    RUN.res.push({ st: g.st, acc, time, par, rank, stars, total: g.total, first: g.first });
    const prev = rec(g.p.id, g.st, "ta");
    if (!prev || stars > prev.stars || stars === prev.stars && time < prev.time) {
      const b = SV.best[g.p.id] = SV.best[g.p.id] || {};
      b[g.st] = b[g.st] || {};
      b[g.st].ta = { time: +time.toFixed(2), acc, stars: Math.max(stars, prev ? prev.stars : 0), rank };
    }
    save();
    const rc = { S: "var(--gold)", A: "var(--accent)", B: "var(--great)", C: "var(--muted)" }[rank];
    setTimeout2(() => {
      if (RUN && G === g) {
        $("layer").querySelectorAll(".card:not(.rib)").forEach((e) => e.remove());
        inter(`<div class="sub">STAGE ${g.st} CLEAR</div><div class="big" style="color:${rc}">${rank}</div><div class="stars2">${[0, 1, 2].map((i) => `<span class="${i < stars ? "on" : ""}">\u2605</span>`).join("")}</div><div class="note">${time.toFixed(1)}\u79D2 \u30FB \u4E00\u767A\u6B63\u89E3 ${Math.round(acc * 100)}%</div>`, 1300);
        SE.clear();
        for (let i = 0; i < stars; i++) setTimeout2(() => SE.star(i), 250 + i * 150);
        setTimeout2(() => {
          if (!RUN || G !== g) return;
          if (g.st < 4 && !g.p.word) beginStage(g.st + 1);
          else finalResult();
        }, 1300);
      }
    }, 200);
  }
  function finalResult() {
    const r = RUN, p = r.p;
    const T = r.res.reduce((a, x) => a + x.time, 0), par = r.res.reduce((a, x) => a + x.par, 0), tot = r.res.reduce((a, x) => a + x.total, 0), fst = r.res.reduce((a, x) => a + x.first, 0), acc = fst / tot;
    const { rank } = rankOf(acc, T, par);
    let isNew = false;
    if (r.from === 1) {
      const b = SV.best[p.id] = SV.best[p.id] || {};
      if (!b.run || T < b.run.time) {
        isNew = !!b.run;
        b.run = { time: +T.toFixed(2), rank };
      }
      save();
    }
    bgmStop();
    voice(rank === "S" ? "perfect" : "stage_clear");
    const rc = { S: "var(--gold)", A: "var(--accent)", B: "var(--great)", C: "var(--muted)" }[rank];
    $("resRank").textContent = rank;
    $("resRank").style.setProperty("--rc", rc);
    $("resLab").textContent = p.word ? "\u5358\u8A9E\u7DF4\u7FD2" : r.from === 1 ? "\u901A\u3057\u30AF\u30EA\u30A2" : `STAGE ${r.from} \u304B\u3089`;
    $("resTitle").textContent = p.title;
    $("resTot").innerHTML = `${T.toFixed(1)}<small style="font-size:13px">s</small>${isNew ? '<span class="newrec">NEW RECORD</span>' : ""}<div class="sub2">\u4E00\u767A\u6B63\u89E3 ${Math.round(acc * 100)}%\u30FB\u6700\u5927 ${r.maxc}\u30B3\u30F3\u30DC</div>`;
    $("resChara").src = chara(rank === "S" || rank === "A" ? "joy" : rank === "B" ? "normal" : "think");
    $("resStages").innerHTML = r.res.map((x) => `<div><span>${x.st}. ${STAGES[x.st - 1].name}</span><b style="color:${{ S: "var(--gold)", A: "var(--accent)", B: "var(--great)", C: "var(--muted)" }[x.rank]}">${x.rank}</b><span class="s">${"\u2605".repeat(x.stars)}<span style="color:var(--line)">${"\u2605".repeat(3 - x.stars)}</span></span><span class="n">${x.time.toFixed(1)}s</span></div>`).join("");
    const rv = r.review;
    $("review").innerHTML = rv.length ? `<h4>\u307E\u3061\u304C\u3048\u305F\u30FB\u6642\u9593\u5207\u308C\uFF08${rv.length}\uFF09</h4>` + rv.map((x, k) => {
      const it = x.it, c = it.ci != null ? p.chunks[it.ci] : null;
      const e = it.kind === 1 ? `<b>${esc2(it.en)}</b>` : it.kind === 2 ? esc2(it.en) : chunkHTML(c, it.gs, it.ge, it.ans);
      const j = it.kind === 1 ? it.ans : c.ja;
      return `<div class="rv"><div><div class="e">${e}</div><div class="j">${esc2(j)}</div></div><button data-k="${k}" aria-label="\u805E\u304F">\u{1F50A}</button></div>`;
    }).join("") : `<h4>\u30DF\u30B9\u306A\u3057\uFF01 \u6B21\u306F\u30BF\u30A4\u30E0\u3092\u7E2E\u3081\u3088\u3046</h4>`;
    $("review").querySelectorAll("button").forEach((b) => b.onclick = () => {
      const it = rv[+b.dataset.k].it;
      say(it.kind === 1 ? it.en : plain(p.chunks[it.ci]));
    });
    $("resBtns").innerHTML = `<button class="sbtn pri" id="rRe">\u3082\u3046\u4E00\u5EA6</button><button class="sbtn" id="rRead">\u{1F4D6} \u632F\u308A\u8FD4\u308A\uFF1A\u672C\u6587\u3092\u8AAD\u3080</button><button class="sbtn" id="rBack">\u3082\u3069\u308B</button>`;
    $("rRe").onclick = () => {
      SE.tap();
      startRun(1);
    };
    $("rRead").onclick = () => openReading("post");
    $("rBack").onclick = () => {
      SE.tap();
      bgmStart(84, "menu");
      renderDetail();
      show("sDetail");
    };
    if (p.word) {
      $("rRead").remove();
      $("rBack").onclick = () => {
        SE.tap();
        bgmStart(84, "menu");
        renderWords();
        show("sWords");
      };
    }
    cancelAnimationFrame(RAF);
    G = null;
    RUN = null;
    show("sResult");
  }

  // core/coach.js
  var NAME = { g: "\u5973\u306E\u5B50", b: "\u7537\u306E\u5B50" };
  var defFace = (w, f) => `g/chunkchunk/img/chara/${w === "b" ? "boy" : "girl"}/${f || "normal"}.webp`;
  function runCoach(steps, opt = {}) {
    if (!steps || !steps.length) {
      opt.onDone && opt.onDone(true);
      return { stop() {
      } };
    }
    const faceOf = opt.face || defFace;
    let i = 0, done = false, timer = 0;
    const ov = document.createElement("div");
    ov.className = "cc-coach";
    ov.innerHTML = '<div class="cc-dim"></div><div class="cc-hole" hidden></div><div class="cc-hole two" hidden></div><div class="cc-box"><img class="cf" alt=""><div class="cn"></div><div class="ct"></div><button class="cskip">\u3068\u3070\u3059</button><button class="cnx">\u3064\u304E\u3078 \u25B6</button><div class="cwt" hidden>\u3084\u3063\u3066\u307F\u3088\u3046</div></div>';
    document.body.appendChild(ov);
    const q = (s) => ov.querySelector(s), hole = q(".cc-hole"), hole2 = q(".cc-hole.two"), box = q(".cc-box"), img = q(".cf");
    img.onerror = () => {
      img.hidden = true;
      box.classList.add("nofc");
    };
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      removeEventListener("resize", place2);
      ov.remove();
      opt.onDone && opt.onDone(ok);
    };
    const target = () => {
      const s = steps[i];
      if (!s || !s.sel) return null;
      try {
        return document.querySelector(s.sel);
      } catch (e) {
        return null;
      }
    };
    const ring = (h, el, free) => {
      const r = el && el.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) {
        h.hidden = true;
        return false;
      }
      const p = 6;
      h.hidden = false;
      h.style.cssText = `left:${r.left - p}px;top:${r.top - p}px;width:${r.width + p * 2}px;height:${r.height + p * 2}px`;
      h.classList.toggle("free", free);
      return true;
    };
    function place2() {
      const s = steps[i], free = !!s.wait;
      let el2 = null;
      if (s.also) {
        try {
          el2 = document.querySelector(s.also);
        } catch (e) {
        }
      }
      const ok = ring(hole, target(), free);
      ring(hole2, el2, true);
      ov.classList.toggle("has", ok);
      ov.classList.toggle("free", free);
      const r = ok && target().getBoundingClientRect();
      box.classList.toggle("top", free || !!(r && r.top + r.height / 2 > innerHeight * 0.55));
    }
    function show2() {
      const s = steps[i];
      const u = faceOf(s.w, s.f);
      if (u) {
        img.hidden = false;
        box.classList.remove("nofc");
        img.src = u;
      } else {
        img.hidden = true;
        box.classList.add("nofc");
      }
      const nm = q(".cn");
      nm.textContent = NAME[s.w] || NAME.g;
      nm.className = "cn " + (s.w || "g");
      q(".ct").textContent = s.t;
      ov.classList.toggle("pass", !!s.wait);
      q(".cnx").hidden = !!s.wait;
      q(".cwt").hidden = !s.wait;
      q(".cnx").textContent = i === steps.length - 1 ? "\u304A\u308F\u308A \u2713" : "\u3064\u304E\u3078 \u25B6";
      place2();
      box.classList.remove("pop");
      void box.offsetWidth;
      box.classList.add("pop");
    }
    function next() {
      if (done) return;
      i++;
      if (i >= steps.length) return finish(true);
      show2();
    }
    q(".cnx").onclick = (e) => {
      e.stopPropagation();
      next();
    };
    q(".cskip").onclick = (e) => {
      e.stopPropagation();
      finish(false);
    };
    box.onclick = (e) => {
      if (e.target.closest("button")) return;
      if (!steps[i].wait) next();
    };
    addEventListener("resize", place2);
    timer = setInterval(() => {
      place2();
      const s = steps[i];
      if (s && s.wait && !s._ok) {
        try {
          if (s.wait()) {
            s._ok = 1;
            setTimeout(next, 600);
          }
        } catch (e) {
        }
      }
    }, 250);
    show2();
    return { stop() {
      finish(false);
    } };
  }

  // games/stream/src/tutorial.js
  var TUT = {
    intro: [
      { w: "g", f: "joy", t: "\u30C1\u30E3\u30F3\u30AF\u30B9\u30C8\u30EA\u30FC\u30E0\u3078\u3088\u3046\u3053\u305D\uFF01" },
      { w: "b", t: "\u82F1\u8A9E\u304C\u6D41\u308C\u3066\u304F\u308B\u3088\u3002\u6587\u5B57\u3088\u308A\u300C\u805E\u3044\u305F\u97F3\u300D\u3067\u5224\u65AD\u3059\u308B\u30B2\u30FC\u30E0\u3060\u3088\u3002" },
      { w: "g", t: "\u30B9\u30C6\u30FC\u30B8\u306F4\u3064\u3002\u5358\u8A9E \u2192 \u30C1\u30E3\u30F3\u30AF \u2192 \u7A74\u3046\u3081 \u2192 \u9577\u6587\u306E\u9806\u306B\u9032\u3080\u3088\u3002" },
      { w: "b", t: "\u3072\u3068\u3064\u306E\u9577\u6587\u304B\u3089\u554F\u984C\u304C\u51FA\u3066\u304F\u308B\u304B\u3089\u30013\u30B9\u30C6\u30FC\u30B8\u307E\u3067\u306F\u7269\u8A9E\u3092\u60F3\u50CF\u3057\u306A\u304C\u3089\u554F\u984C\u3092\u89E3\u3044\u3066\u3044\u3053\u3046\uFF01" },
      { w: "g", f: "idea", t: "\u6700\u5F8C\u306E\u30B9\u30C6\u30FC\u30B8\u306F\u9577\u6587\u3092\u305D\u306E\u307E\u307E\u8AAD\u3093\u3067\u3044\u304F\u304B\u3089\u3001\u6B21\u306E\u5C55\u958B\u3092\u4E88\u60F3\u3057\u3066\u7B54\u3048\u3066\u306D\u3002" }
    ],
    1: [
      { w: "g", t: "\u30B9\u30C6\u30FC\u30B81\u306F\u300C\u5358\u8A9E\u30C0\u30C3\u30B7\u30E5\u300D\u3002\u6D41\u308C\u3066\u304F\u308B\u5358\u8A9E\u306E\u97F3\u3092\u805E\u3044\u3066\u306D\u3002" },
      { w: "b", t: "\u805E\u3053\u3048\u305F\u5358\u8A9E\u306E\u610F\u5473\u3092\u30014\u629E\u304B\u3089\u9078\u307C\u3046\u3002" },
      { w: "g", t: "\u4E0A\u3092\u6D41\u308C\u308B\u5358\u8A9E\u306F\u4E0A\u306E4\u629E\u3001\u4E0B\u3092\u6D41\u308C\u308B\u5358\u8A9E\u306F\u4E0B\u306E4\u629E\u3067\u7B54\u3048\u308B\u3088\u3002" },
      { w: "b", f: "idea", t: "\u6587\u5B57\u3092\u76EE\u3067\u8FFD\u3046\u3088\u308A\u3001\u300C\u97F3\u300D\u3067\u5224\u65AD\u3059\u308B\u306E\u304C\u30B3\u30C4\uFF01" }
    ],
    2: [
      { w: "g", t: "\u30B9\u30C6\u30FC\u30B82\u306F\u300C\u30C1\u30E3\u30F3\u30AF\u30AD\u30E3\u30C3\u30C1\u300D\u3002\u30C1\u30E3\u30F3\u30AF\u306F\u3001\u610F\u5473\u306E\u304B\u305F\u307E\u308A\u306E\u3053\u3068\u3060\u3088\u3002" },
      { w: "b", t: "\u4ECA\u5EA6\u306F\u3001\u304B\u305F\u307E\u308A\u306E\u97F3\u3092\u805E\u3044\u3066\u3001\u610F\u5473\u3092\u9078\u307C\u3046\u3002" },
      { w: "g", f: "idea", t: "1\u8A9E\u305A\u3064\u3058\u3083\u306A\u304F\u3001\u304B\u305F\u307E\u308A\u3067\u805E\u304F\u306E\u304C\u30DD\u30A4\u30F3\u30C8\u3002" }
    ],
    3: [
      { w: "b", t: "\u30B9\u30C6\u30FC\u30B83\u306F\u300C\u30C1\u30E3\u30F3\u30AF\u30D1\u30BA\u30EB\u300D\u3002\u4E0A\u306E\u65E5\u672C\u8A9E\u306B\u5408\u3046\u3088\u3046\u306B\u3001\u6B20\u3051\u305F1\u8A9E\u3092\u9078\u3093\u3067\u7A74\u3092\u57CB\u3081\u308B\u3088\u3002" },
      { w: "g", f: "idea", t: "\u3069\u3053\u304C\u7A74\u306B\u306A\u308B\u304B\u306F\u3001\u904A\u3076\u305F\u3073\u306B\u30E9\u30F3\u30C0\u30E0\u3002\u6BCE\u56DE\u3061\u304C\u3046\u554F\u984C\u306B\u306A\u308B\u3088\u3002" }
    ],
    4: [
      { w: "g", t: "\u30B9\u30C6\u30FC\u30B84\u306F\u300C\u30ED\u30F3\u30B0\u30B9\u30C8\u30EA\u30FC\u30E0\u300D\u3002\u9577\u6587\u3092\u3001\u6700\u521D\u304B\u3089\u8AAD\u3093\u3067\u3044\u304F\u3088\u3002" },
      { w: "b", t: "\u30C1\u30E3\u30F3\u30AF\u3092\u9806\u756A\u306B\u3064\u306A\u3044\u3067\u3001\u7269\u8A9E\u3092\u5B8C\u6210\u3055\u305B\u3088\u3046\uFF01" },
      { w: "g", f: "joy", t: "\u5149\u3063\u3066\u3044\u308B\u5074\u306E4\u629E\u3067\u7B54\u3048\u3066\u306D\u3002" }
    ]
  };

  // games/stream/src/screens.js
  var SCR = ["sTitle", "sHome", "sWords", "sDetail", "sReader", "sPlay", "sResult"];
  function show(id) {
    SCR.forEach((s) => $(s).hidden = s !== id);
    ENV.ctx.showBack(id !== "sPlay");
  }
  var CUR2 = null;
  var P = (id) => PASSAGES.find((p) => p.id === id);
  function plain(c) {
    return c.tk.map((t) => t[0] + t[1] + t[2]).join(" ");
  }
  function fromGap(c, gs) {
    return c.tk.slice(gs).map((t) => t[0] + t[1] + t[2]).join(" ");
  }
  var reached = (pid, st) => st === 1 || !!rec(pid, st - 1, "ta");
  function applyFs() {
    if (SV.set.spd == null) SV.set.spd = 0.5;
    if (SV.set.fs == null) SV.set.fs = 1.2;
    ENV.root.style.setProperty("--fs", SV.set.fs || 1.2);
  }
  function renderHome() {
    $("tabs").innerHTML = [1, 2, 3].map((l) => `<button class="tab ${SV.lv === l ? "on" : ""}" style="--lc:${LV[l].col}" data-lv="${l}"><b>${LV[l].name}</b><small>${LV[l].sub}</small></button>`).join("");
    $("tabs").querySelectorAll(".tab").forEach((b) => b.onclick = () => {
      SE.tap();
      SV.lv = +b.dataset.lv;
      save();
      renderHome();
    });
    $("plist").innerHTML = PASSAGES.filter((p) => p.lv === SV.lv).map((p) => {
      const wc = p.chunks.reduce((a, c) => a + c.tk.length, 0);
      return `<button class="pcard" style="--lc:${LV[p.lv].col}" data-id="${p.id}"><span class="tg">${esc2(p.tag)}</span><span class="t">${esc2(p.title)}</span><span class="j">${esc2(p.ja)}</span>
    <span class="meta"><span class="en">${wc} words</span><span>${p.chunks.length}\u30C1\u30E3\u30F3\u30AF</span><span class="sp"></span><span class="steps4">${[1, 2, 3, 4].map((s) => `<i class="s${starsOf(p.id, s)}"></i>`).join("")}</span></span></button>`;
    }).join("");
    const wn = WORDS[SV.lv].length, ws = WSET[SV.lv];
    $("plist").insertAdjacentHTML("afterbegin", `<button class="pcard wcard" style="--lc:${LV[SV.lv].col}" id="btnWords"><span class="tg">\u5358\u8A9E\u30FB\u719F\u8A9E\u30FB\u5358\u8A9E\u96C6</span><span class="t">${LV[SV.lv].name}\u306E\u5358\u8A9E ${wn}\u8A9E</span><span class="j">${ws}\u8A9E\u305A\u3064\u30FB${Math.ceil(wn / ws)}\u30BB\u30C3\u30C8\u3000\u805E\u3044\u3066\u3001\u610F\u5473\u3092\u9078\u3076</span></button>`);
    $("btnWords").onclick = () => {
      SE.tap();
      renderWords();
      show("sWords");
    };
    $("plist").querySelectorAll(".pcard[data-id]").forEach((b) => b.onclick = () => {
      SE.tap();
      CUR2 = P(b.dataset.id);
      renderDetail();
      show("sDetail");
    });
  }
  function renderDetail() {
    const p = CUR2;
    $("dTag").textContent = `${LV[p.lv].name}\u30FB${p.tag.split("\u30FB")[1] || ""}`;
    $("dTitle").textContent = p.title;
    $("dJa").textContent = p.ja;
    const rb = (SV.best[p.id] || {}).run;
    $("dRun").innerHTML = rb ? `\u901A\u3057\u306E\u30D9\u30B9\u30C8 <b>${rb.time.toFixed(1)}s</b>\u3000\u30E9\u30F3\u30AF ${rb.rank}` : "4\u30B9\u30C6\u30FC\u30B8\u3092\u7D9A\u3051\u3066\u904A\u3073\u307E\u3059\u3002\u9014\u4E2D\u306E\u6BB5\u304B\u3089\u59CB\u3081\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059";
    $("stages").innerHTML = STAGES.map((s) => {
      const lk = !reached(p.id, s.id), r = rec(p.id, s.id, "ta"), st = starsOf(p.id, s.id);
      return `<button class="st ${lk ? "lock" : ""}" data-st="${s.id}"><span class="no">${lk ? "\u{1F512}" : s.id}</span><span><div class="nm">${s.name}</div><div class="ds">${lk ? "\u3072\u3068\u3064\u524D\u306E\u30B9\u30C6\u30FC\u30B8\u307E\u3067\u9032\u3080\u3068\u3001\u3053\u3053\u304B\u3089\u59CB\u3081\u3089\u308C\u307E\u3059" : s.desc}</div></span>
    <span class="rec">${r ? `<b>${r.rank || "-"}</b>${r.time.toFixed(1)}s` : ""}<span class="stars">${[0, 1, 2].map((i) => `<span class="${i < st ? "on" : ""}">\u2605</span>`).join("")}</span></span></button>`;
    }).join("");
    $("stages").querySelectorAll(".st").forEach((b) => b.onclick = () => {
      const s = +b.dataset.st;
      if (!reached(p.id, s)) {
        SE.ng();
        toast("\u3072\u3068\u3064\u524D\u306E\u30B9\u30C6\u30FC\u30B8\u307E\u3067\u9032\u3080\u3068\u958B\u304D\u307E\u3059");
        return;
      }
      SE.tap();
      startRun(s);
    });
  }
  var isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  var canFull = () => {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen);
  };
  var WANTF = false;
  function goFull() {
    if (!canFull()) return false;
    WANTF = true;
    if (isFull()) return false;
    const d = document.documentElement;
    try {
      const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: "hide" });
      p && p.catch && p.catch(() => {
      });
    } catch (e) {
    }
    return true;
  }
  function toggleFull() {
    if (isFull()) {
      WANTF = false;
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (!canFull()) {
      toast("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F\u5168\u753B\u9762\u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\uFF08\u30A2\u30D7\u30EA\u7248\u3067\u306F\u5168\u753B\u9762\u306B\u306A\u308A\u307E\u3059\uFF09");
      return;
    }
    goFull();
  }
  function openReading(from) {
    const t = typeof LS_TEXTS !== "undefined" ? LS_TEXTS[CUR2.id] : null;
    SE.tap();
    if (!t) {
      renderReader();
      show("sReader");
      return;
    }
    bgmStop();
    ENV.core.reader.open(
      { title: t.title, list: t.list, level: t.level, questions: t.q || [] },
      { label: from === "post" ? "\u632F\u308A\u8FD4\u308A" : "\u4E88\u7FD2", backLabel: from === "post" ? "\u2190 \u7D50\u679C\u3078" : "\u2190 \u3082\u3069\u308B", onClose: () => bgmStart(84, "menu") }
    );
  }
  function renderReader() {
    const p = CUR2;
    $("rTitle").textContent = p.title;
    $("reader").innerHTML = p.chunks.map((c, i) => {
      const [gs, ge] = c.g;
      const e = c.tk.map((t, j) => esc2(t[0]) + (j >= gs && j < ge ? `<b>${esc2(t[1])}</b>` : esc2(t[1])) + esc2(t[2])).join(" ");
      return `<button class="rc" data-i="${i}"><span class="e">${e}</span><span class="jj">${esc2(c.ja)}</span></button>`;
    }).join("");
    $("reader").querySelectorAll(".rc").forEach((b) => b.onclick = () => {
      ac();
      $("reader").querySelectorAll(".rc").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      say(plain(p.chunks[+b.dataset.i]));
    });
  }
  function toast(t) {
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = t;
    $("app").appendChild(d);
    setTimeout2(() => d.remove(), 1700);
  }
  function overlay(html, bind) {
    $("ovBody").innerHTML = html;
    $("ov").hidden = false;
    bind && bind($("ovBody"));
  }
  function closeOv() {
    $("ov").hidden = true;
    $("ovBody").innerHTML = "";
  }
  function openSettings() {
    const segs = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(SV.set[k]) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    overlay(`<div class="sheet wide"><h3>\u8A2D\u5B9A</h3><div class="setgrid">
   <div class="set">\u30CA\u30D3${segs("nav", [["girl", "\u30E2\u30E2"], ["boy", "\u30BD\u30E9"]])}</div>
   <div class="set">\u6587\u5B57\u306E\u5927\u304D\u3055${segs("fs", [[1, "\u5C0F"], [1.2, "\u4E2D"], [1.4, "\u5927"], [1.6, "\u7279\u5927"]])}</div>
   <div class="set">\u6D41\u308C\u308B\u901F\u3055${segs("spd", [[0.35, "\u8D85\u9045"], [0.5, "\u9045\u3044"], [0.7, "\u666E\u901A"], [1, "\u901F\u3044"]])}</div>
   <div class="set">\u97F3\u30FB\u8AAD\u307F\u4E0A\u3052<button class="sbtn" id="setSound">\u5171\u901A\u306E\u8A2D\u5B9A\u3092\u958B\u304F</button></div>
   <div class="set">\u9577\u6587\u5B8C\u6210\u306E\u65E5\u672C\u8A9E${segs("jp4", [[1, "\u51FA\u3059"], [0, "\u51FA\u3055\u306A\u3044"]])}</div>
   </div><div class="row2"><button class="sbtn" id="setReset">\u8A18\u9332\u3092\u30EA\u30BB\u30C3\u30C8</button><button class="sbtn pri" id="setClose">\u3068\u3058\u308B</button></div></div>`, (b) => {
      b.querySelectorAll(".seg").forEach((sg) => sg.querySelectorAll("button").forEach((x) => x.onclick = () => {
        const k = sg.dataset.k, v = x.dataset.v;
        SV.set[k] = k === "nav" ? v : +v;
        save();
        SE.tap();
        applyFs();
        sg.querySelectorAll("button").forEach((y) => y.classList.toggle("on", y === x));
        $("heroChara").src = chara("joy");
      }));
      b.querySelector("#setSound").onclick = () => {
        SE.tap();
        ENV.core.ui.settings();
      };
      b.querySelector("#setClose").onclick = () => {
        SE.tap();
        closeOv();
        renderHome();
      };
      const r = b.querySelector("#setReset");
      r.onclick = () => {
        if (r.dataset.c) {
          SV.best = {};
          save();
          toast("\u8A18\u9332\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F");
          closeOv();
          renderHome();
        } else {
          r.dataset.c = 1;
          r.textContent = "\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u30EA\u30BB\u30C3\u30C8";
          r.style.color = "var(--bad)";
        }
      };
    });
  }
  function init_screens() {
    (function() {
      const all = PASSAGES.flatMap((p) => p.chunks.map(plain));
      const pick = (n) => shuf(all).slice(0, n).map((t, i) => `<span class="${i % 5 === 2 ? "h" : ""}">${esc2(t)}</span>`).join("");
      ["rv1", "rv2"].forEach((id) => {
        const h = pick(9);
        $(id).innerHTML = h + h;
      });
    })();
    applyFs();
    $("heroChara").src = chara("joy");
    $("btnStart").onclick = () => {
      goFull();
      ac();
      SE.tap();
      bgmStart(84, "menu");
      renderHome();
      show("sHome");
    };
    $("btnFull").onclick = () => {
      SE.tap();
      toggleFull();
    };
    $("btnRun").onclick = () => {
      SE.tap();
      startRun(1);
    };
    $("modeRh").onclick = () => {
      SE.tap();
      toast("\u30EA\u30BA\u30E0\u30E2\u30FC\u30C9\u306F\u6E96\u5099\u4E2D\u3067\u3059");
    };
    $("btnRead").onclick = () => openReading("pre");
    const how = () => {
      SE.tap();
      if (!SV.howSeen) {
        SV.howSeen = 1;
        save();
      }
      runCoach([...TUT.intro, ...TUT[1], ...TUT[2], ...TUT[3], ...TUT[4]], { face: tutFace });
    };
    $("btnHow").onclick = how;
    $("btnHowT").onclick = how;
    if (!SV.howSeen) {
      const bs = $("btnStart");
      bs.parentNode.insertBefore($("btnHowT"), bs);
    }
    document.querySelectorAll("[data-back]").forEach((b) => b.onclick = () => {
      SE.tap();
      hush();
      if (b.dataset.back === "home") {
        renderHome();
        show("sHome");
      } else {
        renderDetail();
        show("sDetail");
      }
    });
    $("btnJp").onclick = () => {
      $("btnJp").classList.toggle("on");
      $("reader").classList.toggle("nojp");
    };
    $("btnReadAll").onclick = () => {
      ac();
      say(CUR2.chunks.map(plain).join(" "));
    };
    $("btnSettings").onclick = () => {
      SE.tap();
      openSettings();
    };
  }

  // games/stream/game.js
  var FONT2 = "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;700;800&family=Lexend:wght@400;500;600;700&display=swap";
  var game_default = {
    id: "stream",
    name: "\u30C1\u30E3\u30F3\u30AF\u30B9\u30C8\u30EA\u30FC\u30E0",
    right: "game:stream",
    async mount(el, ctx) {
      for (const f of ["data.js", "pool.js", "words.js", "texts.js"]) await ctx.loadScript(ctx.base + f);
      if (!document.querySelector('link[data-ct="stream"]')) {
        const lk = document.createElement("link");
        lk.rel = "stylesheet";
        lk.href = FONT2;
        lk.dataset.ct = "stream";
        document.head.appendChild(lk);
      }
      Object.assign(ENV, { root: el, ctx, core: ctx.core, base: ctx.base, offs: [] });
      el.classList.add("ct-stream");
      el.innerHTML = stream_default.replace(/(src|href)="(img|audio)\//g, (m, at, d) => `${at}="${ctx.base}${d}/`);
      loadSave();
      init_screens();
      init_play();
      init_fx();
      ctx.showBack(true);
      return {
        unmount() {
          try {
            ctx.core.reader.close();
          } catch (e) {
          }
          try {
            endRun();
          } catch (e) {
          }
          try {
            hush();
          } catch (e) {
          }
          try {
            bgmStop();
          } catch (e) {
          }
          try {
            if (document.fullscreenElement) document.exitFullscreen();
          } catch (e) {
          }
          stopAll();
          el.innerHTML = "";
        }
      };
    }
  };

  // games/index.js
  var GAMES = { stream: game_default };

  // apps/solo/main.js
  var app = window.__APP__;
  var core = createCore({ ...app, backButton: false });
  document.body.style.background = "#0b1626";
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
