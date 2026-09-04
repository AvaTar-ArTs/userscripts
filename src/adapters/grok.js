import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'grok',
  hosts: ['grok.com'],
  messageSelectors: ['[data-message-id]', '[data-role]', '[role="article"]'],
  assetSelectors: ['a[download]', 'a[href*="/files/"]'],
  metadata: { legacyHosts: ['grok.x.ai'] }
});
