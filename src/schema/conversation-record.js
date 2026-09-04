function arrayOf(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export function createConversationRecord(input = {}) {
  return {
    id: input.id ?? null,
    platform: input.platform ?? null,
    conversationId: input.conversationId ?? null,
    branchId: input.branchId ?? null,
    parentId: input.parentId ?? null,
    role: input.role ?? null,
    content: input.content ?? input.text ?? '',
    thinking: input.thinking ?? null,
    attachments: arrayOf(input.attachments),
    artifacts: arrayOf(input.artifacts),
    toolCalls: arrayOf(input.toolCalls),
    citations: arrayOf(input.citations),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    raw: input.raw ?? null
  };
}

export function createConversationBundle({ platform = null, conversationId = null, metadata = {}, records = [] } = {}) {
  return {
    schemaVersion: 2,
    platform,
    conversationId,
    exportedAt: new Date().toISOString(),
    metadata,
    records: records.map(createConversationRecord)
  };
}
