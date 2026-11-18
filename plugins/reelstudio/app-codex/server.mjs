// ReelStudio app server (Codex edition): local only (127.0.0.1). Codex is the producer; rs does voice/images/render.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME = process.env.REELSTUDIO_HOME || path.join(os.homedir(), 'ReelStudio');
const APP = path.dirname(fileURLToPath(import.meta.url));
const RS = path.join(HOME, 'engine', 'bin', 'rs.mjs');
const CODEX = process.env.CODEX_BIN || 'codex';
const LIB = path.join(HOME, 'engine', 'src', 'lib', 'index.tsx');
const REELS = path.join(HOME, 'reels'), BRANDS = path.join(HOME, 'brands'), LOOKS = path.join(HOME, 'looks');
const PORT = Number(process.env.PORT || 4749);
const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'reel';
const safeId = (s) => /^[a-z0-9][a-z0-9_-]{0,60}$/.test(s || '');
const env = () => { const o = {}; for (const l of (fs.existsSync(path.join(HOME, '.env')) ? fs.readFileSync(path.join(HOME, '.env'), 'utf8') : '').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) o[m[1]] = m[2]; } return o; };
const SETTINGS = path.join(HOME, 'app-settings-codex.json');
const settings = () => ({model: '', maxImages: 3, ...readJSON(SETTINGS, {})});
const codexModels = () => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8')).models.map((m) => m.slug).filter((s) => s && !/review|reserve/.test(s)); } catch { return []; } };

// ---------------- jobs ----------------
const running = new Map(); // slug -> child process
const jobPath = (slug) => path.join(REELS, slug, 'job.json');
const getJob = (slug) => readJSON(jobPath(slug), {phase: 'new', log: [], cost: 0});
function saveJob(slug, patch) {
  const j = {...getJob(slug), ...patch, updated: Date.now()};
  if (j.log.length > 400) j.log = j.log.slice(-400);
  writeJSON(jobPath(slug), j);
  return j;
}
function pushLog(slug, kind, text) {
  const j = getJob(slug);
  j.log.push({t: Date.now(), kind, text: String(text).slice(0, 2000)});
  saveJob(slug, {log: j.log});
}

