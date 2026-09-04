import { createDomAdapter } from './base.js';

export default createDomAdapter({
  id: 'ideogram',
  hosts: ['ideogram.ai'],
  messageSelectors: ['[data-testid*="prompt"]', '[data-prompt-id]'],
  assetSelectors: ['img[src]', 'a[download]'],
  metadata: { reference: 'AvaTar-ArTs/content-universe/browser/ideogram-harvester.user.js' }
});
