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
  function createSpeech(settings2) {
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
      speak(text, opt2 = {}) {
        if (!settings2.get("voice")) {
          opt2.onend && setTimeout(opt2.onend, 0);
          return;
        }
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          if (voice) u.voice = voice;
          u.rate = (opt2.rate || 1) * settings2.get("rate");
          if (opt2.onend) u.onend = u.onerror = opt2.onend;
          speechSynthesis.speak(u);
        } catch (e) {
          opt2.onend && opt2.onend();
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
  function createSound(settings2) {
    let ac = null, sfx2 = null, bgm = null;
    const ensure = () => {
      if (!ac) {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          sfx2 = ac.createGain();
          bgm = ac.createGain();
          sfx2.connect(ac.destination);
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
      sfx2.gain.value = settings2.get("sfx");
      bgm.gain.value = settings2.get("bgm");
    };
    settings2.onChange(apply);
    return {
      ctx: ensure,
      get sfxBus() {
        ensure();
        return sfx2;
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
        g.connect(sfx2);
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
    const settings2 = () => {
      const s = core2.settings, row = (k, label, min, max, step2) => `<label class="cs-row"><span>${label}</span><input type="range" id="cs-${k}" min="${min}" max="${max}" step="${step2}" value="${s.get(k)}"></label>`;
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
    return { sheet, toast: toast2, settings: settings2, profile };
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
    let cur2 = null;
    const close = () => {
      if (!cur2) return;
      const c = cur2;
      cur2 = null;
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
        return cur2 && cur2.game.id;
      },
      async open(game, opts = {}) {
        if (cur2) close();
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
        cur2 = { game, el, inst: null };
        ctx.report("open");
        try {
          const inst = await game.mount(el, ctx);
          if (cur2 && cur2.el === el) cur2.inst = inst || {};
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
    const D = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map(), PH2 = /* @__PURE__ */ new Map();
    let state = 0, wait2 = null;
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
        if (!PH2.has(ws[0])) PH2.set(ws[0], []);
        PH2.get(ws[0]).push([ws, m]);
      });
    };
    const ready = () => {
      if (state === 2) return Promise.resolve();
      if (!wait2) {
        state = 1;
        wait2 = loadScript(base + "core/dict/data.js").then(() => {
          state = 2;
        }, (e) => {
          state = 0;
          wait2 = null;
          throw e;
        });
      }
      return wait2;
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
        [.../* @__PURE__ */ new Set([norm(words[i]), lem(words[i])])].forEach((k) => (PH2.get(k) || []).forEach(([ws, m]) => {
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
    const S2 = Object.assign({ font: "m", lines: 1, seg: true, role: true, ja: true, always: false, view: "read", disp: "easy" }, store.get("settings") || {});
    const save = () => store.set("settings", S2);
    let cur2 = null;
    function open(story, opts = {}) {
      if (cur2) cur2.close(true);
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
        view: S2.view,
        gramOn: !!S2.always,
        showJa: false,
        info: null,
        fullOpen: false,
        saying: false,
        hintPolicy: test ? story.hint || "none" : "grammar",
        hintCost: test ? story.hintCost == null ? 20 : +story.hintCost : 0
      };
      const sen = () => sens[RD.si];
      const view = () => test ? "solve" : qs.length ? RD.view : "read";
      const applyFont = () => root.style.setProperty("--laneFont", FONT[S2.font] + "px");
      const speak = (t) => core2.speech.speak(t, { rate: 0.9 });
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
      const lineX2 = () => Math.round($2("lane").clientWidth * 0.34);
      const ro = new ResizeObserver(() => render(true));
      if (!dictReady) dict.ready().then(() => {
        dictReady = true;
        if (cur2 && cur2.root === root) infoUI();
      }, () => {
      });
      const sheet = (html, closable = true) => {
        $2("sheet").innerHTML = html;
        $2("modal").hidden = false;
        $2("modal").onclick = (e) => {
          if (closable && e.target === $2("modal")) closeSheet2();
        };
      };
      const closeSheet2 = () => {
        $2("modal").hidden = true;
        $2("sheet").innerHTML = "";
      };
      const ask2 = (msg, yes) => new Promise((ok) => {
        sheet(`<p class="note" style="white-space:pre-line;font-size:14px">${esc(msg)}</p><div class="btns"><button class="ghost" data-a="no">\u3084\u3081\u308B</button><button class="primary" data-a="yes">${esc(yes)}</button></div>`, false);
        $2("sheet").querySelector("[data-a=no]").onclick = () => {
          closeSheet2();
          ok(false);
        };
        $2("sheet").querySelector("[data-a=yes]").onclick = () => {
          closeSheet2();
          ok(true);
        };
      });
      function modeUI(v) {
        const hasQ = qs.length > 0;
        $2("seg").hidden = test || !hasQ;
        $2("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
        $2("gram").hidden = v !== "read";
        $2("gram").classList.toggle("on", !!RD.gramOn);
        $2("jaBtn").hidden = v !== "read" || test || S2.ja === false;
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
        const P = dict.POSN, base = e.w.toLowerCase() !== clean.toLowerCase() ? `<small class="riBase">\uFF08\u5143\u306E\u5F62 ${esc(e.w)}${e.neg ? "\uFF0Bnot" : ""}\uFF09</small>` : "";
        return `<div><span class="posTag">${P[main[0]] || main[0]}</span> <b>${esc(clean)}</b>${base}${ja ? ` \uFF1D ${esc(main[1])}` : ""}` + (rest.length ? `<div class="riNote">\u307B\u304B\u306B\uFF1A${rest.map(([t, m]) => (P[t] || t) + (ja ? `\uFF08${esc(m)}\uFF09` : "")).join("\u3001")}</div>` : "") + phH + "</div>";
      }
      function infoUI() {
        const el = $2("info");
        if (view() !== "read") {
          el.innerHTML = "";
          el.hidden = true;
          return;
        }
        const sn = sen(), d2 = S2.disp, ja = RD.showJa, roleOn = RD.gramOn && S2.role !== false;
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
        <div class="row"><label>\u533A\u5207\u308A</label>${onoff("seg", S2.seg !== false)}</div>
        <div class="row"><label>\u5F79\u5272\u306E\u8272</label>${onoff("role", S2.role !== false)}</div>
        <div class="row"><label>\u65E5\u672C\u8A9E\u306E\u300C\u8A33\u300D\u30DC\u30BF\u30F3</label>${onoff("ja", S2.ja !== false)}</div>
        <div class="row"><label>\u6700\u521D\u304B\u3089\u30C1\u30E3\u30F3\u30AF\u3067\u898B\u308B</label>${onoff("always", !!S2.always)}</div>
        <div class="row"><label>\u5F79\u5272\u306E\u540D\u524D</label>${sel("disp", S2.disp, [["easy", "\u304B\u3093\u305F\u3093\uFF08\u8AB0\u304C\u30FB\u3059\u308B\uFF09"], ["gram", "\u6587\u6CD5\uFF08\u4E3B\u8A9E\u30FB\u52D5\u8A5E\uFF09"], ["both", "\u4E21\u65B9"]])}</div>`}
        <div class="row"><label>\u8868\u793A\u3059\u308B\u6587\u306E\u6570</label>${sel("lines", S2.lines, [["1", "1\u6587\uFF08\u4ECA\u306E\u6587\u3060\u3051\uFF09"], ["2", "2\u6587\uFF08\u6B21\u306E\u6587\u3082\uFF09"], ["3", "3\u6587\uFF08\u524D\u5F8C\u306E\u6587\u3082\uFF09"]])}</div>
        <p class="note" style="font-size:10px">\u5358\u8A9E\u306E\u8F9E\u66F8\uFF1AEJDict\uFF08CC0\uFF09\uFF0F\u54C1\u8A5E\uFF1AWordNet 3.1\uFF08Princeton University\uFF09\uFF0F\u8A9E\u306E\u9078\u3073\u65B9\uFF1AFrequencyWords\uFF08CC BY-SA 4.0\uFF09</p>
        <div class="btns"><button class="primary" data-a="close">\u9589\u3058\u308B</button></div>`);
        $2("sheet").querySelectorAll("select").forEach((s) => s.onchange = () => {
          const k = s.dataset.s, v = s.value;
          if (k === "lines") S2.lines = +v;
          else if (k === "disp") S2.disp = v;
          else {
            S2[k] = v === "on";
            if (k === "always") RD.gramOn = S2.always;
          }
          save();
        });
        $2("sheet").querySelector("[data-a=close]").onclick = () => {
          closeSheet2();
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
        const unitEnds2 = new Set(sn.units.map((u) => u.e));
        const v = view(), gOn = v === "read" ? RD.gramOn : RD.hintOn && RD.hintPolicy === "grammar";
        const segOn = gOn && (v !== "read" || S2.seg !== false), roleOn = gOn && (v !== "read" || S2.role !== false);
        const st = $2("strip");
        const selOn = RD.sel && RD.sel.si === RD.si, startOn = RD.start && RD.start.si === RD.si;
        st.innerHTML = sn.words.map((w, i) => {
          let cls = "w";
          if (i >= ra && i <= rb) cls += " sel";
          else if (roleOn) cls += " r" + wordRole(sn, i);
          if (RD.info && RD.info.si === RD.si && i >= RD.info.s && i <= RD.info.e) cls += " hl";
          const pre = selOn && i === ra || startOn && i === RD.start.g ? '<span class="cutmark brk">\uFF3B</span>' : "";
          let post = selOn && i === rb ? '<span class="cutmark brk">\uFF3D</span>' : "";
          if (!post && segOn && unitEnds2.has(i) && i < n - 1) post = '<span class="cutmark hint">\uFF5C</span>';
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
        st.style.transform = `translate(${lineX2() - RD.gpos[RD.p]}px,-50%)`;
        $2("cutline").style.left = lineX2() + "px";
        const bar = $2("bar");
        bar.max = n;
        bar.value = RD.p;
        const k = S2.lines === 3 ? 2 : S2.lines === 2 ? 1 : 0, ctxL = (step2, mark) => {
          const out = [];
          for (let j = 1; j <= k; j++) {
            const t = sens[RD.si + step2 * j];
            if (t) out.push(`<div class="rdCtx${j > 1 ? " far" : ""}">${mark} ${esc(t.en)}</div>`);
          }
          return out;
        };
        $2("prevLine").innerHTML = ctxL(-1, "\u25B2").reverse().join("");
        $2("nextLine").innerHTML = ctxL(1, "\u25BC").join("");
        $2("lines").textContent = "\u8868\u793A " + S2.lines;
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
        if (B("cut")) B("cut").onclick = cut2;
      }
      function cut2() {
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
      function say() {
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
          closeSheet2();
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
            if (!await ask2(`\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u307E\u3059\u3002
${names} \u306F0\u70B9\u306B\u306A\u308A\u307E\u3059\u3002\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F`, "\u63D0\u51FA\u3059\u308B")) return;
          } else if (!await ask2("\u63D0\u51FA\u3057\u307E\u3059\u304B\uFF1F\n\u63D0\u51FA\u3059\u308B\u3068\u7B54\u3048\u306F\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3002", "\u63D0\u51FA\u3059\u308B")) return;
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
          closeSheet2();
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
        S2.lines = S2.lines >= 3 ? 1 : S2.lines + 1;
        save();
        render(true);
      };
      $2("seg").querySelectorAll("button").forEach((b) => b.onclick = () => {
        S2.view = b.dataset.v;
        save();
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
          else cut2();
        }
        d = null;
      };
      gest.addEventListener("pointerup", end);
      gest.addEventListener("pointercancel", end);
      $2("bar").addEventListener("input", (e) => move(+e.target.value, true));
      $2("say").onclick = say;
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
        const i = FK.indexOf(S2.font);
        if (i > 0) {
          S2.font = FK[i - 1];
          save();
          applyFont();
          render(true);
        }
      };
      $2("fontP").onclick = () => {
        const i = FK.indexOf(S2.font);
        if (i < FK.length - 1) {
          S2.font = FK[i + 1];
          save();
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
        if (!cur2 || cur2.root !== root) return;
        cur2 = null;
        RV.tok++;
        core2.speech.stop();
        ro.disconnect();
        root.remove();
        if (!silent && opts.onClose) opts.onClose();
      }
      cur2 = { root, close };
      applyFont();
      ro.observe($2("lane"));
      render(true);
      core2.events.report("reader", "open", { title: story.title });
      return { close: () => close(true) };
    }
    return { open, close: () => cur2 && cur2.close(true), get isOpen() {
      return !!cur2;
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

  // games/chunkchunk/src/view.html
  var view_default = '<!-- \u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\u306E\u753B\u9762\uFF08game.js \u304C\u7BB1\u306E\u4E2D\u306B\u5165\u308C\u308B\uFF09\u3002\u65BD\u8A2D\u306E\u5165\u53E3\u306F #title \u306E data-face\uFF08arcade\uFF0Flesson\uFF0Flibrary\uFF09 -->\n\n<div class="app">\n  <header class="top">\n    <div class="logo">\u30C1\u30E3\u30F3\u30AF<span>\u30C1\u30E3\u30F3\u30AF</span></div>\n    <div class="meta"><span id="stageText">\u97621</span><span id="progText">1/6</span><span id="timeText" hidden>\u23F1 0.0</span><span><b id="score">0</b> pt</span></div>\n    <button id="gear" class="gear">\u8A2D\u5B9A</button>\n  </header>\n\n  <section class="board" id="board" aria-live="polite">\n    <div id="hist"></div>\n    <div class="line" id="line"></div>\n  </section>\n\n  <div class="tapZone" id="tapZone">\n  <section class="laneWrap" id="laneWrap" aria-label="\u6D41\u308C\u3066\u304F\u308B\u82F1\u6587">\n    <div class="strip" id="strip"></div>\n    <div class="cutline" id="cutline" data-lbl="\u3053\u3053\u3067\u533A\u5207\u308B"></div>\n    <div class="fadeL"></div><div class="fadeR"></div>\n  </section>\n  <div class="preview" id="preview"></div>\n\n  <section class="stage" id="stage" aria-label="\u6587\u306E\u7D75">\n    <div class="sgHint" id="sgHint">\u30C1\u30E3\u30F3\u30AF\u3092\u5F53\u3066\u308B\u3068\u3001\u7D75\u304C\u3067\u304D\u3066\u3044\u304F</div>\n    <span class="sgPlace" id="sgPlace"></span><span class="sgSign" id="sgSign"></span>\n    <div class="sgTime" id="sgTime"></div>\n    <div class="sgChar" id="sgChar"><span class="sgFace" id="sgFace"></span><span class="sgArt" id="sgArt"></span><span class="sgCap" id="sgCap"></span></div>\n    <div class="sgObj" id="sgObj"></div>\n    <span class="sgQ" id="sgQ"></span>\n    <span class="sgDone" id="sgDone">\u5B8C\u6210\uFF01</span>\n  </section>\n  <input type="range" id="scrub" class="scrub" min="0" max="10" value="0" step="1" hidden aria-label="\u30C9\u30E9\u30C3\u30B0\u3067\u4E00\u6C17\u306B\u5148\u3078\u9032\u3080">\n  <div class="ctrlRow">\n    <div class="navBtns" id="navBtns" hidden><button id="backBtn" class="navBtn" disabled aria-label="\u623B\u308B\uFF08\u3053\u306E\u30E2\u30FC\u30C9\u3067\u306F\u623B\u308C\u306A\u3044\uFF09">\u25C0</button><button id="fwdBtn" class="navBtn" aria-label="1\u8A9E\u9032\u3080">\u25B6</button></div>\n    <button id="cutBtn" class="cutBtn">\u533A\u5207\u308B<small id="cutHint">\u3053\u3053\u304B\u3089\u4E0B\u306A\u3089\u3001\u3069\u3053\u3092\u30BF\u30C3\u30D7\u3057\u3066\u3082\u533A\u5207\u308C\u308B</small></button>\n  </div>\n  </div>\n</div>\n\n<div id="count" class="count" hidden></div>\n<div id="startBox" class="modal" hidden style="align-items:center"><div class="sheet" style="text-align:center;align-items:center">\n  <h2 id="startTitle">\u97621</h2>\n  <p class="note" id="startNote"></p>\n  <button class="primary" id="startBtn" style="width:100%">\u30BF\u30C3\u30D7\u3057\u3066\u30B9\u30BF\u30FC\u30C8</button></div></div>\n<div id="title" class="titleScr" data-face="arcade" hidden>\n  <!-- \u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC\uFF1A\u904A\u3093\u3067\u935B\u3048\u308B -->\n  <div class="faceGame">\n    <div class="gLogo"><span class="p">\u30C1\u30E3\u30F3\u30AF</span><span class="b">\u30C1\u30E3\u30F3\u30AF</span></div>\n    <div class="gMenu">\n      <div class="tCard"><div class="tName">\u3055\u3089\u3055\u3089\u30C1\u30E3\u30F3\u30AF</div><div class="tDesc">\u81EA\u52D5\u3067\u6D41\u308C\u3066\u304F\u308B\u3088\uFF01</div>\n        <div class="tPlay"><button data-play="auto-one">\u30E9\u30F3\u30C0\u30E0</button><button data-play="auto-cont" class="b">\u304A\u306F\u306A\u3057</button></div></div>\n      <div class="tCard"><div class="tName">\u3088\u30FC\u3044\u3069\u3093\u30C1\u30E3\u30F3\u30AF</div><div class="tDesc">\u81EA\u5206\u3067\u9001\u3063\u3066\u3001\u306F\u3084\u304F\u5207\u308D\u3046\uFF01</div>\n        <div class="tPlay"><button data-play="manual-one">\u30E9\u30F3\u30C0\u30E0</button><button data-play="manual-cont" class="b">\u304A\u306F\u306A\u3057</button></div></div>\n      <div class="tCard"><div class="tName">\u30C1\u30E3\u30EC\u30F3\u30B8</div><div class="tDesc">30\u79D2\u30FB1\u5206\u3067\u3001\u4F55\u70B9\u3068\u308C\u308B\u304B\uFF01\uFF08\u5168\u30EC\u30D9\u30EB\u30FB\u81EA\u5206\u3067\u9001\u308B\uFF09</div>\n        <div class="tPlay"><button data-timed="30">30\u79D2</button><button data-timed="60" class="b">1\u5206</button></div>\n        <button class="tSet" data-rank style="margin-top:6px">\u30E9\u30F3\u30AD\u30F3\u30B0\u3092\u898B\u308B</button></div>\n      <p class="tDesc" id="lvHint" style="text-align:center;margin:2px 0 0"></p>\n      <button class="tSet" data-open-set>\u8A2D\u5B9A</button>\n      <button class="tSet" data-howto="arcade">\u2753 \u904A\u3073\u65B9</button>\n    </div>\n  </div>\n  <!-- \u5B66\u6821\uFF1A\u30C1\u30E3\u30F3\u30AF\u7DF4\u7FD2\uFF08\u81EA\u5206\u3067\u9001\u3063\u3066\u5207\u308B\u30FB\u5F79\u5272\u3082\u7B54\u3048\u308B\uFF09 -->\n  <div class="faceLesson faceStudy">\n    <img class="sChara" data-chara="boy" alt=""><div class="sLogo"><span class="a">CHUNK</span><span class="b">LESSON</span></div><div class="sSub">SCHOOL</div>\n    <div class="sMenu">\n      <button data-study="lesson"><b>Lesson</b><small>\u304A\u8A71\u3068\u30B2\u30FC\u30E0\u3067\u5B66\u3076\uFF1A\u300C\u8AAD\u3080\u30FB\u805E\u304F\u300D\u300C\u8A71\u3059\u30FB\u66F8\u304F\u300D\u304B\u3089\u9078\u3076</small><i>\u2192</i></button>\n      <button data-study="practice"><b>Chunk Practice</b><small>\u6587\u7AE0\u3092\u9078\u3093\u3067\u3001\u81EA\u5206\u3067\u9001\u3063\u3066\u5207\u308B\u30FB\u5F79\u5272\u3082\u7B54\u3048\u308B</small><i>\u2192</i></button>\n      <button data-study="random"><b>Random Practice</b><small>\u5185\u8535\u306E\u4F8B\u6587\u3068\u77ED\u6587\u304B\u3089\u3001\u30E9\u30F3\u30C0\u30E0\u306B\u7DF4\u7FD2</small><i>\u2192</i></button>\n      <button data-open-set><b>Settings</b><small>\u901F\u3055\u30FB\u6587\u5B57\u306E\u5927\u304D\u3055\u30FB\u97F3</small><i>\u2192</i></button>\n      <button data-howto="lesson"><b>How to Play</b><small>\u904A\u3073\u65B9</small><i>\u2192</i></button>\n    </div>\n    <div class="sMenu lessonSub" hidden>\n      <button data-study="story"><b>\u8AAD\u3080\u30FB\u805E\u304F</b><small>Chunk Story\uFF1A\u304A\u8A71\u3068\u30B2\u30FC\u30E0\u3067\u3001\u30C1\u30E3\u30F3\u30AF\u306E\u8AAD\u307F\u65B9\u3092\u5B66\u3076</small><i>\u2192</i></button>\n      <button data-study="make"><b>\u8A71\u3059\u30FB\u66F8\u304F</b><small>2\u4EBA\u306E\u3084\u308A\u3068\u308A\u3067\u3001\u6587\u3092\u4F5C\u308B</small><i>\u2192</i></button>\n      <button data-lesson-back><b>\u2190 \u3082\u3069\u308B</b><small>\u5B66\u6821\u306E\u30E1\u30CB\u30E5\u30FC\u3078</small><i></i></button>\n    </div>\n  </div>\n  <!-- \u56F3\u66F8\u9928\uFF1A\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0\u30FB\u9577\u6587\u306E\u767B\u9332\u3068\u5171\u6709 -->\n  <div class="faceLibrary faceStudy">\n    <img class="sChara" data-chara="girl" alt=""><div class="sLogo"><span class="a">CHUNK</span><span class="b">READING</span></div><div class="sSub">LIBRARY</div>\n    <div class="sMenu">\n      <button data-study="read"><b>Reading</b><small>\u9577\u6587\u3092\u8AAD\u3093\u3067\u8A2D\u554F\u306B\u7B54\u3048\u308B\uFF08\u5185\u8535\u30FB\u307F\u3093\u306A\u306E\u9577\u6587\u30FBMy Texts\uFF09</small><i>\u2192</i></button>\n      <button data-study="texts"><b>My Texts</b><small>\u9577\u6587\u30FB\u77ED\u6587\u306E\u767B\u9332\u3001\u554F\u984C\u306E\u4F5C\u6210\u3001\u5171\u6709</small><i>\u2192</i></button>\n      <button data-open-set><b>Settings</b><small>\u901F\u3055\u30FB\u6587\u5B57\u306E\u5927\u304D\u3055\u30FB\u97F3</small><i>\u2192</i></button>\n      <button data-howto="library"><b>How to Play</b><small>\u904A\u3073\u65B9</small><i>\u2192</i></button>\n    </div>\n  </div>\n</div>\n\n<!-- My Texts\uFF08\u9577\u6587\u306E\u767B\u9332\u30FB\u554F\u984C\u306E\u4F5C\u6210\uFF09 -->\n<div id="edView" class="edView" hidden>\n  <header class="top"><button class="gear" id="edBack">\u2190 Back</button><div class="rdStory" id="edHead">My Texts</div></header>\n  <div id="edBody" class="edBody"></div>\n</div>\n\n<!-- \u5F79\u5272\u3092\u7B54\u3048\u308B\u30DC\u30BF\u30F3\uFF08Chunk Practice\uFF09 -->\n<div id="rolePick" class="rolePick" hidden></div>\n\n<div id="askBox" class="modal askBox" hidden><div class="sheet" role="alertdialog" aria-modal="true"><p id="askMsg" class="askMsg"></p><div class="btns"><button class="ghost" id="askNo">\u3084\u3081\u308B</button><button class="primary" id="askYes">OK</button></div></div></div>\n<div id="modal" class="modal" hidden><div id="sheet" class="sheet" role="dialog" aria-modal="true"></div></div>\n';

  // games/chunkchunk/src/data.js
  var ONE_TIERS = [
    { name: "\u57FA\u672C\u306E\u9806\u756A", list: [
      ["S:My little brother=\u5F1F\u306F | V:runs=\u8D70\u308B | P:in the park=\u516C\u5712\u3067 | T:every morning.=\u6BCE\u671D", "\u5F1F\u306F\u6BCE\u671D\u516C\u5712\u3067\u8D70\u308B\u3002"],
      ["S:My sister=\u59C9\u306F | V:read=\u8AAD\u3093\u3060 | O:an old book=\u53E4\u3044\u672C\u3092 | P:in the library=\u56F3\u66F8\u9928\u3067 | T:after lunch.=\u663C\u98DF\u306E\u3042\u3068", "\u59C9\u306F\u663C\u98DF\u306E\u3042\u3068\u56F3\u66F8\u9928\u3067\u53E4\u3044\u672C\u3092\u8AAD\u3093\u3060\u3002"],
      ["S:Our class=\u79C1\u305F\u3061\u306E\u30AF\u30E9\u30B9\u306F | V:eats=\u98DF\u3079\u308B | O:lunch=\u663C\u3054\u306F\u3093\u3092 | P:in the classroom=\u6559\u5BA4\u3067 | T:every day.=\u6BCE\u65E5", "\u79C1\u305F\u3061\u306E\u30AF\u30E9\u30B9\u306F\u6BCE\u65E5\u6559\u5BA4\u3067\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B\u3002"],
      ["S:My father=\u7236\u306F | V:makes=\u4F5C\u308B | O:a big dinner=\u8C6A\u83EF\u306A\u5915\u98DF\u3092 | P:in the kitchen=\u53F0\u6240\u3067 | T:on Sundays.=\u65E5\u66DC\u65E5\u306B", "\u7236\u306F\u65E5\u66DC\u65E5\u306B\u53F0\u6240\u3067\u8C6A\u83EF\u306A\u5915\u98DF\u3092\u4F5C\u308B\u3002"],
      ["S:Our English teacher=\u82F1\u8A9E\u306E\u5148\u751F\u306F | V:met=\u4F1A\u3063\u305F | O:my parents=\u79C1\u306E\u4E21\u89AA\u306B | P:at the station=\u99C5\u3067 | T:this morning.=\u4ECA\u671D", "\u82F1\u8A9E\u306E\u5148\u751F\u306F\u4ECA\u671D\u99C5\u3067\u79C1\u306E\u4E21\u89AA\u306B\u4F1A\u3063\u305F\u3002"],
      ["S:Tom and his friends=\u30C8\u30E0\u3068\u53CB\u3060\u3061\u306F | V:play=\u3059\u308B | O:soccer=\u30B5\u30C3\u30AB\u30FC\u3092 | P:in the park=\u516C\u5712\u3067 | T:after school.=\u653E\u8AB2\u5F8C", "\u30C8\u30E0\u3068\u53CB\u3060\u3061\u306F\u653E\u8AB2\u5F8C\u516C\u5712\u3067\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3002"],
      ["S:The children=\u5B50\u3069\u3082\u305F\u3061\u306F | V:swam=\u6CF3\u3044\u3060 | P:in the river=\u5DDD\u3067 | T:last summer.=\u53BB\u5E74\u306E\u590F", "\u5B50\u3069\u3082\u305F\u3061\u306F\u53BB\u5E74\u306E\u590F\u3001\u5DDD\u3067\u6CF3\u3044\u3060\u3002"],
      ["S:This chocolate cake=\u3053\u306E\u30C1\u30E7\u30B3\u30EC\u30FC\u30C8\u30B1\u30FC\u30AD\u306F | V:is=#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:very sweet.=\u3068\u3066\u3082\u7518\u3044", "\u3053\u306E\u30C1\u30E7\u30B3\u30EC\u30FC\u30C8\u30B1\u30FC\u30AD\u306F\u3068\u3066\u3082\u7518\u3044\u3002"],
      ["S:The man / by the window=\u7A93\u306E\u305D\u3070\u306E\u7537\u306E\u4EBA\u306F{\u7537\u306E\u4EBA/\u7A93\u306E\u305D\u3070\u306E} | V:is=\u3060#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:my father.=\u79C1\u306E\u7236", "\u7A93\u306E\u305D\u3070\u306E\u7537\u306E\u4EBA\u306F\u79C1\u306E\u7236\u3060\u3002"],
      ["S:Ken=\u30B1\u30F3\u306F | V:studies=\u52C9\u5F37\u3059\u308B | O:English=\u82F1\u8A9E\u3092 | P:at home=\u5BB6\u3067 | T:every night.=\u6BCE\u6669", "\u30B1\u30F3\u306F\u6BCE\u6669\u5BB6\u3067\u82F1\u8A9E\u3092\u52C9\u5F37\u3059\u308B\u3002"],
      ["S:My grandmother=\u7956\u6BCD\u306F | V:grows=\u80B2\u3066\u3066\u3044\u308B | O:red tomatoes=\u8D64\u3044\u30C8\u30DE\u30C8\u3092 | P:in her garden.=\u5EAD\u3067", "\u7956\u6BCD\u306F\u5EAD\u3067\u8D64\u3044\u30C8\u30DE\u30C8\u3092\u80B2\u3066\u3066\u3044\u308B\u3002"],
      ["S:I=\u79C1\u306F | V:know=\u77E5\u3063\u3066\u3044\u308B | O:the girl / with long hair.=\u9577\u3044\u9AEA\u306E\u5973\u306E\u5B50\u3092{\u5973\u306E\u5B50/\u9577\u3044\u9AEA\u306E}", "\u79C1\u306F\u9577\u3044\u9AEA\u306E\u5973\u306E\u5B50\u3092\u77E5\u3063\u3066\u3044\u308B\u3002"]
    ] },
    { name: "\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A", list: [
      ["S:I=\u79C1\u306F | V:usually go=\u3075\u3060\u3093\u884C\u304F#\u3075\u3060\u3093\u301C\u3059\u308B|\u983B\u5EA6\u306E\u526F\u8A5E\uFF0B\u52D5\u8A5E | P:to school=\u5B66\u6821\u3078 | M:by bus.=\u30D0\u30B9\u3067", "\u79C1\u306F\u3075\u3060\u3093\u30D0\u30B9\u3067\u5B66\u6821\u3078\u884C\u304F\u3002"],
      ["S:My aunt=\u304A\u3070\u306F | V:gave=\u304F\u308C\u305F | I:me=\u79C1\u306B | O:a nice present=\u3059\u3066\u304D\u306A\u30D7\u30EC\u30BC\u30F3\u30C8\u3092 | M:for my birthday.=\u8A95\u751F\u65E5\u306B", "\u304A\u3070\u306F\u8A95\u751F\u65E5\u306B\u79C1\u306B\u3059\u3066\u304D\u306A\u30D7\u30EC\u30BC\u30F3\u30C8\u3092\u304F\u308C\u305F\u3002"],
      ["S:I=\u79C1\u306F | V:want to / visit=\u8A2A\u308C\u305F\u3044{\u301C\u3057\u305F\u3044/\u8A2A\u308C\u308B}#\u301C\u3057\u305F\u3044|want to\uFF0B\u52D5\u8A5E | O:Kyoto=\u4EAC\u90FD\u3092 | M:with my friends=\u53CB\u3060\u3061\u3068 | T:next year.=\u6765\u5E74", "\u79C1\u306F\u6765\u5E74\u53CB\u3060\u3061\u3068\u4EAC\u90FD\u3092\u8A2A\u308C\u305F\u3044\u3002"],
      ["S:My mother=\u6BCD\u306F | V:was cooking=\u4F5C\u3063\u3066\u3044\u305F#\u301C\u3057\u3066\u3044\u305F|be\uFF0B\u52D5\u8A5Eing\uFF08\u9032\u884C\u5F62\uFF09 | O:curry=\u30AB\u30EC\u30FC\u3092 | T:at six.=6\u6642\u306B", "\u6BCD\u306F6\u6642\u306B\u30AB\u30EC\u30FC\u3092\u4F5C\u3063\u3066\u3044\u305F\u3002"],
      ["S:Our family=\u79C1\u305F\u3061\u306E\u5BB6\u65CF\u306F | V:will go=\u884C\u304F#\u301C\u3059\u308B\u3064\u3082\u308A|will\uFF0B\u52D5\u8A5E\uFF08\u672A\u6765\uFF09 | P:to the beach=\u6D77\u3078 | T:tomorrow.=\u660E\u65E5", "\u79C1\u305F\u3061\u306E\u5BB6\u65CF\u306F\u660E\u65E5\u6D77\u3078\u884C\u304F\u3002"],
      ["S:My best friend=\u89AA\u53CB\u306F | V:can swim=\u6CF3\u3052\u308B#\u301C\u3067\u304D\u308B|can\uFF0B\u52D5\u8A5E | M:very fast.=\u3068\u3066\u3082\u901F\u304F", "\u89AA\u53CB\u306F\u3068\u3066\u3082\u901F\u304F\u6CF3\u3052\u308B\u3002"],
      ["S:My family=\u79C1\u306E\u5BB6\u65CF\u306F | V:has lived=\u4F4F\u3093\u3067\u3044\u308B#\u305A\u3063\u3068\u301C\u3057\u3066\u3044\u308B|have\uFF0B\u904E\u53BB\u5206\u8A5E\uFF08\u73FE\u5728\u5B8C\u4E86\uFF09 | P:in this town=\u3053\u306E\u753A\u306B | T:for ten years.=10\u5E74\u9593", "\u79C1\u306E\u5BB6\u65CF\u306F\u3053\u306E\u753A\u306B10\u5E74\u9593\u4F4F\u3093\u3067\u3044\u308B\u3002"],
      ["S:This old temple=\u3053\u306E\u53E4\u3044\u5BFA\u306F | V:was built=\u5EFA\u3066\u3089\u308C\u305F#\u301C\u3055\u308C\u305F|be\uFF0B\u904E\u53BB\u5206\u8A5E\uFF08\u53D7\u3051\u8EAB\uFF09 | T:about 500 years ago.=\u7D04500\u5E74\u524D\u306B", "\u3053\u306E\u53E4\u3044\u5BFA\u306F\u7D04500\u5E74\u524D\u306B\u5EFA\u3066\u3089\u308C\u305F\u3002"],
      ["S:You=\u3042\u306A\u305F\u306F | V:must finish=\u7D42\u3048\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044#\u301C\u3057\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044|must\uFF0B\u52D5\u8A5E | O:your homework=\u5BBF\u984C\u3092 | T:before dinner.=\u5915\u98DF\u306E\u524D\u306B", "\u5915\u98DF\u306E\u524D\u306B\u5BBF\u984C\u3092\u7D42\u3048\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044\u3002"],
      ["S:The little baby=\u5C0F\u3055\u306A\u8D64\u3061\u3083\u3093\u304C | V:started to / cry=\u6CE3\u304D\u51FA\u3057\u305F{\u301C\u3057\u59CB\u3081\u305F/\u6CE3\u304F}#\u301C\u3057\u59CB\u3081\u305F|start to\uFF0B\u52D5\u8A5E | P:in the car.=\u8ECA\u306E\u4E2D\u3067", "\u5C0F\u3055\u306A\u8D64\u3061\u3083\u3093\u304C\u8ECA\u306E\u4E2D\u3067\u6CE3\u304D\u51FA\u3057\u305F\u3002"],
      ["S:My father=\u7236\u306F | V:always drinks=\u3044\u3064\u3082\u98F2\u3080#\u3044\u3064\u3082\u301C\u3059\u308B|\u983B\u5EA6\u306E\u526F\u8A5E\uFF0B\u52D5\u8A5E | O:hot coffee=\u71B1\u3044\u30B3\u30FC\u30D2\u30FC\u3092 | T:in the morning.=\u671D", "\u7236\u306F\u3044\u3064\u3082\u671D\u3001\u71B1\u3044\u30B3\u30FC\u30D2\u30FC\u3092\u98F2\u3080\u3002"],
      ["S:My uncle=\u304A\u3058\u306F | V:showed=\u898B\u305B\u3066\u304F\u308C\u305F | I:us=\u79C1\u305F\u3061\u306B | O:his old photos=\u53E4\u3044\u5199\u771F\u3092 | T:last night.=\u6628\u591C", "\u304A\u3058\u306F\u6628\u591C\u3001\u79C1\u305F\u3061\u306B\u53E4\u3044\u5199\u771F\u3092\u898B\u305B\u3066\u304F\u308C\u305F\u3002"]
    ] },
    { name: "\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A", list: [
      ["S:Emma=\u30A8\u30DE\u306F | V:takes care of=\u4E16\u8A71\u3092\u3059\u308B#\u301C\u306E\u4E16\u8A71\u3092\u3059\u308B|\u719F\u8A9E take care of | O:her little sister=\u59B9\u306E | T:after school.=\u653E\u8AB2\u5F8C", "\u30A8\u30DE\u306F\u653E\u8AB2\u5F8C\u3001\u59B9\u306E\u4E16\u8A71\u3092\u3059\u308B\u3002"],
      ["S:All the students=\u751F\u5F92\u5168\u54E1\u304C | V:are looking forward to=\u697D\u3057\u307F\u306B\u3057\u3066\u3044\u308B#\u301C\u3092\u697D\u3057\u307F\u306B\u3057\u3066\u3044\u308B|\u719F\u8A9E look forward to\uFF0B\u9032\u884C\u5F62 | O:the school trip.=\u4FEE\u5B66\u65C5\u884C\u3092", "\u751F\u5F92\u5168\u54E1\u304C\u4FEE\u5B66\u65C5\u884C\u3092\u697D\u3057\u307F\u306B\u3057\u3066\u3044\u308B\u3002"],
      ["S:Ken=\u30B1\u30F3\u306F | V:gets along with=\u4EF2\u304C\u3044\u3044#\u301C\u3068\u4EF2\u3088\u304F\u3059\u308B|\u719F\u8A9E get along with | O:his classmates.=\u30AF\u30E9\u30B9\u30E1\u30FC\u30C8\u3068", "\u30B1\u30F3\u306F\u30AF\u30E9\u30B9\u30E1\u30FC\u30C8\u3068\u4EF2\u304C\u3044\u3044\u3002"],
      ["S:My father=\u7236\u306F | V:gave up=\u3084\u3081\u305F#\u3042\u304D\u3089\u3081\u308B\u30FB\u3084\u3081\u308B|\u719F\u8A9E give up | O:smoking=\u305F\u3070\u3053\u3092 | T:last year.=\u53BB\u5E74", "\u7236\u306F\u53BB\u5E74\u305F\u3070\u3053\u3092\u3084\u3081\u305F\u3002"],
      ["S:My sister=\u59C9\u306F | V:is good at=\u5F97\u610F\u3060#\u301C\u304C\u5F97\u610F\u3060|\u719F\u8A9E be good at | O:drawing pictures.=\u7D75\u3092\u63CF\u304F\u306E\u304C#\u7D75\u3092\u63CF\u304F\u3053\u3068|\u52D5\u540D\u8A5E\uFF0B\u76EE\u7684\u8A9E", "\u59C9\u306F\u7D75\u3092\u63CF\u304F\u306E\u304C\u5F97\u610F\u3060\u3002"],
      ["S:I=\u79C1\u306F | V:am interested in=\u8208\u5473\u304C\u3042\u308B#\u301C\u306B\u8208\u5473\u304C\u3042\u308B|\u719F\u8A9E be interested in | O:Japanese history.=\u65E5\u672C\u306E\u6B74\u53F2\u306B", "\u79C1\u306F\u65E5\u672C\u306E\u6B74\u53F2\u306B\u8208\u5473\u304C\u3042\u308B\u3002"],
      ["S:My brother=\u5144\u306F | V:is looking for=\u63A2\u3057\u3066\u3044\u308B#\u301C\u3092\u63A2\u3057\u3066\u3044\u308B|\u719F\u8A9E look for\uFF0B\u9032\u884C\u5F62 | O:his car key=\u8ECA\u306E\u304B\u304E\u3092 | P:in his room.=\u90E8\u5C4B\u3067", "\u5144\u306F\u90E8\u5C4B\u3067\u8ECA\u306E\u304B\u304E\u3092\u63A2\u3057\u3066\u3044\u308B\u3002"],
      ["S:We=\u79C1\u305F\u3061\u306F | V:waited for=\u5F85\u3063\u305F#\u301C\u3092\u5F85\u3064|\u719F\u8A9E wait for | O:the last bus=\u6700\u7D42\u30D0\u30B9\u3092 | P:in front of the station.=\u99C5\u306E\u524D\u3067", "\u79C1\u305F\u3061\u306F\u99C5\u306E\u524D\u3067\u6700\u7D42\u30D0\u30B9\u3092\u5F85\u3063\u305F\u3002"],
      ["V:There are=\u3042\u308B#\u301C\u304C\u3042\u308B|There is/are \u69CB\u6587 | S:a lot of books=\u305F\u304F\u3055\u3093\u306E\u672C\u304C#\u305F\u304F\u3055\u3093\u306E\uFF0B\u3082\u306E|a lot of\uFF0B\u540D\u8A5E | P:in this library.=\u3053\u306E\u56F3\u66F8\u9928\u306B\u306F", "\u3053\u306E\u56F3\u66F8\u9928\u306B\u306F\u305F\u304F\u3055\u3093\u306E\u672C\u304C\u3042\u308B\u3002"],
      ["T:At first,=\u6700\u521D\u306F | S:my brother=\u5144\u306F | V:didn't like=\u597D\u304D\u3067\u306F\u306A\u304B\u3063\u305F#\u301C\u3057\u306A\u304B\u3063\u305F|didn't\uFF0B\u52D5\u8A5E\uFF08\u5426\u5B9A\uFF09 | O:natto.=\u7D0D\u8C46\u304C", "\u6700\u521D\u306F\u3001\u5144\u306F\u7D0D\u8C46\u304C\u597D\u304D\u3067\u306F\u306A\u304B\u3063\u305F\u3002"],
      ["T:In the end,=\u7D50\u5C40 | S:our soccer team=\u79C1\u305F\u3061\u306E\u30B5\u30C3\u30AB\u30FC\u30C1\u30FC\u30E0\u304C | V:won=\u52DD\u3063\u305F | O:the game.=\u8A66\u5408\u306B", "\u7D50\u5C40\u3001\u79C1\u305F\u3061\u306E\u30B5\u30C3\u30AB\u30FC\u30C1\u30FC\u30E0\u304C\u8A66\u5408\u306B\u52DD\u3063\u305F\u3002"],
      ["S:We=\u79C1\u305F\u3061\u306F | V:talked about=\u8A71\u3057\u305F#\u301C\u306B\u3064\u3044\u3066\u8A71\u3059|\u719F\u8A9E talk about | O:the movie=\u305D\u306E\u6620\u753B\u306B\u3064\u3044\u3066 | T:for a long time.=\u9577\u3044\u9593", "\u79C1\u305F\u3061\u306F\u9577\u3044\u9593\u305D\u306E\u6620\u753B\u306B\u3064\u3044\u3066\u8A71\u3057\u305F\u3002"]
    ] },
    { name: "\u9577\u3044\u4E3B\u8A9E\u30FB\u7BC0", list: [
      ["S:The boy / who lives next door=\u96A3\u306B\u4F4F\u3093\u3067\u3044\u308B\u7537\u306E\u5B50\u306F{\u7537\u306E\u5B50/\u96A3\u306B\u4F4F\u3093\u3067\u3044\u308B} | V:plays=\u5F3E\u304F | O:the piano=\u30D4\u30A2\u30CE\u3092 | M:very well.=\u3068\u3066\u3082\u4E0A\u624B\u306B", "\u96A3\u306B\u4F4F\u3093\u3067\u3044\u308B\u7537\u306E\u5B50\u306F\u30D4\u30A2\u30CE\u3092\u3068\u3066\u3082\u4E0A\u624B\u306B\u5F3E\u304F\u3002"],
      ["T:When I got home,=\u79C1\u304C\u5BB6\u306B\u5E30\u3063\u305F\u3068\u304D | S:my mother=\u6BCD\u306F | V:was cooking=\u4F5C\u3063\u3066\u3044\u305F#\u301C\u3057\u3066\u3044\u305F|be\uFF0B\u52D5\u8A5Eing\uFF08\u9032\u884C\u5F62\uFF09 | O:dinner.=\u5915\u98DF\u3092", "\u79C1\u304C\u5BB6\u306B\u5E30\u3063\u305F\u3068\u304D\u3001\u6BCD\u306F\u5915\u98DF\u3092\u4F5C\u3063\u3066\u3044\u305F\u3002"],
      ["S:The book / on the desk=\u673A\u306E\u4E0A\u306E\u672C\u306F{\u672C/\u673A\u306E\u4E0A\u306E} | V:is=\u3060#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:mine.=\u79C1\u306E\u3082\u306E", "\u673A\u306E\u4E0A\u306E\u672C\u306F\u79C1\u306E\u3082\u306E\u3060\u3002"],
      ["S:The girl / in the red dress=\u8D64\u3044\u30C9\u30EC\u30B9\u306E\u5973\u306E\u5B50\u306F{\u5973\u306E\u5B50/\u8D64\u3044\u30C9\u30EC\u30B9\u306E} | V:is=\u3060#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:my cousin.=\u79C1\u306E\u3044\u3068\u3053", "\u8D64\u3044\u30C9\u30EC\u30B9\u306E\u5973\u306E\u5B50\u306F\u79C1\u306E\u3044\u3068\u3053\u3060\u3002"],
      ["S:The movie / we saw yesterday=\u6628\u65E5\u898B\u305F\u6620\u753B\u306F{\u6620\u753B/\u6628\u65E5\u898B\u305F} | V:was=#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:really exciting.=\u672C\u5F53\u306B\u308F\u304F\u308F\u304F\u3057\u305F", "\u6628\u65E5\u898B\u305F\u6620\u753B\u306F\u672C\u5F53\u306B\u308F\u304F\u308F\u304F\u3057\u305F\u3002"],
      ["R:Because it was raining,=\u96E8\u304C\u964D\u3063\u3066\u3044\u305F\u306E\u3067 | S:we=\u79C1\u305F\u3061\u306F | V:stayed=\u3044\u305F | P:at home.=\u5BB6\u306B", "\u96E8\u304C\u964D\u3063\u3066\u3044\u305F\u306E\u3067\u3001\u79C1\u305F\u3061\u306F\u5BB6\u306B\u3044\u305F\u3002"],
      ["S:The man / who helped me=\u79C1\u3092\u52A9\u3051\u3066\u304F\u308C\u305F\u7537\u6027\u306F{\u7537\u6027/\u79C1\u3092\u52A9\u3051\u3066\u304F\u308C\u305F} | V:was=#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:very kind.=\u3068\u3066\u3082\u89AA\u5207\u3060\u3063\u305F", "\u79C1\u3092\u52A9\u3051\u3066\u304F\u308C\u305F\u7537\u6027\u306F\u3068\u3066\u3082\u89AA\u5207\u3060\u3063\u305F\u3002"],
      ["S:Playing soccer=\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3053\u3068\u306F#\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3053\u3068|\u52D5\u540D\u8A5E\uFF0B\u76EE\u7684\u8A9E | V:is=#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:a lot of fun.=\u3068\u3066\u3082\u697D\u3057\u3044", "\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u306E\u306F\u3068\u3066\u3082\u697D\u3057\u3044\u3002"],
      ["S:The students / in this class=\u3053\u306E\u30AF\u30E9\u30B9\u306E\u751F\u5F92\u305F\u3061\u306F{\u751F\u5F92\u305F\u3061/\u3053\u306E\u30AF\u30E9\u30B9\u306E} | V:are going to / visit=\u8A2A\u308C\u308B\u4E88\u5B9A\u3060{\u301C\u3059\u308B\u4E88\u5B9A\u3060/\u8A2A\u308C\u308B}#\u301C\u3059\u308B\u4E88\u5B9A|be going to\uFF0B\u52D5\u8A5E | O:the museum=\u535A\u7269\u9928\u3092 | T:next Friday.=\u6B21\u306E\u91D1\u66DC\u65E5\u306B", "\u3053\u306E\u30AF\u30E9\u30B9\u306E\u751F\u5F92\u305F\u3061\u306F\u6B21\u306E\u91D1\u66DC\u65E5\u306B\u535A\u7269\u9928\u3092\u8A2A\u308C\u308B\u4E88\u5B9A\u3060\u3002"],
      ["T:After I finish my homework,=\u5BBF\u984C\u304C\u7D42\u308F\u3063\u305F\u3089 | S:I=\u79C1\u306F | V:will call=\u96FB\u8A71\u3059\u308B#\u301C\u3059\u308B\u3064\u3082\u308A|will\uFF0B\u52D5\u8A5E\uFF08\u672A\u6765\uFF09 | O:you.=\u3042\u306A\u305F\u306B", "\u5BBF\u984C\u304C\u7D42\u308F\u3063\u305F\u3089\u3001\u3042\u306A\u305F\u306B\u96FB\u8A71\u3059\u308B\u306D\u3002"],
      ["S:The cat / sleeping on the sofa=\u30BD\u30D5\u30A1\u3067\u5BDD\u3066\u3044\u308B\u732B\u306F{\u732B/\u30BD\u30D5\u30A1\u3067\u5BDD\u3066\u3044\u308B} | V:belongs to=\u306E\u3082\u306E\u3060#\u301C\u306E\u3082\u306E\u3060|\u719F\u8A9E belong to | O:my aunt.=\u304A\u3070", "\u30BD\u30D5\u30A1\u3067\u5BDD\u3066\u3044\u308B\u732B\u306F\u304A\u3070\u306E\u732B\u3060\u3002"],
      ["F:If it is sunny tomorrow,=\u660E\u65E5\u6674\u308C\u305F\u3089 | S:we=\u79C1\u305F\u3061\u306F | V:will have=\u3059\u308B#\u301C\u3059\u308B\u3064\u3082\u308A|will\uFF0B\u52D5\u8A5E\uFF08\u672A\u6765\uFF09 | O:a picnic=\u30D4\u30AF\u30CB\u30C3\u30AF\u3092 | P:by the river.=\u5DDD\u306E\u305D\u3070\u3067", "\u660E\u65E5\u6674\u308C\u305F\u3089\u3001\u5DDD\u306E\u305D\u3070\u3067\u30D4\u30AF\u30CB\u30C3\u30AF\u3092\u3057\u3088\u3046\u3002"]
    ] }
  ];
  var LVO = {};
  var STORIES = [
    { lv: 1, level: 3, title: "\u30B1\u30F3\u306E\u65E5\u66DC\u65E5", list: [
      ["T:Last Sunday,=\u5148\u9031\u306E\u65E5\u66DC\u65E5 | S:Ken and his sister=\u30B1\u30F3\u3068\u59B9\u306F | V:went=\u884C\u3063\u305F | P:to the zoo=\u52D5\u7269\u5712\u3078 | M:with their father.=\u304A\u7236\u3055\u3093\u3068", "\u5148\u9031\u306E\u65E5\u66DC\u65E5\u3001\u30B1\u30F3\u3068\u59B9\u306F\u304A\u7236\u3055\u3093\u3068\u52D5\u7269\u5712\u3078\u884C\u3063\u305F\u3002"],
      ["S:They=\u5F7C\u3089\u306F | V:saw=\u898B\u305F | O:a big elephant=\u5927\u304D\u306A\u30BE\u30A6\u3092 | P:near the gate.=\u5165\u308A\u53E3\u306E\u8FD1\u304F\u3067", "\u5F7C\u3089\u306F\u5165\u308A\u53E3\u306E\u8FD1\u304F\u3067\u5927\u304D\u306A\u30BE\u30A6\u3092\u898B\u305F\u3002"],
      ["S:The elephant=\u305D\u306E\u30BE\u30A6\u306F | V:was eating=\u98DF\u3079\u3066\u3044\u305F#\u301C\u3057\u3066\u3044\u305F|be\uFF0B\u52D5\u8A5Eing\uFF08\u9032\u884C\u5F62\uFF09 | O:a lot of apples.=\u305F\u304F\u3055\u3093\u306E\u30EA\u30F3\u30B4\u3092#\u305F\u304F\u3055\u3093\u306E\uFF0B\u3082\u306E|a lot of\uFF0B\u540D\u8A5E", "\u305D\u306E\u30BE\u30A6\u306F\u305F\u304F\u3055\u3093\u306E\u30EA\u30F3\u30B4\u3092\u98DF\u3079\u3066\u3044\u305F\u3002"],
      ["S:Ken's sister=\u30B1\u30F3\u306E\u59B9\u306F | V:took=\u64AE\u3063\u305F | O:many pictures=\u305F\u304F\u3055\u3093\u306E\u5199\u771F\u3092 | M:with her new camera.=\u65B0\u3057\u3044\u30AB\u30E1\u30E9\u3067", "\u30B1\u30F3\u306E\u59B9\u306F\u65B0\u3057\u3044\u30AB\u30E1\u30E9\u3067\u305F\u304F\u3055\u3093\u306E\u5199\u771F\u3092\u64AE\u3063\u305F\u3002"],
      ["T:On the way home,=\u5E30\u308A\u9053\u3067 | S:they=\u5F7C\u3089\u306F | V:ate=\u98DF\u3079\u305F | O:ice cream=\u30A2\u30A4\u30B9\u30AF\u30EA\u30FC\u30E0\u3092 | P:at a small shop.=\u5C0F\u3055\u306A\u5E97\u3067", "\u5E30\u308A\u9053\u3067\u3001\u5F7C\u3089\u306F\u5C0F\u3055\u306A\u5E97\u3067\u30A2\u30A4\u30B9\u30AF\u30EA\u30FC\u30E0\u3092\u98DF\u3079\u305F\u3002"]
    ] },
    { lv: 1, level: 3, title: "\u30A8\u30DE\u306E\u671D", list: [
      ["S:Emma=\u30A8\u30DE\u306F | V:gets up=\u8D77\u304D\u308B#\u8D77\u304D\u308B|\u719F\u8A9E get up | T:at six every morning.=\u6BCE\u671D6\u6642\u306B", "\u30A8\u30DE\u306F\u6BCE\u671D6\u6642\u306B\u8D77\u304D\u308B\u3002"],
      ["S:She=\u5F7C\u5973\u306F | V:walks=\u6563\u6B69\u3055\u305B\u308B | O:her dog=\u72AC\u3092 | P:in the park=\u516C\u5712\u3067 | T:before breakfast.=\u671D\u98DF\u306E\u524D\u306B", "\u5F7C\u5973\u306F\u671D\u98DF\u306E\u524D\u306B\u516C\u5712\u3067\u72AC\u3092\u6563\u6B69\u3055\u305B\u308B\u3002"],
      ["S:Her mother=\u304A\u6BCD\u3055\u3093\u306F | V:makes=\u4F5C\u308B | O:toast and eggs=\u30C8\u30FC\u30B9\u30C8\u3068\u5375\u3092 | P:in the kitchen.=\u53F0\u6240\u3067", "\u304A\u6BCD\u3055\u3093\u306F\u53F0\u6240\u3067\u30C8\u30FC\u30B9\u30C8\u3068\u5375\u3092\u4F5C\u308B\u3002"],
      ["S:Emma=\u30A8\u30DE\u306F | V:leaves=\u51FA\u308B | O:her house=\u5BB6\u3092 | T:at eight.=8\u6642\u306B", "\u30A8\u30DE\u306F8\u6642\u306B\u5BB6\u3092\u51FA\u308B\u3002"],
      ["S:Her best friend=\u89AA\u53CB\u304C | V:is waiting for=\u5F85\u3063\u3066\u3044\u308B#\u301C\u3092\u5F85\u3063\u3066\u3044\u308B|\u719F\u8A9E wait for\uFF0B\u9032\u884C\u5F62 | O:her=\u5F7C\u5973\u3092 | P:at the corner.=\u89D2\u3067", "\u89AA\u53CB\u304C\u89D2\u3067\u5F7C\u5973\u3092\u5F85\u3063\u3066\u3044\u308B\u3002"]
    ] },
    { lv: 2, level: 4, title: "\u96E8\u306E\u65E5\u306E\u56F3\u66F8\u9928", list: [
      ["R:Because it was raining,=\u96E8\u304C\u964D\u3063\u3066\u3044\u305F\u306E\u3067 | S:Yuki=\u30E6\u30AD\u306F | V:decided to / go=\u884C\u304F\u3053\u3068\u306B\u3057\u305F{\u301C\u3059\u308B\u3053\u3068\u306B\u3057\u305F/\u884C\u304F}#\u301C\u3059\u308B\u3053\u3068\u306B\u3057\u305F|decide to\uFF0B\u52D5\u8A5E | P:to the city library.=\u5E02\u306E\u56F3\u66F8\u9928\u3078", "\u96E8\u304C\u964D\u3063\u3066\u3044\u305F\u306E\u3067\u3001\u30E6\u30AD\u306F\u5E02\u306E\u56F3\u66F8\u9928\u3078\u884C\u304F\u3053\u3068\u306B\u3057\u305F\u3002"],
      ["S:The library=\u56F3\u66F8\u9928\u306F | V:was=#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:very quiet=\u3068\u3066\u3082\u9759\u304B\u3060\u3063\u305F | T:that afternoon.=\u305D\u306E\u65E5\u306E\u5348\u5F8C", "\u305D\u306E\u65E5\u306E\u5348\u5F8C\u3001\u56F3\u66F8\u9928\u306F\u3068\u3066\u3082\u9759\u304B\u3060\u3063\u305F\u3002"],
      ["S:She=\u5F7C\u5973\u306F | V:was looking for=\u63A2\u3057\u3066\u3044\u305F#\u301C\u3092\u63A2\u3057\u3066\u3044\u305F|\u719F\u8A9E look for\uFF0B\u9032\u884C\u5F62 | O:a book / about space.=\u5B87\u5B99\u306B\u3064\u3044\u3066\u306E\u672C\u3092{\u672C/\u5B87\u5B99\u306B\u3064\u3044\u3066\u306E}", "\u5F7C\u5973\u306F\u5B87\u5B99\u306B\u3064\u3044\u3066\u306E\u672C\u3092\u63A2\u3057\u3066\u3044\u305F\u3002"],
      ["S:A kind librarian=\u89AA\u5207\u306A\u56F3\u66F8\u9928\u54E1\u304C | V:showed=\u898B\u305B\u3066\u304F\u308C\u305F | I:her=\u5F7C\u5973\u306B | O:some good books.=\u4F55\u518A\u304B\u306E\u3044\u3044\u672C\u3092", "\u89AA\u5207\u306A\u56F3\u66F8\u9928\u54E1\u304C\u5F7C\u5973\u306B\u4F55\u518A\u304B\u306E\u3044\u3044\u672C\u3092\u898B\u305B\u3066\u304F\u308C\u305F\u3002"],
      ["S:Yuki=\u30E6\u30AD\u306F | V:borrowed=\u501F\u308A\u305F | O:two of them=\u305D\u306E\u3046\u30612\u518A\u3092 | M:with her library card.=\u56F3\u66F8\u9928\u30AB\u30FC\u30C9\u3067", "\u30E6\u30AD\u306F\u56F3\u66F8\u9928\u30AB\u30FC\u30C9\u3067\u305D\u306E\u3046\u30612\u518A\u3092\u501F\u308A\u305F\u3002"],
      ["T:When she got home,=\u5BB6\u306B\u5E30\u308B\u3068 | S:she=\u5F7C\u5973\u306F | V:started to / read=\u8AAD\u307F\u59CB\u3081\u305F{\u301C\u3057\u59CB\u3081\u305F/\u8AAD\u3080}#\u301C\u3057\u59CB\u3081\u305F|start to\uFF0B\u52D5\u8A5E | O:the first book.=1\u518A\u76EE\u306E\u672C\u3092", "\u5BB6\u306B\u5E30\u308B\u3068\u3001\u5F7C\u5973\u306F1\u518A\u76EE\u306E\u672C\u3092\u8AAD\u307F\u59CB\u3081\u305F\u3002"]
    ] },
    { lv: 2, level: 4, title: "\u65B0\u3057\u3044\u53CB\u3060\u3061", list: [
      ["S:A new student / from Canada=\u30AB\u30CA\u30C0\u304B\u3089\u6765\u305F\u65B0\u3057\u3044\u751F\u5F92\u304C{\u65B0\u3057\u3044\u751F\u5F92/\u30AB\u30CA\u30C0\u304B\u3089\u6765\u305F} | V:joined=\u52A0\u308F\u3063\u305F | O:our class=\u79C1\u305F\u3061\u306E\u30AF\u30E9\u30B9\u306B | T:last week.=\u5148\u9031", "\u5148\u9031\u3001\u30AB\u30CA\u30C0\u304B\u3089\u6765\u305F\u65B0\u3057\u3044\u751F\u5F92\u304C\u79C1\u305F\u3061\u306E\u30AF\u30E9\u30B9\u306B\u52A0\u308F\u3063\u305F\u3002"],
      ["S:His name=\u5F7C\u306E\u540D\u524D\u306F | V:is=\u3060#\uFF1D\u3067\u3064\u306A\u3050|be\u52D5\u8A5E | C:Leo Martin.=\u30EC\u30AA\u30FB\u30DE\u30FC\u30C6\u30A3\u30F3", "\u5F7C\u306E\u540D\u524D\u306F\u30EC\u30AA\u30FB\u30DE\u30FC\u30C6\u30A3\u30F3\u3060\u3002"],
      ["S:Leo=\u30EC\u30AA\u306F | V:can speak=\u8A71\u305B\u308B#\u301C\u3067\u304D\u308B|can\uFF0B\u52D5\u8A5E | O:a little Japanese.=\u5C11\u3057\u65E5\u672C\u8A9E\u3092", "\u30EC\u30AA\u306F\u5C11\u3057\u65E5\u672C\u8A9E\u3092\u8A71\u305B\u308B\u3002"],
      ["T:At lunch time,=\u663C\u4F11\u307F\u306B | S:we=\u79C1\u305F\u3061\u306F | V:taught=\u6559\u3048\u305F | I:him=\u5F7C\u306B | O:some Japanese words.=\u3044\u304F\u3064\u304B\u306E\u65E5\u672C\u8A9E\u306E\u8A00\u8449\u3092", "\u663C\u4F11\u307F\u306B\u3001\u79C1\u305F\u3061\u306F\u5F7C\u306B\u3044\u304F\u3064\u304B\u306E\u65E5\u672C\u8A9E\u306E\u8A00\u8449\u3092\u6559\u3048\u305F\u3002"],
      ["S:Leo=\u30EC\u30AA\u306F | V:is interested in=\u8208\u5473\u304C\u3042\u308B#\u301C\u306B\u8208\u5473\u304C\u3042\u308B|\u719F\u8A9E be interested in | O:Japanese comics and games.=\u65E5\u672C\u306E\u30DE\u30F3\u30AC\u3068\u30B2\u30FC\u30E0\u306B", "\u30EC\u30AA\u306F\u65E5\u672C\u306E\u30DE\u30F3\u30AC\u3068\u30B2\u30FC\u30E0\u306B\u8208\u5473\u304C\u3042\u308B\u3002"],
      ["S:We=\u79C1\u305F\u3061\u306F | V:are going to / play=\u904A\u3076\u4E88\u5B9A\u3060{\u301C\u3059\u308B\u4E88\u5B9A\u3060/\u904A\u3076}#\u301C\u3059\u308B\u4E88\u5B9A|be going to\uFF0B\u52D5\u8A5E | O:video games=\u30C6\u30EC\u30D3\u30B2\u30FC\u30E0\u3067 | P:at my house=\u79C1\u306E\u5BB6\u3067 | T:this weekend.=\u4ECA\u9031\u672B", "\u79C1\u305F\u3061\u306F\u4ECA\u9031\u672B\u3001\u79C1\u306E\u5BB6\u3067\u30C6\u30EC\u30D3\u30B2\u30FC\u30E0\u3067\u904A\u3076\u4E88\u5B9A\u3060\u3002"]
    ] },
    { lv: 3, level: 5, title: "\u7956\u7236\u306E\u7551", list: [
      ["S:My grandfather / who lives in the countryside=\u7530\u820E\u306B\u4F4F\u3093\u3067\u3044\u308B\u7956\u7236\u306F{\u7956\u7236/\u7530\u820E\u306B\u4F4F\u3093\u3067\u3044\u308B} | V:grows=\u80B2\u3066\u3066\u3044\u308B | O:many kinds of vegetables.=\u305F\u304F\u3055\u3093\u306E\u7A2E\u985E\u306E\u91CE\u83DC\u3092", "\u7530\u820E\u306B\u4F4F\u3093\u3067\u3044\u308B\u7956\u7236\u306F\u3001\u305F\u304F\u3055\u3093\u306E\u7A2E\u985E\u306E\u91CE\u83DC\u3092\u80B2\u3066\u3066\u3044\u308B\u3002"],
      ["T:Every summer,=\u6BCE\u5E74\u590F\u306B | S:my brother and I=\u5144\u3068\u79C1\u306F | V:help=\u624B\u4F1D\u3046 | O:him=\u5F7C\u3092 | P:in the field.=\u7551\u3067", "\u6BCE\u5E74\u590F\u306B\u3001\u5144\u3068\u79C1\u306F\u7551\u3067\u5F7C\u3092\u624B\u4F1D\u3046\u3002"],
      ["S:The tomatoes / we picked in the morning=\u671D\u3068\u3063\u305F\u30C8\u30DE\u30C8\u306F{\u30C8\u30DE\u30C8/\u671D\u3068\u3063\u305F} | V:tasted=#\u301C\u306A\u5473\u304C\u3057\u305F|taste\uFF0B\u5F62\u5BB9\u8A5E | C:sweeter than candy.=\u30AD\u30E3\u30F3\u30C7\u30A3\u30FC\u3088\u308A\u3082\u7518\u304B\u3063\u305F", "\u671D\u3068\u3063\u305F\u30C8\u30DE\u30C8\u306F\u30AD\u30E3\u30F3\u30C7\u30A3\u30FC\u3088\u308A\u3082\u7518\u304B\u3063\u305F\u3002"],
      ["T:After the work was done,=\u4ED5\u4E8B\u304C\u7D42\u308F\u308B\u3068 | S:my grandfather=\u7956\u7236\u306F | V:told=\u8A71\u3057\u3066\u304F\u308C\u305F | I:us=\u79C1\u305F\u3061\u306B | O:stories / about his childhood.=\u5B50\u3069\u3082\u306E\u3053\u308D\u306E\u8A71\u3092{\u8A71/\u5B50\u3069\u3082\u306E\u3053\u308D\u306E}", "\u4ED5\u4E8B\u304C\u7D42\u308F\u308B\u3068\u3001\u7956\u7236\u306F\u79C1\u305F\u3061\u306B\u5B50\u3069\u3082\u306E\u3053\u308D\u306E\u8A71\u3092\u3057\u3066\u304F\u308C\u305F\u3002"],
      ["S:I=\u79C1\u306F | V:will never forget=\u6C7A\u3057\u3066\u5FD8\u308C\u306A\u3044#\u6C7A\u3057\u3066\u301C\u3057\u306A\u3044|will never\uFF0B\u52D5\u8A5E | O:those summer days / with him.=\u5F7C\u3068\u306E\u3042\u306E\u590F\u306E\u65E5\u3005\u3092{\u3042\u306E\u590F\u306E\u65E5\u3005/\u5F7C\u3068\u306E}", "\u79C1\u306F\u5F7C\u3068\u306E\u3042\u306E\u590F\u306E\u65E5\u3005\u3092\u6C7A\u3057\u3066\u5FD8\u308C\u306A\u3044\u3002"]
    ] },
    { lv: 3, level: 5, title: "\u99C5\u3067\u306E\u51FA\u6765\u4E8B", list: [
      ["T:While I was waiting for the train,=\u96FB\u8ECA\u3092\u5F85\u3063\u3066\u3044\u308B\u9593\u306B | S:an old woman / with a heavy bag=\u91CD\u3044\u304B\u3070\u3093\u3092\u6301\u3063\u305F\u304A\u3070\u3042\u3055\u3093\u304C{\u304A\u3070\u3042\u3055\u3093/\u91CD\u3044\u304B\u3070\u3093\u3092\u6301\u3063\u305F} | V:spoke to=\u8A71\u3057\u304B\u3051\u305F#\u301C\u306B\u8A71\u3057\u304B\u3051\u308B|\u719F\u8A9E speak to | O:me.=\u79C1\u306B", "\u96FB\u8ECA\u3092\u5F85\u3063\u3066\u3044\u308B\u9593\u306B\u3001\u91CD\u3044\u304B\u3070\u3093\u3092\u6301\u3063\u305F\u304A\u3070\u3042\u3055\u3093\u304C\u79C1\u306B\u8A71\u3057\u304B\u3051\u305F\u3002"],
      ["S:She=\u5F7C\u5973\u306F | V:wanted to / know=\u77E5\u308A\u305F\u304B\u3063\u305F{\u301C\u3057\u305F\u304B\u3063\u305F/\u77E5\u308B}#\u301C\u3057\u305F\u304B\u3063\u305F|want to\uFF0B\u52D5\u8A5E | O:the way / to the city hospital.=\u5E02\u6C11\u75C5\u9662\u3078\u306E\u884C\u304D\u65B9\u3092{\u884C\u304D\u65B9/\u5E02\u6C11\u75C5\u9662\u3078\u306E}", "\u5F7C\u5973\u306F\u5E02\u6C11\u75C5\u9662\u3078\u306E\u884C\u304D\u65B9\u3092\u77E5\u308A\u305F\u304B\u3063\u305F\u3002"],
      ["R:Because the hospital was not far,=\u75C5\u9662\u306F\u9060\u304F\u306A\u304B\u3063\u305F\u306E\u3067 | S:I=\u79C1\u306F | V:decided to / take=\u9023\u308C\u3066\u3044\u304F\u3053\u3068\u306B\u3057\u305F{\u301C\u3059\u308B\u3053\u3068\u306B\u3057\u305F/\u9023\u308C\u3066\u3044\u304F}#\u301C\u3059\u308B\u3053\u3068\u306B\u3057\u305F|decide to\uFF0B\u52D5\u8A5E | O:her=\u5F7C\u5973\u3092 | P:there.=\u305D\u3053\u3078", "\u75C5\u9662\u306F\u9060\u304F\u306A\u304B\u3063\u305F\u306E\u3067\u3001\u79C1\u306F\u5F7C\u5973\u3092\u305D\u3053\u3078\u9023\u308C\u3066\u3044\u304F\u3053\u3068\u306B\u3057\u305F\u3002"],
      ["S:We=\u79C1\u305F\u3061\u306F | V:talked about=\u8A71\u3057\u305F#\u301C\u306B\u3064\u3044\u3066\u8A71\u3059|\u719F\u8A9E talk about | O:many things=\u3044\u308D\u3044\u308D\u306A\u3053\u3068\u306B\u3064\u3044\u3066 | P:on the way.=\u9053\u4E2D\u3067", "\u79C1\u305F\u3061\u306F\u9053\u4E2D\u3067\u3044\u308D\u3044\u308D\u306A\u3053\u3068\u306B\u3064\u3044\u3066\u8A71\u3057\u305F\u3002"],
      ["T:When we arrived,=\u7740\u3044\u305F\u3068\u304D | S:she=\u5F7C\u5973\u306F | V:thanked=\u304A\u793C\u3092\u8A00\u3063\u305F | O:me=\u79C1\u306B | M:with a big smile.=\u6E80\u9762\u306E\u7B11\u9854\u3067", "\u7740\u3044\u305F\u3068\u304D\u3001\u5F7C\u5973\u306F\u6E80\u9762\u306E\u7B11\u9854\u3067\u79C1\u306B\u304A\u793C\u3092\u8A00\u3063\u305F\u3002"]
    ] }
  ];
  STORIES.forEach((x, i) => x.id = "b" + i);
  var COMMON = new Set("rank word the be and of a to in have it you he for they not that we on with this i do as at she but from by will or say go so all if one would about can which there know more get who like when think make time see what up some other out good people year take no well because very just come could work use than now then also into only look want give first new way find over any after day where thing most should need much right how back mean even may here many such last child tell really call before company through down show life man change place long between feel too still problem write same lot great try leave number both own part point little help ask meet start talk something put another become interest country old each school late high different off next end live why while world week play might must home never include course house report group case woman around book family seem let again kind keep hear system every question during always big set small study follow begin important since run under turn few bring early hand state move money fact however area provide name read friend month large business without information open order government issue market pay build hold service against believe second though yes love increase job plan result away example happen offer young close program lead buy understand thank far today hour student face hope idea cost less room until term car city water develop learn often line eat side game power possible stand ever body spend answer bad sure level public head walk win stop send already war party real toward able remember music view member reason policy nothing sit community lose person free morning night half office door health art history enough across almost watch kid parent others research girl guy food moment air teacher force education foot boy age process sense nation someone table together continue support create speak allow add grow wait serve die expect stay fall cut reach kill remain suggest raise pass sell require decide return explain carry drive break receive agree join pick wear choose fight throw catch draw teach forget sleep sing swim drink fly story lie light paper cause eye white black red blue green yellow color local social national political human major certain whole low full special easy hard clear recent strong short single simple personal current dark hot cold warm cool nice happy sad beautiful pretty wrong fine ready likely difficult available popular natural similar common serious main final general private safe quick slow fast busy quiet tired hungry sick angry afraid careful famous favorite foreign heavy cheap expensive rich poor clean dirty wide deep dry wet soft friendly wonderful interesting exciting boring funny strange perfect terrible excellent bright empty alone alive dead ill glad sorry true false huge tiny tall round straight sweet modern ancient traditional international economic medical physical legal central basic various positive negative necessary useful healthy fresh wild brave smart clever lucky proud nervous excited surprised interested worried lonely dangerous comfortable convenient delicious bored near behind above below along among beside inside outside within upon onto past per except beyond despite unless whether although once yet nor either neither maybe perhaps probably actually quite rather especially finally suddenly usually sometimes soon later ago tomorrow yesterday tonight recently certainly simply exactly clearly easily quickly slowly carefully loudly quietly happily else instead anyway indeed somewhere anywhere everywhere forward abroad upstairs downstairs twice nearly hardly anything everything everyone anyone somebody nobody none myself yourself itself two three four five six seven eight nine ten eleven twelve twenty thirty hundred thousand million third zero dog cat bird fish horse animal tree flower plant garden park river sea mountain lake island forest sky sun moon star rain snow wind weather season spring summer autumn winter street road station train bus bike plane ship boat airport hospital library museum shop store restaurant cafe hotel bank church building town village kitchen bedroom bathroom window wall floor chair bed desk box bag key phone computer picture photo camera clock cup glass plate bottle pen pencil letter card map ticket gift present toy ball clothes shirt shoe hat coat dress breakfast lunch dinner meal bread rice meat egg milk tea coffee juice fruit apple orange banana vegetable cake chocolate sugar salt soup sandwich father mother brother sister son daughter husband wife baby grandfather grandmother uncle aunt cousin neighbor doctor nurse police driver artist singer player worker farmer king queen lady gentleman team class lesson test homework subject english japanese math science language dream trip travel vacation holiday birthday festival sport soccer baseball tennis basketball movie song tv news magazine newspaper dictionary internet email message arrive belong borrow lend invite visit enjoy laugh smile cry shout listen hurry climb jump dance cook wash practice finish check fill fix save count touch push pull hit kick shake hide shut ride feed hang dig bite blow burn freeze steal shoot seek beat bend bet bind bleed breed deal flee forgive grind kneel lay mistake quit rise ring shine sink spread stick strike swing tear wake weep wish worry wonder guess imagine notice realize recognize consider describe discuss mention repeat reply prepare protect prevent produce improve reduce compare contain depend destroy discover enter exist fail hate hurt introduce marry miss paint perform prefer promise publish relax rest share solve succeed suffer surprise survive taste treat trust type vote waste accept achieve act admit affect appear apply argue attack avoid base cover design determine encourage establish express focus form gain identify indicate involve maintain manage measure obtain occur operate press reflect refuse release rely remove replace represent respond reveal search select settle sign supply tend thanks worth minute voice heart mind hair nose mouth ear tooth arm leg finger neck shoulder skin blood bone brain stomach knee nature earth land ground field hill rock stone sand beach wave ocean fire ice cloud energy environment space universe planet culture society peace freedom future experience knowledge skill ability chance choice decision difference effect event situation condition purpose goal success trouble danger accident action activity attention care control detail direction distance fear feeling fun habit image matter memory method mood opinion pain plenty price quality rule secret sound speech spirit step style technology theory thought truth value wealth youth character century date weekend calendar noon evening afternoon midnight monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december center corner middle top bottom front edge surface north south east west left address size shape weight height length temperature amount total piece pair list page note sentence paragraph grammar meaning chapter text poem novel article title author writer reader scientist engineer lawyer manager officer soldier pilot chef dentist president leader customer guest host owner partner stranger visitor audience crowd population citizen adult teenager couple role figure industry economy law court crime army military security risk budget tax income profit product project model data evidence record material resource source machine engine tool network software site website screen video radio channel media advertisement brand factory farm department organization institution association club committee university college kindergarten graduate degree grade exam score prize award contest competition race match champion coach fan stadium gym pool theater concert stage drama comedy hero cartoon comic guitar piano violin drum band instrument noise silence smell scene sight shadow dust smoke gas oil gold silver metal wood plastic cotton cloth wool leather object item stuff goods package mail post stamp envelope umbrella wallet purse glasses towel soap brush mirror bath shower sofa lamp refrigerator oven stove knife fork spoon bowl dish pot pan roof gate fence stairs elevator apartment yard hall castle temple shrine tower bridge tunnel port harbor coast desert valley pond jungle zoo aquarium supermarket bookstore bakery cow pig sheep chicken duck rabbit mouse bear lion tiger elephant monkey snake frog insect bee butterfly whale dolphin pet wing tail leaf root seed grass rose grape strawberry lemon peach melon potato tomato carrot onion corn bean cheese butter beef pork noodle pizza hamburger cookie candy snack dessert recipe menu bill coin cash dollar yen cent sale shopping clerk cashier fever headache medicine disease illness exercise diet death birth wedding funeral marriage relationship friendship kiss hug joy anger sadness happiness courage patience honesty luck fortune journey tour guide passport suitcase seat traffic signal sidewalk crossing taxi truck subway flight speed arrival departure japan america china korea england france germany italy spain canada australia india europe asia africa tokyo london american chinese french german korean spanish british european asian hello hi goodbye bye please ok oh wow excuse pardon welcome congratulation several whose whom whatever whenever wherever therefore otherwise meanwhile moreover thus besides throughout till via underneath opposite plus minus shall ought used unable alright anymore apart aside somehow someday sometime everyday fairly fully greatly highly largely mainly mostly naturally normally partly possibly properly seriously slightly totally truly unfortunately luckily directly immediately eventually gradually completely entirely extremely frequently generally apparently obviously particularly personally rarely seldom regularly originally similarly strongly widely badly kindly nicely safely freely deeply closely brightly politely correctly anxious aware responsible independent equal fair honest polite rude gentle calm cute ugly handsome lovely pleasant fantastic amazing awful horrible silly stupid crazy curious creative active lazy shy sharp smooth rough thick thin fat narrow loose tight solid flat bitter sour spicy raw ripe brown gray pink purple golden silent noisy crowded sunny cloudy rainy snowy windy foggy daily weekly monthly annual previous former latest original entire extra further additional average enormous minor primary secondary chief senior junior elementary advanced complex complicated obvious exact correct accurate proper suitable typical unique rare usual unusual normal regular formal casual official professional technical scientific cultural environmental financial industrial digital electric global rural urban royal religious mental emotional visual musical historical native domestic male female pregnant asleep awake absent familiar mad upset confident satisfied disappointed embarrassed frightened scared shocked pleased amazed confused relaxed thirsty sleepy fit weak powerful successful helpful harmful careless useless homeless wooden symbol mark circle square triangle dot angle fold wrap tie pack pour mix boil bake fry slice chew swallow breathe cough sneeze yawn nod knock lock unlock switch connect download upload click print copy delete chat greet apologize blame praise scold warn advise recommend persuade convince insist complain deny doubt suppose assume predict arrange organize collect gather divide separate combine attach exclude decrease expand shrink float flow melt glow fade disappear vanish escape chase explore wander rush stroll crawl roll slide slip drop lift lower grab defend bounce aim compete cheer celebrate decorate bless pray worship rent earn afford owe charge deliver export import trade invest hire employ retire volunteer experiment invent repair sketch photograph film broadcast announce advertise inform translate pronounce spell memorize review examine observe weigh calculate subtract multiply attitude behavior belief concept content context debate definition demand device element emergency error estimate factor feature function growth impact influence instance lack limit link loss movement option pattern performance period position pressure principle progress proof range rate reaction region relation request response scale section series standard statement structure survey task tradition trend unit version volume access agreement aid analysis approach argument aspect benefit campaign challenge claim comment conflict contact contract contribution crisis damage effort election employee equipment exhibition fashion finance generation guideline identity individual insurance interview investment journal label labor lecture license majority minority mission opportunity patient permission pollution poverty presentation production professor proposal protest quantity reform resident revolution reward salary schedule shortage solution species speaker strategy stress suggestion target theme threat tip topic treatment victim violence vision welfare wisdom background boss button chain command cream cycle diary flag frame fuel guard hole hobby jacket jeans knot ladder lip mess nail net pocket pole powder rope row rubbish garbage trash sheet shelf skirt sock sweater boot glove belt cap tent wheel wire tape string thread needle scissors eraser notebook textbook blackboard uniform classroom was were are is am been being her his their our them him its those these they she he we you me us my your mine yours went saw took ate got told taught spoke done made came gave found left met thought bought brought wrote sang sat stood felt kept began became grew won lost heard said knew ran swam drank did had has does best better worse worst more most less least an an't don't doesn't didn't isn't aren't wasn't weren't can't won't i'm it's that's there's let's o'clock".split(" "));
  var QUESTIONS = {
    "\u30B1\u30F3\u306E\u65E5\u66DC\u65E5": [[0, 0, "\u30B1\u30F3\u305F\u3061\u304C\u52D5\u7269\u5712\u306B\u884C\u3063\u305F\u306E\u306F\u3044\u3064\uFF1F"], [1, 3, "\u30BE\u30A6\u3092\u898B\u305F\u306E\u306F\u3069\u3053\uFF1F"], [2, 2, "\u30BE\u30A6\u306F\u4F55\u3092\u98DF\u3079\u3066\u3044\u305F\uFF1F"], [3, 0, "\u5199\u771F\u3092\u305F\u304F\u3055\u3093\u64AE\u3063\u305F\u306E\u306F\u8AB0\uFF1F"], [4, 4, "\u30A2\u30A4\u30B9\u30AF\u30EA\u30FC\u30E0\u3092\u98DF\u3079\u305F\u306E\u306F\u3069\u3053\uFF1F"]],
    "\u30A8\u30DE\u306E\u671D": [[0, 2, "\u30A8\u30DE\u306F\u4F55\u6642\u306B\u8D77\u304D\u308B\uFF1F"], [1, 3, "\u30A8\u30DE\u306F\u3069\u3053\u3067\u72AC\u3092\u6563\u6B69\u3055\u305B\u308B\uFF1F"], [2, 2, "\u304A\u6BCD\u3055\u3093\u306F\u4F55\u3092\u4F5C\u308B\uFF1F"], [4, 0, "\u89D2\u3067\u30A8\u30DE\u3092\u5F85\u3063\u3066\u3044\u308B\u306E\u306F\u8AB0\uFF1F"]],
    "\u96E8\u306E\u65E5\u306E\u56F3\u66F8\u9928": [[0, 0, "\u30E6\u30AD\u304C\u56F3\u66F8\u9928\u3078\u884C\u304F\u3053\u3068\u306B\u3057\u305F\u306E\u306F\u306A\u305C\uFF1F"], [2, 2, "\u30E6\u30AD\u306F\u4F55\u3092\u63A2\u3057\u3066\u3044\u305F\uFF1F"], [3, 0, "\u30E6\u30AD\u306B\u672C\u3092\u898B\u305B\u3066\u304F\u308C\u305F\u306E\u306F\u8AB0\uFF1F"], [4, 3, "\u30E6\u30AD\u306F\u4F55\u3092\u4F7F\u3063\u3066\u672C\u3092\u501F\u308A\u305F\uFF1F"]],
    "\u65B0\u3057\u3044\u53CB\u3060\u3061": [[0, 3, "\u65B0\u3057\u3044\u751F\u5F92\u304C\u30AF\u30E9\u30B9\u306B\u6765\u305F\u306E\u306F\u3044\u3064\uFF1F"], [1, 2, "\u65B0\u3057\u3044\u751F\u5F92\u306E\u540D\u524D\u306F\uFF1F"], [4, 2, "\u30EC\u30AA\u306F\u4F55\u306B\u8208\u5473\u304C\u3042\u308B\uFF1F"], [5, 3, "\u4ECA\u9031\u672B\u3001\u3069\u3053\u3067\u904A\u3076\u4E88\u5B9A\uFF1F"]],
    "\u7956\u7236\u306E\u7551": [[0, 2, "\u7956\u7236\u306F\u4F55\u3092\u80B2\u3066\u3066\u3044\u308B\uFF1F"], [1, 1, "\u7956\u7236\u3092\u624B\u4F1D\u3046\u306E\u306F\u8AB0\uFF1F"], [2, 2, "\u671D\u3068\u3063\u305F\u30C8\u30DE\u30C8\u306F\u3069\u3093\u306A\u5473\u3060\u3063\u305F\uFF1F"], [3, 0, "\u7956\u7236\u304C\u8A71\u3092\u3057\u3066\u304F\u308C\u305F\u306E\u306F\u3044\u3064\uFF1F"]],
    "\u99C5\u3067\u306E\u51FA\u6765\u4E8B": [[0, 1, "\u79C1\u306B\u8A71\u3057\u304B\u3051\u305F\u306E\u306F\u8AB0\uFF1F"], [1, 2, "\u304A\u3070\u3042\u3055\u3093\u306F\u4F55\u3092\u77E5\u308A\u305F\u304B\u3063\u305F\uFF1F"], [2, 0, "\u79C1\u304C\u304A\u3070\u3042\u3055\u3093\u3092\u9023\u308C\u3066\u3044\u304F\u3053\u3068\u306B\u3057\u305F\u306E\u306F\u306A\u305C\uFF1F"], [4, 4, "\u304A\u3070\u3042\u3055\u3093\u306F\u3069\u3093\u306A\u3075\u3046\u306B\u304A\u793C\u3092\u8A00\u3063\u305F\uFF1F"]]
  };

  // games/chunkchunk/src/sfx.js
  var FILE_GAIN = 0.3;
  var VOICE_RATE = 0.5;
  var FILES = ["se/mode_game", "se/mode_study", "se/btn_sarasara", "se/btn_yoidon", "se/btn_lesson", "voice/chunk", "voice/combo", "voice/adjective", "voice/adverb", "voice/verb", "voice/noun", "voice/perfect", "voice/nice", "voice/yes", "voice/good", "voice/excellent", "voice/wow", "voice/stage_clear", "voice/try_again"];
  var BUF = {};
  var LAST = {};
  var curVoice = null;
  var sT = (f, d, t, v, s) => () => tone(f, d, t, v, s);
  var sSeq = (list, gap, type, vol) => () => list.forEach((f, i) => setTimeout(() => tone(f, 0.11, type || "triangle", vol || 0.11), i * gap));
  var SYN = {
    "se/tap": sT(900, 0.04, "triangle", 0.07),
    "se/back": () => {
      tone(620, 0.05, "triangle", 0.07);
      setTimeout(() => tone(460, 0.06, "triangle", 0.07), 45);
    },
    "se/open": () => {
      tone(520, 0.05, "sine", 0.08);
      setTimeout(() => tone(780, 0.07, "sine", 0.08), 45);
    },
    "se/close": () => {
      tone(780, 0.05, "sine", 0.07);
      setTimeout(() => tone(520, 0.07, "sine", 0.07), 45);
    },
    "se/forgot": () => {
      tone(230, 0.13, "square", 0.05, 0.6);
      setTimeout(() => tone(170, 0.16, "square", 0.05, 0.6), 110);
    },
    "se/sentence_clear": sSeq([660, 880, 1100], 70, "sine", 0.1),
    "voice/perfect": () => {
      sSeq([784, 988, 1175, 1568], 60, "triangle", 0.12)();
      setTimeout(() => tone(2093, 0.25, "sine", 0.07), 300);
    },
    "se/bonus": () => {
      tone(1046, 0.09, "sine", 0.1);
      setTimeout(() => tone(1568, 0.14, "sine", 0.09), 80);
    },
    "se/combo3": sSeq([784, 988], 65),
    "se/combo6": sSeq([784, 988, 1175], 65),
    "se/combo9": sSeq([784, 988, 1175, 1568], 65, "triangle", 0.13),
    "se/count5": sT(1e3, 0.06, "square", 0.06),
    "se/timeup": () => {
      [880, 660, 440].forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.12), i * 170));
      setTimeout(() => tone(220, 0.4, "sawtooth", 0.07, 0.8), 540);
    },
    "se/newbest": () => {
      [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.12), i * 90));
      setTimeout(() => {
        tone(1046, 0.45, "sine", 0.09);
        tone(1318, 0.45, "sine", 0.07);
      }, 500);
    },
    "se/study_wordtap": sT(1100, 0.035, "triangle", 0.06),
    "se/study_correct": sSeq([880, 1320], 70, "sine", 0.11),
    "se/study_wrong": sT(200, 0.18, "sawtooth", 0.05, 0.7),
    "se/study_page": sT(700, 0.04, "triangle", 0.06),
    "se/study_submit": sSeq([660, 880, 1320], 75, "sine", 0.1)
  };
  function load(name) {
    if (BUF[name]) return BUF[name];
    const ac = ENV.core.sound.ctx();
    return BUF[name] = fetch(ENV.ctx.base + "audio/" + name + ".mp3").then((r) => r.arrayBuffer()).then((b) => new Promise((ok, ng) => ac.decodeAudioData(b, ok, ng))).catch(() => null);
  }
  function stopSfxVoice() {
    try {
      curVoice && curVoice.stop();
    } catch (e) {
    }
    curVoice = null;
  }
  function playFile(name) {
    const isVoice = name.startsWith("voice/");
    load(name).then((buf) => {
      if (!buf || !ENV.root || settings.mute) return;
      const ac = ENV.core.sound.ctx(), src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf;
      g.gain.value = isVoice ? FILE_GAIN * VOICE_RATE : FILE_GAIN;
      src.connect(g).connect(ENV.core.sound.sfxBus);
      if (isVoice) {
        stopSfxVoice();
        curVoice = src;
      }
      src.start();
    });
  }
  function sfx(name) {
    const m = settings.sound || "both";
    if (m === "off" || settings.mute) return;
    if (m === "voice" && !name.startsWith("voice/")) return;
    if (m === "sfx" && name.startsWith("voice/")) return;
    const now = performance.now();
    if (now - (LAST[name] || 0) < 120) return;
    LAST[name] = now;
    try {
      unlockAudio();
    } catch (e) {
    }
    if (FILES.includes(name)) {
      playFile(name);
      return;
    }
    const f = SYN[name];
    if (f) try {
      f();
    } catch (e) {
    }
  }
  function preloadSfx() {
    try {
      ENV.core.sound.ctx();
      FILES.forEach(load);
    } catch (e) {
    }
  }
  function initSfx() {
    const h = (e) => {
      const b = e.target.closest && e.target.closest("button");
      if (!b || !ENV.root || !ENV.root.contains(b) || b.id === "cutBtn" || b.dataset.nosfx || b.disabled) return;
      if (b.dataset.play || b.dataset.study === "make") return;
      sfx(/^[←‹＜]|戻る|もどる|閉じる|やめる/.test((b.textContent || "").trim()) ? "se/back" : "se/tap");
    };
    document.addEventListener("click", h, true);
    ENV.offs.push(() => document.removeEventListener("click", h, true));
  }

  // core/coach.js
  var NAME = { g: "\u5973\u306E\u5B50", b: "\u7537\u306E\u5B50" };
  var defFace = (w, f) => `g/chunkchunk/img/chara/${w === "b" ? "boy" : "girl"}/${f || "normal"}.webp`;
  function runCoach(steps, opt2 = {}) {
    if (!steps || !steps.length) {
      opt2.onDone && opt2.onDone(true);
      return { stop() {
      } };
    }
    const faceOf = opt2.face || defFace;
    let i = 0, done = false, timer2 = 0;
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
      clearInterval(timer2);
      removeEventListener("resize", place);
      ov.remove();
      opt2.onDone && opt2.onDone(ok);
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
    timer2 = setInterval(() => {
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

  // games/chunkchunk/src/howto.js
  var HOW = {
    arcade: [
      { w: "g", f: "joy", t: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\u306F\u3001\u82F1\u6587\u3092\u3001\u610F\u5473\u306E\u307E\u3068\u307E\u308A\uFF08\u30C1\u30E3\u30F3\u30AF\uFF09\u3067\u533A\u5207\u308B\u30B2\u30FC\u30E0\u3060\u3088\u3002" },
      { w: "b", t: "\u6587\u306F\u3001\u30B9\u30BF\u30FC\u30C8\u306E\u3068\u304D\u306B\u3001\u307E\u305A1\u6587\u307E\u308B\u3054\u3068\u8AAD\u307F\u4E0A\u3052\u3089\u308C\u308B\u3088\u3002\u97F3\u3092\u805E\u3044\u3066\u3001\u5207\u308C\u76EE\u3092\u8003\u3048\u3088\u3046\u3002" },
      { w: "g", t: "\u300C\u3055\u3089\u3055\u3089\u30C1\u30E3\u30F3\u30AF\u300D\u306F\u3001\u81EA\u52D5\u3067\u6D41\u308C\u3066\u304F\u308B\u82F1\u6587\u3092\u3001\u5207\u308C\u76EE\u3067\u300C\u30C1\u30E3\u30F3\u30AF\uFF01\u300D\u3068\u30BF\u30C3\u30D7\u3059\u308B\u3088\u3002" },
      { w: "b", t: "\u300C\u3088\u30FC\u3044\u3069\u3093\u30C1\u30E3\u30F3\u30AF\u300D\u306F\u3001\u25B6\u30671\u8A9E\u305A\u3064\u9032\u3081\u3066\u3001\u5207\u308C\u76EE\u3067\u300C\u533A\u5207\u308B\u300D\u3092\u62BC\u3059\u3088\u3002\u307E\u3061\u304C\u3048\u305F\u3089\u25C0\u3067\u623B\u308C\u308B\u3002" },
      { w: "g", t: "\u300C\u30C1\u30E3\u30EC\u30F3\u30B8\u300D\u306F\u300130\u79D2\u304B1\u5206\u3067\u3001\u4F55\u70B9\u3068\u308C\u308B\u304B\u3002\u30B3\u30F3\u30DC\u304C\u3064\u306A\u304C\u308B\u3068\u3001\u70B9\u304C\u4E0A\u304C\u308B\u3088\u3002" },
      { w: "b", f: "idea", t: "\u300C\u30E9\u30F3\u30C0\u30E0\u300D\u306F1\u6587\u305A\u3064\u3001\u300C\u304A\u306F\u306A\u3057\u300D\u306F\u7269\u8A9E\u3092\u7D9A\u3051\u3066\u904A\u3079\u308B\u3088\u3002" }
    ],
    lesson: [
      { w: "g", f: "joy", t: "\u3053\u3053\u306F\u5B66\u6821\u3002\u30C1\u30E3\u30F3\u30AF\u306E\u5207\u308A\u65B9\u3092\u3001\u7DF4\u7FD2\u3059\u308B\u3068\u3053\u308D\u3060\u3088\u3002" },
      { w: "b", t: "\u300CLesson\u300D\u306F\u3001\u304A\u8A71\u3068\u30B2\u30FC\u30E0\u3067\u5B66\u3076\u3088\u3002\u300C\u8AAD\u3080\u30FB\u805E\u304F\u300D\u3068\u300C\u8A71\u3059\u30FB\u66F8\u304F\u300D\u304B\u3089\u9078\u3079\u308B\u3088\u3002" },
      { w: "g", t: "\u300CChunk Practice\u300D\u306F\u3001\u6587\u7AE0\u3092\u9078\u3093\u3067\u3001\u81EA\u5206\u3067\u9001\u3063\u3066\u5207\u308B\u7DF4\u7FD2\u3060\u3088\u3002" },
      { w: "b", f: "idea", t: "\u300CRandom Practice\u300D\u306F\u3001\u4F8B\u6587\u304B\u3089\u30E9\u30F3\u30C0\u30E0\u306B\u7DF4\u7FD2\u3067\u304D\u308B\u3088\u3002" }
    ],
    library: [
      { w: "g", f: "joy", t: "\u3053\u3053\u306F\u56F3\u66F8\u9928\u3002\u82F1\u8A9E\u306E\u6587\u7AE0\u3092\u3001\u8AAD\u3093\u3060\u308A\u767B\u9332\u3057\u305F\u308A\u3059\u308B\u3068\u3053\u308D\u3060\u3088\u3002" },
      { w: "b", t: "\u300CReading\u300D\u306F\u3001\u9577\u6587\u3092\u8AAD\u3093\u3067\u3001\u554F\u984C\u306B\u7B54\u3048\u308B\u3088\u3002\u5206\u304B\u3089\u306A\u3044\u5358\u8A9E\u306F\u3001\u8F9E\u66F8\u3067\u898B\u3089\u308C\u308B\u3088\u3002" },
      { w: "g", f: "idea", t: "\u300CMy Texts\u300D\u3067\u306F\u3001\u81EA\u5206\u306E\u9577\u6587\u3084\u77ED\u6587\u3092\u767B\u9332\u3057\u3066\u3001\u554F\u984C\u3082\u4F5C\u308C\u308B\u3088\u3002" }
    ]
  };
  function initHowto(root, settings2, save) {
    root.querySelectorAll("[data-howto]").forEach((b) => {
      const menu = b.parentElement;
      if (!settings2.howSeen) menu.prepend(b);
      b.onclick = () => {
        runCoach(HOW[b.dataset.howto] || HOW.arcade);
        if (!settings2.howSeen) {
          settings2.howSeen = true;
          save();
        }
      };
    });
  }

  // games/chunkchunk/src/shorts.js
  var SHORTS = null;
  var SHORTKEY = "ccs-shorts";
  var SHORT_DOC_MAX = 25e4;
  var shortToLine = (x) => [x.s, x.ja || "", x.lv || "", x.cat || ""].join("	");
  function lineToShort(l) {
    const [s, ja, lv, cat] = String(l).split("	");
    return { s, ja: ja || "", lv: +lv || null, cat: cat || "" };
  }
  var byteLen = (s) => new TextEncoder().encode(s).length;
  function shortDocSize(title, lines) {
    return byteLen(JSON.stringify({ title, lines, by: "u_0000000000000000000000", at: Date.now() }));
  }
  function loadMyShorts() {
    try {
      return JSON.parse(LS.getItem(SHORTKEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveMyShorts(l) {
    try {
      LS.setItem(SHORTKEY, JSON.stringify(l));
      return true;
    } catch (e) {
      return false;
    }
  }
  function shortsShared() {
    return (SHORTS || []).flatMap((d) => (d.lines ? d.lines.map(lineToShort) : d.items || []).map((x) => ({ ...x, doc: d.id })));
  }
  var shortDocCount = (d) => (d.lines || d.items || []).length;
  function shortsAll() {
    const seen = /* @__PURE__ */ new Set(), out = [];
    [...shortsShared(), ...loadMyShorts()].forEach((x) => {
      if (x && x.s && !seen.has(x.s)) {
        seen.add(x.s);
        out.push(x);
      }
    });
    return out;
  }
  async function loadShorts() {
    if (!DB) return SHORTS;
    try {
      const snap = await DB.collection("shorts").get();
      SHORTS = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (e) {
      SHORTS = SHORTS || [];
    }
    return SHORTS;
  }
  function parseShortLines(text) {
    const ok = [], errs = [], seen = /* @__PURE__ */ new Set();
    String(text).replace(/\r/g, "").split("\n").forEach((raw, li) => {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("```")) return;
      const cols = line.split(/\t|\s##\s/).map((c) => c.trim());
      const units = cols[0].split(/\s*[|｜]\s*(?=[SVOICPTMRF]\s*[:：])/);
      const parts = [];
      let bad = "";
      units.forEach((u) => {
        const m = u.match(/^([SVOICPTMRF])\s*[:：]\s*(.+)$/);
        if (!m) {
          bad = bad || `\u5F79\u5272\u306E\u6587\u5B57\uFF08S: V: \u306A\u3069\uFF09\u304C\u306A\u3044\uFF1A\u300C${u}\u300D`;
          return;
        }
        let body = m[2].trim();
        const hi = body.indexOf("#");
        let head = hi >= 0 ? body.slice(0, hi) : body, note = hi >= 0 ? body.slice(hi) : "";
        if (!head.includes("=") && head.includes("\uFF1D")) head = head.replace("\uFF1D", "=");
        if (!head.includes("=")) head += "=";
        const en = head.slice(0, head.indexOf("=")).trim();
        if (!/[A-Za-z0-9]/.test(en)) {
          bad = bad || `\u82F1\u8A9E\u304C\u306A\u3044\uFF1A\u300C${u}\u300D`;
          return;
        }
        parts.push(`${m[1]}:${en.replace(/\s+/g, " ")}=${head.slice(head.indexOf("=") + 1).trim()}${note}`);
      });
      if (!bad && !parts.length) bad = "\u30C1\u30E3\u30F3\u30AF\u304C\u306A\u3044";
      const s = parts.join(" | ");
      if (!bad) {
        try {
          const sen = parseSentence2(s, "");
          if (!sen.words.length || sen.words.some((w) => !w)) bad = "\u82F1\u8A9E\u306E\u533A\u5207\u308A\u304C\u304A\u304B\u3057\u3044";
        } catch (e) {
          bad = "\u5F62\u304C\u8AAD\u307F\u53D6\u308C\u306A\u3044";
        }
      }
      if (bad) {
        errs.push({ no: li + 1, line, why: bad });
        return;
      }
      if (seen.has(s)) return;
      seen.add(s);
      let lv = null, cat = "";
      cols.slice(2).forEach((c) => {
        if (!c) return;
        const n = /^(?:Lv\.?|ランク)?\s*(\d{1,2})$/i.exec(c);
        if (n && lv == null && +n[1] >= 1 && +n[1] <= 10) lv = +n[1];
        else if (!cat) cat = c;
      });
      ok.push({ s, ja: cols[1] || "", lv, cat });
    });
    return { ok, errs };
  }
  function buildShortPrompt(asFile) {
    return `\u82F1\u8A9E\u306E\u77ED\u6587\u3092\u3001\u65E5\u672C\u4EBA\u5B66\u7FD2\u8005\u5411\u3051\u306E\u300C\u30C1\u30E3\u30F3\u30AF\u8AAD\u307F\u300D\u30B2\u30FC\u30E0\u7528\u306B\u30011\u884C1\u6587\u306E\u5F62\u5F0F\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002
${asFile ? `\u7D50\u679C\u306F\u3001\u30D5\u30A1\u30A4\u30EB\u4F5C\u6210\u306E\u6A5F\u80FD\u3092\u4F7F\u3063\u3066\u3001\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u308B\u30C6\u30AD\u30B9\u30C8\u30D5\u30A1\u30A4\u30EB\uFF08.txt\u3001\u6587\u5B57\u30B3\u30FC\u30C9\u306F UTF-8\uFF09\u3068\u3057\u3066\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\u3002\u30C1\u30E3\u30C3\u30C8\u306B\u4E2D\u8EAB\u3092\u66F8\u304D\u51FA\u3059\u306E\u3067\u306F\u306A\u304F\u3001\u30D5\u30A1\u30A4\u30EB\u305D\u306E\u3082\u306E\u3092\u6E21\u3057\u3066\u304F\u3060\u3055\u3044\u3002
\u30FB\u30D5\u30A1\u30A4\u30EB\u540D\u306F chunk_shorts.txt \u306B\u3059\u308B\u3002
\u30FB1\u884C\u3054\u3068\u306E\u533A\u5207\u308A\u306F\u3001\u4E0B\u306E\u5F62\u5F0F\u306E\u3068\u304A\u308A\u300C ## \u300D\u306B\u3059\u308B\u3002
\u30FB\u30D5\u30A1\u30A4\u30EB\u306E\u4E2D\u8EAB\u306F1\u884C1\u6587\u3060\u3051\u306B\u3059\u308B\u3002\u898B\u51FA\u3057\u30FB\u8AAC\u660E\u30FB\u7A7A\u884C\u30FB\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u306E\u7DDA\uFF08\`\`\`\uFF09\u306F\u5165\u308C\u306A\u3044\u3002
\u30FB\u30C1\u30E3\u30C3\u30C8\u306B\u306F\u3001\u30D5\u30A1\u30A4\u30EB\u3068\u300C\u4F55\u6587\u4F5C\u3063\u305F\u304B\u300D\u3060\u3051\u3092\u8FD4\u3059\u3002` : `\u7D50\u679C\u306F\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\uFF08\`\`\`\uFF09\u306E\u4E2D\u306B\u30011\u884C1\u6587\u3067\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\u306E\u5916\u306B\u306F\u4F55\u3082\u66F8\u304B\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002`}

\u5F62\u5F0F\uFF081\u884C\uFF1D1\u6587\uFF09\uFF1A
\u5F79\u5272:\u82F1\u8A9E=\u30C1\u30E3\u30F3\u30AF\u306E\u8A33 | \u5F79\u5272:\u82F1\u8A9E=\u30C1\u30E3\u30F3\u30AF\u306E\u8A33 | \u2026 ## \u6587\u5168\u4F53\u306E\u8A33 ## \u30E9\u30F3\u30AF ## \u7528\u9014

\u4F8B\uFF1A
S:My sister=\u59C9\u306F | V:read=\u8AAD\u3093\u3060 | O:an old book=\u53E4\u3044\u672C\u3092 | T:after lunch.=\u663C\u98DF\u306E\u3042\u3068 ## \u59C9\u306F\u663C\u98DF\u306E\u3042\u3068\u53E4\u3044\u672C\u3092\u8AAD\u3093\u3060\u3002 ## 3 ## \u57FA\u672C\u306E\u9806\u756A
S:Emma=\u30A8\u30DE\u306F | V:takes care of=\u4E16\u8A71\u3092\u3059\u308B | O:her little sister=\u59B9\u306E | T:after school.=\u653E\u8AB2\u5F8C ## \u30A8\u30DE\u306F\u653E\u8AB2\u5F8C\u3001\u59B9\u306E\u4E16\u8A71\u3092\u3059\u308B\u3002 ## 4 ## \u719F\u8A9E\u306E\u307E\u3068\u307E\u308A
S:The man / by the window=\u7A93\u306E\u305D\u3070\u306E\u7537\u306E\u4EBA\u306F{\u7537\u306E\u4EBA/\u7A93\u306E\u305D\u3070\u306E} | V:is=\u3060 | C:my father.=\u79C1\u306E\u7236 ## \u7A93\u306E\u305D\u3070\u306E\u7537\u306E\u4EBA\u306F\u79C1\u306E\u7236\u3060\u3002 ## 4 ## \u9577\u3044\u4E3B\u8A9E\u30FB\u7BC0
S:My sister=\u59C9\u306F | V:decided to / visit=\u8A2A\u308C\u308B\u3053\u3068\u306B\u3057\u305F{\u301C\u3059\u308B\u3053\u3068\u306B\u3057\u305F/\u8A2A\u308C\u308B} | O:her grandmother=\u7956\u6BCD\u3092 | P:in the small town / X:by the sea.=\u6D77\u306E\u305D\u3070\u306E\u5C0F\u3055\u306A\u753A\u306B{\u5C0F\u3055\u306A\u753A\u306B/\u6D77\u306E\u305D\u3070\u306E} ## \u59C9\u306F\u6D77\u306E\u305D\u3070\u306E\u5C0F\u3055\u306A\u753A\u306B\u3044\u308B\u7956\u6BCD\u3092\u8A2A\u306D\u308B\u3053\u3068\u306B\u3057\u305F\u3002 ## 5 ## \u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A

\u30EB\u30FC\u30EB\uFF1A
\u30FB\u82F1\u8A9E\u306F\u5143\u306E\u5358\u8A9E\u30FB\u8A18\u53F7\u306E\u307E\u307E\u3001\u9806\u756A\u3069\u304A\u308A\u306B\u3001\u3082\u308C\u306A\u304F\u5165\u308C\u308B\u3002
\u30FB\u5F79\u5272\u306F\u6B21\u306E\u3069\u308C\u304B1\u6587\u5B57\u3002
  S\uFF1D\u4E3B\u8A9E\uFF08\u5F8C\u308D\u304B\u3089\u8AAC\u660E\u304C\u3064\u304F\u4E3B\u8A9E\u3082\u3001\u8AAC\u660E\u3054\u3068 S \u306B\u542B\u3081\u308B\uFF09
  V\uFF1D\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A\uFF08\u52A9\u52D5\u8A5E\u3001\u5426\u5B9A\u3001usually \u306A\u3069\u306E\u983B\u5EA6\u306E\u526F\u8A5E\u3001\u53E5\u52D5\u8A5E\u306E up\u30FBout \u306A\u3069\u3001to\u4E0D\u5B9A\u8A5E\u306E\u52D5\u8A5E\u3001take care of\u30FBlook forward to\u30FBbe good at \u306A\u3069\u306E\u719F\u8A9E\u3082\u542B\u3081\u308B\uFF09
  O\uFF1D\u76EE\u7684\u8A9E\u3000I\uFF1D\u300C\u8AB0\u306B\u300D\u306B\u3042\u305F\u308B\u76EE\u7684\u8A9E\u3000C\uFF1D\u88DC\u8A9E
  P\uFF1D\u5834\u6240\u3000T\uFF1D\u6642\uFF08when\u2026 \u3084 after\u2026 \u306A\u3069\u306E\u6642\u306E\u7BC0\u3082\u542B\u3080\uFF09
  M\uFF1D\u69D8\u5B50\u30FB\u624B\u6BB5\u30FB\u8AB0\u3068\u30FB\u76EE\u7684\u30FB\u305D\u306E\u4ED6\u3000R\uFF1D\u7406\u7531\uFF08because\u2026 \u306A\u3069\uFF09\u3000F\uFF1D\u6761\u4EF6\uFF08if\u2026 \u306A\u3069\uFF09
\u30FB\u5F79\u5272\u306E\u304B\u305F\u307E\u308A\u306E\u4E2D\u306F\u3001\u610F\u5473\u306E\u307E\u3068\u307E\u308A\uFF08\u30C1\u30E3\u30F3\u30AF\uFF09\u3054\u3068\u306B\u300C / \u300D\u3067\u5C0F\u3055\u304F\u5206\u3051\u308B\u3002\u30B2\u30FC\u30E0\u3067\u306F\u3001\u5F79\u5272\u306E\u304B\u305F\u307E\u308A\u5168\u4F53\u3067\u5207\u3063\u3066\u3082\u3001\u300C / \u300D\u3067\u5206\u3051\u305F\u5C0F\u3055\u306A\u307E\u3068\u307E\u308A\u3067\u5207\u3063\u3066\u3082\u6B63\u89E3\u306B\u306A\u308B\u3002
  \u30FB\u539F\u5247\uFF1A\u610F\u5473\u306E\u5206\u304B\u308C\u76EE\u304C\u3042\u308C\u3070\u3001\u88DC\u52A9\u306E\u533A\u5207\u308A\u300C / \u300D\u3092\u5165\u308C\u308B\u3002\u8FF7\u3063\u305F\u3089\u5165\u308C\u308B\u3002\u305F\u3060\u3057\u3001\u5358\u8A9E\u3054\u3068\u306B\u7D30\u304B\u304F\u5207\u308B\u3053\u3068\u306F\u3057\u306A\u3044\u3002\u4E0B\u306B\u6319\u3052\u308B\u306E\u306F\u4F8B\u3067\u3001\u3053\u308C\u306B\u9650\u3089\u306A\u3044\u3002
  \u30FB\u4E3B\u8A9E\u30FB\u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E\u306B\u3001\u5F8C\u308D\u304B\u3089\u8AAC\u660E\uFF08\u95A2\u4FC2\u8A5E\u30FB\u5F62\u5BB9\u8A5E\u53E5\u30FB\u524D\u7F6E\u8A5E\u53E5\u30FB\u5206\u8A5E\u306A\u3069\uFF09\u304C\u3064\u304F\u3068\u304D\u306F\u3001\u8AAC\u660E\u3082\u540C\u3058\u5F79\u5272\u306B\u5165\u308C\u305F\u307E\u307E\u300C\u4E2D\u5FC3 / \u8AAC\u660E\u300D\u3068\u5206\u3051\u308B\u3002\uFF083\u3064\u76EE\u306E\u4F8B\uFF09
  \u30FB\u52D5\u8A5E\u306F\u3001\u52A9\u52D5\u8A5E\uFF08can\u30FBwill\u30FBmust\u30FBshould \u306A\u3069\uFF09\u3092\u5148\u306B\u5206\u3051\u308B\u3002\u307E\u305F be going to\u30FBdecided to\u30FBwant to\u30FBused to\u30FBhave to \u306A\u3069\u306E\u300C\u719F\u8A9E\uFF0B\u52D5\u8A5E\u300D\u306F\u300C\u719F\u8A9E / \u52D5\u8A5E\u300D\u3068\u5206\u3051\u308B\u3002\u4F8B\uFF1Acan / have an influence on\u3000will / be able to / speak\u3000decided to / visit\uFF084\u3064\u76EE\u306E\u4F8B\uFF09
  \u30FB\u5834\u6240\u30FB\u6642\u30FB\u69D8\u5B50\u30FB\u7406\u7531\u30FB\u6761\u4EF6\u304C\u9577\u3044\u3068\u304D\u306F\u3001\u610F\u5473\u306E\u5207\u308C\u76EE\u3067\u5206\u3051\u308B\u3002\u76F4\u524D\u306E\u540D\u8A5E\u3084\u8A9E\u53E5\u3092\u5F8C\u308D\u304B\u3089\u8AAC\u660E\u3059\u308B\u90E8\u5206\u306F\u3001\u305D\u306E\u5C0F\u3055\u306A\u307E\u3068\u307E\u308A\u306E\u5148\u982D\u306B\u300CX:\u300D\u3092\u4ED8\u3051\u308B\uFF08\u300C\u3064\u3051\u8DB3\u3057\u300D\u306E\u5370\uFF09\u3002\u4F8B\uFF1Ain the small town / X:by the sea\uFF08text \u306E\u4E2D\u3067\u3082\u300C / X:by the sea\u300D\u306E\u3088\u3046\u306B\u66F8\u304F\uFF09\u3002\u4E3B\u8A9E\u30FB\u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E\u306E\u300C\u4E2D\u5FC3 / \u8AAC\u660E\u300D\u306B\u306F\u4ED8\u3051\u306A\u3044\u3002
  \u30FB\u5BFE\u306B\u306A\u308B\u8A00\u3044\u65B9\u3084\u3001\u610F\u5473\u304C\u5206\u304B\u308C\u308B\u8A00\u3044\u65B9\u3082\u5206\u3051\u308B\u3002\u4F8B\uFF1Anot only English / but also French\u3000both A / and B\u3000either A / or B\u3000so that / you can find it\u3000in order to / catch the train\u3000more difficult / than I thought\u3000It is important / for you / to get enough sleep\uFF08for \u301C / to \u301C \u306F M \u306E\u4E2D\u3067\u5206\u3051\u308B\uFF09
  \u30FB\u53D6\u308A\u6B8B\u3055\u306A\u3044\uFF1A\u51A0\u8A5E\uFF0B\u540D\u8A5E\u3001\u524D\u7F6E\u8A5E\uFF0B\u540D\u8A5E\u3001to\uFF0B\u52D5\u8A5E\u306E\u3088\u3046\u306B\u30011\u3064\u3067\u306F\u610F\u5473\u306B\u306A\u3089\u306A\u3044\u8A9E\u306F\u3001\u524D\u5F8C\u306E\u8A9E\u304B\u3089\u5207\u308A\u96E2\u3055\u306A\u3044\u3002not only\u30FBso that\u30FBin order to \u306E\u3088\u3046\u306B\u3001\u305D\u308C\u3060\u3051\u30671\u3064\u306E\u610F\u5473\u306B\u306A\u308B\u8A9E\u53E5\u306F\u30011\u3064\u306E\u307E\u3068\u307E\u308A\u306B\u3057\u3066\u3088\u3044\u3002
  \u30FB\u300C / \u300D\u3067\u5206\u3051\u305F\u304B\u305F\u307E\u308A\u306F\u3001\u8A33\u306E\u6700\u5F8C\u306B {1\u3064\u76EE\u306E\u8A33/2\u3064\u76EE\u306E\u8A33} \u3092\u3001\u5206\u3051\u305F\u6570\u3060\u3051\u4ED8\u3051\u308B\u3002\u5206\u3051\u306A\u3044\u304B\u305F\u307E\u308A\u306B\u306F\u4ED8\u3051\u306A\u3044\u3002
\u30FB\u30C1\u30E3\u30F3\u30AF\u306E\u8A33\u306F\u3001\u3064\u306A\u3052\u3066\u8AAD\u3081\u308B\u5F62\u306B\u3059\u308B\uFF08\u4E3B\u8A9E\u306F\u300C\u301C\u306F\uFF0F\u301C\u304C\u300D\u3001\u76EE\u7684\u8A9E\u306F\u300C\u301C\u3092\u300D\u306A\u3069\uFF09\u3002
\u30FB\u30E9\u30F3\u30AF\uFF1A\u96E3\u6613\u5EA6\u30921\u301C10\u306E\u6570\u5B57\u3067\u30021\uFF1D\u5165\u9580\uFF08\u5C0F\u5B66\u6821\u4F4E\u301C\u4E2D\u5B66\u5E74\uFF09 2\uFF1D\u5C0F\u5B66\u6821\u9AD8\u5B66\u5E74 3\uFF1D\u4E2D1\u30FB\u82F1\u691C5\u7D1A 4\uFF1D\u4E2D2\u30FB\u82F1\u691C4\u7D1A 5\uFF1D\u4E2D3\u30FB\u82F1\u691C3\u7D1A 6\uFF1D\u9AD81\u301C2\u30FB\u82F1\u691C\u6E962\u7D1A 7\uFF1D\u9AD83\u30FB\u82F1\u691C2\u7D1A 8\uFF1D\u96E3\u95A2\u5927\u30FB\u82F1\u691C\u6E961\u7D1A 9\uFF1D\u5927\u5B66\u30FB\u82F1\u691C1\u7D1A 10\uFF1D\u305D\u308C\u4EE5\u4E0A
\u30FB\u7528\u9014\uFF1A\u6B21\u306E\u3069\u308C\u304B\u3002\u5F53\u3066\u306F\u307E\u3089\u306A\u3051\u308C\u3070\u3001\u5185\u5BB9\u306B\u5408\u3046\u77ED\u3044\u540D\u524D\u3092\u4ED8\u3051\u308B\u3002
  \u57FA\u672C\u306E\u9806\u756A\uFF0F\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A\uFF0F\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A\uFF0F\u9577\u3044\u4E3B\u8A9E\u30FB\u7BC0

\u6587\uFF1A
\uFF08\u3053\u306E\u4E0B\u306B\u82F1\u6587\u3092\u8CBC\u308A\u4ED8\u3051\u308B\u304B\u3001\u300C\u4E2D1\u30EC\u30D9\u30EB\u3067\u3001\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A\u306E\u6587\u309230\u6587\u4F5C\u3063\u3066\u300D\u306E\u3088\u3046\u306B\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\uFF09
`;
  }
  function renderShortEditor() {
    $("edHead").textContent = "\u77ED\u6587\u3092\u307E\u3068\u3081\u3066\u5165\u308C\u308B";
    const canShare = !!(DB && IS_ADMIN), mine = loadMyShorts(), shared = SHORTS || [];
    const sum = (list) => {
      const c = {};
      list.forEach((x) => {
        const k = `${x.cat || "\u7528\u9014\u306A\u3057"}\u30FB${x.lv ? "\u30E9\u30F3\u30AF" + x.lv : "\u30E9\u30F3\u30AF\u306A\u3057"}`;
        c[k] = (c[k] || 0) + 1;
      });
      return Object.entries(c).sort().map(([k, n]) => `${esc2(k)}\uFF1A${n}\u6587`).join("<br>") || "\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002";
    };
    $("edBody").innerHTML = `<h3>FORMAT</h3>
    <p class="edStatus">1\u884C\u306B1\u6587\u3002\u30C1\u30E3\u30F3\u30AF\u3092\u300C | \u300D\u3067\u533A\u5207\u308A\u3001\u300C ## \u300D\uFF08\u307E\u305F\u306F\u30BF\u30D6\uFF09\u306E\u3042\u3068\u306B\u5168\u4F53\u8A33\u30FB\u30E9\u30F3\u30AF\u30FB\u7528\u9014\u3092\u66F8\u304D\u307E\u3059\u3002\u8A33\u30FB\u30E9\u30F3\u30AF\u30FB\u7528\u9014\u306F\u7701\u7565\u3067\u304D\u307E\u3059\u3002</p>
    <textarea readonly style="min-height:64px;font-size:12px">S:My sister=\u59C9\u306F | V:read=\u8AAD\u3093\u3060 | O:an old book=\u53E4\u3044\u672C\u3092 | T:after lunch.=\u663C\u98DF\u306E\u3042\u3068 ## \u59C9\u306F\u663C\u98DF\u306E\u3042\u3068\u53E4\u3044\u672C\u3092\u8AAD\u3093\u3060\u3002 ## 3 ## \u57FA\u672C\u306E\u9806\u756A</textarea>
    <p class="edStatus">\u7528\u9014\u3092\u300C\u57FA\u672C\u306E\u9806\u756A\u300D\u300C\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A\u300D\u300C\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A\u300D\u300C\u9577\u3044\u4E3B\u8A9E\u30FB\u7BC0\u300D\u306B\u3059\u308B\u3068\u3001\u30B2\u30FC\u30E0\u306E\u30E9\u30F3\u30C0\u30E0\u3067\u305D\u306E\u9762\u306B\u51FA\u307E\u3059\u3002\u307B\u304B\u306E\u7528\u9014\u306F\u30DF\u30C3\u30AF\u30B9\uFF08\u97625\u301C\uFF09\u306B\u51FA\u307E\u3059\u3002STUDY \u306E Chunk Practice \u3067\u306F\u3001\u30E9\u30F3\u30AF\u5225\u30FB\u7528\u9014\u5225\u306B\u9078\u3079\u307E\u3059\u3002</p>
    <h3>FILE</h3>
    <ol class="edSteps"><li>\u4E0B\u306E\u300C\u30D5\u30A1\u30A4\u30EB\u7528\u306E\u6307\u793A\u6587\u3092\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3059</li><li>\u30D5\u30A1\u30A4\u30EB\u3092\u4F5C\u308C\u308BAI\uFF08Claude \u306A\u3069\uFF09\u306B\u8CBC\u308A\u4ED8\u3051\u3001\u7D9A\u3051\u3066\u82F1\u6587\uFF08\u307E\u305F\u306F\u4F5C\u3063\u3066\u307B\u3057\u3044\u5185\u5BB9\uFF09\u3092\u66F8\u3044\u3066\u9001\u308B</li><li>\u3067\u304D\u305F chunk_shorts.txt \u3092\u3001\u4E0B\u306E\u67A0\u306B\u5165\u308C\u308B\uFF08\u30C9\u30ED\u30C3\u30D7\u3001\u307E\u305F\u306F\u30BF\u30C3\u30D7\u3057\u3066\u9078\u3076\uFF09\u3002\u305D\u308C\u3060\u3051\u3067\u5165\u308A\u307E\u3059</li></ol>
    <div class="edRow"><button class="edBtn pri" id="shCopyFile">\u30D5\u30A1\u30A4\u30EB\u7528\u306E\u6307\u793A\u6587\u3092\u30B3\u30D4\u30FC</button></div>
    <div class="edRow edSet"><label>\u5165\u308C\u5148 <select id="shDest"><option value="mine">\u81EA\u5206\u306E\u77ED\u6587\uFF08\u3053\u306E\u7AEF\u672B\u3060\u3051\uFF09</option>${canShare ? `<option value="shared">\u307F\u3093\u306A\u306E\u77ED\u6587\uFF08\u5168\u54E1\u306E\u30B2\u30FC\u30E0\u306B\u51FA\u308B\uFF09</option>` : ""}</select></label>
      <label>\u540D\u524D\uFF08\u4EFB\u610F\uFF09 <input type="text" id="shName" placeholder="\u4F8B\uFF1A\u719F\u8A9E\u30BB\u30C3\u30C81" style="width:140px"></label></div>
    <button class="edBtn" id="shDrop" style="width:100%;min-height:96px;border-style:dashed;font-size:14px">\u3053\u3053\u306B\u30D5\u30A1\u30A4\u30EB\u3092\u30C9\u30ED\u30C3\u30D7<br><small style="color:#9aa6b8">\u307E\u305F\u306F\u30BF\u30C3\u30D7\u3057\u3066\u9078\u3076\uFF08.txt\uFF09</small></button>
    <input type="file" id="shFile" accept=".txt,.tsv,text/plain" hidden>
    <details class="edCopy"><summary>\u6307\u793A\u6587\u306E\u4E2D\u8EAB\u3092\u898B\u308B</summary><textarea id="shPrompt" aria-label="AI\u7528\u306E\u6307\u793A\u6587\uFF08\u30D5\u30A1\u30A4\u30EB\u7528\uFF09" style="min-height:160px;font-size:12px"></textarea></details>
    <h3>PASTE</h3>
    <p class="edStatus">\u6587\u3092\u76F4\u63A5\u8CBC\u3063\u3066\u5165\u308C\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\u3002AI\u306B\u30C1\u30E3\u30C3\u30C8\u3067\u8FD4\u3057\u3066\u3082\u3089\u3046\u3068\u304D\u306F\u3001\u3053\u3061\u3089\u306E\u6307\u793A\u6587\u3092\u4F7F\u3044\u307E\u3059\u3002</p>
    <div class="edRow"><button class="edBtn" id="shCopyChat">\u30C1\u30E3\u30C3\u30C8\u7528\u306E\u6307\u793A\u6587\u3092\u30B3\u30D4\u30FC</button></div>
    <textarea id="shIn" placeholder="\u3053\u3053\u306B\u8CBC\u308A\u4ED8\u3051\uFF08\u4F55\u884C\u3067\u3082OK\uFF09" style="min-height:140px;font-size:13px"></textarea>
    <div class="edRow"><button class="edBtn pri" id="shCheck">\u78BA\u8A8D\u3059\u308B</button></div>
    <div class="edStatus" id="edStatus"></div>
    <div id="shPreview"></div>
    <h3>MY SHORTS\uFF08${mine.length}\u6587\uFF09</h3><p class="edStatus">${sum(mine)}</p>
    ${mine.length ? `<details class="edCopy" id="shMineBox"><summary>1\u6587\u305A\u3064\u898B\u308B\u30FB\u76F4\u3059\u30FB\u6D88\u3059</summary><div id="shMineList" class="shList"></div></details>
      <div class="edRow"><button class="edBtn del" id="shClearMine">\u81EA\u5206\u306E\u77ED\u6587\u3092\u5168\u90E8\u6D88\u3059</button></div>` : ""}
    ${DB ? `<h3>\u307F\u3093\u306A\u306E\u77ED\u6587\uFF08${shortsShared().length}\u6587\uFF09</h3>
      ${shared.length ? shared.map((d, i) => `<div class="edItem"><b>${esc2(d.title || "\uFF08\u540D\u524D\u306A\u3057\uFF09")}</b><small>${shortDocCount(d)}\u6587\u30FB${d.at ? new Date(d.at).toLocaleDateString() : ""}</small>${canShare ? `<div class="edRow"><button class="edBtn" data-shedit="${i}">1\u6587\u305A\u3064\u898B\u308B\u30FB\u76F4\u3059</button><button class="edBtn del" data-shdrop="${i}">\u53D6\u308A\u4E0B\u3052</button></div><div class="shList" id="shDoc${i}" hidden></div>` : ""}</div>`).join("") : `<p class="edStatus">\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002</p>`}` : ""}
    <div class="edRow" style="margin-top:8px"><button class="edBtn" id="shBack">\u4E00\u89A7\u3078\u623B\u308B</button></div>`;
    $("shPrompt").value = buildShortPrompt(true);
    const copyP = async (f) => {
      const t = buildShortPrompt(f);
      const ok = await copyText(t);
      if (!ok) {
        const d = $("edBody").querySelector(".edCopy");
        d.open = true;
        $("shPrompt").value = t;
        const ta = $("shPrompt");
        ta.focus();
        ta.select();
      }
      edStatus(ok ? "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002AI\u306B\u8CBC\u308A\u4ED8\u3051\u3066\u9001\u3063\u3066\u304F\u3060\u3055\u3044\u3002" : "\u81EA\u52D5\u3067\u30B3\u30D4\u30FC\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u6307\u793A\u6587\u3092\u9078\u629E\u3057\u305F\u306E\u3067\u3001\u305D\u306E\u307E\u307E\u30B3\u30D4\u30FC\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    };
    $("shCopyFile").onclick = () => copyP(true);
    $("shCopyChat").onclick = () => copyP(false);
    const takeFile = async (f) => {
      if (!f) return;
      let t;
      try {
        t = await f.text();
      } catch (err) {
        edStatus("\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        return;
      }
      $("shIn").value = t;
      shCheck(true, f.name);
    };
    $("shDrop").onclick = () => $("shFile").click();
    $("shFile").onchange = (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      takeFile(f);
    };
    const dz = $("shDrop");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.style.borderColor = "var(--accent)";
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.style.borderColor = "";
    }));
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      takeFile(f);
    });
    $("shBack").onclick = renderMyList;
    if ($("shClearMine")) $("shClearMine").onclick = async () => {
      if (!await ask(`\u81EA\u5206\u306E\u77ED\u6587 ${loadMyShorts().length}\u6587\u3092\u3001\u5168\u90E8\u6D88\u3057\u307E\u3059\u304B\uFF1F`, "\u6D88\u3059")) return;
      if (!await ask("\u6D88\u3057\u305F\u77ED\u6587\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002\u672C\u5F53\u306B\u6D88\u3057\u307E\u3059\u304B\uFF1F", "\u672C\u5F53\u306B\u6D88\u3059")) return;
      saveMyShorts([]);
      toast("\u81EA\u5206\u306E\u77ED\u6587\u3092\u6D88\u3057\u307E\u3057\u305F");
      renderShortEditor();
    };
    $("edBody").querySelectorAll("[data-shdrop]").forEach((b) => b.onclick = async () => {
      const d = shared[+b.dataset.shdrop];
      if (!await ask(`\u300C${d.title || "\u540D\u524D\u306A\u3057"}\u300D\uFF08${shortDocCount(d)}\u6587\uFF09\u3092\u3001\u307F\u3093\u306A\u306E\u77ED\u6587\u304B\u3089\u53D6\u308A\u4E0B\u3052\u307E\u3059\u304B\uFF1F
\u5168\u54E1\u306E\u30B2\u30FC\u30E0\u304B\u3089\u6D88\u3048\u307E\u3059\u3002`, "\u53D6\u308A\u4E0B\u3052\u308B")) return;
      try {
        await DB.doc("shorts/" + d.id).delete();
        SHORTS = SHORTS.filter((x) => x.id !== d.id);
        toast("\u53D6\u308A\u4E0B\u3052\u307E\u3057\u305F");
      } catch (e) {
        await tell("\u53D6\u308A\u4E0B\u3052\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      }
      renderShortEditor();
    });
    $("shCheck").onclick = () => shCheck(false);
    if ($("shMineBox")) $("shMineBox").addEventListener("toggle", () => {
      if ($("shMineBox").open && !$("shMineList").innerHTML)
        shortItemsEditor($("shMineList"), loadMyShorts, async (items) => saveMyShorts(items));
    }, { once: false });
    $("edBody").querySelectorAll("[data-shedit]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.shedit, box = $("shDoc" + i);
      box.hidden = !box.hidden;
      if (box.hidden || box.innerHTML) return;
      const cur2 = () => {
        const d = (SHORTS || []).find((x) => x.id === shared[i].id);
        return d ? d.lines ? d.lines.map(lineToShort) : d.items || [] : [];
      };
      shortItemsEditor(box, cur2, async (items) => {
        const d = (SHORTS || []).find((x) => x.id === shared[i].id);
        if (!d) return false;
        const lines = items.map(shortToLine);
        if (shortDocSize(d.title || "", lines) > SHORT_DOC_MAX) {
          await tell("\u3053\u306E\u307E\u3068\u307E\u308A\u306B\u5165\u308B\u91CF\u3092\u8D85\u3048\u3066\u3044\u307E\u3059\u3002");
          return false;
        }
        const doc = { title: d.title || "", lines, by: d.by || MYID || null, at: Date.now() };
        try {
          await DB.doc("shorts/" + d.id).set(doc);
          SHORTS = SHORTS.map((x) => x.id === d.id ? { ...doc, id: d.id } : x);
          return true;
        } catch (e) {
          return false;
        }
      });
    });
    function shCheck(auto, fileName) {
      const { ok, errs } = parseShortLines($("shIn").value);
      const shared2 = $("shDest").value === "shared", name = $("shName").value.trim() || (fileName ? fileName.replace(/\.[^.]+$/, "") : (/* @__PURE__ */ new Date()).toLocaleDateString() + " \u306E\u77ED\u6587");
      const have = new Set((shared2 ? shortsShared() : loadMyShorts()).map((x) => x.s));
      const fresh = ok.filter((x) => !have.has(x.s)), dup = ok.length - fresh.length;
      let fit = fresh.length, pct = 0;
      if (shared2 && fresh.length) {
        const lines = fresh.map(shortToLine);
        if (shortDocSize(name, lines) > SHORT_DOC_MAX) {
          let lo = 0, hi = lines.length;
          while (lo < hi) {
            const m = Math.ceil((lo + hi) / 2);
            if (shortDocSize(name, lines.slice(0, m)) <= SHORT_DOC_MAX) lo = m;
            else hi = m - 1;
          }
          fit = lo;
        }
        pct = Math.round(shortDocSize(name, lines.slice(0, fit)) / SHORT_DOC_MAX * 100);
      }
      const over = fit < fresh.length;
      if (auto && fresh.length && !errs.length && !over) {
        addShorts(fresh, fit, name, shared2, dup);
        return;
      }
      const lvs = fresh.filter((x) => x.lv).length, cats = [...new Set(fresh.map((x) => x.cat).filter(Boolean))];
      $("shPreview").innerHTML = `<div class="edItem"><b>${!fresh.length ? dup ? `${dup}\u6587\u3068\u3082\u3001\u3059\u3067\u306B\u5165\u3063\u3066\u3044\u307E\u3059` : "\u5165\u308C\u3089\u308C\u308B\u6587\u304C\u3042\u308A\u307E\u305B\u3093" : over ? `1\u56DE\u306B\u5165\u308C\u3089\u308C\u308B\u91CF\u3092\u8D85\u3048\u3066\u3044\u307E\u3059\uFF08${fresh.length}\u6587\u306E\u3046\u3061\u3001${fit}\u6587\u307E\u3067\u5165\u308A\u307E\u3059\uFF09` : `${fresh.length}\u6587\u3092\u5165\u308C\u3089\u308C\u307E\u3059`}</b>
      ${fileName ? `<small>\u300C${esc2(fileName)}\u300D\u306E\u4E2D\u8EAB\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F${errs.length ? "\uFF08\u8AAD\u3081\u306A\u3044\u884C\u304C\u3042\u308B\u306E\u3067\u6B62\u3081\u3066\u3044\u307E\u3059\uFF09" : over ? "\uFF08\u591A\u3059\u304E\u308B\u306E\u3067\u6B62\u3081\u3066\u3044\u307E\u3059\uFF09" : ""}</small>` : ""}
      ${shared2 && fresh.length ? `<small>\u3053\u306E\u307E\u3068\u307E\u308A\u306E\u5927\u304D\u3055\uFF1A${pct}\uFF05${over ? "\uFF08\u5165\u308C\u306A\u304B\u3063\u305F\u884C\u306F\u3001\u8CBC\u308A\u4ED8\u3051\u6B04\u306B\u6B8B\u308A\u307E\u3059\uFF09" : ""}</small>` : ""}
      ${fresh.length ? `<small>\u30E9\u30F3\u30AF\u3042\u308A ${lvs}\u6587\u30FB\u7528\u9014\uFF1A${cats.length ? cats.map(esc2).join("\u3001") : "\u306A\u3057"}${dup ? `\u30FB\u3059\u3067\u306B\u5165\u3063\u3066\u3044\u308B ${dup}\u6587\u306F\u98DB\u3070\u3057\u307E\u3059` : ""}</small>` : ""}
      ${fresh.slice(0, 3).map((x) => `<small style="font-family:var(--en)">${esc2(parseSentence2(x.s, "").words.join(" "))}</small>`).join("")}
      ${errs.length ? `<small style="color:#ff8f8f">\u8AAD\u307F\u8FBC\u3081\u306A\u3044\u884C\u304C ${errs.length}\u884C\u3042\u308A\u307E\u3059\uFF08\u3053\u306E\u884C\u306F\u5165\u308C\u307E\u305B\u3093\uFF09\uFF1A</small>${errs.slice(0, 10).map((e) => `<small style="color:#ff8f8f">${e.no}\u884C\u76EE\uFF1A${esc2(e.why)}</small>`).join("")}${errs.length > 10 ? `<small style="color:#ff8f8f">\u307B\u304B ${errs.length - 10}\u884C</small>` : ""}` : ""}
      ${fit ? `<div class="edRow"><button class="edBtn pri" id="shAdd">${over ? `\u6700\u521D\u306E${fit}\u6587\u3060\u3051\u5165\u308C\u308B` : `${fresh.length}\u6587\u3092\u5165\u308C\u308B`}</button></div>` : ""}</div>`;
      edStatus(ok.length || errs.length || dup ? "" : "\u5165\u308C\u308B\u884C\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
      if (fit) $("shAdd").onclick = () => addShorts(fresh, fit, name, shared2, dup);
    }
    async function addShorts(fresh, fit, name, shared2, dup) {
      const skip = dup ? `\uFF08\u3059\u3067\u306B\u5165\u3063\u3066\u3044\u305F${dup}\u6587\u306F\u98DB\u3070\u3057\u307E\u3057\u305F\uFF09` : "";
      if (!shared2) {
        const l = loadMyShorts().concat(fresh);
        if (saveMyShorts(l)) {
          renderShortEditor();
          edStatus(`\u81EA\u5206\u306E\u77ED\u6587\u306B ${fresh.length}\u6587\u3092\u5165\u308C\u307E\u3057\u305F${skip}`);
          toast(`${fresh.length}\u6587\u3092\u5165\u308C\u307E\u3057\u305F`);
        } else tell("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3053\u306E\u753B\u9762\u3067\u306F\u30D6\u30E9\u30A6\u30B6\u3078\u306E\u4FDD\u5B58\u304C\u4F7F\u3048\u306A\u3044\u3088\u3046\u3067\u3059\u3002");
        return;
      }
      const b = $("shAdd");
      if (b) b.disabled = true;
      const part = fresh.slice(0, fit), rest = fresh.slice(fit), id = "s" + Date.now();
      const doc = { title: name, lines: part.map(shortToLine), by: MYID || null, at: Date.now() };
      try {
        await DB.doc("shorts/" + id).set(doc);
        SHORTS = (SHORTS || []).concat([{ ...doc, id }]);
        renderShortEditor();
        $("shDest").value = "shared";
        if (rest.length) {
          $("shIn").value = rest.map(shortToLine).join("\n");
          edStatus(`\u307F\u3093\u306A\u306E\u77ED\u6587\u306B ${fit}\u6587\u3092\u5165\u308C\u307E\u3057\u305F${skip}\u3002\u6B8B\u308A\u306E${rest.length}\u6587\u306F\u8CBC\u308A\u4ED8\u3051\u6B04\u306B\u6B8B\u3057\u3066\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u3066\u5165\u308C\u308B\u3068\u304D\u306F\u300C\u78BA\u8A8D\u3059\u308B\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
        } else edStatus(`\u307F\u3093\u306A\u306E\u77ED\u6587\u306B ${fit}\u6587\u3092\u5165\u308C\u307E\u3057\u305F${skip}`);
        toast(`\u307F\u3093\u306A\u306E\u77ED\u6587\u306B ${fit}\u6587\u3092\u5165\u308C\u307E\u3057\u305F`);
      } catch (e) {
        await tell(e && e.code === "quota_exceeded" ? "\u5171\u6709\u306E\u4FDD\u5B58\u6570\u304C\u3044\u3063\u3071\u3044\u3067\u3059\u3002\u4E0D\u8981\u306A\u9577\u6587\u3084\u77ED\u6587\u3092\u53D6\u308A\u4E0B\u3052\u3066\u304F\u3060\u3055\u3044\u3002" : "\u5165\u308C\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u7DE8\u96C6\u306E\u6A29\u9650\u304C\u306A\u3044\u304B\u3001\u901A\u4FE1\u306E\u554F\u984C\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002");
        if (b) b.disabled = false;
      }
    }
  }
  function shortPickItems() {
    const all = shortsAll();
    if (!all.length) return [];
    const byLv = {}, byCat = {};
    all.forEach((x) => {
      (byLv[x.lv || 0] = byLv[x.lv || 0] || []).push(x);
      if (x.cat) (byCat[x.cat] = byCat[x.cat] || []).push(x);
    });
    return [
      ...Object.keys(byLv).sort((a, b) => a - b).map((lv, i) => ({ label: +lv ? `\u77ED\u6587 \u30E9\u30F3\u30AF${lv}` : "\u77ED\u6587 \u30E9\u30F3\u30AF\u306A\u3057", level: +lv || null, sub: `\u30E9\u30F3\u30AF\u5225\u30FB${byLv[lv].length}\u6587`, ord: 800 + i, go: () => startShortPractice(byLv[lv], +lv ? `\u77ED\u6587 \u30E9\u30F3\u30AF${lv}` : "\u77ED\u6587") })),
      ...Object.keys(byCat).sort().map((c, i) => ({ label: `\u77ED\u6587\uFF1A${c}`, level: null, sub: `\u7528\u9014\u5225\u30FB${byCat[c].length}\u6587`, ord: 900 + i, go: () => startShortPractice(byCat[c], `\u77ED\u6587\uFF1A${c}`) }))
    ];
  }
  var shLine = (x) => [x.s, x.ja || "", x.lv || "", x.cat || ""].join(" ## ").replace(/( ## )+$/, "");
  function shortItemsEditor(box, getItems, save) {
    let q = "", openI = -1;
    const draw = () => {
      const items = getItems(), key = (x) => (x.s + " " + (x.ja || "") + " " + (x.cat || "")).toLowerCase();
      const hits = items.map((x, i) => [x, i]).filter(([x]) => !q || key(x).includes(q.toLowerCase()));
      box.innerHTML = `<input type="text" class="shFind" placeholder="\u3055\u304C\u3059\uFF08\u82F1\u8A9E\u30FB\u8A33\u30FB\u7528\u9014\uFF09" value="${esc2(q)}">
      <small class="edStatus">${hits.length}\u6587${hits.length > 50 ? "\uFF08\u6700\u521D\u306E50\u6587\u3092\u8868\u793A\u3002\u3055\u304C\u3059\u3068\u7D5E\u308C\u307E\u3059\uFF09" : ""}</small>
      ${hits.slice(0, 50).map(([x, i]) => `<div class="edItem shRow" data-i="${i}">${i === openI ? `<textarea class="shEd" style="min-height:76px;font-size:12px">${esc2(shLine(x))}</textarea>
          <div class="edRow"><button class="edBtn pri" data-act="save">\u4E0A\u66F8\u304D\u3059\u308B</button><button class="edBtn" data-act="cancel">\u3084\u3081\u308B</button><button class="edBtn del" data-act="del">\u3053\u306E\u6587\u3092\u6D88\u3059</button></div>
          <small class="shErr" style="color:#ff8f8f"></small>` : `<small style="font-family:var(--en);color:#e8ecf2;font-size:13px">${esc2(parseSentence2(x.s, "").words.join(" "))}</small>
          <small>${esc2(x.ja || "\uFF08\u8A33\u306A\u3057\uFF09")}${x.lv ? `\u30FB\u30E9\u30F3\u30AF${x.lv}` : ""}${x.cat ? `\u30FB${esc2(x.cat)}` : ""}</small>
          <div class="edRow"><button class="edBtn" data-act="edit">\u76F4\u3059</button></div>`}</div>`).join("")}`;
      const f = box.querySelector(".shFind");
      f.oninput = () => {
        q = f.value;
        const p = f.selectionStart;
        draw();
        const g = box.querySelector(".shFind");
        g.focus();
        g.setSelectionRange(p, p);
      };
      box.querySelectorAll(".shRow").forEach((row) => {
        const i = +row.dataset.i, err = (t) => {
          const e = row.querySelector(".shErr");
          if (e) e.textContent = t;
        };
        row.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
          const act = b.dataset.act;
          if (act === "edit") {
            openI = i;
            draw();
            const t = box.querySelector(".shEd");
            if (t) t.focus();
            return;
          }
          if (act === "cancel") {
            openI = -1;
            draw();
            return;
          }
          const items2 = getItems().slice();
          if (act === "del") {
            if (!await ask("\u3053\u306E\u6587\u3092\u6D88\u3057\u307E\u3059\u304B\uFF1F", "\u6D88\u3059")) return;
            items2.splice(i, 1);
          } else {
            const { ok, errs } = parseShortLines(row.querySelector(".shEd").value);
            if (errs.length) {
              err("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF1A" + errs[0].why);
              return;
            }
            if (ok.length !== 1) {
              err("1\u884C\u306B1\u6587\u3060\u3051\u66F8\u3044\u3066\u304F\u3060\u3055\u3044");
              return;
            }
            if (items2.some((x, j) => j !== i && x.s === ok[0].s)) {
              err("\u540C\u3058\u6587\u304C\u3001\u307B\u304B\u306B\u3059\u3067\u306B\u3042\u308A\u307E\u3059");
              return;
            }
            items2[i] = ok[0];
          }
          b.disabled = true;
          if (await save(items2)) {
            openI = -1;
            toast(act === "del" ? "\u6D88\u3057\u307E\u3057\u305F" : "\u4E0A\u66F8\u304D\u3057\u307E\u3057\u305F");
            draw();
          } else {
            b.disabled = false;
            err("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
          }
        });
      });
    };
    draw();
  }

  // games/chunkchunk/src/pick.js
  var pickTok = 0;
  function pickText(kind, noFetch) {
    const tok = ++pickTok;
    if (DB && !noFetch) loadShared().then(() => {
      if (tok === pickTok && !$("modal").hidden && $("sheet").querySelector("#optMyLv")) pickText(kind, true);
    });
    const mine = loadMy().filter((t) => t.sents && t.sents.length), shr = (SHARED || []).filter((t) => t.sents && t.sents.length);
    const lvOf = (key, base) => key && LVO[key] != null ? LVO[key] : base || null;
    let items = kind === "read" ? [
      ...STORIES.filter((s) => QUESTIONS[s.title]).map((s, i) => ({ label: s.title, key: s.id, level: lvOf(s.id, s.level), sub: `\u5185\u8535\u30FB${QUESTIONS[s.title].length}\u554F`, ord: 1e3 + i, go: () => startRead(builtinStory(s)) })),
      ...shr.map((t, i) => ({ label: t.title || "\uFF08\u7121\u984C\uFF09", key: "t-" + t.id, level: lvOf("t-" + t.id, t.level), sub: `\u307F\u3093\u306A\u306E\u9577\u6587\u30FB${t.sents.length}\u6587\u30FB${(t.questions || []).length}\u554F${t.mode === "test" ? "\u30FB\u30C6\u30B9\u30C8" : ""}`, ord: 500 + i, go: () => startRead({ ...myToStory(t), level: lvOf("t-" + t.id, t.level) }) })),
      ...mine.map((t, i) => ({ label: t.title || "\uFF08\u7121\u984C\uFF09", level: t.level || null, sub: `My Text\u30FB${t.sents.length}\u6587\u30FB${(t.questions || []).length}\u554F${t.mode === "test" ? "\u30FB\u30C6\u30B9\u30C8" : ""}`, ord: i, go: () => startRead(myToStory(t)) }))
    ] : [
      ...shortPickItems(),
      ...shr.map((t, i) => ({ label: t.title || "\uFF08\u7121\u984C\uFF09", key: "t-" + t.id, level: lvOf("t-" + t.id, t.level), sub: `\u307F\u3093\u306A\u306E\u9577\u6587\u30FB${t.sents.length}\u6587`, ord: 500 + i, go: () => startPractice(t) })),
      ...mine.map((t, i) => ({ label: t.title || "\uFF08\u7121\u984C\uFF09", level: t.level || null, sub: `My Text\u30FB${t.sents.length}\u6587`, ord: i, go: () => startPractice(t) }))
    ];
    const [, lo, hi] = LVGROUP[settings.lvFilter] || LVGROUP.all;
    const shown = items.filter((it) => settings.lvFilter === "rec" ? isRec(it.level) : settings.lvFilter === "all" || !it.level || it.level >= lo && it.level <= hi);
    const m = +settings.myLevel || 0, dist = (it) => it.level ? Math.abs(it.level - m) : 0.5;
    shown.sort((x, y) => settings.lvSort === "easy" ? (x.level || 0) - (y.level || 0) : settings.lvSort === "hard" ? (y.level || 0) - (x.level || 0) : settings.lvSort === "rec" && m ? dist(x) - dist(y) : x.ord - y.ord);
    openSheet(`<h2>${kind === "read" ? "Reading" : "Chunk Practice"}</h2>
    <div class="row"><label for="optMyLv">\u81EA\u5206\u306E\u30EC\u30D9\u30EB</label>${opt("optMyLv", String(settings.myLevel || 0), [["0", "\u672A\u8A2D\u5B9A"], ...LV.slice(1).map((_, i) => [String(i + 1), lvLabel(i + 1)])])}</div>
    <div class="row"><label for="optLvSys">\u30EC\u30D9\u30EB\u306E\u8868\u3057\u65B9</label>${opt("optLvSys", settings.lvSys, Object.entries(LVSYS))}</div>
    <div class="row"><label for="optLvF">\u7D5E\u308A\u8FBC\u307F</label>${opt("optLvF", settings.lvFilter, Object.entries(LVGROUP).map(([k, v]) => [k, v[0]]))}</div>
    <div class="row"><label for="optLvS">\u4E26\u3079\u65B9</label>${opt("optLvS", settings.lvSort, [["rec", "\u304A\u3059\u3059\u3081\u9806"], ["easy", "\u3084\u3055\u3057\u3044\u9806"], ["hard", "\u96E3\u3057\u3044\u9806"], ["new", "\u767B\u9332\u9806"]])}</div>
    <div class="row"><label for="optLvA">\u7D50\u679C\u3067\u304A\u3059\u3059\u3081\u3092\u81EA\u52D5\u8ABF\u6574</label>${opt("optLvA", settings.lvAuto === false ? "off" : "on", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]])}</div>
    ${kind === "practice" ? `<div class="row"><label for="optRole">\u5F79\u5272\u3082\u7B54\u3048\u308B</label>${opt("optRole", settings.roleAns === false ? "off" : "on", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]])}</div>
      <button class="ghost pickRand" style="text-align:left;flex:none"><b style="color:var(--ink)">\u30E9\u30F3\u30C0\u30E0</b><br><small>\u5185\u8535\u306E\u4F8B\u6587\u3068\u77ED\u6587\u304B\u3089\uFF08${esc2(randLabel())}\uFF09</small></button>` : ""}
    ${shown.length ? "" : `<p class="note">\u3053\u306E\u6761\u4EF6\u306E\u6587\u7AE0\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>`}
    ${shown.map((it, i) => `<div class="pickRow"><button class="ghost pickItem" data-i="${i}" style="text-align:left;flex:none"><b style="color:var(--ink)">${m && isRec(it.level) ? "\u2605 " : ""}${esc2(it.label)}</b><br><small>${esc2(lvLabel(it.level))}${it.key && LVO[it.key] != null ? "\uFF08\u4FEE\u6B63\u6E08\u307F\uFF09" : ""}\u30FB${esc2(it.sub)}</small></button>${it.key && IS_ADMIN && DB ? `<button class="lvFix" data-i="${i}">\u96E3\u6613\u5EA6\u3092\u76F4\u3059</button>` : ""}</div>`).join("")}
    <div class="btns"><button class="ghost" id="closeBtn">\u9589\u3058\u308B</button></div>`);
    const re = () => pickText(kind, true);
    $("optMyLv").onchange = (e) => {
      settings.myLevel = +e.target.value;
      settings.lvUp = settings.lvDown = 0;
      saveSettings();
      re();
    };
    $("optLvSys").onchange = (e) => {
      settings.lvSys = e.target.value;
      saveSettings();
      re();
    };
    $("optLvF").onchange = (e) => {
      settings.lvFilter = e.target.value;
      saveSettings();
      re();
    };
    $("optLvS").onchange = (e) => {
      settings.lvSort = e.target.value;
      saveSettings();
      re();
    };
    $("optLvA").onchange = (e) => {
      settings.lvAuto = e.target.value === "on";
      saveSettings();
    };
    if (kind === "practice") {
      $("optRole").onchange = (e) => {
        settings.roleAns = e.target.value === "on";
        saveSettings();
      };
      $("sheet").querySelector(".pickRand").onclick = () => {
        closeSheet();
        $("title").hidden = true;
        startPractice(null);
      };
    }
    $("sheet").querySelectorAll(".pickItem").forEach((b) => b.onclick = () => {
      closeSheet();
      $("title").hidden = true;
      shown[+b.dataset.i].go();
    });
    $("sheet").querySelectorAll(".lvFix").forEach((b) => b.onclick = () => editLevel(shown[+b.dataset.i], re));
    $("closeBtn").onclick = closeSheet;
  }
  function editLevel(it, back2) {
    const cur2 = it.level || 3, has = LVO[it.key] != null;
    openSheet(`<h2>\u96E3\u6613\u5EA6\u3092\u76F4\u3059</h2><p class="note"><b>${esc2(it.label)}</b><br>\u76F4\u3059\u3068\u3001\u3053\u306E\u6587\u7AE0\u3092\u958B\u304F\u5168\u54E1\u306E\u96E3\u6613\u5EA6\u304C\u5909\u308F\u308A\u307E\u3059\u3002</p>
    <div class="row"><label for="optFixLv">\u96E3\u6613\u5EA6</label>${opt("optFixLv", String(cur2), LV.slice(1).map((_, i) => [String(i + 1), lvLabel(i + 1)]))}</div>
    <div class="btns"><button class="ghost" id="fixCancel">\u3084\u3081\u308B</button>${has ? `<button class="ghost" id="fixReset">\u5143\u306B\u623B\u3059</button>` : ""}<button class="primary" id="fixOk">\u76F4\u3059</button></div>`);
    $("fixCancel").onclick = back2;
    $("fixOk").onclick = async () => {
      const n = +$("optFixLv").value;
      try {
        await DB.doc("levels/" + it.key).set({ level: n });
        LVO[it.key] = n;
        toast("\u96E3\u6613\u5EA6\u3092\u76F4\u3057\u307E\u3057\u305F\uFF08\u307F\u3093\u306A\u306B\u53CD\u6620\uFF09");
      } catch (e) {
        await tell("\u76F4\u305B\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u7DE8\u96C6\u306E\u6A29\u9650\u304C\u306A\u3044\u304B\u3001\u901A\u4FE1\u306E\u554F\u984C\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002");
      }
      back2();
    };
    if (has) $("fixReset").onclick = async () => {
      try {
        await DB.doc("levels/" + it.key).delete();
        delete LVO[it.key];
        toast("\u5143\u306B\u623B\u3057\u307E\u3057\u305F");
      } catch (e) {
        await tell("\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      }
      back2();
    };
  }

  // games/chunkchunk/src/title.js
  var FACE = "arcade";
  function updateLvHint() {
    const el = $("lvHint");
    if (el) el.textContent = `\u51FA\u308B\u6587\uFF1A${randLabel()}\uFF08\u8A2D\u5B9A\u3067\u5909\u3048\u3089\u308C\u307E\u3059\uFF09`;
  }
  function showTitle() {
    nextRun();
    if (S) {
      clearTimeout(S.timer);
      S.phase = "ready";
      S.paused = false;
      S.roleMode = false;
    }
    stopVoice();
    ["count", "modal", "startBox", "edView", "rolePick"].forEach((id) => $(id).hidden = true);
    clearPop();
    $("title").dataset.face = FACE;
    updateLvHint();
    $("title").hidden = false;
  }
  function lessonSub(on) {
    const f = document.querySelector(".faceLesson");
    if (!f) return;
    f.querySelector(".sMenu:not(.lessonSub)").hidden = on;
    f.querySelector(".lessonSub").hidden = !on;
  }
  function initTitle(face) {
    FACE = face || "arcade";
    document.querySelectorAll("[data-chara]").forEach((i) => i.src = ENV.ctx.base + "img/chara/" + i.dataset.chara + "/" + (i.dataset.chara === "boy" ? "idea" : "joy") + ".webp");
    if (FACE === "all") {
      FACE = "arcade";
      const t = $("title"), bar = document.createElement("div");
      bar.className = "ccTabs";
      bar.innerHTML = [["arcade", "\u30B2\u30FC\u30E0\u30BB\u30F3\u30BF\u30FC"], ["lesson", "\u5B66\u6821"], ["library", "\u56F3\u66F8\u9928"]].map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join("");
      t.appendChild(bar);
      const draw = () => bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === FACE));
      bar.onclick = (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        FACE = b.dataset.tab;
        t.dataset.face = FACE;
        draw();
      };
      draw();
      ENV.tabsDraw = draw;
    }
    document.querySelectorAll("[data-play]").forEach((b) => b.onclick = () => {
      primeSpeech();
      unlockAudio();
      $("title").hidden = true;
      const [adv, mode] = b.dataset.play.split("-");
      sfx("se/btn_" + (adv === "auto" ? "sarasara" : "yoidon"));
      settings.advance = adv;
      settings.mode = mode;
      saveSettings();
      loadStage(mode, stageN[mode], null, true);
    });
    document.querySelectorAll("[data-open-set]").forEach((b) => b.onclick = () => {
      openSheet(`<h2>\u8A2D\u5B9A</h2>${settingRows()}${legendHTML()}<div class="btns"><button class="primary" id="closeBtn">\u9589\u3058\u308B</button></div>`);
      bindSettingRows();
      $("closeBtn").onclick = closeSheet;
    });
    initHowto($("title"), settings, saveSettings);
    document.querySelectorAll("[data-study]").forEach((b) => b.onclick = () => {
      primeSpeech();
      unlockAudio();
      const v = b.dataset.study;
      if (v === "lesson") {
        sfx("se/btn_lesson");
        lessonSub(true);
        return;
      }
      if (v === "make") {
        sfx("se/btn_lesson");
        ENV.make.open();
        return;
      }
      if (v === "story") {
        sfx("se/btn_lesson");
        ENV.story.open();
        return;
      }
      if (v === "texts") {
        $("title").hidden = true;
        openMyTexts();
        return;
      }
      if (v === "random") {
        $("title").hidden = true;
        startPractice(null);
        return;
      }
      pickText(v);
    });
    document.querySelectorAll("[data-lesson-back]").forEach((b) => b.onclick = () => lessonSub(false));
    document.querySelectorAll("[data-timed]").forEach((b) => b.onclick = () => startTimed(+b.dataset.timed));
    document.querySelectorAll("[data-rank]").forEach((b) => b.onclick = () => showRanking(30));
  }

  // games/chunkchunk/src/reading.js
  var readN = 0;
  function builtinStory(s) {
    const sens = s.list.map(([en, ja]) => parseSentence2(en, ja));
    return { title: s.title, list: s.list, level: LVO[s.id] ?? s.level, questions: (QUESTIONS[s.title] || []).map(([si, ui, q]) => {
      const u = sens[si].units[ui];
      return { type: "range", si, a: u.s, b: u.e, alts: [], partials: [], q };
    }) };
  }
  function startRead(story) {
    if (!story) {
      const pool = STORIES.filter((s) => QUESTIONS[s.title]);
      story = builtinStory(pool[readN++ % pool.length]);
    }
    $("title").hidden = true;
    $("edView").hidden = true;
    ENV.core.reader.open(story, {
      backLabel: "\u2190 \u3082\u3069\u308B",
      onClose: () => story.my ? openMyTexts() : showTitle(),
      onGrade: (r) => r.n ? adaptLevel(r.res.reduce((a, x) => a + { o: 1, t: 0.5, x: 0 }[x], 0) / r.n, story.level) : "",
      // 結果でおすすめのレベルを調整
      onSubmit: (sm) => {
        const list = loadSubs();
        list.push({ textId: story.id, title: story.title, at: Date.now(), ...sm });
        saveSubs(list);
      },
      // テスト：この端末に保存（先生が My Texts の「提出結果」で見る）
      next: story.my ? { label: "My Texts \u3078", fn: () => openMyTexts() } : { label: "\u6B21\u306E\u304A\u8A71", fn: () => startRead() }
    });
  }

  // games/chunkchunk/src/texts.js
  var DB = null;
  var DLC = null;
  var IS_ADMIN = false;
  var CAN_WRITE = null;
  var MYID = null;
  var SHARED = null;
  async function loadShared() {
    if (!DB) return SHARED;
    try {
      const snap = await DB.collection("texts").get();
      SHARED = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (e) {
      SHARED = SHARED || [];
    }
    return SHARED;
  }
  async function initShared() {
    try {
      if (!window.claude || !claude.use) return;
      try {
        DLC = await claude.use("downloads");
      } catch (e) {
        DLC = null;
      }
      DB = await claude.use("db");
      if (!DB) return;
      const u = await claude.use("user");
      if (u) {
        try {
          IS_ADMIN = !!await u.canEdit();
        } catch (e) {
        }
        try {
          CAN_WRITE = await u.can("data.write");
        } catch (e) {
        }
        try {
          MYID = await u.id();
        } catch (e) {
        }
      }
      try {
        const snap = await DB.collection("levels").get();
        snap.docs.forEach((d) => {
          const v = d.data();
          if (v && v.level >= 1 && v.level <= 10) LVO[d.id] = v.level;
        });
      } catch (e) {
      }
      loadShared();
      loadShorts();
    } catch (e) {
      DB = null;
    }
  }
  var MYKEY = "ccs-mytexts";
  var ROLES = "SVOICPTMRF".split("");
  function loadMy() {
    try {
      return JSON.parse(LS.getItem(MYKEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveMy(list) {
    try {
      LS.setItem(MYKEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }
  var TRASHKEY = "ccs-trash";
  var TRASH_DAYS = 30;
  function loadTrash() {
    try {
      const now = Date.now();
      return JSON.parse(LS.getItem(TRASHKEY) || "[]").filter((t) => now - t.deletedAt < TRASH_DAYS * 864e5);
    } catch (e) {
      return [];
    }
  }
  function saveTrash(l) {
    try {
      LS.setItem(TRASHKEY, JSON.stringify(l));
      return true;
    } catch (e) {
      return false;
    }
  }
  var SUBKEY = "ccs-submits";
  function loadSubs() {
    try {
      return JSON.parse(LS.getItem(SUBKEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveSubs(l) {
    try {
      LS.setItem(SUBKEY, JSON.stringify(l));
      return true;
    } catch (e) {
      return false;
    }
  }
  function unitEnds(s) {
    const n = s.words.length;
    return [.../* @__PURE__ */ new Set([...s.ends || [], n - 1])].filter((x) => x >= 0 && x < n).sort((a, b) => a - b);
  }
  function unitStarts(s) {
    return [0, ...unitEnds(s).slice(0, -1).map((e) => e + 1)];
  }
  function myToStory(t) {
    const clean = (x) => x.replace(/[|=#{}]/g, "");
    const list = t.sents.map((s) => {
      let st = 0;
      const soft = new Set(s.soft || []), xs = new Set(s.xs || []);
      const parts = unitEnds(s).map((e) => {
        const role = (s.roleAt || {})[st] || "M";
        const seg = [];
        let cur2 = [];
        for (let k = st; k <= e; k++) {
          const c = clean(s.words[k]);
          if (c && c !== "/") cur2.push(xs.has(k) && !cur2.length && seg.length ? "X:" + c : c);
          if (k < e && soft.has(k) && cur2.length) {
            seg.push(cur2.join(" "));
            cur2 = [];
          }
        }
        if (cur2.length) seg.push(cur2.join(" "));
        const w = seg.join(" / ") || "\u2026";
        let jp = ((s.ujp || {})[st] || "").replace(/[|#{}]/g, "");
        const sj = (s.sjp || {})[st];
        if (seg.length > 1 && Array.isArray(sj) && sj.length === seg.length) jp += `{${sj.map((x) => String(x).replace(/[|#{}\/]/g, "")).join("/")}}`;
        st = e + 1;
        return `${role}:${w}=${jp}`;
      });
      return [parts.join(" | "), s.ja || ""];
    });
    const questions = (t.questions || []).map((q0) => {
      const q = normQ(q0, t.sents);
      if (q.type === "choice") {
        const opts = [];
        let corr = -1;
        (q.options || []).forEach((o, i) => {
          if (o && o.trim()) {
            if (i === q.correct) corr = opts.length;
            opts.push(o);
          }
        });
        return opts.length ? { type: "choice", q: q.q || "", options: opts, correct: corr, ...+q0.pts > 0 ? { pts: +q0.pts } : {} } : null;
      }
      return t.sents[q.si] ? cleanQ({ type: "range", q: q.q || "", si: q.si, a: q.a, b: q.b, alts: q.alts || [], partials: q.partials || [], ...+q0.pts > 0 ? { pts: +q0.pts } : {} }) : null;
    }).filter(Boolean);
    return { title: t.title || "\u7121\u984C", list, questions, my: true, id: t.id, mode: t.mode || "learn", level: t.level || null, hint: t.hint || "none", hintCost: t.hintCost == null ? 20 : +t.hintCost };
  }
  var WS = (str) => new Set(str.split(" "));
  var AW = {
    det: WS("a an the my your his her its our their this that these those some any every each many much few several no two three four five"),
    subj: WS("i you he she it we they there"),
    obj: WS("me you him her it us them"),
    aux: WS("am is are was were be been being do does did don't doesn't didn't have has had will would can could shall should may might must won't can't isn't aren't wasn't weren't haven't hasn't not never"),
    prep: WS("in on at to for with from by about of into near under over after before during without through across behind between around like than along"),
    sub: WS("when because if while although though since until unless"),
    freq: WS("always usually often sometimes never also just really already still even"),
    part: WS("up out off away back down"),
    timeN: WS("yesterday today tomorrow tonight now morning mornings afternoon evening night nights week weekend month year years summer winter spring autumn fall monday tuesday wednesday thursday friday saturday sunday sundays ago o'clock time day days hour hours minute minutes lunch breakfast dinner school first end"),
    verb: WS("go goes went come comes came see sees saw make makes made take takes took get gets got give gives gave know knows knew think thinks thought want wants wanted like likes liked love loves play plays played read reads eat eats ate drink drinks drank run runs ran walk walks swim swims swam study studies live lives lived work works help helps tell tells told say says said find finds found buy buys bought bring brings brought leave leaves left meet meets met speak speaks spoke write writes wrote sing sings sang sit sits sat stand stands stood teach teaches taught feel feels felt keep keeps kept begin begins began become becomes became grow grows grew wait waits watch watches listen listens look looks use uses call calls try tries need needs start starts show shows open opens close closes visit visits stay stays talk talks learn learns cook cooks clean cleans carry carries catch catches build builds send sends sleep sleeps win wins won lose loses lost hear hears heard belong belongs seem seems taste tastes tasted sound sounds smell smells borrow borrows join joins thank thanks pick picks forget forgets forgot enjoy enjoys decide decides")
  };
  var lw_ = (w) => w.toLowerCase().replace(/[^a-z']/g, "");
  function chunkSentence(words) {
    const lw = words.map(lw_), n = words.length, units = [];
    let i = 0;
    const isVerb = (k) => k < n && (AW.aux.has(lw[k]) || AW.verb.has(lw[k]) || /ed$/.test(lw[k]) && lw[k].length > 3);
    const isTimeStart = (k) => k < n && (AW.timeN.has(lw[k]) && !["school", "lunch", "dinner", "breakfast", "time", "first", "end"].includes(lw[k]) || ["every", "last", "next", "this", "that"].includes(lw[k]) && AW.timeN.has(lw[k + 1] || "") || lw[k] === "ago");
    const comma = (j) => {
      for (let k = j; k < n; k++) if (/,$/.test(words[k])) return k;
      return -1;
    };
    const push = (role, end) => {
      if (end < i) return;
      units.push({ role, s: i, e: end });
      i = end + 1;
    };
    const c0 = comma(0);
    if (c0 >= 0 && c0 < n - 1 && (AW.sub.has(lw[0]) || AW.prep.has(lw[0]) || isTimeStart(0))) {
      const r = ["because", "since"].includes(lw[0]) ? "R" : ["if", "unless"].includes(lw[0]) ? "F" : lw.slice(0, c0 + 1).some((x) => AW.timeN.has(x)) || AW.sub.has(lw[0]) ? "T" : "P";
      push(r, c0);
    }
    if (lw[i] === "there" && AW.aux.has(lw[i + 1] || "")) {
      push("V", i + 1);
    } else {
      let v = -1;
      for (let k = i + 1; k < n; k++) if (isVerb(k)) {
        v = k;
        break;
      }
      while (v > i + 1 && AW.freq.has(lw[v - 1])) v--;
      if (v > i) push("S", v - 1);
    }
    if (i < n && (isVerb(i) || units.length && units[units.length - 1].role === "S")) {
      let e = i;
      while (e + 1 < n && AW.freq.has(lw[e]) && !isVerb(e)) e++;
      while (e + 1 < n) {
        const x = lw[e + 1];
        if (AW.aux.has(x) || AW.freq.has(x)) {
          e++;
          continue;
        }
        if (isVerb(e + 1) && (AW.aux.has(lw[e]) || AW.freq.has(lw[e]) || lw[e] === "to")) {
          e++;
          continue;
        }
        if (x === "to" && isVerb(e + 2)) {
          e++;
          continue;
        }
        if (AW.part.has(x) && !/[,.]$/.test(words[e])) {
          e++;
          continue;
        }
        if (/ing$/.test(x) && AW.aux.has(lw[e])) {
          e++;
          continue;
        }
        if (["good", "interested", "afraid", "proud", "fond"].includes(x) && AW.aux.has(lw[e]) && ["at", "in", "of"].includes(lw[e + 2] || "")) {
          e += 2;
          continue;
        }
        break;
      }
      push("V", e);
    }
    const vUnit = units.find((u) => u.role === "V"), beOnly = vUnit && words.slice(vUnit.s, vUnit.e + 1).every((w) => AW.aux.has(lw_(w)) || lw_(w) === "there");
    let objDone = false;
    while (i < n) {
      const st = i;
      let e = i;
      const stopAt = (k) => AW.prep.has(lw[k]) && lw[k] !== "of" || AW.sub.has(lw[k]) || isTimeStart(k);
      if (AW.sub.has(lw[i])) {
        e = comma(i);
        if (e < 0) e = n - 1;
        push(["because", "since"].includes(lw[i]) ? "R" : ["if", "unless"].includes(lw[i]) ? "F" : "T", e);
        continue;
      }
      if (isTimeStart(i)) {
        while (e + 1 < n && !/[,.!?]$/.test(words[e]) && (AW.timeN.has(lw[e + 1]) || AW.det.has(lw[e + 1]) || lw[e + 1] === "ago")) e++;
        push("T", e);
        continue;
      }
      if (AW.prep.has(lw[i])) {
        while (e + 1 < n && !/[,.!?]$/.test(words[e]) && !stopAt(e + 1)) e++;
        const ws = lw.slice(st, e + 1), r = ws.some((x) => AW.timeN.has(x)) && !ws.includes("school") ? "T" : ["with", "by", "for", "about", "like", "without", "than"].includes(lw[st]) ? "M" : "P";
        push(r, e);
        continue;
      }
      while (e + 1 < n && !/[,.!?]$/.test(words[e]) && !stopAt(e + 1)) {
        if (!objDone && AW.obj.has(lw[e]) && e === st && !AW.prep.has(lw[e + 1])) break;
        e++;
      }
      const role = beOnly && !objDone ? "C" : !objDone && AW.obj.has(lw[st]) && e === st && e + 1 < n && !stopAt(e + 1) ? "I" : "O";
      push(role, e);
      if (role !== "I") objDone = true;
    }
    const roleAt = {};
    units.forEach((u) => roleAt[u.s] = u.role);
    return { words, ends: units.map((u) => u.e), roleAt, ujp: {}, ja: "" };
  }
  function splitSentences(text) {
    return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?]["']?)\s+(?=["']?[A-Z])/).filter(Boolean);
  }
  function autoChunk(text) {
    return splitSentences(text).map((t) => chunkSentence(t.split(" ").filter(Boolean)));
  }
  function buildAIPrompt(text) {
    const R = +settings.qRange || 0, C = +settings.qChoice || 0, lang = settings.qLang === "en" ? "\u82F1\u8A9E" : "\u65E5\u672C\u8A9E";
    const qPart = R + C > 0 ? `
\u307E\u305F\u3001\u9577\u6587\u306E\u5185\u5BB9\u306B\u3064\u3044\u3066\u554F\u984C\u3092\u4F5C\u308A\u3001"questions" \u306B\u5165\u308C\u3066\u304F\u3060\u3055\u3044\u3002
\u30FB\u7BC4\u56F2\u3067\u7B54\u3048\u308B\u554F\u984C\uFF1A${R}\u554F\uFF08\u672C\u6587\u306E\u4E2D\u304B\u3089\u7B54\u3048\u306E\u90E8\u5206\u3092\u9078\u3070\u305B\u308B\u554F\u984C\uFF09
\u30FB5\u629E\u554F\u984C\uFF1A${C}\u554F\uFF08\u9078\u629E\u80A2\u306F5\u3064\u3001\u6B63\u89E3\u306F1\u3064\uFF09
\u30FB\u554F\u984C\u6587\u3068\u9078\u629E\u80A2\u306F${lang}\u3067\u66F8\u304F\u3002
\u30FBaccept\uFF08\u25EF\u306B\u3059\u308B\u5225\u306E\u7B54\u3048\uFF09\u3068 partial\uFF08\u25B3\u306B\u3059\u308B\u7B54\u3048\uFF09\u306F\u3001\u672C\u5F53\u306B\u3042\u308B\u6642\u3060\u3051\u5165\u308C\u308B\u3002\u7121\u3051\u308C\u3070\u7A7A\u306E\u914D\u5217 [] \u306B\u3059\u308B\u3002answer \u3068\u540C\u3058\u3082\u306E\u306F\u5165\u308C\u306A\u3044\u3002
\u30FB\u4E0B\u306E\u300C\u554F\u984C\uFF1A\u300D\u306B\u554F\u984C\u304C\u8CBC\u308A\u4ED8\u3051\u3066\u3042\u308C\u3070\u3001\u65B0\u3057\u304F\u4F5C\u3089\u305A\u306B\u305D\u308C\u3092\u4F7F\u3046\uFF08\u554F\u984C\u6587\u306F\u305D\u306E\u307E\u307E\u3002\u7B54\u3048\u306E\u5834\u6240\u30FB\u9078\u629E\u80A2\u30FB\u6B63\u89E3\u3092\u8AAD\u307F\u53D6\u3063\u3066\u3001\u4E0B\u306E\u5F62\u306B\u5408\u308F\u305B\u308B\uFF09\u3002
\u7BC4\u56F2\u306E\u554F\u984C\u306E\u5F62\uFF1A{"type":"range","q":"\u554F\u984C\u6587","sentence":\u7B54\u3048\u304C\u3042\u308B\u6587\u306E\u756A\u53F7\uFF081\u304B\u3089\uFF09,"answer":"\u7B54\u3048\u306E\u90E8\u5206\uFF08\u672C\u6587\u306E\u82F1\u8A9E\u305D\u306E\u307E\u307E\uFF09","accept":["\u25EF\u306B\u3057\u3066\u3088\u3044\u5225\u306E\u7B54\u3048\uFF08\u672C\u6587\u306E\u82F1\u8A9E\u305D\u306E\u307E\u307E\uFF09"],"partial":["\u25B3\u306B\u3059\u308B\u7B54\u3048\uFF08\u672C\u6587\u306E\u82F1\u8A9E\u305D\u306E\u307E\u307E\uFF09"]}
5\u629E\u306E\u554F\u984C\u306E\u5F62\uFF1A{"type":"choice","q":"\u554F\u984C\u6587","options":["\u9078\u629E\u80A21","\u9078\u629E\u80A22","\u9078\u629E\u80A23","\u9078\u629E\u80A24","\u9078\u629E\u80A25"],"correct":\u6B63\u89E3\u306E\u756A\u53F7\uFF080\u304B\u3089\uFF09}` : "";
    return `\u82F1\u8A9E\u306E\u9577\u6587\u3092\u3001\u65E5\u672C\u4EBA\u5B66\u7FD2\u8005\u5411\u3051\u306E\u300C\u30C1\u30E3\u30F3\u30AF\u8AAD\u307F\u300D\u30A2\u30D7\u30EA\u7528\u306B\u3001\u610F\u5473\u306E\u307E\u3068\u307E\u308A\uFF08\u30C1\u30E3\u30F3\u30AF\uFF09\u306B\u5206\u3051\u3066\u304F\u3060\u3055\u3044\u3002
\u8AAC\u660E\u3084\u30B3\u30FC\u30C9\u30D6\u30ED\u30C3\u30AF\uFF08\`\`\`\uFF09\u306F\u4ED8\u3051\u305A\u3001\u6B21\u306E\u5F62\u306EJSON\u3060\u3051\u3092\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002
{"title":"\u30BF\u30A4\u30C8\u30EB","level":\u96E3\u6613\u5EA6\u306E\u756A\u53F7,"sentences":[{"ja":"\u6587\u5168\u4F53\u306E\u81EA\u7136\u306A\u65E5\u672C\u8A9E\u8A33","units":[{"role":"S","text":"\u5143\u306E\u82F1\u8A9E\u305D\u306E\u307E\u307E\uFF08\u4E2D\u3092\u5C0F\u3055\u304F\u5206\u3051\u308B\u3068\u304D\u306F / \u3092\u5165\u308C\u308B\uFF09","ja":"\u3053\u306E\u5F79\u5272\u306E\u304B\u305F\u307E\u308A\u306E\u65E5\u672C\u8A9E","subja":["\u5C0F\u3055\u306A\u307E\u3068\u307E\u308A\u306E\u65E5\u672C\u8A9E","\u2026"]}]}]${R + C > 0 ? ',"questions":[ ... ]' : ""}}

\u30EB\u30FC\u30EB\uFF1A
\u30FBtitle\uFF1A\u82F1\u6587\u306B\u30BF\u30A4\u30C8\u30EB\u304C\u3042\u308C\u3070\u3001\u305D\u308C\u3092\u305D\u306E\u307E\u307E\u5165\u308C\u308B\uFF08\u30BF\u30A4\u30C8\u30EB\u306F\u672C\u6587\u306E\u6587\u3068\u3057\u3066\u306F\u5165\u308C\u306A\u3044\uFF09\u3002\u306A\u3051\u308C\u3070\u3001\u5185\u5BB9\u306B\u5408\u3046\u77ED\u3044\u30BF\u30A4\u30C8\u30EB\u3092\u4ED8\u3051\u308B\u3002
\u30FBlevel\uFF1A\u9577\u6587\u306E\u96E3\u6613\u5EA6\u30921\u301C10\u306E\u756A\u53F7\u3067\u30021\uFF1D\u5165\u9580\uFF08\u5C0F\u5B66\u6821\u4F4E\u301C\u4E2D\u5B66\u5E74\uFF09 2\uFF1D\u5C0F\u5B66\u6821\u9AD8\u5B66\u5E74 3\uFF1D\u4E2D1\u30FB\u82F1\u691C5\u7D1A 4\uFF1D\u4E2D2\u30FB\u82F1\u691C4\u7D1A 5\uFF1D\u4E2D3\u30FB\u82F1\u691C3\u7D1A\uFF08CEFR A1\uFF09 6\uFF1D\u9AD81\u301C2\u30FB\u82F1\u691C\u6E962\u7D1A\uFF08A2\uFF09 7\uFF1D\u9AD83\u30FB\u82F1\u691C2\u7D1A\uFF08B1\uFF09 8\uFF1D\u96E3\u95A2\u5927\u30FB\u82F1\u691C\u6E961\u7D1A\uFF08B2\uFF09 9\uFF1D\u5927\u5B66\u30FB\u82F1\u691C1\u7D1A\uFF08C1\uFF09 10\uFF1D\u305D\u308C\u4EE5\u4E0A\uFF08C2\uFF09
\u30FB\u9577\u6587\u30921\u6587\u305A\u3064\u306B\u5206\u3051\u308B\u3002\u5404\u6587\u306E units \u306B\u306F\u3001\u305D\u306E\u6587\u306E\u5358\u8A9E\u3092\u9806\u756A\u3069\u304A\u308A\u306B\u3001\u5143\u306E\u5358\u8A9E\u30FB\u8A18\u53F7\u306E\u307E\u307E\u3001\u3082\u308C\u306A\u304F\u5165\u308C\u308B\u3002
\u30FBrole\uFF08\u5F79\u5272\uFF09\u306F\u6B21\u306E\u3069\u308C\u304B1\u3064\u3002
  S\uFF1D\u4E3B\u8A9E\uFF08\u5F8C\u308D\u304B\u3089\u8AAC\u660E\u304C\u3064\u304F\u4E3B\u8A9E\u3082\u3001\u8AAC\u660E\u3054\u3068 S \u306B\u542B\u3081\u308B\uFF09
  V\uFF1D\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A\uFF08\u52A9\u52D5\u8A5E\u3001\u5426\u5B9A\u3001usually \u306A\u3069\u306E\u983B\u5EA6\u306E\u526F\u8A5E\u3001\u53E5\u52D5\u8A5E\u306E up\u30FBout \u306A\u3069\u3001to\u4E0D\u5B9A\u8A5E\u306E\u52D5\u8A5E\u3001take care of\u30FBlook forward to\u30FBbe good at \u306A\u3069\u306E\u719F\u8A9E\u3082\u542B\u3081\u308B\uFF09
  O\uFF1D\u76EE\u7684\u8A9E\u3000I\uFF1D\u300C\u8AB0\u306B\u300D\u306B\u3042\u305F\u308B\u76EE\u7684\u8A9E\u3000C\uFF1D\u88DC\u8A9E
  P\uFF1D\u5834\u6240\u3000T\uFF1D\u6642\uFF08when\u2026 \u3084 after\u2026 \u306A\u3069\u306E\u6642\u306E\u7BC0\u3082\u542B\u3080\uFF09
  M\uFF1D\u69D8\u5B50\u30FB\u624B\u6BB5\u30FB\u8AB0\u3068\u30FB\u76EE\u7684\u30FB\u305D\u306E\u4ED6\u3000R\uFF1D\u7406\u7531\uFF08because\u2026 \u306A\u3069\uFF09\u3000F\uFF1D\u6761\u4EF6\uFF08if\u2026 \u306A\u3069\uFF09
\u30FB\u5F79\u5272\u306E\u304B\u305F\u307E\u308A\u306E\u4E2D\u306F\u3001\u610F\u5473\u306E\u307E\u3068\u307E\u308A\uFF08\u30C1\u30E3\u30F3\u30AF\uFF09\u3054\u3068\u306B\u300C / \u300D\u3067\u5C0F\u3055\u304F\u5206\u3051\u308B\u3002\u30B2\u30FC\u30E0\u3067\u306F\u3001\u5F79\u5272\u306E\u304B\u305F\u307E\u308A\u5168\u4F53\u3067\u5207\u3063\u3066\u3082\u3001\u300C / \u300D\u3067\u5206\u3051\u305F\u5C0F\u3055\u306A\u307E\u3068\u307E\u308A\u3067\u5207\u3063\u3066\u3082\u6B63\u89E3\u306B\u306A\u308B\u3002
  \u30FB\u539F\u5247\uFF1A\u610F\u5473\u306E\u5206\u304B\u308C\u76EE\u304C\u3042\u308C\u3070\u3001\u88DC\u52A9\u306E\u533A\u5207\u308A\u300C / \u300D\u3092\u5165\u308C\u308B\u3002\u8FF7\u3063\u305F\u3089\u5165\u308C\u308B\u3002\u305F\u3060\u3057\u3001\u5358\u8A9E\u3054\u3068\u306B\u7D30\u304B\u304F\u5207\u308B\u3053\u3068\u306F\u3057\u306A\u3044\u3002\u4E0B\u306B\u6319\u3052\u308B\u306E\u306F\u4F8B\u3067\u3001\u3053\u308C\u306B\u9650\u3089\u306A\u3044\u3002
  \u30FB\u4E3B\u8A9E\u30FB\u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E\u306B\u3001\u5F8C\u308D\u304B\u3089\u8AAC\u660E\uFF08\u95A2\u4FC2\u8A5E\u30FB\u5F62\u5BB9\u8A5E\u53E5\u30FB\u524D\u7F6E\u8A5E\u53E5\u30FB\u5206\u8A5E\u306A\u3069\uFF09\u304C\u3064\u304F\u3068\u304D\u306F\u3001\u8AAC\u660E\u3082\u540C\u3058\u5F79\u5272\u306B\u5165\u308C\u305F\u307E\u307E\u300C\u4E2D\u5FC3 / \u8AAC\u660E\u300D\u3068\u5206\u3051\u308B\u3002\u4F8B\uFF1AThe man / who lives next door
  \u30FB\u52D5\u8A5E\u306F\u3001\u52A9\u52D5\u8A5E\uFF08can\u30FBwill\u30FBmust\u30FBshould \u306A\u3069\uFF09\u3092\u5148\u306B\u5206\u3051\u308B\u3002\u307E\u305F be going to\u30FBdecided to\u30FBwant to\u30FBused to\u30FBhave to \u306A\u3069\u306E\u300C\u719F\u8A9E\uFF0B\u52D5\u8A5E\u300D\u306F\u300C\u719F\u8A9E / \u52D5\u8A5E\u300D\u3068\u5206\u3051\u308B\u3002\u4F8B\uFF1Acan / have an influence on\u3000will / be able to / speak\u3000decided to / visit
  \u30FB\u5834\u6240\u30FB\u6642\u30FB\u69D8\u5B50\u30FB\u7406\u7531\u30FB\u6761\u4EF6\u304C\u9577\u3044\u3068\u304D\u306F\u3001\u610F\u5473\u306E\u5207\u308C\u76EE\u3067\u5206\u3051\u308B\u3002\u76F4\u524D\u306E\u540D\u8A5E\u3084\u8A9E\u53E5\u3092\u5F8C\u308D\u304B\u3089\u8AAC\u660E\u3059\u308B\u90E8\u5206\u306F\u3001\u305D\u306E\u5C0F\u3055\u306A\u307E\u3068\u307E\u308A\u306E\u5148\u982D\u306B\u300CX:\u300D\u3092\u4ED8\u3051\u308B\uFF08\u300C\u3064\u3051\u8DB3\u3057\u300D\u306E\u5370\uFF09\u3002\u4F8B\uFF1Ain the small town / X:by the sea\uFF08text \u306E\u4E2D\u3067\u3082\u300C / X:by the sea\u300D\u306E\u3088\u3046\u306B\u66F8\u304F\uFF09\u3002\u4E3B\u8A9E\u30FB\u76EE\u7684\u8A9E\u30FB\u88DC\u8A9E\u306E\u300C\u4E2D\u5FC3 / \u8AAC\u660E\u300D\u306B\u306F\u4ED8\u3051\u306A\u3044\u3002
  \u30FB\u5BFE\u306B\u306A\u308B\u8A00\u3044\u65B9\u3084\u3001\u610F\u5473\u304C\u5206\u304B\u308C\u308B\u8A00\u3044\u65B9\u3082\u5206\u3051\u308B\u3002\u4F8B\uFF1Anot only English / but also French\u3000both A / and B\u3000either A / or B\u3000so that / you can find it\u3000in order to / catch the train\u3000more difficult / than I thought\u3000It is important / for you / to get enough sleep\uFF08for \u301C / to \u301C \u306F M \u306E\u4E2D\u3067\u5206\u3051\u308B\uFF09
  \u30FB\u53D6\u308A\u6B8B\u3055\u306A\u3044\uFF1A\u51A0\u8A5E\uFF0B\u540D\u8A5E\u3001\u524D\u7F6E\u8A5E\uFF0B\u540D\u8A5E\u3001to\uFF0B\u52D5\u8A5E\u306E\u3088\u3046\u306B\u30011\u3064\u3067\u306F\u610F\u5473\u306B\u306A\u3089\u306A\u3044\u8A9E\u306F\u3001\u524D\u5F8C\u306E\u8A9E\u304B\u3089\u5207\u308A\u96E2\u3055\u306A\u3044\u3002not only\u30FBso that\u30FBin order to \u306E\u3088\u3046\u306B\u3001\u305D\u308C\u3060\u3051\u30671\u3064\u306E\u610F\u5473\u306B\u306A\u308B\u8A9E\u53E5\u306F\u30011\u3064\u306E\u307E\u3068\u307E\u308A\u306B\u3057\u3066\u3088\u3044\u3002
  \u30FB\u300C / \u300D\u3067\u5206\u3051\u305F\u304B\u305F\u307E\u308A\u3060\u3051\u3001units \u306B "subja" \u3092\u4ED8\u3051\u3001\u5206\u3051\u305F\u6570\u3068\u540C\u3058\u6570\u306E\u65E5\u672C\u8A9E\u3092\u9806\u756A\u3069\u304A\u308A\u306B\u5165\u308C\u308B\u3002\u5206\u3051\u306A\u3044\u304B\u305F\u307E\u308A\u306B\u306F "subja" \u3092\u4ED8\u3051\u306A\u3044\u3002
  \u3000\u4F8B\uFF1A{"role":"S","text":"The man / who lives next door","ja":"\u96A3\u306B\u4F4F\u3080\u7537\u306E\u4EBA\u306F","subja":["\u7537\u306E\u4EBA\u306F","\u96A3\u306B\u4F4F\u3080"]}
\u30FB\u30C1\u30E3\u30F3\u30AF\u306E ja \u306F\u3001\u3064\u306A\u3052\u3066\u8AAD\u3081\u308B\u5F62\u306B\u3059\u308B\uFF08\u4E3B\u8A9E\u306F\u300C\u301C\u306F\uFF0F\u301C\u304C\u300D\u3001\u76EE\u7684\u8A9E\u306F\u300C\u301C\u3092\u300D\u306A\u3069\uFF09\u3002${qPart}

\u9577\u6587\uFF1A
${text ? `"""${text}"""` : "\uFF08\u3053\u306E\u4E0B\u306B\u82F1\u6587\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\uFF09\n"}${R + C > 0 ? `
\u554F\u984C\uFF1A
\uFF08\u7528\u610F\u3057\u305F\u554F\u984C\u304C\u3042\u308C\u3070\u3001\u3053\u306E\u4E0B\u306B\u8CBC\u308A\u4ED8\u3051\u3002\u306A\u3051\u308C\u3070\u7A7A\u306E\u307E\u307E\uFF09
` : ""}`;
  }
  function aiResultToSents(out) {
    const arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
    return arr(out && out.sentences).map((x) => {
      const words = [], ends = [], roleAt = {}, ujp = {}, sjp = {}, soft = /* @__PURE__ */ new Set(), xs = /* @__PURE__ */ new Set();
      arr(x && x.units).forEach((u) => {
        if (!u) return;
        const st = words.length, r = String(u.role || "").trim().toUpperCase()[0];
        let n = 0;
        let xNext = false;
        String(u.text || "").trim().split(/\s+/).filter(Boolean).forEach((t) => {
          if (t === "/") {
            if (n > 0) soft.add(words.length - 1);
            xNext = false;
          } else if (/^X:$/i.test(t) && n > 0 && soft.has(words.length - 1)) xNext = true;
          else if (/^X:./i.test(t) && n > 0 && soft.has(words.length - 1)) {
            xs.add(words.length);
            words.push(t.slice(2));
            n++;
            xNext = false;
          } else {
            if (xNext) {
              xs.add(words.length);
              xNext = false;
            }
            words.push(t);
            n++;
          }
        });
        if (!n) return;
        soft.delete(words.length - 1);
        roleAt[st] = ROLES.includes(r) ? r : "M";
        ujp[st] = String(u.ja || "");
        ends.push(words.length - 1);
        const sj = arr(u.subja).map(String).filter(Boolean);
        if (sj.length > 1) sjp[st] = sj;
      });
      return { words, ends, roleAt, ujp, sjp, xs: [...xs], soft: [...soft].sort((a, b) => a - b), ja: String(x && x.ja || "") };
    }).filter((x) => x.words.length);
  }
  var lastPromptSrc = null;
  function syncPrompt(force) {
    const tx = $("edText"), pr = $("edPrompt");
    if (!tx || !pr) return;
    const t = tx.value.trim();
    if (!force && t === lastPromptSrc) return;
    lastPromptSrc = t;
    pr.value = buildAIPrompt(t);
  }
  var normW = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");
  function findSpan(sents, siHint, text) {
    const tw = String(text || "").trim().split(/\s+/).map(normW).filter(Boolean);
    if (!tw.length) return null;
    const order = [siHint, ...sents.map((_, i) => i).filter((i) => i !== siHint)].filter((i) => i >= 0 && i < sents.length);
    for (const si of order) {
      const ws = sents[si].words.map(normW);
      for (let a = 0; a + tw.length <= ws.length; a++) {
        let ok = true;
        for (let k = 0; k < tw.length; k++) if (ws[a + k] !== tw[k]) {
          ok = false;
          break;
        }
        if (ok) return { si, a, b: a + tw.length - 1 };
      }
    }
    return null;
  }
  function cleanQ(q) {
    if (q.type !== "range") return q;
    const key = (x) => `${x.si}:${x.a}:${x.b}`, valid = (x) => x && x.a >= 0 && x.b >= 0, seen = /* @__PURE__ */ new Set([key(q)]);
    const alts = (q.alts || []).filter((x) => valid(x) && !seen.has(key(x)) && seen.add(key(x)));
    const partials = (q.partials || []).filter((x) => valid(x) && !seen.has(key(x)) && seen.add(key(x)));
    return { ...q, alts, partials };
  }
  function aiResultToQuestions(out, sents) {
    const arr = (v) => Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
    return arr(out && out.questions).map((q) => {
      try {
        if (!q || typeof q !== "object") return null;
        const type = String(q.type || "").toLowerCase();
        if (type === "choice" || Array.isArray(q.options)) {
          const o = arr(q.options).map(String).slice(0, 5);
          while (o.length < 5) o.push("");
          let c = parseInt(q.correct, 10);
          if (isNaN(c)) c = Math.max(0, o.indexOf(String(q.correct)));
          return { type: "choice", q: String(q.q || q.question || ""), options: o, correct: Math.max(0, Math.min(4, c)) };
        }
        const hint2 = (parseInt(q.sentence, 10) || 1) - 1, m = findSpan(sents, hint2, q.answer);
        if (!m) return null;
        const alts = arr(q.accept).map((t) => findSpan(sents, m.si, t)).filter(Boolean);
        const partials = arr(q.partial).map((t) => findSpan(sents, m.si, t)).filter(Boolean);
        return cleanQ({ type: "range", q: String(q.q || q.question || ""), si: m.si, a: m.a, b: m.b, alts, partials });
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }
  function normQ(q, sents) {
    if (q.type !== "range" || q.a != null) return q;
    const s = sents[q.si];
    if (!s) return q;
    const st = unitStarts(s), en = unitEnds(s);
    const k = Math.max(0, en.findIndex((e, i) => q.w >= st[i] && q.w <= e));
    return { ...q, a: st[k], b: en[k], alts: q.alts || [], partials: q.partials || [] };
  }
  function parsePastedAI(t) {
    t = String(t).replace(/^﻿/, "");
    const a = t.indexOf("{");
    if (a < 0) throw new Error("\u300C{\u300D\u3067\u59CB\u307E\u308B\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    let depth = 0, inStr = false, esc22 = false, b = -1;
    for (let i = a; i < t.length; i++) {
      const c = t[i];
      if (inStr) {
        if (esc22) esc22 = false;
        else if (c === "\\") esc22 = true;
        else if (c === '"' || c === "\u201D" || c === "\u201C") inStr = false;
        continue;
      }
      if (c === '"' || c === "\u201C" || c === "\u201D") {
        inStr = true;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          b = i;
          break;
        }
      }
    }
    if (b < 0) throw new Error("\u30C7\u30FC\u30BF\u306E\u7D42\u308F\u308A\u300C}\u300D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08\u8FD4\u4E8B\u306E\u6700\u5F8C\u307E\u3067\u8CBC\u308A\u4ED8\u3051\u305F\u304B\u78BA\u8A8D\uFF09");
    const raw = t.slice(a, b + 1);
    const tries = [
      raw,
      raw.replace(/,\s*([}\]])/g, "$1"),
      // 最後の要素のあとのカンマ
      raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, "$1"),
      // 全角の引用符
      raw.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1").replace(/\/\/[^\n"]*$/gm, "")
    ];
    let last;
    for (const x of tries) {
      try {
        return JSON.parse(x);
      } catch (e) {
        last = e;
      }
    }
    throw new Error("\u30C7\u30FC\u30BF\u306E\u5F62\u304C\u5D29\u308C\u3066\u3044\u307E\u3059\uFF08" + (last && last.message || "") + "\uFF09");
  }
  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch (e) {
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }
  async function aiChunk(text) {
    const sample = window.claude ? await window.claude.use("sample") : null;
    if (!sample) {
      edStatus("\u3053\u306E\u753B\u9762\u3067\u306FAI\u304C\u4F7F\u3048\u307E\u305B\u3093\u3002\u300C\u304A\u624B\u8EFD\u81EA\u52D5\u300D\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    edStatus("AI\u3067\u5206\u3051\u3066\u3044\u307E\u3059\u2026\uFF0810\u301C60\u79D2\u307B\u3069\uFF09");
    $("edAI").disabled = true;
    const prompt = buildAIPrompt(text);
    try {
      const out = await sample.json(prompt, { modelTier: "default" });
      const sents = aiResultToSents(out), qs = aiResultToQuestions(out, sents);
      if (!sents.length) throw { message: "\u7D50\u679C\u304C\u7A7A\u3067\u3057\u305F" };
      edCollect();
      ED.sents = sents;
      if (qs.length) ED.questions = qs;
      if (out && out.title && !String(ED.title || "").trim()) ED.title = String(out.title).trim();
      if (!ED.level) {
        const l = parseInt(out && out.level, 10);
        ED.level = l >= 1 && l <= 10 ? l : estimateLevel(sents);
      }
      renderEditor();
      edStatus(`AI\u3067\u5206\u3051\u307E\u3057\u305F\uFF08\u5F79\u5272\u30FB\u8A33\u3064\u304D${qs.length ? `\u30FB\u554F\u984C${qs.length}\u554F` : ""}\uFF09\u3002\u6C17\u306B\u306A\u308B\u6240\u306F\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    } catch (e) {
      edStatus(e && e.code === "not_granted" ? "AI\u306E\u5229\u7528\u304C\u8A31\u53EF\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" : `AI\u3067\u5206\u3051\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${esc2(e && (e.code || e.message) || "\u30A8\u30E9\u30FC")}\uFF09\u3002\u300C\u304A\u624B\u8EFD\u81EA\u52D5\u300D\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002`);
    } finally {
      const b = $("edAI");
      if (b) b.disabled = false;
    }
  }
  var ED = null;
  var edStatus = (t) => {
    const el = $("edStatus");
    if (el) el.innerHTML = t;
  };
  function openMyTexts() {
    $("edView").hidden = false;
    ED = null;
    renderMyList();
  }
  function showSubs(t) {
    const subs = loadSubs().filter((x) => x.textId === t.id), MK = { o: "\u25EF", t: "\u25B3", x: "\xD7" };
    openSheet(`<h2>\u63D0\u51FA\u7D50\u679C\uFF1A${esc2(t.title || "\u7121\u984C")}</h2>
    ${subs.map((s, k) => {
      const sc = s.answers.filter((a) => a.mark === "o").length;
      return `<div class="rvw"><span class="lab">${new Date(s.at).toLocaleString()}\u3000\u25EF${sc}\uFF0F${s.answers.length}${s.score != null ? `\u3000${s.score}\uFF0F${s.max}\u70B9` : ""}</span>
        ${s.answers.map((a, i) => `<div class="en" style="font-size:13px">Q${i + 1} ${MK[a.mark]}${a.hint ? "\u{1F4A1}" : ""} ${esc2(a.mine || "\uFF08\u672A\u56DE\u7B54\uFF09")}${a.why ? ` <small class="why">${esc2(a.why)}</small>` : ""}</div>`).join("")}</div>`;
    }).reverse().join("")}
    <p class="note">\u3044\u307E\u306F\u3001\u3053\u306E\u7AEF\u672B\u3067\u63D0\u51FA\u3055\u308C\u305F\u7B54\u3048\u3060\u3051\u304C\u898B\u3048\u307E\u3059\uFF08\u5171\u6709\u306F\u30B5\u30A4\u30C8\u3078\u5F15\u3063\u8D8A\u3057\u3066\u304B\u3089\uFF09\u3002</p>
    <div class="btns"><button class="ghost" id="subsClear">\u63D0\u51FA\u7D50\u679C\u3092\u6D88\u3059</button><button class="primary" id="closeBtn">\u9589\u3058\u308B</button></div>`);
    $("closeBtn").onclick = closeSheet;
    $("subsClear").onclick = async () => {
      if (await ask("\u3053\u306E\u9577\u6587\u306E\u63D0\u51FA\u7D50\u679C\u3092\u5168\u90E8\u6D88\u3057\u307E\u3059\u304B\uFF1F", "\u6D88\u3059")) {
        saveSubs(loadSubs().filter((x) => x.textId !== t.id));
        closeSheet();
        renderMyList();
      }
    };
  }
  function showTrash() {
    const tr = loadTrash();
    openSheet(`<h2>\u30B4\u30DF\u7BB1</h2><p class="note">\u524A\u9664\u3057\u305F\u9577\u6587\u306F${TRASH_DAYS}\u65E5\u9593\u3053\u3053\u306B\u6B8B\u308A\u307E\u3059\u3002</p>
    ${tr.length ? "" : `<p class="note">\u30B4\u30DF\u7BB1\u306F\u7A7A\u3067\u3059\u3002</p>`}
    ${tr.map((t, i) => `<div class="rvw"><b>${esc2(t.title || "\uFF08\u7121\u984C\uFF09")}</b><span class="lab">${(t.sents || []).length}\u6587\u30FB${(t.questions || []).length}\u554F\u30FB\u524A\u9664\uFF1A${new Date(t.deletedAt).toLocaleDateString()}\uFF08\u3042\u3068${Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - t.deletedAt) / 864e5))}\u65E5\uFF09</span>
      <div class="btns"><button class="primary" data-restore="${i}">\u5143\u306B\u623B\u3059</button><button class="ghost" data-purge="${i}" style="color:var(--bad)">\u5B8C\u5168\u306B\u524A\u9664</button></div></div>`).join("")}
    <div class="btns"><button class="ghost" id="closeBtn">\u9589\u3058\u308B</button></div>`);
    $("closeBtn").onclick = () => {
      closeSheet();
      renderMyList();
    };
    $("sheet").querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => {
      const tr2 = loadTrash(), t = tr2.splice(+b.dataset.restore, 1)[0];
      delete t.deletedAt;
      const list = loadMy();
      list.unshift(t);
      saveMy(list);
      saveTrash(tr2);
      toast("\u5143\u306B\u623B\u3057\u307E\u3057\u305F");
      showTrash();
    });
    $("sheet").querySelectorAll("[data-purge]").forEach((b) => b.onclick = async () => {
      const tr2 = loadTrash(), t = tr2[+b.dataset.purge];
      if (!await ask(`\u300C${t.title || "\u7121\u984C"}\u300D\u3092\u5B8C\u5168\u306B\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`, "\u5B8C\u5168\u306B\u524A\u9664")) return;
      if (!await ask("\u5B8C\u5168\u306B\u524A\u9664\u3059\u308B\u3068\u3001\u3082\u3046\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002\u63D0\u51FA\u7D50\u679C\u3082\u4E00\u7DD2\u306B\u6D88\u3048\u307E\u3059\u3002\n\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F", "\u672C\u5F53\u306B\u524A\u9664\u3059\u308B")) return;
      tr2.splice(+b.dataset.purge, 1);
      saveTrash(tr2);
      saveSubs(loadSubs().filter((x) => x.textId !== t.id));
      toast("\u5B8C\u5168\u306B\u524A\u9664\u3057\u307E\u3057\u305F");
      showTrash();
    });
  }
  async function exportBackup() {
    if (DB) await loadShared();
    const data = JSON.stringify({ app: "chunkchunk", v: 1, at: (/* @__PURE__ */ new Date()).toISOString(), myTexts: loadMy(), shared: (SHARED || []).map(({ by, at, ...t }) => t), levels: LVO }, null, 1);
    const fn = `chunkchunk-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    if (DLC) {
      try {
        await DLC.save({ filename: fn, data: new Blob([data], { type: "application/json" }) });
        toast("\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F");
        return;
      } catch (e) {
        if (e && (e.code === "declined" || e.code === "rate_limited")) return;
      }
    }
    openSheet(`<h2>\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7</h2><p class="note">\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u4FDD\u5B58\u3067\u304D\u306A\u304B\u3063\u305F\u306E\u3067\u3001\u4E0B\u306E\u6587\u5B57\u3092\u5168\u90E8\u30B3\u30D4\u30FC\u3057\u3066\u3001\u30E1\u30E2\u306A\u3069\u306B\u8CBC\u3063\u3066\u4FDD\u7BA1\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
    <textarea id="bkText" readonly rows="8" style="width:100%;font-size:12px;background:var(--surface2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px"></textarea>
    <div class="btns"><button class="ghost" id="closeBtn">\u9589\u3058\u308B</button><button class="primary" id="bkSel">\u5168\u90E8\u9078\u629E</button></div>`);
    $("bkText").value = data;
    $("bkSel").onclick = () => {
      $("bkText").focus();
      $("bkText").select();
    };
    $("closeBtn").onclick = closeSheet;
  }
  async function importBackup(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      await tell("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u306E\u30D5\u30A1\u30A4\u30EB\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    if (!d || d.app !== "chunkchunk") {
      await tell("\u3053\u306E\u30A2\u30D7\u30EA\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3067\u306F\u306A\u3044\u3088\u3046\u3067\u3059\u3002");
      return;
    }
    const mine = loadMy(), ids = new Set(mine.map((t) => t.id));
    let n = 0;
    [...d.myTexts || [], ...d.shared || []].forEach((t) => {
      if (t && t.id && !ids.has(t.id) && Array.isArray(t.sents)) {
        ids.add(t.id);
        mine.push(t);
        n++;
      }
    });
    saveMy(mine);
    let lv = 0;
    if (DB && IS_ADMIN && d.levels) for (const [k, v] of Object.entries(d.levels)) {
      if (v >= 1 && v <= 10 && LVO[k] == null) {
        try {
          await DB.doc("levels/" + k).set({ level: v });
          LVO[k] = v;
          lv++;
        } catch (e) {
        }
      }
    }
    toast(`\u623B\u3057\u307E\u3057\u305F\uFF1A\u9577\u6587${n}\u672C${lv ? `\u30FB\u96E3\u6613\u5EA6\u306E\u4FEE\u6B63${lv}\u4EF6` : ""}`);
    renderMyList();
  }
  async function renderShared() {
    const box = $("edShared");
    if (!box) return;
    const list = await loadShared();
    if (!$("edShared")) return;
    if (!list.length) {
      box.innerHTML = `<p class="edStatus">\u307E\u3060\u5171\u6709\u3055\u308C\u305F\u9577\u6587\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u81EA\u5206\u306E\u9577\u6587\u306E\u300C\u5171\u6709\u306B\u9001\u308B\u300D\u3067\u8FFD\u52A0\u3067\u304D\u307E\u3059\u3002</p>`;
      return;
    }
    box.innerHTML = list.map((t, i) => {
      const lv = LVO["t-" + t.id] != null ? LVO["t-" + t.id] : t.level, mine = MYID && t.by === MYID;
      return `<div class="edItem"><b>${esc2(t.title || "\uFF08\u7121\u984C\uFF09")}${mine ? " \uFF08\u81EA\u5206\u304C\u9001\u4FE1\uFF09" : ""}</b><small>${esc2(lvLabel(lv))}\u30FB${(t.sents || []).length}\u6587\u30FB${(t.questions || []).length}\u554F\u30FB${t.mode === "test" ? "\u30C6\u30B9\u30C8\u7528" : "\u5B66\u7FD2\u7528"}</small>
      <div class="edRow"><button class="edBtn" data-s="read" data-i="${i}">${t.mode === "test" ? "\u30C6\u30B9\u30C8\u3092\u53D7\u3051\u308B" : "Reading"}</button><button class="edBtn" data-s="prac" data-i="${i}">Practice</button><button class="edBtn" data-s="copy" data-i="${i}">\u81EA\u5206\u7528\u306B\u30B3\u30D4\u30FC</button>${mine || IS_ADMIN ? `<button class="edBtn del" data-s="drop" data-i="${i}">\u53D6\u308A\u4E0B\u3052</button>` : ""}</div></div>`;
    }).join("");
    box.querySelectorAll("[data-s]").forEach((b) => b.onclick = async () => {
      const t = list[+b.dataset.i], a = b.dataset.s;
      if (a === "copy") {
        const mine = loadMy(), c = JSON.parse(JSON.stringify(t));
        delete c.by;
        delete c.at;
        c.id = "t" + Date.now();
        mine.unshift(c);
        saveMy(mine);
        toast("\u81EA\u5206\u7528\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF08\u7DE8\u96C6\u3067\u304D\u307E\u3059\uFF09");
        renderMyList();
        return;
      }
      if (a === "drop") {
        if (!await ask(`\u300C${t.title || "\u7121\u984C"}\u300D\u3092\u3001\u307F\u3093\u306A\u306E\u9577\u6587\u304B\u3089\u53D6\u308A\u4E0B\u3052\u307E\u3059\u304B\uFF1F
\u5171\u6709\u76F8\u624B\u306E\u753B\u9762\u304B\u3089\u6D88\u3048\u307E\u3059\u3002`, "\u53D6\u308A\u4E0B\u3052\u308B")) return;
        try {
          await DB.doc("texts/" + t.id).delete();
          SHARED = SHARED.filter((x) => x.id !== t.id);
          toast("\u53D6\u308A\u4E0B\u3052\u307E\u3057\u305F");
        } catch (e) {
          await tell("\u53D6\u308A\u4E0B\u3052\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        }
        renderShared();
        return;
      }
      $("edView").hidden = true;
      const st = { ...myToStory(t), level: LVO["t-" + t.id] != null ? LVO["t-" + t.id] : t.level };
      if (a === "read") startRead(st);
      else startPractice(t);
    });
  }
  async function shareText(t) {
    if (!DB) return;
    await loadShared();
    const exists = (SHARED || []).some((x) => x.id === t.id);
    const msg = exists ? `\u300C${t.title || "\u7121\u984C"}\u300D\u306F\u3059\u3067\u306B\u5171\u6709\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u4ECA\u306E\u5185\u5BB9\u3067\u4E0A\u66F8\u304D\u3057\u307E\u3059\u304B\uFF1F` : `\u300C${t.title || "\u7121\u984C"}\u300D\u3092\u300C\u307F\u3093\u306A\u306E\u9577\u6587\u300D\u306B\u9001\u308A\u307E\u3059\u304B\uFF1F
\u5171\u6709\u76F8\u624B\u306E\u5168\u54E1\u304C\u8AAD\u3081\u308B\u3088\u3046\u306B\u306A\u308A\u307E\u3059\u3002`;
    if (!await ask(msg, exists ? "\u4E0A\u66F8\u304D\u3059\u308B" : "\u9001\u308B")) return;
    const doc = { id: t.id, title: t.title || "", text: t.text || "", sents: t.sents || [], questions: t.questions || [], level: t.level || null, mode: t.mode || "learn", by: MYID || null, at: Date.now() };
    try {
      await DB.doc("texts/" + t.id).set(doc);
      SHARED = (SHARED || []).filter((x) => x.id !== t.id).concat([doc]);
      toast("\u307F\u3093\u306A\u306E\u9577\u6587\u306B\u9001\u308A\u307E\u3057\u305F");
      renderMyList();
    } catch (e) {
      await tell(e && e.code === "quota_exceeded" ? "\u5171\u6709\u306E\u4FDD\u5B58\u6570\u304C\u3044\u3063\u3071\u3044\u3067\u3059\u3002\u4E0D\u8981\u306A\u9577\u6587\u3092\u53D6\u308A\u4E0B\u3052\u3066\u304F\u3060\u3055\u3044\u3002" : "\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5171\u6709\u3078\u306E\u66F8\u304D\u8FBC\u307F\u6A29\u9650\u304C\u306A\u3044\u304B\u3001\u901A\u4FE1\u306E\u554F\u984C\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002");
    }
  }
  function renderMyList() {
    const list = loadMy();
    $("edHead").textContent = "My Texts";
    $("edBody").innerHTML = `<p class="edStatus">\u767B\u9332\u3057\u305F\u9577\u6587\u306F\u3001\u3053\u306E\u7AEF\u672B\u306E\u30D6\u30E9\u30A6\u30B6\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\uFF08\u5171\u6709\u306F\u4ECA\u5F8C\u5BFE\u5FDC\uFF09\u3002</p>
    <button class="edBtn pri" id="edNew">\uFF0B \u9577\u6587\u3092\u767B\u9332\u3059\u308B</button>
    <button class="edBtn" id="edShort">\uFF0B \u77ED\u6587\u3092\u307E\u3068\u3081\u3066\u5165\u308C\u308B\uFF08\u81EA\u5206\u306E\u77ED\u6587 ${loadMyShorts().length}\u6587${DB && SHORTS ? `\u30FB\u307F\u3093\u306A\u306E\u77ED\u6587 ${shortsShared().length}\u6587` : ""}\uFF09</button>
    ${list.length ? "" : `<p class="edStatus">\u307E\u3060\u767B\u9332\u304C\u3042\u308A\u307E\u305B\u3093\u3002</p>`}
    ${list.map((t, i) => {
      const subs = loadSubs().filter((x) => x.textId === t.id).length;
      return `<div class="edItem"><b>${esc2(t.title || "\uFF08\u7121\u984C\uFF09")}</b><small>${esc2(lvLabel(t.level))}\u30FB${(t.sents || []).length}\u6587\u30FB${(t.questions || []).length}\u554F\u30FB${t.mode === "test" ? "\u30C6\u30B9\u30C8\u7528" : "\u5B66\u7FD2\u7528"}${subs ? `\u30FB\u63D0\u51FA${subs}\u4EF6` : ""}</small>
      <div class="edRow"><button class="edBtn" data-a="read" data-i="${i}">${t.mode === "test" ? "\u30C6\u30B9\u30C8\u3092\u53D7\u3051\u308B" : "Reading"}</button><button class="edBtn" data-a="prac" data-i="${i}">Practice</button><button class="edBtn" data-a="edit" data-i="${i}">\u7DE8\u96C6</button>${DB && CAN_WRITE !== false && (t.sents || []).length ? `<button class="edBtn" data-a="share" data-i="${i}">\u5171\u6709\u306B\u9001\u308B</button>` : ""}${subs ? `<button class="edBtn" data-a="subs" data-i="${i}">\u63D0\u51FA\u7D50\u679C</button>` : ""}<button class="edBtn del" data-a="del" data-i="${i}">\u524A\u9664</button></div></div>`;
    }).join("")}`;
    const tr = loadTrash();
    if (DB) {
      $("edBody").insertAdjacentHTML("beforeend", `<h3 class="edSharedH">\u307F\u3093\u306A\u306E\u9577\u6587</h3><div id="edShared"><p class="edStatus">\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026</p></div>`);
      renderShared();
    }
    $("edBody").insertAdjacentHTML("beforeend", `<button class="edBtn" id="edTrash" style="margin-top:12px">\u{1F5D1} \u30B4\u30DF\u7BB1\uFF08${tr.length}\uFF09</button>
    <div class="edRow" style="margin-top:8px"><button class="edBtn" id="edBackup">\u{1F4BE} \u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u66F8\u304D\u51FA\u3059</button><button class="edBtn" id="edRestore">\u{1F4E5} \u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u304B\u3089\u623B\u3059</button><input type="file" id="edRestoreFile" accept=".json,application/json" hidden></div>`);
    $("edTrash").onclick = showTrash;
    $("edBackup").onclick = exportBackup;
    $("edRestore").onclick = () => $("edRestoreFile").click();
    $("edRestoreFile").onchange = async (e) => {
      const f = e.target.files[0];
      if (f) importBackup(await f.text());
      e.target.value = "";
    };
    $("edNew").onclick = () => {
      ED = { id: "t" + Date.now(), title: "", text: "", sents: [], questions: [] };
      renderEditor();
    };
    $("edShort").onclick = () => renderShortEditor();
    $("edBody").querySelectorAll("[data-a]").forEach((b) => b.onclick = async () => {
      const t = list[+b.dataset.i], a = b.dataset.a;
      if (a === "edit") {
        ED = JSON.parse(JSON.stringify(t));
        ED.questions = (ED.questions || []).map((q) => cleanQ(normQ(q, ED.sents || [])));
        renderEditor();
      } else if (a === "subs") showSubs(t);
      else if (a === "share") shareText(t);
      else if (a === "del") {
        if (!await ask(`\u300C${t.title || "\u7121\u984C"}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`, "\u524A\u9664\u3059\u308B")) return;
        if (!await ask(`\u672C\u6587\u30FB\u30C1\u30E3\u30F3\u30AF\u5206\u3051\u30FB\u554F\u984C\u306A\u3069\u3001\u3053\u306E\u9577\u6587\u306E\u5185\u5BB9\u304C\u3059\u3079\u3066\u4E00\u89A7\u304B\u3089\u6D88\u3048\u307E\u3059\u3002
\uFF08\u30B4\u30DF\u7BB1\u306B${TRASH_DAYS}\u65E5\u9593\u6B8B\u308B\u306E\u3067\u3001\u305D\u306E\u9593\u306F\u5143\u306B\u623B\u305B\u307E\u3059\uFF09
\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`, "\u672C\u5F53\u306B\u524A\u9664\u3059\u308B")) return;
        list.splice(+b.dataset.i, 1);
        saveMy(list);
        const tr2 = loadTrash();
        tr2.unshift({ ...t, deletedAt: Date.now() });
        saveTrash(tr2);
        renderMyList();
        toast("\u30B4\u30DF\u7BB1\u306B\u79FB\u3057\u307E\u3057\u305F");
      } else if (!t.sents || !t.sents.length) tell("\u307E\u3060\u30C1\u30E3\u30F3\u30AF\u5206\u3051\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u300C\u7DE8\u96C6\u300D\u304B\u3089\u5206\u3051\u3066\u304F\u3060\u3055\u3044\u3002");
      else {
        $("edView").hidden = true;
        if (a === "read") startRead(myToStory(t));
        else startPractice(t);
      }
    });
  }
  function edCollect() {
    if (!ED || !$("edTitle")) return;
    ED.title = $("edTitle").value;
    ED.text = $("edText").value;
    if ($("edMode")) ED.mode = $("edMode").value;
    if ($("edLevel")) ED.level = +$("edLevel").value || null;
    if ($("edHint")) {
      ED.hint = $("edHint").value;
      ED.hintCost = +$("edHintCost").value;
    }
    document.querySelectorAll(".qPts").forEach((x) => {
      const q = ED.questions[+x.dataset.q];
      if (q) q.pts = +x.value > 0 ? +x.value : 100;
    });
    document.querySelectorAll(".spanPick").forEach((x) => {
      const q = ED.questions[+x.dataset.q];
      if (!q) return;
      const v = { si: +x.querySelector(".spS").value, a: +x.querySelector(".spA").value, b: +x.querySelector(".spB").value };
      if (v.a >= 0 && v.b < 0) v.b = v.a;
      if (v.b >= 0 && v.a < 0) v.a = v.b;
      if (v.b < v.a) [v.a, v.b] = [v.b, v.a];
      if (x.dataset.kind === "main") Object.assign(q, v);
      else (q[x.dataset.kind] = q[x.dataset.kind] || [])[+x.dataset.k] = v;
    });
    document.querySelectorAll(".edJa").forEach((x) => {
      const s = ED.sents[+x.dataset.si];
      if (s) s.ja = x.value;
    });
    document.querySelectorAll(".qText").forEach((x) => {
      ED.questions[+x.dataset.q].q = x.value;
    });
    document.querySelectorAll(".qOpt").forEach((x) => {
      ED.questions[+x.dataset.q].options[+x.dataset.i] = x.value;
    });
    document.querySelectorAll(".qCorrect").forEach((x) => {
      if (x.checked) ED.questions[+x.dataset.q].correct = +x.dataset.i;
    });
  }
  function spanPicker(qi, kind, k, v) {
    const s = ED.sents[v.si] || ED.sents[0];
    if (!s) return "";
    const wopt = (sel) => `<option value="-1" ${sel < 0 ? "selected" : ""}>\uFF08\u9078\u3076\uFF09</option>` + s.words.map((w, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${i + 1}. ${esc2(w)}</option>`).join("");
    const chunkOpts = ED.sents.map((ss, si) => {
      const st = unitStarts(ss), en = unitEnds(ss);
      return st.map((a, j) => `<option value="${si}:${a}:${en[j]}">\u6587${si + 1}: ${esc2(ss.words.slice(a, en[j] + 1).join(" "))}</option>`).join("");
    }).join("");
    return `<div class="spanPick" data-q="${qi}" data-kind="${kind}" data-k="${k}">
    <select class="spS">${ED.sents.map((_, si) => `<option value="${si}" ${si === v.si ? "selected" : ""}>\u6587${si + 1}</option>`).join("")}</select>
    <select class="spA">${wopt(v.a)}</select><span>\u301C</span><select class="spB">${wopt(v.b)}</select>
    <select class="spChunk"><option value="">\u30C1\u30E3\u30F3\u30AF\u304B\u3089\u9078\u3076</option>${chunkOpts}</select>
    ${kind !== "main" ? `<button class="edBtn del spDel">\u2715</button>` : ""}
    <div class="spPrev">${v.a >= 0 && v.b >= 0 ? esc2(s.words.slice(Math.min(v.a, v.b), Math.max(v.a, v.b) + 1).join(" ")) : `<span style="color:#6b7686">\u307E\u3060\u9078\u3093\u3067\u3044\u307E\u305B\u3093\uFF08\u9078\u3070\u306A\u3044\u307E\u307E\u306A\u3089\u4FDD\u5B58\u6642\u306B\u6D88\u3048\u307E\u3059\uFF09</span>`}</div></div>`;
  }
  function renderEditor() {
    $("edHead").textContent = ED.title ? `\u7DE8\u96C6\uFF1A${ED.title}` : "\u65B0\u3057\u3044\u9577\u6587";
    const sentHTML = ED.sents.map((s, si) => {
      const en = new Set(unitEnds(s)), starts = new Set(unitStarts(s));
      return `<div class="edSent"><div class="edWords">${s.words.map((w, j) => (starts.has(j) ? `<button class="roleChip r${(s.roleAt || {})[j] || "M"}" data-si="${si}" data-u="${j}">${(s.roleAt || {})[j] || "M"}</button>` : "") + `<span class="edW">${esc2(w)}</span>` + (j < s.words.length - 1 ? `<button class="edGap ${en.has(j) ? "on" : ""}" data-si="${si}" data-g="${j}">\uFF5C</button>` : "")).join("")}</div>
      <input type="text" class="edJa" data-si="${si}" placeholder="\u8A33\uFF08\u4EFB\u610F\uFF09" value="${esc2(s.ja || "")}"></div>`;
    }).join("");
    const qHTML = ED.questions.map((q, qi) => q.type === "choice" ? `<div class="edQ"><small>5\u629E\u554F\u984C</small><input type="text" class="qText" data-q="${qi}" value="${esc2(q.q || "")}" placeholder="\u554F\u984C\u6587">
       ${[0, 1, 2, 3, 4].map((i) => `<div class="choiceRow"><input type="radio" name="qc${qi}" class="qCorrect" data-q="${qi}" data-i="${i}" ${q.correct === i ? "checked" : ""} aria-label="\u6B63\u89E3"><input type="text" class="qOpt" data-q="${qi}" data-i="${i}" value="${esc2((q.options || [])[i] || "")}" placeholder="\u9078\u629E\u80A2 ${String.fromCharCode(65 + i)}"></div>`).join("")}
       <small>\u5DE6\u306E\u4E38\u3067\u6B63\u89E3\u3092\u9078\u3076</small><label class="ptsRow">\u914D\u70B9 <input type="number" class="qPts" data-q="${qi}" min="0" max="1000" value="${q.pts || 100}" style="width:72px"> \u70B9</label> <button class="edBtn del" data-delq="${qi}">\u3053\u306E\u554F\u984C\u3092\u524A\u9664</button></div>` : `<div class="edQ"><small>\u7BC4\u56F2\u3067\u7B54\u3048\u308B\u554F\u984C</small><input type="text" class="qText" data-q="${qi}" value="${esc2(q.q || "")}" placeholder="\u554F\u984C\u6587\uFF08\u4F8B\uFF1A\u301C\u3057\u305F\u306E\u306F\u8AB0\uFF1F\uFF09">
       <small>\u60F3\u5B9A\u3057\u305F\u7B54\u3048\uFF08\u25EF\uFF09</small>${spanPicker(qi, "main", 0, q)}
       <small>\u25EF\u306B\u3059\u308B\u5225\u89E3\uFF1A${(q.alts || []).length ? "" : "\u306A\u3057"}</small>${(q.alts || []).map((v, k) => spanPicker(qi, "alts", k, v)).join("")}
       <small>\u25B3\u306B\u3059\u308B\u7B54\u3048\uFF1A${(q.partials || []).length ? "" : "\u306A\u3057\uFF08\u81EA\u52D5\u3067\u5224\u5B9A\uFF09"}</small>${(q.partials || []).map((v, k) => spanPicker(qi, "partials", k, v)).join("")}
       <div class="edRow"><button class="edBtn" data-addalt="${qi}">\uFF0B \u25EF\u5225\u89E3</button><button class="edBtn" data-addpart="${qi}">\uFF0B \u25B3\u306E\u7B54\u3048</button></div>
       <small>\u767B\u9332\u304C\u306A\u3044\u6642\u306F\u81EA\u52D5\u3067\u5224\u5B9A\uFF1A\u4E2D\u5FC3\u304C\u5408\u3063\u3066\u3044\u3066\u8AAC\u660E\u304C\u8DB3\u308A\u306A\u3044\u3060\u3051\uFF0F\u540C\u3058\u5F79\u5272\u306E\u5206\u3060\u3051\u9577\u3044 \u2192 \u25B3\u3001\u307B\u304B\u306E\u5F79\u5272\u307E\u3067\u5165\u308B \u2192 \xD7</small>
       <label class="ptsRow">\u914D\u70B9 <input type="number" class="qPts" data-q="${qi}" min="0" max="1000" value="${q.pts || 100}" style="width:72px"> \u70B9</label> <button class="edBtn del" data-delq="${qi}">\u3053\u306E\u554F\u984C\u3092\u524A\u9664</button></div>`).join("");
    $("edBody").innerHTML = `<h3>TITLE</h3><input type="text" id="edTitle" value="${esc2(ED.title || "")}" placeholder="\u30BF\u30A4\u30C8\u30EB">
    <h3>ENGLISH TEXT</h3><textarea id="edText" placeholder="\u82F1\u6587\u3092\u8CBC\u308A\u4ED8\u3051">${esc2(ED.text || "")}</textarea>
    <h3>SETTINGS</h3>
    <div class="edRow edSet"><label>\u96E3\u6613\u5EA6 <select id="edLevel"><option value="0" ${!ED.level ? "selected" : ""}>\u672A\u8A2D\u5B9A\uFF08\u5168\u30EC\u30D9\u30EB\u5BFE\u8C61\uFF09</option>${LV.slice(1).map((_, i) => `<option value="${i + 1}" ${ED.level === i + 1 ? "selected" : ""}>${esc2(lvLabel(i + 1))}</option>`).join("")}</select></label>
      <button class="edBtn" id="edEstLv">\u81EA\u52D5\u3067\u898B\u7A4D\u3082\u308B</button></div>
    <div class="edRow edSet"><label>\u4F7F\u3044\u65B9 <select id="edMode"><option value="learn" ${ED.mode !== "test" ? "selected" : ""}>\u5B66\u7FD2\u7528\uFF08\u3059\u3050\u7B54\u3048\u5408\u308F\u305B\uFF09</option><option value="test" ${ED.mode === "test" ? "selected" : ""}>\u30C6\u30B9\u30C8\u7528\uFF08\u7B54\u3048\u308B\u3060\u3051\uFF09</option></select></label></div>
    <div class="edRow edSet"><label>\u30C6\u30B9\u30C8\u7528\uFF1A\u30D2\u30F3\u30C8 <select id="edHint"><option value="none" ${(ED.hint || "none") === "none" ? "selected" : ""}>\u306A\u3057\uFF08\u6A19\u6E96\uFF09</option><option value="sentence" ${ED.hint === "sentence" ? "selected" : ""}>\u4F55\u6587\u76EE\u306B\u3042\u308B\u304B\u3060\u3051</option><option value="grammar" ${ED.hint === "grammar" ? "selected" : ""}>\u533A\u5207\u308A\u3068\u8272\u307E\u3067</option></select></label>
      <label>\u6E1B\u70B9 <select id="edHintCost">${[0, 5, 10, 20, 30, 50].map((n) => `<option ${n === (ED.hintCost == null ? 20 : +ED.hintCost) ? "selected" : ""}>${n}</option>`).join("")}</select>\u70B9\uFF0F\u554F</label></div>
    <small class="edStatus">\u30D2\u30F3\u30C8\u3068\u6E1B\u70B9\u306F\u3001\u30C6\u30B9\u30C8\u7528\u306E\u3068\u304D\u3060\u3051\u4F7F\u308F\u308C\u307E\u3059\u3002\u554F\u984C\u3054\u3068\u306E\u914D\u70B9\u306F\u3001\u5404\u554F\u984C\u306E\u4E0B\u3067\u6C7A\u3081\u307E\u3059\u3002</small>
    <div class="edRow edSet"><label>AI\u306B\u4F5C\u3089\u305B\u308B\u554F\u984C\uFF1A\u7BC4\u56F2 <select id="edRangeN">${[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option ${n === +settings.qRange ? "selected" : ""}>${n}</option>`).join("")}</select>\u554F</label>
      <label>5\u629E <select id="edChoiceN">${[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option ${n === +settings.qChoice ? "selected" : ""}>${n}</option>`).join("")}</select>\u554F</label>
      <label>\u8A00\u8A9E <select id="edQLang"><option value="ja" ${settings.qLang !== "en" ? "selected" : ""}>\u65E5\u672C\u8A9E</option><option value="en" ${settings.qLang === "en" ? "selected" : ""}>\u82F1\u8A9E</option></select></label></div>
    <div class="edRow"><button class="edBtn" id="edAuto">\u304A\u624B\u8EFD\u81EA\u52D5\u3067\u5206\u3051\u308B</button><button class="edBtn" id="edAI">AI\u3067\u5206\u3051\u308B\uFF08\u5F79\u5272\u30FB\u8A33\u3064\u304D\uFF09</button></div>
    <details class="edCopy" ${ED.copyOpen ? "open" : ""}><summary>\u81EA\u5206\u306EAI\u3067\u5206\u3051\u308B\uFF08\u30B3\u30D4\u30DA\u65B9\u5F0F\u30FB\u7121\u6599\uFF09</summary>
      <ol class="edSteps"><li>\u300C\u6307\u793A\u6587\u3092\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3059</li><li>Claude \u3084 ChatGPT \u306B\u8CBC\u308A\u4ED8\u3051\u3001\u7D9A\u3051\u3066\u82F1\u6587\u3082\u8CBC\u308A\u4ED8\u3051\u3066\u9001\u308B\uFF08\u4E0A\u306E\u6B04\u306B\u82F1\u6587\u3092\u5165\u308C\u3066\u304A\u3051\u3070\u3001\u6307\u793A\u6587\u306B\u6700\u521D\u304B\u3089\u5165\u308B\uFF09</li><li>\u8FD4\u3063\u3066\u304D\u305F\u8FD4\u4E8B\u3092\u5168\u90E8\u30B3\u30D4\u30FC\u3057\u3066\u3001\u4E0B\u306B\u8CBC\u308A\u4ED8\u3051\u3066\u300C\u8AAD\u307F\u8FBC\u3080\u300D</li></ol>
      <div class="edRow"><button class="edBtn" id="edCopyPrompt">\u2460 \u6307\u793A\u6587\u3092\u30B3\u30D4\u30FC</button><button class="edBtn" id="edSelPrompt">\u5168\u90E8\u9078\u629E</button></div>
      <small class="edSteps">\u30B3\u30D4\u30FC\u3067\u304D\u306A\u3044\u6642\u306F\u3001\u4E0B\u306E\u6307\u793A\u6587\u3092\u9577\u62BC\u3057 \u2192\u300C\u3059\u3079\u3066\u3092\u9078\u629E\u300D\u2192\u300C\u30B3\u30D4\u30FC\u300D\u3002</small>
      <textarea id="edPrompt" aria-label="AI\u7528\u306E\u6307\u793A\u6587">${esc2(buildAIPrompt((ED.text || "").trim()))}</textarea>
      <textarea id="edPaste" placeholder="\u2462 AI\u306E\u8FD4\u4E8B\u3092\u3053\u3053\u306B\u8CBC\u308A\u4ED8\u3051"></textarea>
      <div class="edRow"><button class="edBtn pri" id="edLoadPaste">\u8AAD\u307F\u8FBC\u3080</button></div>
    </details>
    <div class="edStatus" id="edStatus">\u304A\u624B\u8EFD\u81EA\u52D5\uFF1A\u3059\u3050\u5206\u3051\u3089\u308C\u308B\u304C\u4E00\u90E8\u306F\u624B\u76F4\u3057\u304C\u5FC5\u8981\u3002\u30B3\u30D4\u30DA\u65B9\u5F0F\uFF1A\u81EA\u5206\u306EAI\u3067\u6B63\u78BA\u306B\u30FB\u8A33\u3064\u304D\u3067\u5206\u3051\u3089\u308C\u308B\uFF08\u7121\u6599\u7248\u306EAI\u3067\u3082\u53EF\uFF09\u3002</div>
    ${ED.sents.length ? `<h3>CHUNKS</h3><p class="edStatus">\u300C\uFF5C\u300D\u3092\u30BF\u30C3\u30D7\u3067\u533A\u5207\u308A\u306E\u8FFD\u52A0\u30FB\u524A\u9664\u3002\u5F79\u5272\u306E\u672D\uFF08S\u30FBV\u30FBO\u2026\uFF09\u3092\u30BF\u30C3\u30D7\u3067\u5F79\u5272\u3092\u5909\u3048\u308B\u3002</p>${sentHTML}
    <h3>QUESTIONS</h3>${qHTML}<div class="edRow"><button class="edBtn" id="edAddRange">\uFF0B \u7BC4\u56F2\u3067\u7B54\u3048\u308B\u554F\u984C</button><button class="edBtn" id="edAddChoice">\uFF0B 5\u629E\u554F\u984C</button></div>` : ""}
    <div class="edRow" style="margin-top:8px"><button class="edBtn pri" id="edSave">\u4FDD\u5B58</button><button class="edBtn" id="edCancel">\u4E00\u89A7\u3078\u623B\u308B</button></div>`;
    $("edAuto").onclick = async () => {
      edCollect();
      if (!ED.text.trim()) {
        edStatus("\u82F1\u6587\u3092\u5165\u308C\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      if (ED.sents.length && !await ask("\u4ECA\u306E\u30C1\u30E3\u30F3\u30AF\u5206\u3051\u3092\u4F5C\u308A\u76F4\u3057\u307E\u3059\u304B\uFF1F", "\u4F5C\u308A\u76F4\u3059")) return;
      ED.sents = autoChunk(ED.text);
      if (!ED.level) ED.level = estimateLevel(ED.sents);
      ED.questions = ED.questions.filter((q) => q.type === "choice" || ED.sents[q.si] && q.b < ED.sents[q.si].words.length);
      renderEditor();
      edStatus("\u304A\u624B\u8EFD\u81EA\u52D5\u3067\u5206\u3051\u307E\u3057\u305F\u3002\u533A\u5207\u308A\u3068\u5F79\u5272\u3092\u78BA\u8A8D\u3057\u3066\u3001\u5FC5\u8981\u306A\u3089\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    };
    $("edBody").querySelector(".edCopy").ontoggle = (e) => {
      ED.copyOpen = e.target.open;
    };
    $("edEstLv").onclick = () => {
      edCollect();
      const src = ED.sents.length ? ED.sents : autoChunk(ED.text || "");
      const lv = estimateLevel(src);
      if (!lv) {
        edStatus("\u82F1\u6587\u3092\u5165\u308C\u3066\u304B\u3089\u898B\u7A4D\u3082\u3063\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      ED.level = lv;
      renderEditor();
      edStatus(`\u96E3\u6613\u5EA6\u3092 ${lvLabel(lv)} \u3068\u898B\u7A4D\u3082\u308A\u307E\u3057\u305F\uFF08AI\u306A\u3057\u306E\u76EE\u5B89\uFF09\u3002\u9055\u3048\u3070\u9078\u3073\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    };
    [["edRangeN", "qRange"], ["edChoiceN", "qChoice"], ["edQLang", "qLang"]].forEach(([id, k]) => $(id).onchange = (e) => {
      settings[k] = id === "edQLang" ? e.target.value : +e.target.value;
      saveSettings();
      syncPrompt(true);
    });
    $("edBody").querySelectorAll(".spanPick").forEach((x) => {
      x.querySelector(".spS").onchange = (e) => {
        edCollect();
        const q = ED.questions[+x.dataset.q], v = { si: +e.target.value, a: 0, b: 0 };
        if (x.dataset.kind === "main") Object.assign(q, v);
        else q[x.dataset.kind][+x.dataset.k] = v;
        renderEditor();
      };
      x.querySelector(".spChunk").onchange = (e) => {
        if (!e.target.value) return;
        edCollect();
        const [si, a, b] = e.target.value.split(":").map(Number), q = ED.questions[+x.dataset.q];
        if (x.dataset.kind === "main") Object.assign(q, { si, a, b });
        else q[x.dataset.kind][+x.dataset.k] = { si, a, b };
        renderEditor();
      };
      [".spA", ".spB"].forEach((c) => x.querySelector(c).onchange = () => {
        edCollect();
        renderEditor();
      });
      const d = x.querySelector(".spDel");
      if (d) d.onclick = () => {
        edCollect();
        ED.questions[+x.dataset.q][x.dataset.kind].splice(+x.dataset.k, 1);
        renderEditor();
      };
    });
    $("edBody").querySelectorAll("[data-addalt],[data-addpart]").forEach((b) => b.onclick = () => {
      edCollect();
      const q = ED.questions[+(b.dataset.addalt || b.dataset.addpart)], k = b.dataset.addalt != null ? "alts" : "partials";
      (q[k] = q[k] || []).push({ si: q.si, a: -1, b: -1 });
      renderEditor();
    });
    const selPrompt = () => {
      syncPrompt(true);
      const ta = $("edPrompt");
      ta.focus();
      ta.select();
      try {
        ta.setSelectionRange(0, ta.value.length);
      } catch (e) {
      }
    };
    ["input", "change", "keyup", "paste", "compositionend", "blur"].forEach((ev) => $("edText").addEventListener(ev, () => setTimeout(() => syncPrompt(), 0)));
    $("edPrompt").addEventListener("focus", () => syncPrompt());
    $("edBody").querySelector(".edCopy").addEventListener("toggle", () => syncPrompt(true));
    clearInterval(window.__promptTimer);
    window.__promptTimer = setInterval(() => {
      if ($("edView").hidden || !$("edText")) {
        clearInterval(window.__promptTimer);
        return;
      }
      syncPrompt();
    }, 600);
    syncPrompt(true);
    $("edSelPrompt").onclick = selPrompt;
    $("edCopyPrompt").onclick = async () => {
      edCollect();
      syncPrompt(true);
      const pr = $("edPrompt").value;
      let ok = false;
      try {
        await navigator.clipboard.writeText(pr);
        ok = true;
      } catch (e) {
      }
      selPrompt();
      if (!ok) {
        try {
          ok = document.execCommand("copy");
        } catch (e) {
        }
      }
      edStatus(ok ? "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002AI\u306B\u8CBC\u308A\u4ED8\u3051\u3066\u9001\u3063\u3066\u304F\u3060\u3055\u3044\u3002\uFF08\u8CBC\u308A\u4ED8\u3051\u3089\u308C\u306A\u304B\u3063\u305F\u3089\u3001\u9078\u629E\u3055\u308C\u305F\u6307\u793A\u6587\u3092\u305D\u306E\u307E\u307E\u30B3\u30D4\u30FC\u3057\u3066\u304F\u3060\u3055\u3044\uFF09" : "\u3053\u306E\u753B\u9762\u3067\u306F\u81EA\u52D5\u3067\u30B3\u30D4\u30FC\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u6307\u793A\u6587\u3092\u9078\u629E\u3057\u305F\u306E\u3067\u3001\u305D\u306E\u307E\u307E\u300C\u30B3\u30D4\u30FC\u300D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    };
    $("edLoadPaste").onclick = async () => {
      const t = $("edPaste").value.trim();
      if (!t) {
        edStatus("AI\u306E\u8FD4\u4E8B\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      let sents, qs, out;
      try {
        out = parsePastedAI(t);
        sents = aiResultToSents(out);
        qs = aiResultToQuestions(out, sents);
      } catch (e) {
        edStatus(`\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A${esc2(e.message || "")}`);
        tell("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\n" + (e.message || "") + "\n\nAI\u306E\u8FD4\u4E8B\u3092\u6700\u521D\u304B\u3089\u6700\u5F8C\u307E\u3067\u5168\u90E8\u8CBC\u308A\u4ED8\u3051\u305F\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      if (!sents.length) {
        edStatus("\u6587\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\uFF08sentences \u304C\u7A7A\u3067\u3059\uFF09\u3002");
        tell("\u30C7\u30FC\u30BF\u306F\u8AAD\u3081\u307E\u3057\u305F\u304C\u3001\u6587\uFF08sentences\uFF09\u304C\u5165\u3063\u3066\u3044\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        return;
      }
      if ((ED.sents.length || ED.questions.length) && !await ask("\u4ECA\u306E\u30C1\u30E3\u30F3\u30AF\u5206\u3051\u3068\u554F\u984C\u3092\u7F6E\u304D\u63DB\u3048\u307E\u3059\u304B\uFF1F", "\u7F6E\u304D\u63DB\u3048\u308B")) return;
      edCollect();
      ED.sents = sents;
      ED.questions = qs.length ? qs : [];
      ED.copyOpen = false;
      const aiTitle = String(out.title || "").trim();
      if (aiTitle && !String(ED.title || "").trim()) ED.title = aiTitle;
      const aiLv = parseInt(out.level, 10) || 0;
      if (!ED.level) ED.level = aiLv >= 1 && aiLv <= 10 ? aiLv : estimateLevel(sents);
      if (!ED.text.trim()) ED.text = sents.map((x) => x.words.join(" ")).join(" ");
      renderEditor();
      edStatus(`\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\uFF08${sents.length}\u6587\u30FB\u5F79\u5272\u3068\u8A33\u3064\u304D${qs.length ? `\u30FB\u554F\u984C${qs.length}\u554F` : ""}\uFF09\u3002\u6C17\u306B\u306A\u308B\u6240\u306F\u76F4\u3057\u3066\u304B\u3089\u4FDD\u5B58\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    };
    $("edAI").onclick = async () => {
      edCollect();
      if (!ED.text.trim()) {
        edStatus("\u82F1\u6587\u3092\u5165\u308C\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      if (ED.sents.length && !await ask("\u4ECA\u306E\u30C1\u30E3\u30F3\u30AF\u5206\u3051\u3092\u4F5C\u308A\u76F4\u3057\u307E\u3059\u304B\uFF1F", "\u4F5C\u308A\u76F4\u3059")) return;
      aiChunk(ED.text);
    };
    $("edBody").querySelectorAll(".edGap").forEach((b) => b.onclick = () => {
      edCollect();
      const s = ED.sents[+b.dataset.si], g = +b.dataset.g;
      s.roleAt = s.roleAt || {};
      s.ujp = s.ujp || {};
      const en = unitEnds(s);
      if (en.includes(g)) {
        s.ends = en.filter((x) => x !== g);
        delete s.roleAt[g + 1];
        delete s.ujp[g + 1];
      } else {
        const st = unitStarts(s).filter((x) => x <= g).pop();
        s.ends = [...en, g].sort((a, b2) => a - b2);
        s.roleAt[g + 1] = s.roleAt[st] || "M";
      }
      renderEditor();
    });
    $("edBody").querySelectorAll(".roleChip").forEach((b) => b.onclick = () => {
      edCollect();
      const s = ED.sents[+b.dataset.si], u = +b.dataset.u;
      s.roleAt = s.roleAt || {};
      s.roleAt[u] = ROLES[(ROLES.indexOf(s.roleAt[u] || "M") + 1) % ROLES.length];
      renderEditor();
    });
    if ($("edAddRange")) $("edAddRange").onclick = () => {
      edCollect();
      ED.questions.push({ type: "range", q: "", si: 0, a: 0, b: 0, alts: [], partials: [] });
      renderEditor();
    };
    if ($("edAddChoice")) $("edAddChoice").onclick = () => {
      edCollect();
      ED.questions.push({ type: "choice", q: "", options: ["", "", "", "", ""], correct: 0 });
      renderEditor();
    };
    $("edBody").querySelectorAll("[data-delq]").forEach((b) => b.onclick = () => {
      edCollect();
      ED.questions.splice(+b.dataset.delq, 1);
      renderEditor();
    });
    $("edSave").onclick = () => {
      edCollect();
      const list = loadMy(), i = list.findIndex((t) => t.id === ED.id);
      ED.questions = ED.questions.map(cleanQ);
      const data = JSON.parse(JSON.stringify(ED));
      if (i >= 0) list[i] = data;
      else list.unshift(data);
      const ok = saveMy(list);
      edStatus(ok ? "\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" : "\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u30D6\u30E9\u30A6\u30B6\u306E\u4FDD\u5B58\u304C\u4F7F\u3048\u306A\u3044\u74B0\u5883\u3067\u3059\uFF09\u3002");
      $("edHead").textContent = `\u7DE8\u96C6\uFF1A${ED.title || "\u7121\u984C"}`;
      if (ok) {
        toast("\u2713 \u4FDD\u5B58\u3057\u307E\u3057\u305F");
        const b = $("edSave");
        b.textContent = "\u2713 \u4FDD\u5B58\u3057\u307E\u3057\u305F";
        b.classList.add("saved");
        setTimeout(() => {
          if ($("edSave") === b) {
            b.textContent = "\u4FDD\u5B58";
            b.classList.remove("saved");
          }
        }, 1800);
      } else tell("\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3053\u306E\u753B\u9762\u3067\u306F\u30D6\u30E9\u30A6\u30B6\u3078\u306E\u4FDD\u5B58\u304C\u4F7F\u3048\u306A\u3044\u3088\u3046\u3067\u3059\u3002");
    };
    $("edCancel").onclick = () => {
      ED = null;
      renderMyList();
    };
  }
  function init_texts() {
    $("edBack").onclick = () => {
      if (ED) {
        ED = null;
        renderMyList();
      } else showTitle();
    };
  }

  // games/chunkchunk/src/rank.js
  var RANK_BANDS = [{ key: "all", label: "\u5168\u30EC\u30D9\u30EB" }];
  var RANK_MAX_PPS = 150;
  var RANK_SHOW = 50;
  var RANKS = null;
  function bandPool(bandKey) {
    const band = RANK_BANDS.find((b) => b.key === bandKey) || RANK_BANDS[0], pool = randomPool();
    if (!band.lv) return pool;
    const f = pool.filter((x) => !x.lv || x.lv >= band.lv[0] && x.lv <= band.lv[1]);
    return f.length ? f : pool;
  }
  function timedList(bandKey, n) {
    const pool = bandPool(bandKey);
    let out = [];
    while (out.length < n) out = out.concat(shuffle(pool));
    return out.slice(0, n).map((x) => [x.s, x.ja]);
  }
  function startTimed(sec, bandKey) {
    bandKey = bandKey || RANK_BANDS[0].key;
    primeSpeech();
    unlockAudio();
    $("title").hidden = true;
    settings.advance = "manual";
    loadStage("one", 0, timedList(bandKey, 120), true);
    S.timed = { limit: sec * 1e3, sec, band: bandKey };
    setTotal(0);
    $("score").textContent = 0;
    S.title = `\u30C1\u30E3\u30EC\u30F3\u30B8 ${sec === 30 ? "30\u79D2" : "1\u5206"}`;
    S.short = "\u30C1\u30E3\u30EC\u30F3\u30B8";
    $("stageText").textContent = S.short;
    updateProg();
    applyAdvanceUI();
    $("timeText").textContent = `\u6B8B\u308A ${sec}.0`;
  }
  function timedStats() {
    const all = [...S.results.filter(Boolean).flatMap((r) => r.chunks), ...S.results[S.si] ? [] : S.chunks[0] || []];
    const c = { excellent: 0, great: 0, good: 0, cross: 0, mini: 0, miss: 0 };
    all.forEach((x) => {
      const k = x.kind === "forgot" ? "miss" : x.kind;
      c[k] = (c[k] || 0) + 1;
    });
    return { n: all.length, sent: S.results.filter(Boolean).length, c };
  }
  function timedEnd() {
    if (!S || !S.timed || S.timedDone) return;
    S.timedDone = true;
    sfx("se/timeup");
    nextRun();
    clearTimeout(S.timer);
    S.phase = "done";
    $("rolePick").hidden = true;
    ENV.core.speech.stop();
    const t = S.timed, score = S.gained, st = timedStats();
    settings.bestTimed = settings.bestTimed || {};
    const lb = settings.bestTimed[t.band] = settings.bestTimed[t.band] || {};
    const localBest = lb[t.sec] || 0, isBest = score > localBest;
    if (isBest) {
      lb[t.sec] = score;
      saveSettings();
    }
    const diff = score - localBest;
    openSheet(`<h2>${esc2(S.title)} \u304A\u308F\u308A\uFF01</h2>
    <div class="rkScore"><div class="big">${score} pt</div>${isBest && score > 0 ? `<div class="rkNew">NEW BEST!</div>` : ""}</div>
    <p class="note">${st.sent}\u6587\u30FB\u25CE${st.c.excellent} \u25EF${st.c.great} \u25B3${st.c.good} \u25BD${st.c.cross} \u30FB${st.c.mini} \xD7${st.c.miss}</p>
    <p class="note">\u3053\u306E\u7AEF\u672B\u306E\u81EA\u5DF1\u30D9\u30B9\u30C8\uFF1A${isBest ? "\u66F4\u65B0\uFF01" : `${localBest} pt\uFF08${diff < 0 ? "\u3042\u3068 " + -diff : "\u540C\u3058"} pt\uFF09`}</p>
    <div id="rkName"></div>
    <div id="rkMsg" class="rkMsg">\u30E9\u30F3\u30AD\u30F3\u30B0\u3068\u6BD4\u3079\u3066\u3044\u307E\u3059\u2026</div>
    <div id="rkCmp"></div>
    <div class="btns" style="flex-direction:column"><button class="primary" id="rkRetry" hidden>\u767B\u9332\u306B\u3082\u3069\u308B\uFF08\u8A18\u9332\u3092\u9001\u308B\uFF09</button><button class="primary" id="rkShow">\u30E9\u30F3\u30AD\u30F3\u30B0\u3092\u898B\u308B</button>
      <div style="display:flex;gap:8px"><button class="ghost" id="rkAgain" style="flex:1">\u3082\u3046\u4E00\u5EA6</button><button class="ghost" id="rkTitle" style="flex:none;font-size:12px;padding:8px 14px">\u30BF\u30A4\u30C8\u30EB\u3078</button></div></div>`, false);
    const rec = { id: "c" + Date.now(), sec: t.sec, band: t.band, score, sent: st.sent, n: st.n, at: Date.now() };
    if (score > 0) addPending(rec);
    $("rkTitle").onclick = showTitle;
    $("rkAgain").onclick = () => {
      closeSheet();
      startTimed(t.sec, t.band);
    };
    $("rkShow").onclick = () => showRanking(t.sec, t.band);
    $("rkRetry").onclick = () => {
      $("rkRetry").hidden = true;
      submitRank(t, score, st, rec.id);
    };
    const lockBtns = ["rkTitle", "rkAgain", "rkShow", "rkRetry"].map($);
    lockBtns.forEach((b) => {
      if (b) {
        b.disabled = true;
        b.style.opacity = ".4";
      }
    });
    setTimeout(() => lockBtns.forEach((b) => {
      if (b) {
        b.disabled = false;
        b.style.opacity = "";
      }
    }), 1500);
    if (isBest && score > 0) setTimeout(() => sfx("se/newbest"), 900);
    else if (score <= 0) setTimeout(() => sfx("voice/try_again"), 600);
    submitRank(t, score, st, rec.id);
    document.dispatchEvent(new CustomEvent("cc:challenge", { detail: { score, sec: t.sec, best: isBest } }));
  }
  function loadPending() {
    try {
      return JSON.parse(LS.getItem("ccs-pending-rank") || "[]").filter((x) => x && x.id && x.score >= 0);
    } catch (e) {
      return [];
    }
  }
  function savePending(a) {
    try {
      LS.setItem("ccs-pending-rank", JSON.stringify(a.slice(-8)));
    } catch (e) {
    }
  }
  function addPending(rec) {
    savePending(loadPending().filter((x) => x.id !== rec.id).concat([rec]));
  }
  function dropPending(id) {
    savePending(loadPending().filter((x) => x.id !== id));
  }
  function cleanNick(s) {
    return String(s || "").replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
  }
  function askNick(box, onDone, cur2) {
    box.innerHTML = `<div class="rkName"><input type="text" id="rkNick" maxlength="12" placeholder="\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u51FA\u3059\u540D\u524D\uFF0812\u6587\u5B57\u307E\u3067\uFF09" value="${esc2(cur2 || "")}"><button class="primary" id="rkNickOk" style="flex:none">\u6C7A\u3081\u308B</button></div>
    <p class="note">\u672C\u540D\u3067\u306F\u306A\u304F\u3001\u30CB\u30C3\u30AF\u30CD\u30FC\u30E0\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u3042\u3068\u304B\u3089\u5909\u3048\u3089\u308C\u307E\u3059\u3002</p>`;
    $("rkNickOk").onclick = () => {
      const n = cleanNick($("rkNick").value);
      if (!n) {
        $("rkNick").focus();
        return;
      }
      settings.nick = n;
      saveSettings();
      box.innerHTML = "";
      onDone(n);
    };
  }
  async function loadRanks() {
    if (!DB) return RANKS;
    try {
      const snap = await DB.collection("ranks").get();
      RANKS = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (e) {
      RANKS = RANKS || [];
    }
    return RANKS;
  }
  function rankList(band, sec) {
    return (RANKS || []).map((d) => {
      const r = d.best && d.best[band] && d.best[band][sec];
      return r && r.score >= 0 && r.score <= sec * RANK_MAX_PPS ? { id: d.id, nick: cleanNick(d.nick) || "\uFF08\u540D\u524D\u306A\u3057\uFF09", avatar: d.avatar || null, score: r.score, at: r.at || 0 } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.at - b.at);
  }
  function renderCompare(t, score) {
    const box = $("rkCmp");
    if (!box) return;
    const list = rankList(t.band, t.sec), others = list.filter((r) => r.id !== MYID);
    const all = [...others.map((r) => ({ ...r, me: false })), { id: MYID, nick: cleanNick(settings.nick) || "\u3042\u306A\u305F", avatar: null, score, me: true }].sort((a, b) => b.score - a.score || (a.me ? 1 : -1));
    const pos = all.findIndex((r) => r.me) + 1, total2 = all.length;
    const above = others.filter((r) => r.score > score).sort((a, b) => a.score - b.score)[0];
    const top = others[0];
    const lines = [`<b>\u4ECA\u56DE\u306E\u70B9\u306F <span class="rkPos">${pos}\u4F4D</span> / ${total2}\u4EBA</b>`];
    if (pos === 1 && total2 > 1) lines.push("\u4ECA\u306E\u3068\u3053\u308D 1\u4F4D\u3067\u3059\uFF01");
    else if (total2 === 1) lines.push("\u307E\u3060\u307B\u304B\u306E\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u3042\u306A\u305F\u304C\u4E00\u756A\u4E57\u308A\u3067\u3059\uFF01");
    else {
      if (above) lines.push(`1\u3064\u4E0A\u306E ${esc2(above.nick)} \u3055\u3093\u307E\u3067\u3001\u3042\u3068 ${above.score - score} pt`);
      if (top && pos > 1) lines.push(`1\u4F4D\u306E ${esc2(top.nick)} \u3055\u3093\u3068\u306F ${top.score - score} pt \u5DEE`);
    }
    const show = /* @__PURE__ */ new Set([0, 1, 2, pos - 2, pos - 1, pos]);
    const row = (r, i) => `<div class="rkRow${r.me ? " me" : ""}"><b>${i + 1}</b><span>${esc2(r.nick)}${r.me ? "\uFF08\u4ECA\u56DE\uFF09" : ""}</span><i>${r.score} pt</i></div>`;
    let rows = "", prev = -1;
    all.forEach((r, i) => {
      if (!show.has(i)) return;
      if (prev >= 0 && i - prev > 1) rows += `<p class="note" style="text-align:center;margin:2px">\u2026</p>`;
      rows += row(r, i);
      prev = i;
    });
    box.innerHTML = `<div class="rkCmpBox"><p class="note" style="color:var(--ink);margin:0 0 4px">${lines.join("<br>")}</p>${rows}</div>`;
  }
  async function doSubmit(t, score, st) {
    await loadRanks();
    const ref = DB.doc("ranks/" + MYID), snap = await ref.get(), d = snap.exists ? snap.data() : {};
    const best = JSON.parse(JSON.stringify(d.best || {}));
    best[t.band] = best[t.band] || {};
    const cur2 = best[t.band][t.sec], better = !cur2 || score > cur2.score;
    if (better) best[t.band][t.sec] = { score, at: Date.now(), sent: st.sent, chunks: st.n != null ? st.n : st.chunks };
    await ref.set({ v: 1, nick: settings.nick, best, at: Date.now() });
    await loadRanks();
    return { better, cur: cur2 };
  }
  async function submitRank(t, score, st, pid) {
    const msg = $("rkMsg");
    if (!msg) return;
    const say = (h, warn) => {
      const m = $("rkMsg");
      if (m) {
        m.innerHTML = h;
        m.style.color = warn ? "var(--bad)" : "var(--ink)";
      }
    };
    const retry = () => {
      const b = $("rkRetry");
      if (b) b.hidden = false;
    };
    const kept = " \u3053\u306E\u8A18\u9332\u306F\u6B8B\u3057\u3066\u3042\u308B\u306E\u3067\u3001\u3042\u3068\u3067\u300C\u767B\u9332\u306B\u3082\u3069\u308B\u300D\u3084\u3001\u30E9\u30F3\u30AD\u30F3\u30B0\u753B\u9762\u306E\u300C\u9001\u308B\u300D\u304B\u3089\u767B\u9332\u3067\u304D\u307E\u3059\u3002";
    if (!DB) {
      say("\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002Claude \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u3001\u516C\u958B\u306EURL\uFF08claude.ai/artifact/\u2026\uFF09\u304B\u3089\u958B\u3044\u305F\u3068\u304D\u3060\u3051\u3001\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u53C2\u52A0\u3067\u304D\u307E\u3059\u3002" + kept, true);
      retry();
      return;
    }
    if (!MYID) {
      say("\u3042\u306A\u305F\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u78BA\u8A8D\u3067\u304D\u306A\u304B\u3063\u305F\u305F\u3081\u3001\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002Claude \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u3001\u516C\u958B\u306EURL\u304B\u3089\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002" + kept, true);
      retry();
      return;
    }
    if (score > t.sec * RANK_MAX_PPS) {
      say("\u8A18\u9332\u304C\u6B63\u3057\u304F\u53D6\u308C\u306A\u304B\u3063\u305F\u305F\u3081\u3001\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u306F\u9001\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002", true);
      if (pid) dropPending(pid);
      return;
    }
    if (!settings.nick) {
      say("\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u51FA\u3059\u540D\u524D\u3092\u6C7A\u3081\u308B\u3068\u3001\u9806\u4F4D\u304C\u51FA\u307E\u3059\u3002");
      askNick($("rkName"), () => {
        say("\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u9001\u3063\u3066\u3044\u307E\u3059\u2026");
        submitRank(t, score, st, pid);
      });
      retry();
      return;
    }
    try {
      say("\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u9001\u3063\u3066\u3044\u307E\u3059\u2026");
      const { better, cur: cur2 } = await doSubmit(t, score, st);
      if (pid) dropPending(pid);
      say(better ? "\u30E9\u30F3\u30AD\u30F3\u30B0\u306E\u81EA\u5DF1\u30D9\u30B9\u30C8\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\uFF01" : `\u30E9\u30F3\u30AD\u30F3\u30B0\u4E0A\u306E\u81EA\u5DF1\u30D9\u30B9\u30C8\u306F ${cur2.score} pt \u306E\u307E\u307E\u3067\u3059\u3002`);
      renderCompare(t, score);
    } catch (e) {
      say("\u30E9\u30F3\u30AD\u30F3\u30B0\u306B\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" + (e && e.code === "permission_denied" ? "\u66F8\u304D\u8FBC\u307F\u306E\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" : "\u901A\u4FE1\u306E\u554F\u984C\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002") + kept, true);
      retry();
    }
  }
  async function showRanking(sec, band) {
    sec = sec || 30;
    band = band || RANK_BANDS[0].key;
    const draw = () => {
      const list = rankList(band, sec), mi = list.findIndex((r) => r.id === MYID);
      const row = (r, i) => `<div class="rkRow${r.id === MYID ? " me" : ""}"><b>${i + 1}</b><span>${esc2(r.nick)}</span><i>${r.score} pt</i></div>`;
      openSheet(`<h2>\u30E9\u30F3\u30AD\u30F3\u30B0</h2>
      <div class="modes">${[30, 60].map((s) => `<button data-rs="${s}" aria-pressed="${s === sec}">${s === 30 ? "30\u79D2" : "1\u5206"}</button>`).join("")}</div>
      ${RANK_BANDS.length > 1 ? `<div class="modes">${RANK_BANDS.map((b) => `<button data-rb="${b.key}" aria-pressed="${b.key === band}">${esc2(b.label)}</button>`).join("")}</div>` : ""}
      ${!DB ? `<p class="note">\u30E9\u30F3\u30AD\u30F3\u30B0\u306F\u3001Claude \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u958B\u3044\u305F\u3068\u304D\u3060\u3051\u898B\u3089\u308C\u307E\u3059\u3002</p>` : RANKS == null ? `<p class="note">\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026</p>` : list.length ? `<div>${list.slice(0, RANK_SHOW).map(row).join("")}${mi >= RANK_SHOW ? `<p class="note" style="text-align:center">\u2026</p>${row(list[mi], mi)}` : ""}</div>` : `<p class="note">\u307E\u3060\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u30C1\u30E3\u30EC\u30F3\u30B8\u3067\u4E00\u756A\u4E57\u308A\u3057\u3088\u3046\uFF01</p>`}
      ${loadPending().length ? `<div class="rkCmpBox"><p class="note" style="color:var(--ink);margin:6px 0 2px"><b>\u307E\u3060\u9001\u3063\u3066\u3044\u306A\u3044\u8A18\u9332\u304C\u3042\u308A\u307E\u3059</b></p>${loadPending().map((p) => `<div class="rkRow"><b>${p.sec === 30 ? "30\u79D2" : "1\u5206"}</b><span>${new Date(p.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><i>${p.score} pt</i><button class="ghost" data-pend="${p.id}" style="flex:none;padding:6px 12px">\u9001\u308B</button></div>`).join("")}</div>` : ""}
      ${DB && MYID ? `<div id="rkName"></div>` : ""}
      <div class="btns">${DB && MYID ? `<button class="ghost" id="rkNickBtn">\u540D\u524D\u3092\u5909\u3048\u308B</button>` : ""}<button class="primary" id="closeBtn">\u9589\u3058\u308B</button></div>`);
      $("sheet").querySelectorAll("[data-rs]").forEach((b) => b.onclick = () => {
        sec = +b.dataset.rs;
        draw();
      });
      $("sheet").querySelectorAll("[data-rb]").forEach((b) => b.onclick = () => {
        band = b.dataset.rb;
        draw();
      });
      $("closeBtn").onclick = closeSheet;
      $("sheet").querySelectorAll("[data-pend]").forEach((bt) => bt.onclick = async () => {
        const rec = loadPending().find((x) => x.id === bt.dataset.pend);
        if (!rec) return;
        if (!DB || !MYID) {
          toast("Claude \u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u3001\u516C\u958B\u306EURL\u304B\u3089\u958B\u304F\u3068\u9001\u308C\u307E\u3059");
          return;
        }
        if (!settings.nick) {
          askNick($("rkName"), () => bt.click());
          return;
        }
        try {
          bt.disabled = true;
          const r = await doSubmit({ sec: rec.sec, band: rec.band }, rec.score, { sent: rec.sent, n: rec.n });
          dropPending(rec.id);
          toast(r.better ? "\u8A18\u9332\u3092\u9001\u308A\u307E\u3057\u305F\uFF08\u81EA\u5DF1\u30D9\u30B9\u30C8\u66F4\u65B0\uFF09" : "\u8A18\u9332\u3092\u9001\u308A\u307E\u3057\u305F");
          sec = rec.sec;
          draw();
        } catch (e) {
          bt.disabled = false;
          toast("\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u8A66\u3057\u3066\u304F\u3060\u3055\u3044");
        }
      });
      if ($("rkNickBtn")) $("rkNickBtn").onclick = () => askNick($("rkName"), async (n) => {
        try {
          const ref = DB.doc("ranks/" + MYID), snap = await ref.get();
          if (snap.exists) {
            await ref.set({ ...snap.data(), nick: n, at: Date.now() });
            await loadRanks();
          }
          toast("\u540D\u524D\u3092\u5909\u3048\u307E\u3057\u305F");
        } catch (e) {
          toast("\u540D\u524D\u3092\u5909\u3048\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F");
        }
        draw();
      }, settings.nick);
    };
    draw();
    if (DB) {
      await loadRanks();
      if (!$("modal").hidden && $("sheet").querySelector("[data-rs]")) draw();
    }
  }
  function init_rank() {
    {
      const g = $("gear").onclick;
      $("gear").onclick = async () => {
        if (S && S.timed && S.phase === "play") {
          if (await ask("\u30C1\u30E3\u30EC\u30F3\u30B8\u3092\u3084\u3081\u307E\u3059\u304B\uFF1F\uFF08\u3053\u306E\u56DE\u306E\u8A18\u9332\u306F\u6B8B\u308A\u307E\u305B\u3093\uFF09", "\u3084\u3081\u308B", "\u3064\u3065\u3051\u308B")) showTitle();
          return;
        }
        g();
      };
    }
  }

  // games/chunkchunk/src/bgm.js
  var FILES2 = { title: { f: "title.mp3", mean: -16.1 }, game: { f: "game.mp3", mean: -13.8 }, game30: { f: "game30.mp3", mean: -15.2 }, result: { f: "result.mp3", mean: -19.1 }, study: { f: "study.mp3", mean: -19 } };
  var BGM_TARGET = { low: -31, mid: -25 };
  var duck = 1;
  function bgmDuck(on) {
    duck = on ? 0.25 : 1;
    try {
      bgmTick();
    } catch (e) {
    }
  }
  var NODES = {};
  var cur = null;
  var timer = 0;
  var btn = null;
  function level(k) {
    const m = settings.bgm || "low";
    if (!BGM_TARGET[m]) return 0;
    return Math.min(1, Math.pow(10, (BGM_TARGET[m] - FILES2[k].mean) / 20)) * duck;
  }
  function node(k) {
    if (NODES[k]) return NODES[k];
    const a = new Audio(ENV.ctx.base + "audio/bgm/" + FILES2[k].f);
    a.loop = true;
    a.preload = "auto";
    const n = { a, g: null };
    try {
      const ac = ENV.core.sound.ctx(), src = ac.createMediaElementSource(a), g = ac.createGain();
      g.gain.value = 0;
      src.connect(g).connect(ENV.core.sound.bgmBus);
      n.g = g;
    } catch (e) {
      a.volume = 0.1;
    }
    return NODES[k] = n;
  }
  function setVol(n, v, sec) {
    if (n.g) {
      try {
        const t = ENV.core.sound.ctx().currentTime;
        n.g.gain.cancelScheduledValues(t);
        n.g.gain.setTargetAtTime(v, t, sec / 3);
      } catch (e) {
      }
    } else n.a.volume = Math.min(1, v * 0.5);
  }
  function wanted() {
    if (!ENV.root || settings.mute || (settings.bgm || "low") === "off" || document.hidden) return null;
    if (ENV.make && ENV.make.visible() || ENV.story && ENV.story.visible()) return "study";
    const ti = $("title");
    if (ti && !ti.hidden) return "title";
    try {
      if (ENV.core.reader.isOpen) return "study";
    } catch (e) {
    }
    if ($("edView") && !$("edView").hidden) return "study";
    if (S) {
      if (S.phase === "done") return "result";
      if (S.studyMode) return "study";
      return S.timed && S.timed.sec === 30 ? "game30" : "game";
    }
    return "title";
  }
  function hint(on) {
    if (btn) btn.classList.toggle("bgmWait", !!on);
  }
  function bgmTick() {
    if (btn) {
      const ev = document.getElementById("edView");
      btn.style.display = ev && !ev.hidden ? "none" : "";
    }
    if (!ENV.root) return;
    let ac = null;
    try {
      ac = ENV.core.sound.ctx();
      if (ac && ac.state === "suspended") ac.resume().catch(() => {
      });
    } catch (e) {
    }
    if (!ac) return;
    const want = wanted();
    if (want === cur) {
      if (want) {
        const n = node(want);
        if (n.a.paused) n.a.play().catch(() => {
        });
        setVol(n, level(want), 0.4);
        hint(n.a.paused || ac.state !== "running");
      } else hint(false);
      return;
    }
    if (cur) {
      const o = node(cur);
      setVol(o, 0, 0.6);
      const oa = o.a;
      setTimeout(() => {
        if (cur !== Object.keys(NODES).find((k) => NODES[k] === o)) oa.pause();
      }, 900);
    }
    cur = want;
    if (want) {
      const n = node(want);
      if (want !== "study") {
        try {
          n.a.currentTime = 0;
        } catch (e) {
        }
      }
      n.a.play().catch(() => {
      });
      setVol(n, level(want), 0.8);
    } else hint(false);
  }
  function bgmMuteDraw() {
    if (!btn) return;
    const off = !!settings.mute;
    btn.textContent = off ? "\u{1F507}" : "\u{1F3B5}";
    btn.setAttribute("aria-label", off ? "\u97F3\u3092\u5165\u308C\u308B" : "\u97F3\u3092\u305C\u3093\u3076\u6D88\u3059");
    btn.title = btn.getAttribute("aria-label");
  }
  function initBgm(el) {
    NODES = {};
    cur = null;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ccBgmMute";
    btn.dataset.nosfx = "1";
    btn.onclick = () => setMute(!settings.mute);
    el.appendChild(btn);
    bgmMuteDraw();
    const g = () => {
      try {
        unlockAudio();
      } catch (e) {
      }
      bgmTick();
    };
    ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach((ev) => {
      document.addEventListener(ev, g, true);
      ENV.offs.push(() => document.removeEventListener(ev, g, true));
    });
    timer = setInterval(bgmTick, 400);
    ENV.offs.push(() => {
      clearInterval(timer);
      stopBgm();
    });
  }
  function stopBgm() {
    Object.values(NODES).forEach((n) => {
      try {
        n.a.pause();
        n.a.src = "";
      } catch (e) {
      }
    });
    NODES = {};
    cur = null;
    if (btn) {
      btn.remove();
      btn = null;
    }
  }

  // games/chunkchunk/src/engine.js
  var PER_STAGE = 6;
  var SPEED = { 1: 1600, 2: 1300, 3: 1100, 4: 820, 5: 600, 6: 450, 7: 330, 8: 230, 9: 150, 10: 82 };
  var SPEED_NAME = { 1: "\u306E\u3093\u3073\u308A", 2: "\u3086\u3063\u304F\u308A", 3: "\u3084\u3084\u9045\u3044", 4: "\u3075\u3064\u3046", 5: "\u3084\u3084\u901F\u3044", 6: "\u901F\u3044", 7: "\u3068\u3066\u3082\u901F\u3044", 8: "\u6FC0\u901F", 9: "\u8D85\u901F", 10: "\u9B3C" };
  var FONT2 = { xl: 28, l: 23, m: 20, s: 17, xs: 14 };
  var FONT_NAME = { xl: "\u7279\u5927", l: "\u5927", m: "\u4E2D", s: "\u5C0F", xs: "\u6975\u5C0F\uFF08\u5148\u307E\u3067\u898B\u3048\u308B\uFF09" };
  var PTS = { excellent: 100, great: 80, good: 40, cross: 30, mini: 30, miss: 0, forgot: 0 };
  var BONUS = 50;
  var RANK = { excellent: ["Excellent!", "\u25CE"], great: ["Great!", "\u25EF"], good: ["Good", "\u25B3"], cross: ["Nice", "\u25BD"], mini: ["", "\u30FB"], miss: ["Miss\u2026", "\xD7"], forgot: ["\u533A\u5207\u308A\u5FD8\u308C\uFF01", "\xD7"] };
  var RN2 = { S: ["\u8AB0\u304C\u30FB\u4F55\u304C", "\u4E3B\u8A9E"], V: ["\u3059\u308B", "\u52D5\u8A5E"], O: ["\u4F55\u3092\u30FB\u8AB0\u3092", "\u76EE\u7684\u8A9E"], I: ["\u8AB0\u306B", "\u9593\u63A5\u76EE\u7684\u8A9E"], C: ["\u3069\u3046\u3060", "\u88DC\u8A9E"], P: ["\u3069\u3053\u3067", "\u5834\u6240"], T: ["\u3044\u3064", "\u6642"], M: ["\u3069\u3046\u3084\u3063\u3066", "\u69D8\u5B50\u30FB\u624B\u6BB5"], R: ["\u306A\u305C", "\u7406\u7531"], F: ["\u3082\u3057", "\u6761\u4EF6"], X: ["\u8AAC\u660E", "\u4FEE\u98FE\u8A9E\u53E5"] };
  var RS = { S: ["\u8AB0\u304C", "\u4E3B\u8A9E"], V: ["\u3059\u308B", "\u52D5\u8A5E"], O: ["\u4F55\u3092", "\u76EE\u7684\u8A9E"], I: ["\u8AB0\u306B", "\u9593\u63A5\u76EE\u7684\u8A9E"], C: ["\u3069\u3046\u3060", "\u88DC\u8A9E"], P: ["\u3069\u3053\u3067", "\u5834\u6240"], T: ["\u3044\u3064", "\u6642"], M: ["\u3069\u3046\u3084\u3063\u3066", "\u69D8\u5B50"], R: ["\u306A\u305C", "\u7406\u7531"], F: ["\u3082\u3057", "\u6761\u4EF6"] };
  var PH = { S: "\u540D\u8A5E\u53E5", O: "\u540D\u8A5E\u53E5", I: "\u540D\u8A5E\u53E5", C: "\u88DC\u8A9E", P: "\u526F\u8A5E\u53E5", T: "\u526F\u8A5E\u53E5", M: "\u526F\u8A5E\u53E5", R: "\u526F\u8A5E\u7BC0", F: "\u526F\u8A5E\u7BC0" };
  var DET = new Set("a an the my your his her its our their this that these those some".split(" "));
  var PRON = new Set("i you he she it we they me him her us them".split(" "));
  var ADV = "PTMRF";
  var AUX = new Set("can could will would shall should may might must do does did am is are was were be been being have has had".split(" "));
  var $ = (id) => document.getElementById(id);
  var ENV = { root: null, ctx: null, core: null, offs: [] };
  var onDoc = (t, f, o) => {
    document.addEventListener(t, f, o);
    ENV.offs.push(() => document.removeEventListener(t, f, o));
  };
  var LS = { getItem: (k) => {
    const v = ENV.ctx.store.get(k);
    return v == null ? null : v;
  }, setItem: (k, v) => ENV.ctx.store.set(k, v), removeItem: (k) => ENV.ctx.store.remove(k) };
  function setTotal(v) {
    total = v;
  }
  function stopVoice() {
    speakTok++;
    ENV.core.speech.stop();
    try {
      bgmDuck(false);
    } catch (e) {
    }
  }
  function clearPop() {
    if (popEl) {
      popEl.remove();
      popEl = null;
    }
  }
  function nextRun() {
    return ++runId;
  }
  var reduce2 = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var bare = (w) => w.toLowerCase().replace(/[^a-z']/g, "");
  var settings = { lvSys: "grade", myLevel: 0, lvAuto: true, lvSort: "rec", lvFilter: "all", qRange: 3, qChoice: 3, qLang: "ja", advance: "auto", speed: 4, font: "m", rdLines: 1, tts: true, sound: "both", disp: "easy", mode: "one" };
  function loadSettings() {
    try {
      Object.assign(settings, JSON.parse(LS.getItem("ccs3-settings") || "{}"));
    } catch (e) {
    }
    settings.speed = { slow: 3, normal: 4, fast: 5 }[settings.speed] || +settings.speed || 4;
    if (!FONT2[settings.font]) settings.font = "m";
    document.body.classList.toggle("nogram", settings.gram === false);
    ENV.offs.push(() => document.body.classList.remove("nogram"));
  }
  function applyVisual() {
    const r = document.documentElement.style, ms = SPEED[settings.speed];
    r.setProperty("--laneFont", FONT2[settings.font] + "px");
    r.setProperty("--stepDur", Math.min(170, Math.round(ms * 0.7)) + "ms");
  }
  function saveSettings() {
    try {
      LS.setItem("ccs3-settings", JSON.stringify(settings));
    } catch (e) {
    }
  }
  var canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  function speakChunks(chunks) {
    if (!canSpeak || !settings.tts) return;
    const sp = ENV.core.speech, tok = ++speakTok;
    let i = 0;
    const next = () => {
      if (tok !== speakTok || i >= chunks.length) {
        if (tok === speakTok) bgmDuck(false);
        return;
      }
      bgmDuck(true);
      sp.speak(chunks[i++], { rate: 0.9, onend: next });
    };
    next();
  }
  var speakTok = 0;
  var actx = null;
  function unlockAudio() {
    try {
      actx = ENV.core.sound.ctx();
    } catch (e) {
    }
  }
  function tone(freq, dur, type, vol, slide) {
    if (settings.mute || !actx) return;
    try {
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 6e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      o.connect(g).connect(ENV.core.sound.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.03);
    } catch (e) {
    }
  }
  function setMute(on) {
    settings.mute = !!on;
    saveSettings();
    if (on) {
      stopSfxVoice();
      try {
        ENV.core.speech.stop();
      } catch (e) {
      }
    } else {
      try {
        unlockAudio();
      } catch (e) {
      }
    }
    bgmTick();
    bgmMuteDraw();
    const sel = document.getElementById("optMute");
    if (sel) sel.value = on ? "on" : "off";
  }
  function hitSound(kind) {
    const m = settings.sound;
    if (m === "off" || settings.mute) return;
    const miss = kind === "miss" || kind === "forgot";
    if (m === "voice" && !miss) return;
    if (!miss) {
      const vf = { excellent: "voice/excellent", good: "voice/good", cross: "voice/nice" }[kind];
      if (vf) {
        sfx(vf);
        return;
      }
    }
    if (kind === "forgot" && m !== "voice") {
      sfx("se/forgot");
      return;
    }
    const v = m === "both" ? 0.55 : 1;
    if (kind === "excellent") {
      tone(880, 0.07, "sine", 0.14 * v);
      setTimeout(() => tone(1320, 0.09, "sine", 0.12 * v), 55);
    } else if (kind === "great") tone(988, 0.09, "sine", 0.13 * v);
    else if (kind === "good" || kind === "cross") tone(660, 0.09, "triangle", 0.11 * v);
    else if (kind === "mini") tone(1250, 0.04, "triangle", 0.07 * v);
    else tone(160, 0.18, "sawtooth", 0.06, 0.7);
  }
  var readTok = 0;
  function readTextAloud(text) {
    if (!canSpeak || !text || settings.mute || settings.sound === "sfx" || settings.sound === "off") return;
    const tok = ++readTok;
    speakTok++;
    bgmDuck(true);
    ENV.core.speech.speak(text, { rate: 1, onend: () => {
      if (tok === readTok) bgmDuck(false);
    } });
  }
  function readSentence(k) {
    const sen = S && S.sens[S.seq[k]];
    if (sen) readTextAloud(sen.words.join(" "));
  }
  function tick() {
    if (!settings.mute && settings.sound === "sfx") tone(1900, 0.025, "square", 0.012);
  }
  function primeSpeech() {
  }
  function parseSentence2(str, ja) {
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
      const en = rest.slice(0, ei);
      let jp = rest.slice(ei + 1), subJp = null;
      const m = jp.match(/^(.*)\{(.*)\}$/);
      if (m) {
        jp = m[1];
        subJp = m[2].split("/");
      }
      const u = { role, jp, note, s: words.length, subs: null };
      const parts = en.split(" / ");
      if (parts.length > 1) u.subs = [];
      parts.forEach((p, pi) => {
        let x = false;
        if (u.subs && pi > 0 && /^X:/i.test(p)) {
          x = true;
          p = p.slice(2);
        }
        const s = words.length;
        p.split(" ").forEach((w) => {
          words.push(w);
          unitOf.push(units.length);
        });
        if (u.subs) u.subs.push({ s, e: words.length - 1, jp: subJp ? subJp[pi] || "" : "", x });
      });
      u.e = words.length - 1;
      u.text = words.slice(u.s, u.e + 1).join(" ");
      units.push(u);
    });
    const sen = { units, words, unitOf, ja, en: words.join(" ") };
    sen.who = who || guessWho(sen);
    return sen;
  }
  var SHARE = { 2: [60, 40], 3: [40, 30, 30] };
  function subPts(u, pi, kind) {
    const n = u.subs.length, sh = (SHARE[n] || [])[pi] ?? Math.round(100 / n);
    return kind === "mini" ? Math.min(sh, PTS.mini) : sh;
  }
  function subIsX(u, pi) {
    return pi > 0 && !!u.subs && u.role !== "V" && (u.subs[pi].x || "SOIC".includes(u.role));
  }
  function wordRole2(sen, i) {
    const u = sen.units[sen.unitOf[i]];
    if (u.subs) {
      const pi = u.subs.findIndex((p) => i >= p.s && i <= p.e);
      if (subIsX(u, pi)) return "X";
    }
    return u.role;
  }
  var PREPS = new Set("in on at by for with of from into onto over under about after before during through between among against around across along behind beside beyond despite except inside near off out outside past since than toward towards until up upon within without as like per via".split(" "));
  var CONJS = new Set("and but or nor so yet because if when while although though unless whether that than until once".split(" "));
  function lenient(sen, a, b, roles, miss) {
    const ws = sen.words.slice(a, b + 1), last = bare(ws[ws.length - 1]);
    if (!last) return miss;
    if (DET.has(last) || PREPS.has(last) || CONJS.has(last) || last === "to") return miss;
    if (AUX.has(last) && b < sen.words.length - 1) return miss;
    if (ws.length === 1 && DET.has(bare(ws[0]))) return miss;
    if (ENV.core && ENV.core.dict && b < sen.words.length - 1) {
      const e = ENV.core.dict.lookup(last);
      if (e && e.pos && e.pos.length && e.pos.every((p) => p[0] === "adj") && /[a-z]$/i.test(sen.words[b]) && !/^[A-Z]/.test(sen.words[b + 1] || "")) return miss;
    }
    return { kind: "cross", easy: "\u610F\u5473\u306E\u307E\u3068\u307E\u308A", gram: "\u610F\u5473\u306E\u307E\u3068\u307E\u308A\uFF08\u5F79\u5272\u3092\u307E\u305F\u3050\uFF09", jp: "", roles };
  }
  function isMini(role, ws) {
    if (ws.length === 1) return true;
    return ws.length === 2 && "SOIC".includes(role) && DET.has(bare(ws[0]));
  }
  function miniLabel(role, ws) {
    const easy = RN2[role][0];
    if (role === "V") return [easy, "\u52D5\u8A5E\uFF01"];
    if ("SOI".includes(role)) return ws.length === 1 && PRON.has(bare(ws[0])) ? [easy, "\u4EE3\u540D\u8A5E\uFF01"] : [easy, "\u540D\u8A5E\uFF01"];
    if (role === "C") return [easy, "\u88DC\u8A9E\uFF01"];
    return [easy, "\u526F\u8A5E\uFF01"];
  }
  function classify(sen, a, b) {
    const U = sen.units, ua = sen.unitOf[a], ub = sen.unitOf[b], ws = sen.words.slice(a, b + 1);
    const roles = ws.map((_, i) => wordRole2(sen, a + i));
    const miss = { kind: "miss", easy: "", gram: "", jp: "", roles: null };
    if (ua === ub) {
      const u = U[ua];
      if (a === u.s && b === u.e) {
        const note = u.note;
        if (isMini(u.role, ws)) {
          const [e, g] = miniLabel(u.role, ws);
          return { kind: "mini", easy: e, gram: g, note, jp: u.jp, roles };
        }
        let easy = RN2[u.role][0], gram = u.role === "V" ? "\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A" : `${RN2[u.role][1]}\u30FB${PH[u.role]}`;
        if (u.subs) {
          if (u.role === "V") {
            easy += "\uFF08\u719F\u8A9E\uFF0B\u52D5\u8A5E\uFF09";
            gram += "\uFF08\u719F\u8A9E\uFF0B\u52D5\u8A5E\uFF09";
          } else if ("SOIC".includes(u.role)) {
            easy += "\uFF08\u3072\u3068\u30FB\u3082\u306E\uFF0B\u8AAC\u660E\uFF09";
            gram += "\uFF08\u540D\u8A5E\uFF0B\u4FEE\u98FE\u8A9E\u53E5\uFF09";
          } else {
            easy += "\uFF08\u3044\u304F\u3064\u304B\u306E\u307E\u3068\u307E\u308A\uFF09";
            gram += "\uFF08\u3044\u304F\u3064\u304B\u306E\u307E\u3068\u307E\u308A\uFF09";
          }
        }
        return { kind: "excellent", easy, gram, note, jp: u.jp, roles };
      }
      if (u.subs && u.role === "V") {
        const pi = u.subs.findIndex((p) => p.s === a && p.e === b);
        if (pi === 0 && ws.length === 1 && AUX.has(bare(ws[0]))) return { kind: "mini", easy: "\u52A9\u52D5\u8A5E", gram: "\u52A9\u52D5\u8A5E\uFF01", jp: u.subs[0].jp, roles, pts: subPts(u, pi, "mini") };
        if (pi === 0 || pi > 0 && pi < u.subs.length - 1) return { kind: "excellent", easy: "\u719F\u8A9E", gram: "\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A", jp: u.subs[pi].jp, roles, pts: subPts(u, pi) };
        if (pi > 0) {
          const k1 = ws.length === 1 ? "mini" : "excellent";
          return { kind: k1, easy: "\u3059\u308B", gram: ws.length === 1 ? "\u52D5\u8A5E\uFF01" : "\u52D5\u8A5E", jp: u.subs[pi].jp, roles, pts: subPts(u, pi, k1) };
        }
      }
      if (u.subs && !"SOIC".includes(u.role)) {
        const pi = u.subs.findIndex((p) => p.s === a && p.e === b);
        if (pi >= 0 && subIsX(u, pi)) {
          if (ws.length === 1) return { kind: "mini", easy: "\u3064\u3051\u8DB3\u3057", gram: "\u4FEE\u98FE\u8A9E\uFF01", jp: u.subs[pi].jp, roles, pts: subPts(u, pi, "mini") };
          return { kind: "excellent", easy: "\u3064\u3051\u8DB3\u3057\uFF08" + RN2[u.role][0] + "\u306E\u8AAC\u660E\uFF09", gram: "\u4FEE\u98FE\u8A9E\u53E5\uFF08\u5F8C\u308D\u304B\u3089\u8AAC\u660E\uFF09", jp: u.subs[pi].jp, roles, pts: subPts(u, pi) };
        }
        if (pi >= 0) {
          if (ws.length === 1) {
            const [e, g] = miniLabel(u.role, ws);
            return { kind: "mini", easy: e, gram: g, jp: u.subs[pi].jp, roles, pts: subPts(u, pi, "mini") };
          }
          return { kind: "excellent", easy: RN2[u.role][0] + "\uFF08\u307E\u3068\u307E\u308A\u306E\u4E00\u90E8\uFF09", gram: (PH[u.role] || "\u526F\u8A5E\u53E5") + "\u306E\u4E00\u90E8", jp: u.subs[pi].jp, roles, pts: subPts(u, pi) };
        }
      }
      if (u.subs) {
        const pi = u.subs.findIndex((p) => p.s === a && p.e === b);
        if (pi === 0) {
          if (isMini(u.role, ws)) return { kind: "mini", easy: "\u3072\u3068\u30FB\u3082\u306E\uFF08\u4E2D\u5FC3\uFF09", gram: "\u540D\u8A5E\uFF01", jp: u.subs[0].jp, roles: roles.map(() => u.role), pts: subPts(u, 0, "mini") };
          return { kind: "excellent", easy: "\u3072\u3068\u30FB\u3082\u306E\uFF08\u4E2D\u5FC3\uFF09", gram: "\u540D\u8A5E\u53E5\uFF08\u4E2D\u5FC3\u306E\u540D\u8A5E\uFF09", jp: u.subs[0].jp, roles, pts: subPts(u, 0) };
        }
        if (pi > 0) return { kind: "excellent", easy: "\u3069\u3093\u306A\uFF08\u8AAC\u660E\uFF09", gram: "\u4FEE\u98FE\u8A9E\u53E5\uFF08\u5F8C\u308D\u304B\u3089\u8AAC\u660E\uFF09", jp: u.subs[pi].jp, roles, pts: subPts(u, pi) };
      }
      return lenient(sen, a, b, roles, miss);
    }
    if (a !== U[ua].s || b !== U[ub].e) return lenient(sen, a, b, roles, miss);
    const list = U.slice(ua, ub + 1);
    for (let i = 1; i < list.length; i++) if (list[i].role === "S" && list[i - 1].role !== "V") return miss;
    const compE = list.map((u) => RS[u.role][0]).join("\uFF0B"), compG = list.map((u) => RS[u.role][1]).join("\uFF0B");
    const jp = (list[0].role === "S" ? [list[0], ...list.slice(1).reverse()] : [...list].reverse()).map((u) => u.jp).join("");
    const vNote = list.find((u) => u.role === "V" && u.note);
    const base = { roles, jp, note: vNote ? vNote.note : null };
    if (list[0].role === "S") return { ...base, kind: "good", easy: "SV\u30C1\u30E3\u30F3\u30AF\uFF1A" + compE, gram: "SV\u30C1\u30E3\u30F3\u30AF\uFF1A" + compG };
    if (list[0].role === "V") return { ...base, kind: "great", easy: "\u3059\u308B\u3053\u3068\uFF1A" + compE, gram: "\u52D5\u8A5E\u53E5\uFF1A" + compG };
    if (list.every((u) => ADV.includes(u.role))) return { ...base, kind: "great", easy: "\u3044\u3064\u30FB\u3069\u3053\u30FB\u3069\u3046\uFF1A" + compE, gram: "\u526F\u8A5E\u53E5\uFF1A" + compG };
    return { ...base, kind: "great", easy: "\u307E\u3068\u307E\u308A\uFF1A" + compE, gram: "\u8A9E\u53E5\u306E\u307E\u3068\u307E\u308A\uFF1A" + compG };
  }
  function labelText(c) {
    if (settings.disp === "none") return "";
    return settings.disp === "gram" ? c.gram : settings.disp === "both" && c.gram !== c.easy ? `${c.easy}\uFF0F${c.gram}` : c.easy;
  }
  function noteText(c) {
    if (!c.note || settings.disp === "none") return "";
    const [e, g] = c.note;
    return settings.disp === "gram" ? g : settings.disp === "both" ? `${e}\uFF0F${g}` : e;
  }
  var ART = {
    face: { b: "\u{1F466}", g: "\u{1F467}", o: "\u{1F7E7}" },
    act: { b: "\u{1F64B}\u200D\u2642\uFE0F", g: "\u{1F64B}\u200D\u2640\uFE0F", o: "\u{1F7E7}" },
    state: { b: "\u{1F9CD}", g: "\u{1F9CD}\u200D\u2640\uFE0F", o: "\u{1F7E7}" },
    q: "\u2753",
    sun: "\u2600\uFE0F",
    moon: "\u{1F319}",
    place: { out: "\u{1F333}", home: "\u{1F3E0}", school: "\u{1F3EB}", town: "\u{1F3D9}\uFE0F" }
  };
  var artHTML = (v) => /\.(png|jpe?g|gif|svg|webp)$/i.test(v) ? `<img src="${esc2(v)}" alt="">` : esc2(v);
  var BOYW = new Set("he him his boy boys brother father dad uncle grandfather man ken tom leo i".split(" "));
  var GIRLW = new Set("she her girl sister mother mom aunt grandmother woman emma yuki".split(" "));
  function guessWho(sen) {
    const u = sen.units.find((u2) => u2.role === "S");
    if (!u) return "o";
    const ws = sen.words.slice(u.s, u.e + 1).map(bare);
    const b = ws.some((w) => BOYW.has(w)), g = ws.some((w) => GIRLW.has(w));
    return b && !g ? "b" : g && !b ? "g" : "o";
  }
  var STATEV = new Set("is am are was were be like likes liked love loves know knows knew want wants wanted have has had belong belongs seem seems tasted tastes need needs".split(" "));
  function verbKind(sen, u) {
    const ws = sen.words.slice(u.s, u.e + 1).map(bare);
    if (ws.some((w) => w.endsWith("ing")) || ws.includes("to")) return "act";
    return ws.some((w) => STATEV.has(w)) ? "state" : "act";
  }
  var PLACEW = { out: "park garden river beach field zoo corner gate countryside", home: "kitchen room home house car sofa", school: "school classroom library museum class", town: "station town shop mall city hospital way there front" };
  function placeKind(sen, u) {
    const ws = sen.words.slice(u.s, u.e + 1).map(bare);
    for (const k in PLACEW) if (PLACEW[k].split(" ").some((w) => ws.includes(w))) return k;
    return "town";
  }
  var SG = { k: -1 };
  function stageReset(k) {
    SG = { k, face: false, body: null, cap: [] };
    const st = $("stage");
    st.className = "stage";
    ["sgPlace", "sgSign", "sgTime", "sgArt", "sgCap", "sgObj", "sgFace"].forEach((id) => $(id).innerHTML = "");
    $("sgArt").className = "sgArt";
    $("sgHint").hidden = false;
  }
  function popIn(el, big) {
    el.animate(reduce2 ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `scale(${big ? 0.3 : 0.6})`, opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }], { duration: 380, easing: "ease-out" });
  }
  function fly(text, cls) {
    const el = document.createElement("div");
    el.className = "sgFly " + cls;
    el.textContent = text;
    $("stage").append(el);
    el.animate(reduce2 ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }] : [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.15)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.65 }, { transform: "translate(-50%,-90%) scale(.8)", opacity: 0 }], { duration: 900, easing: "ease-out" }).onfinish = () => el.remove();
  }
  function stageOnChunk(k, sen, c) {
    if (SG.k !== k) stageReset(k);
    if (c.kind === "miss" || c.kind === "forgot") {
      const q = $("sgQ");
      q.innerHTML = artHTML(ART.q);
      q.animate(reduce2 ? [{ opacity: 1 }, { opacity: 1 }, { opacity: 0 }] : [{ opacity: 0, transform: "translateY(6px) scale(.6)" }, { opacity: 1, transform: "none", offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1300 });
      return;
    }
    $("sgHint").hidden = true;
    const units = sen.units.filter((u) => u.s >= c.a && u.e <= c.b);
    if (!units.length) {
      const u = sen.units[sen.unitOf[c.a]];
      if (u.role === "S" && u.subs && c.a === u.subs[0].s) units.push({ ...u, partial: true });
    }
    const who = sen.who;
    units.forEach((u) => {
      const r = u.role;
      if (r === "S") {
        SG.face = true;
        SG.cap[0] = u.partial ? u.subs[0].jp : u.jp;
        drawChar(!SG.body);
      } else if (r === "V") {
        SG.body = verbKind(sen, u);
        SG.cap[1] = u.jp;
        drawChar(true);
      } else if (r === "P") {
        const pk = placeKind(sen, u);
        $("stage").className = "stage bg-" + pk;
        $("sgPlace").innerHTML = artHTML(ART.place[pk]);
        $("sgSign").textContent = "\u{1F4CD}" + u.jp;
        fly("\u{1F4CD}" + u.jp, "rP");
        popIn($("sgPlace"), true);
        popIn($("sgSign"));
      } else if (r === "T") {
        const night = sen.words.slice(u.s, u.e + 1).map(bare).some((w) => /night|evening|dinner/.test(w));
        $("sgTime").innerHTML = `<span class="ic">${artHTML(night ? ART.moon : ART.sun)}</span>${esc2(u.jp)}`;
        fly((night ? "\u{1F319}" : "\u2600\uFE0F") + u.jp, "rT");
        popIn($("sgTime"));
      } else {
        const sp = document.createElement("span");
        sp.className = "r" + r;
        sp.textContent = `${RN2[r][0]}\uFF1A${u.jp || u.text}`;
        $("sgObj").append(sp);
        fly(sp.textContent, "r" + r);
        popIn(sp);
      }
    });
  }
  function drawChar(anim) {
    const who = S.sens[S.seq[SG.k]].who, a = $("sgArt");
    if (SG.body) {
      a.innerHTML = artHTML(ART[SG.body][who]);
      a.className = "sgArt body";
      $("sgFace").innerHTML = SG.face ? artHTML(ART.face[who]) : "";
    } else if (SG.face) {
      a.innerHTML = artHTML(ART.face[who]);
      a.className = "sgArt";
    }
    $("sgCap").textContent = SG.cap.filter(Boolean).join(" ");
    if (anim) popIn(a, true);
  }
  function stageDone() {
    const d = $("sgDone");
    d.animate(reduce2 ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { opacity: 0 }] : [{ opacity: 0, transform: "translate(-50%,-50%) scale(.5)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.15)", offset: 0.2 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 }, { opacity: 0 }], { duration: 1400 });
  }
  function ask(msg, yes = "OK", no = "\u3084\u3081\u308B") {
    return new Promise((res) => {
      const box = $("askBox");
      $("askMsg").textContent = msg;
      $("askYes").textContent = yes;
      $("askNo").textContent = no || "";
      $("askNo").hidden = !no;
      box.hidden = false;
      const done = (v) => {
        box.hidden = true;
        $("askYes").onclick = $("askNo").onclick = null;
        res(v);
      };
      $("askYes").onclick = () => done(true);
      $("askNo").onclick = () => done(false);
    });
  }
  var tell = (msg) => ask(msg, "OK", null);
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    ENV.root.append(el);
    el.animate([{ opacity: 0, transform: "translate(-50%,-10px)" }, { opacity: 1, transform: "translate(-50%,0)", offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2e3, easing: "ease-out" }).onfinish = () => el.remove();
  }
  var LV = [
    null,
    { g: "\u5165\u9580\uFF08\u5C0F\u5B66\u6821\u4F4E\u301C\u4E2D\u5B66\u5E74\uFF09", e: "\u5165\u9580", t: "", c: "Pre-A1" },
    { g: "\u5C0F\u5B66\u6821\u9AD8\u5B66\u5E74", e: "5\u7D1A\u306E\u624B\u524D", t: "", c: "Pre-A1" },
    { g: "\u4E2D1", e: "5\u7D1A", t: "", c: "Pre-A1" },
    { g: "\u4E2D2", e: "4\u7D1A", t: "", c: "A1" },
    { g: "\u4E2D3", e: "3\u7D1A", t: "120\u301C220", c: "A1" },
    { g: "\u9AD81\u301C2", e: "\u6E962\u7D1A", t: "225\u301C495", c: "A2" },
    { g: "\u9AD83\u30FB\u5171\u901A\u30C6\u30B9\u30C8", e: "2\u7D1A", t: "500\u301C780", c: "B1" },
    { g: "\u96E3\u95A2\u5927", e: "\u6E961\u7D1A", t: "785\u301C940", c: "B2" },
    { g: "\u5927\u5B66\u30FB\u4E0A\u7D1A", e: "1\u7D1A", t: "945\u301C", c: "C1" },
    { g: "\u305D\u308C\u4EE5\u4E0A\uFF08\u30CD\u30A4\u30C6\u30A3\u30D6\u4E26\u307F\uFF09", e: "1\u7D1A\u4EE5\u4E0A", t: "\u6E80\u70B9\u57DF", c: "C2" }
  ];
  var LVSYS = { grade: "\u5B66\u5E74", eiken: "\u82F1\u691C", toeic: "TOEIC", cefr: "CEFR" };
  function lvLabel(n, sys) {
    if (!n) return "\u672A\u8A2D\u5B9A\uFF08\u5168\u30EC\u30D9\u30EB\uFF09";
    const L = LV[n];
    sys = sys || settings.lvSys || "grade";
    const v = sys === "eiken" ? `\u82F1\u691C${L.e}` : sys === "toeic" ? L.t ? `TOEIC ${L.t}` : `TOEIC\u5BFE\u8C61\u5916\uFF08${L.g}\uFF09` : sys === "cefr" ? `CEFR ${L.c}` : L.g;
    return `Lv${n} ${v}`;
  }
  var LVGROUP = { all: ["\u3059\u3079\u3066", 1, 10], rec: ["\u304A\u3059\u3059\u3081\u3060\u3051", 0, 0], ele: ["\u5C0F\u5B66\u751F", 1, 2], jh: ["\u4E2D\u5B66", 3, 5], hs: ["\u9AD8\u6821", 6, 7], univ: ["\u5927\u5B66\u4EE5\u4E0A", 8, 10] };
  function isRec(lv) {
    const m = +settings.myLevel || 0;
    return !lv || !m || Math.abs(lv - m) <= 1;
  }
  function baseForm(w) {
    w = w.toLowerCase().replace(/[^a-z']/g, "").replace(/'s$/, "");
    if (COMMON.has(w)) return w;
    for (const [a, b] of [["ies", "y"], ["ied", "y"], ["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["ing", ""], ["ing", "e"], ["er", ""], ["est", ""], ["ly", ""]])
      if (w.endsWith(a) && COMMON.has(w.slice(0, -a.length) + b)) return w.slice(0, -a.length) + b;
    return w;
  }
  function estimateLevel(sents) {
    const all = sents.flatMap((s) => s.words);
    if (!all.length) return null;
    const avg = all.length / sents.length;
    const cont = all.filter((w) => /^[a-z]/.test(w) && /[a-z]/.test(w));
    const rare = cont.filter((w) => {
      const b = baseForm(w);
      return b.length > 2 && !COMMON.has(b);
    }).length / Math.max(1, cont.length);
    const sc = 0.8 + Math.max(0, avg - 3) * 0.32 + rare * 10;
    return Math.max(1, Math.min(10, Math.round(sc)));
  }
  function adaptLevel(ratio, lv) {
    if (settings.lvAuto === false || !settings.myLevel) return "";
    const m = +settings.myLevel;
    settings.lvUp = settings.lvUp || 0;
    settings.lvDown = settings.lvDown || 0;
    if (ratio >= 0.9 && (!lv || lv >= m)) {
      settings.lvUp++;
      settings.lvDown = 0;
    } else if (ratio < 0.5) {
      settings.lvDown++;
      settings.lvUp = 0;
    } else {
      settings.lvUp = 0;
      settings.lvDown = 0;
    }
    let msg = "";
    if (settings.lvUp >= 2 && m < 10) {
      settings.myLevel = m + 1;
      settings.lvUp = 0;
      msg = `\u30EC\u30D9\u30EB\u30A2\u30C3\u30D7\uFF01\u304A\u3059\u3059\u3081\u3092 ${lvLabel(m + 1)} \u306B\u3057\u307E\u3057\u305F`;
    }
    if (settings.lvDown >= 2 && m > 1) {
      settings.myLevel = m - 1;
      settings.lvDown = 0;
      msg = `\u304A\u3059\u3059\u3081\u3092 ${lvLabel(m - 1)} \u306B\u3057\u307E\u3057\u305F`;
    }
    saveSettings();
    return msg;
  }
  var S = null;
  var total = 0;
  var runId = 0;
  var stageN = { one: 0, cont: 0 };
  function shuffle(a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  var TIER_LV = { "\u57FA\u672C\u306E\u9806\u756A": 3, "\u52D5\u8A5E\u306E\u307E\u3068\u307E\u308A": 4, "\u719F\u8A9E\u306E\u307E\u3068\u307E\u308A": 4, "\u9577\u3044\u4E3B\u8A9E\u30FB\u7BC0": 5 };
  var RECENTKEY = "ccs-recent";
  var RECENT_MAX = 80;
  function loadRecent() {
    try {
      return JSON.parse(LS.getItem(RECENTKEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function addRecent(keys) {
    try {
      const r = loadRecent().filter((k) => !keys.includes(k)).concat(keys).slice(-RECENT_MAX);
      LS.setItem(RECENTKEY, JSON.stringify(r));
    } catch (e) {
    }
  }
  function randTarget() {
    const p = settings.randLv || "auto";
    if (p === "all") return { target: 0 };
    if (p === "auto") return +settings.myLevel ? { target: +settings.myLevel, near: true } : { target: 0 };
    return { target: +p };
  }
  function randLabel() {
    const { target, near } = randTarget();
    if (!target) return "\u3059\u3079\u3066\u306E\u30EC\u30D9\u30EB";
    return near ? `${lvLabel(target)} \u306E\u524D\u5F8C` : lvLabel(target);
  }
  function byLevel(items, lvOf) {
    const { target, near } = randTarget();
    if (!target) return items;
    const within = (d) => items.filter((it) => {
      const l = lvOf(it);
      return !l || Math.abs(l - target) <= d;
    });
    const a = within(near ? 1 : 0);
    if (a.some((it) => lvOf(it))) return a;
    const b = within(1);
    if (b.some((it) => lvOf(it))) return b;
    return items;
  }
  function randomPool() {
    const seen = /* @__PURE__ */ new Set(), out = [];
    const push = (s, ja, lv) => {
      if (!seen.has(s)) {
        seen.add(s);
        out.push({ s, ja, lv });
      }
    };
    ONE_TIERS.forEach((t) => t.list.forEach(([s, ja]) => push(s, ja, TIER_LV[t.name] || null)));
    shortsAll().forEach((x) => push(x.s, x.ja, x.lv));
    return out;
  }
  function pickRandom(n) {
    const pool = byLevel(randomPool(), (x) => x.lv), recent = new Set(loadRecent());
    const fresh = shuffle(pool.filter((x) => !recent.has(x.s))), old = shuffle(pool.filter((x) => recent.has(x.s)));
    const pick = fresh.concat(old).slice(0, n);
    addRecent(pick.map((x) => x.s));
    return pick.map((x) => [x.s, x.ja]);
  }
  function buildStage(mode, n, same) {
    if (mode === "one") {
      const pick = same ? shuffle(same) : pickRandom(PER_STAGE);
      return { mode, n, title: `\u30E9\u30F3\u30C0\u30E0${n + 1}\uFF08${randLabel()}\uFF09`, short: `\u30E9\u30F3\u30C0\u30E0${n + 1}`, list: pick };
    }
    let st;
    if (same) st = STORIES.find((s) => s.list === same);
    else {
      const pool = byLevel(STORIES, (s) => LVO[s.id] ?? s.level), cand = pool.filter((s) => s.id !== settings.lastStory);
      st = (cand.length ? cand : pool)[Math.floor(Math.random() * (cand.length ? cand : pool).length)];
      settings.lastStory = st.id;
      saveSettings();
    }
    return { mode, n, title: `\u304A\u8A71\u300C${st.title}\u300D`, short: `\u304A\u8A71${n + 1}`, list: st.list };
  }
  function loadStage(mode, n, same, autoStart) {
    const info = buildStage(mode, n, same);
    S = { ...info, sens: info.list.map(([en, ja]) => parseSentence2(en, ja)), si: 0, results: [], phase: "ready", gained: 0, paused: false, timer: null, elapsed: 0, sentStart: 0 };
    $("stageText").textContent = info.short;
    $("hist").innerHTML = "";
    $("line").innerHTML = "";
    setupSeq();
    updateProg();
    renderPreview();
    renderLane(true);
    applyAdvanceUI();
    if (autoStart) countdown(++runId);
    else showStart(++runId);
  }
  function setupSeq() {
    const seq = S.mode === "one" ? [S.si] : S.sens.map((_, i) => i);
    S.seq = seq;
    S.flat = [];
    S.starts = [];
    seq.forEach((si, k) => {
      S.starts.push(S.flat.length);
      S.sens[si].words.forEach((t, li) => S.flat.push({ t, k, li, si }));
    });
    S.passed = 0;
    S.combo = 0;
    S.cuts = /* @__PURE__ */ new Map();
    S.lastCut = -1;
    S.finishing = false;
    S.queuedCut = false;
    S.lastStepAt = 0;
    S.nextStepAt = 0;
    S.chunks = seq.map(() => []);
    S.closed = seq.map(() => false);
    S.openK = 0;
    stageReset(0);
  }
  var endOf = (k) => k + 1 < S.starts.length ? S.starts[k + 1] - 1 : S.flat.length - 1;
  function updateProg() {
    const n = S.sens.length, i = S.mode === "one" ? S.si : S.openK;
    $("progText").textContent = S.timed ? `${i + 1}\u6587\u76EE` : `${Math.min(i + 1, n)}/${n}`;
  }
  function addScore(n) {
    S.gained += n;
    total += n;
    $("score").textContent = total;
  }
  function renderPreview() {
    const pv = $("preview");
    const nx = S.mode === "one" && S.phase !== "ready" ? S.sens[S.si + 1] : null;
    pv.innerHTML = nx ? `<div class="pvStrip" style="left:${lineX() + 2}px">${nx.words.map((w) => `<span class="w">${esc2(w)}</span>`).join("")}</div>` : "";
  }
  function showStart(run) {
    $("startTitle").textContent = S.mode === "one" ? `${S.title}\uFF08${S.sens.length}\u6587\uFF09` : S.title;
    $("startNote").innerHTML = S.mode === "one" ? "\u82F1\u6587\u304C\u53F3\u304B\u30891\u8A9E\u305A\u3064\u6D41\u308C\u3066\u304F\u308B\u3002<br>\u610F\u5473\u306E\u307E\u3068\u307E\u308A\u3060\u3068\u601D\u3063\u305F\u3089\u300C\u30C1\u30E3\u30F3\u30AF\uFF01\u300D\u3002<br>\u6587\u306E\u7D42\u308F\u308A\uFF08\u25A0\u306E\u624B\u524D\uFF09\u3082\u30C1\u30E3\u30F3\u30AF\uFF01" : `${S.sens.length}\u6587\u306E\u304A\u8A71\u304C\u6B62\u307E\u3089\u305A\u306B\u6D41\u308C\u3066\u304F\u308B\u3002<br>\u6587\u306E\u7D42\u308F\u308A\uFF08\u25A0\u306E\u624B\u524D\uFF09\u3082\u5FC5\u305A\u533A\u5207\u308B\u3002`;
    $("startNote").innerHTML += `<br><small>${manual() ? "\u81EA\u5206\u3067\u9001\u308B\uFF08\u25B6\u3067\u9032\u3080\uFF09" : `\u901F\u3055 ${settings.speed}\u300C${SPEED_NAME[settings.speed]}\u300D`}\u30FB\u6587\u5B57 ${FONT_NAME[settings.font]}\uFF08\u53F3\u4E0A\u306E\u8A2D\u5B9A\u3067\u5909\u66F4\uFF09</small>`;
    $("startBox").hidden = false;
    $("startBtn").onclick = () => {
      $("startBox").hidden = true;
      primeSpeech();
      unlockAudio();
      countdown(run);
    };
  }
  async function runCount(run, seq, quick) {
    const c = $("count");
    c.classList.toggle("quick", !!quick);
    c.hidden = false;
    for (const [t, cls, ms] of seq) {
      if (run !== runId) {
        c.hidden = true;
        return false;
      }
      c.innerHTML = `<span class="${cls}" style="animation-duration:${ms}ms">${t}</span>`;
      await wait(ms);
    }
    c.hidden = true;
    return run === runId;
  }
  async function countdown(run) {
    readSentence(0);
    if (!await runCount(run, [["Ready...", "small", 1200], ["3", "", 850], ["2", "", 850], ["1", "", 850], ["GO!", "go", 650]])) return;
    sfx("voice/chunk");
    S.phase = "play";
    renderPreview();
    step();
  }
  var KEEP_LEFT = 2;
  function lineX() {
    return Math.round($("laneWrap").clientWidth * 0.34);
  }
  function chunkAt(g) {
    const f = S.flat[g];
    if (!f) return null;
    return S.chunks[f.k].find((c) => f.li >= c.a && f.li <= c.b) || null;
  }
  function renderLane(noAnim) {
    const st = $("strip");
    if (!S.flat.length) {
      st.innerHTML = "";
      return;
    }
    st.innerHTML = S.flat.map((f, i) => {
      const ch = chunkAt(i);
      let cls = i < S.passed - KEEP_LEFT ? " gone" : i < S.passed ? " past" : i === S.passed ? " next" : "";
      if (ch && ch.roles && i < S.passed) cls += " r" + ch.roles[f.li - ch.a] + " done";
      if (S.mode === "cont" && f.li === S.sens[f.si].words.length - 1 && i < S.flat.length - 1) cls += " eos";
      const cm = S.cuts.get(i);
      const endMk = f.li === S.sens[f.si].words.length - 1 ? `<span class="endmk">\u25A0</span>` : "";
      return `<span class="w${cls}">${esc2(f.t)}</span>${cm ? `<span class="cutmark${cm === "forced" ? " forced" : ""}">\uFF5C</span>` : ""}${endMk}`;
    }).join("");
    const ws = st.querySelectorAll(".w");
    let gx;
    if (S.passed <= 0) gx = ws[0].offsetLeft - 4;
    else {
      const a = ws[Math.min(S.passed, ws.length) - 1], nx = a.nextElementSibling;
      const r = a.offsetLeft + a.offsetWidth;
      gx = nx ? nx.classList.contains("cutmark") ? nx.offsetLeft + nx.offsetWidth / 2 : (r + nx.offsetLeft) / 2 : r + 6;
    }
    st.classList.toggle("step", !noAnim);
    st.style.transform = `translate(${lineX() - gx}px,-50%)`;
    $("cutline").style.left = lineX() + "px";
    if (manual()) syncScrub();
    updateBackBtn();
  }
  var BACK_PENALTY_MS = 1e3;
  var sentHead = () => {
    const f = S.flat[Math.min(Math.max(S.passed - 1, 0), S.flat.length - 1)];
    return S.starts[f.k];
  };
  var canBack = () => !!(S && S.phase === "play" && !S.paused && manual() && S.passed > sentHead());
  function back(n) {
    if (!canBack()) return;
    const head = sentHead(), to = Math.max(head, S.passed - n);
    if (to >= S.passed) return;
    const moved = S.passed - to, k = S.flat[head].k, sen = S.sens[S.seq[k]], base = S.starts[k];
    const kept = [], removed = [];
    S.chunks[k].forEach((c) => (base + c.b < to ? kept : removed).push(c));
    removed.forEach((c) => addScore(-(c.gain != null ? c.gain : c.pts ?? PTS[c.kind])));
    if (removed.length) S.combo = removed[0].prevCombo || 0;
    S.chunks[k] = kept;
    [...S.cuts.keys()].forEach((i) => {
      if (i >= to && S.flat[i] && S.flat[i].k === k) S.cuts.delete(i);
    });
    S.lastCut = kept.length ? base + kept[kept.length - 1].b : base - 1;
    clearPop();
    $("rolePick").hidden = true;
    stageReset(k);
    kept.forEach((c) => {
      if (c.kind !== "miss" && c.kind !== "forgot") stageOnChunk(k, sen, c);
    });
    S.passed = to;
    if (S.timed) {
      S.elapsed += BACK_PENALTY_MS * moved;
      toast(`\u3082\u3069\u308B \u2212${moved}\u79D2`);
    }
    renderLane(true);
    renderLine();
  }
  function updateBackBtn() {
    const b = $("backBtn");
    if (!b) return;
    b.disabled = !canBack();
    b.setAttribute("aria-label", "1\u8A9E\u3082\u3069\u308B\uFF08\u3053\u306E\u6587\u306E\u982D\u307E\u3067\u623B\u308C\u308B\uFF09");
  }
  function blockHTML(sen, c) {
    const words = sen.words.slice(c.a, c.b + 1).map((w, i) => `<span class="w${c.roles ? " r" + c.roles[i] : ""}">${esc2(w)}</span>`).join(" ");
    const lab = labelText(c), nt = noteText(c);
    return `<span class="blk k-${c.kind}"><span class="bw"><span class="mk k-${c.kind}">${RANK[c.kind][1]}</span>${words}</span>` + (lab ? `<span class="bl">${esc2(lab)}${nt ? `<br>${esc2(nt)}` : ""}</span>` : "") + (c.jp && c.kind !== "miss" && c.kind !== "forgot" ? `<span class="bj">${esc2(c.jp)}</span>` : "") + `</span>`;
  }
  function renderLine() {
    const k = S.openK;
    if (k >= S.seq.length) {
      $("line").innerHTML = "";
      return;
    }
    const sen = S.sens[S.seq[k]], outEnd = S.passed - KEEP_LEFT - 1;
    let html = S.chunks[k].map((c) => blockHTML(sen, c)).join("");
    const from = S.lastCut + 1, to = Math.min(outEnd, endOf(k));
    if (to >= from) html += `<span class="pend">${S.flat.slice(from, to + 1).map((f) => esc2(f.t)).join(" ")}</span>`;
    $("line").innerHTML = html;
  }
  var late = () => Math.min(260, SPEED[settings.speed] * 0.35);
  var early = () => Math.min(160, SPEED[settings.speed] * 0.2);
  var RANKV = { miss: 0, forgot: 0, cross: 1, good: 1, mini: 2, great: 3, excellent: 3 };
  function gapRank(gb) {
    const ga = S.lastCut + 1;
    if (gb < ga || gb >= S.flat.length) return -1;
    const fa = S.flat[ga], fb = S.flat[gb];
    if (fa.k !== fb.k) return -1;
    return RANKV[classify(S.sens[S.seq[fa.k]], fa.li, fb.li).kind];
  }
  var manual = () => settings.advance === "manual";
  function advance() {
    if (S.passed >= S.flat.length) return false;
    S.passed++;
    if (manual()) {
      S.lastStepAt = -1e9;
      S.nextStepAt = 1e12;
    } else {
      S.lastStepAt = performance.now();
      S.nextStepAt = S.lastStepAt + SPEED[settings.speed];
    }
    const f = S.flat[S.passed - 1];
    if (S.mode === "cont" && f.k > 0 && f.li === 0 && !S.closed[f.k - 1]) {
      const kk = f.k - 1, s0 = S;
      if (manual()) forceClose(kk);
      else setTimeout(() => {
        if (S === s0 && !S.closed[kk]) {
          forceClose(kk);
          renderLane();
          renderLine();
        }
      }, late());
    }
    return true;
  }
  function step() {
    clearTimeout(S.timer);
    if (S.phase !== "play" || S.paused || manual()) return;
    if (advance()) {
      renderLane();
      renderLine();
      tick();
      if (S.queuedCut) {
        S.queuedCut = false;
        cut();
      }
      S.timer = setTimeout(step, SPEED[settings.speed]);
    } else finishSeq();
  }
  function fwd(n) {
    if (!S || S.phase !== "play" || S.paused || !manual()) return;
    $("rolePick").hidden = true;
    if (S.passed >= S.flat.length) {
      finishSeq();
      return;
    }
    let moved = false;
    for (let i = 0; i < n && S.passed < S.flat.length; i++) moved = advance() || moved;
    if (moved) {
      renderLane(n > 1);
      renderLine();
      tick();
    }
  }
  function syncScrub() {
    const sc = $("scrub");
    if (!S) return;
    sc.max = S.flat.length;
    sc.value = S.passed;
  }
  function setCutLabel() {
    const game = !(S && S.studyMode);
    const b = $("cutBtn");
    if (b && b.childNodes[0]) b.childNodes[0].nodeValue = game ? "\u30C1\u30E3\u30F3\u30AF\uFF01" : "\u533A\u5207\u308B";
    $("cutline").dataset.lbl = game ? "\u3053\u3053\u3067\u30C1\u30E3\u30F3\u30AF" : "\u3053\u3053\u3067\u533A\u5207\u308B";
  }
  function applyAdvanceUI() {
    setCutLabel();
    const m = manual();
    $("navBtns").hidden = !m;
    $("scrub").hidden = !m;
    $("timeText").hidden = !m;
    const g = !(S && S.studyMode);
    $("cutHint").textContent = m ? g ? "\u25B6\u3067\u9032\u3080\u3002\u3053\u3053\u304B\u3089\u4E0B\u306E\u3069\u3053\u3092\u30BF\u30C3\u30D7\u3057\u3066\u3082\u30C1\u30E3\u30F3\u30AF\uFF01" : "\u25B6\u3067\u9032\u3080\u3002\u3053\u3053\u304B\u3089\u4E0B\u306E\u3069\u3053\u3067\u3082\u533A\u5207\u308C\u308B" : g ? "\u3053\u3053\u304B\u3089\u4E0B\u306A\u3089\u3001\u3069\u3053\u3092\u30BF\u30C3\u30D7\u3057\u3066\u3082\u30C1\u30E3\u30F3\u30AF\uFF01" : "\u3053\u3053\u304B\u3089\u4E0B\u306A\u3089\u3001\u3069\u3053\u3092\u30BF\u30C3\u30D7\u3057\u3066\u3082\u533A\u5207\u308C\u308B";
  }
  function cut() {
    if (!S || S.phase !== "play" || S.paused) return;
    $("rolePick").hidden = true;
    let w = S.passed - 1;
    const now = performance.now();
    if (w < 0) return;
    const done = S.cuts.has(w) || w <= S.lastCut, rw = done ? -1 : gapRank(w);
    if (S.nextStepAt - now < early() && S.passed < S.flat.length && gapRank(w + 1) > rw) {
      S.queuedCut = true;
      return;
    }
    if (done) return;
    if (now - S.lastStepAt < late() && w - 1 > S.lastCut && gapRank(w - 1) > rw) w--;
    S.cuts.set(w, "cut");
    const lw = $("laneWrap");
    lw.classList.remove("flash");
    void lw.offsetWidth;
    lw.classList.add("flash");
    judgeChunk(S.lastCut + 1, w);
    const f = S.flat[w];
    if (w === endOf(f.k)) closeSentence(f.k);
    renderLane();
    renderLine();
    if (w === S.flat.length - 1) {
      clearTimeout(S.timer);
      finishSeq();
    }
  }
  function judgeChunk(ga, gb, forced) {
    const f = S.flat[ga], k = f.k, sen = S.sens[S.seq[k]];
    let c = classify(sen, f.li, S.flat[gb].li);
    if (forced) c = { ...c, kind: "forgot", roles: null };
    c = { ...c, a: f.li, b: S.flat[gb].li, prevCombo: S.combo || 0 };
    S.chunks[k].push(c);
    S.lastCut = gb;
    const base = c.pts ?? PTS[c.kind];
    if (c.kind === "excellent" || c.kind === "great") S.combo = (S.combo || 0) + 1;
    else if (c.kind === "miss" || c.kind === "forgot") S.combo = 0;
    const mult = c.kind === "excellent" || c.kind === "great" ? Math.min(1.5, 1 + 0.1 * Math.floor((S.combo || 0) / 3)) : 1;
    c.base = base;
    c.gain = Math.round(base * mult);
    c.combo = S.combo || 0;
    c.mult = mult;
    if ((c.kind === "excellent" || c.kind === "great") && c.combo > 0 && c.combo % 3 === 0) setTimeout(() => sfx(c.combo >= 9 ? "voice/wow" : "voice/combo"), 90);
    S.chunks[k][S.chunks[k].length - 1] = c;
    addScore(c.gain);
    hitSound(c.kind);
    if (c.kind === "mini") {
      const pv = { "\u52D5\u8A5E\uFF01": "voice/verb", "\u540D\u8A5E\uFF01": "voice/noun", "\u526F\u8A5E\uFF01": "voice/adverb" }[c.gram];
      sfx(pv || "voice/yes");
    }
    stageOnChunk(k, sen, c);
    showPop(c);
    burst(c);
    document.dispatchEvent(new CustomEvent("cc:judge", { detail: { kind: c.kind, roles: c.roles } }));
    if (S.roleMode && !forced) askRole(c);
    return c;
  }
  function forceClose(k) {
    const e = endOf(k);
    if (S.lastCut < e) {
      judgeChunk(S.lastCut + 1, e, true);
      S.cuts.set(e, "forced");
    }
    closeSentence(k);
  }
  var KIND_COLOR = { excellent: "#5fd49a", great: "#7cc4ff", good: "#ffd166", cross: "#e0b3ff", mini: "#c3cfdf", miss: "#ff6b6b", forgot: "#ff6b6b" };
  var ROLE_COLOR = { S: "#7cc4ff", V: "#ff8f8f", O: "#8ee6a8", I: "#6fe0d8", C: "#ffb870", P: "#d6a8ff", T: "#ffd166", M: "#e6ecf5", R: "#e6ecf5", F: "#e6ecf5", X: "#9fb0c6" };
  function burst(c) {
    const wrap = $("laneWrap"), x = lineX(), col = KIND_COLOR[c.kind];
    const ring = document.createElement("span");
    ring.className = "ring";
    ring.style.left = x + "px";
    ring.style.borderColor = col;
    wrap.append(ring);
    ring.animate(reduce2 ? [{ opacity: 0.9 }, { opacity: 0 }] : [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0.95 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], { duration: reduce2 ? 300 : 450, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => ring.remove();
    if (reduce2 || c.kind === "miss" || c.kind === "forgot") return;
    const cols = c.roles ? [...new Set(c.roles)].map((r) => ROLE_COLOR[r]) : [col];
    const n = c.kind === "mini" ? 4 : c.kind === "excellent" ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const d = document.createElement("span");
      d.className = "spark";
      d.style.left = x + "px";
      d.style.background = cols[i % cols.length];
      wrap.append(d);
      const ang = Math.PI * 2 * i / n + Math.random() * 0.5, dist = 30 + Math.random() * 26;
      d.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px),calc(-50% + ${Math.sin(ang) * dist}px)) scale(.3)`, opacity: 0 }], { duration: 480 + Math.random() * 120, easing: "cubic-bezier(.1,.7,.3,1)" }).onfinish = () => d.remove();
    }
  }
  var popEl = null;
  function showPop(c) {
    if (popEl) popEl.remove();
    const r = $("laneWrap").getBoundingClientRect();
    const el = document.createElement("div");
    el.className = `pop k-${c.kind}`;
    const lab = labelText(c), nt = noteText(c);
    const title = c.title || (c.kind === "mini" ? settings.disp === "gram" ? c.gram : "\u3061\u3044\u3055\u3044\u30C1\u30E3\u30F3\u30AF" : RANK[c.kind][0]);
    const showJp = c.kind !== "miss" && c.kind !== "forgot";
    el.innerHTML = `<b>${esc2(title)}</b>` + ((c.kind !== "mini" || settings.disp !== "gram") && c.kind !== "forgot" && lab ? `<span class="pl">${esc2(lab)}</span>` : "") + (nt ? `<span class="pl2">${esc2(nt)}</span>` : "") + (showJp && c.jp ? `<span class="pj">${esc2(c.jp)}</span>` : "") + (c.title ? "" : `<span class="pc">+${c.gain != null ? c.gain : c.pts ?? PTS[c.kind]}${c.mult > 1 ? ` \xD7${c.mult.toFixed(1)}` : ""}</span>`) + (c.combo >= 3 && (c.kind === "excellent" || c.kind === "great") ? `<span class="pl2">COMBO ${c.combo}</span>` : "");
    const x = Math.min(Math.max(r.left + lineX(), r.left + 110), r.right - 110);
    el.style.left = x + "px";
    el.style.bottom = innerHeight - r.top + 8 + "px";
    ENV.root.append(el);
    popEl = el;
    setTimeout(() => {
      el.remove();
      if (popEl === el) popEl = null;
    }, 1500);
  }
  function closeSentence(k) {
    if (S.closed[k]) return;
    S.closed[k] = true;
    const sen = S.sens[S.seq[k]], chunks = S.chunks[k], bonus = [];
    sen.units.forEach((u) => {
      if (!"SVO".includes(u.role)) return;
      if (chunks.some((c) => c.a === u.s && c.b === u.e && c.kind !== "forgot")) bonus.push({ role: u.role, name: { S: "\u4E3B\u8A9E", V: "\u52D5\u8A5E", O: "\u76EE\u7684\u8A9E" }[u.role] + "\u30DC\u30FC\u30CA\u30B9" });
    });
    const perfect = chunks.every((c) => c.kind !== "miss" && c.kind !== "forgot" && c.kind !== "good" && c.kind !== "cross");
    let time = null, tb = 0;
    if (manual() && !S.timed) {
      time = (S.elapsed - S.sentStart) / 1e3;
      S.sentStart = S.elapsed;
      tb = Math.max(0, Math.round((sen.words.length * 1.2 - time) * 20));
    }
    const extra = bonus.length * BONUS + (perfect ? chunks.reduce((a, c) => a + (c.base != null ? c.base : c.pts ?? PTS[c.kind]), 0) : 0) + tb;
    if (extra) addScore(extra);
    const pts = chunks.reduce((a, c) => a + (c.gain != null ? c.gain : c.pts ?? PTS[c.kind]), 0) + extra;
    const r = { chunks: [...chunks], bonus, pts, perfect, time, tb };
    S.results[S.seq[k]] = r;
    {
      setTimeout(() => sfx(perfect ? "voice/perfect" : "se/sentence_clear"), 260);
      if (perfect) setTimeout(() => sfx("voice/wow"), 1250);
      if (bonus.length) setTimeout(() => sfx("se/bonus"), 560);
    }
    if (perfect) stageDone();
    if (S.phase === "play") {
      const nx = S.mode === "one" ? S.sens[S.si + 1] : S.sens[S.seq[k + 1]];
      if (nx) readTextAloud(nx.words.join(" "));
    }
    document.dispatchEvent(new CustomEvent("cc:sentence", { detail: { perfect, pts } }));
    const html = judgedHTML(sen, r);
    if (S.mode === "cont") {
      pushHist(html);
      S.openK = k + 1;
      updateProg();
    }
    return html;
  }
  function judgedHTML(sen, r) {
    return r.chunks.map((c) => `<span class="mk k-${c.kind}">${RANK[c.kind][1]}</span>` + sen.words.slice(c.a, c.b + 1).map((w, i) => `<span class="w${c.roles ? " r" + c.roles[i] : ""}">${esc2(w)}</span>`).join(" ")).join('<span class="cutmark">\uFF5C</span>') + `<span class="pts">+${r.pts}${r.perfect ? " PERFECT" : ""}</span>` + (r.bonus.length || r.time != null ? "<br>" : "") + r.bonus.map((b) => `<span class="bonus r${b.role}">${b.name} +${BONUS}</span>`).join("") + (r.time != null ? `<span class="tBonus">\u23F1 ${r.time.toFixed(1)}\u79D2${r.tb ? ` \u30BF\u30A4\u30E0\u30DC\u30FC\u30CA\u30B9 +${r.tb}` : ""}</span>` : "");
  }
  function pushHist(html) {
    const h = document.createElement("div");
    h.className = "hist newest";
    h.innerHTML = html;
    [...$("hist").children].forEach((c) => c.classList.remove("newest"));
    $("hist").append(h);
    h.animate(reduce2 ? [{ opacity: 0 }, { opacity: 0.85 }] : [{ transform: "translateY(30px)", opacity: 0 }, { transform: "none", opacity: 0.85 }], { duration: 400, easing: "ease-out" });
    while ($("hist").children.length > 2) $("hist").firstChild.remove();
  }
  async function finishSeq() {
    if (S.finishing) return;
    S.finishing = true;
    const run = runId, s0 = S;
    const last = S.flat.length - 1, k = S.flat[last].k;
    if (S.lastCut < last && !manual()) {
      await wait(late());
      if (run !== runId || S !== s0) return;
    }
    S.phase = "judge";
    if (S.lastCut < last) {
      judgeChunk(S.lastCut + 1, last, true);
      S.cuts.set(last, "forced");
      renderLane();
    }
    closeSentence(k);
    if (!manual()) {
      await wait(500);
      if (run !== runId) return;
    }
    if (S.mode === "cont") {
      $("strip").innerHTML = "";
      $("line").innerHTML = "";
      await wait(1300);
      if (run !== runId) return;
      S.phase = "done";
      review();
      return;
    }
    const html = judgedHTML(S.sens[S.seq[k]], S.results[S.seq[k]]);
    if (manual()) {
      pushHist(html);
      $("line").innerHTML = "";
      S.si++;
      if (S.si >= S.sens.length) {
        S.phase = "done";
        if (S.timed) timedEnd();
        else setTimeout(review, 300);
        return;
      }
      setupSeq();
      updateProg();
      renderPreview();
      renderLane(true);
      S.phase = "play";
      return;
    }
    $("strip").innerHTML = "";
    $("line").innerHTML = `<div class="judgedLine">${html}</div>`;
    await wait(2e3);
    if (run !== runId) return;
    pushHist(html);
    $("line").innerHTML = "";
    S.si++;
    if (S.si >= S.sens.length) {
      S.phase = "done";
      setTimeout(review, 400);
      return;
    }
    setupSeq();
    updateProg();
    renderPreview();
    renderLane(true);
    if (!await runCount(run, [["3", "", 620], ["2", "", 620], ["1", "", 620], ["GO!", "go", 480]], true)) return;
    S.phase = "play";
    renderPreview();
    step();
  }
  function legendHTML() {
    return `<div class="legend">${"SVOICPTM".split("").map((r) => `<span class="r${r}">\u25A0${RN2[r][0]}</span>`).join("")}<span class="rX">\u25A0\u8AAC\u660E</span></div>`;
  }
  function review() {
    sfx("voice/stage_clear");
    const all = S.results.flatMap((r) => r ? r.chunks : []), cnt = (k) => all.filter((c) => c.kind === k || k === "miss" && c.kind === "forgot").length;
    const refHTML = (sen) => `<div class="roles">${sen.units.map((u) => `<span class="rcell"><span class="rtx">${u.subs ? u.subs.map((p, pi) => `<span class="r${subIsX(u, pi) ? "X" : u.role}">${esc2(sen.words.slice(p.s, p.e + 1).join(" "))}</span>`).join(" ") : `<span class="r${u.role}">${esc2(u.text)}</span>`}</span><span class="rl r${u.role}">${RN2[u.role][settings.disp === "gram" ? 1 : 0]}</span></span>`).join('<span class="cutmark">\uFF5C</span>')}</div>`;
    openSheet(`<h2>${esc2(S.title)} \u30AF\u30EA\u30A2\uFF01</h2>
    ${S.roleMode && S.roleN ? `<div class="note">\u5F79\u5272\uFF1A${S.roleOk} / ${S.roleN} \u6B63\u89E3</div>` : ""}
    <div class="big">${S.gained} pt${manual() ? `<span style="font-size:16px;color:var(--muted);margin-left:10px">\u23F1 ${(S.elapsed / 1e3).toFixed(1)}\u79D2</span>` : ""}</div>
    <div class="stats">${[["excellent", "\u25CE"], ["great", "\u25EF"], ["good", "\u25B3"], ["cross", "\u25BD"], ["mini", "\u30FB"], ["miss", "\xD7"]].map(([k, m]) => `<div class="stat"><span class="mk k-${k}">${m}</span><b>${cnt(k)}</b></div>`).join("")}</div>
    ${legendHTML()}
    ${S.sens.map((sen, i) => {
      const r = S.results[i];
      if (!r) return "";
      return `<div class="rvw"><span class="lab">\u3042\u306A\u305F\u306E\u533A\u5207\u308A</span><div class="en">${judgedHTML(sen, r)}</div>
        <span class="lab">\u53C2\u8003\u306E\u533A\u5207\u308A</span>${refHTML(sen)}
        <div class="ja">${esc2(sen.ja)}</div>${canSpeak && settings.tts ? `<button class="say" data-i="${i}">\u533A\u5207\u308A\u3054\u3068\u306B\u805E\u304F</button>` : ""}</div>`;
    }).join("")}
    <div class="btns"><button class="ghost" id="toTitle2">\u30BF\u30A4\u30C8\u30EB\u3078</button><button class="ghost" id="againBtn">\u3082\u3046\u4E00\u5EA6</button><button class="primary" id="nextBtn">${S.mode === "one" ? "\u6B21\u306E6\u6587\u3078" : "\u6B21\u306E\u304A\u8A71\u3078"}</button></div>`, false);
    $("sheet").querySelectorAll(".say").forEach((b) => b.onclick = () => speakChunks(S.sens[+b.dataset.i].units.map((u) => u.text)));
    $("againBtn").onclick = () => {
      closeSheet();
      total -= S.gained;
      $("score").textContent = total;
      loadStage(S.mode, S.n, S.list);
    };
    $("toTitle2").onclick = showTitle;
    $("nextBtn").onclick = () => {
      closeSheet();
      stageN[S.mode] = S.n + 1;
      loadStage(S.mode, S.n + 1);
    };
  }
  var sheetClosable = true;
  function openSheet(html, closable = true) {
    if ($("modal").hidden) sfx("se/open");
    sheetClosable = closable;
    if (S) {
      S.paused = true;
      clearTimeout(S.timer);
    }
    $("sheet").innerHTML = html;
    $("modal").hidden = false;
  }
  function closeSheet() {
    if (!$("modal").hidden) sfx("se/close");
    $("modal").hidden = true;
    if (S) {
      S.paused = false;
      if (S.phase === "play") S.timer = setTimeout(step, SPEED[settings.speed]);
    }
  }
  var opt = (id, cur2, list) => `<select id="${id}">${list.map(([v, l]) => `<option value="${v}" ${v === cur2 ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  function settingRows() {
    return `
    <div class="row"><label for="optSpeed">\u5358\u8A9E\u304C\u5165\u3063\u3066\u304F\u308B\u901F\u3055\uFF08\u81EA\u52D5\u306E\u6642\uFF09</label>${opt("optSpeed", String(settings.speed), Object.keys(SPEED).map((k) => [k, `${k}\u3000${SPEED_NAME[k]}`]))}</div>
    <div class="row"><label for="optFont">\u6D41\u308C\u308B\u6587\u5B57\u306E\u5927\u304D\u3055</label>${opt("optFont", settings.font, Object.keys(FONT2).map((k) => [k, FONT_NAME[k]]))}</div>
    <div class="row"><label for="optDisp">\u30C1\u30E3\u30F3\u30AF\u306E\u8AAC\u660E</label>${opt("optDisp", settings.disp, [["easy", "\u304B\u3093\u305F\u3093\uFF08\u3059\u308B\uFF0B\u4F55\u3092\uFF09"], ["gram", "\u6587\u6CD5\uFF08\u52D5\u8A5E\uFF0B\u76EE\u7684\u8A9E\uFF09"], ["both", "\u4E21\u65B9"], ["none", "\u8272\u3060\u3051"]])}</div>
    <div class="row"><label for="optVoice">\u58F0\u30FB\u8AAD\u307F\u4E0A\u3052</label>${opt("optVoice", settings.sound === "both" || settings.sound === "voice" ? "on" : "off", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]])}</div>
    <div class="row"><label for="optSe">\u52B9\u679C\u97F3</label>${opt("optSe", settings.sound === "both" || settings.sound === "sfx" ? "on" : "off", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]])}</div>
    <div class="row"><label for="optBgm">BGM</label>${opt("optBgm", settings.bgm || "low", [["low", "\u5C0F\u3055\u3081"], ["mid", "\u3075\u3064\u3046"], ["off", "\u306A\u3057"]])}</div>
    <div class="row"><label for="optMute">\u97F3\u3092\u305C\u3093\u3076\u6D88\u3059\uFF08\u5DE6\u306F\u3057\u306E \u{1F3B5} \u3068\u540C\u3058\uFF09</label>${opt("optMute", settings.mute ? "on" : "off", [["off", "\u6D88\u3055\u306A\u3044"], ["on", "\u6D88\u3059"]])}</div>
    <div class="row"><label for="optGram">\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB\u306E\u6587\u6CD5\u7528\u8A9E\uFF08\u30AB\u30FC\u30C9\u306B\u5C0F\u3055\u304F\u4F75\u8A18\uFF09</label>${opt("optGram", settings.gram === false ? "off" : "on", [["on", "\u51FA\u3059"], ["off", "\u51FA\u3055\u306A\u3044"]])}</div>
    <div class="row"><label for="optMyRank">\u81EA\u5206\u306E\u30E9\u30F3\u30AF</label>${opt("optMyRank", String(settings.myLevel || 0), [["0", "\u672A\u767B\u9332"], ...LV.slice(1).map((_, i) => [String(i + 1), lvLabel(i + 1)])])}</div>
    <div class="row"><label for="optRandLv">\u30E9\u30F3\u30C0\u30E0\u3067\u51FA\u3059\u6587</label>${opt("optRandLv", settings.randLv || "auto", [["auto", "\u304A\u307E\u304B\u305B\uFF08\u81EA\u5206\u306E\u30E9\u30F3\u30AF\u306E\u524D\u5F8C\uFF09"], ["all", "\u3059\u3079\u3066\u306E\u30EC\u30D9\u30EB"], ...LV.slice(1).map((_, i) => [String(i + 1), lvLabel(i + 1) + " \u3060\u3051"])])}</div>
    <div class="row"><label for="optTts">\u632F\u308A\u8FD4\u308A\u306E\u8AAD\u307F\u4E0A\u3052</label>${opt("optTts", settings.tts ? "on" : "off", [["on", "\u30AA\u30F3"], ["off", "\u30AA\u30D5"]])}</div>`;
  }
  function bindSettingRows() {
    $("optMyRank").onchange = (e) => {
      settings.myLevel = +e.target.value;
      settings.lvUp = settings.lvDown = 0;
      saveSettings();
      updateLvHint();
    };
    $("optRandLv").onchange = (e) => {
      settings.randLv = e.target.value;
      saveSettings();
      updateLvHint();
    };
    $("optSpeed").onchange = (e) => {
      settings.speed = +e.target.value;
      saveSettings();
      applyVisual();
    };
    $("optFont").onchange = (e) => {
      settings.font = e.target.value;
      saveSettings();
      applyVisual();
      if (S) {
        renderLane(true);
        renderPreview();
      }
    };
    $("optDisp").onchange = (e) => {
      settings.disp = e.target.value;
      saveSettings();
      if (S) renderLine();
    };
    $("optTts").onchange = (e) => {
      settings.tts = e.target.value === "on";
      saveSettings();
    };
    $("optBgm").onchange = (e) => {
      settings.bgm = e.target.value;
      saveSettings();
      unlockAudio();
      bgmTick();
    };
    const sndSet = () => {
      const v = $("optVoice").value === "on", e = $("optSe").value === "on";
      settings.sound = v && e ? "both" : v ? "voice" : e ? "sfx" : "off";
      saveSettings();
      unlockAudio();
    };
    $("optVoice").onchange = () => {
      sndSet();
      hitSound("excellent");
    };
    $("optSe").onchange = () => {
      sndSet();
      sfx("se/sentence_clear");
    };
    $("optMute").onchange = (e) => {
      setMute(e.target.value === "on");
    };
    $("optGram").onchange = (e) => {
      settings.gram = e.target.value === "on";
      saveSettings();
      document.body.classList.toggle("nogram", settings.gram === false);
    };
  }
  function startPractice(t) {
    settings.advance = "manual";
    saveSettings();
    const list = t ? myToStory(t).list : pickRandom(PER_STAGE);
    loadStage("one", 4, list.length > PER_STAGE ? shuffle(list).slice(0, PER_STAGE) : list, true);
    S.title = t ? `Chunk Practice\u300C${t.title || "\u7121\u984C"}\u300D` : "Chunk Practice";
    S.short = "Practice";
    $("stageText").textContent = "Practice";
    S.roleMode = settings.roleAns !== false;
    S.studyMode = true;
    applyAdvanceUI();
  }
  function startShortPractice(items, title) {
    settings.advance = "manual";
    saveSettings();
    const list = shuffle(items).slice(0, PER_STAGE).map((x) => [x.s, x.ja]);
    loadStage("one", 4, list, true);
    S.title = `Chunk Practice\u300C${title}\u300D`;
    S.short = "Practice";
    $("stageText").textContent = "Practice";
    S.roleMode = settings.roleAns !== false;
    S.studyMode = true;
    applyAdvanceUI();
  }
  var lastTick = performance.now();
  var tickTimer = null;
  var RG = { S: "S", V: "V", O: "O", I: "O", C: "C", P: "P", T: "T", M: "M", R: "M", F: "M", X: "M" };
  var RGN = { S: "Subject", V: "Verb", O: "Object", C: "Complement", P: "Place", T: "Time", M: "Other" };
  function expectedRoles(c) {
    if (!c.roles) return null;
    if (c.kind === "good") return /* @__PURE__ */ new Set(["S", "V"]);
    if (c.roles[0] === "V") return /* @__PURE__ */ new Set(["V"]);
    if (c.roles.every((r) => "PTMRF".includes(r))) return new Set(c.roles.map((r) => RG[r]));
    return /* @__PURE__ */ new Set([RG[c.roles[0]]]);
  }
  function askRole(c) {
    const exp = expectedRoles(c);
    if (!exp) return;
    const el = $("rolePick"), r = $("laneWrap").getBoundingClientRect();
    el.innerHTML = Object.keys(RGN).map((k) => `<button data-r="${k}" class="r${k}">${RGN[k]}</button>`).join("");
    el.style.left = r.left + r.width / 2 + "px";
    el.style.top = r.bottom + 6 + "px";
    el.hidden = false;
    el.querySelectorAll("button").forEach((b) => {
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.onclick = () => {
        const ok = exp.has(b.dataset.r);
        S.roleN = (S.roleN || 0) + 1;
        if (ok) {
          S.roleOk = (S.roleOk || 0) + 1;
          addScore(50);
        }
        hitSound(ok ? "great" : "miss");
        el.hidden = true;
        showPop({ kind: ok ? "excellent" : "miss", easy: ok ? "\u5F79\u5272\u3082\u6B63\u89E3 +50" : `\u6B63\u89E3\uFF1A${[...exp].map((x) => RGN[x]).join(" / ")}`, gram: "", jp: "", roles: null, title: `${RGN[b.dataset.r]} ${ok ? "\u2713" : "\u2717"}` });
      };
    });
  }
  function init_engine() {
    applyVisual();
    $("tapZone").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlockAudio();
      cut();
    });
    onDoc("keydown", (e) => {
      const tg = e.target && e.target.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || e.target.isContentEditable) return;
      if (!$("edView").hidden) return;
      if (!$("modal").hidden || !$("startBox").hidden || !$("title").hidden) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        cut();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        fwd(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back(1);
      }
    });
    $("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal" && sheetClosable) closeSheet();
    });
    $("gear").onclick = () => {
      openSheet(`<h2>\u8A2D\u5B9A</h2>${settingRows()}
      ${legendHTML()}
      <p class="note">\u6210\u529F\u3057\u305F\u30C1\u30E3\u30F3\u30AF\uFF08\u25CE\u25EF\uFF09\u306F\u533A\u5207\u3063\u305F\u77AC\u9593\u306B\u82F1\u8A9E\u3067\u8AAD\u307F\u4E0A\u3052\u308B\u3002\u6B21\u3092\u533A\u5207\u308B\u3068\u524D\u306E\u8AAD\u307F\u4E0A\u3052\u306F\u6B62\u307E\u308B\u3002<br>\u25CE Excellent\uFF1D\u5F79\u5272\u306E\u307E\u3068\u307E\u308A\u3092\u3074\u3063\u305F\u308A\uFF0F\u25EF Great\uFF1D\u5927\u304D\u3044\u53E5\uFF08\u3059\u308B\uFF0B\u4F55\u3092 \u306A\u3069\uFF09\uFF0F\u25B3 Good\uFF1D\u4E3B\u8A9E\uFF0B\u52D5\u8A5E\u306ESV\u30C1\u30E3\u30F3\u30AF\uFF0F\u30FB\u3061\u3044\u3055\u3044\u30C1\u30E3\u30F3\u30AF\uFF1D1\u8A9E\u3084\u300C\u51A0\u8A5E\uFF0B\u540D\u8A5E\u300D\u3060\u3051\u306E\u5C0F\u3055\u3044\u307E\u3068\u307E\u308A\uFF08\u304B\u3093\u305F\u3093\u8868\u793A\u3067\u306F\u5F79\u5272\u3001\u6587\u6CD5\u8868\u793A\u3067\u306F\u54C1\u8A5E\u3092\u8868\u793A\uFF09\uFF0F\xD7\uFF1D\u307E\u3068\u307E\u308A\u306E\u9014\u4E2D\u3067\u5207\u3063\u305F<br>\u6587\u304C\u7D42\u308F\u308B\u3068\u3001\u4E3B\u8A9E\u30FB\u52D5\u8A5E\u30FB\u76EE\u7684\u8A9E\u3092\u3074\u3063\u305F\u308A\u5207\u308A\u51FA\u305B\u3066\u3044\u308C\u3070\u30DC\u30FC\u30CA\u30B9\u3002</p>
      <div class="btns"><button class="ghost" id="toTitle">\u30BF\u30A4\u30C8\u30EB\u3078</button><button class="ghost" id="restartBtn">\u6700\u521D\u304B\u3089</button><button class="primary" id="closeBtn">\u9589\u3058\u308B</button></div>`);
      bindSettingRows();
      $("toTitle").onclick = showTitle;
      $("closeBtn").onclick = closeSheet;
      $("restartBtn").onclick = () => {
        $("modal").hidden = true;
        total -= S.gained;
        $("score").textContent = total;
        clearTimeout(S.timer);
        loadStage(S.mode, S.n, S.list);
      };
    };
    ["navBtns", "scrub"].forEach((id) => $(id).addEventListener("pointerdown", (e) => e.stopPropagation()));
    $("fwdBtn").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fwd(1);
    });
    $("backBtn").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      back(1);
    });
    $("scrub").addEventListener("input", (e) => {
      if (!S || S.phase !== "play" || !manual()) {
        syncScrub();
        return;
      }
      const v = +e.target.value;
      if (v < S.passed && canBack()) {
        back(S.passed - v);
        e.target.value = S.passed;
        return;
      }
      if (v <= S.passed) {
        e.target.value = S.passed;
        return;
      }
      fwd(v - S.passed);
    });
    tickTimer = setInterval(() => {
      const now = performance.now(), dt = now - lastTick;
      lastTick = now;
      if (S && manual() && S.phase === "play" && !S.paused) {
        S.elapsed += dt;
        if (S.timed) {
          $("timeText").textContent = "\u6B8B\u308A " + Math.max(0, (S.timed.limit - S.elapsed) / 1e3).toFixed(1);
          {
            const rs = Math.ceil((S.timed.limit - S.elapsed) / 1e3);
            if (rs <= 5 && rs >= 1 && S.lastCount !== rs) {
              S.lastCount = rs;
              sfx("se/count5");
            }
          }
          if (S.elapsed >= S.timed.limit) timedEnd();
        } else $("timeText").textContent = "\u23F1 " + (S.elapsed / 1e3).toFixed(1);
      }
    }, 100);
    ENV.offs.push(() => clearInterval(tickTimer));
  }

  // games/chunkchunk/src/wallet.js
  function createWallet(store) {
    const KEY = "ccs-wallet", KINDS = ["coins", "gems"], MAXLOG = 60;
    const REASONS = {
      // 理由のコード（履歴に残す名前）。増やすときは earn:*、使うときは buy:* で始める
      "earn:login": "\u30ED\u30B0\u30A4\u30F3\u30DC\u30FC\u30CA\u30B9",
      "earn:minigame": "\u30DF\u30CB\u30B2\u30FC\u30E0",
      "earn:ad": "\u5E83\u544A\u3092\u898B\u305F",
      "earn:play": "\u904A\u3093\u3060\u3054\u307B\u3046\u3073",
      "buy:avatar": "\u30A2\u30D0\u30BF\u30FC",
      "buy:material": "\u6559\u6750",
      "buy:ai": "AI\u767B\u9332\uFF081\u56DE\uFF09",
      "buy:limited": "\u9650\u5B9A\u30A2\u30D0\u30BF\u30FC"
    };
    const listeners = [];
    let d = load2();
    function load2() {
      try {
        const x = store.get("wallet") || JSON.parse(localStorage.getItem(KEY) || "{}");
        return { coins: Math.max(0, Math.floor(+x.coins || 0)), gems: Math.max(0, Math.floor(+x.gems || 0)), log: Array.isArray(x.log) ? x.log.slice(-MAXLOG) : [], daily: String(x.daily || "") };
      } catch (e) {
        return { coins: 0, gems: 0, log: [], daily: "" };
      }
    }
    function save() {
      try {
        store.set("wallet", d);
      } catch (e) {
      }
      listeners.forEach((f) => {
        try {
          f(api);
        } catch (e) {
        }
      });
    }
    function rec(kind, n, reason) {
      d.log.push({ at: Date.now(), kind, n, reason: String(reason || ""), bal: d[kind] });
      if (d.log.length > MAXLOG) d.log = d.log.slice(-MAXLOG);
    }
    const api = {
      REASONS,
      coins: () => d.coins,
      gems: () => d.gems,
      balance: (k) => d[k] || 0,
      history: () => d.log.slice().reverse(),
      add(kind, n, reason) {
        n = Math.floor(+n);
        if (!KINDS.includes(kind) || !(n > 0)) return false;
        d[kind] += n;
        rec(kind, n, reason);
        save();
        return true;
      },
      can(kind, n) {
        return KINDS.includes(kind) && n > 0 && d[kind] >= n;
      },
      spend(kind, n, reason) {
        n = Math.floor(+n);
        if (!this.can(kind, n)) return false;
        d[kind] -= n;
        rec(kind, -n, reason);
        save();
        return true;
      },
      /* 1日1回のログインボーナス。いまは、どこからも呼んでいない（使うときに呼ぶ） */
      daily(coins = 10) {
        const t = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        if (d.daily === t) return false;
        d.daily = t;
        d.coins += coins;
        rec("coins", coins, "earn:login");
        save();
        return true;
      },
      onChange(f) {
        listeners.push(f);
      },
      fmt: (n) => Number(n).toLocaleString("en-US")
    };
    return api;
  }

  // games/chunkchunk/src/make.js
  function createMake(HOST) {
    const Wallet = HOST.Wallet;
    const MakeTut = (() => {
      const KEY = "ccs-make";
      const FACE2 = { \u666E\u901A: "normal", \u559C\u3076: "joy", \u9A5A\u304F: "surprise", \u843D\u3061\u8FBC\u3080: "sad", \u7126\u308B: "panic", \u8003\u3048\u308B: "think", \u3072\u3089\u3081\u304F: "idea" };
      const ROLE = { S: "\u4E3B\u5F79", V: "\u3069\u3046\u3057\u3066\u308B\uFF1F", C: "\u3069\u3093\u306A\u611F\u3058\uFF1F", O: "\u76F8\u624B", I: "\u8AB0\u306B", F: "\u524D\u3061\u3087\u3044\u8DB3\u3057", R: "\u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057", W: "\u5834\u9762" };
      const TARGETS = ["\u4E3B\u5F79", "\u3069\u3046\u3057\u3066\u308B\uFF1F", "\u76F8\u624B", "\u6587\u305C\u3093\u305F\u3044"];
      const TYPES = ["\u305F\u3060\u3059\u308B\u6587", "\u3060\u3088\uFF01\u6587", "\u4F55\u3059\u308B\u306E\uFF1F\u6587", "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587", "\u95A2\u4FC2\u3042\u308B\u3088\u6587"];
      const TYPE_SUB = { "\u305F\u3060\u3059\u308B\u6587": "\u3007\u3007\u304C\u3059\u308B\uFF01", "\u3060\u3088\uFF01\u6587": "\u3007\u3007\u306F\u301C\u3060\u3088\uFF01", "\u4F55\u3059\u308B\u306E\uFF1F\u6587": "\u3007\u3007\u304C\u3001\u4F55\u3092\u3059\u308B\uFF1F", "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587": "\u8AB0\u304B\u306B\u3001\u4F55\u304B\u3092\u6E21\u3059", "\u95A2\u4FC2\u3042\u308B\u3088\u6587": "\u76F8\u624B\u304C\u3001\u3069\u3046\u306A\u308B\uFF1F" };
      const isJp = (s) => /[぀-ヿ一-鿿]/.test(s);
      const tk = (s) => {
        const i = s.indexOf(":");
        let t = s.slice(i + 1), sub = "";
        const j = t.indexOf("|");
        if (j >= 0) {
          sub = t.slice(j + 1);
          t = t.slice(0, j);
        }
        return { r: s.slice(0, i), t, sub };
      };
      const g = (f, t) => ({ k: "say", w: "g", f, t }), b = (f, t) => ({ k: "say", w: "b", f, t });
      const bd = (cards, o) => Object.assign({ k: "board", cards }, o || {});
      const A = (jp, ans, o) => Object.assign({ k: "quiz", type: "A", jp, ans, dummy: [] }, o || {});
      const D = (jp, ans, o) => Object.assign({ k: "quiz", type: "D", jp, ans, dummy: [] }, o || {});
      const E = (jp, ans, jo, note, o) => Object.assign({ k: "quiz", type: "E", jp, ans, jo, note, dummy: [] }, o || {});
      const B = (before, after, opts, ok, o) => Object.assign({ k: "quiz", type: "B", before, after, opts, ok }, o || {});
      const C = (en, ok) => ({ k: "quiz", type: "C", en, ok });
      const GEN = ["\u30B8\u30E3\u30F3\u30EB", "\u5177\u4F53\u7684", "\u305D\u308C\uFF01"];
      const GEN_SUB = { "\u30B8\u30E3\u30F3\u30EB": "\u307C\u3093\u3084\u308A\u3002\u6570\u3048\u306A\u3044", "\u5177\u4F53\u7684": "\u6570\u3048\u3089\u308C\u308B\u3001\u3072\u3068\u3064", "\u305D\u308C\uFF01": "\u3069\u308C\u304B\u3001\u5206\u304B\u308B", "\u524D\uFF08\u3055\u3063\u3068\uFF09": "\u77ED\u3044\u3002\u3089\u3057\u3055", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09": "\u307E\u3068\u307E\u308A\u3002\u4ECA\u306E\u72B6\u6CC1", "\u3044\u3064\u3082\u306E\u8A71": "\u3075\u3060\u3093\u304B\u3089\u305D\u3046", "\u4ECA\u307E\u3055\u306B": "\u4ECA\u3001\u3084\u3063\u3066\u3044\u308B\u6700\u4E2D", "\u3082\u3046\u7D42\u308F\u3063\u305F": "\u904E\u304E\u305F\u3053\u3068", "\u4ECA\u306B\u3064\u306A\u304C\u308B": "\u7D50\u679C\u3084\u7D4C\u9A13\u304C\u3001\u4ECA\u3082", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B": "\u3067\u304D\u308B\u30FB\u3064\u3082\u308A\u30FB\u304B\u3082" };
      const TIMES = ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B", "\u3082\u3046\u7D42\u308F\u3063\u305F", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B"];
      const G = (en, ok, opts, o) => Object.assign({ k: "quiz", type: "C", gen: 1, en, ok, opts: opts || GEN }, o || {});
      const T = (cards, hl, ok, why) => ({ k: "quiz", type: "T", cards, hl, ok, why, opts: TARGETS });
      const CAPS = (x) => x.charAt(0).toUpperCase() + x.slice(1), LOWF = { My: 1, The: 1, A: 1, Her: 1, His: 1, She: 1, He: 1, They: 1, We: 1, You: 1, Our: 1, Your: 1 };
      const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
      function altW(ans, units, words, jp) {
        const W = Object.fromEntries(words || []), n = ans.length, tx = (i) => {
          const t = tk(ans[i]).t;
          return W[t] || t;
        };
        const U = units.map((u) => ({ k: u[0], i: u.slice(1) })), endU = U.filter((u) => u.k !== "a"), aU = U.filter((u) => u.k === "a");
        const inEnd = new Set(endU.flatMap((u) => u.i)), base = [];
        for (let i = 0; i < n; i++) if (!inEnd.has(i)) base.push(i);
        const free = endU.filter((u) => u.k === "f"), tm = endU.filter((u) => u.k === "t"), out = [], seen = /* @__PURE__ */ new Set([[...Array(n).keys()].join()]);
        const add = (order, front) => {
          const key = order.join();
          if (seen.has(key)) return;
          seen.add(key);
          if (jp) {
            out.push({ o: order });
            return;
          }
          const t = order.map((i) => tx(i));
          if (front) {
            t[0] = CAPS(t[0]);
            t[front - 1] += ",";
            const f0 = order.indexOf(0);
            if (f0 >= front) {
              const w = t[f0].split(" ")[0];
              if (LOWF[w]) t[f0] = w.toLowerCase() + t[f0].slice(w.length);
            }
          }
          out.push({ o: order, t });
        };
        const tail = (fr, tms) => perms(fr).map((f) => [...f.flatMap((u) => u.i), ...tms.flatMap((u) => u.i)]);
        tail(free, tm).forEach((tl) => add([...base, ...tl]));
        endU.forEach((u) => {
          const rest = endU.filter((x) => x !== u);
          tail(rest.filter((x) => x.k === "f"), rest.filter((x) => x.k === "t")).forEach((tl) => add([...u.i, ...base, ...tl], u.i.length));
        });
        aU.forEach((u) => {
          const canon = [...Array(n).keys()].filter((i) => !u.i.includes(i));
          add([...u.i, ...canon], u.i.length);
        });
        return out;
      }
      const AX = (jp, ans, units, o) => A(jp, ans, Object.assign({ alt: altW(ans, units) }, o || {}));
      const DX = (jp, ans, units, o) => D(jp, ans, Object.assign({ alt: altW(ans, units, o && o.words) }, o || {}));
      const EX = (jp, ans, jo, note, units, o) => E(jp, ans, jo, note, Object.assign({ alt: altW(ans, units, null, true) }, o || {}));
      const sum = (t) => ({ k: "sum", t });
      const LESSONS = [
        { id: "1-0", name: "\u30D7\u30ED\u30ED\u30FC\u30B0", coin: 5, steps: [
          g("\u843D\u3061\u8FBC\u3080", "\u82F1\u8A9E\u3092\u8A71\u305D\u3046\u3068\u3059\u308B\u3068\u3001\u982D\u304C\u771F\u3063\u767D\u306B\u306A\u308B\u306E\u2026\u2026\u3002\u5358\u8A9E\u306F\u77E5\u3063\u3066\u308B\u306E\u306B\u3001\u3069\u3046\u4E26\u3079\u308C\u3070\u3044\u3044\u304B\u5206\u304B\u3089\u306A\u304F\u3066"),
          b("\u666E\u901A", "\u305D\u308C\u306F\u3001\u3069\u3053\u304B\u3089\u4F5C\u308B\u304B\u304C\u6C7A\u307E\u3063\u3066\u306A\u3044\u304B\u3089\u3060\u3088\u3002\u82F1\u8A9E\u306F\u306D\u3001\u6C7A\u307E\u3063\u305F\u9806\u756A\u3067\u4F5C\u3063\u3066\u3044\u3051\u3070\u3044\u3044\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u6C7A\u307E\u3063\u305F\u9806\u756A\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u307E\u305A\u3001\u305D\u306E\u6587\u306E\u201C\u4E3B\u5F79\u201D\u3092\u6C7A\u3081\u308B\u3093\u3060\u3002\u6B21\u306B\u3001\u305D\u306E\u4E3B\u5F79\u304C\u201C\u3069\u3046\u3057\u3066\u308B\uFF1F\u201D\u3092\u8A00\u3046"),
          g("\u9A5A\u304F", "\u305D\u308C\u3060\u3051\uFF1F"),
          b("\u666E\u901A", "\u3046\u3093\u3002\u3053\u308C\u304C\u3001\u6587\u306E\u571F\u53F0\u3060\u3088"),
          bd(["S:Tom", "V:runs"], { fx: "crown", cap: "Tom \uFF1D \u4E3B\u5F79\u3000runs \uFF1D \u3069\u3046\u3057\u3066\u308B\uFF1F" }),
          b("\u666E\u901A", "Tom \u304C\u4E3B\u5F79\u3002runs \u304C\u201C\u3069\u3046\u3057\u3066\u308B\uFF1F\u201D\u3060\u3088"),
          g("\u8003\u3048\u308B", "Tom \u306F1\u3064\u306E\u5358\u8A9E\u3060\u3051\u3069\u3001\u4E3B\u5F79\u3063\u3066\u3001\u3044\u3064\u3082\u5358\u8A9E1\u3064\u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u3044\u3044\u8CEA\u554F\uFF01 \u4ECA\u56DE\u306F\u5358\u8A9E1\u3064\u3060\u3051\u3069\u3001\u4F55\u500B\u304B\u306E\u5358\u8A9E\u304C\u307E\u3068\u307E\u3063\u305F\u201C\u30C1\u30E3\u30F3\u30AF\u201D\u3067\u3082\u3001\u540C\u3058\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u30C1\u30E3\u30F3\u30AF\u3067\u3082\uFF1F"),
          b("\u666E\u901A", "\u3046\u3093\u3002\u3053\u306E\u6D41\u308C\u3082\u5F79\u5272\u3082\u3001\u307E\u3068\u307E\u308A\u306B\u306A\u3063\u3066\u3082\u5171\u901A\u3057\u3066\u308B\u3088"),
          g("\u9A5A\u304F", "\u5358\u8A9E\u3067\u3082\u3001\u307E\u3068\u307E\u308A\u3067\u3082\u3001\u540C\u3058\u9806\u756A\u3067\u3044\u3044\u3093\u3060\uFF01"),
          b("\u559C\u3076", "\u305D\u3046\uFF01 \u307E\u305A\u306F\u3001\u5171\u901A\u3059\u308B\u300C\u9806\u756A\u300D\u3092\u899A\u3048\u3066\u3044\u3053\u3046\uFF01"),
          g("\u3072\u3089\u3081\u304F", "\u305D\u308C\u306A\u3089\u4F5C\u308C\u305D\u3046\uFF01 \u9806\u756A\u306B\u3001\u3084\u3063\u3066\u307F\u308B\uFF01"),
          b("\u666E\u901A", "\u571F\u53F0\u306B\u306F\u30015\u3064\u306E\u578B\u304C\u3042\u308B\u3088\u3002\u540D\u524D\u3092\u4ED8\u3051\u305F\u304B\u3089\u30011\u3064\u305A\u3064\u898B\u3066\u3044\u3053\u3046"),
          b("\u666E\u901A", "\u307E\u305A\u306F2\u3064\u3002\n\u2460\u305F\u3060\u3059\u308B\u6587\n\u2461\u3060\u3088\uFF01\u6587"),
          g("\u559C\u3076", "\u306A\u3093\u3060\u304B\u3001\u899A\u3048\u3084\u3059\u3044\u540D\u524D\u3060\u306D\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u7D9A\u3051\u30663\u3064\u3002\n\u2462\u4F55\u3059\u308B\u306E\uFF1F\u6587\n\u2463\u306F\u3044\u3069\u3046\u305E\uFF01\u6587\n\u2464\u95A2\u4FC2\u3042\u308B\u3088\u6587"),
          g("\u8003\u3048\u308B", "\u3069\u3093\u306A\u6587\u306A\u306E\u304B\u3001\u65E9\u304F\u77E5\u308A\u305F\u3044\uFF01"),
          b("\u666E\u901A", "\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u304B\u3089\u30011\u3064\u305A\u3064\u3084\u3063\u3066\u3044\u304F\u3088"),
          sum("\u82F1\u8A9E\u306F\u300C\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u9806\u306B\u3001\u30C1\u30E3\u30F3\u30AF\u3092\u4E26\u3079\u3066\u4F5C\u308B")
        ] },
        { id: "1-1", name: "\u305F\u3060\u3059\u308B\u6587", coin: 5, steps: [
          bd(["S:Tom", "V:runs"], { cap: "Tom runs." }),
          b("\u666E\u901A", "1\u3064\u76EE\u306F\u300C\u305F\u3060\u3059\u308B\u6587\u300D\u3002\u3007\u3007\u304C\u3059\u308B\uFF01\u3063\u3066\u6587\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u4E3B\u5F79\u3068\u3001\u3069\u3046\u3057\u3066\u308B\uFF1F\u3060\u3051\u3067\u3044\u3044\u306E\uFF1F"),
          b("\u666E\u901A", "\u3046\u3093\u3002\u4E3B\u5F79\u81EA\u8EAB\u304C\u3084\u3063\u3066\u3044\u308B\u3053\u3068\u3060\u3051\u3067\u3001\u7D42\u308F\u308C\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "Tom runs.\u300E\u30C8\u30E0\u306F\u8D70\u308B\u300F\u3002\u3053\u308C\u3067\u7D42\u308F\u3063\u3066\u308B\u306D"),
          bd(["S:Tom", "V:runs"], { mark: "\u3007", arrow: "self", cap: "\u305D\u306E\u4EBA\u81EA\u8EAB\u304C\u3084\u3063\u3066\u3044\u308B\u3053\u3068" }),
          b("\u559C\u3076", "\u305D\u3046\u3002\u305D\u306E\u4EBA\u81EA\u8EAB\u304C\u3084\u3063\u3066\u3044\u308B\u3053\u3068\u3060\u3051\u3002\u4ED6\u306E\u8AB0\u304B\u3084\u4F55\u304B\u306B\u306F\u3001\u5411\u304B\u3063\u3066\u3044\u304B\u306A\u3044\u3088\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u4ED6\u306B\u3082\u3001Birds fly. \u3068\u304B\u3000Mika sings. \u3068\u304B"),
          g("\u559C\u3076", "\u4E3B\u5F79\u304C\u3044\u3066\u3001\u3069\u3046\u3057\u3066\u308B\u304C\u8A00\u3048\u305F\u3089\u3001\u3082\u3046\u6587\u306B\u306A\u308B\u3093\u3060"),
          bd(["S:Mika", "V:sings"], { cap: "\u3072\u3068\u308A\u306E\u4EBA \u2192 \u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306B s \u304C\u3064\u304F" }),
          g("\u8003\u3048\u308B", "\u3042\u308C\uFF1F sings \u306B\u306F s \u304C\u3064\u3044\u3066\u308B\u3051\u3069\u3001Birds fly \u306B\u306F s \u304C\u306A\u3044\u306D"),
          b("\u666E\u901A", "\u3053\u3053\u306B\u3044\u306A\u3044\u201C\u3072\u3068\u308A\u306E\u4EBA\u201D\u306E\u3053\u3068\u3092\u8A00\u3044\u305F\u3044\u6642\u306F\u3001\u300C\u4F55\u3092\u3059\u308B\u304B\uFF1F\u300D\u306E\u3068\u3053\u308D\u306B s \u304C\u3064\u3044\u305F\u308A\u3059\u308B\u3093\u3060"),
          g("\u7126\u308B", "s \u3092\u5FD8\u308C\u3061\u3083\u3063\u305F\u3089\u3001\u3069\u3046\u3057\u3088\u3046\uFF1F"),
          b("\u559C\u3076", "\u4ECA\u306F\u9593\u9055\u3048\u3066\u3044\u3066\u3082\u3044\u3044\u3088\u3002\u4ED8\u3051\u306A\u304F\u3066\u3082\u3001\u9806\u756A\u304C\u9593\u9055\u3048\u3066\u306A\u3051\u308C\u3070\u8A71\u306F\u901A\u3058\u308B\u304B\u3089\u306D"),
          g("\u559C\u3076", "\u305D\u308C\u306A\u3089\u5B89\u5FC3\uFF01 \u5C11\u3057\u305A\u3064\u6163\u308C\u3066\u3044\u304F\u306D"),
          E("\u30C8\u30E0\u306F\u8D70\u308B", ["S:\u30C8\u30E0\u306F", "V:\u8D70\u308B"], [0, 1], "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u306E\u9806\u3060\u3088"),
          E("\u9CE5\u306F\u98DB\u3076", ["S:\u9CE5\u306F", "V:\u98DB\u3076"], [0, 1], "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u306E\u9806\u3060\u3088"),
          A("\u30C8\u30E0\u306F\u8D70\u308B", ["S:Tom", "V:runs"]),
          A("\u30DF\u30AB\u306F\u6B4C\u3046", ["S:Mika", "V:sings"]),
          A("\u9CE5\u306F\u98DB\u3076", ["S:Birds", "V:fly"]),
          sum("\u4E3B\u5F79 \uFF0B \u3069\u3046\u3057\u3066\u308B\uFF1F\u3000\u3053\u308C\u30671\u6587")
        ] },
        { id: "1-1b", name: "\u82F1\u8A9E\u304C\u51FA\u3066\u3053\u306A\u304F\u3066\u3082\u5927\u4E08\u592B", coin: 5, steps: [
          bd(["S:Mika", "Q:\uFF1F"], { cap: "\u300C\u30DF\u30AB\u304C\u5230\u7740\u3059\u308B\u300D\u3063\u3066\u8A00\u3044\u305F\u3044\uFF01" }),
          g("\u7126\u308B", "\u30DF\u30AB\u304C\u5230\u7740\u3059\u308B\u3001\u3063\u3066\u8A00\u3044\u305F\u3044\u3093\u3060\u3051\u3069\u2026\u2026\u300E\u5230\u7740\u3059\u308B\u300F\u3063\u3066\u3001\u82F1\u8A9E\u3067\u4F55\u3066\u8A00\u3046\u3093\u3060\u3063\u3051\uFF1F \u5206\u304B\u3089\u306A\u3044\u304B\u3089\u3001\u6587\u304C\u4F5C\u308C\u306A\u3044\u3088\uFF01"),
          b("\u666E\u901A", "\u305D\u3053\u3067\u6B62\u307E\u3089\u306A\u304F\u3066\u3044\u3044\u3088\u3002\u51FA\u3066\u3053\u306A\u3044\u5358\u8A9E\u306F\u3001\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067\u7F6E\u3044\u3061\u3083\u3048\u3070\u3044\u3044\u3093\u3060"),
          g("\u9A5A\u304F", "\u65E5\u672C\u8A9E\u306E\u307E\u307E\uFF01\uFF1F"),
          bd(["S:Mika", "V:\u5230\u7740\u3059\u308B"], { cap: "Mika \u5230\u7740\u3059\u308B" }),
          b("\u3072\u3089\u3081\u304F", "Mika \u5230\u7740\u3059\u308B\u3002\u4E3B\u5F79\u306E\u6B21\u306B\u201C\u3069\u3046\u3057\u3066\u308B\uFF1F\u201D\u304C\u6765\u308B\u9806\u756A\u306F\u3001\u5B88\u308C\u3066\u3044\u308B\u3088\u306D"),
          g("\u8003\u3048\u308B", "\u305F\u3057\u304B\u306B\u3001\u9806\u756A\u306F\u305D\u306E\u307E\u307E\u3060"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u5358\u8A9E\u306F\u3001\u3042\u3068\u3067\u899A\u3048\u308C\u3070\u3044\u3044\u3060\u3051\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u9806\u756A\u304C\u5148\u3067\u3001\u5358\u8A9E\u306F\u3042\u3068\u2026\u2026"),
          bd(["S:Mika", "V:arrives"], { cap: "\u5230\u7740\u3059\u308B \uFF1D arrives\u3000\u5165\u308C\u66FF\u3048\u308B\u3060\u3051", swap: 1 }),
          b("\u559C\u3076", "\u3042\u3068\u3067\u201C\u5230\u7740\u3059\u308B = arrive\u201D\u3063\u3066\u899A\u3048\u305F\u3089\u3001\u3053\u306E\u30AB\u30FC\u30C9\u3092\u5165\u308C\u66FF\u3048\u308B\u3060\u3051\u3002\u9806\u756A\u306F\u3082\u3046\u3067\u304D\u3066\u308B\u304B\u3089\u3001\u3059\u3050\u4F7F\u3048\u308B\u3088"),
          g("\u3072\u3089\u3081\u304F", "\u3058\u3083\u3042\u3001\u5206\u304B\u3089\u306A\u3044\u5358\u8A9E\u304C\u3042\u3063\u3066\u3082\u3001\u7126\u3089\u306A\u304F\u3066\u3044\u3044\u3093\u3060\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u8A00\u3044\u65B9\u3092\u899A\u3048\u308B\u306E\u306F\u3001\u3042\u3068\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3059\u308C\u3070\u3001\u610F\u5473\u3082\u51FA\u308B\u3088"),
          D("\u30DF\u30AB\u306F\u5230\u7740\u3059\u308B", ["S:Mika", "V:\u5230\u7740\u3059\u308B"], { en: "Mika arrives.", words: [["\u5230\u7740\u3059\u308B", "arrives"]] }),
          D("\u30B1\u30F3\u306F\u73FE\u308C\u308B", ["S:Ken", "V:\u73FE\u308C\u308B"], { en: "Ken appears.", words: [["\u73FE\u308C\u308B", "appears"]] }),
          D("\u96EA\u306F\u6EB6\u3051\u308B", ["S:Snow", "V:\u6EB6\u3051\u308B"], { en: "Snow melts.", words: [["\u6EB6\u3051\u308B", "melts"]] }),
          sum("\u9806\u756A\u304C\u5148\u3001\u5358\u8A9E\u306F\u3042\u3068\u3002\u899A\u3048\u305F\u3089\u3059\u3050\u4F7F\u3048\u308B")
        ] },
        { id: "1-2", name: "\u3060\u3088\uFF01\u6587\uFF08\uFF1D\uFF09", coin: 5, steps: [
          b("\u666E\u901A", "2\u3064\u76EE\u306F\u300C\u3060\u3088\uFF01\u6587\u300D\u3002\u3007\u3007\u306F\u301C\u3060\u3088\uFF01\u3063\u3066\u3001\u3007\u3007\u305D\u306E\u3082\u306E\u3092\u8AAC\u660E\u3059\u308B\u6587\u306A\u3093\u3060"),
          b("\u666E\u901A", "\u4F8B\u3048\u3070\u300C\u5F7C\u5973\u306F\u80CC\u304C\u9AD8\u3044\u300D\u3060\u3068\u3001\u4F55\u3092\u3057\u3066\u308B\u304B\uFF1F\u3058\u3083\u306A\u304F\u3066\u3001\u5F7C\u5973\u306E\u72B6\u614B\u3092\u305D\u306E\u307E\u307E\u8868\u3057\u3066\u308B\u3088\u306D\uFF1F"),
          g("\u8003\u3048\u308B", "\u305F\u3057\u304B\u306B\u3002\u4F55\u304B\u3092\u3057\u3066\u308B\u308F\u3051\u3058\u3083\u306A\u3044\u306D"),
          bd(["S:She", "Q:\uFF1F", "C:tall"], { cap: "\u5F7C\u5973 \uFF1F \u80CC\u304C\u9AD8\u3044" }),
          b("\u3072\u3089\u3081\u304F", "\u3053\u306E\u300C\u5F7C\u5973\u300D\u3068\u300C\u80CC\u304C\u9AD8\u3044\u300D\u306E\u9593\u306B\u306F\u3001\u201C\uFF1D\u201D\u307F\u305F\u3044\u306A\u5F79\u76EE\u306E\u8A00\u8449\u3092\u5165\u308C\u306A\u3044\u3068\u3044\u3051\u306A\u3044\u3093\u3060"),
          bd(["S:She", "V:is", "C:tall"], { cap: "She is tall.\u3000\u5F7C\u5973\u306F\u80CC\u304C\u9AD8\u3044" }),
          b("\u666E\u901A", "\u5165\u308B\u306E\u306F is\u3002She is tall. \u306E is \u304C\u3001\u201C\uFF1D\u201D\u306E\u5F79\u76EE\u3092\u3057\u3066\u3044\u308B\u3093\u3060"),
          bd(["S:She", "V:is", "C:tall"], { arrow: "eq", cap: "\u5F7C\u5973 \uFF1D \u80CC\u304C\u9AD8\u3044" }),
          b("\u666E\u901A", "is \u3092\u201C\uFF1D\u201D\u306B\u7F6E\u304D\u304B\u3048\u308B\u3068\u3001\u3053\u3046\u306A\u308B\u3088"),
          g("\u559C\u3076", "\u5F7C\u5973\uFF1D\u80CC\u304C\u9AD8\u3044\u3002\u4E3B\u5F79\u3068\u8AAC\u660E\u3092\u30DA\u30BF\u30C3\u3068\u3064\u306A\u3050\u3060\u3051\u3060"),
          bd(["S:She", "V:is", "C:tall"], { cap: "She is tall.\u3000\u5F7C\u5973\u306F\u80CC\u304C\u9AD8\u3044" }),
          b("\u666E\u901A", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u8868\u3059\u8A00\u8449\u306B\u306F\u30012\u7A2E\u985E\u3042\u308B\u3093\u3060"),
          b("\u666E\u901A", "\u524D\u306B\u7FD2\u3063\u305F\u300C\u52D5\u304D\u300D\u3092\u8868\u3059\u8A00\u8449\u3068\u3001\u3053\u306E is \u307F\u305F\u3044\u306A\u300C\u72B6\u614B\u300D\u3092\u8868\u3059\u8A00\u8449\u3060\u3088"),
          g("\u8003\u3048\u308B", "runs \u306F\u52D5\u304D\u3001is \u306F\u72B6\u614B\u3063\u3066\u3053\u3068\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u305D\u3057\u3066\u72B6\u614B\u3092\u8868\u3059\u8A00\u8449\u306F\u3001\u5B9F\u306F is \u3060\u3051\u3058\u3083\u306A\u3044\u3093\u3060"),
          bd(["S:I", "V:am", "C:happy"], { cap: "I am happy.\u3000\u79C1\u306F\u5E78\u305B" }),
          b("\u666E\u901A", "\u4E3B\u5F79\u304C I \u306A\u3089\u3001is \u3058\u3083\u306A\u304F\u3066 am \u306B\u306A\u308B\u3088"),
          bd(["S:You", "V:are", "C:kind"], { cap: "You are kind.\u3000\u3042\u306A\u305F\u306F\u512A\u3057\u3044" }),
          b("\u666E\u901A", "You \u306A\u3089 are\u3002\u4E3B\u5F79\u306B\u3088\u3063\u3066\u3001\u5F62\u304C\u5909\u308F\u308B\u3093\u3060"),
          g("\u7126\u308B", "\u3048\u3063\u3001\u5F62\u304C\u3044\u304F\u3064\u3082\u3042\u308B\u306E\uFF01\uFF1F \u3084\u3084\u3053\u3057\u3044\uFF01"),
          b("\u666E\u901A", "\u5927\u4E08\u592B\u3002\u8868\u306B\u307E\u3068\u3081\u305F\u304B\u3089\u3001\u898B\u3066\u307F\u3088\u3046"),
          bd([], { table: [["I\uFF08\u79C1\uFF09", "am"], ["you / we / they\uFF08\u76EE\u306E\u524D\u306E\u4EBA\u30FB\u5927\u52E2\uFF09", "are"], ["\u305D\u308C\u4EE5\u5916\uFF08he / she / it / \u540D\u524D\u3072\u3068\u308A\uFF09", "is"]], cap: "\u4E3B\u5F79 \u2192 \u4F7F\u3046\u5F62" }),
          b("\u666E\u901A", "\u4E3B\u5F79\u306B\u3088\u3063\u3066\u3001\u4F7F\u3046\u5F62\u306F\u6C7A\u307E\u3063\u3066\u308B\u3093\u3060\u3002\u3060\u3093\u3060\u3093\u6163\u308C\u3066\u304F\u308B\u3088"),
          g("\u3072\u3089\u3081\u304F", "\u8868\u306E\u3068\u304A\u308A\u306B\u9078\u3079\u3070\u3044\u3044\u306E\u306D\uFF01"),
          b("\u666E\u901A", "I\uFF08\u79C1\uFF09\u3060\u3051\u306F am\u3002\u76EE\u306E\u524D\u306E\u4EBA\u3084\u3001\u5927\u52E2\u306E\u4EBA\u306B\u306F are \u3092\u4F7F\u3046\u3088"),
          b("\u559C\u3076", "\u305D\u308C\u4EE5\u5916\u306F is\u3002\u3072\u3068\u308A\u306E\u4EBA\u3084\u3001\u3072\u3068\u3064\u306E\u7269\u306B\u3064\u3044\u3066\u8A00\u3044\u305F\u3044\u6642\u3060\u3088"),
          b("\u666E\u901A", "\u8FF7\u3063\u305F\u3089\u3001\u3044\u3064\u3067\u3082\u8868\u3092\u898B\u3066\u306D\uFF01"),
          b("\u666E\u901A", "is \u306E\u4EF2\u9593\u306B\u306F\u3001look\uFF08\u301C\u306B\u898B\u3048\u308B\uFF09\u3084 become\uFF08\u301C\u306B\u306A\u308B\uFF09\u3082\u3042\u308B\u3088\u3002\u3067\u3082\u3001\u4ECA\u306F\u307E\u3060\u899A\u3048\u306A\u304F\u3066\u5927\u4E08\u592B"),
          E("\u5F7C\u5973\u306F\u80CC\u304C\u9AD8\u3044", ["S:\u5F7C\u5973\u306F", "V:\uFF1D", "C:\u80CC\u304C\u9AD8\u3044"], [0, 2, 1], "\u4E3B\u5F79 \u2192 \uFF1D \u2192 \u3069\u3093\u306A\u611F\u3058\uFF1F \u306E\u9806\u3060\u3088\uFF08\uFF1D\u306F\u3001\u65E5\u672C\u8A9E\u306B\u306F\u51FA\u3066\u3053\u306A\u3044\u3051\u3069\u3001\u82F1\u8A9E\u3067\u306F\u5FC5\u8981\uFF09"),
          B("I", "happy.", ["am", "is", "are"], "am"),
          B("She", "tall.", ["am", "is", "are"], "is"),
          B("They", "kind.", ["am", "is", "are"], "are"),
          A("\u30C8\u30E0\u306F\u7720\u3044", ["S:Tom", "V:is", "C:sleepy"]),
          D("\u30DF\u30AB\u306F\u982D\u304C\u3044\u3044", ["S:Mika", "V:is", "C:\u982D\u304C\u3044\u3044"], { en: "Mika is smart.", words: [["\u982D\u304C\u3044\u3044", "smart"]] }),
          sum("\u4E3B\u5F79 \uFF1D \u3069\u3093\u306A\u611F\u3058\uFF1F")
        ] },
        { id: "1-3", name: "\u4F55\u3059\u308B\u306E\uFF1F\u6587", coin: 5, steps: [
          bd(["S:She", "V:calls", "Q:\uFF1F\uFF1F\uFF1F"], { arrow: "out", cap: "She calls \u2026\u3000\u77E2\u5370\u306E\u5148\u304C\u7A7A\u3044\u3066\u3044\u308B" }),
          b("\u666E\u901A", "3\u3064\u76EE\u306F\u300C\u4F55\u3059\u308B\u306E\uFF1F\u6587\u300D\u3002\u77E2\u5370\u304C\u5916\u306B\u5411\u304B\u3046\u52D5\u4F5C\u3060\u3088"),
          g("\u9A5A\u304F", "She calls \u2026\u300E\u5F7C\u5973\u306F\u547C\u3076\u300F\u3002\u8AB0\u3092\uFF01\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u5916\u306B\u5411\u304B\u3046\u52D5\u4F5C\u306F\u3001\u201C\u76F8\u624B\u201D\u304C\u5FC5\u8981\u306B\u306A\u308B"),
          bd(["S:She", "V:calls", "O:Tom"], { arrow: "out", cap: "She calls Tom.\u3000\u77E2\u5370\u304C\u3001\u5916\u306ETom\u306B\u5C4A\u3044\u305F" }),
          bd(["S:Tom", "V:likes", "O:music"], { arrow: "out", cap: "Tom likes music.\u3000\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D" }),
          b("\u666E\u901A", "\u307E\u305A\u306F\u3001\u4E3B\u5F79\u3068\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u304C\u3042\u308B\u3002\u305D\u3053\u306B\u300C\u4F55\u3092\uFF1F\u300D\u304C\u3001\u3042\u3068\u304B\u3089\u3064\u3044\u3066\u304F\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u76F8\u624B\u3002\u4E09\u3064\u4E26\u3076\u3093\u3060\u306D"),
          bd(["S:Music", "V:likes", "O:Tom"], { arrow: "out", cap: "Music likes Tom.\u3000\u97F3\u697D\u304C\u30C8\u30E0\u3092\u597D\u304D\uFF1F" }),
          b("\u666E\u901A", "\u3058\u3083\u3042\u3001\u4E3B\u5F79\u3068\u300C\u4F55\u3092\u300D\u3092\u5165\u308C\u304B\u3048\u3066\u3001Music likes Tom. \u306B\u3057\u3066\u307F\u3088\u3046"),
          g("\u8003\u3048\u308B", "\u9806\u756A\u3092\u5909\u3048\u308B\u3060\u3051\u3060\u3088\u306D\uFF1F \u610F\u5473\u306F\u540C\u3058\u3058\u3083\u306A\u3044\u306E\uFF1F"),
          b("\u559C\u3076", "\u305D\u308C\u304C\u9055\u3046\u3093\u3060\u3002\u300C\u97F3\u697D\u304C\u30C8\u30E0\u3092\u597D\u304D\u300D\u306B\u306A\u3063\u3061\u3083\u3046\u3088"),
          g("\u9A5A\u304F", "\u3048\u3063\u3001\u5168\u7136\u3061\u304C\u3046\uFF01 \u9806\u756A\u3063\u3066\u5927\u4E8B\u306A\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u82F1\u8A9E\u306F\u3001\u8A00\u8449\u306E\u9806\u756A\u3067\u201C\u3069\u3093\u306A\u95A2\u4FC2\u304B\u201D\u3092\u4F1D\u3048\u308B\u8A00\u8A9E\u306A\u3093\u3060"),
          b("\u666E\u901A", "\u3068\u308A\u3042\u3048\u305A\u7DF4\u7FD2\u3057\u3066\u307F\u3088\u3046\u3002\u4E3B\u5F79\u306F\uFF1F \u3069\u3046\u3057\u3066\u308B\uFF1F \u4F55\u3092\uFF1F \u3092\u8003\u3048\u3066\u306D"),
          E("\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D", ["S:\u30C8\u30E0\u306F", "V:\u597D\u304D", "O:\u97F3\u697D\u304C"], [0, 2, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u97F3\u697D\u304C\u30FB\u597D\u304D\u300D\u306E\u9806\u3002\u82F1\u8A9E\u306F\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u304C\u5148\u3067\u3001\u300C\u4F55\u3092\uFF1F\u300D\u304C\u3042\u3068"),
          E("\u30DF\u30AB\u306F\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:\u30DF\u30AB\u306F", "V:\u98DF\u3079\u308B", "O:\u663C\u3054\u306F\u3093\u3092"], [0, 2, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u663C\u3054\u306F\u3093\u3092\u30FB\u98DF\u3079\u308B\u300D\u306E\u9806\u3002\u82F1\u8A9E\u306F\u300C\u98DF\u3079\u308B\u300D\u304C\u5148"),
          A("\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D", ["S:Tom", "V:likes", "O:music"]),
          A("\u30DF\u30AB\u306F\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:Mika", "V:eats", "O:lunch"]),
          A("\u5F7C\u5973\u306F\u30C8\u30E0\u3092\u547C\u3076", ["S:She", "V:calls", "O:Tom"]),
          D("\u30C8\u30E0\u306F\u30E9\u30FC\u30E1\u30F3\u3092\u98DF\u3079\u308B", ["S:Tom", "V:\u98DF\u3079\u308B", "O:\u30E9\u30FC\u30E1\u30F3"], { en: "Tom eats ramen.", words: [["\u98DF\u3079\u308B", "eats"], ["\u30E9\u30FC\u30E1\u30F3", "ramen"]] }),
          C("Birds fly.", "\u305F\u3060\u3059\u308B\u6587"),
          C("She calls Tom.", "\u4F55\u3059\u308B\u306E\uFF1F\u6587"),
          sum("\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u76F8\u624B")
        ] },
        { id: "1-4", name: "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587", coin: 5, steps: [
          bd(["S:She", "V:gives", "I:me", "O:flowers"], { arrow: "out2", cap: "She gives me flowers." }),
          b("\u666E\u901A", "4\u3064\u76EE\u306F\u300C\u306F\u3044\u3069\u3046\u305E\uFF01\u6587\u300D\u3002\u3007\u3007\u304C\u3001\u8AB0\u304B\u306B\u3001\u4F55\u304B\u3092\u201C\u306F\u3044\u3069\u3046\u305E\uFF01\u201D\u3063\u3066\u6E21\u3059\u6587\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u6E21\u3059\u76F8\u624B\u3068\u3001\u6E21\u3059\u7269\u304C\u3042\u308B\u3093\u3060\u306D"),
          b("\u3072\u3089\u3081\u304F", "She gives me flowers.\u300E\u5F7C\u5973\u306F\u79C1\u306B\u82B1\u3092\u304F\u308C\u308B\u300F\u3002\u8AB0\u306B\uFF1F \u2192 \u4F55\u3092\uFF1F \u306E\u9806\u3067\u4E26\u3076\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "give \u307F\u305F\u3044\u306B\u3001\u6E21\u3059\u7CFB\u306E\u8A00\u8449\u304C\u5165\u308B\u3093\u3060\u306D\uFF01"),
          bd(["S:She", "V:gives", "O:flowers"], { arrow: "out", cap: "She gives flowers." }),
          b("\u666E\u901A", "\u300C\u8AB0\u306B\u300D\u3092\u8A00\u308F\u306A\u304F\u3066\u3082\u3001\u7269\u307E\u3067\u8A00\u3048\u3070\u3001\u305D\u306E\u4EBA\u306E\u8AAC\u660E\u306F\u7D42\u308F\u308A\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u300C\u8AB0\u306B\u300D\u3092\u3001\u3042\u3068\u304B\u3089\u8A00\u3063\u3066\u3082\u3044\u3044\u306E\uFF1F"),
          b("\u666E\u901A", "\u8A00\u3048\u308B\u3088\u3002\u305F\u3060\u3057\u3001\u5F8C\u308D\u306B\u7F6E\u304F\u3068\u304D\u306F to \u304C\u5FC5\u8981\u306B\u306A\u308B\u3093\u3060"),
          bd(["S:She", "V:gives", "O:flowers", "R:to me|\u79C1\u306B|\u5411\u304B\u3046\u5148"], { cap: "She gives flowers to me.\u3000\u5F7C\u5973\u306F\u82B1\u3092\u79C1\u306B\u304F\u308C\u308B" }),
          g("\u9A5A\u304F", "\u3042\u308C\uFF1F \u5F8C\u308D\u3060\u3068 to \u304C\u3064\u304F\u3093\u3060\u306D"),
          b("\u666E\u901A", "to \u306F\u300C\u2192\u300D\u307F\u305F\u3044\u306A\u5F79\u76EE\u3002\u300C\u305D\u3063\u3061\u3078\u5411\u304B\u3046\u3088\u300D\u3063\u3066\u793A\u3059\u8A00\u8449\u306A\u3093\u3060"),
          b("\u3072\u3089\u3081\u304F", "flowers \u3067\u3001\u82F1\u8A9E\u306E\u6D41\u308C\u306F\u4E00\u5EA6\u6B62\u307E\u3063\u3066\u308B\u3088\u306D\u3002\u3060\u304B\u3089\u3001\u3042\u3068\u304B\u3089\u8DB3\u3059\u3068\u304D\u306F\u3001\u5411\u304B\u3046\u5148\u3092\u793A\u3059 to \u304C\u3044\u308B\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "me \u304C\u5148\u306A\u3089\u3001\u6D41\u308C\u304C\u6B62\u307E\u3089\u306A\u3044\u304B\u3089 to \u306F\u3044\u3089\u306A\u3044\u306E\u306D"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u3060\u304B\u3089\u57FA\u672C\u306E\u8A9E\u9806\u306F She gives me flowers. \u3060\u3088\u3002flowers \u306E\u3042\u3068\u306E\u5F62\u306F\u3001\u3042\u3068\u3067\u8A73\u3057\u304F\u3084\u308B\u306D"),
          bd(["S:I", "V:teach", "I:you", "O:English"], { arrow: "out2", cap: "I teach you English.\u3000\u3042\u306A\u305F\u306B\u82F1\u8A9E\u3092\u6559\u3048\u308B" }),
          b("\u666E\u901A", "\u305D\u3046\u3002give \u306E\u4ED6\u306B\u3082\u3001show\uFF08\u898B\u305B\u308B\uFF09\u3001send\uFF08\u9001\u308B\uFF09\u3001tell\uFF08\u4F1D\u3048\u308B\uFF09\u3001teach\uFF08\u6559\u3048\u308B\uFF09\u304C\u3042\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u6E21\u3059\u7CFB\u306E\u8A00\u8449\u3060\u3051\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u300C\u301C\u3057\u3066\u3042\u3052\u308B\u300D\u3063\u3066\u610F\u5473\u306E\u8A00\u8449\u3082\u3001\u3053\u306E\u578B\u306B\u306A\u308C\u308B\u3093\u3060\u3002buy\uFF08\u8CB7\u3063\u3066\u3042\u3052\u308B\uFF09\u3084 choose\uFF08\u9078\u3093\u3067\u3042\u3052\u308B\uFF09\u3068\u304B\u306D"),
          g("\u559C\u3076", "\u3069\u308C\u3082\u3001\u8AB0\u304B\u306B\u4F55\u304B\u3092\u201C\u306F\u3044\u3069\u3046\u305E\uFF01\u201D\u3060\u306D"),
          E("\u5F7C\u5973\u306F\u79C1\u306B\u82B1\u3092\u304F\u308C\u308B", ["S:\u5F7C\u5973\u306F", "V:\u304F\u308C\u308B", "I:\u79C1\u306B", "O:\u82B1\u3092"], [0, 2, 3, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u79C1\u306B\u30FB\u82B1\u3092\u30FB\u304F\u308C\u308B\u300D\u306E\u9806\u3002\u82F1\u8A9E\u306F\u300C\u304F\u308C\u308B\u300D\u304C\u5148\u3067\u3001\u305D\u306E\u3042\u3068\u306B\u300C\u8AB0\u306B\u30FB\u4F55\u3092\u300D"),
          A("\u5F7C\u5973\u306F\u79C1\u306B\u82B1\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "O:flowers"]),
          A("\u79C1\u306F\u3042\u306A\u305F\u306B\u82F1\u8A9E\u3092\u6559\u3048\u308B", ["S:I", "V:teach", "I:you", "O:English"]),
          D("\u5F7C\u5973\u306F\u79C1\u306B\u30D7\u30EC\u30BC\u30F3\u30C8\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "O:\u30D7\u30EC\u30BC\u30F3\u30C8"], { en: "She gives me presents.", words: [["\u30D7\u30EC\u30BC\u30F3\u30C8", "presents"]] }),
          C("She gives me flowers.", "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587"),
          C("Tom likes music.", "\u4F55\u3059\u308B\u306E\uFF1F\u6587"),
          C("Tom is sleepy.", "\u3060\u3088\uFF01\u6587"),
          sum("\u306F\u3044\u3069\u3046\u305E\uFF01\u6587 \uFF1D \u8AB0\u306B\uFF1F \u2192 \u4F55\u3092\uFF1F")
        ] },
        { id: "1-5", name: "\u95A2\u4FC2\u3042\u308B\u3088\u6587", coin: 5, steps: [
          bd(["S:Music", "V:makes", "O:me", "C:happy"], { arrow: "outc", cap: "Music makes me happy.\u3000\u97F3\u697D\u306F\u79C1\u3092\u5E78\u305B\u306B\u3059\u308B" }),
          b("\u666E\u901A", "\u6700\u5F8C\u306E5\u3064\u76EE\u306F\u300C\u95A2\u4FC2\u3042\u308B\u3088\u6587\u300D\u3002\u3007\u3007\u304C\u3001\u8AB0\u304B\uFF08\u4F55\u304B\uFF09\u306B\u50CD\u304D\u304B\u3051\u308B\u6587\u3060\u3088"),
          b("\u666E\u901A", "\u305D\u306E\u76F8\u624B\u304C\u201C\u3069\u3046\u306A\u308B\u304B\u201D\u307E\u3067\u8A00\u3046\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u97F3\u697D\u304C\u79C1\u306B\u50CD\u304D\u304B\u3051\u3066\u2026\u2026\u79C1\u304C\u30CF\u30C3\u30D4\u30FC\u306B\u306A\u308B\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\uFF01 Music makes me happy.\u300E\u97F3\u697D\u306F\u79C1\u3092\u5E78\u305B\u306B\u3059\u308B\u300F\u3002me \u3068 happy \u306E\u9593\u306B\u306F\u3001\u300C\u79C1\uFF1D\u5E78\u305B\u300D\u3063\u3066\u3044\u3046\u95A2\u4FC2\u304C\u3042\u308B\u3093\u3060"),
          g("\u9A5A\u304F", "\u3055\u3063\u304D\u306E\u300C\u306F\u3044\u3069\u3046\u305E\uFF01\u6587\u300D\u3068\u4F3C\u3066\u308B\u3051\u3069\u3001me \u3068 happy \u306F\u201C\uFF1D\u201D\u3067\u3064\u306A\u304C\u3063\u3066\u308B\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u305D\u3053\u304C\u9055\u3044\u3060\u3088\u3002\u300C\u306F\u3044\u3069\u3046\u305E\uFF01\u6587\u300D\u306F\u3001\u6E21\u3059\u76F8\u624B\u3068\u7269\u304C\u5225\u3005\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u95A2\u4FC2\u3042\u308B\u3088\u6587\u306F\u3001\u5F8C\u308D\u306E2\u3064\u304C\u4EF2\u826F\u3057\u306A\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002\u5F8C\u308D\u306E2\u3064\u304C\u3001\u201C\uFF1D\u201D\u306E\u95A2\u4FC2\u306B\u306A\u3063\u3066\u3044\u308B\u3088"),
          b("\u559C\u3076", "make\uFF08\u301C\u306B\u3059\u308B\uFF09\u306E\u4ED6\u306B\u3082\u3001find\uFF08\u301C\u3060\u3068\u601D\u3046\uFF09\u3001call\uFF08\u301C\u3068\u547C\u3076\uFF09\u3001keep\uFF08\u301C\u306E\u307E\u307E\u306B\u3059\u308B\uFF09\u306A\u3093\u304B\u304C\u4F7F\u3048\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u4ED6\u306B\u306F\u3001\u3069\u3093\u306A\u6587\u304C\u3067\u304D\u308B\u306E\uFF1F"),
          bd(["S:She", "V:makes", "O:me", "C:smile"], { arrow: "outc", cap: "She makes me smile.\u3000\u5F7C\u5973\u306F\u79C1\u3092\u7B11\u9854\u306B\u3059\u308B" }),
          b("\u3072\u3089\u3081\u304F", "She makes me smile. \u307F\u305F\u3044\u306B\u3001smile\uFF08\u7B11\u3046\uFF09\u3063\u3066\u3044\u3046\u52D5\u304D\u306E\u8A00\u8449\u304C\u5165\u308B\u3053\u3068\u3082\u3042\u308B\u3093\u3060"),
          bd(["S:He", "V:found", "O:the book", "C:interesting"], { arrow: "outc", small: 1, cap: "He found the book interesting.\u3000\u5F7C\u306F\u305D\u306E\u672C\u3092\u9762\u767D\u3044\u3068\u601D\u3063\u305F" }),
          b("\u666E\u901A", "He found the book interesting.\u300E\u5F7C\u306F\u305D\u306E\u672C\u3092\u9762\u767D\u3044\u3068\u601D\u3063\u305F\u300F\u307F\u305F\u3044\u306A\u6587\u3082\u3042\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u65E5\u672C\u8A9E\u3060\u3068\u3001\u300C\u601D\u3063\u305F\u300D\u304C\u6700\u5F8C\u306B\u304F\u308B\u3093\u3060\u306D\u3002\u82F1\u8A9E\u3068\u306F\u9806\u756A\u304C\u305C\u3093\u305C\u3093\u9055\u3046"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3053\u3067\u5927\u4E8B\u306A\u8A71\u3002\u304D\u308C\u3044\u306A\u65E5\u672C\u8A9E\u306B\u76F4\u3057\u3066\u3001\u5206\u304B\u308D\u3046\u3068\u3057\u306A\u3044\u3067\u306D"),
          bd(["S:He", "V:found", "O:the book", "C:interesting"], { arrow: "outc", small: 1, cap: "\u5F7C\u306F \uFF0B \u898B\u3064\u3051\u305F \u2192 \u305D\u306E\u672C\u3092 \uFF1D \u9762\u767D\u3044" }),
          b("\u666E\u901A", "\u82F1\u8A9E\u306E\u9806\u756A\u306E\u307E\u307E\u3001\u982D\u306B\u5165\u308C\u308B\u3093\u3060\u3002\u300C\u5F7C\u306F\uFF0B\u898B\u3064\u3051\u305F \u2192 \u305D\u306E\u672C\u3092 \uFF1D \u9762\u767D\u3044\u300D"),
          g("\u9A5A\u304F", "\u300C\u5F7C\u306F\u898B\u3064\u3051\u305F\u3002\u305D\u306E\u672C\u3092\u3002\u305D\u308C\u306F\u9762\u767D\u3044\u300D\u3063\u3066\u3001\u9806\u756A\u306E\u307E\u307E\u53D7\u3051\u53D6\u308B\u306E\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002\u82F1\u8A9E\u306E\u9806\u756A\u3067\u8003\u3048\u308B\u982D\u306B\u306A\u308B\u3068\u3001\u3044\u3061\u3044\u3061\u8A33\u3055\u306A\u304F\u3066\u3082\u3001\u82F1\u8A9E\u306E\u307E\u307E\u7406\u89E3\u3067\u304D\u308B\u3088\u3046\u306B\u306A\u308B\u3088"),
          b("\u666E\u901A", "\u6587\u306F\u30012\u3064\u304C\u4E26\u3093\u3060\u308A\u3001\u3072\u3068\u7D44\u306B\u306A\u3063\u305F\u308A\u3001\u5916\u306B\u5E83\u304C\u3063\u305F\u308A\u3001\u8DB3\u3055\u308C\u305F\u308A\u3057\u3066\u3067\u304D\u3066\u3044\u308B\u3088"),
          b("\u666E\u901A", "\u305D\u306E\u5F62\u3092\u3001\u898B\u305F\u307E\u307E\u3001\u9806\u756A\u306E\u307E\u307E\u53D7\u3051\u53D6\u308D\u3046"),
          g("\u3072\u3089\u3081\u304F", "\u65E5\u672C\u8A9E\u306B\u76F4\u3055\u305A\u306B\u3001\u5F62\u3092\u898B\u308C\u3070\u3044\u3044\u3093\u3060\u306D\uFF01"),
          E("\u97F3\u697D\u306F\u79C1\u3092\u5E78\u305B\u306B\u3059\u308B", ["S:\u97F3\u697D\u306F", "V:\u3059\u308B", "O:\u79C1\u3092", "C:\u5E78\u305B\u306B"], [0, 2, 3, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u79C1\u3092\u30FB\u5E78\u305B\u306B\u30FB\u3059\u308B\u300D\u306E\u9806\u3002\u82F1\u8A9E\u306F\u300C\u3059\u308B\u300D\u304C\u5148\u3067\u3001\u3042\u3068\u306B\u300C\u79C1 \uFF1D \u5E78\u305B\u300D"),
          A("\u97F3\u697D\u306F\u79C1\u3092\u5E78\u305B\u306B\u3059\u308B", ["S:Music", "V:makes", "O:me", "C:happy"]),
          A("\u5F7C\u5973\u306F\u79C1\u3092\u7B11\u9854\u306B\u3059\u308B", ["S:She", "V:makes", "O:me", "C:smile"]),
          D("\u97F3\u697D\u306F\u79C1\u3092\u7720\u304F\u3059\u308B", ["S:Music", "V:makes", "O:me", "C:\u7720\u304F"], { en: "Music makes me sleepy.", words: [["\u7720\u304F", "sleepy"]] }),
          C("Music makes me happy.", "\u95A2\u4FC2\u3042\u308B\u3088\u6587"),
          C("I teach you English.", "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587"),
          C("She calls Tom.", "\u4F55\u3059\u308B\u306E\uFF1F\u6587"),
          sum("\u95A2\u4FC2\u3042\u308B\u3088\u6587 \uFF1D \u50CD\u304D\u304B\u3051\u308B \u2192 \u76F8\u624B\u304C\uFF08\uFF1D\uFF09\u3069\u3046\u306A\u308B\uFF1F")
        ] },
        { id: "1-6", name: "\u30DC\u30B9\uFF1A\u571F\u53F0\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          bd(["S:\u4E3B\u5F79", "V:\u3069\u3046\u3057\u3066\u308B\uFF1F", "O:\u76F8\u624B"], { arrow: "out", small: 1, cap: "\u571F\u53F0\u306E\u5730\u56F3" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u571F\u53F0\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046\u3002\u51FA\u3066\u3053\u306A\u3044\u5358\u8A9E\u306F\u3001\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067\u3044\u3044\u3088"),
          g("\u3072\u3089\u3081\u304F", "\u4E3B\u5F79\u3092\u63A2\u3057\u3066\u3001\u3069\u3046\u3057\u3066\u308B\uFF1F\u3092\u6C7A\u3081\u3066\u3001\u578B\u3092\u8003\u3048\u308B\uFF01"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          A("\u5F7C\u5973\u306F\u5230\u7740\u3059\u308B", ["S:She", "V:\u5230\u7740\u3059\u308B"], { dummy: ["lunch"], en: "She arrives.", words: [["\u5230\u7740\u3059\u308B", "arrives"]] }),
          A("\u79C1\u306F\u5E78\u305B\u3060", ["S:I", "V:am", "C:happy"], { dummy: ["is"] }),
          A("\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D", ["S:Tom", "V:likes", "O:music"], { dummy: ["school"] }),
          A("\u5F7C\u5973\u306F\u79C1\u306B\u82B1\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "O:\u82B1"], { dummy: ["sad"], en: "She gives me flowers.", words: [["\u82B1", "flowers"]] }),
          A("\u97F3\u697D\u306F\u79C1\u3092\u5E78\u305B\u306B\u3059\u308B", ["S:Music", "V:makes", "O:me", "C:happy"], { dummy: ["tall"] }),
          g("\u559C\u3076", "\u3067\u304D\u305F\uFF01\u3000\u82F1\u8A9E\u3092\u4F5C\u308B\u6642\u306E\u3001\u6700\u521D\u306E\u4E00\u6B69\u304C\u5206\u304B\u3063\u305F\u6C17\u304C\u3059\u308B\uFF01"),
          bd(["S:She", "V:gives", "I:me", "O:flowers"], { grow: 1, cap: "\u4E2D\u5FC3\u306E\u4E3B\u5F79\u304B\u3089\u3001\u5916\u3078\u5411\u304B\u3063\u3066\u5E83\u304C\u308B" }),
          b("\u3072\u3089\u3081\u304F", "\u6700\u5F8C\u306B\u3001\u82F1\u8A9E\u306E\u6587\u306E\u4F5C\u308A\u3092\u307E\u3068\u3081\u308B\u3088\u3002\u82F1\u8A9E\u306F\u3001\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3001\u9806\u756A\u306B\u8AAC\u660E\u304C\u5E83\u304C\u3063\u3066\u3044\u304F\u3093\u3060"),
          b("\u666E\u901A", "\u307E\u3093\u306A\u304B\u306F\u3001\u4E3B\u5F79\u3002\u307E\u305A\u3001\u305D\u306E\u4E3B\u5F79\u81EA\u8EAB\u304C\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u898B\u308B\u3088"),
          b("\u666E\u901A", "\u6B21\u306B\u3001\u5916\u306B\u5411\u304B\u3046\u52D5\u304D\u306A\u3089\u3001\u300C\u8AB0\u306B\u300D\u300C\u4F55\u3092\u300D\u3068\u3001\u5916\u3078\u9032\u3093\u3067\u3044\u304F\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u4EBA\u304B\u3089\u3001\u3082\u306E\u3078\u3002\u5C11\u3057\u305A\u3064\u3001\u5916\u306B\u5411\u304B\u3063\u3066\u3044\u304F\u306E\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002\u3053\u306E\u9806\u756A\u3067\u4E26\u3093\u3067\u3044\u308B\u304B\u3089\u3001\u8A9E\u9806\u3092\u898B\u308B\u3060\u3051\u3067\u3001\u610F\u5473\u304C\u5206\u304B\u308B\u3093\u3060"),
          b("\u666E\u901A", "\u5206\u304B\u3089\u306A\u304F\u306A\u3063\u305F\u3089\u3001\u307E\u305A\u30A4\u30E1\u30FC\u30B8\u3057\u3066\u306D"),
          b("\u666E\u901A", "\u4E3B\u5F79\u304C\u3044\u3066\u3001\u305D\u306E\u4E3B\u5F79\u81EA\u8EAB\u304C\u3069\u3046\u3057\u3066\u308B\uFF1F\u304B\u3089\u3001\u5C11\u3057\u305A\u3064\u5916\u3078\u898B\u3066\u3044\u3051\u3070\u3044\u3044\u3088"),
          b("\u666E\u901A", "5\u3064\u306E\u578B\u306F\u3001\u8A9E\u9806\u306E\u307E\u3068\u3081\u306A\u3093\u3060\u3002\u8A9E\u9806\u306F\u3001\u201C\u95A2\u4FC2\u201D\u3092\u8868\u3057\u3066\u3044\u308B\u3093\u3060\u3088"),
          g("\u9A5A\u304F", "\u8A9E\u9806\u304C\u3001\u95A2\u4FC2\u3092\u8868\u3057\u3066\u308B\u2026\u2026\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u4E3B\u5F79\u304C\u3001\u76F8\u624B\u306B\u3069\u3046\u50CD\u304D\u304B\u3051\u308B\u306E\u304B\uFF1F\n\u4E3B\u5F79\u3068\u3001\u3069\u3093\u306A\u95A2\u4FC2\uFF08\u72B6\u614B\uFF09\u304C\u3042\u308B\u306E\u304B\uFF1F"),
          g("\u8003\u3048\u308B", "\u305D\u306E2\u3064\u3092\u8003\u3048\u308B\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u3046\u3093\u3002\u8A71\u3057\u59CB\u3081\u308B\u524D\u306B\u3001\u3053\u308C\u3092\u610F\u8B58\u3057\u3066\u307F\u3066\u306D"),
          sum("\u571F\u53F0\u3092\u4F5C\u308C\u305F\uFF01")
        ] }
      ];
      const H2 = "\u8DB3\u3059\u8A00\u8449\u306F\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u524D\u304B\u5F8C\u308D\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7";
      const HE = "\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u4E26\u3079\u3088\u3046\n\uFF08\u8DB3\u3059\u8A00\u8449\u306F\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u524D\u304B\u5F8C\u308D\uFF09";
      const HS = "\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u4E26\u3079\u3088\u3046\n\uFF08\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\uFF09";
      const HELP2 = "\u307E\u305A\u571F\u53F0\uFF08\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F\uFF09\u3002\u3061\u3087\u3044\u8DB3\u3057\u306F\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u524D\u304B\u5F8C\u308D\u3060\u3088";
      const LESSONS2 = [
        { id: "2-0", name: "\u3061\u3087\u3044\u8DB3\u3057\u3063\u3066\u3001\u306A\u306B\uFF1F", coin: 5, help: HELP2, steps: [
          b("\u666E\u901A", "\u3053\u3053\u304B\u3089\u306F\u3001\u571F\u53F0\u306B\u8DB3\u3057\u3066\u3044\u304F\u3088\u3002\u307E\u305A\u306F\u3001\u304A\u3055\u3089\u3044\u304B\u3089"),
          bd(["S:\u2460\u4E3B\u5F79", "V:\u2461\u3069\u3046\u3057\u3066\u308B\uFF1F", "O:\u2462\u76F8\u624B"], { arrow: "out", small: 1, cap: "\u571F\u53F0\u306F\u3001\u3053\u306E\u9806\u756A" }),
          b("\u666E\u901A", "\u571F\u53F0\u306B\u306F\u3001\u9806\u756A\u304C\u3042\u308B\u3088\u3002\u2460\u4E3B\u5F79 \u2192 \u2461\u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u2462\u76F8\u624B\u3001\u3060\u306D"),
          b("\u666E\u901A", "\u3053\u308C\u304B\u3089\u306F\u3001\u3053\u306E\u756A\u53F7\u3067\u547C\u3076\u3088\u3002\u8DB3\u3057\u8A00\u8449\u3092\u3064\u3051\u308B\u6642\u306B\u3001\u8FF7\u308F\u306A\u3044\u3088\u3046\u306B\u306D"),
          g("\u8003\u3048\u308B", "\u2460\u2461\u2462\u3063\u3066\u3001\u6570\u5B57\u3067\u547C\u3076\u306E\u306D"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u2460\u3068\u2461\u306F\u3001\u305D\u306E\u4EBA\u81EA\u8EAB\u306E\u8A71\u3002\u2462\u304B\u3089\u3001\u5916\u306E\u4E16\u754C\u306B\u51FA\u3066\u3044\u304F\u3093\u3060"),
          b("\u666E\u901A", "\u2460\u3068\u2461\u306F\u3001\u6700\u4F4E\u9650\u5FC5\u8981\u3060\u3088\u3002Birds fly. \u307F\u305F\u3044\u306B\u3001\u2461\u3060\u3051\u3067\u5B8C\u7D50\u3059\u308B\u6587\u3082\u3042\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u2462\u304C\u306A\u3044\u6587\u3082\u3001\u3042\u308B\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u300C\u8AB0\u306B\u300D\u306F\u3001\u756A\u53F7\u306A\u3057\u3002\u7269\u307E\u3067\u8A00\u3048\u3070\u3001\u305D\u306E\u4EBA\u306E\u8AAC\u660E\u306F\u7D42\u308F\u308A\u3060\u304B\u3089\u3001\u3042\u3068\u304B\u3089\u8DB3\u3059\u88DC\u8DB3\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "5\u3064\u306E\u578B\u306F\u3001\u3053\u306E\u2460\u2461\u2462\u306E\u7D44\u307F\u5408\u308F\u305B\u306A\u3093\u3060\u306D"),
          C("Birds fly.", "\u305F\u3060\u3059\u308B\u6587"),
          C("She gives me flowers.", "\u306F\u3044\u3069\u3046\u305E\uFF01\u6587"),
          g("\u559C\u3076", "\u3070\u3063\u3061\u308A\uFF01 \u571F\u53F0\u306F\u3001\u3082\u3046\u5927\u4E08\u592B\u305D\u3046"),
          g("\u7126\u308B", "\u3067\u3082\u3001Birds fly. \u3060\u3051\u3060\u3068\u3001\u3061\u3087\u3063\u3068\u7269\u8DB3\u308A\u306A\u3044\u304B\u3082\u2026\u2026\u3002\u3082\u3063\u3068\u8A73\u3057\u304F\u8A00\u3044\u305F\u3044\u6642\u306F\u3001\u3069\u3046\u3059\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3053\u3067\u4F7F\u3046\u306E\u304C\u201C\u3061\u3087\u3044\u8DB3\u3057\u201D\u3060\u3088\u3002\u571F\u53F0\u306F\u305D\u306E\u307E\u307E\u306B\u3057\u3066\u3001\u8A00\u8449\u3092\u8DB3\u3059\u3093\u3060"),
          b("\u666E\u901A", "\u307E\u305A\u306F\u3001\u3044\u3061\u3070\u3093\u7C21\u5358\u306A\u306E\u304B\u3089\u3002\u201C\u3069\u3053\u3067\uFF1F\u201D\u201C\u3044\u3064\uFF1F\u201D\u3092\u8DB3\u3057\u3066\u307F\u3088\u3046"),
          bd(["S:Birds", "V:fly", "W:in the park|\u516C\u5712\u3067|\u3069\u3053"], { cap: "Birds fly in the park.\u3000\u9CE5\u304C\u516C\u5712\u3067\u98DB\u3076" }),
          b("\u666E\u901A", "\u571F\u53F0\u306E\u5F8C\u308D\u306B in the park \u3092\u8DB3\u3057\u305F\u3088\u3002\u300C\u516C\u5712\u3067\u300D\u3002\u3069\u3053\u3067\u98DB\u3076\u306E\u304B\u304C\u5206\u304B\u308B\u306D"),
          b("\u666E\u901A", "\u30AB\u30FC\u30C9\u306E\u4E0B\u306B\u306F\u3001\u8A00\u8449\u306E\u610F\u5473\u3068\u3001\u8DB3\u3057\u8A00\u8449\u306E\u7A2E\u985E\u3092\u66F8\u3044\u3066\u3042\u308B\u3088\u3002in the park \u306F\u300C\u3069\u3053\u300D\u306E\u8A00\u8449\u3060\u306D"),
          g("\u8003\u3048\u308B", "in the park \u3063\u3066\u30013\u3064\u306E\u8A00\u8449\u306A\u306E\u306B\u30011\u679A\u306E\u30AB\u30FC\u30C9\u306A\u3093\u3060\u306D\u3002in \u3068\u304B the \u3063\u3066\u3001\u4F55\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3044\u3044\u8CEA\u554F\uFF01 in \u3084 the \u306F\u3001\u3042\u3068\u3067\u304F\u308F\u3057\u304F\u89E3\u8AAC\u3059\u308B\u306D\u3002\u4ECA\u306F\u3001\u30AB\u30FC\u30C9\u305C\u3093\u305F\u3044\u3067\u300C\u516C\u5712\u3067\u300D\u3068\u3044\u3046\u610F\u5473\u3001\u3068\u53D7\u3051\u53D6\u308C\u3070OK\u3060\u3088"),
          g("\u559C\u3076", "\u308F\u304B\u3063\u305F\u3002\u304B\u305F\u307E\u308A\u306E\u307E\u307E\u3001\u899A\u3048\u308B\u306D"),
          b("\u666E\u901A", "\u5927\u4E8B\u306A\u306E\u306F\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u3067\u5165\u308B\u3053\u3068\u3002\u30D0\u30E9\u30D0\u30E9\u306B\u3057\u306A\u3044\u3067\u30011\u3064\u306E\u8DB3\u3057\u8A00\u8449\u3068\u3057\u3066\u3001\u571F\u53F0\u306B\u8DB3\u3059\u3093\u3060"),
          b("\u666E\u901A", "\u3069\u3053\u30FB\u3044\u3064 \u306F\u3001\u6587\u305C\u3093\u305F\u3044\u306B\u8DB3\u3059\u8A00\u8449\u3002\u3060\u304B\u3089\u201C\u5834\u9762\u201D\u3063\u3066\u547C\u3076\u3088\u3002\u2460\u2461\u2462\u306B\u306F\u5165\u3089\u306A\u3044\u3001\u756A\u53F7\u306A\u3057\u306E\u8A00\u8449\u3060\u306D"),
          bd(["W:In the park,|\u516C\u5712\u3067|\u3069\u3053", "S:birds", "V:fly"], { cap: "In the park, birds fly.\u3000\u516C\u5712\u3067\u3001\u9CE5\u304C\u98DB\u3076" }),
          b("\u3072\u3089\u3081\u304F", "\u5834\u9762\u306F\u3001\u6587\u306E\u6700\u521D\u306B\u3082\u7F6E\u3051\u308B\u3088\u3002\u6700\u521D\u306B\u7F6E\u304F\u6642\u306F\u3001\u3059\u3050\u5F8C\u308D\u306B\u30AB\u30F3\u30DE\uFF08,\uFF09\u3092\u4ED8\u3051\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u524D\u306B\u7F6E\u3044\u3066\u3082\u3001\u5F8C\u308D\u306B\u7F6E\u3044\u3066\u3082\u3001\u540C\u3058\u610F\u5473\u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u8A00\u3044\u305F\u3044\u3053\u3068\u306F\u540C\u3058\u3002\u3067\u3082\u3001\u5F79\u5272\u304C\u9055\u3046\u3093\u3060\u3002\u6700\u521D\u306B\u7F6E\u304F\u3068\u300C\u307E\u305A\u5834\u9762\u3092\u6C7A\u3081\u308B\u300D\u3002\u6700\u5F8C\u306B\u7F6E\u304F\u3068\u300C\u3042\u3068\u304B\u3089\u8A00\u3044\u8DB3\u3059\u300D\u3060\u3088"),
          g("\u3072\u3089\u3081\u304F", "\u6700\u521D\u306B\u300C\u516C\u5712\u3067\u306F\u306D\u300D\u3063\u3066\u6C7A\u3081\u308B\u304B\u3001\u8A00\u3063\u305F\u3042\u3068\u3067\u300C\u516C\u5712\u3067\u306D\u300D\u3063\u3066\u8DB3\u3059\u304B\u3001\u306E\u9055\u3044\u306A\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\uFF01 \u524D\u3067\u3082\u5F8C\u308D\u3067\u3082\u3044\u3044\u3051\u3069\u3001\u7F6E\u304F\u5834\u6240\u3067\u3001\u5F79\u5272\u304C\u5909\u308F\u308B\u3093\u3060"),
          E("\u9CE5\u304C\u516C\u5712\u3067\u98DB\u3076", ["S:\u9CE5\u304C", "V:\u98DB\u3076", "W:\u516C\u5712\u3067"], [0, 2, 1], "\u5834\u9762\u306F\u3001\u6587\u306E\u6700\u5F8C\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002\u6700\u521D\u306B\u7F6E\u3044\u3066\u3082OK\u3060\u3088", { alt: [{ o: [2, 0, 1] }], hint: HS }),
          A("\u9CE5\u304C\u516C\u5712\u3067\u98DB\u3076", ["S:Birds", "V:fly", "W:in the park|\u516C\u5712\u3067|\u3069\u3053"], { alt: [{ o: [2, 0, 1], t: ["In the park,", "birds", "fly"] }], hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          sum("\u8DB3\u3057\u8A00\u8449\u306F\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u3067\u5165\u308B\u3002\u524D\u3067\u3082\u5F8C\u308D\u3067\u3082OK\u3060\u3051\u3069\u3001\u5F79\u5272\u304C\u9055\u3046")
        ] },
        { id: "2-1", name: "\u5834\u9762\u3092\u8DB3\u3057\u3066\u307F\u3088\u3046", coin: 5, help: HELP2, steps: [
          b("\u666E\u901A", "\u307E\u305A\u306F\u3001\u5834\u9762\u3092\u3082\u3046\u5C11\u3057\u3084\u3063\u3066\u307F\u3088\u3046\u3002\u201C\u3069\u3053\u201D\u3068\u201C\u3044\u3064\u201D\u3092\u8DB3\u3059\u3093\u3060"),
          bd(["S:Tom", "V:runs"], { cap: "Tom runs.\u3000\u30C8\u30E0\u306F\u8D70\u308B" }),
          bd(["S:Tom", "V:runs", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { cap: "Tom runs every day.\u3000\u30C8\u30E0\u306F\u6BCE\u65E5\u8D70\u308B" }),
          g("\u8003\u3048\u308B", "every day \u306F\u3001Tom \u3060\u3051\u3067\u3082 runs \u3060\u3051\u3067\u3082\u306A\u304F\u3066\u3001\u6587\u305C\u3093\u305F\u3044\u306B\u3064\u304F\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u305D\u3046\u3002every day \u306F\u300C\u3044\u3064\u300D\u306E\u8A00\u8449\u3002\u6587\u305C\u3093\u305F\u3044\u306E\u5834\u9762\u3092\u8868\u3059\u3093\u3060\u3002\u3072\u3068\u304B\u305F\u307E\u308A\u3067\u30011\u679A\u306E\u30AB\u30FC\u30C9\u3060\u3088"),
          bd(["W:Every day,|\u6BCE\u65E5|\u3044\u3064", "S:Tom", "V:runs"], { cap: "Every day, Tom runs.\u3000\u6BCE\u65E5\u3001\u30C8\u30E0\u306F\u8D70\u308B" }),
          b("\u666E\u901A", "\u6700\u521D\u306B\u7F6E\u3044\u3066\u3082\u3044\u3044\u3088\u3002\u3055\u3063\u304D\u306E\u901A\u308A\u3001\u6700\u521D\u306F\u300C\u307E\u305A\u5834\u9762\u3092\u6C7A\u3081\u308B\u300D\u3001\u6700\u5F8C\u306F\u300C\u8A00\u3044\u8DB3\u3059\u300D\u3060\u306D"),
          b("\u666E\u901A", "\u3075\u3064\u3046\u306F\u3001\u5834\u6240\u3084\u6642\u9593\u306F\u3001\u5F8C\u308D\u306B\u7F6E\u304F\u3053\u3068\u304C\u591A\u3044\u3093\u3060\u3002\u6700\u521D\u306B\u7F6E\u304F\u306E\u306F\u3001\u8A71\u306E\u5834\u9762\u3092\u5207\u308A\u304B\u3048\u305F\u3044\u6642\u3060\u3088"),
          g("\u7126\u308B", "\u3058\u3083\u3042\u3001\u57FA\u672C\u306F\u5F8C\u308D\u3060\u306D\uFF01 \u2026\u2026\u3042\u308C\uFF1F \u5834\u6240\u3068\u6642\u9593\u304C\u4E21\u65B9\u3042\u3063\u305F\u3089\u3001\u3069\u3063\u3061\u304C\u5148\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u8FF7\u3063\u305F\u3089\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\u3002\u8A9E\u5442\u5408\u308F\u305B\u3067\u3001\u30C9\u30A4\u30C4\u3067\u899A\u3048\u3088\u3046\uFF01"),
          g("\u9A5A\u304F", "\u30C9\u30A4\u30C4\uFF01\uFF1F \u3069\u3053\u3001\u3044\u3064\u2026\u2026\u305F\u3057\u304B\u306B\uFF01 \u5FD8\u308C\u306A\u3055\u305D\u3046"),
          bd(["S:Mika", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { small: 1, cap: "Mika sings in the park every day.\u3000\u30DF\u30AB\u306F\u6BCE\u65E5\u516C\u5712\u3067\u6B4C\u3046" }),
          g("\u8003\u3048\u308B", "\u65E5\u672C\u8A9E\u3060\u3068\u300C\u6BCE\u65E5\u3001\u516C\u5712\u3067\u300D\u306A\u306E\u306B\u3001\u82F1\u8A9E\u306F\u9006\u306B\u306A\u308B\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002\u82F1\u8A9E\u306F\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u3002\u30C9\u30A4\u30C4\u3001\u3060\u306D"),
          bd(["W:Yesterday,|\u6628\u65E5|\u3044\u3064", "S:she", "V:ran"], { cap: "Yesterday, she ran.\u3000\u6628\u65E5\u3001\u5F7C\u5973\u306F\u8D70\u3063\u305F" }),
          g("\u9A5A\u304F", "ran\uFF1F runs \u3058\u3083\u306A\u3044\u306E\uFF1F"),
          b("\u666E\u901A", "\u6628\u65E5\u306E\u3053\u3068\u306F\u3001ran \u3068\u3044\u3046\u5F62\u306B\u306A\u308B\u3093\u3060\u3002\u52D5\u304D\u306E\u5F62\u306E\u5909\u5316\u306F\u3001\u3042\u3068\u3067\u3084\u308B\u304B\u3089\u3001\u4ECA\u306F\u201C\u305D\u3046\u3044\u3046\u5F62\u3082\u3042\u308B\u201D\u304F\u3089\u3044\u3067OK"),
          g("\u559C\u3076", "\u308F\u304B\u3063\u305F\uFF01 \u4ECA\u306F\u3001\u5834\u9762\u3092\u8DB3\u3059\u5834\u6240\u306B\u96C6\u4E2D\u3059\u308B\u306D"),
          E("\u30C8\u30E0\u306F\u6BCE\u65E5\u8D70\u308B", ["S:\u30C8\u30E0\u306F", "V:\u8D70\u308B", "W:\u6BCE\u65E5"], [0, 2, 1], "\u5834\u9762\u306F\u3001\u6587\u306E\u6700\u5F8C\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002\u6700\u521D\u306B\u7F6E\u3044\u3066\u3082OK\u3060\u3088", { alt: [{ o: [2, 0, 1] }], hint: HS }),
          E("\u30DF\u30AB\u306F\u516C\u5712\u3067\u6B4C\u3046", ["S:\u30DF\u30AB\u306F", "V:\u6B4C\u3046", "W:\u516C\u5712\u3067"], [0, 2, 1], "\u5834\u9762\u306F\u3001\u6587\u306E\u6700\u5F8C\u306B\u7F6E\u304F\u306E\u304C\u57FA\u672C\u3002\u6700\u521D\u306B\u7F6E\u3044\u3066\u3082OK\u3060\u3088", { alt: [{ o: [2, 0, 1] }], hint: HS }),
          E("\u30DF\u30AB\u306F\u6BCE\u65E5\u516C\u5712\u3067\u6B4C\u3046", ["S:\u30DF\u30AB\u306F", "V:\u6B4C\u3046", "W:\u516C\u5712\u3067", "W:\u6BCE\u65E5"], [0, 3, 2, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u6BCE\u65E5\u30FB\u516C\u5712\u3067\u300D\u3002\u82F1\u8A9E\u306F\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\u3060\u3088\uFF08\u30C9\u30A4\u30C4\uFF01\uFF09", { hint: "\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u4E26\u3079\u3088\u3046\n\uFF08\u5834\u9762\u306F\u5F8C\u308D\u306B\u3002\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\uFF09" }),
          A("\u30C8\u30E0\u306F\u6BCE\u65E5\u8D70\u308B", ["S:Tom", "V:runs", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { alt: [{ o: [2, 0, 1], t: ["Every day,", "Tom", "runs"] }], hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          A("\u30DF\u30AB\u306F\u516C\u5712\u3067\u6B4C\u3046", ["S:Mika", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053"], { alt: [{ o: [2, 0, 1], t: ["In the park,", "Mika", "sings"] }], hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          A("\u30DF\u30AB\u306F\u6BCE\u65E5\u516C\u5712\u3067\u6B4C\u3046", ["S:Mika", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { hint: "\u5834\u9762\u306F\u5F8C\u308D\u306B\u3002\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\uFF08\u30C9\u30A4\u30C4\uFF01\uFF09" }),
          D("\u30B1\u30F3\u306F\u671D\u306B\u8D70\u308B", ["S:Ken", "V:runs", "W:\u671D\u306B|\u3044\u3064"], { en: "Ken runs in the morning.", words: [["\u671D\u306B", "in the morning"]], alt: [{ o: [2, 0, 1], t: ["In the morning,", "Ken", "runs"] }], hint: "\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067OK\u3002\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082\u5927\u4E08\u592B" }),
          sum("\u5834\u9762\uFF08\u3069\u3053\u30FB\u3044\u3064\uFF09\u306F\u3001\u6587\u305C\u3093\u305F\u3044\u306B\u8DB3\u3059\u3002\u5F8C\u308D\u306B\u7F6E\u304F\u3053\u3068\u304C\u591A\u304F\u3066\u30012\u3064\u306A\u3089\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\uFF08\u30C9\u30A4\u30C4\uFF09")
        ] },
        { id: "2-2", name: "\u4E3B\u5F79\u3092\u8A73\u3057\u304F\u3059\u308B", coin: 5, help: HELP2, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u3001\u4EBA\u30FB\u7269\u3084\u52D5\u304D\u3092\u8A73\u3057\u304F\u3059\u308B\u3088\u3002\u8DB3\u3059\u306E\u306F\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u3001\u524D\u304B\u5F8C\u308D\u3060\u3051"),
          bd(["F:\u524D\u3061\u3087\u3044\u8DB3\u3057", "S:\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E", "R:\u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057"], { small: 1, cap: "\u524D\u3061\u3087\u3044\u8DB3\u3057 \uFF0B\u3010\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u3011\uFF0B \u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057" }),
          b("\u666E\u901A", "\u8DB3\u3057\u8A00\u8449\u3082\u3001\u756A\u53F7\u306A\u3057\u3002\u2460\u2461\u2462\u306E\u3069\u3053\u304B\u3092\u3001\u8A73\u3057\u304F\u3059\u308B\u3060\u3051\u3060\u3088"),
          b("\u666E\u901A", "\u307E\u305A\u306F\u300C\u2460\u4E3B\u5F79\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u307F\u3088\u3046\u3002\u3069\u3093\u306A\u4EBA\u30FB\u7269\u304B\u3001\u3069\u3053\u306E\u4EBA\u30FB\u7269\u304B\u3092\u8DB3\u3059\u3093\u3060"),
          bd(["S:Birds", "V:fly"], { cap: "Birds fly.\u3000\u9CE5\u304C\u98DB\u3076" }),
          bd(["F:Small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:birds", "V:fly"], { arrow: "add:0>1", cap: "Small birds fly.\u3000\u5C0F\u3055\u3044\u9CE5\u304C\u98DB\u3076" }),
          g("\u9A5A\u304F", "\u4E3B\u5F79\u306E\u524D\u306B Small \u3092\u8DB3\u3057\u305F\u3089\u3001\u201C\u5C0F\u3055\u3044\u9CE5\u201D\u306B\u306A\u3063\u305F\uFF01"),
          b("\u666E\u901A", "Small \u306F\u300C\u3069\u3093\u306A\u300D\u306E\u8A00\u8449\u3002\u3069\u3093\u306A\u9CE5\u304B\u3092\u8DB3\u3057\u3066\u3044\u308B\u3088"),
          b("\u666E\u901A", "\u8DB3\u3057\u3066\u3082\u3001\u571F\u53F0\u306E\u9806\u756A\u306F\u5909\u308F\u3089\u306A\u3044\u3088\u3002\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u306E\u307E\u307E\u3060\u306D"),
          bd(["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:sings"], { arrow: "add:0>1", cap: "My friend sings.\u3000\u79C1\u306E\u53CB\u3060\u3061\u306F\u6B4C\u3046" }),
          b("\u666E\u901A", "my \u306F\u300C\u3060\u308C\u306E\u300D\u306E\u8A00\u8449\u3002\u8AB0\u306E\u3082\u306E\u304B\u3092\u8DB3\u3057\u3066\u3001\u4E3B\u5F79\u306E\u524D\u306B\u7F6E\u304F\u3088"),
          bd(["F:a small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cat"], { arrow: "add:0>1", cap: "a small cat\u3000\u5C0F\u3055\u3044\u306D\u3053" }),
          b("\u666E\u901A", "a small cat \u306F\u300C\u5C0F\u3055\u3044\u306D\u3053\u300D\u3002\u8DB3\u3057\u305F\u8A00\u8449\u3068\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306F\u3001\u30BB\u30C3\u30C8\u30671\u3064\u306E\u67A0\u3060\u3088"),
          g("\u7126\u308B", "a \u3063\u3066\u3001\u4F55\uFF1F the \u3068\u304B\u3082\u3001\u3088\u304F\u898B\u304B\u3051\u308B\u3051\u3069\u2026\u2026"),
          b("\u666E\u901A", "a \u3084 the \u306F\u3001\u3082\u306E\u3068\u30DA\u30A2\u306B\u306A\u308B\u8A00\u8449\u3002\u304F\u308F\u3057\u304F\u306F\u3001\u3042\u3068\u3067\u3084\u308B\u304B\u3089\u3001\u4ECA\u306F\u305D\u306E\u307E\u307E\u7F6E\u3044\u3066\u304A\u3051\u3070\u5927\u4E08\u592B\u3060\u3088"),
          bd(["S:Kids", "R:from Osaka|\u5927\u962A\u306E|\u3069\u3053\u306E", "V:sing"], { arrow: "add:1>0", small: 1, cap: "Kids from Osaka sing.\u3000\u5927\u962A\u306E\u5B50\u3069\u3082\u305F\u3061\u304C\u6B4C\u3046" }),
          b("\u3072\u3089\u3081\u304F", "\u5F8C\u308D\u306B\u8DB3\u3059\u3053\u3068\u3082\u3067\u304D\u308B\u3088\u3002Kids from Osaka sing. \u306F\u300C\u5927\u962A\u306E\u5B50\u3069\u3082\u305F\u3061\u304C\u6B4C\u3046\u300D"),
          b("\u666E\u901A", "from Osaka \u306F\u300C\u3069\u3053\u306E\u300D\u306E\u8A00\u8449\u3002\u3069\u3053\u306E\u5B50\u3069\u3082\u305F\u3061\u304B\u3001\u3092\u8DB3\u3057\u3066\u3044\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u65E5\u672C\u8A9E\u306F\u300C\u5927\u962A\u306E\u5B50\u3069\u3082\u305F\u3061\u300D\u306A\u306E\u306B\u3001\u82F1\u8A9E\u306F kids \u304C\u5148\u3067\u3001from Osaka \u304C\u3042\u3068\u306A\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u3044\u3044\u3068\u3053\u308D\u306B\u6C17\u3065\u3044\u305F\u306D\u3002\u65E5\u672C\u8A9E\u306F\u8DB3\u3059\u8A00\u8449\u3092\u524D\u306B\u7F6E\u304F\u3051\u3069\u3001\u82F1\u8A9E\u306F\u5F8C\u308D\u306B\u3082\u7F6E\u304F\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u524D\u3068\u5F8C\u308D\u306F\u3001\u3069\u3046\u4F7F\u3044\u5206\u3051\u308B\u306E\uFF1F"),
          b("\u666E\u901A", "\u76EE\u5B89\u306F\u3001\u77ED\u3044\u8A00\u8449\u306F\u524D\u3001\u9577\u3081\u306E\u8A00\u8449\u306F\u5F8C\u308D\u3002small \u3084 my \u306F\u524D\u3067\u3001from Osaka \u307F\u305F\u3044\u306A\u8A00\u8449\u306F\u5F8C\u308D\u3060\u3088"),
          g("\u559C\u3076", "\u77ED\u3044\u306E\u306F\u524D\u3001\u9577\u3044\u306E\u306F\u5F8C\u308D\u3002\u899A\u3048\u3084\u3059\u3044\u306D\uFF01"),
          g("\u3072\u3089\u3081\u304F", "\u4E3B\u5F79\u306E\u3068\u3053\u308D\u304C\u3001\u8DB3\u3057\u305F\u8A00\u8449\u3068\u306E1\u3064\u306E\u67A0\u306B\u306A\u3063\u305F\u3060\u3051\u3067\u3001\u571F\u53F0\u306F\u305D\u306E\u307E\u307E\u3060\u306D\uFF01"),
          b("\u666E\u901A", "\u305D\u306E\u901A\u308A\u3002\u3058\u3083\u3042\u3001\u7DF4\u7FD2\u3057\u3066\u307F\u3088\u3046\u3002\u8DB3\u3059\u8A00\u8449\u306F\u3001\u524D\u304B\u5F8C\u308D\u304B\u3001\u8003\u3048\u3066\u306D"),
          E("\u5C0F\u3055\u3044\u9CE5\u304C\u98DB\u3076", ["F:\u5C0F\u3055\u3044", "S:\u9CE5\u304C", "V:\u98DB\u3076"], [0, 1, 2], "\u77ED\u3044\u8A00\u8449\u306F\u3001\u65E5\u672C\u8A9E\u3068\u540C\u3058\u3067\u4E3B\u5F79\u306E\u524D\u3060\u3088", { hint: HE }),
          E("\u5927\u962A\u306E\u5B50\u3069\u3082\u305F\u3061\u304C\u6B4C\u3046", ["S:\u5B50\u3069\u3082\u305F\u3061\u304C", "R:\u5927\u962A\u306E", "V:\u6B4C\u3046"], [1, 0, 2], "\u65E5\u672C\u8A9E\u306F\u300C\u5927\u962A\u306E\u30FB\u5B50\u3069\u3082\u305F\u3061\u300D\u3002\u82F1\u8A9E\u306F\u300C\u5B50\u3069\u3082\u305F\u3061\u300D\u304C\u5148\u3067\u3001\u8DB3\u3059\u3082\u306E\u306F\u3042\u3068", { hint: HE }),
          A("\u5C0F\u3055\u3044\u9CE5\u304C\u98DB\u3076", ["F:Small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:birds", "V:fly"], { hint: H2 }),
          A("\u5927\u962A\u306E\u5B50\u3069\u3082\u305F\u3061\u304C\u6B4C\u3046", ["S:Kids", "R:from Osaka|\u5927\u962A\u306E|\u3069\u3053\u306E", "V:sing"], { hint: H2 }),
          A("\u79C1\u306E\u53CB\u3060\u3061\u306F\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:sings"], { hint: H2 }),
          D("\u79C1\u306E\u53CB\u3060\u3061\u306F\u5230\u7740\u3059\u308B", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:\u5230\u7740\u3059\u308B"], { en: "My friend arrives.", words: [["\u5230\u7740\u3059\u308B", "arrives"]] }),
          sum("\u4E3B\u5F79\u306E\u524D\uFF08\u77ED\u3044\u8A00\u8449\uFF09\u304B\u5F8C\u308D\uFF08\u9577\u3081\u306E\u8A00\u8449\uFF09\u306B\u8DB3\u305B\u308B\u3002\u571F\u53F0\u306E\u9806\u756A\u306F\u5909\u308F\u3089\u306A\u3044")
        ] },
        { id: "2-3", name: "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u8A73\u3057\u304F\u3059\u308B", coin: 5, help: HELP2, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u300C\u2461\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u307F\u3088\u3046\u3002\u8DB3\u3059\u8A00\u8449\u306E\u4E0B\u306B\u306F\u3001\u3069\u3093\u306A\u8DB3\u3057\u8A00\u8449\u304B\u3092\u66F8\u3044\u3066\u304A\u304F\u3088"),
          bd(["S:Tom", "V:runs"], { cap: "Tom runs.\u3000\u30C8\u30E0\u306F\u8D70\u308B" }),
          bd(["S:Tom", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], { arrow: "add:2>1", cap: "Tom runs fast.\u3000\u30C8\u30E0\u306F\u901F\u304F\u8D70\u308B" }),
          g("\u559C\u3076", "runs \u306E\u5F8C\u308D\u306B fast \u3092\u8DB3\u3057\u305F\u3089\u3001\u201C\u901F\u304F\u8D70\u308B\u201D\u306B\u306A\u3063\u305F\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002fast \u306F\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306E\u8A00\u8449\u3002\u3069\u3046\u8D70\u308B\u304B\u3092\u6559\u3048\u3066\u304F\u308C\u3066\u3001\u5F8C\u308D\u306B\u8DB3\u3059\u3088"),
          bd(["S:Mika", "V:sings", "R:well|\u4E0A\u624B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], { arrow: "add:2>1", cap: "Mika sings well.\u3000\u30DF\u30AB\u306F\u4E0A\u624B\u306B\u6B4C\u3046" }),
          b("\u3072\u3089\u3081\u304F", "Mika sings well.\u300E\u4E0A\u624B\u306B\u6B4C\u3046\u300F\u3002well \u3082\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306E\u8A00\u8449\u3067\u3001\u540C\u3058\u4F7F\u3044\u65B9\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u524D\u306B\u8DB3\u3059\u3053\u3068\u306F\u3001\u306A\u3044\u306E\uFF1F"),
          bd(["S:Tom", "F:really|\u672C\u5F53\u306B|\u3069\u308C\u304F\u3089\u3044", "V:likes", "O:music"], { small: 1, arrow: "add:1>2", cap: "Tom really likes music.\u3000\u30C8\u30E0\u306F\u97F3\u697D\u304C\u672C\u5F53\u306B\u597D\u304D" }),
          b("\u666E\u901A", "\u3042\u308B\u3088\u3002really \u306F\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306E\u8A00\u8449\u3002\u3069\u306E\u304F\u3089\u3044\u597D\u304D\u304B\u3092\u8DB3\u3057\u3066\u3001\u524D\u306B\u7F6E\u304F\u3093\u3060"),
          g("\u8003\u3048\u308B", "fast \u306F\u5F8C\u308D\u3067\u3001really \u306F\u524D\u2026\u2026\u3002\u3069\u3046\u899A\u3048\u308C\u3070\u3044\u3044\u304B\u306A"),
          b("\u666E\u901A", "\u5927\u4E08\u592B\u3002\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306F\u5F8C\u308D\u3001\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306F\u524D\u3002\u30AB\u30FC\u30C9\u306E\u4E0B\u306B\u7A2E\u985E\u304C\u66F8\u3044\u3066\u3042\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u300C\u76F8\u624B\u300D\u304C\u3042\u308B\u6587\u3067\u3082\u3001\u540C\u3058\uFF1F"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u305F\u3060\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u3001\u3044\u3064\u3082\u96A3\u3069\u3046\u3057\u306A\u3093\u3060\u3002\u9593\u306B\u306F\u5165\u308C\u306A\u3044\u3067\u306D"),
          bd(["S:Tom", "V:likes", "R:really|\u672C\u5F53\u306B|\u3069\u308C\u304F\u3089\u3044", "O:music"], { small: 1, mark: "\xD7", bad: 2, cap: "Tom likes really music.\u3000\u9593\u306B\u5165\u308C\u308B\u306E\u306F\u30C0\u30E1" }),
          g("\u559C\u3076", "\u4E86\u89E3\uFF01 \u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u3001\u96A3\u3069\u3046\u3057\u306A\u3093\u3060\u306D"),
          E("\u30C8\u30E0\u306F\u901F\u304F\u8D70\u308B", ["S:\u30C8\u30E0\u306F", "V:\u8D70\u308B", "R:\u901F\u304F"], [0, 2, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u901F\u304F\u30FB\u8D70\u308B\u300D\u3002\u82F1\u8A9E\u306F\u300C\u8D70\u308B\u300D\u304C\u5148\u3067\u3001\u8DB3\u3059\u3082\u306E\u306F\u3042\u3068", { hint: HE }),
          E("\u30C8\u30E0\u306F\u97F3\u697D\u304C\u672C\u5F53\u306B\u597D\u304D", ["S:\u30C8\u30E0\u306F", "F:\u672C\u5F53\u306B", "V:\u597D\u304D", "O:\u97F3\u697D\u304C"], [0, 3, 1, 2], "\u300C\u672C\u5F53\u306B\u300D\u306F\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u524D\u3002\u300C\u97F3\u697D\u304C\u300D\u306F\u3001\u65E5\u672C\u8A9E\u3067\u306F\u524D\u3060\u3051\u3069\u3001\u82F1\u8A9E\u3067\u306F\u5F8C\u308D", { hint: HE }),
          A("\u30DF\u30AB\u306F\u4E0A\u624B\u306B\u6B4C\u3046", ["S:Mika", "V:sings", "R:well|\u4E0A\u624B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], { hint: H2 }),
          A("\u30C8\u30E0\u306F\u672C\u5F53\u306B\u97F3\u697D\u304C\u597D\u304D", ["S:Tom", "F:really|\u672C\u5F53\u306B|\u3069\u308C\u304F\u3089\u3044", "V:likes", "O:music"], { hint: H2 }),
          D("\u30DF\u30AB\u306F\u3086\u3063\u304F\u308A\u6B69\u304F", ["S:Mika", "V:\u6B69\u304F", "R:\u3086\u3063\u304F\u308A|\u3069\u3093\u306A\u3075\u3046\u306B"], { en: "Mika walks slowly.", words: [["\u6B69\u304F", "walks"], ["\u3086\u3063\u304F\u308A", "slowly"]] }),
          sum("\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u8A73\u3057\u304F\u3059\u308B\u8DB3\u3057\u8A00\u8449\u3002\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u96A3\u3069\u3046\u3057\u3002\u9593\u306B\u306F\u5165\u308C\u306A\u3044")
        ] },
        { id: "2-4", name: "\u305D\u306E\u5148\u306E\u4EBA\u30FB\u7269\u3092\u8A73\u3057\u304F\u3059\u308B", coin: 5, help: HELP2, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u300C\u2462\u76F8\u624B\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u307F\u3088\u3046\u3002\u3084\u308A\u65B9\u306F\u3001\u2460\u306E\u6642\u3068\u540C\u3058\u3060\u3088"),
          bd(["S:Tom", "V:likes", "O:music"], { arrow: "out", cap: "Tom likes music.\u3000\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D" }),
          bd(["S:Tom", "V:likes", "F:old|\u53E4\u3044|\u3069\u3093\u306A", "O:music"], { small: 1, arrow: "add:2>3", cap: "Tom likes old music.\u3000\u30C8\u30E0\u306F\u53E4\u3044\u97F3\u697D\u304C\u597D\u304D" }),
          g("\u8003\u3048\u308B", "\u3042\u308C\uFF1F old \u306F\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u4F55\u3092\u300D\u306E\u9593\u306B\u3042\u308B\u3051\u3069\u3001\u3044\u3044\u306E\uFF1F"),
          b("\u666E\u901A", "\u3044\u3044\u3093\u3060\u3002old \u306F\u300C\u4F55\u3092\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u3044\u308B\u304B\u3089\u3001\u300C\u4F55\u3092\u300D\u306E\u67A0\u306E\u4E2D\u3060\u3088\u3002\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u4F55\u3092\u300D\u306F\u3001\u3061\u3083\u3093\u3068\u96A3\u3069\u3046\u3057\u3067\u3057\u3087"),
          g("\u559C\u3076", "\u67A0\u306E\u4E2D\u306A\u3089\u3001\u3060\u3044\u3058\u3087\u3046\u3076\u306A\u3093\u3060\u306D\uFF01 \u201C\u53E4\u3044\u97F3\u697D\u201D\u306B\u306A\u3063\u305F\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u300C\u76F8\u624B\u300D\u3082\u4EBA\u30FB\u7269\u3060\u304B\u3089\u3001\u4E3B\u5F79\u3068\u540C\u3058\u3088\u3046\u306B\u3001\u524D\u3084\u5F8C\u308D\u306B\u8DB3\u305B\u308B\u3093\u3060"),
          bd(["S:Tom", "V:likes", "O:music", "R:from Japan|\u65E5\u672C\u306E|\u3069\u3053\u306E"], { small: 1, arrow: "add:3>2", cap: "Tom likes music from Japan.\u3000\u65E5\u672C\u306E\u97F3\u697D\u304C\u597D\u304D" }),
          b("\u666E\u901A", "from Japan \u306F\u300C\u3069\u3053\u306E\u300D\u306E\u8A00\u8449\u3002\u3069\u3053\u306E\u97F3\u697D\u304B\u3001\u3092\u8DB3\u3057\u3066\u3044\u308B\u3088"),
          g("\u8003\u3048\u308B", "from Japan \u306F\u5F8C\u308D\u306A\u3093\u3060\u306D\u3002\u9577\u3081\u306E\u8A00\u8449\u306F\u5F8C\u308D\u3001\u3060\u3063\u305F\u3088\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\uFF01 \u3061\u3083\u3093\u3068\u899A\u3048\u3066\u308B\u306D"),
          bd(["S:She", "V:gives", "I:me", "F:red|\u8D64\u3044|\u3069\u3093\u306A", "O:flowers"], { small: 1, arrow: "add:3>4", cap: "She gives me red flowers.\u3000\u8D64\u3044\u82B1\u3092\u304F\u308C\u308B" }),
          b("\u666E\u901A", "\u300C\u306F\u3044\u3069\u3046\u305E\uFF01\u6587\u300D\u3067\u3082\u540C\u3058\u3060\u3088\u3002\u300C\u4F55\u3092\u300D\u306E\u524D\u306B red \u3092\u8DB3\u3059\u3068\u3001\u201C\u8D64\u3044\u82B1\u201D\u306B\u306A\u308B"),
          g("\u3072\u3089\u3081\u304F", "\u3069\u306E\u201C\u4EBA\u30FB\u7269\u201D\u3067\u3082\u3001\u8DB3\u3057\u65B9\u306F\u540C\u3058\u306A\u3093\u3060\u306D\uFF01"),
          E("\u30C8\u30E0\u306F\u53E4\u3044\u97F3\u697D\u304C\u597D\u304D", ["S:\u30C8\u30E0\u306F", "V:\u597D\u304D", "F:\u53E4\u3044", "O:\u97F3\u697D\u304C"], [0, 2, 3, 1], "\u300C\u53E4\u3044\u300D\u306F\u3001\u65E5\u672C\u8A9E\u3068\u540C\u3058\u3067\u300C\u97F3\u697D\u304C\u300D\u306E\u524D", { hint: HE }),
          E("\u30C8\u30E0\u306F\u65E5\u672C\u306E\u97F3\u697D\u304C\u597D\u304D", ["S:\u30C8\u30E0\u306F", "V:\u597D\u304D", "O:\u97F3\u697D\u304C", "R:\u65E5\u672C\u306E"], [0, 3, 2, 1], "\u300C\u65E5\u672C\u306E\u300D\u306F\u3001\u65E5\u672C\u8A9E\u3067\u306F\u300C\u97F3\u697D\u304C\u300D\u306E\u524D\u3002\u82F1\u8A9E\u3067\u306F\u3001\u5F8C\u308D\u306B\u8DB3\u3059\u3088", { hint: HE }),
          A("\u5F7C\u5973\u306F\u79C1\u306B\u8D64\u3044\u82B1\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "F:red|\u8D64\u3044|\u3069\u3093\u306A", "O:flowers"], { hint: H2 }),
          A("\u30DF\u30AB\u306F\u5927\u304D\u306A\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:Mika", "V:eats", "F:a big|\u5927\u304D\u306A|\u3069\u3093\u306A", "O:lunch"], { hint: H2 }),
          D("\u30B1\u30F3\u306F\u65B0\u3057\u3044\u672C\u3092\u8AAD\u3080", ["S:Ken", "V:reads", "F:a new|\u65B0\u3057\u3044|\u3069\u3093\u306A", "O:\u672C"], { en: "Ken reads a new book.", words: [["\u672C", "book"]] }),
          sum("\u300C\u76F8\u624B\u300D\u3082\u3001\u524D\u304B\u5F8C\u308D\u306B\u8DB3\u305B\u308B\u3002\u8DB3\u3057\u65B9\u306F\u3001\u4E3B\u5F79\u306E\u6642\u3068\u540C\u3058")
        ] },
        { id: "2-5", name: "\u30DC\u30B9\uFF1A\u571F\u53F0\u306B\u8DB3\u3057\u3066\u3001\u9577\u3044\u6587\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, help: HELP2, steps: [
          b("\u666E\u901A", "\u8DB3\u3057\u8A00\u8449\u306E\u7A2E\u985E\u3092\u3001\u3053\u3053\u3067\u307E\u3068\u3081\u3066\u304A\u3053\u3046"),
          bd([], { table: [["\u3069\u3093\u306A", "old", "F"], ["\u3060\u308C\u306E\u30FB\u3069\u3053\u306E", "from Osaka", "R"], ["\u3069\u3093\u306A\u3075\u3046\u306B", "fast", "R"], ["\u3069\u308C\u304F\u3089\u3044", "really", "F"], ["\u3044\u3064\u30FB\u3069\u3053", "every day", "W"]], cap: "\u7A2E\u985E\u3054\u3068\u306E\u4F8B" }),
          b("\u666E\u901A", "\u300C\u3069\u3093\u306A\u300D\u300C\u3060\u308C\u306E\u300D\u300C\u3069\u3053\u306E\u300D\u306F\u3001\u4EBA\u30FB\u7269\u3092\u8A73\u3057\u304F\u3059\u308B\u8A00\u8449\u3002\u4E3B\u5F79\u3084\u300C\u76F8\u624B\u300D\u306B\u3064\u304F\u3088"),
          b("\u666E\u901A", "\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306F\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3092\u3001\u300C\u3044\u3064\u300D\u300C\u3069\u3053\u300D\u306F\u6587\u305C\u3093\u305F\u3044\u306E\u5834\u9762\u3092\u8A73\u3057\u304F\u3059\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u307E\u305A\u300C\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u305F\u3044\u304B\u300D\u3092\u6C7A\u3081\u3066\u3001\u305D\u308C\u304B\u3089\u524D\u304B\u5F8C\u308D\u306B\u8DB3\u3059\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\uFF01 \u5834\u6240\u3068\u6642\u9593\u306F\u5F8C\u308D\u304C\u591A\u304F\u3066\u3001\u9806\u756A\u306F\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u3002\u30C9\u30A4\u30C4\u3001\u3060\u3063\u305F\u3088\u306D"),
          g("\u559C\u3076", "\u30C9\u30A4\u30C4\u3001\u3070\u3063\u3061\u308A\uFF01"),
          b("\u666E\u901A", "\u3058\u3083\u3042\u3001\u3061\u3087\u3044\u8DB3\u3057\u304C\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u3066\u3044\u308B\u304B\u3001\u63A2\u3057\u3066\u307F\u3088\u3046"),
          T(["F:Small", "S:birds", "V:fly"], 0, "\u4E3B\u5F79", "Small \u306F\u3001birds\uFF08\u4E3B\u5F79\uFF09\u306E\u524D\u306B\u8DB3\u3057\u3066\u3042\u308B\u3088"),
          T(["S:Tom", "V:runs", "R:fast"], 2, "\u3069\u3046\u3057\u3066\u308B\uFF1F", "fast \u306F\u3001runs\uFF08\u3069\u3046\u3057\u3066\u308B\uFF1F\uFF09\u306E\u5F8C\u308D\u306B\u8DB3\u3057\u3066\u3001\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u8D70\u308B\uFF1F\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u3044\u308B\u3088"),
          T(["S:Tom", "V:likes", "O:music", "R:from Japan"], 3, "\u76F8\u624B", "from Japan \u306F\u3001music\uFF08\u76F8\u624B\uFF09\u306E\u5F8C\u308D\u306B\u8DB3\u3057\u3066\u3042\u308B\u3088"),
          T(["S:Mika", "V:sings", "W:in the park"], 2, "\u6587\u305C\u3093\u305F\u3044", "in the park \u306F\u3001\u6587\u305C\u3093\u305F\u3044\u306E\u300C\u3069\u3053\u3067\uFF1F\u300D\u3092\u8DB3\u3057\u3066\u3044\u308B\u3088"),
          g("\u559C\u3076", "\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u3066\u308B\u304B\u3001\u308F\u304B\u308B\u3088\u3046\u306B\u306A\u3063\u3066\u304D\u305F\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u571F\u53F0\u306B\u3061\u3087\u3044\u8DB3\u3057\u3092\u3057\u3066\u3001\u9577\u3044\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002\n\u5834\u9762\u306F\u30011\u3064\u3060\u3051\u306A\u3089\u6700\u521D\u306B\u7F6E\u3044\u3066\u3082OK\u3002\n2\u3064\u4E26\u3079\u308B\u6642\u306F\u3001\u5F8C\u308D\u306B\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\uFF08\u30C9\u30A4\u30C4\uFF01\uFF09" },
          A("\u5927\u962A\u306E\u5C0F\u3055\u3044\u5B50\u3069\u3082\u305F\u3061\u304C\u6B4C\u3046", ["F:Little|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:kids", "R:from Osaka|\u5927\u962A\u306E|\u3069\u3053\u306E", "V:sing"], { dummy: ["school"] }),
          A("\u30DF\u30AB\u306F\u6BCE\u65E5\u4E0A\u624B\u306B\u6B4C\u3046", ["S:Mika", "V:sings", "R:well|\u4E0A\u624B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { dummy: ["blue"], alt: [{ o: [3, 0, 1, 2], t: ["Every day,", "Mika", "sings", "well"] }] }),
          A("\u30C8\u30E0\u306F\u65E5\u672C\u306E\u53E4\u3044\u97F3\u697D\u304C\u597D\u304D", ["S:Tom", "V:likes", "F:old|\u53E4\u3044|\u3069\u3093\u306A", "O:music", "R:from Japan|\u65E5\u672C\u306E|\u3069\u3053\u306E"], { dummy: ["window"] }),
          A("\u79C1\u306E\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u901F\u304F\u8D70\u308B", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { dummy: ["happy"], alt: [{ o: [4, 0, 1, 2, 3], t: ["Every day,", "my", "friend", "runs", "fast"] }] }),
          A("\u79C1\u306E\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u516C\u5712\u3067\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { dummy: ["banana"] }),
          g("\u559C\u3076", "\u9577\u3044\u6587\u3082\u3001\u571F\u53F0\u306B\u8DB3\u3057\u3066\u3044\u304F\u3060\u3051\u3067\u4F5C\u308C\u3061\u3083\u3063\u305F\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u307E\u305A\u571F\u53F0\u3092\u4F5C\u3063\u3066\u3001\u305D\u308C\u304B\u3089\u300C\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u305F\u3044\u304B\u300D\u3092\u8003\u3048\u308B\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "\u8A71\u3059\u6642\u3082\u3001\u5148\u306B\u571F\u53F0\u3092\u8A00\u3063\u3066\u3001\u8DB3\u3057\u305F\u3044\u3068\u3053\u308D\u3060\u3051\u8DB3\u305B\u3070\u3044\u3044\u3093\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u308C\u304C\u3001\u82F1\u8A9E\u3092\u8A71\u3059\u6642\u306E\u30B3\u30C4\u3060\u3088"),
          bd(["S:Mika", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { grow: 1, cap: "\u4E3B\u5F79\u304B\u3089\u5916\u3078\u3002\u5DE6\u304B\u3089\u53F3\u3078" }),
          b("\u3072\u3089\u3081\u304F", "\u6700\u5F8C\u306B\u3001\u6587\u305C\u3093\u305F\u3044\u3092\u3082\u3046\u4E00\u5EA6\u898B\u3066\u307F\u3088\u3046\u3002\u4E3B\u5F79\u304B\u3089\u3001\u5916\u3078\u5E83\u304C\u3063\u3066\u3044\u308B\u3088"),
          b("\u666E\u901A", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3042\u3068\u306F\u3001\u5834\u9762\u304C\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\u3067\u3001\u3055\u3089\u306B\u5916\u3078\u7D9A\u304F\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3001\u5DE6\u304B\u3089\u53F3\u3078\u3001\u9806\u756A\u306B\u8AAC\u660E\u304C\u5897\u3048\u3066\u3044\u304F\u306E\u306D"),
          b("\u666E\u901A", "\u6587\u306F\u30012\u3064\u304C\u4E26\u3093\u3060\u308A\u3001\u3072\u3068\u7D44\u306B\u306A\u3063\u305F\u308A\u3001\u5916\u306B\u5E83\u304C\u3063\u305F\u308A\u3001\u8DB3\u3055\u308C\u305F\u308A\u3057\u3066\u3067\u304D\u3066\u3044\u308B\u3093\u3060"),
          b("\u559C\u3076", "\u65E5\u672C\u8A9E\u306B\u76F4\u3055\u305A\u306B\u3001\u3053\u306E\u5F62\u306E\u307E\u307E\u53D7\u3051\u53D6\u308D\u3046\u306D"),
          g("\u8003\u3048\u308B", "\u306D\u3048\u3001in \u3084 the \u3063\u3066\u3001\u7D50\u5C40\u306A\u3093\u3060\u3063\u305F\u306E\uFF1F \u52D5\u304D\u306E\u5F62\u304C\u5909\u308F\u308B\u306E\u3082\u3001\u6C17\u306B\u306A\u308B"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u308C\u306F\u3001\u3053\u306E\u3042\u3068\u3084\u308B\u3088\u3002\u307E\u305A\u306F in \u3084 on \u307F\u305F\u3044\u306A\u8A00\u8449\u304B\u3089\u3001\u30C1\u30E3\u30F3\u30AF\u306E\u4E2D\u8EAB\u3092\u3001\u3072\u3068\u3064\u305A\u3064\u898B\u3066\u3044\u304F\u3093\u3060"),
          sum("\u571F\u53F0 \uFF0B \u3061\u3087\u3044\u8DB3\u3057\uFF1A\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u3001\u524D\u304B\u5F8C\u308D\u306B\u8DB3\u3059")
        ] }
      ];
      LESSONS2.forEach((l) => l.nums = true);
      const AN = "\u5177\u4F53\u7684";
      const LESSONS3 = [
        /* ---------- 第3章 3a：つなぎ言葉（くっつき方） ---------- */
        { id: "3a-1", name: "\u5916\u306B\u8DB3\u3059\u6642\u306F\u3001\u3064\u306A\u304E\u8A00\u8449", coin: 5, steps: [
          b("\u666E\u901A", "\u3055\u3063\u304D\u6C17\u306B\u306A\u3063\u3066\u3044\u305F in \u306E\u8A71\u304B\u3089\u59CB\u3081\u308B\u3088\u3002\u307E\u305A\u306F\u3001to \u306E\u3053\u3068\u3092\u601D\u3044\u51FA\u3057\u3066\u306D"),
          bd(["S:She", "V:gives", "O:flowers", "R:to me|\u79C1\u3078|\u5411\u304B\u3046\u5148"], { small: 1, cap: "She gives flowers to me.\u3000\u79C1\u306B\u82B1\u3092\u304F\u308C\u308B" }),
          g("\u8003\u3048\u308B", "gives me flowers \u306A\u3089\u3001to \u306F\u3044\u3089\u306A\u304B\u3063\u305F\u3088\u306D"),
          b("\u666E\u901A", "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u76F8\u624B\u3002\u3053\u306E\u571F\u53F0\u306E\u4E2D\u3067\u306F\u3001\u4E26\u3079\u308B\u3060\u3051\u3067\u610F\u5473\u304C\u3064\u306A\u304C\u308B\u3093\u3060"),
          b("\u666E\u901A", "\u3067\u3082\u3001\u571F\u53F0\u306E\u5916\u306B\u8DB3\u3059\u6642\u306F\u3001\u300C\u3069\u3046\u3064\u306A\u304C\u308B\u304B\u300D\u3092\u8A00\u3046\u5C0F\u3055\u306A\u8A00\u8449\u304C\u3044\u308B\u3093\u3060\u3002\u3053\u308C\u3092\u201C\u3064\u306A\u304E\u8A00\u8449\u201D\u3068\u547C\u3076\u3088"),
          g("\u3072\u3089\u3081\u304F", "to \u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u3060\u3063\u305F\u3093\u3060\uFF01 flowers \u3067\u6D41\u308C\u304C\u6B62\u307E\u308B\u304B\u3089\u3001\u5411\u304B\u3046\u5148\u3092\u6559\u3048\u3066\u304F\u308C\u308B\u306E\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u805E\u304F\u6642\u3082\u3001to \u304C\u805E\u3053\u3048\u305F\u3089\u300C\u5411\u304B\u3046\u5148\u304C\u6765\u308B\u306A\u300D\u3068\u5206\u304B\u308B\u3088"),
          bd(["S:Mika", "V:sings", "W:in|\u4E2D\u3067|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269"], { small: 1, grp: [2, 3], cap: "Mika sings in the park.\u3000\u30DF\u30AB\u306F\u516C\u5712\u3067\u6B4C\u3046" }),
          b("\u666E\u901A", "in the park \u3082\u540C\u3058\u3002in \u304C\u3064\u306A\u304E\u8A00\u8449\u3067\u3001\u305D\u306E\u3042\u3068\u306B\u3001\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u306E the park \u304C\u6765\u308B\u3093\u3060"),
          g("\u7126\u308B", "the \u306F\uFF1F \u306A\u3093\u3067 park \u306E\u524D\u306B\u4ED8\u304F\u306E\uFF1F"),
          b("\u666E\u901A", "the \u306F\u3001\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u306E\u4F5C\u308A\u65B9\u306B\u95A2\u308F\u308B\u3093\u3060\u3002\u3042\u3068\u3067\u3061\u3083\u3093\u3068\u89E3\u8AAC\u3059\u308B\u306D\u3002\u4ECA\u306F the park \u30671\u30BB\u30C3\u30C8\u3001\u3068\u601D\u3063\u3066\u306D"),
          g("\u8003\u3048\u308B", "\u5834\u9762\u306E\u4E2D\u8EAB\u306F\u3001\u300C\u3064\u306A\u304E\u8A00\u8449 \uFF0B \u4EBA\u30FB\u7269\u306E\u8A00\u8449\u300D\u306A\u306E\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002\u305D\u308C\u304C\u3001\u5834\u9762\u30C1\u30E3\u30F3\u30AF\u306E\u4F5C\u308A\u65B9\u3060\u3088\u3002\u307E\u305A\u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u30921\u3064\u305A\u3064\u898B\u3066\u3044\u3053\u3046"),
          B("She gives", "me flowers.", ["to", "\u306A\u3057"], "\u306A\u3057", { ctx: "\uFF08\u5148\u306B me \u3092\u8A00\u3046\uFF09", hint: "to \uFF0F \u306A\u3057 \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "me \u304C\u5148\u306A\u3089\u3001\u571F\u53F0\u306E\u4E2D\u3060\u304B\u3089\u3001\u3064\u306A\u304E\u8A00\u8449\u306F\u3044\u3089\u306A\u3044\u3088" }),
          B("She gives flowers", "me.", ["to", "\u306A\u3057"], "to", { ctx: "\uFF08flowers \u306E\u3042\u3068\u306B me \u3092\u8DB3\u3059\uFF09", hint: "to \uFF0F \u306A\u3057 \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u571F\u53F0\u306E\u5916\u306B\u8DB3\u3059\u304B\u3089\u3001\u3064\u306A\u304E\u8A00\u8449 to \u304C\u3044\u308B\u3088" }),
          B("Mika sings", "the park.", ["in", "\u306A\u3057"], "in", { ctx: "\uFF08\u516C\u5712\u3067\u6B4C\u3046\uFF09", hint: "in \uFF0F \u306A\u3057 \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u5834\u9762\u3092\u8DB3\u3059\u6642\u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u308B\u3088" }),
          A("\u5F7C\u5973\u306F\u82B1\u3092\u30DF\u30AB\u306B\u3042\u3052\u308B", ["S:She", "V:gives", "O:flowers", "R:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "R:Mika|\u30DF\u30AB|\u4EBA\u30FB\u7269"], { hint: "\u76F8\u624B\u306E\u3042\u3068\u306B\u8DB3\u3059\u5F62\u3067\u3001\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          AX("\u30DF\u30AB\u306F\u516C\u5712\u3067\u6B4C\u3046", ["S:Mika", "V:sings", "W:in|\u4E2D\u3067|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          sum("\u571F\u53F0\u306E\u5916\u306B\u8DB3\u3059\u6642\u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u308B\u3002\u5834\u9762 \uFF1D \u3064\u306A\u304E\u8A00\u8449 \uFF0B \u4EBA\u30FB\u7269\u306E\u8A00\u8449")
        ] },
        { id: "3a-2", name: "in\u30FBon\u30FBat", coin: 5, steps: [
          b("\u666E\u901A", "\u3064\u306A\u304E\u8A00\u8449\u306F\u3001\u304F\u3063\u3064\u304D\u65B9\u3082\u4F1D\u3048\u3066\u304F\u308C\u308B\u3002\u307E\u305A\u306F\u3001in\u30FBon\u30FBat \u306E3\u3064\u3060\u3088"),
          bd(["W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "in the park\u3000\u516C\u5712\u306E\u4E2D\u3067" }),
          b("\u666E\u901A", "in \u306F\u300C\u4E2D\u306B\u300D\u3002\u7BB1\u306E\u4E2D\u3001\u516C\u5712\u306E\u4E2D\u306E\u3088\u3046\u306B\u3001\u307E\u308F\u308A\u3092\u56F2\u307E\u308C\u305F\u30A4\u30E1\u30FC\u30B8\u3060\u3088"),
          bd(["W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:the sofa|\u305D\u306E\u30BD\u30D5\u30A1|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "on the sofa\u3000\u30BD\u30D5\u30A1\u306E\u4E0A\u306B" }),
          b("\u666E\u901A", "on \u306F\u300C\u30D4\u30BF\u30C3\u300D\u3002\u30BD\u30D5\u30A1\u306E\u4E0A\u3001\u304B\u3079\u306E\u3088\u3046\u306B\u3001\u9762\u306B\u304F\u3063\u3064\u3044\u3066\u3044\u308B\u30A4\u30E1\u30FC\u30B8\u3060\u3088"),
          bd(["W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:the station|\u305D\u306E\u99C5|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "at the station\u3000\u99C5\u3067" }),
          b("\u666E\u901A", "at \u306F\u300C\u30D4\u30F3\u5DEE\u3057\u300D\u3002\u3053\u3053\u3060\uFF01\u3068\u30011\u70B9\u3092\u6307\u3059\u30A4\u30E1\u30FC\u30B8\u3060\u3088\u3002\u99C5\u3084\u3001\u6642\u523B\u306B\u4F7F\u3046\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u65E5\u672C\u8A9E\u3060\u3068\u3001\u3069\u308C\u3082\u300C\u301C\u3067\u300D\u300C\u301C\u306B\u300D\u306B\u306A\u3063\u3061\u3083\u3046\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u3060\u304B\u3089\u3001\u65E5\u672C\u8A9E\u306B\u76F4\u3055\u305A\u306B\u3001\u30A4\u30E1\u30FC\u30B8\u3067\u9078\u3076\u3093\u3060\u3002\u4E2D\u306A\u3089 in\u3001\u30D4\u30BF\u30C3\u306A\u3089 on\u3001\u30D4\u30F3\u306A\u3089 at"),
          g("\u559C\u3076", "\u30A4\u30E1\u30FC\u30B8\u3067\u899A\u3048\u308B\u306A\u3089\u3001\u8FF7\u308F\u306A\u305D\u3046\uFF01"),
          B("Mika sings", "the park.", ["in", "on", "at"], "in", { ctx: "\uFF08\u516C\u5712\u306E\u4E2D\u3067\u3002\u307E\u308F\u308A\u3092\u56F2\u307E\u308C\u3066\u3044\u308B\uFF09", hint: "in \uFF0F on \uFF0F at \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u307E\u308F\u308A\u3092\u56F2\u307E\u308C\u305F\u300C\u4E2D\u300D\u306F in \u3060\u3088" }),
          B("The cat sleeps", "the sofa.", ["in", "on", "at"], "on", { ctx: "\uFF08\u30BD\u30D5\u30A1\u306E\u4E0A\u3067\u3002\u9762\u306B\u30D4\u30BF\u30C3\u3068\u3064\u3044\u3066\u3044\u308B\uFF09", hint: "in \uFF0F on \uFF0F at \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u9762\u306B\u30D4\u30BF\u30C3\u3068\u304F\u3063\u3064\u304F\u6642\u306F on \u3060\u3088" }),
          B("Ken waits", "the station.", ["in", "on", "at"], "at", { ctx: "\uFF08\u99C5\u3067\u3002\u3053\u3053\u3060\uFF01\u30681\u70B9\u3092\u6307\u3059\uFF09", hint: "in \uFF0F on \uFF0F at \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "1\u70B9\u3092\u6307\u3059\u6642\u306F at \u3060\u3088" }),
          B("The cat is", "the box.", ["in", "on", "at"], "in", { ctx: "\uFF08\u7BB1\u306E\u4E2D\u306B\uFF09", hint: "in \uFF0F on \uFF0F at \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u7BB1\u306E\u4E2D\u306F\u3001\u56F2\u307E\u308C\u3066\u3044\u308B\u304B\u3089 in \u3060\u3088" }),
          AX("\u30DF\u30AB\u306F\u30BD\u30D5\u30A1\u306E\u4E0A\u3067\u7720\u308B", ["S:Mika", "V:sleeps", "W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:the sofa|\u305D\u306E\u30BD\u30D5\u30A1|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          AX("\u30DF\u30AB\u306F\u99C5\u3067\u5F85\u3064", ["S:Mika", "V:waits", "W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:the station|\u305D\u306E\u99C5|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          AX("\u30B1\u30F3\u306F\u516C\u5712\u3067\u8D70\u308B", ["S:Ken", "V:runs", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          DX("\u30C8\u30E0\u306F\u99C5\u3067\u5F85\u3064", ["S:Tom", "V:waits", "W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:\u305D\u306E\u99C5|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { en: "Tom waits at the station.", words: [["\u305D\u306E\u99C5", "the station"]], hint: "\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067OK\u3002\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK" }),
          sum("in \uFF1D \u4E2D\u306B \uFF0F on \uFF1D \u30D4\u30BF\u30C3 \uFF0F at \uFF1D \u30D4\u30F3\u5DEE\u3057")
        ] },
        { id: "3a-3", name: "with\u30FBto", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F with \u3068 to \u3060\u3088"),
          bd(["W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:my friend|\u79C1\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "with my friend\u3000\u53CB\u3060\u3061\u3068\u4E00\u7DD2\u306B" }),
          b("\u666E\u901A", "with \u306F\u300C\u4E00\u7DD2\u306B\u300D\u3002\u4F55\u304B\u306E\u5F79\u5272\u3092\u6301\u3063\u3066\u3001\u4E00\u7DD2\u306B\u3044\u308B\u30A4\u30E1\u30FC\u30B8\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u4EBA\u3058\u3083\u306A\u304F\u3066\u3082\u3001with \u306F\u4F7F\u3048\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u4F7F\u3048\u308B\u3088\u3002with a pen \u306F\u300C\u30DA\u30F3\u3092\u4F7F\u3063\u3066\u300D\u3002\u30DA\u30F3\u3082\u4E00\u7DD2\u306B\u3001\u3068\u3044\u3046\u30A4\u30E1\u30FC\u30B8\u3060\u306D"),
          bd(["W:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "W:school|\u5B66\u6821|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "to school\u3000\u5B66\u6821\u3078" }),
          b("\u666E\u901A", "to \u306F\u3001\u6B21\u3078\u5411\u304B\u3046\u300C\u2192\u300D\u3002\u5411\u304B\u3046\u5148\u3092\u3064\u306A\u3050\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "gives flowers to me \u306E to \u3068\u3001\u540C\u3058\u3060\u306D\uFF01"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002to \u306F\u300C\u5411\u304B\u3046\u5148\u300D\u306E\u5408\u56F3\u3060\u3088"),
          B("Mika walks", "Tom.", ["with", "to"], "with", { ctx: "\uFF08\u30C8\u30E0\u3068\u4E00\u7DD2\u306B\u6B69\u304F\uFF09", hint: "with \uFF0F to \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u4E00\u7DD2\u306B\u3044\u308B\u6642\u306F with \u3060\u3088" }),
          B("Ken runs", "school.", ["with", "to"], "to", { ctx: "\uFF08\u5B66\u6821\u3078\u5411\u304B\u3063\u3066\u8D70\u308B\uFF09", hint: "with \uFF0F to \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u5411\u304B\u3046\u5148\u306F to \u3060\u3088" }),
          AX("\u30DF\u30AB\u306F\u30C8\u30E0\u3068\u4E00\u7DD2\u306B\u6B4C\u3046", ["S:Mika", "V:sings", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:Tom|\u30C8\u30E0|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          A("\u30B1\u30F3\u306F\u5B66\u6821\u3078\u8D70\u308B", ["S:Ken", "V:runs", "W:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "W:school|\u5B66\u6821|\u4EBA\u30FB\u7269"]),
          A("\u5F7C\u5973\u306F\u30DF\u30AB\u306B\u82B1\u3092\u3042\u3052\u308B", ["S:She", "V:gives", "O:flowers", "R:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "R:Mika|\u30DF\u30AB|\u4EBA\u30FB\u7269"], { hint: "\u76F8\u624B\u306E\u3042\u3068\u306B\u8DB3\u3059\u5F62\u3067\u3001\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          DX("\u30DF\u30AB\u306F\u30C8\u30E0\u3068\u4E00\u7DD2\u306B\u6B69\u304F", ["S:Mika", "V:walks", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:\u30C8\u30E0|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { en: "Mika walks with Tom.", words: [["\u30C8\u30E0", "Tom"]], hint: "\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067OK\u3002\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK" }),
          sum("with \uFF1D \u4E00\u7DD2\u306B \uFF0F to \uFF1D \u5411\u304B\u3046\u5148\uFF08\u2192\uFF09")
        ] },
        { id: "3a-4", name: "\u30DC\u30B9\uFF1A\u3064\u306A\u304E\u8A00\u8449\u3092\u9078\u307C\u3046", coin: 20, boss: true, steps: [
          bd([], { table: [["\u4E2D\u306B", "in", "W"], ["\u30D4\u30BF\u30C3", "on", "W"], ["\u30D4\u30F3\u5DEE\u3057", "at", "W"], ["\u4E00\u7DD2\u306B", "with", "W"], ["\u5411\u304B\u3046\u5148", "to", "W"]], cap: "\u3064\u306A\u304E\u8A00\u8449" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u3001\u3064\u306A\u304E\u8A00\u8449\u3092\u9078\u3073\u306A\u304C\u3089\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          AX("\u30DF\u30AB\u306F\u30BD\u30D5\u30A1\u306E\u4E0A\u3067\u7720\u308B", ["S:Mika", "V:sleeps", "W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:the sofa|\u305D\u306E\u30BD\u30D5\u30A1|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { dummy: ["in"] }),
          AX("\u30DF\u30AB\u306F\u53CB\u3060\u3061\u3068\u4E00\u7DD2\u306B\u6B4C\u3046", ["S:Mika", "V:sings", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:her friend|\u5F7C\u5973\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { dummy: ["to"] }),
          AX("\u30B1\u30F3\u306F\u99C5\u3067\u5F85\u3064", ["S:Ken", "V:waits", "W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:the station|\u305D\u306E\u99C5|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { dummy: ["on"] }),
          A("\u30C8\u30E0\u306F\u5B66\u6821\u3078\u8D70\u308B", ["S:Tom", "V:runs", "W:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "W:school|\u5B66\u6821|\u4EBA\u30FB\u7269"], { dummy: ["at"] }),
          A("\u5F7C\u5973\u306F\u30DF\u30AB\u306B\u82B1\u3092\u3042\u3052\u308B", ["S:She", "V:gives", "O:flowers", "R:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "R:Mika|\u30DF\u30AB|\u4EBA\u30FB\u7269"], { dummy: ["with"] }),
          g("\u559C\u3076", "\u3064\u306A\u304E\u8A00\u8449\u306F\u3001\u304F\u3063\u3064\u304D\u65B9\u306E\u30A4\u30E1\u30FC\u30B8\u3067\u9078\u3079\u3070\u3044\u3044\u3093\u3060\u306D\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u3064\u306A\u304E\u8A00\u8449\u306E\u3042\u3068\u306B\u306F\u3001the park \u3084 my friend \u306E\u3088\u3046\u306A\u3001\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u304C\u6765\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u3058\u3083\u3042\u3001\u3064\u306A\u304E\u8A00\u8449\u3068\u4EBA\u30FB\u7269\u30C1\u30E3\u30F3\u30AF\u3067\u3001\u5834\u9762\u304C\u4F5C\u308C\u308B\u3093\u3060"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u306E\u901A\u308A\u3002\u6B21\u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u3092\u4F7F\u3063\u3066\u3001\u5834\u9762\u3092\u4F5C\u3063\u3066\u3044\u304F\u3088"),
          sum("\u3064\u306A\u304E\u8A00\u8449 \uFF1D \u5916\u306B\u8DB3\u3059\u6642\u306E\u3001\u304F\u3063\u3064\u304D\u65B9\u306E\u5408\u56F3")
        ] },
        /* ---------- 第3章 3b：場面チャンク（つなぎ言葉 ＋ 人・物チャンク） ---------- */
        { id: "3b-1", name: "\u3069\u3053\u3067\u3001\u3060\u308C\u3068", coin: 5, steps: [
          bd(["W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the big park|\u305D\u306E\u5927\u304D\u306A\u516C\u5712|\u4EBA\u30FB\u7269"], { grp: [0, 1], cap: "in the big park\u3000\u5927\u304D\u306A\u516C\u5712\u306E\u4E2D\u3067" }),
          b("\u666E\u901A", "\u5834\u9762\u306F\u300C\u3064\u306A\u304E\u8A00\u8449 \uFF0B \u4EBA\u30FB\u7269\u306E\u8A00\u8449\u300D\u3067\u3067\u304D\u3066\u3044\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u3064\u306A\u304E\u8A00\u8449\u306E\u5F8C\u308D\u306B\u3001the big park \u307F\u305F\u3044\u306A\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3092\u3064\u306A\u3052\u308B\u306E\u306D"),
          b("\u666E\u901A", "\u3046\u3093\u3002a / the\u3001\u3069\u3093\u306A\u3001\u3082\u306E\u3001\u306E\u9806\u756A\u306E\u307E\u307E\u3060\u3088\u3002a big park \u3067\u3082\u3001my friend \u3067\u3082\u3064\u306A\u3052\u3089\u308C\u308B"),
          bd(["S:Mika", "V:sings", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:my friend|\u79C1\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269"], { small: 1, grp: [2, 3], cap: "Mika sings with my friend.\u3000\u30DF\u30AB\u306F\u53CB\u3060\u3061\u3068\u6B4C\u3046" }),
          b("\u666E\u901A", "with my friend \u306F\u300C\u53CB\u3060\u3061\u3068\u4E00\u7DD2\u306B\u300D\u3002with \u306E\u3042\u3068\u306B\u3001\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u306E my friend \u304C\u6765\u3066\u3044\u308B\u3088"),
          g("\u559C\u3076", "\u3064\u306A\u304E\u8A00\u8449\u306B\u3001\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3092\u3064\u306A\u3052\u308B\u3060\u3051\u306A\u3093\u3060\uFF01"),
          bd(["S:Mika", "V:sings", "W:here|\u3053\u3053\u3067|\u3069\u3053"], { cap: "Mika sings here.\u3000\u30DF\u30AB\u306F\u3053\u3053\u3067\u6B4C\u3046" }),
          b("\u666E\u901A", "\u3082\u3046\u3072\u3068\u3064\u3002here \u3084 there \u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u3089\u306A\u3044\u3093\u3060"),
          g("\u9A5A\u304F", "\u3064\u306A\u304E\u8A00\u8449\u306A\u3057\u3067\u3001\u5834\u6240\u306B\u306A\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3046\u3093\u3002here\uFF08\u3053\u3053\u3067\uFF09\u3068 there\uFF08\u305D\u3053\u3067\uFF09\u306F\u3001\u305D\u306E\u307E\u307E\u3067\u5834\u9762\u3060\u3088\u3002in here \u3068\u306F\u8A00\u308F\u306A\u3044\u3093\u3060"),
          B("Mika sings", "a big park.", ["in", "with"], "in", { ctx: "\uFF08\u5927\u304D\u306A\u516C\u5712\u306E\u4E2D\u3067\uFF09", hint: "in \uFF0F with \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u516C\u5712\u306E\u300C\u4E2D\u300D\u306F in \u3060\u3088" }),
          B("Ken runs", "his friend.", ["in", "with"], "with", { ctx: "\uFF08\u53CB\u3060\u3061\u3068\u4E00\u7DD2\u306B\uFF09", hint: "in \uFF0F with \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u4E00\u7DD2\u306B\u3044\u308B\u6642\u306F with \u3060\u3088" }),
          B("Mika sings", ".", ["here", "in here"], "here", { ctx: "\uFF08\u3053\u3053\u3067\u6B4C\u3046\uFF09", hint: "\u3069\u3063\u3061\u304C\u6B63\u3057\u3044\uFF1F", wrong: "here \u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u306A\u3057\u3067\u3001\u305D\u306E\u307E\u307E\u5834\u9762\u3060\u3088" }),
          AX("\u30DF\u30AB\u306F\u5927\u304D\u306A\u516C\u5712\u3067\u6B4C\u3046", ["S:Mika", "V:sings", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:a big park|\u5927\u304D\u306A\u516C\u5712|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          AX("\u30B1\u30F3\u306F\u53CB\u3060\u3061\u3068\u4E00\u7DD2\u306B\u8D70\u308B", ["S:Ken", "V:runs", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:his friend|\u5F7C\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269"], [["f", 2, 3]]),
          DX("\u30B1\u30F3\u306F\u79C1\u306E\u53CB\u3060\u3061\u3068\u8D70\u308B", ["S:Ken", "V:runs", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:\u79C1\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269"], [["f", 2, 3]], { en: "Ken runs with my friend.", words: [["\u79C1\u306E\u53CB\u3060\u3061", "my friend"]], hint: "\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067OK\u3002\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK" }),
          sum("\u5834\u9762 \uFF1D \u3064\u306A\u304E\u8A00\u8449 \uFF0B \u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3002here / there \u306F\u3001\u305D\u306E\u307E\u307E\u3067\u5834\u9762")
        ] },
        { id: "3b-2", name: "\u3044\u3064", coin: 5, steps: [
          b("\u666E\u901A", "\u6642\u306E\u5834\u9762\u3082\u3001\u540C\u3058\u4F5C\u308A\u65B9\u3060\u3088\u3002at\u30FBon\u30FBin \u306F\u3001\u6642\u9593\u306B\u3082\u4F7F\u3048\u308B\u3093\u3060"),
          bd(["W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:7 o'clock|7\u6642|\u3044\u3064"], { grp: [0, 1], cap: "at 7 o'clock\u30007\u6642\u306B" }),
          b("\u666E\u901A", "at \u306F\u3001\u30D4\u30F3\u5DEE\u3057\u30027\u6642\u306E\u3088\u3046\u306B\u3001\u6642\u523B\u306E1\u70B9\u3092\u6307\u3059\u3088"),
          bd(["W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:Sunday|\u65E5\u66DC\u65E5|\u3044\u3064"], { grp: [0, 1], cap: "on Sunday\u3000\u65E5\u66DC\u65E5\u306B" }),
          b("\u666E\u901A", "on \u306F\u3001\u30D4\u30BF\u30C3\u3002\u65E5\u3084\u66DC\u65E5\u306B\u4F7F\u3046\u3088"),
          bd(["W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the morning|\u305D\u306E\u671D|\u3044\u3064"], { grp: [0, 1], cap: "in the morning\u3000\u671D\u306B" }),
          b("\u666E\u901A", "in \u306F\u3001\u4E2D\u3002\u671D\u3084\u590F\u306E\u3088\u3046\u306B\u3001\u3042\u308B\u9577\u3055\u306E\u4E2D\u3092\u6307\u3059\u3088"),
          g("\u3072\u3089\u3081\u304F", "at \u306F\u70B9\u3001on \u306F\u65E5\u306B\u30D4\u30BF\u30C3\u3001in \u306F\u671F\u9593\u306E\u4E2D\u3001\u306A\u3093\u3060\u306D\uFF01"),
          bd(["S:Tom", "V:ran", "W:yesterday|\u6628\u65E5|\u3044\u3064"], { cap: "Tom ran yesterday.\u3000\u30C8\u30E0\u306F\u6628\u65E5\u8D70\u3063\u305F" }),
          b("\u666E\u901A", "every day \u3084 today\u3001yesterday \u306E\u3088\u3046\u306B\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u3089\u306A\u3044\u6642\u3082\u3042\u308B\u3088\u3002\u305D\u306E\u307E\u307E\u3067\u5834\u9762\u3060\u3088"),
          b("\u666E\u901A", "\u6628\u65E5\u306E\u3053\u3068\u306F\u3001\u52D5\u304D\u306E\u5F62\u3082\u5909\u308F\u308B\u3051\u3069\uFF08ran\uFF09\u3001\u4ECA\u306F\u6C17\u306B\u3057\u306A\u304F\u3066\u5927\u4E08\u592B\u3060\u3088"),
          B("Mika sings", "7 o'clock.", ["at", "on", "in"], "at", { ctx: "\uFF087\u6642\u3061\u3087\u3046\u3069\u306B\uFF09", hint: "at \uFF0F on \uFF0F in \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u6642\u523B\u306E1\u70B9\u306F at \u3060\u3088" }),
          B("Tom runs", "Sunday.", ["at", "on", "in"], "on", { ctx: "\uFF08\u65E5\u66DC\u65E5\u306B\uFF09", hint: "at \uFF0F on \uFF0F in \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u65E5\u3084\u66DC\u65E5\u306B\u306F on \u3060\u3088" }),
          B("Ken reads", "the morning.", ["at", "on", "in"], "in", { ctx: "\uFF08\u671D\u306E\u9593\u306B\uFF09", hint: "at \uFF0F on \uFF0F in \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u3042\u308B\u9577\u3055\u306E\u4E2D\u306F in \u3060\u3088" }),
          AX("\u30DF\u30AB\u306F7\u6642\u306B\u6B4C\u3046", ["S:Mika", "V:sings", "W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:7 o'clock|7\u6642|\u3044\u3064"], [["f", 2, 3]]),
          AX("\u30C8\u30E0\u306F\u65E5\u66DC\u65E5\u306B\u8D70\u308B", ["S:Tom", "V:runs", "W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:Sunday|\u65E5\u66DC\u65E5|\u3044\u3064"], [["f", 2, 3]]),
          AX("\u30B1\u30F3\u306F\u671D\u306B\u672C\u3092\u8AAD\u3080", ["S:Ken", "V:reads", "O:a book|\u672C|" + AN, "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the morning|\u305D\u306E\u671D|\u3044\u3064"], [["f", 3, 4]]),
          D("\u30C8\u30E0\u306F\u6628\u65E5\u8D70\u3063\u305F", ["S:Tom", "V:ran", "W:\u6628\u65E5|\u3044\u3064"], { en: "Tom ran yesterday.", words: [["\u6628\u65E5", "yesterday"]], alt: [{ o: [2, 0, 1], t: ["Yesterday,", "Tom", "ran"] }], hint: "\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3067OK\u3002\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082\u5927\u4E08\u592B" }),
          sum("at \uFF1D \u6642\u523B\u306E\u30D4\u30F3 \uFF0F on \uFF1D \u65E5\u306B\u30D4\u30BF\u30C3 \uFF0F in \uFF1D \u671F\u9593\u306E\u4E2D \uFF0F every day\u30FByesterday \u306F\u3001\u3064\u306A\u304E\u8A00\u8449\u306A\u3057")
        ] },
        { id: "3b-3", name: "\u5834\u9762\u3092\u4E26\u3079\u308B", coin: 5, steps: [
          b("\u666E\u901A", "\u5834\u9762\u30922\u3064\u4EE5\u4E0A\u8DB3\u3059\u6642\u306F\u3001\u9806\u756A\u304C\u3042\u308B\u3088\u3002\u300C\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\u3001\u899A\u3048\u3066\u308B\uFF1F"),
          g("\u559C\u3076", "\u30C9\u30A4\u30C4\uFF01"),
          b("\u666E\u901A", "\u3053\u3053\u306B\u300C\u3060\u308C\u3068\u300D\u304C\u52A0\u308F\u308B\u3068\u3001\u3075\u3064\u3046\u306F\u300C\u3060\u308C\u3068\u3001\u3069\u3053\u3001\u3044\u3064\u300D\u306E\u9806\u306B\u306A\u308B\u3093\u3060"),
          bd(["S:Mika", "V:sings", "W:with my friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { cap: "Mika sings with my friend in the park every day." }),
          g("\u8003\u3048\u308B", "\u65E5\u672C\u8A9E\u3060\u3068\u300C\u6BCE\u65E5\u3001\u516C\u5712\u3067\u3001\u53CB\u3060\u3061\u3068\u300D\u3002\u307B\u3068\u3093\u3069\u9006\u3060\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u82F1\u8A9E\u306F\u3001\u8FD1\u3044\u3068\u3053\u308D\u304B\u3089\u3001\u3060\u3093\u3060\u3093\u5916\u3078\u3002\u3060\u308C\u3068 \u2192 \u3069\u3053 \u2192 \u3044\u3064\u3001\u306E\u9806\u3060\u3088"),
          b("\u666E\u901A", "\u5168\u90E8\u8DB3\u3055\u306A\u304F\u3066\u3082\u3044\u3044\u3088\u3002\u8A00\u3044\u305F\u3044\u3082\u306E\u3060\u3051\u8DB3\u3057\u3066\u3001\u9806\u756A\u306F\u5B88\u308B\u3093\u3060"),
          g("\u559C\u3076", "\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3001\u3060\u306D\uFF01"),
          EX("\u30DF\u30AB\u306F\u6BCE\u65E5\u516C\u5712\u3067\u53CB\u3060\u3061\u3068\u6B4C\u3046", ["S:\u30DF\u30AB\u306F", "V:\u6B4C\u3046", "W:\u53CB\u3060\u3061\u3068", "W:\u516C\u5712\u3067", "W:\u6BCE\u65E5"], [0, 4, 3, 2, 1], "\u65E5\u672C\u8A9E\u306F\u300C\u6BCE\u65E5\u30FB\u516C\u5712\u3067\u30FB\u53CB\u3060\u3061\u3068\u300D\u3002\u82F1\u8A9E\u306F\u3001\u3060\u308C\u3068\u3001\u3069\u3053\u3001\u3044\u3064\u306E\u9806\u3067\u3001\u307B\u307C\u9006\u3060\u3088", [["f", 2], ["f", 3], ["t", 4]], { hint: "\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u4E26\u3079\u3088\u3046\n\uFF08\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\uFF09" }),
          AX("\u30DF\u30AB\u306F\u53CB\u3060\u3061\u3068\u516C\u5712\u3067\u6B4C\u3046", ["S:Mika", "V:sings", "W:with my friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:in the park|\u516C\u5712\u3067|\u3069\u3053"], [["f", 2], ["f", 3]], { hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          AX("\u30B1\u30F3\u306F\u53CB\u3060\u3061\u3068\u6BCE\u65E5\u8D70\u308B", ["S:Ken", "V:runs", "W:with his friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:every day|\u6BCE\u65E5|\u3044\u3064"], [["f", 2], ["t", 3]], { hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          AX("\u30DF\u30AB\u306F\u6BCE\u65E5\u516C\u5712\u3067\u53CB\u3060\u3061\u3068\u6B4C\u3046", ["S:Mika", "V:sings", "W:with my friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], [["f", 2], ["f", 3], ["t", 4]], { small: 1, hint: "\u5834\u9762\u306F\u3001\u6700\u521D\u3067\u3082\u6700\u5F8C\u3067\u3082OK\u3002\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7" }),
          sum("\u5834\u9762\u306F\u3001\u8FD1\u304F\u304B\u3089\u5916\u3078\uFF1A\u3060\u308C\u3068 \u2192 \u3069\u3053 \u2192 \u3044\u3064")
        ] },
        { id: "3b-4", name: "\u30DC\u30B9\uFF1A\u5834\u9762\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          bd(["W:with my friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { lr: "\u3060\u308C\u3068 \u2192 \u3069\u3053 \u2192 \u3044\u3064", small: 1, cap: "\u5834\u9762\u306E\u9806\u756A" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u3001\u5834\u9762\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          AX("\u30B1\u30F3\u306F\u65E5\u66DC\u65E5\u306B\u516C\u5712\u3067\u8D70\u308B", ["S:Ken", "V:runs", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269", "W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:Sunday|\u65E5\u66DC\u65E5|\u3044\u3064"], [["f", 2, 3], ["t", 4, 5]], { small: 1, dummy: ["at"] }),
          AX("\u30DF\u30AB\u306F\u53CB\u3060\u3061\u3068\u99C5\u3067\u5F85\u3064", ["S:Mika", "V:waits", "W:with|\u4E00\u7DD2\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:my friend|\u79C1\u306E\u53CB\u3060\u3061|\u4EBA\u30FB\u7269", "W:at|\u30D4\u30F3\u5DEE\u3057|\u3064\u306A\u304E\u8A00\u8449", "W:the station|\u305D\u306E\u99C5|\u4EBA\u30FB\u7269"], [["f", 2, 3], ["f", 4, 5]], { small: 1, dummy: ["in"] }),
          AX("\u30C8\u30E0\u306F\u671D\u306B\u5B66\u6821\u3078\u8D70\u308B", ["S:Tom", "V:runs", "W:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "W:school|\u5B66\u6821|\u4EBA\u30FB\u7269", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the morning|\u305D\u306E\u671D|\u3044\u3064"], [["t", 4, 5]], { small: 1, dummy: ["at"] }),
          AX("\u79C1\u306E\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u5927\u304D\u306A\u516C\u5712\u3067\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:sings", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:a big park|\u5927\u304D\u306A\u516C\u5712|\u4EBA\u30FB\u7269", "W:every day|\u6BCE\u65E5|\u3044\u3064"], [["f", 3, 4], ["t", 5]], { small: 1, dummy: ["on"] }),
          g("\u559C\u3076", "\u3064\u306A\u304E\u8A00\u8449\u3068\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3067\u3001\u5834\u9762\u304C\u4F5C\u308C\u305F\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u6B21\u306F\u3001\u52D5\u304D\u306E\u8A00\u8449\u306E\u307B\u3046\u3082\u3001\u8A73\u3057\u304F\u3057\u3066\u3044\u304F\u3088"),
          sum("\u5834\u9762 \uFF1D \u3064\u306A\u304E\u8A00\u8449 \uFF0B \u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3002\u9806\u756A\u306F\u3001\u3060\u308C\u3068 \u2192 \u3069\u3053 \u2192 \u3044\u3064")
        ] },
        /* ---------- 第3章 3c：「どうしてる？」チャンク（動き ＋ ちょい足し） ---------- */
        { id: "3c-1", name: "\u52D5\u304D\u306B\u8DB3\u3059\uFF1A\u3069\u3093\u306A\u3075\u3046\u306B", coin: 5, steps: [
          b("\u666E\u901A", "\u3053\u3053\u304B\u3089\u306F\u3001\u52D5\u304D\u306E\u8A00\u8449\u3092\u8A73\u3057\u304F\u3059\u308B\u3088\u3002\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u308D\u3046"),
          g("\u8003\u3048\u308B", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3063\u3066\u3001\u52D5\u304D\u306E\u8A00\u8449\u304C\u3072\u3068\u3064\u3042\u308C\u3070\u3001\u3044\u3044\u3093\u3058\u3083\u306A\u3044\u306E\uFF1F"),
          b("\u666E\u901A", "\u52D5\u304D\u306E\u8A00\u8449\u304C\u4E2D\u5FC3\u3002\u305D\u306E\u524D\u3084\u5F8C\u308D\u306B\u8DB3\u3057\u3066\u3001\u8A73\u3057\u304F\u3059\u308B\u3093\u3060"),
          bd(["S:Tom", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], { arrow: "add:2>1", cap: "Tom runs fast.\u3000\u30C8\u30E0\u306F\u901F\u304F\u8D70\u308B" }),
          b("\u666E\u901A", "fast \u306F\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306E\u8A00\u8449\u3067\u3001\u52D5\u304D\u306E\u5F8C\u308D\u306B\u8DB3\u3059\u3093\u3060\u3063\u305F\u306D"),
          g("\u8003\u3048\u308B", "fast \u307F\u305F\u3044\u306A\u8A00\u8449\u3001\u307B\u304B\u306B\u3082\u3042\u308B\u306E\uFF1F \u3086\u3063\u304F\u308A\u3001\u3068\u304B\u3001\u9759\u304B\u306B\u3001\u3068\u304B"),
          b("\u3072\u3089\u3081\u304F", "\u3042\u308B\u3088\u3002\u300C\u3069\u3093\u306A\u300D\u306E\u8A00\u8449\u306B ly \u3092\u3064\u3051\u308B\u3068\u3001\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306E\u8A00\u8449\u306B\u306A\u308B\u3093\u3060"),
          bd(["F:slow|\u3086\u3063\u304F\u308A\u306A|\u3069\u3093\u306A", "R:slowly|\u3086\u3063\u304F\u308A|\u3069\u3093\u306A\u3075\u3046\u306B"], { lr: "\uFF0B ly", cap: "slow \u2192 slowly" }),
          g("\u9A5A\u304F", "slow \u306B ly \u3067\u3001slowly\uFF01 \u7C21\u5358\u3060\u306D"),
          b("\u666E\u901A", "quiet \u306A\u3089 quietly\uFF08\u9759\u304B\u306B\uFF09\u3001careful \u306A\u3089 carefully\uFF08\u6CE8\u610F\u6DF1\u304F\uFF09\u3002\u540C\u3058\u4F5C\u308A\u65B9\u3060\u3088"),
          b("\u666E\u901A", "fast \u3084 well \u306F\u3001ly \u3092\u3064\u3051\u305A\u306B\u3001\u305D\u306E\u307E\u307E\u4F7F\u3046\u3088\u3002\u3053\u308C\u306F\u3001\u305D\u306E\u307E\u307E\u899A\u3048\u3061\u3083\u304A\u3046"),
          bd(["S:Tom", "V:eats", "O:lunch", "R:quickly|\u3059\u3070\u3084\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], { small: 1, cap: "Tom eats lunch quickly.\u3000\u30C8\u30E0\u306F\u3059\u3070\u3084\u304F\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B" }),
          g("\u8003\u3048\u308B", "\u3042\u308C\uFF1F quickly \u306F\u3001\u52D5\u304D\u306E\u5F8C\u308D\u3058\u3083\u306A\u304F\u3066\u3001\u76F8\u624B\u306E\u5F8C\u308D\u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u3001\u96A3\u3069\u3046\u3057\u3060\u3063\u305F\u3088\u306D\u3002\u3060\u304B\u3089\u3001\u9593\u306B\u5165\u308C\u305A\u306B\u3001\u76F8\u624B\u306E\u3042\u3068\u306B\u8DB3\u3059\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u96A3\u3069\u3046\u3057\u3001\u306E\u30EB\u30FC\u30EB\u304C\u3001\u3053\u3053\u3067\u3082\u52B9\u3044\u3066\u308B\u3093\u3060\u306D\uFF01"),
          G("slowly", "\u3069\u3093\u306A\u3075\u3046\u306B", ["\u3069\u3093\u306A", "\u3069\u3093\u306A\u3075\u3046\u306B"], { subs: { "\u3069\u3093\u306A": "\u4EBA\u30FB\u7269\u3092\u8A73\u3057\u304F\u3059\u308B", "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u3092\u8A73\u3057\u304F\u3059\u308B" } }),
          G("quiet", "\u3069\u3093\u306A", ["\u3069\u3093\u306A", "\u3069\u3093\u306A\u3075\u3046\u306B"], { subs: { "\u3069\u3093\u306A": "\u4EBA\u30FB\u7269\u3092\u8A73\u3057\u304F\u3059\u308B", "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u3092\u8A73\u3057\u304F\u3059\u308B" } }),
          G("carefully", "\u3069\u3093\u306A\u3075\u3046\u306B", ["\u3069\u3093\u306A", "\u3069\u3093\u306A\u3075\u3046\u306B"], { subs: { "\u3069\u3093\u306A": "\u4EBA\u30FB\u7269\u3092\u8A73\u3057\u304F\u3059\u308B", "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u3092\u8A73\u3057\u304F\u3059\u308B" } }),
          B("Ken reads the book", ".", ["careful", "carefully"], "carefully", { hint: "\u3069\u3063\u3061\u306E\u5F62\u304B\u306A\uFF1F", wrong: "\u52D5\u304D\u3092\u8A73\u3057\u304F\u3059\u308B\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306F\u3001ly \u306E\u5F62\u3060\u3088" }),
          A("\u30DF\u30AB\u306F\u3086\u3063\u304F\u308A\u6B4C\u3046", ["S:Mika", "V:sings", "R:slowly|\u3086\u3063\u304F\u308A|\u3069\u3093\u306A\u3075\u3046\u306B"]),
          A("\u30C8\u30E0\u306F\u9759\u304B\u306B\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:Tom", "V:eats", "O:lunch", "R:quietly|\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"]),
          D("\u30B1\u30F3\u306F\u6CE8\u610F\u6DF1\u304F\u8AAD\u3080", ["S:Ken", "V:reads", "R:\u6CE8\u610F\u6DF1\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], { en: "Ken reads carefully.", words: [["\u6CE8\u610F\u6DF1\u304F", "carefully"]] }),
          sum("\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306F\u3001\u52D5\u304D\uFF08\u3068\u76F8\u624B\uFF09\u306E\u3042\u3068\u306B\u8DB3\u3059\u3002\u300C\u3069\u3093\u306A\u300D\u306E\u8A00\u8449\u306B ly \u3092\u3064\u3051\u3066\u4F5C\u308C\u308B")
        ] },
        { id: "3c-2", name: "\u52D5\u304D\u306B\u8DB3\u3059\uFF1A\u3069\u308C\u304F\u3089\u3044", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u300C\u3069\u308C\u304F\u3089\u3044\uFF1F\u300D\u3092\u8DB3\u3059\u8A00\u8449\u3002\u3044\u3064\u3082\u3001\u3088\u304F\u3001\u305C\u3063\u305F\u3044\u301C\u306A\u3044\u3001\u306E\u3088\u3046\u306A\u8A00\u8449\u3060\u3088"),
          bd(["S:Tom", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:runs"], { arrow: "add:1>2", cap: "Tom always runs.\u3000\u30C8\u30E0\u306F\u3044\u3064\u3082\u8D70\u308B" }),
          b("\u666E\u901A", "always \u306F\u300C\u3044\u3064\u3082\u300D\u3002really\uFF08\u672C\u5F53\u306B\uFF09\u3068\u540C\u3058\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306E\u8A00\u8449\u3067\u3001\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059\u3088"),
          g("\u8003\u3048\u308B", "fast \u306F\u5F8C\u308D\u3067\u3001always \u306F\u524D\u306A\u3093\u3060\u306D"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306F\u5F8C\u308D\u3001\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306F\u524D\u3002\u30AB\u30FC\u30C9\u306E\u4E0B\u306B\u3001\u7A2E\u985E\u304C\u66F8\u3044\u3066\u3042\u308B\u3088"),
          bd([], { table: [["\u3044\u3064\u3082", "always", "F"], ["\u3088\u304F", "often", "F"], ["\u3068\u304D\u3069\u304D", "sometimes", "F"], ["\u305C\u3063\u305F\u3044\u301C\u306A\u3044", "never", "F"]], cap: "\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306E\u8A00\u8449" }),
          g("\u9A5A\u304F", "never \u306F\u300C\u305C\u3063\u305F\u3044\u301C\u306A\u3044\u300D\uFF01 \u306A\u3044\u3063\u3066\u8A00\u3046\u8A00\u8449\u3082\u3001\u8DB3\u3059\u3060\u3051\u306A\u3093\u3060"),
          bd(["S:Tom", "F:never|\u305C\u3063\u305F\u3044\u301C\u306A\u3044|\u3069\u308C\u304F\u3089\u3044", "V:runs"], { arrow: "add:1>2", cap: "Tom never runs.\u3000\u30C8\u30E0\u306F\u305C\u3063\u305F\u3044\u8D70\u3089\u306A\u3044" }),
          b("\u666E\u901A", "\u305D\u3046\u3002never \u3092\u8DB3\u3059\u3060\u3051\u3067\u3001\u300C\u305C\u3063\u305F\u3044\u3057\u306A\u3044\u300D\u306B\u306A\u308B\u3088"),
          g("\u8003\u3048\u308B", "is \u306E\u3068\u304D\u3082\u3001\u52D5\u304D\u306E\u524D\u306B\u7F6E\u304F\u306E\uFF1F"),
          bd(["S:Tom", "V:is", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "C:kind"], { small: 1, cap: "Tom is always kind.\u3000\u30C8\u30E0\u306F\u3044\u3064\u3082\u512A\u3057\u3044" }),
          b("\u3072\u3089\u3081\u304F", "is \u306E\u3068\u304D\u3060\u3051\u306F\u3001is \u306E\u5F8C\u308D\u306B\u7F6E\u304F\u3093\u3060\u3002is \u306F\u300C\uFF1D\u300D\u306E\u5408\u56F3\u3060\u3063\u305F\u3088\u306D"),
          b("\u666E\u901A", "\u3061\u3087\u3063\u3068\u7279\u5225\u3060\u304B\u3089\u3001\u4ECA\u306F\u7121\u7406\u306B\u899A\u3048\u306A\u304F\u3066\u5927\u4E08\u592B\u3002\u51FA\u3066\u304D\u305F\u3089\u3001\u307E\u305F\u601D\u3044\u51FA\u3057\u3066\u306D"),
          G("always", "\u3069\u308C\u304F\u3089\u3044", ["\u3069\u3093\u306A\u3075\u3046\u306B", "\u3069\u308C\u304F\u3089\u3044"], { subs: { "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u306E\u5F8C\u308D\u306B\u8DB3\u3059", "\u3069\u308C\u304F\u3089\u3044": "\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059" } }),
          G("slowly", "\u3069\u3093\u306A\u3075\u3046\u306B", ["\u3069\u3093\u306A\u3075\u3046\u306B", "\u3069\u308C\u304F\u3089\u3044"], { subs: { "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u306E\u5F8C\u308D\u306B\u8DB3\u3059", "\u3069\u308C\u304F\u3089\u3044": "\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059" } }),
          G("never", "\u3069\u308C\u304F\u3089\u3044", ["\u3069\u3093\u306A\u3075\u3046\u306B", "\u3069\u308C\u304F\u3089\u3044"], { subs: { "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u306E\u5F8C\u308D\u306B\u8DB3\u3059", "\u3069\u308C\u304F\u3089\u3044": "\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059" } }),
          G("quietly", "\u3069\u3093\u306A\u3075\u3046\u306B", ["\u3069\u3093\u306A\u3075\u3046\u306B", "\u3069\u308C\u304F\u3089\u3044"], { subs: { "\u3069\u3093\u306A\u3075\u3046\u306B": "\u52D5\u304D\u306E\u5F8C\u308D\u306B\u8DB3\u3059", "\u3069\u308C\u304F\u3089\u3044": "\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059" } }),
          B("Tom", "runs.", ["always", "quickly"], "always", { ctx: "\uFF08\u3044\u3064\u3082\u3001\u8D70\u308B\uFF09", hint: "\u3069\u3063\u3061\u304C\u524D\u306B\u6765\u308B\uFF1F", wrong: "\u300C\u3044\u3064\u3082\u300D\u306F\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306E\u8A00\u8449\u3002\u52D5\u304D\u306E\u524D\u306B\u8DB3\u3059\u3088" }),
          A("\u30C8\u30E0\u306F\u3044\u3064\u3082\u8D70\u308B", ["S:Tom", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:runs"]),
          AX("\u30DF\u30AB\u306F\u3088\u304F\u6B4C\u3046", ["S:Mika", "F:often|\u3088\u304F|\u3069\u308C\u304F\u3089\u3044", "V:sings"], [["a", 1]]),
          A("\u30B1\u30F3\u306F\u305C\u3063\u305F\u3044\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u306A\u3044", ["S:Ken", "F:never|\u305C\u3063\u305F\u3044\u301C\u306A\u3044|\u3069\u308C\u304F\u3089\u3044", "V:eats", "O:lunch"]),
          DX("\u30C8\u30E0\u306F\u3068\u304D\u3069\u304D\u6B4C\u3046", ["S:Tom", "F:\u3068\u304D\u3069\u304D|\u3069\u308C\u304F\u3089\u3044", "V:sings"], [["a", 1]], { en: "Tom sometimes sings.", words: [["\u3068\u304D\u3069\u304D", "sometimes"]] }),
          sum("\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u306F\u52D5\u304D\u306E\u524D\u3001\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u306F\u52D5\u304D\u306E\u5F8C\u308D\u3002is \u306E\u3068\u304D\u3060\u3051\u3001is \u306E\u5F8C\u308D")
        ] },
        { id: "3c-3", name: "\u524D\u3068\u5F8C\u308D\u3001\u4E21\u65B9\u8DB3\u3059", coin: 5, steps: [
          b("\u666E\u901A", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306B\u306F\u3001\u524D\u306B\u3082\u5F8C\u308D\u306B\u3082\u8DB3\u305B\u308B\u3093\u3060"),
          bd(["S:Tom", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], { small: 1, grp: [1, 3], cap: "Tom always runs fast.\u3000\u30C8\u30E0\u306F\u3044\u3064\u3082\u901F\u304F\u8D70\u308B" }),
          b("\u666E\u901A", "always runs fast\u3002\u52D5\u304D\u306E\u8A00\u8449\u3092\u771F\u3093\u4E2D\u306B\u3057\u3066\u3001\u524D\u3068\u5F8C\u308D\u306B\u8DB3\u3057\u305F\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u3060\u3088"),
          g("\u3072\u3089\u3081\u304F", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u304C\u30013\u8A9E\u3067\u3072\u3068\u304B\u305F\u307E\u308A\u306A\u3093\u3060\uFF01"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u8DB3\u3057\u305F\u8A00\u8449\u3082\u542B\u3081\u3066\u3001\u5168\u90E8\u3067\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u76F8\u624B\u304C\u3042\u308B\u3068\u304D\u306F\u3001\u3069\u3046\u306A\u308B\u306E\uFF1F"),
          b("\u666E\u901A", "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3068\u300C\u76F8\u624B\u300D\u306F\u3001\u96A3\u3069\u3046\u3057\u3002\u5F8C\u308D\u306B\u8DB3\u3059\u8A00\u8449\u306F\u3001\u76F8\u624B\u306E\u3042\u3068\u3060\u3088"),
          E("\u30C8\u30E0\u306F\u3044\u3064\u3082\u901F\u304F\u8D70\u308B", ["S:\u30C8\u30E0\u306F", "F:\u3044\u3064\u3082", "V:\u8D70\u308B", "R:\u901F\u304F"], [0, 1, 3, 2], "\u300C\u3044\u3064\u3082\u300D\u306F\u52D5\u304D\u306E\u524D\u3002\u300C\u901F\u304F\u300D\u306F\u3001\u65E5\u672C\u8A9E\u3067\u306F\u52D5\u304D\u306E\u524D\u3067\u3082\u3001\u82F1\u8A9E\u306F\u5F8C\u308D", { hint: HE }),
          A("\u30C8\u30E0\u306F\u3044\u3064\u3082\u901F\u304F\u8D70\u308B", ["S:Tom", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"]),
          AX("\u30DF\u30AB\u306F\u3068\u304D\u3069\u304D\u9759\u304B\u306B\u6B4C\u3046", ["S:Mika", "F:sometimes|\u3068\u304D\u3069\u304D|\u3069\u308C\u304F\u3089\u3044", "V:sings", "R:quietly|\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], [["a", 1]]),
          A("\u30B1\u30F3\u306F\u3044\u3064\u3082\u663C\u3054\u306F\u3093\u3092\u901F\u304F\u98DF\u3079\u308B", ["S:Ken", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:eats", "O:lunch", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"]),
          D("\u30B1\u30F3\u306F\u3044\u3064\u3082\u9759\u304B\u306B\u6B4C\u3046", ["S:Ken", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:\u6B4C\u3046", "R:\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], { en: "Ken always sings quietly.", words: [["\u6B4C\u3046", "sings"], ["\u9759\u304B\u306B", "quietly"]] }),
          sum("\u52D5\u304D\u306E\u524D\u306B\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u3001\u5F8C\u308D\u306B\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D\u3002\u524D\u5F8C\u306B\u8DB3\u3057\u3066\u3082\u3001\u3072\u3068\u304B\u305F\u307E\u308A")
        ] },
        { id: "3c-4", name: "\u30DC\u30B9\uFF1A\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          bd([], { table: [["\u3069\u308C\u304F\u3089\u3044", "always", "F"], ["\u52D5\u304D", "runs", "V"], ["\u3069\u3093\u306A\u3075\u3046\u306B", "fast", "R"]], cap: "\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          A("\u30DF\u30AB\u306F\u3044\u3064\u3082\u3086\u3063\u304F\u308A\u6B4C\u3046", ["S:Mika", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:sings", "R:slowly|\u3086\u3063\u304F\u308A|\u3069\u3093\u306A\u3075\u3046\u306B"], { dummy: ["slow"] }),
          A("\u30C8\u30E0\u306F\u9759\u304B\u306B\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:Tom", "V:eats", "O:lunch", "R:quietly|\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], { dummy: ["quiet"] }),
          AX("\u30B1\u30F3\u306F\u3088\u304F\u901F\u304F\u8D70\u308B", ["S:Ken", "F:often|\u3088\u304F|\u3069\u308C\u304F\u3089\u3044", "V:runs", "R:fast|\u901F\u304F|\u3069\u3093\u306A\u3075\u3046\u306B"], [["a", 1]], { dummy: ["slowly"] }),
          AX("\u79C1\u306E\u53CB\u3060\u3061\u306F\u3068\u304D\u3069\u304D\u4E0A\u624B\u306B\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "F:sometimes|\u3068\u304D\u3069\u304D|\u3069\u308C\u304F\u3089\u3044", "V:sings", "R:well|\u4E0A\u624B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], [["a", 2]], { dummy: ["good"] }),
          g("\u559C\u3076", "\u3067\u304D\u305F\uFF01 \u52D5\u304D\u3092\u771F\u3093\u4E2D\u306B\u3057\u3066\u3001\u524D\u3068\u5F8C\u308D\u306B\u8DB3\u305B\u3070\u3044\u3044\u3093\u3060\u306D"),
          g("\u8003\u3048\u308B", "\u306D\u3048\u3001\u6C17\u306B\u306A\u3063\u3066\u305F a \u3084 the \u306F\u3001\u3044\u3064\u5206\u304B\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u6B21\u304C\u305D\u308C\u3060\u3088\u3002\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u306E\u4F5C\u308A\u65B9\u3068\u3001a \u3084 the \u306E\u8A71\u3092\u3059\u308B\u306D"),
          sum("\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF \uFF1D \u524D\u306B\u300C\u3069\u308C\u304F\u3089\u3044\u300D\u3001\u52D5\u304D\u3001\u5F8C\u308D\u306B\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u300D")
        ] },
        /* ---------- 第3章 3d：人・物チャンク（ジャンル／具体的／それ！） ---------- */
        { id: "3d-0", name: "\u524D\u3068\u5F8C\u308D\u3001\u3069\u3046\u4F7F\u3044\u5206\u3051\u308B\uFF1F", coin: 5, steps: [
          b("\u666E\u901A", "\u3044\u3088\u3044\u3088\u3001a \u3084 the \u306E\u8A71\u3060\u3088\u3002\u4EBA\u3084\u7269\u306E\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u3063\u3066\u3044\u3053\u3046"),
          b("\u666E\u901A", "\u305D\u306E\u6700\u521D\u306B\u3001\u5927\u4E8B\u306A\u8A71\u3092\u3059\u308B\u306D\u3002\u3061\u3087\u3044\u8DB3\u3057\u306F\u3001\u524D\u306B\u7F6E\u304F\u6642\u3068\u3001\u5F8C\u308D\u306B\u7F6E\u304F\u6642\u3067\u3001\u4F7F\u3044\u5206\u3051\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u77ED\u3044\u8A00\u8449\u306F\u524D\u3001\u9577\u3044\u8A00\u8449\u306F\u5F8C\u308D\u3001\u3063\u3066\u8A00\u3063\u3066\u305F\u3088\u306D\u3002\u307B\u304B\u306B\u3082\u7406\u7531\u304C\u3042\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3042\u308B\u3088\u3002\u8A71\u3059\u4EBA\u306E\u6C17\u6301\u3061\u3067\u3001\u524D\u304B\u5F8C\u308D\u304B\u304C\u6C7A\u307E\u308B\u3093\u3060"),
          bd(["S:Tom", "V:is", "C:tall"], { cap: "Tom is tall.\u3000\u30C8\u30E0\u306F\u80CC\u304C\u9AD8\u3044" }),
          b("\u666E\u901A", "Tom is tall. \u3053\u308C\u306F\u300C\u30C8\u30E0\u306F\u80CC\u304C\u9AD8\u3044\u300D\u3002\u8A00\u3044\u305F\u3044\u3053\u3068\u306F\u3001\u30C8\u30E0\u306E\u80CC\u306E\u9AD8\u3055\u3060\u306D"),
          g("\u8003\u3048\u308B", "\u3046\u3093\u3002tall \u304C\u3001Tom \u306E\u8AAC\u660E\u306B\u306A\u3063\u3066\u308B\u306D"),
          b("\u666E\u901A", "\u3067\u3082\u3001\u672C\u5F53\u306B\u8A00\u3044\u305F\u3044\u306E\u304C\u300C\u30C8\u30E0\u304C\u8D70\u308B\u300D\u3053\u3068\u3060\u3068\u3057\u305F\u3089\uFF1F \u80CC\u306E\u9AD8\u3055\u306F\u3001\u3064\u3044\u3067\u306B\u8A00\u3044\u305F\u3044\u3060\u3051\u3060\u3088"),
          bd(["S:Tom", "V:is", "C:tall", "V:runs"], { small: 1, mark: "\xD7", cap: "Tom is tall runs.\u3000\u3053\u308C\u306F\u5909\uFF01" }),
          g("\u7126\u308B", "Tom is tall runs. \u3060\u3068\u2026\u2026\u3069\u308C\u304C\u571F\u53F0\u306A\u306E\u304B\u3001\u5206\u304B\u3089\u306A\u304F\u306A\u3063\u3061\u3083\u3046\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002is \u3082 runs \u3082\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306B\u898B\u3048\u3066\u3001\u8FF7\u3046\u3088\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3053\u3067\u3001\u300CTom \uFF1D tall\u300D\u3092\u7E2E\u3081\u3066\u3001\u30DA\u30A2\u306B\u3057\u3066\u3001\u524D\u306B\u51FA\u3059\u3093\u3060"),
          bd(["F:tall|\u80CC\u304C\u9AD8\u3044|\u3069\u3093\u306A", "S:Tom", "V:runs"], { arrow: "add:0>1", small: 1, cap: "tall Tom \uFF0B runs" }),
          g("\u9A5A\u304F", "\uFF1D\u304C\u306A\u304F\u3066\u3082\u3001\u300C\u80CC\u306E\u9AD8\u3044\u30C8\u30E0\u300D\u3060\u3063\u3066\u5206\u304B\u308B\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u30DA\u30A2\u306B\u3059\u308B\u3068\u3001\uFF1D\u3092\u306A\u304F\u305B\u308B\u3093\u3060\u3002\u3053\u308C\u3067\u300CTom runs.\u300D\u304C\u3001\u571F\u53F0\u306E\u307E\u307E\u6B8B\u308B\u3088"),
          bd(["F:Tall|\u80CC\u304C\u9AD8\u3044|\u3069\u3093\u306A", "S:Tom", "V:runs"], { arrow: "add:0>1", small: 1, cap: "Tall Tom runs.\u3000\u80CC\u306E\u9AD8\u3044\u30C8\u30E0\u304C\u8D70\u308B" }),
          b("\u666E\u901A", "\u5B8C\u6210\u3057\u305F\u6587\u306F Tall Tom runs. \u6587\u306E\u306F\u3058\u3081\u306E1\u6587\u5B57\u306F\u3001\u3044\u3064\u3082\u5927\u6587\u5B57\u306B\u306A\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "Tom \u3082\u3001\u3082\u3068\u3082\u3068\u5927\u6587\u5B57\u3060\u304B\u3089\u3001\u3061\u3087\u3063\u3068\u898B\u5206\u3051\u306B\u304F\u3044\u304B\u3082\u3002\u30A2\u30D7\u30EA\u306E\u5916\u306B\u306F\u3001\u8272\u3082\u306A\u3044\u3057\u2026\u2026"),
          b("\u666E\u901A", "\u305D\u3046\u3060\u306D\u3002\u3060\u304B\u3089\u3001\u300C\u3072\u3068\u304B\u305F\u307E\u308A\u304C\u3069\u3053\u307E\u3067\u304B\u300D\u3092\u898B\u308B\u3093\u3060\u3002Tall Tom \u306F\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u3067\u4E3B\u5F79\u306B\u306A\u3063\u3066\u3044\u308B\u3088"),
          b("\u3072\u3089\u3081\u304F", "\u30B3\u30C4\u306F\u3001He \u306B\u8A00\u3044\u304B\u3048\u3066\u307F\u308B\u3053\u3068\u3002Tall Tom runs. \u306F\u3001He runs. \u306B\u3057\u3066\u3082\u3001\u6587\u304C\u6210\u308A\u7ACB\u3064\u3088\u306D"),
          bd(["S:He", "V:runs"], { cap: "Tall Tom \u2192 He\u3000\u3072\u3068\u304B\u305F\u307E\u308A\u3092\u30011\u8A9E\u306B\u8A00\u3044\u304B\u3048\u308B" }),
          g("\u3072\u3089\u3081\u304F", "\u306A\u308B\u307B\u3069\uFF01 He \u306B\u8A00\u3044\u304B\u3048\u3089\u308C\u308B\u3068\u3053\u308D\u307E\u3067\u304C\u3001\u4E3B\u5F79\u306E\u3072\u3068\u304B\u305F\u307E\u308A\u306A\u3093\u3060"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u3053\u306E\u898B\u65B9\u306F\u3001\u3053\u308C\u304B\u3089\u3082\u305A\u3063\u3068\u4F7F\u3048\u308B\u3088"),
          b("\u666E\u901A", "\u3053\u3053\u307E\u3067\u3092\u6574\u7406\u3059\u308B\u3088\u3002\u524D\u306B\u7F6E\u304F\u306E\u306F\u3001\u3055\u3063\u3068\u6E08\u307E\u305B\u305F\u3044\u6642\u3002\u571F\u53F0\u306E\u90AA\u9B54\u3092\u3057\u306A\u3044\u3093\u3060"),
          bd(["F:cute|\u304B\u308F\u3044\u3044|\u3069\u3093\u306A", "S:cats", "V:sleep"], { arrow: "add:0>1", small: 1, cap: "cute cats \uFF0B sleep\u3000\u3055\u3063\u3068\uFF1A\u304B\u308F\u3044\u3044" }),
          b("\u666E\u901A", "\u5F8C\u308D\u306B\u7F6E\u304F\u306E\u306F\u3001\u8A73\u3057\u304F\u8A00\u3044\u305F\u3044\u6642\u3002\u305D\u3053\u306B\u3001\u8A00\u3044\u305F\u3044\u3053\u3068\u304C\u3042\u308B\u3093\u3060"),
          bd(["S:The cat", "R:on the sofa|\u30BD\u30D5\u30A1\u306E\u4E0A\u306E|\u3069\u3053\u306E", "V:sleeps"], { arrow: "add:1>0", small: 1, cap: "The cat on the sofa \uFF0B sleeps\u3000\u8A73\u3057\u304F\uFF1A\u30BD\u30D5\u30A1\u306E\u4E0A\u306E" }),
          g("\u3072\u3089\u3081\u304F", "\u524D\u306F\u3001\u3055\u3063\u3068\u3002\u5F8C\u308D\u306F\u3001\u8A73\u3057\u304F\u3002\u3060\u304B\u3089\u3001\u524D\u306F\u77ED\u304F\u3066\u3001\u5F8C\u308D\u306F\u307E\u3068\u307E\u308A\u306B\u306A\u308B\u306E\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u300C\u77ED\u3044\u8A00\u8449\u306F\u524D\u3001\u9577\u3044\u8A00\u8449\u306F\u5F8C\u308D\u300D\u306F\u3001\u305D\u306E\u7D50\u679C\u306A\u3093\u3060"),
          b("\u666E\u901A", "\u524D\u306B\u7F6E\u304F\u306E\u306F\u3001\u305D\u306E\u4EBA\u30FB\u7269\u3089\u3057\u3055\uFF08\u6027\u8CEA\uFF09\u306E\u8A00\u8449\u304C\u591A\u3044\u3088\u3002cute \u3084 small \u3084 tall \u3060\u306D"),
          b("\u666E\u901A", "\u5F8C\u308D\u306B\u7F6E\u304F\u306E\u306F\u3001\u4ECA\u306E\u72B6\u6CC1\u3092\u8A73\u3057\u304F\u8A00\u3046\u8A00\u8449\u3002\u3069\u3053\u306E\u3001\u3044\u3064\u306E\u3001\u3069\u3093\u306A\u3075\u3046\u306B\u3001\u307F\u305F\u3044\u306A\u8A00\u8449\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u304B\u308F\u3044\u3044\u306F\u3001\u306D\u3053\u306E\u3089\u3057\u3055\u3002\u30BD\u30D5\u30A1\u306E\u4E0A\u306F\u3001\u4ECA\u3060\u3051\u306E\u72B6\u6CC1\u3060\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u3075\u3060\u3093\u304B\u3089\u305D\u3046\u306A\u3089\u524D\u3001\u4ECA\u3060\u3051\u306A\u3089\u5F8C\u308D\u3001\u3068\u8003\u3048\u308B\u3068\u5206\u304B\u308A\u3084\u3059\u3044\u3088"),
          bd(["S:Tom", "V:likes", "F:old|\u53E4\u3044|\u3069\u3093\u306A", "O:music", "R:from Japan|\u65E5\u672C\u306E|\u3069\u3053\u306E"], { cap: "Tom likes old music from Japan." }),
          b("\u666E\u901A", "\u4E3B\u5F79\u306E\u8AAC\u660E\u3067\u3082\u3001\u2462\u306E\u8AAC\u660E\u3067\u3082\u3001\u8003\u3048\u65B9\u306F\u540C\u3058\u3002\u3055\u3063\u3068\u6E08\u307E\u305B\u305F\u3044\u306A\u3089\u524D\u3001\u8A73\u3057\u304F\u8A00\u3044\u305F\u3044\u306A\u3089\u5F8C\u308D\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u3082\u3057\u3001\u8FF7\u3063\u305F\u3089\uFF1F"),
          b("\u666E\u901A", "\u4F8B\u5916\u3082\u3042\u308B\u3051\u3069\u3001\u8FF7\u3063\u305F\u3089\u3001\u77ED\u3044\u306A\u3089\u524D\u3001\u9577\u3044\u306A\u3089\u5F8C\u308D\u3001\u306B\u3057\u3066\u304A\u3051\u3070\u5927\u4E08\u592B"),
          G("cute", "\u524D\uFF08\u3055\u3063\u3068\uFF09", ["\u524D\uFF08\u3055\u3063\u3068\uFF09", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09"], { hint: "\u3053\u306E\u8A00\u8449\u306F\u3001\u524D\u3068\u5F8C\u308D\u306E\u3069\u3063\u3061\uFF1F", wrong: "\u77ED\u304F\u3066\u3001\u305D\u306E\u7269\u3089\u3057\u3055\u3092\u8868\u3059\u8A00\u8449\u306F\u3001\u524D\u306B\u7F6E\u304F\u3088" }),
          G("on the sofa", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09", ["\u524D\uFF08\u3055\u3063\u3068\uFF09", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09"], { hint: "\u3053\u306E\u8A00\u8449\u306F\u3001\u524D\u3068\u5F8C\u308D\u306E\u3069\u3063\u3061\uFF1F", wrong: "\u307E\u3068\u307E\u308A\u3067\u3001\u4ECA\u306E\u72B6\u6CC1\u3092\u8A73\u3057\u304F\u8A00\u3046\u8A00\u8449\u306F\u3001\u5F8C\u308D\u306B\u7F6E\u304F\u3088" }),
          G("tall", "\u524D\uFF08\u3055\u3063\u3068\uFF09", ["\u524D\uFF08\u3055\u3063\u3068\uFF09", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09"], { hint: "\u3053\u306E\u8A00\u8449\u306F\u3001\u524D\u3068\u5F8C\u308D\u306E\u3069\u3063\u3061\uFF1F", wrong: "\u77ED\u304F\u3066\u3001\u305D\u306E\u4EBA\u3089\u3057\u3055\u3092\u8868\u3059\u8A00\u8449\u306F\u3001\u524D\u306B\u7F6E\u304F\u3088" }),
          G("from Japan", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09", ["\u524D\uFF08\u3055\u3063\u3068\uFF09", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09"], { hint: "\u3053\u306E\u8A00\u8449\u306F\u3001\u524D\u3068\u5F8C\u308D\u306E\u3069\u3063\u3061\uFF1F", wrong: "\u307E\u3068\u307E\u308A\u3067\u3001\u304F\u308F\u3057\u304F\u8A00\u3046\u8A00\u8449\u306F\u3001\u5F8C\u308D\u306B\u7F6E\u304F\u3088" }),
          G("red", "\u524D\uFF08\u3055\u3063\u3068\uFF09", ["\u524D\uFF08\u3055\u3063\u3068\uFF09", "\u5F8C\u308D\uFF08\u8A73\u3057\u304F\uFF09"], { hint: "\u3053\u306E\u8A00\u8449\u306F\u3001\u524D\u3068\u5F8C\u308D\u306E\u3069\u3063\u3061\uFF1F", wrong: "\u77ED\u304F\u3066\u3001\u8272\u306A\u3069\u306E\u3089\u3057\u3055\u3092\u8868\u3059\u8A00\u8449\u306F\u3001\u524D\u306B\u7F6E\u304F\u3088" }),
          A("\u80CC\u306E\u9AD8\u3044\u30C8\u30E0\u304C\u8D70\u308B", ["F:Tall|\u80CC\u304C\u9AD8\u3044|\u3069\u3093\u306A", "S:Tom", "V:runs"]),
          A("\u5C0F\u3055\u3044\u30DF\u30AB\u304C\u6B4C\u3046", ["F:Small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:Mika", "V:sings"]),
          A("\u30BD\u30D5\u30A1\u306E\u4E0A\u306E\u306D\u3053\u304C\u7720\u308B", ["S:The cat", "R:on the sofa|\u30BD\u30D5\u30A1\u306E\u4E0A\u306E|\u3069\u3053\u306E", "V:sleeps"]),
          sum("\u3055\u3063\u3068\u6E08\u307E\u305B\u305F\u3044 \u2192 \u524D\uFF08\u77ED\u304F\uFF09\uFF0F\u8A73\u3057\u304F\u8A00\u3044\u305F\u3044 \u2192 \u5F8C\u308D\uFF08\u307E\u3068\u307E\u308A\uFF09")
        ] },
        { id: "3d-1", name: "\u30B8\u30E3\u30F3\u30EB\u3068\u3001\u5177\u4F53\u7684\u306A\u3072\u3068\u3064", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u3001\u3082\u306E\u306E\u4E00\u756A\u524D\u306B\u3064\u304F\u8A00\u8449\u306E\u8A71\u3060\u3088"),
          g("\u8003\u3048\u308B", "a \u3068\u304B the \u306E\u8A71\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u201C\u30DA\u30A2\u201D\u3063\u3066\u8A00\u3063\u3066\u305F\u3051\u3069\u3001\u5B9F\u306F\u3061\u3083\u3093\u3068\u610F\u5473\u304C\u3042\u308B\u3093\u3060"),
          bd(["S:Cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB", "V:sleep"], { cap: "Cats sleep.\u3000\u306D\u3053\u306F\u7720\u308B" }),
          b("\u666E\u901A", "Cats sleep. \u3053\u308C\u306F\u3001\u7279\u5B9A\u306E1\u5339\u306E\u8A71\u3058\u3083\u306A\u3044\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u3058\u3083\u3042\u3001\u4F55\u306E\u8A71\u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u300C\u30B8\u30E3\u30F3\u30EB\u300D\u306E\u8A71\u3060\u3088\u3002\u8F2A\u90ED\u304C\u306A\u304F\u3066\u3001\u307C\u3093\u3084\u308A\u3057\u305F\u201C\u306D\u3053\u201D\u306E\u30A4\u30E1\u30FC\u30B8\u3060\u306D"),
          b("\u666E\u901A", "\u30B8\u30E3\u30F3\u30EB\u3067\u8A00\u3046\u6642\u306F\u3001\u4F55\u3082\u3064\u3051\u306A\u3044\u3093\u3060\u3002cats \u306E\u3088\u3046\u306B\u3001s \u304C\u3064\u304F\u3053\u3068\u304C\u591A\u3044\u3051\u3069\u306D"),
          g("\u7126\u308B", "s\u3001\u5FD8\u308C\u3061\u3083\u3044\u305D\u3046\u2026\u2026"),
          b("\u559C\u3076", "\u9806\u756A\u304C\u5927\u4E8B\u3060\u304B\u3089\u3001\u4ECA\u306F\u9593\u9055\u3048\u3066\u3082\u3044\u3044\u3088"),
          b("\u666E\u901A", "\u3058\u3083\u3042\u3001\u306D\u3053\u3092\u201C1\u5339\u201D\u3068\u3057\u3066\u8A00\u3044\u305F\u3044\u6642\u306F\u3001\u3069\u3046\u3059\u308B\u3068\u601D\u3046\uFF1F"),
          g("\u8003\u3048\u308B", "\u3046\u30FC\u3093\u2026\u2026\u307C\u3093\u3084\u308A\u3057\u3066\u305F\u3089\u30011\u5339\u3063\u3066\u5206\u304B\u3089\u306A\u3044\u3088\u306D"),
          bd(["S:A cat|1\u5339\u306E\u306D\u3053|" + AN, "V:sleeps"], { draw: 1, cap: "A cat sleeps.\u30001\u5339\u306E\u306D\u3053\u304C\u7720\u308B" }),
          b("\u3072\u3089\u3081\u304F", "\u306D\u3053\u306B\u8F2A\u90ED\u3092\u63CF\u3044\u3066\u3001\u6570\u3048\u3089\u308C\u308B\u201C\u3072\u3068\u3064\u201D\u306B\u3059\u308B\u3093\u3060\u3002\u305D\u306E\u5408\u56F3\u304C a \u3060\u3088"),
          g("\u9A5A\u304F", "a \u306F\u3001\u8F2A\u90ED\u3092\u63CF\u304F\u5408\u56F3\u306A\u3093\u3060\uFF01"),
          b("\u666E\u901A", "a cat \u306F\u3001\u73FE\u5B9F\u306B\u3044\u308B\u3001\u6570\u3048\u3089\u308C\u308B1\u5339\u3002\u3067\u3082\u3001\u3069\u306E\u5B50\u304B\u306F\u3001\u307E\u3060\u6C7A\u307E\u3063\u3066\u306A\u3044\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "\u3042\u308C\uFF1F \u4ECA\u5EA6\u306F\u3001sleeps \u306B s \u304C\u3064\u3044\u3066\u308B\uFF01"),
          b("\u666E\u901A", "\u524D\u306B\u3082\u51FA\u3066\u304D\u305F\u306D\u3002\u3072\u3068\u308A\u306E\u6642\u306F\u3001\u52D5\u304D\u306E\u307B\u3046\u306B s \u304C\u3064\u304F\u3093\u3060"),
          bd(["S:Tom", "V:likes", "O:music|\u97F3\u697D|\u30B8\u30E3\u30F3\u30EB"], { arrow: "out", cap: "Tom likes music.\u3000\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D" }),
          b("\u666E\u901A", "\u3068\u3053\u308D\u3067\u3001music \u3084 water \u307F\u305F\u3044\u306B\u3001\u8F2A\u90ED\u304C\u306A\u304F\u3066\u6570\u3048\u3089\u308C\u306A\u3044\u3082\u306E\u306F\u3001\u305A\u3063\u3068\u30B8\u30E3\u30F3\u30EB\u306E\u307E\u307E\u306A\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "\u3060\u304B\u3089\u4F55\u3082\u3064\u304B\u306A\u3044\u3093\u3060\uFF01 Tom likes music. \u306E music \u306B\u4F55\u3082\u306A\u304B\u3063\u305F\u306E\u306F\u3001\u305D\u3046\u3044\u3046\u3053\u3068\u304B"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\uFF01 \u3058\u3083\u3042\u3001\u3053\u3053\u306B a \u3092\u3064\u3051\u3066\u307F\u308B\u3068\u3001\u3069\u3046\u306A\u308B\u304B\u306A\uFF1F"),
          bd(["S:Tom", "V:likes", "O:a music|\u97F3\u697D|" + AN], { arrow: "out", mark: "\xD7", bad: 2, cap: "Tom likes a music.\u3000\u3053\u308C\u306F\u5909\uFF01" }),
          g("\u8003\u3048\u308B", "\u97F3\u697D\u3092\u3001\u6570\u3048\u3089\u308C\u308B\u201C\u3072\u3068\u3064\u201D\u306B\u3057\u3088\u3046\u3068\u3057\u3066\u308B\u306E\u306D\u2026\u2026"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u8F2A\u90ED\u304C\u63CF\u3051\u306A\u3044\u3082\u306E\u306B\u3001a \u306F\u3064\u3051\u3089\u308C\u306A\u3044\u3093\u3060"),
          G("cats", "\u30B8\u30E3\u30F3\u30EB", ["\u30B8\u30E3\u30F3\u30EB", AN]),
          G("a cat", AN, ["\u30B8\u30E3\u30F3\u30EB", AN]),
          G("music", "\u30B8\u30E3\u30F3\u30EB", ["\u30B8\u30E3\u30F3\u30EB", AN]),
          G("a dog", AN, ["\u30B8\u30E3\u30F3\u30EB", AN]),
          A("\u306D\u3053\u306F\u7720\u308B\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["S:Cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB", "V:sleep"]),
          A("1\u5339\u306E\u306D\u3053\u304C\u7720\u308B", ["S:A cat|1\u5339\u306E\u306D\u3053|" + AN, "V:sleeps"]),
          D("\u79C1\u306F\u72AC\u304C\u597D\u304D\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["S:I", "V:like", "O:\u72AC"], { en: "I like dogs.", words: [["\u72AC", "dogs"]] }),
          sum("\u4F55\u3082\u306A\u3057 \uFF1D \u30B8\u30E3\u30F3\u30EB\uFF08\u307C\u3093\u3084\u308A\uFF09\uFF0F a \uFF1D \u5177\u4F53\u7684")
        ] },
        { id: "3d-2", name: "\u300C\u305D\u308C\uFF01\u300D", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F the\u3002\u3053\u308C\u306F\u300C\u305D\u308C\uFF01\u300D\u306E\u5408\u56F3\u3060\u3088"),
          bd(["S:The cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01", "V:sleeps"], { draw: 1, cap: "The cat sleeps.\u3000\u305D\u306E\u306D\u3053\u304C\u7720\u308B" }),
          b("\u666E\u901A", "The cat sleeps. \u8A71\u3057\u3066\u308B\u4EBA\u3082\u3001\u805E\u3044\u3066\u308B\u4EBA\u3082\u3001\u3069\u306E\u306D\u3053\u304B\u5206\u304B\u3063\u3066\u3044\u308B\u6642\u306E\u8A00\u3044\u65B9\u3060\u3088"),
          g("\u8003\u3048\u308B", "a cat \u306F\u3001\u3069\u306E\u5B50\u304B\u307E\u3060\u6C7A\u307E\u3063\u3066\u306A\u304F\u3066\u3001the cat \u306F\u3001\u6C7A\u307E\u3063\u3066\u308B\u3093\u3060\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u805E\u3044\u3066\u308B\u4EBA\u306B\u3082\u3001\u300C\u3042\u306E\u5B50\u306E\u3053\u3068\u306D\uFF01\u300D\u3068\u4F1D\u308F\u308B\u6642\u3060\u3051\u3001the \u3092\u4F7F\u3046\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u307F\u3093\u306A\u304C\u77E5\u3063\u3066\u308B\u3082\u306E\u3067\u3082\u3001the \u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u3046\u3093\u3002\u4E16\u754C\u306B\u3072\u3068\u3064\u3057\u304B\u306A\u3044\u3082\u306E\u3084\u3001\u307F\u3093\u306A\u304C\u5206\u304B\u308B\u3082\u306E\u3082 the \u3060\u3088\u3002the sun\uFF08\u592A\u967D\uFF09\u307F\u305F\u3044\u306B\u306D"),
          bd(["S:Cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB", "S:A cat|1\u5339\u306E\u306D\u3053|" + AN, "S:The cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01"], { lr: "\u307C\u3093\u3084\u308A \u2192 \u306F\u3063\u304D\u308A", cap: "\u30B8\u30E3\u30F3\u30EB \u2192 \u5177\u4F53\u7684 \u2192 \u305D\u308C\uFF01" }),
          b("\u666E\u901A", "\u3053\u3053\u307E\u3067\u3092\u4E26\u3079\u3066\u307F\u3088\u3046\u3002\u307C\u3093\u3084\u308A\u3057\u305F\u30B8\u30E3\u30F3\u30EB\u304B\u3089\u3001\u5177\u4F53\u7684\u306A\u3072\u3068\u3064\u3001\u305D\u3057\u3066\u300C\u305D\u308C\uFF01\u300D\u3078"),
          g("\u559C\u3076", "\u3060\u3093\u3060\u3093\u3001\u5177\u4F53\u7684\u306B\u306A\u3063\u3066\u3044\u304F\u3093\u3060\u306D\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u3053\u308C\u3082\u300C\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u300D\u3068\u540C\u3058\u3067\u3001\u307C\u3093\u3084\u308A\u304B\u3089\u3001\u306F\u3063\u304D\u308A\u3078\u3001\u3068\u3044\u3046\u6D41\u308C\u3060\u3088"),
          G("the cat", "\u305D\u308C\uFF01"),
          G("a dog", AN),
          G("birds", "\u30B8\u30E3\u30F3\u30EB"),
          G("the sun", "\u305D\u308C\uFF01"),
          B("", "cat sleeps.", ["A", "The"], "The", { ctx: "\uFF08\u3069\u306E\u306D\u3053\u304B\u3001\u304A\u4E92\u3044\u5206\u304B\u3063\u3066\u3044\u308B\uFF09", hint: "A \uFF0F The \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u304A\u4E92\u3044\u306B\u3001\u3069\u306E\u306D\u3053\u304B\u5206\u304B\u3063\u3066\u3044\u308B\u6642\u306F\u300C\u305D\u308C\uFF01\u300D\u3060\u3088" }),
          B("", "cat sleeps.", ["A", "The"], "A", { ctx: "\uFF08\u3069\u308C\u304B\u306F\u5206\u304B\u3089\u306A\u3044\u30011\u5339\u306E\u306D\u3053\uFF09", hint: "A \uFF0F The \u306E\u3069\u3061\u3089\u304B\u306A\uFF1F", wrong: "\u3069\u308C\u306E\u3053\u3068\u304B\u307E\u3060\u6C7A\u307E\u3063\u3066\u3044\u306A\u3044\u3001\u6570\u3048\u3089\u308C\u308B1\u5339\u306F\u3001\u300C\u5177\u4F53\u7684\u300D\u3060\u3088" }),
          B("Tom likes", "music.", ["a", "the", "\u306A\u3057"], "\u306A\u3057", { ctx: "\uFF08\u97F3\u697D\u3068\u3044\u3046\u30B8\u30E3\u30F3\u30EB\u306E\u8A71\uFF09", hint: "a \uFF0F the \uFF0F \u306A\u3057 \u306E\u3069\u308C\u304B\u306A\uFF1F", wrong: "\u8F2A\u90ED\u304C\u63CF\u3051\u306A\u3044\u3001\u307C\u3093\u3084\u308A\u3057\u305F\u30B8\u30E3\u30F3\u30EB\u306B\u306F\u3001\u4F55\u3082\u3064\u3051\u306A\u3044\u3088" }),
          A("\u305D\u306E\u306D\u3053\u304C\u7720\u308B", ["S:The cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01", "V:sleeps"]),
          A("\u30C8\u30E0\u306F\u305D\u306E\u306D\u3053\u3092\u547C\u3076", ["S:Tom", "V:calls", "O:the cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01"]),
          A("\u30DF\u30AB\u306F\u72AC\u304C\u597D\u304D\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["S:Mika", "V:likes", "O:dogs|\u72AC|\u30B8\u30E3\u30F3\u30EB"]),
          sum("\u30B8\u30E3\u30F3\u30EB\uFF08\u4F55\u3082\u306A\u3057\uFF09\u2192 \u5177\u4F53\u7684\uFF08a\uFF09\u2192 \u305D\u308C\uFF01\uFF08the\uFF09")
        ] },
        { id: "3d-3", name: "\u8DB3\u3057\u8A00\u8449\u3068\u7D44\u307F\u5408\u308F\u305B\u308B", coin: 5, steps: [
          b("\u666E\u901A", "\u3061\u3087\u3044\u8DB3\u3057\u3068\u3001a / the \u3092\u3001\u3044\u3063\u3057\u3087\u306B\u4F7F\u3063\u3066\u307F\u3088\u3046"),
          bd(["F:A|1\u3064\u306E|" + AN, "F:small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cat"], { lr: "\u5DE6\u304B\u3089\u53F3\u3078", cap: "A small cat\u3000\u5C0F\u3055\u30441\u5339\u306E\u306D\u3053" }),
          b("\u666E\u901A", "a \u3082 small \u3082\u3001cat \u306E\u524D\u306B\u8DB3\u3059\u8A00\u8449\u3060\u3088\u3002\u9806\u756A\u306F\u3001a / the \u304C\u6700\u521D\u3002\u305D\u306E\u6B21\u306B\u300C\u3069\u3093\u306A\u300D\u3001\u305D\u306E\u3042\u3068\u306B\u300C\u3082\u306E\u300D\u3060\u306D"),
          g("\u8003\u3048\u308B", "a \u304C\u6700\u521D\u3067\u3001small \u306F\u305D\u306E\u6B21\u306A\u306E\u306D\u3002\u65E5\u672C\u8A9E\u306E\u300C\u5C0F\u3055\u30441\u5339\u306E\u306D\u3053\u300D\u3068\u3001\u9806\u756A\u304C\u9055\u3046\u304B\u3082"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u82F1\u8A9E\u306F\u3001\u307E\u305A\u201C\u8F2A\u90ED\u3092\u63CF\u304F\u5408\u56F3\u201D\u3092\u51FA\u3057\u3066\u3001\u305D\u308C\u304B\u3089\u4E2D\u8EAB\u3092\u8A00\u3046\u3093\u3060"),
          bd(["F:The|\u305D\u306E|\u305D\u308C\uFF01", "F:small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cat", "R:on the sofa|\u30BD\u30D5\u30A1\u306E\u4E0A\u306E|\u3069\u3053\u306E"], { small: 1, lr: "\u5DE6\u304B\u3089\u53F3\u3078", cap: "The small cat on the sofa\u3000\u30BD\u30D5\u30A1\u306E\u4E0A\u306E\u3001\u305D\u306E\u5C0F\u3055\u3044\u306D\u3053" }),
          b("\u666E\u901A", "\u5F8C\u308D\u306B\u8DB3\u3059\u8A00\u8449\u304C\u3042\u3063\u3066\u3082\u540C\u3058\u3002the small cat on the sofa \u306A\u3089\u300C\u30BD\u30D5\u30A1\u306E\u4E0A\u306E\u3001\u305D\u306E\u5C0F\u3055\u3044\u306D\u3053\u300D\u3060\u306D"),
          g("\u3072\u3089\u3081\u304F", "a small cat \u3068 the small cat\u3002\u9055\u3044\u306F\u3001\u201C\u3069\u308C\u304B\u5206\u304B\u3089\u306A\u3044\u3072\u3068\u3064\u201D\u304B\u3001\u201C\u305D\u308C\uFF01\u201D\u304B\u3060\u3051\u3060\u306D"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u201C\u30DA\u30A2\u201D\u3068\u8A00\u3063\u3066\u3044\u305F a \u306F\u3001\u3053\u3046\u3044\u3046\u3053\u3068\u3060\u3063\u305F\u3093\u3060"),
          bd(["F:Small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB"], { lr: "\u5DE6\u304B\u3089\u53F3\u3078", cap: "Small cats\u3000\u5C0F\u3055\u3044\u306D\u3053\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09" }),
          g("\u8003\u3048\u308B", "\u30B8\u30E3\u30F3\u30EB\u306E\u3068\u304D\u306F\u3001a \u3082 the \u3082\u3064\u304B\u306A\u3044\u304B\u3089\u2026\u2026small cats \u3060\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u6B63\u89E3\uFF01 Small cats sleep. \u306E\u3088\u3046\u306B\u306D"),
          G("a small cat", AN),
          G("small cats", "\u30B8\u30E3\u30F3\u30EB"),
          G("the small cat", "\u305D\u308C\uFF01"),
          A("\u5C0F\u3055\u3044\u306D\u3053\u304C\u7720\u308B\uFF08\u3069\u308C\u304B\u306E1\u5339\uFF09", ["F:A|1\u3064\u306E|" + AN, "F:small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cat", "V:sleeps"]),
          A("\u305D\u306E\u30BD\u30D5\u30A1\u306E\u4E0A\u306E\u306D\u3053\u304C\u7720\u308B", ["F:The|\u305D\u306E|\u305D\u308C\uFF01", "S:cat", "R:on the sofa|\u30BD\u30D5\u30A1\u306E\u4E0A\u306E|\u3069\u3053\u306E", "V:sleeps"]),
          A("\u5C0F\u3055\u3044\u306D\u3053\u306F\u7720\u308B\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["F:Small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "S:cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB", "V:sleep"]),
          D("\u30C8\u30E0\u306F\u5C0F\u3055\u3044\u72AC\u304C\u597D\u304D\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["S:Tom", "V:likes", "F:small|\u5C0F\u3055\u3044|\u3069\u3093\u306A", "O:\u72AC"], { en: "Tom likes small dogs.", words: [["\u72AC", "dogs"]] }),
          sum("a / the\uFF08\u307E\u305F\u306F\u4F55\u3082\u306A\u3057\uFF09\u2192 \u3069\u3093\u306A \u2192 \u3082\u306E \u2192 \u5F8C\u308D\u306E\u8DB3\u3057\u8A00\u8449")
        ] },
        { id: "3d-4", name: "\u30DC\u30B9\uFF1A\u4EBA\u30FB\u7269\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          bd(["S:Cats|\u306D\u3053|\u30B8\u30E3\u30F3\u30EB", "S:A cat|1\u5339\u306E\u306D\u3053|" + AN, "S:The cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01"], { lr: "\u307C\u3093\u3084\u308A \u2192 \u306F\u3063\u304D\u308A", cap: "\u30B8\u30E3\u30F3\u30EB \u2192 \u5177\u4F53\u7684 \u2192 \u305D\u308C\uFF01" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u3001\u4EBA\u30FB\u7269\u306E\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          g("\u3072\u3089\u3081\u304F", "\u30B8\u30E3\u30F3\u30EB\u304B\u3001\u5177\u4F53\u7684\u304B\u3001\u305D\u308C\uFF01\u304B\u3001\u8003\u3048\u308B\u3093\u3060\u306D"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          A("\u305D\u306E\u306D\u3053\u304C\u7720\u308B", ["S:The cat|\u305D\u306E\u306D\u3053|\u305D\u308C\uFF01", "V:sleeps"], { dummy: ["a"] }),
          A("\u30C8\u30E0\u306F\u97F3\u697D\u304C\u597D\u304D", ["S:Tom", "V:likes", "O:music|\u97F3\u697D|\u30B8\u30E3\u30F3\u30EB"], { dummy: ["the"] }),
          A("\u5F7C\u5973\u306F\u79C1\u306B\u8D64\u3044\u82B1\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "F:red|\u8D64\u3044|\u3069\u3093\u306A", "O:flowers|\u82B1|\u30B8\u30E3\u30F3\u30EB"], { dummy: ["the"] }),
          A("\u9CE5\u304C\u516C\u5712\u3067\u6B4C\u3046\uFF08\u30B8\u30E3\u30F3\u30EB\uFF09", ["S:Birds|\u9CE5|\u30B8\u30E3\u30F3\u30EB", "V:sing", "W:in the park|\u516C\u5712\u3067|\u3069\u3053"], { dummy: ["a"] }),
          A("\u30B1\u30F3\u306F\u305D\u306E\u65B0\u3057\u3044\u672C\u3092\u8AAD\u3080", ["S:Ken", "V:reads", "F:the|\u305D\u306E|\u305D\u308C\uFF01", "F:new|\u65B0\u3057\u3044|\u3069\u3093\u306A", "O:book"], { dummy: ["a"] }),
          g("\u559C\u3076", "\u3067\u304D\u305F\uFF01 \u4F55\u3082\u4ED8\u3051\u306A\u3044\u6642\u3068\u3001a \u3068\u3001the \u306E\u9055\u3044\u304C\u3001\u5206\u304B\u3063\u305F\u6C17\u304C\u3059\u308B\uFF01"),
          b("\u666E\u901A", "\u8F2A\u90ED\u304C\u3042\u308B\u304B\u3001\u6570\u3048\u3089\u308C\u308B\u304B\u3002\u305D\u308C\u304C\u3001\u305D\u306E\u4EBA\u30FB\u7269\u306E\u201C\u898B\u3048\u65B9\u201D\u306A\u3093\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u306D\u3048\u3001\u3053\u3053\u307E\u3067\u306E\u30D1\u30FC\u30C4\u3063\u3066\u3001\u7D50\u5C40\u3069\u3053\u306B\u5165\u308B\u3093\u3060\u3063\u3051\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3044\u3044\u8CEA\u554F\u3002\u6700\u5F8C\u306B\u3001\u5168\u4F53\u3092\u6574\u7406\u3057\u3088\u3046"),
          sum("\u30B8\u30E3\u30F3\u30EB \u2192 \u5177\u4F53\u7684 \u2192 \u305D\u308C\uFF01")
        ] },
        /* ---------- 第3章 3e：全体ふりかえり（どこに何が入る？） ---------- */
        { id: "3e-1", name: "\u3069\u3053\u306B\u4F55\u304C\u5165\u308B\uFF1F", coin: 5, steps: [
          b("\u666E\u901A", "\u3053\u3053\u307E\u3067\u3001\u3044\u308D\u3044\u308D\u306A\u8A00\u8449\u3092\u8DB3\u3057\u3066\u304D\u305F\u306D\u3002\u6700\u5F8C\u306B\u3001\u5168\u4F53\u3092\u6574\u7406\u3057\u3088\u3046"),
          b("\u666E\u901A", "\u8A71\u3059\u6642\u306F\u3001\u8A00\u3044\u305F\u3044\u3053\u3068\u304C\u5148\u306B\u982D\u306B\u3042\u308B\u3088\u306D\u3002\u305D\u3053\u304B\u3089\u3001\u90E8\u5206\u3092\u7D30\u304B\u304F\u8A00\u3063\u3066\u3044\u304F\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u805E\u304F\u6642\u306F\u3001\u53CD\u5BFE\u306B\u3001\u5148\u304C\u5206\u304B\u3089\u306A\u3044\u307E\u307E\u3001\u9806\u756A\u306B\u53D7\u3051\u53D6\u308B\u3088\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002\u805E\u304F\u6642\u306F\u5DE6\u304B\u3089\u53F3\u3078\u3001\u8A71\u3059\u6642\u306F\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3002\u540C\u3058\u6587\u3092\u30012\u3064\u306E\u65B9\u5411\u304B\u3089\u898B\u3066\u3044\u308B\u3093\u3060"),
          bd(["S:Mika", "V:sings", "W:in the park|\u516C\u5712\u3067|\u3069\u3053", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { grow: 1, cap: "\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3002\u5DE6\u304B\u3089\u53F3\u3078" }),
          b("\u666E\u901A", "\u4E3B\u5F79\u304B\u3089\u3001\u5916\u3078\u5E83\u304C\u3063\u3066\u3044\u308B\u306D\u3002\u3069\u306E\u5834\u9762\u3082\u3001\u3064\u306A\u304E\u8A00\u8449\u3068\u4EBA\u30FB\u7269\u306E\u8A00\u8449\u3067\u3067\u304D\u3066\u3044\u308B\u3088"),
          bd([], { table: [["\u4E3B\u5F79\u30FB\u76F8\u624B\u306E\u524D", "small", "F"], ["\u4E3B\u5F79\u30FB\u76F8\u624B\u306E\u5F8C\u308D", "from Japan", "R"], ["\u52D5\u304D\u306E\u524D", "always", "F"], ["\u52D5\u304D\u306E\u5F8C\u308D", "fast", "R"], ["\u5834\u9762", "in the park", "W"]], cap: "\u3069\u3053\u306B\u4F55\u304C\u5165\u308B\uFF1F" }),
          b("\u666E\u901A", "\u8FF7\u3063\u305F\u3089\u300C\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u305F\u3044\uFF1F\u300D\u3068\u8003\u3048\u3088\u3046\u3002\u524D\u304B\u5F8C\u308D\u304B\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u308B\u304B\u3001\u3092\u6C7A\u3081\u308B\u3060\u3051\u3060\u3088"),
          T(["S:Tom", "F:always", "V:runs"], 1, "\u3069\u3046\u3057\u3066\u308B\uFF1F", "always \u306F\u3001runs\uFF08\u3069\u3046\u3057\u3066\u308B\uFF1F\uFF09\u306E\u524D\u306B\u8DB3\u3057\u3066\u3042\u308B\u3088"),
          T(["S:Mika", "V:sings", "R:slowly"], 2, "\u3069\u3046\u3057\u3066\u308B\uFF1F", "slowly \u306F\u3001sings\uFF08\u3069\u3046\u3057\u3066\u308B\uFF1F\uFF09\u306E\u5F8C\u308D\u306B\u8DB3\u3057\u3066\u3001\u300C\u3069\u3093\u306A\u3075\u3046\u306B\u6B4C\u3046\uFF1F\u300D\u3092\u8A73\u3057\u304F\u3057\u3066\u3044\u308B\u3088"),
          T(["S:Tom", "V:likes", "F:old", "O:music"], 2, "\u76F8\u624B", "old \u306F\u3001music\uFF08\u76F8\u624B\uFF09\u306E\u524D\u306B\u8DB3\u3057\u3066\u3042\u308B\u3088"),
          T(["F:Small", "S:birds", "V:fly"], 0, "\u4E3B\u5F79", "Small \u306F\u3001birds\uFF08\u4E3B\u5F79\uFF09\u306E\u524D\u306B\u8DB3\u3057\u3066\u3042\u308B\u3088"),
          T(["S:Ken", "V:runs", "W:in the park"], 2, "\u6587\u305C\u3093\u305F\u3044", "in the park \u306F\u3001\u6587\u305C\u3093\u305F\u3044\u306E\u300C\u3069\u3053\u3067\uFF1F\u300D\u3092\u8DB3\u3057\u3066\u3044\u308B\u3088"),
          sum("\u805E\u304F\u6642\u306F\u5DE6\u304B\u3089\u53F3\u3078\u3001\u8A71\u3059\u6642\u306F\u4E2D\u5FC3\u304B\u3089\u5916\u3078\u3002\u8DB3\u3059\u306A\u3089\u3001\u524D\u304B\u5F8C\u308D\u304B\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u308B\u304B")
        ] },
        { id: "3e-2", name: "\u30DC\u30B9\uFF1A\u9577\u3044\u6587\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          b("\u559C\u3076", "\u6700\u5F8C\u306E\u30DC\u30B9\u6226\u3060\u3088\u3002\u4ECA\u307E\u3067\u306B\u899A\u3048\u305F\u30D1\u30FC\u30C4\u3092\u3001\u5168\u90E8\u4F7F\u3063\u3066\u3001\u9577\u3044\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          AX("\u79C1\u306E\u53CB\u3060\u3061\u306F\u3044\u3064\u3082\u516C\u5712\u3067\u4E0A\u624B\u306B\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:sings", "R:well|\u4E0A\u624B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B", "W:in|\u4E2D\u306B|\u3064\u306A\u304E\u8A00\u8449", "W:the park|\u305D\u306E\u516C\u5712|\u4EBA\u30FB\u7269"], [["f", 5, 6]], { small: 1, dummy: ["on"] }),
          AX("\u30DF\u30AB\u306F\u6BCE\u65E5\u53CB\u3060\u3061\u3068\u5B66\u6821\u3078\u8D70\u308B", ["S:Mika", "V:runs", "W:to|\u2192|\u3064\u306A\u304E\u8A00\u8449", "W:school|\u5B66\u6821|\u4EBA\u30FB\u7269", "W:with her friend|\u53CB\u3060\u3061\u3068|\u3060\u308C\u3068", "W:every day|\u6BCE\u65E5|\u3044\u3064"], [["f", 4], ["t", 5]], { small: 1, dummy: ["at"] }),
          AX("\u30C8\u30E0\u306F\u3068\u304D\u3069\u304D\u9759\u304B\u306B\u663C\u3054\u306F\u3093\u3092\u98DF\u3079\u308B", ["S:Tom", "F:sometimes|\u3068\u304D\u3069\u304D|\u3069\u308C\u304F\u3089\u3044", "V:eats", "O:lunch", "R:quietly|\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B"], [["a", 1]], { small: 1, dummy: ["quiet"] }),
          AX("\u5F7C\u5973\u306F\u6BCE\u65E5\u3001\u79C1\u306B\u8D64\u3044\u82B1\u3092\u304F\u308C\u308B", ["S:She", "V:gives", "I:me", "F:red|\u8D64\u3044|\u3069\u3093\u306A", "O:flowers", "W:every day|\u6BCE\u65E5|\u3044\u3064"], [["t", 5]], { small: 1, dummy: ["to"] }),
          AX("\u30C8\u30E0\u306F\u3044\u3064\u3082\u30BD\u30D5\u30A1\u306E\u4E0A\u3067\u9759\u304B\u306B\u7720\u308B", ["S:Tom", "F:always|\u3044\u3064\u3082|\u3069\u308C\u304F\u3089\u3044", "V:sleeps", "R:quietly|\u9759\u304B\u306B|\u3069\u3093\u306A\u3075\u3046\u306B", "W:on|\u30D4\u30BF\u30C3|\u3064\u306A\u304E\u8A00\u8449", "W:the sofa|\u305D\u306E\u30BD\u30D5\u30A1|\u4EBA\u30FB\u7269"], [["f", 4, 5]], { small: 1, dummy: ["in"] }),
          g("\u559C\u3076", "\u9577\u3044\u6587\u3082\u3001\u30D1\u30FC\u30C4\u306B\u5206\u3051\u308C\u3070\u4F5C\u308C\u308B\u3093\u3060\u306D\uFF01"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u305F\u3044\u304B\u3092\u8003\u3048\u3066\u3001\u524D\u304B\u5F8C\u308D\u304B\u3001\u3064\u306A\u304E\u8A00\u8449\u304C\u3044\u308B\u304B\u3092\u6C7A\u3081\u308B\u3002\u305D\u308C\u3060\u3051\u3060\u3088"),
          g("\u8003\u3048\u308B", "\u3053\u306E\u3042\u3068\u306F\u3001\u4F55\u3092\u3084\u308B\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3053\u306E\u3042\u3068\u306F\u3001\u30C1\u30E3\u30F3\u30AF\u3069\u3046\u3057\u3092\u3064\u306A\u3050\u3088\u3002and \u3084 because \u3092\u4F7F\u3063\u3066\u3001\u3082\u3063\u3068\u9577\u3044\u8A71\u306B\u3057\u3066\u3044\u304F\u3093\u3060"),
          sum("\u571F\u53F0\u306B\u3001\u3061\u3087\u3044\u8DB3\u3057\u3068\u5834\u9762\u3092\u8DB3\u3057\u3066\u3044\u3051\u3070\u3001\u9577\u3044\u6587\u3082\u4F5C\u308C\u308B")
        ] }
      ];
      const TENSE_LATER = [
        { id: "t-1", name: "\u3044\u3064\u3082\u306E\u8A71\u3068\u3001\u4ECA\u307E\u3055\u306B", coin: 5, steps: [
          g("\u8003\u3048\u308B", "\u306D\u3048\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u3063\u3066\u3001\u3044\u3064\u30821\u8A9E\u306A\u306E\uFF1F"),
          b("\u666E\u901A", "\u3044\u3044\u8CEA\u554F\u3002\u5B9F\u306F\u30012\u8A9E\u4EE5\u4E0A\u3067\u3072\u3068\u304B\u305F\u307E\u308A\u306B\u306A\u308B\u3053\u3068\u3082\u3042\u308B\u3093\u3060"),
          bd(["S:Mika", "V:sings"], { cap: "Mika sings.\u3000\u30DF\u30AB\u306F\u6B4C\u3046" }),
          b("\u666E\u901A", "Mika sings. \u3053\u308C\u306F\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u304C1\u8A9E\u3060\u306D"),
          b("\u666E\u901A", "\u65E5\u672C\u8A9E\u306F\u3001\u300C\u6B4C\u3046\u300D\u300C\u6B4C\u3063\u3066\u3044\u308B\u300D\u300C\u6B4C\u3063\u305F\u300D\u3068\u3001\u5F8C\u308D\u306E\u5F62\u3092\u5909\u3048\u3066\u3001\u6642\u3092\u4F1D\u3048\u308B\u3088\u306D"),
          g("\u8003\u3048\u308B", "\u3046\u3093\u3002\u8A9E\u5C3E\u304C\u5909\u308F\u308B\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u82F1\u8A9E\u306F\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3068\u3053\u308D\u306B\u3001\u5C0F\u3055\u3044\u8A00\u8449\u3092\u8DB3\u3057\u305F\u308A\u3001\u5F62\u3092\u5909\u3048\u305F\u308A\u3057\u3066\u3001\u6642\u3084\u6C17\u6301\u3061\u3092\u4F1D\u3048\u308B\u3093\u3060"),
          b("\u666E\u901A", "\u3053\u306E\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3072\u3068\u304B\u305F\u307E\u308A\u3092\u3001\u3053\u308C\u304B\u3089\u4F5C\u3063\u3066\u3044\u304F\u3088"),
          bd(["S:Tom", "V:runs"], { cap: "Tom runs.\u3000\u30C8\u30E0\u306F\uFF08\u3044\u3064\u3082\uFF09\u8D70\u308B" }),
          b("\u666E\u901A", "\u307E\u305A\u306F\u300C\u3044\u3064\u3082\u306E\u8A71\u300D\u3002\u3075\u3060\u3093\u304B\u3089\u305D\u3046\u3057\u3066\u3044\u308B\u3053\u3068\u3084\u3001\u304F\u308A\u8FD4\u3057\u3066\u3044\u308B\u3053\u3068\u3092\u8A00\u3046\u6642\u3060\u3088"),
          b("\u666E\u901A", "Tom runs. \u306F\u300C\u30C8\u30E0\u306F\uFF08\u3044\u3064\u3082\uFF09\u8D70\u308B\u300D\u30021-1 \u3067\u51FA\u3066\u304D\u305F\u52D5\u304D\u306E s \u3082\u3001\u3053\u306E\u300C\u3044\u3064\u3082\u306E\u8A71\u300D\u306E\u5F62\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u3072\u3068\u308A\u306E\u4EBA\u30FB\u7269\u306E\u6642\u3060\u3051\u3001s \u304C\u3064\u304F\u3093\u3060\u3063\u305F\u306D"),
          b("\u559C\u3076", "\u305D\u3046\u3002I \u3084 you \u3084 they \u306E\u6642\u306F\u3001s \u306A\u3057\u3067 run \u3060\u3088"),
          b("\u666E\u901A", "\u6B21\u306F\u300C\u4ECA\u307E\u3055\u306B\u300D\u3002\u4ECA\u3001\u3084\u3063\u3066\u3044\u308B\u6700\u4E2D\u306E\u3053\u3068\u3092\u8A00\u3046\u6642\u3060\u3088"),
          bd(["S:Mika", "V:is|\u3044\u307E|\u5408\u56F3", "V:singing|\u6B4C\u3063\u3066\u3044\u308B|\u52D5\u304D"], { grp: [1, 2], cap: "Mika is singing.\u3000\u30DF\u30AB\u306F\u4ECA\u3001\u6B4C\u3063\u3066\u3044\u308B" }),
          b("\u666E\u901A", "Mika is singing. \u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306F\u3001is \u3068 singing \u306E2\u8A9E\u3067\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u306A\u3093\u3060"),
          g("\u9A5A\u304F", "\u3055\u3063\u304D\u306E is \u306F\u300C\uFF1D\u300D\u3060\u3063\u305F\u306E\u306B\u3001\u307E\u305F\u51FA\u3066\u304D\u305F\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u3046\u3002is \u306F\u300C\uFF1D\u300D\u306E\u5408\u56F3\u3002\u300C\u30DF\u30AB \uFF1D \u6B4C\u3063\u3066\u3044\u308B\u6700\u4E2D\u300D\u3063\u3066\u3001\u4ECA\u306E\u69D8\u5B50\u3092\u8A00\u3063\u3066\u3044\u308B\u3093\u3060"),
          b("\u666E\u901A", "\u52D5\u304D\u306E\u8A00\u8449\u306E\u5F8C\u308D\u306B ing \u3092\u3064\u3051\u308B\u3068\u3001\u300C\u301C\u3057\u3066\u3044\u308B\u6700\u4E2D\u300D\u306B\u306A\u308B\u3088"),
          g("\u8003\u3048\u308B", "is \u306F\u3001\u4E3B\u5F79\u306B\u3088\u3063\u3066\u5F62\u304C\u5909\u308F\u308B\u3093\u3060\u3063\u305F\u3088\u306D\uFF1F"),
          bd(["S:They", "V:are|\u3044\u307E|\u5408\u56F3", "V:singing|\u6B4C\u3063\u3066\u3044\u308B|\u52D5\u304D"], { grp: [1, 2], cap: "They are singing.\u3000\u5F7C\u3089\u306F\u4ECA\u3001\u6B4C\u3063\u3066\u3044\u308B" }),
          b("\u666E\u901A", "\u305D\u3046\u3002I \u306A\u3089 am\u3001they \u306A\u3089 are\u30021-2 \u306E\u8868\u306E\u3068\u304A\u308A\u3060\u3088"),
          b("\u666E\u901A", "\u3069\u3053\u307E\u3067\u304C\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u304B\u8FF7\u3063\u305F\u3089\u3001\u4E3B\u5F79\u306E\u3059\u3050\u5F8C\u308D\u304B\u3089\u3001\u52D5\u304D\u306E\u8A00\u8449\u307E\u3067\u3092\u3001\u3072\u3068\u304B\u305F\u307E\u308A\u3067\u898B\u308B\u3093\u3060"),
          g("\u3072\u3089\u3081\u304F", "is singing \u306F\u3001\u4E3B\u5F79\u306E\u3059\u3050\u5F8C\u308D\u306B\u3001\u7D9A\u3044\u3066\u308B\u306D\uFF01"),
          G("Tom runs.", "\u3044\u3064\u3082\u306E\u8A71", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B"]),
          G("Mika is singing.", "\u4ECA\u307E\u3055\u306B", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B"]),
          G("Birds fly.", "\u3044\u3064\u3082\u306E\u8A71", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B"]),
          G("They are eating.", "\u4ECA\u307E\u3055\u306B", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B"]),
          B("She", "lunch every day.", ["eat", "eats"], "eats", { ctx: "\uFF08\u3075\u3060\u3093\u304B\u3089\u305D\u3046\u3057\u3066\u3044\u308B\u30FB\u3072\u3068\u308A\u306E\u4EBA\uFF09", hint: "\u3069\u3063\u3061\u304C\u5165\u308B\uFF1F", wrong: "\u3072\u3068\u308A\u306E\u4EBA\u30FB\u7269\u306E\u300C\u3044\u3064\u3082\u306E\u8A71\u300D\u306F\u3001\u52D5\u304D\u306B s \u304C\u3064\u304F\u3088" }),
          B("Tom", "a song now.", ["sings", "is singing"], "is singing", { ctx: "\uFF08\u4ECA\u307E\u3055\u306B\u6B4C\u3063\u3066\u3044\u308B\u6700\u4E2D\uFF09", hint: "\u3069\u3063\u3061\u304C\u5165\u308B\uFF1F", wrong: "\u4ECA\u3001\u3084\u3063\u3066\u3044\u308B\u6700\u4E2D\u306E\u3053\u3068\u306F\u3001is \uFF0B ing \u3060\u3088" }),
          A("\u30DF\u30AB\u306F\u4ECA\u3001\u6B4C\u3063\u3066\u3044\u308B", ["S:Mika", "V:is|\u3044\u307E|\u5408\u56F3", "V:singing|\u6B4C\u3063\u3066\u3044\u308B|\u52D5\u304D"]),
          A("\u5F7C\u3089\u306F\u4ECA\u3001\u98DF\u3079\u3066\u3044\u308B", ["S:They", "V:are|\u3044\u307E|\u5408\u56F3", "V:eating|\u98DF\u3079\u3066\u3044\u308B|\u52D5\u304D"]),
          A("\u30C8\u30E0\u306F\u6BCE\u65E5\u8D70\u308B", ["S:Tom", "V:runs", "W:every day|\u6BCE\u65E5|\u3044\u3064"]),
          D("\u30B1\u30F3\u306F\u4ECA\u3001\u8AAD\u3093\u3067\u3044\u308B", ["S:Ken", "V:is|\u3044\u307E|\u5408\u56F3", "V:\u8AAD\u3093\u3067\u3044\u308B|\u8AAD\u3093\u3067\u3044\u308B|\u52D5\u304D"], { en: "Ken is reading.", words: [["\u8AAD\u3093\u3067\u3044\u308B", "reading"]] }),
          sum("\u3044\u3064\u3082\u306E\u8A71 \uFF1D \u3072\u3068\u308A\u306E\u6642\u306F s \uFF0F \u4ECA\u307E\u3055\u306B \uFF1D is\uFF08am\u30FBare\uFF09\uFF0B ing")
        ] },
        { id: "t-2", name: "\u3082\u3046\u7D42\u308F\u3063\u305F\u3053\u3068", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u300C\u3082\u3046\u7D42\u308F\u3063\u305F\u3053\u3068\u300D\u3002\u904E\u304E\u305F\u3053\u3068\u3092\u8A00\u3046\u6642\u3060\u3088"),
          bd(["S:Mika", "V:sang|\u6B4C\u3063\u305F|\u7D42\u308F\u3063\u305F"], { cap: "Mika sang.\u3000\u30DF\u30AB\u306F\u6B4C\u3063\u305F" }),
          b("\u666E\u901A", "Mika sang. \u300C\u30DF\u30AB\u306F\u6B4C\u3063\u305F\u300D\u3002sings \u304C\u3001sang \u306B\u5F62\u3092\u5909\u3048\u305F\u3088"),
          g("\u8003\u3048\u308B", "is \u307F\u305F\u3044\u306A\u5C0F\u3055\u3044\u8A00\u8449\u306F\u3001\u3064\u3051\u306A\u3044\u306E\uFF1F"),
          b("\u3072\u3089\u3081\u304F", "\u3064\u3051\u306A\u3044\u3088\u3002\u300C\u3082\u3046\u7D42\u308F\u3063\u305F\u300D\u306F\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E1\u8A9E\u306E\u5F62\u304C\u5909\u308F\u308B\u3060\u3051\u306A\u3093\u3060"),
          bd(["S:Ken", "V:played|\u904A\u3093\u3060|\u7D42\u308F\u3063\u305F", "O:tennis"], { arrow: "out", cap: "Ken played tennis.\u3000\u30B1\u30F3\u306F\u30C6\u30CB\u30B9\u3092\u3057\u305F" }),
          b("\u666E\u901A", "\u591A\u304F\u306E\u52D5\u304D\u306F\u3001\u6700\u5F8C\u306B ed \u3092\u3064\u3051\u308B\u3060\u3051\u3002play \u306F played\u3001walk \u306F walked \u3060\u3088"),
          g("\u8003\u3048\u308B", "\u5F62\u304C\u5909\u308F\u308B\u8A00\u8449\u306F\u3001\u307B\u304B\u306B\u3082\u3042\u308B\u306E\uFF1F"),
          b("\u666E\u901A", "\u3042\u308B\u3088\u3002sing \u306F sang\u3001eat \u306F ate\u3001run \u306F ran\u3002\u5F62\u304C\u5909\u308F\u308B\u3082\u306E\u306F\u3001\u5C11\u3057\u305A\u3064\u899A\u3048\u3088\u3046\u306D"),
          g("\u7126\u308B", "\u899A\u3048\u3089\u308C\u308B\u304B\u306A\u2026\u2026"),
          b("\u559C\u3076", "\u4ECA\u306F\u9593\u9055\u3048\u3066\u3082\u3044\u3044\u3088\u3002\u9806\u756A\u304C\u5408\u3063\u3066\u3044\u308C\u3070\u3001\u8A71\u306F\u901A\u3058\u308B\u304B\u3089\u306D"),
          b("\u666E\u901A", "\u7D42\u308F\u3063\u305F\u3053\u3068\u306E\u8A71\u3067\u306F\u3001\u300C\u3044\u3064\u300D\u3092\u8DB3\u3057\u305F\u5834\u9762\u3082\u3001\u3088\u304F\u4F7F\u3046\u3088\u3002yesterday\uFF08\u6628\u65E5\uFF09\u3068\u304B\u306D"),
          bd(["S:Mika", "V:sang|\u6B4C\u3063\u305F|\u7D42\u308F\u3063\u305F", "W:yesterday|\u6628\u65E5|\u3044\u3064"], { cap: "Mika sang yesterday.\u3000\u30DF\u30AB\u306F\u6628\u65E5\u6B4C\u3063\u305F" }),
          g("\u3072\u3089\u3081\u304F", "\u5834\u9762\u306F\u3001\u5F8C\u308D\u306B\u8DB3\u3059\u3093\u3060\u306D"),
          G("Mika sang.", "\u3082\u3046\u7D42\u308F\u3063\u305F", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B", "\u3082\u3046\u7D42\u308F\u3063\u305F"]),
          G("Tom runs.", "\u3044\u3064\u3082\u306E\u8A71", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B", "\u3082\u3046\u7D42\u308F\u3063\u305F"]),
          G("Ken played tennis.", "\u3082\u3046\u7D42\u308F\u3063\u305F", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B", "\u3082\u3046\u7D42\u308F\u3063\u305F"]),
          G("They are eating.", "\u4ECA\u307E\u3055\u306B", ["\u3044\u3064\u3082\u306E\u8A71", "\u4ECA\u307E\u3055\u306B", "\u3082\u3046\u7D42\u308F\u3063\u305F"]),
          B("Ken", "tennis yesterday.", ["plays", "played", "is playing"], "played", { ctx: "\uFF08\u6628\u65E5\u306E\u3001\u3082\u3046\u7D42\u308F\u3063\u305F\u8A71\uFF09", hint: "\u3069\u308C\u304C\u5165\u308B\uFF1F", wrong: "\u7D42\u308F\u3063\u305F\u3053\u3068\u306F\u3001\u52D5\u304D\u306E\u5F62\u304C\u5909\u308F\u308B\u3088\uFF08play \u2192 played\uFF09" }),
          B("Mika", "a song now.", ["sang", "is singing"], "is singing", { ctx: "\uFF08\u4ECA\u307E\u3055\u306B\u6B4C\u3063\u3066\u3044\u308B\u6700\u4E2D\uFF09", hint: "\u3069\u3063\u3061\u304C\u5165\u308B\uFF1F", wrong: "\u4ECA\u3001\u3084\u3063\u3066\u3044\u308B\u6700\u4E2D\u306E\u3053\u3068\u306F\u3001is \uFF0B ing \u3060\u3088" }),
          A("\u30B1\u30F3\u306F\u30C6\u30CB\u30B9\u3092\u3057\u305F", ["S:Ken", "V:played|\u904A\u3093\u3060|\u7D42\u308F\u3063\u305F", "O:tennis"]),
          A("\u30DF\u30AB\u306F\u6628\u65E5\u6B4C\u3063\u305F", ["S:Mika", "V:sang|\u6B4C\u3063\u305F|\u7D42\u308F\u3063\u305F", "W:yesterday|\u6628\u65E5|\u3044\u3064"], { alt: [{ o: [2, 0, 1], t: ["Yesterday,", "Mika", "sang"] }] }),
          D("\u30C8\u30E0\u306F\u6628\u65E5\u8D70\u3063\u305F", ["S:Tom", "V:\u8D70\u3063\u305F|\u8D70\u3063\u305F|\u7D42\u308F\u3063\u305F", "W:yesterday|\u6628\u65E5|\u3044\u3064"], { en: "Tom ran yesterday.", words: [["\u8D70\u3063\u305F", "ran"]], alt: [{ o: [2, 0, 1], t: ["Yesterday,", "Tom", "ran"] }] }),
          sum("\u3082\u3046\u7D42\u308F\u3063\u305F \uFF1D \u52D5\u304D\u306E\u5F62\u304C\u5909\u308F\u308B\uFF08ed \u306A\u3069\uFF09")
        ] },
        { id: "t-3", name: "\u4ECA\u306B\u3064\u306A\u304C\u308B", coin: 5, steps: [
          b("\u666E\u901A", "\u6B21\u306F\u300C\u4ECA\u306B\u3064\u306A\u304C\u308B\u300D\u3002\u904E\u53BB\u306B\u3057\u305F\u3053\u3068\u304C\u3001\u4ECA\u3082\u6B8B\u3063\u3066\u3044\u308B\u6642\u306B\u4F7F\u3046\u3088"),
          bd(["S:I", "V:cleaned|\u6383\u9664\u3057\u305F|\u7D42\u308F\u3063\u305F", "O:my room|\u79C1\u306E\u90E8\u5C4B\u3092"], { arrow: "out", cap: "I cleaned my room.\u3000\u90E8\u5C4B\u3092\u6383\u9664\u3057\u305F" }),
          b("\u666E\u901A", "I cleaned my room. \u300C\u90E8\u5C4B\u3092\u6383\u9664\u3057\u305F\u300D\u3002\u3053\u308C\u306F\u3001\u6383\u9664\u3057\u305F\u6642\u306E\u8A71\u3060\u3051\u3060\u306D"),
          bd(["S:I", "V:have|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:cleaned|\u6383\u9664\u3057\u305F|\u52D5\u304D", "O:my room|\u79C1\u306E\u90E8\u5C4B\u3092"], { grp: [1, 2], cap: "I have cleaned my room.\u3000\u90E8\u5C4B\u3092\u6383\u9664\u3057\u305F\uFF08\u4ECA\u3082\u304D\u308C\u3044\uFF09" }),
          b("\u3072\u3089\u3081\u304F", "I have cleaned my room. \u300C\u6383\u9664\u3057\u305F\u300D\u3053\u3068\u304C\u3001\u4ECA\u306E\u304D\u308C\u3044\u306A\u90E8\u5C4B\u306B\u3064\u306A\u304C\u3063\u3066\u3044\u308B\u3093\u3060"),
          g("\u8003\u3048\u308B", "have \u3063\u3066\u3001\u300C\u6301\u3063\u3066\u3044\u308B\u300D\u3060\u3088\u306D\uFF1F"),
          b("\u666E\u901A", "\u305D\u3046\u3002\u300C\u6383\u9664\u3057\u305F\u3001\u3068\u3044\u3046\u7D50\u679C\u3092\u3001\u4ECA\u6301\u3063\u3066\u3044\u308B\u300D\u3068\u8003\u3048\u308B\u3068\u5206\u304B\u308A\u3084\u3059\u3044\u3088"),
          bd(["S:She", "V:has|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:cleaned|\u6383\u9664\u3057\u305F|\u52D5\u304D", "O:her room|\u5F7C\u5973\u306E\u90E8\u5C4B\u3092"], { grp: [1, 2], cap: "She has cleaned her room." }),
          b("\u666E\u901A", "\u3072\u3068\u308A\u306E\u4EBA\u30FB\u7269\u306E\u6642\u306F\u3001have \u304C has \u306B\u5909\u308F\u308B\u3088\u3002\u3053\u3053\u306F\u3001\u3044\u3064\u3082\u306E\u8A71\u306E s \u3068\u540C\u3058\u8003\u3048\u65B9\u3060\u306D"),
          b("\u666E\u901A", "\u3082\u3046\u3072\u3068\u3064\u306E\u4F7F\u3044\u65B9\u304C\u3001\u300C\u301C\u3057\u305F\u3053\u3068\u304C\u3042\u308B\u300D\u3002\u4ECA\u307E\u3067\u306E\u7D4C\u9A13\u3092\u8A00\u3046\u6642\u3060\u3088"),
          bd(["S:She", "V:has|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:visited|\u8A2A\u308C\u305F|\u52D5\u304D", "O:Osaka"], { grp: [1, 2], cap: "She has visited Osaka.\u3000\u5F7C\u5973\u306F\u5927\u962A\u306B\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B" }),
          g("\u9A5A\u304F", "\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B\u3001\u3068\u3044\u3046\u7D4C\u9A13\u3092\u3001\u4ECA\u306E\u5F7C\u5973\u304C\u6301\u3063\u3066\u3044\u308B\u306E\u306D\uFF01"),
          b("\u559C\u3076", "\u305D\u306E\u901A\u308A\u3002\u5F62\u306F\u300Chave \uFF0B \u301C\u3057\u305F\u5F62\u300D\u3002\u301C\u3057\u305F\u5F62\u306F\u3001\u904E\u53BB\u3068\u540C\u3058\u5F62\u306E\u3053\u3068\u304C\u591A\u3044\u3088"),
          g("\u8003\u3048\u308B", "\u540C\u3058\u3058\u3083\u306A\u3044\u8A00\u8449\u3082\u3001\u3042\u308B\u306E\uFF1F"),
          b("\u666E\u901A", "\u3042\u308B\u3088\u3002eat \u306F ate \u3058\u3083\u306A\u304F\u3066 eaten\u3001\u306E\u3088\u3046\u306B\u306D\u3002\u3053\u3053\u3082\u3001\u5C11\u3057\u305A\u3064\u899A\u3048\u308C\u3070\u5927\u4E08\u592B"),
          G("I cleaned my room.", "\u3082\u3046\u7D42\u308F\u3063\u305F", ["\u3082\u3046\u7D42\u308F\u3063\u305F", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u4ECA\u307E\u3055\u306B"]),
          G("I have cleaned my room.", "\u4ECA\u306B\u3064\u306A\u304C\u308B", ["\u3082\u3046\u7D42\u308F\u3063\u305F", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u4ECA\u307E\u3055\u306B"]),
          G("She has visited Osaka.", "\u4ECA\u306B\u3064\u306A\u304C\u308B", ["\u3082\u3046\u7D42\u308F\u3063\u305F", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u4ECA\u307E\u3055\u306B"]),
          G("Mika is singing.", "\u4ECA\u307E\u3055\u306B", ["\u3082\u3046\u7D42\u308F\u3063\u305F", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u4ECA\u307E\u3055\u306B"]),
          B("She", "visited Osaka.", ["has", "have", "is"], "has", { ctx: "\uFF08\u5927\u962A\u306B\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B\u30FB\u3072\u3068\u308A\u306E\u4EBA\uFF09", hint: "\u3069\u308C\u304C\u5165\u308B\uFF1F", wrong: "\u3072\u3068\u308A\u306E\u4EBA\u30FB\u7269\u306E\u3068\u304D\u306F has \u3060\u3088" }),
          B("I", "cleaned my room.", ["have", "has", "am"], "have", { ctx: "\uFF08\u6383\u9664\u3057\u305F\u3002\u4ECA\u3082\u304D\u308C\u3044\uFF09", hint: "\u3069\u308C\u304C\u5165\u308B\uFF1F", wrong: "I \u306E\u3068\u304D\u306F have \u3060\u3088" }),
          A("\u79C1\u306F\u90E8\u5C4B\u3092\u6383\u9664\u3057\u305F\uFF08\u4ECA\u3082\u304D\u308C\u3044\uFF09", ["S:I", "V:have|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:cleaned|\u6383\u9664\u3057\u305F|\u52D5\u304D", "O:my room|\u79C1\u306E\u90E8\u5C4B\u3092"]),
          A("\u5F7C\u5973\u306F\u5927\u962A\u306B\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B", ["S:She", "V:has|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:visited|\u8A2A\u308C\u305F|\u52D5\u304D", "O:Osaka"]),
          D("\u79C1\u306F\u5927\u962A\u306B\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B", ["S:I", "V:have|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:\u8A2A\u308C\u305F|\u8A2A\u308C\u305F|\u52D5\u304D", "O:Osaka"], { en: "I have visited Osaka.", words: [["\u8A2A\u308C\u305F", "visited"]] }),
          sum("\u4ECA\u306B\u3064\u306A\u304C\u308B \uFF1D have\uFF08has\uFF09\uFF0B \u301C\u3057\u305F\u5F62")
        ] },
        { id: "t-4", name: "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B", coin: 5, steps: [
          b("\u666E\u901A", "\u6700\u5F8C\u306F\u300C\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B\u300D\u3002\u3067\u304D\u308B\u3001\u3059\u308B\u3064\u3082\u308A\u3001\u304B\u3082\u3057\u308C\u306A\u3044\u3001\u307F\u305F\u3044\u306A\u6C17\u6301\u3061\u3092\u8DB3\u3059\u6642\u3060\u3088"),
          bd(["S:She", "V:can|\u3067\u304D\u308B|\u6C17\u6301\u3061", "V:sing|\u6B4C\u3046|\u52D5\u304D"], { grp: [1, 2], cap: "She can sing.\u3000\u5F7C\u5973\u306F\u6B4C\u3048\u308B" }),
          b("\u666E\u901A", "She can sing. \u300C\u5F7C\u5973\u306F\u6B4C\u3048\u308B\u300D\u3002can \u304C\u3001\u300C\u3067\u304D\u308B\u300D\u3068\u3044\u3046\u6C17\u6301\u3061\u3092\u4E57\u305B\u3066\u3044\u308B\u3088"),
          g("\u8003\u3048\u308B", "\u3042\u308C\uFF1F sing \u306B s \u304C\u3064\u3044\u3066\u306A\u3044\uFF01"),
          b("\u3072\u3089\u3081\u304F", "\u6C17\u6301\u3061\u306E\u8A00\u8449\u306E\u3042\u3068\u306F\u3001\u52D5\u304D\u306F\u5143\u306E\u5F62\u306E\u307E\u307E\u306A\u3093\u3060\u3002s \u3082 ed \u3082 ing \u3082\u3001\u3064\u3051\u306A\u3044\u3088"),
          b("\u666E\u901A", "\u6C17\u6301\u3061\u306E\u8A00\u8449\u306F\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3072\u3068\u304B\u305F\u307E\u308A\u306E\u3001\u4E00\u756A\u524D\u306B\u7F6E\u304F\u3093\u3060"),
          bd(["S:Tom", "V:will|\u3059\u308B\u3064\u3082\u308A|\u6C17\u6301\u3061", "V:run|\u8D70\u308B|\u52D5\u304D"], { grp: [1, 2], cap: "Tom will run.\u3000\u30C8\u30E0\u306F\u8D70\u308B\u3064\u3082\u308A\u3060" }),
          b("\u666E\u901A", "will \u306F\u300C\u3059\u308B\u3064\u3082\u308A\u300D\u3002\u3053\u308C\u304B\u3089\u5148\u306E\u3053\u3068\u3092\u3001\u6C17\u6301\u3061\u3068\u3044\u3063\u3057\u3087\u306B\u8A00\u3046\u3093\u3060"),
          bd(["S:Mika", "V:might|\u304B\u3082\u3057\u308C\u306A\u3044|\u6C17\u6301\u3061", "V:sing|\u6B4C\u3046|\u52D5\u304D"], { grp: [1, 2], cap: "Mika might sing.\u3000\u30DF\u30AB\u306F\u6B4C\u3046\u304B\u3082\u3057\u308C\u306A\u3044" }),
          b("\u666E\u901A", "might \u306F\u300C\u304B\u3082\u3057\u308C\u306A\u3044\u300D\u3002\u6C17\u6301\u3061\u304C\u9055\u3046\u3068\u3001\u8A00\u8449\u3082\u5909\u308F\u308B\u3088"),
          bd([], { table: [["\u3067\u304D\u308B", "can"], ["\u3059\u308B\u3064\u3082\u308A", "will"], ["\u304B\u3082\u3057\u308C\u306A\u3044", "might"]], cap: "\u6C17\u6301\u3061 \u2192 \u8A00\u8449" }),
          g("\u8003\u3048\u308B", "\u6C17\u6301\u3061\u306E\u8A00\u8449\u306F\u3001\u3053\u306E3\u3064\uFF1F"),
          b("\u666E\u901A", "\u307E\u305A\u306F\u3001\u3053\u306E3\u3064\u3067\u5927\u4E08\u592B\u3002\u307B\u304B\u306B\u3082\u3042\u308B\u3051\u3069\u3001\u8003\u3048\u65B9\u306F\u540C\u3058\u3060\u3088"),
          G("She can sing.", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B", ["\u4ECA\u307E\u3055\u306B", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B"]),
          G("Tom will run.", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B", ["\u4ECA\u307E\u3055\u306B", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B"]),
          G("She has visited Osaka.", "\u4ECA\u306B\u3064\u306A\u304C\u308B", ["\u4ECA\u307E\u3055\u306B", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B"]),
          G("Mika is singing.", "\u4ECA\u307E\u3055\u306B", ["\u4ECA\u307E\u3055\u306B", "\u4ECA\u306B\u3064\u306A\u304C\u308B", "\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B"]),
          B("She can", "well.", ["sing", "sings", "singing"], "sing", { ctx: "\uFF08\u4E0A\u624B\u306B\u6B4C\u3048\u308B\uFF09", hint: "\u3069\u308C\u304C\u5165\u308B\uFF1F", wrong: "\u6C17\u6301\u3061\u306E\u8A00\u8449\u306E\u3042\u3068\u306F\u3001\u52D5\u304D\u306F\u5143\u306E\u5F62\u3060\u3088" }),
          B("Tom will", "tomorrow.", ["run", "runs", "ran"], "run", { ctx: "\uFF08\u660E\u65E5\u3001\u8D70\u308B\u3064\u3082\u308A\uFF09", hint: "\u3069\u308C\u304C\u5165\u308B\uFF1F", wrong: "\u6C17\u6301\u3061\u306E\u8A00\u8449\u306E\u3042\u3068\u306F\u3001\u52D5\u304D\u306F\u5143\u306E\u5F62\u3060\u3088" }),
          A("\u5F7C\u5973\u306F\u6B4C\u3048\u308B", ["S:She", "V:can|\u3067\u304D\u308B|\u6C17\u6301\u3061", "V:sing|\u6B4C\u3046|\u52D5\u304D"]),
          A("\u30C8\u30E0\u306F\u8D70\u308B\u3064\u3082\u308A\u3060", ["S:Tom", "V:will|\u3059\u308B\u3064\u3082\u308A|\u6C17\u6301\u3061", "V:run|\u8D70\u308B|\u52D5\u304D"]),
          A("\u30DF\u30AB\u306F\u6B4C\u3046\u304B\u3082\u3057\u308C\u306A\u3044", ["S:Mika", "V:might|\u304B\u3082\u3057\u308C\u306A\u3044|\u6C17\u6301\u3061", "V:sing|\u6B4C\u3046|\u52D5\u304D"]),
          D("\u30B1\u30F3\u306F\u6CF3\u3052\u308B", ["S:Ken", "V:can|\u3067\u304D\u308B|\u6C17\u6301\u3061", "V:\u6CF3\u3050|\u6CF3\u3050|\u52D5\u304D"], { en: "Ken can swim.", words: [["\u6CF3\u3050", "swim"]] }),
          sum("\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B \uFF1D can\u30FBwill\u30FBmight \uFF0B \u52D5\u304D\u306E\u5143\u306E\u5F62")
        ] },
        { id: "t-5", name: "\u30DC\u30B9\uFF1A\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF\u3092\u4F5C\u308D\u3046", coin: 20, boss: true, steps: [
          bd([], { table: [["\u3044\u3064\u3082\u306E\u8A71", "plays"], ["\u4ECA\u307E\u3055\u306B", "is playing"], ["\u3082\u3046\u7D42\u308F\u3063\u305F", "played"], ["\u4ECA\u306B\u3064\u306A\u304C\u308B", "has played"], ["\u6C17\u6301\u3061\u3092\u4E57\u305B\u308B", "can play"]], cap: "play \u3092\u4F7F\u3046\u3068" }),
          b("\u559C\u3076", "\u3058\u3083\u3042\u6700\u5F8C\u306B\u3001\u65E5\u672C\u8A9E\u3092\u898B\u3066\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3072\u3068\u304B\u305F\u307E\u308A\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046"),
          g("\u3072\u3089\u3081\u304F", "\u3044\u3064\u3082\u306E\u8A71\u304B\u3001\u4ECA\u307E\u3055\u306B\u304B\u3001\u7D42\u308F\u3063\u305F\u304B\u3001\u4ECA\u306B\u3064\u306A\u304C\u308B\u304B\u3001\u6C17\u6301\u3061\u304B\u3001\u8003\u3048\u308B\u3093\u3060\u306D"),
          { k: "notice", t: "\u3053\u3053\u304B\u3089\u30DC\u30B9\u6226\uFF01\n\u30AB\u30FC\u30C9\u306E\u4E2D\u306B\u3001\u4F7F\u308F\u306A\u3044\u8A00\u8449\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088\u3002\n\u3044\u3089\u306A\u3044\u30AB\u30FC\u30C9\u306F\u3001\u4F7F\u308F\u305A\u306B\u6B8B\u3057\u3066\u304A\u3053\u3046\u3002" },
          A("\u30B1\u30F3\u306F\u4ECA\u3001\u30C6\u30CB\u30B9\u3092\u3057\u3066\u3044\u308B", ["S:Ken", "V:is|\u3044\u307E|\u5408\u56F3", "V:playing|\u3057\u3066\u3044\u308B|\u52D5\u304D", "O:tennis"], { dummy: ["plays"] }),
          A("\u30DF\u30AB\u306F\u6628\u65E5\u6B4C\u3063\u305F", ["S:Mika", "V:sang|\u6B4C\u3063\u305F|\u7D42\u308F\u3063\u305F", "W:yesterday|\u6628\u65E5|\u3044\u3064"], { dummy: ["is"], alt: [{ o: [2, 0, 1], t: ["Yesterday,", "Mika", "sang"] }] }),
          A("\u5F7C\u5973\u306F\u5927\u962A\u306B\u884C\u3063\u305F\u3053\u3068\u304C\u3042\u308B", ["S:She", "V:has|\u6301\u3063\u3066\u3044\u308B|\u5408\u56F3", "V:visited|\u8A2A\u308C\u305F|\u52D5\u304D", "O:Osaka"], { dummy: ["have"] }),
          A("\u30C8\u30E0\u306F\u8D70\u308B\u3064\u3082\u308A\u3060", ["S:Tom", "V:will|\u3059\u308B\u3064\u3082\u308A|\u6C17\u6301\u3061", "V:run|\u8D70\u308B|\u52D5\u304D"], { dummy: ["runs"] }),
          A("\u79C1\u306E\u53CB\u3060\u3061\u306F\u6BCE\u65E5\u6B4C\u3046", ["F:My|\u79C1\u306E|\u3060\u308C\u306E", "S:friend", "V:sings", "W:every day|\u6BCE\u65E5|\u3044\u3064"], { dummy: ["is"], alt: [{ o: [3, 0, 1, 2], t: ["Every day,", "my", "friend", "sings"] }] }),
          g("\u559C\u3076", "\u3067\u304D\u305F\uFF01 \u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3072\u3068\u304B\u305F\u307E\u308A\u306E\u4E2D\u8EAB\u304C\u3001\u5206\u304B\u3063\u3066\u304D\u305F\uFF01"),
          b("\u666E\u901A", "\u6642\u3082\u3001\u6C17\u6301\u3061\u3082\u3001\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u306E\u3068\u3053\u308D\u3067\u4F1D\u3048\u308B\u3002\u305D\u308C\u304C\u3001\u82F1\u8A9E\u306E\u4F5C\u308A\u65B9\u306A\u3093\u3060"),
          g("\u8003\u3048\u308B", "\u306D\u3048\u3001\u5834\u9762\u306E\u307B\u3046\u306F\uFF1F in \u3084 at \u307F\u305F\u3044\u306A\u306E\u304C\u3001\u307E\u3060\u6B8B\u3063\u3066\u308B\u3088\u306D"),
          b("\u3072\u3089\u3081\u304F", "\u305D\u308C\u306F\u6B21\u306E 3c\u3002\u5834\u9762\u30C1\u30E3\u30F3\u30AF\u306E\u4E2D\u8EAB\u3092\u4F5C\u3063\u3066\u3044\u304F\u3088"),
          sum("\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D\u30C1\u30E3\u30F3\u30AF \uFF1D \u6642\u3084\u6C17\u6301\u3061\u3092\u3001\u3053\u3053\u3067\u4F1D\u3048\u308B")
        ] }
      ];
      LESSONS3.forEach((l) => l.nums = true);
      const ALL = LESSONS.concat(LESSONS2, LESSONS3);
      const CHAPTERS = [
        { n: 1, name: "\u571F\u53F0\u3092\u3064\u304F\u308B", sub: "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u3069\u3053\u306B\u5411\u304F\uFF1F", lessons: LESSONS, coin: 30, title: "\u571F\u53F0\u30D3\u30EB\u30C0\u30FC", frame: "\u571F\u53F0" },
        { n: 2, name: "\u571F\u53F0\u3092\u81A8\u3089\u307E\u305B\u308B", sub: "\u524D\u3061\u3087\u3044\u8DB3\u3057 \uFF0B \u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E \uFF0B \u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057", lessons: LESSONS2, coin: 30, title: "\u3061\u3087\u3044\u8DB3\u3057\u540D\u4EBA", frame: "\u3061\u3087\u3044\u8DB3\u3057" },
        { n: 3, name: "\u30C1\u30E3\u30F3\u30AF\u306E\u4E2D\u8EAB\u3092\u3064\u304F\u308B", sub: "3a \u3064\u306A\u304E\u8A00\u8449 \u2192 3b \u5834\u9762 \u2192 3c \u52D5\u304D \u2192 3d \u4EBA\u30FB\u7269 \u2192 3e \u3075\u308A\u304B\u3048\u308A", lessons: LESSONS3, coin: 30, title: "\u30C1\u30E3\u30F3\u30AF\u8077\u4EBA", frame: "\u30C1\u30E3\u30F3\u30AF" },
        { n: 4, name: "\u30C1\u30E3\u30F3\u30AF\u3092\u3064\u306A\u3050", sub: "and / because / \u8AAC\u660E\u3092\u30DA\u30BF\u30C3\u3068\u8CBC\u308B" },
        { n: 5, name: "\u5B9F\u969B\u306B\u4F7F\u3046", sub: "\u8A71\u3059\u30FB\u66F8\u304F" }
      ];
      function load2() {
        try {
          let x = HOST.store.get("make");
          if (x == null) {
            try {
              x = JSON.parse(localStorage.getItem(KEY) || "{}");
            } catch (e) {
              x = {};
            }
          }
          x = x || {};
          const o = { done: x.done || {}, ch: x.ch || {}, titles: x.titles || [], v: 4 };
          if (!x.v) {
            delete o.done["1-4"];
            delete o.done["1-5"];
            o.ch = {};
          }
          if (x.v === 3) {
            const M = { "2-4": "2-1", "2-1": "2-2", "2-2": "2-3", "2-3": "2-4", "3c": "3a", "3d": "3b", "3b": "3c", "3a": "3d" }, d = {};
            Object.keys(o.done).forEach((k) => {
              const m = k.match(/^(2-\d|3[a-e])(.*)$/);
              if (!m || !M[m[1]]) {
                d[k] = 1;
                return;
              }
              d[M[m[1]] + m[2]] = 1;
            });
            o.done = d;
            if (o.ch[2] && !LESSONS2.every((l) => d[l.id])) delete o.ch[2];
            delete o.ch[3];
          } else if (x.v !== 4) {
            Object.keys(o.done).forEach((k) => {
              if (/^3/.test(k)) delete o.done[k];
            });
            delete o.ch[3];
          }
          return o;
        } catch (e) {
          return { done: {}, ch: {}, titles: [], v: 4 };
        }
      }
      function save() {
        try {
          HOST.store.set("make", st);
        } catch (e) {
        }
      }
      let st = load2();
      const css = document.createElement("style");
      css.textContent = `.mkApp{--jp:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif;--en:"Lexend","Segoe UI",system-ui,sans-serif;--cS:#7cc4ff;--cV:#ff8f8f;--cO:#8ee6a8;--cI:#6fe0d8;--cC:#ffb870;--cP:#d6a8ff;--cT:#ffd166;--cM:#e6ecf5;--cX:#9fb0c6}

.mkApp{position:fixed;inset:0;z-index:75;background:linear-gradient(180deg,#d4efff 0%,#eef7ff 45%,#ffeef8 100%);color:#27344f;display:flex;flex-direction:column;font-family:var(--jp);overflow:hidden}
.mkApp{--cF:#b184f0;--cR:#d98be0;--cW:#f0b43c}
.mkApp[hidden]{display:none!important}
.mkTop{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 6px;flex:none}
.mkTop button{border:0;background:rgba(255,255,255,.85);border-radius:12px;padding:8px 12px;font:800 14px var(--jp);color:#27344f;box-shadow:0 1px 4px rgba(60,90,140,.2)}
.mkTtl{flex:1;font-weight:800;font-size:14px;text-align:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkPg{font-size:12px;color:#5b6d8c;min-width:44px;text-align:right}
.mkBar{height:5px;background:rgba(255,255,255,.7);margin:0 12px;border-radius:3px;overflow:hidden;flex:none}
.mkBar i{display:block;height:100%;background:linear-gradient(90deg,#7cc4ff,#ff8fc4);width:0;transition:width .3s}
.mkBoard{flex:none;height:190px;box-sizing:border-box;overflow:visible;margin:8px 12px 0;padding:12px 8px 8px;background:rgba(255,255,255,.88);border-radius:18px;box-shadow:0 2px 10px rgba(60,90,140,.15);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.mkRow{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;position:relative}
.mkRow.ar{padding-bottom:46px}
.mkRow.ar2{padding-bottom:66px}
.mkRow.mini.ar2{padding-bottom:46px}
.mkRow.sm .mkChip{font-size:16px;padding:6px 9px}
.mkRow.xs{flex-wrap:nowrap;gap:6px}
.mkRow.xs .mkChip{font-size:13px;padding:6px 7px;white-space:nowrap}
.mkRow.mini .mkChip{font-size:13px;padding:3px 7px;border-width:2px;border-radius:9px}
.mkRow.mini.ar{padding-bottom:34px}
.mkRow svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.mkTypes{display:flex;flex-direction:column;gap:0;width:100%;padding:26px 0 0 6px;box-sizing:border-box}
.mkTR{display:flex;flex-direction:column;align-items:flex-start;gap:0;margin-top:2px}
.mkTR .nm{font:800 12px var(--jp);color:#4a5b7a;padding-left:4px}
.mkTR .mkRow{width:100%;justify-content:flex-start;flex-wrap:nowrap;gap:5px}
.mkTR .mkRow .mkChip{font-size:12px;padding:2px 6px;white-space:nowrap}
.mkTR .mkRow.mini.ar{padding-bottom:24px}
.mkTR .mkRow.mini.ar2{padding-bottom:34px}
.mkTbl{display:flex;flex-direction:column;gap:3px;width:100%;max-width:330px}
.mkTbl div{display:flex;align-items:center;gap:8px;font:800 14px var(--jp)}
.mkTbl .l{flex:1;text-align:right;color:color-mix(in srgb,var(--rc,#4a5b7a) 72%,#000)}
.mkTbl .mkChip{font-size:15px;padding:1px 9px;border-width:2px}
.mkChip{padding:8px 13px;border-radius:12px;font:800 20px var(--en);background:#fff;border:3px solid var(--rc,#9fb0c6);color:#27344f;position:relative}
.mkChip.jp{font-family:var(--jp);border-style:dashed}
.mkChip small{display:block;font:700 10px var(--jp);color:#5b6d8c;margin-top:1px;line-height:1.25}
.mkChip .gmT{position:absolute;top:-7px;right:5px;font:700 8px var(--jp);font-style:normal;color:#8b97ad;background:#fff;padding:0 3px;border-radius:5px;line-height:1.3;letter-spacing:0;pointer-events:none}
body.nogram .gmT{display:none}
.mkChip .mnT{display:block;font:700 9px var(--jp);font-style:normal;color:#6b7b97;line-height:1.2;margin:0 0 1px;letter-spacing:0}
.mkChip small .ct{display:block;font-weight:800;color:color-mix(in srgb,var(--rc,#5b6d8c) 72%,#000)}
.mkChip.Q{animation:mkBlink 1s infinite;border-style:dotted;color:#e4546a}
.mkChip .crown{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:18px}
.mkChip.eq{background:#fff4c8}
.mkChip.in{animation:mkPop .35s}
@keyframes mkPop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes mkBlink{50%{opacity:.35}}
.mkCap{font-size:13px;color:#4a5b7a;text-align:center;line-height:1.5;white-space:pre-line}
.mkMark{font:800 26px var(--en);color:#3bb273;margin-left:2px;align-self:center}
.mkMark.ng{color:#e4546a}
.mkGrp{display:inline-flex;gap:6px;padding:5px 6px;border:2px dashed #b99af0;border-radius:16px;background:rgba(177,132,245,.10)}
.mkRow.sm .mkGrp{gap:5px;padding:3px 4px;border-radius:13px}
.mkChip{transition:opacity .2s,transform .2s}
.mkNest{display:inline-flex;gap:6px;align-items:center;padding:5px 6px;border:2px dashed #b99af0;border-radius:18px;background:rgba(177,132,245,.07)}
.grown.go .mkNest{animation:mkFr .5s both;animation-delay:var(--d)}
.grown.go .mkChip.g0{animation:mkPop .5s both}
.grown.go .mkChip.g1{animation:mkPop .5s .9s both}.grown.go .mkChip.g2{animation:mkPop .5s 1.8s both}.grown.go .mkChip.g3{animation:mkPop .5s 2.7s both}.grown.go .mkChip.g4{animation:mkPop .5s 3.6s both}
@keyframes mkFr{from{border-color:transparent;background:transparent}to{border-color:#b99af0;background:rgba(177,132,245,.07)}}
.mkLR{display:flex;align-items:center;gap:8px;width:88%;margin:8px auto 0;font:800 12px var(--jp);color:#6b7b97}
.mkLR i{flex:1;height:3px;background:#8b9bb8;border-radius:2px;position:relative;transform-origin:left}
.mkLR i::after{content:"";position:absolute;right:-2px;top:-5px;border:6.5px solid transparent;border-left:10px solid #8b9bb8;border-right:0}
.mkLR.go i{animation:mkLg 1.2s ease 2.4s both}
@keyframes mkLg{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.eqw{display:inline-grid}.eqw>span{grid-area:1/1;text-align:center}
.eqw .b{opacity:1;color:#e89a1a;font-size:1.3em;line-height:1}.eqw .a{opacity:0}
.eqw.go .a{opacity:1;animation:mkEqA .45s ease 1.1s forwards}
.eqw.go .b{opacity:0;animation:mkEqB .55s cubic-bezier(.3,1.6,.5,1) 1.1s forwards}
.mkChip.eqm{border-color:#e89a1a}
.mkChip.cg{border-style:dashed;background:rgba(255,255,255,.55)}
.mkChip.ca{border-style:solid}
.mkChip.cT{border-style:solid;outline:3px solid var(--rc,#9fb0c6);outline-offset:3px}
.mkChip.ca.go{animation:mkDrawB 1.1s ease .9s both}
.mkChip.ca.go::after{content:"";position:absolute;inset:-3px;border:3px dashed var(--rc,#9fb0c6);border-radius:12px;pointer-events:none;animation:mkDashOut .7s ease 1.3s both}
.mkChip.cT.go{animation:mkDrawT 1.1s ease .9s both}
@keyframes mkDrawB{0%{border-color:transparent}100%{border-color:var(--rc,#9fb0c6)}}
@keyframes mkDashOut{to{opacity:0}}
@keyframes mkDrawT{0%{outline-color:transparent;transform:scale(.9)}60%{transform:scale(1.08)}100%{outline-color:var(--rc,#9fb0c6);transform:none}}
.mkChip.eqm.go,.eqm:has(.eqw.go){animation:mkEqFlash .6s ease 1.1s}
@keyframes mkEqA{to{opacity:0;transform:scale(.4) rotate(-20deg)}}
@keyframes mkEqB{from{opacity:0;transform:scale(.2) rotate(40deg)}to{opacity:1;transform:none}}
@keyframes mkEqFlash{40%{background:#fff0c4;box-shadow:0 0 0 6px rgba(232,154,26,.35)}}
.mkEqS{align-self:center;font:800 24px var(--jp);color:#e89a1a;animation:mkPop .4s}
.mkRow.sm .mkEqS,.mkRow.mini .mkEqS{font-size:18px}
.mkChip.dimc{opacity:.35}
.mkChip.foc{box-shadow:0 0 0 4px rgba(255,200,40,.6),0 3px 8px rgba(0,0,0,.12);transform:translateY(-3px) scale(1.05);z-index:2}
.mkChip.bad{border-color:#e4546a;background:#fff0f2}
.mkChip.hl{box-shadow:0 0 0 4px rgba(177,132,245,.5);transform:translateY(-2px)}
.mkQ .tag.T{background:#9b7bd8}
.mkQ .mkRow{margin:2px 0}
.mkArr{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.mkArr span{background:#fff;border:2px solid #cfd9ea;border-radius:12px;padding:6px 9px;font:800 13px var(--jp)}
.mkChars{flex:none;height:160px;display:flex;justify-content:space-between;align-items:flex-end;padding:4px 10px 0;position:relative}
.mkC{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;transition:transform .25s,opacity .25s,filter .25s}
.mkC img{max-height:100%;max-width:100%;width:auto;aspect-ratio:1/1;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(40,60,100,.25))}
.mkC.b img{transform:scaleX(-1)}
.mkC.dim{opacity:.7;transform:scale(.9);filter:saturate(.7)}
.mkC.talk{transform:scale(1.04);animation:mkBob .5s}
@keyframes mkBob{40%{transform:translateY(-8px) scale(1.04)}}
.mkSay{flex:none;margin:4px 10px 0;background:#fff;border-radius:18px;padding:12px 14px 14px;box-shadow:0 3px 14px rgba(60,90,140,.25);position:relative;min-height:104px;cursor:pointer}
.mkName{position:absolute;top:-13px;left:14px;padding:3px 12px;border-radius:12px;font:800 12px var(--jp);color:#fff}
.mkName.g{background:#ff7fb7}.mkName.b{background:#5aa9ff}
.mkTxt{white-space:pre-line;font-size:16px;line-height:1.7;font-weight:700;margin-top:6px}
.mkNext{position:absolute;right:12px;bottom:8px;color:#5aa9ff;font-size:14px;animation:mkBlink 1.2s infinite}
.mkQt{height:190px;margin-top:8px!important;box-sizing:border-box;justify-content:center;gap:5px;padding:8px 12px}.mkQt.big{height:auto;min-height:190px}.mkQb{margin-top:4px!important;min-height:104px;box-sizing:border-box;justify-content:center}
.mkQ{flex:none;margin:6px 12px 0;padding:12px 12px 14px;background:rgba(255,255,255,.93);border-radius:18px;box-shadow:0 2px 12px rgba(60,90,140,.2);display:flex;flex-direction:column;gap:10px}
.mkQ .jp{font-size:19px;font-weight:800;text-align:center}
.mkQ .tag{font-size:11px;color:#fff;background:#8a9bb8;border-radius:8px;padding:2px 8px;align-self:center}
.mkQ .tag.D{background:#d9a441}.mkQ .tag.boss{background:#e4546a}
.mkQ .hint{font-size:12px;color:#5b6d8c;text-align:center}
.mkSlots{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;min-height:52px}
.mkSlot{min-width:60px;min-height:44px;border-radius:12px;border:2px dashed #b9c6de;display:flex;align-items:center;justify-content:center;padding:0 6px;font:800 18px var(--en);background:#f4f8ff}
.mkSlot.f{border-style:solid;background:#fff;border-color:var(--rc,#8a9bb8)}
.mkSlot.jp,.mkCard.jp{font-family:var(--jp)}
.mkPool{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.mkCard{border:2px solid #cfd9ea;background:#fff;border-radius:12px;padding:9px 13px;font:800 18px var(--en);color:#27344f;box-shadow:0 2px 0 #cfd9ea;cursor:pointer}
.mkCard.jp{border-style:dashed}
.mkCard.used{opacity:.25;pointer-events:none}
.mkOpts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.mkOpts .mkCard{font-size:17px}
.mkOpts.c{flex-direction:column}
.mkOpts.c .mkCard{font-family:var(--jp);text-align:center}
.mkSen{font:800 24px var(--en);text-align:center;line-height:1.5}
.mkSen .bl{display:inline-block;min-width:60px;border-bottom:3px solid #8a9bb8;color:#e4546a}
.mkMsg{min-height:22px;text-align:center;font-size:14px;font-weight:800}
.mkMsg.ok{color:#2fa36b}.mkMsg.ng{color:#e4546a}
.mkBtn{border:0;border-radius:14px;padding:12px;font:800 16px var(--jp);color:#fff;background:linear-gradient(180deg,#6cb8ff,#4a9af0);box-shadow:0 3px 0 #3a7fd0}
.mkBtn:disabled{opacity:.4;box-shadow:none}
.mkBtn.sub{background:#fff;color:#27344f;box-shadow:0 2px 0 #cfd9ea;border:2px solid #cfd9ea}
.mkShake{animation:mkShake .35s}
@keyframes mkShake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.mkList{flex:1;overflow-y:auto;padding:40px 12px calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px}
.mkCh{background:rgba(255,255,255,.92);border-radius:16px;padding:12px 14px;box-shadow:0 2px 8px rgba(60,90,140,.15);display:flex;flex-direction:column;gap:8px}
.mkCh h3{margin:0;font-size:16px}
.mkCh .sub{font-size:12px;color:#5b6d8c}
.mkCh.lock{opacity:.6}
.mkLs{display:flex;flex-direction:column;gap:6px}
.mkL{display:flex;align-items:center;gap:8px;border:2px solid #dbe5f5;background:#fff;border-radius:12px;padding:9px 11px;font:700 14px var(--jp);color:#27344f;text-align:left}
.mkL b{font:800 12px var(--en);color:#5aa9ff;min-width:34px}
.mkL em{margin-left:auto;font-style:normal;font-size:12px}
.mkL:disabled{opacity:.5}
.mkL.next{border-color:#5aa9ff;background:#eef6ff}
.mkEnd{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;text-align:center}
.mkEnd h2{margin:0;font-size:22px}
.mkEnd p{margin:0;font-size:14px;line-height:1.7;white-space:pre-line}
.mkEnd .big{font:800 28px var(--en);color:#e89a1a}
.mkEnd img{width:min(46vw,170px)}
.mkEnd .btns{display:flex;flex-direction:column;gap:8px;width:min(320px,86vw)}
.mkTitle{background:linear-gradient(90deg,#ffe58a,#ffc2dc);border-radius:14px;padding:8px 16px;font-weight:800}
.mkNotice{margin:auto 14px;background:#fff7e2;border:3px solid #f0b43c;border-radius:18px;padding:18px;text-align:center;font-size:17px;font-weight:800;line-height:1.8;white-space:pre-line;box-shadow:0 3px 12px rgba(200,140,40,.25)}
`;
      document.head.appendChild(css);
      const root = document.createElement("div");
      root.className = "mkApp";
      root.id = "mkRoot";
      root.hidden = true;
      document.body.appendChild(root);
      const sfxs = (n) => {
        try {
          HOST.sfx(n);
        } catch (e) {
        }
      };
      const esc3 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
      const shuf = (a) => {
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const rc = (r) => `style="--rc:var(--c${r === "I" ? "I" : r})"`;
      const face = (w, f) => `${HOST.base}img/chara/${w === "g" ? "girl" : "boy"}/${FACE2[f] || "normal"}.webp`;
      let cur2 = null;
      function visible() {
        return !root.hidden;
      }
      function showList() {
        cur2 = null;
        const ch = CHAPTERS.map((c) => {
          const open2 = c.n === 1 || st.ch[c.n - 1];
          if (!c.lessons || !open2) return `<div class="mkCh lock"><h3>\u7B2C${c.n}\u7AE0\u3000${esc3(c.name)}</h3><div class="sub">${esc3(c.sub)}</div><div class="sub">\u{1F512} ${!c.lessons ? "\u3082\u3046\u3059\u3050\u516C\u958B" : "\u524D\u306E\u7AE0\u3092\u30AF\u30EA\u30A2\u3059\u308B\u3068\u958B\u304D\u307E\u3059"}</div></div>`;
          let nxt = true;
          const ls = c.lessons.map((l) => {
            const done = !!st.done[l.id];
            const can = done || nxt;
            const isNext = !done && nxt;
            if (!done) nxt = false;
            return `<button class="mkL${isNext ? " next" : ""}" data-l="${l.id}" ${can ? "" : "disabled"}><b>${l.id}</b>${esc3(l.name)}<em>${done ? "\u2705" : can ? "\u25B6" : "\u{1F512}"}</em></button>`;
          }).join("");
          return `<div class="mkCh"><h3>\u7B2C${c.n}\u7AE0\u3000${esc3(c.name)}${st.ch[c.n] ? " \u2705" : ""}</h3><div class="sub">${esc3(c.sub)}</div>${c.partial ? `<div class="sub">\u3044\u307E\u306F ${esc3(c.partial)} \u307E\u3067\u904A\u3079\u307E\u3059</div>` : ""}<div class="mkLs">${ls}</div></div>`;
        }).join("");
        const tt = st.titles.length ? `<div class="mkTitle">\u79F0\u53F7\uFF1A${esc3(st.titles.join(" / "))}</div>` : "";
        root.innerHTML = `<div class="mkTop"><button id="mkX">\u2190 \u3082\u3069\u308B</button><div class="mkTtl">\u6587\u3092\u4F5C\u308B\uFF08\u8A71\u3059\u30FB\u66F8\u304F\uFF09</div><div class="mkPg"></div></div>
      <div class="mkList">${tt}${ch}<div class="mkCap">\u7AE0\u306F\u9806\u756A\u306B\u958B\u304D\u307E\u3059\u3002\u300C\u8AAD\u3080\u300D\u306E\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB\u3092\u7D42\u3048\u305F\u4EBA\u304C\u3001\u30C6\u30B9\u30C8\u3067\u98DB\u3070\u305B\u308B\u4ED5\u7D44\u307F\u306F\u6E96\u5099\u4E2D\u3067\u3059\u3002</div></div>`;
        root.querySelector("#mkX").onclick = close;
        root.querySelectorAll("[data-l]").forEach((bt) => bt.onclick = () => start(bt.dataset.l));
      }
      function start(id) {
        const lesson = ALL.find((l) => l.id === id);
        if (!lesson) return;
        cur2 = { lesson, i: 0, miss: 0 };
        root.innerHTML = `<div class="mkTop"><button id="mkX">\u2190 \u4E00\u89A7</button><div class="mkTtl">${esc3(lesson.id)}\u3000${esc3(lesson.name)}</div><div class="mkPg" id="mkPg"></div></div>
      <div class="mkBar"><i id="mkBarI"></i></div>
      <div id="mkMain" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
        root.querySelector("#mkX").onclick = () => {
          showList();
        };
        boardState = null;
        FACES = { g: "\u666E\u901A", b: "\u666E\u901A" };
        step2();
      }
      function chars(main, gf, bf, talk, small) {
        return `<div class="mkChars"${small ? ` style="flex:none;height:96px"` : ""}>
      <div class="mkC g ${talk === "g" ? "talk" : talk ? "dim" : ""}" id="mkCg"><img src="${face("g", gf)}" alt=""></div>
      <div class="mkC b ${talk === "b" ? "talk" : talk ? "dim" : ""}" id="mkCb"><img src="${face("b", bf)}" alt=""></div></div>`;
      }
      let FACES = { g: "\u666E\u901A", b: "\u666E\u901A" };
      function setFaces(w, f) {
        FACES[w] = f;
      }
      function lastF(w) {
        return FACES[w] || "\u666E\u901A";
      }
      const subHtml = (x) => {
        const p = String(x).split("|");
        return `<small><b class="ct">${esc3(p[p.length - 1])}</b></small>`;
      };
      const NUMR = { S: "\u2460\u4E3B\u5F79", V: "\u2461\u3069\u3046\u3057\u3066\u308B\uFF1F", O: "\u2462\u76F8\u624B" };
      const roleName = (r) => cur2 && cur2.lesson && cur2.lesson.nums && NUMR[r] || ROLE[r];
      const GRAM = {
        "\u4E3B\u5F79": "\u4E3B\u8A9E",
        "\u3069\u3046\u3057\u3066\u308B\uFF1F": "\u52D5\u8A5E",
        "\u76F8\u624B": "\u76EE\u7684\u8A9E",
        "\u8AB0\u306B": "\u9593\u63A5\u76EE\u7684\u8A9E",
        "\u3069\u3093\u306A\u611F\u3058\uFF1F": "\u88DC\u8A9E",
        "\u524D\u3061\u3087\u3044\u8DB3\u3057": "\u4FEE\u98FE",
        "\u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057": "\u4FEE\u98FE",
        "\u5834\u9762": "\u526F\u8A5E\uFF08\u53E5\uFF09",
        "\u3069\u3093\u306A": "\u5F62\u5BB9\u8A5E",
        "\u3060\u308C\u306E": "\u6240\u6709",
        "\u3069\u3053\u306E": "\u4FEE\u98FE",
        "\u3069\u3093\u306A\u3075\u3046\u306B": "\u526F\u8A5E",
        "\u3069\u308C\u304F\u3089\u3044": "\u526F\u8A5E",
        "\u3044\u3064": "\u6642",
        "\u3069\u3053": "\u5834\u6240",
        "\u30B8\u30E3\u30F3\u30EB": "\u7121\u51A0\u8A5E",
        "\u5177\u4F53\u7684": "a",
        "\u305D\u308C\uFF01": "the",
        "\u3064\u306A\u304E\u8A00\u8449": "\u524D\u7F6E\u8A5E",
        "\u5411\u304B\u3046\u5148": "\u524D\u7F6E\u8A5E"
      };
      const gramOf = (cat) => GRAM[String(cat || "").replace(/^[①②③]/, "")] || "";
      const gmHtml = (cat) => {
        const g2 = gramOf(cat);
        return g2 ? `<em class="gmT">${esc3(g2)}</em>` : "";
      };
      const topHtml = (m) => m ? `<i class="mnT">${esc3(m)}</i>` : "";
      const MEAN = { "I:me": "\u79C1\u306B", "O:me": "\u79C1\u3092", "I:you": "\u3042\u306A\u305F\u306B", "S:You": "\u3042\u306A\u305F", "S:I": "\u79C1", "S:She": "\u5F7C\u5973", "S:she": "\u5F7C\u5973", "S:Tom": "\u30C8\u30E0", "S:Mika": "\u30DF\u30AB", "S:Birds": "\u9CE5", "S:birds": "\u9CE5", "S:Kids": "\u5B50\u3069\u3082\u305F\u3061", "S:Music": "\u97F3\u697D", "S:He": "\u5F7C", "V:found": "\u601D\u3063\u305F", "O:the book": "\u305D\u306E\u672C\u3092", "C:interesting": "\u9762\u767D\u3044", "S:cat": "\u306D\u3053", "S:The cat": "\u305D\u306E\u306D\u3053", "S:the cat": "\u305D\u306E\u306D\u3053", "S:friend": "\u53CB\u3060\u3061", "O:Tom": "\u30C8\u30E0\u3092", "O:music": "\u97F3\u697D\u3092", "O:flowers": "\u82B1\u3092", "O:English": "\u82F1\u8A9E\u3092", "V:am": "\u301C\u3060", "V:is": "\u301C\u3060", "V:are": "\u301C\u3060", "V:arrives": "\u5230\u7740\u3059\u308B", "V:calls": "\u547C\u3076", "V:fly": "\u98DB\u3076", "V:gives": "\u304F\u308C\u308B", "V:likes": "\u597D\u304D", "V:makes": "\u301C\u306B\u3059\u308B", "V:ran": "\u8D70\u3063\u305F", "V:runs": "\u8D70\u308B", "V:sing": "\u6B4C\u3046", "V:sings": "\u6B4C\u3046", "V:teach": "\u6559\u3048\u308B", "V:eats": "\u98DF\u3079\u308B", "V:reads": "\u8AAD\u3080", "V:walks": "\u6B69\u304F", "C:happy": "\u5E78\u305B", "C:kind": "\u512A\u3057\u3044", "C:smile": "\u7B11\u9854", "C:tall": "\u80CC\u304C\u9AD8\u3044", "C:sleepy": "\u7720\u3044", "C:smart": "\u982D\u304C\u3044\u3044", "O:lunch": "\u663C\u3054\u306F\u3093\u3092", "O:ramen": "\u30E9\u30FC\u30E1\u30F3\u3092", "O:presents": "\u30D7\u30EC\u30BC\u30F3\u30C8\u3092", "O:book": "\u672C\u3092", "V:sleep": "\u7720\u308B", "V:sleeps": "\u7720\u308B", "V:like": "\u597D\u304D", "S:cats": "\u306D\u3053", "S:Ken": "\u30B1\u30F3", "S:Cats": "\u306D\u3053", "S:They": "\u5F7C\u3089", "V:waits": "\u5F85\u3064", "V:goes": "\u884C\u304F", "O:tennis": "\u30C6\u30CB\u30B9\u3092", "O:Osaka": "\u5927\u962A\u3092" };
      const meanOf = (r, t) => MEAN[r + ":" + t] || "";
      const ctrCls = (c) => c === "\u30B8\u30E3\u30F3\u30EB" ? " cg" : c === "\u5177\u4F53\u7684" ? " ca" : c === "\u305D\u308C\uFF01" ? " cT" : "";
      let EQFIRST = false;
      function chipHtml(c, i, s) {
        const { r, t, sub: sub0 } = tk(c);
        const jp = isJp(t);
        const NOLAB = r === "Q" || Object.values(ROLE).includes(t.replace(/^[①②③]/, "")) || t === "\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E";
        const sub = sub0 || (NOLAB ? "" : roleName(r) || "");
        const cat = sub ? sub.split("|").pop() : "";
        const mean = jp || NOLAB || s.nomean ? "" : sub0 && sub0.includes("|") ? sub0.split("|")[0] : meanOf(r, t);
        const morph = s.arrow === "eq" && i === 1 && r === "V" && !s.types;
        const ctr = ctrCls(cat) + (EQFIRST && s.draw ? " go" : "");
        const crown = s.fx === "crown" && i === 0 ? `<span class="crown">\u{1F451}</span>` : "";
        const eq = s.eq && r === "V" ? " eq" : "";
        return `<span class="mkChip ${r === "Q" ? "Q" : ""}${jp ? " jp" : ""}${eq}${ctr}${s.swap && i === 1 ? " in" : ""}${s.hl === i ? " hl" : ""}${s.bad === i ? " bad" : ""}${morph ? " eqm" : ""}" data-t="${esc3(t)}" data-r="${r}" data-cat="${esc3(cat)}" ${r !== "Q" ? rc(r) : ""}>${crown}${gmHtml(cat)}${topHtml(mean)}${morph ? `<span class="eqw${EQFIRST ? " go" : ""}"><span class="a">${esc3(t)}</span><span class="b">\uFF1D</span></span>` : esc3(t)}${sub ? subHtml(sub) : ""}</span>`;
      }
      const ARR = { self: "#e4546a", eq: "#e89a1a", out: "#e4546a", add: "#8b5cf6" };
      function drawArrows(row, kind, mini) {
        const chips = [...row.querySelectorAll(".mkChip")];
        if (!chips.length) return;
        const rr = row.getBoundingClientRect(), k = mini ? 0.6 : 1;
        const tops = chips.map((c) => Math.round(c.getBoundingClientRect().top));
        if (Math.max(...tops) - Math.min(...tops) > 22) return;
        const pt = (i) => {
          const r = chips[i].getBoundingClientRect();
          return { x: r.left - rr.left + r.width / 2, y: r.bottom - rr.top + 3 };
        };
        let out = "";
        const arc = (a, b2, d, label, col, head, sx) => {
          const A2 = pt(a), B2 = pt(b2), dd = d * k, x0 = A2.x + (sx || 0) * k;
          out += `<path d="M${x0},${A2.y} L${x0},${A2.y + dd} L${B2.x},${A2.y + dd} L${B2.x},${B2.y}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
          if (head) out += `<path d="M${B2.x - 6},${B2.y + 9} L${B2.x},${B2.y + 1} L${B2.x + 6},${B2.y + 9}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
          const fs = mini ? 10 : 13;
          out += `<text x="${(x0 + B2.x) / 2}" y="${A2.y + dd + (mini ? 12 : 17)}" text-anchor="middle" font-size="${label === "\uFF1D" ? mini ? 16 : 24 : fs}" font-weight="800" fill="${col}" font-family="var(--jp)">${label}</text>`;
        };
        if (kind === "self") arc(1, 0, 30, "\u305D\u306E\u4EBA\u81EA\u8EAB", ARR.self, true);
        else if (kind === "eqarc") arc(0, 2, 30, "\uFF1D", ARR.eq, false);
        else if (kind === "eq") {
        } else if (kind === "out") arc(1, 2, 30, "\u5916\u3078", ARR.out, true);
        else if (kind === "out2") {
          arc(1, 2, 24, "", ARR.out, true, 7);
          arc(1, 3, 46, "", ARR.out, true, -7);
          [[2, "\u8AB0\u306B"], [3, "\u4F55\u3092"]].forEach(([i, l]) => {
            const B2 = pt(i);
            out += `<text x="${B2.x}" y="${B2.y + (i === 2 ? 24 : 46) * k + (mini ? 12 : 17)}" text-anchor="middle" font-size="${mini ? 10 : 13}" font-weight="800" fill="${ARR.out}" font-family="var(--jp)">${l}</text>`;
          });
        } else if (kind === "outc") {
          arc(1, 2, 28, "\u50CD\u304D\u304B\u3051\u308B", ARR.out, true);
        } else if (kind.startsWith("pair:")) {
          const [rng, w] = kind.slice(5).split(","), [a, b2] = rng.split(">").map(Number), A2 = pt(a), B2 = pt(b2);
          out += `<path d="M${A2.x},${A2.y} L${A2.x},${A2.y + 11} L${B2.x},${B2.y + 11} L${B2.x},${B2.y}" fill="none" stroke="#3bb273" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
          out += `<text x="${(A2.x + B2.x) / 2}" y="${A2.y + 31}" text-anchor="middle" font-size="${mini ? 10 : 13}" font-weight="800" fill="#2fa36b" font-family="var(--jp)">\u304F\u3063\u3064\u3044\u3066\u3044\u305F\u3044\u30DA\u30A2</text>`;
          if (w != null && chips[+w]) {
            const X = pt(+w);
            out += `<text x="${X.x}" y="${A2.y + 19}" text-anchor="middle" font-size="24" font-weight="800" fill="#e4546a" font-family="var(--en)">\xD7</text>`;
          }
        } else if (kind.startsWith("add:")) {
          kind.slice(4).split(",").forEach((p) => {
            const [a, b2] = p.split(">").map(Number);
            if (chips[a] && chips[b2]) arc(a, b2, 26, "\u8A73\u3057\u304F", ARR.add, true);
          });
        }
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.innerHTML = out;
        row.appendChild(svg);
      }
      function boardHtml(s, first) {
        EQFIRST = !!first;
        if (s.types) {
          const T2 = [["S:Tom", "V:runs"], ["S:She", "V:is", "C:tall"], ["S:She", "V:calls", "O:Tom"], ["S:She", "V:gives", "I:me", "O:flowers"], ["S:Music", "V:makes", "O:me", "C:happy"]], K = ["self", "eqarc", "out", "out2", "outc"];
          return `<div class="mkTypes">${T2.map((c, i) => `<div class="mkTR"><span class="nm">${esc3(TYPES[i])}</span><div class="mkRow ar mini${K[i] === "out2" ? " ar2" : ""}" data-ar="${K[i]}">${c.map((x, j) => (K[i] === "outc" && j === 3 ? `<span class="mkEqS">\uFF1D</span>` : "") + chipHtml(x, j, { nomean: 1 })).join("")}</div></div>`).join("")}</div>${s.cap ? `<div class="mkCap">${esc3(s.cap)}</div>` : ""}`;
        }
        if (s.table) return `<div class="mkTbl">${s.table.map(([l, r, k]) => `<div><span class="l" ${rc(k || "V")}>${esc3(l)}</span><span>\u2192</span><span class="mkChip" ${rc(k || "V")}>${esc3(r)}</span></div>`).join("")}</div>${s.cap ? `<div class="mkCap">${esc3(s.cap)}</div>` : ""}`;
        const n = s.cards.length;
        if (s.grow) {
          let h = chipHtml(s.cards[0], 0, s).replace('class="mkChip ', 'class="mkChip g0 ');
          for (let i = 1; i < n; i++) h = `<span class="mkNest" style="--d:${(i * 0.9).toFixed(1)}s">${h}${chipHtml(s.cards[i], i, s).replace('class="mkChip ', 'class="mkChip g' + i + " ")}</span>`;
          return `<div class="mkRow grown sm xs${EQFIRST ? " go" : ""}">${h}</div><div class="mkLR${EQFIRST ? " go" : ""}"><i></i><span>\u6587\u306F\u3001\u5DE6\u304B\u3089\u53F3\u3078</span></div>${s.cap ? `<div class="mkCap">${esc3(s.cap)}</div>` : ""}`;
        }
        const gs = [];
        if (s.arrow && s.arrow.startsWith("add:")) s.arrow.slice(4).split(",").forEach((p) => {
          const [a, b2] = p.split(">").map(Number);
          gs.push([Math.min(a, b2), Math.max(a, b2)]);
        });
        if (s.grp) gs.push(s.grp);
        let inner = "";
        for (let i = 0; i < n; i++) {
          const g2 = gs.find((x) => x[0] === i);
          if (g2) {
            inner += `<span class="mkGrp">${s.cards.slice(g2[0], g2[1] + 1).map((c, k) => chipHtml(c, g2[0] + k, s)).join("")}</span>`;
            i = g2[1];
          } else inner += (s.arrow === "outc" && i === 3 ? `<span class="mkEqS">\uFF1D</span>` : "") + chipHtml(s.cards[i], i, s);
        }
        const rows = `<div class="mkRow${s.arrow ? " ar" : ""}${s.arrow === "out2" ? " ar2" : ""}${n >= 4 || s.small ? " sm" : ""}${s.small || s.arrow === "outc" ? " xs" : ""}" ${s.arrow ? `data-ar="${s.arrow}"` : ""}>${inner}${s.mark ? `<span class="mkMark${s.mark === "\xD7" ? " ng" : ""}">${s.mark}</span>` : ""}</div>`;
        const lr = s.lr ? `<div class="mkLR"><i></i><span>${esc3(s.lr)}</span></div>` : "";
        return `${rows}${lr}${s.cap ? `<div class="mkCap">${esc3(s.cap)}</div>` : ""}`;
      }
      function paintArrows(scope) {
        scope.querySelectorAll("[data-ar]").forEach((r) => drawArrows(r, r.dataset.ar, r.classList.contains("mini")));
      }
      function progress() {
        const n = cur2.lesson.steps.length;
        const p = root.querySelector("#mkPg");
        if (p) p.textContent = `${Math.min(cur2.i + 1, n)}/${n}`;
        const bi = root.querySelector("#mkBarI");
        if (bi) bi.style.width = Math.round(cur2.i / n * 100) + "%";
      }
      const ROLE_WORDS = { S: ["\u4E3B\u5F79"], V: ["\u3069\u3046\u3057\u3066\u308B\uFF1F"], O: ["\u76F8\u624B", "\u300C\u4F55\u3092\u300D", "\u300C\u8AB0\u3092\u300D"], I: ["\u8AB0\u306B"], C: ["\u3069\u3093\u306A\u611F\u3058\uFF1F"], F: ["\u524D\u3061\u3087\u3044\u8DB3\u3057"], R: ["\u5F8C\u308D\u3061\u3087\u3044\u8DB3\u3057"], W: ["\u5834\u9762"] };
      function focusChips(scope, text) {
        const chips = [...scope.querySelectorAll("#mkBoard .mkChip[data-t]")];
        if (!chips.length) return;
        const hit = chips.filter((c) => {
          const t = (c.dataset.t || "").replace(/[,，.]+$/, "");
          if (t && /[A-Za-z]/.test(t)) {
            const re = new RegExp("(^|[^A-Za-z])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-z])", "i");
            if (re.test(text)) return true;
          } else if (t && text.includes(t)) return true;
          if ((ROLE_WORDS[c.dataset.r] || []).some((w) => text.includes(w))) return true;
          const k = c.dataset.cat;
          if (k && text.includes("\u300C" + k + "\u300D")) return true;
          return false;
        });
        if (!hit.length || hit.length === chips.length) return;
        chips.forEach((c) => c.classList.add(hit.includes(c) ? "foc" : "dimc"));
      }
      let boardState = null;
      function step2() {
        const L = cur2.lesson, s = L.steps[cur2.i];
        const main = root.querySelector("#mkMain");
        if (!s) {
          return finishLesson();
        }
        progress();
        if (s.k === "board") {
          boardState = s;
          cur2.i++;
          return step2();
        }
        if (s.k === "say") {
          setFaces(s.w, s.f);
          const gf = lastF("g"), bf = lastF("b");
          main.innerHTML = `<div class="mkBoard" id="mkBoard">${boardState ? boardHtml(boardState, !boardState.__shown) : ""}</div>
        ${chars(main, gf, bf, s.w)}
        <div class="mkSay" id="mkSay"><div class="mkName ${s.w}">${s.w === "g" ? "\u5973\u306E\u5B50" : "\u7537\u306E\u5B50"}</div><div class="mkTxt">${esc3(s.t)}</div><div class="mkNext">\u25B6</div></div>`;
          if (boardState) boardState.__shown = true;
          if (!boardState) main.querySelector("#mkBoard").style.visibility = "hidden";
          else {
            paintArrows(main);
            focusChips(main, s.t);
          }
          main.querySelector("#mkSay").onclick = () => {
            cur2.i++;
            step2();
          };
          return;
        }
        if (s.k === "notice") {
          cur2.bossOn = true;
          main.innerHTML = `<div class="mkNotice">${esc3(s.t)}</div><div class="mkQ"><button class="mkBtn" id="mkOk">\u308F\u304B\u3063\u305F\uFF01</button></div>`;
          main.querySelector("#mkOk").onclick = () => {
            cur2.i++;
            step2();
          };
          return;
        }
        if (s.k === "sum") {
          main.innerHTML = `<div class="mkBoard" style="visibility:hidden"></div>${chars(main, "\u559C\u3076", "\u559C\u3076", "", false)}
        <div class="mkSay" id="mkSay"><div class="mkName b">\u307E\u3068\u3081</div><div class="mkTxt">${esc3(s.t)}</div><div class="mkNext">\u25B6</div></div>`;
          sfxs("se/sentence_clear");
          main.querySelector("#mkSay").onclick = () => {
            cur2.i++;
            step2();
          };
          return;
        }
        if (s.k === "quiz") return quiz(s, main);
      }
      function colorize(ans, W) {
        const ev = W ? Object.values(W) : [];
        return `<div class="mkRow">${ans.map((a) => {
          const { r, t, sub } = tk(a);
          return `<span class="mkChip${isJp(t) ? " jp" : ""}${ev.includes(t) ? " in" : ""}${ctrCls((sub || "").split("|").pop())}" ${rc(r)}>${gmHtml((sub || roleName(r) || "").split("|").pop())}${isJp(t) ? "" : topHtml(sub && sub.includes("|") ? sub.split("|")[0] : meanOf(r, t))}${esc3(t)}${subHtml(sub || roleName(r) || "")}</span>`;
        }).join("")}</div>`;
      }
      function react(w, f) {
        const im = root.querySelector(w === "g" ? "#mkCg img" : "#mkCb img");
        if (im) im.src = face(w, f);
      }
      function reactBoth(f1, f2) {
        react("g", f1);
        react("b", f2);
      }
      function quiz(s, main) {
        const boss = cur2.lesson.boss && cur2.bossOn;
        const TAGS = { A: "\u4E26\u3079\u308B", E: "\u65E5\u672C\u8A9E\u3067\u4E26\u3079\u308B", B: "\u9078\u3076", C: s.gen ? "\u4EF2\u9593\u308F\u3051" : "\u578B\u3092\u9078\u3076", D: "\u65E5\u672C\u8A9E\u307E\u3058\u308A", T: "\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u3066\u308B\uFF1F" };
        const tag = `<span class="tag ${boss ? "boss" : s.type === "D" || s.type === "T" ? s.type : ""}">${boss ? "\u30DC\u30B9\u6226" : TAGS[s.type] || ""}</span>`;
        const chs = chars(main, "\u666E\u901A", "\u666E\u901A", "", false);
        if (s.type === "A" || s.type === "D" || s.type === "E") {
          const toks = s.ans.concat(s.dummy.map((t) => "X:" + t));
          const pool = s.type === "E" ? s.jo.map((i) => ({ id: i, ...tk(s.ans[i]) })) : shuf(toks.map((a, i) => ({ id: i, ...tk(a) })));
          const slots = Array(s.ans.length).fill(null);
          main.innerHTML = `<div class="mkQ mkQt">${tag}<div class="jp">${esc3(s.jp)}</div>
        ${s.hint ? `<div class="hint">${esc3(s.hint).replace(/\n/g, "<br>")}</div>` : s.type === "E" ? `<div class="hint">\u65E5\u672C\u8A9E\u306E\u307E\u307E\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u4E26\u3079\u3088\u3046<br>\uFF08\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u76F8\u624B\uFF09</div>` : s.type === "D" ? `<div class="hint">\u77E5\u3089\u306A\u3044\u5358\u8A9E\u306F\u3001\u65E5\u672C\u8A9E\u306E\u30AB\u30FC\u30C9\u306E\u307E\u307E\u3067OK\u3002\u9806\u756A\u3060\u3051\u5408\u308F\u305B\u3088\u3046</div>` : boss ? `<div class="hint">\u4F7F\u308F\u306A\u3044\u30AB\u30FC\u30C9\u304C\u6DF7\u3056\u3063\u3066\u3044\u308B\u3088</div>` : `<div class="hint">\u4E3B\u5F79\u304B\u3089\u9806\u756A\u306B\u3001\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7</div>`}
        <div class="mkSlots" id="mkSl"></div><div class="mkMsg" id="mkMsg"></div>
        </div>${chs}<div class="mkQ mkQb"><div class="mkPool" id="mkPo"></div>
        <button class="mkBtn" id="mkGo" disabled>\u3067\u304D\u305F</button></div>`;
          const sl = main.querySelector("#mkSl"), po = main.querySelector("#mkPo"), go = main.querySelector("#mkGo"), msg = main.querySelector("#mkMsg");
          let done = false, miss = 0;
          const draw = () => {
            sl.innerHTML = slots.map((c, i) => c ? `<button class="mkSlot f${isJp(c.t) ? " jp" : ""}" data-s="${i}">${esc3(c.t)}</button>` : `<div class="mkSlot">${s.type === "E" ? `<small style="font:700 11px var(--jp);color:#8a9bb8">${ROLE[tk(s.ans[i]).r] || ""}</small>` : ""}</div>`).join("");
            po.innerHTML = pool.map((c) => `<button class="mkCard${isJp(c.t) ? " jp" : ""}${slots.some((x) => x && x.id === c.id) ? " used" : ""}" data-c="${c.id}">${esc3(c.t)}</button>`).join("");
            go.disabled = done ? false : !slots.every(Boolean);
            sl.querySelectorAll("[data-s]").forEach((b2) => b2.onclick = () => {
              if (done) return;
              slots[+b2.dataset.s] = null;
              draw();
            });
            po.querySelectorAll("[data-c]").forEach((b2) => b2.onclick = () => {
              if (done) return;
              const c = pool.find((x) => x.id === +b2.dataset.c);
              const k = slots.indexOf(null);
              if (k < 0) return;
              slots[k] = c;
              msg.textContent = "";
              draw();
            });
          };
          draw();
          go.onclick = () => {
            if (done) {
              cur2.i++;
              boardState = null;
              step2();
              return;
            }
            const given = slots.map((c) => c.id);
            let ok = given.every((id, i) => id === i);
            let alt = null;
            if (!ok && s.alt) {
              alt = s.alt.find((a) => given.length === a.o.length && given.every((id, i) => id === a.o[i])) || null;
              ok = !!alt;
            }
            if (ok) {
              done = true;
              sfxs("se/study_correct");
              reactBoth("\u559C\u3076", "\u559C\u3076");
              const W = Object.fromEntries(s.words || []);
              const eng = alt ? alt.o.map((id, i) => {
                const q = tk(s.ans[id]);
                return q.r + ":" + (alt.t ? alt.t[i] : W[q.t] || q.t) + (q.sub ? "|" + q.sub : "");
              }) : s.ans.map((a) => {
                const q = tk(a);
                return W[q.t] ? q.r + ":" + W[q.t] + (q.sub ? "|" + q.sub : "") : a;
              });
              sl.innerHTML = colorize(eng, W);
              msg.className = "mkMsg ok";
              msg.textContent = "\u305B\u3044\u304B\u3044\uFF01";
              if (s.type === "E" && s.note) {
                const ex = document.createElement("div");
                ex.className = "hint";
                ex.textContent = s.note;
                msg.after(ex);
              }
              if (s.words && s.words.length) {
                const ex = document.createElement("div");
                ex.className = "hint";
                ex.innerHTML = `\u65E5\u672C\u8A9E\u306E\u3068\u3053\u308D\u306F\u3001\u82F1\u8A9E\u3060\u3068\u3053\u3046\u306A\u308B\u3088<br><b>${s.words.map(([j, e]) => esc3(j) + " \uFF1D " + esc3(e)).join("\u3000")}</b>\u3000\u2192\u3000${esc3(s.en)}`;
                msg.after(ex);
              }
              po.style.display = "none";
              go.textContent = "\u3064\u304E\u3078";
              go.disabled = false;
            } else {
              miss++;
              cur2.miss++;
              sfxs("se/study_wrong");
              reactBoth("\u7126\u308B", "\u843D\u3061\u8FBC\u3080");
              sl.classList.add("mkShake");
              setTimeout(() => sl.classList.remove("mkShake"), 400);
              const usedDummy = slots.some((c) => c.id >= s.ans.length);
              msg.className = "mkMsg ng";
              msg.textContent = usedDummy ? "\u4F7F\u308F\u306A\u3044\u30AB\u30FC\u30C9\uFF08\u30C0\u30DF\u30FC\uFF09\u304C\u5165\u3063\u3066\u308B\u3088" : miss >= 2 ? cur2.lesson.help || "\u6700\u521D\u306F\u300C\u4E3B\u5F79\u300D\u304B\u3089\u3060\u3088\u3002\u6B21\u306B\u300C\u3069\u3046\u3057\u3066\u308B\uFF1F\u300D" : "\u9806\u756A\u3092\u3082\u3046\u4E00\u5EA6\u898B\u3066\u307F\u3088\u3046";
              slots.fill(null);
              draw();
            }
          };
          return;
        }
        if (s.type === "T") {
          main.innerHTML = `<div class="mkQ mkQt big">${tag}<div class="hint">\u5149\u3063\u3066\u3044\u308B\u30AB\u30FC\u30C9\u306F\u3001\u3069\u3053\u3092\u8A73\u3057\u304F\u3057\u3066\u3044\u308B\uFF1F</div>
        ${boardHtml({ cards: s.cards, hl: s.hl })}<div class="mkMsg" id="mkMsg"></div>
        </div>${chs}<div class="mkQ mkQb"><div class="mkOpts c" id="mkOp">${s.opts.map((o) => `<button class="mkCard" data-o="${esc3(o)}">${esc3(o)}</button>`).join("")}</div>
        <button class="mkBtn" id="mkGo" style="display:none">\u3064\u304E\u3078</button></div>`;
          const msg = main.querySelector("#mkMsg");
          main.querySelectorAll("[data-o]").forEach((bt) => bt.onclick = () => {
            if (bt.dataset.o === s.ok) {
              sfxs("se/study_correct");
              reactBoth("\u559C\u3076", "\u559C\u3076");
              msg.className = "mkMsg ok";
              msg.textContent = "\u305B\u3044\u304B\u3044\uFF01 \u300C" + s.ok + "\u300D";
              main.querySelector("#mkOp").style.display = "none";
              if (s.why) {
                const ex = document.createElement("div");
                ex.className = "hint";
                ex.textContent = s.why;
                msg.after(ex);
              }
              const go = main.querySelector("#mkGo");
              go.style.display = "";
              go.onclick = () => {
                cur2.i++;
                boardState = null;
                step2();
              };
            } else {
              sfxs("se/study_wrong");
              reactBoth("\u7126\u308B", "\u843D\u3061\u8FBC\u3080");
              bt.disabled = true;
              bt.style.opacity = ".3";
              msg.className = "mkMsg ng";
              msg.textContent = "\u3061\u3087\u3044\u8DB3\u3057\u306F\u3001\u8A73\u3057\u304F\u3057\u305F\u3044\u3082\u306E\u306E\u524D\u304B\u5F8C\u308D\u306B\u304F\u3063\u3064\u3044\u3066\u3044\u308B\u3088";
            }
          });
          return;
        }
        if (s.type === "B") {
          main.innerHTML = `<div class="mkQ mkQt">${tag}<div class="hint">\u7A7A\u3044\u3066\u3044\u308B\u3068\u3053\u308D\u306B\u5165\u308B\u8A00\u8449\u306F\uFF1F<br>${s.hint ? esc3(s.hint) : "I \u2192 am \uFF0F he\u30FBshe\u30FBit\u30FB\u540D\u524D\u3072\u3068\u308A \u2192 is \uFF0F you\u30FBwe\u30FBthey \u2192 are"}</div>${s.ctx ? `<div class="hint" style="font-weight:800;color:#27344f">${esc3(s.ctx)}</div>` : ""}
        <div class="mkSen">${esc3(s.before)} <span class="bl" id="mkBl">\u3000\u3000</span>${/^[.,!?]/.test(s.after) || !s.after ? "" : " "}${esc3(s.after)}</div><div class="mkMsg" id="mkMsg"></div>
        </div>${chs}<div class="mkQ mkQb"><div class="mkOpts" id="mkOp">${s.opts.map((o) => `<button class="mkCard" data-o="${esc3(o)}">${esc3(o)}</button>`).join("")}</div>
        <button class="mkBtn" id="mkGo" style="display:none">\u3064\u304E\u3078</button></div>`;
          const msg = main.querySelector("#mkMsg");
          main.querySelectorAll("[data-o]").forEach((bt) => bt.onclick = () => {
            if (bt.dataset.o === s.ok) {
              sfxs("se/study_correct");
              reactBoth("\u559C\u3076", "\u559C\u3076");
              main.querySelector("#mkBl").textContent = s.ok;
              msg.className = "mkMsg ok";
              msg.textContent = "\u305B\u3044\u304B\u3044\uFF01";
              main.querySelector("#mkOp").style.display = "none";
              const go = main.querySelector("#mkGo");
              go.style.display = "";
              go.onclick = () => {
                cur2.i++;
                boardState = null;
                step2();
              };
            } else {
              sfxs("se/study_wrong");
              reactBoth("\u7126\u308B", "\u843D\u3061\u8FBC\u3080");
              bt.disabled = true;
              bt.style.opacity = ".3";
              msg.className = "mkMsg ng";
              msg.textContent = s.wrong || "\u4E3B\u5F79\u306B\u5408\u3046\u5F62\u3092\u601D\u3044\u51FA\u305D\u3046\uFF08I \u2192 am \uFF0F she \u2192 is \uFF0F they \u2192 are\uFF09";
            }
          });
          return;
        }
        if (s.type === "C") {
          main.innerHTML = `<div class="mkQ mkQt">${tag}<div class="hint">${s.hint || (s.gen ? "\u3053\u306E\u8A00\u8449\u306F\u3001\u3069\u308C\uFF1F" : "\u3053\u306E\u6587\u306F\u3001\u3069\u306E\u578B\uFF1F")}</div>
        <div class="mkSen">${esc3(s.en)}</div><div class="mkMsg" id="mkMsg"></div>
        </div>${chs}<div class="mkQ mkQb"><div class="mkOpts c" id="mkOp">${(s.opts || TYPES).map((o) => `<button class="mkCard" data-o="${esc3(o)}">${esc3(o)}<small style="display:block;font:700 11px var(--jp);color:#7b8cab">${esc3((s.subs || (s.gen ? GEN_SUB : TYPE_SUB))[o] || "")}</small></button>`).join("")}</div>
        <button class="mkBtn" id="mkGo" style="display:none">\u3064\u304E\u3078</button></div>`;
          const msg = main.querySelector("#mkMsg");
          main.querySelectorAll("[data-o]").forEach((bt) => bt.onclick = () => {
            if (bt.dataset.o === s.ok) {
              sfxs("se/study_correct");
              reactBoth("\u559C\u3076", "\u559C\u3076");
              msg.className = "mkMsg ok";
              msg.textContent = "\u305B\u3044\u304B\u3044\uFF01 \u300C" + s.ok + "\u300D";
              main.querySelector("#mkOp").style.display = "none";
              const go = main.querySelector("#mkGo");
              go.style.display = "";
              go.onclick = () => {
                cur2.i++;
                boardState = null;
                step2();
              };
            } else {
              sfxs("se/study_wrong");
              reactBoth("\u7126\u308B", "\u843D\u3061\u8FBC\u3080");
              bt.disabled = true;
              bt.style.opacity = ".3";
              msg.className = "mkMsg ng";
              msg.textContent = s.wrong ? s.wrong : s.gen ? "\u8F2A\u90ED\u304C\u3042\u3063\u3066\u6570\u3048\u3089\u308C\u308B\u3072\u3068\u3064\u304B\u3001\u307C\u3093\u3084\u308A\u3057\u305F\u30B8\u30E3\u30F3\u30EB\u304B\u3001\u3069\u308C\u306E\u3053\u3068\u304B\u5206\u304B\u308B\u304B\u3001\u898B\u3066\u307F\u3088\u3046" : "\u77E2\u5370\u304C\u3069\u3053\u306B\u5411\u304B\u3046\u304B\u3001\u5F8C\u308D\u306B\u4F55\u304C\u6765\u308B\u304B\u3001\u898B\u3066\u307F\u3088\u3046";
            }
          });
        }
      }
      function finishLesson() {
        const L = cur2.lesson, main = root.querySelector("#mkMain");
        const first = !st.done[L.id];
        st.done[L.id] = 1;
        let chapterClear = false;
        if (first) {
          try {
            Wallet.add("coins", L.coin, "earn:play");
          } catch (e) {
          }
        }
        const ch = CHAPTERS.find((c) => c.lessons && c.lessons.some((l) => l.id === L.id));
        if (!ch.partial && ch.lessons.every((l) => st.done[l.id]) && !st.ch[ch.n]) {
          st.ch[ch.n] = 1;
          chapterClear = true;
          try {
            Wallet.add("coins", ch.coin, "earn:play");
          } catch (e) {
          }
          if (!st.titles.includes(ch.title)) st.titles.push(ch.title);
        }
        save();
        const idx = ch.lessons.findIndex((l) => l.id === L.id), nx = ch.lessons[idx + 1];
        sfxs(chapterClear || L.boss ? "voice/perfect" : "se/newbest");
        if (chapterClear) {
          main.innerHTML = `<div class="mkEnd"><img src="${face("g", "\u559C\u3076")}" alt=""><h2>\u7B2C${ch.n}\u7AE0\u3000\u30AF\u30EA\u30A2\uFF01</h2>
        <div class="mkTitle">\u79F0\u53F7\u300C${esc3(ch.title)}\u300D\u3092\u30B2\u30C3\u30C8\uFF01</div>
        <p>\u30B3\u30A4\u30F3 +${first ? L.coin + ch.coin : ch.coin}
\u30A2\u30D0\u30BF\u30FC\u306E\u30D5\u30EC\u30FC\u30E0\u300C${esc3(ch.frame)}\u300D\u306F\u3001\u4F7F\u3048\u308B\u3088\u3046\u306B\u6E96\u5099\u4E2D\u3067\u3059</p>
        <div class="btns"><button class="mkBtn" id="mkBk">\u7AE0\u306E\u4E00\u89A7\u3078</button></div></div>`;
          main.querySelector("#mkBk").onclick = showList;
          return;
        }
        main.innerHTML = `<div class="mkEnd"><img src="${face("b", "\u559C\u3076")}" style="transform:scaleX(-1)" alt=""><h2>${esc3(L.id)}\u3000\u30AF\u30EA\u30A2\uFF01</h2>
      <p>${first ? `\u30B3\u30A4\u30F3 +${L.coin}` : "\u3082\u3046\u4E00\u5EA6\u3067\u304D\u305F\u306D"}${ch.partial && !nx ? `
\u7B2C${ch.n}\u7AE0\u306E\u7D9A\u304D\uFF08${ch.rest}\uFF09\u306F\u3001\u6E96\u5099\u4E2D\u3067\u3059` : ""}</p>
      <div class="btns">${nx ? `<button class="mkBtn" id="mkNx">\u3064\u304E\u306E\u30EC\u30C3\u30B9\u30F3\uFF08${esc3(nx.id)}\uFF09</button>` : ""}<button class="mkBtn sub" id="mkBk">\u7AE0\u306E\u4E00\u89A7\u3078</button></div></div>`;
        if (nx) main.querySelector("#mkNx").onclick = () => start(nx.id);
        main.querySelector("#mkBk").onclick = showList;
        const bi = root.querySelector("#mkBarI");
        if (bi) bi.style.width = "100%";
      }
      function open() {
        st = load2();
        boardState = null;
        root.hidden = false;
        HOST.onOpen && HOST.onOpen();
        showList();
      }
      function close() {
        root.hidden = true;
        boardState = null;
        cur2 = null;
        HOST.onClose && HOST.onClose();
      }
      function destroy() {
        try {
          root.remove();
        } catch (e) {
        }
        try {
          css.remove();
        } catch (e) {
        }
      }
      return { open, close, visible, destroy, LESSONS: ALL, _st: () => st };
    })();
    return MakeTut;
  }

  // games/chunkchunk/src/story/chunkstory.js
  window.CS_ASSETS = {
    config: {
      useImages: true,
      // false にすると全部「仮アイコン」
      base: "img/chara/",
      // 本体の絵フォルダ。<base><boy|girl>/<表情>.webp を読む
      ext: ".webp",
      storyImages: false,
      // true にすると bg/pic も <storyBase><キー>.<storyExt> から読む
      storyBase: "img/story/",
      storyExt: ".webp",
      picBase: "img/story/",
      picExt: ".svg",
      // 説明の絵（pic_<キー>.svg）。無ければ仮アイコン
      debug: false,
      // true で仮アイコンにキー名を出す
      /* 台本で使う旧表情名 → 本体の7表情。好きに直してOK */
      faceMap: {
        girl: { normal: "normal", komari: "sad", odoroki: "surprise", pokan: "think", hirameki: "idea", doya: "joy" },
        boy: { normal: "normal", ehen: "joy", egao: "joy", ijiwaru: "idea" }
      }
    },
    chara: {
      girl: {
        name: "\u5973\u306E\u5B50",
        color: "#ffc6d9",
        faces: { normal: "\u901A\u5E38", komari: "\u56F0\u308A", odoroki: "\u9A5A\u304D", pokan: "\u307D\u304B\u3093", hirameki: "\u3072\u3089\u3081\u304D", doya: "\u30C9\u30E4\u9854" },
        src: {}
      },
      boy: {
        name: "\u7537\u306E\u5B50",
        color: "#c9e4ff",
        faces: { normal: "\u901A\u5E38", ehen: "\u3048\u3078\u3093", egao: "\u7B11\u9854", ijiwaru: "\u610F\u5730\u60AA\u306A\u7B11\u3044" },
        src: {}
      }
    },
    bg: {
      room: { label: "\u6559\u5BA4\uFF08\u663C\uFF09", color: "linear-gradient(#e8f4ff 0%, #fdf1f6 70%)", src: null }
    },
    pic: {
      scale: { label: "\u5929\u79E4\uFF1A\u5DE6\u306B I\u30FB\u53F3\u306B happy", src: null },
      arrows: { label: "\u2460\u77E2\u5370\u304C\u81EA\u5206\u306B\u623B\u308B \uFF0F \u2461\u77E2\u5370\u304C\u5916\u306B\u4F38\u3073\u308B", src: null },
      run: { label: "\u8D70\u308B", src: null }
    }
  };
  window.CS_STORY = {
    title: "\u82F1\u8A9E\u3063\u3066\u3001\u3069\u3046\u306A\u3063\u3066\u308B\u306E\uFF1F",
    modes: [
      { key: "manual", name: "\u30C1\u30E3\u30F3\u30AF\u3092\u5207\u308B\uFF08\u81EA\u5206\u3067\u9001\u308B\uFF09" },
      { key: "auto", name: "\u30C1\u30E3\u30F3\u30AF\u3092\u5207\u308B\uFF08\u81EA\u52D5\u3067\u6D41\u308C\u308B\uFF09" },
      { key: "free", name: "\u30D5\u30EA\u30FC\u30D7\u30EC\u30A4" }
    ],
    chapters: [
      {
        no: 1,
        title: "\u307E\u305A\u306F\u300C\u4E3B\u5F79\u300D\u3092\u63A2\u305D\u3046",
        sub: "\u30D7\u30ED\u30ED\u30FC\u30B0\u301C\u4E3B\u5F79",
        unlock: "manual",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:komari", r: "boy:normal" },
          { fx: "wall" },
          { say: "girl", f: "komari", t: "\u306F\u3041\u2026\u2026\u82F1\u8A9E\u3063\u3066\u672C\u5F53\u30CB\u30AC\u30C6\u3002\u5358\u8A9E\u304C\u3044\u3063\u3071\u3044\u4E26\u3093\u3067\u308B\u3068\u3001\u3069\u3053\u304B\u3089\u8AAD\u3081\u3070\u3044\u3044\u306E\u304B\u5168\u7136\u5206\u304B\u3093\u306A\u304F\u306A\u3063\u3061\u3083\u3046\u3093\u3060\u3088\u306D\u2026\u3002" },
          { fx: "q", who: "girl" },
          { fx: "clear" },
          { say: "boy", f: "ehen", t: "\u5927\u4E08\u592B\uFF01\u82F1\u8A9E\u3063\u3066\u306D\u3001\u5B9F\u306F\u300E\u666E\u901A\u306A\u3089\u3053\u306E\u9806\u756A\u3067\u8AAC\u660E\u3057\u3066\u3044\u304F\u300F\u3063\u3066\u3044\u3046\u6C7A\u307E\u308A\u304C\u3042\u308B\u3093\u3060\u3002\u8996\u7DDA\u306E\u79FB\u52D5\u30EB\u30FC\u30C8\u304C\u6C7A\u307E\u3063\u3066\u308B\u3068\u601D\u3048\u3070\u3044\u3044\u3088\u3002" },
          { say: "girl", f: "pokan", t: "\u9806\u756A\uFF1F\u30EB\u30FC\u30C8\u304C\u3042\u308B\u306E\uFF1F" },
          { say: "boy", f: "egao", t: "\u3046\u3093\u3002\u82F1\u6587\u3092\u898B\u305F\u3089\u3001\u6700\u521D\u306B\u63A2\u3059\u3082\u306E\u306F\u5FC5\u305A\u3072\u3068\u3064\u3060\u3051\uFF01\u300E\u3053\u306E\u6587\u306E\u4E3B\u5F79\u300F\u3060\u3088\u3002" },
          { fx: "line", id: "a", parts: ["Tom", "plays", "soccer."] },
          { say: "boy", f: "normal", t: "\u305F\u3068\u3048\u3070\u3001\u3053\u306E\u6587\u3002\u3053\u306E\u6587\u306E\u4E3B\u5F79\u306F\u8AB0\u3060\u3068\u601D\u3046\uFF1F" },
          { ask: "a", i: 0, t: "\u4E3B\u5F79\u3060\u3068\u601D\u3046\u3053\u3068\u3070\u3092\u30BF\u30C3\u30D7\u3057\u3066\u307F\u3088\u3046\uFF01", ng: "\u304A\u3057\u3044\uFF01\u300E\u8AB0\u304C\uFF1F\u300F\u3063\u3066\u8003\u3048\u3066\u307F\u3066\u3002" },
          { say: "girl", f: "hirameki", t: "\u3046\u30FC\u3093\u3001Tom \u304B\u306A\uFF1F" },
          { fx: "hl", id: "a", i: 0, c: "glow" },
          { fx: "badge", id: "a", i: 0, t: "\u{1F451} \u4E3B\u5F79" },
          { say: "boy", f: "ehen", t: "\u5927\u6B63\u89E3\uFF01" },
          { say: "boy", f: "normal", t: "\u300E\u8AB0\u304C\uFF1F\u300F\u300E\u4F55\u304C\uFF1F\u300F\u3063\u3066\u8003\u3048\u308B\u3068\u898B\u3064\u3051\u3084\u3059\u3044\u3088\u3002\u6587\u306E\u4E00\u756A\u6700\u521D\u306B\u6765\u308B\u3053\u3068\u304C\u591A\u3044\u3093\u3060\u3002" },
          { say: "girl", f: "komari", t: "\u3067\u3082\u3055\u3001\u3082\u3063\u3068\u9577\u3044\u6587\u3060\u3063\u305F\u3089\u5206\u304B\u3089\u306A\u304F\u306A\u308A\u305D\u3046\u3002" },
          { say: "boy", f: "egao", t: "\u5927\u4E08\u592B\u3002\u305D\u3053\u306B\u3082\u82F1\u8A9E\u306E\u9762\u767D\u3044\u30EB\u30FC\u30EB\u304C\u3042\u308B\u3002\u82F1\u8A9E\u306F\u306D\u3001\u300E\u307E\u305A\u6700\u521D\u306B\u4E3B\u5F79\u3092\u30BA\u30F3\uFF01\u3068\u51FA\u3057\u3066\u304B\u3089\u3001\u3042\u3068\u304B\u3089\u305D\u306E\u4E3B\u5F79\u306B\u3064\u3044\u3066\u8AAC\u660E\u3057\u3066\u3044\u304F\u300F\u3063\u3066\u3044\u3046\u8A00\u8A9E\u306A\u3093\u3060\u3002" },
          { fx: "push", id: "a", i: 0 },
          { say: "boy", f: "egao", t: "\u3058\u3083\u3042\u3055\u3063\u305D\u304F\u3001\u30B2\u30FC\u30E0\u3067\u4E3B\u5F79\u3092\u5207\u308A\u51FA\u3057\u3066\u307F\u3088\u3046\uFF01" }
        ],
        stage: {
          type: "cut",
          mode: "manual",
          title: "\u4E3B\u5F79\u3092\u5207\u308A\u51FA\u305D\u3046",
          coach: {
            start: "\u25B6\u3092\u62BC\u3059\u3068\u3001\u3053\u3068\u3070\u304C1\u3064\u305A\u3064\u9032\u3080\u3088\u3002\u4E3B\u5F79\u304C\u7DDA\u306E\u5DE6\u306B\u6765\u305F\u3089\u300E\u533A\u5207\u308B\u300F\uFF01",
            cut: "\u5207\u308C\u305F\u306D\uFF01\u5207\u3063\u305F\u3068\u3053\u308D\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u5143\u306B\u623B\u305B\u308B\u3088\u3002",
            end: "\u6700\u5F8C\u307E\u3067\u9032\u3093\u3060\u3089\u300E\u304B\u3093\u305B\u3044\u300F\u3092\u62BC\u3057\u3066\u306D\u3002"
          },
          items: [
            { s: "Tom | plays / soccer.", ja: "\u30C8\u30E0\u306F\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3002" },
            { s: "My sister | likes / cats.", ja: "\u308F\u305F\u3057\u306E\u59C9\u306F\u30CD\u30B3\u304C\u597D\u304D\u3002" },
            { s: "The dog | runs / fast.", ja: "\u305D\u306E\u72AC\u306F\u901F\u304F\u8D70\u308B\u3002" }
          ]
        }
      },
      {
        no: 2,
        title: "\u300C\uFF1D\u300D\u306E\u3053\u3068\u3070\u3068\u300C\u3046\u3054\u304D\u300D\u306E\u3053\u3068\u3070",
        sub: "\u4E3B\u5F79\u306E\u3088\u3046\u3059\u3092\u898B\u3064\u3051\u308B",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { say: "boy", f: "normal", t: "\u4E3B\u5F79\u304C\u898B\u3064\u304B\u3063\u305F\u3089\u3001\u6B21\u306F\u3059\u3050\u8FD1\u304F\u306B\u3042\u308B\u300E\u4E3B\u5F79\u306E\u3088\u3046\u3059\u300F\u3092\u63A2\u3057\u3066\u307F\u3088\u3046\u3002\u307E\u305A\u306F\u3088\u304F\u898B\u304B\u3051\u308B is \u3084 am \u304B\u3089\uFF01" },
          { say: "girl", f: "komari", t: "\u3046\u308F\u3042\u3001\u51FA\u305F\u2026\u2026\u3002is \u3068\u304B am \u3068\u304B are \u3063\u3066\u3001\u30B3\u30ED\u30B3\u30ED\u5F62\u304C\u5909\u308F\u308B\u304B\u3089\u5927\u5ACC\u3044\u306A\u3093\u3060\u3088\u306D\u3002\u7D50\u5C40\u3069\u3046\u3044\u3046\u6642\u306B\u4F7F\u3046\u306E\uFF1F" },
          { fx: "pic", key: "scale" },
          { say: "boy", f: "ehen", t: "\u3042\u308C\u306F\u306D\u3001\u300E\u4E3B\u5F79\u304C\u3069\u3093\u306A\u611F\u3058\uFF08\u3069\u3093\u306A\u72B6\u614B\u30FB\u6B63\u4F53\uFF09\uFF1F\u300F\u3092\u8AAC\u660E\u3057\u305F\u3044\u6642\u306B\u4F7F\u3046\u3093\u3060\u3088\uFF01\u30B7\u30F3\u30D7\u30EB\u306B\u300E\uFF1D\uFF08\u30A4\u30B3\u30FC\u30EB\uFF09\u300F\u306E\u30DE\u30FC\u30AF\u3060\u3068\u601D\u3048\u3070\u3044\u3044\u3093\u3060\u3002" },
          { fx: "clear" },
          { fx: "line", id: "a", parts: ["I", "am", "happy."] },
          { fx: "wait", ms: 500 },
          { fx: "morph", id: "a", i: 1, to: "\uFF1D" },
          { say: "girl", f: "odoroki", t: "\u3042\uFF01\u307B\u3093\u3068\u3060\uFF01\u300E\u4E3B\u5F79\u300F\u3068\u300E\u305D\u306E\u6642\u306E\u72B6\u614B\u3084\u6B63\u4F53\u300F\u3092\uFF1D\uFF08\u30A4\u30B3\u30FC\u30EB\uFF09\u3067\u30DA\u30BF\u30C3\u3068\u3064\u306A\u3044\u3067\u308B\u3060\u3051\u3060\uFF01" },
          { say: "boy", f: "egao", t: "\u305D\u3046\uFF01\u5F62\u304C\u5909\u308F\u308B\u306E\u306F\u300E\u4E3B\u5F79\u304C\u8AB0\u304B\u300F\u3067\u7740\u66FF\u3048\u3066\u308B\u3060\u3051\u3060\u304B\u3089\u3001\u96E3\u3057\u304F\u8003\u3048\u306A\u304F\u3066\u5927\u4E08\u592B\u3002" },
          { fx: "clear" },
          { say: "boy", f: "normal", t: "\u300E\u3069\u3093\u306A\u611F\u3058\uFF08\u72B6\u614B\uFF09\u300F\u304C\u5206\u304B\u3063\u305F\u3089\u3001\u3082\u3046\u3072\u3068\u3064\uFF01\u4ECA\u5EA6\u306F\u52D5\u304D\uFF08\u52D5\u4F5C\uFF09\u3092\u8868\u3059\u3084\u3064\u3060\u3088\u3002\u300Edo\u300F\u3063\u3066\u8A00\u8449\u3001\u77E5\u3063\u3066\u308B\u3088\u306D\uFF1F" },
          { say: "girl", f: "normal", t: "\u3046\u3093\u3001do\uFF08\u3084\u308B\u30FB\u3059\u308B\uFF09\u306A\u3089\u77E5\u3063\u3066\u308B\uFF01" },
          { say: "boy", f: "ehen", t: "\u305D\u3046\uFF01\u4E3B\u5F79\u306E\u3059\u3050\u3042\u3068\u306B\u6765\u308B\u3053\u3068\u3070\u306B\u306F\u3001\u3055\u3063\u304D\u306E\u300E\uFF1D\uFF08\u72B6\u614B\uFF09\u300F\u3092\u3064\u304F\u308B\u30B0\u30EB\u30FC\u30D7\u3068\u3001\u3053\u306E do \u307F\u305F\u3044\u306B\u300E\u4E3B\u5F79\u304C\u3069\u3046\u3059\u308B\uFF1F\uFF08\u52D5\u4F5C\uFF09\u300F\u3092\u8868\u3059\u30B0\u30EB\u30FC\u30D7\u306E2\u3064\u304C\u3042\u308B\u3093\u3060\u3002" },
          { fx: "cards", items: [{ en: "I am happy.", jp: "\uFF1D \u72B6\u614B\uFF08\u3069\u3093\u306A\u611F\u3058\uFF1F\uFF09" }, { en: "Tom runs.", jp: "\u3046\u3054\u304D\uFF08\u3069\u3046\u3059\u308B\uFF1F\uFF09", pic: "run" }] },
          { say: "girl", f: "hirameki", t: "\u306A\u308B\u307B\u3069\uFF01\u300E\u3069\u3093\u306A\u611F\u3058\uFF1F\u300F\u306F am/is \u3067\u3001\u300E\u3069\u3046\u3059\u308B\uFF1F\u300F\u306F run/play \u3063\u3066\u3053\u3068\u306D\uFF01" },
          { say: "boy", f: "egao", t: "\u5B8C\u74A7\uFF01 \u4E3B\u5F79\u306E\u6B21\u306F\u3001\u3053\u306E\u3069\u3063\u3061\u304B\u304C\u7D76\u5BFE\u306B\u6765\u308B\u3093\u3060\u3002\u3058\u3083\u3042\u3001\u4E3B\u5F79\u306E\u3042\u3068\u3067\u3082\u5207\u3063\u3066\u307F\u3088\u3046\uFF01" }
        ],
        stage: {
          type: "cut",
          mode: "manual",
          title: "\u4E3B\u5F79 \uFF0B \uFF1D/\u3046\u3054\u304D",
          coach: { start: "\u4E3B\u5F79\u306E\u3042\u3068\u3068\u3001\u300E\uFF1D\u300F\u3084\u300E\u3046\u3054\u304D\u300F\u306E\u3053\u3068\u3070\u306E\u3042\u3068\u3067\u5207\u3063\u3066\u307F\u3088\u3046\uFF01" },
          items: [
            { s: "I | am | happy.", ja: "\u308F\u305F\u3057\u306F\u3046\u308C\u3057\u3044\u3002" },
            { s: "She | is | my friend.", ja: "\u5F7C\u5973\u306F\u308F\u305F\u3057\u306E\u53CB\u3060\u3061\u3002" },
            { s: "Tom | plays | soccer.", ja: "\u30C8\u30E0\u306F\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3002" }
          ]
        }
      },
      {
        no: 3,
        title: "\u300C\u76F8\u624B\u300D\u304C\u6B32\u3057\u304F\u306A\u308B",
        sub: "\u6587\u306E\u571F\u53F0",
        unlock: "auto",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { fx: "line", id: "a", parts: ["She", "smiled."], label: "\u2460" },
          { fx: "line", id: "b", parts: ["She", "met\u2026"], label: "\u2461" },
          { say: "boy", f: "normal", t: "\u3053\u3053\u304B\u3089\u304C\u9762\u767D\u3044\u3068\u3053\u308D\u3002\u3053\u306E2\u3064\u306E\u6587\u3092\u898B\u6BD4\u3079\u3066\u307F\u3066\u3002" },
          { say: "girl", f: "normal", t: "\u3048\u30FC\u3063\u3068\u3001\u2460\u306F\u300E\u5F7C\u5973\u306F\u5FAE\u7B11\u3093\u3060\u300F\u3002\u3046\u3093\u3001\u3053\u308C\u3067\u7D42\u308F\u308A\u3067\u3044\u3044\u3088\u306D\u3002" },
          { fx: "mark", id: "a", t: "\u3007", c: "ok" },
          { say: "girl", f: "komari", t: "\u3067\u3082\u2461\u306E\u300E\u5F7C\u5973\u306F\u4F1A\u3063\u305F\u2026\u300F\u306F\u2026\u2026" },
          { fx: "mark", id: "b", t: "\uFF1F\uFF1F\uFF1F", c: "bad" },
          { say: "girl", f: "odoroki", t: "\u300E\u8AB0\u306B\uFF01\uFF1F\u300F\u3063\u3066\u306A\u308B\uFF01" },
          { say: "boy", f: "ijiwaru", t: "\u3067\u3057\u3087\uFF1F\uFF08\u7B11\uFF09 \u306A\u3093\u304B\u30E2\u30E4\u30E2\u30E4\u3059\u308B\u3088\u306D\u3002" },
          { fx: "clear" },
          { fx: "pic", key: "arrows" },
          { say: "boy", f: "ehen", t: "\u305D\u3053\u304C\u8D85\u91CD\u8981\u306A\u30DD\u30A4\u30F3\u30C8\uFF01\u52D5\u4F5C\uFF08\u3069\u3046\u3059\u308B\uFF1F\uFF09\u306B\u306F\u3001\u300E\u4E3B\u5F79\u3072\u3068\u308A\u3060\u3051\u3067\u8A71\u304C\u7D42\u308F\u308B\u3082\u306E\u300F\u3068\u3001\u300E\u4E3B\u5F79\u304B\u3089\u5916\u306B\u5411\u304B\u3063\u3066\u3001\u76F8\u624B\u304C\u5FC5\u8981\u306A\u3082\u306E\u300F\u306E2\u7A2E\u985E\u304C\u3042\u308B\u3093\u3060\u3002" },
          { fx: "clear" },
          { fx: "line", id: "a", parts: ["She", "met"] },
          { fx: "wait", ms: 400 },
          { fx: "add", id: "a", parts: ["Tom."] },
          { say: "girl", f: "hirameki", t: "\u3042\u3001\u30B9\u30C3\u30AD\u30EA\u3057\u305F\uFF01\u300E\u8AB0\u306B\uFF1F\u300F\u306E\u90E8\u5206\u306B Tom \u304C\u5165\u3063\u305F\uFF01" },
          { fx: "clear" },
          { fx: "line", id: "a", parts: ["Tom", "opened\u2026"] },
          { say: "boy", f: "normal", t: "\u3058\u3083\u3042\u3053\u308C\u306F\u3069\u3046\uFF1F" },
          { say: "girl", f: "odoroki", t: "\u300E\u30C8\u30E0\u306F\u958B\u3051\u305F\u2026\u300F\u2026\u2026\u4F55\u3092\uFF01\uFF1F", big: true },
          { fx: "text", id: "a", i: 1, to: "opened" },
          { fx: "add", id: "a", parts: ["the door."] },
          { say: "boy", f: "egao", t: "\u3060\u3088\u306D\uFF01\uFF08\u7B11\uFF09\u3060\u304B\u3089\u5916\u306B\u5411\u304B\u3046\u52D5\u4F5C\u306E\u3068\u304D\u306F\u3001\u81EA\u7136\u3068\u300E\u76F8\u624B\u300F\u304C\u6B32\u3057\u304F\u306A\u308B\u3093\u3060\u306D\u3002" },
          { fx: "clear" },
          { fx: "pyramid" },
          { say: "boy", f: "ehen", t: "\u3053\u3053\u307E\u3067\u3092\u4E00\u5EA6\u6574\u7406\u3057\u3088\u3046\u3002\u82F1\u8A9E\u306E\u6587\u306E\u300E\u4E00\u756A\u5927\u4E8B\u306A\u4E2D\u5FC3\u300F\u306F\u3053\u308C\u3060\u3051\uFF01\u3069\u308C\u3060\u3051\u9577\u3044\u82F1\u6587\u3067\u3082\u3001\u307E\u305A\u306F\u3053\u306E\u571F\u53F0\uFF08\u4E2D\u5FC3\uFF09\u3092\u898B\u3064\u3051\u308C\u3070\u52DD\u3061\uFF01" },
          { fx: "pfill", step: 3, t: "happy\uFF08\u3069\u3093\u306A\u611F\u3058\uFF1F\uFF09" },
          { fx: "wait", ms: 500 },
          { fx: "pfill", step: 3, t: "the door\uFF08\u76F8\u624B\uFF09" },
          { say: "girl", f: "hirameki", t: "\u3042\u308C\uFF1F \u899A\u3048\u308B\u3053\u3068\u3001\u610F\u5916\u3068\u5C11\u306A\u3044\u306D\uFF01" },
          { say: "boy", f: "egao", t: "\u3053\u3053\u304B\u3089\u306F\u3001\u30B2\u30FC\u30E0\u3068\u540C\u3058\u753B\u9762\u3067\u5207\u3063\u3066\u307F\u3088\u3046\u3002\u571F\u53F0\u306E3\u3064\u3060\u3088\uFF01" }
        ],
        stage: {
          type: "cut",
          mode: "auto",
          speed: 1700,
          title: "\u571F\u53F0\u3067\u5207\u308D\u3046",
          coach: { start: "\u571F\u53F0\u306E3\u3064\uFF08\u4E3B\u5F79\u30FB\u3046\u3054\u304D\u30FB\u76F8\u624B\uFF09\u3067\u5207\u3063\u3066\u307F\u3088\u3046\uFF01" },
          items: [
            { s: "She | met | Tom.", ja: "\u5F7C\u5973\u306F\u30C8\u30E0\u306B\u4F1A\u3063\u305F\u3002" },
            { s: "Tom | opened | the door.", ja: "\u30C8\u30E0\u306F\u30C9\u30A2\u3092\u958B\u3051\u305F\u3002" },
            { s: "My mother | makes | lunch.", ja: "\u6BCD\u306F\u663C\u3054\u306F\u3093\u3092\u4F5C\u308B\u3002" }
          ]
        }
      },
      {
        no: 4,
        title: "\u4E2D\u5FC3\u306E\u9806\u756A\u306F\u30B7\u30E3\u30C3\u30D5\u30EB\u7981\u6B62\uFF01",
        sub: "\u4E26\u3079\u308B\u9806\u756A\u3067\u5F79\u5272\u304C\u6C7A\u307E\u308B",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { fx: "line", id: "a", parts: ["She", "likes", "music."] },
          { say: "boy", f: "normal", t: "\u305F\u3060\u3057\u3001\u3072\u3068\u3064\u3060\u3051\u7D76\u5BFE\u5B88\u3089\u306A\u304D\u3083\u3044\u3051\u306A\u3044\u30EB\u30FC\u30EB\u304C\u3042\u308B\u3002\u3053\u306E\u300E\u4E2D\u5FC3\u306E\u9806\u756A\u300F\u306F\u5909\u3048\u3061\u3083\u30C0\u30E1\u306A\u3093\u3060\u3002" },
          { fx: "reorder", id: "a", order: [2, 1, 0], texts: ["she.", "likes", "Music"] },
          { say: "girl", f: "odoroki", t: "\u3053\u308C\u3092\u4F8B\u3048\u3070\u2026\u2026 Music likes she. \u306B\u3057\u305F\u3089\uFF1F" },
          { fx: "hl", id: "a", i: 1, c: "x" },
          { say: "boy", f: "ijiwaru", t: "\u30C0\u30E1\uFF01\u300E\u97F3\u697D\u304C\u5F7C\u5973\u3092\u597D\u304D\u300F\u3063\u3066\u3044\u3046\u610F\u5473\u4E0D\u660E\u306A\u6587\u306B\u306A\u3063\u3061\u3083\u3046\uFF08\u7B11\uFF09\u3002\u82F1\u8A9E\u306F\u4E26\u3079\u308B\u9806\u756A\u3067\u5F79\u5272\u304C\u6C7A\u307E\u308B\u8A00\u8A9E\u3060\u304B\u3089\u3001\u571F\u53F0\u306E\u9806\u756A\u306F\u30B7\u30E3\u30C3\u30D5\u30EB\u7981\u6B62\uFF01" },
          { fx: "unhl", id: "a", i: 1, c: "x" },
          { fx: "reorder", id: "a", order: [0, 1, 2], texts: ["She", "likes", "music."] },
          { say: "boy", f: "egao", t: "\u3058\u3083\u3042\u3001\u30D0\u30E9\u30D0\u30E9\u306B\u306A\u3063\u305F\u30AB\u30FC\u30C9\u3092\u6B63\u3057\u3044\u9806\u756A\u306B\u623B\u3057\u3066\u307F\u3088\u3046\uFF01" }
        ],
        stage: {
          type: "order",
          title: "\u9806\u756A\u306B\u4E26\u3079\u3088\u3046",
          coach: { start: "\u30AB\u30FC\u30C9\u3092\u3001\u82F1\u8A9E\u306E\u9806\u756A\u306B\u306A\u308B\u3088\u3046\u306B\u30BF\u30C3\u30D7\u3057\u3066\u3044\u3053\u3046\u3002\u307E\u3061\u304C\u3048\u305F\u3089\u4E26\u3079\u305F\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3067\u623B\u305B\u308B\u3088\u3002" },
          items: [
            { parts: ["She", "likes", "music."], ja: "\u5F7C\u5973\u306F\u97F3\u697D\u304C\u597D\u304D\u3002" },
            { parts: ["Tom", "opened", "the door."], ja: "\u30C8\u30E0\u306F\u30C9\u30A2\u3092\u958B\u3051\u305F\u3002" },
            { parts: ["My dog", "is", "cute."], ja: "\u3046\u3061\u306E\u72AC\u306F\u304B\u308F\u3044\u3044\u3002" }
          ]
        }
      },
      {
        no: 5,
        title: "\u304A\u307E\u3051\u306E\u60C5\u5831\u306F\u52D5\u304B\u305B\u308B",
        sub: "\u3044\u3064\u30FB\u3069\u3053\u3067 \u306E\u30BF\u30B0",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { fx: "line", id: "a", parts: ["She", "plays", "tennis", "at school", "after class."] },
          { say: "boy", f: "normal", t: "\u3067\u3082\u3001\u5B9F\u969B\u306E\u82F1\u8A9E\u306B\u306F\u5F8C\u308D\u306B\u8272\u3093\u306A\u8A00\u8449\u304C\u304F\u3063\u3064\u3044\u3066\u308B\u3088\u306D\u3002\u3067\u3082\u4E2D\u5FC3\u306F She plays tennis.\uFF08\u571F\u53F0\uFF09\u3060\u3051\uFF01" },
          { fx: "hl", id: "a", i: [0, 1, 2], c: "glow" },
          { fx: "hl", id: "a", i: [3, 4], c: "tag" },
          { say: "boy", f: "ehen", t: "\u5F8C\u308D\u306B\u3064\u3044\u3066\u308B\u8A00\u8449\u306F\u3001\u5168\u90E8\u300E\u304A\u307E\u3051\u306E\u60C5\u5831\uFF08\u98FE\u308A\uFF09\u300F\uFF01\u300E\u3044\u3064\u300F\u300E\u3069\u3053\u3067\u300F\u307F\u305F\u3044\u306A\u98FE\u308A\u306F\u3001\u5B9F\u306F\u524D\u306B\u6301\u3063\u3066\u3044\u3063\u305F\u308A\u3082\u3067\u304D\u308B\u3093\u3060\u3002" },
          { fx: "reorder", id: "a", order: [4, 0, 1, 2, 3], texts: ["she", "plays", "tennis", "at school.", "After class,"] },
          { say: "girl", f: "hirameki", t: "\u307B\u3093\u3068\u3060\uFF01\u571F\u53F0\u306F\u30AC\u30C1\u30AC\u30C1\u3060\u3051\u3069\u3001\u304A\u307E\u3051\u306E\u30BF\u30B0\u306F\u524D\u3084\u5F8C\u308D\u306B\u52D5\u304B\u305B\u308B\u3093\u3060\uFF01" },
          { say: "boy", f: "egao", t: "\u304A\u307E\u3051\u306E\u30BF\u30B0\u30821\u3064\u306E\u304B\u305F\u307E\u308A\u3002\u30B2\u30FC\u30E0\u3067\u3082\u3072\u3068\u307E\u3068\u307E\u308A\u3067\u5207\u3063\u3066\u306D\uFF01" }
        ],
        stage: {
          type: "cut",
          mode: "auto",
          speed: 1600,
          title: "\u304A\u307E\u3051\u30BF\u30B0\u3082\u5207\u308D\u3046",
          coach: { start: "\u30BF\u30B0\uFF08\u3044\u3064\u30FB\u3069\u3053\u3067\uFF09\u306E\u524D\u3067\u533A\u5207\u3063\u3066\u307F\u3088\u3046\uFF01\u30BF\u30B0\u4EE5\u5916\u306F\u3001\u5207\u3063\u3066\u3082\u5207\u3089\u306A\u304F\u3066\u3082OK\u3002\u8FF7\u3063\u305F\u3089\u300C\u30D2\u30F3\u30C8\u300D\u3002" },
          items: [
            { s: "She / plays / tennis | at school / after class.", ja: "\u5F7C\u5973\u306F\u653E\u8AB2\u5F8C\u3001\u5B66\u6821\u3067\u30C6\u30CB\u30B9\u3092\u3059\u308B\u3002" },
            { s: "After lunch, | we / play / soccer | in the park.", ja: "\u663C\u3054\u306F\u3093\u306E\u3042\u3068\u3001\u308F\u305F\u3057\u305F\u3061\u306F\u516C\u5712\u3067\u30B5\u30C3\u30AB\u30FC\u3092\u3059\u308B\u3002" },
            { s: "I / get up | at seven / every day.", ja: "\u308F\u305F\u3057\u306F\u6BCE\u65E57\u6642\u306B\u8D77\u304D\u308B\u3002" }
          ]
        }
      },
      {
        no: 6,
        title: "\u9014\u4E2D\u3067\u4EBA\u304C\u51FA\u3066\u304D\u3066\u3082\u9A19\u3055\u308C\u308B\u306A\uFF01",
        sub: "\u4E3B\u5F79\u306E\u8AAC\u660E\u30B7\u30FC\u30EB",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { fx: "line", id: "a", parts: ["The book", "I", "bought yesterday", "is", "fun."] },
          { say: "boy", f: "normal", t: "\u305D\u3057\u3066\u3082\u3046\u3072\u3068\u3064\uFF01\u4E3B\u5F79\u81EA\u4F53\u306B\u3082\u3001\u5F8C\u308D\u304B\u3089\u300E\u9577\u3044\u8AAC\u660E\u30B7\u30FC\u30EB\u300F\u3092\u30DA\u30BF\u30C3\u3068\u8CBC\u308C\u308B\u3093\u3060\u3002" },
          { say: "girl", f: "komari", t: "\u2026\u2026\u3042\uFF01 \u3061\u3087\u3063\u3068\u5F85\u3063\u3066\uFF01" },
          { fx: "hl", id: "a", i: 1, c: "big" },
          { say: "girl", f: "hirameki", t: "The book I bought yesterday is fun. \u3063\u3066\u3001\u9014\u4E2D\u3067 I\uFF08\u79C1\uFF09\u304C\u51FA\u3066\u304F\u308B\u3058\u3083\u3093\uFF01\u3053\u308C\u3001\u4E3B\u5F79\u306F I \u306B\u4EA4\u4EE3\u3057\u305F\u3063\u3066\u3053\u3068\uFF01\uFF1F" },
          { fx: "hl", id: "a", i: 1, c: "x" },
          { say: "boy", f: "ijiwaru", t: "\u5F15\u3063\u304B\u304B\u3063\u305F\u306D\uFF01\uFF08\u7B11\uFF09 \u305D\u3053\u3001\u307F\u3093\u306A\u304C\u4E00\u756A\u8FF7\u3046\u7F60\u306A\u3093\u3060\uFF01" },
          { fx: "unhl", id: "a", i: 1, c: "big" },
          { fx: "unhl", id: "a", i: 1, c: "x" },
          { fx: "badge", id: "a", i: 0, t: "\u2605\u4E3B\u5F79", c: "gold" },
          { fx: "merge", id: "a", from: 1, to: 2, c: "sticker" },
          { say: "boy", f: "ehen", t: "\u4E3B\u5F79\u306F\u3042\u304F\u307E\u3067\u6700\u521D\u306B\u51FA\u3066\u304D\u305F The book\uFF08\u672C\uFF09\uFF01 I bought yesterday\uFF08\u79C1\u304C\u6628\u65E5\u8CB7\u3063\u305F\uFF09\u306F\u3001\u4E3B\u5F79\u306B\u8CBC\u3089\u308C\u305F\u8AAC\u660E\u30B7\u30FC\u30EB\u306A\u3093\u3060\u3002\u672C\u7269\u306E\u300E\u3069\u3046\u3057\u3066\u308B\uFF1F\u300F\u306F\u3001\u30B7\u30FC\u30EB\u306E\u3042\u3068\u306E is \u3060\u3088\uFF01" },
          { fx: "hl", id: "a", i: 3, c: "glow" },
          { fx: "morph", id: "a", i: 3, to: "\uFF1D" },
          { say: "girl", f: "hirameki", t: "\u306A\u308B\u307B\u3069\u2026\u2026\uFF01 \u30B7\u30FC\u30EB\u306E\u4E2D\u306B I \u304C\u898B\u3048\u3066\u3082\u7126\u3063\u3061\u3083\u30C0\u30E1\u306A\u3093\u3060\u306D\u3002\u300E\u672C\u7269\u306E\u3069\u3046\u3057\u3066\u308B\uFF1F\u306F\u3001\u30B7\u30FC\u30EB\u306E\u3042\u3068\uFF01\u300F\u3063\u3066\u899A\u3048\u3066\u304A\u3051\u3070\u3044\u3044\u3093\u3060\uFF01" },
          { say: "boy", f: "egao", t: "\u30B7\u30FC\u30EB\u4ED8\u304D\u306E\u4E3B\u5F79\u306F\u3001\u307E\u308B\u3054\u30681\u3064\u306E\u304B\u305F\u307E\u308A\u3002\u30B2\u30FC\u30E0\u3067\u78BA\u304B\u3081\u3066\u307F\u3088\u3046\uFF01" }
        ],
        stage: {
          type: "cut",
          mode: "auto",
          speed: 1500,
          title: "\u30B7\u30FC\u30EB\u3054\u3068\u4E3B\u5F79",
          coach: { start: "\u4E3B\u5F79\u306B\u30B7\u30FC\u30EB\u304C\u4ED8\u3044\u3066\u308B\u3088\u3002\u300E\u3069\u3046\u3057\u3066\u308B\uFF1F\u300F\u306E\u524D\u3067\u533A\u5207\u308D\u3046\uFF01\u30B7\u30FC\u30EB\u306E\u4E2D\u306F\u5207\u3089\u306A\u3044\u3067\u306D\u3002\u8FF7\u3063\u305F\u3089\u300C\u30D2\u30F3\u30C8\u300D\u3002" },
          items: [
            { s: "The book / I bought yesterday | is / fun.", ja: "\u6628\u65E5\u8CB7\u3063\u305F\u672C\u306F\u304A\u3082\u3057\u308D\u3044\u3002" },
            { s: "The girl / with long hair | is / my sister.", ja: "\u9AEA\u306E\u9577\u3044\u5973\u306E\u5B50\u306F\u308F\u305F\u3057\u306E\u59C9\u3060\u3002" },
            { s: "The man / I met | lives / in Tokyo.", ja: "\u308F\u305F\u3057\u304C\u4F1A\u3063\u305F\u7537\u306E\u4EBA\u306F\u6771\u4EAC\u306B\u4F4F\u3093\u3067\u3044\u308B\u3002" }
          ]
        }
      },
      {
        no: 7,
        title: "\u5168\u4F53\u306E\u30DE\u30C3\u30D7",
        sub: "\u30A8\u30F3\u30C7\u30A3\u30F3\u30B0",
        unlock: "free",
        steps: [
          { fx: "bg", key: "room" },
          { fx: "show", l: "girl:normal", r: "boy:normal" },
          { fx: "amap" },
          { say: "boy", f: "egao", t: "\u3060\u304B\u3089\u3001\u9577\u3044\u82F1\u6587\u306E\u6B63\u4F53\u3092\u89E3\u5256\u3059\u308B\u3068\u3001\u5168\u4F53\u56F3\u306F\u3053\u3046\u306A\u3063\u3066\u308B\u3093\u3060\uFF01\u82F1\u6587\u3092\u898B\u305F\u3089\u3001\u3053\u306E4\u30B9\u30C6\u30C3\u30D7\u3067\u30C1\u30A7\u30C3\u30AF\u3057\u3066\u3044\u3053\u3046\uFF01" },
          { say: "girl", f: "doya", t: "\u3069\u308C\u3060\u3051\u9577\u3044\u6587\u304C\u51FA\u3066\u304D\u3066\u3082\u3001\u3084\u3063\u3066\u308B\u69CB\u9020\u306F\u5168\u90E8\u3053\u308C\u3068\u540C\u3058\u306A\u3093\u3060\u306D\uFF01\u3082\u3046\u5358\u8A9E\u306E\u4E26\u3073\u306B\u30D3\u30D3\u3089\u306A\u3044\u3067\u3001\u4E2D\u5FC3\u306E\u571F\u53F0\u304B\u3089\u63A2\u3057\u306B\u3044\u304F\u3088\uFF01" },
          { say: "boy", f: "egao", t: "\u305D\u306E\u610F\u6C17\uFF01\u3058\u3083\u3042\u5B9F\u969B\u306B\u3001\u30B2\u30FC\u30E0\u306E\u30D1\u30BA\u30EB\u3067\u8A66\u3057\u3066\u307F\u3088\u3046\u304B\uFF01" },
          { fx: "flash" }
        ],
        stage: {
          type: "cut",
          mode: "auto",
          speed: 1500,
          title: "\u7DCF\u307E\u3068\u3081",
          coach: { start: "\u3053\u3053\u307E\u3067\u306E\u5168\u90E8\u3092\u3064\u304B\u3063\u3066\u5207\u3063\u3066\u307F\u3088\u3046\uFF01" },
          items: [
            { s: "My brother | is | a good cook.", ja: "\u5144\u306F\u6599\u7406\u304C\u3058\u3087\u3046\u305A\u3060\u3002" },
            { s: "After school, | Ken | opened | the box | in his room.", ja: "\u653E\u8AB2\u5F8C\u3001\u30B1\u30F3\u306F\u81EA\u5206\u306E\u90E8\u5C4B\u3067\u7BB1\u3092\u958B\u3051\u305F\u3002" },
            { s: "The cake / my mother made | was | delicious.", ja: "\u6BCD\u304C\u4F5C\u3063\u305F\u30B1\u30FC\u30AD\u306F\u304A\u3044\u3057\u304B\u3063\u305F\u3002" }
          ]
        }
      }
    ]
  };
  function splitSay(t) {
    const ss = [];
    let cur2 = "", d = 0;
    for (const c of t) {
      cur2 += c;
      if ("\u300E\u300C\uFF08(".includes(c)) d++;
      else if ("\u300F\u300D\uFF09)".includes(c)) d = Math.max(0, d - 1);
      else if ("\u3002\uFF01\uFF1F!?".includes(c) && !d) {
        ss.push(cur2);
        cur2 = "";
      }
    }
    if (cur2.trim()) ss.push(cur2);
    const out = [];
    let acc = "";
    for (const x of ss) {
      if (!acc) acc = x;
      else if (acc.length + x.length <= 24) acc += x;
      else {
        out.push(acc);
        acc = x;
      }
    }
    if (acc) out.push(acc);
    return out;
  }
  window.CS_STORY.chapters.forEach((ch) => {
    const n = [];
    ch.steps.forEach((st) => {
      if (st.say && st.t) {
        splitSay(st.t).forEach((t) => n.push({ ...st, t }));
      } else n.push(st);
    });
    ch.steps = n;
  });
  (function() {
    "use strict";
    const A = window.CS_ASSETS, S2 = window.CS_STORY;
    const P = (s) => String(s || "").split(/\s+/).filter(Boolean).map((t) => t.startsWith("cs-") ? t : "cs-" + t).join(" ");
    const el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = P(cls);
      if (html != null) e.innerHTML = html;
      return e;
    };
    const esc3 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let root, opts = {}, app2;
    let STORE_KEY = "chunkStory.v1";
    function load2() {
      if (opts.load) return opts.load() || {};
      try {
        return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      } catch (e) {
        return {};
      }
    }
    function save(p) {
      if (opts.save) return opts.save(p);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(p));
      } catch (e) {
      }
    }
    let prog = { cleared: {}, unlocked: {} };
    function srcFor(own, key) {
      if (own) return own;
      return null;
    }
    function faceKey(who, face) {
      const m = A.config.faceMap && A.config.faceMap[who] || {};
      return m[face] || face;
    }
    function charaSrc(who, face) {
      const c = A.chara[who];
      if (c.src && c.src[face]) return c.src[face];
      if (!A.config.useImages) return null;
      return A.config.base + who + "/" + faceKey(who, face) + A.config.ext;
    }
    function storySrc(own, key) {
      if (own) return own;
      return A.config.storyImages ? A.config.storyBase + key + A.config.storyExt : null;
    }
    function withFallback(src, makePh) {
      const ph = makePh();
      if (!src) return ph;
      const img = el("img");
      img.alt = "";
      img.src = src;
      img.onerror = () => img.replaceWith(ph);
      return img;
    }
    function charaNode(who, face) {
      const c = A.chara[who];
      const key = who + "_" + face;
      return withFallback(charaSrc(who, face), () => {
        const p = el("div", "ph");
        p.style.setProperty("--c", c.color);
        p.innerHTML = `<div class="cs-head">${esc3(c.faces[face] || face)}</div><b>${esc3(c.name)}</b>${A.config.debug ? `<code>${key}</code>` : ""}`;
        return p;
      });
    }
    function picNode(k) {
      const p = A.pic[k] || { label: k };
      const key = "pic_" + k;
      return withFallback(p.src || (A.config.picBase ? A.config.picBase + key + A.config.picExt : storySrc(p.src, key)), () => {
        const d = el("div", "ph");
        d.style.setProperty("--c", "#fff7d6");
        d.innerHTML = `<b>\u7D75</b><span style="font-size:12px;line-height:1.5">${esc3(p.label)}</span>${A.config.debug ? `<code>${key}</code>` : ""}`;
        return d;
      });
    }
    function setBg(layer, k) {
      const b = A.bg[k] || {};
      const key = "bg_" + k;
      const src = storySrc(b.src, key);
      layer.innerHTML = "";
      layer.style.background = b.color || "var(--bg)";
      if (src) {
        const im = new Image();
        im.onload = () => {
          layer.style.background = `center/cover url("${src}")`;
        };
        im.src = src;
      }
      if (A.config.debug) layer.appendChild(el("span", "bgname", esc3((b.label || k) + " / " + key)));
    }
    function screen(cls) {
      app2.innerHTML = "";
      const s = el("section", "cs-screen " + cls);
      app2.appendChild(s);
      return s;
    }
    function isOpen(no) {
      return no === 1 || !!prog.cleared[no - 1];
    }
    function openMap() {
      const s = screen("map");
      s.innerHTML = `<h1>${esc3(S2.title)}</h1>
    <p class="cs-lead">\u304A\u8A71\u3092\u805E\u3044\u3066\u3001\u3059\u3050\u30B2\u30FC\u30E0\u3067\u8A66\u3059\u3002\u7AE0\u3092\u30AF\u30EA\u30A2\u3059\u308B\u3068\u3001\u3042\u305D\u3079\u308B\u30E2\u30FC\u30C9\u304C\u5897\u3048\u3066\u3044\u304F\u3088\u3002</p>`;
      const un = el("div", "unlocks");
      S2.modes.forEach((m) => un.appendChild(el("span", prog.unlocked[m.key] ? "on" : "", esc3((prog.unlocked[m.key] ? "" : "\u{1F512} ") + m.name))));
      s.appendChild(un);
      const list = el("div", "chs");
      S2.chapters.forEach((ch) => {
        const open = isOpen(ch.no), done = !!prog.cleared[ch.no];
        const row = el("div", "ch" + (done ? " done" : "") + (open ? "" : " lock"));
        const mode = ch.unlock && S2.modes.find((m) => m.key === ch.unlock);
        row.innerHTML = `<div class="cs-no">${ch.no}</div>
      <div class="cs-tt">${esc3(ch.title)}<small>${esc3(ch.sub || "")}${done ? " \u30FB \u30AF\u30EA\u30A2" : ""}</small></div>`;
        const bt = el("div", "bt");
        const b1 = el("button", "pill", done ? "\u3082\u3046\u4E00\u5EA6\u898B\u308B" : "\u306F\u3058\u3081\u308B");
        b1.disabled = !open;
        b1.onclick = (e) => {
          e.stopPropagation();
          playChapter(ch.no);
        };
        if (open) {
          row.onclick = () => playChapter(ch.no);
          row.style.cursor = "pointer";
        }
        const b2 = el("button", "pill sub", "\u30B2\u30FC\u30E0\u3060\u3051");
        b2.disabled = !done;
        b2.onclick = (e) => {
          e.stopPropagation();
          runStage(ch);
        };
        bt.append(b1, b2);
        if (mode) bt.appendChild(el("span", "tag-unlock", "\u30AF\u30EA\u30A2\u3067\u300C" + esc3(mode.name) + "\u300D"));
        row.appendChild(bt);
        list.appendChild(row);
      });
      s.appendChild(list);
      if (opts.showReset || opts.onExit) {
        const dev = el("div", "devnote");
        if (opts.showReset) {
          const rb = el("button", "pill sub", "\u9032\u307F\u3092\u30EA\u30BB\u30C3\u30C8");
          rb.onclick = () => {
            if (rb.dataset.sure) {
              prog = { cleared: {}, unlocked: {} };
              save(prog);
              openMap();
            } else {
              rb.dataset.sure = 1;
              rb.textContent = "\u672C\u5F53\u306B\u30EA\u30BB\u30C3\u30C8\u3059\u308B\uFF1F\uFF08\u3082\u3046\u4E00\u5EA6\u62BC\u3059\uFF09";
            }
          };
          dev.appendChild(rb);
        }
        if (opts.onExit) {
          const xb = el("button", "pill sub", opts.exitLabel || "\u3082\u3069\u308B");
          xb.style.marginLeft = "8px";
          xb.onclick = () => opts.onExit();
          dev.appendChild(xb);
        }
        s.appendChild(dev);
      }
    }
    let adv = null, curFrame = null;
    function playChapter(no) {
      const ch = S2.chapters.find((c) => c.no === no);
      if (!ch) return;
      const s = screen("adv");
      adv = { ch, lines: {}, skip: false, log: [], resolve: null, chars: {} };
      s.innerHTML = `<div class="cs-bgl"></div>
    <div class="cs-top"><span class="cs-chname">\u7B2C${ch.no}\u7AE0 ${esc3(ch.title)}</span>
      <button data-a="log">\u30ED\u30B0</button><button data-a="skip">\u30B9\u30AD\u30C3\u30D7</button></div>
    <div class="cs-board"></div>
    <div class="cs-chars"><div class="cs-chr cs-l cs-hide"></div><div class="cs-chr cs-r cs-hide"></div></div>
    <div class="cs-tbox"><span class="cs-nm"></span><div class="cs-tx"></div><span class="cs-nx" hidden>\u25BC</span></div>`;
      adv.s = s;
      adv.bgl = s.querySelector(".cs-bgl");
      adv.board = s.querySelector(".cs-board");
      adv.tbox = s.querySelector(".cs-tbox");
      adv.nm = s.querySelector(".cs-nm");
      adv.tx = s.querySelector(".cs-tx");
      adv.nx = s.querySelector(".cs-nx");
      adv.slot = { l: s.querySelector(".cs-chr.cs-l"), r: s.querySelector(".cs-chr.cs-r") };
      adv.tbox.onclick = () => adv.resolve && adv.resolve("tap");
      s.querySelector('[data-a="skip"]').onclick = (e) => {
        e.stopPropagation();
        adv.skip = true;
        adv.resolve && adv.resolve("skip");
      };
      s.querySelector('[data-a="log"]').onclick = (e) => {
        e.stopPropagation();
        showLog();
      };
      run(ch);
    }
    async function run(ch) {
      const me = adv;
      for (const st of ch.steps) {
        if (me.skip || adv !== me) break;
        if (st.say) await say(st);
        else if (st.ask != null) await ask2(st);
        else if (st.fx && FX[st.fx]) await FX[st.fx](st);
      }
      if (adv !== me) return;
      runStage(ch);
    }
    function waitTap() {
      return new Promise((r) => {
        if (adv.skip) return r("skip");
        adv.resolve = (v) => {
          adv.resolve = null;
          r(v);
        };
      });
    }
    function slotOf(who) {
      return adv.chars[who];
    }
    function setFace(who, face) {
      const slot = slotOf(who);
      if (!slot) return;
      if (slot.dataset.face === face) return;
      slot.dataset.face = face;
      const q = slot.querySelector(".cs-q");
      slot.innerHTML = "";
      slot.appendChild(charaNode(who, face));
      if (q) slot.appendChild(q);
    }
    async function say(st) {
      const c = A.chara[st.say];
      if (st.f) setFace(st.say, st.f);
      Object.entries(adv.chars).forEach(([w, sl2]) => sl2.classList.toggle("cs-off", w !== st.say));
      const sl = slotOf(st.say);
      if (sl) {
        sl.classList.remove("cs-bump");
        void sl.offsetWidth;
        sl.classList.add("cs-bump");
      }
      adv.nm.textContent = c ? c.name : "";
      adv.nm.style.setProperty("--c", c ? c.color : "var(--lemon)");
      adv.tbox.classList.remove("cs-ask");
      adv.tbox.classList.toggle("cs-big", !!st.big);
      adv.log.push({ who: c ? c.name : "", t: st.t });
      await type(st.t);
      adv.nx.hidden = false;
      await waitTap();
      adv.nx.hidden = true;
      adv.tbox.classList.remove("cs-big");
    }
    async function type(text) {
      adv.tx.textContent = "";
      let done = false, i = 0;
      const p = waitTap().then(() => {
        done = true;
      });
      while (!done && i < text.length && !adv.skip) {
        adv.tx.textContent += text[i++];
        await sleep(26);
      }
      adv.tx.textContent = text;
      if (!done && adv.resolve) {
        adv.resolve = null;
      }
    }
    async function ask2(st) {
      const line = adv.lines[st.ask];
      if (!line) return;
      Object.values(adv.chars).forEach((sl) => sl.classList.add("cs-off"));
      adv.nm.textContent = "";
      adv.tbox.classList.add("cs-ask");
      adv.tx.textContent = st.t;
      const tok = line.tokens[st.i];
      line.tokens.forEach((t) => {
        t.classList.add("cs-tapme");
        t.tabIndex = 0;
      });
      await new Promise((res) => {
        line.tokens.forEach((t, k) => {
          t.onclick = (e) => {
            e.stopPropagation();
            if (t === tok) {
              res();
              return;
            }
            t.classList.remove("cs-wrong");
            void t.offsetWidth;
            t.classList.add("cs-wrong");
            adv.tx.textContent = st.ng || "\u3082\u3046\u4E00\u56DE\uFF01";
          };
          t.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") t.onclick(e);
          };
        });
        adv.resolve = (v) => {
          if (v === "skip") {
            adv.resolve = null;
            res();
          }
        };
      });
      line.tokens.forEach((t) => {
        t.classList.remove("cs-tapme");
        t.onclick = null;
        t.onkeydown = null;
        t.removeAttribute("tabindex");
      });
      adv.tbox.classList.remove("cs-ask");
    }
    function showLog() {
      const o = el("div", "log");
      const inn = el("div", "in");
      inn.innerHTML = adv.log.map((l) => `<p><b>${esc3(l.who)}</b>${esc3(l.t)}</p>`).join("") || "<p>\u307E\u3060\u30BB\u30EA\u30D5\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>";
      o.appendChild(inn);
      o.onclick = () => o.remove();
      adv.s.appendChild(o);
      inn.scrollTop = inn.scrollHeight;
    }
    const idx = (i) => Array.isArray(i) ? i : [i];
    function mkTok(text) {
      const t = el("span", "tok");
      t.appendChild(el("span", "t", esc3(text)));
      return t;
    }
    const FX = {
      bg: (st) => setBg(adv.bgl, st.key),
      show: (st) => {
        adv.chars = {};
        ["l", "r"].forEach((side) => {
          const slot = adv.slot[side];
          slot.innerHTML = "";
          delete slot.dataset.face;
          if (!st[side]) {
            slot.classList.add("cs-hide");
            return;
          }
          const [who, face] = st[side].split(":");
          adv.chars[who] = slot;
          slot.classList.remove("cs-hide");
          setFace(who, face || "normal");
        });
      },
      clear: async () => {
        const kids = [...adv.board.children];
        kids.forEach((k) => k.classList.add("cs-fade"));
        await sleep(kids.length ? 330 : 0);
        adv.board.innerHTML = "";
        adv.lines = {};
      },
      wait: (st) => sleep(st.ms || 400),
      wall: () => {
        const w = el("div", "wall");
        w.textContent = "When the students who had been waiting outside the library since early in the morning finally heard that the new books they had ordered last month would not arrive until the end of the week, most of them decided to go back to their classrooms, although a few stayed because they wanted to ask the librarian whether the old copies could be borrowed instead while they were waiting for the new ones that everyone had been talking about.";
        adv.board.appendChild(w);
      },
      q: (st) => {
        const sl = slotOf(st.who);
        if (!sl) return;
        const q = el("span", "q", "\uFF1F");
        sl.appendChild(q);
        setTimeout(() => q.remove(), 2700);
      },
      line: (st) => {
        const ln = el("div", "ln");
        if (st.label) ln.appendChild(el("span", "lab", esc3(st.label)));
        const tokens = st.parts.map((p) => {
          const t = mkTok(p);
          ln.appendChild(t);
          return t;
        });
        adv.board.appendChild(ln);
        adv.lines[st.id] = { el: ln, tokens };
      },
      add: (st) => {
        const L = adv.lines[st.id];
        if (!L) return;
        st.parts.forEach((p) => {
          const t = mkTok(p);
          t.classList.add("cs-new");
          L.el.appendChild(t);
          L.tokens.push(t);
        });
      },
      text: (st) => {
        const t = adv.lines[st.id]?.tokens[st.i];
        if (t) t.querySelector(".cs-t").textContent = st.to;
      },
      hl: (st) => {
        const L = adv.lines[st.id];
        if (L) idx(st.i).forEach((i) => L.tokens[i] && L.tokens[i].classList.add(P(st.c || "cs-glow")));
      },
      unhl: (st) => {
        const L = adv.lines[st.id];
        if (L) idx(st.i).forEach((i) => L.tokens[i] && L.tokens[i].classList.remove(P(st.c || "cs-glow")));
      },
      badge: (st) => {
        const t = adv.lines[st.id]?.tokens[st.i];
        if (!t) return;
        t.querySelector(".cs-bdg")?.remove();
        t.appendChild(el("span", "bdg " + (st.c || ""), esc3(st.t)));
      },
      push: async (st) => {
        const L = adv.lines[st.id];
        if (!L) return;
        L.tokens.forEach((t2, i) => {
          if (i !== st.i) t2.classList.add("cs-dim");
        });
        const t = L.tokens[st.i];
        t.classList.add("cs-push");
        await sleep(750);
        t.classList.remove("cs-push");
        L.tokens.forEach((t2, i) => {
          if (i !== st.i) setTimeout(() => t2.classList.remove("cs-dim"), 200 * i);
        });
      },
      morph: async (st) => {
        const t = adv.lines[st.id]?.tokens[st.i];
        if (!t) return;
        t.classList.add("cs-flip");
        await sleep(250);
        t.querySelector(".cs-t").textContent = st.to;
        t.classList.add("cs-eq");
        await sleep(260);
        t.classList.remove("cs-flip");
      },
      mark: (st) => {
        const L = adv.lines[st.id];
        if (L) L.el.appendChild(el("span", "mk " + (st.c || ""), esc3(st.t)));
      },
      reorder: async (st) => {
        const L = adv.lines[st.id];
        if (!L) return;
        const first = L.tokens.map((t) => t.getBoundingClientRect());
        if (st.texts) L.tokens.forEach((t, i) => {
          if (st.texts[i] != null) t.querySelector(".cs-t").textContent = st.texts[i];
        });
        st.order.forEach((i) => L.el.appendChild(L.tokens[i]));
        L.el.querySelectorAll(".cs-mk").forEach((m) => L.el.appendChild(m));
        L.tokens.forEach((t, i) => {
          const last = t.getBoundingClientRect();
          t.animate(
            [{ transform: `translate(${first[i].left - last.left}px,${first[i].top - last.top}px)` }, { transform: "none" }],
            { duration: 650, easing: "cubic-bezier(.3,1.35,.5,1)" }
          );
        });
        await sleep(700);
      },
      merge: (st) => {
        const L = adv.lines[st.id];
        if (!L) return;
        const parts = L.tokens.slice(st.from, st.to + 1);
        const t = mkTok(parts.map((p) => p.querySelector(".cs-t").textContent).join(" "));
        t.classList.add(P(st.c || "cs-sticker"), "cs-new");
        parts[0].before(t);
        parts.forEach((p) => p.remove());
        for (let i = st.from; i <= st.to; i++) L.tokens[i] = t;
      },
      pic: (st) => {
        const d = el("div", "bpic");
        d.appendChild(picNode(st.key));
        adv.board.appendChild(d);
      },
      cards: (st) => {
        const w = el("div", "cards");
        st.items.forEach((c) => {
          const d = el("div", "card");
          d.appendChild(el("div", "en", esc3(c.en)));
          if (c.pic) d.appendChild(picNode(c.pic));
          d.appendChild(el("div", "jp", esc3(c.jp)));
          w.appendChild(d);
        });
        adv.board.appendChild(w);
      },
      pyramid: () => {
        const p = el("div", "pyr");
        p.innerHTML = `<div class="cs-st" data-s="1"><span class="cs-n">1</span><b>\u8AB0\u304C\uFF1F\uFF08\u4E3B\u5F79\uFF09</b></div><span class="cs-ar">\u2193</span>
      <div class="cs-st" data-s="2"><span class="cs-n">2</span><b>\u3069\u3046\u3057\u3066\u308B\uFF1F</b><span style="font-size:12px">\u3069\u3093\u306A\u611F\u3058\uFF1F\uFF0F\u3069\u3046\u3059\u308B\uFF1F</span></div><span class="cs-ar">\u2193\uFF08\u5FC5\u8981\u306A\u3089\uFF09</span>
      <div class="cs-st" data-s="3"><span class="cs-n">3</span><b>\u76F8\u624B\uFF0F\u3069\u3093\u306A\u611F\u3058\uFF1F</b></div>`;
        adv.board.appendChild(p);
      },
      pfill: (st) => {
        const r = adv.board.querySelector(`.cs-pyr .cs-st[data-s="${st.step}"]`);
        if (r) r.appendChild(el("span", "chip", esc3(st.t)));
      },
      amap: () => {
        const m = el("div", "amap");
        m.innerHTML = `<div class="cs-row"><div class="cs-core">\u2460 \u4E3B\u5F79</div><div class="cs-opt">\uFF0B \u3069\u3093\u306A\u4E3B\u5F79\uFF1F</div></div>
      <div class="cs-row"><div class="cs-core">\u2461 \u3069\u3046\u3057\u3066\u308B\uFF1F</div><div class="cs-opt">\uFF0B \u3069\u3093\u306A\u98A8\u306B\uFF1F</div></div>
      <div class="cs-row"><div class="cs-core">\u2462 \u76F8\u624B\uFF0F\u3069\u3093\u306A\u611F\u3058\uFF1F</div><div class="cs-opt">\uFF0B \u3069\u3093\u306A\u76F8\u624B\uFF1F</div></div>
      <hr><div class="cs-opt cs-tail">\uFF0B \u3044\u3064\uFF0F\u3069\u3053\u3067\uFF0F\u306A\u305C\uFF0F\u3069\u3046\u3084\u3063\u3066</div>`;
        adv.board.appendChild(m);
      },
      flash: async () => {
        const f = el("div", "flash");
        app2.appendChild(f);
        await sleep(1100);
        f.remove();
      }
    };
    function parseCut(s) {
      const words = [], B = /* @__PURE__ */ new Set(), O = /* @__PURE__ */ new Set();
      s.split(/\s+/).filter(Boolean).forEach((tk) => {
        if (tk === "|") B.add(words.length);
        else if (tk === "/") O.add(words.length);
        else words.push(tk);
      });
      return { words, B, O };
    }
    function judge(p, cuts) {
      const n = p.words.length, pts = [0, ...[...cuts].sort((a, b) => a - b), n];
      const ok = /* @__PURE__ */ new Set([0, n, ...p.B, ...p.O]);
      const chunks = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const s = pts[k], e = pts[k + 1];
        let r = "o";
        if (!ok.has(s) || !ok.has(e)) r = "x";
        else if ([...p.B].some((b) => b > s && b < e)) r = "t";
        chunks.push({ text: p.words.slice(s, e).join(" "), r });
      }
      return chunks;
    }
    function answerText(p) {
      const out = [];
      p.words.forEach((w, i) => {
        if (i && p.B.has(i)) out.push("|");
        out.push(w);
      });
      return out.join(" ");
    }
    function runStage(ch) {
      adv = null;
      const st = ch.stage;
      const finish = (result) => showResult(ch, result);
      if (opts.onStage) {
        const handled = opts.onStage(st, ch, finish);
        if (handled !== false) return;
      }
      (st.type === "order" ? orderStage : cutStage)(ch, st, finish);
    }
    function stageFrame(ch, st) {
      const s = screen("stg");
      s.innerHTML = `<div class="cs-top"><span class="cs-t">\u7B2C${ch.no}\u7AE0 ${esc3(st.title || "")}</span><span class="cs-cnt"></span>
      <button class="cs-pill cs-sub" data-a="map">\u30DE\u30C3\u30D7</button></div>
    <div class="cs-coach"></div><div class="cs-ja"></div><div class="cs-lane"></div><div class="cs-foot"></div>`;
      const coach = s.querySelector(".cs-coach");
      coach.appendChild(withFallback(charaSrc("boy", "egao"), () => {
        const p = el("div", "ph");
        p.innerHTML = "<b>\u7537\u306E\u5B50</b>";
        return p;
      }));
      const sb = el("div", "sb");
      coach.appendChild(sb);
      const f = {
        s,
        cnt: s.querySelector(".cs-cnt"),
        ja: s.querySelector(".cs-ja"),
        lane: s.querySelector(".cs-lane"),
        foot: s.querySelector(".cs-foot"),
        say: (t) => {
          sb.textContent = "";
          void sb.offsetWidth;
          sb.textContent = t || "";
        },
        alive: true
      };
      curFrame = f;
      s.querySelector('[data-a="map"]').onclick = () => {
        f.alive = false;
        openMap();
      };
      return f;
    }
    function cutStage(ch, st, finish) {
      const f = stageFrame(ch, st);
      f.s.classList.add("cs-cutscr");
      const coach = st.coach || {};
      const said = {};
      const tell2 = (k) => {
        if (coach[k] && !said[k]) {
          said[k] = 1;
          f.say(coach[k]);
        }
      };
      const all = [];
      let n = 0;
      tell2("start");
      const hintBtn = el("button", "pill sub", "\u{1F4A1}\u30D2\u30F3\u30C8");
      const topBar = f.s.querySelector(".cs-top");
      topBar.insertBefore(hintBtn, topBar.querySelector('[data-a="map"]'));
      let hintFn = null;
      hintBtn.onclick = () => hintFn && hintFn();
      next();
      function next() {
        if (!f.alive) return;
        if (n >= st.items.length) return finish(all);
        const item = st.items[n], p = parseCut(item.s), len = p.words.length;
        f.cnt.textContent = n + 1 + " / " + st.items.length;
        f.ja.textContent = item.ja || "";
        try {
          opts.speak && opts.speak(p.words.join(" "));
        } catch (e) {
        }
        f.lane.innerHTML = "";
        f.lane.classList.remove("cs-col");
        const lw = el("div", "laneW"), strip = el("div", "strip"), line = el("div", "cutline");
        line.dataset.lbl = "\u3053\u3053\u3067\u533A\u5207\u308B";
        lw.append(strip, line, el("div", "fadeL"), el("div", "fadeR"));
        f.lane.appendChild(lw);
        f.foot.innerHTML = "";
        f.foot.style.cssText = "";
        const bar = el("div", "navrow");
        const nav = el("div", "nav");
        const bBack = el("button", "navb", "\u25C0"), bFwd = el("button", "navb", "\u25B6");
        bBack.setAttribute("aria-label", "1\u8A9E\u3082\u3069\u308B\uFF08\u6587\u306E\u982D\u307E\u3067\u623B\u308C\u308B\uFF09");
        bFwd.setAttribute("aria-label", "1\u8A9E\u3059\u3059\u3080");
        nav.append(bBack, bFwd);
        const bCut = el("button", "cutBtn");
        bCut.innerHTML = "\u533A\u5207\u308B<small>\u25B6\u3067\u9032\u3093\u3067\u3001\u3053\u3053\u3060\u3068\u601D\u3063\u305F\u3089\u62BC\u3059</small>";
        bar.append(nav, bCut);
        f.foot.appendChild(bar);
        let passed = 0, over = false, hintAt = null;
        const cuts = /* @__PURE__ */ new Set();
        hintFn = () => {
          if (over) return;
          const miss = [...p.B].filter((b) => !cuts.has(b)).sort((a, b) => a - b);
          if (!miss.length) {
            f.say("\u7B54\u3048\u306E\u533A\u5207\u308A\u306F\u3001\u305C\u3093\u3076\u5207\u308C\u3066\u308B\u3088\uFF01");
            return;
          }
          hintAt = miss[0];
          render(false);
          f.say(hintAt === passed ? "\u3044\u307E\u300E\u533A\u5207\u308B\u300F\u3092\u62BC\u3057\u3066\u306D\uFF01" : hintAt > passed ? "\u25B6\u3067\u9032\u3081\u305F\u5148\u306E\u3001\u25C6\u306E\u3068\u3053\u308D\u3067\u533A\u5207\u308B\u3088\u3002" : "\u25C6\u306E\u3068\u3053\u308D\u3092\u533A\u5207\u308A\u5FD8\u308C\u3066\u308B\u3088\u3002\u25C0\u3067\u623B\u3063\u3066\u307F\u3088\u3046\u3002");
        };
        function render(anim) {
          strip.innerHTML = "";
          p.words.forEach((w, i) => {
            const cls = i < passed - 2 ? " gone" : i < passed ? " past" : i === passed ? " next" : "";
            strip.appendChild(el("span", "w" + cls, esc3(w)));
            if (i + 1 < len && !cuts.has(i + 1) && hintAt === i + 1) strip.appendChild(el("span", "hintmk", "\u25C6"));
            if (i + 1 < len && cuts.has(i + 1)) {
              const c = el("span", "cutmark", "\uFF5C");
              c.title = "\u30BF\u30C3\u30D7\u3067\u5143\u306B\u623B\u3059";
              c.onclick = () => {
                if (over) return;
                cuts.delete(i + 1);
                render();
              };
              strip.appendChild(c);
            }
          });
          strip.appendChild(el("span", "endmk", "\u25A0"));
          const ws = strip.querySelectorAll(".cs-w"), lx = Math.round(lw.clientWidth * 0.34);
          let gx;
          if (passed <= 0) gx = ws[0].offsetLeft - 4;
          else {
            const a = ws[Math.min(passed, ws.length) - 1], nx = a.nextElementSibling, r = a.offsetLeft + a.offsetWidth;
            gx = nx ? nx.classList.contains("cs-cutmark") ? nx.offsetLeft + nx.offsetWidth / 2 : (r + nx.offsetLeft) / 2 : r + 6;
          }
          strip.classList.toggle("cs-step", !!anim);
          strip.style.transform = "translate(" + (lx - gx) + "px,-50%)";
          line.style.left = lx + "px";
          const fin = passed >= len;
          bBack.disabled = over || passed <= 0;
          bFwd.disabled = fin;
          bCut.classList.toggle("cs-fin", fin);
          bCut.innerHTML = fin ? "\u304B\u3093\u305B\u3044<small>\u304A\u3057\u307E\u3044\u307E\u3067\u9032\u3093\u3060\u3088</small>" : "\u533A\u5207\u308B<small>\u25B6\u3067\u9032\u3093\u3067\u3001\u3053\u3053\u3060\u3068\u601D\u3063\u305F\u3089\u62BC\u3059</small>";
          bCut.disabled = !fin && (over || passed === 0 || cuts.has(passed));
        }
        function done() {
          over = true;
          const res = judge(p, cuts);
          all.push({ s: p.words.join(" "), chunks: res });
          f.lane.innerHTML = "";
          f.lane.classList.add("cs-col");
          const rw = el("div", "res-ws");
          res.forEach((c) => {
            const d = el("span", "rc " + c.r);
            d.innerHTML = `<span class="cs-m">${{ o: "\u25EF", t: "\u25B3", x: "\xD7" }[c.r]}</span>${esc3(c.text)}`;
            rw.appendChild(d);
          });
          f.lane.appendChild(rw);
          if (res.some((c) => c.r !== "o")) f.lane.appendChild(el("div", "ans", `\u3053\u305F\u3048\u306E\u4F8B<br><b>${esc3(answerText(p))}</b>`));
          const good = res.every((c) => c.r === "o");
          f.say(good ? "\u305C\u3093\u3076\u25EF\uFF01\u3044\u3044\u5207\u308A\u65B9\uFF01" : "\u25B3\u306F\u5927\u304D\u3059\u304E\u3001\xD7\u306F\u5207\u308B\u5834\u6240\u304C\u305A\u308C\u3066\u308B\u3088\u3002");
          f.foot.innerHTML = "";
          const go = el("button", "cutBtn go");
          go.textContent = n + 1 < st.items.length ? "\u3064\u304E\u306E\u6587\u3078" : "\u3051\u3063\u304B\u3092\u898B\u308B";
          go.onclick = () => {
            n++;
            next();
          };
          f.foot.appendChild(go);
        }
        bBack.onclick = () => {
          if (over || bBack.disabled) return;
          passed--;
          [...cuts].forEach((i) => {
            if (i > passed) cuts.delete(i);
          });
          render(true);
        };
        bFwd.onclick = () => {
          if (over || passed >= len) return;
          passed++;
          render(true);
          if (passed >= len) tell2("end");
        };
        bCut.onclick = () => {
          if (bCut.disabled || over) return;
          if (passed >= len) return done();
          cuts.add(passed);
          if (hintAt === passed) hintAt = null;
          render(true);
          tell2("cut");
        };
        render(false);
      }
    }
    function orderStage(ch, st, finish) {
      const f = stageFrame(ch, st);
      f.say((st.coach || {}).start || "");
      const all = [];
      let n = 0;
      next();
      function next() {
        if (!f.alive) return;
        if (n >= st.items.length) return finish(all);
        const item = st.items[n];
        f.cnt.textContent = n + 1 + " / " + st.items.length;
        f.ja.textContent = item.ja || "";
        f.lane.innerHTML = "";
        f.lane.classList.add("cs-col");
        f.foot.innerHTML = "";
        const ansRow = el("div", "ord-ans"), pool = el("div", "ord-pool");
        f.lane.append(ansRow, pool);
        let order = item.parts.map((_, i) => i);
        do {
          order.sort(() => Math.random() - 0.5);
        } while (order.every((v, i) => v === i) && order.length > 1);
        const picked = [];
        const draw = () => {
          ansRow.innerHTML = "";
          pool.innerHTML = "";
          picked.forEach((pi, k) => {
            const b = el("button", "oc in", esc3(item.parts[pi]));
            b.onclick = () => {
              picked.splice(k, 1);
              draw();
            };
            ansRow.appendChild(b);
          });
          order.filter((i) => !picked.includes(i)).forEach((pi) => {
            const b = el("button", "oc", esc3(item.parts[pi]));
            b.onclick = () => {
              picked.push(pi);
              draw();
              if (picked.length === item.parts.length) check();
            };
            pool.appendChild(b);
          });
        };
        const check = () => {
          const ok = picked.every((v, i) => v === i);
          all.push({ s: item.parts.join(" "), chunks: [{ text: picked.map((i) => item.parts[i]).join(" "), r: ok ? "o" : "x" }] });
          f.lane.innerHTML = "";
          f.lane.classList.add("cs-col");
          const rw = el("div", "res-ws");
          const d = el("span", "rc " + (ok ? "o" : "x"));
          d.innerHTML = `<span class="cs-m">${ok ? "\u25EF" : "\xD7"}</span>${esc3(picked.map((i) => item.parts[i]).join(" "))}`;
          rw.appendChild(d);
          f.lane.appendChild(rw);
          if (!ok) f.lane.appendChild(el("div", "ans", `\u3053\u305F\u3048<br><b>${esc3(item.parts.join(" "))}</b>`));
          f.say(ok ? "\u305D\u306E\u9806\u756A\uFF01\u571F\u53F0\u30D0\u30C3\u30C1\u30EA\u3002" : "\u4E3B\u5F79 \u2192 \u3069\u3046\u3057\u3066\u308B\uFF1F \u2192 \u76F8\u624B \u306E\u9806\u3060\u3088\u3002");
          const go = el("button", "bb go", n + 1 < st.items.length ? "\u3064\u304E\u3078" : "\u3051\u3063\u304B\u3092\u898B\u308B");
          go.onclick = () => {
            n++;
            next();
          };
          f.foot.appendChild(go);
        };
        draw();
      }
    }
    function showResult(ch, results) {
      let o = 0, t = 0, x = 0;
      (results || []).forEach((r) => r.chunks.forEach((c) => {
        if (c.r === "o") o++;
        else if (c.r === "t") t++;
        else x++;
      }));
      const total2 = o + t + x, pct = total2 ? Math.round((o * 2 + t) / (total2 * 2) * 100) : 100;
      const firstClear = !prog.cleared[ch.no];
      prog.cleared[ch.no] = true;
      let unlockedMode = null;
      if (ch.unlock && !prog.unlocked[ch.unlock]) {
        prog.unlocked[ch.unlock] = true;
        unlockedMode = S2.modes.find((m) => m.key === ch.unlock);
        opts.onUnlock && opts.onUnlock(ch.unlock);
      }
      save(prog);
      const [gf, bf, line] = pct >= 80 ? ["doya", "egao", "\u3059\u3054\u3044\uFF01\u3082\u3046\u30B3\u30C4\u3092\u3064\u304B\u3093\u3067\u308B\u306D\uFF01"] : pct >= 50 ? ["hirameki", "ehen", "\u3044\u3044\u611F\u3058\uFF01\u3042\u3068\u5C11\u3057\u3067\u5168\u90E8\u25EF\u3060\u3088\u3002"] : ["komari", "ehen", "\u5927\u4E08\u592B\u3001\u3082\u3046\u4E00\u56DE\u304A\u8A71\u3092\u898B\u3066\u304B\u3089\u8A66\u3057\u3066\u307F\u3088\u3046\uFF01"];
      const s = screen("rs");
      s.innerHTML = `<h2>\u7B2C${ch.no}\u7AE0 \u30AF\u30EA\u30A2\uFF01</h2><div class="cs-score">${pct}<small>\u70B9</small></div>
    <div class="cs-tally"><span style="color:var(--good)">\u25EF ${o}</span><span style="color:var(--mid)">\u25B3 ${t}</span><span style="color:var(--bad)">\xD7 ${x}</span></div>`;
      const duo = el("div", "duo");
      const g = el("div"), b = el("div");
      g.appendChild(charaNode("girl", gf));
      b.appendChild(charaNode("boy", bf));
      duo.append(g, b);
      s.appendChild(duo);
      s.appendChild(el("div", "say", esc3(line)));
      if (unlockedMode) s.appendChild(el("div", "unl", `\u300C${esc3(unlockedMode.name)}\u300D\u304C\u3042\u305D\u3079\u308B\u3088\u3046\u306B\u306A\u3063\u305F\uFF01`));
      const col = el("div", "col");
      const nextCh = S2.chapters.find((c) => c.no === ch.no + 1);
      if (nextCh) {
        const bn = el("button", "bb go", "\u3064\u304E\u306E\u7AE0\u3078");
        bn.onclick = () => playChapter(nextCh.no);
        col.appendChild(bn);
      } else if (opts.onFinish) {
        const bf2 = el("button", "bb go", "\u30B2\u30FC\u30E0\u3078");
        bf2.onclick = () => opts.onFinish(prog);
        col.appendChild(bf2);
      }
      const br = el("button", "bb", "\u3082\u3046\u4E00\u56DE\u3042\u305D\u3076");
      br.onclick = () => runStage(ch);
      const bm = el("button", "bb", "\u30DE\u30C3\u30D7\u3078");
      bm.onclick = openMap;
      col.append(br, bm);
      s.appendChild(col);
      opts.onChapterClear && opts.onChapterClear(ch.no, { pct, firstClear });
    }
    window.ChunkStory = {
      mount(target, o) {
        root = typeof target === "string" ? document.querySelector(target) : target;
        opts = o || {};
        if (opts.storeKey) STORE_KEY = opts.storeKey;
        if (opts.assets) Object.assign(A.config, opts.assets);
        root.classList.add("cs-root");
        prog = Object.assign({ cleared: {}, unlocked: {} }, load2());
        root.innerHTML = "";
        app2 = el("div", "cs-app");
        root.appendChild(app2);
        openMap();
        return this;
      },
      openMap: () => openMap(),
      playChapter: (no) => playChapter(no),
      progress: () => JSON.parse(JSON.stringify(prog)),
      isUnlocked: (key) => !!prog.unlocked[key],
      reset() {
        prog = { cleared: {}, unlocked: {} };
        save(prog);
        openMap();
      },
      unmount() {
        adv = null;
        if (curFrame) curFrame.alive = false;
        if (root) {
          root.innerHTML = "";
          root.classList.remove("cs-root");
        }
        root = app2 = null;
      }
    };
  })();

  // games/chunkchunk/src/story.js
  function createStory(HOST) {
    const root = document.createElement("div");
    root.className = "ccStoryApp";
    root.hidden = true;
    const host = document.createElement("div");
    host.style.cssText = "height:100%";
    root.appendChild(host);
    const css = document.createElement("style");
    css.textContent = ".ccStoryApp{position:fixed;inset:0;z-index:75;background:#fbf1f6;overflow:hidden}.ccStoryApp[hidden]{display:none}";
    document.head.appendChild(css);
    document.body.appendChild(root);
    const rep = (k, d) => {
      try {
        HOST.report && HOST.report(k, d);
      } catch (e) {
      }
    };
    function open() {
      root.hidden = false;
      HOST.onOpen && HOST.onOpen();
      window.ChunkStory.mount(host, {
        save: (p) => HOST.store.set("story", p),
        load: () => {
          try {
            const v = HOST.store.get("story");
            return typeof v === "string" ? JSON.parse(v) : v;
          } catch (e) {
            return null;
          }
        },
        onUnlock: (key) => rep("story_unlock", { key }),
        onChapterClear: (no, r) => rep("story_clear", { chapter: no, pct: r && r.pct, firstClear: r && r.firstClear }),
        onFinish: () => close(),
        onExit: () => close(),
        speak: (t) => {
          try {
            HOST.speak && HOST.speak(t);
          } catch (e) {
          }
        },
        assets: { base: HOST.base + "img/chara/", ext: ".webp", picBase: HOST.base + "img/story/", picExt: ".svg" }
      });
    }
    function close() {
      try {
        window.ChunkStory.unmount();
      } catch (e) {
      }
      root.hidden = true;
      HOST.onClose && HOST.onClose();
    }
    function destroy() {
      try {
        window.ChunkStory.unmount();
      } catch (e) {
      }
      try {
        root.remove();
        css.remove();
      } catch (e) {
      }
    }
    return { open, close, visible: () => !root.hidden, destroy };
  }

  // games/chunkchunk/game.js
  var FONT3 = "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;700;800&family=Lexend:wght@400;500;700&family=Mochiy+Pop+One&family=Zen+Maru+Gothic:wght@500;700&family=Quicksand:wght@500;700&display=swap";
  var NAMES = { lesson: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\uFF08\u5B66\u6821\uFF09", library: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\uFF08\u56F3\u66F8\u9928\uFF09", arcade: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF", all: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF" };
  function migrate(store) {
    if (store.get("_migrated")) return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^ccs/.test(k) && store.get(k) == null) store.set(k, localStorage.getItem(k));
      }
    } catch (e) {
    }
    store.set("_migrated", 1);
  }
  var game_default = {
    id: "chunkchunk",
    name: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF",
    right: "game:chunkchunk",
    async mount(el, ctx) {
      const face = ctx.opts.face || "arcade";
      if (!document.querySelector('link[data-ct="cc"]')) {
        const lk = document.createElement("link");
        lk.rel = "stylesheet";
        lk.href = FONT3;
        lk.dataset.ct = "cc";
        document.head.appendChild(lk);
      }
      Object.assign(ENV, { root: el, ctx, core: ctx.core, offs: [] });
      migrate(ctx.store);
      el.classList.add("ct-cc");
      el.innerHTML = view_default;
      const wallet = createWallet(ctx.store);
      ENV.make = createMake({ base: ctx.base, store: ctx.store, Wallet: wallet, sfx, onOpen: () => ctx.showBack(false), onClose: () => ctx.showBack(!el.querySelector("#title").hidden) });
      ENV.story = createStory({ speak: (t) => readTextAloud(t), base: ctx.base, store: ctx.store, report: ctx.report, onOpen: () => ctx.showBack(false), onClose: () => ctx.showBack(!el.querySelector("#title").hidden) });
      loadSettings();
      init_engine();
      init_texts();
      init_rank();
      initTitle(face);
      initBgm(el);
      initSfx();
      preloadSfx();
      initShared();
      const title = el.querySelector("#title"), mo = new MutationObserver(() => ctx.showBack(!title.hidden && !ctx.core.reader.isOpen && !ENV.make.visible() && !ENV.story.visible()));
      mo.observe(title, { attributes: true, attributeFilter: ["hidden"] });
      showTitle();
      ctx.showBack(true);
      ctx.report("enter", { face, name: NAMES[face] });
      return {
        unmount() {
          mo.disconnect();
          nextRun();
          try {
            if (S) {
              clearTimeout(S.timer);
              S.phase = "ready";
            }
          } catch (e) {
          }
          try {
            ctx.core.reader.close();
          } catch (e) {
          }
          try {
            ENV.make.destroy();
            ENV.make = null;
          } catch (e) {
          }
          try {
            ENV.story.destroy();
            ENV.story = null;
          } catch (e) {
          }
          clearPop();
          stopSfxVoice();
          ENV.offs.forEach((f) => f());
          ENV.offs = [];
          el.innerHTML = "";
        }
      };
    }
  };

  // games/index.js
  var GAMES = { chunkchunk: game_default };

  // apps/solo/main.js
  var app = window.__APP__;
  var core = createCore({ ...app, backButton: false });
  document.body.style.background = "#0b1626";
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
