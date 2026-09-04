# Dedupe Notes

## Confirmed exact duplicate

These two root files share blob SHA `6570a40ab2703892eddd487479751eb105569700`:

- `Suno Data Extractor Master Script.js`
- `Suno Data Extractor MasterScript.js`

They are one source under two filenames. Neither duplicate pair is promoted twice into the canonical install surface.

## Do not over-dedupe Tampermonkey state

Local Tampermonkey exports may contain identical `.user.js` code paired with different `.options.json` or `.storage.json` state. JavaScript equality alone is not enough to conclude the full installed entry is redundant.

Canonical B deduplicates the active install surface while preserving historical variants and state provenance elsewhere.
