export function hostMatches(locationLike, hosts) {
  const host = locationLike?.hostname ?? '';
  return hosts.some(candidate => host === candidate || host.endsWith(`.${candidate}`));
}

export function textOf(node) {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function createDomAdapter({ id, hosts, messageSelectors = [], assetSelectors = [], metadata = {} }) {
  return {
    id,
    hosts,
    detect(locationLike) { return hostMatches(locationLike, hosts); },
    getConversationId() {
      const parts = location.pathname.split('/').filter(Boolean);
      return parts.at(-1) ?? null;
    },
    getMessages() {
      const nodes = messageSelectors.flatMap(selector => [...document.querySelectorAll(selector)]);
      return [...new Set(nodes)].map((node, index) => ({
        id: node.getAttribute('data-message-id') ?? node.id ?? `${id}-${index}`,
        role: node.getAttribute('data-message-author-role') ?? node.getAttribute('data-role') ?? null,
        text: textOf(node),
        raw: null
      })).filter(item => item.text);
    },
    getAssets() {
      const nodes = assetSelectors.flatMap(selector => [...document.querySelectorAll(selector)]);
      return [...new Set(nodes)].map(node => ({
        href: node.href ?? node.src ?? null,
        label: node.getAttribute?.('download') ?? node.getAttribute?.('alt') ?? textOf(node)
      })).filter(item => item.href);
    },
    getMetadata() {
      return { title: document.title, url: location.href, ...metadata };
    },
    observe(callback) {
      const observer = new MutationObserver(() => callback?.());
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  };
}
