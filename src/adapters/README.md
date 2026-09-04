# Final Forms adapters

Every adapter owns the selectors and platform assumptions for exactly one site. Shared apps resolve adapters through `src/core/registry.js` and must not embed selector maps copied from another platform.

Contract:

- `id`
- `hosts`
- `detect(location, document)`
- optional `getConversationId()`
- `getMessages()`
- `getAssets()`
- `getMetadata()`
- `observe(callback)`

Canonical host detection is primary. Legacy hosts belong in adapter metadata or migration documentation, not in the primary `hosts` array unless deliberately supported and tested.

Suno differs intentionally: it checks `globalThis.__SUNO_CAPTURED_SONGS__` first and uses DOM song links as its fallback path.
