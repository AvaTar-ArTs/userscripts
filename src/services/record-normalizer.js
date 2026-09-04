import { createConversationRecord } from '../schema/conversation-record.js';

export function normalizeAdapterMessage(message = {}, context = {}) {
  const metadata = {
    ...(context.metadata ?? {}),
    ...(message.metadata ?? {})
  };

  return createConversationRecord({
    ...message,
    platform: message.platform ?? context.platform ?? null,
    conversationId: message.conversationId ?? context.conversationId ?? null,
    branchId: message.branchId ?? context.branchId ?? null,
    parentId: message.parentId ?? null,
    content: message.content ?? message.text ?? '',
    thinking: message.thinking ?? message.reasoning ?? null,
    attachments: message.attachments ?? message.assets ?? [],
    artifacts: message.artifacts ?? [],
    toolCalls: message.toolCalls ?? message.tools ?? [],
    citations: message.citations ?? [],
    metadata
  });
}

export function normalizeAdapterMessages(messages = [], context = {}) {
  return messages.map(message => normalizeAdapterMessage(message, context));
}
