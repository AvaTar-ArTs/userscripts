// ==UserScript==
// @name         Ideogram Harvester Final Forms
// @namespace    https://github.com/AvaTar-ArTs/userscripts
// @version      1.0.0-source
// @description  Adapter-driven Ideogram identity and asset harvester with incremental collection and JSON export. Source entrypoint; bundle before Tampermonkey install.
// @match        https://ideogram.ai/*
// @grant        none
// ==/UserScript==

import ideogram from '../adapters/ideogram.js';
import { downloadText, sanitizeFilename } from '../core/downloads.js';

const collected = new Map();

function harvest() {
  for (const asset of ideogram.getAssets()) {
    const key = asset.href;
    if (!key) continue;
    collected.set(key, {
      href: asset.href,
      label: asset.label ?? null,
      firstSeenAt: collected.get(key)?.firstSeenAt ?? new Date().toISOString(),
      sourceUrl: location.href
    });
  }
  return collected.size;
}

async function adaptiveSweep({ rounds = 12, delay = 350 } = {}) {
  let stableRounds = 0;
  let previous = -1;
  for (let i = 0; i < rounds && stableRounds < 3; i += 1) {
    const count = harvest();
    stableRounds = count === previous ? stableRounds + 1 : 0;
    previous = count;
    window.scrollBy({ top: Math.max(innerHeight * 0.8, 600), behavior: 'smooth' });
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  harvest();
}

function exportJson() {
  const payload = {
    schemaVersion: 1,
    platform: 'ideogram',
    exportedAt: new Date().toISOString(),
    source: 'AvaTar-ArTs/content-universe/browser/ideogram-harvester.user.js',
    page: ideogram.getMetadata(),
    assets: [...collected.values()]
  };
  const name = sanitizeFilename(`ideogram-harvest-${new Date().toISOString().slice(0, 10)}.json`);
  downloadText(name, JSON.stringify(payload, null, 2));
}

function mount() {
  if (document.getElementById('ideogram-final-forms-harvester')) return;
  harvest();
  ideogram.observe(harvest);

  const wrapper = document.createElement('div');
  wrapper.id = 'ideogram-final-forms-harvester';
  Object.assign(wrapper.style, { position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647, display: 'flex', gap: '6px' });

  const sweep = document.createElement('button');
  sweep.textContent = 'Harvest';
  sweep.addEventListener('click', async () => {
    sweep.disabled = true;
    await adaptiveSweep();
    sweep.textContent = `Harvested ${collected.size}`;
    sweep.disabled = false;
  });

  const save = document.createElement('button');
  save.textContent = 'Export JSON';
  save.addEventListener('click', exportJson);

  wrapper.append(sweep, save);
  document.body.appendChild(wrapper);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
