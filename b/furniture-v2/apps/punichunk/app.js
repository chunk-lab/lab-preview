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
    let voice = null;
    const pick = () => {
      try {
        const vs = speechSynthesis.getVoices() || [], en = vs.filter((x) => /^en[-_]?/i.test(x.lang || ""));
        voice = en.find((x) => /US/i.test(x.lang)) || en[0] || null;
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
          if (voice) u.voice = voice;
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
        return voice;
      }
    };
  }

  // core/sound.js
  function createSound(settings) {
    let ac = null, sfx = null, bgm = null;
    const ensure = () => {
      if (!ac) {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          sfx = ac.createGain();
          bgm = ac.createGain();
          sfx.connect(ac.destination);
          bgm.connect(ac.destination);
          apply();
        } catch (e) {
          ac = null;
        }
      }
      if (ac && ac.state === "suspended") ac.resume();
      return ac;
    };
    const apply = () => {
      if (!ac) return;
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
    const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
    const toast = (t) => {
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
      <label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input id="cs-name" maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc2(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D\uFF08\u3044\u307E\u306F\u4EEE\u306E\u7D75\uFF09\u3002\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u9805\u76EE\u3082\u3053\u308C\u304B\u3089\u6C7A\u3081\u307E\u3059\u3002</p>
      <ul class="cs-stat">${p.status().map((x) => `<li><span>${esc2(x.label)}</span><b>${esc2(x.value)}</b></li>`).join("")}</ul>`, (ov) => {
        ov.querySelector("#cs-name").onchange = (e) => p.setName(e.target.value);
      });
    };
    return { sheet, toast, settings, profile };
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
    const eq = (x, y) => x && y && x.si === y.si && x.a === y.a && x.b === y.b, W = (a, b) => sen.words.slice(a, b + 1).join(" ");
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
      return { mark: "x", why: `\u9577\u3044\uFF08\u4F59\u5206\uFF1A${W(bad[0], bad[bad.length - 1])} \uFF1D${br}\uFF09` };
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
    const save = () => store.set("settings", S);
    let cur = null;
    function open(story, opts = {}) {
      if (cur) cur.close(true);
      const root = document.createElement("div");
      root.className = "cs-reader";
      root.innerHTML = HTML;
      document.body.appendChild(root);
      const $ = (k) => root.querySelector(`[data-k="${k}"]`);
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
      const speak = (t) => core2.speech.speak(t, { rate: 0.9 });
      const stopSay = () => {
        core2.speech.stop();
        RD.saying = false;
        $("say").textContent = "\u{1F50A} \u805E\u304F";
      };
      const beep = (k) => {
        const s = core2.sound;
        ({ mini: () => s.beep(1250, 0.04, "triangle", 0.07), great: () => s.beep(988, 0.09, "sine", 0.13), excellent: () => {
          s.beep(880, 0.07, "sine", 0.14);
          setTimeout(() => s.beep(1320, 0.09, "sine", 0.12), 55);
        } }[k] || (() => {
        }))();
      };
      const lineX = () => Math.round($("lane").clientWidth * 0.34);
      const ro = new ResizeObserver(() => render(true));
      if (!dictReady) dict.ready().then(() => {
        dictReady = true;
        if (cur && cur.root === root) infoUI();
      }, () => {
      });
      const sheet = (html, closable = true) => {
        $("sheet").innerHTML = html;
        $("modal").hidden = false;
        $("modal").onclick = (e) => {
          if (closable && e.target === $("modal")) closeSheet();
        };
      };
      const closeSheet = () => {
        $("modal").hidden = true;
        $("sheet").innerHTML = "";
      };
      const ask = (msg, yes) => new Promise((ok) => {
        sheet(`<p class="note" style="white-space:pre-line;font-size:14px">${esc(msg)}</p><div class="btns"><button class="ghost" data-a="no">\u3084\u3081\u308B</button><button class="primary" data-a="yes">${esc(yes)}</button></div>`, false);
        $("sheet").querySelector("[data-a=no]").onclick = () => {
          closeSheet();
          ok(false);
        };
        $("sheet").querySelector("[data-a=yes]").onclick = () => {
          closeSheet();
          ok(true);
        };
      });
      function modeUI(v) {
        const hasQ = qs.length > 0;
        $("seg").hidden = test || !hasQ;
        $("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
        $("gram").hidden = v !== "read";
        $("gram").classList.toggle("on", !!RD.gramOn);
        $("jaBtn").hidden = v !== "read" || test || S.ja === false;
        $("jaBtn").classList.toggle("on", !!RD.showJa);
        $("hint").hidden = v !== "solve" || RD.hintPolicy === "none";
        $("hint").classList.toggle("on", !!RD.hintOn);
        $("hint").textContent = "\u{1F4A1}\u30D2\u30F3\u30C8" + (RD.hintCost ? `\uFF08\u2212${RD.hintCost}\u70B9\uFF09` : "");
        $("modeRow").hidden = [...$("modeRow").children].every((c) => c.hidden);
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
        const P = dict.POSN, base = e.w.toLowerCase() !== clean.toLowerCase() ? `<small class="riBase">\uFF08\u5143\u306E\u5F62 ${esc(e.w)}${e.neg ? "\uFF0Bnot" : ""}\uFF09</small>` : "";
        return `<div><span class="posTag">${P[main[0]] || main[0]}</span> <b>${esc(clean)}</b>${base}${ja ? ` \uFF1D ${esc(main[1])}` : ""}` + (rest.length ? `<div class="riNote">\u307B\u304B\u306B\uFF1A${rest.map(([t, m]) => (P[t] || t) + (ja ? `\uFF08${esc(m)}\uFF09` : "")).join("\u3001")}</div>` : "") + phH + "</div>";
      }
      function infoUI() {
        const el = $("info");
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
          speak(chunk ? u.text : sn.words[wi].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'’]+$/g, ""));
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
        $("sheet").querySelectorAll("select").forEach((s) => s.onchange = () => {
          const k = s.dataset.s, v = s.value;
          if (k === "lines") S.lines = +v;
          else if (k === "disp") S.disp = v;
          else {
            S[k] = v === "on";
            if (k === "always") RD.gramOn = S.always;
          }
          save();
        });
        $("sheet").querySelector("[data-a=close]").onclick = () => {
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
        const st = $("strip");
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
        $("cutline").style.left = lineX() + "px";
        const bar = $("bar");
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
        $("prevLine").innerHTML = ctxL(-1, "\u25B2").reverse().join("");
        $("nextLine").innerHTML = ctxL(1, "\u25BC").join("");
        $("lines").textContent = "\u8868\u793A " + S.lines;
        $("say").hidden = test;
        $("senNum").textContent = `${RD.si + 1} / ${sens.length} \u6587\u76EE`;
        $("up").disabled = RD.si === 0;
        $("down").disabled = RD.si === sens.length - 1;
        root.classList.toggle("vRead", v === "read");
        modeUI(v);
        infoUI();
        if (v === "read") {
          $("help").textContent = RD.gramOn ? `\u30C1\u30E3\u30F3\u30AF\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u5F79\u5272${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059` : `\u5358\u8A9E\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u54C1\u8A5E${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059\u3002\u300C\u30C1\u30E3\u30F3\u30AF\u300D\u3067\u30C1\u30E3\u30F3\u30AF\u3054\u3068\u306B\u898B\u3089\u308C\u307E\u3059`;
          return;
        }
        if (!q) {
          $("qNum").textContent = "";
          $("q").textContent = "\uFF08\u554F\u984C\u306A\u3057\uFF1A\u8AAD\u3080\u3060\u3051\uFF09";
          $("ans").textContent = "";
          $("choices").innerHTML = "";
          $("btns").innerHTML = "";
          $("help").textContent = "\u5DE6\u53F3\u30FB\u4E0A\u4E0B\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u8AAD\u3081\u307E\u3059";
          $("check").hidden = true;
          return;
        }
        $("check").hidden = false;
        $("qNum").textContent = `Q${RD.qi + 1} / ${qs.length}`;
        $("q").textContent = q.q;
        $("qPrev").disabled = RD.qi === 0;
        $("qNext").disabled = RD.qi === qs.length - 1;
        const answered = qs.filter((x) => x.ans).length;
        $("check").textContent = test ? `\u63D0\u51FA\u3059\u308B\uFF08${answered}/${qs.length}\u554F\uFF09` : `\u7B54\u3048\u5408\u308F\u305B\uFF08${answered}/${qs.length}\u554F\uFF09`;
        if (q.type === "choice") {
          $("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + q.options[q.ans.choice] : "";
          $("choices").innerHTML = q.options.map((o, i) => `<button data-c="${i}" class="${q.ans && q.ans.choice === i ? "on" : ""}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`).join("");
          $("choices").querySelectorAll("button").forEach((b) => b.onclick = () => {
            q.ans = { choice: +b.dataset.c };
            beep("mini");
            render(true);
            const qi = RD.qi;
            setTimeout(() => {
              if (RD.qi === qi) nextUnanswered();
            }, 350);
          });
          $("btns").innerHTML = "";
          $("help").textContent = "\u82F1\u6587\u3092\u8AAD\u3093\u3067\u3001\u9078\u629E\u80A2\u304B\u3089\u7B54\u3048\u3092\u9078\u307C\u3046";
          return;
        }
        $("choices").innerHTML = "";
        $("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + sens[q.ans.si].words.slice(q.ans.a, q.ans.b + 1).join(" ") : "";
        const help = RD.sel ? "\u3053\u306E\u7BC4\u56F2\u3067\u3044\u3044\uFF1F" : startOn ? "\u7B54\u3048\u306E\u7D42\u308F\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\u3053\u3053\u307E\u3067 \uFF3D\u300D" : "\u7B54\u3048\u306E\u59CB\u307E\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\uFF3B \u3053\u3053\u304B\u3089\u300D\uFF08\u30EC\u30FC\u30F3\u3092\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u52D5\u304B\u3059\uFF09";
        $("help").textContent = (RD.hintQ.has(RD.qi) && q.si != null ? `\u{1F4A1} \u7B54\u3048\u306F ${q.si + 1} \u6587\u76EE\u306B\u3042\u308B\u3088\u3002 ` : "") + help;
        $("btns").innerHTML = RD.sel ? '<button data-a="redo">\u9078\u3073\u306A\u304A\u3057</button><button data-a="ok" class="ok">\u6C7A\u5B9A</button>' : `${startOn ? '<button data-a="redo">\u3084\u3081\u308B</button>' : ""}<button data-a="cut" class="cutMain">${startOn ? "\u3053\u3053\u307E\u3067 \uFF3D" : "\uFF3B \u3053\u3053\u304B\u3089"}</button>`;
        const B = (a) => $("btns").querySelector(`[data-a=${a}]`);
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
        const lw = $("lane");
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
          if (to < 0) toast(test ? "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u63D0\u51FA\u3059\u308B\u300D\u3078" : "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3078");
        }
      }
      const qFlash = (d2) => $("q").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateX(${d2 * 30}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      const toast = (t) => {
        const el = $("help");
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
      function say() {
        if (test) return;
        if (RD.saying) {
          stopSay();
          return;
        }
        if (!core2.settings.get("voice")) {
          toast("\u8AAD\u307F\u4E0A\u3052\u304C\u30AA\u30D5\u306B\u306A\u3063\u3066\u3044\u307E\u3059\uFF08\u2699 \u8A2D\u5B9A\u3067\u5909\u3048\u3089\u308C\u307E\u3059\uFF09");
          return;
        }
        RD.saying = true;
        $("say").textContent = "\u25A0 \u6B62\u3081\u308B";
        core2.speech.speak(sen().en, { rate: 0.9, onend: () => {
          if (RD.saying) {
            RD.saying = false;
            $("say").textContent = "\u{1F50A} \u805E\u304F";
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
        $("lane").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateY(${d2 * 18}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      }
      const RV = { i: 0, on: false, tok: 0 };
      const rvStop = () => {
        RV.on = false;
        RV.tok++;
        core2.speech.stop();
      };
      const rvUI = () => {
        const b = $("sheet").querySelector("[data-a=rvPlay]");
        if (!b) return;
        b.textContent = RV.on ? "\u23F8 \u4E00\u6642\u505C\u6B62" : RV.i > 0 ? "\u25B6 \u3064\u3065\u304D" : "\u25B6 \u6700\u521D\u304B\u3089";
        $("sheet").querySelectorAll(".rvSen").forEach((el) => el.classList.toggle("on", RV.on && +el.dataset.i === RV.i));
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
        const el = $("sheet").querySelector(`.rvSen[data-i="${RV.i}"]`);
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
          $("sheet").querySelector("[data-a=go]").onclick = goUn;
          return;
        }
        if (test) {
          if (un.length) {
            const go = await new Promise((ok) => {
              sheet(`<h2>\u672A\u56DE\u7B54\u306E\u554F\u984C\u304C\u3042\u308A\u307E\u3059</h2><p class="note"><b>${names}</b> \u304C\u672A\u56DE\u7B54\u3067\u3059\u3002<br>\u672A\u56DE\u7B54\u306E\u554F\u984C\u306F\u70B9\u6570\u304C\u5165\u308A\u307E\u305B\u3093\u3002\u672C\u5F53\u306B\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F</p>${pendNote}
            <div class="btns"><button class="primary" data-a="go">\u672A\u56DE\u7B54\u306E\u554F\u984C\u3078</button><button class="ghost" data-a="force">\u305D\u308C\u3067\u3082\u63D0\u51FA\u3059\u308B</button></div>`);
              $("sheet").querySelector("[data-a=go]").onclick = () => ok(false);
              $("sheet").querySelector("[data-a=force]").onclick = () => ok(true);
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
          $("sheet").querySelector("[data-a=back]").onclick = () => close();
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
        const B = (a) => $("sheet").querySelector(`[data-a=${a}]`);
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
        $("sheet").querySelectorAll(".rvSen").forEach((el) => el.onclick = () => {
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
      const gest = $("gest");
      let d = null;
      $("set").onclick = settingsUI;
      $("lines").onclick = () => {
        S.lines = S.lines >= 3 ? 1 : S.lines + 1;
        save();
        render(true);
      };
      $("seg").querySelectorAll("button").forEach((b) => b.onclick = () => {
        S.view = b.dataset.v;
        save();
        RD.view = b.dataset.v;
        RD.sel = null;
        RD.start = null;
        RD.info = null;
        RD.hintOn = false;
        render(true);
      });
      $("gram").onclick = () => {
        RD.gramOn = !RD.gramOn;
        RD.info = null;
        render(true);
      };
      $("jaBtn").onclick = () => {
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
        d = { onBar, onLane: !onBar, wi: w ? [...$("strip").querySelectorAll(".w")].indexOf(w) : -1, x: e.clientX, y: e.clientY, g0: RD.gpos[RD.p], moved: false, axis: null };
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
            $("senNum").animate([{ color: "var(--accent)", transform: "scale(1.25)" }, { color: "var(--muted)", transform: "none" }], { duration: 500 });
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
      $("bar").addEventListener("input", (e) => move(+e.target.value, true));
      $("say").onclick = say;
      $("up").onclick = () => sentence(-1);
      $("down").onclick = () => sentence(1);
      $("qPrev").onclick = () => goQ(RD.qi - 1, -1);
      $("qNext").onclick = () => goQ(RD.qi + 1, 1);
      {
        const box = $("q").parentElement;
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
      $("back").textContent = opts.backLabel || "\u2190 \u3082\u3069\u308B";
      $("back").onclick = () => close();
      $("fontM").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i > 0) {
          S.font = FK[i - 1];
          save();
          applyFont();
          render(true);
        }
      };
      $("fontP").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i < FK.length - 1) {
          S.font = FK[i + 1];
          save();
          applyFont();
          render(true);
        }
      };
      $("hint").onclick = () => {
        if (RD.hintOn) {
          RD.hintOn = false;
          render(true);
          return;
        }
        const q = qs[RD.qi];
        if (q && q.type === "choice" && RD.hintPolicy !== "grammar") {
          toast("\u3053\u306E\u554F\u984C\u3067\u306F\u3001\u30D2\u30F3\u30C8\u306F\u4F7F\u3048\u307E\u305B\u3093");
          return;
        }
        RD.hintOn = RD.hintPolicy === "grammar";
        if (!RD.hintQ.has(RD.qi)) {
          RD.hintQ.add(RD.qi);
          RD.hints++;
        }
        render(true);
      };
      $("check").onclick = grade;
      $("title").textContent = `${opts.label ? opts.label + "\uFF5C" : test ? "TEST\uFF5C" : ""}${story.title || ""}${story.level && !opts.label ? `\uFF08Lv${story.level}\uFF09` : ""}`;
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
      ro.observe($("lane"));
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

  // games/punichunk/src/util.js
  var U = (function() {
    "use strict";
    function rng(seed) {
      var a = seed >>> 0 || 1;
      var f = function() {
        a |= 0;
        a = a + 1831565813 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
      f.int = function(n) {
        return Math.floor(f() * n);
      };
      f.pick = function(arr) {
        return arr[Math.floor(f() * arr.length)];
      };
      f.range = function(a2, b) {
        return a2 + f() * (b - a2);
      };
      return f;
    }
    function hash(s) {
      var h = 2166136261;
      s = String(s);
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function clamp(v, a, b) {
      return v < a ? a : v > b ? b : v;
    }
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    var E = {
      outCubic: function(t) {
        return 1 - Math.pow(1 - t, 3);
      },
      inCubic: function(t) {
        return t * t * t;
      },
      inOut: function(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      },
      outBack: function(t) {
        var c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      },
      outElastic: function(t) {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
      }
    };
    function shuffle(a, r) {
      r = r || Math.random;
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(r() * (i + 1));
        var t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    }
    function el(tag, attrs, kids) {
      var e = document.createElement(tag);
      if (attrs) for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "html") e.innerHTML = v;
        else if (k === "text") e.textContent = v;
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
        else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
        else e.setAttribute(k, v);
      }
      (kids || []).forEach(function(c) {
        if (c == null) return;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
      return e;
    }
    function today(d) {
      d = d || /* @__PURE__ */ new Date();
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }
    function fmt(n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return { rng, hash, clamp, lerp, E, shuffle, el, today, fmt };
  })();

  // games/punichunk/src/art.js
  var Art = (function() {
    "use strict";
    var FONT_EN = '"Arial Rounded MT Bold","Avenir Next Rounded","Nunito","Varela Round","Hiragino Maru Gothic ProN","Rounded Mplus 1c",system-ui,-apple-system,"Segoe UI",sans-serif';
    var FONT_JA = '"Hiragino Maru Gothic ProN","BIZ UDPGothic","Rounded Mplus 1c","Kosugi Maru","Yu Gothic UI",Meiryo,system-ui,sans-serif';
    var COL = {
      noun: [92, 168, 240],
      verb: [242, 120, 128],
      aux: [255, 156, 64],
      mod: [96, 200, 140],
      prep: [244, 190, 72],
      link: [168, 136, 234],
      plain: [214, 206, 228],
      magic: [255, 160, 210]
    };
    function colorKeyOfWord(w) {
      switch (w.k) {
        case "n":
        case "pr":
        case "det":
        case "q":
          return "noun";
        case "v":
        case "ti":
          return "verb";
        case "be":
        case "hv":
        case "modal":
        case "not":
        case "sm":
        case "tp":
          return "aux";
        case "adj":
        case "adv":
        case "deg":
        case "er":
          return "mod";
        case "prep":
          return "prep";
        case "conj":
        case "idm":
          return "link";
        case "magic":
          return "magic";
      }
      return "plain";
    }
    function colorKeyOfChunk(c) {
      switch (c.t) {
        case "NP":
          return "noun";
        case "VP":
        case "NF":
          return "verb";
        case "PP":
          return "prep";
        case "AP":
        case "ADV":
          return "mod";
        case "CL":
        case "CONJ":
        case "FR":
          return "link";
        case "ID":
          return c.ik === "front" ? "link" : c.ik === "other" ? "mod" : "prep";
      }
      return "plain";
    }
    function shapeOfChunk(c) {
      switch (c.t) {
        case "NP":
          return "round";
        case "VP":
          return "egg";
        case "CL":
        case "CONJ":
        case "FR":
          return "cloud";
        case "ID":
          return c.ik === "front" ? "cloud" : "drop";
        default:
          return "drop";
      }
    }
    function rgb(c, a) {
      return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")";
    }
    function mix(c, d, t) {
      return [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t), Math.round(c[2] + (d[2] - c[2]) * t)];
    }
    var WHITE = [255, 255, 255], INK = [58, 44, 74];
    var measureCtx = null;
    function measure(text, size, weight) {
      if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
      measureCtx.font = (weight || 800) + " " + size + "px " + FONT_EN;
      return measureCtx.measureText(text).width;
    }
    function shapePath(ctx, shape, r) {
      ctx.beginPath();
      if (shape === "egg") {
        ctx.ellipse(0, 0, r * 1.08, r * 0.9, 0, 0, Math.PI * 2);
      } else if (shape === "drop") {
        ctx.moveTo(0, -r * 1.05);
        ctx.bezierCurveTo(r * 0.55, -r * 0.7, r * 1.02, -r * 0.15, r * 0.98, r * 0.25);
        ctx.bezierCurveTo(r * 0.92, r * 0.78, r * 0.45, r * 1, 0, r * 1);
        ctx.bezierCurveTo(-r * 0.45, r * 1, -r * 0.92, r * 0.78, -r * 0.98, r * 0.25);
        ctx.bezierCurveTo(-r * 1.02, -r * 0.15, -r * 0.55, -r * 0.7, 0, -r * 1.05);
      } else if (shape === "cloud") {
        var b = [[-0.55, 0.12, 0.5], [-0.18, -0.28, 0.58], [0.3, -0.22, 0.55], [0.6, 0.14, 0.46], [0.05, 0.32, 0.6], [-0.4, 0.38, 0.4]];
        b.forEach(function(q) {
          ctx.moveTo(q[0] * r + q[2] * r, q[1] * r);
          ctx.arc(q[0] * r, q[1] * r, q[2] * r, 0, Math.PI * 2);
        });
      } else ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    var cache = /* @__PURE__ */ new Map();
    function sprite(o) {
      var key = [o.text, o.col, o.r, o.kind, o.shape, o.star ? 1 : 0, (o.blobs || []).join("/"), o.dpr, o.fs || 0, o.face || "", o.cyc ? 1 : 0].join("|");
      var s = cache.get(key);
      if (s) return s;
      if (cache.size > 600) cache.clear();
      var r = o.r, pad = Math.ceil(r * 0.35 + 6), size = Math.ceil((r * 1.15 + pad) * 2), dpr = o.dpr || 1;
      var cv = document.createElement("canvas");
      cv.width = Math.ceil(size * dpr);
      cv.height = Math.ceil(size * dpr);
      var c = cv.getContext("2d");
      c.scale(dpr, dpr);
      c.translate(size / 2, size / 2);
      var base = COL[o.col] || COL.plain, shape = o.shape || "round";
      c.save();
      c.shadowColor = "rgba(70,40,110,.24)";
      c.shadowBlur = Math.max(3, r * 0.28);
      c.shadowOffsetY = r * 0.14;
      shapePath(c, shape, r);
      c.fillStyle = rgb(mix(base, WHITE, 0.5));
      c.fill();
      c.restore();
      shapePath(c, shape, r);
      var g = c.createRadialGradient(-r * 0.3, -r * 0.38, r * 0.1, 0, 0, r * 1.15);
      if (o.kind === "word") {
        g.addColorStop(0, rgb(mix(base, WHITE, 0.86)));
        g.addColorStop(0.62, rgb(mix(base, WHITE, 0.5)));
        g.addColorStop(1, rgb(mix(base, WHITE, 0.12)));
      } else {
        g.addColorStop(0, rgb(mix(base, WHITE, 0.9)));
        g.addColorStop(0.55, rgb(mix(base, WHITE, 0.62)));
        g.addColorStop(1, rgb(mix(base, [150, 150, 225], 0.45)));
      }
      c.fillStyle = g;
      c.fill();
      if (o.kind !== "word") {
        c.save();
        shapePath(c, shape, r);
        c.clip();
        (o.blobs || []).forEach(function(bk, i) {
          var bc = COL[bk] || base, a = i * 2.4 + 0.7, rr = r * (0.55 + i % 2 * 0.15), bx = Math.cos(a) * r * 0.42, by = Math.sin(a) * r * 0.38 + r * 0.1;
          var bg = c.createRadialGradient(bx, by, 0, bx, by, rr);
          bg.addColorStop(0, rgb(bc, 0.42));
          bg.addColorStop(1, rgb(bc, 0));
          c.fillStyle = bg;
          c.fillRect(-r * 2, -r * 2, r * 4, r * 4);
        });
        var ig = c.createLinearGradient(0, r * 0.2, 0, r * 1.1);
        ig.addColorStop(0, "rgba(120,110,210,0)");
        ig.addColorStop(1, "rgba(120,110,210,.28)");
        c.fillStyle = ig;
        c.fillRect(-r * 2, -r * 2, r * 4, r * 4);
        c.restore();
      }
      shapePath(c, shape, r);
      c.lineWidth = o.kind === "word" ? 1.4 : 2.2;
      c.strokeStyle = rgb(mix(base, INK, 0.35), o.kind === "word" ? 0.45 : 0.6);
      c.stroke();
      c.save();
      c.beginPath();
      c.ellipse(-r * 0.34, -r * 0.5, r * 0.34, r * 0.17, -0.5, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,.85)";
      c.fill();
      c.beginPath();
      c.arc(-r * 0.62, -r * 0.2, r * 0.07, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,.7)";
      c.fill();
      c.beginPath();
      c.ellipse(r * 0.42, r * 0.5, r * 0.16, r * 0.07, -0.6, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,.35)";
      c.fill();
      c.restore();
      if (o.face) drawFace(c, o.face, r);
      var fs = o.kind === "slot" ? o.fs || 12 : o.fs || 15, tw;
      c.font = "800 " + fs + "px " + FONT_EN;
      var maxW = r * (o.shape === "cloud" ? 1.7 : 1.68);
      while ((tw = c.measureText(o.text).width) > maxW && fs > 9) {
        fs -= 0.5;
        c.font = "800 " + fs + "px " + FONT_EN;
      }
      c.textAlign = "center";
      c.textBaseline = "middle";
      var ty = o.face ? r * 0.42 : 1;
      c.lineWidth = 3.2;
      c.strokeStyle = "rgba(255,255,255,.75)";
      c.lineJoin = "round";
      c.strokeText(o.text, 0, ty);
      c.fillStyle = rgb(mix(base, INK, 0.82));
      c.fillText(o.text, 0, ty);
      if (o.cyc) {
        c.beginPath();
        c.arc(r * 0.62, -r * 0.62, r * 0.16 + 1, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,255,255,.9)";
        c.fill();
        c.strokeStyle = rgb(mix(base, INK, 0.5), 0.7);
        c.lineWidth = 1.4;
        c.stroke();
        c.beginPath();
        c.arc(r * 0.62, -r * 0.62, r * 0.08 + 0.5, -0.3, 4.4);
        c.stroke();
      }
      if (o.star) drawStar(c, r * 0.62, -r * 0.78, r * 0.26 + 2, "#ffcf4a", "#b7841b");
      s = { cv, size };
      cache.set(key, s);
      return s;
    }
    function drawStar(c, x, y, R, fill, line) {
      c.save();
      c.translate(x, y);
      c.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.48 : R;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = line;
      c.stroke();
      c.restore();
    }
    function drawFace(c, face2, r) {
      var faces = face2 === "pl" ? [-r * 0.28, r * 0.28] : [0], fr = face2 === "pl" ? r * 0.3 : r * 0.38;
      faces.forEach(function(fx, i) {
        var fy = -r * 0.2;
        c.beginPath();
        c.arc(fx, fy, fr, 0, Math.PI * 2);
        c.fillStyle = i ? "#ffe2c9" : "#ffeedd";
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = "#7a5545";
        c.stroke();
        c.fillStyle = "#3b2a2a";
        c.beginPath();
        c.ellipse(fx - fr * 0.33, fy - fr * 0.05, fr * 0.1, fr * 0.15, 0, 0, 7);
        c.fill();
        c.beginPath();
        c.ellipse(fx + fr * 0.33, fy - fr * 0.05, fr * 0.1, fr * 0.15, 0, 0, 7);
        c.fill();
        c.beginPath();
        c.arc(fx, fy + fr * 0.18, fr * 0.25, 0.15, Math.PI - 0.15);
        c.lineWidth = 1.4;
        c.strokeStyle = "#a0484f";
        c.stroke();
        c.fillStyle = "rgba(255,140,150,.5)";
        c.beginPath();
        c.ellipse(fx - fr * 0.55, fy + fr * 0.2, fr * 0.16, fr * 0.1, 0, 0, 7);
        c.fill();
        c.beginPath();
        c.ellipse(fx + fr * 0.55, fy + fr * 0.2, fr * 0.16, fr * 0.1, 0, 0, 7);
        c.fill();
      });
    }
    var CK = { line: "#5a3a2e", top: "#fffaf3", bot: "#d7dbf6", leg: "#4b2f27", cheek: "rgba(255,135,140,.55)", mouth: "#7a2a2e", tongue: "#ff8f97" };
    function chunkKun(ctx, x, y, o) {
      var s = o.scale || 1, R = 34 * s, t = o.t || 0, n = Math.max(1, o.segs || 2), maxLen = o.maxLen || 9999;
      var segs = [], px = 0, pr = R;
      for (var i = 1; i <= n; i++) {
        var r = R * Math.max(0.5, 0.86 * Math.pow(0.93, i - 1));
        px += (pr + r) * 0.62;
        segs.push({ x: px, r });
        pr = r;
      }
      if (px + pr > maxLen && n > 1) {
        var k = (maxLen - pr) / px;
        segs.forEach(function(q2) {
          q2.x *= k;
        });
      }
      ctx.save();
      ctx.translate(x, y);
      var bob = Math.sin(t * 3) * 1.5 * s;
      ctx.fillStyle = "rgba(60,40,90,.15)";
      ctx.beginPath();
      ctx.ellipse(segs[segs.length - 1].x / 2, R * 0.95, segs[segs.length - 1].x / 2 + R * 1.1, R * 0.16, 0, 0, 7);
      ctx.fill();
      var last = segs[segs.length - 1];
      blob(ctx, last.x + last.r * 0.95, Math.sin(t * 4 - n * 0.6) * 1.5 + bob * 0.5, last.r * 0.32, last.r * 0.3, s);
      for (var j = segs.length - 1; j >= 0; j--) {
        var q = segs[j], wy = Math.sin(t * 4 - (j + 1) * 0.6) * 1.6 * s + bob * 0.6;
        legs(ctx, q.x, wy + q.r * 0.82, q.r, t, j + 1, s, o.walk);
        blob(ctx, q.x, wy, q.r * 1.06, q.r * 0.92, s);
      }
      legs(ctx, 0, bob + R * 0.8, R * 1.1, t, 0, s, o.walk);
      var wave = o.wave ? Math.sin(t * 9) * 0.5 : Math.sin(t * 2) * 0.12;
      ctx.save();
      ctx.translate(-R * 1.08, bob - R * 0.05);
      ctx.rotate(-0.6 + wave);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.2, R * 0.17, R * 0.26, 0, 0, 7);
      ctx.fillStyle = CK.leg;
      ctx.fill();
      ctx.restore();
      blob(ctx, 0, bob, R * 1.18, R * 0.98, s);
      face(ctx, -R * 0.1, bob, R, o.expr || "normal", o.blink, t);
      ctx.restore();
      return { head: { x, y: y + bob, r: R }, tail: x + last.x + last.r };
    }
    function blob(ctx, x, y, rx, ry, s) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, 7);
      var g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
      g.addColorStop(0, CK.top);
      g.addColorStop(0.55, "#fbf6f4");
      g.addColorStop(1, CK.bot);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.6 * s;
      ctx.strokeStyle = CK.line;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.35, y - ry * 0.5, rx * 0.28, ry * 0.14, -0.3, 0, 7);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fill();
    }
    function legs(ctx, x, y, r, t, i, s, walk) {
      ctx.fillStyle = CK.leg;
      var ph = walk ? Math.sin(t * 10 + i * 1.7) * 2.2 * s : 0;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.45, y + ph, r * 0.17, r * 0.13, 0, 0, 7);
      ctx.fill();
      if (i === 0) {
        ctx.beginPath();
        ctx.ellipse(x + r * 0.35, y - ph, r * 0.17, r * 0.13, 0, 0, 7);
        ctx.fill();
      }
    }
    function face(ctx, fx, fy, R, ex, blinkK, t) {
      var ey = fy - R * 0.08, dx = R * 0.3, k = blinkK == null ? 1 : blinkK;
      ctx.lineCap = "round";
      ctx.fillStyle = CK.cheek;
      ctx.beginPath();
      ctx.ellipse(fx - R * 0.58, fy + R * 0.2, R * 0.17, R * 0.11, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(fx + R * 0.58, fy + R * 0.2, R * 0.17, R * 0.11, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#2b1b1b";
      ctx.strokeStyle = "#2b1b1b";
      ctx.lineWidth = R * 0.07;
      var eye = function(x, look2) {
        if (ex === "joy") {
          ctx.beginPath();
          ctx.arc(x, ey + R * 0.04, R * 0.1, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
          return;
        }
        if (ex === "panic") {
          ctx.beginPath();
          ctx.moveTo(x - R * 0.08, ey - R * 0.08);
          ctx.lineTo(x + R * 0.06, ey);
          ctx.lineTo(x - R * 0.08, ey + R * 0.08);
          ctx.stroke();
          return;
        }
        var h = (ex === "surprise" ? R * 0.13 : R * 0.12) * k, w = ex === "surprise" ? R * 0.1 : R * 0.075;
        ctx.beginPath();
        ctx.ellipse(x + (look2 || 0), ey, w, Math.max(1, h), 0, 0, 7);
        ctx.fill();
        if (k > 0.5) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x + (look2 || 0) - w * 0.3, ey - h * 0.4, R * 0.03, 0, 7);
          ctx.fill();
          ctx.fillStyle = "#2b1b1b";
        }
        if (ex === "sad") {
          ctx.beginPath();
          ctx.moveTo(x - R * 0.1, ey - R * 0.2 + (x < fx ? R * 0.04 : 0));
          ctx.lineTo(x + R * 0.1, ey - R * 0.2 + (x < fx ? 0 : R * 0.04));
          ctx.lineWidth = R * 0.045;
          ctx.stroke();
          ctx.lineWidth = R * 0.07;
        }
      };
      var look = ex === "think" ? R * 0.05 : ex === "idea" ? 0 : 0;
      if (ex === "panic") {
        eye(fx - dx);
        ctx.save();
        ctx.translate(2 * (fx + dx), 0);
        ctx.scale(-1, 1);
        eye(fx + dx);
        ctx.restore();
      } else {
        eye(fx - dx, look);
        eye(fx + dx, look);
      }
      var my = fy + R * 0.2;
      if (ex === "surprise") {
        ctx.beginPath();
        ctx.ellipse(fx, my + R * 0.04, R * 0.08, R * 0.11, 0, 0, 7);
        ctx.fillStyle = CK.mouth;
        ctx.fill();
      } else if (ex === "sad") {
        ctx.beginPath();
        ctx.arc(fx, my + R * 0.14, R * 0.1, Math.PI * 1.15, Math.PI * 1.85);
        ctx.lineWidth = R * 0.05;
        ctx.strokeStyle = CK.mouth;
        ctx.stroke();
      } else if (ex === "think") {
        ctx.beginPath();
        ctx.moveTo(fx - R * 0.07, my + R * 0.05);
        ctx.lineTo(fx + R * 0.08, my + R * 0.03);
        ctx.lineWidth = R * 0.05;
        ctx.strokeStyle = CK.mouth;
        ctx.stroke();
      } else if (ex === "panic") {
        ctx.beginPath();
        ctx.moveTo(fx - R * 0.12, my + R * 0.06);
        for (var i = 1; i <= 4; i++) ctx.lineTo(fx - R * 0.12 + i * R * 0.06, my + R * 0.06 + (i % 2 ? -R * 0.04 : 0));
        ctx.lineWidth = R * 0.045;
        ctx.strokeStyle = CK.mouth;
        ctx.stroke();
      } else {
        var big = ex === "joy" || ex === "idea" ? 1.25 : 1;
        ctx.beginPath();
        ctx.moveTo(fx - R * 0.13 * big, my);
        ctx.quadraticCurveTo(fx, my + R * 0.34 * big, fx + R * 0.13 * big, my);
        ctx.closePath();
        ctx.fillStyle = CK.mouth;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(fx, my + R * 0.2 * big, R * 0.1 * big, R * 0.08, 0, 0, 7);
        ctx.fillStyle = CK.tongue;
        ctx.fill();
        ctx.restore();
      }
      if (ex === "panic") {
        ctx.fillStyle = "#7cc6ff";
        ctx.beginPath();
        ctx.moveTo(fx + R * 0.95, fy - R * 0.5);
        ctx.quadraticCurveTo(fx + R * 1.08, fy - R * 0.25, fx + R * 0.95, fy - R * 0.2);
        ctx.quadraticCurveTo(fx + R * 0.82, fy - R * 0.25, fx + R * 0.95, fy - R * 0.5);
        ctx.fill();
      }
      if (ex === "idea") {
        drawStar(ctx, fx + R * 0.7, fy - R * 1.15 + Math.sin(t * 6) * 2, R * 0.2, "#ffd447", "#c99a1d");
      }
      if (ex === "think") {
        ctx.fillStyle = "#6b5a7a";
        for (var d = 0; d < 3; d++) {
          ctx.beginPath();
          ctx.arc(fx + R * (0.55 + d * 0.2), fy - R * 1.1, R * (0.04 + d * 0.015), 0, 7);
          ctx.fill();
        }
      }
    }
    var SKY = [
      // [上, 下] 朝・昼・夕・夜
      [[255, 214, 196], [255, 241, 222]],
      [[150, 205, 250], [226, 242, 255]],
      [[255, 150, 140], [255, 214, 160]],
      [[44, 52, 110], [118, 96, 168]]
    ];
    function skyAt(p) {
      var stops = [0, 0.35, 0.72, 1], i = 0;
      while (i < 2 && p > stops[i + 1]) i++;
      var t = U.clamp((p - stops[i]) / (stops[i + 1] - stops[i]), 0, 1);
      return [mix(SKY[i][0], SKY[i + 1][0], t), mix(SKY[i][1], SKY[i + 1][1], t)];
    }
    function City(seed) {
      var r = U.rng(seed || 7), far = [], near = [], clouds = [], stars = [];
      var pal = [[244, 200, 214], [204, 214, 246], [214, 236, 222], [252, 226, 190], [222, 206, 244], [190, 222, 240]];
      var x = -20;
      while (x < 1400) {
        var w = 34 + r() * 50;
        far.push({ x, w, h: 0.2 + r() * 0.26, c: pal[r.int(pal.length)], top: r.int(4) });
        x += w + 2 + r() * 8;
      }
      x = -30;
      while (x < 1400) {
        var w2 = 40 + r() * 56;
        near.push({ x, w: w2, h: 0.1 + r() * 0.22, c: pal[r.int(pal.length)], top: r.int(5), seed: r.int(1e6) });
        x += w2 + 6 + r() * 16;
      }
      for (var i = 0; i < 5; i++) clouds.push({ x: r() * 1, y: 0.06 + r() * 0.3, s: 0.6 + r() * 0.8, v: 4e-3 + r() * 6e-3 });
      for (i = 0; i < 70; i++) stars.push({ x: r(), y: r() * 0.55, s: 0.6 + r() * 1.2, ph: r() * 6 });
      var buf = null, bufKey = "";
      function render(w3, h, p, lit, dpr) {
        var key = [w3, h, Math.round(p * 60), Math.round(lit * 30), dpr].join("|");
        if (buf && key === bufKey) return buf;
        bufKey = key;
        buf = buf || document.createElement("canvas");
        buf.width = Math.ceil(w3 * dpr);
        buf.height = Math.ceil(h * dpr);
        var c = buf.getContext("2d");
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        var sk = skyAt(p), g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(sk[0]));
        g.addColorStop(1, rgb(sk[1]));
        c.fillStyle = g;
        c.fillRect(0, 0, w3, h);
        var sunY = h * (0.18 + p * 0.5), night = U.clamp((p - 0.72) / 0.28, 0, 1);
        c.fillStyle = night > 0.5 ? "rgba(255,250,220,.95)" : "rgba(255,248,220,.9)";
        c.beginPath();
        c.arc(w3 * 0.78, night > 0.5 ? h * 0.14 : sunY, night > 0.5 ? 18 : 30, 0, 7);
        c.fill();
        if (night > 0.5) {
          c.fillStyle = rgb(sk[0]);
          c.beginPath();
          c.arc(w3 * 0.78 + 8, h * 0.14 - 5, 16, 0, 7);
          c.fill();
        }
        var gy = h * 0.98, dark = night * 0.55 + U.clamp((p - 0.5) / 0.3, 0, 1) * 0.15;
        var drawB = function(list, scale, alpha, win) {
          list.forEach(function(b) {
            if (b.x > w3 + 40) return;
            var bh = b.h * h * scale, by = gy - bh, col = mix(mix(b.c, sk[1], 0.15), [40, 36, 80], dark);
            c.fillStyle = rgb(col, alpha);
            c.beginPath();
            if (b.top === 1) {
              c.moveTo(b.x, by);
              c.lineTo(b.x + b.w / 2, by - b.w * 0.35);
              c.lineTo(b.x + b.w, by);
            } else if (b.top === 2) {
              c.moveTo(b.x, by);
              c.arc(b.x + b.w / 2, by, b.w / 2, Math.PI, 0);
            } else {
              var rr = Math.min(10, b.w * 0.2);
              c.moveTo(b.x, by + rr);
              c.quadraticCurveTo(b.x, by, b.x + rr, by);
              c.lineTo(b.x + b.w - rr, by);
              c.quadraticCurveTo(b.x + b.w, by, b.x + b.w, by + rr);
            }
            c.lineTo(b.x + b.w, gy);
            c.lineTo(b.x, gy);
            c.closePath();
            c.fill();
            if (win) {
              var wr = U.rng(b.seed);
              for (var yy = by + 10; yy < gy - 12; yy += 15) for (var xx = b.x + 8; xx < b.x + b.w - 10; xx += 13) {
                var on = wr() < lit;
                c.fillStyle = on ? "rgba(255,214,110," + (0.55 + night * 0.45) + ")" : "rgba(255,255,255," + (0.35 - night * 0.25) + ")";
                c.beginPath();
                c.roundRect ? c.roundRect(xx, yy, 7, 9, 2) : c.rect(xx, yy, 7, 9);
                c.fill();
              }
            }
          });
        };
        drawB(far, 1, 0.55, false);
        drawB(near, 1, 0.9, true);
        var hg = c.createLinearGradient(0, gy - 6, 0, h);
        hg.addColorStop(0, rgb(mix([150, 214, 160], [40, 40, 80], dark)));
        hg.addColorStop(1, rgb(mix([120, 190, 140], [30, 30, 70], dark)));
        c.fillStyle = hg;
        c.fillRect(0, gy - 2, w3, h - gy + 2);
        return buf;
      }
      return {
        draw: function(ctx, w3, h, p, lit, t, dpr) {
          ctx.drawImage(render(w3, h, p, lit, dpr), 0, 0, w3, h);
          var night = U.clamp((p - 0.7) / 0.3, 0, 1);
          if (night > 0) {
            stars.forEach(function(s) {
              ctx.fillStyle = "rgba(255,255,240," + night * (0.5 + 0.5 * Math.sin(t * 2 + s.ph)) + ")";
              ctx.fillRect(s.x * w3, s.y * h, s.s, s.s);
            });
          }
          clouds.forEach(function(cl) {
            var cx = ((cl.x + t * cl.v) % 1.3 - 0.15) * w3, cy = cl.y * h, s = cl.s * 26;
            ctx.fillStyle = "rgba(255,255,255," + (0.75 - night * 0.45) + ")";
            ctx.beginPath();
            ctx.arc(cx, cy, s, 0, 7);
            ctx.arc(cx + s * 1.1, cy - s * 0.35, s * 1.15, 0, 7);
            ctx.arc(cx + s * 2.2, cy, s * 0.9, 0, 7);
            ctx.ellipse(cx + s * 1.1, cy + s * 0.25, s * 1.9, s * 0.6, 0, 0, 7);
            ctx.fill();
          });
        }
      };
    }
    var I = function(p, vb) {
      return '<svg viewBox="' + (vb || "0 0 24 24") + '" aria-hidden="true">' + p + "</svg>";
    };
    var ICON = {
      pause: I('<rect x="6" y="5" width="4.2" height="14" rx="1.6"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6"/>'),
      play: I('<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z"/>'),
      speaker: I('<path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
      gear: I('<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 4.6-.1-2.2 2-1.6-2-3.5-2.4.9-1.9-1.1L15.6 3h-4l-.4 2.6-1.9 1.1-2.4-.9-2 3.5 2 1.6v2.2l-2 1.6 2 3.5 2.4-.9 1.9 1.1.4 2.6h4l.4-2.6 1.9-1.1 2.4.9 2-3.5z" fill-rule="evenodd"/>'),
      trophy: I('<path d="M7 3h10v3h3a3 3 0 0 1-3.6 4.2A5 5 0 0 1 13 13.9V17h3v3H8v-3h3v-3.1a5 5 0 0 1-3.4-3.7A3 3 0 0 1 4 6h3zm0 5H6a1 1 0 0 0 1 1zm10 0v1a1 1 0 0 0 1-1z"/>'),
      back: I('<path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
      home: I('<path d="M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>'),
      retry: I('<path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 3.5v5h5z"/>'),
      shop: I('<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3zM8.5 8V7a3.5 3.5 0 0 1 7 0v1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
      info: I('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="10.8" y="10.5" width="2.4" height="7" rx="1.2"/><circle cx="12" cy="7.3" r="1.5"/>'),
      hint: I('<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6V17h6v-1.1c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 2.5zM9.5 19h5v1.2a1.8 1.8 0 0 1-1.8 1.8h-1.4a1.8 1.8 0 0 1-1.8-1.8z"/>'),
      magic: I('<path d="m14.5 3 1.2 3.3L19 7.5l-3.3 1.2-1.2 3.3-1.2-3.3L10 7.5l3.3-1.2zM6.5 11l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9zm7.8 5.2.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
      auto: I('<circle cx="7.5" cy="12" r="4.2"/><circle cx="16.5" cy="12" r="4.2" opacity=".55"/><path d="M10.5 12h3" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'),
      lock: I('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
      check: I('<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
      close: I('<path d="m6.5 6.5 11 11m0-11-11 11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
      star: I('<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>')
    };
    return { FONT_EN, FONT_JA, COL, rgb, mix, colorKeyOfWord, colorKeyOfChunk, shapeOfChunk, sprite, measure, chunkKun, City, skyAt, ICON, drawStar, shapePath, clearCache: function() {
      cache.clear();
    } };
  })();

  // games/punichunk/src/audio.js
  var Snd = (function() {
    "use strict";
    var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    function mtof(m) {
      return 440 * Math.pow(2, (m - 69) / 12);
    }
    function create(opts) {
      var A = { ctx: null, vol: { bgm: 0.55, sfx: 0.8 }, on: { bgm: true, sfx: true, voice: true }, rate: 1, track: null, intensity: 0, dead: false };
      var master, comp, sfxBus, bgmBus, noiseBuf, timer = null, seq = null, voices = [], voice = null;
      function ensure() {
        if (A.ctx || A.dead) return A.ctx;
        var CORE = opts && opts.core, c;
        if (CORE) c = CORE.sound.ctx();
        else {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          try {
            c = new AC();
          } catch (e) {
            return null;
          }
        }
        if (!c) return null;
        A.ctx = c;
        sfxBus = c.createGain();
        bgmBus = c.createGain();
        if (CORE) {
          var cs = c.createDynamicsCompressor();
          cs.threshold.value = -14;
          cs.ratio.value = 4;
          cs.attack.value = 5e-3;
          cs.release.value = 0.2;
          sfxBus.connect(cs);
          cs.connect(CORE.sound.sfxBus);
          bgmBus.connect(CORE.sound.bgmBus);
          sfxBus.gain.value = 0.9;
          bgmBus.gain.value = 0.5;
          master = comp = null;
        } else {
          master = c.createGain();
          master.gain.value = 0.9;
          comp = c.createDynamicsCompressor();
          comp.threshold.value = -14;
          comp.ratio.value = 4;
          comp.attack.value = 5e-3;
          comp.release.value = 0.2;
          master.connect(comp);
          comp.connect(c.destination);
          sfxBus.connect(master);
          bgmBus.connect(master);
          applyVol();
        }
        noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return c;
      }
      function applyVol() {
        if (!A.ctx || opts && opts.core) return;
        var t = A.ctx.currentTime;
        sfxBus.gain.setTargetAtTime(A.on.sfx ? A.vol.sfx : 0, t, 0.02);
        bgmBus.gain.setTargetAtTime(A.on.bgm ? A.vol.bgm * 0.5 : 0, t, 0.05);
      }
      function tone(o) {
        var c = A.ctx;
        if (!c) return;
        var t = o.t || c.currentTime, dur = o.d || 0.2;
        var osc = c.createOscillator(), g = c.createGain();
        osc.type = o.type || "sine";
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || dur));
        if (o.det) osc.detune.value = o.det;
        var v = o.v == null ? 0.3 : o.v, a = o.a || 5e-3;
        g.gain.setValueAtTime(1e-4, t);
        g.gain.linearRampToValueAtTime(v, t + a);
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
        var node = g;
        if (o.lp) {
          var f = c.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = o.lp;
          f.Q.value = o.q || 0.7;
          g.connect(f);
          node = f;
        }
        osc.connect(g);
        node.connect(o.bus || sfxBus);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
      function noise(o) {
        var c = A.ctx;
        if (!c) return;
        var t = o.t || c.currentTime, dur = o.d || 0.1;
        var s = c.createBufferSource();
        s.buffer = noiseBuf;
        var f = c.createBiquadFilter();
        f.type = o.ft || "bandpass";
        f.frequency.value = o.f || 2e3;
        f.Q.value = o.q || 1;
        var g = c.createGain();
        g.gain.setValueAtTime(o.v || 0.2, t);
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
        s.connect(f);
        f.connect(g);
        g.connect(o.bus || sfxBus);
        s.start(t, Math.random() * 0.3);
        s.stop(t + dur + 0.02);
      }
      function pop(t, f, v) {
        tone({ t, f: f || 900, f2: (f || 900) * 0.35, d: 0.09, glide: 0.07, v: v || 0.25, type: "sine" });
        noise({ t, f: 3e3, q: 2, d: 0.03, v: (v || 0.25) * 0.4 });
      }
      function bell(t, m, v, d) {
        tone({ t, f: mtof(m), d: d || 0.5, v: v || 0.14, type: "sine" });
        tone({ t, f: mtof(m + 12), d: (d || 0.5) * 0.6, v: (v || 0.14) * 0.35, type: "sine" });
        tone({ t, f: mtof(m) * 2.76, d: 0.12, v: (v || 0.14) * 0.2, type: "sine" });
      }
      var SFX = {
        tap: function(p) {
          var c = A.ctx, t = c.currentTime, m = 72 + PENTA[Math.min(PENTA.length - 1, p || 0)];
          pop(t, mtof(m) * 1.6, 0.16);
          bell(t + 5e-3, m, 0.13, 0.3);
        },
        cycle: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 1300, f2: 1800, d: 0.06, v: 0.12, type: "square", lp: 3e3 });
          tone({ t: t + 0.05, f: 1700, d: 0.06, v: 0.1, type: "triangle" });
        },
        link: function(p) {
          var t = A.ctx.currentTime, m = 67 + PENTA[Math.min(PENTA.length - 1, p || 0)];
          bell(t, m, 0.16, 0.45);
          pop(t, 600, 0.12);
        },
        chunk: function(p) {
          var t = A.ctx.currentTime, m = 72 + PENTA[Math.min(8, (p || 2) + 2)];
          pop(t, 520, 0.3);
          tone({ t, f: 180, f2: 90, d: 0.18, v: 0.2, type: "sine" });
          bell(t + 0.06, m, 0.16, 0.5);
          bell(t + 0.14, m + 7, 0.13, 0.6);
        },
        sentence: function(p) {
          var t = A.ctx.currentTime, base = 72, ch = [0, 4, 7, 12, 16, 19, 24];
          for (var i = 0; i < Math.min(7, 3 + (p || 2)); i++) {
            bell(t + i * 0.07, base + ch[i], 0.15, 0.8);
            tone({ t: t + i * 0.07, f: mtof(base + ch[i] - 12), d: 0.25, v: 0.07, type: "triangle" });
          }
          noise({ t: t + 0.35, f: 8e3, q: 0.5, d: 0.5, v: 0.08, ft: "highpass" });
          tone({ t, f: 110, f2: 55, d: 0.4, v: 0.25, type: "sine" });
        },
        reject: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 240, f2: 150, d: 0.14, v: 0.22, type: "triangle" });
        },
        fail: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 440, f2: 330, d: 0.2, v: 0.16, type: "triangle" });
          tone({ t: t + 0.18, f: 330, f2: 220, d: 0.3, v: 0.16, type: "triangle" });
        },
        tri: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 520, d: 0.14, v: 0.14, type: "triangle" });
          tone({ t: t + 0.12, f: 440, d: 0.22, v: 0.14, type: "triangle" });
        },
        scatter: function() {
          var t = A.ctx.currentTime;
          for (var i = 0; i < 4; i++) pop(t + i * 0.045, 500 + Math.random() * 700, 0.1);
        },
        select: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 880, f2: 1320, d: 0.1, v: 0.12, type: "sine" });
        },
        slot: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 200, f2: 120, d: 0.12, v: 0.28, type: "sine" });
          noise({ t, f: 1500, q: 1, d: 0.04, v: 0.12 });
        },
        ready: function() {
          var t = A.ctx.currentTime;
          [0, 4, 7, 12].forEach(function(s, i) {
            bell(t + i * 0.05, 79 + s, 0.08, 0.35);
          });
        },
        tick: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 1500, d: 0.04, v: 0.12, type: "square", lp: 2500 });
        },
        extend: function() {
          var t = A.ctx.currentTime;
          [0, 7, 12].forEach(function(s, i) {
            tone({ t: t + i * 0.04, f: mtof(84 + s), d: 0.2, v: 0.06, type: "sine" });
          });
        },
        combo: function(p) {
          var t = A.ctx.currentTime, m = 79 + Math.min(12, p || 0);
          bell(t, m, 0.12, 0.4);
          bell(t + 0.06, m + 5, 0.1, 0.4);
        },
        insert: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 300, f2: 700, d: 0.12, v: 0.2, type: "sine" });
          pop(t + 0.08, 1100, 0.14);
        },
        button: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 660, f2: 990, d: 0.07, v: 0.14, type: "sine" });
        },
        count: function(p) {
          var t = A.ctx.currentTime;
          tone({ t, f: p ? 784 : 1175, d: p ? 0.18 : 0.5, v: 0.2, type: "triangle" });
        },
        end: function() {
          var t = A.ctx.currentTime;
          [84, 79, 76, 72].forEach(function(m, i) {
            bell(t + i * 0.12, m, 0.14, 0.6);
          });
        },
        best: function() {
          var t = A.ctx.currentTime;
          [72, 76, 79, 84, 79, 84, 88].forEach(function(m, i) {
            bell(t + i * 0.1, m, 0.15, 0.7);
            tone({ t: t + i * 0.1, f: mtof(m - 24), d: 0.2, v: 0.08, type: "triangle" });
          });
        },
        pop: function() {
          pop(A.ctx.currentTime, 700 + Math.random() * 500, 0.18);
        },
        warn: function() {
          var t = A.ctx.currentTime;
          tone({ t, f: 330, d: 0.12, v: 0.15, type: "square", lp: 1200 });
        }
      };
      var PROG = {
        // 4小節の和音(ルートのMIDI)と3和音
        play: [[48, [0, 4, 7]], [43, [0, 4, 7]], [45, [0, 3, 7]], [41, [0, 4, 7]]],
        title: [[41, [0, 4, 7, 11]], [43, [0, 4, 7]], [40, [0, 3, 7]], [45, [0, 3, 7]]],
        result: [[48, [0, 4, 7, 11]], [41, [0, 4, 7, 11]], [43, [0, 4, 7]], [48, [0, 4, 7]]]
      };
      var MEL = {
        // 16分×16 を4小節。数字=和音ルート+半音、null=休み
        play: [[12, null, 16, null, 19, null, 16, 14, 12, null, null, 9, 12, null, null, null], [11, null, 14, null, 19, null, 14, 12, 11, null, 7, null, 11, null, null, null], [12, null, 15, null, 19, 17, 15, null, 12, null, 15, null, 19, null, null, null], [12, null, 16, 19, 21, null, 19, 16, 19, null, 16, null, 14, null, 12, null]],
        title: [[16, null, null, null, 19, null, 21, null, 19, null, null, null, 16, null, null, null], [14, null, null, null, 19, null, 16, null, 14, null, null, null, null, null, null, null], [15, null, null, null, 19, null, 22, null, 19, null, 15, null, null, null, null, null], [12, null, null, null, 16, null, 19, null, 21, null, null, null, 19, null, null, null]],
        result: [[19, null, 16, null, 12, null, 16, null, 19, null, 24, null, null, null, null, null], [16, null, 14, null, 12, null, 9, null, 12, null, null, null, null, null, null, null], [14, null, 16, null, 19, null, 14, null, 11, null, null, null, null, null, null, null], [12, null, 16, null, 19, null, 24, null, null, null, null, null, null, null, null, null]]
      };
      var BPM = { play: 120, title: 92, result: 88 };
      function music(name) {
        if (A.track === name) return;
        A.track = name;
        stopSeq();
        if (!name || !ensure()) return;
        seq = { name, step: 0, next: A.ctx.currentTime + 0.08 };
        timer = setInterval(schedule, 25);
      }
      function stopSeq() {
        if (timer) clearInterval(timer);
        timer = null;
        seq = null;
      }
      function schedule() {
        if (!seq || !A.ctx || A.ctx.state !== "running") return;
        var c = A.ctx, spb = 60 / BPM[seq.name] / 4;
        while (seq.next < c.currentTime + 0.14) {
          playStep(seq.name, seq.step, seq.next, spb);
          seq.step = (seq.step + 1) % 64;
          seq.next += spb;
        }
      }
      function playStep(name, step, t, spb) {
        var bar = Math.floor(step / 16), s = step % 16, ch = PROG[name][bar], root = ch[0], I = name === "play" ? A.intensity : 0.3, B = bgmBus;
        if (name === "play") {
          if (s % 4 === 0) tone({ t, f: mtof(root - 12), d: spb * 3, v: 0.34, type: "triangle", bus: B, lp: 600 });
          if (s % 4 === 2) tone({ t, f: mtof(root), d: spb * 1.4, v: 0.16, type: "triangle", bus: B, lp: 900 });
          if (s % 8 === 4 || s % 8 === 7 && I > 0.5) ch[1].forEach(function(iv) {
            tone({ t, f: mtof(root + 12 + iv), d: spb * 1.8, v: 0.045, type: "square", bus: B, lp: 1800, det: 4 });
          });
          if (s % 4 === 0) {
            tone({ t, f: 150, f2: 45, d: 0.22, glide: 0.12, v: 0.5, type: "sine", bus: B });
          }
          if (s % 8 === 4) noise({ t, f: 1800, q: 0.7, d: 0.12, v: 0.16, bus: B });
          if (s % 2 === 1 || I > 0.6) noise({ t, f: 9e3, q: 0.5, d: 0.035, v: 0.05 + I * 0.04, ft: "highpass", bus: B });
          if (I > 0.3 && s % 2 === 0) {
            var ar = ch[1][s / 2 % ch[1].length];
            tone({ t, f: mtof(root + 24 + ar), d: spb * 1.2, v: 0.035 + I * 0.03, type: "sine", bus: B });
          }
        } else {
          if (s === 0) ch[1].forEach(function(iv) {
            tone({ t, f: mtof(root + 12 + iv), d: spb * 15, a: 0.3, v: 0.05, type: "triangle", bus: B, lp: 1400 });
          });
          if (s % 8 === 0) tone({ t, f: mtof(root - 12), d: spb * 7, v: 0.22, type: "sine", bus: B });
          if (s % 4 === 2) {
            var ar2 = ch[1][(s / 4 | 0) % ch[1].length];
            tone({ t, f: mtof(root + 24 + ar2), d: spb * 3, v: 0.04, type: "sine", bus: B });
          }
        }
        var m = MEL[name][bar][s];
        if (m != null) {
          var mm = root + 12 + m + (name === "play" ? 0 : 12);
          tone({ t, f: mtof(mm), d: spb * (name === "play" ? 2.2 : 3.5), v: name === "play" ? 0.085 : 0.07, type: name === "play" ? "square" : "triangle", bus: B, lp: name === "play" ? 2600 : 3e3 });
          tone({ t, f: mtof(mm + 12), d: spb * 1.5, v: 0.025, type: "sine", bus: B });
        }
      }
      var ttsOK = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
      function pickVoice() {
        if (!ttsOK) return;
        voices = speechSynthesis.getVoices() || [];
        var en = voices.filter(function(v) {
          return /^en(-|_|$)/i.test(v.lang);
        });
        var pref = [/Samantha/i, /Google US English/i, /Aria/i, /Jenny/i, /Ava/i, /Allison/i, /Zira/i, /en-US/i];
        voice = null;
        for (var i = 0; i < pref.length && !voice; i++) voice = en.filter(function(v) {
          return pref[i].test(v.name) || pref[i].test(v.lang);
        })[0] || null;
        voice = voice || en[0] || null;
      }
      if (ttsOK) {
        pickVoice();
        try {
          speechSynthesis.addEventListener("voiceschanged", pickVoice);
        } catch (e) {
        }
      }
      function speak(text, o) {
        if (opts && opts.core) {
          if (A.dead || !text) return false;
          opts.core.speech.speak(text, { rate: o && o.rate });
          return true;
        }
        if (!ttsOK || !A.on.voice || A.dead || !text) return false;
        try {
          if (!voice) pickVoice();
          if (speechSynthesis.paused) speechSynthesis.resume();
          if ((!o || !o.queue) && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          if (voice) u.voice = voice;
          u.rate = o && o.rate || A.rate;
          u.pitch = 1.05;
          u.volume = 1;
          speechSynthesis.speak(u);
          return true;
        } catch (e) {
          return false;
        }
      }
      var ttsPrimed = false;
      A.unlock = function() {
        var c = ensure();
        if (c && c.state === "suspended") c.resume();
        if (!ttsOK) return;
        if (!voice) pickVoice();
        if (!ttsPrimed) {
          ttsPrimed = true;
          try {
            var u = new SpeechSynthesisUtterance(" ");
            u.volume = 0;
            u.lang = "en-US";
            speechSynthesis.speak(u);
          } catch (e) {
          }
        } else if (speechSynthesis.paused) {
          try {
            speechSynthesis.resume();
          } catch (e) {
          }
        }
      };
      A.sfx = function(name, p) {
        if (!A.on.sfx || !ensure() || A.ctx.state !== "running") return;
        try {
          SFX[name] && SFX[name](p);
        } catch (e) {
        }
      };
      A.music = music;
      A.setIntensity = function(x) {
        A.intensity = U.clamp(x, 0, 1);
      };
      A.set = function(o) {
        if (opts && opts.core) return;
        if (o.vol) Object.assign(A.vol, o.vol);
        if (o.on) Object.assign(A.on, o.on);
        if (o.rate) A.rate = o.rate;
        applyVol();
        if (!A.on.voice && ttsOK) speechSynthesis.cancel();
      };
      A.speak = speak;
      A.ttsAvailable = function() {
        if (opts && opts.core) return true;
        return ttsOK && (!!voice || !voices.length);
      };
      A.suspend = function() {
        if (opts && opts.core) {
          opts.core.speech.stop();
          return;
        }
        if (A.ctx && A.ctx.state === "running") A.ctx.suspend();
        if (ttsOK) speechSynthesis.cancel();
      };
      A.resume = function() {
        if (A.ctx && A.ctx.state === "suspended") A.ctx.resume();
      };
      A.destroy = function() {
        A.dead = true;
        stopSeq();
        if (ttsOK) {
          try {
            speechSynthesis.cancel();
            speechSynthesis.removeEventListener("voiceschanged", pickVoice);
          } catch (e) {
          }
        }
        if (A.ctx) {
          if (opts && opts.core) {
            try {
              sfxBus.disconnect();
              bgmBus.disconnect();
              opts.core.speech.stop();
            } catch (e) {
            }
          } else {
            try {
              A.ctx.close();
            } catch (e) {
            }
          }
        }
        A.ctx = null;
      };
      if (opts) A.set(opts);
      return A;
    }
    return { create };
  })();

  // games/punichunk/src/dict_data.js
  var DICT_DATA = { "noun": [{ "w": "apple", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u308A\u3093\u3054" }, { "w": "banana", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30D0\u30CA\u30CA" }, { "w": "bread", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30D1\u30F3" }, { "w": "cake", "c": "c", "ad": "a", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u30B1\u30FC\u30AD" }, { "w": "rice balls", "c": "p", "ad": "", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u304A\u306B\u304E\u308A" }, { "w": "ramen", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30E9\u30FC\u30E1\u30F3" }, { "w": "curry", "c": "u", "ad": "", "cat": "food", "tg": ["food", "make"], "lv": 2, "ja": "\u30AB\u30EC\u30FC" }, { "w": "sandwich", "c": "c", "ad": "a", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u30B5\u30F3\u30C9\u30A4\u30C3\u30C1" }, { "w": "pizza", "c": "u", "ad": "", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u30D4\u30B6" }, { "w": "water", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u6C34" }, { "w": "milk", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u725B\u4E73" }, { "w": "coffee", "c": "u", "ad": "", "cat": "drink", "tg": ["drink", "make"], "lv": 1, "ja": "\u30B3\u30FC\u30D2\u30FC" }, { "w": "orange juice", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u30AA\u30EC\u30F3\u30B8\u30B8\u30E5\u30FC\u30B9" }, { "w": "tea", "c": "u", "ad": "", "cat": "drink", "tg": ["drink", "make"], "lv": 1, "ja": "\u304A\u8336" }, { "w": "book", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "thing"], "lv": 1, "ja": "\u672C" }, { "w": "comic", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "thing"], "lv": 2, "ja": "\u307E\u3093\u304C" }, { "w": "newspaper", "c": "t", "ad": "the", "cat": "read", "tg": ["read", "thing"], "lv": 1, "ja": "\u65B0\u805E" }, { "w": "letter", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "write", "thing"], "lv": 1, "ja": "\u624B\u7D19" }, { "w": "email", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "write"], "lv": 1, "ja": "\u30E1\u30FC\u30EB" }, { "w": "story", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "write", "tell"], "lv": 1, "ja": "\u304A\u8A71" }, { "w": "lunch", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30E9\u30F3\u30C1" }, { "w": "cold", "c": "c", "ad": "a", "cat": "over", "tg": ["over"], "lv": 1, "ja": "\u98A8\u90AA" }, { "w": "shock", "c": "t", "ad": "the", "cat": "over", "tg": ["over"], "lv": 2, "ja": "\u30B7\u30E7\u30C3\u30AF" }, { "w": "party", "c": "t", "ad": "the", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30D1\u30FC\u30C6\u30A3\u30FC" }, { "w": "trip", "c": "t", "ad": "the", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u65C5\u884C" }, { "w": "meeting", "c": "t", "ad": "the", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u4F1A\u8B70" }, { "w": "light", "c": "t", "ad": "the", "cat": "device", "tg": ["device"], "lv": 1, "ja": "\u96FB\u6C17" }, { "w": "offer", "c": "t", "ad": "the", "cat": "offer", "tg": ["offer"], "lv": 2, "ja": "\u7533\u3057\u51FA" }, { "w": "invitation", "c": "t", "ad": "the", "cat": "offer", "tg": ["offer", "event"], "lv": 3, "ja": "\u62DB\u5F85" }, { "w": "word", "c": "t", "ad": "the", "cat": "word", "tg": ["word"], "lv": 1, "ja": "\u305D\u306E\u5358\u8A9E" }, { "w": "fire", "c": "t", "ad": "the", "cat": "fire", "tg": ["fire"], "lv": 1, "ja": "\u706B" }, { "w": "noise", "c": "t", "ad": "the", "cat": "bear", "tg": ["bear"], "lv": 1, "ja": "\u9A12\u97F3" }, { "w": "butterfly", "c": "c", "ad": "a", "cat": "change", "tg": ["change", "see"], "lv": 1, "ja": "\u30C1\u30E7\u30A6" }, { "w": "frog", "c": "c", "ad": "a", "cat": "change", "tg": ["change", "see"], "lv": 1, "ja": "\u30AB\u30A8\u30EB" }, { "w": "secret", "c": "c", "ad": "a", "cat": "tell", "tg": ["tell"], "lv": 2, "ja": "\u3072\u307F\u3064" }, { "w": "joke", "c": "c", "ad": "a", "cat": "tell", "tg": ["tell"], "lv": 2, "ja": "\u3058\u3087\u3046\u3060\u3093" }, { "w": "truth", "c": "t", "ad": "the", "cat": "tell", "tg": ["tell"], "lv": 2, "ja": "\u672C\u5F53\u306E\u3053\u3068" }, { "w": "name", "c": "c", "ad": "my", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u540D\u524D" }, { "w": "TV", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch", "device"], "lv": 1, "ja": "\u30C6\u30EC\u30D3" }, { "w": "movie", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u6620\u753B" }, { "w": "star", "c": "c", "ad": "the", "cat": "see", "tg": ["see"], "lv": 2, "ja": "\u661F" }, { "w": "soccer", "c": "u", "ad": "", "cat": "sport", "tg": ["sport", "watch"], "lv": 1, "ja": "\u30B5\u30C3\u30AB\u30FC" }, { "w": "tennis", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u30C6\u30CB\u30B9" }, { "w": "baseball", "c": "u", "ad": "", "cat": "sport", "tg": ["sport", "watch"], "lv": 1, "ja": "\u91CE\u7403" }, { "w": "basketball", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u30D0\u30B9\u30B1" }, { "w": "piano", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 1, "ja": "\u30D4\u30A2\u30CE" }, { "w": "guitar", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 1, "ja": "\u30AE\u30BF\u30FC" }, { "w": "video games", "c": "p", "ad": "", "cat": "game", "tg": ["game"], "lv": 1, "ja": "\u30B2\u30FC\u30E0" }, { "w": "cards", "c": "p", "ad": "", "cat": "game", "tg": ["game"], "lv": 2, "ja": "\u30C8\u30E9\u30F3\u30D7" }, { "w": "music", "c": "u", "ad": "", "cat": "music", "tg": ["music"], "lv": 1, "ja": "\u97F3\u697D" }, { "w": "song", "c": "c", "ad": "a", "cat": "song", "tg": ["song", "music", "write"], "lv": 1, "ja": "\u6B4C" }, { "w": "radio", "c": "t", "ad": "the", "cat": "music", "tg": ["music", "thing", "device"], "lv": 1, "ja": "\u30E9\u30B8\u30AA" }, { "w": "English", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 2, "ja": "\u82F1\u8A9E" }, { "w": "math", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u6570\u5B66" }, { "w": "homework", "c": "u", "ad": "", "cat": "homework", "tg": ["homework"], "lv": 1, "ja": "\u5BBF\u984C" }, { "w": "ball", "c": "c", "ad": "a", "cat": "ball", "tg": ["ball", "thing"], "lv": 1, "ja": "\u30DC\u30FC\u30EB" }, { "w": "bike", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride", "thing"], "lv": 1, "ja": "\u81EA\u8EE2\u8ECA" }, { "w": "bag", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u304B\u3070\u3093" }, { "w": "umbrella", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u304B\u3055" }, { "w": "phone", "c": "c", "ad": "my", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B9\u30DE\u30DB" }, { "w": "key", "c": "t", "ad": "the", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u304B\u304E" }, { "w": "camera", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30AB\u30E1\u30E9" }, { "w": "picture", "c": "c", "ad": "a", "cat": "draw", "tg": ["draw", "thing"], "lv": 1, "ja": "\u7D75" }, { "w": "photo", "c": "c", "ad": "a", "cat": "photo", "tg": ["photo"], "lv": 1, "ja": "\u5199\u771F" }, { "w": "door", "c": "t", "ad": "the", "cat": "door", "tg": ["door"], "lv": 1, "ja": "\u30C9\u30A2" }, { "w": "window", "c": "t", "ad": "the", "cat": "door", "tg": ["door"], "lv": 1, "ja": "\u7A93" }, { "w": "box", "c": "t", "ad": "the", "cat": "door", "tg": ["door", "thing"], "lv": 1, "ja": "\u7BB1" }, { "w": "house", "c": "t", "ad": "the", "cat": "thing", "tg": ["thing", "door"], "lv": 1, "ja": "\u5BB6" }, { "w": "room", "c": "c", "ad": "my", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u90E8\u5C4B" }, { "w": "dishes", "c": "p", "ad": "the", "cat": "wash", "tg": ["wash"], "lv": 2, "ja": "\u304A\u76BF" }, { "w": "car", "c": "t", "ad": "the", "cat": "wash", "tg": ["wash", "thing", "car"], "lv": 1, "ja": "\u8ECA" }, { "w": "flower", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "draw", "see", "plant"], "lv": 2, "ja": "\u82B1" }, { "w": "present", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "present"], "lv": 1, "ja": "\u30D7\u30EC\u30BC\u30F3\u30C8" }, { "w": "hat", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "wear", "whead"], "lv": 1, "ja": "\u307C\u3046\u3057" }, { "w": "cookie", "c": "c", "ad": "a", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u30AF\u30C3\u30AD\u30FC" }, { "w": "egg", "c": "c", "ad": "a", "cat": "food", "tg": ["food", "cut"], "lv": 1, "ja": "\u305F\u307E\u3054" }, { "w": "soup", "c": "u", "ad": "", "cat": "food", "tg": ["food", "make"], "lv": 1, "ja": "\u30B9\u30FC\u30D7" }, { "w": "pen", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30DA\u30F3" }, { "w": "notebook", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "write"], "lv": 1, "ja": "\u30CE\u30FC\u30C8" }, { "w": "computer", "c": "t", "ad": "the", "cat": "thing", "tg": ["thing", "device"], "lv": 1, "ja": "\u30D1\u30BD\u30B3\u30F3" }, { "w": "toy", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "game", "toy"], "lv": 1, "ja": "\u304A\u3082\u3061\u3083" }, { "w": "map", "c": "c", "ad": "a", "cat": "read", "tg": ["read", "thing", "draw"], "lv": 1, "ja": "\u5730\u56F3" }, { "w": "shirt", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear", "thing", "wash"], "lv": 1, "ja": "\u30B7\u30E3\u30C4" }, { "w": "jacket", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear", "thing"], "lv": 1, "ja": "\u30B8\u30E3\u30B1\u30C3\u30C8" }, { "w": "shoe", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear", "wfoot", "thing", "wash"], "lv": 2, "ja": "\u304F\u3064" }, { "w": "tree", "c": "c", "ad": "a", "cat": "climb", "tg": ["climb", "plant", "see", "draw"], "lv": 1, "ja": "\u6728" }, { "w": "mountain", "c": "t", "ad": "the", "cat": "climb", "tg": ["climb", "see", "draw"], "lv": 1, "ja": "\u5C71" }, { "w": "sandcastle", "c": "c", "ad": "a", "cat": "build", "tg": ["build", "make"], "lv": 2, "ja": "\u7802\u306E\u304A\u57CE" }, { "w": "snowman", "c": "c", "ad": "a", "cat": "build", "tg": ["build", "make"], "lv": 2, "ja": "\u96EA\u3060\u308B\u307E" }, { "w": "bus", "c": "p", "ad": "the", "cat": "ride", "tg": ["ride", "car"], "lv": 1, "ja": "\u30D0\u30B9" }, { "w": "train", "c": "t", "ad": "the", "cat": "ride", "tg": ["ride", "see"], "lv": 1, "ja": "\u96FB\u8ECA" }, { "w": "rice", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u3054\u306F\u3093" }, { "w": "meat", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u8089" }, { "w": "fish", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u9B5A" }, { "w": "chicken", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u9D8F\u8089" }, { "w": "beef", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u725B\u8089" }, { "w": "pork", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u8C5A\u8089" }, { "w": "salad", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30B5\u30E9\u30C0" }, { "w": "sushi", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3059\u3057" }, { "w": "noodles", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3081\u3093" }, { "w": "strawberry", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3044\u3061\u3054" }, { "w": "orange", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30AA\u30EC\u30F3\u30B8" }, { "w": "lemon", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30EC\u30E2\u30F3" }, { "w": "peach", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3082\u3082" }, { "w": "grape", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3076\u3069\u3046" }, { "w": "melon", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30E1\u30ED\u30F3" }, { "w": "watermelon", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3059\u3044\u304B" }, { "w": "pineapple", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u30D1\u30A4\u30CA\u30C3\u30D7\u30EB" }, { "w": "tomato", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30C8\u30DE\u30C8" }, { "w": "potato", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u3058\u3083\u304C\u3044\u3082" }, { "w": "carrot", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u306B\u3093\u3058\u3093" }, { "w": "onion", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u305F\u307E\u306D\u304E" }, { "w": "cabbage", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u30AD\u30E3\u30D9\u30C4" }, { "w": "mushrooms", "c": "p", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u304D\u306E\u3053" }, { "w": "corn", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u3068\u3046\u3082\u308D\u3053\u3057" }, { "w": "cheese", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30C1\u30FC\u30BA" }, { "w": "butter", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30D0\u30BF\u30FC" }, { "w": "jam", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30B8\u30E3\u30E0" }, { "w": "chocolate", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30C1\u30E7\u30B3\u30EC\u30FC\u30C8" }, { "w": "candy", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u3042\u3081" }, { "w": "ice cream", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30A2\u30A4\u30B9\u30AF\u30EA\u30FC\u30E0" }, { "w": "donut", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u30C9\u30FC\u30CA\u30C4" }, { "w": "pie", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u30D1\u30A4" }, { "w": "pasta", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30D1\u30B9\u30BF" }, { "w": "hamburger", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30CF\u30F3\u30D0\u30FC\u30AC\u30FC" }, { "w": "hot dog", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30DB\u30C3\u30C8\u30C9\u30C3\u30B0" }, { "w": "steak", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30B9\u30C6\u30FC\u30AD" }, { "w": "toast", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30C8\u30FC\u30B9\u30C8" }, { "w": "cereal", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30B7\u30EA\u30A2\u30EB" }, { "w": "yogurt", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30E8\u30FC\u30B0\u30EB\u30C8" }, { "w": "popcorn", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 3, "ja": "\u30DD\u30C3\u30D7\u30B3\u30FC\u30F3" }, { "w": "french fries", "c": "p", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u30D5\u30E9\u30A4\u30C9\u30DD\u30C6\u30C8" }, { "w": "tofu", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u8C46\u8150" }, { "w": "natto", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u7D0D\u8C46" }, { "w": "miso soup", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u307F\u305D\u6C41" }, { "w": "udon", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u3046\u3069\u3093" }, { "w": "soba", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u305D\u3070" }, { "w": "tempura", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u5929\u3077\u3089" }, { "w": "breakfast", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u671D\u3054\u306F\u3093" }, { "w": "dinner", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u5915\u3054\u306F\u3093" }, { "w": "snack", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u304A\u3084\u3064" }, { "w": "dessert", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30C7\u30B6\u30FC\u30C8" }, { "w": "fruit", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u304F\u3060\u3082\u306E" }, { "w": "vegetables", "c": "p", "ad": "", "cat": "food", "tg": ["food", "plant"], "lv": 4, "ja": "\u91CE\u83DC" }, { "w": "pancake", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u30D1\u30F3\u30B1\u30FC\u30AD" }, { "w": "muffin", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u30DE\u30D5\u30A3\u30F3" }, { "w": "bento", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 4, "ja": "\u304A\u5F01\u5F53" }, { "w": "honey", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u306F\u3061\u307F\u3064" }, { "w": "sugar", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u7802\u7CD6" }, { "w": "salt", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u5869" }, { "w": "green tea", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u7DD1\u8336" }, { "w": "cola", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 2, "ja": "\u30B3\u30FC\u30E9" }, { "w": "soda", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 2, "ja": "\u30BD\u30FC\u30C0" }, { "w": "hot chocolate", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u30B3\u30B3\u30A2" }, { "w": "lemonade", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 2, "ja": "\u30EC\u30E2\u30CD\u30FC\u30C9" }, { "w": "apple juice", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u308A\u3093\u3054\u30B8\u30E5\u30FC\u30B9" }, { "w": "milk tea", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u30DF\u30EB\u30AF\u30C6\u30A3\u30FC" }, { "w": "smoothie", "c": "c", "ad": "a", "cat": "drink", "tg": ["drink"], "lv": 4, "ja": "\u30B9\u30E0\u30FC\u30B8\u30FC" }, { "w": "sports drink", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 1, "ja": "\u30B9\u30DD\u30FC\u30C4\u30C9\u30EA\u30F3\u30AF" }, { "w": "magazine", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u96D1\u8A8C" }, { "w": "dictionary", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u8F9E\u66F8" }, { "w": "textbook", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 2, "ja": "\u6559\u79D1\u66F8" }, { "w": "novel", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 2, "ja": "\u5C0F\u8AAC" }, { "w": "poem", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u8A69" }, { "w": "diary", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 2, "ja": "\u65E5\u8A18" }, { "w": "menu", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 2, "ja": "\u30E1\u30CB\u30E5\u30FC" }, { "w": "sign", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u770B\u677F" }, { "w": "message", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u30E1\u30C3\u30BB\u30FC\u30B8" }, { "w": "report", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 3, "ja": "\u30EC\u30DD\u30FC\u30C8" }, { "w": "instructions", "c": "p", "ad": "", "cat": "read", "tg": ["read"], "lv": 4, "ja": "\u8AAC\u660E\u66F8" }, { "w": "recipe", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 4, "ja": "\u30EC\u30B7\u30D4" }, { "w": "comics", "c": "p", "ad": "", "cat": "read", "tg": ["read"], "lv": 4, "ja": "\u307E\u3093\u304C" }, { "w": "note", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u30E1\u30E2" }, { "w": "essay", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 2, "ja": "\u4F5C\u6587" }, { "w": "postcard", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 3, "ja": "\u306F\u304C\u304D" }, { "w": "card", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u30AB\u30FC\u30C9" }, { "w": "list", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u30EA\u30B9\u30C8" }, { "w": "answer", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u7B54\u3048" }, { "w": "question", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u8CEA\u554F" }, { "w": "pencil", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u3048\u3093\u3074\u3064" }, { "w": "eraser", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u6D88\u3057\u30B4\u30E0" }, { "w": "ruler", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u5B9A\u898F" }, { "w": "scissors", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u306F\u3055\u307F" }, { "w": "glue", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u306E\u308A" }, { "w": "desk", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u673A" }, { "w": "chair", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u3044\u3059" }, { "w": "table", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30C6\u30FC\u30D6\u30EB" }, { "w": "bed", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30D9\u30C3\u30C9" }, { "w": "sofa", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30BD\u30D5\u30A1\u30FC" }, { "w": "clock", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u6642\u8A08" }, { "w": "watch", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u8155\u6642\u8A08" }, { "w": "cup", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30AB\u30C3\u30D7" }, { "w": "glass", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B3\u30C3\u30D7" }, { "w": "plate", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u76BF" }, { "w": "bowl", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u304A\u308F\u3093" }, { "w": "spoon", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B9\u30D7\u30FC\u30F3" }, { "w": "fork", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30D5\u30A9\u30FC\u30AF" }, { "w": "knife", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30CA\u30A4\u30D5" }, { "w": "chopsticks", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u306F\u3057" }, { "w": "bottle", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u3073\u3093" }, { "w": "wallet", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u3055\u3044\u3075" }, { "w": "ticket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u5207\u7B26" }, { "w": "coin", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B3\u30A4\u30F3" }, { "w": "glasses", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u3081\u304C\u306D" }, { "w": "ring", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u6307\u8F2A" }, { "w": "necklace", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30CD\u30C3\u30AF\u30EC\u30B9" }, { "w": "towel", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30BF\u30AA\u30EB" }, { "w": "soap", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u305B\u3063\u3051\u3093" }, { "w": "toothbrush", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u6B6F\u30D6\u30E9\u30B7" }, { "w": "pillow", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u307E\u304F\u3089" }, { "w": "blanket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u6BDB\u5E03" }, { "w": "lamp", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30E9\u30F3\u30D7" }, { "w": "mirror", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u93E1" }, { "w": "basket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u304B\u3054" }, { "w": "backpack", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30EA\u30E5\u30C3\u30AF" }, { "w": "suitcase", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9" }, { "w": "tablet", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30BF\u30D6\u30EC\u30C3\u30C8" }, { "w": "laptop", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3" }, { "w": "headphones", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30D8\u30C3\u30C9\u30DB\u30F3" }, { "w": "speaker", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B9\u30D4\u30FC\u30AB\u30FC" }, { "w": "charger", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u5145\u96FB\u5668" }, { "w": "battery", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u96FB\u6C60" }, { "w": "remote", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30EA\u30E2\u30B3\u30F3" }, { "w": "fan", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u6247\u98A8\u6A5F" }, { "w": "heater", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30D2\u30FC\u30BF\u30FC" }, { "w": "fridge", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u51B7\u8535\u5EAB" }, { "w": "microwave", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u96FB\u5B50\u30EC\u30F3\u30B8" }, { "w": "oven", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30AA\u30FC\u30D6\u30F3" }, { "w": "rope", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30ED\u30FC\u30D7" }, { "w": "bucket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30D0\u30B1\u30C4" }, { "w": "shovel", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30B7\u30E3\u30D9\u30EB" }, { "w": "flag", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u65D7" }, { "w": "balloon", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u98A8\u8239" }, { "w": "candle", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u308D\u3046\u305D\u304F" }, { "w": "gift", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u8D08\u308A\u7269" }, { "w": "doll", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u4EBA\u5F62" }, { "w": "puzzle", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30D1\u30BA\u30EB" }, { "w": "kite", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u305F\u3053" }, { "w": "sticker", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30B7\u30FC\u30EB" }, { "w": "crayons", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30AF\u30EC\u30E8\u30F3" }, { "w": "paintbrush", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u7D75\u7B46" }, { "w": "paints", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u7D75\u306E\u5177" }, { "w": "tent", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u30C6\u30F3\u30C8" }, { "w": "flashlight", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u61D0\u4E2D\u96FB\u706F" }, { "w": "sunglasses", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B5\u30F3\u30B0\u30E9\u30B9" }, { "w": "glove", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u624B\u888B" }, { "w": "scarf", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30DE\u30D5\u30E9\u30FC" }, { "w": "sock", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u304F\u3064\u4E0B" }, { "w": "boot", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30D6\u30FC\u30C4" }, { "w": "skirt", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B9\u30AB\u30FC\u30C8" }, { "w": "dress", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30C9\u30EC\u30B9" }, { "w": "pants", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30BA\u30DC\u30F3" }, { "w": "jeans", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B8\u30FC\u30F3\u30BA" }, { "w": "sweater", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30BB\u30FC\u30BF\u30FC" }, { "w": "coat", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B3\u30FC\u30C8" }, { "w": "cap", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30AD\u30E3\u30C3\u30D7" }, { "w": "uniform", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5236\u670D" }, { "w": "pajamas", "c": "p", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u30D1\u30B8\u30E3\u30DE" }, { "w": "t-shirt", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "T\u30B7\u30E3\u30C4" }, { "w": "belt", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30D9\u30EB\u30C8" }, { "w": "button", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30DC\u30BF\u30F3" }, { "w": "pocket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30DD\u30B1\u30C3\u30C8" }, { "w": "trash can", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u3054\u307F\u7BB1" }, { "w": "trash", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u3054\u307F" }, { "w": "plant", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u690D\u7269" }, { "w": "flower pot", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 3, "ja": "\u690D\u6728\u9262" }, { "w": "stone", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u77F3" }, { "w": "stick", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u68D2" }, { "w": "leaf", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u8449\u3063\u3071" }, { "w": "leave", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 4, "ja": "\u843D\u3061\u8449" }, { "w": "shell", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u8C9D\u304C\u3089" }, { "w": "seed", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "plant"], "lv": 4, "ja": "\u7A2E" }, { "w": "volleyball", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u30D0\u30EC\u30FC\u30DC\u30FC\u30EB" }, { "w": "table tennis", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u5353\u7403" }, { "w": "badminton", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3" }, { "w": "golf", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30B4\u30EB\u30D5" }, { "w": "rugby", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30E9\u30B0\u30D3\u30FC" }, { "w": "judo", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u67D4\u9053" }, { "w": "karate", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u7A7A\u624B" }, { "w": "kendo", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u5263\u9053" }, { "w": "swimming", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u6C34\u6CF3" }, { "w": "skiing", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30B9\u30AD\u30FC" }, { "w": "skating", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30B9\u30B1\u30FC\u30C8" }, { "w": "surfing", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 2, "ja": "\u30B5\u30FC\u30D5\u30A3\u30F3" }, { "w": "dodgeball", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u30C9\u30C3\u30B8\u30DC\u30FC\u30EB" }, { "w": "tag", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u9B3C\u3054\u3063\u3053" }, { "w": "hide-and-seek", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 4, "ja": "\u304B\u304F\u308C\u3093\u307C" }, { "w": "track and field", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u9678\u4E0A" }, { "w": "violin", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 2, "ja": "\u30D0\u30A4\u30AA\u30EA\u30F3" }, { "w": "flute", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 3, "ja": "\u30D5\u30EB\u30FC\u30C8" }, { "w": "drum", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 1, "ja": "\u30C9\u30E9\u30E0" }, { "w": "trumpet", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 3, "ja": "\u30C8\u30E9\u30F3\u30DA\u30C3\u30C8" }, { "w": "harmonica", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 4, "ja": "\u30CF\u30FC\u30E2\u30CB\u30AB" }, { "w": "recorder", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 4, "ja": "\u30EA\u30B3\u30FC\u30C0\u30FC" }, { "w": "ukulele", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 4, "ja": "\u30A6\u30AF\u30EC\u30EC" }, { "w": "keyboard", "c": "t", "ad": "the", "cat": "instr", "tg": ["instr"], "lv": 3, "ja": "\u30AD\u30FC\u30DC\u30FC\u30C9" }, { "w": "board game", "c": "c", "ad": "a", "cat": "game", "tg": ["game"], "lv": 2, "ja": "\u30DC\u30FC\u30C9\u30B2\u30FC\u30E0" }, { "w": "chess", "c": "u", "ad": "", "cat": "game", "tg": ["game"], "lv": 2, "ja": "\u30C1\u30A7\u30B9" }, { "w": "shogi", "c": "u", "ad": "", "cat": "game", "tg": ["game"], "lv": 4, "ja": "\u5C06\u68CB" }, { "w": "card game", "c": "c", "ad": "a", "cat": "game", "tg": ["game"], "lv": 1, "ja": "\u30AB\u30FC\u30C9\u30B2\u30FC\u30E0" }, { "w": "video game", "c": "c", "ad": "a", "cat": "game", "tg": ["game"], "lv": 2, "ja": "\u30C6\u30EC\u30D3\u30B2\u30FC\u30E0" }, { "w": "quiz", "c": "c", "ad": "a", "cat": "game", "tg": ["game"], "lv": 2, "ja": "\u30AF\u30A4\u30BA" }, { "w": "riddle", "c": "c", "ad": "a", "cat": "game", "tg": ["game"], "lv": 4, "ja": "\u306A\u305E\u306A\u305E" }, { "w": "jazz", "c": "u", "ad": "", "cat": "music", "tg": ["music"], "lv": 3, "ja": "\u30B8\u30E3\u30BA" }, { "w": "rock", "c": "u", "ad": "", "cat": "music", "tg": ["music"], "lv": 2, "ja": "\u30ED\u30C3\u30AF" }, { "w": "pop music", "c": "u", "ad": "", "cat": "music", "tg": ["music"], "lv": 1, "ja": "\u30DD\u30C3\u30D7\u30B9" }, { "w": "classical music", "c": "u", "ad": "", "cat": "music", "tg": ["music"], "lv": 2, "ja": "\u30AF\u30E9\u30B7\u30C3\u30AF" }, { "w": "podcast", "c": "c", "ad": "a", "cat": "music", "tg": ["music"], "lv": 4, "ja": "\u30DD\u30C3\u30C9\u30AD\u30E3\u30B9\u30C8" }, { "w": "concert", "c": "c", "ad": "a", "cat": "music", "tg": ["music"], "lv": 1, "ja": "\u30B3\u30F3\u30B5\u30FC\u30C8" }, { "w": "science", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u7406\u79D1" }, { "w": "history", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u6B74\u53F2" }, { "w": "Japanese history", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u65E5\u672C\u53F2" }, { "w": "art", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u7F8E\u8853" }, { "w": "social studies", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u793E\u4F1A" }, { "w": "Chinese", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 4, "ja": "\u4E2D\u56FD\u8A9E" }, { "w": "Korean", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 4, "ja": "\u97D3\u56FD\u8A9E" }, { "w": "French", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 4, "ja": "\u30D5\u30E9\u30F3\u30B9\u8A9E" }, { "w": "Spanish", "c": "n", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 4, "ja": "\u30B9\u30DA\u30A4\u30F3\u8A9E" }, { "w": "programming", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 4, "ja": "\u30D7\u30ED\u30B0\u30E9\u30DF\u30F3\u30B0" }, { "w": "geography", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 3, "ja": "\u5730\u7406" }, { "w": "anime", "c": "u", "ad": "", "cat": "watch", "tg": ["watch"], "lv": 4, "ja": "\u30A2\u30CB\u30E1" }, { "w": "drama", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u30C9\u30E9\u30DE" }, { "w": "cartoon", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u307E\u3093\u304C\u6620\u753B" }, { "w": "video", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u52D5\u753B" }, { "w": "show", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch", "event"], "lv": 2, "ja": "\u756A\u7D44" }, { "w": "sunset", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 3, "ja": "\u5915\u65E5" }, { "w": "sunrise", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 3, "ja": "\u65E5\u306E\u51FA" }, { "w": "fireworks", "c": "u", "ad": "", "cat": "watch", "tg": ["watch"], "lv": 4, "ja": "\u82B1\u706B" }, { "w": "parade", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 4, "ja": "\u30D1\u30EC\u30FC\u30C9" }, { "w": "game", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u8A66\u5408" }, { "w": "play", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u5287" }, { "w": "taxi", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u30BF\u30AF\u30B7\u30FC" }, { "w": "plane", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u98DB\u884C\u6A5F" }, { "w": "ship", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u8239" }, { "w": "boat", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u30DC\u30FC\u30C8" }, { "w": "subway", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u5730\u4E0B\u9244" }, { "w": "motorcycle", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 3, "ja": "\u30D0\u30A4\u30AF" }, { "w": "scooter", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 4, "ja": "\u30B9\u30AF\u30FC\u30BF\u30FC" }, { "w": "skateboard", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 4, "ja": "\u30B9\u30B1\u30DC\u30FC" }, { "w": "unicycle", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 4, "ja": "\u4E00\u8F2A\u8ECA" }, { "w": "roller coaster", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 4, "ja": "\u30B8\u30A7\u30C3\u30C8\u30B3\u30FC\u30B9\u30BF\u30FC" }, { "w": "elevator", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 2, "ja": "\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC" }, { "w": "escalator", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 2, "ja": "\u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC" }, { "w": "test", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30C6\u30B9\u30C8" }, { "w": "exam", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u8A66\u9A13" }, { "w": "class", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u6388\u696D" }, { "w": "lesson", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30EC\u30C3\u30B9\u30F3" }, { "w": "festival", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u304A\u796D\u308A" }, { "w": "wedding", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u7D50\u5A5A\u5F0F" }, { "w": "birthday party", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u8A95\u751F\u65E5\u4F1A" }, { "w": "sports day", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u904B\u52D5\u4F1A" }, { "w": "school trip", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u4FEE\u5B66\u65C5\u884C" }, { "w": "vacation", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u4F11\u307F" }, { "w": "picnic", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30D4\u30AF\u30CB\u30C3\u30AF" }, { "w": "camp", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30AD\u30E3\u30F3\u30D7" }, { "w": "match", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u8A66\u5408" }, { "w": "contest", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30B3\u30F3\u30C6\u30B9\u30C8" }, { "w": "interview", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u9762\u63A5" }, { "w": "appointment", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u4E88\u7D04" }, { "w": "kitchen", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u53F0\u6240" }, { "w": "bathroom", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u6D74\u5BA4" }, { "w": "classroom", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u6559\u5BA4" }, { "w": "garden", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u5EAD" }, { "w": "yard", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u5EAD" }, { "w": "floor", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u5E8A" }, { "w": "face", "c": "c", "ad": "a", "cat": "wash", "tg": ["wash"], "lv": 1, "ja": "\u9854" }, { "w": "hand", "c": "c", "ad": "a", "cat": "wash", "tg": ["wash"], "lv": 4, "ja": "\u624B" }, { "w": "hair", "c": "u", "ad": "", "cat": "wash", "tg": ["wash"], "lv": 1, "ja": "\u9AEA" }, { "w": "clothes", "c": "p", "ad": "", "cat": "wash", "tg": ["wash"], "lv": 1, "ja": "\u670D" }, { "w": "light switch", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 3, "ja": "\u30B9\u30A4\u30C3\u30C1" }, { "w": "air conditioner", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 2, "ja": "\u30A8\u30A2\u30B3\u30F3" }, { "w": "alarm", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 2, "ja": "\u76EE\u899A\u307E\u3057" }, { "w": "music player", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 1, "ja": "\u97F3\u697D\u30D7\u30EC\u30FC\u30E4\u30FC" }, { "w": "printer", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 2, "ja": "\u30D7\u30EA\u30F3\u30BF\u30FC" }, { "w": "game console", "c": "c", "ad": "a", "cat": "device", "tg": ["device"], "lv": 4, "ja": "\u30B2\u30FC\u30E0\u6A5F" }, { "w": "circle", "c": "c", "ad": "a", "cat": "draw", "tg": ["draw"], "lv": 1, "ja": "\u5186" }, { "w": "line", "c": "c", "ad": "a", "cat": "draw", "tg": ["draw"], "lv": 1, "ja": "\u7DDA" }, { "w": "heart", "c": "c", "ad": "a", "cat": "draw", "tg": ["draw"], "lv": 1, "ja": "\u30CF\u30FC\u30C8" }, { "w": "kanji", "c": "u", "ad": "", "cat": "word", "tg": ["word"], "lv": 4, "ja": "\u6F22\u5B57" }, { "w": "phrase", "c": "c", "ad": "a", "cat": "word", "tg": ["word"], "lv": 3, "ja": "\u30D5\u30EC\u30FC\u30BA" }, { "w": "idiom", "c": "c", "ad": "a", "cat": "word", "tg": ["word"], "lv": 3, "ja": "\u719F\u8A9E" }, { "w": "spelling", "c": "u", "ad": "", "cat": "word", "tg": ["word"], "lv": 3, "ja": "\u3064\u3065\u308A" }, { "w": "meaning", "c": "c", "ad": "a", "cat": "word", "tg": ["word"], "lv": 2, "ja": "\u610F\u5473" }, { "w": "invitation card", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 1, "ja": "\u62DB\u5F85\u72B6" }, { "w": "job offer", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 2, "ja": "\u4ED5\u4E8B\u306E\u8A71" }, { "w": "idea", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 1, "ja": "\u30A2\u30A4\u30C7\u30A2" }, { "w": "plan", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 3, "ja": "\u8A08\u753B" }, { "w": "proposal", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 3, "ja": "\u63D0\u6848" }, { "w": "request", "c": "c", "ad": "a", "cat": "offer", "tg": ["offer"], "lv": 2, "ja": "\u304A\u9858\u3044" }, { "w": "fear", "c": "u", "ad": "", "cat": "over", "tg": ["over"], "lv": 2, "ja": "\u6050\u6016" }, { "w": "sadness", "c": "u", "ad": "", "cat": "over", "tg": ["over"], "lv": 3, "ja": "\u60B2\u3057\u307F" }, { "w": "problem", "c": "c", "ad": "a", "cat": "over", "tg": ["over"], "lv": 1, "ja": "\u554F\u984C" }, { "w": "jet lag", "c": "u", "ad": "", "cat": "over", "tg": ["over"], "lv": 1, "ja": "\u6642\u5DEE\u307C\u3051" }, { "w": "flu", "c": "t", "ad": "the", "cat": "over", "tg": ["over"], "lv": 3, "ja": "\u30A4\u30F3\u30D5\u30EB\u30A8\u30F3\u30B6" }, { "w": "breakup", "c": "c", "ad": "a", "cat": "over", "tg": ["over"], "lv": 4, "ja": "\u5931\u604B" }, { "w": "model", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 2, "ja": "\u6A21\u578B" }, { "w": "bridge", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 1, "ja": "\u6A4B" }, { "w": "tower", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 1, "ja": "\u5854" }, { "w": "igloo", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 4, "ja": "\u304B\u307E\u304F\u3089" }, { "w": "birdhouse", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 4, "ja": "\u5DE3\u7BB1" }, { "w": "fort", "c": "c", "ad": "a", "cat": "build", "tg": ["build"], "lv": 4, "ja": "\u79D8\u5BC6\u57FA\u5730" }, { "w": "sunflower", "c": "c", "ad": "a", "cat": "plant", "tg": ["plant"], "lv": 2, "ja": "\u3072\u307E\u308F\u308A" }, { "w": "tulip", "c": "c", "ad": "a", "cat": "plant", "tg": ["plant"], "lv": 4, "ja": "\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7" }, { "w": "rose", "c": "c", "ad": "a", "cat": "plant", "tg": ["plant"], "lv": 1, "ja": "\u30D0\u30E9" }, { "w": "rice plant", "c": "c", "ad": "a", "cat": "plant", "tg": ["plant"], "lv": 2, "ja": "\u7A32" }, { "w": "animals", "c": "t", "ad": "the", "cat": "animal", "tg": ["animal"], "lv": 4, "ja": "\u52D5\u7269\u305F\u3061" }, { "w": "album", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "music", "thing"], "lv": 1, "ja": "\u30A2\u30EB\u30D0\u30E0" }, { "w": "bell", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30D9\u30EB" }, { "w": "board", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u677F" }, { "w": "bone", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u9AA8" }, { "w": "brush", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30D6\u30E9\u30B7" }, { "w": "CD", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing", "music", "thing"], "lv": 1, "ja": "CD" }, { "w": "cloth", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u5E03" }, { "w": "credit card", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9" }, { "w": "file", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30D5\u30A1\u30A4\u30EB" }, { "w": "money", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u304A\u91D1" }, { "w": "jewelry", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u5B9D\u77F3" }, { "w": "machine", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u6A5F\u68B0" }, { "w": "mobile phone", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u643A\u5E2F\u96FB\u8A71" }, { "w": "paint", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30DA\u30F3\u30AD" }, { "w": "paper", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u7D19" }, { "w": "poster", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30DD\u30B9\u30BF\u30FC" }, { "w": "ribbon", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30EA\u30DC\u30F3" }, { "w": "seat", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u5E2D" }, { "w": "shelf", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u68DA" }, { "w": "telephone", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u96FB\u8A71" }, { "w": "tool", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u9053\u5177" }, { "w": "vase", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u82B1\u3073\u3093" }, { "w": "wheel", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u8ECA\u8F2A" }, { "w": "collection", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3" }, { "w": "dollar", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 1, "ja": "1\u30C9\u30EB" }, { "w": "apron", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear"], "lv": 1, "ja": "\u30A8\u30D7\u30ED\u30F3" }, { "w": "bat", "c": "c", "ad": "a", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u30D0\u30C3\u30C8" }, { "w": "sports", "c": "u", "ad": "", "cat": "sport", "tg": ["sport"], "lv": 1, "ja": "\u30B9\u30DD\u30FC\u30C4" }, { "w": "bean", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u8C46" }, { "w": "biscuit", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30D3\u30B9\u30B1\u30C3\u30C8" }, { "w": "cream", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u30AF\u30EA\u30FC\u30E0" }, { "w": "ice", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u6C37" }, { "w": "meal", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u98DF\u4E8B" }, { "w": "food", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 1, "ja": "\u98DF\u3079\u7269" }, { "w": "bicycle", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u81EA\u8EE2\u8ECA" }, { "w": "truck", "c": "c", "ad": "a", "cat": "ride", "tg": ["ride"], "lv": 1, "ja": "\u30C8\u30E9\u30C3\u30AF" }, { "w": "DVD", "c": "c", "ad": "a", "cat": "music", "tg": ["music", "music", "thing"], "lv": 1, "ja": "DVD" }, { "w": "program", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u756A\u7D44" }, { "w": "sky", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u7A7A" }, { "w": "moon", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u6708" }, { "w": "sun", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u592A\u967D" }, { "w": "snow", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u96EA" }, { "w": "painting", "c": "c", "ad": "a", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u7D75" }, { "w": "world", "c": "t", "ad": "the", "cat": "watch", "tg": ["watch"], "lv": 1, "ja": "\u4E16\u754C" }, { "w": "mail", "c": "u", "ad": "", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u90F5\u4FBF\u7269" }, { "w": "page", "c": "c", "ad": "a", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u30DA\u30FC\u30B8" }, { "w": "information", "c": "u", "ad": "", "cat": "read", "tg": ["read"], "lv": 1, "ja": "\u60C5\u5831" }, { "w": "number", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u756A\u53F7" }, { "w": "sentence", "c": "c", "ad": "a", "cat": "write", "tg": ["write"], "lv": 1, "ja": "\u6587" }, { "w": "language", "c": "c", "ad": "a", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u8A00\u8A9E" }, { "w": "grammar", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u6587\u6CD5" }, { "w": "subject", "c": "c", "ad": "a", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u6559\u79D1" }, { "w": "culture", "c": "u", "ad": "", "cat": "lang", "tg": ["lang"], "lv": 1, "ja": "\u6587\u5316" }, { "w": "grass", "c": "u", "ad": "", "cat": "plant", "tg": ["plant"], "lv": 1, "ja": "\u8349" }, { "w": "wall", "c": "c", "ad": "a", "cat": "clean", "tg": ["clean"], "lv": 1, "ja": "\u58C1" }, { "w": "time", "c": "t", "ad": "the", "cat": "clock", "tg": ["clock"], "lv": 1, "ja": "\u6642\u523B" }, { "w": "birthday", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u8A95\u751F\u65E5" }, { "w": "holiday", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u4F11\u65E5" }, { "w": "celebration", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u304A\u795D\u3044" }, { "w": "speech", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30B9\u30D4\u30FC\u30C1" }, { "w": "practice", "c": "u", "ad": "", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u7DF4\u7FD2" }, { "w": "activity", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u6D3B\u52D5" }, { "w": "club", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u30AF\u30E9\u30D6" }, { "w": "conversation", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 1, "ja": "\u4F1A\u8A71" }, { "w": "hobby", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u8DA3\u5473" }, { "w": "job", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u4ED5\u4E8B" }, { "w": "dream", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u5922" }, { "w": "memory", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u601D\u3044\u51FA" }, { "w": "life", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u4EBA\u751F" }, { "w": "luck", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u904B" }, { "w": "peace", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u5E73\u548C" }, { "w": "way", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u65B9\u6CD5" }, { "w": "rule", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u30EB\u30FC\u30EB" }, { "w": "reason", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u7406\u7531" }, { "w": "result", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u7D50\u679C" }, { "w": "example", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u4F8B" }, { "w": "weather", "c": "t", "ad": "the", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u5929\u6C17" }, { "w": "health", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u5065\u5EB7" }, { "w": "future", "c": "t", "ad": "the", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u672A\u6765" }, { "w": "skill", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u6280\u8853" }, { "w": "habit", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u7FD2\u6163" }, { "w": "feeling", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u6C17\u6301\u3061" }, { "w": "difference", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u3061\u304C\u3044" }, { "w": "fun", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u697D\u3057\u3044\u3053\u3068" }, { "w": "love", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u611B" }, { "w": "help", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u52A9\u3051" }, { "w": "advice", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 1, "ja": "\u30A2\u30C9\u30D0\u30A4\u30B9" }, { "w": "arm", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u8155" }, { "w": "ear", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u8033" }, { "w": "eye", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u76EE" }, { "w": "head", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u982D" }, { "w": "leg", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u8DB3" }, { "w": "mouth", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u53E3" }, { "w": "neck", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u9996" }, { "w": "nose", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u9F3B" }, { "w": "shoulder", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u80A9" }, { "w": "teeth", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u6B6F" }, { "w": "knee", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u3072\u3056" }, { "w": "body", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 1, "ja": "\u4F53" }, { "w": "alarm clock", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u76EE\u899A\u307E\u3057\u6642\u8A08" }, { "w": "armchair", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u3072\u3058\u304B\u3051\u3044\u3059" }, { "w": "bench", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30D9\u30F3\u30C1" }, { "w": "bill", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u8ACB\u6C42\u66F8" }, { "w": "blackboard", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u9ED2\u677F" }, { "w": "bookshelf", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u672C\u68DA" }, { "w": "light bulb", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u96FB\u7403" }, { "w": "calendar", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30AB\u30EC\u30F3\u30C0\u30FC" }, { "w": "can", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u7F36" }, { "w": "cash", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u73FE\u91D1" }, { "w": "chain", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u304F\u3055\u308A" }, { "w": "comb", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u304F\u3057" }, { "w": "container", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5BB9\u5668" }, { "w": "crown", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u738B\u51A0" }, { "w": "cupboard", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u98DF\u5668\u68DA" }, { "w": "diamond", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30C0\u30A4\u30E4\u30E2\u30F3\u30C9" }, { "w": "digital camera", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30C7\u30B8\u30AB\u30E1" }, { "w": "drawer", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5F15\u304D\u51FA\u3057" }, { "w": "earring", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30A4\u30E4\u30EA\u30F3\u30B0" }, { "w": "envelope", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5C01\u7B52" }, { "w": "feather", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u7FBD" }, { "w": "folder", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30D5\u30A9\u30EB\u30C0\u30FC" }, { "w": "furniture", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5BB6\u5177" }, { "w": "gate", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u9580" }, { "w": "globe", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5730\u7403\u5100" }, { "w": "guidebook", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30AC\u30A4\u30C9\u30D6\u30C3\u30AF" }, { "w": "handbag", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30CF\u30F3\u30C9\u30D0\u30C3\u30B0" }, { "w": "handle", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u53D6\u3063\u624B" }, { "w": "lock", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u9320" }, { "w": "medal", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30E1\u30C0\u30EB" }, { "w": "mug", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30DE\u30B0\u30AB\u30C3\u30D7" }, { "w": "napkin", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30CA\u30D7\u30AD\u30F3" }, { "w": "pan", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30D5\u30E9\u30A4\u30D1\u30F3" }, { "w": "perfume", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u9999\u6C34" }, { "w": "pill", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u9320\u5264" }, { "w": "racket", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30E9\u30B1\u30C3\u30C8" }, { "w": "receipt", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30EC\u30B7\u30FC\u30C8" }, { "w": "screen", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u753B\u9762" }, { "w": "shampoo", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B7\u30E3\u30F3\u30D7\u30FC" }, { "w": "stamp", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5207\u624B" }, { "w": "stove", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30B3\u30F3\u30ED" }, { "w": "tape", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u30C6\u30FC\u30D7" }, { "w": "treasure", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u5B9D\u7269" }, { "w": "washing machine", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u6D17\u6FEF\u6A5F" }, { "w": "wheelchair", "c": "c", "ad": "a", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u8ECA\u3044\u3059" }, { "w": "wood", "c": "u", "ad": "", "cat": "thing", "tg": ["thing"], "lv": 2, "ja": "\u6728\u6750" }, { "w": "raincoat", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear"], "lv": 2, "ja": "\u30EC\u30A4\u30F3\u30B3\u30FC\u30C8" }, { "w": "shorts", "c": "p", "ad": "", "cat": "wear", "tg": ["wear"], "lv": 2, "ja": "\u77ED\u30D1\u30F3" }, { "w": "suit", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear"], "lv": 2, "ja": "\u30B9\u30FC\u30C4" }, { "w": "swimsuit", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear"], "lv": 2, "ja": "\u6C34\u7740" }, { "w": "tie", "c": "c", "ad": "a", "cat": "wear", "tg": ["wear"], "lv": 2, "ja": "\u30CD\u30AF\u30BF\u30A4" }, { "w": "flour", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u5C0F\u9EA6\u7C89" }, { "w": "ham", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30CF\u30E0" }, { "w": "jelly", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30BC\u30EA\u30FC" }, { "w": "oil", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u6CB9" }, { "w": "pear", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u6D0B\u30CA\u30B7" }, { "w": "pepper", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30B3\u30B7\u30E7\u30A6" }, { "w": "sauce", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30BD\u30FC\u30B9" }, { "w": "sausage", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30BD\u30FC\u30BB\u30FC\u30B8" }, { "w": "spaghetti", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30B9\u30D1\u30B2\u30C3\u30C6\u30A3" }, { "w": "seafood", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u9B5A\u4ECB\u985E" }, { "w": "garlic", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30CB\u30F3\u30CB\u30AF" }, { "w": "omelet", "c": "c", "ad": "a", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30AA\u30E0\u30EC\u30C4" }, { "w": "fast food", "c": "u", "ad": "", "cat": "food", "tg": ["food"], "lv": 2, "ja": "\u30D5\u30A1\u30B9\u30C8\u30D5\u30FC\u30C9" }, { "w": "mineral water", "c": "u", "ad": "", "cat": "drink", "tg": ["drink"], "lv": 2, "ja": "\u30DF\u30CD\u30E9\u30EB\u30A6\u30A9\u30FC\u30BF\u30FC" }, { "w": "soft drink", "c": "c", "ad": "a", "cat": "drink", "tg": ["drink"], "lv": 2, "ja": "\u30B8\u30E5\u30FC\u30B9\u985E" }, { "w": "instrument", "c": "c", "ad": "a", "cat": "instr", "tg": ["instr"], "lv": 2, "ja": "\u697D\u5668" }, { "w": "road", "c": "t", "ad": "the", "cat": "road", "tg": ["road"], "lv": 2, "ja": "\u9053" }, { "w": "street", "c": "t", "ad": "the", "cat": "road", "tg": ["road"], "lv": 2, "ja": "\u901A\u308A" }, { "w": "river", "c": "t", "ad": "the", "cat": "road", "tg": ["road"], "lv": 2, "ja": "\u5DDD" }, { "w": "accident", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u4E8B\u6545" }, { "w": "adventure", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u5192\u967A" }, { "w": "anniversary", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u8A18\u5FF5\u65E5" }, { "w": "award", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u8CDE" }, { "w": "barbecue", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30D0\u30FC\u30D9\u30AD\u30E5\u30FC" }, { "w": "challenge", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u6311\u6226" }, { "w": "competition", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u5927\u4F1A" }, { "w": "cruise", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30AF\u30EB\u30FC\u30BA" }, { "w": "emergency", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u7DCA\u6025\u4E8B\u614B" }, { "w": "exhibition", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u5C55\u793A\u4F1A" }, { "w": "flight", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30D5\u30E9\u30A4\u30C8" }, { "w": "hike", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30CF\u30A4\u30AD\u30F3\u30B0" }, { "w": "journey", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u65C5" }, { "w": "performance", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u516C\u6F14" }, { "w": "reunion", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u540C\u7A93\u4F1A" }, { "w": "schedule", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u4E88\u5B9A" }, { "w": "tour", "c": "c", "ad": "a", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u30C4\u30A2\u30FC" }, { "w": "sightseeing", "c": "u", "ad": "", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u89B3\u5149" }, { "w": "travel", "c": "u", "ad": "", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u65C5\u884C" }, { "w": "exercise", "c": "u", "ad": "", "cat": "event", "tg": ["event"], "lv": 2, "ja": "\u904B\u52D5" }, { "w": "chance", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u30C1\u30E3\u30F3\u30B9" }, { "w": "choice", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u9078\u629E" }, { "w": "diet", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u30C0\u30A4\u30A8\u30C3\u30C8" }, { "w": "experience", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u7D4C\u9A13" }, { "w": "fashion", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u6D41\u884C" }, { "w": "mistake", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u307E\u3061\u304C\u3044" }, { "w": "mystery", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u306A\u305E" }, { "w": "opinion", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u610F\u898B" }, { "w": "opportunity", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u6A5F\u4F1A" }, { "w": "promise", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u7D04\u675F" }, { "w": "tradition", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u4F1D\u7D71" }, { "w": "trouble", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u30C8\u30E9\u30D6\u30EB" }, { "w": "knowledge", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u77E5\u8B58" }, { "w": "talent", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u624D\u80FD" }, { "w": "success", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u6210\u529F" }, { "w": "happiness", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u5E78\u305B" }, { "w": "freedom", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u81EA\u7531" }, { "w": "friendship", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u53CB\u60C5" }, { "w": "nature", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u81EA\u7136" }, { "w": "fact", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u4E8B\u5B9F" }, { "w": "solution", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u89E3\u6C7A\u7B56" }, { "w": "weight", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u4F53\u91CD" }, { "w": "temperature", "c": "t", "ad": "the", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u6C17\u6E29" }, { "w": "view", "c": "t", "ad": "the", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u666F\u8272" }, { "w": "sunlight", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u65E5\u5149" }, { "w": "storm", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u5D50" }, { "w": "earthquake", "c": "c", "ad": "a", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u5730\u9707" }, { "w": "fog", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u9727" }, { "w": "energy", "c": "u", "ad": "", "cat": "abstract", "tg": ["abstract"], "lv": 2, "ja": "\u30A8\u30CD\u30EB\u30AE\u30FC" }, { "w": "ankle", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u8DB3\u9996" }, { "w": "cheek", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u307B\u304A" }, { "w": "chest", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u80F8" }, { "w": "chin", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u3042\u3054" }, { "w": "lip", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u304F\u3061\u3073\u308B" }, { "w": "stomach", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u304A\u306A\u304B" }, { "w": "toe", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u3064\u307E\u5148" }, { "w": "voice", "c": "c", "ad": "my", "cat": "body", "tg": ["body", "wash"], "lv": 2, "ja": "\u58F0" }, { "w": "something", "c": "n", "ad": "", "cat": "person", "ind": 1, "lv": 1, "ja": "\u4F55\u304B" }, { "w": "everything", "c": "n", "ad": "", "cat": "person", "ind": 1, "lv": 1, "ja": "\u305C\u3093\u3076" }, { "w": "someone", "c": "n", "ad": "", "cat": "person", "ind": 1, "lv": 1, "ja": "\u3060\u308C\u304B" }, { "w": "everyone", "c": "n", "ad": "", "cat": "person", "ind": 1, "lv": 1, "ja": "\u307F\u3093\u306A" }, { "w": "Ken", "c": "n", "ad": "", "cat": "person", "lv": 2, "ja": "\u30B1\u30F3" }, { "w": "Mika", "c": "n", "ad": "", "cat": "person", "lv": 2, "ja": "\u30DF\u30AB" }, { "w": "mom", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u304A\u6BCD\u3055\u3093" }, { "w": "dad", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u304A\u7236\u3055\u3093" }, { "w": "grandma", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u304A\u3070\u3042\u3061\u3083\u3093" }, { "w": "teacher", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5148\u751F" }, { "w": "boy", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u7537\u306E\u5B50" }, { "w": "girl", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5973\u306E\u5B50" }, { "w": "baby", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u8D64\u3061\u3083\u3093" }, { "w": "friend", "c": "c", "ad": "my", "cat": "person", "lv": 2, "ja": "\u53CB\u3060\u3061" }, { "w": "student", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u751F\u5F92\u305F\u3061" }, { "w": "dog", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u72AC" }, { "w": "cat", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u306D\u3053" }, { "w": "bird", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u9CE5" }, { "w": "rabbit", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u3046\u3055\u304E" }, { "w": "horse", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u99AC" }, { "w": "robot", "c": "c", "ad": "the", "cat": "person", "lv": 3, "ja": "\u30ED\u30DC\u30C3\u30C8" }, { "w": "lion", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30E9\u30A4\u30AA\u30F3" }, { "w": "tiger", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30C8\u30E9" }, { "w": "elephant", "c": "c", "ad": "the", "cat": "animal", "lv": 2, "ja": "\u30BE\u30A6" }, { "w": "giraffe", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30AD\u30EA\u30F3" }, { "w": "monkey", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30B5\u30EB" }, { "w": "panda", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30D1\u30F3\u30C0" }, { "w": "bear", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30AF\u30DE" }, { "w": "penguin", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30DA\u30F3\u30AE\u30F3" }, { "w": "koala", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30B3\u30A2\u30E9" }, { "w": "kangaroo", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30AB\u30F3\u30AC\u30EB\u30FC" }, { "w": "zebra", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30B7\u30DE\u30A6\u30DE" }, { "w": "cow", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30A6\u30B7" }, { "w": "pig", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30D6\u30BF" }, { "w": "sheep", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30D2\u30C4\u30B8" }, { "w": "goat", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30E4\u30AE" }, { "w": "duck", "c": "c", "ad": "the", "cat": "animal", "lv": 2, "ja": "\u30A2\u30D2\u30EB" }, { "w": "mouse", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30CD\u30BA\u30DF" }, { "w": "hamster", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30CF\u30E0\u30B9\u30BF\u30FC" }, { "w": "turtle", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30AB\u30E1" }, { "w": "snake", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30D8\u30D3" }, { "w": "owl", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30D5\u30AF\u30ED\u30A6" }, { "w": "crow", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30AB\u30E9\u30B9" }, { "w": "dolphin", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30A4\u30EB\u30AB" }, { "w": "whale", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30AF\u30B8\u30E9" }, { "w": "shark", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30B5\u30E1" }, { "w": "octopus", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30BF\u30B3" }, { "w": "crab", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30AB\u30CB" }, { "w": "bee", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u30CF\u30C1" }, { "w": "ant", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30A2\u30EA" }, { "w": "dragon", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30C9\u30E9\u30B4\u30F3" }, { "w": "dinosaur", "c": "c", "ad": "the", "cat": "animal", "lv": 2, "ja": "\u6050\u7ADC" }, { "w": "ghost", "c": "c", "ad": "the", "cat": "animal", "lv": 1, "ja": "\u304A\u3070\u3051" }, { "w": "alien", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u5B87\u5B99\u4EBA" }, { "w": "monster", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u602A\u7269" }, { "w": "puppy", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u5B50\u72AC" }, { "w": "kitten", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u5B50\u306D\u3053" }, { "w": "parrot", "c": "c", "ad": "the", "cat": "animal", "lv": 3, "ja": "\u30AA\u30A6\u30E0" }, { "w": "squirrel", "c": "c", "ad": "the", "cat": "animal", "lv": 4, "ja": "\u30EA\u30B9" }, { "w": "mother", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u6BCD" }, { "w": "father", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u7236" }, { "w": "brother", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5144\u5F1F" }, { "w": "sister", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u59C9\u59B9" }, { "w": "grandpa", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u3058\u3044\u3061\u3083\u3093" }, { "w": "uncle", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u3058" }, { "w": "aunt", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u3070" }, { "w": "cousin", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u3044\u3068\u3053" }, { "w": "doctor", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u533B\u8005" }, { "w": "nurse", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u770B\u8B77\u5E2B" }, { "w": "cook", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u6599\u7406\u4EBA" }, { "w": "driver", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u904B\u8EE2\u624B" }, { "w": "firefighter", "c": "c", "ad": "the", "cat": "person", "lv": 3, "ja": "\u6D88\u9632\u58EB" }, { "w": "farmer", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u8FB2\u5BB6\u306E\u4EBA" }, { "w": "shopkeeper", "c": "c", "ad": "the", "cat": "person", "lv": 4, "ja": "\u5E97\u54E1" }, { "w": "clerk", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5E97\u54E1" }, { "w": "waiter", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30A6\u30A7\u30A4\u30BF\u30FC" }, { "w": "king", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u738B\u69D8" }, { "w": "queen", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5973\u738B" }, { "w": "prince", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u738B\u5B50" }, { "w": "princess", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u738B\u5973" }, { "w": "neighbor", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u8FD1\u6240\u306E\u4EBA" }, { "w": "guest", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u5BA2\u3055\u3093" }, { "w": "captain", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30AD\u30E3\u30D7\u30C6\u30F3" }, { "w": "coach", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30B3\u30FC\u30C1" }, { "w": "classmate", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30AF\u30E9\u30B9\u30E1\u30FC\u30C8" }, { "w": "team", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30C1\u30FC\u30E0" }, { "w": "family", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5BB6\u65CF" }, { "w": "man", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u7537\u306E\u4EBA" }, { "w": "woman", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5973\u306E\u4EBA" }, { "w": "child", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5B50\u3069\u3082" }, { "w": "children", "c": "p", "ad": "the", "cat": "person", "lv": 4, "ja": "\u5B50\u3069\u3082\u305F\u3061" }, { "w": "kid", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5B50" }, { "w": "old man", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u3058\u3044\u3055\u3093" }, { "w": "old woman", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u304A\u3070\u3042\u3055\u3093" }, { "w": "singer", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u6B4C\u624B" }, { "w": "artist", "c": "c", "ad": "the", "cat": "person", "lv": 3, "ja": "\u753B\u5BB6" }, { "w": "scientist", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u79D1\u5B66\u8005" }, { "w": "astronaut", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5B87\u5B99\u98DB\u884C\u58EB" }, { "w": "daughter", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u5A18" }, { "w": "son", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u606F\u5B50" }, { "w": "husband", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u592B" }, { "w": "wife", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u59BB" }, { "w": "grandfather", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u7956\u7236" }, { "w": "grandmother", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u7956\u6BCD" }, { "w": "parent", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u4E21\u89AA" }, { "w": "boyfriend", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u5F7C\u6C0F" }, { "w": "girlfriend", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u5F7C\u5973" }, { "w": "actor", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u4FF3\u512A" }, { "w": "engineer", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30A8\u30F3\u30B8\u30CB\u30A2" }, { "w": "leader", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30EA\u30FC\u30C0\u30FC" }, { "w": "musician", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u97F3\u697D\u5BB6" }, { "w": "player", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u9078\u624B" }, { "w": "reporter", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u8A18\u8005" }, { "w": "sailor", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u8239\u4E57\u308A" }, { "w": "waitress", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30A6\u30A7\u30A4\u30C8\u30EC\u30B9" }, { "w": "worker", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u50CD\u304F\u4EBA" }, { "w": "writer", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u4F5C\u5BB6" }, { "w": "owner", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u6301\u3061\u4E3B" }, { "w": "partner", "c": "c", "ad": "my", "cat": "person", "lv": 1, "ja": "\u30D1\u30FC\u30C8\u30CA\u30FC" }, { "w": "person", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u305D\u306E\u4EBA" }, { "w": "lady", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u5973\u6027" }, { "w": "guy", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u7537\u306E\u4EBA" }, { "w": "people", "c": "p", "ad": "", "cat": "person", "lv": 1, "ja": "\u4EBA\u3005" }, { "w": "pet", "c": "c", "ad": "my", "cat": "animal", "lv": 1, "ja": "\u30DA\u30C3\u30C8" }, { "w": "spy", "c": "c", "ad": "the", "cat": "person", "lv": 1, "ja": "\u30B9\u30D1\u30A4" }, { "w": "adult", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5927\u4EBA" }, { "w": "athlete", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u904B\u52D5\u9078\u624B" }, { "w": "barber", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5E8A\u5C4B\u3055\u3093" }, { "w": "beginner", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u521D\u5FC3\u8005" }, { "w": "boss", "c": "c", "ad": "my", "cat": "person", "lv": 2, "ja": "\u4E0A\u53F8" }, { "w": "bride", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u82B1\u5AC1" }, { "w": "chef", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30B7\u30A7\u30D5" }, { "w": "clown", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30D4\u30A8\u30ED" }, { "w": "customer", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u304A\u5BA2\u3055\u3093" }, { "w": "dentist", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u6B6F\u533B\u8005\u3055\u3093" }, { "w": "director", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u76E3\u7763" }, { "w": "expert", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5C02\u9580\u5BB6" }, { "w": "fisherman", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u6F01\u5E2B" }, { "w": "guard", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u8B66\u5099\u54E1" }, { "w": "host", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u53F8\u4F1A\u8005" }, { "w": "hunter", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u72E9\u4EBA" }, { "w": "lawyer", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5F01\u8B77\u58EB" }, { "w": "manager", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5E97\u9577" }, { "w": "member", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30E1\u30F3\u30D0\u30FC" }, { "w": "painter", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u753B\u5BB6" }, { "w": "passenger", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u4E57\u5BA2" }, { "w": "patient", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u60A3\u8005" }, { "w": "photographer", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5199\u771F\u5BB6" }, { "w": "receptionist", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u53D7\u4ED8\u306E\u4EBA" }, { "w": "runner", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30E9\u30F3\u30CA\u30FC" }, { "w": "soldier", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u5175\u58EB" }, { "w": "stranger", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u77E5\u3089\u306A\u3044\u4EBA" }, { "w": "teenager", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "10\u4EE3\u306E\u5B50" }, { "w": "thief", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u3069\u308D\u307C\u3046" }, { "w": "tourist", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u89B3\u5149\u5BA2" }, { "w": "traveler", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u65C5\u884C\u8005" }, { "w": "visitor", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u8A2A\u554F\u8005" }, { "w": "winner", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u52DD\u8005" }, { "w": "grandchild", "c": "c", "ad": "my", "cat": "person", "lv": 2, "ja": "\u5B6B" }, { "w": "couple", "c": "p", "ad": "the", "cat": "person", "lv": 2, "ja": "\u30AB\u30C3\u30D7\u30EB" }, { "w": "crowd", "c": "c", "ad": "the", "cat": "person", "lv": 2, "ja": "\u4EBA\u3054\u307F" }, { "w": "insect", "c": "c", "ad": "the", "cat": "animal", "lv": 2, "ja": "\u866B" }, { "w": "chimpanzee", "c": "c", "ad": "the", "cat": "animal", "lv": 2, "ja": "\u30C1\u30F3\u30D1\u30F3\u30B8\u30FC" }, { "w": "park", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u516C\u5712" }, { "w": "station", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u99C5" }, { "w": "library", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u56F3\u66F8\u9928" }, { "w": "beach", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 1, "ja": "\u6D77\u8FBA" }, { "w": "forest", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u68EE" }, { "w": "zoo", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u52D5\u7269\u5712" }, { "w": "cafe", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30AB\u30D5\u30A7" }, { "w": "Tokyo", "c": "n", "ad": "", "cat": "place", "prep": "in", "lv": 2, "ja": "\u6771\u4EAC" }, { "w": "store", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u5E97" }, { "w": "supermarket", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30B9\u30FC\u30D1\u30FC" }, { "w": "hospital", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u75C5\u9662" }, { "w": "airport", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u7A7A\u6E2F" }, { "w": "restaurant", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30EC\u30B9\u30C8\u30E9\u30F3" }, { "w": "office", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u4F1A\u793E" }, { "w": "gym", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 3, "ja": "\u4F53\u80B2\u9928" }, { "w": "bus stop", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30D0\u30B9\u505C" }, { "w": "museum", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u535A\u7269\u9928" }, { "w": "aquarium", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u6C34\u65CF\u9928" }, { "w": "post office", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u90F5\u4FBF\u5C40" }, { "w": "bank", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u9280\u884C" }, { "w": "hotel", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30DB\u30C6\u30EB" }, { "w": "mall", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u30B7\u30E7\u30C3\u30D4\u30F3\u30B0\u30E2\u30FC\u30EB" }, { "w": "pool", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u30D7\u30FC\u30EB" }, { "w": "sea", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u6D77" }, { "w": "mountains", "c": "p", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u5C71" }, { "w": "city", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u8857" }, { "w": "country", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u3044\u306A\u304B" }, { "w": "Japan", "c": "n", "ad": "", "cat": "place", "prep": "in", "lv": 4, "ja": "\u65E5\u672C" }, { "w": "America", "c": "n", "ad": "", "cat": "place", "prep": "in", "lv": 4, "ja": "\u30A2\u30E1\u30EA\u30AB" }, { "w": "living room", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u30EA\u30D3\u30F3\u30B0" }, { "w": "roof", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 2, "ja": "\u5C4B\u6839\u306E\u4E0A" }, { "w": "stadium", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u7AF6\u6280\u5834" }, { "w": "temple", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u304A\u5BFA" }, { "w": "shrine", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u795E\u793E" }, { "w": "cinema", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u6620\u753B\u9928" }, { "w": "farm", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 1, "ja": "\u8FB2\u5834" }, { "w": "field", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u91CE\u539F" }, { "w": "hill", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 1, "ja": "\u4E18\u306E\u4E0A" }, { "w": "island", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 1, "ja": "\u5CF6" }, { "w": "shop", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u5E97" }, { "w": "theater", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u5287\u5834" }, { "w": "bedroom", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u5BDD\u5BA4" }, { "w": "dining room", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u98DF\u5802" }, { "w": "bookstore", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u672C\u5C4B" }, { "w": "factory", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u5DE5\u5834" }, { "w": "hall", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 1, "ja": "\u30DB\u30FC\u30EB" }, { "w": "palace", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u5BAE\u6BBF" }, { "w": "hometown", "c": "c", "ad": "my", "cat": "place", "prep": "in", "lv": 1, "ja": "\u5730\u5143" }, { "w": "swimming pool", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 1, "ja": "\u30D7\u30FC\u30EB" }, { "w": "apartment", "c": "c", "ad": "my", "cat": "place", "prep": "in", "lv": 2, "ja": "\u30A2\u30D1\u30FC\u30C8" }, { "w": "balcony", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 2, "ja": "\u30D9\u30E9\u30F3\u30C0" }, { "w": "cafeteria", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u98DF\u5802" }, { "w": "castle", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u57CE" }, { "w": "coast", "c": "c", "ad": "the", "cat": "place", "prep": "on", "lv": 2, "ja": "\u6D77\u5CB8" }, { "w": "countryside", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u3044\u306A\u304B" }, { "w": "desert", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u7802\u6F20" }, { "w": "drugstore", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u30C9\u30E9\u30C3\u30B0\u30B9\u30C8\u30A2" }, { "w": "gallery", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u7F8E\u8853\u9928" }, { "w": "garage", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u30AC\u30EC\u30FC\u30B8" }, { "w": "lake", "c": "c", "ad": "the", "cat": "place", "prep": "by", "lv": 2, "ja": "\u6E56\u306E\u305D\u3070" }, { "w": "market", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u5E02\u5834" }, { "w": "playground", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u904A\u3073\u5834" }, { "w": "university", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u5927\u5B66" }, { "w": "valley", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u8C37" }, { "w": "village", "c": "c", "ad": "the", "cat": "place", "prep": "in", "lv": 2, "ja": "\u6751" }, { "w": "department store", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u30C7\u30D1\u30FC\u30C8" }, { "w": "grocery store", "c": "c", "ad": "the", "cat": "place", "prep": "at", "lv": 2, "ja": "\u98DF\u6599\u54C1\u5E97" }, { "w": "morning", "c": "t", "ad": "the", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u671D" }, { "w": "night", "c": "n", "ad": "", "cat": "time", "prep": "at", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u591C" }, { "w": "afternoon", "c": "t", "ad": "the", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u5348\u5F8C" }, { "w": "evening", "c": "t", "ad": "the", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u5915\u65B9" }, { "w": "noon", "c": "n", "ad": "", "cat": "time", "prep": "at", "ts": ["pres", "past", "fut"], "lv": 2, "ja": "\u6B63\u5348" }, { "w": "midnight", "c": "n", "ad": "", "cat": "time", "prep": "at", "ts": ["pres", "past", "fut"], "lv": 2, "ja": "\u771F\u591C\u4E2D" }, { "w": "Monday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u6708\u66DC\u65E5" }, { "w": "Tuesday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u706B\u66DC\u65E5" }, { "w": "Wednesday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u6C34\u66DC\u65E5" }, { "w": "Thursday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u6728\u66DC\u65E5" }, { "w": "Friday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u91D1\u66DC\u65E5" }, { "w": "Saturday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u571F\u66DC\u65E5" }, { "w": "Sunday", "c": "n", "ad": "", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u65E5\u66DC\u65E5" }, { "w": "January", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "1\u6708" }, { "w": "February", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "2\u6708" }, { "w": "March", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "3\u6708" }, { "w": "April", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "4\u6708" }, { "w": "May", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "5\u6708" }, { "w": "June", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "6\u6708" }, { "w": "July", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "7\u6708" }, { "w": "August", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "8\u6708" }, { "w": "September", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "9\u6708" }, { "w": "October", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "10\u6708" }, { "w": "November", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "11\u6708" }, { "w": "December", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "12\u6708" }, { "w": "spring", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u6625" }, { "w": "summer", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u590F" }, { "w": "autumn", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u79CB" }, { "w": "winter", "c": "n", "ad": "", "cat": "time", "prep": "in", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u51AC" }, { "w": "weekend", "c": "t", "ad": "the", "cat": "time", "prep": "on", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u9031\u672B" }, { "w": "lunchtime", "c": "n", "ad": "", "cat": "time", "prep": "at", "ts": ["pres", "past", "fut"], "lv": 2, "ja": "\u663C\u4F11\u307F" }], "verb": [{ "w": "run", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u8D70\u308B" }, { "w": "walk", "b": "walk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6B69\u304F" }, { "w": "sleep", "b": "sleep", "past": "slept", "pp": "slept", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5BDD\u308B" }, { "w": "swim", "b": "swim", "past": "swam", "pp": "swum", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u6CF3\u3050" }, { "w": "dance", "b": "dance", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u8E0A\u308B" }, { "w": "laugh", "b": "laugh", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7B11\u3046" }, { "w": "cry", "b": "cry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6CE3\u304F" }, { "w": "jump", "b": "jump", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u30B8\u30E3\u30F3\u30D7\u3059\u308B" }, { "w": "sit down", "b": "sit", "past": "sat", "pp": "sat", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u5EA7\u308B", "tail": "down" }, { "w": "stand up", "b": "stand", "past": "stood", "pp": "stood", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u7ACB\u3064", "tail": "up" }, { "w": "wake up", "b": "wake", "past": "woke", "pp": "woken", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8D77\u304D\u308B", "tail": "up" }, { "w": "smile", "b": "smile", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u307B\u307B\u3048\u3080" }, { "w": "rest", "b": "rest", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u4F11\u3080" }, { "w": "work", "b": "work", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u50CD\u304F" }, { "w": "fly", "b": "fly", "past": "flew", "pp": "flown", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u98DB\u3076" }, { "w": "go", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u884C\u304F" }, { "w": "come", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6765\u308B" }, { "w": "talk", "b": "talk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u8A71\u3059" }, { "w": "shout", "b": "shout", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u53EB\u3076" }, { "w": "fall down", "b": "fall", "past": "fell", "pp": "fallen", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u8EE2\u3076", "tail": "down" }, { "w": "hide", "b": "hide", "past": "hid", "pp": "hidden", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u96A0\u308C\u308B" }, { "w": "arrive", "b": "arrive", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7740\u304F" }, { "w": "grow up", "b": "grow", "past": "grew", "pp": "grown", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5927\u304D\u304F\u306A\u308B", "tail": "up" }, { "w": "win", "b": "win", "past": "won", "pp": "won", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u52DD\u3064" }, { "w": "relax", "b": "relax", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u306E\u3093\u3073\u308A\u3059\u308B" }, { "w": "hurry", "b": "hurry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6025\u3050" }, { "w": "travel", "b": "travel", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u65C5\u884C\u3059\u308B" }, { "w": "shop", "b": "shop", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u8CB7\u3044\u7269\u3059\u308B" }, { "w": "climb", "b": "climb", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u767B\u308B", "ot": ["climb"] }, { "w": "practice", "b": "practice", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u7DF4\u7FD2\u3059\u308B", "ot": ["sport", "instr"], "cv": "ing" }, { "w": "hang out", "b": "hang", "past": "hung", "pp": "hung", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3064\u308B\u3080", "tail": "out" }, { "w": "chill", "b": "chill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u307E\u3063\u305F\u308A\u3059\u308B" }, { "w": "eat", "b": "eat", "past": "ate", "pp": "eaten", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u98DF\u3079\u308B", "ot": ["food"] }, { "w": "drink", "b": "drink", "past": "drank", "pp": "drunk", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u98F2\u3080", "ot": ["drink"] }, { "w": "read", "b": "read", "past": "read", "pp": "read", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u8AAD\u3080", "ot": ["read"] }, { "w": "write", "b": "write", "past": "wrote", "pp": "written", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u66F8\u304F", "ot": ["write"], "dt": 1 }, { "w": "sing", "b": "sing", "past": "sang", "pp": "sung", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u6B4C\u3046", "ot": ["song"], "dt": 1 }, { "w": "draw", "b": "draw", "past": "drew", "pp": "drawn", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u63CF\u304F", "ot": ["draw"] }, { "w": "cook", "b": "cook", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u6599\u7406\u3059\u308B", "ot": ["food"], "dt": 1 }, { "w": "study", "b": "study", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u52C9\u5F37\u3059\u308B", "ot": ["lang"] }, { "w": "play", "b": "play", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u904A\u3076", "ot": ["sport", "instr", "game"] }, { "w": "clean", "b": "clean", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u305D\u3046\u3058\u3059\u308B", "ot": ["clean"] }, { "w": "listen to", "b": "listen", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u805E\u304F", "tail": "to", "ot": ["music", "person", "animal"] }, { "w": "look at", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u898B\u308B", "tail": "at", "ot": ["any"] }, { "w": "wait for", "b": "wait", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5F85\u3064", "tail": "for", "ot": ["person"] }, { "w": "like", "b": "like", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u597D\u304D", "ot": ["any"], "cv": "both" }, { "w": "love", "b": "love", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5927\u597D\u304D", "ot": ["any"], "cv": "both" }, { "w": "have", "b": "have", "past": "had", "pp": "had", "s3": "has", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6301\u3064", "ot": ["thing", "food"] }, { "w": "need", "b": "need", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5FC5\u8981", "ot": ["thing", "food", "drink", "person"], "cv": "to" }, { "w": "buy", "b": "buy", "past": "bought", "pp": "bought", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8CB7\u3046", "ot": ["food", "drink", "thing", "read"], "dt": 1 }, { "w": "make", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4F5C\u308B", "ot": ["make"], "dt": 1 }, { "w": "watch", "b": "watch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u898B\u308B", "ot": ["watch", "person", "animal"] }, { "w": "see", "b": "see", "past": "saw", "pp": "seen", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u898B\u308B", "ot": ["any"] }, { "w": "open", "b": "open", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u958B\u3051\u308B", "ot": ["door"] }, { "w": "close", "b": "close", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u9589\u3081\u308B", "ot": ["door"] }, { "w": "wash", "b": "wash", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u6D17\u3046", "ot": ["wash"] }, { "w": "use", "b": "use", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4F7F\u3046", "ot": ["thing"] }, { "w": "find", "b": "find", "past": "found", "pp": "found", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u898B\u3064\u3051\u308B", "ot": ["thing", "person"] }, { "w": "lose", "b": "lose", "past": "lost", "pp": "lost", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u306A\u304F\u3059", "ot": ["thing"] }, { "w": "carry", "b": "carry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u904B\u3076", "ot": ["thing"] }, { "w": "take", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u64AE\u308B", "ot": ["photo"] }, { "w": "throw", "b": "throw", "past": "threw", "pp": "thrown", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6295\u3052\u308B", "ot": ["ball"] }, { "w": "catch", "b": "catch", "past": "caught", "pp": "caught", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3064\u304B\u307E\u3048\u308B", "ot": ["ball", "animal"] }, { "w": "ride", "b": "ride", "past": "rode", "pp": "ridden", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4E57\u308B", "ot": ["ride"] }, { "w": "help", "b": "help", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u624B\u4F1D\u3046", "ot": ["person"] }, { "w": "call", "b": "call", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u96FB\u8A71\u3059\u308B", "ot": ["person"] }, { "w": "meet", "b": "meet", "past": "met", "pp": "met", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u4F1A\u3046", "ot": ["person"] }, { "w": "hug", "b": "hug", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 2, "ja": "\u3060\u304D\u3057\u3081\u308B", "ot": ["person", "animal"] }, { "w": "chase", "b": "chase", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u8FFD\u3044\u304B\u3051\u308B", "ot": ["person", "animal", "ball"] }, { "w": "teach", "b": "teach", "past": "taught", "pp": "taught", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u6559\u3048\u308B", "ot": ["lang", "sport"], "dt": 1 }, { "w": "visit", "b": "visit", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u305F\u305A\u306D\u308B", "ot": ["person"] }, { "w": "do", "b": "do", "past": "did", "pp": "done", "s3": "does", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3084\u308B", "ot": ["homework"] }, { "w": "bring", "b": "bring", "past": "brought", "pp": "brought", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6301\u3063\u3066\u304F\u308B", "ot": ["thing", "food", "drink"], "dt": 1 }, { "w": "send", "b": "send", "past": "sent", "pp": "sent", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u9001\u308B", "ot": ["write", "photo"], "dt": 1 }, { "w": "fix", "b": "fix", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u76F4\u3059", "ot": ["ride", "thing", "car"] }, { "w": "drive", "b": "drive", "past": "drove", "pp": "driven", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u904B\u8EE2\u3059\u308B", "ot": ["car"] }, { "w": "forget", "b": "forget", "past": "forgot", "pp": "forgotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u5FD8\u308C\u308B", "ot": ["thing", "homework"], "cv": "to" }, { "w": "remember", "b": "remember", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u899A\u3048\u3066\u3044\u308B", "ot": ["any"], "cv": "ing" }, { "w": "enjoy", "b": "enjoy", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u697D\u3057\u3080", "ot": ["sport", "game", "music", "watch", "food"], "cv": "ing" }, { "w": "answer", "b": "answer", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7B54\u3048\u308B", "ot": ["person"] }, { "w": "ask", "b": "ask", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u305F\u305A\u306D\u308B", "ot": ["person"] }, { "w": "invite", "b": "invite", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u62DB\u5F85\u3059\u308B", "ot": ["person"] }, { "w": "cut", "b": "cut", "past": "cut", "pp": "cut", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u5207\u308B", "ot": ["food", "cut"] }, { "w": "feed", "b": "feed", "past": "fed", "pp": "fed", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3048\u3055\u3092\u3042\u3052\u308B", "ot": ["animal"] }, { "w": "wear", "b": "wear", "past": "wore", "pp": "worn", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7740\u308B", "ot": ["wear"] }, { "w": "plant", "b": "plant", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u690D\u3048\u308B", "ot": ["plant"] }, { "w": "paint", "b": "paint", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u306C\u308B", "ot": ["draw", "door", "car"] }, { "w": "build", "b": "build", "past": "built", "pp": "built", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4F5C\u308B", "ot": ["build"] }, { "w": "sell", "b": "sell", "past": "sold", "pp": "sold", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u58F2\u308B", "ot": ["thing", "food"] }, { "w": "borrow", "b": "borrow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u501F\u308A\u308B", "ot": ["thing", "read"] }, { "w": "push", "b": "push", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u62BC\u3059", "ot": ["door", "thing", "person"] }, { "w": "pull", "b": "pull", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5F15\u304F", "ot": ["door", "thing"] }, { "w": "protect", "b": "protect", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5B88\u308B", "ot": ["person", "animal"] }, { "w": "follow", "b": "follow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3064\u3044\u3066\u3044\u304F", "ot": ["person", "animal"] }, { "w": "check", "b": "check", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u78BA\u8A8D\u3059\u308B", "ot": ["thing", "homework", "write"] }, { "w": "give", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3042\u3052\u308B", "ot": ["thing", "food", "drink", "read", "present"], "dt": 1 }, { "w": "show", "b": "show", "past": "showed", "pp": "shown", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u898B\u305B\u308B", "ot": ["thing", "read", "photo", "draw"], "dt": 1 }, { "w": "tell", "b": "tell", "past": "told", "pp": "told", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8A71\u3059", "ot": ["tell"], "dt": 1 }, { "w": "lend", "b": "lend", "past": "lent", "pp": "lent", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u8CB8\u3059", "ot": ["thing", "read", "ride"], "dt": 1 }, { "w": "pass", "b": "pass", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6E21\u3059", "ot": ["thing", "food", "drink", "read"], "dt": 1 }, { "w": "grab", "b": "grab", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u3055\u3063\u3068\u98DF\u3079\u308B", "ot": ["food", "drink"] }, { "w": "text", "b": "text", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u9001\u308B", "ot": ["person"] }, { "w": "want", "b": "want", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u307B\u3057\u3044", "ot": ["any"], "cv": "to" }, { "w": "get", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u624B\u306B\u5165\u308C\u308B", "ot": ["thing", "food", "drink", "present"], "link": 1 }, { "w": "put", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u7F6E\u304F", "ot": ["thing"] }, { "w": "turn", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u66F2\u304C\u308B", "link": 1 }, { "w": "pick", "b": "pick", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6458\u3080", "ot": ["plant"] }, { "w": "break", "b": "break", "past": "broke", "pp": "broken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3053\u308F\u3059", "ot": ["thing", "toy", "device"] }, { "w": "hang", "b": "hang", "past": "hung", "pp": "hung", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u639B\u3051\u308B", "ot": ["wear", "draw"] }, { "w": "return", "b": "return", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u623B\u308B", "ot": ["thing", "read"] }, { "w": "continue", "b": "continue", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u7D9A\u3051\u308B", "ot": ["sport", "instr", "lang", "homework"], "cv": "both" }, { "w": "discover", "b": "discover", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u767A\u898B\u3059\u308B", "ot": ["thing", "tell"] }, { "w": "quit", "b": "quit", "past": "quit", "pp": "quit", "s3": "", "dbl": 1, "fr": "both", "lv": 2, "ja": "\u3084\u3081\u308B", "ot": ["sport", "instr", "game", "lang"], "cv": "ing" }, { "w": "postpone", "b": "postpone", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u5EF6\u671F\u3059\u308B", "ot": ["event"] }, { "w": "recover", "b": "recover", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u56DE\u5FA9\u3059\u308B" }, { "w": "leave", "b": "leave", "past": "left", "pp": "left", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u51FA\u767A\u3059\u308B" }, { "w": "enter", "b": "enter", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5165\u308B" }, { "w": "escape", "b": "escape", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u9003\u3052\u308B" }, { "w": "choose", "b": "choose", "past": "chose", "pp": "chosen", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u9078\u3076", "ot": ["thing", "wear", "read"] }, { "w": "start", "b": "start", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u59CB\u3081\u308B", "ot": ["sport", "instr", "lang", "homework"], "cv": "both" }, { "w": "refuse", "b": "refuse", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u65AD\u308B", "ot": ["offer"], "cv": "to" }, { "w": "appear", "b": "appear", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u73FE\u308C\u308B" }, { "w": "exercise", "b": "exercise", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u904B\u52D5\u3059\u308B" }, { "w": "get off", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u964D\u308A\u308B", "tail": "off", "ot": ["ride"] }, { "w": "get over", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u4E57\u308A\u3053\u3048\u308B", "tail": "over", "ot": ["over"] }, { "w": "get along with", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u4EF2\u826F\u304F\u3059\u308B", "tail": "along with", "ot": ["person"] }, { "w": "get back", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u623B\u308B", "tail": "back" }, { "w": "get out", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u51FA\u308B", "tail": "out" }, { "w": "go on", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7D9A\u304F", "tail": "on" }, { "w": "go out", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u51FA\u304B\u3051\u308B", "tail": "out" }, { "w": "go back", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u623B\u308B", "tail": "back" }, { "w": "go away", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7ACB\u3061\u53BB\u308B", "tail": "away" }, { "w": "go through", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7D4C\u9A13\u3059\u308B", "tail": "through", "ot": ["over"] }, { "w": "come back", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u623B\u3063\u3066\u304F\u308B", "tail": "back" }, { "w": "come in", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5165\u3063\u3066\u304F\u308B", "tail": "in" }, { "w": "come out", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u51FA\u3066\u304F\u308B", "tail": "out" }, { "w": "come over", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u904A\u3073\u306B\u6765\u308B", "tail": "over" }, { "w": "come across", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5076\u7136\u898B\u3064\u3051\u308B", "tail": "across", "ot": ["thing", "read", "person"] }, { "w": "come along", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u3064\u3044\u3066\u304F\u308B", "tail": "along" }, { "w": "take out", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u53D6\u308A\u51FA\u3059", "tail": "out", "ot": ["thing", "food"] }, { "w": "take away", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6301\u3061\u53BB\u308B", "tail": "away", "ot": ["thing", "toy"] }, { "w": "take back", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8FD4\u54C1\u3059\u308B", "tail": "back", "ot": ["thing", "wear"] }, { "w": "take up", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u59CB\u3081\u308B", "tail": "up", "ot": ["sport", "instr", "lang"] }, { "w": "take care of", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4E16\u8A71\u3092\u3059\u308B", "tail": "care of", "ot": ["person", "animal"] }, { "w": "take a break", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u4F11\u61A9\u3059\u308B", "tail": "a break" }, { "w": "take a walk", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6563\u6B69\u3059\u308B", "tail": "a walk" }, { "w": "take a shower", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u30B7\u30E3\u30EF\u30FC\u3092\u6D74\u3073\u308B", "tail": "a shower" }, { "w": "put on", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u7740\u308B", "tail": "on", "ot": ["wear"] }, { "w": "put off", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u5EF6\u671F\u3059\u308B", "tail": "off", "ot": ["event"] }, { "w": "put away", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u7247\u4ED8\u3051\u308B", "tail": "away", "ot": ["thing", "toy"] }, { "w": "put down", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u4E0B\u306B\u7F6E\u304F", "tail": "down", "ot": ["thing"] }, { "w": "put out", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u6D88\u3059", "tail": "out", "ot": ["fire"] }, { "w": "put up with", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u304C\u307E\u3093\u3059\u308B", "tail": "up with", "ot": ["bear", "person"] }, { "w": "look up", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8ABF\u3079\u308B", "tail": "up", "ot": ["word"] }, { "w": "look after", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4E16\u8A71\u3092\u3059\u308B", "tail": "after", "ot": ["person", "animal"] }, { "w": "look out", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6C17\u3092\u3064\u3051\u308B", "tail": "out" }, { "w": "lie down", "b": "lie", "past": "lay", "pp": "lain", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6A2A\u306B\u306A\u308B", "tail": "down" }, { "w": "hurry up", "b": "hurry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6025\u3050", "tail": "up" }, { "w": "slow down", "b": "slow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u30DA\u30FC\u30B9\u3092\u843D\u3068\u3059", "tail": "down" }, { "w": "calm down", "b": "calm", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u843D\u3061\u7740\u304F", "tail": "down" }, { "w": "cheer up", "b": "cheer", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5143\u6C17\u3092\u51FA\u3059", "tail": "up" }, { "w": "speak up", "b": "speak", "past": "spoke", "pp": "spoken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5927\u304D\u306A\u58F0\u3067\u8A71\u3059", "tail": "up" }, { "w": "hold on", "b": "hold", "past": "held", "pp": "held", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u3061\u3087\u3063\u3068\u5F85\u3064", "tail": "on" }, { "w": "watch out", "b": "watch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6C17\u3092\u3064\u3051\u308B", "tail": "out" }, { "w": "walk in", "b": "walk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6B69\u3044\u3066\u5165\u308B", "tail": "in" }, { "w": "walk out", "b": "walk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6B69\u3044\u3066\u51FA\u308B", "tail": "out" }, { "w": "walk away", "b": "walk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7ACB\u3061\u53BB\u308B", "tail": "away" }, { "w": "walk around", "b": "walk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6B69\u304D\u56DE\u308B", "tail": "around" }, { "w": "sign up", "b": "sign", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7533\u3057\u8FBC\u3080", "tail": "up" }, { "w": "clean up", "b": "clean", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7247\u3065\u3051\u308B", "tail": "up" }, { "w": "write down", "b": "write", "past": "wrote", "pp": "written", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u66F8\u304D\u7559\u3081\u308B", "tail": "down" }, { "w": "throw away", "b": "throw", "past": "threw", "pp": "thrown", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6368\u3066\u308B", "tail": "away" }, { "w": "fill out", "b": "fill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8A18\u5165\u3059\u308B", "tail": "out" }, { "w": "check out", "b": "check", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u30C1\u30A7\u30C3\u30AF\u3059\u308B", "tail": "out" }, { "w": "call back", "b": "call", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6298\u308A\u8FD4\u3057\u96FB\u8A71\u3059\u308B", "tail": "back" }, { "w": "look around", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u898B\u56DE\u3059", "tail": "around" }, { "w": "look into", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8ABF\u3079\u308B", "tail": "into", "ot": ["event", "thing"] }, { "w": "look forward to", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u697D\u3057\u307F\u306B\u3059\u308B", "tail": "forward to", "ot": ["event", "thing", "person"] }, { "w": "turn on", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3064\u3051\u308B", "tail": "on", "ot": ["device"] }, { "w": "turn off", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6D88\u3059", "tail": "off", "ot": ["device"] }, { "w": "turn up", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5927\u304D\u304F\u3059\u308B", "tail": "up", "ot": ["device"] }, { "w": "turn down", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u65AD\u308B", "tail": "down", "ot": ["offer", "device"] }, { "w": "turn around", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u632F\u308A\u5411\u304F", "tail": "around" }, { "w": "turn into", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5909\u308F\u308B", "tail": "into", "ot": ["change"] }, { "w": "give up", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u3042\u304D\u3089\u3081\u308B", "tail": "up", "ot": ["sport", "instr", "game", "lang"] }, { "w": "give back", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8FD4\u3059", "tail": "back", "ot": ["thing", "read"] }, { "w": "give away", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3042\u3052\u3066\u3057\u307E\u3046", "tail": "away", "ot": ["thing", "toy"] }, { "w": "give in", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u964D\u53C2\u3059\u308B", "tail": "in" }, { "w": "run away", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "intr", "lv": 1, "ja": "\u9003\u3052\u308B", "tail": "away" }, { "w": "run out of", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u5207\u3089\u3059", "tail": "out of", "ot": ["food", "drink", "thing"] }, { "w": "run into", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u3070\u3063\u305F\u308A\u4F1A\u3046", "tail": "into", "ot": ["person"] }, { "w": "run after", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "tr", "lv": 1, "ja": "\u8FFD\u3044\u304B\u3051\u308B", "tail": "after", "ot": ["person", "animal", "ball"] }, { "w": "pick up", "b": "pick", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u62FE\u3046", "tail": "up", "ot": ["thing", "person", "toy"] }, { "w": "pick out", "b": "pick", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u9078\u3076", "tail": "out", "ot": ["thing", "wear", "read"] }, { "w": "bring back", "b": "bring", "past": "brought", "pp": "brought", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6301\u3063\u3066\u5E30\u308B", "tail": "back", "ot": ["thing", "food"] }, { "w": "break down", "b": "break", "past": "broke", "pp": "broken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6545\u969C\u3059\u308B", "tail": "down" }, { "w": "break up", "b": "break", "past": "broke", "pp": "broken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5225\u308C\u308B", "tail": "up" }, { "w": "find out", "b": "find", "past": "found", "pp": "found", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3064\u304D\u3068\u3081\u308B", "tail": "out", "ot": ["tell", "thing"] }, { "w": "work out", "b": "work", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u904B\u52D5\u3059\u308B", "tail": "out" }, { "w": "hang on", "b": "hang", "past": "hung", "pp": "hung", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3061\u3087\u3063\u3068\u5F85\u3064", "tail": "on" }, { "w": "hang up", "b": "hang", "past": "hung", "pp": "hung", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u96FB\u8A71\u3092\u5207\u308B", "tail": "up" }, { "w": "show up", "b": "show", "past": "showed", "pp": "shown", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u73FE\u308C\u308B", "tail": "up" }, { "w": "have fun", "b": "have", "past": "had", "pp": "had", "s3": "has", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u697D\u3057\u3080", "tail": "fun" }, { "w": "have lunch", "b": "have", "past": "had", "pp": "had", "s3": "has", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", "tail": "lunch" }, { "w": "make a mistake", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u307E\u3061\u304C\u3048\u308B", "tail": "a mistake" }, { "w": "make friends", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u53CB\u3060\u3061\u306B\u306A\u308B", "tail": "friends" }, { "w": "catch a cold", "b": "catch", "past": "caught", "pp": "caught", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u98A8\u90AA\u3092\u3072\u304F", "tail": "a cold" }, { "w": "back up", "b": "back", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3059\u308B", "tail": "up", "ot": ["thing", "device"] }, { "w": "bring up", "b": "bring", "past": "brought", "pp": "brought", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A71\u984C\u306B\u51FA\u3059", "tail": "up", "ot": ["abstract", "event"] }, { "w": "call off", "b": "call", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4E2D\u6B62\u3059\u308B", "tail": "off", "ot": ["event"] }, { "w": "catch up", "b": "catch", "past": "caught", "pp": "caught", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8FFD\u3044\u3064\u304F", "tail": "up" }, { "w": "catch up with", "b": "catch", "past": "caught", "pp": "caught", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8FFD\u3044\u3064\u304F", "tail": "up with", "ot": ["person"] }, { "w": "come on", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6025\u3050", "tail": "on" }, { "w": "come up with", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u601D\u3044\u3064\u304F", "tail": "up with", "ot": ["abstract", "offer"] }, { "w": "deal with", "b": "deal", "past": "dealt", "pp": "dealt", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5BFE\u51E6\u3059\u308B", "tail": "with", "ot": ["abstract", "person", "event"] }, { "w": "drop off", "b": "drop", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u9001\u308A\u5C4A\u3051\u308B", "tail": "off", "ot": ["person", "thing"] }, { "w": "eat out", "b": "eat", "past": "ate", "pp": "eaten", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5916\u98DF\u3059\u308B", "tail": "out" }, { "w": "end up", "b": "end", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7D50\u5C40\u305D\u3046\u306A\u308B", "tail": "up" }, { "w": "feel like", "b": "feel", "past": "felt", "pp": "felt", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6C17\u5206", "tail": "like", "ot": ["food", "drink", "abstract"] }, { "w": "figure out", "b": "figure", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u7406\u89E3\u3059\u308B", "tail": "out", "ot": ["abstract", "word"] }, { "w": "fill in", "b": "fill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u66F8\u304D\u3053\u3080", "tail": "in", "ot": ["write"] }, { "w": "follow up", "b": "follow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30D5\u30A9\u30ED\u30FC\u3059\u308B", "tail": "up" }, { "w": "get away", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u9003\u3052\u308B", "tail": "away" }, { "w": "get away with", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u307E\u3093\u307E\u3068\u9003\u308C\u308B", "tail": "away with", "ot": ["abstract"] }, { "w": "get back to", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u3042\u3068\u3067\u9023\u7D61\u3059\u308B", "tail": "back to", "ot": ["person"] }, { "w": "get in", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u5165\u308B", "tail": "in" }, { "w": "get into", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u5922\u4E2D\u306B\u306A\u308B", "tail": "into", "ot": ["sport", "game", "music", "lang", "abstract"] }, { "w": "get out of", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u51FA\u308B", "tail": "out of", "ot": ["ride", "thing"] }, { "w": "get together", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u96C6\u307E\u308B", "tail": "together" }, { "w": "go ahead", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3069\u3046\u305E\u9032\u3081\u308B", "tail": "ahead" }, { "w": "go for", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u301C\u3092\u3057\u306B\u884C\u304F", "tail": "for", "ot": ["food", "drink", "sport", "event"] }, { "w": "go into", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5165\u308B", "tail": "into", "ot": ["thing", "event"] }, { "w": "head out", "b": "head", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u51FA\u304B\u3051\u308B", "tail": "out" }, { "w": "head to", "b": "head", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5411\u304B\u3046", "tail": "to", "ot": ["event"] }, { "w": "keep on", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7D9A\u3051\u308B", "tail": "on" }, { "w": "keep up", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3064\u3044\u3066\u3044\u304F", "tail": "up" }, { "w": "keep up with", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3064\u3044\u3066\u3044\u304F", "tail": "up with", "ot": ["person", "abstract"] }, { "w": "look out for", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6C17\u3092\u3064\u3051\u308B", "tail": "out for", "ot": ["person", "animal", "thing"] }, { "w": "make out", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u805E\u304D\u53D6\u308B", "tail": "out", "ot": ["word", "abstract"] }, { "w": "make up", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4F5C\u308A\u4E0A\u3052\u308B", "tail": "up", "ot": ["write", "abstract"] }, { "w": "move on", "b": "move", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6B21\u3078\u9032\u3080", "tail": "on" }, { "w": "open up", "b": "open", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6253\u3061\u660E\u3051\u308B", "tail": "up" }, { "w": "put back", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u5143\u306B\u623B\u3059", "tail": "back", "ot": ["thing"] }, { "w": "reach out", "b": "reach", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u9023\u7D61\u3059\u308B", "tail": "out" }, { "w": "run out", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u306A\u304F\u306A\u308B", "tail": "out" }, { "w": "set up", "b": "set", "past": "set", "pp": "set", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u6E96\u5099\u3059\u308B", "tail": "up", "ot": ["thing", "event", "device"] }, { "w": "turn out", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7D50\u5C40\u301C\u3068\u308F\u304B\u308B", "tail": "out" }, { "w": "work on", "b": "work", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u53D6\u308A\u7D44\u3080", "tail": "on", "ot": ["homework", "write", "thing", "abstract"] }, { "w": "act on", "b": "act", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u301C\u306B\u3082\u3068\u3065\u3044\u3066\u884C\u52D5\u3059\u308B", "tail": "on", "ot": ["offer", "abstract"] }, { "w": "back out", "b": "back", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u624B\u3092\u5F15\u304F", "tail": "out" }, { "w": "call for", "b": "call", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5FC5\u8981\u3068\u3059\u308B", "tail": "for", "ot": ["abstract", "help"] }, { "w": "care for", "b": "care", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4E16\u8A71\u3092\u3059\u308B", "tail": "for", "ot": ["person", "animal", "plant"] }, { "w": "carry on", "b": "carry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7D9A\u3051\u308B", "tail": "on" }, { "w": "carry out", "b": "carry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5B9F\u884C\u3059\u308B", "tail": "out", "ot": ["event", "abstract"] }, { "w": "check in", "b": "check", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30C1\u30A7\u30C3\u30AF\u30A4\u30F3\u3059\u308B", "tail": "in" }, { "w": "come around", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8003\u3048\u3092\u5909\u3048\u308B", "tail": "around" }, { "w": "come down with", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u304B\u304B\u308B", "tail": "down with", "ot": ["over"] }, { "w": "cut off", "b": "cut", "past": "cut", "pp": "cut", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u5207\u308A\u306F\u306A\u3059", "tail": "off", "ot": ["thing", "device"] }, { "w": "drop by", "b": "drop", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u7ACB\u3061\u5BC4\u308B", "tail": "by" }, { "w": "fall apart", "b": "fall", "past": "fell", "pp": "fallen", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3070\u3089\u3070\u3089\u306B\u306A\u308B", "tail": "apart" }, { "w": "freak out", "b": "freak", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30D1\u30CB\u30C3\u30AF\u306B\u306A\u308B", "tail": "out" }, { "w": "get through", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u4E57\u308A\u5207\u308B", "tail": "through", "ot": ["over", "event"] }, { "w": "go off", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u9CF4\u308A\u51FA\u3059", "tail": "off" }, { "w": "hand over", "b": "hand", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5F15\u304D\u6E21\u3059", "tail": "over", "ot": ["thing", "read"] }, { "w": "hold back", "b": "hold", "past": "held", "pp": "held", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u305F\u3081\u3089\u3046", "tail": "back" }, { "w": "lay out", "b": "lay", "past": "laid", "pp": "laid", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5E83\u3052\u3066\u4E26\u3079\u308B", "tail": "out", "ot": ["thing", "write"] }, { "w": "mess up", "b": "mess", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u53F0\u7121\u3057\u306B\u3059\u308B", "tail": "up", "ot": ["thing", "event", "abstract"] }, { "w": "move in", "b": "move", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5F15\u3063\u8D8A\u3057\u3066\u304F\u308B", "tail": "in" }, { "w": "move out", "b": "move", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5F15\u3063\u8D8A\u3057\u3066\u51FA\u308B", "tail": "out" }, { "w": "pass out", "b": "pass", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6C17\u3092\u5931\u3046", "tail": "out" }, { "w": "pay back", "b": "pay", "past": "paid", "pp": "paid", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u304A\u91D1\u3092\u8FD4\u3059", "tail": "back", "ot": ["person", "thing"] }, { "w": "point out", "b": "point", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6307\u6458\u3059\u308B", "tail": "out", "ot": ["abstract", "word"] }, { "w": "pull over", "b": "pull", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8ECA\u3092\u6B62\u3081\u308B", "tail": "over" }, { "w": "put together", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u7D44\u307F\u7ACB\u3066\u308B", "tail": "together", "ot": ["thing", "build"] }, { "w": "put up", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u306F\u308A\u51FA\u3059", "tail": "up", "ot": ["read", "thing"] }, { "w": "set off", "b": "set", "past": "set", "pp": "set", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u51FA\u767A\u3059\u308B", "tail": "off" }, { "w": "shut down", "b": "shut", "past": "shut", "pp": "shut", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u96FB\u6E90\u3092\u5207\u308B", "tail": "down", "ot": ["device", "thing"] }, { "w": "sit back", "b": "sit", "past": "sat", "pp": "sat", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u304F\u3064\u308D\u3050", "tail": "back" }, { "w": "sort out", "b": "sort", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6574\u7406\u3059\u308B", "tail": "out", "ot": ["thing", "abstract"] }, { "w": "stand out", "b": "stand", "past": "stood", "pp": "stood", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u76EE\u7ACB\u3064", "tail": "out" }, { "w": "start out", "b": "start", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u59CB\u3081\u308B", "tail": "out" }, { "w": "step back", "b": "step", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u4E00\u6B69\u4E0B\u304C\u308B", "tail": "back" }, { "w": "take on", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5F15\u304D\u53D7\u3051\u308B", "tail": "on", "ot": ["event", "abstract"] }, { "w": "take over", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5F15\u304D\u7D99\u3050", "tail": "over", "ot": ["event", "thing", "abstract"] }, { "w": "throw out", "b": "throw", "past": "threw", "pp": "thrown", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6368\u3066\u308B", "tail": "out", "ot": ["thing", "food"] }, { "w": "turn in", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u63D0\u51FA\u3059\u308B", "tail": "in", "ot": ["homework", "write", "read"] }, { "w": "switch on", "b": "switch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u30B9\u30A4\u30C3\u30C1\u3092\u5165\u308C\u308B", "tail": "on", "ot": ["device"] }, { "w": "get by", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u306A\u3093\u3068\u304B\u3084\u3063\u3066\u3044\u304F", "tail": "by" }, { "w": "get along", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u4EF2\u3088\u304F\u3059\u308B", "tail": "along" }, { "w": "get lost", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u9053\u306B\u8FF7\u3046", "tail": "lost" }, { "w": "get ready", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u6E96\u5099\u3059\u308B", "tail": "ready" }, { "w": "get married", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u7D50\u5A5A\u3059\u308B", "tail": "married" }, { "w": "get better", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u3088\u304F\u306A\u308B", "tail": "better" }, { "w": "get rid of", "b": "get", "past": "got", "pp": "gotten", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u51E6\u5206\u3059\u308B", "tail": "rid of", "ot": ["thing"] }, { "w": "go up", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u4E0A\u304C\u308B", "tail": "up" }, { "w": "go down", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u4E0B\u304C\u308B", "tail": "down" }, { "w": "go by", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u904E\u304E\u308B", "tail": "by" }, { "w": "go shopping", "b": "go", "past": "went", "pp": "gone", "s3": "goes", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8CB7\u3044\u7269\u306B\u884C\u304F", "tail": "shopping" }, { "w": "come up", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8A71\u306B\u51FA\u3066\u304F\u308B", "tail": "up" }, { "w": "come true", "b": "come", "past": "came", "pp": "come", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5B9F\u73FE\u3059\u308B", "tail": "true" }, { "w": "take in", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u53D6\u308A\u5165\u308C\u308B", "tail": "in", "ot": ["thing", "abstract"] }, { "w": "take apart", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5206\u89E3\u3059\u308B", "tail": "apart", "ot": ["thing", "device"] }, { "w": "take turns", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u4EA4\u4EE3\u3067\u3059\u308B", "tail": "turns" }, { "w": "put in", "b": "put", "past": "put", "pp": "put", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u5165\u308C\u308B", "tail": "in", "ot": ["thing"] }, { "w": "turn over", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3072\u3063\u304F\u308A\u8FD4\u3059", "tail": "over", "ot": ["thing"] }, { "w": "look back", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u632F\u308A\u8FD4\u308B", "tail": "back" }, { "w": "look through", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u76EE\u3092\u901A\u3059", "tail": "through", "ot": ["read", "write"] }, { "w": "look over", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3056\u3063\u3068\u898B\u76F4\u3059", "tail": "over", "ot": ["read", "write", "homework"] }, { "w": "look up to", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5C0A\u656C\u3059\u308B", "tail": "up to", "ot": ["person"] }, { "w": "look down on", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u898B\u4E0B\u3059", "tail": "down on", "ot": ["person"] }, { "w": "give out", "b": "give", "past": "gave", "pp": "given", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u914D\u308B", "tail": "out", "ot": ["thing", "food", "read"] }, { "w": "run around", "b": "run", "past": "ran", "pp": "run", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u8D70\u308A\u56DE\u308B", "tail": "around" }, { "w": "bring in", "b": "bring", "past": "brought", "pp": "brought", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6301\u3061\u3053\u3080", "tail": "in", "ot": ["thing", "food"] }, { "w": "bring out", "b": "bring", "past": "brought", "pp": "brought", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5F15\u304D\u51FA\u3059", "tail": "out", "ot": ["thing", "abstract"] }, { "w": "break in", "b": "break", "past": "broke", "pp": "broken", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u62BC\u3057\u5165\u308B", "tail": "in" }, { "w": "break out", "b": "break", "past": "broke", "pp": "broken", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8D77\u3053\u308B", "tail": "out" }, { "w": "hang around", "b": "hang", "past": "hung", "pp": "hung", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3076\u3089\u3076\u3089\u3059\u308B", "tail": "around" }, { "w": "show off", "b": "show", "past": "showed", "pp": "shown", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u898B\u305B\u3073\u3089\u304B\u3059", "tail": "off", "ot": ["thing"] }, { "w": "show around", "b": "show", "past": "showed", "pp": "shown", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6848\u5185\u3059\u308B", "tail": "around", "ot": ["person"] }, { "w": "make it", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u9593\u306B\u5408\u3046", "tail": "it" }, { "w": "make fun of", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u304B\u3089\u304B\u3046", "tail": "fun of", "ot": ["person"] }, { "w": "catch on", "b": "catch", "past": "caught", "pp": "caught", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u308F\u304B\u3063\u3066\u304F\u308B", "tail": "on" }, { "w": "clean out", "b": "clean", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4E2D\u3092\u7247\u3065\u3051\u308B", "tail": "out", "ot": ["clean"] }, { "w": "dress up", "b": "dress", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u304A\u3057\u3083\u308C\u3059\u308B", "tail": "up" }, { "w": "fill up", "b": "fill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3044\u3063\u3071\u3044\u306B\u3059\u308B", "tail": "up", "ot": ["thing", "drink"] }, { "w": "blow up", "b": "blow", "past": "blew", "pp": "blown", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3075\u304F\u3089\u307E\u305B\u308B", "tail": "up", "ot": ["thing"] }, { "w": "blow out", "b": "blow", "past": "blew", "pp": "blown", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5439\u304D\u6D88\u3059", "tail": "out", "ot": ["thing"] }, { "w": "count on", "b": "count", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u983C\u308A\u306B\u3059\u308B", "tail": "on", "ot": ["person"] }, { "w": "hand in", "b": "hand", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u63D0\u51FA\u3059\u308B", "tail": "in", "ot": ["homework", "write", "read"] }, { "w": "hand out", "b": "hand", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u914D\u308B", "tail": "out", "ot": ["thing", "read", "food"] }, { "w": "hear from", "b": "hear", "past": "heard", "pp": "heard", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u9023\u7D61\u3092\u3082\u3089\u3046", "tail": "from", "ot": ["person"] }, { "w": "line up", "b": "line", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5217\u306B\u4E26\u3076", "tail": "up" }, { "w": "log in", "b": "log", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u30ED\u30B0\u30A4\u30F3\u3059\u308B", "tail": "in" }, { "w": "log out", "b": "log", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u30ED\u30B0\u30A2\u30A6\u30C8\u3059\u308B", "tail": "out" }, { "w": "mix up", "b": "mix", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3054\u3061\u3083\u307E\u305C\u306B\u3059\u308B", "tail": "up", "ot": ["thing"] }, { "w": "pack up", "b": "pack", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8377\u3065\u304F\u308A\u3059\u308B", "tail": "up" }, { "w": "pick on", "b": "pick", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3044\u3058\u3081\u308B", "tail": "on", "ot": ["person"] }, { "w": "plug in", "b": "plug", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u30B3\u30F3\u30BB\u30F3\u30C8\u306B\u3055\u3059", "tail": "in", "ot": ["device", "thing"] }, { "w": "pop up", "b": "pop", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u3072\u3087\u3063\u3053\u308A\u51FA\u3066\u304F\u308B", "tail": "up" }, { "w": "sell out", "b": "sell", "past": "sold", "pp": "sold", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u58F2\u308A\u5207\u308C\u308B", "tail": "out" }, { "w": "settle down", "b": "settle", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u843D\u3061\u7740\u304F", "tail": "down" }, { "w": "sleep in", "b": "sleep", "past": "slept", "pp": "slept", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u671D\u5BDD\u574A\u3059\u308B", "tail": "in" }, { "w": "sleep over", "b": "sleep", "past": "slept", "pp": "slept", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6CCA\u307E\u308B", "tail": "over" }, { "w": "stay up", "b": "stay", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u591C\u3075\u304B\u3057\u3059\u308B", "tail": "up" }, { "w": "stay in", "b": "stay", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5BB6\u306B\u3044\u308B", "tail": "in" }, { "w": "stay out", "b": "stay", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5916\u306B\u51FA\u305F\u307E\u307E\u3067\u3044\u308B", "tail": "out" }, { "w": "stick to", "b": "stick", "past": "stuck", "pp": "stuck", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5B88\u308B", "tail": "to", "ot": ["abstract", "event"] }, { "w": "stick around", "b": "stick", "past": "stuck", "pp": "stuck", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u305D\u306E\u3078\u3093\u306B\u3044\u308B", "tail": "around" }, { "w": "think over", "b": "think", "past": "thought", "pp": "thought", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3088\u304F\u8003\u3048\u308B", "tail": "over", "ot": ["abstract", "event"] }, { "w": "try on", "b": "try", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A66\u7740\u3059\u308B", "tail": "on", "ot": ["wear", "thing"] }, { "w": "try out", "b": "try", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A66\u3057\u3066\u307F\u308B", "tail": "out", "ot": ["thing", "food", "game", "device"] }, { "w": "tidy up", "b": "tidy", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7247\u3065\u3051\u308B", "tail": "up" }, { "w": "warm up", "b": "warm", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6E96\u5099\u904B\u52D5\u3092\u3059\u308B", "tail": "up" }, { "w": "cool down", "b": "cool", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u51B7\u3081\u308B", "tail": "down" }, { "w": "fit in", "b": "fit", "past": "fit", "pp": "fit", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u306A\u3058\u3080", "tail": "in" }, { "w": "fall asleep", "b": "fall", "past": "fell", "pp": "fallen", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7720\u308A\u3053\u3080", "tail": "asleep" }, { "w": "fall behind", "b": "fall", "past": "fell", "pp": "fallen", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u9045\u308C\u308B", "tail": "behind" }, { "w": "fall for", "b": "fall", "past": "fell", "pp": "fallen", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u597D\u304D\u306B\u306A\u308B", "tail": "for", "ot": ["person"] }, { "w": "keep going", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u304C\u3093\u3070\u308A\u7D9A\u3051\u308B", "tail": "going" }, { "w": "let down", "b": "let", "past": "let", "pp": "let", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u304C\u3063\u304B\u308A\u3055\u305B\u308B", "tail": "down", "ot": ["person"] }, { "w": "let in", "b": "let", "past": "let", "pp": "let", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u4E2D\u306B\u5165\u308C\u308B", "tail": "in", "ot": ["person", "animal"] }, { "w": "pass away", "b": "pass", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u4EA1\u304F\u306A\u308B", "tail": "away" }, { "w": "pay for", "b": "pay", "past": "paid", "pp": "paid", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6255\u3046", "tail": "for", "ot": ["food", "drink", "thing"] }, { "w": "sit up", "b": "sit", "past": "sat", "pp": "sat", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u8D77\u304D\u4E0A\u304C\u308B", "tail": "up" }, { "w": "stand by", "b": "stand", "past": "stood", "pp": "stood", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5F85\u6A5F\u3059\u308B", "tail": "by" }, { "w": "stand for", "b": "stand", "past": "stood", "pp": "stood", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8868\u3059", "tail": "for", "ot": ["abstract"] }, { "w": "take after", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4F3C\u3066\u3044\u308B", "tail": "after", "ot": ["person"] }, { "w": "talk over", "b": "talk", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A71\u3057\u5408\u3046", "tail": "over", "ot": ["abstract", "event"] }, { "w": "wash up", "b": "wash", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u624B\u3092\u6D17\u3046", "tail": "up" }, { "w": "write back", "b": "write", "past": "wrote", "pp": "written", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8FD4\u4E8B\u3092\u66F8\u304F", "tail": "back" }, { "w": "drop out", "b": "drop", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "intr", "lv": 3, "ja": "\u9014\u4E2D\u3067\u3084\u3081\u308B", "tail": "out" }, { "w": "eat up", "b": "eat", "past": "ate", "pp": "eaten", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u305F\u3044\u3089\u3052\u308B", "tail": "up", "ot": ["food"] }, { "w": "sign in", "b": "sign", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30B5\u30A4\u30F3\u30A4\u30F3\u3059\u308B", "tail": "in" }, { "w": "call up", "b": "call", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u96FB\u8A71\u3059\u308B", "tail": "up", "ot": ["person"] }, { "w": "jump in", "b": "jump", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8A71\u306B\u5272\u308A\u3053\u3080", "tail": "in" }, { "w": "save up", "b": "save", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u8CAF\u91D1\u3059\u308B", "tail": "up" }, { "w": "switch off", "b": "switch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u30B9\u30A4\u30C3\u30C1\u3092\u5207\u308B", "tail": "off", "ot": ["device"] }, { "w": "wrap up", "b": "wrap", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u307E\u3068\u3081\u308B", "tail": "up", "ot": ["event", "abstract"] }, { "w": "brush up on", "b": "brush", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u78E8\u304D\u76F4\u3059", "tail": "up on", "ot": ["lang", "sport", "instr"] }, { "w": "knock down", "b": "knock", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u305F\u304A\u3059", "tail": "down", "ot": ["thing"] }, { "w": "wear out", "b": "wear", "past": "wore", "pp": "worn", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3059\u308A\u5207\u308C\u308B", "tail": "out" }, { "w": "make sure", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u78BA\u304B\u3081\u308B", "tail": "sure" }, { "w": "make sense", "b": "make", "past": "made", "pp": "made", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u610F\u5473\u304C\u901A\u3058\u308B", "tail": "sense" }, { "w": "believe in", "b": "believe", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4FE1\u3058\u308B", "tail": "in", "ot": ["person", "abstract"] }, { "w": "think of", "b": "think", "past": "thought", "pp": "thought", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u601D\u3044\u3064\u304F", "tail": "of", "ot": ["any"] }, { "w": "dream of", "b": "dream", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5922\u898B\u308B", "tail": "of", "ot": ["any"] }, { "w": "dream about", "b": "dream", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5922\u3092\u898B\u308B", "tail": "about", "ot": ["any"] }, { "w": "ask for", "b": "ask", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u305F\u306E\u3080", "tail": "for", "ot": ["any"] }, { "w": "hope for", "b": "hope", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u9858\u3046", "tail": "for", "ot": ["any"] }, { "w": "wish for", "b": "wish", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u9858\u3046", "tail": "for", "ot": ["any"] }, { "w": "pray for", "b": "pray", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7948\u308B", "tail": "for", "ot": ["any"] }, { "w": "long for", "b": "long", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3042\u3053\u304C\u308C\u308B", "tail": "for", "ot": ["any"] }, { "w": "learn about", "b": "learn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5B66\u3076", "tail": "about", "ot": ["any"] }, { "w": "hear of", "b": "hear", "past": "heard", "pp": "heard", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u805E\u304F", "tail": "of", "ot": ["any"] }, { "w": "hear about", "b": "hear", "past": "heard", "pp": "heard", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u805E\u304F", "tail": "about", "ot": ["any"] }, { "w": "think about", "b": "think", "past": "thought", "pp": "thought", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8003\u3048\u308B", "tail": "about", "ot": ["any"] }, { "w": "take advantage of", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5229\u7528\u3059\u308B", "tail": "advantage of", "ot": ["offer", "abstract", "event"] }, { "w": "keep in touch", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u9023\u7D61\u3092\u53D6\u308A\u5408\u3046", "tail": "in touch" }, { "w": "have a good time", "b": "have", "past": "had", "pp": "had", "s3": "has", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u697D\u3057\u304F\u904E\u3054\u3059", "tail": "a good time" }, { "w": "take part in", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u53C2\u52A0\u3059\u308B", "tail": "part in", "ot": ["event", "sport"] }, { "w": "pay attention to", "b": "pay", "past": "paid", "pp": "paid", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6CE8\u610F\u3092\u6255\u3046", "tail": "attention to", "ot": ["any"] }, { "w": "take place", "b": "take", "past": "took", "pp": "taken", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u884C\u308F\u308C\u308B", "tail": "place" }, { "w": "focus on", "b": "focus", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u96C6\u4E2D\u3059\u308B", "tail": "on", "ot": ["homework", "abstract", "sport", "lang"] }, { "w": "rely on", "b": "rely", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u983C\u308B", "tail": "on", "ot": ["person", "thing"] }, { "w": "lead to", "b": "lead", "past": "led", "pp": "led", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3064\u306A\u304C\u308B", "tail": "to", "ot": ["abstract", "event"] }, { "w": "look like", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u4F3C\u3066\u3044\u308B", "tail": "like", "ot": ["person", "animal", "thing"] }, { "w": "try", "b": "try", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u3084\u3063\u3066\u307F\u308B", "ot": ["food", "sport", "game", "thing"], "cv": "both" }, { "w": "stay", "b": "stay", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u3068\u3069\u307E\u308B", "link": 1 }, { "w": "live", "b": "live", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u4F4F\u3080" }, { "w": "move", "b": "move", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u52D5\u304F" }, { "w": "stop", "b": "stop", "past": "stopped", "pp": "stopped", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u6B62\u307E\u308B", "cv": "ing" }, { "w": "change", "b": "change", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5909\u308F\u308B" }, { "w": "begin", "b": "begin", "past": "began", "pp": "begun", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u59CB\u307E\u308B", "cv": "both" }, { "w": "finish", "b": "finish", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u7D42\u3048\u308B", "ot": ["homework", "food", "read", "write", "event"], "cv": "ing" }, { "w": "keep", "b": "keep", "past": "kept", "pp": "kept", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3068\u3063\u3066\u304A\u304F", "ot": ["thing", "food"], "cv": "ing" }, { "w": "let go", "b": "let", "past": "let", "pp": "let", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u624B\u653E\u3059", "tail": "go" }, { "w": "spend", "b": "spend", "past": "spent", "pp": "spent", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u904E\u3054\u3059", "ot": ["event"] }, { "w": "save", "b": "save", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3068\u3063\u3066\u304A\u304F", "ot": ["thing", "food"] }, { "w": "miss", "b": "miss", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u604B\u3057\u304F\u601D\u3046", "ot": ["person", "animal", "event"], "cv": "ing" }, { "w": "understand", "b": "understand", "past": "understood", "pp": "understood", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u308F\u304B\u308B", "ot": ["word", "lang", "tell"] }, { "w": "explain", "b": "explain", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u8AAC\u660E\u3059\u308B", "ot": ["word", "tell", "event"] }, { "w": "plan", "b": "plan", "past": "planned", "pp": "planned", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A08\u753B\u3059\u308B", "ot": ["event"], "cv": "to" }, { "w": "prepare", "b": "prepare", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u6E96\u5099\u3059\u308B", "ot": ["food", "event"] }, { "w": "decide", "b": "decide", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6C7A\u3081\u308B", "cv": "to" }, { "w": "worry", "b": "worry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5FC3\u914D\u3059\u308B" }, { "w": "agree", "b": "agree", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u8CDB\u6210\u3059\u308B", "cv": "to" }, { "w": "smell", "b": "smell", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u306B\u304A\u3044\u3092\u304B\u3050", "ot": ["food", "drink", "plant"] }, { "w": "taste", "b": "taste", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5473\u898B\u3059\u308B", "ot": ["food", "drink"] }, { "w": "touch", "b": "touch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3055\u308F\u308B", "ot": ["thing", "animal", "any"] }, { "w": "hold", "b": "hold", "past": "held", "pp": "held", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6301\u3064", "ot": ["thing", "animal", "person"] }, { "w": "drop", "b": "drop", "past": "dropped", "pp": "dropped", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u843D\u3068\u3059", "ot": ["thing", "food"] }, { "w": "fill", "b": "fill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6E80\u305F\u3059", "ot": ["thing"] }, { "w": "wrap", "b": "wrap", "past": "wrapped", "pp": "wrapped", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5305\u3080", "ot": ["thing", "present"] }, { "w": "collect", "b": "collect", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u96C6\u3081\u308B", "ot": ["thing", "toy"] }, { "w": "share", "b": "share", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u5206\u3051\u5408\u3046", "ot": ["food", "thing"] }, { "w": "order", "b": "order", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u6CE8\u6587\u3059\u308B", "ot": ["food", "drink"] }, { "w": "rent", "b": "rent", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u501F\u308A\u308B", "ot": ["ride", "thing"] }, { "w": "pack", "b": "pack", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u8377\u9020\u308A\u3059\u308B", "ot": ["thing"] }, { "w": "mix", "b": "mix", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6DF7\u305C\u308B", "ot": ["food", "drink"] }, { "w": "bake", "b": "bake", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u713C\u304F", "ot": ["food"] }, { "w": "boil", "b": "boil", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3086\u3067\u308B", "ot": ["food"] }, { "w": "fry", "b": "fry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3044\u305F\u3081\u308B", "ot": ["food"] }, { "w": "pour", "b": "pour", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6CE8\u3050", "ot": ["drink"] }, { "w": "serve", "b": "serve", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u51FA\u3059", "ot": ["food", "drink"] }, { "w": "type", "b": "type", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5165\u529B\u3059\u308B", "ot": ["write", "word"] }, { "w": "print", "b": "print", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5370\u5237\u3059\u308B", "ot": ["read", "write"] }, { "w": "record", "b": "record", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u9332\u97F3\u3059\u308B", "ot": ["music"] }, { "w": "download", "b": "download", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3059\u308B", "ot": ["thing", "music"] }, { "w": "search", "b": "search", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u691C\u7D22\u3059\u308B" }, { "w": "post", "b": "post", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6295\u7A3F\u3059\u308B", "ot": ["write"] }, { "w": "greet", "b": "greet", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3042\u3044\u3055\u3064\u3059\u308B", "ot": ["person"] }, { "w": "thank", "b": "thank", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u611F\u8B1D\u3059\u308B", "ot": ["person"] }, { "w": "marry", "b": "marry", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u7D50\u5A5A\u3059\u308B", "ot": ["person"] }, { "w": "wave", "b": "wave", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u624B\u3092\u3075\u308B" }, { "w": "nod", "b": "nod", "past": "nodded", "pp": "nodded", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3046\u306A\u305A\u304F" }, { "w": "yell", "b": "yell", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u5927\u58F0\u3092\u51FA\u3059" }, { "w": "whisper", "b": "whisper", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3055\u3055\u3084\u304F" }, { "w": "sneeze", "b": "sneeze", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u304F\u3057\u3083\u307F\u3092\u3059\u308B" }, { "w": "cough", "b": "cough", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u305B\u304D\u3092\u3059\u308B" }, { "w": "yawn", "b": "yawn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3042\u304F\u3073\u3092\u3059\u308B" }, { "w": "breathe", "b": "breathe", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u606F\u3092\u3059\u308B" }, { "w": "blink", "b": "blink", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u307E\u3070\u305F\u304D\u3059\u308B" }, { "w": "shake", "b": "shake", "past": "shook", "pp": "shaken", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3075\u308B", "ot": ["thing"] }, { "w": "bite", "b": "bite", "past": "bit", "pp": "bitten", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u304B\u3080", "ot": ["food", "thing"] }, { "w": "lick", "b": "lick", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u306A\u3081\u308B", "ot": ["food"] }, { "w": "chew", "b": "chew", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u304B\u3080", "ot": ["food"] }, { "w": "swallow", "b": "swallow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u98F2\u307F\u3053\u3080", "ot": ["food"] }, { "w": "stretch", "b": "stretch", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u306E\u3073\u3092\u3059\u308B" }, { "w": "bow", "b": "bow", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u304A\u3058\u304E\u3059\u308B" }, { "w": "kneel", "b": "kneel", "past": "knelt", "pp": "knelt", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3072\u3056\u307E\u305A\u304F" }, { "w": "crawl", "b": "crawl", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u306F\u3046" }, { "w": "roll", "b": "roll", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u8EE2\u304C\u308B" }, { "w": "slide", "b": "slide", "past": "slid", "pp": "slid", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3059\u3079\u308B" }, { "w": "float", "b": "float", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6D6E\u304B\u3076" }, { "w": "sink", "b": "sink", "past": "sank", "pp": "sunk", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6C88\u3080" }, { "w": "shine", "b": "shine", "past": "shone", "pp": "shone", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u304B\u304C\u3084\u304F" }, { "w": "melt", "b": "melt", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3068\u3051\u308B" }, { "w": "burn", "b": "burn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u71C3\u3048\u308B" }, { "w": "freeze", "b": "freeze", "past": "froze", "pp": "frozen", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u3053\u304A\u308B" }, { "w": "ring", "b": "ring", "past": "rang", "pp": "rung", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u9CF4\u308B" }, { "w": "knock", "b": "knock", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30CE\u30C3\u30AF\u3059\u308B" }, { "w": "skip", "b": "skip", "past": "skipped", "pp": "skipped", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u30B9\u30AD\u30C3\u30D7\u3059\u308B" }, { "w": "hop", "b": "hop", "past": "hopped", "pp": "hopped", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3074\u3087\u3093\u3068\u8DF3\u3076" }, { "w": "march", "b": "march", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u884C\u9032\u3059\u308B" }, { "w": "race", "b": "race", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7AF6\u8D70\u3059\u308B" }, { "w": "score", "b": "score", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u5F97\u70B9\u3059\u308B" }, { "w": "cheer", "b": "cheer", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5FDC\u63F4\u3059\u308B" }, { "w": "clap", "b": "clap", "past": "clapped", "pp": "clapped", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u624B\u3092\u305F\u305F\u304F" }, { "w": "celebrate", "b": "celebrate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u304A\u795D\u3044\u3059\u308B", "ot": ["event"] }, { "w": "hug each other", "b": "hug", "past": "hugged", "pp": "hugged", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u62B1\u304D\u5408\u3046", "tail": "each other" }, { "w": "sail", "b": "sail", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u822A\u6D77\u3059\u308B" }, { "w": "camp", "b": "camp", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u30AD\u30E3\u30F3\u30D7\u3059\u308B" }, { "w": "fish", "b": "fish", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3064\u308A\u3092\u3059\u308B" }, { "w": "hike", "b": "hike", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u30CF\u30A4\u30AD\u30F3\u30B0\u3059\u308B" }, { "w": "ski", "b": "ski", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30B9\u30AD\u30FC\u3092\u3059\u308B" }, { "w": "skate", "b": "skate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30B9\u30B1\u30FC\u30C8\u3092\u3059\u308B" }, { "w": "surf", "b": "surf", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u30B5\u30FC\u30D5\u30A3\u30F3\u3092\u3059\u308B" }, { "w": "jog", "b": "jog", "past": "jogged", "pp": "jogged", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u30B8\u30E7\u30AE\u30F3\u30B0\u3059\u308B" }, { "w": "paint pictures", "b": "paint", "past": "painted", "pp": "painted", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u7D75\u3092\u63CF\u304F", "tail": "pictures" }, { "w": "argue", "b": "argue", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u8A00\u3044\u4E89\u3046" }, { "w": "complain", "b": "complain", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6587\u53E5\u3092\u8A00\u3046" }, { "w": "lie", "b": "lie", "past": "lied", "pp": "lied", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u3046\u305D\u3092\u3064\u304F" }, { "w": "promise", "b": "promise", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u7D04\u675F\u3059\u308B", "cv": "to" }, { "w": "imagine", "b": "imagine", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u60F3\u50CF\u3059\u308B", "cv": "ing" }, { "w": "forgive", "b": "forgive", "past": "forgave", "pp": "forgiven", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8A31\u3059", "ot": ["person"] }, { "w": "trust", "b": "trust", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4FE1\u983C\u3059\u308B", "ot": ["person"] }, { "w": "respect", "b": "respect", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5C0A\u656C\u3059\u308B", "ot": ["person"] }, { "w": "prefer", "b": "prefer", "past": "preferred", "pp": "preferred", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u301C\u306E\u307B\u3046\u304C\u597D\u304D\u3060", "ot": ["food", "drink", "any"], "cv": "both" }, { "w": "pass by", "b": "pass", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u901A\u308A\u3059\u304E\u308B", "tail": "by" }, { "w": "attack", "b": "attack", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u653B\u6483\u3059\u308B", "ot": ["person", "animal"] }, { "w": "beat", "b": "beat", "past": "beat", "pp": "beaten", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u8CA0\u304B\u3059", "ot": ["person"] }, { "w": "defeat", "b": "defeat", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6253\u3061\u8CA0\u304B\u3059", "ot": ["person"] }, { "w": "rescue", "b": "rescue", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6551\u3046", "ot": ["person", "animal"] }, { "w": "save money", "b": "save", "past": "saved", "pp": "saved", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u304A\u91D1\u3092\u305F\u3081\u308B", "tail": "money" }, { "w": "earn", "b": "earn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u304B\u305B\u3050" }, { "w": "borrow money", "b": "borrow", "past": "borrowed", "pp": "borrowed", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u304A\u91D1\u3092\u501F\u308A\u308B", "tail": "money" }, { "w": "introduce", "b": "introduce", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u7D39\u4ECB\u3059\u308B", "ot": ["person"] }, { "w": "recommend", "b": "recommend", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u3059\u3059\u3081\u308B", "ot": ["food", "read", "watch", "thing"] }, { "w": "compare", "b": "compare", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6BD4\u3079\u308B", "ot": ["thing", "food"] }, { "w": "measure", "b": "measure", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u306F\u304B\u308B", "ot": ["thing"] }, { "w": "weigh", "b": "weigh", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u91CD\u3055\u3092\u306F\u304B\u308B", "ot": ["thing", "food"] }, { "w": "repair", "b": "repair", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4FEE\u7406\u3059\u308B", "ot": ["thing", "ride", "device"] }, { "w": "design", "b": "design", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u30C7\u30B6\u30A4\u30F3\u3059\u308B", "ot": ["thing", "build"] }, { "w": "create", "b": "create", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4F5C\u308A\u51FA\u3059", "ot": ["thing", "build", "write"] }, { "w": "invent", "b": "invent", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u767A\u660E\u3059\u308B", "ot": ["thing"] }, { "w": "solve", "b": "solve", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u89E3\u304F", "ot": ["word", "over"] }, { "w": "memorize", "b": "memorize", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6697\u8A18\u3059\u308B", "ot": ["word", "lang"] }, { "w": "review", "b": "review", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u5FA9\u7FD2\u3059\u308B", "ot": ["lang", "homework"] }, { "w": "translate", "b": "translate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u7FFB\u8A33\u3059\u308B", "ot": ["write", "word", "read"] }, { "w": "spell", "b": "spell", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3064\u3065\u308B", "ot": ["word"] }, { "w": "pronounce", "b": "pronounce", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u767A\u97F3\u3059\u308B", "ot": ["word"] }, { "w": "describe", "b": "describe", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8AAC\u660E\u3059\u308B", "ot": ["thing", "person", "event"] }, { "w": "report", "b": "report", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5831\u544A\u3059\u308B", "ot": ["event"] }, { "w": "announce", "b": "announce", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u767A\u8868\u3059\u308B", "ot": ["event"] }, { "w": "vote", "b": "vote", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u6295\u7968\u3059\u308B" }, { "w": "join", "b": "join", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u53C2\u52A0\u3059\u308B", "ot": ["event", "sport"] }, { "w": "leave the room", "b": "leave", "past": "left", "pp": "left", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u90E8\u5C4B\u3092\u51FA\u308B", "tail": "the room" }, { "w": "book", "b": "book", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u4E88\u7D04\u3059\u308B", "ot": ["event", "ride"] }, { "w": "cancel", "b": "cancel", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u30AD\u30E3\u30F3\u30BB\u30EB\u3059\u308B", "ot": ["event"] }, { "w": "miss the bus", "b": "miss", "past": "missed", "pp": "missed", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u30D0\u30B9\u306B\u4E57\u308A\u304A\u304F\u308C\u308B", "tail": "the bus" }, { "w": "raise", "b": "raise", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3042\u3052\u308B", "ot": ["thing"] }, { "w": "lower", "b": "lower", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u4E0B\u3052\u308B", "ot": ["thing"] }, { "w": "lift", "b": "lift", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6301\u3061\u4E0A\u3052\u308B", "ot": ["thing"] }, { "w": "drag", "b": "drag", "past": "dragged", "pp": "dragged", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u5F15\u304D\u305A\u308B", "ot": ["thing"] }, { "w": "tie", "b": "tie", "past": "tied", "pp": "tied", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u7D50\u3076", "ot": ["thing"] }, { "w": "fold", "b": "fold", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u6298\u308A\u305F\u305F\u3080", "ot": ["thing", "write"] }, { "w": "tear", "b": "tear", "past": "tore", "pp": "torn", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u7834\u308B", "ot": ["write", "read"] }, { "w": "turn back", "b": "turn", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5F15\u304D\u8FD4\u3059", "tail": "back" }, { "w": "knit", "b": "knit", "past": "knitted", "pp": "knitted", "s3": "", "dbl": 0, "fr": "tr", "lv": 3, "ja": "\u7DE8\u3080", "ot": ["thing"] }, { "w": "sew", "b": "sew", "past": "sewed", "pp": "sewn", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u306C\u3046", "ot": ["thing"] }, { "w": "iron", "b": "iron", "past": "", "pp": "", "s3": "", "dbl": 1, "fr": "tr", "lv": 3, "ja": "\u30A2\u30A4\u30ED\u30F3\u3092\u304B\u3051\u308B", "ot": ["thing"] }, { "w": "sweep", "b": "sweep", "past": "swept", "pp": "swept", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u306F\u304F", "ot": ["clean"] }, { "w": "vacuum", "b": "vacuum", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u6383\u9664\u6A5F\u3092\u304B\u3051\u308B", "ot": ["clean"] }, { "w": "water", "b": "water", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u6C34\u3092\u3084\u308B", "ot": ["plant"] }, { "w": "grow plants", "b": "grow", "past": "grew", "pp": "grown", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u690D\u7269\u3092\u80B2\u3066\u308B", "tail": "plants" }, { "w": "pick flowers", "b": "pick", "past": "picked", "pp": "picked", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u82B1\u3092\u3064\u3080", "tail": "flowers" }, { "w": "feed the cat", "b": "feed", "past": "fed", "pp": "fed", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u306D\u3053\u306B\u3048\u3055\u3092\u3084\u308B", "tail": "the cat" }, { "w": "walk the dog", "b": "walk", "past": "walked", "pp": "walked", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u72AC\u306E\u6563\u6B69\u3092\u3059\u308B", "tail": "the dog" }, { "w": "whistle", "b": "whistle", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u53E3\u7B1B\u3092\u3075\u304F" }, { "w": "tiptoe", "b": "tiptoe", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3064\u307E\u5148\u3067\u6B69\u304F" }, { "w": "giggle", "b": "giggle", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u304F\u3059\u304F\u3059\u7B11\u3046" }, { "w": "sigh", "b": "sigh", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u305F\u3081\u606F\u3092\u3064\u304F" }, { "w": "shiver", "b": "shiver", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 3, "ja": "\u3075\u308B\u3048\u308B" }, { "w": "frown", "b": "frown", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u9854\u3092\u3057\u304B\u3081\u308B" }, { "w": "gossip", "b": "gossip", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 4, "ja": "\u3046\u308F\u3055\u8A71\u3092\u3059\u308B" }, { "w": "wander", "b": "wander", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u3076\u3089\u3076\u3089\u6B69\u304F" }, { "w": "explore", "b": "explore", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u63A2\u691C\u3059\u308B", "ot": ["place"] }, { "w": "investigate", "b": "investigate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 4, "ja": "\u8ABF\u3079\u308B", "ot": ["event", "thing"] }, { "w": "add", "b": "add", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u52A0\u3048\u308B", "ot": ["food", "thing", "word"] }, { "w": "blow", "b": "blow", "past": "blew", "pp": "blown", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5439\u304F" }, { "w": "brush", "b": "brush", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u307F\u304C\u304F", "ot": ["brush"] }, { "w": "color", "b": "color", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8272\u3092\u306C\u308B", "ot": ["draw"] }, { "w": "discuss", "b": "discuss", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u8A71\u3057\u5408\u3046", "ot": ["event", "abstract", "word"] }, { "w": "grow", "b": "grow", "past": "grew", "pp": "grown", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u80B2\u3066\u308B", "ot": ["plant"] }, { "w": "happen", "b": "happen", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u8D77\u3053\u308B" }, { "w": "hurt", "b": "hurt", "past": "hurt", "pp": "hurt", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u3051\u304C\u3059\u308B", "ot": ["body"] }, { "w": "mean", "b": "mean", "past": "meant", "pp": "meant", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u610F\u5473\u3059\u308B", "ot": ["word"] }, { "w": "phone", "b": "phone", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u96FB\u8A71\u3059\u308B", "ot": ["person"] }, { "w": "repeat", "b": "repeat", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u304F\u308A\u8FD4\u3059", "ot": ["word", "thing"] }, { "w": "speak", "b": "speak", "past": "spoke", "pp": "spoken", "s3": "", "dbl": 0, "fr": "both", "lv": 1, "ja": "\u8A71\u3059", "ot": ["lang"] }, { "w": "welcome", "b": "welcome", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 1, "ja": "\u6B53\u8FCE\u3059\u308B", "ot": ["person"] }, { "w": "sit", "b": "sit", "past": "sat", "pp": "sat", "s3": "", "dbl": 0, "fr": "intr", "lv": 1, "ja": "\u5EA7\u308B" }, { "w": "accept", "b": "accept", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u53D7\u3051\u5165\u308C\u308B", "ot": ["offer", "abstract"] }, { "w": "achieve", "b": "achieve", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u9054\u6210\u3059\u308B", "ot": ["abstract"] }, { "w": "admire", "b": "admire", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5C0A\u656C\u3059\u308B", "ot": ["person"] }, { "w": "advise", "b": "advise", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u52A9\u8A00\u3059\u308B", "ot": ["person"] }, { "w": "annoy", "b": "annoy", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3044\u3089\u3044\u3089\u3055\u305B\u308B", "ot": ["person"] }, { "w": "apologize", "b": "apologize", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u3042\u3084\u307E\u308B" }, { "w": "apply", "b": "apply", "past": "applied", "pp": "applied", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u7533\u3057\u8FBC\u3080" }, { "w": "appreciate", "b": "appreciate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u611F\u8B1D\u3059\u308B", "ot": ["abstract", "help"] }, { "w": "avoid", "b": "avoid", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3055\u3051\u308B", "ot": ["thing", "person", "food", "abstract"], "cv": "ing" }, { "w": "bend", "b": "bend", "past": "bent", "pp": "bent", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u66F2\u3052\u308B", "ot": ["body", "thing"] }, { "w": "blame", "b": "blame", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u8CAC\u3081\u308B", "ot": ["person"] }, { "w": "bother", "b": "bother", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3058\u3083\u307E\u3059\u308B", "ot": ["person"] }, { "w": "bury", "b": "bury", "past": "buried", "pp": "buried", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3046\u3081\u308B", "ot": ["thing"] }, { "w": "chat", "b": "chat", "past": "chatted", "pp": "chatted", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u304A\u3057\u3083\u3079\u308A\u3059\u308B" }, { "w": "communicate", "b": "communicate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u610F\u601D\u3092\u4F1D\u3048\u5408\u3046" }, { "w": "concentrate", "b": "concentrate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u96C6\u4E2D\u3059\u308B" }, { "w": "confuse", "b": "confuse", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u6DF7\u4E71\u3055\u305B\u308B", "ot": ["person"] }, { "w": "consider", "b": "consider", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3088\u304F\u8003\u3048\u308B", "ot": ["abstract", "event", "offer"] }, { "w": "contact", "b": "contact", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u9023\u7D61\u3059\u308B", "ot": ["person"] }, { "w": "copy", "b": "copy", "past": "copied", "pp": "copied", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5199\u3059", "ot": ["write", "read"] }, { "w": "cover", "b": "cover", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u304A\u304A\u3046", "ot": ["thing", "food", "body"] }, { "w": "cross", "b": "cross", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u308F\u305F\u308B", "ot": ["road"] }, { "w": "destroy", "b": "destroy", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3053\u308F\u3059", "ot": ["thing", "build"] }, { "w": "develop", "b": "develop", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u958B\u767A\u3059\u308B", "ot": ["thing", "abstract"] }, { "w": "disagree", "b": "disagree", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u53CD\u5BFE\u3059\u308B" }, { "w": "disappear", "b": "disappear", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6D88\u3048\u308B" }, { "w": "disturb", "b": "disturb", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3058\u3083\u307E\u3059\u308B", "ot": ["person"] }, { "w": "divide", "b": "divide", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5206\u3051\u308B", "ot": ["food", "thing"] }, { "w": "dress", "b": "dress", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u670D\u3092\u7740\u308B" }, { "w": "dry", "b": "dry", "past": "dried", "pp": "dried", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4E7E\u304B\u3059", "ot": ["body", "wash", "thing"] }, { "w": "email", "b": "email", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u30E1\u30FC\u30EB\u3092\u9001\u308B", "ot": ["person"] }, { "w": "encourage", "b": "encourage", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u306F\u3052\u307E\u3059", "ot": ["person"] }, { "w": "end", "b": "end", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u7D42\u308F\u308B" }, { "w": "exist", "b": "exist", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5B58\u5728\u3059\u308B" }, { "w": "expect", "b": "expect", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u671F\u5F85\u3059\u308B", "ot": ["abstract", "event", "present"], "cv": "to" }, { "w": "fail", "b": "fail", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u843D\u3061\u308B", "ot": ["event"] }, { "w": "frighten", "b": "frighten", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3053\u308F\u304C\u3089\u305B\u308B", "ot": ["person", "animal"] }, { "w": "gather", "b": "gather", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u96C6\u307E\u308B" }, { "w": "graduate", "b": "graduate", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5352\u696D\u3059\u308B" }, { "w": "hand", "b": "hand", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u624B\u308F\u305F\u3059", "ot": ["thing", "read", "food"], "dt": 1 }, { "w": "impress", "b": "impress", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u611F\u52D5\u3055\u305B\u308B", "ot": ["person"] }, { "w": "improve", "b": "improve", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4E0A\u9054\u3055\u305B\u308B", "ot": ["skill", "lang", "abstract"] }, { "w": "increase", "b": "increase", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5897\u3048\u308B" }, { "w": "injure", "b": "injure", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3051\u304C\u3059\u308B", "ot": ["body"] }, { "w": "land", "b": "land", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u7740\u9678\u3059\u308B" }, { "w": "offer", "b": "offer", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u7533\u3057\u51FA\u308B", "ot": ["thing", "food", "drink", "help"], "dt": 1 }, { "w": "park", "b": "park", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "both", "lv": 2, "ja": "\u99D0\u8ECA\u3059\u308B", "ot": ["car"] }, { "w": "perform", "b": "perform", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6F14\u3058\u308B" }, { "w": "predict", "b": "predict", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u4E88\u60F3\u3059\u308B", "ot": ["event", "abstract"] }, { "w": "produce", "b": "produce", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u751F\u7523\u3059\u308B", "ot": ["thing", "food"] }, { "w": "publish", "b": "publish", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u51FA\u7248\u3059\u308B", "ot": ["read"] }, { "w": "receive", "b": "receive", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u53D7\u3051\u53D6\u308B", "ot": ["thing", "present", "read", "offer"] }, { "w": "recycle", "b": "recycle", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u30EA\u30B5\u30A4\u30AF\u30EB\u3059\u308B", "ot": ["thing"] }, { "w": "regret", "b": "regret", "past": "regretted", "pp": "regretted", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u5F8C\u6094\u3059\u308B", "ot": ["abstract"] }, { "w": "replace", "b": "replace", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u53D6\u308A\u66FF\u3048\u308B", "ot": ["thing", "device"] }, { "w": "retire", "b": "retire", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u5F15\u9000\u3059\u308B" }, { "w": "roast", "b": "roast", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u713C\u304F", "ot": ["food"] }, { "w": "ruin", "b": "ruin", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3060\u3081\u306B\u3059\u308B", "ot": ["thing", "event"] }, { "w": "shut", "b": "shut", "past": "shut", "pp": "shut", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u9589\u3081\u308B", "ot": ["door"] }, { "w": "spill", "b": "spill", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u3053\u307C\u3059", "ot": ["drink"] }, { "w": "succeed", "b": "succeed", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6210\u529F\u3059\u308B" }, { "w": "suggest", "b": "suggest", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u63D0\u6848\u3059\u308B", "ot": ["abstract", "offer", "event"] }, { "w": "survive", "b": "survive", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u751F\u304D\u6B8B\u308B" }, { "w": "sweat", "b": "sweat", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u6C57\u3092\u304B\u304F" }, { "w": "tidy", "b": "tidy", "past": "tidied", "pp": "tidied", "s3": "", "dbl": 0, "fr": "tr", "lv": 2, "ja": "\u7247\u4ED8\u3051\u308B", "ot": ["clean"] }, { "w": "train", "b": "train", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "lv": 2, "ja": "\u30C8\u30EC\u30FC\u30CB\u30F3\u30B0\u3059\u308B" }, { "w": "become", "b": "become", "past": "became", "pp": "become", "s3": "", "dbl": 0, "fr": "intr", "link": 1, "lv": 2, "ja": "\u306A\u308B" }, { "w": "look", "b": "look", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "link": 1, "lv": 2, "ja": "\u898B\u3048\u308B" }, { "w": "feel", "b": "feel", "past": "felt", "pp": "felt", "s3": "", "dbl": 0, "fr": "intr", "link": 1, "lv": 2, "ja": "\u611F\u3058\u308B" }, { "w": "seem", "b": "seem", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "link": 1, "lv": 2, "ja": "\u601D\u3048\u308B" }, { "w": "sound", "b": "sound", "past": "", "pp": "", "s3": "", "dbl": 0, "fr": "intr", "link": 1, "lv": 2, "ja": "\u805E\u3053\u3048\u308B" }], "adj": [{ "w": "happy", "lv": 1, "ja": "\u3046\u308C\u3057\u3044", "jt": "i", "cmp": "happier", "sup": "happiest" }, { "w": "sad", "lv": 1, "ja": "\u304B\u306A\u3057\u3044", "jt": "i", "cmp": "sadder", "sup": "saddest" }, { "w": "sleepy", "lv": 2, "ja": "\u306D\u3080\u3044", "jt": "i", "cmp": "sleepier", "sup": "sleepiest" }, { "w": "hungry", "lv": 1, "ja": "\u306F\u3089\u307A\u3053", "jt": "na", "cmp": "hungrier", "sup": "hungriest" }, { "w": "tired", "lv": 1, "ja": "\u3064\u304B\u308C\u308B", "jt": "v", "more": 1 }, { "w": "angry", "lv": 1, "ja": "\u6012\u308B", "jt": "v", "cmp": "angrier", "sup": "angriest" }, { "w": "excited", "lv": 1, "ja": "\u308F\u304F\u308F\u304F\u3059\u308B", "jt": "v", "more": 1 }, { "w": "busy", "lv": 1, "ja": "\u3044\u305D\u304C\u3057\u3044", "jt": "i", "cmp": "busier", "sup": "busiest" }, { "w": "fine", "lv": 1, "ja": "\u5143\u6C17", "jt": "na", "cmp": "better", "sup": "best" }, { "w": "okay", "lv": 1, "ja": "\u5927\u4E08\u592B", "jt": "na", "more": 1 }, { "w": "alright", "lv": 1, "ja": "\u5927\u4E08\u592B", "jt": "na", "more": 1 }, { "w": "sick", "lv": 1, "ja": "\u5177\u5408\u304C\u60AA\u3044", "jt": "i", "more": 1 }, { "w": "cold", "lv": 1, "ja": "\u5BD2\u3044", "jt": "i", "more": 1 }, { "w": "hot", "lv": 1, "ja": "\u6691\u3044", "jt": "i", "cmp": "hotter", "sup": "hottest" }, { "w": "quiet", "lv": 1, "ja": "\u9759\u304B", "jt": "na", "more": 1 }, { "w": "kind", "lv": 2, "ja": "\u3084\u3055\u3057\u3044", "jt": "i", "more": 1 }, { "w": "strong", "lv": 1, "ja": "\u5F37\u3044", "jt": "i", "more": 1 }, { "w": "tall", "lv": 1, "ja": "\u80CC\u304C\u9AD8\u3044", "jt": "i", "more": 1 }, { "w": "cute", "lv": 1, "ja": "\u304B\u308F\u3044\u3044", "jt": "i", "cmp": "cuter", "sup": "cutest" }, { "w": "cool", "lv": 1, "ja": "\u304B\u3063\u3053\u3044\u3044", "jt": "i", "more": 1 }, { "w": "late", "lv": 1, "ja": "\u9045\u523B", "jt": "na", "cmp": "later", "sup": "latest" }, { "w": "shy", "lv": 1, "ja": "\u306F\u305A\u304B\u3057\u3044", "jt": "i", "cmp": "shyer", "sup": "shyest" }, { "w": "brave", "lv": 2, "ja": "\u52C7\u6562", "jt": "na", "cmp": "braver", "sup": "bravest" }, { "w": "lonely", "lv": 1, "ja": "\u3055\u3073\u3057\u3044", "jt": "i", "cmp": "lonelier", "sup": "loneliest" }, { "w": "proud", "lv": 3, "ja": "\u8A87\u3089\u3057\u3044", "jt": "i", "cmp": "prouder", "sup": "proudest" }, { "w": "surprised", "lv": 2, "ja": "\u3073\u3063\u304F\u308A\u3059\u308B", "jt": "v", "more": 1 }, { "w": "scared", "lv": 3, "ja": "\u3053\u308F\u304C\u308B", "jt": "v", "more": 1 }, { "w": "bored", "lv": 2, "ja": "\u305F\u3044\u304F\u3064", "jt": "na", "more": 1 }, { "w": "full", "lv": 1, "ja": "\u304A\u306A\u304B\u3044\u3063\u3071\u3044", "jt": "na", "cmp": "fuller", "sup": "fullest" }, { "w": "thirsty", "lv": 2, "ja": "\u306E\u3069\u304C\u304B\u308F\u304F", "jt": "v", "cmp": "thirstier", "sup": "thirstiest" }, { "w": "free", "lv": 1, "ja": "\u3072\u307E", "jt": "na", "cmp": "freer", "sup": "freest" }, { "w": "smart", "lv": 1, "ja": "\u304B\u3057\u3053\u3044", "jt": "i", "cmp": "smarter", "sup": "smartest" }, { "w": "funny", "lv": 1, "ja": "\u304A\u3082\u3057\u308D\u3044", "jt": "i", "cmp": "funnier", "sup": "funniest" }, { "w": "rich", "lv": 1, "ja": "\u304A\u91D1\u6301\u3061", "jt": "na", "cmp": "richer", "sup": "richest" }, { "w": "famous", "lv": 1, "ja": "\u6709\u540D", "jt": "na", "more": 1 }, { "w": "beautiful", "lv": 1, "ja": "\u304D\u308C\u3044", "jt": "na", "more": 1 }, { "w": "young", "lv": 1, "ja": "\u82E5\u3044", "jt": "i", "cmp": "younger", "sup": "youngest" }, { "w": "popular", "lv": 2, "ja": "\u4EBA\u6C17", "jt": "na", "more": 1 }, { "w": "healthy", "lv": 1, "ja": "\u5065\u5EB7", "jt": "na", "cmp": "healthier", "sup": "healthiest" }, { "w": "awesome", "lv": 3, "ja": "\u6700\u9AD8", "jt": "na", "more": 1 }, { "w": "chill", "lv": 2, "ja": "\u843D\u3061\u7740\u3044\u3066\u3044\u308B", "jt": "raw", "cmp": "chiller", "sup": "chillest" }, { "w": "ready", "lv": 1, "ja": "\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u308B", "jt": "raw", "cmp": "readier", "sup": "readiest" }, { "w": "big", "lv": 1, "ja": "\u5927\u304D\u3044", "jt": "i", "cmp": "bigger", "sup": "biggest" }, { "w": "small", "lv": 1, "ja": "\u5C0F\u3055\u3044", "jt": "i", "cmp": "smaller", "sup": "smallest" }, { "w": "long", "lv": 1, "ja": "\u9577\u3044", "jt": "i", "cmp": "longer", "sup": "longest" }, { "w": "short", "lv": 1, "ja": "\u77ED\u3044", "jt": "i", "cmp": "shorter", "sup": "shortest" }, { "w": "new", "lv": 1, "ja": "\u65B0\u3057\u3044", "jt": "i", "cmp": "newer", "sup": "newest" }, { "w": "old", "lv": 1, "ja": "\u53E4\u3044", "jt": "i", "cmp": "older", "sup": "oldest" }, { "w": "good", "lv": 1, "ja": "\u3044\u3044", "jt": "i", "cmp": "better", "sup": "best" }, { "w": "bad", "lv": 1, "ja": "\u60AA\u3044", "jt": "i", "cmp": "worse", "sup": "worst" }, { "w": "easy", "lv": 1, "ja": "\u304B\u3093\u305F\u3093", "jt": "na", "cmp": "easier", "sup": "easiest" }, { "w": "difficult", "lv": 1, "ja": "\u3080\u305A\u304B\u3057\u3044", "jt": "i", "more": 1 }, { "w": "interesting", "lv": 1, "ja": "\u304A\u3082\u3057\u308D\u3044", "jt": "i", "more": 1 }, { "w": "boring", "lv": 1, "ja": "\u305F\u3044\u304F\u3064", "jt": "na", "more": 1 }, { "w": "important", "lv": 1, "ja": "\u5927\u5207", "jt": "na", "more": 1 }, { "w": "expensive", "lv": 1, "ja": "\u9AD8\u3044", "jt": "i", "more": 1 }, { "w": "cheap", "lv": 2, "ja": "\u5B89\u3044", "jt": "i", "cmp": "cheaper", "sup": "cheapest" }, { "w": "clean", "lv": 1, "ja": "\u304D\u308C\u3044", "jt": "na", "cmp": "cleaner", "sup": "cleanest" }, { "w": "dirty", "lv": 1, "ja": "\u304D\u305F\u306A\u3044", "jt": "i", "cmp": "dirtier", "sup": "dirtiest" }, { "w": "warm", "lv": 1, "ja": "\u3042\u305F\u305F\u304B\u3044", "jt": "i", "cmp": "warmer", "sup": "warmest" }, { "w": "fast", "lv": 1, "ja": "\u901F\u3044", "jt": "i", "cmp": "faster", "sup": "fastest" }, { "w": "slow", "lv": 1, "ja": "\u304A\u305D\u3044", "jt": "i", "cmp": "slower", "sup": "slowest" }, { "w": "heavy", "lv": 1, "ja": "\u91CD\u3044", "jt": "i", "cmp": "heavier", "sup": "heaviest" }, { "w": "light", "lv": 1, "ja": "\u8EFD\u3044", "jt": "i", "cmp": "lighter", "sup": "lightest" }, { "w": "dark", "lv": 1, "ja": "\u6697\u3044", "jt": "i", "cmp": "darker", "sup": "darkest" }, { "w": "bright", "lv": 1, "ja": "\u660E\u308B\u3044", "jt": "i", "cmp": "brighter", "sup": "brightest" }, { "w": "loud", "lv": 3, "ja": "\u3046\u308B\u3055\u3044", "jt": "i", "cmp": "louder", "sup": "loudest" }, { "w": "sweet", "lv": 1, "ja": "\u3042\u307E\u3044", "jt": "i", "cmp": "sweeter", "sup": "sweetest" }, { "w": "spicy", "lv": 3, "ja": "\u304B\u3089\u3044", "jt": "i", "cmp": "spicier", "sup": "spiciest" }, { "w": "delicious", "lv": 1, "ja": "\u304A\u3044\u3057\u3044", "jt": "i", "more": 1 }, { "w": "wonderful", "lv": 1, "ja": "\u3059\u3070\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "great", "lv": 1, "ja": "\u3059\u3054\u3044", "jt": "i", "cmp": "greater", "sup": "greatest" }, { "w": "nice", "lv": 1, "ja": "\u3059\u3066\u304D", "jt": "na", "cmp": "nicer", "sup": "nicest" }, { "w": "pretty", "lv": 1, "ja": "\u304B\u308F\u3044\u3044", "jt": "i", "cmp": "prettier", "sup": "prettiest" }, { "w": "careful", "lv": 1, "ja": "\u6CE8\u610F\u6DF1\u3044", "jt": "i", "more": 1 }, { "w": "safe", "lv": 2, "ja": "\u5B89\u5168", "jt": "na", "cmp": "safer", "sup": "safest" }, { "w": "dangerous", "lv": 2, "ja": "\u5371\u967A", "jt": "na", "more": 1 }, { "w": "sure", "lv": 1, "ja": "\u78BA\u304B", "jt": "na", "cmp": "surer", "sup": "surest" }, { "w": "wrong", "lv": 1, "ja": "\u307E\u3061\u304C\u3044", "jt": "na", "cmp": "wronger", "sup": "wrongest" }, { "w": "right", "lv": 1, "ja": "\u6B63\u3057\u3044", "jt": "i", "cmp": "righter", "sup": "rightest" }, { "w": "different", "lv": 1, "ja": "\u3061\u304C\u3046", "jt": "na", "more": 1 }, { "w": "same", "lv": 1, "ja": "\u540C\u3058", "jt": "na", "cmp": "samer", "sup": "samest" }, { "w": "special", "lv": 1, "ja": "\u7279\u5225", "jt": "na", "more": 1 }, { "w": "perfect", "lv": 2, "ja": "\u5B8C\u307A\u304D", "jt": "na", "more": 1 }, { "w": "lucky", "lv": 1, "ja": "\u904B\u304C\u3044\u3044", "jt": "i", "cmp": "luckier", "sup": "luckiest" }, { "w": "unlucky", "lv": 3, "ja": "\u904B\u304C\u60AA\u3044", "jt": "i", "cmp": "unluckier", "sup": "unluckiest" }, { "w": "glad", "lv": 1, "ja": "\u3046\u308C\u3057\u3044", "jt": "i", "cmp": "gladder", "sup": "gladdest" }, { "w": "sorry", "lv": 1, "ja": "\u7533\u3057\u8A33\u306A\u3044", "jt": "i", "cmp": "sorrier", "sup": "sorriest" }, { "w": "nervous", "lv": 2, "ja": "\u7DCA\u5F35\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "worried", "lv": 2, "ja": "\u5FC3\u914D\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "relaxed", "lv": 2, "ja": "\u30EA\u30E9\u30C3\u30AF\u30B9\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "confident", "lv": 2, "ja": "\u81EA\u4FE1\u305F\u3063\u3077\u308A", "jt": "na", "more": 1 }, { "w": "calm", "lv": 3, "ja": "\u843D\u3061\u7740\u3044\u3066\u3044\u308B", "jt": "raw", "cmp": "calmer", "sup": "calmest" }, { "w": "serious", "lv": 3, "ja": "\u307E\u3058\u3081", "jt": "na", "more": 1 }, { "w": "honest", "lv": 3, "ja": "\u6B63\u76F4", "jt": "na", "more": 1 }, { "w": "friendly", "lv": 4, "ja": "\u89AA\u3057\u307F\u3084\u3059\u3044", "jt": "i", "cmp": "friendlier", "sup": "friendliest" }, { "w": "polite", "lv": 2, "ja": "\u793C\u5100\u6B63\u3057\u3044", "jt": "i", "more": 1 }, { "w": "rude", "lv": 1, "ja": "\u5931\u793C", "jt": "na", "cmp": "ruder", "sup": "rudest" }, { "w": "lazy", "lv": 1, "ja": "\u306A\u307E\u3051\u3082\u306E", "jt": "na", "cmp": "lazier", "sup": "laziest" }, { "w": "active", "lv": 3, "ja": "\u6D3B\u767A", "jt": "na", "more": 1 }, { "w": "gentle", "lv": 2, "ja": "\u304A\u3060\u3084\u304B", "jt": "na", "cmp": "gentler", "sup": "gentlest" }, { "w": "wise", "lv": 2, "ja": "\u304B\u3057\u3053\u3044", "jt": "i", "cmp": "wiser", "sup": "wisest" }, { "w": "clever", "lv": 1, "ja": "\u308A\u3053\u3046", "jt": "na", "cmp": "cleverer", "sup": "cleverest" }, { "w": "silly", "lv": 2, "ja": "\u3070\u304B", "jt": "na", "cmp": "sillier", "sup": "silliest" }, { "w": "crazy", "lv": 2, "ja": "\u3080\u3061\u3083\u304F\u3061\u3083", "jt": "na", "cmp": "crazier", "sup": "craziest" }, { "w": "weak", "lv": 2, "ja": "\u5F31\u3044", "jt": "i", "cmp": "weaker", "sup": "weakest" }, { "w": "thin", "lv": 1, "ja": "\u7D30\u3044", "jt": "i", "cmp": "thinner", "sup": "thinnest" }, { "w": "wet", "lv": 2, "ja": "\u306C\u308C\u3066\u3044\u308B", "jt": "raw", "cmp": "wetter", "sup": "wettest" }, { "w": "dry", "lv": 1, "ja": "\u304B\u308F\u3044\u3066\u3044\u308B", "jt": "raw", "cmp": "drier", "sup": "driest" }, { "w": "empty", "lv": 2, "ja": "\u304B\u3089\u3063\u307D", "jt": "na", "cmp": "emptier", "sup": "emptiest" }, { "w": "open", "lv": 1, "ja": "\u958B\u3044\u3066\u3044\u308B", "jt": "raw", "cmp": "openner", "sup": "opennest" }, { "w": "closed", "lv": 1, "ja": "\u9589\u307E\u3063\u3066\u3044\u308B", "jt": "raw", "cmp": "closeder", "sup": "closedest" }, { "w": "alone", "lv": 2, "ja": "\u3072\u3068\u308A", "jt": "na", "cmp": "aloner", "sup": "alonest" }, { "w": "amazing", "lv": 3, "ja": "\u3059\u3070\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "terrible", "lv": 1, "ja": "\u3072\u3069\u3044", "jt": "i", "more": 1 }, { "w": "excellent", "lv": 1, "ja": "\u512A\u79C0", "jt": "na", "more": 1 }, { "w": "curious", "lv": 3, "ja": "\u597D\u5947\u5FC3\u3044\u3063\u3071\u3044", "jt": "na", "more": 1 }, { "w": "jealous", "lv": 3, "ja": "\u3046\u3089\u3084\u307E\u3057\u3044", "jt": "i", "more": 1 }, { "w": "embarrassed", "lv": 3, "ja": "\u306F\u305A\u304B\u3057\u3044", "jt": "i", "more": 1 }, { "w": "grateful", "lv": 2, "ja": "\u611F\u8B1D\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "shocked", "lv": 3, "ja": "\u30B7\u30E7\u30C3\u30AF\u3092\u53D7\u3051\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "satisfied", "lv": 3, "ja": "\u6E80\u8DB3\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "disappointed", "lv": 2, "ja": "\u304C\u3063\u304B\u308A\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "cheerful", "lv": 3, "ja": "\u660E\u308B\u3044", "jt": "i", "more": 1 }, { "w": "patient", "lv": 3, "ja": "\u304C\u307E\u3093\u5F37\u3044", "jt": "i", "more": 1 }, { "w": "generous", "lv": 3, "ja": "\u6C17\u524D\u304C\u3044\u3044", "jt": "i", "more": 1 }, { "w": "creative", "lv": 2, "ja": "\u5275\u9020\u7684", "jt": "na", "more": 1 }, { "w": "talented", "lv": 3, "ja": "\u624D\u80FD\u8C4A\u304B", "jt": "na", "more": 1 }, { "w": "modern", "lv": 2, "ja": "\u73FE\u4EE3\u7684", "jt": "na", "more": 1 }, { "w": "traditional", "lv": 2, "ja": "\u4F1D\u7D71\u7684", "jt": "na", "more": 1 }, { "w": "black", "lv": 1, "ja": "\u9ED2\u3044", "jt": "i", "cmp": "blacker", "sup": "blackest" }, { "w": "blue", "lv": 1, "ja": "\u9752\u3044", "jt": "i", "cmp": "bluer", "sup": "bluest" }, { "w": "brown", "lv": 1, "ja": "\u8336\u8272\u3044", "jt": "i", "cmp": "browner", "sup": "brownest" }, { "w": "gray", "lv": 1, "ja": "\u7070\u8272", "jt": "na", "cmp": "grayer", "sup": "grayest" }, { "w": "green", "lv": 1, "ja": "\u7DD1", "jt": "na", "cmp": "greener", "sup": "greenest" }, { "w": "orange", "lv": 1, "ja": "\u30AA\u30EC\u30F3\u30B8\u8272", "jt": "na", "cmp": "oranger", "sup": "orangest" }, { "w": "pink", "lv": 1, "ja": "\u30D4\u30F3\u30AF", "jt": "na", "cmp": "pinker", "sup": "pinkest" }, { "w": "red", "lv": 1, "ja": "\u8D64\u3044", "jt": "i", "cmp": "redder", "sup": "reddest" }, { "w": "white", "lv": 1, "ja": "\u767D\u3044", "jt": "i", "cmp": "whiter", "sup": "whitest" }, { "w": "yellow", "lv": 1, "ja": "\u9EC4\u8272\u3044", "jt": "i", "cmp": "yellower", "sup": "yellowest" }, { "w": "purple", "lv": 1, "ja": "\u3080\u3089\u3055\u304D", "jt": "na", "cmp": "purpler", "sup": "purplest" }, { "w": "afraid", "lv": 1, "ja": "\u3053\u308F\u304C\u3063\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "awake", "lv": 1, "ja": "\u8D77\u304D\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "broken", "lv": 1, "ja": "\u3053\u308F\u308C\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "cloudy", "lv": 1, "ja": "\u304F\u3082\u308A", "jt": "na", "cmp": "cloudier", "sup": "cloudiest" }, { "w": "correct", "lv": 1, "ja": "\u6B63\u3057\u3044", "jt": "i", "no": 1 }, { "w": "exciting", "lv": 1, "ja": "\u308F\u304F\u308F\u304F\u3059\u308B", "jt": "v", "more": 1 }, { "w": "fair", "lv": 1, "ja": "\u516C\u5E73", "jt": "na", "no": 1 }, { "w": "false", "lv": 1, "ja": "\u307E\u3061\u304C\u3044", "jt": "na", "no": 1 }, { "w": "foggy", "lv": 1, "ja": "\u9727\u304C\u6DF1\u3044", "jt": "i", "cmp": "foggier", "sup": "foggiest" }, { "w": "fun", "lv": 1, "ja": "\u697D\u3057\u3044", "jt": "i", "more": 1 }, { "w": "handsome", "lv": 1, "ja": "\u304B\u3063\u3053\u3044\u3044", "jt": "i", "cmp": "handsomer", "sup": "handsomest" }, { "w": "hard", "lv": 1, "ja": "\u5927\u5909", "jt": "na", "cmp": "harder", "sup": "hardest" }, { "w": "high", "lv": 1, "ja": "\u9AD8\u3044", "jt": "i", "cmp": "higher", "sup": "highest" }, { "w": "interested", "lv": 1, "ja": "\u8208\u5473\u304C\u3042\u308B", "jt": "raw", "more": 1 }, { "w": "large", "lv": 1, "ja": "\u5927\u304D\u3044", "jt": "i", "cmp": "larger", "sup": "largest" }, { "w": "little", "lv": 1, "ja": "\u5C0F\u3055\u3044", "jt": "i", "cmp": "littler", "sup": "littlest" }, { "w": "lovely", "lv": 1, "ja": "\u3059\u3066\u304D", "jt": "na", "more": 1 }, { "w": "poor", "lv": 1, "ja": "\u8CA7\u3057\u3044", "jt": "i", "cmp": "poorer", "sup": "poorest" }, { "w": "rainy", "lv": 1, "ja": "\u96E8", "jt": "na", "cmp": "rainier", "sup": "rainiest" }, { "w": "real", "lv": 1, "ja": "\u672C\u7269", "jt": "na", "no": 1 }, { "w": "snowy", "lv": 1, "ja": "\u96EA", "jt": "na", "cmp": "snowier", "sup": "snowiest" }, { "w": "strange", "lv": 1, "ja": "\u5909", "jt": "na", "cmp": "stranger", "sup": "strangest" }, { "w": "strict", "lv": 1, "ja": "\u304D\u3073\u3057\u3044", "jt": "i", "cmp": "stricter", "sup": "strictest" }, { "w": "successful", "lv": 1, "ja": "\u6210\u529F\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "sunny", "lv": 1, "ja": "\u6674\u308C", "jt": "na", "cmp": "sunnier", "sup": "sunniest" }, { "w": "super", "lv": 1, "ja": "\u6700\u9AD8", "jt": "na", "cmp": "superer", "sup": "superest" }, { "w": "thick", "lv": 1, "ja": "\u539A\u3044", "jt": "i", "cmp": "thicker", "sup": "thickest" }, { "w": "tight", "lv": 1, "ja": "\u304D\u3064\u3044", "jt": "i", "cmp": "tighter", "sup": "tightest" }, { "w": "true", "lv": 1, "ja": "\u672C\u5F53", "jt": "na", "no": 1 }, { "w": "ideal", "lv": 1, "ja": "\u7406\u60F3\u7684", "jt": "na", "no": 1 }, { "w": "windy", "lv": 1, "ja": "\u98A8\u304C\u5F37\u3044", "jt": "i", "cmp": "windier", "sup": "windiest" }, { "w": "alive", "lv": 2, "ja": "\u751F\u304D\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "ancient", "lv": 2, "ja": "\u53E4\u4EE3\u306E", "jt": "na", "no": 1 }, { "w": "annoying", "lv": 2, "ja": "\u3046\u3063\u3068\u3046\u3057\u3044", "jt": "i", "more": 1 }, { "w": "anxious", "lv": 2, "ja": "\u4E0D\u5B89", "jt": "na", "more": 1 }, { "w": "asleep", "lv": 2, "ja": "\u7720\u3063\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "attractive", "lv": 2, "ja": "\u9B45\u529B\u7684", "jt": "na", "more": 1 }, { "w": "awful", "lv": 2, "ja": "\u3072\u3069\u3044", "jt": "i", "more": 1 }, { "w": "brilliant", "lv": 2, "ja": "\u3059\u3070\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "certain", "lv": 2, "ja": "\u78BA\u304B", "jt": "na", "more": 1 }, { "w": "clear", "lv": 2, "ja": "\u306F\u3063\u304D\u308A\u3057\u3066\u3044\u308B", "jt": "raw", "cmp": "clearer", "sup": "clearest" }, { "w": "colorful", "lv": 2, "ja": "\u8272\u3068\u308A\u3069\u308A", "jt": "na", "more": 1 }, { "w": "comfortable", "lv": 2, "ja": "\u5FC3\u5730\u3088\u3044", "jt": "i", "more": 1 }, { "w": "common", "lv": 2, "ja": "\u3088\u304F\u3042\u308B", "jt": "raw", "more": 1 }, { "w": "confused", "lv": 2, "ja": "\u6DF7\u4E71\u3057\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "convenient", "lv": 2, "ja": "\u4FBF\u5229", "jt": "na", "more": 1 }, { "w": "crowded", "lv": 2, "ja": "\u6DF7\u3093\u3067\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "dizzy", "lv": 2, "ja": "\u3081\u307E\u3044\u304C\u3059\u308B", "jt": "v", "cmp": "dizzier", "sup": "dizziest" }, { "w": "early", "lv": 2, "ja": "\u65E9\u3044", "jt": "i", "cmp": "earlier", "sup": "earliest" }, { "w": "embarrassing", "lv": 2, "ja": "\u306F\u305A\u304B\u3057\u3044", "jt": "i", "more": 1 }, { "w": "energetic", "lv": 2, "ja": "\u5143\u6C17\u3044\u3063\u3071\u3044", "jt": "na", "more": 1 }, { "w": "enormous", "lv": 2, "ja": "\u5DE8\u5927", "jt": "na", "more": 1 }, { "w": "familiar", "lv": 2, "ja": "\u3088\u304F\u77E5\u3063\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "fancy", "lv": 2, "ja": "\u304A\u3057\u3083\u308C", "jt": "na", "cmp": "fancier", "sup": "fanciest" }, { "w": "fantastic", "lv": 2, "ja": "\u3059\u3070\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "fascinating", "lv": 2, "ja": "\u3068\u3066\u3082\u8208\u5473\u6DF1\u3044", "jt": "i", "more": 1 }, { "w": "fit", "lv": 2, "ja": "\u5143\u6C17", "jt": "na", "cmp": "fitter", "sup": "fittest" }, { "w": "fresh", "lv": 2, "ja": "\u65B0\u9BAE", "jt": "na", "cmp": "fresher", "sup": "freshest" }, { "w": "frightened", "lv": 2, "ja": "\u304A\u3073\u3048\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "frightening", "lv": 2, "ja": "\u304A\u305D\u308D\u3057\u3044", "jt": "i", "more": 1 }, { "w": "golden", "lv": 2, "ja": "\u91D1\u8272", "jt": "na", "no": 1 }, { "w": "good-looking", "lv": 2, "ja": "\u304B\u3063\u3053\u3044\u3044", "jt": "i", "more": 1 }, { "w": "greedy", "lv": 2, "ja": "\u6B32\u3070\u308A", "jt": "na", "cmp": "greedier", "sup": "greediest" }, { "w": "helpful", "lv": 2, "ja": "\u5F79\u306B\u7ACB\u3064", "jt": "v", "more": 1 }, { "w": "ill", "lv": 2, "ja": "\u75C5\u6C17", "jt": "na", "cmp": "iller", "sup": "illest" }, { "w": "illegal", "lv": 2, "ja": "\u9055\u6CD5", "jt": "na", "no": 1 }, { "w": "impatient", "lv": 2, "ja": "\u305B\u3063\u304B\u3061", "jt": "na", "more": 1 }, { "w": "impossible", "lv": 2, "ja": "\u4E0D\u53EF\u80FD", "jt": "na", "no": 1 }, { "w": "intelligent", "lv": 2, "ja": "\u982D\u304C\u3044\u3044", "jt": "i", "more": 1 }, { "w": "international", "lv": 2, "ja": "\u56FD\u969B\u7684", "jt": "na", "more": 1 }, { "w": "lively", "lv": 2, "ja": "\u306B\u304E\u3084\u304B", "jt": "na", "cmp": "livelier", "sup": "liveliest" }, { "w": "local", "lv": 2, "ja": "\u5730\u5143\u306E", "jt": "na", "more": 1 }, { "w": "lost", "lv": 2, "ja": "\u8FF7\u5B50", "jt": "na", "no": 1 }, { "w": "low", "lv": 2, "ja": "\u4F4E\u3044", "jt": "i", "cmp": "lower", "sup": "lowest" }, { "w": "mad", "lv": 2, "ja": "\u6012\u3063\u3066\u3044\u308B", "jt": "raw", "cmp": "madder", "sup": "maddest" }, { "w": "married", "lv": 2, "ja": "\u7D50\u5A5A\u3057\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "marvelous", "lv": 2, "ja": "\u3059\u3070\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "mean", "lv": 2, "ja": "\u610F\u5730\u60AA", "jt": "na", "cmp": "meaner", "sup": "meanest" }, { "w": "missing", "lv": 2, "ja": "\u884C\u65B9\u4E0D\u660E", "jt": "na", "no": 1 }, { "w": "mysterious", "lv": 2, "ja": "\u306A\u305E\u3081\u3044\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "natural", "lv": 2, "ja": "\u81EA\u7136", "jt": "na", "more": 1 }, { "w": "necessary", "lv": 2, "ja": "\u5FC5\u8981", "jt": "na", "no": 1 }, { "w": "noisy", "lv": 2, "ja": "\u3046\u308B\u3055\u3044", "jt": "i", "cmp": "noisier", "sup": "noisiest" }, { "w": "normal", "lv": 2, "ja": "\u3075\u3064\u3046", "jt": "na", "more": 1 }, { "w": "organized", "lv": 2, "ja": "\u6574\u7406\u3055\u308C\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "original", "lv": 2, "ja": "\u72EC\u5275\u7684", "jt": "na", "more": 1 }, { "w": "peaceful", "lv": 2, "ja": "\u5E73\u548C", "jt": "na", "more": 1 }, { "w": "pleasant", "lv": 2, "ja": "\u6C17\u6301\u3061\u3044\u3044", "jt": "i", "more": 1 }, { "w": "pleased", "lv": 2, "ja": "\u559C\u3093\u3067\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "possible", "lv": 2, "ja": "\u53EF\u80FD", "jt": "na", "no": 1 }, { "w": "powerful", "lv": 2, "ja": "\u5F37\u529B", "jt": "na", "more": 1 }, { "w": "private", "lv": 2, "ja": "\u500B\u4EBA\u7684", "jt": "na", "more": 1 }, { "w": "professional", "lv": 2, "ja": "\u30D7\u30ED", "jt": "na", "more": 1 }, { "w": "quick", "lv": 2, "ja": "\u901F\u3044", "jt": "i", "cmp": "quicker", "sup": "quickest" }, { "w": "raw", "lv": 2, "ja": "\u751F", "jt": "na", "no": 1 }, { "w": "regular", "lv": 2, "ja": "\u3044\u3064\u3082\u306E", "jt": "na", "more": 1 }, { "w": "romantic", "lv": 2, "ja": "\u30ED\u30DE\u30F3\u30C1\u30C3\u30AF", "jt": "na", "more": 1 }, { "w": "similar", "lv": 2, "ja": "\u4F3C\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "simple", "lv": 2, "ja": "\u304B\u3093\u305F\u3093", "jt": "na", "cmp": "simpler", "sup": "simplest" }, { "w": "single", "lv": 2, "ja": "\u72EC\u8EAB", "jt": "na", "no": 1 }, { "w": "slim", "lv": 2, "ja": "\u307B\u3063\u305D\u308A\u3057\u3066\u3044\u308B", "jt": "raw", "cmp": "slimmer", "sup": "slimmest" }, { "w": "smooth", "lv": 2, "ja": "\u306A\u3081\u3089\u304B", "jt": "na", "cmp": "smoother", "sup": "smoothest" }, { "w": "soft", "lv": 2, "ja": "\u3084\u308F\u3089\u304B\u3044", "jt": "i", "cmp": "softer", "sup": "softest" }, { "w": "straight", "lv": 2, "ja": "\u307E\u3063\u3059\u3050", "jt": "na", "cmp": "straighter", "sup": "straightest" }, { "w": "suitable", "lv": 2, "ja": "\u3074\u3063\u305F\u308A", "jt": "na", "more": 1 }, { "w": "surprising", "lv": 2, "ja": "\u304A\u3069\u308D\u304F\u3079\u304D", "jt": "na", "more": 1 }, { "w": "tidy", "lv": 2, "ja": "\u304D\u3061\u3093\u3068\u3057\u3066\u3044\u308B", "jt": "raw", "cmp": "tidier", "sup": "tidiest" }, { "w": "uncomfortable", "lv": 2, "ja": "\u5C45\u5FC3\u5730\u304C\u60AA\u3044", "jt": "i", "more": 1 }, { "w": "unfair", "lv": 2, "ja": "\u4E0D\u516C\u5E73", "jt": "na", "more": 1 }, { "w": "unforgettable", "lv": 2, "ja": "\u5FD8\u308C\u3089\u308C\u306A\u3044", "jt": "i", "more": 1 }, { "w": "unhappy", "lv": 2, "ja": "\u4E0D\u5E78\u305B", "jt": "na", "cmp": "unhappier", "sup": "unhappiest" }, { "w": "unhealthy", "lv": 2, "ja": "\u4E0D\u5065\u5EB7", "jt": "na", "cmp": "unhealthier", "sup": "unhealthiest" }, { "w": "unknown", "lv": 2, "ja": "\u77E5\u3089\u308C\u3066\u3044\u306A\u3044", "jt": "i", "no": 1 }, { "w": "unnecessary", "lv": 2, "ja": "\u4E0D\u5FC5\u8981", "jt": "na", "more": 1 }, { "w": "unpleasant", "lv": 2, "ja": "\u3044\u3084\u306A", "jt": "na", "more": 1 }, { "w": "unusual", "lv": 2, "ja": "\u3081\u305A\u3089\u3057\u3044", "jt": "i", "more": 1 }, { "w": "upset", "lv": 2, "ja": "\u52D5\u63FA\u3057\u3066\u3044\u308B", "jt": "raw", "cmp": "upseter", "sup": "upsetest" }, { "w": "useful", "lv": 2, "ja": "\u5F79\u306B\u7ACB\u3064", "jt": "v", "more": 1 }, { "w": "usual", "lv": 2, "ja": "\u3044\u3064\u3082\u3069\u304A\u308A", "jt": "na", "more": 1 }, { "w": "well-known", "lv": 2, "ja": "\u3088\u304F\u77E5\u3089\u308C\u3066\u3044\u308B", "jt": "raw", "more": 1 }, { "w": "wide", "lv": 2, "ja": "\u5E83\u3044", "jt": "i", "cmp": "wider", "sup": "widest" }, { "w": "wild", "lv": 2, "ja": "\u91CE\u751F", "jt": "na", "cmp": "wilder", "sup": "wildest" }, { "w": "wooden", "lv": 2, "ja": "\u6728\u3067\u3067\u304D\u3066\u3044\u308B", "jt": "raw", "no": 1 }, { "w": "human", "lv": 2, "ja": "\u4EBA\u9593\u3089\u3057\u3044", "jt": "i", "cmp": "humaner", "sup": "humanest" }, { "w": "electric", "lv": 2, "ja": "\u96FB\u6C17\u306E", "jt": "na", "no": 1 }, { "w": "magic", "lv": 2, "ja": "\u9B54\u6CD5\u306E", "jt": "na", "no": 1 }, { "w": "silver", "lv": 2, "ja": "\u9280\u8272", "jt": "na", "no": 1 }, { "w": "whole", "lv": 2, "ja": "\u307E\u308B\u3054\u3068", "jt": "na", "no": 1 }], "adv": [{ "w": "here", "k": "place", "lv": 1, "ja": "\u3053\u3053\u3067" }, { "w": "there", "k": "place", "lv": 1, "ja": "\u3042\u305D\u3053\u3067" }, { "w": "outside", "k": "place", "lv": 4, "ja": "\u5916\u3067" }, { "w": "inside", "k": "place", "lv": 4, "ja": "\u4E2D\u3067" }, { "w": "upstairs", "k": "place", "lv": 3, "ja": "\u4E8C\u968E\u3067" }, { "w": "downstairs", "k": "place", "lv": 2, "ja": "\u4E00\u968E\u3067" }, { "w": "everywhere", "k": "place", "lv": 1, "ja": "\u3069\u3053\u3067\u3082" }, { "w": "abroad", "k": "place", "lv": 2, "ja": "\u6D77\u5916\u3067" }, { "w": "downtown", "k": "place", "lv": 2, "ja": "\u8857\u306E\u4E2D\u5FC3\u3067" }, { "w": "somewhere", "k": "place", "lv": 2, "ja": "\u3069\u3053\u304B\u3067" }, { "w": "now", "k": "time", "ts": ["prog", "pres"], "lv": 1, "ja": "\u4ECA" }, { "w": "today", "k": "time", "ts": ["pres", "prog", "past", "fut"], "lv": 1, "ja": "\u4ECA\u65E5" }, { "w": "yesterday", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u6628\u65E5" }, { "w": "tonight", "k": "time", "ts": ["fut", "prog"], "lv": 2, "ja": "\u4ECA\u591C" }, { "w": "tomorrow", "k": "time", "ts": ["fut", "prog"], "lv": 1, "ja": "\u660E\u65E5" }, { "w": "soon", "k": "time", "ts": ["fut", "pres"], "lv": 1, "ja": "\u3082\u3046\u3059\u3050" }, { "w": "someday", "k": "time", "ts": ["fut"], "lv": 2, "ja": "\u3044\u3064\u304B" }, { "w": "later", "k": "time", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u3042\u3068\u3067" }, { "w": "nowadays", "k": "time", "ts": ["pres", "prog"], "lv": 2, "ja": "\u6700\u8FD1\u306F" }, { "w": "recently", "k": "time", "ts": ["past"], "lv": 2, "ja": "\u6700\u8FD1" }, { "w": "fast", "k": "manner", "lv": 1, "ja": "\u901F\u304F" }, { "w": "slowly", "k": "manner", "lv": 2, "ja": "\u3086\u3063\u304F\u308A" }, { "w": "quietly", "k": "manner", "lv": 2, "ja": "\u9759\u304B\u306B" }, { "w": "loudly", "k": "manner", "lv": 2, "ja": "\u5927\u304D\u306A\u58F0\u3067" }, { "w": "happily", "k": "manner", "lv": 2, "ja": "\u697D\u3057\u305D\u3046\u306B" }, { "w": "carefully", "k": "manner", "lv": 1, "ja": "\u3066\u3044\u306D\u3044\u306B" }, { "w": "well", "k": "manner", "lv": 1, "ja": "\u3058\u3087\u3046\u305A\u306B" }, { "w": "hard", "k": "manner", "lv": 1, "ja": "\u3044\u3063\u3057\u3087\u3046\u3051\u3093\u3081\u3044" }, { "w": "again", "k": "manner", "lv": 1, "ja": "\u3082\u3046\u4E00\u5EA6" }, { "w": "late", "k": "manner", "lv": 1, "ja": "\u304A\u305D\u304F" }, { "w": "early", "k": "manner", "lv": 1, "ja": "\u65E9\u304F" }, { "w": "nearby", "k": "manner", "lv": 1, "ja": "\u8FD1\u304F\u3067" }, { "w": "together", "k": "manner", "lv": 1, "ja": "\u3044\u3063\u3057\u3087\u306B" }, { "w": "quickly", "k": "manner", "lv": 1, "ja": "\u3059\u3070\u3084\u304F" }, { "w": "easily", "k": "manner", "lv": 2, "ja": "\u304B\u3093\u305F\u3093\u306B" }, { "w": "softly", "k": "manner", "lv": 2, "ja": "\u3084\u3055\u3057\u304F" }, { "w": "politely", "k": "manner", "lv": 3, "ja": "\u3066\u3044\u306D\u3044\u306B" }, { "w": "kindly", "k": "manner", "lv": 3, "ja": "\u89AA\u5207\u306B" }, { "w": "badly", "k": "manner", "lv": 2, "ja": "\u4E0B\u624B\u306B" }, { "w": "perfectly", "k": "manner", "lv": 2, "ja": "\u5B8C\u307A\u304D\u306B" }, { "w": "safely", "k": "manner", "lv": 3, "ja": "\u5B89\u5168\u306B" }, { "w": "suddenly", "k": "manner", "lv": 3, "ja": "\u7A81\u7136" }, { "w": "finally", "k": "manner", "lv": 2, "ja": "\u3064\u3044\u306B" }, { "w": "alone", "k": "manner", "lv": 1, "ja": "\u3072\u3068\u308A\u3067" }, { "w": "secretly", "k": "manner", "lv": 3, "ja": "\u3072\u305D\u304B\u306B" }, { "w": "proudly", "k": "manner", "lv": 4, "ja": "\u5F97\u610F\u3052\u306B" }, { "w": "angrily", "k": "manner", "lv": 2, "ja": "\u6012\u3063\u3066" }, { "w": "sadly", "k": "manner", "lv": 2, "ja": "\u60B2\u3057\u305D\u3046\u306B" }, { "w": "silently", "k": "manner", "lv": 2, "ja": "\u3060\u307E\u3063\u3066" }, { "w": "patiently", "k": "manner", "lv": 4, "ja": "\u304C\u307E\u3093\u5F37\u304F" }, { "w": "bravely", "k": "manner", "lv": 3, "ja": "\u52C7\u6562\u306B" }, { "w": "gently", "k": "manner", "lv": 4, "ja": "\u305D\u3063\u3068" }, { "w": "clearly", "k": "manner", "lv": 2, "ja": "\u306F\u3063\u304D\u308A\u3068" }, { "w": "correctly", "k": "manner", "lv": 2, "ja": "\u6B63\u3057\u304F" }, { "w": "deeply", "k": "manner", "lv": 2, "ja": "\u6DF1\u304F" }, { "w": "differently", "k": "manner", "lv": 2, "ja": "\u3061\u304C\u3046\u3075\u3046\u306B" }, { "w": "gradually", "k": "manner", "lv": 2, "ja": "\u3060\u3093\u3060\u3093" }, { "w": "seriously", "k": "manner", "lv": 2, "ja": "\u771F\u5263\u306B" }, { "w": "strongly", "k": "manner", "lv": 2, "ja": "\u5F37\u304F" }, { "w": "successfully", "k": "manner", "lv": 2, "ja": "\u3046\u307E\u304F" }, { "w": "fully", "k": "manner", "lv": 2, "ja": "\u5341\u5206\u306B" }, { "w": "exactly", "k": "manner", "lv": 2, "ja": "\u6B63\u78BA\u306B" }, { "w": "heavily", "k": "manner", "lv": 2, "ja": "\u6FC0\u3057\u304F" }, { "w": "simply", "k": "manner", "lv": 2, "ja": "\u304B\u3093\u305F\u3093\u306B" }, { "w": "widely", "k": "manner", "lv": 2, "ja": "\u5E83\u304F" }, { "w": "far", "k": "manner", "lv": 2, "ja": "\u9060\u304F\u307E\u3067" }, { "w": "online", "k": "manner", "lv": 2, "ja": "\u30AA\u30F3\u30E9\u30A4\u30F3\u3067" }, { "w": "home", "k": "place", "lv": 1, "ja": "\u5BB6\u3078" }, { "w": "always", "k": "freq", "lv": 1, "ja": "\u3044\u3064\u3082" }, { "w": "usually", "k": "freq", "lv": 1, "ja": "\u3075\u3060\u3093" }, { "w": "often", "k": "freq", "lv": 1, "ja": "\u3088\u304F" }, { "w": "sometimes", "k": "freq", "lv": 1, "ja": "\u3068\u304D\u3069\u304D" }, { "w": "never", "k": "freq", "lv": 1, "ja": "\u4E00\u5EA6\u3082" }], "idiom": [{ "w": "at home", "k": "place", "lv": 2, "ja": "\u5BB6\u3067" }, { "w": "at school", "k": "place", "lv": 2, "ja": "\u5B66\u6821\u3067" }, { "w": "in bed", "k": "place", "lv": 2, "ja": "\u30D9\u30C3\u30C9\u3067" }, { "w": "at my grandma's house", "k": "place", "lv": 2, "ja": "\u304A\u3070\u3042\u3061\u3083\u3093\u306E\u5BB6\u3067" }, { "w": "at a friend's house", "k": "place", "lv": 2, "ja": "\u53CB\u3060\u3061\u306E\u5BB6\u3067" }, { "w": "in space", "k": "place", "lv": 2, "ja": "\u5B87\u5B99\u3067" }, { "w": "at church", "k": "place", "lv": 2, "ja": "\u6559\u4F1A\u3067" }, { "w": "in town", "k": "place", "lv": 2, "ja": "\u753A\u3067" }, { "w": "at college", "k": "place", "lv": 2, "ja": "\u5927\u5B66\u3067" }, { "w": "on campus", "k": "place", "lv": 2, "ja": "\u30AD\u30E3\u30F3\u30D1\u30B9\u3067" }, { "w": "over there", "k": "place", "lv": 2, "ja": "\u5411\u3053\u3046\u3067" }, { "w": "next door", "k": "place", "lv": 2, "ja": "\u3068\u306A\u308A\u3067" }, { "w": "all over the world", "k": "place", "lv": 2, "ja": "\u4E16\u754C\u3058\u3085\u3046\u3067" }, { "w": "out there", "k": "place", "lv": 2, "ja": "\u4E16\u306E\u4E2D\u3067" }, { "w": "this morning", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u4ECA\u671D" }, { "w": "next time", "k": "time", "ts": ["fut", "pres", "prog"], "lv": 1, "ja": "\u6B21\u306F" }, { "w": "last time", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u524D\u56DE\u306F" }, { "w": "last night", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u6628\u591C" }, { "w": "last week", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u5148\u9031" }, { "w": "two days ago", "k": "time", "ts": ["past"], "lv": 1, "ja": "2\u65E5\u524D" }, { "w": "just now", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u3055\u3063\u304D" }, { "w": "next week", "k": "time", "ts": ["fut", "prog"], "lv": 1, "ja": "\u6765\u9031" }, { "w": "every day", "k": "time", "ts": ["pres", "past"], "lv": 1, "ja": "\u6BCE\u65E5" }, { "w": "every morning", "k": "time", "ts": ["pres", "past"], "lv": 1, "ja": "\u6BCE\u671D" }, { "w": "at seven", "k": "time", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "7\u6642\u306B" }, { "w": "for two hours", "k": "time", "ts": ["past", "fut"], "lv": 1, "ja": "2\u6642\u9593" }, { "w": "all day", "k": "time", "ts": ["past", "fut"], "lv": 1, "ja": "\u4E00\u65E5\u3058\u3085\u3046" }, { "w": "this afternoon", "k": "time", "ts": ["past", "pres", "fut", "prog"], "lv": 1, "ja": "\u4ECA\u65E5\u306E\u5348\u5F8C" }, { "w": "this evening", "k": "time", "ts": ["past", "fut", "prog"], "lv": 1, "ja": "\u4ECA\u6669" }, { "w": "this weekend", "k": "time", "ts": ["past", "fut", "prog"], "lv": 1, "ja": "\u4ECA\u9031\u672B" }, { "w": "next month", "k": "time", "ts": ["fut", "prog"], "lv": 1, "ja": "\u6765\u6708" }, { "w": "next year", "k": "time", "ts": ["fut", "prog"], "lv": 1, "ja": "\u6765\u5E74" }, { "w": "last month", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u5148\u6708" }, { "w": "last year", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u53BB\u5E74" }, { "w": "three days ago", "k": "time", "ts": ["past"], "lv": 1, "ja": "3\u65E5\u524D" }, { "w": "a long time ago", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u305A\u3063\u3068\u524D" }, { "w": "after lunch", "k": "time", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u663C\u3054\u306F\u3093\u306E\u3042\u3068" }, { "w": "before dinner", "k": "time", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u5915\u3054\u306F\u3093\u306E\u524D" }, { "w": "every week", "k": "time", "ts": ["pres", "past"], "lv": 1, "ja": "\u6BCE\u9031" }, { "w": "every night", "k": "time", "ts": ["pres", "past"], "lv": 1, "ja": "\u6BCE\u6669" }, { "w": "every Sunday", "k": "time", "ts": ["pres", "past"], "lv": 1, "ja": "\u6BCE\u9031\u65E5\u66DC\u65E5" }, { "w": "on weekends", "k": "time", "ts": ["pres", "past", "fut"], "lv": 4, "ja": "\u9031\u672B\u306B" }, { "w": "right away", "k": "time", "ts": ["fut", "past"], "lv": 1, "ja": "\u3059\u3050\u306B" }, { "w": "for a long time", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u9577\u3044\u9593" }, { "w": "for a week", "k": "time", "ts": ["past", "fut"], "lv": 1, "ja": "1\u9031\u9593" }, { "w": "at midday", "k": "time", "ts": ["pres", "past", "fut"], "lv": 2, "ja": "\u6B63\u5348\u306B" }, { "w": "on weekdays", "k": "time", "ts": ["pres", "past"], "lv": 2, "ja": "\u5E73\u65E5\u306B" }, { "w": "right now", "k": "time", "ts": ["prog", "fut", "pres"], "lv": 1, "ja": "\u4ECA\u3059\u3050" }, { "w": "at the moment", "k": "time", "ts": ["prog", "pres"], "lv": 1, "ja": "\u4ECA\u306E\u3068\u3053\u308D" }, { "w": "all the time", "k": "time", "ts": ["pres", "past", "prog"], "lv": 1, "ja": "\u3044\u3064\u3082" }, { "w": "the other day", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u5148\u65E5" }, { "w": "long ago", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u305A\u3063\u3068\u6614" }, { "w": "by now", "k": "time", "ts": ["pres"], "lv": 1, "ja": "\u4ECA\u3054\u308D\u306F" }, { "w": "at the time", "k": "time", "ts": ["past"], "lv": 1, "ja": "\u305D\u306E\u6642" }, { "w": "at the same time", "k": "time", "ts": ["pres", "past", "fut", "prog"], "lv": 1, "ja": "\u540C\u6642\u306B" }, { "w": "these days", "k": "time", "ts": ["pres", "prog"], "lv": 1, "ja": "\u6700\u8FD1" }, { "w": "in the meantime", "k": "time", "ts": ["pres", "past", "fut"], "lv": 1, "ja": "\u305D\u306E\u3042\u3044\u3060\u306B" }, { "w": "in time", "k": "other", "lv": 2, "ja": "\u9593\u306B\u5408\u3046\u3088\u3046\u306B" }, { "w": "on time", "k": "other", "lv": 2, "ja": "\u6642\u9593\u3069\u304A\u308A\u306B" }, { "w": "a lot", "k": "other", "lv": 2, "ja": "\u305F\u304F\u3055\u3093" }, { "w": "close by", "k": "other", "lv": 2, "ja": "\u8FD1\u304F\u3067" }, { "w": "in the dark", "k": "other", "lv": 2, "ja": "\u304F\u3089\u3084\u307F\u3067" }, { "w": "as usual", "k": "other", "lv": 2, "ja": "\u3044\u3064\u3082\u306E\u3088\u3046\u306B" }, { "w": "at once", "k": "other", "lv": 2, "ja": "\u3059\u3050\u306B" }, { "w": "Well", "k": "front", "lv": 1, "ja": "\u3048\u3048\u3068" }, { "w": "Oh", "k": "front", "lv": 1, "ja": "\u3042\u3063" }, { "w": "Okay", "k": "front", "lv": 1, "ja": "\u30AA\u30FC\u30B1\u30FC" }, { "w": "So", "k": "front", "lv": 1, "ja": "\u305D\u308C\u3067" }, { "w": "Anyway", "k": "front", "lv": 1, "ja": "\u3068\u306B\u304B\u304F" }, { "w": "Honestly", "k": "front", "lv": 1, "ja": "\u6B63\u76F4" }, { "w": "Basically", "k": "front", "lv": 1, "ja": "\u8981\u3059\u308B\u306B" }, { "w": "Whoa", "k": "front", "lv": 1, "ja": "\u304A\u304A\u3063" }, { "w": "Wow", "k": "front", "lv": 1, "ja": "\u308F\u3042" }, { "w": "Really", "k": "front", "lv": 1, "ja": "\u672C\u5F53\u306B" }, { "w": "Sure", "k": "front", "lv": 1, "ja": "\u3082\u3061\u308D\u3093" }, { "w": "Hmm", "k": "front", "lv": 1, "ja": "\u3046\u30FC\u3093" }, { "w": "Of course", "k": "front", "lv": 1, "ja": "\u3082\u3061\u308D\u3093" }, { "w": "By the way", "k": "front", "lv": 1, "ja": "\u3068\u3053\u308D\u3067" }, { "w": "You know", "k": "front", "lv": 1, "ja": "\u307B\u3089" }, { "w": "I mean", "k": "front", "lv": 1, "ja": "\u3064\u307E\u308A" }, { "w": "Actually", "k": "front", "lv": 1, "ja": "\u5B9F\u306F" }, { "w": "In my opinion", "k": "front", "lv": 1, "ja": "\u308F\u305F\u3057\u306E\u8003\u3048\u3067\u306F" }, { "w": "To tell the truth", "k": "front", "lv": 1, "ja": "\u5B9F\u3092\u8A00\u3046\u3068" }, { "w": "Luckily", "k": "front", "lv": 1, "ja": "\u904B\u3088\u304F" }, { "w": "Sadly", "k": "front", "lv": 1, "ja": "\u6B8B\u5FF5\u306A\u304C\u3089" }, { "w": "Maybe", "k": "front", "lv": 1, "ja": "\u305F\u3076\u3093" }, { "w": "Surprisingly", "k": "front", "lv": 1, "ja": "\u304A\u3069\u308D\u3044\u305F\u3053\u3068\u306B" }, { "w": "Hopefully", "k": "front", "lv": 1, "ja": "\u3046\u307E\u304F\u3044\u3051\u3070" }, { "w": "Seriously", "k": "front", "lv": 2, "ja": "\u30DE\u30B8\u3067" }, { "w": "Guess what?", "k": "front", "lv": 2, "ja": "\u306D\u3048\u805E\u3044\u3066" }, { "w": "Believe it or not", "k": "front", "lv": 2, "ja": "\u4FE1\u3058\u3089\u308C\u306A\u3044\u304B\u3082\u3060\u3051\u3069" }, { "w": "To be honest", "k": "front", "lv": 2, "ja": "\u6B63\u76F4\u306B\u8A00\u3046\u3068" }, { "w": "However", "k": "front", "lv": 1, "ja": "\u3057\u304B\u3057" }, { "w": "First of all", "k": "front", "lv": 3, "ja": "\u307E\u305A\u7B2C\u4E00\u306B" }, { "w": "In fact", "k": "front", "lv": 3, "ja": "\u5B9F\u969B" }, { "w": "In other words", "k": "front", "lv": 3, "ja": "\u8A00\u3044\u304B\u3048\u308B\u3068" }, { "w": "As usual", "k": "front", "lv": 3, "ja": "\u3044\u3064\u3082\u306E\u3088\u3046\u306B" }, { "w": "As far as I know", "k": "front", "lv": 3, "ja": "\u308F\u305F\u3057\u306E\u77E5\u308B\u304B\u304E\u308A\u3067\u306F" }, { "w": "As far as I can tell", "k": "front", "lv": 3, "ja": "\u308F\u305F\u3057\u306E\u898B\u308B\u304B\u304E\u308A\u3067\u306F" }, { "w": "As far as I can see", "k": "front", "lv": 3, "ja": "\u308F\u305F\u3057\u306E\u898B\u308B\u304B\u304E\u308A\u3067\u306F" }, { "w": "To the best of my knowledge", "k": "front", "lv": 3, "ja": "\u308F\u305F\u3057\u306E\u77E5\u308B\u304B\u304E\u308A\u3067\u306F" }, { "w": "At least", "k": "front", "lv": 3, "ja": "\u5C11\u306A\u304F\u3068\u3082" }, { "w": "No wonder", "k": "front", "lv": 3, "ja": "\u3069\u3046\u308A\u3067" }, { "w": "But then again", "k": "front", "lv": 3, "ja": "\u3067\u3082\u307E\u305F\u4E00\u65B9\u3067" }, { "w": "You see", "k": "front", "lv": 3, "ja": "\u307B\u3089\u306D" }, { "w": "Oh well", "k": "front", "lv": 3, "ja": "\u307E\u3042\u3044\u3044\u304B" }, { "w": "Most likely", "k": "front", "lv": 3, "ja": "\u305F\u3076\u3093" }, { "w": "After all", "k": "front", "lv": 3, "ja": "\u7D50\u5C40\u306E\u3068\u3053\u308D" }, { "w": "As a result", "k": "front", "lv": 3, "ja": "\u305D\u306E\u7D50\u679C" }, { "w": "For instance", "k": "front", "lv": 3, "ja": "\u305F\u3068\u3048\u3070" }, { "w": "On the other hand", "k": "front", "lv": 3, "ja": "\u4E00\u65B9\u3067" }, { "w": "No doubt", "k": "front", "lv": 3, "ja": "\u307E\u3061\u304C\u3044\u306A\u304F" }, { "w": "a lot of", "k": "quant", "lv": 1, "ja": "\u305F\u304F\u3055\u3093\u306E", "q": "p" }, { "w": "lots of", "k": "quant", "lv": 2, "ja": "\u305F\u304F\u3055\u3093\u306E", "q": "p" }, { "w": "a few", "k": "quant", "lv": 2, "ja": "\u3044\u304F\u3064\u304B\u306E", "q": "p" }, { "w": "a cup of", "k": "quant", "lv": 2, "ja": "1\u676F\u306E", "q": "u" }, { "w": "a glass of", "k": "quant", "lv": 2, "ja": "\u30B0\u30E9\u30B91\u676F\u306E", "q": "u" }, { "w": "a piece of", "k": "quant", "lv": 3, "ja": "1\u5207\u308C\u306E", "q": "u" }, { "w": "a bottle of", "k": "quant", "lv": 3, "ja": "1\u672C\u306E", "q": "u" }] };

  // games/punichunk/src/dict.js
  var Dict = (function() {
    "use strict";
    function makeDefault(data) {
      data = data || DICT_DATA;
      var idx = {};
      Object.keys(data).forEach(function(pos) {
        idx[pos] = data[pos].filter(function(e) {
          return e && e.w;
        });
      });
      function match(e, o) {
        if (o.maxLevel && (e.lv || 1) > o.maxLevel) return false;
        if (o.minLevel && (e.lv || 1) < o.minLevel) return false;
        if (o.tag) {
          var t = o.tag;
          if (t.cat && e.cat !== t.cat) return false;
          if (t.notCat && t.notCat.indexOf(e.cat) >= 0) return false;
          if (t.k && (Array.isArray(t.k) ? t.k.indexOf(e.k) < 0 : e.k !== t.k)) return false;
          if (t.c && t.c.indexOf(e.c) < 0) return false;
          if (t.fr && t.fr.indexOf(e.fr) < 0) return false;
          if (t.simple && e.tail) return false;
          if (t.cv && !e.cv) return false;
          if (t.link && !e.link) return false;
        }
        if (o.exclude && o.exclude.has(e.w)) return false;
        return true;
      }
      return {
        getWords: function(o) {
          o = o || {};
          var list = (idx[o.pos] || []).filter(function(e2) {
            return match(e2, o);
          });
          var r = o.rnd || Math.random, n = o.count || 1, out = [];
          if (!list.length) return out;
          for (var tries = 0; out.length < n && tries < n * 30; tries++) {
            var a = list[Math.floor(r() * list.length)], b = list[Math.floor(r() * list.length)];
            var e = (a.lv || 1) <= (b.lv || 1) ? a : b;
            if (out.indexOf(e) < 0) out.push(e);
          }
          return out;
        },
        all: function(pos) {
          return (idx[pos] || []).slice();
        }
      };
    }
    function validate(ad) {
      if (!ad || typeof ad.getWords !== "function" || typeof ad.all !== "function") throw new Error("PuniChunk: \u8F9E\u66F8\u30A2\u30C0\u30D7\u30BF\u306B\u306F getWords \u3068 all \u304C\u5FC5\u8981\u3067\u3059");
      return ad;
    }
    var IRR_PL = { child: "children", man: "men", woman: "women", mouse: "mice", sheep: "sheep", fish: "fish", person: "people", foot: "feet", tooth: "teeth", goose: "geese", knife: "knives", leaf: "leaves", wife: "wives", life: "lives", half: "halves", wolf: "wolves", shelf: "shelves", potato: "potatoes", tomato: "tomatoes", hero: "heroes", deer: "deer", ox: "oxen", policeman: "policemen", fireman: "firemen", salmon: "salmon", piano: "pianos", photo: "photos", radio: "radios", zoo: "zoos", kangaroo: "kangaroos", video: "videos" };
    function plural(w) {
      var sp = w.lastIndexOf(" ");
      if (sp > 0) return w.slice(0, sp + 1) + plural(w.slice(sp + 1));
      var lw = w.toLowerCase();
      if (IRR_PL[lw]) return IRR_PL[lw];
      var m = /(child|man|woman|mouse|foot|tooth|person)$/.exec(lw);
      if (m && lw !== m[1]) return w.slice(0, -m[1].length) + IRR_PL[m[1]];
      if (/(s|x|z|ch|sh)$/.test(lw)) return w + "es";
      if (/[^aeiou]y$/.test(lw)) return w.slice(0, -1) + "ies";
      if (/[^aeiou]o$/.test(lw)) return w + "es";
      return w + "s";
    }
    function head(v) {
      return v.b || v.w.split(" ")[0];
    }
    function tailOf(v) {
      var t = v.tail || v.w.indexOf(" ") > 0 && v.w.split(" ").slice(1).join(" ") || "";
      return t ? " " + t : "";
    }
    function s3(v) {
      var b = head(v);
      if (v.s3) return v.s3 + tailOf(v);
      var x;
      if (b === "have") x = "has";
      else if (b === "be") x = "is";
      else if (/(s|x|z|ch|sh|o)$/.test(b)) x = b + "es";
      else if (/[^aeiou]y$/.test(b)) x = b.slice(0, -1) + "ies";
      else x = b + "s";
      return x + tailOf(v);
    }
    function regEd(b, dbl) {
      if (/e$/.test(b)) return b + "d";
      if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ied";
      if (dbl && /[^aeiou][aeiou][bdgklmnprtv]$/.test(b)) return b + b.slice(-1) + "ed";
      return b + "ed";
    }
    function past(v) {
      return (v.past || regEd(head(v), v.dbl)) + tailOf(v);
    }
    function pp(v) {
      return (v.pp || v.past || regEd(head(v), v.dbl)) + tailOf(v);
    }
    function ingOf(b, dbl) {
      if (b === "be") return "being";
      if (b === "see") return "seeing";
      if (/ie$/.test(b)) return b.slice(0, -2) + "ying";
      if (/[^aeiouy]e$/.test(b) && !/(ee|ye|oe)$/.test(b)) return b.slice(0, -1) + "ing";
      if (dbl && /[^aeiou][aeiou][bdgklmnprtv]$/.test(b)) return b + b.slice(-1) + "ing";
      return b + "ing";
    }
    function ing(v) {
      return ingOf(head(v), v.dbl) + tailOf(v);
    }
    function base(v) {
      return head(v) + tailOf(v);
    }
    function comp(a) {
      return a.cmp || "more " + a.w;
    }
    function sup(a) {
      return a.sup || "most " + a.w;
    }
    function an(next) {
      var w = String(next || "").toLowerCase();
      if (/^(hour|honest|honor|heir)/.test(w)) return "an";
      if (/^(uni|use|usu|uti|euro|one|once|u[^aeiou][aeiou])/.test(w)) return "a";
      return /^[aeiou]/.test(w) ? "an" : "a";
    }
    return { makeDefault, validate, plural, s3, past, pp, ing, base, comp, sup, an, head };
  })();

  // games/punichunk/src/grammar.js
  var G = (function() {
    "use strict";
    var PRON = {
      i: { sub: "I", obj: "me", pos: "my", p: 1, pl: 0, ja: "\u308F\u305F\u3057" },
      you: { sub: "you", obj: "you", pos: "your", p: 2, pl: 0, ja: "\u3042\u306A\u305F" },
      he: { sub: "he", obj: "him", pos: "his", p: 3, pl: 0, ja: "\u304B\u308C" },
      she: { sub: "she", obj: "her", pos: "her", p: 3, pl: 0, ja: "\u304B\u306E\u3058\u3087" },
      it: { sub: "it", obj: "it", pos: "its", p: 3, pl: 0, ja: "\u305D\u308C" },
      we: { sub: "we", obj: "us", pos: "our", p: 1, pl: 1, ja: "\u308F\u305F\u3057\u305F\u3061" },
      they: { sub: "they", obj: "them", pos: "their", p: 3, pl: 1, ja: "\u304B\u308C\u3089" },
      youpl: { sub: "you", obj: "you", pos: "your", p: 2, pl: 1, ja: "\u3042\u306A\u305F\u305F\u3061" }
    };
    var PRON_C1 = ["i", "you", "he", "she", "it"], PRON_C2 = ["we", "they", "youpl"];
    var PREP_G = [["at", "on", "in"], ["to", "from", "into"], ["with", "for", "about", "by"], ["under", "near", "behind"]];
    var PREP_GROUP = {};
    PREP_G.forEach(function(g, i) {
      g.forEach(function(p) {
        PREP_GROUP[p] = i;
      });
    });
    var MODAL_CYCLE = { can: "could", could: "can", will: "would", would: "will", may: "might", might: "may", must: "must", should: "should" };
    var MODAL_PAST = { could: 1, would: 1, might: 1 };
    var MODAL_TO_PAST = { can: "could", will: "would", may: "might" };
    var MODALS = ["can", "will", "may", "must", "should"];
    var SEMI = { "want to": { b: "want", past: "wanted", ja: "\u301C\u3057\u305F\u3044" }, "have to": { b: "have", past: "had", s3: "has", ja: "\u301C\u3057\u306A\u3051\u308C\u3070" }, "need to": { b: "need", past: "needed", ja: "\u301C\u3059\u308B\u5FC5\u8981\u304C\u3042\u308B" }, "be going to": { be: 1, ja: "\u301C\u3059\u308B\u3064\u3082\u308A" }, "used to": { only: "past", ja: "\u3088\u304F\u301C\u3057\u305F" }, "would like to": { fixed: 1, ja: "\u301C\u3057\u305F\u3044" } };
    var SEMIS = Object.keys(SEMI);
    var NEG = { can: "can't", could: "couldn't", will: "won't", would: "wouldn't", should: "shouldn't", must: "mustn't", may: "may not", might: "might not", do: "don't", does: "doesn't", did: "didn't", is: "isn't", are: "aren't", was: "wasn't", were: "weren't", am: "am not", have: "haven't", has: "hasn't", had: "hadn't" };
    function negOf(x) {
      return NEG[x] || x + " not";
    }
    var TP_LABEL = { past: "\u904E\u53BB", fut: "\u672A\u6765", prog: "\u9032\u884C" }, TP_CYCLE = ["past", "fut", "prog"];
    var DEGS = ["very", "really", "so", "too"];
    var CONJ_SUB = ["when", "if", "because", "before", "after", "while"], CONJ_CO = ["and", "but", "so"];
    var QUANTS = ["some", "many", "two", "three", "every"];
    var QINFO = { some: { pl: 1, u: 1 }, many: { pl: 1 }, two: { pl: 1 }, three: { pl: 1 }, every: { sg: 1 }, "a few": { pl: 1 }, "a lot of": { pl: 1, u: 1 }, "lots of": { pl: 1, u: 1 } };
    var JA_P = { at: "\u3067", in: "\u3067", on: "\u306E\u4E0A\u3067", to: "\u3078", from: "\u304B\u3089", into: "\u306E\u4E2D\u3078", with: "\u3068", for: "\u306E\u305F\u3081\u306B", about: "\u306B\u3064\u3044\u3066", by: "\u306E\u305D\u3070\u3067", under: "\u306E\u4E0B\u3067", near: "\u306E\u8FD1\u304F\u3067", behind: "\u306E\u5F8C\u308D\u3067" };
    function qinfo(w) {
      if (w.k !== "q") return null;
      if (QINFO[w.v]) return QINFO[w.v];
      if (w.e && w.e.q === "u") return { u: 1, uonly: 1 };
      return { pl: 1, u: 1 };
    }
    function codeOf(w) {
      switch (w.k) {
        case "det":
          return "D";
        case "q":
          return "Q";
        case "pr":
          return "P";
        case "adj":
          return "A";
        case "deg":
          return "G";
        case "er":
          return "E";
        case "n":
          return "N";
        case "prep":
          return "R";
        case "modal":
        case "sm":
          return "M";
        case "tp":
          return "K";
        case "not":
          return "T";
        case "be":
          return "B";
        case "hv":
          return "H";
        case "v":
          return "V";
        case "ti":
          return "I";
        case "adv":
          return w.e.k === "freq" ? "F" : w.e.k === "manner" ? "Y" : "S";
        case "idm":
          return "O";
        case "conj":
          return "C";
      }
      return "?";
    }
    function modsCheck(c) {
      var i = 0, n = c.length;
      while (i < n) {
        var g = 0;
        while (i < n && c[i] === "G") {
          g++;
          i++;
        }
        if (i === n) return { ok: true, full: g === 0 };
        if (c[i] === "E") {
          i++;
          if (i === n) return { ok: true, full: false };
          if (c[i] !== "A") return { ok: false };
          i++;
          continue;
        }
        if (c[i] === "A") {
          i++;
          if (i < n && c[i] === "E") i++;
          continue;
        }
        return { ok: false };
      }
      return { ok: true, full: true };
    }
    function only(c, set) {
      for (var i = 0; i < c.length; i++) if (set.indexOf(c[i]) < 0) return false;
      return true;
    }
    function mNP(c) {
      var lead = c.length && "DQP".indexOf(c[0]) >= 0 ? 1 : 0, r = c.slice(lead);
      var ni = r.indexOf("N");
      if (ni < 0) {
        if (!only(r, "GAE")) return { full: false, pre: false };
        var m = modsCheck(r);
        return { full: false, pre: m.ok };
      }
      if (ni !== r.length - 1) return { full: false, pre: false };
      var mods = r.slice(0, -1);
      if (!only(mods, "GAE")) return { full: false, pre: false };
      var mm = modsCheck(mods);
      return { full: mm.full, pre: mm.full };
    }
    function mNPP(c) {
      if (!c.length || c.length > 2 || !only(c, "P")) return { full: false, pre: false };
      return { full: true, pre: c.length === 1 };
    }
    function mPP(c) {
      if (c[0] !== "R") return { full: false, pre: false };
      if (c.length === 1) return { full: false, pre: true };
      var r = c.slice(1), a = mNP(r), b = r.length === 1 && r[0] === "P" ? { full: true, pre: false } : { full: false, pre: false };
      return { full: a.full || b.full, pre: a.pre || b.pre };
    }
    function advRun(c) {
      var i = 0;
      while (i < c.length) {
        while (i < c.length && c[i] === "G") i++;
        if (i === c.length) return { ok: true, full: false };
        if (c[i] !== "Y") return { ok: false };
        i++;
      }
      return { ok: true, full: true };
    }
    var VP_ST = "TMTHTBTFV";
    function mVP(c) {
      var ki = c.indexOf("K");
      if (ki < 0) return mVPcore(c);
      if (c.lastIndexOf("K") !== ki) return { full: false, pre: false };
      var rest = c.slice(0, ki).concat(c.slice(ki + 1));
      if (rest.indexOf("M") >= 0 || rest.indexOf("B") >= 0) return { full: false, pre: false };
      var vi = c.indexOf("V"), r = mVPcore(rest);
      if (vi < 0) return { full: false, pre: r.pre && ki === c.length - 1 };
      if (Math.abs(vi - ki) !== 1) return { full: false, pre: false };
      return r;
    }
    function mVPcore(c) {
      var st = 0, hasT = 0, h = {}, i;
      for (i = 0; i < c.length; i++) {
        var x = c[i];
        if (x === "Y" || x === "G") break;
        var s = -1;
        for (var k = st; k < VP_ST.length; k++) if (VP_ST[k] === x) {
          s = k;
          break;
        }
        if (s < 0) return { full: false, pre: false };
        if (x === "T") {
          if (hasT) return { full: false, pre: false };
          hasT = 1;
        }
        h[x] = 1;
        st = s + 1;
      }
      var tail = c.slice(i), adv = tail.length ? advRun(tail) : { ok: true, full: true };
      if (!adv.ok) return { full: false, pre: false };
      if (tail.length && !h.V) return { full: false, pre: false };
      var core2 = h.V || h.B;
      return { full: !!core2 && adv.full, pre: true };
    }
    function mNF(c) {
      if (c[0] === "I") {
        if (c.length === 1) return { full: false, pre: true };
        if (c[1] !== "V") return { full: false, pre: false };
        var t = c.slice(2);
        if (!t.length) return { full: true, pre: true };
        var a = advRun(t);
        return { full: a.ok && a.full, pre: a.ok };
      }
      if (c[0] === "V") {
        if (c.length === 1) return { full: false, pre: true };
        if (c.length === 2 && c[1] === "I") return { full: true, pre: false };
      }
      return { full: false, pre: false };
    }
    function mAP(c) {
      if (!c.length || !only(c, "GAE")) return { full: false, pre: false };
      var na = c.filter(function(x) {
        return x === "A";
      }).length, ne = c.filter(function(x) {
        return x === "E";
      }).length;
      if (na > 1 || ne > 1) return { full: false, pre: false };
      var m = modsCheck(c);
      return { full: m.full && na === 1, pre: m.ok };
    }
    function mADV(c) {
      if (c.length === 1 && c[0] === "S") return { full: true, pre: false };
      if (!only(c, "GY")) return { full: false, pre: false };
      var y = c.indexOf("Y");
      if (y >= 0 && y !== c.length - 1) return { full: false, pre: false };
      return { full: y === c.length - 1 && c.length > 0, pre: true };
    }
    function mOne(code) {
      return function(c) {
        return { full: c.length === 1 && c[0] === code, pre: false };
      };
    }
    var TYPES = [["PP", mPP], ["NP", mNP], ["NPP", mNPP], ["NF", mNF], ["VP", mVP], ["AP", mAP], ["ADV", mADV], ["ID", mOne("O")], ["CONJ", mOne("C")]];
    var ALLCODES = "DQPAGENRMTBFVYISOCKH";
    function scan(codes) {
      var full = null, pre = false;
      for (var i = 0; i < TYPES.length; i++) {
        var r = TYPES[i][1](codes);
        if (r.full && !full) full = TYPES[i][0];
        if (r.pre) pre = true;
      }
      return { full, pre };
    }
    function chainState(words, cfg) {
      var codes = words.map(codeOf), s = scan(codes);
      var res = { complete: !!s.full, prefix: s.pre || !!s.full, closed: false, type: s.full, chunk: null, err: null };
      if (s.full) {
        var closed = true;
        for (var i = 0; i < ALLCODES.length && closed; i++) {
          var x = scan(codes.concat([ALLCODES[i]]));
          if (x.pre || x.full) closed = false;
        }
        res.closed = closed;
        var b = build(s.full, words, cfg);
        res.chunk = b.chunk;
        res.err = b.err;
      }
      return res;
    }
    function canAppend(words, w) {
      var s = scan(words.concat([w]).map(codeOf));
      return s.pre || !!s.full;
    }
    function E_(code, a) {
      return { code, msg: MSG[code](a || {}) };
    }
    var MSG = {
      needDet: function(a) {
        return "\u300C" + a.n + "\u300D\u306E\u524D\u306B a \u304B the \u3092\u4ED8\u3051\u3088\u3046";
      },
      aBad: function(a) {
        return "\u300C" + a.n + "\u300D\u306B a \u306F\u4ED8\u304B\u306A\u3044(\u6570\u3048\u306A\u3044\u540D\u8A5E\u30FB\u8907\u6570\u5F62)";
      },
      properDet: function(a) {
        return "\u300C" + a.n + "\u300D\u306B\u306F\u51A0\u8A5E\u304C\u4ED8\u304B\u306A\u3044";
      },
      needThe: function(a) {
        return "\u300C" + a.n + "\u300D\u306B\u306F the \u3092\u4ED8\u3051\u3088\u3046";
      },
      qBad: function(a) {
        return "\u300C" + a.q + "\u300D\u3068\u300C" + a.n + "\u300D\u306F\u5408\u308F\u306A\u3044";
      },
      supThe: function() {
        return "\u6700\u4E0A\u7D1A(-est)\u306B\u306F the \u3092\u4ED8\u3051\u3088\u3046";
      },
      noCmp: function(a) {
        return "\u300C" + a.a + "\u300D\u306F -er / -est \u306B\u3067\u304D\u306A\u3044";
      },
      prepTime: function(a) {
        return "\u300C" + a.n + "\u300D\u306B\u306F " + a.p + " \u3092\u4F7F\u304A\u3046";
      },
      prepPlace: function(a) {
        return "\u300C" + a.n + "\u300D\u306B\u306F " + a.p + " \u304C\u81EA\u7136";
      },
      modalBase: function(a) {
        return a.m + " \u306E\u5F8C\u308D\u306F\u52D5\u8A5E\u306E\u539F\u5F62";
      },
      havePP: function() {
        return "have \u306E\u5F8C\u308D\u306F\u904E\u53BB\u5206\u8A5E(eaten \u306A\u3069)";
      },
      beForm: function() {
        return "be \u306E\u5F8C\u308D\u306F -ing \u304B\u904E\u53BB\u5206\u8A5E";
      },
      needBe: function() {
        return "-ing \u3084\u904E\u53BB\u5206\u8A5E\u3060\u3051\u3067\u306F\u52D5\u8A5E\u306B\u306A\u3089\u306A\u3044(be \u304C\u5FC5\u8981)";
      },
      passiveIntr: function(a) {
        return "\u300C" + a.v + "\u300D\u306F\u53D7\u3051\u8EAB(be+\u904E\u53BB\u5206\u8A5E)\u306B\u3067\u304D\u306A\u3044";
      },
      tense: function(a) {
        return "\u300C" + a.t + "\u300D\u306F" + a.w + "\u306E\u3053\u3068\u3002\u6642\u5236\u3092\u5408\u308F\u305B\u3088\u3046";
      },
      cv: function(a) {
        return "\u300C" + a.v + "\u300D\u306E\u5F8C\u308D\u306F " + a.f + " \u306E\u5F62";
      },
      purposeTo: function() {
        return "\u300C\u301C\u3059\u308B\u305F\u3081\u306B\u300D\u306F to + \u52D5\u8A5E";
      },
      intrObj: function(a) {
        return "\u300C" + a.v + "\u300D\u306F\u76EE\u7684\u8A9E(\u4F55\u3092)\u3092\u3068\u3089\u306A\u3044";
      },
      needObj: function(a) {
        return "\u300C" + a.v + "\u300D\u306E\u5F8C\u308D\u306B\u300C\u4F55\u3092\u300D\u304C\u8DB3\u308A\u306A\u3044";
      },
      needSubj: function() {
        return "\u4E3B\u8A9E(\u3060\u308C\u304C\u30FB\u4F55\u304C)\u304C\u8DB3\u308A\u306A\u3044";
      },
      needVerb: function() {
        return "\u52D5\u8A5E(\u3059\u308B)\u304C\u8DB3\u308A\u306A\u3044";
      },
      needComp: function() {
        return "be \u306E\u5F8C\u308D\u306B\u300C\u3069\u3093\u306A\u30FB\u4F55\u300D\u304C\u8DB3\u308A\u306A\u3044";
      },
      dupTime: function() {
        return "\u6642\u3092\u8868\u3059\u8A00\u8449\u304C2\u3064\u3042\u308B";
      },
      dupPlace: function() {
        return "\u5834\u6240\u3092\u8868\u3059\u8A00\u8449\u304C2\u3064\u3042\u308B";
      },
      order: function() {
        return "\u8A9E\u9806\u304B\u5F79\u5272\u304C\u3061\u304C\u3046";
      },
      chain: function(a) {
        return "\u300C" + a.t + "\u300D\u3060\u3051\u3067\u306F\u30C1\u30E3\u30F3\u30AF\u306B\u306A\u3089\u306A\u3044";
      }
    };
    function nounOf(w) {
      return w.e;
    }
    function isCount(e) {
      return e.c === "c" || e.c === "t";
    }
    function buildMods(ws, cfg, errs) {
      var mods = [], degs = [], pendingE = null, last = null;
      ws.forEach(function(w) {
        if (w.k === "deg") {
          degs.push(w.v);
          last = null;
        } else if (w.k === "er") {
          if (last && !last.er) last.er = w.v || "er";
          else pendingE = w.v || "er";
          last = null;
        } else if (w.k === "adj") {
          last = { deg: degs, adj: w.e, er: pendingE };
          mods.push(last);
          degs = [];
          pendingE = null;
        }
      });
      mods.forEach(function(m) {
        if (m.er && m.adj.no) errs.push(E_("noCmp", { a: m.adj.w }));
      });
      return mods;
    }
    function buildNP(ws, cfg, errs, inPP) {
      if (ws.every(function(w) {
        return w.k === "pr";
      })) {
        var pr = ws[0].v;
        if (ws.length === 2) pr = mergePron(ws[0].v, ws[1].v);
        return { t: "NP", pron: pr, merged: ws.length === 2, words: ws };
      }
      var lead = "DQP".indexOf(codeOf(ws[0])) >= 0 ? ws[0] : null, nw = ws[ws.length - 1], e = nounOf(nw);
      var mods = buildMods(ws.slice(lead ? 1 : 0, -1), cfg, errs);
      var np = { t: "NP", words: ws, noun: e, mods, det: null, quant: null, poss: null, num: "sg" };
      if (e.c === "p") np.num = "pl";
      else if (isCount(e) && !e.ind && nw.pl) np.num = "pl";
      var auto = cfg.auto.art, nm = e.w;
      if (lead && lead.k === "q") {
        var qi = qinfo(lead);
        np.quant = lead.v;
        if (isCount(e)) {
          if (qi.uonly) errs.push(E_("qBad", { q: lead.v, n: nm }));
          else np.num = qi.sg ? "sg" : "pl";
        } else if (e.c === "u") {
          if (!qi.u) errs.push(E_("qBad", { q: lead.v, n: nm }));
        } else if (e.c === "p") {
          if (!qi.pl) errs.push(E_("qBad", { q: lead.v, n: nm }));
        } else errs.push(E_("qBad", { q: lead.v, n: nm }));
      } else if (lead && lead.k === "pr") np.poss = lead.v;
      else if (lead && lead.k === "det") np.det = lead.v;
      var hasSup = mods.some(function(m) {
        return m.er === "est";
      });
      if (np.det === "a" && (np.num === "pl" || e.c === "u" || e.c === "p")) {
        if (auto) np.det = "the";
        else errs.push(E_("aBad", { n: nm }));
      }
      if (np.det && e.c === "n") {
        if (auto) np.det = null;
        else errs.push(E_("properDet", { n: nm }));
      }
      if (!np.det && !np.quant && !np.poss && isCount(e) && np.num === "sg" && !e.ind) {
        if (auto) {
          if (e.ad === "my") np.poss = "i";
          else np.det = e.ad === "the" || e.c === "t" || hasSup ? "the" : "a";
          np.autoDet = 1;
        } else errs.push(E_(e.c === "t" ? "needThe" : "needDet", { n: nm }));
      }
      if (hasSup && np.det !== "the" && !np.poss) {
        if (auto) {
          if (!np.quant) np.det = "the";
        } else errs.push(E_("supThe"));
      }
      return np;
    }
    function mergePron(a, b) {
      if (a === "i" || b === "i" || a === "we" || b === "we") return "we";
      if ((a === "you" || a === "youpl") && (b === "you" || b === "youpl")) return "youpl";
      return "they";
    }
    function buildPP(ws, cfg, errs) {
      var pw = ws[0], np = buildNP(ws.slice(1), cfg, errs, true), prep = pw.v, g = PREP_GROUP[prep], cat = "other";
      var e = np.noun;
      if (e && e.cat === "time") {
        if (g === 0) {
          cat = "time";
          if (e.prep && prep !== e.prep) {
            if (cfg.auto.prep) prep = e.prep;
            else errs.push(E_("prepTime", { n: e.w, p: e.prep }));
          }
          if (e.c === "t" && np.det !== "the") {
            if (cfg.auto.art) {
              np.det = "the";
              np.poss = null;
            } else if (!errs.some(function(x) {
              return x.code === "needThe";
            })) errs.push(E_("needThe", { n: e.w }));
          }
        }
      } else if (e && e.cat === "place") {
        cat = g === 1 ? "dir" : g === 2 ? "other" : "place";
        if (g === 0 && e.prep) {
          var ok = e.prep === "at" || e.prep === "in" ? ["at", "in"] : [e.prep];
          if (ok.indexOf(prep) < 0) {
            if (cfg.auto.prep) prep = e.prep;
            else errs.push(E_("prepPlace", { n: e.w, p: e.prep }));
          }
        }
      } else cat = g === 1 ? "dir" : g === 2 ? "other" : np.pron ? "other" : "place";
      return { t: "PP", words: ws, prep, np, cat };
    }
    function buildVP(ws, cfg, errs) {
      var vp = { t: "VP", words: ws, modal: null, neg: false, be: null, freq: null, verb: null, vf: "base", advs: [], beW: null };
      var degs = [];
      ws.forEach(function(w) {
        switch (w.k) {
          case "modal":
            vp.modal = w.v;
            break;
          case "sm":
            vp.semi = w.v;
            vp.semiW = w;
            break;
          case "tp":
            vp.tp = w.v || "past";
            break;
          case "not":
            vp.neg = true;
            break;
          case "be":
            vp.be = w.v || "pres";
            vp.beW = w;
            break;
          case "hv":
            vp.have = w.v || "pres";
            vp.hvW = w;
            break;
          case "v":
            vp.verb = w.e;
            vp.vf = w.f || "base";
            vp.vw = w;
            break;
          case "deg":
            degs.push(w.v);
            break;
          case "adv":
            if (w.e.k === "freq") vp.freq = w.e;
            else {
              vp.advs.push({ deg: degs, e: w.e });
              degs = [];
            }
            break;
        }
      });
      if (vp.tp) {
        vp.vf = vp.be && vp.verb ? "ing" : "base";
      } else if (cfg.auto.verb) {
        if (vp.verb) {
          if (vp.have && !vp.be) vp.vf = "pp";
          else if (vp.be) {
            if (vp.vf !== "ing" && vp.vf !== "pp") vp.vf = "ing";
            if (vp.vf === "pp" && vp.verb.fr === "intr") vp.vf = "ing";
          } else if (vp.modal || vp.semi) vp.vf = "base";
          else if (vp.vf !== "base" && vp.vf !== "past") vp.vf = vp.vf === "pp" ? "past" : "base";
        }
      } else if (vp.verb) {
        if (vp.have && !vp.be) {
          if (vp.vf !== "pp") errs.push(E_("havePP"));
        } else if (vp.be) {
          if (vp.vf !== "ing" && vp.vf !== "pp") errs.push(E_("beForm"));
          else if (vp.vf === "pp" && vp.verb.fr === "intr") errs.push(E_("passiveIntr", { v: vp.verb.w }));
        } else if (vp.modal || vp.semi) {
          if (vp.vf !== "base") errs.push(E_("modalBase", { m: vp.modal || vp.semi }));
        } else if (vp.vf !== "base" && vp.vf !== "past") errs.push(E_("needBe"));
      }
      return vp;
    }
    function buildNF(ws) {
      var iw = ws.filter(function(w) {
        return w.k === "ti";
      })[0], vw = ws.filter(function(w) {
        return w.k === "v";
      })[0];
      var advs = [], degs = [];
      ws.forEach(function(w) {
        if (w.k === "deg") degs.push(w.v);
        if (w.k === "adv") {
          advs.push({ deg: degs, e: w.e });
          degs = [];
        }
      });
      var ti = iw.v || (ws.indexOf(iw) < ws.indexOf(vw) ? "to" : "ing");
      return { t: "NF", words: ws, ti, verb: vw.e, advs };
    }
    function build(type, ws, cfg) {
      var errs = [], c;
      switch (type) {
        case "NP":
        case "NPP":
          c = buildNP(ws, cfg, errs);
          break;
        case "PP":
          c = buildPP(ws, cfg, errs);
          break;
        case "VP":
          c = buildVP(ws, cfg, errs);
          break;
        case "NF":
          c = buildNF(ws);
          break;
        case "AP":
          c = { t: "AP", words: ws, mods: buildMods(ws, cfg, errs) };
          break;
        case "ADV":
          var a = ws[ws.length - 1];
          c = { t: "ADV", words: ws, e: a.e, ak: a.e.k, deg: ws.slice(0, -1).map(function(w) {
            return w.v;
          }) };
          break;
        case "ID":
          c = { t: "ID", words: ws, e: ws[0].e, ik: ws[0].e.k };
          break;
        case "CONJ":
          c = { t: "CONJ", words: ws, v: ws[0].v, sub: CONJ_SUB.indexOf(ws[0].v) >= 0 };
          break;
      }
      return { chunk: c, err: errs[0] || null };
    }
    function rebuild(ch, cfg) {
      if (ch.t === "CL") return { chunk: ch, err: null };
      var s = chainState(ch.words, cfg);
      return { chunk: s.complete ? s.chunk : null, err: s.err };
    }
    function tryInsert(ch, w, cfg) {
      if (!ch || ch.t === "CL" || ch.t === "ID" || ch.t === "CONJ") return null;
      for (var pos = ch.words.length; pos >= 0; pos--) {
        var nw = ch.words.slice(0, pos).concat([w], ch.words.slice(pos));
        var s = chainState(nw, cfg);
        if (s.complete && sameKind(s.type, ch.t) && !s.err) return s.chunk;
      }
      var ends = [0, ch.words.length];
      for (var e = 0; e < ends.length; e++) {
        var nw2 = ch.words.slice(0, ends[e]).concat([w], ch.words.slice(ends[e]));
        var s2 = chainState(nw2, cfg);
        if (s2.complete && !s2.err && s2.type !== "CONJ" && s2.type !== "ID") return s2.chunk;
      }
      return null;
    }
    function sameKind(type, t) {
      return type === t || type === "NPP" && t === "NP";
    }
    function cycleWord(w, cfg) {
      var i;
      switch (w.k) {
        case "det":
          w.v = w.v === "a" ? "the" : "a";
          return true;
        case "pr":
          var cyc = PRON_C1.indexOf(w.v) >= 0 ? PRON_C1 : PRON_C2;
          i = cyc.indexOf(w.v);
          w.v = cyc[(i + 1) % cyc.length];
          return true;
        case "prep":
          var g = PREP_G[PREP_GROUP[w.v]];
          i = g.indexOf(w.v);
          w.v = g[(i + 1) % g.length];
          return true;
        case "modal":
          if (MODAL_CYCLE[w.v] === w.v) return false;
          w.v = MODAL_CYCLE[w.v];
          return true;
        case "sm":
          if (cfg.auto.verb || SEMI[w.v].only || SEMI[w.v].fixed) return false;
          w.t = w.t === "past" ? "pres" : "past";
          return true;
        case "tp":
          i = TP_CYCLE.indexOf(w.v || "past");
          w.v = TP_CYCLE[(i + 1) % 3];
          return true;
        case "be":
        case "hv":
          w.v = w.v === "past" ? "pres" : "past";
          return true;
        case "v":
          var F = ["base", "past", "pp", "ing"];
          i = F.indexOf(w.f || "base");
          w.f = F[(i + 1) % 4];
          return true;
        case "n":
          if (!isCount(w.e) || w.e.ind) return false;
          w.pl = !w.pl;
          return true;
        case "ti":
          w.v = (w.v || "to") === "to" ? "ing" : "to";
          return true;
        case "er":
          w.v = (w.v || "er") === "er" ? "est" : "er";
          return true;
        case "conj":
          var cg = CONJ_SUB.indexOf(w.v) >= 0 ? CONJ_SUB : CONJ_CO;
          i = cg.indexOf(w.v);
          w.v = cg[(i + 1) % cg.length];
          return true;
      }
      return false;
    }
    function cyclable(w, cfg) {
      var c = JSON.parse(JSON.stringify({ k: w.k, v: w.v, f: w.f, pl: w.pl }));
      c.e = w.e;
      return cycleWord(c, cfg);
    }
    function adjText(m) {
      var a = m.adj, s = m.er === "er" ? Dict.comp(a) : m.er === "est" ? Dict.sup(a) : a.w;
      return (m.deg.length ? m.deg.join(" ") + " " : "") + s;
    }
    function nounText(np) {
      return np.num === "pl" && isCount(np.noun) ? Dict.plural(np.noun.w) : np.noun.w;
    }
    function npText(np, cas) {
      if (np.pron) return cas === "obj" ? PRON[np.pron].obj : PRON[np.pron].sub;
      var rest = np.mods.map(adjText).concat([nounText(np)]).join(" "), lead = "";
      if (np.quant) lead = np.quant;
      else if (np.poss) lead = PRON[np.poss].pos;
      else if (np.det === "a") lead = Dict.an(rest);
      else if (np.det) lead = np.num === "pl" && np.det === "this" ? "these" : np.num === "pl" && np.det === "that" ? "those" : np.det;
      return (lead ? lead + " " : "") + rest + (np.postText ? " " + np.postText : "");
    }
    function advText(a) {
      return (a.deg && a.deg.length ? a.deg.join(" ") + " " : "") + a.e.w;
    }
    function verbForm(v, f) {
      return f === "past" ? Dict.past(v) : f === "pp" ? Dict.pp(v) : f === "ing" ? Dict.ing(v) : f === "s3" ? Dict.s3(v) : Dict.base(v);
    }
    function nfText(nf, ti) {
      ti = ti || nf.ti;
      var s = ti === "to" ? "to " + Dict.base(nf.verb) : Dict.ing(nf.verb);
      return s + nf.advs.map(function(a) {
        return " " + advText(a);
      }).join("");
    }
    function apText(ap, comp) {
      var m = ap.mods[0];
      return (comp && m.er === "est" ? "the " : "") + adjText(m);
    }
    function ppText(pp) {
      return pp.prep + " " + npText(pp.np, "obj");
    }
    function vpDisplay(vp, cfg) {
      var p = [];
      if (vp.modal) p.push(vp.neg ? negOf(vp.modal) : vp.modal);
      if (vp.semi) p.push(semiShow(vp.semiW, cfg));
      if (vp.have) p.push(vp.modal || vp.semi ? "have" : vp.have === "past" ? "had" : "have");
      if (vp.be) p.push(vp.have ? "been" : vp.modal || vp.semi ? "be" : vp.be === "past" ? "was" : "be");
      if (!vp.modal && vp.neg) p.push("not");
      if (vp.freq) p.push(vp.freq.w);
      if (vp.verb && vp.tp) p.push(vp.tp === "past" ? Dict.past(vp.verb) : vp.tp === "fut" ? "will " + Dict.base(vp.verb) : "be " + Dict.ing(vp.verb));
      else if (vp.verb) p.push(verbForm(vp.verb, vp.vf));
      vp.advs.forEach(function(a) {
        p.push(advText(a));
      });
      return p.join(" ");
    }
    function semiShow(w, cfg) {
      var sm = SEMI[w.v];
      return w.t === "past" && !cfg.auto.verb && sm.past ? sm.past + " to" : w.t === "past" && sm.be && !cfg.auto.verb ? "was going to" : w.v;
    }
    function chunkText(c, cfg) {
      switch (c.t) {
        case "NP":
          return npText(c, "sub");
        case "PP":
          return ppText(c);
        case "VP":
          return vpDisplay(c, cfg);
        case "NF":
          return nfText(c);
        case "AP":
          return apText(c);
        case "ADV":
          return advText(c);
        case "ID":
          return c.e.w;
        case "CONJ":
          return c.v;
        case "CL":
          return c.text;
        case "FR":
          return c.parts.map(function(p) {
            return chunkText(p, cfg);
          }).join(" ");
      }
      return "";
    }
    function label(c, cfg) {
      var ws = chunkText(c, cfg).split(" ");
      return ws.length > 2 ? ws[0] + " \u2026 " + ws[ws.length - 1] : ws.join(" ");
    }
    function wordText(w, cfg) {
      switch (w.k) {
        case "n":
          return w.pl && isCount(w.e) ? Dict.plural(w.e.w) : w.e.w;
        case "pr":
          return PRON[w.v].sub;
        case "det":
        case "q":
        case "deg":
        case "prep":
        case "modal":
        case "conj":
          return w.v;
        case "sm":
          return semiShow(w, cfg);
        case "tp":
          return TP_LABEL[w.v || "past"];
        case "not":
          return "not";
        case "be":
          return w.v === "past" ? "was" : "be";
        case "hv":
          return w.v === "past" ? "had" : "have";
        case "v":
          return verbForm(w.e, w.f || "base");
        case "ti":
          return w.v ? w.v === "to" ? "to" : "-ing" : "to/ing";
        case "er":
          return w.v === "est" ? "-est" : "-er";
        case "adj":
        case "adv":
        case "idm":
          return w.e.w;
        case "magic":
          return "?";
      }
      return "";
    }
    function jaAdj(a) {
      var j = a.ja || a.w;
      return a.jt === "na" ? j + "\u306A" : j;
    }
    function gloss(c) {
      try {
        switch (c.t) {
          case "NP":
            if (c.pron) return PRON[c.pron].ja;
            return (c.poss ? PRON[c.poss].ja + "\u306E" : "") + c.mods.map(function(m) {
              return jaAdj(m.adj);
            }).join("") + (c.noun.ja || "");
          case "PP":
            var n = gloss(c.np);
            return n + (c.cat === "time" ? "\u306B" : JA_P[c.prep] || "");
          case "VP":
            return (c.freq && c.freq.ja ? c.freq.ja + " " : "") + (c.verb ? c.verb.ja : c.be ? "\u301C\u3067\u3042\u308B" : "") + (c.semi ? "(" + SEMI[c.semi].ja + ")" : "") + (c.tp ? "(" + TP_LABEL[c.tp] + ")" : "") + (c.neg ? "(\u301C\u306A\u3044)" : "");
          case "NF":
            return c.verb.ja + (c.ti === "to" ? "(\u3053\u3068\u30FB\u305F\u3081\u306B)" : "(\u3053\u3068)");
          case "AP":
            return c.mods[0].adj.ja;
          case "ADV":
          case "ID":
            return c.e.ja || "";
        }
      } catch (e) {
      }
      return "";
    }
    function isTP(t) {
      return t.t === "ADV" && (t.ak === "time" || t.ak === "place") || t.t === "PP" && (t.cat === "time" || t.cat === "place") || t.t === "ID" && (t.ik === "time" || t.ik === "place");
    }
    function isPost(t) {
      return isTP(t) || t.t === "PP" || t.t === "ADV" || t.t === "ID" && t.ik === "other" || t.t === "NF";
    }
    function compOptions(vp) {
      var o = [], v = vp.verb;
      if (!v || vp.be && vp.vf === "pp" && v) {
        if (!v) {
          o.push({ p: ["AP"] }, { p: ["NP"] }, { p: ["PPplace"] }, { p: [], f: "needComp" });
          return o;
        }
        o.push({ p: [] });
        return o;
      }
      if (v.link && !vp.be) {
        o.push({ p: ["AP"] }, { p: ["NP"] });
        if (v.fr !== "tr") o.push({ p: [] });
        else o.push({ p: [], f: "needObj" });
      } else if (v.fr === "tr") {
        o.push({ p: ["NP"] });
        if (v.dt) o.push({ p: ["NP", "NP"] });
        o.push({ p: [], f: "needObj" });
      } else if (v.fr === "both") {
        o.push({ p: [] }, { p: ["NP"] });
        if (v.dt) o.push({ p: ["NP", "NP"] });
      } else {
        o.push({ p: [] }, { p: ["NP"], f: "intrObj" });
      }
      if (v.cv) {
        o.push({ p: ["NF"] }, { p: ["NF", "NPobj"] });
      }
      return o;
    }
    function fits(tok, pat, prev) {
      if (!tok) return false;
      if (pat === "NP") return tok.t === "NP";
      if (pat === "NPobj") return tok.t === "NP" && prev && prev.verb && prev.verb.fr !== "intr";
      if (pat === "AP") return tok.t === "AP";
      if (pat === "NF") return tok.t === "NF";
      if (pat === "PPplace") return tok.t === "PP" && (tok.cat === "place" || tok.cat === "dir") || tok.t === "ADV" && tok.ak === "place" || tok.t === "ID" && tok.ik === "place";
      return false;
    }
    function pClause(T, i, allowPre, prefix, out) {
      var n = T.length;
      for (var k = 0; k <= 2; k++) {
        if (k > 0 && !(i + k - 1 < n && allowPre && isTP(T[i + k - 1]))) break;
        var j = i + k, pre = T.slice(i, j);
        if (prefix && j === n) {
          out.push({ i: n, partial: true });
          continue;
        }
        var subj = null, flags = [];
        if (T[j] && T[j].t === "NP") {
          subj = T[j];
          j++;
        } else if (T[j] && T[j].t === "VP") flags.push("needSubj");
        else continue;
        if (prefix && j === n) {
          out.push({ i: n, partial: true });
          continue;
        }
        var vp = T[j];
        if (!vp || vp.t !== "VP") continue;
        j++;
        compOptions(vp).forEach(function(op) {
          var jj = j, ok = true;
          for (var q = 0; q < op.p.length; q++) {
            if (prefix && jj === n) {
              out.push({ i: n, partial: true });
              ok = false;
              break;
            }
            if (!fits(T[jj], op.p[q], T[jj - 1])) {
              ok = false;
              break;
            }
            jj++;
          }
          if (!ok) return;
          if (vp.verb && vp.verb.cv && op.p.indexOf("NF") < 0 && T[jj] && T[jj].t === "NF") return;
          var fl = flags.slice();
          if (op.f) fl.push(op.f);
          for (var m = 0; m <= 3; m++) {
            if (m > 0 && !(jj + m - 1 < n && isPost(T[jj + m - 1]))) break;
            out.push({ i: jj + m, cl: { pre, subj, vp, comps: T.slice(j, jj), compPat: op.p, posts: T.slice(jj, jj + m), flags: fl } });
          }
          if (prefix && jj + 3 < n) {
          }
        });
      }
      return out;
    }
    function parseAll(T, prefix) {
      var n = T.length, res = [], fronts = [{ i: 0, front: null }];
      if (T[0] && (T[0].t === "CL" || T[0].t === "ID" && T[0].ik === "front")) fronts.push({ i: 1, front: { tok: T[0] } });
      if (T[0] && T[0].t === "CONJ" && T[0].sub) {
        if (prefix && n === 1) res.push({ partial: true });
        pClause(T, 1, true, prefix, []).forEach(function(c) {
          if (c.partial) {
            res.push({ partial: true });
            return;
          }
          if (c.i === n) res.push({ kind: "CL", conj: T[0], cl: c.cl });
          fronts.push({ i: c.i, front: { conj: T[0], cl: c.cl } });
        });
      }
      fronts.forEach(function(f) {
        if (prefix && f.i === n && f.front) {
          res.push({ partial: true });
          return;
        }
        pClause(T, f.i, true, prefix, []).forEach(function(c1) {
          if (c1.partial) {
            res.push({ partial: true });
            return;
          }
          if (c1.i === n) {
            res.push({ kind: "S", front: f.front, cls: [c1.cl] });
            return;
          }
          var co = T[c1.i];
          if (co && co.t === "CONJ") {
            if (prefix && c1.i + 1 === n) {
              res.push({ partial: true });
              return;
            }
            pClause(T, c1.i + 1, true, prefix, []).forEach(function(c2) {
              if (c2.partial) {
                res.push({ partial: true });
                return;
              }
              if (c2.i === n) res.push({ kind: "S", front: f.front, cls: [c1.cl, c2.cl], co });
            });
          }
        });
      });
      return res;
    }
    function timeTokens(cl) {
      var out = [];
      cl.pre.concat(cl.posts).forEach(function(t) {
        if (t.t === "ADV" && t.ak === "time") out.push({ ts: t.e.ts, w: t.e.w });
        else if (t.t === "ID" && t.ik === "time") out.push({ ts: t.e.ts, w: t.e.w });
        else if (t.t === "PP" && t.cat === "time") out.push({ ts: t.np.noun && t.np.noun.ts, w: ppText(t) });
      });
      return out;
    }
    function allowedOf(times) {
      var a = null;
      times.forEach(function(t) {
        var s = {};
        (t.ts || ["pres", "past", "fut", "prog"]).forEach(function(k2) {
          s[k2] = 1;
        });
        if (!a) a = s;
        else {
          var b = {};
          for (var k in a) if (s[k]) b[k] = 1;
          a = b;
        }
      });
      return a;
    }
    function decideTense(vp, allowed, cfg) {
      var asp = vp.verb ? vp.be ? vp.vf === "pp" ? "pass" : "prog" : "simple" : "cop";
      var r = { asp, tense: "pres", modal: vp.modal, ok: true, perf: !!vp.have };
      if (vp.have && !vp.semi) {
        r.tense = cfg.auto.verb ? allowed && !allowed.pres && !allowed.prog && allowed.past ? "past" : "pres" : vp.have === "past" ? "past" : "pres";
        if (vp.modal) r.tense = "pres";
        if (allowed) r.ok = !!(r.tense === "past" ? allowed.past : allowed.pres || allowed.prog || vp.modal && allowed.fut);
        return r;
      }
      if (vp.tp) {
        r.modal = null;
        if (vp.tp === "past") r.tense = "past";
        else if (vp.tp === "fut") r.modal = "will";
        else {
          r.asp = "prog";
          r.progBe = true;
        }
        if (allowed) r.ok = !!(vp.tp === "past" ? allowed.past : vp.tp === "fut" ? allowed.fut || allowed.pres || allowed.prog : allowed.prog || allowed.pres || allowed.fut);
        return r;
      }
      if (vp.semi) {
        var sm = SEMI[vp.semi];
        r.semi = vp.semi;
        if (sm.only) r.tense = "past";
        else if (sm.fixed) r.tense = "pres";
        else if (cfg.auto.verb) {
          if (allowed && !allowed.pres && !allowed.prog && !allowed.fut && allowed.past) r.tense = "past";
        } else r.tense = vp.semiW && vp.semiW.t === "past" ? "past" : "pres";
        if (allowed && !sm.fixed) r.ok = !!(r.tense === "past" ? allowed.past : allowed.pres || allowed.fut || allowed.prog);
        return r;
      }
      if (cfg.auto.verb) {
        var wantPast = vp.be ? vp.be === "past" : vp.vf === "past";
        if (vp.modal) {
          if (allowed && !allowed.pres && !allowed.prog && !allowed.fut && allowed.past) r.modal = MODAL_TO_PAST[vp.modal] || vp.modal;
        } else if (wantPast && (!allowed || allowed.past)) r.tense = "past";
        else if (allowed) {
          if (allowed.pres || allowed.prog && asp === "prog") r.tense = "pres";
          else if (allowed.past) r.tense = "past";
          else if (allowed.fut) r.modal = "will";
          else if (allowed.prog) r.tense = "pres";
        }
        return r;
      }
      r.tense = vp.be ? vp.be : vp.vf === "past" ? "past" : "pres";
      if (!allowed) return r;
      var key = r.modal ? MODAL_PAST[r.modal] ? "mpast" : "mpres" : r.tense + (asp === "prog" ? "prog" : "");
      var ok = key === "pres" ? allowed.pres || asp !== "simple" && allowed.prog : key === "presprog" ? allowed.prog || allowed.pres || allowed.fut : key === "past" || key === "pastprog" ? allowed.past : key === "mpres" ? allowed.fut || allowed.pres || allowed.prog : true;
      r.ok = !!ok;
      return r;
    }
    function beForm(tense, s) {
      var sg3 = !s.pl && (s.p === 3 || s.p === 1);
      if (tense === "past") return sg3 ? "was" : "were";
      if (!s.pl && s.p === 1) return "am";
      return !s.pl && s.p === 3 ? "is" : "are";
    }
    function subjInfo(np) {
      if (!np) return { p: 2, pl: 0 };
      if (np.pron) return { p: PRON[np.pron].p, pl: PRON[np.pron].pl };
      return { p: 3, pl: np.num === "pl" ? 1 : 0 };
    }
    function vpRealize(vp, s, td, marks) {
      var p = [], v = vp.verb, modal = td.modal, sg3 = s.p === 3 && !s.pl;
      var freq = vp.freq ? vp.freq.w : null;
      var rest = function() {
        if (td.asp === "cop") p.push("be");
        else if (td.asp === "prog") p.push("be", Dict.ing(v));
        else if (td.asp === "pass") p.push("be", Dict.pp(v));
        else p.push(Dict.base(v));
      };
      var perfTail = function() {
        if (!v) {
          p.push("been");
          return;
        }
        if (vp.be || td.asp === "prog" || td.asp === "pass") {
          p.push("been", td.asp === "pass" ? Dict.pp(v) : Dict.ing(v));
        } else p.push(Dict.pp(v));
      };
      if (td.perf && !td.semi) {
        if (modal) {
          p.push(vp.neg ? negOf(modal) : modal);
          if (freq) p.push(freq);
          p.push("have");
        } else {
          var hf0 = td.tense === "past" ? "had" : sg3 ? "has" : "have";
          p.push(vp.neg ? negOf(hf0) : hf0);
          if (marks && hf0 === "has" && !vp.neg) marks.push("has");
          if (freq) p.push(freq);
        }
        perfTail();
      } else if (modal) {
        p.push(vp.neg ? negOf(modal) : modal);
        if (freq) p.push(freq);
        rest();
      } else if (td.semi) {
        var sm = SEMI[td.semi];
        if (sm.be) {
          var bf0 = beForm(td.tense, s);
          p.push(vp.neg ? negOf(bf0) : bf0);
          if (marks && bf0 === "is" && !vp.neg) marks.push("is");
          if (freq) p.push(freq);
          p.push("going to");
        } else if (sm.only) {
          if (freq) p.push(freq);
          p.push(vp.neg ? "didn't use to" : "used to");
        } else if (sm.fixed) {
          p.push(vp.neg ? "wouldn't like to" : "would like to");
        } else if (vp.neg) {
          p.push(negOf(td.tense === "past" ? "did" : sg3 ? "does" : "do"));
          if (freq) p.push(freq);
          p.push(sm.b + " to");
        } else {
          if (freq) p.push(freq);
          var hf = td.tense === "past" ? sm.past : sg3 ? sm.s3 || sm.b + "s" : sm.b;
          if (sg3 && td.tense !== "past" && marks) marks.push(hf);
          p.push(hf + " to");
        }
        rest();
      } else if (vp.be || td.progBe) {
        var bf = beForm(td.tense, s);
        p.push(vp.neg ? negOf(bf) : bf);
        if (marks && bf === "is" && !vp.neg) marks.push("is");
        if (freq) p.push(freq);
        if (td.asp === "prog") p.push(Dict.ing(v));
        else if (td.asp === "pass") p.push(Dict.pp(v));
      } else {
        if (vp.neg) {
          p.push(negOf(td.tense === "past" ? "did" : sg3 ? "does" : "do"));
          if (freq) p.push(freq);
          p.push(Dict.base(v));
        } else {
          if (freq) p.push(freq);
          var vf = td.tense === "past" ? Dict.past(v) : sg3 ? Dict.s3(v) : Dict.base(v);
          if (sg3 && td.tense !== "past" && marks) marks.push(vf.split(" ")[0]);
          p.push(vf);
        }
      }
      vp.advs.forEach(function(a) {
        p.push(advText(a));
      });
      return p.join(" ");
    }
    function tokText(t, role) {
      switch (t.t) {
        case "NP":
          return npText(t, role === "obj" ? "obj" : "sub");
        case "AP":
          return apText(t, true);
        default:
          return chunkText(t);
      }
    }
    function evalClause(cl, cfg, sv) {
      var errs = [], s = subjInfo(cl.subj), vp = cl.vp;
      cl.flags.forEach(function(f) {
        errs.push(E_(f, { v: vp.verb ? vp.verb.w : "be" }));
      });
      var times = timeTokens(cl), places = cl.pre.concat(cl.posts, cl.comps).filter(function(t) {
        return t.t === "ADV" && t.ak === "place" || t.t === "PP" && t.cat === "place" || t.t === "ID" && t.ik === "place";
      });
      var TOD = function(t) {
        var x = String(t.w || "");
        return /\b(morning|afternoon|evening|noon|midnight|o'clock|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(x) && !/\b(every|last|next|this|tomorrow|yesterday)\b/.test(x);
      };
      var ao = times.length === 2 && allowedOf(times), okPair = ao && Object.keys(ao).length && TOD(times[0]) !== TOD(times[1]);
      if (times.length > 1 && !okPair || sv && sv.frontTime && times.length) errs.push(E_("dupTime"));
      if (places.length > 1) errs.push(E_("dupPlace"));
      var allowed = allowedOf(times), td = decideTense(vp, allowed, cfg);
      if (!td.ok) {
        var t0 = times[0], a = allowed || {};
        errs.push(E_("tense", { t: t0.w, w: a.past && !a.pres && !a.fut ? "\u904E\u53BB" : a.fut && !a.pres && !a.past ? "\u672A\u6765" : a.pres && !a.past ? "\u3044\u307E\u30FB\u3075\u3060\u3093" : "\u305D\u306E\u6642" }));
      }
      var nfTi = {};
      cl.comps.forEach(function(c, ci) {
        if (c.t === "NF" && vp.verb && vp.verb.cv) {
          var need = vp.verb.cv;
          if (need !== "both" && c.ti !== need) {
            if (cfg.auto.ti) nfTi[ci] = need;
            else errs.push(E_("cv", { v: vp.verb.w, f: need === "to" ? "to + \u52D5\u8A5E" : "\u52D5\u8A5E\u306E -ing" }));
          }
        }
      });
      var postTi = {};
      cl.posts.forEach(function(c, ci) {
        if (c.t === "NF" && c.ti !== "to") {
          if (cfg.auto.ti) postTi[ci] = "to";
          else errs.push(E_("purposeTo"));
        }
      });
      var parts = [], marks = [];
      var preTxt = cl.pre.map(function(t) {
        return tokText(t);
      }).join(" ");
      if (preTxt) parts.push(preTxt + ",");
      if (cl.subj) parts.push(tokText(cl.subj, "sub"));
      parts.push(vpRealize(vp, s, td, marks));
      cl.comps.forEach(function(c, ci) {
        parts.push(c.t === "NF" ? nfText(c, nfTi[ci]) : tokText(c, "obj"));
      });
      cl.posts.forEach(function(c, ci) {
        parts.push(c.t === "NF" ? nfText(c, postTi[ci] || c.ti) : tokText(c, "obj"));
      });
      return { errs, text: parts.join(" "), times: times.length, past: td.tense === "past" || MODAL_PAST[td.modal], marks };
    }
    var SEV = { needSubj: 1, needObj: 1, needComp: 1, needVerb: 1 };
    function sevOf(errs) {
      var s = 0;
      errs.forEach(function(e) {
        s = Math.max(s, SEV[e.code] ? 1 : 2);
      });
      return s;
    }
    function capFirst(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function finishText(s) {
      s = s.replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
      s = capFirst(s);
      s = s.replace(/([?!]) ([a-z])/g, function(m, a, b) {
        return a + " " + b.toUpperCase();
      });
      return s.replace(/\bi\b/g, "I");
    }
    function parse(T, cfg) {
      if (!T.length) return { ok: false, sev: 2, err: E_("order") };
      var alts = parseAll(T, false), best = null;
      alts.forEach(function(a2) {
        if (a2.partial) return;
        var errs = [], texts = [], frontText = "", frontTime = 0, past = false, marks = [];
        if (a2.kind === "CL") {
          var r0 = evalClause(a2.cl, cfg);
          errs = r0.errs;
          var cand = { ok: false, kind: "CL", errs, text: a2.conj.v + " " + r0.text, times: r0.times, alt: a2 };
          cand.sev = sevOf(errs);
          cand.rank = cand.sev * 100 + 50;
          if (!best || cand.rank < best.rank) best = cand;
          return;
        }
        if (a2.front) {
          if (a2.front.tok) {
            var ft = a2.front.tok;
            frontText = ft.t === "CL" ? ft.text + "," : /[?!]$/.test(ft.e.w) ? ft.e.w : ft.e.w + ",";
            frontTime = ft.t === "CL" ? ft.times : 0;
          } else {
            var rf = evalClause(a2.front.cl, cfg);
            errs = errs.concat(rf.errs);
            marks = marks.concat(rf.marks);
            frontText = a2.front.conj.v + " " + rf.text + ",";
            frontTime = rf.times;
          }
        }
        a2.cls.forEach(function(cl, ci) {
          var r = evalClause(cl, cfg, { frontTime: ci === 0 ? frontTime : 0 });
          errs = errs.concat(r.errs);
          texts.push(r.text);
          past = past || r.past;
          marks = marks.concat(r.marks);
        });
        var body = texts[0] + (a2.co ? (a2.co.v === "and" || a2.co.sub ? " " + a2.co.v + " " : ", " + a2.co.v + " ") + texts[1] : "");
        var cand2 = { kind: "S", errs, text: finishText((frontText ? frontText + " " : "") + body + "."), alt: a2, past, marks };
        cand2.sev = sevOf(errs);
        cand2.rank = cand2.sev * 100 + a2.cls[0].pre.length + (a2.front && a2.front.cl ? -a2.front.cl.posts.length * 0.1 : 0);
        if (!best || cand2.rank < best.rank || cand2.sev === best.sev && best.kind === "CL") best = cand2;
      });
      if (!best) {
        if (!T.some(function(t) {
          return t.t === "VP";
        })) return { ok: false, sev: 1, err: E_("needVerb") };
        return { ok: false, sev: 2, err: E_("order") };
      }
      if (best.sev === 0) {
        var a = best.alt, info = { front: !!a.front, clause: !!(a.front && (a.front.cl || a.front.tok && a.front.tok.t === "CL")) || best.kind === "CL" || !!(a.co && a.co.sub), coord: !!(a.co && !a.co.sub), past: !!best.past };
        if (best.kind === "CL") return { ok: true, kind: "CL", text: best.text, times: best.times, info };
        return { ok: true, kind: "S", text: best.text, info, marks: best.marks || [], alt: a };
      }
      return { ok: false, sev: best.sev, err: best.errs.filter(function(e) {
        return (SEV[e.code] ? 1 : 2) === best.sev;
      })[0] || best.errs[0], text: best.text };
    }
    function perms(a) {
      if (a.length <= 1) return [a];
      var out = [];
      a.forEach(function(x, i) {
        perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(function(p) {
          out.push([x].concat(p));
        });
      });
      return out;
    }
    function asChunk(words, cfg) {
      function fit(ws) {
        var q = chainState(ws, cfg);
        if (q.complete && !q.err) return { q, ws };
        if (q.complete) {
          for (var i = 0; i < ws.length; i++) if (ws[i].k === "v") {
            var F = ["base", "past", "pp", "ing"];
            for (var j = 0; j < 4; j++) {
              if (F[j] === (ws[i].f || "base")) continue;
              var c = {};
              for (var key in ws[i]) c[key] = ws[i][key];
              c.f = F[j];
              var w2 = ws.slice();
              w2[i] = c;
              var q2 = chainState(w2, cfg);
              if (q2.complete && !q2.err) return { q: q2, ws: w2 };
            }
          }
        }
        return { q, ws: null };
      }
      var f0 = fit(words), s = f0.q;
      if (f0.ws) return { chunk: s.chunk, prefix: true, words: f0.ws };
      var pre = s.prefix, best = null;
      if (words.length <= 5) perms(words).forEach(function(p) {
        if (best) return;
        var fq = fit(p), q = fq.q;
        if (fq.ws) best = { chunk: q.chunk, prefix: true, words: fq.ws };
        else if (q.prefix) pre = true;
      });
      return best || { chunk: null, prefix: pre };
    }
    function strokeTokens(units, cfg, partial) {
      var out = [], pend = [];
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (pend.length) {
          var s = chainState(pend.concat(u.words), cfg);
          if (s.complete && !s.err) {
            out.push(s.chunk);
            pend = [];
            continue;
          }
          if (s.prefix) {
            pend = pend.concat(u.words);
            continue;
          }
          return null;
        }
        if (u.chunk) {
          if (u.chunk.t === "FR") out = out.concat(u.chunk.parts);
          else out.push(u.chunk);
          continue;
        }
        var s1 = chainState(u.words, cfg);
        if (s1.complete && !s1.err) out.push(s1.chunk);
        else if (s1.prefix) pend = u.words.slice();
        else return null;
      }
      if (pend.length && partial) {
        out.pend = pend;
        return out;
      }
      return pend.length ? null : out;
    }
    function completePend(pend, cfg, samples) {
      for (var i = 0; i < samples.length; i++) {
        var ws = pend.concat(samples[i]);
        for (var k = 1; k <= samples[i].length; k++) {
          var st = chainState(pend.concat(samples[i].slice(0, k)), cfg);
          if (st.complete && !st.err) return st.chunk;
        }
      }
      return null;
    }
    function viable(T, strict) {
      if (!T.length) return true;
      var alts = parseAll(T, true);
      if (!strict) return alts.length > 0;
      return alts.some(function(a) {
        if (a.partial) return true;
        var cls = (a.cls || (a.cl ? [a.cl] : [])).concat(a.front && a.front.cl ? [a.front.cl] : []);
        return !cls.some(function(c) {
          return c.flags.some(function(f) {
            return !SEV[f];
          });
        });
      });
    }
    function makeFrag(T) {
      var words = [];
      T.forEach(function(t) {
        words = words.concat(t.words || []);
      });
      return { t: "FR", words, parts: T.slice() };
    }
    function makeClause(T, res) {
      var words = [];
      T.forEach(function(t) {
        words = words.concat(t.words || []);
      });
      return { t: "CL", words, parts: T.slice(), text: res.text, times: res.times || 0 };
    }
    function wordCount(T) {
      var n = 0;
      T.forEach(function(t) {
        if (t.t === "CL") n += wordCount(t.parts);
        else (t.words || []).forEach(function(w) {
          n += w.k === "idm" ? w.e.w.split(" ").length : 1;
        });
      });
      return n;
    }
    return {
      PRON,
      PREP_G,
      MODALS,
      SEMIS,
      SEMI,
      TP_CYCLE,
      DEGS,
      CONJ_SUB,
      CONJ_CO,
      QUANTS,
      MSG,
      codeOf,
      chainState,
      strokeTokens,
      asChunk,
      canAppend,
      tryInsert,
      rebuild,
      cycleWord,
      cyclable,
      chunkText,
      label,
      wordText,
      gloss,
      parse,
      viable,
      makeClause,
      makeFrag,
      completePend,
      wordCount,
      err: E_,
      mergePron,
      isCount
    };
  })();

  // games/punichunk/src/seed_data.js
  var SEED_DATA = [
    "2^\u308F\u305F\u3057\u306F\u6559\u5BA4\u306B\u7740\u3044\u305F\u3002^pr:i/v:arrive|past/prep:in det:the n:classroom",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8A71\u3059\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:talk|base/prep:at det:the n:supermarket",
    "2^\u308F\u305F\u3057\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8D70\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:run|base/prep:at det:the n:supermarket",
    "1^\u304B\u308C\u306F\u6BCE\u671D\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:he/v:jump|base/idm:every_morning",
    "3^\u304B\u306E\u3058\u3087\u306F\u4F53\u80B2\u9928\u3067\u304F\u3060\u3082\u306E\u3092\u5B89\u5168\u306B\u8CB7\u3063\u3066\u3044\u308B\u3002^pr:she/be:pres v:buy|ing/n:fruit/adv:safely/prep:in det:the n:gym",
    "2^\u30B1\u30F3\u306F\u4ECA\u591C\u65C5\u884C\u3059\u308B\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:travel|ing/adv:tonight",
    "3^\u7537\u306E\u5B50\u306F\u99C5\u3067\u6D3B\u52D5\u3092\u3084\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:do|base/det:a n:activity/prep:at det:the n:station",
    "3^\u30DF\u30AB\u306F\u7A7A\u6E2F\u3067\u690D\u7269\u3092\u304B\u3093\u305F\u3093\u306B\u5B88\u308B\u3002^n:Mika/v:protect|base/det:a n:plant/adv:easily/prep:at det:the n:airport",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u75C5\u9662\u3067\u9774\u3092\u306F\u304F\u3002^pr:they/v:wear|base/n:shoe|pl/prep:at det:the n:hospital/adv:now",
    "2^\u5148\u751F\u306F\u671D\u306B\u3053\u3053\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:teacher/v:jump|past/adv:here/prep:in det:the n:morning",
    "3^\u306D\u3053\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6559\u5BA4\u3067\u6CE3\u304F\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:cry|base/prep:in det:the n:classroom/idm:this_afternoon",
    "2^\u306D\u3053\u306F\u6771\u4EAC\u3067\u8D70\u3063\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:run|ing/prep:in n:Tokyo",
    "2^\u5973\u306E\u5B50\u306F\u5F15\u304D\u51FA\u3057\u3092\u9589\u3081\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:close|base/det:a n:drawer",
    "2^\u30B1\u30F3\u306F\u6BCE\u65E5\u4F1A\u793E\u3067\u6B69\u304F\u3002^n:Ken/v:walk|base/prep:at det:the n:office/idm:every_day",
    "2^\u7537\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u304F\u3089\u3084\u307F\u3067\u76F4\u3059\u3002^det:the n:boy/v:fix|base/pr:i n:phone/idm:in_the_dark",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u7A7A\u6E2F\u3067\u30D1\u30B8\u30E3\u30DE\u3092\u7740\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:wear|base/n:pajamas/prep:at det:the n:airport/adv:tomorrow",
    "2^\u5148\u751F\u306F7\u6642\u306B\u4F1A\u793E\u3067\u52DD\u3063\u305F\u3002^det:the n:teacher/v:win|past/prep:at det:the n:office/idm:at_seven",
    "3^\u53CB\u3060\u3061\u306F\u6B21\u306F\u6D77\u8FBA\u3067\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:friend|pl/v:check|base/det:a n:email/prep:on det:the n:beach/idm:next_time",
    "2^\u3042\u306A\u305F\u306F\u3066\u3044\u306D\u3044\u306B\u50CD\u3044\u3066\u3044\u308B\u3002^pr:you/be:pres v:work|ing/adv:politely",
    "2^\u53CB\u3060\u3061\u306F\u884C\u304F\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:go|base",
    "1^\u30DF\u30AB\u306F\u6628\u65E5\u5BDD\u305F\u3002^n:Mika/v:sleep|past/adv:yesterday",
    "2^\u5973\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u50CD\u304F\u3002^det:the n:girl/v:work|base/prep:in det:the n:gym",
    "2^\u5148\u751F\u306F\u5EAD\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^det:the n:teacher/v:chill|base/prep:in det:the n:garden",
    "2^\u72AC\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u6CE3\u304F\u3002^det:the n:dog/v:cry|base/prep:at det:the n:supermarket",
    "3^\u53CB\u3060\u3061\u306F\u671D\u306B\u30B3\u30FC\u30D2\u30FC\u3092\u8CB7\u3046\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:buy|base/n:coffee/prep:in det:the n:morning",
    "2^\u5148\u751F\u306F\u6BCE\u671D\u7BB1\u3092\u904B\u3076\u3002^det:the n:teacher/v:carry|base/det:the n:box/idm:every_morning",
    "3^\u304B\u306E\u3058\u3087\u306F\u660E\u65E5\u516C\u5712\u3067\u7BB1\u3092\u958B\u3051\u308B\u4E88\u5B9A\u3060\u3002^pr:she/be:pres v:open|ing/det:the n:box/prep:in det:the n:park/adv:tomorrow",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u65E5\u6D77\u8FBA\u3067\u624B\u52A9\u3051\u3092\u3044\u3063\u3057\u3087\u306B\u3057\u305F\u3002^pr:we/v:give|past/n:help/adv:together/prep:on det:the n:beach/adv:yesterday",
    "2^\u30B1\u30F3\u306F\u516C\u5712\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^n:Ken/v:relax|base/prep:in det:the n:park",
    "1^\u304B\u306E\u3058\u3087\u306F\u4E00\u65E5\u3058\u3085\u3046\u53EB\u3093\u3060\u3002^pr:she/v:shout|past/idm:all_day",
    "2^\u53CB\u3060\u3061\u306F\u6765\u9031\u6642\u9593\u3069\u304A\u308A\u306B\u6CF3\u3050\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:swim|ing/idm:on_time/idm:next_week",
    "3^\u306D\u3053\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u9774\u3092\u6012\u3063\u3066\u306A\u304F\u3059\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:lose|base/n:shoe|pl/adv:angrily/prep:at det:the n:restaurant",
    "2^\u304B\u308C\u3089\u306F\u5DDD\u306E\u305D\u3070\u3067\u62DB\u5F85\u72B6\u3092\u9001\u3063\u305F\u3002^pr:they/v:send|past/det:the n:invitation/prep:by det:the n:river",
    "2^\u308F\u305F\u3057\u306F\u99C5\u3067\u30EA\u30E5\u30C3\u30AF\u3092\u904B\u3093\u3060\u3002^pr:i/v:carry|past/det:a n:backpack/prep:at det:the n:station",
    "1^\u304A\u7236\u3055\u3093\u306F\u8FD1\u304F\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:dad/v:jump|base/idm:close_by",
    "2^\u304A\u7236\u3055\u3093\u306F\u591C\u306B\u3042\u305D\u3053\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:dad/v:smile|past/adv:there/prep:at n:night",
    "1^\u5148\u751F\u306F2\u6642\u9593\u53EB\u3093\u3060\u3002^det:the n:teacher/v:shout|past/idm:for_two_hours",
    "3^\u53CB\u3060\u3061\u306F\u5EAD\u3067\u68EE\u6797\u3092\u5B88\u3063\u305F\u3002^pr:i n:friend|pl/v:protect|past/det:a n:forest/prep:in det:the n:garden",
    "3^\u30B1\u30F3\u306F\u671D\u306B\u3042\u305D\u3053\u3067\u30B9\u30AB\u30FC\u30C8\u3092\u306F\u3051\u308B\u3002^n:Ken/modal:can v:wear|base/det:a n:skirt/adv:there/prep:in det:the n:morning",
    "1^\u30B1\u30F3\u306F\u697D\u3057\u305D\u3046\u306B\u307B\u307B\u3048\u3080\u3002^n:Ken/v:smile|base/adv:happily",
    "2^\u308F\u305F\u3057\u306F2\u6642\u9593\u5DDD\u306E\u305D\u3070\u3067\u697D\u3057\u305D\u3046\u306B\u8E0A\u3063\u305F\u3002^pr:i/v:dance|past/adv:happily/prep:by det:the n:river/idm:for_two_hours",
    "2^\u72AC\u306F\u6765\u9031\u8D70\u308B\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:run|ing/idm:next_week",
    "1^\u30DF\u30AB\u306F\u3082\u3046\u3059\u3050\u8A71\u3059\u3002^n:Mika/v:talk|base/adv:soon",
    "3^\u30B1\u30F3\u306F\u5148\u9031\u75C5\u9662\u3067\u30DA\u30F3\u3092\u501F\u308A\u305F\u3002^n:Ken/v:borrow|past/det:a n:pen/prep:at det:the n:hospital/idm:last_week",
    "3^\u3042\u306A\u305F\u306F\u516C\u5712\u3067\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u3059\u3070\u3084\u304F\u4E57\u3063\u305F\u3002^pr:you/v:ride|past/det:a n:scooter/adv:quickly/prep:in det:the n:park",
    "2^\u304A\u7236\u3055\u3093\u306F\u6771\u4EAC\u3067\u8E0A\u3063\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:dance|ing/prep:in n:Tokyo",
    "1^\u30DF\u30AB\u306F\u8FD1\u304F\u3067\u96A0\u308C\u305F\u3002^n:Mika/v:hide|past/adv:nearby",
    "2^\u53CB\u3060\u3061\u306F\u5DDD\u306E\u305D\u3070\u3067\u5BDD\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:sleep|ing/prep:by det:the n:river",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4F53\u80B2\u9928\u3067\u30D0\u30A4\u30AF\u306B\u4E57\u308B\u3002^pr:i n:mom/v:ride|base/det:a n:motorcycle/prep:in det:the n:gym",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u591C\u5B66\u6821\u3067\u79D8\u5BC6\u57FA\u5730\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u4F5C\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:build|ing/det:a n:fort/idm:in_time/idm:at_school/adv:tonight",
    "3^\u306D\u3053\u306F2\u6642\u9593\u75C5\u9662\u3067\u3082\u3046\u4E00\u5EA6\u6CE3\u3044\u305F\u3002^det:the n:cat/v:cry|past/adv:again/prep:at det:the n:hospital/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u671D\u30DA\u30F3\u3092\u3042\u3052\u3089\u308C\u305F\u3002^pr:we/modal:could v:give|base/det:a n:pen/idm:every_morning",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u591C\u6025\u3050\u3060\u308D\u3046\u3002^pr:they/modal:will v:hurry|base/adv:tonight",
    "2^\u30B1\u30F3\u306F\u4ECA\u671D\u6D77\u8FBA\u3067\u304B\u3093\u305F\u3093\u306B\u5BDD\u305F\u3002^n:Ken/v:sleep|past/adv:easily/prep:on det:the n:beach/idm:this_morning",
    "2^\u7537\u306E\u5B50\u306F\u524D\u56DE\u306F\u5C4B\u6839\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u76F4\u3057\u305F\u3002^det:the n:boy/v:fix|past/det:a n:roof/idm:in_time/idm:last_time",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5BB6\u3067\u5BDD\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:sleep|ing/idm:at_home",
    "2^\u30DF\u30AB\u306F\u6D77\u3078\u65C5\u884C\u3059\u308B\u3002^n:Mika/v:travel|base/prep:to det:the n:beach",
    "2^\u308F\u305F\u3057\u306F\u3053\u3053\u3067\u304B\u3055\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:i/v:bring|past/det:a n:umbrella/adv:here",
    "2^\u306D\u3053\u306F\u5EAD\u3067\u4F11\u3093\u3060\u3002^det:the n:cat/v:rest|past/prep:in det:the n:garden",
    "2^\u304B\u306E\u3058\u3087\u306F\u5DDD\u3078\u65C5\u884C\u3057\u305F\u3002^pr:she/v:travel|past/prep:to det:the n:river",
    "1^\u304B\u308C\u306F7\u6642\u306B\u7740\u304F\u3002^pr:he/v:arrive|base/idm:at_seven",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u65E5\u4F1A\u793E\u3078\u65C5\u884C\u3059\u308B\u3002^pr:we/v:travel|base/prep:to det:the n:office/idm:every_day",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u8D08\u308A\u7269\u3092\u89AA\u5207\u306B\u6301\u3063\u3066\u304F\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:bring|base/det:a n:gift/adv:kindly",
    "1^\u304B\u306E\u3058\u3087\u306F\u4ECA\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:she/v:chill|base/adv:now",
    "1^\u306D\u3053\u306F\u4ECA\u6025\u3050\u3002^det:the n:cat/v:hurry|base/adv:now",
    "3^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u99C5\u3067\u5065\u5EB7\u3092\u5B88\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:protect|ing/n:health/prep:at det:the n:station/idm:this_afternoon",
    "3^\u306D\u3053\u306F\u6765\u9031\u30AB\u30D5\u30A7\u3067\u8D70\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:run|base/prep:at det:the n:cafe/idm:next_week",
    "2^\u304B\u308C\u306F\u8E0A\u3063\u3066\u3044\u308B\u3002^pr:he/be:pres v:dance|ing",
    "1^\u30B1\u30F3\u306F\u304A\u8336\u3092\u3072\u305D\u304B\u306B\u4F5C\u3063\u305F\u3002^n:Ken/v:make|past/n:tea/adv:secretly",
    "2^\u72AC\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u6B69\u304F\u3002^det:the n:dog/v:walk|base/prep:at det:the n:supermarket",
    "3^\u53CB\u3060\u3061\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u30B5\u30F3\u30C9\u30A4\u30C3\u30C1\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:make|ing/det:a n:sandwich/prep:in pr:i n:room",
    "2^\u3042\u306A\u305F\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:you/v:chill|base/prep:at det:the n:supermarket",
    "2^\u308F\u305F\u3057\u306F\u4F1A\u793E\u3067\u3082\u3046\u4E00\u5EA6\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:i/v:chill|past/adv:again/prep:at det:the n:office",
    "3^\u5148\u751F\u306F\u5EAD\u3067\u8D08\u308A\u7269\u3092\u3042\u3052\u308B\u3002^det:the n:teacher/v:give|base/det:a n:gift/prep:in det:the n:garden",
    "1^\u304B\u306E\u3058\u3087\u306F\u5B8C\u307A\u304D\u306B\u4F11\u3093\u3060\u3002^pr:she/v:rest|past/adv:perfectly",
    "1^\u5148\u751F\u306F\u5B66\u6821\u3067\u96A0\u308C\u305F\u3002^det:the n:teacher/v:hide|past/idm:at_school",
    "3^\u7537\u306E\u5B50\u306F\u53F0\u6240\u3067\u304B\u3070\u3093\u3092\u6301\u3063\u3066\u6765\u305F\u3002^det:the n:boy/v:bring|past/det:a n:bag/prep:in det:the n:kitchen",
    "2^\u3042\u306A\u305F\u306F7\u6642\u306B\u30B9\u30FC\u30D1\u30FC\u3067\u30E9\u30F3\u30C1\u3092\u6301\u3063\u3066\u304F\u308B\u3002^pr:you/v:bring|base/n:lunch/prep:at det:the n:supermarket/idm:at_seven",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u53F0\u6240\u3067\u3044\u3064\u3082\u53EB\u3076\u3002^pr:i n:mom/adv:always v:shout|base/prep:in det:the n:kitchen",
    "1^\u306D\u3053\u306F7\u6642\u306B\u8E0A\u3063\u305F\u3002^det:the n:cat/v:dance|past/idm:at_seven",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u4F1A\u793E\u3078\u305F\u304F\u3055\u3093\u65C5\u884C\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:travel|ing/idm:a_lot/prep:to det:the n:office/adv:tomorrow",
    "2^\u5148\u751F\u306F\u4ECA\u591C\u307E\u3061\u304C\u3044\u3092\u898B\u3064\u3051\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/be:pres v:find|ing/det:a n:mistake/adv:tonight",
    "3^\u72AC\u306F\u4ECA\u4F53\u80B2\u9928\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u304F\u3002^det:the n:dog/v:follow|base/det:the n:bus/prep:in det:the n:gym/adv:now",
    "2^\u5148\u751F\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u53EB\u3076\u3002^det:the n:teacher/v:shout|base/prep:in pr:i n:room",
    "3^\u304A\u7236\u3055\u3093\u306F\u5DDD\u306E\u305D\u3070\u3067\u9854\u3092\u898B\u305F\u3002^pr:i n:dad/v:see|past/det:a n:face/prep:by det:the n:river",
    "1^\u53CB\u3060\u3061\u306F\u3084\u3055\u3057\u304F\u7B11\u3063\u305F\u3002^pr:i n:friend|pl/v:laugh|past/adv:softly",
    "3^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u4E57\u3063\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:ride|ing/det:a n:scooter/prep:in det:the n:classroom",
    "3^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u5DDD\u306E\u305D\u3070\u3067\u9854\u3092\u898B\u308B\u3002^n:Ken/v:see|base/det:a n:face/prep:by det:the n:river/adv:soon",
    "2^\u30DF\u30AB\u306F\u30C6\u30FC\u30D6\u30EB\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u4F5C\u308B\u3002^n:Mika/v:make|base/det:a n:table/idm:in_time",
    "3^\u304A\u7236\u3055\u3093\u306F\u7A7A\u6E2F\u3067\u3086\u3063\u304F\u308A\u8D70\u3063\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:run|ing/adv:slowly/prep:at det:the n:airport",
    "3^\u7537\u306E\u5B50\u306F\u524D\u56DE\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u725B\u4E73\u3092\u8CB7\u3063\u305F\u3002^det:the n:boy/v:buy|past/n:milk/prep:in pr:i n:room/idm:last_time",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u4F1A\u793E\u3067\u8ECA\u3092\u4F7F\u3046\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:use|base/det:the n:car/prep:at det:the n:office/adv:tomorrow",
    "2^\u30B1\u30F3\u306F2\u6642\u9593\u6559\u5BA4\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Ken/v:relax|past/prep:in det:the n:classroom/idm:for_two_hours",
    "2^\u304B\u306E\u3058\u3087\u306F\u6628\u591C\u53D6\u3063\u624B\u3092\u3044\u3063\u3057\u3087\u306B\u5F15\u3044\u305F\u3002^pr:she/v:pull|past/det:a n:handle/adv:together/idm:last_night",
    "1^\u304A\u6BCD\u3055\u3093\u306F2\u6642\u9593\u6CE3\u3044\u305F\u3002^pr:i n:mom/v:cry|past/idm:for_two_hours",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u7740\u304F\u3002^pr:i n:mom/v:arrive|base/idm:this_afternoon",
    "2^\u72AC\u306F\u52D5\u7269\u5712\u3067\u8FD1\u304F\u3067\u8E0A\u308B\u3002^det:the n:dog/v:dance|base/adv:nearby/prep:at det:the n:zoo",
    "2^\u72AC\u306F7\u6642\u306B\u307E\u3093\u304C\u6620\u753B\u3092\u898B\u308B\u3002^det:the n:dog/v:watch|base/det:a n:cartoon/idm:at_seven",
    "1^\u304B\u306E\u3058\u3087\u306F\u98DF\u3079\u7269\u3092\u904B\u3093\u3060\u3002^pr:she/v:carry|past/n:food",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5BB6\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:chill|base/idm:at_home",
    "2^\u304A\u7236\u3055\u3093\u306F\u6B21\u306F\u7BB1\u3092\u9589\u3081\u308B\u3002^pr:i n:dad/v:close|base/det:the n:box/idm:next_time",
    "3^\u304A\u7236\u3055\u3093\u306F\u591C\u306B\u4F1A\u793E\u3067\u30CA\u30A4\u30D5\u3092\u4F7F\u3046\u3002^pr:i n:dad/v:use|base/det:a n:knife/prep:at det:the n:office/prep:at n:night",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u5E97\u3067\u30EA\u30B9\u30C8\u3092\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:check|ing/det:a n:list/adv:again/prep:at det:the n:store",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5EAD\u3067\u53EB\u3093\u3067\u3044\u308B\u3002^pr:i n:mom/be:pres v:shout|ing/prep:in det:the n:garden",
    "3^\u53CB\u3060\u3061\u306F\u5148\u9031\u56F3\u66F8\u9928\u3067\u5199\u771F\u3092\u64AE\u3063\u305F\u3002^pr:i n:friend|pl/v:take|past/det:a n:photo/prep:in det:the n:library/idm:last_week",
    "2^\u3042\u306A\u305F\u306F\u3082\u3046\u3059\u3050\u8CEA\u554F\u3092\u3059\u308B\u3002^pr:you/v:ask|base/det:a n:question/adv:soon",
    "2^\u3042\u306A\u305F\u306F\u304A\u8336\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^pr:you/be:pres v:make|ing/n:tea",
    "2^\u72AC\u306F\u4E00\u65E5\u3058\u3085\u3046\u4F53\u80B2\u9928\u3067\u6CE3\u3044\u305F\u3002^det:the n:dog/v:cry|past/prep:in det:the n:gym/idm:all_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30D0\u30B9\u306B\u4E57\u3063\u305F\u3002^pr:i n:mom/v:ride|past/det:the n:bus",
    "2^\u304B\u308C\u3089\u306F\u8CEA\u554F\u3092\u3059\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:ask|base/det:a n:question",
    "3^\u304A\u7236\u3055\u3093\u306F\u99C5\u3067\u81EA\u7136\u3092\u5B88\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:protect|base/n:nature/prep:at det:the n:station",
    "2^\u53CB\u3060\u3061\u306F\u4F1A\u793E\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:relax|base/prep:at det:the n:office",
    "3^\u5148\u751F\u306F\u5148\u9031\u4F1A\u793E\u3067\u5236\u670D\u3092\u7740\u305F\u3002^det:the n:teacher/v:wear|past/det:a n:uniform/prep:at det:the n:office/idm:last_week",
    "3^\u304B\u306E\u3058\u3087\u306F2\u6642\u9593\u53F0\u6240\u3067\u30D1\u30EC\u30FC\u30C9\u3092\u898B\u305F\u3002^pr:she/v:watch|past/det:a n:parade/prep:in det:the n:kitchen/idm:for_two_hours",
    "2^\u30B1\u30F3\u306F\u6BCE\u65E5\u82B1\u3092\u6301\u3063\u3066\u6765\u305F\u3002^n:Ken/v:bring|past/det:a n:flower/idm:every_day",
    "2^\u304B\u308C\u3089\u306F\u6642\u9593\u3069\u304A\u308A\u306B\u306E\u3093\u3073\u308A\u3057\u3066\u3044\u308B\u3002^pr:they/be:pres v:relax|ing/idm:on_time",
    "2^\u304B\u308C\u306F\u75C5\u9662\u3067\u9053\u5177\u3092\u904B\u3093\u3060\u3002^pr:he/v:carry|past/det:a n:tool/prep:at det:the n:hospital",
    "2^\u53CB\u3060\u3061\u306F\u91CE\u83DC\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u58F2\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:sell|base/n:vegetables/idm:on_time",
    "2^\u3042\u306A\u305F\u306F\u4F1A\u793E\u3067\u96A0\u308C\u308B\u3002^pr:you/v:hide|base/prep:at det:the n:office",
    "2^\u53CB\u3060\u3061\u306F\u5730\u4E0B\u9244\u306B\u4E57\u308B\u3002^pr:i n:friend|pl/v:ride|base/det:a n:subway",
    "3^\u306D\u3053\u306F\u4ECA\u591C\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres v:relax|ing/prep:in pr:i n:room/adv:tonight",
    "2^\u308F\u305F\u3057\u306F\u99C5\u3067\u8E0A\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:dance|base/prep:at det:the n:station",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u68EE\u3067\u96A0\u308C\u308B\u3002^pr:we/v:hide|base/prep:in det:the n:forest",
    "2^\u7537\u306E\u5B50\u306F\u8CEA\u554F\u3092\u7A81\u7136\u3057\u305F\u3002^det:the n:boy/v:ask|past/det:a n:question/adv:suddenly",
    "2^\u306D\u3053\u306F\u4EE5\u524D\u306F\u8E0A\u3063\u3066\u3044\u305F\u3002^det:the n:cat/sm:used_to v:dance|base",
    "3^\u304A\u7236\u3055\u3093\u306F\u6628\u65E5\u30AB\u30D5\u30A7\u3067\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u4E57\u3063\u305F\u3002^pr:i n:dad/v:ride|past/det:a n:scooter/prep:at det:the n:cafe/adv:yesterday",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u591C\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^pr:we/be:pres v:cry|ing/adv:tonight",
    "1^\u7537\u306E\u5B50\u306F\u4E0B\u624B\u306B\u5BDD\u305F\u3002^det:the n:boy/v:sleep|past/adv:badly",
    "2^\u30DF\u30AB\u306F7\u6642\u306B\u5DDD\u306E\u305D\u3070\u3067\u8E0A\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:dance|base/prep:by det:the n:river/idm:at_seven",
    "2^\u30B1\u30F3\u306F\u4ECA\u65E5\u52D5\u7269\u5712\u3067\u8E0A\u3063\u305F\u3002^n:Ken/v:dance|past/prep:at det:the n:zoo/adv:today",
    "1^\u304B\u308C\u3089\u306F\u6BCE\u671D\u7A81\u7136\u8E0A\u308B\u3002^pr:they/v:dance|base/adv:suddenly/idm:every_morning",
    "2^\u72AC\u306F\u5BB6\u3067\u8ECA\u306B\u3064\u3044\u3066\u3044\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:follow|ing/det:the n:car/idm:at_home",
    "2^\u5973\u306E\u5B50\u306F\u8FD1\u304F\u3067\u5BDD\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:sleep|ing/idm:close_by",
    "1^\u30B1\u30F3\u306F\u4ECA\u671D\u96A0\u308C\u305F\u3002^n:Ken/v:hide|past/idm:this_morning",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6D77\u8FBA\u3067\u4F11\u3080\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:rest|base/prep:on det:the n:beach",
    "2^\u3042\u306A\u305F\u306F\u5EAD\u3067\u3048\u3093\u3074\u3064\u3092\u501F\u308A\u308B\u3002^pr:you/v:borrow|base/det:a n:pencil/prep:in det:the n:garden",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3044\u3059\u3092\u3082\u3046\u4E00\u5EA6\u76F4\u3057\u305F\u3002^pr:we/v:fix|past/det:a n:chair/adv:again",
    "2^\u30B1\u30F3\u306F\u304F\u3089\u3084\u307F\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^n:Ken/modal:will v:walk|base/idm:in_the_dark",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u56F3\u66F8\u9928\u3067\u8CEA\u554F\u3092\u3059\u3070\u3084\u304F\u3059\u308B\u3002^pr:we/v:ask|base/det:a n:question/adv:quickly/prep:in det:the n:library/adv:today",
    "2^\u30DF\u30AB\u306F7\u6642\u306B\u6559\u5BA4\u3067\u6012\u3063\u3066\u307E\u3063\u305F\u308A\u3059\u308B\u3002^n:Mika/v:chill|base/adv:angrily/prep:in det:the n:classroom/idm:at_seven",
    "3^\u308F\u305F\u3057\u306F\u6BCE\u9031\u6771\u4EAC\u3067\u30C9\u30EC\u30B9\u3092\u3064\u3044\u306B\u4EE5\u524D\u306F\u4F5C\u3063\u3066\u3044\u305F\u3002^pr:i/sm:used_to v:make|base/det:a n:dress/adv:finally/prep:in n:Tokyo/idm:every_week",
    "2^\u72AC\u306F\u52D5\u7269\u5712\u3078\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:come|base/prep:to det:the n:zoo",
    "1^\u7537\u306E\u5B50\u306F\u4ECA\u884C\u304F\u3002^det:the n:boy/v:go|base/adv:now",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u591C\u96A0\u308C\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:hide|ing/adv:tonight",
    "2^\u306D\u3053\u306F\u3055\u3063\u304D\u6771\u4EAC\u3067\u52DD\u3063\u305F\u3002^det:the n:cat/v:win|past/prep:in n:Tokyo/idm:just_now",
    "1^\u304A\u7236\u3055\u3093\u306F\u6642\u9593\u3069\u304A\u308A\u306B\u52DD\u3064\u3002^pr:i n:dad/v:win|base/idm:on_time",
    "3^\u7537\u306E\u5B50\u306F\u6771\u4EAC\u3067\u30CE\u30FC\u30C8\u3092\u501F\u308A\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:borrow|ing/det:a n:notebook/prep:in n:Tokyo",
    "2^\u308F\u305F\u3057\u306F\u5DDD\u306E\u305D\u3070\u3067\u50CD\u3044\u305F\u3002^pr:i/v:work|past/prep:by det:the n:river",
    "1^\u308F\u305F\u3057\u306F\u7A81\u7136\u7740\u304F\u3002^pr:i/v:arrive|base/adv:suddenly",
    "3^\u308F\u305F\u3057\u306F\u771F\u591C\u4E2D\u306B\u516C\u5712\u3067\u304A\u91D1\u3092\u4EE5\u524D\u306F\u898B\u3064\u3051\u3066\u3044\u305F\u3002^pr:i/sm:used_to v:find|base/n:money/prep:in det:the n:park/prep:at n:midnight",
    "2^\u308F\u305F\u3057\u306F\u75C5\u9662\u3067\u7B11\u3063\u305F\u3002^pr:i/v:laugh|past/prep:at det:the n:hospital",
    "2^\u30B1\u30F3\u306F\u6771\u4EAC\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u3066\u3044\u308B\u3002^n:Ken/be:pres v:feed|ing/n:fish/prep:in n:Tokyo",
    "2^\u5148\u751F\u306F\u30D0\u30B9\u505C\u3067\u8E0A\u308B\u3002^det:the n:teacher/v:dance|base/prep:at det:the n:bus_stop",
    "2^\u7537\u306E\u5B50\u306F\u591C\u306B\u5199\u771F\u3092\u64AE\u308B\u3002^det:the n:boy/v:take|base/det:a n:photo/prep:at n:night",
    "1^\u304A\u6BCD\u3055\u3093\u306F2\u65E5\u524D\u8A71\u3057\u305F\u3002^pr:i n:mom/v:talk|past/idm:two_days_ago",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u4F11\u3080\u3002^pr:we/v:rest|base/prep:in pr:i n:room/adv:now",
    "3^\u304B\u308C\u306F\u6628\u591C\u30AB\u30D5\u30A7\u3067\u6C34\u3092\u3044\u3063\u3057\u3087\u306B\u904B\u3093\u3060\u3002^pr:he/v:carry|past/n:water/adv:together/prep:at det:the n:cafe/idm:last_night",
    "2^\u30DF\u30AB\u306F\u6BCE\u65E5\u30E1\u30FC\u30EB\u306B\u8FD4\u4FE1\u3059\u308B\u3002^n:Mika/v:answer|base/det:a n:email/idm:every_day",
    "2^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u89AA\u5207\u306B\u52DD\u3063\u305F\u3002^pr:i n:friend|pl/v:win|past/adv:kindly/idm:all_day",
    "1^\u3042\u306A\u305F\u306F2\u65E5\u524D\u98DF\u3079\u7269\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:you/v:bring|past/n:food/idm:two_days_ago",
    "2^\u306D\u3053\u306F\u6628\u591C\u8A66\u5408\u3092\u898B\u305F\u3002^det:the n:cat/v:watch|past/det:a n:match/idm:last_night",
    "2^\u53CB\u3060\u3061\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u6B69\u3044\u305F\u3002^pr:i n:friend|pl/v:walk|past/prep:at det:the n:restaurant",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u6765\u308B\u3002^pr:we/v:come|base/adv:now",
    "1^\u304A\u7236\u3055\u3093\u306F\u3088\u304F\u8D70\u308B\u3002^pr:i n:dad/adv:often v:run|base",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u30B9\u30FC\u30D1\u30FC\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:win|base/prep:at det:the n:supermarket/adv:tomorrow",
    "3^\u5973\u306E\u5B50\u306F\u6765\u9031\u3053\u3053\u3067\u8B1B\u6F14\u8005\u3092\u5F97\u610F\u3052\u306B\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^det:the n:girl/be:pres v:invite|ing/det:a n:speaker/adv:proudly/adv:here/idm:next_week",
    "3^\u304A\u7236\u3055\u3093\u306F\u6BCE\u65E5\u5DDD\u306E\u305D\u3070\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u8D70\u3063\u305F\u3002^pr:i n:dad/v:run|past/idm:in_time/prep:by det:the n:river/idm:every_day",
    "2^\u5148\u751F\u306F\u524D\u56DE\u306F\u30AB\u30D5\u30A7\u3067\u8E0A\u3063\u305F\u3002^det:the n:teacher/v:dance|past/prep:at det:the n:cafe/idm:last_time",
    "1^\u304B\u306E\u3058\u3087\u306F\u5148\u9031\u6025\u3044\u3060\u3002^pr:she/v:hurry|past/idm:last_week",
    "2^\u7537\u306E\u5B50\u306F\u5148\u9031\u4F1A\u793E\u3067\u8A71\u3057\u305F\u3002^det:the n:boy/v:talk|past/prep:at det:the n:office/idm:last_week",
    "1^\u304A\u7236\u3055\u3093\u306F\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:i n:dad/v:chill|past",
    "3^\u72AC\u306F\u3055\u3063\u304D\u5E97\u3067\u8A66\u5408\u3092\u898B\u305F\u3002^det:the n:dog/v:watch|past/det:a n:match/prep:at det:the n:store/idm:just_now",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u65E5\u8FD1\u304F\u3067\u52DD\u3063\u305F\u3002^pr:we/v:win|past/idm:close_by/adv:yesterday",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u99C5\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:i n:mom/v:relax|past/prep:at det:the n:station",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u524D\u56DE\u306F\u4F1A\u793E\u3067\u7B11\u3063\u305F\u3002^pr:i n:mom/v:laugh|past/prep:at det:the n:office/idm:last_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u3042\u305D\u3053\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u58F2\u308B\u3002^pr:i n:dad/v:sell|base/det:the n:computer/adv:there/adv:now",
    "2^\u5148\u751F\u306F\u9053\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:build|ing/det:the n:road",
    "2^\u53CB\u3060\u3061\u306F\u51B7\u8535\u5EAB\u3092\u9759\u304B\u306B\u958B\u3051\u305F\u3002^pr:i n:friend|pl/v:open|past/det:a n:fridge/adv:quietly",
    "2^\u7537\u306E\u5B50\u306F\u3055\u3063\u304D\u98DF\u3079\u7269\u3092\u904B\u3093\u3060\u3002^det:the n:boy/v:carry|past/n:food/idm:just_now",
    "2^\u304B\u308C\u306F\u6BCE\u65E5\u81EA\u8EE2\u8ECA\u3092\u4E0B\u624B\u306B\u76F4\u3057\u305F\u3002^pr:he/v:fix|past/det:a n:bicycle/adv:badly/idm:every_day",
    "2^\u304A\u7236\u3055\u3093\u306F2\u65E5\u524D\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u501F\u308A\u305F\u3002^pr:i n:dad/v:borrow|past/det:a n:laptop/idm:two_days_ago",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5BB6\u3067\u4E0B\u624B\u306B\u307B\u307B\u3048\u3093\u3067\u3044\u308B\u3002^pr:i n:mom/be:pres v:smile|ing/adv:badly/idm:at_home",
    "2^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u6771\u4EAC\u3067\u91CE\u83DC\u3092\u8CB7\u3063\u305F\u3002^n:Ken/v:buy|past/n:vegetables/prep:in n:Tokyo/idm:last_time",
    "2^\u3042\u306A\u305F\u306F\u99C5\u3067\u96A0\u308C\u3066\u3044\u308B\u3002^pr:you/be:pres v:hide|ing/prep:at det:the n:station",
    "3^\u306D\u3053\u306F\u5DDD\u306E\u305D\u3070\u3067\u672C\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:cat/v:find|past/det:a n:book/prep:by det:the n:river",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u671D\u5EAD\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u4E0B\u624B\u306B\u8FD4\u4FE1\u3057\u305F\u3002^pr:we/v:answer|past/det:a n:message/adv:badly/prep:in det:the n:garden/idm:this_morning",
    "2^\u304B\u308C\u306F\u6BCE\u65E5\u3042\u305D\u3053\u3067\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u3092\u4F7F\u3046\u3002^pr:he/v:use|base/det:a n:credit_card/adv:there/idm:every_day",
    "2^\u304B\u308C\u306F\u99C5\u3067\u304B\u3070\u3093\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:he/v:have|past/det:a n:bag/prep:at det:the n:station",
    "3^\u5148\u751F\u306F\u5DDD\u306E\u305D\u3070\u3067\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u304F\u3089\u3084\u307F\u3067\u4E57\u308B\u3002^det:the n:teacher/v:ride|base/det:a n:scooter/idm:in_the_dark/prep:by det:the n:river",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u591C\u30AB\u30D5\u30A7\u3067\u5BDD\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:sleep|base/prep:at det:the n:cafe/adv:tonight",
    "1^\u304B\u306E\u3058\u3087\u306F\u6BCE\u65E5\u6CF3\u3050\u3002^pr:she/v:swim|base/idm:every_day",
    "2^\u53CB\u3060\u3061\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6025\u3052\u305F\u3002^pr:i n:friend|pl/modal:could v:hurry|base/prep:in pr:i n:room",
    "1^\u308F\u305F\u3057\u306F\u6B21\u306F\u3053\u3053\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i/v:jump|base/adv:here/idm:next_time",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5EAD\u3067\u8D70\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:run|base/prep:in det:the n:garden",
    "2^\u304A\u7236\u3055\u3093\u306F\u5C01\u7B52\u3092\u5B89\u5168\u306B\u4EE5\u524D\u306F\u9589\u3058\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:close|base/det:a n:envelope/adv:safely",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u3059\u3070\u3084\u304F\u65C5\u884C\u3057\u305F\u3002^pr:i n:mom/v:travel|past/adv:quickly",
    "2^\u72AC\u306F\u6771\u4EAC\u3067\u4EE5\u524D\u306F\u6CE3\u3044\u3066\u3044\u305F\u3002^det:the n:dog/sm:used_to v:cry|base/prep:in n:Tokyo",
    "2^\u5148\u751F\u306F\u56F3\u66F8\u9928\u3067\u3059\u3070\u3084\u304F\u8D70\u3063\u305F\u3002^det:the n:teacher/v:run|past/adv:quickly/prep:in det:the n:library",
    "1^\u30B1\u30F3\u306F\u6628\u65E5\u5BDD\u305F\u3002^n:Ken/v:sleep|past/adv:yesterday",
    "2^\u72AC\u306F\u53F0\u6240\u3078\u884C\u304F\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:go|base/prep:to det:the n:kitchen",
    "3^\u30B1\u30F3\u306F\u4ECA\u65E5\u30AB\u30D5\u30A7\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u4F7F\u3046\u3060\u308D\u3046\u3002^n:Ken/modal:will v:use|base/pr:i n:phone/prep:at det:the n:cafe/adv:today",
    "3^\u308F\u305F\u3057\u306F\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u3044\u3064\u3082\u6620\u753B\u3092\u898B\u308B\u3002^pr:i/adv:always v:see|base/det:a n:movie/prep:in pr:i n:room",
    "2^\u30B1\u30F3\u306F\u56F3\u66F8\u9928\u3067\u3073\u3093\u3092\u9589\u3081\u308B\u3002^n:Ken/v:close|base/det:a n:bottle/prep:in det:the n:library",
    "3^\u306D\u3053\u306F\u30AB\u30D5\u30A7\u3067\u65B9\u6CD5\u3092\u898B\u3064\u3051\u308B\u3002^det:the n:cat/v:find|base/det:a n:way/prep:at det:the n:cafe",
    "3^\u306D\u3053\u306F\u4ECA\u65E5\u4F1A\u793E\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:win|base/prep:at det:the n:office/adv:today",
    "2^\u304B\u308C\u3089\u306F\u6765\u9031\u5BB6\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:have|base/det:the n:computer/idm:at_home/idm:next_week",
    "3^\u30B1\u30F3\u306F\u6765\u9031\u7A7A\u6E2F\u3067\u3066\u3044\u306D\u3044\u306B\u7B11\u3046\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:laugh|ing/adv:politely/prep:at det:the n:airport/idm:next_week",
    "1^\u304A\u6BCD\u3055\u3093\u306F2\u65E5\u524D\u4F11\u3093\u3060\u3002^pr:i n:mom/v:rest|past/idm:two_days_ago",
    "2^\u3042\u306A\u305F\u306F\u6D77\u8FBA\u3067\u4F11\u3080\u3002^pr:you/v:rest|base/prep:on det:the n:beach",
    "2^\u306D\u3053\u306F\u4E0B\u624B\u306B\u6CE3\u3044\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:cry|ing/adv:badly",
    "3^\u308F\u305F\u3057\u306F\u6BCE\u65E5\u5E97\u3067\u7B54\u3048\u3092\u898B\u3064\u3051\u305F\u3002^pr:i/v:find|past/det:a n:answer/prep:at det:the n:store/idm:every_day",
    "2^\u306D\u3053\u306F\u6559\u5BA4\u3067\u6025\u3044\u3067\u3044\u308B\u3002^det:the n:cat/be:pres v:hurry|ing/prep:in det:the n:classroom",
    "2^\u304A\u7236\u3055\u3093\u306F\u8CEA\u554F\u3092\u3084\u3055\u3057\u304F\u3057\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:ask|ing/det:a n:question/adv:softly",
    "3^\u308F\u305F\u3057\u306F\u4ECA\u516C\u5712\u3067\u30B7\u30E3\u30C4\u3092\u7740\u308B\u3002^pr:i/v:wear|base/det:a n:shirt/prep:in det:the n:park/adv:now",
    "2^\u3042\u306A\u305F\u306F\u52D5\u7269\u5712\u3067\u5730\u56F3\u3092\u4F7F\u3046\u3002^pr:you/v:use|base/det:a n:map/prep:at det:the n:zoo",
    "2^\u5148\u751F\u306F\u4ECA\u671D\u304A\u3082\u3061\u3083\u3092\u5F97\u610F\u3052\u306B\u3042\u3052\u305F\u3002^det:the n:teacher/v:give|past/det:a n:toy/adv:proudly/idm:this_morning",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u30D0\u30B9\u505C\u3067\u81EA\u8EE2\u8ECA\u306B\u4E57\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:ride|base/det:a n:bike/prep:at det:the n:bus_stop/prep:at n:night",
    "2^\u304B\u306E\u3058\u3087\u306F2\u65E5\u524D\u5E97\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:she/v:shop|past/prep:at det:the n:store/idm:two_days_ago",
    "2^\u72AC\u306F\u4F1A\u793E\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^det:the n:dog/v:relax|base/prep:at det:the n:office",
    "2^\u308F\u305F\u3057\u306F\u5BB6\u3067\u8A71\u3057\u3066\u3044\u308B\u3002^pr:i/be:pres v:talk|ing/idm:at_home",
    "2^\u304B\u308C\u3089\u306F\u6765\u9031\u68EE\u3067\u6025\u3050\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:hurry|ing/prep:in det:the n:forest/idm:next_week",
    "1^\u308F\u305F\u3057\u306F\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u305F\u3002^pr:i/v:watch|past/det:a n:concert",
    "2^\u304B\u306E\u3058\u3087\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u53EB\u3076\u3002^pr:she/v:shout|base/prep:in pr:i n:room",
    "2^\u308F\u305F\u3057\u306F\u53F0\u6240\u3067\u305B\u3063\u3051\u3093\u3092\u4F7F\u3046\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:use|base/n:soap/prep:in det:the n:kitchen",
    "2^\u308F\u305F\u3057\u306F\u30AB\u30D5\u30A7\u3067\u98DF\u3079\u7269\u3092\u904B\u3076\u3002^pr:i/v:carry|base/n:food/prep:at det:the n:cafe",
    "2^\u5148\u751F\u306F\u68EE\u3067\u4EE5\u524D\u306F\u7B11\u3063\u3066\u3044\u305F\u3002^det:the n:teacher/sm:used_to v:laugh|base/prep:in det:the n:forest",
    "3^\u72AC\u306F\u6628\u65E5\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u30AB\u30E1\u30E9\u3092\u6301\u3063\u3066\u3044\u305F\u3002^det:the n:dog/v:have|past/det:a n:camera/prep:in pr:i n:room/adv:yesterday",
    "2^\u304B\u306E\u3058\u3087\u306F2\u6642\u9593\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u5BBF\u984C\u3092\u3084\u3063\u305F\u3002^pr:she/v:do|past/n:homework/prep:in pr:i n:room/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6771\u4EAC\u3067\u30AB\u30E1\u30E9\u3092\u501F\u308A\u308B\u3002^pr:we/v:borrow|base/det:a n:camera/prep:in n:Tokyo",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u75C5\u9662\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i/v:smile|past/prep:at det:the n:hospital/adv:today",
    "3^\u53CB\u3060\u3061\u306F\u3055\u3063\u304D\u53F0\u6240\u3067\u7D75\u3092\u58F2\u3063\u305F\u3002^pr:i n:friend|pl/v:sell|past/det:a n:painting/prep:in det:the n:kitchen/idm:just_now",
    "2^\u5148\u751F\u306F\u99C5\u3067\u5BDD\u305F\u3002^det:the n:teacher/v:sleep|past/prep:at det:the n:station",
    "2^\u72AC\u306F2\u6642\u9593\u3042\u305D\u3053\u3067\u96A0\u308C\u305F\u3002^det:the n:dog/v:hide|past/adv:there/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3053\u3053\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u4F7F\u3063\u305F\u3002^pr:we/v:use|past/pr:i n:phone/adv:here",
    "1^\u308F\u305F\u3057\u306F\u524D\u56DE\u306F\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:i/v:jump|past/idm:last_time",
    "1^\u5148\u751F\u306F\u5BB6\u3067\u7B11\u3063\u305F\u3002^det:the n:teacher/v:laugh|past/idm:at_home",
    "3^\u5148\u751F\u306F\u6708\u66DC\u65E5\u306B\u30C9\u30A2\u3092\u4EE5\u524D\u306F\u9589\u3081\u3066\u3044\u305F\u3002^det:the n:teacher/sm:used_to v:close|base/det:the n:door/prep:on n:Monday",
    "3^\u72AC\u306F\u99C5\u3067\u30DA\u30F3\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^det:the n:dog/be:pres v:lose|ing/det:a n:pen/prep:at det:the n:station",
    "2^\u304B\u308C\u306F\u6BCE\u671D\u4F9D\u983C\u306B\u5FDC\u3058\u305F\u3002^pr:he/v:answer|past/det:a n:request/idm:every_morning",
    "1^\u5148\u751F\u306F\u3082\u3046\u3059\u3050\u8CB7\u3044\u7269\u3059\u308B\u3002^det:the n:teacher/v:shop|base/adv:soon",
    "3^\u72AC\u306F\u591C\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u4ED5\u4E8B\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:dog/v:find|past/det:a n:job/prep:in pr:i n:room/prep:at n:night",
    "2^\u304A\u6BCD\u3055\u3093\u306F7\u6642\u306B\u7A7A\u6E2F\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:i n:mom/v:chill|past/prep:at det:the n:airport/idm:at_seven",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u53F0\u6240\u3067\u3064\u3065\u308A\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i/v:check|base/n:spelling/prep:in det:the n:kitchen/adv:now",
    "2^\u304B\u306E\u3058\u3087\u306F\u30D0\u30B9\u505C\u3067\u6B69\u3044\u305F\u3002^pr:she/v:walk|past/prep:at det:the n:bus_stop",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u6771\u4EAC\u3067\u7B11\u3063\u305F\u3002^pr:we/v:laugh|past/prep:in n:Tokyo/adv:today",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u65E5\u56F3\u66F8\u9928\u3067\u690D\u7269\u3092\u5B88\u308B\u3002^pr:we/v:protect|base/det:a n:plant/prep:in det:the n:library/idm:every_day",
    "3^\u5973\u306E\u5B50\u306F\u5DDD\u306E\u305D\u3070\u3067\u7B54\u3048\u3092\u5B89\u5168\u306B\u898B\u3064\u3051\u305F\u3002^det:the n:girl/v:find|past/det:a n:answer/adv:safely/prep:by det:the n:river",
    "2^\u53CB\u3060\u3061\u306F\u6559\u5BA4\u3067\u8E0A\u3063\u305F\u3002^pr:i n:friend|pl/v:dance|past/prep:in det:the n:classroom",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u671D\u306B\u6D3B\u52D5\u3092\u3084\u3063\u305F\u3002^pr:we/v:do|past/det:a n:activity/prep:in det:the n:morning",
    "2^\u5973\u306E\u5B50\u306F\u53F0\u6240\u3067\u7B11\u3063\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:laugh|ing/prep:in det:the n:kitchen",
    "2^\u72AC\u306F\u6771\u4EAC\u3067\u52DD\u3063\u305F\u3002^det:the n:dog/v:win|past/prep:in n:Tokyo",
    "2^\u30B1\u30F3\u306F\u3055\u3063\u304D\u5DDD\u306E\u305D\u3070\u3067\u8A71\u3057\u305F\u3002^n:Ken/v:talk|past/prep:by det:the n:river/idm:just_now",
    "2^\u30B1\u30F3\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u6B69\u3044\u3066\u3044\u308B\u3002^n:Ken/be:pres v:walk|ing/prep:at det:the n:restaurant",
    "2^\u30DF\u30AB\u306F7\u6642\u306B\u5B9D\u98FE\u54C1\u3092\u58F2\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:sell|base/n:jewelry/idm:at_seven",
    "2^\u304A\u7236\u3055\u3093\u306F\u4E00\u65E5\u3058\u3085\u3046\u96FB\u8ECA\u306B\u4E57\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:ride|base/det:the n:train/idm:all_day",
    "1^\u30B1\u30F3\u306F2\u65E5\u524D\u30E9\u30F3\u30C1\u3092\u4F5C\u3063\u305F\u3002^n:Ken/v:make|past/n:lunch/idm:two_days_ago",
    "2^\u304B\u306E\u3058\u3087\u306F\u99C5\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u76F4\u3057\u305F\u3002^pr:she/v:fix|past/pr:i n:phone/prep:at det:the n:station",
    "2^\u7537\u306E\u5B50\u306F\u5B89\u5168\u306B\u5BDD\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:sleep|base/adv:safely",
    "2^\u304B\u308C\u3089\u306F\u6771\u4EAC\u3067\u8ECA\u3092\u58F2\u308B\u3002^pr:they/v:sell|base/det:the n:car/prep:in n:Tokyo",
    "2^\u304A\u6BCD\u3055\u3093\u306F2\u6642\u9593\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u305F\u3002^pr:i n:mom/v:feed|past/n:fish/idm:for_two_hours",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u30C9\u30A2\u3092\u958B\u3051\u3089\u308C\u305F\u3002^pr:i n:dad/modal:could v:open|base/det:the n:door/prep:at det:the n:restaurant/idm:this_afternoon",
    "2^\u30DF\u30AB\u306F\u6B21\u306F\u68EE\u3067\u6025\u3050\u3002^n:Mika/v:hurry|base/prep:in det:the n:forest/idm:next_time",
    "1^\u306D\u3053\u306F\u6BCE\u65E5\u5BDD\u308B\u3002^det:the n:cat/v:sleep|base/idm:every_day",
    "3^\u304A\u7236\u3055\u3093\u306F\u524D\u56DE\u306F\u4F1A\u793E\u3067\u304A\u91D1\u3092\u898B\u3064\u3051\u305F\u3002^pr:i n:dad/v:find|past/n:money/prep:at det:the n:office/idm:last_time",
    "3^\u30B1\u30F3\u306F\u6628\u65E5\u53F0\u6240\u3067\u7B54\u3048\u3092\u898B\u3064\u3051\u305F\u3002^n:Ken/v:find|past/det:a n:answer/prep:in det:the n:kitchen/adv:yesterday",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u671D\u5B66\u6821\u3067\u82B1\u3092\u8CB7\u3063\u305F\u3002^pr:i n:dad/v:buy|past/det:a n:flower/idm:at_school/idm:this_morning",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u5B66\u6821\u3067\u50CD\u3044\u305F\u3002^pr:i n:mom/v:work|past/idm:at_school",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u671D\u306B\u6559\u5BA4\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^pr:we/v:relax|base/prep:in det:the n:classroom/prep:in det:the n:morning",
    "2^\u3042\u306A\u305F\u306F7\u6642\u306B\u7A32\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u690D\u3048\u308B\u3002^pr:you/v:plant|base/det:a n:rice_plant/idm:in_time/idm:at_seven",
    "3^\u7537\u306E\u5B50\u306F\u6628\u65E5\u53F0\u6240\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u50CD\u3044\u305F\u3002^det:the n:boy/v:work|past/idm:in_time/prep:in det:the n:kitchen/adv:yesterday",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6B21\u306F\u5E97\u3067\u30EA\u30B9\u30C8\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:mom/v:check|base/det:a n:list/prep:at det:the n:store/idm:next_time",
    "2^\u30B1\u30F3\u306F\u4F1A\u793E\u3067\u4F11\u3080\u3002^n:Ken/v:rest|base/prep:at det:the n:office",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u5915\u65B9\u306B\u52D5\u7269\u5712\u3067\u4EE5\u524D\u306F\u6CE3\u3044\u3066\u3044\u305F\u3002^pr:we/sm:used_to v:cry|base/prep:at det:the n:zoo/prep:in det:the n:evening",
    "1^\u5148\u751F\u306F\u304B\u3093\u305F\u3093\u306B\u52DD\u3063\u305F\u3002^det:the n:teacher/v:win|past/adv:easily",
    "1^\u30DF\u30AB\u306F\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^n:Mika/v:invite|past/det:a n:speaker",
    "2^\u7537\u306E\u5B50\u306F\u5148\u9031\u516C\u5712\u3067\u5BDD\u305F\u3002^det:the n:boy/v:sleep|past/prep:in det:the n:park/idm:last_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u6BCE\u65E5\u53F0\u6240\u3067\u6CF3\u3050\u3002^pr:she/v:swim|base/prep:in det:the n:kitchen/idm:every_day",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u3082\u3046\u3059\u3050\u6B69\u304F\u3002^pr:i n:mom/v:walk|base/adv:soon",
    "3^\u306D\u3053\u306F\u6559\u5BA4\u3067\u30AB\u30E1\u30E9\u3092\u904B\u3093\u3060\u3002^det:the n:cat/v:carry|past/det:a n:camera/prep:in det:the n:classroom",
    "2^\u308F\u305F\u3057\u306F\u3055\u3063\u304D\u5BB6\u3067\u8CB7\u3044\u7269\u3067\u304D\u305F\u3002^pr:i/modal:could v:shop|base/idm:at_home/idm:just_now",
    "3^\u5973\u306E\u5B50\u306F\u6559\u5BA4\u3067\u30C6\u30FC\u30D6\u30EB\u3092\u4F5C\u3063\u305F\u3002^det:the n:girl/v:make|past/det:a n:table/prep:in det:the n:classroom",
    "2^\u306D\u3053\u306F\u516C\u5712\u3067\u5F97\u610F\u3052\u306B\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:cat/v:jump|past/adv:proudly/prep:in det:the n:park",
    "2^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u4F53\u80B2\u9928\u3067\u8E0A\u3063\u305F\u3002^n:Ken/v:dance|past/prep:in det:the n:gym/idm:last_time",
    "2^\u53CB\u3060\u3061\u306F7\u6642\u306B\u6559\u5BA4\u3067\u52DD\u3064\u3002^pr:i n:friend|pl/v:win|base/prep:in det:the n:classroom/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u8B1B\u6F14\u8005\u3092\u8FD1\u304F\u3067\u62DB\u5F85\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:invite|base/det:a n:speaker/idm:close_by",
    "3^\u304A\u7236\u3055\u3093\u306F\u30D0\u30B9\u505C\u3067\u96FB\u8ECA\u306B\u4E57\u308B\u3002^pr:i n:dad/v:ride|base/det:the n:train/prep:at det:the n:bus_stop",
    "1^\u30B1\u30F3\u306F2\u6642\u9593\u6025\u3044\u3060\u3002^n:Ken/v:hurry|past/idm:for_two_hours",
    "3^\u7537\u306E\u5B50\u306F\u53F0\u6240\u3067\u3075\u3060\u3093\u77ED\u30D1\u30F3\u3092\u306F\u304F\u3002^det:the n:boy/adv:usually v:wear|base/n:shorts/prep:in det:the n:kitchen",
    "2^\u5973\u306E\u5B50\u306F7\u6642\u306B\u30AB\u30D5\u30A7\u3067\u8E0A\u308B\u3002^det:the n:girl/v:dance|base/prep:at det:the n:cafe/idm:at_seven",
    "2^\u30B1\u30F3\u306F\u4E00\u65E5\u3058\u3085\u3046\u5EAD\u3067\u6025\u3050\u3060\u308D\u3046\u3002^n:Ken/modal:will v:hurry|base/prep:in det:the n:garden/idm:all_day",
    "1^\u5148\u751F\u306F\u3082\u3046\u3059\u3050\u7B11\u3046\u3002^det:the n:teacher/v:laugh|base/adv:soon",
    "2^\u308F\u305F\u3057\u306F\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u6CF3\u3050\u3002^pr:i/v:swim|base/prep:in pr:i n:room",
    "2^\u304A\u7236\u3055\u3093\u306F\u591C\u306B\u5BB6\u3067\u4F11\u3080\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:rest|base/idm:at_home/prep:at n:night",
    "1^\u5148\u751F\u306F\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:teacher/v:chill|past",
    "2^\u53CB\u3060\u3061\u306F\u591C\u306B\u304F\u3060\u3082\u306E\u3092\u58F2\u308B\u3002^pr:i n:friend|pl/v:sell|base/n:fruit/prep:at n:night",
    "2^\u304B\u308C\u3089\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u53EB\u3076\u3060\u308D\u3046\u3002^pr:they/modal:will v:shout|base/prep:at det:the n:restaurant",
    "2^\u7537\u306E\u5B50\u306F\u56F3\u66F8\u9928\u3067\u6B69\u304F\u3002^det:the n:boy/v:walk|base/prep:in det:the n:library",
    "2^\u30B1\u30F3\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u76BF\u3092\u6D17\u3046\u3002^n:Ken/v:do|base/det:the n:dishes/prep:in pr:i n:room",
    "1^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u6B69\u304F\u3002^pr:he/v:walk|base/adv:soon",
    "2^\u3042\u306A\u305F\u306F\u6559\u5BA4\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:you/v:relax|past/prep:in det:the n:classroom",
    "2^\u304A\u7236\u3055\u3093\u306F\u591C\u306B\u6765\u308B\u3002^pr:i n:dad/v:come|base/prep:at n:night",
    "2^\u72AC\u306F\u6628\u65E5\u76EE\u3092\u5B88\u3063\u305F\u3002^det:the n:dog/v:protect|past/det:a n:eye/adv:yesterday",
    "3^\u304B\u308C\u306F\u671D\u306B\u6D77\u8FBA\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:he/v:chill|base/prep:on det:the n:beach/prep:in det:the n:morning",
    "2^\u7537\u306E\u5B50\u306F\u8155\u6642\u8A08\u3092\u3082\u3046\u4E00\u5EA6\u76F4\u3059\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:fix|base/det:a n:watch/adv:again",
    "2^\u304A\u7236\u3055\u3093\u306F\u6D77\u8FBA\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:i n:dad/v:jump|past/prep:on det:the n:beach",
    "2^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u68EE\u3067\u98DF\u3079\u7269\u3092\u904B\u3076\u3002^n:Ken/v:carry|base/n:food/prep:in det:the n:forest/adv:soon",
    "2^\u30B1\u30F3\u306F\u3055\u3063\u304D\u6559\u5BA4\u3067\u50CD\u3044\u305F\u3002^n:Ken/v:work|past/prep:in det:the n:classroom/idm:just_now",
    "2^\u308F\u305F\u3057\u306F\u5BB6\u3067\u30AB\u30FC\u30C9\u3092\u4F5C\u308B\u3002^pr:i/v:make|base/det:a n:card/idm:at_home",
    "1^\u72AC\u306F\u4ECA\u671D\u6B69\u3044\u305F\u3002^det:the n:dog/v:walk|past/idm:this_morning",
    "2^\u308F\u305F\u3057\u306F\u6BCE\u671D\u81EA\u8EE2\u8ECA\u3092\u8FD1\u304F\u3067\u76F4\u3059\u3002^pr:i/v:fix|base/det:a n:bike/idm:close_by/idm:every_morning",
    "3^\u5148\u751F\u306F\u75C5\u9662\u3067\u5C4B\u6839\u3092\u76F4\u3059\u3002^det:the n:teacher/v:fix|base/det:a n:roof/prep:at det:the n:hospital",
    "2^\u304B\u308C\u306F2\u65E5\u524D\u30B9\u30FC\u30D1\u30FC\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:he/v:jump|past/prep:at det:the n:supermarket/idm:two_days_ago",
    "3^\u5973\u306E\u5B50\u306F2\u6642\u9593\u4F53\u80B2\u9928\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u3082\u3046\u4E00\u5EA6\u4F7F\u3048\u305F\u3002^det:the n:girl/modal:could v:use|base/det:a n:laptop/adv:again/prep:in det:the n:gym/idm:for_two_hours",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:i n:mom/v:chill|past",
    "3^\u30DF\u30AB\u306F\u3082\u3046\u3059\u3050\u56F3\u66F8\u9928\u3067\u304B\u3070\u3093\u3092\u306A\u304F\u3059\u3002^n:Mika/v:lose|base/det:a n:bag/prep:in det:the n:library/adv:soon",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u671D\u5F97\u610F\u3052\u306B\u7740\u304F\u3002^pr:i n:mom/v:arrive|base/adv:proudly/idm:every_morning",
    "3^\u304B\u308C\u3089\u306F\u671D\u306B\u30D0\u30B9\u505C\u3078\u884C\u304F\u3002^pr:they/v:go|base/prep:to det:the n:bus_stop/prep:in det:the n:morning",
    "2^\u30B1\u30F3\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u5BDD\u3066\u3044\u308B\u3002^n:Ken/be:pres v:sleep|ing/prep:at det:the n:restaurant",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:mom/v:smile|past/adv:today",
    "2^\u3042\u306A\u305F\u306F\u6765\u9031\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:feed|base/n:fish/idm:next_week",
    "2^\u30B1\u30F3\u306F\u56F3\u66F8\u9928\u3067\u7384\u95A2\u306E\u547C\u3073\u51FA\u3057\u306B\u5FDC\u3058\u305F\u3002^n:Ken/v:answer|past/det:the n:door/prep:in det:the n:library",
    "2^\u5973\u306E\u5B50\u306F\u3042\u305D\u3053\u3067\u5BB6\u3092\u898B\u305F\u3002^det:the n:girl/v:see|past/det:a n:house/adv:there",
    "2^\u304A\u7236\u3055\u3093\u306F\u6B21\u306F\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u4E57\u308B\u3002^pr:i n:dad/v:ride|base/det:a n:scooter/idm:next_time",
    "1^\u30DF\u30AB\u306F\u6BCE\u671D\u884C\u304F\u3002^n:Mika/v:go|base/idm:every_morning",
    "2^\u308F\u305F\u3057\u306F\u3075\u3060\u3093\u30D7\u30EC\u30BC\u30F3\u30C8\u3092\u3042\u3052\u308B\u3002^pr:i/adv:usually v:give|base/det:a n:present",
    "2^\u304B\u308C\u3089\u306F\u52D5\u7269\u5712\u3067\u307B\u307B\u3048\u3080\u3002^pr:they/v:smile|base/prep:at det:the n:zoo",
    "3^\u304A\u7236\u3055\u3093\u306F\u3082\u3046\u3059\u3050\u5E97\u3067\u30AB\u30FC\u30C9\u3092\u3042\u3052\u308B\u3002^pr:i n:dad/v:give|base/det:a n:card/prep:at det:the n:store/adv:soon",
    "2^\u3042\u306A\u305F\u306F7\u6642\u306B\u4F9D\u983C\u306B\u5FDC\u3058\u308B\u3002^pr:you/v:answer|base/det:a n:request/idm:at_seven",
    "1^\u30DF\u30AB\u306F\u3084\u3055\u3057\u304F\u5BDD\u308B\u3002^n:Mika/v:sleep|base/adv:softly",
    "3^\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u68EE\u3067\u91CE\u83DC\u3092\u58F2\u308B\u3002^pr:i n:friend|pl/v:sell|base/n:vegetables/prep:in det:the n:forest/idm:every_day",
    "2^\u3042\u306A\u305F\u306F\u68EE\u3067\u6CE3\u304F\u3002^pr:you/v:cry|base/prep:in det:the n:forest",
    "3^\u304B\u306E\u3058\u3087\u306F\u4ECA\u591C\u68EE\u3067\u30B1\u30FC\u30AD\u3092\u6301\u3063\u3066\u304F\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:bring|base/det:a n:cake/prep:in det:the n:forest/adv:tonight",
    "1^\u308F\u305F\u3057\u306F\u3044\u3064\u3082\u305F\u304F\u3055\u3093\u7B11\u3046\u3002^pr:i/adv:always v:laugh|base/idm:a_lot",
    "3^\u7537\u306E\u5B50\u306F\u671D\u306B\u5B66\u6821\u3067\u5199\u771F\u3092\u4EE5\u524D\u306F\u9001\u3063\u3066\u3044\u305F\u3002^det:the n:boy/sm:used_to v:send|base/det:a n:photo/idm:at_school/prep:in det:the n:morning",
    "3^\u53CB\u3060\u3061\u306F7\u6642\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u5730\u56F3\u3092\u3059\u3070\u3084\u304F\u4F7F\u3046\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:use|base/det:a n:map/adv:quickly/prep:in pr:i n:room/idm:at_seven",
    "1^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u8FD1\u304F\u3067\u8A71\u3057\u305F\u3002^n:Mika/v:talk|past/adv:nearby/idm:all_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5148\u9031\u5B66\u6821\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:mom/v:smile|past/idm:at_school/idm:last_week",
    "1^\u53CB\u3060\u3061\u306F\u6B21\u306F\u306E\u3093\u3073\u308A\u3059\u308B\u3002^pr:i n:friend|pl/v:relax|base/idm:next_time",
    "2^\u308F\u305F\u3057\u306F\u6BCE\u65E5\u30D0\u30B9\u505C\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:i/v:chill|base/prep:at det:the n:bus_stop/idm:every_day",
    "1^\u7537\u306E\u5B50\u306F\u5148\u9031\u50CD\u3044\u305F\u3002^det:the n:boy/v:work|past/idm:last_week",
    "2^\u72AC\u306F\u6559\u5BA4\u3067\u8E0A\u308B\u3002^det:the n:dog/v:dance|base/prep:in det:the n:classroom",
    "2^\u304B\u308C\u306F\u6B21\u306F\u99C5\u3067\u30D1\u30B8\u30E3\u30DE\u3092\u7740\u308B\u3002^pr:he/v:wear|base/n:pajamas/prep:at det:the n:station/idm:next_time",
    "2^\u30DF\u30AB\u306F\u56F3\u66F8\u9928\u3067\u9053\u5177\u3092\u904B\u3076\u3002^n:Mika/v:carry|base/det:a n:tool/prep:in det:the n:library",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u30D0\u30B9\u505C\u3067\u53EB\u3093\u3067\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:shout|ing/prep:at det:the n:bus_stop/adv:now",
    "2^\u3042\u306A\u305F\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u4EE5\u524D\u306F\u6025\u3044\u3067\u3044\u305F\u3002^pr:you/sm:used_to v:hurry|base/prep:at det:the n:supermarket",
    "2^\u5973\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u8D08\u308A\u7269\u3092\u3042\u3052\u308B\u3002^det:the n:girl/v:give|base/det:a n:gift/adv:soon",
    "2^\u3042\u306A\u305F\u306F\u52D5\u7269\u5712\u3067\u8C46\u3092\u690D\u3048\u305F\u3002^pr:you/v:plant|past/det:a n:bean/prep:at det:the n:zoo",
    "2^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u7D75\u3092\u898B\u305F\u3002^det:the n:dog/v:see|past/det:a n:picture/idm:this_afternoon",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65C5\u884C\u3057\u3066\u3044\u308B\u3002^pr:we/be:pres v:travel|ing/adv:now",
    "3^\u5148\u751F\u306F\u660E\u65E5\u4F53\u80B2\u9928\u3078\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:come|base/prep:to det:the n:gym/adv:tomorrow",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u671D\u6559\u5BA4\u3067\u8CEA\u554F\u306B\u3082\u3046\u4E00\u5EA6\u7B54\u3048\u308B\u3002^pr:we/v:answer|base/det:a n:question/adv:again/prep:in det:the n:classroom/idm:every_morning",
    "2^\u30DF\u30AB\u306F\u6771\u4EAC\u3067\u8ECA\u3092\u4F7F\u3046\u3060\u308D\u3046\u3002^n:Mika/modal:will v:use|base/det:the n:car/prep:in n:Tokyo",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u52D5\u7269\u5712\u3067\u8D70\u3063\u305F\u3002^pr:i/v:run|past/prep:at det:the n:zoo/adv:today",
    "2^\u308F\u305F\u3057\u306F\u56F3\u66F8\u9928\u3067\u96A0\u308C\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:hide|base/prep:in det:the n:library",
    "2^\u3042\u306A\u305F\u306F\u5148\u9031\u304B\u3055\u3092\u958B\u3044\u305F\u3002^pr:you/v:open|past/det:a n:umbrella/idm:last_week",
    "2^\u72AC\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u96A0\u308C\u308B\u3002^det:the n:dog/v:hide|base/prep:at det:the n:supermarket",
    "1^\u304B\u308C\u306F2\u65E5\u524D\u6CE3\u3044\u305F\u3002^pr:he/v:cry|past/idm:two_days_ago",
    "2^\u5148\u751F\u306F\u3082\u3046\u3059\u3050\u30B7\u30E3\u30F3\u30D7\u30FC\u3092\u304F\u3089\u3084\u307F\u3067\u4F7F\u3046\u3002^det:the n:teacher/v:use|base/n:shampoo/idm:in_the_dark/adv:soon",
    "2^\u304B\u306E\u3058\u3087\u306F\u6771\u4EAC\u3067\u98DF\u3079\u7269\u3092\u3086\u3063\u304F\u308A\u904B\u3093\u3060\u3002^pr:she/v:carry|past/n:food/adv:slowly/prep:in n:Tokyo",
    "1^\u304B\u308C\u3089\u306F\u3053\u3053\u3067\u50CD\u304F\u3002^pr:they/v:work|base/adv:here",
    "2^\u7537\u306E\u5B50\u306F\u671D\u306B\u6765\u308B\u3002^det:the n:boy/v:come|base/prep:in det:the n:morning",
    "2^\u306D\u3053\u306F\u4ECA\u65E5\u5B89\u5168\u306B\u5BDD\u305F\u3002^det:the n:cat/v:sleep|past/adv:safely/adv:today",
    "1^\u5973\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u8A71\u3057\u305F\u3002^det:the n:girl/v:talk|past/idm:all_day",
    "2^\u304B\u308C\u306F\u6628\u65E5\u3044\u3059\u3092\u4F5C\u3063\u305F\u3002^pr:he/v:make|past/det:a n:chair/adv:yesterday",
    "2^\u7537\u306E\u5B50\u306F\u52D5\u7269\u5712\u3067\u6CF3\u3050\u3002^det:the n:boy/v:swim|base/prep:at det:the n:zoo",
    "2^\u3042\u306A\u305F\u306F\u6771\u4EAC\u3067\u4F11\u3093\u3067\u3044\u308B\u3002^pr:you/be:pres v:rest|ing/prep:in n:Tokyo",
    "3^\u5973\u306E\u5B50\u306F\u4ECA\u65E5\u4F53\u80B2\u9928\u3067\u8155\u6642\u8A08\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^det:the n:girl/be:pres v:lose|ing/det:a n:watch/prep:in det:the n:gym/adv:today",
    "2^\u3042\u306A\u305F\u306F\u5DDD\u306E\u305D\u3070\u3067\u304F\u3060\u3082\u306E\u3092\u8CB7\u3046\u3060\u308D\u3046\u3002^pr:you/modal:will v:buy|base/n:fruit/prep:by det:the n:river",
    "3^\u72AC\u306F\u5E97\u3067\u8FD1\u304F\u3067\u8E0A\u308C\u308B\u3002^det:the n:dog/modal:can v:dance|base/idm:close_by/prep:at det:the n:store",
    "2^\u30DF\u30AB\u306F\u6BCE\u65E5\u7384\u95A2\u306E\u547C\u3073\u51FA\u3057\u306B\u5FDC\u3058\u308B\u3002^n:Mika/v:answer|base/det:the n:door/idm:every_day",
    "2^\u72AC\u306F\u591C\u306B\u5287\u3092\u898B\u305F\u3002^det:the n:dog/v:watch|past/det:a n:play/prep:at n:night",
    "3^\u304B\u308C\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u3066\u3044\u308B\u3002^pr:he/be:pres v:invite|ing/det:a n:speaker/prep:at det:the n:supermarket",
    "3^\u308F\u305F\u3057\u306F\u6B21\u306F\u6D77\u8FBA\u3067\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u4F7F\u3046\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:use|ing/det:a n:printer/prep:on det:the n:beach/idm:next_time",
    "2^\u308F\u305F\u3057\u306F2\u65E5\u524D\u30B9\u30FC\u30D1\u30FC\u306B\u3084\u3055\u3057\u304F\u7740\u3044\u305F\u3002^pr:i/v:arrive|past/adv:softly/prep:at det:the n:supermarket/idm:two_days_ago",
    "2^\u72AC\u306F\u75C5\u9662\u3067\u5BDD\u308B\u3002^det:the n:dog/v:sleep|base/prep:at det:the n:hospital",
    "2^\u308F\u305F\u3057\u306F\u3055\u3063\u304D\u99C5\u3067\u52DD\u3063\u305F\u3002^pr:i/v:win|past/prep:at det:the n:station/idm:just_now",
    "3^\u304A\u7236\u3055\u3093\u306F7\u6642\u306B\u30AB\u30D5\u30A7\u3067\u4EE5\u524D\u306F\u7B11\u3063\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:laugh|base/prep:at det:the n:cafe/idm:at_seven",
    "2^\u3042\u306A\u305F\u306F\u6628\u591C\u8ECA\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^pr:you/v:follow|past/det:the n:car/idm:last_night",
    "3^\u304A\u6BCD\u3055\u3093\u306F7\u6642\u306B\u99C5\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD4\u4FE1\u3059\u308B\u3002^pr:i n:mom/v:answer|base/det:a n:message/prep:at det:the n:station/idm:at_seven",
    "3^\u5148\u751F\u306F\u4F53\u80B2\u9928\u3067\u30B8\u30A7\u30C3\u30C8\u30B3\u30FC\u30B9\u30BF\u30FC\u306B\u304B\u3093\u305F\u3093\u306B\u4E57\u3063\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:ride|ing/det:a n:roller_coaster/adv:easily/prep:in det:the n:gym",
    "3^\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u30B9\u30FC\u30D1\u30FC\u3067\u8FD1\u304F\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:friend|pl/v:jump|base/adv:nearby/prep:at det:the n:supermarket/idm:every_day",
    "1^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u8D70\u308B\u3002^n:Ken/v:run|base/adv:soon",
    "1^\u304B\u308C\u306F\u591C\u306B\u96A0\u308C\u305F\u3002^pr:he/v:hide|past/prep:at n:night",
    "1^\u72AC\u306F\u4ECA\u6B69\u304F\u3002^det:the n:dog/v:walk|base/adv:now",
    "3^\u53CB\u3060\u3061\u306F\u6559\u5BA4\u3067\u5C01\u7B52\u3092\u958B\u3051\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:open|base/det:a n:envelope/prep:in det:the n:classroom",
    "2^\u304B\u308C\u306F\u671D\u306B\u81EA\u8EE2\u8ECA\u306B\u4E57\u3063\u305F\u3002^pr:he/v:ride|past/det:a n:bike/prep:in det:the n:morning",
    "2^\u306D\u3053\u306F\u6BCE\u671D\u56F3\u66F8\u9928\u3067\u52DD\u3064\u3002^det:the n:cat/v:win|base/prep:in det:the n:library/idm:every_morning",
    "3^\u30B1\u30F3\u306F\u56F3\u66F8\u9928\u3067\u304A\u91D1\u3092\u3044\u3063\u3057\u3087\u306B\u3042\u3052\u3066\u3044\u308B\u3002^n:Ken/be:pres v:give|ing/n:money/adv:together/prep:in det:the n:library",
    "2^\u30DF\u30AB\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:relax|base/prep:at det:the n:supermarket",
    "2^\u304B\u308C\u3089\u306F\u30AB\u30D5\u30A7\u306B\u7740\u304F\u3060\u308D\u3046\u3002^pr:they/modal:will v:arrive|base/prep:at det:the n:cafe",
    "2^\u53CB\u3060\u3061\u306F2\u65E5\u524D\u56F3\u66F8\u9928\u3067\u6025\u3044\u3060\u3002^pr:i n:friend|pl/v:hurry|past/prep:in det:the n:library/idm:two_days_ago",
    "2^\u30B1\u30F3\u306F\u6765\u9031\u30D0\u30B9\u306B\u5F97\u610F\u3052\u306B\u3064\u3044\u3066\u3044\u304F\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:follow|ing/det:the n:bus/adv:proudly/idm:next_week",
    "2^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u30C9\u30A2\u3092\u5F15\u304F\u3002^pr:he/v:pull|base/det:the n:door/adv:soon",
    "2^\u5973\u306E\u5B50\u306F\u671D\u306B\u8D70\u308B\u3002^det:the n:girl/v:run|base/prep:in det:the n:morning",
    "1^\u304B\u308C\u306F\u6771\u4EAC\u3067\u4F11\u3080\u3002^pr:he/v:rest|base/prep:in n:Tokyo",
    "2^\u304B\u308C\u306F\u3042\u305D\u3053\u3067\u304A\u3082\u3061\u3083\u3092\u4F5C\u3063\u305F\u3002^pr:he/v:make|past/det:a n:toy/adv:there",
    "1^\u5148\u751F\u306F2\u65E5\u524D\u5BDD\u305F\u3002^det:the n:teacher/v:sleep|past/idm:two_days_ago",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u98DF\u3079\u7269\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^pr:we/be:pres v:make|ing/n:food/prep:at det:the n:restaurant",
    "2^\u5148\u751F\u306F\u6BCE\u65E5\u56F3\u66F8\u9928\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^det:the n:teacher/v:jump|base/prep:in det:the n:library/idm:every_day",
    "2^\u30DF\u30AB\u306F\u6D77\u8FBA\u3067\u3044\u3059\u3092\u6301\u3063\u3066\u304F\u308B\u3002^n:Mika/v:bring|base/det:a n:chair/prep:on det:the n:beach",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u591C\u4F11\u3080\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:rest|ing/adv:tonight",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u30B9\u30FC\u30D1\u30FC\u3067\u8D70\u3063\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:run|ing/prep:at det:the n:supermarket/adv:now",
    "3^\u30DF\u30AB\u306F\u671D\u306B\u5EAD\u3067\u7DF4\u7FD2\u3092\u3059\u308B\u3002^n:Mika/v:do|base/n:practice/prep:in det:the n:garden/prep:in det:the n:morning",
    "2^\u5973\u306E\u5B50\u306F\u3055\u3063\u304D\u99C5\u306B\u7740\u3044\u305F\u3002^det:the n:girl/v:arrive|past/prep:at det:the n:station/idm:just_now",
    "2^\u72AC\u306F2\u65E5\u524D\u53F0\u6240\u3078\u6765\u305F\u3002^det:the n:dog/v:come|past/prep:to det:the n:kitchen/idm:two_days_ago",
    "3^\u3042\u306A\u305F\u306F\u56F3\u66F8\u9928\u3067\u9854\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:see|base/det:a n:face/prep:in det:the n:library",
    "3^\u72AC\u306F\u671D\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6B69\u304F\u3002^det:the n:dog/v:walk|base/prep:in pr:i n:room/prep:in det:the n:morning",
    "2^\u7537\u306E\u5B50\u306F\u98DF\u3079\u7269\u3092\u3042\u3052\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:give|base/n:food",
    "1^\u308F\u305F\u3057\u306F\u4ECA\u671D\u670D\u3092\u8CB7\u3063\u305F\u3002^pr:i/v:buy|past/n:clothes/idm:this_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u4F1A\u793E\u3067\u671D\u3054\u306F\u3093\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^pr:she/be:pres v:make|ing/n:breakfast/prep:at det:the n:office",
    "2^\u7537\u306E\u5B50\u306F\u3055\u3063\u304D\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9\u3092\u958B\u3051\u305F\u3002^det:the n:boy/v:open|past/det:a n:suitcase/idm:just_now",
    "1^\u30B1\u30F3\u306F\u6628\u591C\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^n:Ken/v:jump|past/idm:last_night",
    "1^\u72AC\u306F\u5BB6\u3067\u8E0A\u308B\u3002^det:the n:dog/v:dance|base/idm:at_home",
    "2^\u304B\u308C\u3089\u306F\u5BB6\u3067\u30C6\u30EC\u30D3\u3092\u898B\u308B\u3002^pr:they/v:watch|base/det:the n:TV/idm:at_home",
    "1^\u308F\u305F\u3057\u306F\u6628\u591C\u5B66\u6821\u3067\u6CF3\u3044\u3060\u3002^pr:i/v:swim|past/idm:at_school/idm:last_night",
    "2^\u304A\u7236\u3055\u3093\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:i n:dad/v:shop|past/prep:at det:the n:restaurant",
    "1^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u4F11\u3093\u3060\u3002^pr:i/v:rest|past/idm:this_afternoon",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u5E97\u3067\u3044\u3059\u3092\u8FD1\u304F\u3067\u5F15\u3044\u305F\u3002^pr:i n:friend|pl/v:pull|past/det:a n:chair/adv:nearby/prep:at det:the n:store/adv:today",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5DDD\u306E\u305D\u3070\u3067\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u305F\u3002^pr:we/v:watch|past/det:a n:concert/prep:by det:the n:river",
    "1^\u304B\u308C\u306F\u6628\u591C\u307B\u307B\u3048\u3093\u3060\u3002^pr:he/v:smile|past/idm:last_night",
    "3^\u72AC\u306F\u30D0\u30B9\u505C\u3067\u5BB6\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:dog/v:find|past/det:a n:house/prep:at det:the n:bus_stop",
    "2^\u30B1\u30F3\u306F\u30C6\u30B9\u30C8\u3092\u6012\u3063\u3066\u3084\u3063\u3066\u3044\u308B\u3002^n:Ken/be:pres v:do|ing/det:a n:test/adv:angrily",
    "2^\u53CB\u3060\u3061\u306F\u5E97\u3078\u65C5\u884C\u3057\u305F\u3002^pr:i n:friend|pl/v:travel|past/prep:to det:the n:store",
    "3^\u5148\u751F\u306F\u4E00\u65E5\u3058\u3085\u3046\u53F0\u6240\u3067\u6C34\u3092\u6301\u3063\u3066\u6765\u305F\u3002^det:the n:teacher/v:bring|past/n:water/prep:in det:the n:kitchen/idm:all_day",
    "3^\u30DF\u30AB\u306F\u4ECA\u671D\u53F0\u6240\u3067\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7\u3092\u690D\u3048\u305F\u3002^n:Mika/v:plant|past/det:a n:tulip/prep:in det:the n:kitchen/idm:this_morning",
    "2^\u304A\u7236\u3055\u3093\u306F2\u6642\u9593\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u306B\u4E57\u3063\u305F\u3002^pr:i n:dad/v:ride|past/det:a n:elevator/idm:for_two_hours",
    "1^\u306D\u3053\u306F\u6BCE\u671D\u6025\u3050\u3002^det:the n:cat/v:hurry|base/idm:every_morning",
    "2^\u304B\u308C\u3089\u306F\u7A7A\u6E2F\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:they/v:smile|past/prep:at det:the n:airport",
    "1^\u306D\u3053\u306F\u8FD1\u304F\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^det:the n:cat/v:relax|past/idm:close_by",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u68EE\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:we/v:shop|base/prep:in det:the n:forest",
    "1^\u308F\u305F\u3057\u306F\u6BCE\u671D\u3053\u3053\u3078\u6765\u308B\u3002^pr:i/v:come|base/adv:here/idm:every_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u671D\u306B\u30BF\u30AA\u30EB\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:we/v:bring|past/det:a n:towel/prep:in det:the n:morning",
    "2^\u308F\u305F\u3057\u306F\u6B21\u306F\u53EB\u3076\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:shout|base/idm:next_time",
    "1^\u30DF\u30AB\u306F\u30CE\u30FC\u30C8\u3092\u306A\u304F\u3057\u305F\u3002^n:Mika/v:lose|past/det:a n:notebook",
    "2^\u72AC\u306F\u56F3\u66F8\u9928\u3067\u6CE3\u3044\u305F\u3002^det:the n:dog/v:cry|past/prep:in det:the n:library",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u3055\u3044\u3075\u3092\u306A\u304F\u3059\u3002^pr:i n:mom/v:lose|base/det:a n:wallet/adv:now",
    "3^\u304A\u7236\u3055\u3093\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u82B1\u3092\u690D\u3048\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:plant|base/det:a n:flower/prep:at det:the n:supermarket",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u60C5\u5831\u3092\u8FD1\u304F\u3067\u898B\u3064\u3051\u308B\u3002^det:the n:boy/v:find|base/n:information/idm:close_by/adv:now",
    "1^\u3042\u306A\u305F\u306F2\u65E5\u524D\u8A71\u3057\u305F\u3002^pr:you/v:talk|past/idm:two_days_ago",
    "2^\u306D\u3053\u306F\u75C5\u9662\u3067\u8E0A\u3063\u305F\u3002^det:the n:cat/v:dance|past/prep:at det:the n:hospital",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u671D\u5B66\u6821\u3067\u304B\u3070\u3093\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:i/v:bring|past/det:a n:bag/idm:at_school/idm:this_morning",
    "2^\u304B\u308C\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u30B8\u30E3\u30F3\u30D7\u3057\u3066\u3044\u308B\u3002^pr:he/be:pres v:jump|ing/idm:this_afternoon",
    "2^\u5148\u751F\u306F\u524D\u56DE\u306F\u8CEA\u554F\u304C\u3042\u3063\u305F\u3002^det:the n:teacher/v:have|past/det:a n:question/idm:last_time",
    "2^\u7537\u306E\u5B50\u306F2\u65E5\u524D\u308F\u305F\u3057\u306E\u96FB\u8A71\u306B\u51FA\u305F\u3002^det:the n:boy/v:answer|past/pr:i n:phone/idm:two_days_ago",
    "2^\u7537\u306E\u5B50\u306F\u68EE\u3067\u307E\u3063\u305F\u308A\u3057\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:chill|ing/prep:in det:the n:forest",
    "3^\u304B\u306E\u3058\u3087\u306F\u6628\u591C\u99C5\u3067\u53D6\u3063\u624B\u3092\u3059\u3070\u3084\u304F\u5F15\u3044\u305F\u3002^pr:she/v:pull|past/det:a n:handle/adv:quickly/prep:at det:the n:station/idm:last_night",
    "2^\u304B\u308C\u306F\u591C\u306B\u98DF\u3079\u7269\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u3042\u3052\u305F\u3002^pr:he/v:give|past/n:food/idm:in_time/prep:at n:night",
    "2^\u304B\u308C\u306F\u30AB\u30D5\u30A7\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:he/v:jump|past/idm:in_time/prep:at det:the n:cafe",
    "2^\u308F\u305F\u3057\u306F\u5EAD\u306B\u6012\u3063\u3066\u7740\u304F\u3068\u3053\u308D\u3060\u3002^pr:i/be:pres v:arrive|ing/adv:angrily/prep:in det:the n:garden",
    "3^\u7537\u306E\u5B50\u306F\u6B21\u306F\u30AB\u30D5\u30A7\u3067\u7A81\u7136\u6CE3\u304F\u3002^det:the n:boy/v:cry|base/adv:suddenly/prep:at det:the n:cafe/idm:next_time",
    "2^\u5148\u751F\u306F\u4ECA\u591C\u30AB\u30FC\u30C9\u3092\u4F5C\u308B\u4E88\u5B9A\u3060\u3002^det:the n:teacher/be:pres v:make|ing/det:a n:card/adv:tonight",
    "1^\u304B\u308C\u306F\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:he/v:relax|past",
    "2^\u3042\u306A\u305F\u306F\u30DA\u30F3\u3092\u3066\u3044\u306D\u3044\u306B\u501F\u308A\u305F\u3002^pr:you/v:borrow|past/det:a n:pen/adv:politely",
    "3^\u30B1\u30F3\u306F\u52D5\u7269\u5712\u3067\u624B\u7D19\u3092\u9001\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:send|base/det:a n:letter/prep:at det:the n:zoo",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6B21\u306F\u304F\u3089\u3084\u307F\u3067\u6CF3\u3050\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:swim|ing/idm:in_the_dark/idm:next_time",
    "1^\u304B\u306E\u3058\u3087\u306F\u4ECA\u65E5\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:she/v:jump|base/adv:today",
    "2^\u5973\u306E\u5B50\u306F\u516C\u5712\u3067\u5BDD\u305F\u3002^det:the n:girl/v:sleep|past/prep:in det:the n:park",
    "2^\u306D\u3053\u306F\u671D\u306B\u6765\u308B\u3002^det:the n:cat/v:come|base/prep:in det:the n:morning",
    "2^\u72AC\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^det:the n:dog/v:jump|base/prep:in pr:i n:room",
    "2^\u306D\u3053\u306F\u3055\u3063\u304D\u3073\u3093\u3092\u904B\u3093\u3060\u3002^det:the n:cat/v:carry|past/det:a n:bottle/idm:just_now",
    "3^\u5973\u306E\u5B50\u306F\u56F3\u66F8\u9928\u3067\u76BF\u3092\u6D17\u3063\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:do|ing/det:the n:dishes/prep:in det:the n:library",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u65E5\u5BB6\u3067\u8E0A\u308B\u3002^pr:i n:mom/v:dance|base/idm:at_home/idm:every_day",
    "2^\u5973\u306E\u5B50\u306F\u56F3\u66F8\u9928\u306B\u7740\u3044\u305F\u3002^det:the n:girl/v:arrive|past/prep:in det:the n:library",
    "2^\u5148\u751F\u306F\u304B\u3055\u3092\u89AA\u5207\u306B\u958B\u304F\u3002^det:the n:teacher/v:open|base/det:a n:umbrella/adv:kindly",
    "2^\u5973\u306E\u5B50\u306F\u53F0\u6240\u3078\u65C5\u884C\u3057\u305F\u3002^det:the n:girl/v:travel|past/prep:to det:the n:kitchen",
    "3^\u304A\u7236\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u30B1\u30FC\u30AD\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:i n:dad/v:bring|past/det:a n:cake/prep:at det:the n:cafe",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6771\u4EAC\u3078\u884C\u304F\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:go|base/prep:to n:Tokyo",
    "2^\u5973\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:come|base/adv:soon",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u5DDD\u306E\u305D\u3070\u3067\u96A0\u308C\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:hide|ing/prep:by det:the n:river/adv:tonight",
    "2^\u304B\u306E\u3058\u3087\u306F\u5E97\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u52DD\u3064\u3002^pr:she/v:win|base/idm:in_time/prep:at det:the n:store",
    "2^\u3042\u306A\u305F\u306F\u7A7A\u6E2F\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u52DD\u3064\u3002^pr:you/v:win|base/idm:in_time/prep:at det:the n:airport",
    "2^\u306D\u3053\u306F\u307E\u3061\u304C\u3044\u3092\u3044\u3063\u3057\u3087\u306B\u898B\u3064\u3051\u305F\u3002^det:the n:cat/v:find|past/det:a n:mistake/adv:together",
    "2^\u304B\u306E\u3058\u3087\u306F\u6765\u9031\u56F3\u66F8\u9928\u3078\u65C5\u884C\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:she/be:pres v:travel|ing/prep:to det:the n:library/idm:next_week",
    "2^\u30DF\u30AB\u306F\u4F53\u80B2\u9928\u3067\u6025\u3044\u3060\u3002^n:Mika/v:hurry|past/prep:in det:the n:gym",
    "2^\u30DF\u30AB\u306F\u3055\u3063\u304D\u5BB6\u3092\u898B\u3064\u3051\u305F\u3002^n:Mika/v:find|past/det:a n:house/idm:just_now",
    "2^\u30B1\u30F3\u306F\u5E97\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Ken/v:relax|past/prep:at det:the n:store",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u3055\u3063\u304D\u6559\u5BA4\u306B\u7740\u3044\u305F\u3002^pr:i n:mom/v:arrive|past/prep:in det:the n:classroom/idm:just_now",
    "2^\u304A\u7236\u3055\u3093\u306F\u68EE\u3078\u7A81\u7136\u884C\u304F\u3002^pr:i n:dad/v:go|base/adv:suddenly/prep:to det:the n:forest",
    "2^\u304B\u308C\u3089\u306F\u3053\u3053\u3067\u304B\u3055\u3092\u958B\u304F\u3060\u308D\u3046\u3002^pr:they/modal:will v:open|base/det:a n:umbrella/adv:here",
    "3^\u30DF\u30AB\u306F\u516C\u5712\u3067\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7\u3092\u690D\u3048\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:plant|base/det:a n:tulip/prep:in det:the n:park",
    "2^\u30DF\u30AB\u306F\u3055\u3063\u304D\u3044\u3059\u3092\u6301\u3063\u3066\u6765\u305F\u3002^n:Mika/v:bring|past/det:a n:chair/idm:just_now",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u671D\u306B\u5BB6\u306B\u7740\u304F\u3002^pr:i n:mom/v:arrive|base/idm:at_home/prep:in det:the n:morning",
    "2^\u53CB\u3060\u3061\u306F\u3064\u3044\u306B\u7740\u304F\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:arrive|base/adv:finally",
    "2^\u304B\u306E\u3058\u3087\u306F\u6B21\u306F\u30D0\u30B9\u505C\u3067\u50CD\u304F\u3002^pr:she/v:work|base/prep:at det:the n:bus_stop/idm:next_time",
    "3^\u304B\u308C\u306F\u6765\u9031\u53F0\u6240\u3067\u53E3\u3092\u958B\u304F\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:open|ing/pr:he n:mouth/prep:in det:the n:kitchen/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F2\u6642\u9593\u5DDD\u306E\u305D\u3070\u3067\u53EB\u3093\u3060\u3002^pr:i n:friend|pl/v:shout|past/prep:by det:the n:river/idm:for_two_hours",
    "2^\u304B\u308C\u306F\u524D\u56DE\u306F\u3042\u305D\u3053\u3067\u6307\u8F2A\u3092\u306A\u304F\u3057\u305F\u3002^pr:he/v:lose|past/det:a n:ring/adv:there/idm:last_time",
    "2^\u306D\u3053\u306F\u591C\u306B\u8D70\u308B\u3002^det:the n:cat/v:run|base/prep:at n:night",
    "2^\u304A\u7236\u3055\u3093\u306F\u5EAD\u3067\u52DD\u3066\u308B\u3002^pr:i n:dad/modal:can v:win|base/prep:in det:the n:garden",
    "3^\u5973\u306E\u5B50\u306F2\u65E5\u524D\u5BB6\u3067\u624B\u7D19\u3092\u9001\u308C\u305F\u3002^det:the n:girl/modal:could v:send|base/det:a n:letter/idm:at_home/idm:two_days_ago",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30E1\u30FC\u30EB\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u9001\u3063\u305F\u3002^pr:i n:mom/v:send|past/det:a n:email/idm:on_time",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5DDD\u306E\u305D\u3070\u3067\u4F11\u3080\u3002^pr:we/v:rest|base/prep:by det:the n:river/idm:this_afternoon",
    "3^\u306D\u3053\u306F\u5EAD\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u304F\u3002^det:the n:cat/v:follow|base/det:the n:bus/prep:in det:the n:garden",
    "1^\u304A\u7236\u3055\u3093\u306F\u3082\u3046\u3059\u3050\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:dad/v:jump|base/adv:soon",
    "2^\u30B1\u30F3\u306F\u4ECA\u591C\u5199\u771F\u3092\u64AE\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:take|base/det:a n:photo/adv:tonight",
    "2^\u304B\u306E\u3058\u3087\u306F2\u65E5\u524D\u516C\u5712\u3078\u65C5\u884C\u3057\u305F\u3002^pr:she/v:travel|past/prep:to det:the n:park/idm:two_days_ago",
    "2^\u3042\u306A\u305F\u306F\u3055\u3063\u304D\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u76F4\u3057\u305F\u3002^pr:you/v:fix|past/det:a n:printer/idm:just_now",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6765\u9031\u5DDD\u306E\u305D\u3070\u3067\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:cry|ing/prep:by det:the n:river/idm:next_week",
    "1^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u3082\u3046\u4E00\u5EA6\u53EB\u3093\u3060\u3002^n:Mika/v:shout|past/adv:again/idm:all_day",
    "2^\u304B\u306E\u3058\u3087\u306F\u5148\u9031\u52D5\u7269\u5712\u3067\u5BDD\u305F\u3002^pr:she/v:sleep|past/prep:at det:the n:zoo/idm:last_week",
    "2^\u30B1\u30F3\u306F\u4ECA\u65E5\u8ECA\u3092\u501F\u308A\u308B\u3002^n:Ken/v:borrow|base/det:the n:car/adv:today",
    "3^\u53CB\u3060\u3061\u306F\u5DDD\u306E\u305D\u3070\u3067\u672C\u3092\u306A\u304F\u3057\u305F\u3002^pr:i n:friend|pl/v:lose|past/det:a n:book/prep:by det:the n:river",
    "2^\u30B1\u30F3\u306F\u660E\u65E5\u99C5\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^n:Ken/be:pres v:win|ing/prep:at det:the n:station/adv:tomorrow",
    "3^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u8D08\u308A\u7269\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:i n:dad/v:bring|past/det:a n:gift/prep:in det:the n:park",
    "2^\u5148\u751F\u306F\u30B8\u30E3\u30B1\u30C3\u30C8\u3092\u3044\u3063\u3057\u3087\u306B\u501F\u308A\u305F\u3002^det:the n:teacher/v:borrow|past/det:a n:jacket/adv:together",
    "3^\u3042\u306A\u305F\u306F\u30AB\u30D5\u30A7\u3067\u304B\u3055\u3092\u958B\u3044\u3066\u3044\u308B\u3002^pr:you/be:pres v:open|ing/det:a n:umbrella/prep:at det:the n:cafe",
    "2^\u7537\u306E\u5B50\u306F\u5207\u7B26\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^det:the n:boy/be:pres v:lose|ing/det:a n:ticket",
    "2^\u5148\u751F\u306F\u6BCE\u671D\u30DA\u30F3\u3092\u4F7F\u3048\u305F\u3002^det:the n:teacher/modal:could v:use|base/det:a n:pen/idm:every_morning",
    "1^\u3042\u306A\u305F\u306F\u30B5\u30F3\u30C9\u30A4\u30C3\u30C1\u3092\u4F5C\u308B\u3002^pr:you/v:make|base/det:a n:sandwich",
    "2^\u304B\u308C\u3089\u306F\u30D0\u30B9\u505C\u3067\u5B8C\u307A\u304D\u306B\u307B\u307B\u3048\u3080\u3002^pr:they/v:smile|base/adv:perfectly/prep:at det:the n:bus_stop",
    "1^\u304B\u308C\u306F\u4ECA\u671D\u6765\u305F\u3002^pr:he/v:come|past/idm:this_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u304F\u3089\u3084\u307F\u3067\u6765\u308B\u3068\u3053\u308D\u3060\u3002^pr:we/be:pres v:come|ing/idm:in_the_dark",
    "1^\u5973\u306E\u5B50\u306F\u5148\u9031\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:girl/v:chill|past/idm:last_week",
    "1^\u53CB\u3060\u3061\u306F\u52DD\u3064\u3002^pr:i n:friend|pl/v:win|base",
    "2^\u3042\u306A\u305F\u306F\u6BCE\u65E5\u7D75\u3092\u9001\u3063\u305F\u3002^pr:you/v:send|past/det:a n:picture/idm:every_day",
    "3^\u72AC\u306F\u30D0\u30B9\u505C\u3067\u30AB\u30E1\u30E9\u3092\u904B\u3093\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:carry|ing/det:a n:camera/prep:at det:the n:bus_stop",
    "2^\u30B1\u30F3\u306F\u3042\u305D\u3053\u3067\u30C9\u30EC\u30B9\u3092\u4F5C\u308B\u3002^n:Ken/v:make|base/det:a n:dress/adv:there",
    "2^\u72AC\u306F\u4F1A\u793E\u3067\u6B69\u3044\u305F\u3002^det:the n:dog/v:walk|past/prep:at det:the n:office",
    "2^\u304B\u308C\u3089\u306F\u7A7A\u6E2F\u3067\u6CF3\u3050\u3002^pr:they/v:swim|base/prep:at det:the n:airport",
    "3^\u5148\u751F\u306F\u6BCE\u65E5\u4F1A\u793E\u3067\u6012\u3063\u3066\u52DD\u3064\u3002^det:the n:teacher/v:win|base/adv:angrily/prep:at det:the n:office/idm:every_day",
    "3^\u5148\u751F\u306F\u671D\u306B\u30AB\u30D5\u30A7\u3067\u307B\u307B\u3048\u3093\u3060\u3002^det:the n:teacher/v:smile|past/prep:at det:the n:cafe/prep:in det:the n:morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u5EAD\u3067\u6CE3\u3044\u305F\u3002^pr:we/v:cry|past/prep:in det:the n:garden/idm:all_day",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6D77\u8FBA\u306B\u7740\u3044\u305F\u3002^pr:we/v:arrive|past/prep:on det:the n:beach",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u3053\u3053\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^pr:we/modal:will v:win|base/adv:here/prep:at n:night",
    "2^\u30DF\u30AB\u306F\u6765\u9031\u6B69\u304F\u4E88\u5B9A\u3060\u3002^n:Mika/be:pres v:walk|ing/idm:next_week",
    "2^\u5973\u306E\u5B50\u306F\u4F1A\u793E\u3067\u8A71\u3059\u3002^det:the n:girl/v:talk|base/prep:at det:the n:office",
    "2^\u304B\u308C\u306F\u3053\u3053\u3067\u96A0\u308C\u3066\u3044\u308B\u3002^pr:he/be:pres v:hide|ing/adv:here",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5EAD\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^pr:we/modal:will v:win|base/prep:in det:the n:garden",
    "2^\u306D\u3053\u306F\u660E\u65E5\u3088\u304F\u81EA\u7136\u3092\u5B88\u308B\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres adv:often v:protect|ing/n:nature/adv:tomorrow",
    "2^\u3042\u306A\u305F\u306F\u591C\u306B\u624B\u7D19\u306B\u8FD4\u4FE1\u3057\u305F\u3002^pr:you/v:answer|past/det:a n:letter/prep:at n:night",
    "2^\u30DF\u30AB\u306F\u4ECA\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^n:Mika/v:shop|base/prep:in pr:i n:room/adv:now",
    "2^\u30DF\u30AB\u306F\u5E97\u3067\u307B\u307B\u3048\u3093\u3067\u3044\u308B\u3002^n:Mika/be:pres v:smile|ing/prep:at det:the n:store",
    "1^\u72AC\u306F\u5BDD\u305F\u3002^det:the n:dog/v:sleep|past",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u30D0\u30B9\u505C\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD4\u4FE1\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:answer|base/det:a n:message/prep:at det:the n:bus_stop",
    "2^\u72AC\u306F\u3059\u3070\u3084\u304F\u8D70\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:run|ing/adv:quickly",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u5EAD\u3067\u304A\u3082\u3061\u3083\u3092\u76F4\u3059\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:fix|base/det:a n:toy/prep:in det:the n:garden/adv:today",
    "1^\u3042\u306A\u305F\u306F\u6628\u591C\u8A71\u3057\u305F\u3002^pr:you/v:talk|past/idm:last_night",
    "2^\u308F\u305F\u3057\u306F7\u6642\u306B\u7740\u304F\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:arrive|base/idm:at_seven",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6628\u65E5\u6771\u4EAC\u3067\u30EC\u30DD\u30FC\u30C8\u3092\u9001\u3063\u305F\u3002^pr:i n:mom/v:send|past/det:a n:report/prep:in n:Tokyo/adv:yesterday",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u6D77\u8FBA\u3067\u52DD\u3063\u305F\u3002^pr:we/v:win|past/prep:on det:the n:beach/idm:all_day",
    "3^\u30B1\u30F3\u306F\u6765\u9031\u5E97\u3067\u8ECA\u3092\u58F2\u308B\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:sell|ing/det:the n:car/prep:at det:the n:store/idm:next_week",
    "2^\u306D\u3053\u306F\u75C5\u9662\u3067\u6CE3\u3044\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:cry|ing/prep:at det:the n:hospital",
    "2^\u30DF\u30AB\u306F\u591C\u306B\u75C5\u9662\u3067\u8E0A\u3063\u305F\u3002^n:Mika/v:dance|past/prep:at det:the n:hospital/prep:at n:night",
    "2^\u53CB\u3060\u3061\u306F\u3042\u305D\u3053\u3067\u5207\u7B26\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:i n:friend|pl/v:have|past/det:a n:ticket/adv:there",
    "2^\u30DF\u30AB\u306F\u4F1A\u793E\u3067\u4EE5\u524D\u306F\u307E\u3063\u305F\u308A\u3057\u3066\u3044\u305F\u3002^n:Mika/sm:used_to v:chill|base/prep:at det:the n:office",
    "1^\u3042\u306A\u305F\u306F\u5730\u56F3\u3092\u78BA\u8A8D\u3057\u305F\u3002^pr:you/v:check|past/det:a n:map",
    "2^\u304B\u308C\u306F2\u65E5\u524D\u3055\u3044\u3075\u3092\u306A\u304F\u3057\u305F\u3002^pr:he/v:lose|past/det:a n:wallet/idm:two_days_ago",
    "1^\u5148\u751F\u306F\u5BB6\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:teacher/v:chill|past/idm:at_home",
    "2^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u5287\u3092\u898B\u308B\u3002^pr:he/v:watch|base/det:a n:play/adv:soon",
    "3^\u53CB\u3060\u3061\u306F\u6765\u9031\u5DDD\u306E\u305D\u3070\u3067\u7384\u95A2\u306E\u547C\u3073\u51FA\u3057\u306B\u5FDC\u3058\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:answer|ing/det:the n:door/prep:by det:the n:river/idm:next_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u6BCE\u671D\u5EAD\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:she/v:have|past/det:a n:garden/idm:every_morning",
    "2^\u306D\u3053\u306F\u30D0\u30B9\u505C\u3078\u884C\u304F\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:go|base/prep:to det:the n:bus_stop",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u52D5\u7269\u5712\u3067\u5BDD\u3066\u3044\u308B\u3002^pr:you/be:pres v:sleep|ing/prep:at det:the n:zoo/idm:this_afternoon",
    "2^\u304B\u308C\u3089\u306F\u524D\u56DE\u306F\u30DA\u30F3\u3092\u306A\u304F\u3057\u305F\u3002^pr:they/v:lose|past/det:a n:pen/idm:last_time",
    "3^\u5973\u306E\u5B50\u306F\u6BCE\u671D\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u7BB1\u3092\u9589\u3081\u305F\u3002^det:the n:girl/v:close|past/det:the n:box/prep:in pr:i n:room/idm:every_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u6628\u65E5\u96FB\u8ECA\u306B\u4E57\u3063\u305F\u3002^pr:she/v:ride|past/det:the n:train/adv:yesterday",
    "2^\u5973\u306E\u5B50\u306F\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^det:the n:girl/v:invite|base/det:a n:speaker",
    "2^\u304B\u308C\u306F\u4ECA\u65E5\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u6CE3\u3044\u3066\u3044\u308B\u3002^pr:he/be:pres v:cry|ing/prep:at det:the n:restaurant/adv:today",
    "2^\u304A\u7236\u3055\u3093\u306F\u6D77\u8FBA\u3067\u6CE3\u3044\u305F\u3002^pr:i n:dad/v:cry|past/prep:on det:the n:beach",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30B8\u30E3\u30B1\u30C3\u30C8\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u501F\u308A\u308B\u3002^pr:i n:mom/v:borrow|base/det:a n:jacket/idm:on_time",
    "3^\u72AC\u306F\u4F1A\u793E\u3067\u9774\u3092\u306A\u304F\u3059\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:lose|base/n:shoe|pl/prep:at det:the n:office",
    "2^\u306D\u3053\u306F\u4ECA\u671D\u3053\u3053\u3067\u5BDD\u305F\u3002^det:the n:cat/v:sleep|past/adv:here/idm:this_morning",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u65E5\u5BBF\u984C\u3092\u3084\u3063\u305F\u3002^pr:we/v:do|past/n:homework/adv:yesterday",
    "3^\u30B1\u30F3\u306F\u6BCE\u671D\u75C5\u9662\u3067\u8ECA\u306B\u4EE5\u524D\u306F\u3064\u3044\u3066\u3044\u3063\u3066\u3044\u305F\u3002^n:Ken/sm:used_to v:follow|base/det:the n:car/prep:at det:the n:hospital/idm:every_morning",
    "2^\u30DF\u30AB\u306F\u7A81\u7136\u307B\u307B\u3048\u3093\u3067\u3044\u308B\u3002^n:Mika/be:pres v:smile|ing/adv:suddenly",
    "2^\u308F\u305F\u3057\u306F\u660E\u65E5\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:cry|ing/adv:tomorrow",
    "1^\u7537\u306E\u5B50\u306F\u6025\u3050\u3002^det:the n:boy/v:hurry|base",
    "2^\u30B1\u30F3\u306F\u52D5\u7269\u5712\u3067\u624B\u52A9\u3051\u3092\u3059\u308B\u3002^n:Ken/v:give|base/n:help/prep:at det:the n:zoo",
    "3^\u7537\u306E\u5B50\u306F\u516C\u5712\u3067\u305F\u307E\u306D\u304E\u3092\u690D\u3048\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:plant|ing/det:a n:onion/prep:in det:the n:park",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u591C\u99C5\u3078\u884C\u304F\u4E88\u5B9A\u3060\u3002^pr:i n:dad/be:pres v:go|ing/prep:to det:the n:station/adv:tonight",
    "1^\u306D\u3053\u306F2\u65E5\u524D\u6025\u3044\u3060\u3002^det:the n:cat/v:hurry|past/idm:two_days_ago",
    "2^\u5148\u751F\u306F\u5BB6\u3067\u6307\u8F2A\u3092\u306A\u304F\u3059\u3053\u3068\u3082\u3042\u3063\u305F\u3002^det:the n:teacher/modal:could v:lose|base/det:a n:ring/idm:at_home",
    "1^\u72AC\u306F\u6628\u591C\u96A0\u308C\u305F\u3002^det:the n:dog/v:hide|past/idm:last_night",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6559\u5BA4\u3067\u3082\u3046\u4E00\u5EA6\u6CF3\u3050\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:swim|base/adv:again/prep:in det:the n:classroom",
    "2^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6CE3\u3044\u305F\u3002^pr:she/v:cry|past/prep:in pr:i n:room/idm:last_time",
    "2^\u53CB\u3060\u3061\u306F\u89E3\u6C7A\u7B56\u3092\u5B8C\u307A\u304D\u306B\u898B\u3064\u3051\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:find|base/det:a n:solution/adv:perfectly",
    "1^\u3042\u306A\u305F\u306F\u6771\u4EAC\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:you/v:chill|past/prep:in n:Tokyo",
    "2^\u304B\u306E\u3058\u3087\u306F\u6B21\u306F\u7740\u304F\u4E88\u5B9A\u3060\u3002^pr:she/be:pres v:arrive|ing/idm:next_time",
    "1^\u304B\u308C\u306F2\u6642\u9593\u3066\u3044\u306D\u3044\u306B\u96A0\u308C\u305F\u3002^pr:he/v:hide|past/adv:politely/idm:for_two_hours",
    "2^\u3042\u306A\u305F\u306F\u5EAD\u3067\u690D\u7269\u3092\u5B88\u3063\u305F\u3002^pr:you/v:protect|past/det:a n:plant/prep:in det:the n:garden",
    "1^\u308F\u305F\u3057\u306F\u6771\u4EAC\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i/v:smile|past/prep:in n:Tokyo",
    "2^\u304A\u7236\u3055\u3093\u306F\u3042\u305D\u3053\u3067\u96FB\u8ECA\u306B\u4E57\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:ride|base/det:the n:train/adv:there",
    "2^\u304B\u308C\u3089\u306F\u3055\u3063\u304D\u4E00\u5EA6\u3082\u8A66\u5408\u3092\u898B\u306A\u304B\u3063\u305F\u3002^pr:they/adv:never v:watch|past/det:the n:game/idm:just_now",
    "2^\u304B\u308C\u306F\u6BCE\u671D\u516C\u5712\u3067\u6CF3\u3044\u3060\u3002^pr:he/v:swim|past/prep:in det:the n:park/idm:every_morning",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4F1A\u793E\u3067\u8CB7\u3044\u7269\u3057\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:shop|ing/prep:at det:the n:office",
    "2^\u306D\u3053\u306F\u671D\u306B\u884C\u3063\u305F\u3002^det:the n:cat/v:go|past/prep:in det:the n:morning",
    "1^\u304B\u306E\u3058\u3087\u306F\u4E00\u65E5\u3058\u3085\u3046\u5B8C\u307A\u304D\u306B\u6025\u3044\u3060\u3002^pr:she/v:hurry|past/adv:perfectly/idm:all_day",
    "2^\u304B\u308C\u3089\u306F\u6B69\u3044\u3066\u3044\u308B\u3002^pr:they/be:pres v:walk|ing",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4E0B\u624B\u306B\u7B11\u3063\u305F\u3002^pr:we/v:laugh|past/adv:badly",
    "1^\u304B\u308C\u306F2\u65E5\u524D\u304A\u91D1\u3092\u898B\u3064\u3051\u305F\u3002^pr:he/v:find|past/n:money/idm:two_days_ago",
    "3^\u72AC\u306F\u6D77\u8FBA\u3067\u30C6\u30EC\u30D3\u3092\u898B\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:watch|ing/det:the n:TV/prep:on det:the n:beach",
    "2^\u30B1\u30F3\u306F\u671D\u306B\u304B\u3070\u3093\u3092\u501F\u308A\u305F\u3002^n:Ken/v:borrow|past/det:a n:bag/prep:in det:the n:morning",
    "2^\u3042\u306A\u305F\u306F\u5E97\u3067\u30CE\u30FC\u30C8\u3092\u501F\u308A\u308B\u3002^pr:you/v:borrow|base/det:a n:notebook/prep:at det:the n:store",
    "3^\u5973\u306E\u5B50\u306F\u30AB\u30D5\u30A7\u3067\u5287\u3092\u898B\u305F\u3002^det:the n:girl/v:watch|past/det:a n:play/prep:at det:the n:cafe",
    "2^\u308F\u305F\u3057\u306F\u524D\u56DE\u306F\u30C6\u30EC\u30D3\u3092\u898B\u305F\u3002^pr:i/v:watch|past/det:the n:TV/idm:last_time",
    "1^\u308F\u305F\u3057\u306F\u591C\u306B\u4F11\u3080\u3002^pr:i/v:rest|base/prep:at n:night",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u30D1\u30F3\u3092\u4F5C\u308B\u3002^pr:i n:mom/v:make|base/n:bread/prep:at det:the n:cafe",
    "2^\u304B\u308C\u3089\u306F\u53F0\u6240\u3067\u62DB\u5F85\u72B6\u3092\u9001\u3063\u305F\u3002^pr:they/v:send|past/det:the n:invitation/prep:in det:the n:kitchen",
    "1^\u30DF\u30AB\u306F\u6BCE\u65E5\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Mika/v:relax|past/idm:every_day",
    "3^\u304B\u306E\u3058\u3087\u306F\u6BCE\u671D\u68EE\u3067\u81EA\u8EE2\u8ECA\u306B\u4E57\u308B\u3002^pr:she/v:ride|base/det:a n:bicycle/prep:in det:the n:forest/idm:every_morning",
    "3^\u304B\u306E\u3058\u3087\u306F\u30AB\u30D5\u30A7\u3067\u304B\u3070\u3093\u3092\u501F\u308A\u3066\u3044\u308B\u3002^pr:she/be:pres v:borrow|ing/det:a n:bag/prep:at det:the n:cafe",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u671D\u6559\u5BA4\u3067\u7A32\u3092\u690D\u3048\u305F\u3002^pr:they/v:plant|past/det:a n:rice_plant/prep:in det:the n:classroom/idm:this_morning",
    "2^\u72AC\u306F\u56F3\u66F8\u9928\u3067\u8D70\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:run|ing/prep:in det:the n:library",
    "2^\u7537\u306E\u5B50\u306F\u3055\u3063\u304D\u6B69\u3051\u305F\u3002^det:the n:boy/modal:could v:walk|base/idm:just_now",
    "2^\u306D\u3053\u306F\u68EE\u3067\u6025\u3044\u3067\u3044\u308B\u3002^det:the n:cat/be:pres v:hurry|ing/prep:in det:the n:forest",
    "1^\u30DF\u30AB\u306F\u5148\u9031\u7740\u3044\u305F\u3002^n:Mika/v:arrive|past/idm:last_week",
    "1^\u7537\u306E\u5B50\u306F\u5B66\u6821\u3067\u50CD\u3044\u305F\u3002^det:the n:boy/v:work|past/idm:at_school",
    "2^\u308F\u305F\u3057\u306F\u6628\u591C\u4F1A\u793E\u3067\u9759\u304B\u306B\u6CE3\u3044\u305F\u3002^pr:i/v:cry|past/adv:quietly/prep:at det:the n:office/idm:last_night",
    "1^\u5148\u751F\u306F\u5BB6\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^det:the n:teacher/v:shop|base/idm:at_home",
    "2^\u30B1\u30F3\u306F2\u6642\u9593\u5EAD\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^n:Ken/v:chill|past/prep:in det:the n:garden/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u306F\u4E00\u65E5\u3058\u3085\u3046\u5E97\u3067\u4F11\u3080\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:rest|base/prep:at det:the n:store/idm:all_day",
    "1^\u304A\u7236\u3055\u3093\u306F\u8FD1\u304F\u3067\u7740\u3044\u305F\u3002^pr:i n:dad/v:arrive|past/adv:nearby",
    "3^\u72AC\u306F\u56F3\u66F8\u9928\u3067\u672C\u3092\u904B\u3076\u3002^det:the n:dog/v:carry|base/det:a n:book/prep:in det:the n:library",
    "2^\u304B\u308C\u306F\u6765\u9031\u50CD\u304F\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:work|ing/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F\u5E97\u3067\u8A71\u3057\u305F\u3002^pr:i n:friend|pl/v:talk|past/prep:at det:the n:store",
    "2^\u72AC\u306F\u4F53\u80B2\u9928\u3067\u6CE3\u3044\u305F\u3002^det:the n:dog/v:cry|past/prep:in det:the n:gym",
    "1^\u3042\u306A\u305F\u306F\u3055\u3063\u304D\u884C\u3063\u305F\u3002^pr:you/v:go|past/idm:just_now",
    "1^\u304B\u308C\u3089\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5BDD\u305F\u3002^pr:they/v:sleep|past/idm:this_afternoon",
    "3^\u5973\u306E\u5B50\u306F\u7A7A\u6E2F\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^det:the n:girl/v:invite|base/det:a n:speaker/prep:at det:the n:airport",
    "1^\u304B\u308C\u3089\u306F\u6BCE\u65E5\u884C\u304F\u3002^pr:they/v:go|base/idm:every_day",
    "2^\u30DF\u30AB\u306F\u68EE\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u305F\u3002^n:Mika/v:feed|past/n:fish/prep:in det:the n:forest",
    "1^\u308F\u305F\u3057\u306F\u4ECA\u671D\u3068\u304D\u3069\u304D\u53EB\u3093\u3060\u3002^pr:i/adv:sometimes v:shout|past/idm:this_morning",
    "3^\u5973\u306E\u5B50\u306F\u3055\u3063\u304D\u52D5\u7269\u5712\u3067\u5F15\u304D\u51FA\u3057\u3092\u5F15\u3044\u305F\u3002^det:the n:girl/v:pull|past/det:a n:drawer/prep:at det:the n:zoo/idm:just_now",
    "2^\u308F\u305F\u3057\u306F\u671D\u306B\u3073\u3093\u3092\u9589\u3081\u305F\u3002^pr:i/v:close|past/det:a n:bottle/prep:in det:the n:morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u5BDD\u305F\u3002^pr:she/v:sleep|past/prep:at det:the n:supermarket",
    "1^\u304B\u308C\u306F\u6B21\u306F\u6765\u308B\u3002^pr:he/v:come|base/idm:next_time",
    "2^\u304B\u308C\u3089\u306F\u6D77\u8FBA\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:they/v:chill|base/prep:on det:the n:beach",
    "3^\u304B\u306E\u3058\u3087\u306F\u3055\u3063\u304D\u5DDD\u306E\u305D\u3070\u3067\u81EA\u8EE2\u8ECA\u306B\u4E57\u3063\u305F\u3002^pr:she/v:ride|past/det:a n:bicycle/prep:by det:the n:river/idm:just_now",
    "2^\u7537\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u6C34\u3092\u3042\u3052\u305F\u3002^det:the n:boy/v:give|past/n:water/idm:all_day",
    "2^\u5148\u751F\u306F\u9053\u3092\u8FD1\u304F\u3067\u4F5C\u3063\u305F\u3002^det:the n:teacher/v:build|past/det:the n:road/adv:nearby",
    "2^\u304B\u308C\u306F\u52D5\u7269\u5712\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:feed|base/n:fish/prep:at det:the n:zoo",
    "3^\u53CB\u3060\u3061\u306F\u30AB\u30D5\u30A7\u3067\u3059\u3070\u3084\u304F\u6025\u3044\u3067\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:hurry|ing/adv:quickly/prep:at det:the n:cafe",
    "3^\u304B\u306E\u3058\u3087\u306F2\u65E5\u524D\u5E97\u3067\u53D6\u3063\u624B\u3092\u5F15\u3044\u305F\u3002^pr:she/v:pull|past/det:a n:handle/prep:at det:the n:store/idm:two_days_ago",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u671D\u30B3\u30FC\u30C8\u3092\u7740\u305F\u3002^det:the n:boy/v:wear|past/det:a n:coat/idm:this_morning",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u524D\u56DE\u306F\u60C5\u5831\u3092\u63D0\u4F9B\u3057\u305F\u3002^pr:i n:mom/v:give|past/n:information/idm:last_time",
    "2^\u5973\u306E\u5B50\u306F\u3064\u3044\u306B\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:come|base/adv:finally",
    "2^\u304B\u306E\u3058\u3087\u306F\u591C\u306B\u5207\u7B26\u3092\u898B\u3064\u3051\u308B\u3002^pr:she/v:find|base/det:a n:ticket/prep:at n:night",
    "2^\u306D\u3053\u306F\u5148\u9031\u5B66\u6821\u3067\u8FD1\u304F\u3067\u8E0A\u3063\u305F\u3002^det:the n:cat/v:dance|past/adv:nearby/idm:at_school/idm:last_week",
    "1^\u5148\u751F\u306F\u306E\u3093\u3073\u308A\u3057\u305F\u3002^det:the n:teacher/v:relax|past",
    "3^\u308F\u305F\u3057\u306F\u6D77\u8FBA\u3067\u5199\u771F\u3092\u3066\u3044\u306D\u3044\u306B\u64AE\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:take|base/det:a n:photo/adv:politely/prep:on det:the n:beach",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u524D\u56DE\u306F\u65C5\u884C\u3057\u305F\u3002^pr:i n:mom/v:travel|past/idm:last_time",
    "3^\u7537\u306E\u5B50\u306F\u4ECA\u671D\u30AB\u30D5\u30A7\u3067\u8ECA\u3092\u6301\u3063\u3066\u3044\u305F\u3002^det:the n:boy/v:have|past/det:the n:car/prep:at det:the n:cafe/idm:this_morning",
    "3^\u53CB\u3060\u3061\u306F\u5DDD\u306E\u305D\u3070\u3067\u30AB\u30FC\u30C9\u3092\u3042\u3052\u305F\u3002^pr:i n:friend|pl/v:give|past/det:a n:card/prep:by det:the n:river",
    "2^\u304A\u7236\u3055\u3093\u306F\u8CEA\u554F\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u3059\u308B\u3002^pr:i n:dad/v:ask|base/det:a n:question/idm:in_time",
    "2^\u30DF\u30AB\u306F\u4ECA\u65E5\u8D70\u3063\u3066\u3044\u308B\u3002^n:Mika/be:pres v:run|ing/adv:today",
    "1^\u304A\u7236\u3055\u3093\u306F\u6628\u591C\u6765\u305F\u3002^pr:i n:dad/v:come|past/idm:last_night",
    "3^\u53CB\u3060\u3061\u306F\u6628\u591C\u56F3\u66F8\u9928\u3067\u30DA\u30F3\u3092\u3042\u3052\u305F\u3002^pr:i n:friend|pl/v:give|past/det:a n:pen/prep:in det:the n:library/idm:last_night",
    "3^\u304A\u7236\u3055\u3093\u306F\u5EAD\u3067\u672C\u3092\u898B\u3064\u3051\u305F\u3002^pr:i n:dad/v:find|past/det:a n:book/prep:in det:the n:garden",
    "3^\u3042\u306A\u305F\u306F\u671D\u306B\u53F0\u6240\u3067\u7B11\u3063\u305F\u3002^pr:you/v:laugh|past/prep:in det:the n:kitchen/prep:in det:the n:morning",
    "2^\u304B\u308C\u306F\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u6012\u3063\u3066\u501F\u308A\u305F\u3002^pr:he/v:borrow|past/det:a n:laptop/adv:angrily",
    "2^\u3042\u306A\u305F\u306F\u3044\u3063\u3057\u3087\u306B\u4F11\u3093\u3067\u3044\u308B\u3002^pr:you/be:pres v:rest|ing/adv:together",
    "2^\u306D\u3053\u306F\u6559\u5BA4\u3078\u884C\u304F\u3002^det:the n:cat/v:go|base/prep:to det:the n:classroom",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u591C\u306B\u30C9\u30EC\u30B9\u3092\u7740\u3089\u308C\u305F\u3002^pr:i n:mom/modal:could v:wear|base/det:a n:dress/prep:at n:night",
    "2^\u5148\u751F\u306F\u4E00\u65E5\u3058\u3085\u3046\u5B66\u6821\u3067\u6CE3\u3051\u305F\u3002^det:the n:teacher/modal:could v:cry|base/idm:at_school/idm:all_day",
    "2^\u304A\u7236\u3055\u3093\u306F\u5148\u9031\u9053\u5177\u3092\u904B\u3093\u3060\u3002^pr:i n:dad/v:carry|past/det:a n:tool/idm:last_week",
    "1^\u306D\u3053\u306F\u3055\u3063\u304D\u96A0\u308C\u305F\u3002^det:the n:cat/v:hide|past/idm:just_now",
    "2^\u308F\u305F\u3057\u306F\u624B\u7D19\u3092\u4E0B\u624B\u306B\u9001\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:send|base/det:a n:letter/adv:badly",
    "1^\u30DF\u30AB\u306F\u6771\u4EAC\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^n:Mika/v:jump|past/prep:in n:Tokyo",
    "2^\u3042\u306A\u305F\u306F\u591C\u306B\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^pr:you/v:invite|base/det:a n:speaker/prep:at n:night",
    "2^\u30DF\u30AB\u306F\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u898B\u305F\u3002^n:Mika/v:watch|past/det:a n:concert/idm:in_time",
    "2^\u30B1\u30F3\u306F\u4F53\u80B2\u9928\u3067\u8D70\u3063\u3066\u3044\u308B\u3002^n:Ken/be:pres v:run|ing/prep:in det:the n:gym",
    "1^\u306D\u3053\u306F\u6628\u65E5\u6765\u305F\u3002^det:the n:cat/v:come|past/adv:yesterday",
    "2^\u304B\u308C\u306F\u53F0\u6240\u3067\u53EB\u3076\u3002^pr:he/v:shout|base/prep:in det:the n:kitchen",
    "3^\u7537\u306E\u5B50\u306F\u56F3\u66F8\u9928\u3067\u9580\u3092\u958B\u3051\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:open|base/det:a n:gate/prep:in det:the n:library",
    "2^\u304B\u308C\u3089\u306F2\u6642\u9593\u30D0\u30B9\u505C\u3078\u884C\u3063\u305F\u3002^pr:they/v:go|past/prep:to det:the n:bus_stop/idm:for_two_hours",
    "2^\u306D\u3053\u306F\u6D77\u8FBA\u3067\u8D70\u308B\u3002^det:the n:cat/v:run|base/prep:on det:the n:beach",
    "2^\u3042\u306A\u305F\u306F\u68EE\u3078\u5B8C\u307A\u304D\u306B\u884C\u304F\u3002^pr:you/v:go|base/adv:perfectly/prep:to det:the n:forest",
    "3^\u30B1\u30F3\u306F\u591C\u306B\u5E97\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u7B11\u3063\u305F\u3002^n:Ken/v:laugh|past/idm:in_time/prep:at det:the n:store/prep:at n:night",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4F53\u80B2\u9928\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^pr:we/v:invite|base/det:a n:speaker/prep:in det:the n:gym",
    "3^\u5148\u751F\u306F\u5E97\u3067\u9053\u5177\u3092\u4F7F\u3046\u3002^det:the n:teacher/v:use|base/det:a n:tool/prep:at det:the n:store",
    "3^\u72AC\u306F\u4F53\u80B2\u9928\u3067\u5BB6\u3092\u898B\u305F\u3002^det:the n:dog/v:see|past/det:a n:house/prep:in det:the n:gym",
    "2^\u304B\u306E\u3058\u3087\u306F\u516C\u5712\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:she/v:chill|past/prep:in det:the n:park",
    "2^\u30DF\u30AB\u306F2\u65E5\u524D\u4F53\u80B2\u9928\u306B\u4E0B\u624B\u306B\u7740\u3044\u305F\u3002^n:Mika/v:arrive|past/adv:badly/prep:in det:the n:gym/idm:two_days_ago",
    "2^\u72AC\u306F\u4ECA\u65E5\u30EA\u30E5\u30C3\u30AF\u3092\u904B\u3093\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:carry|ing/det:a n:backpack/adv:today",
    "2^\u30DF\u30AB\u306F\u6765\u9031\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:jump|base/prep:at det:the n:restaurant/idm:next_week",
    "1^\u304B\u306E\u3058\u3087\u306F\u8A71\u3057\u305F\u3002^pr:she/v:talk|past",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u671D\u8CEA\u554F\u3092\u3057\u305F\u3002^det:the n:girl/v:ask|past/det:a n:question/idm:this_morning",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u591C\u68EE\u3067\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:cry|ing/prep:in det:the n:forest/adv:tonight",
    "2^\u306D\u3053\u306F\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:hide|base",
    "2^\u304A\u7236\u3055\u3093\u306F\u99C5\u3067\u53EB\u3093\u3060\u3002^pr:i n:dad/v:shout|past/prep:at det:the n:station",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30D0\u30B9\u505C\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^pr:i n:mom/v:chill|base/prep:at det:the n:bus_stop",
    "2^\u306D\u3053\u306F\u6628\u65E5\u6559\u5BA4\u3067\u8D70\u3063\u305F\u3002^det:the n:cat/v:run|past/prep:in det:the n:classroom/adv:yesterday",
    "3^\u304B\u308C\u306F\u660E\u65E5\u4F1A\u793E\u3067\u30DA\u30F3\u3092\u4F7F\u3046\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:use|ing/det:a n:pen/prep:at det:the n:office/adv:tomorrow",
    "2^\u7537\u306E\u5B50\u306F\u660E\u65E5\u5199\u771F\u3092\u9001\u308B\u4E88\u5B9A\u3060\u3002^det:the n:boy/be:pres v:send|ing/det:a n:photo/adv:tomorrow",
    "2^\u304B\u306E\u3058\u3087\u306F\u6BCE\u671D\u5BB9\u5668\u3092\u958B\u3051\u305F\u3002^pr:she/v:open|past/det:a n:container/idm:every_morning",
    "2^\u304B\u308C\u3089\u306F\u3042\u305D\u3053\u3067\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7\u3092\u690D\u3048\u308B\u3002^pr:they/v:plant|base/det:a n:tulip/adv:there",
    "2^\u5148\u751F\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u30BF\u30AA\u30EB\u3092\u6301\u3063\u3066\u304F\u308B\u3002^det:the n:teacher/v:bring|base/det:a n:towel/idm:this_afternoon",
    "2^\u7537\u306E\u5B50\u306F7\u6642\u306B\u75C5\u9662\u306B\u7740\u304F\u3002^det:the n:boy/v:arrive|base/prep:at det:the n:hospital/idm:at_seven",
    "2^\u304B\u306E\u3058\u3087\u306F\u4E00\u65E5\u3058\u3085\u3046\u307B\u307B\u3048\u3081\u305F\u3002^pr:she/modal:could v:smile|base/idm:all_day",
    "2^\u304B\u308C\u306F\u4F1A\u793E\u3078\u884C\u3051\u308B\u3002^pr:he/modal:can v:go|base/prep:to det:the n:office",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u591C\u53F0\u6240\u3067\u82B1\u3092\u58F2\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:sell|ing/det:a n:flower/prep:in det:the n:kitchen/adv:tonight",
    "2^\u306D\u3053\u306F\u6628\u591C\u30D0\u30B9\u505C\u3067\u6B69\u3044\u305F\u3002^det:the n:cat/v:walk|past/prep:at det:the n:bus_stop/idm:last_night",
    "2^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u5DDD\u306E\u305D\u3070\u3067\u50CD\u304F\u3002^pr:they/v:work|base/prep:by det:the n:river/adv:soon",
    "2^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u304B\u3070\u3093\u3092\u306A\u304F\u3057\u305F\u3002^pr:she/v:lose|past/det:a n:bag/idm:last_time",
    "3^\u53CB\u3060\u3061\u306F\u52D5\u7269\u5712\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u8CB7\u3046\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:buy|base/pr:i n:phone/prep:at det:the n:zoo",
    "2^\u30DF\u30AB\u306F\u4ECA\u671D\u5C4B\u6839\u3092\u76F4\u3057\u305F\u3002^n:Mika/v:fix|past/det:a n:roof/idm:this_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u660E\u65E5\u6559\u5BA4\u3067\u8E0A\u308B\u4E88\u5B9A\u3060\u3002^pr:we/be:pres v:dance|ing/prep:in det:the n:classroom/adv:tomorrow",
    "2^\u3042\u306A\u305F\u306F\u5148\u9031\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u7B11\u3063\u305F\u3002^pr:you/v:laugh|past/prep:in pr:i n:room/idm:last_week",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:invite|ing/det:a n:speaker/adv:tonight",
    "3^\u30DF\u30AB\u306F\u6628\u591C\u68EE\u3067\u30EA\u30E5\u30C3\u30AF\u3092\u904B\u3093\u3060\u3002^n:Mika/v:carry|past/det:a n:backpack/prep:in det:the n:forest/idm:last_night",
    "1^\u3042\u306A\u305F\u306F\u3055\u3063\u304D\u96A0\u308C\u305F\u3002^pr:you/v:hide|past/idm:just_now",
    "2^\u7537\u306E\u5B50\u306F\u3066\u3044\u306D\u3044\u306B\u6B69\u3044\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:walk|ing/adv:carefully",
    "3^\u5148\u751F\u306F\u671D\u306B\u30B8\u30FC\u30F3\u30BA\u3092\u306F\u304F\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:wear|base/n:jeans/prep:in det:the n:morning",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F2\u65E5\u524D\u3084\u3055\u3057\u304F\u53EB\u3093\u3060\u3002^pr:we/v:shout|past/adv:softly/idm:two_days_ago",
    "1^\u5148\u751F\u306F\u4E00\u65E5\u3058\u3085\u3046\u8A71\u3057\u305F\u3002^det:the n:teacher/v:talk|past/idm:all_day",
    "2^\u30B1\u30F3\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u307B\u307B\u3048\u3080\u3060\u308D\u3046\u3002^n:Ken/modal:will v:smile|base/prep:in pr:i n:room",
    "3^\u308F\u305F\u3057\u306F\u591C\u306B\u4F53\u80B2\u9928\u3067\u8E0A\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:dance|base/prep:in det:the n:gym/prep:at n:night",
    "2^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u7B11\u3046\u3002^pr:i n:dad/v:laugh|base/prep:in det:the n:park",
    "3^\u304A\u7236\u3055\u3093\u306F2\u65E5\u524D\u5E97\u3067\u30B3\u30FC\u30D2\u30FC\u3092\u8CB7\u3063\u305F\u3002^pr:i n:dad/v:buy|past/n:coffee/prep:at det:the n:store/idm:two_days_ago",
    "3^\u7537\u306E\u5B50\u306F\u6B21\u306F\u7A7A\u6E2F\u3067\u8E0A\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:dance|base/prep:at det:the n:airport/idm:next_time",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u7A7A\u6E2F\u3067\u6CF3\u3050\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:swim|base/prep:at det:the n:airport",
    "3^\u7537\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u30C9\u30EC\u30B9\u3092\u7740\u308B\u3002^det:the n:boy/v:wear|base/det:a n:dress/prep:in det:the n:gym",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F7\u6642\u306B\u5B66\u6821\u3067\u8E0A\u308C\u308B\u3002^pr:we/modal:can v:dance|base/idm:at_school/idm:at_seven",
    "2^\u304B\u306E\u3058\u3087\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u304B\u3070\u3093\u3092\u958B\u3051\u308B\u3002^pr:she/v:open|base/det:a n:bag/prep:at det:the n:supermarket",
    "3^\u72AC\u306F\u7A7A\u6E2F\u3067\u304A\u3082\u3061\u3083\u3092\u306A\u304F\u3057\u305F\u3002^det:the n:dog/v:lose|past/det:a n:toy/prep:at det:the n:airport",
    "1^\u5973\u306E\u5B50\u306F\u5B66\u6821\u3067\u53EB\u3093\u3060\u3002^det:the n:girl/v:shout|past/idm:at_school",
    "3^\u5973\u306E\u5B50\u306F\u52D5\u7269\u5712\u3067\u3073\u3093\u3092\u9589\u3081\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:close|base/det:a n:bottle/prep:at det:the n:zoo",
    "2^\u72AC\u306F\u6765\u9031\u3066\u3044\u306D\u3044\u306B\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:jump|ing/adv:politely/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F2\u6642\u9593\u6559\u5BA4\u3067\u4F11\u3093\u3060\u3002^pr:i n:friend|pl/v:rest|past/prep:in det:the n:classroom/idm:for_two_hours",
    "3^\u304B\u308C\u306F\u3055\u3063\u304D\u516C\u5712\u3067\u304A\u3082\u3061\u3083\u3092\u3082\u3046\u4E00\u5EA6\u8CB7\u3063\u305F\u3002^pr:he/v:buy|past/det:a n:toy/adv:again/prep:in det:the n:park/idm:just_now",
    "3^\u7537\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u7A32\u3092\u690D\u3048\u305F\u3002^det:the n:boy/v:plant|past/det:a n:rice_plant/prep:in pr:i n:room",
    "3^\u5973\u306E\u5B50\u306F\u6765\u9031\u6D77\u8FBA\u3067\u5BB6\u3092\u58F2\u308B\u4E88\u5B9A\u3060\u3002^det:the n:girl/be:pres v:sell|ing/det:a n:house/prep:on det:the n:beach/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F\u5148\u9031\u6559\u5BA4\u3078\u6765\u305F\u3002^pr:i n:friend|pl/v:come|past/prep:to det:the n:classroom/idm:last_week",
    "2^\u72AC\u306F\u3059\u3070\u3084\u304F\u6025\u3044\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:hurry|ing/adv:quickly",
    "3^\u7537\u306E\u5B50\u306F\u56F3\u66F8\u9928\u3067\u65B9\u6CD5\u3092\u898B\u3064\u3051\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:find|base/det:a n:way/prep:in det:the n:library",
    "2^\u30B1\u30F3\u306F\u8CEA\u554F\u3092\u304F\u3089\u3084\u307F\u3067\u3057\u305F\u3002^n:Ken/v:ask|past/det:a n:question/idm:in_the_dark",
    "1^\u304B\u306E\u3058\u3087\u306F\u3053\u3053\u3067\u50CD\u3044\u305F\u3002^pr:she/v:work|past/adv:here",
    "2^\u30B1\u30F3\u306F\u3055\u3063\u304D\u30D0\u30B9\u306B\u4E57\u3063\u305F\u3002^n:Ken/v:ride|past/det:the n:bus/idm:just_now",
    "2^\u30B1\u30F3\u306F\u8ECA\u3092\u3064\u3044\u306B\u4EE5\u524D\u306F\u8CB7\u3063\u3066\u3044\u305F\u3002^n:Ken/sm:used_to v:buy|base/det:the n:car/adv:finally",
    "2^\u308F\u305F\u3057\u306F\u5DDD\u306E\u305D\u3070\u306B\u6012\u3063\u3066\u7740\u3044\u305F\u3002^pr:i/v:arrive|past/adv:angrily/prep:by det:the n:river",
    "2^\u72AC\u306F\u56F3\u66F8\u9928\u3067\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:hide|base/prep:in det:the n:library",
    "2^\u304A\u7236\u3055\u3093\u306F\u3042\u305D\u3053\u3067\u3066\u3044\u306D\u3044\u306B\u307B\u307B\u3048\u3080\u3002^pr:i n:dad/v:smile|base/adv:politely/adv:there",
    "3^\u53CB\u3060\u3061\u306F\u524D\u56DE\u306F\u5DDD\u306E\u305D\u3070\u3067\u6728\u3092\u898B\u305F\u3002^pr:i n:friend|pl/v:see|past/det:a n:tree/prep:by det:the n:river/idm:last_time",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u671D\u5BB6\u3067\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u4F7F\u3063\u305F\u3002^det:the n:girl/v:use|past/det:a n:printer/idm:at_home/idm:this_morning",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u6B21\u306F\u50CD\u304F\u3002^pr:i n:mom/v:work|base/idm:next_time",
    "2^\u306D\u3053\u306F\u5148\u9031\u53F0\u6240\u3067\u8D70\u3063\u305F\u3002^det:the n:cat/v:run|past/prep:in det:the n:kitchen/idm:last_week",
    "2^\u304A\u7236\u3055\u3093\u306F\u68EE\u3067\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u52DD\u3063\u305F\u3002^pr:i n:dad/v:win|past/idm:in_time/prep:in det:the n:forest",
    "3^\u5973\u306E\u5B50\u306F\u6559\u5BA4\u3067\u76EE\u3092\u8FD1\u304F\u3067\u5B88\u3063\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:protect|ing/det:a n:eye/idm:close_by/prep:in det:the n:classroom",
    "3^\u5148\u751F\u306F\u7A7A\u6E2F\u3067\u62DB\u5F85\u72B6\u3092\u9001\u3063\u305F\u3002^det:the n:teacher/v:send|past/det:the n:invitation/prep:at det:the n:airport",
    "2^\u5148\u751F\u306F\u4ECA\u99C5\u3067\u52DD\u3064\u3002^det:the n:teacher/v:win|base/prep:at det:the n:station/adv:now",
    "2^\u7537\u306E\u5B50\u306F\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9\u3092\u3086\u3063\u304F\u308A\u904B\u3093\u3067\u3044\u308B\u3002^det:the n:boy/be:pres v:carry|ing/det:a n:suitcase/adv:slowly",
    "1^\u3042\u306A\u305F\u306F\u4ECA\u671D\u96A0\u308C\u305F\u3002^pr:you/v:hide|past/idm:this_morning",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u591C\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u306B\u4E57\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:ride|ing/det:a n:elevator/adv:tonight",
    "2^\u306D\u3053\u306F\u3055\u3063\u304D\u30AB\u30D5\u30A7\u3067\u5BDD\u305F\u3002^det:the n:cat/v:sleep|past/prep:at det:the n:cafe/idm:just_now",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u671D\u3053\u3053\u3067\u4E0B\u624B\u306B\u96A0\u308C\u305F\u3002^pr:i n:mom/v:hide|past/adv:badly/adv:here/idm:every_morning",
    "2^\u30B1\u30F3\u306F\u7A7A\u6E2F\u3067\u7D75\u3092\u898B\u308B\u3002^n:Ken/v:see|base/det:a n:picture/prep:at det:the n:airport",
    "2^\u30B1\u30F3\u306F7\u6642\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^n:Ken/v:jump|past/prep:in pr:i n:room/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u3055\u3063\u304D\u3053\u3053\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u304B\u3093\u305F\u3093\u306B\u9589\u3058\u305F\u3002^n:Mika/v:close|past/det:a n:laptop/adv:easily/adv:here/idm:just_now",
    "1^\u306D\u3053\u306F\u52DD\u3063\u305F\u3002^det:the n:cat/v:win|past",
    "1^\u3042\u306A\u305F\u306F\u65C5\u884C\u3057\u305F\u3002^pr:you/v:travel|past",
    "2^\u72AC\u306F\u75C5\u9662\u3067\u6025\u3050\u3002^det:the n:dog/v:hurry|base/prep:at det:the n:hospital",
    "3^\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u5E97\u3067\u8C46\u3092\u690D\u3048\u308B\u3002^pr:i n:friend|pl/v:plant|base/det:a n:bean/prep:at det:the n:store/idm:every_day",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3053\u3053\u3067\u96A0\u308C\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:hide|base/adv:here",
    "2^\u304B\u306E\u3058\u3087\u306F\u6765\u9031\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:invite|base/det:a n:speaker/idm:next_week",
    "2^\u30DF\u30AB\u306F\u30D0\u30B9\u505C\u3067\u770B\u677F\u3092\u898B\u305F\u3002^n:Mika/v:see|past/det:a n:sign/prep:at det:the n:bus_stop",
    "2^\u5148\u751F\u306F\u68EE\u3067\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:hide|base/prep:in det:the n:forest",
    "2^\u304A\u7236\u3055\u3093\u306F\u6628\u591C\u5E97\u306B\u7740\u3044\u305F\u3002^pr:i n:dad/v:arrive|past/prep:at det:the n:store/idm:last_night",
    "3^\u30B1\u30F3\u306F\u591C\u306B\u516C\u5712\u306B\u89AA\u5207\u306B\u7740\u304F\u3060\u308D\u3046\u3002^n:Ken/modal:will v:arrive|base/adv:kindly/prep:in det:the n:park/prep:at n:night",
    "3^\u304B\u308C\u3089\u306F\u56F3\u66F8\u9928\u3067\u79D8\u5BC6\u57FA\u5730\u3092\u4F5C\u3063\u3066\u3044\u308B\u3002^pr:they/be:pres v:build|ing/det:a n:fort/prep:in det:the n:library",
    "3^\u7537\u306E\u5B50\u306F\u4F1A\u793E\u3067\u98DF\u4E8B\u3092\u4F5C\u3063\u305F\u3002^det:the n:boy/v:make|past/det:a n:meal/prep:at det:the n:office",
    "2^\u7537\u306E\u5B50\u306F\u6559\u5BA4\u3067\u306E\u3093\u3073\u308A\u3057\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:relax|ing/prep:in det:the n:classroom",
    "2^\u304B\u308C\u306F\u30D0\u30B9\u505C\u3067\u6CE3\u304F\u3002^pr:he/v:cry|base/prep:at det:the n:bus_stop",
    "2^\u304A\u7236\u3055\u3093\u306F\u3059\u3070\u3084\u304F\u50CD\u3044\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:work|ing/adv:quickly",
    "2^\u30DF\u30AB\u306F\u99C5\u3067\u5BDD\u305F\u3002^n:Mika/v:sleep|past/prep:at det:the n:station",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5DDD\u306E\u305D\u3070\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u3066\u3044\u308B\u3002^pr:we/be:pres v:feed|ing/n:fish/prep:by det:the n:river",
    "2^\u304B\u308C\u3089\u306F\u591C\u306B\u305F\u307E\u306D\u304E\u3092\u7A81\u7136\u690D\u3048\u305F\u3002^pr:they/v:plant|past/det:a n:onion/adv:suddenly/prep:at n:night",
    "2^\u3042\u306A\u305F\u306F\u5929\u6C17\u3092\u89AA\u5207\u306B\u78BA\u8A8D\u3059\u308B\u3002^pr:you/v:check|base/det:the n:weather/adv:kindly",
    "3^\u30B1\u30F3\u306F2\u6642\u9593\u30B9\u30FC\u30D1\u30FC\u3067\u672C\u3092\u6301\u3063\u3066\u3044\u305F\u3002^n:Ken/v:have|past/det:a n:book/prep:at det:the n:supermarket/idm:for_two_hours",
    "2^\u304B\u306E\u3058\u3087\u306F\u6628\u591C\u99C5\u3067\u7B11\u3063\u305F\u3002^pr:she/v:laugh|past/prep:at det:the n:station/idm:last_night",
    "2^\u304B\u308C\u3089\u306F\u53F0\u6240\u3067\u304B\u3070\u3093\u3092\u904B\u3093\u3060\u3002^pr:they/v:carry|past/det:a n:bag/prep:in det:the n:kitchen",
    "2^\u304B\u306E\u3058\u3087\u306F\u4F53\u80B2\u9928\u3067\u98DF\u3079\u7269\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:she/v:bring|past/n:food/prep:in det:the n:gym",
    "2^\u308F\u305F\u3057\u306F\u3053\u3053\u3067\u6CF3\u3050\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:swim|base/adv:here",
    "3^\u306D\u3053\u306F\u4ECA\u591C\u68EE\u3078\u884C\u304F\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres v:go|ing/prep:to det:the n:forest/adv:tonight",
    "2^\u304B\u306E\u3058\u3087\u306F\u6628\u65E5\u3042\u305D\u3053\u3067\u98DF\u3079\u7269\u3092\u8CB7\u3063\u305F\u3002^pr:she/v:buy|past/n:food/adv:there/adv:yesterday",
    "2^\u53CB\u3060\u3061\u306F\u5E97\u3067\u8CB7\u3044\u7269\u3057\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:shop|ing/prep:at det:the n:store",
    "3^\u5973\u306E\u5B50\u306F\u6559\u5BA4\u3067\u5199\u771F\u3092\u64AE\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:take|base/det:a n:photo/prep:in det:the n:classroom",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6559\u5BA4\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u8CB7\u3063\u305F\u3002^pr:i n:mom/v:buy|past/pr:i n:phone/prep:in det:the n:classroom",
    "2^\u304B\u308C\u306F\u53F0\u6240\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:he/v:shop|base/prep:in det:the n:kitchen",
    "3^\u53CB\u3060\u3061\u306F\u6628\u65E5\u99C5\u3067\u76EE\u3092\u5B88\u3063\u305F\u3002^pr:i n:friend|pl/v:protect|past/det:a n:eye/prep:at det:the n:station/adv:yesterday",
    "2^\u30B1\u30F3\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u30B9\u30FC\u30D7\u3092\u4F5C\u3063\u305F\u3002^n:Ken/v:make|past/n:soup/prep:at det:the n:restaurant",
    "3^\u53CB\u3060\u3061\u306F2\u65E5\u524D\u4F53\u80B2\u9928\u3067\u8B1B\u6F14\u8005\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u62DB\u5F85\u3057\u305F\u3002^pr:i n:friend|pl/v:invite|past/det:a n:speaker/idm:on_time/prep:in det:the n:gym/idm:two_days_ago",
    "1^\u304B\u308C\u3089\u306F\u8D08\u308A\u7269\u3092\u3042\u3052\u305F\u3002^pr:they/v:give|past/det:a n:gift",
    "2^\u3042\u306A\u305F\u306F\u4F1A\u793E\u3067\u53EB\u3093\u3067\u3044\u308B\u3002^pr:you/be:pres v:shout|ing/prep:at det:the n:office",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u671D\u5F97\u610F\u3052\u306B\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:mom/v:jump|base/adv:proudly/idm:every_morning",
    "2^\u308F\u305F\u3057\u306F\u3042\u305D\u3053\u3067\u8CEA\u554F\u3092\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:ask|base/det:a n:question/adv:there",
    "2^\u304B\u308C\u3089\u306F\u4E00\u65E5\u3058\u3085\u3046\u5DDD\u306E\u305D\u3070\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:they/v:chill|past/prep:by det:the n:river/idm:all_day",
    "1^\u72AC\u306F\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^det:the n:dog/v:jump|base",
    "3^\u308F\u305F\u3057\u306F\u5DDD\u306E\u305D\u3070\u3067\u8B1B\u6F14\u8005\u3092\u4E0B\u624B\u306B\u62DB\u5F85\u3057\u305F\u3002^pr:i/v:invite|past/det:a n:speaker/adv:badly/prep:by det:the n:river",
    "1^\u72AC\u306F\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u5BDD\u308B\u3002^det:the n:dog/v:sleep|base/idm:in_time",
    "2^\u30B1\u30F3\u306F\u4ECA\u591C\u3058\u3083\u304C\u3044\u3082\u3092\u690D\u3048\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:plant|base/det:a n:potato/adv:tonight",
    "2^\u304A\u7236\u3055\u3093\u306F\u304B\u3055\u3092\u6301\u3063\u3066\u6765\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:bring|ing/det:a n:umbrella",
    "3^\u30DF\u30AB\u306F\u671D\u306B\u6D77\u8FBA\u3067\u7B11\u3046\u3002^n:Mika/v:laugh|base/prep:on det:the n:beach/prep:in det:the n:morning",
    "2^\u7537\u306E\u5B50\u306F2\u6642\u9593\u53F0\u6240\u3067\u6B69\u3044\u305F\u3002^det:the n:boy/v:walk|past/prep:in det:the n:kitchen/idm:for_two_hours",
    "2^\u5973\u306E\u5B50\u306F\u5B89\u5168\u306B\u884C\u304F\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:go|base/adv:safely",
    "1^\u30DF\u30AB\u306F\u5148\u9031\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Mika/v:relax|past/idm:last_week",
    "2^\u306D\u3053\u306F\u4F1A\u793E\u3067\u697D\u3057\u305D\u3046\u306B\u6CF3\u3044\u3060\u3002^det:the n:cat/v:swim|past/adv:happily/prep:at det:the n:office",
    "2^\u30DF\u30AB\u306F\u304B\u3055\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u501F\u308A\u305F\u3002^n:Mika/v:borrow|past/det:a n:umbrella/idm:on_time",
    "2^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u4F1A\u793E\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3002^pr:they/v:feed|base/n:fish/prep:at det:the n:office/adv:soon",
    "3^\u304A\u7236\u3055\u3093\u306F7\u6642\u306B\u52D5\u7269\u5712\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u306A\u304F\u3059\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:lose|base/pr:i n:phone/prep:at det:the n:zoo/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u6559\u5BA4\u3067\u53EB\u3076\u3060\u308D\u3046\u3002^n:Mika/modal:will v:shout|base/prep:in det:the n:classroom",
    "2^\u5148\u751F\u306F\u5E97\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^det:the n:teacher/v:jump|base/prep:at det:the n:store",
    "3^\u304B\u308C\u3089\u306F\u591C\u306B\u7A7A\u6E2F\u3067\u3059\u3070\u3084\u304F\u8A71\u3059\u3002^pr:they/v:talk|base/adv:quickly/prep:at det:the n:airport/prep:at n:night",
    "2^\u5148\u751F\u306F7\u6642\u306B\u6B69\u304F\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:walk|base/idm:at_seven",
    "2^\u5148\u751F\u306F\u591C\u306B\u8CB7\u3044\u7269\u3057\u305F\u3002^det:the n:teacher/v:shop|past/prep:at n:night",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6B21\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u624B\u7D19\u3092\u3042\u3052\u308B\u3002^pr:i n:mom/v:give|base/det:a n:letter/prep:at det:the n:supermarket/idm:next_time",
    "2^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u53F0\u6240\u3078\u884C\u304F\u3002^pr:he/v:go|base/prep:to det:the n:kitchen/adv:soon",
    "2^\u7537\u306E\u5B50\u306F\u30EA\u30E5\u30C3\u30AF\u3092\u5B8C\u307A\u304D\u306B\u904B\u3093\u3060\u3002^det:the n:boy/v:carry|past/det:a n:backpack/adv:perfectly",
    "1^\u3042\u306A\u305F\u306F\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u898B\u3064\u3051\u305F\u3002^pr:you/v:find|past/pr:i n:phone",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u671D\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9\u3092\u8FD1\u304F\u3067\u5F15\u3044\u305F\u3002^det:the n:girl/v:pull|past/det:a n:suitcase/idm:close_by/idm:this_morning",
    "2^\u53CB\u3060\u3061\u306F\u30D0\u30B9\u505C\u3067\u304B\u3093\u305F\u3093\u306B\u52DD\u3064\u3002^pr:i n:friend|pl/v:win|base/adv:easily/prep:at det:the n:bus_stop",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u30B9\u30FC\u30D1\u30FC\u3067\u9759\u304B\u306B\u4F11\u3080\u3002^pr:i n:mom/v:rest|base/adv:quietly/prep:at det:the n:supermarket/adv:today",
    "2^\u308F\u305F\u3057\u306F\u53F0\u6240\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u4F7F\u3063\u305F\u3002^pr:i/v:use|past/det:the n:computer/prep:in det:the n:kitchen",
    "2^\u30DF\u30AB\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5EAD\u3067\u96A0\u308C\u308B\u3002^n:Mika/v:hide|base/prep:in det:the n:garden/idm:this_afternoon",
    "2^\u304B\u308C\u306F\u6765\u9031\u8D70\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:run|base/idm:next_week",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u65E5\u30AB\u30D5\u30A7\u3067\u6B69\u3044\u305F\u3002^pr:we/v:walk|past/prep:at det:the n:cafe/adv:yesterday",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F7\u6642\u306B\u516C\u5712\u3067\u7BB1\u3092\u958B\u3051\u308B\u3002^pr:we/v:open|base/det:the n:box/prep:in det:the n:park/idm:at_seven",
    "1^\u304B\u308C\u306F7\u6642\u306B\u7740\u3044\u305F\u3002^pr:he/v:arrive|past/idm:at_seven",
    "2^\u3042\u306A\u305F\u306F2\u6642\u9593\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:you/v:ask|past/det:a n:question/idm:for_two_hours",
    "2^\u5148\u751F\u306F\u6BCE\u65E5\u30B8\u30A7\u30C3\u30C8\u30B3\u30FC\u30B9\u30BF\u30FC\u306B\u4E57\u308C\u308B\u3002^det:the n:teacher/modal:can v:ride|base/det:a n:roller_coaster/idm:every_day",
    "2^\u5148\u751F\u306F\u5148\u9031\u30AA\u30FC\u30D6\u30F3\u3092\u304B\u3093\u305F\u3093\u306B\u4F7F\u3063\u305F\u3002^det:the n:teacher/v:use|past/det:a n:oven/adv:easily/idm:last_week",
    "2^\u3042\u306A\u305F\u306F\u99C5\u3067\u304B\u3093\u305F\u3093\u306B\u8A71\u3057\u305F\u3002^pr:you/v:talk|past/adv:easily/prep:at det:the n:station",
    "2^\u30DF\u30AB\u306F\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u52DD\u3063\u3066\u3044\u308B\u3002^n:Mika/be:pres v:win|ing/idm:in_time",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067T\u30B7\u30E3\u30C4\u3092\u7740\u308B\u3002^pr:i n:dad/v:wear|base/det:a n:t-shirt/prep:in pr:i n:room/adv:now",
    "2^\u304B\u308C\u3089\u306F\u591C\u306B\u6771\u4EAC\u3067\u8E0A\u3063\u305F\u3002^pr:they/v:dance|past/prep:in n:Tokyo/prep:at n:night",
    "2^\u72AC\u306F\u30DA\u30F3\u3092\u3044\u3063\u3057\u3087\u306B\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^det:the n:dog/be:pres v:lose|ing/det:a n:pen/adv:together",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30D0\u30B9\u505C\u3067\u6B69\u3044\u3066\u3044\u308B\u3002^pr:we/be:pres v:walk|ing/prep:at det:the n:bus_stop",
    "2^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u4F11\u3093\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:rest|ing/idm:this_afternoon",
    "1^\u308F\u305F\u3057\u306F\u5B66\u6821\u3067\u7B11\u3046\u3002^pr:i/v:laugh|base/idm:at_school",
    "1^\u306D\u3053\u306F\u7A81\u7136\u96A0\u308C\u308B\u3002^det:the n:cat/v:hide|base/adv:suddenly",
    "3^\u5973\u306E\u5B50\u306F\u6559\u5BA4\u3067\u30D0\u30B9\u306B\u5B8C\u307A\u304D\u306B\u4E57\u308B\u3002^det:the n:girl/v:ride|base/det:the n:bus/adv:perfectly/prep:in det:the n:classroom",
    "2^\u30B1\u30F3\u306F\u99C5\u3067\u6CF3\u3050\u3060\u308D\u3046\u3002^n:Ken/modal:will v:swim|base/prep:at det:the n:station",
    "1^\u304B\u308C\u3089\u306F\u6BCE\u671D\u8A71\u3057\u305F\u3002^pr:they/v:talk|past/idm:every_morning",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u4F11\u3093\u3060\u3002^pr:i n:mom/v:rest|past",
    "2^\u304B\u308C\u306F\u6628\u65E5\u6559\u5BA4\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:he/v:smile|past/prep:in det:the n:classroom/adv:yesterday",
    "2^\u304A\u7236\u3055\u3093\u306F\u6BCE\u671D\u7A32\u3092\u690D\u3048\u308B\u3002^pr:i n:dad/v:plant|base/det:a n:rice_plant/idm:every_morning",
    "1^\u304B\u306E\u3058\u3087\u306F\u8D70\u308B\u3002^pr:she/v:run|base",
    "2^\u7537\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u76F4\u305B\u305F\u3002^det:the n:boy/modal:could v:fix|base/det:a n:printer/idm:all_day",
    "2^\u306D\u3053\u306F\u6D77\u3078\u884C\u304F\u3002^det:the n:cat/v:go|base/prep:to det:the n:beach",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u671D\u516C\u5712\u3067\u53D6\u3063\u624B\u3092\u5F15\u3051\u305F\u3002^pr:i n:dad/modal:could v:pull|base/det:a n:handle/prep:in det:the n:park/idm:this_morning",
    "1^\u5973\u306E\u5B50\u306F\u305F\u304F\u3055\u3093\u7B11\u3046\u3002^det:the n:girl/v:laugh|base/idm:a_lot",
    "2^\u304B\u308C\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u52D5\u7269\u5712\u306B\u3064\u3044\u306B\u7740\u304F\u3002^pr:he/v:arrive|base/adv:finally/prep:at det:the n:zoo/idm:this_afternoon",
    "2^\u306D\u3053\u306F\u6765\u9031\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:relax|base/idm:next_week",
    "2^\u30B1\u30F3\u306F\u660E\u65E5\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:invite|ing/det:a n:speaker/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u6765\u9031\u3082\u3046\u4E00\u5EA6\u5BDD\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:sleep|base/adv:again/idm:next_week",
    "3^\u72AC\u306F\u4ECA\u591C\u4F53\u80B2\u9928\u3067\u3044\u3059\u3092\u904B\u3076\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:carry|base/det:a n:chair/prep:in det:the n:gym/adv:tonight",
    "3^\u304B\u308C\u306F\u4E00\u65E5\u3058\u3085\u3046\u6D77\u8FBA\u3067\u79D8\u5BC6\u57FA\u5730\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:build|base/det:a n:fort/prep:on det:the n:beach/idm:all_day",
    "1^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u5BDD\u305F\u3002^pr:she/v:sleep|past/idm:last_time",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u65E5\u3044\u3059\u3092\u4F5C\u308B\u3002^det:the n:boy/v:make|base/det:a n:chair/adv:today",
    "3^\u7537\u306E\u5B50\u306F\u524D\u56DE\u306F\u99C5\u3067\u304B\u3070\u3093\u3092\u8CB7\u3063\u305F\u3002^det:the n:boy/v:buy|past/det:a n:bag/prep:at det:the n:station/idm:last_time",
    "2^\u306D\u3053\u306F\u30B9\u30FC\u30D1\u30FC\u3078\u884C\u304F\u3068\u3053\u308D\u3060\u3002^det:the n:cat/be:pres v:go|ing/prep:to det:the n:supermarket",
    "2^\u5148\u751F\u306F2\u6642\u9593\u5BB6\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^det:the n:teacher/v:relax|past/idm:at_home/idm:for_two_hours",
    "2^\u5973\u306E\u5B50\u306F\u7A7A\u6E2F\u3067\u6CF3\u3044\u3060\u3002^det:the n:girl/v:swim|past/prep:at det:the n:airport",
    "1^\u30B1\u30F3\u306F2\u65E5\u524D\u9774\u3092\u8CB7\u3063\u305F\u3002^n:Ken/v:buy|past/n:shoe|pl/idm:two_days_ago",
    "2^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u53F0\u6240\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^det:the n:dog/v:relax|base/prep:in det:the n:kitchen/idm:this_afternoon",
    "2^\u304B\u308C\u3089\u306F\u52D5\u7269\u5712\u3078\u6765\u308B\u3002^pr:they/v:come|base/prep:to det:the n:zoo",
    "2^\u306D\u3053\u306F\u6765\u9031\u6B69\u304F\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres v:walk|ing/idm:next_week",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC\u306B\u4E57\u3063\u305F\u3002^pr:i n:mom/v:ride|past/det:a n:escalator/prep:at det:the n:cafe",
    "3^\u7537\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u3073\u3093\u3092\u904B\u3076\u3002^det:the n:boy/v:carry|base/det:a n:bottle/prep:in pr:i n:room",
    "3^\u53CB\u3060\u3061\u306F\u6B21\u306F\u6771\u4EAC\u3067\u4F9D\u983C\u306B\u5FDC\u3058\u308B\u3002^pr:i n:friend|pl/v:answer|base/det:a n:request/prep:in n:Tokyo/idm:next_time",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u5EAD\u3067\u5199\u771F\u3092\u64AE\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:take|ing/det:a n:photo/prep:in det:the n:garden/adv:tomorrow",
    "3^\u3042\u306A\u305F\u306F\u6765\u9031\u30AB\u30D5\u30A7\u3067\u81EA\u8EE2\u8ECA\u3092\u501F\u308A\u308B\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:borrow|ing/det:a n:bicycle/prep:at det:the n:cafe/idm:next_week",
    "1^\u72AC\u306F\u6B69\u3044\u305F\u3002^det:the n:dog/v:walk|past",
    "3^\u3042\u306A\u305F\u306F\u671D\u306B\u75C5\u9662\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^pr:you/v:invite|past/det:a n:speaker/prep:at det:the n:hospital/prep:in det:the n:morning",
    "2^\u306D\u3053\u306F\u52D5\u7269\u5712\u3067\u304F\u3089\u3084\u307F\u3067\u6CF3\u3044\u3060\u3002^det:the n:cat/v:swim|past/idm:in_the_dark/prep:at det:the n:zoo",
    "2^\u30DF\u30AB\u306F\u6BCE\u65E5\u53F0\u6240\u3067\u5B8C\u307A\u304D\u306B\u96A0\u308C\u308B\u3002^n:Mika/v:hide|base/adv:perfectly/prep:in det:the n:kitchen/idm:every_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u3053\u3053\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:we/v:chill|past/adv:here",
    "2^\u7537\u306E\u5B50\u306F\u6BCE\u65E5\u4F53\u80B2\u9928\u306B\u7740\u3044\u305F\u3002^det:the n:boy/v:arrive|past/prep:in det:the n:gym/idm:every_day",
    "3^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u5E97\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u501F\u308A\u305F\u3002^pr:she/v:borrow|past/pr:i n:phone/prep:at det:the n:store/idm:last_time",
    "2^\u304B\u306E\u3058\u3087\u306F\u30AB\u30D5\u30A7\u3067\u304A\u91D1\u3092\u898B\u3064\u3051\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:find|base/n:money/prep:at det:the n:cafe",
    "2^\u3042\u306A\u305F\u306F\u99C5\u3067\u5F15\u304D\u51FA\u3057\u3092\u5F15\u3044\u305F\u3002^pr:you/v:pull|past/det:a n:drawer/prep:at det:the n:station",
    "3^\u7537\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^det:the n:boy/v:invite|past/det:a n:speaker/prep:in det:the n:gym",
    "3^\u5148\u751F\u306F\u7A7A\u6E2F\u3067\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u3092\u4F7F\u3046\u3002^det:the n:teacher/v:use|base/det:a n:credit_card/prep:at det:the n:airport",
    "2^\u306D\u3053\u306F\u5EAD\u3067\u52DD\u3066\u305F\u3002^det:the n:cat/modal:could v:win|base/prep:in det:the n:garden",
    "3^\u308F\u305F\u3057\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u5207\u7B26\u3092\u5F97\u610F\u3052\u306B\u78BA\u8A8D\u3057\u3066\u3044\u308B\u3002^pr:i/be:pres v:check|ing/det:a n:ticket/adv:proudly/prep:at det:the n:supermarket",
    "2^\u306D\u3053\u306F\u6B21\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6CE3\u304F\u3002^det:the n:cat/v:cry|base/prep:in pr:i n:room/idm:next_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u524D\u56DE\u306F\u82B1\u3092\u8CB7\u3063\u305F\u3002^pr:i n:dad/v:buy|past/det:a n:flower/idm:last_time",
    "1^\u308F\u305F\u3057\u306F\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u305F\u3002^pr:i/v:feed|past/n:fish",
    "3^\u5973\u306E\u5B50\u306F\u660E\u65E5\u5E97\u3067\u304F\u3089\u3084\u307F\u3067\u307B\u307B\u3048\u3080\u4E88\u5B9A\u3060\u3002^det:the n:girl/be:pres v:smile|ing/idm:in_the_dark/prep:at det:the n:store/adv:tomorrow",
    "3^\u304A\u7236\u3055\u3093\u306F\u30D0\u30B9\u505C\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^pr:i n:dad/v:follow|past/det:the n:bus/prep:at det:the n:bus_stop",
    "3^\u5148\u751F\u306F\u30D0\u30B9\u505C\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u304F\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:follow|base/det:the n:bus/prep:at det:the n:bus_stop",
    "2^\u72AC\u306F\u3082\u3046\u4E00\u5EA6\u6765\u308B\u3068\u3053\u308D\u3060\u3002^det:the n:dog/be:pres v:come|ing/adv:again",
    "3^\u3042\u306A\u305F\u306F2\u65E5\u524D\u30B9\u30FC\u30D1\u30FC\u3067\u96FB\u8ECA\u306B\u4E57\u3063\u305F\u3002^pr:you/v:ride|past/det:the n:train/prep:at det:the n:supermarket/idm:two_days_ago",
    "3^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u30B9\u30FC\u30D1\u30FC\u3067\u8CEA\u554F\u3092\u5F97\u610F\u3052\u306B\u4EE5\u524D\u306F\u3057\u3066\u3044\u305F\u3002^pr:i/sm:used_to v:ask|base/det:a n:question/adv:proudly/prep:at det:the n:supermarket/adv:today",
    "2^\u304A\u7236\u3055\u3093\u306F\u30DC\u30FC\u30C8\u306B\u3064\u3044\u306B\u4E57\u3063\u305F\u3002^pr:i n:dad/v:ride|past/det:a n:boat/adv:finally",
    "2^\u5973\u306E\u5B50\u306F\u3042\u305D\u3053\u3078\u9759\u304B\u306B\u884C\u3063\u305F\u3002^det:the n:girl/v:go|past/adv:quietly/adv:there",
    "3^\u304B\u308C\u306F\u3055\u3063\u304D\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u304B\u3070\u3093\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:he/v:bring|past/det:a n:bag/prep:at det:the n:restaurant/idm:just_now",
    "2^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u6025\u3050\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:hurry|base/prep:in det:the n:classroom",
    "2^\u5148\u751F\u306F\u7D50\u679C\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u78BA\u8A8D\u3059\u308B\u3002^det:the n:teacher/v:check|base/det:a n:result/idm:on_time",
    "1^\u304B\u308C\u3089\u306F\u5BDD\u305F\u3002^pr:they/v:sleep|past",
    "3^\u5148\u751F\u306F\u5915\u65B9\u306B\u8CEA\u554F\u3092\u4EE5\u524D\u306F\u3057\u3066\u3044\u305F\u3002^det:the n:teacher/sm:used_to v:ask|base/det:a n:question/prep:in det:the n:evening",
    "2^\u3042\u306A\u305F\u306F\u516C\u5712\u3067\u5B89\u5168\u306B\u7B11\u3046\u3060\u308D\u3046\u3002^pr:you/modal:will v:laugh|base/adv:safely/prep:in det:the n:park",
    "2^\u5973\u306E\u5B50\u306F\u3042\u305D\u3053\u3067\u91CE\u83DC\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:buy|ing/n:vegetables/adv:there",
    "2^\u30DF\u30AB\u306F2\u6642\u9593\u307E\u3063\u305F\u308A\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:chill|base/idm:for_two_hours",
    "2^\u304B\u306E\u3058\u3087\u306F\u53F0\u6240\u3067\u6A5F\u68B0\u3092\u4F5C\u308B\u3002^pr:she/v:build|base/det:a n:machine/prep:in det:the n:kitchen",
    "2^\u5973\u306E\u5B50\u306F\u5E97\u3067\u4F11\u3080\u3002^det:the n:girl/v:rest|base/prep:at det:the n:store",
    "3^\u304A\u7236\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:i n:dad/v:ask|past/det:a n:question/prep:at det:the n:cafe",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u5B66\u6821\u3067\u5BDD\u305F\u3002^pr:we/v:sleep|past/idm:at_school/idm:all_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F2\u6642\u9593\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:we/v:shop|past/idm:for_two_hours",
    "2^\u304B\u308C\u306F\u5EAD\u3067\u6728\u3092\u898B\u305F\u3002^pr:he/v:see|past/det:a n:tree/prep:in det:the n:garden",
    "3^\u5148\u751F\u306F\u6559\u5BA4\u3067\u624B\u52A9\u3051\u3092\u3057\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:give|ing/n:help/prep:in det:the n:classroom",
    "1^\u304B\u308C\u3089\u306F\u4E00\u65E5\u3058\u3085\u3046\u5BB6\u3067\u6CF3\u3044\u3060\u3002^pr:they/v:swim|past/idm:at_home/idm:all_day",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u591C\u5854\u3092\u4F5C\u308B\u4E88\u5B9A\u3060\u3002^det:the n:boy/be:pres v:build|ing/det:a n:tower/adv:tonight",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5EAD\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:mom/v:jump|base/prep:in det:the n:garden",
    "3^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u53D6\u3063\u624B\u3092\u5F15\u304F\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:pull|base/det:a n:handle/prep:in det:the n:classroom",
    "2^\u30DF\u30AB\u306F\u671D\u306B\u30B1\u30FC\u30AD\u3092\u6301\u3063\u3066\u6765\u305F\u3002^n:Mika/v:bring|past/det:a n:cake/prep:in det:the n:morning",
    "2^\u53CB\u3060\u3061\u306F\u3055\u3063\u304D\u30CE\u30FC\u30C8\u3092\u501F\u308A\u305F\u3002^pr:i n:friend|pl/v:borrow|past/det:a n:notebook/idm:just_now",
    "2^\u304B\u308C\u3089\u306F\u5DDD\u306E\u305D\u3070\u3067\u3048\u3093\u3074\u3064\u3092\u501F\u308A\u305F\u3002^pr:they/v:borrow|past/det:a n:pencil/prep:by det:the n:river",
    "2^\u304B\u308C\u306F\u6BCE\u671D\u68EE\u3067\u304A\u91D1\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:he/v:have|base/n:money/prep:in det:the n:forest/idm:every_morning",
    "2^\u72AC\u306F\u4E0B\u624B\u306B\u30B8\u30E3\u30F3\u30D7\u3057\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:jump|ing/adv:badly",
    "2^\u5148\u751F\u306F\u3055\u3063\u304D\u3042\u305D\u3053\u3067\u30C9\u30EC\u30B9\u3092\u4F5C\u3063\u305F\u3002^det:the n:teacher/v:make|past/det:a n:dress/adv:there/idm:just_now",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3053\u3053\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:we/v:have|past/det:the n:computer/adv:here",
    "1^\u5973\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u6CE3\u3044\u305F\u3002^det:the n:girl/v:cry|past/idm:all_day",
    "2^\u304B\u308C\u3089\u306F\u6BCE\u65E5\u307C\u3046\u3057\u3092\u306A\u304F\u3059\u3002^pr:they/v:lose|base/det:a n:hat/idm:every_day",
    "3^\u53CB\u3060\u3061\u306F\u6628\u65E5\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u76EE\u3092\u5B88\u3063\u305F\u3002^pr:i n:friend|pl/v:protect|past/det:a n:eye/prep:at det:the n:restaurant/adv:yesterday",
    "2^\u304B\u308C\u3089\u306F\u6628\u591C\u68EE\u3067\u5BB6\u5177\u3092\u8CB7\u3063\u305F\u3002^pr:they/v:buy|past/n:furniture/prep:in det:the n:forest/idm:last_night",
    "1^\u304B\u308C\u3089\u306F\u3055\u3063\u304D\u30D6\u30FC\u30C4\u3092\u306F\u3044\u305F\u3002^pr:they/v:wear|past/n:boot|pl/idm:just_now",
    "2^\u304B\u308C\u3089\u306F2\u65E5\u524D\u5E97\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:they/v:shop|past/prep:at det:the n:store/idm:two_days_ago",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u65E5\u6559\u5BA4\u3067\u304A\u91D1\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u306A\u304F\u3059\u3002^pr:they/v:lose|base/n:money/idm:in_time/prep:in det:the n:classroom/adv:today",
    "1^\u5973\u306E\u5B50\u306F\u3053\u3053\u3067\u4F11\u3093\u3060\u3002^det:the n:girl/v:rest|past/adv:here",
    "3^\u5973\u306E\u5B50\u306F\u660E\u65E5\u68EE\u3067\u30C6\u30FC\u30D6\u30EB\u3092\u4F5C\u308B\u4E88\u5B9A\u3060\u3002^det:the n:girl/be:pres v:make|ing/det:a n:table/prep:in det:the n:forest/adv:tomorrow",
    "2^\u308F\u305F\u3057\u306F\u53E3\u3092\u8FD1\u304F\u3067\u958B\u3044\u305F\u3002^pr:i/v:open|past/pr:i n:mouth/adv:nearby",
    "2^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u68EE\u3067\u304A\u91D1\u3092\u3042\u3052\u305F\u3002^n:Mika/v:give|past/n:money/prep:in det:the n:forest/idm:all_day",
    "2^\u3042\u306A\u305F\u306F\u3059\u3070\u3084\u304F\u307B\u307B\u3048\u3093\u3067\u3044\u308B\u3002^pr:you/be:pres v:smile|ing/adv:quickly",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u30E9\u30F3\u30C1\u3092\u6301\u3063\u3066\u304F\u308B\u3002^pr:we/v:bring|base/n:lunch/adv:now",
    "3^\u308F\u305F\u3057\u306F\u660E\u65E5\u52D5\u7269\u5712\u3067\u304B\u3070\u3093\u3092\u501F\u308A\u308B\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:borrow|ing/det:a n:bag/prep:at det:the n:zoo/adv:tomorrow",
    "2^\u308F\u305F\u3057\u306F\u6628\u591C\u304B\u3055\u3092\u4E0B\u624B\u306B\u904B\u3093\u3060\u3002^pr:i/v:carry|past/det:a n:umbrella/adv:badly/idm:last_night",
    "2^\u306D\u3053\u306F\u6559\u5BA4\u3078\u884C\u3063\u305F\u3002^det:the n:cat/v:go|past/prep:to det:the n:classroom",
    "2^\u30DF\u30AB\u306F\u4ECA\u591C\u3064\u3044\u306B\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:hide|base/adv:finally/adv:tonight",
    "1^\u72AC\u306F\u3042\u305D\u3053\u3067\u96A0\u308C\u305F\u3002^det:the n:dog/v:hide|past/adv:there",
    "1^\u304B\u306E\u3058\u3087\u306F\u4ECA\u53EB\u3076\u3002^pr:she/v:shout|base/adv:now",
    "2^\u3042\u306A\u305F\u306F\u30B9\u30FC\u30C4\u3092\u7740\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:wear|base/det:a n:suit",
    "2^\u53CB\u3060\u3061\u306F\u6559\u5BA4\u3067\u6B69\u304F\u3002^pr:i n:friend|pl/v:walk|base/prep:in det:the n:classroom",
    "2^\u5148\u751F\u306F\u6628\u65E5\u6D77\u8FBA\u3067\u8E0A\u3063\u305F\u3002^det:the n:teacher/v:dance|past/prep:on det:the n:beach/adv:yesterday",
    "2^\u304B\u308C\u3089\u306F\u7A7A\u6E2F\u3067\u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC\u306B\u4E57\u308B\u3002^pr:they/v:ride|base/det:a n:escalator/prep:at det:the n:airport",
    "1^\u72AC\u306F\u3042\u305D\u3053\u3078\u6765\u305F\u3002^det:the n:dog/v:come|past/adv:there",
    "2^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u99C5\u3067\u697D\u3057\u305D\u3046\u306B\u6CF3\u3050\u3002^n:Ken/v:swim|base/adv:happily/prep:at det:the n:station/adv:soon",
    "2^\u304A\u7236\u3055\u3093\u306F\u5EAD\u3067\u53EB\u3076\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:shout|base/prep:in det:the n:garden",
    "2^\u3042\u306A\u305F\u306F\u4E00\u65E5\u3058\u3085\u3046\u3042\u305D\u3053\u3067\u52D5\u753B\u3092\u898B\u305F\u3002^pr:you/v:watch|past/det:a n:video/adv:there/idm:all_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5B66\u6821\u3067\u6CE3\u3044\u305F\u3002^pr:we/v:cry|past/idm:at_school/idm:this_afternoon",
    "2^\u304B\u306E\u3058\u3087\u306F\u8CEA\u554F\u3092\u3084\u3055\u3057\u304F\u3057\u305F\u3002^pr:she/v:ask|past/det:a n:question/adv:softly",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u30A2\u30A4\u30C7\u30A2\u304C\u3042\u308B\u3002^pr:they/v:have|base/det:a n:idea/adv:now",
    "3^\u304B\u308C\u3089\u306F\u4F1A\u793E\u3067\u98DF\u5668\u68DA\u3092\u9589\u3081\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:close|base/det:a n:cupboard/prep:at det:the n:office",
    "2^\u5973\u306E\u5B50\u306F\u7384\u95A2\u306E\u304B\u3093\u305F\u3093\u306B\u547C\u3073\u51FA\u3057\u306B\u5FDC\u3058\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:answer|base/det:the n:door/adv:easily",
    "2^\u53CB\u3060\u3061\u306F7\u6642\u306B\u5DDD\u306E\u305D\u3070\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^pr:i n:friend|pl/v:relax|base/prep:by det:the n:river/idm:at_seven",
    "2^\u3042\u306A\u305F\u306F\u6559\u5BA4\u3067\u8E0A\u3063\u3066\u3044\u308B\u3002^pr:you/be:pres v:dance|ing/prep:in det:the n:classroom",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u671D\u5B66\u6821\u3067\u8F9E\u66F8\u3092\u4F7F\u3063\u305F\u3002^pr:i n:dad/v:use|past/det:a n:dictionary/idm:at_school/idm:this_morning",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u52D5\u7269\u5712\u3067\u53EB\u3076\u3002^det:the n:boy/v:shout|base/prep:at det:the n:zoo/adv:now",
    "3^\u53CB\u3060\u3061\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u30B3\u30FC\u30D2\u30FC\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:make|base/n:coffee/prep:in pr:i n:room",
    "2^\u5973\u306E\u5B50\u306F7\u6642\u306B\u305B\u3063\u3051\u3093\u3092\u4F7F\u3046\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:use|base/n:soap/idm:at_seven",
    "3^\u5148\u751F\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u9001\u3063\u305F\u3002^det:the n:teacher/v:send|past/det:a n:message/prep:at det:the n:restaurant",
    "3^\u30B1\u30F3\u306F\u6B21\u306F\u7A7A\u6E2F\u3067\u9B5A\u306B\u304B\u3093\u305F\u3093\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3002^n:Ken/v:feed|base/n:fish/adv:easily/prep:at det:the n:airport/idm:next_time",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u6559\u5BA4\u3067\u307B\u307B\u3048\u3080\u3002^pr:i/v:smile|base/prep:in det:the n:classroom/adv:today",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u5207\u7B26\u3092\u8CB7\u3046\u3002^pr:we/v:buy|base/det:a n:ticket/prep:at det:the n:supermarket",
    "1^\u30B1\u30F3\u306F\u30B5\u30F3\u30C9\u30A4\u30C3\u30C1\u3092\u4F5C\u3063\u305F\u3002^n:Ken/v:make|past/det:a n:sandwich",
    "2^\u304A\u7236\u3055\u3093\u306F\u6BCE\u65E5\u30B9\u30FC\u30D1\u30FC\u3067\u8E0A\u3063\u305F\u3002^pr:i n:dad/v:dance|past/prep:at det:the n:supermarket/idm:every_day",
    "2^\u308F\u305F\u3057\u306F\u79D8\u5BC6\u57FA\u5730\u3092\u4E0B\u624B\u306B\u4F5C\u308B\u3002^pr:i/v:build|base/det:a n:fort/adv:badly",
    "2^\u5148\u751F\u306F\u5B66\u6821\u3067\u96EA\u3060\u308B\u307E\u3092\u4F5C\u308B\u3002^det:the n:teacher/v:build|base/det:a n:snowman/idm:at_school",
    "2^\u30DF\u30AB\u306F\u8B1B\u6F14\u8005\u3092\u8FD1\u304F\u3067\u62DB\u5F85\u3057\u305F\u3002^n:Mika/v:invite|past/det:a n:speaker/idm:close_by",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u304B\u3055\u3092\u5F97\u610F\u3052\u306B\u501F\u308A\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:borrow|ing/det:a n:umbrella/adv:proudly/adv:tonight",
    "1^\u5148\u751F\u306F\u6B21\u306F\u307E\u3063\u305F\u308A\u3059\u308B\u3002^det:the n:teacher/v:chill|base/idm:next_time",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u591C\u7740\u304F\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:arrive|ing/adv:tonight",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u307B\u307B\u3048\u3093\u3060\u3002^pr:we/v:smile|past/idm:in_time",
    "1^\u30B1\u30F3\u306F\u305F\u304F\u3055\u3093\u6CE3\u304F\u3002^n:Ken/v:cry|base/idm:a_lot",
    "2^\u5973\u306E\u5B50\u306F\u3042\u305D\u3053\u3067\u6CF3\u3044\u3067\u3044\u308B\u3002^det:the n:girl/be:pres v:swim|ing/adv:there",
    "2^\u5973\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3078\u884C\u3063\u305F\u3002^det:the n:girl/v:go|past/prep:to pr:i n:room",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30AB\u30D5\u30A7\u3067\u304B\u3093\u305F\u3093\u306B\u6CF3\u3044\u3060\u3002^pr:we/v:swim|past/adv:easily/prep:at det:the n:cafe",
    "3^\u7537\u306E\u5B50\u306F\u6B21\u306F\u4F1A\u793E\u3067\u672C\u3092\u3042\u3052\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:give|base/det:a n:book/prep:at det:the n:office/idm:next_time",
    "2^\u304B\u306E\u3058\u3087\u306F\u3055\u3063\u304D\u4F53\u80B2\u9928\u3067\u6B69\u3044\u305F\u3002^pr:she/v:walk|past/prep:in det:the n:gym/idm:just_now",
    "2^\u7537\u306E\u5B50\u306F2\u6642\u9593\u3053\u3053\u3067\u8D70\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:run|base/adv:here/idm:for_two_hours",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u65E5\u5B8C\u307A\u304D\u306B\u6025\u3050\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:hurry|base/adv:perfectly/adv:today",
    "2^\u30B1\u30F3\u306F\u3055\u3063\u304D\u4F1A\u793E\u3078\u65C5\u884C\u3057\u305F\u3002^n:Ken/v:travel|past/prep:to det:the n:office/idm:just_now",
    "2^\u306D\u3053\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8E0A\u308B\u3002^det:the n:cat/v:dance|base/prep:at det:the n:restaurant",
    "2^\u306D\u3053\u306F\u3053\u3053\u3067\u516C\u6F14\u3092\u4EE5\u524D\u306F\u898B\u3066\u3044\u305F\u3002^det:the n:cat/sm:used_to v:watch|base/det:a n:performance/adv:here",
    "1^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u96A0\u308C\u308B\u3002^pr:i/v:hide|base/idm:this_afternoon",
    "1^\u30DF\u30AB\u306F\u5148\u9031\u6765\u305F\u3002^n:Mika/v:come|past/idm:last_week",
    "3^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u68EE\u3067\u30EA\u30B9\u30C8\u3092\u78BA\u8A8D\u3059\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:check|base/det:a n:list/prep:in det:the n:forest/adv:soon",
    "3^\u5148\u751F\u306F\u7A7A\u6E2F\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u7A81\u7136\u306A\u304F\u3057\u305F\u3002^det:the n:teacher/v:lose|past/pr:i n:phone/adv:suddenly/prep:at det:the n:airport",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u3042\u305D\u3053\u3067\u725B\u4E73\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^pr:we/be:pres v:buy|ing/n:milk/adv:there/adv:now",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30D0\u30B9\u505C\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u4F7F\u3046\u3002^pr:we/v:use|base/det:a n:laptop/prep:at det:the n:bus_stop",
    "2^\u30B1\u30F3\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u4EE5\u524D\u306F\u6B69\u3044\u3066\u3044\u305F\u3002^n:Ken/sm:used_to v:walk|base/idm:this_afternoon",
    "1^\u304B\u306E\u3058\u3087\u306F\u5148\u9031\u30B7\u30E3\u30F3\u30D7\u30FC\u3092\u4F7F\u3063\u305F\u3002^pr:she/v:use|past/n:shampoo/idm:last_week",
    "2^\u304B\u308C\u306F\u4ECA\u4F53\u80B2\u9928\u3067\u6B69\u304F\u3002^pr:he/v:walk|base/prep:in det:the n:gym/adv:now",
    "2^\u306D\u3053\u306F\u6771\u4EAC\u3067\u5BDD\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:sleep|ing/prep:in n:Tokyo",
    "2^\u30DF\u30AB\u306F\u6012\u3063\u3066\u307E\u3063\u305F\u308A\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:chill|base/adv:angrily",
    "2^\u304B\u308C\u3089\u306F\u6B21\u306F\u5E97\u3067\u5BDD\u308B\u3002^pr:they/v:sleep|base/prep:at det:the n:store/idm:next_time",
    "2^\u30DF\u30AB\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u4F11\u3093\u3060\u3002^n:Mika/v:rest|past/prep:in pr:i n:room",
    "2^\u72AC\u306F\u5148\u9031\u5207\u7B26\u3092\u6301\u3063\u3066\u3044\u305F\u3002^det:the n:dog/v:have|past/det:a n:ticket/idm:last_week",
    "2^\u308F\u305F\u3057\u306F\u30D1\u30BD\u30B3\u30F3\u3092\u5B89\u5168\u306B\u76F4\u3059\u3002^pr:i/v:fix|base/det:the n:computer/adv:safely",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u307B\u307B\u3048\u3080\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:smile|base",
    "3^\u7537\u306E\u5B50\u306F\u591C\u306B\u8CEA\u554F\u3092\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:ask|base/det:a n:question/prep:at n:night",
    "3^\u30DF\u30AB\u306F\u671D\u306B\u4F53\u80B2\u9928\u3067\u3066\u3044\u306D\u3044\u306B\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:jump|base/adv:politely/prep:in det:the n:gym/prep:in det:the n:morning",
    "1^\u5973\u306E\u5B50\u306F\u6628\u65E5\u7740\u3044\u305F\u3002^det:the n:girl/v:arrive|past/adv:yesterday",
    "1^\u304B\u306E\u3058\u3087\u306F7\u6642\u306B\u65C5\u884C\u3057\u305F\u3002^pr:she/v:travel|past/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u7A7A\u6E2F\u3067\u6CE3\u3044\u305F\u3002^n:Mika/v:cry|past/prep:at det:the n:airport",
    "2^\u30DF\u30AB\u306F\u591C\u306B\u3042\u305D\u3053\u3067\u50CD\u304F\u3002^n:Mika/v:work|base/adv:there/prep:at n:night",
    "2^\u30DF\u30AB\u306F\u52D5\u7269\u5712\u3067\u7A81\u7136\u307B\u307B\u3048\u3080\u3002^n:Mika/v:smile|base/adv:suddenly/prep:at det:the n:zoo",
    "3^\u304B\u308C\u3089\u306F\u524D\u56DE\u306F\u6559\u5BA4\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u305F\u3002^pr:they/v:check|past/det:a n:result/prep:in det:the n:classroom/idm:last_time",
    "2^\u7537\u306E\u5B50\u306F\u6628\u65E5\u672C\u3092\u58F2\u3063\u305F\u3002^det:the n:boy/v:sell|past/det:a n:book/adv:yesterday",
    "2^\u304B\u308C\u3089\u306F\u660E\u65E5\u60C5\u5831\u3092\u89AA\u5207\u306B\u9001\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:send|ing/n:information/adv:kindly/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u3055\u3063\u304D\u3053\u3053\u3067\u98DF\u3079\u7269\u3092\u904B\u3093\u3060\u3002^pr:i n:friend|pl/v:carry|past/n:food/adv:here/idm:just_now",
    "2^\u304B\u308C\u3089\u306F\u98DF\u3079\u7269\u3092\u904B\u3076\u3060\u308D\u3046\u3002^pr:they/modal:will v:carry|base/n:food",
    "2^\u304B\u306E\u3058\u3087\u306F\u5DDD\u306E\u305D\u3070\u3067\u5065\u5EB7\u3092\u5B88\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:protect|base/n:health/prep:by det:the n:river",
    "2^\u304B\u308C\u306F\u3053\u3053\u3067\u5EAD\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:he/v:have|base/det:a n:garden/adv:here",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u75C5\u9662\u3067\u307C\u3046\u3057\u3092\u306A\u304F\u3059\u3002^pr:i n:mom/v:lose|base/det:a n:hat/prep:at det:the n:hospital",
    "2^\u304B\u308C\u3089\u306F\u3055\u3063\u304D\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8E0A\u3063\u305F\u3002^pr:they/v:dance|past/prep:at det:the n:restaurant/idm:just_now",
    "2^\u304B\u306E\u3058\u3087\u306F\u3082\u3046\u3059\u3050\u516C\u6F14\u3092\u898B\u308B\u3002^pr:she/v:watch|base/det:a n:performance/adv:soon",
    "2^\u306D\u3053\u306F\u6C34\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u6301\u3063\u3066\u304F\u308B\u3002^det:the n:cat/v:bring|base/n:water/idm:in_time",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u53F0\u6240\u3067\u3044\u3063\u3057\u3087\u306B\u8E0A\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:dance|base/adv:together/prep:in det:the n:kitchen/adv:tomorrow",
    "1^\u306D\u3053\u306F\u4ECA\u671D\u8E0A\u3063\u305F\u3002^det:the n:cat/v:dance|past/idm:this_morning",
    "2^\u308F\u305F\u3057\u306F\u6765\u9031\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:invite|ing/det:a n:speaker/idm:next_week",
    "2^\u304B\u308C\u306F\u4ECA\u671D\u8A66\u5408\u3092\u898B\u305F\u3002^pr:he/v:watch|past/det:the n:game/idm:this_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F7\u6642\u306B\u5199\u771F\u3092\u64AE\u308B\u3002^pr:we/v:take|base/det:a n:photo/idm:at_seven",
    "3^\u30B1\u30F3\u306F\u660E\u65E5\u68EE\u3067\u8ECA\u306B\u3064\u3044\u3066\u3044\u304F\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:follow|ing/det:the n:car/prep:in det:the n:forest/adv:tomorrow",
    "1^\u7537\u306E\u5B50\u306F2\u6642\u9593\u6CE3\u3044\u305F\u3002^det:the n:boy/v:cry|past/idm:for_two_hours",
    "2^\u7537\u306E\u5B50\u306F\u30D0\u30B9\u505C\u3067\u52DD\u3064\u3002^det:the n:boy/v:win|base/prep:at det:the n:bus_stop",
    "3^\u304A\u7236\u3055\u3093\u306F\u4F53\u80B2\u9928\u3067\u6C34\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u3042\u3052\u308B\u3002^pr:i n:dad/v:give|base/n:water/idm:on_time/prep:in det:the n:gym",
    "2^\u3042\u306A\u305F\u306F\u6D77\u8FBA\u3067\u96A0\u308C\u3066\u3044\u308B\u3002^pr:you/be:pres v:hide|ing/prep:on det:the n:beach",
    "3^\u3042\u306A\u305F\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u76BF\u3092\u6D17\u3046\u3060\u308D\u3046\u3002^pr:you/modal:will v:do|base/det:the n:dishes/prep:in pr:i n:room",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u671D\u4F1A\u793E\u3067\u4E0B\u624B\u306B\u8E0A\u3063\u305F\u3002^pr:i n:friend|pl/v:dance|past/adv:badly/prep:at det:the n:office/idm:this_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u591C\u56F3\u66F8\u9928\u3067\u8FD1\u304F\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:we/v:relax|past/adv:nearby/prep:in det:the n:library/idm:last_night",
    "3^\u30B1\u30F3\u306F\u6BCE\u65E5\u6D77\u8FBA\u3067\u30EC\u30DD\u30FC\u30C8\u3092\u78BA\u8A8D\u3057\u305F\u3002^n:Ken/v:check|past/det:a n:report/prep:on det:the n:beach/idm:every_day",
    "2^\u30DF\u30AB\u306F\u56F3\u66F8\u9928\u3067\u98DF\u5668\u68DA\u3092\u958B\u3051\u305F\u3002^n:Mika/v:open|past/det:a n:cupboard/prep:in det:the n:library",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u65E5\u304F\u3060\u3082\u306E\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:buy|ing/n:fruit/adv:today",
    "2^\u308F\u305F\u3057\u306F\u4F1A\u793E\u3067\u91CE\u83DC\u3092\u690D\u3048\u308B\u3002^pr:i/v:plant|base/n:vegetables/prep:at det:the n:office",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u96A0\u308C\u308B\u3002^pr:i n:mom/v:hide|base/prep:in pr:i n:room",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u3055\u3063\u304D\u3053\u3053\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u305F\u3002^pr:i n:mom/v:check|past/det:a n:result/adv:here/idm:just_now",
    "2^\u53CB\u3060\u3061\u306F\u591C\u306B\u6CF3\u3050\u3002^pr:i n:friend|pl/v:swim|base/prep:at n:night",
    "2^\u304B\u308C\u3089\u306F\u6D77\u8FBA\u3067\u76EE\u3092\u9589\u3058\u308B\u3002^pr:they/v:close|base/det:a n:eye/prep:on det:the n:beach",
    "2^\u7537\u306E\u5B50\u306F\u30AB\u30D5\u30A7\u3067\u670D\u3092\u58F2\u3063\u305F\u3002^det:the n:boy/v:sell|past/n:clothes/prep:at det:the n:cafe",
    "3^\u3042\u306A\u305F\u306F2\u65E5\u524D\u516C\u5712\u3067\u9774\u3092\u3059\u3070\u3084\u304F\u8CB7\u3063\u305F\u3002^pr:you/v:buy|past/n:shoe|pl/adv:quickly/prep:in det:the n:park/idm:two_days_ago",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u671D\u5BDD\u308B\u3002^pr:we/v:sleep|base/idm:every_morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6D77\u8FBA\u3067\u30DA\u30F3\u3092\u306A\u304F\u3057\u305F\u3002^pr:we/v:lose|past/det:a n:pen/prep:on det:the n:beach",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F2\u6642\u9593\u30B9\u30FC\u30D1\u30FC\u3067\u304B\u3055\u3092\u501F\u308A\u305F\u3002^pr:we/v:borrow|past/det:a n:umbrella/prep:at det:the n:supermarket/idm:for_two_hours",
    "3^\u306D\u3053\u306F\u56F3\u66F8\u9928\u3067\u672C\u3092\u6301\u3063\u3066\u304F\u308B\u3002^det:the n:cat/v:bring|base/det:a n:book/prep:in det:the n:library",
    "2^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u904B\u52D5\u3092\u5F97\u610F\u3052\u306B\u3057\u305F\u3002^n:Mika/v:do|past/n:exercise/adv:proudly/idm:all_day",
    "2^\u306D\u3053\u306F\u6628\u591C\u5BB6\u3067\u3044\u3063\u3057\u3087\u306B\u6CE3\u3044\u305F\u3002^det:the n:cat/v:cry|past/adv:together/idm:at_home/idm:last_night",
    "2^\u304B\u306E\u3058\u3087\u306F\u5E97\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:chill|base/prep:at det:the n:store",
    "2^\u72AC\u306F\u660E\u65E5\u8FD1\u304F\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:walk|base/adv:nearby/adv:tomorrow",
    "2^\u5973\u306E\u5B50\u306F\u6BCE\u671D\u52DD\u3066\u308B\u3002^det:the n:girl/modal:can v:win|base/idm:every_morning",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u56F3\u66F8\u9928\u3067\u5199\u771F\u3092\u64AE\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:take|base/det:a n:photo/prep:in det:the n:library",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u65E5\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8A71\u3059\u3002^pr:we/v:talk|base/prep:at det:the n:restaurant/idm:every_day",
    "1^\u7537\u306E\u5B50\u306F2\u6642\u9593\u52DD\u3063\u305F\u3002^det:the n:boy/v:win|past/idm:for_two_hours",
    "2^\u5148\u751F\u306F\u524D\u56DE\u306F\u304A\u3082\u3061\u3083\u3092\u4F5C\u3063\u305F\u3002^det:the n:teacher/v:make|past/det:a n:toy/idm:last_time",
    "2^\u304B\u306E\u3058\u3087\u306F\u4F53\u80B2\u9928\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:she/v:shop|past/prep:in det:the n:gym",
    "2^\u308F\u305F\u3057\u306F\u99C5\u3067\u6025\u3044\u3060\u3002^pr:i/v:hurry|past/prep:at det:the n:station",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u591C\u306B\u30D0\u30B9\u505C\u3067\u770B\u677F\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:see|base/det:a n:sign/prep:at det:the n:bus_stop/prep:at n:night",
    "2^\u5973\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u96FB\u8A71\u306B\u51FA\u305F\u3002^det:the n:girl/v:answer|past/pr:i n:phone",
    "1^\u306D\u3053\u306F\u304F\u3089\u3084\u307F\u3067\u96A0\u308C\u305F\u3002^det:the n:cat/v:hide|past/idm:in_the_dark",
    "2^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u5E97\u306B\u7740\u3044\u305F\u3002^pr:i n:friend|pl/v:arrive|past/prep:at det:the n:store/idm:all_day",
    "2^\u3042\u306A\u305F\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3078\u884C\u3051\u308B\u3002^pr:you/modal:can v:go|base/prep:to pr:i n:room",
    "2^\u30B1\u30F3\u306F\u6D77\u8FBA\u3067\u6CE3\u304F\u3002^n:Ken/v:cry|base/prep:on det:the n:beach",
    "2^\u304B\u308C\u306F\u6D77\u8FBA\u3067\u8089\u3092\u8CB7\u3046\u3002^pr:he/v:buy|base/n:meat/prep:on det:the n:beach",
    "3^\u53CB\u3060\u3061\u306F\u3055\u3063\u304D\u53F0\u6240\u3067\u30EA\u30E5\u30C3\u30AF\u3092\u904B\u3093\u3060\u3002^pr:i n:friend|pl/v:carry|past/det:a n:backpack/prep:in det:the n:kitchen/idm:just_now",
    "2^\u30DF\u30AB\u306F\u671D\u306B\u6CE3\u3044\u305F\u3002^n:Mika/v:cry|past/prep:in det:the n:morning",
    "1^\u5148\u751F\u306F\u6642\u9593\u3069\u304A\u308A\u306B\u96A0\u308C\u305F\u3002^det:the n:teacher/v:hide|past/idm:on_time",
    "2^\u308F\u305F\u3057\u306F\u5E97\u3067\u8349\u3092\u690D\u3048\u305F\u3002^pr:i/v:plant|past/n:grass/prep:at det:the n:store",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u8CEA\u554F\u306B\u8FD1\u304F\u3067\u7B54\u3048\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:answer|ing/det:a n:question/adv:nearby/idm:this_afternoon",
    "2^\u53CB\u3060\u3061\u306F\u7DF4\u7FD2\u3092\u89AA\u5207\u306B\u3057\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:do|ing/n:practice/adv:kindly",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u6771\u4EAC\u3067\u30BF\u30AA\u30EB\u3092\u3064\u3044\u306B\u6301\u3063\u3066\u304F\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:bring|base/det:a n:towel/adv:finally/prep:in n:Tokyo",
    "3^\u306D\u3053\u306F\u671D\u306B\u5BB6\u3067\u7B54\u3048\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:cat/v:find|past/det:a n:answer/idm:at_home/prep:in det:the n:morning",
    "1^\u3042\u306A\u305F\u306F\u3055\u3063\u304D\u6025\u3044\u3060\u3002^pr:you/v:hurry|past/idm:just_now",
    "1^\u5973\u306E\u5B50\u306F\u6628\u591C\u6765\u305F\u3002^det:the n:girl/v:come|past/idm:last_night",
    "2^\u304B\u308C\u3089\u306F\u5B66\u6821\u3067\u5EAD\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:have|base/det:a n:garden/idm:at_school",
    "2^\u304B\u308C\u306F\u6BCE\u9031\u65E5\u66DC\u65E5\u4F1A\u793E\u306B\u4EE5\u524D\u306F\u7740\u3044\u3066\u3044\u305F\u3002^pr:he/sm:used_to v:arrive|base/prep:at det:the n:office/idm:every_Sunday",
    "1^\u304B\u308C\u306F\u3042\u305D\u3053\u3067\u6B69\u3044\u305F\u3002^pr:he/v:walk|past/adv:there",
    "2^\u30DF\u30AB\u306F\u68EE\u3067\u6025\u3044\u3060\u3002^n:Mika/v:hurry|past/prep:in det:the n:forest",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u53F0\u6240\u3067\u82B1\u3092\u3042\u3052\u305F\u3002^pr:i n:dad/v:give|past/det:a n:flower/prep:in det:the n:kitchen/idm:this_afternoon",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u6D77\u8FBA\u3067\u8D70\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:run|base/prep:on det:the n:beach/adv:tomorrow",
    "2^\u304B\u306E\u3058\u3087\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u81EA\u8EE2\u8ECA\u3092\u76F4\u3059\u3060\u308D\u3046\u3002^pr:she/modal:will v:fix|base/det:a n:bicycle/idm:this_afternoon",
    "2^\u5973\u306E\u5B50\u306F\u30B7\u30E3\u30C4\u3092\u7740\u308B\u3002^det:the n:girl/v:wear|base/det:a n:shirt",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30AB\u30D5\u30A7\u3067\u53EB\u3076\u3002^pr:we/v:shout|base/prep:at det:the n:cafe",
    "2^\u304B\u306E\u3058\u3087\u306F\u30D0\u30B9\u505C\u3067\u8D70\u308B\u3002^pr:she/v:run|base/prep:at det:the n:bus_stop",
    "2^\u5973\u306E\u5B50\u306F\u6771\u4EAC\u3067\u661F\u3092\u898B\u308B\u3002^det:the n:girl/v:see|base/det:a n:star/prep:in n:Tokyo",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6559\u5BA4\u3067\u8FD1\u304F\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:we/v:shop|past/adv:nearby/prep:in det:the n:classroom",
    "2^\u306D\u3053\u306F\u6D77\u3078\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:come|base/prep:to det:the n:beach",
    "1^\u304B\u308C\u3089\u306F\u6C34\u3092\u904B\u3093\u3060\u3002^pr:they/v:carry|past/n:water",
    "3^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u6D77\u8FBA\u3067\u3055\u3044\u3075\u3092\u89AA\u5207\u306B\u898B\u3064\u3051\u305F\u3002^n:Mika/v:find|past/det:a n:wallet/adv:kindly/prep:on det:the n:beach/idm:all_day",
    "2^\u5148\u751F\u306F\u4ECA\u591C\u8ECA\u306B\u3064\u3044\u3066\u3044\u304F\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:follow|base/det:the n:car/adv:tonight",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6B21\u306F\u7B11\u3046\u3002^pr:we/v:laugh|base/idm:next_time",
    "3^\u53CB\u3060\u3061\u306F\u30D0\u30B9\u505C\u3067\u5BB6\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:i n:friend|pl/v:have|past/det:a n:house/prep:at det:the n:bus_stop",
    "3^\u306D\u3053\u306F\u591C\u306B\u6D77\u8FBA\u3067\u8E0A\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:dance|base/prep:on det:the n:beach/prep:at n:night",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u3042\u305D\u3053\u3067\u7B11\u3063\u305F\u3002^pr:i n:friend|pl/v:laugh|past/adv:there/adv:today",
    "3^\u7537\u306E\u5B50\u306F\u6765\u9031\u3053\u3053\u3067\u53D6\u3063\u624B\u3092\u5F15\u304F\u4E88\u5B9A\u3060\u3002^det:the n:boy/be:pres v:pull|ing/det:a n:handle/adv:here/idm:next_week",
    "2^\u30DF\u30AB\u306F\u5148\u9031\u30C6\u30EC\u30D3\u3092\u898B\u305F\u3002^n:Mika/v:watch|past/det:the n:TV/idm:last_week",
    "3^\u5973\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u30B9\u30FC\u30D1\u30FC\u3067\u53EB\u3076\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:shout|base/prep:at det:the n:supermarket/adv:soon",
    "1^\u304A\u7236\u3055\u3093\u306F\u3082\u3046\u4E00\u5EA6\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:i n:dad/v:shop|base/adv:again",
    "3^\u5148\u751F\u306F\u7A7A\u6E2F\u3067\u98DF\u3079\u7269\u3092\u4EE5\u524D\u306F\u8CB7\u3063\u3066\u3044\u305F\u3002^det:the n:teacher/sm:used_to v:buy|base/n:food/prep:at det:the n:airport",
    "1^\u53CB\u3060\u3061\u306F7\u6642\u306B\u53EB\u3076\u3002^pr:i n:friend|pl/v:shout|base/idm:at_seven",
    "1^\u3042\u306A\u305F\u306F\u304F\u3089\u3084\u307F\u3067\u53EB\u3093\u3060\u3002^pr:you/v:shout|past/idm:in_the_dark",
    "3^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:have|base/det:the n:computer/prep:in det:the n:park",
    "2^\u30DF\u30AB\u306F\u7A7A\u6E2F\u3078\u65C5\u884C\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:travel|base/prep:to det:the n:airport",
    "2^\u5973\u306E\u5B50\u306F\u96EA\u3060\u308B\u307E\u3092\u3066\u3044\u306D\u3044\u306B\u4F5C\u3063\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:build|ing/det:a n:snowman/adv:carefully",
    "2^\u30DF\u30AB\u306F\u3055\u3063\u304D\u5EAD\u3078\u305F\u304F\u3055\u3093\u65C5\u884C\u3057\u305F\u3002^n:Mika/v:travel|past/idm:a_lot/prep:to det:the n:garden/idm:just_now",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u52D5\u7269\u5712\u3067\u96A0\u308C\u305F\u3002^pr:we/v:hide|past/prep:at det:the n:zoo",
    "2^\u7537\u306E\u5B50\u306F7\u6642\u306B\u5BDD\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:sleep|base/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u6628\u591C\u5BB6\u3092\u6301\u3063\u3066\u3044\u305F\u3002^n:Mika/v:have|past/det:a n:house/idm:last_night",
    "3^\u53CB\u3060\u3061\u306F7\u6642\u306B\u3042\u305D\u3053\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u898B\u3064\u3051\u3089\u308C\u305F\u3002^pr:i n:friend|pl/modal:could v:find|base/pr:i n:phone/adv:there/idm:at_seven",
    "1^\u5148\u751F\u306F\u4ECA\u4F11\u3080\u3002^det:the n:teacher/v:rest|base/adv:now",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u671D\u8D70\u3063\u305F\u3002^pr:we/v:run|past/idm:this_morning",
    "2^\u53CB\u3060\u3061\u306F\u99C5\u3067\u8A71\u3057\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:talk|ing/prep:at det:the n:station",
    "2^\u306D\u3053\u306F\u3081\u304C\u306D\u3092\u3044\u3063\u3057\u3087\u306B\u306A\u304F\u3057\u305F\u3002^det:the n:cat/v:lose|past/n:glass|pl/adv:together",
    "2^\u304B\u308C\u3089\u306F\u6765\u9031\u8FD1\u304F\u3067\u5BDD\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:sleep|ing/idm:close_by/idm:next_week",
    "1^\u53CB\u3060\u3061\u306F\u3084\u3055\u3057\u304F\u307B\u307B\u3048\u3080\u3002^pr:i n:friend|pl/v:smile|base/adv:softly",
    "2^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^pr:i n:friend|pl/v:invite|past/det:a n:speaker/idm:all_day",
    "3^\u5148\u751F\u306F\u4ECA\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u672C\u3092\u3042\u3052\u308B\u3002^det:the n:teacher/v:give|base/det:a n:book/prep:in pr:i n:room/adv:now",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u7A81\u7136\u6CF3\u3050\u3002^pr:we/v:swim|base/adv:suddenly",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5B66\u6821\u3067\u51B7\u8535\u5EAB\u3092\u4EE5\u524D\u306F\u958B\u3051\u3066\u3044\u305F\u3002^pr:i n:mom/sm:used_to v:open|base/det:a n:fridge/idm:at_school",
    "3^\u306D\u3053\u306F\u4ECA\u591C\u5DDD\u306E\u305D\u3070\u3067\u4F11\u3080\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres v:rest|ing/prep:by det:the n:river/adv:tonight",
    "1^\u3042\u306A\u305F\u306F\u3042\u305D\u3053\u3078\u6765\u308B\u3002^pr:you/v:come|base/adv:there",
    "2^\u308F\u305F\u3057\u306F\u6771\u4EAC\u3067\u4ED5\u4E8B\u3092\u898B\u3064\u3051\u305F\u3002^pr:i/v:find|past/det:a n:job/prep:in n:Tokyo",
    "1^\u308F\u305F\u3057\u306F\u3053\u3053\u3078\u884C\u304F\u3002^pr:i/v:go|base/adv:here",
    "2^\u304B\u308C\u3089\u306F\u5148\u9031\u30DA\u30F3\u3092\u3042\u3052\u305F\u3002^pr:they/v:give|past/det:a n:pen/idm:last_week",
    "3^\u304A\u7236\u3055\u3093\u306F\u6BCE\u65E5\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u4EE5\u524D\u306F\u8A71\u3057\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:talk|base/prep:in pr:i n:room/idm:every_day",
    "2^\u72AC\u306F\u591C\u306B\u5BDD\u308B\u3002^det:the n:dog/v:sleep|base/prep:at n:night",
    "1^\u53CB\u3060\u3061\u306F\u8FD1\u304F\u3067\u8E0A\u3063\u305F\u3002^pr:i n:friend|pl/v:dance|past/adv:nearby",
    "2^\u72AC\u306F\u3055\u3063\u304D\u5BB6\u3067\u4F11\u3093\u3060\u3002^det:the n:dog/v:rest|past/idm:at_home/idm:just_now",
    "2^\u308F\u305F\u3057\u306F\u5EAD\u3067\u672C\u3092\u58F2\u3063\u305F\u3002^pr:i/v:sell|past/det:a n:book/prep:in det:the n:garden",
    "1^\u30B1\u30F3\u306F\u3084\u3055\u3057\u304F\u7B11\u3063\u305F\u3002^n:Ken/v:laugh|past/adv:softly",
    "2^\u30B1\u30F3\u306F\u4ECA\u671D\u30D0\u30B9\u505C\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Ken/v:relax|past/prep:at det:the n:bus_stop/idm:this_morning",
    "2^\u53CB\u3060\u3061\u306F\u3055\u3063\u304D\u30D0\u30B9\u505C\u3067\u53EB\u3093\u3060\u3002^pr:i n:friend|pl/v:shout|past/prep:at det:the n:bus_stop/idm:just_now",
    "2^\u5148\u751F\u306F\u6628\u65E5\u53F0\u6240\u3067\u307B\u307B\u3048\u3093\u3060\u3002^det:the n:teacher/v:smile|past/prep:in det:the n:kitchen/adv:yesterday",
    "3^\u53CB\u3060\u3061\u306F\u671D\u306B\u75C5\u9662\u3067\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u76F4\u3057\u305F\u3002^pr:i n:friend|pl/v:fix|past/det:a n:printer/prep:at det:the n:hospital/prep:in det:the n:morning",
    "2^\u7537\u306E\u5B50\u306F2\u6642\u9593\u8D08\u308A\u7269\u3092\u8CB7\u3063\u305F\u3002^det:the n:boy/v:buy|past/det:a n:gift/idm:for_two_hours",
    "2^\u5973\u306E\u5B50\u306F\u30D0\u30B9\u505C\u3067\u8D70\u308B\u3002^det:the n:girl/v:run|base/prep:at det:the n:bus_stop",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u5B66\u6821\u3067\u3066\u3044\u306D\u3044\u306B\u8A71\u3059\u3002^pr:i n:friend|pl/v:talk|base/adv:politely/idm:at_school/adv:today",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u9854\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:see|base/det:a n:face/adv:tomorrow",
    "2^\u5148\u751F\u306F\u4F1A\u793E\u3078\u65C5\u884C\u3057\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:travel|ing/prep:to det:the n:office",
    "1^\u308F\u305F\u3057\u306F\u65C5\u884C\u3057\u305F\u3002^pr:i/v:travel|past",
    "3^\u304B\u308C\u3089\u306F\u68EE\u3067\u5F15\u304D\u51FA\u3057\u3092\u9589\u3081\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:close|base/det:a n:drawer/prep:in det:the n:forest",
    "2^\u306D\u3053\u306F\u5DDD\u306E\u305D\u3070\u3067\u52DD\u3063\u305F\u3002^det:the n:cat/v:win|past/prep:by det:the n:river",
    "2^\u304B\u308C\u3089\u306F2\u6642\u9593\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:they/v:smile|past/prep:at det:the n:restaurant/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u306F\u5DDD\u3078\u884C\u3063\u305F\u3002^pr:i/v:go|past/prep:to det:the n:river",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6B21\u306F\u5BBF\u984C\u3092\u78BA\u8A8D\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:check|base/n:homework/idm:next_time",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6307\u8F2A\u3092\u3059\u3070\u3084\u304F\u306A\u304F\u3059\u3002^pr:i n:friend|pl/v:lose|base/det:a n:ring/adv:quickly/prep:in pr:i n:room/adv:today",
    "3^\u30B1\u30F3\u306F2\u65E5\u524D\u6D77\u8FBA\u3067\u6A5F\u68B0\u3092\u8FD1\u304F\u3067\u76F4\u3057\u305F\u3002^n:Ken/v:fix|past/det:a n:machine/idm:close_by/prep:on det:the n:beach/idm:two_days_ago",
    "2^\u3042\u306A\u305F\u306F2\u6642\u9593\u30EC\u30B9\u30C8\u30E9\u30F3\u306B\u7740\u3044\u305F\u3002^pr:you/v:arrive|past/prep:at det:the n:restaurant/idm:for_two_hours",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u56F3\u66F8\u9928\u3067\u5B8C\u307A\u304D\u306B\u307B\u307B\u3048\u3080\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:smile|ing/adv:perfectly/prep:in det:the n:library/adv:tomorrow",
    "2^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u5E97\u3067\u6642\u9593\u3069\u304A\u308A\u306B\u307B\u307B\u3048\u3080\u3002^pr:they/v:smile|base/idm:on_time/prep:at det:the n:store/adv:soon",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u591C\u9053\u3092\u3066\u3044\u306D\u3044\u306B\u4F5C\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:build|ing/det:the n:road/adv:carefully/adv:tonight",
    "2^\u30DF\u30AB\u306F\u52D5\u7269\u5712\u3067\u30BF\u30D6\u30EC\u30C3\u30C8\u3092\u4F7F\u3046\u3002^n:Mika/v:use|base/det:a n:tablet/prep:at det:the n:zoo",
    "2^\u306D\u3053\u306F\u8D70\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:run|base",
    "3^\u5973\u306E\u5B50\u306F\u6628\u591C\u6771\u4EAC\u3067\u554F\u984C\u304C\u3042\u3063\u305F\u3002^det:the n:girl/v:have|past/det:a n:problem/prep:in n:Tokyo/idm:last_night",
    "3^\u304A\u7236\u3055\u3093\u306F\u660E\u65E5\u5EAD\u3067\u4F11\u3080\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:rest|base/prep:in det:the n:garden/adv:tomorrow",
    "2^\u5973\u306E\u5B50\u306F\u99C5\u3067\u8349\u3092\u690D\u3048\u308B\u3002^det:the n:girl/v:plant|base/n:grass/prep:at det:the n:station",
    "2^\u304B\u306E\u3058\u3087\u306F\u5B66\u6821\u3067\u5199\u771F\u3092\u6012\u3063\u3066\u64AE\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:take|base/det:a n:photo/adv:angrily/idm:at_school",
    "1^\u30B1\u30F3\u306F2\u65E5\u524D\u8CB7\u3044\u7269\u3057\u305F\u3002^n:Ken/v:shop|past/idm:two_days_ago",
    "2^\u7537\u306E\u5B50\u306F2\u6642\u9593\u9774\u3092\u306F\u304F\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:wear|base/n:shoe|pl/idm:for_two_hours",
    "1^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u3053\u3053\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^n:Ken/v:relax|past/adv:here/idm:last_time",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u7A7A\u6E2F\u3067\u6CF3\u3044\u3067\u3044\u308B\u3002^pr:we/be:pres v:swim|ing/prep:at det:the n:airport",
    "3^\u30DF\u30AB\u306F\u3082\u3046\u3059\u3050\u99C5\u3067\u305F\u304F\u3055\u3093\u6CF3\u3050\u3060\u308D\u3046\u3002^n:Mika/modal:will v:swim|base/idm:a_lot/prep:at det:the n:station/adv:soon",
    "2^\u30DF\u30AB\u306F\u6BCE\u671D\u3053\u3053\u3067\u8CEA\u554F\u3092\u4EE5\u524D\u306F\u3057\u3066\u3044\u305F\u3002^n:Mika/sm:used_to v:ask|base/det:a n:question/adv:here/idm:every_morning",
    "2^\u30B1\u30F3\u306F\u4F1A\u793E\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^n:Ken/v:shop|base/prep:at det:the n:office",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5EAD\u3067\u30D4\u30B6\u3092\u4F5C\u308B\u3002^pr:we/v:make|base/n:pizza/prep:in det:the n:garden",
    "2^\u306D\u3053\u306F\u6765\u9031\u30D1\u30EC\u30FC\u30C9\u3092\u898B\u308B\u4E88\u5B9A\u3060\u3002^det:the n:cat/be:pres v:watch|ing/det:a n:parade/idm:next_week",
    "2^\u5148\u751F\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u30B9\u30FC\u30D1\u30FC\u3067\u7B11\u3046\u3002^det:the n:teacher/v:laugh|base/prep:at det:the n:supermarket/idm:this_afternoon",
    "2^\u30DF\u30AB\u306F\u304B\u3070\u3093\u3092\u3064\u3044\u306B\u904B\u3076\u3060\u308D\u3046\u3002^n:Mika/modal:will v:carry|base/det:a n:bag/adv:finally",
    "3^\u5148\u751F\u306F\u4ECA\u671D\u99C5\u3067\u30CE\u30FC\u30C8\u3092\u8FD1\u304F\u3067\u306A\u304F\u3057\u305F\u3002^det:the n:teacher/v:lose|past/det:a n:notebook/adv:nearby/prep:at det:the n:station/idm:this_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u7A7A\u6E2F\u3067\u8A71\u3057\u305F\u3002^pr:she/v:talk|past/prep:at det:the n:airport",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u3053\u3053\u3067\u8D70\u3063\u305F\u3002^pr:i n:mom/v:run|past/adv:here",
    "2^\u5148\u751F\u306F\u3055\u3063\u304D\u5BB6\u3067\u690D\u7269\u3092\u5B88\u3063\u305F\u3002^det:the n:teacher/v:protect|past/det:a n:plant/idm:at_home/idm:just_now",
    "3^\u7537\u306E\u5B50\u306F\u6765\u9031\u68EE\u3067\u4E0B\u624B\u306B\u52DD\u3064\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:win|base/adv:badly/prep:in det:the n:forest/idm:next_week",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u65E5\u6025\u3044\u3060\u3002^pr:i n:mom/v:hurry|past/idm:every_day",
    "3^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5EAD\u3067\u6CE3\u3044\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:cry|ing/prep:in det:the n:garden/idm:this_afternoon",
    "2^\u30DF\u30AB\u306F\u81EA\u8EE2\u8ECA\u3092\u6642\u9593\u3069\u304A\u308A\u306B\u58F2\u308B\u3002^n:Mika/v:sell|base/det:a n:bike/idm:on_time",
    "1^\u304B\u308C\u3089\u306F7\u6642\u306B\u8A71\u3057\u305F\u3002^pr:they/v:talk|past/idm:at_seven",
    "3^\u5973\u306E\u5B50\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3066\u3044\u308B\u3002^det:the n:girl/be:pres v:check|ing/det:a n:result/prep:at det:the n:restaurant",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u65E5\u30D1\u30F3\u3092\u3066\u3044\u306D\u3044\u306B\u4F5C\u308B\u3002^det:the n:girl/v:make|base/n:bread/adv:politely/adv:today",
    "2^\u30DF\u30AB\u306F\u4ECA\u81EA\u8EE2\u8ECA\u3092\u76F4\u3059\u3002^n:Mika/v:fix|base/det:a n:bicycle/adv:now",
    "1^\u3042\u306A\u305F\u306F\u6628\u65E5\u5F97\u610F\u3052\u306B\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:you/v:relax|past/adv:proudly/adv:yesterday",
    "2^\u3042\u306A\u305F\u306F\u5BBF\u984C\u3092\u78BA\u8A8D\u3059\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:check|base/n:homework",
    "2^\u7537\u306E\u5B50\u306F7\u6642\u306B\u3044\u3059\u3092\u501F\u308A\u305F\u3002^det:the n:boy/v:borrow|past/det:a n:chair/idm:at_seven",
    "2^\u306D\u3053\u306F\u3082\u3046\u3059\u3050\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6CE3\u304F\u3002^det:the n:cat/v:cry|base/prep:in pr:i n:room/adv:soon",
    "3^\u304B\u308C\u3089\u306F\u6BCE\u6669\u75C5\u9662\u3067\u81EA\u8EE2\u8ECA\u3092\u4EE5\u524D\u306F\u76F4\u3057\u3066\u3044\u305F\u3002^pr:they/sm:used_to v:fix|base/det:a n:bicycle/prep:at det:the n:hospital/idm:every_night",
    "3^\u3042\u306A\u305F\u306F\u5E97\u3067\u30DA\u30F3\u3092\u5B89\u5168\u306B\u4F7F\u3046\u3002^pr:you/v:use|base/det:a n:pen/adv:safely/prep:at det:the n:store",
    "3^\u304B\u308C\u3089\u306F\u75C5\u9662\u3067\u3073\u3093\u3092\u4EE5\u524D\u306F\u6301\u3063\u3066\u6765\u3066\u3044\u305F\u3002^pr:they/sm:used_to v:bring|base/det:a n:bottle/prep:at det:the n:hospital",
    "2^\u304B\u308C\u306F\u6628\u65E5\u308F\u305F\u3057\u306E\u96FB\u8A71\u306B\u51FA\u305F\u3002^pr:he/v:answer|past/pr:i n:phone/adv:yesterday",
    "3^\u304A\u7236\u3055\u3093\u306F\u52D5\u7269\u5712\u3067\u304B\u304E\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^pr:i n:dad/be:pres v:lose|ing/det:the n:key/prep:at det:the n:zoo",
    "2^\u3042\u306A\u305F\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:you/v:shop|base/prep:at det:the n:supermarket",
    "2^\u304B\u308C\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u96A0\u308C\u305F\u3002^pr:he/v:hide|past/prep:at det:the n:supermarket",
    "2^\u5148\u751F\u306F\u4ECA\u671D\u304B\u3070\u3093\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u9589\u3058\u305F\u3002^det:the n:teacher/v:close|past/det:a n:bag/idm:in_time/idm:this_morning",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u671D\u306B\u6559\u5BA4\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u304F\u3002^pr:we/v:follow|base/det:the n:bus/prep:in det:the n:classroom/prep:in det:the n:morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u75C5\u9662\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^pr:we/modal:will v:win|base/prep:at det:the n:hospital",
    "2^\u306D\u3053\u306F\u5DDD\u306E\u305D\u3070\u3067\u4EE5\u524D\u306F\u96A0\u308C\u3066\u3044\u305F\u3002^det:the n:cat/sm:used_to v:hide|base/prep:by det:the n:river",
    "2^\u304A\u7236\u3055\u3093\u306F\u6B21\u306F\u7B11\u3046\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:laugh|base/idm:next_time",
    "2^\u304B\u308C\u3089\u306F\u99C5\u3067\u5BDD\u308B\u3002^pr:they/v:sleep|base/prep:at det:the n:station",
    "2^\u304B\u308C\u3089\u306F\u516C\u5712\u3067\u6025\u3050\u3060\u308D\u3046\u3002^pr:they/modal:will v:hurry|base/prep:in det:the n:park",
    "2^\u308F\u305F\u3057\u306F\u30D0\u30B9\u505C\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:i/v:shop|base/prep:at det:the n:bus_stop",
    "1^\u304B\u306E\u3058\u3087\u306F7\u6642\u306B\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:she/v:shop|base/idm:at_seven",
    "1^\u30DF\u30AB\u306F\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3002^n:Mika/v:feed|base/n:fish",
    "3^\u30DF\u30AB\u306F\u671D\u306B\u6559\u5BA4\u3067\u306F\u304C\u304D\u3092\u9001\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:send|base/det:a n:postcard/prep:in det:the n:classroom/prep:in det:the n:morning",
    "1^\u308F\u305F\u3057\u306F\u591C\u306B\u53EB\u3076\u3002^pr:i/v:shout|base/prep:at n:night",
    "2^\u7537\u306E\u5B50\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u6025\u3044\u3060\u3002^det:the n:boy/v:hurry|past/prep:at det:the n:supermarket",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u6642\u8A08\u3092\u76F4\u3057\u305F\u3002^pr:we/v:fix|past/det:a n:clock/prep:at det:the n:restaurant",
    "2^\u72AC\u306F\u53F0\u6240\u3067\u4F11\u3093\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:rest|ing/prep:in det:the n:kitchen",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u671D\u306B\u68EE\u3067\u304A\u3082\u3061\u3083\u3092\u306A\u304F\u3057\u305F\u3002^pr:we/v:lose|past/det:a n:toy/prep:in det:the n:forest/prep:in det:the n:morning",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u304F\u3089\u3084\u307F\u3067\u5BDD\u305F\u3002^pr:we/v:sleep|past/idm:in_the_dark",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u671D\u6559\u5BA4\u3067\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9\u3092\u5F15\u3044\u305F\u3002^pr:they/v:pull|past/det:a n:suitcase/prep:in det:the n:classroom/idm:this_morning",
    "2^\u30DF\u30AB\u306F\u5EAD\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^n:Mika/v:jump|base/prep:in det:the n:garden",
    "2^\u5973\u306E\u5B50\u306F\u3055\u3063\u304D\u304A\u3082\u3061\u3083\u3092\u306A\u304F\u3057\u305F\u3002^det:the n:girl/v:lose|past/det:a n:toy/idm:just_now",
    "2^\u7537\u306E\u5B50\u306F\u53F0\u6240\u3067\u307B\u307B\u3048\u3093\u3067\u3044\u308B\u3002^det:the n:boy/be:pres v:smile|ing/prep:in det:the n:kitchen",
    "2^\u7537\u306E\u5B50\u306F\u56F3\u66F8\u9928\u3067\u8D70\u308B\u3002^det:the n:boy/v:run|base/prep:in det:the n:library",
    "2^\u7537\u306E\u5B50\u306F\u6BCE\u65E5\u81EA\u7136\u3092\u5B88\u308B\u3002^det:the n:boy/v:protect|base/n:nature/idm:every_day",
    "3^\u30DF\u30AB\u306F\u56F3\u66F8\u9928\u3067\u3073\u3093\u3092\u4EE5\u524D\u306F\u904B\u3093\u3067\u3044\u305F\u3002^n:Mika/sm:used_to v:carry|base/det:a n:bottle/prep:in det:the n:library",
    "2^\u5148\u751F\u306F\u6559\u5BA4\u3067\u6CE3\u304F\u3002^det:the n:teacher/v:cry|base/prep:in det:the n:classroom",
    "1^\u306D\u3053\u306F7\u6642\u306B\u52DD\u3064\u3002^det:the n:cat/v:win|base/idm:at_seven",
    "2^\u7537\u306E\u5B50\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u307E\u3063\u305F\u308A\u3057\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:chill|ing/prep:at det:the n:supermarket",
    "2^\u306D\u3053\u306F\u4F1A\u793E\u3067\u4EE5\u524D\u306F\u6B69\u3044\u3066\u3044\u305F\u3002^det:the n:cat/sm:used_to v:walk|base/prep:at det:the n:office",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u524D\u56DE\u306F\u8FD1\u304F\u3067\u52DD\u3063\u305F\u3002^pr:we/v:win|past/idm:close_by/idm:last_time",
    "2^\u30DF\u30AB\u306F\u4ECA\u671D\u5E97\u3078\u65C5\u884C\u3057\u305F\u3002^n:Mika/v:travel|past/prep:to det:the n:store/idm:this_morning",
    "2^\u30DF\u30AB\u306F\u6771\u4EAC\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u9001\u308B\u3002^n:Mika/v:send|base/det:a n:message/prep:in n:Tokyo",
    "3^\u30B1\u30F3\u306F\u4ECA\u671D\u99C5\u3067\u7D75\u3092\u9001\u3063\u305F\u3002^n:Ken/v:send|past/det:a n:picture/prep:at det:the n:station/idm:this_morning",
    "2^\u308F\u305F\u3057\u306F\u5148\u9031\u304B\u3070\u3093\u3092\u501F\u308A\u305F\u3002^pr:i/v:borrow|past/det:a n:bag/idm:last_week",
    "2^\u72AC\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u6025\u3044\u3060\u3002^det:the n:dog/v:hurry|past/prep:at det:the n:restaurant",
    "2^\u304A\u7236\u3055\u3093\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u3044\u3064\u3082\u6CF3\u3050\u3002^pr:i n:dad/adv:always v:swim|base/prep:at det:the n:supermarket",
    "2^\u304B\u308C\u3089\u306F\u671D\u306B\u8ECA\u306B\u3064\u3044\u3066\u3044\u304F\u3002^pr:they/v:follow|base/det:the n:car/prep:in det:the n:morning",
    "2^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u3042\u305D\u3053\u3067\u98DF\u3079\u7269\u3092\u58F2\u3063\u305F\u3002^n:Ken/v:sell|past/n:food/adv:there/idm:last_time",
    "2^\u30B1\u30F3\u306F\u5148\u9031\u8CEA\u554F\u3092\u3057\u305F\u3002^n:Ken/v:ask|past/det:a n:question/idm:last_week",
    "3^\u304B\u308C\u3089\u306F\u75C5\u9662\u3067\u304A\u3082\u3061\u3083\u3092\u76F4\u3057\u3066\u3044\u308B\u3002^pr:they/be:pres v:fix|ing/det:a n:toy/prep:at det:the n:hospital",
    "2^\u304B\u308C\u306F\u671D\u306B\u3082\u3046\u4E00\u5EA6\u7740\u304F\u3002^pr:he/v:arrive|base/adv:again/prep:in det:the n:morning",
    "1^\u308F\u305F\u3057\u306F\u8E0A\u3063\u305F\u3002^pr:i/v:dance|past",
    "2^\u7537\u306E\u5B50\u306F\u6559\u5BA4\u3067\u9759\u304B\u306B\u7B11\u3063\u305F\u3002^det:the n:boy/v:laugh|past/adv:quietly/prep:in det:the n:classroom",
    "2^\u304B\u308C\u3089\u306F\u6BCE\u65E5\u75C5\u9662\u3078\u6765\u308B\u3002^pr:they/v:come|base/prep:to det:the n:hospital/idm:every_day",
    "1^\u304B\u308C\u3089\u306F\u4ECA\u3042\u305D\u3053\u3067\u307B\u307B\u3048\u3080\u3002^pr:they/v:smile|base/adv:there/adv:now",
    "3^\u304A\u7236\u3055\u3093\u306F\u4F1A\u793E\u3067\u98DF\u3079\u7269\u3092\u6301\u3063\u3066\u6765\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:bring|ing/n:food/prep:at det:the n:office",
    "2^\u7537\u306E\u5B50\u306F\u3053\u3053\u3067\u98DF\u5668\u68DA\u3092\u9589\u3081\u308B\u3002^det:the n:boy/v:close|base/det:a n:cupboard/adv:here",
    "1^\u304B\u308C\u306F\u6BCE\u65E5\u304B\u3093\u305F\u3093\u306B\u6025\u3050\u3002^pr:he/v:hurry|base/adv:easily/idm:every_day",
    "3^\u72AC\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u306A\u304F\u3059\u3002^det:the n:dog/v:lose|base/pr:i n:phone/prep:at det:the n:supermarket",
    "3^\u5973\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u516C\u5712\u3067\u5BB9\u5668\u3092\u304F\u3089\u3084\u307F\u3067\u958B\u3051\u308B\u3002^det:the n:girl/v:open|base/det:a n:container/idm:in_the_dark/prep:in det:the n:park/adv:soon",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u3055\u3063\u304D\u8CEA\u554F\u3092\u5F97\u610F\u3052\u306B\u3057\u305F\u3002^pr:i n:mom/v:ask|past/det:a n:question/adv:proudly/idm:just_now",
    "2^\u30B1\u30F3\u306F\u4ECA\u671D\u5BB6\u3092\u6012\u3063\u3066\u58F2\u3063\u305F\u3002^n:Ken/v:sell|past/det:a n:house/adv:angrily/idm:this_morning",
    "2^\u3042\u306A\u305F\u306F\u52D5\u7269\u5712\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^pr:you/modal:will v:walk|base/prep:at det:the n:zoo",
    "3^\u7537\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u8CEA\u554F\u306B\u7B54\u3048\u305F\u3002^det:the n:boy/v:answer|past/det:a n:question/prep:in det:the n:gym",
    "2^\u304B\u306E\u3058\u3087\u306F\u5BB6\u3067\u304A\u91D1\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^pr:she/be:pres v:lose|ing/n:money/idm:at_home",
    "1^\u5973\u306E\u5B50\u306F\u6BCE\u671D\u7B11\u3046\u3002^det:the n:girl/v:laugh|base/idm:every_morning",
    "2^\u30DF\u30AB\u306F\u68EE\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u6301\u3063\u3066\u3044\u305F\u3002^n:Mika/v:have|past/pr:i n:phone/prep:in det:the n:forest",
    "2^\u304B\u308C\u3089\u306F\u99C5\u3067\u6CF3\u3044\u3067\u3044\u308B\u3002^pr:they/be:pres v:swim|ing/prep:at det:the n:station",
    "2^\u3042\u306A\u305F\u306F\u660E\u65E5\u30C9\u30A2\u3092\u958B\u3051\u308B\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:open|ing/det:the n:door/adv:tomorrow",
    "2^\u306D\u3053\u306F\u98DF\u3079\u7269\u3092\u7A81\u7136\u904B\u3093\u3060\u3002^det:the n:cat/v:carry|past/n:food/adv:suddenly",
    "2^\u30DF\u30AB\u306F\u4F1A\u793E\u3067\u5BB6\u5177\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^n:Mika/be:pres v:buy|ing/n:furniture/prep:at det:the n:office",
    "2^\u30DF\u30AB\u306F\u6628\u591C\u5BB6\u3067\u307C\u3046\u3057\u3092\u304B\u3076\u3063\u305F\u3002^n:Mika/v:wear|past/det:a n:hat/idm:at_home/idm:last_night",
    "2^\u72AC\u306F\u4E00\u65E5\u3058\u3085\u3046\u8E0A\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:dance|base/idm:all_day",
    "2^\u72AC\u306F\u4E00\u65E5\u3058\u3085\u3046\u56F3\u66F8\u9928\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:dog/v:jump|past/prep:in det:the n:library/idm:all_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5B66\u6821\u3067\u30C6\u30EC\u30D3\u3092\u898B\u305F\u3002^pr:i n:mom/v:watch|past/det:the n:TV/idm:at_school",
    "3^\u53CB\u3060\u3061\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u82B1\u3092\u8CB7\u3046\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:buy|base/det:a n:flower/prep:at det:the n:supermarket",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u65E5\u99C5\u3067\u7B11\u3046\u3002^pr:i n:mom/v:laugh|base/prep:at det:the n:station/idm:every_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u65E5\u6CF3\u3050\u3002^pr:we/v:swim|base/idm:every_day",
    "2^\u304B\u306E\u3058\u3087\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u50CD\u3044\u305F\u3002^pr:she/v:work|past/prep:in pr:i n:room",
    "2^\u304B\u308C\u3089\u306F\u3053\u3053\u3067\u96FB\u6C60\u3092\u78BA\u8A8D\u3067\u304D\u308B\u3002^pr:they/modal:can v:check|base/det:a n:battery/adv:here",
    "2^\u304A\u7236\u3055\u3093\u306F\u591C\u306B\u3055\u3044\u3075\u3092\u306A\u304F\u3057\u305F\u3002^pr:i n:dad/v:lose|past/det:a n:wallet/prep:at n:night",
    "1^\u5148\u751F\u306F2\u6642\u9593\u6025\u3044\u3060\u3002^det:the n:teacher/v:hurry|past/idm:for_two_hours",
    "3^\u304A\u7236\u3055\u3093\u306F\u5348\u5F8C\u306B\u75C5\u9662\u3067\u8B1B\u6F14\u8005\u3092\u4EE5\u524D\u306F\u62DB\u5F85\u3057\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:invite|base/det:a n:speaker/prep:at det:the n:hospital/prep:in det:the n:afternoon",
    "2^\u30DF\u30AB\u306F\u4ECA\u671D\u9B5A\u306B\u89AA\u5207\u306B\u3048\u3055\u3092\u3042\u3052\u305F\u3002^n:Mika/v:feed|past/n:fish/adv:kindly/idm:this_morning",
    "2^\u53CB\u3060\u3061\u306F\u6771\u4EAC\u3067\u50CD\u3044\u305F\u3002^pr:i n:friend|pl/v:work|past/prep:in n:Tokyo",
    "2^\u304B\u308C\u306F\u6559\u5BA4\u3067\u50CD\u3044\u3066\u3044\u308B\u3002^pr:he/be:pres v:work|ing/prep:in det:the n:classroom",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5207\u7B26\u3092\u3072\u305D\u304B\u306B\u8CB7\u3046\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:buy|base/det:a n:ticket/adv:secretly",
    "1^\u308F\u305F\u3057\u306F\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD4\u4FE1\u3059\u308B\u3002^pr:i/v:answer|base/det:a n:message",
    "3^\u304B\u308C\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u516C\u6F14\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:watch|base/det:a n:performance/prep:at det:the n:restaurant",
    "1^\u308F\u305F\u3057\u306F7\u6642\u306B\u6B69\u304F\u3002^pr:i/v:walk|base/idm:at_seven",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4F1A\u793E\u3067\u6728\u3092\u898B\u305F\u3002^pr:i n:mom/v:see|past/det:a n:tree/prep:at det:the n:office",
    "2^\u304B\u308C\u306F\u56F3\u66F8\u9928\u3067\u52D5\u753B\u3092\u898B\u305F\u3002^pr:he/v:watch|past/det:a n:video/prep:in det:the n:library",
    "2^\u304B\u308C\u306F\u6559\u5BA4\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^pr:he/v:chill|past/prep:in det:the n:classroom",
    "2^\u306D\u3053\u306F\u4ECA\u671D\u30AB\u30E1\u30E9\u3092\u6301\u3063\u3066\u3044\u305F\u3002^det:the n:cat/v:have|past/det:a n:camera/idm:this_morning",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u306B\u3084\u3055\u3057\u304F\u4E57\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:ride|base/det:a n:elevator/adv:softly/adv:tonight",
    "2^\u304B\u306E\u3058\u3087\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u5BB6\u3092\u8CB7\u3063\u305F\u3002^pr:she/v:buy|past/det:a n:house/prep:in pr:i n:room",
    "2^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u6B69\u304F\u3002^pr:i n:dad/v:walk|base/prep:in det:the n:classroom",
    "1^\u304B\u308C\u306F\u6628\u65E5\u307B\u307B\u3048\u3093\u3060\u3002^pr:he/v:smile|past/adv:yesterday",
    "2^\u72AC\u306F\u3055\u3063\u304D\u5B66\u6821\u3067\u5BDD\u305F\u3002^det:the n:dog/v:sleep|past/idm:at_school/idm:just_now",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u304A\u3082\u3061\u3083\u3092\u3084\u3055\u3057\u304F\u8CB7\u3063\u305F\u3002^pr:they/v:buy|past/det:a n:toy/adv:softly/idm:this_afternoon",
    "2^\u53CB\u3060\u3061\u306F\u99C5\u3067\u8CB7\u3044\u7269\u3059\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:shop|base/prep:at det:the n:station",
    "2^\u5973\u306E\u5B50\u306F\u53EB\u3076\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:shout|base",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u8A71\u3059\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:talk|base/idm:this_afternoon",
    "2^\u72AC\u306F\u4E00\u65E5\u3058\u3085\u3046\u4F1A\u793E\u3078\u884C\u3063\u305F\u3002^det:the n:dog/v:go|past/prep:to det:the n:office/idm:all_day",
    "2^\u306D\u3053\u306F\u68EE\u3078\u6765\u308B\u3068\u3053\u308D\u3060\u3002^det:the n:cat/be:pres v:come|ing/prep:to det:the n:forest",
    "1^\u308F\u305F\u3057\u306F\u3055\u3063\u304D\u8E0A\u3063\u305F\u3002^pr:i/v:dance|past/idm:just_now",
    "2^\u30DF\u30AB\u306F\u4ECA\u65E5\u30AB\u30D5\u30A7\u3067\u53EB\u3076\u3002^n:Mika/v:shout|base/prep:at det:the n:cafe/adv:today",
    "2^\u7537\u306E\u5B50\u306F\u4ECA\u65E5\u8ECA\u3092\u76F4\u3057\u305F\u3002^det:the n:boy/v:fix|past/det:the n:car/adv:today",
    "2^\u5973\u306E\u5B50\u306F2\u6642\u9593\u3068\u304D\u3069\u304DDVD\u3092\u501F\u308A\u305F\u3002^det:the n:girl/adv:sometimes v:borrow|past/det:a n:DVD/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6B21\u306F\u3058\u3083\u304C\u3044\u3082\u3092\u690D\u3048\u308B\u3002^pr:we/v:plant|base/det:a n:potato/idm:next_time",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u591C\u8FD1\u304F\u3067\u6765\u305F\u3002^pr:we/v:come|past/adv:nearby/idm:last_night",
    "2^\u304B\u308C\u3089\u306F\u5B66\u6821\u3067\u3055\u3044\u3075\u3092\u306A\u304F\u3059\u3002^pr:they/v:lose|base/det:a n:wallet/idm:at_school",
    "2^\u5973\u306E\u5B50\u306F\u5EAD\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:walk|base/prep:in det:the n:garden",
    "2^\u7537\u306E\u5B50\u306F\u5BB6\u3067\u53EB\u3076\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:shout|base/idm:at_home",
    "1^\u3042\u306A\u305F\u306F\u6BCE\u671D\u9774\u4E0B\u3092\u306F\u3044\u305F\u3002^pr:you/v:wear|past/n:sock|pl/idm:every_morning",
    "2^\u304B\u308C\u3089\u306F\u53F0\u6240\u3067\u52DD\u3063\u3066\u3044\u308B\u3002^pr:they/be:pres v:win|ing/prep:in det:the n:kitchen",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u5EAD\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^pr:we/v:invite|base/det:a n:speaker/prep:in det:the n:garden/adv:now",
    "2^\u5148\u751F\u306F\u56F3\u66F8\u9928\u3067\u6B69\u3044\u305F\u3002^det:the n:teacher/v:walk|past/prep:in det:the n:library",
    "2^\u7537\u306E\u5B50\u306F\u6BCE\u671D\u5BB6\u3067\u5199\u771F\u3092\u64AE\u308B\u3002^det:the n:boy/v:take|base/det:a n:photo/idm:at_home/idm:every_morning",
    "2^\u304B\u308C\u306F\u6765\u9031\u30D1\u30BD\u30B3\u30F3\u3092\u4F7F\u3046\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:use|ing/det:the n:computer/idm:next_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u30D0\u30B9\u505C\u3067\u8E0A\u308B\u3002^pr:she/v:dance|base/prep:at det:the n:bus_stop",
    "1^\u5973\u306E\u5B50\u306F\u52DD\u3064\u3002^det:the n:girl/v:win|base",
    "2^\u304B\u306E\u3058\u3087\u306F\u6628\u65E5\u6D77\u3078\u6765\u305F\u3002^pr:she/v:come|past/prep:to det:the n:beach/adv:yesterday",
    "2^\u72AC\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:hide|base/prep:at det:the n:supermarket",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:watch|base/det:a n:concert/adv:tonight",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u8D70\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:run|base/idm:this_afternoon",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F2\u6642\u9593\u7B11\u3063\u305F\u3002^pr:we/v:laugh|past/idm:for_two_hours",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u7A81\u7136\u5BDD\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:sleep|base/adv:suddenly/idm:this_afternoon",
    "2^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u8ECA\u306B\u3064\u3044\u3066\u3044\u304F\u3002^n:Ken/v:follow|base/det:the n:car/adv:soon",
    "2^\u304B\u308C\u306F\u68EE\u3067\u81EA\u7136\u3092\u5B88\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:protect|base/n:nature/prep:in det:the n:forest",
    "3^\u30DF\u30AB\u306F\u4ECA\u75C5\u9662\u3067\u304B\u3070\u3093\u3092\u8CB7\u3046\u3002^n:Mika/v:buy|base/det:a n:bag/prep:at det:the n:hospital/adv:now",
    "3^\u306D\u3053\u306F\u6765\u9031\u30D7\u30EC\u30BC\u30F3\u30C8\u3092\u304F\u3089\u3084\u307F\u3067\u6301\u3063\u3066\u304F\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:bring|base/det:a n:present/idm:in_the_dark/idm:next_week",
    "2^\u30DF\u30AB\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6B69\u304F\u3002^n:Mika/v:walk|base/prep:in pr:i n:room",
    "2^\u308F\u305F\u3057\u306F\u6BCE\u65E5\u5E97\u3067\u5BDD\u308B\u3002^pr:i/v:sleep|base/prep:at det:the n:store/idm:every_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u5B89\u5168\u306B\u7B11\u3063\u305F\u3002^pr:we/v:laugh|past/adv:safely",
    "1^\u306D\u3053\u306F\u6628\u591C\u8D70\u3063\u305F\u3002^det:the n:cat/v:run|past/idm:last_night",
    "2^\u5973\u306E\u5B50\u306F\u524D\u56DE\u306F\u624B\u7D19\u3092\u3042\u3052\u305F\u3002^det:the n:girl/v:give|past/det:a n:letter/idm:last_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u5B66\u6821\u3067\u5BBF\u984C\u3092\u3084\u3063\u305F\u3002^pr:i n:dad/v:do|past/n:homework/idm:at_school",
    "2^\u304B\u306E\u3058\u3087\u306F\u68EE\u3067\u5BDD\u308B\u3002^pr:she/v:sleep|base/prep:in det:the n:forest",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:cry|ing/adv:tonight",
    "1^\u30B1\u30F3\u306F\u4ECA\u65E5\u307B\u307B\u3048\u3093\u3060\u3002^n:Ken/v:smile|past/adv:today",
    "2^\u7537\u306E\u5B50\u306F\u5BB6\u3067\u5BB6\u5177\u3092\u8CB7\u3063\u305F\u3002^det:the n:boy/v:buy|past/n:furniture/idm:at_home",
    "2^\u5148\u751F\u306F\u5B66\u6821\u3067\u9580\u3092\u9589\u3081\u3089\u308C\u308B\u3002^det:the n:teacher/modal:can v:close|base/det:a n:gate/idm:at_school",
    "2^\u72AC\u306F\u591C\u306B\u5B66\u6821\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:dog/v:jump|past/idm:at_school/prep:at n:night",
    "2^\u72AC\u306F\u5DDD\u306E\u305D\u3070\u3067\u52DD\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:win|ing/prep:by det:the n:river",
    "2^\u304B\u308C\u306F\u6771\u4EAC\u3067\u30AB\u30E1\u30E9\u3092\u501F\u308A\u305F\u3002^pr:he/v:borrow|past/det:a n:camera/prep:in n:Tokyo",
    "2^\u30DF\u30AB\u306F\u4ECA\u591C\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:relax|base/adv:tonight",
    "3^\u30B1\u30F3\u306F\u4ECA\u5EAD\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^n:Ken/v:invite|base/det:a n:speaker/prep:in det:the n:garden/adv:now",
    "3^\u304A\u7236\u3055\u3093\u306F\u6765\u9031\u3042\u305D\u3053\u3067\u82B1\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u6301\u3063\u3066\u304F\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:bring|base/det:a n:flower/idm:in_time/adv:there/idm:next_week",
    "2^\u30B1\u30F3\u306F\u53F0\u6240\u3078\u884C\u304F\u3068\u3053\u308D\u3060\u3002^n:Ken/be:pres v:go|ing/prep:to det:the n:kitchen",
    "2^\u306D\u3053\u306F\u7A81\u7136\u4F11\u3080\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:rest|base/adv:suddenly",
    "3^\u7537\u306E\u5B50\u306F\u7A7A\u6E2F\u3067\u8C46\u3092\u690D\u3048\u305F\u3002^det:the n:boy/v:plant|past/det:a n:bean/prep:at det:the n:airport",
    "3^\u30B1\u30F3\u306F\u671D\u306B\u4F1A\u793E\u3067\u8D70\u3063\u305F\u3002^n:Ken/v:run|past/prep:at det:the n:office/prep:in det:the n:morning",
    "2^\u5973\u306E\u5B50\u306F\u6628\u591C\u8D08\u308A\u7269\u3092\u304B\u3093\u305F\u3093\u306B\u8CB7\u3063\u305F\u3002^det:the n:girl/v:buy|past/det:a n:gift/adv:easily/idm:last_night",
    "2^\u304B\u306E\u3058\u3087\u306F\u52D5\u7269\u5712\u3067\u30E1\u30FC\u30EB\u3092\u9001\u308B\u3002^pr:she/v:send|base/det:a n:email/prep:at det:the n:zoo",
    "3^\u304B\u308C\u306F\u68EE\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u78BA\u8A8D\u3059\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:check|base/pr:i n:phone/prep:in det:the n:forest",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u53EB\u3076\u3002^pr:we/v:shout|base/prep:at n:night",
    "1^\u308F\u305F\u3057\u306F\u3082\u3046\u4E00\u5EA6\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:i/v:relax|past/adv:again",
    "2^\u304B\u308C\u306F\u6559\u5BA4\u3067\u308F\u305F\u3057\u306E\u96FB\u8A71\u306B\u51FA\u305F\u3002^pr:he/v:answer|past/pr:i n:phone/prep:in det:the n:classroom",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u6A21\u578B\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:make|base/det:a n:model/adv:today",
    "3^\u5148\u751F\u306F\u99C5\u3067\u304B\u3070\u3093\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:have|base/det:a n:bag/prep:at det:the n:station",
    "1^\u7537\u306E\u5B50\u306F\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:boy/v:chill|past",
    "2^\u304A\u7236\u3055\u3093\u306F\u53EB\u3076\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:shout|base",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6628\u65E5\u516C\u5712\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:i n:mom/v:ask|past/det:a n:question/prep:in det:the n:park/adv:yesterday",
    "2^\u304A\u7236\u3055\u3093\u306F\u99C5\u3067\u3066\u3044\u306D\u3044\u306B\u50CD\u3044\u305F\u3002^pr:i n:dad/v:work|past/adv:politely/prep:at det:the n:station",
    "1^\u304B\u308C\u306F\u3053\u3053\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:he/v:jump|past/adv:here",
    "2^\u3042\u306A\u305F\u306F\u5E97\u306B\u7740\u304F\u3002^pr:you/v:arrive|base/prep:at det:the n:store",
    "3^\u306D\u3053\u306F\u671D\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6B69\u304F\u3002^det:the n:cat/v:walk|base/prep:in pr:i n:room/prep:in det:the n:morning",
    "1^\u304B\u308C\u3089\u306F\u8D70\u308B\u3002^pr:they/v:run|base",
    "3^\u5148\u751F\u306F\u52D5\u7269\u5712\u3067\u6307\u8F2A\u3092\u306A\u304F\u3059\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:lose|base/det:a n:ring/prep:at det:the n:zoo",
    "2^\u5973\u306E\u5B50\u306F\u6BCE\u671D\u7A32\u3092\u690D\u3048\u305F\u3002^det:the n:girl/v:plant|past/det:a n:rice_plant/idm:every_morning",
    "2^\u72AC\u306F\u4ECA\u65E5\u30AB\u30E1\u30E9\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:have|base/det:a n:camera/adv:today",
    "1^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u91CE\u83DC\u3092\u8CB7\u3046\u3002^n:Ken/v:buy|base/n:vegetables/adv:soon",
    "2^\u30DF\u30AB\u306F\u52D5\u7269\u5712\u3067\u30B1\u30FC\u30AD\u3092\u4F5C\u308B\u3002^n:Mika/v:make|base/det:a n:cake/prep:at det:the n:zoo",
    "2^\u5148\u751F\u306F\u52D5\u7269\u5712\u3067\u91CE\u83DC\u3092\u58F2\u3063\u305F\u3002^det:the n:teacher/v:sell|past/n:vegetables/prep:at det:the n:zoo",
    "1^\u306D\u3053\u306F2\u65E5\u524D\u5BDD\u305F\u3002^det:the n:cat/v:sleep|past/idm:two_days_ago",
    "2^\u30DF\u30AB\u306F\u6B69\u304F\u3060\u308D\u3046\u3002^n:Mika/modal:will v:walk|base",
    "3^\u5148\u751F\u306F\u6559\u5BA4\u3067\u554F\u984C\u304C\u3042\u3063\u305F\u3002^det:the n:teacher/v:have|past/det:a n:problem/prep:in det:the n:classroom",
    "2^\u306D\u3053\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u52DD\u3063\u305F\u3002^det:the n:cat/v:win|past/prep:at det:the n:supermarket",
    "1^\u308F\u305F\u3057\u306F\u89AA\u5207\u306B\u4F11\u3093\u3060\u3002^pr:i/v:rest|past/adv:kindly",
    "2^\u30DF\u30AB\u306F\u7A7A\u6E2F\u3067\u30B3\u30FC\u30D2\u30FC\u3092\u4F5C\u3063\u305F\u3002^n:Mika/v:make|past/n:coffee/prep:at det:the n:airport",
    "3^\u7537\u306E\u5B50\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u5207\u7B26\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:have|base/det:a n:ticket/prep:at det:the n:restaurant",
    "2^\u30B1\u30F3\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u304A\u3082\u3061\u3083\u3092\u58F2\u3063\u305F\u3002^n:Ken/v:sell|past/det:a n:toy/prep:at det:the n:restaurant",
    "2^\u5973\u306E\u5B50\u306F\u5EAD\u3067\u307B\u307B\u3048\u3080\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:smile|base/prep:in det:the n:garden",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5730\u4E0B\u9244\u306B\u4E57\u308B\u3002^pr:i n:friend|pl/v:ride|base/det:a n:subway/idm:this_afternoon",
    "1^\u308F\u305F\u3057\u306F\u9774\u3092\u8CB7\u3063\u305F\u3002^pr:i/v:buy|past/n:shoe|pl",
    "3^\u7537\u306E\u5B50\u306F2\u65E5\u524D\u99C5\u3067\u3058\u3083\u304C\u3044\u3082\u3092\u3044\u3063\u3057\u3087\u306B\u690D\u3048\u305F\u3002^det:the n:boy/v:plant|past/det:a n:potato/adv:together/prep:at det:the n:station/idm:two_days_ago",
    "2^\u5973\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u99C5\u3067\u8E0A\u3063\u305F\u3002^det:the n:girl/v:dance|past/prep:at det:the n:station/idm:all_day",
    "3^\u7537\u306E\u5B50\u306F\u30AB\u30D5\u30A7\u3067\u6642\u8A08\u3092\u76F4\u3059\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:fix|base/det:a n:clock/prep:at det:the n:cafe",
    "3^\u30DF\u30AB\u306F\u4ECA\u591C\u68EE\u3067\u4F9D\u983C\u306B\u5FDC\u3058\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:answer|base/det:a n:request/prep:in det:the n:forest/adv:tonight",
    "1^\u308F\u305F\u3057\u306F\u304A\u91D1\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:i/v:have|base/n:money",
    "2^\u5973\u306E\u5B50\u306F\u5915\u65E5\u3092\u898B\u3089\u308C\u308B\u3002^det:the n:girl/modal:can v:watch|base/det:the n:sunset",
    "2^\u304B\u308C\u3089\u306F\u6559\u5BA4\u3067\u30C9\u30A2\u3092\u76F4\u3057\u305F\u3002^pr:they/v:fix|past/det:the n:door/prep:in det:the n:classroom",
    "2^\u3042\u306A\u305F\u306F\u3082\u3046\u3059\u3050\u7740\u304F\u3060\u308D\u3046\u3002^pr:you/modal:will v:arrive|base/adv:soon",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6C34\u3092\u3084\u3055\u3057\u304F\u904B\u3076\u3002^pr:i n:mom/v:carry|base/n:water/adv:softly",
    "2^\u5973\u306E\u5B50\u306F\u3055\u3063\u304D\u30AB\u30E1\u30E9\u3092\u4F7F\u3063\u305F\u3002^det:the n:girl/v:use|past/det:a n:camera/idm:just_now",
    "3^\u3042\u306A\u305F\u306F\u4ECA\u3053\u3053\u3067\u8CEA\u554F\u3092\u3044\u3063\u3057\u3087\u306B\u3057\u3066\u3044\u308B\u3002^pr:you/be:pres v:ask|ing/det:a n:question/adv:together/adv:here/adv:now",
    "3^\u3042\u306A\u305F\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8CEA\u554F\u3092\u4E0B\u624B\u306B\u3057\u3066\u3044\u308B\u3002^pr:you/be:pres v:ask|ing/det:a n:question/adv:badly/prep:at det:the n:restaurant",
    "2^\u53CB\u3060\u3061\u306F\u3082\u3046\u3059\u3050\u91CE\u83DC\u3092\u690D\u3048\u308B\u3002^pr:i n:friend|pl/v:plant|base/n:vegetables/adv:soon",
    "3^\u5973\u306E\u5B50\u306F\u68EE\u3067\u30DA\u30F3\u3092\u501F\u308A\u308B\u3002^det:the n:girl/v:borrow|base/det:a n:pen/prep:in det:the n:forest",
    "3^\u7537\u306E\u5B50\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8155\u6642\u8A08\u3092\u306A\u304F\u3057\u305F\u3002^det:the n:boy/v:lose|past/det:a n:watch/prep:at det:the n:restaurant",
    "1^\u304B\u308C\u3089\u306F2\u65E5\u524D\u6025\u3044\u3060\u3002^pr:they/v:hurry|past/idm:two_days_ago",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u30D0\u30B9\u505C\u3067\u8D08\u308A\u7269\u3092\u89AA\u5207\u306B\u6301\u3063\u3066\u304F\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:bring|base/det:a n:gift/adv:kindly/prep:at det:the n:bus_stop/prep:at n:night",
    "3^\u308F\u305F\u3057\u306F\u6628\u591C\u52D5\u7269\u5712\u3067\u306B\u3093\u3058\u3093\u3092\u3064\u3044\u306B\u690D\u3048\u305F\u3002^pr:i/v:plant|past/det:a n:carrot/adv:finally/prep:at det:the n:zoo/idm:last_night",
    "2^\u5148\u751F\u306F\u6559\u5BA4\u3067\u8E0A\u3063\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:dance|ing/prep:in det:the n:classroom",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u6771\u4EAC\u3078\u65C5\u884C\u3059\u308B\u3002^pr:you/v:travel|base/prep:to n:Tokyo/adv:now",
    "2^\u304B\u308C\u3089\u306F\u6BCE\u671D\u6D77\u8FBA\u3067\u304A\u91D1\u3092\u306A\u304F\u3057\u305F\u3002^pr:they/v:lose|past/n:money/prep:on det:the n:beach/idm:every_morning",
    "1^\u306D\u3053\u306F\u6BCE\u671D\u52DD\u3064\u3002^det:the n:cat/v:win|base/idm:every_morning",
    "2^\u30DF\u30AB\u306F\u4ECA\u591C\u52D5\u7269\u5712\u3067\u50CD\u304F\u4E88\u5B9A\u3060\u3002^n:Mika/be:pres v:work|ing/prep:at det:the n:zoo/adv:tonight",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u591C\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7\u3092\u690D\u3048\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:plant|base/det:a n:tulip/adv:tonight",
    "3^\u7537\u306E\u5B50\u306F\u5E97\u3067\u30C6\u30FC\u30D6\u30EB\u3092\u4F5C\u308B\u3002^det:the n:boy/v:make|base/det:a n:table/prep:at det:the n:store",
    "2^\u5973\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u8CEA\u554F\u3092\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:ask|base/det:a n:question/adv:soon",
    "1^\u53CB\u3060\u3061\u306F\u98DF\u3079\u7269\u3092\u6301\u3063\u3066\u304F\u308B\u3002^pr:i n:friend|pl/v:bring|base/n:food",
    "3^\u72AC\u306F\u4ECA\u671D\u53F0\u6240\u3067\u7A81\u7136\u4F11\u3093\u3060\u3002^det:the n:dog/v:rest|past/adv:suddenly/prep:in det:the n:kitchen/idm:this_morning",
    "2^\u5973\u306E\u5B50\u306F\u3073\u3093\u3092\u304F\u3089\u3084\u307F\u3067\u6301\u3063\u3066\u304F\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:bring|base/det:a n:bottle/idm:in_the_dark",
    "3^\u5973\u306E\u5B50\u306F\u671D\u306B\u3053\u3053\u3067\u9774\u3092\u306A\u304F\u3057\u305F\u3002^det:the n:girl/v:lose|past/n:shoe|pl/adv:here/prep:in det:the n:morning",
    "1^\u304B\u308C\u3089\u306F\u4ECA\u671D\u53EB\u3093\u3060\u3002^pr:they/v:shout|past/idm:this_morning",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u56F3\u66F8\u9928\u306B\u7740\u304F\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:arrive|ing/prep:in det:the n:library/adv:tomorrow",
    "2^\u30DF\u30AB\u306F\u3042\u305D\u3053\u3067\u7A93\u3092\u5B89\u5168\u306B\u958B\u3051\u305F\u3002^n:Mika/v:open|past/det:the n:window/adv:safely/adv:there",
    "2^\u306D\u3053\u306F2\u6642\u9593\u7D75\u3092\u898B\u305F\u3002^det:the n:cat/v:see|past/det:a n:picture/idm:for_two_hours",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u591C\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^pr:we/v:invite|past/det:a n:speaker/idm:last_night",
    "1^\u304B\u308C\u3089\u306F\u6765\u305F\u3002^pr:they/v:come|past",
    "2^\u304B\u306E\u3058\u3087\u306F\u4ECA\u671D\u5C71\u3092\u898B\u305F\u3002^pr:she/v:see|past/det:the n:mountain/idm:this_morning",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u7A7A\u6E2F\u3067\u30DA\u30F3\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^pr:i n:friend|pl/be:pres v:lose|ing/det:a n:pen/prep:at det:the n:airport/adv:now",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u65E5\u7B11\u3063\u305F\u3002^pr:we/v:laugh|past/adv:yesterday",
    "2^\u5148\u751F\u306F2\u65E5\u524D\u8D08\u308A\u7269\u3092\u8CB7\u3063\u305F\u3002^det:the n:teacher/v:buy|past/det:a n:gift/idm:two_days_ago",
    "2^\u5148\u751F\u306F\u8ECA\u3092\u89AA\u5207\u306B\u4F7F\u3063\u305F\u3002^det:the n:teacher/v:use|past/det:the n:car/adv:kindly",
    "2^\u304B\u308C\u306F\u6BCE\u671D\u65B9\u6CD5\u3092\u898B\u3064\u3051\u308B\u3002^pr:he/v:find|base/det:a n:way/idm:every_morning",
    "1^\u304B\u308C\u3089\u306F\u9B5A\u306B\u3059\u3070\u3084\u304F\u3048\u3055\u3092\u3042\u3052\u305F\u3002^pr:they/v:feed|past/n:fish/adv:quickly",
    "2^\u72AC\u306F\u4F1A\u793E\u3067\u6025\u3050\u3002^det:the n:dog/v:hurry|base/prep:at det:the n:office",
    "2^\u304B\u308C\u3089\u306F\u5BB6\u3067\u8ECA\u3092\u4F7F\u3063\u3066\u3044\u308B\u3002^pr:they/be:pres v:use|ing/det:the n:car/idm:at_home",
    "2^\u306D\u3053\u306F\u68EE\u3067\u8D70\u3063\u305F\u3002^det:the n:cat/v:run|past/prep:in det:the n:forest",
    "3^\u3042\u306A\u305F\u306F\u6765\u9031\u5DDD\u306E\u305D\u3070\u3067\u304B\u3070\u3093\u3092\u6012\u3063\u3066\u6301\u3063\u3066\u304F\u308B\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:bring|ing/det:a n:bag/adv:angrily/prep:by det:the n:river/idm:next_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u4ECA\u3059\u3070\u3084\u304F\u4F11\u3093\u3067\u3044\u308B\u3002^pr:she/be:pres v:rest|ing/adv:quickly/adv:now",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u30D1\u30F3\u3092\u58F2\u3063\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:sell|ing/n:bread/adv:today",
    "2^\u304B\u308C\u3089\u306F\u524D\u56DE\u306F\u99C5\u306B\u7740\u3044\u305F\u3002^pr:they/v:arrive|past/prep:at det:the n:station/idm:last_time",
    "2^\u304B\u308C\u306F\u6BCE\u671D\u6559\u5BA4\u3067\u6CE3\u304F\u3002^pr:he/v:cry|base/prep:in det:the n:classroom/idm:every_morning",
    "2^\u30B1\u30F3\u306F\u6B21\u306F\u8A71\u3059\u3060\u308D\u3046\u3002^n:Ken/modal:will v:talk|base/idm:next_time",
    "3^\u5148\u751F\u306F\u5DDD\u306E\u305D\u3070\u3067\u30D1\u30EC\u30FC\u30C9\u3092\u898B\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:watch|base/det:a n:parade/prep:by det:the n:river",
    "2^\u5973\u306E\u5B50\u306F\u6628\u65E5\u6642\u9593\u3069\u304A\u308A\u306B\u8A71\u3057\u305F\u3002^det:the n:girl/v:talk|past/idm:on_time/adv:yesterday",
    "2^\u308F\u305F\u3057\u306F\u6708\u66DC\u65E5\u306B\u307C\u3046\u3057\u3092\u4EE5\u524D\u306F\u304B\u3076\u3063\u3066\u3044\u305F\u3002^pr:i/sm:used_to v:wear|base/det:a n:hat/prep:on n:Monday",
    "2^\u304B\u306E\u3058\u3087\u306F\u516C\u5712\u306B\u6012\u3063\u3066\u7740\u304F\u3002^pr:she/v:arrive|base/adv:angrily/prep:in det:the n:park",
    "3^\u7537\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:invite|base/det:a n:speaker/prep:in pr:i n:room",
    "1^\u308F\u305F\u3057\u306F7\u6642\u306B\u4F11\u3080\u3002^pr:i/v:rest|base/idm:at_seven",
    "1^\u304B\u308C\u306F\u7A81\u7136\u65C5\u884C\u3059\u308B\u3002^pr:he/v:travel|base/adv:suddenly",
    "2^\u5148\u751F\u306F\u5DDD\u306E\u305D\u3070\u3067\u30B9\u30FC\u30D7\u3092\u4F5C\u3063\u305F\u3002^det:the n:teacher/v:make|past/n:soup/prep:by det:the n:river",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u307B\u307B\u3048\u3080\u3002^pr:i n:mom/v:smile|base/prep:at det:the n:cafe",
    "2^\u308F\u305F\u3057\u306F\u5EAD\u3067\u8E0A\u3063\u305F\u3002^pr:i/v:dance|past/prep:in det:the n:garden",
    "2^\u30DF\u30AB\u306F\u307E\u3061\u304C\u3044\u3092\u5B89\u5168\u306B\u898B\u3064\u3051\u308B\u3002^n:Mika/v:find|base/det:a n:mistake/adv:safely",
    "2^\u308F\u305F\u3057\u306F\u3053\u3053\u3067\u304B\u3070\u3093\u3092\u3066\u3044\u306D\u3044\u306B\u8CB7\u3063\u305F\u3002^pr:i/v:buy|past/det:a n:bag/adv:politely/adv:here",
    "2^\u5973\u306E\u5B50\u306F\u4ECA\u65E5\u3068\u304D\u3069\u304D\u7D50\u679C\u3092\u78BA\u8A8D\u3059\u308B\u3002^det:the n:girl/adv:sometimes v:check|base/det:a n:result/adv:today",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6D77\u8FBA\u3067\u30ED\u30FC\u30D7\u3092\u5F15\u304F\u3002^pr:we/v:pull|base/det:a n:rope/prep:on det:the n:beach",
    "3^\u53CB\u3060\u3061\u306F\u6D77\u8FBA\u3067\u52D5\u753B\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:make|base/det:a n:video/prep:on det:the n:beach",
    "1^\u5148\u751F\u306F\u7A81\u7136\u7B11\u3063\u305F\u3002^det:the n:teacher/v:laugh|past/adv:suddenly",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u671D\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u78BA\u8A8D\u3057\u305F\u3002^pr:you/v:check|past/det:a n:message/idm:this_morning",
    "2^\u7537\u306E\u5B50\u306F\u6D77\u8FBA\u3067\u53EB\u3076\u3002^det:the n:boy/v:shout|base/prep:on det:the n:beach",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6D77\u8FBA\u3067\u6CE3\u3044\u305F\u3002^pr:we/v:cry|past/prep:on det:the n:beach",
    "2^\u304B\u308C\u306F\u671D\u306B\u6A21\u578B\u3092\u4F5C\u3063\u305F\u3002^pr:he/v:make|past/det:a n:model/prep:in det:the n:morning",
    "3^\u304B\u306E\u3058\u3087\u306F\u5148\u9031\u30D0\u30B9\u505C\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u501F\u308A\u305F\u3002^pr:she/v:borrow|past/det:a n:laptop/prep:at det:the n:bus_stop/idm:last_week",
    "2^\u7537\u306E\u5B50\u306F7\u6642\u306B\u5B66\u6821\u3067\u7B11\u3046\u3002^det:the n:boy/v:laugh|base/idm:at_school/idm:at_seven",
    "1^\u306D\u3053\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6025\u3050\u3002^det:the n:cat/v:hurry|base/idm:this_afternoon",
    "1^\u306D\u3053\u306F\u3053\u3053\u3078\u884C\u3063\u305F\u3002^det:the n:cat/v:go|past/adv:here",
    "2^\u304A\u7236\u3055\u3093\u306F\u8CEA\u554F\u3092\u3084\u3055\u3057\u304F\u3059\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:ask|base/det:a n:question/adv:softly",
    "2^\u3042\u306A\u305F\u306F\u50CD\u3044\u3066\u3044\u308B\u3002^pr:you/be:pres v:work|ing",
    "3^\u72AC\u306F\u6765\u9031\u68EE\u3067\u52D5\u753B\u3092\u898B\u308B\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:watch|ing/det:a n:video/prep:in det:the n:forest/idm:next_week",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u6765\u9031\u30AB\u30D5\u30A7\u3067\u5DE3\u7BB1\u3092\u304F\u3089\u3084\u307F\u3067\u4F5C\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:build|base/det:a n:birdhouse/idm:in_the_dark/prep:at det:the n:cafe/idm:next_week",
    "1^\u5148\u751F\u306F\u6628\u591C\u8CB7\u3044\u7269\u3057\u305F\u3002^det:the n:teacher/v:shop|past/idm:last_night",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u591C\u5DDD\u306E\u305D\u3070\u3067\u6025\u3050\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:hurry|ing/prep:by det:the n:river/adv:tonight",
    "3^\u53CB\u3060\u3061\u306F\u5EAD\u3067DVD\u3092\u501F\u308A\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:borrow|base/det:a n:DVD/prep:in det:the n:garden",
    "3^\u5148\u751F\u306F\u52D5\u7269\u5712\u3067\u65B9\u6CD5\u3092\u8FD1\u304F\u3067\u898B\u3064\u3051\u308B\u3002^det:the n:teacher/v:find|base/det:a n:way/idm:close_by/prep:at det:the n:zoo",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u660E\u65E5\u5BB6\u3067\u7BB1\u3092\u9589\u3081\u308B\u4E88\u5B9A\u3060\u3002^pr:we/be:pres v:close|ing/det:the n:box/idm:at_home/adv:tomorrow",
    "1^\u53CB\u3060\u3061\u306F7\u6642\u306B\u5BDD\u308B\u3002^pr:i n:friend|pl/v:sleep|base/idm:at_seven",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6559\u5BA4\u3067\u8E0A\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:dance|base/prep:in det:the n:classroom",
    "3^\u306D\u3053\u306F\u4ECA\u671D\u30AB\u30D5\u30A7\u3067\u5EAD\u3092\u6301\u3063\u3066\u3044\u305F\u3002^det:the n:cat/v:have|past/det:a n:garden/prep:at det:the n:cafe/idm:this_morning",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u304B\u3093\u305F\u3093\u306B\u53EB\u3093\u3067\u3044\u308B\u3002^pr:i n:mom/be:pres v:shout|ing/adv:easily",
    "2^\u306D\u3053\u306F\u7A81\u7136\u4F11\u3093\u3067\u3044\u308B\u3002^det:the n:cat/be:pres v:rest|ing/adv:suddenly",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u304F\u3089\u3084\u307F\u3067\u4F11\u3093\u3067\u3044\u308B\u3002^pr:we/be:pres v:rest|ing/idm:in_the_dark",
    "2^\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u5B66\u6821\u3067\u60C5\u5831\u3092\u9001\u3063\u305F\u3002^pr:i n:friend|pl/v:send|past/n:information/idm:at_school/idm:every_day",
    "3^\u5973\u306E\u5B50\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u30D1\u30BA\u30EB\u3092\u3084\u3063\u305F\u3002^det:the n:girl/v:do|past/det:a n:puzzle/prep:at det:the n:supermarket",
    "2^\u5973\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u304A\u8336\u3092\u4F5C\u3063\u305F\u3002^det:the n:girl/v:make|past/n:tea/prep:in det:the n:gym",
    "3^\u7537\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u5EAD\u3067\u30C6\u30FC\u30D6\u30EB\u3092\u76F4\u3059\u3002^det:the n:boy/v:fix|base/det:a n:table/prep:in det:the n:garden/adv:soon",
    "2^\u304A\u7236\u3055\u3093\u306F\u7B54\u3048\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:dad/v:check|base/det:a n:answer",
    "2^\u306D\u3053\u306F\u6D77\u8FBA\u3067\u5B8C\u307A\u304D\u306B\u8E0A\u308B\u3002^det:the n:cat/v:dance|base/adv:perfectly/prep:on det:the n:beach",
    "1^\u53CB\u3060\u3061\u306F\u5B8C\u307A\u304D\u306B\u8A71\u3059\u3002^pr:i n:friend|pl/v:talk|base/adv:perfectly",
    "2^\u5148\u751F\u306F\u6B21\u306F\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u501F\u308A\u308B\u3002^det:the n:teacher/v:borrow|base/pr:i n:phone/idm:next_time",
    "2^\u304B\u308C\u306F7\u6642\u306B\u75C5\u9662\u3078\u884C\u3063\u305F\u3002^pr:he/v:go|past/prep:to det:the n:hospital/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u52D5\u7269\u5712\u3067\u3072\u307E\u308F\u308A\u3092\u690D\u3048\u305F\u3002^n:Mika/v:plant|past/det:a n:sunflower/prep:at det:the n:zoo",
    "1^\u3042\u306A\u305F\u306F\u6628\u591C\u884C\u3063\u305F\u3002^pr:you/v:go|past/idm:last_night",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6628\u591C\u56F3\u66F8\u9928\u3067\u6642\u9593\u3069\u304A\u308A\u306B\u8D70\u3063\u305F\u3002^pr:we/v:run|past/idm:on_time/prep:in det:the n:library/idm:last_night",
    "1^\u304B\u306E\u3058\u3087\u306F\u4ECA\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3002^pr:she/v:feed|base/n:fish/adv:now",
    "3^\u304B\u308C\u3089\u306F\u6BCE\u671D\u56F3\u66F8\u9928\u3067\u30E1\u30FC\u30EB\u3092\u3082\u3046\u4E00\u5EA6\u9001\u3063\u305F\u3002^pr:they/v:send|past/det:a n:email/adv:again/prep:in det:the n:library/idm:every_morning",
    "2^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u304B\u3070\u3093\u3092\u958B\u3051\u305F\u3002^n:Ken/v:open|past/det:a n:bag/idm:last_time",
    "3^\u5148\u751F\u306F\u6765\u9031\u30AB\u30D5\u30A7\u3067\u89AA\u5207\u306B\u6CE3\u304F\u4E88\u5B9A\u3060\u3002^det:the n:teacher/be:pres v:cry|ing/adv:kindly/prep:at det:the n:cafe/idm:next_week",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u60C5\u5831\u3092\u4EE5\u524D\u306F\u63D0\u4F9B\u3057\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:give|base/n:information/adv:today",
    "1^\u3042\u306A\u305F\u306F\u89AA\u5207\u306B\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:you/v:jump|past/adv:kindly",
    "2^\u5973\u306E\u5B50\u306F\u30AB\u30D5\u30A7\u3067\u30B3\u30FC\u30D2\u30FC\u3092\u4F5C\u3063\u305F\u3002^det:the n:girl/v:make|past/n:coffee/prep:at det:the n:cafe",
    "3^\u3042\u306A\u305F\u306F\u3082\u3046\u3059\u3050\u5E97\u3067\u7D75\u3092\u898B\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:see|base/det:a n:picture/prep:at det:the n:store/adv:soon",
    "2^\u30DF\u30AB\u306F\u3082\u3046\u3059\u3050\u516C\u5712\u3067\u50CD\u304F\u3002^n:Mika/v:work|base/prep:in det:the n:park/adv:soon",
    "2^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u30D1\u30F3\u3092\u58F2\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:sell|base/n:bread/adv:soon",
    "3^\u7537\u306E\u5B50\u306F\u3053\u3053\u3067\u30C9\u30A2\u3092\u8FD1\u304F\u3067\u5F15\u3044\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:pull|ing/det:the n:door/adv:nearby/adv:here",
    "2^\u304A\u7236\u3055\u3093\u306F\u3053\u3053\u3067\u4EE5\u524D\u306F\u8CB7\u3044\u7269\u3057\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:shop|base/adv:here",
    "1^\u30B1\u30F3\u306F\u3055\u3063\u304D\u8CB7\u3044\u7269\u3057\u305F\u3002^n:Ken/v:shop|past/idm:just_now",
    "2^\u5148\u751F\u306F\u5148\u9031\u5E97\u306B\u7740\u3044\u305F\u3002^det:the n:teacher/v:arrive|past/prep:at det:the n:store/idm:last_week",
    "1^\u30B1\u30F3\u306F\u4E00\u65E5\u3058\u3085\u3046\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^n:Ken/v:jump|past/idm:all_day",
    "2^\u3042\u306A\u305F\u306F\u5915\u65B9\u306B\u4EE5\u524D\u306F\u5BDD\u3066\u3044\u305F\u3002^pr:you/sm:used_to v:sleep|base/prep:in det:the n:evening",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u30B9\u30FC\u30C4\u30B1\u30FC\u30B9\u3092\u5F15\u3044\u305F\u3002^pr:we/v:pull|past/det:a n:suitcase/prep:at n:night",
    "2^\u72AC\u306F\u3042\u305D\u3053\u3067\u4F11\u3081\u308B\u3002^det:the n:dog/modal:can v:rest|base/adv:there",
    "2^\u306D\u3053\u306F\u4ECA\u5B8C\u307A\u304D\u306B\u8D70\u308B\u3002^det:the n:cat/v:run|base/adv:perfectly/adv:now",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F2\u6642\u9593\u756A\u7D44\u3092\u898B\u305F\u3002^pr:we/v:watch|past/det:a n:show/idm:for_two_hours",
    "2^\u53CB\u3060\u3061\u306F\u524D\u56DE\u306F\u3073\u3093\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:i n:friend|pl/v:bring|past/det:a n:bottle/idm:last_time",
    "2^\u306D\u3053\u306F\u591C\u306B\u8D70\u3063\u305F\u3002^det:the n:cat/v:run|past/prep:at n:night",
    "1^\u30DF\u30AB\u306F\u4ECA\u65E5\u89AA\u5207\u306B\u6B69\u3044\u305F\u3002^n:Mika/v:walk|past/adv:kindly/adv:today",
    "2^\u30DF\u30AB\u306F\u660E\u65E5\u306E\u3093\u3073\u308A\u3059\u308B\u4E88\u5B9A\u3060\u3002^n:Mika/be:pres v:relax|ing/adv:tomorrow",
    "2^\u5148\u751F\u306F\u6628\u591C\u53E3\u3092\u9589\u3058\u305F\u3002^det:the n:teacher/v:close|past/pr:they n:mouth/idm:last_night",
    "2^\u306D\u3053\u306F\u3084\u3055\u3057\u304F\u6765\u308B\u3068\u3053\u308D\u3060\u3002^det:the n:cat/be:pres v:come|ing/adv:softly",
    "3^\u304B\u308C\u3089\u306F\u591C\u306B\u30D0\u30B9\u505C\u3067\u96A0\u308C\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:hide|base/prep:at det:the n:bus_stop/prep:at n:night",
    "1^\u5148\u751F\u306F\u6B21\u306F\u8CB7\u3044\u7269\u3059\u308B\u3002^det:the n:teacher/v:shop|base/idm:next_time",
    "3^\u7537\u306E\u5B50\u306F\u6628\u591C\u68EE\u3067\u3082\u3046\u4E00\u5EA6\u6CF3\u3044\u3060\u3002^det:the n:boy/v:swim|past/adv:again/prep:in det:the n:forest/idm:last_night",
    "2^\u30B1\u30F3\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u670D\u3092\u58F2\u3063\u305F\u3002^n:Ken/v:sell|past/n:clothes/prep:in pr:i n:room",
    "2^\u5148\u751F\u306F\u52D5\u7269\u5712\u3067\u3072\u305D\u304B\u306B\u53EB\u3076\u3002^det:the n:teacher/v:shout|base/adv:secretly/prep:at det:the n:zoo",
    "2^\u306D\u3053\u306F\u30D0\u30B9\u505C\u3067\u6CE3\u3044\u305F\u3002^det:the n:cat/v:cry|past/prep:at det:the n:bus_stop",
    "3^\u72AC\u306F2\u6642\u9593\u75C5\u9662\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^det:the n:dog/v:follow|past/det:the n:bus/prep:at det:the n:hospital/idm:for_two_hours",
    "3^\u3042\u306A\u305F\u306F\u5E97\u3067\u81EA\u8EE2\u8ECA\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:have|base/det:a n:bicycle/prep:at det:the n:store",
    "3^\u30B1\u30F3\u306F\u75C5\u9662\u3067\u308F\u305F\u3057\u306E\u96FB\u8A71\u306B\u7A81\u7136\u51FA\u305F\u3002^n:Ken/v:answer|past/pr:i n:phone/adv:suddenly/prep:at det:the n:hospital",
    "2^\u72AC\u306F\u30D0\u30B9\u505C\u3078\u6765\u308B\u3002^det:the n:dog/v:come|base/prep:to det:the n:bus_stop",
    "2^\u7537\u306E\u5B50\u306F\u5EAD\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:jump|base/prep:in det:the n:garden",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u75C5\u9662\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:mom/v:smile|past/prep:at det:the n:hospital",
    "2^\u30DF\u30AB\u306F\u4E00\u65E5\u3058\u3085\u3046\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD4\u4FE1\u3059\u308B\u3060\u308D\u3046\u3002^n:Mika/modal:will v:answer|base/det:a n:message/idm:all_day",
    "2^\u30B1\u30F3\u306F\u99C5\u3067\u8D70\u3063\u305F\u3002^n:Ken/v:run|past/prep:at det:the n:station",
    "2^\u5148\u751F\u306F\u30B3\u30FC\u30C8\u3092\u7740\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:wear|base/det:a n:coat",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u68EE\u3067\u30D1\u30BD\u30B3\u30F3\u3092\u4F7F\u3046\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:use|ing/det:the n:computer/prep:in det:the n:forest/adv:tomorrow",
    "2^\u306D\u3053\u306F\u591C\u306B\u3053\u3053\u3078\u6765\u308B\u3002^det:the n:cat/v:come|base/adv:here/prep:at n:night",
    "2^\u5148\u751F\u306F\u6771\u4EAC\u3067\u8CB7\u3044\u7269\u3057\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:shop|ing/prep:in n:Tokyo",
    "1^\u304B\u306E\u3058\u3087\u306F\u6BCE\u671D\u624B\u52A9\u3051\u3092\u3059\u308B\u3002^pr:she/v:give|base/n:help/idm:every_morning",
    "2^\u3042\u306A\u305F\u306F\u5DDD\u306E\u305D\u3070\u3067\u52DD\u3064\u3002^pr:you/v:win|base/prep:by det:the n:river",
    "1^\u306D\u3053\u306F\u6B21\u306F\u5BDD\u308B\u3002^det:the n:cat/v:sleep|base/idm:next_time",
    "1^\u304B\u306E\u3058\u3087\u306F\u3082\u3046\u3059\u3050\u8D70\u308B\u3002^pr:she/v:run|base/adv:soon",
    "2^\u30B1\u30F3\u306F\u4F53\u80B2\u9928\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^n:Ken/v:invite|past/det:a n:speaker/prep:in det:the n:gym",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F7\u6642\u306B\u50CD\u304F\u3002^pr:we/v:work|base/idm:at_seven",
    "2^\u7537\u306E\u5B50\u306F\u6BCE\u65E5\u5DDD\u306E\u305D\u3070\u3067\u8A71\u3059\u3002^det:the n:boy/v:talk|base/prep:by det:the n:river/idm:every_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u670D\u3092\u5B8C\u307A\u304D\u306B\u58F2\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:sell|base/n:clothes/adv:perfectly",
    "2^\u30B1\u30F3\u306F\u5148\u9031\u516C\u5712\u3078\u65C5\u884C\u3057\u305F\u3002^n:Ken/v:travel|past/prep:to det:the n:park/idm:last_week",
    "2^\u304B\u308C\u3089\u306F\u5B66\u6821\u3067\u6C34\u3092\u4EE5\u524D\u306F\u6301\u3063\u3066\u6765\u3066\u3044\u305F\u3002^pr:they/sm:used_to v:bring|base/n:water/idm:at_school",
    "1^\u3042\u306A\u305F\u306F\u5BB6\u3067\u30B7\u30E3\u30F3\u30D7\u30FC\u3092\u4F7F\u3046\u3002^pr:you/v:use|base/n:shampoo/idm:at_home",
    "1^\u5148\u751F\u306F\u3042\u305D\u3053\u3067\u5BDD\u305F\u3002^det:the n:teacher/v:sleep|past/adv:there",
    "3^\u5148\u751F\u306F\u4ECA\u65E5\u68EE\u3067\u6642\u523B\u3092\u5F97\u610F\u3052\u306B\u78BA\u8A8D\u3057\u305F\u3002^det:the n:teacher/v:check|past/det:the n:time/adv:proudly/prep:in det:the n:forest/adv:today",
    "2^\u30DF\u30AB\u306F\u516C\u5712\u3067\u5854\u3092\u4F5C\u308B\u3002^n:Mika/v:build|base/det:a n:tower/prep:in det:the n:park",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u56F3\u66F8\u9928\u3067\u8CEA\u554F\u3092\u3084\u3055\u3057\u304F\u3057\u3066\u3044\u308B\u3002^pr:we/be:pres v:ask|ing/det:a n:question/adv:softly/prep:in det:the n:library",
    "2^\u308F\u305F\u3057\u306F\u68EE\u3067\u6025\u3050\u3002^pr:i/v:hurry|base/prep:in det:the n:forest",
    "3^\u304B\u308C\u3089\u306F\u4ECA\u671D\u5E97\u3067\u30AB\u30E1\u30E9\u3092\u904B\u3093\u3060\u3002^pr:they/v:carry|past/det:a n:camera/prep:at det:the n:store/idm:this_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u6771\u4EAC\u3067\u81EA\u8EE2\u8ECA\u306B\u4E57\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:ride|base/det:a n:bike/prep:in n:Tokyo",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u75C5\u9662\u3067\u6CE3\u304F\u3002^pr:we/v:cry|base/prep:at det:the n:hospital",
    "3^\u304A\u7236\u3055\u3093\u306F\u30D0\u30B9\u505C\u3067\u5F15\u304D\u51FA\u3057\u3092\u3082\u3046\u4E00\u5EA6\u5F15\u304F\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:pull|base/det:a n:drawer/adv:again/prep:at det:the n:bus_stop",
    "3^\u5148\u751F\u306F\u7A7A\u6E2F\u3067\u82B1\u3092\u3042\u3052\u308B\u3002^det:the n:teacher/v:give|base/det:a n:flower/prep:at det:the n:airport",
    "1^\u30B1\u30F3\u306F\u8E0A\u3063\u305F\u3002^n:Ken/v:dance|past",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u591C\u306B\u307B\u307B\u3048\u3080\u3002^pr:i n:mom/v:smile|base/prep:at n:night",
    "2^\u308F\u305F\u3057\u306F\u52D5\u7269\u5712\u3067\u6CE3\u304F\u3002^pr:i/v:cry|base/prep:at det:the n:zoo",
    "3^\u5973\u306E\u5B50\u306F7\u6642\u306B\u30D0\u30B9\u505C\u3067\u30AB\u30E1\u30E9\u3092\u501F\u308A\u3089\u308C\u305F\u3002^det:the n:girl/modal:could v:borrow|base/det:a n:camera/prep:at det:the n:bus_stop/idm:at_seven",
    "2^\u5148\u751F\u306F\u4F53\u80B2\u9928\u3067\u8FD1\u304F\u3067\u6025\u3044\u3060\u3002^det:the n:teacher/v:hurry|past/adv:nearby/prep:in det:the n:gym",
    "1^\u304B\u306E\u3058\u3087\u306F7\u6642\u306B\u3084\u3055\u3057\u304F\u5BDD\u308B\u3002^pr:she/v:sleep|base/adv:softly/idm:at_seven",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u591C\u6B69\u304F\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:walk|ing/adv:tonight",
    "3^\u304A\u7236\u3055\u3093\u306F\u4F1A\u793E\u3078\u3075\u3060\u3093\u3059\u3070\u3084\u304F\u884C\u304F\u3002^pr:i n:dad/adv:usually v:go|base/adv:quickly/prep:to det:the n:office",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4E00\u65E5\u3058\u3085\u3046\u6A21\u578B\u3092\u4F5C\u3063\u305F\u3002^pr:i n:mom/v:build|past/det:a n:model/idm:all_day",
    "3^\u308F\u305F\u3057\u306F\u660E\u65E5\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u304B\u3055\u3092\u958B\u304F\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:open|ing/det:a n:umbrella/prep:in pr:i n:room/adv:tomorrow",
    "3^\u72AC\u306F\u6765\u9031\u3042\u305D\u3053\u3067\u5BB6\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:have|base/det:a n:house/adv:there/idm:next_week",
    "2^\u7537\u306E\u5B50\u306F\u6C34\u3092\u6012\u3063\u3066\u6301\u3063\u3066\u304F\u308B\u3002^det:the n:boy/v:bring|base/n:water/adv:angrily",
    "2^\u3042\u306A\u305F\u306F\u671D\u306B\u624B\u7D19\u306B\u8FD4\u4FE1\u3057\u305F\u3002^pr:you/v:answer|past/det:a n:letter/prep:in det:the n:morning",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u591C\u6B69\u304F\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:walk|ing/adv:tonight",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5EAD\u3067\u4F11\u3093\u3060\u3002^pr:i n:mom/v:rest|past/prep:in det:the n:garden",
    "1^\u308F\u305F\u3057\u306F7\u6642\u306B\u5B66\u6821\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:i/v:shop|past/idm:at_school/idm:at_seven",
    "2^\u30B1\u30F3\u306F\u6B21\u306F\u9B5A\u306B\u3064\u3044\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3002^n:Ken/v:feed|base/n:fish/adv:finally/idm:next_time",
    "3^\u30DF\u30AB\u306F\u671D\u306B\u6559\u5BA4\u3067\u6A21\u578B\u3092\u4F5C\u308B\u3002^n:Mika/v:build|base/det:a n:model/prep:in det:the n:classroom/prep:in det:the n:morning",
    "2^\u72AC\u306F\u3066\u3044\u306D\u3044\u306B\u6CE3\u304F\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:cry|base/adv:politely",
    "2^\u7537\u306E\u5B50\u306F\u524D\u56DE\u306F\u5F97\u610F\u3052\u306B\u4F11\u3093\u3060\u3002^det:the n:boy/v:rest|past/adv:proudly/idm:last_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u7B11\u3063\u305F\u3002^pr:i n:dad/v:laugh|past/prep:in pr:i n:room",
    "2^\u304A\u7236\u3055\u3093\u306F\u68EE\u3067\u50CD\u3044\u305F\u3002^pr:i n:dad/v:work|past/prep:in det:the n:forest",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u30B9\u30FC\u30D1\u30FC\u3067\u8D70\u308B\u3002^pr:i n:dad/v:run|base/prep:at det:the n:supermarket/adv:now",
    "3^\u304B\u308C\u306F\u524D\u56DE\u306F\u30D0\u30B9\u505C\u3067\u7A32\u3092\u690D\u3048\u305F\u3002^pr:he/v:plant|past/det:a n:rice_plant/prep:at det:the n:bus_stop/idm:last_time",
    "2^\u308F\u305F\u3057\u306F\u5BB6\u3067\u5730\u4E0B\u9244\u306B\u4E57\u3063\u305F\u3002^pr:i/v:ride|past/det:a n:subway/idm:at_home",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3044\u3059\u3092\u304B\u3093\u305F\u3093\u306B\u5F15\u304F\u3002^pr:we/v:pull|base/det:a n:chair/adv:easily",
    "2^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u3042\u305D\u3053\u3078\u6765\u305F\u3002^pr:i n:friend|pl/v:come|past/adv:there/idm:all_day",
    "2^\u53CB\u3060\u3061\u306F\u3082\u3046\u3059\u3050\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u7B11\u3046\u3002^pr:i n:friend|pl/v:laugh|base/prep:at det:the n:restaurant/adv:soon",
    "2^\u7537\u306E\u5B50\u306F\u3082\u3046\u3059\u3050\u6620\u753B\u3092\u898B\u308B\u3002^det:the n:boy/v:watch|base/det:a n:movie/adv:soon",
    "2^\u72AC\u306F\u3044\u3063\u3057\u3087\u306B\u8D70\u3063\u3066\u3044\u308B\u3002^det:the n:dog/be:pres v:run|ing/adv:together",
    "2^\u30DF\u30AB\u306F\u5E97\u3067\u5BB6\u3092\u8CB7\u3046\u3002^n:Mika/v:buy|base/det:a n:house/prep:at det:the n:store",
    "2^\u53CB\u3060\u3061\u306F\u6BCE\u671D\u8CEA\u554F\u3092\u3059\u308B\u3002^pr:i n:friend|pl/v:ask|base/det:a n:question/idm:every_morning",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5B8C\u307A\u304D\u306B\u6025\u3044\u3067\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:hurry|ing/adv:perfectly/idm:this_afternoon",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u4F11\u3093\u3060\u3002^pr:i n:mom/v:rest|past/adv:today",
    "3^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u99C5\u3067\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u3092\u4F7F\u3046\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:use|base/det:a n:credit_card/prep:at det:the n:station/adv:today",
    "2^\u5148\u751F\u306F\u4E00\u65E5\u3058\u3085\u3046\u60C5\u5831\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:teacher/v:find|past/n:information/idm:all_day",
    "2^\u306D\u3053\u306F\u4ECA\u65E5\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^det:the n:cat/v:follow|past/det:the n:bus/adv:today",
    "3^\u308F\u305F\u3057\u306F\u3055\u3063\u304D\u6D77\u8FBA\u3067\u6620\u753B\u3092\u898B\u305F\u3002^pr:i/v:watch|past/det:a n:movie/prep:on det:the n:beach/idm:just_now",
    "3^\u306D\u3053\u306F\u99C5\u3067\u30B1\u30FC\u30AD\u3092\u5B89\u5168\u306B\u6301\u3063\u3066\u304F\u308B\u3002^det:the n:cat/v:bring|base/det:a n:cake/adv:safely/prep:at det:the n:station",
    "2^\u3042\u306A\u305F\u306F\u6628\u591C\u53F0\u6240\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:you/v:jump|past/prep:in det:the n:kitchen/idm:last_night",
    "1^\u304B\u308C\u306F\u6B21\u306F\u6CF3\u3050\u3002^pr:he/v:swim|base/idm:next_time",
    "2^\u304B\u308C\u306F\u4ECA\u6771\u4EAC\u3067\u3072\u307E\u308F\u308A\u3092\u690D\u3048\u308B\u3002^pr:he/v:plant|base/det:a n:sunflower/prep:in n:Tokyo/adv:now",
    "2^\u308F\u305F\u3057\u306F\u624B\u7D19\u3092\u3066\u3044\u306D\u3044\u306B\u958B\u5C01\u3057\u305F\u3002^pr:i/v:open|past/det:a n:letter/adv:politely",
    "2^\u3042\u306A\u305F\u306F\u624B\u7D19\u3092\u958B\u5C01\u3059\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:open|base/det:a n:letter",
    "2^\u3042\u306A\u305F\u306F\u7A7A\u6E2F\u3067\u96A0\u308C\u3066\u3044\u308B\u3002^pr:you/be:pres v:hide|ing/prep:at det:the n:airport",
    "2^\u304B\u308C\u3089\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8A66\u5408\u3092\u898B\u308B\u3002^pr:they/v:watch|base/det:the n:game/prep:at det:the n:supermarket",
    "2^\u7537\u306E\u5B50\u306F\u5148\u9031\u7A7A\u6E2F\u3067\u8D70\u3063\u305F\u3002^det:the n:boy/v:run|past/prep:at det:the n:airport/idm:last_week",
    "1^\u308F\u305F\u3057\u306F\u6BCE\u65E5\u7B11\u3046\u3002^pr:i/v:laugh|base/idm:every_day",
    "2^\u30DF\u30AB\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6771\u4EAC\u3067\u6CE3\u304F\u3060\u308D\u3046\u3002^n:Mika/modal:will v:cry|base/prep:in n:Tokyo/idm:this_afternoon",
    "2^\u308F\u305F\u3057\u306F\u516C\u5712\u3067\u4F11\u3093\u3060\u3002^pr:i/v:rest|past/prep:in det:the n:park",
    "3^\u30DF\u30AB\u306F\u3055\u3063\u304D\u4F53\u80B2\u9928\u3067\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u76F4\u3057\u305F\u3002^n:Mika/v:fix|past/det:a n:printer/prep:in det:the n:gym/idm:just_now",
    "1^\u30DF\u30AB\u306F2\u65E5\u524D\u3082\u3046\u4E00\u5EA6\u8D70\u3063\u305F\u3002^n:Mika/v:run|past/adv:again/idm:two_days_ago",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3055\u3063\u304D\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:we/v:have|past/pr:i n:phone/idm:just_now",
    "1^\u304B\u308C\u3089\u306F\u8FD1\u304F\u3067\u6765\u308B\u3002^pr:they/v:come|base/adv:nearby",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u5E97\u3067\u8E0A\u308B\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:dance|base/prep:at det:the n:store/adv:today",
    "2^\u304B\u306E\u3058\u3087\u306F\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u5B89\u5168\u306B\u4F7F\u3046\u3060\u308D\u3046\u3002^pr:she/modal:will v:use|base/det:a n:printer/adv:safely",
    "3^\u5973\u306E\u5B50\u306F\u524D\u56DE\u306F\u4F53\u80B2\u9928\u3078\u3088\u304F\u65C5\u884C\u3057\u305F\u3002^det:the n:girl/adv:often v:travel|past/prep:to det:the n:gym/idm:last_time",
    "2^\u7537\u306E\u5B50\u306F\u5EAD\u3078\u65C5\u884C\u3057\u3066\u3044\u308B\u3002^det:the n:boy/be:pres v:travel|ing/prep:to det:the n:garden",
    "1^\u308F\u305F\u3057\u306F\u3055\u3063\u304D\u884C\u3063\u305F\u3002^pr:i/v:go|past/idm:just_now",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u591C\u7A7A\u6E2F\u3067\u8CB7\u3044\u7269\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:shop|ing/prep:at det:the n:airport/adv:tonight",
    "3^\u72AC\u306F\u4ECA\u65E5\u30B9\u30FC\u30D1\u30FC\u3078\u884C\u304F\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:go|base/prep:to det:the n:supermarket/adv:today",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u516C\u5712\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:i n:mom/v:jump|past/prep:in det:the n:park",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F7\u6642\u306B\u75C5\u9662\u3067\u8E0A\u3063\u305F\u3002^pr:we/v:dance|past/prep:at det:the n:hospital/idm:at_seven",
    "2^\u30B1\u30F3\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^n:Ken/v:invite|base/det:a n:speaker/prep:at det:the n:restaurant",
    "2^\u72AC\u306F\u5DDD\u3078\u6765\u308B\u3002^det:the n:dog/v:come|base/prep:to det:the n:river",
    "3^\u304A\u7236\u3055\u3093\u306F\u6765\u9031\u5DDD\u306E\u305D\u3070\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:dad/be:pres v:invite|ing/det:a n:speaker/prep:by det:the n:river/idm:next_week",
    "2^\u5973\u306E\u5B50\u306F\u5148\u9031\u4F53\u80B2\u9928\u3067\u53EB\u3093\u3060\u3002^det:the n:girl/v:shout|past/prep:in det:the n:gym/idm:last_week",
    "2^\u3042\u306A\u305F\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u4F11\u3093\u3060\u3002^pr:you/v:rest|past/prep:in pr:i n:room",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u671D\u30D0\u30B9\u505C\u3067\u8D08\u308A\u7269\u3092\u3059\u3070\u3084\u304F\u9001\u3063\u305F\u3002^pr:i n:mom/v:send|past/det:a n:gift/adv:quickly/prep:at det:the n:bus_stop/idm:this_morning",
    "1^\u304B\u308C\u3089\u306F\u6BCE\u671D\u53EB\u3093\u3060\u3002^pr:they/v:shout|past/idm:every_morning",
    "3^\u7537\u306E\u5B50\u306F\u4ECA\u671D\u7A7A\u6E2F\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^det:the n:boy/v:invite|past/det:a n:speaker/prep:at det:the n:airport/idm:this_morning",
    "1^\u30B1\u30F3\u306F\u6BCE\u671D\u6B69\u304F\u3002^n:Ken/v:walk|base/idm:every_morning",
    "3^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:i n:dad/v:ask|past/det:a n:question/prep:in det:the n:park",
    "2^\u306D\u3053\u306F\u30B9\u30FC\u30D1\u30FC\u3078\u884C\u304F\u3002^det:the n:cat/v:go|base/prep:to det:the n:supermarket",
    "1^\u30DF\u30AB\u306F\u4ECA\u65E5\u6025\u3044\u3060\u3002^n:Mika/v:hurry|past/adv:today",
    "3^\u304B\u308C\u3089\u306F\u53F0\u6240\u3067\u82B1\u3092\u690D\u3048\u3066\u3044\u308B\u3002^pr:they/be:pres v:plant|ing/det:a n:flower/prep:in det:the n:kitchen",
    "2^\u5973\u306E\u5B50\u306F\u6B21\u306F\u5EAD\u3067\u96A0\u308C\u308B\u3002^det:the n:girl/v:hide|base/prep:in det:the n:garden/idm:next_time",
    "2^\u72AC\u306F\u89AA\u5207\u306B\u4EE5\u524D\u306F\u5BDD\u3066\u3044\u305F\u3002^det:the n:dog/sm:used_to v:sleep|base/adv:kindly",
    "2^\u308F\u305F\u3057\u306F\u7A93\u3092\u3072\u305D\u304B\u306B\u9589\u3081\u308B\u3002^pr:i/v:close|base/det:the n:window/adv:secretly",
    "3^\u5148\u751F\u306F7\u6642\u306B\u52D5\u7269\u5712\u3067\u672C\u3092\u958B\u3044\u305F\u3002^det:the n:teacher/v:open|past/det:a n:book/prep:at det:the n:zoo/idm:at_seven",
    "1^\u304B\u308C\u306F\u30CE\u30FC\u30C8\u3092\u501F\u308A\u308B\u3002^pr:he/v:borrow|base/det:a n:notebook",
    "2^\u7537\u306E\u5B50\u306F\u305F\u304F\u3055\u3093\u7B11\u3046\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:laugh|base/idm:a_lot",
    "2^\u30B1\u30F3\u306F\u591C\u306B\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u6301\u3063\u3066\u6765\u305F\u3002^n:Ken/v:bring|past/pr:i n:phone/prep:at n:night",
    "3^\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u30AB\u30D5\u30A7\u3067\u6A5F\u68B0\u3092\u4F5C\u3063\u305F\u3002^pr:i n:friend|pl/v:build|past/det:a n:machine/prep:at det:the n:cafe/idm:every_day",
    "3^\u304A\u7236\u3055\u3093\u306F\u6765\u9031\u52D5\u7269\u5712\u3067\u3044\u3059\u3092\u501F\u308A\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:dad/be:pres v:borrow|ing/det:a n:chair/prep:at det:the n:zoo/idm:next_week",
    "2^\u304A\u7236\u3055\u3093\u306F\u660E\u65E5\u7B11\u3046\u4E88\u5B9A\u3060\u3002^pr:i n:dad/be:pres v:laugh|ing/adv:tomorrow",
    "1^\u30B1\u30F3\u306F\u4ECA\u65E5\u6765\u308B\u3002^n:Ken/v:come|base/adv:today",
    "2^\u72AC\u306F\u7A81\u7136\u52DD\u3064\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:win|base/adv:suddenly",
    "3^\u304A\u7236\u3055\u3093\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u672C\u3092\u3066\u3044\u306D\u3044\u306B\u904B\u3093\u3067\u3044\u308B\u3002^pr:i n:dad/be:pres v:carry|ing/det:a n:book/adv:politely/prep:in pr:i n:room",
    "2^\u5148\u751F\u306F\u6D77\u8FBA\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:teacher/v:jump|past/prep:on det:the n:beach",
    "1^\u308F\u305F\u3057\u306F\u7A81\u7136\u6CF3\u3044\u3060\u3002^pr:i/v:swim|past/adv:suddenly",
    "2^\u304B\u308C\u306F\u660E\u65E5\u6642\u9593\u3069\u304A\u308A\u306B\u884C\u304F\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:go|ing/idm:on_time/adv:tomorrow",
    "1^\u308F\u305F\u3057\u306F\u96A0\u308C\u308B\u3002^pr:i/v:hide|base",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u6559\u5BA4\u3067\u30AB\u30FC\u30C9\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^pr:i n:mom/be:pres v:lose|ing/det:a n:card/prep:in det:the n:classroom",
    "2^\u3042\u306A\u305F\u306F\u56F3\u66F8\u9928\u3067\u5065\u5EB7\u3092\u5B88\u3063\u3066\u3044\u308B\u3002^pr:you/be:pres v:protect|ing/n:health/prep:in det:the n:library",
    "2^\u3042\u306A\u305F\u306F\u6B21\u306F\u99C5\u3078\u65C5\u884C\u3059\u308B\u3002^pr:you/v:travel|base/prep:to det:the n:station/idm:next_time",
    "2^\u72AC\u306F\u4ECA\u89AA\u5207\u306B\u6025\u3050\u3002^det:the n:dog/v:hurry|base/adv:kindly/adv:now",
    "2^\u304A\u7236\u3055\u3093\u306F\u6628\u65E5\u5B66\u6821\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:i n:dad/v:shop|past/idm:at_school/adv:yesterday",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u671D\u306B\u56F3\u66F8\u9928\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^pr:i n:mom/v:shop|base/prep:in det:the n:library/prep:in det:the n:morning",
    "1^\u304B\u308C\u3089\u306F\u5148\u9031\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:they/v:jump|past/idm:last_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u6D77\u8FBA\u3067\u6B69\u304F\u3002^pr:she/v:walk|base/prep:on det:the n:beach",
    "2^\u7537\u306E\u5B50\u306F\u5E97\u3067\u307B\u307B\u3048\u3080\u3002^det:the n:boy/v:smile|base/prep:at det:the n:store",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F2\u65E5\u524D\u4F1A\u793E\u3067\u50CD\u3044\u305F\u3002^pr:we/v:work|past/prep:at det:the n:office/idm:two_days_ago",
    "3^\u53CB\u3060\u3061\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u91CE\u83DC\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:buy|ing/n:vegetables/prep:in pr:i n:room",
    "2^\u72AC\u306F\u690D\u7269\u3092\u3082\u3046\u4E00\u5EA6\u5B88\u308B\u3060\u308D\u3046\u3002^det:the n:dog/modal:will v:protect|base/det:a n:plant/adv:again",
    "2^\u304B\u306E\u3058\u3087\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u672C\u3092\u306A\u304F\u3059\u3068\u3053\u308D\u3060\u3002^pr:she/be:pres v:lose|ing/det:a n:book/idm:this_afternoon",
    "2^\u30DF\u30AB\u306F\u52D5\u7269\u5712\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^n:Mika/v:shop|past/prep:at det:the n:zoo",
    "2^\u3042\u306A\u305F\u306F\u6765\u9031\u50CD\u304F\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:work|ing/idm:next_week",
    "2^\u308F\u305F\u3057\u306F\u5DDD\u306E\u305D\u3070\u3067\u5915\u65E5\u3092\u898B\u305F\u3002^pr:i/v:watch|past/det:the n:sunset/prep:by det:the n:river",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u771F\u591C\u4E2D\u306B\u53F0\u6240\u3067\u4EE5\u524D\u306F\u307B\u307B\u3048\u3093\u3067\u3044\u305F\u3002^pr:we/sm:used_to v:smile|base/prep:in det:the n:kitchen/prep:at n:midnight",
    "3^\u5973\u306E\u5B50\u306F\u671D\u306B\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u304B\u3070\u3093\u3092\u501F\u308A\u305F\u3002^det:the n:girl/v:borrow|past/det:a n:bag/prep:in pr:i n:room/prep:in det:the n:morning",
    "2^\u53CB\u3060\u3061\u306F\u30AB\u30D5\u30A7\u3067\u8E0A\u308B\u3002^pr:i n:friend|pl/v:dance|base/prep:at det:the n:cafe",
    "2^\u306D\u3053\u306F\u4F11\u3080\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:rest|base",
    "3^\u304B\u308C\u306F\u4ECA\u65E5\u75C5\u9662\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u898B\u3064\u3051\u308B\u3002^pr:he/v:find|base/pr:i n:phone/prep:at det:the n:hospital/adv:today",
    "2^\u304B\u308C\u306F\u6771\u4EAC\u3067\u8A71\u305B\u308B\u3002^pr:he/modal:can v:talk|base/prep:in n:Tokyo",
    "3^\u304B\u308C\u306F\u4ECA\u65E5\u6D77\u8FBA\u3067\u30C9\u30A2\u3092\u89AA\u5207\u306B\u958B\u3051\u305F\u3002^pr:he/v:open|past/det:the n:door/adv:kindly/prep:on det:the n:beach/adv:today",
    "2^\u5973\u306E\u5B50\u306F2\u65E5\u524D\u8C46\u3092\u690D\u3048\u305F\u3002^det:the n:girl/v:plant|past/det:a n:bean/idm:two_days_ago",
    "2^\u5973\u306E\u5B50\u306F\u7A7A\u6E2F\u3067\u4F11\u3093\u3067\u3044\u308B\u3002^det:the n:girl/be:pres v:rest|ing/prep:at det:the n:airport",
    "3^\u5148\u751F\u306F\u3082\u3046\u3059\u3050\u5E97\u3067\u3084\u3055\u3057\u304F\u6CE3\u304F\u3002^det:the n:teacher/v:cry|base/adv:softly/prep:at det:the n:store/adv:soon",
    "2^\u5148\u751F\u306F\u4ECA\u8CEA\u554F\u3092\u3059\u308B\u3002^det:the n:teacher/v:ask|base/det:a n:question/adv:now",
    "2^\u306D\u3053\u306F\u99C5\u3067\u4EE5\u524D\u306F\u6CE3\u3044\u3066\u3044\u305F\u3002^det:the n:cat/sm:used_to v:cry|base/prep:at det:the n:station",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6771\u4EAC\u3067\u81EA\u8EE2\u8ECA\u3092\u76F4\u3059\u3002^pr:we/v:fix|base/det:a n:bicycle/prep:in n:Tokyo",
    "2^\u72AC\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u8E0A\u3063\u305F\u3002^det:the n:dog/v:dance|past/prep:in pr:i n:room",
    "2^\u72AC\u306F\u6765\u9031\u6B69\u304F\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:walk|ing/idm:next_week",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u75C5\u9662\u3067\u756A\u7D44\u3092\u898B\u3066\u3044\u308B\u3002^pr:we/be:pres v:watch|ing/det:a n:show/prep:at det:the n:hospital",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5148\u9031\u30D0\u30E9\u3092\u690D\u3048\u305F\u3002^pr:we/v:plant|past/det:a n:rose/idm:last_week",
    "3^\u304B\u308C\u3089\u306F2\u65E5\u524D\u4F53\u80B2\u9928\u3067\u5199\u771F\u3092\u64AE\u3063\u305F\u3002^pr:they/v:take|past/det:a n:photo/prep:in det:the n:gym/idm:two_days_ago",
    "1^\u5148\u751F\u306F\u3066\u3044\u306D\u3044\u306B\u7740\u304F\u3002^det:the n:teacher/v:arrive|base/adv:politely",
    "2^\u5148\u751F\u306F\u30AB\u30D5\u30A7\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:teacher/v:chill|past/prep:at det:the n:cafe",
    "3^\u304B\u308C\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u3066\u3044\u308B\u3002^pr:he/be:pres v:watch|ing/det:a n:concert/prep:at det:the n:restaurant",
    "3^\u306D\u3053\u306F\u5148\u9031\u56F3\u66F8\u9928\u3067\u690D\u7269\u3092\u5B88\u3063\u305F\u3002^det:the n:cat/v:protect|past/det:a n:plant/prep:in det:the n:library/idm:last_week",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u591C\u306B\u516C\u5712\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:we/v:ask|past/det:a n:question/prep:in det:the n:park/prep:at n:night",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u7A7A\u6E2F\u3067\u81EA\u8EE2\u8ECA\u306B\u4E57\u3063\u305F\u3002^pr:i n:mom/v:ride|past/det:a n:bike/prep:at det:the n:airport",
    "2^\u3042\u306A\u305F\u306F\u56F3\u66F8\u9928\u3067\u8E0A\u308B\u3002^pr:you/v:dance|base/prep:in det:the n:library",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u591C\u306B\u7A7A\u6E2F\u3067\u725B\u4E73\u3092\u8CB7\u3046\u3002^pr:i n:mom/v:buy|base/n:milk/prep:at det:the n:airport/prep:at n:night",
    "2^\u53CB\u3060\u3061\u306F\u3042\u305D\u3053\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u8FD1\u304F\u3067\u4F7F\u3063\u305F\u3002^pr:i n:friend|pl/v:use|past/det:a n:laptop/adv:nearby/adv:there",
    "1^\u304B\u306E\u3058\u3087\u306F\u6628\u591C\u3066\u3044\u306D\u3044\u306B\u52DD\u3063\u305F\u3002^pr:she/v:win|past/adv:politely/idm:last_night",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u5DDD\u306E\u305D\u3070\u3067\u304B\u3055\u3092\u306A\u304F\u3059\u3002^pr:i n:friend|pl/v:lose|base/det:a n:umbrella/prep:by det:the n:river/adv:now",
    "2^\u5148\u751F\u306F\u3082\u3046\u4E00\u5EA6\u96A0\u308C\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:hide|ing/adv:again",
    "2^\u304B\u308C\u3089\u306F\u6BCE\u65E5\u30A8\u30B9\u30AB\u30EC\u30FC\u30BF\u30FC\u306B\u4E57\u308B\u3002^pr:they/v:ride|base/det:a n:escalator/idm:every_day",
    "2^\u72AC\u306F\u4ECA\u591C\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u52DD\u3064\u3060\u308D\u3046\u3002^det:the n:dog/be:pres v:win|ing/idm:in_time/adv:tonight",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u6BCE\u65E5\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:i n:mom/v:jump|base/idm:every_day",
    "2^\u308F\u305F\u3057\u306F\u3082\u3046\u3059\u3050\u5EAD\u3067\u6025\u3050\u3002^pr:i/v:hurry|base/prep:in det:the n:garden/adv:soon",
    "3^\u5973\u306E\u5B50\u306F2\u65E5\u524D\u5EAD\u3067\u671D\u3054\u306F\u3093\u3092\u4F5C\u3063\u305F\u3002^det:the n:girl/v:make|past/n:breakfast/prep:in det:the n:garden/idm:two_days_ago",
    "3^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u3044\u3063\u3057\u3087\u306B\u53EB\u3093\u3067\u3044\u308B\u3002^pr:i n:dad/be:pres v:shout|ing/adv:together/prep:in det:the n:park",
    "3^\u5148\u751F\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u5B66\u6821\u3067\u52D5\u753B\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:make|base/det:a n:video/idm:at_school/idm:this_afternoon",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6620\u753B\u3092\u304F\u3089\u3084\u307F\u3067\u898B\u308B\u3002^pr:i n:mom/v:watch|base/det:a n:movie/idm:in_the_dark",
    "2^\u304B\u308C\u306F\u6765\u9031\u30EC\u30B9\u30C8\u30E9\u30F3\u3078\u884C\u304F\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:go|ing/prep:to det:the n:restaurant/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F2\u65E5\u524D\u9774\u3092\u306A\u304F\u3057\u305F\u3002^pr:i n:friend|pl/v:lose|past/n:shoe|pl/idm:two_days_ago",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u516C\u5712\u3067\u4E0B\u624B\u306B\u52DD\u3063\u3066\u3044\u308B\u3002^pr:we/be:pres v:win|ing/adv:badly/prep:in det:the n:park",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u4F53\u80B2\u9928\u3067\u5065\u5EB7\u3092\u5B88\u308B\u3002^pr:we/v:protect|base/n:health/prep:in det:the n:gym",
    "3^\u53CB\u3060\u3061\u306F\u6B21\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u304A\u91D1\u3092\u501F\u308A\u308B\u3002^pr:i n:friend|pl/v:borrow|base/n:money/prep:at det:the n:supermarket/idm:next_time",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6D77\u8FBA\u3067\u3081\u304C\u306D\u3092\u306A\u304F\u3057\u305F\u3002^pr:i n:mom/v:lose|past/n:glass|pl/prep:on det:the n:beach",
    "1^\u72AC\u306F\u524D\u56DE\u306F\u8D70\u3063\u305F\u3002^det:the n:dog/v:run|past/idm:last_time",
    "3^\u304A\u7236\u3055\u3093\u306F\u4ECA\u65E5\u5DDD\u306E\u305D\u3070\u3067\u6CE3\u3044\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:cry|ing/prep:by det:the n:river/adv:today",
    "1^\u304A\u7236\u3055\u3093\u306F\u304B\u3093\u305F\u3093\u306B\u50CD\u3044\u305F\u3002^pr:i n:dad/v:work|past/adv:easily",
    "2^\u53CB\u3060\u3061\u306F\u4F53\u80B2\u9928\u3067\u52DD\u3063\u305F\u3002^pr:i n:friend|pl/v:win|past/prep:in det:the n:gym",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u671D\u65C5\u884C\u3057\u305F\u3002^pr:i n:mom/v:travel|past/idm:this_morning",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6765\u308B\u3002^pr:we/v:come|base/idm:this_afternoon",
    "2^\u304B\u308C\u3089\u306F\u4F53\u80B2\u9928\u3067\u30B3\u30FC\u30D2\u30FC\u3092\u8CB7\u3046\u3002^pr:they/v:buy|base/n:coffee/prep:in det:the n:gym",
    "2^\u3042\u306A\u305F\u306F\u30AB\u30D5\u30A7\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u304F\u3002^pr:you/v:follow|base/det:the n:bus/prep:at det:the n:cafe",
    "1^\u30DF\u30AB\u306F\u5B89\u5168\u306B\u6B69\u304F\u3002^n:Mika/v:walk|base/adv:safely",
    "2^\u5148\u751F\u306F\u6A5F\u68B0\u3092\u76F4\u3057\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:fix|ing/det:a n:machine",
    "2^\u30B1\u30F3\u306F\u5145\u96FB\u5668\u3092\u3044\u3063\u3057\u3087\u306B\u501F\u308A\u308B\u3002^n:Ken/v:borrow|base/det:a n:charger/adv:together",
    "1^\u304B\u308C\u3089\u306F\u9053\u5177\u3092\u4F7F\u3046\u3002^pr:they/v:use|base/det:a n:tool",
    "2^\u5973\u306E\u5B50\u306F\u65B9\u6CD5\u3092\u3064\u3044\u306B\u898B\u3064\u3051\u308B\u3002^det:the n:girl/v:find|base/det:a n:way/adv:finally",
    "3^\u304A\u7236\u3055\u3093\u306F\u516C\u5712\u3067\u5BB6\u3092\u898B\u305F\u3002^pr:i n:dad/v:see|past/det:a n:house/prep:in det:the n:park",
    "2^\u3042\u306A\u305F\u306F\u7A7A\u6E2F\u3067\u6025\u3050\u3002^pr:you/v:hurry|base/prep:at det:the n:airport",
    "2^\u30B1\u30F3\u306F\u6559\u5BA4\u3078\u6765\u305F\u3002^n:Ken/v:come|past/prep:to det:the n:classroom",
    "1^\u3042\u306A\u305F\u306F\u4ECA\u671D\u304A\u91D1\u3092\u3042\u3052\u305F\u3002^pr:you/v:give|past/n:money/idm:this_morning",
    "2^\u7537\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u6B69\u304F\u3002^det:the n:boy/v:walk|base/prep:in pr:i n:room",
    "3^\u304A\u7236\u3055\u3093\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u30EA\u30B9\u30C8\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:dad/v:check|base/det:a n:list/prep:at det:the n:supermarket",
    "2^\u5973\u306E\u5B50\u306F\u4E00\u65E5\u3058\u3085\u3046\u30DC\u30FC\u30C8\u3092\u4F5C\u3063\u305F\u3002^det:the n:girl/v:build|past/det:a n:boat/idm:all_day",
    "1^\u30DF\u30AB\u306F\u3088\u304F\u7740\u304F\u3002^n:Mika/adv:often v:arrive|base",
    "1^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u53EB\u3093\u3060\u3002^pr:i n:friend|pl/v:shout|past/idm:all_day",
    "1^\u30B1\u30F3\u306F\u6BCE\u671D\u50CD\u304F\u3002^n:Ken/v:work|base/idm:every_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u5DDD\u306E\u305D\u3070\u3067\u7BB1\u3092\u9589\u3081\u305F\u3002^pr:she/v:close|past/det:the n:box/prep:by det:the n:river",
    "3^\u53CB\u3060\u3061\u306F\u75C5\u9662\u3067\u82B1\u3092\u58F2\u3063\u305F\u3002^pr:i n:friend|pl/v:sell|past/det:a n:flower/prep:at det:the n:hospital",
    "2^\u7537\u306E\u5B50\u306F\u68EE\u3078\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:come|base/prep:to det:the n:forest",
    "2^\u5973\u306E\u5B50\u306F2\u65E5\u524D\u3053\u3053\u3067\u6D3B\u52D5\u3092\u3084\u3063\u305F\u3002^det:the n:girl/v:do|past/det:a n:activity/adv:here/idm:two_days_ago",
    "3^\u5148\u751F\u306F\u3082\u3046\u3059\u3050\u5DDD\u306E\u305D\u3070\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^det:the n:teacher/v:invite|base/det:a n:speaker/prep:by det:the n:river/adv:soon",
    "3^\u5148\u751F\u306F\u6BCE\u671D\u56F3\u66F8\u9928\u3067\u670D\u3092\u58F2\u3063\u305F\u3002^det:the n:teacher/v:sell|past/n:clothes/prep:in det:the n:library/idm:every_morning",
    "2^\u304A\u7236\u3055\u3093\u306F\u3082\u3046\u3059\u3050\u304B\u3093\u305F\u3093\u306B\u6B69\u304F\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:walk|base/adv:easily/adv:soon",
    "2^\u304B\u308C\u3089\u306F\u524D\u56DE\u306F\u5B66\u6821\u3067\u304B\u3055\u3092\u6301\u3063\u3066\u6765\u305F\u3002^pr:they/v:bring|past/det:a n:umbrella/idm:at_school/idm:last_time",
    "3^\u72AC\u306F\u30D0\u30B9\u505C\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u6301\u3063\u3066\u3044\u308B\u3002^det:the n:dog/v:have|base/pr:i n:phone/prep:at det:the n:bus_stop",
    "2^\u5148\u751F\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u6CE3\u304F\u3002^det:the n:teacher/v:cry|base/prep:at det:the n:supermarket",
    "2^\u5148\u751F\u306F\u6628\u65E5\u5DDD\u306E\u305D\u3070\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^det:the n:teacher/v:chill|past/prep:by det:the n:river/adv:yesterday",
    "3^\u5973\u306E\u5B50\u306F\u4F1A\u793E\u3067\u53E3\u3092\u9759\u304B\u306B\u9589\u3058\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:close|base/pr:she n:mouth/adv:quietly/prep:at det:the n:office",
    "2^\u3042\u306A\u305F\u306F\u3055\u3063\u304D\u30C8\u30DE\u30C8\u3092\u690D\u3048\u305F\u3002^pr:you/v:plant|past/det:a n:tomato/idm:just_now",
    "2^\u304B\u306E\u3058\u3087\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8D70\u3063\u305F\u3002^pr:she/v:run|past/prep:at det:the n:restaurant",
    "2^\u304B\u306E\u3058\u3087\u306F\u6B21\u306F\u5B66\u6821\u3067\u81EA\u8EE2\u8ECA\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:she/v:have|base/det:a n:bicycle/idm:at_school/idm:next_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u3066\u3044\u306D\u3044\u306B\u50CD\u3044\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:work|ing/adv:politely",
    "2^\u304B\u308C\u3089\u306F\u7B11\u3063\u3066\u3044\u308B\u3002^pr:they/be:pres v:laugh|ing",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u306B\u7740\u304F\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:arrive|base/prep:at det:the n:restaurant",
    "2^\u304A\u7236\u3055\u3093\u306F\u6628\u591C\u81EA\u8EE2\u8ECA\u306B\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u4E57\u3063\u305F\u3002^pr:i n:dad/v:ride|past/det:a n:bike/idm:in_time/idm:last_night",
    "1^\u30B1\u30F3\u306F\u4E0B\u624B\u306B\u50CD\u304F\u3002^n:Ken/v:work|base/adv:badly",
    "2^\u30B1\u30F3\u306F\u96FB\u6C60\u3092\u4EE5\u524D\u306F\u78BA\u8A8D\u3057\u3066\u3044\u305F\u3002^n:Ken/sm:used_to v:check|base/det:a n:battery",
    "2^\u5973\u306E\u5B50\u306F\u5DDD\u306E\u305D\u3070\u3067\u8E0A\u3063\u305F\u3002^det:the n:girl/v:dance|past/prep:by det:the n:river",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u52D5\u7269\u5712\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:mom/be:pres v:chill|ing/prep:at det:the n:zoo/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u7A7A\u6E2F\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:i n:friend|pl/v:jump|past/prep:at det:the n:airport/idm:all_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u8ECA\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:i n:mom/v:have|base/det:the n:car",
    "2^\u3042\u306A\u305F\u306F\u671D\u306B\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3002^pr:you/v:invite|base/det:a n:speaker/prep:in det:the n:morning",
    "2^\u30DF\u30AB\u306F\u5DDD\u306E\u305D\u3070\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^n:Mika/v:chill|past/prep:by det:the n:river",
    "3^\u306D\u3053\u306F\u30D0\u30B9\u505C\u3067\u5EAD\u3092\u6301\u3063\u3066\u3044\u308B\u3002^det:the n:cat/v:have|base/det:a n:garden/prep:at det:the n:bus_stop",
    "2^\u306D\u3053\u306F\u5EAD\u3067\u96A0\u308C\u305F\u3002^det:the n:cat/v:hide|past/prep:in det:the n:garden",
    "2^\u72AC\u306F\u4F1A\u793E\u3078\u884C\u304F\u3068\u3053\u308D\u3060\u3002^det:the n:dog/be:pres v:go|ing/prep:to det:the n:office",
    "2^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u5B66\u6821\u3067\u8ECA\u3092\u58F2\u308B\u3002^pr:they/v:sell|base/det:the n:car/idm:at_school/adv:soon",
    "3^\u5973\u306E\u5B50\u306F\u53F0\u6240\u3067\u9053\u5177\u3092\u304B\u3093\u305F\u3093\u306B\u904B\u3093\u3060\u3002^det:the n:girl/v:carry|past/det:a n:tool/adv:easily/prep:in det:the n:kitchen",
    "2^\u30B1\u30F3\u306F\u671D\u306B\u7740\u304F\u3060\u308D\u3046\u3002^n:Ken/modal:will v:arrive|base/prep:in det:the n:morning",
    "2^\u308F\u305F\u3057\u306F\u6B21\u306F\u30C1\u30E5\u30FC\u30EA\u30C3\u30D7\u3092\u690D\u3048\u308B\u3002^pr:i/v:plant|base/det:a n:tulip/idm:next_time",
    "2^\u304B\u308C\u306F\u6765\u9031\u6765\u308B\u3060\u308D\u3046\u3002^pr:he/modal:will v:come|base/idm:next_week",
    "2^\u53CB\u3060\u3061\u306F\u9031\u672B\u306B\u4EE5\u524D\u306F\u53EB\u3093\u3067\u3044\u305F\u3002^pr:i n:friend|pl/sm:used_to v:shout|base/idm:on_weekends",
    "1^\u304A\u6BCD\u3055\u3093\u306F2\u6642\u9593\u8D70\u3063\u305F\u3002^pr:i n:mom/v:run|past/idm:for_two_hours",
    "2^\u72AC\u306F\u4ECA\u65E5\u516C\u5712\u3067\u8D70\u308B\u3002^det:the n:dog/v:run|base/prep:in det:the n:park/adv:today",
    "2^\u308F\u305F\u3057\u306F\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u8A71\u3057\u305F\u3002^pr:i/v:talk|past/prep:in pr:i n:room",
    "3^\u30B1\u30F3\u306F\u6765\u9031\u6771\u4EAC\u3067\u8B1B\u6F14\u8005\u3092\u5F97\u610F\u3052\u306B\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:invite|ing/det:a n:speaker/adv:proudly/prep:in n:Tokyo/idm:next_week",
    "3^\u5148\u751F\u306F\u75C5\u9662\u3067\u8D08\u308A\u7269\u3092\u6301\u3063\u3066\u6765\u305F\u3002^det:the n:teacher/v:bring|past/det:a n:gift/prep:at det:the n:hospital",
    "2^\u72AC\u306F\u5148\u9031\u5EAD\u3078\u6765\u305F\u3002^det:the n:dog/v:come|past/prep:to det:the n:garden/idm:last_week",
    "2^\u53CB\u3060\u3061\u306F\u4ECA\u8349\u3092\u690D\u3048\u308B\u3002^pr:i n:friend|pl/v:plant|base/n:grass/adv:now",
    "3^\u30B1\u30F3\u306F\u56F3\u66F8\u9928\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u3059\u3070\u3084\u304F\u76F4\u3059\u3060\u308D\u3046\u3002^n:Ken/modal:will v:fix|base/det:a n:laptop/adv:quickly/prep:in det:the n:library",
    "2^\u304B\u308C\u3089\u306F\u99C5\u306B\u3044\u3063\u3057\u3087\u306B\u7740\u304F\u3002^pr:they/v:arrive|base/adv:together/prep:at det:the n:station",
    "3^\u306D\u3053\u306F\u5DDD\u306E\u305D\u3070\u3067\u8CEA\u554F\u304C\u3042\u3063\u305F\u3002^det:the n:cat/v:have|past/det:a n:question/prep:by det:the n:river",
    "2^\u30B1\u30F3\u306F\u6D77\u8FBA\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^n:Ken/v:relax|base/prep:on det:the n:beach",
    "2^\u304B\u308C\u3089\u306F\u6765\u9031\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u307B\u307B\u3048\u3080\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:smile|ing/idm:in_time/idm:next_week",
    "2^\u304B\u306E\u3058\u3087\u306F\u5148\u9031\u6559\u5BA4\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:she/v:jump|past/prep:in det:the n:classroom/idm:last_week",
    "1^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u6CF3\u3050\u3002^pr:he/v:swim|base/adv:soon",
    "2^\u30B1\u30F3\u306F\u660E\u65E5\u307E\u3063\u305F\u308A\u3059\u308B\u4E88\u5B9A\u3060\u3002^n:Ken/be:pres v:chill|ing/adv:tomorrow",
    "2^\u30B1\u30F3\u306F\u7A7A\u6E2F\u3078\u65C5\u884C\u3059\u308B\u3002^n:Ken/v:travel|base/prep:to det:the n:airport",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u5B8C\u307A\u304D\u306B\u6B69\u3044\u305F\u3002^pr:we/v:walk|past/adv:perfectly",
    "3^\u7537\u306E\u5B50\u306F2\u6642\u9593\u6D77\u8FBA\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^det:the n:boy/v:invite|past/det:a n:speaker/prep:on det:the n:beach/idm:for_two_hours",
    "1^\u304B\u308C\u3089\u306F\u6B21\u306F\u65C5\u884C\u3059\u308B\u3002^pr:they/v:travel|base/idm:next_time",
    "3^\u3042\u306A\u305F\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:invite|base/det:a n:speaker/prep:in pr:i n:room",
    "2^\u30B1\u30F3\u306F2\u65E5\u524D\u6771\u4EAC\u3067\u6025\u3044\u3060\u3002^n:Ken/v:hurry|past/prep:in n:Tokyo/idm:two_days_ago",
    "3^\u308F\u305F\u3057\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u5BB6\u3092\u58F2\u308B\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:sell|base/det:a n:house/prep:at det:the n:supermarket",
    "2^\u30DF\u30AB\u306F\u5DDD\u306E\u305D\u3070\u3067\u30AB\u30FC\u30C9\u3092\u3042\u3052\u308B\u3002^n:Mika/v:give|base/det:a n:card/prep:by det:the n:river",
    "3^\u53CB\u3060\u3061\u306F\u660E\u65E5\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:i n:friend|pl/be:pres v:invite|ing/det:a n:speaker/prep:at det:the n:restaurant/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u6628\u65E5\u98DF\u3079\u7269\u3092\u4F5C\u3063\u305F\u3002^pr:i n:friend|pl/v:make|past/n:food/adv:yesterday",
    "2^\u30DF\u30AB\u306F\u5EAD\u3067\u6CE3\u304F\u3060\u308D\u3046\u3002^n:Mika/modal:will v:cry|base/prep:in det:the n:garden",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u65E5\u8A71\u3059\u3002^pr:we/v:talk|base/idm:every_day",
    "3^\u5973\u306E\u5B50\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^det:the n:girl/v:follow|past/det:the n:bus/prep:at det:the n:supermarket",
    "2^\u306D\u3053\u306F\u3053\u3053\u3067\u5BB6\u3092\u6301\u3063\u3066\u3044\u308B\u3002^det:the n:cat/v:have|base/det:a n:house/adv:here",
    "1^\u5148\u751F\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:teacher/v:jump|past/idm:this_afternoon",
    "2^\u306D\u3053\u306F\u4E00\u65E5\u3058\u3085\u3046\u3068\u304D\u3069\u304D\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u305F\u3002^det:the n:cat/adv:sometimes v:watch|past/det:a n:concert/idm:all_day",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u98DF\u3079\u7269\u3092\u904B\u3076\u3002^pr:we/v:carry|base/n:food",
    "2^\u72AC\u306F7\u6642\u306B\u76EE\u3092\u5B88\u308B\u3002^det:the n:dog/v:protect|base/det:a n:eye/idm:at_seven",
    "3^\u5148\u751F\u306F\u591C\u306B\u4F1A\u793E\u3067\u624B\u3076\u304F\u308D\u3092\u306F\u3081\u305F\u3002^det:the n:teacher/v:wear|past/det:a n:glove/prep:at det:the n:office/prep:at n:night",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u53F0\u6240\u3067\u5BDD\u305F\u3002^pr:i/v:sleep|past/prep:in det:the n:kitchen/adv:today",
    "1^\u7537\u306E\u5B50\u306F\u6BCE\u65E5\u5BDD\u308B\u3002^det:the n:boy/v:sleep|base/idm:every_day",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5B66\u6821\u3067\u30AB\u30FC\u30C9\u3092\u306A\u304F\u3057\u305F\u3002^pr:we/v:lose|past/det:a n:card/idm:at_school",
    "2^\u72AC\u306F\u75C5\u9662\u3067\u8E0A\u308B\u3002^det:the n:dog/v:dance|base/prep:at det:the n:hospital",
    "2^\u304B\u308C\u3089\u306F\u5BB6\u3067\u30B1\u30FC\u30AD\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:make|base/det:a n:cake/idm:at_home",
    "1^\u304B\u306E\u3058\u3087\u306F2\u6642\u9593\u3084\u3055\u3057\u304F\u6B69\u3044\u305F\u3002^pr:she/v:walk|past/adv:softly/idm:for_two_hours",
    "3^\u304A\u7236\u3055\u3093\u306F\u30AB\u30D5\u30A7\u3067\u304F\u3060\u3082\u306E\u3092\u4E0B\u624B\u306B\u8CB7\u3063\u3066\u3044\u308B\u3002^pr:i n:dad/be:pres v:buy|ing/n:fruit/adv:badly/prep:at det:the n:cafe",
    "2^\u30B1\u30F3\u306F\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u8E0A\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:dance|base/prep:in pr:i n:room",
    "2^\u5148\u751F\u306F\u4ECA\u591C\u30B9\u30AF\u30FC\u30BF\u30FC\u306B\u4E57\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:ride|base/det:a n:scooter/adv:tonight",
    "2^\u5973\u306E\u5B50\u306F\u98DF\u3079\u7269\u3092\u7A81\u7136\u8CB7\u3046\u3002^det:the n:girl/v:buy|base/n:food/adv:suddenly",
    "3^\u304B\u308C\u306F\u3082\u3046\u3059\u3050\u52D5\u7269\u5712\u3067\u30DC\u30FC\u30C8\u306B\u3044\u3063\u3057\u3087\u306B\u4E57\u308B\u3002^pr:he/v:ride|base/det:a n:boat/adv:together/prep:at det:the n:zoo/adv:soon",
    "2^\u72AC\u306F\u5DDD\u306E\u305D\u3070\u3067\u6CF3\u3050\u3002^det:the n:dog/v:swim|base/prep:by det:the n:river",
    "1^\u304B\u306E\u3058\u3087\u306F\u6BCE\u65E5\u6765\u308B\u3002^pr:she/v:come|base/idm:every_day",
    "2^\u7537\u306E\u5B50\u306F\u99C5\u3067\u7B11\u3063\u305F\u3002^det:the n:boy/v:laugh|past/prep:at det:the n:station",
    "3^\u5973\u306E\u5B50\u306F\u591C\u306B\u5EAD\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3002^det:the n:girl/v:relax|base/prep:in det:the n:garden/prep:at n:night",
    "3^\u53CB\u3060\u3061\u306F\u671D\u306B\u5DDD\u3078\u7A81\u7136\u6765\u308B\u3002^pr:i n:friend|pl/v:come|base/adv:suddenly/prep:to det:the n:river/prep:in det:the n:morning",
    "2^\u5973\u306E\u5B50\u306F2\u65E5\u524D\u5BB6\u3092\u898B\u3064\u3051\u305F\u3002^det:the n:girl/v:find|past/det:a n:house/idm:two_days_ago",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30AB\u30D5\u30A7\u3067\u9B5A\u306B\u3048\u3055\u3092\u3042\u3052\u3066\u3044\u308B\u3002^pr:we/be:pres v:feed|ing/n:fish/prep:at det:the n:cafe",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4E00\u65E5\u3058\u3085\u3046\u56F3\u66F8\u9928\u3067\u96A0\u308C\u305F\u3002^pr:i n:mom/v:hide|past/prep:in det:the n:library/idm:all_day",
    "2^\u5148\u751F\u306F\u4ECA\u591C\u6CF3\u3050\u4E88\u5B9A\u3060\u3002^det:the n:teacher/be:pres v:swim|ing/adv:tonight",
    "2^\u304B\u306E\u3058\u3087\u306F\u7A7A\u6E2F\u3067\u672C\u3092\u6301\u3063\u3066\u3044\u308B\u3002^pr:she/v:have|base/det:a n:book/prep:at det:the n:airport",
    "1^\u72AC\u306F\u304B\u3093\u305F\u3093\u306B\u4F11\u3093\u3060\u3002^det:the n:dog/v:rest|past/adv:easily",
    "3^\u304A\u6BCD\u3055\u3093\u306F\u591C\u306B\u4F53\u80B2\u9928\u3067\u8CB7\u3044\u7269\u3057\u305F\u3002^pr:i n:mom/v:shop|past/prep:in det:the n:gym/prep:at n:night",
    "2^\u308F\u305F\u3057\u306F\u3042\u305D\u3053\u3067\u3086\u3063\u304F\u308A\u8E0A\u3063\u3066\u3044\u308B\u3002^pr:i/be:pres v:dance|ing/adv:slowly/adv:there",
    "2^\u304B\u308C\u306F\u6628\u591C\u6620\u753B\u3092\u898B\u305F\u3002^pr:he/v:see|past/det:a n:movie/idm:last_night",
    "2^\u30B1\u30F3\u306F\u7A7A\u6E2F\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^n:Ken/v:ask|past/det:a n:question/prep:at det:the n:airport",
    "2^\u304A\u7236\u3055\u3093\u306F\u30D0\u30B9\u505C\u3067\u6025\u3050\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:hurry|base/prep:at det:the n:bus_stop",
    "2^\u30DF\u30AB\u306F\u6559\u5BA4\u3067\u50CD\u3044\u305F\u3002^n:Mika/v:work|past/prep:in det:the n:classroom",
    "2^\u308F\u305F\u3057\u306F\u75C5\u9662\u3067\u6B69\u304F\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:walk|base/prep:at det:the n:hospital",
    "3^\u304A\u7236\u3055\u3093\u306F\u7A7A\u6E2F\u3067\u8ECA\u306B\u4EE5\u524D\u306F\u3064\u3044\u3066\u3044\u3063\u3066\u3044\u305F\u3002^pr:i n:dad/sm:used_to v:follow|base/det:the n:car/prep:at det:the n:airport",
    "3^\u53CB\u3060\u3061\u306F\u4ECA\u591C\u516C\u5712\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:walk|base/prep:in det:the n:park/adv:tonight",
    "1^\u304A\u7236\u3055\u3093\u306F\u6642\u9593\u3069\u304A\u308A\u306B\u53EB\u3076\u3002^pr:i n:dad/v:shout|base/idm:on_time",
    "1^\u306D\u3053\u306F\u3042\u305D\u3053\u3067\u6CF3\u3050\u3002^det:the n:cat/v:swim|base/adv:there",
    "2^\u30B1\u30F3\u306F\u98DF\u5668\u68DA\u3092\u3059\u3070\u3084\u304F\u9589\u3081\u308B\u3002^n:Ken/v:close|base/det:a n:cupboard/adv:quickly",
    "3^\u30B1\u30F3\u306F\u6765\u9031\u30D0\u30B9\u505C\u3067\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u76F4\u3059\u3060\u308D\u3046\u3002^n:Ken/modal:will v:fix|base/det:a n:laptop/prep:at det:the n:bus_stop/idm:next_week",
    "2^\u7537\u306E\u5B50\u306F\u304B\u3055\u3092\u3084\u3055\u3057\u304F\u306A\u304F\u3057\u305F\u3002^det:the n:boy/v:lose|past/det:a n:umbrella/adv:softly",
    "2^\u5973\u306E\u5B50\u306F\u30D0\u30B9\u505C\u3067\u9774\u4E0B\u3092\u306F\u3044\u305F\u3002^det:the n:girl/v:wear|past/n:sock|pl/prep:at det:the n:bus_stop",
    "2^\u304B\u308C\u306F\u5DDD\u306E\u305D\u3070\u3067\u50CD\u304F\u3002^pr:he/v:work|base/prep:by det:the n:river",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u75C5\u9662\u3067\u6025\u3050\u3002^pr:we/v:hurry|base/prep:at det:the n:hospital",
    "2^\u5148\u751F\u306F\u6628\u65E5\u5199\u771F\u3092\u9001\u3063\u305F\u3002^det:the n:teacher/v:send|past/det:a n:photo/adv:yesterday",
    "3^\u5148\u751F\u306F\u5EAD\u3067\u5854\u3092\u3084\u3055\u3057\u304F\u4F5C\u3063\u3066\u3044\u308B\u3002^det:the n:teacher/be:pres v:build|ing/det:a n:tower/adv:softly/prep:in det:the n:garden",
    "2^\u3042\u306A\u305F\u306F\u6BCE\u671D\u6559\u5BA4\u3067\u8FD1\u304F\u3067\u96A0\u308C\u308B\u3002^pr:you/v:hide|base/adv:nearby/prep:in det:the n:classroom/idm:every_morning",
    "2^\u308F\u305F\u3057\u306F\u6B21\u306F\u30DA\u30F3\u3092\u3042\u3052\u308B\u3002^pr:i/v:give|base/det:a n:pen/idm:next_time",
    "2^\u304A\u7236\u3055\u3093\u306F\u6BCE\u65E5\u304A\u91D1\u3092\u5F97\u610F\u3052\u306B\u9001\u3063\u305F\u3002^pr:i n:dad/v:send|past/n:money/adv:proudly/idm:every_day",
    "3^\u304B\u308C\u3089\u306F7\u6642\u306B\u52D5\u7269\u5712\u3067\u8ECA\u3092\u76F4\u3059\u3002^pr:they/v:fix|base/det:the n:car/prep:at det:the n:zoo/idm:at_seven",
    "2^\u30DF\u30AB\u306F\u30AB\u30D5\u30A7\u3067\u6CF3\u3050\u3002^n:Mika/v:swim|base/prep:at det:the n:cafe",
    "2^\u304A\u7236\u3055\u3093\u306F\u30E1\u30FC\u30EB\u3092\u3072\u305D\u304B\u306B\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:dad/v:check|base/det:a n:email/adv:secretly",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u30AB\u30D5\u30A7\u3067\u4ED5\u4E8B\u3092\u3084\u308B\u3002^pr:we/v:do|base/det:a n:job/prep:at det:the n:cafe",
    "2^\u53CB\u3060\u3061\u306F\u6628\u591C\u4F9D\u983C\u306B\u5FDC\u3058\u305F\u3002^pr:i n:friend|pl/v:answer|past/det:a n:request/idm:last_night",
    "2^\u53CB\u3060\u3061\u306F\u7A7A\u6E2F\u3067\u8D70\u3063\u305F\u3002^pr:i n:friend|pl/v:run|past/prep:at det:the n:airport",
    "2^\u7537\u306E\u5B50\u306F\u6628\u65E5\u81EA\u8EE2\u8ECA\u3092\u501F\u308A\u305F\u3002^det:the n:boy/v:borrow|past/det:a n:bicycle/adv:yesterday",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u671D\u4F1A\u793E\u3067\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:dad/v:smile|past/prep:at det:the n:office/idm:this_morning",
    "2^\u304A\u7236\u3055\u3093\u306F\u56F3\u66F8\u9928\u3067\u4F11\u3093\u3060\u3002^pr:i n:dad/v:rest|past/prep:in det:the n:library",
    "1^\u30B1\u30F3\u306F\u3053\u3053\u3067\u671D\u3054\u306F\u3093\u3092\u4F5C\u308B\u3002^n:Ken/v:make|base/n:breakfast/adv:here",
    "1^\u30B1\u30F3\u306F\u3059\u3070\u3084\u304F\u8E0A\u3063\u305F\u3002^n:Ken/v:dance|past/adv:quickly",
    "1^\u72AC\u306F\u3082\u3046\u3059\u3050\u4F11\u3080\u3002^det:the n:dog/v:rest|base/adv:soon",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3053\u3053\u3067\u8CEA\u554F\u3092\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:ask|base/det:a n:question/adv:here",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u30AB\u30FC\u30C9\u3092\u306A\u304F\u3059\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:lose|base/det:a n:card",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6628\u65E5\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u306B\u4E57\u308C\u305F\u3002^pr:i n:mom/modal:could v:ride|base/det:a n:elevator/adv:yesterday",
    "1^\u30B1\u30F3\u306F\u96A0\u308C\u308B\u3002^n:Ken/v:hide|base",
    "1^\u30B1\u30F3\u306F\u304F\u3089\u3084\u307F\u3067\u6B69\u304F\u3002^n:Ken/v:walk|base/idm:in_the_dark",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u304B\u3093\u305F\u3093\u306B\u65C5\u884C\u3059\u308B\u3002^pr:we/v:travel|base/adv:easily",
    "3^\u30B1\u30F3\u306F\u3082\u3046\u3059\u3050\u516C\u5712\u3067\u30D7\u30EA\u30F3\u30BF\u30FC\u3092\u76F4\u3059\u3060\u308D\u3046\u3002^n:Ken/modal:will v:fix|base/det:a n:printer/prep:in det:the n:park/adv:soon",
    "2^\u304B\u308C\u306F\u4F53\u80B2\u9928\u3067\u306E\u3093\u3073\u308A\u3057\u305F\u3002^pr:he/v:relax|past/prep:in det:the n:gym",
    "1^\u308F\u305F\u3057\u306F\u4ECA\u50CD\u304F\u3002^pr:i/v:work|base/adv:now",
    "3^\u304B\u308C\u3089\u306F\u6BCE\u65E5\u75C5\u9662\u3067\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3057\u305F\u3002^pr:they/v:invite|past/det:a n:speaker/prep:at det:the n:hospital/idm:every_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u3042\u305D\u3053\u3067\u8FD1\u304F\u3067\u8D70\u3063\u305F\u3002^pr:i n:mom/v:run|past/adv:nearby/adv:there",
    "2^\u304A\u7236\u3055\u3093\u306F\u4F1A\u793E\u3067\u6025\u3050\u3002^pr:i n:dad/v:hurry|base/prep:at det:the n:office",
    "2^\u304B\u308C\u3089\u306F\u56F3\u66F8\u9928\u3067\u5BB6\u5177\u3092\u58F2\u308B\u3002^pr:they/v:sell|base/n:furniture/prep:in det:the n:library",
    "2^\u304B\u308C\u306F\u4ECA\u591C\u8CEA\u554F\u306B\u7B54\u3048\u308B\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:answer|ing/det:a n:question/adv:tonight",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u671D\u75C5\u9662\u3067\u53EB\u3093\u3060\u3002^pr:they/v:shout|past/prep:at det:the n:hospital/idm:this_morning",
    "2^\u304A\u7236\u3055\u3093\u306F\u6BCE\u671D\u5BB6\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u9001\u308B\u3002^pr:i n:dad/v:send|base/det:a n:message/idm:at_home/idm:every_morning",
    "3^\u308F\u305F\u3057\u306F\u671D\u306B\u7A7A\u6E2F\u3078\u3064\u3044\u306B\u6765\u305F\u3002^pr:i/v:come|past/adv:finally/prep:to det:the n:airport/prep:in det:the n:morning",
    "2^\u72AC\u306F\u6B21\u306F\u6CF3\u3050\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:swim|ing/idm:next_time",
    "3^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u7B54\u3048\u3092\u78BA\u8A8D\u3059\u308B\u3002^pr:i n:dad/v:check|base/det:a n:answer/prep:in det:the n:classroom",
    "3^\u72AC\u306F\u3082\u3046\u3059\u3050\u30D0\u30B9\u505C\u3067\u8A66\u5408\u3092\u4E0B\u624B\u306B\u898B\u308B\u3002^det:the n:dog/v:watch|base/det:a n:match/adv:badly/prep:at det:the n:bus_stop/adv:soon",
    "2^\u304B\u306E\u3058\u3087\u306F\u7A7A\u6E2F\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:she/v:jump|base/prep:at det:the n:airport",
    "3^\u304B\u308C\u3089\u306F\u6B21\u306F\u56F3\u66F8\u9928\u3067\u7BB1\u3092\u3066\u3044\u306D\u3044\u306B\u9589\u3081\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:close|ing/det:the n:box/adv:carefully/prep:in det:the n:library/idm:next_time",
    "3^\u3042\u306A\u305F\u306F\u7A7A\u6E2F\u3067\u82B1\u3092\u8CB7\u3063\u3066\u3044\u308B\u3002^pr:you/be:pres v:buy|ing/det:a n:flower/prep:at det:the n:airport",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u591C\u6559\u5BA4\u3067\u7B11\u3046\u3064\u3082\u308A\u3060\u3002^pr:i/modal:will v:laugh|base/prep:in det:the n:classroom/adv:tonight",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u660E\u65E5\u65B9\u6CD5\u3092\u898B\u3064\u3051\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/be:pres v:find|ing/det:a n:way/adv:tomorrow",
    "3^\u3042\u306A\u305F\u306F\u99C5\u3067\u8B1B\u6F14\u8005\u3092\u8FD1\u304F\u3067\u62DB\u5F85\u3057\u3066\u3044\u308B\u3002^pr:you/be:pres v:invite|ing/det:a n:speaker/adv:nearby/prep:at det:the n:station",
    "2^\u7537\u306E\u5B50\u306F\u30D0\u30B9\u505C\u3067\u4F11\u3080\u3002^det:the n:boy/v:rest|base/prep:at det:the n:bus_stop",
    "2^\u5973\u306E\u5B50\u306F\u591C\u306B\u30E1\u30FC\u30EB\u306B\u8FD4\u4FE1\u3059\u308B\u3002^det:the n:girl/v:answer|base/det:a n:email/prep:at n:night",
    "3^\u53CB\u3060\u3061\u306F\u99C5\u3067\u30DC\u30FC\u30C8\u306B\u4E57\u3063\u3066\u3044\u308B\u3002^pr:i n:friend|pl/be:pres v:ride|ing/det:a n:boat/prep:at det:the n:station",
    "3^\u3042\u306A\u305F\u306F\u75C5\u9662\u3067\u756A\u7D44\u3092\u304F\u3089\u3084\u307F\u3067\u898B\u3066\u3044\u308B\u3002^pr:you/be:pres v:watch|ing/det:a n:show/idm:in_the_dark/prep:at det:the n:hospital",
    "2^\u304B\u308C\u3089\u306F\u4ECA\u30EC\u30B9\u30C8\u30E9\u30F3\u3078\u6765\u308B\u3002^pr:they/v:come|base/prep:to det:the n:restaurant/adv:now",
    "3^\u7537\u306E\u5B50\u306F\u6B21\u306F\u7A7A\u6E2F\u3078\u6765\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:come|base/prep:to det:the n:airport/idm:next_time",
    "2^\u30DF\u30AB\u306F\u4ECA\u591C\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u53EB\u3076\u4E88\u5B9A\u3060\u3002^n:Mika/be:pres v:shout|ing/prep:at det:the n:restaurant/adv:tonight",
    "1^\u304A\u6BCD\u3055\u3093\u306F\u6628\u591C\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^pr:i n:mom/v:jump|past/idm:last_night",
    "2^\u304B\u306E\u3058\u3087\u306F\u6BCE\u65E5\u304B\u3054\u3092\u904B\u3076\u3002^pr:she/v:carry|base/det:a n:basket/idm:every_day",
    "3^\u3042\u306A\u305F\u306F\u4ECA\u65E5\u99C5\u3067\u96FB\u6C60\u3092\u5B8C\u307A\u304D\u306B\u78BA\u8A8D\u3059\u308B\u3002^pr:you/v:check|base/det:a n:battery/adv:perfectly/prep:at det:the n:station/adv:today",
    "2^\u3042\u306A\u305F\u306F\u30D0\u30B9\u505C\u3067\u52DD\u3066\u305F\u3002^pr:you/modal:could v:win|base/prep:at det:the n:bus_stop",
    "3^\u72AC\u306F\u660E\u65E5\u5B66\u6821\u3067\u7BB1\u3092\u904B\u3076\u4E88\u5B9A\u3060\u3002^det:the n:dog/be:pres v:carry|ing/det:the n:box/idm:at_school/adv:tomorrow",
    "2^\u308F\u305F\u3057\u306F\u4ECA\u591C\u6559\u5BA4\u3067\u8E0A\u308B\u4E88\u5B9A\u3060\u3002^pr:i/be:pres v:dance|ing/prep:in det:the n:classroom/adv:tonight",
    "3^\u5973\u306E\u5B50\u306F\u6628\u591C\u53F0\u6240\u3067\u304A\u91D1\u3092\u9001\u3063\u305F\u3002^det:the n:girl/v:send|past/n:money/prep:in det:the n:kitchen/idm:last_night",
    "1^\u304A\u6BCD\u3055\u3093\u306F7\u6642\u306B\u8E0A\u308B\u3002^pr:i n:mom/v:dance|base/idm:at_seven",
    "3^\u308F\u305F\u3057\u306F7\u6642\u306B\u30D0\u30B9\u505C\u3067\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD4\u4FE1\u3059\u308B\u3002^pr:i/v:answer|base/det:a n:message/prep:at det:the n:bus_stop/idm:at_seven",
    "1^\u53CB\u3060\u3061\u306F\u7740\u3044\u305F\u3002^pr:i n:friend|pl/v:arrive|past",
    "2^\u72AC\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6CF3\u3044\u3067\u3044\u308B\u3002^det:the n:dog/be:pres v:swim|ing/idm:this_afternoon",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u591C\u884C\u304F\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:go|ing/adv:tonight",
    "3^\u30B1\u30F3\u306F\u591C\u306B\u30AB\u30D5\u30A7\u3067\u9774\u3092\u306F\u304F\u3002^n:Ken/v:wear|base/n:shoe|pl/prep:at det:the n:cafe/prep:at n:night",
    "3^\u304B\u306E\u3058\u3087\u306F\u52D5\u7269\u5712\u3067\u7A32\u3092\u690D\u3048\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:plant|base/det:a n:rice_plant/prep:at det:the n:zoo",
    "2^\u304B\u308C\u306F\u6559\u5BA4\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u898B\u3064\u3051\u308B\u3002^pr:he/v:find|base/pr:i n:phone/prep:in det:the n:classroom",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6BCE\u671D\u6CE3\u304F\u3002^pr:we/v:cry|base/idm:every_morning",
    "1^\u304B\u306E\u3058\u3087\u306F\u5B66\u6821\u3067\u6B69\u304F\u3002^pr:she/v:walk|base/idm:at_school",
    "1^\u5973\u306E\u5B50\u306F7\u6642\u306B\u5BDD\u308B\u3002^det:the n:girl/v:sleep|base/idm:at_seven",
    "1^\u304B\u308C\u306F\u524D\u56DE\u306F\u3082\u3046\u4E00\u5EA6\u65C5\u884C\u3057\u305F\u3002^pr:he/v:travel|past/adv:again/idm:last_time",
    "1^\u304B\u306E\u3058\u3087\u306F\u7A81\u7136\u6025\u3050\u3002^pr:she/v:hurry|base/adv:suddenly",
    "2^\u72AC\u306F\u68EE\u3067\u6B69\u3044\u305F\u3002^det:the n:dog/v:walk|past/prep:in det:the n:forest",
    "2^\u304A\u7236\u3055\u3093\u306F\u4ECA\u516C\u5712\u3078\u884C\u304F\u3002^pr:i n:dad/v:go|base/prep:to det:the n:park/adv:now",
    "1^\u53CB\u3060\u3061\u306F\u4E00\u65E5\u3058\u3085\u3046\u6CF3\u3044\u3060\u3002^pr:i n:friend|pl/v:swim|past/idm:all_day",
    "2^\u5973\u306E\u5B50\u306F\u4F53\u80B2\u9928\u3067\u3075\u3060\u3093\u306E\u3093\u3073\u308A\u3059\u308B\u3002^det:the n:girl/adv:usually v:relax|base/prep:in det:the n:gym",
    "3^\u304B\u308C\u3089\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8ECA\u306B\u4EE5\u524D\u306F\u3064\u3044\u3066\u3044\u3063\u3066\u3044\u305F\u3002^pr:they/sm:used_to v:follow|base/det:the n:car/prep:at det:the n:supermarket",
    "2^\u304B\u306E\u3058\u3087\u306F\u660E\u65E5\u8B1B\u6F14\u8005\u3092\u62DB\u5F85\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:she/be:pres v:invite|ing/det:a n:speaker/adv:tomorrow",
    "3^\u3042\u306A\u305F\u306F\u30AB\u30D5\u30A7\u3067\u9B5A\u306B\u3072\u305D\u304B\u306B\u3048\u3055\u3092\u3042\u3052\u308B\u3060\u308D\u3046\u3002^pr:you/modal:will v:feed|base/n:fish/adv:secretly/prep:at det:the n:cafe",
    "3^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u99C5\u3067\u8ECA\u3092\u6301\u3063\u3066\u3044\u305F\u3002^pr:she/v:have|past/det:the n:car/prep:at det:the n:station/idm:last_time",
    "2^\u30DF\u30AB\u306F\u56F3\u66F8\u9928\u306B\u7740\u304F\u3068\u3053\u308D\u3060\u3002^n:Mika/be:pres v:arrive|ing/prep:in det:the n:library",
    "2^\u304B\u308C\u306F\u4ECA\u591C\u53F0\u6240\u3078\u6765\u308B\u4E88\u5B9A\u3060\u3002^pr:he/be:pres v:come|ing/prep:to det:the n:kitchen/adv:tonight",
    "1^\u5148\u751F\u306F\u6BCE\u65E5\u96A0\u308C\u308B\u3002^det:the n:teacher/v:hide|base/idm:every_day",
    "2^\u30B1\u30F3\u306F\u3055\u3063\u304D\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D\u3057\u305F\u3002^n:Ken/v:check|past/det:a n:email/idm:just_now",
    "2^\u304B\u306E\u3058\u3087\u306F\u68EE\u306B\u7740\u304F\u3002^pr:she/v:arrive|base/prep:in det:the n:forest",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u30CE\u30FC\u30C8\u30D1\u30BD\u30B3\u30F3\u3092\u9589\u3058\u305F\u3002^pr:we/v:close|past/det:a n:laptop",
    "2^\u30B1\u30F3\u306F\u671D\u306B\u3053\u3053\u3067\u307E\u3063\u305F\u308A\u3059\u308B\u3002^n:Ken/v:chill|base/adv:here/prep:in det:the n:morning",
    "3^\u306D\u3053\u306F\u4F1A\u793E\u3067\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:watch|base/det:a n:concert/prep:at det:the n:office",
    "2^\u3042\u306A\u305F\u306F\u516C\u5712\u3067\u8FD1\u304F\u3067\u6B69\u304F\u3060\u308D\u3046\u3002^pr:you/modal:will v:walk|base/idm:close_by/prep:in det:the n:park",
    "2^\u304B\u308C\u306F\u52D5\u7269\u5712\u3067\u6025\u3050\u3002^pr:he/v:hurry|base/prep:at det:the n:zoo",
    "2^\u306D\u3053\u306F\u756A\u7D44\u3092\u8FD1\u304F\u3067\u898B\u308B\u3002^det:the n:cat/v:watch|base/det:a n:show/idm:close_by",
    "1^\u72AC\u306F\u6628\u65E5\u30B8\u30E3\u30F3\u30D7\u3057\u305F\u3002^det:the n:dog/v:jump|past/adv:yesterday",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u308F\u305F\u3057\u306E\u90E8\u5C4B\u3067\u5BDD\u308B\u3002^pr:you/v:sleep|base/prep:in pr:i n:room/adv:now",
    "2^\u306D\u3053\u306F\u4F1A\u793E\u3067\u30B8\u30E3\u30F3\u30D7\u3057\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:jump|ing/prep:at det:the n:office",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u53F0\u6240\u3067\u6C34\u3092\u3084\u3055\u3057\u304F\u6301\u3063\u3066\u304F\u308B\u3002^pr:we/v:bring|base/n:water/adv:softly/prep:in det:the n:kitchen",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u6765\u9031\u4F11\u3080\u4E88\u5B9A\u3060\u3002^pr:we/be:pres v:rest|ing/idm:next_week",
    "3^\u7537\u306E\u5B50\u306F7\u6642\u306B\u4F53\u80B2\u9928\u3067\u624B\u3076\u304F\u308D\u3092\u306F\u3081\u305F\u3002^det:the n:boy/v:wear|past/det:a n:glove/prep:in det:the n:gym/idm:at_seven",
    "2^\u306D\u3053\u306F\u6559\u5BA4\u3067\u6025\u3050\u3002^det:the n:cat/v:hurry|base/prep:in det:the n:classroom",
    "2^\u304B\u308C\u3089\u306F\u7A7A\u6E2F\u3067\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3002^pr:they/v:jump|base/prep:at det:the n:airport",
    "2^\u30DF\u30AB\u306F\u5DDD\u306E\u305D\u3070\u3067\u304B\u3070\u3093\u3092\u8CB7\u3063\u305F\u3002^n:Mika/v:buy|past/det:a n:bag/prep:by det:the n:river",
    "2^\u304A\u7236\u3055\u3093\u306F\u660E\u65E5\u304B\u3054\u3092\u904B\u3076\u3060\u308D\u3046\u3002^pr:i n:dad/modal:will v:carry|base/det:a n:basket/adv:tomorrow",
    "3^\u7537\u306E\u5B50\u306F\u660E\u65E5\u516C\u5712\u3067\u52DD\u3064\u3060\u308D\u3046\u3002^det:the n:boy/be:pres v:win|ing/prep:in det:the n:park/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u6BCE\u671D\u6771\u4EAC\u3067\u6025\u3050\u3002^pr:i n:friend|pl/v:hurry|base/prep:in n:Tokyo/idm:every_morning",
    "2^\u30DF\u30AB\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u8D08\u308A\u7269\u3092\u9001\u308B\u3002^n:Mika/v:send|base/det:a n:gift/prep:at det:the n:restaurant",
    "3^\u306D\u3053\u306F\u7A7A\u6E2F\u3067\u68EE\u6797\u3092\u5B88\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:protect|base/det:a n:forest/prep:at det:the n:airport",
    "2^\u304B\u306E\u3058\u3087\u306F\u524D\u56DE\u306F\u3073\u3093\u3092\u5B89\u5168\u306B\u6301\u3063\u3066\u6765\u305F\u3002^pr:she/v:bring|past/det:a n:bottle/adv:safely/idm:last_time",
    "2^\u306D\u3053\u306F\u6CF3\u3050\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:swim|base",
    "2^\u30DF\u30AB\u306F\u6628\u65E5\u52D5\u7269\u5712\u3067\u307E\u3063\u305F\u308A\u3057\u305F\u3002^n:Mika/v:chill|past/prep:at det:the n:zoo/adv:yesterday",
    "2^\u306D\u3053\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u96A0\u308C\u308B\u3002^det:the n:cat/v:hide|base/prep:at det:the n:supermarket",
    "1^\u304A\u7236\u3055\u3093\u306F\u4ECA\u6B69\u304F\u3002^pr:i n:dad/v:walk|base/adv:now",
    "3^\u304B\u308C\u306F\u4ECA\u671D\u56F3\u66F8\u9928\u3067\u8CEA\u554F\u3092\u3057\u305F\u3002^pr:he/v:ask|past/det:a n:question/prep:in det:the n:library/idm:this_morning",
    "2^\u304A\u7236\u3055\u3093\u306F\u30EC\u30B9\u30C8\u30E9\u30F3\u3067\u3082\u3046\u4E00\u5EA6\u307B\u307B\u3048\u3093\u3060\u3002^pr:i n:dad/v:smile|past/adv:again/prep:at det:the n:restaurant",
    "2^\u7537\u306E\u5B50\u306F\u4F1A\u793E\u3078\u884C\u304F\u3002^det:the n:boy/v:go|base/prep:to det:the n:office",
    "2^\u7537\u306E\u5B50\u306F\u3055\u3063\u304D\u4F53\u80B2\u9928\u3067\u4F11\u3093\u3060\u3002^det:the n:boy/v:rest|past/prep:in det:the n:gym/idm:just_now",
    "3^\u308F\u305F\u3057\u306F\u4ECA\u65E5\u306E\u5348\u5F8C\u6559\u5BA4\u3067\u30BF\u30AA\u30EB\u3092\u6301\u3063\u3066\u6765\u3066\u3044\u308B\u3002^pr:i/be:pres v:bring|ing/det:a n:towel/prep:in det:the n:classroom/idm:this_afternoon",
    "2^\u308F\u305F\u3057\u306F\u8349\u3092\u3066\u3044\u306D\u3044\u306B\u690D\u3048\u3066\u3044\u308B\u3002^pr:i/be:pres v:plant|ing/n:grass/adv:politely",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u305B\u3063\u3051\u3093\u3092\u4F7F\u3046\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:use|base/n:soap",
    "3^\u304B\u308C\u306F\u6BCE\u671D\u516C\u5712\u3067\u8D08\u308A\u7269\u3092\u3042\u3052\u308B\u3002^pr:he/v:give|base/det:a n:gift/prep:in det:the n:park/idm:every_morning",
    "2^\u304B\u306E\u3058\u3087\u306F\u5B66\u6821\u3067\u68EE\u6797\u3092\u5B88\u308B\u3002^pr:she/v:protect|base/det:a n:forest/idm:at_school",
    "2^\u304B\u308C\u3089\u306F\u6765\u9031\u65C5\u884C\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:they/be:pres v:travel|ing/idm:next_week",
    "2^\u30B1\u30F3\u306F\u30B9\u30FC\u30D1\u30FC\u3067\u8CB7\u3044\u7269\u3059\u308B\u3002^n:Ken/v:shop|base/prep:at det:the n:supermarket",
    "2^\u308F\u305F\u3057\u306F\u5DDD\u306E\u305D\u3070\u3067\u6025\u3050\u3002^pr:i/v:hurry|base/prep:by det:the n:river",
    "2^\u5148\u751F\u306F\u3053\u3053\u3067\u5B89\u5168\u306B\u7B11\u3046\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:laugh|base/adv:safely/adv:here",
    "3^\u304B\u308C\u3089\u306F\u3082\u3046\u3059\u3050\u4F53\u80B2\u9928\u3067\u304A\u3082\u3061\u3083\u3092\u306A\u304F\u3059\u3002^pr:they/v:lose|base/det:a n:toy/prep:in det:the n:gym/adv:soon",
    "1^\u304B\u306E\u3058\u3087\u306F\u5BB6\u3067\u52DD\u3063\u305F\u3002^pr:she/v:win|past/idm:at_home",
    "2^\u304B\u308C\u3089\u306F\u30D0\u30B9\u505C\u3067\u8CEA\u554F\u3092\u3059\u308B\u3002^pr:they/v:ask|base/det:a n:question/prep:at det:the n:bus_stop",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F2\u6642\u9593\u65C5\u884C\u3057\u305F\u3002^pr:we/v:travel|past/idm:for_two_hours",
    "2^\u3042\u306A\u305F\u306F\u4ECA\u671D\u56F3\u66F8\u9928\u3067\u7B11\u3063\u305F\u3002^pr:you/v:laugh|past/prep:in det:the n:library/idm:this_morning",
    "1^\u30DF\u30AB\u306F\u9774\u3092\u306F\u3044\u305F\u3002^n:Mika/v:wear|past/n:shoe|pl",
    "2^\u30DF\u30AB\u306F\u4ECA\u5EAD\u3067\u304F\u3089\u3084\u307F\u3067\u6B69\u304F\u3002^n:Mika/v:walk|base/idm:in_the_dark/prep:in det:the n:garden/adv:now",
    "2^\u304B\u308C\u3089\u306F\u6BCE\u671D\u30D1\u30EC\u30FC\u30C9\u3092\u898B\u308B\u3002^pr:they/v:watch|base/det:a n:parade/idm:every_morning",
    "2^\u306D\u3053\u306F\u68EE\u3067\u6CE3\u3044\u3066\u3044\u308B\u3002^det:the n:cat/be:pres v:cry|ing/prep:in det:the n:forest",
    "3^\u308F\u305F\u3057\u305F\u3061\u306F\u3082\u3046\u3059\u3050\u75C5\u9662\u3067\u5BB6\u5177\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u58F2\u308B\u3002^pr:we/v:sell|base/n:furniture/idm:in_time/prep:at det:the n:hospital/adv:soon",
    "1^\u3042\u306A\u305F\u306F2\u65E5\u524D\u307B\u307B\u3048\u3093\u3060\u3002^pr:you/v:smile|past/idm:two_days_ago",
    "3^\u5973\u306E\u5B50\u306F\u4F1A\u793E\u3067\u8CEA\u554F\u3092\u3059\u308B\u3002^det:the n:girl/v:ask|base/det:a n:question/prep:at det:the n:office",
    "2^\u7537\u306E\u5B50\u306F\u5BBF\u984C\u3092\u8FD1\u304F\u3067\u78BA\u8A8D\u3057\u305F\u3002^det:the n:boy/v:check|past/n:homework/adv:nearby",
    "3^\u7537\u306E\u5B50\u306F2\u6642\u9593\u4F53\u80B2\u9928\u3067\u30B8\u30E3\u30B1\u30C3\u30C8\u3092\u501F\u308A\u305F\u3002^det:the n:boy/v:borrow|past/det:a n:jacket/prep:in det:the n:gym/idm:for_two_hours",
    "1^\u30B1\u30F3\u306F\u6628\u65E5\u307E\u3063\u305F\u308A\u3057\u305F\u3002^n:Ken/v:chill|past/adv:yesterday",
    "2^\u72AC\u306F7\u6642\u306B\u307E\u3061\u304C\u3044\u3092\u304B\u3093\u305F\u3093\u306B\u898B\u3064\u3051\u305F\u3002^det:the n:dog/v:find|past/det:a n:mistake/adv:easily/idm:at_seven",
    "3^\u5973\u306E\u5B50\u306F\u53F0\u6240\u3067\u30DA\u30F3\u3092\u306A\u304F\u3057\u305F\u3002^det:the n:girl/v:lose|past/det:a n:pen/prep:in det:the n:kitchen",
    "2^\u53CB\u3060\u3061\u306F7\u6642\u306B\u307E\u3063\u305F\u308A\u3059\u308B\u3060\u308D\u3046\u3002^pr:i n:friend|pl/modal:will v:chill|base/idm:at_seven",
    "2^\u7537\u306E\u5B50\u306F\u6B21\u306F\u671D\u3054\u306F\u3093\u3092\u4F5C\u308B\u3060\u308D\u3046\u3002^det:the n:boy/modal:will v:make|base/n:breakfast/idm:next_time",
    "3^\u308F\u305F\u3057\u306F\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u304A\u3082\u3061\u3083\u3092\u304B\u3093\u305F\u3093\u306B\u8CB7\u3046\u3002^pr:i/v:buy|base/det:a n:toy/adv:easily/prep:in pr:i n:room",
    "2^\u304A\u7236\u3055\u3093\u306F\u6628\u591C\u5BB6\u5177\u3092\u8CB7\u3063\u305F\u3002^pr:i n:dad/v:buy|past/n:furniture/idm:last_night",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u56F3\u66F8\u9928\u3078\u65C5\u884C\u3059\u308B\u3002^pr:i n:mom/v:travel|base/prep:to det:the n:library",
    "3^\u72AC\u306F\u6559\u5BA4\u3067\u308F\u305F\u3057\u306E\u30B9\u30DE\u30DB\u3092\u898B\u3064\u3051\u308B\u3002^det:the n:dog/v:find|base/pr:i n:phone/prep:in det:the n:classroom",
    "2^\u5973\u306E\u5B50\u306F\u30E1\u30E2\u3092\u304F\u3089\u3084\u307F\u3067\u9001\u308B\u3060\u308D\u3046\u3002^det:the n:girl/modal:will v:send|base/det:a n:note/idm:in_the_dark",
    "1^\u53CB\u3060\u3061\u306F\u3082\u3046\u3059\u3050\u307B\u307B\u3048\u3080\u3002^pr:i n:friend|pl/v:smile|base/adv:soon",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u9053\u3092\u3084\u3055\u3057\u304F\u4F5C\u308B\u3060\u308D\u3046\u3002^pr:i n:mom/modal:will v:build|base/det:the n:road/adv:softly",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u6771\u4EAC\u3067\u8D70\u3063\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:run|ing/prep:in n:Tokyo",
    "2^\u7537\u306E\u5B50\u306F\u6628\u65E5\u3044\u3064\u3082\u9053\u3092\u4F5C\u3063\u305F\u3002^det:the n:boy/adv:always v:build|past/det:the n:road/adv:yesterday",
    "2^\u30DF\u30AB\u306F\u56F3\u66F8\u9928\u3067\u7A81\u7136\u7B11\u3046\u3002^n:Mika/v:laugh|base/adv:suddenly/prep:in det:the n:library",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u3082\u3046\u3059\u3050\u8CEA\u554F\u3092\u3059\u308B\u3002^pr:we/v:ask|base/det:a n:question/adv:soon",
    "2^\u308F\u305F\u3057\u306F\u6BCE\u65E5\u4F1A\u793E\u3078\u884C\u3063\u305F\u3002^pr:i/v:go|past/prep:to det:the n:office/idm:every_day",
    "1^\u30DF\u30AB\u306F\u30B3\u30FC\u30D2\u30FC\u3092\u3059\u3070\u3084\u304F\u8CB7\u3063\u305F\u3002^n:Mika/v:buy|past/n:coffee/adv:quickly",
    "2^\u304A\u7236\u3055\u3093\u306F\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u8FD1\u304F\u3067\u8FD4\u4FE1\u3059\u308B\u3002^pr:i n:dad/v:answer|base/det:a n:message/idm:close_by",
    "2^\u30B1\u30F3\u306F\u53F0\u6240\u3067\u3072\u305D\u304B\u306B\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3060\u308D\u3046\u3002^n:Ken/modal:will v:jump|base/adv:secretly/prep:in det:the n:kitchen",
    "2^\u3042\u306A\u305F\u306F\u660E\u65E5\u65C5\u884C\u3059\u308B\u4E88\u5B9A\u3060\u3002^pr:you/be:pres v:travel|ing/adv:tomorrow",
    "1^\u5148\u751F\u306F\u8D70\u308B\u3002^det:the n:teacher/v:run|base",
    "3^\u72AC\u306F\u4ECA\u591C\u5B66\u6821\u3067\u5207\u7B26\u3092\u9593\u306B\u5408\u3046\u3088\u3046\u306B\u306A\u304F\u3059\u3060\u308D\u3046\u3002^det:the n:dog/be:pres v:lose|ing/det:a n:ticket/idm:in_time/idm:at_school/adv:tonight",
    "2^\u5148\u751F\u306F\u6559\u5BA4\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:teacher/modal:will v:relax|base/prep:in det:the n:classroom",
    "1^\u72AC\u306F\u3086\u3063\u304F\u308A\u6CF3\u3050\u3002^det:the n:dog/v:swim|base/adv:slowly",
    "3^\u304A\u7236\u3055\u3093\u306F\u6559\u5BA4\u3067\u8ECA\u3092\u4F7F\u3063\u305F\u3002^pr:i n:dad/v:use|past/det:the n:car/prep:in det:the n:classroom",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u5148\u9031\u50CD\u3044\u305F\u3002^pr:we/v:work|past/idm:last_week",
    "2^\u304A\u7236\u3055\u3093\u306F\u516C\u6F14\u3092\u3072\u305D\u304B\u306B\u898B\u308B\u3002^pr:i n:dad/v:watch|base/det:a n:performance/adv:secretly",
    "2^\u5973\u306E\u5B50\u306F\u6B21\u306F\u6728\u3092\u690D\u3048\u308B\u3002^det:the n:girl/v:plant|base/det:a n:tree/idm:next_time",
    "2^\u308F\u305F\u3057\u306F\u6628\u65E5\u53F0\u6240\u3067\u6CF3\u3044\u3060\u3002^pr:i/v:swim|past/prep:in det:the n:kitchen/adv:yesterday",
    "2^\u304B\u308C\u306F\u6628\u591C\u7A7A\u6E2F\u3067\u52DD\u3063\u305F\u3002^pr:he/v:win|past/prep:at det:the n:airport/idm:last_night",
    "3^\u304A\u7236\u3055\u3093\u306F\u6BCE\u65E5\u99C5\u3067\u8CEA\u554F\u3092\u3059\u308B\u3002^pr:i n:dad/v:ask|base/det:a n:question/prep:at det:the n:station/idm:every_day",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u4ECA\u65E5\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^pr:i n:mom/v:follow|past/det:the n:bus/adv:today",
    "2^\u53CB\u3060\u3061\u306F\u75C5\u9662\u3067\u5BB6\u5177\u3092\u58F2\u308B\u3002^pr:i n:friend|pl/v:sell|base/n:furniture/prep:at det:the n:hospital",
    "3^\u5148\u751F\u306F7\u6642\u306B\u52D5\u7269\u5712\u3067\u3075\u3060\u3093\u8CEA\u554F\u3092\u8FD1\u304F\u3067\u3059\u308B\u3002^det:the n:teacher/adv:usually v:ask|base/det:a n:question/idm:close_by/prep:at det:the n:zoo/idm:at_seven",
    "2^\u5148\u751F\u306F\u6BCE\u671D\u6771\u4EAC\u3067\u8E0A\u308B\u3002^det:the n:teacher/v:dance|base/prep:in n:Tokyo/idm:every_morning",
    "2^\u30B1\u30F3\u306F\u524D\u56DE\u306F\u5BB6\u3067\u304B\u3070\u3093\u3092\u3066\u3044\u306D\u3044\u306B\u904B\u3093\u3060\u3002^n:Ken/v:carry|past/det:a n:bag/adv:carefully/idm:at_home/idm:last_time",
    "3^\u7537\u306E\u5B50\u306F\u660E\u65E5\u4F1A\u793E\u3067\u6B69\u304F\u4E88\u5B9A\u3060\u3002^det:the n:boy/be:pres v:walk|ing/prep:at det:the n:office/adv:tomorrow",
    "3^\u306D\u3053\u306F\u6D77\u8FBA\u3067\u304B\u3093\u305F\u3093\u306B\u6CE3\u304F\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:cry|base/adv:easily/prep:on det:the n:beach",
    "2^\u304A\u6BCD\u3055\u3093\u306F2\u6642\u9593\u3042\u305D\u3053\u3067\u30B3\u30F3\u30B5\u30FC\u30C8\u3092\u898B\u305F\u3002^pr:i n:mom/v:watch|past/det:a n:concert/adv:there/idm:for_two_hours",
    "2^\u304A\u6BCD\u3055\u3093\u306F\u5B66\u6821\u3067\u306E\u3093\u3073\u308A\u3057\u3066\u3044\u308B\u3002^pr:i n:mom/be:pres v:relax|ing/idm:at_school",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u5EAD\u3067\u8CB7\u3044\u7269\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:shop|base/prep:in det:the n:garden",
    "2^\u304B\u308C\u3089\u306F\u82B1\u3092\u3064\u3044\u306B\u8CB7\u3046\u3002^pr:they/v:buy|base/det:a n:flower/adv:finally",
    "1^\u304A\u7236\u3055\u3093\u306F7\u6642\u306B\u5BDD\u308B\u3002^pr:i n:dad/v:sleep|base/idm:at_seven",
    "3^\u304B\u306E\u3058\u3087\u306F\u52D5\u7269\u5712\u3067\u81EA\u8EE2\u8ECA\u3092\u6301\u3063\u3066\u3044\u308B\u3060\u308D\u3046\u3002^pr:she/modal:will v:have|base/det:a n:bicycle/prep:at det:the n:zoo",
    "2^\u304B\u306E\u3058\u3087\u306F\u6BCE\u671D\u9053\u5177\u3092\u904B\u3093\u3060\u3002^pr:she/v:carry|past/det:a n:tool/idm:every_morning",
    "2^\u304A\u6BCD\u3055\u3093\u306F2\u65E5\u524D\u8CB7\u3044\u7269\u3067\u304D\u305F\u3002^pr:i n:mom/modal:could v:shop|base/idm:two_days_ago",
    "2^\u3042\u306A\u305F\u306F\u4F53\u80B2\u9928\u3067\u52DD\u3063\u305F\u3002^pr:you/v:win|past/prep:in det:the n:gym",
    "2^\u5973\u306E\u5B50\u306F\u516C\u5712\u3067\u8D70\u3063\u305F\u3002^det:the n:girl/v:run|past/prep:in det:the n:park",
    "2^\u306D\u3053\u306F\u4F53\u80B2\u9928\u3067\u306E\u3093\u3073\u308A\u3059\u308B\u3060\u308D\u3046\u3002^det:the n:cat/modal:will v:relax|base/prep:in det:the n:gym",
    "1^\u308F\u305F\u3057\u305F\u3061\u306F\u6CE3\u304F\u3002^pr:we/v:cry|base",
    "2^\u308F\u305F\u3057\u306F\u68EE\u3067\u30D0\u30B9\u306B\u3064\u3044\u3066\u3044\u3063\u305F\u3002^pr:i/v:follow|past/det:the n:bus/prep:in det:the n:forest",
    "2^\u304B\u306E\u3058\u3087\u306F2\u6642\u9593\u7D75\u3092\u898B\u305F\u3002^pr:she/v:see|past/det:a n:picture/idm:for_two_hours",
    "3^\u304B\u308C\u3089\u306F\u671D\u306B\u5929\u6C17\u3092\u89AA\u5207\u306B\u78BA\u8A8D\u3059\u308B\u3060\u308D\u3046\u3002^pr:they/modal:will v:check|base/det:the n:weather/adv:kindly/prep:in det:the n:morning",
    "2^\u308F\u305F\u3057\u305F\u3061\u306F\u660E\u65E5\u30B8\u30E3\u30F3\u30D7\u3059\u308B\u3064\u3082\u308A\u3060\u3002^pr:we/modal:will v:jump|base/adv:tomorrow",
    "2^\u53CB\u3060\u3061\u306F\u5148\u9031\u60C5\u5831\u3092\u5F97\u610F\u3052\u306B\u63D0\u4F9B\u3057\u305F\u3002^pr:i n:friend|pl/v:give|past/n:information/adv:proudly/idm:last_week",
    "2^\u7537\u306E\u5B50\u306F\u6D77\u8FBA\u3067\u6CE3\u3044\u305F\u3002^det:the n:boy/v:cry|past/prep:on det:the n:beach",
    "3^\u306D\u3053\u306F\u6559\u5BA4\u3067\u304B\u3070\u3093\u3092\u904B\u3076\u3002^det:the n:cat/v:carry|base/det:a n:bag/prep:in det:the n:classroom"
  ];

  // games/punichunk/src/seeds.js
  var Seeds = (function() {
    "use strict";
    function create(dict, o) {
      var rnd = o.rnd || Math.random, cfg = o.cfg, lv = o.level || 0, maxLv = o.maxLevel || 2;
      var pick = function(a) {
        return a[Math.floor(rnd() * a.length)];
      };
      var idx = {};
      ["noun", "verb", "adj", "adv", "idiom"].forEach(function(p) {
        idx[p] = {};
        dict.all(p).forEach(function(e) {
          idx[p][e.w] = e;
        });
      });
      var nouns = dict.all("noun").filter(function(e) {
        return (e.lv || 1) <= maxLv;
      });
      var verbs = dict.all("verb").filter(function(e) {
        return (e.lv || 1) <= maxLv && !e.tail && e.fr !== "cl";
      });
      var adjs = dict.all("adj").filter(function(e) {
        return (e.lv || 1) <= maxLv;
      });
      var advs = dict.all("adv"), idioms = dict.all("idiom");
      function resolve(sp) {
        var k = sp.split(":")[0], rest = sp.slice(sp.indexOf(":") + 1), parts = rest.split("|"), w = parts[0], x = parts[1];
        switch (k) {
          case "n":
            return idx.noun[w] && { k: "n", e: idx.noun[w], pl: x === "pl" };
          case "v":
            return idx.verb[w] && { k: "v", e: idx.verb[w], f: x || "base" };
          case "adj":
            return idx.adj[w] && { k: "adj", e: idx.adj[w] };
          case "adv":
            return idx.adv[w] && { k: "adv", e: idx.adv[w] };
          case "idm":
            return idx.idiom[w] && { k: "idm", e: idx.idiom[w] };
          case "q":
            return { k: "q", v: w, e: idx.idiom[w] };
          case "sm":
            return { k: "sm", v: w, t: x || "pres" };
          case "be":
            return { k: "be", v: w };
          case "not":
            return { k: "not" };
          default:
            return { k, v: w };
        }
      }
      var M = !cfg.auto.art;
      function npFor(e, role) {
        var ws = [], c = e.c;
        if (lv >= 1 && rnd() < 0.3 && (c === "c" || c === "u" || c === "p")) {
          var a = pick(adjs);
          if (a) ws.push({ k: "adj", e: a });
        }
        var pl = false;
        if (c === "c" && rnd() < 0.2 && role !== "subj1") {
          pl = true;
        }
        var lead = null;
        if (c === "c" || c === "t") {
          if (pl) lead = rnd() < 0.5 ? { k: "q", v: pick(["two", "three", "many", "some"]) } : M ? { k: "det", v: "the" } : null;
          else if (e.ad === "my") lead = { k: "pr", v: pick(["i", "you", "he", "she", "we"]) };
          else if (M || rnd() < 0.3) lead = { k: "det", v: e.ad === "the" || c === "t" ? "the" : rnd() < 0.5 ? "a" : "the" };
        } else if (c === "u" && rnd() < 0.25) {
          var q = (e.tg || []).indexOf("drink") >= 0 ? pick(["a cup of", "a glass of"]) : "a lot of";
          lead = { k: "q", v: q, e: idx.idiom[q] };
        } else if (c === "p" && M && rnd() < 0.5) lead = { k: "det", v: "the" };
        var n = { k: "n", e, pl };
        return (lead ? [lead] : []).concat(ws, [n]);
      }
      function subject() {
        if (rnd() < 0.42) return [{ k: "pr", v: pick(["i", "you", "he", "she", "we", "they", "he", "she"]) }];
        var e = pick(nouns.filter(function(n) {
          return n.cat === "person" || n.cat === "animal";
        }));
        return npFor(e, "subj");
      }
      function objectFor(v) {
        if (rnd() < 0.15) return [{ k: "pr", v: pick(["i", "you", "he", "she", "it", "they"]) }];
        var ot = (v.ot || []).filter(function(t) {
          return t !== "any";
        }), cand = [];
        if (ot.length) cand = nouns.filter(function(n) {
          return ot.indexOf(n.cat) >= 0 || (n.tg || []).some(function(t) {
            return ot.indexOf(t) >= 0;
          });
        });
        if (!cand.length) cand = nouns.filter(function(n) {
          return n.cat !== "time" && n.cat !== "place";
        });
        return npFor(pick(cand), "obj");
      }
      function tsKey(tense) {
        return tense === "fut" ? "fut" : tense === "past" ? "past" : "pres";
      }
      function timeFor(tense) {
        var key = tsKey(tense), r = rnd();
        var ok = function(e) {
          return (e.ts || []).indexOf(key) >= 0;
        };
        if (r < 0.45) {
          var a = advs.filter(function(e) {
            return e.k === "time" && ok(e);
          });
          if (a.length) return [[{ k: "adv", e: pick(a) }]];
        }
        if (r < 0.75) {
          var i = idioms.filter(function(e) {
            return e.k === "time" && ok(e) && (e.lv || 1) <= Math.max(2, maxLv);
          });
          if (i.length) return [[{ k: "idm", e: pick(i) }]];
        }
        var tn = nouns.filter(function(e) {
          return e.cat === "time" && ok(e) && e.prep;
        });
        if (!tn.length) return null;
        var n = pick(tn), ws = [{ k: "prep", v: n.prep }];
        if (n.c === "t") ws.push({ k: "det", v: "the" });
        ws.push({ k: "n", e: n });
        return [ws];
      }
      function placeFor() {
        var r = rnd();
        if (r < 0.2) {
          var a = advs.filter(function(e) {
            return e.k === "place";
          });
          return [[{ k: "adv", e: pick(a) }]];
        }
        if (r < 0.32) {
          var i = idioms.filter(function(e) {
            return e.k === "place";
          });
          if (i.length) return [[{ k: "idm", e: pick(i) }]];
        }
        var n = pick(nouns.filter(function(e) {
          return e.cat === "place" && e.prep;
        })), ws = [{ k: "prep", v: n.prep }];
        if (n.c === "c" || n.c === "t" || n.c === "p" && n.ad === "the") ws.push(n.ad === "my" ? { k: "pr", v: pick(["i", "he", "she"]) } : { k: "det", v: "the" });
        ws.push({ k: "n", e: n });
        return [ws];
      }
      function verbPhrase(v, tense, hasTime) {
        var ws = [], r = rnd(), tp = null;
        if (r < (lv ? 0.14 : 0.1)) ws.push({ k: "modal", v: tense === "past" ? pick(["could", "would"]) : tense === "fut" ? "will" : pick(["can", "must", "should", "may"]) });
        else if (r < (lv ? 0.34 : 0.26)) {
          var sm = tense === "past" ? pick(["want to", "have to", "used to", "need to"]) : tense === "fut" ? "be going to" : pick(["want to", "have to", "need to", "would like to"]);
          ws.push({ k: "sm", v: sm, t: tense === "past" && sm !== "used to" ? "past" : "pres" });
        } else if (lv >= 1 && !hasTime && tense !== "pres" && rnd() < 0.7) tp = tense === "past" ? "past" : "fut";
        else if (lv >= 1 && tense === "pres" && rnd() < 0.12) tp = "prog";
        if (lv >= 1 && rnd() < 0.1) ws.splice(ws.length ? 1 : 0, 0, { k: "not" });
        if (lv >= 1 && !ws.some(function(w) {
          return w.k === "not";
        }) && tense === "pres" && !tp && rnd() < 0.12) ws.push({ k: "adv", e: idx.adv[pick(["always", "usually", "often", "sometimes"])] });
        var f = "base";
        if (!cfg.auto.verb && !tp && !ws.some(function(w) {
          return w.k === "modal" || w.k === "sm";
        })) f = tense === "past" ? "past" : "base";
        ws.push({ k: "v", e: v, f });
        if (tp) ws.push({ k: "tp", v: tp });
        if (lv >= 1 && rnd() < 0.15) {
          var m = advs.filter(function(e) {
            return e.k === "manner";
          });
          ws.push({ k: "adv", e: pick(m) });
        }
        return ws;
      }
      function clause(tense, opt) {
        opt = opt || {};
        var chunks = [subject()], v = pick(opt.intr ? verbs.filter(function(x) {
          return x.fr !== "tr";
        }) : verbs);
        var time = null;
        if (tense !== "pres" && rnd() < 0.55 || rnd() < 0.25) time = timeFor(tense);
        chunks.push(verbPhrase(v, tense, !!time));
        if (v.link && rnd() < 0.7) chunks.push([{ k: "adj", e: pick(adjs) }]);
        else if (v.cv && rnd() < 0.55) {
          var v2 = pick(verbs.filter(function(x) {
            return !x.cv && !x.link;
          }));
          chunks.push(v.cv === "ing" ? [{ k: "v", e: v2 }, { k: "ti", v: "ing" }] : [{ k: "ti", v: "to" }, { k: "v", e: v2 }]);
          if (v2.fr === "tr") chunks.push(objectFor(v2));
        } else if (v.fr === "tr" || v.fr === "both" && rnd() < 0.55) {
          chunks.push(objectFor(v));
          if (v.dt && lv >= 3 && rnd() < 0.3) chunks.splice(chunks.length - 1, 0, [{ k: "pr", v: pick(["i", "you", "him", "her"].map(function(p) {
            return p === "him" ? "he" : p === "her" ? "she" : p;
          })) }]);
        }
        if (!opt.short && rnd() < (lv ? 0.5 : 0.35)) chunks = chunks.concat(placeFor());
        if (time) {
          if (lv >= 2 && rnd() < 0.2) chunks = time.concat(chunks);
          else chunks = chunks.concat(time);
        }
        return chunks;
      }
      function template() {
        var r = rnd(), tense = lv === 0 ? r < 0.65 ? "pres" : "past" : r < 0.5 ? "pres" : r < 0.82 ? "past" : "fut";
        var chunks = [];
        if (lv >= 2 && rnd() < 0.22) {
          var f = idioms.filter(function(e) {
            return e.k === "front" && (e.lv || 1) <= maxLv;
          });
          if (f.length) chunks.push([{ k: "idm", e: pick(f) }]);
        } else if (lv >= 2 && rnd() < 0.15) {
          chunks.push([{ k: "conj", v: pick(["when", "if", "because", "before", "after"]) }]);
          chunks = chunks.concat(clause(tense === "fut" ? "pres" : tense, { short: 1, intr: 1 }));
        }
        chunks = chunks.concat(clause(tense));
        if (lv >= 2 && rnd() < 0.1 && !chunks.some(function(c) {
          return c[0].k === "conj";
        })) {
          chunks.push([{ k: "conj", v: pick(["and", "but", "so"]) }]);
          chunks = chunks.concat(clause(tense, { short: 1, intr: 1 }));
        }
        return chunks;
      }
      var DATA = null;
      function data() {
        if (DATA) return DATA;
        DATA = (typeof SEED_DATA === "undefined" ? [] : SEED_DATA).map(function(s) {
          var a = s.split("^");
          return { lv: +a[0], ja: a[1], c: a[2].split("/").map(function(u) {
            return u.split(" ").map(function(w) {
              return w.replace(/_/g, " ");
            });
          }) };
        }).filter(function(x) {
          return x.lv <= lv + 1;
        });
        return DATA;
      }
      var lastJa = "";
      function fromData() {
        var D = data();
        if (!D.length) return null;
        var s = pick(D);
        lastJa = s.ja;
        var ch = s.c.map(function(c) {
          return c.map(resolve);
        });
        return ch.some(function(c) {
          return c.some(function(w) {
            return !w;
          });
        }) ? null : ch;
      }
      function validate(chunks) {
        var T = [];
        for (var i = 0; i < chunks.length; i++) {
          var st = G.chainState(chunks[i], cfg);
          if (!st.complete || st.err) return null;
          T.push(st.chunk);
        }
        var r = G.parse(T, cfg);
        return r.ok && r.kind === "S" ? r.text : null;
      }
      function next() {
        for (var t = 0; t < 40; t++) {
          lastJa = "";
          var ch = fromData();
          ch = ch || (data().length ? null : template());
          if (!ch) continue;
          var text = validate(ch);
          if (text && text.split(" ").length <= 12) return { chunks: ch, text, ja: lastJa, words: [].concat.apply([], ch) };
        }
        return null;
      }
      return { next, resolve };
    }
    function norm(s) {
      return String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
    }
    return { create, norm };
  })();

  // games/punichunk/src/supply.js
  var Supply = (function() {
    "use strict";
    var RATIO = { noun: 5, verb: 3, adj: 3, adv: 2, det: 3, prep: 3, pron: 1, aux: 1, conj: 1, part: 2 };
    var MIN = { det: 2, prep: 2 };
    function catOf(w) {
      switch (w.k) {
        case "n":
          return "noun";
        case "v":
          return "verb";
        case "adj":
          return "adj";
        case "adv":
          return "adv";
        case "det":
        case "q":
          return "det";
        case "prep":
          return "prep";
        case "pr":
          return "pron";
        case "be":
        case "modal":
        case "not":
        case "sm":
          return "aux";
        case "conj":
          return "conj";
        case "ti":
        case "er":
        case "tp":
          return "part";
        case "deg":
          return "adv";
        case "idm":
          return "idiom";
      }
      return "other";
    }
    function create(dict, o) {
      o = o || {};
      var rnd = o.rnd || Math.random, ratio = o.ratio || RATIO, maxLv = o.maxLevel || 2;
      function onBoard(items) {
        var s = /* @__PURE__ */ new Set();
        items.forEach(function(it) {
          (it.words || [it.word]).forEach(function(w) {
            if (w && w.e) s.add(w.e.w);
          });
        });
        return s;
      }
      function pickWord(cat, items) {
        var ex = onBoard(items), r = rnd(), e;
        var get = function(pos, tag, lvl) {
          return dict.getWords({ pos, tag, maxLevel: lvl || maxLv, count: 1, rnd, exclude: ex })[0];
        };
        switch (cat) {
          case "noun":
            if (r < 0.22) e = get("noun", { cat: "place" });
            else if (r < 0.32) e = get("noun", { cat: "time" });
            else if (r < 0.55) e = get("noun", { cat: "person" }) || get("noun", { cat: "animal" });
            e = e || get("noun", { notCat: ["time", "place"] });
            return e && { k: "n", e };
          case "verb":
            if (r < 0.18 && maxLv >= 2) e = get("verb", { cv: 1, simple: 1 });
            else if (r < 0.3 && maxLv >= 2) e = get("verb");
            else if (r < 0.38) e = get("verb", { link: 1 });
            e = e || get("verb", { simple: 1 });
            return e && { k: "v", e };
          case "adj":
            e = get("adj");
            return e && { k: "adj", e };
          case "adv":
            if (r < 0.12) return { k: "deg", v: pick(G.DEGS) };
            e = r < 0.5 ? get("adv", { k: "manner" }) : r < 0.72 ? get("adv", { k: "time" }) : r < 0.86 ? get("adv", { k: "place" }) : get("adv", { k: "freq" }, 4);
            e = e || get("adv");
            return e && { k: "adv", e };
          case "det":
            if (r < 0.7) return { k: "det", v: rnd() < 0.5 ? "a" : "the" };
            if (r < 0.85) return { k: "q", v: pick(G.QUANTS) };
            e = get("idiom", { k: "quant" }, 4);
            return e ? { k: "q", v: e.w, e } : { k: "det", v: "the" };
          case "prep":
            var g = r < 0.5 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
            return { k: "prep", v: pick(G.PREP_G[g]) };
          case "pron":
            return { k: "pr", v: pick(["i", "you", "he", "she", "he", "she", "it"]) };
          case "aux":
            return r < 0.3 ? { k: "be", v: "pres" } : r < 0.6 ? { k: "modal", v: pick(G.MODALS) } : r < 0.88 ? { k: "sm", v: pick(G.SEMIS), t: "pres" } : { k: "not" };
          case "conj":
            return r < 0.65 ? { k: "conj", v: pick(G.CONJ_SUB) } : { k: "conj", v: pick(G.CONJ_CO) };
          case "part":
            return r < 0.42 ? { k: "ti", v: null } : r < 0.75 || !(o.level >= 1) ? { k: "er", v: "er" } : { k: "tp", v: pick(G.TP_CYCLE) };
          case "idiom":
            var ik = o.seeds ? "front" : r < 0.35 ? "front" : r < 0.65 ? "time" : r < 0.8 ? "place" : r < 0.9 ? "other" : "quant";
            e = get("idiom", { k: ik }, Math.max(maxLv, 2));
            if (!e) return null;
            return ik === "quant" ? { k: "q", v: e.w, e, star: 1 } : { k: "idm", e, star: 1 };
        }
        return null;
      }
      function pick(a) {
        return a[Math.floor(rnd() * a.length)];
      }
      function counts(items) {
        var c = {};
        for (var k in ratio) c[k] = 0;
        items.forEach(function(it) {
          if (it.word) {
            var k2 = catOf(it.word);
            if (c[k2] != null) c[k2]++;
          } else if (it.chunk) {
            var t = it.chunk.t;
            if (t === "NP") c.noun += 0.8;
            else if (t === "VP") c.verb += 0.8;
            else if (t === "PP") c.prep += 0.5;
            else if (t === "AP") c.adj += 0.6;
          }
        });
        return c;
      }
      function chooseCat(items, target) {
        var c = counts(items), scale = target / 24, loose = items.filter(function(i2) {
          return i2.word;
        }).length;
        if (loose >= 10) {
          for (var m in MIN) if (c[m] < MIN[m]) return m;
        }
        var tot = 0, ws = [];
        for (var k in ratio) {
          var d = ratio[k] * scale - c[k];
          var w = Math.pow(Math.max(0.12, d + 0.7), 2);
          ws.push([k, w]);
          tot += w;
        }
        var r = rnd() * tot;
        for (var i = 0; i < ws.length; i++) {
          r -= ws[i][1];
          if (r <= 0) return ws[i][0];
        }
        return "noun";
      }
      var manualArt = o.cfg && o.cfg.auto && !o.cfg.auto.art;
      var KIND_OF = { n: "noun", pr: "pron", v: "verb", modal: "aux", sm: "aux", be: "be", not: "not", det: "det", q: "det", prep: "prep", adj: "adj", adv: "adv", deg: "adv", ti: "ti", er: "part", tp: "part", conj: "conj", idm: "idiom" };
      var MINS = { noun: 4, verb: 3, aux: 2, be: 1, det: 2, prep: 2, adj: 2, adv: 1, ti: 1, part: 1, pron: 1, conj: 1, not: o.level >= 1 ? 1 : 0 };
      var CAPS = { det: 4, prep: 3, pron: 3, idiom: 2, conj: 2, not: 1, be: 2, aux: 3 };
      function kindCounts(items) {
        var c = {};
        items.forEach(function(it) {
          (it.word ? [it.word] : it.chunk && it.chunk.words || []).forEach(function(w) {
            var k = KIND_OF[w.k];
            if (k) c[k] = (c[k] || 0) + 1;
          });
          if (it.chunk && it.chunk.t === "ID") c.idiom = (c.idiom || 0) + 1;
        });
        return c;
      }
      function deficit(items, target) {
        var c = kindCounts(items), sc = Math.max(0.6, target / 22), best = null, bd = 0;
        for (var k in MINS) {
          var d = Math.round(MINS[k] * sc) - (c[k] || 0);
          if (d > bd) {
            bd = d;
            best = k;
          }
        }
        return best;
      }
      function overCap(items, w) {
        var k = w && KIND_OF[w.k];
        if (!k || !CAPS[k]) return false;
        return (kindCounts(items)[k] || 0) >= CAPS[k];
      }
      function pickKind(k, items) {
        switch (k) {
          case "aux":
            return rnd() < 0.5 ? { k: "modal", v: pick(G.MODALS) } : { k: "sm", v: pick(G.SEMIS), t: "pres" };
          case "be":
            return { k: "be", v: "pres" };
          case "not":
            return { k: "not" };
          case "ti":
            return { k: "ti", v: null };
          case "part":
            return o.level >= 1 && rnd() < 0.5 ? { k: "tp", v: pick(G.TP_CYCLE) } : { k: "er", v: "er" };
          case "conj":
            return { k: "conj", v: rnd() < 0.6 ? pick(G.CONJ_SUB) : pick(G.CONJ_CO) };
          case "pron":
            return { k: "pr", v: pick(["i", "you", "he", "she", "we", "they"]) };
          case "det":
            return { k: "det", v: rnd() < 0.5 ? "a" : "the" };
          case "prep":
            return { k: "prep", v: pick(G.PREP_G[rnd() < 0.6 ? 0 : rnd() < 0.5 ? 1 : 2]) };
          case "noun":
            return pickWord("noun", items);
          case "verb":
            return pickWord("verb", items);
          case "adj":
            return pickWord("adj", items);
          case "adv":
            return pickWord("adv", items);
        }
        return null;
      }
      var queue = [], recent = [], sidN = 0;
      function fillQueue() {
        var sd = o.seeds.next();
        if (!sd) return;
        var sid = ++sidN, wi = 0;
        recent.push({ text: sd.text, n: Seeds.norm(sd.text), sid, units: sd.chunks.map(function(c) {
          return c.map(function() {
            return wi++;
          });
        }) });
        if (recent.length > 8) recent.shift();
        var ws = sd.words.map(function(w, k) {
          var c = JSON.parse(JSON.stringify({ k: w.k, v: w.v, f: w.f, pl: w.pl, t: w.t }));
          c.e = w.e;
          c.sid = sid;
          c.si = k;
          if (w.k === "idm" || w.k === "q" && w.e) c.star = 1;
          return c;
        });
        for (var i = ws.length - 1; i > 0; i--) {
          var j = Math.floor(rnd() * (i + 1)), t = ws[i];
          ws[i] = ws[j];
          ws[j] = t;
        }
        queue = queue.concat(ws);
      }
      function liveSeeds(items) {
        var have = {};
        items.forEach(function(it) {
          (it.word ? [it.word] : it.chunk && it.chunk.words || []).forEach(function(w) {
            if (w && w.sid) have[w.sid] = (have[w.sid] || 0) + 1;
          });
        });
        var n = 0;
        recent.forEach(function(r) {
          var tot = r.units.reduce(function(a, u) {
            return a + u.length;
          }, 0);
          if ((have[r.sid] || 0) >= tot * 0.75) n++;
        });
        return n;
      }
      function feasible(items) {
        var np = 0, vp = 0, cnt = 0, dets = 0;
        items.forEach(function(it) {
          var w = it.word, t = it.chunk && it.chunk.t;
          if (t === "NP" || w && w.k === "pr") np++;
          else if (w && w.k === "n") {
            if (manualArt && (w.e.c === "c" || w.e.c === "t") && !w.e.ind) cnt++;
            else np++;
          }
          if (w && (w.k === "det" || w.k === "q")) dets++;
          if (t === "VP" || w && (w.k === "v" || w.k === "be")) vp++;
        });
        np += Math.min(cnt, dets);
        return { np, vp, cnt, dets, ok: np >= 2 && vp >= 1 };
      }
      function rescue(items) {
        var f = feasible(items);
        if (f.vp < 1) return dict.getWords({ pos: "verb", tag: { fr: ["intr", "both"], simple: 1 }, maxLevel: maxLv, count: 1, rnd })[0] ? { k: "v", e: dict.getWords({ pos: "verb", tag: { fr: ["intr", "both"], simple: 1 }, maxLevel: maxLv, count: 1, rnd })[0] } : pickWord("verb", items);
        if (manualArt && f.cnt > f.dets) return rnd() < 0.6 ? { k: "det", v: "the" } : { k: "pr", v: pick(["he", "she", "i", "you"]) };
        if (f.np < 2) return { k: "pr", v: pick(["he", "she", "i", "you", "it"]) };
        var e = dict.getWords({ pos: "verb", tag: { fr: ["intr", "both"], simple: 1 }, maxLevel: maxLv, count: 1, rnd })[0];
        return rnd() < 0.5 || !e ? { k: "pr", v: pick(["he", "she", "i", "you", "it"]) } : { k: "v", e };
      }
      return {
        next: function(items, target, idiomRate) {
          var f = feasible(items);
          if (!f.ok) return rescue(items);
          if (o.seeds) {
            if (!queue.length && liveSeeds(items) < 2) fillQueue();
            if (queue.length) return queue.shift();
            idiomRate = idiomRate == null ? 0.03 : idiomRate * 0.5;
          }
          var need = deficit(items, target || 22);
          if (need && rnd() < 0.8) {
            var nw = pickKind(need, items);
            if (nw) return nw;
          }
          if (rnd() < (idiomRate == null ? 0.06 : idiomRate)) {
            var idm = pickWord("idiom", items);
            if (idm) return idm;
          }
          for (var t = 0; t < 6; t++) {
            var w = pickWord(chooseCat(items, target || 22), items);
            if (w && !overCap(items, w)) return w;
          }
          return pickWord("noun", items);
        },
        pickWord,
        feasible,
        counts,
        rescue,
        // タネ文と同じ文か(PERFECT!)。当たったタネ文は一覧から外す
        matchSeed: function(text) {
          var n = Seeds.norm(text);
          for (var i = 0; i < recent.length; i++) if (recent[i].n === n) {
            recent.splice(i, 1);
            return true;
          }
          return false;
        },
        recentSeeds: function() {
          return recent.map(function(r) {
            return r.text;
          });
        },
        seedInfo: function() {
          return recent.slice();
        }
      };
    }
    function candidates(items, cfg) {
      var out = [], words = [];
      items.forEach(function(it) {
        if (it.chunk) out.push({ c: it.chunk, src: [it] });
        else if (it.word) {
          words.push(it);
          var s = G.chainState([it.word], cfg);
          if (s.complete && !s.err) out.push({ c: s.chunk, src: [it] });
          else if (it.word.k === "v" && !cfg.auto.verb) {
            ["base", "past"].forEach(function(f) {
              var w2 = { k: "v", e: it.word.e, f }, s2 = G.chainState([w2], cfg);
              if (s2.complete && !s2.err) out.push({ c: s2.chunk, src: [it] });
            });
          }
        }
      });
      var dets = words.filter(function(i) {
        return /^(det|q|pr)$/.test(i.word.k);
      }), nouns = words.filter(function(i) {
        return i.word.k === "n";
      });
      var preps = words.filter(function(i) {
        return i.word.k === "prep";
      }), aux = words.filter(function(i) {
        return i.word.k === "modal" || i.word.k === "be";
      });
      var verbs = words.filter(function(i) {
        return i.word.k === "v";
      });
      function tryChain(list) {
        var s = G.chainState(list.map(function(i) {
          return i.word;
        }), cfg);
        if (s.complete && !s.err) out.push({ c: s.chunk, src: list });
      }
      nouns.forEach(function(n) {
        dets.slice(0, 4).forEach(function(d) {
          tryChain([d, n]);
        });
        preps.slice(0, 3).forEach(function(p) {
          tryChain([p, n]);
          dets.slice(0, 2).forEach(function(d) {
            tryChain([p, d, n]);
          });
        });
      });
      verbs.forEach(function(v) {
        aux.slice(0, 2).forEach(function(a) {
          tryChain([a, v]);
        });
      });
      return out;
    }
    function solve(items, cfg, limit) {
      var cand = candidates(items, cfg), NP = [], VP = [], POST = [], COMP = [];
      cand.forEach(function(x) {
        var t = x.c.t;
        if (t === "NP") {
          NP.push(x);
          COMP.push(x);
        } else if (t === "VP") VP.push(x);
        else if (t === "AP" || t === "NF") COMP.push(x);
        if (t === "PP" || t === "ADV" || t === "ID" && x.c.ik !== "front") POST.push(x);
      });
      var tries = 0, best = null;
      limit = limit || 4e3;
      function disjoint(arr) {
        var s = /* @__PURE__ */ new Set();
        for (var i = 0; i < arr.length; i++) for (var j = 0; j < arr[i].src.length; j++) {
          if (s.has(arr[i].src[j])) return false;
          s.add(arr[i].src[j]);
        }
        return true;
      }
      function test(arr) {
        tries++;
        if (!disjoint(arr)) return false;
        var r = G.parse(arr.map(function(x) {
          return x.c;
        }), cfg);
        if (r.ok && r.kind === "S") {
          if (!best || arr.length > best.parts.length) best = { parts: arr, text: r.text };
          return true;
        }
        return false;
      }
      for (var a = 0; a < NP.length && tries < limit; a++) for (var b = 0; b < VP.length && tries < limit; b++) {
        test([NP[a], VP[b]]);
        for (var c = 0; c < COMP.length && tries < limit; c++) {
          if (test([NP[a], VP[b], COMP[c]])) for (var d = 0; d < POST.length && tries < limit; d++) test([NP[a], VP[b], COMP[c], POST[d]]);
        }
        for (var e = 0; e < POST.length && tries < limit; e++) test([NP[a], VP[b], POST[e]]);
        if (best && best.parts.length >= 4) return best;
      }
      return best;
    }
    return { create, RATIO, catOf, solve, candidates };
  })();

  // games/punichunk/src/game.js
  var Game = (function() {
    "use strict";
    var ROLE = [
      { k: "front", ja: "\u524D\u7F6E\u304D" },
      { k: "S", ja: "\u3060\u308C\u304C" },
      { k: "V", ja: "\u3059\u308B" },
      { k: "O", ja: "\u306A\u306B\u3092" },
      { k: "P", ja: "\u3069\u3053\u30FB\u3044\u3064" },
      { k: "P", ja: "\u3069\u3053\u30FB\u3044\u3064" }
    ];
    var MODE = {
      ta: { time: 60, max: 90, target: 22 },
      daily: { time: 75, max: 99, target: 22 },
      free: { time: 0, target: 22 },
      over: { time: 0, target: 18, cap: 34 },
      tutorial: { time: 0, target: 0 },
      shot: { time: 0, target: 0 }
    };
    var TUNE = { chunkTime: 0.5, chunkBonus3: 0.5, sentMin: 1, sentMax: 8, slotMul: 1.3, comboAt: 5, comboTime: 1, failX: 2, failTri: 1, chunkErr: 1, comboWin: 6, multStep: 0.05, multCap: 30, overStart: 2.6, overStep: 0.035, overMin: 0.55, overTime: 240, decayStart: 50, decayEnd: 150, decayMin: 0.15 };
    function decay(t) {
      return t <= TUNE.decayStart ? 1 : Math.max(TUNE.decayMin, 1 - (1 - TUNE.decayMin) * (t - TUNE.decayStart) / (TUNE.decayEnd - TUNE.decayStart));
    }
    function sentExt(words, viaSlot, combo, playT) {
      return (U.clamp(words - 1, TUNE.sentMin, TUNE.sentMax) * (typeof viaSlot === "number" ? viaSlot : viaSlot ? TUNE.slotMul : 1) + (combo >= TUNE.comboAt ? TUNE.comboTime : 0)) * decay(playT);
    }
    var SLOT_MULT = [1, 1, 1, 1.3, 1.6, 2, 2.5];
    function slotMult(n) {
      return SLOT_MULT[Math.min(6, n)] || 1;
    }
    function overInterval(sent, t) {
      return Math.max(TUNE.overMin, TUNE.overStart - TUNE.overStep * sent - t / TUNE.overTime);
    }
    function accepts(role, c) {
      if (!c) return false;
      switch (role) {
        case "front":
          return c.t === "CL" || c.t === "ID" && c.ik === "front";
        case "S":
          return c.t === "NP";
        case "V":
          return c.t === "VP";
        case "O":
          return c.t === "NP" || c.t === "AP" || c.t === "NF" || c.t === "PP" || c.t === "ADV" && c.ak === "place" || c.t === "ID" && c.ik === "place";
        case "P":
          return c.t === "PP" || c.t === "ADV" || c.t === "NF" || c.t === "ID" && c.ik !== "front";
        case "free":
          return true;
      }
      return false;
    }
    function create(app2, opt) {
      var M = MODE[opt.mode] || MODE.ta, cfg = { auto: opt.auto }, S = app2.settings;
      var rnd = opt.seed ? U.rng(opt.seed) : Math.random;
      var seeds = opt.mode === "tutorial" ? null : Seeds.create(app2.dict, { rnd, cfg: { auto: opt.auto }, level: opt.level || 0, maxLevel: opt.maxLevel || 2 });
      var supply = Supply.create(app2.dict, { rnd, maxLevel: opt.maxLevel || 2, cfg: { auto: opt.auto }, seeds, level: opt.level || 0 });
      var g = {
        mode: opt.mode,
        level: opt.level,
        items: [],
        slots: [],
        chain: null,
        sel: null,
        drag: null,
        fx: [],
        ghosts: [],
        marks: [],
        score: 0,
        combo: 0,
        comboT: 0,
        best: 0,
        t: 0,
        time: M.time,
        timeMax: M.max || 0,
        state: "countdown",
        countT: 3.2,
        spawnQ: 0,
        spawnT: 0,
        overT: TUNE.overStart,
        overInt: TUNE.overStart,
        playT: 0,
        failStreak: 0,
        segs: 0,
        idleT: 0,
        expr: "normal",
        exprT: 0,
        blinkT: 2,
        stats: { perfect: 0, eaten: 0, shock: 0, sentences: 0, chunks: 0, words: 0, longest: "", longestN: 0, maxCombo: 0, list: [], fails: 0, past: 0, front: 0, coord: 0, clause: 0, slotS: 0 },
        hintPath: null,
        hintPathT: 0,
        hunger: 3,
        cand: null,
        guide: null,
        listeners: {},
        noInput: false,
        lastTick: 99,
        readyT: 0,
        ready: null,
        id: 1,
        L: null
      };
      var free = opt.freeSlot, SHOT = opt.mode === "shot";
      ROLE.forEach(function(r) {
        g.slots.push({ role: r.k, ja: r.ja, item: null });
      });
      if (free && !SHOT) g.slots.push({ role: "free", ja: "\u3042\u304D", item: null });
      function on(name, fn) {
        (g.listeners[name] = g.listeners[name] || []).push(fn);
      }
      function emit(name, d) {
        (g.listeners[name] || []).forEach(function(f) {
          f(d);
        });
        app2.emit(name, d);
      }
      g.on = on;
      var colorMode = SHOT ? "pos" : opt.colorMode || "pos", dpr = app2.dpr;
      g.layout = function() {
        var st = app2.stage, W = st.w, H = st.h, top = st.top, bot = st.bottom;
        var hud2 = top + 58, prev = 30, barH = 70, laneH = SHOT ? 132 : 50;
        var bar = { x: 6, y: H - bot - barH - 6, w: W - 12, h: barH };
        var lane = { x: 0, y: bar.y - laneH, w: W, h: laneH };
        var field = { x: 6, y: hud2 + prev + 8, w: W - 12, h: lane.y - (hud2 + prev + 8) };
        var n = g.slots.length, gap = 5, sw = (bar.w - 12 - gap * (n - 1)) / n, sh = barH - 16;
        g.slots.forEach(function(s, i) {
          s.rect = { x: bar.x + 6 + i * (sw + gap), y: bar.y + 8, w: sw, h: sh };
        });
        g.L = { W, H, field, lane, bar, hudY: top, prevY: hud2 };
        var area = field.w * field.h, k = U.clamp(Math.sqrt(area / (378 * 560)), 0.8, 1.06);
        if (Math.abs(k - (g.k || 1)) > 0.01) {
          g.k = k;
          g.items.forEach(sizeItem);
        }
        g.target = M.target ? Math.round(M.target * U.clamp(area / (378 * 560), 0.78, 1.05)) : 0;
        g.items.forEach(function(it) {
          keepIn(it);
        });
        g.slots.forEach(function(s) {
          if (s.item) placeInSlot(s.item, s, true);
        });
      };
      function wordCol(w) {
        return colorMode === "pos" ? Art.colorKeyOfWord(w) : "plain";
      }
      function chunkCol(c) {
        return colorMode === "none" ? "plain" : Art.colorKeyOfChunk(c);
      }
      function blobsOf(c) {
        if (colorMode !== "pos") return [];
        var s = [];
        (c.words || []).forEach(function(w) {
          var k = Art.colorKeyOfWord(w);
          if (s.indexOf(k) < 0) s.push(k);
        });
        return s.slice(0, 3);
      }
      function sizeItem(it) {
        if (it.kind === "word") {
          it.text = G.wordText(it.word, cfg);
          var face = it.word.k === "pr";
          var k = g.k || 1;
          it.fs = Math.round(15 * Math.max(0.9, k) * 2) / 2;
          it.r = (face ? 30 : U.clamp(Art.measure(it.text, it.fs) / 2 + 13, 23, 46)) * k;
          it.face = face ? G.PRON[it.word.v].pl ? "pl" : "one" : "";
        } else {
          it.text = G.label(it.chunk, cfg);
          it.full = G.chunkText(it.chunk, cfg);
          var k2 = g.k || 1;
          it.fs = Math.round(15 * Math.max(0.9, k2) * 2) / 2;
          it.r = U.clamp(Art.measure(it.text, it.fs) / 2 + 17, 31, 56) * k2;
        }
        it.spr = null;
      }
      function spriteOf(it, slotR) {
        if (slotR) {
          return Art.sprite({ text: it.text, col: it.kind === "word" ? wordCol(it.word) : chunkCol(it.chunk), r: slotR, kind: "slot", shape: it.kind === "chunk" ? Art.shapeOfChunk(it.chunk) : "round", star: it.star, blobs: it.kind === "chunk" ? blobsOf(it.chunk) : [], dpr, fs: 12 });
        }
        if (it.spr) return it.spr;
        var o = it.kind === "word" ? { text: it.text, col: wordCol(it.word), r: Math.round(it.r), kind: "word", shape: "round", star: it.star, dpr, face: it.face, cyc: G.cyclable(it.word, cfg) && it.word.k !== "n", fs: it.fs } : { text: it.text, col: chunkCol(it.chunk), r: Math.round(it.r), kind: "chunk", shape: Art.shapeOfChunk(it.chunk), star: it.star, blobs: blobsOf(it.chunk), dpr, fs: it.fs };
        it.spr = Art.sprite(o);
        return it.spr;
      }
      function newItem(kind, payload, x, y) {
        var it = { id: g.id++, kind, x, y, vx: 0, vy: 0, sc: 0, scT: 0, sq: 0, sqv: 0, ph: Math.random() * 6, born: g.t, state: "spawn", slot: null };
        if (kind === "word") {
          it.word = payload;
          it.star = !!payload.star;
        } else {
          it.chunk = payload;
          it.star = payload.t === "ID" || (payload.words || []).some(function(w) {
            return w.star;
          });
        }
        sizeItem(it);
        return it;
      }
      function addItem(it) {
        g.items.push(it);
        return it;
      }
      function removeItem(it) {
        var i = g.items.indexOf(it);
        if (i >= 0) g.items.splice(i, 1);
        if (it.slot) {
          it.slot.item = null;
          it.slot = null;
        }
      }
      function keepIn(it) {
        var f = g.L.field, r = Math.min(it.r, f.w / 2 - 2, f.h / 2 - 2);
        var e = it.shot ? 0.9 : 0.5, hit = false;
        if (it.x < f.x + r) {
          it.x = f.x + r;
          it.vx = Math.abs(it.vx) * e;
          hit = true;
        }
        if (it.x > f.x + f.w - r) {
          it.x = f.x + f.w - r;
          it.vx = -Math.abs(it.vx) * e;
          hit = true;
        }
        if (it.y < f.y + r) {
          it.y = f.y + r;
          it.vy = Math.abs(it.vy) * e;
          hit = true;
        }
        if (it.y > f.y + f.h - r && it.state !== "spawn") {
          it.y = f.y + f.h - r;
          it.vy = -Math.abs(it.vy) * e;
          hit = true;
        }
        if (hit && it.shot) {
          squash(it, 5);
          if (g.t - (it.shot.wallT || 0) > 0.08) {
            it.shot.wallT = g.t;
            app2.audio.sfx("tap", 2);
          }
        }
      }
      function spawnWord(spec, x, y, instant) {
        var f = g.L.field;
        var it = spec.chunk ? newItem("chunk", spec.chunk, 0, 0) : newItem("word", spec, 0, 0);
        it.x = x != null ? x : f.x + it.r + Math.random() * (f.w - it.r * 2);
        it.y = y != null ? y : f.y + f.h + it.r * 0.6;
        it.vy = y != null ? 0 : -(160 + Math.random() * 80);
        it.vx = (Math.random() - 0.5) * 40;
        it.ty = f.y + it.r + Math.random() * Math.max(10, f.h * 0.78 - it.r);
        if (instant) {
          it.sc = 1;
          it.state = "idle";
        } else {
          it.state = "spawn";
          it.scT = 0;
        }
        return addItem(it);
      }
      g.spawnWord = spawnWord;
      function specFromSupply() {
        var s = supply.next(fieldAndSlotItems(), M.target || 22, opt.mode === "tutorial" ? 0 : 0.07);
        if (!s) return null;
        if (s.k === "v") s.f = "base";
        if (s.k === "sm") s.t = "pres";
        if (s.k === "be") s.v = "pres";
        if (s.k === "idm") {
          var st = G.chainState([s], cfg);
          if (st.complete && st.chunk) {
            st.chunk.words[0].star = 1;
            return { chunk: st.chunk };
          }
        }
        return s;
      }
      function fieldAndSlotItems() {
        return g.items.filter(function(i) {
          return i.state !== "pop";
        }).concat(g.slots.filter(function(s) {
          return s.item;
        }).map(function(s) {
          return s.item;
        }));
      }
      function liveCount() {
        return g.items.filter(function(i) {
          return i.state !== "pop" && i.state !== "merge";
        }).length;
      }
      function physics(dt) {
        var its = g.items, f = g.L.field, hits = [];
        for (var i = 0; i < its.length; i++) {
          var a = its[i];
          if (a.state === "pop" || a.state === "merge" || a.slot) continue;
          if (a.lift) continue;
          var still = a.inChain || a === (g.sel && g.sel.item) || g.drag && a.state !== "spawn";
          if (a.state === "spawn") {
            a.scT += dt;
            a.sc = U.E.outBack(U.clamp(a.scT / 0.35, 0, 1));
            if (a.y > (a.ty || 0)) a.vy -= 520 * dt;
            else a.vy *= 0.8;
            if (a.y > f.y + f.h + a.r) a.y = f.y + f.h + a.r;
            if (a.scT > 0.35 && a.y <= (a.ty || f.y + f.h - a.r) + 4 || a.scT > 2.2) {
              a.state = "idle";
              keepIn(a);
            }
          }
          if (SHOT && aim && aim.it === a) {
            a.vx = a.vy = 0;
            continue;
          }
          if (a.shot) {
            a.vx *= Math.pow(0.983, dt * 60);
            a.vy *= Math.pow(0.983, dt * 60);
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            if (Math.hypot(a.vx, a.vy) < 55 || g.t - a.shot.t > 5) shotEnd(a);
            continue;
          }
          if (!still) {
            var dk = g.calm ? 0.12 : 1;
            a.vx += (Math.sin(g.t * 0.7 + a.ph) * 9 + (Math.random() - 0.5) * 18) * dt * dk;
            a.vy += (Math.cos(g.t * 0.6 + a.ph * 1.3) * 9 + (Math.random() - 0.5) * 18) * dt * dk;
          }
          var damp = still ? g.drag ? 0.7 : 0.82 : a.state === "spawn" ? 0.985 : 0.965;
          a.vx *= Math.pow(damp, dt * 60);
          a.vy *= Math.pow(damp, dt * 60);
          var sp = Math.hypot(a.vx, a.vy), mx = a.state === "spawn" ? 400 : 60;
          if (sp > mx) {
            a.vx *= mx / sp;
            a.vy *= mx / sp;
          }
          a.x += a.vx * dt;
          a.y += a.vy * dt;
        }
        for (i = 0; i < its.length; i++) {
          var p = its[i];
          if (p.state === "pop" || p.state === "merge" || p.slot || p.lift) continue;
          for (var j = i + 1; j < its.length; j++) {
            var q = its[j];
            if (q.state === "pop" || q.state === "merge" || q.slot || q.lift) continue;
            var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = (p.r + q.r) * (p.sc * 0.5 + 0.5) * 0.96 + 3;
            var far = (p.r + q.r) * 1.9;
            if (d < far && !g.drag) {
              var fk = (1 - d / far) * 70 * dt, fx = dx / d * fk, fy = dy / d * fk;
              if (!p.inChain) {
                p.vx -= fx;
                p.vy -= fy;
              }
              if (!q.inChain) {
                q.vx += fx;
                q.vy += fy;
              }
            }
            if (d < min && SHOT && (p.shot || q.shot)) {
              var sh = p.shot && (!q.shot || p.shot.main) ? p : q, ot = sh === p ? q : p;
              if (sh.shot.main && !sh.shot.tried[ot.id]) {
                sh.shot.tried[ot.id] = 1;
                hits.push([sh, ot]);
              }
              var nx0 = dx / d, ny0 = dy / d;
              if (sh.shot.pierce && sh.shot.main) {
                var sgn = sh === p ? 1 : -1;
                if (shotMerge(sh, ot)) {
                  var o1 = (min - d) / 2;
                  p.x -= nx0 * o1;
                  p.y -= ny0 * o1;
                  q.x += nx0 * o1;
                  q.y += ny0 * o1;
                  continue;
                }
                var px = -sh.vy, py = sh.vx, pl = Math.hypot(px, py) || 1, side = (ot.x - sh.x) * px + (ot.y - sh.y) * py > 0 ? 1 : -1;
                ot.vx += px / pl * side * 35;
                ot.vy += py / pl * side * 35;
                var o2 = (min - d) / 2;
                ot.x += (ot === q ? 1 : -1) * nx0 * o2 * 2;
                ot.y += (ot === q ? 1 : -1) * ny0 * o2 * 2;
                continue;
              }
              var mp = p.r * p.r, mq = q.r * q.r, rv = (q.vx - p.vx) * nx0 + (q.vy - p.vy) * ny0;
              if (rv < 0) {
                var jj = -(1 + 0.95) * rv / (1 / mp + 1 / mq);
                p.vx -= jj / mp * nx0;
                p.vy -= jj / mp * ny0;
                q.vx += jj / mq * nx0;
                q.vy += jj / mq * ny0;
                knock(ot, sh.shot);
                squash(ot, 6);
                if (Math.abs(rv) > 300) app2.audio.sfx("tap", 1);
              }
              var o0 = (min - d) / 2;
              p.x -= nx0 * o0;
              p.y -= ny0 * o0;
              q.x += nx0 * o0;
              q.y += ny0 * o0;
              continue;
            }
            if (d < min) {
              var o = (min - d) / 2, nx = dx / d, ny = dy / d, pw = p.inChain ? 0.15 : 1, qw = q.inChain ? 0.15 : 1, s = pw + qw;
              p.x -= nx * o * pw * 2 / s;
              p.y -= ny * o * pw * 2 / s;
              q.x += nx * o * qw * 2 / s;
              q.y += ny * o * qw * 2 / s;
              p.vx -= nx * 12 * pw;
              p.vy -= ny * 12 * pw;
              q.vx += nx * 12 * qw;
              q.vy += ny * 12 * qw;
            }
          }
          keepIn(p);
        }
        its.forEach(function(it) {
          var k = 180, d2 = 12;
          it.sqv += (-k * it.sq - d2 * it.sqv) * dt;
          it.sq += it.sqv * dt;
        });
        hits.forEach(function(h) {
          if (h[0].shot && g.items.indexOf(h[0]) >= 0 && g.items.indexOf(h[1]) >= 0 && h[1].state !== "pop" && h[1].state !== "merge") shotHit(h[0], h[1]);
        });
      }
      function squash(it, v) {
        it.sqv += v || 6;
      }
      function chainWords() {
        return g.chain ? g.chain.items.map(function(i) {
          return i.word;
        }) : [];
      }
      function updateChainState() {
        if (!g.chain) return;
        g.chain.st = G.chainState(chainWords(), cfg);
        g.chain.last = g.t;
        refreshCand();
        previewChain();
      }
      function previewChain() {
        if (!g.chain) return;
        var st = g.chain.st, txt = st.complete && st.chunk ? G.chunkText(st.chunk, cfg) : g.chain.items.map(function(i) {
          return i.text;
        }).join(" ");
        app2.ui.preview(txt, st.complete ? st.err ? "bad" : "ok" : "wait", st.err ? st.err.msg : "");
      }
      function startChain(it) {
        g.chain = { items: [it], last: g.t, t0: g.t };
        it.inChain = true;
        squash(it, 8);
        app2.audio.sfx("tap", 0);
        updateChainState();
        emit("chainStart", { item: it });
      }
      function fitForms(items) {
        var ws = items.map(function(i) {
          return i.word;
        }), st = G.chainState(ws, cfg);
        if (!st.err) return st;
        for (var k = 0; k < items.length; k++) {
          var w = ws[k];
          if (w.k !== "v") continue;
          var f0 = w.f;
          for (var c = 0; c < 3; c++) {
            G.cycleWord(w, cfg);
            var s2 = G.chainState(ws, cfg);
            if (!s2.err && (s2.complete || s2.prefix)) {
              sizeItem(items[k]);
              items.formFixed = true;
              return s2;
            }
          }
          w.f = f0;
        }
        return st;
      }
      function addToChain(it) {
        g.chain.items.push(it);
        it.inChain = true;
        fitForms(g.chain.items);
        if (g.chain.items.formFixed) {
          g.chain.fixed = true;
          g.chain.items.formFixed = false;
        }
        squash(it, 8);
        app2.audio.sfx("tap", g.chain.items.length - 1);
        updateChainState();
        emit("chainAdd", { item: it });
      }
      function clearChain() {
        if (!g.chain) return;
        g.chain.items.forEach(function(i) {
          i.inChain = false;
        });
        g.chain = null;
        refreshCand();
        app2.ui.preview("", "");
      }
      function scatterChain(msg) {
        var its = g.chain.items, st = g.chain.st;
        its.forEach(function(i) {
          i.vx += (Math.random() - 0.5) * 160;
          i.vy += (Math.random() - 0.5) * 160;
          squash(i, -6);
        });
        var text = its.map(function(i) {
          return i.text;
        }).join(" ");
        var m = msg || (st && st.err ? st.err.msg : G.MSG.chain({ t: text }));
        var c = centroid(its);
        toast(m, st && st.err ? "x" : "tri", c.x, c.y);
        app2.audio.sfx("scatter");
        clearChain();
        breakCombo();
        setExpr("sad", 1);
        if (st && st.err && !msg) {
          g.stats.fails++;
          emit("fail", { kind: "chunk", code: st.err.code });
        }
      }
      function confirmChain() {
        var ch = g.chain;
        if (!ch) return null;
        if (ch.items.length < 2) {
          var only = ch.items[0];
          clearChain();
          return only || null;
        }
        var st = ch.st;
        if (!st.complete) {
          scatterChain();
          return null;
        }
        if (st.err) {
          scatterChain();
          return null;
        }
        var its = ch.items, c = centroid(its), chunk = st.chunk;
        if (chunk.t === "NP" && chunk.merged) {
          var mw = { k: "pr", v: chunk.pron };
          chunk = G.chainState([mw], cfg).chunk;
        }
        clearChain();
        its.forEach(function(i) {
          ghostTo(i, c.x, c.y);
          removeItem(i);
        });
        var ni = newItem("chunk", chunk, c.x, c.y);
        ni.state = "grow";
        ni.scT = -0.12;
        addItem(ni);
        var n = its.length;
        g.chunksSince++;
        g.segs = Math.min(10, g.segs + 1);
        g.stats.chunks++;
        var fixed = ch.fixed;
        if (fixed) triMark("\u25B3 \u6B63\u3057\u3044\u9806\u756A:" + G.chunkText(chunk, cfg), c.x, c.y - ni.r);
        else addCombo(1);
        var pts = Math.round(10 * Math.max(1, n) * mult() * (fixed ? 0.5 : 1));
        addScore(pts, c.x, c.y - ni.r);
        if (M.time) addTime((TUNE.chunkTime + (n >= 3 ? TUNE.chunkBonus3 : 0)) * decay(g.playT));
        app2.audio.sfx("chunk", n);
        if (n > 1 || chunk.t === "VP" || chunk.t === "NP") speak(ni.full);
        burst(c.x, c.y, Art.COL[chunkCol(chunk)], 10 + n * 3);
        if (S.gloss) {
          var gl = G.gloss(chunk);
          if (gl) g.marks.push({ item: ni, text: gl, t: 0, d: 1.8 });
        }
        setExpr("joy", 0.7);
        emit("chunk", { item: ni, chunk, n });
        g.lastMade = { item: ni, t: g.t };
        refill();
        return ni;
      }
      function centroid(its) {
        var x = 0, y = 0;
        its.forEach(function(i) {
          x += i.x;
          y += i.y;
        });
        return { x: x / its.length, y: y / its.length };
      }
      function select(it) {
        if (g.sel && g.sel.item === it) {
          if (cycleChunk(it)) {
            g.sel.t = g.t;
            return;
          }
        }
        g.sel = { item: it, t: g.t };
        squash(it, 5);
        app2.audio.sfx("select");
        speak(it.full || it.text);
        showTip(it);
        refreshCand();
        emit("select", { item: it });
        app2.ui.preview(it.full || it.text, "sel");
      }
      function deselect() {
        if (!g.sel) return;
        g.sel = null;
        app2.ui.tip(null);
        refreshCand();
        app2.ui.preview("", "");
      }
      function cycleChunk(it) {
        var c = it.chunk;
        if (!c || c.t === "CL") return false;
        var order = ["ti", "be", "v", "modal", "prep", "det", "pr", "n", "er", "conj"];
        for (var o = 0; o < order.length; o++) {
          var ws = c.words.filter(function(w2) {
            return w2.k === order[o];
          });
          for (var k = 0; k < ws.length; k++) {
            var w = ws[k], save = JSON.stringify({ v: w.v, f: w.f, pl: w.pl });
            for (var tries = 0; tries < 6; tries++) {
              if (!G.cycleWord(w, cfg)) break;
              var r = G.rebuild(c, cfg);
              if (r.chunk && !r.err) {
                it.chunk = r.chunk;
                sizeItem(it);
                squash(it, 7);
                app2.audio.sfx("cycle");
                speak(it.full);
                showTip(it);
                return true;
              }
            }
            var sv = JSON.parse(save);
            w.v = sv.v;
            w.f = sv.f;
            w.pl = sv.pl;
          }
        }
        return false;
      }
      function showTip(it) {
        var gl = it.chunk ? G.gloss(it.chunk) : "";
        app2.ui.tip(it.full || it.text, S.gloss ? gl : "", it.x, it.y - it.r - 6);
      }
      function tryInsertInto(target, wi) {
        var nc = G.tryInsert(target.chunk, wi.word, cfg);
        if (!nc) return false;
        ghostTo(wi, target.x, target.y);
        removeItem(wi);
        target.chunk = nc;
        sizeItem(target);
        squash(target, 10);
        if (target.slot) {
          if (accepts(target.slot.role, nc)) placeInSlot(target, target.slot, true);
          else {
            var sl = target.slot;
            sl.item = null;
            target.slot = null;
            target.state = "idle";
            target.x = sl.rect.x + sl.rect.w / 2;
            target.y = g.L.field.y + g.L.field.h - 40;
            addItem(target);
            keepIn(target);
            slotsChanged();
          }
        }
        app2.audio.sfx("insert");
        speak(target.full);
        burst(target.x, target.y, Art.COL[chunkCol(nc)], 8);
        addCombo(1);
        addScore(Math.round(8 * mult()), target.x, target.y - target.r);
        g.sel.t = g.t;
        showTip(target);
        emit("insert", { item: target });
        refill();
        return true;
      }
      function tokenOf(it) {
        if (it.chunk) return it.chunk;
        var st = G.chainState([it.word], cfg);
        return st.complete && !st.err ? st.chunk : null;
      }
      function unitOf(it) {
        return it.chunk ? { chunk: it.chunk, words: it.chunk.words || [] } : { words: [it.word] };
      }
      function strokeTokens() {
        return G.strokeTokens(g.drag.items.map(unitOf), cfg) || [];
      }
      function strokeOK() {
        return !!G.strokeTokens(g.drag.items.map(unitOf), cfg);
      }
      var PEND_SAMPLES = null;
      function pendSamples() {
        if (PEND_SAMPLES) return PEND_SAMPLES;
        var n = app2.dict.all("noun").filter(function(e) {
          return e.c === "c" && !e.ind && e.cat !== "time" && e.cat !== "place";
        })[0], v = app2.dict.all("verb").filter(function(e) {
          return e.fr === "both";
        })[0];
        PEND_SAMPLES = [[{ k: "n", e: n }], [{ k: "det", v: "the" }, { k: "n", e: n }], [{ k: "v", e: v, f: "base" }]];
        return PEND_SAMPLES;
      }
      function okSeq(seq) {
        var T2 = G.strokeTokens(seq.map(unitOf), cfg, true), allW = [].concat.apply([], seq.map(function(i) {
          return unitOf(i).words;
        }));
        if (allW.length <= 6 && G.asChunk(allW, cfg).prefix && seq.length === 1) return true;
        if (!T2) return allW.length <= 6 && !!G.asChunk(allW, cfg).prefix;
        if (T2.pend) {
          var pc = G.completePend(T2.pend, cfg, pendSamples());
          if (!pc) return false;
          T2 = T2.slice();
          T2.push(pc);
        }
        var iv = -1, inp = -1;
        T2.forEach(function(t, k) {
          if (iv < 0 && t.t === "VP") iv = k;
          if (inp < 0 && (t.t === "NP" || t.t === "CL")) inp = k;
        });
        if (iv > 0 && (inp < 0 || inp > iv)) return false;
        return G.viable(T2, true) || allW.length <= 6 && !!G.asChunk(allW, cfg).chunk;
      }
      function strokeAdd(it) {
        var d = g.drag;
        if (d.items.indexOf(it) >= 0) {
          if (d.items.length >= 2 && d.items[d.items.length - 2] === it) {
            if (d.backIt !== it) {
              d.backIt = it;
              d.backT = g.t;
            } else if (g.t - d.backT > 0.3) {
              d.items.pop();
              d.backIt = null;
              app2.audio.sfx("cycle");
              strokePreview();
              refreshCand();
            }
          }
          return;
        }
        d.backIt = null;
        if (!tokenOf(it) && it.kind === "word" && !G.chainState([it.word], cfg).prefix) {
          if (!it.noFlash || g.t - it.noFlash > 0.6) {
            it.noFlash = g.t;
            squash(it, -4);
          }
          return;
        }
        if (guideBlocks(it)) return;
        if (!okSeq(d.items.concat([it]))) {
          if (d.items.length >= 2 && okSeq(d.items.slice(0, -1).concat([it]))) {
            var dropped = d.items.pop();
            squash(dropped, -3);
            d.items.push(it);
            squash(it, 8);
            app2.audio.sfx("link", d.items.length - 1);
            strokePreview();
            refreshCand();
            return;
          }
          if (!it.badT || g.t - it.badT > 0.6) {
            it.badT = g.t;
            squash(it, -5);
            app2.audio.sfx("reject");
          }
          return;
        }
        if (d.items.length === 1 && d.lifted) {
          unlift(d.lifted);
          d.lifted = null;
        }
        d.items.push(it);
        squash(it, 8);
        app2.audio.sfx("link", d.items.length - 1);
        strokePreview();
        refreshCand();
      }
      function strokePreview() {
        var T = G.strokeTokens(g.drag.items.map(unitOf), cfg);
        var ac0 = g.drag.items.length > 1 ? G.asChunk([].concat.apply([], g.drag.items.map(function(i) {
          return unitOf(i).words;
        })), cfg) : null;
        if (!T || ac0 && ac0.chunk && !(T && G.parse(T, cfg).ok)) {
          g.drag.ok = !!(ac0 && ac0.chunk);
          g.drag.viable = true;
          app2.ui.preview(ac0 && ac0.chunk ? G.chunkText(ac0.chunk, cfg) : g.drag.items.map(function(i) {
            return i.text;
          }).join(" "), ac0 && ac0.chunk ? "ok" : "wait", ac0 && ac0.chunk ? "\u306F\u306A\u3059\u3068\u30C1\u30E3\u30F3\u30AF\u306B\u306A\u308B" : "");
          return;
        }
        var r = G.parse(T, cfg), v = G.viable(T);
        g.drag.ok = r.ok;
        g.drag.viable = v;
        app2.ui.preview(r.ok ? r.text : T.map(function(t) {
          return G.chunkText(t, cfg);
        }).join(" "), r.ok ? "ok" : v ? "wait" : "bad", "");
      }
      function lift(it) {
        it.lift = true;
        it.liftFrom = { x: it.x, y: it.y, slot: it.slot };
        squash(it, 6);
      }
      function unlift(it) {
        it.lift = false;
        if (it.liftFrom && it.liftFrom.slot) placeInSlot(it, it.liftFrom.slot, true);
        else if (it.liftFrom) {
          it.x = it.liftFrom.x;
          it.y = it.liftFrom.y;
        }
        it.liftFrom = null;
      }
      function endDrag(x, y) {
        var d = g.drag;
        g.drag = null;
        refreshCand();
        if (!d) return;
        if (d.carry && d.items[0]) {
          var ci = d.items[0];
          d.items.slice(1).forEach(function(i) {
            if (i.lift) unlift(i);
          });
          if (inKun(x, y)) {
            eat(ci);
            return;
          }
          ci.lift = false;
          dropToSlot(ci, slotAt(x, y), d);
          return;
        }
        if (d.items.length >= 2) {
          unliftAll(d);
          evalStroke(d.items, x, y, inBar(x, y));
          return;
        }
        var it = d.items[0];
        if (!it) return;
        var si = slotAt(x, y);
        if (si != null || inBar(x, y)) {
          if (it.lift) it.lift = false;
          dropToSlot(it, si, d);
          return;
        }
        if (it.lift) {
          it.lift = false;
          if (it.slot) {
            var s = it.slot;
            s.item = null;
            it.slot = null;
            it.state = "idle";
            app2.audio.sfx("slot");
            slotsChanged();
          }
          it.x = x;
          it.y = y;
          it.vx = it.vy = 0;
          keepIn(it);
          squash(it, 6);
          if (g.items.indexOf(it) < 0) addItem(it);
        }
        app2.ui.preview("", "");
      }
      function unliftAll(d) {
        d.items.forEach(function(i) {
          if (i.lift) unlift(i);
        });
        if (d.lifted && d.lifted.lift) unlift(d.lifted);
      }
      function evalStroke(its, x, y, toBar) {
        var T = G.strokeTokens(its.map(unitOf), cfg), r0 = T && G.parse(T, cfg);
        g.debug.lastStroke = its.map(function(i) {
          return i.text;
        }).join(" + ");
        if (!(r0 && r0.ok)) {
          var allW = [].concat.apply([], its.map(function(i) {
            return unitOf(i).words;
          })), ac = allW.length <= 6 ? G.asChunk(allW, cfg) : null;
          if (ac && ac.chunk) {
            makeChunkFrom(its, ac.chunk, x, y, ac.words !== allW);
            return;
          }
          if (T && G.viable(T, true)) {
            makeFrag(its, T, x, y, toBar);
            return;
          }
        }
        if (!(r0 && r0.ok) && its.length >= 3 && !its.retry) {
          var mid = its.length - 2, bestS = null;
          for (var m = (1 << mid) - 2; m >= 0 && !bestS; m--) {
            var sub = [its[0]];
            for (var b = 0; b < mid; b++) if (m & 1 << b) sub.push(its[b + 1]);
            sub.push(its[its.length - 1]);
            var Ts = G.strokeTokens(sub.map(unitOf), cfg), rs = Ts && G.parse(Ts, cfg), aw = [].concat.apply([], sub.map(function(i) {
              return unitOf(i).words;
            }));
            if (rs && rs.ok || aw.length <= 6 && G.asChunk(aw, cfg).chunk) bestS = sub;
          }
          if (bestS) {
            bestS.retry = true;
            evalStroke(bestS, x, y, toBar);
            return;
          }
        }
        if (!T) {
          failMark({ sev: 2, err: G.err("chain", { t: its.map(function(i) {
            return i.text;
          }).join(" ") }) }, x, y);
          return;
        }
        var r = r0;
        g.debug.lastT = T.map(function(t) {
          return t.t + ":" + G.chunkText(t, cfg);
        }).join(" | ");
        if (toBar && T.length >= 2) {
          makeFrag(its, T, x, y, true);
          return;
        }
        if (r.ok && r.kind === "S") {
          sentence(its, T, r, false);
          return;
        }
        if (r.ok && r.kind === "CL") {
          var fi = its.filter(function(i) {
            return !i.slot;
          }), c = fi.length ? centroid(fi) : { x: U.clamp(x, g.L.field.x + 40, g.L.field.x + g.L.field.w - 40), y: g.L.field.y + g.L.field.h - 60 };
          its.forEach(function(i) {
            ghostTo(i, c.x, c.y);
            removeItem(i);
          });
          var ni = addItem(newItem("chunk", G.makeClause(T, r), c.x, c.y));
          ni.state = "grow";
          ni.scT = -0.1;
          app2.audio.sfx("chunk", 4);
          speak(r.text);
          addCombo(2);
          addScore(Math.round(40 * mult()), c.x, c.y - 30);
          burst(c.x, c.y, Art.COL.link, 18);
          setExpr("idea", 1);
          emit("clause", { item: ni });
          refill();
          slotsChanged();
          app2.ui.preview("", "");
          return;
        }
        failMark(r, x, y);
      }
      function makeFrag(its, T, x, y, toBar) {
        var fi = its.filter(function(i) {
          return !i.slot;
        }), c = fi.length ? centroid(fi) : { x: U.clamp(x, g.L.field.x + 40, g.L.field.x + g.L.field.w - 40), y: g.L.field.y + g.L.field.h - 60 };
        its.forEach(function(i) {
          ghostTo(i, c.x, c.y);
          removeItem(i);
        });
        var ni = addItem(newItem("chunk", G.makeFrag(T), c.x, c.y));
        ni.state = "grow";
        ni.scT = -0.1;
        app2.audio.sfx("chunk", 3);
        speak(ni.full);
        if (!toBar) toast("\u6587\u306E\u304B\u3051\u3089\u3002\u3064\u3065\u304D\u3092\u3064\u306A\u3052\u3088\u3046", "info", c.x, c.y - 40);
        emit("frag", { item: ni });
        refill();
        slotsChanged();
        app2.ui.preview("", "");
        if (toBar) dropToSlot(ni, null, {});
      }
      function spreadToSlots(it) {
        var parts = it.chunk.parts, x = it.x, y = it.y, from = it.slot;
        removeItem(it);
        if (it.lift) it.lift = false;
        var placed = 0, left = [];
        parts.forEach(function(p) {
          var t = freeSlotFor(p);
          var ci = newItem("chunk", p, x, y);
          ci.sc = 1;
          ci.state = "idle";
          if (t) {
            placeInSlot(ci, t);
            placed++;
          } else left.push(ci);
        });
        left.forEach(function(ci, k) {
          ci.x = U.clamp(x + k * 30, g.L.field.x + 40, g.L.field.x + g.L.field.w - 40);
          ci.y = g.L.field.y + g.L.field.h - 50;
          addItem(ci);
          keepIn(ci);
        });
        if (left.length) toast("\u5165\u3089\u306A\u3044\u90E8\u5206\u306F\u4E0A\u306B\u3082\u3069\u3057\u305F", "tri", x, y - 30);
        emit("slot", { item: it, role: "spread" });
        slotsChanged();
        app2.ui.preview("", "");
        refill();
      }
      function triMark(text, x, y) {
        toast(text, "tri", x, y);
        app2.audio.sfx("tri");
        g.fx.push({ type: "mark", x, y, tri: true, t: 0, d: 0.9 });
        setExpr("think", 1);
      }
      function makeChunkFrom(its, chunk, x, y, fixed) {
        var fi = its.filter(function(i) {
          return !i.slot;
        }), c = fi.length ? centroid(fi) : { x, y }, n = chunk.words.length;
        its.forEach(function(i) {
          ghostTo(i, c.x, c.y);
          removeItem(i);
        });
        var ni = newItem("chunk", chunk, c.x, c.y);
        ni.state = "grow";
        ni.scT = -0.12;
        addItem(ni);
        g.chunksSince++;
        g.segs = Math.min(10, g.segs + 1);
        g.stats.chunks++;
        if (fixed) triMark("\u25B3 \u6B63\u3057\u3044\u9806\u756A:" + G.chunkText(chunk, cfg), c.x, c.y - ni.r);
        else addCombo(1);
        addScore(Math.round(10 * n * mult() * (fixed ? 0.5 : 1)), c.x, c.y - ni.r);
        if (M.time) addTime((TUNE.chunkTime + (n >= 3 ? TUNE.chunkBonus3 : 0)) * decay(g.playT));
        app2.audio.sfx("chunk", n);
        speak(ni.full);
        burst(c.x, c.y, Art.COL[chunkCol(chunk)], 10 + n * 3);
        if (S.gloss) {
          var gl = G.gloss(chunk);
          if (gl) g.marks.push({ item: ni, text: gl, t: 0, d: 1.8 });
        }
        setExpr("joy", 0.7);
        emit("chunk", { item: ni, chunk, n });
        refill();
        slotsChanged();
        app2.ui.preview("", "");
      }
      function failMark(r, x, y) {
        var tri = r.sev === 1;
        toast(r.err.msg, tri ? "tri" : "x", x, y);
        app2.audio.sfx(tri ? "tri" : "fail");
        if (!tri) penalty(TUNE.failX);
        breakCombo();
        setExpr(tri ? "think" : "sad", 1.2);
        g.stats.fails++;
        g.failStreak++;
        g.fx.push({ type: "mark", x, y, tri, t: 0, d: 0.9 });
        emit("fail", { kind: "sentence", code: r.err.code });
        app2.ui.preview("", "");
      }
      function slotAt(x, y) {
        for (var i = 0; i < g.slots.length; i++) {
          var r = g.slots[i].rect;
          if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 10 && y <= r.y + r.h + 8) return i;
        }
        return null;
      }
      function kunPos() {
        var lane = g.L.lane;
        return { x: 46, y: lane.y + lane.h * 0.55 };
      }
      function inKun(x, y) {
        var k = kunPos();
        return Math.hypot(x - k.x, y - k.y) < 46;
      }
      function eat(it) {
        if (g.hunger <= 0) {
          bounceBack(it, "\u304A\u306A\u304B\u3044\u3063\u3071\u3044\u2026\u6587\u3092\u4F5C\u308B\u3068\u3001\u307E\u305F\u98DF\u3079\u3089\u308C\u308B");
          setExpr("sad", 0.8);
          return;
        }
        g.hunger--;
        var k = kunPos(), fromSlot = !!it.slot;
        ghostTo(it, k.x - 10, k.y);
        removeItem(it);
        it.lift = false;
        app2.audio.sfx("insert");
        setTimeout(function() {
          if (!g.dead) app2.audio.sfx("pop");
        }, 160);
        setExpr("joy", 0.9);
        g.stats.eaten++;
        g.fx.push({ type: "txt", x: k.x + 30, y: k.y - 34, text: "\u3082\u3050\u3082\u3050", t: 0, d: 0.9, ja: 1 });
        emit("eat", { item: it });
        if (fromSlot) slotsChanged();
        refill();
        app2.ui.preview("", "");
      }
      function inBar(x, y) {
        var b = g.L.bar;
        return x >= b.x && x <= b.x + b.w && y >= b.y - 6 && y <= b.y + b.h + 20;
      }
      function placeInSlot(it, s, quiet) {
        it.slot = s;
        s.item = it;
        it.state = "slot";
        it.lift = false;
        it.x = s.rect.x + s.rect.w / 2;
        it.y = s.rect.y + s.rect.h / 2;
        it.vx = it.vy = 0;
        var i = g.items.indexOf(it);
        if (i >= 0) g.items.splice(i, 1);
        if (!quiet) {
          squash(it, 8);
          app2.audio.sfx("slot");
        }
      }
      function dropToSlot(it, si, d) {
        var tok = tokenOf(it), from = it.liftFrom && it.liftFrom.slot;
        if (!tok) {
          bounceBack(it, "\u3053\u306E\u307E\u307E\u3067\u306F\u30B9\u30ED\u30C3\u30C8\u306B\u5165\u3089\u306A\u3044");
          return;
        }
        if (tok.t === "FR") {
          spreadToSlots(it);
          return;
        }
        var target = si != null ? g.slots[si] : null;
        if (guideBlocks(it, target)) {
          bounceBack(it);
          return;
        }
        if (!target || !accepts(target.role, tok)) target = freeSlotFor(tok) || (target && accepts(target.role, tok) ? target : null);
        if (!target) {
          bounceBack(it, "\u5165\u308C\u3089\u308C\u308B\u30B9\u30ED\u30C3\u30C8\u304C\u306A\u3044");
          return;
        }
        if (it.kind === "word") {
          var ci = newItem("chunk", tok, it.x, it.y);
          ci.sc = 1;
          ci.state = "idle";
          removeItem(it);
          it = ci;
        }
        if (target.item && target.item !== it) {
          var old = target.item;
          old.slot = null;
          target.item = null;
          if (from && accepts(from.role, tokenOf(old))) placeInSlot(old, from, true);
          else {
            old.state = "idle";
            old.x = target.rect.x + target.rect.w / 2;
            old.y = g.L.field.y + g.L.field.h - 30;
            addItem(old);
            keepIn(old);
          }
        }
        if (it.slot && it.slot !== target) {
          it.slot.item = null;
          it.slot = null;
        }
        placeInSlot(it, target);
        it.liftFrom = null;
        emit("slot", { item: it, role: target.role });
        slotsChanged();
        app2.ui.preview("", "");
        refill();
      }
      function freeSlotFor(tok) {
        var pref = tok.t === "NP" ? ["S", "O", "free"] : tok.t === "VP" ? ["V", "free"] : tok.t === "PP" || tok.t === "ADV" || tok.t === "ID" ? ["front", "P", "O", "free"] : tok.t === "CL" ? ["front", "free"] : ["O", "P", "free"];
        for (var k = 0; k < pref.length; k++) {
          var sl = g.slots.filter(function(s) {
            return !s.item && s.role === pref[k] && accepts(s.role, tok);
          })[0];
          if (sl) return sl;
        }
        return g.slots.filter(function(s) {
          return !s.item && accepts(s.role, tok);
        })[0] || null;
      }
      function bounceBack(it, msg) {
        if (it.lift) unlift(it);
        if (it.slot) placeInSlot(it, it.slot, true);
        squash(it, -8);
        app2.audio.sfx("reject");
        if (msg) toast(msg, "tri", it.x, it.y - 30);
      }
      function slotTokens() {
        return g.slots.filter(function(s) {
          return s.role !== "free" && s.item;
        }).map(function(s) {
          return s.item;
        });
      }
      function slotsChanged() {
        var sItem = g.slots[1].item, vItem = g.slots[2].item;
        g.ready = null;
        if (!sItem || !vItem) {
          g.slotErr = null;
          return;
        }
        var its = slotTokens(), T = its.map(tokenOf), r = G.parse(T, cfg);
        if (r.ok && r.kind === "S") {
          var sm0 = slotMult(its.length);
          g.ready = { its, T, r, t: g.t, mult: sm0 };
          g.slotErr = null;
          app2.audio.sfx("ready");
          app2.ui.preview(r.text, "ok", "\u300C\u308F\u308B!\u300D\u3067\u6C7A\u5B9A \xD7" + sm0.toFixed(1) + "(\u8CAF\u3081\u308B\u307B\u3069\u30A2\u30C3\u30D7)");
        } else {
          g.slotErr = r.err;
          app2.ui.preview(T.map(function(t) {
            return G.chunkText(t, cfg);
          }).join(" "), "bad", r.err ? r.err.msg : "");
        }
      }
      function confirmSlots() {
        var rd = g.ready;
        if (!rd) return;
        g.ready = null;
        sentence(rd.its, rd.T, rd.r, rd.mult);
      }
      function sentence(its, T, r, viaSlot) {
        var words = G.wordCount(T), n = T.length;
        its.forEach(function(it, i) {
          it.state = "pop";
          it.popT = -i * 0.07;
          it.inChain = false;
          it.lift = false;
          if (it.slot) {
            var s = it.slot;
            s.item = null;
            it.slot = null;
            it.fromSlot = true;
            g.items.push(it);
          } else if (g.items.indexOf(it) < 0) g.items.push(it);
        });
        if (g.sel && its.indexOf(g.sel.item) >= 0) deselect();
        var base = 20 * words + 35 * (n - 1) + (r.info.front ? 80 : 0) + (r.info.clause ? 150 : 0) + (r.info.coord ? 150 : 0) + its.filter(function(i) {
          return i.star;
        }).length * 40;
        var sm = typeof viaSlot === "number" ? viaSlot : 1, perfect = supply.matchSeed(r.text);
        if (perfect) {
          base = base * 1.5 + 200;
          g.stats.perfect++;
        }
        addCombo(2);
        var pts = Math.round(base * mult() * sm);
        var fi = its.filter(function(i) {
          return !i.fromSlot;
        }), c = fi.length ? centroid(fi) : { x: g.L.W / 2, y: g.L.bar.y - 60 };
        addScore(pts, c.x, c.y - 20, true);
        g.hunger = Math.min(3, g.hunger + 1);
        var shock = aftershock(its, c, words, sm);
        if (M.time) addTime(sentExt(words, typeof viaSlot === "number" ? 1 + (sm - 1) * 0.5 : viaSlot, g.combo, g.playT));
        g.stats.sentences++;
        g.stats.words += words;
        if (words > g.stats.longestN) {
          g.stats.longestN = words;
          g.stats.longest = r.text;
        }
        if (r.info.past) g.stats.past++;
        if (r.info.front) g.stats.front++;
        if (r.info.coord) g.stats.coord++;
        if (r.info.clause) g.stats.clause++;
        if (viaSlot) g.stats.slotS++;
        g.stats.list.push({ text: r.text, words, pts });
        app2.audio.sfx("sentence", Math.min(4, n));
        if (perfect) setTimeout(function() {
          if (!g.dead) app2.audio.sfx("best");
        }, 350);
        speak(r.text, true);
        app2.ui.banner(r.text, r.marks, pts, { slot: sm > 1 ? sm : 0, perfect, shock });
        if (perfect) g.fx.push({ type: "txt", x: g.L.W / 2, y: g.L.field.y + g.L.field.h * 0.3, text: "PERFECT!", t: 0, d: 1.6, big: 2 });
        setExpr("joy", 1.8, true);
        popSegs();
        g.failStreak = 0;
        if (opt.mode === "over") g.overSent = (g.overSent || 0) + 1;
        emit("sentence", { text: r.text, words, points: pts, slot: sm > 1 ? sm : !!viaSlot, info: r.info, perfect, shock });
        app2.ui.preview("", "");
        slotsChanged();
        refill();
        app2.audio.setIntensity(0.35 + Math.min(0.65, g.combo / 20));
      }
      var FUNC = /^(det|q|prep|er|ti|conj|modal|not|deg|tp|sm)$/;
      function aftershock(its, c, words, sm) {
        var R = Math.min(280, (90 + 18 * words) * (sm > 1 ? 1 + (sm - 1) * 0.4 : 1)), n = 0;
        g.items.forEach(function(it) {
          if (its.indexOf(it) >= 0 || it.state !== "idle" || it.inChain || it.kind !== "word" || !FUNC.test(it.word.k) || g.sel && g.sel.item === it) return;
          var d = Math.hypot(it.x - c.x, it.y - c.y);
          if (d > R) return;
          it.state = "pop";
          it.popT = -(0.18 + d / 700);
          n++;
        });
        g.fx.push({ type: "ring", x: c.x, y: c.y, t: 0, d: 0.6, col: Art.COL.prep, big: R });
        if (n) {
          var p = Math.round(8 * n * mult());
          addScore(p);
          g.stats.shock += n;
          g.fx.push({ type: "txt", x: c.x, y: c.y + 30, text: "\u4F59\u6CE2 \xD7" + n, t: 0, d: 1.2 });
        }
        return n;
      }
      function popSegs() {
        var lane = g.L.lane;
        for (var i = 0; i < g.segs; i++) burst(70 + i * 22, lane.y + lane.h / 2, Art.COL.plain, 5);
        g.segs = 0;
        g.chunksSince = 0;
      }
      function mult() {
        var m = 1 + Math.min(g.combo, TUNE.multCap) * TUNE.multStep;
        if (S.hint === "always") m = Math.min(m, 1.8);
        return m;
      }
      function addCombo(n) {
        g.combo += n;
        g.comboT = TUNE.comboWin;
        g.stats.maxCombo = Math.max(g.stats.maxCombo, g.combo);
        if (g.combo >= 5 && g.combo % 5 < n) {
          app2.audio.sfx("combo", Math.floor(g.combo / 5));
          g.fx.push({ type: "txt", x: g.L.W / 2, y: g.L.field.y + 40, text: g.combo + " COMBO!", t: 0, d: 1.1, big: 1 });
        }
      }
      function breakCombo() {
        if (g.combo >= 5) app2.audio.sfx("warn");
        g.combo = 0;
        g.comboT = 0;
        app2.audio.setIntensity(0.25);
      }
      function addScore(p, x, y, big) {
        g.score += p;
        if (x != null) g.fx.push({ type: "txt", x, y, text: "+" + p, t: 0, d: big ? 1.3 : 0.9, big: big ? 1 : 0 });
      }
      function addTime(s) {
        if (!M.time) return;
        var before = g.time;
        g.time = Math.min(M.max, g.time + s);
        if (g.time - before > 0.4) {
          g.fx.push({ type: "time", text: "+" + (g.time - before).toFixed(1) + "\u79D2", t: 0, d: 1 });
          app2.audio.sfx("extend");
        }
      }
      function penalty(s) {
        if (!M.time) return;
        g.time = Math.max(0, g.time - s);
        g.fx.push({ type: "time", text: "\u2212" + s + "\u79D2", t: 0, d: 1, bad: 1 });
      }
      function burst(x, y, col, n) {
        var light = S.lite || app2.reduced;
        n = light ? Math.ceil(n / 3) : n;
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
          g.fx.push({ type: Math.random() < 0.3 ? "star" : "dot", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: 0, d: 0.5 + Math.random() * 0.5, col, s: 2 + Math.random() * 4 });
        }
        g.fx.push({ type: "ring", x, y, t: 0, d: 0.45, col });
      }
      function ghostTo(it, x, y) {
        g.ghosts.push({ spr: spriteOf(it), x0: it.x, y0: it.y, x1: x, y1: y, t: 0, d: 0.2 });
      }
      function toast(msg, kind, x, y) {
        app2.ui.toast(msg, kind);
      }
      function setExpr(e, d, wave) {
        g.expr = e;
        g.exprT = d;
        g.wave = wave ? d : 0;
      }
      function speak(text, full) {
        if (S.voice) app2.audio.speak(text);
      }
      function refreshCand() {
        g.cand = null;
        var mode = S.hint;
        if (mode === "none") return;
        if (mode === "press" && !g.pressHint && !g.drag) return;
        var set = /* @__PURE__ */ new Set(), all = fieldAndSlotItems();
        if (g.chain) {
          var cw = chainWords();
          all.forEach(function(i) {
            if (i.kind === "word" && !i.inChain && G.canAppend(cw, i.word)) set.add(i);
          });
          g.chain.items.forEach(function(i) {
            set.add(i);
          });
        } else if (g.drag && g.drag.items.length) {
          all.forEach(function(i) {
            if (g.drag.items.indexOf(i) >= 0 || i.lift) {
              set.add(i);
              return;
            }
            if (okSeq(g.drag.items.concat([i]))) set.add(i);
          });
        } else if (g.pressHint) {
          var it = g.pressHint;
          set.add(it);
          all.forEach(function(i) {
            if (i === it) return;
            if (it.kind === "word" && i.kind === "word" && G.canAppend([it.word], i.word)) set.add(i);
            else if (it.chunk && i.kind === "word" && G.tryInsert(it.chunk, i.word, cfg)) set.add(i);
            else if (okSeq([it, i])) set.add(i);
          });
        } else if (g.sel) {
          var sc = g.sel.item;
          set.add(sc);
          all.forEach(function(i) {
            if (i.kind === "word" && G.tryInsert(sc.chunk, i.word, cfg)) set.add(i);
          });
        } else return;
        g.cand = set;
      }
      var press = null;
      function hitItem(x, y, slack) {
        for (var i = g.items.length - 1; i >= 0; i--) {
          var it = g.items[i];
          if (it.state === "pop" || it.state === "merge" || it.lift) continue;
          if (Math.hypot(it.x - x, it.y - y) <= it.r * (it.sc || 1) + (slack || 4)) return it;
        }
        var si = slotAt(x, y);
        if (si != null && g.slots[si].item) return g.slots[si].item;
        return null;
      }
      function hitStroke(x, y) {
        var best = null, bd = 1e9;
        fieldAndSlotItems().forEach(function(it) {
          if (it.lift || it.state === "pop" || it.state === "merge" || it.state === "spawn") return;
          var d = Math.hypot(it.x - x, it.y - y), lim = it.slot ? Math.min(it.slot.rect.w, it.slot.rect.h) * 0.45 : Math.max(16, it.r * 0.58);
          if (d < lim && d < bd) {
            bd = d;
            best = it;
          }
        });
        return best;
      }
      function guideBlocks(it, slot) {
        return g.guide && g.guide.allow && !g.guide.allow(it, slot);
      }
      g.down = function(x, y) {
        if (g.state !== "play" || g.noInput) return;
        g.idleT = 0;
        var it = g.ready && g.pill && x >= g.pill.x && x <= g.pill.x + g.pill.w && y >= g.pill.y && y <= g.pill.y + g.pill.h ? null : hitItem(x, y, 6);
        press = { x, y, t: g.t, it, moved: false, long: false, bar: inBar(x, y) && !it };
        if (it) press.longTimer = 0;
      };
      g.move = function(x, y) {
        if (!press) return;
        var nowMs = performance.now();
        (press.s = press.s || []).push({ x, y, t: nowMs });
        if (press.s.length > 10) press.s.shift();
        var dist = Math.hypot(x - press.x, y - press.y);
        if (!press.moved && dist > 10) {
          press.moved = true;
          if (press.bar && g.ready && y < press.y - 20) {
            confirmSlots();
            press = null;
            return;
          }
          if (press.it && !guideBlocks(press.it, "drag")) {
            var it = press.it;
            if (g.chain) {
              if (g.chain.items.indexOf(it) >= 0) {
                var nc = confirmChain();
                it = nc;
              } else if (g.chain.st.complete && !g.chain.st.err) confirmChain();
              else clearChain();
            }
            deselect();
            if (it) {
              g.drag = { items: [it], pts: [{ x, y }], lifted: it };
              lift(it);
              app2.audio.sfx("select");
              strokePreview();
              refreshCand();
              emit("dragStart", { item: it });
            }
          }
        }
        if (g.drag) {
          g.drag.pts.push({ x, y });
          if (g.drag.pts.length > 60) g.drag.pts.shift();
          var d = g.drag, si2 = slotAt(x, y), first = d.items[0];
          d.toKun = inKun(x, y);
          var carry = d.items.length === 1 && (inBar(x, y) || d.toKun) && !(si2 != null && g.slots[si2].item && d.items.indexOf(g.slots[si2].item) > 0) && !(first && first.slot && si2 != null && g.slots[si2] === first.slot && d.items.length > 1);
          if (carry !== !!d.carry) {
            d.carry = carry;
            if (carry) {
              if (!first.lift) lift(first);
              d.lifted = first;
            } else if (d.items.length >= 2 && first.lift) {
              unlift(first);
              d.lifted = null;
            }
            refreshCand();
            if (carry) app2.ui.preview(first.full || first.text, "sel", d.toKun ? "\u30C1\u30E3\u30F3\u30AF\u304F\u3093\u304C\u98DF\u3079\u308B(\u306E\u3053\u308A" + g.hunger + ")" : "\u30B9\u30ED\u30C3\u30C8\u3078\u904B\u3076");
            else strokePreview();
          }
          if (d.lifted && (d.items.length === 1 || d.carry)) {
            var l = d.lifted;
            l.x = x;
            l.y = y - 6;
          }
          if (!d.carry) {
            var h = hitStroke(x, y);
            if (h && h !== d.lifted && d.items.indexOf(h) < 0) {
              if (d.hov !== h) {
                d.hov = h;
                d.hovT = nowMs;
              }
              if (speedOf(press.s) < 0.35 || nowMs - d.hovT > 110) {
                strokeAdd(h);
                d.hov = null;
              }
            } else if (h && h !== d.lifted) strokeAdd(h);
            else if (!h) {
              d.backIt = null;
              d.hov = null;
            }
          }
        }
      };
      function speedOf(sm) {
        if (!sm || sm.length < 2) return 0;
        var a = sm[Math.max(0, sm.length - 4)], b = sm[sm.length - 1], dt = Math.max(1, b.t - a.t);
        return Math.hypot(b.x - a.x, b.y - a.y) / dt;
      }
      function flickOf(p) {
        var sm = p.s;
        if (!sm || sm.length < 2) return 0;
        var b = sm[sm.length - 1], a = sm[0];
        for (var i = sm.length - 1; i >= 0; i--) {
          if (b.t - sm[i].t > 90) break;
          a = sm[i];
        }
        var dt = Math.max(1, b.t - a.t), vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt, dy = b.y - p.y;
        if (Math.abs(vy) < 0.5 || Math.abs(vx) > Math.abs(vy) * 0.8 || Math.abs(dy) < 40 || b.t - sm[0].t > 500) return 0;
        return vy > 0 ? 1 : -1;
      }
      g.up = function(x, y) {
        var p = press;
        press = null;
        if (p && g.drag && g.state === "play") {
          var lastS = p.s && p.s[p.s.length - 1], fl = g.drag.items.length === 1 && lastS && performance.now() - lastS.t < 70 ? flickOf(p) : 0, d0 = g.drag, f0 = d0.items[0];
          if (fl && f0 && !inKun(x, y) && !inBar(x, y)) {
            unliftAll(d0);
            g.drag = null;
            refreshCand();
            if (fl > 0 && !f0.slot) {
              dropToSlot(f0, null, {});
              emit("flick", { item: f0 });
              return;
            }
            if (fl < 0 && f0.slot) {
              var sl0 = f0.slot;
              sl0.item = null;
              f0.slot = null;
              f0.state = "idle";
              f0.x = sl0.rect.x + sl0.rect.w / 2;
              f0.y = g.L.field.y + g.L.field.h - 50;
              f0.vy = -260;
              addItem(f0);
              keepIn(f0);
              app2.audio.sfx("slot");
              slotsChanged();
              return;
            }
          }
          if (g.drag && g.drag.hov) {
            var hh = hitStroke(x, y);
            if (hh === g.drag.hov) strokeAdd(hh);
          }
        }
        g.pressHint = null;
        if (S.hint === "press") refreshCand();
        if (!p || g.state !== "play") {
          if (g.drag) endDrag(x, y);
          return;
        }
        if (g.drag) {
          endDrag(x, y);
          return;
        }
        if (p.long) {
          app2.ui.tip(null);
          return;
        }
        tap(p.it, x, y, p.bar);
      };
      g.cancel = function() {
        press = null;
        if (g.drag) {
          unliftAll(g.drag);
          g.drag = null;
        }
      };
      function longPress(it) {
        press.long = true;
        showTip(it);
        speak(it.full || it.text);
        if (S.hint === "press" && !(g.guide && g.guide.noHint)) {
          g.pressHint = it;
          g.combo = Math.floor(g.combo * 0.7);
          refreshCand();
          setExpr("idea", 0.8);
        }
      }
      function tap(it, x, y, onBar) {
        if (g.ready && g.pill && x >= g.pill.x && x <= g.pill.x + g.pill.w && y >= g.pill.y && y <= g.pill.y + g.pill.h) {
          if (!guideBlocks(null, "confirm")) confirmSlots();
          return;
        }
        if (onBar && g.ready && !it) {
          if (!guideBlocks(null, "confirm")) confirmSlots();
          return;
        }
        var si = slotAt(x, y);
        if (!it && si != null && g.sel && !g.slots[si].item) {
          var sel = g.sel.item;
          if (!guideBlocks(sel, g.slots[si])) {
            deselect();
            dropToSlot(sel, si, {});
          }
          return;
        }
        if (!it) {
          if (g.chain) {
            if (g.chain.items.length < 2) clearChain();
            else if (g.chain.st.complete && !g.chain.st.err) confirmChain();
            else {
              clearChain();
              app2.audio.sfx("scatter");
            }
          }
          deselect();
          return;
        }
        if (guideBlocks(it)) {
          squash(it, -4);
          return;
        }
        if (it.kind === "word") {
          if (it.word.k === "magic") resolveMagic(it);
          if (g.chain && it.inChain) {
            if (G.cycleWord(it.word, cfg)) {
              sizeItem(it);
              squash(it, 9);
              app2.audio.sfx("cycle");
              speak(it.text);
              updateChainState();
              emit("cycle", { item: it });
            } else {
              squash(it, -5);
              app2.audio.sfx("reject");
            }
            return;
          }
          if (g.chain) {
            if (G.canAppend(chainWords(), it.word)) {
              addToChain(it);
              return;
            }
            var cw0 = chainWords();
            for (var pos0 = cw0.length - 1; pos0 >= 0; pos0--) {
              var its0 = g.chain.items.slice(0, pos0).concat([it], g.chain.items.slice(pos0)), fs0 = its0.map(function(i) {
                return i.word.f;
              });
              var st0 = fitForms(its0);
              if (!(st0.prefix && (!st0.complete || !st0.err || !g.chain.st.complete)) && !(st0.complete && (!st0.err || g.chain.st.err))) {
                its0.forEach(function(i, q) {
                  if (i.word.k === "v" && i.word.f !== fs0[q]) {
                    i.word.f = fs0[q];
                    sizeItem(i);
                  }
                });
                continue;
              }
              {
                g.chain.items.splice(pos0, 0, it);
                it.inChain = true;
                g.chain.fixed = true;
                squash(it, 8);
                app2.audio.sfx("insert");
                updateChainState();
                emit("chainAdd", { item: it });
                return;
              }
            }
            if (g.chain.items.length < 2 || g.chain.st.complete && !g.chain.st.err) {
              confirmChain();
              startChain(it);
              return;
            }
            squash(it, -9);
            it.vx += (Math.random() - 0.5) * 120;
            app2.audio.sfx("reject");
            g.chain.last = g.t;
            return;
          }
          if (g.sel && g.sel.item.chunk) {
            if (tryInsertInto(g.sel.item, it)) return;
            deselect();
          }
          if (g.lastMade && /^(adv|er)$/.test(it.word.k) && g.t - g.lastMade.t < 3 && g.items.indexOf(g.lastMade.item) >= 0 && G.tryInsert(g.lastMade.item.chunk, it.word, cfg)) {
            g.sel = { item: g.lastMade.item, t: g.t };
            if (tryInsertInto(g.lastMade.item, it)) {
              g.lastMade.t = g.t;
              deselect();
              return;
            }
            deselect();
          }
          startChain(it);
          return;
        }
        if (g.chain && !g.chain.st.complete || g.chain && g.chain.st.err) {
          var cw1 = chainWords().concat(it.chunk.words || []), st1 = it.chunk.t !== "CL" && G.chainState(cw1, cfg);
          if (st1 && (st1.prefix || st1.complete)) {
            absorb(it);
            return;
          }
        }
        if (g.chain) {
          if (g.chain.st.complete && !g.chain.st.err) confirmChain();
          else clearChain();
        }
        select(it);
      }
      function absorb(ch) {
        var ws = ch.chunk.words.slice(), x = ch.x, y = ch.y;
        removeItem(ch);
        ws.forEach(function(w, k) {
          var wi = newItem("word", w, x + (k - (ws.length - 1) / 2) * 14, y);
          wi.sc = 1;
          wi.state = "idle";
          addItem(wi);
          g.chain.items.push(wi);
          wi.inChain = true;
        });
        app2.audio.sfx("insert");
        updateChainState();
        emit("chainAdd", { item: ch });
      }
      function resolveMagic(it) {
        var cw = chainWords(), kinds = cw.length ? ["n", "adj", "v", "adv", "det", "prep"] : ["n"], pick2 = null;
        U.shuffle(kinds);
        for (var i = 0; i < kinds.length && !pick2; i++) {
          var k = kinds[i], cand = k === "det" ? { k: "det", v: "the" } : k === "prep" ? { k: "prep", v: "in" } : null;
          if (!cand) {
            var pos = { n: "noun", adj: "adj", v: "verb", adv: "adv" }[k], e = app2.dict.getWords({ pos, maxLevel: opt.maxLevel || 2, count: 1, tag: k === "v" ? { simple: 1 } : k === "adv" ? { k: "manner" } : null })[0];
            if (e) cand = { k, e };
          }
          if (cand && (!cw.length || G.canAppend(cw, cand))) pick2 = cand;
        }
        pick2 = pick2 || { k: "n", e: app2.dict.getWords({ pos: "noun", maxLevel: 2, count: 1 })[0] };
        it.word = pick2;
        sizeItem(it);
        burst(it.x, it.y, Art.COL.magic, 12);
        app2.audio.sfx("extend");
      }
      g.useItem = function(name) {
        if (g.state !== "play") return false;
        if (name === "hint") {
          var sol = Supply.solve(fieldAndSlotItems(), cfg, 5e3);
          if (!sol) {
            toast("\u3044\u307E\u306F\u6587\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u2026\u3082\u3046\u5C11\u3057\u5F85\u3063\u3066\u307F\u3088\u3046", "info");
            return false;
          }
          g.hintPath = sol.parts.map(function(p) {
            return p.src;
          });
          g.hintPathT = 7;
          setExpr("idea", 1.5);
          app2.audio.sfx("ready");
          return true;
        }
        if (name === "magic") {
          var m = spawnWord({ k: "magic" });
          m.star = true;
          app2.audio.sfx("extend");
          return true;
        }
        if (name === "auto") {
          if (g.chain) clearChain();
          var cands = Supply.candidates(g.items.filter(function(i) {
            return i.state === "idle";
          }), cfg).filter(function(c) {
            return c.src.length >= 2 && c.src.every(function(i) {
              return i.kind === "word";
            });
          });
          if (!cands.length) {
            toast("\u304F\u3063\u3064\u3051\u3089\u308C\u308B\u5358\u8A9E\u304C\u306A\u3044\u2026", "info");
            return false;
          }
          cands.sort(function(a, b) {
            return b.src.length - a.src.length;
          });
          var pick2 = cands[0].src;
          g.chain = { items: [], last: g.t, t0: g.t };
          pick2.forEach(function(i) {
            g.chain.items.push(i);
            i.inChain = true;
          });
          updateChainState();
          app2.audio.sfx("extend");
          confirmChain();
          return true;
        }
        return false;
      };
      function pickOldWord() {
        var c = g.items.filter(function(i) {
          return i.kind === "word" && i.state === "idle" && !i.inChain && /^(det|q|prep|er|ti|conj|modal|not|deg)$/.test(i.word.k);
        });
        c = c.filter(function(i) {
          return !i.word.sid;
        });
        c.sort(function(a, b) {
          return a.born - b.born;
        });
        return c[0] || null;
      }
      function refill() {
        if (opt.mode === "over" || opt.mode === "tutorial" || !M.target) return;
        var need = (g.target || M.target) - liveCount() - g.spawnQ;
        if (need > 0) g.spawnQ += need;
      }
      g.refill = refill;
      g.update = function(dt) {
        if (g.state === "paused") return;
        g.t += dt;
        if (g.state === "countdown") {
          var before = Math.ceil(g.countT);
          g.countT -= dt;
          var now = Math.ceil(g.countT);
          if (now !== before && now >= 0) {
            app2.ui.count(now > 0 ? String(now) : "\u30B9\u30BF\u30FC\u30C8!");
            app2.audio.sfx("count", now);
          }
          if (g.countT <= 0) {
            g.state = "play";
            app2.audio.music("play");
            app2.audio.setIntensity(0.25);
            emit("start", { mode: g.mode });
          }
        }
        if (SHOT) {
          g.spawnQ = 0;
          if (g.state === "play" || g.state === "countdown") bUpdate(dt);
        } else if (g.spawnQ > 0) {
          g.spawnT -= dt;
          if (g.spawnT <= 0) {
            var sp = specFromSupply();
            if (sp) spawnWord(sp);
            g.spawnQ--;
            g.spawnT = g.state === "countdown" ? 0.06 : 0.14;
          }
        }
        if (!SHOT) physics(dt);
        if (g.state === "play") playUpdate(dt);
        if (g.drag && g.drag.hov && press && press.s) {
          var lp = press.s[press.s.length - 1];
          if (performance.now() - g.drag.hovT > 110 && hitStroke(lp.x, lp.y) === g.drag.hov) {
            strokeAdd(g.drag.hov);
            if (g.drag) g.drag.hov = null;
          }
        }
        if (press && !press.moved && !press.long && press.it && g.t - press.t > 0.45) longPress(press.it);
        g.items.forEach(function(it) {
          if (it.state === "grow") {
            it.scT += dt;
            it.sc = U.E.outBack(U.clamp(it.scT / 0.3, 0, 1));
            if (it.scT >= 0.3) it.state = "idle";
          }
          if (it.state === "pop") {
            it.popT += dt;
            if (it.popT >= 0 && !it.popped) {
              it.popped = true;
              burst(it.x, it.y, Art.COL[it.kind === "chunk" ? chunkCol(it.chunk) : wordCol(it.word)], 14);
              app2.audio.sfx("pop");
            }
          }
        });
        for (var i = g.items.length - 1; i >= 0; i--) if (g.items[i].state === "pop" && g.items[i].popT > 0.05) g.items.splice(i, 1);
        g.ghosts = g.ghosts.filter(function(gh) {
          gh.t += dt;
          return gh.t < gh.d;
        });
        g.fx = g.fx.filter(function(p) {
          p.t += dt;
          if (p.vx != null) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * dt;
            p.vx *= 0.98;
          }
          return p.t < p.d;
        });
        g.marks = g.marks.filter(function(m) {
          m.t += dt;
          return m.t < m.d && g.items.indexOf(m.item) >= 0;
        });
        if (g.exprT > 0) {
          g.exprT -= dt;
          if (g.exprT <= 0) g.expr = "normal";
        }
        if (g.wave > 0) g.wave -= dt;
        g.blinkT -= dt;
        if (g.blinkT < -0.12) g.blinkT = 2 + Math.random() * 3;
        if (g.hintPathT > 0) {
          g.hintPathT -= dt;
          if (g.hintPathT <= 0) g.hintPath = null;
        }
        hud();
      };
      function playUpdate(dt) {
        g.idleT += dt;
        g.playT += dt;
        if (g.chain && !g.drag) {
          var el = g.t - g.chain.last, st = g.chain.st;
          if (st.complete && !st.err && g.chain.items.length >= 2 && el > (st.closed ? 0.6 : 1)) confirmChain();
        }
        if (g.sel && g.t - g.sel.t > 2.5 && !press) deselect();
        if (g.comboT > 0) {
          g.comboT -= dt;
          if (g.comboT <= 0) breakCombo();
        }
        if (M.time) {
          g.time -= dt;
          var sec = Math.ceil(g.time);
          if (sec <= 10 && sec !== g.lastTick && sec > 0) {
            g.lastTick = sec;
            app2.audio.sfx("tick");
          }
          if (g.time <= 10 && g.exprT <= 0) g.expr = "panic";
          if (g.time <= 0) {
            g.time = 0;
            finish("\u304A\u3057\u307E\u3044!");
            return;
          }
        }
        if (opt.mode === "over") {
          g.overT -= dt * (g.failStreak >= 2 ? 1.6 : 1);
          g.overInt = overInterval(g.overSent || 0, g.playT);
          if (g.overT <= 0) {
            g.overT = g.overInt;
            g.spawnQ++;
          }
          if (!supply.feasible(fieldAndSlotItems()).ok && g.spawnQ < 1) g.spawnQ++;
          var cnt = liveCount();
          if (cnt > M.cap) {
            finish("\u3042\u3075\u308C\u305F!");
            return;
          }
        }
        if (g.idleT > 6 && g.exprT <= 0 && g.expr === "normal") {
          setExpr("think", 1.5);
        }
        g.checkT = (g.checkT || 0) - dt;
        if (g.checkT <= 0) {
          g.checkT = 1;
          g.solveT = (g.solveT || 0) + 1;
          if (opt.mode !== "tutorial" && !SHOT) {
            if (opt.mode !== "over") refill();
            if (g.solveT >= 2 && !g.chain && !g.drag && g.spawnQ < 1) {
              g.solveT = 0;
              var its = fieldAndSlotItems();
              if (!Supply.solve(its, cfg, 1500)) {
                var sp = supply.rescue(its);
                if (sp) {
                  if (opt.mode !== "over" && liveCount() >= (g.target || M.target)) {
                    var old = pickOldWord();
                    if (old) {
                      old.state = "pop";
                      old.popT = 0;
                    }
                  }
                  spawnWord(sp);
                  g.rescued = (g.rescued || 0) + 1;
                }
              }
            }
          }
        }
      }
      function finish(text) {
        if (g.state === "over") return;
        g.state = "over";
        g.cancel();
        clearChain();
        deselect();
        app2.audio.sfx("end");
        app2.audio.music(null);
        setExpr(g.stats.sentences ? "joy" : "sad", 9);
        app2.ui.count(text, true);
        emit("end", { mode: g.mode, score: g.score, stats: g.stats });
        setTimeout(function() {
          if (!g.dead) app2.onGameEnd(g);
        }, 1500);
      }
      g.finish = finish;
      g.pause = function() {
        if (g.state === "play" || g.state === "countdown") {
          g.prevState = g.state;
          g.state = "paused";
          g.cancel();
        }
      };
      g.resume = function() {
        if (g.state === "paused") g.state = g.prevState || "play";
      };
      g.destroy = function() {
        g.dead = true;
        app2.ui.tip(null);
        app2.ui.preview("", "");
      };
      function hud() {
        var fill = opt.mode === "over" ? liveCount() / M.cap : null;
        app2.ui.hud({ score: g.score, combo: g.combo, comboT: g.comboT / TUNE.comboWin, mult: mult(), time: M.time ? g.time : null, timeMax: M.max, fill, warn: M.time && g.time <= 10 || fill != null && fill > 0.85 });
      }
      g.draw = function(ctx) {
        var L = g.L, t = g.t;
        drawLane(ctx, L.lane, t);
        drawBar(ctx, L.bar, t);
        var dimSet = g.cand;
        if (g.chain && g.chain.items.length > 1) {
          ctx.save();
          ctx.lineCap = ctx.lineJoin = "round";
          ctx.strokeStyle = "rgba(255,255,255,.95)";
          ctx.lineWidth = 10;
          ctx.shadowColor = "rgba(120,80,200,.5)";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          g.chain.items.forEach(function(i, k2) {
            k2 ? ctx.lineTo(i.x, i.y) : ctx.moveTo(i.x, i.y);
          });
          ctx.stroke();
          ctx.restore();
        }
        if (g.drag && !g.drag.carry && (g.drag.items.length > 1 || !g.drag.lifted)) {
          ctx.save();
          ctx.lineCap = ctx.lineJoin = "round";
          var col = g.drag.ok ? "rgba(255,200,60,.95)" : g.drag.viable === false ? "rgba(160,150,180,.8)" : "rgba(255,255,255,.95)";
          ctx.strokeStyle = col;
          ctx.lineWidth = 12;
          ctx.shadowColor = g.drag.ok ? "rgba(255,170,0,.8)" : "rgba(100,80,180,.4)";
          ctx.shadowBlur = 14;
          ctx.beginPath();
          g.drag.items.forEach(function(i, k2) {
            k2 ? ctx.lineTo(i.x, i.y) : ctx.moveTo(i.x, i.y);
          });
          var lp = g.drag.pts[g.drag.pts.length - 1];
          if (lp) ctx.lineTo(lp.x, lp.y);
          ctx.stroke();
          ctx.restore();
        }
        var order = g.items.slice().sort(function(a, b) {
          return (a.inChain || a.lift ? 1 : 0) - (b.inChain || b.lift ? 1 : 0);
        });
        order.forEach(function(it) {
          if (it.state === "pop" && it.popT >= 0) return;
          var a = dimSet && !dimSet.has(it) ? 0.28 : 1;
          drawItem(ctx, it, a, t);
          if (it.badT && g.t - it.badT < 0.4) ring(ctx, it.x, it.y, it.r + 4, "#ef4d63");
        });
        g.slots.forEach(function(s) {
          if (s.item && !s.item.lift) drawSlotItem(ctx, s, t, dimSet);
        });
        if (g.drag && g.drag.lifted && g.drag.lifted.lift) drawItem(ctx, g.drag.lifted, 0.92, t, 1.12);
        if (g.chain) {
          var st = g.chain.st, el = g.t - g.chain.last, lim = st.complete && !st.err && g.chain.items.length >= 2 ? st.closed ? 0.6 : 1 : 0, k = lim ? U.clamp(1 - el / lim, 0, 1) : 1;
          g.chain.items.forEach(function(i, n) {
            badge(ctx, i.x - i.r * 0.7, i.y - i.r * 0.7, String(n + 1));
          });
          var last = g.chain.items[g.chain.items.length - 1];
          ctx.save();
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.strokeStyle = st.complete ? st.err ? "#ff6b7a" : "#3cc98a" : "#f5a524";
          ctx.beginPath();
          ctx.arc(last.x, last.y, last.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          ctx.stroke();
          ctx.restore();
        }
        if (g.sel) {
          var si = g.sel.item;
          ring(ctx, si.x, si.y, si.r + 6 + Math.sin(t * 8) * 1.5, "#7b5cff");
        }
        if (g.hintPath) g.hintPath.forEach(function(src, n) {
          src.forEach(function(i) {
            ring(ctx, i.x, i.y, i.r + 8 + Math.sin(t * 6) * 2, "#ffb800");
          });
          var a = src[0];
          badge(ctx, a.x + a.r * 0.6, a.y - a.r * 0.8, String(n + 1), "#ffb800");
        });
        g.ghosts.forEach(function(gh) {
          var k2 = U.E.inCubic(gh.t / gh.d), x = U.lerp(gh.x0, gh.x1, k2), y = U.lerp(gh.y0, gh.y1, k2), s = 1 - k2 * 0.7;
          ctx.globalAlpha = 1 - k2 * 0.5;
          ctx.drawImage(gh.spr.cv, x - gh.spr.size * s / 2, y - gh.spr.size * s / 2, gh.spr.size * s, gh.spr.size * s);
          ctx.globalAlpha = 1;
        });
        g.marks.forEach(function(m) {
          var it = m.item, a = Math.min(1, m.t * 5, (m.d - m.t) * 3);
          pill(ctx, it.x, it.y + it.r + 12, m.text, a);
        });
        if (SHOT) drawBob(ctx, t);
        drawFx(ctx);
        if (g.guide && g.guide.draw) g.guide.draw(ctx, t);
      };
      function drawItem(ctx, it, alpha, t, extra) {
        var sp = spriteOf(it), w = Math.sin(t * 2.2 + it.ph) * 0.03, s = (it.sc || 0) * (extra || 1) * (it.inChain ? 1.06 : 1);
        if (s <= 0.01) return;
        var sx = s * (1 + w + it.sq * 0.06), sy = s * (1 - w - it.sq * 0.05);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(it.x, it.y);
        if (it.inChain) {
          ctx.beginPath();
          ctx.arc(0, 0, it.r + 4, 0, 7);
          ctx.fillStyle = "rgba(255,255,255,.55)";
          ctx.fill();
        }
        ctx.scale(sx, sy);
        ctx.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        ctx.restore();
        if (it.word && it.word.k === "magic") {
          ctx.save();
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          ring(ctx, it.x, it.y, it.r + 3, "hsl(" + t * 120 % 360 + ",90%,65%)");
          ctx.restore();
        }
      }
      function drawSlotItem(ctx, s, t, dimSet) {
        var it = s.item, r = Math.min(s.rect.w, s.rect.h) / 2 - 2, sp = spriteOf(it, r), k = 1 + it.sq * 0.05;
        ctx.save();
        ctx.globalAlpha = dimSet && !dimSet.has(it) ? 0.35 : 1;
        ctx.translate(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2);
        ctx.scale(k * s.rect.w / (r * 2.25), k * s.rect.w / (r * 2.25));
        ctx.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        ctx.restore();
        if (g.sel && g.sel.item === it) ring(ctx, it.x, it.y, r + 4, "#7b5cff");
      }
      function drawLane(ctx, lane, t) {
        if (SHOT) return;
        ctx.save();
        var y = lane.y + lane.h * 0.55, segs = SHOT ? 1 : 1 + g.segs, maxLen = lane.w - 140;
        var hov = g.drag && g.drag.toKun;
        Art.chunkKun(ctx, 46, y, { segs, expr: hov ? g.hunger ? "surprise" : "sad" : g.expr, t, blink: g.blinkT < 0 ? 0.1 : 1, scale: 0.6, wave: g.wave > 0, walk: g.chain || g.drag, maxLen });
        for (var i = 0; i < 3; i++) {
          var cx = 22 + i * 15, cy = lane.y + 2, on2 = i < g.hunger;
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, 7);
          ctx.fillStyle = on2 ? "#f2b468" : "rgba(255,255,255,.6)";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = on2 ? "#9c5a1e" : "rgba(150,120,180,.6)";
          ctx.stroke();
          if (on2) {
            ctx.fillStyle = "#6b3a12";
            ctx.fillRect(cx - 2.5, cy - 2, 1.6, 1.6);
            ctx.fillRect(cx + 1, cy + 0.5, 1.6, 1.6);
          }
        }
        if (hov) {
          var k0 = kunPos();
          ctx.beginPath();
          ctx.arc(k0.x, k0.y, 44 + Math.sin(t * 8) * 2, 0, 7);
          ctx.lineWidth = 3;
          ctx.strokeStyle = g.hunger ? "rgba(255,170,60,.9)" : "rgba(239,77,99,.8)";
          ctx.setLineDash([6, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
      function drawBar(ctx, b, t) {
        ctx.save();
        roundRect(ctx, b.x, b.y, b.w, b.h, 18);
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.fill();
        ctx.lineWidth = g.ready ? 3 : 1.5;
        ctx.strokeStyle = g.ready ? "hsl(" + (140 + Math.sin(t * 6) * 20) + ",70%,50%)" : "rgba(140,120,190,.35)";
        ctx.stroke();
        g.slots.forEach(function(s, i) {
          var r = s.rect;
          roundRect(ctx, r.x, r.y, r.w, r.h, 12);
          var acc = g.drag && (g.drag.items.length === 1 || g.drag.carry) && tokenOf(g.drag.items[0]) && accepts(s.role, tokenOf(g.drag.items[0]));
          ctx.fillStyle = acc ? "rgba(255,236,170,.9)" : s.role === "free" ? "rgba(235,230,250,.8)" : "rgba(238,234,248,.95)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = acc ? "#f3b630" : "rgba(150,130,200,.3)";
          ctx.stroke();
          if (!s.item) {
            ctx.fillStyle = "rgba(110,95,150,.75)";
            ctx.font = "700 " + (r.w < 52 ? 9.5 : 10.5) + "px " + Art.FONT_JA;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.ja, r.x + r.w / 2, r.y + r.h / 2);
          }
        });
        g.pill = null;
        if (g.ready) {
          var lab = "\u308F\u308B! \xD7" + g.ready.mult.toFixed(1), pw = 118, ph = 34, px = b.x + b.w / 2 - pw / 2, py = b.y - ph + 6, sc = 1 + Math.sin(t * 7) * 0.04;
          g.pill = { x: px - 6, y: py - 6, w: pw + 12, h: ph + 12 };
          ctx.save();
          ctx.translate(px + pw / 2, py + ph / 2);
          ctx.scale(sc, sc);
          roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 17);
          var gr = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
          gr.addColorStop(0, "#ff9cc2");
          gr.addColorStop(1, "#ff5f95");
          ctx.fillStyle = gr;
          ctx.shadowColor = "rgba(255,80,140,.6)";
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#fff";
          ctx.font = "900 16px " + Art.FONT_JA;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lab, 0, 1);
          ctx.restore();
        }
        if (g.slotErr && g.slots[1].item && g.slots[2].item) {
          ctx.fillStyle = "#e8566a";
          ctx.font = "800 11px " + Art.FONT_JA;
          ctx.textAlign = "right";
          ctx.fillText(g.slotErr.code === "needObj" || g.slotErr.code === "needComp" ? "\u25B3" : "\xD7", b.x + b.w - 8, b.y + 10);
        }
        ctx.restore();
      }
      function drawFx(ctx) {
        g.fx.forEach(function(p) {
          var k = p.t / p.d;
          if (p.type === "dot") {
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = Art.rgb(p.col || Art.COL.plain);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.s * (1 - k * 0.5), 0, 7);
            ctx.fill();
          } else if (p.type === "star") {
            ctx.globalAlpha = 1 - k;
            Art.drawStar(ctx, p.x, p.y, p.s * 1.6, "#fff4b0", Art.rgb(p.col || Art.COL.prep));
          } else if (p.type === "ring") {
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.strokeStyle = Art.rgb(p.col || Art.COL.plain);
            ctx.lineWidth = (p.big ? 6 : 4) * (1 - k) + 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10 + k * (p.big || 50), 0, 7);
            ctx.stroke();
          } else if (p.type === "txt") {
            ctx.globalAlpha = Math.min(1, (1 - k) * 2);
            var fs = p.big === 2 ? 40 + U.E.outBack(Math.min(1, k * 5)) * 6 : p.big ? 26 : 15;
            ctx.font = "900 " + fs + "px " + (p.ja ? Art.FONT_JA : Art.FONT_EN);
            ctx.textAlign = "center";
            ctx.lineWidth = 5;
            ctx.strokeStyle = "rgba(80,40,120,.85)";
            ctx.lineJoin = "round";
            var yy = p.y - k * 40;
            ctx.strokeText(p.text, p.x, yy);
            ctx.fillStyle = p.big ? "#ffd23f" : "#fff";
            ctx.fillText(p.text, p.x, yy);
          } else if (p.type === "mark") {
            ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
            var s = 26 + U.E.outBack(Math.min(1, k * 4)) * 8;
            ctx.lineWidth = 7;
            ctx.lineCap = "round";
            ctx.strokeStyle = p.tri ? "#f5a524" : "#ef4d63";
            ctx.beginPath();
            if (p.tri) {
              ctx.moveTo(p.x, p.y - s);
              ctx.lineTo(p.x + s, p.y + s * 0.7);
              ctx.lineTo(p.x - s, p.y + s * 0.7);
              ctx.closePath();
            } else {
              ctx.moveTo(p.x - s * 0.7, p.y - s * 0.7);
              ctx.lineTo(p.x + s * 0.7, p.y + s * 0.7);
              ctx.moveTo(p.x + s * 0.7, p.y - s * 0.7);
              ctx.lineTo(p.x - s * 0.7, p.y + s * 0.7);
            }
            ctx.stroke();
          } else if (p.type === "time") {
            ctx.globalAlpha = 1 - k;
            ctx.font = "900 16px " + Art.FONT_JA;
            ctx.textAlign = "right";
            ctx.fillStyle = p.bad ? "#ef4d63" : "#20a86b";
            ctx.fillText(p.text, g.L.W - 14, g.L.hudY + 70 + k * 16);
          }
          ctx.globalAlpha = 1;
        });
      }
      function ring(ctx, x, y, r, col) {
        ctx.save();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
      function badge(ctx, x, y, s, col) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, 7);
        ctx.fillStyle = col || "#6c4bd6";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "900 11px " + Art.FONT_EN;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, x, y + 0.5);
        ctx.restore();
      }
      function pill(ctx, x, y, text, a) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = "700 12px " + Art.FONT_JA;
        var w = ctx.measureText(text).width + 16;
        roundRect(ctx, x - w / 2, y - 10, w, 20, 10);
        ctx.fillStyle = "rgba(70,50,110,.82)";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x, y + 0.5);
        ctx.restore();
      }
      function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      function shotMerge() {
        return null;
      }
      function knock() {
      }
      function shotEnd(a) {
        a.shot = null;
      }
      function shotHit() {
      }
      var B = { cells: {}, par: 0, R: 24, D: 48, RH: 42, top: 0, queue: [], proj: null, aimP: null, shots: 0, falls: [], inv: { pierce: 1, warp: 1, bomb: 1 }, arm: null, nextRow: 20 };
      g.bob = B;
      var LV = opt.level || 0, MAXL = opt.maxLevel || 2;
      function bGeo() {
        var f = g.L.field;
        B.D = f.w / 8;
        B.R = B.D / 2;
        B.RH = B.D * 0.87;
        B.top = f.y + 2;
      }
      function bCols(r) {
        return (r + B.par) % 2 ? 7 : 8;
      }
      function bPos(r, c) {
        var f = g.L.field;
        return { x: f.x + B.R + c * B.D + ((r + B.par) % 2 ? B.R : 0), y: B.top + B.R + r * B.RH };
      }
      function bKey(r, c) {
        return r * 16 + c;
      }
      function bGet(r, c) {
        return B.cells[bKey(r, c)] || null;
      }
      function bNb(r, c) {
        var sh = (r + B.par) % 2, out = [[r, c - 1], [r, c + 1]], d = sh ? [0, 1] : [-1, 0];
        [r - 1, r + 1].forEach(function(rr) {
          d.forEach(function(dc) {
            out.push([rr, c + dc]);
          });
        });
        return out.filter(function(p) {
          return p[0] >= 0 && p[1] >= 0 && p[1] < bCols(p[0]);
        });
      }
      function bNbItems(it) {
        return bNb(it.gr.r, it.gr.c).map(function(p) {
          return bGet(p[0], p[1]);
        }).filter(Boolean);
      }
      function bFit(it) {
        if (it.label) it.text = it.label;
        it.r = B.R - 1;
        it.fs = Math.min(it.fs, 12);
        var w = Art.measure(it.text, it.fs), lim = B.D - 7;
        if (w > lim) it.fs = Math.max(7, it.fs * lim / w);
        it.face = "";
        it.spr = null;
      }
      function bPlace(it, r, c) {
        var p = bPos(r, c);
        it.vx = it.vy = 0;
        it.gr = { r, c };
        it.state = "idle";
        it.sc = 1;
        B.cells[bKey(r, c)] = it;
        if (g.items.indexOf(it) < 0) {
          it.x = p.x;
          it.y = p.y;
          g.items.push(it);
        }
        bFit(it);
      }
      function bRemove(it) {
        if (it.gr) {
          delete B.cells[bKey(it.gr.r, it.gr.c)];
          it.gr = null;
        }
      }
      function bAll() {
        var o = [];
        for (var k in B.cells) o.push(B.cells[k]);
        return o;
      }
      function bRows() {
        return Math.max(6, Math.floor((bDanger() - B.top - B.D) / B.RH) + 1);
      }
      function pick(a) {
        return a[Math.floor(Math.random() * a.length)];
      }
      var POOL = null;
      function pool() {
        if (POOL) return POOL;
        var D = app2.dict, lvOk = function(e) {
          return (e.lv || 1) <= MAXL;
        };
        POOL = {
          n: D.all("noun").filter(function(e) {
            return lvOk(e) && (e.cat !== "time" || e.prep);
          }),
          v: D.all("verb").filter(function(e) {
            return lvOk(e) && !e.tail && e.fr !== "cl" && !e.cv && !e.link;
          }),
          adj: D.all("adj").filter(lvOk),
          adv: D.all("adv").filter(function(e) {
            return e.k === "manner";
          })
        };
        return POOL;
      }
      function bContent() {
        var P = pool(), cnt = { n: 0, v: 0, adj: 0, adv: 0 }, tot = 0, TG = { n: 0.4, v: 0.25, adj: 0.2, adv: 0.15 };
        bAll().concat(B.newbies || []).forEach(function(it) {
          if (it.word && cnt[it.word.k] != null) {
            cnt[it.word.k]++;
            tot++;
          }
        });
        var ks = ["n", "v", "adj", "adv"], w = ks.map(function(k) {
          return Math.max(0.15, TG[k] * (tot + 4) - cnt[k]);
        }), sum = w.reduce(function(a, b) {
          return a + b;
        }, 0), x = Math.random() * sum, kk = "n";
        for (var i = 0; i < ks.length; i++) {
          x -= w[i];
          if (x <= 0) {
            kk = ks[i];
            break;
          }
        }
        var r = kk === "n" ? 0 : kk === "v" ? 0.5 : kk === "adj" ? 0.8 : 0.95;
        if (r < 0.4) {
          var pn = Math.random() < 0.4 ? P.n.filter(function(e) {
            return e.prep;
          }) : P.n, n = pick(pn.length ? pn : P.n), pl = n.c === "c" && Math.random() < 0.2;
          return { k: "n", e: n, pl };
        }
        if (r < 0.66) {
          var v = pick(P.v), f = "base";
          if (LV >= 1) {
            var q = Math.random();
            f = q < 0.5 ? "base" : q < 0.75 ? "ing" : "pp";
            if (f === "pp" && v.fr === "intr" && Math.random() < 0.5) f = "base";
          }
          return { k: "v", e: v, f };
        }
        if (r < 0.86) return { k: "adj", e: pick(P.adj) };
        return { k: "adv", e: pick(P.adv) };
      }
      function bNew(sp) {
        var it = sp.chunk ? newItem("chunk", sp.chunk, 0, 0) : newItem("word", sp, 0, 0);
        it.state = "idle";
        it.sc = 1;
        return it;
      }
      var AUX = [["modal", "can"], ["modal", "will"], ["modal", "must"], ["modal", "should"], ["modal", "may"], ["sm", "want to"], ["sm", "have to"], ["sm", "need to"], ["sm", "be going to"]];
      var PRONS = ["i", "you", "he", "she", "we", "they"];
      var PAL = [["art", "\u51A0\u8A5E", [null]], ["prep", "\u524D\u7F6E\u8A5E", ["in", "at", "on", "to", "with", "for"]], ["pron", "\u4EE3\u540D\u8A5E", ["i", "you", "he", "she", "we", "they"]], ["modal", "\u52A9\u52D5\u8A5E", ["can", "will", "must", "should", "may"]], ["sm", "want to\u7B49", ["want to", "have to", "need to", "be going to"]], ["be", "be", [null]], ["have", "have", [null]]];
      B.sel = { cat: "art", v: null };
      B.last = {};
      B.open = null;
      function makeBall(sel) {
        var sp, label = null, kind = sel.cat;
        if (kind === "art") {
          sp = { k: "det", v: "a" };
          label = "a/the";
        } else if (kind === "prep") sp = { k: "prep", v: sel.v || "in" };
        else if (kind === "pron") sp = { k: "pr", v: sel.v || "i" };
        else if (kind === "modal" || kind === "sm") {
          sp = { k: kind, v: sel.v || (kind === "modal" ? "can" : "want to"), t: "pres" };
          kind = "aux";
        } else if (kind === "be") sp = { k: "be", v: "pres" };
        else sp = { k: "hv", v: "pres" };
        var it = bNew(sp);
        it.ball = kind;
        it.label = label;
        it.col = [];
        bFit(it);
        return it;
      }
      function prepFits(p, e) {
        if (e.prep) return p === e.prep || p === "to" && e.cat === "place";
        if (e.cat === "person" || e.cat === "animal") return /^(with|for|to)$/.test(p);
        return /^(with|for)$/.test(p);
      }
      function prepHint(e) {
        return e.prep ? e.prep + (e.cat === "place" ? " / to" : "") : e.cat === "person" || e.cat === "animal" ? "with / for / to" : "with / for";
      }
      function nounOK(it) {
        return it && it.kind === "word" && it.word.k === "n";
      }
      function verbOK(it, kind) {
        if (!it || it.kind !== "word" || it.word.k !== "v") return false;
        var f = it.word.f || "base", v = it.word.e;
        if (LV === 0) return kind !== "be" || v.fr !== "cl";
        if (kind === "aux") return f === "base";
        if (kind === "be") return f === "ing" || f === "pp" && v.fr !== "intr";
        if (kind === "have") return f === "pp";
        return false;
      }
      function targetOK(ball, t) {
        return ball === "art" || ball === "prep" || ball === "pron" ? nounOK(t) : verbOK(t, ball);
      }
      function cs(ws) {
        var st = G.chainState(ws, cfg);
        return st.complete && !st.err ? st.chunk : null;
      }
      function buildFor(ball, t, mods) {
        var res = null;
        if (ball.ball === "art" || ball.ball === "pron" || ball.ball === "prep") {
          var n = t.word, adjs = n.e.cat === "time" ? [] : mods.filter(function(m) {
            return m.word.k === "adj";
          }).slice(0, 2), sets = [adjs, adjs.slice(0, 1)];
          var heads = ball.ball === "art" ? [[{ k: "det", v: "a" }], [{ k: "det", v: "the" }]] : ball.ball === "pron" ? [[{ k: "pr", v: ball.word.v }]] : [[], [{ k: "det", v: "the" }], [{ k: "det", v: "a" }]].map(function(d) {
            return [{ k: "prep", v: ball.word.v }].concat(d);
          });
          for (var i = 0; i < sets.length && !res; i++) for (var h = 0; h < heads.length && !res; h++) {
            var ws = heads[h].concat(sets[i].map(function(m) {
              return m.word;
            }), [n]), c = cs(ws);
            if (c) res = { chunk: c, used: sets[i] };
          }
        } else {
          var v = JSON.parse(JSON.stringify({ k: "v", f: t.word.f }));
          v.e = t.word.e;
          if (LV === 0) v.f = ball.ball === "be" ? "ing" : ball.ball === "have" ? "pp" : "base";
          var advs = mods.filter(function(m) {
            return m.word.k === "adv";
          }).slice(0, 2), sets2 = [advs, advs.slice(0, 1)];
          for (var j = 0; j < sets2.length && !res; j++) {
            var c2 = cs([ball.word, v].concat(sets2[j].map(function(m) {
              return m.word;
            })));
            if (c2) res = { chunk: c2, used: sets2[j] };
          }
        }
        return res;
      }
      function bFrontier() {
        return bAll().filter(function(it) {
          return bNb(it.gr.r, it.gr.c).some(function(p) {
            return !bGet(p[0], p[1]);
          });
        });
      }
      function bFillQueue() {
        while (B.queue.length < 1) B.queue.push(makeBall(B.sel));
      }
      g.bobSelect = function(c, v) {
        bSelect(c, v);
      };
      function bSelect(cat, v) {
        B.sel = { cat, v };
        B.last[cat] = v;
        var cur = B.queue[0];
        if (cur && cur.ball === "chunk") {
          var L = bLauncher();
          toSlot(cur.chunk, L.x, L.y, cur.home);
          slotsChanged();
        }
        B.queue = [makeBall(B.sel)];
        app2.audio.sfx("cycle");
      }
      function bSlots(maxR) {
        var o = [];
        for (var r = 0; r < (maxR || 14); r++) for (var c = 0; c < bCols(r); c++) {
          if (bGet(r, c)) continue;
          if (r === 0 || bNb(r, c).some(function(p) {
            return bGet(p[0], p[1]);
          })) o.push([r, c]);
        }
        return o;
      }
      function bTerrain() {
        var lim = Math.max(3, Math.round(bRows() * 0.4));
        for (var c = 0; c < bCols(0); c++) if (Math.random() < 0.8) bPlace(bNew(bContent()), 0, c);
        for (var r = 1; r < lim; r++) for (var c2 = 0; c2 < bCols(r); c2++) {
          var up = bNb(r, c2).filter(function(p) {
            return p[0] === r - 1 && bGet(p[0], p[1]);
          }).length;
          if (up && Math.random() < 0.5 + up * 0.15 - r * 0.06) bPlace(bNew(bContent()), r, c2);
        }
        for (var t = 0; t < 40 && bAll().length < 20; t++) {
          var sl = bSlots(lim);
          if (!sl.length) break;
          var pk = pick(sl);
          bPlace(bNew(bContent()), pk[0], pk[1]);
        }
      }
      function bGarbage(n) {
        var lim = bRows() - 3;
        for (var i = 0; i < n; i++) {
          var sl = bSlots(lim);
          if (!sl.length) break;
          var pk = pick(sl), it = bNew(bContent()), p = bPos(pk[0], pk[1]);
          it.x = p.x;
          it.y = g.L.field.y - 30 - i * 30;
          it.garb = 1;
          bPlace(it, pk[0], pk[1]);
        }
        app2.audio.sfx("tick");
      }
      function bPushRow() {
        var old = B.cells;
        B.cells = {};
        B.par ^= 1;
        for (var k in old) {
          var it = old[k];
          it.gr.r++;
          B.cells[bKey(it.gr.r, it.gr.c)] = it;
        }
        for (var c = 0; c < bCols(0); c++) if (Math.random() < 0.75) {
          var n = bNew(bContent()), p = bPos(0, c);
          n.x = p.x;
          n.y = p.y - B.RH;
          bPlace(n, 0, c);
        }
        app2.audio.sfx("warn");
        g.fx.push({ type: "txt", x: g.L.W / 2, y: g.L.field.y + 40, text: "\u5929\u4E95\u304C\u4E0B\u304C\u3063\u305F!", t: 0, d: 1, ja: 1 });
      }
      var ITEM_JA = { pierce: "\u8CAB\u901A", warp: "\u30EF\u30FC\u30D7", bomb: "\u30DC\u30E0" };
      function bPushBack() {
        var all = bAll();
        if (all.length) {
          var mr = Math.max.apply(null, all.map(function(i) {
            return i.gr.r;
          }));
          all.filter(function(i) {
            return i.gr.r === mr;
          }).forEach(function(i) {
            bRemove(i);
            i.state = "pop";
            i.popT = -0.1;
          });
        }
        g.fx.push({ type: "txt", x: g.L.W / 2, y: g.L.field.y + 70, text: "\u304A\u3057\u304B\u3048\u3057\u305F!", t: 0, d: 1.2, ja: 1 });
        bDrop();
        var k = pick(["pierce", "warp", "bomb"]);
        B.inv[k]++;
        g.fx.push({ type: "txt", x: 70, y: g.L.lane.y - 10, text: ITEM_JA[k] + " +1", t: 0, d: 1.4, ja: 1 });
      }
      function bInit() {
        bGeo();
        B.cells = {};
        B.par = 0;
        bTerrain();
        bAll().forEach(function(it, i) {
          it.sc = 0;
          it.state = "grow";
          it.scT = -i * 0.012;
        });
        bFillQueue();
      }
      function bLauncher() {
        var lane = g.L.lane;
        return { x: lane.x + lane.w / 2, y: lane.y + lane.h * 0.7 };
      }
      function bItemPos(i) {
        var lane = g.L.lane;
        return { x: 28 + i * 40, y: lane.y + lane.h * 0.7, r: 17 };
      }
      function palRect(i) {
        var lane = g.L.lane, w = (lane.w - 12) / PAL.length;
        return { x: lane.x + 6 + i * w + 2, y: lane.y + 26, w: w - 4, h: 28 };
      }
      function optRect(j, n) {
        var lane = g.L.lane, w = Math.min(64, (lane.w - 12) / n);
        return { x: lane.x + (lane.w - w * n) / 2 + j * w + 2, y: lane.y - 30, w: w - 4, h: 28 };
      }
      function inR(r, x, y) {
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      }
      function bDanger() {
        return g.L.lane.y - 4;
      }
      function bDir(x, y) {
        var L = bLauncher(), dx = x - L.x, dy = y - L.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        if (uy > -0.18) {
          uy = -0.18;
          ux = (ux >= 0 ? 1 : -1) * Math.sqrt(1 - uy * uy);
        }
        return { ux, uy };
      }
      function bAfterShot() {
        B.shots++;
        if (B.shots % 3 === 0) bGarbage(Math.min(6, 2 + Math.floor(B.shots / 25)));
        if (B.shots >= B.nextRow) {
          bPushRow();
          B.nextRow = B.shots + Math.max(10, 16 - Math.floor(B.shots / 40) * 2);
        }
        if (bAll().length < 10) bGarbage(6);
        bCheckOver();
      }
      function bFire(dir, x, y) {
        if (B.proj) return;
        var L = bLauncher(), arm = B.arm;
        B.arm = null;
        if (arm === "pierce" || arm === "bomb") {
          B.inv[arm]--;
          B.proj = { special: arm, x: L.x, y: L.y, vx: dir.ux * 1250, vy: dir.uy * 1250 };
          app2.audio.sfx("link", 4);
          return;
        }
        if (!B.queue.length) return;
        var it = B.queue.shift();
        bFillQueue();
        it.col = it.col || [];
        if (arm === "warp") {
          B.inv.warp--;
          bWarp(it, x, y);
          return;
        }
        it.x = L.x;
        it.y = L.y;
        it.sc = 1;
        it.state = "idle";
        g.items.push(it);
        B.proj = { it, vx: dir.ux * 1150, vy: dir.uy * 1150 };
        app2.audio.sfx("link", 3);
        emit("shot", { item: it });
      }
      function bWarp(it, x, y) {
        var kind = ballKind(it), best = null, bd = 1e9;
        bAll().forEach(function(o) {
          if (!isTarget(kind, o, it)) return;
          var d = Math.hypot(o.x - x, o.y - y);
          if (d < bd) {
            bd = d;
            best = o;
          }
        });
        it.x = best ? best.x : x;
        it.y = best ? best.y : y;
        burst(it.x, it.y, Art.COL.magic, 14);
        app2.audio.sfx("extend");
        g.items.push(it);
        bEnd(it, best, null);
      }
      function ballKind(ball) {
        if (ball.ball !== "chunk") return ball.ball;
        var t = ball.chunk.t;
        return t === "NP" ? "np" : t === "PP" ? "pp" : t === "VP" ? "vp" : "other";
      }
      function modOf(kind) {
        return /^(art|pron|prep|np|pp)$/.test(kind) ? "adj" : /^(aux|be|have|vp)$/.test(kind) ? "adv" : null;
      }
      function verbAlone(t) {
        if (!t || t.kind !== "word" || t.word.k !== "v") return null;
        var v = JSON.parse(JSON.stringify({ k: "v", f: LV === 0 ? "base" : t.word.f }));
        v.e = t.word.e;
        return cs([v]);
      }
      function isTarget(kind, t, ball) {
        if (!t || t.kind !== "word") return false;
        if (kind === "prep") return t.word.k === "n" && (!ball || prepFits(ball.word.v, t.word.e));
        if (kind === "pron") return t.word.k === "n" && t.word.e.cat !== "time" && !/^[A-Z]/.test(t.word.e.w);
        if (kind === "art" || kind === "vp") return t.word.k === "n";
        if (kind === "aux" || kind === "have") return verbOK(t, kind);
        if (kind === "be") return verbOK(t, "be") || t.word.k === "adj";
        if (kind === "np" || kind === "pp") return !!verbAlone(t);
        return false;
      }
      function targetOK(kind, t, ball) {
        return isTarget(kind, t, ball);
      }
      function growChunk(ch, cols) {
        if (!cols.length) return ch;
        var ws = ch.words.slice();
        if (ch.t === "VP") {
          var nv = ws.filter(function(w) {
            return w.k === "adv";
          }).length;
          ws = ws.concat(cols.map(function(c) {
            return c.word;
          }).slice(0, Math.max(0, 2 - nv)));
        } else {
          var ni = -1, na = ws.filter(function(w) {
            return w.k === "adj";
          }).length;
          ws.forEach(function(w, i) {
            if (w.k === "n") ni = i;
          });
          if (ni < 0) return ch;
          var add = cols.map(function(c) {
            return c.word;
          }).slice(0, Math.max(0, 2 - na));
          if (!add.length) return ch;
          ws = ws.slice(0, ni).concat(add, ws.slice(ni));
        }
        return cs(ws) || ch;
      }
      function toSlot(ch, x, y, role) {
        var sl = role && g.slots.filter(function(z) {
          return z.role === role && accepts(z.role, ch) && !z.item;
        })[0] || role && g.slots.filter(function(z) {
          return z.role === role && accepts(z.role, ch);
        })[0] || freeSlotFor(ch) || g.slots.filter(function(z) {
          return accepts(z.role, ch);
        })[0];
        if (!sl) return;
        if (sl.item) {
          var old = sl.item;
          sl.item = null;
          old.slot = null;
          burst(sl.rect.x + sl.rect.w / 2, sl.rect.y + sl.rect.h / 2, [200, 190, 230], 8);
        }
        var ci = newItem("chunk", ch, x, y);
        ci.sc = 1;
        ci.state = "idle";
        placeInSlot(ci, sl);
      }
      function popBubble(o, pts) {
        bRemove(o);
        var i = g.items.indexOf(o);
        if (i >= 0) g.items.splice(i, 1);
        burst(o.x, o.y, Art.COL[wordCol(o.word)] || Art.COL.noun, 8);
        if (pts) addScore(Math.round(pts * mult()), o.x, o.y - 20);
      }
      function relabel(ball) {
        var base = ball.ball === "chunk" ? G.chunkText(ball.chunk, cfg) : ball.label || ball.text;
        ball.label = ball.col.length ? base + " +" + ball.col.map(function(c) {
          return c.text;
        }).join(" ") : ball.ball === "chunk" ? null : ball.label;
        bFit(ball);
      }
      function bStep(dt) {
        var P = B.proj;
        if (!P) return;
        var f = g.L.field, it = P.it || P, n = Math.ceil(Math.hypot(P.vx, P.vy) * dt / 5);
        for (var i = 0; i < n; i++) {
          it.x += P.vx * dt / n;
          it.y += P.vy * dt / n;
          if (it.x < f.x + B.R) {
            it.x = f.x + B.R;
            P.vx = Math.abs(P.vx);
            app2.audio.sfx("tap", 2);
          }
          if (it.x > f.x + f.w - B.R) {
            it.x = f.x + f.w - B.R;
            P.vx = -Math.abs(P.vx);
            app2.audio.sfx("tap", 2);
          }
          var all = bAll(), touch = null;
          for (var j = 0; j < all.length; j++) if (Math.hypot(all[j].x - it.x, all[j].y - it.y) < B.D * 0.86) {
            touch = all[j];
            break;
          }
          if (P.special === "pierce") {
            if (touch) popBubble(touch, 5);
            if (it.y < B.top - B.R) {
              B.proj = null;
              bDrop();
              bAfterShot();
              return;
            }
            continue;
          }
          if (P.special === "bomb") {
            if (touch || it.y <= B.top + B.R) {
              B.proj = null;
              bBomb(it.x, it.y);
              bAfterShot();
              return;
            }
            continue;
          }
          if (it.y <= B.top + B.R) {
            bEnd(P.it, null);
            return;
          }
          if (!touch) continue;
          var kind = ballKind(P.it), mod = modOf(kind);
          if (touch.kind === "word" && touch.word.k === mod && P.it.col.length < 2 && !isTarget(kind, touch, P.it)) {
            P.it.col.push(touch);
            popBubble(touch, 5);
            app2.audio.sfx("link", P.it.col.length);
            relabel(P.it);
            continue;
          }
          bEnd(P.it, isTarget(kind, touch, P.it) ? touch : null, touch);
          return;
        }
      }
      function bEnd(ball, t, hitWrong) {
        B.proj = null;
        var kind = ballKind(ball), x = ball.x, y = ball.y, gi = g.items.indexOf(ball);
        if (gi >= 0) g.items.splice(gi, 1);
        var made = [];
        if (t) {
          if (kind === "np" || kind === "pp") {
            var vp = verbAlone(t);
            if (vp) {
              made.push([growChunk(ball.chunk, ball.col), kind === "np" ? "S" : "P"], [vp, "V"]);
            }
          } else if (kind === "vp") {
            var np = null;
            [[{ k: "det", v: "a" }], [{ k: "det", v: "the" }], []].some(function(h) {
              np = cs(h.concat([t.word]));
              return !!np;
            });
            if (np) made.push([growChunk(ball.chunk, ball.col), "V"], [np, "O"]);
          } else if (kind === "be" && t.word.k === "adj") {
            var bv = cs([{ k: "be", v: "pres" }].concat(ball.col.map(function(c) {
              return c.word;
            }))) || cs([{ k: "be", v: "pres" }]), ap = cs([t.word]);
            if (bv && ap) made.push([bv, "V"], [ap, "O"]);
          } else {
            var r = buildFor(ball, t, ball.col);
            if (r && kind === "art" && !r.chunk.words.some(function(w) {
              return w.k === "det";
            })) r = null;
            if (r) made.push([r.chunk, null]);
            else hitWrong = t;
          }
        }
        if (made.length) {
          var jk = bNbItems(t).filter(function(o) {
            return o.junk;
          });
          jk.forEach(function(o) {
            popBubble(o, 20);
          });
          if (jk.length) g.fx.push({ type: "txt", x: t.x, y: t.y + 24, text: "\u3058\u3083\u307E\u7389\u3082\u6D88\u3048\u305F!", t: 0, d: 1, ja: 1 });
          popBubble(t, 0);
          var words = 0, txt = [];
          made.forEach(function(m) {
            toSlot(m[0], x, y, m[1]);
            words += (m[0].words || []).length;
            txt.push(G.chunkText(m[0], cfg));
          });
          g.stats.chunks++;
          addCombo(1);
          addScore(Math.round(10 * words * words * mult()), x, y - 30);
          var say = txt.join(" ");
          app2.audio.sfx("chunk", Math.min(6, words));
          speak(say);
          burst(x, y, Art.COL[chunkCol(made[0][0])], 14 + words * 3);
          g.fx.push({ type: "txt", x: g.L.W / 2, y: y - 34, text: say, t: 0, d: 1.3 });
          slotsChanged();
          emit("chunk", { chunk: made[0][0], n: words });
        } else if (ball.ball === "chunk") {
          var gc = growChunk(ball.chunk, ball.col);
          toSlot(gc, x, y, ball.home);
          slotsChanged();
          if (ball.col.length) {
            speak(G.chunkText(gc, cfg));
            addScore(Math.round(10 * gc.words.length * mult()), x, y);
          } else {
            app2.audio.sfx("reject");
            g.fx.push({ type: "txt", x, y: y - 20, text: "\u3082\u3069\u3063\u305F", t: 0, d: 0.8, ja: 1 });
          }
        } else {
          var best = null, bd = 1e9;
          bSlots().forEach(function(p) {
            var q = bPos(p[0], p[1]), d = Math.hypot(q.x - x, q.y - y);
            if (d < bd) {
              bd = d;
              best = p;
            }
          });
          app2.audio.sfx("reject");
          breakCombo();
          var hint = missHint(kind, hitWrong, ball);
          if (best) {
            ball.x = x;
            ball.y = y;
            ball.junk = 1;
            ball.col = [];
            bPlace(ball, best[0], best[1]);
            squash(ball, -8);
          }
          g.fx.push({ type: "txt", x: Math.min(g.L.W - 90, Math.max(90, x)), y: y + 34, text: hint, t: 0, d: 2.2, ja: 1 });
        }
        bDrop();
        bAfterShot();
      }
      function missHint(kind, t, ball) {
        if (!t || t.kind !== "word") return "\u30DF\u30B9:\u3042\u305F\u308B\u76F8\u624B\u304C\u3044\u306A\u3044";
        var k = t.word.k, w = t.text;
        if (kind === "prep" && k === "n") return w + " \u306B\u306F " + prepHint(t.word.e);
        if ((kind === "art" || kind === "pron") && k === "n") return w + " \u306B\u306F " + (kind === "art" ? "\u51A0\u8A5E" : "my / his \u306A\u3069") + "\u306F\u3064\u3051\u306A\u3044";
        if ((kind === "art" || kind === "pron" || kind === "prep") && k !== "n") return "\u3053\u306E\u7389\u306F\u540D\u8A5E\u306B\u5F53\u3066\u3088\u3046";
        if (kind === "aux" || kind === "be" || kind === "have") {
          if (k !== "v") return kind === "be" ? "be \u306F -ing\u5F62\u306E\u52D5\u8A5E\u304B\u5F62\u5BB9\u8A5E\u306B" : "\u3053\u306E\u7389\u306F\u52D5\u8A5E\u306B\u5F53\u3066\u3088\u3046";
          var f = t.word.f || "base";
          return f === "ing" ? w + " \u306B\u306F be" : f === "pp" ? w + " \u306B\u306F have(be \u306A\u3089\u53D7\u3051\u8EAB)" : w + " \u306B\u306F can / want to \u306A\u3069";
        }
        return "\u30DF\u30B9";
      }
      function bBomb(x, y) {
        var n = 0;
        bAll().forEach(function(o) {
          if (Math.hypot(o.x - x, o.y - y) < B.D * 2.1) {
            bRemove(o);
            o.state = "pop";
            o.popT = -Math.hypot(o.x - x, o.y - y) / 900;
            n++;
          }
        });
        g.fx.push({ type: "ring", x, y, t: 0, d: 0.5, col: Art.COL.magic, big: B.D * 2.2 });
        app2.audio.sfx("sentence", 2);
        addScore(Math.round(8 * n * mult()), x, y);
        bDrop();
      }
      function bDrop() {
        bAll().forEach(function(it) {
          if (it.state === "pop") bRemove(it);
        });
        var ok = {}, st = [];
        for (var c = 0; c < bCols(0); c++) if (bGet(0, c)) {
          ok[bKey(0, c)] = 1;
          st.push([0, c]);
        }
        while (st.length) {
          var p = st.pop();
          bNb(p[0], p[1]).forEach(function(q) {
            var k = bKey(q[0], q[1]);
            if (!ok[k] && B.cells[k]) {
              ok[k] = 1;
              st.push(q);
            }
          });
        }
        var n = 0;
        bAll().forEach(function(it) {
          var k = bKey(it.gr.r, it.gr.c);
          if (!ok[k]) {
            bRemove(it);
            it.state = "fall";
            it.vy = -60 - Math.random() * 100;
            it.vx = (Math.random() - 0.5) * 100;
            B.falls.push(it);
            n++;
          }
        });
        if (n) {
          var pts = Math.round(20 * n * n * mult());
          addScore(pts, g.L.W / 2, g.L.field.y + g.L.field.h * 0.5, true);
          g.fx.push({ type: "txt", x: g.L.W / 2, y: g.L.field.y + g.L.field.h * 0.45, text: n + "\u3053 \u304A\u3068\u3057\u305F!", t: 0, d: 1.2, ja: 1 });
          app2.audio.sfx("extend");
        }
      }
      function bCheckOver() {
        var dy = bDanger();
        if (bAll().some(function(it) {
          return bPos(it.gr.r, it.gr.c).y + B.R > dy;
        })) finish("\u3042\u3075\u308C\u305F!");
      }
      function bUpdate(dt) {
        bStep(dt);
        bAll().forEach(function(it) {
          if (it.state === "pop") {
            bRemove(it);
            return;
          }
          var p = bPos(it.gr.r, it.gr.c), k = it.garb ? Math.min(1, dt * 7) : Math.min(1, dt * 12);
          it.x += (p.x - it.x) * k;
          it.y += (p.y - it.y) * k;
          if (Math.abs(p.y - it.y) < 1) it.garb = 0;
        });
        B.falls = B.falls.filter(function(it) {
          it.vy += 1400 * dt;
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          if (it.y > g.L.H + 60) {
            var i = g.items.indexOf(it);
            if (i >= 0) g.items.splice(i, 1);
            return false;
          }
          return true;
        });
      }
      function drawBob(ctx, t) {
        if (!g.L) return;
        var L = bLauncher(), f = g.L.field, dy = bDanger();
        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = "rgba(239,77,99,.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x, dy);
        ctx.lineTo(f.x + f.w, dy);
        ctx.stroke();
        ctx.setLineDash([]);
        bAll().forEach(function(it) {
          if (it.junk) {
            ctx.beginPath();
            ctx.arc(it.x, it.y, B.R - 1, 0, 7);
            ctx.fillStyle = "rgba(80,70,100,.35)";
            ctx.fill();
          }
        });
        if (B.aimP && !B.proj && !B.aimP.flick) {
          ctx.fillStyle = B.arm ? "rgba(255,95,143,.95)" : "rgba(255,255,255,.95)";
          if (B.arm === "warp") {
            ctx.beginPath();
            ctx.arc(B.aimP.x, B.aimP.y, 14, 0, 7);
            ctx.strokeStyle = "#ff5f8f";
            ctx.lineWidth = 3;
            ctx.stroke();
          } else {
            var d = bDir(B.aimP.x, B.aimP.y), x = L.x, y = L.y, ux = d.ux, uy = d.uy, n = 0;
            while (y > B.top + B.R && n < 400) {
              x += ux * 6;
              y += uy * 6;
              n++;
              if (x < f.x + B.R || x > f.x + f.w - B.R) ux = -ux;
              if (n % 3 === 0) {
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 7);
                ctx.fill();
              }
            }
          }
        }
        ctx.beginPath();
        ctx.arc(L.x, L.y + 3, B.R + 9, 0, 7);
        ctx.fillStyle = B.arm ? "rgba(255,95,143,.25)" : "rgba(106,76,240,.16)";
        ctx.fill();
        ["pierce", "warp", "bomb"].forEach(function(k, i) {
          var p = bItemPos(i), on2 = B.arm === k, cnt = B.inv[k];
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 7);
          ctx.fillStyle = on2 ? "#ff5f8f" : cnt ? "#6a4cf0" : "rgba(150,140,180,.5)";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "900 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(ITEM_JA[k], p.x, p.y);
          ctx.beginPath();
          ctx.arc(p.x + 13, p.y - 13, 8, 0, 7);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.fillStyle = "#ff5f8f";
          ctx.font = "900 10px sans-serif";
          ctx.fillText(cnt, p.x + 13, p.y - 12);
        });
        var nr = B.nextRow - B.shots, ng = 3 - B.shots % 3;
        ctx.fillStyle = "rgba(90,70,140,.85)";
        ctx.font = "800 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("\u304A\u3058\u3083\u307E \u3042\u3068" + ng + "\u767A \u30FB \u5929\u4E95 \u3042\u3068" + nr + "\u767A", L.x, g.L.lane.y + 12);
        ctx.restore();
        if (B.proj && B.proj.special) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(B.proj.x, B.proj.y, B.R - 2, 0, 7);
          ctx.fillStyle = B.proj.special === "bomb" ? "#3a2c4a" : "#ff5f8f";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "900 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(ITEM_JA[B.proj.special], B.proj.x, B.proj.y);
          ctx.restore();
        }
        var cur = B.queue[0];
        if (cur && !(B.proj && B.proj.it)) {
          if (B.arm === "pierce" || B.arm === "bomb") {
            ctx.save();
            ctx.beginPath();
            ctx.arc(L.x, L.y, B.R - 2, 0, 7);
            ctx.fillStyle = B.arm === "bomb" ? "#3a2c4a" : "#ff5f8f";
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "900 12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(ITEM_JA[B.arm], L.x, L.y);
            ctx.restore();
          } else {
            cur.x = L.x;
            cur.y = L.y;
            drawItem(ctx, cur, 1, t);
          }
        }
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        PAL.forEach(function(p, i) {
          var r = palRect(i), on2 = B.sel.cat === p[0];
          roundRect(ctx, r.x, r.y, r.w, r.h, 12);
          ctx.fillStyle = on2 ? "#6a4cf0" : "rgba(255,255,255,.88)";
          ctx.fill();
          ctx.fillStyle = on2 ? "#fff" : "#4a3a6a";
          ctx.font = "800 " + (p[1].length > 4 ? 9 : 11) + "px sans-serif";
          ctx.fillText(p[1], r.x + r.w / 2, r.y + r.h / 2 + 1);
        });
        if (B.open) {
          var po = PAL.filter(function(p) {
            return p[0] === B.open;
          })[0], opts = po[2];
          opts.forEach(function(v, j) {
            var r = optRect(j, opts.length), on2 = B.sel.cat === po[0] && B.sel.v === v;
            roundRect(ctx, r.x, r.y, r.w, r.h, 12);
            ctx.fillStyle = on2 ? "#ff5f8f" : "#fff";
            ctx.fill();
            ctx.strokeStyle = "#6a4cf0";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = on2 ? "#fff" : "#3a2c4a";
            ctx.font = "800 " + ((v || "").length > 7 ? 9 : 12) + "px sans-serif";
            ctx.fillText(v === "i" ? "I" : v, r.x + r.w / 2, r.y + r.h / 2 + 1);
          });
        }
        if (B.aimP && !B.aimP.onL && Math.hypot(B.aimP.x - L.x, B.aimP.y - L.y) < B.R + 30) {
          ctx.fillStyle = "#ef4d63";
          ctx.font = "900 12px sans-serif";
          ctx.fillText("\u306F\u306A\u3059\u3068 \u3084\u3081\u308B", L.x, L.y - B.R - 16);
        }
        ctx.restore();
      }
      function slotRelease(d, x, y) {
        var s0 = g.slots[d.si], it = s0.item;
        if (!it) return;
        if (d.moved) {
          var ti = slotAt(x, y);
          if (ti == null || ti === d.si) return;
          var s1 = g.slots[ti], other = s1.item;
          if (!accepts(s1.role, it.chunk) || other && !accepts(s0.role, other.chunk)) {
            toast("\u305D\u306E\u5834\u6240\u306B\u306F\u5165\u3089\u306A\u3044", "tri");
            app2.audio.sfx("reject");
            return;
          }
          s0.item = null;
          it.slot = null;
          if (other) {
            s1.item = null;
            other.slot = null;
            placeInSlot(other, s0);
          }
          placeInSlot(it, s1);
          slotsChanged();
          return;
        }
        if (g.t - d.t >= 0.5) {
          s0.item = null;
          it.slot = null;
          burst(s0.rect.x + s0.rect.w / 2, s0.rect.y + s0.rect.h / 2, [200, 190, 230], 10);
          app2.audio.sfx("pop");
          toast("\u3059\u3066\u305F", "info");
          slotsChanged();
          return;
        }
        s0.item = null;
        it.slot = null;
        it.state = "idle";
        it.ball = "chunk";
        it.home = s0.role;
        it.col = [];
        it.label = null;
        bFit(it);
        B.queue.unshift(it);
        app2.audio.sfx("slot");
        slotsChanged();
      }
      if (SHOT) {
        g.down = function(x, y) {
          if (g.state !== "play" || g.noInput) return;
          g.idleT = 0;
          if (g.ready && g.pill && x >= g.pill.x && x <= g.pill.x + g.pill.w && y >= g.pill.y && y <= g.pill.y + g.pill.h) {
            var wc = G.wordCount(g.ready.T);
            confirmSlots();
            addScore(Math.round(15 * wc * wc * mult()), g.L.W / 2, g.L.field.y + g.L.field.h * 0.4, true);
            for (var pb = 0; pb < 1 + Math.floor(wc / 5); pb++) bPushBack();
            return;
          }
          for (var k = 0; k < 3; k++) {
            var ip = bItemPos(k), key = ["pierce", "warp", "bomb"][k];
            if (Math.hypot(x - ip.x, y - ip.y) < ip.r + 6) {
              if (B.arm === key) B.arm = null;
              else if (B.inv[key] > 0) B.arm = key;
              else toast("\u6587\u3092\u300C\u308F\u308B!\u300D\u3068\u3082\u3089\u3048\u308B", "tri");
              app2.audio.sfx("cycle");
              return;
            }
          }
          var L = bLauncher();
          if (Math.hypot(x - L.x, y - L.y) < B.R + 10) {
            B.aimP = { x, y, sx: x, sy: y, onL: true };
            return;
          }
          if (B.open) {
            var po = PAL.filter(function(p) {
              return p[0] === B.open;
            })[0];
            for (var j = 0; j < po[2].length; j++) if (inR(optRect(j, po[2].length), x, y)) {
              bSelect(po[0], po[2][j]);
              B.open = null;
              return;
            }
          }
          for (var i = 0; i < PAL.length; i++) if (inR(palRect(i), x, y)) {
            var c = PAL[i];
            if (c[2].length === 1) {
              bSelect(c[0], null);
              B.open = null;
            } else if (B.open === c[0]) B.open = null;
            else {
              B.open = c[0];
              bSelect(c[0], B.last[c[0]] || c[2][0]);
            }
            return;
          }
          B.open = null;
          var si = slotAt(x, y);
          if (si != null && g.slots[si].item) {
            B.sd = { si, sx: x, sy: y, x, y, t: g.t, moved: false };
            return;
          }
          if (y < g.L.lane.y) B.aimP = { x, y, sx: x, sy: y };
        };
        g.move = function(x, y) {
          if (B.sd) {
            B.sd.x = x;
            B.sd.y = y;
            if (Math.hypot(x - B.sd.sx, y - B.sd.sy) > 12) B.sd.moved = true;
            return;
          }
          if (B.aimP) {
            B.aimP.x = x;
            B.aimP.y = y;
            if (B.aimP.onL) B.aimP.flick = y - B.aimP.sy > 30;
          }
        };
        g.up = function(x, y) {
          if (B.sd) {
            var d0 = B.sd;
            B.sd = null;
            if (g.state === "play") slotRelease(d0, x, y);
            return;
          }
          var a = B.aimP;
          B.aimP = null;
          if (!a || g.state !== "play") return;
          if (a.onL) {
            if (y - a.sy > 30) {
              var cur = B.queue[0];
              if (!cur || cur.ball !== "pron") {
                toast("\u4E0B\u306B\u5165\u308C\u3089\u308C\u308B\u306E\u306F\u4EE3\u540D\u8A5E(I / he \u306A\u3069)\u3060\u3051", "tri");
                app2.audio.sfx("reject");
                return;
              }
              var tok = G.chainState([cur.word], cfg).chunk, sl = freeSlotFor(tok) || g.slots.filter(function(z) {
                return accepts(z.role, tok);
              })[0];
              if (!sl) return;
              if (sl.item) {
                sl.item.slot = null;
                sl.item = null;
              }
              B.queue.shift();
              bFillQueue();
              var LL = bLauncher(), ci = newItem("chunk", tok, LL.x, LL.y);
              ci.sc = 1;
              ci.state = "idle";
              placeInSlot(ci, sl);
              slotsChanged();
              bAfterShot();
              return;
            }
            if (Math.hypot(x - a.sx, y - a.sy) < 12) {
              var c0 = B.queue[0];
              if (c0) speak(c0.label || c0.text);
              return;
            }
          }
          var LC = bLauncher();
          if (Math.hypot(x - LC.x, y - LC.y) < B.R + 30) {
            app2.audio.sfx("cycle");
            return;
          }
          bFire(bDir(x, y), x, y);
        };
        g.cancel = function() {
          B.aimP = null;
          B.sd = null;
        };
      }
      g.start = function() {
        g.layout();
        g.chunksSince = 0;
        if (SHOT) {
          bInit();
          app2.ui.count("3");
          app2.audio.sfx("count", 3);
          return;
        }
        if (opt.mode === "tutorial") {
          g.state = "play";
          return;
        }
        g.spawnQ = g.target || M.target;
        g.spawnT = 0;
        app2.ui.count("3");
        app2.audio.sfx("count", 3);
      };
      g.debug = { supply, slotsChanged: function() {
        slotsChanged();
      }, hit: function(x, y) {
        return hitStroke(x, y);
      }, items: function() {
        return g.items;
      }, slots: function() {
        return g.slots;
      }, chain: function() {
        return g.chain;
      }, cfg, tokenOf, solve: function() {
        return Supply.solve(fieldAndSlotItems(), cfg, 5e3);
      } };
      return g;
    }
    return { create, ROLE, MODE, accepts, TUNE, sentExt, decay, overInterval };
  })();

  // games/punichunk/src/tutorial.js
  var Tutorial = (function() {
    "use strict";
    function run(app2, g, done) {
      var ui = app2.ui, F = g.L.field, step = -1, hand = null, finished = false, tm = [];
      var W = F.w, X = function(k) {
        return F.x + W * k;
      }, Y = function(k) {
        return F.y + F.h * k;
      };
      var D = app2.dict, find = function(pos, w) {
        return D.all(pos).filter(function(e) {
          return e.w === w;
        })[0];
      };
      var E = {
        small: find("adj", "small") || D.getWords({ pos: "adj", maxLevel: 1 })[0],
        cat: find("noun", "cat") || D.getWords({ pos: "noun", maxLevel: 1 })[0],
        sleep: find("verb", "sleep") || D.getWords({ pos: "verb", maxLevel: 1, tag: { fr: ["intr"] } })[0],
        dog: find("noun", "dog") || D.getWords({ pos: "noun", maxLevel: 1 })[0],
        run: find("verb", "run") || D.getWords({ pos: "verb", maxLevel: 1, tag: { fr: ["intr"] } })[0]
      };
      var it = {};
      g.calm = true;
      g.guide = { allow: function() {
        return false;
      }, draw: drawHand, noHint: true };
      var bottomSay = function() {
        return app2.stage.h - g.L.lane.y + 8;
      };
      function say(html, next, label) {
        ui.say(html, { next, nextLabel: label, bottom: bottomSay() });
      }
      function clearHand() {
        hand = null;
      }
      function drawHand(ctx, t) {
        if (!hand) return;
        var p;
        if (hand.tap) {
          var a = hand.tap();
          if (!a) return;
          p = { x: a.x, y: a.y };
        } else {
          var A = hand.from(), B = hand.to();
          if (!A || !B) return;
          var k = t * 0.6 % 1, e = U.E.inOut(Math.min(1, k * 1.3));
          p = { x: U.lerp(A.x, B.x, e), y: U.lerp(A.y, B.y, e) };
          ctx.save();
          ctx.setLineDash([6, 8]);
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(255,111,159,.7)";
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
          ctx.restore();
        }
        var pr = t * 1.6 % 1;
        ctx.save();
        ctx.globalAlpha = 1 - pr;
        ctx.strokeStyle = "#ff6f9f";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16 + pr * 26, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.translate(p.x + 20, p.y + 26);
        ctx.rotate(-0.35);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#6a4cf0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-7, -22, 14, 30, 7) : ctx.rect(-7, -22, 14, 30);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-14, 0, 28, 26, 10) : ctx.rect(-14, 0, 28, 26);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      function at(item) {
        return function() {
          if (!item) return null;
          if (item.slot) return { x: item.slot.rect.x + item.slot.rect.w / 2, y: item.slot.rect.y + item.slot.rect.h / 2 };
          return g.items.indexOf(item) >= 0 ? item : null;
        };
      }
      function slotPos(i) {
        return function() {
          var r = g.slots[i].rect;
          return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        };
      }
      function spawn(spec, kx, ky) {
        var i = g.spawnWord(spec, X(kx), Y(ky), true);
        i.vx = i.vy = 0;
        return i;
      }
      function later(fn, ms) {
        tm.push(setTimeout(function() {
          if (!finished) fn();
        }, ms));
      }
      var handlers = {};
      function onG(name, fn) {
        handlers[name] = fn;
      }
      ["chunk", "sentence", "fail", "cycle", "slot", "chainAdd", "chainStart", "eat"].forEach(function(n) {
        g.on(n, function(d) {
          if (handlers[n]) handlers[n](d);
        });
      });
      function go(n) {
        step = n;
        handlers = {};
        STEPS[n]();
      }
      var STEPS = [
        function() {
          say("\u3084\u3042\u3001\u307C\u304F\u306F<b>\u30C1\u30E3\u30F3\u30AF\u304F\u3093</b>!<br>\u82F1\u8A9E\u306E\u30D0\u30D6\u30EB\u3092\u3064\u306A\u3052\u3066\u3001<b>\u6587</b>\u3092\u4F5C\u308B\u30B2\u30FC\u30E0\u3060\u3088\u3002", function() {
            go(1);
          });
          g.guide.allow = function() {
            return false;
          };
        },
        function() {
          it.the = spawn({ k: "det", v: "the" }, 0.18, 0.2);
          it.small = spawn({ k: "adj", e: E.small }, 0.5, 0.12);
          it.cat = spawn({ k: "n", e: E.cat }, 0.82, 0.22);
          it.sleep = spawn({ k: "v", e: E.sleep }, 0.55, 0.42);
          var seq = [it.the, it.small, it.cat], idx = 0;
          say('\u5358\u8A9E\u3092<b>\u82F1\u8A9E\u306E\u9806\u756A</b>\u306B\u30BF\u30C3\u30D7\u3059\u308B\u3068\u300C\u30C1\u30E3\u30F3\u30AF\u300D\u306B\u306A\u308B\u3088\u3002<br><span class="pc-en">the \u2192 small \u2192 cat</span> \u306E\u9806\u306B\u30BF\u30C3\u30D7\u3057\u3066\u307F\u3066!');
          hand = { tap: function() {
            return at(seq[Math.min(idx, 2)])();
          } };
          g.guide.allow = function(item, slot) {
            return !slot && item === seq[idx];
          };
          onG("chainStart", function(d) {
            if (d.item === seq[0]) idx = 1;
          });
          onG("chainAdd", function(d) {
            idx = seq.indexOf(d.item) + 1;
          });
          onG("fail", function() {
            idx = 0;
          });
          onG("chunk", function(d) {
            it.np = d.item;
            it.vp = it.sleep;
            clearHand();
            later(function() {
              go(3);
            }, 700);
          });
        },
        function() {
          say('\u3067\u304D\u305F!\u3053\u308C\u304C<b>\u540D\u8A5E\u306E\u30C1\u30E3\u30F3\u30AF</b>\u3002<br>\u6B21\u306F\u52D5\u8A5E <span class="pc-en">sleep</span> \u3092\u30BF\u30C3\u30D7\u3002\u5C11\u3057\u5F85\u3064\u3068\u30C1\u30E3\u30F3\u30AF\u306B\u306A\u308B\u3088\u3002');
          hand = { tap: at(it.sleep) };
          g.guide.allow = function(item, slot) {
            return !slot && item === it.sleep;
          };
          onG("chunk", function(d) {
            it.vp = d.item;
            clearHand();
            later(function() {
              go(3);
            }, 700);
          });
        },
        function() {
          say('\u3067\u304D\u305F!\u3053\u308C\u304C<b>\u540D\u8A5E\u306E\u30C1\u30E3\u30F3\u30AF</b>\u3002<br>\u4ECA\u5EA6\u306F<b>\u6307\u3067\u306A\u305E\u3063\u3066</b>\u3064\u306A\u3052\u3088\u3046\u3002<span class="pc-en">the \u2026 cat</span> \u304B\u3089 <span class="pc-en">sleep</span> \u3078\u3001\u306A\u305E\u3063\u3066\u307F\u3066!');
          hand = { from: at(it.np), to: at(it.vp) };
          g.guide.allow = function(item, slot) {
            return (slot === void 0 || slot === "drag") && (item === it.np || item === it.vp);
          };
          onG("sentence", function() {
            clearHand();
            later(function() {
              go(4);
            }, 1600);
          });
          onG("fail", function() {
            say('\u304A\u3057\u3044!<span class="pc-en">the \u2026 cat</span> \u3092\u62BC\u3057\u305F\u307E\u307E\u3001<span class="pc-en">sleep</span> \u307E\u3067\u6307\u3092\u3059\u3079\u3089\u305B\u3066\u306D\u3002');
          });
        },
        function() {
          say('\u3059\u3054\u3044!<span class="pc-en">The small cat sleeps.</span><br>\u4E3B\u8A9E\u306B\u5408\u308F\u305B\u3066 <b>sleep<u>s</u></b> \u306E s \u3082\u81EA\u52D5\u3067\u4ED8\u304F\u3088\u3002', function() {
            go(5);
          });
          g.guide.allow = function() {
            return false;
          };
        },
        function() {
          it.a = spawn({ k: "det", v: "a" }, 0.22, 0.18);
          it.dog = spawn({ k: "n", e: E.dog }, 0.6, 0.14);
          it.run = spawn({ k: "v", e: E.run }, 0.78, 0.4);
          var cycled = false;
          say('\u9023\u9396\u4E2D\u306E\u5358\u8A9E\u3092<b>\u3082\u3046\u4E00\u5EA6\u30BF\u30C3\u30D7</b>\u3059\u308B\u3068\u5F62\u304C\u5909\u308F\u308B\u3088\u3002<br><span class="pc-en">a</span> \u3092\u30BF\u30C3\u30D7 \u2192 \u3082\u3046\u4E00\u5EA6\u30BF\u30C3\u30D7\u3067 <span class="pc-en">the</span> \u306B\u3002\u305D\u308C\u304B\u3089 <span class="pc-en">dog</span> \u3092\u30BF\u30C3\u30D7!');
          hand = { tap: function() {
            return cycled ? at(it.dog)() : at(it.a)();
          } };
          g.guide.allow = function(item, slot) {
            return !slot && (item === it.a || cycled && item === it.dog);
          };
          onG("cycle", function() {
            cycled = true;
          });
          onG("fail", function() {
            cycled = false;
          });
          onG("chunk", function(d) {
            it.np2 = d.item;
            clearHand();
            later(function() {
              go(6);
            }, 700);
          });
        },
        function() {
          say('\u4E0B\u306E<b>\u30B9\u30ED\u30C3\u30C8</b>\u306B\u7F6E\u3044\u3066\u3082\u6587\u304C\u4F5C\u308C\u308B\u3088\u3002<br><span class="pc-en">the dog</span> \u3092\u300C\u3060\u308C\u304C\u300D\u3078\u3001<span class="pc-en">run</span> \u3092\u300C\u3059\u308B\u300D\u3078\u30C9\u30E9\u30C3\u30B0!<br>(\u4E0B\u306B\u30D4\u30C3\u3068\u306F\u3058\u304F\u3068\u3001\u5408\u3046\u30B9\u30ED\u30C3\u30C8\u3078\u81EA\u52D5\u3067\u5165\u308B\u3088)');
          var stage = 0;
          hand = { from: function() {
            return stage ? at(it.run)() : at(it.np2)();
          }, to: function() {
            return stage ? slotPos(2)() : slotPos(1)();
          } };
          g.guide.allow = function(item, slot) {
            if (slot === "confirm") return true;
            if (item === it.np2 || item === it.run) return true;
            return !!(item && item.slot);
          };
          onG("slot", function(d) {
            if (d.role === "S") stage = 1;
            if (g.slots[1].item && g.slots[2].item) {
              stage = 2;
              hand = { tap: function() {
                return g.pill ? { x: g.pill.x + g.pill.w / 2, y: g.pill.y + g.pill.h / 2 } : null;
              } };
              say("\u3044\u3044\u306D!\u305D\u308D\u3063\u305F\u3089\u300C<b>\u308F\u308B!</b>\u300D\u3092\u30BF\u30C3\u30D7\u3002<br>\u30B9\u30ED\u30C3\u30C8\u3092<b>\u305F\u304F\u3055\u3093\u57CB\u3081\u308B\u307B\u3069\u500D\u7387\u30A2\u30C3\u30D7</b>\u3002\u8CAF\u3081\u3066\u4E00\u6C17\u306B\u5272\u308D\u3046!");
            }
          });
          onG("sentence", function() {
            clearHand();
            later(function() {
              go(7);
            }, 1600);
          });
        },
        function() {
          it.junk = spawn({ k: "prep", v: "into" }, 0.5, 0.3);
          say('\u3044\u3089\u306A\u3044\u30D0\u30D6\u30EB\u306F\u3001<b>\u30C1\u30E3\u30F3\u30AF\u304F\u3093\u306B\u30C9\u30E9\u30C3\u30B0</b>\u3059\u308B\u3068\u98DF\u3079\u3066\u304F\u308C\u308B\u3088\u3002<br><span class="pc-en">into</span> \u3092\u98DF\u3079\u3055\u305B\u3066\u307F\u3066!(3\u56DE\u307E\u3067\u3002\u6587\u3092\u4F5C\u308B\u3068\u56DE\u5FA9)');
          hand = { from: at(it.junk), to: function() {
            return { x: 46, y: g.L.lane.y + g.L.lane.h * 0.55 };
          } };
          g.guide.allow = function(item, slot) {
            return item === it.junk && (slot === void 0 || slot === "drag");
          };
          onG("eat", function() {
            clearHand();
            later(function() {
              go(8);
            }, 900);
          });
        },
        function() {
          say("\u3070\u3063\u3061\u308A!\u3042\u3068\u306F\u6642\u9593\u5185\u306B\u3001\u3069\u3093\u3069\u3093\u6587\u3092\u4F5C\u308D\u3046\u3002<br><b>\u9577\u3044\u6587\u307B\u3069\u6642\u9593\u304C\u306E\u3073\u308B</b>\u3088\u3002<b>\u25B3\u3084\xD7</b>\u304C\u51FA\u305F\u3089\u7406\u7531\u3092\u898B\u3066\u306D!", finish, "\u306F\u3058\u3081\u308B!");
          g.guide.allow = function() {
            return false;
          };
        }
      ];
      function finish() {
        if (finished) return;
        finished = true;
        tm.forEach(clearTimeout);
        ui.unsay();
        ui.unskip();
        g.guide = null;
        done();
      }
      ui.skip(finish);
      go(0);
      return { stop: function() {
        finished = true;
        tm.forEach(clearTimeout);
        ui.unsay();
        ui.unskip();
      } };
    }
    return { run };
  })();

  // games/punichunk/src/ui.js
  var UI = (function() {
    "use strict";
    var CSS = [
      ".pc-root{position:relative;width:100%;height:100%;overflow:hidden;background:#f3ecff;color:#3a2c4a;font-family:" + Art.FONT_JA + ";-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none;-webkit-touch-callout:none;-webkit-text-size-adjust:100%;line-height:1.4;box-sizing:border-box}",
      ".pc-root *,.pc-root *::before,.pc-root *::after{box-sizing:border-box}",
      ".pc-root button{font-family:inherit;cursor:pointer;-webkit-appearance:none;appearance:none}",
      ".pc-stage{position:absolute;top:0;bottom:0;left:50%;width:100%;max-width:520px;transform:translateX(-50%);overflow:hidden}",
      ".pc-bg,.pc-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block}",
      ".pc-en{font-family:" + Art.FONT_EN + "}",
      ".pc-probe{position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}",
      /* ボタン */
      ".pc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:0 24px;border:0;border-radius:22px;font-weight:900;font-size:19px;letter-spacing:.04em;color:#fff;background:linear-gradient(180deg,#9a80ff,#6a4cf0);box-shadow:0 5px 0 #4b30c4,0 12px 22px rgba(90,60,200,.32);transition:transform .08s,box-shadow .08s,filter .2s;position:relative}",
      ".pc-btn:active{transform:translateY(4px);box-shadow:0 1px 0 #4b30c4,0 4px 10px rgba(90,60,200,.3)}",
      ".pc-btn svg{width:22px;height:22px;fill:currentColor}",
      ".pc-btn.pink{background:linear-gradient(180deg,#ff9cc2,#ff6f9f);box-shadow:0 5px 0 #d94379,0 12px 22px rgba(255,80,140,.3)}.pc-btn.pink:active{box-shadow:0 1px 0 #d94379}",
      ".pc-btn.mint{background:linear-gradient(180deg,#6fe0ad,#2fbf83);box-shadow:0 5px 0 #1d915f,0 12px 22px rgba(40,180,120,.3)}.pc-btn.mint:active{box-shadow:0 1px 0 #1d915f}",
      ".pc-btn.yellow{color:#5a3d00;background:linear-gradient(180deg,#ffe27a,#ffc93c);box-shadow:0 5px 0 #d79a12,0 12px 22px rgba(240,170,20,.3)}.pc-btn.yellow:active{box-shadow:0 1px 0 #d79a12}",
      ".pc-btn.ghost{color:#5b45c9;background:#fff;box-shadow:0 4px 0 #d8cff7,0 8px 18px rgba(90,60,200,.14)}.pc-btn.ghost:active{box-shadow:0 1px 0 #d8cff7}",
      ".pc-btn.small{min-height:42px;font-size:15px;padding:0 16px;border-radius:16px}",
      ".pc-btn.wide{width:100%}",
      ".pc-btn[disabled]{filter:grayscale(.8) opacity(.6);pointer-events:none}",
      ".pc-ib{width:48px;height:48px;border-radius:18px;border:0;display:inline-flex;align-items:center;justify-content:center;color:#5b45c9;background:rgba(255,255,255,.92);box-shadow:0 4px 0 #d8cff7,0 8px 16px rgba(90,60,200,.15);transition:transform .08s}",
      ".pc-ib:active{transform:translateY(3px);box-shadow:0 1px 0 #d8cff7}",
      ".pc-ib svg{width:24px;height:24px;fill:currentColor}",
      /* 画面 */
      ".pc-scr{position:absolute;inset:0;display:flex;flex-direction:column;padding:calc(var(--pc-top) + 12px) 16px calc(var(--pc-bottom) + 16px);overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;animation:pc-in .3s cubic-bezier(.2,.9,.3,1.2) both;z-index:20}",
      ".pc-scr.out{animation:pc-out .2s ease-in both;pointer-events:none}",
      "@keyframes pc-in{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}",
      "@keyframes pc-out{to{opacity:0;transform:translateY(10px) scale(.98)}}",
      ".pc-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;min-height:48px}",
      ".pc-head h2{margin:0;font-size:22px;font-weight:900;color:#4a35b5;text-shadow:0 2px 0 #fff}",
      ".pc-card{background:rgba(255,255,255,.9);border-radius:26px;box-shadow:0 10px 30px rgba(80,50,140,.16);padding:16px;margin-bottom:12px}",
      ".pc-card h3{margin:0 0 10px;font-size:15px;color:#6a55c9;font-weight:900;letter-spacing:.05em}",
      ".pc-spacer{flex:1 1 auto;min-height:8px}",
      ".pc-dim{position:absolute;inset:0;background:rgba(50,30,90,.35);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}",
      /* タイトル */
      ".pc-logo{text-align:center;margin-top:min(8vh,60px)}",
      ".pc-logo .ls{display:flex;justify-content:center;gap:2px;flex-wrap:nowrap}",
      ".pc-logo .l{display:inline-flex;align-items:center;justify-content:center;width:min(15vw,62px);height:min(15vw,62px);border-radius:50%;font-size:min(9vw,38px);font-weight:900;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);box-shadow:inset 0 -6px 0 rgba(0,0,0,.12),inset 0 6px 10px rgba(255,255,255,.6),0 6px 14px rgba(80,50,140,.25);animation:pc-bob 2.4s ease-in-out infinite;position:relative}",
      '.pc-logo .l::after{content:"";position:absolute;left:22%;top:14%;width:28%;height:16%;border-radius:50%;background:rgba(255,255,255,.75);transform:rotate(-25deg)}',
      "@keyframes pc-bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-6px) scale(1.04,.96)}}",
      ".pc-logo .sub{margin-top:14px;font-weight:900;color:#6a55c9;font-size:15px;letter-spacing:.12em}",
      ".pc-logo .en{font-family:" + Art.FONT_EN + ";font-weight:900;color:#ff6f9f;font-size:13px;letter-spacing:.3em;margin-top:4px}",
      ".pc-menu{display:flex;flex-direction:column;gap:14px;width:100%;max-width:340px;margin:0 auto}",
      ".pc-row{display:flex;justify-content:center;gap:14px}",
      ".pc-ibl{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:800;color:#5b45c9}",
      ".pc-tap{align-self:center;padding:10px 22px;border-radius:22px;background:rgba(255,255,255,.82);box-shadow:0 6px 18px rgba(80,50,140,.15);font-weight:900;color:#5b45c9;font-size:18px;animation:pc-blink 1.4s ease-in-out infinite}",
      "@keyframes pc-blink{50%{opacity:.55}}",
      /* モード */
      ".pc-lv{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:rgba(255,255,255,.7);padding:5px;border-radius:18px}",
      ".pc-lv button{border:0;border-radius:14px;padding:9px 0;font-weight:900;font-size:13px;white-space:nowrap;letter-spacing:-.02em;color:#6a55c9;background:transparent;transition:background .15s}",
      ".pc-lv button.on{color:#fff;background:linear-gradient(180deg,#9a80ff,#6a4cf0);box-shadow:0 3px 0 #4b30c4}",
      ".pc-lvdesc{font-size:12.5px;color:#6b5d80;margin:8px 4px 0;min-height:18px;font-weight:700}",
      ".pc-mode{display:flex;align-items:center;gap:14px;padding:14px;border-radius:24px;background:rgba(255,255,255,.92);box-shadow:0 8px 22px rgba(80,50,140,.14);margin-top:12px;border:0;width:100%;text-align:left;color:inherit;transition:transform .1s}",
      ".pc-mode:active{transform:scale(.98)}",
      ".pc-mode .ic{flex:0 0 56px;height:56px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:24px;box-shadow:inset 0 -5px 0 rgba(0,0,0,.12)}",
      ".pc-mode .ic svg{width:30px;height:30px;fill:#fff}",
      ".pc-mode .tx{flex:1;min-width:0}",
      ".pc-mode b{display:block;font-size:17px;font-weight:900;color:#3a2c4a}",
      ".pc-mode small{display:block;font-size:12.5px;color:#7a6c90;font-weight:700;margin-top:2px}",
      ".pc-mode .best{font-size:12px;color:#ff6f9f;font-weight:900;margin-top:3px;font-family:" + Art.FONT_EN + "}",
      ".pc-mode.locked{opacity:.92}.pc-mode .lock{width:26px;height:26px;fill:#b3a6d6}",
      /* 設定 */
      ".pc-set{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px dashed rgba(140,120,200,.25);font-weight:800;font-size:15px}",
      ".pc-set:last-child{border-bottom:0}",
      ".pc-set small{display:block;font-size:11.5px;color:#8a7da0;font-weight:700}",
      ".pc-sw{position:relative;flex:0 0 56px;height:32px;border-radius:16px;background:#ddd5f2;border:0;transition:background .2s}",
      '.pc-sw::after{content:"";position:absolute;left:3px;top:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .2s}',
      ".pc-sw.on{background:#3cc98a}.pc-sw.on::after{transform:translateX(24px)}",
      ".pc-sw[disabled]{opacity:.45}",
      ".pc-seg{display:flex;background:#eee8fb;border-radius:14px;padding:3px;gap:2px;flex-wrap:nowrap}",
      ".pc-seg button{border:0;background:transparent;border-radius:11px;padding:7px 10px;font-weight:900;font-size:13px;color:#6a55c9;white-space:nowrap}",
      ".pc-seg button.on{background:#fff;box-shadow:0 2px 6px rgba(80,50,140,.18);color:#4a35b5}",
      ".pc-seg[aria-disabled=true]{opacity:.45;pointer-events:none}",
      ".pc-range{-webkit-appearance:none;appearance:none;width:130px;height:8px;border-radius:4px;background:#e2daf7;outline:none}",
      ".pc-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#7b5cff;box-shadow:0 2px 5px rgba(0,0,0,.25);border:3px solid #fff}",
      ".pc-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#7b5cff;border:3px solid #fff}",
      /* HUD */
      ".pc-hud{position:absolute;left:0;right:0;top:var(--pc-top);height:58px;display:flex;align-items:center;gap:10px;padding:0 10px;z-index:10;pointer-events:none}",
      ".pc-hud>*{pointer-events:auto}",
      ".pc-hud .pc-ib{width:44px;height:44px;border-radius:16px}",
      ".pc-score{flex:1;text-align:center;line-height:1}",
      ".pc-score b{display:block;font-family:" + Art.FONT_EN + ";font-weight:900;font-size:28px;color:#4a35b5;text-shadow:0 2px 0 #fff,0 0 12px rgba(255,255,255,.9);transition:transform .15s}",
      ".pc-score b.bump{transform:scale(1.15)}",
      ".pc-combo{display:inline-block;margin-top:3px;font-family:" + Art.FONT_EN + ";font-weight:900;font-size:12px;color:#fff;background:linear-gradient(90deg,#ff7aa8,#ff9b6a);border-radius:10px;padding:2px 8px;opacity:0;transition:opacity .2s}",
      ".pc-combo.on{opacity:1}",
      ".pc-timer{position:relative;width:52px;height:52px}",
      ".pc-timer svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}",
      ".pc-timer span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:" + Art.FONT_EN + ";font-weight:900;font-size:17px;color:#4a35b5}",
      ".pc-timer.warn span{color:#ef4d63;animation:pc-pulse .5s ease-in-out infinite alternate}",
      "@keyframes pc-pulse{to{transform:scale(1.18)}}",
      ".pc-prev{position:absolute;left:12px;right:12px;top:calc(var(--pc-top) + 58px);height:30px;display:flex;align-items:center;justify-content:center;z-index:9;pointer-events:none}",
      ".pc-prev div{max-width:100%;display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:15px;background:rgba(255,255,255,.88);box-shadow:0 3px 10px rgba(80,50,140,.12);font-family:" + Art.FONT_EN + ";font-weight:800;font-size:14px;color:#3a2c4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .15s}",
      ".pc-prev div.empty{opacity:0}",
      ".pc-prev i{font-style:normal;flex:0 0 auto;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-family:" + Art.FONT_JA + "}",
      ".pc-prev .goal{background:rgba(255,247,220,.95)}.pc-prev .goal i{background:#ffb21f}.pc-prev .goal small{font-size:12.5px;font-weight:900;color:#7a5200}",
      ".pc-prev .ok i{background:#3cc98a}.pc-prev .bad i{background:#ef4d63}.pc-prev .wait i{background:#f5a524}.pc-prev .sel i{background:#7b5cff}",
      ".pc-prev small{font-family:" + Art.FONT_JA + ";font-size:11px;color:#8a7da0;overflow:hidden;text-overflow:ellipsis}",
      ".pc-items{position:absolute;right:10px;display:flex;gap:8px;z-index:9}",
      ".pc-items button{position:relative;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.95);color:#7b5cff;box-shadow:0 3px 0 #d8cff7,0 6px 12px rgba(90,60,200,.15);display:flex;align-items:center;justify-content:center}",
      ".pc-items button svg{width:22px;height:22px;fill:currentColor}",
      ".pc-items button em{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;border-radius:9px;background:#ff6f9f;color:#fff;font-style:normal;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px;font-family:" + Art.FONT_EN + "}",
      ".pc-items button.zero{opacity:.45}",
      /* 演出用の文字 */
      ".pc-toast{position:absolute;left:50%;top:calc(var(--pc-top) + 96px);transform:translateX(-50%);z-index:12;pointer-events:none;display:flex;align-items:center;gap:8px;max-width:92%;padding:9px 16px;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(80,50,140,.22);font-weight:900;font-size:14px;color:#3a2c4a;animation:pc-toast 2.3s ease both}",
      ".pc-toast i{font-style:normal;flex:0 0 auto;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px}",
      ".pc-toast.x i{background:#ef4d63}.pc-toast.tri i{background:#f5a524}.pc-toast.info i{background:#7b5cff}",
      "@keyframes pc-toast{0%{opacity:0;transform:translate(-50%,-10px) scale(.9)}10%{opacity:1;transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-6px)}}",
      ".pc-banner{position:absolute;left:12px;right:12px;top:38%;z-index:12;pointer-events:none;text-align:center;animation:pc-ban 2.2s cubic-bezier(.2,.9,.3,1.2) both}",
      ".pc-banner div{display:inline-block;max-width:100%;padding:14px 20px;border-radius:24px;background:linear-gradient(180deg,#fff,#f6f0ff);box-shadow:0 12px 30px rgba(80,50,140,.3),inset 0 -4px 0 rgba(140,110,230,.15);font-family:" + Art.FONT_EN + ";font-weight:900;font-size:21px;color:#3a2c4a;line-height:1.35}",
      ".pc-banner u{text-decoration:none;color:#ff4f8b;border-bottom:3px solid #ffb3cc}",
      ".pc-banner small{display:block;margin-top:6px;font-size:14px;color:#ff6f9f}",
      ".pc-banner .pf{display:inline-block;padding:1px 10px;border-radius:10px;background:linear-gradient(90deg,#ffd23f,#ff9b6a);color:#fff;font-size:15px;margin-right:4px}",
      ".pc-banner .ok{display:inline-flex;width:28px;height:28px;border-radius:50%;background:#3cc98a;color:#fff;align-items:center;justify-content:center;vertical-align:-5px;margin-right:6px}.pc-banner .ok svg{width:18px;height:18px;fill:none;stroke:#fff}",
      "@keyframes pc-ban{0%{opacity:0;transform:scale(.6)}12%{opacity:1;transform:scale(1.04)}20%{transform:scale(1)}82%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-24px)}}",
      ".pc-count{position:absolute;left:0;right:0;top:36%;text-align:center;z-index:13;pointer-events:none;font-weight:900;font-size:72px;color:#fff;-webkit-text-stroke:3px #6a4cf0;text-shadow:0 6px 0 #4b30c4,0 12px 30px rgba(80,50,180,.45);animation:pc-cnt .8s cubic-bezier(.2,.9,.3,1.4) both}",
      ".pc-count.big{font-size:52px;animation-duration:1.4s}",
      "@keyframes pc-cnt{0%{opacity:0;transform:scale(.3)}30%{opacity:1;transform:scale(1.1)}45%{transform:scale(1)}85%{opacity:1}100%{opacity:0;transform:scale(1.15)}}",
      ".pc-tip{position:absolute;z-index:11;pointer-events:none;transform:translate(-50%,-100%);padding:8px 12px;border-radius:14px;background:#3d2d66;color:#fff;font-family:" + Art.FONT_EN + ";font-weight:800;font-size:15px;white-space:nowrap;box-shadow:0 8px 20px rgba(40,20,80,.3);max-width:94%}",
      ".pc-tip small{display:block;font-family:" + Art.FONT_JA + ";font-weight:700;font-size:11.5px;color:#d9ccff;margin-top:1px}",
      '.pc-tip::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#3d2d66}',
      /* 結果 */
      ".pc-res-score{text-align:center;font-family:" + Art.FONT_EN + ";font-weight:900;font-size:56px;color:#4a35b5;text-shadow:0 3px 0 #fff;line-height:1.1}",
      ".pc-new{display:inline-block;margin:4px auto 0;padding:4px 12px;border-radius:12px;background:linear-gradient(90deg,#ffd23f,#ff9b6a);color:#fff;font-weight:900;font-size:14px;animation:pc-pulse .6s ease-in-out infinite alternate;font-family:" + Art.FONT_EN + "}",
      ".pc-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      ".pc-stats div{background:#f5f0ff;border-radius:16px;padding:9px 10px;text-align:center}",
      ".pc-stats b{display:block;font-family:" + Art.FONT_EN + ";font-size:22px;font-weight:900;color:#5b45c9}",
      ".pc-stats small{font-size:11.5px;font-weight:800;color:#7a6c90}",
      ".pc-list{display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow:auto;touch-action:pan-y}",
      ".pc-sent{display:flex;align-items:center;gap:8px;background:#faf7ff;border-radius:14px;padding:7px 8px 7px 12px;font-family:" + Art.FONT_EN + ";font-weight:800;font-size:14px}",
      ".pc-sent span{flex:1;min-width:0}",
      ".pc-sent button{flex:0 0 34px;height:34px;border-radius:50%;border:0;background:#ece5ff;color:#6a4cf0;display:flex;align-items:center;justify-content:center}",
      ".pc-sent button svg{width:18px;height:18px;fill:currentColor}",
      ".pc-goal{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:#fff7dc;font-weight:900;font-size:14px;color:#7a5200}",
      ".pc-goal.done{background:#ddf7ea;color:#1d7a50}",
      /* 記録 */
      ".pc-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;touch-action:pan-x}",
      ".pc-tabs button{flex:0 0 auto;border:0;border-radius:14px;padding:8px 12px;font-weight:900;font-size:13px;background:rgba(255,255,255,.75);color:#6a55c9}",
      ".pc-tabs button.on{background:#6a4cf0;color:#fff}",
      ".pc-rank{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px dashed rgba(140,120,200,.25);font-weight:800}",
      ".pc-rank .n{flex:0 0 30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eee8fb;color:#6a55c9;font-family:" + Art.FONT_EN + ";font-weight:900}",
      ".pc-rank:nth-child(1) .n{background:#ffd23f;color:#6b4a00}.pc-rank:nth-child(2) .n{background:#dfe3ee;color:#4b5266}.pc-rank:nth-child(3) .n{background:#f6c6a0;color:#7a3f12}",
      ".pc-rank .s{flex:1;font-family:" + Art.FONT_EN + ";font-weight:900;font-size:18px;color:#3a2c4a}",
      ".pc-rank small{color:#8a7da0;font-size:11.5px}",
      ".pc-empty{text-align:center;color:#8a7da0;font-weight:800;padding:24px 0}",
      /* ショップ */
      ".pc-prod{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px dashed rgba(140,120,200,.25)}",
      ".pc-prod:last-child{border-bottom:0}",
      ".pc-prod .ic{flex:0 0 46px;height:46px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:#f1ebff;color:#7b5cff}",
      ".pc-prod .ic svg{width:26px;height:26px;fill:currentColor}",
      ".pc-prod .tx{flex:1}.pc-prod b{display:block;font-size:15px}.pc-prod small{font-size:12px;color:#7a6c90;font-weight:700}",
      ".pc-note{font-size:11.5px;color:#8a7da0;font-weight:700;text-align:center;margin:4px 0 10px}",
      /* モーダル・チュートリアル */
      ".pc-modal{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px}",
      ".pc-modal .pc-card{position:relative;width:100%;max-width:340px;text-align:center;animation:pc-in .25s cubic-bezier(.2,.9,.3,1.3) both}",
      ".pc-modal p{margin:6px 0 16px;font-weight:800;font-size:15px;color:#4a3d60}",
      ".pc-say{position:absolute;left:12px;right:12px;z-index:30;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:14px 16px;border-radius:22px;background:#fff;box-shadow:0 10px 30px rgba(80,50,140,.28);animation:pc-in .3s cubic-bezier(.2,.9,.3,1.3) both}",
      ".pc-say p{margin:0;font-weight:800;font-size:15.5px;line-height:1.55;color:#3a2c4a}",
      ".pc-say p b{color:#ff4f8b}.pc-say p .pc-en{color:#5b45c9;font-weight:900}",
      '.pc-say::after{content:"";position:absolute;left:34px;bottom:-10px;border:10px solid transparent;border-bottom:0;border-top-color:#fff}',
      ".pc-say .row{display:flex;justify-content:flex-end;gap:8px}",
      ".pc-skip{position:absolute;right:12px;top:calc(var(--pc-top) + 64px);z-index:31}",
      ".pc-credits p{font-size:13.5px;font-weight:700;color:#4a3d60;margin:0 0 10px;line-height:1.7}",
      ".pc-tgear{position:absolute;top:calc(var(--pc-top) + 12px);left:14px;z-index:3}",
      ".pc-lvnow{font-size:12.5px;font-weight:800;color:#8a6aa8;text-align:center;margin:2px 0 10px}",
      ".pc-ttsnote{font-size:11.5px;color:#a0567a;font-weight:800;text-align:center;margin-top:6px}",
      "@media (prefers-reduced-motion: reduce){.pc-logo .l,.pc-tap{animation:none}.pc-scr{animation-duration:.01s}}"
    ].join("\n");
    var styleRef = 0, styleEl = null;
    function injectCSS() {
      styleRef++;
      if (styleEl) return;
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-punichunk", "");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }
    function removeCSS() {
      styleRef--;
      if (styleRef <= 0 && styleEl) {
        styleEl.remove();
        styleEl = null;
        styleRef = 0;
      }
    }
    function create(app2, stageEl) {
      var el = U.el, ui = { stage: stageEl }, hudEl = null, prevEl = null, itemsEl = null, layer = el("div", { class: "pc-layer" });
      stageEl.appendChild(layer);
      function icon(n) {
        return Art.ICON[n] || "";
      }
      var shownAt = 0;
      function early() {
        return Date.now() - shownAt < 400;
      }
      function btn(label, cls, fn, ic) {
        var b = el("button", { class: "pc-btn " + (cls || ""), onclick: function(e) {
          if (early()) return;
          app2.audio.sfx("button");
          app2.audio.unlock();
          fn && fn(e);
        } });
        if (ic) b.innerHTML = icon(ic);
        b.appendChild(document.createTextNode(label));
        return b;
      }
      function ib(ic, label, fn) {
        var b = el("button", { class: "pc-ib", "aria-label": label, html: icon(ic), onclick: function(e) {
          if (early()) return;
          app2.audio.sfx("button");
          app2.audio.unlock();
          fn && fn(e);
        } });
        return b;
      }
      ui.btn = btn;
      ui.ib = ib;
      ui.icon = icon;
      var cur = null;
      function screen(node) {
        if (cur) {
          var old = cur;
          old.classList.add("out");
          old.style.pointerEvents = "none";
          setTimeout(function() {
            old.remove();
          }, 200);
        }
        shownAt = Date.now();
        cur = node;
        if (node) stageEl.appendChild(node);
        return node;
      }
      ui.clear = function() {
        screen(null);
      };
      function head(title, back) {
        return el("div", { class: "pc-head" }, [ib("back", "\u3082\u3069\u308B", back), el("h2", { text: title })]);
      }
      ui.splash = function(onGo) {
        var n = el("div", { class: "pc-scr", onclick: function() {
          app2.audio.unlock();
          onGo();
        } }, [logo(), el("div", { class: "pc-spacer" }), el("div", { class: "pc-tap", text: "\u30BF\u30C3\u30D7\u3057\u3066\u306F\u3058\u3081\u308B" }), el("div", { style: { height: "24vh" } })]);
        return screen(n);
      };
      function logo() {
        var letters = ["\u3077", "\u306B", "\u30C1", "\u30E3", "\u30F3", "\u30AF"], cols = ["#ff7aa8", "#ffb347", "#7b5cff", "#5aa8f0", "#3cc98a", "#ff6f9f"];
        return el("div", { class: "pc-logo" }, [el("div", { class: "ls" }, letters.map(function(c, i) {
          return el("span", { class: "l", text: c, style: { background: "radial-gradient(circle at 35% 30%,#fff 0," + cols[i] + " 60%)", animationDelay: i * 0.12 + "s", width: c === "\u30E3" ? "min(11vw,46px)" : "", height: c === "\u30E3" ? "min(11vw,46px)" : "", fontSize: c === "\u30E3" ? "min(7vw,28px)" : "", alignSelf: c === "\u30E3" ? "flex-end" : "" } });
        })), el("div", { class: "sub", text: "\u82F1\u8A9E\u8133\u30D0\u30D6\u30EB\u30D1\u30BA\u30EB" }), el("div", { class: "en", text: "PUNI CHUNK" })]);
      }
      ui.title = function(h) {
        var seen = !!(h.seenHow && h.seenHow());
        var how = btn("\u904A\u3073\u65B9", "ghost wide", function() {
          h.markHow && h.markHow();
          h.tutorial();
        }, "info");
        var play = btn("\u3042\u305D\u3076", "wide", h.play, "play");
        var row = el("div", { class: "pc-row" }, [
          el("div", { class: "pc-ibl" }, [ib("trophy", "\u8A18\u9332", h.records), document.createTextNode("\u8A18\u9332")]),
          el("div", { class: "pc-ibl" }, [ib("shop", "\u30B7\u30E7\u30C3\u30D7", h.shop), document.createTextNode("\u30B7\u30E7\u30C3\u30D7")]),
          el("div", { class: "pc-ibl" }, [ib("star", "\u30AF\u30EC\u30B8\u30C3\u30C8", h.credits), document.createTextNode("\u30AF\u30EC\u30B8\u30C3\u30C8")])
        ]);
        var n = el("div", { class: "pc-scr" }, [
          muteBtn(),
          el("div", { class: "pc-tgear" }, [ib("gear", "\u8A2D\u5B9A", h.settings)]),
          logo(),
          el("div", { class: "pc-spacer" }),
          el("div", { class: "pc-menu" }, seen ? [play, row, how] : [how, play, row]),
          el("div", { style: { height: "20vh", minHeight: "150px" } })
        ]);
        screen(n);
        setTimeout(function() {
          var lg = n.querySelector(".pc-logo"), mn = n.querySelector(".pc-menu"), H = stageEl.clientHeight;
          if (lg && mn && H) {
            var sr = stageEl.getBoundingClientRect();
            app2.band = { y0: (lg.getBoundingClientRect().bottom - sr.top) / H, y1: (mn.getBoundingClientRect().top - sr.top) / H };
          }
        }, 350);
        return n;
      };
      function muteBtn() {
        var b = ib("speaker", "\u97F3\u306E\u8A2D\u5B9A", function() {
          app2.openCommonSettings && app2.openCommonSettings();
        });
        b.style.position = "absolute";
        b.style.right = "14px";
        b.style.top = "calc(var(--pc-top) + 12px)";
        return b;
      }
      ui.modes = function(h) {
        var lvBox = el("div", { class: "pc-lv" }), desc = el("div", { class: "pc-lvdesc" }), list = el("div");
        function render() {
          lvBox.innerHTML = "";
          app2.LEVELS.forEach(function(L) {
            lvBox.appendChild(el("button", { class: L.id === app2.state.level ? "on" : "", text: L.name, onclick: function() {
              app2.audio.sfx("button");
              app2.state.level = L.id;
              app2.saveState();
              render();
            } }));
          });
          desc.textContent = app2.LEVELS[app2.state.level].desc;
          list.innerHTML = "";
          app2.MODES.forEach(function(m) {
            var best = app2.best(m.id, app2.state.level), locked = m.premium && !app2.services.store.isPremium();
            var ic = el("div", { class: "ic", style: { background: m.bg }, html: icon(m.icon) });
            var card = el("button", { class: "pc-mode" + (locked ? " locked" : ""), onclick: function() {
              if (early()) return;
              app2.audio.sfx("button");
              app2.audio.unlock();
              locked ? h.shop() : h.start(m.id);
            } }, [
              ic,
              el("div", { class: "tx" }, [el("b", { text: m.name }), el("small", { text: m.desc }), el("div", { class: "best", text: locked ? "\u30D7\u30EC\u30DF\u30A2\u30E0\u3067\u89E3\u653E" : best ? "BEST " + U.fmt(best) : "\u307E\u3060\u8A18\u9332\u306A\u3057" })]),
              locked ? el("span", { html: icon("lock").replace("<svg", '<svg class="lock"') }) : null
            ]);
            list.appendChild(card);
          });
        }
        render();
        return screen(el("div", { class: "pc-scr" }, [head("\u30E2\u30FC\u30C9\u3092\u3048\u3089\u3076", h.back), el("div", { class: "pc-lvnow", text: "\u3080\u305A\u304B\u3057\u3055:" + app2.LEVELS[app2.state.level].name + "(\u8A2D\u5B9A\u3067\u5909\u66F4)" }), list, el("div", { style: { height: "170px", flex: "0 0 auto" } })]));
      };
      function levelCard() {
        var lvBox = el("div", { class: "pc-lv" }), desc = el("div", { class: "pc-lvdesc" });
        function render() {
          lvBox.innerHTML = "";
          app2.LEVELS.forEach(function(L) {
            lvBox.appendChild(el("button", { class: L.id === app2.state.level ? "on" : "", text: L.name, onclick: function() {
              app2.audio.sfx("button");
              app2.state.level = L.id;
              app2.saveState();
              render();
            } }));
          });
          desc.textContent = app2.LEVELS[app2.state.level].desc;
        }
        render();
        return el("div", { class: "pc-card" }, [el("h3", { text: "\u3080\u305A\u304B\u3057\u3055" }), lvBox, desc]);
      }
      ui.settings = function(h) {
        var s = app2.settings;
        function sw(key, label, sub, dis) {
          var b = el("button", { class: "pc-sw" + (s[key] ? " on" : ""), "aria-label": label, "aria-pressed": s[key] ? "true" : "false", disabled: dis ? "disabled" : null, onclick: function() {
            s[key] = !s[key];
            b.classList.toggle("on", s[key]);
            app2.saveSettings();
            app2.audio.sfx("button");
            h.changed && h.changed(key);
          } });
          return el("div", { class: "pc-set" }, [el("div", {}, [document.createTextNode(label), sub ? el("small", { text: sub }) : null]), b]);
        }
        function seg(key, label, opts, dis, sub) {
          var box = el("div", { class: "pc-seg", "aria-disabled": dis ? "true" : "false" });
          opts.forEach(function(o) {
            box.appendChild(el("button", { class: s[key] === o[0] ? "on" : "", text: o[1], onclick: function() {
              s[key] = o[0];
              Array.prototype.forEach.call(box.children, function(c, i) {
                c.classList.toggle("on", opts[i][0] === o[0]);
              });
              app2.saveSettings();
              app2.audio.sfx("button");
              h.changed && h.changed(key);
            } }));
          });
          return el("div", { class: "pc-set" }, [el("div", {}, [document.createTextNode(label), sub ? el("small", { text: sub }) : null]), box]);
        }
        function range(key, label) {
          var r = el("input", { type: "range", class: "pc-range", min: 0, max: 100, value: Math.round(s[key] * 100), "aria-label": label });
          r.addEventListener("input", function() {
            s[key] = r.value / 100;
            app2.saveSettings();
            app2.applyAudio();
          });
          r.addEventListener("change", function() {
            app2.audio.sfx("button");
          });
          return el("div", { class: "pc-set" }, [el("div", { text: label }), r]);
        }
        var autoBox = el("div");
        function renderAuto() {
          autoBox.innerHTML = "";
          autoBox.appendChild(sw("custom", "\u81EA\u5206\u3067\u7D30\u304B\u304F\u6C7A\u3081\u308B", "\u30AA\u30D5\u306E\u3068\u304D\u306F\u3001\u3080\u305A\u304B\u3057\u3055\u306B\u5408\u308F\u305B\u3066\u81EA\u52D5\u3067\u6C7A\u307E\u308B"));
          var dis = !s.custom;
          [["art", "\u51A0\u8A5E a / the"], ["prep", "\u524D\u7F6E\u8A5E at / on / in"], ["verb", "\u52D5\u8A5E\u306E\u5F62(\u904E\u53BB\u306A\u3069)"], ["ti", "to / -ing"], ["er", "-er / -est"]].forEach(function(k) {
            var b = el("div", { class: "pc-seg", "aria-disabled": dis ? "true" : "false" });
            [[true, "\u81EA\u52D5"], [false, "\u624B\u52D5"]].forEach(function(o) {
              b.appendChild(el("button", { class: s.auto[k[0]] === o[0] ? "on" : "", text: o[1], onclick: function() {
                s.auto[k[0]] = o[0];
                app2.saveSettings();
                app2.audio.sfx("button");
                renderAuto();
              } }));
            });
            autoBox.appendChild(el("div", { class: "pc-set" }, [el("div", { text: k[1] }), b]));
          });
          autoBox.appendChild(seg("color", "\u8272\u306E\u30D2\u30F3\u30C8", [["pos", "\u54C1\u8A5E"], ["chunk", "\u30C1\u30E3\u30F3\u30AF"], ["none", "\u306A\u3057"]], dis));
        }
        var oldCustom = h.changed;
        h.changed = function(k) {
          if (k === "custom") renderAuto();
          oldCustom && oldCustom(k);
        };
        renderAuto();
        var ttsNote = app2.audio.ttsAvailable() ? null : el("div", { class: "pc-ttsnote", text: "\u3053\u306E\u7AEF\u672B\u3067\u306F\u82F1\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052\u304C\u4F7F\u3048\u306A\u3044\u3088\u3046\u3067\u3059(\u5B57\u5E55\u3067\u8868\u793A\u3057\u307E\u3059)" });
        var data = el("div", { class: "pc-card" }, [el("h3", { text: "\u30C7\u30FC\u30BF" }), btn("\u8A18\u9332\u3092\u3059\u3079\u3066\u6D88\u3059", "ghost small", function() {
          ui.confirm("\u8A18\u9332\u3068\u8A2D\u5B9A\u3092\u6D88\u3057\u307E\u3059\u304B?", "\u3051\u3059", function() {
            app2.resetData();
            ui.toast("\u8A18\u9332\u3092\u6D88\u3057\u307E\u3057\u305F", "info");
          });
        })]);
        return screen(el("div", { class: "pc-scr" }, [
          head("\u8A2D\u5B9A", h.back),
          levelCard(),
          el("div", { class: "pc-card" }, [el("h3", { text: "\u97F3" }), btn("\u97F3\u30FB\u8AAD\u307F\u4E0A\u3052\u306E\u8A2D\u5B9A\u3092\u958B\u304F", "ghost small", function() {
            app2.openCommonSettings && app2.openCommonSettings();
          })]),
          el("div", { class: "pc-card" }, [el("h3", { text: "\u3042\u305D\u3073\u304B\u305F" }), seg("hint", "\u30D2\u30F3\u30C8", [["none", "\u306A\u3057"], ["press", "\u9577\u62BC\u3057"], ["always", "\u3044\u3064\u3082"]], false, "\u9577\u62BC\u3057:\u5019\u88DC\u304C\u76EE\u7ACB\u3064(\u30B3\u30F3\u30DC\u5C11\u3057\u6E1B)"), sw("gloss", "\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u5473\u3092\u8868\u793A", "\u3067\u304D\u305F\u30C1\u30E3\u30F3\u30AF\u306B\u65E5\u672C\u8A9E\u3092\u5C0F\u3055\u304F\u51FA\u3059")]),
          el("div", { class: "pc-card" }, [el("h3", { text: "\u81EA\u52D5 / \u624B\u52D5" }), autoBox]),
          el("div", { class: "pc-card" }, [el("h3", { text: "\u6F14\u51FA" }), sw("lite", "\u8EFD\u91CF\u30E2\u30FC\u30C9", "\u53E4\u3044\u7AEF\u672B\u5411\u3051\u306B\u6F14\u51FA\u3092\u3072\u304B\u3048\u3081\u306B"), sw("vibe", "\u632F\u52D5", "\u5BFE\u5FDC\u3057\u3066\u3044\u308B\u7AEF\u672B\u306E\u307F")]),
          data,
          el("div", { style: { height: "20px", flex: "0 0 auto" } })
        ]));
      };
      ui.records = function(h) {
        var tabs = el("div", { class: "pc-tabs" }), box = el("div", { class: "pc-card" }), sel = { m: app2.MODES[0].id, l: app2.state.level };
        function render() {
          tabs.innerHTML = "";
          app2.MODES.forEach(function(m) {
            tabs.appendChild(el("button", { class: m.id === sel.m ? "on" : "", text: m.name, onclick: function() {
              sel.m = m.id;
              app2.audio.sfx("button");
              render();
            } }));
          });
          box.innerHTML = "";
          var lv = el("div", { class: "pc-lv", style: { marginBottom: "8px" } });
          app2.LEVELS.forEach(function(L) {
            lv.appendChild(el("button", { class: L.id === sel.l ? "on" : "", text: L.name, onclick: function() {
              sel.l = L.id;
              app2.audio.sfx("button");
              render();
            } }));
          });
          box.appendChild(lv);
          var listEl = el("div");
          box.appendChild(listEl);
          app2.services.ranking.top(sel.m, sel.l).then(function(list) {
            if (!list.length) {
              listEl.appendChild(el("div", { class: "pc-empty", text: "\u307E\u3060\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093" }));
              return;
            }
            list.forEach(function(r, i) {
              listEl.appendChild(el("div", { class: "pc-rank" }, [el("div", { class: "n", text: String(i + 1) }), el("div", { class: "s" }, [document.createTextNode(U.fmt(r.score)), el("small", { text: "  " + (r.sentences || 0) + "\u6587 \xB7 " + (r.date || "") })])]));
            });
          });
        }
        render();
        var st = app2.lifetime();
        return screen(el("div", { class: "pc-scr" }, [
          head("\u8A18\u9332", h.back),
          tabs,
          box,
          el("div", { class: "pc-card" }, [el("h3", { text: "\u3053\u308C\u307E\u3067" }), el("div", { class: "pc-stats" }, [stat(st.plays, "\u3042\u305D\u3093\u3060\u56DE\u6570"), stat(st.sentences, "\u4F5C\u3063\u305F\u6587"), stat(st.maxCombo, "\u6700\u5927\u30B3\u30F3\u30DC"), stat(st.longestN, "\u3044\u3061\u3070\u3093\u9577\u3044\u6587(\u8A9E)")]), st.longest ? el("div", { class: "pc-sent", style: { marginTop: "8px" } }, [el("span", { text: st.longest }), speakBtn(st.longest)]) : null])
        ]));
      };
      function stat(v, l) {
        return el("div", {}, [el("b", { text: U.fmt(v || 0) }), el("small", { text: l })]);
      }
      function speakBtn(text) {
        return el("button", { "aria-label": "\u8AAD\u307F\u4E0A\u3052", html: icon("speaker"), onclick: function() {
          app2.audio.unlock();
          app2.audio.speak(text);
        } });
      }
      ui.shop = function(h) {
        var st = app2.services.store, box = el("div");
        function render() {
          box.innerHTML = "";
          var inv = st.inventory();
          var prem = st.isPremium();
          box.appendChild(el("div", { class: "pc-card" }, [el("h3", { text: "\u30D7\u30EC\u30DF\u30A2\u30E0" }), el("div", { class: "pc-prod" }, [el("div", { class: "ic", html: icon("star") }), el("div", { class: "tx" }, [el("b", { text: "\u30D7\u30EC\u30DF\u30A2\u30E0\u4F1A\u54E1" }), el("small", { text: "\u65E5\u66FF\u308F\u308A\u304A\u984C+\u81EA\u7531\u306B\u4F7F\u3048\u308B\u300C\u3042\u304D\u300D\u30B9\u30ED\u30C3\u30C8" })]), prem ? el("b", { text: "\u52A0\u5165\u4E2D", style: { color: "#3cc98a" } }) : btn(st.price("premium"), "pink small", function() {
            buy("premium");
          })])]));
          var items = [["hint", "hint", "\u30D2\u30F3\u30C8+ \xD75", "\u4F5C\u308C\u308B\u6587\u3092\u756A\u53F7\u3067\u6559\u3048\u3066\u304F\u308C\u308B"], ["magic", "magic", "\u307E\u307B\u3046\u30D0\u30D6\u30EB \xD73", "\u3064\u306A\u3052\u305F\u3044\u5358\u8A9E\u306B\u5909\u8EAB\u3059\u308B"], ["auto", "auto", "\u30AA\u30FC\u30C8\u304F\u3063\u3064\u3051 \xD73", "\u5358\u8A9E\u3092\u81EA\u52D5\u3067\u30C1\u30E3\u30F3\u30AF\u306B\u3059\u308B"]];
          box.appendChild(el("div", { class: "pc-card" }, [el("h3", { text: "\u30A2\u30A4\u30C6\u30E0" })].concat(items.map(function(it) {
            return el("div", { class: "pc-prod" }, [el("div", { class: "ic", html: icon(it[1]) }), el("div", { class: "tx" }, [el("b", { text: it[2] }), el("small", { text: it[3] + "(\u6240\u6301 " + (inv[it[0]] || 0) + ")" })]), btn(st.price(it[0]), "yellow small", function() {
              buy(it[0]);
            })]);
          }))));
          if (st.isDummy) box.lastChild.appendChild(el("div", { class: "pc-note", text: "\u30C6\u30B9\u30C8\u7248:\u5B9F\u969B\u306E\u652F\u6255\u3044\u306F\u767A\u751F\u3057\u307E\u305B\u3093" }));
        }
        function buy(id) {
          ui.confirm(st.isDummy ? "(\u30C6\u30B9\u30C8\u8CFC\u5165)\u8CFC\u5165\u3057\u307E\u3059\u304B?" : "\u8CFC\u5165\u3057\u307E\u3059\u304B?", "\u8CB7\u3046", function() {
            st.purchase(id).then(function(ok) {
              if (ok) {
                app2.audio.sfx("best");
                ui.toast("\u3042\u308A\u304C\u3068\u3046!", "info");
                app2.emit("purchase", { id });
              } else ui.toast("\u8CFC\u5165\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "x");
              render();
            });
          });
        }
        render();
        return screen(el("div", { class: "pc-scr" }, [head("\u30B7\u30E7\u30C3\u30D7", h.back), box]));
      };
      ui.credits = function(h) {
        return screen(el("div", { class: "pc-scr" }, [head("\u30AF\u30EC\u30B8\u30C3\u30C8", h.back), el("div", { class: "pc-card pc-credits" }, [
          el("h3", { text: "\u3077\u306B\u30C1\u30E3\u30F3\u30AF" }),
          el("p", { text: "\u82F1\u8A9E\u3092\u300C\u30C1\u30E3\u30F3\u30AF(\u610F\u5473\u306E\u304B\u305F\u307E\u308A)\u300D\u3067\u3064\u304B\u3080\u3001\u30D0\u30D6\u30EB\u30D1\u30BA\u30EB\u3002" }),
          el("p", { text: "\u30B0\u30E9\u30D5\u30A3\u30C3\u30AF\u30FB\u52B9\u679C\u97F3\u30FBBGM\u30FB\u30C1\u30E3\u30F3\u30AF\u304F\u3093\u306F\u3001\u3059\u3079\u3066\u30D7\u30ED\u30B0\u30E9\u30E0\u3067\u63CF\u3044\u3066\u3044\u307E\u3059\u3002\u5916\u90E8\u306E\u7D20\u6750\u306F\u4F7F\u3063\u3066\u3044\u307E\u305B\u3093\u3002" }),
          el("h3", { text: "\u8F9E\u66F8" }),
          el("p", { text: app2.dictCredit }),
          el("p", { text: "\u82F1\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052\u306B\u306F\u3001\u7AEF\u672B\u306B\u5185\u8535\u3055\u308C\u305F\u97F3\u58F0\u5408\u6210\u3092\u4F7F\u3063\u3066\u3044\u307E\u3059\u3002" }),
          el("h3", { text: "\u30D0\u30FC\u30B8\u30E7\u30F3" }),
          el("p", { class: "pc-en", text: "v" + app2.version })
        ])]));
      };
      ui.pause = function(h) {
        var n = el("div", { class: "pc-modal" }, [el("div", { class: "pc-dim" }), el("div", { class: "pc-card" }, [
          el("h3", { text: "\u3072\u3068\u4F11\u307F", style: { fontSize: "20px" } }),
          el("div", { class: "pc-menu" }, [btn("\u3064\u3065\u3051\u308B", "wide", h.resume, "play"), btn("\u3084\u308A\u306A\u304A\u3059", "ghost wide", h.retry, "retry"), h.finish ? btn("\u304A\u308F\u308B(\u7D50\u679C\u3078)", "ghost wide", h.finish) : null, btn("\u8A2D\u5B9A", "ghost wide", h.settings, "gear"), btn("\u30BF\u30A4\u30C8\u30EB\u3078", "ghost wide", h.title, "home")])
        ])]);
        n.style.zIndex = 35;
        stageEl.appendChild(n);
        return n;
      };
      ui.confirm = function(msg, ok, fn, cancelLabel) {
        var n = el("div", { class: "pc-modal" }, [el("div", { class: "pc-dim" }), el("div", { class: "pc-card" }, [el("p", { text: msg }), el("div", { class: "pc-row" }, [btn(cancelLabel || "\u3084\u3081\u308B", "ghost small", function() {
          n.remove();
        }), btn(ok, "pink small", function() {
          n.remove();
          fn();
        })])])]);
        n.style.zIndex = 50;
        stageEl.appendChild(n);
        return n;
      };
      ui.result = function(r, h) {
        var scoreEl = el("div", { class: "pc-res-score", text: "0" });
        var list = el("div", { class: "pc-list" }, r.stats.list.length ? r.stats.list.map(function(s) {
          return el("div", { class: "pc-sent" }, [el("span", { text: s.text }), speakBtn(s.text)]);
        }) : [el("div", { class: "pc-empty", text: "\u6587\u306F\u307E\u3060\u4F5C\u308C\u306A\u304B\u3063\u305F\u2026\u6B21\u306F\u304D\u3063\u3068!" })]);
        var goal = r.goal ? el("div", { class: "pc-goal" + (r.goal.done ? " done" : "") }, [el("span", { text: r.goal.done ? "\u25CE \u304A\u984C\u30AF\u30EA\u30A2! +" + U.fmt(r.goal.bonus) : "\u25B3 \u304A\u984C:" + r.goal.text })]) : null;
        var n = el("div", { class: "pc-scr" }, [
          el("div", { class: "pc-head", style: { justifyContent: "center" } }, [el("h2", { text: r.modeName + " \xB7 " + r.levelName })]),
          el("div", { class: "pc-card", style: { textAlign: "center" } }, [scoreEl, r.newBest ? el("div", { class: "pc-new", text: "NEW RECORD!" }) : el("div", { style: { fontSize: "12px", color: "#8a7da0", fontWeight: 800 }, text: r.best ? "BEST " + U.fmt(r.best) : "" }), r.practice ? el("div", { class: "pc-note", text: "\u4ECA\u65E5\u306E\u8A18\u9332\u306F\u3064\u3051\u6E08\u307F(\u7DF4\u7FD2\u30D7\u30EC\u30A4)" }) : null]),
          goal,
          el("div", { class: "pc-card" }, [el("div", { class: "pc-stats" }, [stat(r.stats.sentences, "\u4F5C\u3063\u305F\u6587"), stat(r.stats.chunks, "\u30C1\u30E3\u30F3\u30AF"), stat(r.stats.maxCombo, "\u6700\u5927\u30B3\u30F3\u30DC"), stat(r.stats.longestN, "\u3044\u3061\u3070\u3093\u9577\u3044\u6587(\u8A9E)")])]),
          el("div", { class: "pc-card" }, [el("h3", { text: "\u4F5C\u3063\u305F\u6587" }), list]),
          el("div", { class: "pc-menu" }, [btn("\u3082\u3046\u4E00\u5EA6", "pink wide", h.retry, "retry"), el("div", { class: "pc-row" }, [btn("\u30E2\u30FC\u30C9", "ghost small", h.modes), btn("\u30BF\u30A4\u30C8\u30EB", "ghost small", h.title, "home")])]),
          el("div", { style: { height: "120px", flex: "0 0 auto" } })
        ]);
        screen(n);
        var t0 = performance.now(), D = 900;
        (function step() {
          var k = Math.min(1, (performance.now() - t0) / D);
          scoreEl.textContent = U.fmt(r.score * U.E.outCubic(k));
          if (k < 1 && n.isConnected) requestAnimationFrame(step);
        })();
        return n;
      };
      ui.hudShow = function(h) {
        ui.hudHide();
        var timer = el("div", { class: "pc-timer", html: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="rgba(255,255,255,.92)" stroke="#e6defa" stroke-width="5"/><circle class="arc" cx="26" cy="26" r="22" fill="none" stroke="#7b5cff" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg><span>60</span>' });
        var score = el("b", { text: "0" }), combo = el("span", { class: "pc-combo", text: "x1.0" });
        hudEl = el("div", { class: "pc-hud" }, [ib("pause", "\u4E00\u6642\u505C\u6B62", h.pause), el("div", { class: "pc-score" }, [score, combo]), timer]);
        prevEl = el("div", { class: "pc-prev" }, [el("div", { class: "empty" })]);
        itemsEl = el("div", { class: "pc-items" });
        stageEl.appendChild(hudEl);
        stageEl.appendChild(prevEl);
        stageEl.appendChild(itemsEl);
        ui._hud = { score, combo, timer, arc: timer.querySelector(".arc"), num: timer.querySelector("span"), last: {} };
        ui.itemsRender(h.inv(), h.useItem);
      };
      ui.hudHide = function() {
        ui.goal = null;
        [hudEl, prevEl, itemsEl].forEach(function(e) {
          if (e) e.remove();
        });
        hudEl = prevEl = itemsEl = null;
        ui._hud = null;
        ui.tip(null);
      };
      ui.itemsPos = function(y) {
        if (itemsEl) itemsEl.style.top = y - 20 + "px";
      };
      ui.itemsRender = function(inv, use) {
        if (!itemsEl) return;
        itemsEl.innerHTML = "";
        [["hint", "\u30D2\u30F3\u30C8+"], ["magic", "\u307E\u307B\u3046\u30D0\u30D6\u30EB"], ["auto", "\u30AA\u30FC\u30C8\u304F\u3063\u3064\u3051"]].forEach(function(k) {
          var c = inv[k[0]] || 0, b = el("button", { class: c ? "" : "zero", "aria-label": k[1], html: icon(k[0]) + "<em>" + c + "</em>", onclick: function() {
            app2.audio.unlock();
            if (!c) {
              app2.audio.sfx("reject");
              ui.toast(k[1] + "\u306F\u30B7\u30E7\u30C3\u30D7\u3067\u624B\u306B\u5165\u308B", "info");
              return;
            }
            use(k[0]);
          } });
          itemsEl.appendChild(b);
        });
      };
      ui.hud = function(o) {
        var H = ui._hud;
        if (!H) return;
        var L = H.last;
        var sc = U.fmt(o.score);
        if (L.score !== sc) {
          H.score.textContent = sc;
          H.score.classList.add("bump");
          clearTimeout(H.bt);
          H.bt = setTimeout(function() {
            H.score.classList.remove("bump");
          }, 140);
          L.score = sc;
        }
        var cb = o.combo >= 2 ? o.combo + " COMBO  x" + o.mult.toFixed(1) : "";
        if (L.cb !== cb) {
          H.combo.textContent = cb;
          H.combo.classList.toggle("on", !!cb);
          L.cb = cb;
        }
        var k, txt;
        if (o.time != null) {
          k = U.clamp(o.time / (o.timeMax || 60), 0, 1);
          txt = String(Math.ceil(o.time));
        } else if (o.fill != null) {
          k = U.clamp(o.fill, 0, 1);
          txt = Math.round(o.fill * 100) + "%";
        } else {
          k = 1;
          txt = "\u221E";
        }
        var off = (138.2 * (1 - k)).toFixed(1);
        if (L.off !== off) {
          H.arc.setAttribute("stroke-dashoffset", off);
          L.off = off;
        }
        if (L.txt !== txt) {
          H.num.textContent = txt;
          L.txt = txt;
        }
        var col = o.warn ? "#ef4d63" : o.fill != null ? "#f5a524" : "#7b5cff";
        if (L.col !== col) {
          H.arc.setAttribute("stroke", col);
          L.col = col;
        }
        if (L.warn !== o.warn) {
          H.timer.classList.toggle("warn", !!o.warn);
          L.warn = o.warn;
        }
      };
      ui.preview = function(text, state, sub) {
        if (!prevEl) return;
        var d = prevEl.firstChild;
        if (!text) {
          if (ui.goal) {
            d.className = "goal";
            d.innerHTML = "";
            d.appendChild(el("i", { text: "\u2605" }));
            d.appendChild(el("small", { text: "\u304A\u984C:" + ui.goal }));
          } else d.className = "empty";
          return;
        }
        var mark = state === "ok" ? "\u2713" : state === "bad" ? "\xD7" : state === "sel" ? "\u25CF" : "\u2026";
        d.className = state || "";
        d.innerHTML = "";
        d.appendChild(el("i", { text: mark }));
        d.appendChild(el("span", { text }));
        if (sub) d.appendChild(el("small", { text: sub }));
      };
      var toastEl = null;
      ui.toast = function(msg, kind) {
        if (toastEl) toastEl.remove();
        toastEl = el("div", { class: "pc-toast " + (kind || "info") }, [el("i", { text: kind === "x" ? "\xD7" : kind === "tri" ? "\u25B3" : "!" }), el("span", { text: msg })]);
        stageEl.appendChild(toastEl);
        var t = toastEl;
        setTimeout(function() {
          if (t === toastEl) {
            t.remove();
            toastEl = null;
          }
        }, 2300);
      };
      var banEl = null;
      ui.banner = function(text, marks, pts, o) {
        o = o || {};
        if (banEl) banEl.remove();
        var html = esc2(text);
        (marks || []).forEach(function(m) {
          var re = new RegExp("\\b(" + m.replace(/(es|s)$/, "") + ")(es|s)\\b");
          html = html.replace(re, "$1<u>$2</u>");
        });
        banEl = el("div", { class: "pc-banner" }, [el("div", { html: '<span class="ok">' + icon("check") + "</span>" + html + "<small>" + (o.perfect ? '<b class="pf">PERFECT!</b> ' : "") + "+" + U.fmt(pts) + (o.slot ? "  \u30B9\u30ED\u30C3\u30C8\xD7" + o.slot.toFixed(1) : "") + (o.shock ? "  \u4F59\u6CE2\xD7" + o.shock : "") + "</small>" })]);
        stageEl.appendChild(banEl);
        var b = banEl;
        setTimeout(function() {
          if (b === banEl) {
            b.remove();
            banEl = null;
          }
        }, 2200);
      };
      function esc2(s) {
        return String(s).replace(/[&<>"]/g, function(c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
      }
      var cntEl = null;
      ui.count = function(text, big) {
        if (cntEl) cntEl.remove();
        cntEl = el("div", { class: "pc-count" + (big || text.length > 2 ? " big" : ""), text });
        stageEl.appendChild(cntEl);
        var c = cntEl;
        setTimeout(function() {
          if (c === cntEl) {
            c.remove();
            cntEl = null;
          }
        }, big ? 1450 : 820);
      };
      var tipEl = null;
      ui.tip = function(text, gloss, x, y) {
        if (!text) {
          if (tipEl) {
            tipEl.remove();
            tipEl = null;
          }
          return;
        }
        if (!tipEl) {
          tipEl = el("div", { class: "pc-tip" });
          stageEl.appendChild(tipEl);
        }
        tipEl.innerHTML = "";
        tipEl.appendChild(document.createTextNode(text));
        if (gloss) tipEl.appendChild(el("small", { text: gloss }));
        var W = stageEl.clientWidth, half = Math.min(W / 2 - 8, (tipEl.offsetWidth || 120) / 2 + 2);
        tipEl.style.left = U.clamp(x, half + 4, W - half - 4) + "px";
        tipEl.style.top = Math.max(y, 120) + "px";
      };
      ui.say = function(html, o) {
        ui.unsay();
        o = o || {};
        var row = el("div", { class: "row" }, [o.next ? btn(o.nextLabel || "\u3064\u304E\u3078", "small", o.next) : null]);
        var n = el("div", { class: "pc-say", style: { bottom: (o.bottom || 140) + "px" } }, [el("p", { html }), o.next ? row : null]);
        stageEl.appendChild(n);
        ui._say = n;
        return n;
      };
      ui.unsay = function() {
        if (ui._say) {
          ui._say.remove();
          ui._say = null;
        }
      };
      ui.skip = function(fn) {
        var b = btn("\u30B9\u30AD\u30C3\u30D7", "ghost small pc-skip", fn);
        stageEl.appendChild(b);
        ui._skip = b;
        return b;
      };
      ui.unskip = function() {
        if (ui._skip) {
          ui._skip.remove();
          ui._skip = null;
        }
      };
      ui.destroy = function() {
        ui.hudHide();
        ui.unsay();
        ui.unskip();
        stageEl.innerHTML = "";
      };
      return ui;
    }
    return { create, injectCSS, removeCSS };
  })();

  // games/punichunk/src/app.js
  var VERSION = "1.0.0";
  var LEVELS = [
    { id: 0, name: "\u3084\u3055\u3057\u3044", desc: "\u305C\u3093\u3076\u81EA\u52D5\u3067\u76F4\u3057\u3066\u304F\u308C\u308B\u3002\u307E\u305A\u306F\u3053\u3053\u304B\u3089", auto: { art: true, prep: true, verb: true, ti: true, er: true }, color: "pos", maxLevel: 1 },
    { id: 1, name: "\u3075\u3064\u3046", desc: "\u51A0\u8A5E\u30FB\u524D\u7F6E\u8A5E\u30FBto/-ing\u30FB-er/-est \u3092\u81EA\u5206\u3067\u9078\u3076", auto: { art: false, prep: false, verb: true, ti: false, er: false }, color: "pos", maxLevel: 2 },
    { id: 2, name: "\u3080\u305A\u304B\u3057\u3044", desc: "\u52D5\u8A5E\u306E\u5F62\u3082\u81EA\u5206\u3067\u3002\u8272\u306F\u30C1\u30E3\u30F3\u30AF\u3060\u3051", auto: { art: false, prep: false, verb: false, ti: false, er: false }, color: "chunk", maxLevel: 3 },
    { id: 3, name: "\u9B3C", desc: "\u8272\u306E\u30D2\u30F3\u30C8\u306A\u3057\u30FB\u305C\u3093\u3076\u624B\u52D5", auto: { art: false, prep: false, verb: false, ti: false, er: false }, color: "none", maxLevel: 4 }
  ];
  var MODES = [
    { id: "shot", name: "\u30DC\u30D6\u30EB(\u8A66\u4F5C)", desc: "\u4E0B\u304B\u3089\u6483\u3063\u3066\u3001\u3068\u306A\u308A\u306E\u5358\u8A9E\u3068\u30C1\u30E3\u30F3\u30AF\u30FB\u6587\u3092\u4F5C\u3063\u3066\u6D88\u3059", icon: "magic", bg: "linear-gradient(160deg,#ff8fb8,#ff5f8f)" },
    { id: "ta", name: "\u30BF\u30A4\u30E0\u30A2\u30BF\u30C3\u30AF", desc: "60\u79D2\u3002\u9577\u3044\u6587\u307B\u3069\u6642\u9593\u304C\u306E\u3073\u308B", icon: "play", bg: "linear-gradient(160deg,#9a80ff,#6a4cf0)" },
    { id: "over", name: "\u3042\u3075\u308C\u6CE8\u610F", desc: "\u30D0\u30D6\u30EB\u304C\u3042\u3075\u308C\u305F\u3089\u7D42\u308F\u308A", icon: "magic", bg: "linear-gradient(160deg,#ffb36b,#ff7a59)" },
    { id: "free", name: "\u30D5\u30EA\u30FC", desc: "\u6642\u9593\u5236\u9650\u306A\u3057\u3002\u3058\u3063\u304F\u308A\u7DF4\u7FD2", icon: "info", bg: "linear-gradient(160deg,#6fe0ad,#2fbf83)" },
    { id: "daily", name: "\u65E5\u66FF\u308F\u308A\u304A\u984C", desc: "\u6BCE\u65E5\u3061\u304C\u3046\u304A\u984C\u3068\u76E4\u9762\u30671\u56DE\u52DD\u8CA0", icon: "star", bg: "linear-gradient(160deg,#ffd76a,#ffb21f)", premium: true }
  ];
  var GOALS = [
    { id: "long", text: "5\u8A9E\u4EE5\u4E0A\u306E\u6587\u30923\u3064\u4F5C\u308B", test: function(s) {
      return s.list.filter(function(x) {
        return x.words >= 5;
      }).length >= 3;
    } },
    { id: "past", text: "\u904E\u53BB\u306E\u6587\u30923\u3064\u4F5C\u308B", test: function(s) {
      return s.past >= 3;
    } },
    { id: "front", text: "\u524D\u7F6E\u304D\u3064\u304D\u306E\u6587\u30922\u3064\u4F5C\u308B", test: function(s) {
      return s.front >= 2;
    } },
    { id: "coord", text: "and / but / so \u3067\u6587\u3092\u3064\u306A\u3050", test: function(s) {
      return s.coord >= 1;
    } },
    { id: "clause", text: "when / if \u306A\u3069\u306E\u7BC0\u3092\u4F7F\u3046", test: function(s) {
      return s.clause >= 1;
    } },
    { id: "slot", text: "\u30B9\u30ED\u30C3\u30C8\u3067\u6587\u30924\u3064\u4F5C\u308B", test: function(s) {
      return s.slotS >= 4;
    } },
    { id: "combo", text: "\u30B3\u30F3\u30DC\u309215\u4EE5\u4E0A\u3064\u306A\u3050", test: function(s) {
      return s.maxCombo >= 15;
    } },
    { id: "many", text: "\u6587\u30928\u3064\u4F5C\u308B", test: function(s) {
      return s.sentences >= 8;
    } }
  ];
  var DEFAULT_SETTINGS = { bgm: 0.5, sfx: 0.8, voice: true, rate: 1, hint: "press", gloss: true, custom: false, auto: { art: false, prep: false, verb: true, ti: false, er: false }, color: "pos", lite: false, vibe: true };
  function localStorageAdapter(prefix) {
    prefix = prefix || "punichunk:";
    var mem = {};
    function ls() {
      try {
        var x = window.localStorage;
        x.setItem(prefix + "__t", "1");
        x.removeItem(prefix + "__t");
        return x;
      } catch (e) {
        return null;
      }
    }
    var s = ls();
    return {
      get: function(k) {
        try {
          var v = s ? s.getItem(prefix + k) : mem[k];
          return v == null ? null : JSON.parse(v);
        } catch (e) {
          return null;
        }
      },
      set: function(k, v) {
        var j = JSON.stringify(v);
        try {
          if (s) s.setItem(prefix + k, j);
          else mem[k] = j;
        } catch (e) {
          mem[k] = j;
        }
      },
      remove: function(k) {
        try {
          if (s) s.removeItem(prefix + k);
          delete mem[k];
        } catch (e) {
        }
      }
    };
  }
  function localRanking(storage) {
    return {
      submit: function(e) {
        var all = storage.get("rank") || {}, key = e.mode + ":" + e.level, list = all[key] || [];
        list.push(e);
        list.sort(function(a, b) {
          return b.score - a.score;
        });
        all[key] = list.slice(0, 10);
        storage.set("rank", all);
        return Promise.resolve({ rank: all[key].indexOf(e) + 1 });
      },
      top: function(mode, level) {
        var all = storage.get("rank") || {};
        return Promise.resolve((all[mode + ":" + level] || []).slice());
      },
      isLocal: true
    };
  }
  function localStore(storage) {
    var PRICE = { premium: "\xA5480", hint: "\xA5120", magic: "\xA5120", auto: "\xA5120" }, GRANT = { hint: 5, magic: 3, auto: 3 };
    function load() {
      return storage.get("store") || { premium: false, inv: { hint: 3, magic: 3, auto: 3 } };
    }
    function save(d) {
      storage.set("store", d);
    }
    return {
      isDummy: true,
      isPremium: function() {
        return !!load().premium;
      },
      inventory: function() {
        return Object.assign({}, load().inv);
      },
      consume: function(id) {
        var d = load();
        if (!d.inv[id]) return false;
        d.inv[id]--;
        save(d);
        return true;
      },
      purchase: function(id) {
        var d = load();
        if (id === "premium") d.premium = true;
        else d.inv[id] = (d.inv[id] || 0) + (GRANT[id] || 1);
        save(d);
        return Promise.resolve(true);
      },
      price: function(id) {
        return PRICE[id] || "\xA5120";
      }
    };
  }
  function mount(container, options) {
    if (!container || !container.appendChild) throw new Error("PuniChunk.mount: \u8981\u7D20\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    options = options || {};
    UI.injectCSS();
    var listeners = [], raf = 0, dead = false, ro = null;
    function listen(t, ev, fn, o) {
      t.addEventListener(ev, fn, o);
      listeners.push([t, ev, fn, o]);
    }
    var root = U.el("div", { class: "pc-root" }), stageEl = U.el("div", { class: "pc-stage" });
    var bg = U.el("canvas", { class: "pc-bg", "aria-hidden": "true" }), cv = U.el("canvas", { class: "pc-cv", "aria-label": "\u30B2\u30FC\u30E0\u753B\u9762" }), probe = U.el("div", { class: "pc-probe" });
    stageEl.appendChild(bg);
    stageEl.appendChild(cv);
    root.appendChild(probe);
    root.appendChild(stageEl);
    container.appendChild(root);
    var storage = options.storage || localStorageAdapter(options.storagePrefix);
    var dict = options.dict ? Dict.validate(options.dict) : Dict.makeDefault();
    var settings = Object.assign({}, DEFAULT_SETTINGS, storage.get("settings") || {});
    settings.auto = Object.assign({}, DEFAULT_SETTINGS.auto, settings.auto || {});
    if (options.audio) {
      ["bgm", "sfx", "voice", "rate"].forEach(function(k) {
        if (options.audio[k] != null) settings[k] = options.audio[k];
      });
    }
    var state = Object.assign({ level: 0, tutorialDone: false }, storage.get("state") || {});
    var services = Object.assign({ ranking: localRanking(storage), store: localStore(storage) }, options.services || {});
    var reduced = false;
    try {
      reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
    }
    var app2 = {
      version: VERSION,
      LEVELS,
      MODES,
      dict,
      settings,
      state,
      services,
      storage,
      reduced,
      dictCredit: options.dictCredit || "\u8F9E\u66F8\u30C7\u30FC\u30BF:\u300C\u82F1\u8A9E\u8133\u30B2\u30FC\u30E0\u300D(eigo_nou)\u306E\u624B\u4F5C\u308A\u8F9E\u66F8\u3092\u3082\u3068\u306B\u4F5C\u6210\u3002",
      stage: { w: 360, h: 640, top: 0, bottom: 0 },
      dpr: 1,
      scene: "title",
      game: null
    };
    app2.openCommonSettings = options.openSettings || null;
    app2.emit = function(name, data) {
      if (name === "chunk") vibrate(10);
      else if (name === "sentence") vibrate([18, 40, 18]);
      else if (name === "fail") vibrate(30);
      if (options.onEvent) {
        try {
          options.onEvent(name, data || {});
        } catch (e) {
        }
      }
    };
    function vibrate(p) {
      if (settings.vibe && navigator.vibrate) {
        try {
          navigator.vibrate(p);
        } catch (e) {
        }
      }
    }
    app2.audio = Snd.create({ core: options.core });
    app2.applyAudio = function() {
      app2.audio.set({ vol: { bgm: settings.bgm, sfx: settings.sfx }, on: { bgm: settings.bgm > 0, sfx: settings.sfx > 0, voice: settings.voice }, rate: settings.rate });
    };
    app2.applyAudio();
    app2.saveSettings = function() {
      storage.set("settings", settings);
      app2.applyAudio();
    };
    app2.saveState = function() {
      storage.set("state", state);
    };
    app2.best = function(mode, level) {
      var b = storage.get("best") || {};
      return b[mode + ":" + level] || 0;
    };
    app2.lifetime = function() {
      return Object.assign({ plays: 0, sentences: 0, maxCombo: 0, longestN: 0, longest: "" }, storage.get("life") || {});
    };
    app2.resetData = function() {
      ["rank", "best", "life", "state", "settings", "daily"].forEach(function(k) {
        storage.remove(k);
      });
      Object.assign(settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      state.level = 0;
      state.tutorialDone = false;
      app2.applyAudio();
    };
    var ui = app2.ui = UI.create(app2, stageEl);
    var ctx = cv.getContext("2d"), bctx = bg.getContext("2d"), needResize = true;
    function measure() {
      var r = stageEl.getBoundingClientRect(), cs = getComputedStyle(probe);
      var top = options.insets && options.insets.top != null ? options.insets.top : parseFloat(cs.paddingTop) || 0;
      var bot = options.insets && options.insets.bottom != null ? options.insets.bottom : parseFloat(cs.paddingBottom) || 0;
      app2.stage = { w: Math.max(280, r.width), h: Math.max(420, r.height), top, bottom: bot };
      app2.dpr = Math.min(3, window.devicePixelRatio || 1);
      [cv, bg].forEach(function(c) {
        c.width = Math.round(app2.stage.w * app2.dpr);
        c.height = Math.round(app2.stage.h * app2.dpr);
      });
      root.style.setProperty("--pc-top", top + "px");
      root.style.setProperty("--pc-bottom", bot + "px");
      if (app2.game) {
        app2.game.layout();
        ui.itemsPos(app2.game.L.lane.y + app2.game.L.lane.h / 2);
      }
      needResize = false;
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function() {
        needResize = true;
        var r = stageEl.getBoundingClientRect();
        setAwayRef && setAwayRef("zero", r.width < 2 || r.height < 2);
      });
      ro.observe(stageEl);
    }
    var setAwayRef = null;
    listen(window, "resize", function() {
      needResize = true;
    });
    var city = Art.City(options.citySeed || 2024), decor = [];
    function makeDecor() {
      decor = [];
      var words = dict.getWords({ pos: "noun", maxLevel: 1, count: 3 }).map(function(e) {
        return { k: "n", e };
      }).concat(dict.getWords({ pos: "verb", maxLevel: 1, count: 3, tag: { simple: 1 } }).map(function(e) {
        return { k: "v", e };
      })).concat(dict.getWords({ pos: "adj", maxLevel: 1, count: 2 }).map(function(e) {
        return { k: "adj", e };
      })).concat([{ k: "det", v: "the" }]);
      var W0 = Math.max(300, Math.min(520, container.clientWidth || 390)), H0 = Math.max(500, container.clientHeight || 800);
      words.forEach(function(w, i) {
        var text = G.wordText(w, { auto: LEVELS[0].auto }), r = U.clamp(Art.measure(text, 15) / 2 + 13, 23, 44), best = null;
        for (var t = 0; t < 40; t++) {
          var x = 0.1 + Math.random() * 0.8, y = 0.24 + Math.random() * 0.28, md = 1e9;
          decor.forEach(function(d) {
            md = Math.min(md, Math.hypot((d.x - x) * W0, (d.y - y) * H0) - d.r - r);
          });
          if (!best || md > best.md) best = { x, y, md };
          if (md > 8) break;
        }
        decor.push({ w, text, r, x: best.x, y: best.y, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02, ph: Math.random() * 6 });
      });
    }
    makeDecor();
    var T = 0, last = performance.now(), blink = 2, kunExpr = "normal";
    function frame(now) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1e3);
      last = now;
      T += dt;
      if (needResize) measure();
      var W = app2.stage.w, H = app2.stage.h, d = app2.dpr, g = app2.game;
      bctx.setTransform(d, 0, 0, d, 0, 0);
      var p = 0.32, lit = 0.25;
      if (g) {
        p = g.mode === "over" ? 0.15 + 0.8 * U.clamp(g.items.length / 34, 0, 1) : g.mode === "free" || g.mode === "tutorial" ? 0.2 + 0.25 * (Math.sin(T * 0.02) + 1) / 2 : U.clamp(0.08 + g.t / 140, 0, 0.97);
        lit = U.clamp(g.score / 4e3, 0.1, 1);
      } else if (app2.scene === "result") {
        p = 0.78;
        lit = 0.9;
      }
      city.draw(bctx, W, H, p, lit, T, d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (g) {
        g.update(dt);
        if (app2.game === g) g.draw(ctx);
      } else drawDecor(dt, W, H, app2.scene === "title" && app2.decor);
    }
    function drawDecor(dt, W, H, show) {
      var light = settings.lite || reduced;
      if (show && !light) for (var i = 0; i < decor.length; i++) for (var j = i + 1; j < decor.length; j++) {
        if (j >= U.clamp(Math.floor(((app2.band || { y0: 0.22, y1: 0.55 }).y1 - (app2.band || { y0: 0.22, y1: 0.55 }).y0) * H * W / 10500), 3, decor.length)) break;
        var p = decor[i], q = decor[j], dx = (q.x - p.x) * W, dy = (q.y - p.y) * H, dd = Math.hypot(dx, dy) || 1, mn = p.r + q.r + 6;
        if (dd < mn) {
          var o = (mn - dd) / 2 / dd;
          p.x -= dx * o / W;
          p.y -= dy * o / H;
          q.x += dx * o / W;
          q.y += dy * o / H;
        }
      }
      var bd0 = app2.band || { y0: 0.22, y1: 0.55 }, capN = U.clamp(Math.floor((bd0.y1 - bd0.y0) * H * W / 10500), 3, decor.length);
      if (show) decor.slice(0, capN).forEach(function(b) {
        if (!light) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        var mx = (b.r + 6) / W;
        if (b.x < mx) {
          b.x = mx;
          b.vx = Math.abs(b.vx);
        }
        if (b.x > 1 - mx) {
          b.x = 1 - mx;
          b.vx = -Math.abs(b.vx);
        }
        var bd = app2.band || { y0: 0.22, y1: 0.55 }, y0 = bd.y0 + (b.r + 4) / H, y1 = Math.max(y0, bd.y1 - (b.r + 4) / H);
        if (b.y < y0) {
          b.y = y0;
          b.vy = Math.abs(b.vy);
        }
        if (b.y > y1) {
          b.y = y1;
          b.vy = -Math.abs(b.vy);
        }
        var sp = Art.sprite({ text: b.text, col: Art.colorKeyOfWord(b.w), r: b.r, kind: "word", shape: "round", dpr: app2.dpr });
        var w = Math.sin(T * 2 + b.ph) * 0.03, x = b.x * W, y2 = b.y * H;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.translate(x, y2);
        ctx.scale(1 + w, 1 - w);
        ctx.drawImage(sp.cv, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        ctx.restore();
      });
      blink -= dt;
      if (blink < -0.12) blink = 2 + Math.random() * 3;
      if (app2.kun === false || app2.scene === "result" && H < 760) return;
      var s = Math.min(1.25, W / 330, H / 760), y = H - app2.stage.bottom - 66 * s;
      Art.chunkKun(ctx, W / 2 - 40 * s, y, { segs: 2, expr: app2.scene === "result" ? "joy" : kunExpr, t: T, blink: blink < 0 ? 0.1 : 1, scale: s, wave: app2.scene !== "result" && Math.sin(T * 0.7) > 0.6, walk: false });
    }
    function pos(e) {
      var r = stageEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    var activePtr = null;
    listen(root, "pointerup", function() {
      app2.audio.unlock();
    }, true);
    listen(root, "touchend", function() {
      app2.audio.unlock();
    }, true);
    listen(cv, "pointerdown", function(e) {
      app2.audio.unlock();
      if (!app2.game || activePtr != null) return;
      activePtr = e.pointerId;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (x) {
      }
      var p = pos(e);
      app2.game.down(p.x, p.y);
      e.preventDefault();
    });
    listen(cv, "pointermove", function(e) {
      if (!app2.game || e.pointerId !== activePtr) return;
      var p = pos(e);
      app2.game.move(p.x, p.y);
      e.preventDefault();
    });
    listen(cv, "pointerup", function(e) {
      if (e.pointerId !== activePtr) return;
      activePtr = null;
      if (!app2.game) return;
      var p = pos(e);
      app2.game.up(p.x, p.y);
    });
    listen(cv, "pointercancel", function(e) {
      if (e.pointerId !== activePtr) return;
      activePtr = null;
      if (app2.game) app2.game.cancel();
    });
    listen(root, "contextmenu", function(e) {
      e.preventDefault();
    });
    listen(root, "gesturestart", function(e) {
      e.preventDefault();
    });
    listen(root, "dblclick", function(e) {
      e.preventDefault();
    });
    var away = {};
    function setAway(why, on) {
      var was = Object.keys(away).length > 0;
      if (on) away[why] = 1;
      else delete away[why];
      var now = Object.keys(away).length > 0;
      if (was === now) return;
      if (now) {
        app2.audio.suspend();
        if (app2.game && app2.game.state !== "over" && app2.game.mode !== "tutorial") showPause();
        app2.emit("away", {});
      } else app2.audio.resume();
    }
    listen(document, "visibilitychange", function() {
      setAway("hidden", document.hidden);
    });
    listen(window, "pagehide", function() {
      setAway("hidden", true);
    });
    listen(window, "pageshow", function() {
      setAway("hidden", false);
    });
    if (options.pauseOnBlur !== false) {
      listen(window, "blur", function() {
        setAway("blur", true);
      });
      listen(window, "focus", function() {
        setAway("blur", false);
      });
      listen(root, "pointerdown", function() {
        setAway("blur", false);
      });
    }
    setAwayRef = setAway;
    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function(es) {
        es.forEach(function(e) {
          setAway("offscreen", !e.isIntersecting);
        });
      });
      io.observe(root);
    }
    listen(window, "keydown", function(e) {
      if (e.key === "Escape" && app2.game && app2.game.state !== "over" && !pauseEl) showPause();
    });
    var pauseEl = null, tut = null, lastMode = "ta";
    function toTitle() {
      endGame();
      app2.scene = "title";
      app2.decor = true;
      app2.kun = true;
      app2.audio.music("title");
      ui.title({ play: toPlay, seenHow: function() {
        return !!state.howSeen;
      }, markHow: function() {
        state.howSeen = true;
        app2.saveState();
      }, tutorial: function() {
        startTutorial(toTitle);
      }, records: function() {
        app2.decor = false;
        app2.kun = false;
        ui.records({ back: toTitle });
      }, shop: function() {
        app2.decor = false;
        app2.kun = false;
        ui.shop({ back: toTitle });
      }, settings: function() {
        app2.decor = false;
        app2.kun = false;
        ui.settings({ back: toTitle });
      }, credits: function() {
        app2.decor = false;
        app2.kun = false;
        ui.credits({ back: toTitle });
      } });
      app2.emit("screen", { name: "title" });
    }
    function toPlay() {
      toModes();
    }
    function toModes() {
      endGame();
      app2.scene = "title";
      app2.decor = false;
      app2.kun = true;
      app2.audio.music("title");
      ui.modes({ back: toTitle, start: startGame, shop: function() {
        app2.kun = false;
        ui.shop({ back: toModes });
      } });
      app2.emit("screen", { name: "modes" });
    }
    function endGame() {
      if (tut) {
        tut.stop();
        tut = null;
      }
      if (app2.game) {
        app2.game.destroy();
        app2.game = null;
      }
      ui.hudHide();
      if (pauseEl) {
        pauseEl.remove();
        pauseEl = null;
      }
      ui.unsay();
      ui.unskip();
    }
    function cfgFor(level) {
      var L = LEVELS[level] || LEVELS[0];
      return settings.custom ? { auto: Object.assign({}, settings.auto), color: settings.color, maxLevel: L.maxLevel } : { auto: Object.assign({}, L.auto), color: L.color, maxLevel: L.maxLevel };
    }
    function startGame(mode) {
      endGame();
      lastMode = mode;
      app2.scene = "game";
      ui.clear();
      app2.audio.music(null);
      var level = state.level, c = cfgFor(level), seed = null, goal = null, practice = false;
      if (mode === "daily") {
        var day = U.today();
        seed = U.hash("daily:" + day);
        goal = GOALS[seed % GOALS.length];
        practice = !!(storage.get("daily") || {})[day];
      }
      var g = Game.create(app2, { mode, level, auto: c.auto, colorMode: c.color, maxLevel: c.maxLevel, seed, freeSlot: services.store.isPremium() });
      g.goal = goal;
      g.practice = practice;
      app2.game = g;
      ui.hudShow({ pause: showPause, inv: function() {
        return services.store.inventory();
      }, useItem });
      g.start();
      ui.itemsPos(mode === "shot" ? -200 : g.L.lane.y + g.L.lane.h / 2);
      if (goal) {
        ui.goal = goal.text + (practice ? "(\u7DF4\u7FD2)" : "");
        ui.preview("", "");
      }
      app2.emit("screen", { name: "game", mode });
    }
    function useItem(id) {
      var g = app2.game;
      if (!g || g.state !== "play") return;
      if (!services.store.consume(id)) return;
      if (!g.useItem(id)) services.store.purchase && services.store.isDummy && refund(id);
      ui.itemsRender(services.store.inventory(), useItem);
      app2.emit("item", { id });
    }
    function refund(id) {
      var d = storage.get("store");
      if (d && d.inv) {
        d.inv[id] = (d.inv[id] || 0) + 1;
        storage.set("store", d);
      }
    }
    function startTutorial(after) {
      endGame();
      app2.scene = "game";
      ui.clear();
      app2.audio.music("title");
      var L = LEVELS[0], g = Game.create(app2, { mode: "tutorial", level: 0, auto: L.auto, colorMode: "pos", maxLevel: 1 });
      app2.game = g;
      ui.hudShow({ pause: showPause, inv: function() {
        return {};
      }, useItem: function() {
      } });
      g.start();
      ui.itemsPos(-200);
      tut = Tutorial.run(app2, g, function() {
        state.tutorialDone = true;
        app2.saveState();
        tut = null;
        after();
      });
      app2.emit("screen", { name: "tutorial" });
    }
    function showPause() {
      var g = app2.game;
      if (!g || pauseEl) return;
      g.pause();
      app2.audio.music(null);
      app2.emit("pause", {});
      pauseEl = ui.pause({
        resume: function() {
          pauseEl.remove();
          pauseEl = null;
          g.resume();
          if (g.state === "play") app2.audio.music("play");
          app2.emit("resume", {});
        },
        retry: function() {
          if (g.mode === "tutorial") {
            startTutorial(toModes);
            return;
          }
          startGame(g.mode);
        },
        finish: g.mode === "free" ? function() {
          pauseEl.remove();
          pauseEl = null;
          g.resume();
          g.finish("\u304A\u3057\u307E\u3044!");
        } : null,
        settings: function() {
          var s = ui.settings({ back: function() {
            s.classList.add("out");
            setTimeout(function() {
              s.remove();
            }, 200);
          } });
          s.style.zIndex = 45;
        },
        title: toTitle
      });
    }
    app2.onGameEnd = function(g) {
      if (app2.game !== g) return;
      var st = g.stats, score = g.score, goalRes = null;
      if (g.goal) {
        var ok = g.goal.test(st);
        goalRes = { text: g.goal.text, done: ok, bonus: 1500 };
        if (ok) score += 1500;
      }
      var key = g.mode + ":" + g.level, bests = storage.get("best") || {}, prev = bests[key] || 0, practice = g.practice, newBest = !practice && score > prev && score > 0;
      if (!practice) {
        if (newBest) {
          bests[key] = score;
          storage.set("best", bests);
        }
        services.ranking.submit({ mode: g.mode, level: g.level, score, sentences: st.sentences, longest: st.longest, date: U.today() });
        if (g.mode === "daily") {
          var dl = storage.get("daily") || {};
          dl[U.today()] = score;
          storage.set("daily", dl);
        }
      }
      var life = app2.lifetime();
      life.plays++;
      life.sentences += st.sentences;
      life.maxCombo = Math.max(life.maxCombo, st.maxCombo);
      if (st.longestN > life.longestN) {
        life.longestN = st.longestN;
        life.longest = st.longest;
      }
      storage.set("life", life);
      var mode = MODES.filter(function(m) {
        return m.id === g.mode;
      })[0] || MODES[0];
      endGame();
      app2.scene = "result";
      app2.kun = true;
      app2.audio.music("result");
      if (newBest) setTimeout(function() {
        app2.audio.sfx("best");
      }, 700);
      var res = { mode: g.mode, level: g.level, score, stats: st, newBest, best: Math.max(prev, newBest ? score : 0), goal: goalRes, practice, modeName: mode.name, levelName: LEVELS[g.level].name };
      ui.result(res, { retry: function() {
        startGame(lastMode);
      }, modes: toModes, title: toTitle });
      app2.emit("result", { mode: res.mode, level: res.level, score, newBest, stats: { sentences: st.sentences, chunks: st.chunks, maxCombo: st.maxCombo, longest: st.longest } });
    };
    measure();
    raf = requestAnimationFrame(frame);
    var start = options.startScreen || "splash";
    if (start === "title") toTitle();
    else if (start === "modes") toModes();
    else if (start === "game") startGame(options.initialMode || "ta");
    else {
      app2.decor = true;
      ui.splash(function() {
        toTitle();
      });
    }
    app2.emit("ready", { version: VERSION });
    var api = {
      unmount: function() {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        endGame();
        listeners.forEach(function(l) {
          l[0].removeEventListener(l[1], l[2], l[3]);
        });
        listeners = [];
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        app2.audio.destroy();
        ui.destroy();
        root.remove();
        UI.removeCSS();
      },
      pause: function() {
        if (app2.game && app2.game.state !== "over") showPause();
      },
      resume: function() {
        if (pauseEl) pauseEl.querySelector(".pc-btn").click();
      },
      setAudio: function(o) {
        ["bgm", "sfx", "voice", "rate"].forEach(function(k) {
          if (o[k] != null) settings[k] = o[k];
        });
        app2.saveSettings();
      },
      show: function(name, mode) {
        if (name === "title") toTitle();
        else if (name === "modes") toModes();
        else if (name === "game") startGame(mode || "ta");
        else if (name === "tutorial") startTutorial(toModes);
      },
      getState: function() {
        var g = app2.game;
        return { scene: app2.scene, mode: g && g.mode, score: g && g.score, playing: !!(g && g.state === "play") };
      },
      _app: app2
    };
    return api;
  }

  // games/punichunk/game.js
  var game_default = {
    id: "punichunk",
    name: "\u3077\u306B\u30C1\u30E3\u30F3\u30AF",
    right: "game:punichunk",
    async mount(el, ctx) {
      const g = mount(el, {
        startScreen: "title",
        storage: ctx.store,
        core: { sound: ctx.core.sound, speech: ctx.core.speech },
        openSettings: () => ctx.core.ui.settings(),
        onEvent: (n, d) => {
          if (n === "screen") ctx.showBack(!["game", "tutorial"].includes(d.name));
          if (n === "result") ctx.report("result", { mode: d.mode, score: d.score });
        }
      });
      ctx.showBack(true);
      return { unmount() {
        g.unmount();
      } };
    }
  };

  // games/index.js
  var GAMES = { punichunk: game_default };

  // apps/solo/main.js
  var app = window.__APP__;
  var core = createCore({ ...app, backButton: false });
  document.body.style.background = "#0b1626";
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
