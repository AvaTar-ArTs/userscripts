export function normalizeRecord(record = {}) {
  return {
    id: record.id ?? null,
    role: record.role ?? null,
    text: record.text ?? '',
    createdAt: record.createdAt ?? null,
    assets: Array.isArray(record.assets) ? record.assets : [],
    raw: record.raw ?? null
  };
}

export async function collectExport(adapter) {
  if (!adapter) throw new TypeError('adapter required');
  const [messages, assets, metadata] = await Promise.all([
    Promise.resolve(adapter.getMessages()),
    Promise.resolve(adapter.getAssets()),
    Promise.resolve(adapter.getMetadata())
  ]);

  return {
    schemaVersion: 1,
    platform: adapter.id,
    conversationId: typeof adapter.getConversationId === 'function' ? await adapter.getConversationId() : null,
    exportedAt: new Date().toISOString(),
    metadata: metadata ?? {},
    messages: (messages ?? []).map(normalizeRecord),
    assets: assets ?? []
  };
}

export function toJSON(envelope, space = 2) {
  return JSON.stringify(envelope, null, space);
}
