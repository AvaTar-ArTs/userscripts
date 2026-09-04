// ==UserScript==
// @name         DeepSeek Exporter Final Forms
// @namespace    https://github.com/AvaTar-ArTs/userscripts
// @version      2.0.0-source
// @description  Adapter-driven DeepSeek conversation export to rich JSON or Markdown. Source entrypoint; bundle before Tampermonkey install.
// @match        https://chat.deepseek.com/*
// @grant        none
// ==/UserScript==

import deepseek from '../adapters/deepseek.js';
import { normalizeAdapterMessages } from '../services/record-normalizer.js';
import { createConversationBundle } from '../schema/conversation-record.js';
import { downloadText, sanitizeFilename } from '../core/downloads.js';

function collect() {
  const conversationId = deepseek.getConversationId();
  const metadata = deepseek.getMetadata();
  const records = normalizeAdapterMessages(deepseek.getMessages(), {
    platform: 'deepseek',
    conversationId,
    metadata
  });
  return createConversationBundle({ platform: 'deepseek', conversationId, metadata, records });
}

function toMarkdown(bundle) {
  const header = `# ${bundle.metadata?.title ?? 'DeepSeek Conversation'}\n\n`;
  const body = bundle.records.map(record => {
    const role = record.role ? `## ${record.role}` : '## Message';
    const thinking = record.thinking ? `\n\n> Thinking: ${record.thinking}` : '';
    return `${role}\n\n${record.content}${thinking}`;
  }).join('\n\n---\n\n');
  return header + body + '\n';
}

function exportBundle(format) {
  const bundle = collect();
  const stem = sanitizeFilename(`deepseek-${bundle.conversationId ?? 'conversation'}`);
  if (format === 'markdown') {
    downloadText(`${stem}.md`, toMarkdown(bundle), 'text/markdown;charset=utf-8');
  } else {
    downloadText(`${stem}.json`, JSON.stringify(bundle, null, 2));
  }
}

function mount() {
  if (document.getElementById('deepseek-final-forms-export')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'deepseek-final-forms-export';
  Object.assign(wrapper.style, { position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647, display: 'flex', gap: '6px' });
  for (const [label, format] of [['DeepSeek JSON', 'json'], ['DeepSeek MD', 'markdown']]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => exportBundle(format));
    wrapper.appendChild(button);
  }
  document.body.appendChild(wrapper);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
