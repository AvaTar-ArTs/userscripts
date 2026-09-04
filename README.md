# Userscripts Evolution

This repository now has three explicit eras:

- `archive-vanilla-origins` — untouched historical snapshot and provenance source.
- `canonical-b` — maintained, deduplicated install surface with compatibility documentation.
- `final-forms` — evolved adapter-based architecture built from Canonical B.

## Canonical B

Recommended maintained entries live in `src/current/` and are indexed in `scripts.json`.

| ID | Purpose | Canonical hosts | Status |
|---|---|---|---|
| `suno-extractor` | Suno extraction/export | `suno.com` | canonical |
| `claude-project-extractor` | Claude project/file extraction | `claude.ai` | canonical |
| `lyra` | Multi-platform AI chat export | ChatGPT, Claude, Gemini, Grok, NotebookLM | canonical |
| `ideogram-harvester-reference` | Ideogram harvesting reference | `ideogram.ai` | reference |

Historical root files are intentionally retained during canonicalization. Exact duplicates are excluded from the active canonical surface, but preserved in Vanilla Origins.

## Compatibility policy

Current canonical hosts are preferred over legacy aliases. See `reports/current-site-compatibility.md` for known migrations and selector guidance. Semantic selectors and captured application/network data are preferred over hashed framework classes and layout-specific selectors.

## Provenance

See `reports/origin-inventory.md`, `reports/provenance-map.json`, and `reports/dedupe-notes.md`.

## Validation

Run:

```bash
node tools/validate-registry.mjs
```

The validator checks unique IDs, required canonical hosts, paths, and legacy-only host mistakes.

## Final Forms

The `final-forms` branch starts from completed Canonical B and introduces shared core modules plus per-site adapters. `master` is intentionally left unchanged until review.
