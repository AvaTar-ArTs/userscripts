import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync(new URL('../scripts.json', import.meta.url), 'utf8'));
const seen = new Set();
const legacyOnly = new Set(['chat.openai.com','bard.google.com','chat.anthropic.com','grok.x.ai','notebook.google.com','kimi.moonshot.cn']);
let failed = false;

for (const script of registry.scripts ?? []) {
  if (!script.id || seen.has(script.id)) {
    console.error(`invalid or duplicate id: ${script.id}`);
    failed = true;
  }
  seen.add(script.id);

  const primaryPath = script.finalFormPath ?? script.path;
  if (!primaryPath) {
    console.error(`missing install/source path: ${script.id}`);
    failed = true;
  } else if (!fs.existsSync(new URL(`../${primaryPath}`, import.meta.url))) {
    console.error(`path does not exist: ${script.id} -> ${primaryPath}`);
    failed = true;
  }

  if (script.path && !fs.existsSync(new URL(`../${script.path}`, import.meta.url))) {
    console.error(`canonical path does not exist: ${script.id} -> ${script.path}`);
    failed = true;
  }

  if (!Array.isArray(script.hosts) || script.hosts.length === 0) {
    console.error(`missing canonical hosts: ${script.id}`);
    failed = true;
  }
  if ((script.hosts ?? []).every(host => legacyOnly.has(host))) {
    console.error(`legacy-only canonical hosts: ${script.id}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`registry ok: ${seen.size} entries`);