function stepOf(cmd) {
  if (/rs\.mjs"?\s+voice/.test(cmd)) return ['voice', 'Registro la voce e i tempi delle parole'];
  if (/rs\.mjs"?\s+image/.test(cmd)) return ['images', 'Genero un\'illustrazione' + (/--hero/.test(cmd) ? ' (qualità hero)' : '')];
  if (/rs\.mjs"?\s+frames/.test(cmd)) return ['check', 'Renderizzo i frame di controllo'];
  if (/rs\.mjs"?\s+render/.test(cmd)) return ['render', 'Render finale MP4 + copertina'];
  return null;
}

function producerPrompt(slug, opts) {
  const reel = readJSON(path.join(REELS, slug, 'reel.json'));
  const brand = readJSON(path.join(BRANDS, reel.brand + '.json'), {});
  const look = brand.look ? readJSON(path.join(LOOKS, brand.look, 'look.json'), null) : null;
  const rs = fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'reelstudio')) ? 'reelstudio' : `node "${RS}"`;
  return `You are the ReelStudio producer. Use the reel skill from the ReelStudio plugin and follow it. Use exactly this command for rs: ${rs}
The component library source is ${LIB}. The reel folder already exists: ${path.join(REELS, slug)} (reel name "${slug}"). Work only inside ${HOME}. Run each shell command on its own (no 'cd … &&', no pipes, no ';'): this headless Codex session runs in a sandbox (network on, ~/ReelStudio writable) and cannot ask the user anything. Look at PNGs with view_image. Never read ~/ReelStudio/.env.

BRIEF
- Topic / script from the user: ${reel.brief?.topic}
- Brand "${reel.brand}": ${JSON.stringify({name: brand.name, handle: brand.handle, language: brand.language, tone: brand.tone})}
- Target length: about ${reel.brief?.seconds || 30} seconds. Language: ${brand.language || 'it'}.
- Images: at most ${reel.brief?.maxImages ?? 3}. ${reel.brief?.hero ? 'Use --hero (GPT Image 2.6 Sunburst) for the cover/hook image.' : 'Default model is fine; use --hero only for the single most important image.'} Use --mascot when the mascot must appear in an illustration.
${reel.brief?.notes ? '- Extra notes from the user: ' + reel.brief.notes : ''}
${look ? `\nLOOK "${look.name}" — the creative line every reel of this brand must follow:\n${look.description}\nRules:\n${look.bible}\nImage art direction is appended automatically by rs; still describe subjects in a way that fits it.` : ''}`;
}

// Codex producer: `codex exec --json`, one JSONL event per line (thread.started, item.*, turn.*).
function runClaude(slug, prompt, {resume, phaseWhenDone}) {
  const s = settings();
  const sandbox = ['-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.network_access=true', '-c', `sandbox_workspace_write.writable_roots=${JSON.stringify([HOME])}`, '-c', 'approval_policy="never"'];
  const args = resume ? ['exec', 'resume', resume, '--json', '--skip-git-repo-check', ...sandbox] : ['exec', '--json', '--skip-git-repo-check', '-C', path.join(REELS, slug), ...sandbox];
  if (s.model) args.push('-m', s.model);
  args.push(prompt);
  const child = spawn(CODEX, args, {cwd: path.join(REELS, slug), env: {...process.env, ...env()}, stdio: ['ignore', 'pipe', 'pipe']});
  running.set(slug, child);
  saveJob(slug, {error: null});
  let buf = '', failed = null;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      const it = ev.item || {};
      if (ev.type === 'thread.started' && ev.thread_id) saveJob(slug, {cxSessionId: ev.thread_id});
      else if (ev.type === 'item.started' && it.type === 'command_execution') {
        const cmd = String(it.command || '');
        const st = stepOf(cmd.replace(/\breelstudio\s+/, 'rs.mjs '));
        if (st) { saveJob(slug, {step: st[0]}); pushLog(slug, 'step', st[1]); }
      } else if (ev.type === 'item.completed') {
        if (it.type === 'agent_message' && String(it.text || '').trim()) pushLog(slug, 'say', it.text.trim());
        else if (it.type === 'file_change') for (const c of it.changes || []) pushLog(slug, 'tool', `${c.kind === 'add' ? 'Scrivo' : 'Modifico'} ${path.basename(c.path || '')}`);
        else if (it.type === 'command_execution' && it.exit_code && it.exit_code !== 0) pushLog(slug, 'warn', String(it.aggregated_output || `exit ${it.exit_code}`).slice(-400));
        else if (/image/.test(it.type || '') && it.path) pushLog(slug, 'tool', `Guardo ${path.basename(it.path)}`);
        else if (it.type === 'error') pushLog(slug, 'warn', String(it.message || 'error').slice(0, 400));
      } else if (ev.type === 'turn.failed' || ev.type === 'error') {
        failed = ev.error?.message || ev.message || JSON.stringify(ev);
        pushLog(slug, 'warn', String(failed).slice(0, 400));
      }
    }
  });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += String(e.message || e); });
  child.on('close', (code) => {
    running.delete(slug);
    if ((code !== 0 || failed) && !getJob(slug).stopped) { saveJob(slug, {phase: 'error', error: String(failed || err).slice(-800) || `codex exited ${code}`}); return; }
    if (getJob(slug).stopped) { saveJob(slug, {phase: 'stopped', stopped: false}); return; }
    const next = phaseWhenDone();
    saveJob(slug, {phase: next, step: null});
    pushLog(slug, 'done', next === 'review' ? 'Script pronto: rivedilo e approva' : next === 'done' ? 'Reel pronto' : 'Fine');
  });
}

function startScript(slug) {
  const reel = readJSON(path.join(REELS, slug, 'reel.json'));
  saveJob(slug, {phase: 'scripting', step: 'script', log: [], cost: 0});
  pushLog(slug, 'step', 'Il producer scrive lo script');
  const auto = reel.brief?.autoApprove;
  const prompt = producerPrompt(slug) + (auto
    ? '\n\nDo the whole job, steps 1–7, without waiting for approval. Finish with the render.'
    : '\n\nDo ONLY steps 1–2 now: write reel.json with the script (scenes with id, voiceover, visual). Do not run voice, images or render. Stop after writing it.');
  runClaude(slug, prompt, {phaseWhenDone: () => (auto ? (fs.existsSync(path.join(REELS, slug, 'final.mp4')) ? 'done' : 'review') : 'review')});
}

