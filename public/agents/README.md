# Agent logos

Square PNGs, named by product slug. BrandMark.tsx tries `/agents/<slug>.png`
first and falls back to a built-in glyph if missing.

  chatgpt.png   ChatGPT / GPT / OpenAI
  claude.png    Claude / Anthropic
  cursor.png    Cursor
  github.png    GitHub Copilot / Copilot

Source SVGs from svgl.app (openai_dark, claude-ai-icon, cursor_dark, copilot_dark),
kept in .logo-originals/ at the repo root. Normalized:

  magick -background none -density 512 in.svg -trim +repage \
    -resize '110x110>' -background none -gravity center -extent 128x128 -strip out.png

Add an agent by editing SLUGS in src/ui/primitives/BrandMark.tsx.
