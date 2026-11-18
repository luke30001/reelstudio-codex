---
name: reel
description: Make short vertical videos (Instagram Reels, TikTok, YouTube Shorts) locally with ReelStudio. Codex writes the script, plans and codes the scenes, and checks its own frames; OpenRouter does the voice (ElevenLabs v4 Turbo), images (MAI-Image-2.7, GPT Image 2.6 Sunburst for hero shots) and word timestamps; Remotion renders the MP4 on this Mac. Use when the user asks for a reel, short, TikTok, vertical video, video from a topic or script, or asks about their ReelStudio reels, brands or voices.
---

# ReelStudio: topic in, reel out

You are the producer and the crew. Do what only you can do (writing, directing, coding scenes, judging frames) and run the `reelstudio` command for what you can't (voice, images, timestamps, rendering).

```bash
reelstudio <command>     # = $RS below; launcher in ~/.local/bin, runs ~/ReelStudio/engine/bin/rs.mjs
```

`$RS` below means `reelstudio`. If `reelstudio` is not on PATH, use `node ~/ReelStudio/engine/bin/rs.mjs` (after the first setup) or `node <plugin root>/engine/bin/rs.mjs` (the plugin root is two folders above this SKILL.md).
The engine calls OpenRouter and runs ffmpeg and headless Chrome (Remotion), so it needs network access and must write to `~/ReelStudio`: if the sandbox blocks a `reelstudio` command, request escalated permissions for it rather than working around it. Run each command on its own (no `cd … &&` chains or pipes). `setup`, `frames` and `render` can take a few minutes.

