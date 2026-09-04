# Final Forms Architecture

`final-forms` begins from the validated `canonical-b` state and moves repeated platform logic into adapters.

## Shared core

- `src/core/registry.js` validates and resolves adapters.
- `src/core/exporter.js` normalizes messages/assets/metadata into a shared export envelope.
- `src/core/storage.js` centralizes persistence helpers.
- `src/core/downloads.js` centralizes browser download behavior.

## Adapters

Current adapters:

- ChatGPT
- Claude
- Gemini
- Grok
- DeepSeek
- Kimi
- Qwen
- NotebookLM
- Suno
- Ideogram

Each adapter owns its platform-specific selectors. Apps consume adapter outputs instead of carrying their own cross-platform selector dictionaries.

## Apps

- `src/apps/lyra.user.js`
- `src/apps/suno-extractor.user.js`
- `src/apps/claude-project-extractor.user.js`

These are modular source entrypoints and must be bundled before direct Tampermonkey installation because they use ES module imports.

## Suno strategy

The Suno adapter checks a captured-data channel first (`globalThis.__SUNO_CAPTURED_SONGS__`) and falls back to semantic-ish DOM anchors such as `a[href*="/song/"]`. This preserves the useful historical DOM extraction path while making captured application data the preferred interface.

## Evolution model

`archive-vanilla-origins` → preserved history

`canonical-b` → practical maintained install surface

`final-forms` → shared core + per-site adapters + app entrypoints

`master` remains untouched pending review.
