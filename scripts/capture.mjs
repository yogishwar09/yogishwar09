// Deterministic renders of the Motoverse scene (headless Chrome + SwiftShader).
// Usage: node scripts/capture.mjs <job> [outdir]
//   jobs: stills | riding | gameplay | all
// Requires: Playwright (npm i -D playwright) and a Chrome/Chromium binary.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const job = process.argv[2] || 'all';
const tmp = process.argv[3] || path.join(ROOT, '.frames');
const exe = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const url = 'file://' + path.join(ROOT, 'game', 'index.html') + '?capture';
const save = (file, dataUrl) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); };

async function page(w, h, hideUi = true) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto(url);
  if (hideUi) await p.addStyleTag({ content: '.hero,main,.scrim,#hud{display:none!important}' });
  await p.evaluate(([w, h]) => { MOTOVERSE.resize(w, h); MOTOVERSE.hard(true); }, [w, h]);
  return p;
}
async function still(name, shot, w, h, z, v, lean = 0, warm = 45) {
  const p = await page(w, h);
  const d = await p.evaluate(([shot, z, v, lean, warm]) => { MOTOVERSE.setup({ mode: 'attract', z, v }); return MOTOVERSE.advance(1 / 30, shot, warm, lean); }, [shot, z, v, lean, warm]);
  save(path.join(tmp, name), d); await p.close(); console.log('still', name);
}
async function sequence(dir, shot, w, h, z, v, frames, opts = {}) {
  const p = await page(w, h, !opts.hud);
  if (opts.hud) await p.addStyleTag({ content: '.hero,main,.scrim{display:none!important} #hud{display:block!important}' });
  await p.evaluate(([shot, z, v, o]) => { MOTOVERSE.setup({ mode: o.hud ? 'play' : 'attract', z, v, demo: !!o.hud, cd: 0, t: o.hud ? 3.2 + z / 42 : 0 }); MOTOVERSE.advance(1 / 30, shot, 40, o.lean ?? null, false); }, [shot, z, v, opts]);
  fs.mkdirSync(path.join(tmp, dir), { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (opts.hud) {
      await p.evaluate(([shot, o]) => MOTOVERSE.advance(1 / 30, shot, o.sub || 2, o.lean ?? null, false), [shot, opts]);
      await p.screenshot({ path: path.join(tmp, dir, `f${String(i).padStart(3, '0')}.png`) });
    } else {
      const d = await p.evaluate(([shot, o]) => { if (o.lock) MOTOVERSE.setup({ mode: 'attract', z: o.lock.z, v: o.lock.v, t: o.lock.t0 + o.lock.dt * o.i }); return MOTOVERSE.advance(1 / 30, shot, o.sub || 1, o.lean ?? null); }, [shot, { ...opts, i }]);
      save(path.join(tmp, dir, `f${String(i).padStart(3, '0')}.png`), d);
    }
  }
  await p.close(); console.log('sequence', dir, frames);
}

if (job === 'stills' || job === 'all') {
  await still('rider-background.png', 'wide', 1920, 1080, 300, 45, .1);
  await still('hero-plate.png', 'wide', 1600, 640, 300, 45, .1);
  await still('hero-closeup.png', 'hero', 1600, 900, 300, 45, .12);
  await still('mobile-plate.png', 'mobile', 1080, 1350, 300, 45, .08);
  await still('terrain.png', 'terrain', 1600, 800, 935, 30, 0);
}
if (job === 'riding' || job === 'all') await sequence('riding', 'wide', 880, 352, 280, 45, 40, { lean: .1 });
if (job === 'gameplay' || job === 'all') await sequence('gameplay', 'chase', 1280, 720, 905, 55, 75, { hud: true, sub: 2 });
await browser.close();
