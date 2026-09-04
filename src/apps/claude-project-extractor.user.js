// ==UserScript==
// @name         Claude Project Extractor Final Forms
// @namespace    https://github.com/AvaTar-ArTs/userscripts
// @version      4.0.0-source
// @description  Adapter-driven Claude conversation/project export source entrypoint; bundle before Tampermonkey install.
// @match        https://claude.ai/*
// @grant        none
// ==/UserScript==

import claude from '../adapters/claude.js';
import { collectExport, toJSON } from '../core/exporter.js';
import { downloadText, sanitizeFilename } from '../core/downloads.js';

async function exportClaude() {
  const envelope = await collectExport(claude);
  const name = sanitizeFilename(`claude-${envelope.conversationId ?? Date.now()}.json`);
  downloadText(name, toJSON(envelope));
}

function mount() {
  if (document.getElementById('claude-final-forms-export')) return;
  const button = document.createElement('button');
  button.id = 'claude-final-forms-export';
  button.textContent = 'Claude Export';
  Object.assign(button.style, { position: 'fixed', right: '18px', bottom: '66px', zIndex: 2147483647, padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' });
  button.addEventListener('click', () => exportClaude().catch(error => alert(error.message)));
  document.body.appendChild(button);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
