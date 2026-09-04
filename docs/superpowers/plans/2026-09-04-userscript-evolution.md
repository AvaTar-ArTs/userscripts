# Userscript Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the original userscript repository, build a clean canonical maintained collection, then evolve that collection into a shared adapter-based architecture.

**Architecture:** Work happens in three isolated Git branches. `archive-vanilla-origins` is immutable provenance, `canonical-b` reorganizes and documents the current ecosystem without erasing history, and `final-forms` begins from completed B and centralizes site-specific behavior behind adapters.

**Tech Stack:** Tampermonkey/Greasemonkey userscripts, JavaScript, JSON registry metadata, Git/GitHub branches, lightweight Node-compatible validation scripts.

**Spec:** `docs/superpowers/specs/2026-09-04-userscript-evolution-design.md`

## Global Constraints

- Preserve every original userscript through `archive-vanilla-origins`.
- Never delete historical code solely because it is old; archive superseded variants.
- Exact duplicates may be removed from the active canonical surface only when content hashes match.
- Prefer current canonical hosts while retaining verified aliases only for compatibility.
- Prefer semantic selectors and captured application/network data over fragile framework classes.
- `master` is not modified during implementation.

---

### Task 1: Verify Preservation Branch and Inventory Origins

**Files:**
- Create on `canonical-b`: `reports/origin-inventory.md`
- Create on `canonical-b`: `reports/provenance-map.json`

**Interfaces:**
- Consumes: root file inventory from `archive-vanilla-origins`, local Tampermonkey audit findings, cross-repo GitHub findings.
- Produces: stable provenance identifiers used by `scripts.json` and archive notes.

- [ ] Verify `archive-vanilla-origins` still points to the pre-canonical repository state and make no content changes there.
- [ ] Enumerate userscript-like JavaScript files in the original repo.
- [ ] Record known duplicate SHA relationships, including the two identical Suno Data Extractor Master Script filenames.
- [ ] Record external lineage references from `Suno-Extractor-Empire`, `content-universe`, `pythons`, and `PYTHON_MARKETPLACE_MASTER` where already established.
- [ ] Commit provenance reports on `canonical-b`.

### Task 2: Build the Canonical B Layout

**Files:**
- Create: `src/current/README.md`
- Create: `archive/suno/README.md`
- Create: `archive/claude/README.md`
- Create: `archive/other/README.md`
- Create: `tools/README.md`
- Create: `reports/README.md`

**Interfaces:**
- Consumes: provenance report from Task 1.
- Produces: stable directory boundaries used by registry and documentation.

- [ ] Create canonical/archive/tool/report directories using README sentinels.
- [ ] Document movement rules and canonical-status labels.
- [ ] Keep original root files temporarily until canonical copies and registry entries exist, preventing accidental data loss.
- [ ] Commit structural scaffolding.

### Task 3: Establish Canonical Script Registry

**Files:**
- Create: `scripts.json`
- Create: `tools/validate-registry.mjs`

**Interfaces:**
- Produces registry entries shaped as `{id,name,status,path,hosts,legacyHosts,lineage,notes}`.

- [ ] Define unique canonical IDs for Suno extractor, Claude project extractor, Lyra exporter, and Ideogram reference.
- [ ] Record current hosts plus legacy aliases separately.
- [ ] Record ancestor filenames and external-repo references.
- [ ] Write validator that rejects duplicate IDs, missing paths, empty canonical host lists, and legacy-only canonical hosts.
- [ ] Run logical review of registry against the design spec.
- [ ] Commit registry and validator.

### Task 4: Promote Canonical B Scripts

**Files:**
- Create/copy: `src/current/suno-extractor.user.js`
- Create/copy: `src/current/claude-project-extractor.user.js`
- Create/copy: `src/current/lyra.user.js`
- Create: `src/current/ideogram-reference.md`

**Interfaces:**
- Consumes: strongest maintained lineages already present or established in sibling repos.
- Produces: the recommended install surface.

- [ ] Promote the later Suno hybrid/interception lineage as the canonical Suno reference without deleting ancestors.
- [ ] Promote Claude v3.2 lineage over duplicate v3.0 copies where behavior is compatible.
- [ ] Promote Lyra as the multi-platform exporter.
- [ ] Reference the Content Universe Ideogram harvester rather than duplicating it blindly.
- [ ] Update registry paths and lineage notes.
- [ ] Commit canonical install surface.

### Task 5: Add Compatibility and Dedupe Reports

