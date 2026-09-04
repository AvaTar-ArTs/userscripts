# Userscript Evolution Design

## Goal

Evolve `AvaTar-ArTs/userscripts` through three explicit eras while preserving provenance:

1. `archive-vanilla-origins` — immutable historical snapshot of the current repository.
2. `canonical-b` — cleaned, deduplicated, documented source of truth.
3. `final-forms` — adapter-based architecture that consolidates duplicated site logic into maintainable platform modules.

## Era 1: archive-vanilla-origins

`archive-vanilla-origins` is preservation-only. It keeps the repository exactly as it existed before canonicalization. No code modernization, selector rewrites, dedupe deletions, or file moves belong here after the snapshot is created.

Purpose:
- preserve every historical userscript and utility;
- retain original filenames, version chains, and experiments;
- provide rollback/provenance reference for later eras;
- prevent canonical cleanup from erasing evolutionary history.

## Era 2: canonical-b

`canonical-b` is the practical maintained userscript collection.

### Structure

- `src/current/` — canonical installable userscripts.
- `archive/suno/` — superseded Suno variants retained for lineage.
- `archive/claude/` — superseded Claude variants retained for lineage.
- `archive/other/` — other superseded or experimental userscripts.
- `tools/` — comparison, merge, migration, export, and maintenance utilities.
- `reports/` — compatibility, provenance, and dedupe reports.
- `scripts.json` — machine-readable registry of canonical scripts and lineage.
- `README.md` — human-readable entry point, site matrix, install notes, status, and architecture.

### Canonicalization Rules

- Never delete historical code from the repository solely because it is old; move superseded code into an archive path.
- Remove exact duplicate files from the canonical surface only when content hashes are identical.
- Preserve distinct variants when metadata, configuration behavior, selectors, API strategy, or storage semantics differ.
- Prefer the most capable and maintainable lineage as canonical, not automatically the numerically highest filename.
- Record each canonical script's ancestors in `scripts.json`.
- Treat local Tampermonkey export contents and GitHub copies as separate provenance sources until content comparison proves equivalence.

### Initial Canonical Candidates

- Suno: favor the later interception/hybrid extractor lineage over DOM-only ancestors; use v9-era behavior as the consolidation reference while retaining useful features discovered in v5-v8 branches.
- Claude: favor the newer `claude-project-extract.js` v3.2 lineage over duplicate v3.0 copies where behavior is compatible.
- Lyra: retain as the multi-platform AI chat export/backup layer.
- Ideogram: import or reference the `content-universe` Ideogram harvester as a modern adapter-style reference rather than duplicating its logic blindly.

### Compatibility Modernization

Canonical scripts should prefer current hosts and stable selectors. Known migration targets include:

- `chat.openai.com` → `chatgpt.com`
- `bard.google.com` → `gemini.google.com`
- `notebook.google.com` → `notebooklm.google.com`
- `grok.x.ai` → prefer `grok.com`
- `chat.anthropic.com` → prefer `claude.ai`
- `kimi.moonshot.cn` → prefer `kimi.com`
- DeepSeek chat automation → prefer `chat.deepseek.com` over the marketing site

Selectors should prefer semantic hooks such as `data-*`, `data-testid`, roles, ARIA attributes, durable links, or platform message identifiers over hashed classes, framework classes, `nth-child`, or style substring matching.

## Era 3: final-forms

`final-forms` is the evolved architecture. It begins from the completed `canonical-b` state and converts repeated site-specific logic into explicit adapters.

### Architecture

Proposed layout:

- `src/core/registry.js` — resolves current site and loads its adapter.
- `src/core/exporter.js` — common export pipeline and normalized data contract.
- `src/core/storage.js` — common persistence helpers.
- `src/core/downloads.js` — common download/export helpers.
- `src/adapters/chatgpt.js`
- `src/adapters/claude.js`
- `src/adapters/gemini.js`
- `src/adapters/grok.js`
- `src/adapters/deepseek.js`
- `src/adapters/kimi.js`
- `src/adapters/qwen.js`
- `src/adapters/notebooklm.js`
- `src/adapters/suno.js`
- `src/adapters/ideogram.js`
- `src/apps/lyra.user.js` — multi-platform chat exporter consuming adapters.
- `src/apps/suno-extractor.user.js` — Suno-focused application consuming the Suno adapter.
- `src/apps/claude-project-extractor.user.js` — Claude-focused application consuming the Claude adapter.

### Adapter Contract

Each adapter should expose a small common contract:

- `id`
- `hosts`
- `detect(location, document)`
- `getConversationId()` or platform-equivalent identity method
- `getMessages()` or platform-equivalent record collection method
- `getAssets()` for downloadable attachments/media when supported
- `getMetadata()`
- `observe(callback)` for dynamic UI updates when required

Adapters may expose platform-specific extensions, but shared apps must not depend on private DOM selectors from another adapter.

### Suno Strategy

Suno should prefer network/API interception or captured application data where reliable, with DOM extraction as a fallback. DOM-only historical extractors remain archived as regression references.

### Testing

Canonicalization tests should verify:

- exact-duplicate detection by content hash;
- registry validity and unique canonical IDs;
- every canonical userscript maps to at least one target host;
- legacy host aliases do not replace current canonical hosts;
- archived files are excluded from canonical install manifests.

Final-forms tests should verify:

- adapter host detection;
- normalized output shape;
- fixture-based parsing for each supported platform;
- graceful failure when expected selectors or data sources are absent;
- app code can switch adapters without embedding site-specific selectors.

## Branch Flow

- `archive-vanilla-origins` remains frozen at the pre-cleanup state.
- `canonical-b` receives the canonicalization work.
- once `canonical-b` is complete, `final-forms` is advanced to that commit before adapter work begins.
- `master` should only be updated after the user reviews the resulting branches or pull requests.

## Success Criteria

The evolution is complete when:

1. every original userscript remains recoverable from `archive-vanilla-origins`;
2. `canonical-b` has no exact duplicates on its active install surface;
3. canonical scripts are documented and represented in `scripts.json`;
4. current-vs-legacy site compatibility is visible in the repo;
5. `final-forms` centralizes repeated platform detection and extraction logic through adapters;
6. historical variants remain available without obscuring which scripts should actually be installed.
