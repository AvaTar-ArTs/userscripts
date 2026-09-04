import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'gemini',
  hosts: ['gemini.google.com'],
  messageSelectors: ['[data-message-id]', '[role="article"]', '[data-turn-role]'],
  assetSelectors: ['a[download]', 'a[href*="usercontent"]'],
  metadata: { legacyHosts: ['bard.google.com'] }
});