**Files:**
- Create: `reports/current-site-compatibility.md`
- Create: `reports/dedupe-notes.md`

**Interfaces:**
- Consumes: current 2026 audit results from the merged Tampermonkey collection and GitHub inspection.

- [ ] Document current host migrations: ChatGPT, Gemini/Bard, NotebookLM, Grok, Claude, Kimi, DeepSeek.
- [ ] Document selector reliability guidance.
- [ ] Document confirmed exact duplicates and distinguish them from configuration-distinct local Tampermonkey entries.
- [ ] Commit reports.

### Task 6: Replace Root README with Canonical Navigation

**Files:**
- Create/update: `README.md`

**Interfaces:**
- Consumes: `scripts.json`, compatibility reports, branch-era model.

- [ ] Explain the three eras and which branch should be used for what.
- [ ] Provide a canonical install table for maintained scripts.
- [ ] Explain provenance and archival guarantees.
- [ ] Document site compatibility and maintenance policy.
- [ ] Commit README.

### Task 7: Validate Canonical B

**Files:**
- Read: `scripts.json`, canonical paths, reports.

- [ ] Confirm `archive-vanilla-origins` remains unchanged relative to its starting commit.
- [ ] Confirm canonical registry IDs are unique.
- [ ] Confirm every canonical registry path exists.
- [ ] Confirm current canonical host is present for each maintained script.
- [ ] Confirm exact duplicates are not both listed as canonical.
- [ ] Compare `canonical-b` against `archive-vanilla-origins` and review all changes.

### Task 8: Advance Final Forms to Canonical B

**Files:** branch ref only.

- [ ] Move `final-forms` to the validated `canonical-b` commit using a fast-forward/explicit ref update.
- [ ] Verify branch equality before architecture changes.

### Task 9: Add Shared Core and Adapter Contract

**Files:**
- Create: `src/core/registry.js`
- Create: `src/core/exporter.js`
- Create: `src/core/storage.js`
- Create: `src/core/downloads.js`
- Create: `src/adapters/README.md`

**Interfaces:**
- Adapter contract: `{id,hosts,detect,getConversationId,getMessages,getAssets,getMetadata,observe}`.
- Registry: `registerAdapter(adapter)`, `resolveAdapter(location, document)`.
- Exporter: normalizes adapter records into a shared export envelope.

- [ ] Implement adapter validation and registry resolution.
- [ ] Implement normalized export envelope helpers.
- [ ] Implement storage and download helpers without site selectors.
- [ ] Commit core architecture.

### Task 10: Implement Initial Site Adapters

**Files:**
- Create: `src/adapters/chatgpt.js`
- Create: `src/adapters/claude.js`
- Create: `src/adapters/gemini.js`
- Create: `src/adapters/grok.js`
- Create: `src/adapters/deepseek.js`
- Create: `src/adapters/kimi.js`
- Create: `src/adapters/qwen.js`
- Create: `src/adapters/notebooklm.js`
- Create: `src/adapters/suno.js`
- Create: `src/adapters/ideogram.js`

**Interfaces:** all implement the adapter contract from Task 9.

- [ ] Add current canonical host detection first.
- [ ] Keep legacy hosts as aliases, never as canonical replacements.
- [ ] Prefer semantic attributes and stable IDs; fail gracefully when unavailable.
- [ ] For Suno, expose captured/network data hooks first and DOM fallback second.
- [ ] Commit adapters.

### Task 11: Build Final-Form Apps

**Files:**
- Create: `src/apps/lyra.user.js`
- Create: `src/apps/suno-extractor.user.js`
- Create: `src/apps/claude-project-extractor.user.js`

**Interfaces:** applications consume the registry/adapters and may not embed foreign platform selector maps.

- [ ] Refactor Lyra-facing architecture to resolve the current adapter.
- [ ] Build Suno app around the Suno adapter and shared exporter/download helpers.
- [ ] Build Claude project app around the Claude adapter and shared helpers.
- [ ] Commit final-form apps.

### Task 12: Final Forms Validation and Documentation

**Files:**
- Create: `reports/final-forms-architecture.md`
- Update: `README.md`
- Update: `scripts.json`

- [ ] Document adapter contract and extension model.
- [ ] Confirm platform-specific selectors live only inside their own adapters.
- [ ] Confirm app modules switch platforms via registry resolution.
- [ ] Compare `final-forms` against `canonical-b` and review changes.
- [ ] Leave `master` untouched pending user review.
