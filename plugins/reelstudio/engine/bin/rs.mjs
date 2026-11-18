#!/usr/bin/env node
// ReelStudio CLI — the parts Claude can't do itself: voice, images, word timings, rendering.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME = process.env.REELSTUDIO_HOME || path.join(os.homedir(), 'ReelStudio');
const SRC_ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(HOME, 'engine');
const REELS = path.join(HOME, 'reels');
const BRANDS = path.join(HOME, 'brands');
const LOOKS = path.join(HOME, 'looks');
const FPS = 30;
const OR = 'https://openrouter.ai/api/v1';

// ---------- helpers ----------
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const log = (m) => console.log(m);
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { if (d !== undefined) return d; die('cannot read ' + p); } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function loadEnv() {
  const f = path.join(HOME, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
const KEY = () => process.env.OPENROUTER_API_KEY;

function models() {
  const base = readJSON(path.join(fs.existsSync(path.join(ENGINE, 'models.json')) ? ENGINE : SRC_ENGINE, 'models.json'));
  const over = readJSON(path.join(HOME, 'config.json'), {});
  for (const k of Object.keys(over)) base[k] = {...base[k], ...over[k]};
  return base;
}

function args(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return {pos, flags};
}

function reelDir(slug) {
  if (!slug) die('missing reel name');
  const d = path.join(REELS, slug);
  if (!fs.existsSync(d)) die(`reel "${slug}" not found in ${REELS}`);
  return d;
}

function probeSeconds(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out);
}

async function orFetch(endpoint, body, {raw = false} = {}) {
  if (!KEY()) die(`OPENROUTER_API_KEY not set. Put it in ${path.join(HOME, '.env')} as OPENROUTER_API_KEY=sk-or-...`);
  const res = await fetch(OR + endpoint, {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'X-Title': 'ReelStudio'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// ---------- brands + looks ----------
function loadLook(id) {
  if (!id) return null;
  const f = path.join(LOOKS, id, 'look.json');
  return fs.existsSync(f) ? {...readJSON(f), id, dir: path.join(LOOKS, id)} : null;
}
function loadBrand(id) {
  const b = readJSON(path.join(BRANDS, id + '.json'));
  const look = loadLook(b.look);
  return {brand: b, look};
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
/** Download a Google Font (woff2) once into ~/ReelStudio/fonts/<family>/ */
async function ensureFont(family, weights = [400, 600, 800]) {
  const dir = path.join(HOME, 'fonts', family.replace(/\s+/g, '_'));
  const meta = path.join(dir, 'files.json');
  if (fs.existsSync(meta)) return readJSON(meta);
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`, {headers: {'User-Agent': UA}})).text();
  const files = [];
  // keep the latin subset of each weight
  for (const block of css.split('}')) {
    if (!/\/\* latin \*\//.test(block) && css.includes('/* latin */')) continue;
    const w = block.match(/font-weight:\s*(\d+)/)?.[1], u = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!w || !u || files.find((x) => x.weight === w)) continue;
    fs.mkdirSync(dir, {recursive: true});
    const name = `${w}.woff2`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(await (await fetch(u)).arrayBuffer()));
    files.push({family, weight: w, file: name});
  }
  if (!files.length) throw new Error('font not found on Google Fonts: ' + family);
  writeJSON(meta, files);
  return files;
}
/** Merge brand + look into the props the Remotion components read; copy look assets into the reel. */
async function brandProps(reelDirPath, brandId) {
  const {brand, look} = loadBrand(brandId);
  const out = {...brand};
  if (look) {
    out.colors = {...look.colors, ...(brand.colors || {})};
    out.captions = brand.captions || look.captions;
    out.background = brand.background || look.background;
    const la = path.join(reelDirPath, 'assets', 'look');
    fs.mkdirSync(la, {recursive: true});
    if (look.mascot && fs.existsSync(path.join(look.dir, look.mascot))) {
      fs.copyFileSync(path.join(look.dir, look.mascot), path.join(la, look.mascot));
      out.mascot = 'look/' + look.mascot;
    }
    for (const x of look.poses || []) if (fs.existsSync(path.join(look.dir, x.file))) fs.copyFileSync(path.join(look.dir, x.file), path.join(la, x.file));
    if (look.font?.family) {
      try {
        const files = await ensureFont(look.font.family, look.font.weights);
        fs.mkdirSync(path.join(la, 'fonts'), {recursive: true});
        out.fontFiles = files.map((x) => {
          fs.copyFileSync(path.join(HOME, 'fonts', look.font.family.replace(/\s+/g, '_'), x.file), path.join(la, 'fonts', x.file));
          return {family: x.family, weight: x.weight, src: 'look/fonts/' + x.file};
        });
        out.font = `"${look.font.family}", ${look.font.fallback || '-apple-system, sans-serif'}`;
      } catch (e) { console.error('  (font: ' + e.message + ')'); }
    }
    // optional headline font (e.g. a serif), loaded the same way
    if (look.display?.family) {
      try {
        const fam = look.display.family, files = await ensureFont(fam, look.display.weights || [500, 600, 700]);
        fs.mkdirSync(path.join(la, 'fonts', 'display'), {recursive: true});
        out.fontFiles = [...(out.fontFiles || []), ...files.map((x) => {
          fs.copyFileSync(path.join(HOME, 'fonts', fam.replace(/\s+/g, '_'), x.file), path.join(la, 'fonts', 'display', x.file));
          return {family: x.family, weight: x.weight, src: 'look/fonts/display/' + x.file};
        })];
        out.display = `"${fam}", ${look.display.fallback || 'Georgia, serif'}`;
      } catch (e) { console.error('  (display font: ' + e.message + ')'); }
    }
  }
  return out;
}

// ---------- setup ----------
function setup() {
  for (const d of [HOME, REELS, BRANDS, LOOKS, ENGINE]) fs.mkdirSync(d, {recursive: true});
  const prevPkg = fs.existsSync(path.join(ENGINE, 'package.json')) ? fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8') : '';
  fs.rmSync(path.join(ENGINE, 'src'), {recursive: true, force: true});
  fs.rmSync(path.join(ENGINE, 'bin'), {recursive: true, force: true});
  for (const f of ['src', 'bin', 'package.json', 'models.json']) fs.cpSync(path.join(SRC_ENGINE, f), path.join(ENGINE, f), {recursive: true});
  const pkg = fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8');
  if (pkg !== prevPkg || !fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion'))) {
    log('Installing Remotion (first run only)…');
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: ENGINE, stdio: 'inherit'});
    if (r.status !== 0) die('npm install failed');
  }
  // seed looks and brands that ship with the plugin (never overwrite the user's)
  const seed = path.join(SRC_ENGINE, '..', 'seed');
  if (fs.existsSync(seed)) {
    for (const l of fs.readdirSync(path.join(seed, 'looks'))) if (!fs.existsSync(path.join(LOOKS, l))) fs.cpSync(path.join(seed, 'looks', l), path.join(LOOKS, l), {recursive: true});
    for (const b of fs.readdirSync(path.join(seed, 'brands'))) if (!fs.existsSync(path.join(BRANDS, b))) fs.copyFileSync(path.join(seed, 'brands', b), path.join(BRANDS, b));
  }
  const appSrc = path.join(SRC_ENGINE, '..', 'app');
  if (fs.existsSync(appSrc)) { fs.rmSync(path.join(HOME, 'app'), {recursive: true, force: true}); fs.cpSync(appSrc, path.join(HOME, 'app'), {recursive: true}); }
  const def = path.join(BRANDS, 'default.json');
  if (!fs.existsSync(def)) writeJSON(def, {
    name: 'Default', handle: '@yourhandle', language: 'it',
    tone: 'Diretto, curioso, frasi brevi. Niente clickbait vuoto: ogni frase porta un fatto.',
    colors: {bg1: '#0B1020', bg2: '#1B2350', accent: '#FFD23F', text: '#FFFFFF', muted: '#A9B1D6'},
    font: 'Inter, "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif',
    voice: {voice: 'JBFqnCBsd6RMkjVDRZzb', instructions: 'Energico ma naturale, ritmo da social, pause brevi.'},
    sayVoice: 'Alice',
  });
  if (!fs.existsSync(path.join(HOME, '.env'))) fs.writeFileSync(path.join(HOME, '.env'), '# OPENROUTER_API_KEY=sk-or-...\n', {mode: 0o600});
  log(`✓ ReelStudio ready in ${HOME}`);
  log(KEY() ? '✓ OpenRouter key found' : `! No OpenRouter key: voice falls back to macOS "say", images are off. Add it to ${path.join(HOME, '.env')}`);
}

// ---------- macOS launcher ----------
function installApp() {
  if (process.platform !== 'darwin') die('macOS only');
  const appDir = path.join(os.homedir(), 'Applications', 'ReelStudio.app');
  const mac = path.join(appDir, 'Contents', 'MacOS'), res = path.join(appDir, 'Contents', 'Resources');
  fs.mkdirSync(mac, {recursive: true}); fs.mkdirSync(res, {recursive: true});
  fs.writeFileSync(path.join(mac, 'ReelStudio'), `#!/bin/zsh -l\nexec "${process.execPath}" "${path.join(ENGINE, 'bin', 'rs.mjs')}" app >> "${path.join(HOME, 'app.log')}" 2>&1\n`, {mode: 0o755});
  fs.writeFileSync(path.join(appDir, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>ReelStudio</string><key>CFBundleDisplayName</key><string>ReelStudio</string>
<key>CFBundleIdentifier</key><string>local.reelstudio.app</string><key>CFBundleVersion</key><string>1</string>
<key>CFBundleExecutable</key><string>ReelStudio</string><key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><false/>
</dict></plist>`);
  // icon: mascot on a cream rounded tile
  const mascot = path.join(HOME, 'app', 'public', 'mascot.png');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rsicon-'));
  const set = path.join(tmp, 'icon.iconset'); fs.mkdirSync(set);
  const base = path.join(tmp, 'base.png');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xFBF4EA:s=1024x1024', '-i', mascot, '-filter_complex',
    "[1]scale=800:800[m];[0][m]overlay=112:120,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(hypot(max(abs(X-512)-330,0),max(abs(Y-512)-330,0)),150),0,255)'", '-frames:v', '1', base]);
  for (const sz of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(sz), String(sz), base, '--out', path.join(set, `icon_${sz}x${sz}.png`)], {stdio: 'ignore'});
    execFileSync('sips', ['-z', String(sz * 2), String(sz * 2), base, '--out', path.join(set, `icon_${sz}x${sz}@2x.png`)], {stdio: 'ignore'});
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(res, 'icon.icns')]);
  fs.rmSync(tmp, {recursive: true, force: true});
  try { execFileSync('touch', [appDir]); } catch {}
  log('✓ ' + appDir);
}

// ---------- new ----------
function cmdNew(pos, flags) {
  const title = pos.join(' ');
  if (!title) die('usage: rs new "<topic>" [--brand default]');
  const slug = flags.slug || slugify(title);
  const d = path.join(REELS, slug);
  if (fs.existsSync(d)) die(`reel "${slug}" already exists`);
  const brand = flags.brand || 'default';
  if (!fs.existsSync(path.join(BRANDS, brand + '.json'))) die(`brand "${brand}" not found`);
  fs.mkdirSync(path.join(d, 'src'), {recursive: true});
  fs.mkdirSync(path.join(d, 'assets', 'img'), {recursive: true});
  writeJSON(path.join(d, 'reel.json'), {title, brand, scenes: []});
  log(slug);
}

// ---------- voice ----------
async function ttsScene(text, brand, m, outMp3, flags) {
  const model = flags.model || brand.voice?.model || m.tts[flags.tier || 'model'] || m.tts.model;
  if (!KEY() || flags.local) {
    const aiff = outMp3.replace(/\.mp3$/, '.aiff');
    execFileSync('say', ['-v', brand.sayVoice || 'Alice', '-o', aiff, text]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-b:a', '192k', outMp3]);
    fs.rmSync(aiff);
    return 'macOS say';
  }
  const body = {model, input: text, response_format: 'mp3'};
  const voice = brand.voice?.voice || (model.startsWith('elevenlabs/') ? m.tts.default_voice : '');
  if (voice) body.voice = voice;
  if (brand.voice?.instructions) body.instructions = brand.voice.instructions;
  if (brand.voice?.speed) body.speed = brand.voice.speed;
  fs.writeFileSync(outMp3, await orFetch('/audio/speech', body, {raw: true}));
  return model;
}

async function wordTimes(mp3, lang, m) {
  if (!KEY()) return null;
  for (const model of [m.stt.model, m.stt.fallback].filter(Boolean)) {
    try {
      const r = await orFetch('/audio/transcriptions', {
        model, language: lang, response_format: 'verbose_json', timestamp_granularities: ['word'],
        input_audio: {data: fs.readFileSync(mp3).toString('base64'), format: 'mp3'},
      });
      if (r.words?.length) return r.words.map((w) => ({text: (w.word ?? w.text).trim(), start: w.start, end: w.end}));
    } catch (e) { console.error(`  (timestamps via ${model} failed: ${e.message.slice(0, 120)})`); }
  }
  return null;
}

// Use the script's own words (correct spelling) and the STT timings when counts line up; otherwise spread by length.
function alignWords(script, stt, secs) {
  const words = script.split(/\s+/).filter(Boolean);
  if (stt && stt.length === words.length) return words.map((w, i) => ({text: w, start: stt[i].start, end: stt[i].end}));
  if (stt && stt.length) {
    const t0 = stt[0].start, t1 = stt[stt.length - 1].end;
    return spread(words, t0, t1);
  }
  return spread(words, 0.05, secs - 0.1);
}
function spread(words, t0, t1) {
  const w = words.map((x) => x.length + 2), tot = w.reduce((a, b) => a + b, 0);
  let t = t0;
  return words.map((x, i) => { const d = ((t1 - t0) * w[i]) / tot; const o = {text: x, start: t, end: t + d}; t += d; return o; });
}

async function cmdVoice(pos, flags) {
  const d = reelDir(pos[0]);
  const reel = readJSON(path.join(d, 'reel.json'));
  const {brand} = loadBrand(reel.brand);
  const m = models();
  if (!reel.scenes?.length) die('reel.json has no scenes');
  const only = flags.scene ? new Set(String(flags.scene).split(',')) : null;
  const old = readJSON(path.join(d, 'timeline.json'), {scenes: []});
  const vo = path.join(d, 'assets', 'vo');
  fs.mkdirSync(vo, {recursive: true});
  const scenes = [];
  let from = 0;
  for (const s of reel.scenes) {
    if (!s.id || !s.voiceover) die('every scene needs id and voiceover');
    const file = path.join(vo, s.id + '.mp3');
    const prev = old.scenes.find((x) => x.id === s.id);
    let words = prev?.words, secs;
    const stale = !fs.existsSync(file) || prev?.voiceover !== s.voiceover || (only && only.has(s.id)) || flags.force;
    if (stale) {
      const via = await ttsScene(s.voiceover, brand, m, file, flags);
      secs = probeSeconds(file);
      words = alignWords(s.voiceover, await wordTimes(file, brand.language || 'it', m), secs);
      log(`  ${s.id}: ${secs.toFixed(2)}s via ${via}`);
    } else secs = probeSeconds(file);
    const hold = s.hold ?? 0.25;
    const duration = Math.ceil((secs + hold) * FPS);
    scenes.push({id: s.id, from, duration, audio: `vo/${s.id}.mp3`, voiceover: s.voiceover,
      words: words.map((w) => ({text: w.text, start: Math.round(w.start * FPS), end: Math.max(Math.round(w.end * FPS), Math.round(w.start * FPS) + 2)}))});
    from += duration;
  }
  writeJSON(path.join(d, 'timeline.json'), {fps: FPS, width: 1080, height: 1920, total: from, scenes});
  log(`✓ timeline: ${scenes.length} scenes, ${(from / FPS).toFixed(1)}s`);
}

// ---------- image ----------
const toDataUrl = (f) => `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`;

async function generateImage({prompt, out, model, look, refs = [], flags = {}}) {
  const m = models();
  let fullPrompt = prompt;
  const refFiles = [...refs];
  if (look && !flags['no-style']) {
    if (look.imageStyle) fullPrompt += `\n\nArt direction (follow strictly): ${look.imageStyle}`;
    if (flags.mascot && look.mascot) {
      refFiles.unshift(path.join(look.dir, look.mascot));
      fullPrompt += `\n\nThe first reference image is the mascot character${look.mascotDescription ? ` (${look.mascotDescription})` : ''}. Keep it exactly on-model: same face, markings, line style and accessories.`;
    }
    for (const r of look.references || []) refFiles.push(path.join(look.dir, r));
  }
  const max = m.image.maxRefs?.[model] ?? 5;
  const used = refFiles.filter((f) => fs.existsSync(f)).slice(0, max);
  const body = {model, prompt: fullPrompt, n: 1, aspect_ratio: flags.aspect || '9:16', output_format: 'png', ...(m.image.params?.[model] || {})};
  if (used.length) body.input_references = used.map((f) => ({type: 'image_url', image_url: {url: toDataUrl(f)}}));
  if (flags.quality) body.quality = flags.quality;
  if (flags.transparent) body.background = 'transparent';
  log(`  generating with ${model}${used.length ? ` + ${used.length} reference image(s)` : ''}…`);
  const r = await orFetch('/images', body);
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) die('no image returned: ' + JSON.stringify(r).slice(0, 300));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  log(`✓ ${out} via ${model}${r.usage?.cost ? ` ($${r.usage.cost})` : ''}`);
}

function pickImageModel(flags) {
  const m = models();
  if (flags.model) return flags.model;
  if (flags.hero) return m.image.hero;
  return m.image[flags.tier || 'model'] || m.image.model;
}

async function cmdImage(pos, flags) {
  const d = reelDir(pos[0]);
  const name = pos[1], prompt = pos.slice(2).join(' ');
  if (!name || !prompt) die('usage: rs image <reel> <name> "<prompt>" [--hero] [--mascot] [--ref file] [--no-style]');
  const reel = readJSON(path.join(d, 'reel.json'));
  const {look} = loadBrand(reel.brand);
  const refs = flags.ref ? String(flags.ref).split(',').map((f) => path.isAbsolute(f) ? f : path.join(d, 'assets', f)) : [];
  await generateImage({prompt, out: path.join(d, 'assets', 'img', name + '.png'), model: pickImageModel(flags), look, refs, flags});
}

/** Generate an image for a look itself (sample frames, mascot poses). */
async function cmdLookImage(pos, flags) {
  const look = loadLook(pos[0]);
  if (!look) die('look not found: ' + pos[0]);
  const name = pos[1], prompt = pos.slice(2).join(' ');
  if (!name || !prompt) die('usage: rs look-image <look> <name> "<prompt>" [--mascot] [--hero]');
  await generateImage({prompt, out: path.join(look.dir, name + '.png'), model: pickImageModel(flags), look, flags});
}

// ---------- bundle / frames / render ----------
async function bundleReel(d) {
  const {bundle} = await import(path.join(ENGINE, 'node_modules/@remotion/bundler/dist/index.js'));
  if (!fs.existsSync(path.join(d, 'src', 'Reel.tsx'))) die('src/Reel.tsx missing');
  return bundle({
    entryPoint: path.join(ENGINE, 'src', 'index.ts'),
    publicDir: path.join(d, 'assets'),
    webpackOverride: (c) => ({
      ...c,
      resolve: {
        ...c.resolve,
        alias: {...(c.resolve?.alias || {}), '@reel': path.join(d, 'src'), '@rs': path.join(ENGINE, 'src', 'lib')},
        modules: [path.join(ENGINE, 'node_modules'), 'node_modules'],
      },
    }),
  });
}

async function prep(slug) {
  const d = reelDir(slug);
  // Remotion caches its headless Chrome under <cwd>/node_modules/.remotion: keep it inside the engine, not wherever rs was launched
  process.chdir(ENGINE);
  const timeline = readJSON(path.join(d, 'timeline.json'));
  const reel = readJSON(path.join(d, 'reel.json'));
  const brand = await brandProps(d, reel.brand);
  const R = await import(path.join(ENGINE, 'node_modules/@remotion/renderer/dist/index.js'));
  const serveUrl = await bundleReel(d);
  const inputProps = {timeline, brand, reel};
  return {d, timeline, reel, R, serveUrl, inputProps};
}

async function cmdFrames(pos, flags) {
  const {d, timeline, R, serveUrl, inputProps} = await prep(pos[0]);
  const comp = await R.selectComposition({serveUrl, id: 'Reel', inputProps});
  const out = path.join(d, 'frames');
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  const at = flags.at ? [Number(flags.at)] : null;
  const shots = at ? at.map((f) => ({name: 'f' + f, frame: f})) :
    timeline.scenes.flatMap((s) => [
      {name: `${s.id}-a`, frame: s.from + Math.min(18, Math.floor(s.duration / 3))},
      {name: `${s.id}-b`, frame: s.from + Math.floor(s.duration * 0.8)},
    ]);
  for (const s of shots) {
    await R.renderStill({composition: comp, serveUrl, inputProps, frame: s.frame, output: path.join(out, s.name + '.png'), scale: 0.5});
  }
  log(`✓ ${shots.length} frames in ${out} (half-res). Look at every one.`);
  if (flags.strip && !at) {
    // one contact sheet per scene: 5 moments side by side, to judge camera moves and timing
    const tmp = path.join(out, '.strip');
    fs.mkdirSync(tmp, {recursive: true});
    for (const s of timeline.scenes) {
      const fr = [0, 0.15, 0.35, 0.6, 0.9].map((t) => s.from + Math.min(s.duration - 1, Math.round(t * s.duration)));
      const files = [];
      for (const [i, frame] of fr.entries()) {
        const f = path.join(tmp, `${s.id}-${i}.png`);
        await R.renderStill({composition: comp, serveUrl, inputProps, frame, output: f, scale: 0.25});
        files.push(f);
      }
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, path.join(out, `${s.id}-strip.png`)]);
    }
    fs.rmSync(tmp, {recursive: true, force: true});
    log(`✓ ${timeline.scenes.length} strips (<id>-strip.png: 0%, 15%, 35%, 60%, 90% of each scene) to judge the motion.`);
  }
}

/** Download Lucide icons (ISC license) as SVG into the reel: assets/icons/<name>.svg, used with <SvgIcon name=…>. */
async function cmdIcon(pos) {
  const d = reelDir(pos[0]);
  const names = pos.slice(1);
  if (!names.length) die('usage: rs icon <reel> <name> [name…]   (names from https://lucide.dev/icons, e.g. map-pin coffee train)');
  const dir = path.join(d, 'assets', 'icons');
  fs.mkdirSync(dir, {recursive: true});
  for (const n of names) {
    if (!/^[a-z0-9-]+$/.test(n)) die('bad icon name: ' + n);
    const r = await fetch(`https://cdn.jsdelivr.net/npm/lucide-static@1.75.0/icons/${n}.svg`);
    if (!r.ok) { console.error(`✗ ${n}: not found (see https://lucide.dev/icons)`); continue; }
    fs.writeFileSync(path.join(dir, n + '.svg'), await r.text());
    log(`✓ icons/${n}.svg`);
  }
}

async function cmdRender(pos) {
  const {d, R, serveUrl, inputProps} = await prep(pos[0]);
  const comp = await R.selectComposition({serveUrl, id: 'Reel', inputProps});
  const outDir = path.join(d, 'out');
  fs.mkdirSync(outDir, {recursive: true});
  const n = fs.readdirSync(outDir).filter((f) => /^v\d+\.mp4$/.test(f)).length + 1;
  const file = path.join(outDir, `v${n}.mp4`);
  let last = -1;
  await R.renderMedia({
    composition: comp, serveUrl, inputProps, codec: 'h264', outputLocation: file, crf: 18, audioBitrate: '192k',
    onProgress: ({progress}) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  ${p * 10}%\r`); } },
  });
  fs.copyFileSync(file, path.join(d, 'final.mp4'));
  const coverComp = (await R.getCompositions(serveUrl, {inputProps})).find((c) => c.id === 'Cover');
  await R.renderStill({composition: coverComp || comp, serveUrl, inputProps, frame: coverComp ? 0 : (inputProps.reel.coverFrame ?? 20), output: path.join(d, 'cover.png')});
  log(`✓ ${file}\n✓ ${path.join(d, 'final.mp4')}\n✓ ${path.join(d, 'cover.png')}`);
}

// ---------- info ----------
async function cmdModels() {
  const m = models();
  log('Current picks:');
  for (const k of ['tts', 'image', 'stt']) log(`  ${k.padEnd(5)} ${m[k].model}   — ${m[k]._why}`);
  log('\nLive OpenRouter catalog (compare with https://artificialanalysis.ai arenas before switching):');
  for (const [label, q] of [['speech', 'speech'], ['image', 'image'], ['transcription', 'transcription']]) {
    const r = await (await fetch(`${OR}/models?output_modalities=${q}`)).json();
    const list = r.data.filter((x) => x.architecture.output_modalities.includes(q)).sort((a, b) => b.created - a.created);
    log(`\n[${label}] ${list.length} models, newest first:`);
    for (const x of list.slice(0, 25)) {
      const p = Object.entries(x.pricing).filter(([, v]) => v !== '0').map(([k, v]) => `${k}=${v}`).join(' ');
      log(`  ${x.id.padEnd(44)} ${new Date(x.created * 1000).toISOString().slice(0, 10)}  ${p}`);
    }
  }
}

function cmdList() {
  if (!fs.existsSync(REELS)) die('run `rs setup` first');
  for (const s of fs.readdirSync(REELS).sort()) {
    const d = path.join(REELS, s);
    const r = readJSON(path.join(d, 'reel.json'), {});
    const t = readJSON(path.join(d, 'timeline.json'), null);
    log(`${s.padEnd(40)} ${(r.brand || '').padEnd(10)} ${t ? (t.total / FPS).toFixed(1) + 's' : 'no voice'}  ${fs.existsSync(path.join(d, 'final.mp4')) ? '✓ rendered' : ''}`);
  }
  log('\nBrands: ' + fs.readdirSync(BRANDS).map((f) => f.replace(/\.json$/, '')).join(', '));
  log('Looks: ' + (fs.existsSync(LOOKS) ? fs.readdirSync(LOOKS).join(', ') : ''));
}

// ---------- main ----------
const [cmd, ...rest] = process.argv.slice(2);
const {pos, flags} = args(rest);
const needEngine = ['frames', 'render'];
if (needEngine.includes(cmd) && !fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion'))) die('run `rs setup` first');
const table = {setup, new: () => cmdNew(pos, flags), voice: () => cmdVoice(pos, flags), image: () => cmdImage(pos, flags),
  frames: () => cmdFrames(pos, flags), render: () => cmdRender(pos), models: cmdModels, list: cmdList, icon: () => cmdIcon(pos),
  'look-image': () => cmdLookImage(pos, flags), 'install-app': installApp, brand: async () => log(JSON.stringify(await brandProps(reelDir(pos[0]), readJSON(path.join(reelDir(pos[0]), 'reel.json')).brand), null, 2)),
  app: () => import(path.join(HOME, 'app', 'server.mjs'))};
if (!table[cmd]) {
  log(`rs — ReelStudio
  setup                          install engine into ${HOME}
  new "<topic>" [--brand b]      create a reel, prints its name
  voice <reel> [--scene id] [--local] [--tier budget|expressive] [--force]
  image <reel> <name> "<prompt>" [--hero] [--mascot] [--ref img/x.png] [--no-style]
  look-image <look> <name> "<prompt>" [--mascot] [--hero]
  app                            start the ReelStudio app (http://localhost:4747)
  install-app                    create ~/Applications/ReelStudio.app
  icon <reel> <name> [name…]     download Lucide SVG icons into <reel>/assets/icons
  frames <reel> [--at frame] [--strip]   check stills to <reel>/frames (--strip: motion sheet per scene)
  render <reel>                  final.mp4 + cover.png
  models                         current picks + live OpenRouter catalog
  list                           reels and brands`);
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(table[cmd]()).catch((e) => die(e.stack || e.message));
