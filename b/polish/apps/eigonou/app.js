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
    let voice = null, jaVoice = null;
    const pick = () => {
      try {
        const vs = speechSynthesis.getVoices() || [], en = vs.filter((x) => /^en[-_]?/i.test(x.lang || ""));
        voice = en.find((x) => /US/i.test(x.lang)) || en[0] || null;
        jaVoice = vs.find((x) => /^ja[-_]?/i.test(x.lang || "")) || null;
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
        if (opt.lang === "ja" && !jaVoice) {
          opt.onend && setTimeout(opt.onend, 0);
          return;
        }
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          if (opt.lang === "ja") {
            u.lang = "ja-JP";
            u.voice = jaVoice;
          } else {
            u.lang = "en-US";
            if (voice) u.voice = voice;
          }
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
  function scrollHint(el) {
    if (!el || !el.parentElement) return;
    const p = el.parentElement;
    if (getComputedStyle(p).position === "static") p.style.position = "relative";
    const mk = (c, t) => {
      const d = document.createElement("div");
      d.className = "cs-sh " + c;
      d.textContent = t;
      p.appendChild(d);
      return d;
    };
    const up = mk("up", "\u25B2"), dn = mk("dn", "\u25BC");
    const upd = () => {
      if (!el.isConnected) {
        window.removeEventListener("resize", upd);
        return;
      }
      const t = el.scrollTop, rest = el.scrollHeight - el.clientHeight - t, x = el.offsetLeft, w = el.offsetWidth;
      up.style.cssText = `left:${x}px;width:${w}px;top:${el.offsetTop}px`;
      dn.style.cssText = `left:${x}px;width:${w}px;top:${el.offsetTop + el.offsetHeight - 34}px`;
      up.classList.toggle("on", t > 8);
      dn.classList.toggle("on", rest > 8);
    };
    el.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    try {
      new ResizeObserver(upd).observe(el);
      new MutationObserver(upd).observe(el, { childList: true, subtree: true });
    } catch (e) {
    }
    setTimeout(upd, 0);
    setTimeout(upd, 350);
  }
  function createUI(core2) {
    const root = document.createElement("div");
    root.className = "cs-ui";
    document.body.appendChild(root);
    const esc12 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const sheet = (html, bind) => {
      const ov = document.createElement("div");
      ov.className = "cs-ov";
      ov.innerHTML = '<div class="cs-sheet" role="dialog">' + html + '<button class="cs-btn cs-close">\u3068\u3058\u308B</button></div>';
      const fx = document.createElement("button");
      fx.className = "cs-fx";
      fx.setAttribute("aria-label", "\u3068\u3058\u308B");
      fx.textContent = "\u2715";
      ov.appendChild(fx);
      root.appendChild(ov);
      const close = () => ov.remove();
      fx.onclick = close;
      scrollHint(ov.querySelector(".cs-sheet"));
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
      ${row("rate", "\u8AAD\u307F\u4E0A\u3052\u306E\u901F\u3055", 0.7, 1.3, 0.05)}<button class="cs-btn" id="cs-try">\u8AAD\u307F\u4E0A\u3052\u3092\u8A66\u3059</button><button class="cs-btn" id="cs-aloud">\u{1F4D6} \u5358\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052(\u306A\u306B\u3092\u8AAD\u3080\u304B\u30FB\u5411\u304D\u30FB\u56DE\u6570)</button>
      ${core2.ai ? `<label class="cs-row"><span>AI(\u81EA\u5206\u306E\u30AD\u30FC)</span><select id="cs-aip">${Object.entries({ gemini: "Gemini", openai: "ChatGPT", claude: "Claude" }).map(([k, n]) => `<option value="${k}" ${core2.ai.state.provider === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="cs-row cs-col"><span>AI\u306E\u30AD\u30FC${core2.ai.ready ? "(\u5165\u3063\u3066\u3044\u307E\u3059)" : ""}</span><input id="cs-aik" type="password" autocomplete="off" placeholder="${core2.ai.ready ? "\u5909\u3048\u308B\u3068\u304D\u3060\u3051\u5165\u308C\u308B" : "\u30AD\u30FC\u3092\u8CBC\u308B(3D\u306E\u753A\u3068\u540C\u3058\u30AD\u30FC)"}"></label>
      <p class="cs-note">\u30AD\u30FC\u306F\u3053\u306E\u7AEF\u672B\u306B\u3060\u3051\u4FDD\u5B58\u3057\u307E\u3059\u3002\u4F4F\u4EBA\u3068\u306E\u4F1A\u8A71\u30FB\u300C\u81EA\u7136\u306A\u6587\u304B\u300D\u306E\u5224\u5B9A\u30FB\u4F8B\u6587\u3065\u304F\u308A\u306B\u4F7F\u3044\u307E\u3059\u3002</p>` : ""}
      ${core2.admin && core2.admin.on() ? '<button class="cs-btn" id="cs-admin">\u904B\u55B6</button>' : ""}
      <p class="cs-note" style="text-align:center;opacity:.6">\u7248 ${(() => {
        const b = window.__APP__ && window.__APP__.build, t = b ? parseInt(b, 36) : NaN;
        if (!isFinite(t)) return "-";
        const d = new Date(t + 9 * 36e5).toISOString();
        return d.slice(5, 10) + " " + d.slice(11, 16);
      })()}</p>`, (ov, close) => {
        ["bgm", "sfx", "rate"].forEach((k) => ov.querySelector("#cs-" + k).oninput = (e) => s.set(k, +e.target.value));
        ov.querySelector("#cs-theme").onchange = (e) => s.set("theme", e.target.value);
        ov.querySelector("#cs-voice").onchange = (e) => s.set("voice", e.target.checked);
        ov.querySelector("#cs-try").onclick = () => core2.speech.speak("Hello! Let\u2019s read English in chunks.");
        ov.querySelector("#cs-aloud").onclick = () => {
          close();
          core2.aloud && core2.aloud.open();
        };
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
      <label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input id="cs-name" maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc12(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D\uFF08\u3044\u307E\u306F\u4EEE\u306E\u7D75\uFF09\u3002\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u9805\u76EE\u3082\u3053\u308C\u304B\u3089\u6C7A\u3081\u307E\u3059\u3002</p>
      <ul class="cs-stat">${p.status().map((x) => `<li><span>${esc12(x.label)}</span><b>${esc12(x.value)}</b></li>`).join("")}</ul>`, (ov) => {
        ov.querySelector("#cs-name").onchange = (e) => p.setName(e.target.value);
      });
    };
    return { root, sheet, scrollHint, toast, settings, profile };
  }

  // core/host.js
  var loaded = {};
  function versioned(src) {
    try {
      const A = window.__APP__ || {};
      if (!/\?/.test(src)) {
        const k = Object.keys(A.hashes || {}).find((k2) => src.endsWith(k2));
        const v = k ? A.hashes[k] : A.build;
        if (v) src += "?v=" + v;
      }
    } catch (e) {
    }
    return src;
  }
  function loadScript(src) {
    src = versioned(src);
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
    const closeListeners = /* @__PURE__ */ new Set();
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
      closeListeners.forEach((f) => {
        try {
          f(c.game.id);
        } catch (e) {
          console.error(e);
        }
      });
    };
    backBtn.addEventListener("click", close);
    return {
      get current() {
        return cur && cur.game.id;
      },
      onClose(f) {
        closeListeners.add(f);
        return () => closeListeners.delete(f);
      },
      async open(game, opts = {}) {
        if (cur) close();
        if (game.right && !core2.rights.has(game.right)) {
          core2.ui.toast("\u3053\u306E\u30B2\u30FC\u30E0\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
          return false;
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
          if (cur && cur.el === el) {
            cur.inst = inst || {};
            return true;
          } else inst && inst.unmount && inst.unmount();
        } catch (e) {
          console.error(e);
          el.innerHTML = '<p class="cs-err">\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F<br><small>' + String(e && e.message || e).slice(0, 160).replace(/[<>&]/g, "") + "</small></p>";
          backBtn.hidden = false;
          return false;
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
    try {
      window.addEventListener("storage", (e) => {
        if (e.key !== "cs:core:coins") return;
        const v = JSON.parse(e.newValue);
        if (Number.isFinite(v) && v !== coins) {
          const d = v - coins;
          coins = v;
          fire(d, "sync");
        }
      });
    } catch (e) {
    }
    let boost = () => 1;
    return {
      setBoost(f) {
        boost = f;
      },
      get: () => coins,
      // 増減。増やす量に上限はない。持っている分より減らすことはできない(0で止まる)。
      // ※会員の倍率が掛かるので、増えた量は give() の戻り値(または前後の差)で知ること
      add(n, reason = "") {
        n = Math.round(n);
        if (!Number.isFinite(n) || n === 0) return coins;
        if (n > 0 && !/^(admin|test|month|refund)/.test(reason)) n = Math.round(n * boost());
        n = Math.max(-coins, n);
        coins += n;
        st.set("coins", coins);
        fire(n, reason);
        return coins;
      },
      give(n, reason = "") {
        const b = coins;
        this.add(n, reason);
        return coins - b;
      },
      // 増えた量(倍率のあと)を返す
      spend(n, reason = "") {
        n = Math.round(n);
        if (!Number.isFinite(n) || n < 0 || coins < n) return false;
        if (n > 0) {
          coins -= n;
          st.set("coins", coins);
          fire(-n, reason);
        }
        return true;
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
    const PART = new Set("up out off in on over down away back through along around into with for about after ahead apart across by to from at of aside forward together".split(" ")), VERB = new Set("be get take make put go come give keep let look run turn set bring call carry cut fall hold pull pick break hang hit play pass see tell say think find feel leave lose pay show stand stay work try use want need ask help start stop end move open close change check cover draw drive drop fill follow grow lay lie live mean meet miss pick point push reach read ride ring rule save send settle sit speak spend split step stick strike sweep throw touch walk wash watch wear win".split(" "));
    const phrases = () => {
      const o = [];
      PH.forEach((a) => a.forEach(([ws, m]) => {
        const en = ws.join(" ");
        if (ws.length >= 2 && ws.length <= 4 && /^[a-z' -]+$/i.test(en) && m.length <= 18 && (PART.has(ws[ws.length - 1]) || VERB.has(ws[0]) && ws.length >= 3 || VERB.has(ws[0]) && PART.has(ws[1]))) o.push({ en, ja: m.replace(/[;,]/g, "\u3001") });
      }));
      return o;
    };
    return { ready, phrases, lookup, lookupAll, phraseAt, POSN, get loaded() {
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
  var LEADW = /* @__PURE__ */ new Set(["that", "which", "who", "including"]);
  var nw = (w) => String(w || "").toLowerCase().replace(/[^a-z']/g, "");
  function trimEdge(sen, r) {
    let { a, b } = r;
    for (; ; ) {
      const w = nw(sen.words[a]), w2 = nw(sen.words[a + 1]);
      if (a + 2 <= b && w === "such" && w2 === "as") a += 2;
      else if (a + 1 <= b && LEADW.has(w)) a += 1;
      else break;
    }
    return { a, b };
  }
  function gradeRange(sen, q0, ans0) {
    const si = q0.si, eq = (x, y) => x && y && x.si === y.si && x.a === y.a && x.b === y.b, W = (a, b) => sen.words.slice(a, b + 1).join(" ");
    if (!ans0) return { mark: "x", why: "\u672A\u56DE\u7B54" };
    if (eq(ans0, q0) || (q0.alts || []).some((x) => x.a >= 0 && eq(ans0, x))) return { mark: "o", why: "" };
    if ((q0.partials || []).some((x) => eq(ans0, x))) return { mark: "t", why: "\u90E8\u5206\u70B9" };
    if (ans0.si !== si) return { mark: "x", why: "\u5225\u306E\u6587\u3092\u9078\u3093\u3067\u3044\u308B" };
    const q = { ...q0, ...trimEdge(sen, q0) }, ans = { si, ...trimEdge(sen, ans0) };
    if (eq(ans, q) || (q0.alts || []).some((x) => x.a >= 0 && eq(ans, { si, ...trimEdge(sen, x) }))) return { mark: "o", why: "" };
    if (ans.b < q.a || ans.a > q.b) return { mark: "x", why: "\u7B54\u3048\u3068\u91CD\u306A\u3063\u3066\u3044\u306A\u3044" };
    const unitRole = (i) => sen.units[sen.unitOf[i]].role;
    if (ans.a >= q.a && ans.b <= q.b) {
      const u = sen.units[sen.unitOf[q.a]], part = u.subs ? u.subs.find((p) => q.a >= p.s && q.a <= p.e) : u;
      const head = { a: Math.max(q.a, part.s), b: Math.min(q.b, part.e) };
      const miss = [];
      for (let i = q.a; i <= q.b; i++) if (i < ans.a || i > ans.b) miss.push(i);
      if (ans.a <= head.a && ans.b >= head.b) return { mark: "t", why: `\u77ED\u3044\uFF08\u8DB3\u308A\u306A\u3044\uFF1A${miss.map((i) => sen.words[i]).join(" ")}\uFF09` };
      const brk = (i) => /[,;.]$/.test(sen.words[i]);
      if ((ans.a === q.a || brk(ans.a - 1)) && (ans.b === q.b || brk(ans.b)) && /,/.test(W(q.a, q.b).replace(/,$/, ""))) return { mark: "t", why: `\u4F8B\u306E\u4E00\u90E8\uFF08\u307B\u304B\u306E\u4F8B\uFF1A${miss.map((i) => sen.words[i]).join(" ")}\uFF09` };
      return { mark: "x", why: "\u7B54\u3048\u306E\u4E2D\u5FC3\u304C\u5165\u3063\u3066\u3044\u306A\u3044" };
    }
    if (ans.a <= q.a && ans.b >= q.b) {
      const roles = /* @__PURE__ */ new Set();
      for (let i = q.a; i <= q.b; i++) roles.add(unitRole(i));
      const extra = [];
      for (let i = ans.a; i <= ans.b; i++) if (i < q.a || i > q.b) extra.push(i);
      const xr = extra.map(unitRole), cutL = ans.a < q.a && ans.a !== sen.units[sen.unitOf[ans.a]].s, cutR = ans.b > q.b && ans.b !== sen.units[sen.unitOf[ans.b]].e, tolerant = !cutL && !cutR && q.a - ans.a <= 2 && !xr.some((r) => (r === "S" || r === "V") && !roles.has(r)) && (extra.length <= 2 || xr.every((r) => "IMPOC".includes(r)) && extra.length <= 6), old = extra.filter((i) => !roles.has(unitRole(i))), bad = tolerant || !old.length ? [] : old;
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
        const P2 = dict.POSN, base = e.w.toLowerCase() !== clean.toLowerCase() ? `<small class="riBase">\uFF08\u5143\u306E\u5F62 ${esc(e.w)}${e.neg ? "\uFF0Bnot" : ""}\uFF09</small>` : "";
        return `<div><span class="posTag">${P2[main[0]] || main[0]}</span> <b>${esc(clean)}</b>${base}${ja ? ` \uFF1D ${esc(main[1])}` : ""}` + (rest.length ? `<div class="riNote">\u307B\u304B\u306B\uFF1A${rest.map(([t, m]) => (P2[t] || t) + (ja ? `\uFF08${esc(m)}\uFF09` : "")).join("\u3001")}</div>` : "") + phH + "</div>";
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
        const help = RD.sel ? "\u3053\u306E\u7BC4\u56F2\u3067\u3044\u3044\uFF1F" : startOn ? "\u7B54\u3048\u306E\u7D42\u308F\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\u3053\u3053\u307E\u3067 \uFF3D\u300D" : "\u7B54\u3048\u306E\u59CB\u307E\u308A\u3092\u7DDA\u306B\u5408\u308F\u305B\u3066\u300C\uFF3B \u3053\u3053\u304B\u3089\u300D\uFF08\u30EC\u30FC\u30F3\u3092\u5DE6\u53F3\u306B\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u52D5\u304B\u3059\uFF09\u3002\u5358\u8A9E\u3092\u9577\u62BC\u3057\u3057\u3066\u306A\u305E\u3063\u3066\u3001\u56F2\u3093\u3067\u3082OK";
        $("help").textContent = (RD.hintQ.has(RD.qi) && q.si != null ? `\u{1F4A1} \u7B54\u3048\u306F ${q.si + 1} \u6587\u76EE\u306B\u3042\u308B\u3088\u3002 ` : "") + help;
        $("btns").innerHTML = RD.sel ? '<button data-a="redo">\u9078\u3073\u306A\u304A\u3057</button><button data-a="ok" class="ok">\u6C7A\u5B9A</button>' : `${startOn ? '<button data-a="redo">\u3084\u3081\u308B</button>' : ""}<button data-a="cut" class="cutMain">${startOn ? "\u3053\u3053\u307E\u3067 \uFF3D" : "\uFF3B \u3053\u3053\u304B\u3089"}</button>`;
        const B = (a) => $("btns").querySelector(`[data-a=${a}]`);
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
        const q0 = qs[RD.qi];
        if (!onBar && d.wi >= 0 && q0 && q0.type !== "choice" && view() !== "read" && !RD.sel) {
          const me = d;
          d.hold = setTimeout(() => {
            if (d !== me || me.moved || me.axis) return;
            me.hold = null;
            me.sel = { a: me.wi, b: me.wi };
            me.moved = true;
            dragSel(me);
            try {
              navigator.vibrate && navigator.vibrate(15);
            } catch (_) {
            }
          }, 260);
        }
      });
      const wordIdx = (x, y) => {
        const w = document.elementsFromPoint(x, y).find((t) => t.classList && t.classList.contains("w") && root.contains(t));
        return w ? [...$("strip").querySelectorAll(".w")].indexOf(w) : -1;
      };
      const dragSel = (o) => {
        RD.sel = { si: RD.si, a: Math.min(o.sel.a, o.sel.b), b: Math.max(o.sel.a, o.sel.b) };
        RD.start = null;
        if (o.sel.a === o.sel.b) beep("mini");
        render(true);
      };
      gest.addEventListener("pointermove", (e) => {
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (d.hold && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          clearTimeout(d.hold);
          d.hold = null;
        }
        if (d.sel) {
          const i = wordIdx(e.clientX, e.clientY);
          if (i >= 0 && i !== d.sel.b) {
            d.sel.b = i;
            dragSel(d);
          }
          return;
        }
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
        if (d.hold) clearTimeout(d.hold);
        if (!d.moved && e.type === "pointerup" && d.onLane) {
          if (view() === "read") infoTap(d.wi);
          else cut2();
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
          cur = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, en, pos: it.pos || "", ja: String(it.ja || "").trim(), src: it.src || "", note: it.note || "", marks: (it.marks || []).slice(), n: 1, at: Date.now() };
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
      // ドリルの記録(復習の状態)。sr = {s:'unk'わからない|'cant'わかるけど使えない|'off'外す, box, due, n, w, ok, last}
      sr(id, patch) {
        const x = list.find((y) => y.id === id);
        if (!x) return;
        x.sr = Object.assign({}, x.sr || {}, patch);
        save();
        return x.sr;
      },
      srSet(id, v) {
        const x = list.find((y) => y.id === id);
        if (!x) return;
        if (v) x.sr = v;
        else delete x.sr;
        save();
      },
      // 戻るとき、記録をそっくり元にもどす
      srClear(id) {
        const x = list.find((y) => y.id === id);
        if (!x) return;
        delete x.sr;
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

  // core/eigo.js
  function createEigoInbox() {
    const st = createStore("core"), K = "eigoInbox";
    const list = () => st.get(K) || [];
    return {
      send(items) {
        const L = list(), have = new Set(L.map((x) => x.en.toLowerCase()));
        let n = 0;
        (items || []).forEach((it) => {
          const en = String(it && it.en || "").trim().replace(/\s+/g, " ");
          if (!en || !/[a-zA-Z]/.test(en)) return;
          const old = L.find((x) => x.en.toLowerCase() === en.toLowerCase());
          if (old) {
            if (it.play) old.play = true;
            if (!old.ex && it.ex) {
              old.ex = it.ex;
              old.exja = it.exja || "";
            }
            if (!old.ai && it.ai) old.ai = it.ai;
            return;
          }
          L.push({ en, ja: String(it.ja || "").trim(), kind: it.kind || "", ex: it.ex || "", exja: it.exja || "", ai: it.ai || void 0, play: !!it.play, at: Date.now() });
          have.add(en.toLowerCase());
          n++;
        });
        st.set(K, L.slice(-200));
        return n;
      },
      take() {
        const L = list();
        st.set(K, []);
        return L;
      },
      // 箱をからにして、中身を返す(英ラボが開いたとき)
      count: () => list().length
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
    { id: "stream.word", n: "\u5358\u8A9E\u7DF4\u7FD2(\u30B9\u30C8\u30DF\u30F3)", want: "word", mood: "both", time: [5, 15], place: "school", go: { game: "stream" } },
    { id: "note.practice", n: "\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u306E\u3084\u308A\u76F4\u3057", want: "word", mood: "study", time: [5, 15, 30], place: "home", go: { to: "note" } },
    { id: "test", n: "\u5358\u8A9E\u529B\u30C6\u30B9\u30C8", want: "word", mood: "study", time: [5, 15], place: "school", go: { to: "test" } },
    { id: "role.test", n: "\u5F79\u5272\u3055\u304C\u3057(\u4E3B\u5F79\u30FB\u3069\u3046\u3057\u3066\u308B\uFF1F\u3092\u3048\u3089\u3076)", want: "make", mood: "study", time: [5, 15], place: "school", go: { to: "role" } },
    { id: "eigo.prac", n: "\u719F\u8A9E\u30FB\u53E5\u52D5\u8A5E\u306E\u308C\u3093\u3057\u3085\u3046(\u82F1\u30E9\u30DC)", want: "word", mood: "study", time: [15, 30], place: "school", go: { game: "eigonou" } },
    { id: "lib.weekly", n: "\u8AB2\u984C\u56F3\u66F8\u3092\u8AAD\u3080", want: "read", mood: "study", time: [15, 30], place: "library", go: { game: "library", opts: { tab: "weekly" } } },
    { id: "stream.read", n: "\u9577\u6587\u3092\u30B9\u30C8\u30DF\u30F3\u3067\u8AAD\u3080", want: "read", mood: "both", time: [5, 15], place: "library", go: { game: "library", opts: { tab: "level" } } },
    { id: "cc.read", n: "\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0(\u8AAD\u3080\u30FB\u89E3\u304F)", want: "read", mood: "study", time: [15, 30], place: "library", go: { game: "library", opts: { tab: "featured" } } },
    { id: "cc.game", n: "\u4ECA\u30B9\u30E9\u306E\u30C1\u30E3\u30EC\u30F3\u30B8", want: "read", mood: "study", time: [5], place: "school", go: { game: "chunkchunk", opts: { face: "arcade" } } },
    { id: "cc.lesson", n: "\u30C1\u30E3\u30F3\u30AF\u30EC\u30C3\u30B9\u30F3", want: "make", mood: "study", time: [15, 30], place: "school", go: { game: "chunkchunk", opts: { face: "lesson" } } },
    { id: "eigo", n: "\u82F1\u30E9\u30DC\u3067\u6587\u3092\u4F5C\u308B", want: "make", mood: "study", time: [15, 30], place: "library", go: { game: "eigonou" } },
    { id: "cards", n: "\u30C1\u30E3\u30F3\u30AF\u30FB\u30AB\u30FC\u30C9", want: "make", mood: "game", time: [5, 15], place: "game", go: { game: "cards" } },
    { id: "listen", n: "\u30E9\u30F3\u30C0\u30E0\u30C1\u30E3\u30F3\u30AF(\u805E\u304D\u53D6\u308A)", want: "talk", mood: "game", time: [5, 15], place: "game", go: { game: "listen" } },
    { id: "note.mimic", n: "\u805E\u3044\u3066\u307E\u306D\u308B(\u52C9\u5F37\u30CE\u30FC\u30C8)", want: "talk", mood: "study", time: [5, 15], place: "home", go: { to: "note", kind: "short" } },
    { id: "town.chat", n: "\u4F4F\u4EBA\u3068\u82F1\u8A9E\u3067\u304A\u3057\u3083\u3079\u308A", want: "talk", mood: "both", time: [5, 15, 30], place: "town", go: { to: "3d" } },
    { id: "town.ogiri", n: "\u82F1\u8A9E\u3067\u5927\u559C\u5229", want: "chill", mood: "any", time: [15], place: "town", go: { to: "3d" } },
    { id: "town.walk", n: "\u753A\u3092\u6563\u6B69(\u683C\u8A00\u30FB\u30AA\u30AB\u30EA\u30CA\u30FB\u304A\u307F\u304F\u3058)", want: "chill", mood: "any", time: [5, 15, 30], place: "town", go: { to: "3d" } },
    { id: "eigo.dict", n: "\u82F1\u30E9\u30DC\u3067\u6C17\u306B\u306A\u308B\u8A00\u8449\u3092\u8ABF\u3079\u308B", want: "chill", mood: "study", time: [5, 15], place: "library", go: { game: "eigonou" } }
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
  var isChunk = (w) => !!w && (w.kind === "chunk" || w.kind === "word" && /\s/.test(String(w.en).trim()) && /chunk|チャンク/i.test(String(w.src || "")));
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
      // 直近(n日ぶん)で、まちがえた・なやんだ・まだ覚えていない言葉(立ち上げのLoading中のおさらい用)。文は入れない
      missed(n = 14) {
        const out = /* @__PURE__ */ new Map(), ok = (w) => w && w.en && w.ja && w.kind !== "sentence";
        Object.keys(S.days).sort().slice(-n).forEach((k) => Object.values(S.days[k].words || {}).forEach((w) => {
          if (ok(w) && (w.miss || w.slow)) out.set(w.en.toLowerCase(), { ...w, day: k });
        }));
        S.queue.forEach((w) => {
          if (!ok(w)) return;
          const key2 = w.en.toLowerCase(), o = out.get(key2);
          out.set(key2, { ...o || w, day: o && o.day || w.added || "", unk: w.unk || 0 });
        });
        return [...out.values()];
      },
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
        return [...out.values()].filter((w) => w.kind !== "sentence" && !isChunk(w));
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
      // 読み上げ・フラッシュカードの結果だけをしまう(日のふりかえり扱いにしない)
      applyKnown(results, k = dayKey()) {
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
        save();
      },
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
          if (w.ja && w.kind !== "sentence" && !isChunk(w)) m.set(w.en.toLowerCase(), w);
        }));
        S.queue.forEach((w) => {
          if (w.ja && w.kind !== "sentence" && !isChunk(w)) m.set(w.en.toLowerCase(), w);
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
      else if (name === "word" && d.en) api.addWord({ en: d.en, ja: d.ja || "", src: d.src || game, kind: d.kind === "quote" || d.kind === "sentence" || d.kind === "short" ? "sentence" : d.kind === "expr" ? "expr" : "word" });
    });
    return api;
  }

  // core/study.js
  var esc2 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function createStudy(core2) {
    let ov = null, tab = "today", opt = {};
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
      if (o.tab === "note" && o.sec !== "secret" && core2.drill) return core2.drill.open(o);
      opt = o;
      if (ov) close();
      if (o.tab) tab = o.tab === "note" ? "log" : o.tab;
      ov = document.createElement("div");
      ov.className = "cs-ov cs-study-ov";
      ov.innerHTML = `<div class="cs-study" role="dialog" aria-label="\u52C9\u5F37\u90E8\u5C4B"><header><b>\u52C9\u5F37\u90E8\u5C4B</b><button class="cs-x" aria-label="\u3068\u3058\u308B">\u2715</button></header>
      <nav class="cs-tabs">${[["today", "\u4ECA\u65E5"], ["log", "\u8A18\u9332"], ["me", "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB"]].map(([k, n]) => `<button data-t="${k}">${n}</button>`).join("")}</nav><main></main></div>`;
      core2.ui.root.appendChild(ov);
      core2.ui.scrollHint && core2.ui.scrollHint(ov.querySelector("main"));
      ov.querySelector(".cs-x").onclick = close;
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close();
      });
      ov.querySelectorAll(".cs-tabs button").forEach((b) => b.onclick = () => {
        tab = b.dataset.t;
        draw();
      });
      offs.push(rec.onChange(() => draw()), core2.member.onChange(() => draw()), core2.level.onChange(() => tab === "today" && draw()));
      draw();
    }
    const go = (g, o) => {
      close();
      opt.play(g, o);
    };
    function draw(keep) {
      if (!ov) return;
      ov.querySelectorAll(".cs-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
      const m = ov.querySelector("main"), top = keep ? m.scrollTop : 0;
      m.innerHTML = tab === "today" ? today() : tab === "log" ? log() : me();
      bind(m);
      m.scrollTop = top;
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
      <button class="cs-btn cs-big" data-drill>\u{1F4D2} \u52C9\u5F37\u30CE\u30FC\u30C8(\u30C9\u30EA\u30EB)</button>
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
      <div class="cs-adm-row">${!L.lv ? '<button class="cs-btn cs-go" data-place>\u30EC\u30D9\u30EB\u8A3A\u65AD(\u7D0420\u554F)</button>' : L.testLeft() > 0 ? `<span class="cs-sub">\u5358\u8A9E\u529B\u30C6\u30B9\u30C8\u307E\u3067 \u30DF\u30C3\u30B7\u30E7\u30F3\u3042\u3068${L.testLeft()}\u500B</span>` : '<button class="cs-btn cs-go" data-test>\u5358\u8A9E\u529B\u30C6\u30B9\u30C8\u3092\u53D7\u3051\u308B</button>'}</div></section>`;
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
    function me() {
      const p = core2.profile;
      return `<section class="cs-panel"><div class="cs-prof"><img src="${p.avatarURL()}" alt="\u30A2\u30D0\u30BF\u30FC"><div><label class="cs-row cs-col"><span>\u306A\u307E\u3048</span><input data-name maxlength="12" placeholder="\u306A\u307E\u3048\u3092\u5165\u308C\u3066\u306D" value="${esc2(p.name)}"></label></div></div>
      <p class="cs-note">\u30A2\u30D0\u30BF\u30FC\u306F\u4F5C\u308A\u76F4\u3057\u4E2D(\u3044\u307E\u306F\u4EEE\u306E\u7D75)\u3002</p></section>
      <section class="cs-panel"><ul class="cs-stat"><li><span>\u4F1A\u54E1</span><b>${core2.member.isPaid() ? "\u6709\u6599\u4F1A\u54E1" : "\u7121\u6599\u4F1A\u54E1"}</b></li><li><span>\u30B3\u30A4\u30F3</span><b>${core2.wallet.get()}(\u6708\u66FF\u308F\u308A\u306B\u6B8B\u305B\u308B\u4E0A\u9650 ${core2.member.coinCapText()})</b></li><li><span>\u30C0\u30A4\u30E4</span><b>${core2.member.gems()}</b></li><li><span>\u5171\u6709\u306E\u6559\u6750\u306E\u67A0</span><b>${core2.member.slots().length} / ${core2.member.slotMax()}</b></li>${core2.member.isPaid() ? `<li><span>\u4ECA\u6708\u306EAI\u306E\u56DE\u6570</span><b>\u3042\u3068${core2.member.aiLeft()}\u56DE</b></li>` : ""}</ul>
      ${core2.member.today().cmLeft > 0 ? `<button class="cs-btn" data-cm>CM\u3092\u898B\u3066\u30B3\u30A4\u30F3 +${core2.member.coinPreview(core2.econ.daily.cm.each)}(\u4ECA\u65E5\u3042\u3068${core2.member.today().cmLeft}\u56DE)</button>` : ""}</section>
      <button class="cs-btn" data-settings>\u8A2D\u5B9A</button>`;
    }
    function bind(m) {
      const q = (s) => m.querySelector(s);
      if (q("[data-goal]")) q("[data-goal]").onchange = (e) => rec.setGoal(e.target.value);
      if (q("[data-today]")) q("[data-today]").onclick = () => {
        close();
        core2.today.open({ has: opt.has });
      };
      if (q("[data-drill]")) q("[data-drill]").onclick = () => {
        close();
        core2.drill.open({});
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
    }
    return { open, close, get isOpen() {
      return !!ov;
    } };
  }

  // core/drill.js
  var esc3 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var DAY = 864e5;
  var IV = { unk: [1, 2, 4, 7, 14, 30, 60], cant: [2, 4, 8, 16, 30, 60] };
  var SN = { unk: "\u308F\u304B\u3089\u306A\u3044", cant: "\u4F7F\u3048\u306A\u3044", off: "\u5916\u3057\u305F" };
  var SRC = { stream: "\u30B9\u30C8\u30DF\u30F3", chunkchunk: "\u4ECA\u30B9\u30E9\uFF01", eigonou: "\u82F1\u30E9\u30DC", cards: "\u30AB\u30FC\u30C9", town3d: "3D\u306E\u753A", note: "\u624B\u6253\u3061" };
  var dayNo = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / DAY);
  var shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);
  var drillable = (x) => x.ja && (x.kind === "word" || x.kind === "phrase");
  function advance(sr, ok, now = Date.now()) {
    const s = Object.assign({ box: 0, n: 0, w: 0, ok: 0, last: 0 }, sr), same = s.last && dayNo(s.last) === dayNo(now);
    s.n++;
    s.last = now;
    if (ok) {
      s.ok++;
      if (!same) s.box++;
    } else {
      s.w++;
      s.ok = 0;
      s.box = Math.max(0, s.box - 2);
    }
    if (s.s === "unk" && ok && s.box >= 3) {
      s.s = "cant";
      s.box = 1;
    }
    if (!ok) {
      s.due = now + 10 * 6e4;
      return s;
    }
    const tb = IV[s.s] || IV.unk, d = tb[Math.min(tb.length - 1, Math.max(0, s.box - 1))], rate = s.n >= 4 ? s.w / s.n : 0;
    s.due = now + Math.max(0.5, d * (1 - Math.min(0.5, rate))) * DAY;
    return s;
  }
  var CSS = `.dr-card{text-align:center;padding:18px 10px}.dr-card small{color:#789}.dr-card h2{font-size:30px;margin:8px 0}.dr-card p{margin:4px 0 12px;color:#456;font-size:16px}
.dr-ch{display:grid;gap:8px;margin:12px 0}.dr-ch button{padding:13px 10px;font-size:16px;border-radius:12px;border:1px solid #bcd;background:#fff;color:#123;text-align:left}
.dr-ch button.ok{background:#d8f5de;border-color:#4a4}.dr-ch button.ng{background:#fde0e0;border-color:#c55}
.dr-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:8px 0}.dr-row .cs-btn{flex:1 1 auto}
.dr-st{display:inline-block;font-size:11px;padding:1px 6px;border-radius:8px;background:#e8eef5;color:#456;margin-left:6px}.dr-st.unk{background:#fde7d6}.dr-st.cant{background:#fff3c4}.dr-st.off{background:#e5e5e5}
.dr-n{display:flex;gap:6px;justify-content:center;margin:6px 0}.dr-n b{font-size:20px}`;
  function createDrill(core2) {
    const nb = core2.notebook;
    let hist = [], curIt = null, curMut = false, t0 = Date.now(), ov = null, view = "home", offs = [], Q = [], stat = { ok: 0, ng: 0 }, opt = {}, lkind = "word";
    const find = (id) => nb.list().find((x) => x.id === id);
    const pool = () => nb.list().filter(drillable);
    const counts = () => {
      const L = pool(), on = L.filter((x) => !(x.sr && x.sr.s === "off")), now = Date.now();
      return { fresh: on.filter((x) => !x.sr), due: on.filter((x) => x.sr && x.sr.due <= now), unk: on.filter((x) => x.sr && x.sr.s === "unk").length, cant: on.filter((x) => x.sr && x.sr.s === "cant").length, off: L.filter((x) => x.sr && x.sr.s === "off").length, noJa: nb.list().filter((x) => (x.kind === "word" || x.kind === "phrase") && !x.ja).length };
    };
    function close() {
      if (!ov) return;
      ov.remove();
      ov = null;
      offs.forEach((f) => f());
      offs = [];
    }
    function open(o = {}) {
      opt = o;
      if (ov) close();
      if (!document.getElementById("dr-css")) {
        const s = document.createElement("style");
        s.id = "dr-css";
        s.textContent = CSS;
        document.head.appendChild(s);
      }
      ov = document.createElement("div");
      ov.className = "cs-ov cs-study-ov";
      ov.innerHTML = `<div class="cs-study" role="dialog" aria-label="\u52C9\u5F37\u30CE\u30FC\u30C8"><header><button class="cs-x dr-back" aria-label="\u3082\u3069\u308B" hidden>\u2190</button><b>\u52C9\u5F37\u30CE\u30FC\u30C8</b><button class="cs-x" aria-label="\u3068\u3058\u308B">\u2715</button></header><main></main></div>`;
      core2.ui.root.appendChild(ov);
      core2.ui.scrollHint && core2.ui.scrollHint(ov.querySelector("main"));
      ov.querySelectorAll(".cs-x")[1].onclick = close;
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close();
      });
      ov.querySelector(".dr-back").onclick = () => {
        view = "home";
        draw();
      };
      offs.push(nb.onChange(() => {
        if (view === "list") draw(true);
      }));
      view = o.kind || o.list ? "list" : "home";
      if (o.kind) lkind = o.kind;
      draw();
    }
    function draw(keep) {
      if (!ov) return;
      const m = ov.querySelector("main"), top = keep ? m.scrollTop : 0;
      ov.querySelector(".dr-back").hidden = view === "home";
      if (view === "quiz") {
        m.scrollTop = 0;
        return;
      }
      m.innerHTML = view === "home" ? home() : view === "more" ? more() : list();
      bind(m);
      m.scrollTop = top;
    }
    function home() {
      const c = counts(), n = c.fresh.length + c.due.length;
      return `<section class="cs-panel"><div class="dr-n"><span>\u5FA9\u7FD2 <b>${c.due.length}</b></span><span>\u65B0\u3057\u304F\u5206\u3051\u308B <b>${c.fresh.length}</b></span></div>
      ${n ? `<button class="cs-btn cs-go cs-big" data-start>\u306F\u3058\u3081\u308B(${Math.min(12, c.due.length) + Math.min(5, c.fresh.length)}\u500B)</button>` : '<p class="cs-sub" style="text-align:center">\u3044\u307E\u3084\u308B\u5206\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6642\u9593\u304C\u305F\u3064\u3068\u3001\u307E\u305F\u51FA\u3066\u304D\u307E\u3059\u3002</p>'}
      <p class="cs-sub" style="text-align:center">\u308F\u304B\u3089\u306A\u3044 ${c.unk} \u30FB \u308F\u304B\u308B\u3051\u3069\u4F7F\u3048\u306A\u3044 ${c.cant} \u30FB \u5916\u3057\u305F ${c.off}</p>
      ${c.noJa ? `<p class="cs-note">\u65E5\u672C\u8A9E\u304C\u306A\u3044\u8A00\u8449\u304C ${c.noJa}\u500B\u3042\u308A\u307E\u3059(\u30C9\u30EA\u30EB\u306B\u306F\u51FA\u307E\u305B\u3093)\u3002\u4E00\u89A7\u304B\u3089\u65E5\u672C\u8A9E\u3092\u5165\u308C\u3066\u306D\u3002</p>` : ""}</section>
      <div class="cs-io"><button class="cs-btn" data-list>\u8A00\u8449\u306E\u4E00\u89A7\u30FB\u767B\u9332(${nb.count()})</button></div>
      <div class="cs-io"><button class="cs-btn" data-free>\u2728 \u4F7F\u3063\u3066\u307F\u308B(\u82F1\u8A9E\u3092\u6253\u3061\u8FBC\u3080)</button></div>
      <div class="cs-io"><button class="cs-btn" data-more>\u3082\u3063\u3068\u3084\u308B(\u7A2E\u985E\u3068\u30EC\u30D9\u30EB\u3092\u3048\u3089\u3076)</button></div>`;
    }
    let mk = "word", mlv = "1";
    function more() {
      const b = (on, a, t) => `<button class="cs-btn${on ? " cs-go" : ""}" ${a}>${t}</button>`;
      return `<section class="cs-panel"><p class="cs-sub">\u3069\u308C\u3092\u3084\u308B\uFF1F</p>
      <div class="cs-io">${b(mk === "word", 'data-mk="word"', "\u5358\u8A9E")}${b(mk === "phrase", 'data-mk="phrase"', "\u719F\u8A9E\u30FB\u8868\u73FE")}</div>
      <div class="cs-io">${["1", "2", "3"].map((l) => b(mlv === l, 'data-ml="' + l + '"', ["", "\u521D\u7D1A", "\u4E2D\u7D1A", "\u4E0A\u7D1A"][+l])).join("")}</div>
      <button class="cs-btn cs-go cs-big" data-morego>5\u500B\u3075\u3084\u3057\u3066\u3001\u306F\u3058\u3081\u308B</button></section>`;
    }
    async function moreGo(btn) {
      btn.disabled = true;
      btn.textContent = "\u96C6\u3081\u3066\u3044\u307E\u3059\u2026";
      try {
        await loadScript(core2.base + "g/stream/words.js");
      } catch (e) {
      }
      const src = mk === "word" ? typeof WORDS !== "undefined" ? WORDS : null : typeof IDIOMS !== "undefined" ? IDIOMS : null, arr = src && src[mlv] || [];
      const have = new Set(nb.list().map((x) => x.en.toLowerCase())), pool2 = arr.filter((r) => r[0] && r[2] && !have.has(String(r[0]).toLowerCase()));
      if (!pool2.length) {
        btn.disabled = false;
        btn.textContent = "5\u500B\u3075\u3084\u3057\u3066\u3001\u306F\u3058\u3081\u308B";
        return core2.ui.toast(arr.length ? "\u3053\u306E\u7D44\u306F\u305C\u3093\u3076\u5165\u3063\u3066\u3044\u307E\u3059" : "\u4E00\u89A7\u3092\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F");
      }
      const pick = pool2.sort(() => Math.random() - 0.5).slice(0, 5);
      nb.addMany(pick.map((r) => ({ en: r[0], ja: r[2], kind: mk, src: "list" })));
      view = "home";
      start();
    }
    function start() {
      const c = counts();
      Q = [...c.due.sort((a, b) => a.sr.due - b.sr.due).slice(0, 12).map((x) => ({ id: x.id, t: "q" })), ...c.fresh.slice(0, 5).map((x) => ({ id: x.id, t: "c" }))];
      stat = { ok: 0, ng: 0 };
      hist = [];
      t0 = Date.now();
      view = "quiz";
      draw();
      step();
    }
    const sub = (h) => {
      const mm2 = ov.querySelector("main");
      mm2.innerHTML = h;
      const bk2 = mm2.querySelector("[data-back]");
      if (bk2) bk2.onclick = back;
      return mm2;
    };
    const bk = () => hist.length ? '<button class="cs-btn" data-back>\u2190 \u3072\u3068\u3064\u3082\u3069\u308B</button>' : "";
    const mut = (x, it) => {
      hist.push({ id: x.id, it, sr: x.sr ? JSON.parse(JSON.stringify(x.sr)) : null, ok: stat.ok, ng: stat.ng });
      curMut = true;
    };
    function back() {
      const h = hist.pop();
      if (!h) return;
      nb.srSet(h.id, h.sr);
      stat.ok = h.ok;
      stat.ng = h.ng;
      if (!h.it.rq) Q = Q.filter((q) => !(q.id === h.id && q.rq));
      if (!curMut && curIt) Q.unshift(curIt);
      Q.unshift(h.it);
      step();
    }
    async function fillPos(x, host) {
      const el = host.querySelector("[data-pos]");
      if (!el) return;
      if (/\s/.test(x.en)) {
        el.textContent = x.kind === "phrase" ? "(\u719F\u8A9E\u30FB\u8868\u73FE)" : "";
        return;
      }
      let t = x.pos || "";
      if (!t) {
        try {
          await core2.dict.ready();
          const e = core2.dict.lookup(x.en);
          if (e) {
            const P2 = core2.dict.POSN || {}, js = String(x.ja).split(/[、,，]/)[0], hp = e.pos.find((p) => p[1] && (p[1].includes(js) || String(x.ja).includes(p[1].split("\u3001")[0]))), pick = hp ? [hp] : e.pos;
            t = [...new Set(pick.map((p) => P2[p[0]] || p[0]))].join("\u30FB");
          }
        } catch (e2) {
        }
      }
      if (el.isConnected) el.textContent = t ? `(${t})` : "";
    }
    function step() {
      if (!ov) return;
      if (!Q.length) return done();
      const it = Q.shift(), x = find(it.id);
      if (!x || x.sr && x.sr.s === "off") return step();
      curIt = it;
      curMut = false;
      if (it.t === "c") return classify(x);
      quiz(x, it);
    }
    async function eg(x, host) {
      host.innerHTML = '<p class="cs-sub">\u4F8B\u6587\u3092\u3055\u304C\u3057\u3066\u3044\u307E\u3059\u2026</p>';
      let L = [];
      try {
        L = await core2.useit.find(x.en);
      } catch (e) {
      }
      if (!host.isConnected) return;
      const list2 = (L2) => {
        host.innerHTML = `<ul class="cs-nb" style="text-align:left">${L2.slice(0, 4).map((e2, i) => `<li><b>${esc3(e2.en)}</b><span>${esc3(e2.ja)}</span><small>${esc3(e2.from)}</small><div class="cs-nb-a"><button data-s="${i}">\u{1F50A}</button><button data-m="${i}">\u805E\u3044\u3066\u307E\u306D\u308B</button></div></li>`).join("")}</ul>`;
        host.querySelectorAll("[data-s]").forEach((b2) => b2.onclick = () => core2.speech.speak(L2[+b2.dataset.s].en));
        host.querySelectorAll("[data-m]").forEach((b2) => b2.onclick = () => core2.useit.mimic(L2[+b2.dataset.m].en, b2));
      };
      if (L.length) return list2(L);
      const ai = core2.ai;
      host.innerHTML = `<p class="cs-sub">\u5185\u8535\u306E\u6587\u306B\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002</p>${ai && ai.ready ? '<button class="cs-btn cs-go" data-ai>\u2728 AI\u3067\u4F8B\u6587\u3092\u4F5C\u308B</button>' : '<p class="cs-note">\u8A2D\u5B9A\u3067AI\u306E\u30AD\u30FC\u3092\u5165\u308C\u308B\u3068\u3001AI\u3067\u4F8B\u6587\u3092\u4F5C\u308C\u307E\u3059\u3002</p>'}`;
      const b = host.querySelector("[data-ai]");
      if (!b) return;
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = "\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026";
        try {
          const r = await ai.examples(x.en, core2.level ? core2.level.name() : ""), ex = (r.examples || []).filter((t) => t && t.en).map((t) => ({ en: t.en, ja: t.ja || "", from: "AI" }));
          if (!ex.length) throw new Error("\u4F8B\u6587\u304C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
          nb.addMany(ex.map((t) => ({ en: t.en, ja: t.ja, kind: "short", src: "ai" })));
          if (host.isConnected) list2(ex);
        } catch (e) {
          if (host.isConnected) {
            b.disabled = false;
            b.textContent = "\u2728 AI\u3067\u4F8B\u6587\u3092\u4F5C\u308B";
          }
          core2.ui.toast(String(e && e.message || e).slice(0, 60));
        }
      };
    }
    function classify(x) {
      const m = sub(`<section class="cs-panel dr-card"><small>\u3053\u306E\u8A00\u8449\u306F\u3001\u3069\u3046\uFF1F</small><h2>${esc3(x.en)}</h2><div class="dr-row"><button class="cs-btn" data-say>\u{1F50A} \u304D\u304F</button></div>
      <div class="dr-ch"><button data-c="unk">\u308F\u304B\u3089\u306A\u3044</button><button data-c="cant">\u610F\u5473\u306F\u308F\u304B\u308B\u3051\u3069\u3001\u81EA\u5206\u3067\u306F\u4F7F\u3048\u306A\u3044</button><button data-c="off">\u3082\u3046\u77E5\u3063\u3066\u3044\u308B\u30FB\u62BC\u3057\u307E\u3061\u304C\u3044(\u51FA\u3055\u306A\u3044)</button></div>${bk()}</section>`);
      m.querySelector("[data-say]").onclick = () => core2.speech.speak(x.en);
      m.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
        const c = b.dataset.c;
        mut(x, curIt);
        if (c === "off") {
          nb.sr(x.id, { s: "off", at: Date.now() });
          core2.ui.toast("\u5916\u3057\u307E\u3057\u305F(\u4E00\u89A7\u304B\u3089\u623B\u305B\u307E\u3059)");
          return step();
        }
        nb.sr(x.id, { s: c, box: 0, n: 0, w: 0, ok: 0, last: 0, due: Date.now() + 0.7 * DAY });
        const mm2 = sub(`<section class="cs-panel dr-card"><small>${c === "unk" ? "\u3053\u306E\u610F\u5473\u3067\u3059" : "\u8A00\u3048\u308B\u3088\u3046\u306B\u3001\u58F0\u306B\u51FA\u3057\u3066\u307F\u3088\u3046"}</small><h2>${esc3(x.en)}</h2><p style="font-size:20px">${esc3(x.ja)} <small data-pos style="color:#789"></small></p>
        <div class="dr-row"><button class="cs-btn" data-say>\u{1F50A} \u304D\u304F</button><button class="cs-btn" data-eg>\u4F8B\u6587\u3092\u898B\u308B</button></div><div data-egl></div><div class="dr-row"><button class="cs-btn" data-back>\u2190 \u3082\u3069\u308B</button><button class="cs-btn cs-go cs-big" data-next>\u3064\u304E\u3078</button></div></section>`);
        fillPos(x, mm2);
        core2.speech.speak(x.en);
        mm2.querySelector("[data-say]").onclick = () => core2.speech.speak(x.en);
        mm2.querySelector("[data-eg]").onclick = () => eg(x, mm2.querySelector("[data-egl]"));
        mm2.querySelector("[data-next]").onclick = step;
      });
    }
    function quiz(x, it) {
      const s = x.sr && x.sr.s || "unk", toEn = s === "cant", L = pool().filter((y) => y.id !== x.id);
      const key2 = (y) => toEn ? y.en : y.ja, ans = key2(x);
      const bad = shuffle([...new Set(L.filter((y) => y.kind === x.kind).map(key2).concat(L.map(key2)))].filter((v) => v && v !== ans && v.toLowerCase() !== ans.toLowerCase())).slice(0, 3);
      const self = bad.length < 3, opts = self ? [] : shuffle([ans, ...bad]);
      const m = sub(`<section class="cs-panel dr-card"><small>${toEn ? "\u82F1\u8A9E\u3067\u8A00\u3046\u3068\uFF1F" : "\u3053\u306E\u610F\u5473\u306F\uFF1F"}${it.rq ? "(\u3082\u3046\u4E00\u5EA6)" : ""}</small><h2>${esc3(toEn ? x.ja : x.en)}</h2>
      ${toEn ? "" : '<div class="dr-row"><button class="cs-btn" data-say>\u{1F50A} \u304D\u304F</button></div>'}
      ${self ? `<div class="dr-ch"><button data-show>\u7B54\u3048\u3092\u898B\u308B</button></div>` : `<div class="dr-ch">${opts.map((o, i) => `<button data-o="${i}">${esc3(o)}</button>`).join("")}</div>`}
      <div data-fb></div>${bk()}</section>`);
      if (m.querySelector("[data-say]")) m.querySelector("[data-say]").onclick = () => core2.speech.speak(x.en);
      const finish = (ok) => {
        mut(x, it);
        nb.sr(x.id, advance(x.sr, ok));
        stat[ok ? "ok" : "ng"]++;
        if (!ok && !it.rq) Q.push({ id: x.id, t: "q", rq: 1 });
        if (ok || toEn) try {
          core2.speech.speak(x.en);
        } catch (e) {
        }
        const fb = m.querySelector("[data-fb]");
        fb.innerHTML = `<p style="font-size:17px"><b>${ok ? "\u2B55 \u305B\u3044\u304B\u3044" : "\u2716 \u3056\u3093\u306D\u3093"}</b><br>${esc3(x.en)} <small data-pos style="color:#789"></small> = ${esc3(x.ja)}</p>
        <div class="dr-row"><button class="cs-btn" data-say2>\u{1F50A}</button><button class="cs-btn" data-eg>\u4F8B\u6587\u3092\u898B\u308B</button><button class="cs-btn" data-off>\u5916\u3059</button></div><div data-egl></div>
        <div class="dr-row"><button class="cs-btn" data-back>\u2190 \u3082\u3069\u308B</button><button class="cs-btn cs-go cs-big" data-next>\u3064\u304E\u3078</button></div>`;
        fillPos(x, fb);
        fb.querySelector("[data-back]").onclick = back;
        m.querySelectorAll(".dr-card > [data-back]").forEach((z) => z.remove());
        fb.querySelector("[data-say2]").onclick = () => core2.speech.speak(x.en);
        fb.querySelector("[data-eg]").onclick = () => eg(x, fb.querySelector("[data-egl]"));
        fb.querySelector("[data-off]").onclick = () => {
          nb.sr(x.id, { s: "off", at: Date.now() });
          core2.ui.toast("\u5916\u3057\u307E\u3057\u305F(\u4E00\u89A7\u304B\u3089\u623B\u305B\u307E\u3059)");
          step();
        };
        fb.querySelector("[data-next]").onclick = step;
        fb.querySelector("[data-next]").focus && fb.querySelector("[data-next]").focus();
      };
      if (self) {
        m.querySelector("[data-show]").onclick = () => {
          m.querySelector(".dr-ch").innerHTML = `<p style="font-size:18px">${esc3(ans)}</p><button data-y>${toEn ? "\u8A00\u3048\u305F" : "\u308F\u304B\u3063\u305F"}</button><button data-n>${toEn ? "\u8A00\u3048\u306A\u3044" : "\u308F\u304B\u3089\u306A\u3044"}</button>`;
          m.querySelector("[data-y]").onclick = () => {
            m.querySelector(".dr-ch").remove();
            finish(true);
          };
          m.querySelector("[data-n]").onclick = () => {
            m.querySelector(".dr-ch").remove();
            finish(false);
          };
        };
        return;
      }
      m.querySelectorAll("[data-o]").forEach((b) => b.onclick = () => {
        const ok = opts[+b.dataset.o] === ans;
        m.querySelectorAll("[data-o]").forEach((z) => {
          z.disabled = true;
          if (opts[+z.dataset.o] === ans) z.classList.add("ok");
        });
        if (!ok) b.classList.add("ng");
        finish(ok);
      });
    }
    function done() {
      const c = counts(), more2 = c.due.length + c.fresh.length;
      sub(`<section class="cs-panel dr-card"><h2>\u304A\u3064\u304B\u308C\u3055\u307E</h2><p>\u305B\u3044\u304B\u3044 ${stat.ok} \u30FB \u307E\u3061\u304C\u3044 ${stat.ng}</p><p class="cs-sub">\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u306F\u3001\u77ED\u3044\u9593\u9694\u3067\u307E\u305F\u51FA\u307E\u3059\u3002\u6B63\u89E3\u304C\u7D9A\u304F\u307B\u3069\u3001\u9593\u304C\u3042\u304D\u307E\u3059\u3002</p>
      ${more2 ? '<button class="cs-btn cs-go cs-big" data-again>\u3064\u3065\u3051\u3066\u3084\u308B</button>' : ""}<button class="cs-btn" data-home>\u3082\u3069\u308B</button></section>`);
      const m = ov.querySelector("main");
      if (m.querySelector("[data-again]")) m.querySelector("[data-again]").onclick = start;
      m.querySelector("[data-home]").onclick = () => {
        view = "home";
        draw();
      };
      try {
        if (stat.ok + stat.ng) core2.events.report("note", "done", { play: "note.practice", min: Math.round((Date.now() - t0) / 6e3) / 10, words: stat.ok + stat.ng, finished: true });
      } catch (e) {
      }
    }
    function list() {
      const items = nb.list({ kind: lkind });
      return `<nav class="cs-chips">${KINDS.map((k) => `<button data-kind="${k.k}" class="${k.k === lkind ? "on" : ""}">${k.n} ${nb.count(k.k)}</button>`).join("")}</nav>
      <form class="cs-add" data-add><input name="en" placeholder="\u82F1\u8A9E" autocomplete="off" autocapitalize="off" spellcheck="false" required><input name="ja" placeholder="\u65E5\u672C\u8A9E" autocomplete="off"><button class="cs-btn">\u767B\u9332</button></form>
      <div class="cs-io"><button class="cs-btn" data-exp>\u{1F4E4} \u66F8\u304D\u51FA\u3059</button><button class="cs-btn" data-imp>\u{1F4E5} \u8AAD\u307F\u8FBC\u3080</button><small>\u30CE\u30FC\u30C8\u306F\u3053\u306E\u7AEF\u672B\u306E\u4E2D\u3060\u3051\u306B\u4FDD\u5B58\u3002\u6A5F\u7A2E\u5909\u66F4\u306E\u3068\u304D\u306F\u66F8\u304D\u51FA\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u3092\u65B0\u3057\u3044\u7AEF\u672B\u3067\u8AAD\u307F\u8FBC\u3093\u3067\u306D</small></div>
      ${items.length ? `<ul class="cs-nb">${items.slice(0, 300).map((x) => {
        const s = x.sr && x.sr.s;
        return `<li data-id="${x.id}"><div class="cs-nb-t"><b>${esc3(x.en)}</b><span>${esc3(x.ja)}</span><small>${esc3(SRC[x.src] || x.src)}</small>${s ? `<span class="dr-st ${s}">${SN[s]}</span>` : ""}</div>
          <div class="cs-nb-a"><button data-say aria-label="\u8AAD\u307F\u4E0A\u3052">\u{1F50A}</button><button data-use class="cs-use">\u4F7F\u3063\u3066\u307F\u308B</button>${drillable(x) || (x.kind === "word" || x.kind === "phrase") ? `<button data-s="unk">\u308F\u304B\u3089\u306A\u3044</button><button data-s="cant">\u4F7F\u3048\u306A\u3044</button><button data-s="${s === "off" ? "back" : "off"}">${s === "off" ? "\u3082\u3069\u3059" : "\u5916\u3059"}</button>` : ""}<button data-del class="cs-del" aria-label="\u6D88\u3059">\u{1F5D1}</button></div></li>`;
      }).join("")}</ul>` : '<p class="cs-sub">\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u30B2\u30FC\u30E0\u3067\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u3084\u3001\u5404\u30A2\u30D7\u30EA\u3067\u767B\u9332\u3057\u305F\u8A00\u8449\u304C\u3053\u3053\u306B\u96C6\u307E\u308A\u307E\u3059\u3002\u4E0A\u306E\u6B04\u304B\u3089\u624B\u6253\u3061\u3067\u3082\u767B\u9332\u3067\u304D\u307E\u3059\u3002</p>'}`;
    }
    function bind(m) {
      const q = (s) => m.querySelector(s);
      if (q("[data-start]")) q("[data-start]").onclick = start;
      if (q("[data-list]")) q("[data-list]").onclick = () => {
        view = "list";
        draw();
      };
      if (q("[data-free]")) q("[data-free]").onclick = () => core2.useit.open({});
      if (q("[data-more]")) q("[data-more]").onclick = () => {
        view = "more";
        draw();
      };
      m.querySelectorAll("[data-mk]").forEach((b) => b.onclick = () => {
        mk = b.dataset.mk;
        draw();
      });
      m.querySelectorAll("[data-ml]").forEach((b) => b.onclick = () => {
        mlv = b.dataset.ml;
        draw();
      });
      if (q("[data-morego]")) q("[data-morego]").onclick = (e) => moreGo(e.currentTarget);
      m.querySelectorAll("[data-kind]").forEach((b) => b.onclick = () => {
        lkind = b.dataset.kind;
        draw();
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
        const it = nb.add({ en, ja, kind: lkind === "quote" ? "quote" : void 0, src: "note" });
        if (it && it.kind !== lkind) {
          lkind = it.kind;
          draw();
        }
        core2.ui.toast("\u767B\u9332\u3057\u307E\u3057\u305F");
      };
      m.querySelectorAll(".cs-nb li").forEach((li) => {
        const id = li.dataset.id, x = find(id);
        li.querySelector("[data-say]").onclick = () => core2.speech.speak(x.en);
        li.querySelector("[data-use]").onclick = () => core2.useit.open(x);
        li.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
          const v = b.dataset.s;
          if (v === "back") nb.srClear(id);
          else if (v === "off") nb.sr(id, { s: "off", at: Date.now() });
          else nb.sr(id, { s: v, box: 0, n: 0, w: 0, ok: 0, last: 0, due: Date.now() });
        });
        li.querySelector("[data-del]").onclick = () => nb.remove(id);
      });
    }
    return { open, close, provider: null, get isOpen() {
      return !!ov;
    } };
  }

  // core/roletest.js
  var esc4 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var GROUPS = [
    { g: "S", easy: "\u4E3B\u5F79", gram: "\u4E3B\u8A9E", ini: "\u4E3B", roles: "S" },
    { g: "V", easy: "\u3069\u3046\u3057\u3066\u308B\uFF1F", gram: "\u52D5\u8A5E", ini: "\u52D5", roles: "V" },
    { g: "O", easy: "\u304A\u76F8\u624B", gram: "\u76EE\u7684\u8A9E", ini: "\u76EE", roles: "OI" },
    { g: "C", easy: "\u3069\u3046\u3060\uFF1F", gram: "\u88DC\u8A9E", ini: "\u88DC", roles: "C" },
    { g: "A", easy: "\u98FE\u308A", gram: "\u4FEE\u98FE\u8A9E", ini: "\u98FE", roles: "PTMRFX" }
  ];
  var gOf = (r) => (GROUPS.find((x) => x.roles.includes(r)) || {}).g;
  function parseSentence2(s) {
    return String(s || "").replace(/^@\w /, "").split(" | ").map((u) => {
      const m = u.match(/^([A-Z]):(.*)$/);
      if (!m) return null;
      return { r: m[1], en: m[2].replace(/=.*$/, "").replace(/#.*$/, "").replace(/\s*\/\s*/g, " ").trim() };
    }).filter((x) => x && x.en);
  }
  function createRoleTest(core2) {
    const st = createStore("core");
    let ov = null, disp = st.get("roleDisp") || "easy", stat = { ok: 0, ng: 0 }, q = null, t0 = 0, pool = null;
    const label = (g, big) => {
      const x = GROUPS.find((y) => y.g === g);
      return big === "easy" ? x.easy : x.gram;
    };
    const both = (g) => {
      const x = GROUPS.find((y) => y.g === g);
      return disp === "easy" ? `<b>${esc4(x.easy)}</b><small>${esc4(x.gram)}</small>` : `<b>${esc4(x.gram)}</b><small>${esc4(x.easy)}</small>`;
    };
    async function load() {
      if (pool) return pool;
      const B = core2.books;
      if (!B) return pool = [];
      try {
        await B.load();
        const lv = core2.level && core2.level.lv || 1;
        if (B.need) await B.need(1).catch(() => {
        });
      } catch (e) {
      }
      const out = [];
      for (const b of B.all()) {
        if (b.lv !== 1) continue;
        let s = null;
        try {
          s = b.story();
        } catch (e) {
        }
        (s && s.list || []).forEach((x) => {
          const ch = parseSentence2(x[0]);
          if (ch.length >= 3 && ch.length <= 6 && ch.every((c) => c.en.split(/\s+/).length <= 7)) out.push({ ch, ja: x[1] || "", from: b.title });
        });
      }
      return pool = out;
    }
    function close() {
      if (ov) {
        ov.remove();
        ov = null;
      }
    }
    async function open() {
      if (ov) close();
      ov = document.createElement("div");
      ov.className = "cs-ov cs-study-ov";
      ov.innerHTML = `<div class="cs-study" role="dialog" aria-label="\u5F79\u5272\u3055\u304C\u3057"><header><b>\u5F79\u5272\u3055\u304C\u3057</b><button class="cs-x" data-sw style="font-size:12px;width:auto;padding:0 8px">\u540D\u524D\u3092\u5207\u308A\u66FF\u3048</button><button class="cs-x" data-x aria-label="\u3068\u3058\u308B">\u2715</button></header><main><p class="cs-sub" style="text-align:center">\u6587\u3092\u96C6\u3081\u3066\u3044\u307E\u3059\u2026</p></main></div>`;
      core2.ui.root.appendChild(ov);
      ov.querySelector("[data-x]").onclick = () => {
        finish();
        close();
      };
      ov.addEventListener("click", (e) => {
        if (e.target === ov) {
          finish();
          close();
        }
      });
      ov.querySelector("[data-sw]").onclick = () => {
        disp = disp === "easy" ? "gram" : "easy";
        st.set("roleDisp", disp);
        if (q) show();
      };
      stat = { ok: 0, ng: 0 };
      t0 = Date.now();
      const P2 = await load();
      if (!ov) return;
      if (!P2.length) {
        ov.querySelector("main").innerHTML = '<p class="cs-sub" style="text-align:center">\u4F7F\u3048\u308B\u6587\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u901A\u4FE1\u3092\u78BA\u304B\u3081\u3066\u3001\u3082\u3046\u4E00\u5EA6\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002</p>';
        return;
      }
      next();
    }
    function finish() {
      try {
        if (stat.ok + stat.ng) core2.events.report("role", "done", { play: "role.test", min: Math.round((Date.now() - t0) / 6e3) / 10, words: 0, finished: true });
      } catch (e) {
      }
      stat = { ok: 0, ng: 0 };
    }
    function next() {
      for (let k = 0; k < 40; k++) {
        const s = pool[Math.floor(Math.random() * pool.length)], gs = [...new Set(s.ch.map((c) => gOf(c.r)).filter(Boolean))].filter((g2) => s.ch.filter((c) => gOf(c.r) === g2).length <= 3);
        if (!gs.length) continue;
        const g = gs[Math.floor(Math.random() * gs.length)];
        q = { s, g, sel: /* @__PURE__ */ new Set(), done: false };
        return show();
      }
    }
    function show() {
      const { s, g } = q, ans = s.ch.map((c, i) => gOf(c.r) === g ? i : -1).filter((i) => i >= 0), m = ov.querySelector("main");
      m.innerHTML = `<section class="cs-panel" style="text-align:center"><p class="cs-sub">\u3053\u306E\u6587\u3067\u3001\u3053\u308C\u306B\u3042\u305F\u308B\u8A9E\u3092 ${ans.length > 1 ? "\u305C\u3093\u3076 " : ""}\u30BF\u30C3\u30D7</p>
      <div class="rl-q" style="margin:8px 0;line-height:1.25">${both(g).replace("<b>", '<b style="font-size:26px">').replace("<small>", '<br><small style="font-size:12px;color:#789">')}</div>
      <div class="rl-ch" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:14px 0">${s.ch.map((c, i) => `<button data-i="${i}" style="padding:11px 12px;font-size:18px;border-radius:12px;border:2px solid #bcd;background:#fff;color:#123">${esc4(c.en)}</button>`).join("")}</div>
      <div data-fb></div><button class="cs-btn cs-go cs-big" data-ok>\u3053\u305F\u3048\u3042\u308F\u305B</button></section>
      <p class="cs-sub" data-stat style="text-align:center">\u305B\u3044\u304B\u3044 ${stat.ok} \u30FB \u307E\u3061\u304C\u3044 ${stat.ng}</p>`;
      const paint = () => m.querySelectorAll("[data-i]").forEach((b) => {
        const on = q.sel.has(+b.dataset.i);
        b.style.borderColor = on ? "#2d6be0" : "#bcd";
        b.style.background = on ? "#e3edff" : "#fff";
      });
      m.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
        if (q.done) return;
        const i = +b.dataset.i;
        if (q.sel.has(i)) q.sel.delete(i);
        else q.sel.add(i);
        paint();
      });
      m.querySelector("[data-ok]").onclick = () => {
        if (q.done) return next();
        if (!q.sel.size) return core2.ui.toast("\u3048\u3089\u3093\u3067\u306D");
        q.done = true;
        const ok = ans.length === q.sel.size && ans.every((i) => q.sel.has(i));
        stat[ok ? "ok" : "ng"]++;
        m.querySelectorAll("[data-i]").forEach((b) => {
          const i = +b.dataset.i, isA = ans.includes(i), on = q.sel.has(i);
          b.style.borderColor = isA ? "#4a4" : on ? "#c55" : "#bcd";
          b.style.background = isA ? "#d8f5de" : on ? "#fde0e0" : "#fff";
        });
        m.querySelector("[data-fb]").innerHTML = `<p style="font-size:17px"><b>${ok ? "\u2B55 \u305B\u3044\u304B\u3044" : "\u2716 \u3056\u3093\u306D\u3093"}</b></p><p class="cs-sub">${esc4(s.ch.map((c) => c.en).join(" "))}<br>${esc4(s.ja)}</p>
        <p class="cs-sub">${s.ch.map((c) => {
          const x = GROUPS.find((y) => y.g === gOf(c.r));
          return x ? `${esc4(c.en)}\uFF1D${esc4(label(x.g, disp))}` : "";
        }).filter(Boolean).join(" \u30FB ")}</p>`;
        m.querySelector("[data-ok]").textContent = "\u3064\u304E\u3078";
        m.querySelector("[data-stat]").textContent = `\u305B\u3044\u304B\u3044 ${stat.ok} \u30FB \u307E\u3061\u304C\u3044 ${stat.ng}`;
      };
    }
    return { open, close, parseSentence: parseSentence2 };
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
    try {
      window.addEventListener("storage", (e) => {
        if (e.key !== "cs:core:member" || !e.newValue) return;
        try {
          Object.assign(M, JSON.parse(e.newValue));
          subs.forEach((f) => {
            try {
              f();
            } catch (x) {
            }
          });
        } catch (x) {
        }
      });
    } catch (e) {
    }
    tick();
    wallet.setBoost && wallet.setBoost(() => isPaid() ? ECON.paidCoinMult : 1);
    const api = {
      get plan() {
        return M.plan;
      },
      isPaid,
      coinPreview: (n) => Math.round(n * (isPaid() ? ECON.paidCoinMult : 1)),
      // 「コイン +N」と予告するときは、これを通した数(会員の倍率のあと)を出す
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
        } else if (kind === "once") g = Math.max(0, Math.floor(+n || 0));
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
            if (!wallet.spend(price.coins, "buy:swap")) return { ok: false, why: "coins" };
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
  var DAY2 = 864e5;
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
      const now = Date.now(), due = D.items.filter((x) => x.state === "new" && now - x.at > CLOUD_RULES.VOTE_DAYS * DAY2);
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
          const rated = x.good + x.bad, low = rated >= CLOUD_RULES.RATE_MIN && x.good / rated < 0.5, idle = now - Math.max(x.lastUse, x.decided || x.at) > CLOUD_RULES.IDLE_DAYS * DAY2;
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
  var esc5 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function createToday(core2) {
    const st = createStore("core");
    const pref = () => Object.assign({ want: "read", time: 15, mood: "any" }, st.get("todayPref") || {});
    let hasGame = () => true;
    const usable = (p) => p.go.to === "3d" ? !!core2.to3D : p.go.to === "note" ? !!core2.study : p.go.to === "test" ? !!core2.level && hasGame("stream") : p.go.to === "role" ? !!core2.roletest && !!core2.books : !!core2.openGame && hasGame(p.go.game);
    function go(p) {
      if (!p) return;
      if (p.go.to === "3d") core2.to3D();
      else if (p.go.to === "test") core2.level.test();
      else if (p.go.to === "role") core2.roletest.open();
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
      const P2 = pref(), last = core2.record.last(), wk = core2.books ? core2.books.weekly() : [], taskDone = core2.member.today().task;
      const sel = (k, list, cur) => `<nav class="cs-chips" data-k="${k}">${list.map((x) => `<button data-v="${x.k}" class="${String(x.k) === String(cur) ? "on" : ""}">${x.n}</button>`).join("")}</nav>`;
      const rec = pick(P2), main = rec[0], more = rec.slice(1, 3);
      core2.ui.sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3>
      ${last && core2.openGame && hasGame(last.game) ? `<button class="cs-btn cs-resume" data-resume>\u3064\u3065\u304D\u304B\u3089:${esc5(last.label || (playOf(last.play) || {}).n || "")}</button>` : ""}
      ${wk.length ? `<button class="cs-btn ${taskDone ? "" : "cs-go"}" data-task>\u4ECA\u65E5\u306E\u8AB2\u984C:\u8AB2\u984C\u56F3\u66F8\u30921\u518A${taskDone ? "(\u4ECA\u65E5\u306F\u30AF\u30EA\u30A2\u6E08\u307F)" : `(\u30B3\u30A4\u30F3 +${core2.member.coinPreview(core2.econ.daily.task)})`}<small>${wk.map((b) => esc5(b.title)).join(" \u30FB ")}</small></button>` : ""}
      <p class="cs-note">\u3057\u305F\u3044\u3053\u3068</p>${sel("want", WANTS, P2.want)}
      <p class="cs-note">\u6642\u9593\u3068\u6C17\u5206</p>${sel("time", TIMES, P2.time)}${sel("mood", MOODS, P2.mood)}
      ${main ? `<button class="cs-btn cs-go cs-big" data-p="${main.id}">${esc5(main.n)}<small>\u304A\u3059\u3059\u3081</small></button>` : '<p class="cs-note">\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u306E\u904A\u3073\u306F\u3001\u3053\u306E\u30A2\u30D7\u30EA\u306B\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>'}
      ${more.map((p) => `<button class="cs-btn" data-p="${p.id}">${esc5(p.n)}</button>`).join("")}`, (ov, close) => {
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
  var esc6 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var plainEn = (s) => String(s || "").replace(/^@\w /, "").split(" | ").map((u) => u.replace(/^[A-Z]:/, "").replace(/=.*$/, "").replace(/#.*$/, "")).join(" ").replace(/\s+/g, " ").trim();
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function createUseit(core2) {
    let exP = null;
    const exReady = () => exP || (exP = loadScript(core2.base + "core/dict/ex.js").catch(() => {
      exP = null;
    }));
    let sentP = null;
    const sentReady = () => sentP || (sentP = loadScript(core2.base + "core/dict/sent.js").catch(() => {
      sentP = null;
    }));
    async function find(en) {
      const w = String(en).trim().toLowerCase(), esc22 = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ws = w.split(/\s+/), stem = ws[0].replace(/e$/, ""), re = ws.length > 1 ? new RegExp("\\b" + esc22(stem) + "(e|es|ed|d|ing|s)?\\s+" + ws.slice(1).map(esc22).join("\\s+") + "\\b", "i") : new RegExp("\\b" + esc22(w) + "(s|es|ed|d|ing)?\\b", "i");
      const hit = (t) => re.test(t);
      const out = [], first = [], seen = /* @__PURE__ */ new Set(), push = (e, j, from) => {
        const k = e.toLowerCase();
        if (!seen.has(k) && hit(e)) {
          seen.add(k);
          out.push({ en: e, ja: j || "", from });
        }
      };
      try {
        await exReady();
        (window.__csEx || "").split("\n").forEach((l) => {
          const a = l.split("	");
          if (a.length === 4 && a[0].toLowerCase() === w) {
            const k = a[2].toLowerCase();
            if (!seen.has(k)) {
              seen.add(k);
              first.push({ en: a[2], ja: a[3], from: "\u4F8B\u6587\u96C6" });
            }
          }
        });
      } catch (e) {
      }
      if (core2.books) {
        await core2.books.load();
        if (core2.books.need) await Promise.all([1, 2, 3].map((l) => Promise.resolve(core2.books.need(l)).catch(() => {
        })));
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
      try {
        await sentReady();
        (window.__csSent || "").split("\n").forEach((l) => {
          const t = l.indexOf("	");
          if (t > 0) push(l.slice(0, t), l.slice(t + 1), "TOEIC\u4F8B\u6587");
        });
      } catch (e) {
      }
      out.sort((a, b) => Math.abs(a.en.length - 60) - Math.abs(b.en.length - 60));
      return first.concat(out).slice(0, 8);
    }
    const BRK = /^(to|in|on|at|with|for|from|of|about|by|into|over|under|after|before|because|when|while|if|that|which|who|and|but|or|so|than|as|until|since|during|through|around|near)$/i;
    const chunksOf = (en) => {
      const ws = String(en).trim().split(/\s+/).filter(Boolean), out = [];
      let cur = [];
      ws.forEach((w, i) => {
        if (cur.length >= 2 && (BRK.test(w.replace(/[^\w']/g, "")) || /[,;:]$/.test(ws[i - 1]))) {
          out.push(cur);
          cur = [];
        }
        cur.push(w);
      });
      if (cur.length) out.push(cur);
      for (let i = out.length - 1; i > 0; i--) if (out[i].length === 1) {
        out[i - 1].push(...out[i]);
        out.splice(i, 1);
      }
      if (out.length > 1 && out[0].length === 1) {
        out[1].unshift(...out[0]);
        out.shift();
      }
      return out;
    };
    let mimicRun = null;
    async function mimic(en, btn) {
      if (mimicRun && mimicRun.btn === btn) return;
      if (mimicRun) mimicRun.stop();
      const sp = core2.speech, li = btn && btn.closest("li"), b = li && li.querySelector("b"), plain = b && b.textContent;
      const parts = chunksOf(en), run = { btn, dead: false, stop() {
        this.dead = true;
        try {
          sp.stop();
        } catch (e) {
        }
      } };
      mimicRun = run;
      if (btn) {
        btn.classList.add("cs-busy");
        btn.setAttribute("aria-pressed", "true");
      }
      const mark = (k) => {
        if (!b) return;
        b.innerHTML = parts.map((c, j) => j === k ? '<mark class="cs-mimnow">' + esc6(c.join(" ")) + "</mark>" : esc6(c.join(" "))).join(" ");
      };
      try {
        for (let k = 0; k < parts.length && !run.dead && (!b || b.isConnected); k++) {
          const text = parts[k].join(" ");
          mark(k);
          await new Promise((res) => {
            let done = false;
            const fin = () => {
              if (!done) {
                done = true;
                res();
              }
            };
            try {
              sp.speak(text, { rate: 0.85, onend: fin });
            } catch (e) {
              fin();
            }
            setTimeout(fin, 1500 + parts[k].length * 700);
          });
          if (!run.dead) await wait(500 + parts[k].length * 450);
        }
      } finally {
        if (b && plain != null) b.textContent = plain;
        if (btn) {
          btn.classList.remove("cs-busy");
          btn.removeAttribute("aria-pressed");
        }
        if (mimicRun === run) mimicRun = null;
      }
    }
    function open(x0) {
      const x = Object.assign({ en: "", ja: "" }, x0 || {});
      const ai = core2.ai, M = core2.member, aiPrice = M.isPaid() && M.aiLeft() > 0 ? `\u4ECA\u6708\u3042\u3068${M.aiLeft()}\u56DE` : `\u30C0\u30A4\u30E4 ${ECON.ai.gems}`;
      const sent = (s, i) => `<li><b>${esc6(s.en)}</b><span>${esc6(s.ja)}</span><small>${esc6(s.from || "")}</small><div class="cs-nb-a"><button data-say="${i}">\u{1F50A}</button><button data-mim="${i}">\u805E\u3044\u3066\u307E\u306D\u308B</button><button data-add="${i}">\u30CE\u30FC\u30C8\u306B\u5165\u308C\u308B</button></div></li>`;
      let found = [];
      core2.ui.sheet(`<h3>\u2728 \u4F7F\u3063\u3066\u307F\u308B</h3>
      <div class="cs-adm"><input class="cs-ta" data-en placeholder="\u82F1\u8A9E(\u5358\u8A9E\u30FB\u719F\u8A9E\u30FB\u30C1\u30E3\u30F3\u30AF\u30FB\u6587 \u306A\u3093\u3067\u3082)" value="${esc6(x.en)}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;box-sizing:border-box;margin-bottom:6px"><input class="cs-ta" data-ja placeholder="\u65E5\u672C\u8A9E(\u7A7A\u3067\u3082OK)" value="${esc6(x.ja)}" autocomplete="off" style="width:100%;box-sizing:border-box"></div>
      <section class="cs-adm"><h4>1. \u6587\u306E\u4E2D\u3067\u898B\u3066\u307F\u308B</h4><ul class="cs-nb" data-found><li class="cs-note">\u3055\u304C\u3057\u3066\u3044\u307E\u3059\u2026</li></ul></section>
      ${core2.openGame ? '<button class="cs-btn cs-go" data-eigo style="width:100%;margin-top:8px;font-size:16px">\u{1F9E0} \u82F1\u30E9\u30DC\u3067\u6587\u306B\u3057\u3066\u3001\u3059\u3050\u904A\u3076</button><p class="cs-note">AI\u304C\u3075\u3055\u308F\u3057\u3044\u6587\u3092\u4F5C\u3063\u3066\u3001\u82F1\u30E9\u30DC\u306B\u30BB\u30C3\u30C8\u3057\u307E\u3059\u3002\u6C17\u306B\u5165\u3063\u305F\u6587\u306F\u82F1\u30E9\u30DC\u306E\u300C\u{1F4BE} \u8A18\u61B6\u300D\u3067\u6B8B\u305B\u307E\u3059\u3002</p>' : ""}
      <section class="cs-adm"><h4>2. \u81EA\u5206\u3067\u6587\u3092\u4F5C\u308B</h4>
        <textarea class="cs-ta" data-mine rows="2" placeholder="\u300C${esc6(x.en)}\u300D\u3092\u4F7F\u3063\u3066\u82F1\u6587\u3092\u66F8\u3044\u3066\u307F\u3088\u3046" autocapitalize="off" spellcheck="false"></textarea>
        <div class="cs-adm-row">${ai.ready ? '<button class="cs-btn" data-check>\u81EA\u7136\u306A\u6587\u304B\u5224\u5B9A(AI)</button>' : ""}<button class="cs-btn" data-keep>\u30CE\u30FC\u30C8\u306B\u5165\u308C\u308B</button></div>
        ${ai.ready ? "" : '<p class="cs-note">\u8A2D\u5B9A\u3067AI\u306E\u30AD\u30FC\u3092\u5165\u308C\u308B\u3068\u3001\u81EA\u7136\u306A\u6587\u304B\u3092\u5224\u5B9A\u3067\u304D\u307E\u3059(\u7121\u6599)\u3002</p>'}<p class="cs-note" data-judge></p></section>
      <section class="cs-adm"><h4>3. AI\u3067\u4F8B\u6587\u3068\u304A\u8A71\u3092\u4F5C\u308B</h4><p class="cs-note">\u300C${esc6(x.en)}\u300D\u3092\u4F7F\u3063\u305F\u4F8B\u65873\u3064\u3068\u3001\u77ED\u3044\u304A\u8A71\u3092\u4F5C\u308A\u307E\u3059(${aiPrice})\u3002\u3067\u304D\u305F\u6587\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3059\u3002</p>
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
        const doFind = () => {
          find(x.en).then((list) => {
            found = list;
            const ul = q("[data-found]");
            if (!ul) return;
            ul.innerHTML = list.length ? list.map(sent).join("") : `<li class="cs-note">\u5185\u8535\u306E\u6587\u306B\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u30022\u304B3\u3067\u6587\u3092\u4F5C\u3063\u3066\u307F\u3088\u3046\u3002</li>`;
            bindList(ul, list);
          });
        };
        q("[data-en]").oninput = (e) => {
          x.en = e.target.value;
          x.kind = "";
        };
        q("[data-ja]").oninput = (e) => {
          x.ja = e.target.value;
        };
        q("[data-en]").onchange = () => {
          if (x.en.trim()) doFind();
        };
        if (x.en) doFind();
        q("[data-keep]").onclick = () => {
          const en = q("[data-mine]").value.trim();
          if (!/[a-zA-Z]/.test(en)) return core2.ui.toast("\u82F1\u6587\u3092\u66F8\u3044\u3066\u306D");
          core2.notebook.add({ en, ja: "", kind: "short", src: "note" });
          core2.ui.toast("\u30CE\u30FC\u30C8\u306B\u5165\u308C\u307E\u3057\u305F");
        };
        if (q("[data-eigo]")) q("[data-eigo]").onclick = function() {
          const btn = this, say = (t) => {
            btn.textContent = t;
          };
          const en0 = String(x.en || "").trim();
          if (!/[a-zA-Z]/.test(en0)) {
            say("\u82F1\u8A9E\u3092\u5165\u308C\u3066\u306D");
            setTimeout(() => {
              btn.textContent = "\u{1F9E0} \u82F1\u30E9\u30DC\u3067\u6587\u306B\u3057\u3066\u3001\u3059\u3050\u904A\u3076";
            }, 1500);
            return;
          }
          const isSen = x.kind === "short" || x.kind === "quote" || /[.!?]$/.test(en0) || en0.split(/\s+/).length >= 6;
          try {
            if (!core2.notebook.list({}).some((n) => n.en.toLowerCase() === en0.toLowerCase())) core2.notebook.add({ en: en0, ja: x.ja || "", kind: isSen ? "short" : /\s/.test(en0) ? "phrase" : "word", src: "useit" });
          } catch (e) {
            console.error(e);
          }
          say("\u23F3 \u9001\u3063\u3066\u3044\u307E\u3059\u2026");
          try {
            core2.eigo.send([{ en: en0, ja: x.ja || "", kind: isSen ? "sentence" : "", play: true, ex: found[0] && found[0].en, exja: found[0] && found[0].ja }]);
            say("\u2705 \u9001\u308A\u307E\u3057\u305F\u3002\u82F1\u30E9\u30DC\u3092\u958B\u304D\u307E\u3059\u2026");
            if (!core2.openGame) throw new Error("\u3053\u306E\u753B\u9762\u3067\u306F\u82F1\u30E9\u30DC\u3092\u958B\u3051\u307E\u305B\u3093");
            setTimeout(() => {
              try {
                ov.remove();
                core2.study && core2.study.close();
                setTimeout(() => {
                  try {
                    core2.openGame("eigonou");
                  } catch (e) {
                    console.error(e);
                    core2.ui.toast("\u82F1\u30E9\u30DC\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F:" + String(e && e.message || e).slice(0, 80));
                  }
                }, 120);
              } catch (e) {
                console.error(e);
                say("\u274C " + String(e && e.message || e).slice(0, 60));
              }
            }, 350);
          } catch (e) {
            console.error(e);
            say("\u274C \u5931\u6557:" + String(e && e.message || e).slice(0, 60));
          }
        };
        if (q("[data-check]")) q("[data-check]").onclick = async () => {
          const en = q("[data-mine]").value.trim(), out = q("[data-judge]");
          if (!/[a-zA-Z]/.test(en)) return core2.ui.toast("\u82F1\u6587\u3092\u66F8\u3044\u3066\u306D");
          out.textContent = "\u5224\u5B9A\u3057\u3066\u3044\u307E\u3059\u2026";
          try {
            const r = await ai.check(en, x.en);
            out.innerHTML = `<b>${{ o: "\u25CE \u81EA\u7136\u306A\u6587", t: "\u25B3 \u901A\u3058\u308B\u3051\u308C\u3069\u5C11\u3057\u4E0D\u81EA\u7136", x: "\xD7 \u307E\u3061\u304C\u3044\u304C\u3042\u308B" }[r.ok] || ""}</b><br>${r.fix && r.fix !== en ? "\u76F4\u3057\u305F\u6587:" + esc6(r.fix) + "<br>" : ""}${esc6(r.why || "")}`;
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
            try {
              core2.eigo.send([{ en: x.en, ja: x.ja || "", ex: list[0] && list[0].en, exja: list[0] && list[0].ja }, ...list.slice(1).map((t) => ({ en: t.en, ja: t.ja, kind: "sentence" }))]);
            } catch (e) {
              console.error(e);
            }
            const ul = q("[data-gened]");
            ul.innerHTML = list.map(sent).join("");
            bindList(ul, list);
            btn.textContent = "\u52C9\u5F37\u30CE\u30FC\u30C8\u3068\u82F1\u30E9\u30DC\u306B\u5165\u308C\u307E\u3057\u305F";
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
  var esc7 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
    const load = () => ready || (ready = Promise.all(["words.js", "data.js", "bank.js", "wlv.js"].map((f) => loadScript(core2.base + "g/stream/" + f))).then(() => core2.dict && core2.dict.ready()).then(() => true).catch(() => false));
    const PM = { n: ["n"], v: ["v"], a: ["adj"], r: ["adv"] };
    const dictJa = (w, p) => {
      try {
        const e = core2.dict.lookupAll(w)[0];
        if (!e || e.w.toLowerCase() !== String(w).toLowerCase()) return "";
        const q = e.pos.find((x) => (PM[p] || [p]).includes(x[0]));
        return q ? q[1] : "";
      } catch (e) {
        return "";
      }
    };
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
        add(c[0], c[1], c[2] || dictJa(c[0], c[1]));
      });
      return G;
    }
    let WL = null;
    const CEFR = ["", "A1", "A2", "B1", "B2", "C1", "C2"], EIKEN = ["", "5\u301C3\u7D1A", "\u6E962\u7D1A", "2\u7D1A", "\u6E961\u7D1A", "1\u7D1A", "1\u7D1A\u4EE5\u4E0A"], TOEIC = ["", "\u301C220\u70B9", "225\u301C545\u70B9", "550\u301C780\u70B9", "785\u301C940\u70B9", "945\u70B9\u301C", "945\u70B9\u301C"], SCH = ["", "\u4E2D\u5B66", "\u4E2D\u5B66", "\u9AD8\u6821", "\u5927\u5B66\u53D7\u9A13\u30FB\u5927\u5B66", "\u5927\u5B66\u4EE5\u4E0A", "\u5927\u5B66\u4EE5\u4E0A"];
    function cefrNote(v) {
      try {
        if (!WL) {
          WL = {};
          WLV_SRC.split(",").forEach((s) => {
            const i = s.lastIndexOf(":");
            WL[s.slice(0, i)] = +s.slice(i + 1);
          });
        }
        const g = list(), lo = Math.max(0, Math.round(v) - 200), hi = Math.min(g.length, Math.round(v) + 200), ls = [];
        for (let i = lo; i < hi; i++) {
          const l = WL[String(g[i][0]).toLowerCase()];
          if (l) ls.push(l);
        }
        if (ls.length < 20) return "";
        ls.sort((a, b) => a - b);
        const m = ls[Math.floor(ls.length / 2)];
        return `\uFF08CEFR ${CEFR[m]}\u30FB\u82F1\u691C${EIKEN[m]}\u30FBTOEIC ${TOEIC[m]}\u30FB${SCH[m]}\u304F\u3089\u3044\u306E\u5358\u8A9E\u3002\u516C\u5F0F\u306E\u5BFE\u5FDC\u3067\u306F\u306A\u304F\u76EE\u5B89\u3067\u3059\uFF09`;
      } catch (e) {
        return "";
      }
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
        core2.ui.sheet(`<h3>${esc7(title)}</h3><p class="cs-note">${Math.min(asked, QN + extra.length)} \u554F\u76EE \u30FB ${q.kind === "chunk" ? "\u307E\u3068\u307E\u308A\u306E\u610F\u5473" : "\u5358\u8A9E\u306E\u610F\u5473"}\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044</p>
        <p class="cs-q">${esc7(q.q)}</p>${q.opts.map((o, k) => `<button class="cs-btn" data-k="${k}">${esc7(o)}</button>`).join("")}<button class="cs-btn cs-dk" data-k="-1">\u308F\u304B\u3089\u306A\u3044</button>`, (ov, close) => {
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
        core2.ui.sheet(`<h3>\u63A8\u5B9A\u8A9E\u5F59 \u7D04${v.toLocaleString()}\u8A9E</h3><p class="cs-note">${vocabNote(v)}${cefrNote(v)}\u3002\u30A2\u30D7\u30EA\u306E\u30EC\u30D9\u30EB\u306F\u300C${LV_NAME[lv]}\u300D\u304B\u3089\u59CB\u307E\u308A\u307E\u3059(\u9078\u3079\u308B\u306E\u306F ${L.allowed.map((x) => LV_NAME[x]).join("\u30FB")})\u3002${hold ? `<br>20\u79D2\u4EE5\u4E0A\u304B\u304B\u3063\u305F ${hold} \u554F\u306F\u3001\u7D50\u679C\u306B\u5165\u308C\u3066\u3044\u307E\u305B\u3093\u3002` : ""}<br>\u307E\u3061\u304C\u3048\u305F\u5358\u8A9E\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3057\u305F\u3002</p>`);
      }));
    }
    const progress = () => Math.max(0, (core2.mission ? core2.mission.cleared() : 0) - (L.lastCleared || 0));
    const canTest = () => !!L.lv && progress() >= NEED && core2.member.canTest();
    async function test() {
      if (!L.lv) return placement();
      if (progress() < NEED) return core2.ui.sheet(`<h3>\u5358\u8A9E\u529B\u30C6\u30B9\u30C8</h3><p class="cs-note">\u30DF\u30C3\u30B7\u30E7\u30F3\u3092\u3042\u3068 ${NEED - progress()} \u500B\u30AF\u30EA\u30A2\u3059\u308B\u3068\u53D7\u3051\u3089\u308C\u307E\u3059\u3002</p>`);
      const M = core2.member;
      if (!M.canTest()) return core2.ui.sheet(`<h3>\u5358\u8A9E\u529B\u30C6\u30B9\u30C8</h3><p class="cs-note">\u6B21\u306B\u53D7\u3051\u3089\u308C\u308B\u306E\u306F${M.nextTest()}\u3067\u3059(${M.isPaid() ? "\u6709\u6599\u4F1A\u54E1\u306F1\u65E51\u56DE" : "\u7121\u6599\u4F1A\u54E1\u306F\u90311\u56DE"})\u3002\u30C0\u30A4\u30E4 ${core2.econ.test.extraGems} \u3067\u3082\u30461\u56DE\u53D7\u3051\u3089\u308C\u307E\u3059(\u6301\u3063\u3066\u3044\u308B:${M.gems()})\u3002</p><button class="cs-btn" data-buy>\u30C0\u30A4\u30E4\u3067\u53D7\u3051\u308B</button>`, (ov, close) => ov.querySelector("[data-buy]").onclick = () => {
        close();
        if (M.buyTest()) test();
        else core2.ui.toast("\u30C0\u30A4\u30E4\u304C\u8DB3\u308A\u307E\u305B\u3093");
      });
      if (!await load() || !list()) return core2.ui.toast("\u3053\u306E\u30A2\u30D7\u30EA\u3067\u306F\u3001\u5358\u8A9E\u529B\u30C6\u30B9\u30C8\u304C\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093");
      intro("\u5358\u8A9E\u529B\u30C6\u30B9\u30C8", QN + 6, () => {
        M.useTest();
        run("\u5358\u8A9E\u529B\u30C6\u30B9\u30C8", Math.max(1, bandOf(L.vocab || 1500)), chunkQs(L.lv, 6), (res, hold) => {
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
          core2.ui.sheet(`<h3>\u63A8\u5B9A\u8A9E\u5F59 \u7D04${v.toLocaleString()}\u8A9E</h3><p class="cs-note">${vocabNote(v)}${cefrNote(v)}(\u524D\u56DE ${before.toLocaleString()}\u8A9E)\u3002\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u5473 ${Math.round(cacc * 100)}%\u3002<br>${msg || (L.lv < 3 ? `\u6B21\u306E\u30EC\u30D9\u30EB\u306F \u63A8\u5B9A\u8A9E\u5F59 ${nl < 2 ? "2,000" : "4,500"}\u8A9E \u3068\u3001\u30C1\u30E3\u30F3\u30AF\u306E\u610F\u54736\u5272 \u3067\u958B\u304D\u307E\u3059\u3002` : "\u3044\u3061\u3070\u3093\u4E0A\u306E\u30EC\u30D9\u30EB\u3067\u3059\u3002")}${hold ? `<br>20\u79D2\u4EE5\u4E0A\u304B\u304B\u3063\u305F ${hold} \u554F\u306F\u3001\u7D50\u679C\u306B\u5165\u308C\u3066\u3044\u307E\u305B\u3093\u3002` : ""}<br>\u307E\u3061\u304C\u3048\u305F\u8A00\u8449\u306F\u52C9\u5F37\u30CE\u30FC\u30C8\u306B\u5165\u308A\u307E\u3057\u305F\u3002</p>`);
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
      const parts = [{ n: "\u30B9\u30C8\u30DF\u30F3\u306E\u661F", v: stars, p: stars * 10 }, { n: "\u30EC\u30C3\u30B9\u30F3\u306E\u30AF\u30EA\u30A2", v: lessons, p: lessons * 20 }, { n: "\u8AAD\u307F\u7D42\u3048\u305F\u672C", v: books, p: books * 15 }, { n: "\u30EC\u30D9\u30EB\u306E\u5408\u683C", v: L.passed.length, p: L.passed.length * 300 }];
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
      // 読み上げ用:「新しい単語」をレベル帯(0〜9)から n こ。exclude(英語の小文字)は出さない
      bands: () => EDGES.slice(0, -1).map((e, i) => ({ i, note: BAND_NOTE[i], from: e, to: EDGES[i + 1] })),
      async wordsOf(bs, n = 20, exclude = /* @__PURE__ */ new Set()) {
        if (!await load()) return [];
        const g = list();
        if (!g || !bs || !bs.length) return [];
        const pool = [];
        bs.forEach((b) => {
          const lo = EDGES[b], hi = Math.min(EDGES[b + 1], g.length);
          for (let i = lo; i < hi; i++) pool.push(g[i]);
        });
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const out = [], used = new Set(exclude);
        for (const w of pool) {
          if (out.length >= n) break;
          const k = String(w[0]).toLowerCase();
          if (used.has(k) || w[0].includes(" ") || !w[2]) continue;
          used.add(k);
          out.push({ en: w[0], pos: w[1], ja: w[2], kind: "word", src: "new" });
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
  var esc8 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
      const fwb = Object.keys(T.fwTypes).map((k) => `<button data-ev="fw:${k}">${esc8(T.fwTypes[k])}</button>`).join("");
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
      <ul class="cs-adm-list">${list.map((e) => `<li><b>${esc8(T.kinds[e.kind] || e.kind)}</b><small>${e.when === "birthday" ? "\u8A95\u751F\u65E5\u306E\u591C" : esc8((e.at || "").replace("T", " "))}</small><div class="cs-adm-row"><button data-evdel="${esc8(e.id)}">\u6D88\u3059</button></div></li>`).join("") || '<li class="cs-note">\u4E88\u7D04\u306F\u3042\u308A\u307E\u305B\u3093</li>'}</ul></section>`;
    }
    function open() {
      const M = core2.member, C = core2.cloud, B = core2.books;
      const items = C.all(), rev = C.reviewList(), reps = C.reports();
      const week = B ? B.weekly().map((b) => esc8(b.title)).join("\u3001") : "";
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
        ${reps.length ? `<p class="cs-note">\u901A\u5831 ${reps.length}\u4EF6:${reps.map((r) => esc8((C.get(r.id) || {}).title || r.id) + "\u300C" + esc8(r.why) + "\u300D").join(" / ")}</p>` : ""}
        ${rev.length ? `<p class="cs-note">\u898B\u76F4\u3057\u306E\u5019\u88DC:${rev.map((x) => esc8(x.title) + "(" + esc8(x.why) + ")").join(" / ")}</p>` : ""}
        <ul class="cs-adm-list">${items.map((x) => `<li><b>${esc8(x.title)}</b><small>${ST[x.state] || x.state} \u30FB ${esc8(x.author)} \u30FB \u7968${x.votes} \u30FB \u3088\u304B\u3063\u305F${x.good}/\u3044\u307E\u3044\u3061${x.bad} \u30FB \u4F7F\u7528${x.uses} \u30FB id sh:${x.id}</small>
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
  var esc9 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
      const free = Array.isArray(o.words);
      const mode = free ? "free" : o.mode === "prev" ? "prev" : "today", day2 = mode === "prev" ? o.day || dl.prevDay() : dl.dayKey();
      if (!day2) {
        core2.ui.toast("\u307E\u3060\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093");
        return;
      }
      const title = mode === "prev" ? `${dayJa(day2)}\u306E\u3075\u308A\u304B\u3048\u308A` : "\u4ECA\u65E5\u306E\u3075\u308A\u304B\u3048\u308A";
      let items = (free ? o.words : dl.words(day2)).map((w) => ({ ...w }));
      const sents = free ? [] : items.filter((w) => w.kind === "sentence");
      items = items.filter((w) => w.kind !== "sentence" && !isChunk(w));
      const forced = free ? false : dl.forced();
      if (forced || mode === "prev") {
        const have = new Set(items.map((w) => w.en.toLowerCase())), rest = dl.pending().filter((w) => !have.has(w.en.toLowerCase())).sort((a, b) => (b.unk || 0) - (a.unk || 0));
        if (forced) rest.slice(0, Math.max(0, FORCE_N - items.length)).forEach((w) => items.push({ ...w, old: true }));
      }
      if (!free) items.sort((a, b) => (b.miss ? 1 : 0) + (b.multi > 1 ? 0.5 : 0) - ((a.miss ? 1 : 0) + (a.multi > 1 ? 0.5 : 0)));
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
            return `<div class="rv-g"><b style="color:${CATS[c].col}">${top === "play" ? "\u904A\u3073 / " : ""}${CATS[c].n} <span>${mm(s.by[c])}</span></b>${it.map((x) => `<small>${esc9(x.label)} ${mm(x.sec)}</small>`).join("")}</div>`;
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
          const row = (w, i, chk) => `<li data-i="${i}"><b>${esc9(w.en)}</b>${w.multi > 1 ? `<em>\uFF0B${w.multi - 1}</em>` : ""}${w.miss ? "<u>\u307E\u3061\u304C\u3048\u305F</u>" : ""}${w.old ? "<u>\u524D\u304B\u3089</u>" : ""}${chk ? `<span class="rv-k2" data-k="${i}"><button class="g${w._k ? " on" : ""}" data-v="1">\u899A\u3048\u3066\u308B</button><button class="r${w._k ? "" : " on"}" data-v="0">\u307E\u3060</button></span>` : ""}<small>${esc9(w.ja)}</small></li>`;
          const draw = () => {
            const cur = tab === "w" ? items : sents;
            go(`<h3>\u51FA\u4F1A\u3063\u305F${tab === "w" ? "\u8A00\u8449" : "\u6587\u7AE0"}(${cur.length})</h3>
            ${sents.length ? `<nav class="cs-chips"><button data-t="w" class="${tab === "w" ? "on" : ""}">\u8A00\u8449 ${items.length}</button><button data-t="s" class="${tab === "s" ? "on" : ""}">\u6587\u7AE0 ${sents.length}</button></nav>` : ""}
            <p class="cs-note">\u97F3\u58F0\u304C\u9806\u756A\u306B\u6D41\u308C\u307E\u3059\u3002\u300C\uFF0B\u300D\u306F\u3001\u307B\u304B\u306E\u610F\u5473\u3082\u3042\u308B\u8A00\u8449\u3002${tab === "w" ? "<br>\u53F3\u306E\u300C\u899A\u3048\u3066\u308B(\u7DD1)/\u307E\u3060(\u8D64)\u300D\u3067\u632F\u308A\u5206\u3051\u3002\u300C\u307E\u3060\u300D\u306E\u8A00\u8449\u3067\u30C6\u30B9\u30C8\u3057\u307E\u3059\u3002" : ""}</p>
            <ul class="rv-list${tab === "w" ? " rv-chk2" : ""}">${cur.map((w, i) => row(w, i, tab === "w")).join("")}</ul>
            <div class="rv-two"><button class="cs-btn" id="rv-p">\u25B6 \u97F3\u58F0</button><button class="cs-btn" id="rv-n">${items.length ? "\u30D5\u30E9\u30C3\u30B7\u30E5\u30AB\u30FC\u30C9\u3067\u898B\u76F4\u3059" : "\u304A\u308F\u308B"}</button></div>
            ${tab === "w" && items.length ? '<button class="cs-btn rv-ok" id="rv-reg">\u3053\u308C\u3067\u767B\u9332\u3057\u3066\u3001\u5358\u8A9E\u30C6\u30B9\u30C8\u3078</button>' : ""}`, () => {
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
              box.querySelectorAll(".rv-k2 button").forEach((b) => {
                b.onclick = () => {
                  const sp = b.parentNode, on2 = b.dataset.v === "1";
                  items[+sp.dataset.k]._k = on2;
                  sp.querySelector(".g").classList.toggle("on", on2);
                  sp.querySelector(".r").classList.toggle("on", !on2);
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
              const rg = box.querySelector("#rv-reg");
              if (rg) rg.onclick = () => {
                stop();
                const res = items.map((w) => ({ en: w.en, known: !!w._k, item: w })), rest = items.filter((w) => !w._k);
                const g = commit(res);
                if (g) core2.ui.toast("+" + g + "\u30B3\u30A4\u30F3");
                close();
                test(rest.length ? rest : items);
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
            <div class="rv-card" id="rv-c"><div class="f"><b>${esc9(w.en)}</b>${w.pos ? `<small>${esc9(w.pos)}</small>` : ""}<span class="b" hidden>${esc9(w.ja || "(\u610F\u5473\u306E\u8A18\u9332\u306A\u3057)")}${w.multi > 1 ? `<em>\u307B\u304B\u306E\u610F\u5473\u3082\u3042\u308B\u3088(\uFF0B${w.multi - 1})</em>` : ""}</span></div></div>
            <div class="rv-two"><button class="cs-btn rv-no" id="rv-x">\u2190 \u307E\u3060</button><button class="cs-btn rv-ok" id="rv-o">\u899A\u3048\u3066\u308B \u2192</button></div>
            <div class="rv-two"><button class="cs-btn" id="rv-c2">\u610F\u5473\u306F\u308F\u304B\u308B\u3051\u3069\u3001\u8A00\u3048\u306A\u3044</button></div>
            ${idx > (stepCards.pre || 0) ? '<button class="cs-btn" id="rv-b">\u21A9 \u3072\u3068\u3064 \u3082\u3069\u308B</button>' : '<button class="cs-btn" id="rv-qt">\u3059\u3050\u5358\u8A9E\u529B\u30C6\u30B9\u30C8\u3092\u3059\u308B</button>'}`, () => {
              const c = box.querySelector("#rv-c"), back = c.querySelector(".b");
              let x0 = null, dx = 0, moved = false, flipped = false, done = false;
              core2.speech.speak(w.en);
              const answer = (known, cant) => {
                if (done) return;
                done = true;
                res.push({ en: w.en, known, cant: !!cant, item: w });
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
              box.querySelector("#rv-c2").onclick = () => answer(false, true);
              const qt = box.querySelector("#rv-qt");
              if (qt) qt.onclick = () => {
                close();
                const rest = items.filter((w2) => !w2._k);
                test(rest.length ? rest : items);
              };
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
          <ul class="rv-list rv-chk">${res.map((r, i) => `<li><label><input type="checkbox" data-i="${i}" ${r.known ? "checked" : ""}><span class="t"><b>${esc9(r.en)}</b><small>${esc9(r.item.ja || "")}</small></span></label></li>`).join("")}</ul>
          <div class="rv-two">${free && o.after === "list" ? "" : '<button class="cs-btn" id="rv-bk">\u21A9 \u30AB\u30FC\u30C9\u306B\u3082\u3069\u308B</button>'}<button class="cs-btn rv-ok" id="rv-d">\u3053\u308C\u3067\u6C7A\u5B9A</button></div>`, () => {
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
            const bk = box.querySelector("#rv-bk");
            if (bk) bk.onclick = () => {
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
        function toNote(res) {
          const now = Date.now();
          res.forEach((r) => {
            try {
              const w = r.item || {};
              if (r.known || !w.ja || w.kind === "sentence") return;
              const it = core2.notebook.add({ en: r.en, ja: w.ja, pos: w.pos, src: "review" }, true);
              if (it && !it.sr) core2.notebook.sr(it.id, { s: r.cant ? "cant" : "unk", box: 0, n: 0, w: 0, ok: 0, last: 0, due: now + 0.7 * 864e5 });
            } catch (e) {
            }
          });
        }
        function commit(res) {
          if (free) {
            toNote(res);
            dl.applyKnown(res);
            return 0;
          }
          toNote(res);
          dl.finishReview(day2, res);
          return mode === "today" ? give("review") : !o.noPt ? give("prev") : 0;
        }
        function finish(res) {
          stopAudio();
          const ng = res.filter((r) => !r.known);
          let g = 0, msg = "";
          if (res.length || !items.length) g = commit(res);
          go(`<h3>\u304A\u3064\u304B\u308C\u3055\u307E!</h3>${res.length ? `<p>\u899A\u3048\u3066\u308B ${res.length - ng.length} \u30FB \u307E\u3060 ${ng.length}</p>${ng.length ? '<p class="cs-note">\u300C\u307E\u3060\u300D\u306E\u8A00\u8449\u306F\u3001\u3042\u3068\u3067 \u307E\u305F\u3067\u3066\u304F\u308B\u3088\u3002</p>' : ""}` : ""}
          ${g ? `<p class="rv-pt">+${g} \u30B3\u30A4\u30F3</p>` : free ? "" : '<p class="cs-note">\u3053\u306E\u3075\u308A\u304B\u3048\u308A\u306E\u30B3\u30A4\u30F3\u306F\u3001\u3082\u3089\u3048\u306A\u304B\u3063\u305F\u3088(\u53D7\u3051\u53D6\u308A\u6E08\u307F\u3001\u307E\u305F\u306F\u5FD8\u308C\u305F\u65E5)\u3002</p>'}
          ${mode === "today" ? `<p class="cs-note">${statusLine()}</p>` : ""}<button class="cs-btn" id="rv-e">${mode === "today" ? "\u4ECA\u65E5\u306F\u3053\u3053\u307E\u3067!" : "\u3064\u3065\u3051\u308B"}</button>${items.length ? '<button class="cs-btn" id="rv-t">\u5358\u8A9E\u30C6\u30B9\u30C8\u3082\u3084\u308B</button>' : ""}`, () => {
            box.querySelector("#rv-e").onclick = () => close();
            const tb = box.querySelector("#rv-t");
            if (tb) tb.onclick = () => {
              close();
              test(ng.length ? ng.map((r) => r.item) : items);
            };
          });
        }
        if (free) {
          if (!items.length) close();
          else if (o.after === "list") stepCheck(items.map((w) => ({ en: w.en, known: false, item: w })));
          else stepCards();
        } else if (mode === "today" && !o.noConfirm) go(`<h3>\u4ECA\u65E5\u306F\u3053\u3053\u307E\u3067\u306B\u3059\u308B?</h3><p class="cs-note">\u3053\u306E\u65E5\u306E\u3075\u308A\u304B\u3048\u308A(\u6642\u9593\u30FB\u8A00\u8449\u30FB\u30AB\u30FC\u30C9)\u3092\u3057\u3066\u3001\u4ECA\u65E5\u3092\u7D42\u308F\u308A\u307E\u3059\u3002</p><p class="cs-note">${statusLine()}</p>
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
    async function test(only) {
      const fixed = Array.isArray(only) && only.length ? only.filter((w) => w && w.en && w.ja).filter((w, i, a) => a.findIndex((x) => x.en.toLowerCase() === w.en.toLowerCase()) === i) : null;
      let pool = fixed ? fixed.slice() : dl.pool(), extra = [];
      if (fixed) {
        try {
          const ex = new Set(pool.map((w) => w.en.toLowerCase()));
          extra = dl.pool().filter((w) => !ex.has(w.en.toLowerCase()));
          if (pool.length + extra.length < 6) extra = extra.concat(await core2.level.fillWords(6, /* @__PURE__ */ new Set([...ex, ...extra.map((w) => w.en.toLowerCase())])));
        } catch (e) {
        }
      } else if (pool.length < TEST_N) {
        try {
          const ex = /* @__PURE__ */ new Set([...dl.knownKeys(), ...pool.map((w) => w.en.toLowerCase())]);
          pool = pool.concat(await core2.level.fillWords(TEST_N - pool.length + 3, ex));
        } catch (e) {
        }
      }
      if (pool.length < (fixed ? 1 : 4)) {
        core2.ui.toast("\u30C6\u30B9\u30C8\u3067\u304D\u308B\u8A00\u8449\u304C\u3001\u307E\u3060\u5C11\u306A\u3044\u3088");
        return;
      }
      const dist = pool.concat(extra);
      const first = (w) => String(w.ja).split(/[、,・]/)[0].trim();
      const qs = pool.slice().sort(() => Math.random() - 0.5).slice(0, TEST_N).map((w) => {
        const bad = dist.filter((x) => x.en !== w.en && first(x) !== first(w)).sort(() => Math.random() - 0.5).slice(0, 3).map(first);
        return { w, ans: first(w), ch: [first(w), ...bad].sort(() => Math.random() - 0.5) };
      });
      core2.ui.sheet('<div class="rv"></div>', (ov, close) => {
        const box = ov.querySelector(".rv");
        let i = 0;
        const res = [];
        let t0 = 0;
        dl.act("sub", { cat: "study", label: "\u5358\u8A9E\u30C6\u30B9\u30C8" });
        const wt = setInterval(() => {
          if (!ov.isConnected) {
            clearInterval(wt);
            dl.act("sub", null);
          }
        }, 800);
        const q = () => {
          if (i >= qs.length) return end();
          const Q = qs[i];
          t0 = Date.now();
          core2.speech.speak(Q.w.en);
          box.innerHTML = `<h3>\u5358\u8A9E\u30C6\u30B9\u30C8 <small>${i + 1}/${qs.length}</small></h3><div class="rv-card" style="cursor:default"><div class="f"><b>${esc9(Q.w.en)}</b>${Q.w.pos ? `<small>${esc9(Q.w.pos)}</small>` : ""}</div></div>
          <div class="rv-ch">${Q.ch.map((c, k) => `<button class="cs-btn" data-k="${k}">${esc9(c)}</button>`).join("")}</div><p class="cs-note">10\u79D2\u4EE5\u4E0A\u306A\u3084\u3093\u3060\u8A00\u8449\u306F\u3001\u3042\u3068\u3067\u3082\u3046\u4E00\u5EA6\u51FA\u307E\u3059\u3002</p>`;
          box.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => {
            const ok = Q.ch[+b.dataset.k] === Q.ans, slow = (Date.now() - t0) / 1e3 > SLOW;
            res.push({ ok, slow, w: Q.w });
            try {
              dl.addWord({ en: Q.w.en, ja: Q.ans, pos: Q.w.pos, src: "test", miss: !ok, slow });
              core2.learn && core2.learn.hit(Q.w.en, ok, { ja: Q.ans });
            } catch (e) {
            }
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

  // core/aloud.js
  var esc10 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var DEF = { v: 2, src: ["missed", "pending"], bands: [], newN: 20, dir: "en-ja", reps: 1, gap: 1, order: "random", after: "cards" };
  var MAXN = 150;
  var cut = (t) => String(t || "").split(/[、,;;／\/]/).map((x) => x.trim()).filter(Boolean);
  var jaShort = (t) => cut(t).slice(0, 2).join("\u3001");
  var jaSay = (t) => (cut(t)[0] || "").replace(/[((][^))]*[))]/g, "").trim();
  var shuf2 = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function createAloud(core2) {
    const st = createStore("core"), C = Object.assign({}, DEF, st.get("aloud") || {});
    if (C.v !== 2) {
      C.v = 2;
      C.dir = "en-ja";
    }
    const save = () => st.set("aloud", C);
    let cur = null;
    async function collect(o = {}) {
      const dl = core2.daylog, m = /* @__PURE__ */ new Map();
      const ok = (w) => w && w.en && w.ja && w.kind !== "sentence";
      const add = (w) => {
        if (ok(w)) {
          const k = w.en.toLowerCase();
          if (!m.has(k)) m.set(k, { en: w.en, ja: w.ja, pos: w.pos, kind: w.kind || "word", multi: w.multi, miss: !!w.miss, src: w.src });
        }
      };
      let src = C.src;
      if (o.noNew && !src.some((k) => k !== "new")) src = ["missed", "pending"];
      try {
        if (src.includes("missed")) dl.missed(14).forEach(add);
      } catch (e) {
      }
      try {
        if (src.includes("pending")) dl.pending().forEach(add);
      } catch (e) {
      }
      if (o.noNew && !m.size) {
        try {
          dl.pool().forEach(add);
        } catch (e) {
        }
      }
      if (C.src.includes("new") && !o.noNew && core2.level && core2.level.wordsOf) {
        try {
          let bs = C.bands.slice();
          if (!bs.length) {
            const v = core2.level.vocab() || 1500, B = core2.level.bands();
            bs = [Math.max(0, B.findIndex((b) => b.to > v))];
          }
          const ex = /* @__PURE__ */ new Set([...m.keys(), ...dl.knownKeys()]);
          (await core2.level.wordsOf(bs, C.newN, ex)).forEach(add);
        } catch (e) {
        }
      }
      return [...m.values()].slice(0, MAXN);
    }
    function run(list0, o = {}) {
      const c = Object.assign({}, C, o.cfg || {}), list = c.order === "random" ? shuf2(list0.slice()) : list0.slice();
      let alive = true, token = 0, paused = false, timer = null, i = 0;
      const wait2 = (ms) => new Promise((r) => {
        timer = setTimeout(r, ms);
      });
      const voiceOn = () => {
        try {
          return !!core2.settings.get("voice");
        } catch (e) {
          return true;
        }
      };
      const blocked = () => paused || document.body.classList.contains("tw-talking") || document.body.classList.contains("md-app-open");
      const say = (text2, lang, minMs) => new Promise((res) => {
        if (!voiceOn()) {
          wait2(Math.max(minMs, 1200)).then(res);
          return;
        }
        const t0 = Date.now();
        let done = false;
        const fin = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const rest = minMs - (Date.now() - t0);
          rest > 0 ? timer = setTimeout(res, rest) : res();
        };
        timer = setTimeout(fin, 7e3);
        try {
          core2.speech.speak(text2, { lang, onend: fin });
        } catch (e) {
          fin();
        }
      });
      const text = (x, l) => l === "en" ? x.en : jaSay(x.ja);
      async function loop(my) {
        const live = () => alive && my === token;
        while (live()) {
          if (i >= list.length) {
            if (o.loop && list.length) {
              i = 0;
              if (c.order === "random") shuf2(list);
            } else {
              alive = false;
              o.onEnd && o.onEnd(true, list.slice());
              return;
            }
          }
          while (blocked() && live()) await wait2(400);
          if (!live()) return;
          const x = list[i], first = c.dir === "en-ja" ? "en" : "ja", second = first === "en" ? "ja" : "en", info = { i, n: list.length, first };
          for (let k = 0; k < c.reps && live(); k++) {
            o.ui && o.ui.show(x, { ...info, phase: "first" });
            await say(text(x, first), first, 900);
            if (!live()) return;
            await wait2(Math.max(0, c.gap) * 1e3);
            if (!live()) return;
            o.ui && o.ui.show(x, { ...info, phase: "second" });
            await say(text(x, second), second, 800);
            if (!live()) return;
            await wait2(450);
          }
          i++;
        }
      }
      loop(++token);
      return {
        stop() {
          alive = false;
          token++;
          clearTimeout(timer);
          try {
            core2.speech.stop();
          } catch (e) {
          }
        },
        pause(on) {
          paused = !!on;
          if (paused) {
            try {
              core2.speech.stop();
            } catch (e) {
            }
          }
        },
        restart() {
          clearTimeout(timer);
          try {
            core2.speech.stop();
          } catch (e) {
          }
          loop(++token);
        },
        // ローディング: 最初のタップのあとで、いまの言葉から読み直す
        played: () => list.slice(0, i + 1),
        get paused() {
          return paused;
        }
      };
    }
    function pair(x, info) {
      const t = (l) => l === "en" ? x.en : jaShort(x.ja), second = info.first === "en" ? "ja" : "en";
      return { a: t(info.first), b: t(second), onA: info.phase === "first", onB: info.phase === "second" };
    }
    function band(host, o = {}) {
      if (!host && cur) cur();
      const el = document.createElement("div");
      el.className = "al-band" + (host ? " in" : "");
      el.innerHTML = '<div class="al-w"><b></b><i>\u2192</i><b></b></div><em></em>' + (host ? "" : '<span class="al-ctl"><button data-a="p" aria-label="\u4E00\u6642\u505C\u6B62">\u23F8</button><button data-a="x" aria-label="\u3068\u3081\u308B">\u25A0</button></span>');
      (host || document.body).appendChild(el);
      const [eA, eB] = el.querySelectorAll("b"), eN = el.querySelector("em");
      let h = null, dead = false, stopFn;
      const end = (fin, played) => {
        if (dead) return;
        dead = true;
        if (h) h.stop();
        el.remove();
        if (cur === stopFn) cur = null;
        o.onEnd && o.onEnd(fin, played);
      };
      stopFn = () => {
        if (dead) return;
        dead = true;
        if (h) h.stop();
        el.remove();
        if (cur === stopFn) cur = null;
      };
      let paused = false;
      stopFn.pause = (on) => {
        paused = !!on;
        if (h) h.pause(paused);
      };
      if (!host) cur = stopFn;
      const ui = { show(x, info) {
        const p = pair(x, info);
        eA.textContent = p.a;
        eB.textContent = p.b;
        eA.classList.toggle("on", p.onA);
        eB.classList.toggle("on", p.onB);
        eN.textContent = `${info.i + 1} / ${info.n}`;
      } };
      const start = (list) => {
        if (dead) return;
        if (!list.length) {
          eA.textContent = "\u8AAD\u3080\u8A00\u8449\u304C\u3042\u308A\u307E\u305B\u3093";
          eB.textContent = "";
          el.querySelector("i").remove();
          setTimeout(() => end(false, []), 1800);
          return;
        }
        h = run(list, { loop: !!o.loop, ui, onEnd: (fin, all) => {
          eA.textContent = "\u304A\u308F\u308A!";
          eB.textContent = "";
          setTimeout(() => end(true, all), 500);
        } });
        if (paused) h.pause(true);
        const ctl = el.querySelector(".al-ctl");
        if (ctl) ctl.onclick = (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          if (b.dataset.a === "p") {
            h.pause(!h.paused);
            b.textContent = h.paused ? "\u25B6" : "\u23F8";
          } else {
            const pl = h.played();
            end(false, pl);
          }
        };
      };
      eA.textContent = "\u2026";
      if (o.list) start(o.list);
      else collect({ noNew: o.noNew }).then(start);
      return stopFn;
    }
    const play = (list) => band(null, { list, onEnd: (fin, played) => {
      if (played && played.length) core2.review.open({ words: played, after: C.after });
    } });
    function open() {
      core2.ui.sheet('<div class="al"></div>', (ov, close) => {
        const box = ov.querySelector(".al"), go = (html, bind) => {
          box.innerHTML = html;
          if (bind) bind();
          ov.querySelector(".cs-sheet").scrollTop = 0;
        };
        const seg = (key2, opts) => `<div class="al-seg">${opts.map(([v, l]) => `<button data-k="${key2}" data-v="${v}" class="${C[key2] == v ? "on" : ""}">${l}</button>`).join("")}</div>`;
        const num = (v) => v !== "" && !isNaN(+v) ? +v : v;
        function settingsScreen() {
          const bands = core2.level && core2.level.bands ? core2.level.bands() : [], isNew = C.src.includes("new");
          go(`<h3>\u{1F4D6} \u5358\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052</h3>
          <p class="cs-note">\u8AAD\u3080\u8A00\u8449(\u3044\u304F\u3064\u3067\u3082)</p>
          <div class="al-lv">${[["missed", "\u307E\u3061\u304C\u3048\u305F\u5358\u8A9E"], ["pending", "\u307E\u3060\u899A\u3048\u3066\u306A\u3044\u5358\u8A9E"], ["new", "\u65B0\u3057\u3044\u5358\u8A9E"]].map(([k, l]) => `<button data-s="${k}" class="${C.src.includes(k) ? "on" : ""}">${l}</button>`).join("")}</div>
          ${isNew ? `<p class="cs-note">\u65B0\u3057\u3044\u5358\u8A9E\u306E\u30EC\u30D9\u30EB(\u3044\u304F\u3064\u3067\u3082)</p><div class="al-lv">${bands.map((b) => `<button data-b="${b.i}" class="${C.bands.includes(b.i) ? "on" : ""}">Lv${b.i + 1} ${esc10(b.note)}</button>`).join("")}</div>
          <div class="al-row"><span>\u65B0\u3057\u3044\u5358\u8A9E\u306E\u6570</span>${seg("newN", [[10, "10"], [20, "20"], [30, "30"], [50, "50"]])}</div><p class="cs-note">\u30EC\u30D9\u30EB\u3092\u9078\u3070\u306A\u3044\u3068\u304D\u306F\u3001\u3044\u307E\u306E\u5B9F\u529B\u306E\u30EC\u30D9\u30EB\u304B\u3089\u51FA\u3057\u307E\u3059\u3002</p>` : ""}
          <div class="al-row"><span>\u8AAD\u3080\u5411\u304D</span>${seg("dir", [["ja-en", "\u65E5\u672C\u8A9E\u2192\u82F1\u8A9E"], ["en-ja", "\u82F1\u8A9E\u2192\u65E5\u672C\u8A9E"]])}</div>
          <div class="al-row"><span>\u8AAD\u3080\u56DE\u6570</span>${seg("reps", [[1, "1\u56DE"], [2, "2\u56DE"], [3, "3\u56DE"]])}</div>
          <div class="al-row"><span>\u9593\u306E\u79D2\u6570</span>${seg("gap", [[1, "1\u79D2"], [2, "2\u79D2"], [3, "3\u79D2"], [5, "5\u79D2"]])}</div>
          <div class="al-row"><span>\u9806\u756A</span>${seg("order", [["random", "\u30E9\u30F3\u30C0\u30E0"], ["seq", "\u9806\u756A"]])}</div>
          <div class="al-row"><span>\u8AAD\u3093\u3060\u3042\u3068</span>${seg("after", [["cards", "\u30D5\u30E9\u30C3\u30B7\u30E5\u30AB\u30FC\u30C9"], ["list", "\u4E00\u89A7"]])}</div>
          <button class="cs-btn rv-ok" id="al-next">\u4E00\u89A7\u3092\u898B\u308B</button>`, () => {
            box.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
              const k = b.dataset.s;
              C.src = C.src.includes(k) ? C.src.filter((x) => x !== k) : [...C.src, k];
              save();
              settingsScreen();
            });
            box.querySelectorAll("[data-b]").forEach((b) => b.onclick = () => {
              const k = +b.dataset.b;
              C.bands = C.bands.includes(k) ? C.bands.filter((x) => x !== k) : [...C.bands, k];
              save();
              settingsScreen();
            });
            box.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => {
              C[b.dataset.k] = num(b.dataset.v);
              save();
              settingsScreen();
            });
            box.querySelector("#al-next").onclick = () => {
              if (!C.src.length) {
                core2.ui.toast("\u8AAD\u3080\u8A00\u8449\u30921\u3064\u4EE5\u4E0A\u3048\u3089\u3093\u3067\u306D");
                return;
              }
              listScreen();
            };
          });
        }
        async function listScreen() {
          go('<h3>\u{1F4D6} \u5358\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052</h3><p class="cs-note">\u8A00\u8449\u3092\u96C6\u3081\u3066\u3044\u307E\u3059\u2026</p>');
          const list = await collect(), off = /* @__PURE__ */ new Set();
          if (!box.isConnected) return;
          if (!list.length) {
            go('<h3>\u{1F4D6} \u5358\u8A9E\u306E\u8AAD\u307F\u4E0A\u3052</h3><p class="cs-note">\u8AAD\u3080\u8A00\u8449\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u8AAD\u3080\u8A00\u8449\u306E\u7A2E\u985E\u3092\u8DB3\u3059\u304B\u3001\u65B0\u3057\u3044\u5358\u8A9E\u306E\u30EC\u30D9\u30EB\u3092\u9078\u3093\u3067\u306D\u3002</p><button class="cs-btn" id="al-bk">\u2190 \u305B\u3063\u3066\u3044</button>', () => {
              box.querySelector("#al-bk").onclick = settingsScreen;
            });
            return;
          }
          go(`<h3>\u8AAD\u307F\u4E0A\u3052\u306E\u4E00\u89A7 <small id="al-n"></small></h3>
          <p class="cs-note">\u306F\u3058\u3081\u306F\u5168\u90E8\u300C\u8AAD\u3080\u300D\u3002\u8AAD\u307E\u306A\u3044\u8A00\u8449\u3060\u3051\u3001\u53F3\u306E\u300C\u8AAD\u307E\u306A\u3044\u300D\u3092\u62BC\u3057\u3066\u306D\u3002</p>
          <button class="cs-btn" id="al-all">\u305C\u3093\u3076 \u8AAD\u3080</button>
          <ul class="al-list">${list.map((w, i) => `<li data-i="${i}"><span class="t"><b>${esc10(w.en)}</b>${w.miss ? "<u>\u307E\u3061\u304C\u3048\u305F</u>" : ""}<small>${esc10(jaShort(w.ja))}</small></span><span class="al-tg"><button class="g on" data-v="1">\u8AAD\u3080</button><button class="r" data-v="0">\u8AAD\u307E\u306A\u3044</button></span></li>`).join("")}</ul>
          <div class="rv-two"><button class="cs-btn" id="al-bk">\u2190 \u305B\u3063\u3066\u3044</button><button class="cs-btn rv-ok" id="al-go">\u25B6 \u8AAD\u307F\u4E0A\u3052\u308B</button></div>`, () => {
            const cnt = () => {
              const n = list.length - off.size;
              box.querySelector("#al-n").textContent = `(\u8AAD\u3080 ${n} / ${list.length})`;
              box.querySelector("#al-go").textContent = `\u25B6 \u8AAD\u307F\u4E0A\u3052\u308B(${n})`;
            };
            const setLi = (li, on) => {
              const i = +li.dataset.i;
              on ? off.delete(i) : off.add(i);
              li.classList.toggle("off", !on);
              li.querySelector(".g").classList.toggle("on", on);
              li.querySelector(".r").classList.toggle("on", !on);
            };
            box.querySelectorAll(".al-tg button").forEach((b) => b.onclick = () => {
              setLi(b.closest("li"), b.dataset.v === "1");
              cnt();
            });
            box.querySelector("#al-all").onclick = () => {
              box.querySelectorAll(".al-list li").forEach((li) => setLi(li, true));
              cnt();
            };
            box.querySelector("#al-bk").onclick = settingsScreen;
            box.querySelector("#al-go").onclick = () => {
              const sel = list.filter((w, i) => !off.has(i));
              if (!sel.length) {
                core2.ui.toast("\u8AAD\u3080\u8A00\u8449\u304C\u3042\u308A\u307E\u305B\u3093");
                return;
              }
              close();
              play(sel);
            };
            cnt();
          });
        }
        settingsScreen();
      });
    }
    return { open, band, run, collect, play, pair, stop: () => {
      if (cur) cur();
    }, cfg: () => ({ ...C }), get playing() {
      return !!cur;
    } };
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
  var esc11 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var OPP = { 1: "mii", 2: "baron", 3: "gon" };
  var OPPN = { mii: "\u30DF\u30A4", baron: "\u30CF\u30C3\u30BF\u30EA\u7537\u7235", gon: "\u3072\u308D\u3044\u5C4B\u30B4\u30F3" };
  var LVN = { 1: "\u521D\u7D1A", 2: "\u4E2D\u7D1A", 3: "\u4E0A\u7D1A" };
  var CATS2 = [{ k: "word", n: "\u5358\u8A9E\u30FB\u719F\u8A9E" }, { k: "chunk", n: "\u30C1\u30E3\u30F3\u30AF\u3084\u6587\u578B" }, { k: "read", n: "\u8AAD\u66F8" }, { k: "lesson", n: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3\u3092\u898B\u308B" }, { k: "any", n: "\u304A\u307E\u304B\u305B" }];
  var DAY3 = 864e5;
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
        out.push({ type: "ws", cats: ["word", "game"], time: "s", title: `${LVN[L]}\u306E\u5358\u8A9E \u30BB\u30C3\u30C8${k + 1}`, how: "\u30B9\u30C8\u30DF\u30F3\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { wordset: { lv: L, k } } }, check: { play: "stream.word", set: `w${L}-${k + 1}` } });
        const i = k3();
        out.push({ type: "wi", cats: ["word"], time: "s", title: `${LVN[L]}\u306E\u719F\u8A9E \u30BB\u30C3\u30C8${i + 1}`, how: "\u30B9\u30C8\u30DF\u30F3\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { wordset: { lv: L, k: i, kind: "i" } } }, check: { play: "stream.word", set: `i${L}-${i + 1}` } });
        out.push({ type: "ws2", cats: ["word"], time: "l", need: 2, title: `${LVN[L]}\u306E\u5358\u8A9E\u30BB\u30C3\u30C8\u30922\u3064`, how: "\u30B9\u30C8\u30DF\u30F3\u306E\u5358\u8A9E\u7DF4\u7FD2\u30922\u30BB\u30C3\u30C8\u3001\u6700\u5F8C\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2(\u30BB\u30C3\u30C8\u306F\u81EA\u7531)", go: { game: "stream", opts: { wordset: { lv: L, k: k6() } } }, check: { play: "stream.word" } });
        if (nb.length >= 4) out.push({ type: "nb", cats: ["word"], time: "s", title: `\u307E\u3061\u304C\u3048\u305F\u8A00\u8449 ${Math.min(20, nb.length)}\u500B\u306E\u7DF4\u7FD2`, how: "\u30B9\u30C8\u30DF\u30F3\u3067\u6700\u5F8C\u307E\u3067\u7DF4\u7FD2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { words: nb.slice(0, 20).map((x) => [x.en, x.ja]), title: "\u52C9\u5F37\u30CE\u30FC\u30C8:\u307E\u3061\u304C\u3048\u305F\u8A00\u8449" } }, check: { play: "stream.word", nb: true } });
        const s = unread((b) => b.canStream);
        if (s.length) {
          const b = pick(s);
          out.push({ type: "st", cats: ["read", "game"], time: "l", title: `\u300C${b.title}\u300D\u3092\u30B9\u30C8\u30DF\u30F3\u3067\u6700\u521D\u304B\u3089\u6700\u5F8C\u307E\u3067`, how: "\u30B9\u30C8\u30DF\u30F3\u30671\u6BB5\u76EE\u304B\u3089\u901A\u3057\u3067\u30AF\u30EA\u30A2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { passage: b.pid, run: true } }, check: { play: "stream.read", passage: b.pid } });
        }
      }
      if (can("listen")) out.push({ type: "ls", cats: ["word", "chunk", "game"], time: "s", title: `\u30E9\u30F3\u30C0\u30E0\u30C1\u30E3\u30F3\u30AF(${LVN[L]})\u309210\u554F`, how: "\u58F0\u3060\u3051\u805E\u3044\u3066\u610F\u5473\u3092\u9078\u3076\u300210\u554F\u7B54\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "listen", opts: { lv: L } }, check: { play: "listen", lv: L } });
      if (can("chunkchunk")) {
        out.push({ type: "le", cats: ["lesson", "chunk"], time: "s", title: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3(\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u30921\u3064)", how: "\u30EC\u30C3\u30B9\u30F3\u3092\u6700\u5F8C\u307E\u3067\u7D42\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "lesson", lesson: "next" } }, check: { play: "cc.lesson" } });
        out.push({ type: "le2", cats: ["lesson", "chunk"], time: "l", need: 2, title: "\u82F1\u8A9E\u30EC\u30C3\u30B9\u30F3(\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u30922\u3064)", how: "\u30EC\u30C3\u30B9\u30F3\u30922\u3064\u3001\u6700\u5F8C\u307E\u3067\u7D42\u3048\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "lesson", lesson: "next" } }, check: { play: "cc.lesson" } });
        out.push({ type: "cg", cats: ["game"], time: "s", title: "\u4ECA\u30B9\u30E9\u306E\u30C1\u30E3\u30EC\u30F3\u30B8\u30921\u56DE", how: "\u30C1\u30E3\u30EC\u30F3\u30B8\u3092\u6642\u9593\u3044\u3063\u3071\u3044\u307E\u3067\u3084\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "chunkchunk", opts: { face: "arcade" } }, check: { play: "cc.game" } });
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
      const rq = unread((b) => b.canRead && core2.books.hasQ(b));
      if (rq.length) {
        const b = pick(rq);
        out.push({ type: "rq", cats: ["read"], time: "l", title: `\u300C${b.title}\u300D\u306E\u554F\u984C\u3092\u5168\u90E8\u89E3\u304F`, how: "\u30EA\u30FC\u30C7\u30A3\u30F3\u30B0\u3067\u554F\u984C\u306B\u5168\u90E8\u7B54\u3048\u3066\u300C\u7B54\u3048\u5408\u308F\u305B\u300D\u3059\u308B\u3068\u30AF\u30EA\u30A2(\u307E\u3061\u304C\u3063\u3066\u3044\u3066\u3082OK)", go: { book: b.id, view: "solve" }, check: { play: "cc.read", book: b.id, solved: true } });
      }
      return out;
    }
    function candidates(cat, time2) {
      const all = kinds(lv()), now = Date.now();
      return all.filter((x) => (cat === "any" ? !x.cats.every((c) => c === "game") : x.cats.includes(cat)) && (time2 === "any" || x.time === time2)).map((x) => [Math.min(14, (now - (H.kinds[x.type] || 0)) / DAY3) + Math.random() * 1.5, x]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
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
      if (b.canStream && can("stream")) out.push(["game", "\u30B2\u30FC\u30E0\u3067\u8AAD\u3080(Story\u30DF\u30F3\u30B0\uFF01)", { kind: "task", type: "task", cats: ["read"], title: `\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${b.title}\u300D\u3092\u30B9\u30C8\u30DF\u30F3\u3067\u6700\u521D\u304B\u3089\u6700\u5F8C\u307E\u3067`, how: "\u30B9\u30C8\u30DF\u30F3\u30671\u6BB5\u76EE\u304B\u3089\u901A\u3057\u3067\u30AF\u30EA\u30A2\u3059\u308B\u3068\u30AF\u30EA\u30A2", go: { game: "stream", opts: { passage: b.pid, run: true } }, check: { play: "stream.read", passage: b.pid } }]);
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
      if (M && !M.done && M.date === today()) return sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><p class="cs-note">\u3044\u307E\u306E\u30DF\u30C3\u30B7\u30E7\u30F3</p><div class="cs-mis"><b>${esc11(M.title)}</b><small>${esc11(M.how)}${M.need > 1 ? `(${M.got || 0}/${M.need})` : ""}</small></div>${btns([["go", "\u3064\u3065\u3051\u308B", "cs-go"], ["drop", "\u3084\u3081\u3066\u3001\u307B\u304B\u306E\u3053\u3068\u306B\u3059\u308B"]])}`, (ov, close) => on(ov, close, { go: () => go(M), drop: () => {
        M = null;
        save();
        open(o);
      } }));
      const t = task();
      if (t && !core2.member.today().task && !o.skipTask) {
        const ways = taskWays(t);
        return sheet(`<h3>\u4ECA\u65E5\u306A\u306B\u3059\u308B?</h3><div class="cs-mis"><b>\u4ECA\u65E5\u306E\u8AB2\u984C:\u300C${esc11(t.title)}\u300D</b><small>${esc11(t.ja || "")} \u30FB \u30AF\u30EA\u30A2\u3067\u30B3\u30A4\u30F3 +${core2.member.coinPreview(core2.econ.daily.task)}</small></div><p class="cs-note">\u3069\u3046\u3084\u3063\u3066\u8AAD\u3080?</p>${btns([...ways.map((w) => [w[0], w[1], "cs-go"]), ["other", "\u307B\u304B\u306E\u3053\u3068\u3092\u3059\u308B"]])}`, (ov, close) => on(ov, close, { ...Object.fromEntries(ways.map((w) => [w[0], () => begin(w[2])])), other: () => open({ ...o, skipTask: true }) }));
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
      sheet(`<h3>\u3053\u308C\u3067\u3044\u3044?</h3><div class="cs-mis"><b>${esc11(m.title)}</b><small>${esc11(m.how)}</small></div>${btns([["ok", "\u306F\u3058\u3081\u308B", "cs-go"], ...list.length > 1 ? [["next", "\u307B\u304B\u306E\u306B\u3059\u308B"]] : [], ["back", "\u3048\u3089\u3073\u306A\u304A\u3059"]])}`, (ov, close) => on(ov, close, {
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
      sheet(`<h3>\u30DF\u30C3\u30B7\u30E7\u30F3\u30AF\u30EA\u30A2!</h3><div class="cs-mis"><b>${esc11(last.title)}</b><small>${coins ? `\u4ECA\u65E5\u306E\u8AB2\u984C\u306E\u30B3\u30A4\u30F3 +${coins}` : "\u3088\u304F\u3067\u304D\u307E\u3057\u305F"}</small></div><p class="cs-note">\u3053\u308C\u304B\u3089\u3069\u3046\u3057\u307E\u3059\u304B?</p>
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
      const runs = Object.entries(sv.best || {}).filter(([, b]) => b && b.run).map(([id, b]) => `<li><span>\u30B9\u30C8\u30DF\u30F3 ${esc11(id)} \u901A\u3057</span><b>${b.run.time}\u79D2 ${b.run.rank}</b></li>`);
      const chal = Object.entries(cs.bestTimed || {}).flatMap(([band, o]) => Object.entries(o || {}).map(([sec, v]) => `<li><span>\u30C1\u30E3\u30EC\u30F3\u30B8 ${sec}\u79D2(${esc11(band)})</span><b>${v}\u70B9</b></li>`));
      const cards = Object.entries(vs).map(([id, r]) => `<li><span>\u30AB\u30FC\u30C9 ${esc11(OPPN[id] || id)}</span><b>${r.w}\u52DD ${r.l}\u6557</b></li>`);
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
    core2.eigo = createEigoInbox();
    core2.notebook = createNotebook();
    importOld(core2.notebook);
    core2.record = createRecord(core2.events, core2.notebook);
    core2.daylog = createDayLog(core2);
    core2.learn = createLearn(core2.events);
    core2.ui = createUI(core2);
    core2.study = createStudy(core2);
    core2.roletest = createRoleTest(core2);
    core2.drill = createDrill(core2);
    core2.econ = ECON;
    core2.ai = createAI();
    core2.level = createLevel(core2);
    core2.useit = createUseit(core2);
    core2.mission = createMission(core2);
    core2.review = createReview(core2);
    core2.aloud = createAloud(core2);
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
  var view_default = '<div id="app">\n <div class="view" data-view="play">\n  <div class="top"><h1>\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC<small>\u8A66\u4F5C7</small></h1><div class="seg lvseg" id="lvl"><span class="lvlab">Lv</span><button data-l="1">1</button><button data-l="2">2</button><button data-l="3">3</button><button data-l="4">4</button><button data-l="5">5</button><button data-l="6">\u221E</button></div><button class="ib rs" id="bUndo" aria-label="\u6700\u521D\u304B\u3089">\u27F2<small>\u6700\u521D\u304B\u3089</small></button></div>\n  <div class="bar"><div id="chunks"></div><div class="barside"><button class="ib" id="sayall" aria-label="\u6587\u3092\u8AAD\u3080">\u{1F50A}</button><button class="ib" id="finish" disabled>\u5B8C\u6210</button></div></div>\n  <div id="barnote"></div>\n  <div id="ttsnote" hidden>\u{1F507} \u3053\u306E\u753B\u9762\u3067\u306F\u97F3\u304C\u51FA\u306A\u3044\u3088\u3046\u3067\u3059\u3002\u53F3\u4E0A\u306E\u5171\u6709\u30E1\u30CB\u30E5\u30FC\u306A\u3069\u304B\u3089<b>\u30D6\u30E9\u30A6\u30B6\uFF08Chrome\u306A\u3069\uFF09\u3067\u958B\u304F</b>\u3068\u82F1\u8A9E\u304C\u8AAD\u307F\u4E0A\u3052\u3089\u308C\u307E\u3059\u3002<button onclick="this.parentNode.hidden=true">\xD7</button></div>\n  <div id="canvas"><div id="sidebg"><div class="l"></div><div class="r"></div></div><div id="csent"></div><div id="scene"><div id="bg"></div><div id="sky"></div></div><div id="tline"><div class="track"><div class="tvis"></div><i class="nowl"></i><span class="nowt">\u4ECA</span><span class="tend l">\u524D</span><span class="tend r">\u5148</span><div class="knob"></div></div><div class="tstops"></div><div class="tlock"></div><button class="tmore">\uFF0B \u307B\u304B\u306E\u6642\u5236</button></div><div id="idle"></div></div>\n </div>\n <div class="view page" data-view="prac" id="prac" hidden></div>\n <div class="view page" data-view="reg" id="reg" hidden></div>\n <div class="view page" data-view="sets" id="sets" hidden></div>\n <div class="view page" data-view="settings" id="settings" hidden></div>\n <nav class="nav"><button data-v="make" data-i18n="nav.make"><span>\u{1F3A8}</span>\u3064\u304F\u308B</button><button data-v="prac" data-i18n="nav.prac"><span>\u{1F3AF}</span>\u308C\u3093\u3057\u3085\u3046</button><button data-v="reg" data-i18n="nav.reg"><span>\u2795</span>\u3053\u3068\u3070\u767B\u9332</button><button data-v="sets" data-i18n="nav.sets"><span>\u{1F4DA}</span>\u30BB\u30C3\u30C8</button><button data-v="settings" data-i18n="nav.settings"><span>\u2699\uFE0F</span>\u8A2D\u5B9A</button></nav>\n</div>\n<div id="toast"></div>\n';

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

  // games/eigonou/episode-frame.js
  var safeJSON = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  async function mountEpisodeFrame(el, ctx) {
    const token = crypto.randomUUID(), base = new URL(ctx.base, location.href).href;
    const asset = (name) => {
      const url = new URL(name, base), config = ctx.core.config || {};
      const version = config.hashes?.["g/eigonou/" + name] || config.build;
      if (version) url.searchParams.set("v", version);
      return url.href;
    };
    const frame = document.createElement("iframe");
    frame.title = "\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC\uFF1Awant to \u306E\u4F53\u9A13";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;background:#fff";
    const origin = location.origin === "null" ? "*" : location.origin;
    let ready = false, timer = 0, disposed = false;
    let resolveReady, rejectReady;
    const started = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    function cleanup() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
      ctx.showBack(true);
      ctx.core.speech.stop();
    }
    function receive(e) {
      if (disposed || e.source !== frame.contentWindow || e.origin !== "null" || e.data?.token !== token) return;
      const d = e.data;
      if (d.type === "ready") {
        ready = true;
        clearTimeout(timer);
        resolveReady();
      } else if (d.type === "error") {
        if (!ready) rejectReady(new Error("\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC\u306E\u4F53\u9A13\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F"));
      } else if (d.type === "speak" && typeof d.text === "string") ctx.core.speech.speak(d.text.slice(0, 300), { rate: 0.9 });
      else if (d.type === "finish" && ready) {
        ctx.report("episode_practice", { exercise: "want-to" });
        ctx.exit();
      } else if (d.type === "exit") ctx.exit();
    }
    window.addEventListener("message", receive);
    frame.srcdoc = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="${asset("eigo.css")}"><style>html,body{margin:0;height:100%;overflow:hidden}#episode-eigo-root{height:100%;position:relative}</style></head><body><div id="episode-eigo-root" class="ct-eigo"></div><script>
  const token=${safeJSON(token)}, target=${safeJSON(origin)};
  const send=(type,extra={})=>parent.postMessage({token,type,...extra},target);
  window.addEventListener('error',()=>send('error'));
  const memory=new Map();
  const store={get:k=>memory.has(k)?JSON.parse(memory.get(k)):null,set:(k,v)=>memory.set(k,JSON.stringify(v)),remove:k=>memory.delete(k)};
  const ctx={store,core:{speech:{speak:t=>send('speak',{text:t}),stop:()=>{}},eigo:{count:()=>0},ai:{ready:false}},report:()=>{},opts:{},base:${safeJSON(base)}};
  document.getElementById('episode-eigo-root').innerHTML=${safeJSON(view_default)};
  const script=document.createElement('script');
  const go=()=>{try{Promise.resolve(window.__EIGONOU.start(document.getElementById('episode-eigo-root'),ctx)).then(()=>{window.__EIGONOU.practice({finish:()=>send('finish'),exit:()=>send('exit')});send('ready')}).catch(()=>send('error'))}catch(e){send('error')}};
  script.src=${safeJSON(asset("eigo.js"))};script.onerror=()=>send('error');script.onload=go;document.head.appendChild(script);
  <\/script></body></html>`;
    el.appendChild(frame);
    ctx.showBack(false);
    timer = setTimeout(() => rejectReady(new Error("\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC\u306E\u4F53\u9A13\u306E\u8AAD\u307F\u8FBC\u307F\u304C\u6642\u9593\u5207\u308C\u306B\u306A\u308A\u307E\u3057\u305F")), 3e4);
    try {
      await started;
    } catch (e) {
      cleanup();
      throw e;
    }
    return { unmount: cleanup };
  }

  // games/eigonou/prefetch.js
  var P = null;
  function prefetchEigo(base) {
    if (P) return P;
    try {
      fetch(base + "eigo.css").catch(() => {
      });
      P = fetch(versioned(base + "eigo.js")).then((r) => r.ok ? r.text() : null).catch(() => null).then((t) => {
        if (!t) P = null;
        return t;
      });
    } catch (e) {
      P = null;
    }
    return P;
  }

  // core/logos.js
  var LOGO = {
    town: "data:image/webp;base64,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",
    story: "data:image/webp;base64,UklGRiSeAABXRUJQVlA4WAoAAAAQAAAAywEAzQAAQUxQSEw4AAABCYiRbIVt5t57IXwD/RcMwkoqiOj/BHD5s4A8A7T+t09rTTbtsTdC+7u1OK/NfgBa/Ng4N59Pt5K4A2J7rcVzSx581+0XstbkOslhzi9k/mH6ofc7ev4DajHQ+52S9yY/Uo3R3XLS1Zi2XqNbrUZbtiSAAYwtVuDCttW8mYTEYoxR/ikVNoB9cjSs35RE1GSkDYhjC8YsV82qE4c9tlosgN9pqkBOfJymV/Wq9eSDuJcESwIEttfHtlft7pK2BEjE1MNiSpQt8MIbm908l/aHYn9SmSH7gMG3DPnJIxiqQAKnwFB2tNXGYcTWsJRsZ5OMMQAGEmBDBwyGrGUn2D58PpCcrjNmcW2+tJMGFb5dogZbfTTWEt9voV6wt/Pg1XXIG9iekwnmzc6epF6Za87J6+l/s7+HTvOdy7xinxLm/OJz11r7wjwm4fsAfvhLhoQ2kgRJqjB/1l3ds39PICImYB6rXKvob6pyr5z5C2XtZO4q6wLN4zH3lHkmOl3LXvN8fKZqXnX795qv+jPfadW8x68QbGZmurt+8MvQ6pyZI/lxLwgF+cupyGMPPTUzR0cHljmX9xkRHIlZQsv60vYYpEhHULm3PVZkD1US5J7ecr2hnN1quYb8sGOPyueCmYcu97x2FPq4zcxSmo+0z2ctZxW9k71fKvq53OaX9C/1/7ou1lRzmhn4AU+eO82MPTlnxsw4H6SPlMc6HnuEFNu2q2hvGEYNuIjCmOMCZ4hI3S5O1b33TyMmYAK8Yf9/zo3/f7f786Wxk4ltt0m7WyzabvdtfvS1bdu2bdvm27axZs2gDSavx4WZpskkM83FiJgAb9i2LZbb2tp1V5MYbZkhbFQMMw5PZmZmZmZmhpUZZnAyQ8t2zI5ZktnCllrcgiapeTBW1f1jQNWo0UryMyImgOhQBmTKk2NdJzvye85XR48UzEorMB5XYL7CLAxc1Dkyd3JyMJkOw2KjfviB+2e0ggijPgj3FtZplXScBEp2Dp+YW+wp+8JAEJ156L4RrxQykLIdvj855e/p3L4C+YXIHBdLoFRpcur0xHAukhkSGCuuPr+GFVFAmExPdA0vp11vn7cX505V4uMHFo+bdkDHPgK83My5ufn+YoQBiMZGtQD3n4By79SJykxvuuAhHtNQKuQOTfXCwxgd5wjwCr0rp88slnxnJsSebWGr70j0PPP7zw71RL7DTDy2kRxODA1WN9cexMc2AohKJy+fmemJfTMkHttg+kuQnPqlf+Vf//uyMzAk9tEYuSBXzoYP1wLQsQwEXXNnnz7ZkzTMhNhPg6J8tY9ITP/Sf/g//vovOYcJcYAGU5DOBhf6Ao5ZJSCRGx0ezo9WIs9MiNSt2ui4+0OQGDxz+XRvKAPRc2NROX95pTtAxycCXGJwaTS1uwEYiANVNDees/rACAfPvni6J8SEyKYhPXz+8nSAfYVEoGx1cbhqD3exGCEO3EdfKNGHLjXw3Ome0EyIprXNUsMjyZQXqZ10fCEgyE5feGb2wRZmsXM0oc35x8adNeF1LA1XIkwSTe1kuMJS59G4Xb10HCFw5b7ls6fGsobFDkeTKnz2IZQxUpPjQ+nYxGEU0WD50wtuU2TbAB0zSODKJy6fn+g2LEaO5rVGPzzgbHmV/HQJicNR744WaHuho9C5I3ZBxwYCSA9OXzzfHYAZoqkdLH52BGUpOPmHkoFAHFKB5HajXXPz1dk8FQc6FpAhKA49d3m+HGMGUrOp/E6RZX/l7/wfnyPScqlcdbp/+JecLjuOAQUuqi4/MzXXHZgJ0YdiuyxrHkEglGksUFzKaGNt09Qa1MBKZrXxhUuQrE6eP/30SEqYEP0oC8Y/mEHNYlZeY7kom+HOjV078gRYA9KgvXwhEkBi+PyLS8PZBIA4tOr58JSz5rFBpQA2c1Fm7VvX3REmMBomI2Djazc60ezJGhCVYwCpxaCgY/j0C3NZMEAcXpk/u+DRpDJiJRbC1W7dLduRJMAAzyV7k0QLYw62bN9CUk8dqoIWds8tzMUYqGUIlJ166qmzQ6FZDOKwFxbKTSNWamF4QQUlQiQdITLqE3nXMZcpn67g9XYIgiElIm4aKE/kxw43SlvxNoDqEwbZqUsXZ/NgsZzEIRepcyf9ZpBtVnIhUf3pcx4G0hEgUR8Gnf3+8HKqPJPxcz5g1FsJjGgrSpV4vLuYKNV2dgGpOAg7R5+7OAqYOYmj0I2fSaMDM229ctVr5e/+wnz/aFnGoReAyxWLiz2j81Gu6ssDMwGI9I0JIN3ZPXWyXLCjA1Quw6U6T724PAAWI0kciZae6aEpDWKF737vaPUX/8k/9LG5QgDqFwkgTFeWO8aXSiPlMBJmwoRoRhuTly1XB/ue7k4OBKgoVJo7M7MylAAQdZo3O+XswIxQvgHkuDA/NvbyntnQDgk4V+iZmeuYv2zdpkGwEYgsGyxZA9W0ra/vmB1Jrjh38eJ0NsCQOFo75/MctLhAGiwRVk7vemyv33wClK3O9A6tDHVHfoAtEH1pMF4im/azO9ERI4x0//DTF2fyngHiaJXllqvoIMLZPBdQgwXl8R1DoZpJArxk/8yZc9PdyawzsED0sWW4qDyaO9PnHymQHDl/abq76MwkjlyZNzrt20Hk95wD3EWrLbk4Ot2hphFAtmv23FMr1bQvzIToeyHDS6affqo77Y4KmZ/uP3v5VHdomMRRLPoWkyi9ZmWpDqJXYxKT4wPpZpAAl+5eWHlubjACMySOSEkYUWn8/GR0RLiu5VNzJ3pCMyGOaEstDmFpibEpgbngGvmlE13NAC7VN33+9EpPwrAYEEerjOzimYGitwIoMfEz7xtJ+pgQR7UIls+nSSg1EBY9No25EBtzmUg6EAHKdi6demahN2NYDE7iqBXCzwyezLv/yu/92PlOGYgj3bpOl1A3wizwoFYjeepgXVyYhcxklpoAL9k/ffbc/HCAmZlzEkeyMEtUEwyozywxXFoDJFTvtt9eo0vDq0x8rA97/Qfh6Q9v0dpNygIylZHJzsyNoi8zJJQucHEya4dJgAQI1QtF169045VP/Nyf+8s6FV95PZzoMaylpSsg6J8YHGZ1C8yQOOpbCrNldHgMMIDQoVu/1oU3cvHiubECQCwZbaAT4ZUGT14q3t4xLBaI1ugCD+xQAUKDws9uDXfyhydzzmLRNhp1Ul1y7PSpZ8bSYDFytE4z49BKZg26TD/YitrhZEi0kUKABCiqTp66eKLiYzHO0VoFZnY4Eg9oqeY9uM3tBCDaSsWlCjJIVCbOnH560AczJ9Ga1QeyyZfiViK84McDBJh2tHnkWBREpZml55fG8obFSKJ1K3MkftY7WAsBvH+7xGosN9SWeP5k7eYLTy+PZRwYSLRuxbmSMzcwuWVqJSJ69oRv6Wefz7Yjxs/vuGGlEjozITTfLO02XbgEsWslmMZOJBh+oWrtCKZWWxsaJkT77p3MW1PJMkMbtNz0Qk/qmZWwXUE2IdrC3FRhs6lgpLBrrrXIwrmRgYvdprYEDKJtTHWmmqyUJG4xQNdif2/Qtnxp6fV0bsVqppZsxaWKOB4Ns5sPaGYz13KENzXr0DGIIOPdjZWhqxuDYasBxpbuP8SOP8DCndc2mkdsdQ25FhRs3ykGpuMPoZGlwJCaA9zEfGhqMULx3USKYxBknTN5BKg5YsoJWq/CK69xTBqdHMFl0rW4OWyVnEOtBrf+lauhjkFk3tBkYvgXv89bfRg3A1sbmchoscJl7r0Re3b8YVCYXfrVf/7FSrB+fbMJxGZHt5NaCxBtfvorHseg2vnx2s/9g+/JBVn3g1e8g4PdXE9Aq5G5m5/5vDv+MGpf/4d86HJWON25Pew1QW0tkaT1yl+7ZscVbiNat7//7XeuTHhgkBj27eB4kO7zTa3GqpeGiwJ/5cFGNqbt7hvXq0M5CYQLQL2LUwPJFuRPjI4BCH85ZwhDYHVuAS8dOd/BcMXe8tjOhlEv2b2SrQcZ0WIlqz79bCTC83nJ9pcT7kLpuRUw2LKIhrv4tI3Hn91xrgvwovz1b92t1YGlHsFDehPWYpDln398QdQPHVmsKgB/WWCwgi5iUCoGTFvd+HJ5OWpw/Vp3DFiLnz+TizogAFt/49XrakBjudErC4dySL2ABj/6dIzLcy8/fzbX5Et/YwKkqNh8RGoAQCmAFyabarFXfvisZ6rzX7MoAFTMO6ATCFB8P+z2ECi391yveKicZ61G+P/w4SZWPPPiA58+FoPaOWMkN4sTlfLRuUb+bA4E4DZubVc6Nhm5Tc8HRjwadqx8N46x4+HrTYoqjncIcHN6vJTa3uzMtBzD/uYDTcDUzz5xZvXwl24GBC4Wc0cnZysjW4YaueqnHhurDkp0bWNRYN0ArRpANNbgcrTQDJbH66tI09xTl1MWDuqjJ1cygoFOWqzB7V9/XwtI4arbXgGoHTOCZrN0avH4fg9tGKDrxz72/vv2HSkPdwjn8rGI4bLLt62ivQABMtS9eeLY1L371g2hFLDcbLFF8dKRDSgBW5b3sZaCqqOvQC025/7wx/dh2nJ7cTk8PjZ/4Fx+MTQId7G0/52/9Gv/ejBup3hqITewOoCLtw2DANGtUOnmv/7K7qVeM4kFg5duARDqPlHiYLW7ns/TYqO9p4dNx/CBb/vzadq08NDh+adHC8sxCEz3Kp8+fKpKew+59NLBgfXnqgZEcjvM/b9Pv3AaI0WhdWtEvfnz09jBUOsa8FpMeDqk2/l/+/Z7mlhb5mJx8dDckSP5qbJD071NMCB1QAHnnhxtjl4EEunma3fPZcylYYgi6oU6OzwOuGbFsKVYQ9uDVV3Ypz/4UIW23AjCcHZu7uXF4osnou6QbYPaCPDcS3tGfl6kbDK9QREj3Whu0XVAZiJ/ULYaFmQtwS2WovrASBdbt1+1phmj1mPUd2AAEZbC8iOPjJ8puYvauRJdC4gXn49/A5wOaGj8PigVlWZDNZDlFssow3Z+hNYAWAHNgy9sonNwy09et2qAlmsQRtlxOyUCDJYgf/7Yow+fiTvN7VlSV211ZNd31EXqyU6zfTHRseOrOnkJjwO30o6sJfjs0a3X6PRLG+l28xWrbNRiDFTjNcqOAeF02tpI4dSnP3y6w+Dx86FTWLyLM7LTEfUiDeX2lod4pHHgslW7LY5Ct1Eqbkfpud0NDWyic+RWiRZrqJw8ePUbR0jfbdRiQLFLc1u34DZKAbDlmTs/3OHS52uBnYjmR++6vy7SNPUS+2j52MKNa6060/bNzYMi6Pl5YgVJ1SDVbT3znqcrUdRBdiYniwuvieaffPBw6B4JoxY1q7lK/cnNb942JIn9F9ioZeA7Tpjkpvmp9x5cuNJp9FAovbaRcbS1cusavZARdJ+6/PxWa0VwYaEpbCeC7R/+YBOg/sw7H6+oixePB+aCNHF5rmZ64pzWMAxI5ePji4OsPn1qzRXVoS996faBgADpmv8pBk6GfeLQ+lUmucHL81Faqd6dMKKhoXJ52AuC7lOXzw2nWBntucnJmbpE8sanf+kfvyaA+jP/+0SlA1weu3DYdger+PlLA+gJ4axzc1dduYqwcPz+mZGtgyJfWH75xO//nd+MAUsFg7Bhw288HisVbAKSGzj37EkrFSidGkqrEUQn16K0ZEH3qcvnhlMclSYannnihckaGHBbwKr+u398VRhA7dl3vdBoJ1ve5QuFAbvT0jMBPTZhfP7Q0YveEi/uPTunYQGiMXtg89qOOFBDoDs+9/9I1aRoZGDm/75QCJxS2N0bgtoEi0+U0nM9py+fH04bKANuoxiD4eRzT04HbcCmVV6zff6nqkbD2r4DHSAzFl0oIL9sbNEa2b0Dcl+8+4ojhemaAGEQ4dKlp0rODOMOBuT2tOajP7jvm51KymFM/fS9D54KSHn75TfMIQATHni6QboiOf2z3jucwoTovUGm9waoza5/zbANRBPTboGhsLMampcOBcQhXa8sBjuZbeGZOz98xiAwKKD3BnL33XN4CEx7A17X1NjQ/de3JdoaUCMcASRa/VL1//55W3aaowca+Rd2v3rNqjQEXP30DSEaqvzcUdKufPBjZyqYRBMaqObWre9dq8Urv3YrrfUjZ2krERsWzY9tNYn7z6iDwQi7OxuBojPHdj80Q1tHCPUMDPl9P3gV3dtQ50J47cpcwy1Gcb5G9fIBlY5ONYXJ37v6394UkN3Sg8/XysGNqwMrjSC8ciVyNDazh8sphb3v/+WzngnRhAZmXhy4gywa8JprNzZARLVQbVoF3vJHX2MlkOhzI4zaUC/GjfN5cOwupGhhLhwaeM1v/sblDUCwfGpkrckGfPVGwF2A8BIDE+88fqCqNvnDp6+9fnDNCIsvvHzgXFPFez5167eNODtDt779P3JctT0g3YH5G2GCxlbtpX2RUtHAUtoQIqMbE+MHZ5o4AwggbjzdcDNEwp0Av+qnWAGdJCoWInCLSvNheffApWEQYLfYREvHdr1QDizi+sBwY2omXHj4kMioaSu6t6W5z50+WKRl1fldB6vrBhkgGohffno2bJw6WhMZtsLi3e9bf2HYSiZzmfX1tEx1Jpg8MkKqUqkagMiqbu2bDaVsAFbl0C/sLB6ZtEm66hqrz2xkuwtT+MKHTsRgg9dfMkTl6k1HpxprwbRGE0/urZZDZEu4OffIfXd+ZHmNM5K6Yd6NuCW8elM5lpFgYLA8tXz6zOGanCEZHfGt1MRdkWrk3QgiGjuo7TdKwVWHQswwmlIA2+XIJqu2Gs/87l8dPzpPLw2ykZ0BdwX1Cl2b6ksv5UG0Dq2TBtZy7J4XrmwAGFbNHCuvGcSi1X7lhrvfNRbR56ZVQPgyAwJMq1F09PhUlClARmFgixRlLr2+nhZqgCaPrMIpeCNTIUI0pYHvC0SGhfZFn/j0OE4kkO0WiBvBCAg7BYPdzkbY3Sy9PFaXOwHBK65muQxIQgKaR54YPt0C+e2rY7o1m7/hm7Yocp+BsUHxvt/cNw+ILocmTfY1loidAiT8G2GCxg7q+2PSNIUhTSssHO8Gk+k4mP310X8YDewkOCo0wTZo9un45tUcn43SACRsWl2s0a3W1g6V6NZoZCTY+jrRdXR2am8Nm/Clq4fk7rzpe3/l0n3jMe43pFqh8rF/OFEB02VwcwmcMSMxvAVKJFxmbSMta4Qmj6xKBcyaSBTmu2h2BxM/tv/T8yKxqRw/E0tgPDh779Dqte/dVcWJTPH8fKFJWy/un1c33nDHm9aiLgDHQ9/2y+6OcH5LJKPq+VpM4k3f/OYX7s3LzoZROoA5/vkzM28syXS/iYxbdk0DQw+NNCP/pp9AAiTV9oGcxOqEmgaKC1WnpuPpqz77xQgngvDioeb0RN3AlhtKR6/7mlo+JM3K2CMfG40Ba7BUDehSeNM1q0zXAl16LUl9R7kq6geZVxIRX/6j1z78TEU4A6atUrGDF/5g/w8+FIquBShbaPtHyTMZYiUzl1lbTwvRUJNHRzCJzQCjac0b6Y+NptOOqx88glMwV12tw3d+9PnKmvj4F+vf+2O3bxvEaQyvrTxzMAQYvuLai4e7QaRowKg7B/GTuyqNlx7bWCWxGLr+lQff/WSFLJpGPKK0CD/5M5WPfVzuDkTWdfNK9zM3eHyJyL8RRDQU1A7EJHYgQGQoPjlz08XOHDN7Nt2+1koDafbAAw8uV9BV26/cMmBS9jaPhAioeZg+FKxZvHfryNSv3gBOZOmLS6/8hYcX5Qw8f/eSwKkMvuFN+RO5OFn6tlOx119bn1+9OgVw6bX1jEMNzJ98vJrIvCqAya5VmLhom1DmiCVIAQSikot2xbr4qqHYpGtgC6yFPbvr/YC8dtPDj/h7vt8msSz19KTs7V9OePjqx35vWoBSCLZet2rfhMigW4yEnQLBlssWzgSBk5lEcCNMIBoq/ewoSlJzMy3ZrhQ3jTg1t2ifWkWqBhOHD0WAhNJBALZKH77zAP1pqXJoy08up4GlKq7rxZsD5OU11xU/XgdjJ5Di9bdtPT1ZI4MWArmaK8VpmA216cogUjKXWVtPy2hoQf7RKknVOVYGZcsAIk1jgpYYocfpsUCFI3kEiB5r4m8/OS33BYZVX7M6SsXLk16Z3VlJGSAY4jTGSLgbQ+GVryzvWRbunViabkLjs/9+bwEnMr5kKb9+xCJ55N8IEjQUpBIHUHeKd4fGwKwMRlApRi6bxkBZwlA5d5HJokqn7qrRJ4wEV7wutEksnJc6MZUApIiRaI2BxRNLUVcCum+PjsxHJoM+//iBJgzc+f92VFKA/Lap8yOBSRwrs76eFmoUZLerJM5WQlZMUxhfOnGgllicG+ryQVlCMLQ2I9X190b9oqsvW7tErEQm2HyrazIJhKiJi+drov38rp2zEbLb1WcvOneoLtw71XeeFsDRPRWZpLb3Fs7UBkhu7N8IIh6dTqyRdMcNFllBopc/uH9hvulV+k6//2wOBLiNeodBZKOwaYa+veSm4YYDktrK7q4WUxy8Si8+n6djnBsfPzTdRN3gehVEjwX+0VPDCFadmIrSUP7OqXEPWolQbm0946yRebntjSTmV4oOrxzxmS8+W/HEm1ub0clf+/6cLSwiD2YCgTJBvMm4TzxyW8NWMpzb6S6AlOKbLi3HnQSFl548Wzc2YGh32wLTey/asVlYwatORCQ37P3XyeVBkdh4/80ggQRISifWakqwmRhMGnUaysthePzE+b2zhVf8+jevFxCXDx6MxApqABRz20QyrYmMJu5fs32Y3pvenzqfelTb7NPvf3YybbawJ4/WZTKowekRC0ezx5fBSQxTjy6MF4ZJLFxmfS0tREM/t7NB96qtRWlxtAgIw9JEbuzktV/76nAkXDoytntf7JUkqybVlKD54v6rNhtlIPncr3/K35PM71j5ORfKAYh48kxTJDcoCf1Dgwbye6ZJtfb4c8O5gcCJIPJv+BENBelotfYYdv9B1sepDsAYgVwpl+GoT+wemxiuckG0unBMPLvkFNK1Of3E+hsGLHpvS5z7YAfaQ3048+LZHQfKAY5ikpv26kZ4DqB29mwtBcPpx6uXBesDKYFQZ7SZcaiBebmdDerVibfuRDKOYGMCiMtnT7x87/FwK+AVz8gWIDACH//UfnAWTLB079MXXUpGLXt2lMcU5Lp//yNzotVJDNSaI+oOUa+ZvXnZyYLarsO8JhwyyYNymIwQDZWKVmsCTJdXdj0OpXvWaiPFlYWH79mtZsiKb6LG0NBu7FHv2uEP/N9UTEabu5+aCpQRoXz6cRqOzly0tU1yz+/bv3DdNoy6aOhmYTkUia34xFONka+KA5RA4D3cSDqjoQX52gb1699w00i74HU5U/MZ7AyAAbl46CMPj87KXtlMNLbryquvh8t5gS3d+8+fOTG6oAwYwt0P4XwJnIV6ezwZGy+/9Sql4tn77js9v/q21aKjHpE7tBSQooO5eyYYWDWJnQD8tR/HEQ2F2LxXa3Dtv3/4bUNtiqsBh9FxNcpGa0wQjr776I6icFq2WtRvmv/fj2/Yer/04ee6sLc/8O93z5eO5siig3N3nVK4f19TOBO2WXs8gt7t120cJk3l79spigcdDAzISDxauWMFcBJJtReeQ+HU3VXZCVzaSDvUwJLBO/dpuO6HHrrzbcMtqauBHQJrefcczgq2woO33vNIEZyGQbg5EPSbrZ1//hzgdy50Y2+940Ddjox7Zlh68jDy+N0HQ3AudtvffeMxZEqf+cnL1tsohZ3RR4w8v2fn0fLAgBpn1x7lOCLdsXsM5P7zMCKhv3k9nzAe2dG/awI/xut++ME73yxgtF8cityRS7dlB4QwFinH91ZvvXOc/vfRwwRgAkFMay1aQ69lSmVTvlH55Df/2r4wA84UXphD3RjqmhztDhBpWubBKq0Lib4zLyzz9f937VFtnULvch7Y+U/f8gfHYndhYNWZh3NqZ/T2J7ZA9Hz8dAjZ93y8gpgcEWo+7KnwYqHMdGxxCrr6P3/oLc71n4pjs2CQAWTgdO6GwD2CaG5MAIsf/sbfOubeKag9c2iAzgJXGZocD0lTAJpWGyDqH+flt7cBqdgzZINIKChOdHoCbrz7e99Xxh1sQXHXEUttUP0L30aIQik0sOzzS54R+BxK6/TekWHjTNlGIrnxyjcUfvAVcp85mNnRoFsDLNa30fuot0zDaMe/7c+A6fS9Obp15flLKzkfUDKQ4zGFAZh5Y7MjIlU3PhsY4FVes/hClfYGxaIyWcZ0mPq/GwDqSSEJTVwqI0CHo/jQicuHjLJE+fTwDetSgM0aYWE96jOiQ0dI7tpgz4Kufp+Gg2/8nqEqPRP1nWOoRRiuMv/C81M5GSJF8/t6tDfROIhcOk2q5vePZwRY/unvesMg7qKyDzAdrPr+b1OfODsqQGQXu8HjcJpw10tXr7PIsoo7R/7oxmTmtu5l6e5YY/rb1J+fQAlM/fj6nkVT440cXHX9WnqH9u0IAAFkBobPXZjKORP7Kovmht3e6oXC8Uk/JlVZNDdEvSW6NgzRRfP45/7HprNh4tgDQEQLeaszjSyENp48HFjzLy0NkPH41NXvfGMydOelFKXiiNVnKh2ZS4TCibV2DwSDS6lAdRI2GRR3lWgblHrPXpzoycuMfQKXCthHdU+Odnvst5JhA8xsRFtTvf/P90XqZAYWdmygQf9iSL2sczhgNm06HES5MjLOEuF1P351MtPOugeOfo91fPcAKUaR5fSAoWK+Tma0qjcCQ4sAweYbxk/NTHYFZiax72ZRpK6EufLg5HjEfhtijxJdeurxreflDtA4NKk6NLcSmqgP+kpE4hAbJOGsGIbXDCiRWHUOQP1lc/oASmSWZoqih6qcjX7+x0sYNOqxiCpJAQxe/91fP1xJgwlxgNHwz/rZ1Vw3qLx4aSXvAdqXdNFZnZnE3o0KwRHaGwXHXlwHIApnOmkoi5aG6V+3cVxtZgewSDE8PCxh3F+oZzzciwTIwP9ZRXpoSVf+yyM/t1lk1Br74P0e4A3MDgTGEmkbIDdw+Y/8n99QVQOBl6usPD+1ITAiuUBjiwkEYIMT4CV1AO78v0+uAyb/1IHIagGtX0XYNx2bh8+EyLHVHGla8TJg0+fWUHqTR5sRuJ0YmftZ7kGwcesAg7e//7Hvb4TKCI3puyYc4DmzECkbkoRR6F74C5/49dU6wxWXf9ZKT14WaRpQqYTJIlpFQtP16n/9p9eo95EnltRBYE5U5X4Kz4+NHz1bUyAT6FBQ9xXr4vEzVbmv4Llx9hhU53527uUf3V5LDP3S9el56IbrBmHwtvf8UaOWGXHuT487MIToYW1tx8uEYJr+C5/45RnAlRcuvXipV0AqokX5Dt+unmjImF7ozX/zrVqD/FOjkUS3Y2X6uf7sX3x+cfSxZ88UmoGBIWVPpSt+/JXN5x6IRF/L89VHqXL2F/7s35x56+Wvv1S9cG69lZqiciwY3P6W4Zis2vzfX5sxQPT0+jfvVk5UDOGm/vhvK5GZOXfpwlTeB0Sapm3y43/k7M7n9zaF6G2QcNRraXQJOril7j4yU//1Z2dfuXbmxUc+v3O8mnEOLLadLW96+7Z48NL51VY/mbC6gxoFMxfPDVaw3TuryUpID5tHjjRBGhgS2TW/6MNJDv7e/ajQlwJw+YWx/PCzv+Anp/LOOEgJog//t3/c9cnzotfWt5xCAGHTmM4xiL402Db5c2/6h3/+wdcGk4/fNXK6r38sjLKByLhXbyQe3ExAZo1SgOa89wgjncJimQRGuqpTXKqCUWt2cCrFwZs3NRMYgPlT8yPPXF4ZLrrYkPZHLYDI/ux//4E363KvSHSk2GMnhWfnAZw5g6IYQJvu+IavedNXbXSY83PJwclw6OTLs86YMIGNlA2DMEpkzeS9zoJAEjFIYABKB+QLRF8KtH8Gdok6suWSQMJ1jHUvLHcFFsuJfTaAwZDl3nPaTK+ENzUmnNuI9qY+epZylcwbvDg3FwDYsQfWDBhkyKfQ9WufLuJMgciycTHcOJAMFhODv/EXdaKcIZrQ6xsaNH0qcaDKv7TWsdwRA4asdH5IqcBM7L8ANLw2MAPCiAyaG+iRxjBgOsuVBoeOG2cMrX3//3/m7SAAycxM/oYhA/fe+8qZ69Y9M9DkOz7pQZKa6MFPf+33z33gcyM/hem9mT8+MkBnt2aohwY8fPfVa+lsMQQE0Hxh0bbUA4PAG5lLDHogQFKvwPmV2Y8CiG5Xb+0yPWuyLTN763M/uL+NLoWlZ79099a9dDXsqFZJ2217YmO7N4De+XPHvvuiuDsD5x5c8y0XhUc/s+ZHBeqNIaHAp7ONWSnt1g/jiQnfQLTa5QDR44f3d1G1ywMBmO1U3NpOBMu/8fnplq5dSySpnMorW84KU/5qrKAbsMTU6/e+/VLXqUJ6AJyO6LmJ6qbn5j604cd+5VIrgZZGvX2LFc0NXAym17XNWOzVFM5UhTNkp2GQ3bjbtbDYkWKPRqaXBqJXv7Mp9mgSKA2Q6FT4qVRBiej6WR8s5vbMyZkSiz+v1wDUDfIUr22EBZ8eKl4s9gZNPzkFdloG2rhfyLzpT9985YjBnQyzz6550yY6ip5f+d4Gpm609NQJg7NiJNsJbAK7f+2t/IWVDoEeBUa9ADu+bxnqVWeszzdJUVA7X5LbYFEv+xmc+LUfjk4da8pZsuj0pAkQCU0CM/UgaOw40iPm7vz4FD3VrRvTld+5fRCQcBdLj5/+rhuN3GJ6btfe2JbRDeGBPQ0ya6LFgkloFBde+s6DynBXYGA0bzx1tpk+Mai6xrrxTDyUAowsPHyO7pVE4C39NBP7qxkrLe2sC0T3EhgglJJBE3fuN+6BiRZ23DsJdhpGtVs2WiqG1wyi+lzNdHY8Pn7560YQmRQuxNi7oZS/arsyYg+U7vzAtLuyFReO7vhmfrHqmSHxaPfEQG7y8PwlmVKSPWdfrA07jSvi4oZOqnt8QVihcmDCZFk91Y0YkXV7cPjQO+8uyE5PUfTWHy7snI1J1WxZLRrIGpZUPrfpMnVBmbWQBQPF8eJM1rQ3QEN3/Djd29gClMTA0id//RMlWW2MRXjs/ifLO30lh9i7MXI6BohOHBt8xetTxp6tdPi5ggB3YUBDx7df7A77LUDhnmercoZcT0eM0ewGLwflz41apG41137/j/3QFTMzzXQc9s8UACQTD938tXQjDAK3uAdA4anHK5NJ4/G99gp3h2uDg2AwQp0MpTOj40/srAiBjVDz/J57H93ws8LssWgsrNuQjrDqZ5dW3fimy9c50J68xcePkVhwdtcNQa/qzYKV80ma2LQqa7DpE/9k8cJ3cy9mUToGgvEgGN/MNUmHulfJCMAIdwEG0TaOSd/g+c8/cMfAIGka1J2aR3ND3nzlUDAozAQCDOXHcDw7HQFGEBamTj75zEl++M9AInHj9MA1qRj53FsvMf10f2AmoXa/85k1ayDAgDg2u3MjElkUPZeHQJnp203/vesjPdeuDFZI17C9m0gbltjmICVhEG1N2p5bBKdX2/fQ7jt+hmya4heeyF172+pt27NhMRSYBZQfeyeAcUuxkDs0tvv0VJnhN/1uCdPZamOdOHn7UDKDKifuv961UI4Mkfz+q7WUM2E0VO3NmwmPprVwajJgpVfQ9aFuqOEicDKj0g8TU74wU0A/N6fz4LR0/r2fft2fvDkjBJv2/e+9jXXael2q8lS1ty+MAqD06Luex4Y20dOfP3d2oRw2Qjzylocbdjsjozbzj68edgI7kBd2vXj5wkDRmenxDHH/2XHd7ElJYLX7m+HQbMLAvXMTIBwfC41Xsihf+ZkeQKvfnxDJDeUdL73XB0RfOxh6+sE82OlQeeGFwuu/3jgTDFbu/KdJIFCynJmerJ64aPNQefr99wwjQIDjZ/914m2XER/YkdOamz9foZ2p19cO0kL8zF1FALczEHjx0IH4Ld89FprEPheWXjgXDCwGN7Y7E1cTcz99occD0WureqROvZNhLJQNt1GWDCrunVkBGXf/1dORlAgqz7+41C/j8A/nP35fXqRrFFanzw7NOhPCx97x6YK8+sZRvX1vqpjxJm97W2Pz0YdVAEwL5Wfn33ax47H33qdv/7GiaW8t5q8YaeNg7p1HW1CLkbx06ED5pm+53uIg/c6zZ2xg92t3V7rvzs/3pzCM3pE7UIcLhMAZMcqQkbCrM5UUAtv97AGWiynMl7/2ZNp06AJvfFvtffcvuxu3qAWDKBze3yCj41+4/wTR6391RW/eGc/aDz5/9Y9vWauJkydi2hsa0aoAh3s/zs/cHuAONJurAgGY+MkdJSPAIJr5w/sqN33Na8GgfROYnzV27+8UIhKemSR6buLjow0erUxEE4NXCmUnrkRrh2itY21ku+fKTZRgy1s3+hyJA7f9eO3DL4RtDEbCHcAW5WKYEUX5sd00t391mtg82JoeumzQkC+6AwawrHCaKwbphJFpg1kaj1YHNgKqUycWfOXbXgt2IA5SYIDAMCSa0AS5p8YeI5vNFwtv2QjKhIHCvvqtFxkQdVr3utteu3r1EAk3YNBRwOYf+NWbVwlsQNCslDauRe3AMGhnAxRV8fCwIQwkbGEJdwAjMAiDSNPAlW990zUjQLR0bn7zVduvBUMgDlgCDIFEMxqa+59aTmT1LObMjmUA985A9i53vME0IFoNinP1LSNJDBCK/JHilkFaHc7nw1O5r6yLvRpQNgwIDAIwrTKAumhvemnYvXXThnKm5rlwZNPqAINYgW3NNevoWhgyECx9amcsQL0y0Na1/zczFRh7tiWMEqyoG4RbFkbPT82y6Rvj0PaUcYPoe4PY8SQTBgMYxMorAInEAtQjFO5+vBCYXhu0e+3VawyUHGgvYBDZNcIoQ7IRoMrTL68Tl31XzqPVmwmQkQGxMoeVJImFZFCPYi0+cSym10bxxjsva2jAMzAOsWlEq5QNt0G036JxNPj6taFJLa4lWmWlkgxK54YGMeqJ1Twxv2XQEnZKBsWb776yMTKadYA4XPOVy4fJoI3c0tFr3qA9xVWvLTrEk60BpCphClrYs8BgAKD0gPCSW7atC3NNCSuRAVzL3b+zPdQTGYjDbarRmkBZCAsNqws5uPVNR14oNwZkPBEbaYb5h5+dDgcDjNIzrN5y3ddcenKmHksY1GIEGJliKS5mc1FkJnHYjTAZsCoTDNP9qttvP/zUi2tjnnDNzru3jP0VBx+8a+d0NBhgA0oFYW96/dtft2FxplrXYAAGBBY0SmtW5YqbBhIOQxyJFll06Ks3oC5kVt1+24HPLm9iTzhu8zvv7heGRrHktSPFtDCZqZG6AoSihZmFYN1CdsZtFyKo3bNCgNi4Xs7HsScD0ULNyOqAhIb6A7u+FwvXzH2wY5f9FzRKxZnl8fJw0iVEfSzsJJao1uYmMwMv31vpjd39r2w/VTFZvON7yBCt1AhACTDM565ag+oytQH4I//xN2TQvrWtzXbme07kSifKYH5HRiKxARHHim9sVVNo63rclTAZMsRR7xTKsUlqhOm5kd03hjDUnT34R35X3g5GAC7hsqM5g/TyUGLWiVpNq8AAgYmWaJBwd943NZtC6KEWJUwcGndjJXIbWQMZYNvYht2tIGgHsh981jcOWhiP9IrJwd8Wp9JqAAIMRKusT3kL3XHy4NGGkng2umwAhIjOjs/R2bS6g9t0luEAYgCHMbD7vc9Nn02g1gyunO6kOYUJMPwP/eEgtZbs/Z/beIcSuLgaJyrFGySybr584nwX4JoDjI1N++bLqz0hbH37lcGyqN1woPKBs4btL3xu8j15687nwrRrkkeKnt/7C/Wlg4meff61N+Du0PqAJMjQu3PB2nY2Cs7ec2oNrWEEUW54PfGxz7rJrLk7X3u3u89BzQM0OADYxmaQ8YTGbTHzKZpdtvJnn/OXDlA9tekmkdAkN609w8FQiwkCyqc+947RTYDCcznkympwszq+aU7J6dH7MXh5gdfcdJUAgdG6DKh25p6PNh2rq76D5pD94PkH65YEJCXIpgFUt/vw1itvv3u39+QMYEoEQE0ebDEigwDTWQbCQLRAo1RsEeeeu+dskLnttVSaMRrrOFVBOFF/m+594vOr4ydHK2kBeBUAGSCMwIC6aKVGxAh1ZyycP/jESwWyv17LeTaJMOMZR6yx+ZnvzC5VPYw9irbQcXFwrWzUQAZGIs4ffGLn5ICyV1tLJpGmQLHDGUevsbWdDMykOjVoD62lLxRufsUVwwLMkEkQ1qZP7941GdCP67WcZ8IUPT3tA/Y4BrvPhAGi3bTyd36q8fpvu8MNeZUMYMu58PT+0bFzAX25s5ZI0kY6lxaIxzQOY+xe2WoRYMCok8AQbal99j8+Ed3wplye9MqQoHZorHH+VKWB1AdifTfvofYBDPG4RqW9o01StdoYLBF5ACMT0BrFLc7Vta2xogf/enRgdb2JV0oB5AoGZPpRO2uJJG2lxGMbopff/86JJAYjMAhAcXFprHDzq1YLXCka1w7PAKkTk147YweT/+9jSyCMR8oyfXrzWsKztiLlKPOjJ2dwFwYksV3zQ7Dtmu69cf/1dyRveNxB/NK3t9DDH1/Fkn/+W7tGO2tLD2VqAlA708fXbnugtqdjqmedOxgTyNq6sfngR9e6FlKsfvuqu3LHOjzx/e8WAe5e3wViSDx/c5v2BrxSam23bgV0G6lQot1V72RKtLEDAhrlqTfuv3Hby4TbIxEPX7mjHYHEznXqw6SoD576dVLbg5+Nd44E0aGsM9qfwAeEYwLF9ZnczNHCw2RKwA0BBjjfzHV0uDpvbD4Cg3BpxWh3hQqDUe0oQBeykdHmSkZDI7m4fHJ8Ord+/QAggQEkcp43NOTjqh1enTp6AhoGjjbYgmomPgJE5Y9kJbUvAgzMABuahRP3nAnXjgAIYvBDdfYFQyfTnpmobRiNjTZaIhoo7lb7Dl38z5GJtkZmCEBqTj1+/2OPDgoENpQoZ0aGg7H5RK4aEFMfmxqA2idkKubWj8n9Vvkj/84Zbaz5A/b6FoZBfeblRz63az5EIoahzGBfaSTzYNMLE8LAYgQebbqX3f50jT7f3MhEmKzl87ONa7cNE0TT3/zeThIQMXiFnrHxbGLtoRkQIxDtvRovbezqUMnWlHXQYFB4WBNnrnvtYOnQ3aspEGbKpjqn+ro312pgsQzEE+F8RXaoeHg/HRlmW5jcEI9NvyLcuXMeREyQnjjZK+7HmMU48aRo6Pd2DtfVd3zHaB1Mzg6ocvjwyVNCxET9i4OF1Z1dsNjheII05Hqi+DDt3trykSaDCw1E9fg8UkzUf2LKX6thZjjxpOmoN9o4TA+2cqEJg/VAZfxigBiZqP/ElDbBTIgn0kRyfefQaHctTGHMtjox0iIYuebklDbNYkk8oZqX3bhzaNjYyoW0t9ZSc6DNyDVv+yZtYrEcT7LB7TdrOhzaXQ1TSO2MufjlbWTQeW6eh1jsxJPt8K2vol8fbOUCE+3t2ltlUG78RGXTLHaOJ1s52Ly2b1bDjIy21tzNN3xp9Nnha7tmiCdegfsl3Mz5ot1drVFamWPXLJY4vhTljTSorTG39VLHxMroWmyxHE/CBvXLyYfOaHO1dePMz63tYCaekF2u9weZ35hxUpvDg/EPrhLHTjwZx6rvP9UfOvkvU7S95lZyZk48GRvIjc3jfoiWtjxTm2NiB0JYxkKM3Py6gD6UBZUHtL2mVSzoYDCgP7vT2+3Pl902fdufxXSEuCt9RcMdDKG9GIz6yHcYh9kJLHVhpq50zGDaxnKAmQCBsQWif3d2o+Zzi1ELqCvCYlNtLMj6dGk0NASolTiBtQ+G6pm1l/z4pd5h38KsB0a9gubknPvpzbUJxc3idkYCCEMBLkzWutD8ywu0r5zqcKdcfxLMBQIwU52OLHdlpE6GwNoEQ23XnZdv/59fHBjzredUTh3dAdDIHTs1Om36+OrtQezgDBgJMFBZDkX96Gm3nNtd6ILqVKVDqi9J557lPFh2oVOQKnogMEOAKjFgpBa3g8pyqDZBUasbtImG2jPveHr1pmvrzkGuJ6HxhQj42N0f3VsK6WPzls6uQ+6BjbAE1Bt4/nQdn9lTEs1T0zFAs+xu0vbSHpCeKIOGltOur99TwgczGdLhMxZYAsKaoXn2nNv4zJ5Su8J7os881viSwACWF06WkGkfpgQQlSPkPgJ/+LoRk67BCkRsnJuP64fGIyYPVKC0EAKmo7pyF+rGaCxQpuL7k5NeamnA6yhIDmIEOiwGI0FsovkcnthfgcbYqagNpYWQttFs+IOnwhZf4AwgWmXaCoxHyvR59brVFkpgLCQUFZq1Y+eJjh+oh5OzMWGDVtGtyaAamMAA/JBwqJxYmvCHh71kWgYmlDkbgaBZjHJHc6odOB578UwD3IjorHbmiCtqQS3NVjwxHQkwXauR6Xs3KAB3MjiQ3IzLE5Xy0XkOT5tywbRVi+lngVGvfMofGw3HFgu9ec/HDJQhY4koqk4WNL07nzu4rLhQprM6ma6NANSyjEU0/tHjTVZwI3VhJBTlSnNHKtXZysiWocGQVrUxK6QwGeA8lauVk32Ds+WcE6Bs2EI0lypnjs7vmVFhuu4QQGABJnVhWtWKjCWa5/c+9GCDFV2qzFQkjAT1+vKpwulzGtGGgFa1mBVYYAAuFfVOnlgajQgA9cxGcqN0+uRLU1OnqpWQVrWY3hui2BnoCHFvjDpJcW1x72O7xita2SC379TU8gYI54r1Q5PVgrcEAhBm5ZcBXrFr/smT0aBAGYNcmi2MHdx/cr5sQGAyrHB8LBt5GKCsOGOC3gBRO+rzZ/eNvTheZuWPS2c+8/+vReU9Z5oT60ZoFdhcGAUGwec/87JWCZQwNOr1R7+wMDVTj5CFyXp05inLZBNOgN3J7gVQAqrljM8fq6lNbvexU7mGuTC6wmqIc1VaZbReubk8U5UAHQA0d304vH9vCMj0qQqzF8+WuyryPfbajHuxPN1Qes3Dh8PezIxVaRvmtmiZMtoKMFq0EMI9MTQffUew3JTpXxmVevKLY+HYuLeH5dHlXpzZVyZ9z87FPSGO6FLWKkAt5oJu2jqT9sNYEpTm6HsZkEp4Q0PuUcofzfeiUaKf1ck8cRtp2MP2Q6iZr8usjDIAZ48C01v1wj37sl6UPjBTTLl9qFamXnpmXqyYAkx7sHpjvmJbml5cmI8eLzp56L7nTtf4iiFWUDggsmUAADAVAZ0BKswBzgA+XSaORSOiIRjLXpQ4BcS2FpASRWMbBGtu+W/4r/EftP+aHyn1t+4/2P9T/3H9xvu4/i9hHUP67enL0D/zv7z/mf2w+Wf+a/6P+c9yn6H/4H+M/fv6Af1V/5n9w/0XwR/6P/K/w/u6/wX/E/7fsI/pP+T/9/+h96v/ffuH7rP8Z/tv2u/z3yA/2H/K//H14fY19Aj90P/p67n7kfCl/YP+R+3XwPf0n/Of/X/Ye4B///bL/gH/l4m7+l/kP+pfyK+N/tH+F/Ln9sfXP8Y+l/w39t/yH+6/uXuK5n+y3/V9FP5R94/1n9//dH85Pmj/k/3j8j/Rv8t/d/+H/mPyj+QX8T/l3+T/un7h/4D9zPo5+w/ZL/M+L7sn+n/6vqF+0/07/U/3b/Sf+r/G/Hb85/yPR39+/zn/g9wH9b/9p7Wf7nwb/PvYB/oP9+/7P+C92n+s/93+g/2v7x+4z86/y//m/z/wHfy7+y/9D/Bf6P/7fv//8/vh///vG/bn/9e7j+5f//dSFJaEz1UKb2qO8k9dM//0nH1XJnpxjqnCdA3aNbc4jY3lSmElfGaJ4Odn0n276Nsl7VFhHZvG1xnQU6Hw8b7GSy+npTUeHUBu4hSevagztdtMFmXMap/yOY0vZ9aMwZGb7EBl/pVnBSJyf/br9xcc+tDpQC4Eu7wV9/bXklj+NtCFbvitFeQa5FLqf5XdG4cUeP96jrmwaQDQNMfO4RSBD87cve4bSNeyKk/gk0V2PjjWbPlAEzuqc6H4SjALOYfz/oe0l9kd5cUvn/1KwT//qvoPBLflRBd7QEMg2+f4OY+k3taFU/18rrxFeg85hSouKfut9iRt2AQod5yH161WH11MXofr8vldLGSCow8hWRer6Rcu7P8J/DuTvV3/ZPLx/y+5e7sdvpgqbdPqYBD/BXCMiKr4hd5wrmQ2LlgeClan5U50wvvI0zWwJ06VDcs7q0rH6RZyeXP7/8WoAHZkascCQoLs4HMhQiO1zoF2Qw4KywlKo3MG/LvLBuReECab/5+PzsgUUL8YyqFCzTGku1SgwoZtY/d57nbieiUrYA11/ZL8B2E8nGfgta63yo2JC3avz32f///S5k2Ij/HnTe6V4BEwjVVz0FHHYtEkAoD9HAMBu1YV73O53hGhpgDXDmVQVv86EQwmxP7GkyZ9g0o3pG/6I74IRIf0RkuF/Kpe/GPBjfHWDEl5e/O+Q7cKHntPFnJjeNojTUAGNWy/sHybaBLbZOIb7qXdQ6r/QK3acIDkgwZvrUyHGR6piMcBuIXAPC6VMol8cP3k9WZoqxf7v0f9xH8GmUlYfkU5I9SOz2cDx9t/238lZOIFPjYnOmw6YAGvRld1/IFBW8u7hR5dbtwYSr8SDv+ksqDtgUbtjJne4joRuhZpbHj+518OCXa67Q/9sf0DInAaEWtpF/xZ2e8Ngwsw/5RLf8hg7a33pRJfIpRgBlIRJed7jo19eiZJFhzvbphzNyopGC6kJF2oYB3Tk9y4Aivx5ty0LGdZxkX1tAAtO2odT0ImT5+nxbP67j0znLRlaMnEkNrbv4XVe4UAlud4slhfsS3uVS/RcSTNh7W3ILl8UQDYrdXQXW2K4HX7VBackGDUp2Pd+xBmgxa22msvPe9jNB/Pkz2prSPNQKkaL0kl+sNirnqDK810rtO4IhJor1DFUoZFAVbBvzUp7GTP11HwhphUF+eDCrj6Q/MNDFUfQTlWPyBvdwlMbnnuOac5e4rUY2rYTsYq6f1uLHkzUNoKr7n/WKw5OqRbu9p5O5N8HOInz4PDQy6j4qjy33qULic93GQQdSKo9smbIBiFaxcZ+KEQwn1Pklc35yQoSSd8Ql8tVX2Uqy6cjodllkKWYFkI31DxY25opYnMj7jUBQNzMssRgTMp/02E0H6u2QR77y3gywWkbaiQAxlG9EVL9PYKWYzPVLBuE6otxpje0WJWvgqUJhL0Dyo8lXiUa78ZyR+vmK09UOnRFA5lz9gt6PoWc/YRIsnHzYXMGEgi1imr8mg84cBO33PWodD6q6zZx2L0NQQTHkcQb+NPW2OxZZ+PWvPh+TkaXqLLpq01cT3trsvgCJOlyfa8nn4rdH33hRsYbUdSzm2azjlcabRNaKcoqVJHGk0KE/cFtZgRK6OwdRe4+mWZg85aazVjvF8IABnXVC0X1aRWuwoYxJyL9edfh7+lHX8yZbBNvC4eFUD86YUg9tLNL/t0PQ+D2iW7nhVbhQfRTG5+cRxAksCNHKeL59ro9Bvo2rmJckL7y+uWQfemUrfNAkct6V2uhPPaf/ruUAYclo/xLKj3Zf8lxme8CQ3dR00/UB9W/CLFKUduOwSSvalf+USP2fq9UzNOJ7MfQ+3aedxP0/McJoc+UP/F8coibixQ6jJ0YkvFaDYq+m/izjekrbexO8Ln9onq/Lo1WOtzNdtpFIGdJ+xTwOWZTZLq6zkqL7xLr/9g/+YYJGaF50qREAxlS0sIN+bPH31vePFy60zSRvSaOOVHnRAZc6JfXTPgqKxddaijQeEP9CYYFk2vDn79kuz8pCuizpcoPerqr/gmUooGA9I+jnKxB9Znp234kkTM2vPGq7Rx44PMpfRxZHRUFc4oOWy0fToelon6w6OSRzzj7clGib/2V2Ca8Vfdep/uaP8qq/AOyORyP2A+DsfRZVqG4bBJDjreeo/308mP3Vpz9IqBLX7osLq1qXpgPjl05B5XudNrCE/jVnRDJIumQHx75vQw1qDe9hFSgHRHl0VbYbwhkeFiNDCdHrUZY1sgJWyeHbytHzUnBKGhyYSkfkccbttD+1uI7GWbMkEzVa7kYL8wToiQhIqt5KhNj7D9dhZWZDwortPzjhaADg4vX3/RNmch+tWz/UEdhoxadQwB93wvqv5DQvRp0AT63YQJAtKiIAUKlHs9PB3kjwrZY6MUJG1dqgL08dBcchGdgAD+8OkAR/9ToA4CKEW5keHgzmDyGtw/HQxFHD7qwyLPHSvjhW7iPZ/ECqAknc0BvwT/ko2ewo33gvQt6bhmKdyHq7QITpvntHO+63FtHsF9FBK54EKWO4G+Uzj86LLsjIGShXhIKJ3dF/uxxu789B+b38Aj8BZpxSNNIbRkP7cw4CFabjxEKX8mVyysDAekXAeIubc8pmEEQnA6GTKf3gwNJAf2mU/xP7yKmdebTLeCNVXhLLxZrCfttSU0AGfp5EoNVF+sS99BjPxlnj48WXRhcCmpTdu3A4KHJqSg8e4xzc07947HMJOnuMsoZHF3dYqYg9w/LaMj8t/6FszxtzNx5PJJUHuVIgWgkJtTUIqLznjGvhspjzOLc14Ha4WEdRGzFjov2Zp4gikGB04sLRJccNG0F/ju8KKbiIwlAZrbS4b7jQAAYn6hkPAgD5wvAipJ/Jssfvdp8y2D3F5RaHKrFqkTBL+AwQ1PAdRmsSjjxe6ZhEb6tDG8crKwZpskiiM1Fidt6UrW9tbvH2kEZNRp+MduhMt92ECkaY53rCFxGsNlr06f7rmtKOslhYQCyNOzdWXZD/3xJNLIG1IQsK1tVyKCZs1y5nl/j/m2DIdvzN6dYYZrZiFChbGp0RJcoUJ2pkms8fxFyRyq8IEv303ArQkm8UHc371l497xn7d20gwD/8ssGVZyy0Br+BbanzWm/VxK8mEWwHgMP8EVe3kgZI7CZntuDEuZp+9MlluV0Kl68M06dtO5Seq9IXnzMRzdEtbe+6+nm2RfZ6kjfcr2NVUPWBCh4/L918mUnvLJRprPmsg6bvVx6+0PdhhUF40ZJ8ULss1+5XRzSt9nb9///xVK4rJ/AAAAAAAIv+p0CK/eaEyEMFd5b1r/GoRPl0zgIBFOdBxki44iqmq4MIH+UvDZreOXROeW041BLqucMuXYJXOzxaec5js6pDOM1SILiHCCHxIO1FllLbI8TiL/9V2v97J+BXbX1N9aqrRUm2XeHrzdLjagEDYbhlgCIwjeas9VFMIm9Ty1M8K0PN6qMQVHclcIFDUOl8mM3GMLTUyStNp1ihG/YkwE/IA8kO42NO6scERKeryXYO7uAIWX3wiK+pOAM/XSr2dWc36LBU4Uq2Ulicm22ETz8gNY1Za/2xzwHZaaCu0JnznqS/q2oXd7cqU5mq1TBFkuKbj0G4yLA05TZddjsgDVrtz6NE7y32RpREd+kWaqKksvbHfmI6mkAZ3CE68JWal1SNK7CT3y4FRgC9Q8aI0wsKjq4uR9G9GxNfwA1vFvG1Aqbelp8UehRA2X+EO0I/0hPJIPE7t1hqY+Fuqsw6inyqfIgOq/X6N1dCb2Ju3sUVM+a2Vdi3+WX0r2ma8RCAErpDbVzyNiEQCnquMyn/pNSU6bc15YZl3YSTWbbdEGWxg1DjkKBTbsSjDxkrGGJiKWVreQOHD18T1PK5gG2Z37KHPMceDGcmjZsb6J/LZhsZ1Nc/DdvAv7s7AbBZEJvX/7PjDkyFGwcKi2EwaT4GFoaBR28Yd8KY0RbCyfi1I53vHf9Dlw9FIqJqDH5BcRHqn35O9xGTeAFMdzIHI0NhOm9h9oXFXuJclzK1My8ysFad3GDZ70IShpi2SpQeMKYRAMOzYP9Gvs8Odv105mC8GdSRZsH8WFeJbQ2Td0dUiIgMYaojkxFd6JJ6zlGW2xzCsXrHU9WW2jMDx+mpU+Wa6yjYTihywmQmiryd0ngfDWjT10bxsKoo10//cDp+0o+0nH8VJz+JQ1T79oD9Y7n41blLwb3A55B4RxJgkEdHsHbouqRAESKRDctrNNViWMWiFdeeSLXihY5byeOa9PvqJYjsLWEnQpsczXDZHy4M7YhG0O7V022GzqkVEqsBO18tzza5gIU9/SAD1WfGKC7ikF3uJwABWpo0rF1JODf49gFH/HSkOto2V4J1RQssBdxoQsl+vk7Hm+/mvow0S1YO0Q2pB73RSlLyOzmVYFoSDnYfkO1KT8fQmV8NlI/qDIIYu278YHqV+PA7peeE5kOTyTMOwK/apmDU1i7Py2Dh+X2s2T6vxkCmb6xdqWeRBgfWBlMhIIh+ePFO0mqIU72BW/vQ6xr2NvqOpT5LuvZgEmf+ufLtX84kAvdoacmXNXdlKevnnDi/duC3j/Oig31Kfi97iKCfM6XLR+0XK4A+qyrfekeeGo/Sx4UsXDyr1+QZMNc3eIddJZ/+r1Hic0jobFyTLRtDZBt3tnjJNc4QmrJnenmpogQclVnxrdwp2EH0ewEd/U6Ar/vNBhN50qJrNxivMhnKhKfOPxL6j3iafojdt+Q7+6tLLT9DiUPBj4kodZ7tLqs5LyK6Rgu4+V0Mq2IHrurM/NQ/OCq6pKFjLRuSkH4eAPS7UJviS32diD/olg9ZSQ8sd+EGreHlzZJs4V+cjlQDQ0h0NCwjCwsgeVSBgMH7/9F+Cv+eOO2G0XKFjTNUUwj2r9qiFAxRMOFo68fbuWherYmX0rhVMFkr6Jg5Rd8MskdhWDXz2gE0KSCNSlawGYlT3mhvAC6FSQtWY/C8RPp1TgxfVdXLY1bLLSoQbni05cdn8ZaaNT4p3eegoudA0FchagHYzd9oPF8Z+oQ+vz3o/njk/A1UxbkEsOk5HDqla9z5e2M97S7Th9u01rN89ZPmAWUqZeM6ITtKveYomZOl7I8/HfgyGtsz4d5Y5PUt2Ew0rhAzmotA48eeXrJ6fsO1ck0FCpnWxSgDQCQxwC3j3YYLOqGcJ6p6+wevZMQPR8uWLOxLJFcHxRmdmyQwH1a7bzkdGKBS4nEahufOKFyCdIB93yyfVLuoL7T8DMcS1ZfYF3/VxpBM/eadlYALrfPXoSo1IDi0OhGGzcIJ0FM1hTplV/lXY35kCKdPeg20Y/TE9lY+LaSM+N7Y/kydaSYkmBIZheSL1e+fnOM5/P2HhEB2IpEvzacHnvnCjfsgJQEa21MxaiFTc6DdZ6aZBh7kSLHkPc3SSv//zh3QvCX34YPzb2PIpnN1sGfZ23XvSMrvaxiampn9kEZytNCymyrs3XyrpXIIwlKVE+1mp8ato5689a1Py5TkxskRebXhtugOwD/ACgR8n/NjkhWzSDXXOWvRIw/w3SPL40G3NbVilRqERWwPmNmI0uwYnquvNxgWGYDYUw/kybHk1R/smg11Go2q2zyayUQVy9daJov/o4gwWjtvGObIzC7sDIvl7z2eG48+CLRRmkEGCYcu2GPmbvPdn28NUvHLDpYe/w9oE/Hen7WNxqPPCU974TMcgpGA4FSJfHLxCSN5YFGpxUOHP+5fKzagIRLNe+NlWtsXA95YcQS7rxyWCrpIaQXaHUd/mpixMqX4Uy3svYLqn9tU0RmlnfTvd7wqZy/mmnLa01w8ca/Tybes3C7gUNPw0++Xx37W5PN1yrw1u4BqaHgMmxWkY3e2uRY+vRlshtKH1FoOlTmgOdaU9tKEPU+waE5YL+p/4OBEJCMyxcop+R0h3ml6IBVcP1VW18r7FVcr+FDrCcXTvevYkiyZI/RSEWt/uHbfKwpdOZKdzJnAGvEvZ7JZfBEe0hK7axLTmqBEJO9jkvYa40nk0LVxSabC1sjThJ+86bK31hVDwNDW1hmiUdy57eOP9DfyYrYbQeqyHg5TBajZBcMKuKyfShrHWNNPwFteOOtv9JueDuU24omMHHSdOKOEk0oC3mZfR0pWtqToXKBcf/Hda62wWdMDv7tGCJzK1ClWzQHvqQC9LI/xVsqxVylmGfshq1TB6YYKpabW2j78BC1OFkWepo6zZ5IyFznkWorpKhBO6TD2xqsHusNwZj7rn5e0c8wxmWwhpOFSlYoT/aGe0MDiUv3fNdsfPTDysw2SgnBRav4wFfe5lCig9mRy3wb/1lFY74qA8bNgrQE/VWFwILfe4f8zexTbjJk/mTkjGccBogbsjmlQlPl4M6JhAkstLmh/ors5x19EBjyN6crKwd4kedS60DPtROZwe+mk50yHxVwc5wL1Uhsf9BE9hAPwkEQc+jAgWSQLPaxU75EJ8dzdNn3QjCasHSwS+n5puVpQlZWOIhyjWXHOcPWYPkIf9vT6pwfPmZcrFxkK8+uTVa+lZd3vHnrftSmSa6XGlFn5+Zpulw0AAVoz4g4Ep85E5wvvR/KqYZPONAh6wEMT4S5zoeVSJ56KyHTps9g4A74IcqaW21o3L1NRPF300zPrAVclIhrPHZJy3Zv9/yng0/7hbiXkzk8Eh/etgv/2Hyk/CYJO6yTOi8BNUPNzpRESnzVDjCwPFeP2qQdQQnBxp8J5WFCaJzmpHiRr+YswJ5GT44nrwYOX3SSbM+BmYXrMoIUzvRPBgneB9D4noLjzUNqaQsUsLKf39Y2BcEg/Q6ZPUyqrFaFoyC2tmZvQIKDB0FL8BW+oQCArbFoiEuFPdmLfuHH8XI79cIiyhNAPwhg9ejlykpGRZ11k4AvqHScv1WPZy9IQj+oQJ9X5nOAj8UMDUkS0u/HcTXrBDyyMSE4jHuoYwBypmvPOiSRXhCQhthFSqD3XWG53lgLZ24nImuqff6MFuioMBMnU29hqZGuoWH2YXx/vAPqhwlQ9fSiUBL0ztso9Uy89urdSCgR1BHnnXr7YVZSj/7bxSz8ll+pYef6gXUxOky5+paKutPvLa7mHUYa/cDahxXo8vltTM54E8iRpCHiBT0FwgVCdlivsptVbPCbdoLNJDTCDMOW5vpLPcp3QghF7Is3yTpx/qdXbLkIHaBPmoLHKixWd3yo/ayWfgxRR3dnBJX8ZyMK7NAgXcnp9YCj2Lg1ZVKxU48S9KGcd1XStzxWbkGVBoeLtxkIXw7dpx2hIXhteUfP7d2zQHD8vSbUhpPZjTHyiOY1Y9x/gNHu4L0Og6ZNgiot9Vhx4KScPHdukvMn6ymXuVTdHjS6GPkpKV5y0oRcmM/nFAjiYkO6bBtMaWzpVH3uKBGijmJVn1cavgAVcjgGyJkEuPlAS5PNwyzwlyAQRD6PC8sKXM7hKiiatj19D2fDe7hFxsiXGikYWr2lcSwtM/P0tRvSClmgjTsOcdSfEPHb+P30aMwsBKkg/pHbsNYyYqynP7JlWIAKQJTrPYMwJefbWLTFXetouenkIc/7rb4A4zTaX060LwvG82w8p7Qvz2zgqHEMlJjs8RWQgl+WSZsj5RUvQKaNeb6JKwUA127U1kol9Dhaiwapsvg+DK6nTFoRAwN4igmS5rbCMVZmqsZlpM8Th4gQ37T0/5euNBnF1E+wUfKAegiZeFUMON1vv2glLNBmk58umd8jxl72MA60+pLHAoPR84S5/LTep6AmpXt2on5QMmtN44JlF16DOCpNpfJQk4rdV9liZFuMlXm6QXuzAC6t2PH9NMANHQC9KP5VNSBHd89RaiH04qX7vqhTcBVmUFtTY1dZ2RhpSRjgM8jINV0AiyKNjybfXTF/l17CIsa3phj10NRvgHXw9lqNAn+eB8RkCgDQHbbYwcx3UFH/zwNriltXPhkAKoqz6skhr/frcNfrO54pyuPzz2sAlUaXD0n3n8RGwgwFIXMxekCrVjwrB8zeNeq2u75ryR5e1GoZnOJm7cTFXelGrrt7iXq7t808NRvmHHTNAYeZL8veCKqrbfmgVDgloZ9vERq95YwawnT0ApkQ2+aelU7LLevEMBEwUyiaHr2priB/KvykwF76ELQIxutVYpGjHTFISdyz/QmR8ql5F5i5J6fWlg14RuB1DDTTqN8InrgEJW1SdNIcla9BSsQDzpRbxQEbpxTVOVrEVAvmjoUbsaflVSmt9KK2QxILZH6uwd0HWCyYw/11l5wz9zf3/WtLLYkNh+cSv9EhWwuq0nrlzvl5/1zCyCt1zhv4UW7DNp9sLb1BjdjLjc8OBiwUCjlRWa2aVLcHSsovxM67NkRnLxwnGW13ANwvL2TfGzY0PtABH7ZsBDWGQ81ThrjZxaUlRb5wEmj2hsaWyp8bMhP4qCEqqMugSjh2zUMXcYSmYvfoDHqPxaT96tDGaNwMsCRrf0sBI0QbpQM5K8aIxtvyAEc3AbOMOFPpr1AY+YmJCk+ORzIhFyX88FwxhwUWYKU7K8equ8ZE4v2Kvw/yq2nWzPugAgqIndI+Lycnl3JloByotkxe3cS26T8yNUE/B4UGS+f9RdwoKe0hPi/NL74cPbnf/ikT5UbWWkTl9w0Dp+eUPNtKgsfR9fMXnNwhL8XsS4kszIllHeNsfD5p/edC8uH+/wA9MMsPmdalBMkZ/iBDorfr7+98GZFsACfPeueHtdD3HWBx7K8OaPxoTizHvu2r53Ycjcg25UogBM9UKlH1GtTjp9NVwZMbc2y5xdufOLFRvZvGdZCK81RAhzdMKFsUsxHbcrr/rTwjw8H32OiX02ICfIRHHM2mqTXqCWsUUK7ifHOmo7uIDOrVawnM4d7F8EIzEELpF4yPNT5FvHtApJZRXLZ6/kwbnAolX5Bvy35/GZUA7qoXSIhOF/yUpRogT9hEKdmjGAfLr8PET/6Tdq2ZGgLo+QgBADkl9TDQdqmvat3mp/MDf454TbHaN7NJesEKOIJUf3c5oC8Ndb/Vg3Nqb69wjTUjlYuCQmgn8bOGDXTFE1ii9oE7EpOYxGgwJ/J11kGwSXMbicQks/Z8uImS/6ucTiyt5daiMyWSUK5QiCeJvwFihbY0b69Cj3sekMS+mMu+TL9Dm2THvQBwDL1ujIvVpockh+MtrtH7QhsZlLNTe76WG0uaYIKx4eFthPMIJyHEBy+Aqoe8WvWLopOcB85iYI6843ME6yLV6Sgpy5L3817AolYWeY9P+MJehRzkvpZnzZHCZ51pFbzKcqGamswZcHYyvXgeiwv5b+32pnidfEWsAUHyScVEMKYflQSI+WGOY8TC/GRCRidBAoAKiJtP/Ggx286jJ/x8CMU3GqBISIHt+390fqJfMWzN5sFvPbky8IfGxqRdEnY0WdcGvpMaX00i6WRCJWuWQyzPRHj0Z9V5yHRNTlwHCoS0Bk9kxX+OTpzRb4P1dSMi2p5ur9AJKtDs2uZkb5fWfrHh+b1uiS+eeDPAjIbQgQFka4QUIdqhtPxsNNbb2hYEWy4uYuiRQM5EkBX2tTCVHq22nnBoDMDJEnYOfl79WXlOGaT3Via8u6OUo3980rKlQLG9585bCb2ofxSutaRGz9550YOOjOGm8YP4GezIF+B1AV8omBBDnQ+eyCCQbOtzYYrwjRUO+aKn1XJGSbs5WrCzSg4Sk6V3ZTShmV4vqiObEw8MEwIQMBW9wYW7X9UUb/3ikxbbe6S9OA17y1ukFHr3BA0T2yyVFIYnvqWj2iKrI0EPOsdCSj44CYrUqOhjlH3qcpIU+VTepTnMUlZcoTOg98QBUBysiFkfKLJtjRruXuEuaR+AK4ZQCjJ0Y/kER4B+rrHopnbX170EVW5hF5tQwqZztswhDQvHDD1zIWn7GmKSv9xZ66wCatkNun10HtmfxIsgliqfkMZLeunwBDP7KGQUgAUsPAu4u8hBxRUYyIjsH0BroDG0ctloVnk/ZqUWKXqELpWaHbEnIx7q5diJg8BCCU7UN/m1iGbFaXfMVn+BPzjAD2Ec3T4H0EaqAa6/7J4bRBpAlIXAckAApTJqpAKxhChxBI23LDxtI9Ro4uTAlwM5TRa3zyLs4VPexy0co6+mN6h3yLwZOmUyfDMTc5E/vNOsD/2GhVkPuCGewU0qkQ943tpqxJborsfpGNheaBP2aRJGk/UR6/LxIHPkVblEsBFikEs0t8oTe+7WSWSBHpTcp5+GTN/ZF2CoZP9akGZ1LtKs5C7yInYMn3DMBZr1GrB6OXS7QoqM+FOhhbCt/MihxrvK69Sr+9YYAZyTxWuvD8i1Pmmckv50iU2APUB/yEpgufs6BiMEaYiuUCcpBsCYE3ol+u+xk5AjqnOHA1advICgon53H/g7emYZtbHGEBX0FrtShZGSWzbby+ewefsW4VX/dQ8P9cKChos+jnW+pZk4YJI+bqBKhTJumB5iqLUHj4yEjkp25PZI659RXpQNQkv1JD2sSYuvhV8cDIJZoMirbJVvopOsVUwAytkxRa88oOXFTO/vtMRNraCHhPKHuYbKPikxkXMis0q/aAlH5acrGlERZrw/Sp6WvAJvHh5doCQK0Q+FWW+xwcbk5o0f0Zmikar3dxov/3f1KJFSeeK6DwfzJoARnTTjTAwyuh5uWOs+bOkyqaF2S3xweoJC36EjdrEi5GPC2EANjV1yQ/QlB8UevsqzKtr/b5zyTsgs5jk5w+cxcSlu8RKrn6BUEdsFpIfr15plCmQKY9JesEHenBfiL7om2Xflk0JaSgAZN2Cddt8T+nw7hiCo8EyHh8DkriaTr8/T4S6njUd3it9UgMcr/prAoUkFMDtGa8fRNE6bW2i6pAF7iBkO1EBIXOyTpWv0Kz0ufxFH7fLzkILX3SAO2V6vUfD792WAwhwS4E3/2i0Ltihmtpfijy0+vEro6wdkYcqneK9MZmukwHyzcQOekNZHJKPvTfFNQilSn5ZGO9SKaf081nb3ix5LnhNkDVsWNWuAYBdi4Ovcod7dYq6p/oRIRLTyTq3sPou8/CHNccgBJV6hRi1EJqV8H9rZCyBZpZ3RvVTf3r5A1/ckfZ+Vp1bLQ995swGLTr7iOOnoj9xvw4bDBrPOl/I42+4REBZeWZwha05zUBBrnr5hMvmhnWc6Es5lS0N4iIaT+0npGmf+eTJ/WzSPW2R5f1ddJ+IxtVRrz+0tKKd/qbFjWkNparzfe5PAFTCiD4+ZTznAyxFFOyjDPyFT6i3/AzgCqA1DTB7rIivR/7zuDRXsfinsSN9Zlu04XEbsFbWS3q5gMPAgFrJFHU8QqRJeDxKvouzgIyvnNpSfWBhQcfGfX7ivnhHWHBkA3CPxjVYnlkd+b7B101Ix/j2ulwjJbTjzUPInEsmS5L5l5g8Ju+QfeHvFJCcnyy3WOkJNtE3tT1Y9yDHbCwq/zGn7VRFE1zSzmAe9hMlpvx+5uhqgptWM8A3i70qEtUgFMNZ65tEukGVR2eKpdT5z1LqyxPMq6Lhz0oKxDSwYc/jhE+bJHhOVICfQZU7vH0VwxsDk20U/Dnz5QOG01b/5fhOC+HjKPsls6NYAAt8hBplY3JDPP5VQcYE4kxXg/qEKTA7XKB9znV3/ixzu3oXdCwq6pSOiy7VDfkFIQU922lBPC9JAl44kIUgLZghmo//65pv4x8XsSZQU0pbdjU6DwkIQDZhX8Vv6S78DflQKEsd51kjAmJhV0Z0P3ZUaxBgEX5M/fYKK9TzLbhy9o5OVMwMYow4o/kAeyMUmVVcVxbHiRi9J8VZ8g45VQrIkBt68LzezaGYcDXBai85a5oNPK6nUaHJv6NI7JEOl9JE1n0v1EYgCbJeknyqQloGV2h/C4AR+dpRTQ8kxksBhhz2KKyGHvL0e+xZlQz29gRg8JRfOdJCLw4b+wgKuG0fKwCn/5fcSHwgOVEolSGnYzra/uOJw/N5NEw9cFYnQZQxBg+zYP9yus7A1vzNEMNeINfr0zDmhtSlQ0SR/fKih+RGymfY9p3D04bwfqsrPJyebjY3KC6hHsoDDVNPE/grSda3shwM4YHFKt+HR8uJBoXNcimX0I0ySj62kL33yYTqgrXbRdCp1Jtro3HEJhyERGxvzDbGoE/xCE2bpRXKvsTlLmVnpL8db/S1bIqlJ/bwyCkEuPlzZisU/SoTSZjhh0V9C+GWE/jUox9wnifc8YE+Miis3tJe9ABdSw8fzC0ip3hS4CAD6wyRAggnHTW60J+eSXn8HJcQ0Box+WVGiEmCwVGVlNrEdWz+ip/UO6558f21E+eLGfsMNEXzAbRk3OM1wZ2m8R7GcGs6O2svWzGDWA1riKT+AyxkuuotAKJoDQpgV2z8RGXgPWcTy5rck6OAcE1UVZImvaZDqR7v6ETEcQur74mMuOZt731ZuxnZIbmVJdq2AInqZK6HrhiRml5BGVRs0IHW3LV+hKbMA31qIP+0xJP6slmamuCSeQR89+tGFqAXBgGM1lQANAzJ1tJBf52xaeIdg02OL2zU/2t0f1h+tEUNW3nr+L2tXj8L6gvSJzM6pvwD2Nmt50QXXjGMr2so6PInaUJ4hX6Ykkor1+9Luvwn66h5iPsSy3kxvBH4iGl08ouwjPl7bDQX5RAJI8TlxCQZwBk5p3Sgr0DUeIXXhuVmHVRAzA3r9V3co7loru6ULF8ynEvncU/FAUlWnJYd0/82zHomXNE3IoynrA1UYNuTc8y0nvqXgZHLKJwcrZJxCJzLPpDoL/krSG0086x4qsU9rkFJHclsnP6v6Z/ts7Eb7cUQSxDQkNDz7TSqjHTXmKXY8auBU2VUAm7t+SigvbCx9jmTkZ44lMqITS6Ft8s1FRg13HPY9+QbC6vL+qnzz48b/vqhyRpBscCMwl2NMiO2lSy8e5fxaPiNhMbYMQVikYya8+mFARt8ZMbRfr2N5QBYsZ7Tv1XCRDktIPxPpN3r1IEhXSYsDuxslzY93Ir8EU7CiL1DuWih2uocxVbGGvb7CVQqikfSbBXzB4hem2DfKcFhQD+4vbFvmMNrF8c0mMWO/UFWR+yYdH20r1vYPaPWTdUfxy9gjLKohoAT0SlYG7cwGcaeK2lI7FRRFdYNLMjUPtm9t/nx0AQ+S3q1UdiNyLNH0PSDDFE7StK0qS+I98Jb3LcOT80vT39TItY50f9jwCZwJLniErYTDT5Rjeh5qRO0tShubzbjsuu90IQlsTCOE11QFiipNcOwyzWHuC33SQnU7w51uhpMzY4m8dhroClTBdd3Z9PNWfTkvef8E+YYbe/yD/dXCXikuGOl5+/EsOvk9kxdT26Y7BSUEx87PIW78Pzxz/on77nYYUS9DnqsUR8qH1/WGiXnrTbSRd1zWisPeRAwOZ6b35cfLVYHRuHwQNg4K+rgRKp8hRmgzgrhJ+kmcRNkmTTobLOGzn7MGv1sVnbNeHwf7GT7FcVNt4j9m+6N6z/yPc50v1pVSHbZ7IM3+ILIPVeLU0sHzKOgAVl+2yVGsej52WIzkdh20IDetfaqElCQK68LDVoE6npIQGJIS8rLhi8vOcBFiLuz3b+KY2It/MOlN9nKd3/NaZ56MsTTrvp4m+1UsrC8OzUoVyQjfN3aJa82d+iVHkVEqUyco7jcWyJE743dPRLhOZuPAF6pi+2M6Z5LvOT8s9ELfP5rvu2y62Z3feWDl4C7igHUbYxT64RUnbqWR2wvAePv/pI8HamE5euEgpV067ycBriuwh08E1KjdVlD+eOHVEOEwnEtbZe6ZU42mtEGaHf0dqyznVaAw/24c7ty2Aa+joTRuFqowceHDG0hg66ZMzGgHemcD5DX4nFkh84xjhMD0POzbeeb3Ee5D9h8rQOCGmv5vrjZUbS0Pn+VVO25gHSz7abCC8PhOsSqPhyoQSaHot+jZA7mMOUSbTZURmHcdan9RlXkcD4UlUBp6yKZq2EJNKWg7dJqmtMK9TZ9uU6JMPDmsSr73jhsO4In1t9h2zGyYCeRnkmH7CfsaMSxV0VrCUW+YtK641pIRu5tHVhUKtbA982yZTW6G06Bg293cF6X3dTNwDZ8TpW4PJTWHTcIYfN6r2vfq+WAlbUPDQykOgyk7M5GRgzwar305ho9rJQ1fIWbafDqfPUY743uxrRT9wRqaVMPTxY52Yq3WAP4+99hjodxb9U6UITnDHPNThNIhSC7exx5NfDpQIlhZUhBilsdSGKNDF8ezOurFJqI8neI/1Qio6GIow6wgpXeP7P/Gt3YPDf1aK2H1eRjoam205XyGns3VeDWXemBXhxhGzfk4Ex3dHBpMzgZKVUVMQN7fopk2ggvk085xCtixH4/1dvHj+KICPBiKxjFPZoQ/69nTElLSN3GI/uJMo6db79K/pfP6KBWfLSzYx4ZTVBX+ljsEaikMa/WK03JwCnedtgwZ3CYOSjrnawO3h0Mcrm6BYKrHD1cIgOafgeS+9yNuzEvfxerljv+rpoHyCs6p90fs/6lez3tmZVAIi2DB1IGklfJM3UB47K3qLe2CxJItNHttjbLC1CoX4OU7a48DHfiSDRbVAuKcG+X7kzXTaLTLRhIzs3qCmz2nXH9q65NtpxDbepsyjGSU/uC38WM2tYnGBRgoVl2Bp5JrOY89kuBkl5Def/oh6wcgCWd6D4NPuaGmMsZ8sZNZ2Y8RtEBkkXbcCiNFzvjOipyp6ACezmhCLXFCijp8BfN0xmDCkh5mRd53wmEyvhd2CLBmicu5Hlsl6G5Fg8fHB3VdEWHHQvplXWPbkOnJnPJgaVsc5zUjQF/BrbUecjgaFKWZP3XSQem+bgs8rQOOrbWflDWN8GwrUzlHLv5zupebgypBGTEsf1J2/vap6kweLK7qeJf7O5k/m4l9UcrhlB1JfIz/Y0fOUgIOpdWkjOZOqUCUa5SBTsgzo44fAMRp3d9cKKyf5/Z8OAfBiJF/HZhBvrnMQkGhMh3qr9cIlZ1/OYu8GEUpAJLTWzSi6CkivPcW/THjy5CdC6xcvIECrIhDZnWXj3zawDuOFDFvqClibpUj32iJPcnHryql7EXpl8FXHGtrAe20i5NrQutMmyZE3oAfcfpB7A76thBL5awj7PcnUPsTpxhrvyHSbst5He0nGMK2Br2iXmzirIwD+r9KKNzRdi7te9o9MU2mtU8MlxdGt09sTkDOz+Sbb0wfC6WU1gh4GGZjen1u4z3lGpXJjhe6n4aob8H5Wuez+j8pSTI5Q1WKzNdhBN/zKcPCQXPNf90t4v/HvIxgnYypF7inQ3KJiorRDfEBRq0oSP/+HLKglM0H+08ah0GXp8UnAsVMtNeIG8XKPyA/maAD9LeJIAEeDsuHT+5g0ZQcHj7bA/WWQMLU3jQXdtIjDev82bOmsSdmQWqv7XfwiYo2ezjO1pkHQEDFVH5C6JOU5M1FNY381tox+zUBqbaUSYd83FBP2sLsAsWsuweDeP/JzGiRgCc7XzpvIlWdXN/8heQtn2BxHDeFAWa/jVC/2aHXvozWrMnXHpEu4J++D2gCSWRxqw+By4w01ghCjWmdRFMy0QRS4EGRqpqgdHCJUV6Q/4pYo65KlmRm+qNXKNCZOAre5QXLvFhK167z/kFxxCCMrG0o/x9uwN+8WfiKKytOdoced/MEHfV+xEHK+9LUJBPK3CIhD3mx51Ez7qhU+t0ORp3kuwABWVcDOkIH+DltFU7mTXVo1O9o9DyU4CfcRiavSgTWx115fvI59XKrtCQcJxE1QS/9I7xxlYZ/9JhPKd7REhgNUyqzrcHxsWYc6mXBZfVJtMEwzyYr//UkYqt2zaa7PpVZ7frFHIb4MjYYRs+fpSU75i83g6GIrIjh6oioS6kpXLpg31+ISMQErDDwB3pV/kj0zbjYQb1KxOQ8yk/I8ixiuwGb5ZsU0GuxsCzooRmNyi01WcrajoLu0VM4zQSTFtM5zLa1F9Gm2Yuit4bsGx4sXpgWZggF6yHYIXHi4L4TTmFSBobGDO2SHwJrARF+JOcANVsUKaLkhZYJ4mdP3cvL+alo8urNkZE2sfpDxsKQMlaHosmnYn2t4Xri52o61YkWJFLXpowL765Zcwlj5UqMSXfLjEsA4wEcn3UQo7Z2yKm7o2aZPU1IkjHaSGHdmuM3VeFvHLcY6pSK03vqmfcYQXs/kpWWu87OK5P/rfiXHO7NGIdDi9pStc6yGHl+aAKDd82ZDOus2e41/AGLLc2hODt9CMOFigyfWi10mxZiSwofj5QAWvl5y6tLwz/refb1edvQE+wpr8r2uAkDPB5UclZMfXWUK21j7n/cAJCNQNGkj+d/wdevOayubDtEYCmzvQXwEE74+V+BL3UwxByQbbGnqc6GuXQW89qKvyqzpov9M+gZyR2qW0VjPqN3DBBNbYZfPsGpRRyL/USatZ3nZnxhcAiJ3rpGziBIpDT4EdwkNW3ISmH2RLjRYoNy9StrQ73PzpYjKapiPcuvrqf1K1b2gpTAx3WiuwVr8ynbX8htApJaQB8ZlAX+fNFreJZelMEyd9iyFv9QwczsG+WYfBvHS3HfNfkoLMKvjzDesaCSApLRsxuqN8XmlCXo/YU3TmBYhVgUs5ddQnEp9ntuE68uzLEUaNPIC72xu4uyoYu+RPhEqUoliajYIZd6ZL5kb04e2t16u5R9fOPyVl5gyN8Bv75o5T3F+pbtf+WYrLAt4irhK+qIt2roj6HNrOg6zmxK9Vp9wM5G5RDbvkBA3s1ec7vVZyNTL3mEv0zQTfqt/XP7/dB9QIPDMZKIHAfjwWz5pjUuwAkDnTnxLwkuqxa4qd4Q5y9V3vBFw+wfmswvIXRnlTzvFLKPDZZqwuvjv8q7OQqgcUnysoF9kaqCO9MwTIUL8HAMJl17LioYJ6iVVU7Ev5BNSWYa2ijkoy/IULFPHVMZpsEyu5zS0v7l5e/aVOX0F/SJqEQSps4wPK2rBQ02KsRolmjyZG1GjCcwWT5kFHg7V2z7VcTu36PxclbE/Ok2eUGD4v++b3VSjYdvpsH0RkhnICiszc11ZL7vXeMEVkd4jAKPP3oEYvMztrfqbv0zPsNDS1BJfC/uFvoAHi1maFi7E3WMgpDp++3gMdRBKmf++/F7hUeCMCJBWKDp36meHIUXEOeyHPQGrRmg/klrp+lV6RIE+t420bmJGUsPDO0vGw+G7SHXTYujOi83wzQiUWlLZFIe+d+8TN9p4qMJvqMFRCnhY4Ks4n2PXJf+BZ44+dJu8Wyx2LOuiUCODJ1zIMZNL6x44o5rdd27W0o4EPK1gNy9cc6Y/T04ODwjCv+HIjkj2eaz96KObp7Hv/3KTX9K8zofLBNQlQ2ICi4DFUyzYYbYtSz4DVlFJyhX0pF8AiqYUbA3ELQ6YfHVHdHq87VpHcZtk591GGZf09KXHPsiED//e0fO4bcaBfE2wuihgtsoRNBYXf2YKDZ9W74RGca5nylyviW305ApkaGf002YGhge59Yrw8CpYoIIH/v8aYWIfcxSkP2eXcr5VX8QW4YBJT5uJyn7DsKoOXOicsJ+wQOuGaa5+n8d7Nh8uNsLFBETaLjjq6ODxYeoMz24OOdhkv6vI8NbeNEnP2Og891xAMzhNnLiU6ShDnYWDZm99JOReO/iT3JpBofpnAr502HtrFUXh+MOTXZGgWvJt5QSx7Qf6AxU2/FL7KsFsWceZz/qMMSe48kVREHDQUThJJuCFHVUYTqiQfmq0WunI2g6BZ20lpyEscJ3HqHnJJzn2R5gM49GaGrN/gP8HE2FSvpibxETGCAoNSgmKCvtJrxmMBzeRYJncsR1rJa6hndomhuvhnn9fAif+XFss3eWEwC+bTGwJ1oqAPLM858/sGLJawpzYkNTGu8+2KEe1QaoYmGZqmS2CWaOLLq/AFfSzlYU9h3W4x+cS70UCcvNulKYTduFE2V7qz0NlwBMxSBP8Kx6FrsjQ8Dc6XICVFxSX+55vxq5T/ekfcihuwyrIv7LYypjAEyYrSUXIYTiRGMcQ+L1wBNuEkSsLSEUik18QAgwaL5fuxql5GNWfnJitK0UJGauVOteSsKDNUtVdLSxqRowOMXYTSUdT2s2aswMB5DZApp/eE/0Y+AW0Hn/DmiMyyJk5RO0S/o8Fylp+0gjNJZGvHVf4CcVITdPoiC/5TsrEtZvrvxT1Puo7vM8ZszvIUIFuyKF5ZYSE1Nl/LQQ+Z0CViE+JycdVY6qazJjE3SGVe+Ed37oRzOLeH2du7SCsLq96ESoquS9uzVHvnAH7BslZFYFcdllgIAH/PgJ59bvYfkGmZdX6ma32rDSAiU8HMe+wL2lacWnxqcogY8K5ENTQj29zDA1A6dNwJodbfi1NWsCEJssQMj54cel0fFesc6ju4IQKmDTdu5Km6gkW20mIFoFmrAGFQa7RoBLj6PCOTMtngHD3wijq3a35eEhq3qk3jnptyDZaYM2taOxAIs4+Qieqz7y9jl7AYavvPH2iVxU+QEweNfXNyAxzs/TkO0anEFmegPDpkVY9o+7I72LuEYlA8FGRYIavwivJRfzzDzdeNreP2lWfWHhIWV7CfPO3fD2wdnjNjDywfRA+j7JO/LQOfqKXi5PXcGBP5WJpwAdny1j8/SkcDPpba9opqgLGpD17JKAtUVCRMeR0a5Mfc/MpishrYeDQGlshOwXIEEoT7p+EA33zdjYePQvHHrQtqESsJQtJyZpksx3AWk7YasSbVi8SCEkXJqfJJrnxoYwE9Oxylb+jgZveqFX1b71Upxx7P/f6R3eCRTvQEgENn3FIPj0GYILqhkrkVlJFKP4vW0H7x0Sb1Mo8lR8mk0wlhzBbtVnL/DJZ1wRzGyQC0V5VPSyTU6zb7+6ijIHNQCrLGcVJW/DRgFVmlnPbuYtfV2NTU/6C/cDHh6pZSHTbAGRA38GRc+ePSvzZTqSEVrOTWXlMYfdOxd8cjt5vrr6tWpXIiuqXdwZzpuP1/t+YlahvBJLHmRxcpqvSMbbySZztkr4kbNr3cKiMRg/MQHSZpeHpEA5ZUcfji0kgWiAbWdcwNJZuLSP2C6sQXNtE3CE/zjqvk+qJFHvkI9NLITZ1QMI2nmIGEttiF7LBYo9tYZS/89qLdudKSqpsDQtJ6jB0MkG4jup70fVMz3CSGXbVqhDbxDAy8x7XTbfIBh64D1ct673gLf6fgKoQdh71Tw+cbUD0yN5XV5uJ/qcb3gsPD9pv0abK494a8cKi344iJK/r5yzktZCTXrAwLlmdUTw3gb2/I9MOKSKQ4Vk9I0HkW1gJ9ksvXZu2y3ekU2AuaQV5NnPJ0oyHLztxNXSYfYYNzbCC3fHqHegSrhBbniW7OTFHoOhrkpdNIKNY8qXBi4KHaNN0L3MFnhHv/IzAUsRBg0kV3VisE8mFjyhxmvZCo1Mfgn3XIFLiXT6hleiI1rPvCWP3pfMgX2n2bYc0RSTz3PY/EjJAwW+WNpSBgCGC/WDfas/vBi9slN38MkzHT505ouyn7iE0V+TAfc4xtoZyQAemrxL/HphZhN22QCdVbJo/5D9eBsFmCkgeBnzEoDgMwpsTSw3Rya0WC5a80hW6fa+y+/rFI5gE1hfPH8Q136KCawcCFrqx8nPKrhAlJVfe0PzGEqBrl7IR380HDMZ3g6LGQPKMhIyAkYPNSNhMstsyw/IaOPL7kxIXSYzBQwKj34ry5NP4+MMaJ/Oyl0FzJuWFayFE4UpLrotdhmc709mVdOqHk3reVMpW32kEtWTymbJRXYjmPAg9qsQopYXeCdohAshnPfThWWQNqKXQZRBtUL7MVE8N50G9+xjNPvSAAEgdoj1ShO4yFC3XlWlnfAd3hWFdmwLVMFM0Xjaesv6SKH/gftBtXNhHf50Axuu4kCrm9H5bj+nuPtJU78e81tm7QKfAdDV57/lHu+O4/7igoM6O4nSGOMXg+BtCSgAgMTOtPvYM0xiGccfDSx6Yu1V2FiLLo09BXLJKufiNuyZuiefwNVsWWxGHoNSlvVukMYzIa6pGWi97naGE7nvhDECvcsCjpYa8NeNQqvb4cn0kYXTtVyZ15zeKI0PAwcH+f6sREzdgvCjDVl5KFoGVcWxNrCofbiyxLUdEcOGFO1wKefJ7aQrVAe3aaoFyqRShln4Gip/P2WYYdxzZ40EhVRPv7ybYmWZGoo+EEVhV7FA5YtEYu5KCG1cnOLSgAwZv46xXaiphdi9q5iRL6LXtJsRIcJYdfz1bdXN3zZKZWp5vb3LSU4m56OxgED+gY9oKhMs5D1NnzqleHmVyr92PwvN40bVaybmwsSljoo1aA/BNa4h1MmX0ID0iUUjemO/CE2Gd6qmxFeploobNJnZ3Y00CQvrB2HcGMo9ho8Q/Dp94rBydhG7GtfBHauavqgTzgGBAp1j/ylejKozKVZZhO5SM5WBVWeKSKJdFW8GvtCC1q+KobG3VrF16g8YDxaCVroQxy4aSCDV6OQ6uPWRvIO3m8RDnVfarjK9fleRQwDuYffC+jTYph51zdrhyKx5xX7zQ3rEFHdI7B/OvD17TCG9SZXzX3g1wcQUOfhuKFExc+GMbneO87rgaSsWEoYjnOO/5gx6BSK8iw2jBLqOMQdcaXygjG6yxwyAUrKZQHyz3UW5pTqUD++vLlgPd7zScXlidaRQOdYUN19AJsu7ktocMj7p3tpByLFqGyi7zowGwfWCYVBBUe58QROGvIcuFrgYN8wuBuOWw6q4Ya3XtYGFowBh22dBWqKGbBvncmTQI185zuvy7C3eI6voLcYaRlXukfrIm3ygSzTJiH2zq5cpkbX8B3K0U/J6HMavhit2oxSxdYapP1VREE74+Ucm2zNGoVUffxEZ5RGR+S8kvwIniiRxg4LeM2EYIkgvMZUjjZlyRidbKlaSOTnQ/QTyhQ2df684aLR/b0dt8GPhfBuM4yYLMag/bdkur5O+s2jnuTMWp+EM0I+6a6nQJT5JU2q5yqb87uRZknRYXlEzipw+QREFIPw+n+09bU0A26bsdHbLqL8DsqNBRquPejV1Tl+GIfmr6EJdn+T9LYonUMCHbxy1n8Lx2TFJEAa3L+ytXv87jT4LVyZcvof5E7vJfFjm9UidhVuEaY3VHJtPejnefVkVyD4H7YcjXKJzV573nnKQ5oL952dtngxcU6KtABbl31KIl4ugqhG4dHtQUSeGkzURnGd6vKd59S5Q43aUXDxlUHGkTiWUYkTS2/VJFZ7WQUI97oUXmA52RYQ5dEAdNBvbNLODiR8MC2BiHRXmiau/XoNnxPub6yCJujcbTik3BHl7FZ9bZ2gjZ+HFnU88wII1GogB9ZgjO7Ar6tuGHfAQu82CAm+V2a887pZQ74IZ+DJun+s8puYYiCVF2VAk4ox0GlCQ3oSziBU77Fv87UVuccj8RTyoYgqPlnQ+GbuezRqOv+gFYAcX4/60i2e9y/RD6eNmg72VcF+3qw3YthWFj9Scs3ub1Niv9H7YwipjvIYBEVUwDAH609z4xdN7TxhZONG9eLzcg/zSUDU1X1LQNrpKBjfAgSJonOqinqwFZ4qNHobxtGdHM+PSQw8QD+sB4OYH27wiPjg2hBMepPd2TtpVomMR5w11QpoVwgkYkb9ymVQgmU0ETm68kL/jKJzylY+L/JliyYN2IJTiou8WQp+VZ81dkpGB11koyi0/2NjWI/k8aonCP3Bv5mJflRMJNmCPsqed9TeM5knmKp9lWBSLs98dPBZ8FOXvmfs6qQdXT+N1nCATsy1XqTY+dFVPWaewPdcW6LRgWAtb7xXTl5tqdzaBsdJE0rmy16htIessU++TspizDMXcNoe3Ca95+DPTUFD1/FPlvviKQ+La8HJftvv5+Xs1QbfXcN83v8uxqVLy8Rk295xv/bSFylkTQMzDCBGfgt+av0ciNS2fgM2Up1Rl1OLZpn6IaO62h6jaWCg3x4YoHYKl8FVvW03zUTWAeKX50CzFDDEFIpIFSTQOzKtr/oHi3GneRxK87FwSVpF8I+b6IM3tbInfsa+yDSpl8QouNmO5VTZX4X+75yR3T5mux9nI7V9diZusWfL57ArxIhy+7JPfhSEBmnGXPxDkO9R7pG6VQrKBXhQl8LkFjvySwsWuJW3jRqGmGOjYeKG2vuzd0adX5ipsrPlLHCzJiZITITqWq8K9y24NFf8VHllrWgUaSpsykZppT4/NHXZFTgidlRQOughaCQrcdewzHz8q7E+ZO9bLHQ0vjxnEZUlGcyy+eybttGZnBAk3MUKlP+Zp4f1Km7lPCnPwcOT81lVB1FO+fvwSpE35bll9rHFRr2OPsnaBbETqKkP/0M+nUZnVj4E/iFtjR82K9sfJRiMG+ffK9d47CVoU0qegUt2rYSYuZGWVuMd8HXFvQMv42aueY+lT0PvitxOW2R0dpwtZG60ZsLye3D3+X6aVTWZsD2e1Ob00IJUTUxV6dK95Z2/Gn6OGCHSONka45i9EljwB2wx/0EDpjCgaNVNqtwdc4RZfk7glYMw2VK7mzABAJG/njrd9hHoCdGteRQkxHdPLJ4TcM72Gz+WMZIBKqdGI4bszojPX7XlQKF841M0+5reHtIbxIIZ6T8hRs12ZGcV+ARuCE5KdySpOzrCWx1BWHwXH7D8+/3vxC2dPSvKvWuTr3o53A5RpY1EWfvZ3sVSejjQBxEH19wp/t/QoZ28Um/GzGefkxL5RqbV3xA+EADG+NHWX4Dp0pfNI4EnqKC1rPaZHwp/rRBDeSARIJ3jPSE3yIYaCMrZCTvXL2IT9uKSVTJ4fp6OJAwKoogA6QOAMRr0rB5228Fm6pLAKP+gQO0mCWtmM3B26OPh/3o7emeMF0dBAP343SUKGUIcTuqcCXN05nISSZOItoDhF2mgOdtee+zda9NPRhfOredghEDXIRL7nYZ2M4p85Pzmx1rgNmXI42BYEjLvH6Ufv/TDyBfYyK05wejvPUbQSUcnz+9MDzh4kMj9Qx9Wbg7+aAQYnZAFk7G71Z7KSPcgL7acZZ5W6zihE6NroUSuZrEwoyY/PFUEf9OW9Y0cV65DWk7+KoUgdg6dQHlenmin1MwGEuwoy2xSkddI0tqZ3giVTVKwA9dHyEYMzsu763eiXoy96HbOmBojh6N3RDu2kmc7A6lqyd7Ehui/6O4EkUC9jsq0xeWm92IKvOlpwTaYv3o3vRny/NAcmOJvYa2LJdhljNvzDXbnKFBrZBMRyvnysyV8HVi395igJm+Urz9+LNWbb0HJkBu9snZg+72zNxGj/loaG5NAAmCiEZlZ2Y8bwvys9/TsCez77vbXLtUZOIyWYpGLqsub74N+NqVi4ToBoE3NMitnr59efcFF9qlPft9hLSj0npTjDOz5hr6JI/n462dW+Wkhv/5afM8jNqiSKYirUlPh+86G/Z26NOmQK7h0aZaBG+nxhm9yaLYd/+i+nUQcH9n7KuDUI7rtN/cIRrf5v3yK1q1cPz+K9mKjlBKEoM/sUKSilwzJuBGZ02Z1u08FU7khIbcnjSbSsh8xt+8EUnvaNxlEBkpnQ/rYq1SjUYiZS5pjOnCRGvc4aE2YJB39J6J2IdJDisELz7uqBItFvX0lz5xWs2aMSi5c/ZBRzlA88RUFFLFp7BvBTc/N/hkOsq7K1GgeMSFhcsOB6sIC/QD0s/uU74zjFqa4eSeeoZZVd69kvogu/sea92CVjbdVWCcEehRBdjnimPw+t7TnxIlbfuONVvqy8l1odk9wKtqU7bRNHvCi3Y7kFtcEMDH2fZSwcAWiPg9FCifPg0l5TNXL0XPLPWi8L3tuj0b/q9U+UaxYNFO5q9VKzWjsCspHcx1tS3z4zHo9g1o3oPz5KmER8OGzpqkouM7VXPT+iE7F6rdRZ+dbERTux7KH/DoKPc571S/+BEDQ6PLRPLmh9P5gLcuHIdxiX/JzZ4EQ+mjGAf6oBHgpbsbFsYifUulgRH/TvJcpLlyrudGzWgjgpyoMag3rTq8s8e4gGHykujkgMZttyyggvPzSOikiLp6Kn6Sd/6ltLnZFKh8mhjuMqBOM09tJTQHzZ31SR2oVLZlC/DF3GSJY6xmZ6mRQdVg1cgha52JjVCgXwfC48VsRUajYlY/zw2K2JH3BlzQ15asZ2hyLV0s0nAQron21D9sefeqEaWXQ5YCrxfbx/K4Nudl9xftT91+AuzwzOmPDM78DSP5yEH4zOlFse7SejSXhCvx5fWIR8RCx+1hll7sPo4UksSz8aGGWv9V6X+SjcYj5bKHbPumZXptwpQ4u3uw0zlLFQSWZKztMmCSyFankS2UKcLNcGmvlqCJpaWcZ2s7FffiVQlFMHBdqqkvi/utiqfQTxjtNdYwbFaLZ8fBasv/VCd6olGCMkoleIJe94TAGRbPTzxIlbuUAKC5ZwVP9pjzg3cfjvoRaD4sCJj9kLoxeEcgNrP7E+sEv7eJ83qo+sfiLkiACjhw+q3ToRHZanEA7q7IvWdu3psr1J1ilvn0r6tiZ3YxKoIb9KueAjPHRee+2It4ah+5lxi+G5seXZrNsqTJPCNlI5iukoVSMHQRJYXP8irdCbAr49VnLgBeK5+v0nsSSo3C3f82sNi+PLxp0q+t7s0DbFYcegE5qXLr5pzI0H39pg+NPUFJCupECxBIHYxdf04X/xxi8+Z6VS9oaa8ZQ5UgtNbfjAdLPN0sjdv2E8kNexlxH7yvY1Ud9CGuCwMeyTxeaDKnY2KAh5+BUyV0HaGE8cK1CsYqpABHhiDCP7sHpm4GP56JPT4oJsjcQQSHrb6NMsJr8xE2CvIZ6hEWK2wgD+Cnc8j6kM/HrMWfZYCaStrDdQoSjGFm21ih1LXHNk54kO9MILhCzcr4FWabb8RktvYFAeWqVtZDnsP3jpu4NUR8+uH80ucivGRDJbUkaG5p38wsNFkUkGAaVGCtkC3diAMdg1emx21By1nzVG0OF8m5iVnFs7RTjhqIjCbljREqSvkebNvp94kQA4Znv3tlqGJhdnTRWGHGX4AEDXJgm21gDhb+nq1MJxFTuTxbCf0guEDD0ZMtvrEyo1dAdxFLiSlz83WPTAoWStRCAbt4k7nd4uaBu/Ml6puo/0SvhtWi4ZpFIZeFKKkVroY2WgPeJDNCIBDJM0BquzrHvcSZkvJUE3QVmvTxEJVS8sL6COIal5b8qw564hJCxXMjYaj9cBdbyH5p+bFA4tC8gCxT//eDShX/Aoj0im7JtehnOVREUwx+nUrsmFwNAWgB4IiQl2OJsv+t3//SUoWcO79TeA7pbnXVwRy/4odIxMKzgFIGtj7sLbM3dOFGDovAoMxf8+45H+qLoJfaSmCZyu8wMXuTZ6Vrl1nZTlcXQh2sC9i0YtXuU50TQzzcM2onJXmYDXzM/H/1sDDCrA6m0J6Y5ZZCvR+gCxeK8Q9YNMfr8AoqMj0O5eCoxpOATL/UUSQ+Tvj5ZrGjX1IAj9wWk+hhNMDcVlicVp6y7oTiIQYLBjLtg27BOficQ+QcMDPXQDjXz6LUzj3Fy9FQd+Odt/dNpDsbYMgAAAAQmX6uoKtM9l6Jla5YtCJIqF0Rl4Sk3e+pA8WCU2KkwIVdoX7bdS7lxBWiXK1Ia9TV1cs3ao8uF6T5wUCY+0H1a+u6AmF5R2wRKo8tHTKuvFrUfm4FAun3+UBhxrsYbbOoOduXXDYVhaRA75v/dZEGZQ9oV9lvG8ex7rZx5FVukFtldTJLLCiQATg6grBaliidIP3ioXTQ1UISiCf1sh/x8SvPowutfRMjxyaDuAWcmi3Bi2siYJNU+4hzGS79MYGNS9MsMNkfKOnstPSRwQ7A+NgpSv7v918RDnh3Fw+EX5peh3QglZGtSCd93Wy3sPyNMd7QBdCmM3Is7y7+abtPUFsDD4+xrzgR53xnYd+T7bI11XceeyqvGb/8nJKTj0kt3ORMHt94/zu2QADA89L3VShBFc+9x5BNn9fwB/m5JxcGsSsXmzqxrJWCfXlC9xXwPazbocJUfOCrGiDLOR+mTU7MDgT5P6qx1rMUBKfAQtH73CdAixufu3hWcPeOwGZhPkUhYmcVTjMFp/wD4q+QgbZWnIJUIXIbwuzy2SSHKEI5swJrFfJsJ60kn5+O9JPzLskYUAy8PSdd6AKMw74tnky3PIsDS5+xy9kWWIlhzP01vESYsAGejux3vJKoqF3snd47VMOM2TmlSvN5hNWZgx6jwxjJ1glvuLzVcULeK9uIBj3RTscT54NdnYMq7DTY7IvKAqq5WstvSpOq4kow0YCyS7BE14HqVhWvrqlg3nsn8m2cv+mxUEtMoRagJ1OYiYuE3JaCN64S5xdVG9tXm8MS/rC6zhquzKwcfZxFGWzXuIVRbYMbKuH8YWy5QXvnauL2GHbZAA2/QucVqkiXAhTzCK8tKo9j3kdbN4mJtXkUDwkpWNZUXHIl23xlq89+N8mtbPAngwHjZfH65SjiU4biJZg1OPvV36dv/mvCO8bh7cNclnOE2Yg1mebdLq67QNV6+xZyCb3k4kXfxZgaizNLQfH7Wp2nd18hNG24rsGvclV7MPXKyDfVMEe1G6F+Sd+Yr11niugWTjyR8qZPkOu/mSB8w7rXOOFODB2z/1bcC8xmEU90bxJJs25xuIDuy7uNt3OEyHO9DPAIWvvDgFau5rsakl5Nrue8seBz9U/0hDUrSRypq9EtArveU/+IWj0ESDKMy44tSgjhZ2tJ0CxJubyxJgwCosscfLkjOmgIlq6yQ0lkh2WluvLKBS2eagHFJwJ8myBdyAb7+H/LR/Itpp0TOuiEjlya5VsxaOpWIs7snmnYUGBTo99aFONKUX17GdvKnetXdfMOWkLFcqayoK30frB3S28lRv/B/wYmpxw9VL7+RG55kzQIG+v0JQah+YAPjDJprd40Fs2k74YjIJUSX2fhOzUHuaH2bD5ZSluJimDztPOGvH1EOZPmKi3iEvLCK6suXJaWWdd3S5fC0kvPNvg+8SOGnPXanr8xOUU0aq/tDhPGG50YV1gARlJcz5cnEnAIqb4SutWOA+skxLxWRfn+nE7lYgIpMT5xtLd7Emnkoj6M93HAd34mZk4L6+Od8ADbKWoTK33VtMo6RqjJORfGtcSxl67LynzmxJ0Xln7D2wHz2UWs7CzzNFRXjAI60Njt5flCQKWEWFVqUZXzwWF8AI9JKo/mjXvrJ4AtdfOTCX/Rb7hv/ZZ9jvmctnY+XYR+PIOE//NhG9nMhISAnd3eg9GaL+hrrj0B1UVotTHh8D9jjpNgeLLWbpQyrY3DvJdw1Fi+siEUBs4uKaYpn6nDGdRlSeD2hRTJXKsyHuFnTrJdkw6308JDNlE1xMMyzoMJ0qWzeY7sotKhXRIzkl8LemXYtYfDeMdo90WCnJxggFrJi7j5aXuPQPys8sPhMnV4dlHgMrF2m6BnCHknH9fjhc+KrmB7bQMIzi2sZ1URHgVKCqVCvmtInxPf890MRVkiHRpLu3NxWR8k452U3OS2sT7VDzZVATp5Rosnph8NJCe9huwfnCaNDkCS7AgfzC1wcm/RxD0aYRcF278n7N6Cb0zdbwx/CbOTRhoC0TCtmyGogH1+zRklMPi/9KR6nZO8jSq1SuctgxU6lXx4ATgaMY0HoNH6leAusQTaN8VBb2t71cm28d5eUxcemd8LO2IpOvdIw5Osq560dKx/SMbBdSogrAvuU7sFVutQ6S9seauWK5XatI1AEmbimFWZrT9YP6M03lrx2X+H1uVQsPhrJOej5Y/nzlT3Kzw67S9oWpKUzzzwVyYTHEOXWfhqy/YTAL2IfegYgk+ZnQ83JgX0ELqclzt+EnKomWsNptcxYPaNSDJ8RUzBXl37zbGITYjkAwJowpYPdIv3sJnu/xCdIwh/dZZ23c/rX3Ag7TUCyBjWrPMDAPVVMfCueCVPHr6RVB4Atzzkhyorj+3Ez07gnW3s3ctmKpHTyGfKlsp+g8gsienNdNHvsLvNA2+hYBbyabqhW4rQe1FjSNXyEZJsAyc7faRimPOmygSX1iJUFFxuosv1DK5WTbWagxmqw3TV0aEyK8SDE0yOkM6LTgXYNIk6R0+L5P6xTx4RdsvNAoIwvFBVHh0rJ4KNusEMDh3OLolhH/5rXn1M20gA7wPcgUcWD2XRpQaXvuIa0e7fIR6ixKKYOAZUPvht1aF+GoksQxyP5JMt47TQ1V5651hBqpL2CqBqq51sKsXv6oqPy3YIymbKUntYLp5ixrxhALOoHKD2KpofezGM4mdba/V+h4teBJHChtqtfOG8JEJ54yAUlcm2mKfctnrECad3j3WcYv6azl9FIu81W8NaCshXo6bWiQGG8fY3p70BCHUDi31yM51gjcoE9kWhRjmdM8BiSg78QXl9u+sDYopPX20//96qCj+9VCwDhTXhAcK7eZHn8+ZL6gmR+GlbQXnt5Ff+MX5B6nMgkS5crpjL/Hb1mq8Hc10nmSs2NyaLJLbDkX3u29YzpliYPwBRHzs7Nph/kOLoo30oUED8JDfjumxVIDD2oEKZolusAwAH2ugEDRxOJ5dYHjzkZacu68Col2KfbogNUQClMMFnOJ9tmG0oteKWAgnBEAsSD4epxJOCHGavTmyF59FMYYK0qh3UGO23jIemm/nabN7Z3Pyb8LbDbT0TQ4REBPviwrp1AnKBxK4gg35sYX88xWzGckh/+FYQFypm0RR1oMGZhybzVfvhY1X/CrPMwmevQOcZgkOKMYmBDK+op63WitMKsy4WThC2xaw3IzCJS9QKC0/X58I8iiz6JoYqOAO0MqvuZMgJfayP9v86kNlWQ7VjuejhESAtC4gya7XUUl1NvU6sVid8IvKvrR1jh2P9Ypc9Pwpyq5Z43wGPXxRQAKIA+boI5eXc6pB2nRZaqY0Xggp+pLOeByJADNqwndJIiET8ecTDPoyDMtOg3F6VkduWFWChqPKRuw3KKVeLGaf1tiervll1nnXWAqxEuXxtNkqUAgJRMsavgKSaiKkZVGYtsTDzwmpEYOVtosd0BTv3qps0KlxyuZh0lRnpABV2jE42FC+lUhyrKePAqaDguWblVawAdyrScEKsVfxZA4drCW/KllXVooi4RM1GkNJPRMOYlv7GvbCd4MWRkxXVxfwlVST157cQaDrtSdkx38qWqB/pImhmWje6SKSjOaLxlthkLOSZrJQYPOS4+lCrZW5r0R49/rDITg29OMCNG9gTaea6YYYOkX07KNaukoiYGdBmJp7sodqStdNelGClDI0HC9BVmrRib2IVpibcmi4inJcd52RvLf/PT7LX3WFm8F6k0bhQ+bMeCJ4pvmbYehEs3xu+Tv/8f6F53EVWnm6W8WdH2GF8A0DMFTrIhtqk4cPs38L9i7h4NznETJtOxg55trRLMzZbSGtnFIygFnE2VnEOWFnqeCoz3dX/Fq1yeGjbM5ZD0KrEjtRxvm49ju3ueNxh98+5TqmvLX+XTbbB0KAQlTeimjSx4qQJFSa/84xtvDmo/vQpew4w6glCjoNps4sxjLBUJ11IbXJidOmELXRNpp1cIsImUt31+BdN4Xh+tkOb/UWcQ0mJfIeBEVBw/amU7CD+5ngyT2dljf6VVjIqujxznyo5SDhHThkr5iD6hT2eyrtgItipZhnu3x+rJwlAe9jdAPWLhvQwIJxSN0X1db5tOPaf412lCFcZzCtfONAg71wPpPjU4xVBqVJlacfJ1Nu0NyRTsC5e6LBbCxi4K+mRe48iqS8WvWUenMI/X3O6q4Yx3h7z/zSsDyRxXDJXqyas+mSxoN/2WBZORkf7g/9uUnF5uYEUFHPtj1Y8KqqMQVmo7mIcw1C0kDbvMk3yitgUGeGn/3TdcY6PeWfWdvWMRUhBJeTXQJSiP8MMZBooMIs9ErEG859jfNt/M5YZNZV37kWMQM5U2c64RThcdxwlwdArWBAb2dqw/Y+rjK6AjZmkxX4LgeZYzz0w8ec6HHZjqOFbqC+gAtqUi73XXyvMYe/r7i8PqI0SUsUd2Rrg0zgLOww/gN0PjC5RQ76Nf/9c7Pxr+TGlkX5QEDeQCYEHYLahU6dgDprgvvGbX23kcV4ReD2Xw6wSsqcjXOlXOzdZ3uR0pzfgBi3dTAkEEkRf1vP7wJuBKOCGkZdcIG6oQckjJObVyzAVfk4IYsR4VRqVXFvUjc0PhbSzG8YI4Hvh9xwp6AY8nApJE3XybZxDPpi6GUk9T3F3xA9duvHu/ilKeZ0jSOy5Z/0LNr+TAVfVEIoFNRz9wlwXtJoJu6dXTKje7akVpS3Xa3yLeF2UrISwSLfua9o7e8KulmQ8480AEOJ25xw6EVYXLVCpnWokVLp44o+Swn39CeESN6wcOa2bUoV0f+JQx5dlTPULbTCHcbnOQ6m0eXG8icOiwZxAz02NewkaikG0BaAM1iW8KiOoxUWJBi3AkOtN9K484qiUrGChwrj2AAAeeNd+rgyoqA5crz+NMi+DRwcSwd8Ga/FG/rhzRLOcOYhj9sRyHsi7Y0AEFr1Msii3gxNXNoRq21VZxWcAAAVH3mlsYMeHfN51jU+RiUpNPd2mBmGI8wyQkuHRc8gFPsTWh96SsGVQ9fsbyVtiW+z0eraVOBZZo4zesV2ByQfUOfx+Ijv+nIQu9yfuM5EGFs1vrqlxlABJbmpiCDpsoTOhUsmOWj03QKWmWWtkoAHCtIoUwznbb/hgTFm8m3u68ian07XMmidOUvNBxE2ymL4UuKsu5x/EyEDxsoA+1d5wW0SunQDoWXrTtCbRXkOY9yzPp6uRwhwEXibYKzJ1ZcNqAdQylhiOX9QU5rNqJ7YzwJ65lz/AaWe+YAEZKVyCfTDprWJcGqFRYzZd8nP4pUrPRUDWx2JF43VL03oVRKwWlxcTlmwdQH+Tt9U3ycV1kDo3rCzD8hGQcuq9usyD0yDCGywcrqRpKhHsQe1iFcu2iXDQgP84QSUdi+SWJq04PeCeN2/y7hz3H071mC4KCn0FRsb7NuVKXMMeJf9z8WzhH00Dsa29jewUiH57a2SmYU4HGZW5mBpkPfSWFKNaWstaKdaa/wbdvCzUUk2Ef/MjmSTQlQ77JDCUVSkBNfXKkt+FYWDB6ur4oiYv1StWWVH3qwS//p2S4KLERiDxGZNvq02dR5cCm6W8QvlXKS/6OeLG4zP6KhcO6aapliVpgA4fHjpidB0Uj+KrGiRZdYE8PJRHS8vvZMyXMqekoCVpHFGXjlLJ3scsH2x64YYKyMCIBURX40wvu+5FTkgzI7tJBO1sjWHMTGQsPYkq91XGG4982fkO9W4oiozm8FrU1LiXaXgmdhb6DQOmduXbHcOvbD3TVVp6Ya71HgoQa74NeLfPx6MRpAcfcDY8IJCjR/wcuVN6xWtx1zFh9JHmSiNFOdP6PZiqRZHdODtCOaywKIP5rOQPNYLU8uh8wdE5DJfQFarwnotjlLhPKcK2ECFM6pOy+aBrBs4kCzGWJpPGsxvP3agZw7qIRAvjEkqiuV6NEbe12xslXJ2aGJstKJd7V7AWug1p5KVaTp4hItl9YZADVgSk3p/h3/C6M4znofvAn0RU/HlHdKy6/2KiqE7gCrGcvkJdjjS8eHV9HVynDg1QCedkfKdJutkr+TEbnNRPBOpECF+k71ITHMcNqfFtl1j5fDuRsQSBPM0kvb0WnxSzEEftfCAZb2vIAYiXbc/eK4g0EABp1Luw3SNYqQvvVEyfbJqGNHn8FqD39g2POVlR98tLTHuKPYq1kP7aJa8hXX+chkuUmh4QWZGeWlvp/1KOSlflKvs8WAHHWeyv6uOhfICa1xPOI2SqO3LbRh8Nr/cvJB9FemrgIrhuu0OBNyUt/JRDmLTXTaZ3rH2/ZgWwUK2Hky2xI1DvDWWTenyQu3D2xDXqBSUsCsRriJsw/HNgTmcvT1nJ2/gASJKr1TNpLZW7vsVLPAxRv34Ak3jSO2zoprkGsy0VkLKN/8YIxnucVzK+l8MP2ClBBaNAxpMsQv1/SLcj4eBdiMXYwGxFlDJWF+jOh+eEi35NPyf9oAPXOkZhMsIKuXvfDhNONjx4SalNIvJQo2xku4p2uiELyuB3FlTuBqGuaP6nYlR3n4D8g7XHbzx/1rkplN1DcV8/sDVA/kZmGUukM8acF25Af9XJ4VNPLY8E4jbvmM6Fue/k8YN0OILlwHGyqJfvGzWkYZQCGdRkhyvZYHQRHoKfG1Pk46cp8K2ngTe+aeVb/IS6TfP4g6a1Zbow54mt+RHmmiIcFJcEWnPwaNqWpP7weFOZ0CNYgpG67sVfbQ0rMmaWlVJYfTvsDGERE4aZiDMSUzCUzvJS+Zy56qLxVcEvkKXVls5soSpzZqdFZRXltPRW8MxTnfsPiCshw3oH47U62Faop8oKO3XX5tEomIAo3ZieLQ0lQqPfOudHxKgDkF+R33fWFQKXeTpguse+kc8s2rlrmWxZKS3+whXxCIcT5KbvpVKMbh25IIhqcHv0MAUzD5qVO1MItlcjGiyTtMl8n7l4EWSMcIgP2Po6Vg3MuAiAGUr61ZMwKPgdD/AEsSmsBufLG02c+YEjyC6THTffQw5ANjXM63M3jBvmxl6BGRBCh3wGSjaz1vPFzgScF006NZjTxNM9VmrVeIMupYrzT66Sti6tYWBy6hTouRPP0HJ1lI/k80auxU4eYwOsO22qKWz+ZStBCfH6wIfwiS+8zsssWavGNjJA65C+uk3n/MIEMh0m4zJ51EgsF00LayME5TwO5eA1YdcZxJZL3QA5IsFexG0lAr55R+XNZQR2jX3tucwOjkl2JxIy0T6RKeAnc6ApCul3Ybcf/78R4FDAi9/CTw7ojEWHCRx6YDVQpDbTtX5fHZX53CD1E4IeUv5/p4Nr4ysGSqxb/iodb08aG7yeSPwnpW+iWNCNgnjPupmnjSqWtDrQXIx0s73iti6zeqDwLyX1IudcGLjx4rNaba9PlX647XW1nw3Mp2ZeDAt7WGxlAp7Gur4+UrH9LYThpMA4QahDOI40QrYVA01lebTMBWHUrM9LDoC5G4ItOrPyHGEvTLvi3mrt0p28W9if8v66P5RKXR0hOH6IE87hSG3YiagiBV+YGTjakGS3Cfa/+RCt2y4SXW7Q6mTCVZN9qFm5JoNnhksGZGj8mF7jB8mPA7YlxK2X+I69kMXhGy6LDc1wLIfkayuHBGGz/EorNNENNkb3tK+HQuoUKIrO2SAD/fWMiJFG5aqwhMHFJh6dJKrlz98EYIZFYVcBJT1xlEVJjqgPoQuNlmSZ47Xcn4+YqcNL5n2fHk29In17BNhzNkiK556XxhEmWqHmrH2EI8BVKPRILuxer2twRznD/bLm+j1HAmpMWlO+wWehu8UqFC4PIrL1WeYUt6J1ovRAACyKM4bG9Pgx9ZHOmwNWvskOuoe9u41Qn44P0QRwi4IBLKdq3pk/3zORUaRnGl7OJAsRoMBp5OCkCnp4UdYTH4zeRRQagNp80+nx3RV8x4mdHdtxmmDMMLRg5tIPcPfk8nhE1mgqY4zm5azw0gsz7BA6uTo8Dqs6TBuM8IS4AqtskPL1RRC0aT3yYSdAuMOy91tNOF4AJ1kmJc9/COZ95K2lSV9mUVS32ZhECGUuOTxEOPhSa3NyS7B9U2pyLUO8R4+Fs48aaSHwxVrjjYrlvssAJCoEzBBHeu8LxoKWkjCMOPAUSL28JHMF3TPWNmqBw1m58Ya8uXeMHMMR6anxd9lXFQcoDjTs+GSaYFuItjj1Rk/pC3lrVu8UVqVv3dK6XnKBT16KaSmTVHDY4fuQ4HbME0MAWEK2kI1vAoy554BAvQYn89LkrkcLmwXTjKl/KtRa8xf/y6h58AL5tOyFxwiSDdyWdmEDnwyJW+vimJpYSegALuIlX5TvIka+7P9b1KogpCH2B6rV7RhAhMb1epbxmN/HyEfGoMymwtb4VACoelKCBSiPJ+Fi+21DaNX40jQUwQ9xT9JddtTWIgyYn//jck7GONE9ewAe73bE2pqN9aohQMkE8cJO14hEF/GwPaVKGNdg2GHOko7zQC93ar9T9M9if6p/0IGQvuiKUrYL9UEfW5V1w//kASPnLLgjjSsxmrnCoKHPnvUpUVyAqJZAB0Mck9MwlQZyTr6RTM8+TaL4xpbrUICNsVq7BOApvuF40NJTF2c1owF98xtyF4vg5YxRJX6tSwbsPJT96qK6wAadVMNXatOC2C2C4ScAcMMb+FQAAAAAAAA==",
    cc: "data:image/webp;base64,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",
    eigo: "data:image/webp;base64,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",
    fish: "data:image/webp;base64,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"
  };

  // games/eigonou/game.js
  var HOW = [
    { w: "g", f: "joy", t: "\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC\u306F\u3001\u7D75\u3092\u898B\u306A\u304C\u3089\u82F1\u6587\u3092\u7D44\u307F\u7ACB\u3066\u308B\u3001\u82F1\u8A9E\u306E\u30B7\u30DF\u30E5\u30EC\u30FC\u30BF\u3060\u3088\u3002" },
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
    name: "\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC",
    right: "game:eigonou",
    prefetch(core2) {
      prefetchEigo(core2.base + "g/eigonou/");
    },
    // 町で遊んでいる間に先読み
    async mount(el, ctx) {
      if (ctx.opts.episodePractice === "want-to") return mountEpisodeFrame(el, ctx);
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
      await window.__EIGONOU.start(el, ctx);
      el.querySelectorAll(".top h1").forEach((h1) => {
        h1.innerHTML = `<img src="${LOGO.eigo}" alt="\u82F1\u6587\u7D44\u307F\u7ACB\u3066\u30E9\u30DC" style="display:block;height:44px;width:auto">`;
      });
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
    if (!GAMES[g]) {
      core.ui.toast("\u3053\u306E\u30A2\u30D7\u30EA\u306B\u306F\u300C" + g + "\u300D\u304C\u5165\u3063\u3066\u3044\u307E\u305B\u3093");
      return;
    }
    Promise.resolve(core.host.open(GAMES[g], o || {})).catch((e) => {
      console.error(e);
      core.ui.toast("\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F:" + String(e && e.message || e).slice(0, 80));
    });
  };
  core.host.open(GAMES[app.games[0]], app.opts || {});
  {
    const b = document.createElement("button");
    b.textContent = "\u{1F4D2}";
    b.setAttribute("aria-label", "\u52C9\u5F37\u30CE\u30FC\u30C8");
    b.style.cssText = "position:fixed;right:0;top:46%;z-index:2147483000;width:34px;height:46px;border:0;border-radius:12px 0 0 12px;background:#ffc93ccc;font-size:20px;line-height:1;padding:0;box-shadow:-2px 2px 8px #0004";
    b.onclick = () => core.drill.open({});
    document.body.appendChild(b);
  }
})();
