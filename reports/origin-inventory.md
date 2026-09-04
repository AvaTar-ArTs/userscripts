# Vanilla Origins Inventory

Preservation branch: `archive-vanilla-origins`
Baseline commit: `5ad428ea84c7c86b51973ca0783bc6cdba627da2`

This report records the repository state before canonicalization. The preservation branch must remain unchanged.

## Root userscript / JavaScript lineage

- `: SUNO DevTools Exporter v3.1 (MASTER-CLEAN CSV.js`
- `:: ULTIMATE SUNO EXTRACTOR v2.1 - EXTRACT LYRICS.js`
- `Claude Project Files Extractor-3.0.user.js`
- `LIVE_SUNO_EXTRACTOR.js`
- `SUNO_ULTIMATE_EXTRACTOR.js`
- `Suno Data Extractor Master Script.js`
- `Suno Data Extractor MasterScript.js`
- `Suno Extractor v8.0 (Ultimate).user.js`
- `ULTIMATE SUNO EXTRACTOR v2.2.js`
- `claude-project-extract.js`
- `combine-all-suno-exports.js`
- `compare-suno-exports.js`
- `extract-suno.js`
- `lyra.js`
- `merge-all-suno-intelligent.js`
- `merge-all-suno-sources.js`
- `suno-advanced-FIXED.js`
- `suno-advanced-extractor.js`
- `suno-data-extractors.js`
- `suno-extractor-utils.js`
- `suno-universal.js`
- `universal-suno-extractor.js`

## Exact duplicate confirmed

`Suno Data Extractor Master Script.js` and `Suno Data Extractor MasterScript.js` share Git blob SHA:

`6570a40ab2703892eddd487479751eb105569700`

They represent one byte-identical source under two filenames. Only one should ever be promoted to the canonical install surface, while both remain preserved on `archive-vanilla-origins`.

## Known external lineage

- `AvaTar-ArTs/Suno-Extractor-Empire` contains later Suno extractor generations including v7.x, v8.0, v9.0, and the one-click backup lineage.
- `AvaTar-ArTs/content-universe/browser/ideogram-harvester.user.js` is the modern Ideogram harvesting reference.
- `AvaTar-ArTs/pythons` contains copies of the Claude Project Files Extractor v3.0 lineage.
- `AvaTar-ArTs/PYTHON_MARKETPLACE_MASTER` contains another productized copy of that Claude v3.0 lineage.

## Local Tampermonkey provenance

The merged local Tampermonkey audit indexed 142 `.user.js` scripts. The local collection is broader than this GitHub repo and includes many platform-specific exports and variants. Local configuration/state files must not be deduplicated solely from matching JavaScript because `.options.json` and `.storage.json` can intentionally differ.
