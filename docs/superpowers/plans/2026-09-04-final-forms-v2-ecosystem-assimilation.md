# Final Forms v2 Ecosystem Assimilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `final-forms` with provenance-aware ecosystem intake, richer normalized records, Google AI Studio and SillyTavern adapters, DeepSeek and Ideogram apps, and reusable search/tag services.

**Architecture:** Preserve the existing adapter contract and layer richer records/services above it. External AvaTar-ArTs repos are treated as provenance sources, not wholesale code donors. New functionality remains isolated on `final-forms`.

**Tech Stack:** JavaScript ES modules, Tampermonkey userscripts, Node.js tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-final-forms-v2-ecosystem-assimilation-design.md`

## Global Constraints
- Do not modify `archive-vanilla-origins` or `canonical-b`.
- Keep existing adapters backward compatible.
- Classify ecosystem sources as `copy`, `adapt`, `reference`, or `archaeology`.
- Do not import Playwright crawler code or license-incompatible third-party source.
- Do not merge to `master` automatically.

---

### Task 1: Provenance Intake Registry

**Files:**
- Create: `ecosystem-sources.json`

**Interfaces:**
- Produces: JSON object `{ schemaVersion, sources[] }`; each source has `repo`, `path`, `mode`, `capabilities`, `target`, and optional `sha`.

- [ ] Create registry entries for Lyra, Content Universe, Suno Extractor Empire, NotebookLM Mine archaeology, Pythons archaeology, MediaCrawler reference, and Claude Manager reference.
- [ ] Validate JSON syntax with Node.
- [ ] Commit.

### Task 2: Rich Record Schema and Normalizer

**Files:**
- Create: `src/schema/conversation-record.js`
- Create: `src/services/record-normalizer.js`

**Interfaces:**
- Produces: `createConversationRecord(input)` and `normalizeAdapterMessage(message, context)`.
- Record fields: `id`, `platform`, `conversationId`, `branchId`, `parentId`, `role`, `content`, `thinking`, `attachments`, `artifacts`, `toolCalls`, `citations`, `createdAt`, `updatedAt`, `metadata`, `raw`.

- [ ] Write schema with deterministic defaults.
- [ ] Write adapter-message normalizer preserving legacy `text` as `content`.
- [ ] Commit.

### Task 3: Shared Search and Tag Services

**Files:**
- Create: `src/services/search-index.js`
- Create: `src/services/tag-store.js`

**Interfaces:**
- Produces: `buildSearchIndex(records)`, `searchRecords(index, query)`, `createTagStore(storageLike, key)`.

- [ ] Implement lowercase token indexing across content, thinking, artifacts, citations, and metadata title.
- [ ] Implement localStorage-compatible tag/star persistence.
- [ ] Commit.

### Task 4: New Adapters

**Files:**
- Create: `src/adapters/google-ai-studio.js`
- Create: `src/adapters/sillytavern.js`
- Modify: `src/adapters/index.js`

**Interfaces:**
- Adapters satisfy existing `{ id, hosts, detect, getMessages, getAssets, getMetadata, observe }` contract.

- [ ] Add Google AI Studio adapter for `aistudio.google.com` using semantic/role-based selectors.
- [ ] Add SillyTavern adapter for local/common hosts and conservative chat message selectors.
- [ ] Register/export both adapters.
- [ ] Commit.

### Task 5: Final Forms Apps

**Files:**
- Create: `src/apps/deepseek-exporter.user.js`
- Create: `src/apps/ideogram-harvester.user.js`

**Interfaces:**
- Each app resolves its adapter, normalizes records, and downloads JSON/Markdown or harvested identity JSON without duplicating platform selector maps.

- [ ] Create DeepSeek export app using shared adapter + normalizer.
- [ ] Create Ideogram harvester app using the Ideogram adapter and Content Universe provenance.
- [ ] Commit.

### Task 6: Tests and CI

**Files:**
- Create: `tests/final-forms-v2.test.mjs`
- Modify: `.github/workflows/final-forms-validate.yml`

**Interfaces:**
- Test script exits nonzero on schema/adapter/service/registry failures.

- [ ] Test rich record defaults and preservation.
- [ ] Test AI Studio and SillyTavern host detection.
- [ ] Test search and tag services.
- [ ] Test `ecosystem-sources.json` shape and allowed intake modes.
- [ ] Update CI to run `node --test tests/final-forms-v2.test.mjs` plus syntax checks.
- [ ] Commit.

### Task 7: Documentation and Registry Update

**Files:**
- Create: `reports/ecosystem-assimilation.md`
- Modify: `scripts.json`

**Interfaces:**
- Documents added sources, adapted capabilities, rejected wholesale imports, and next-stage candidates.

- [ ] Add Final Forms v2 app entries and provenance notes to `scripts.json`.
- [ ] Document Lyra capabilities mined, Content Universe promotion, DeepSeek archaeology, and reference-only architectures.
- [ ] Commit.

### Verification

- [ ] Parse `scripts.json` and `ecosystem-sources.json` with Node.
- [ ] Run `node --test tests/final-forms-v2.test.mjs`.
- [ ] Run `node --check` on all new/modified JavaScript files.
- [ ] Compare `canonical-b...final-forms` to confirm only Final Forms changed.
