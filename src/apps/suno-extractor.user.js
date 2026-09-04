// ==UserScript==
// @name         Suno Extractor Final Forms
// @namespace    https://github.com/AvaTar-ArTs/userscripts
// @version      10.0.0-source
// @description  Adapter-driven Suno extractor using captured data first and DOM fallback second. Source entrypoint; bundle before install.
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

import suno from '../adapters/suno.js';
import { collectExport, toJSON } from '../core/exporter.js';
import { downloadText } from '../core/downloads.js';

async function exportSuno() {
  const envelope = await collectExport(suno);
  downloadText(`suno-${Date.now()}.json`, toJSON(envelope));
}

function mount() {
  if (document.getElementById('suno-final-forms-export')) return;
  const button = document.createElement('button');
  button.id = 'suno-final-forms-export';
  button.textContent = 'Suno Final Export';
  Object.assign(button.style, { position: 'fixed', right: '18px', bottom: '66px', zIndex: 2147483647, padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' });
  button.addEventListener('click', () => exportSuno().catch(error => alert(error.message)));
  document.body.appendChild(button);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
