import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'notebooklm',
  hosts: ['notebooklm.google.com'],
  messageSelectors: ['[data-message-id]', '[data-role]', '[role="article"]'],
  assetSelectors: ['a[download]'],
  metadata: { legacyHosts: ['notebook.google.com'] }
});
