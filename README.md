# ReelStudio for Codex

Topic in, vertical reel out. ReelStudio turns Codex into a small video studio on your Mac: it writes the script, plans every shot, codes the scenes, checks its own frames and renders an MP4 ready for Instagram Reels, TikTok or YouTube Shorts.

![Four reel covers made with ReelStudio](docs/showcase.jpg)

*Covers from four test reels: the editorial zoom format, the archive format with real 1929 photos (Associated Press, public domain, via Wikimedia Commons), a data explainer and a branded version.*

## What it does
- **Script first**: Codex shows you the script and the shot plan before spending anything.
- **Natural voice**: Gemini TTS (voice Charon by default, native-sounding Italian and English), with word-by-word timings for captions and animations. ElevenLabs and Microsoft voices are one flag away.
- **Camera zoom format**: one big world per story, and a virtual camera that glides and zooms between shots, with serif headlines, pills, pins, rings, stat cards and animated charts.
- **The right picture for each shot**: real archive photos from Wikimedia Commons (free licenses only, credits added automatically), 4K AI images, or clean vector graphics, chosen per shot.
- **Self-checking**: Codex renders still frames and motion strips, looks at them and fixes overlaps, cut-off text and contrast before the final render.
- **Clean ending**: the call to action is always its own full screen with your handle, never text on top of a photo.
- **Brands**: your colors, fonts, mascot, handle and voice in one file. Starter brands `editoriale`, `storia` (archive documentary) and `scriba`.
- **Speed**: `"speed": 1.5` renders a faster cut with the voice pitch kept.

Everything renders locally with Remotion and ffmpeg. Only voice, images and timings go through OpenRouter, and you pay OpenRouter directly: a 45-second reel usually costs a few tens of cents.

## Install (macOS)
You need the [Codex CLI](https://developers.openai.com/codex), signed in. The installer offers to install Node.js 20+ and ffmpeg with Homebrew if they are missing.
```bash
git clone https://github.com/luke30001/reelstudio-codex.git
cd reelstudio-codex
./install.sh
```
It adds this repository as a Codex plugin marketplace, installs `reelstudio@reelstudio`, puts the `reelstudio` command in `~/.local/bin`, sets up the engine in `~/ReelStudio` (the first run downloads Remotion), asks for your key and ends with a health check.

### Your OpenRouter key
Voice, images and word timings use one key from [openrouter.ai/keys](https://openrouter.ai/keys); add a few dollars of credit and, ideally, a spending limit on the key. Real photos need no key, and Codex uses your ChatGPT login.
To set or change the key, run this yourself in the Terminal app:
```bash
reelstudio key
```
It reads the key without showing it and saves it in `~/ReelStudio/.env`, readable only by you. Never paste the key into Codex or any chat.

## Make a reel
In Codex:
```
/reel the Black Thursday of 1929, archive style, 45 seconds
```
or just ask *"make me a 30 second reel about …"*. Codex asks for the brand and length, shows the script, then does voice, visuals, frame checks and the render. Videos end up in `~/ReelStudio/reels/<name>/final.mp4`, with a `cover.png`.

Codex asks permission the first time a `reelstudio` command needs the network or headless Chrome outside its sandbox: allow it, otherwise the voice and images cannot be made.

Ideas to try:
- *"Re-render my last reel at 1.5x."*
- *"Rebrand that reel for scriba."*
- *"Change the hook and redo only that scene's voice."*

## Commands
| Command | What it does |
| --- | --- |
| `reelstudio doctor` | checks Node, ffmpeg, Codex, plugin, engine and key |
| `reelstudio update` | gets the latest version from GitHub and refreshes the engine |
| `reelstudio key` | sets the OpenRouter key (hidden prompt) |
| `reelstudio list` | your reels, brands and looks |
| `reelstudio version` | installed plugin and engine versions |
| `reelstudio help` | every engine command (voice, image, photo, frames, render, …) |

Optional web app: `node ~/.codex/plugins/cache/reelstudio/reelstudio/<version>/app-codex/server.mjs`, then open http://localhost:4749.

## Brands
Brands live in `~/ReelStudio/brands/<name>.json` and point to a look in `~/ReelStudio/looks/<look>/` (palette, fonts, image style, mascot). Edit `editoriale.json` to put in your own name, handle and voice, or ask Codex to create a brand for you.

## Troubleshooting
- **Robotic voice**: that is the macOS draft voice. It is only used when you ask for a free draft, and the render refuses it otherwise. If the voice step fails, run `reelstudio doctor`: usually the key is missing or Codex ran the command without network access.
- **"cannot reach openrouter.ai"**: the Codex sandbox blocked the network. Approve the command when Codex asks to run it with network access.
- **Something else**: `reelstudio doctor` lists what is missing and how to fix it.

## Update
```bash
reelstudio update
```
Then restart Codex. See [CHANGELOG.md](CHANGELOG.md) for what changed.

## Uninstall
```bash
codex plugin remove reelstudio@reelstudio
```
```bash
rm ~/.local/bin/reelstudio
```
Your reels and key stay in `~/ReelStudio`; delete that folder too if you want everything gone.

## Layout
- `.agents/plugins/marketplace.json`: Codex marketplace
- `plugins/reelstudio/.codex-plugin/plugin.json`: plugin manifest
- `plugins/reelstudio/skills/reel/SKILL.md`: the producer's playbook
- `plugins/reelstudio/engine/`: the `rs` engine (voice, images, photos, timings, Remotion render) and the scene component library
- `plugins/reelstudio/seed/`: starter brands and looks
- `plugins/reelstudio/bin/reelstudio`: the command-line launcher
- `plugins/reelstudio/app-codex/`: local web app that drives `codex exec`
