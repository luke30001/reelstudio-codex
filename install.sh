#!/bin/sh
# ReelStudio for Codex: installer (macOS).
#   git clone https://github.com/luke30001/reelstudio-codex.git && cd reelstudio-codex && ./install.sh
# The only credential is your OpenRouter key: in a terminal it asks for it hidden and saves it in ~/ReelStudio/.env (chmod 600).
set -e
REPO="${REELSTUDIO_REPO:-luke30001/reelstudio-codex}"
DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN="$DIR/plugins/reelstudio"
RS_HOME="${REELSTUDIO_HOME:-$HOME/ReelStudio}"
ok() { printf '✓ %s\n' "$1"; }
warn() { printf '! %s\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }

[ "$(uname)" = "Darwin" ] || warn "ReelStudio is built for macOS; other systems are untested."
has codex || { echo "✗ Codex CLI not found (https://developers.openai.com/codex)"; exit 1; }
has node || { echo "✗ Node.js 20+ is required (brew install node)"; exit 1; }
has ffmpeg || warn "ffmpeg is missing: install it with 'brew install ffmpeg' (needed for audio and the render)."

# 1. plugin, from the GitHub marketplace
if codex plugin marketplace list 2>/dev/null | grep -q '^reelstudio '; then
  codex plugin marketplace upgrade reelstudio >/dev/null 2>&1 || true
else
  codex plugin marketplace add "$REPO"
fi
codex plugin add reelstudio@reelstudio
ok "Codex plugin reelstudio@reelstudio (skill 'reel', command /reel)"

# 2. launcher the skill uses
mkdir -p "$HOME/.local/bin"
cp "$PLUGIN/bin/reelstudio" "$HOME/.local/bin/reelstudio"
chmod +x "$HOME/.local/bin/reelstudio"
ok "launcher ~/.local/bin/reelstudio"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) warn "~/.local/bin is not on your PATH: add  export PATH=\"\$HOME/.local/bin:\$PATH\"  to ~/.zshrc";; esac

# 3. engine + Remotion into ~/ReelStudio (first run downloads Remotion with npm)
"$HOME/.local/bin/reelstudio" setup

# 4. the only credential: the OpenRouter key (voice, images, word timings). Asked hidden, only in a real terminal.
if grep -q '^OPENROUTER_API_KEY=sk-or-' "$RS_HOME/.env" 2>/dev/null; then
  ok "OpenRouter key already set"
  KEYMSG="Key already set (change it any time with: reelstudio key)"
elif [ -t 0 ] && [ -t 1 ]; then
  echo; echo "ReelStudio needs one key: OpenRouter (create it at https://openrouter.ai/keys and add a few dollars of credit)."
  "$HOME/.local/bin/reelstudio" key || warn "key not saved: run  reelstudio key  later"
  KEYMSG="Change the key any time with: reelstudio key"
else
  KEYMSG="Open the Terminal app and run:  reelstudio key   (it asks for your OpenRouter key without showing it; never paste it into a chat)"
fi

APP=$(ls -d "$HOME"/.codex/plugins/cache/reelstudio/reelstudio/*/app-codex 2>/dev/null | sort -V | tail -1)
cat <<EOF

ReelStudio for Codex is installed.
Next:
  1. $KEYMSG
     Without a key the voice uses macOS 'say' and images are off.
  2. Restart Codex, then type:  /reel <your topic>
     Codex will ask before the first reelstudio command runs outside its sandbox (it needs the internet and Chrome).
  Optional web app:  node "$APP/server.mjs"   → http://localhost:4749
EOF
