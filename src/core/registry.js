const adapters = new Map();

export function registerAdapter(adapter) {
  const required = ['id', 'hosts', 'detect', 'getMessages', 'getAssets', 'getMetadata', 'observe'];
  for (const key of required) {
    if (!(key in adapter)) throw new TypeError(`adapter ${adapter?.id ?? '<unknown>'} missing ${key}`);
  }
  if (!Array.isArray(adapter.hosts) || adapter.hosts.length === 0) {
    throw new TypeError(`adapter ${adapter.id} must declare hosts`);
  }
  adapters.set(adapter.id, adapter);
  return adapter;
}

export function listAdapters() {
  return [...adapters.values()];
}

export function resolveAdapter(locationLike = globalThis.location, documentLike = globalThis.document) {
  return listAdapters().find(adapter => {
    try { return adapter.detect(locationLike, documentLike); }
    catch { return false; }
  }) ?? null;
}

export function getAdapter(id) {
  return adapters.get(id) ?? null;
}
