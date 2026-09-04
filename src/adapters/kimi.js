import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'kimi',
  hosts: ['kimi.com'],
  messageSelectors: ['[data-message-id]', '[data-role]', '[role="article"]'],
  assetSelectors: ['a[download]'],
  metadata: { legacyHosts: ['kimi.moonshot.cn'] }
});
