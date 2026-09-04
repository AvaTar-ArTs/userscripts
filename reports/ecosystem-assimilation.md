# Final Forms v2 Ecosystem Assimilation

## Purpose
This pass mined useful browser/export architecture from the wider `AvaTar-ArTs` ecosystem without copying entire repositories into `userscripts`.

## Added directly

### Google AI Studio adapter
Source motivation: the Lyra ecosystem already recognizes Google AI Studio as a first-class conversation source. Final Forms now exposes it through `src/adapters/google-ai-studio.js` and Lyra's source entrypoint includes `aistudio.google.com`.

### SillyTavern adapter
Lyra's post-processing system understands SillyTavern conversation and branch formats. Final Forms now includes a conservative local-host adapter that requires a SillyTavern-like chat DOM marker before activating.

### DeepSeek exporter
Historical DeepSeek exporter variants survive in `notebooklm-mine` and generated documentation in `pythons`. Instead of restoring one generated artifact verbatim, Final Forms rebuilds the useful behavior as `src/apps/deepseek-exporter.user.js`, using the shared adapter and normalized record schema with JSON and Markdown output.

### Ideogram harvester
`AvaTar-ArTs/content-universe/browser/ideogram-harvester.user.js` is promoted from a reference-only relationship to an actual Final Forms app. The new app preserves the architectural ideas of incremental collection, lazy-load sweeping, resume-by-accumulation, and JSON export while keeping the original source repository recorded in provenance.

## Capabilities mined from Lyra
The `lyra-exporter` repository contains a mature post-processing layer including batch export, global search, semantic search, copy/rename management, parsing, sorting, tagging, starring, statistics, UUID management, and cross-window messaging.

Final Forms v2 intentionally takes only the first reusable slice:
- normalized rich records
- text/rich-field search indexing
- tag/star persistence

Later v2.x work can add branch graphs, batch export, semantic search, and format-specific parsers without coupling the userscript layer to the React application.

## Rich normalized record
Final Forms now preserves fields beyond plain message text:
- platform and conversation identifiers
- branch and parent identifiers
- role and content
- thinking/reasoning
- attachments
- artifacts
- tool calls
- citations
- timestamps
- metadata
- raw source payload

Legacy adapters that return `{ role, text }` remain compatible through `record-normalizer.js`.

## Reference-only architectures

### MediaCrawler
Useful architectural ideas: platform-specific browser modules, Playwright/CDP session reuse, and saved login state. No crawler code is imported because it is a heavier automation surface and should remain separate from the userscript runtime.

### Claude Manager
Useful architectural ideas: session registry, project/branch filtering, import/export, local-first state, and activity metadata. These are recorded for a future cross-platform session registry rather than copied into the browser layer.

### Sora browser extension history
The `pythons` repository contains browser-extension-era Sora tooling. This supports a future split between `src/apps/` userscripts and `src/extensions/` browser-extension delivery, but no extension code is imported in this pass.

## Intake modes
Every external source is classified in `ecosystem-sources.json` as one of:
- `copy`: source may be copied as an owned canonical component
- `adapt`: capability is rewritten behind Final Forms interfaces
- `reference`: architectural donor only
- `archaeology`: historical artifacts inform design but are not executable sources

## Next candidates
1. Branch graph service for Gemini, Grok, SillyTavern and account-export data.
2. Batch exporter service derived from Lyra's `batchExportManager` architecture.
3. Semantic search as an optional service with no required remote dependency.
4. Session registry above platform adapters.
5. BrowserBridge interface for CDP/Playwright sources without embedding crawler code.
6. Perplexity adapter after a clean owned source or current DOM/API audit is available.