Everything lives in `~/ReelStudio/`: `reels/<name>/`, `brands/*.json`, `looks/<id>/look.json` (+ mascot and reference images), `.env` (OpenRouter key), `config.json` (optional model overrides). The user can also drive everything from the Codex web app: `node <this plugin>/app-codex/server.mjs` (http://127.0.0.1:4749; it runs `codex exec` as the producer).

## 0. First time
Run `$RS setup` (copies the engine, installs Remotion once, makes the `default` brand). If it reports no OpenRouter key, the voice falls back to macOS `say` and images are off. Tell the user to add `OPENROUTER_API_KEY=...` to `~/ReelStudio/.env` themselves. Never ask them to paste the key into chat. Re-run `$RS setup` after updating the plugin (the launcher picks the newest installed plugin version).

## 1. Brief
Get the topic (or the user's script), the brand (`$RS list` shows brands and looks), the language and the target length (default 25–40 s). Read `~/ReelStudio/brands/<brand>.json` and follow its `tone`.

**The look is the creative line.** Every brand points to a look in `~/ReelStudio/looks/<id>/look.json`. Read it before writing anything and obey its `bible` (layout rules, mascot use, what to avoid). Its colors, font, caption style and background are applied automatically. Its `imageStyle` and reference images are added to every `rs image` call automatically, so all images in the brand share one style. Every reel of a brand must look like part of the same series.

## 2. Script and storyboard
`$RS new "<topic>" --brand <brand>` prints the reel name. Write `reels/<name>/reel.json`:

```json
{"title": "...", "brand": "default", "scenes": [
  {"id": "hook", "voiceover": "...", "visual": "what is on screen", "hold": 0.25}
]}
```

Rules for the script:
- **Hook in the first 2 seconds**: a surprising claim, number or question. No "Ciao a tutti", no "In questo video".
- 5–9 scenes, one idea each, 6–20 words of voiceover per scene. Short spoken sentences. Write numbers the way they should be spoken ("quattro", not "4"), because the TTS reads exactly what you write.
- Facts must be true. If you're not sure of a number, leave it out.
- End with a payoff, then a short CTA scene (follow, save, comment a word).
- `id`s are short, stable slugs. Changing a scene's `voiceover` re-voices only that scene.

Show the user the script (voiceover lines only) and wait for an OK before spending on voice, unless they said to go straight through.

## 3. Voice and timing
`$RS voice <name>`: generates one MP3 per scene with ElevenLabs v4 Turbo via OpenRouter, gets word timestamps from Nemotron transcription, and writes `timeline.json` (frames at 30 fps per scene and per word). Options: `--scene id1,id2` to redo some scenes, `--tier budget` (Speechify Simba 3.5, about 6× cheaper), `--tier expressive` (Gemini 3.8 Flash TTS, follows `voice.instructions`), `--local` (free macOS voice for drafts).
ElevenLabs v4 understands audio tags in the voiceover such as `[excited]`, `[whispers]` and `[pause]`. Use them sparingly.

## 4. Images (optional, cost money)
Use images when a picture beats typography. Stay within the limit the user gave (default 0–3).
`$RS image <name> <imgname> "<prompt>"`: 9:16, MAI-Image-2.7 (about $0.035 each) with the look's art direction and reference images.
- `--hero`: GPT Image 2.6 Sunburst at quality max (#1 in the image arena, about $0.15–0.21). Use it only where quality matters most: the hook or cover image, a mascot scene, a complex scene with fine detail. One or two per reel at most, unless the user asks for maximum quality.
- `--mascot`: adds the look's mascot as the first reference and keeps it on-model (same face, markings, line style). Use it whenever the mascot appears in an illustration; `--hero --mascot` gives the best fidelity.
- `--ref img/other.png`: add an earlier image as a reference (for continuity between scenes). `--no-style` skips the look's art direction.
Describe the subject and the composition only; the look handles the style. Always add "vertical composition, no text". Look at every image you generate (open the PNG with the image viewer tool, `view_image`). Saved as `assets/img/<imgname>.png`, used as `"img/<imgname>.png"`.

## 5. Build the scenes: `reels/<name>/src/Reel.tsx`
Compose the components from `@rs` (source: `~/ReelStudio/engine/src/lib/index.tsx`, read it when you need detail):

```tsx
import React from 'react';
import {Reel, Title, BigStat, Bullets, Quote, Compare, Icon, Card, CTA, ImageBG, Mascot, CoverFrame, BrandBG, ReelProps} from '@rs';

export default (p: ReelProps) => (
  <Reel {...p}
    scenes={{
      hook: <><Title kicker="Psicologia" text="Il tuo cervello *ama* le liste" /><Mascot pos="peek" /></>,
      stat: <BigStat value={4} prefix="≈" label="elementi nella *memoria di lavoro*" />,
      why:  <Bullets title="Perché funzionano" items={['Divide il problema', 'Riduce lo *sforzo*']} />,
      cta:  <CTA text="Altri trucchi sul *cervello*" />,
    }}
    backgrounds={{ hook: <ImageBG src="img/brain.png" /> }}
  />
);

// Optional: a cover image. Animations render already finished here.
export const Cover = (p: ReelProps) => (
  <CoverFrame brand={p.brand}><BrandBG /><Title text="Il tuo cervello *ama* le liste" /><Mascot pos="peek" /></CoverFrame>
);
```

- Every scene id in `reel.json` needs an entry in `scenes`. `*word*` puts that word in the accent color.
- Components: `Title`, `Kicker`, `BigStat` (count-up), `Bullets` (reveal timed across the scene, or `at=[frames]` synced to `timeline.json` word frames), `Quote`, `Compare` (two columns), `Icon` (big emoji), `Card` (framed image), `CTA`, `ImageBG` (full-bleed Ken Burns), `BrandBG` (the look's background: paper, gradient or solid; it is the default background), `Mascot` (the look's mascot: `pos="peek"` slides in from the right edge, `"corner"` sits bottom-right of the content area, `"center"` is a large hero; `src="img/pose.png"` uses a generated pose). Overlays are automatic: karaoke captions, progress bar, handle. Turn them off with `captions={false}` and similar props.
- On-screen text **complements** the voiceover. Don't repeat it word for word, because the captions already do that. Keep it to 2–7 words per scene.
- Custom visuals are fine: write your own React components in `src/` with `useF()`, `useScene()`, `useBrand()`, `interpolate`, `spring`, `fitFont`, `Stage` from `@rs`. Keep everything deterministic (no `Math.random`, no `Date`).
- **Safe zones** (1080×1920): content between y=200 and y=1180, inside `Stage`. Captions sit at y≈1250–1450. Nothing important below y=1500, where Instagram puts its UI.
- Vary the layouts: never use the same component three scenes in a row.

## 6. Self-check (mandatory)
`$RS frames <name>` renders two stills per scene to `reels/<name>/frames/` (`<id>-a` shortly after entry, `<id>-b` near the end). A bundling error means a code bug: fix it and run again.
**Open every PNG with `view_image`** and check: text cut off or overflowing, overlaps with the captions, unreadable contrast on images, an empty or broken scene, typos, too much text, the same layout over and over. Fix `Reel.tsx` (or regenerate an image) and run `frames` again until it's clean. Check one exact moment with `--at <frame>`. Two rounds are normal.

## 7. Render
`$RS render <name>` produces `out/vN.mp4` (a new version on every render), `final.mp4` and `cover.png`. A 30 s reel takes about 1–2 minutes. Give the user the paths, the duration and the cost of the paid calls. Suggest a caption and 3–5 hashtags in the brand's language.

## Edits later
"Change scene 3" means: edit `reel.json` and/or `Reel.tsx`, run `$RS voice <name>` (only changed scenes are redone), then `frames` and `render`. The earlier versions stay in `out/`.

## Models
Picks and the reasons for them are in `~/ReelStudio/engine/models.json`. `$RS models` lists the live OpenRouter catalog for speech, image and transcription. If the user asks to re-evaluate the models, compare the catalog with the Artificial Analysis arenas (text-to-speech, text-to-image, speech-to-text), test the candidate with one real call, and put the winner in `~/ReelStudio/config.json`, e.g. `{"tts": {"model": "..."}}`.
