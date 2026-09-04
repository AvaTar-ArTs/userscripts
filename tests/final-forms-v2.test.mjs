import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createConversationRecord } from '../src/schema/conversation-record.js';
import { normalizeAdapterMessage } from '../src/services/record-normalizer.js';
import { buildSearchIndex, searchRecords } from '../src/services/search-index.js';
import { createTagStore } from '../src/services/tag-store.js';
import googleAiStudio from '../src/adapters/google-ai-studio.js';
import sillytavern from '../src/adapters/sillytavern.js';

test('conversation record preserves rich fields and defaults arrays', () => {
  const record = createConversationRecord({ id: 'm1', text: 'hello', artifacts: [{ id: 'a1' }] });
  assert.equal(record.id, 'm1');
  assert.equal(record.content, 'hello');
  assert.deepEqual(record.attachments, []);
  assert.deepEqual(record.artifacts, [{ id: 'a1' }]);
  assert.deepEqual(record.toolCalls, []);
});

test('normalizer upgrades legacy adapter text without losing context', () => {
  const record = normalizeAdapterMessage(
    { id: 'm2', text: 'answer', reasoning: 'thinking' },
    { platform: 'deepseek', conversationId: 'c1' }
  );
  assert.equal(record.platform, 'deepseek');
  assert.equal(record.conversationId, 'c1');
  assert.equal(record.content, 'answer');
  assert.equal(record.thinking, 'thinking');
});

test('search indexes rich fields', () => {
  const records = [
    createConversationRecord({ id: 'a', content: 'ordinary text' }),
    createConversationRecord({ id: 'b', content: 'other', artifacts: [{ title: 'Quantum Forge' }] })
  ];
  const results = searchRecords(buildSearchIndex(records), 'quantum');
  assert.deepEqual(results.map(item => item.id), ['b']);
});

test('tag store persists tags and stars against storage-like API', () => {
  const memory = new Map();
  const storage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key)
  };
  const store = createTagStore(storage, 'test-tags');
  store.toggleTag('m1', 'important');
  store.toggleStar('m1');
  assert.deepEqual(store.get('m1'), { tags: ['important'], starred: true });
});

test('Google AI Studio adapter detects canonical host', () => {
  assert.equal(googleAiStudio.detect({ hostname: 'aistudio.google.com' }), true);
  assert.equal(googleAiStudio.detect({ hostname: 'gemini.google.com' }), false);
});

test('SillyTavern adapter requires both local host and chat marker', () => {
  const doc = { querySelector: selector => selector.includes('#chat') ? {} : null };
  const emptyDoc = { querySelector: () => null };
  assert.equal(sillytavern.detect({ hostname: '127.0.0.1' }, doc), true);
  assert.equal(sillytavern.detect({ hostname: '127.0.0.1' }, emptyDoc), false);
  assert.equal(sillytavern.detect({ hostname: 'example.com' }, doc), false);
});

test('ecosystem registry uses only allowed intake modes', async () => {
  const registry = JSON.parse(await readFile(new URL('../ecosystem-sources.json', import.meta.url), 'utf8'));
  const allowed = new Set(['copy', 'adapt', 'reference', 'archaeology']);
  assert.equal(registry.schemaVersion, 1);
  assert.ok(registry.sources.length >= 7);
  for (const source of registry.sources) {
    assert.ok(source.repo.startsWith('AvaTar-ArTs/'));
    assert.ok(allowed.has(source.mode));
    assert.ok(Array.isArray(source.capabilities));
  }
});
