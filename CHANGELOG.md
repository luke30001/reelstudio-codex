# Changelog

## 0.4.3
- No more robotic voice by surprise: the macOS draft voice is used only when you ask for it (`--local`), and `render` refuses draft-voice scenes. A missing key or a network blocked by the Codex sandbox now stops with a clear message instead of falling back silently.
- New commands: `reelstudio doctor` (health check, including whether OpenRouter accepts your key), `reelstudio update` (latest version from GitHub in one step), `reelstudio version`, `reelstudio help`.
- `install.sh` offers to install Node.js 20+ and ffmpeg with Homebrew and ends with a health check.
- New README with a preview, troubleshooting and uninstall steps; CI checks on every push.

## 0.4.2
- The call to action is its own full screen (`EndScreen`): opaque brand background, mascot, title, handle and actions, never on top of photos.
- Fixed a stale render cache that could crash the last scenes; `RS_DEV=1` shows readable React errors.

## 0.4.1
- `render --speed 1.5` (or `"speed"` in reel.json): faster cut, voice pitch kept.
- Components use the brand font; the mascot blends into light paper backgrounds.

## 0.4.0
- Real archive photos from Wikimedia Commons (free licenses, automatic credits), with grading, grain and Ken Burns.
- 4K AI images for shots the camera zooms into.
- Gemini TTS, voice Charon: native-sounding Italian. ElevenLabs and Microsoft voices as options.
- `reelstudio key`: hidden prompt, key saved with chmod 600.

## 0.3.0
- Camera zoom format: one world per story, a virtual camera that glides and zooms between shots, editorial kit (headline, pill, pins, rings, stat cards, charts).
