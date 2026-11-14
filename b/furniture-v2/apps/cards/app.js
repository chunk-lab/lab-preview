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
    const pick3 = () => {
      try {
        const vs = speechSynthesis.getVoices() || [], en = vs.filter((x) => /^en[-_]?/i.test(x.lang || ""));
        voice = en.find((x) => /US/i.test(x.lang)) || en[0] || null;
      } catch (e) {
      }
    };
    try {
      pick3();
      speechSynthesis.addEventListener("voiceschanged", pick3);
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
    const root2 = document.createElement("div");
    root2.className = "cs-ui";
    document.body.appendChild(root2);
    const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const sheet = (html, bind) => {
      const ov = document.createElement("div");
      ov.className = "cs-ov";
      ov.innerHTML = '<div class="cs-sheet" role="dialog">' + html + '<button class="cs-btn cs-close">\u3068\u3058\u308B</button></div>';
      root2.appendChild(ov);
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
      root2.appendChild(d);
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
    let cur3 = null;
    const close = () => {
      if (!cur3) return;
      const c = cur3;
      cur3 = null;
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
        return cur3 && cur3.game.id;
      },
      async open(game, opts = {}) {
        if (cur3) close();
        if (game.right && !core2.rights.has(game.right)) {
          core2.ui.toast("\u3053\u306E\u30B2\u30FC\u30E0\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
          return;
        }
        const el3 = document.createElement("div");
        el3.className = "cs-mount";
        layer.appendChild(el3);
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
        cur3 = { game, el: el3, inst: null };
        ctx.report("open");
        try {
          const inst = await game.mount(el3, ctx);
          if (cur3 && cur3.el === el3) cur3.inst = inst || {};
          else inst && inst.unmount && inst.unmount();
        } catch (e) {
          console.error(e);
          el3.innerHTML = '<p class="cs-err">\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F</p>';
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
    let state = 0, wait3 = null;
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
      if (!wait3) {
        state = 1;
        wait3 = loadScript(base + "core/dict/data.js").then(() => {
          state = 2;
        }, (e) => {
          state = 0;
          wait3 = null;
          throw e;
        });
      }
      return wait3;
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
      let best2 = null;
      for (let i = Math.max(0, wi - 3); i <= wi; i++) {
        [.../* @__PURE__ */ new Set([norm(words[i]), lem(words[i])])].forEach((k) => (PH.get(k) || []).forEach(([ws, m]) => {
          const end = i + ws.length - 1;
          if (end < wi || end >= words.length) return;
          for (let j = 1; j < ws.length; j++) {
            const w = words[i + j];
            if (ws[j] !== norm(w) && ws[j] !== lem(w)) return;
          }
          if (!best2 || ws.length > best2.ws.length) best2 = { ws, m, s: i, e: end };
        }));
      }
      return best2;
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
      const parts2 = en.split(" / ");
      if (parts2.length > 1) u.subs = [];
      parts2.forEach((p, pi) => {
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
    const store2 = createStore("reader");
    const S = Object.assign({ font: "m", lines: 1, seg: true, role: true, ja: true, always: false, view: "read", disp: "easy" }, store2.get("settings") || {});
    const save = () => store2.set("settings", S);
    let cur3 = null;
    function open(story, opts = {}) {
      if (cur3) cur3.close(true);
      const root2 = document.createElement("div");
      root2.className = "cs-reader";
      root2.innerHTML = HTML;
      document.body.appendChild(root2);
      const $3 = (k) => root2.querySelector(`[data-k="${k}"]`);
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
      const applyFont = () => root2.style.setProperty("--laneFont", FONT[S.font] + "px");
      const speak2 = (t) => core2.speech.speak(t, { rate: 0.9 });
      const stopSay = () => {
        core2.speech.stop();
        RD.saying = false;
        $3("say").textContent = "\u{1F50A} \u805E\u304F";
      };
      const beep2 = (k) => {
        const s = core2.sound;
        ({ mini: () => s.beep(1250, 0.04, "triangle", 0.07), great: () => s.beep(988, 0.09, "sine", 0.13), excellent: () => {
          s.beep(880, 0.07, "sine", 0.14);
          setTimeout(() => s.beep(1320, 0.09, "sine", 0.12), 55);
        } }[k] || (() => {
        }))();
      };
      const lineX = () => Math.round($3("lane").clientWidth * 0.34);
      const ro = new ResizeObserver(() => render(true));
      if (!dictReady) dict.ready().then(() => {
        dictReady = true;
        if (cur3 && cur3.root === root2) infoUI();
      }, () => {
      });
      const sheet = (html, closable = true) => {
        $3("sheet").innerHTML = html;
        $3("modal").hidden = false;
        $3("modal").onclick = (e) => {
          if (closable && e.target === $3("modal")) closeSheet();
        };
      };
      const closeSheet = () => {
        $3("modal").hidden = true;
        $3("sheet").innerHTML = "";
      };
      const ask2 = (msg, yes) => new Promise((ok) => {
        sheet(`<p class="note" style="white-space:pre-line;font-size:14px">${esc(msg)}</p><div class="btns"><button class="ghost" data-a="no">\u3084\u3081\u308B</button><button class="primary" data-a="yes">${esc(yes)}</button></div>`, false);
        $3("sheet").querySelector("[data-a=no]").onclick = () => {
          closeSheet();
          ok(false);
        };
        $3("sheet").querySelector("[data-a=yes]").onclick = () => {
          closeSheet();
          ok(true);
        };
      });
      function modeUI(v) {
        const hasQ = qs.length > 0;
        $3("seg").hidden = test || !hasQ;
        $3("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
        $3("gram").hidden = v !== "read";
        $3("gram").classList.toggle("on", !!RD.gramOn);
        $3("jaBtn").hidden = v !== "read" || test || S.ja === false;
        $3("jaBtn").classList.toggle("on", !!RD.showJa);
        $3("hint").hidden = v !== "solve" || RD.hintPolicy === "none";
        $3("hint").classList.toggle("on", !!RD.hintOn);
        $3("hint").textContent = "\u{1F4A1}\u30D2\u30F3\u30C8" + (RD.hintCost ? `\uFF08\u2212${RD.hintCost}\u70B9\uFF09` : "");
        $3("modeRow").hidden = [...$3("modeRow").children].every((c) => c.hidden);
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
        const el3 = $3("info");
        if (view() !== "read") {
          el3.innerHTML = "";
          el3.hidden = true;
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
        el3.innerHTML = h;
        el3.hidden = !h;
        const f = el3.querySelector("[data-a=full]");
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
        $3("sheet").querySelectorAll("select").forEach((s) => s.onchange = () => {
          const k = s.dataset.s, v = s.value;
          if (k === "lines") S.lines = +v;
          else if (k === "disp") S.disp = v;
          else {
            S[k] = v === "on";
            if (k === "always") RD.gramOn = S.always;
          }
          save();
        });
        $3("sheet").querySelector("[data-a=close]").onclick = () => {
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
        if (!root2.isConnected) return;
        const sn = sen(), n = sn.words.length, [ra, rb] = range(), q = qs[RD.qi];
        const unitEnds = new Set(sn.units.map((u) => u.e));
        const v = view(), gOn = v === "read" ? RD.gramOn : RD.hintOn && RD.hintPolicy === "grammar";
        const segOn = gOn && (v !== "read" || S.seg !== false), roleOn = gOn && (v !== "read" || S.role !== false);
        const st = $3("strip");
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
        $3("cutline").style.left = lineX() + "px";
        const bar = $3("bar");
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
        $3("prevLine").innerHTML = ctxL(-1, "\u25B2").reverse().join("");
        $3("nextLine").innerHTML = ctxL(1, "\u25BC").join("");
        $3("lines").textContent = "\u8868\u793A " + S.lines;
        $3("say").hidden = test;
        $3("senNum").textContent = `${RD.si + 1} / ${sens.length} \u6587\u76EE`;
        $3("up").disabled = RD.si === 0;
        $3("down").disabled = RD.si === sens.length - 1;
        root2.classList.toggle("vRead", v === "read");
        modeUI(v);
        infoUI();
        if (v === "read") {
          $3("help").textContent = RD.gramOn ? `\u30C1\u30E3\u30F3\u30AF\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u5F79\u5272${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059` : `\u5358\u8A9E\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u767A\u97F3\u3057\u3066\u54C1\u8A5E${RD.showJa ? "\u3068\u610F\u5473" : ""}\u304C\u51FA\u307E\u3059\u3002\u300C\u30C1\u30E3\u30F3\u30AF\u300D\u3067\u30C1\u30E3\u30F3\u30AF\u3054\u3068\u306B\u898B\u3089\u308C\u307E\u3059`;
          return;
        }
        if (!q) {
          $3("qNum").textContent = "";
          $3("q").textContent = "\uFF08\u554F\u984C\u306A\u3057\uFF1A\u8AAD\u3080\u3060\u3051\uFF09";
          $3("ans").textContent = "";
          $3("choices").innerHTML = "";
          $3("btns").innerHTML = "";
          $3("help").textContent = "\u5DE6\u53F3\u30FB\u4E0A\u4E0B\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u8AAD\u3081\u307E\u3059";
          $3("check").hidden = true;
          return;
        }
        $3("check").hidden = false;
        $3("qNum").textContent = `Q${RD.qi + 1} / ${qs.length}`;
        $3("q").textContent = q.q;
        $3("qPrev").disabled = RD.qi === 0;
        $3("qNext").disabled = RD.qi === qs.length - 1;
        const answered = qs.filter((x) => x.ans).length;
        $3("check").textContent = test ? `\u63D0\u51FA\u3059\u308B\uFF08${answered}/${qs.length}\u554F\uFF09` : `\u7B54\u3048\u5408\u308F\u305B\uFF08${answered}/${qs.length}\u554F\uFF09`;
        if (q.type === "choice") {
          $3("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + q.options[q.ans.choice] : "";
          $3("choices").innerHTML = q.options.map((o, i) => `<button data-c="${i}" class="${q.ans && q.ans.choice === i ? "on" : ""}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`).join("");
          $3("choices").querySelectorAll("button").forEach((b) => b.onclick = () => {
            q.ans = { choice: +b.dataset.c };
            beep2("mini");
            render(true);
            const qi = RD.qi;
            setTimeout(() => {
              if (RD.qi === qi) nextUnanswered();
            }, 350);
          });
          $3("btns").innerHTML = "";
          $3("help").textContent = "\u82F1\u6587\u3092\u8AAD\u3093\u3067\u3001\u9078\u629E\u80A2\u304B\u3089\u7B54\u3048\u3092\u9078\u307C\u3046";
          return;
        }
        $3("choices").innerHTML = "";
        $3("ans").textContent = q.ans ? "\u3042\u306A\u305F\u306E\u7B54\u3048\uFF1A" + sens[q.ans.si].words.slice(q.ans.a, q.ans.b + 1).join(" ") : "";
        const help = RD.sel ? "\u3053\u306E\u7BC4\u56F2\u3067\u3044\u3044\uFF1F" : startOn ? "\u7B54\u3048\u306E\u7D42\u308F\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\u3053\u3053\u307E\u3067 \uFF3D\u300D" : "\u7B54\u3048\u306E\u59CB\u307E\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\uFF3B \u3053\u3053\u304B\u3089\u300D\uFF08\u30EC\u30FC\u30F3\u3092\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u52D5\u304B\u3059\uFF09";
        $3("help").textContent = (RD.hintQ.has(RD.qi) && q.si != null ? `\u{1F4A1} \u7B54\u3048\u306F ${q.si + 1} \u6587\u76EE\u306B\u3042\u308B\u3088\u3002 ` : "") + help;
        $3("btns").innerHTML = RD.sel ? '<button data-a="redo">\u9078\u3073\u306A\u304A\u3057</button><button data-a="ok" class="ok">\u6C7A\u5B9A</button>' : `${startOn ? '<button data-a="redo">\u3084\u3081\u308B</button>' : ""}<button data-a="cut" class="cutMain">${startOn ? "\u3053\u3053\u307E\u3067 \uFF3D" : "\uFF3B \u3053\u3053\u304B\u3089"}</button>`;
        const B = (a) => $3("btns").querySelector(`[data-a=${a}]`);
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
        beep2("mini");
        const lw = $3("lane");
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
        beep2("great");
        nextUnanswered();
      }
      function nextUnanswered() {
        const next = qs.findIndex((x, i) => i > RD.qi && !x.ans), first2 = qs.findIndex((x) => !x.ans), to = next >= 0 ? next : first2;
        if (to >= 0 && to !== RD.qi) {
          RD.qi = to;
          render(true);
          qFlash(1);
        } else {
          render(true);
          if (to < 0) toast(test ? "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u63D0\u51FA\u3059\u308B\u300D\u3078" : "\u5168\u90E8\u7B54\u3048\u307E\u3057\u305F\u3002\u4E0B\u306E\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3078");
        }
      }
      const qFlash = (d2) => $3("q").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateX(${d2 * 30}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      const toast = (t) => {
        const el3 = $3("help");
        el3.textContent = t;
        el3.animate([{ color: "var(--accent)" }, { color: "var(--muted)" }], { duration: 1600 });
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
          toast("\u8AAD\u307F\u4E0A\u3052\u304C\u30AA\u30D5\u306B\u306A\u3063\u3066\u3044\u307E\u3059\uFF08\u2699 \u8A2D\u5B9A\u3067\u5909\u3048\u3089\u308C\u307E\u3059\uFF09");
          return;
        }
        RD.saying = true;
        $3("say").textContent = "\u25A0 \u6B62\u3081\u308B";
        core2.speech.speak(sen().en, { rate: 0.9, onend: () => {
          if (RD.saying) {
            RD.saying = false;
            $3("say").textContent = "\u{1F50A} \u805E\u304F";
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
        $3("lane").animate(reduce ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: `translateY(${d2 * 18}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "ease-out" });
      }
      const RV = { i: 0, on: false, tok: 0 };
      const rvStop = () => {
        RV.on = false;
        RV.tok++;
        core2.speech.stop();
      };
      const rvUI = () => {
        const b = $3("sheet").querySelector("[data-a=rvPlay]");
        if (!b) return;
        b.textContent = RV.on ? "\u23F8 \u4E00\u6642\u505C\u6B62" : RV.i > 0 ? "\u25B6 \u3064\u3065\u304D" : "\u25B6 \u6700\u521D\u304B\u3089";
        $3("sheet").querySelectorAll(".rvSen").forEach((el3) => el3.classList.toggle("on", RV.on && +el3.dataset.i === RV.i));
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
        const el3 = $3("sheet").querySelector(`.rvSen[data-i="${RV.i}"]`);
        if (el3 && el3.scrollIntoView) el3.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
          $3("sheet").querySelector("[data-a=go]").onclick = goUn;
          return;
        }
        if (test) {
          if (un.length) {
            const go = await new Promise((ok) => {
              sheet(`<h2>\u672A\u56DE\u7B54\u306E\u554F\u984C\u304C\u3042\u308A\u307E\u3059</h2><p class="note"><b>${names}</b> \u304C\u672A\u56DE\u7B54\u3067\u3059\u3002<br>\u672A\u56DE\u7B54\u306E\u554F\u984C\u306F\u70B9\u6570\u304C\u5165\u308A\u307E\u305B\u3093\u3002\u672C\u5F53\u306B\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F</p>${pendNote}
            <div class="btns"><button class="primary" data-a="go">\u672A\u56DE\u7B54\u306E\u554F\u984C\u3078</button><button class="ghost" data-a="force">\u305D\u308C\u3067\u3082\u63D0\u51FA\u3059\u308B</button></div>`);
              $3("sheet").querySelector("[data-a=go]").onclick = () => ok(false);
              $3("sheet").querySelector("[data-a=force]").onclick = () => ok(true);
            });
            if (!go) {
              goUn();
              return;
            }
            if (!await ask2(`\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u307E\u3059\u3002
${names} \u306F0\u70B9\u306B\u306A\u308A\u307E\u3059\u3002\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F`, "\u63D0\u51FA\u3059\u308B")) return;
          } else if (!await ask2("\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F\n\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002", "\u63D0\u51FA\u3059\u308B")) return;
          const sm = summary(), cost = RD.hintCost;
          const score = sm.reduce((a, x) => a + Math.max(0, Math.round(x.pts * { o: 1, t: 0.4, x: 0 }[x.mark]) - (x.hint ? cost : 0)), 0), max = sm.reduce((a, x) => a + x.pts, 0);
          opts.onSubmit && opts.onSubmit({ answers: sm, score, max });
          sheet('<h2>\u63D0\u51FA\u3057\u307E\u3057\u305F</h2><p class="note">\u7B54\u3048\u306F\u5148\u751F\u304C\u78BA\u8A8D\u3057\u307E\u3059\u3002</p><div class="btns"><button class="primary" data-a="back">\u3082\u3069\u308B</button></div>', false);
          $3("sheet").querySelector("[data-a=back]").onclick = () => close();
          return;
        }
        const res = qs.map(judge), pts = res.reduce((a, r, i) => a + Math.round((qs[i].pts || 100) * { o: 1, t: 0.4, x: 0 }[r]), 0);
        beep2(res.every((r) => r === "o") ? "excellent" : "great");
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
        const B = (a) => $3("sheet").querySelector(`[data-a=${a}]`);
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
        $3("sheet").querySelectorAll(".rvSen").forEach((el3) => el3.onclick = () => {
          RV.i = +el3.dataset.i;
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
      const gest = $3("gest");
      let d = null;
      $3("set").onclick = settingsUI;
      $3("lines").onclick = () => {
        S.lines = S.lines >= 3 ? 1 : S.lines + 1;
        save();
        render(true);
      };
      $3("seg").querySelectorAll("button").forEach((b) => b.onclick = () => {
        S.view = b.dataset.v;
        save();
        RD.view = b.dataset.v;
        RD.sel = null;
        RD.start = null;
        RD.info = null;
        RD.hintOn = false;
        render(true);
      });
      $3("gram").onclick = () => {
        RD.gramOn = !RD.gramOn;
        RD.info = null;
        render(true);
      };
      $3("jaBtn").onclick = () => {
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
        const w = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains("w") && root2.contains(x));
        d = { onBar, onLane: !onBar, wi: w ? [...$3("strip").querySelectorAll(".w")].indexOf(w) : -1, x: e.clientX, y: e.clientY, g0: RD.gpos[RD.p], moved: false, axis: null };
      });
      gest.addEventListener("pointermove", (e) => {
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.axis && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) d.axis = Math.abs(dy) >= Math.abs(dx) * 2 ? "y" : "x";
        if (d.axis === "x" && !d.onBar) {
          d.moved = true;
          const target = d.g0 + dx;
          let best2 = 0;
          RD.gpos.forEach((g, i) => {
            if (Math.abs(g - target) < Math.abs(RD.gpos[best2] - target)) best2 = i;
          });
          move(best2, true);
        }
        if (d.axis === "y") {
          d.moved = true;
          if (!d.done && Math.abs(dy) >= 20) {
            d.done = true;
            sentence(dy < 0 ? 1 : -1);
            $3("senNum").animate([{ color: "var(--accent)", transform: "scale(1.25)" }, { color: "var(--muted)", transform: "none" }], { duration: 500 });
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
      $3("bar").addEventListener("input", (e) => move(+e.target.value, true));
      $3("say").onclick = say2;
      $3("up").onclick = () => sentence(-1);
      $3("down").onclick = () => sentence(1);
      $3("qPrev").onclick = () => goQ(RD.qi - 1, -1);
      $3("qNext").onclick = () => goQ(RD.qi + 1, 1);
      {
        const box = $3("q").parentElement;
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
      $3("back").textContent = opts.backLabel || "\u2190 \u3082\u3069\u308B";
      $3("back").onclick = () => close();
      $3("fontM").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i > 0) {
          S.font = FK[i - 1];
          save();
          applyFont();
          render(true);
        }
      };
      $3("fontP").onclick = () => {
        const i = FK.indexOf(S.font);
        if (i < FK.length - 1) {
          S.font = FK[i + 1];
          save();
          applyFont();
          render(true);
        }
      };
      $3("hint").onclick = () => {
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
      $3("check").onclick = grade;
      $3("title").textContent = `${opts.label ? opts.label + "\uFF5C" : test ? "TEST\uFF5C" : ""}${story.title || ""}${story.level && !opts.label ? `\uFF08Lv${story.level}\uFF09` : ""}`;
      function close(silent) {
        if (!cur3 || cur3.root !== root2) return;
        cur3 = null;
        RV.tok++;
        core2.speech.stop();
        ro.disconnect();
        root2.remove();
        if (!silent && opts.onClose) opts.onClose();
      }
      cur3 = { root: root2, close };
      applyFont();
      ro.observe($3("lane"));
      render(true);
      core2.events.report("reader", "open", { title: story.title });
      return { close: () => close(true) };
    }
    return { open, close: () => cur3 && cur3.close(true), get isOpen() {
      return !!cur3;
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
    const back2 = document.createElement("button");
    back2.className = "cs-back";
    back2.hidden = true;
    back2.textContent = config.backLabel || "\u2190 \u3082\u3069\u308B";
    document.body.append(layer, back2);
    core2.host = createHost(core2, layer, back2);
    return core2;
  }

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
      var pw = ws[0], np = buildNP(ws.slice(1), cfg, errs, true), prep = pw.v, g = PREP_GROUP[prep], cat2 = "other";
      var e = np.noun;
      if (e && e.cat === "time") {
        if (g === 0) {
          cat2 = "time";
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
        cat2 = g === 1 ? "dir" : g === 2 ? "other" : "place";
        if (g === 0 && e.prep) {
          var ok = e.prep === "at" || e.prep === "in" ? ["at", "in"] : [e.prep];
          if (ok.indexOf(prep) < 0) {
            if (cfg.auto.prep) prep = e.prep;
            else errs.push(E_("prepPlace", { n: e.w, p: e.prep }));
          }
        }
      } else cat2 = g === 1 ? "dir" : g === 2 ? "other" : np.pron ? "other" : "place";
      return { t: "PP", words: ws, prep, np, cat: cat2 };
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
    function cyclable2(w, cfg) {
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
    function pClause(T2, i, allowPre, prefix, out) {
      var n = T2.length;
      for (var k = 0; k <= 2; k++) {
        if (k > 0 && !(i + k - 1 < n && allowPre && isTP(T2[i + k - 1]))) break;
        var j = i + k, pre = T2.slice(i, j);
        if (prefix && j === n) {
          out.push({ i: n, partial: true });
          continue;
        }
        var subj = null, flags = [];
        if (T2[j] && T2[j].t === "NP") {
          subj = T2[j];
          j++;
        } else if (T2[j] && T2[j].t === "VP") flags.push("needSubj");
        else continue;
        if (prefix && j === n) {
          out.push({ i: n, partial: true });
          continue;
        }
        var vp = T2[j];
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
            if (!fits(T2[jj], op.p[q], T2[jj - 1])) {
              ok = false;
              break;
            }
            jj++;
          }
          if (!ok) return;
          if (vp.verb && vp.verb.cv && op.p.indexOf("NF") < 0 && T2[jj] && T2[jj].t === "NF") return;
          var fl = flags.slice();
          if (op.f) fl.push(op.f);
          for (var m = 0; m <= 3; m++) {
            if (m > 0 && !(jj + m - 1 < n && isPost(T2[jj + m - 1]))) break;
            out.push({ i: jj + m, cl: { pre, subj, vp, comps: T2.slice(j, jj), compPat: op.p, posts: T2.slice(jj, jj + m), flags: fl } });
          }
          if (prefix && jj + 3 < n) {
          }
        });
      }
      return out;
    }
    function parseAll(T2, prefix) {
      var n = T2.length, res = [], fronts = [{ i: 0, front: null }];
      if (T2[0] && (T2[0].t === "CL" || T2[0].t === "ID" && T2[0].ik === "front")) fronts.push({ i: 1, front: { tok: T2[0] } });
      if (T2[0] && T2[0].t === "CONJ" && T2[0].sub) {
        if (prefix && n === 1) res.push({ partial: true });
        pClause(T2, 1, true, prefix, []).forEach(function(c) {
          if (c.partial) {
            res.push({ partial: true });
            return;
          }
          if (c.i === n) res.push({ kind: "CL", conj: T2[0], cl: c.cl });
          fronts.push({ i: c.i, front: { conj: T2[0], cl: c.cl } });
        });
      }
      fronts.forEach(function(f) {
        if (prefix && f.i === n && f.front) {
          res.push({ partial: true });
          return;
        }
        pClause(T2, f.i, true, prefix, []).forEach(function(c1) {
          if (c1.partial) {
            res.push({ partial: true });
            return;
          }
          if (c1.i === n) {
            res.push({ kind: "S", front: f.front, cls: [c1.cl] });
            return;
          }
          var co = T2[c1.i];
          if (co && co.t === "CONJ") {
            if (prefix && c1.i + 1 === n) {
              res.push({ partial: true });
              return;
            }
            pClause(T2, c1.i + 1, true, prefix, []).forEach(function(c2) {
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
      var parts2 = [], marks = [];
      var preTxt = cl.pre.map(function(t) {
        return tokText(t);
      }).join(" ");
      if (preTxt) parts2.push(preTxt + ",");
      if (cl.subj) parts2.push(tokText(cl.subj, "sub"));
      parts2.push(vpRealize(vp, s, td, marks));
      cl.comps.forEach(function(c, ci) {
        parts2.push(c.t === "NF" ? nfText(c, nfTi[ci]) : tokText(c, "obj"));
      });
      cl.posts.forEach(function(c, ci) {
        parts2.push(c.t === "NF" ? nfText(c, postTi[ci] || c.ti) : tokText(c, "obj"));
      });
      return { errs, text: parts2.join(" "), times: times.length, past: td.tense === "past" || MODAL_PAST[td.modal], marks };
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
    function parse(T2, cfg) {
      if (!T2.length) return { ok: false, sev: 2, err: E_("order") };
      var alts = parseAll(T2, false), best2 = null;
      alts.forEach(function(a2) {
        if (a2.partial) return;
        var errs = [], texts = [], frontText = "", frontTime = 0, past = false, marks = [];
        if (a2.kind === "CL") {
          var r0 = evalClause(a2.cl, cfg);
          errs = r0.errs;
          var cand = { ok: false, kind: "CL", errs, text: a2.conj.v + " " + r0.text, times: r0.times, alt: a2 };
          cand.sev = sevOf(errs);
          cand.rank = cand.sev * 100 + 50;
          if (!best2 || cand.rank < best2.rank) best2 = cand;
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
        if (!best2 || cand2.rank < best2.rank || cand2.sev === best2.sev && best2.kind === "CL") best2 = cand2;
      });
      if (!best2) {
        if (!T2.some(function(t) {
          return t.t === "VP";
        })) return { ok: false, sev: 1, err: E_("needVerb") };
        return { ok: false, sev: 2, err: E_("order") };
      }
      if (best2.sev === 0) {
        var a = best2.alt, info = { front: !!a.front, clause: !!(a.front && (a.front.cl || a.front.tok && a.front.tok.t === "CL")) || best2.kind === "CL" || !!(a.co && a.co.sub), coord: !!(a.co && !a.co.sub), past: !!best2.past };
        if (best2.kind === "CL") return { ok: true, kind: "CL", text: best2.text, times: best2.times, info };
        return { ok: true, kind: "S", text: best2.text, info, marks: best2.marks || [], alt: a };
      }
      return { ok: false, sev: best2.sev, err: best2.errs.filter(function(e) {
        return (SEV[e.code] ? 1 : 2) === best2.sev;
      })[0] || best2.errs[0], text: best2.text };
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
      var pre = s.prefix, best2 = null;
      if (words.length <= 5) perms(words).forEach(function(p) {
        if (best2) return;
        var fq = fit(p), q = fq.q;
        if (fq.ws) best2 = { chunk: q.chunk, prefix: true, words: fq.ws };
        else if (q.prefix) pre = true;
      });
      return best2 || { chunk: null, prefix: pre };
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
    function viable(T2, strict) {
      if (!T2.length) return true;
      var alts = parseAll(T2, true);
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
    function makeFrag(T2) {
      var words = [];
      T2.forEach(function(t) {
        words = words.concat(t.words || []);
      });
      return { t: "FR", words, parts: T2.slice() };
    }
    function makeClause(T2, res) {
      var words = [];
      T2.forEach(function(t) {
        words = words.concat(t.words || []);
      });
      return { t: "CL", words, parts: T2.slice(), text: res.text, times: res.times || 0 };
    }
    function wordCount(T2) {
      var n = 0;
      T2.forEach(function(t) {
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
      cyclable: cyclable2,
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

  // games/cards/src/base.js
  var DICT = Dict.makeDefault();
  var CFG = { auto: { art: false, prep: false, verb: false, ti: false, er: false } };
  var LEVEL = 1;
  var LV_JA = ["\u521D\u7D1A", "\u4E2D\u7D1A", "\u4E0A\u7D1A"];
  var LV_MULT = [1, 1, 1.3];
  function setLevel(l) {
    LEVEL = l;
    var a = l === 0;
    CFG.auto = { art: a, prep: a, verb: a, ti: a, er: a };
  }
  var $ = function(s, r) {
    return (r || document).querySelector(s);
  };
  var el = function(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  var rnd = Math.random;
  var pick = function(a) {
    return a[Math.floor(rnd() * a.length)];
  };
  var shuffle = function(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };
  var back = null;
  function bindStore(s) {
    back = s;
  }
  var store = { get: function(k) {
    var v = back ? back.get(k) : null;
    return v === void 0 ? null : v;
  }, set: function(k, v) {
    if (back) back.set(k, v);
  } };

  // games/cards/src/sound.js
  function bindCore(c) {
    CORE = c;
  }
  var CORE = null;
  function ac() {
    return CORE ? CORE.sound.ctx() : null;
  }
  function beep(f, d, type, v, when) {
    var c = ac();
    if (!c) return;
    var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v || 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(1e-3, t + d);
    o.connect(g);
    g.connect(CORE.sound.sfxBus);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  var NB = null;
  function noise(d, f, q, v, when) {
    var c = ac();
    if (!c) return;
    if (!NB) {
      NB = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
      var a = NB.getChannelData(0);
      for (var i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    }
    var t = c.currentTime + (when || 0), sN = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    sN.buffer = NB;
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(1e-3, t + d);
    sN.connect(bp);
    bp.connect(g);
    g.connect(CORE.sound.sfxBus);
    sN.start(t);
    sN.stop(t + d + 0.02);
  }
  function bell(f, d, v, when) {
    beep(f, d, "sine", v, when);
    beep(f * 2.01, d * 0.6, "sine", v * 0.25, when);
  }
  var SFX = {
    tap: function() {
      noise(0.04, 3200, 2, 0.12);
    },
    put: function() {
      noise(0.06, 2200, 1.2, 0.18);
      noise(0.05, 900, 1, 0.08, 0.01);
    },
    chip: function(i) {
      noise(0.05, 2600 + i * 60, 6, 0.16);
      bell(880 + i * 30, 0.12, 0.03, 0.01);
    },
    mult: function() {
      bell(523, 0.35, 0.08);
      bell(784, 0.4, 0.06, 0.05);
    },
    joker: function() {
      bell(1175, 0.45, 0.07);
      bell(1568, 0.5, 0.05, 0.08);
    },
    bad: function() {
      beep(196, 0.25, "triangle", 0.06);
      beep(185, 0.3, "triangle", 0.05, 0.08);
    },
    win: function() {
      [523, 659, 784, 1047, 1319].forEach(function(f, i) {
        bell(f, 0.9, 0.07, i * 0.09);
      });
    },
    coin: function() {
      noise(0.05, 4200, 8, 0.14);
      bell(2093, 0.25, 0.04, 0.02);
    },
    lose: function() {
      [392, 330, 262].forEach(function(f, i) {
        bell(f, 0.8, 0.07, i * 0.2);
      });
    }
  };
  function unlock() {
    ac();
  }
  function speak(t) {
    if (CORE) CORE.speech.speak(t, { rate: 0.95 });
  }

  // games/cards/src/rules.js
  var E = {};
  ["noun", "verb", "adj", "adv"].forEach(function(p) {
    E[p] = {};
    DICT.all(p).forEach(function(e) {
      E[p][e.w] = e;
    });
  });
  var KIND_JA = { pron: "\u4EE3\u540D\u8A5E", n: "\u540D\u8A5E", v: "\u52D5\u8A5E", adj: "\u5F62\u5BB9\u8A5E", adv: "\u526F\u8A5E", t: "\u3064\u306A\u304E" };
  var cid = 1;
  function card(kind, w, extra) {
    var c = { id: cid++, kind, w, bonus: 0 };
    for (var k in extra || {}) c[k] = extra[k];
    c.chips = baseChips(c);
    return c;
  }
  function lvOf(c) {
    return c.w.e && c.w.e.lv || 1;
  }
  function baseChips(c) {
    if (c.tsu) return 3;
    if (c.w.k === "pr" && c.w.v === "it") return 10;
    var b = { pron: 5, n: 10, v: 15, adj: 10, adv: 10 }[c.kind] || 5;
    return b + (lvOf(c) - 1) * 6;
  }
  function mk(kind, word) {
    if (kind === "pron") return card("pron", { k: "pr", v: word });
    var pos = { n: "noun", v: "verb", adj: "adj", adv: "adv" }[kind], e = E[pos][word];
    if (!e) return null;
    return card(kind, kind === "n" ? { k: "n", e, pl: false } : kind === "v" ? { k: "v", e, f: "base" } : { k: kind, e });
  }
  function starterDeck() {
    var L = [
      ["pron", ["i", "you", "he", "she", "we", "they"]],
      ["n", ["apple", "book", "dog", "cat", "pizza", "guitar", "friend", "teacher", "sister", "park", "library", "station", "morning", "Monday"]],
      ["v", ["eat", "read", "play", "like", "buy", "watch", "go", "run", "make", "see", "write", "swim", "drink", "study"]],
      ["adj", ["big", "small", "new", "happy", "red", "old"]],
      ["adv", ["quickly", "well", "yesterday", "today", "here", "slowly", "tomorrow"]]
    ];
    var d = [];
    L.forEach(function(g) {
      g[1].forEach(function(w) {
        var c = mk(g[0], w);
        if (c) d.push(c);
      });
    });
    return d;
  }
  var TSU = [
    ["\u51A0\u8A5E", [["det", "a"], ["det", "the"], ["det", "this"], ["det", "that"]]],
    ["\u6240\u6709", [["pos", "i", "my"], ["pos", "you", "your"], ["pos", "he", "his"], ["pos", "she", "her"], ["pos", "we", "our"], ["pos", "they", "their"]]],
    ["\u524D\u7F6E\u8A5E", [["prep", "in"], ["prep", "at"], ["prep", "on"], ["prep", "to"], ["prep", "with"], ["prep", "for"], ["prep", "from"], ["prep", "by"], ["prep", "up"], ["prep", "down"], ["prep", "out"], ["prep", "off"], ["prep", "away"], ["prep", "back"]]],
    ["\u52A9\u52D5\u8A5E", [["modal", "can"], ["modal", "will"], ["modal", "must"], ["modal", "should"], ["modal", "may"], ["sm", "want to"], ["sm", "have to"], ["sm", "need to"], ["sm", "be going to"]]],
    ["be/have/do", [["be", "pres"], ["hv", "pres"], ["do", "pres"], ["not", ""], ["deg", "very"]]],
    ["\u3064\u306A\u3050", [["conj", "and"], ["conj", "but"], ["conj", "so"], ["conj", "when"], ["conj", "if"], ["conj", "because"], ["rel", "who", "who"], ["rel", "which", "which"], ["rel", "that", "that"]]]
  ];
  var TSU_EASY = [
    ["\u524D\u7F6E\u8A5E", [["prep", "to"], ["prep", "with"], ["prep", "for"], ["prep", "from"], ["prep", "up"], ["prep", "out"], ["prep", "off"], ["prep", "back"]]],
    TSU[1],
    TSU[3],
    TSU[4],
    TSU[5]
  ];
  function curTSU() {
    return TSU;
  }
  function tsuCard(spec) {
    var k = spec[0], w;
    if (k === "pos") w = { k: "pr", v: spec[1] };
    else if (k === "sm") w = { k: "sm", v: spec[1], t: "pres" };
    else if (k === "not") w = { k: "not" };
    else if (k === "do") w = { k: "do", v: "pres", neg: false };
    else w = { k, v: spec[1] };
    return card("t", w, { tsu: true, label: spec[2] || null });
  }
  function cardText(c) {
    if (c.label) return c.label;
    if (c.w.k === "do") return c.w.neg ? c.w.v === "past" ? "didn't" : "don't" : c.w.v === "past" ? "did" : "do";
    var t = G.wordText(c.w, CFG);
    if (c.w.k === "be") t = c.w.v === "past" ? c.w.neg ? "be(\u904E\u53BB\u30FB\u5426\u5B9A)" : "be(\u904E\u53BB)" : c.w.neg ? "be(\u5426\u5B9A)" : "be";
    if (c.w.k === "hv") t = (c.w.v === "past" ? "had" : "have") + (c.w.neg ? "n't" : "");
    if (c.w.k === "modal") t = c.w.neg ? { can: "can't", could: "couldn't", will: "won't", would: "wouldn't", must: "mustn't", should: "shouldn't", may: "may not", might: "might not" }[c.w.v] || c.w.v + " not" : c.w.v;
    return t === "i" ? "I" : t;
  }
  function colorOf(c) {
    var k = c.w.k;
    return k === "n" || k === "pr" || k === "det" ? "n" : k === "v" ? "v" : k === "adj" || k === "adv" || k === "deg" ? "m" : k === "prep" ? "p" : k === "conj" || k === "rel" ? "c" : "a";
  }
  function cyclable(c) {
    return !c.tsu && (c.kind === "v" || c.kind === "n" && G.isCount(c.w.e) && !c.w.e.ind) || c.tsu && /^(be|hv|det|do|modal|sm)$/.test(c.w.k);
  }
  function cycle(c) {
    var w = c.w;
    if (w.k === "v") {
      var F = ["base", "past", "pp", "ing"], i = F.indexOf(w.f || "base");
      w.f = F[(i + 1) % 4];
    } else if (w.k === "n") w.pl = !w.pl;
    else if (w.k === "be" || w.k === "hv") {
      var st = (w.v === "past" ? 1 : 0) + (w.neg ? 2 : 0);
      st = (st + 1) % 4;
      w.v = st & 1 ? "past" : "pres";
      w.neg = !!(st & 2);
    } else if (w.k === "do") {
      var sd = (w.v === "past" ? 1 : 0) + (w.neg ? 2 : 0);
      sd = (sd + 1) % 4;
      w.v = sd & 1 ? "past" : "pres";
      w.neg = !!(sd & 2);
    } else if (w.k === "modal") {
      var FAM = { can: ["can", "could"], could: ["can", "could"], will: ["will", "would"], would: ["will", "would"], may: ["may", "might"], might: ["may", "might"], must: ["must"], should: ["should"] }[w.v] || [w.v], L = FAM.length * 2, si = FAM.indexOf(w.v) + (w.neg ? FAM.length : 0);
      si = (si + 1) % L;
      w.v = FAM[si % FAM.length];
      w.neg = si >= FAM.length;
    } else if (w.k === "sm") w.t = w.t === "past" ? "pres" : "past";
    else if (w.k === "det") w.v = { a: "the", the: "a", "this": "that", that: "this" }[w.v];
  }
  var FORM_JA = { base: "\u539F\u5F62\u30FB\u73FE\u5728", past: "\u904E\u53BB\u5F62", pp: "\u904E\u53BB\u5206\u8A5E", ing: "-ing\u5F62" };
  function isPlace(t) {
    return t.t === "PP" && (t.cat === "place" || t.np && t.np.noun && t.np.noun.cat === "place") || t.t === "ADV" && t.ak === "place" || t.t === "ID" && t.ik === "place";
  }
  function isTime(t) {
    return t.t === "PP" && t.cat === "time" || t.t === "ADV" && t.ak === "time" || t.t === "ID" && t.ik === "time";
  }
  function dummy(pr) {
    return G.chainState([{ k: "pr", v: pr }], CFG).chunk;
  }
  function chunkTx(t) {
    return t.t === "NP" && t.pron ? G.PRON[t.pron].obj : G.chunkText(t, CFG);
  }
  function isPerson(np) {
    return np.noun && /^(person|animal)$/.test(np.noun.cat);
  }
  function mergeNP(np, extra, text, kind) {
    var m = {};
    for (var k in np) m[k] = np[k];
    m.words = np.words.concat([].concat.apply([], extra.map(function(t) {
      return t.words || [];
    })));
    m.postText = (np.postText ? np.postText + " " : "") + text;
    m.postKind = kind;
    return m;
  }
  function relClause(head, rel, R2) {
    if (rel === "who" && !isPerson(head)) return null;
    if (rel === "which" && head.noun && head.noun.cat === "person") return null;
    if (R2[0] && R2[0].t === "VP") {
      var r = G.parse([dummy(head.num === "pl" ? "they" : "he")].concat(R2), CFG);
      if (r.ok && r.kind === "S") return rel + " " + r.text.replace(/^\S+\s/, "").replace(/\.$/, "");
    }
    if (rel !== "who" && R2.length === 2 && R2[0].t === "NP" && R2[1].t === "VP" && R2[1].verb && R2[1].verb.fr !== "intr") {
      var r2 = G.parse(R2.concat([dummy("it")]), CFG);
      if (r2.ok && r2.kind === "S") return rel + " " + r2.text.replace(/\s+it\.$/, "").replace(/^(\w)(\w*)/, function(m, a, b) {
        return m === "I" ? m : a.toLowerCase() + b;
      });
    }
    return null;
  }
  function postVariants(T2) {
    var out = [];
    function gen(i, acc) {
      if (out.length > 40) return;
      if (i >= T2.length) {
        out.push(acc);
        return;
      }
      var t = T2[i];
      gen(i + 1, acc.concat([t]));
      if (t.t !== "NP" || t.pron || !t.noun) return;
      var nx = T2[i + 1];
      if (!nx) return;
      if (nx.t === "PP") gen(i + 2, acc.concat([mergeNP(t, [nx], G.chunkText(nx, CFG), "pp")]));
      var vp = nx;
      if (vp.t === "PART") {
        for (var k = 1; k <= 2 && i + 2 + k <= T2.length; k++) {
          var ab = T2.slice(i + 2, i + 2 + k);
          if (ab.some(function(x) {
            return !/^(NP|PP|ADV)$/.test(x.t);
          })) break;
          if (ab.length && ab[0].t === "NP" && (vp.vf === "pp" || vp.verb.fr === "intr")) break;
          gen(i + 2 + k, acc.concat([mergeNP(t, [vp].concat(ab), [G.wordText(vp.words[0], CFG)].concat(ab.map(chunkTx)).join(" "), vp.vf)]));
        }
      }
      if (nx.t === "REL") for (var j = i + 3; j <= T2.length; j++) {
        var tx = relClause(t, nx.v, T2.slice(i + 2, j));
        if (tx) gen(j, acc.concat([mergeNP(t, [nx].concat(T2.slice(i + 2, j)), tx, "rel")]));
      }
    }
    gen(0, []);
    return out;
  }
  var PARTICLE = ["up", "down", "out", "off", "away", "back", "on", "in", "over"];
  function vtext(e, f) {
    return G.wordText({ k: "v", e, f }, CFG);
  }
  function regular(e) {
    return vtext(e, "past") === vtext(e, "pp");
  }
  function prevCore(ws, i) {
    for (var j = i - 1; j >= 0; j--) if (ws[j].k !== "not" && ws[j].k !== "deg" && ws[j].k !== "adv") return ws[j];
    return null;
  }
  var MOTION_V = ["go", "come", "run", "walk", "move", "fly", "drive", "travel", "return", "swim", "jump", "hurry", "ride", "climb", "get", "send", "bring", "take"];
  function autoWord(k, v) {
    return { id: -1, kind: "t", tsu: true, auto: true, chips: 0, bonus: 0, w: { k, v } };
  }
  function autoInsert(ws, crow, skipAfterVerb) {
    var hasVerb = ws.some(function(w2) {
      return /^(v|be|modal|sm|hv)$/.test(w2.k);
    }), out = [], oc = [], changed = false, seenV = false, motion2 = false, past = ws.some(function(w2) {
      return w2.k === "adv" && /yesterday|ago|last/.test(w2.e.w);
    });
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (!hasVerb && w.k === "adj" && i > 0 && (ws[i - 1].k === "n" || ws[i - 1].k === "pr")) {
        var bw = autoWord("be", past ? "past" : "pres");
        out.push(bw.w);
        oc.push(bw);
        changed = true;
        hasVerb = true;
        seenV = true;
      }
      if (w.k === "n" && w.e && (w.e.cat === "place" || w.e.cat === "time") && seenV) {
        var j = i;
        while (j > 0 && (/^(det|adj)$/.test(ws[j - 1].k) || ws[j - 1].k === "pr" && crow[j - 1].tsu)) j--;
        var pw = ws[j - 1];
        if (pw && pw.k !== "prep" && !(skipAfterVerb && pw.k === "v")) {
          var pv = w.e.cat === "time" ? w.e.prep || "on" : motion2 ? "to" : w.e.prep || "in", aw = autoWord("prep", pv), at = out.length - (i - j);
          out.splice(at, 0, aw.w);
          oc.splice(at, 0, aw);
          changed = true;
        }
      }
      if (w.k === "v" || w.k === "be") {
        seenV = true;
        if (w.k === "v" && MOTION_V.indexOf(w.e.w.split(" ")[0]) >= 0) motion2 = true;
      }
      out.push(w);
      oc.push(crow[i]);
    }
    return changed ? { ws: out, crow: oc } : null;
  }
  function fixEmph(r, emph) {
    if (!emph || r.state !== "ok") return r;
    r.text = r.text.replace(/\b(do|does|did)(n't| not)\b/i, "$1");
    r.f.neg = false;
    r.f.emph = true;
    if (r.ja) r.ja = r.ja.replace("(\u301C\u306A\u3044)", "(\u672C\u5F53\u306B)");
    return r;
  }
  function evaluate(row, quick) {
    try {
      return evaluateRaw(row, quick);
    } catch (e) {
      if (window.console) console.warn("evaluate", e);
      return { state: "bad", msg: "\u3053\u306E\u4E26\u3073\u306F\u8AAD\u3081\u306A\u3044\u3002\u4E26\u3079\u76F4\u305D\u3046" };
    }
  }
  function evaluateRaw(row, quick) {
    if (!row.length) return { state: "empty" };
    var ws = [], crow = [], phr = false, doPast = false, emph = false;
    for (var i = 0; i < row.length; i++) {
      var w = row[i].w, nx = row[i + 1] && row[i + 1].w;
      if (w.k === "do") {
        ws.push({ k: "not" });
        crow.push(row[i]);
        if (w.v === "past") doPast = true;
        if (!w.neg) emph = true;
        continue;
      }
      if (w.neg && /^(be|hv|modal)$/.test(w.k)) {
        ws.push(w);
        crow.push(row[i]);
        ws.push({ k: "not" });
        crow.push(row[i]);
        continue;
      }
      if (LEVEL === 0 && w.k === "v" && (w.f === "base" || w.f === "past") && w.e.fr !== "intr") {
        var pvb = prevCore(row.map(function(c) {
          return c.w;
        }), i), sN = null;
        for (var si = i - 1; si >= 0; si--) {
          if (row[si].w.k === "n") {
            sN = row[si].w;
            break;
          }
          if (row[si].w.k === "pr" && !row[si].tsu) break;
        }
        var nxi = i + 1;
        while (row[nxi] && /^(det|adj)$/.test(row[nxi].w.k)) nxi++;
        var nxw = row[nxi] && row[nxi].w, objLike = nxw && (nxw.k === "pr" && !row[nxi].tsu || nxw.k === "n" && !/^(place|time)$/.test(nxw.e.cat));
        if (pvb && pvb.k === "be" && sN && !/^(person|animal)$/.test(sN.e.cat) && !objLike) {
          var wp = {};
          for (var kp in w) wp[kp] = w[kp];
          wp.f = "pp";
          w = wp;
        }
      }
      if (doPast && w.k === "v") {
        var wc = {};
        for (var kk in w) wc[kk] = w[kk];
        wc.f = "past";
        w = wc;
        doPast = false;
      }
      if (w.k === "v" && w.f === "past" && regular(w.e)) {
        var pv = prevCore(row.map(function(c) {
          return c.w;
        }), i);
        if (pv && (pv.k === "be" || pv.k === "hv")) {
          var wq = {};
          for (var kq in w) wq[kq] = w[kq];
          wq.f = "pp";
          w = wq;
        }
      }
      if (w.k === "v" && nx && nx.k === "prep" && PARTICLE.indexOf(nx.v) >= 0 && E.verb[w.e.w + " " + nx.v]) {
        ws.push({ k: "v", e: E.verb[w.e.w + " " + nx.v], f: w.f });
        crow.push(row[i]);
        i++;
        phr = true;
        continue;
      }
      ws.push(w);
      crow.push(row[i]);
    }
    var r = fixEmph(evalWords(crow, ws, row), emph);
    if (r.state === "ok") {
      r.f.phrasal = phr;
      return r;
    }
    if (LEVEL === 0) {
      for (var vi = 0; vi < 2; vi++) {
        var ins = autoInsert(ws, crow, vi === 1);
        if (!ins) continue;
        var r3 = evalWords(ins.crow, ins.ws, row);
        if (r3.state === "ok") {
          r3.f.phrasal = phr;
          return r3;
        }
      }
    }
    if (quick) return r;
    var opts = [];
    ws.forEach(function(w2, k) {
      if (w2.k !== "v" || !(w2.f === "ing" || w2.f === "pp" || w2.f === "past")) return;
      var pv2 = prevCore(ws, k), nx2 = ws[k + 1], nx22 = ws[k + 2], alt = [];
      var nounNext = nx2 && (nx2.k === "n" || nx2.k === "adj" && nx22 && nx22.k === "n");
      var txt = vtext(w2.e, w2.f === "past" ? "pp" : w2.f);
      if ((w2.f === "ing" || w2.f === "pp" || w2.f === "past" && regular(w2.e)) && nounNext && w2.e.w.indexOf(" ") < 0 && (!pv2 || /^(det|pr|adj|prep|v|conj)$/.test(pv2.k)))
        alt.push({ w: { k: "adj", e: { w: txt, lv: w2.e.lv || 1, ja: w2.e.ja, jt: "i" } }, flag: "padj" });
      if (w2.f === "ing" && w2.e.w.indexOf(" ") < 0 && (!pv2 || /^(v|prep|conj)$/.test(pv2.k)) && !(nx2 && /^(det|n|pr)$/.test(nx2.k) && !pv2)) {
        var ne = E.noun[txt] || { w: txt, c: "u", ad: "", cat: "act", tg: ["act"], lv: w2.e.lv || 1, ja: (w2.e.ja || "") + "\u3053\u3068" };
        alt.push({ w: { k: "n", e: ne, pl: false }, flag: "gerund" });
      }
      if ((w2.f === "past" || w2.f === "pp") && regular(w2.e)) alt.push({ w: { k: "v", e: w2.e, f: w2.f === "past" ? "pp" : "past" }, flag: null });
      if (alt.length) opts.push({ k, alt });
    });
    var tries = 0, best2 = r;
    (function go(j, cur3, flags) {
      if (best2.state === "ok" || tries > 12) return;
      if (j === opts.length) {
        if (!Object.keys(flags).length && cur3 === ws) return;
        tries++;
        var r2 = evalWords(crow, cur3, row);
        if (r2.state === "ok") {
          r2.f.phrasal = phr;
          for (var f in flags) r2.f[f] = true;
          best2 = r2;
        }
        return;
      }
      go(j + 1, cur3, flags);
      opts[j].alt.forEach(function(a) {
        var c2 = cur3.slice();
        c2[opts[j].k] = a.w;
        var f2 = {};
        for (var x in flags) f2[x] = 1;
        if (a.flag) f2[a.flag] = 1;
        go(j + 1, c2, f2);
      });
    })(0, ws, {});
    return best2;
  }
  function evalWords(row, words, fullRow) {
    var n = words.length;
    var memo = {}, segErr = null, far = 0, found = null, bestBad = null, tried = 0;
    function cs(i, j) {
      var k = i + ":" + j;
      if (!(k in memo)) memo[k] = words.slice(i, j).some(function(w) {
        return w.k === "rel";
      }) ? {} : G.chainState(words.slice(i, j), CFG);
      return memo[k];
    }
    function dfs(i, T2) {
      if (found || tried > 400) return;
      if (i === n) {
        tried++;
        var vars = postVariants(T2), r = null;
        for (var vi = 0; vi < vars.length; vi++) {
          var r1 = G.parse(vars[vi], CFG);
          if (r1.ok && r1.kind === "S") {
            found = { r: r1, T: vars[vi] };
            return;
          }
          if (!r) r = r1;
        }
        var v = G.viable(T2, true), cand = { r, wait: v && r.sev === 1 };
        if (!bestBad || cand.wait && !bestBad.wait || cand.r.sev < bestBad.r.sev) bestBad = cand;
        return;
      }
      if (i > far) far = i;
      if (words[i].k === "rel") {
        T2.push({ t: "REL", v: words[i].v, words: [words[i]] });
        dfs(i + 1, T2);
        T2.pop();
        return;
      }
      var pw = words[i];
      if (pw.k === "v" && (pw.f === "ing" || pw.f === "pp") && i > 0) {
        T2.push({ t: "PART", verb: pw.e, vf: pw.f, words: [pw] });
        dfs(i + 1, T2);
        T2.pop();
        if (found) return;
      }
      for (var j = n; j > i; j--) {
        var st = cs(i, j);
        if (st.complete && !st.err) {
          T2.push(st.chunk);
          dfs(j, T2);
          T2.pop();
          if (found) return;
        } else if (st.complete && st.err && !segErr) segErr = st.err;
      }
    }
    dfs(0, []);
    if (found) {
      var sm = semantic(found.r);
      if (sm) return { state: "bad", msg: sm };
      return { state: "ok", text: found.r.text, f: features(found.r, fullRow), nps: nounPhrases(found.r), ja: jaOf(found.r), r: found.r };
    }
    if (bestBad) return { state: bestBad.wait ? "wait" : "bad", msg: bestBad.r.err ? bestBad.r.err.msg : "\u307E\u3060\u6587\u306B\u306A\u3063\u3066\u3044\u306A\u3044" };
    var tail = cs(far, n);
    if (segErr) return { state: "bad", msg: segErr.msg };
    if (tail.prefix) return { state: "wait", msg: "\u300C" + cardText(row[n - 1]) + "\u300D\u306E\u5F8C\u308D\u306B\u7D9A\u304D\u304C\u5FC5\u8981" };
    return { state: "bad", at: far, atCard: row[far], msg: "\u300C" + cardText(row[far]) + "\u300D\u306E\u3068\u3053\u308D\u3067 \u3064\u306A\u304C\u3089\u306A\u3044" };
  }
  var THING_OK = ["go", "come", "run", "move", "stop", "start", "begin", "change", "open", "close", "break", "fall", "work", "arrive", "leave", "turn", "fly", "grow", "shine", "happen", "end", "ring", "burn", "melt", "float", "sink", "roll", "shake", "hurt", "cost", "smell", "taste", "sound", "look"];
  function headNoun(np) {
    if (!np || np.t !== "NP" || np.pron) return null;
    if (np.noun) return np.noun;
    var w = (np.words || []).filter(function(x) {
      return x.k === "n";
    }).pop();
    return w ? w.e : null;
  }
  function semantic(r) {
    var bad = null;
    r.alt.cls.forEach(function(cl) {
      if (bad) return;
      var vp = cl.vp, v = vp.verb, sn = headNoun(cl.subj);
      if (sn && v && !vp.be && !/^(person|animal)$/.test(sn.cat) && THING_OK.indexOf(v.w) < 0) bad = "\u300C" + sn.w + "\u300D\u304C " + v.w + " \u3059\u308B\u306E\u306F\u610F\u5473\u304C\u5909(\u4E3B\u8A9E\u306F\u4EBA\u304B\u52D5\u7269\u306B)";
      if (bad || !v || vp.be) return;
      var ot = (v.ot || []).filter(function(t) {
        return t !== "any";
      });
      if (!ot.length) return;
      cl.comps.forEach(function(t) {
        var e = headNoun(t);
        if (bad || !e) return;
        var tags = [e.cat].concat(e.tg || []);
        if (ot.some(function(x) {
          return tags.indexOf(x) >= 0;
        })) return;
        var foodOnly = ot.every(function(x) {
          return /^(food|drink)$/.test(x);
        });
        if (foodOnly || /^(person|animal|place|time)$/.test(e.cat)) bad = "\u300C" + v.w + "\u300D\u306E\u76EE\u7684\u8A9E\u306B\u300C" + e.w + "\u300D\u306F\u5408\u308F\u306A\u3044";
      });
    });
    return bad;
  }
  function jaOf(r) {
    try {
      let clJa = function(cl) {
        var o = [], vp = cl.vp, mods = cl.pre.concat(cl.posts);
        if (cl.subj) o.push(G.gloss(cl.subj) + "\u306F");
        mods.filter(isTime).forEach(function(t) {
          o.push(G.gloss(t));
        });
        mods.filter(function(t) {
          return !isTime(t);
        }).forEach(function(t) {
          o.push(G.gloss(t));
        });
        cl.comps.forEach(function(t) {
          o.push(G.gloss(t) + (t.t === "NP" && !(vp.be && !vp.verb) ? "\u3092" : ""));
        });
        var v = G.gloss(vp).replace(/\(〜ない\)/, "");
        if (vp.be && vp.verb && vp.vf === "pp") v += "(\u301C\u3055\u308C\u308B)";
        else if (vp.be && vp.verb && vp.vf === "ing") v += "(\u301C\u3057\u3066\u3044\u308B)";
        else if (vp.have) v += "(\u301C\u3057\u305F\u3068\u3053\u308D\u30FB\u3057\u305F\u3053\u3068\u304C\u3042\u308B)";
        if (vp.neg) v += "(\u301C\u306A\u3044)";
        o.push(v);
        return o.filter(Boolean).join(" / ");
      };
      var past = !!r.info.past;
      var parts2 = [], a = r.alt;
      if (a.front && a.front.cl) parts2.push("\u3008" + a.front.conj.v + "\u3009" + clJa(a.front.cl));
      a.cls.forEach(function(cl, i) {
        parts2.push((i && a.co ? "\u3008" + a.co.v + "\u3009" : "") + clJa(cl));
      });
      return parts2.join("\u3001") + (past ? "(\u904E\u53BB)" : "");
    } catch (e) {
      return "";
    }
  }
  function advise(row) {
    var cs = row.filter(function(c) {
      return !c.tsu || /^(be|hv|modal|sm)$/.test(c.w.k);
    }), K = function(c) {
      return c.kind === "pron" || c.kind === "n" ? "N" : c.kind === "v" || /^(be|hv)$/.test(c.w.k) ? "V" : c.kind === "adj" ? "A" : c.kind === "adv" ? "D" : /^(modal|sm)$/.test(c.w.k) ? "M" : "x";
    };
    var seq = cs.map(K).join(""), hasConj = row.some(function(c) {
      return /^(conj|rel)$/.test(c.w.k);
    });
    if (seq.indexOf("V") < 0) return "\u52D5\u8A5E(v.)\u304B be \u3092\u7F6E\u3053\u3046";
    if (seq.charAt(0) === "V" && !hasConj) return "\u6587\u306E\u6700\u521D\u306B\u4E3B\u8A9E(I / he / the dog \u306A\u3069)\u3092\u7F6E\u3053\u3046";
    if (/V[^V]*V/.test(seq.replace(/MV/g, "V")) && !hasConj && !row.some(function(c) {
      return c.w.k === "v" && /ing|pp/.test(c.w.f);
    })) return "\u52D5\u8A5E\u304C2\u3064\u3042\u308B\u30021\u3064\u5916\u3059\u304B\u3001and / when / because \u3067\u3064\u306A\u3054\u3046";
    if (/^N+N/.test(seq) && seq.indexOf("NV") > 1) return "\u52D5\u8A5E\u306E\u524D\u306B\u540D\u8A5E\u304C2\u3064\u3002\u76EE\u7684\u8A9E\u306F\u52D5\u8A5E\u306E\u3046\u3057\u308D\u3078";
    if (/VNN/.test(seq) && !row.some(function(c) {
      return c.w.k === "prep";
    })) return "\u540D\u8A5E\u304C2\u3064\u7D9A\u3044\u3066\u3044\u308B\u3002\u9593\u306B\u524D\u7F6E\u8A5E(in / with \u306A\u3069)\u3092\u5165\u308C\u3088\u3046";
    if (/NA/.test(seq) && !row.some(function(c) {
      return c.w.k === "be";
    })) return "\u5F62\u5BB9\u8A5E\u306F\u540D\u8A5E\u306E\u524D\u304B\u3001be \u306E\u3046\u3057\u308D\u306B\u7F6E\u3053\u3046";
    if (/^AN|^DN/.test(seq)) return "\u4E3B\u8A9E\u306E\u524D\u306B\u5F62\u5BB9\u8A5E\u30FB\u526F\u8A5E\u304C\u6765\u3066\u3044\u308B\u3002\u9806\u756A\u3092\u898B\u76F4\u305D\u3046";
    return "";
  }
  function nounPhrases(r) {
    var out = [], add = function(t) {
      if (!t) return;
      if (t.t === "NP") out.push(t);
      if (t.t === "PP" && t.np) out.push(t.np);
    };
    var cl = function(c) {
      if (!c) return;
      add(c.subj);
      (c.comps || []).forEach(add);
      (c.posts || []).forEach(add);
      (c.pre || []).forEach(add);
    };
    r.alt.cls.forEach(cl);
    if (r.alt.front) {
      cl(r.alt.front.cl);
      add(r.alt.front.tok);
    }
    return out.map(function(np) {
      return { pron: np.pron || null, w: np.noun ? np.noun.w : null, det: np.det, poss: np.poss, num: np.num, person: !!(np.noun && /^(person|animal)$/.test(np.noun.cat)) };
    });
  }
  function clWords(cl) {
    var w = [];
    if (!cl) return w;
    [cl.subj, cl.vp].concat(cl.comps || [], cl.posts || [], cl.pre || []).forEach(function(t) {
      if (t && t.words) w = w.concat(t.words);
    });
    return w;
  }
  var COMPAT = { write: ["read"], cook: ["food"], make: ["food", "drink"], drink: [], open: ["read"] };
  function features(r, row) {
    var a = r.alt, cls = a.cls, main = cls[0], vp = main.vp, f = { words: row.length, adj: 0, rare: 0 };
    row.forEach(function(c) {
      if (c.w.k === "adj") f.adj++;
      if (!c.tsu && lvOf(c) >= 2) f.rare++;
    });
    f.cats = {};
    row.forEach(function(c) {
      var k = c.w.k;
      if (k === "n") {
        f.cats[c.w.e.cat] = 1;
        if (c.w.pl) f.plural = true;
      }
      if (k === "det") f["det_" + c.w.v] = true;
      if (k === "pr" && c.w.v === "it" && !c.tsu) f.it = true;
      if (c.guest || c.by === "guest") f.guest = true;
    });
    var nO = main.comps.filter(function(t) {
      return t.t === "NP";
    }).length;
    f.O = nO >= 1;
    f.O2 = nO >= 2;
    f.C = main.comps.some(function(t) {
      return t.t === "AP";
    }) || !!vp.be && !vp.verb && nO >= 1;
    f.aux = !!(vp.modal || vp.semi);
    f.prog = !!(vp.be && vp.verb && vp.vf === "ing");
    f.passive = !!(vp.be && vp.verb && vp.vf === "pp");
    f.perfect = !!vp.have;
    f.neg = !!vp.neg;
    f.pronSubj = !!(main.subj && main.subj.pron);
    var mods = main.pre.concat(main.comps, main.posts);
    if (a.front && a.front.tok) mods.push(a.front.tok);
    var seen = {}, dup = [];
    mods.forEach(function(t) {
      var k = isPlace(t) ? "place" : isTime(t) ? "time" : t.t === "ADV" && t.ak === "manner" ? "manner" : null;
      if (!k) return;
      if (seen[k]) dup = dup.concat(t.words || []);
      seen[k] = 1;
    });
    f.place = !!seen.place;
    f.time = !!seen.time;
    f.manner = seen.manner || (vp.advs || []).length ? 1 : 0;
    f.dupWords = dup;
    var sub = [];
    cls.slice(1).forEach(function(c) {
      sub = sub.concat(clWords(c));
    });
    if (a.front && a.front.cl) sub = sub.concat(clWords(a.front.cl));
    f.halfWords = sub;
    f.post = cls.some(function(cl) {
      return [cl.subj].concat(cl.comps, cl.posts).some(function(t) {
        return t && t.postKind;
      });
    });
    f.past = !!r.info.past;
    f.clause = !!r.info.clause;
    f.coord = !!r.info.coord;
    f.hasArt = row.some(function(c) {
      return c.w.k === "det";
    });
    f.hasPP = mods.some(function(t) {
      return t.t === "PP";
    });
    var v = vp.verb;
    f.colloc = null;
    f.pair = null;
    if (v && !vp.be) {
      var ot = (v.ot || []).filter(function(x) {
        return x !== "any";
      }), on = main.comps.filter(function(t) {
        return t.t === "NP" && !t.pron && t.noun;
      })[0];
      if (ot.length && on) {
        var e = on.noun, tags = [e.cat].concat(e.tg || [], COMPAT[v.w] && (e.tg || []).some(function(x) {
          return COMPAT[v.w].indexOf(x) >= 0;
        }) ? ot : []), m = ot.filter(function(x) {
          return tags.indexOf(x) >= 0;
        });
        f.pair = v.w + " + " + e.w;
        f.colloc = m.some(function(x) {
          return x !== "thing";
        }) && ot.indexOf("thing") < 0 && ot.length <= 3 ? "good" : m.length ? null : "bad";
      }
    }
    f.combo = f.colloc === "good";
    if (vp.verb && vp.be) {
      var txt = " " + r.text.toLowerCase().replace(/[.,!?]/g, "") + " ", ing = first(vtext(vp.verb, "ing")), pp = first(vtext(vp.verb, "pp"));
      var beRe = "(am|is|are|was|were|be|been|isn't|aren't|wasn't|weren't)( not)?( \\w+ly)? ";
      var isIng = new RegExp(" " + beRe + ing + " ").test(txt), isPP = new RegExp(" " + beRe + pp + " ").test(txt);
      if (isIng || isPP) {
        f.prog = isIng;
        f.passive = !isIng && isPP;
      }
    }
    var sub = {};
    cls.slice(1).concat(a.front && a.front.cl ? [a.front.cl] : []).forEach(function(cl) {
      var v2 = cl.vp;
      if (!v2) return;
      if (v2.be && v2.verb) {
        var t2 = " " + r.text.toLowerCase().replace(/[.,!?]/g, "") + " ", b2 = "(am|is|are|was|were|be|been|isn't|aren't|wasn't|weren't)( not)? ";
        if (new RegExp(" " + b2 + first(vtext(v2.verb, "ing")) + " ").test(t2)) sub.prog = 1;
        else if (new RegExp(" " + b2 + first(vtext(v2.verb, "pp")) + " ").test(t2)) sub.passive = 1;
      }
      if (v2.have) sub.perfect = 1;
      if (v2.modal || v2.semi) sub.aux = 1;
      if (v2.neg) sub.neg = 1;
      if (cl.comps.some(function(t) {
        return t.t === "NP";
      })) sub.O = 1;
      if (cl.comps.some(function(t) {
        return t.t === "AP";
      }) || v2.be && !v2.verb) sub.C = 1;
      var m2 = cl.pre.concat(cl.posts);
      if (m2.some(isPlace)) sub.place = 1;
      if (m2.some(isTime)) sub.time = 1;
    });
    f.sub = sub;
    return f;
  }
  function storyOf(nps, prev) {
    if (!prev || !prev.length || !nps) return null;
    var res = null;
    nps.forEach(function(np) {
      if (np.pron === "it" && prev.some(function(p) {
        return p.w && !p.person && p.num !== "pl";
      })) res = "pron";
      else if ((np.pron === "he" || np.pron === "she") && prev.some(function(p) {
        return p.w && p.person && p.num !== "pl";
      })) res = "pron";
      else if (np.pron === "they" && prev.some(function(p) {
        return p.num === "pl" && (p.w || p.pron && p.pron !== "i" && p.pron !== "you");
      })) res = "pron";
      else if (!res && np.w && (np.det === "the" || np.det === "this" || np.det === "that" || np.poss) && prev.some(function(p) {
        return p.w === np.w;
      })) res = "def";
    });
    return res;
  }
  function baseScore(row, ev) {
    var f = ev.f, y = yaku(f), chips = y.chips, mult = y.mult, steps = [{ t: "yaku", label: y.name, chips, mult }];
    var dup = f.dupWords || [], half = f.halfWords || [];
    row.forEach(function(c, i) {
      var v = c.chips + (c.bonus || 0), tag = "";
      if (dup.indexOf(c.w) >= 0) {
        v = 0;
        tag = "\u91CD\u8907";
      } else if (half.indexOf(c.w) >= 0) {
        v = Math.floor(v / 2);
        tag = "\xBD";
      }
      chips += v;
      steps.push({ t: "card", i, add: v, tag, chips, mult });
    });
    return { y, chips, mult, steps };
  }
  var PARTS = [
    ["SV", "S+V", 10, 1],
    ["O", "+O", 10, 1],
    ["O2", "+O2", 15, 1],
    ["C", "+C", 10, 1],
    ["place", "+\u5834\u6240", 10, 1],
    ["time", "+\u6642", 10, 1],
    ["manner", "+\u69D8\u5B50", 5, 1],
    ["aux", "\u52A9\u52D5\u8A5E", 5, 1],
    ["prog", "\u9032\u884C\u5F62", 10, 1],
    ["perfect", "\u5B8C\u4E86\u5F62", 20, 2],
    ["passive", "\u53D7\u3051\u8EAB", 20, 2],
    ["neg", "\u5426\u5B9A", 5, 1],
    ["past", "\u904E\u53BB", 5, 1],
    ["clause", "\u7BC0", 15, 1],
    ["post", "\u5F8C\u7F6E\u4FEE\u98FE", 25, 2],
    ["phrasal", "\u53E5\u52D5\u8A5E", 15, 1],
    ["gerund", "\u52D5\u540D\u8A5E", 20, 2],
    ["padj", "\u5206\u8A5E\u306E\u5F62\u5BB9\u8A5E", 15, 1],
    ["combo", "\u540D\u30B3\u30F3\u30D3", 0, 2],
    ["story", "\u3064\u306A\u304C\u308A", 0, 2],
    ["storyP", "\u4EE3\u540D\u8A5E\u3067\u53D7\u3051\u308B", 0, 3]
  ];
  var PART_JA = {};
  PARTS.forEach(function(p) {
    PART_JA[p[0]] = p[1];
  });
  function yaku(f) {
    var on = PARTS.filter(function(p) {
      return p[0] === "SV" || f[p[0]];
    }), chips = 0, mult = 0;
    on.forEach(function(p) {
      var lv = R && R.lv && R.lv[p[0]] || 0;
      chips += p[2] + lv * 10;
      mult += p[3] + lv;
    });
    var main = on.filter(function(p) {
      return /^(SV|O|O2|C|place|time|manner)$/.test(p[0]);
    }).map(function(p) {
      return p[1];
    }).join("").replace(/^S\+V/, "S+V");
    var extra = on.filter(function(p) {
      return !/^(SV|O|O2|C|place|time|manner)$/.test(p[0]);
    }).map(function(p) {
      return p[1];
    });
    return { name: main + (extra.length ? "\u30FB" + extra.join("\u30FB") : ""), chips, mult, parts: on };
  }
  var JOKERS = [
    { id: "past", name: "\u904E\u53BB\u30DE\u30CB\u30A2", desc: "\u904E\u53BB\u306E\u6587\u306F \u500D\u7387\xD72", price: 6, fx: function(f) {
      return f.past ? [["x", 2]] : [];
    } },
    { id: "adj", name: "\u304B\u3056\u308A\u8077\u4EBA", desc: "\u5F62\u5BB9\u8A5E1\u3064\u3054\u3068\u306B \u30C1\u30C3\u30D7+20", price: 4, fx: function(f) {
      return f.adj ? [["c", 20 * f.adj]] : [];
    } },
    { id: "place", name: "\u65C5\u4EBA", desc: "\u5834\u6240\u306E\u53E5\u304C\u3042\u308C\u3070 \u500D\u7387+4", price: 5, fx: function(f) {
      return f.place ? [["m", 4]] : [];
    } },
    { id: "time", name: "\u6642\u306E\u756A\u4EBA", desc: "\u6642\u306E\u53E5\u304C\u3042\u308C\u3070 \u500D\u7387+4", price: 5, fx: function(f) {
      return f.time ? [["m", 4]] : [];
    } },
    { id: "perf", name: "\u5B8C\u4E86\u306E\u9054\u4EBA", desc: "\u5B8C\u4E86\u5F62(have+\u904E\u53BB\u5206\u8A5E)\u306F \u500D\u7387\xD73", price: 7, fx: function(f) {
      return f.perfect ? [["x", 3]] : [];
    } },
    { id: "long", name: "\u9577\u6587\u5BB6", desc: "8\u8A9E\u4EE5\u4E0A\u306E\u6587\u306F \u500D\u7387\xD71.5\u300110\u8A9E\u4EE5\u4E0A\u306F\xD72", price: 6, fx: function(f) {
      return f.words >= 10 ? [["x", 2]] : f.words >= 8 ? [["x", 1.5]] : [];
    } },
    { id: "aux", name: "\u52A9\u52D5\u8A5E\u30D5\u30A1\u30F3", desc: "\u52A9\u52D5\u8A5E\u30FBwant to \u306A\u3069\u304C\u3042\u308C\u3070 \u500D\u7387+4", price: 4, fx: function(f) {
      return f.aux ? [["m", 4]] : [];
    } },
    { id: "prog", name: "\u9032\u884C\u4E2D", desc: "\u9032\u884C\u5F62(be+-ing)\u306F \u500D\u7387+6", price: 5, fx: function(f) {
      return f.prog ? [["m", 6]] : [];
    } },
    { id: "neg", name: "\u3042\u307E\u306E\u3058\u3083\u304F", desc: "\u5426\u5B9A(not)\u306E\u6587\u306F \u30C1\u30C3\u30D7+60", price: 4, fx: function(f) {
      return f.neg ? [["c", 60]] : [];
    } },
    { id: "noun", name: "\u4E3B\u5F79\u306F\u540D\u8A5E", desc: "\u4E3B\u8A9E\u304C\u4EE3\u540D\u8A5E\u3067\u306A\u3051\u308C\u3070 \u500D\u7387+3", price: 4, fx: function(f) {
      return f.pronSubj ? [] : [["m", 3]];
    } },
    { id: "obj", name: "\u76EE\u7684\u8A9E\u30CF\u30F3\u30BF\u30FC", desc: "\u76EE\u7684\u8A9E\u304C\u3042\u308C\u3070 \u30C1\u30C3\u30D7+40", price: 4, fx: function(f) {
      return f.O ? [["c", 40]] : [];
    } },
    { id: "link", name: "\u3064\u306A\u304E\u540D\u4EBA", desc: "\u7BC0(when / if / because)\u306E\u6587\u306F \u500D\u7387\xD72", price: 7, fx: function(f) {
      return f.clause ? [["x", 2]] : [];
    } },
    { id: "mini", name: "\u30DF\u30CB\u30DE\u30EA\u30B9\u30C8", desc: "4\u8A9E\u4EE5\u4E0B\u306E\u6587\u306F \u500D\u7387+8", price: 5, fx: function(f) {
      return f.words <= 4 ? [["m", 8]] : [];
    } },
    { id: "manner", name: "\u69D8\u5B50\u306E\u540D\u4EBA", desc: "\u69D8\u5B50\u306E\u526F\u8A5E1\u3064\u3054\u3068\u306B \u500D\u7387+3", price: 4, fx: function(f) {
      return f.manner ? [["m", 3 * f.manner]] : [];
    } },
    { id: "pass", name: "\u53D7\u3051\u8EAB\u306E\u7F8E\u5B66", desc: "\u53D7\u3051\u8EAB(be+\u904E\u53BB\u5206\u8A5E)\u306F \u500D\u7387\xD72.5", price: 6, fx: function(f) {
      return f.passive ? [["x", 2.5]] : [];
    } },
    { id: "rare", name: "\u8A9E\u5F59\u738B", desc: "\u3080\u305A\u304B\u3057\u3044\u8A9E\u306E\u30AB\u30FC\u30C91\u679A\u3054\u3068\u306B \u30C1\u30C3\u30D7+25", price: 5, fx: function(f) {
      return f.rare ? [["c", 25 * f.rare]] : [];
    } },
    { id: "first", name: "\u5148\u624B\u5FC5\u52DD", desc: "\u30B9\u30C6\u30FC\u30B8\u6700\u521D\u306E\u300C\u51FA\u3059\u300D\u306F \u500D\u7387+6", price: 4, fx: function(f, ctx) {
      return ctx.first ? [["m", 6]] : [];
    } },
    { id: "last", name: "\u30E9\u30B9\u30C8\u30B9\u30D1\u30FC\u30C8", desc: "\u30B9\u30C6\u30FC\u30B8\u6700\u5F8C\u306E\u300C\u51FA\u3059\u300D\u306F \u500D\u7387\xD73", price: 6, fx: function(f, ctx) {
      return ctx.last ? [["x", 3]] : [];
    } },
    { id: "lucky", name: "\u56DB\u3064\u8449", desc: "4\u56DE\u306B1\u56DE \u500D\u7387\xD73", price: 5, fx: function() {
      return rnd() < 0.25 ? [["x", 3]] : [];
    } },
    { id: "bank", name: "\u8CAF\u91D1\u7BB1", desc: "\u5229\u5B50\u306E\u4E0A\u9650\u304C 5\u219210", price: 5, fx: function() {
      return [];
    } },
    { id: "combo", name: "\u578B\u306E\u30B3\u30EC\u30AF\u30BF\u30FC", desc: "\u5F79\u306E\u8981\u7D201\u3064\u3054\u3068\u306B \u30C1\u30C3\u30D7+15", price: 5, fx: function(f, ctx) {
      return [["c", 15 * ctx.y.parts.length]];
    } }
  ];
  var BOSSES = [
    { id: "art", text: "\u51A0\u8A5E(a / the)\u3092\u4F7F\u308F\u306A\u3044\u6587\u306F 0\u70B9", ok: function(f) {
      return f.hasArt;
    } },
    { id: "past", text: "\u904E\u53BB\u306E\u6587\u3057\u304B \u70B9\u306B\u306A\u3089\u306A\u3044", ok: function(f) {
      return f.past;
    } },
    { id: "long", text: "6\u8A9E\u4EE5\u4E0A\u306E\u6587\u3057\u304B \u70B9\u306B\u306A\u3089\u306A\u3044", ok: function(f) {
      return f.words >= 6;
    } },
    { id: "npron", text: "\u4EE3\u540D\u8A5E\u304C\u4E3B\u8A9E\u306E\u6587\u306F 0\u70B9", ok: function(f) {
      return !f.pronSubj;
    } },
    { id: "pp", text: "\u524D\u7F6E\u8A5E\u306E\u53E5\u304C\u306A\u3044\u6587\u306F 0\u70B9", ok: function(f) {
      return f.hasPP;
    } },
    { id: "obj", text: "\u76EE\u7684\u8A9E\u306E\u306A\u3044\u6587\u306F 0\u70B9", ok: function(f) {
      return f.O || f.C;
    } },
    { id: "hands", text: "\u300C\u51FA\u3059\u300D\u304C3\u56DE\u3057\u304B\u306A\u3044", hands: 3, ok: function() {
      return true;
    } }
  ];
  var TARGETS = [300, 500, 800, 1200, 1800, 2700, 4e3, 6e3];
  var BOSS_AT = { 2: 1, 5: 1, 7: 1 };

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
    const ring = (h, el3, free) => {
      const r = el3 && el3.getBoundingClientRect();
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
      let el22 = null;
      if (s.also) {
        try {
          el22 = document.querySelector(s.also);
        } catch (e) {
        }
      }
      const ok = ring(hole, target(), free);
      ring(hole2, el22, true);
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

  // games/cards/src/tutorial.js
  var TUT = [
    { w: "g", f: "joy", t: "\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9\u306F\u3001\u82F1\u8A9E\u306E\u300C\u8A9E\u9806\u300D\u3092\u6B63\u3057\u304F\u4E26\u3079\u308B\u30B2\u30FC\u30E0\u3060\u3088\u3002" },
    { w: "b", f: "idea", t: "\u6587\u306E\u610F\u5473\u306F\u3001\u5909\u3067\u3082\u3060\u3044\u3058\u3087\u3046\u3076\uFF01 \u5927\u4E8B\u306A\u306E\u306F\u3001\u8A9E\u9806\u304C\u6B63\u3057\u3044\u3053\u3068\u3002" },
    { w: "g", sel: "#hand", t: "\u4E0B\u306E\u624B\u672D\u304B\u3089\u3001\u4F7F\u3044\u305F\u3044\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3057\u3066\u306D\u3002" },
    { w: "b", sel: "#row", also: "#hand", wait: () => document.querySelectorAll("#row .card").length >= 2, t: "\u4E0A\u306E\u300C\u6587\u306E\u53F0\u300D\u306B\u3001\u82F1\u8A9E\u306E\u9806\u756A\u3067\u4E26\u3079\u3088\u3046\u3002\u307E\u305A2\u679A\u3001\u4E26\u3079\u3066\u307F\u3066\uFF01" },
    { w: "g", sel: "#row", t: "\u82F1\u8A9E\u306F\u300C\u3060\u308C\u304C \u2192 \u3069\u3046\u3059\u308B \u2192 \u306A\u306B\u3092\u300D\u306E\u9806\u3002\u30AB\u30FC\u30C9\u306F\u3001\u30C9\u30E9\u30C3\u30B0\u3067\u4E26\u3079\u304B\u3048\u3089\u308C\u308B\u3088\u3002" },
    { w: "b", sel: ".pv", t: "\u8A9E\u9806\u304C\u6B63\u3057\u3044\u3068\u3001\u300C\u5F79\u300D\u3068\u70B9\u304C\u3053\u3053\u306B\u51FA\u308B\u3088\u3002\u307E\u3061\u304C\u3063\u3066\u3044\u305F\u3089\u3001\u7406\u7531\u304C\u51FA\u308B\u3088\u3002" },
    { w: "g", sel: "#bt", t: "\u6B63\u3057\u304F\u4E26\u3093\u3060\u3089\u300C\u51FA\u3059!\u300D\u3092\u62BC\u305D\u3046\u3002\u70B9\u304C\u5165\u308B\u3088\u3002" },
    { w: "b", sel: ".goal", t: "\u4E0A\u306E\u76EE\u6A19\u70B9\u306B\u5C4A\u3044\u305F\u3089\u3001\u30B9\u30C6\u30FC\u30B8\u30AF\u30EA\u30A2\uFF01" },
    { w: "g", sel: "#hb", t: "\u56F0\u3063\u305F\u3089\u3001\u{1F4A1}\u30D2\u30F3\u30C8\u304C\u52A9\u3051\u3066\u304F\u308C\u308B\u3088\u3002" },
    { w: "b", f: "joy", t: "\u307E\u305A\u306F\u3001\u8A9E\u9806\u3092\u610F\u8B58\u3057\u3066\u3001\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046\uFF01" }
  ];

  // games/cards/src/play.js
  var VSref = null;
  function registerVS(v) {
    VSref = v;
  }
  var R = null;
  function newRun() {
    R = { stage: 0, money: 4, deck: starterDeck(), jokers: [], lv: {}, best: { text: "", pts: 0 }, total: 0, played: 0, rerollCost: 2 };
    if (LEVEL === 2) for (var i = 0; i < 8; i++) {
      var g = guestCard();
      if (g) {
        g.guest = false;
        g.chips = baseChips(g);
        R.deck.push(g);
      }
    }
    startStage();
  }
  function startStage() {
    var bi = BOSS_AT[R.stage] ? pick(BOSSES.filter(function(b) {
      return !R.lastBoss || b.id !== R.lastBoss;
    })) : null;
    if (bi) R.lastBoss = bi.id;
    R.boss = bi;
    R.target = TARGETS[R.stage];
    R.score = 0;
    R.hands = bi && bi.hands ? bi.hands : 4;
    R.handsMax = R.hands;
    R.discards = 3;
    R.first = true;
    R.deck.forEach(function(c) {
      if (c.w.k === "v") c.w.f = "base";
      if (c.w.k === "n") c.w.pl = false;
    });
    R.deck.forEach(function(c) {
      if (c.scout) {
        c.scout = false;
        c.chips = baseChips(c);
      }
    });
    R.draw = shuffle(R.deck.slice());
    R.disc = [];
    R.hand = [];
    R.row = [];
    R.field = [];
    R.pts = 0;
    R.refill = 0;
    R.log = [];
    deal();
    R.yakuCnt = {};
    R.prev = null;
    R.stageF = [];
    R.questDone = false;
    R.quest = pickQuest(R.usedQ = R.usedQ || []);
    R.missions = pickMissions(R.usedM = R.usedM || [], 3);
    var g = guestCard();
    if (g) {
      var j = R.hand.findIndex(function(c) {
        return cat(c) === cat(g);
      });
      if (j < 0) j = 0;
      R.draw.unshift(R.hand[j]);
      R.hand[j] = g;
    }
    showGame();
  }
  function verbFits(v, n) {
    var ot = v.w.e.ot || [];
    if (!ot.length || ot.indexOf("any") >= 0) return true;
    var tags = [n.w.e.cat].concat(n.w.e.tg || []);
    return ot.some(function(t) {
      return tags.indexOf(t) >= 0;
    });
  }
  function cat(c) {
    return c.kind === "pron" || c.kind === "n" && /^(person|animal)$/.test(c.w.e.cat) ? "subj" : c.kind === "v" ? "verb" : c.kind === "n" ? "noun" : "mod";
  }
  var WANT = { subj: [2, 3], verb: [2, 3], noun: [2, 3], mod: [1, 2] };
  function deal() {
    fillTo(8);
  }
  function fillTo(N) {
    if (!R.draw.length) {
      R.draw = shuffle(R.disc);
      R.disc = [];
    }
    while (R.hand.length + R.row.filter(function(c) {
      return !c.tsu;
    }).length < N) {
      if (!R.draw.length) {
        if (!R.disc.length) break;
        R.draw = shuffle(R.disc);
        R.disc = [];
      }
      var cnt = { subj: 0, verb: 0, noun: 0, mod: 0 };
      R.hand.concat(R.row.filter(function(c) {
        return !c.tsu;
      })).forEach(function(c) {
        cnt[cat(c)]++;
      });
      var short = Object.keys(WANT).filter(function(k) {
        return cnt[k] < WANT[k][0];
      }), full = Object.keys(WANT).filter(function(k) {
        return cnt[k] >= WANT[k][1];
      });
      var idx = -1;
      if (short.length) {
        var k0 = pick(short);
        for (var i = R.draw.length - 1; i >= 0; i--) if (cat(R.draw[i]) === k0) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        for (var j = R.draw.length - 1; j >= 0; j--) if (full.indexOf(cat(R.draw[j])) < 0) {
          idx = j;
          break;
        }
      }
      if (idx < 0) idx = R.draw.length - 1;
      R.hand.push(R.draw.splice(idx, 1)[0]);
    }
    var vs = R.hand.filter(function(c) {
      return c.kind === "v" && c.w.e.fr !== "intr";
    }), ns = R.hand.filter(function(c) {
      return c.kind === "n";
    });
    if (vs.length && !vs.some(function(v) {
      return ns.some(function(n) {
        return verbFits(v, n);
      });
    })) {
      var i2 = R.draw.findIndex(function(c) {
        return c.kind === "n" && vs.some(function(v) {
          return verbFits(v, c);
        });
      }), j2 = R.hand.findIndex(function(c) {
        return cat(c) === "noun" || cat(c) === "mod";
      });
      if (i2 >= 0 && j2 >= 0) {
        var t = R.hand[j2];
        R.hand[j2] = R.draw[i2];
        R.draw[i2] = t;
      }
    }
  }
  var FIELD_MAX = 8;
  var Core = {
    // 手札から捨てる:場に表向きで並び、捨てたカードの点が「捨て札ポイント」になる。捨てた枚数ぶん補充待ち
    discard: function(cards) {
      cards.forEach(function(c) {
        var i = R.hand.indexOf(c);
        if (i >= 0) R.hand.splice(i, 1);
        R.field.unshift(c);
        R.pts += c.chips + c.bonus;
      });
      while (R.field.length > FIELD_MAX) R.disc.push(R.field.pop());
      R.discards--;
      R.refill += cards.length;
      R.log.push({ a: "discard", cards: cards.map(cardText) });
    },
    // 補充1枚:山から引く(タダ)
    drawOne: function() {
      if (R.refill <= 0) return null;
      var before = R.hand.length;
      fillTo(R.hand.length + R.row.filter(function(c2) {
        return !c2.tsu;
      }).length + 1);
      R.refill--;
      var c = R.hand[R.hand.length - 1];
      R.log.push({ a: "draw" });
      return R.hand.length > before ? c : null;
    },
    // 補充1枚:場から取る(そのカードの点ぶんポイントを払う)
    take: function(c) {
      var cost = c.chips + c.bonus, i = R.field.indexOf(c);
      if (R.refill <= 0 || i < 0 || R.pts < cost) return false;
      R.pts -= cost;
      R.field.splice(i, 1);
      R.hand.push(c);
      R.refill--;
      R.log.push({ a: "take", card: cardText(c), cost });
      return true;
    }
  };
  function notes(f, rep) {
    var o = [];
    if (f.colloc === "good") o.push('<span class="gd">\u2728 \u540D\u30B3\u30F3\u30D3(' + f.pair + ")</span>");
    if (f.storyP) o.push('<span class="gd">\u{1F517} \u524D\u306E\u6587\u3092\u4EE3\u540D\u8A5E\u3067\u53D7\u3051\u305F</span>');
    else if (f.story) o.push('<span class="gd">\u{1F517} \u524D\u306E\u6587\u3068\u3064\u306A\u304C\u3063\u305F</span>');
    if ((f.dupWords || []).length) o.push("\u540C\u3058\u7A2E\u985E\u306E\u53E5\u306E2\u3064\u76EE\u306F 0\u70B9");
    if ((f.halfWords || []).length) o.push("2\u3064\u76EE\u306E\u6587\u306F \u30AB\u30FC\u30C9\u70B9\u304C\u534A\u5206");
    if (rep) o.push("\u540C\u3058\u5F79 " + (rep + 1) + "\u56DE\u76EE \u2192 \u500D\u7387 " + (rep === 1 ? "\xBD" : "\xBC"));
    return o.join("<br>");
  }
  function applyStory(ev) {
    var st = storyOf(ev.nps, R && R.prev);
    ev.f.story = st === "def";
    ev.f.storyP = st === "pron";
  }
  function scoreOf(ev, ctx) {
    var f = ev.f;
    applyStory(ev);
    var b = baseScore(R.row, ev), y = b.y, steps = b.steps, chips = b.chips, mult = b.mult;
    ctx.y = y;
    R.jokers.forEach(function(j, ji) {
      j.fx(f, ctx).forEach(function(e) {
        if (e[0] === "c") chips += e[1];
        else if (e[0] === "m") mult += e[1];
        else mult = Math.round(mult * e[1] * 10) / 10;
        steps.push({ t: "joker", ji, txt: e[0] === "c" ? "+" + e[1] : e[0] === "m" ? "+" + e[1] + " \u500D" : "\xD7" + e[1], chips, mult });
      });
    });
    var rep = R.yakuCnt && R.yakuCnt[y.name] || 0;
    if (rep) {
      mult = Math.round(mult * (rep === 1 ? 0.5 : 0.25) * 10) / 10;
      steps.push({ t: "note", txt: "\u540C\u3058\u5F79 " + (rep + 1) + "\u56DE\u76EE \xD7" + (rep === 1 ? "\xBD" : "\xBC"), chips, mult });
    }
    if (LEVEL !== 1) {
      mult = Math.round(mult * LV_MULT[LEVEL] * 10) / 10;
      steps.push({ t: "note", txt: LV_JA[LEVEL] + " \xD7" + LV_MULT[LEVEL], chips, mult });
    }
    var bossOk = !R.boss || R.boss.ok(f);
    return { y, steps, chips, mult, total: bossOk ? Math.floor(chips * mult) : 0, bossFail: !bossOk, rep };
  }
  var root = null;
  function mount(r) {
    root = r;
    var lv = store.get("level");
    setLevel(lv == null ? 1 : lv);
    showTitle();
    document.addEventListener("pointerdown", unlock, { once: false, passive: true });
    return function() {
      document.removeEventListener("pointerdown", unlock);
    };
  }
  function screen(html) {
    root.innerHTML = "";
    var s = el("div", "scr", html);
    root.appendChild(s);
    return s;
  }
  var HOWBTN = '<button class="btn ghost" id="tut">\u2753 \u904A\u3073\u65B9</button>';
  function showTitle() {
    var b = store.get("best") || {};
    var s = screen('<div class="title"><div class="logo"><span>CHUNK</span><span>CARDS</span></div><div class="sub">\u82F1\u6587\u3067\u300C\u5F79\u300D\u3092\u3064\u304F\u308B \u30AB\u30FC\u30C9\u30B2\u30FC\u30E0</div><div class="lvsel" id="lvsel"></div><div class="lvdesc" id="lvd"></div><div class="fan"><div class="card n big" style="--r:-12deg">The</div><div class="card v big" style="--r:-4deg">dog</div><div class="card v big" style="--r:4deg">ate</div><div class="card m big" style="--r:12deg">quickly</div></div>' + (store.get("howSeen") ? "" : HOWBTN) + '<button class="btn go" id="go">\u3072\u3068\u308A\u3067\u7DF4\u7FD2</button><button class="btn vs" id="vs">CPU\u3068\u5BFE\u6226</button><button class="btn ghost" id="how">\u304F\u308F\u3057\u3044\u30EB\u30FC\u30EB</button><button class="btn ghost small" id="cb">\u{1F4D6} \u540D\u30B3\u30F3\u30D3\u56F3\u9451</button>' + (store.get("howSeen") ? HOWBTN : "") + (b.stage ? '<div class="rec">\u6700\u9AD8:\u30B9\u30C6\u30FC\u30B8 ' + b.stage + " \u30FB " + (b.total || 0).toLocaleString() + "\u70B9" + (b.text ? "<br><i>" + b.text + "</i>" : "") + "</div>" : "") + "</div>");
    var LVD = ["a / the\u30FB\u524D\u7F6E\u8A5E\u30FBbe\u30FB\u52D5\u8A5E\u306E\u5F62\u3092\u5FD8\u308C\u3066\u3082\u3001\u81EA\u52D5\u3067\u88DC\u3063\u3066\u6587\u306B\u3057\u3066\u304F\u308C\u308B\u3002\u51FA\u3057\u305F\u3042\u3068\u306B1\u8A9E\u305A\u3064\u89E3\u8AAC(\u70B9 \xD71)", "a / the\u30FB\u524D\u7F6E\u8A5E\u30FB\u52D5\u8A5E\u306E\u5F62\u3082\u81EA\u5206\u3067\u9078\u3076(\u70B9 \xD71)", "\u3080\u305A\u304B\u3057\u3044\u8A9E\u304C\u5C71\u672D\u306B\u5165\u308A\u3001\u5019\u88DC\u306E\u5149\u3082\u306A\u3057(\u70B9 \xD71.3)"];
    function lvUI() {
      var box = $("#lvsel", s);
      box.innerHTML = "";
      LV_JA.forEach(function(n, i) {
        var b2 = el("button", "lvb" + (i === LEVEL ? " on" : ""), n);
        b2.onclick = function() {
          setLevel(i);
          store.set("level", i);
          SFX.tap();
          lvUI();
        };
        box.appendChild(b2);
      });
      $("#lvd", s).textContent = LVD[LEVEL];
    }
    lvUI();
    $("#go", s).onclick = function() {
      unlock();
      SFX.put();
      newRun();
    };
    $("#how", s).onclick = function() {
      unlock();
      showHow();
    };
    $("#tut", s).onclick = function() {
      unlock();
      SFX.put();
      store.set("howSeen", 1);
      G_.tutOn = true;
      newRun();
    };
    $("#cb", s).onclick = function() {
      var l = store.get("combos") || [], o = el("div", "modal", '<div class="box"><h2>\u{1F4D6} \u540D\u30B3\u30F3\u30D3\u56F3\u9451(' + l.length + ')</h2><p style="font-size:12px;opacity:.8;margin:0">\u52D5\u8A5E\u3068\u3074\u3063\u305F\u308A\u306E\u76EE\u7684\u8A9E\u306E\u7D44\u307F\u5408\u308F\u305B\u3002\u6587\u3067\u4F7F\u3046\u3068\u500D\u7387+2</p><div class="combos">' + (l.length ? l.map(function(x) {
        return "<span>" + x + "</span>";
      }).join("") : "<i>\u307E\u3060\u306A\u3044</i>") + '</div><button class="btn go" id="ok">\u3068\u3058\u308B</button></div>');
      root.appendChild(o);
      $("#ok", o).onclick = function() {
        o.remove();
      };
    };
    $("#vs", s).onclick = function() {
      unlock();
      SFX.put();
      VSref && VSref.start();
    };
  }
  function showHow() {
    var o = el("div", "modal", '<div class="box"><h2>\u3042\u305D\u3073\u304B\u305F</h2><ol><li>\u624B\u672D\u306E\u30AB\u30FC\u30C9\u3092<b>\u30BF\u30C3\u30D7</b>\u3059\u308B\u3068\u300C\u6587\u306E\u53F0\u300D\u306B\u4E26\u3076\u3002<b>\u3064\u306A\u304E\u306E\u68DA</b>(a / the / in / can \u306A\u3069)\u306F\u4F55\u56DE\u3067\u3082\u4F7F\u3048\u308B\u3002</li><li>\u624B\u672D\u306F<b>\u30BF\u30C3\u30D7</b>\u304B<b>\u4E0A\u3078\u30D5\u30EA\u30C3\u30AF</b>\u3067\u53F0\u306E\u6700\u5F8C\u3078\u3002<b>\u30C9\u30E9\u30C3\u30B0</b>\u3059\u308B\u3068\u91D1\u306E\u7DDA\u306E\u4F4D\u7F6E\u306B1\u679A\u305A\u3064\u5DEE\u3057\u8FBC\u3081\u308B\u3002\u53F0\u306E\u30AB\u30FC\u30C9\u306F<b>\u30C9\u30E9\u30C3\u30B0\u3067\u4E26\u3079\u304B\u3048</b>\u3001<b>\u4E0B\u3078\u30D5\u30EA\u30C3\u30AF</b>\u304B\xD7\u3067\u624B\u672D\u3078\u623B\u3059\u3002<b>\u30BF\u30C3\u30D7\u3067\u5F62\u304C\u5909\u308F\u308B</b>(eat \u2192 ate \u2192 eaten \u2192 eating\u3001\u5358\u6570\u21C4\u8907\u6570)\u3002be\u30FBhave \u306F\u300C\u4ECA \u2192 \u904E\u53BB \u2192 \u5426\u5B9A \u2192 \u904E\u53BB\u306E\u5426\u5B9A\u300D(is \u2192 was \u2192 isn\u2019t \u2192 wasn\u2019t)\u3001do \u306F do \u2192 did \u2192 don\u2019t \u2192 didn\u2019t\u3001can \u306F can \u2192 could \u2192 can\u2019t \u2192 couldn\u2019t(will\u30FBmay \u3082\u540C\u3058\u3002must\u30FBshould \u306F\u5426\u5B9A\u3068\u5207\u308A\u304B\u3048)\u3001want to \u2192 wanted to\u3002</li><li>\u6B63\u3057\u3044\u82F1\u6587\u306B\u306A\u308B\u3068<b>\u5F79</b>(S+V+O+\u5834\u6240 \u306A\u3069)\u3068\u70B9\u304C\u51FA\u308B\u3002\u300C<b>\u51FA\u3059!</b>\u300D\u3067\u70B9\u304C\u5165\u308B\u3002\u9593\u9055\u3063\u3066\u3044\u308B\u3068\u7406\u7531\u304C\u51FA\u3066\u3001\u51FA\u305B\u306A\u3044\u3002</li><li>\u70B9 = <b>\u30C1\u30C3\u30D7 \xD7 \u500D\u7387</b>\u3002\u9577\u3044\u6587\u30FB\u3080\u305A\u304B\u3057\u3044\u5F62(\u904E\u53BB\u30FB\u5B8C\u4E86\u30FB\u9032\u884C\u30FB\u7BC0\u2026)\u307B\u3069\u9AD8\u3044\u3002</li><li>\u300C\u51FA\u3059\u300D\u306E\u56DE\u6570\u306E\u3046\u3061\u306B<b>\u76EE\u6A19\u70B9</b>\u306B\u5C4A\u3051\u3070\u30AF\u30EA\u30A2\u3002\u304A\u5E97\u3067<b>\u30B8\u30E7\u30FC\u30AB\u30FC</b>(\u70B9\u304C\u5316\u3051\u308B\u52B9\u679C)\u3084<b>\u6587\u578B\u306E\u672C</b>\u3092\u8CB7\u3063\u3066\u5F37\u304F\u306A\u308D\u3046\u30023\u30FB6\u30FB8\u30B9\u30C6\u30FC\u30B8\u306F<b>\u30DC\u30B9</b>(\u6761\u4EF6\u3064\u304D)\u3002</li><li>\u300C<b>\u6368\u3066\u308B</b>\u300D\u2192 \u624B\u672D\u304B\u3089\u6368\u3066\u308B\u30AB\u30FC\u30C9\u3092\u3048\u3089\u3076\u3002\u6368\u3066\u305F\u30AB\u30FC\u30C9\u306F<b>\u5834</b>\u306B\u8868\u5411\u304D\u3067\u4E26\u3073\u3001\u305D\u306E\u70B9\u6570\u304C<b>\u6368\u3066\u672Dpt</b>\u306B\u306A\u308B\u3002\u88DC\u5145\u306F1\u679A\u305A\u3064\u300C\u5C71\u304B\u3089\u5F15\u304F(\u30BF\u30C0)\u300D\u304B\u300C\u5834\u304B\u3089\u53D6\u308B(\u70B9\u6570\u3076\u3093\u306Ept)\u300D\u3092\u3048\u3089\u3079\u308B\u3002\u5F37\u3044\u30AB\u30FC\u30C9\u3092\u308F\u3056\u3068\u6368\u3066\u3066\u3001\u3042\u3068\u3067\u62FE\u3044\u76F4\u3059\u306E\u3082\u30A2\u30EA\u3002</li><li><b>\u30EC\u30D9\u30EB</b>(\u30BF\u30A4\u30C8\u30EB\u3067\u9078\u3076):\u521D\u7D1A\u306F\u51A0\u8A5E\u30FB\u524D\u7F6E\u8A5E(\u300C\u3064\u306A\u304E\u300D\u30AB\u30FC\u30C9)\u30FB\u6642\u5236\u304C\u304A\u307E\u304B\u305B\u3002\u4E0A\u7D1A\u306F\u3080\u305A\u304B\u3057\u3044\u8A9E\u304C\u5897\u3048\u3001\u70B9\u3082\u9AD8\u3044\u3002</li><li>\u53F0\u306E\u6587\u304C\u3046\u307E\u304F\u3044\u304B\u306A\u3044\u3068\u304D\u306F\u3001\u6B62\u307E\u3063\u305F\u30AB\u30FC\u30C9\u304C<b>\u8D64\u304F</b>\u5149\u308A\u3001\u6B21\u306B\u7F6E\u3051\u308B\u30AB\u30FC\u30C9\u306B<b>\u91D1\u306E\u70B9</b>\u304C\u4ED8\u304F(\u521D\u7D1A\u30FB\u4E2D\u7D1A)\u3002\u521D\u7D1A\u30FB\u4E2D\u7D1A\u306F\u3001\u53F0\u306E\u4E0B\u306B\u300C\u6B21\u306B\u7F6E\u304F\u3082\u306E\u300D(\u4E3B\u8A9E \u2192 \u52D5\u8A5E \u2192 \u76EE\u7684\u8A9E \u2192 \u5834\u6240 \u2192 \u6642)\u304C\u3044\u3064\u3082\u51FA\u308B\u3002\u7B54\u3048\u306F\u51FA\u306A\u3044\u306E\u3067\u3001\u4E26\u3079\u308B\u306E\u306F\u81EA\u5206\u3067\u3002\u4E0A\u7D1A\u306F\u{1F4A1}\u30D2\u30F3\u30C8(\u{1F4B0}1)\u3067\u3001\u4F7F\u3048\u308B\u30AB\u30FC\u30C9\u304C\u5149\u308B\u3060\u3051\u3002</li></ol><button class="btn go" id="ok">\u308F\u304B\u3063\u305F</button></div>');
    root.appendChild(o);
    $("#ok", o).onclick = function() {
      o.remove();
    };
  }
  var G_ = {};
  function showGame() {
    var s = screen(
      '<div class="top"><div class="stg' + (R.boss ? " boss" : "") + '">' + (R.boss ? "\u{1F479} \u30DC\u30B9 " : "\u30B9\u30C6\u30FC\u30B8 ") + (R.stage + 1) + '<small>/8</small></div><div class="goal"><div class="gl">\u76EE\u6A19 <b id="tgt">' + R.target.toLocaleString() + '</b></div><div class="bar"><i id="barf"></i></div><div class="gl">\u3044\u307E <b id="sc">0</b></div></div><div class="res"><span>\u51FA\u3059<b id="hd"></b></span><span>\u6368\u3066\u308B<b id="ds"></b></span><span class="money">\u{1F4B0}<b id="mn"></b></span></div></div><div class="jokers" id="jk"></div>' + (R.boss ? '<div class="bossbar">\u{1F479} ' + R.boss.text + "</div>" : "") + '<div class="qbar" id="qb"></div><div class="board"><div class="row" id="row"><div class="ph">\u624B\u672D\u3092\u30BF\u30C3\u30D7\u3057\u3066 \u3053\u3053\u306B\u4E26\u3079\u308B</div></div><div class="pv"><div class="sent" id="sent"></div><div class="jt" id="jt"></div><div class="yk" id="yk"></div><div class="cm"><span class="chips" id="ch">0</span><span class="x">\xD7</span><span class="mult" id="ml">0</span></div><div class="msg" id="msg"></div><div class="hp" id="hp"></div></div><button class="hintb" id="hb">\u{1F4A1} \u30D2\u30F3\u30C8</button></div><div class="field"><div class="flbl"><span>\u5834(\u6368\u3066\u305F\u30AB\u30FC\u30C9)</span><span class="pts">\u6368\u3066\u672Dpt <b id="pt">0</b></span></div><div class="frow" id="fd"></div><div class="fhint" id="fh"></div></div><div class="tsu"><div class="tabs" id="tabs"></div><div class="tw" id="tw"></div></div><div class="hand" id="hand"></div><div class="btns" id="bt"></div>'
    );
    ["jk", "row", "sent", "yk", "ch", "ml", "msg", "tabs", "tw", "hand", "bt", "hd", "ds", "mn", "sc", "barf", "fd", "fh", "pt", "qb", "jt", "hp", "hb"].forEach(function(k) {
      G_[k] = $("#" + k, s);
    });
    G_.hb.onclick = doHint;
    G_.tab = G_.tab == null ? 0 : G_.tab;
    G_.vs = null;
    G_.mode = "play";
    G_.mark = [];
    renderAll();
    if (G_.tutOn) {
      G_.tutOn = false;
      setTimeout(function() {
        if (G_.row && G_.row.isConnected) runCoach(TUT);
      }, 500);
    }
  }
  var BE = /^(am|is|are|was|were|be|been|being)$/;
  var HV = /^(have|has|had|having)$/;
  function first(w) {
    return String(w).toLowerCase().split(" ")[0];
  }
  function plaus(c, tok) {
    var k = c.w.k;
    if (k === "prep" && c.label) return /^(in|on|at)$/.test(tok);
    if (k === "be") return BE.test(tok);
    if (k === "modal") return tok === c.w.v;
    if (k === "do") return /^(do|does|did)$/.test(tok);
    if (k === "hv") return HV.test(tok);
    if (k === "det") return /^(a|an|the|this|that|these|those)$/.test(tok);
    if (k === "pr" && !c.label && G.PRON[c.w.v]) {
      var P = G.PRON[c.w.v];
      return tok === first(P.sub) || tok === first(P.obj);
    }
    if (k === "sm") return /^be/.test(c.w.v) ? BE.test(tok) : /^have/.test(c.w.v) ? HV.test(tok) : tok.indexOf(first(c.w.v).slice(0, 3)) === 0;
    if (k === "v") {
      var fs = ["base", "past", "pp", "ing"].map(function(f) {
        return first(G.wordText({ k: "v", e: c.w.e, f }, CFG));
      }), b0 = fs[0];
      return fs.indexOf(tok) >= 0 || tok === b0 + "s" || tok === b0 + "es" || tok === b0.replace(/y$/, "ies") || tok === "has" && b0 === "have";
    }
    var b = first(cardText(c));
    return tok === b || b.length > 2 && tok.indexOf(b.slice(0, b.length - 1)) === 0 || k === "n" && first(G.wordText({ k: "n", e: c.w.e, pl: true }, CFG)) === tok;
  }
  function surfaceOf(row, ev) {
    if (!ev || ev.state !== "ok") return null;
    var toks = [], orig = {}, p = 0, out = [], seq = [];
    ev.text.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean).forEach(function(w) {
      var m = /^(\w+)n't$/i.exec(w);
      if (m) {
        var b = { ca: "can", wo: "will", sha: "shall" }[m[1].toLowerCase()] || m[1];
        orig[toks.length] = w;
        toks.push(b, "not");
      } else toks.push(w);
    });
    for (var i = 0; i < row.length; i++) {
      var c = row[i], n = cardText(c).split(" ").length;
      var neg2 = c.w.neg && /^(be|hv|modal|do)$/.test(c.w.k);
      if (neg2) {
        if (!/^not$/i.test(toks[p + 1] || "") || (c.w.k === "do" ? !/^(do|does|did)$/i.test(toks[p] || "") : !plaus(c, (toks[p] || "").toLowerCase()))) return null;
        n = 2;
      } else if (c.w.k === "not" && /^(do|does|did)$/i.test(toks[p] || "") && /^not$/i.test(toks[p + 1] || "")) n = 2;
      else if (c.w.k === "not") {
        if (!/^not$/i.test(toks[p] || "")) return null;
      } else if (!plaus(c, (toks[p] || "").toLowerCase())) {
        var sk = 0;
        while (LEVEL === 0 && sk < 3 && toks[p] && !plaus(c, toks[p].toLowerCase())) {
          seq.push({ t: toks[p], auto: true });
          p++;
          sk++;
        }
        if (!plaus(c, (toks[p] || "").toLowerCase())) return null;
      }
      var t = orig[p] && n === 2 && (c.w.k === "not" || neg2) ? orig[p] : toks.slice(p, p + n).join(" ");
      p += n;
      if (i === 0 && t !== "I" && !/^[A-Z]/.test(cardText(c))) t = t.charAt(0).toLowerCase() + t.slice(1);
      out.push(t);
      seq.push({ t, card: i });
    }
    while (LEVEL === 0 && p < toks.length) {
      seq.push({ t: toks[p], auto: true });
      p++;
    }
    if (p !== toks.length) return null;
    out.seq = seq;
    return out;
  }
  function guessForm(c, prev) {
    var k = c.w.k;
    if (k === "pr" && !c.label && prev && (prev.w.k === "v" || prev.w.k === "prep") && G.PRON[c.w.v]) return G.PRON[c.w.v].obj;
    if ((k === "be" || k === "hv") && prev && (prev.w.k === "pr" || prev.w.k === "n")) {
      var v = prev.w.k === "pr" ? prev.w.v : prev.w.pl ? "they" : "he", past = c.w.v === "past";
      if (k === "be") return past ? v === "i" || v === "he" || v === "she" || v === "it" ? "was" : "were" : v === "i" ? "am" : /^(he|she|it)$/.test(v) ? "is" : "are";
      return past ? "had" : /^(he|she|it)$/.test(v) ? "has" : "have";
    }
    return null;
  }
  function rowText(row) {
    return row.map(function(c, i) {
      return guessForm(c, row[i - 1]) || cardText(c);
    }).join(" ");
  }
  function formTag(c, tok, row, i) {
    if (!tok || c.w.k !== "v") return null;
    var t = first(tok), e = c.w.e, b = first(vtext(e, "base")), pa = first(vtext(e, "past")), pp = first(vtext(e, "pp")), ing = first(vtext(e, "ing")), pv = prevCore(row.map(function(x) {
      return x.w;
    }), i);
    if (t === ing) return "-ing\u5F62";
    if (t === pp && pv && (pv.k === "be" || pv.k === "hv")) return "\u904E\u53BB\u5206\u8A5E";
    if (t === pa) return "\u904E\u53BB\u5F62";
    if (t === pp) return "\u904E\u53BB\u5206\u8A5E";
    if (t === b) return pv && (pv.k === "modal" || pv.k === "sm" || pv.k === "not") ? "\u539F\u5F62" : "\u73FE\u5728\u5F62";
    if (t === b + "s" || t === b + "es" || t === b.replace(/y$/, "ies") || t === "has") return "\u73FE\u5728(\u4E09\u5358\u73FE)";
    return null;
  }
  function cardEl(c, where, i, disp, ftag) {
    var e = el("div", "card " + colorOf(c) + (c.tsu ? " tsu" : "") + (lvOf(c) >= 2 && !c.tsu ? " rare" : "") + (c.guest ? " guest" : "") + (c.w.k === "pr" && c.w.v === "it" && !c.tsu ? " wild" : ""));
    var t = disp || cardText(c);
    e.dataset.pos = { pron: "pron.", n: "n.", v: "v.", adj: "adj.", adv: "adv." }[c.kind] || "";
    e.innerHTML = '<span class="w"' + (t.length > 5 ? ' style="font-size:' + Math.max(8.5, (where === "hand" ? 14.5 : where === "field" ? 10.5 : 13.5) - (t.length - 5) * (where === "field" ? 0.8 : 1.05)) + 'px"' : "") + ">" + t + "</span><i>" + (c.chips + c.bonus) + "</i>" + (c.bonus ? "<u>+" + c.bonus + "</u>" : "") + (c.w.k === "v" && where === "row" ? "<em>" + (ftag || FORM_JA[c.w.f || "base"]) + "</em>" : "") + (where === "row" ? '<b class="rm">\xD7</b>' : "");
    e.dataset.i = i;
    return e;
  }
  function renderAll() {
    if (G_.vs) return G_.vs.renderAll();
    renderTop();
    renderJokers();
    renderRow();
    renderTsu();
    renderHand();
    renderField();
    renderBtns();
  }
  function renderTop() {
    G_.hd.textContent = R.hands;
    G_.ds.textContent = R.discards;
    G_.mn.textContent = R.money;
    G_.sc.textContent = R.score.toLocaleString();
    if (G_.pt) G_.pt.textContent = R.pts;
    G_.barf.style.width = Math.min(100, R.score / R.target * 100) + "%";
    if (G_.qb && R.quest) G_.qb.innerHTML = missionBar(R.missions) + questBar(R.quest, R.stageF);
  }
  function missionBar(ms) {
    return '<div class="mbar">\u{1F3AF} \u304A\u984C:' + ms.map(function(x) {
      return '<span class="mc t' + x.m.tier + (x.done ? " hit" : "") + '">' + (x.done ? "\u2714 " : "") + x.m.label + " <b>\u{1F4B0}" + (x.m.tier + 1) + "</b></span>";
    }).join("") + "</div>";
  }
  function renderJokers() {
    G_.jk.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var j = R.jokers[i];
      var e = el("div", "joker" + (j ? "" : " empty"), j ? "<b>" + j.name + "</b><span>" + j.desc + "</span>" : "<span>\u7A7A\u304D</span>");
      e.dataset.i = i;
      G_.jk.appendChild(e);
    }
  }
  function renderHand() {
    G_.hand.innerHTML = "";
    R.hand.forEach(function(c, i) {
      var e = cardEl(c, "hand", i);
      if (G_.mode === "disc" && G_.mark.indexOf(c) >= 0) e.classList.add("marked");
      if (G_.nxH && G_.nxH[c.id]) e.classList.add("nx");
      if (G_.hintIds && G_.hintIds[c.id]) e.classList.add("hintc");
      e.onpointerdown = function(ev) {
        cardPress(ev, c, e, "hand");
      };
      G_.hand.appendChild(e);
    });
  }
  function renderTsu() {
    var TS = curTSU();
    if (G_.tab >= TS.length) G_.tab = 0;
    G_.tabs.innerHTML = "";
    TS.forEach(function(t, i) {
      var b = el("button", "tab" + (i === G_.tab ? " on" : ""), t[0]);
      b.onclick = function() {
        G_.tab = i;
        SFX.tap();
        renderTsu();
      };
      G_.tabs.appendChild(b);
    });
    G_.tw.innerHTML = "";
    TS[G_.tab][1].forEach(function(spec) {
      var c = tsuCard(spec), e = cardEl(c, "tsu", 0);
      if (G_.nxT && G_.nxT[spec.join("|")]) e.classList.add("nx");
      e.dataset.spec = spec.join("|");
      e.onpointerdown = function(ev) {
        cardPress(ev, c, e, "tsu", spec);
      };
      G_.tw.appendChild(e);
    });
  }
  function renderRow() {
    G_.row.innerHTML = "";
    if (!R.row.length) G_.row.appendChild(el("div", "ph", "\u624B\u672D\u3092\u30BF\u30C3\u30D7\u3057\u3066 \u3053\u3053\u306B\u4E26\u3079\u308B"));
    var ev0 = evaluate(R.row), sf = surfaceOf(R.row, ev0), errI = ev0.state === "bad" && ev0.atCard ? R.row.indexOf(ev0.atCard) : -1;
    calcNext();
    R.row.forEach(function(c, i) {
      var e = cardEl(c, "row", i, sf ? sf[i] : guessForm(c, R.row[i - 1]), sf ? formTag(c, sf[i], R.row, i) : null);
      G_.row.appendChild(e);
      if (i === errI) e.classList.add("errc");
      if (G_.hintIds && G_.hintIds[c.id] && !c.tsu) e.classList.add("hintc");
      $(".rm", e).onpointerdown = function(ev) {
        ev.stopPropagation();
      };
      $(".rm", e).onclick = function(ev) {
        ev.stopPropagation();
        if (G_.busy) return;
        SFX.tap();
        R.row.splice(R.row.indexOf(c), 1);
        if (!c.tsu) R.hand.push(c);
        renderRow();
        renderHand();
      };
      e.onpointerdown = function(ev) {
        cardPress(ev, c, e, "row");
      };
    });
    updatePreview();
    if (G_.bt) renderBtns();
    applyNext();
    armIdle();
  }
  function calcNext() {
    G_.nxH = {};
    G_.nxT = {};
    if (LEVEL >= 2 || !R.row.length || G_.mode !== "play" || G_.busy) return;
    var cur0 = evaluate(R.row, true);
    if (cur0.state === "ok") return;
    R.hand.forEach(function(c) {
      if (evaluate(R.row.concat([c]), true).state !== "bad") G_.nxH[c.id] = 1;
    });
    var TS = curTSU();
    (TS[G_.tab] || TS[0])[1].forEach(function(spec) {
      if (evaluate(R.row.concat([tsuCard(spec)]), true).state !== "bad") G_.nxT[spec.join("|")] = 1;
    });
  }
  function applyNext() {
    if (G_.hand) Array.prototype.forEach.call(G_.hand.children, function(e) {
      var c = R.hand[+e.dataset.i];
      e.classList.toggle("nx", !!(c && G_.nxH && G_.nxH[c.id]));
      e.classList.toggle("hintc", !!(c && G_.hintIds && G_.hintIds[c.id]));
    });
    if (G_.tw) Array.prototype.forEach.call(G_.tw.children, function(e) {
      e.classList.toggle("nx", !!(G_.nxT && G_.nxT[e.dataset.spec]));
    });
  }
  var HINT_MULT = [1, 1, 1, 1];
  var HINT_COST = [0, 1, 0, 0];
  function hintCostTxt(n) {
    return G_.vs ? "\u6368\u3066\u672Dpt " + HINT_COST[n] * 5 : "\u{1F4B0}" + HINT_COST[n];
  }
  function payHint(n) {
    var c = HINT_COST[n];
    if (!c) return true;
    if (G_.vs) {
      if (R.pts < c * 5) return false;
      R.pts -= c * 5;
      return true;
    }
    if (R.money < c) return false;
    R.money -= c;
    return true;
  }
  function roleOf(row, i) {
    var c = row[i], k = c.w.k, seenV = row.slice(0, i).some(function(x) {
      return x.w.k === "v" || x.w.k === "be";
    });
    if (k === "pr" && !c.tsu || k === "n") {
      var prv = row.slice(0, i).filter(function(x) {
        return x.w.k !== "det" && x.w.k !== "adj";
      }).pop();
      if (prv && prv.w.k === "prep") return k === "n" && c.w.e.cat === "time" ? "\u6642" : "\u5834\u6240\u306A\u3069";
      return seenV ? "\u76EE\u7684\u8A9E" : "\u4E3B\u8A9E";
    }
    if (k === "modal" || k === "sm") return "\u52A9\u52D5\u8A5E";
    if (k === "be") return "be";
    if (k === "hv") return "have";
    if (k === "not") return "\u5426\u5B9A";
    if (k === "adj") return "\u5F62\u5BB9\u8A5E:\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u304F";
    if (k === "det") return "\u51A0\u8A5E";
    if (k === "v") return "\u52D5\u8A5E";
    if (k === "adv") return c.w.e.k === "time" ? "\u6642" : c.w.e.k === "place" ? "\u5834\u6240" : "\u69D8\u5B50";
    return null;
  }
  function diagnose(cards) {
    var subj = cards.some(function(c) {
      return c.kind === "pron" || c.kind === "n" && /^(person|animal)$/.test(c.w.e.cat);
    }), verb = cards.some(function(c) {
      return c.kind === "v";
    });
    return !subj ? "\u4E3B\u8A9E\u306B\u306A\u308C\u308B\u30AB\u30FC\u30C9(I / he / \u4EBA\u30FB\u52D5\u7269\u306E\u540D\u8A5E)\u304C\u306A\u3044\u3002\u6368\u3066\u3066\u4EA4\u63DB\u3057\u3088\u3046" : !verb ? "\u52D5\u8A5E\u306E\u30AB\u30FC\u30C9\u304C\u306A\u3044\u3002\u6368\u3066\u3066\u4EA4\u63DB\u3057\u3088\u3046" : "\u3053\u306E\u624B\u672D\u3060\u3068\u6587\u304C\u4F5C\u308A\u306B\u304F\u3044\u3002\u6368\u3066\u3066\u4EA4\u63DB\u3057\u3088\u3046";
  }
  function doHint() {
    if (G_.busy || G_.mode !== "play") {
      flash("\u3044\u307E\u306F\u30D2\u30F3\u30C8\u3092\u4F7F\u3048\u306A\u3044");
      return;
    }
    if (LEVEL < 2) {
      flash("\u6B21\u306B\u7F6E\u3051\u308B\u30AB\u30FC\u30C9\u306B\u306F\u91D1\u306E\u70B9\u304C\u4ED8\u3044\u3066\u3044\u308B");
      return;
    }
    var cards = R.hand.concat(R.row.filter(function(c) {
      return !c.tsu;
    }));
    var best2 = VSref && VSref._search ? VSref._search(cards, null, 1, 220) : null;
    if (!best2) {
      G_.hp.innerHTML = '<div class="hrow">\u{1F4A1} ' + diagnose(cards) + "</div>";
      SFX.bad();
      return;
    }
    if (R.hintLv) return;
    if (!payHint(1)) {
      flash("\u30D2\u30F3\u30C8\u306B\u306F " + hintCostTxt(1) + " \u304C\u5FC5\u8981");
      SFX.bad();
      return;
    }
    R.hintLv = 1;
    G_.hintBest = best2;
    SFX.joker();
    if (!G_.vs && G_.mn) renderTop();
    renderRow();
    renderHand();
  }
  function stepGuide(row, ev) {
    var k = function(c) {
      return c.w.k;
    }, cs = row.map(k), iV = cs.findIndex(function(x) {
      return x === "v" || x === "be";
    });
    var subj = row.slice(0, iV < 0 ? row.length : iV).some(function(c) {
      return c.w.k === "pr" && !c.tsu || c.w.k === "n";
    });
    var after = iV < 0 ? [] : row.slice(iV + 1), obj = after.some(function(c) {
      return (c.w.k === "n" || c.w.k === "pr" || c.w.k === "adj") && !(c.tsu && c.w.k !== "pr");
    });
    var vC = row.filter(function(c) {
      return c.w.k === "v";
    })[0], noObj = vC && ((c0 = prevCore(row.map(function(z) {
      return z.w;
    }), row.indexOf(vC))) && c0.k === "be" && /pp|past/.test(vC.w.f) || vC.w.e.fr === "intr");
    var c0;
    if (noObj && ev.state === "ok") obj = true;
    var place = row.some(function(c, i) {
      return c.w.k === "prep" || c.w.k === "adv" && c.w.e.k === "place" || LEVEL === 0 && iV >= 0 && i > iV && c.w.k === "n" && c.w.e.cat === "place";
    }), time = row.some(function(c) {
      return c.w.k === "adv" && c.w.e.k === "time" || c.w.k === "n" && c.w.e.cat === "time";
    });
    var steps = [["\u4E3B\u8A9E", subj], ["\u52D5\u8A5E", iV >= 0], ["\u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E", obj], ["\u5834\u6240", place], ["\u6642", time]], nextI = steps.findIndex(function(x) {
      return !x[1];
    });
    var line = steps.map(function(x, i) {
      return x[1] ? '<span class="sd1">\u2714 ' + x[0] + "</span>" : i === nextI ? '<b class="sd2">' + x[0] + "</b>" : '<span class="sd0">' + x[0] + "</span>";
    }).join(" \u2192 ");
    var tip = !row.length ? "\u4E3B\u8A9E\u304B\u3089\u7F6E\u3053\u3046(I / he / a\u30FBthe + \u4EBA\u3084\u52D5\u7269\u306E\u540D\u8A5E)" : !subj ? "\u4E3B\u8A9E\u3092\u4F5C\u308D\u3046(\u540D\u8A5E\u307E\u3067\u7F6E\u304F)" : iV < 0 ? "\u6B21\u306F\u52D5\u8A5E(v.)\u3002can \u3084 be \u3092\u306F\u3055\u3093\u3067\u3082OK" : ev.state === "ok" ? "\u6587\u306B\u306A\u3063\u305F! \u306E\u3070\u3059\u306A\u3089 \u5834\u6240(\u524D\u7F6E\u8A5E + \u540D\u8A5E)\u30FB\u6642\u30FB\u69D8\u5B50\u3092\u8DB3\u305D\u3046" : ev.state === "wait" ? "\u3082\u3046\u5C11\u3057:" + (ev.msg || "\u7D9A\u304D\u3092\u7F6E\u3053\u3046") : "\u307E\u3061\u304C\u3044\u3092\u76F4\u305D\u3046(\u8D64\u3044\u30AB\u30FC\u30C9)";
    return '<div class="hrow">\u{1F4A1} ' + tip + '</div><div class="hrow guide">' + line + "</div>";
  }
  function hintPanel() {
    if (!G_.hp) return;
    G_.hintIds = {};
    if (G_.mode !== "play") {
      G_.hp.innerHTML = "";
      return;
    }
    if (LEVEL < 2) {
      G_.hp.innerHTML = stepGuide(R.row, cur || { state: "empty" });
      if (G_.hb) G_.hb.style.display = "none";
      return;
    }
    if (G_.hb) {
      G_.hb.style.display = "";
      G_.hb.textContent = R.hintLv ? "\u{1F4A1}" : "\u{1F4A1} \u30D2\u30F3\u30C8(" + hintCostTxt(1) + ")";
    }
    var b = G_.hintBest;
    if (!R.hintLv || !b) {
      G_.hp.innerHTML = "";
      return;
    }
    b.row.forEach(function(c) {
      if (!c.tsu) G_.hintIds[c.id] = 1;
    });
    G_.hp.innerHTML = '<div class="hrow">\u{1F4A1} \u5149\u3063\u3066\u3044\u308B\u30AB\u30FC\u30C9\u3067\u6587\u304C\u4F5C\u308C\u308B\u3002\u4E26\u3079\u65B9\u306F\u81EA\u5206\u3067\u8003\u3048\u3088\u3046</div>';
  }
  var ROLE = {
    subj: { n: "\u4E3B\u8A9E", m: "\u3060\u308C\u304C\u30FB\u4F55\u304C", c: "r1", d: "\u6587\u306E\u4E3B\u4EBA\u516C\u3002\u82F1\u8A9E\u306E\u6587\u306F\u3001\u304B\u306A\u3089\u305A\u4E3B\u8A9E\u304B\u3089\u59CB\u307E\u308B\u3002\u4E3B\u8A9E\u306B\u306A\u308C\u308B\u306E\u306F\u300C\u540D\u8A5E\u306E\u304B\u305F\u307E\u308A\u300D(the dog \u306A\u3069)\u304B\u300C\u4EE3\u540D\u8A5E\u300D(she \u306A\u3069)\u3002" },
    verb: { n: "\u52D5\u8A5E", m: "\u3069\u3046\u3059\u308B", c: "r2", d: "\u52D5\u304D\u3084\u72B6\u614B\u3092\u8868\u3059\u304B\u305F\u307E\u308A\u3002\u82F1\u8A9E\u3067\u306F\u4E3B\u8A9E\u306E\u3059\u3050\u3046\u3057\u308D\u306B\u7F6E\u304F\u3002\u52D5\u8A5E\u306E\u5F62\u306F\u300C\u3044\u3064\u306E\u3053\u3068\u304B(\u4ECA\u30FB\u904E\u53BB)\u300D\u3068\u300C\u4E3B\u8A9E\u304C\u3060\u308C\u304B\u300D\u3067\u5909\u308F\u308B\u3002" },
    be: { n: "\u52D5\u8A5E(be\u52D5\u8A5E)", m: "\u301C\u3067\u3042\u308B", c: "r2", d: "be\u52D5\u8A5E\u306F\u300C\u4E3B\u8A9E = \u301C\u300D\u3068\u30A4\u30B3\u30FC\u30EB\u3067\u3064\u306A\u3050\u52D5\u8A5E\u3002\u3046\u3057\u308D\u306B\u69D8\u5B50(\u5F62\u5BB9\u8A5E)\u3084\u540D\u8A5E\u3092\u7F6E\u3044\u3066\u300C\u4E3B\u8A9E\u304C\u3069\u3093\u306A\u3082\u306E\u304B\u300D\u3092\u8A00\u3046\u3002" },
    obj: { n: "\u76EE\u7684\u8A9E", m: "\u4F55\u3092\u30FB\u3060\u308C\u3092", c: "r3", d: "\u52D5\u8A5E\u306E\u52D5\u4F5C\u3092\u53D7\u3051\u308B\u76F8\u624B\u3002\u52D5\u8A5E\u306E\u3059\u3050\u3046\u3057\u308D\u306B\u7F6E\u304D\u3001\u524D\u7F6E\u8A5E\u306F\u4ED8\u3051\u306A\u3044(\xD7 eat in an apple)\u3002" },
    comp: { n: "\u88DC\u8A9E", m: "\u3069\u3093\u306A\u30FB\u4F55", c: "r3", d: "be\u52D5\u8A5E\u306E\u3046\u3057\u308D\u3067\u3001\u4E3B\u8A9E\u306E\u69D8\u5B50\u3084\u6B63\u4F53\u3092\u8AAC\u660E\u3059\u308B\u8A00\u8449\u3002He is happy. \u306E happy \u306F he \u306E\u69D8\u5B50\u3002" },
    place: { n: "\u5834\u6240", m: "\u3069\u3053\u3067\u30FB\u3069\u3053\u3078", c: "r4", d: "\u5834\u6240\u306F\u300C\u524D\u7F6E\u8A5E + \u540D\u8A5E\u300D\u306E\u304B\u305F\u307E\u308A\u3067\u8868\u3059\u3053\u3068\u304C\u591A\u3044\u3002\u76EE\u7684\u8A9E\u306E\u3046\u3057\u308D\u306B\u7F6E\u304F\u3002" },
    time: { n: "\u6642", m: "\u3044\u3064", c: "r5", d: "\u6642\u306F1\u8A9E\u306E\u526F\u8A5E(yesterday \u306A\u3069)\u304B\u300C\u524D\u7F6E\u8A5E + \u540D\u8A5E\u300D(on Monday \u306A\u3069)\u3067\u8868\u3059\u3002\u6587\u306E\u6700\u5F8C\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002" },
    manner: { n: "\u69D8\u5B50", m: "\u3069\u3093\u306A\u3075\u3046\u306B", c: "r4", d: "\u52D5\u8A5E\u3092\u304F\u308F\u3057\u304F\u3059\u308B\u526F\u8A5E\u3002\u3075\u3064\u3046\u306F\u52D5\u8A5E(\u3068\u76EE\u7684\u8A9E)\u306E\u3046\u3057\u308D\u306B\u7F6E\u304F\u3002" },
    other: { n: "\u4FEE\u98FE", m: "", c: "r4", d: "" },
    front: { n: "\u524D\u304A\u304D", m: "", c: "r5", d: "\u6587\u306E\u524D\u306B\u7F6E\u304F\u300C\u301C\u3059\u308B\u3068\u304D\u300D\u306A\u3069\u306E\u304B\u305F\u307E\u308A\u3002\u524D\u306B\u7F6E\u3044\u305F\u3068\u304D\u306F\u3001\u3046\u3057\u308D\u306B\u30AB\u30F3\u30DE(,)\u3092\u4ED8\u3051\u308B\u3002" },
    conj: { n: "\u63A5\u7D9A\u8A5E", m: "\u3064\u306A\u304E", c: "r5", d: "\u63A5\u7D9A\u8A5E\u306F\u6587\u3068\u6587\u3092\u3064\u306A\u3050\u8A00\u8449\u3002when / if / because \u306E\u3046\u3057\u308D\u306B\u306F\u300C\u4E3B\u8A9E + \u52D5\u8A5E\u300D\u306E\u6587\u304C\u7D9A\u304F\u3002" }
  };
  function tokRole(t, cl) {
    if (!t) return "other";
    if (t === cl.subj) return "subj";
    if (t === cl.vp) return cl.vp.be && !cl.vp.verb ? "be" : "verb";
    if (cl.comps.indexOf(t) >= 0) return cl.vp.be && !cl.vp.verb ? "comp" : t.t === "AP" ? "comp" : "obj";
    if (isTime(t)) return "time";
    if (isPlace(t) || t.t === "PP" && t.cat === "dir") return "place";
    if (t.t === "ADV") return "manner";
    return "other";
  }
  function chunksOf(row, ev) {
    var sf = surfaceOf(row, ev);
    if (!sf || !sf.seq || !ev.r) return null;
    var a = ev.r.alt, owners = [];
    function addCl(cl, tag) {
      if (!cl) return;
      [cl.subj, cl.vp].concat(cl.pre, cl.comps, cl.posts).forEach(function(t) {
        if (t) owners.push({ t, role: tokRole(t, cl), cl: tag });
      });
    }
    if (a.front) {
      if (a.front.cl) addCl(a.front.cl, "front");
      else if (a.front.tok) owners.push({ t: a.front.tok, role: isTime(a.front.tok) ? "time" : "front", cl: "main" });
    }
    a.cls.forEach(function(cl, i) {
      addCl(cl, i ? "second" : "main");
    });
    function ownerOfCard(c2) {
      for (var i = 0; i < owners.length; i++) if ((owners[i].t.words || []).indexOf(c2.w) >= 0) return i;
      return -1;
    }
    var seq = sf.seq, own = seq.map(function(x) {
      return x.auto ? null : ownerOfCard(row[x.card]);
    });
    seq.forEach(function(x, k3) {
      if (x.auto && /^(am|is|are|was|were|be|been|do|does|did)$/i.test(x.t)) {
        var vi = owners.findIndex(function(o) {
          return o.role === "verb" || o.role === "be";
        });
        own[k3] = vi;
      }
    });
    for (var k = seq.length - 1; k >= 0; k--) if (own[k] == null || own[k] < 0) {
      var c = !seq[k].auto && row[seq[k].card];
      if (c && /^(conj)$/.test(c.w.k)) {
        own[k] = "conj" + k;
        continue;
      }
      own[k] = k + 1 < seq.length ? own[k + 1] : own[k - 1];
    }
    for (var k2 = 0; k2 < seq.length; k2++) if (own[k2] == null || own[k2] < 0) own[k2] = k2 ? own[k2 - 1] : 0;
    seq.forEach(function(x, k3) {
      var c2 = !x.auto && row[x.card], ow = owners[own[k3]];
      if (c2 && c2.w.k === "adv" && ow && (ow.role === "verb" || ow.role === "be")) own[k3] = "adv" + k3;
    });
    var chunks = [];
    seq.forEach(function(x, k3) {
      var o = own[k3], last = chunks[chunks.length - 1];
      if (last && last.o === o) {
        last.ks.push(k3);
        return;
      }
      var isC = typeof o === "string", ow = isC ? null : owners[o], ac2 = isC && /^adv/.test(o) ? row[x.card] : null;
      chunks.push({ o, ks: [k3], role: ac2 ? ac2.w.e.k === "time" ? "time" : ac2.w.e.k === "place" ? "place" : "manner" : isC ? "conj" : ow ? ow.role : "other", tok: ow ? ow.t : null, cl: ow ? ow.cl : "main", adv: ac2 });
    });
    chunks.forEach(function(ch) {
      ch.text = ch.ks.map(function(k3) {
        return seq[k3].t;
      }).join(" ");
      ch.ja = ch.adv ? ch.adv.w.e.ja || "" : ch.tok ? jaChunk(ch, ev) : "";
    });
    return { seq, chunks, ev, row };
  }
  function jaChunk(ch, ev) {
    var g = "";
    try {
      g = G.gloss(ch.tok) || "";
    } catch (e) {
    }
    if (ch.role === "subj") return g + "\u306F";
    if (ch.role === "obj") return g + "\u3092";
    if (ch.role === "verb" || ch.role === "be") {
      var vp = ch.tok;
      g = g.replace(/\(.*?\)/g, "");
      if (vp.be && !vp.verb) g = "";
      return g;
    }
    return g;
  }
  function posOf(x, c) {
    if (x.auto) {
      var t = x.t.toLowerCase();
      return /^(a|an|the)$/.test(t) ? "\u51A0\u8A5E" : /^(am|is|are|was|were|be|been)$/.test(t) ? "be\u52D5\u8A5E" : /^(do|does|did|will|would|shall|have|has|had)$/.test(t) ? "\u52A9\u52D5\u8A5E" : /^(to|in|on|at|for|with|from|by|of|into)$/.test(t) ? "\u524D\u7F6E\u8A5E" : "\u3064\u306A\u304E\u306E\u8A9E";
    }
    var k = c.w.k;
    if (k === "pr") return c.label ? "\u6240\u6709\u683C" : "\u4EE3\u540D\u8A5E";
    return { n: "\u540D\u8A5E", v: "\u52D5\u8A5E", adj: "\u5F62\u5BB9\u8A5E", adv: "\u526F\u8A5E", det: c.w.v === "this" || c.w.v === "that" ? "\u6307\u793A\u8A9E" : "\u51A0\u8A5E", prep: "\u524D\u7F6E\u8A5E", modal: "\u52A9\u52D5\u8A5E", sm: "\u52A9\u52D5\u8A5E", do: "\u52A9\u52D5\u8A5E", be: "be\u52D5\u8A5E", hv: "\u52A9\u52D5\u8A5E(have)", not: "\u5426\u5B9A", conj: "\u63A5\u7D9A\u8A5E", rel: "\u95A2\u4FC2\u4EE3\u540D\u8A5E", deg: "\u526F\u8A5E" }[k] || "";
  }
  function wordNotes(ch, R0) {
    var out = [], seq = R0.seq, row = R0.row;
    ch.ks.forEach(function(k) {
      var x = seq[k], t = x.t.toLowerCase(), c = x.auto ? null : row[x.card], pos = posOf(x, c), nk = null, txt = "";
      for (var j = k + 1; j < seq.length; j++) if (!seq[j].auto) {
        nk = row[seq[j].card];
        if (nk && nk.w.k !== "adj") break;
      }
      var nw = nk && nk.w.e ? nk.w.e.w : "", ncat = nk && nk.w.e ? nk.w.e.cat : "";
      if (pos === "\u51A0\u8A5E") {
        if (t === "a") txt = "\u540D\u8A5E\u306E\u524D\u306B\u4ED8\u3051\u3066\u300C1\u3064\u306E\u300D\u3092\u8868\u3059\u3002\u6570\u3048\u3089\u308C\u308B\u540D\u8A5E(" + (nw || "book") + " \u306A\u3069)\u304C1\u3064\u3067\u3001\u307E\u3060\u8A71\u306B\u51FA\u3066\u3044\u306A\u3044\u3082\u306E\u306B\u4ED8\u3051\u308B\u3002";
        else if (t === "an") txt = "a \u3068\u540C\u3058\u50CD\u304D\u3002\u305F\u3060\u3057 " + (nw || "apple") + " \u306E\u3088\u3046\u306B\u6BCD\u97F3(\u30A2\u30FB\u30A4\u30FB\u30A6\u30FB\u30A8\u30FB\u30AA\u306E\u97F3)\u3067\u59CB\u307E\u308B\u8A9E\u306E\u524D\u3067\u306F an \u306B\u3059\u308B\u3002";
        else txt = "\u540D\u8A5E\u306E\u524D\u306B\u4ED8\u3051\u3066\u300C\u305D\u306E\u300D\u3092\u8868\u3059\u3002\u805E\u304D\u624B\u306B\u3082\u3069\u308C\u306E\u3053\u3068\u304B\u5206\u304B\u308B\u3082\u306E\u30011\u3064\u306B\u6C7A\u307E\u308B\u3082\u306E\u306B\u4ED8\u3051\u308B" + (/^(place|time)$/.test(ncat) ? "(the park\u3001the morning \u306E\u3088\u3046\u306B\u5834\u6240\u3084\u6642\u9593\u5E2F\u306B\u306F\u3088\u304F\u4ED8\u304F)" : "") + "\u3002";
        txt += " \u51A0\u8A5E\u306F\u300C\u51A0\u8A5E \u2192(\u5F62\u5BB9\u8A5E)\u2192 \u540D\u8A5E\u300D\u306E\u9806\u3067\u3001\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u304F\u3002";
      } else if (pos === "\u6307\u793A\u8A9E") txt = "\u300C\u3053\u306E(this)\u30FB\u3042\u306E(that)\u300D\u3002\u51A0\u8A5E\u306E\u304B\u308F\u308A\u306B\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u304F\u3002\u540D\u8A5E\u304C\u8907\u6570\u306A\u3089 these / those \u306B\u5909\u308F\u308B\u3002";
      else if (pos === "\u524D\u7F6E\u8A5E") {
        var m = { "in": ncat === "time" ? "\u671D\u30FB\u5348\u5F8C\u30FB\u6708\u30FB\u5E74\u306A\u3069\u300C\u5E45\u306E\u3042\u308B\u6642\u9593\u300D\u306B\u4F7F\u3046(in the morning)\u3002" : "\u300C\u301C\u306E\u4E2D\u3067\u300D\u3002\u5EFA\u7269\u3084\u753A\u306A\u3069\u5E83\u304C\u308A\u306E\u3042\u308B\u5834\u6240\u306B\u4F7F\u3046(in the park)\u3002", on: ncat === "time" ? "\u66DC\u65E5\u3084\u65E5\u4ED8\u306B\u4F7F\u3046(on Monday)\u3002" : "\u300C\u301C\u306E\u4E0A\u306B\u30FB\u63A5\u3057\u3066\u300D\u3002", at: ncat === "time" ? "\u6642\u523B\u3084\u304A\u663C\u306A\u3069\u300C\u6642\u9593\u306E1\u70B9\u300D\u306B\u4F7F\u3046(at noon)\u3002" : "\u99C5\u3084\u5BB6\u306A\u3069\u300C\u5834\u6240\u30921\u70B9\u300D\u3068\u3057\u3066\u8003\u3048\u308B\u3068\u304D\u306B\u4F7F\u3046(at the station)\u3002", to: "\u300C\u301C\u3078\u300D\u3002go\u30FBcome \u306A\u3069\u79FB\u52D5\u306E\u52D5\u8A5E\u306E\u3042\u3068\u3067\u884C\u304D\u5148\u3092\u8868\u3059\u3002", "with": "\u300C\u301C\u3068\u4E00\u7DD2\u306B\u30FB\u301C\u3092\u4F7F\u3063\u3066\u300D\u3002", "for": "\u300C\u301C\u306E\u305F\u3081\u306B\u300D\u3002", from: "\u300C\u301C\u304B\u3089\u300D\u3002", by: "\u300C\u301C\u306E\u305D\u3070\u3067\u30FB\u301C\u306B\u3088\u3063\u3066\u300D\u3002" }[t] || "";
        txt = "\u524D\u7F6E\u8A5E\u306F\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u3044\u3066\u3001\u5834\u6240\u30FB\u6642\u30FB\u65B9\u5411\u306A\u3069\u3092\u8868\u3059\u8A00\u8449\u3002\u300C\u524D\u7F6E\u8A5E + \u540D\u8A5E\u300D\u3067\u3072\u3068\u3064\u306E\u304B\u305F\u307E\u308A\u306B\u306A\u308B\u3002" + m;
      } else if (pos === "be\u52D5\u8A5E") txt = (/n't|not/.test(t) ? "not \u304C\u4ED8\u3044\u305F\u5426\u5B9A\u306E\u5F62(\u301C\u3067\u306F\u306A\u3044)\u3002be\u52D5\u8A5E\u306F\u3001\u3046\u3057\u308D\u306B not \u3092\u4ED8\u3051\u308B\u3060\u3051\u3067\u5426\u5B9A\u306B\u306A\u308B\u3002" : "") + "\u4E3B\u8A9E\u3068\u3046\u3057\u308D\u306E\u8A00\u8449\u3092\u30A4\u30B3\u30FC\u30EB\u3067\u3064\u306A\u3050\u52D5\u8A5E\u3002\u4E3B\u8A9E\u3068\u6642\u3067\u5F62\u304C\u5909\u308F\u308B:I am / he\u30FBshe\u30FBit is / you\u30FBwe\u30FBthey are(\u904E\u53BB\u306F was / were)\u3002" + (t === "been" ? "have \u306E\u3046\u3057\u308D\u3067\u306F been \u306B\u306A\u308B(\u5B8C\u4E86\u5F62)\u3002" : "");
      else if (c && c.w.k === "do" && !c.w.neg) txt = "\u5F37\u8ABF\u306E do:\u300C\u672C\u5F53\u306B\u301C\u3059\u308B\u300D\u3068\u6C17\u6301\u3061\u3092\u5F37\u3081\u308B\u3002\u4E3B\u8A9E\u304C he / she \u306A\u3089 does\u3001\u904E\u53BB\u306A\u3089 did\u3002\u3046\u3057\u308D\u306E\u52D5\u8A5E\u306F\u539F\u5F62(\u5143\u306E\u5F62)\u3002";
      else if (c && c.w.k === "do") txt = "\u300C\u301C\u3057\u306A\u3044\u300D\u306E\u5426\u5B9A\u3002\u3075\u3064\u3046\u306E\u52D5\u8A5E(like\u30FBplay \u306A\u3069)\u3092\u6253\u3061\u6D88\u3059\u3068\u304D\u306F\u3001\u52D5\u8A5E\u306E\u524D\u306B do not(don't)\u3092\u7F6E\u304F\u3002\u4E3B\u8A9E\u304C he / she / 1\u3064\u306A\u3089 doesn't\u3001\u904E\u53BB\u306A\u3089 didn't\u3002\u3046\u3057\u308D\u306E\u52D5\u8A5E\u306F\u539F\u5F62(\u5143\u306E\u5F62)\u306B\u3059\u308B\u3002";
      else if (pos === "\u52A9\u52D5\u8A5E" && /^(do|does|did)$/.test(t)) txt = "not \u3067\u6253\u3061\u6D88\u3059\u3068\u304D\u306B\u52D5\u8A5E\u306E\u524D\u306B\u7F6E\u304F\u52A9\u52D5\u8A5E\u3002\u4E3B\u8A9E\u304C he / she \u306A\u3089 does\u3001\u904E\u53BB\u306A\u3089 did\u3002\u3046\u3057\u308D\u306E\u52D5\u8A5E\u306F\u539F\u5F62(\u5143\u306E\u5F62)\u306B\u3059\u308B\u3002";
      else if (pos === "\u52A9\u52D5\u8A5E(have)") txt = "have + \u904E\u53BB\u5206\u8A5E \u3067\u5B8C\u4E86\u5F62(\u301C\u3057\u305F\u3068\u3053\u308D\u30FB\u301C\u3057\u305F\u3053\u3068\u304C\u3042\u308B)\u3002\u4E3B\u8A9E\u304C he / she \u306A\u3089 has\u3001\u904E\u53BB\u306A\u3089 had\u3002";
      else if (pos === "\u52A9\u52D5\u8A5E") txt = "\u52D5\u8A5E\u306E\u524D\u306B\u7F6E\u3044\u3066\u300C\u3067\u304D\u308B(can)\u30FB\u3059\u308B\u3064\u3082\u308A(will)\u300D\u306A\u3069\u306E\u610F\u5473\u3092\u8DB3\u3059\u3002\u3046\u3057\u308D\u306E\u52D5\u8A5E\u306F\u539F\u5F62(\u5143\u306E\u5F62)\u306E\u307E\u307E\u3002";
      else if (pos === "\u4EE3\u540D\u8A5E") {
        var P = G.PRON[c.w.v], base = cardText(c).toLowerCase();
        txt = "\u540D\u8A5E\u306E\u304B\u308F\u308A\u306B\u4F7F\u3046\u8A00\u8449(" + P.ja + ")\u3002" + (t === P.obj.toLowerCase() && t !== base ? "\u52D5\u8A5E\u3084\u524D\u7F6E\u8A5E\u306E\u3046\u3057\u308D(\u76EE\u7684\u8A9E)\u3067\u306F\u5F62\u304C\u5909\u308F\u308B:" + base + " \u2192 " + t + "\u3002I \u2192 me\u3001he \u2192 him\u3001she \u2192 her\u3001we \u2192 us\u3001they \u2192 them\u3002" : "\u4E3B\u8A9E\u306E\u3068\u304D\u306F I / you / he / she / it / we / they \u306E\u5F62\u3002");
      } else if (pos === "\u6240\u6709\u683C") txt = "\u300C\u301C\u306E\u300D\u3092\u8868\u3059(my = \u308F\u305F\u3057\u306E)\u3002\u51A0\u8A5E\u306E\u304B\u308F\u308A\u306B\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u304F\u3002";
      else if (pos === "\u540D\u8A5E") {
        var e = c.w.e;
        txt = "\u3082\u306E\u3084\u4EBA\u306E\u540D\u524D\u3092\u8868\u3059\u8A00\u8449(" + (e.ja || "") + ")\u3002" + (c.w.pl ? "2\u3064\u4EE5\u4E0A\u306A\u306E\u3067 -s \u3092\u4ED8\u3051\u305F\u8907\u6570\u5F62\u3002" : G.isCount(e) && !e.ind ? "\u6570\u3048\u3089\u308C\u308B\u540D\u8A5E\u306A\u306E\u3067\u30011\u3064\u306A\u3089 a / the \u306A\u3069\u304C\u524D\u306B\u5FC5\u8981\u3002" : "\u6570\u3048\u3089\u308C\u306A\u3044\u540D\u8A5E\u306A\u306E\u3067 a \u306F\u4ED8\u3051\u306A\u3044\u3002");
      } else if (pos === "\u52D5\u8A5E") {
        var e3 = c.w.e, b = first(vtext(e3, "base")), w0 = first(t), pv = prevCore(row.map(function(z) {
          return z.w;
        }), x.card), pa = first(vtext(e3, "past")), irr = pa !== b + "ed" && pa !== b + "d" && pa !== b.replace(/y$/, "ied");
        txt = "\u52D5\u304D\u3092\u8868\u3059\u8A00\u8449(" + (e3.ja || "") + ")\u3002";
        if (w0 === first(vtext(e3, "ing"))) txt += "be\u52D5\u8A5E + \u301Cing \u5F62\u3067\u9032\u884C\u5F62\u300C\u301C\u3057\u3066\u3044\u308B\u3068\u3053\u308D\u300D\u3002";
        else if (pv && pv.k === "hv" && w0 === first(vtext(e3, "pp"))) txt += "have + \u904E\u53BB\u5206\u8A5E\u3067\u5B8C\u4E86\u5F62\u3002" + b + " \u306E\u904E\u53BB\u5206\u8A5E\u306F " + w0 + "\u3002";
        else if (pv && pv.k === "be" && w0 === first(vtext(e3, "pp"))) txt += "be\u52D5\u8A5E + \u904E\u53BB\u5206\u8A5E\u3067\u53D7\u3051\u8EAB\u300C\u301C\u3055\u308C\u308B\u300D\u3002";
        else if (w0 === pa && w0 !== b) txt += "\u904E\u53BB\u306E\u3053\u3068\u306A\u306E\u3067\u904E\u53BB\u5F62:" + b + " \u2192 " + w0 + "\u3002" + (irr ? "\u3053\u308C\u306F\u5F62\u304C\u4E0D\u898F\u5247\u306B\u5909\u308F\u308B\u52D5\u8A5E(\u4E0D\u898F\u5247\u52D5\u8A5E)\u3002" : "\u3075\u3064\u3046\u306E\u52D5\u8A5E\u306F -ed \u3092\u4ED8\u3051\u308B\u3002");
        else if (w0 !== b) txt += "\u4E3B\u8A9E\u304C he / she / it \u30841\u4EBA\u30FB1\u3064\u3067\u3001\u4ECA\u306E\u3053\u3068(\u3044\u3064\u3082\u3059\u308B\u3053\u3068)\u306E\u3068\u304D\u306F -s \u3092\u4ED8\u3051\u308B(\u4E09\u4EBA\u79F0\u5358\u6570\u73FE\u5728):" + b + " \u2192 " + w0 + "\u3002";
        else txt += pv && (pv.k === "modal" || pv.k === "sm" || pv.k === "not") ? "\u52A9\u52D5\u8A5E\u306E\u3046\u3057\u308D\u306A\u306E\u3067\u539F\u5F62(\u5143\u306E\u5F62)\u306E\u307E\u307E\u3002" : "\u4E3B\u8A9E\u304C I / you / \u8907\u6570\u3067\u4ECA\u306E\u3053\u3068\u306A\u306E\u3067\u3001\u5143\u306E\u5F62\u306E\u307E\u307E\u3002";
      } else if (pos === "\u5F62\u5BB9\u8A5E") txt = "\u69D8\u5B50\u3092\u8868\u3059\u8A00\u8449(" + (c.w.e.ja || "") + ")\u3002\u540D\u8A5E\u306E\u524D\u306B\u7F6E\u3044\u3066\u540D\u8A5E\u3092\u304F\u308F\u3057\u304F\u3059\u308B\u304B\u3001be\u52D5\u8A5E\u306E\u3046\u3057\u308D\u3067\u4E3B\u8A9E\u306E\u69D8\u5B50\u3092\u8A00\u3046\u3002";
      else if (pos === "\u526F\u8A5E") txt = c.w.k === "deg" ? "\u300C\u3068\u3066\u3082\u300D\u3002\u5F62\u5BB9\u8A5E\u306E\u524D\u306B\u7F6E\u3044\u3066\u5F37\u3081\u308B\u3002" : "\u52D5\u8A5E\u3084\u6587\u3092\u304F\u308F\u3057\u304F\u3059\u308B\u8A00\u8449(" + (c.w.e.ja || "") + ")\u3002" + (c.w.e.k === "time" ? "\u6642\u3092\u8868\u3059\u526F\u8A5E\u306F\u6587\u306E\u6700\u5F8C\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002" : c.w.e.k === "place" ? "\u5834\u6240\u3092\u8868\u3059\u526F\u8A5E\u3002\u524D\u7F6E\u8A5E\u306F\u3044\u3089\u306A\u3044\u3002" : "\u69D8\u5B50\u3092\u8868\u3059\u526F\u8A5E\u306F\u52D5\u8A5E(\u3068\u76EE\u7684\u8A9E)\u306E\u3046\u3057\u308D\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002");
      else if (pos === "\u5426\u5B9A") txt = "\u300C\u301C\u306A\u3044\u300D\u3002be\u52D5\u8A5E\u30FB\u52A9\u52D5\u8A5E\u306E\u3046\u3057\u308D\u306B\u7F6E\u304F\u3002\u3075\u3064\u3046\u306E\u52D5\u8A5E\u306E\u3068\u304D\u306F do / does / did + not \u306B\u3059\u308B\u3002";
      else if (pos === "\u63A5\u7D9A\u8A5E") txt = { and: "\u300C\u305D\u3057\u3066\u300D\u3002", but: "\u300C\u3067\u3082\u300D\u3002", so: "\u300C\u3060\u304B\u3089\u300D\u3002", when: "\u300C\u301C\u3059\u308B\u3068\u304D\u300D\u3002", "if": "\u300C\u3082\u3057\u301C\u306A\u3089\u300D\u3002", because: "\u300C\u301C\u3060\u304B\u3089\u300D\u3002" }[c.w.v] + "\u3046\u3057\u308D\u306B\u300C\u4E3B\u8A9E + \u52D5\u8A5E\u300D\u306E\u6587\u304C\u7D9A\u304F\u3002";
      else if (pos === "\u95A2\u4FC2\u4EE3\u540D\u8A5E") txt = "\u524D\u306E\u540D\u8A5E\u3092\u3001\u3046\u3057\u308D\u306E\u6587\u3067\u8AAC\u660E\u3059\u308B\u3068\u304D\u306E\u3064\u306A\u304E(who \u306F\u4EBA\u3001which \u306F\u3082\u306E\u3001that \u306F\u3069\u3061\u3089\u306B\u3082\u4F7F\u3048\u308B)\u3002";
      var fixed = R0.fixK && R0.fixK[k];
      out.push({ w: x.t, pos, auto: fixed ? x.auto ? true : "form" : x.auto || c && cardText(c).toLowerCase() !== t ? "rule" : false, txt });
    });
    return out;
  }
  function reviewItems(row, ev) {
    var R0 = chunksOf(row, ev);
    return R0 && R0.chunks.length ? R0 : null;
  }
  function showReview(R0) {
    return new Promise(function(done) {
      var o = el("div", "modal");
      root.appendChild(o);
      var idx = -1, chs = R0.chunks;
      R0.fixK = {};
      improvements(R0).forEach(function(m) {
        R0.fixK[m.k] = 1;
      });
      function line(hi) {
        return chs.map(function(ch, i) {
          var r = ROLE[ch.role] || ROLE.other;
          return '<span class="ck ' + r.c + (i === hi ? " hi" : "") + (hi >= 0 && i !== hi ? " dim" : "") + '"><b>' + (i === 0 ? ch.text.charAt(0).toUpperCase() + ch.text.slice(1) : ch.text) + "</b><small>" + r.n + "</small></span>";
        }).join("") + '<span class="ck dot">.</span>';
      }
      function close() {
        o.remove();
        done();
      }
      function page() {
        var body, btn;
        if (idx < 0) {
          body = '<h2>\u{1F4D6} \u3053\u306E\u6587\u3092\u5206\u89E3\u3057\u3088\u3046</h2><div class="cks">' + line(-1) + '</div><p class="lead">\u82F1\u8A9E\u306E\u6587\u306F\u3001\u610F\u5473\u306E\u304B\u305F\u307E\u308A(<b>\u30C1\u30E3\u30F3\u30AF</b>)\u3092\u6C7A\u307E\u3063\u305F\u9806\u756A\u306B\u4E26\u3079\u3066\u4F5C\u308B\u3002<br>\u57FA\u672C\u306E\u9806\u756A:<b>\u4E3B\u8A9E \u2192 \u52D5\u8A5E \u2192 \u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E \u2192 \u5834\u6240 \u2192 \u6642</b></p><p class="lead">\u3053\u306E\u6587\u306E\u578B:<b>' + yaku(R0.ev.f).name + '</b></p><p class="sm">\u30C1\u30E3\u30F3\u30AF\u3054\u3068\u306B\u3001\u4E2D\u306E1\u8A9E1\u8A9E\u306E\u54C1\u8A5E\u3068\u3001\u306A\u305C\u305D\u306E\u5F62\u306A\u306E\u304B\u3092\u898B\u3066\u3044\u3053\u3046\u3002\u300C\u7F6E\u304D\u5FD8\u308C\u300D\u300C\u9078\u3073\u306A\u304A\u3057\u300D\u306F\u3042\u306A\u305F\u304C\u76F4\u3059\u6240\u3002\u300C\u81EA\u52D5\u3067\u5909\u308F\u308B\u5F62\u300D\u306F\u4E3B\u8A9E\u306A\u3069\u306B\u5408\u308F\u305B\u3066\u6C7A\u307E\u308B\u30EB\u30FC\u30EB(\u307E\u3061\u304C\u3044\u3067\u306F\u306A\u3044)\u3002</p>';
          btn = "\u304F\u308F\u3057\u304F\u898B\u308B";
        } else if (idx < chs.length) {
          var ch = chs[idx], r = ROLE[ch.role] || ROLE.other, notes2 = wordNotes(ch, R0);
          body = "<h2>" + (idx + 1) + ". " + r.n + (r.m ? "<small>" + r.m + "</small>" : "") + '</h2><div class="cks">' + line(idx) + '</div><div class="big"><b>' + ch.text + "</b>" + (ch.ja ? "<span>" + ch.ja + "</span>" : "") + "</div>" + (r.d ? '<p class="lead">' + (ch.cl === "second" ? "(2\u3064\u76EE\u306E\u6587)" : ch.cl === "front" ? "(\u524D\u304A\u304D\u306E\u6587\u306E\u4E2D)" : "") + r.d + "</p>" : "") + (notes2.length ? '<ul class="wn">' + notes2.map(function(n) {
            return '<li><div class="wh"><b>' + n.w + "</b><i>" + n.pos + "</i>" + (n.auto === true ? "<u>\u7F6E\u304D\u5FD8\u308C</u>" : n.auto === "form" ? "<u>\u9078\u3073\u306A\u304A\u3057</u>" : n.auto === "rule" ? '<u class="ru">\u81EA\u52D5\u3067\u5909\u308F\u308B\u5F62</u>' : "") + "</div>" + n.txt + "</li>";
          }).join("") + "</ul>" : "");
          btn = idx + 1 < chs.length ? "\u3064\u304E\u306E\u30C1\u30E3\u30F3\u30AF\u3078" : "\u307E\u3068\u3081\u3078";
        } else {
          var pts = [];
          chs.forEach(function(ch2) {
            wordNotes(ch2, R0).forEach(function(n) {
              if (n.auto === true || n.auto === "form") pts.push("<li><b>" + n.w + "</b>(" + n.pos + ")</li>");
            });
          });
          body = '<h2>\u307E\u3068\u3081</h2><div class="cks">' + line(-1) + '</div><p class="lead">' + chs.map(function(c) {
            return "<b>" + (ROLE[c.role] || ROLE.other).n + "</b>";
          }).join(" \u2192 ") + "</p>" + (pts.length ? '<p class="sm">\u4ECA\u56DE\u306E\u7F6E\u304D\u5FD8\u308C\u30FB\u9078\u3073\u306A\u304A\u3057:</p><ul class="pts">' + pts.join("") + '</ul><p class="sm">\u6B21\u306F\u3001\u3053\u306E\u90E8\u54C1\u3082\u81EA\u5206\u3067\u30AB\u30FC\u30C9\u3092\u7F6E\u3044\u3066\u307F\u3088\u3046\u3002</p>' : '<p class="sm">\u88DC\u3063\u305F\u8A9E\u306F\u306A\u3057\u3002\u5B8C\u307A\u304D!</p>');
          btn = "\u304A\u308F\u308A";
        }
        o.innerHTML = '<div class="box rv">' + body + '<div class="rvb"><button class="btn ghost small" id="cl">\u89E3\u8AAC\u3092\u3084\u3081\u308B</button><button class="btn go" id="nx">' + btn + '</button></div><div class="pg">' + (idx + 2) + " / " + (chs.length + 2) + "</div></div>";
        $("#nx", o).onclick = function() {
          SFX.tap();
          idx++;
          if (idx > chs.length) close();
          else page();
        };
        $("#cl", o).onclick = close;
        if (idx >= 0 && idx < chs.length) speak(chs[idx].text);
      }
      page();
    });
  }
  function armIdle() {
    clearTimeout(G_.idleT);
    G_.needId = null;
    if (G_.hand) Array.prototype.forEach.call(G_.hand.querySelectorAll(".need"), function(e) {
      e.classList.remove("need");
    });
    if (LEVEL !== 0 || !G_.hand) return;
    G_.idleT = setTimeout(idleHint, 1e4);
  }
  function idleHint() {
    if (LEVEL !== 0 || G_.busy || G_.mode !== "play" || !G_.hand || !document.body.contains(G_.hand)) return;
    var cards = R.hand.concat(R.row.filter(function(c) {
      return !c.tsu;
    }));
    var best2 = VSref && VSref._search ? VSref._search(cards, null, 1, 220) : null;
    if (!best2) {
      if (G_.hp) G_.hp.innerHTML = '<div class="hrow">\u{1F4A1} ' + diagnose(cards) + "</div>";
      return;
    }
    var inRow = {};
    R.row.forEach(function(c) {
      inRow[c.id] = 1;
    });
    var miss = best2.row.filter(function(c) {
      return !c.tsu && !inRow[c.id];
    });
    var noAdj = function(c) {
      return c.w.k !== "adj" && c.w.k !== "adv";
    }, pick0 = miss.filter(function(c) {
      return G_.nxH && G_.nxH[c.id] && noAdj(c);
    })[0] || miss.filter(noAdj)[0] || miss[0];
    if (!pick0) {
      if (G_.hp && cur && cur.state !== "ok") G_.hp.innerHTML = '<div class="hrow">\u{1F4A1} \u30AB\u30FC\u30C9\u306F\u305D\u308D\u3063\u3066\u3044\u308B\u3002\u4E26\u3079\u308B\u9806\u756A\u3092\u898B\u76F4\u305D\u3046(\u4E3B\u8A9E \u2192 \u52D5\u8A5E \u2192 \u76EE\u7684\u8A9E \u2192 \u5834\u6240 \u2192 \u6642)</div>';
      return;
    }
    var idx = best2.row.indexOf(pick0), role = roleOf(best2.row, idx) || "";
    G_.needId = pick0.id;
    Array.prototype.forEach.call(G_.hand.children, function(e) {
      var c = R.hand[+e.dataset.i];
      if (c && c.id === pick0.id) e.classList.add("need");
    });
    if (G_.hp) G_.hp.innerHTML = '<div class="hrow need">\u{1F4A1} \u6B21\u306F\u3053\u306E\u30AB\u30FC\u30C9:<b>' + cardText(pick0) + "</b>" + (role ? "(" + role + ")" : "") + "</div>" + G_.hp.innerHTML;
    SFX.joker();
  }
  function vCat(c, tok, row, i) {
    var e = c.w.e, t = first(tok), pv = prevCore(row.map(function(z) {
      return z.w;
    }), i);
    if (t === first(vtext(e, "ing"))) return "ing";
    if (t === first(vtext(e, "pp")) && pv && (pv.k === "be" || pv.k === "hv")) return "pp";
    if (t === first(vtext(e, "past")) && t !== first(vtext(e, "base"))) return "past";
    return "base";
  }
  function improvements(R0) {
    var out = [], seq = R0.seq, row = R0.row;
    seq.forEach(function(x, k) {
      var c = x.auto ? null : row[x.card], t = x.t.toLowerCase();
      if (x.auto) {
        if (/^(do|does|did)$/.test(t)) return;
        out.push({ k, kind: "miss", w: x.t, pos: posOf(x, null), why: needWhy(x, k, R0) });
        return;
      }
      if (!c || c.w.k !== "v") return;
      var want = vCat(c, x.t, row, x.card), have = c.w.f || "base";
      if (want === "base" || want === have) return;
      if (vtext(c.w.e, have) === x.t) return;
      out.push({ k, kind: "form", w: x.t, from: cardText(c), pos: posOf(x, c), why: formWhy(c, x, R0) });
    });
    return out;
  }
  function nextNoun(seq, k, row) {
    for (var j = k + 1; j < seq.length; j++) if (!seq[j].auto) {
      var c = row[seq[j].card];
      if (c && c.w.k === "n") return c;
      if (c && !/^(adj|det)$/.test(c.w.k)) return null;
    }
    return null;
  }
  function needWhy(x, k, R0) {
    var t = x.t.toLowerCase(), n = nextNoun(R0.seq, k, R0.row), nw = n ? n.w.e.w : "", cat2 = n ? n.w.e.cat : "";
    if (t === "a" || t === "an") return "\u300C" + nw + "\u300D\u306F\u6570\u3048\u3089\u308C\u308B\u540D\u8A5E\u3002\u82F1\u8A9E\u3067\u306F\u3001\u6570\u3048\u3089\u308C\u308B\u540D\u8A5E\u30921\u3064\u3060\u3051\u8A00\u3046\u3068\u304D\u3001\u524D\u306B a / an / the \u306A\u3069\u304C\u304B\u306A\u3089\u305A\u5FC5\u8981(\u540D\u8A5E\u3060\u3051\u3092\u30DD\u30F3\u3068\u7F6E\u304F\u3053\u3068\u306F\u3067\u304D\u306A\u3044)\u3002\u3053\u3053\u3067\u306F\u300C\u3042\u308B1\u3064\u306E\u300D\u306A\u306E\u3067 " + t + (t === "an" ? "(\u6BCD\u97F3\u3067\u59CB\u307E\u308B\u306E\u3067 a \u3067\u306F\u306A\u304F an)" : "") + "\u3002";
    if (t === "the") return "\u300C" + nw + "\u300D\u306E\u524D\u306B\u51A0\u8A5E\u304C\u5FC5\u8981\u3002" + (/^(place|time)$/.test(cat2) ? nw + " \u306E\u3088\u3046\u306A\u5834\u6240\u30FB\u6642\u9593\u5E2F\u306F\u300C\u3044\u3064\u3082\u306E\u30FB\u305D\u306E\u300D\u3068\u6C7A\u307E\u3063\u305F\u3082\u306E\u306A\u306E\u3067 the \u3092\u4ED8\u3051\u308B\u3002" : "\u8A71\u306E\u4E2D\u3067\u300C\u3069\u308C\u306E\u3053\u3068\u304B\u300D\u6C7A\u307E\u3063\u3066\u3044\u308B\u3082\u306E\u306B\u306F the \u3092\u4ED8\u3051\u308B\u3002");
    if (/^(in|on|at|to)$/.test(t)) return "\u300C" + nw + "\u300D\u3092" + (cat2 === "time" ? "\u300C\u3044\u3064\u300D" : "\u300C\u3069\u3053\u3067\u30FB\u3069\u3053\u3078\u300D") + "\u3068\u3057\u3066\u4F7F\u3046\u306B\u306F\u3001\u524D\u306B\u524D\u7F6E\u8A5E\u304C\u5FC5\u8981\u3002\u524D\u7F6E\u8A5E\u304C\u306A\u3044\u3068\u3001" + nw + " \u304C\u52D5\u8A5E\u306E\u300C\u4F55\u3092\u300D(\u76EE\u7684\u8A9E)\u306E\u3088\u3046\u306B\u8AAD\u307E\u308C\u3066\u3057\u307E\u3046\u3002" + (t === "on" ? "\u66DC\u65E5\u30FB\u65E5\u4ED8\u306F on\u3002" : t === "at" ? cat2 === "time" ? "\u6642\u523B\u306A\u3069\u300C\u6642\u306E1\u70B9\u300D\u306F at\u3002" : "\u99C5\u306A\u3069\u300C\u5730\u70B9\u300D\u306F at\u3002" : t === "to" ? "\u79FB\u52D5\u306E\u52D5\u8A5E(go \u306A\u3069)\u306E\u884C\u304D\u5148\u306F to\u3002" : cat2 === "time" ? "\u671D\u30FB\u5348\u5F8C\u30FB\u6708\u306A\u3069\u300C\u5E45\u306E\u3042\u308B\u6642\u9593\u300D\u306F in\u3002" : "\u516C\u5712\u30FB\u753A\u306A\u3069\u300C\u5E83\u304C\u308A\u306E\u3042\u308B\u5834\u6240\u306E\u4E2D\u300D\u306F in\u3002");
    if (/^(am|is|are|was|were)$/.test(t)) return "\u82F1\u8A9E\u306E\u6587\u306B\u306F\u52D5\u8A5E\u304C\u304B\u306A\u3089\u305A1\u3064\u5FC5\u8981\u3002\u5F62\u5BB9\u8A5E(happy \u306A\u3069)\u306F\u52D5\u8A5E\u3067\u306F\u306A\u3044\u306E\u3067\u3001\u4E3B\u8A9E\u3068\u3064\u306A\u3050 be\u52D5\u8A5E\u3092\u5165\u308C\u308B\u3002\u4E3B\u8A9E\u306B\u5408\u308F\u305B\u3066 " + t + "(I \u2192 am\u3001he\u30FBshe \u2192 is\u3001you\u30FB\u8907\u6570 \u2192 are\u3001\u904E\u53BB\u306F was / were)\u3002";
    if (t === "will") return "tomorrow \u306A\u3069\u300C\u3053\u308C\u304B\u3089\u5148\u300D\u306E\u6642\u306E\u8A00\u8449\u304C\u3042\u308B\u306E\u3067\u3001\u672A\u6765\u3092\u8868\u3059\u52A9\u52D5\u8A5E will(\u301C\u3059\u308B\u3060\u308D\u3046\u30FB\u301C\u3059\u308B\u3064\u3082\u308A)\u3092\u52D5\u8A5E\u306E\u524D\u306B\u88DC\u3063\u305F\u3002will \u306E\u3046\u3057\u308D\u306E\u52D5\u8A5E\u306F\u539F\u5F62(\u5143\u306E\u5F62)\u3002";
    if (/^(do|does|did)$/.test(t)) return "\u3075\u3064\u3046\u306E\u52D5\u8A5E\u3092 not \u3067\u6253\u3061\u6D88\u3059\u3068\u304D\u306F\u3001\u52D5\u8A5E\u306E\u524D\u306B do / does / did \u304C\u5FC5\u8981\u3002\u4E3B\u8A9E\u304C he\u30FBshe \u306A\u3089 does\u3001\u904E\u53BB\u306A\u3089 did\u3002";
    return "\u6587\u3092\u3064\u306A\u3050\u305F\u3081\u306B\u300C" + x.t + "\u300D\u304C\u5FC5\u8981\u3002";
  }
  function formWhy(c, x, R0) {
    var k = c.w.k, t = x.t.toLowerCase(), base = cardText(c).toLowerCase(), row = R0.row;
    if (k === "v") {
      var e = c.w.e, b = first(vtext(e, "base")), w0 = first(t), pa = first(vtext(e, "past"));
      var timeW = row.filter(function(z) {
        return z.w.k === "adv" && z.w.e.k === "time";
      }).map(function(z) {
        return z.w.e.w;
      })[0];
      if (w0 === pa && w0 !== b) return (timeW ? "\u300C" + timeW + "\u300D\u304C\u3042\u308B\u306E\u3067\u904E\u53BB\u306E\u3053\u3068\u3002" : "\u904E\u53BB\u306E\u3053\u3068\u306A\u306E\u3067\u3001") + "\u52D5\u8A5E\u3092\u904E\u53BB\u5F62\u306B\u3059\u308B:" + b + " \u2192 " + w0 + "\u3002\u82F1\u8A9E\u306F\u300C\u301C\u3057\u305F\u300D\u3092\u52D5\u8A5E\u306E\u5F62\u3067\u8868\u3059\u3002";
      if (w0 === first(vtext(e, "ing"))) return "be\u52D5\u8A5E\u306E\u3042\u3068\u306F -ing \u5F62\u3067\u300C\u301C\u3057\u3066\u3044\u308B\u3068\u3053\u308D\u300D(\u9032\u884C\u5F62)\u3002";
      if (w0 === first(vtext(e, "pp"))) return "have / be \u306E\u3042\u3068\u306F\u904E\u53BB\u5206\u8A5E(\u5B8C\u4E86\u5F62\u30FB\u53D7\u3051\u8EAB)\u3002";
      var subj = row.filter(function(z) {
        return z.w.k === "pr" || z.w.k === "n";
      })[0];
      return "\u4E3B\u8A9E\u300C" + (subj ? cardText(subj) : "") + "\u300D\u306F\u81EA\u5206\u30FB\u76F8\u624B\u4EE5\u5916\u306E1\u4EBA(1\u3064)\u3067\u3001\u4ECA\u306E\u3053\u3068\u3002\u3053\u306E\u3068\u304D\u52D5\u8A5E\u306B -s \u3092\u4ED8\u3051\u308B(\u4E09\u4EBA\u79F0\u5358\u6570\u73FE\u5728):" + b + " \u2192 " + w0 + "\u3002";
    }
    if (k === "pr") return "\u300C" + base + "\u300D\u306F\u52D5\u8A5E(\u307E\u305F\u306F\u524D\u7F6E\u8A5E)\u306E\u3046\u3057\u308D\u306B\u3042\u308B\u306E\u3067\u3001\u300C\u301C\u3092\u30FB\u301C\u306B\u300D\u306E\u5F62\u306B\u3059\u308B:" + base + " \u2192 " + t + "\u3002";
    if (k === "be") return "be\u52D5\u8A5E\u306F\u4E3B\u8A9E\u3068\u6642\u306B\u5408\u308F\u305B\u3066\u5F62\u304C\u6C7A\u307E\u308B:I am / he\u30FBshe is / you\u30FB\u8907\u6570 are / \u904E\u53BB\u306F was\u30FBwere\u3002\u3053\u3053\u3067\u306F " + t + "\u3002";
    if (k === "hv") return "\u4E3B\u8A9E\u304C he / she / 1\u3064\u306A\u3089 has\u3001\u904E\u53BB\u306A\u3089 had \u306B\u3059\u308B\u3002";
    return "\u5F62\u3092\u76F4\u3057\u305F\u3002";
  }
  function showImprove(R0, imps) {
    return new Promise(function(done) {
      var o = el("div", "modal");
      root.appendChild(o);
      var i = 0, seq = R0.seq;
      var mine = R0.row.map(cardText).join(" ");
      function sent(hk) {
        return seq.map(function(x, k) {
          var t = k === 0 ? x.t.charAt(0).toUpperCase() + x.t.slice(1) : x.t, im = imps.some(function(m) {
            return m.k === k;
          });
          return '<span class="st' + (im ? " im" : "") + (k === hk ? " hi" : "") + '">' + t + "</span>";
        }).join(" ") + ".";
      }
      function page() {
        var m = imps[i];
        o.innerHTML = '<div class="box rv imp"><h2>\u270F\uFE0F \u3053\u3053\u3092\u76F4\u3057\u305F\u3088 ' + (i + 1) + " / " + imps.length + '</h2><div class="cmp"><div><small>\u3042\u306A\u305F\u306E\u4E26\u3079\u65B9</small><p>' + mine + "</p></div><div><small>\u6B63\u3057\u3044\u6587</small><p>" + sent(m.k) + '</p></div></div><div class="big"><b>' + (m.kind === "form" ? m.from + " \u2192 " + m.w : "+ " + m.w) + "</b><span>" + m.pos + (m.kind === "miss" ? "\u30FB\u7F6E\u304D\u5FD8\u308C" : "\u30FB\u5F62\u306E\u76F4\u3057") + '</span></div><p class="lead">' + m.why + '</p><div class="rvb"><button class="btn ghost small" id="sk">\u3068\u3070\u3059</button><button class="btn go" id="nx">' + (i + 1 < imps.length ? "\u3064\u304E\u3078" : "\u308F\u304B\u3063\u305F") + "</button></div></div>";
        $("#nx", o).onclick = function() {
          SFX.tap();
          i++;
          if (i >= imps.length) {
            o.remove();
            done();
          } else page();
        };
        $("#sk", o).onclick = function() {
          o.remove();
          done();
        };
      }
      page();
    });
  }
  function askFull() {
    return new Promise(function(done) {
      var o = el("div", "modal", '<div class="box rv"><h2>\u{1F4D6} \u6587\u5168\u4F53\u306E\u89E3\u8AAC</h2><p class="lead">\u3053\u306E\u6587\u3092\u30C1\u30E3\u30F3\u30AF\u306B\u5206\u3051\u3066\u30011\u8A9E\u305A\u3064\u54C1\u8A5E\u3068\u50CD\u304D\u3092\u898B\u3066\u3044\u304F?</p><div class="rvb"><button class="btn ghost small" id="n">\u4ECA\u56DE\u306F\u898B\u306A\u3044</button><button class="btn go" id="y">\u898B\u308B</button></div></div>');
      root.appendChild(o);
      $("#y", o).onclick = function() {
        o.remove();
        done(true);
      };
      $("#n", o).onclick = function() {
        o.remove();
        done(false);
      };
    });
  }
  async function reviewFlow(R0, noAsk) {
    var imps = improvements(R0);
    if (imps.length) await showImprove(R0, imps);
    if (noAsk || await askFull()) await showReview(R0);
  }
  async function reviewAfter(R0) {
    if (LEVEL < 2) return reviewFlow(R0);
    var imps = improvements(R0);
    var yes = await new Promise(function(done) {
      var o = el("div", "modal", '<div class="box rv"><h2>\u{1F4D6} \u3053\u306E\u6587\u306E\u89E3\u8AAC</h2><p class="lead">' + (imps.length ? "\u76F4\u3057\u305F\u6240\u304C " + imps.length + " \u304B\u6240\u3042\u308B\u3002" : "") + '\u89E3\u8AAC\u3092\u898B\u308B?</p><div class="rvb"><button class="btn ghost small" id="n">\u898B\u306A\u3044</button><button class="btn go" id="y">\u898B\u308B</button></div></div>');
      root.appendChild(o);
      $("#y", o).onclick = function() {
        o.remove();
        done(true);
      };
      $("#n", o).onclick = function() {
        o.remove();
        done(false);
      };
    });
    if (yes) {
      if (imps.length) await showImprove(R0, imps);
      await showReview(R0);
    }
  }
  function snap(row) {
    return row.map(function(c) {
      var n = {};
      for (var k in c) n[k] = c[k];
      n.w = {};
      for (var j in c.w) n.w[j] = c.w[j];
      return n;
    });
  }
  function recordHist(list, row, ev, score) {
    if (ev && ev.state === "ok") list.push({ row: snap(row), text: ev.text, score, lv: LEVEL });
  }
  function histModal(list) {
    var o = el("div", "modal", '<div class="box rv"><h2>\u{1F4DA} \u4ECA\u56DE\u306E\u6587\u3092\u3075\u308A\u304B\u3048\u308B</h2><p class="sm">\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u305D\u306E\u6587\u306E\u300C\u76F4\u3057\u305F\u6240\u300D\u3068\u5168\u4F53\u306E\u89E3\u8AAC\u304C\u898B\u3089\u308C\u308B\u3002</p><div class="hist" id="hl"></div><button class="btn go" id="ok">\u3068\u3058\u308B</button></div>');
    root.appendChild(o);
    list.forEach(function(h, i) {
      var e = el("div", "hi1", "<span>" + (i + 1) + "</span><b>" + h.text + "</b><i>" + (h.score != null ? h.score.toLocaleString() + "\u70B9" : "") + "</i>");
      e.onclick = async function() {
        var keep = LEVEL;
        setLevel(h.lv);
        var ev = evaluate(h.row), R0 = reviewItems(h.row, ev);
        if (R0) {
          o.style.display = "none";
          await reviewFlow(R0, true);
          o.style.display = "";
        } else flash("\u3053\u306E\u6587\u306F\u89E3\u8AAC\u3067\u304D\u306A\u3044");
        setLevel(keep);
      };
      $("#hl", o).appendChild(e);
    });
    $("#ok", o).onclick = function() {
      o.remove();
    };
  }
  function errMsg(ev, row) {
    var m = ev.msg || "", a = /語順|つながらない|まだ文/.test(m) ? advise(row) : "";
    return (ev.state === "bad" ? "\u2715 " : "\u2026 ") + m + (a ? " \u2192 " + a : "");
  }
  var drag = null;
  function gapAt(x, y, self) {
    var els = Array.prototype.filter.call(G_.row.querySelectorAll(".card"), function(n) {
      return n !== self;
    });
    if (!els.length) return { i: 0, el: null, after: false };
    var rs = els.map(function(n) {
      return n.getBoundingClientRect();
    });
    var line = rs.filter(function(r2) {
      return y >= r2.top - 10 && y <= r2.bottom + 10;
    });
    if (!line.length) {
      if (y < rs[0].top) return { i: +els[0].dataset.i, el: els[0], after: false };
      var lk = els.length - 1;
      return { i: R.row.length, el: els[lk], after: true };
    }
    for (var k = 0; k < els.length; k++) {
      var r = rs[k];
      if (y >= r.top - 10 && y <= r.bottom + 10 && x < r.left + r.width / 2) return { i: +els[k].dataset.i, el: els[k], after: false };
    }
    var lastIn = els[rs.indexOf(line[line.length - 1])];
    return { i: +lastIn.dataset.i + 1, el: lastIn, after: true };
  }
  function overRow(x, y) {
    var b = G_.row.getBoundingClientRect();
    return x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 14 && y <= b.bottom + 14;
  }
  function caret(g) {
    var c = G_.caret;
    if (!g) {
      if (c) c.style.display = "none";
      return;
    }
    if (!c) {
      c = G_.caret = el("div", "caret");
    }
    if (c.parentNode !== G_.row) G_.row.appendChild(c);
    var rb = G_.row.getBoundingClientRect();
    c.style.display = "block";
    if (!g.el) {
      c.style.left = "4px";
      c.style.top = "2px";
      c.style.height = "70px";
      return;
    }
    var r = g.el.getBoundingClientRect();
    c.style.left = (g.after ? r.right + 1 : r.left - 4) - rb.left + "px";
    c.style.top = r.top - rb.top + "px";
    c.style.height = r.height + "px";
  }
  function cardPress(ev, c, e, from, spec) {
    if (G_.busy) return;
    var d = drag = { c, e, from, spec, x: ev.clientX, y: ev.clientY, t: Date.now(), moved: false, ghost: null };
    e.setPointerCapture && e.setPointerCapture(ev.pointerId);
    e.onpointermove = function(m) {
      if (drag !== d) return;
      var dx = m.clientX - d.x, dy = m.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 8) {
        d.moved = true;
        if (from === "row") e.classList.add("drag");
        else {
          d.ghost = e.cloneNode(true);
          d.ghost.classList.add("ghost");
          var r = e.getBoundingClientRect(), rr = root.getBoundingClientRect();
          d.ghost.style.left = r.left - rr.left + "px";
          d.ghost.style.top = r.top - rr.top + "px";
          root.appendChild(d.ghost);
          e.style.opacity = 0.35;
        }
      }
      if (!d.moved) return;
      var tf = "translate(" + dx + "px," + (dy - 46) + "px) scale(1.08)";
      if (from === "row") e.style.transform = tf;
      else d.ghost.style.transform = tf;
      if (G_.mode === "play" && overRow(m.clientX, m.clientY)) caret(gapAt(m.clientX, m.clientY, from === "row" ? e : null));
      else caret(null);
    };
    e.onpointerup = e.onpointercancel = function(u) {
      if (drag !== d) return;
      drag = null;
      e.onpointermove = e.onpointerup = e.onpointercancel = null;
      caret(null);
      if (d.ghost) d.ghost.remove();
      e.style.opacity = "";
      e.style.transform = "";
      e.classList.remove("drag");
      var dx = u.clientX - d.x, dy = u.clientY - d.y, dt = Date.now() - d.t, flickUp = dy < -35 && Math.abs(dy) > Math.abs(dx) * 1.2 && dt < 350, flickDown = dy > 35 && Math.abs(dy) > Math.abs(dx) * 1.2 && dt < 350;
      if (!d.moved) return tapCard(c, from, spec);
      if (G_.mode !== "play") {
        if (from === "hand") tapCard(c, from, spec);
        return;
      }
      var into = overRow(u.clientX, u.clientY);
      if (from === "row") {
        if (into) {
          var g = gapAt(u.clientX, u.clientY, e), fi = R.row.indexOf(c), to = g.i;
          R.row.splice(fi, 1);
          if (to > fi) to--;
          R.row.splice(Math.max(0, Math.min(R.row.length, to)), 0, c);
          SFX.put();
          renderRow();
          return;
        }
        if (flickDown || u.clientY > G_.row.getBoundingClientRect().bottom + 20) {
          R.row.splice(R.row.indexOf(c), 1);
          if (!c.tsu) R.hand.push(c);
          SFX.tap();
          renderRow();
          renderHand();
          return;
        }
        renderRow();
        return;
      }
      var nc = from === "tsu" ? tsuCard(spec) : c;
      if (into) {
        var g2 = gapAt(u.clientX, u.clientY, null);
        if (from === "hand") R.hand.splice(R.hand.indexOf(c), 1);
        R.row.splice(Math.max(0, Math.min(R.row.length, g2.i)), 0, nc);
        SFX.put();
        renderRow();
        renderHand();
        return;
      }
      if (flickUp) {
        if (from === "hand") R.hand.splice(R.hand.indexOf(c), 1);
        R.row.push(nc);
        SFX.put();
        renderRow();
        renderHand();
        return;
      }
    };
  }
  function tapCard(c, from, spec) {
    if (G_.busy) return;
    if (from === "row") {
      if (cyclable(c)) {
        cycle(c);
        SFX.tap();
        renderRow();
        renderHand();
      }
      return;
    }
    if (from === "tsu") {
      SFX.put();
      R.row.push(tsuCard(spec));
      renderRow();
      return;
    }
    if (G_.mode === "disc") {
      var k = G_.mark.indexOf(c);
      if (k >= 0) G_.mark.splice(k, 1);
      else G_.mark.push(c);
      SFX.tap();
      renderHand();
      renderBtns();
      return;
    }
    if (G_.mode === "refill") {
      flash("\u5148\u306B\u88DC\u5145\u3057\u3088\u3046(\u5C71\u304B\u3089\u5F15\u304F/\u5834\u304B\u3089\u53D6\u308B)");
      return;
    }
    SFX.put();
    R.hand.splice(R.hand.indexOf(c), 1);
    R.row.push(c);
    renderRow();
    renderHand();
  }
  var cur = null;
  function updatePreview() {
    var ev = cur = evaluate(R.row);
    hintPanel();
    if (G_.jt) G_.jt.textContent = ev.state === "ok" && ev.ja ? ev.ja : "";
    if (G_.vs) return G_.vs.preview(ev);
    G_.sent.className = "sent " + ev.state;
    G_.msg.textContent = "";
    if (ev.state === "empty") {
      G_.sent.textContent = "";
      G_.yk.textContent = "";
      G_.ch.textContent = "0";
      G_.ml.textContent = "0";
      if (G_.bp) G_.bp.disabled = true;
      return;
    }
    if (ev.state === "ok") {
      var ctx = { first: R.first, last: R.hands === 1 }, sc = scoreOf(ev, ctx), y = sc.y;
      G_.sent.textContent = ev.text;
      G_.yk.textContent = "\u5F79:" + y.name + "(" + ev.f.words + "\u8A9E)";
      G_.ch.textContent = sc.chips;
      G_.ml.textContent = sc.mult;
      G_.msg.innerHTML = notes(ev.f, sc.rep);
      if (sc.bossFail) G_.msg.textContent = "\u{1F479} " + R.boss.text;
      if (G_.bp) G_.bp.disabled = G_.mode !== "play";
    } else {
      G_.sent.textContent = rowText(R.row);
      G_.yk.textContent = "";
      G_.ch.textContent = "\u2013";
      G_.ml.textContent = "\u2013";
      G_.msg.textContent = errMsg(ev, R.row);
      if (G_.bp) G_.bp.disabled = true;
    }
  }
  function renderField() {
    G_.fd.innerHTML = "";
    G_.pt.textContent = R.pts;
    if (!R.field.length) G_.fd.appendChild(el("div", "ph", "\u307E\u3060\u4F55\u3082\u6368\u3066\u3066\u3044\u306A\u3044"));
    R.field.forEach(function(c) {
      var e = cardEl(c, "field", 0), cost = c.chips + c.bonus, can = G_.mode === "refill" && R.pts >= cost;
      e.classList.add("mini");
      if (G_.mode === "refill") e.classList.add(can ? "can" : "cant");
      e.onclick = function() {
        if (G_.mode !== "refill") {
          flash("\u6368\u3066\u305F\u3042\u3068\u306E\u88DC\u5145\u3067\u3001" + cost + "pt \u6255\u3046\u3068\u53D6\u308C\u308B");
          return;
        }
        if (!Core.take(c)) {
          SFX.bad();
          flash("\u6368\u3066\u672Dpt\u304C\u8DB3\u308A\u306A\u3044(" + cost + "pt \u5FC5\u8981)");
          return;
        }
        SFX.coin();
        afterRefill();
      };
      G_.fd.appendChild(e);
    });
    G_.fh.textContent = G_.mode === "refill" ? "\u3042\u3068 " + R.refill + " \u679A:\u5C71\u304B\u3089\u5F15\u304F \u304B\u3001\u5834\u306E\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3057\u3066\u53D6\u308B" : "";
  }
  function renderBtns() {
    if (G_.vs) return G_.vs.btns();
    G_.bt.innerHTML = "";
    var b = function(cls, txt, fn, dis) {
      var x = el("button", "btn " + cls, txt);
      x.onclick = fn;
      x.disabled = !!dis;
      G_.bt.appendChild(x);
      return x;
    };
    if (G_.mode === "disc") {
      b("ghost", "\u3084\u3081\u308B", function() {
        G_.mode = "play";
        G_.mark = [];
        SFX.tap();
        renderAll();
      });
      b("disc", G_.mark.length ? G_.mark.length + "\u679A \u6368\u3066\u308B" : "\u6368\u3066\u308B\u30AB\u30FC\u30C9\u3092\u3048\u3089\u3076", doDiscard, !G_.mark.length);
      return;
    }
    if (G_.mode === "refill") {
      b("ghost", "\u5C71\u304B\u3089\u5F15\u304F(\u3042\u3068" + R.refill + ")", function() {
        Core.drawOne();
        SFX.put();
        afterRefill();
      });
      b("go", "\u305C\u3093\u3076\u5C71\u304B\u3089", function() {
        while (R.refill > 0) Core.drawOne();
        SFX.put();
        afterRefill();
      });
      return;
    }
    G_.bd = b("disc", "\u6368\u3066\u308B", function() {
      if (!R.discards) {
        flash("\u3053\u306E\u30B9\u30C6\u30FC\u30B8\u3067\u306F\u3082\u3046\u6368\u3066\u3089\u308C\u306A\u3044");
        return;
      }
      G_.mode = "disc";
      G_.mark = [];
      SFX.tap();
      renderAll();
    }, !R.discards || G_.busy);
    G_.bp = b("play", "\u51FA\u3059!", play, !cur || cur.state !== "ok" || G_.busy);
    G_.bp.id = "bp";
    G_.bd.id = "bd";
  }
  function doDiscard() {
    if (!G_.mark.length) return;
    Core.discard(G_.mark.slice());
    G_.mark = [];
    G_.mode = "refill";
    SFX.tap();
    renderAll();
  }
  function afterRefill() {
    if (R.refill <= 0) G_.mode = "play";
    renderAll();
  }
  function wait(ms) {
    return new Promise(function(r) {
      setTimeout(r, ms);
    });
  }
  function bump(n) {
    n.classList.remove("bump");
    void n.offsetWidth;
    n.classList.add("bump");
  }
  async function play() {
    if (G_.busy || !cur || cur.state !== "ok" || G_.mode !== "play") return;
    G_.busy = true;
    renderBtns();
    var ctx = { first: R.first, last: R.hands === 1 }, sc = scoreOf(cur, ctx), text = cur.text;
    speak(text);
    R.first = false;
    R.hands--;
    R.played++;
    renderTop();
    var cards = G_.row.querySelectorAll(".card"), jks = G_.jk.querySelectorAll(".joker");
    for (var k = 0; k < sc.steps.length; k++) {
      var st = sc.steps[k];
      if (st.t === "yaku") {
        G_.yk.textContent = "\u5F79:" + st.label;
        bump(G_.yk);
        SFX.mult(0);
        await wait(380);
      }
      if (st.t === "card") {
        var ce = cards[st.i];
        if (ce) {
          ce.classList.add("hit");
          floatTxt(ce, "+" + st.add + (st.tag ? " " + st.tag : ""), "c");
        }
        SFX.chip(k);
        await wait(150);
      }
      if (st.t === "note") {
        floatTxt(G_.yk, st.txt, "x");
        SFX.bad();
        await wait(500);
      }
      if (st.t === "joker") {
        var je = jks[st.ji];
        if (je) {
          bump(je);
          floatTxt(je, st.txt, /×/.test(st.txt) ? "x" : /倍/.test(st.txt) ? "m" : "c");
        }
        SFX.joker();
        await wait(420);
      }
      G_.ch.textContent = st.chips;
      G_.ml.textContent = st.mult;
      bump(G_.ch);
      bump(G_.ml);
    }
    if (sc.bossFail) {
      G_.msg.textContent = "\u{1F479} \u30DC\u30B9\u306E\u6761\u4EF6\u3092\u6E80\u305F\u3057\u3066\u3044\u306A\u3044\u2026 0\u70B9";
      SFX.bad();
      await wait(900);
    }
    var total = sc.total;
    await countUp(total);
    clearTimeout(G_.idleT);
    recordHist(R.hist = R.hist || [], R.row, cur, total);
    var rv = reviewItems(R.row, cur);
    if (rv) await reviewAfter(rv);
    if (total > R.best.pts) R.best = { text, pts: total };
    R.total += total;
    afterPlay(cur, sc);
    R.hintLv = 0;
    G_.hintBest = null;
    G_.hintIds = {};
    R.disc = R.disc.concat(R.row.filter(function(c) {
      return !c.tsu;
    }));
    R.row = [];
    await wait(350);
    deal();
    G_.busy = false;
    if (R.score >= R.target) {
      stageClear();
      return;
    }
    if (R.hands <= 0) {
      finalReveal();
      return;
    }
    renderAll();
  }
  function afterPlay(ev, sc) {
    R.yakuCnt[sc.y.name] = (R.yakuCnt[sc.y.name] || 0) + 1;
    R.prev = ev.nps;
    R.stageF.push(ev.f);
    var got = [];
    R.missions.forEach(function(x) {
      if (!x.done && missionHit(x.m, ev.f)) {
        x.done = true;
        var g = x.m.tier + 1;
        R.money += g;
        got.push("\u{1F3AF}\u300C" + x.m.label + "\u300D\u9054\u6210 \u{1F4B0}+" + g);
      }
    });
    if (got.length && R.missions.every(function(x) {
      return x.done;
    })) {
      R.money += 3;
      got.push("\u{1F3AF} \u304A\u984C\u305C\u3093\u3076\u9054\u6210! \u{1F4B0}+3");
    }
    got.forEach(function(t, i) {
      setTimeout(function() {
        flash(t);
        SFX.coin();
        renderTop();
      }, 300 + i * 1900);
    });
    if (ev.f.colloc === "good" && addCombo(ev.f.pair)) {
      R.money++;
      flash("\u{1F4D6} \u540D\u30B3\u30F3\u30D3\u56F3\u9451\u306B\u767B\u9332!\u300C" + ev.f.pair + "\u300D\u{1F4B0}+1");
    }
    R.row.forEach(function(c) {
      if (c.guest) {
        c.guest = false;
        c.scout = true;
        R.deck.push(c);
        setTimeout(function() {
          flash("\u2B50 \u30B9\u30AB\u30A6\u30C8!\u300C" + cardText(c) + "\u300D\u304C\u5C71\u672D\u306B\u5165\u3063\u305F");
        }, 900);
      }
    });
  }
  function addCombo(pair) {
    var l = store.get("combos") || [];
    if (l.indexOf(pair) >= 0) return false;
    l.push(pair);
    store.set("combos", l);
    return true;
  }
  var QUESTS = [
    ["past", "\u904E\u53BB\u5F62", 0],
    ["neg", "\u5426\u5B9A(not)", 0],
    ["place", "\u5834\u6240\u306E\u53E5", 0],
    ["time", "\u6642\u306E\u53E5", 0],
    ["adj", "\u5F62\u5BB9\u8A5E", 0],
    ["O", "\u76EE\u7684\u8A9E", 0],
    ["prog", "\u9032\u884C\u5F62", 1],
    ["aux", "\u52A9\u52D5\u8A5E", 1],
    ["clause", "because / when / if", 1],
    ["C", "\u88DC\u8A9E(be + \u5F62\u5BB9\u8A5E\u306A\u3069)", 1],
    ["story", "\u8A71\u306E\u3064\u306A\u304C\u308A", 1],
    ["combo", "\u540D\u30B3\u30F3\u30D3", 1],
    ["perfect", "\u5B8C\u4E86\u5F62", 2],
    ["passive", "\u53D7\u3051\u8EAB", 2],
    ["post", "\u5F8C\u7F6E\u4FEE\u98FE", 2],
    ["phrasal", "\u53E5\u52D5\u8A5E", 2],
    ["gerund", "\u52D5\u540D\u8A5E", 2],
    ["padj", "\u5206\u8A5E\u306E\u5F62\u5BB9\u8A5E", 2]
  ].map(function(q) {
    return { k: q[0], label: q[1], tier: q[2] };
  });
  var MISSIONS = [
    ["food", "\u98DF\u3079\u7269\u304B\u98F2\u307F\u7269\u306E\u540D\u8A5E\u3092\u4F7F\u3046", 0, function(f) {
      return f.cats.food || f.cats.drink;
    }],
    ["animal", "\u52D5\u7269\u306E\u540D\u8A5E\u3092\u4F7F\u3046", 0, function(f) {
      return f.cats.animal;
    }],
    ["placeN", "\u5834\u6240\u306E\u540D\u8A5E\u3092\u4F7F\u3046", 0, function(f) {
      return f.cats.place;
    }],
    ["art2", "a \u3068 the \u3092\u4E21\u65B9\u4F7F\u3046", 0, function(f) {
      return f.det_a && f.det_the;
    }],
    ["len6", "6\u8A9E\u4EE5\u4E0A\u306E\u6587", 0, function(f) {
      return f.words >= 6;
    }],
    ["len4", "\u3061\u3087\u3046\u30694\u8A9E\u306E\u6587", 1, function(f) {
      return f.words === 4;
    }],
    ["nounSubj", "\u4E3B\u8A9E\u3092\u4EE3\u540D\u8A5E\u4EE5\u5916\u306B\u3059\u308B", 1, function(f) {
      return !f.pronSubj;
    }],
    ["pastProg", "\u904E\u53BB\u9032\u884C\u5F62(was/were + -ing)", 1, function(f) {
      return f.past && f.prog;
    }],
    ["this", "this / that \u3092\u4F7F\u3046", 1, function(f) {
      return f.det_this || f.det_that;
    }],
    ["adj2", "\u5F62\u5BB9\u8A5E\u30922\u3064\u4F7F\u3046", 1, function(f) {
      return f.adj >= 2;
    }],
    ["plural", "\u540D\u8A5E\u306E\u8907\u6570\u5F62\u3092\u4F7F\u3046", 1, function(f) {
      return f.plural;
    }],
    ["rare2", "\u3080\u305A\u304B\u3057\u3044\u8A9E\u30922\u679A\u4F7F\u3046", 2, function(f) {
      return f.rare >= 2;
    }],
    ["guest", "\u91D1\u67A0\u306E\u30B2\u30B9\u30C8\u30AB\u30FC\u30C9\u3092\u4F7F\u3046", 2, function(f) {
      return f.guest;
    }],
    ["len8", "8\u8A9E\u4EE5\u4E0A\u306E\u6587", 2, function(f) {
      return f.words >= 8;
    }],
    ["it", "it \u3092\u4F7F\u3046", 2, function(f) {
      return f.it;
    }],
    ["opt", "\u76EE\u7684\u8A9E+\u5834\u6240+\u6642 \u30921\u6587\u306B", 2, function(f) {
      return f.O && f.place && f.time;
    }]
  ].map(function(m) {
    return { k: m[0], label: m[1], tier: m[2], t: m[3] };
  });
  function pickMissions(used, n) {
    var tiers = n === 1 ? [Math.floor(rnd() * 3)] : [0, 1, 2];
    return tiers.map(function(t) {
      var pool = MISSIONS.filter(function(m2) {
        return m2.tier === t && used.indexOf(m2.k) < 0;
      });
      if (!pool.length) {
        pool = MISSIONS.filter(function(m2) {
          return m2.tier === t;
        });
      }
      var m = pick(pool);
      used.push(m.k);
      return { m, done: false };
    });
  }
  function missionHit(m, f) {
    try {
      if (m.t(f)) return true;
      if (!f.sub) return false;
      var g = {};
      for (var k in f) g[k] = f[k];
      for (var j in f.sub) g[j] = true;
      return !!m.t(g);
    } catch (e) {
      return false;
    }
  }
  var Q_PCT = [10, 20, 30];
  var TIER_JA = ["\u3084\u3055\u3057\u3044", "\u3075\u3064\u3046", "\u3080\u305A\u304B\u3057\u3044"];
  function questHit(q, f) {
    return q.k === "story" ? !!(f.story || f.storyP) : q.k === "adj" ? f.adj > 0 : !!(f[q.k] || f.sub && f.sub[q.k]);
  }
  function pickQuest(used) {
    var cands = [0, 1, 2].map(function(t) {
      var pool = QUESTS.filter(function(q) {
        return q.tier === t && used.indexOf(q.k) < 0;
      });
      if (!pool.length) pool = QUESTS.filter(function(q) {
        return q.tier === t;
      });
      return pick(pool);
    });
    var secret = pick(cands);
    used.push(secret.k);
    return { cands, secret };
  }
  function questBar(Q, fs) {
    return "\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u304A\u984C(\u3053\u306E\u3046\u3061\u3069\u308C\u304B1\u3064):" + Q.cands.map(function(q) {
      var hit = fs.some(function(f) {
        return questHit(q, f);
      });
      return '<span class="qc t' + q.tier + (hit ? " hit" : "") + '">' + (hit ? "\u2714 " : "") + q.label + "</span>";
    }).join("");
  }
  async function finalReveal() {
    var Q = R.quest, hit = R.stageF.some(function(f) {
      return questHit(Q.secret, f);
    }), bonus = hit ? Math.round(R.target * Q_PCT[Q.secret.tier] / 100) : 0;
    var o = el("div", "modal", '<div class="box"><h2>\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u304A\u984C\u306F\u2026</h2><div class="qrev t' + Q.secret.tier + '">' + Q.secret.label + '</div><p class="res ' + (hit ? "w" : "l") + '">' + (hit ? "\u9054\u6210! \u76EE\u6A19\u306E" + Q_PCT[Q.secret.tier] + "% = +" + bonus + "\u70B9" : "\u51FA\u3057\u3066\u3044\u306A\u304B\u3063\u305F\u2026") + '</p><button class="btn go" id="ok">\u3064\u3065\u3051\u308B</button></div>');
    root.appendChild(o);
    if (hit) SFX.win();
    else SFX.bad();
    await new Promise(function(r) {
      $("#ok", o).onclick = r;
    });
    o.remove();
    R.questDone = true;
    if (hit) {
      await countUp(bonus);
      R.total += bonus;
    }
    if (R.score >= R.target) {
      flash("\u{1F389} \u9006\u8EE2\u30AF\u30EA\u30A2!");
      stageClear();
    } else gameOver();
  }
  function floatTxt(target, txt, kind) {
    var r = target.getBoundingClientRect(), rr = root.getBoundingClientRect(), f = el("div", "float " + kind, txt);
    f.style.left = r.left - rr.left + r.width / 2 + "px";
    f.style.top = r.top - rr.top + "px";
    root.appendChild(f);
    setTimeout(function() {
      f.remove();
    }, 900);
  }
  async function countUp(total) {
    var from = R.score, to = R.score + total, big = el("div", "bigscore", "0");
    root.appendChild(big);
    var steps = 18;
    for (var i = 1; i <= steps; i++) {
      big.textContent = Math.round(total * i / steps).toLocaleString();
      R.score = Math.round(from + (to - from) * i / steps);
      renderTop();
      if (i % 3 === 0) SFX.coin();
      await wait(28);
    }
    R.score = to;
    renderTop();
    await wait(500);
    big.remove();
  }
  function interestCap() {
    return R.jokers.some(function(j) {
      return j.id === "bank";
    }) ? 10 : 5;
  }
  function stageClear() {
    SFX.win();
    var base = R.boss ? 5 : 3, left = R.hands, interest = Math.min(interestCap(), Math.floor(R.money / 5)), one = R.handsMax - R.hands === 1 ? 5 : 0, dl = R.discards;
    var Q = R.quest, qhit = !R.questDone && R.stageF.some(function(f) {
      return questHit(Q.secret, f);
    }), qm = qhit ? [2, 3, 4][Q.secret.tier] : 0;
    var gain = base + left + interest + one + dl + qm;
    R.money += gain;
    saveBest(R.stage + 1);
    if (R.stage >= 7) {
      showEnd(true);
      return;
    }
    var s = screen('<div class="clear"><h1>\u30B9\u30C6\u30FC\u30B8 ' + (R.stage + 1) + ' \u30AF\u30EA\u30A2!</h1><div class="pay"><div>\u30AF\u30EA\u30A2\u5831\u916C<b>+' + base + "</b></div><div>\u6B8B\u308A\u306E\u300C\u51FA\u3059\u300D\xD7" + left + "<b>+" + left + "</b></div>" + (one ? "<div>\u26A1 \u4E00\u767A\u30AF\u30EA\u30A2<b>+5</b></div>" : "") + (dl ? "<div>\u4F7F\u308F\u306A\u304B\u3063\u305F\u300C\u6368\u3066\u308B\u300D\xD7" + dl + "<b>+" + dl + "</b></div>" : "") + (R.questDone ? "" : "<div>\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u300C" + Q.secret.label + "\u300D" + (qhit ? "\u9054\u6210" : "\u306A\u3089\u305A") + "<b>+" + qm + "</b></div>") + "<div>\u5229\u5B50(5\u3054\u3068\u306B1)<b>+" + interest + '</b></div></div><div class="money big">\u{1F4B0} ' + R.money + '</div><button class="btn go" id="sh">\u304A\u5E97\u3078</button></div>');
    $("#sh", s).onclick = function() {
      SFX.tap();
      R.stage++;
      R.rerollCost = 2;
      showShop(true);
    };
  }
  function saveBest(stage) {
    var b = store.get("best") || {};
    if (!b.stage || stage > b.stage || stage === b.stage && R.total > (b.total || 0)) store.set("best", { stage, total: R.total, text: R.best.text });
  }
  var shopItems = null;
  function rollShop() {
    var owned = R.jokers.map(function(j) {
      return j.id;
    }), pool = shuffle(JOKERS.filter(function(j) {
      return owned.indexOf(j.id) < 0;
    }));
    shopItems = [];
    pool.slice(0, 2).forEach(function(j) {
      shopItems.push({ t: "joker", j, price: j.price });
    });
    shopItems.push({ t: "pack", price: 4 });
    var keys = ["O", "place", "time", "past", "aux", "prog", "perfect", "manner", "C", "neg", "clause", "passive", "post", "phrasal", "gerund", "padj"], k = pick(keys);
    shopItems.push({ t: "book", key: k, price: 3 });
    shopItems.push(rnd() < 0.4 ? { t: "it", price: 5 } : { t: "boost", price: 3 });
  }
  function showShop(fresh) {
    if (fresh) rollShop();
    var s = screen('<div class="shop"><div class="shead"><h1>\u304A\u5E97</h1><div class="money">\u{1F4B0} <b>' + R.money + '</b></div></div><div class="next">\u3064\u304E:' + (BOSS_AT[R.stage] ? "\u{1F479} \u30DC\u30B9 " : "\u30B9\u30C6\u30FC\u30B8 ") + (R.stage + 1) + "(\u76EE\u6A19 " + TARGETS[R.stage].toLocaleString() + ')</div><div class="items" id="items"></div><div class="myj"><div class="lbl">\u6301\u3063\u3066\u3044\u308B\u30B8\u30E7\u30FC\u30AB\u30FC(\u30BF\u30C3\u30D7\u3067\u58F2\u308B)</div><div class="jokers" id="mj"></div></div><div class="sbtns"><button class="btn ghost" id="rr">\u5165\u308C\u304B\u3048 \u{1F4B0}' + R.rerollCost + '</button><button class="btn go" id="nx">\u3064\u304E\u3078</button></div></div>');
    var box = $("#items", s);
    shopItems.forEach(function(it, i) {
      if (!it) {
        box.appendChild(el("div", "item sold", "<span>\u58F2\u308A\u5207\u308C</span>"));
        return;
      }
      var face = it.t === "joker" ? '<div class="joker"><b>' + it.j.name + "</b><span>" + it.j.desc + "</span></div>" : it.t === "pack" ? '<div class="pack">\u5358\u8A9E<br>\u30D1\u30C3\u30AF</div>' : it.t === "book" ? '<div class="pack book">\u6587\u578B\u306E\u672C<br><small>' + PART_JA[it.key] + "</small></div>" : it.t === "it" ? '<div class="pack itp">it<br><small>\u4E07\u80FD</small></div>' : '<div class="pack boost">\u30AB\u30FC\u30C9<br>\u5F37\u5316</div>';
      var desc = it.t === "joker" ? "\u30B8\u30E7\u30FC\u30AB\u30FC(\u6700\u59275\u679A)" : it.t === "pack" ? "3\u679A\u306E\u4E2D\u304B\u30891\u679A\u3048\u3089\u3093\u3067\u5C71\u672D\u3078" : it.t === "book" ? "\u300C" + PART_JA[it.key] + "\u300D\u306E\u5165\u3063\u305F\u5F79\u304C \u30C1\u30C3\u30D7+10\u30FB\u500D\u7387+1(\u3044\u307ELv" + (R.lv[it.key] || 0) + ")" : it.t === "it" ? "\u4E07\u80FD\u30AB\u30FC\u30C9\u300Cit\u300D\u3092\u5C71\u672D\u3078\u3002\u3069\u306E\u52D5\u8A5E\u306E\u76EE\u7684\u8A9E\u306B\u3082\u5165\u308A\u3001\u4E3B\u8A9E\u306B\u3082\u306A\u308C\u308B" : "\u5C71\u672D\u306E\u30AB\u30FC\u30C91\u679A\u306E\u70B9\u3092+15";
      var e = el("div", "item" + (R.money < it.price ? " poor" : ""), face + '<div class="desc">' + desc + '</div><div class="price">\u{1F4B0}' + it.price + "</div>");
      e.onclick = function() {
        buy(i);
      };
      box.appendChild(e);
    });
    var mj = $("#mj", s);
    for (var j = 0; j < 5; j++) {
      var jj = R.jokers[j], e2 = el("div", "joker" + (jj ? "" : " empty"), jj ? "<b>" + jj.name + "</b><span>" + jj.desc + "</span>" : "<span>\u7A7A\u304D</span>");
      if (jj) (function(jj2) {
        e2.onclick = function() {
          if (confirmSell(jj2)) {
          }
        };
      })(jj);
      mj.appendChild(e2);
    }
    $("#rr", s).onclick = function() {
      if (R.money < R.rerollCost) {
        SFX.bad();
        return;
      }
      R.money -= R.rerollCost;
      R.rerollCost++;
      SFX.coin();
      showShop(true);
    };
    $("#nx", s).onclick = function() {
      SFX.put();
      startStage();
    };
  }
  function confirmSell(j) {
    var o = el("div", "modal", '<div class="box"><h2>' + j.name + "</h2><p>" + j.desc + "</p><p>\u58F2\u308B\u3068 \u{1F4B0}" + Math.floor(j.price / 2) + '</p><button class="btn disc" id="ys">\u58F2\u308B</button><button class="btn ghost" id="no">\u3084\u3081\u308B</button></div>');
    root.appendChild(o);
    $("#no", o).onclick = function() {
      o.remove();
    };
    $("#ys", o).onclick = function() {
      R.jokers.splice(R.jokers.indexOf(j), 1);
      R.money += Math.floor(j.price / 2);
      SFX.coin();
      o.remove();
      showShop(false);
    };
  }
  function buy(i) {
    var it = shopItems[i];
    if (!it) return;
    if (R.money < it.price) {
      SFX.bad();
      return;
    }
    if (it.t === "joker") {
      if (R.jokers.length >= 5) {
        flash("\u30B8\u30E7\u30FC\u30AB\u30FC\u306F5\u679A\u307E\u3067(\u58F2\u3063\u3066\u304B\u3089\u8CB7\u304A\u3046)");
        SFX.bad();
        return;
      }
      R.money -= it.price;
      R.jokers.push(it.j);
      shopItems[i] = null;
      SFX.joker();
      showShop(false);
      return;
    }
    if (it.t === "book") {
      R.money -= it.price;
      R.lv[it.key] = (R.lv[it.key] || 0) + 1;
      shopItems[i] = null;
      SFX.joker();
      showShop(false);
      return;
    }
    if (it.t === "pack") {
      R.money -= it.price;
      shopItems[i] = null;
      SFX.coin();
      openPack();
      return;
    }
    if (it.t === "it") {
      R.money -= it.price;
      shopItems[i] = null;
      R.deck.push(mk("pron", "it"));
      SFX.joker();
      showShop(false);
      return;
    }
    if (it.t === "boost") {
      R.money -= it.price;
      shopItems[i] = null;
      SFX.coin();
      openBoost();
      return;
    }
  }
  function guestCard() {
    var lv = Math.min(4, 2 + Math.floor((R && R.stage || 0) / 3)), ok = function(e) {
      return (e.lv || 1) >= 2 && (e.lv || 1) <= lv;
    }, r = rnd(), c = null;
    for (var t = 0; t < 6 && !c; t++) {
      if (r < 0.35) {
        var vs = DICT.all("verb").filter(function(e) {
          return ok(e) && !e.tail && e.fr !== "cl" && !e.cv && !e.link && e.w.indexOf(" ") < 0;
        });
        if (vs.length) c = mk("v", pick(vs).w);
      } else if (r < 0.75) {
        var ns = DICT.all("noun").filter(function(e) {
          return ok(e) && e.cat !== "time";
        });
        if (ns.length) c = mk("n", pick(ns).w);
      } else {
        var as = DICT.all("adj").filter(ok);
        if (as.length) c = mk("adj", pick(as).w);
      }
      r = rnd();
    }
    if (c) {
      c.guest = true;
      c.chips = baseChips(c) * 2;
    }
    return c;
  }
  function randomCard() {
    if (rnd() < 0.04) return mk("pron", "it");
    var r = rnd(), lv = Math.min(3, 1 + Math.floor((R && R.stage || 0) / 3)), ok = function(e) {
      return (e.lv || 1) <= lv + 1 && (e.lv || 1) >= 1;
    };
    if (r < 0.3) {
      var vs = DICT.all("verb").filter(function(e) {
        return ok(e) && !e.tail && e.fr !== "cl" && !e.cv && !e.link;
      });
      return mk("v", pick(vs).w);
    }
    if (r < 0.65) {
      var ns = DICT.all("noun").filter(function(e) {
        return ok(e) && (e.cat !== "time" || e.prep);
      });
      return mk("n", pick(ns).w);
    }
    if (r < 0.82) return mk("adj", pick(DICT.all("adj").filter(ok)).w);
    if (r < 0.95) return mk("adv", pick(DICT.all("adv").filter(function(e) {
      return e.k === "manner" || e.k === "time" || e.k === "place";
    })).w);
    return mk("pron", pick(["i", "you", "he", "she", "we", "they"]));
  }
  function openPack() {
    var cs = [randomCard(), randomCard(), randomCard()].filter(Boolean);
    var o = el("div", "modal", '<div class="box"><h2>1\u679A\u3048\u3089\u3093\u3067\u5C71\u672D\u3078</h2><div class="pick" id="pk"></div><button class="btn ghost" id="sk">\u3044\u3089\u306A\u3044</button></div>');
    root.appendChild(o);
    cs.forEach(function(c) {
      var e = cardEl(c, "hand", 0);
      e.classList.add("big");
      var w = el("div", "pc");
      w.appendChild(e);
      w.appendChild(el("div", "ja", (c.w.e ? c.w.e.ja : "") + "<br><small>" + KIND_JA[c.kind] + "</small>"));
      w.onclick = function() {
        R.deck.push(c);
        SFX.put();
        o.remove();
        showShop(false);
      };
      $("#pk", o).appendChild(w);
    });
    $("#sk", o).onclick = function() {
      o.remove();
      showShop(false);
    };
  }
  function openBoost() {
    var o = el("div", "modal", '<div class="box"><h2>\u5F37\u5316\u3059\u308B\u30AB\u30FC\u30C9\u3092\u3048\u3089\u3076(+15)</h2><div class="pick scroll" id="pk"></div></div>');
    root.appendChild(o);
    R.deck.forEach(function(c) {
      var e = cardEl(c, "hand", 0);
      e.onclick = function() {
        c.bonus += 15;
        SFX.joker();
        o.remove();
        showShop(false);
      };
      $("#pk", o).appendChild(e);
    });
  }
  function flash(t) {
    var f = el("div", "toast", t);
    root.appendChild(f);
    setTimeout(function() {
      f.remove();
    }, 1800);
  }
  function gameOver() {
    SFX.lose();
    saveBest(R.stage + 1);
    showEnd(false);
  }
  function showEnd(win) {
    var s = screen('<div class="end"><h1>' + (win ? "\u{1F3C6} \u5168\u30B9\u30C6\u30FC\u30B8 \u30AF\u30EA\u30A2!" : "\u30B2\u30FC\u30E0\u30AA\u30FC\u30D0\u30FC") + '</h1><div class="st">\u30B9\u30C6\u30FC\u30B8 ' + (R.stage + 1) + (win ? "" : " \u3067\u76EE\u6A19\u306B\u5C4A\u304B\u305A(" + R.score.toLocaleString() + " / " + R.target.toLocaleString() + ")") + '</div><div class="tot">\u5408\u8A08 ' + R.total.toLocaleString() + "\u70B9 \u30FB \u6587 " + R.played + "\u672C</div>" + (R.best.text ? '<div class="bestS"><div class="lbl">\u3044\u3061\u3070\u3093\u9AD8\u304B\u3063\u305F\u6587(' + R.best.pts.toLocaleString() + '\u70B9)</div><div class="t">' + R.best.text + '</div><button class="btn ghost small" id="sp">\u{1F50A} \u805E\u304F</button></div>' : "") + ((R.hist || []).length ? '<button class="btn ghost" id="hs">\u{1F4DA} \u4ECA\u56DE\u306E\u6587\u3092\u3075\u308A\u304B\u3048\u308B(' + R.hist.length + ")</button>" : "") + '<button class="btn go" id="re">\u3082\u3046\u4E00\u56DE</button><button class="btn ghost" id="tt">\u30BF\u30A4\u30C8\u30EB\u3078</button></div>');
    if ($("#hs", s)) $("#hs", s).onclick = function() {
      histModal(R.hist);
    };
    if ($("#sp", s)) $("#sp", s).onclick = function() {
      speak(R.best.text);
    };
    $("#re", s).onclick = function() {
      SFX.put();
      newRun();
    };
    $("#tt", s).onclick = function() {
      showTitle();
    };
  }
  var Kit = {
    G,
    CFG,
    $,
    el,
    rnd,
    pick,
    shuffle,
    store,
    SFX,
    speak,
    unlock,
    mk,
    card,
    starterDeck,
    randomCard,
    TSU,
    tsuCard,
    cardText,
    cardEl,
    colorOf,
    lvOf,
    cat,
    verbFits,
    evaluate,
    yaku,
    JOKERS,
    PART_JA,
    KIND_JA,
    Core,
    fillTo,
    G_,
    getR: function() {
      return R;
    },
    setR: function(x) {
      R = x;
    },
    screen,
    showTitle,
    flash,
    wait,
    bump,
    floatTxt,
    renderRow,
    _cycle: cycle,
    _wordNotes: wordNotes,
    _formTag: formTag,
    _improvements: improvements,
    surfaceOf,
    reviewItems,
    showReview,
    reviewFlow,
    reviewAfter,
    recordHist,
    histModal,
    errMsg,
    hintPanel,
    doHint,
    level: function() {
      return LEVEL;
    },
    LV_MULT,
    LV_JA,
    HINT_MULT,
    calcNext,
    baseScore,
    QUESTS,
    MISSIONS,
    pickMissions,
    missionHit,
    Q_PCT,
    TIER_JA,
    questHit,
    pickQuest,
    addCombo,
    guestCard,
    notes,
    baseChips,
    rowText,
    renderHand,
    renderTsu,
    cur: function() {
      return cur;
    },
    root: function() {
      return root;
    }
  };

  // games/cards/src/vs.js
  var G2 = Kit.G;
  var $2 = Kit.$;
  var el2 = Kit.el;
  var rnd2 = Kit.rnd;
  var pick2 = Kit.pick;
  var shuffle2 = Kit.shuffle;
  var SFX2 = Kit.SFX;
  var G_2 = Kit.G_;
  function T(spec) {
    return Kit.tsuCard(spec);
  }
  function form(c, patch) {
    var n = {};
    for (var k in c) n[k] = c[k];
    n.w = {};
    for (var j in c.w) n.w[j] = c.w[j];
    for (var p in patch) n.w[p] = patch[p];
    return n;
  }
  var QCTX = null;
  function scoreRow(row, ev, rule) {
    var b = Kit.baseScore(row, ev), y = b.y, chips = b.chips, mult = b.mult;
    if (rule) rule.fx(ev.f, { y }).forEach(function(e) {
      if (e[0] === "c") chips += e[1];
      else if (e[0] === "m") mult += e[1];
      else mult = Math.round(mult * e[1] * 10) / 10;
    });
    return { y, chips, mult, total: Math.floor(chips * mult) };
  }
  function isSubj(c) {
    return c.kind === "pron" && c.w.v !== "it" || c.kind === "n" && /^(person|animal)$/.test(c.w.e.cat);
  }
  function count(c) {
    return G2.isCount(c.w.e) && !c.w.e.ind;
  }
  function npOpts(n, adjs, asSubj) {
    var o = [], det = function(d) {
      return T(["det", d]);
    };
    if (n.kind === "pron") {
      o.push([n]);
      return o;
    }
    var e = n.w.e, cnt = count(n);
    if (e.ind || e.cat === "time" || e.cat === "place" && !cnt) {
      o.push([n]);
    } else {
      o.push([det("the"), n]);
      if (cnt && !asSubj) o.push([det("a"), n]);
      if (cnt) o.push([form(n, { pl: true })]);
      if (asSubj && e.cat === "person") o.push([T(["pos", "i", "my"]), n]);
      adjs.slice(0, 2).forEach(function(a) {
        o.push([det(cnt && !asSubj ? "a" : "the"), a, n]);
      });
    }
    return o;
  }
  function vpOpts(v, lvl) {
    var o = [[form(v, { f: "base" })], [form(v, { f: "past" })]];
    if (lvl >= 1) {
      o.push([T(["be", "pres"]), form(v, { f: "ing" })]);
      o.push([T(["modal", "can"]), form(v, { f: "base" })]);
    }
    if (lvl >= 2) {
      o.push([T(["hv", "pres"]), form(v, { f: "pp" })]);
      o.push([T(["modal", "will"]), form(v, { f: "base" })]);
      o.push([T(["be", "past"]), form(v, { f: "ing" })]);
    }
    return o;
  }
  var MOTION = ["go", "come", "run", "walk", "move", "fly", "drive", "travel", "return", "swim", "jump", "hurry", "ride", "climb"];
  function motion(row) {
    var v = row.filter(function(c) {
      return c.kind === "v";
    })[0];
    return v && MOTION.indexOf(v.w.e.w) >= 0;
  }
  function ids(row) {
    var s = {};
    row.forEach(function(c) {
      if (!c.tsu) s[c.id] = 1;
    });
    return s;
  }
  function overlap(a, b) {
    var s = ids(a);
    return b.some(function(c) {
      return !c.tsu && s[c.id];
    });
  }
  function search(hand, rule, lvl, budget) {
    var memo = {}, n = 0, max = budget || 260;
    function key(row) {
      return row.map(function(c) {
        return (c.tsu ? "t" : c.id) + ":" + Kit.cardText(c) + (c.w.f || "") + (c.w.pl ? "p" : "");
      }).join("|");
    }
    function ev(row) {
      var k = key(row);
      if (k in memo) return memo[k];
      if (n >= max) return null;
      n++;
      var e = Kit.evaluate(row), r = null;
      if (e.state === "ok") {
        var sc = scoreRow(row, e, rule), q = 0;
        if (QCTX) {
          QCTX.cands.forEach(function(c) {
            if (Kit.questHit(c, e.f)) q += Kit.Q_PCT[c.tier] / 300;
          });
          if (V && V.mission && Kit.missionHit(V.mission, e.f)) q += 0.1;
        }
        r = { row, ev: e, score: Math.round(sc.total * (1 + q)), sc };
      }
      memo[k] = r;
      return r;
    }
    var subs = hand.filter(isSubj), verbs = hand.filter(function(c) {
      return c.kind === "v";
    }), nouns = hand.filter(function(c) {
      return c.kind === "n" || c.kind === "pron";
    }), adjs = hand.filter(function(c) {
      return c.kind === "adj";
    }), advs = hand.filter(function(c) {
      return c.kind === "adv";
    });
    var cores = [];
    subs.forEach(function(s) {
      npOpts(s, adjs, true).slice(0, 3).forEach(function(S) {
        verbs.forEach(function(v) {
          var V2 = [form(v, { f: "base" })];
          if (v.w.e.fr !== "tr") {
            var r = ev(S.concat(V2));
            if (r) cores.push({ S, v, O: null, r });
          }
          if (v.w.e.fr === "intr") return;
          nouns.forEach(function(o) {
            if (o === s || o.kind === "n" && !Kit.verbFits(v, o) || o.kind === "pron" && o.w.v !== "it" && (v.w.e.ot || []).indexOf("person") < 0 || /^(time|place)$/.test(o.kind === "n" && o.w.e.cat)) return;
            npOpts(o, [], false).slice(0, 2).forEach(function(O) {
              if (overlap(S, O)) return;
              var r2 = ev(S.concat(V2, O));
              if (r2) cores.push({ S, v, O, r: r2 });
            });
          });
        });
      });
    });
    if (!cores.length) return null;
    cores.sort(function(a, b) {
      return b.r.score - a.r.score;
    });
    var best2 = [];
    cores.slice(0, lvl ? 4 : 2).forEach(function(c) {
      vpOpts(c.v, lvl).forEach(function(V2) {
        var row = c.S.concat(V2, c.O || []), r = ev(row);
        if (r) best2.push(r);
      });
    });
    best2.sort(function(a, b) {
      return b.score - a.score;
    });
    var exts = [];
    hand.forEach(function(c) {
      if (c.kind === "adv") {
        var ax = [c];
        ax.kind = c.w.e.k === "time" ? "time" : c.w.e.k === "place" ? "place" : "adv";
        exts.push(ax);
      }
      if (c.kind === "n" && c.w.e.cat === "place") {
        ["in", "at", "to"].forEach(function(p) {
          var x = [T(["prep", p])].concat(count(c) ? [T(["det", "the"]), c] : [c]);
          if (p === "to") x.to = 1;
          x.kind = "place";
          exts.push(x);
        });
      }
      if (c.kind === "n" && c.w.e.cat === "time") {
        ["in", "on", "at"].forEach(function(p) {
          var x = [T(["prep", p])].concat(count(c) && !c.w.e.ind ? [T(["det", "the"]), c] : [c]);
          x.kind = "time";
          exts.push(x);
        });
      }
    });
    var top2 = null, steps = lvl === 0 ? 1 : lvl === 1 ? 2 : 4;
    best2.slice(0, lvl ? 3 : 1).forEach(function(b0) {
      var curB = b0, kinds = {};
      for (var s = 0; s < steps; s++) {
        var nb = null, nk = null;
        exts.forEach(function(x) {
          if (overlap(curB.row, x) || x.to && !motion(curB.row) || x.kind !== "adv" && kinds[x.kind]) return;
          var r = ev(curB.row.concat(x));
          if (r && r.score > (nb ? nb.score : curB.score)) {
            nb = r;
            nk = x.kind;
          }
        });
        if (!nb) break;
        curB = nb;
        kinds[nk] = 1;
      }
      if (!top2 || curB.score > top2.score) top2 = curB;
    });
    if (lvl >= 2 && top2 && rnd2() < 0.4) {
      var rest = hand.filter(function(c) {
        return !ids(top2.row)[c.id];
      });
      if (rest.some(isSubj) && rest.some(function(c) {
        return c.kind === "v";
      })) {
        var sub = search(rest, rule, 1, 80);
        if (sub) ["and", "because", "but"].forEach(function(cj) {
          var r = ev(top2.row.concat([T(["conj", cj])], sub.row));
          if (r && r.score > top2.score) top2 = r;
        });
      }
    }
    if (top2) {
      top2.n = n;
      var seen = {};
      seen[top2.ev.text] = 1;
      top2.alts = Object.keys(memo).map(function(k) {
        return memo[k];
      }).filter(function(r) {
        if (!r || seen[r.ev.text]) return false;
        seen[r.ev.text] = 1;
        return true;
      }).sort(function(a, b) {
        return b.score - a.score;
      }).slice(0, 2);
    }
    return top2;
  }
  var OPPS = [
    { id: "mii", name: "\u30DF\u30A4", face: "\u{1F431}", lv: 0, style: "careful", tag: "\u3084\u3055\u3057\u3044", desc: "\u614E\u91CD\u6D3E\u3002\u3044\u3044\u6587\u304C\u3067\u304D\u305F\u3068\u304D\u3057\u304B\u8CED\u3051\u306A\u3044\u3002\u8CED\u3051\u3066\u304D\u305F\u3089\u672C\u7269\u304B\u3082\u3002" },
    { id: "baron", name: "\u30CF\u30C3\u30BF\u30EA\u7537\u7235", face: "\u{1F3A9}", lv: 1, style: "bluff", tag: "\u3075\u3064\u3046", desc: "\u5F31\u3044\u624B\u3067\u3082\u5E73\u6C17\u3067\u8CED\u3051\u3066\u304F\u308B\u3002\u308F\u3056\u3068\u5F37\u3044\u30AB\u30FC\u30C9\u3092\u6368\u3066\u308B\u3053\u3068\u3082\u3002" },
    { id: "gon", name: "\u3072\u308D\u3044\u5C4B\u30B4\u30F3", face: "\u{1F99D}", lv: 2, style: "collector", tag: "\u3064\u3088\u3044", desc: "\u3042\u306A\u305F\u306E\u6368\u3066\u305F\u30AB\u30FC\u30C9\u3092\u62FE\u3063\u3066\u3044\u304F\u3002and \u3084 because \u3067\u9577\u3044\u6587\u3082\u4F5C\u308B\u3002" }
  ];
  var QS = [[290, 360, 540], [390, 530, 640], [500, 680, 880]];
  var HANDS = 6;
  var ANTE = 5;
  var BETS = { 1: 10, 3: 20 };
  var START = 100;
  var V = null;
  var ME = null;
  var CPU = null;
  function player() {
    return { lv: {}, stage: 2, hand: [], row: [], field: [], draw: [], disc: [], pts: 0, refill: 0, discards: 99, log: [] };
  }
  function withP(p, fn) {
    p.draw = ME.draw;
    p.disc = ME.disc;
    p.field = ME.field;
    Kit.setR(p);
    try {
      return fn();
    } finally {
      ME.draw = p.draw;
      ME.disc = p.disc;
      ME.field = p.field;
      Kit.setR(ME);
    }
  }
  function start(opp) {
    if (!opp) {
      pickOpp();
      return;
    }
    ME = player();
    CPU = player();
    Kit.setR(ME);
    var all = Kit.starterDeck();
    for (var i = 0; i < 25; i++) {
      var c = Kit.randomCard();
      if (c) all.push(c);
    }
    all.push(Kit.mk("pron", "it"));
    V = { opp, all, n: 0, med: { me: START, cpu: START }, first: rnd2() < 0.5 ? "me" : "cpu", stats: { win: 0, lose: 0 } };
    showVS();
    nextHand();
  }
  function pickOpp() {
    var rec = Kit.store.get("vs") || {};
    var o = el2("div", "modal", '<div class="box"><h2>\u5BFE\u6226\u76F8\u624B\u3092\u3048\u3089\u3076</h2><div class="opps" id="ops"></div><details class="vrules"><summary>\u5BFE\u6226\u306E\u30EB\u30FC\u30EB</summary><ol><li>\u{1FA99}100\u679A\u305A\u3064\u6301\u3063\u3066\u30016\u30CF\u30F3\u30C9\u52DD\u8CA0\u3002\u6BCE\u30CF\u30F3\u30C9 \u53C2\u52A0\u8CBB\u{1FA99}5\u3002</li><li>\u624B\u672D8\u679A\u3002\u4EA4\u63DB\u3092<b>3\u56DE\u305A\u3064</b>\u4EA4\u4E92\u306B(1\u301C3\u679A\u6368\u3066\u3066\u88DC\u5145\u3001\u307E\u305F\u306F\u305D\u306E\u307E\u307E)\u3002\u6368\u3066\u305F\u30AB\u30FC\u30C9\u306F<b>\u5834\u306B\u8868\u5411\u304D</b>\u3067\u4E26\u3076\u306E\u3067\u3001\u76F8\u624B\u304C\u4F55\u3092\u72D9\u3063\u3066\u3044\u308B\u304B\u8AAD\u3081\u308B\u3002\u5834\u306E\u30AB\u30FC\u30C9\u306F\u6368\u3066\u672Dpt\u3067\u53D6\u308C\u308B(\u76F8\u624B\u306E\u6B32\u3057\u3044\u30AB\u30FC\u30C9\u3092\u5148\u306B\u53D6\u308B\u306E\u3082\u30A2\u30EA)\u3002</li><li>1\u56DE\u76EE\u306E\u4EA4\u63DB\u306E\u3042\u3068\u3068\u6700\u5F8C\u306B<b>\u8CED\u3051</b>\u3002\u30C1\u30A7\u30C3\u30AF/\u30D9\u30C3\u30C8\u3001\u76F8\u624B\u304C\u8CED\u3051\u305F\u3089\u30B3\u30FC\u30EB/\u30EC\u30A4\u30BA/\u964D\u308A\u308B\u3002</li><li>\u6700\u5F8C\u306B\u53F0\u306E\u6587\u3092\u898B\u305B\u5408\u3044\u3001\u70B9\u306E\u9AD8\u3044\u307B\u3046\u304C\u30DD\u30C3\u30C8\u3092\u7DCF\u53D6\u308A\u3002\u53F0\u306E\u6587\u304C\u9593\u9055\u3063\u3066\u3044\u308B\u30680\u70B9\u3002</li><li>\u6BCE\u30CF\u30F3\u30C9\u300C\u30EB\u30FC\u30EB\u300D\u304C1\u3064\u4ED8\u304F(\u4F8B:\u904E\u53BB\u306E\u6587\u306F\u500D\u7387\xD72)\u3002</li><li><b>\u30EA\u30FC\u30C1</b>:\u5F79\u306E\u8981\u7D20\u304C3\u3064\u4EE5\u4E0A\u3042\u308B\u6587\u304C\u3067\u304D\u305F\u3089\u3001\u81EA\u5206\u306E\u4EA4\u63DB\u306E\u756A\u3067\u300C\u{1F004} \u30EA\u30FC\u30C1\u300D(\u{1FA99}5)\u3002\u4EE5\u5F8C\u306F\u53F0\u306E\u6587\u304C\u56FA\u5B9A\u3067\u4EA4\u63DB\u306A\u3057\u3002\u70B9\u304C+30%(1\u56DE\u76EE)/+20%(2\u56DE\u76EE)/+10%(3\u56DE\u76EE)\u3002\u76F8\u624B\u306B\u3082\u300C\u30EA\u30FC\u30C1\u4E2D\u300D\u3068\u898B\u3048\u308B\u3002</li><li><b>\u304A\u984C</b>:\u{1F3AF} \u898B\u3048\u308B\u304A\u984C\u3092\u6E80\u305F\u3059\u3068\u70B9+10%\u3002\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8(\u5019\u88DC3\u3064\u306E\u3046\u30611\u3064\u304C\u672C\u547D)\u304C\u5F53\u305F\u308B\u3068+10/20/30%\u3002\u30DC\u30FC\u30CA\u30B9\u306F\u5408\u8A08+50%\u307E\u3067\u3002</li><li><b>\u30B2\u30B9\u30C8\u30AB\u30FC\u30C9</b>:\u5834\u306E\u91D1\u67A0\u306E\u30AB\u30FC\u30C9\u306F\u3001\u6368\u3066\u672Dpt\u3067\u53D6\u308A\u5408\u3044\u3002</li></ol></details><button class="btn ghost" id="cx">\u3082\u3069\u308B</button></div>');
    Kit.root().appendChild(o);
    OPPS.forEach(function(op) {
      var r = rec[op.id] || { w: 0, l: 0 };
      var e = el2("div", "oppc", '<div class="face">' + op.face + "</div><div><b>" + op.name + '</b> <span class="lvtag l' + op.lv + '">' + op.tag + "</span><p>" + op.desc + "</p><small>\u6226\u7E3E " + r.w + "\u52DD " + r.l + "\u6557</small></div>");
      e.onclick = function() {
        SFX2.put();
        o.remove();
        start(op);
      };
      $2("#ops", o).appendChild(e);
    });
    $2("#cx", o).onclick = function() {
      o.remove();
    };
  }
  function showVS() {
    var op = V.opp;
    var s = Kit.screen(
      '<div class="vtop"><div class="vh">\u30CF\u30F3\u30C9 <b id="vhn"></b>/' + HANDS + '</div><div class="pot">\u{1FA99} <b id="vpot">0</b><small>\u30DD\u30C3\u30C8</small></div><div class="vmed"><span>\u3042\u306A\u305F<b id="vme"></b></span><span>' + op.face + '<b id="vcpu"></b></span></div><button class="vq" id="vq">\u2715</button></div><div class="opp"><div class="face">' + op.face + '</div><div class="oinfo"><div class="oname">' + op.name + '<small>\u6368\u3066\u672Dpt <b id="opt">0</b></small></div><div class="backs" id="obk"></div></div><div class="bubble" id="obb"></div></div><div class="rule" id="vrule"></div><div class="vturn" id="vturn"></div><div class="board"><div class="row" id="row"></div><div class="pv"><div class="sent" id="sent"></div><div class="jt" id="jt"></div><div class="yk" id="yk"></div><div class="cm"><span class="chips" id="ch">0</span><span class="x">\xD7</span><span class="mult" id="ml">0</span><span class="eq" id="eq"></span></div><div class="msg" id="msg"></div><div class="hp" id="hp"></div></div><button class="hintb" id="hb">\u{1F4A1} \u30D2\u30F3\u30C8</button></div><div class="field"><div class="flbl"><span>\u5834(<i class="me">\u3042\u306A\u305F</i>/<i class="cp">' + op.name + '</i>\u306E\u6368\u3066\u305F\u30AB\u30FC\u30C9)</span><span class="pts">\u6368\u3066\u672Dpt <b id="pt">0</b></span></div><div class="frow" id="fd"></div><div class="fhint" id="fh"></div></div><div class="tsu"><div class="tabs" id="tabs"></div><div class="tw" id="tw"></div></div><div class="hand" id="hand"></div><div class="btns" id="bt"></div>'
    );
    ["row", "sent", "yk", "ch", "ml", "msg", "tabs", "tw", "hand", "bt", "fd", "fh", "pt"].forEach(function(k) {
      G_2[k] = $2("#" + k, s);
    });
    ["vhn", "vpot", "vme", "vcpu", "opt", "obk", "obb", "vrule", "vturn", "eq", "jt", "hp", "hb"].forEach(function(k) {
      G_2[k] = $2("#" + k, s);
    });
    G_2.tab = G_2.tab || 0;
    G_2.mode = "play";
    G_2.mark = [];
    G_2.busy = false;
    G_2.vs = { renderAll: renderAll2, preview, btns };
    G_2.hb.onclick = Kit.doHint;
    $2("#vq", s).onclick = function() {
      var o = el2("div", "modal", '<div class="box"><h2>\u5BFE\u6226\u3092\u3084\u3081\u308B?</h2><p>\u3053\u3053\u3067\u3084\u3081\u308B\u3068\u8CA0\u3051\u306B\u306A\u308B\u3002</p><button class="btn disc" id="y">\u3084\u3081\u308B</button><button class="btn ghost" id="n">\u3064\u3065\u3051\u308B</button></div>');
      Kit.root().appendChild(o);
      $2("#n", o).onclick = function() {
        o.remove();
      };
      $2("#y", o).onclick = function() {
        o.remove();
        V.quit = true;
        endMatch(true);
      };
    };
  }
  function renderAll2() {
    top();
    Kit.renderRow();
    Kit.renderTsu();
    Kit.renderHand();
    field();
    btns();
  }
  function top() {
    if (!G_2.vhn) return;
    G_2.vhn.textContent = V.n;
    G_2.vpot.textContent = V.pot;
    G_2.vme.textContent = V.med.me;
    G_2.vcpu.textContent = V.med.cpu;
    G_2.opt.textContent = CPU.pts;
    G_2.obk.innerHTML = "";
    CPU.hand.forEach(function() {
      G_2.obk.appendChild(el2("div", "cback"));
    });
    G_2.vrule.innerHTML = (V.rule ? "\u{1F3B2} \u3053\u306E\u30CF\u30F3\u30C9\u306E\u30EB\u30FC\u30EB:<b>" + V.rule.name + "</b> " + V.rule.desc : "") + (V.mission ? '<div class="mbar">\u{1F3AF} \u304A\u984C(\u9054\u6210\u3067\u70B9+10%):<span class="mc t' + V.mission.tier + (cur2 && cur2.state === "ok" && Kit.missionHit(V.mission, cur2.f) ? " hit" : "") + '">' + (cur2 && cur2.state === "ok" && Kit.missionHit(V.mission, cur2.f) ? "\u2714 " : "") + V.mission.label + "</span></div>" : "") + (V.quest ? '<div class="qbar">\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8(\u3069\u308C\u304B1\u3064\u30FB\u5F53\u305F\u308B\u3068+10/20/30%):' + V.quest.cands.map(function(q) {
      var hit = cur2 && cur2.state === "ok" && Kit.questHit(q, cur2.f);
      return '<span class="qc t' + q.tier + (hit ? " hit" : "") + '">' + (hit ? "\u2714 " : "") + q.label + "</span>";
    }).join("") + "</div>" : "") + (V.ri && (V.ri.me || V.ri.cpu) ? '<div class="ribar">' + (V.ri.me ? "\u{1F004} \u3042\u306A\u305F \u30EA\u30FC\u30C1\u4E2D(+" + riPct(V.ri.me) + "%) " : "") + (V.ri.cpu ? "\u{1F004} " + V.opp.name + " \u30EA\u30FC\u30C1\u4E2D!" : "") + "</div>" : "");
    G_2.vturn.innerHTML = V.turnTxt || "";
  }
  function say(t, cls) {
    if (!G_2.obb) return;
    G_2.obb.className = "bubble on " + (cls || "");
    G_2.obb.innerHTML = t;
    Kit.bump(G_2.obb);
  }
  var cur2 = null;
  function myMul(t) {
    return Math.floor(t * Kit.LV_MULT[Kit.level()] * Kit.HINT_MULT[ME.hintLv || 0]);
  }
  function mulNote() {
    var o = [];
    if (Kit.level() !== 1) o.push(Kit.LV_JA[Kit.level()] + " \xD7" + Kit.LV_MULT[Kit.level()]);
    return o.length ? "<br>" + o.join("\u30FB") : "";
  }
  function preview(ev) {
    cur2 = ev;
    G_2.sent.className = "sent " + ev.state;
    G_2.msg.textContent = "";
    G_2.eq.textContent = "";
    if (ev.state === "empty") {
      G_2.sent.textContent = "";
      G_2.yk.textContent = "\u6700\u5F8C\u306B\u53F0\u306E\u6587\u3067\u52DD\u8CA0\u3002\u624B\u672D\u3092\u30BF\u30C3\u30D7\u3057\u3066\u4E26\u3079\u3088\u3046";
      G_2.ch.textContent = "0";
      G_2.ml.textContent = "0";
      return;
    }
    if (ev.state === "ok") {
      var sc = scoreRow(ME.row, ev, V.rule);
      G_2.sent.textContent = ev.text;
      G_2.yk.textContent = "\u5F79:" + sc.y.name + "(" + ev.f.words + "\u8A9E)";
      G_2.ch.textContent = sc.chips;
      G_2.ml.textContent = sc.mult;
      G_2.eq.textContent = "= " + myMul(sc.total).toLocaleString();
      G_2.msg.innerHTML = Kit.notes(ev.f, 0) + mulNote();
      top();
      return;
    }
    G_2.sent.textContent = Kit.rowText(ME.row);
    G_2.yk.textContent = "";
    G_2.ch.textContent = "\u2013";
    G_2.ml.textContent = "\u2013";
    G_2.msg.textContent = Kit.errMsg(ev, ME.row);
  }
  function field() {
    G_2.fd.innerHTML = "";
    G_2.pt.textContent = ME.pts;
    if (!ME.field.length) G_2.fd.appendChild(el2("div", "ph", "\u307E\u3060\u8AB0\u3082\u6368\u3066\u3066\u3044\u306A\u3044"));
    ME.field.forEach(function(c) {
      var e = Kit.cardEl(c, "field", 0), cost = c.chips + (c.bonus || 0), can = G_2.mode === "refill" && ME.pts >= cost;
      e.classList.add("mini", c.by === "cpu" ? "bycpu" : c.by === "guest" ? "byguest" : "byme");
      if (G_2.mode === "refill") e.classList.add(can ? "can" : "cant");
      e.onclick = function() {
        if (G_2.mode !== "refill") {
          Kit.flash("\u6368\u3066\u305F\u3042\u3068\u306E\u88DC\u5145\u3067\u3001" + cost + "pt \u6255\u3046\u3068\u53D6\u308C\u308B");
          return;
        }
        if (!Kit.Core.take(c)) {
          SFX2.bad();
          Kit.flash("\u6368\u3066\u672Dpt\u304C\u8DB3\u308A\u306A\u3044(" + cost + "pt \u5FC5\u8981)");
          return;
        }
        SFX2.coin();
        afterRefill2();
      };
      G_2.fd.appendChild(e);
    });
    G_2.fh.textContent = G_2.mode === "refill" ? "\u3042\u3068 " + ME.refill + " \u679A:\u5C71\u304B\u3089\u5F15\u304F \u304B\u3001\u5834\u306E\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3057\u3066\u53D6\u308B" : "";
  }
  var wait2 = Kit.wait;
  var resolve = null;
  function act(v) {
    var r = resolve;
    resolve = null;
    if (r) r(v);
  }
  function ask(phase) {
    V.phase = phase;
    renderAll2();
    return new Promise(function(r) {
      resolve = r;
    });
  }
  function btns() {
    var bt = G_2.bt;
    if (!bt) return;
    bt.innerHTML = "";
    var b = function(cls, txt, fn, dis) {
      var x = el2("button", "btn " + cls, txt);
      x.onclick = function() {
        if (!x.disabled) fn();
      };
      x.disabled = !!dis;
      bt.appendChild(x);
      return x;
    };
    if (G_2.mode === "disc") {
      b("ghost", "\u3084\u3081\u308B", function() {
        G_2.mode = "play";
        G_2.mark = [];
        SFX2.tap();
        renderAll2();
      });
      b("disc", G_2.mark.length ? G_2.mark.length + "\u679A \u6368\u3066\u308B" : "\u6368\u3066\u308B\u30AB\u30FC\u30C9\u3092\u3048\u3089\u3076(3\u679A\u307E\u3067)", doDiscard2, !G_2.mark.length || G_2.mark.length > 3);
      return;
    }
    if (G_2.mode === "refill") {
      b("ghost", "\u5C71\u304B\u3089\u5F15\u304F(\u3042\u3068" + ME.refill + ")", function() {
        Kit.Core.drawOne();
        SFX2.put();
        afterRefill2();
      });
      b("go", "\u305C\u3093\u3076\u5C71\u304B\u3089", function() {
        while (ME.refill > 0) Kit.Core.drawOne();
        SFX2.put();
        afterRefill2();
      });
      return;
    }
    if (V.phase === "turn") {
      b("disc", "\u6368\u3066\u3066\u4EA4\u63DB", function() {
        G_2.mode = "disc";
        G_2.mark = [];
        SFX2.tap();
        renderAll2();
      });
      b("ghost", "\u4EA4\u63DB\u3057\u306A\u3044", function() {
        SFX2.tap();
        act("pass");
      });
      var ok = canRiichi();
      b("go small ri", "\u{1F004} \u30EA\u30FC\u30C1<br><small>" + (ok ? "\u{1FA99}5\u30FB\u70B9+" + riPct(V.t) + "%" : "\u5F793\u3064\u4EE5\u4E0A\u3067") + "</small>", function() {
        act("riichi");
      }, !ok);
      return;
    }
    if (V.phase === "bet") {
      var q = V.betQ, amt = BETS[V.t];
      if (!q.face) {
        b("ghost", "\u30C1\u30A7\u30C3\u30AF", function() {
          act({ a: "check" });
        });
        b("go", "\u30D9\u30C3\u30C8 " + amt, function() {
          act({ a: "bet" });
        }, V.med.me <= 0);
      } else {
        b("disc", "\u964D\u308A\u308B", function() {
          act({ a: "fold" });
        });
        b("play", "\u30B3\u30FC\u30EB " + Math.min(q.face, V.med.me), function() {
          act({ a: "call" });
        });
        if (!q.raised && V.med.me > q.face) b("go", "\u30EC\u30A4\u30BA +" + amt, function() {
          act({ a: "raise" });
        });
      }
      return;
    }
    b("ghost", V.phase === "cpu" ? V.opp.name + "\u306E\u756A\u2026" : "\u2026", function() {
    }, true);
  }
  function doDiscard2() {
    if (!G_2.mark.length || G_2.mark.length > 3) return;
    G_2.mark.forEach(function(c) {
      c.by = "me";
    });
    Kit.Core.discard(G_2.mark.slice());
    G_2.mark = [];
    G_2.mode = "refill";
    SFX2.tap();
    renderAll2();
  }
  function afterRefill2() {
    if (ME.refill <= 0) {
      G_2.mode = "play";
      act("done");
    }
    renderAll2();
  }
  function riPct(t) {
    return (4 - t) * 10;
  }
  function parts(ev) {
    return ev && ev.state === "ok" ? Kit.yaku(ev.f).parts.filter(function(p) {
      return /^(SV|O|O2|C|place|time|manner)$/.test(p[0]);
    }).length : 0;
  }
  function canRiichi() {
    return !V.ri.me && cur2 && cur2.state === "ok" && parts(cur2) >= 3 && V.med.me >= 5;
  }
  function riichiPay(who) {
    var a = Math.min(5, V.med[who]);
    V.med[who] -= a;
    V.pot += a;
  }
  function pay(who, amt) {
    var a = Math.max(0, Math.min(amt, V.med[who]));
    V.med[who] -= a;
    V.pot += a;
    V.c[who] += a;
    return a;
  }
  async function nextHand() {
    V.n++;
    if (V.n > HANDS || V.med.me < ANTE || V.med.cpu < ANTE) {
      endMatch();
      return;
    }
    V.first = V.first === "me" ? "cpu" : "me";
    V.all.forEach(function(c) {
      c.by = null;
      if (c.w.k === "v") c.w.f = "base";
      if (c.w.k === "n") c.w.pl = false;
    });
    ME.hand = [];
    ME.row = [];
    ME.field = [];
    ME.disc = [];
    ME.draw = shuffle2(V.all.slice());
    ME.pts = 0;
    ME.refill = 0;
    CPU.hand = [];
    CPU.row = [];
    CPU.pts = 0;
    CPU.refill = 0;
    V.cpuBest = null;
    V.cpuLocked = null;
    ME.hintLv = 0;
    G_2.hintBest = null;
    G_2.hintIds = {};
    V.ri = { me: 0, cpu: 0 };
    V.bluffed = false;
    G_2.busy = false;
    V.quest = Kit.pickQuest(V.usedQ = V.usedQ || []);
    QCTX = V.quest;
    V.mission = Kit.pickMissions(V.usedM = V.usedM || [], 1)[0].m;
    V.rule = pick2(Kit.JOKERS.filter(function(j) {
      return !/^(bank|lucky|first|last)$/.test(j.id);
    }));
    V.pot = 0;
    V.c = { me: 0, cpu: 0 };
    pay("me", ANTE);
    pay("cpu", ANTE);
    withP(CPU, function() {
      Kit.fillTo(8);
    });
    Kit.fillTo(8);
    var g = Kit.guestCard();
    if (g) {
      g.by = "guest";
      ME.field.unshift(g);
    }
    G_2.mode = "play";
    G_2.mark = [];
    say(pick2(["\u3088\u308D\u3057\u304F!", "\u3044\u304F\u3088\u301C", "\u3075\u3075\u3075\u2026", "\u3055\u3042\u52DD\u8CA0!"]));
    renderAll2();
    SFX2.put();
    var order = V.first === "me" ? ["me", "cpu"] : ["cpu", "me"];
    for (var t = 1; t <= 3; t++) {
      for (var k = 0; k < 2; k++) {
        if (V.quit) return;
        V.turnTxt = "\u4EA4\u63DB <b>" + t + "/3</b> \u30FB " + (order[k] === "me" ? '<span class="you">\u3042\u306A\u305F\u306E\u756A</span>:1\u301C3\u679A \u6368\u3066\u3066\u4EA4\u63DB \u304B\u3001\u305D\u306E\u307E\u307E' : V.opp.name + "\u306E\u756A");
        V.t = t;
        if (order[k] === "me") {
          if (V.ri.me) {
            V.turnTxt = "\u4EA4\u63DB <b>" + t + "/3</b> \u30FB \u3042\u306A\u305F\u306F\u30EA\u30FC\u30C1\u4E2D(\u4EA4\u63DB\u306A\u3057)";
            renderAll2();
            await wait2(500);
            continue;
          }
          var a = await ask("turn");
          if (a === "riichi") {
            V.ri.me = t;
            riichiPay("me");
            G_2.busy = true;
            SFX2.joker();
            Kit.flash("\u{1F004} \u30EA\u30FC\u30C1! \u3053\u306E\u6587\u3067\u52DD\u8CA0(\u70B9+" + riPct(t) + "%)");
            say(pick2(["\u3080\u2026\u30EA\u30FC\u30C1\u304B", "\u307B\u3046\u2026", "\u3053\u308F\u3044\u306D"]));
            renderAll2();
            await wait2(600);
          }
        } else await cpuTurn(t);
      }
      if (t === 1 || t === 3) {
        var r = await betting(t, order);
        if (V.quit) return;
        if (r) {
          await foldEnd(r);
          return;
        }
      }
    }
    await showdown();
  }
  function best() {
    if (V.cpuLocked) return V.cpuLocked;
    var r = search(CPU.hand, V.rule, V.opp.lv), miss = [0.3, 0.2, 0.1][V.opp.lv];
    if (r && r.alts && r.alts.length && rnd2() < miss) r = r.alts[Math.floor(rnd2() * r.alts.length)];
    return r;
  }
  async function cpuTurn(t) {
    V.phase = "cpu";
    renderAll2();
    say("\u8003\u3048\u4E2D\u2026", "think");
    await wait2(650);
    if (V.ri.cpu) {
      say("\u30EA\u30FC\u30C1\u4E2D\u2026");
      await wait2(700);
      return;
    }
    var bst = best(), used = bst ? ids(bst.row) : {}, unused = CPU.hand.filter(function(c) {
      return !used[c.id];
    });
    if (t <= 2 && bst && parts(bst.ev) >= 3 && V.med.cpu >= 5 && (quant(bst.score) >= 0.7 && rnd2() < 0.35 || V.opp.style === "bluff" && rnd2() < 0.15)) {
      V.ri.cpu = t;
      riichiPay("cpu");
      V.cpuBest = V.cpuLocked = bst;
      say("\u30EA\u30FC\u30C1!!", "hot");
      SFX2.joker();
      renderAll2();
      await wait2(1e3);
      return;
    }
    unused.sort(function(a, b) {
      return a.chips - b.chips + (rnd2() - 0.5) * 8;
    });
    var dc = unused.slice(0, 3);
    if (V.opp.style === "bluff" && rnd2() < 0.3 && bst) {
      var u2 = CPU.hand.filter(function(c) {
        return used[c.id];
      }).sort(function(a, b) {
        return b.chips - a.chips;
      })[0];
      if (u2 && dc.indexOf(u2) < 0) {
        dc = dc.slice(0, 2).concat([u2]);
        V.bluffed = true;
      }
    }
    if (!dc.length || t === 3 && bst && quant(bst.score) >= 0.9 && rnd2() < 0.7) {
      say("\u4EA4\u63DB\u3057\u306A\u3044");
      V.cpuBest = bst;
      await wait2(800);
      return;
    }
    dc.forEach(function(c) {
      c.by = "cpu";
    });
    withP(CPU, function() {
      Kit.Core.discard(dc);
    });
    say(dc.length + "\u679A \u6368\u3066\u305F");
    SFX2.tap();
    renderAll2();
    await wait2(800);
    var took = [], drew = 0, base = bst ? bst.score : 0;
    while (CPU.refill > 0) {
      var cands = ME.field.filter(function(c) {
        return (c.by === "me" || c.by === "guest") && c.chips + (c.bonus || 0) <= CPU.pts;
      }).sort(function(a, b) {
        return b.chips - a.chips;
      }).slice(0, V.opp.style === "collector" ? 3 : 1), pickC = null, gain = 0;
      cands.forEach(function(c) {
        var r = search(CPU.hand.concat([c]), V.rule, V.opp.lv, 160), g = (r ? r.score : 0) - base;
        if (g > gain) {
          gain = g;
          pickC = c;
        }
      });
      if (!pickC && V.opp.style === "collector" && cands.length && rnd2() < 0.5) pickC = cands[0];
      if (pickC && gain >= 0) {
        withP(CPU, function() {
          Kit.Core.take(pickC);
        });
        took.push(Kit.cardText(pickC));
        base = Math.max(base, base + gain);
      } else {
        withP(CPU, function() {
          Kit.Core.drawOne();
        });
        drew++;
      }
    }
    say((took.length ? "\u5834\u304B\u3089\u300C" + took.join("\u300D\u300C") + "\u300D\u3092\u53D6\u3063\u305F" : "") + (took.length && drew ? "\u3001" : "") + (drew ? "\u5C71\u304B\u3089" + drew + "\u679A \u5F15\u3044\u305F" : ""));
    V.cpuBest = best();
    renderAll2();
    await wait2(900);
  }
  function quant(s) {
    var q = QS[V.opp.lv];
    return s < q[0] * 0.8 ? 0.1 : s < q[0] ? 0.25 : s < q[1] ? 0.45 : s < q[2] ? 0.7 : s < q[2] * 1.3 ? 0.85 : 0.95;
  }
  function cpuBet(face, raised, t) {
    var sc = V.cpuBest ? V.cpuBest.score : 0, q = quant(sc), st = V.opp.style, early = t === 1 ? 0.1 : 0, r = rnd2();
    if (V.bluffed) q = Math.max(q, 0.6);
    if (!face) {
      var th = st === "careful" ? 0.65 : st === "bluff" ? 0.45 : 0.55, bl = st === "bluff" ? 0.35 : st === "careful" ? 0.03 : 0.1;
      return q >= th || r < bl ? "bet" : "check";
    }
    var fold = (st === "careful" ? 0.4 : st === "bluff" ? 0.2 : 0.3) - early, rz = st === "bluff" ? 0.75 : st === "careful" ? 0.9 : 0.85;
    if (V.med.me === 0) rz = 2;
    if (q < fold && !(st === "bluff" && r < 0.4)) return "fold";
    if (!raised && (q >= rz || st === "bluff" && r < 0.15) && V.med.cpu > face) return "raise";
    return "call";
  }
  async function betting(t, order) {
    var amt = BETS[t], c0 = { me: V.c.me, cpu: V.c.cpu }, raised = false, acted = {}, i = 0, guard = 0;
    while (guard++ < 8) {
      var who = order[i % 2], oth = order[(i + 1) % 2], face = V.c[oth] - c0[oth] - (V.c[who] - c0[who]);
      if (face > 0 && V.med[who] === 0) face = 0;
      if (who !== "me" && V.med.me === 0 && face === 0) {
        acted[who] = 1;
      } else {
        var a;
        if (who === "me") {
          V.betQ = { face, raised };
          V.turnTxt = '<span class="you">\u8CED\u3051</span>:' + (face ? V.opp.name + "\u304C " + face + " \u8CED\u3051\u305F\u3002\u53D7\u3051\u308B?" : "\u30D9\u30C3\u30C8\u3059\u308B?(1\u56DE\u76EE\u306F" + BETS[1] + "\u30FB\u6700\u5F8C\u306F" + BETS[3] + ")");
          a = (await ask("bet")).a;
          if (V.quit) return null;
        } else {
          V.phase = "cpu";
          V.turnTxt = V.opp.name + "\u304C\u8003\u3048\u3066\u3044\u308B\u2026";
          renderAll2();
          await wait2(700);
          a = cpuBet(face, raised, t);
        }
        if (a === "fold") {
          say(who === "cpu" ? "\u964D\u308A\u308B\u2026" : "\u3084\u3063\u305F!", who === "cpu" ? "sad" : "happy");
          return who === "me" ? "cpu" : "me";
        }
        if (a === "check") {
          if (who === "cpu") say("\u30C1\u30A7\u30C3\u30AF");
          acted[who] = 1;
        }
        if (a === "call") {
          pay(who, face);
          if (who === "cpu") say("\u30B3\u30FC\u30EB");
          SFX2.coin();
          acted[who] = 1;
        }
        if (a === "bet" || a === "raise") {
          pay(who, face + amt);
          if (a === "raise") raised = true;
          acted = {};
          acted[who] = 1;
          if (who === "cpu") say(a === "bet" ? "\u30D9\u30C3\u30C8 " + amt + "!" : "\u30EC\u30A4\u30BA!! +" + amt, "hot");
          SFX2.coin();
        }
        renderAll2();
      }
      var me2 = V.c.me - c0.me, cp2 = V.c.cpu - c0.cpu;
      if (acted.me && acted.cpu && (me2 === cp2 || V.med.me === 0 || V.med.cpu === 0)) return null;
      i++;
    }
    return null;
  }
  function settle(winner) {
    var p = V.pot;
    if (winner === "draw") {
      V.med.me += Math.floor(p / 2);
      V.med.cpu += p - Math.floor(p / 2);
    } else V.med[winner] += p;
    V.pot = 0;
    if (winner === "me") V.stats.win++;
    else if (winner === "cpu") V.stats.lose++;
    return p;
  }
  async function foldEnd(winner) {
    var p = settle(winner);
    G_2.busy = false;
    renderAll2();
    if (winner === "me") SFX2.win();
    else SFX2.lose();
    var o = el2("div", "modal", '<div class="box sd"><h2>' + (winner === "me" ? V.opp.name + "\u304C\u964D\u308A\u305F!" : "\u964D\u308A\u305F") + '</h2><p class="res' + (winner === "me" ? " w" : " l") + '">' + (winner === "me" ? "\u{1FA99} +" + p : "\u{1FA99} " + p + " \u306F " + V.opp.name + "\u3078") + '</p><button class="btn go" id="nx">\u3064\u304E\u306E\u30CF\u30F3\u30C9\u3078</button></div>');
    Kit.root().appendChild(o);
    $2("#nx", o).onclick = function() {
      o.remove();
      nextHand();
    };
  }
  function miniRow(row, ev) {
    var w = el2("div", "srow"), sf = Kit.surfaceOf(row, ev);
    row.forEach(function(c, i) {
      var e = Kit.cardEl(c, "field", 0, sf ? sf[i] : null);
      e.classList.add("mini");
      w.appendChild(e);
    });
    return w;
  }
  async function showdown() {
    V.phase = "show";
    V.turnTxt = "\u52DD\u8CA0!";
    G_2.busy = true;
    renderAll2();
    var ev = Kit.evaluate(ME.row), my = ev.state === "ok" ? scoreRow(ME.row, ev, V.rule) : null, cb = V.cpuBest = best(), cs = cb ? cb.sc : null, Q = V.quest.secret;
    var bon = function(f, who) {
      var o2 = [];
      if (V.ri[who]) o2.push(["\u{1F004} \u30EA\u30FC\u30C1", riPct(V.ri[who])]);
      if (f && Kit.missionHit(V.mission, f)) o2.push(["\u{1F3AF} \u304A\u984C", 10]);
      if (f && Kit.questHit(Q, f)) o2.push(["\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8", Kit.Q_PCT[Q.tier]]);
      return o2;
    };
    var mb = my ? bon(ev.f, "me") : [], cbn = cs ? bon(cb.ev.f, "cpu") : [], pc = function(l) {
      return Math.min(50, l.reduce(function(a, x) {
        return a + x[1];
      }, 0));
    };
    var mt = my ? Math.floor(myMul(my.total) * (1 + pc(mb) / 100)) : 0, ct = cs ? Math.floor(cs.total * (1 + pc(cbn) / 100)) : 0, win = mt > ct ? "me" : mt < ct ? "cpu" : "draw";
    var bl = function(l) {
      return l.length ? '<div class="bon">' + l.map(function(x) {
        return x[0] + " +" + x[1] + "%";
      }).join(" \u30FB ") + (pc(l) < l.reduce(function(a, x) {
        return a + x[1];
      }, 0) ? "(\u4E0A\u9650 +50%)" : "") + "</div>" : "";
    };
    if (my && ev.f.colloc === "good" && Kit.addCombo(ev.f.pair)) Kit.flash("\u{1F4D6} \u540D\u30B3\u30F3\u30D3\u56F3\u9451\u306B\u767B\u9332!\u300C" + ev.f.pair + "\u300D");
    var o = el2("div", "modal", '<div class="box sd"><h2>\u52DD\u8CA0!</h2><div class="side me"><div class="who">\u3042\u306A\u305F' + (my ? '<button class="spk" id="spm">\u{1F50A}</button>' : "") + '</div><div class="tx">' + (my ? ev.text : "(\u6587\u306B\u306A\u3063\u3066\u3044\u306A\u3044 \u2192 0\u70B9)") + "</div>" + (my ? '<div class="yk2">' + my.y.name + "</div>" : "") + '<div class="cm2"><b class="chips">' + (my ? my.chips : 0) + '</b>\xD7<b class="mult">' + (my ? my.mult : 0) + '</b>= <b class="tot" id="mt">0</b></div>' + bl(mb) + (mulNote() ? '<div class="bon">' + mulNote().replace("<br>", "") + "</div>" : "") + '</div><div class="side cp"><div class="who">' + V.opp.face + " " + V.opp.name + (cb ? '<button class="spk" id="spc">\u{1F50A} \u805E\u304F</button>' : "") + '</div><div id="crow"></div><div class="tx">' + (cb ? cb.ev.text : "(\u6587\u304C\u4F5C\u308C\u306A\u304B\u3063\u305F)") + "</div>" + (cs ? '<div class="yk2">' + cs.y.name + "</div>" : "") + '<div class="cm2"><b class="chips">' + (cs ? cs.chips : 0) + '</b>\xD7<b class="mult">' + (cs ? cs.mult : 0) + '</b>= <b class="tot" id="ct">0</b></div>' + bl(cbn) + '</div><div class="qrev2">\u{1F512} \u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u306F\u300C<b>' + Q.label + "</b>\u300D(" + Kit.TIER_JA[Q.tier] + " +" + Kit.Q_PCT[Q.tier] + '%)</div><p class="res" id="rs"></p><button class="btn go" id="nx" style="visibility:hidden">\u3064\u304E\u306E\u30CF\u30F3\u30C9\u3078</button></div>');
    Kit.root().appendChild(o);
    if (cb) $2("#crow", o).appendChild(miniRow(cb.row, cb.ev));
    var rv = my ? Kit.reviewItems(ME.row, ev) : null;
    if (my) Kit.recordHist(V.hist = V.hist || [], ME.row, ev, mt);
    if (rv) {
      var rb = el2("button", "btn ghost small", "\u{1F4D6} \u3053\u306E\u6587\u306E\u89E3\u8AAC");
      rb.onclick = function() {
        Kit.reviewFlow(rv);
      };
      $2(".side.me", o).appendChild(rb);
    }
    if ($2("#spm", o)) $2("#spm", o).onclick = function() {
      Kit.speak(ev.text);
    };
    if ($2("#spc", o)) $2("#spc", o).onclick = function() {
      Kit.speak(cb.ev.text);
    };
    if (my) {
      Kit.speak(ev.text);
    }
    await wait2(400);
    for (var i = 1; i <= 15; i++) {
      $2("#mt", o).textContent = Math.round(mt * i / 15).toLocaleString();
      $2("#ct", o).textContent = Math.round(ct * i / 15).toLocaleString();
      if (i % 3 === 0) SFX2.chip(i);
      await wait2(45);
    }
    await wait2(my ? 1200 : 300);
    var p = settle(win);
    $2("#rs", o).className = "res " + (win === "me" ? "w" : win === "cpu" ? "l" : "");
    $2("#rs", o).textContent = win === "me" ? "\u52DD\u3061! \u{1FA99} +" + p : win === "cpu" ? "\u8CA0\u3051\u2026 \u{1FA99} " + p + " \u306F " + V.opp.name + "\u3078" : "\u5F15\u304D\u5206\u3051(\u534A\u5206\u305A\u3064)";
    if (win === "me") {
      SFX2.win();
      say(pick2(["\u304F\u3063\u2026", "\u3084\u308B\u306D", "\u307E\u3044\u3063\u305F"]));
    } else if (win === "cpu") {
      SFX2.lose();
      say(pick2(["\u3044\u305F\u3060\u304D!", "\u3075\u3075\u3093", "\u307E\u3060\u307E\u3060"]));
    }
    if (rv) {
      await wait2(900);
      await Kit.reviewAfter(rv);
    }
    $2("#nx", o).style.visibility = "visible";
    G_2.busy = false;
    renderAll2();
    $2("#nx", o).onclick = function() {
      o.remove();
      nextHand();
    };
  }
  function endMatch(quit) {
    var won = !quit && V.med.me > V.med.cpu, draw = !quit && V.med.me === V.med.cpu;
    var rec = Kit.store.get("vs") || {}, r = rec[V.opp.id] || { w: 0, l: 0 };
    if (won) r.w++;
    else if (!draw) r.l++;
    rec[V.opp.id] = r;
    Kit.store.set("vs", rec);
    G_2.vs = null;
    if (won) SFX2.win();
    else SFX2.lose();
    var s = Kit.screen('<div class="end"><h1>' + (won ? "\u{1F3C6} \u52DD\u3061!" : draw ? "\u5F15\u304D\u5206\u3051" : "\u8CA0\u3051\u2026") + '</h1><div class="st">' + V.opp.face + " " + V.opp.name + ' \u3068\u306E\u5BFE\u6226</div><div class="tot">\u3042\u306A\u305F \u{1FA99}' + V.med.me + " \u30FB " + V.opp.name + " \u{1FA99}" + V.med.cpu + '</div><div class="st">\u30CF\u30F3\u30C9 ' + V.stats.win + "\u52DD " + V.stats.lose + "\u6557 \u30FB \u901A\u7B97 " + r.w + "\u52DD " + r.l + "\u6557</div>" + ((V.hist || []).length ? '<button class="btn ghost" id="hs">\u{1F4DA} \u4ECA\u56DE\u306E\u6587\u3092\u3075\u308A\u304B\u3048\u308B(' + V.hist.length + ")</button>" : "") + '<button class="btn go" id="re">\u3082\u3046\u4E00\u56DE</button><button class="btn vs" id="ot">\u76F8\u624B\u3092\u304B\u3048\u308B</button><button class="btn ghost" id="tt">\u30BF\u30A4\u30C8\u30EB\u3078</button></div>');
    if ($2("#hs", s)) {
      var hl = V.hist;
      $2("#hs", s).onclick = function() {
        Kit.histModal(hl);
      };
    }
    $2("#re", s).onclick = function() {
      start(V.opp);
    };
    $2("#ot", s).onclick = function() {
      Kit.showTitle();
      pickOpp();
    };
    $2("#tt", s).onclick = function() {
      Kit.showTitle();
    };
  }
  var VS = { start, _search: search, _score: scoreRow, _V: function() {
    return V;
  }, _me: function() {
    return ME;
  }, _cpu: function() {
    return CPU;
  }, OPPS };

  // games/cards/game.js
  registerVS(VS);
  function migrate(store2) {
    if (store2.get("_migrated")) return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("chunkcards:")) {
          const n = k.slice(11);
          if (store2.get(n) == null) store2.set(n, JSON.parse(localStorage.getItem(k)));
        }
      }
    } catch (e) {
    }
    store2.set("_migrated", 1);
  }
  var game_default = {
    id: "cards",
    name: "\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9",
    right: "game:cards",
    async mount(el3, ctx) {
      migrate(ctx.store);
      bindStore(ctx.store);
      bindCore({ sound: ctx.core.sound, speech: ctx.core.speech });
      el3.classList.add("ct-cards");
      const root2 = document.createElement("div");
      root2.className = "cc-app";
      el3.appendChild(root2);
      const off = mount(root2);
      const mo = new MutationObserver(() => ctx.showBack(!!(root2.querySelector("#go") || root2.querySelector(".end"))));
      mo.observe(root2, { childList: true, subtree: true });
      ctx.showBack(true);
      return { unmount() {
        mo.disconnect();
        off && off();
        try {
          ctx.core.speech.stop();
        } catch (e) {
        }
        root2.remove();
      } };
    }
  };

  // games/index.js
  var GAMES = { cards: game_default };

  // apps/solo/main.js
  var app = window.__APP__;
  var core = createCore({ ...app, backButton: false });
  document.body.style.background = "#0b1626";
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
