import { hostMatches, textOf } from './base.js';

const hosts = ['suno.com'];

function capturedSongs() {
  const values = globalThis.__SUNO_CAPTURED_SONGS__;
  return values instanceof Map ? [...values.values()] : Array.isArray(values) ? values : [];
}

function domSongs() {
  return [...document.querySelectorAll('a[href*="/song/"]')].map((anchor, index) => {
    const row = anchor.closest('[role="row"], .clip-row, .relative');
    const id = (anchor.href.match(/\/song\/([a-f0-9-]{36})/i) || [])[1] ?? `dom-${index}`;
    const image = row?.querySelector('img');
    return {
      id,
      role: 'song',
      text: anchor.getAttribute('title') || textOf(anchor) || 'Untitled',
      assets: [
        image?.src ? { type: 'image', href: image.src } : null,
        id.startsWith('dom-') ? null : { type: 'audio', href: `https://cdn1.suno.ai/${id}.mp3` }
      ].filter(Boolean),
      raw: row ? { source: 'dom' } : null
    };
  });
}

export default {
  id: 'suno',
  hosts,
  detect(locationLike) { return hostMatches(locationLike, hosts); },
  getConversationId() { return location.pathname.split('/').filter(Boolean).at(-1) ?? 'library'; },
  getMessages() {
    const captured = capturedSongs();
    if (captured.length) {
      return captured.map(song => ({
        id: song.id ?? song.uuid ?? null,
        role: 'song',
        text: song.title ?? 'Untitled',
        assets: [song.audio_url, song.image_url].filter(Boolean).map(href => ({ href })),
        raw: song
      }));
    }
    return domSongs();
  },
  getAssets() {
    return this.getMessages().flatMap(song => song.assets ?? []);
  },
  getMetadata() {
    return { title: document.title, url: location.href, strategy: capturedSongs().length ? 'captured-data' : 'dom-fallback' };
  },
  observe(callback) {
    const observer = new MutationObserver(() => callback?.());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }
};
