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

  // games/eigonou/src/view.html
  var view_default = '<div id="app">\n <div class="view" data-view="play">\n  <div class="top"><h1>\u82F1\u8A9E\u8133\u30B2\u30FC\u30E0<small>\u8A66\u4F5C7</small></h1><div class="seg lvseg" id="lvl"><span class="lvlab">Lv</span><button data-l="1">1</button><button data-l="2">2</button><button data-l="3">3</button><button data-l="4">4</button><button data-l="5">5</button><button data-l="6">\u221E</button></div><button class="ib rs" id="bUndo" aria-label="\u6700\u521D\u304B\u3089">\u27F2<small>\u6700\u521D\u304B\u3089</small></button></div>\n  <div class="bar"><div id="chunks"></div><div class="barside"><button class="ib" id="sayall" aria-label="\u6587\u3092\u8AAD\u3080">\u{1F50A}</button><button class="ib" id="finish" disabled>\u5B8C\u6210</button></div></div>\n  <div id="barnote"></div>\n  <div id="ttsnote" hidden>\u{1F507} \u3053\u306E\u753B\u9762\u3067\u306F\u97F3\u304C\u51FA\u306A\u3044\u3088\u3046\u3067\u3059\u3002\u53F3\u4E0A\u306E\u5171\u6709\u30E1\u30CB\u30E5\u30FC\u306A\u3069\u304B\u3089<b>\u30D6\u30E9\u30A6\u30B6\uFF08Chrome\u306A\u3069\uFF09\u3067\u958B\u304F</b>\u3068\u82F1\u8A9E\u304C\u8AAD\u307F\u4E0A\u3052\u3089\u308C\u307E\u3059\u3002<button onclick="this.parentNode.hidden=true">\xD7</button></div>\n  <div id="canvas"><div id="sidebg"><div class="l"></div><div class="r"></div></div><div id="csent"></div><div id="scene"><div id="bg"></div><div id="sky"></div></div><div id="tline"><div class="track"><div class="tvis"></div><i class="nowl"></i><span class="nowt">\u4ECA</span><span class="tend l">\u524D</span><span class="tend r">\u5148</span><div class="knob"></div></div><div class="tstops"></div><div class="tlock"></div><button class="tmore">\uFF0B \u307B\u304B\u306E\u6642\u5236</button></div><div id="idle"></div></div>\n </div>\n <div class="view page" data-view="prac" id="prac" hidden></div>\n <div class="view page" data-view="reg" id="reg" hidden></div>\n <div class="view page" data-view="sets" id="sets" hidden></div>\n <div class="view page" data-view="settings" id="settings" hidden></div>\n <nav class="nav"><button data-v="make" data-i18n="nav.make"><span>\u{1F3A8}</span>\u3064\u304F\u308B</button><button data-v="prac" data-i18n="nav.prac"><span>\u{1F3AF}</span>\u308C\u3093\u3057\u3085\u3046</button><button data-v="reg" data-i18n="nav.reg"><span>\u2795</span>\u3053\u3068\u3070\u767B\u9332</button><button data-v="sets" data-i18n="nav.sets"><span>\u{1F4DA}</span>\u30BB\u30C3\u30C8</button><button data-v="settings" data-i18n="nav.settings"><span>\u2699\uFE0F</span>\u8A2D\u5B9A</button></nav>\n</div>\n<div id="toast"></div>\n';

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
      removeEventListener("resize", place);
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
    function place() {
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
    function show() {
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
      place();
      box.classList.remove("pop");
      void box.offsetWidth;
      box.classList.add("pop");
    }
    function next() {
      if (done) return;
      i++;
      if (i >= steps.length) return finish(true);
      show();
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
    addEventListener("resize", place);
    timer = setInterval(() => {
      place();
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
    show();
    return { stop() {
      finish(false);
    } };
  }

  // games/eigonou/game.js
  var HOW = [
    { w: "g", f: "joy", t: "\u82F1\u8A9E\u8133\u30A2\u30D7\u30EA\u306F\u3001\u7D75\u3092\u898B\u306A\u304C\u3089\u82F1\u6587\u3092\u7D44\u307F\u7ACB\u3066\u308B\u3001\u82F1\u8A9E\u306E\u30B7\u30DF\u30E5\u30EC\u30FC\u30BF\u3060\u3088\u3002" },
    { w: "b", t: "\u4E0B\u306E\u30E1\u30CB\u30E5\u30FC\u306E\u300C\u3064\u304F\u308B\u300D\u3067\u3001\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046\u3002" },
    { w: "g", t: "\u300C\u308C\u3093\u3057\u3085\u3046\u300D\u3067\u7DF4\u7FD2\u3057\u3066\u3001\u300C\u3053\u3068\u3070\u767B\u9332\u300D\u300C\u30BB\u30C3\u30C8\u300D\u3067\u3001\u4F7F\u3046\u3053\u3068\u3070\u3092\u5897\u3084\u305B\u308B\u3088\u3002" },
    { w: "b", f: "idea", t: "\u97F3\u3084\u8AAD\u307F\u4E0A\u3052\u306F\u3001\u300C\u8A2D\u5B9A\u300D\u3067\u5909\u3048\u3089\u308C\u308B\u3088\u3002" }
  ];
  var FONT2 = "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Zen+Maru+Gothic:wght@500;700;900&display=swap";
  var SAVED = null;
  var SAVED_CLS = "";
  var link = (href, key) => new Promise((res) => {
    if (document.querySelector(`link[data-ct="${key}"]`)) return res();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.ct = key;
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
  });
  var game_default = {
    id: "eigonou",
    name: "\u82F1\u8A9E\u8133\u30A2\u30D7\u30EA",
    right: "game:eigonou",
    async mount(el, ctx) {
      el.classList.add("ct-eigo");
      el.innerHTML = '<div class="eg-loading" style="display:grid;place-items:center;height:100%;font-weight:700;color:#6b7191">\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026</div>';
      link(FONT2, "eigo-font");
      await Promise.all([link(ctx.base + "eigo.css", "eigo"), ctx.loadScript(ctx.base + "eigo.js")]);
      if (SAVED) {
        el.innerHTML = "";
        el.appendChild(SAVED);
        el.className = SAVED_CLS;
        SAVED = null;
      } else el.innerHTML = view_default;
      window.__EIGONOU.start(el, ctx);
      ctx.showBack(false);
      const app2 = window.__APP__ || {};
      if (app2.backButton) {
        const b = document.createElement("button");
        b.className = "ib eg-home";
        b.setAttribute("aria-label", app2.backLabel || "\u623B\u308B");
        b.textContent = "\u{1F3E0}";
        b.onclick = () => ctx.exit();
        const top = el.querySelector(".top");
        top && top.prepend(b);
      }
      {
        const h = document.createElement("button");
        h.className = "ib eg-how";
        h.textContent = "\u2753 \u904A\u3073\u65B9";
        h.style.cssText = "font-size:12px;padding:4px 8px;white-space:nowrap";
        h.onclick = () => runCoach(HOW);
        const top = el.querySelector(".top");
        top && top.appendChild(h);
      }
      return {
        unmount() {
          try {
            window.__EIGONOU.stop();
          } catch (e) {
          }
          try {
            ctx.core.speech.stop();
          } catch (e) {
          }
          SAVED = document.createDocumentFragment();
          SAVED_CLS = el.className;
          el.querySelectorAll(".eg-home,.eg-how").forEach((b) => b.remove());
          while (el.firstChild) SAVED.appendChild(el.firstChild);
        }
      };
    }
  };

  // games/index.js
  var GAMES = { eigonou: game_default };

  // apps/solo/main.js
  var app = window.__APP__;
  var core = createCore({ ...app, backButton: false });
  document.body.style.background = "#0b1626";
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
