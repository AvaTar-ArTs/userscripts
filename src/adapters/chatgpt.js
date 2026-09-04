import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'chatgpt',
  hosts: ['chatgpt.com'],
  messageSelectors: ['[data-message-author-role]', '[data-message-id]'],
  assetSelectors: ['a[download]', 'a[href*="/files/"]'],
  metadata: { legacyHosts: ['chat.openai.com'] }
});