function startProduce(slug, feedback) {
  const j = getJob(slug);
  const before = fs.existsSync(path.join(REELS, slug, 'final.mp4')) ? fs.statSync(path.join(REELS, slug, 'final.mp4')).mtimeMs : 0;
  saveJob(slug, {phase: 'producing', step: 'voice'});
  pushLog(slug, 'step', feedback ? 'Applico la modifica richiesta' : 'Script approvato: si produce');
  const msg = feedback
    ? `The user asks for this change to the reel "${slug}": "${feedback}". Re-read reel.json and src/Reel.tsx (they may have been edited), apply the change, re-run voice only if voiceovers changed, then frames (self-check every PNG) and render a new version.`
    : `The user approved the script (they may have edited ${path.join(REELS, slug, 'reel.json')} — re-read it and keep their wording exactly). Now do steps 3–7: voice, images, Reel.tsx with an optional Cover export, frames with a full self-check of every PNG, render.`;
  const prompt = j.cxSessionId ? msg : producerPrompt(slug) + '\n\n' + msg;
  runClaude(slug, prompt, {resume: j.cxSessionId, phaseWhenDone: () => {
    const f = path.join(REELS, slug, 'final.mp4');
    return fs.existsSync(f) && fs.statSync(f).mtimeMs > before ? 'done' : 'error';
  }});
}

