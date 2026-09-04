function parse(value, fallback) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

export function createTagStore(storageLike = globalThis.localStorage, key = 'final-forms-tags') {
  const load = () => parse(storageLike?.getItem?.(key) ?? '{}', {});
  const save = state => storageLike?.setItem?.(key, JSON.stringify(state));

  return {
    get(recordId) {
      const state = load();
      return state[recordId] ?? { tags: [], starred: false };
    },
    set(recordId, value = {}) {
      const state = load();
      state[recordId] = {
        tags: [...new Set(value.tags ?? [])],
        starred: Boolean(value.starred)
      };
      save(state);
      return state[recordId];
    },
    toggleTag(recordId, tag) {
      const current = this.get(recordId);
      const tags = current.tags.includes(tag)
        ? current.tags.filter(item => item !== tag)
        : [...current.tags, tag];
      return this.set(recordId, { ...current, tags });
    },
    toggleStar(recordId) {
      const current = this.get(recordId);
      return this.set(recordId, { ...current, starred: !current.starred });
    },
    all() { return load(); },
    clear() { storageLike?.removeItem?.(key); }
  };
}
