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
  if (!script.path) {
    console.error(`missing path: ${script.id}`);
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
