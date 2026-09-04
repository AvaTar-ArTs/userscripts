export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeFilename(value = 'export') {
  return String(value).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'export';
}
