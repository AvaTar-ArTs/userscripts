import { createDomAdapter } from './base.js';

const base = createDomAdapter({
  id: 'sillytavern',
  hosts: ['localhost', '127.0.0.1'],
  messageSelectors: [
    '#chat .mes',
    '#chat [mesid]',
    '[data-message-id]'
  ],
  assetSelectors: [
    '#chat a[href]',
    '#chat img[src]'
  ],
  metadata: { product: 'SillyTavern' }
});

const adapter = {
  ...base,
  detect(locationLike, documentLike = globalThis.document) {
    const hostMatch = base.detect(locationLike);
    const hasChat = Boolean(documentLike?.querySelector?.('#chat, .mes, [mesid]'));
    return hostMatch && hasChat;
  }
};

export default adapter;
