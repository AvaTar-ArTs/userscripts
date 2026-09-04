import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'deepseek',
  hosts: ['chat.deepseek.com'],
  messageSelectors: ['[data-message-id]', '[data-role]', '[role="article"]'],
  assetSelectors: ['a[download]'],
  metadata: { marketingHosts: ['deepseek.com', 'www.deepseek.com'] }
});
