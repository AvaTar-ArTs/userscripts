import { createDomAdapter } from './base.js';

const adapter = createDomAdapter({
  id: 'google-ai-studio',
  hosts: ['aistudio.google.com'],
  messageSelectors: [
    '[data-turn-role]',
    '[data-message-author-role]',
    '[role="article"]'
  ],
  assetSelectors: [
    'a[download]',
    'a[href^="blob:"]',
    'img[src^="blob:"]'
  ],
  metadata: { product: 'Google AI Studio' }
});

export default adapter;