// ---------------- data ----------------
function reelSummary(slug) {
  const d = path.join(REELS, slug);
  const reel = readJSON(path.join(d, 'reel.json'), {});
  const t = readJSON(path.join(d, 'timeline.json'));
  const j = getJob(slug);
  const st = fs.statSync(d);
  return {
    slug, title: reel.title || slug, brand: reel.brand, phase: running.has(slug) ? j.phase : (j.phase === 'scripting' || j.phase === 'producing' ? 'stopped' : j.phase),
    step: j.step, seconds: t ? +(t.total / t.fps).toFixed(1) : null,
    video: fs.existsSync(path.join(d, 'final.mp4')) ? `/files/reels/${slug}/final.mp4?v=${Math.round(fs.statSync(path.join(d, 'final.mp4')).mtimeMs)}` : null,
    cover: fs.existsSync(path.join(d, 'cover.png')) ? `/files/reels/${slug}/cover.png?v=${Math.round(fs.statSync(path.join(d, 'cover.png')).mtimeMs)}` : null,
    updated: Math.max(st.mtimeMs, j.updated || 0),
  };
}
function listDir(d) { return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => !x.startsWith('.')) : []; }
function looks() {
  return listDir(LOOKS).map((id) => {
    const l = readJSON(path.join(LOOKS, id, 'look.json'), {});
    const files = listDir(path.join(LOOKS, id)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    return {id, ...l, files: files.map((f) => `/files/looks/${id}/${f}?v=${Math.round(fs.statSync(path.join(LOOKS, id, f)).mtimeMs)}`)};
  });
}
function state() {
  const reels = listDir(REELS).filter((s) => fs.existsSync(path.join(REELS, s, 'reel.json'))).map(reelSummary).sort((a, b) => b.updated - a.updated);
  const brands = listDir(BRANDS).filter((f) => f.endsWith('.json')).map((f) => ({id: f.slice(0, -5), ...readJSON(path.join(BRANDS, f), {})}));
  const models = readJSON(path.join(HOME, 'engine', 'models.json'), {});
  return {reels, brands, looks: looks(), key: !!env().OPENROUTER_API_KEY, models, settings: settings(), home: HOME, producer: 'codex', cxModels: codexModels()};
}

// ---------------- http ----------------
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
function sendFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : size - 1;
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1});
    return fs.createReadStream(file, {start, end}).pipe(res);
  }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache'});
  fs.createReadStream(file).pipe(res);
}
const json = (res, code, o) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 30e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });
const rs = (args) => new Promise((ok) => execFile('node', [RS, ...args], {env: {...process.env, ...env()}, maxBuffer: 1e7}, (e, so, se) => ok({ok: !e, out: so + se})));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const o = req.headers.origin;
      if (o && !ORIGINS.has(o)) return json(res, 403, {error: 'origin'});
    }
    // static
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(APP, 'public', 'index.html'));
    if (p.startsWith('/static/')) return sendFile(req, res, path.join(APP, 'public', path.normalize(p.slice(8)).replace(/^(\.\.[/\\])+/, '')));
    if (p.startsWith('/files/')) {
      const f = path.resolve(HOME, '.' + p.slice(6));
      if (!f.startsWith(HOME + path.sep) || /\/\.env$|app-settings/.test(f)) { res.writeHead(403); return res.end(); }
      return sendFile(req, res, f);
    }
    // api
    if (p === '/api/state') return json(res, 200, state());
    const m = p.match(/^\/api\/reels\/([a-z0-9-]+)(?:\/(\w+))?$/);
    if (p === '/api/reels' && req.method === 'POST') {
      const b = await body(req);
      if (!b.topic?.trim()) return json(res, 400, {error: 'Scrivi un argomento'});
      if (!fs.existsSync(path.join(BRANDS, (b.brand || 'default') + '.json'))) return json(res, 400, {error: 'brand'});
      let slug = slugify(b.topic.split('\n')[0]); let n = 2;
      while (fs.existsSync(path.join(REELS, slug))) slug = slugify(b.topic.split('\n')[0]).slice(0, 46) + '-' + n++;
      fs.mkdirSync(path.join(REELS, slug, 'src'), {recursive: true});
      fs.mkdirSync(path.join(REELS, slug, 'assets', 'img'), {recursive: true});
      writeJSON(path.join(REELS, slug, 'reel.json'), {title: b.topic.split('\n')[0].slice(0, 80), brand: b.brand || 'default', scenes: [],
        brief: {topic: b.topic, seconds: +b.seconds || 30, maxImages: +b.maxImages, hero: !!b.hero, autoApprove: !!b.autoApprove, notes: b.notes || ''}});
      startScript(slug);
      return json(res, 200, {slug});
    }
    if (m) {
      const [, slug, action] = m;
      const d = path.join(REELS, slug);
      if (!fs.existsSync(d)) return json(res, 404, {error: 'not found'});
      if (!action && req.method === 'GET') {
        const outs = listDir(path.join(d, 'out')).filter((f) => f.endsWith('.mp4')).sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
        const frames = listDir(path.join(d, 'frames')).filter((f) => f.endsWith('.png')).sort();
        const imgs = listDir(path.join(d, 'assets', 'img')).filter((f) => f.endsWith('.png'));
        return json(res, 200, {...reelSummary(slug), reel: readJSON(path.join(d, 'reel.json')), timeline: readJSON(path.join(d, 'timeline.json')), job: getJob(slug), running: running.has(slug),
          versions: outs.map((f) => ({name: f.replace('.mp4', ''), url: `/files/reels/${slug}/out/${f}`})),
          frames: frames.map((f) => `/files/reels/${slug}/frames/${f}?v=${Math.round(fs.statSync(path.join(d, 'frames', f)).mtimeMs)}`),
          images: imgs.map((f) => `/files/reels/${slug}/assets/img/${f}`)});
      }
      if (running.has(slug) && ['approve', 'revise', 'script'].includes(action)) return json(res, 409, {error: 'Il producer sta già lavorando'});
      if (action === 'script' && req.method === 'PUT') {
        const b = await body(req); const reel = readJSON(path.join(d, 'reel.json'));
        reel.scenes = (b.scenes || []).filter((s) => s.id && s.voiceover).map((s) => ({...reel.scenes.find((x) => x.id === s.id), ...s}));
        if (b.title) reel.title = b.title;
        writeJSON(path.join(d, 'reel.json'), reel);
        return json(res, 200, {ok: true});
      }
      if (action === 'approve' && req.method === 'POST') { startProduce(slug); return json(res, 200, {ok: true}); }
      if (action === 'revise' && req.method === 'POST') { const b = await body(req); if (!b.feedback?.trim()) return json(res, 400, {error: 'empty'}); startProduce(slug, b.feedback.trim()); return json(res, 200, {ok: true}); }
      if (action === 'rescript' && req.method === 'POST') { if (running.has(slug)) return json(res, 409, {}); startScript(slug); return json(res, 200, {ok: true}); }
      if (action === 'stop' && req.method === 'POST') { const c = running.get(slug); if (c) { saveJob(slug, {stopped: true}); c.kill('SIGTERM'); } return json(res, 200, {ok: true}); }
      if (action === 'reveal' && req.method === 'POST') { execFile('open', [d]); return json(res, 200, {ok: true}); }
      if (!action && req.method === 'DELETE') {
        if (running.has(slug)) return json(res, 409, {});
        const trash = path.join(HOME, 'trash'); fs.mkdirSync(trash, {recursive: true});
        fs.renameSync(d, path.join(trash, slug + '-' + Date.now()));
        return json(res, 200, {ok: true});
      }
    }
    const bm = p.match(/^\/api\/brands\/([a-z0-9_-]+)$/);
    if (bm && req.method === 'PUT') {
      if (!safeId(bm[1])) return json(res, 400, {});
      const b = await body(req); delete b.id;
      writeJSON(path.join(BRANDS, bm[1] + '.json'), b);
      return json(res, 200, {ok: true});
    }
    const lm = p.match(/^\/api\/looks\/([a-z0-9_-]+)(?:\/(\w+))?$/);
    if (lm) {
      const [, id, action] = lm;
      if (!safeId(id)) return json(res, 400, {});
      const dir = path.join(LOOKS, id);
      if (!action && req.method === 'PUT') {
        const b = await body(req); delete b.id; delete b.files;
        writeJSON(path.join(dir, 'look.json'), b);
        return json(res, 200, {ok: true});
      }
      if (action === 'upload' && req.method === 'POST') {
        const b = await body(req);
        const mm = String(b.dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (!mm) return json(res, 400, {error: 'immagine non valida'});
        const name = (b.kind === 'mascot' ? 'mascot' : 'ref-' + Date.now()) + '.' + (mm[1] === 'jpeg' ? 'jpg' : mm[1]);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, name), Buffer.from(mm[2], 'base64'));
        const l = readJSON(path.join(dir, 'look.json'), {});
        if (b.kind === 'mascot') l.mascot = name; else l.references = [...(l.references || []), name];
        writeJSON(path.join(dir, 'look.json'), l);
        return json(res, 200, {ok: true, name});
      }
      if (action === 'remove' && req.method === 'POST') {
        const b = await body(req); const l = readJSON(path.join(dir, 'look.json'), {});
        l.references = (l.references || []).filter((r) => r !== b.file);
        writeJSON(path.join(dir, 'look.json'), l);
        return json(res, 200, {ok: true});
      }
      if (action === 'sample' && req.method === 'POST') {
        const b = await body(req);
        const l = readJSON(path.join(dir, 'look.json'), {});
        const prompt = b.prompt || `A typical illustration for this brand: ${l.description || ''}`;
        const r = await rs(['look-image', id, 'sample-' + Date.now(), prompt, ...(l.mascot && b.mascot !== false ? ['--mascot'] : []), ...(b.hero ? ['--hero'] : [])]);
        return json(res, r.ok ? 200 : 500, {out: r.out});
      }
    }
    if (p === '/api/settings' && req.method === 'PUT') {
      const b = await body(req);
      if (typeof b.key === 'string' && b.key.trim()) {
        const lines = (fs.existsSync(path.join(HOME, '.env')) ? fs.readFileSync(path.join(HOME, '.env'), 'utf8') : '').split('\n').filter((l) => !/^\s*#?\s*OPENROUTER_API_KEY=/.test(l) && l.trim());
        lines.push('OPENROUTER_API_KEY=' + b.key.trim());
        fs.writeFileSync(path.join(HOME, '.env'), lines.join('\n') + '\n', {mode: 0o600});
      }
      const s = settings();
      if (typeof b.model === 'string') s.model = b.model;
      writeJSON(SETTINGS, s);
      return json(res, 200, {ok: true});
    }
    json(res, 404, {error: 'not found'});
  } catch (e) { console.error(e); json(res, 500, {error: e.message}); }
});

// mark jobs that died with a previous server as stopped
for (const s of listDir(REELS)) { const j = readJSON(jobPath(s)); if (j && (j.phase === 'scripting' || j.phase === 'producing')) saveJob(s, {phase: 'stopped'}); }

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`ReelStudio app → ${url}`);
  if (!process.env.NO_OPEN) {
    const chrome = '/Applications/Google Chrome.app';
    if (fs.existsSync(chrome)) execFile('open', ['-na', chrome, '--args', `--app=${url}`, '--window-size=1320,880']);
    else execFile('open', [url]);
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log('Already running → http://localhost:' + PORT); if (!process.env.NO_OPEN) execFile('open', [`http://localhost:${PORT}`]); }
  else throw e;
});
