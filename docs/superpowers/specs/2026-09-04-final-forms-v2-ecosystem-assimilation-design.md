# Final Forms v2: Ecosystem Assimilation Design

## Goal
Expand `final-forms` by mining proven capabilities from the wider AvaTar-ArTs ecosystem without turning `userscripts` into a duplicate dump.

## Principles
- `archive-vanilla-origins` remains untouched.
- `canonical-b` remains the stable canonical userscript line.
- `final-forms` may evolve architecture but must preserve provenance.
- External repo material is classified as `copy`, `adapt`, `reference`, or `archaeology`.
- Prefer normalized records and platform adapters over per-script selector duplication.
- Keep existing adapter contracts backward compatible.

## Intake Registry
Add `ecosystem-sources.json` with source repository/path, capability, provenance SHA where known, intake mode, target component, and notes.

## Normalized Record Model
Introduce a richer conversation/media record schema supporting:
- id, platform, conversationId, branchId, parentId
- role, content, thinking
- attachments, artifacts, toolCalls, citations
- createdAt, updatedAt
- metadata and raw payloads

## New Platform Coverage
Add first-class adapters for:
- Google AI Studio
- SillyTavern

Keep existing adapters for ChatGPT, Claude, Gemini, Grok, DeepSeek, Kimi, Qwen, NotebookLM, Suno, and Ideogram.

## New Apps
Add:
- DeepSeek exporter app using the Final Forms adapter and normalized record model
- Ideogram harvester app using the existing Ideogram adapter and provenance from `content-universe`

## Shared Services
Mine architecture from `lyra-exporter` rather than copying the app wholesale. Add focused services for:
- normalization
- search/indexing
- tag/star metadata

Future v2.x work may add branch graphing, semantic search, batch export, and richer file parsers.

## Provenance Sources
Initial sources:
- `AvaTar-ArTs/lyra-exporter`
- `AvaTar-ArTs/content-universe`
- `AvaTar-ArTs/Suno-Extractor-Empire`
- `AvaTar-ArTs/notebooklm-mine`
- `AvaTar-ArTs/pythons`
- `AvaTar-ArTs/MediaCrawler` as architecture reference only
- `AvaTar-ArTs/claude-manager` as architecture reference only

## Validation
Add Node-based tests that validate:
- normalized message defaults and rich fields
- adapter detection for Google AI Studio and SillyTavern
- search and tag services
- ecosystem source registry shape

Update Final Forms CI to syntax-check and run the v2 tests.

## Non-goals
- Do not import Playwright crawler code into userscripts.
- Do not copy third-party/fork code with incompatible licensing.
- Do not rewrite every existing adapter in this pass.
- Do not merge `final-forms` into `master` automatically.
