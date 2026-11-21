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
        const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), key2 = game + ":" + name;
        stats.first = stats.first || now;
        stats.last = now;
        stats.count[key2] = (stats.count[key2] || 0) + 1;
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
  function createProfile(events, base, getLog = () => null) {
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
        const lg = getLog(), T = lg ? lg.totalSummary() : null, h = (x) => {
          const m = Math.round(x / 60);
          return m >= 60 ? Math.floor(m / 60) + "\u6642\u9593" + m % 60 + "\u5206" : m + "\u5206";
        };
        return [...T ? [{ label: "\u52C9\u5F37\u3057\u305F\u6642\u9593(\u5408\u8A08)", value: h(T.by.study) }, { label: "\u904A\u3093\u3060\u6642\u9593(\u5408\u8A08)", value: h(T.by.tv + T.by.sport) }, { label: "\u8857\u3067\u307E\u3063\u305F\u308A(\u5408\u8A08)", value: h(T.by.relax) }] : [], { label: "\u904A\u3093\u3060\u56DE\u6570", value: plays + "\u56DE" }, { label: "\u306F\u3058\u3081\u305F\u65E5", value: s.first || "\u2014" }, { label: "\u6700\u5F8C\u306B\u904A\u3093\u3060\u65E5", value: s.last || "\u2014" }];
      }
    };
  }

  // core/ui.js
  function createUI(core2) {
    const root = document.createElement("div");
    root.className = "cs-ui";
    document.body.appendChild(root);
    const esc9 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
      ${row("rate", "\u8AAD\u307F\u4E0A\u3052\u306E\u901F\u3055", 0.7, 1.3, 0.05)}<button class="cs-btn" id="cs-try">\u8AAD\u307F\u4E0A\u3052\u3092\u8A66\u3059</button>
      ${core2.ai ? `<label class="cs-row"><span>AI(\u81EA\u5206\u306E\u30AD\u30FC)</span><select id="cs-aip">${Object.entries({ gemini: "Gemini", openai: "ChatGPT", claude: "Claude" }).map(([k, n]) => `<option value="${k}" ${core2.ai.state.provider === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="cs-row cs-col"><span>AI\u306E\u30AD\u30FC${core2.ai.ready ? "(\u5165\u3063\u3066\u3044\u307E\u3059)" : ""}</span><input id="cs-aik" type="password" autocomplete="off" placeholder="${core2.ai.ready ? "\u5909\u3048\u308B\u3068\u304D\u3060\u3051\u5165\u308C\u308B" : "\u30AD\u30FC\u3092\u8CBC\u308B(3D\u306E\u753A\u3068\u540C\u3058\u30AD\u30FC)"}"></label>
      <p class="cs-note">\u30AD\u30FC\u306F\u3053\u306E\u7AEF\u672B\u306B\u3060\u3051\u4FDD\u5B58\u3057\u307E\u3059\u3002\u4F4F\u4EBA\u3068\u306E\u4F1A\u8A71\u30FB\u300C\u81EA\u7136\u306A\u6587\u304B\u300D\u306E\u5224\u5B9A\u30FB\u4F8B\u6587\u3065\u304F\u308A\u306B\u4F7F\u3044\u307E\u3059\u3002</p>` : ""}
      ${core2.admin && core2.admin.on() ? '<button class="cs-btn" id="cs-admin">\u904B\u55B6</button>' : ""}
      <p class="cs-note" style="text-align:center;opacity:.6">\u7248 ${window.__APP__ && window.__APP__.build || "-"}</p>`, (ov, close) => {
        ["bgm", "sfx", "rate"].forEach((k) => ov.querySelector("#cs-" + k).oninput = (e) => s.set(k, +e.target.value));
        ov.querySelector("#cs-theme").onchange = (e) => s.set("theme", e.target.value);
        ov.querySelector("#cs-voice").onchange = (e) => s.set("voice", e.target.checked);
        ov.querySelector("#cs-try").onclick = () => core2.speech.speak("Hello! Let\u2019s read English in chunks.");
        const aip = ov.querySelector("#cs-aip"), aik = ov.querySelector("#cs-aik");
        if (aip) aip.onchange = (e) => core2.ai.configure({ provider: e.target.value });
        if (aik) aik.onchange = (e) => {
          if (e.target.value.trim()) {
            core2.ai.configure({ key: e.target.value });
            e.target.value = "";
            toast("AI\u306E\u30AD\u30FC\u3092\u5165\u308C\u307E\u3057\u305F");
          }
        };
        const ad = ov.querySelector("#cs-admin");
        if (ad) ad.onclick = () => {
          close();
          core2.admin.open();
        };
      });
    };
    const profile = () => {
      const p = core2.profile;
      sheet(`<h3>\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB</h3><div class="cs-prof"><img src="${p.avatarURL()}" alt="\u30A2\u30D0\u30BF\u30FC"><div>
      <label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input id="cs-name" maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc9(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D\uFF08\u3044\u307E\u306F\u4EEE\u306E\u7D75\uFF09\u3002\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u9805\u76EE\u3082\u3053\u308C\u304B\u3089\u6C7A\u3081\u307E\u3059\u3002</p>
      <ul class="cs-stat">${p.status().map((x) => `<li><span>${esc9(x.label)}</span><b>${esc9(x.value)}</b></li>`).join("")}</ul>`, (ov) => {
        ov.querySelector("#cs-name").onchange = (e) => p.setName(e.target.value);
      });
    };
    return { root, sheet, toast, settings, profile };
  }

  // core/host.js
  var loaded = {};
  function loadScript(src) {
    try {
      const v = window.__APP__ && window.__APP__.build;
      if (v && !/\?/.test(src)) src += "?v=" + v;
    } catch (e) {
    }
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
      core2.daylog && core2.daylog.act("app", null);
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
          earn: (kind, n) => core2.member.earn(kind, n),
          // コインをもらう（'game'＝点数のごほうび。1日の上限つき）
          showBack: (on) => {
            backBtn.hidden = !(on && core2.config.backButton);
          },
          exit: close
        };
        cur = { game, el, inst: null };
        ctx.report("open");
        core2.daylog && core2.daylog.act("app", { cat: "study", label: game.name || game.title || game.id });
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

  // core/wallet.js
  function createWallet() {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    let coins = st.get("coins");
    if (coins == null) {
      let old = null;
      try {
        old = JSON.parse(localStorage.getItem("town:coins"));
      } catch (e) {
      }
      coins = Number.isFinite(old) ? old : 50;
      st.set("coins", coins);
    }
    const fire = (delta, reason) => subs.forEach((f) => {
      try {
        f({ coins, delta, reason });
      } catch (e) {
      }
    });
    let boost = () => 1;
    return {
      setBoost(f) {
        boost = f;
      },
      get: () => coins,
      add(n, reason = "") {
        n = Math.round(n);
        if (!Number.isFinite(n) || n === 0) return coins;
        if (n > 0 && !/^(admin|test|month|refund)/.test(reason)) n *= boost();
        n = Math.max(-coins, Math.min(500, n));
        coins += n;
        st.set("coins", coins);
        fire(n, reason);
        return coins;
      },
      set(n, reason = "set") {
        n = Math.max(0, Math.min(999999, Math.round(+n) || 0));
        const d = n - coins;
        coins = n;
        st.set("coins", coins);
        fire(d, reason);
        return coins;
      },
      // テスト用
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/dict.js
  var POSN = { v: "\u52D5\u8A5E", aux: "\u52A9\u52D5\u8A5E", n: "\u540D\u8A5E", adj: "\u5F62\u5BB9\u8A5E", adv: "\u526F\u8A5E", prep: "\u524D\u7F6E\u8A5E", conj: "\u63A5\u7D9A\u8A5E", pr: "\u4EE3\u540D\u8A5E", det: "\u9650\u5B9A\u8A5E", art: "\u51A0\u8A5E", num: "\u6570", int: "\u9593\u6295\u8A5E" };
  function createDict(base) {
    const D = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map(), PH = /* @__PURE__ */ new Map();
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
        if (!PH.has(ws[0])) PH.set(ws[0], []);
        PH.get(ws[0]).push([ws, m]);
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
        view: opts.view || S.view,
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
        if (si === sens.length - 1 && opts.onEnd && !RD.ended) {
          RD.ended = true;
          try {
            opts.onEnd();
          } catch (e) {
          }
        }
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
        const extra = opts.onGrade ? opts.onGrade({ res, pts, hints: RD.hints, n: qs.length, answered: qs.filter((x) => x.ans).length }) : "";
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

  // core/notebook.js
  var KINDS = [
    { k: "word", n: "\u5358\u8A9E" },
    { k: "phrase", n: "\u719F\u8A9E\u30FB\u8868\u73FE" },
    { k: "short", n: "\u77ED\u6587" },
    { k: "quote", n: "\u683C\u8A00\u30FB\u4F1A\u8A71" }
  ];
  var MARKS = [{ k: "miss", n: "\u307E\u3061\u304C\u3048\u305F" }, { k: "fav", n: "\u304A\u6C17\u306B\u5165\u308A" }, { k: "test", n: "\u30C6\u30B9\u30C8\u7BC4\u56F2" }];
  var MAX = 1e4;
  function guessKind(en) {
    const n = String(en).trim().split(/\s+/).filter(Boolean).length;
    return n <= 1 ? "word" : n <= 4 ? "phrase" : "short";
  }
  function createNotebook() {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    let list = st.get("notebook") || [];
    const save = () => {
      st.set("notebook", list);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    const keyOf = (kind, en) => kind + "|" + String(en).trim().toLowerCase().replace(/\s+/g, " ");
    return {
      // 足す。同じ英語がもうあれば、訳が空なら埋めて印を足すだけ（重ならない）
      add(it, quiet) {
        const en = String(it.en || "").trim().replace(/\s+/g, " ");
        if (!en || !/[a-zA-Z]/.test(en)) return null;
        const kind = KINDS.some((x) => x.k === it.kind) ? it.kind : guessKind(en), k = keyOf(kind, en);
        let cur = list.find((x) => keyOf(x.kind, x.en) === k);
        if (cur) {
          if (!cur.ja && it.ja) cur.ja = String(it.ja).trim();
          (it.marks || []).forEach((m) => {
            if (!cur.marks.includes(m)) cur.marks.push(m);
          });
          cur.n = (cur.n || 1) + 1;
          cur.at = Date.now();
        } else {
          cur = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, en, ja: String(it.ja || "").trim(), src: it.src || "", note: it.note || "", marks: (it.marks || []).slice(), n: 1, at: Date.now() };
          list.unshift(cur);
          if (list.length > MAX) list.length = MAX;
        }
        if (!quiet) save();
        return cur;
      },
      addMany(items) {
        const out = items.map((it) => this.add(it, true)).filter(Boolean);
        save();
        return out;
      },
      list({ kind, mark } = {}) {
        return list.filter((x) => (!kind || x.kind === kind) && (!mark || x.marks.includes(mark)));
      },
      count(kind) {
        return kind ? list.filter((x) => x.kind === kind).length : list.length;
      },
      mark(id, m, on) {
        const x = list.find((y) => y.id === id);
        if (!x) return;
        const has = x.marks.includes(m);
        if (on == null) on = !has;
        if (on && !has) x.marks.push(m);
        if (!on && has) x.marks = x.marks.filter((y) => y !== m);
        save();
      },
      edit(id, patch) {
        const x = list.find((y) => y.id === id);
        if (!x) return;
        ["en", "ja", "note", "kind"].forEach((k) => {
          if (patch[k] != null) x[k] = String(patch[k]).trim();
        });
        save();
      },
      remove(id) {
        list = list.filter((x) => x.id !== id);
        save();
      },
      // 書き出し・読み込み(機種変更など。サーバーは使わない)
      exportText() {
        return JSON.stringify({ app: "chunk-notebook", v: 1, at: Date.now(), list });
      },
      importText(txt) {
        let d;
        try {
          d = JSON.parse(txt);
        } catch (e) {
          return -1;
        }
        const arr = Array.isArray(d) ? d : d && Array.isArray(d.list) ? d.list : null;
        if (!arr) return -1;
        const before = list.length;
        arr.forEach((it) => it && this.add({ en: it.en, ja: it.ja, kind: it.kind, src: it.src, note: it.note, marks: Array.isArray(it.marks) ? it.marks : [] }, true));
        save();
        return list.length - before;
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/plays.js
  var WANTS = [
    { k: "word", n: "\u5358\u8A9E" },
    { k: "read", n: "\u8AAD\u3080" },
    { k: "make", n: "\u6587\u3092\u4F5C\u308B" },
    { k: "talk", n: "\u8A71\u3059\u30FB\u805E\u304F" },
    { k: "chill", n: "\u307E\u3063\u305F\u308A" }
  ];
  var MOODS = [{ k: "study", n: "\u52C9\u5F37" }, { k: "game", n: "\u30B2\u30FC\u30E0" }, { k: "any", n: "\u6C7A\u3081\u3066\u306A\u3044" }];
  var TIMES = [{ k: 5, n: "5\u5206" }, { k: 15, n: "15\u5206" }, { k: 30, n: "\u3058\u3063\u304F\u308A" }];
  var PLAYS = [
    { id: "stream.word", n: "\u5358\u8A9E\u7DF4\u7FD2(\u30B9\u30C8\u30EA\u30FC\u30E0)", want: "word", mood: "both", time: [5, 15], place: "school", go: { game: "stream" } },
    { id: "note.practice", n: "\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u306E\u3084\u308A\u76F4\u3057", want: "word", mood: "study", time: [5, 15, 30], place: "home", go: { to: "note" } },
    { id: "test", n: "\u5B9F\u529B\u30C6\u30B9\u30C8", want: "word", mood: "study", time: [5, 15], place: "school", go: { to: "test" } },
    { id: "eigo.prac", n: "\u719F\u8A9E\u30FB\u53E5\u52D5\u8A5E\u306E\u308C\u3093\u3057\u3085\u3046(\u82F1\u8A9E\u8133)", want: "word", mood: "study", time: [15, 30], place: "school", go: { game: "eigonou" } },
    { id: "lib.weekly", n: "\u8AB2\u984C\u56F3\u66F8\u3092\u8AAD\u3080", want: "read", mood: "study", time: [15, 30], place: "library", go: { game: "library", opts: { tab: "weekly" } } },
    { id: "stream.read", n: "\u9577\u6587\u3092\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u8AAD\u3080", want: "read", mood: "both", time: [5, 15], place: "library", go: { game: "library", opts: { tab: "level" } } },
    { id: "cc.read", n: "\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0(\u8AAD\u3080\u30FB\u89E3\u304F)", want: "read", mood: "study", time: [15, 30], place: "library", go: { game: "library", opts: { tab: "featured" } } },
    { id: "cc.game", n: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\u306E\u30C1\u30E3\u30EC\u30F3\u30B8", want: "read", mood: "game", time: [5], place: "game", go: { game: "chunkchunk", opts: { face: "arcade" } } },
    { id: "cc.lesson", n: "\u30C1\u30E3\u30F3\u30AF\u30EC\u30C3\u30B9\u30F3", want: "make", mood: "study", time: [15, 30], place: "school", go: { game: "chunkchunk", opts: { face: "lesson" } } },
    { id: "eigo", n: "\u82F1\u8A9E\u8133\u3067\u6587\u3092\u4F5C\u308B", want: "make", mood: "study", time: [15, 30], place: "library", go: { game: "eigonou" } },
    { id: "cards", n: "\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9", want: "make", mood: "game", time: [5, 15], place: "game", go: { game: "cards" } },
    { id: "listen", n: "\u30E9\u30F3\u30C0\u30E0\u30C1\u30E3\u30F3\u30AF(\u805E\u304D\u53D6\u308A)", want: "talk", mood: "game", time: [5, 15], place: "game", go: { game: "listen" } },
    { id: "note.mimic", n: "\u805E\u3044\u3066\u307E\u306D\u308B(\u52C9\u5F37\u30CE\u30FC\u30C8)", want: "talk", mood: "study", time: [5, 15], place: "home", go: { to: "note", kind: "short" } },
    { id: "town.chat", n: "\u4F4F\u4EBA\u3068\u82F1\u8A9E\u3067\u304A\u3057\u3083\u3079\u308A", want: "talk", mood: "both", time: [5, 15, 30], place: "town", go: { to: "3d" } },
    { id: "town.ogiri", n: "\u82F1\u8A9E\u3067\u5927\u559C\u5229", want: "chill", mood: "any", time: [15], place: "town", go: { to: "3d" } },
    { id: "town.walk", n: "\u753A\u3092\u6563\u6B69(\u683C\u8A00\u30FB\u30CF\u30FC\u30E2\u30CB\u30AB\u30FB\u304A\u307F\u304F\u3058)", want: "chill", mood: "any", time: [5, 15, 30], place: "town", go: { to: "3d" } },
    { id: "eigo.dict", n: "\u82F1\u8A9E\u8133\u3067\u6C17\u306B\u306A\u308B\u8A00\u8449\u3092\u8ABF\u3079\u308B", want: "chill", mood: "study", time: [5, 15], place: "library", go: { game: "eigonou" } }
  ];
  var playOf = (id) => PLAYS.find((p) => p.id === id) || null;

  // core/record.js
  var day = (d = /* @__PURE__ */ new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4);
    return z.toISOString().slice(0, 10);
  };
  function createRecord(events, notebook) {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    const R = Object.assign({ days: {}, last: null, goal: { min: 15 } }, st.get("record") || {});
    const save = () => {
      st.set("record", R);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    const today = () => R.days[day()] = R.days[day()] || { min: {}, plays: {}, words: 0, done: 0 };
    events.on((game, name, d = {}) => {
      if (name === "done") {
        const p = playOf(d.play) || { want: "chill" }, t = today(), m = Math.max(0, Math.min(180, +d.min || 0));
        t.min[p.want] = Math.round(((t.min[p.want] || 0) + m) * 10) / 10;
        t.plays[d.play || game] = (t.plays[d.play || game] || 0) + 1;
        const bk = d.book || (d.passage && d.whole ? "st:" + d.passage : null);
        if (bk && d.finished) {
          R.books = R.books || {};
          R.books[bk] = (R.books[bk] || 0) + 1;
        }
        t.words += Math.max(0, +d.words || 0) | 0;
        t.done++;
        if (Array.isArray(d.missed) && d.missed.length) notebook.addMany(d.missed.slice(0, 50).map((x) => ({ ...x, src: x.src || (p.n || game), marks: ["miss"] })));
        if (R.last && R.last.play === d.play && d.finished) R.last = null;
        save();
      } else if (name === "word") {
        notebook.add({ ...d, src: d.src || game });
      } else if (name === "resume") {
        R.last = { game, play: d.play || "", label: String(d.label || ""), opts: d.opts || {}, at: Date.now() };
        save();
      }
    });
    const sumMin = (t) => Object.values(t && t.min || {}).reduce((a, b) => a + b, 0);
    return {
      today: () => JSON.parse(JSON.stringify(today())),
      days(n = 7) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
          const d = /* @__PURE__ */ new Date();
          d.setDate(d.getDate() - i);
          const k = day(d);
          out.push({ day: k, ...R.days[k] || { min: {}, plays: {}, words: 0, done: 0 } });
        }
        return out;
      },
      streak() {
        let n = 0;
        const d = /* @__PURE__ */ new Date();
        if (!sumMin(R.days[day(d)]) && !(R.days[day(d)] || {}).done) d.setDate(d.getDate() - 1);
        while ((R.days[day(d)] || {}).done) {
          n++;
          d.setDate(d.getDate() - 1);
        }
        return n;
      },
      sumMin,
      total: (id) => Object.values(R.days).reduce((a, d) => a + ((d.plays || {})[id] || 0), 0),
      // これまでの回数
      bookDone: (id) => !!(R.books || {})[id],
      // その本を最後まで読んだ(通しクリアした)ことがあるか
      last: () => R.last,
      // メダル:課題(ミッション)を1つでもクリアした日・目標の勉強時間をこなした日・英語ゲームをした日が、何日続いたか
      markMission() {
        const t = today();
        t.mis = (t.mis || 0) + 1;
        save();
      },
      medalDay(k) {
        const t = R.days[k];
        return !!t && (sumMin(t) >= R.goal.min || (t.mis || 0) > 0 || ((t.plays || {})["gamebox.en"] || 0) > 0);
      },
      medalStreak() {
        const d = /* @__PURE__ */ new Date();
        if (!this.medalDay(day(d))) d.setDate(d.getDate() - 1);
        let n = 0;
        while (this.medalDay(day(d))) {
          n++;
          d.setDate(d.getDate() - 1);
        }
        return n;
      },
      medals() {
        R.medals = R.medals || {};
        const s = this.medalStreak();
        let ch = false;
        for (const n of [3, 7, 14, 30, 60, 100, 200, 365]) if (s >= n && !R.medals[n]) {
          R.medals[n] = day();
          ch = true;
        }
        if (ch) save();
        return Object.keys(R.medals).map(Number);
      },
      daysSince(id) {
        const ks = Object.keys(R.days).filter((k) => (R.days[k].plays || {})[id]).sort();
        if (!ks.length) return 999;
        return Math.floor((new Date(day()) - new Date(ks[ks.length - 1])) / 864e5);
      },
      // その遊びを最後にした日から何日
      clearLast() {
        R.last = null;
        save();
      },
      goal: () => R.goal,
      setGoal(min) {
        R.goal.min = Math.max(5, Math.min(120, Math.round(+min) || 15));
        save();
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/daylog.js
  var DAY_START_H = 4;
  var IDLE_SEC = 120;
  var FORCE_N = 20;
  var FORCE_DAYS = 3;
  var CATS = {
    study: { n: "\u52C9\u5F37", top: "study", col: "#5aa8f0" },
    tv: { n: "\u30C6\u30EC\u30D3\u30B2\u30FC\u30E0", top: "play", col: "#ff7aa2" },
    sport: { n: "\u5B63\u7BC0\u306E\u30B9\u30DD\u30FC\u30C4", top: "play", col: "#f5b83d" },
    relax: { n: "\u8857\u3067\u307E\u3063\u305F\u308A", top: "relax", col: "#8fe0b0" }
  };
  var TOPS = { study: { n: "\u52C9\u5F37", col: "#5aa8f0" }, play: { n: "\u904A\u3073", col: "#ff7aa2" }, relax: { n: "\u8857\u3067\u307E\u3063\u305F\u308A", col: "#8fe0b0" } };
  var dayKey = (d = /* @__PURE__ */ new Date()) => {
    const z = new Date(d.getTime() - DAY_START_H * 36e5);
    return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
  };
  var dayNum = (k) => Math.round(Date.parse(k + "T00:00:00Z") / 864e5);
  function createDayLog(core2) {
    const st = createStore("core");
    const S = Object.assign({ days: {}, total: {}, queue: [], known: {}, graceAt: null, lastEnter: null, lastTest: null }, st.get("daylog") || {});
    const L = { chat: null, sub: null, app: null, base: null };
    let lastTouch = Date.now(), tickN = 0, dirty = false;
    const subs = /* @__PURE__ */ new Set();
    const dayOf = (k = dayKey()) => S.days[k] = S.days[k] || { t: {}, words: {}, rev: null, pts: {} };
    function save() {
      dirty = false;
      const ks = Object.keys(S.days).sort();
      while (ks.length > 120) delete S.days[ks.shift()];
      st.set("daylog", S);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    }
    const cur = () => L.chat || L.sub || L.app || L.base;
    ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"].forEach((ev) => document.addEventListener(ev, () => {
      lastTouch = Date.now();
    }, { passive: true, capture: true }));
    const timer = setInterval(() => {
      const c = cur();
      if (!c || document.visibilityState !== "visible" || Date.now() - lastTouch > IDLE_SEC * 1e3) return;
      const k = c.cat + "/" + c.label, d = dayOf();
      d.t[k] = (d.t[k] || 0) + 1;
      S.total[k] = (S.total[k] || 0) + 1;
      dirty = true;
      if (++tickN % 10 === 0) save();
    }, 1e3);
    const flush = () => {
      if (dirty) save();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    const api = {
      act(layer, v) {
        if (layer in L) L[layer] = v && v.cat ? { cat: v.cat, label: String(v.label || v.cat) } : null;
      },
      current: () => cur(),
      // ---- 時間のまとめ ----
      summary(k = dayKey()) {
        const d = S.days[k] || { t: {} }, items = [], by = { study: 0, tv: 0, sport: 0, relax: 0 };
        for (const [key2, s] of Object.entries(d.t)) {
          const i = key2.indexOf("/"), cat = key2.slice(0, i);
          if (!(cat in by)) continue;
          by[cat] += s;
          items.push({ cat, label: key2.slice(i + 1), sec: s });
        }
        items.sort((a, b) => b.sec - a.sec);
        return { day: k, by, study: by.study, play: by.tv + by.sport, relax: by.relax, total: by.study + by.tv + by.sport + by.relax, items };
      },
      totalSummary() {
        const items = [], by = { study: 0, tv: 0, sport: 0, relax: 0 };
        for (const [key2, s] of Object.entries(S.total)) {
          const i = key2.indexOf("/"), cat = key2.slice(0, i);
          if (!(cat in by)) continue;
          by[cat] += s;
          items.push({ cat, label: key2.slice(i + 1), sec: s });
        }
        items.sort((a, b) => b.sec - a.sec);
        return { by, items, days: Object.keys(S.days).length };
      },
      // ---- 単語・文(その日に出会ったもの) ----
      // d: {en, ja(すべての意味), pos, kind:'word'|'sentence', src, miss:true/false, multi:意味の数, slow:true}
      addWord(d) {
        if (!d || !d.en) return;
        const day2 = dayOf(), key2 = String(d.en).toLowerCase().trim(), w = day2.words[key2] || (day2.words[key2] = { en: d.en, ja: "", pos: "", kind: d.kind || "word", src: "", miss: false, multi: 0, slow: false, n: 0 });
        w.n++;
        if (d.ja) w.ja = d.ja;
        if (d.pos) w.pos = d.pos;
        if (d.src) w.src = d.src;
        if (d.miss) w.miss = true;
        if (d.slow) w.slow = true;
        w.multi = Math.max(w.multi || 0, d.multi || 0);
        dirty = true;
        if (d.slow && !S.queue.some((q) => q.en.toLowerCase() === key2)) S.queue.push({ ...w, added: dayKey(), unk: 1, slow: true });
      },
      words(k = dayKey()) {
        return Object.values((S.days[k] || { words: {} }).words);
      },
      wordCount: (k = dayKey()) => Object.keys((S.days[k] || { words: {} }).words).length,
      // ---- ふりかえり(復習) ----
      // 前回までに残っているもの:覚えていないキュー+ふりかえりをしなかった日の単語。新しい順
      pending() {
        const today = dayKey(), out = /* @__PURE__ */ new Map();
        S.queue.forEach((w) => out.set(w.en.toLowerCase(), w));
        for (const k of Object.keys(S.days).sort()) {
          if (k >= today) continue;
          const d = S.days[k];
          if (d.rev || d.carried) continue;
          Object.values(d.words).forEach((w) => {
            const key2 = w.en.toLowerCase();
            if (!out.has(key2)) out.set(key2, { ...w, day: k, unk: 0 });
          });
        }
        return [...out.values()];
      },
      // 前回(きのう)のふりかえりを忘れていたか(単語があったのに「今日はここまで」を押していない)
      forgotten() {
        const today = dayKey();
        const ks = Object.keys(S.days).filter((k) => k < today).sort();
        const last = ks[ks.length - 1];
        if (!last) return null;
        const d = S.days[last];
        return !d.rev && Object.keys(d.words).length ? last : null;
      },
      forced() {
        const q = api.pending();
        if (!q.length) return false;
        if (q.length >= FORCE_N) return true;
        const old = q.reduce((m, w) => Math.min(m, dayNum(w.added || w.day || dayKey())), 1e9);
        return dayNum(dayKey()) - old >= FORCE_DAYS;
      },
      // 復習の結果をしまう:known=覚えている → キューから外す / 覚えていない → キューに残す
      finishReview(k, results) {
        const d = dayOf(k);
        const q = new Map(S.queue.map((w) => [w.en.toLowerCase(), w]));
        S.known = S.known || {};
        for (const r of results) {
          const key2 = r.en.toLowerCase();
          if (r.known) {
            q.delete(key2);
            S.known[key2] = 1;
          } else {
            delete S.known[key2];
            const o = q.get(key2) || { ...r.item, added: k, unk: 0 };
            o.unk = (o.unk || 0) + 1;
            delete o.known;
            q.set(key2, o);
          }
        }
        S.queue = [...q.values()].slice(-300);
        Object.keys(S.days).forEach((x) => {
          if (x < dayKey()) S.days[x].carried = true;
        });
        d.rev = { at: Date.now(), n: results.length, known: results.filter((r) => r.known).length };
        save();
      },
      reviewed: (k = dayKey()) => !!(S.days[k] && S.days[k].rev),
      // ---- ポイント・「1日のいろいろ」のしるし(日ごと) ----
      flag(name, v = true, k = dayKey()) {
        const d = dayOf(k);
        if (d.pts[name] === v) return;
        d.pts[name] = v;
        save();
      },
      flagged: (name, k = dayKey()) => !!(S.days[k] && S.days[k].pts[name]),
      flags: (k = dayKey()) => ({ ...(S.days[k] || {}).pts || {} }),
      enqueue(list) {
        const q = new Map(S.queue.map((w) => [w.en.toLowerCase(), w]));
        S.known = S.known || {};
        list.forEach((w) => {
          const k = w.en.toLowerCase();
          delete S.known[k];
          const o = q.get(k) || { ...w, added: dayKey(), unk: 0 };
          o.unk = (o.unk || 0) + 1;
          q.set(k, o);
        });
        S.queue = [...q.values()].slice(-300);
        save();
      },
      lastTest: () => S.lastTest,
      setTest(k) {
        S.lastTest = k;
        save();
      },
      // 今までに出会った言葉(意味つき)すべて。定期の単語テストの出題もと
      knownKeys: () => Object.keys(S.known || {}),
      // フラッシュカードで「覚えてる」にした言葉(テストには出さない)
      pool() {
        const m = /* @__PURE__ */ new Map();
        Object.values(S.days).forEach((d) => Object.values(d.words).forEach((w) => {
          if (w.ja && w.kind !== "sentence") m.set(w.en.toLowerCase(), w);
        }));
        S.queue.forEach((w) => {
          if (w.ja && w.kind !== "sentence") m.set(w.en.toLowerCase(), w);
        });
        return [...m.values()].filter((w) => !(S.known || {})[w.en.toLowerCase()]);
      },
      graceAt: () => S.graceAt,
      setGrace(k) {
        S.graceAt = k;
        save();
      },
      lastEnter: () => S.lastEnter,
      setEnter(k) {
        S.lastEnter = k;
        save();
      },
      prevDay() {
        const ks = Object.keys(S.days).filter((k) => k < dayKey()).sort();
        return ks[ks.length - 1] || null;
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      },
      save,
      dayKey,
      destroy() {
        clearInterval(timer);
      }
    };
    core2.events.on((game, name, d = {}) => {
      if (name === "done" && Array.isArray(d.missed)) d.missed.slice(0, 50).forEach((x) => api.addWord({ en: x.en, ja: x.ja, src: x.src || game, miss: true }));
      else if (name === "word" && d.en) api.addWord({ en: d.en, ja: d.ja || "", src: d.src || game, kind: d.kind === "quote" || d.kind === "sentence" || d.kind === "short" ? "sentence" : "word" });
    });
    return api;
  }

  // core/study.js
  var esc2 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var SRC = { stream: "\u30B9\u30C8\u30EA\u30FC\u30E0", chunkchunk: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF", eigonou: "\u82F1\u8A9E\u8133", cards: "\u30AB\u30FC\u30C9", town3d: "3D\u306E\u753A", note: "\u624B\u6253\u3061" };
  function createStudy(core2) {
    let ov = null, tab = "today", kind = "word", mark = "", opt = {};
    const rec = core2.record, nb = core2.notebook;
    const canPlay = (g) => typeof opt.play === "function" && (!opt.has || opt.has(g));
    const close = () => {
      if (!ov) return;
      ov.remove();
      ov = null;
      offs.forEach((f) => f());
      offs = [];
    };
    let offs = [];
    function open(o = {}) {
      opt = o;
      if (ov) close();
      if (o.tab) tab = o.tab;
      if (o.kind) kind = o.kind;
      if (o.mark != null) mark = o.mark;
      ov = document.createElement("div");
      ov.className = "cs-ov cs-study-ov";
      ov.innerHTML = `<div class="cs-study" role="dialog" aria-label="\u52C9\u5F37\u90E8\u5C4B"><header><b>\u52C9\u5F37\u90E8\u5C4B</b><button class="cs-x" aria-label="\u3068\u3058\u308B">\u2715</button></header>
      <nav class="cs-tabs">${[["today", "\u4ECA\u65E5"], ["log", "\u8A18\u9332"], ["note", "\u52C9\u5F37\u30CE\u30FC\u30C8"], ["me", "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB"]].map(([k, n]) => `<button data-t="${k}">${n}</button>`).join("")}</nav><main></main></div>`;
      core2.ui.root.appendChild(ov);
      ov.querySelector(".cs-x").onclick = close;
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close();
      });
      ov.querySelectorAll(".cs-tabs button").forEach((b) => b.onclick = () => {
        tab = b.dataset.t;
        draw();
      });
      offs.push(nb.onChange(() => tab === "note" && draw()), rec.onChange(() => tab !== "note" && draw()), core2.member.onChange(() => tab !== "note" && draw()), core2.level.onChange(() => tab === "today" && draw()));
      draw();
    }
    const go = (g, o) => {
      close();
      opt.play(g, o);
    };
    function draw() {
      if (!ov) return;
      ov.querySelectorAll(".cs-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
      const m = ov.querySelector("main");
      m.scrollTop = 0;
      m.innerHTML = tab === "today" ? today() : tab === "log" ? log() : tab === "note" ? note() : me();
      bind(m);
    }
    function today() {
      const t = rec.today(), mins = rec.sumMin(t), goal = rec.goal().min, pct = Math.min(100, Math.round(mins / goal * 100)), last = rec.last();
      const plays = Object.entries(t.plays).map(([id, n]) => `<li><span>${esc2((playOf(id) || {}).n || id)}</span><b>${n}\u56DE</b></li>`).join("");
      return `<section class="cs-panel"><div class="cs-goal"><span>\u4ECA\u65E5 <b>${Math.round(mins)}</b>\u5206 / \u76EE\u6A19 ${goal}\u5206</span>
        <select data-goal>${[5, 10, 15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${v === goal ? "selected" : ""}>\u76EE\u6A19 ${v}\u5206</option>`).join("")}</select></div>
        <div class="cs-bar"><i style="width:${pct}%"></i></div>
        <p class="cs-sub">\u7D9A\u3051\u305F\u65E5\u6570 <b>${rec.streak()}</b>\u65E5 \u30FB \u30B3\u30A4\u30F3 <b>${core2.wallet.get()}</b></p></section>
      ${(() => {
        const m = core2.mission.current();
        return m && m.date === core2.member.keys.dayKey() ? `<section class="cs-panel"><h4>${m.done ? "\u30AF\u30EA\u30A2\u3057\u305F\u30DF\u30C3\u30B7\u30E7\u30F3" : "\u3044\u307E\u306E\u30DF\u30C3\u30B7\u30E7\u30F3"}</h4><div class="cs-mis"><b>${esc2(m.title)}</b><small>${m.done ? "\u30AF\u30EA\u30A2!" : esc2(m.how)}</small></div></section>` : "";
      })()}
      <button class="cs-btn cs-go cs-big" data-today>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</button>
      ${lvCard()}
      ${last && canPlay(last.game) ? `<button class="cs-btn cs-resume" data-resume>\u3064\u3065\u304D\u304B\u3089:${esc2(last.label || (playOf(last.play) || {}).n || "")}</button>` : ""}
      <section class="cs-panel"><h4>\u4ECA\u65E5\u3084\u3063\u305F\u3053\u3068</h4>${plays ? `<ul class="cs-stat">${plays}</ul>` : '<p class="cs-sub">\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u7D42\u308F\u3063\u305F\u904A\u3073\u304C\u3053\u3053\u306B\u5165\u308A\u307E\u3059\u3002</p>'}</section>`;
    }
    function lvCard() {
      const L = core2.level;
      if (!L) return "";
      const sc = L.score(), nx = sc.next, pct = nx ? Math.round((sc.total - nx.from) / (nx.at - nx.from) * 100) : 100;
      return `<section class="cs-panel"><div class="cs-goal"><span>${L.lv ? "\u30EC\u30D9\u30EB " + L.name() : "\u30EC\u30D9\u30EB \u307E\u3060"} \u30FB ${sc.rank}</span><b>${sc.total}\u70B9</b></div>
      <div class="cs-bar"><i style="width:${pct}%"></i></div><p class="cs-sub">${nx ? `${nx.name}\u307E\u3067 \u3042\u3068${nx.need}\u70B9` : "\u6700\u9AD8\u30E9\u30F3\u30AF"} \u30FB ${sc.parts.map((p) => `${p.n} ${p.v}`).join(" \u30FB ")}</p>
      ${L.lv ? `<p class="cs-sub">\u63A8\u5B9A\u8A9E\u5F59 \u7D04${(L.vocab() || 0).toLocaleString()}\u8A9E</p>` : ""}
      <div class="cs-adm-row">${!L.lv ? '<button class="cs-btn cs-go" data-place>\u30EC\u30D9\u30EB\u8A3A\u65AD(\u7D0420\u554F)</button>' : L.testLeft() > 0 ? `<span class="cs-sub">\u5B9F\u529B\u30C6\u30B9\u30C8\u307E\u3067 \u30DF\u30C3\u30B7\u30E7\u30F3\u3042\u3068${L.testLeft()}\u500B</span>` : '<button class="cs-btn cs-go" data-test>\u5B9F\u529B\u30C6\u30B9\u30C8\u3092\u53D7\u3051\u308B</button>'}</div></section>`;
    }
    function log() {
      const ds = rec.days(7), max = Math.max(10, ...ds.map((d) => rec.sumMin(d)));
      const cols = ds.map((d) => `<div class="cs-col7"><div class="cs-stack">${WANTS.map((w) => {
        const v = d.min[w.k] || 0;
        return v ? `<i class="w-${w.k}" style="height:${v / max * 100}%" title="${w.n} ${Math.round(v)}\u5206"></i>` : "";
      }).join("")}</div><small>${+d.day.slice(8)}\u65E5</small></div>`).join("");
      const wk = {};
      ds.forEach((d) => WANTS.forEach((w) => wk[w.k] = (wk[w.k] || 0) + (d.min[w.k] || 0)));
      const words = ds.reduce((a, d) => a + (d.words || 0), 0);
      return `<section class="cs-panel"><h4>\u3053\u306E7\u65E5\u9593(\u5206)</h4><div class="cs-week">${cols}</div>
        <div class="cs-key">${WANTS.map((w) => `<span><i class="w-${w.k}"></i>${w.n} ${Math.round(wk[w.k])}\u5206</span>`).join("")}</div></section>
      <section class="cs-panel"><ul class="cs-stat"><li><span>\u8AAD\u3093\u3060\u8A9E\u6570(7\u65E5)</span><b>${words}\u8A9E</b></li><li><span>\u52C9\u5F37\u30CE\u30FC\u30C8\u306E\u8A00\u8449</span><b>${nb.count()}\u500B</b></li><li><span>\u307E\u3061\u304C\u3048\u305F\u8A00\u8449</span><b>${nb.list({ mark: "miss" }).length}\u500B</b></li></ul></section>`;
    }
    function note() {
      const items = nb.list({ kind, mark }), withJa = items.filter((x) => x.ja);
      const practice = (kind === "word" || kind === "phrase") && canPlay("stream") && withJa.length >= 4;
      return `<nav class="cs-chips">${KINDS.map((k) => `<button data-kind="${k.k}" class="${k.k === kind ? "on" : ""}">${k.n} ${nb.count(k.k)}</button>`).join("")}</nav>
      <nav class="cs-chips cs-marks"><button data-mark="" class="${!mark ? "on" : ""}">\u305C\u3093\u3076</button>${MARKS.map((x) => `<button data-mark="${x.k}" class="${x.k === mark ? "on" : ""}">${x.n}</button>`).join("")}</nav>
      ${practice ? `<div class="cs-practice"><b>\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u7DF4\u7FD2</b>${withJa.length > 20 ? `<button class="cs-btn cs-go" data-practice="r">\u30E9\u30F3\u30C0\u30E020\u500B</button>` : ""}${Array.from({ length: Math.min(30, Math.ceil(withJa.length / 20)) }, (_, k) => `<button class="cs-btn${withJa.length <= 20 ? " cs-go" : ""}" data-practice="${k}">${k * 20 + 1}\u301C${Math.min(withJa.length, k * 20 + 20)}</button>`).join("")}</div>` : ""}
      <form class="cs-add" data-add><input name="en" placeholder="\u82F1\u8A9E" autocomplete="off" autocapitalize="off" spellcheck="false" required><input name="ja" placeholder="\u65E5\u672C\u8A9E" autocomplete="off"><button class="cs-btn">\u767B\u9332</button></form>
      <div class="cs-io"><button class="cs-btn" data-exp>\u{1F4E4} \u66F8\u304D\u51FA\u3059</button><button class="cs-btn" data-imp>\u{1F4E5} \u8AAD\u307F\u8FBC\u3080</button><small>\u30CE\u30FC\u30C8\u306F\u3053\u306E\u7AEF\u672B\u306E\u4E2D\u3060\u3051\u306B\u4FDD\u5B58\u3002\u6A5F\u7A2E\u5909\u66F4\u306E\u3068\u304D\u306F\u66F8\u304D\u51FA\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u3092\u65B0\u3057\u3044\u7AEF\u672B\u3067\u8AAD\u307F\u8FBC\u3093\u3067\u306D</small></div>
      ${items.length ? `<ul class="cs-nb">${items.slice(0, 300).map((x) => `<li data-id="${x.id}"><div class="cs-nb-t"><b>${esc2(x.en)}</b><span>${esc2(x.ja)}</span><small>${esc2(SRC[x.src] || x.src)}</small></div>
          <div class="cs-nb-a"><button data-say aria-label="\u8AAD\u307F\u4E0A\u3052">\u{1F50A}</button><button data-use class="cs-use">\u4F7F\u3063\u3066\u307F\u308B</button>${MARKS.map((k) => `<button data-m="${k.k}" class="${x.marks.includes(k.k) ? "on" : ""}">${k.n}</button>`).join("")}<button data-del class="cs-del" aria-label="\u6D88\u3059">\u{1F5D1}</button></div></li>`).join("")}</ul>` : '<p class="cs-sub">\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u30B2\u30FC\u30E0\u3067\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u3084\u3001\u5404\u30A2\u30D7\u30EA\u3067\u767B\u9332\u3057\u305F\u8A00\u8449\u304C\u3053\u3053\u306B\u96C6\u307E\u308A\u307E\u3059\u3002\u4E0A\u306E\u6B04\u304B\u3089\u624B\u6253\u3061\u3067\u3082\u767B\u9332\u3067\u304D\u307E\u3059\u3002</p>'}`;
    }
    function me() {
      const p = core2.profile;
      return `<section class="cs-panel"><div class="cs-prof"><img src="${p.avatarURL()}" alt="\u30A2\u30D0\u30BF\u30FC"><div><label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input data-name maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc2(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D(\u3044\u307E\u306F\u4EEE\u306E\u7D75)\u3002</p></section>
      <section class="cs-panel"><ul class="cs-stat"><li><span>\u4F1A\u54E1</span><b>${core2.member.isPaid() ? "\u6709\u6599\u4F1A\u54E1" : "\u7121\u6599\u4F1A\u54E1"}</b></li><li><span>\u30B3\u30A4\u30F3</span><b>${core2.wallet.get()}(\u6708\u66FF\u308F\u308A\u306B\u6B8B\u305B\u308B\u4E0A\u9650 ${core2.member.coinCapText()})</b></li><li><span>\u30C0\u30A4\u30E4</span><b>${core2.member.gems()}</b></li><li><span>\u5171\u6709\u306E\u6559\u6750\u306E\u67A0</span><b>${core2.member.slots().length} / ${core2.member.slotMax()}</b></li>${core2.member.isPaid() ? `<li><span>\u4ECA\u6708\u306EAI\u306E\u56DE\u6570</span><b>\u3042\u3068${core2.member.aiLeft()}\u56DE</b></li>` : ""}</ul>
      ${core2.member.today().cmLeft > 0 ? `<button class="cs-btn" data-cm>CM\u3092\u898B\u3066\u30B3\u30A4\u30F3 +${core2.econ.daily.cm.each}(\u4ECA\u65E5\u3042\u3068${core2.member.today().cmLeft}\u56DE)</button>` : ""}</section>
      <button class="cs-btn" data-settings>\u8A2D\u5B9A</button>`;
    }
    function bind(m) {
      const q = (s) => m.querySelector(s);
      if (q("[data-goal]")) q("[data-goal]").onchange = (e) => rec.setGoal(e.target.value);
      if (q("[data-today]")) q("[data-today]").onclick = () => {
        close();
        core2.today.open({ has: opt.has });
      };
      if (q("[data-test]")) q("[data-test]").onclick = () => core2.level.test();
      if (q("[data-place]")) q("[data-place]").onclick = () => core2.level.placement();
      if (q("[data-resume]")) q("[data-resume]").onclick = () => {
        const l = rec.last();
        go(l.game, l.opts);
      };
      if (q("[data-name]")) q("[data-name]").onchange = (e) => core2.profile.setName(e.target.value);
      if (q("[data-settings]")) q("[data-settings]").onclick = () => core2.ui.settings();
      if (q("[data-cm]")) q("[data-cm]").onclick = () => {
        const g = core2.member.earn("cm");
        core2.ui.toast(g ? `\u30B3\u30A4\u30F3 +${g}(CM\u306F\u30A2\u30D7\u30EA\u306B\u3057\u305F\u3068\u304D\u306B\u672C\u7269\u3092\u5165\u308C\u307E\u3059)` : "\u4ECA\u65E5\u306F\u3082\u3046\u898B\u3089\u308C\u307E\u305B\u3093");
        draw();
      };
      m.querySelectorAll("[data-kind]").forEach((b) => b.onclick = () => {
        kind = b.dataset.kind;
        draw();
      });
      m.querySelectorAll("[data-mark]").forEach((b) => b.onclick = () => {
        mark = b.dataset.mark;
        draw();
      });
      m.querySelectorAll("[data-practice]").forEach((b) => b.onclick = () => {
        const all = nb.list({ kind, mark }).filter((x) => x.ja), p = b.dataset.practice;
        const pick = p === "r" ? all.slice().sort(() => Math.random() - 0.5).slice(0, 20) : all.slice(+p * 20, +p * 20 + 20);
        go("stream", { words: pick.map((x) => [x.en, x.ja]), title: "\u52C9\u5F37\u30CE\u30FC\u30C8:" + KINDS.find((k) => k.k === kind).n + (mark ? "(" + MARKS.find((k) => k.k === mark).n + ")" : "") + (p === "r" ? " \u30E9\u30F3\u30C0\u30E0" : ` ${+p * 20 + 1}\u301C`) });
      });
      if (q("[data-exp]")) q("[data-exp]").onclick = async () => {
        const txt = nb.exportText(), d = /* @__PURE__ */ new Date(), name = `chunk-note-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
        try {
          const f = new File([txt], name, { type: "application/json" });
          if (navigator.canShare && navigator.canShare({ files: [f] })) {
            await navigator.share({ files: [f], title: "\u52C9\u5F37\u30CE\u30FC\u30C8" });
            return;
          }
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
        try {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
          }, 2e3);
          core2.ui.toast("\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F");
        } catch (e) {
          try {
            await navigator.clipboard.writeText(txt);
            core2.ui.toast("\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F(\u30E1\u30E2\u306A\u3069\u306B\u8CBC\u3063\u3066\u4FDD\u5B58\u3057\u3066\u306D)");
          } catch (e2) {
            core2.ui.toast("\u66F8\u304D\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F");
          }
        }
      };
      if (q("[data-imp]")) q("[data-imp]").onclick = () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".json,application/json,text/plain";
        inp.onchange = async () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          const n = nb.importText(await f.text());
          core2.ui.toast(n < 0 ? "\u30CE\u30FC\u30C8\u306E\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u306A\u3044\u307F\u305F\u3044" : `${n}\u500B \u3075\u3048\u307E\u3057\u305F`);
        };
        inp.click();
      };
      if (q("[data-add]")) q("[data-add]").onsubmit = (e) => {
        e.preventDefault();
        const f = e.target, en = f.en.value.trim(), ja = f.ja.value.trim();
        if (!/[a-zA-Z]/.test(en)) {
          core2.ui.toast("\u82F1\u8A9E\u3092\u5165\u308C\u3066\u304F\u3060\u3055\u3044");
          return;
        }
        const it = nb.add({ en, ja, kind: kind === "quote" ? "quote" : void 0, src: "note", marks: mark ? [mark] : [] });
        if (it && it.kind !== kind) {
          kind = it.kind;
          draw();
        }
        core2.ui.toast("\u767B\u9332\u3057\u307E\u3057\u305F");
      };
      m.querySelectorAll(".cs-nb li").forEach((li) => {
        const id = li.dataset.id, x = nb.list().find((y) => y.id === id);
        li.querySelector("[data-say]").onclick = () => core2.speech.speak(x.en);
        li.querySelector("[data-use]").onclick = () => core2.useit.open(x);
        li.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => nb.mark(id, b.dataset.m));
        li.querySelector("[data-del]").onclick = () => nb.remove(id);
      });
    }
    return { open, close, get isOpen() {
      return !!ov;
    } };
  }

  // core/import.js
  var json = (v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  };
  function importOld(nb) {
    const st = createStore("core"), done = st.get("nbImport") || {};
    const run = (key2, fn) => {
      if (done[key2]) return;
      try {
        const items = fn() || [];
        if (items.length) nb.addMany(items);
        done[key2] = Date.now();
      } catch (e) {
        console.warn("import", key2, e);
      }
    };
    run("stream", () => (json(createStore("stream").get("cs-wordlists")) || []).flatMap((L) => (L.lines || []).map((l) => {
      const c = String(l).split("	");
      return { en: c[0], ja: c[1] || "", src: "stream" };
    })));
    run("eigonou", () => {
      const db = createStore("eigonou").get("db") || {};
      return (db.sets || []).flatMap((s) => [
        ...(s.items || []).filter((it) => String(it.id || "").startsWith("u") && it.en).map((it) => ({ en: it.en, ja: it.ja || "", src: "eigonou" })),
        ...(s.sentences || []).map((x) => ({ en: x.en, ja: x.ja || "", kind: "short", src: "eigonou" }))
      ]);
    });
    run("town3d", () => {
      let n = null;
      try {
        n = JSON.parse(localStorage.getItem("town:notes"));
      } catch (e) {
      }
      return (n || []).map((x) => ({ en: x.text, ja: x.meaning || "", kind: x.kind === "quote" ? "quote" : x.kind === "sentence" ? "short" : void 0, src: "town3d" }));
    });
    st.set("nbImport", done);
  }

  // core/economy.js
  var ECON = {
    coinCap: { free: 2e3, paid: Infinity },
    // 月替わりに残せる上限(有料会員は上限なし)
    paidCoinMult: 4,
    // 有料会員がもらえるコインは無料会員の4倍(課題・CM・ゲーム・3Dの町、すべて)
    daily: {
      task: 30,
      // 今日の課題=メイン課題(1日1回。必須)
      pt: { prev: 10, other: 20, goal: 20, review: 10 },
      // ほかの課題(どれも1日1回。メイン以外の3つ以上でOK)。前回の振り返り/それ以外の勉強/目標時間/今日の振り返り
      cm: { each: 10, max: 3 },
      // CM(1日3回まで)
      game: 0
      // ゲームの点数ではコインはもらえない(ランキングだけ)
    },
    slots: { free: 1, paid: 3 },
    // 共有の教材(コイン教材)を手元に置ける枠
    swap: { free: { coins: 2500, gems: 50 } },
    // 無料会員が枠を入れ替える値段(どちらかで払う)。有料会員は無料
    ai: { paidPerMonth: 3, gems: 30 },
    // AIで例文・長文を作る/登録する：有料会員は月3回、超えたらダイヤ。無料会員はダイヤのみ
    avatar: { gems: 120 },
    // 有料アバターをずっと持つ値段。有料会員は月に1回、その月のアバターを枠に入れられる
    test: { free: "week", paid: "day", extraGems: 20 },
    // 実力テスト：無料は週1回、有料は1日1回。追加はダイヤ
    unlock: { packCoins: 200, packGems: 20 },
    // 単語パック(約100語)の解放
    // 家具の値段は 3Dの町の town3d/src/game/furniture.js にある(元の約5倍：小物150〜250、中300〜500、大600〜800)
    // 自宅の広げ方：コインは「1列・1行ごと」に 3,000。ダイヤなら 広げる(1列・1行 60)ことも 部屋そのものを増やす(1部屋 250)こともできる
    photo: { free: 1, max: 5, gemsPerSlot: 40 },
    // 写真アルバム：はじめ1枚。ダイヤ40で1枠ずつ、5枚まで
    house: { coinsPerLine: 3e3, gemsPerLine: 60, gemsPerRoom: 250 },
    start: { coins: 50, gems: 0 }
    // はじめてのとき
  };
  var PLAN_NAME = { free: "\u7121\u6599\u4F1A\u54E1", paid: "\u6709\u6599\u4F1A\u54E1" };

  // core/member.js
  var pad = (n) => String(n).padStart(2, "0");
  var dayKey2 = (d = /* @__PURE__ */ new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  var monthKey = (d = /* @__PURE__ */ new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  var weekKey = (d = /* @__PURE__ */ new Date()) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() - (t.getDay() + 6) % 7);
    return dayKey2(t);
  };
  function createMember(wallet, ui) {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    const M = Object.assign({ plan: "free", gems: ECON.start.gems, month: monthKey(), slots: [], swaps: [], avatar: { month: "", id: "" }, owned: [], ai: { month: "", n: 0 }, day: { k: "", task: 0, cm: 0, game: 0 }, tests: [], extraTests: 0 }, st.get("member") || {});
    const save = () => {
      st.set("member", M);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    const isPaid = () => M.plan === "paid";
    const cap = () => ECON.coinCap[isPaid() ? "paid" : "free"];
    function tick() {
      const mk = monthKey();
      if (M.month !== mk) {
        const c = wallet.get(), lim = cap();
        if (c > lim) {
          wallet.set(lim, "month");
          ui && ui.toast && setTimeout(() => ui.toast(`\u6708\u304C\u5909\u308F\u3063\u305F\u306E\u3067\u3001\u4E0A\u9650(${lim})\u3092\u8D85\u3048\u305F\u30B3\u30A4\u30F3 ${c - lim} \u679A\u304C\u6D88\u3048\u307E\u3057\u305F`), 800);
        }
        M.month = mk;
        if (!isPaid() && M.slots.length > ECON.slots.free) M.slots = M.slots.slice(0, ECON.slots.free);
        save();
      }
      if (M.day.k !== dayKey2()) {
        M.day = { k: dayKey2(), task: 0, cm: 0, game: 0, pt: {} };
        save();
      }
    }
    tick();
    wallet.setBoost && wallet.setBoost(() => isPaid() ? ECON.paidCoinMult : 1);
    const api = {
      get plan() {
        return M.plan;
      },
      isPaid,
      coinCap: cap,
      coinCapText: () => isFinite(cap()) ? String(cap()) : "\u306A\u3057",
      setPlan(p) {
        if (!["free", "paid"].includes(p) || p === M.plan) return;
        M.plan = p;
        if (p === "free" && M.slots.length > ECON.slots.free) {
          const keep = M.slots.find((s) => s.keep) || M.slots[M.slots.length - 1];
          M.slots = [keep];
        }
        save();
      },
      // ---- ダイヤ ----
      gems: () => M.gems,
      addGems(n, why) {
        n = Math.floor(+n);
        if (!(n > 0)) return false;
        M.gems += n;
        save();
        return true;
      },
      spendGems(n, why) {
        n = Math.floor(+n);
        if (!(n > 0) || M.gems < n) return false;
        M.gems -= n;
        save();
        return true;
      },
      // ---- コインのもらい方（1日の上限つき） ----
      // kind：'task'（今日の課題）/ 'cm'（CM）/ 'game'（ゲームの点数。n は希望の枚数）/ 'once'（レッスンの初回クリアなど一度きり）
      earn(kind, n) {
        tick();
        let g = 0;
        const D = ECON.daily;
        if (kind === "task") {
          if (!M.day.task) {
            g = D.task;
            M.day.task = 1;
          }
        } else if (D.pt[kind]) {
          M.day.pt = M.day.pt || {};
          if (!M.day.pt[kind]) {
            g = D.pt[kind];
            M.day.pt[kind] = 1;
          }
        } else if (kind === "cm") {
          if (M.day.cm < D.cm.max) {
            g = D.cm.each;
            M.day.cm++;
          }
        } else if (kind === "game") {
          g = Math.max(0, Math.min(Math.floor(+n || 0), D.game - M.day.game));
          M.day.game += g;
        } else if (kind === "once") g = Math.max(0, Math.min(500, Math.floor(+n || 0)));
        if (g > 0) {
          const before = wallet.get();
          wallet.add(g, "earn:" + kind);
          g = wallet.get() - before;
          save();
        }
        return g;
      },
      today: () => ({ ...M.day, pt: { ...M.day.pt || {} }, gameLeft: ECON.daily.game - M.day.game, cmLeft: ECON.daily.cm.max - M.day.cm }),
      // ---- 共有の教材の枠 ----
      slots: () => M.slots.slice(),
      slotMax: () => ECON.slots[isPaid() ? "paid" : "free"],
      hasSlot: (id) => M.slots.some((s) => s.id === id),
      // 枠に入れる。空きがなければ out（外すもの）を指定。無料会員の入れ替えはコインかダイヤ（pay:'coins'|'gems'）
      slotIn(item, { out, pay } = {}) {
        tick();
        if (api.hasSlot(item.id)) return { ok: true };
        const max = api.slotMax(), full = M.slots.length >= max;
        if (full && !out) return { ok: false, why: "full" };
        if (full && !isPaid()) {
          const price = ECON.swap.free;
          if (pay === "gems") {
            if (!api.spendGems(price.gems)) return { ok: false, why: "gems" };
          } else {
            if (wallet.get() < price.coins) return { ok: false, why: "coins" };
            wallet.add(-price.coins, "buy:swap");
          }
          M.swaps.push({ at: Date.now(), pay: pay || "coins" });
        }
        if (full) M.slots = M.slots.filter((s) => s.id !== out);
        M.slots.push({ id: item.id, title: item.title || "", kind: item.kind || "long", at: Date.now() });
        save();
        return { ok: true };
      },
      slotKeep(id) {
        M.slots.forEach((s) => s.keep = s.id === id);
        save();
      },
      slotOut(id) {
        M.slots = M.slots.filter((s) => s.id !== id);
        save();
      },
      // 外すだけ(有料会員の入れ替え用)。無料会員は入れ替えでしか外さない
      // ---- ダイヤで買って、ずっと持つもの（ダイヤ教材・有料アバター） ----
      owns: (id) => M.owned.includes(id),
      buy(id, gems) {
        if (M.owned.includes(id)) return true;
        if (!api.spendGems(gems)) return false;
        M.owned.push(id);
        save();
        return true;
      },
      // ---- 有料アバターの枠：有料会員は月に1回、その月のアバターに変えられる ----
      avatarSlot: () => ({ ...M.avatar, canChange: isPaid() && M.avatar.month !== monthKey() }),
      setMonthlyAvatar(id) {
        if (!isPaid() || M.avatar.month === monthKey()) return false;
        M.avatar = { month: monthKey(), id };
        save();
        return true;
      },
      // ---- AI（例文・長文を作る、AIでの登録） ----
      aiLeft: () => isPaid() ? Math.max(0, ECON.ai.paidPerMonth - (M.ai.month === monthKey() ? M.ai.n : 0)) : 0,
      useAI(pay) {
        if (api.aiLeft() > 0) {
          if (M.ai.month !== monthKey()) M.ai = { month: monthKey(), n: 0 };
          M.ai.n++;
          save();
          return true;
        }
        return pay === "gems" && api.spendGems(ECON.ai.gems);
      },
      // ---- 実力テスト：無料は週1回、有料は1日1回。足りなければダイヤで追加 ----
      canTest() {
        const k = isPaid() ? dayKey2() : weekKey();
        return !M.tests.some((t) => t.k === k) || M.extraTests > 0;
      },
      nextTest() {
        return isPaid() ? "\u660E\u65E5" : "\u6765\u9031\u306E\u6708\u66DC";
      },
      useTest() {
        const k = isPaid() ? dayKey2() : weekKey();
        if (M.tests.some((t) => t.k === k)) {
          if (M.extraTests > 0) M.extraTests--;
          else return false;
        }
        M.tests.push({ k, at: Date.now() });
        if (M.tests.length > 400) M.tests = M.tests.slice(-400);
        save();
        return true;
      },
      buyTest() {
        if (!api.spendGems(ECON.test.extraGems)) return false;
        M.extraTests++;
        save();
        return true;
      },
      // 運営画面のテスト用：月替わりを試す
      _forceMonth(m) {
        M.month = m;
        save();
        tick();
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      },
      keys: { dayKey: dayKey2, monthKey, weekKey }
    };
    return api;
  }

  // core/cloud.js
  var CLOUD_RULES = { VOTE_DAYS: 14, SHELF_TOP: 5, RATE_MIN: 20, VOTES_PER_WEEK: 5, IDLE_DAYS: 90, THANKS_GEMS: 10 };
  var DAY = 864e5;
  function createCloud(member) {
    const st = createStore("cloud"), subs = /* @__PURE__ */ new Set();
    const D = Object.assign({ items: [], votes: {}, rated: {}, reports: [] }, st.get("db") || {});
    const save = () => {
      st.set("db", D);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    const find = (id) => D.items.find((x) => x.id === id);
    const pub = (x) => x && { id: x.id, title: x.title, author: x.author, level: x.level, kind: x.kind, state: x.state, at: x.at, votes: x.votes, good: x.good, bad: x.bad, uses: x.uses, lastUse: x.lastUse, story: x.story, pick: !!x.pick, note: x.note || "" };
    const weekKey2 = () => member.keys.weekKey();
    function settle() {
      const now = Date.now(), due = D.items.filter((x) => x.state === "new" && now - x.at > CLOUD_RULES.VOTE_DAYS * DAY);
      if (!due.length) return;
      due.sort((a, b) => b.votes - a.votes).forEach((x, i) => {
        x.state = i < CLOUD_RULES.SHELF_TOP && x.votes > 0 ? "shelf" : "passed";
        x.decided = now;
      });
      save();
    }
    return {
      RULES: CLOUD_RULES,
      // ---- 利用者 ----
      share({ title, story, level, author, kind = "long" }) {
        if (!member.isPaid()) return { ok: false, why: "paid" };
        if (!title || !story || !(story.list || []).length) return { ok: false, why: "empty" };
        const x = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: String(title).slice(0, 60), story, level: level || 0, author: author || "\u3060\u308C\u304B", kind, state: "new", at: Date.now(), votes: 0, good: 0, bad: 0, uses: 0, lastUse: 0 };
        D.items.unshift(x);
        save();
        return { ok: true, id: x.id };
      },
      listNew() {
        settle();
        return D.items.filter((x) => x.state === "new").map(pub);
      },
      listShelf() {
        settle();
        return D.items.filter((x) => x.state === "shelf").map(pub);
      },
      get: (id) => pub(find(id)),
      votesLeft() {
        const k = weekKey2();
        return CLOUD_RULES.VOTES_PER_WEEK - Object.values(D.votes).filter((v) => v === k).length;
      },
      voted: (id) => !!D.votes[id],
      vote(id) {
        const x = find(id);
        if (!x || x.state !== "new" || D.votes[id]) return false;
        if (this.votesLeft() <= 0) return false;
        D.votes[id] = weekKey2();
        x.votes++;
        save();
        return true;
      },
      used(id) {
        const x = find(id);
        if (!x) return;
        x.uses++;
        x.lastUse = Date.now();
        save();
      },
      canRate: (id) => !D.rated[id],
      rate(id, good) {
        const x = find(id);
        if (!x || D.rated[id]) return false;
        D.rated[id] = 1;
        good ? x.good++ : x.bad++;
        save();
        return true;
      },
      report(id, why) {
        D.reports.push({ id, why: String(why || "").slice(0, 200), at: Date.now() });
        save();
      },
      // ---- 運営 ----
      all() {
        settle();
        return D.items.map(pub);
      },
      reports: () => D.reports.slice(),
      setState(id, state, note) {
        const x = find(id);
        if (!x) return;
        if (state === "shelf" && !x.pick) {
          x.pick = true;
        }
        x.state = state;
        x.note = note || x.note || "";
        x.decided = Date.now();
        save();
      },
      remove(id) {
        D.items = D.items.filter((x) => x.id !== id);
        D.reports = D.reports.filter((r) => r.id !== id);
        save();
      },
      // 権利侵害など：全員から消す
      // 見直しの候補：棚にあって、使われていない or 満足度が低い
      reviewList() {
        const now = Date.now();
        return D.items.filter((x) => x.state === "shelf").map((x) => {
          const rated = x.good + x.bad, low = rated >= CLOUD_RULES.RATE_MIN && x.good / rated < 0.5, idle = now - Math.max(x.lastUse, x.decided || x.at) > CLOUD_RULES.IDLE_DAYS * DAY;
          return low || idle ? { ...pub(x), why: low ? `\u6E80\u8DB3\u5EA6\u304C\u4F4E\u3044(\u3088\u304B\u3063\u305F ${x.good}/${rated})` : `${CLOUD_RULES.IDLE_DAYS}\u65E5\u4F7F\u308F\u308C\u3066\u3044\u306A\u3044` } : null;
        }).filter(Boolean);
      },
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/ai.js
  var KEY = "town:ai";
  var MODELS = { gemini: "gemini-flash-lite-latest", openai: "gpt-4o-mini", claude: "claude-haiku-5-5" };
  function createAI() {
    const load = () => {
      try {
        return Object.assign({ provider: "gemini", key: "", model: "" }, JSON.parse(localStorage.getItem(KEY)) || {});
      } catch (e) {
        return { provider: "gemini", key: "", model: "" };
      }
    };
    const save = (s) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch (e) {
      }
    };
    async function ask(system, user, maxTokens = 600) {
      const s = load(), key2 = String(s.key || "").trim();
      if (!key2) throw new Error("AI\u306E\u30AD\u30FC\u304C\u5165\u3063\u3066\u3044\u307E\u305B\u3093(\u8A2D\u5B9A\u304B\u3089\u5165\u308C\u3089\u308C\u307E\u3059)");
      const p = MODELS[s.provider] ? s.provider : "gemini", model = s.model || MODELS[p];
      let url, headers = { "content-type": "application/json" }, body, pick;
      if (p === "gemini") {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        headers["x-goog-api-key"] = key2;
        body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } };
        pick = (j) => (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
      } else if (p === "openai") {
        url = "https://api.openai.com/v1/chat/completions";
        headers.authorization = "Bearer " + key2;
        body = { model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
        pick = (j) => j.choices?.[0]?.message?.content || "";
      } else {
        url = "https://api.anthropic.com/v1/messages";
        headers["x-api-key"] = key2;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
        body = { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
        pick = (j) => (j.content || []).map((x) => x.text || "").join("");
      }
      let res;
      try {
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), referrerPolicy: "no-referrer", credentials: "omit" });
      } catch (e) {
        throw new Error("\u901A\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      }
      if (!res.ok) throw new Error(res.status === 429 ? "\u4F7F\u3044\u3059\u304E\u304B\u3001\u7121\u6599\u67A0\u306E\u4E0A\u9650\u307F\u305F\u3044\u3002\u5C11\u3057\u5F85\u3063\u3066\u306D" : res.status >= 500 ? "AI\u306E\u4F1A\u793E\u5074\u304C\u6DF7\u307F\u5408\u3063\u3066\u3044\u307E\u3059" : "\u30AD\u30FC\u304C\u4F7F\u3048\u306A\u3044\u307F\u305F\u3044(" + res.status + ")");
      return String(pick(await res.json()) || "").trim();
    }
    async function askJSON(system, user, maxTokens) {
      const t = await ask(system + "\n\u51FA\u529B\u306FJSON\u3060\u3051\u3002\u524D\u5F8C\u306B\u8AAC\u660E\u3092\u66F8\u304B\u306A\u3044\u3002", user, maxTokens);
      const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!m) throw new Error("AI\u306E\u8FD4\u4E8B\u3092\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F");
      return JSON.parse(m[0]);
    }
    return {
      get ready() {
        return !!String(load().key || "").trim();
      },
      get state() {
        const s = load();
        return { provider: s.provider, hasKey: !!s.key };
      },
      configure({ provider, key: key2 }) {
        const s = load();
        if (provider && MODELS[provider]) s.provider = provider;
        if (key2 !== void 0) s.key = String(key2).trim();
        save(s);
      },
      ask,
      askJSON,
      // 自然な文か：{ok:'o'|'t'|'x', fix:'直した文', why:'理由(日本語)'}
      check(en, word) {
        return askJSON(
          "\u3042\u306A\u305F\u306F\u82F1\u8A9E\u306E\u5148\u751F\u3002\u5B66\u7FD2\u8005\u304C\u66F8\u3044\u305F\u82F1\u6587\u304C\u81EA\u7136\u304B\u3069\u3046\u304B\u3092\u5224\u5B9A\u3059\u308B\u3002o=\u81EA\u7136\u3001t=\u901A\u3058\u308B\u304C\u4E0D\u81EA\u7136\u3001x=\u307E\u3061\u304C\u3044\u3002fix \u306F\u81EA\u7136\u306A\u82F1\u6587(o \u306A\u3089\u540C\u3058\u6587)\u3002why \u306F\u65E5\u672C\u8A9E\u306740\u5B57\u4EE5\u5185\u3002",
          `\u82F1\u6587:${en}${word ? `
\u4F7F\u3044\u305F\u3044\u8A00\u8449:${word}` : ""}
{"ok":"o|t|x","fix":"...","why":"..."}`,
          300
        );
      },
      // 例文3つと短い長文：{examples:[{en,ja}], passage:[{en,ja}]}
      examples(word, levelName) {
        return askJSON(
          "\u82F1\u8A9E\u5B66\u7FD2\u30A2\u30D7\u30EA\u306E\u6559\u6750\u3092\u4F5C\u308B\u3002\u4E2D\u9AD8\u751F\u5411\u3051\u3002\u81EA\u7136\u3067\u3001\u307E\u3061\u304C\u3044\u306E\u306A\u3044\u82F1\u8A9E\u3002\u65E5\u672C\u8A9E\u8A33\u306F\u3084\u3055\u3057\u3044\u81EA\u7136\u306A\u65E5\u672C\u8A9E\u3002",
          `\u300C${word}\u300D\u3092\u4F7F\u3063\u305F\u4F8B\u6587\u30923\u3064\u3068\u3001\u300C${word}\u300D\u3092\u4F7F\u3063\u305F3\u301C5\u6587\u306E\u77ED\u3044\u304A\u8A71\u3092\u4F5C\u308B\u3002\u30EC\u30D9\u30EB:${levelName || "\u4E2D\u7D1A"}\u3002
{"examples":[{"en":"","ja":""}],"passage":[{"en":"","ja":""}]}`,
          900
        );
      }
    };
  }

  // core/today.js
  var esc3 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function createToday(core2) {
    const st = createStore("core");
    const pref = () => Object.assign({ want: "read", time: 15, mood: "any" }, st.get("todayPref") || {});
    let hasGame = () => true;
    const usable = (p) => p.go.to === "3d" ? !!core2.to3D : p.go.to === "note" ? !!core2.study : p.go.to === "test" ? !!core2.level && hasGame("stream") : !!core2.openGame && hasGame(p.go.game);
    function go(p) {
      if (!p) return;
      if (p.go.to === "3d") core2.to3D();
      else if (p.go.to === "test") core2.level.test();
      else if (p.go.to === "note") core2.study.open({ play: core2.openGame, has: hasGame, tab: "note", kind: p.go.kind || "word", mark: p.go.kind ? "" : "miss" });
      else core2.openGame(p.go.game, p.go.opts || {});
    }
    function pick({ want, time, mood }) {
      const done = core2.record.today().plays || {}, weak = core2.level && core2.level.weak && core2.level.weak() || "";
      let list = PLAYS.filter((p) => usable(p) && p.want === want && p.time.includes(time));
      if (!list.length) list = PLAYS.filter((p) => usable(p) && p.want === want);
      const score = (p) => (mood === "any" ? Math.random() * 2 : p.mood === mood ? 3 : p.mood === "both" || p.mood === "any" ? 2 : 0) + (done[p.id] ? -1 : 0) + (weak === p.want ? 0.5 : 0) + Math.random() * 0.3;
      return list.map((p) => [score(p), p]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    }
    function open(o = {}) {
      if (o.has) hasGame = o.has;
      const P = pref(), last = core2.record.last(), wk = core2.books ? core2.books.weekly() : [], taskDone = core2.member.today().task;
      const sel = (k, list, cur) => `<nav class="cs-chips" data-k="${k}">${list.map((x) => `<button data-v="${x.k}" class="${String(x.k) === String(cur) ? "on" : ""}">${x.n}</button>`).join("")}</nav>`;
      const rec = pick(P), main = rec[0], more = rec.slice(1, 3);
      core2.ui.sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3>
      ${last && core2.openGame && hasGame(last.game) ? `<button class="cs-btn cs-resume" data-resume>\u3064\u3065\u304D\u304B\u3089:${esc3(last.label || (playOf(last.play) || {}).n || "")}</button>` : ""}
      ${wk.length ? `<button class="cs-btn ${taskDone ? "" : "cs-go"}" data-task>\u4ECA\u65E5\u306E\u8AB2\u984C:\u8AB2\u984C\u56F3\u66F8\u30921\u518A${taskDone ? "(\u4ECA\u65E5\u306F\u30AF\u30EA\u30A2\u6E08\u307F)" : `(\u30B3\u30A4\u30F3 +${core2.econ.daily.task})`}<small>${wk.map((b) => esc3(b.title)).join(" \u30FB ")}</small></button>` : ""}
      <p class="cs-note">\u3057\u305F\u3044\u3053\u3068</p>${sel("want", WANTS, P.want)}
      <p class="cs-note">\u6642\u9593\u3068\u6C17\u5206</p>${sel("time", TIMES, P.time)}${sel("mood", MOODS, P.mood)}
      ${main ? `<button class="cs-btn cs-go cs-big" data-p="${main.id}">${esc3(main.n)}<small>\u304A\u3059\u3059\u3081</small></button>` : '<p class="cs-note">\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u306E\u904A\u3073\u306F\u3001\u3053\u306E\u30A2\u30D7\u30EA\u306B\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>'}
      ${more.map((p) => `<button class="cs-btn" data-p="${p.id}">${esc3(p.n)}</button>`).join("")}`, (ov, close) => {
        ov.querySelectorAll("[data-k] button").forEach((b) => b.onclick = () => {
          const k = b.parentNode.dataset.k, v = b.dataset.v;
          const n = pref();
          n[k] = k === "time" ? +v : v;
          st.set("todayPref", n);
          close();
          open(o);
        });
        ov.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => {
          close();
          go(playOf(b.dataset.p));
        });
        const r = ov.querySelector("[data-resume]");
        if (r) r.onclick = () => {
          close();
          core2.openGame(last.game, last.opts);
        };
        const t = ov.querySelector("[data-task]");
        if (t) t.onclick = () => {
          close();
          core2.openGame("library", { tab: "weekly" });
        };
      });
    }
    let band = null, hideT = 0;
    core2.events.on((game, name, d = {}) => {
      if (name !== "done") return;
      const p = playOf(d.play), coins0 = core2.wallet.get();
      setTimeout(() => {
        const got = core2.wallet.get() - coins0, next = p ? pick({ want: p.want, time: 15, mood: "any" }).find((x) => x.id !== p.id) : null;
        if (band) band.remove();
        clearTimeout(hideT);
        band = document.createElement("div");
        band.className = "cs-band";
        band.innerHTML = `<span>\u8A18\u9332\u306B\u8DB3\u3057\u307E\u3057\u305F${d.min ? `(${Math.max(1, Math.round(d.min))}\u5206)` : ""}${got > 0 ? ` \u30FB \u30B3\u30A4\u30F3 +${got}` : ""}</span>
        <div><button data-n>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</button><button data-x aria-label="\u3068\u3058\u308B">\u2715</button></div>`;
        core2.ui.root.appendChild(band);
        band.querySelector("[data-x]").onclick = () => band.remove();
        const nb = band.querySelector("[data-n]");
        if (nb) nb.onclick = () => {
          band.remove();
          core2.host.close();
          core2.mission.open();
        };
        hideT = setTimeout(() => band && band.remove(), 9e3);
      }, 300);
    });
    return { open: (o) => core2.mission.open(o), go, pick };
  }

  // core/useit.js
  var esc4 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var plainEn = (s) => String(s || "").replace(/^@\w /, "").split(" | ").map((u) => u.replace(/^[A-Z]:/, "").replace(/=.*$/, "").replace(/#.*$/, "")).join(" ").replace(/\s+/g, " ").trim();
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function createUseit(core2) {
    async function find(en) {
      const w = String(en).trim().toLowerCase(), re = w.includes(" ") ? null : new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es|ed|d|ing)?\\b", "i");
      const hit = (t) => re ? re.test(t) : t.toLowerCase().includes(w);
      const out = [], seen = /* @__PURE__ */ new Set(), push = (e, j, from) => {
        const k = e.toLowerCase();
        if (!seen.has(k) && hit(e)) {
          seen.add(k);
          out.push({ en: e, ja: j || "", from });
        }
      };
      if (core2.books) {
        await core2.books.load();
        for (const b of core2.books.all()) {
          let s = null;
          try {
            s = b.story();
          } catch (e) {
          }
          (s && s.list || []).forEach((x) => push(plainEn(x[0]), x[1], b.title));
        }
      }
      core2.notebook.list({ kind: "short" }).forEach((x) => push(x.en, x.ja, "\u52C9\u5F37\u30CE\u30FC\u30C8"));
      return out.slice(0, 8);
    }
    async function mimic(en, btn) {
      const sp = core2.speech, gap = Math.min(6e3, 1200 + en.split(/\s+/).length * 450);
      for (const [i, r] of [[1, 0.8], [2, 1], [3, 1]]) {
        if (btn) btn.textContent = `${i}\u56DE\u76EE:\u805E\u3044\u3066\u2026`;
        sp.speak(en, { rate: r });
        await wait(gap);
        if (btn) btn.textContent = `${i}\u56DE\u76EE:\u307E\u306D\u3057\u3066\u8A00\u3063\u3066\u307F\u3088\u3046`;
        await wait(gap);
      }
      if (btn) btn.textContent = "\u805E\u3044\u3066\u307E\u306D\u308B";
    }
    function open(x) {
      const ai = core2.ai, M = core2.member, aiPrice = M.isPaid() && M.aiLeft() > 0 ? `\u4ECA\u6708\u3042\u3068${M.aiLeft()}\u56DE` : `\u30C0\u30A4\u30E4 ${ECON.ai.gems}`;
      const sent = (s, i) => `<li><b>${esc4(s.en)}</b><span>${esc4(s.ja)}</span><small>${esc4(s.from || "")}</small><div class="cs-nb-a"><button data-say="${i}">\u{1F50A}</button><button data-mim="${i}">\u805E\u3044\u3066\u307E\u306D\u308B</button><button data-add="${i}">\u30CE\u30FC\u30C8\u306B\u5165\u308C\u308B</button></div></li>`;
      let found = [];
      core2.ui.sheet(`<h3>${esc4(x.en)}</h3><p class="cs-note">${esc4(x.ja)}</p>
      <section class="cs-adm"><h4>1. \u6587\u306E\u4E2D\u3067\u898B\u3066\u307F\u308B</h4><ul class="cs-nb" data-found><li class="cs-note">\u3055\u304C\u3057\u3066\u3044\u307E\u3059\u2026</li></ul></section>
      <section class="cs-adm"><h4>2. \u81EA\u5206\u3067\u6587\u3092\u4F5C\u308B</h4>
        <textarea class="cs-ta" data-mine rows="2" placeholder="\u300C${esc4(x.en)}\u300D\u3092\u4F7F\u3063\u3066\u82F1\u6587\u3092\u66F8\u3044\u3066\u307F\u3088\u3046" autocapitalize="off" spellcheck="false"></textarea>
        <div class="cs-adm-row">${ai.ready ? '<button class="cs-btn" data-check>\u81EA\u7136\u306A\u6587\u304B\u5224\u5B9A(AI)</button>' : ""}<button class="cs-btn" data-keep>\u30CE\u30FC\u30C8\u306B\u5165\u308C\u308B</button>${core2.openGame ? '<button class="cs-btn" data-eigo>\u82F1\u8A9E\u8133\u3067\u4F5C\u308B</button>' : ""}</div>
        ${ai.ready ? "" : '<p class="cs-note">\u8A2D\u5B9A\u3067AI\u306E\u30AD\u30FC\u3092\u5165\u308C\u308B\u3068\u3001\u81EA\u7136\u306A\u6587\u304B\u3092\u5224\u5B9A\u3067\u304D\u307E\u3059(\u7121\u6599)\u3002</p>'}<p class="cs-note" data-judge></p></section>
      <section class="cs-adm"><h4>3. AI\u3067\u4F8B\u6587\u3068\u304A\u8A71\u3092\u4F5C\u308B</h4><p class="cs-note">\u300C${esc4(x.en)}\u300D\u3092\u4F7F\u3063\u305F\u4F8B\u65873\u3064\u3068\u3001\u77ED\u3044\u304A\u8A71\u3092\u4F5C\u308A\u307E\u3059(${aiPrice})\u3002\u3067\u304D\u305F\u6587\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3059\u3002</p>
        ${ai.ready ? `<button class="cs-btn" data-gen>\u4F5C\u308B</button>` : '<p class="cs-note">AI\u306E\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002</p>'}<ul class="cs-nb" data-gened></ul></section>`, (ov) => {
        const q = (s) => ov.querySelector(s);
        const bindList = (ul, list) => {
          ul.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => core2.speech.speak(list[+b.dataset.say].en));
          ul.querySelectorAll("[data-mim]").forEach((b) => b.onclick = () => mimic(list[+b.dataset.mim].en, b));
          ul.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => {
            const s = list[+b.dataset.add];
            core2.notebook.add({ en: s.en, ja: s.ja, kind: "short", src: s.src || "useit" });
            b.textContent = "\u5165\u308C\u307E\u3057\u305F";
            b.disabled = true;
          });
        };
        find(x.en).then((list) => {
          found = list;
          const ul = q("[data-found]");
          if (!ul) return;
          ul.innerHTML = list.length ? list.map(sent).join("") : `<li class="cs-note">\u5185\u8535\u306E\u6587\u306B\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u30022\u304B3\u3067\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046\u3002</li>`;
          bindList(ul, list);
        });
        q("[data-keep]").onclick = () => {
          const en = q("[data-mine]").value.trim();
          if (!/[a-zA-Z]/.test(en)) return core2.ui.toast("\u82F1\u6587\u3092\u66F8\u3044\u3066\u306D");
          core2.notebook.add({ en, ja: "", kind: "short", src: "note" });
          core2.ui.toast("\u30CE\u30FC\u30C8\u306B\u5165\u308C\u307E\u3057\u305F");
        };
        if (q("[data-eigo]")) q("[data-eigo]").onclick = () => {
          core2.ui.toast(`\u82F1\u8A9E\u8133\u3067\u300C${x.en}\u300D\u3092\u4F7F\u3063\u305F\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046`);
          core2.study && core2.study.close();
          core2.openGame("eigonou");
        };
        if (q("[data-check]")) q("[data-check]").onclick = async () => {
          const en = q("[data-mine]").value.trim(), out = q("[data-judge]");
          if (!/[a-zA-Z]/.test(en)) return core2.ui.toast("\u82F1\u6587\u3092\u66F8\u3044\u3066\u306D");
          out.textContent = "\u5224\u5B9A\u3057\u3066\u3044\u307E\u3059\u2026";
          try {
            const r = await ai.check(en, x.en);
            out.innerHTML = `<b>${{ o: "\u25CE \u81EA\u7136\u306A\u6587", t: "\u25B3 \u901A\u3058\u308B\u3051\u308C\u3069\u5C11\u3057\u4E0D\u81EA\u7136", x: "\xD7 \u307E\u3061\u304C\u3044\u304C\u3042\u308B" }[r.ok] || ""}</b><br>${r.fix && r.fix !== en ? "\u76F4\u3057\u305F\u6587:" + esc4(r.fix) + "<br>" : ""}${esc4(r.why || "")}`;
          } catch (e) {
            out.textContent = e.message;
          }
        };
        if (q("[data-gen]")) q("[data-gen]").onclick = async () => {
          const btn = q("[data-gen]");
          const byGems = !(M.isPaid() && M.aiLeft() > 0);
          if (!M.useAI(byGems ? "gems" : "")) return core2.ui.toast(M.isPaid() ? `\u4ECA\u6708\u306E\u56DE\u6570\u304C\u306A\u304F\u3001\u30C0\u30A4\u30E4\u3082\u8DB3\u308A\u307E\u305B\u3093(\u30C0\u30A4\u30E4 ${ECON.ai.gems})` : `\u30C0\u30A4\u30E4\u304C\u8DB3\u308A\u307E\u305B\u3093(\u30C0\u30A4\u30E4 ${ECON.ai.gems})`);
          btn.disabled = true;
          btn.textContent = "\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026";
          try {
            const lv = core2.level ? core2.level.name() : "";
            const r = await ai.examples(x.en, lv), list = [...r.examples || [], ...r.passage || []].filter((s) => s && s.en).map((s) => ({ en: s.en, ja: s.ja || "", from: "AI", src: "ai" }));
            core2.notebook.addMany(list.map((s) => ({ en: s.en, ja: s.ja, kind: "short", src: "ai" })));
            const ul = q("[data-gened]");
            ul.innerHTML = list.map(sent).join("");
            bindList(ul, list);
            btn.textContent = "\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308C\u307E\u3057\u305F";
          } catch (e) {
            if (byGems) M.addGems(ECON.ai.gems, "refund");
            btn.disabled = false;
            btn.textContent = "\u4F5C\u308B";
            core2.ui.toast(e.message + "(\u4F7F\u3063\u305F\u5206\u306F\u623B\u3057\u307E\u3057\u305F)");
          }
        };
      });
    }
    return { open, find, mimic };
  }

  // core/level.js
  var LV_NAME = { 1: "\u521D\u7D1A", 2: "\u4E2D\u7D1A", 3: "\u4E0A\u7D1A" };
  var EDGES = [0, 500, 1e3, 2e3, 3e3, 4500, 6500, 9e3, 13e3, 19e3, 32e3];
  var BAND_NOTE = ["\u82F1\u8A9E\u3092\u306F\u3058\u3081\u305F\u3068\u3053\u308D", "\u4E2D1\u304F\u3089\u3044", "\u4E2D\u5B66\u5352\u696D\u30FB\u9AD8\u6821\u5165\u8A66\u304F\u3089\u3044", "\u9AD8\u68211\u5E74\u304F\u3089\u3044", "\u5171\u901A\u30C6\u30B9\u30C8\u304F\u3089\u3044", "\u96E3\u95A2\u5927\u304F\u3089\u3044", "\u82F1\u691C\u6E961\u7D1A\u304F\u3089\u3044", "\u82F1\u691C1\u7D1A\u304F\u3089\u3044", "\u30CD\u30A4\u30C6\u30A3\u30D6\u306E\u5927\u4EBA\u304F\u3089\u3044", "\u30CD\u30A4\u30C6\u30A3\u30D6\u306E\u5927\u4EBA\u4EE5\u4E0A"];
  var NEED = 10;
  var HOLD_MS = 2e4;
  var QN = 20;
  var RANKS = [[0, "\u30EB\u30FC\u30AD\u30FC"], [300, "\u30D6\u30ED\u30F3\u30BA"], [800, "\u30B7\u30EB\u30D0\u30FC"], [1600, "\u30B4\u30FC\u30EB\u30C9"], [3e3, "\u30D7\u30E9\u30C1\u30CA"], [5e3, "\u30C0\u30A4\u30E4\u30E2\u30F3\u30C9"], [8e3, "\u30DE\u30B9\u30BF\u30FC"]];
  var esc5 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var shuf = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  var json2 = (v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  };
  var vocabNote = (n) => BAND_NOTE[Math.max(0, EDGES.findIndex((e) => e > n) - 1)] || BAND_NOTE[BAND_NOTE.length - 1];
  var lvOfVocab = (n) => n < 2e3 ? 1 : n < 4500 ? 2 : 3;
  function createLevel(core2) {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    const L = Object.assign({ lv: 0, max: 0, allowed: [], vocab: 0, passed: [], weak: "", tests: 0, lastCleared: 0 }, st.get("level") || {});
    const save = () => {
      st.set("level", L);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    let G = null, ready = null;
    const load = () => ready || (ready = Promise.all(["words.js", "data.js", "bank.js"].map((f) => loadScript(core2.base + "g/stream/" + f))).then(() => true).catch(() => false));
    function list() {
      if (G) return G;
      let W = null, B = "";
      try {
        W = WORDS;
      } catch (e) {
      }
      try {
        B = BANK_SRC;
      } catch (e) {
      }
      if (!W) return null;
      const seen = /* @__PURE__ */ new Set();
      G = [];
      const add = (en, pos, ja) => {
        const k = en + "|" + pos;
        if (!en || !ja || seen.has(k)) return;
        seen.add(k);
        G.push([en, pos, ja]);
      };
      [1, 2, 3].forEach((l) => (W[l] || []).forEach((w) => add(w[0], w[1], w[2])));
      String(B).split("\n").forEach((l) => {
        const c = l.split("	");
        add(c[0], c[1], c[2]);
      });
      return G;
    }
    const bandOf = (i) => Math.max(0, EDGES.findIndex((e) => e > i) - 1);
    function wordQ(band, used) {
      const g = list(), lo = EDGES[band], hi = Math.min(EDGES[band + 1], g.length);
      if (hi - lo < 10) return null;
      for (let t = 0; t < 40; t++) {
        const i = lo + Math.floor(Math.random() * (hi - lo)), w = g[i];
        if (used.has(w[0])) continue;
        const near = [];
        for (let j = Math.max(0, i - 600); j < Math.min(g.length, i + 600) && near.length < 60; j += 1 + Math.floor(Math.random() * 8)) {
          const x = g[j];
          if (x[1] === w[1] && x[2] !== w[2] && x[0] !== w[0]) near.push(x[2]);
        }
        const opts = shuf([...new Set(near)]).slice(0, 3);
        if (opts.length < 3) continue;
        used.add(w[0]);
        return { kind: "word", band, q: w[0], a: w[2], opts: shuf([w[2], ...opts]) };
      }
      return null;
    }
    function chunkQs(lv, n) {
      let PS = [];
      try {
        PS = PASSAGES;
      } catch (e) {
      }
      const out = [];
      shuf(PS.filter((p) => p.lv === lv)).forEach((p) => {
        const cs = p.chunks.map((c) => ({ en: (c.tk || []).map((t) => t[1]).join(" ").replace(/\s+([,.!?;:])/g, "$1"), ja: c.ja })).filter((c) => c.en.split(" ").length >= 3 && c.ja);
        shuf(cs).slice(0, 2).forEach((c) => {
          const o = shuf(cs.filter((x) => x.ja !== c.ja)).slice(0, 3).map((x) => x.ja);
          if (o.length === 3) out.push({ kind: "chunk", q: c.en, a: c.ja, opts: shuf([c.ja, ...o]) });
        });
      });
      return out.slice(0, n);
    }
    function run(title, startBand, extra, done) {
      const used = /* @__PURE__ */ new Set(), res = [];
      let band = startBand, asked = 0, counted = 0, hold = 0;
      const queue = extra.slice();
      const next = () => {
        if (counted >= QN && !queue.length) return done(res, hold);
        if (asked > QN + 12 && !queue.length) return done(res, hold);
        const q = counted >= QN ? queue.shift() : wordQ(band, used);
        if (!q) return done(res, hold);
        asked++;
        const t0 = Date.now();
        core2.ui.sheet(`<h3>${esc5(title)}</h3><p class="cs-note">${Math.min(asked, QN + extra.length)} \u554F\u76EE \u30FB ${q.kind === "chunk" ? "\u307E\u3068\u307E\u308A\u306E\u610F\u5473" : "\u5358\u8A9E\u306E\u610F\u5473"}\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044</p>
        <p class="cs-q">${esc5(q.q)}</p>${q.opts.map((o, k) => `<button class="cs-btn" data-k="${k}">${esc5(o)}</button>`).join("")}<button class="cs-btn cs-dk" data-k="-1">\u308F\u304B\u3089\u306A\u3044</button>`, (ov, close) => {
          ov.querySelector(".cs-close").hidden = true;
          ov.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => {
            const k = +b.dataset.k, ok = k >= 0 && q.opts[k] === q.a, slow = Date.now() - t0 > HOLD_MS;
            close();
            if (slow) {
              hold++;
              if (q.kind === "chunk") {
              }
              return next();
            }
            res.push({ ...q, ok });
            if (q.kind === "word") {
              counted++;
              band = ok ? Math.min(EDGES.length - 2, band + 1) : Math.max(0, band - 1);
            }
            next();
          });
        });
      };
      next();
    }
    function estimate(res) {
      const nb = EDGES.length - 1, acc = Array(nb).fill(null), g = list().length;
      for (let b = 0; b < nb; b++) {
        const r = res.filter((x) => x.kind === "word" && x.band === b);
        if (r.length) acc[b] = r.filter((x) => x.ok).length / r.length;
      }
      const asked = acc.map((a, b) => a == null ? -1 : b).filter((b) => b >= 0);
      if (!asked.length) return 0;
      const lo = Math.min(...asked), hi = Math.max(...asked);
      let n = 0;
      for (let b = 0; b < nb; b++) {
        let a = acc[b];
        if (a == null) a = b < lo ? 1 : b > hi ? 0 : acc[b - 1] != null ? acc[b - 1] : 0.5;
        n += a * (Math.min(EDGES[b + 1], g) - EDGES[b]);
      }
      return Math.round(n / 50) * 50;
    }
    const miss = (res) => core2.notebook.addMany(res.filter((x) => !x.ok).map((x) => ({ en: x.q, ja: x.a, src: "test", marks: ["miss"] })));
    const intro = (title, n, cb) => core2.ui.sheet(`<h3>${title}</h3><p class="cs-note">\u7D04${n}\u554F\u3002\u6B63\u78BA\u306A\u8A3A\u65AD\u306E\u305F\u3081\u3001\u5F53\u3066\u305A\u3063\u307D\u3046\u3067\u9078\u3070\u306A\u3044\u3088\u3046\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u308F\u304B\u3089\u306A\u3044\u3068\u304D\u306F\u300C\u308F\u304B\u3089\u306A\u3044\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002<br>\u7B54\u3048\u308B\u307E\u3067\u306B20\u79D2\u4EE5\u4E0A\u304B\u304B\u3063\u305F\u554F\u984C\u306F\u3001\u7D50\u679C\u306B\u5165\u308C\u307E\u305B\u3093\u3002</p><button class="cs-btn cs-go" data-go>\u306F\u3058\u3081\u308B</button>`, (ov, close) => ov.querySelector("[data-go]").onclick = () => {
      close();
      cb();
    });
    async function placement() {
      if (!await load() || !list()) return core2.ui.toast("\u3053\u306E\u30A2\u30D7\u30EA\u3067\u306F\u3001\u30EC\u30D9\u30EB\u8A3A\u65AD\u304C\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
      intro("\u30EC\u30D9\u30EB\u8A3A\u65AD", QN, () => run("\u30EC\u30D9\u30EB\u8A3A\u65AD", 3, [], (res, hold) => {
        const v = estimate(res), lv = lvOfVocab(v);
        L.vocab = v;
        L.lv = lv;
        L.max = Math.max(L.max, lv);
        L.allowed = [lv - 1, lv, lv + 1].filter((x) => x >= 1 && x <= 3);
        L.at = Date.now();
        L.lastCleared = core2.mission ? core2.mission.cleared() : 0;
        save();
        miss(res);
        core2.ui.sheet(`<h3>\u63A8\u5B9A\u8A9E\u5F59 \u7D04${v.toLocaleString()}\u8A9E</h3><p class="cs-note">${vocabNote(v)}\u3002\u30A2\u30D7\u30EA\u306E\u30EC\u30D9\u30EB\u306F\u300C${LV_NAME[lv]}\u300D\u304B\u3089\u59CB\u307E\u308A\u307E\u3059(\u9078\u3079\u308B\u306E\u306F ${L.allowed.map((x) => LV_NAME[x]).join("\u30FB")})\u3002${hold ? `<br>20\u79D2\u4EE5\u4E0A\u304B\u304B\u3063\u305F ${hold} \u554F\u306F\u3001\u7D50\u679C\u306B\u5165\u308C\u3066\u3044\u307E\u305B\u3093\u3002` : ""}<br>\u307E\u3061\u304C\u3048\u305F\u5358\u8A9E\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3057\u305F\u3002</p>`);
      }));
    }
    const progress = () => Math.max(0, (core2.mission ? core2.mission.cleared() : 0) - (L.lastCleared || 0));
    const canTest = () => !!L.lv && progress() >= NEED && core2.member.canTest();
    async function test() {
      if (!L.lv) return placement();
      if (progress() < NEED) return core2.ui.sheet(`<h3>\u5B9F\u529B\u30C6\u30B9\u30C8</h3><p class="cs-note">\u30DF\u30C3\u30B7\u30E7\u30F3\u3092\u3042\u3068 ${NEED - progress()} \u500B\u30AF\u30EA\u30A2\u3059\u308B\u3068\u53D7\u3051\u3089\u308C\u307E\u3059\u3002</p>`);
      const M = core2.member;
      if (!M.canTest()) return core2.ui.sheet(`<h3>\u5B9F\u529B\u30C6\u30B9\u30C8</h3><p class="cs-note">\u6B21\u306B\u53D7\u3051\u3089\u308C\u308B\u306E\u306F${M.nextTest()}\u3067\u3059(${M.isPaid() ? "\u6709\u6599\u4F1A\u54E1\u306F1\u65E51\u56DE" : "\u7121\u6599\u4F1A\u54E1\u306F\u90311\u56DE"})\u3002\u30C0\u30A4\u30E4 ${core2.econ.test.extraGems} \u3067\u3082\u30461\u56DE\u53D7\u3051\u3089\u308C\u307E\u3059(\u6301\u3063\u3066\u3044\u308B:${M.gems()})\u3002</p><button class="cs-btn" data-buy>\u30C0\u30A4\u30E4\u3067\u53D7\u3051\u308B</button>`, (ov, close) => ov.querySelector("[data-buy]").onclick = () => {
        close();
        if (M.buyTest()) test();
        else core2.ui.toast("\u30C0\u30A4\u30E4\u304C\u8DB3\u308A\u307E\u305B\u3093");
      });
      if (!await load() || !list()) return core2.ui.toast("\u3053\u306E\u30A2\u30D7\u30EA\u3067\u306F\u3001\u5B9F\u529B\u30C6\u30B9\u30C8\u304C\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
      intro("\u5B9F\u529B\u30C6\u30B9\u30C8", QN + 6, () => {
        M.useTest();
        run("\u5B9F\u529B\u30C6\u30B9\u30C8", Math.max(1, bandOf(L.vocab || 1500)), chunkQs(L.lv, 6), (res, hold) => {
          const v = estimate(res), before = L.vocab || 0, nl = lvOfVocab(v), cr = res.filter((x) => x.kind === "chunk"), cacc = cr.length ? cr.filter((x) => x.ok).length / cr.length : 1;
          L.tests++;
          L.vocab = v;
          L.lastCleared = core2.mission ? core2.mission.cleared() : 0;
          L.weak = cacc < 0.7 ? "read" : "word";
          let msg = "";
          if (nl > L.lv && cacc >= 0.6) {
            L.passed.push({ lv: nl, at: Date.now(), vocab: v });
            L.lv = nl;
            L.max = Math.max(L.max, nl);
            msg = `\u5408\u683C! ${LV_NAME[nl]}\u304C\u958B\u304D\u307E\u3057\u305F\u3002`;
          }
          L.allowed = [L.lv - 1, L.lv, L.lv + 1].filter((x) => x >= 1 && x <= Math.min(3, L.max + 1));
          save();
          miss(res);
          core2.events.report("level", "done", { play: "test", min: Math.round(res.length * 0.25 * 10) / 10, score: Math.round(res.filter((x) => x.ok).length / Math.max(1, res.length) * 100), finished: true });
          core2.ui.sheet(`<h3>\u63A8\u5B9A\u8A9E\u5F59 \u7D04${v.toLocaleString()}\u8A9E</h3><p class="cs-note">${vocabNote(v)}(\u524D\u56DE ${before.toLocaleString()}\u8A9E)\u3002\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u5473 ${Math.round(cacc * 100)}%\u3002<br>${msg || (L.lv < 3 ? `\u6B21\u306E\u30EC\u30D9\u30EB\u306F \u63A8\u5B9A\u8A9E\u5F59 ${nl < 2 ? "2,000" : "4,500"}\u8A9E \u3068\u3001\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u54736\u5272 \u3067\u958B\u304D\u307E\u3059\u3002` : "\u3044\u3061\u3070\u3093\u4E0A\u306E\u30EC\u30D9\u30EB\u3067\u3059\u3002")}${hold ? `<br>20\u79D2\u4EE5\u4E0A\u304B\u304B\u3063\u305F ${hold} \u554F\u306F\u3001\u7D50\u679C\u306B\u5165\u308C\u3066\u3044\u307E\u305B\u3093\u3002` : ""}<br>\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3057\u305F\u3002</p>`);
        });
      });
    }
    function score() {
      const sv = json2(createStore("stream").get("chunkstream.v1")) || {}, mk = createStore("chunkchunk").get("make") || {};
      let stars = 0;
      Object.values(sv.best || {}).forEach((b) => Object.values(b).forEach((s) => {
        if (s && typeof s === "object") stars += Math.max(s.ta ? s.ta.stars || 0 : 0, s.rh ? s.rh.stars || 0 : 0);
      }));
      const lessons = Object.keys(mk.done || {}).length, books = core2.record.total("cc.read");
      const parts = [{ n: "\u30B9\u30C8\u30EA\u30FC\u30E0\u306E\u661F", v: stars, p: stars * 10 }, { n: "\u30EC\u30C3\u30B9\u30F3\u306E\u30AF\u30EA\u30A2", v: lessons, p: lessons * 20 }, { n: "\u8AAD\u307F\u7D42\u3048\u305F\u672C", v: books, p: books * 15 }, { n: "\u30EC\u30D9\u30EB\u306E\u5408\u683C", v: L.passed.length, p: L.passed.length * 300 }];
      const total = parts.reduce((a, x) => a + x.p, 0), ri = RANKS.reduce((a, r, i) => total >= r[0] ? i : a, 0);
      return { total, parts, rank: RANKS[ri][1], next: RANKS[ri + 1] ? { name: RANKS[ri + 1][1], need: RANKS[ri + 1][0] - total, at: RANKS[ri + 1][0], from: RANKS[ri][0] } : null };
    }
    return {
      get lv() {
        return L.lv;
      },
      allowed: () => L.allowed.slice(),
      name: () => LV_NAME[L.lv] || "",
      weak: () => L.weak,
      vocab: () => L.vocab,
      // 単語テストの穴うめ:その人のレベル帯(推定語彙のまわり)の単語を n こ。exclude(英語の小文字)は出さない
      async fillWords(n, exclude = /* @__PURE__ */ new Set()) {
        if (!await load()) return [];
        const g = list();
        if (!g) return [];
        const band = bandOf(L.vocab || 1500), lo = EDGES[band], hi = Math.min(EDGES[band + 1], g.length), out = [], used = new Set(exclude);
        for (let t = 0; t < n * 30 && out.length < n && hi > lo; t++) {
          const w = g[lo + Math.floor(Math.random() * (hi - lo))];
          const k = String(w[0]).toLowerCase();
          if (used.has(k) || w[0].includes(" ")) continue;
          used.add(k);
          out.push({ en: w[0], pos: w[1], ja: w[2] });
        }
        return out;
      },
      canTest,
      testLeft: () => Math.max(0, NEED - progress()),
      placement,
      test,
      score,
      load,
      onChange(f) {
        subs.add(f);
        return () => subs.delete(f);
      }
    };
  }

  // core/admin.js
  var esc6 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var evLoad = () => {
    try {
      const v = JSON.parse(localStorage.getItem("town:events"));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  };
  var evSave = (v) => {
    try {
      localStorage.setItem("town:events", JSON.stringify(v));
    } catch (e) {
    }
  };
  var pad2 = (n) => String(n).padStart(2, "0");
  var localIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  var durLoad = () => {
    try {
      return JSON.parse(localStorage.getItem("town:evdur")) || {};
    } catch (e) {
      return {};
    }
  };
  var T3 = () => window.town3d && window.town3d.event;
  var ST = { new: "\u65B0\u7740(\u6295\u7968\u4E2D)", shelf: "\u5171\u6709\u306E\u68DA", passed: "\u898B\u9001\u308A" };
  function createAdmin(core2) {
    const st = createStore("core");
    try {
      const q = new URLSearchParams(location.search).get("admin");
      if (q === "1") st.set("admin", true);
      if (q === "0") st.remove("admin");
    } catch (e) {
    }
    const on = () => !!st.get("admin");
    function durRow() {
      const d = durLoad(), f = (k) => d[k] ? +(d[k] / 60).toFixed(2) : "";
      const one = (k, lab) => `<label style="display:flex;gap:4px;align-items:center">${lab}<input data-dur="${k}" type="number" step="0.5" min="0.2" inputmode="decimal" placeholder="\u6A19\u6E96" value="${f(k)}" style="width:62px;padding:5px;border-radius:8px;border:2px solid #cbb;font:inherit">\u5206</label>`;
      const T = T3(), L = T && T.lengths ? T.lengths() : null, mm2 = (x) => {
        const m = Math.floor(x / 60), r = x % 60;
        return (m ? m + "\u5206" : "") + (r ? r + "\u79D2" : "") || "0\u79D2";
      };
      const std = L ? `\u6A19\u6E96\u306E\u9577\u3055:\u82B1\u706B(\u30C0\u30A4\u30B8\u30A7\u30B9\u30C8 ${mm2(L.digest)}\u30FB\u30D5\u30EB ${mm2(L.full)}\u30FB\u30B9\u30BF\u30FC\u30DE\u30A4\u30F3 ${mm2(L.starmine)}\u30FB\u30D5\u30A3\u30CA\u30FC\u30EC ${mm2(L.finale)}) / \u65E5\u98DF ${mm2(L.solar)} / \u6708\u98DF ${mm2(L.lunar)} / \u96E8\u3068\u8679 ${mm2(L.rain)}` : "";
      return `<p class="cs-note">${std}</p><p class="cs-note">\u305C\u3093\u305F\u3044\u306E\u9577\u3055(\u304B\u3089\u3063\u307D=\u6A19\u6E96\u3002\u5909\u3048\u305F\u3089\u4E0B\u306E\u300C\u9577\u3055\u3092\u4FDD\u5B58\u300D):</p><div class="cs-adm-row" style="flex-wrap:wrap">${one("fw", "\u{1F386}\u82B1\u706B")}${one("solar", "\u{1F311}\u65E5\u98DF")}${one("lunar", "\u{1F315}\u6708\u98DF")}${one("rain", "\u2614\u96E8\u3068\u8679")}</div><div class="cs-adm-row"><button data-durs="1">\u9577\u3055\u3092\u4FDD\u5B58</button></div>`;
    }
    function evSection() {
      const T = T3(), list = evLoad();
      if (!T) return '<section class="cs-adm"><h4>\u30A4\u30D9\u30F3\u30C8(\u82B1\u706B\u30FB\u65E5\u98DF\u30FB\u6708\u98DF)</h4><p class="cs-note">3D\u306E\u753A\u3092\u958B\u3044\u3066\u304B\u3089\u3001\u3053\u3053\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002</p></section>';
      const opts = Object.entries(T.kinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
      const fwb = Object.keys(T.fwTypes).map((k) => `<button data-ev="fw:${k}">${esc6(T.fwTypes[k])}</button>`).join("");
      const now = new Date(Date.now() + 6e4);
      return `<section class="cs-adm"><h4>\u30A4\u30D9\u30F3\u30C8(\u82B1\u706B\u30FB\u65E5\u98DF\u30FB\u6708\u98DF)</h4>
      <p class="cs-note">\u62BC\u3059\u3068\u904B\u55B6\u753B\u9762\u304C\u9589\u3058\u3066\u3001\u753A\u3067\u3059\u3050\u59CB\u307E\u308A\u307E\u3059(\u591C\u306B\u5207\u308A\u304B\u308F\u308A\u307E\u3059)\u3002</p>
      <div class="cs-adm-row"><button data-bday="day">\u{1F382} \u8A95\u751F\u65E5\u3092\u305F\u3081\u3059(\u4ECA\u3059\u3050)</button><button data-bday="night">\u{1F382} \u8A95\u751F\u65E5\u306E\u591C\u3092\u305F\u3081\u3059(\u82B1\u706B\u3068\u5199\u771F)</button><button data-bday="after">\u{1F382} \u7FCC\u6708\u306E\u534A\u984D\u306E\u304A\u77E5\u3089\u305B</button><button data-bday="off">\u8A95\u751F\u65E5\u30C6\u30B9\u30C8\u3092\u3084\u3081\u308B</button></div><div class="cs-adm-row"><button data-ev="fw:digest">\u82B1\u706B\u30C0\u30A4\u30B8\u30A7\u30B9\u30C8</button><button data-ev="fw:full">\u82B1\u706B\u30D5\u30EB</button><button data-ev="fw:starmine">\u30B9\u30BF\u30FC\u30DE\u30A4\u30F3</button><button data-ev="fw:finale">\u30D5\u30A3\u30CA\u30FC\u30EC</button><button data-ev="solar">\u{1F311}\u65E5\u98DF</button><button data-ev="lunar">\u{1F315}\u6708\u98DF</button><button data-ev="rain">\u2614\u96E8\u3068\u8679</button></div>
      ${durRow()}
      <p class="cs-note">\u82B1\u706B1\u7A2E\u985E\u305A\u3064:</p><div class="cs-adm-row">${fwb}</div>
      <p class="cs-note">\u4E88\u7D04(\u3053\u306E\u7AEF\u672B\u306E\u6642\u8A08\u3067\u3002\u8A95\u751F\u65E5\u306F\u753A\u306B\u767B\u9332\u3055\u308C\u305F\u8A95\u751F\u65E5\u306E\u591C\u306B1\u56DE):</p>
      <div class="cs-adm-row"><select id="evK" style="font:inherit;padding:6px">${opts}</select></div>
      <div class="cs-adm-row" style="align-items:center"><input id="evAt" type="datetime-local" value="${localIso(now)}" style="font:inherit;padding:6px"><button data-evadd="date">\u3053\u306E\u65E5\u6642\u306B\u4E88\u7D04</button></div>
      <div class="cs-adm-row"><button data-evadd="birthday">\u307F\u3093\u306A\u306E\u8A95\u751F\u65E5\u306E\u591C(20\u6642\u301C)\u306B\u4E88\u7D04</button><button data-evadd="soon">30\u79D2\u5F8C\u306B\u59CB\u3081\u308B</button></div>
      <ul class="cs-adm-list">${list.map((e) => `<li><b>${esc6(T.kinds[e.kind] || e.kind)}</b><small>${e.when === "birthday" ? "\u8A95\u751F\u65E5\u306E\u591C" : esc6((e.at || "").replace("T", " "))}</small><div class="cs-adm-row"><button data-evdel="${esc6(e.id)}">\u6D88\u3059</button></div></li>`).join("") || '<li class="cs-note">\u4E88\u7D04\u306F\u3042\u308A\u307E\u305B\u3093</li>'}</ul></section>`;
    }
    function open() {
      const M = core2.member, C = core2.cloud, B = core2.books;
      const items = C.all(), rev = C.reviewList(), reps = C.reports();
      const week = B ? B.weekly().map((b) => esc6(b.title)).join("\u3001") : "";
      core2.ui.sheet(
        `<h3>\u904B\u55B6</h3>
      <section class="cs-adm"><h4>\u4F1A\u54E1\u3068\u304A\u91D1(\u3053\u306E\u7AEF\u672B\u3067\u8A66\u3059)</h4>
        <p class="cs-note">${PLAN_NAME[M.plan]} \u30FB \u30B3\u30A4\u30F3 ${core2.wallet.get()}(\u6708\u66FF\u308F\u308A\u306B\u6B8B\u305B\u308B\u4E0A\u9650 ${M.coinCapText()}) \u30FB \u30C0\u30A4\u30E4 ${M.gems()} \u30FB \u5171\u6709\u306E\u67A0 ${M.slots().length}/${M.slotMax()}</p>
        <div class="cs-adm-row"><button class="cs-btn" data-a="plan">${M.isPaid() ? "\u7121\u6599\u4F1A\u54E1\u306B\u3059\u308B" : "\u6709\u6599\u4F1A\u54E1\u306B\u3059\u308B"}</button><button class="cs-btn" data-a="month">\u6708\u66FF\u308F\u308A\u3092\u8A66\u3059</button></div>
        <div class="cs-adm-row" style="align-items:center"><span>\u{1F48E}</span><input id="adG" type="number" inputmode="numeric" value="100" style="width:90px;padding:6px;border-radius:8px;border:2px solid #cbb;font:inherit"><button class="cs-btn" data-a="gems">\u30C0\u30A4\u30E4\u3092\u5897\u3084\u3059</button></div>
        <div class="cs-adm-row" style="align-items:center"><span>\u{1FA99}</span><input id="adC" type="number" inputmode="numeric" value="1000" style="width:90px;padding:6px;border-radius:8px;border:2px solid #cbb;font:inherit"><button class="cs-btn" data-a="coins">\u30B3\u30A4\u30F3\u3092\u5897\u3084\u3059</button></div>
        <p class="cs-note">\u6570\u5B57\u3092\u5165\u308C\u3066\u62BC\u3059\u3068\u3001\u305D\u306E\u6570\u3060\u3051\u5897\u3048\u307E\u3059(\u30DE\u30A4\u30CA\u30B9\u3067\u6E1B\u3089\u305B\u307E\u3059)\u3002</p></section>
      ${evSection()}
      <section class="cs-adm"><h4>\u5171\u6709\u306E\u6559\u6750(${items.length})</h4>
        ${reps.length ? `<p class="cs-note">\u901A\u5831 ${reps.length}\u4EF6:${reps.map((r) => esc6((C.get(r.id) || {}).title || r.id) + "\u300C" + esc6(r.why) + "\u300D").join(" / ")}</p>` : ""}
        ${rev.length ? `<p class="cs-note">\u898B\u76F4\u3057\u306E\u5019\u88DC:${rev.map((x) => esc6(x.title) + "(" + esc6(x.why) + ")").join(" / ")}</p>` : ""}
        <ul class="cs-adm-list">${items.map((x) => `<li><b>${esc6(x.title)}</b><small>${ST[x.state] || x.state} \u30FB ${esc6(x.author)} \u30FB \u7968${x.votes} \u30FB \u3088\u304B\u3063\u305F${x.good}/\u3044\u307E\u3044\u3061${x.bad} \u30FB \u4F7F\u7528${x.uses} \u30FB id sh:${x.id}</small>
          <div class="cs-adm-row">${x.state !== "shelf" ? `<button data-s="shelf" data-id="${x.id}">\u68DA\u3078</button>` : `<button data-s="passed" data-id="${x.id}">\u68DA\u304B\u3089\u5916\u3059</button>`}<button data-del="${x.id}">\u5168\u54E1\u304B\u3089\u6D88\u3059</button></div></li>`).join("") || '<li class="cs-note">\u307E\u3060\u3042\u308A\u307E\u305B\u3093</li>'}</ul>
        <p class="cs-note">\u68DA\u306E\u672C\u3092\u8AB2\u984C\u56F3\u66F8\u306B\u3059\u308B\u3068\u304D\u306F\u3001data/library.js \u306E weekly \u306B id(sh:\u2026)\u3092\u66F8\u304D\u307E\u3059\u3002\u9078\u3070\u308C\u305F\u4F5C\u8005\u3078\u306E\u304A\u793C\u306F\u30C0\u30A4\u30E4 ${C.RULES.THANKS_GEMS}(\u8AB2\u91D1\u3068\u3064\u306A\u3044\u3060\u3089\u81EA\u52D5)\u3002</p></section>
      <section class="cs-adm"><h4>\u56F3\u66F8\u9928</h4><p class="cs-note">\u4ECA\u9031\u306E\u8AB2\u984C\u56F3\u66F8:${week || "\u306A\u3057"}<br>\u5909\u3048\u308B\u3068\u304D\u306F data/library.js(\u9031\u3054\u3068\u306E\u8AB2\u984C\u56F3\u66F8\u30FB\u8A71\u984C\u306E\u672C\u30FB\u51FA\u3055\u306A\u3044\u672C)\u3002</p></section>
      <section class="cs-adm"><h4>\u6570\u5B57(core/economy.js)</h4><p class="cs-note">1\u65E5:\u8AB2\u984C ${ECON.daily.task} \u30FB CM ${ECON.daily.cm.each}\xD7${ECON.daily.cm.max} \u30FB \u30B2\u30FC\u30E0 ${ECON.daily.game}<br>\u4E0A\u9650:\u7121\u6599 ${ECON.coinCap.free} \u30FB \u6709\u6599 \u306A\u3057(\u3082\u3089\u3048\u308B\u6570\u306F\u7121\u6599\u306E${ECON.paidCoinMult}\u500D) / \u67A0:\u7121\u6599 ${ECON.slots.free} \u30FB \u6709\u6599 ${ECON.slots.paid} / \u5165\u308C\u66FF\u3048:\u30B3\u30A4\u30F3 ${ECON.swap.free.coins} \u304B\u30C0\u30A4\u30E4 ${ECON.swap.free.gems}<br>AI:\u6709\u6599\u306F\u6708 ${ECON.ai.paidPerMonth} \u56DE\u3001\u8D85\u3048\u305F\u3089\u30C0\u30A4\u30E4 ${ECON.ai.gems} / \u5B9F\u529B\u30C6\u30B9\u30C8:\u7121\u6599\u306F\u90311\u30FB\u6709\u6599\u306F1\u65E51\u3001\u8FFD\u52A0\u30C0\u30A4\u30E4 ${ECON.test.extraGems}</p></section>`,
        (ov, close) => {
          const re = () => {
            close();
            open();
          };
          ov.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
            const a = b.dataset.a;
            if (a === "plan") M.setPlan(M.isPaid() ? "free" : "paid");
            const num = (id) => Math.trunc(+(ov.querySelector(id) || {}).value) || 0;
            if (a === "gems") {
              const n = num("#adG");
              if (n > 0) M.addGems(n, "admin");
              else if (n < 0) M.spendGems(Math.min(-n, M.gems()), "admin");
            }
            if (a === "coins") core2.wallet.set(core2.wallet.get() + num("#adC"), "admin");
            if (a === "month") {
              const d = /* @__PURE__ */ new Date();
              d.setMonth(d.getMonth() - 1);
              M._forceMonth(M.keys.monthKey(d));
            }
            re();
          });
          ov.querySelectorAll("[data-bday]").forEach((b) => b.onclick = () => {
            const k = b.dataset.bday;
            close();
            setTimeout(() => T3() && T3().birthday && T3().birthday(k), 150);
          });
          ov.querySelectorAll("[data-ev]").forEach((b) => b.onclick = () => {
            const k = b.dataset.ev;
            close();
            setTimeout(() => T3() && T3().run(k), 150);
          });
          ov.querySelectorAll("[data-durs]").forEach((b) => b.onclick = () => {
            const o = {};
            ov.querySelectorAll("[data-dur]").forEach((i) => {
              const v = +i.value;
              if (v > 0) o[i.dataset.dur] = Math.round(v * 60);
            });
            try {
              localStorage.setItem("town:evdur", JSON.stringify(o));
            } catch (e) {
            }
            re();
          });
          ov.querySelectorAll("[data-evadd]").forEach((b) => b.onclick = () => {
            const kind = (ov.querySelector("#evK") || {}).value || "fw:digest", t = b.dataset.evadd, l = evLoad(), id = "e" + Date.now().toString(36);
            if (t === "birthday") l.push({ id, kind, when: "birthday", hour: 20 });
            else if (t === "soon") l.push({ id, kind, when: "date", at: "soon" + id, _s: Date.now() + 3e4 });
            else {
              const v = (ov.querySelector("#evAt") || {}).value;
              if (!v) return;
              l.push({ id, kind, when: "date", at: v });
            }
            evSave(l);
            re();
          });
          ov.querySelectorAll("[data-evdel]").forEach((b) => b.onclick = () => {
            evSave(evLoad().filter((e) => e.id !== b.dataset.evdel));
            re();
          });
          ov.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
            C.setState(b.dataset.id, b.dataset.s);
            re();
          });
          ov.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
            if (confirmDel(b)) {
              C.remove(b.dataset.del);
              re();
            }
          });
        }
      );
    }
    function confirmDel(b) {
      if (b.dataset.sure) return true;
      b.dataset.sure = 1;
      b.textContent = "\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u6D88\u3048\u307E\u3059";
      return false;
    }
    return { on, open };
  }

  // core/review.js
  var esc7 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var mm = (s) => {
    const m = Math.round(s / 60);
    return s > 0 && m === 0 ? "1\u5206\u672A\u6E80" : m + "\u5206";
  };
  var dayJa = (k) => {
    const [, m, d] = k.split("-");
    return `${+m}\u6708${+d}\u65E5`;
  };
  var OTHERS = [["prev", "\u524D\u56DE\u306E\u3075\u308A\u304B\u3048\u308A"], ["other", "\u305D\u308C\u4EE5\u5916\u306E\u52C9\u5F37"], ["goal", "\u76EE\u6A19\u6642\u9593"], ["review", "\u4ECA\u65E5\u306E\u3075\u308A\u304B\u3048\u308A"]];
  function createReview(core2) {
    const dl = core2.daylog;
    const give = (kind) => {
      let g = 0;
      try {
        g = core2.member.earn(kind);
      } catch (e) {
      }
      dl.flag(kind, true);
      return g;
    };
    function status() {
      const f = dl.flags(), main = !!core2.member.today().task, others = OTHERS.map(([k, n2]) => ({ k, n: n2, ok: !!f[k] }));
      const n = others.filter((o) => o.ok).length;
      return { main, others, n, ok: main && n >= 3 };
    }
    const watch = () => {
      try {
        const goal = core2.record && core2.record.goal && core2.record.goal().min || 15;
        if (!dl.flagged("goal") && dl.summary().study >= goal * 60) {
          const g = give("goal");
          core2.ui.toast(`\u76EE\u6A19\u306E\u52C9\u5F37\u6642\u9593\u306B\u306A\u3063\u305F\u3088!${g ? " +" + g + "\u30B3\u30A4\u30F3" : ""}`);
        }
      } catch (e) {
      }
    };
    dl.onChange(watch);
    core2.events.on((game, name) => {
      if (name !== "done" || dl.flagged("other")) return;
      const M = core2.mission && core2.mission.current && core2.mission.current();
      if (!M || M.done && Date.now() - M.done > 3e3 || M.kind !== "task") {
        const g = give("other");
        core2.ui.toast(`\u307B\u304B\u306E\u52C9\u5F37\u3082\u3067\u304D\u305F\u306D!${g ? " +" + g + "\u30B3\u30A4\u30F3" : ""}`);
      }
    });
    function open(o = {}) {
      const mode = o.mode === "prev" ? "prev" : "today", day2 = mode === "prev" ? o.day || dl.prevDay() : dl.dayKey();
      if (!day2) {
        core2.ui.toast("\u307E\u3060\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093");
        return;
      }
      const title = mode === "prev" ? `${dayJa(day2)}\u306E\u3075\u308A\u304B\u3048\u308A` : "\u4ECA\u65E5\u306E\u3075\u308A\u304B\u3048\u308A";
      let items = dl.words(day2).map((w) => ({ ...w }));
      const sents = items.filter((w) => w.kind === "sentence");
      items = items.filter((w) => w.kind !== "sentence");
      const forced = dl.forced();
      if (forced || mode === "prev") {
        const have = new Set(items.map((w) => w.en.toLowerCase())), rest = dl.pending().filter((w) => !have.has(w.en.toLowerCase())).sort((a, b) => (b.unk || 0) - (a.unk || 0));
        if (forced) rest.slice(0, Math.max(0, FORCE_N - items.length)).forEach((w) => items.push({ ...w, old: true }));
      }
      items.sort((a, b) => (b.miss ? 1 : 0) + (b.multi > 1 ? 0.5 : 0) - ((a.miss ? 1 : 0) + (a.multi > 1 ? 0.5 : 0)));
      let stopAudio = () => {
      };
      core2.ui.sheet('<div class="rv"></div>', (ov, close) => {
        const box = ov.querySelector(".rv"), closeBtn = ov.querySelector(".cs-close");
        const orig = closeBtn.onclick;
        closeBtn.onclick = () => {
          stopAudio();
          orig();
        };
        const go = (html, bind) => {
          box.innerHTML = html;
          bind && bind();
          box.scrollTop = 0;
        };
        function stepTime() {
          const s = dl.summary(day2), tops = { study: s.study, play: s.play, relax: s.relax }, tot = s.total || 1;
          const bar = Object.entries(tops).filter(([, v]) => v > 0).map(([k, v]) => `<i style="width:${(v / tot * 100).toFixed(1)}%;background:${TOPS[k].col}" title="${TOPS[k].n}"></i>`).join("");
          const rows = ["study", "tv", "sport", "relax"].map((c) => {
            const it = s.items.filter((x) => x.cat === c);
            if (!it.length) return "";
            const top = CATS[c].top;
            return `<div class="rv-g"><b style="color:${CATS[c].col}">${top === "play" ? "\u904A\u3073 / " : ""}${CATS[c].n} <span>${mm(s.by[c])}</span></b>${it.map((x) => `<small>${esc7(x.label)} ${mm(x.sec)}</small>`).join("")}</div>`;
          }).join("");
          let say = "";
          if (mode === "prev" && s.total > 0 && s.play > s.study * 2) say = '<p class="rv-say">\u3053\u306E\u3042\u3044\u3060\u306F\u904A\u3073\u304C\u591A\u3081\u3060\u3063\u305F\u306D\u3002\u4ECA\u65E5\u306F\u52C9\u5F37\u306B\u3059\u308B?</p>';
          else if (s.total > 0 && s.study === 0) say = '<p class="rv-say">\u52C9\u5F37\u306E\u6642\u9593\u304C\u306A\u304B\u3063\u305F\u3088\u3002\u6B21\u306F\u3061\u3087\u3063\u3068\u3060\u3051\u3084\u3063\u3066\u307F\u3088\u3046!</p>';
          go(`<h3>${title}</h3>${s.total ? `<div class="rv-bar">${bar}</div>
          <div class="rv-leg"><span style="color:${TOPS.study.col}">\u25A0\u52C9\u5F37 ${mm(s.study)}</span><span style="color:${TOPS.play.col}">\u25A0\u904A\u3073 ${mm(s.play)}</span><span style="color:${TOPS.relax.col}">\u25A0\u8857\u3067\u307E\u3063\u305F\u308A ${mm(s.relax)}</span></div>
          ${rows}${say}` : '<p class="cs-note">\u3053\u306E\u65E5\u306E\u6642\u9593\u306E\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>'}
          <button class="cs-btn" id="rv-n">${items.length || sents.length ? "\u3064\u304E\u3078(\u8A00\u8449\u306E\u4E00\u89A7)" : "\u304A\u308F\u308B"}</button>`, () => {
            box.querySelector("#rv-n").onclick = () => items.length || sents.length ? stepList() : finish([]);
          });
        }
        function stepList() {
          let tab = "w";
          const row = (w, i, chk) => `<li data-i="${i}">${chk ? `<label class="rv-k" title="\u899A\u3048\u3066\u308B(\u30AB\u30FC\u30C9\u3092\u98DB\u3070\u3059)"><input type="checkbox" data-k="${i}" ${w._k ? "checked" : ""}></label>` : ""}<b>${esc7(w.en)}</b>${w.multi > 1 ? `<em>\uFF0B${w.multi - 1}</em>` : ""}${w.miss ? "<u>\u307E\u3061\u304C\u3048\u305F</u>" : ""}${w.old ? "<u>\u524D\u304B\u3089</u>" : ""}<small>${esc7(w.ja)}</small></li>`;
          const draw = () => {
            const cur = tab === "w" ? items : sents;
            go(`<h3>\u51FA\u4F1A\u3063\u305F${tab === "w" ? "\u8A00\u8449" : "\u6587\u7AE0"}(${cur.length})</h3>
            ${sents.length ? `<nav class="cs-chips"><button data-t="w" class="${tab === "w" ? "on" : ""}">\u8A00\u8449 ${items.length}</button><button data-t="s" class="${tab === "s" ? "on" : ""}">\u6587\u7AE0 ${sents.length}</button></nav>` : ""}
            <p class="cs-note">\u97F3\u58F0\u304C\u9806\u756A\u306B\u6D41\u308C\u307E\u3059\u3002\u300C\uFF0B\u300D\u306F\u3001\u307B\u304B\u306E\u610F\u5473\u3082\u3042\u308B\u8A00\u8449\u3002${tab === "w" ? "<br>\u5DE6\u306E\u25A1\u306B\u30C1\u30A7\u30C3\u30AF\u3092\u5165\u308C\u305F\u8A00\u8449\u306F\u300C\u899A\u3048\u3066\u308B\u300D\u3002\u30D5\u30E9\u30C3\u30B7\u30E5\u30AB\u30FC\u30C9\u3092\u98DB\u3070\u305B\u307E\u3059\u3002" : ""}</p>
            <ul class="rv-list${tab === "w" ? " rv-chk2" : ""}">${cur.map((w, i) => row(w, i, tab === "w")).join("")}</ul>
            <div class="rv-two"><button class="cs-btn" id="rv-p">\u25B6 \u97F3\u58F0</button><button class="cs-btn" id="rv-n">${items.length ? "\u30D5\u30E9\u30C3\u30B7\u30E5\u30AB\u30FC\u30C9\u3078" : "\u304A\u308F\u308B"}</button></div>`, () => {
              let on = false, i = 0;
              const lis = [...box.querySelectorAll("li")], pb = box.querySelector("#rv-p");
              const stop = () => {
                on = false;
                core2.speech.stop();
                pb.textContent = "\u25B6 \u97F3\u58F0";
                lis.forEach((l) => l.classList.remove("now"));
              };
              stopAudio = stop;
              box.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
                stop();
                tab = b.dataset.t;
                draw();
              });
              box.querySelectorAll("input[data-k]").forEach((c) => {
                c.onchange = () => {
                  items[+c.dataset.k]._k = c.checked;
                };
              });
              const next = () => {
                if (!on) return;
                if (i >= cur.length) return stop();
                const w = cur[i];
                lis.forEach((l) => l.classList.remove("now"));
                lis[i].classList.add("now");
                lis[i].scrollIntoView({ block: "nearest" });
                i++;
                core2.speech.speak(w.en, { onend: () => setTimeout(next, 450) });
              };
              pb.onclick = () => {
                if (on) return stop();
                on = true;
                i = 0;
                pb.textContent = "\u25A0 \u3068\u3081\u308B";
                next();
              };
              box.querySelector("#rv-n").onclick = () => {
                stop();
                if (!items.length) return finish([]);
                const known = items.filter((w) => w._k), rest = items.filter((w) => !w._k);
                items = known.concat(rest);
                stepCards.pre = known.length;
                stepCards.resume = known.map((w) => ({ en: w.en, known: true, item: w }));
                stepCards();
              };
              if (tab === "w" && core2.settings.get("voice")) setTimeout(() => {
                if (box.contains(pb) && !on) pb.click();
              }, 400);
            });
          };
          draw();
        }
        function stepCards() {
          const res = stepCards.resume || [];
          stepCards.resume = null;
          let idx = res.length;
          const card = () => {
            if (idx >= items.length) return stepCheck(res);
            const w = items[idx];
            go(`<h3>\u30D5\u30E9\u30C3\u30B7\u30E5\u30AB\u30FC\u30C9 <small>${idx + 1}/${items.length}</small></h3>
            <p class="cs-note">\u53F3\u3078\u30C1\u30E7\u30F3=\u899A\u3048\u3066\u308B / \u5DE6\u3078\u30C1\u30E7\u30F3=\u307E\u3060 / \u30BF\u30C3\u30D7\u3067\u3081\u304F\u308B</p>
            <div class="rv-card" id="rv-c"><div class="f"><b>${esc7(w.en)}</b>${w.pos ? `<small>${esc7(w.pos)}</small>` : ""}<span class="b" hidden>${esc7(w.ja || "(\u610F\u5473\u306E\u8A18\u9332\u306A\u3057)")}${w.multi > 1 ? `<em>\u307B\u304B\u306E\u610F\u5473\u3082\u3042\u308B\u3088(\uFF0B${w.multi - 1})</em>` : ""}</span></div></div>
            <div class="rv-two"><button class="cs-btn rv-no" id="rv-x">\u2190 \u307E\u3060</button><button class="cs-btn rv-ok" id="rv-o">\u899A\u3048\u3066\u308B \u2192</button></div>
            ${idx > (stepCards.pre || 0) ? '<button class="cs-btn" id="rv-b">\u21A9 \u3072\u3068\u3064 \u3082\u3069\u308B</button>' : ""}`, () => {
              const c = box.querySelector("#rv-c"), back = c.querySelector(".b");
              let x0 = null, dx = 0, moved = false, flipped = false, done = false;
              core2.speech.speak(w.en);
              const answer = (known) => {
                if (done) return;
                done = true;
                res.push({ en: w.en, known, item: w });
                c.style.transition = "transform .12s,opacity .12s";
                c.style.transform = `translateX(${known ? 140 : -140}%) rotate(${known ? 14 : -14}deg)`;
                c.style.opacity = 0;
                setTimeout(() => {
                  idx++;
                  card();
                }, 110);
              };
              const FLICK = 14, FAST = 0.45;
              let t0 = 0;
              const reset = () => {
                x0 = null;
                if (done) return;
                c.style.transition = "transform .15s";
                c.style.transform = "";
                c.classList.remove("r", "l");
              };
              c.onpointerdown = (e) => {
                x0 = e.clientX;
                dx = 0;
                moved = false;
                t0 = e.timeStamp;
                try {
                  c.setPointerCapture(e.pointerId);
                } catch (_) {
                }
                c.style.transition = "none";
              };
              c.onpointermove = (e) => {
                if (x0 == null || done) return;
                dx = e.clientX - x0;
                if (Math.abs(dx) > 6) moved = true;
                c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
                c.classList.toggle("r", dx > 8);
                c.classList.toggle("l", dx < -8);
                const v = Math.abs(dx) / Math.max(16, e.timeStamp - t0);
                if (dx > FLICK || dx > 8 && v > FAST) answer(true);
                else if (dx < -FLICK || dx < -8 && v > FAST) answer(false);
              };
              c.onpointerup = () => {
                if (x0 == null || done) {
                  x0 = null;
                  return;
                }
                x0 = null;
                c.style.transition = "transform .15s";
                c.style.transform = "";
                c.classList.remove("r", "l");
                if (!moved) {
                  flipped = !flipped;
                  back.hidden = !flipped;
                  c.classList.toggle("flip", flipped);
                  if (flipped) core2.speech.speak(w.en);
                }
              };
              c.onpointercancel = reset;
              c.onlostpointercapture = () => {
                if (x0 != null) reset();
              };
              box.querySelector("#rv-x").onclick = () => answer(false);
              box.querySelector("#rv-o").onclick = () => answer(true);
              const bb = box.querySelector("#rv-b");
              if (bb) bb.onclick = () => {
                res.pop();
                idx--;
                card();
              };
            });
          };
          card();
        }
        function stepCheck(res) {
          go(`<h3>\u3055\u3044\u3054\u306B \u304B\u304F\u306B\u3093</h3><p class="cs-note">\u30C1\u30A7\u30C3\u30AF\u304C\u5165\u3063\u3066\u3044\u308B\u8A00\u8449\u306F\u300C\u899A\u3048\u3066\u308B\u300D\u3002\u307E\u3061\u304C\u3044\u306F\u3001\u3053\u3053\u3067\u76F4\u305B\u307E\u3059\u3002</p>
          <div class="rv-two"><button class="cs-btn" id="rv-all">\u305C\u3093\u3076 \u899A\u3048\u3066\u308B</button><button class="cs-btn" id="rv-none">\u305C\u3093\u3076 \u307E\u3060</button></div>
          <ul class="rv-list rv-chk">${res.map((r, i) => `<li><label><input type="checkbox" data-i="${i}" ${r.known ? "checked" : ""}><span class="t"><b>${esc7(r.en)}</b><small>${esc7(r.item.ja || "")}</small></span></label></li>`).join("")}</ul>
          <div class="rv-two"><button class="cs-btn" id="rv-bk">\u21A9 \u30AB\u30FC\u30C9\u306B\u3082\u3069\u308B</button><button class="cs-btn rv-ok" id="rv-d">\u3053\u308C\u3067\u6C7A\u5B9A</button></div>`, () => {
            const cbs = [...box.querySelectorAll("input[type=checkbox]")];
            let paint = null, swallow = false;
            const lst = box.querySelector(".rv-chk");
            const under = (e) => {
              const el = document.elementFromPoint(e.clientX, e.clientY), cb = el && el.closest && el.closest("li") && el.closest("li").querySelector("input");
              return cb || null;
            };
            lst.onpointerdown = (e) => {
              if (e.target.type !== "checkbox") return;
              e.preventDefault();
              swallow = true;
              paint = !e.target.checked;
              e.target.checked = paint;
              try {
                lst.setPointerCapture(e.pointerId);
              } catch (_) {
              }
            };
            lst.onpointermove = (e) => {
              if (paint == null) return;
              const cb = under(e);
              if (cb) cb.checked = paint;
            };
            lst.onpointerup = lst.onpointercancel = () => {
              paint = null;
            };
            lst.onclick = (e) => {
              if (swallow && e.target.type === "checkbox") e.preventDefault();
              swallow = false;
            };
            box.querySelector("#rv-all").onclick = () => cbs.forEach((c) => {
              c.checked = true;
            });
            box.querySelector("#rv-none").onclick = () => cbs.forEach((c) => {
              c.checked = false;
            });
            box.querySelector("#rv-bk").onclick = () => {
              res.pop();
              stepCardsFrom(res);
            };
            box.querySelector("#rv-d").onclick = () => {
              cbs.forEach((c) => {
                res[+c.dataset.i].known = c.checked;
              });
              finish(res);
            };
          });
        }
        function stepCardsFrom(res) {
          const keep = res.slice();
          stepCards.resume = keep;
          stepCards();
        }
        function finish(res) {
          stopAudio();
          const ng = res.filter((r) => !r.known);
          let g = 0, msg = "";
          if (res.length || !items.length) {
            dl.finishReview(day2, res);
            if (mode === "today") g = give("review");
            else if (!o.noPt) g = give("prev");
          }
          go(`<h3>\u304A\u3064\u304B\u308C\u3055\u307E!</h3>${res.length ? `<p>\u899A\u3048\u3066\u308B ${res.length - ng.length} \u30FB \u307E\u3060 ${ng.length}</p>${ng.length ? '<p class="cs-note">\u300C\u307E\u3060\u300D\u306E\u8A00\u8449\u306F\u3001\u3042\u3068\u3067 \u307E\u305F\u3067\u3066\u304F\u308B\u3088\u3002</p>' : ""}` : ""}
          ${g ? `<p class="rv-pt">+${g} \u30B3\u30A4\u30F3</p>` : '<p class="cs-note">\u3053\u306E\u3075\u308A\u304B\u3048\u308A\u306E\u30B3\u30A4\u30F3\u306F\u3001\u3082\u3089\u3048\u306A\u304B\u3063\u305F\u3088(\u53D7\u3051\u53D6\u308A\u6E08\u307F\u3001\u307E\u305F\u306F\u5FD8\u308C\u305F\u65E5)\u3002</p>'}
          ${mode === "today" ? `<p class="cs-note">${statusLine()}</p>` : ""}<button class="cs-btn" id="rv-e">${mode === "today" ? "\u4ECA\u65E5\u306F\u3053\u3053\u307E\u3067!" : "\u3064\u3065\u3051\u308B"}</button>${dl.pool().length >= 4 ? '<button class="cs-btn" id="rv-t">\u5358\u8A9E\u30C6\u30B9\u30C8\u3082\u3084\u308B</button>' : ""}`, () => {
            box.querySelector("#rv-e").onclick = () => close();
            const tb = box.querySelector("#rv-t");
            if (tb) tb.onclick = () => {
              close();
              test();
            };
          });
        }
        if (mode === "today" && !o.noConfirm) go(`<h3>\u4ECA\u65E5\u306F\u3053\u3053\u307E\u3067\u306B\u3059\u308B?</h3><p class="cs-note">\u3053\u306E\u65E5\u306E\u3075\u308A\u304B\u3048\u308A(\u6642\u9593\u30FB\u8A00\u8449\u30FB\u30AB\u30FC\u30C9)\u3092\u3057\u3066\u3001\u4ECA\u65E5\u3092\u7D42\u308F\u308A\u307E\u3059\u3002</p><p class="cs-note">${statusLine()}</p>
        <button class="cs-btn" id="rv-y">\u3053\u3053\u307E\u3067\u306B\u3057\u3066\u3001\u3075\u308A\u304B\u3048\u308B</button><button class="cs-btn" id="rv-no">\u307E\u3060 \u3042\u305D\u3076</button>`, () => {
          box.querySelector("#rv-y").onclick = stepTime;
          box.querySelector("#rv-no").onclick = close;
        });
        else stepTime();
      });
    }
    const statusLine = () => {
      const s = status();
      return s.ok ? "\u4ECA\u65E5\u306E\u8AB2\u984C\u306F\u305C\u3093\u3076OK!\u307E\u305F\u660E\u65E5\u306D\u3002" : !s.main ? "\u4ECA\u65E5\u306E\u30E1\u30A4\u30F3\u8AB2\u984C\u304C \u307E\u3060\u3060\u3088\u3002" : `\u307B\u304B\u306E\u8AB2\u984C\u306F \u3042\u3068${3 - s.n}\u3064 \u3067OK\u3002`;
    };
    const TEST_N = 10, TEST_DAYS = 3, SLOW = 10;
    const testDue = () => {
      if (dl.pool().length + dl.knownKeys().length < 8) return false;
      const l = dl.lastTest();
      return !l || (Date.parse(dl.dayKey()) - Date.parse(l)) / 864e5 >= TEST_DAYS;
    };
    async function test() {
      let pool = dl.pool();
      if (pool.length < TEST_N) {
        try {
          const ex = /* @__PURE__ */ new Set([...dl.knownKeys(), ...pool.map((w) => w.en.toLowerCase())]);
          pool = pool.concat(await core2.level.fillWords(TEST_N - pool.length + 3, ex));
        } catch (e) {
        }
      }
      if (pool.length < 4) {
        core2.ui.toast("\u30C6\u30B9\u30C8\u3067\u304D\u308B\u8A00\u8449\u304C\u3001\u307E\u3060\u5C11\u306A\u3044\u3088");
        return;
      }
      const first = (w) => String(w.ja).split(/[、,・]/)[0].trim();
      const qs = pool.slice().sort(() => Math.random() - 0.5).slice(0, TEST_N).map((w) => {
        const bad = pool.filter((x) => x.en !== w.en && first(x) !== first(w)).sort(() => Math.random() - 0.5).slice(0, 3).map(first);
        return { w, ans: first(w), ch: [first(w), ...bad].sort(() => Math.random() - 0.5) };
      });
      core2.ui.sheet('<div class="rv"></div>', (ov, close) => {
        const box = ov.querySelector(".rv");
        let i = 0;
        const res = [];
        let t0 = 0;
        const q = () => {
          if (i >= qs.length) return end();
          const Q = qs[i];
          t0 = Date.now();
          core2.speech.speak(Q.w.en);
          box.innerHTML = `<h3>\u5358\u8A9E\u30C6\u30B9\u30C8 <small>${i + 1}/${qs.length}</small></h3><div class="rv-card" style="cursor:default"><div class="f"><b>${esc7(Q.w.en)}</b>${Q.w.pos ? `<small>${esc7(Q.w.pos)}</small>` : ""}</div></div>
          <div class="rv-ch">${Q.ch.map((c, k) => `<button class="cs-btn" data-k="${k}">${esc7(c)}</button>`).join("")}</div><p class="cs-note">10\u79D2\u4EE5\u4E0A\u306A\u3084\u3093\u3060\u8A00\u8449\u306F\u3001\u3042\u3068\u3067\u3082\u3046\u4E00\u5EA6\u51FA\u307E\u3059\u3002</p>`;
          box.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => {
            const ok = Q.ch[+b.dataset.k] === Q.ans, slow = (Date.now() - t0) / 1e3 > SLOW;
            res.push({ ok, slow, w: Q.w });
            b.style.background = ok ? "#bff0cf" : "#ffc9c9";
            box.querySelectorAll("[data-k]").forEach((x) => {
              x.disabled = true;
              if (Q.ch[+x.dataset.k] === Q.ans) x.style.background = "#bff0cf";
            });
            setTimeout(() => {
              i++;
              q();
            }, ok ? 450 : 1100);
          });
        };
        function end() {
          const again = res.filter((r) => !r.ok || r.slow).map((r) => r.w);
          if (again.length) dl.enqueue(again);
          dl.setTest(dl.dayKey());
          box.innerHTML = `<h3>\u30C6\u30B9\u30C8\u304A\u308F\u308A</h3><p style="text-align:center;font-size:20px;font-weight:900">${res.filter((r) => r.ok).length} / ${res.length} \u6B63\u89E3</p>
          ${again.length ? `<p class="cs-note">\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u30FB10\u79D2\u4EE5\u4E0A\u306A\u3084\u3093\u3060\u8A00\u8449 ${again.length}\u3053 \u306F\u3001\u3042\u3068\u306E\u5FA9\u7FD2\u306B\u5165\u308C\u305F\u3088\u3002</p>` : '<p class="cs-note">\u305C\u3093\u3076 \u3059\u3070\u3084\u304F\u6B63\u89E3!</p>'}<button class="cs-btn" id="rv-e">\u304A\u308F\u308B</button>`;
          box.querySelector("#rv-e").onclick = close;
        }
        q();
      });
    }
    function entrance() {
      const today = dl.dayKey(), last = dl.lastEnter();
      if (last === today) {
        const s = dl.summary(), goal = core2.record && core2.record.goal && core2.record.goal().min || 15, st = status();
        const say = s.study >= goal * 60 ? "\u52C9\u5F37\u304C\u3093\u3070\u3063\u305F\u306D\u3002\u3061\u3087\u3063\u3068\u606F\u629C\u304D\u3059\u308B?" : s.study < goal * 20 ? "\u4F55\u304B\u52C9\u5F37\u3057\u5FD8\u308C\u3066\u305F?" : "\u304A\u304B\u3048\u308A!";
        return { kind: "again", say, left: [!st.main && "\u30E1\u30A4\u30F3\u8AB2\u984C", ...st.others.filter((o) => !o.ok && o.k !== "prev").map((o) => o.n)].filter(Boolean) };
      }
      dl.setEnter(today);
      const prev = dl.prevDay();
      if (!prev) return { kind: "first" };
      const forgot = dl.forgotten();
      if (forgot) {
        const gk = dl.graceAt(), can = !gk || (Date.parse(today) - Date.parse(gk)) / 864e5 >= 7;
        if (can) {
          dl.setGrace(today);
        }
        return { kind: "forgot", day: forgot, grace: can, say: `${dayJa(forgot)}\u306E\u3075\u308A\u304B\u3048\u308A\u3092 \u308F\u3059\u308C\u3066\u305F\u3088\u3002${can ? "\u4ECA\u56DE\u3060\u3051\u7279\u5225\u306B\u30B3\u30A4\u30F3\u3092\u3042\u3052\u308B\u306D\u3002\u3067\u3082\u6B21\u304B\u3089\u306F\u3001\u30DD\u30A4\u30F3\u30C8\u304C\u3082\u3089\u3048\u306A\u304F\u306A\u3063\u3061\u3083\u3046\u304B\u3089\u6C17\u3092\u3064\u3051\u3066\u306D\u3002" : "\u3075\u308A\u304B\u3048\u308A\u3092\u3059\u308B\u3068\u3001\u30B3\u30A4\u30F3\u304C\u3082\u3089\u3048\u308B\u3088\u3002\u3082\u3063\u305F\u3044\u306A\u3044\u304B\u3089\u5FD8\u308C\u306A\u3044\u3067\u306D\u3002"}` };
      }
      return { kind: dl.words(prev).length ? "prev" : "none", day: prev };
    }
    function enter() {
      const e = entrance();
      if (e.kind === "again") {
        core2.ui.toast(e.say);
        return e;
      }
      if ((e.kind === "prev" || e.kind === "forgot") && dl.words(e.day).length) {
        if (e.kind === "forgot") core2.ui.toast(e.say);
        setTimeout(() => open({ mode: "prev", day: e.day, noPt: e.kind === "forgot" && !e.grace }), e.kind === "forgot" ? 600 : 300);
      }
      if (!(e.kind === "prev" || e.kind === "forgot") && testDue()) {
        core2.ui.toast("\u5358\u8A9E\u30C6\u30B9\u30C8\u306E\u65E5\u3060\u3088!");
        setTimeout(test, 1200);
      }
      return e;
    }
    const mark = (k) => {
      if (dl.flagged(k)) return 0;
      const g = give(k);
      core2.ui.toast(`${OTHERS.find((o) => o[0] === k)?.[1] || ""}${g ? " +" + g + "\u30B3\u30A4\u30F3" : ""}`);
      return g;
    };
    return { open, status, entrance, enter, mark, test, testDue };
  }

  // core/learn.js
  var key = (en) => String(en || "").trim().toLowerCase();
  function createLearn(events) {
    const st = createStore("core");
    let R = st.get("learn") || {}, tm = 0;
    const save = () => {
      clearTimeout(tm);
      tm = setTimeout(() => st.set("learn", R), 300);
    };
    const api = {
      hit(en, ok, o = {}) {
        const k = key(en);
        if (!k) return null;
        const r = R[k] || (R[k] = { c: 0, ok: 0, ng: 0, t: 0 });
        if (ok) {
          r.c++;
          r.ok++;
        } else {
          r.c = 0;
          r.ng++;
        }
        r.t = Date.now();
        if (o.ja) r.ja = o.ja;
        save();
        return { ...r };
      },
      get(en) {
        const r = R[key(en)];
        return r ? { ...r } : null;
      },
      seen(n = 200) {
        return Object.entries(R).filter(([, r]) => r.ja).sort((a, b) => b[1].t - a[1].t).slice(0, n).map(([en, r]) => ({ en, ja: r.ja }));
      },
      // 見たことのある単語(新しい順)
      weak(n = 30) {
        return Object.entries(R).filter(([, r]) => r.ja && r.ng > 0 && r.c < 3).sort((a, b) => b[1].t - a[1].t).slice(0, n).map(([en, r]) => ({ en, ja: r.ja }));
      }
    };
    events.on((game, name, d) => {
      if (game !== "stream" || name !== "done" || !d || d.play !== "stream.word" || !Array.isArray(d.wl)) return;
      const miss = new Map((d.missed || []).map((x) => [key(x.en), x.ja]));
      d.wl.forEach((w) => {
        const en = Array.isArray(w) ? w[0] : w, ja = Array.isArray(w) ? w[1] : "";
        api.hit(en, !miss.has(key(en)), { ja: ja || miss.get(key(en)) });
      });
    });
    return api;
  }

  // data/library.js
  var LIBRARY = {
    weekly: [
      { from: "2026-10-19", books: ["st:beg1", "cc:\u30B1\u30F3\u306E\u65E5\u66DC\u65E5", "st:int1"] },
      { from: "2026-10-26", books: ["st:beg2", "cc:\u96E8\u306E\u65E5\u306E\u56F3\u66F8\u9928", "st:int2"] },
      { from: "2026-11-02", books: ["st:adv1", "cc:\u7956\u7236\u306E\u7551", "st:beg1"] }
    ],
    featured: ["st:adv2", "st:int1", "cc:\u99C5\u3067\u306E\u51FA\u6765\u4E8B"],
    hidden: []
  };
  function weeklyBooks(t) {
    const w = LIBRARY.weekly.filter((x) => x.from <= t).sort((a, b) => a.from < b.from ? 1 : -1)[0];
    return w ? w.books.slice() : [];
  }

  // core/mission.js
  var esc8 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var OPP = { 1: "mii", 2: "baron", 3: "gon" };
  var OPPN = { mii: "\u30DF\u30A4", baron: "\u30CF\u30C3\u30BF\u30EA\u7537\u7235", gon: "\u3072\u308D\u3044\u5C4B\u30B4\u30F3" };
  var LVN = { 1: "\u521D\u7D1A", 2: "\u4E2D\u7D1A", 3: "\u4E0A\u7D1A" };
  var CATS2 = [{ k: "word", n: "\u5358\u8A9E\u30FB\u719F\u8A9E" }, { k: "chunk", n: "\u30C1\u30E3\u30F3\u30AF\u3084\u6587\u578B" }, { k: "read", n: "\u8AAD\u66F8" }, { k: "lesson", n: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3\u3092\u898B\u308B" }, { k: "any", n: "\u304A\u307E\u304B\u305B" }];
  var DAY2 = 864e5;
  function createMission(core2) {
    const st = createStore("core"), subs = /* @__PURE__ */ new Set();
    let M = st.get("mission") || null, H = st.get("missionHist") || { kinds: {}, cleared: 0 }, hasGame = () => true;
    const save = () => {
      st.set("mission", M);
      st.set("missionHist", H);
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {
        }
      });
    };
    const today = () => core2.member.keys.dayKey();
    if (M && M.date !== today() && M.kind === "task") {
      M = null;
      save();
    }
    const lv = () => Math.max(1, core2.level && core2.level.lv || 1);
    const can = (g) => hasGame(g) && !!core2.openGame;
    const match = (c, d) => {
      if (!c || d.play !== c.play) return false;
      if (c.play === "stream.read") return d.passage === c.passage && d.whole && d.finished;
      if (c.play === "stream.word") return c.set ? d.set === c.set : c.nb ? String(d.set || "").startsWith("nb-") : true;
      if (c.play === "cc.read") return d.book === c.book && (c.solved ? d.solved : d.finished);
      if (c.play === "cards") return !c.opp || d.opp === c.opp;
      if (c.play === "listen") return d.lv === c.lv && d.n >= 10;
      return true;
    };
    core2.events.on((game, name, d = {}) => {
      if (name !== "done" || !M || M.done || !match(M.check, d)) return;
      M.got = (M.got || 0) + 1;
      if (M.got < (M.need || 1)) {
        save();
        setTimeout(() => core2.ui.toast(`\u30DF\u30C3\u30B7\u30E7\u30F3 ${M.got}/${M.need}`), 700);
        return;
      }
      M.done = Date.now();
      H.cleared = (H.cleared || 0) + 1;
      H.kinds[M.type] = Date.now();
      save();
      try {
        core2.record && core2.record.markMission();
      } catch (e) {
      }
      let coins = 0;
      if (M.kind === "task") coins = core2.member.earn("task");
      setTimeout(() => after(coins), 1200);
    });
    function kinds(L) {
      const nb = core2.notebook.list({ mark: "miss" }).filter((x) => x.ja), out = [];
      const books = core2.books ? core2.books.all().filter((b) => !b.shared && b.lv === L) : [];
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const unread = (f) => {
        const a = books.filter(f), u = a.filter((b) => !core2.record.bookDone(b.id));
        return u.length ? u : a;
      };
      const k6 = () => Math.floor(Math.random() * 6), k3 = () => Math.floor(Math.random() * 3);
      if (can("stream")) {
        const k = k6();
        out.push({ type: "ws", cats: ["word", "game"], time: "s", title: `${LVN[L]}\u306E\u5358\u8A9E \u30BB\u30C3\u30C8${k + 1}`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { wordset: { lv: L, k } } }, check: { play: "stream.word", set: `w${L}-${k + 1}` } });
        const i = k3();
        out.push({ type: "wi", cats: ["word"], time: "s", title: `${LVN[L]}\u306E\u719F\u8A9E \u30BB\u30C3\u30C8${i + 1}`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { wordset: { lv: L, k: i, kind: "i" } } }, check: { play: "stream.word", set: `i${L}-${i + 1}` } });
        out.push({ type: "ws2", cats: ["word"], time: "l", need: 2, title: `${LVN[L]}\u306E\u5358\u8A9E\u30BB\u30C3\u30C8\u30922\u3064`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u306E\u5358\u8A9E\u7DF4\u7FD2\u30922\u30BB\u30C3\u30C8\u3001\u6700\u5F8C\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2(\u30BB\u30C3\u30C8\u306F\u81EA\u7531)", go: { game: "stream", opts: { wordset: { lv: L, k: k6() } } }, check: { play: "stream.word" } });
        if (nb.length >= 4) out.push({ type: "nb", cats: ["word"], time: "s", title: `\u307E\u3061\u304C\u3048\u305F\u8A00\u8449 ${Math.min(20, nb.length)}\u500B\u306E\u7DF4\u7FD2`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { words: nb.slice(0, 20).map((x) => [x.en, x.ja]), title: "\u52C9\u5F37\u30CE\u30FC\u30C8:\u307E\u3061\u304C\u3048\u305F\u8A00\u8449" } }, check: { play: "stream.word", nb: true } });
        const s = unread((b) => b.canStream);
        if (s.length) {
          const b = pick(s);
          out.push({ type: "st", cats: ["read", "game"], time: "l", title: `\u300C${b.title}\u300D\u3092\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u6700\u521D\u304B\u3089\u6700\u5F8C\u307E\u3067`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u30671\u6BB5\u76EE\u304B\u3089\u901A\u3057\u3067\u30AF\u30EA\u30A2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { passage: b.pid, run: true } }, check: { play: "stream.read", passage: b.pid } });
        }
      }
      if (can("listen")) out.push({ type: "ls", cats: ["word", "chunk", "game"], time: "s", title: `\u30E9\u30F3\u30C0\u30E0\u30C1\u30E3\u30F3\u30AF(${LVN[L]})\u309210\u554F`, how: "\u58F0\u3060\u3051\u805E\u3044\u3066\u610F\u5473\u3092\u9078\u3076\u300210\u554F\u7B54\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "listen", opts: { lv: L } }, check: { play: "listen", lv: L } });
      if (can("chunkchunk")) {
        out.push({ type: "le", cats: ["lesson", "chunk"], time: "s", title: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3(\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u30921\u3064)", how: "\u30EC\u30C3\u30B9\u30F3\u3092\u6700\u5F8C\u307E\u3067\u7D42\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "lesson", lesson: "next" } }, check: { play: "cc.lesson" } });
        out.push({ type: "le2", cats: ["lesson", "chunk"], time: "l", need: 2, title: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3(\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u30922\u3064)", how: "\u30EC\u30C3\u30B9\u30F3\u30922\u3064\u3001\u6700\u5F8C\u307E\u3067\u7D42\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "lesson", lesson: "next" } }, check: { play: "cc.lesson" } });
        out.push({ type: "cg", cats: ["game"], time: "s", title: "\u30C1\u30E3\u30F3\u30AF\u30C1\u30E3\u30F3\u30AF\u306E\u30C1\u30E3\u30EC\u30F3\u30B8\u30921\u56DE", how: "\u30C1\u30E3\u30EC\u30F3\u30B8\u3092\u6642\u9593\u3044\u3063\u3071\u3044\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "arcade" } }, check: { play: "cc.game" } });
      }
      if (can("cards")) {
        const o = OPP[L];
        out.push({ type: "ca", cats: ["chunk", "game"], time: "s", title: `\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9\u3067${OPPN[o]}\u30681\u8A66\u5408`, how: "\u8A66\u5408\u3092\u6700\u5F8C\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2(\u52DD\u3061\u8CA0\u3051\u306F\u554F\u308F\u306A\u3044)", go: { game: "cards", opts: { cpu: o } }, check: { play: "cards", opp: o } });
        out.push({ type: "ca3", cats: ["chunk", "game"], time: "l", need: 3, title: "\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9\u30673\u8A66\u5408", how: "\u76F8\u624B\u306F\u81EA\u7531\u30023\u8A66\u5408\u3092\u6700\u5F8C\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "cards" }, check: { play: "cards" } });
      }
      const st2 = unread((b) => b.src === "chunkchunk");
      if (st2.length) {
        const b = pick(st2);
        out.push({ type: "rs", cats: ["read"], time: "s", title: `\u304A\u8A71\u300C${b.title}\u300D\u3092\u6700\u5F8C\u307E\u3067\u8AAD\u3080`, how: "\u8AAD\u3080\u753B\u9762\u3067\u6700\u5F8C\u306E\u6587\u307E\u3067\u9032\u3080\u3068\u30AF\u30EA\u30A2", go: { book: b.id }, check: { play: "cc.read", book: b.id } });
      }
      const rq = unread((b) => b.canRead && (b.story() || {}).questions && b.story().questions.length);
      if (rq.length) {
        const b = pick(rq);
        out.push({ type: "rq", cats: ["read"], time: "l", title: `\u300C${b.title}\u300D\u306E\u554F\u984C\u3092\u5168\u90E8\u89E3\u304F`, how: "\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0\u3067\u554F\u984C\u306B\u5168\u90E8\u7B54\u3048\u3066\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3059\u308B\u3068\u30AF\u30EA\u30A2(\u307E\u3061\u304C\u3063\u3066\u3044\u3066\u3082OK)", go: { book: b.id, view: "solve" }, check: { play: "cc.read", book: b.id, solved: true } });
      }
      return out;
    }
    function candidates(cat, time2) {
      const all = kinds(lv()), now = Date.now();
      return all.filter((x) => (cat === "any" ? !x.cats.every((c) => c === "game") : x.cats.includes(cat)) && (time2 === "any" || x.time === time2)).map((x) => [Math.min(14, (now - (H.kinds[x.type] || 0)) / DAY2) + Math.random() * 1.5, x]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    }
    function task() {
      if (!core2.books) return null;
      const ids = weeklyBooks(today());
      if (!ids.length) return null;
      const b = core2.books.byId(ids[(/* @__PURE__ */ new Date()).getDay() % ids.length]);
      return b || null;
    }
    function taskWays(b) {
      const out = [];
      if (core2.books.hasQ(b)) out.push(["slow", "\u3058\u3063\u304F\u308A\u8AAD\u3080(\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0\u3067\u554F\u984C\u3092\u89E3\u304F)", { kind: "task", type: "task", cats: ["read"], title: `\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${b.title}\u300D\u306E\u554F\u984C\u3092\u5168\u90E8\u89E3\u304F`, how: "\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0\u3067\u554F\u984C\u306B\u5168\u90E8\u7B54\u3048\u3066\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3059\u308B\u3068\u30AF\u30EA\u30A2(\u307E\u3061\u304C\u3063\u3066\u3044\u3066\u3082OK)", go: { book: b.id, view: "solve" }, check: { play: "cc.read", book: b.id, solved: true } }]);
      else out.push(["slow", "\u3058\u3063\u304F\u308A\u8AAD\u3080(\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0)", { kind: "task", type: "task", cats: ["read"], title: `\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${b.title}\u300D\u3092\u6700\u5F8C\u306E\u6587\u307E\u3067\u8AAD\u3080`, how: "\u8AAD\u3080\u753B\u9762\u3067\u6700\u5F8C\u306E\u6587\u307E\u3067\u9032\u3080\u3068\u30AF\u30EA\u30A2", go: { book: b.id }, check: { play: "cc.read", book: b.id } }]);
      if (b.canStream && can("stream")) out.push(["game", "\u30B2\u30FC\u30E0\u3067\u8AAD\u3080(\u30C1\u30E3\u30F3\u30AF\u30B9\u30C8\u30EA\u30FC\u30E0)", { kind: "task", type: "task", cats: ["read"], title: `\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${b.title}\u300D\u3092\u30B9\u30C8\u30EA\u30FC\u30E0\u3067\u6700\u521D\u304B\u3089\u6700\u5F8C\u307E\u3067`, how: "\u30B9\u30C8\u30EA\u30FC\u30E0\u30671\u6BB5\u76EE\u304B\u3089\u901A\u3057\u3067\u30AF\u30EA\u30A2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { passage: b.pid, run: true } }, check: { play: "stream.read", passage: b.pid } }]);
      return out;
    }
    function begin(m) {
      M = { ...m, kind: m.kind || "pick", date: today(), at: Date.now(), done: 0, got: 0 };
      save();
      go(M);
    }
    function go(m) {
      if (m.go.book) {
        const b = core2.books.byId(m.go.book);
        core2.openGame("library", { tab: "weekly" });
        setTimeout(() => {
          if (!b) return;
          if (m.go.view === "solve") core2.books.solveIntro(() => core2.books.read(b, { view: "solve" }));
          else core2.books.read(b);
        }, 250);
      } else core2.openGame(m.go.game, m.go.opts || {});
    }
    const sheet = (html, bind) => core2.ui.sheet(html, bind);
    const btns = (list) => list.map(([k, n, cls]) => `<button class="cs-btn ${cls || ""}" data-v="${k}">${n}</button>`).join("");
    const on = (ov, close, map) => ov.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => {
      close();
      map[b.dataset.v] && map[b.dataset.v]();
    });
    async function open(o = {}) {
      if (o.has) hasGame = o.has;
      if (core2.books) await core2.books.load();
      if (M && !M.done && M.date === today()) return sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u3044\u307E\u306E\u30DF\u30C3\u30B7\u30E7\u30F3</p><div class="cs-mis"><b>${esc8(M.title)}</b><small>${esc8(M.how)}${M.need > 1 ? `(${M.got || 0}/${M.need})` : ""}</small></div>${btns([["go", "\u3064\u3065\u3051\u308B", "cs-go"], ["drop", "\u3084\u3081\u3066\u3001\u307B\u304B\u306E\u3053\u3068\u306B\u3059\u308B"]])}`, (ov, close) => on(ov, close, { go: () => go(M), drop: () => {
        M = null;
        save();
        open(o);
      } }));
      const t = task();
      if (t && !core2.member.today().task && !o.skipTask) {
        const ways = taskWays(t);
        return sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><div class="cs-mis"><b>\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${esc8(t.title)}\u300D</b><small>${esc8(t.ja || "")} \u30FB \u30AF\u30EA\u30A2\u3067\u30B3\u30A4\u30F3 +${core2.econ.daily.task}</small></div><p class="cs-note">\u3069\u3046\u3084\u3063\u3066\u8AAD\u3080?</p>${btns([...ways.map((w) => [w[0], w[1], "cs-go"]), ["other", "\u307B\u304B\u306E\u3053\u3068\u3092\u3059\u308B"]])}`, (ov, close) => on(ov, close, { ...Object.fromEntries(ways.map((w) => [w[0], () => begin(w[2])])), other: () => open({ ...o, skipTask: true }) }));
      }
      mood();
    }
    function mood() {
      sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u3069\u3093\u306A\u6C17\u5206?</p>${btns([["study", "\u52C9\u5F37\u6C17\u5206"], ["game", "\u904A\u3073\u6C17\u5206"], ["free", "\u81EA\u7531\u306B\u3059\u308B"]])}`, (ov, close) => on(ov, close, {
        study: () => time((t) => catSel(t)),
        game: () => time((t) => result("game", t, 0)),
        free: () => free()
      }));
    }
    function time(cb) {
      sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u6642\u9593\u306F?</p>${btns([["s", "5\u5206\u4EE5\u5185"], ["l", "\u305D\u308C\u4EE5\u4E0A"], ["any", "\u6C7A\u3081\u3066\u306A\u3044"]])}`, (ov, close) => on(ov, close, { s: () => cb("s"), l: () => cb("l"), any: () => cb("any") }));
    }
    function catSel(t) {
      sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u4F55\u3092\u52C9\u5F37\u3059\u308B?</p>${btns(CATS2.map((c) => [c.k, c.n]))}`, (ov, close) => on(ov, close, Object.fromEntries(CATS2.map((c) => [c.k, () => result(c.k, t, 0)]))));
    }
    function result(cat, t, i, shown) {
      const list = candidates(cat, t), seen = shown || [];
      const rest = list.filter((x) => !seen.includes(x.type)), m = rest[0] || list[i % Math.max(1, list.length)];
      if (!m) return sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u3067\u3067\u304D\u308B\u3053\u3068\u304C\u3001\u3053\u306E\u30A2\u30D7\u30EA\u306B\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>${btns([["back", "\u3048\u3089\u3073\u306A\u304A\u3059"], ["free", "\u81EA\u7531\u306B\u3059\u308B"]])}`, (ov, close) => on(ov, close, { back: mood, free }));
      sheet(`<h3>\u3053\u308C\u3067\u3044\u3044?</h3><div class="cs-mis"><b>${esc8(m.title)}</b><small>${esc8(m.how)}</small></div>${btns([["ok", "\u306F\u3058\u3081\u308B", "cs-go"], ...list.length > 1 ? [["next", "\u307B\u304B\u306E\u306B\u3059\u308B"]] : [], ["back", "\u3048\u3089\u3073\u306A\u304A\u3059"]])}`, (ov, close) => on(ov, close, {
        ok: () => begin({ ...m, cat }),
        next: () => result(cat, t, i + 1, rest.length > 1 ? [...seen, m.type] : []),
        back: mood
      }));
    }
    function free() {
      const list = [];
      if (core2.to3D) list.push(["town", "3D\u306E\u753A\u3092\u6B69\u304F"]);
      list.push(["note", "\u81EA\u5B85\u306E\u52C9\u5F37\u30CE\u30FC\u30C8\u304B\u3089"]);
      if (!core2.to3D) list.push(["map", "\u5730\u56F3\u304B\u3089\u65BD\u8A2D\u3092\u9078\u3076"]);
      sheet(`<h3>\u81EA\u7531\u306B\u3059\u308B</h3><p class="cs-note">\u30DF\u30C3\u30B7\u30E7\u30F3\u306A\u3057\u3067\u3001\u597D\u304D\u306B\u904A\u3079\u307E\u3059(\u8A18\u9332\u306B\u306F\u5165\u308A\u307E\u3059)\u3002</p>${btns(list)}`, (ov, close) => on(ov, close, {
        town: () => to3DAt(),
        note: () => core2.study.open({ play: core2.openGame, has: hasGame, tab: "note" }),
        map: () => {
        }
      }));
    }
    function after(coins) {
      const last = M;
      sheet(`<h3>\u30DF\u30C3\u30B7\u30E7\u30F3\u30AF\u30EA\u30A2!</h3><div class="cs-mis"><b>${esc8(last.title)}</b><small>${coins ? `\u4ECA\u65E5\u306E\u8AB2\u984C\u306E\u30B3\u30A4\u30F3 +${coins}` : "\u3088\u304F\u3067\u304D\u307E\u3057\u305F"}</small></div><p class="cs-note">\u3053\u308C\u304B\u3089\u3069\u3046\u3057\u307E\u3059\u304B?</p>
      ${btns([["more", "\u3082\u3063\u3068\u3084\u308A\u305F\u3044(\u540C\u3058\u7CFB\u7D71)"], ["any", "\u30C6\u30AD\u30C8\u30FC\u306B\u304A\u3059\u3059\u3081\u3057\u3066\u307B\u3057\u3044"], ["free", "\u81EA\u7531\u306B\u904A\u3076"], ["coin", "\u3082\u3063\u3068\u30B3\u30A4\u30F3\u304C\u6B32\u3057\u3044"], ["rec", "\u81EA\u5206\u306E\u8A18\u9332\u3092\u898B\u308B"]])}`, (ov, close) => on(ov, close, {
        more: () => result(last.cat && last.cat !== "any" ? last.cat : (last.cats || ["any"])[0], "any", 0, [last.type]),
        any: () => result("any", "any", 0, [last.type]),
        free: () => free(),
        coin: () => coinWays(),
        rec: () => records()
      }));
    }
    function coinWays() {
      const d = core2.member.today(), E = core2.econ, list = [];
      if (d.cmLeft > 0) list.push(["cm", `CM\u3092\u898B\u308B(+${E.daily.cm.each}\u30FB\u4ECA\u65E5\u3042\u3068${d.cmLeft}\u56DE)`]);
      if (d.gameLeft > 0) list.push(["game", `\u30B2\u30FC\u30E0\u306E\u3054\u307B\u3046\u3073(\u4ECA\u65E5\u3042\u3068${d.gameLeft}\u679A\u307E\u3067)`]);
      if (!d.task && task()) list.push(["task", `\u4ECA\u65E5\u306E\u8AB2\u984C(+${E.daily.task})`]);
      const dd = /* @__PURE__ */ new Date(), omiKey = `${dd.getFullYear()}${dd.getMonth()}${dd.getDate()}`;
      let omiDone = false;
      try {
        omiDone = JSON.parse(localStorage.getItem("town:app:omikuji:day")) === omiKey;
      } catch (e) {
      }
      if (core2.to3D && !omiDone) list.push(["omi", "3D\u306E\u753A\u306E\u795E\u793E\u3067\u304A\u307F\u304F\u3058(1\u65E51\u56DE)"]);
      const home = core2.to3D ? [["home", "3D\u306E\u81EA\u5B85\u3078"], ["town", "3D\u306E\u753A\u3078"]] : [["map", "\u5730\u56F3\u3078\u3082\u3069\u308B"]];
      if (!list.length) {
        return sheet(`<h3>\u4ECA\u65E5\u306F\u3053\u3053\u307E\u3067</h3><p class="cs-note">\u4ECA\u65E5\u3082\u3089\u3048\u308B\u30B3\u30A4\u30F3\u306F\u3001\u3082\u3046\u5168\u90E8\u3082\u3089\u3044\u307E\u3057\u305F\u3002\u307E\u305F\u660E\u65E5!</p>${btns(home)}`, (ov, close) => on(ov, close, { home: toHome3D, town: () => to3DAt(), map: () => {
        } }));
      }
      sheet(`<h3>\u3082\u3063\u3068\u30B3\u30A4\u30F3\u304C\u6B32\u3057\u3044</h3><p class="cs-note">\u4ECA\u65E5\u307E\u3060\u3082\u3089\u3048\u308B\u3082\u306E</p>${btns(list)}`, (ov, close) => on(ov, close, {
        cm: () => {
          const g = core2.member.earn("cm");
          core2.ui.toast(g ? `\u30B3\u30A4\u30F3 +${g}(CM\u306F\u30A2\u30D7\u30EA\u306B\u3057\u305F\u3068\u304D\u306B\u672C\u7269\u3092\u5165\u308C\u307E\u3059)` : "\u4ECA\u65E5\u306F\u3082\u3046\u898B\u3089\u308C\u307E\u305B\u3093");
          setTimeout(coinWays, 600);
        },
        game: () => time((t) => result("game", t, 0)),
        task: () => open({}),
        omi: () => to3DAt((t) => {
          t.goToApp("omikuji");
          core2.ui.toast("\u304A\u3055\u3044\u305B\u3093\u7BB1\u306E\u524D\u3067\u3059\u3002\u300C\u304A\u307E\u3044\u308A\u3059\u308B\u300D\u3067\u304A\u307F\u304F\u3058\u304C\u5F15\u3051\u307E\u3059");
        })
      }));
    }
    async function to3DAt(fn) {
      try {
        core2.host.close();
      } catch (e) {
      }
      try {
        await core2.to3D();
      } catch (e) {
      }
      let n = 0;
      const tick = () => {
        const t = window.town3d;
        if (t && t.quickStart) {
          try {
            t.quickStart();
            fn && fn(t);
          } catch (e) {
            console.error(e);
          }
        } else if (n++ < 40) setTimeout(tick, 250);
      };
      setTimeout(tick, 300);
    }
    const toHome3D = () => to3DAt((t) => t.openApp("home"));
    function records() {
      const json3 = (v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v);
        } catch (e) {
          return null;
        }
      };
      const sv = json3(createStore("stream").get("chunkstream.v1")) || {}, cs = json3(createStore("chunkchunk").get("ccs3-settings")) || {}, vs = createStore("cards").get("vs") || {};
      const runs = Object.entries(sv.best || {}).filter(([, b]) => b && b.run).map(([id, b]) => `<li><span>\u30B9\u30C8\u30EA\u30FC\u30E0 ${esc8(id)} \u901A\u3057</span><b>${b.run.time}\u79D2 ${b.run.rank}</b></li>`);
      const chal = Object.entries(cs.bestTimed || {}).flatMap(([band, o]) => Object.entries(o || {}).map(([sec, v]) => `<li><span>\u30C1\u30E3\u30EC\u30F3\u30B8 ${sec}\u79D2(${esc8(band)})</span><b>${v}\u70B9</b></li>`));
      const cards = Object.entries(vs).map(([id, r]) => `<li><span>\u30AB\u30FC\u30C9 ${esc8(OPPN[id] || id)}</span><b>${r.w}\u52DD ${r.l}\u6557</b></li>`);
      const sc = core2.level ? core2.level.score() : null;
      sheet(`<h3>\u81EA\u5206\u306E\u8A18\u9332</h3>${sc ? `<ul class="cs-stat"><li><span>\u7DCF\u5408</span><b>${sc.total}\u70B9 \u30FB ${sc.rank}</b></li><li><span>\u30AF\u30EA\u30A2\u3057\u305F\u30DF\u30C3\u30B7\u30E7\u30F3</span><b>${H.cleared || 0}\u500B</b></li></ul>` : ""}
      <ul class="cs-stat">${[...runs, ...chal, ...cards].join("") || "<li><span>\u307E\u3060\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093</span></li>"}</ul><p class="cs-note">\u307F\u3093\u306A\u3068\u306E\u30E9\u30F3\u30AD\u30F3\u30B0\u306F\u3001\u30A2\u30AB\u30A6\u30F3\u30C8\u3068\u3064\u306A\u3044\u3060\u3042\u3068\u306B\u51FA\u307E\u3059\u3002</p>`);
    }
    return { open, after, current: () => M, cleared: () => H.cleared || 0, clear() {
      M = null;
      save();
    }, onChange(f) {
      subs.add(f);
      return () => subs.delete(f);
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
    core2.wallet = createWallet();
    core2.member = createMember(core2.wallet, { toast: (t) => core2.ui && core2.ui.toast(t) });
    core2.profile = createProfile(core2.events, base, () => core2.daylog);
    core2.cloud = createCloud(core2.member);
    core2.openGame = null;
    core2.notebook = createNotebook();
    importOld(core2.notebook);
    core2.record = createRecord(core2.events, core2.notebook);
    core2.daylog = createDayLog(core2);
    core2.learn = createLearn(core2.events);
    core2.ui = createUI(core2);
    core2.study = createStudy(core2);
    core2.econ = ECON;
    core2.ai = createAI();
    core2.level = createLevel(core2);
    core2.useit = createUseit(core2);
    core2.mission = createMission(core2);
    core2.review = createReview(core2);
    core2.today = createToday(core2);
    core2.admin = createAdmin(core2);
    core2.to3D = null;
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
  var link = (href, key2) => new Promise((res) => {
    if (document.querySelector(`link[data-ct="${key2}"]`)) return res();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.ct = key2;
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
  core.openGame = (g, o) => {
    if (GAMES[g]) core.host.open(GAMES[g], o || {});
  };
  core.host.open(GAMES[app.games[0]], app.opts || {});
})();
