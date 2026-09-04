import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'qwen',
  hosts: ['chat.qwen.ai'],
  messageSelectors: ['[data-message-id]', '[data-role]', '[role="article"]'],
  assetSelectors: ['a[download]'],
  metadata: {}
});
