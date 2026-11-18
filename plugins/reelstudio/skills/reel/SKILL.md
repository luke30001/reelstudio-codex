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

Everything lives in `~/ReelStudio/`: `reels/<name>/`, `brands/*.json`, `looks/<id>/look.json` (+ mascot and reference images), `.env` (OpenRouter key), `config.json` (optional model overrides). The user can also drive everything from the Codex web app: `node <plugin root>/app-codex/server.mjs` (http://127.0.0.1:4749; it runs `codex exec` as the producer).

## 0. First time
Run `$RS setup` (copies the engine, installs Remotion once, makes the `default` brand). If it reports no OpenRouter key, the voice falls back to macOS `say` and images are off. Tell the user to add `OPENROUTER_API_KEY=...` to `~/ReelStudio/.env` themselves. Never ask them to paste the key into chat. Re-run `$RS setup` after updating the plugin (the launcher picks the newest installed plugin version).

## 1. Brief
Get the topic (or the user's script), the brand (`$RS list` shows brands and looks), the language and the target length (default 25–40 s). For premium editorial quality (smooth camera zooms over one world, serif headline, red pill, clean cards) use a brand with the `editoriale` look and the zoom format of step 5b; any topic works. Read `~/ReelStudio/brands/<brand>.json` and follow its `tone`.

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

## 5b. The zoom format (premium editorial quality)
This is the default for the `editoriale` look and the way to reach top-tier explainer quality on any topic: **one big world, one camera that glides and zooms over it, never a hard cut.** Read the look's `bible` and follow it.

```tsx
import React from 'react';
import {Reel, ReelProps, Headline, Pin, Ring, Measure, Spotlight, StatCard, ChartCard, Badge, Lenses, Source, Pill,
  At, WorldGround, WorldImage, SvgIcon, CoverFrame} from '@rs';

const W: [number, number] = [3240, 5760];
// The world: lay out every "place" of the story in world px (3x the screen). Vector = sharp at any zoom.
const world = (
  <>
    <WorldGround w={W[0]} h={W[1]} pattern="dots" />
    <At x={900} y={1500}><SvgIcon name="coffee" size={260} /></At>
    <At x={2300} y={3600}><div style={{width: 700, height: 420, borderRadius: 40, background: '#fff'}} /></At>
    <WorldImage src="img/bar.png" x={1700} y={4600} w={760} h={1000} />
  </>
);

export default (p: ReelProps) => (
  <Reel {...p} world={world} worldSize={W}
    camera={{
      hook: {x: 1620, y: 2900, zoom: 0.36},                 // overview of the whole world
      where: {x: 900, y: 1500, zoom: 1.6},                  // fly to the first place
      how: [{x: 2300, y: 3600, zoom: 1.2}, {x: 2300, y: 3700, zoom: 2.4, at: 0.5}], // two moves in one scene
      cta: {x: 1620, y: 2900, zoom: 0.36},
    }}
    scenes={{
      hook: <Headline title={'Quanto caffè\nbeve un italiano?'} pill="più di quanto pensi" />,
      where: <><Headline title={'Quanto caffè\nbeve un italiano?'} enter={false} /><Pin at={[900, 1500]} label="Napoli" side="right" /></>,
      how: <><Ring at={[2300, 3700]} r={300} label="*1,5* tazzine al giorno" /><Source text="Fonte: …" /></>,
      cta: <Headline title={'Seguimi per\naltre misure'} pill="@tuohandle" />,
    }}
  />
);
export const Cover = (p: ReelProps) => (
  <CoverFrame brand={p.brand} world={world} worldSize={W} shot={{x: 1620, y: 2900, zoom: 0.36}}>
    <Headline title={'Quanto caffè\nbeve un italiano?'} pill="più di quanto pensi" />
  </CoverFrame>
);
```

- **World**: children of `world` are in world px; `At` places anything (centered), `WorldGround` gives a subtle texture so moves read as motion, `WorldImage` adds a framed generated image. Build the places of the story far apart (≥ 900 px) so the camera really travels. Get icons with `$RS icon <name> <icon…>` (Lucide names) and use `<SvgIcon name=…>`; draw custom shapes with SVG. Keep generated images ≤ 3 and never show one bigger on screen than ~1.2× its pixel width (they are ~800 px wide): zoom × w ≤ 1000.
- **Camera**: `camera={{sceneId: Shot | Shot[]}}`, `Shot = {x, y, zoom, at?, move?, fly?}`. `x, y` is the world point at the center of the screen; zoom 0.33 shows a 3240-wide world whole, 1 = world px are screen px, 2–3.5 = detail. A move takes `move` frames (default 26, eased in-out); long moves dip out ("fly") automatically. While a shot holds the camera pushes in slowly (`drift`, default 4%). Every scene gets at least one shot; vary scale (overview → detail → another detail → overview).
- **Overlays (screen-space, follow the camera)**: `Headline` (kicker = brand name, `title` with `\n` for the 2-line break, `pill` = the twist; `enter={false}` to keep it in place in later scenes), `Pin at=[x,y] label side`, `Ring at r label` (r in world px), `Measure from to label`, `Spotlight at r`, `Badge value label x y arrow color`, `StatCard value suffix label x y`, `ChartCard type="line"|"bar" data labels title unit highlight x y w h`, `Lenses items=[{src|node,label,highlight}]`, `Tag`, `Pill`, `Source text`. Use `useCam().toScreen([x,y])` to anchor custom overlays.
- **Typography**: the look loads a serif `display` font for `Headline`; everything else is Inter. Two fonts only. Headline ≤ 2 lines, pill ≤ 4 words.
- **Quality bar** (check it in the frames): generous margins (≥ 70 px), nothing touching the edges, aligned centers, white cards with soft shadows, one accent color, no emoji, no clutter (≤ 3 overlays at once), every number with a `Source`, the camera never static for a whole scene and never cutting. The captions stay (pill style) unless the user turns them off.

## 6. Self-check (mandatory)
`$RS frames <name>` renders two stills per scene to `reels/<name>/frames/` (`<id>-a` shortly after entry, `<id>-b` near the end). A bundling error means a code bug: fix it and run again. With a camera world add `--strip`: one `<id>-strip.png` per scene with 5 moments (0, 15, 35, 60, 90%) to judge the moves.
**Open every PNG with `view_image`** and check: text cut off or overflowing, overlaps with the captions, unreadable contrast on images, an empty or broken scene, typos, too much text, the same layout over and over, labels pointing at the wrong place, a blurry image (zoomed past its resolution), a move that goes nowhere. Fix `Reel.tsx` (or regenerate an image) and run `frames` again until it's clean. Check one exact moment with `--at <frame>`. Two rounds are normal.

## 7. Render
`$RS render <name>` produces `out/vN.mp4` (a new version on every render), `final.mp4` and `cover.png`. A 30 s reel takes about 1–2 minutes. Give the user the paths, the duration and the cost of the paid calls. Suggest a caption and 3–5 hashtags in the brand's language.

## Edits later
"Change scene 3" means: edit `reel.json` and/or `Reel.tsx`, run `$RS voice <name>` (only changed scenes are redone), then `frames` and `render`. The earlier versions stay in `out/`.

## Models
Picks and the reasons for them are in `~/ReelStudio/engine/models.json`. `$RS models` lists the live OpenRouter catalog for speech, image and transcription. If the user asks to re-evaluate the models, compare the catalog with the Artificial Analysis arenas (text-to-speech, text-to-image, speech-to-text), test the candidate with one real call, and put the winner in `~/ReelStudio/config.json`, e.g. `{"tts": {"model": "..."}}`.
