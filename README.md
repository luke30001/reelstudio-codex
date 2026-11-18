# ReelStudio for Codex

Make short vertical videos (Instagram Reels, TikTok, YouTube Shorts) on your Mac with Codex.
Codex writes the script, codes the scenes and checks its own frames. OpenRouter does the voice (ElevenLabs), the illustrations and the word timings. Remotion and ffmpeg render the MP4 on your computer.

## Requirements
- macOS with the [Codex CLI](https://developers.openai.com/codex) signed in
- Node.js 20+ and ffmpeg: `brew install node ffmpeg`
- An [OpenRouter](https://openrouter.ai) key (optional: without it the voice falls back to macOS `say` and images are off)

## Install
```bash
git clone https://github.com/luke30001/reelstudio-codex.git
cd reelstudio-codex
./install.sh
```
The script adds this repository as a Codex plugin marketplace, installs `reelstudio@reelstudio`, puts the `reelstudio` launcher in `~/.local/bin` and sets up the engine in `~/ReelStudio` (the first run downloads Remotion with npm).

Then put your key in `~/ReelStudio/.env` yourself (never paste it into a chat):
```
OPENROUTER_API_KEY=sk-or-...
```

## Use
In Codex: `/reel why lists help your memory`, or just ask "make me a 30 second reel about …".
Codex shows you the script first, then does the voice, images, frame check and render. Videos end up in `~/ReelStudio/reels/<name>/final.mp4`.

**Premium editorial look (the zoom format):** pick the `editoriale` brand (or point your brand at the `editoriale` look). Codex builds one big vector world for the story and a virtual camera glides and zooms over it, with a serif headline, a red pill, anchored labels, rings, measures, stat cards and animated charts. Edit `~/ReelStudio/brands/editoriale.json` to set your name, handle and voice.

The `reelstudio` command needs the internet and headless Chrome, so Codex asks for permission the first time it runs it outside its sandbox.

Optional web app: `node ~/.codex/plugins/cache/reelstudio/reelstudio/<version>/app-codex/server.mjs` → http://localhost:4749

## Update
```bash
codex plugin marketplace upgrade reelstudio
codex plugin add reelstudio@reelstudio
reelstudio setup
```

## Layout
- `.agents/plugins/marketplace.json`: Codex marketplace
- `plugins/reelstudio/.codex-plugin/plugin.json`: plugin manifest
- `plugins/reelstudio/skills/reel/SKILL.md`: the producer's playbook
- `plugins/reelstudio/engine/`: the `rs` engine (voice, images, timings, Remotion render)
- `plugins/reelstudio/seed/`: starter brands and looks
- `plugins/reelstudio/app-codex/`: local web app that drives `codex exec`
