import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'claude',
  hosts: ['claude.ai'],
  messageSelectors: ['[data-testid*="message"]', '[data-message-id]', '[data-is-streaming]'],
  assetSelectors: ['a[download]', 'a[href*="/api/organizations/"]'],
  metadata: { legacyHosts: ['chat.anthropic.com'] }
});
