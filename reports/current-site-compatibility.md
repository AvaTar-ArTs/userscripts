# Current Site Compatibility

Audit date: 2026-09-04.

Canonical host migrations:

- ChatGPT: `chatgpt.com`; retain `chat.openai.com` only as a legacy alias.
- Gemini: `gemini.google.com`; `bard.google.com` is legacy.
- NotebookLM: `notebooklm.google.com`; `notebook.google.com` is stale/legacy for this purpose.
- Grok: prefer `grok.com`; treat `grok.x.ai` as legacy/alternate.
- Claude: `claude.ai`; `chat.anthropic.com` is legacy.
- Kimi: prefer `kimi.com`; `kimi.moonshot.cn` is legacy/alternate.
- DeepSeek chat automation: prefer `chat.deepseek.com` over the marketing site.
- Suno: `suno.com` remains current.
- Ideogram: `ideogram.ai` remains current.

Selector guidance:

1. Prefer `data-*`, `data-testid`, roles, ARIA attributes, durable links, stable platform IDs, and captured application/network data.
2. Treat framework classes, long hashed classes, `nth-child`, and style-substring selectors as brittle fallbacks.
3. A correct hostname does not imply a healthy script. DOM contracts must be revalidated independently.
4. Suno should progressively prefer captured/API data with DOM extraction as fallback.

The merged local Tampermonkey audit indexed 142 userscripts and found a significant multi-platform footprint across ChatGPT/OpenAI, Suno, Gemini, DeepSeek, Grok, Claude, NotebookLM, Ideogram, Qwen, Kimi, Poe, Perplexity, YouTube, and related services.
