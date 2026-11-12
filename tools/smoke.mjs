// 公開前の点検(lab-preview の組み立てで毎回使う): node tools/smoke.mjs <置き場のURL>
// 例) node tools/smoke.mjs http://localhost:8080/   (その下に town/ と town3d/ がある形)
// 統合アプリ(town/)と3Dの町だけ(town3d/)を本物のブラウザで開いて、
//  - 画面のエラーが出ていないか
//  - 読みこみ失敗(404など)がないか
//  - 住人の3Dモデルが全部読みこめたか(models/versions.json にあるもの)
// を確かめる。1つでもだめなら終了コード1(公開しない)。
const base = (process.argv[2] || 'http://localhost:8080/').replace(/\/?$/, '/');
const pw = await import(process.env.PW_MODULE || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// なくても動く作りのファイル(無いと 404 になるのが正常)
const OPTIONAL = [/\/apps\/hunt\.json/, /\/models\/versions\.json/];   // versions.json は点検が自分で読みにいくもの(モデルのない古いブランチには無い)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickText = (page, re) => page.evaluate(src => {
  const re = new RegExp(src);
  const els = [...document.querySelectorAll('button, a, [role=button]')].filter(e => re.test(e.textContent) && e.offsetParent !== null);
  els.sort((a, b) => a.textContent.length - b.textContent.length);
  if (els[0]) { els[0].click(); return true; } return false;
}, re.source);

let failed = false;
async function check(name, url, enter) {
  try { if ((await fetch(url)).status === 404) { console.log(`--  ${name}: このブランチには無い(点検しない)`); return; } } catch (e) { }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], bad = [], glb = new Map();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => {
    const u = r.url();
    if (r.status() >= 400 && !OPTIONAL.some(re => re.test(u))) bad.push(r.status() + ' ' + u);
    const m = u.match(/models\/([^/?]+\.glb)/); if (m) glb.set(m[1], r.status());
  });
  await page.goto(url, { waitUntil: 'load' });
  await sleep(2500);
  await enter(page);
  await sleep(enter.models ? 15000 : 3000);   // モデルの読みこみ待ち
  if (!enter.models) { const ok = !errors.length && !bad.length; console.log(`${ok ? 'OK ' : 'NG '} ${name}`); for (const e of errors) console.log('   画面のエラー:', e.slice(0, 200)); for (const b of bad) console.log('   読みこみ失敗:', b); if (!ok) failed = true; await page.close(); return; }
  const ver = await page.evaluate(async u => { try { return await (await fetch(u)).json(); } catch (e) { return null; } }, new URL(name === 'town' ? 'g/town3d/models/versions.json' : 'models/versions.json', url).href);
  const want = ver ? Object.keys(ver).filter(f => f.endsWith('.glb')) : [];
  const missing = want.filter(f => glb.get(f) !== 200);
  // 住人の足元: 地面(0)から大きくずれていたら(埋まる・浮く)だめ。歩いている途中の上下があるので 6cm まで許す
  const feet = await page.evaluate(() => Object.entries(window.__glbFeet || {}).map(([k, f]) => { try { return [k, f()]; } catch (e) { return [k, null]; } }));
  const sunk = feet.filter(([, v]) => v && Math.abs(v.foot) > 0.06).map(([k, v]) => `${k}(${v.foot})`);
  if (sunk.length) { errors.push('足元が地面からずれている: ' + sunk.join(' ')); }
  const needModels = want.length > 0;   // モデルがまだ無い古いブランチは、モデルの点検をしない
  const ok = !errors.length && !bad.length && (!needModels || (glb.size > 0 && !missing.length));
  console.log(`${ok ? 'OK ' : 'NG '} ${name}: モデル ${[...glb.values()].filter(s => s === 200).length}/${want.length}`);
  for (const e of errors) console.log('   画面のエラー:', e.slice(0, 200));
  for (const b of bad) console.log('   読みこみ失敗:', b);
  if (missing.length) console.log('   読めていないモデル:', missing.join(' '));
  if (needModels && !glb.size) console.log('   モデルを1つも読みにいっていない(町に入れていない/読み込み先がちがう)');
  if (!ok) failed = true;
  await page.close();
}

const enter3d = Object.assign(async page => {
  await clickText(page, /町へ出かける/); await sleep(1500); await clickText(page, /^\s*あとで\s*$/);
}, { models: true });
const enterTown = Object.assign(async page => {
  await page.evaluate(() => document.querySelector('button[data-3d]')?.click()); await sleep(8000);   // 「街へ行く」
  await enter3d(page);
}, { models: true });
await check('town3d', base + 'town3d/index.html', enter3d);
await check('town', base + 'town/index.html', enterTown);
// 単体アプリ(APPS="stream cards ..."): 開いて、画面のエラーと読みこみ失敗がないか
for (const a of (process.env.APPS || '').split(/\s+/).filter(Boolean)) await check('apps/' + a, base + 'apps/' + a + '/index.html', async () => { });
await browser.close();
console.log(failed ? '点検: だめ(公開しません)' : '点検: すべてOK');
process.exit(failed ? 1 : 0);
