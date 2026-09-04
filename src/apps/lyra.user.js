// ==UserScript==
// @name         Lyra Final Forms
// @namespace    https://github.com/AvaTar-ArTs/userscripts
// @version      10.0.0-source
// @description  Adapter-driven multi-platform AI conversation exporter. Source entrypoint; bundle before Tampermonkey install.
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @match        https://grok.com/*
// @match        https://chat.deepseek.com/*
// @match        https://kimi.com/*
// @match        https://chat.qwen.ai/*
// @match        https://notebooklm.google.com/*
// @grant        none
// ==/UserScript==

import '../adapters/index.js';
import { resolveAdapter } from '../core/registry.js';
import { collectExport, toJSON } from '../core/exporter.js';
import { downloadText, sanitizeFilename } from '../core/downloads.js';

async function exportCurrent() {
  const adapter = resolveAdapter();
  if (!adapter) throw new Error(`No Final Forms adapter for ${location.hostname}`);
  const envelope = await collectExport(adapter);
  const name = sanitizeFilename(`${adapter.id}-${envelope.conversationId ?? 'export'}.json`);
  downloadText(name, toJSON(envelope));
}

function mount() {
  if (document.getElementById('lyra-final-forms-export')) return;
  const button = document.createElement('button');
  button.id = 'lyra-final-forms-export';
  button.textContent = 'Lyra Export';
  Object.assign(button.style, { position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647, padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' });
  button.addEventListener('click', () => exportCurrent().catch(error => alert(error.message)));
  document.body.appendChild(button);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
