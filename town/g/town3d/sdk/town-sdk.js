/* Town SDK v1 — 単発アプリ(HTML)を「ほしみや町」の建物に入れるための小さなつなぎ。
   町の中で開かれたときは町と通信し、単体で開かれたときは何もしない(そのまま単体アプリとして動く)。

   <script src="town-sdk.js"></script>
   TownSDK.onHello(ctx => { ... })      // ctx: { player:{id,name,look}, audio:{bgm,sfx,voice}, coins, params }
   TownSDK.addCoins(10, 'clear')         // 町のコインを増やす → Promise<残高>
   TownSDK.save('best', 120) / TownSDK.load('best') → Promise<値>   // 町側の保存(単体時は localStorage)
   TownSDK.event('result', { score })     // 町へイベントを知らせる
   TownSDK.close()                        // 町にもどる
   TownSDK.inTown                         // 町の中なら true
*/
(function (g) {
  var inTown = g.parent && g.parent !== g;
  var ctx = null, hello = [], audioCbs = [], wait = {}, seq = 0;
  function post(m) { if (inTown) { m.town = 1; g.parent.postMessage(m, '*'); } }
  function ask(m) { return new Promise(function (res) { var id = ++seq; wait[id] = res; m.id = id; post(m); setTimeout(function () { if (wait[id]) { delete wait[id]; res(null); } }, 3000); }); }
  g.addEventListener('message', function (e) {
    var m = e.data; if (!m || m.town !== 1 || e.source !== g.parent) return;
    if (m.type === 'hello') { var first = !ctx; ctx = m.ctx; if (first) hello.forEach(function (f) { f(ctx); }); }
    if (m.type === 'audio') audioCbs.forEach(function (f) { f(m.audio); });
    if ((m.type === 'coins' || m.type === 'storage') && wait[m.id]) { wait[m.id](m.type === 'coins' ? m.coins : m.value); delete wait[m.id]; }
  });
  var local = { get: function (k) { try { return JSON.parse(localStorage.getItem('townsdk:' + k)); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem('townsdk:' + k, JSON.stringify(v)); } catch (e) {} } };
  g.TownSDK = {
    version: 1, inTown: inTown,
    onHello: function (f) { if (ctx) f(ctx); else hello.push(f); if (!inTown) f(null); },
    onAudio: function (f) { audioCbs.push(f); },
    addCoins: function (n, why) { return inTown ? ask({ type: 'coins', amount: n, reason: why || '' }) : Promise.resolve(null); },
    save: function (k, v) { if (inTown) post({ type: 'storage:set', key: k, value: v }); else local.set(k, v); },
    load: function (k) { return inTown ? ask({ type: 'storage:get', key: k }) : Promise.resolve(local.get(k)); },
    event: function (name, data) { post({ type: 'event', name: name, data: data }); },
    setTitle: function (t) { post({ type: 'title', title: t }); },
    close: function (result) { post({ type: 'close', result: result }); },
  };
  if (inTown) post({ type: 'ready' });
})(window);
