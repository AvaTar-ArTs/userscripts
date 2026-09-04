function flattenText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ');
  return String(value);
}

function tokenize(value) {
  return [...new Set(flattenText(value).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])];
}

export function buildSearchIndex(records = []) {
  return records.map((record, index) => {
    const haystack = [
      record.content,
      record.thinking,
      record.artifacts,
      record.citations,
      record.attachments,
      record.metadata?.title,
      record.metadata
    ];
    return {
      key: record.id ?? `record-${index}`,
      record,
      tokens: tokenize(haystack)
    };
  });
}

export function searchRecords(index = [], query = '') {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return index
    .map(entry => ({
      entry,
      score: terms.reduce((sum, term) => sum + (entry.tokens.some(token => token.includes(term)) ? 1 : 0), 0)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.entry.record);
}
