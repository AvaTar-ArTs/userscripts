// ULTIMATE SUNO EXTRACTOR v2.2 - CLICK & SCRAPE SIDE PANEL (resume, retries)
// Paste into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('🎛️ ULTIMATE SUNO EXTRACTOR v2.2 — Click & Scrape Side Panel');
  console.log('-'.repeat(70));

  // ---------- CONFIG ----------
  const CONFIG = {
    SCROLL_DELAY: 900,        // ms between auto-scroll steps
    MAX_SCROLLS: 1000,
    MIN_NO_CHANGE: 4,
    CLICK_DELAY: 450,        // ms after clicking a row before polling for panel
    PER_SONG_DELAY: 300,     // ms delay between each scraped song to avoid stress
    PANEL_TIMEOUT: 8000,     // ms to wait for side panel content to appear
    RETRIES: 2,              // number of retries if panel fails
    RESUME_KEY: 'suno_extractor_v2_progress', // sessionStorage key for resume
    SELECTORS: {
      // possible selectors for side-panel lyrics and summary (fallback chain)
      PANEL_CONTAINER: '.chakra-portal, [data-testid="song-detail"], .song-panel, aside',
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]'
    }
  };

  // ---------- helpers ----------
  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  async function waitFor(conditionFn, timeout = 6000, interval = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = conditionFn();
        if (res) return res;
      } catch (e) { /* ignore */ }
      await wait(interval);
    }
    return null;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log(`✅ Saved: ${filename}`);
  }

  function toCSV(rows, headers) {
    const lines = [];
    lines.push(headers.join(','));
    for (const r of rows) {
      const line = headers.map(h => {
        const v = String(r[h] ?? '').replace(/"/g, '""');
        return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
      }).join(',');
      lines.push(line);
    }
    return lines.join('\n');
  }

  // ---------- Step 1: auto-scroll to load all songs ----------
  console.log('▶ Step 1: Auto-scrolling to load all songs...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = document.querySelectorAll('a[href*="/song/"]');
      const unique = new Set(Array.from(anchors).map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        console.log(`   waiting... ${noChange}/${CONFIG.MIN_NO_CHANGE}`);
        if (noChange >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(`   loaded ${count} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChange = 0;
        scrollCount++;
        console.log(`   scroll ${scrollCount}: ${count} songs (+${count - lastCount})`);
        lastCount = count;
      }
      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.warn('   max scrolls reached');
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // ---------- Step 2: collect anchors ----------
  console.log('▶ Step 2: Collecting song anchors...');
  const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'))
    .map(a => ({ el: a, href: a.href }))
    .filter((v,i,self) => self.findIndex(x => x.href===v.href)===i);
  // Map ids
  const songsToProcess = anchors.map(a => {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m ? m[1] : null, el: a.el, href: a.href };
  }).filter(x => x.id);
  console.log(`   found ${songsToProcess.length} unique song anchors`);

  // Load progress/resume
  const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   processed so far: ${Object.keys(progress.processed).length}`);

  // ---------- Step 3: click each row, scrape side panel ----------
  console.log('▶ Step 3: Scrape each song by clicking rows (this may take a while)');
  const extracted = [];
  for (let idx = 0; idx < songsToProcess.length; idx++) {
    const { id, el, href } = songsToProcess[idx];
    if (progress.processed[id]) {
      // already done
      extracted.push(progress.processed[id]);
      console.log(`   ↳ [${idx+1}/${songsToProcess.length}] SKIP ${id} (already processed)`);
      continue;
    }

    let attempt = 0, success = false, lastError = null;
    while (attempt <= CONFIG.RETRIES && !success) {
      attempt++;
      try {
        // Scroll row into view & click
        el.scrollIntoView({ block: 'center', inline: 'center' });
        await wait(120);
        el.click();
        await wait(CONFIG.CLICK_DELAY);

        // Wait for PANEL container or LYRICS selector
        const panel = await waitFor(() => {
          return document.querySelector(CONFIG.SELECTORS.PANEL_CONTAINER);
        }, CONFIG.PANEL_TIMEOUT, 200);

        if (!panel) {
          throw new Error('Panel did not appear');
        }

        // Try to find lyrics and summary inside the panel
        const lyricsEl = panel.querySelector(CONFIG.SELECTORS.LYRICS) ||
                         panel.querySelector('div[role="document"] pre, div[role="document"] p, div[role="document"] span');

        const summaryEl = panel.querySelector(CONFIG.SELECTORS.SUMMARY) ||
                          panel.querySelector('.description, .summary, [data-testid="summary"]');

        const authorEl = panel.querySelector(CONFIG.SELECTORS.AUTHOR) || document.querySelector(CONFIG.SELECTORS.AUTHOR);
        const tagEls = panel.querySelectorAll(CONFIG.SELECTORS.TAGS) || [];

        // audio (in-panel) fallback
        const audioNode = panel.querySelector(CONFIG.SELECTORS.AUDIO_META) || document.querySelector(CONFIG.SELECTORS.AUDIO_META);
        let audioSrc = '';
        if (audioNode) {
          audioSrc = audioNode.src || audioNode.content || audioNode.getAttribute('src') || '';
        }

        // Title: panel header or anchor text
        const titleFromPanel = panel.querySelector('h1, h2, [data-testid="song-title"], .song-title, .chakra-heading')?.textContent?.trim();
        const titleFromAnchor = el.querySelector('[title]')?.getAttribute('title') || el.textContent?.trim();
        const title = titleFromPanel || titleFromAnchor || '';

        const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';
        const summary = summaryEl ? (summaryEl.textContent || '').trim() : '';
        const author = authorEl ? (authorEl.textContent || '').trim() : '';
        const tags = Array.from(tagEls).map(n => (n.textContent||'').trim()).filter(Boolean).join(', ');

        // duration and image from anchor's container (best-effort)
        const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
        const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
        const img = container?.querySelector('img')?.src || '';
        const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

        // Save song object
        const songObj = {
          id, href, title, author, tags, duration, imageUrl,
          summary, lyrics, audio: audioSrc,
          scrapedAt: new Date().toISOString()
        };
        extracted.push(songObj);
        progress.processed[id] = songObj;
        sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));

        // Close the panel: try close button, overlay, or Escape
        let closed = false;
        const closeBtn = document.querySelector('button[aria-label="Close"], button[title="Close"], button[class*="close"], [data-testid="close-button"]');
        if (closeBtn) {
          closeBtn.click();
          closed = true;
        } else {
          // click overlay if present
          const overlay = document.querySelector('.chakra-portal ~ div, .modal-backdrop, .overlay');
          if (overlay) {
            overlay.click();
            closed = true;
          }
        }
        if (!closed) {
          // fallback: press Escape
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }

        // small pause for DOM to settle
        await wait(CONFIG.PER_SONG_DELAY);
        console.log(`   ✅ [${idx+1}/${songsToProcess.length}] ${title || id} — lyrics ${lyrics ? 'FOUND' : 'NO LYRICS'}`);
        success = true;
      } catch (err) {
        lastError = err;
        console.warn(`   ! [${idx+1}] attempt ${attempt} failed: ${err.message}`);
        // try to close any dangling panels and continue retry
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
        await wait(600 + attempt * 200);
      }
    } // retries

    if (!success) {
      console.error(`   ✖ [${idx+1}] FAILED to scrape ${id}:`, lastError?.message || lastError);
      // still mark as failed so resume won't loop infinitely
      progress.processed[id] = { id, href, error: String(lastError || 'unknown'), scrapedAt: new Date().toISOString() };
      sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
      extracted.push(progress.processed[id]);
    }
  } // for each song

  // ---------- Step 4: Export ----------
  console.log('▶ Step 4: Exporting results...');
  const all = extracted;
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
  const csv = toCSV(all, headers);
  downloadFile(csv, `suno-click-extract-${ts}.csv`, 'text/csv');
  downloadFile(JSON.stringify(all, null, 2), `suno-click-extract-${ts}.json`, 'application/json');

  // TXT summary
  const txt = [
    `Suno Click Extract - ${new Date().toLocaleString()}`,
    `Total: ${all.length}`,
    '',
    ...all.map((s,i)=> {
      const lines = [];
      lines.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration ? '['+s.duration+']': ''}`);
      if (s.author) lines.push(`     Author: ${s.author}`);
      if (s.tags) lines.push(`     Tags: ${s.tags}`);
      if (s.summary) lines.push(`     Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}`);
      if (s.lyrics) lines.push(`     Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}`);
      if (s.audio) lines.push(`     Audio: ${s.audio}`);
      lines.push(`     URL: ${s.href}`);
      lines.push('');
      return lines.join('\n');
    })
  ].join('\n');
  downloadFile(txt, `suno-click-extract-${ts}.txt`, 'text/plain');

  // make available for inspection
  window.extractedSongs = all;
  console.log('🎉 Extraction complete — check ~/Downloads/ for files and use window.extractedSongs to inspect data.');
  console.log('-'.repeat(70));

})();

// ULTIMATE SUNO EXTRACTOR v2.3 - CLICK + OBSERVER + FETCH FALLBACK + AUTOSAVE
// Paste into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('🛠️ ULTIMATE SUNO EXTRACTOR v2.3 — resilient click + observer + fallback');
  console.log('-'.repeat(70));

  // CONFIG
  const C = {
    SCROLL_DELAY: 900,
    MIN_NO_CHANGE: 4,
    MAX_SCROLLS: 1000,
    CLICK_DELAY: 350,
    PANEL_WAIT: 9000,
    PER_SONG_DELAY: 350,
    RETRIES: 2,
    RESUME_KEY: 'suno_extractor_v2_progress',
    SAVE_INTERVAL: 10, // autosave every N songs
    SELECTORS: {
      ANCHOR: 'a[href*="/song/"]',
      PANEL_CANDIDATES: '.chakra-portal, [data-testid="song-detail"], aside, .song-panel, [role="dialog"]',
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]',
      PANEL_CLOSE: 'button[aria-label="Close"], button[title="Close"], [data-testid="close-button"], button[class*="close"]'
    }
  };

  // util
  const wait = ms => new Promise(r=>setTimeout(r, ms));
  function now(){ return new Date().toISOString(); }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    console.log(`✅ Saved: ${filename}`);
  }
  function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h=>{
        const v = String(r[h]??'').replace(/"/g,'""');
        return (v.includes(',')||v.includes('\n')) ? `"${v}"` : v;
      }).join(','));
    }
    return lines.join('\n');
  }

  // auto-scroll to load all songs
  console.log('▶ Step 1: Auto-scrolling to load songs...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise(resolve => {
    const iv = setInterval(()=>{
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR));
      const unique = new Set(anchors.map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        console.log(`   waiting... ${noChange}/${C.MIN_NO_CHANGE}`);
        if (noChange >= C.MIN_NO_CHANGE) {
          clearInterval(iv);
          console.log(`   loaded ${count} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChange = 0; scrollCount++; console.log(`   scroll ${scrollCount}: ${count} songs (+${count-lastCount})`); lastCount = count;
      }
      if (scrollCount >= C.MAX_SCROLLS) {
        clearInterval(iv); console.warn('   max scrolls reached'); resolve();
      }
    }, C.SCROLL_DELAY);
  });

  // collect anchors (unique)
  console.log('▶ Step 2: Collect anchors...');
  const anchorsRaw = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR));
  const anchors = anchorsRaw.map(a=>({el:a, href:a.href})).filter((v,i,self)=> self.findIndex(x=>x.href===v.href)===i);
  const items = anchors.map(a=>{
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m?m[1]:null, el: a.el, href: a.href };
  }).filter(x=>x.id);
  console.log(`   found ${items.length} unique song anchors`);

  // resume
  const saved = sessionStorage.getItem(C.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   previously processed: ${Object.keys(progress.processed).length}`);

  // MutationObserver helper to detect panel appearance
  function observePanel(timeout = C.PANEL_WAIT) {
    return new Promise((resolve) => {
      let timer = null;
      const observer = new MutationObserver((mutations) => {
        const panel = document.querySelector(C.SELECTORS.PANEL_CANDIDATES);
        if (panel) {
          clearTimeout(timer); observer.disconnect(); resolve(panel);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // also immediate check
      const immediate = document.querySelector(C.SELECTORS.PANEL_CANDIDATES);
      if (immediate) { observer.disconnect(); resolve(immediate); return; }
      timer = setTimeout(()=>{ observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // robust click strategies
  function syntheticClick(el) {
    try {
      el.scrollIntoView({block:'center', inline:'center'});
      // try native click
      el.click();
      return true;
    } catch(e) {}
    // try pointer events at element center
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top + rect.height/2;
      ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(name=>{
        el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerType: 'mouse'}));
      });
      return true;
    } catch(e){}
    // try finding a clickable child
    try {
      const clickable = el.querySelector('button, [role="button"], svg, img') || el;
      clickable.click();
      return true;
    } catch(e){}
    return false;
  }

  // fetch fallback (parses HTML)
  async function fetchDetailParse(id) {
    try {
      const url = `/song/${id}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch failed '+res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lyrics = (doc.querySelector(C.SELECTORS.LYRICS)?.textContent || '').trim();
      const summary = (doc.querySelector(C.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim();
      const author = (doc.querySelector(C.SELECTORS.AUTHOR)?.textContent || '').trim();
      const tags = Array.from(doc.querySelectorAll(C.SELECTORS.TAGS)).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      const audioNode = doc.querySelector(C.SELECTORS.AUDIO_META);
      const audio = audioNode?.src || audioNode?.content || '';
      return { lyrics, summary, author, tags, audio };
    } catch(e) {
      console.warn('   fetch-detail failed for', id, e.message);
      return {};
    }
  }

  // extraction loop
  console.log('▶ Step 3: Scrape items (click + observer, with fetch fallback)');
  const results = [];
  for (let idx=0; idx<items.length; idx++) {
    const {id, el, href} = items[idx];
    if (progress.processed[id]) {
      results.push(progress.processed[id]);
      console.log(`   ↳ [${idx+1}/${items.length}] SKIP ${id}`);
      continue;
    }
    let ok=false, attempt=0, lastErr=null;
    while (attempt <= C.RETRIES && !ok) {
      attempt++;
      try {
        // scroll & click via synthetic strategies
        syntheticClick(el);
        await wait(C.CLICK_DELAY);

        // observe panel
        const panel = await observePanel(C.PANEL_WAIT);
        let lyrics='', summary='', author='', tags='', audio='';

        if (panel) {
          // try to extract from panel (multiple fallbacks)
          const lyricNode = panel.querySelector(C.SELECTORS.LYRICS) || panel.querySelector('div[role="document"] pre, div[role="document"] p');
          const summaryNode = panel.querySelector(C.SELECTORS.SUMMARY) || panel.querySelector('.description, .summary');
          const authorNode = panel.querySelector(C.SELECTORS.AUTHOR) || document.querySelector(C.SELECTORS.AUTHOR);
          const tagNodes = panel.querySelectorAll(C.SELECTORS.TAGS) || [];
          const audioNode = panel.querySelector(C.SELECTORS.AUDIO_META) || document.querySelector(C.SELECTORS.AUDIO_META);

          lyrics = lyricNode ? (lyricNode.textContent||'').trim() : '';
          summary = summaryNode ? (summaryNode.textContent||'').trim() : '';
          author = authorNode ? (authorNode.textContent||'').trim() : '';
          tags = Array.from(tagNodes).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
          audio = audioNode ? (audioNode.src || audioNode.content || '') : '';
        } else {
          // fallback: fetch & parse
          const parsed = await fetchDetailParse(id);
          lyrics = parsed.lyrics || '';
          summary = parsed.summary || '';
          author = parsed.author || '';
          tags = parsed.tags || '';
          audio = parsed.audio || '';
        }

        // get title/duration/image best-effort from anchor container
        const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
        const title = (container?.querySelector('h3, h2, [title], [data-testid="song-title"]')?.textContent || el.getAttribute('title') || el.textContent || '').trim();
        const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
        const img = container?.querySelector('img')?.src || '';
        const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

        const songObj = { id, href, title, author, tags, duration, imageUrl, audio, summary, lyrics, scrapedAt: now() };
        results.push(songObj);
        progress.processed[id] = songObj;
        sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
        ok = true;

        // close panel (try close button or press Escape)
        const closeBtn = document.querySelector(C.SELECTORS.PANEL_CLOSE);
        if (closeBtn) closeBtn.click();
        else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));

        console.log(`   ✅ [${idx+1}/${items.length}] ${title || id} — lyrics ${lyrics? 'FOUND':'NO'}`);
        await wait(C.PER_SONG_DELAY);
      } catch (err) {
        lastErr = err;
        console.warn(`   ! [${idx+1}] attempt ${attempt} error:`, err.message || err);
        // try to close anything and wait before retry
        try { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); } catch(e){}
        await wait(500 + attempt*200);
      }
    } // attempts

    if (!ok) {
      console.error(`   ✖ [${idx+1}] FAILED ${id} — marking error`);
      const failObj = { id, href, error: String(lastErr || 'unknown'), scrapedAt: now() };
      results.push(failObj);
      progress.processed[id] = failObj;
      sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
    }

    // autosave periodically
    if ((idx+1) % C.SAVE_INTERVAL === 0) {
      console.log(`   ⏺ Autosave at ${idx+1} items`);
      const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      const rows = Object.values(progress.processed);
      const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
      try {
        downloadFile(toCSV(rows, headers), `suno-partial-${ts}.csv`, 'text/csv');
        downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${ts}.json`, 'application/json');
      } catch(e){ console.warn('autosave failed', e); }
    }
  } // for

  // final export
  console.log('▶ Step 4: Final export');
  const all = Object.values(progress.processed);
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
  try {
    downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, 'text/csv');
    downloadFile(JSON.stringify(all, null, 2), `suno-extract-${ts}.json`, 'application/json');
    // TXT summary
    const txt = ['Suno Extract', `Exported: ${new Date().toLocaleString()}`, `Total: ${all.length}`, ''].concat(
      all.map((s,i)=>{
        const L = [];
        L.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration? '['+s.duration+']':''}`);
        if (s.author) L.push(`    Author: ${s.author}`);
        if (s.tags) L.push(`    Tags: ${s.tags}`);
        if (s.summary) L.push(`    Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}`);
        if (s.lyrics) L.push(`    Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}`);
        if (s.audio) L.push(`    Audio: ${s.audio}`);
        L.push(`    URL: ${s.href}`);
        return L.join('\n');
      })
    ).join('\n\n');
    downloadFile(txt, `suno-extract-${ts}.txt`, 'text/plain');
  } catch(e){ console.error('final export failed', e); }

  window.extractedSongs = all;
  console.log('🎉 Extraction complete. Use window.extractedSongs to inspect data. Session progress saved to sessionStorage.');
  console.log('-'.repeat(70));
})().catch(e=>console.error('Fatal error:', e));

// ULTIMATE SUNO EXTRACTOR v2.4 - NO CLICK: INLINE JSON -> FETCH -> HIDDEN IFRAME (resume + autosave)
// Paste into Console on https://suno.com/library (or any Suno list page)

(async function() {
  console.log('🔧 ULTIMATE SUNO EXTRACTOR v2.4 — NO-CLICK (json -> fetch -> iframe)');
  console.log('-'.repeat(70));

  const CONFIG = {
    SCROLL_DELAY: 900,
    MIN_NO_CHANGE: 4,
    MAX_SCROLLS: 1000,
    PER_SONG_DELAY: 350,
    PANEL_WAIT_IFRAME: 9000,
    RETRIES: 2,
    RESUME_KEY: 'suno_extractor_v2_progress',
    SAVE_INTERVAL: 15,
    SELECTORS: {
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, pre, .song-lyrics',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], source[src], meta[property="og:audio"]'
    }
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));
  function now(){ return new Date().toISOString(); }
  function downloadFile(content, filename, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      console.log(`✅ Saved: ${filename}`);
    } catch (e) { console.error('download failed', e); }
  }
  function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h=>{
        const v = String(r[h] ?? '').replace(/"/g,'""');
        return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
      }).join(','));
    }
    return lines.join('\n');
  }

  // Step 1: Auto-scroll
  console.log('▶ Step 1: Auto-scroll to load anchors...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise(resolve => {
    const iv = setInterval(()=>{
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
      const unique = new Set(anchors.map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        if (noChange >= CONFIG.MIN_NO_CHANGE) { clearInterval(iv); console.log(`   loaded ${count} songs`); resolve(); }
      } else { noChange = 0; scrollCount++; lastCount = count; console.log(`   scroll ${scrollCount}: ${count} songs`); }
      if (scrollCount >= CONFIG.MAX_SCROLLS) { clearInterval(iv); console.warn('max scrolls reached'); resolve(); }
    }, CONFIG.SCROLL_DELAY);
  });

  // Collect anchors -> unique song IDs
  console.log('▶ Step 2: collect song anchors...');
  const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'))
                         .filter((a,i,arr)=> arr.findIndex(x=>x.href===a.href)===i);
  const items = anchorEls.map(a => {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m?m[1]:null, href: a.href, el: a };
  }).filter(x=>x.id);
  console.log(`   found ${items.length} unique anchors`);

  // resume state
  const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   previously processed: ${Object.keys(progress.processed).length}`);

  // Helper: try to parse inline script JSONs / globals for the song id
  function tryInlineJSONForId(id) {
    // Search script tags for the id and some likely fields
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
    for (const txt of scripts) {
      if (!txt.includes(id)) continue;
      // Try to extract a JSON object that contains the id
      const jsonMatch = txt.match(/({[^}]{20,}"+?"+[\s\S]*?})/m);
      if (jsonMatch) {
        try {
          const candidate = JSON.parse(jsonMatch[1]);
          // heuristic: look for lyrics/description in object values
          const flat = JSON.stringify(candidate).toLowerCase();
          if (flat.includes('lyrics') || flat.includes('description') || flat.includes('verse')) {
            return candidate;
          }
        } catch(e){}
      }
    }
    // also try global window variables (common patterns)
    try {
      const winKeys = Object.keys(window).filter(k => /suno|Suno|__INITIAL__|__DATA__|__STATE__/.test(k));
      for (const k of winKeys) {
        try {
          const v = window[k];
          const s = JSON.stringify(v || {});
          if (s.includes(id) && (s.toLowerCase().includes('lyrics') || s.toLowerCase().includes('description'))) {
            return v;
          }
        } catch(e){}
      }
    } catch(e){}
    return null;
  }

  // Helper: fetch detail page HTML and parse
  async function fetchDetail(id) {
    try {
      const url = `/song/${id}`;
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('status ' + r.status);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lyrics = (doc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim();
      const summary = (doc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim();
      const author = (doc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim();
      const tags = Array.from(doc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      const audioNode = doc.querySelector(CONFIG.SELECTORS.AUDIO_META);
      const audio = audioNode?.src || audioNode?.content || '';
      return { lyrics, summary, author, tags, audio };
    } catch (e) {
      console.warn('   fetchDetail error', id, e.message);
      return {};
    }
  }

  // Helper: load in hidden iframe and scrape iframe doc
  async function iframeDetail(id, href) {
    return new Promise(async (resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.width = '1200px';
      iframe.style.height = '800px';
      iframe.style.opacity = '0';
      iframe.src = href || `/song/${id}`;
      document.body.appendChild(iframe);

      let settled = false;
      const finish = (result) => { if (!settled) { settled=true; try{ iframe.remove(); }catch(e){} resolve(result); } };

      // timeout
      const to = setTimeout(()=> finish({}), CONFIG.PANEL_WAIT_IFRAME);

      iframe.onload = async () => {
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          if (!idoc) { finish({}); return; }
          // wait small bit for SPA render inside iframe
          await wait(600);
          const lyrics = (idoc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim();
          const summary = (idoc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || idoc.querySelector('meta[name="description"]')?.content || '').trim();
          const author = (idoc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim();
          const tags = Array.from(idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
          const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
          const audio = audioNode?.src || audioNode?.content || '';
          clearTimeout(to);
          finish({ lyrics, summary, author, tags, audio });
        } catch (e) {
          clearTimeout(to);
          console.warn('iframe parse error', e);
          finish({});
        }
      };
    });
  }

  // Main loop: for each item try inline -> fetch -> iframe
  const results = [];
  for (let i=0;i<items.length;i++) {
    const { id, href, el } = items[i];
    if (progress.processed[id]) { results.push(progress.processed[id]); console.log(`↳ [${i+1}/${items.length}] SKIP ${id}`); continue; }
    let ok=false, attempt=0, lastErr=null;

    while (attempt <= CONFIG.RETRIES && !ok) {
      attempt++;
      try {
        // 1) Inline JSON/global
        const inline = tryInlineJSONForId(id);
        if (inline) {
          // heuristics: pull fields if present
          const lyrics = (inline.lyrics || inline.text || inline.transcript || '').toString().trim();
          const summary = (inline.summary || inline.description || inline.excerpt || '').toString().trim();
          const author = (inline.author || inline.artist || inline.uploader || '')?.toString().trim();
          const tags = (inline.tags || inline.style || inline.genres) ? (Array.isArray(inline.tags) ? inline.tags.join(', ') : inline.tags) : '';
          const obj = { id, href, title: inline.title || el.getAttribute('title') || el.textContent.trim(), author, tags, lyrics, summary, audio: inline.audio || '', scrapedAt: now(), source: 'inline' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${obj.title || id} — inline JSON FOUND`);
          ok=true; break;
        }

        // 2) Fetch detail page (fastest next)
        const fetched = await fetchDetail(id);
        if (fetched && (fetched.lyrics || fetched.summary)) {
          const title = el.getAttribute('title') || el.textContent.trim();
          const obj = { id, href, title, author: fetched.author, tags: fetched.tags, lyrics: fetched.lyrics, summary: fetched.summary, audio: fetched.audio, scrapedAt: now(), source: 'fetch' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${title || id} — fetched (lyrics: ${!!fetched.lyrics})`);
          ok=true; break;
        }

        // 3) hidden iframe fallback
        console.log(`   [${i+1}] fetch didn't return lyrics — trying hidden iframe...`);
        const iframeRes = await iframeDetail(id, href);
        if (iframeRes && (iframeRes.lyrics || iframeRes.summary)) {
          const title = el.getAttribute('title') || el.textContent.trim();
          const obj = { id, href, title, author: iframeRes.author, tags: iframeRes.tags, lyrics: iframeRes.lyrics, summary: iframeRes.summary, audio: iframeRes.audio, scrapedAt: now(), source: 'iframe' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${title || id} — iframe (lyrics: ${!!iframeRes.lyrics})`);
          ok=true; break;
        }

        // nothing found
        lastErr = 'no content found via inline/fetch/iframe';
        throw new Error(lastErr);
      } catch (err) {
        lastErr = err;
        console.warn(`   ! [${i+1}] attempt ${attempt} failed:`, err.message || err);
        await wait(400 + attempt * 200);
      }
    } // retries

    if (!ok) {
      console.error(`✖ [${i+1}] FAILED ${id}: ${String(lastErr)}`);
      const failObj = { id, href, title: el.getAttribute('title') || el.textContent.trim(), error: String(lastErr), scrapedAt: now() };
      results.push(failObj); progress.processed[id]=failObj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
    }

    // autosave periodically
    if ((i+1) % CONFIG.SAVE_INTERVAL === 0) {
      console.log(`⏺ Autosave after ${i+1} items`);
      const rows = Object.values(progress.processed);
      const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source'];
      try {
        downloadFile(toCSV(rows, headers), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`, 'text/csv');
        downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`, 'application/json');
      } catch(e){ console.warn('autosave failed', e); }
    }

    await wait(CONFIG.PER_SONG_DELAY);
  } // for loop

  // final export
  console.log('▶ Final export — writing files');
  const all = Object.values(progress.processed);
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source'];
  try {
    downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, 'text/csv');
    downloadFile(JSON.stringify(all, null, 2), `suno-extract-${ts}.json`, 'application/json');
    const txt = ['Suno Extract (v2.4)', `Exported: ${new Date().toLocaleString()}`, `Total: ${all.length}`, ''].concat(all.map((s,i)=>{
      const lines=[]; lines.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'}`); if (s.author) lines.push(`   Author: ${s.author}`); if (s.tags) lines.push(`   Tags: ${s.tags}`); if (s.summary) lines.push(`   Summary: ${s.summary?.slice(0,200)}`); if (s.lyrics) lines.push(`   Lyrics: ${s.lyrics?.slice(0,400)}`); if (s.audio) lines.push(`   Audio: ${s.audio}`); lines.push(`   URL: ${s.href}`); return lines.join('\n');
    })).join('\n\n');
    downloadFile(txt, `suno-extract-${ts}.txt`, 'text/plain');
  } catch (e) { console.error('final export failed', e); }

  window.extractedSongs = all;
  console.log('🎉 Done. Check ~/Downloads/ and window.extractedSongs. Session saved to sessionStorage.');
  console.log('-'.repeat(70));
})();

// ULTIMATE SUNO EXTRACTOR v2.1 - EXTRACT LYRICS & SIDE PANEL
// Paste this into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('?? ULTIMATE SUNO EXTRACTOR v2.1 (lyrics + sidebar)');
  console.log('?'.repeat(70));

  const CONFIG = {
    SCROLL_DELAY: 1200,      // ms between scrolls
    MAX_SCROLLS: 500,
    MIN_NO_CHANGE: 5,
    EXTRACT_LYRICS: true,    // fetch song detail pages to pull lyrics/transcript
    PER_SONG_DELAY: 350      // ms between detail page fetches
  };

  // ---------- Step 1: auto-scroll to load all songs ----------
  console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');
  let scrollCount = 0;
  let lastSongCount = 0;
  let noChangeCount = 0;

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const songLinks = document.querySelectorAll('a[href*="/song/"]');
      const unique = new Set();
      songLinks.forEach(l => {
        const m = l.href.match(/\/song\/([a-f0-9-]{36})/);
        if (m) unique.add(m[1]);
      });
      const songCount = unique.size;
      if (songCount === lastSongCount) {
        noChangeCount++;
        // silent log to avoid huge spam
        console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
        if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(`? Loaded ${songCount} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChangeCount = 0;
        scrollCount++;
        const added = songCount - lastSongCount;
        lastSongCount = songCount;
        console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${added})`);
      }
      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.log('?? Max scrolls reached');
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // ---------- Step 2: extract summary list ----------
  console.log('\n?? Step 2/4: Extracting basic song objects from page DOM...');
  const songs = [];
  const seen = new Set();
  const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'));

  anchorEls.forEach((el, idx) => {
    try {
      const match = el.href.match(/\/song\/([a-f0-9-]{36})/);
      if (!match) return;
      const id = match[1];
      if (seen.has(id)) return;
      seen.add(id);

      // find a sensible container nearby
      const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;

      // title
      const titleEl = el.querySelector('[title]') || el.querySelector('[class*="title"]') || el;
      const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim() || 'Untitled';

      // duration
      const durationEl = container?.querySelector('[class*="duration"], .font-mono, time, span[title*=":"], span[class*="font-mono"]');
      const duration = durationEl?.textContent?.trim() || '';

      // image
      const imgEl = el.querySelector('img') || container?.querySelector('img');
      let imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
      if (imageUrl) {
        imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720','');
      }

      // tags (styles)
      const tagEls = container?.querySelectorAll('a[href*="/style/"], div[title] > span') || [];
      const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean);

      // author
      const authorA = container?.querySelector('a[href^="/@"]') || document.querySelector('a[href^="/@"]');
      const author = authorA?.textContent?.trim() || '';
      const authorLink = authorA?.href || '';

      // plays / likes (best-effort)
      const playEl = container?.querySelector('[title*="play"], [class*="play-count"]');
      const plays = playEl?.textContent?.trim() || '';
      const likeEl = container?.querySelector('[title*="like"], [class*="like"]');
      const likes = likeEl?.textContent?.trim() || '';

      songs.push({
        id, title, url: `https://suno.com/song/${id}`, imageUrl, duration,
        tags: tags.join(', '), author, authorLink, plays, likes,
        extractedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('extract error', err);
    }
  });

  console.log(`? Found ${songs.length} unique songs on page`);

  if (songs.length === 0) {
    console.error('No songs found — make sure you are on a Suno page with songs visible.');
    return;
  }

  // ---------- Step 3: fetch per-song detail page and parse lyrics/sidebar ----------
  if (CONFIG.EXTRACT_LYRICS) {
    console.log('\n?? Step 3/4: Fetching each song page for lyrics & sidebar info (this may take a while)...');
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      try {
        // polite delay
        await new Promise(r => setTimeout(r, CONFIG.PER_SONG_DELAY));

        const detailUrl = `/song/${s.id}`;
        const res = await fetch(detailUrl, { credentials: 'same-origin' });
        if (!res.ok) {
          console.warn(`   ! Failed to fetch ${detailUrl} (status ${res.status})`);
          continue;
        }
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1) lyrics / transcript: observed in your snippet as .whitespace-pre-wrap
        let lyricsEl = doc.querySelector('.whitespace-pre-wrap') ||
                       doc.querySelector('[data-testid="lyrics"]') ||
                       Array.from(doc.querySelectorAll('pre, p, span'))
                         .find(el => /\[Verse|\[Chorus|\[Intro|When the/.test(el.textContent || ''));

        const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';

        // 2) sidebar summary / description / date
        let summaryEl = doc.querySelector('.mt-1.cursor-pointer') || doc.querySelector('[title*="Show Summary"]');
        let summary = '';
        if (!summaryEl) {
          // fallback: meta description or og:description
          summary = (doc.querySelector('meta[name="description"]')?.content ||
                     doc.querySelector('meta[property="og:description"]')?.content || '').trim();
        } else {
          summary = summaryEl.textContent?.trim() || '';
        }

        // 3) author & tags (fallbacks)
        const authorAnchor = doc.querySelector('a[href^="/@"]');
        const authorName = authorAnchor?.textContent?.trim() || s.author || '';
        const tagNodes = doc.querySelectorAll('div[title] span') || doc.querySelectorAll('.gap-2 span');
        const extractedTags = Array.from(tagNodes).map(n => n.textContent?.trim()).filter(Boolean);
        const tagsJoined = extractedTags.length ? extractedTags.join(', ') : s.tags || '';

        // 4) audio src (if present)
        const audioEl = doc.querySelector('audio[src]') || doc.querySelector('meta[property="og:audio"]');
        let audioUrl = '';
        if (audioEl) {
          audioUrl = audioEl.src || audioEl.content || '';
        } else {
          // fallback pattern
          audioUrl = `https://cdn1.suno.ai/${s.id}.mp3`;
        }

        // attach to song object
        s.lyrics = lyrics;
        s.sidebarSummary = summary;
        s.detailAuthor = authorName;
        s.detailTags = tagsJoined;
        s.detailAudio = audioUrl;

        console.log(`   ✅ [${i+1}/${songs.length}] ${s.title} — lyrics ${lyrics ? 'found' : 'NOT found'}`);
      } catch (err) {
        console.warn(`   ! Error fetching/parsing ${s.url}:`, err);
      }
    }
  } else {
    console.log('?? EXTRACT_LYRICS disabled — skipping detail fetches');
  }

  // ---------- Step 4: prepare and download CSV / JSON / TXT ----------
  console.log('\n?? Step 4/4: creating download files...');
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

  // ensure stable keys and consistent columns
  const fields = [
    'id','title','url','imageUrl','duration','tags','author','authorLink','plays','likes',
    'detailAuthor','detailTags','detailAudio','sidebarSummary','lyrics','extractedAt'
  ];

  // CSV
  const csvRows = [
    fields.join(',')
  ];
  songs.forEach(s => {
    const row = fields.map(k => {
      const v = String(s[k] || '').replace(/"/g,'""');
      return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
    }).join(',');
    csvRows.push(row);
  });
  const csvContent = csvRows.join('\n');

  // JSON
  const jsonContent = JSON.stringify(songs, null, 2);

  // TXT summary
  const txtLines = [
    '?? SUNO COLLECTION EXPORT (with lyrics & sidebar)',
    '?'.repeat(70),
    `Exported: ${new Date().toLocaleString()}`,
    `Total Songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    '?'.repeat(70),
    ''
  ];
  songs.forEach((s, i) => {
    txtLines.push(`${String(i+1).padStart(3)}. ${s.title} ${s.duration ? '['+s.duration+']':''}`);
    if (s.author) txtLines.push(`     By: ${s.author}`);
    if (s.detailAuthor && s.detailAuthor !== s.author) txtLines.push(`     Detail Author: ${s.detailAuthor}`);
    if (s.tags) txtLines.push(`     Tags: ${s.tags}`);
    if (s.detailTags && s.detailTags !== s.tags) txtLines.push(`     Detail Tags: ${s.detailTags}`);
    if (s.sidebarSummary) txtLines.push(`     Summary: ${s.sidebarSummary.slice(0,200)}${s.sidebarSummary.length>200?'...':''}`);
    if (s.lyrics) txtLines.push(`     Lyrics:\n${s.lyrics.slice(0,800)}${s.lyrics.length>800?'...':''}`);
    if (s.detailAudio) txtLines.push(`     Audio: ${s.detailAudio}`);
    txtLines.push(`     URL: ${s.url}`);
    txtLines.push('');
  });
  const txtContent = txtLines.join('\n');

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   ? ${filename}`);
  }

  downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
  downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
  downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');

  window.extractedSongs = songs;

  console.log('\n' + '?'.repeat(70));
  console.log('?? EXTRACTION COMPLETE!');
  console.log('?'.repeat(70));
  console.log(`   ?? Total songs: ${songs.length}`);
  console.log('   ?? Files saved to ~/Downloads/');
  console.table(songs.slice(0,10).map(s => ({Title: s.title, Duration: s.duration, Author: s.author, HasLyrics: !!s.lyrics})));
})();

# 🎵 Suno Data Analysis & Media Download - Handoff Summary

**Date**: 2025-11-27  
**Location**: `/Users/steven/Music/nocTurneMeLoDieS`

---

## 📊 What Was Analyzed

### 1. CSV/JSON Comparison
- ✅ Compared 4 matching file pairs (suno-export, suno-extract, suno-partial)
- ✅ Found perfect data consistency between CSV and JSON formats
- ✅ Identified data quality issues (Grade C - missing lyrics, tags, duration)

### 2. Large Extract Analysis
- ✅ Analyzed `suno-extract-2025-11-27T22-14-54.csv` (356 songs)
- ✅ Found 0% fill rate for lyrics, tags, duration, author, images
- ✅ Identified that current scraper only gets basic metadata

### 3. All Data Sources Comparison
- ✅ Analyzed 8+ data sources across multiple directories
- ✅ **Best Source Found**: `Master Combined (Oct)` - 1,092 songs, Grade A
- ✅ Discovered `SunoApi.ts` in `/Users/steven/Documents/suno-api/` - can extract ALL metadata

### 4. Complete Header Analysis
- ✅ Analyzed 482 files (197 CSV, 285 JSON)
- ✅ Identified top 10 most common fields across all files
- ✅ Created complete schema mapping

### 5. Media Download Setup
- ✅ Created downloader script for missing MP3s and images
- ✅ Found 606 unique songs across all sources
- ✅ Identified 170 MP3s and 343 images to download
- ✅ Downloads currently in progress

---

## 🔑 Key Findings

### Data Quality Grades:
- **Master Combined (Oct)**: Grade A - 1,092 songs with duration, images, descriptions
- **Current Extract (Nov 27)**: Grade C - 356 songs, missing 95% of valuable metadata
- **Dataset Scrapers**: Grade A - Small datasets (48-30 songs) but have lyrics (91-100%)

### Solution Discovered:
- **SunoApi.ts** at `/Users/steven/Documents/suno-api/src/lib/SunoApi.ts`
- Can extract: lyrics, tags, duration, images, author info
- Use `get(songIds)` method to fetch full metadata

### Top Fields Across All Files:
1. `title` - 200 files
2. `summary` - 195 files
3. `id` - 193 files
4. `author` - 162 files
5. `tags` - 156 files
6. `duration` - 142 files
7. `imageurl` - 118 files

---

## 📁 Important Files Created

### Analysis Reports:
1. `COMPLETE_HEADER_ANALYSIS.md` - Full schema analysis of 482 files
2. `ALL_SOURCES_COMPARISON.md` - Field-by-field comparison
3. `DATA_QUALITY_ANALYSIS.md` - Data quality assessment
4. `CSV_JSON_COMPARISON_SUMMARY.md` - Format consistency check
5. `DATA_SOURCES_FINAL_SUMMARY.md` - Executive summary
6. `COMPLETE_SOURCES_ANALYSIS.md` - Complete source analysis
7. `DOWNLOAD_SUMMARY.md` - Media download status

### Scripts:
1. `compare_csv_json.py` - Compare CSV/JSON pairs
2. `analyze_large_extract.py` - Analyze data quality
3. `compare_all_suno_sources.py` - Compare all data sources
4. `analyze_all_headers.py` - Complete header analysis
5. `download_missing_media.py` - Download MP3s and images ⭐
6. `process_notion_data.py` - Process Notion exports

---

## 🎯 Current Status

### Downloads:
- **Location**: `downloads/mp3s/` and `downloads/images/`
- **Status**: In progress (170 MP3s, 343 images)
- **Report**: Will be generated at `downloads/DOWNLOAD_REPORT.md`

### Notion Integration:
- **Status**: ⚠️ Requires manual export
- **Action Needed**: Export Notion page as CSV/JSON → save as `notion_export.csv`
- **Then Run**: `python3 process_notion_data.py`

---

## 📋 Data Sources Reference

### Primary CSV Files:
- `/Users/steven/Music/nocTurneMeLoDieS/suno_ultimate_master.csv` (3,953 records)
- `/Users/steven/Music/nocTurneMeLoDieS/suno_backups/data/data/suno_merged_master_20250904-143205_data.csv` (5,072 records)
- `/Users/steven/Music/nocTurneMeLoDieS/suno_backups/data/data/suno-9-2025 - songs_master_combined_data.csv` (1,185 records)

### Best Master File:
- `/Users/steven/Documents/CsV/Suno-ScrapeD - songs_master_combined.csv` (1,092 songs, Grade A)

### JSON Data:
- `/Users/steven/Music/nocTurneMeLoDieS/suno_backups/data/data/SUNO_1/` (37 JSON files)

### API Client (Solution):
- `/Users/steven/Documents/suno-api/src/lib/SunoApi.ts` - Complete API client

---

## 🚀 Recommended Next Steps

### Immediate:
1. ✅ Let downloader complete (running now)
2. ⚠️ Export Notion page and process it
3. 📊 Review download report when complete

### Short Term:
1. Use `SunoApi.ts` to enhance current extractor
2. Re-extract all 356 songs with full metadata (lyrics, tags, duration)
3. Merge lyrics from Dataset Scraper files into Master Combined

### Long Term:
1. Build unified master catalog with all fields
2. Maintain single source of truth
3. Set up automated data quality monitoring

---

## 💡 Key Recommendations

1. **Use Master Combined** as primary catalog (1,092 songs with duration/images)
2. **Enhance Current Extractor** using SunoApi.ts to get Grade A data
3. **Merge Data Sources** - Combine best fields from each source
4. **Download Missing Media** - Script is running, check report when done

---

## 🔧 Quick Commands

```bash
# Check download progress
cd /Users/steven/Music/nocTurneMeLoDieS
ls -lh downloads/mp3s/ | wc -l
ls -lh downloads/images/ | wc -l

# Process Notion export (after exporting)
python3 process_notion_data.py

# Re-run downloader (includes Notion data)
python3 download_missing_media.py

# View download report
cat downloads/DOWNLOAD_REPORT.md
```

---

## 📊 Statistics Summary

- **Total Files Analyzed**: 482 (197 CSV, 285 JSON)
- **Unique Songs Found**: 606
- **MP3s to Download**: 170
- **Images to Download**: 343
- **Best Data Source**: Master Combined (Oct) - 1,092 songs
- **Current Extract**: 356 songs (needs enhancement)

---

**All analysis complete. Downloads in progress. Ready for next steps.**

// 🎵 Suno Live Extractor v3.0
// Works on https://suno.com/library, playlists, or profile pages.
// 1. Open a page with your songs.
// 2. Open DevTools → Console.
// 3. Paste this entire script.
// 4. Hit Enter, wait. Files go to ~/Downloads.

(async () => {
  console.log("🎵 Suno Live Extractor v3.0");
  console.log("──────────────────────────────────────────────");

  // ===== CONFIG =====
  const CONFIG = {
    SCROLL_DELAY: 1500,      // ms between scrolls
    MAX_SCROLLS: 500,        // safety cap
    MIN_NO_CHANGE: 5,        // stop after N scrolls with no new songs
    FETCH_DETAILS: true,     // fetch /song/{id} pages to pull lyrics/summary
    PER_SONG_DELAY: 300,     // ms between detail fetches
  };

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  // -------------------------------------------------
  // 1. AUTO-SCROLL TO LOAD ALL SONGS
  // -------------------------------------------------
  console.log("\n▶ Step 1/4: Auto-scrolling to load songs...");

  let scrollCount = 0;
  let lastSongCount = 0;
  let noChangeCount = 0;

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);

      const anchors = Array.from(
        document.querySelectorAll('a[href*="/song/"]')
      );
      const uniqueIds = new Set();

      for (const a of anchors) {
        const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
        if (m) uniqueIds.add(m[1]);
      }

      const count = uniqueIds.size;

      if (count === lastSongCount) {
        noChangeCount++;
        console.log(
          `   ⏳ No new songs... (${noChangeCount}/${CONFIG.MIN_NO_CHANGE})`
        );
        if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(
            `✅ Finished scrolling with ${count} unique songs (scrolls: ${scrollCount})`
          );
          resolve();
        }
      } else {
        const diff = count - lastSongCount;
        lastSongCount = count;
        noChangeCount = 0;
        scrollCount++;
        console.log(
          `   🔁 Scroll ${scrollCount}: ${count} songs (+${diff})`
        );
      }

      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.warn("⚠️ Reached MAX_SCROLLS, stopping auto-scroll.");
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // -------------------------------------------------
  // 2. COLLECT BASIC SONG DATA FROM DOM
  // -------------------------------------------------
  console.log("\n▶ Step 2/4: Collecting basic song data from DOM...");

  const songMap = new Map(); // id -> song object

  const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
  for (const a of anchors) {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    if (!m) continue;
    const id = m[1];
    if (songMap.has(id)) continue;

    // Try to find a reasonable container
    const container =
      a.closest('[data-clip-id]') ||
      a.closest('[data-testid="song-row"]') ||
      a.closest("div") ||
      a;

    // Title
    const titleEl =
      a.querySelector("[title]") ||
      container.querySelector("[title]") ||
      a;
    const rawTitle =
      (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
    const title = rawTitle || "Untitled";

    // Duration
    const durationEl =
      container.querySelector(".font-mono") ||
      container.querySelector('[class*="duration"]') ||
      container.querySelector("time");
    const duration = durationEl ? durationEl.textContent.trim() : "";

    // Image URL
    const imgEl =
      a.querySelector("img") ||
      container.querySelector("img");
    let imageUrl = imgEl ? imgEl.src || imgEl.getAttribute("data-src") : "";
    if (imageUrl) {
      imageUrl = imageUrl
        .replace("/image_", "/image_large_")
        .replace("?width=720", "");
    }

    // Tags / styles
    const tagEls =
      container.querySelectorAll('a[href*="/style/"]') || [];
    const tags = Array.from(tagEls)
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join(", ");

    // Author
    const authorEl =
      container.querySelector('a[href^="/@"]') ||
      document.querySelector('a[href^="/@"]');
    const author = authorEl ? authorEl.textContent.trim() : "";
    const authorLink = authorEl ? authorEl.href : "";

    // Plays/Likes (best-effort; may be blank)
    const playsEl =
      container.querySelector('[title*="play"]') ||
      container.querySelector('[class*="play-count"]');
    const likesEl =
      container.querySelector('[title*="like"]') ||
      container.querySelector('[class*="like"]');
    const plays = playsEl ? playsEl.textContent.trim() : "";
    const likes = likesEl ? likesEl.textContent.trim() : "";

    const song = {
      id,
      title,
      url: `https://suno.com/song/${id}`,
      shareUrl: `https://suno.com/s/${id.split("-")[0]}`,
      audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
      imageUrl,
      duration,
      tags,
      author,
      authorLink,
      plays,
      likes,
      detailAuthor: "",
      detailTags: "",
      detailAudio: "",
      sidebarSummary: "",
      lyrics: "",
      extractedAt: new Date().toISOString(),
    };

    songMap.set(id, song);
  }

  const songs = Array.from(songMap.values());
  console.log(`   ✅ Collected ${songs.length} unique songs from DOM.`);

  if (songs.length === 0) {
    console.error(
      "❌ No songs found. Make sure you're on a Suno page with visible songs."
    );
    return;
  }

  // -------------------------------------------------
  // 3. FETCH DETAIL PAGE FOR LYRICS & SUMMARY
  // -------------------------------------------------
  if (CONFIG.FETCH_DETAILS) {
    console.log(
      "\n▶ Step 3/4: Fetching each /song/{id} page for lyrics & summary..."
    );

    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      const detailUrl = `/song/${s.id}`;

      try {
        await wait(CONFIG.PER_SONG_DELAY);
        const res = await fetch(detailUrl, { credentials: "same-origin" });
        if (!res.ok) {
          console.warn(
            `   ⚠️ [${i + 1}/${songs.length}] ${s.title} — fetch failed (${res.status})`
          );
          continue;
        }

        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Lyrics
        const lyricsEl =
          doc.querySelector(".whitespace-pre-wrap") ||
          doc.querySelector('[data-testid="lyrics"]') ||
          Array.from(doc.querySelectorAll("pre, p, span")).find((el) =>
            /\[Verse|\[Chorus|\[Intro|Verse 1|Chorus/i.test(
              el.textContent || ""
            )
          );
        const lyrics = lyricsEl ? (lyricsEl.textContent || "").trim() : "";

        // Sidebar summary / description
        const summaryEl =
          doc.querySelector(".mt-1.cursor-pointer") ||
          doc.querySelector('[data-testid="summary"]') ||
          doc.querySelector('meta[name="description"]') ||
          doc.querySelector('meta[property="og:description"]');
        const sidebarSummary = summaryEl
          ? (summaryEl.content || summaryEl.textContent || "").trim()
          : "";

        // Detail author & tags
        const detailAuthorEl = doc.querySelector('a[href^="/@"]');
        const detailAuthor = detailAuthorEl
          ? detailAuthorEl.textContent.trim()
          : s.author;

        const detailTagEls =
          doc.querySelectorAll('a[href*="/style/"], div[title] span') || [];
        const detailTags = Array.from(detailTagEls)
          .map((el) => el.textContent.trim())
          .filter(Boolean)
          .join(", ");

        // Detail audio URL
        const audioEl =
          doc.querySelector("audio[src]") ||
          doc.querySelector('meta[property="og:audio"]') ||
          doc.querySelector("source[src]");
        const detailAudio =
          (audioEl && (audioEl.src || audioEl.content || audioEl.getAttribute("src"))) ||
          s.audioUrl;

        s.lyrics = lyrics;
        s.sidebarSummary = sidebarSummary;
        s.detailAuthor = detailAuthor || s.author;
        s.detailTags = detailTags || s.tags;
        s.detailAudio = detailAudio;

        console.log(
          `   ✅ [${i + 1}/${songs.length}] ${s.title} — lyrics ${
            lyrics ? "FOUND" : "not found"
          }`
        );
      } catch (err) {
        console.warn(
          `   ⚠️ [${i + 1}/${songs.length}] ${s.title} — error: ${err.message}`
        );
      }
    }
  } else {
    console.log(
      "\n▶ Step 3/4: FETCH_DETAILS = false, skipping /song/{id} fetch."
    );
  }

  // -------------------------------------------------
  // 4. EXPORT CSV + JSON + TXT
  // -------------------------------------------------
  console.log("\n▶ Step 4/4: Creating and downloading export files...");

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const fields = [
    "id",
    "title",
    "url",
    "shareUrl",
    "audioUrl",
    "imageUrl",
    "duration",
    "tags",
    "author",
    "authorLink",
    "plays",
    "likes",
    "detailAuthor",
    "detailTags",
    "detailAudio",
    "sidebarSummary",
    "lyrics",
    "extractedAt",
  ];

  const toCsv = (rows, headers) => {
    const lines = [];
    lines.push(headers.join(","));
    for (const row of rows) {
      const line = headers
        .map((key) => {
          const raw = String(row[key] ?? "");
          const escaped = raw.replace(/"/g, '""');
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(",");
      lines.push(line);
    }
    return lines.join("\n");
  };

  const csvContent = toCsv(songs, fields);
  const jsonContent = JSON.stringify(songs, null, 2);

  const txtContent = [
    "🎵 SUNO COLLECTION EXPORT",
    "──────────────────────────────────────────────",
    `Exported: ${new Date().toLocaleString()}`,
    `Total songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    "──────────────────────────────────────────────",
    "",
    "Tracks:",
    "",
    ...songs.map((s, i) => {
      const lines = [];
      lines.push(`${String(i + 1).padStart(3, " ")}. ${s.title}`);
      if (s.duration) lines.push(`   Duration: ${s.duration}`);
      if (s.author || s.detailAuthor)
        lines.push(`   Author: ${s.detailAuthor || s.author}`);
      if (s.tags || s.detailTags)
        lines.push(`   Tags: ${s.detailTags || s.tags}`);
      if (s.sidebarSummary)
        lines.push(
          `   Summary: ${
            s.sidebarSummary.length > 200
              ? s.sidebarSummary.slice(0, 200) + "..."
              : s.sidebarSummary
          }`
        );
      if (s.lyrics)
        lines.push(
          `   Lyrics: ${
            s.lyrics.length > 400
              ? s.lyrics.slice(0, 400) + "..."
              : s.lyrics
          }`
        );
      lines.push(`   URL: ${s.url}`);
      lines.push("");
      return lines.join("\n");
    }),
  ].join("\n");

  const downloadFile = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   💾 ${filename}`);
  };

  downloadFile(csvContent, `suno-export-${timestamp}.csv`, "text/csv");
  downloadFile(jsonContent, `suno-export-${timestamp}.json`, "application/json");
  downloadFile(txtContent, `suno-export-${timestamp}.txt`, "text/plain");

  window.extractedSongs = songs;

  console.log("\n✅ Export complete!");
  console.log(`   Files saved as suno-export-${timestamp}.* in your Downloads folder.`);
  console.log("   Use window.extractedSongs in console to inspect the data.");
  console.table(
    songs.slice(0, 5).map((s) => ({
      Title: s.title,
      Duration: s.duration,
      Author: s.detailAuthor || s.author,
      HasLyrics: !!s.lyrics,
    }))
  );
})();


analyze // ?? Suno HTML Data Extractor - Dev Console Script // ================================================== // // USAGE: // 1. Open main.html or evolves.html in Chrome/Safari // 2. Open Dev Console (Cmd+Option+I on Mac) // 3. Paste this entire script // 4. Press Enter // 5. Data will be extracted and downloaded as CSV!

console.log('?? Suno Data Extractor Starting...');

// Extract all song data from the page function extractSunoSongs() { const songs = [];

// Method 1: Find all song containers by data-clip-id
const songElements = document.querySelectorAll('[data-clip-id]');

console.log(`Found ${songElements.length} song elements`);

songElements.forEach((element, index) => {
    try {
        const song = {};
        
        // Extract ID
        song.id = element.getAttribute('data-clip-id');
        
        // Extract title
        const titleElement = element.querySelector('[title]');
        if (titleElement) {
            song.title = titleElement.getAttribute('title') || titleElement.textContent.trim();
        }
        
        // Extract duration
        const durationElement = element.querySelector('.font-mono');
        if (durationElement) {
            song.duration = durationElement.textContent.trim();
        }
        
        // Extract image URL
        const imageElement = element.querySelector('img[src*="suno.ai"]');
        if (imageElement) {
            song.image_url = imageElement.getAttribute('src') || imageElement.getAttribute('data-src');
        }
        
        // Extract song URL
        const linkElement = element.querySelector('a[href*="/song/"]');
        if (linkElement) {
            const href = linkElement.getAttribute('href');
            song.url = href.startsWith('http') ? href : `https://suno.com${href}`;
        }
        
        // Extract tags/style
        const tagElements = element.querySelectorAll('[title][href*="/style/"]');
        if (tagElements.length > 0) {
            song.tags = Array.from(tagElements).map(el => el.textContent.trim()).join(', ');
        }
        
        // Extract version (v4, v5, etc.)
        const versionElement = element.querySelector('[style*="FD429C"]');
        if (versionElement) {
            song.version = versionElement.textContent.trim();
        }
        
        // Extract plays/likes/comments
        const statsElements = element.querySelectorAll('.text-\\[12px\\] .font-medium');
        if (statsElements.length >= 3) {
            song.plays = statsElements[0]?.textContent.trim() || '0';
            song.likes = statsElements[1]?.textContent.trim() || '0';
            song.comments = statsElements[2]?.textContent.trim() || '0';
        }
        
        // Only add if we have at least an ID and title
        if (song.id && song.title) {
            songs.push(song);
            
            if ((index + 1) % 10 === 0) {
                console.log(`Extracted ${index + 1} songs...`);
            }
        }
    } catch (e) {
        console.error(`Error extracting song ${index}:`, e);
    }
});

return songs;

}

// Convert to CSV function convertToCSV(songs) { if (songs.length === 0) { return ''; }

// Get all unique keys
const keys = Object.keys(songs[0]);

// Create header
const header = keys.join(',');

// Create rows
const rows = songs.map(song => {
    return keys.map(key => {
        const value = song[key] || '';
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
    }).join(',');
});

return [header, ...rows].join('\n');

}

// Download as file function downloadCSV(csv, filename) { const blob = new Blob([csv], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); }

// Main execution console.log('?? Extracting songs...'); const extractedSongs = extractSunoSongs();

console.log('? Extraction complete!'); console.log(?? Found ${extractedSongs.length} songs);

// Show sample if (extractedSongs.length > 0) { console.log('\n?? Sample songs:'); extractedSongs.slice(0, 5).forEach((song, i) => { console.log(${i + 1}. ${song.title} (${song.duration})); }); }

// Convert to CSV const csv = convertToCSV(extractedSongs);

// Download const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); const filename = suno-songs-${timestamp}.csv;

downloadCSV(csv, filename);

console.log(\n? Downloaded: ${filename}); console.log(?? Check your Downloads folder!);

// Also copy to clipboard const jsonData = JSON.stringify(extractedSongs, null, 2); navigator.clipboard.writeText(jsonData).then(() => { console.log('?? JSON data also copied to clipboard!'); }).catch(() => { console.log('?? Could not copy to clipboard'); });

// Return data for inspection console.log('\n?? Data stored in: extractedSongs'); console.log('?? Access it by typing: extractedSongs');

extractedSongs;

// ?? AUTO-SCROLL SUNO EXTRACTOR - Paste into Dev Console // ========================================================= // This will auto-scroll to load ALL songs, then extract them!

console.log('?? Starting AUTO-SCROLL Extractor...'); console.log('? This will scroll through the page to load all songs...');

// Configuration const SCROLL_DELAY = 1500; // Wait 1.5 seconds between scrolls const MAX_SCROLLS = 200; // Maximum number of scrolls (safety limit)

let scrollCount = 0; let lastHeight = 0; let noChangeCount = 0;

// Auto-scroll function function autoScroll() { return new Promise((resolve) => { const scrollInterval = setInterval(() => { // Scroll to bottom window.scrollTo(0, document.body.scrollHeight);

        const currentHeight = document.body.scrollHeight;
        
        // Check if page height changed
        if (currentHeight === lastHeight) {
            noChangeCount++;
            console.log(`   No new content loaded... (${noChangeCount}/3)`);
            
            // If no change for 3 scrolls, we're done
            if (noChangeCount >= 3) {
                clearInterval(scrollInterval);
                console.log('? Finished scrolling!');
                resolve();
            }
        } else {
            noChangeCount = 0;
            lastHeight = currentHeight;
            scrollCount++;
            
            // Count current songs
            const currentSongCount = document.querySelectorAll('[data-clip-id]').length;
            console.log(`   Scroll ${scrollCount}: Found ${currentSongCount} songs...`);
        }
        
        // Safety limit
        if (scrollCount >= MAX_SCROLLS) {
            clearInterval(scrollInterval);
            console.log('??  Reached max scrolls, stopping...');
            resolve();
        }
        
    }, SCROLL_DELAY);
});

}

// Extract function async function extractAllSongs() { // Step 1: Auto-scroll to load everything console.log('\n?? Step 1: Auto-scrolling to load all songs...'); await autoScroll();

// Step 2: Extract all songs
console.log('\n?? Step 2: Extracting song data...');

const songs = [];
const songElements = document.querySelectorAll('[data-clip-id]');

console.log(`   Found ${songElements.length} total songs!`);

songElements.forEach((el, index) => {
    try {
        const song = {
            id: el.getAttribute('data-clip-id'),
            title: el.querySelector('[title]')?.getAttribute('title') || '',
            duration: el.querySelector('.font-mono')?.textContent?.trim() || '',
            url: 'https://suno.com/song/' + el.getAttribute('data-clip-id'),
            audio_url: 'https://cdn1.suno.ai/' + el.getAttribute('data-clip-id') + '.mp3',
            image_url: el.querySelector('img[src*="suno.ai"]')?.getAttribute('src') || '',
        };
        
        // Extract tags
        const tagElements = el.querySelectorAll('[href*="/style/"]');
        if (tagElements.length > 0) {
            song.tags = Array.from(tagElements).map(t => t.textContent.trim()).join(', ');
        }
        
        // Extract version
        const versionEl = el.querySelector('[style*="FD429C"]');
        if (versionEl) {
            song.version = versionEl.textContent.trim();
        }
        
        // Extract stats (plays, likes, comments)
        const statsElements = el.querySelectorAll('.text-\\[12px\\] .font-medium');
        if (statsElements.length >= 3) {
            song.plays = statsElements[0]?.textContent.trim() || '0';
            song.likes = statsElements[1]?.textContent.trim() || '0';
            song.comments = statsElements[2]?.textContent.trim() || '0';
        }
        
        if (song.title) {
            songs.push(song);
        }
    } catch (e) {
        console.error(`Error on song ${index}:`, e);
    }
});

console.log(`? Extracted ${songs.length} songs!`);

// Step 3: Create CSV
console.log('\n?? Step 3: Creating CSV...');

const csv = [
    'id,title,duration,tags,version,plays,likes,comments,url,audio_url,image_url',
    ...songs.map(s => {
        const title = (s.title || '').replace(/"/g, '""');
        const tags = (s.tags || '').replace(/"/g, '""');
        return `${s.id},"${title}",${s.duration},"${tags}",${s.version || ''},${s.plays || '0'},${s.likes || '0'},${s.comments || '0'},${s.url},${s.audio_url},${s.image_url}`;
    })
].join('\n');

// Step 4: Download CSV
console.log('\n?? Step 4: Downloading CSV...');

const blob = new Blob([csv], {type: 'text/csv'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;

const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
const filename = `suno-songs-${timestamp}.csv`;

a.download = filename;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

console.log(`? Downloaded: ${filename}`);
console.log('?? Check your Downloads folder!');

// Step 5: Copy to clipboard
console.log('\n?? Step 5: Copying JSON to clipboard...');

const jsonData = JSON.stringify(songs, null, 2);
navigator.clipboard.writeText(jsonData).then(() => {
    console.log('? JSON copied to clipboard!');
}).catch(() => {
    console.log('??  Could not copy to clipboard');
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('?? EXTRACTION COMPLETE!');
console.log('='.repeat(70));
console.log(`\n   Total songs: ${songs.length}`);
console.log(`   CSV file: ${filename}`);
console.log(`   Location: ~/Downloads/`);

// Show samples
console.log('\n?? First 10 songs:');
songs.slice(0, 10).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.title} (${s.duration}) - ${s.version}`);
});

if (songs.length > 10) {
    console.log(`   ... and ${songs.length - 10} more!`);
}

console.log('\n?? To view all data in console, type: extractedSongs');

// Return for inspection
window.extractedSongs = songs;
return songs;

}

// Run the extraction extractAllSongs();

// ?? LIVE SUNO WEBSITE EXTRACTOR - Paste into Dev Console // ========================================================= // Works on the LIVE suno.com website (not saved HTML files) // Auto-scrolls and extracts ALL your songs!

console.log('?? Live Suno Extractor Starting...'); console.log('? Please wait while we auto-scroll and load all songs...');

// Configuration const SCROLL_DELAY = 2000; // 2 seconds between scrolls const MAX_SCROLLS = 300; // Max scrolls (for large collections)

// Auto-scroll and extract async function extractAllSunoSongs() { let scrollCount = 0; let lastSongCount = 0; let noChangeCount = 0;

// Step 1: Auto-scroll to load all songs
console.log('\n?? Step 1: Auto-scrolling to load all songs...');

await new Promise((resolve) => {
    const scrollInterval = setInterval(() => {
        // Scroll to bottom
        window.scrollTo(0, document.documentElement.scrollHeight);
        
        // Count songs (try multiple selectors)
        const songCount = Math.max(
            document.querySelectorAll('[data-clip-id]').length,
            document.querySelectorAll('[data-testid="song-row"]').length,
            document.querySelectorAll('.song-row').length,
            document.querySelectorAll('a[href*="/song/"]').length
        );
        
        if (songCount === lastSongCount) {
            noChangeCount++;
            console.log(`   No new songs... (${noChangeCount}/5)`);
            
            if (noChangeCount >= 5) {
                clearInterval(scrollInterval);
                console.log(`? Finished! Loaded ${songCount} songs`);
                resolve();
            }
        } else {
            noChangeCount = 0;
            scrollCount++;
            console.log(`   Scroll ${scrollCount}: ${songCount} songs loaded...`);
            lastSongCount = songCount;
        }
        
        if (scrollCount >= MAX_SCROLLS) {
            clearInterval(scrollInterval);
            console.log(`??  Max scrolls reached`);
            resolve();
        }
    }, SCROLL_DELAY);
});

// Step 2: Extract song data
console.log('\n?? Step 2: Extracting song data...');

const songs = [];
const extractedIds = new Set();

// Try multiple selection methods
const selectors = [
    '[data-clip-id]',
    '[data-testid="song-row"]',
    'a[href*="/song/"]'
];

for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    
    elements.forEach((el) => {
        try {
            // Get song ID
            let songId = el.getAttribute('data-clip-id');
            
            if (!songId) {
                // Try to extract from href
                const link = el.querySelector('a[href*="/song/"]') || el;
                const href = link.getAttribute('href');
                if (href) {
                    const match = href.match(/\/song\/([a-f0-9-]{36})/);
                    if (match) songId = match[1];
                }
            }
            
            if (!songId || extractedIds.has(songId)) return;
            extractedIds.add(songId);
            
            // Extract title
            let title = '';
            const titleEl = el.querySelector('[title]') || 
                           el.querySelector('.text-base') ||
                           el.querySelector('a[href*="/song/"]');
            if (titleEl) {
                title = titleEl.getAttribute('title') || titleEl.textContent.trim();
            }
            
            // Extract duration
            let duration = '';
            const durationEl = el.querySelector('.font-mono') ||
                              el.querySelector('[class*="duration"]');
            if (durationEl) {
                duration = durationEl.textContent.trim();
            }
            
            // Extract image
            let imageUrl = '';
            const imgEl = el.querySelector('img[src*="suno"]');
            if (imgEl) {
                imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                // Get large version
                imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720', '');
            }
            
            // Extract tags
            let tags = '';
            const tagEls = el.querySelectorAll('a[href*="/style/"]');
            if (tagEls.length > 0) {
                tags = Array.from(tagEls).map(t => t.textContent.trim()).join(', ');
            }
            
            // Create song object
            if (songId && title) {
                songs.push({
                    id: songId,
                    title: title,
                    duration: duration,
                    tags: tags,
                    url: `https://suno.com/song/${songId}`,
                    share_url: `https://suno.com/s/${songId.split('-')[0]}`,
                    audio_url: `https://cdn1.suno.ai/${songId}.mp3`,
                    image_url: imageUrl
                });
            }
        } catch (e) {
            console.error('Error extracting song:', e);
        }
    });
    
    if (songs.length > 0) break; // Found songs, stop trying selectors
}

console.log(`? Extracted ${songs.length} unique songs!`);

if (songs.length === 0) {
    console.error('? No songs found! You may need to:');
    console.error('   1. Make sure you are on suno.com/library or your profile page');
    console.error('   2. Wait for the page to fully load');
    console.error('   3. Try scrolling manually first');
    return [];
}

// Step 3: Create CSV
console.log('\n?? Step 3: Creating CSV...');

const csv = [
    'id,title,duration,tags,url,share_url,audio_url,image_url',
    ...songs.map(s => {
        const title = (s.title || '').replace(/"/g, '""');
        const tags = (s.tags || '').replace(/"/g, '""');
        return `${s.id},"${title}",${s.duration || ''},"${tags}",${s.url},${s.share_url},${s.audio_url},${s.image_url || ''}`;
    })
].join('\n');

// Step 4: Download CSV
console.log('\n?? Step 4: Downloading CSV...');

const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;

const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
const filename = `suno-collection-${timestamp}.csv`;

a.download = filename;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

console.log(`? Downloaded: ${filename}`);
console.log('?? Check ~/Downloads/');

// Step 5: Create text summary
console.log('\n?? Step 5: Creating text summary...');

const txtSummary = [
    '?? YOUR SUNO COLLECTION',
    '='.repeat(70),
    `\nExtracted: ${new Date().toLocaleString()}`,
    `Total Songs: ${songs.length}\n`,
    '='.repeat(70),
    '\n?? SONGS:\n',
    ...songs.map((s, i) => {
        let line = `${i + 1}. ${s.title}`;
        if (s.duration) line += ` (${s.duration})`;
        if (s.tags) line += `\n   Style: ${s.tags}`;
        line += `\n   URL: ${s.url}\n`;
        return line;
    })
].join('\n');

// Download TXT
const txtBlob = new Blob([txtSummary], {type: 'text/plain;charset=utf-8'});
const txtUrl = URL.createObjectURL(txtBlob);
const txtLink = document.createElement('a');
txtLink.href = txtUrl;
txtLink.download = `suno-collection-${timestamp}.txt`;
document.body.appendChild(txtLink);
txtLink.click();
document.body.removeChild(txtLink);
URL.revokeObjectURL(txtUrl);

console.log(`? Downloaded: suno-collection-${timestamp}.txt`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('?? EXTRACTION COMPLETE!');
console.log('='.repeat(70));
console.log(`\n   ?? Total songs: ${songs.length}`);
console.log(`   ?? Files in ~/Downloads/:`);
console.log(`      ? ${filename}`);
console.log(`      ? suno-collection-${timestamp}.txt`);

// Show top songs
console.log('\n?? First 10 songs:');
songs.slice(0, 10).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.title} ${s.duration ? '(' + s.duration + ')' : ''}`);
});

if (songs.length > 10) {
    console.log(`   ... and ${songs.length - 10} more!`);
}

console.log('\n?? Type "extractedSongs" to view all data in console');
console.log('?? Type "extractedSongs[0]" to see first song details');

// Store globally
window.extractedSongs = songs;

return songs;

}

// Run it! extractAllSunoSongs();

// ?? SAVED HTML EXTRACTOR - For main.html & evolves.html // ======================================================== // Paste this into dev console when viewing saved HTML files

console.log('?? Saved HTML Extractor Starting...');

const songs = []; const extractedIds = new Set();

// Method 1: Extract from href links console.log('?? Looking for song links...'); const songLinks = document.querySelectorAll('a[href*="/song/"]'); console.log(   Found ${songLinks.length} song links);

songLinks.forEach((link, index) => { try { // Extract song ID from href const href = link.getAttribute('href'); const match = href.match(//song/([a-f0-9-]{36})/);

    if (match) {
        const songId = match[1];
        
        if (extractedIds.has(songId)) return; // Skip duplicates
        extractedIds.add(songId);
        
        // Get title
        const title = link.getAttribute('title') || 
                     link.textContent.trim() ||
                     link.querySelector('span')?.textContent.trim() || '';
        
        // Find parent container to get more data
        const container = link.closest('[class*="flex"]')?.parentElement?.parentElement;
        
        let duration = '';
        let imageUrl = '';
        let tags = '';
        
        if (container) {
            // Extract duration
            const durationEl = container.querySelector('.font-mono') ||
                              container.querySelector('div:has(>*)');
            if (durationEl) {
                const text = durationEl.textContent;
                const timeMatch = text.match(/\d+:\d+/);
                if (timeMatch) duration = timeMatch[0];
            }
            
            // Extract image
            const imgEl = container.querySelector('img[src*="suno"]');
            if (imgEl) {
                imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
            }
            
            // Extract tags
            const tagLinks = container.querySelectorAll('a[href*="/style/"]');
            if (tagLinks.length > 0) {
                tags = Array.from(tagLinks).map(t => t.textContent.trim()).join(', ');
            }
        }
        
        songs.push({
            id: songId,
            title: title,
            duration: duration,
            tags: tags,
            url: `https://suno.com/song/${songId}`,
            audio_url: `https://cdn1.suno.ai/${songId}.mp3`,
            image_url: imageUrl
        });
    }
} catch (e) {
    console.error(`Error on link ${index}:`, e);
}

});

console.log(? Extracted ${songs.length} songs!);

if (songs.length === 0) { console.error('? No songs extracted!'); console.error('Debugging info:'); console.error(   Song links found: ${songLinks.length}); console.error(   Page title: ${document.title}); console.error('\nTry:'); console.error(' 1. Make sure main.html or evolves.html is open'); console.error(' 2. Wait for page to fully render'); console.error(' 3. Paste script again'); } else { // Show preview console.log('\n?? First 10 songs:'); songs.slice(0, 10).forEach((s, i) => { console.log(   ${i + 1}. ${s.title} ${s.duration ? '(' + s.duration + ')' : ''}); });

if (songs.length > 10) {
    console.log(`   ... and ${songs.length - 10} more!`);
}

// Create CSV
console.log('\n?? Creating CSV...');

const csv = [
    'id,title,duration,tags,url,audio_url,image_url',
    ...songs.map(s => {
        const title = (s.title || '').replace(/"/g, '""');
        const tags = (s.tags || '').replace(/"/g, '""');
        return `${s.id},"${title}",${s.duration || ''},"${tags}",${s.url},${s.audio_url},${s.image_url || ''}`;
    })
].join('\n');

// Download CSV
console.log('?? Downloading CSV...');

const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;

const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
const filename = `suno-saved-html-${timestamp}.csv`;

a.download = filename;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

console.log('\n' + '='.repeat(70));
console.log('?? EXTRACTION COMPLETE!');
console.log('='.repeat(70));
console.log(`\n   ?? Total songs: ${songs.length}`);
console.log(`   ?? CSV file: ${filename}`);
console.log(`   ?? Location: ~/Downloads/`);
console.log('\n?? Type "extractedSongs" to view data');

// Store globally
window.extractedSongs = songs;

}

songs;

SUNO_ULTIMATE_EXTRACTOR.js - Browser-based (EASIEST!) • Auto-scrolls and extracts from live Suno pages • Outputs CSV + JSON + TXT 2. suno_html_batch_extractor.py - Process saved HTML files • Extracted 510 songs from your 18 HTML files // ?? ULTIMATE SUNO EXTRACTOR - Paste into Browser Console // ========================================================= // ? Auto-scrolls and loads ALL songs // ? Extracts complete data // ? Downloads CSV + JSON + TXT // ? Works on ANY Suno page (library, playlists, profiles) // // USAGE: // 1. Go to: https://suno.com/library OR any playlist/profile // 2. Open Console: Cmd+Option+I (Mac) or F12 (Windows) // 3. Paste this entire script // 4. Press Enter // 5. Wait for completion // 6. Find files in ~/Downloads/

console.log('?? ULTIMATE SUNO EXTRACTOR v2.0'); console.log('?'.repeat(70));

(async function() { // ====== CONFIGURATION ====== const CONFIG = { SCROLL_DELAY: 2000, // ms between scrolls MAX_SCROLLS: 500, // max scrolls (for huge collections) MIN_NO_CHANGE: 5, // scrolls with no new songs before stopping EXTRACT_LYRICS: true, // extract lyrics (slower but complete) EXTRACT_METADATA: true, // extract all metadata };

// ====== STEP 1: AUTO-SCROLL ======
console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');

let scrollCount = 0;
let lastSongCount = 0;
let noChangeCount = 0;

await new Promise((resolve) => {
    const scrollInterval = setInterval(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        
        // Count unique song links
        const songLinks = document.querySelectorAll('a[href*="/song/"]');
        const uniqueIds = new Set();
        songLinks.forEach(link => {
            const match = link.href.match(/\/song\/([a-f0-9-]{36})/);
            if (match) uniqueIds.add(match[1]);
        });
        const songCount = uniqueIds.size;
        
        if (songCount === lastSongCount) {
            noChangeCount++;
            console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
            
            if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
                clearInterval(scrollInterval);
                console.log(`? Loaded ${songCount} songs in ${scrollCount} scrolls`);
                resolve();
            }
        } else {
            noChangeCount = 0;
            scrollCount++;
            const newSongs = songCount - lastSongCount;
            console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${newSongs})`);
            lastSongCount = songCount;
        }
        
        if (scrollCount >= CONFIG.MAX_SCROLLS) {
            clearInterval(scrollInterval);
            console.log(`??  Max scrolls reached`);
            resolve();
        }
    }, CONFIG.SCROLL_DELAY);
});

// ====== STEP 2: EXTRACT SONG DATA ======
console.log('\n?? Step 2/4: Extracting song data...');

const songs = [];
const extractedIds = new Set();

// Find all song containers
const songElements = document.querySelectorAll('a[href*="/song/"]');
console.log(`   Found ${songElements.length} song elements`);

songElements.forEach((element, index) => {
    try {
        // Extract song ID
        const match = element.href.match(/\/song\/([a-f0-9-]{36})/);
        if (!match) return;
        
        const songId = match[1];
        if (extractedIds.has(songId)) return;
        extractedIds.add(songId);
        
        // Find parent container
        const container = element.closest('[class*="song"]') || 
                        element.closest('[class*="clip"]') || 
                        element.closest('div');
        
        // Extract title
        const titleEl = element.querySelector('[title]') || 
                       element.querySelector('[class*="title"]') ||
                       element;
        const title = titleEl?.getAttribute('title') || 
                     titleEl?.textContent?.trim() || 
                     'Untitled';
        
        // Extract duration
        const durationEl = container?.querySelector('[class*="duration"]') ||
                          container?.querySelector('.font-mono') ||
                          container?.querySelector('time');
        const duration = durationEl?.textContent?.trim() || '';
        
        // Extract image
        const imgEl = element.querySelector('img') || 
                     container?.querySelector('img');
        let imageUrl = imgEl?.src || '';
        if (imageUrl) {
            // Get high-res version
            imageUrl = imageUrl.replace('/image_', '/image_large_')
                             .replace('?width=720', '');
        }
        
        // Extract tags/style
        const tagEls = container?.querySelectorAll('a[href*="/style/"]') || [];
        const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);
        
        // Extract author
        const authorEl = container?.querySelector('a[href*="/@"]');
        const author = authorEl?.textContent?.trim() || '';
        const authorLink = authorEl?.href || '';
        
        // Extract plays/likes
        const playEl = container?.querySelector('[title*="play"]') ||
                      container?.querySelector('[class*="play-count"]');
        const plays = playEl?.textContent?.trim() || '';
        
        const likeEl = container?.querySelector('[title*="like"]') ||
                      container?.querySelector('[class*="like"]');
        const likes = likeEl?.textContent?.trim() || '';
        
        // Build song object
        const song = {
            id: songId,
            title: title,
            url: `https://suno.com/song/${songId}`,
            shareUrl: `https://suno.com/s/${songId.split('-')[0]}`,
            audioUrl: `https://cdn1.suno.ai/${songId}.mp3`,
            imageUrl: imageUrl,
            duration: duration,
            tags: tags.join(', '),
            author: author,
            authorLink: authorLink,
            plays: plays,
            likes: likes,
            extractedAt: new Date().toISOString(),
        };
        
        songs.push(song);
        
        if ((index + 1) % 50 === 0) {
            console.log(`   ?? Processed ${index + 1}/${songElements.length}...`);
        }
    } catch (error) {
        console.error(`   ??  Error extracting song ${index}:`, error.message);
    }
});

console.log(`? Extracted ${songs.length} unique songs`);

if (songs.length === 0) {
    console.error('\n? NO SONGS FOUND!');
    console.error('   Make sure you\'re on a Suno page with songs visible');
    return;
}

// ====== STEP 3: CREATE FILES ======
console.log('\n?? Step 3/4: Creating export files...');

const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .slice(0, 19);

// CSV
const csvHeaders = Object.keys(songs[0]);
const csvRows = [
    csvHeaders.join(','),
    ...songs.map(song => 
        csvHeaders.map(key => {
            const value = String(song[key] || '');
            // Escape quotes and wrap in quotes if contains comma
            const escaped = value.replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        }).join(',')
    )
];
const csvContent = csvRows.join('\n');

// JSON
const jsonContent = JSON.stringify(songs, null, 2);

// TXT Summary
const txtContent = [
    '?? SUNO COLLECTION EXPORT',
    '?'.repeat(70),
    `Exported: ${new Date().toLocaleString()}`,
    `Total Songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    '?'.repeat(70),
    '',
    '?? SONGS:',
    '',
    ...songs.map((song, i) => {
        let line = `${(i + 1).toString().padStart(4)}. ${song.title}`;
        if (song.duration) line += ` [${song.duration}]`;
        if (song.author) line += `\n      By: ${song.author}`;
        if (song.tags) line += `\n      Style: ${song.tags}`;
        line += `\n      URL: ${song.url}`;
        line += `\n      Audio: ${song.audioUrl}\n`;
        return line;
    })
].join('\n');

// ====== STEP 4: DOWNLOAD FILES ======
console.log('\n?? Step 4/4: Downloading files...');

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   ? ${filename}`);
}

downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');

// ====== SUMMARY ======
console.log('\n' + '?'.repeat(70));
console.log('?? EXTRACTION COMPLETE!');
console.log('?'.repeat(70));
console.log(`   ?? Total songs: ${songs.length}`);
console.log(`   ?? Files saved to ~/Downloads/:`);
console.log(`      ?? suno-export-${timestamp}.csv`);
console.log(`      ?? suno-export-${timestamp}.json`);
console.log(`      ?? suno-export-${timestamp}.txt`);
console.log('?'.repeat(70));
console.log('\n?? Tips:');
console.log('   ? Type "extractedSongs" to view data in console');
console.log('   ? Type "extractedSongs[0]" to see first song details');
console.log('   ? Type "extractedSongs.length" to see total count');
console.log('\n');

// Show preview
console.log('?? First 5 songs:');
console.table(songs.slice(0, 5).map(s => ({
    Title: s.title,
    Duration: s.duration,
    Author: s.author,
    Tags: s.tags?.slice(0, 30) + (s.tags?.length > 30 ? '...' : '')
})));

// Make data available globally
window.extractedSongs = songs;

})().catch(error => { console.error('\n? ERROR:', error); console.error('Please report this issue with the error message above'); });

// ?? ULTIMATE SUNO EXTRACTOR - Paste into Browser Console // ========================================================= // ? Auto-scrolls and loads ALL songs // ? Extracts complete data // ? Downloads CSV + JSON + TXT // ? Works on ANY Suno page (library, playlists, profiles) // // USAGE: // 1. Go to: https://suno.com/library OR any playlist/profile // 2. Open Console: Cmd+Option+I (Mac) or F12 (Windows) // 3. Paste this entire script // 4. Press Enter // 5. Wait for completion // 6. Find files in ~/Downloads/

console.log('?? ULTIMATE SUNO EXTRACTOR v2.0'); console.log('?'.repeat(70));

(async function() { // ====== CONFIGURATION ====== const CONFIG = { SCROLL_DELAY: 2000, // ms between scrolls MAX_SCROLLS: 500, // max scrolls (for huge collections) MIN_NO_CHANGE: 5, // scrolls with no new songs before stopping EXTRACT_LYRICS: true, // extract lyrics (slower but complete) EXTRACT_METADATA: true, // extract all metadata };

// ====== STEP 1: AUTO-SCROLL ======
console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');

let scrollCount = 0;
let lastSongCount = 0;
let noChangeCount = 0;

await new Promise((resolve) => {
    const scrollInterval = setInterval(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        
        // Count unique song links
        const songLinks = document.querySelectorAll('a[href*="/song/"]');
        const uniqueIds = new Set();
        songLinks.forEach(link => {
            const match = link.href.match(/\/song\/([a-f0-9-]{36})/);
            if (match) uniqueIds.add(match[1]);
        });
        const songCount = uniqueIds.size;
        
        if (songCount === lastSongCount) {
            noChangeCount++;
            console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
            
            if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
                clearInterval(scrollInterval);
                console.log(`? Loaded ${songCount} songs in ${scrollCount} scrolls`);
                resolve();
            }
        } else {
            noChangeCount = 0;
            scrollCount++;
            const newSongs = songCount - lastSongCount;
            console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${newSongs})`);
            lastSongCount = songCount;
        }
        
        if (scrollCount >= CONFIG.MAX_SCROLLS) {
            clearInterval(scrollInterval);
            console.log(`??  Max scrolls reached`);
            resolve();
        }
    }, CONFIG.SCROLL_DELAY);
});

// ====== STEP 2: EXTRACT SONG DATA ======
console.log('\n?? Step 2/4: Extracting song data...');

const songs = [];
const extractedIds = new Set();

// Find all song containers
const songElements = document.querySelectorAll('a[href*="/song/"]');
console.log(`   Found ${songElements.length} song elements`);

songElements.forEach((element, index) => {
    try {
        // Extract song ID
        const match = element.href.match(/\/song\/([a-f0-9-]{36})/);
        if (!match) return;
        
        const songId = match[1];
        if (extractedIds.has(songId)) return;
        extractedIds.add(songId);
        
        // Find parent container
        const container = element.closest('[class*="song"]') || 
                        element.closest('[class*="clip"]') || 
                        element.closest('div');
        
        // Extract title
        const titleEl = element.querySelector('[title]') || 
                       element.querySelector('[class*="title"]') ||
                       element;
        const title = titleEl?.getAttribute('title') || 
                     titleEl?.textContent?.trim() || 
                     'Untitled';
        
        // Extract duration
        const durationEl = container?.querySelector('[class*="duration"]') ||
                          container?.querySelector('.font-mono') ||
                          container?.querySelector('time');
        const duration = durationEl?.textContent?.trim() || '';
        
        // Extract image
        const imgEl = element.querySelector('img') || 
                     container?.querySelector('img');
        let imageUrl = imgEl?.src || '';
        if (imageUrl) {
            // Get high-res version
            imageUrl = imageUrl.replace('/image_', '/image_large_')
                             .replace('?width=720', '');
        }
        
        // Extract tags/style
        const tagEls = container?.querySelectorAll('a[href*="/style/"]') || [];
        const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);
        
        // Extract author
        const authorEl = container?.querySelector('a[href*="/@"]');
        const author = authorEl?.textContent?.trim() || '';
        const authorLink = authorEl?.href || '';
        
        // Extract plays/likes
        const playEl = container?.querySelector('[title*="play"]') ||
                      container?.querySelector('[class*="play-count"]');
        const plays = playEl?.textContent?.trim() || '';
        
        const likeEl = container?.querySelector('[title*="like"]') ||
                      container?.querySelector('[class*="like"]');
        const likes = likeEl?.textContent?.trim() || '';
        
        // Build song object
        const song = {
            id: songId,
            title: title,
            url: `https://suno.com/song/${songId}`,
            shareUrl: `https://suno.com/s/${songId.split('-')[0]}`,
            audioUrl: `https://cdn1.suno.ai/${songId}.mp3`,
            imageUrl: imageUrl,
            duration: duration,
            tags: tags.join(', '),
            author: author,
            authorLink: authorLink,
            plays: plays,
            likes: likes,
            extractedAt: new Date().toISOString(),
        };
        
        songs.push(song);
        
        if ((index + 1) % 50 === 0) {
            console.log(`   ?? Processed ${index + 1}/${songElements.length}...`);
        }
    } catch (error) {
        console.error(`   ??  Error extracting song ${index}:`, error.message);
    }
});

console.log(`? Extracted ${songs.length} unique songs`);

if (songs.length === 0) {
    console.error('\n? NO SONGS FOUND!');
    console.error('   Make sure you\'re on a Suno page with songs visible');
    return;
}

// ====== STEP 3: CREATE FILES ======
console.log('\n?? Step 3/4: Creating export files...');

const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .slice(0, 19);

// CSV
const csvHeaders = Object.keys(songs[0]);
const csvRows = [
    csvHeaders.join(','),
    ...songs.map(song => 
        csvHeaders.map(key => {
            const value = String(song[key] || '');
            // Escape quotes and wrap in quotes if contains comma
            const escaped = value.replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        }).join(',')
    )
];
const csvContent = csvRows.join('\n');

// JSON
const jsonContent = JSON.stringify(songs, null, 2);

// TXT Summary
const txtContent = [
    '?? SUNO COLLECTION EXPORT',
    '?'.repeat(70),
    `Exported: ${new Date().toLocaleString()}`,
    `Total Songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    '?'.repeat(70),
    '',
    '?? SONGS:',
    '',
    ...songs.map((song, i) => {
        let line = `${(i + 1).toString().padStart(4)}. ${song.title}`;
        if (song.duration) line += ` [${song.duration}]`;
        if (song.author) line += `\n      By: ${song.author}`;
        if (song.tags) line += `\n      Style: ${song.tags}`;
        line += `\n      URL: ${song.url}`;
        line += `\n      Audio: ${song.audioUrl}\n`;
        return line;
    })
].join('\n');

// ====== STEP 4: DOWNLOAD FILES ======
console.log('\n?? Step 4/4: Downloading files...');

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   ? ${filename}`);
}

downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');

// ====== SUMMARY ======
console.log('\n' + '?'.repeat(70));
console.log('?? EXTRACTION COMPLETE!');
console.log('?'.repeat(70));
console.log(`   ?? Total songs: ${songs.length}`);
console.log(`   ?? Files saved to ~/Downloads/:`);
console.log(`      ?? suno-export-${timestamp}.csv`);
console.log(`      ?? suno-export-${timestamp}.json`);
console.log(`      ?? suno-export-${timestamp}.txt`);
console.log('?'.repeat(70));
console.log('\n?? Tips:');
console.log('   ? Type "extractedSongs" to view data in console');
console.log('   ? Type "extractedSongs[0]" to see first song details');
console.log('   ? Type "extractedSongs.length" to see total count');
console.log('\n');

// Show preview
console.log('?? First 5 songs:');
console.table(songs.slice(0, 5).map(s => ({
    Title: s.title,
    Duration: s.duration,
    Author: s.author,
    Tags: s.tags?.slice(0, 30) + (s.tags?.length > 30 ? '...' : '')
})));

// Make data available globally
window.extractedSongs = songs;

})().catch(error => { console.error('\n? ERROR:', error); console.error('Please report this issue with the error message above'); }); 7511-c703a0fccf850651.js:18 ?? ULTIMATE SUNO EXTRACTOR v2.0 7511-c703a0fccf850651.js:18 ?????????????????????????????????????????????????????????????????????? 7511-c703a0fccf850651.js:18 ?? Step 1/4: Auto-scrolling to load all songs... Promise {<pending>} 7511-c703a0fccf850651.js:18 ?? Scroll 1: 20 songs (+20) 7511-c703a0fccf850651.js:18 ? Waiting... 1/5 7511-c703a0fccf850651.js:18 ? Waiting... 2/5 7511-c703a0fccf850651.js:18 ? Waiting... 3/5 7511-c703a0fccf850651.js:18 ? Waiting... 4/5 7511-c703a0fccf850651.js:18 ? Waiting... 5/5 7511-c703a0fccf850651.js:18 ? Loaded 20 songs in 1 scrolls 7511-c703a0fccf850651.js:18 ?? Step 2/4: Extracting song data... 7511-c703a0fccf850651.js:18 Found 80 song elements 7511-c703a0fccf850651.js:18 ? Extracted 20 unique songs 7511-c703a0fccf850651.js:18 ?? Step 3/4: Creating export files... 7511-c703a0fccf850651.js:18 ?? Step 4/4: Downloading files... 7511-c703a0fccf850651.js:18 ? suno-export-2025-11-05T05-45-23.csv 7511-c703a0fccf850651.js:18 ? suno-export-2025-11-05T05-45-23.json 7511-c703a0fccf850651.js:18 ? suno-export-2025-11-05T05-45-23.txt 7511-c703a0fccf850651.js:18 ?????????????????????????????????????????????????????????????????????? 7511-c703a0fccf850651.js:18 ?? EXTRACTION COMPLETE! 7511-c703a0fccf850651.js:18 ?????????????????????????????????????????????????????????????????????? 7511-c703a0fccf850651.js:18 ?? Total songs: 20 7511-c703a0fccf850651.js:18 ?? Files saved to ~/Downloads/: 7511-c703a0fccf850651.js:18 ?? suno-export-2025-11-05T05-45-23.csv 7511-c703a0fccf850651.js:18 ?? suno-export-2025-11-05T05-45-23.json 7511-c703a0fccf850651.js:18 ?? suno-export-2025-11-05T05-45-23.txt 7511-c703a0fccf850651.js:18 ?????????????????????????????????????????????????????????????????????? 7511-c703a0fccf850651.js:18 ?? Tips: 7511-c703a0fccf850651.js:18 ? Type "extractedSongs" to view data in console 7511-c703a0fccf850651.js:18 ? Type "extractedSongs[0]" to see first song details 7511-c703a0fccf850651.js:18 ? Type "extractedSongs.length" to see total count 7511-c703a0fccf850651.js:18 7511-c703a0fccf850651.js:18 ?? First 5 songs: VM547:261 (index) Title Duration Author Tags 0 'BackAlley Anthem Raw 204' '' '' '' 1 'BackAlley Anthem Raw216' '' '' '' 2 'BackAlley Anthem120' '' '' '' 3 'BackAlley Anthem114' '' '' '' 4 'Back Alley Anthem (Dumpster Fire Edit)' '' '' '' Array(5) // ULTIMATE SUNO EXTRACTOR v2.1 - EXTRACT LYRICS & SIDE PANEL // Paste this into Console on a Suno page (library / playlist / profile)

(async function() { console.log('?? ULTIMATE SUNO EXTRACTOR v2.1 (lyrics + sidebar)'); console.log('?'.repeat(70));

const CONFIG = { SCROLL_DELAY: 1200, // ms between scrolls MAX_SCROLLS: 500, MIN_NO_CHANGE: 5, EXTRACT_LYRICS: true, // fetch song detail pages to pull lyrics/transcript PER_SONG_DELAY: 350 // ms between detail page fetches };

// ---------- Step 1: auto-scroll to load all songs ---------- console.log('\n?? Step 1/4: Auto-scrolling to load all songs...'); let scrollCount = 0; let lastSongCount = 0; let noChangeCount = 0;

await new Promise((resolve) => { const interval = setInterval(() => { window.scrollTo(0, document.documentElement.scrollHeight); const songLinks = document.querySelectorAll('a[href*="/song/"]'); const unique = new Set(); songLinks.forEach(l => { const m = l.href.match(//song/([a-f0-9-]{36})/); if (m) unique.add(m[1]); }); const songCount = unique.size; if (songCount === lastSongCount) { noChangeCount++; // silent log to avoid huge spam console.log(   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}); if (noChangeCount >= CONFIG.MIN_NO_CHANGE) { clearInterval(interval); console.log(? Loaded ${songCount} songs after ${scrollCount} scroll(s)); resolve(); } } else { noChangeCount = 0; scrollCount++; const added = songCount - lastSongCount; lastSongCount = songCount; console.log(   ?? Scroll ${scrollCount}: ${songCount} songs (+${added})); } if (scrollCount >= CONFIG.MAX_SCROLLS) { clearInterval(interval); console.log('?? Max scrolls reached'); resolve(); } }, CONFIG.SCROLL_DELAY); });

// ---------- Step 2: extract summary list ---------- console.log('\n?? Step 2/4: Extracting basic song objects from page DOM...'); const songs = []; const seen = new Set(); const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'));

anchorEls.forEach((el, idx) => { try { const match = el.href.match(//song/([a-f0-9-]{36})/); if (!match) return; const id = match[1]; if (seen.has(id)) return; seen.add(id);

  // find a sensible container nearby
  const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;

  // title
  const titleEl = el.querySelector('[title]') || el.querySelector('[class*="title"]') || el;
  const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim() || 'Untitled';

  // duration
  const durationEl = container?.querySelector('[class*="duration"], .font-mono, time, span[title*=":"], span[class*="font-mono"]');
  const duration = durationEl?.textContent?.trim() || '';

  // image
  const imgEl = el.querySelector('img') || container?.querySelector('img');
  let imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
  if (imageUrl) {
    imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720','');
  }

  // tags (styles)
  const tagEls = container?.querySelectorAll('a[href*="/style/"], div[title] > span') || [];
  const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean);

  // author
  const authorA = container?.querySelector('a[href^="/@"]') || document.querySelector('a[href^="/@"]');
  const author = authorA?.textContent?.trim() || '';
  const authorLink = authorA?.href || '';

  // plays / likes (best-effort)
  const playEl = container?.querySelector('[title*="play"], [class*="play-count"]');
  const plays = playEl?.textContent?.trim() || '';
  const likeEl = container?.querySelector('[title*="like"], [class*="like"]');
  const likes = likeEl?.textContent?.trim() || '';

  songs.push({
    id, title, url: `https://suno.com/song/${id}`, imageUrl, duration,
    tags: tags.join(', '), author, authorLink, plays, likes,
    extractedAt: new Date().toISOString()
  });
} catch (err) {
  console.warn('extract error', err);
}

});

console.log(? Found ${songs.length} unique songs on page);

if (songs.length === 0) { console.error('No songs found — make sure you are on a Suno page with songs visible.'); return; }

// ---------- Step 3: fetch per-song detail page and parse lyrics/sidebar ---------- if (CONFIG.EXTRACT_LYRICS) { console.log('\n?? Step 3/4: Fetching each song page for lyrics & sidebar info (this may take a while)...'); for (let i = 0; i < songs.length; i++) { const s = songs[i]; try { // polite delay await new Promise(r => setTimeout(r, CONFIG.PER_SONG_DELAY));

    const detailUrl = `/song/${s.id}`;
    const res = await fetch(detailUrl, { credentials: 'same-origin' });
    if (!res.ok) {
      console.warn(`   ! Failed to fetch ${detailUrl} (status ${res.status})`);
      continue;
    }
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1) lyrics / transcript: observed in your snippet as .whitespace-pre-wrap
    let lyricsEl = doc.querySelector('.whitespace-pre-wrap') ||
                   doc.querySelector('[data-testid="lyrics"]') ||
                   Array.from(doc.querySelectorAll('pre, p, span'))
                     .find(el => /\[Verse|\[Chorus|\[Intro|When the/.test(el.textContent || ''));

    const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';

    // 2) sidebar summary / description / date
    let summaryEl = doc.querySelector('.mt-1.cursor-pointer') || doc.querySelector('[title*="Show Summary"]');
    let summary = '';
    if (!summaryEl) {
      // fallback: meta description or og:description
      summary = (doc.querySelector('meta[name="description"]')?.content ||
                 doc.querySelector('meta[property="og:description"]')?.content || '').trim();
    } else {
      summary = summaryEl.textContent?.trim() || '';
    }

    // 3) author & tags (fallbacks)
    const authorAnchor = doc.querySelector('a[href^="/@"]');
    const authorName = authorAnchor?.textContent?.trim() || s.author || '';
    const tagNodes = doc.querySelectorAll('div[title] span') || doc.querySelectorAll('.gap-2 span');
    const extractedTags = Array.from(tagNodes).map(n => n.textContent?.trim()).filter(Boolean);
    const tagsJoined = extractedTags.length ? extractedTags.join(', ') : s.tags || '';

    // 4) audio src (if present)
    const audioEl = doc.querySelector('audio[src]') || doc.querySelector('meta[property="og:audio"]');
    let audioUrl = '';
    if (audioEl) {
      audioUrl = audioEl.src || audioEl.content || '';
    } else {
      // fallback pattern
      audioUrl = `https://cdn1.suno.ai/${s.id}.mp3`;
    }

    // attach to song object
    s.lyrics = lyrics;
    s.sidebarSummary = summary;
    s.detailAuthor = authorName;
    s.detailTags = tagsJoined;
    s.detailAudio = audioUrl;

    console.log(`   ✅ [${i+1}/${songs.length}] ${s.title} — lyrics ${lyrics ? 'found' : 'NOT found'}`);
  } catch (err) {
    console.warn(`   ! Error fetching/parsing ${s.url}:`, err);
  }
}

} else { console.log('?? EXTRACT_LYRICS disabled — skipping detail fetches'); }

// ---------- Step 4: prepare and download CSV / JSON / TXT ---------- console.log('\n?? Step 4/4: creating download files...'); const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

// ensure stable keys and consistent columns const fields = [ 'id','title','url','imageUrl','duration','tags','author','authorLink','plays','likes', 'detailAuthor','detailTags','detailAudio','sidebarSummary','lyrics','extractedAt' ];

// CSV const csvRows = [ fields.join(',') ]; songs.forEach(s => { const row = fields.map(k => { const v = String(s[k] || '').replace(/"/g,'""'); return v.includes(',') || v.includes('\n') ? "${v}" : v; }).join(','); csvRows.push(row); }); const csvContent = csvRows.join('\n');

// JSON const jsonContent = JSON.stringify(songs, null, 2);

// TXT summary const txtLines = [ '?? SUNO COLLECTION EXPORT (with lyrics & sidebar)', '?'.repeat(70), Exported: ${new Date().toLocaleString()}, Total Songs: ${songs.length}, Source: ${window.location.href}, '?'.repeat(70), '' ]; songs.forEach((s, i) => { txtLines.push(${String(i+1).padStart(3)}. ${s.title} ${s.duration ? '['+s.duration+']':''}); if (s.author) txtLines.push(     By: ${s.author}); if (s.detailAuthor && s.detailAuthor !== s.author) txtLines.push(     Detail Author: ${s.detailAuthor}); if (s.tags) txtLines.push(     Tags: ${s.tags}); if (s.detailTags && s.detailTags !== s.tags) txtLines.push(     Detail Tags: ${s.detailTags}); if (s.sidebarSummary) txtLines.push(     Summary: ${s.sidebarSummary.slice(0,200)}${s.sidebarSummary.length>200?'...':''}); if (s.lyrics) txtLines.push(     Lyrics:\n${s.lyrics.slice(0,800)}${s.lyrics.length>800?'...':''}); if (s.detailAudio) txtLines.push(     Audio: ${s.detailAudio}); txtLines.push(     URL: ${s.url}); txtLines.push(''); }); const txtContent = txtLines.join('\n');

function downloadFile(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); console.log(   ? ${filename}); }

downloadFile(csvContent, suno-export-${timestamp}.csv, 'text/csv'); downloadFile(jsonContent, suno-export-${timestamp}.json, 'application/json'); downloadFile(txtContent, suno-export-${timestamp}.txt, 'text/plain');

window.extractedSongs = songs;

console.log('\n' + '?'.repeat(70)); console.log('?? EXTRACTION COMPLETE!'); console.log('?'.repeat(70)); console.log(   ?? Total songs: ${songs.length}); console.log(' ?? Files saved to ~/Downloads/'); console.table(songs.slice(0,10).map(s => ({Title: s.title, Duration: s.duration, Author: s.author, HasLyrics: !!s.lyrics}))); })();

// ULTIMATE SUNO EXTRACTOR v2.2 - CLICK & SCRAPE SIDE PANEL (resume, retries) // Paste into Console on a Suno page (library / playlist / profile)

(async function() { console.log('🎛️ ULTIMATE SUNO EXTRACTOR v2.2 — Click & Scrape Side Panel'); console.log('-'.repeat(70));

// ---------- CONFIG ---------- const CONFIG = { SCROLL_DELAY: 900, // ms between auto-scroll steps MAX_SCROLLS: 1000, MIN_NO_CHANGE: 4, CLICK_DELAY: 450, // ms after clicking a row before polling for panel PER_SONG_DELAY: 300, // ms delay between each scraped song to avoid stress PANEL_TIMEOUT: 8000, // ms to wait for side panel content to appear RETRIES: 2, // number of retries if panel fails RESUME_KEY: 'suno_extractor_v2_progress', // sessionStorage key for resume SELECTORS: { // possible selectors for side-panel lyrics and summary (fallback chain) PANEL_CONTAINER: '.chakra-portal, [data-testid="song-detail"], .song-panel, aside', LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre', SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary', AUTHOR: 'a[href^="/@"]', TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span', AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]' } };

// ---------- helpers ---------- function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

async function waitFor(conditionFn, timeout = 6000, interval = 200) { const start = Date.now(); while (Date.now() - start < timeout) { try { const res = conditionFn(); if (res) return res; } catch (e) { /* ignore */ } await wait(interval); } return null; }

function downloadFile(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); console.log(✅ Saved: ${filename}); }

function toCSV(rows, headers) { const lines = []; lines.push(headers.join(',')); for (const r of rows) { const line = headers.map(h => { const v = String(r[h] ?? '').replace(/"/g, '""'); return (v.includes(',') || v.includes('\n')) ? "${v}" : v; }).join(','); lines.push(line); } return lines.join('\n'); }

// ---------- Step 1: auto-scroll to load all songs ---------- console.log('▶ Step 1: Auto-scrolling to load all songs...'); let scrollCount = 0, lastCount = 0, noChange = 0; await new Promise((resolve) => { const interval = setInterval(() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); const anchors = document.querySelectorAll('a[href*="/song/"]'); const unique = new Set(Array.from(anchors).map(a => (a.href.match(//song/([a-f0-9-]{36})/)||[])[1]).filter(Boolean)); const count = unique.size; if (count === lastCount) { noChange++; console.log(   waiting... ${noChange}/${CONFIG.MIN_NO_CHANGE}); if (noChange >= CONFIG.MIN_NO_CHANGE) { clearInterval(interval); console.log(   loaded ${count} songs after ${scrollCount} scroll(s)); resolve(); } } else { noChange = 0; scrollCount++; console.log(   scroll ${scrollCount}: ${count} songs (+${count - lastCount})); lastCount = count; } if (scrollCount >= CONFIG.MAX_SCROLLS) { clearInterval(interval); console.warn(' max scrolls reached'); resolve(); } }, CONFIG.SCROLL_DELAY); });

// ---------- Step 2: collect anchors ---------- console.log('▶ Step 2: Collecting song anchors...'); const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]')) .map(a => ({ el: a, href: a.href })) .filter((v,i,self) => self.findIndex(x => x.href===v.href)===i); // Map ids const songsToProcess = anchors.map(a => { const m = a.href.match(//song/([a-f0-9-]{36})/); return { id: m ? m[1] : null, el: a.el, href: a.href }; }).filter(x => x.id); console.log(   found ${songsToProcess.length} unique song anchors);

// Load progress/resume const saved = sessionStorage.getItem(CONFIG.RESUME_KEY); const progress = saved ? JSON.parse(saved) : { processed: {} }; console.log(   processed so far: ${Object.keys(progress.processed).length});

// ---------- Step 3: click each row, scrape side panel ---------- console.log('▶ Step 3: Scrape each song by clicking rows (this may take a while)'); const extracted = []; for (let idx = 0; idx < songsToProcess.length; idx++) { const { id, el, href } = songsToProcess[idx]; if (progress.processed[id]) { // already done extracted.push(progress.processed[id]); console.log(   ↳ [${idx+1}/${songsToProcess.length}] SKIP ${id} (already processed)); continue; }

let attempt = 0, success = false, lastError = null;
while (attempt <= CONFIG.RETRIES && !success) {
  attempt++;
  try {
    // Scroll row into view & click
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await wait(120);
    el.click();
    await wait(CONFIG.CLICK_DELAY);

    // Wait for PANEL container or LYRICS selector
    const panel = await waitFor(() => {
      return document.querySelector(CONFIG.SELECTORS.PANEL_CONTAINER);
    }, CONFIG.PANEL_TIMEOUT, 200);

    if (!panel) {
      throw new Error('Panel did not appear');
    }

    // Try to find lyrics and summary inside the panel
    const lyricsEl = panel.querySelector(CONFIG.SELECTORS.LYRICS) ||
                     panel.querySelector('div[role="document"] pre, div[role="document"] p, div[role="document"] span');

    const summaryEl = panel.querySelector(CONFIG.SELECTORS.SUMMARY) ||
                      panel.querySelector('.description, .summary, [data-testid="summary"]');

    const authorEl = panel.querySelector(CONFIG.SELECTORS.AUTHOR) || document.querySelector(CONFIG.SELECTORS.AUTHOR);
    const tagEls = panel.querySelectorAll(CONFIG.SELECTORS.TAGS) || [];

    // audio (in-panel) fallback
    const audioNode = panel.querySelector(CONFIG.SELECTORS.AUDIO_META) || document.querySelector(CONFIG.SELECTORS.AUDIO_META);
    let audioSrc = '';
    if (audioNode) {
      audioSrc = audioNode.src || audioNode.content || audioNode.getAttribute('src') || '';
    }

    // Title: panel header or anchor text
    const titleFromPanel = panel.querySelector('h1, h2, [data-testid="song-title"], .song-title, .chakra-heading')?.textContent?.trim();
    const titleFromAnchor = el.querySelector('[title]')?.getAttribute('title') || el.textContent?.trim();
    const title = titleFromPanel || titleFromAnchor || '';

    const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';
    const summary = summaryEl ? (summaryEl.textContent || '').trim() : '';
    const author = authorEl ? (authorEl.textContent || '').trim() : '';
    const tags = Array.from(tagEls).map(n => (n.textContent||'').trim()).filter(Boolean).join(', ');

    // duration and image from anchor's container (best-effort)
    const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
    const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
    const img = container?.querySelector('img')?.src || '';
    const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

    // Save song object
    const songObj = {
      id, href, title, author, tags, duration, imageUrl,
      summary, lyrics, audio: audioSrc,
      scrapedAt: new Date().toISOString()
    };
    extracted.push(songObj);
    progress.processed[id] = songObj;
    sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));

    // Close the panel: try close button, overlay, or Escape
    let closed = false;
    const closeBtn = document.querySelector('button[aria-label="Close"], button[title="Close"], button[class*="close"], [data-testid="close-button"]');
    if (closeBtn) {
      closeBtn.click();
      closed = true;
    } else {
      // click overlay if present
      const overlay = document.querySelector('.chakra-portal ~ div, .modal-backdrop, .overlay');
      if (overlay) {
        overlay.click();
        closed = true;
      }
    }
    if (!closed) {
      // fallback: press Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }

    // small pause for DOM to settle
    await wait(CONFIG.PER_SONG_DELAY);
    console.log(`   ✅ [${idx+1}/${songsToProcess.length}] ${title || id} — lyrics ${lyrics ? 'FOUND' : 'NO LYRICS'}`);
    success = true;
  } catch (err) {
    lastError = err;
    console.warn(`   ! [${idx+1}] attempt ${attempt} failed: ${err.message}`);
    // try to close any dangling panels and continue retry
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
    await wait(600 + attempt * 200);
  }
} // retries

if (!success) {
  console.error(`   ✖ [${idx+1}] FAILED to scrape ${id}:`, lastError?.message || lastError);
  // still mark as failed so resume won't loop infinitely
  progress.processed[id] = { id, href, error: String(lastError || 'unknown'), scrapedAt: new Date().toISOString() };
  sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
  extracted.push(progress.processed[id]);
}

} // for each song

// ---------- Step 4: Export ---------- console.log('▶ Step 4: Exporting results...'); const all = extracted; const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error']; const csv = toCSV(all, headers); downloadFile(csv, suno-click-extract-${ts}.csv, 'text/csv'); downloadFile(JSON.stringify(all, null, 2), suno-click-extract-${ts}.json, 'application/json');

// TXT summary const txt = [ Suno Click Extract - ${new Date().toLocaleString()}, Total: ${all.length}, '', ...all.map((s,i)=> { const lines = []; lines.push(${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration ? '['+s.duration+']': ''}); if (s.author) lines.push(     Author: ${s.author}); if (s.tags) lines.push(     Tags: ${s.tags}); if (s.summary) lines.push(     Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}); if (s.lyrics) lines.push(     Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}); if (s.audio) lines.push(     Audio: ${s.audio}); lines.push(     URL: ${s.href}); lines.push(''); return lines.join('\n'); }) ].join('\n'); downloadFile(txt, suno-click-extract-${ts}.txt, 'text/plain');

// make available for inspection window.extractedSongs = all; console.log('🎉 Extraction complete — check ~/Downloads/ for files and use window.extractedSongs to inspect data.'); console.log('-'.repeat(70));

})();

// ULTIMATE SUNO EXTRACTOR v2.3 - CLICK + OBSERVER + FETCH FALLBACK + AUTOSAVE // Paste into Console on a Suno page (library / playlist / profile)

(async function() { console.log('🛠️ ULTIMATE SUNO EXTRACTOR v2.3 — resilient click + observer + fallback'); console.log('-'.repeat(70));

// CONFIG const C = { SCROLL_DELAY: 900, MIN_NO_CHANGE: 4, MAX_SCROLLS: 1000, CLICK_DELAY: 350, PANEL_WAIT: 9000, PER_SONG_DELAY: 350, RETRIES: 2, RESUME_KEY: 'suno_extractor_v2_progress', SAVE_INTERVAL: 10, // autosave every N songs SELECTORS: { ANCHOR: 'a[href*="/song/"]', PANEL_CANDIDATES: '.chakra-portal, [data-testid="song-detail"], aside, .song-panel, [role="dialog"]', LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre', SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary', AUTHOR: 'a[href^="/@"]', TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span', AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]', PANEL_CLOSE: 'button[aria-label="Close"], button[title="Close"], [data-testid="close-button"], button[class*="close"]' } };

// util const wait = ms => new Promise(r=>setTimeout(r, ms)); function now(){ return new Date().toISOString(); }

function downloadFile(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); console.log(✅ Saved: ${filename}); } function toCSV(rows, headers) { const lines = [headers.join(',')]; for (const r of rows) { lines.push(headers.map(h=>{ const v = String(r[h]??'').replace(/"/g,'""'); return (v.includes(',')||v.includes('\n')) ? "${v}" : v; }).join(',')); } return lines.join('\n'); }

// auto-scroll to load all songs console.log('▶ Step 1: Auto-scrolling to load songs...'); let scrollCount = 0, lastCount = 0, noChange = 0; await new Promise(resolve => { const iv = setInterval(()=>{ window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); const anchors = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR)); const unique = new Set(anchors.map(a => (a.href.match(//song/([a-f0-9-]{36})/)||[])[1]).filter(Boolean)); const count = unique.size; if (count === lastCount) { noChange++; console.log(   waiting... ${noChange}/${C.MIN_NO_CHANGE}); if (noChange >= C.MIN_NO_CHANGE) { clearInterval(iv); console.log(   loaded ${count} songs after ${scrollCount} scroll(s)); resolve(); } } else { noChange = 0; scrollCount++; console.log(   scroll ${scrollCount}: ${count} songs (+${count-lastCount})); lastCount = count; } if (scrollCount >= C.MAX_SCROLLS) { clearInterval(iv); console.warn(' max scrolls reached'); resolve(); } }, C.SCROLL_DELAY); });

// collect anchors (unique) console.log('▶ Step 2: Collect anchors...'); const anchorsRaw = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR)); const anchors = anchorsRaw.map(a=>({el:a, href:a.href})).filter((v,i,self)=> self.findIndex(x=>x.href===v.href)===i); const items = anchors.map(a=>{ const m = a.href.match(//song/([a-f0-9-]{36})/); return { id: m?m[1]:null, el: a.el, href: a.href }; }).filter(x=>x.id); console.log(   found ${items.length} unique song anchors);

// resume const saved = sessionStorage.getItem(C.RESUME_KEY); const progress = saved ? JSON.parse(saved) : { processed: {} }; console.log(   previously processed: ${Object.keys(progress.processed).length});

// MutationObserver helper to detect panel appearance function observePanel(timeout = C.PANEL_WAIT) { return new Promise((resolve) => { let timer = null; const observer = new MutationObserver((mutations) => { const panel = document.querySelector(C.SELECTORS.PANEL_CANDIDATES); if (panel) { clearTimeout(timer); observer.disconnect(); resolve(panel); } }); observer.observe(document.documentElement, { childList: true, subtree: true }); // also immediate check const immediate = document.querySelector(C.SELECTORS.PANEL_CANDIDATES); if (immediate) { observer.disconnect(); resolve(immediate); return; } timer = setTimeout(()=>{ observer.disconnect(); resolve(null); }, timeout); }); }

// robust click strategies function syntheticClick(el) { try { el.scrollIntoView({block:'center', inline:'center'}); // try native click el.click(); return true; } catch(e) {} // try pointer events at element center try { const rect = el.getBoundingClientRect(); const cx = rect.left + rect.width/2; const cy = rect.top + rect.height/2; ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(name=>{ el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerType: 'mouse'})); }); return true; } catch(e){} // try finding a clickable child try { const clickable = el.querySelector('button, [role="button"], svg, img') || el; clickable.click(); return true; } catch(e){} return false; }

// fetch fallback (parses HTML) async function fetchDetailParse(id) { try { const url = /song/${id}; const res = await fetch(url, { credentials: 'same-origin' }); if (!res.ok) throw new Error('fetch failed '+res.status); const html = await res.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const lyrics = (doc.querySelector(C.SELECTORS.LYRICS)?.textContent || '').trim(); const summary = (doc.querySelector(C.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim(); const author = (doc.querySelector(C.SELECTORS.AUTHOR)?.textContent || '').trim(); const tags = Array.from(doc.querySelectorAll(C.SELECTORS.TAGS)).map(n=>n.textContent.trim()).filter(Boolean).join(', '); const audioNode = doc.querySelector(C.SELECTORS.AUDIO_META); const audio = audioNode?.src || audioNode?.content || ''; return { lyrics, summary, author, tags, audio }; } catch(e) { console.warn(' fetch-detail failed for', id, e.message); return {}; } }

// extraction loop console.log('▶ Step 3: Scrape items (click + observer, with fetch fallback)'); const results = []; for (let idx=0; idx<items.length; idx++) { const {id, el, href} = items[idx]; if (progress.processed[id]) { results.push(progress.processed[id]); console.log(   ↳ [${idx+1}/${items.length}] SKIP ${id}); continue; } let ok=false, attempt=0, lastErr=null; while (attempt <= C.RETRIES && !ok) { attempt++; try { // scroll & click via synthetic strategies syntheticClick(el); await wait(C.CLICK_DELAY);

    // observe panel
    const panel = await observePanel(C.PANEL_WAIT);
    let lyrics='', summary='', author='', tags='', audio='';

    if (panel) {
      // try to extract from panel (multiple fallbacks)
      const lyricNode = panel.querySelector(C.SELECTORS.LYRICS) || panel.querySelector('div[role="document"] pre, div[role="document"] p');
      const summaryNode = panel.querySelector(C.SELECTORS.SUMMARY) || panel.querySelector('.description, .summary');
      const authorNode = panel.querySelector(C.SELECTORS.AUTHOR) || document.querySelector(C.SELECTORS.AUTHOR);
      const tagNodes = panel.querySelectorAll(C.SELECTORS.TAGS) || [];
      const audioNode = panel.querySelector(C.SELECTORS.AUDIO_META) || document.querySelector(C.SELECTORS.AUDIO_META);

      lyrics = lyricNode ? (lyricNode.textContent||'').trim() : '';
      summary = summaryNode ? (summaryNode.textContent||'').trim() : '';
      author = authorNode ? (authorNode.textContent||'').trim() : '';
      tags = Array.from(tagNodes).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      audio = audioNode ? (audioNode.src || audioNode.content || '') : '';
    } else {
      // fallback: fetch & parse
      const parsed = await fetchDetailParse(id);
      lyrics = parsed.lyrics || '';
      summary = parsed.summary || '';
      author = parsed.author || '';
      tags = parsed.tags || '';
      audio = parsed.audio || '';
    }

    // get title/duration/image best-effort from anchor container
    const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
    const title = (container?.querySelector('h3, h2, [title], [data-testid="song-title"]')?.textContent || el.getAttribute('title') || el.textContent || '').trim();
    const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
    const img = container?.querySelector('img')?.src || '';
    const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

    const songObj = { id, href, title, author, tags, duration, imageUrl, audio, summary, lyrics, scrapedAt: now() };
    results.push(songObj);
    progress.processed[id] = songObj;
    sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
    ok = true;

    // close panel (try close button or press Escape)
    const closeBtn = document.querySelector(C.SELECTORS.PANEL_CLOSE);
    if (closeBtn) closeBtn.click();
    else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));

    console.log(`   ✅ [${idx+1}/${items.length}] ${title || id} — lyrics ${lyrics? 'FOUND':'NO'}`);
    await wait(C.PER_SONG_DELAY);
  } catch (err) {
    lastErr = err;
    console.warn(`   ! [${idx+1}] attempt ${attempt} error:`, err.message || err);
    // try to close anything and wait before retry
    try { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); } catch(e){}
    await wait(500 + attempt*200);
  }
} // attempts

if (!ok) {
  console.error(`   ✖ [${idx+1}] FAILED ${id} — marking error`);
  const failObj = { id, href, error: String(lastErr || 'unknown'), scrapedAt: now() };
  results.push(failObj);
  progress.processed[id] = failObj;
  sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
}

// autosave periodically
if ((idx+1) % C.SAVE_INTERVAL === 0) {
  console.log(`   ⏺ Autosave at ${idx+1} items`);
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const rows = Object.values(progress.processed);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
  try {
    downloadFile(toCSV(rows, headers), `suno-partial-${ts}.csv`, 'text/csv');
    downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${ts}.json`, 'application/json');
  } catch(e){ console.warn('autosave failed', e); }
}

} // for

// final export console.log('▶ Step 4: Final export'); const all = Object.values(progress.processed); const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error']; try { downloadFile(toCSV(all, headers), suno-extract-${ts}.csv, 'text/csv'); downloadFile(JSON.stringify(all, null, 2), suno-extract-${ts}.json, 'application/json'); // TXT summary const txt = ['Suno Extract', Exported: ${new Date().toLocaleString()}, Total: ${all.length}, ''].concat( all.map((s,i)=>{ const L = []; L.push(${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration? '['+s.duration+']':''}); if (s.author) L.push(    Author: ${s.author}); if (s.tags) L.push(    Tags: ${s.tags}); if (s.summary) L.push(    Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}); if (s.lyrics) L.push(    Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}); if (s.audio) L.push(    Audio: ${s.audio}); L.push(    URL: ${s.href}); return L.join('\n'); }) ).join('\n\n'); downloadFile(txt, suno-extract-${ts}.txt, 'text/plain'); } catch(e){ console.error('final export failed', e); }

window.extractedSongs = all; console.log('🎉 Extraction complete. Use window.extractedSongs to inspect data. Session progress saved to sessionStorage.'); console.log('-'.repeat(70)); })().catch(e=>console.error('Fatal error:', e));

// ULTIMATE SUNO EXTRACTOR v2.2 -- Simulate open + extract sidebar (paste into Console) (async function() { console.log('🔭 ULTIMATE SUNO EXTRACTOR v2.2 (click-to-open sidebar)'); const CFG = { SCROLL_DELAY: 900, MAX_SCROLLS: 400, MIN_NO_CHANGE: 4, PER_SONG_WAIT: 900, // wait after opening sidebar for DOM to populate CLOSE_WAIT: 250, PER_SONG_DELAY: 200, // polite delay between songs EXTRACT_LYRICS: true, };

// helper wait const wait = ms => new Promise(r => setTimeout(r, ms));

// smart selector waiter async function waitForAny(parent = document, selectors = [], timeout = 2500) { const start = Date.now(); while (Date.now() - start < timeout) { for (const sel of selectors) { const el = parent.querySelector(sel); if (el) return el; } await wait(150); } return null; }

// Step 1 - autoscroll to load items console.log('➡️ Step 1: autoscroll to load songs...'); let lastCount=0, noChange=0, scrolls=0; await new Promise(resolve => { const intv = setInterval(() => { window.scrollTo(0, document.documentElement.scrollHeight); const anchors = document.querySelectorAll('a[href*="/song/"]'); // count unique ids const ids = new Set(Array.from(anchors).map(a => (a.href.match(//song/([a-f0-9-]{36})/)||[])[1]).filter(Boolean)); const count = ids.size; if (count === lastCount) { noChange++; if (noChange >= CFG.MIN_NO_CHANGE || scrolls >= CFG.MAX_SCROLLS) { clearInterval(intv); console.log(   ✅ Loaded ≈ ${count} songs (scrolls: ${scrolls})); resolve(); } } else { noChange = 0; scrolls++; lastCount = count; console.log(   🔁 scroll ${scrolls}: ${count} songs); } }, CFG.SCROLL_DELAY); });

// Step 2 - collect anchors console.log('➡️ Step 2: collecting song anchors...'); const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]')) .map(a => ({ el: a, id: (a.href.match(//song/([a-f0-9-]{36})/)||[])[1] })) .filter(x => x.id); console.log(   ✅ Found ${anchors.length} anchors);

if (!anchors.length) { console.error('No song anchors found — make sure you are on a Suno list page.'); return; }

// utilities to open & close side panel safely async function openViaClick(anchorEl) { try { // Try focused pointer events to mimic real user ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(type=>{ anchorEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); }); // give client time to open panel await wait(120); return true; } catch(e) { return false; } }

async function closePanel() { // try Escape document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); // try clicking any close button const btn = document.querySelector('button[aria-label*="Close"], button[aria-label*="close"], button[title*="Close"]'); if (btn) btn.click(); await wait(CFG.CLOSE_WAIT); }

// Step 3 - iterate and extract console.log('➡️ Step 3: extracting per-song detail (this will take a bit)...'); const songs = []; for (let i=0;i<anchors.length;i++) { const {el, id} = anchors[i]; try { // skip duplicates if (songs.find(s=>s.id===id)) continue;

  // open sidebar via click simulation
  let opened = await openViaClick(el);
  // wait for sidebar content DOM nodes that Suno typically uses (several fallbacks)
  const sidebarSelectors = [
    '.whitespace-pre-wrap',            // lyrics area
    '[data-testid="lyrics"]',          // test id
    '.song-sidebar',                   // hypothetical custom wrapper
    'div[role="dialog"] .whitespace-pre-wrap',
    '.mt-1.cursor-pointer',            // summary area seen in some markup
    'main .whitespace-pre-wrap'
  ];
  const sidebarEl = await waitForAny(document, sidebarSelectors, CFG.PER_SONG_WAIT);

  // If sidebar not visible, fallback: try fetching server page (v2.1 style)
  let lyrics = '', summary = '', author = '', audioUrl = '';
  if (sidebarEl) {
    // fetch content from the live DOM
    // lyrics
    const lySel = sidebarSelectors.join(',');
    const lyNode = document.querySelector(lySel);
    lyrics = lyNode ? (lyNode.textContent || '').trim() : '';

    // summary - several places
    const sumNode = document.querySelector('.mt-1.cursor-pointer') ||
                    document.querySelector('[data-testid="summary"]') ||
                    document.querySelector('meta[property="og:description"]') ||
                    null;
    summary = sumNode ? (sumNode.textContent || sumNode.content || '').trim() : '';

    // audio url - check audio element in page (sometimes injected)
    const audioEl = document.querySelector('audio[src]') || document.querySelector('audio');
    audioUrl = audioEl ? (audioEl.src || audioEl.getAttribute('src') || '') : `https://cdn1.suno.ai/${id}.mp3`;

    // author - sidebar or main page
    const authEl = document.querySelector('a[href^="/@"]') || document.querySelector('.author') || null;
    author = authEl ? (authEl.textContent || '').trim() : '';

    // keep the side-panel open long enough (optional)
    await wait(120);
  } else {
    // fallback: fetch detail URL (server HTML). Might miss client-inserted lyrics — but it often returns metadata.
    try {
      const res = await fetch(`/song/${id}`, { credentials: 'same-origin' });
      if (res.ok) {
        const html = await res.text();
        // quick parse
        const p = new DOMParser();
        const d = p.parseFromString(html, 'text/html');
        const textLy = d.querySelector('.whitespace-pre-wrap') || d.querySelector('[data-testid="lyrics"]') || d.querySelector('pre, p');
        lyrics = textLy ? (textLy.textContent || '').trim() : '';
        const metaDesc = d.querySelector('meta[property="og:description"]') || d.querySelector('meta[name="description"]');
        summary = metaDesc ? (metaDesc.content || '').trim() : '';
        const audioEl = d.querySelector('audio[src]') || d.querySelector('meta[property="og:audio"]');
        audioUrl = audioEl ? (audioEl.src || audioEl.content || `https://cdn1.suno.ai/${id}.mp3`) : `https://cdn1.suno.ai/${id}.mp3`;
      } else {
        audioUrl = `https://cdn1.suno.ai/${id}.mp3`;
      }
    } catch (err) {
      // final fallback
      audioUrl = `https://cdn1.suno.ai/${id}.mp3`;
    }
  }

  // find title/thumbnail/duration from the anchor/container
  const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
  const titleEl = el.querySelector('[title]') || el.querySelector('[class*="title"]') || el;
  const title = (titleEl?.getAttribute?.('title') || titleEl?.textContent || '').trim() || 'Untitled';
  const imgEl = el.querySelector('img') || container?.querySelector('img');
  let imageUrl = imgEl?.src || imgEl?.getAttribute?.('data-src') || '';
  if (imageUrl) imageUrl = imageUrl.replace('/image_','/image_large_').replace('?width=720','');
  const durationEl = container?.querySelector('[class*="duration"], time, .font-mono, span[title*=":"]');
  const duration = durationEl?.textContent?.trim() || '';

  // tags & author link
  const tagEls = container?.querySelectorAll('a[href*="/style/"], div[title] span') || [];
  const tags = Array.from(tagEls).map(t=>t.textContent?.trim()).filter(Boolean).join(', ');
  const authorAnchor = container?.querySelector('a[href^="/@"]') || document.querySelector('a[href^="/@"]');
  const authorLink = authorAnchor?.href || '';

  const songObj = {
    id, title, url: `https://suno.com/song/${id}`, imageUrl, duration, tags,
    author: author || (authorAnchor?.textContent || '').trim() || '',
    authorLink, plays:'', likes:'', detailAudio: audioUrl, sidebarSummary: summary, lyrics,
    extractedAt: new Date().toISOString()
  };

  songs.push(songObj);
  console.log(`   ✅ [${i+1}/${anchors.length}] ${title} (${id}) — lyrics ${lyrics? 'found':'NOT found (fallback maybe)'} `);

  // close the panel before moving on
  await closePanel();
  await wait(CFG.PER_SONG_DELAY);
} catch (err) {
  console.warn(`   ⚠️ Error on song ${i+1}:`, err);
  try { await closePanel(); } catch(e) {}
}

}

// Step 4 - prepare files and download (CSV / JSON / TXT) console.log('➡️ Step 4: packaging files...'); if (!songs.length) { console.error('No songs extracted.'); return; }

const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); const fields = Object.keys(songs[0]); const csv = [fields.join(',')].concat(songs.map(s => fields.map(k => { const v = String(s[k] || '').replace(/"/g,'""'); return v.includes(',') || v.includes('\n') ? "${v}" : v; }).join(','))).join('\n'); const json = JSON.stringify(songs, null, 2);

const txtLines = ['🔸 SUNO EXPORT (v2.2)', '?'.repeat(60), Exported: ${new Date().toLocaleString()}, Total: ${songs.length}, '?'.repeat(60), '']; songs.forEach((s, idx) => { txtLines.push(${String(idx+1).padStart(3)}. ${s.title} ${s.duration? '['+s.duration+']':''}); if (s.author) txtLines.push(     By: ${s.author}); if (s.sidebarSummary) txtLines.push(     Summary: ${s.sidebarSummary.slice(0,200)}${s.sidebarSummary.length>200?'...':''}); if (s.lyrics) txtLines.push(     Lyrics:\n${s.lyrics.slice(0,800)}${s.lyrics.length>800?'...':''}); txtLines.push(     Audio: ${s.detailAudio}); txtLines.push(     URL: ${s.url}\n); }); const txt = txtLines.join('\n');

function dl(content, name, type) { const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

dl(csv, suno-export-${ts}.csv, 'text/csv'); dl(json, suno-export-${ts}.json, 'application/json'); dl(txt, suno-export-${ts}.txt, 'text/plain');

window.extractedSongs = songs; console.log('🎉 Extraction complete! Total songs:', songs.length); console.table(songs.slice(0,10).map(s=>({Title:s.title, Author:s.author, HasLyrics:!!s.lyrics}))); })();

// ULTIMATE SUNO EXTRACTOR v2.4 - NO CLICK: INLINE JSON -> FETCH -> HIDDEN IFRAME (resume + autosave) // Paste into Console on https://suno.com/library (or any Suno list page)

(async function() { console.log('🔧 ULTIMATE SUNO EXTRACTOR v2.4 — NO-CLICK (json -> fetch -> iframe)'); console.log('-'.repeat(70));

const CONFIG = { SCROLL_DELAY: 900, MIN_NO_CHANGE: 4, MAX_SCROLLS: 1000, PER_SONG_DELAY: 350, PANEL_WAIT_IFRAME: 9000, RETRIES: 2, RESUME_KEY: 'suno_extractor_v2_progress', SAVE_INTERVAL: 15, SELECTORS: { LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, pre, .song-lyrics', SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description', AUTHOR: 'a[href^="/@"]', TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span', AUDIO_META: 'audio[src], source[src], meta[property="og:audio"]' } };

const wait = ms => new Promise(r => setTimeout(r, ms)); function now(){ return new Date().toISOString(); } function downloadFile(content, filename, type) { try { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); console.log(✅ Saved: ${filename}); } catch (e) { console.error('download failed', e); } } function toCSV(rows, headers) { const lines = [headers.join(',')]; for (const r of rows) { lines.push(headers.map(h=>{ const v = String(r[h] ?? '').replace(/"/g,'""'); return (v.includes(',') || v.includes('\n')) ? "${v}" : v; }).join(',')); } return lines.join('\n'); }

// Step 1: Auto-scroll console.log('▶ Step 1: Auto-scroll to load anchors...'); let scrollCount = 0, lastCount = 0, noChange = 0; await new Promise(resolve => { const iv = setInterval(()=>{ window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]')); const unique = new Set(anchors.map(a => (a.href.match(//song/([a-f0-9-]{36})/)||[])[1]).filter(Boolean)); const count = unique.size; if (count === lastCount) { noChange++; if (noChange >= CONFIG.MIN_NO_CHANGE) { clearInterval(iv); console.log(   loaded ${count} songs); resolve(); } } else { noChange = 0; scrollCount++; lastCount = count; console.log(   scroll ${scrollCount}: ${count} songs); } if (scrollCount >= CONFIG.MAX_SCROLLS) { clearInterval(iv); console.warn('max scrolls reached'); resolve(); } }, CONFIG.SCROLL_DELAY); });

// Collect anchors -> unique song IDs console.log('▶ Step 2: collect song anchors...'); const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]')) .filter((a,i,arr)=> arr.findIndex(x=>x.href===a.href)===i); const items = anchorEls.map(a => { const m = a.href.match(//song/([a-f0-9-]{36})/); return { id: m?m[1]:null, href: a.href, el: a }; }).filter(x=>x.id); console.log(   found ${items.length} unique anchors);

// resume state const saved = sessionStorage.getItem(CONFIG.RESUME_KEY); const progress = saved ? JSON.parse(saved) : { processed: {} }; console.log(   previously processed: ${Object.keys(progress.processed).length});

// Helper: try to parse inline script JSONs / globals for the song id function tryInlineJSONForId(id) { // Search script tags for the id and some likely fields const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || ''); for (const txt of scripts) { if (!txt.includes(id)) continue; // Try to extract a JSON object that contains the id const jsonMatch = txt.match(/({[^}]{20,}"+?"+[\s\S]*?})/m); if (jsonMatch) { try { const candidate = JSON.parse(jsonMatch[1]); // heuristic: look for lyrics/description in object values const flat = JSON.stringify(candidate).toLowerCase(); if (flat.includes('lyrics') || flat.includes('description') || flat.includes('verse')) { return candidate; } } catch(e){} } } // also try global window variables (common patterns) try { const winKeys = Object.keys(window).filter(k => /suno|Suno|INITIAL|DATA|STATE/.test(k)); for (const k of winKeys) { try { const v = window[k]; const s = JSON.stringify(v || {}); if (s.includes(id) && (s.toLowerCase().includes('lyrics') || s.toLowerCase().includes('description'))) { return v; } } catch(e){} } } catch(e){} return null; }

// Helper: fetch detail page HTML and parse async function fetchDetail(id) { try { const url = /song/${id}; const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('status ' + r.status); const html = await r.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const lyrics = (doc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim(); const summary = (doc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim(); const author = (doc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim(); const tags = Array.from(doc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', '); const audioNode = doc.querySelector(CONFIG.SELECTORS.AUDIO_META); const audio = audioNode?.src || audioNode?.content || ''; return { lyrics, summary, author, tags, audio }; } catch (e) { console.warn(' fetchDetail error', id, e.message); return {}; } }

// Helper: load in hidden iframe and scrape iframe doc async function iframeDetail(id, href) { return new Promise(async (resolve) => { const iframe = document.createElement('iframe'); iframe.style.position = 'fixed'; iframe.style.left = '-9999px'; iframe.style.width = '1200px'; iframe.style.height = '800px'; iframe.style.opacity = '0'; iframe.src = href || /song/${id}; document.body.appendChild(iframe);

  let settled = false;
  const finish = (result) => { if (!settled) { settled=true; try{ iframe.remove(); }catch(e){} resolve(result); } };

  // timeout
  const to = setTimeout(()=> finish({}), CONFIG.PANEL_WAIT_IFRAME);

  iframe.onload = async () => {
    try {
      const idoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!idoc) { finish({}); return; }
      // wait small bit for SPA render inside iframe
      await wait(600);
      const lyrics = (idoc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim();
      const summary = (idoc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || idoc.querySelector('meta[name="description"]')?.content || '').trim();
      const author = (idoc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim();
      const tags = Array.from(idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
      const audio = audioNode?.src || audioNode?.content || '';
      clearTimeout(to);
      finish({ lyrics, summary, author, tags, audio });
    } catch (e) {
      clearTimeout(to);
      console.warn('iframe parse error', e);
      finish({});
    }
  };
});

}

// Main loop: for each item try inline -> fetch -> iframe const results = []; for (let i=0;i<items.length;i++) { const { id, href, el } = items[i]; if (progress.processed[id]) { results.push(progress.processed[id]); console.log(↳ [${i+1}/${items.length}] SKIP ${id}); continue; } let ok=false, attempt=0, lastErr=null;

while (attempt <= CONFIG.RETRIES && !ok) {
  attempt++;
  try {
    // 1) Inline JSON/global
    const inline = tryInlineJSONForId(id);
    if (inline) {
      // heuristics: pull fields if present
      const lyrics = (inline.lyrics || inline.text || inline.transcript || '').toString().trim();
      const summary = (inline.summary || inline.description || inline.excerpt || '').toString().trim();
      const author = (inline.author || inline.artist || inline.uploader || '')?.toString().trim();
      const tags = (inline.tags || inline.style || inline.genres) ? (Array.isArray(inline.tags) ? inline.tags.join(', ') : inline.tags) : '';
      const obj = { id, href, title: inline.title || el.getAttribute('title') || el.textContent.trim(), author, tags, lyrics, summary, audio: inline.audio || '', scrapedAt: now(), source: 'inline' };
      results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
      console.log(`✅ [${i+1}] ${obj.title || id} — inline JSON FOUND`);
      ok=true; break;
    }

    // 2) Fetch detail page (fastest next)
    const fetched = await fetchDetail(id);
    if (fetched && (fetched.lyrics || fetched.summary)) {
      const title = el.getAttribute('title') || el.textContent.trim();
      const obj = { id, href, title, author: fetched.author, tags: fetched.tags, lyrics: fetched.lyrics, summary: fetched.summary, audio: fetched.audio, scrapedAt: now(), source: 'fetch' };
      results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
      console.log(`✅ [${i+1}] ${title || id} — fetched (lyrics: ${!!fetched.lyrics})`);
      ok=true; break;
    }

    // 3) hidden iframe fallback
    console.log(`   [${i+1}] fetch didn't return lyrics — trying hidden iframe...`);
    const iframeRes = await iframeDetail(id, href);
    if (iframeRes && (iframeRes.lyrics || iframeRes.summary)) {
      const title = el.getAttribute('title') || el.textContent.trim();
      const obj = { id, href, title, author: iframeRes.author, tags: iframeRes.tags, lyrics: iframeRes.lyrics, summary: iframeRes.summary, audio: iframeRes.audio, scrapedAt: now(), source: 'iframe' };
      results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
      console.log(`✅ [${i+1}] ${title || id} — iframe (lyrics: ${!!iframeRes.lyrics})`);
      ok=true; break;
    }

    // nothing found
    lastErr = 'no content found via inline/fetch/iframe';
    throw new Error(lastErr);
  } catch (err) {
    lastErr = err;
    console.warn(`   ! [${i+1}] attempt ${attempt} failed:`, err.message || err);
    await wait(400 + attempt * 200);
  }
} // retries

if (!ok) {
  console.error(`✖ [${i+1}] FAILED ${id}: ${String(lastErr)}`);
  const failObj = { id, href, title: el.getAttribute('title') || el.textContent.trim(), error: String(lastErr), scrapedAt: now() };
  results.push(failObj); progress.processed[id]=failObj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
}

// autosave periodically
if ((i+1) % CONFIG.SAVE_INTERVAL === 0) {
  console.log(`⏺ Autosave after ${i+1} items`);
  const rows = Object.values(progress.processed);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source'];
  try {
    downloadFile(toCSV(rows, headers), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`, 'text/csv');
    downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`, 'application/json');
  } catch(e){ console.warn('autosave failed', e); }
}

await wait(CONFIG.PER_SONG_DELAY);

} // for loop

// final export console.log('▶ Final export — writing files'); const all = Object.values(progress.processed); const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source']; try { downloadFile(toCSV(all, headers), suno-extract-${ts}.csv, 'text/csv'); downloadFile(JSON.stringify(all, null, 2), suno-extract-${ts}.json, 'application/json'); const txt = ['Suno Extract (v2.4)', Exported: ${new Date().toLocaleString()}, Total: ${all.length}, ''].concat(all.map((s,i)=>{ const lines=[]; lines.push(${String(i+1).padStart(3)}. ${s.title || 'Untitled'}); if (s.author) lines.push(   Author: ${s.author}); if (s.tags) lines.push(   Tags: ${s.tags}); if (s.summary) lines.push(   Summary: ${s.summary?.slice(0,200)}); if (s.lyrics) lines.push(   Lyrics: ${s.lyrics?.slice(0,400)}); if (s.audio) lines.push(   Audio: ${s.audio}); lines.push(   URL: ${s.href}); return lines.join('\n'); })).join('\n\n'); downloadFile(txt, suno-extract-${ts}.txt, 'text/plain'); } catch (e) { console.error('final export failed', e); }

window.extractedSongs = all; console.log('🎉 Done. Check ~/Downloads/ and window.extractedSongs. Session saved to sessionStorage.'); console.log('-'.repeat(70)); })();

API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"},"request_id":"req_011CVZBK5iySzfwmVJzChArR"} · Please run /login

Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.

<command-name>/login</command-name> <command-message>login</command-message> <command-args></command-args>

<local-command-stdout>Login successful</local-command-stdout>

redo

API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"},"request_id":"req_011CVZBPkyjda42iSrRQDiJ7"} · Please run /login

Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.

<command-name>/login</command-name> <command-message>login</command-message> <command-args></command-args>

<local-command-stdout>Login successful</local-command-stdout>

Hook
SessionStart:startup
{"systemMessage": "Session started at 17:25. Workspace: nocTurneMeLoDieS"}
continue

API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"},"request_id":"req_011CVZBTAn3x93NQedJMnugW"} · Please run /login

/login

Reply...


// ?? Suno HTML Data Extractor - Dev Console Script
// ==================================================
// 
// USAGE:
// 1. Open main.html or evolves.html in Chrome/Safari
// 2. Open Dev Console (Cmd+Option+I on Mac)
// 3. Paste this entire script
// 4. Press Enter
// 5. Data will be extracted and downloaded as CSV!

console.log('?? Suno Data Extractor Starting...');

// Extract all song data from the page
function extractSunoSongs() {
    const songs = [];
    
    // Method 1: Find all song containers by data-clip-id
    const songElements = document.querySelectorAll('[data-clip-id]');
    
    console.log(`Found ${songElements.length} song elements`);
    
    songElements.forEach((element, index) => {
        try {
            const song = {};
            
            // Extract ID
            song.id = element.getAttribute('data-clip-id');
            
            // Extract title
            const titleElement = element.querySelector('[title]');
            if (titleElement) {
                song.title = titleElement.getAttribute('title') || titleElement.textContent.trim();
            }
            
            // Extract duration
            const durationElement = element.querySelector('.font-mono');
            if (durationElement) {
                song.duration = durationElement.textContent.trim();
            }
            
            // Extract image URL
            const imageElement = element.querySelector('img[src*="suno.ai"]');
            if (imageElement) {
                song.image_url = imageElement.getAttribute('src') || imageElement.getAttribute('data-src');
            }
            
            // Extract song URL
            const linkElement = element.querySelector('a[href*="/song/"]');
            if (linkElement) {
                const href = linkElement.getAttribute('href');
                song.url = href.startsWith('http') ? href : `https://suno.com${href}`;
            }
            
            // Extract tags/style
            const tagElements = element.querySelectorAll('[title][href*="/style/"]');
            if (tagElements.length > 0) {
                song.tags = Array.from(tagElements).map(el => el.textContent.trim()).join(', ');
            }
            
            // Extract version (v4, v5, etc.)
            const versionElement = element.querySelector('[style*="FD429C"]');
            if (versionElement) {
                song.version = versionElement.textContent.trim();
            }
            
            // Extract plays/likes/comments
            const statsElements = element.querySelectorAll('.text-\\[12px\\] .font-medium');
            if (statsElements.length >= 3) {
                song.plays = statsElements[0]?.textContent.trim() || '0';
                song.likes = statsElements[1]?.textContent.trim() || '0';
                song.comments = statsElements[2]?.textContent.trim() || '0';
            }
            
            // Only add if we have at least an ID and title
            if (song.id && song.title) {
                songs.push(song);
                
                if ((index + 1) % 10 === 0) {
                    console.log(`Extracted ${index + 1} songs...`);
                }
            }
        } catch (e) {
            console.error(`Error extracting song ${index}:`, e);
        }
    });
    
    return songs;
}

// Convert to CSV
function convertToCSV(songs) {
    if (songs.length === 0) {
        return '';
    }
    
    // Get all unique keys
    const keys = Object.keys(songs[0]);
    
    // Create header
    const header = keys.join(',');
    
    // Create rows
    const rows = songs.map(song => {
        return keys.map(key => {
            const value = song[key] || '';
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(value).replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        }).join(',');
    });
    
    return [header, ...rows].join('\n');
}

// Download as file
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Main execution
console.log('?? Extracting songs...');
const extractedSongs = extractSunoSongs();

console.log('? Extraction complete!');
console.log(`?? Found ${extractedSongs.length} songs`);

// Show sample
if (extractedSongs.length > 0) {
    console.log('\n?? Sample songs:');
    extractedSongs.slice(0, 5).forEach((song, i) => {
        console.log(`${i + 1}. ${song.title} (${song.duration})`);
    });
}

// Convert to CSV
const csv = convertToCSV(extractedSongs);

// Download
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const filename = `suno-songs-${timestamp}.csv`;

downloadCSV(csv, filename);

console.log(`\n? Downloaded: ${filename}`);
console.log(`?? Check your Downloads folder!`);

// Also copy to clipboard
const jsonData = JSON.stringify(extractedSongs, null, 2);
navigator.clipboard.writeText(jsonData).then(() => {
    console.log('?? JSON data also copied to clipboard!');
}).catch(() => {
    console.log('??  Could not copy to clipboard');
});

// Return data for inspection
console.log('\n?? Data stored in: extractedSongs');
console.log('?? Access it by typing: extractedSongs');

extractedSongs;

// ?? AUTO-SCROLL SUNO EXTRACTOR - Paste into Dev Console
// =========================================================
// This will auto-scroll to load ALL songs, then extract them!

console.log('?? Starting AUTO-SCROLL Extractor...');
console.log('? This will scroll through the page to load all songs...');

// Configuration
const SCROLL_DELAY = 1500; // Wait 1.5 seconds between scrolls
const MAX_SCROLLS = 200;   // Maximum number of scrolls (safety limit)

let scrollCount = 0;
let lastHeight = 0;
let noChangeCount = 0;

// Auto-scroll function
function autoScroll() {
    return new Promise((resolve) => {
        const scrollInterval = setInterval(() => {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            
            const currentHeight = document.body.scrollHeight;
            
            // Check if page height changed
            if (currentHeight === lastHeight) {
                noChangeCount++;
                console.log(`   No new content loaded... (${noChangeCount}/3)`);
                
                // If no change for 3 scrolls, we're done
                if (noChangeCount >= 3) {
                    clearInterval(scrollInterval);
                    console.log('? Finished scrolling!');
                    resolve();
                }
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
                scrollCount++;
                
                // Count current songs
                const currentSongCount = document.querySelectorAll('[data-clip-id]').length;
                console.log(`   Scroll ${scrollCount}: Found ${currentSongCount} songs...`);
            }
            
            // Safety limit
            if (scrollCount >= MAX_SCROLLS) {
                clearInterval(scrollInterval);
                console.log('??  Reached max scrolls, stopping...');
                resolve();
            }
            
        }, SCROLL_DELAY);
    });
}

// Extract function
async function extractAllSongs() {
    // Step 1: Auto-scroll to load everything
    console.log('\n?? Step 1: Auto-scrolling to load all songs...');
    await autoScroll();
    
    // Step 2: Extract all songs
    console.log('\n?? Step 2: Extracting song data...');
    
    const songs = [];
    const songElements = document.querySelectorAll('[data-clip-id]');
    
    console.log(`   Found ${songElements.length} total songs!`);
    
    songElements.forEach((el, index) => {
        try {
            const song = {
                id: el.getAttribute('data-clip-id'),
                title: el.querySelector('[title]')?.getAttribute('title') || '',
                duration: el.querySelector('.font-mono')?.textContent?.trim() || '',
                url: 'https://suno.com/song/' + el.getAttribute('data-clip-id'),
                audio_url: 'https://cdn1.suno.ai/' + el.getAttribute('data-clip-id') + '.mp3',
                image_url: el.querySelector('img[src*="suno.ai"]')?.getAttribute('src') || '',
            };
            
            // Extract tags
            const tagElements = el.querySelectorAll('[href*="/style/"]');
            if (tagElements.length > 0) {
                song.tags = Array.from(tagElements).map(t => t.textContent.trim()).join(', ');
            }
            
            // Extract version
            const versionEl = el.querySelector('[style*="FD429C"]');
            if (versionEl) {
                song.version = versionEl.textContent.trim();
            }
            
            // Extract stats (plays, likes, comments)
            const statsElements = el.querySelectorAll('.text-\\[12px\\] .font-medium');
            if (statsElements.length >= 3) {
                song.plays = statsElements[0]?.textContent.trim() || '0';
                song.likes = statsElements[1]?.textContent.trim() || '0';
                song.comments = statsElements[2]?.textContent.trim() || '0';
            }
            
            if (song.title) {
                songs.push(song);
            }
        } catch (e) {
            console.error(`Error on song ${index}:`, e);
        }
    });
    
    console.log(`? Extracted ${songs.length} songs!`);
    
    // Step 3: Create CSV
    console.log('\n?? Step 3: Creating CSV...');
    
    const csv = [
        'id,title,duration,tags,version,plays,likes,comments,url,audio_url,image_url',
        ...songs.map(s => {
            const title = (s.title || '').replace(/"/g, '""');
            const tags = (s.tags || '').replace(/"/g, '""');
            return `${s.id},"${title}",${s.duration},"${tags}",${s.version || ''},${s.plays || '0'},${s.likes || '0'},${s.comments || '0'},${s.url},${s.audio_url},${s.image_url}`;
        })
    ].join('\n');
    
    // Step 4: Download CSV
    console.log('\n?? Step 4: Downloading CSV...');
    
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `suno-songs-${timestamp}.csv`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`? Downloaded: ${filename}`);
    console.log('?? Check your Downloads folder!');
    
    // Step 5: Copy to clipboard
    console.log('\n?? Step 5: Copying JSON to clipboard...');
    
    const jsonData = JSON.stringify(songs, null, 2);
    navigator.clipboard.writeText(jsonData).then(() => {
        console.log('? JSON copied to clipboard!');
    }).catch(() => {
        console.log('??  Could not copy to clipboard');
    });
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n   Total songs: ${songs.length}`);
    console.log(`   CSV file: ${filename}`);
    console.log(`   Location: ~/Downloads/`);
    
    // Show samples
    console.log('\n?? First 10 songs:');
    songs.slice(0, 10).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.title} (${s.duration}) - ${s.version}`);
    });
    
    if (songs.length > 10) {
        console.log(`   ... and ${songs.length - 10} more!`);
    }
    
    console.log('\n?? To view all data in console, type: extractedSongs');
    
    // Return for inspection
    window.extractedSongs = songs;
    return songs;
}

// Run the extraction
extractAllSongs();

// ?? LIVE SUNO WEBSITE EXTRACTOR - Paste into Dev Console
// =========================================================
// Works on the LIVE suno.com website (not saved HTML files)
// Auto-scrolls and extracts ALL your songs!

console.log('?? Live Suno Extractor Starting...');
console.log('? Please wait while we auto-scroll and load all songs...');

// Configuration
const SCROLL_DELAY = 2000;  // 2 seconds between scrolls
const MAX_SCROLLS = 300;    // Max scrolls (for large collections)

// Auto-scroll and extract
async function extractAllSunoSongs() {
    let scrollCount = 0;
    let lastSongCount = 0;
    let noChangeCount = 0;
    
    // Step 1: Auto-scroll to load all songs
    console.log('\n?? Step 1: Auto-scrolling to load all songs...');
    
    await new Promise((resolve) => {
        const scrollInterval = setInterval(() => {
            // Scroll to bottom
            window.scrollTo(0, document.documentElement.scrollHeight);
            
            // Count songs (try multiple selectors)
            const songCount = Math.max(
                document.querySelectorAll('[data-clip-id]').length,
                document.querySelectorAll('[data-testid="song-row"]').length,
                document.querySelectorAll('.song-row').length,
                document.querySelectorAll('a[href*="/song/"]').length
            );
            
            if (songCount === lastSongCount) {
                noChangeCount++;
                console.log(`   No new songs... (${noChangeCount}/5)`);
                
                if (noChangeCount >= 5) {
                    clearInterval(scrollInterval);
                    console.log(`? Finished! Loaded ${songCount} songs`);
                    resolve();
                }
            } else {
                noChangeCount = 0;
                scrollCount++;
                console.log(`   Scroll ${scrollCount}: ${songCount} songs loaded...`);
                lastSongCount = songCount;
            }
            
            if (scrollCount >= MAX_SCROLLS) {
                clearInterval(scrollInterval);
                console.log(`??  Max scrolls reached`);
                resolve();
            }
        }, SCROLL_DELAY);
    });
    
    // Step 2: Extract song data
    console.log('\n?? Step 2: Extracting song data...');
    
    const songs = [];
    const extractedIds = new Set();
    
    // Try multiple selection methods
    const selectors = [
        '[data-clip-id]',
        '[data-testid="song-row"]',
        'a[href*="/song/"]'
    ];
    
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach((el) => {
            try {
                // Get song ID
                let songId = el.getAttribute('data-clip-id');
                
                if (!songId) {
                    // Try to extract from href
                    const link = el.querySelector('a[href*="/song/"]') || el;
                    const href = link.getAttribute('href');
                    if (href) {
                        const match = href.match(/\/song\/([a-f0-9-]{36})/);
                        if (match) songId = match[1];
                    }
                }
                
                if (!songId || extractedIds.has(songId)) return;
                extractedIds.add(songId);
                
                // Extract title
                let title = '';
                const titleEl = el.querySelector('[title]') || 
                               el.querySelector('.text-base') ||
                               el.querySelector('a[href*="/song/"]');
                if (titleEl) {
                    title = titleEl.getAttribute('title') || titleEl.textContent.trim();
                }
                
                // Extract duration
                let duration = '';
                const durationEl = el.querySelector('.font-mono') ||
                                  el.querySelector('[class*="duration"]');
                if (durationEl) {
                    duration = durationEl.textContent.trim();
                }
                
                // Extract image
                let imageUrl = '';
                const imgEl = el.querySelector('img[src*="suno"]');
                if (imgEl) {
                    imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                    // Get large version
                    imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720', '');
                }
                
                // Extract tags
                let tags = '';
                const tagEls = el.querySelectorAll('a[href*="/style/"]');
                if (tagEls.length > 0) {
                    tags = Array.from(tagEls).map(t => t.textContent.trim()).join(', ');
                }
                
                // Create song object
                if (songId && title) {
                    songs.push({
                        id: songId,
                        title: title,
                        duration: duration,
                        tags: tags,
                        url: `https://suno.com/song/${songId}`,
                        share_url: `https://suno.com/s/${songId.split('-')[0]}`,
                        audio_url: `https://cdn1.suno.ai/${songId}.mp3`,
                        image_url: imageUrl
                    });
                }
            } catch (e) {
                console.error('Error extracting song:', e);
            }
        });
        
        if (songs.length > 0) break; // Found songs, stop trying selectors
    }
    
    console.log(`? Extracted ${songs.length} unique songs!`);
    
    if (songs.length === 0) {
        console.error('? No songs found! You may need to:');
        console.error('   1. Make sure you are on suno.com/library or your profile page');
        console.error('   2. Wait for the page to fully load');
        console.error('   3. Try scrolling manually first');
        return [];
    }
    
    // Step 3: Create CSV
    console.log('\n?? Step 3: Creating CSV...');
    
    const csv = [
        'id,title,duration,tags,url,share_url,audio_url,image_url',
        ...songs.map(s => {
            const title = (s.title || '').replace(/"/g, '""');
            const tags = (s.tags || '').replace(/"/g, '""');
            return `${s.id},"${title}",${s.duration || ''},"${tags}",${s.url},${s.share_url},${s.audio_url},${s.image_url || ''}`;
        })
    ].join('\n');
    
    // Step 4: Download CSV
    console.log('\n?? Step 4: Downloading CSV...');
    
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `suno-collection-${timestamp}.csv`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`? Downloaded: ${filename}`);
    console.log('?? Check ~/Downloads/');
    
    // Step 5: Create text summary
    console.log('\n?? Step 5: Creating text summary...');
    
    const txtSummary = [
        '?? YOUR SUNO COLLECTION',
        '='.repeat(70),
        `\nExtracted: ${new Date().toLocaleString()}`,
        `Total Songs: ${songs.length}\n`,
        '='.repeat(70),
        '\n?? SONGS:\n',
        ...songs.map((s, i) => {
            let line = `${i + 1}. ${s.title}`;
            if (s.duration) line += ` (${s.duration})`;
            if (s.tags) line += `\n   Style: ${s.tags}`;
            line += `\n   URL: ${s.url}\n`;
            return line;
        })
    ].join('\n');
    
    // Download TXT
    const txtBlob = new Blob([txtSummary], {type: 'text/plain;charset=utf-8'});
    const txtUrl = URL.createObjectURL(txtBlob);
    const txtLink = document.createElement('a');
    txtLink.href = txtUrl;
    txtLink.download = `suno-collection-${timestamp}.txt`;
    document.body.appendChild(txtLink);
    txtLink.click();
    document.body.removeChild(txtLink);
    URL.revokeObjectURL(txtUrl);
    
    console.log(`? Downloaded: suno-collection-${timestamp}.txt`);
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n   ?? Total songs: ${songs.length}`);
    console.log(`   ?? Files in ~/Downloads/:`);
    console.log(`      ? ${filename}`);
    console.log(`      ? suno-collection-${timestamp}.txt`);
    
    // Show top songs
    console.log('\n?? First 10 songs:');
    songs.slice(0, 10).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.title} ${s.duration ? '(' + s.duration + ')' : ''}`);
    });
    
    if (songs.length > 10) {
        console.log(`   ... and ${songs.length - 10} more!`);
    }
    
    console.log('\n?? Type "extractedSongs" to view all data in console');
    console.log('?? Type "extractedSongs[0]" to see first song details');
    
    // Store globally
    window.extractedSongs = songs;
    
    return songs;
}

// Run it!
extractAllSunoSongs();

// ?? SAVED HTML EXTRACTOR - For main.html & evolves.html
// ========================================================
// Paste this into dev console when viewing saved HTML files

console.log('?? Saved HTML Extractor Starting...');

const songs = [];
const extractedIds = new Set();

// Method 1: Extract from href links
console.log('?? Looking for song links...');
const songLinks = document.querySelectorAll('a[href*="/song/"]');
console.log(`   Found ${songLinks.length} song links`);

songLinks.forEach((link, index) => {
    try {
        // Extract song ID from href
        const href = link.getAttribute('href');
        const match = href.match(/\/song\/([a-f0-9-]{36})/);
        
        if (match) {
            const songId = match[1];
            
            if (extractedIds.has(songId)) return; // Skip duplicates
            extractedIds.add(songId);
            
            // Get title
            const title = link.getAttribute('title') || 
                         link.textContent.trim() ||
                         link.querySelector('span')?.textContent.trim() || '';
            
            // Find parent container to get more data
            const container = link.closest('[class*="flex"]')?.parentElement?.parentElement;
            
            let duration = '';
            let imageUrl = '';
            let tags = '';
            
            if (container) {
                // Extract duration
                const durationEl = container.querySelector('.font-mono') ||
                                  container.querySelector('div:has(>*)');
                if (durationEl) {
                    const text = durationEl.textContent;
                    const timeMatch = text.match(/\d+:\d+/);
                    if (timeMatch) duration = timeMatch[0];
                }
                
                // Extract image
                const imgEl = container.querySelector('img[src*="suno"]');
                if (imgEl) {
                    imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                }
                
                // Extract tags
                const tagLinks = container.querySelectorAll('a[href*="/style/"]');
                if (tagLinks.length > 0) {
                    tags = Array.from(tagLinks).map(t => t.textContent.trim()).join(', ');
                }
            }
            
            songs.push({
                id: songId,
                title: title,
                duration: duration,
                tags: tags,
                url: `https://suno.com/song/${songId}`,
                audio_url: `https://cdn1.suno.ai/${songId}.mp3`,
                image_url: imageUrl
            });
        }
    } catch (e) {
        console.error(`Error on link ${index}:`, e);
    }
});

console.log(`? Extracted ${songs.length} songs!`);

if (songs.length === 0) {
    console.error('? No songs extracted!');
    console.error('Debugging info:');
    console.error(`   Song links found: ${songLinks.length}`);
    console.error(`   Page title: ${document.title}`);
    console.error('\nTry:');
    console.error('   1. Make sure main.html or evolves.html is open');
    console.error('   2. Wait for page to fully render');
    console.error('   3. Paste script again');
} else {
    // Show preview
    console.log('\n?? First 10 songs:');
    songs.slice(0, 10).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.title} ${s.duration ? '(' + s.duration + ')' : ''}`);
    });
    
    if (songs.length > 10) {
        console.log(`   ... and ${songs.length - 10} more!`);
    }
    
    // Create CSV
    console.log('\n?? Creating CSV...');
    
    const csv = [
        'id,title,duration,tags,url,audio_url,image_url',
        ...songs.map(s => {
            const title = (s.title || '').replace(/"/g, '""');
            const tags = (s.tags || '').replace(/"/g, '""');
            return `${s.id},"${title}",${s.duration || ''},"${tags}",${s.url},${s.audio_url},${s.image_url || ''}`;
        })
    ].join('\n');
    
    // Download CSV
    console.log('?? Downloading CSV...');
    
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `suno-saved-html-${timestamp}.csv`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('\n' + '='.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n   ?? Total songs: ${songs.length}`);
    console.log(`   ?? CSV file: ${filename}`);
    console.log(`   ?? Location: ~/Downloads/`);
    console.log('\n?? Type "extractedSongs" to view data');
    
    // Store globally
    window.extractedSongs = songs;
}

songs;

SUNO_ULTIMATE_EXTRACTOR.js - Browser-based (EASIEST!)
    • Auto-scrolls and extracts from live Suno pages
    • Outputs CSV + JSON + TXT
  2. suno_html_batch_extractor.py - Process saved HTML files
    • Extracted 510 songs from your 18 HTML files
// ?? ULTIMATE SUNO EXTRACTOR - Paste into Browser Console
// =========================================================
// ? Auto-scrolls and loads ALL songs
// ? Extracts complete data
// ? Downloads CSV + JSON + TXT
// ? Works on ANY Suno page (library, playlists, profiles)
//
// USAGE:
// 1. Go to: https://suno.com/library OR any playlist/profile
// 2. Open Console: Cmd+Option+I (Mac) or F12 (Windows)
// 3. Paste this entire script
// 4. Press Enter
// 5. Wait for completion
// 6. Find files in ~/Downloads/

console.log('?? ULTIMATE SUNO EXTRACTOR v2.0');
console.log('?'.repeat(70));

(async function() {
    // ====== CONFIGURATION ======
    const CONFIG = {
        SCROLL_DELAY: 2000,      // ms between scrolls
        MAX_SCROLLS: 500,        // max scrolls (for huge collections)
        MIN_NO_CHANGE: 5,        // scrolls with no new songs before stopping
        EXTRACT_LYRICS: true,    // extract lyrics (slower but complete)
        EXTRACT_METADATA: true,  // extract all metadata
    };
    
    // ====== STEP 1: AUTO-SCROLL ======
    console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');
    
    let scrollCount = 0;
    let lastSongCount = 0;
    let noChangeCount = 0;
    
    await new Promise((resolve) => {
        const scrollInterval = setInterval(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            
            // Count unique song links
            const songLinks = document.querySelectorAll('a[href*="/song/"]');
            const uniqueIds = new Set();
            songLinks.forEach(link => {
                const match = link.href.match(/\/song\/([a-f0-9-]{36})/);
                if (match) uniqueIds.add(match[1]);
            });
            const songCount = uniqueIds.size;
            
            if (songCount === lastSongCount) {
                noChangeCount++;
                console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
                
                if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
                    clearInterval(scrollInterval);
                    console.log(`? Loaded ${songCount} songs in ${scrollCount} scrolls`);
                    resolve();
                }
            } else {
                noChangeCount = 0;
                scrollCount++;
                const newSongs = songCount - lastSongCount;
                console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${newSongs})`);
                lastSongCount = songCount;
            }
            
            if (scrollCount >= CONFIG.MAX_SCROLLS) {
                clearInterval(scrollInterval);
                console.log(`??  Max scrolls reached`);
                resolve();
            }
        }, CONFIG.SCROLL_DELAY);
    });
    
    // ====== STEP 2: EXTRACT SONG DATA ======
    console.log('\n?? Step 2/4: Extracting song data...');
    
    const songs = [];
    const extractedIds = new Set();
    
    // Find all song containers
    const songElements = document.querySelectorAll('a[href*="/song/"]');
    console.log(`   Found ${songElements.length} song elements`);
    
    songElements.forEach((element, index) => {
        try {
            // Extract song ID
            const match = element.href.match(/\/song\/([a-f0-9-]{36})/);
            if (!match) return;
            
            const songId = match[1];
            if (extractedIds.has(songId)) return;
            extractedIds.add(songId);
            
            // Find parent container
            const container = element.closest('[class*="song"]') || 
                            element.closest('[class*="clip"]') || 
                            element.closest('div');
            
            // Extract title
            const titleEl = element.querySelector('[title]') || 
                           element.querySelector('[class*="title"]') ||
                           element;
            const title = titleEl?.getAttribute('title') || 
                         titleEl?.textContent?.trim() || 
                         'Untitled';
            
            // Extract duration
            const durationEl = container?.querySelector('[class*="duration"]') ||
                              container?.querySelector('.font-mono') ||
                              container?.querySelector('time');
            const duration = durationEl?.textContent?.trim() || '';
            
            // Extract image
            const imgEl = element.querySelector('img') || 
                         container?.querySelector('img');
            let imageUrl = imgEl?.src || '';
            if (imageUrl) {
                // Get high-res version
                imageUrl = imageUrl.replace('/image_', '/image_large_')
                                 .replace('?width=720', '');
            }
            
            // Extract tags/style
            const tagEls = container?.querySelectorAll('a[href*="/style/"]') || [];
            const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);
            
            // Extract author
            const authorEl = container?.querySelector('a[href*="/@"]');
            const author = authorEl?.textContent?.trim() || '';
            const authorLink = authorEl?.href || '';
            
            // Extract plays/likes
            const playEl = container?.querySelector('[title*="play"]') ||
                          container?.querySelector('[class*="play-count"]');
            const plays = playEl?.textContent?.trim() || '';
            
            const likeEl = container?.querySelector('[title*="like"]') ||
                          container?.querySelector('[class*="like"]');
            const likes = likeEl?.textContent?.trim() || '';
            
            // Build song object
            const song = {
                id: songId,
                title: title,
                url: `https://suno.com/song/${songId}`,
                shareUrl: `https://suno.com/s/${songId.split('-')[0]}`,
                audioUrl: `https://cdn1.suno.ai/${songId}.mp3`,
                imageUrl: imageUrl,
                duration: duration,
                tags: tags.join(', '),
                author: author,
                authorLink: authorLink,
                plays: plays,
                likes: likes,
                extractedAt: new Date().toISOString(),
            };
            
            songs.push(song);
            
            if ((index + 1) % 50 === 0) {
                console.log(`   ?? Processed ${index + 1}/${songElements.length}...`);
            }
        } catch (error) {
            console.error(`   ??  Error extracting song ${index}:`, error.message);
        }
    });
    
    console.log(`? Extracted ${songs.length} unique songs`);
    
    if (songs.length === 0) {
        console.error('\n? NO SONGS FOUND!');
        console.error('   Make sure you\'re on a Suno page with songs visible');
        return;
    }
    
    // ====== STEP 3: CREATE FILES ======
    console.log('\n?? Step 3/4: Creating export files...');
    
    const timestamp = new Date().toISOString()
                        .replace(/[:.]/g, '-')
                        .slice(0, 19);
    
    // CSV
    const csvHeaders = Object.keys(songs[0]);
    const csvRows = [
        csvHeaders.join(','),
        ...songs.map(song => 
            csvHeaders.map(key => {
                const value = String(song[key] || '');
                // Escape quotes and wrap in quotes if contains comma
                const escaped = value.replace(/"/g, '""');
                return escaped.includes(',') ? `"${escaped}"` : escaped;
            }).join(',')
        )
    ];
    const csvContent = csvRows.join('\n');
    
    // JSON
    const jsonContent = JSON.stringify(songs, null, 2);
    
    // TXT Summary
    const txtContent = [
        '?? SUNO COLLECTION EXPORT',
        '?'.repeat(70),
        `Exported: ${new Date().toLocaleString()}`,
        `Total Songs: ${songs.length}`,
        `Source: ${window.location.href}`,
        '?'.repeat(70),
        '',
        '?? SONGS:',
        '',
        ...songs.map((song, i) => {
            let line = `${(i + 1).toString().padStart(4)}. ${song.title}`;
            if (song.duration) line += ` [${song.duration}]`;
            if (song.author) line += `\n      By: ${song.author}`;
            if (song.tags) line += `\n      Style: ${song.tags}`;
            line += `\n      URL: ${song.url}`;
            line += `\n      Audio: ${song.audioUrl}\n`;
            return line;
        })
    ].join('\n');
    
    // ====== STEP 4: DOWNLOAD FILES ======
    console.log('\n?? Step 4/4: Downloading files...');
    
    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`   ? ${filename}`);
    }
    
    downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
    downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
    downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');
    
    // ====== SUMMARY ======
    console.log('\n' + '?'.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('?'.repeat(70));
    console.log(`   ?? Total songs: ${songs.length}`);
    console.log(`   ?? Files saved to ~/Downloads/:`);
    console.log(`      ?? suno-export-${timestamp}.csv`);
    console.log(`      ?? suno-export-${timestamp}.json`);
    console.log(`      ?? suno-export-${timestamp}.txt`);
    console.log('?'.repeat(70));
    console.log('\n?? Tips:');
    console.log('   ? Type "extractedSongs" to view data in console');
    console.log('   ? Type "extractedSongs[0]" to see first song details');
    console.log('   ? Type "extractedSongs.length" to see total count');
    console.log('\n');
    
    // Show preview
    console.log('?? First 5 songs:');
    console.table(songs.slice(0, 5).map(s => ({
        Title: s.title,
        Duration: s.duration,
        Author: s.author,
        Tags: s.tags?.slice(0, 30) + (s.tags?.length > 30 ? '...' : '')
    })));
    
    // Make data available globally
    window.extractedSongs = songs;
    
})().catch(error => {
    console.error('\n? ERROR:', error);
    console.error('Please report this issue with the error message above');
});

// ?? ULTIMATE SUNO EXTRACTOR - Paste into Browser Console
// =========================================================
// ? Auto-scrolls and loads ALL songs
// ? Extracts complete data
// ? Downloads CSV + JSON + TXT
// ? Works on ANY Suno page (library, playlists, profiles)
//
// USAGE:
// 1. Go to: https://suno.com/library OR any playlist/profile
// 2. Open Console: Cmd+Option+I (Mac) or F12 (Windows)
// 3. Paste this entire script
// 4. Press Enter
// 5. Wait for completion
// 6. Find files in ~/Downloads/

console.log('?? ULTIMATE SUNO EXTRACTOR v2.0');
console.log('?'.repeat(70));

(async function() {
    // ====== CONFIGURATION ======
    const CONFIG = {
        SCROLL_DELAY: 2000,      // ms between scrolls
        MAX_SCROLLS: 500,        // max scrolls (for huge collections)
        MIN_NO_CHANGE: 5,        // scrolls with no new songs before stopping
        EXTRACT_LYRICS: true,    // extract lyrics (slower but complete)
        EXTRACT_METADATA: true,  // extract all metadata
    };
    
    // ====== STEP 1: AUTO-SCROLL ======
    console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');
    
    let scrollCount = 0;
    let lastSongCount = 0;
    let noChangeCount = 0;
    
    await new Promise((resolve) => {
        const scrollInterval = setInterval(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            
            // Count unique song links
            const songLinks = document.querySelectorAll('a[href*="/song/"]');
            const uniqueIds = new Set();
            songLinks.forEach(link => {
                const match = link.href.match(/\/song\/([a-f0-9-]{36})/);
                if (match) uniqueIds.add(match[1]);
            });
            const songCount = uniqueIds.size;
            
            if (songCount === lastSongCount) {
                noChangeCount++;
                console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
                
                if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
                    clearInterval(scrollInterval);
                    console.log(`? Loaded ${songCount} songs in ${scrollCount} scrolls`);
                    resolve();
                }
            } else {
                noChangeCount = 0;
                scrollCount++;
                const newSongs = songCount - lastSongCount;
                console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${newSongs})`);
                lastSongCount = songCount;
            }
            
            if (scrollCount >= CONFIG.MAX_SCROLLS) {
                clearInterval(scrollInterval);
                console.log(`??  Max scrolls reached`);
                resolve();
            }
        }, CONFIG.SCROLL_DELAY);
    });
    
    // ====== STEP 2: EXTRACT SONG DATA ======
    console.log('\n?? Step 2/4: Extracting song data...');
    
    const songs = [];
    const extractedIds = new Set();
    
    // Find all song containers
    const songElements = document.querySelectorAll('a[href*="/song/"]');
    console.log(`   Found ${songElements.length} song elements`);
    
    songElements.forEach((element, index) => {
        try {
            // Extract song ID
            const match = element.href.match(/\/song\/([a-f0-9-]{36})/);
            if (!match) return;
            
            const songId = match[1];
            if (extractedIds.has(songId)) return;
            extractedIds.add(songId);
            
            // Find parent container
            const container = element.closest('[class*="song"]') || 
                            element.closest('[class*="clip"]') || 
                            element.closest('div');
            
            // Extract title
            const titleEl = element.querySelector('[title]') || 
                           element.querySelector('[class*="title"]') ||
                           element;
            const title = titleEl?.getAttribute('title') || 
                         titleEl?.textContent?.trim() || 
                         'Untitled';
            
            // Extract duration
            const durationEl = container?.querySelector('[class*="duration"]') ||
                              container?.querySelector('.font-mono') ||
                              container?.querySelector('time');
            const duration = durationEl?.textContent?.trim() || '';
            
            // Extract image
            const imgEl = element.querySelector('img') || 
                         container?.querySelector('img');
            let imageUrl = imgEl?.src || '';
            if (imageUrl) {
                // Get high-res version
                imageUrl = imageUrl.replace('/image_', '/image_large_')
                                 .replace('?width=720', '');
            }
            
            // Extract tags/style
            const tagEls = container?.querySelectorAll('a[href*="/style/"]') || [];
            const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);
            
            // Extract author
            const authorEl = container?.querySelector('a[href*="/@"]');
            const author = authorEl?.textContent?.trim() || '';
            const authorLink = authorEl?.href || '';
            
            // Extract plays/likes
            const playEl = container?.querySelector('[title*="play"]') ||
                          container?.querySelector('[class*="play-count"]');
            const plays = playEl?.textContent?.trim() || '';
            
            const likeEl = container?.querySelector('[title*="like"]') ||
                          container?.querySelector('[class*="like"]');
            const likes = likeEl?.textContent?.trim() || '';
            
            // Build song object
            const song = {
                id: songId,
                title: title,
                url: `https://suno.com/song/${songId}`,
                shareUrl: `https://suno.com/s/${songId.split('-')[0]}`,
                audioUrl: `https://cdn1.suno.ai/${songId}.mp3`,
                imageUrl: imageUrl,
                duration: duration,
                tags: tags.join(', '),
                author: author,
                authorLink: authorLink,
                plays: plays,
                likes: likes,
                extractedAt: new Date().toISOString(),
            };
            
            songs.push(song);
            
            if ((index + 1) % 50 === 0) {
                console.log(`   ?? Processed ${index + 1}/${songElements.length}...`);
            }
        } catch (error) {
            console.error(`   ??  Error extracting song ${index}:`, error.message);
        }
    });
    
    console.log(`? Extracted ${songs.length} unique songs`);
    
    if (songs.length === 0) {
        console.error('\n? NO SONGS FOUND!');
        console.error('   Make sure you\'re on a Suno page with songs visible');
        return;
    }
    
    // ====== STEP 3: CREATE FILES ======
    console.log('\n?? Step 3/4: Creating export files...');
    
    const timestamp = new Date().toISOString()
                        .replace(/[:.]/g, '-')
                        .slice(0, 19);
    
    // CSV
    const csvHeaders = Object.keys(songs[0]);
    const csvRows = [
        csvHeaders.join(','),
        ...songs.map(song => 
            csvHeaders.map(key => {
                const value = String(song[key] || '');
                // Escape quotes and wrap in quotes if contains comma
                const escaped = value.replace(/"/g, '""');
                return escaped.includes(',') ? `"${escaped}"` : escaped;
            }).join(',')
        )
    ];
    const csvContent = csvRows.join('\n');
    
    // JSON
    const jsonContent = JSON.stringify(songs, null, 2);
    
    // TXT Summary
    const txtContent = [
        '?? SUNO COLLECTION EXPORT',
        '?'.repeat(70),
        `Exported: ${new Date().toLocaleString()}`,
        `Total Songs: ${songs.length}`,
        `Source: ${window.location.href}`,
        '?'.repeat(70),
        '',
        '?? SONGS:',
        '',
        ...songs.map((song, i) => {
            let line = `${(i + 1).toString().padStart(4)}. ${song.title}`;
            if (song.duration) line += ` [${song.duration}]`;
            if (song.author) line += `\n      By: ${song.author}`;
            if (song.tags) line += `\n      Style: ${song.tags}`;
            line += `\n      URL: ${song.url}`;
            line += `\n      Audio: ${song.audioUrl}\n`;
            return line;
        })
    ].join('\n');
    
    // ====== STEP 4: DOWNLOAD FILES ======
    console.log('\n?? Step 4/4: Downloading files...');
    
    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`   ? ${filename}`);
    }
    
    downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
    downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
    downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');
    
    // ====== SUMMARY ======
    console.log('\n' + '?'.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('?'.repeat(70));
    console.log(`   ?? Total songs: ${songs.length}`);
    console.log(`   ?? Files saved to ~/Downloads/:`);
    console.log(`      ?? suno-export-${timestamp}.csv`);
    console.log(`      ?? suno-export-${timestamp}.json`);
    console.log(`      ?? suno-export-${timestamp}.txt`);
    console.log('?'.repeat(70));
    console.log('\n?? Tips:');
    console.log('   ? Type "extractedSongs" to view data in console');
    console.log('   ? Type "extractedSongs[0]" to see first song details');
    console.log('   ? Type "extractedSongs.length" to see total count');
    console.log('\n');
    
    // Show preview
    console.log('?? First 5 songs:');
    console.table(songs.slice(0, 5).map(s => ({
        Title: s.title,
        Duration: s.duration,
        Author: s.author,
        Tags: s.tags?.slice(0, 30) + (s.tags?.length > 30 ? '...' : '')
    })));
    
    // Make data available globally
    window.extractedSongs = songs;
    
})().catch(error => {
    console.error('\n? ERROR:', error);
    console.error('Please report this issue with the error message above');
});
7511-c703a0fccf850651.js:18 ?? ULTIMATE SUNO EXTRACTOR v2.0
7511-c703a0fccf850651.js:18 ??????????????????????????????????????????????????????????????????????
7511-c703a0fccf850651.js:18 
?? Step 1/4: Auto-scrolling to load all songs...
Promise {<pending>}
7511-c703a0fccf850651.js:18    ?? Scroll 1: 20 songs (+20)
7511-c703a0fccf850651.js:18    ? Waiting... 1/5
7511-c703a0fccf850651.js:18    ? Waiting... 2/5
7511-c703a0fccf850651.js:18    ? Waiting... 3/5
7511-c703a0fccf850651.js:18    ? Waiting... 4/5
7511-c703a0fccf850651.js:18    ? Waiting... 5/5
7511-c703a0fccf850651.js:18 ? Loaded 20 songs in 1 scrolls
7511-c703a0fccf850651.js:18 
?? Step 2/4: Extracting song data...
7511-c703a0fccf850651.js:18    Found 80 song elements
7511-c703a0fccf850651.js:18 ? Extracted 20 unique songs
7511-c703a0fccf850651.js:18 
?? Step 3/4: Creating export files...
7511-c703a0fccf850651.js:18 
?? Step 4/4: Downloading files...
7511-c703a0fccf850651.js:18    ? suno-export-2025-11-05T05-45-23.csv
7511-c703a0fccf850651.js:18    ? suno-export-2025-11-05T05-45-23.json
7511-c703a0fccf850651.js:18    ? suno-export-2025-11-05T05-45-23.txt
7511-c703a0fccf850651.js:18 
??????????????????????????????????????????????????????????????????????
7511-c703a0fccf850651.js:18 ?? EXTRACTION COMPLETE!
7511-c703a0fccf850651.js:18 ??????????????????????????????????????????????????????????????????????
7511-c703a0fccf850651.js:18    ?? Total songs: 20
7511-c703a0fccf850651.js:18    ?? Files saved to ~/Downloads/:
7511-c703a0fccf850651.js:18       ?? suno-export-2025-11-05T05-45-23.csv
7511-c703a0fccf850651.js:18       ?? suno-export-2025-11-05T05-45-23.json
7511-c703a0fccf850651.js:18       ?? suno-export-2025-11-05T05-45-23.txt
7511-c703a0fccf850651.js:18 ??????????????????????????????????????????????????????????????????????
7511-c703a0fccf850651.js:18 
?? Tips:
7511-c703a0fccf850651.js:18    ? Type "extractedSongs" to view data in console
7511-c703a0fccf850651.js:18    ? Type "extractedSongs[0]" to see first song details
7511-c703a0fccf850651.js:18    ? Type "extractedSongs.length" to see total count
7511-c703a0fccf850651.js:18 
7511-c703a0fccf850651.js:18 ?? First 5 songs:
VM547:261 
(index)
Title
Duration
Author
Tags
0	'BackAlley Anthem Raw 204'	''	''	''
1	'BackAlley Anthem Raw216'	''	''	''
2	'BackAlley Anthem120'	''	''	''
3	'BackAlley Anthem114'	''	''	''
4	'Back Alley Anthem (Dumpster Fire Edit)'	''	''	''
Array(5)
// ULTIMATE SUNO EXTRACTOR v2.1 - EXTRACT LYRICS & SIDE PANEL
// Paste this into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('?? ULTIMATE SUNO EXTRACTOR v2.1 (lyrics + sidebar)');
  console.log('?'.repeat(70));

  const CONFIG = {
    SCROLL_DELAY: 1200,      // ms between scrolls
    MAX_SCROLLS: 500,
    MIN_NO_CHANGE: 5,
    EXTRACT_LYRICS: true,    // fetch song detail pages to pull lyrics/transcript
    PER_SONG_DELAY: 350      // ms between detail page fetches
  };

  // ---------- Step 1: auto-scroll to load all songs ----------
  console.log('\n?? Step 1/4: Auto-scrolling to load all songs...');
  let scrollCount = 0;
  let lastSongCount = 0;
  let noChangeCount = 0;

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const songLinks = document.querySelectorAll('a[href*="/song/"]');
      const unique = new Set();
      songLinks.forEach(l => {
        const m = l.href.match(/\/song\/([a-f0-9-]{36})/);
        if (m) unique.add(m[1]);
      });
      const songCount = unique.size;
      if (songCount === lastSongCount) {
        noChangeCount++;
        // silent log to avoid huge spam
        console.log(`   ? Waiting... ${noChangeCount}/${CONFIG.MIN_NO_CHANGE}`);
        if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(`? Loaded ${songCount} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChangeCount = 0;
        scrollCount++;
        const added = songCount - lastSongCount;
        lastSongCount = songCount;
        console.log(`   ?? Scroll ${scrollCount}: ${songCount} songs (+${added})`);
      }
      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.log('?? Max scrolls reached');
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // ---------- Step 2: extract summary list ----------
  console.log('\n?? Step 2/4: Extracting basic song objects from page DOM...');
  const songs = [];
  const seen = new Set();
  const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'));

  anchorEls.forEach((el, idx) => {
    try {
      const match = el.href.match(/\/song\/([a-f0-9-]{36})/);
      if (!match) return;
      const id = match[1];
      if (seen.has(id)) return;
      seen.add(id);

      // find a sensible container nearby
      const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;

      // title
      const titleEl = el.querySelector('[title]') || el.querySelector('[class*="title"]') || el;
      const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim() || 'Untitled';

      // duration
      const durationEl = container?.querySelector('[class*="duration"], .font-mono, time, span[title*=":"], span[class*="font-mono"]');
      const duration = durationEl?.textContent?.trim() || '';

      // image
      const imgEl = el.querySelector('img') || container?.querySelector('img');
      let imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
      if (imageUrl) {
        imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720','');
      }

      // tags (styles)
      const tagEls = container?.querySelectorAll('a[href*="/style/"], div[title] > span') || [];
      const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean);

      // author
      const authorA = container?.querySelector('a[href^="/@"]') || document.querySelector('a[href^="/@"]');
      const author = authorA?.textContent?.trim() || '';
      const authorLink = authorA?.href || '';

      // plays / likes (best-effort)
      const playEl = container?.querySelector('[title*="play"], [class*="play-count"]');
      const plays = playEl?.textContent?.trim() || '';
      const likeEl = container?.querySelector('[title*="like"], [class*="like"]');
      const likes = likeEl?.textContent?.trim() || '';

      songs.push({
        id, title, url: `https://suno.com/song/${id}`, imageUrl, duration,
        tags: tags.join(', '), author, authorLink, plays, likes,
        extractedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('extract error', err);
    }
  });

  console.log(`? Found ${songs.length} unique songs on page`);

  if (songs.length === 0) {
    console.error('No songs found — make sure you are on a Suno page with songs visible.');
    return;
  }

  // ---------- Step 3: fetch per-song detail page and parse lyrics/sidebar ----------
  if (CONFIG.EXTRACT_LYRICS) {
    console.log('\n?? Step 3/4: Fetching each song page for lyrics & sidebar info (this may take a while)...');
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      try {
        // polite delay
        await new Promise(r => setTimeout(r, CONFIG.PER_SONG_DELAY));

        const detailUrl = `/song/${s.id}`;
        const res = await fetch(detailUrl, { credentials: 'same-origin' });
        if (!res.ok) {
          console.warn(`   ! Failed to fetch ${detailUrl} (status ${res.status})`);
          continue;
        }
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1) lyrics / transcript: observed in your snippet as .whitespace-pre-wrap
        let lyricsEl = doc.querySelector('.whitespace-pre-wrap') ||
                       doc.querySelector('[data-testid="lyrics"]') ||
                       Array.from(doc.querySelectorAll('pre, p, span'))
                         .find(el => /\[Verse|\[Chorus|\[Intro|When the/.test(el.textContent || ''));

        const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';

        // 2) sidebar summary / description / date
        let summaryEl = doc.querySelector('.mt-1.cursor-pointer') || doc.querySelector('[title*="Show Summary"]');
        let summary = '';
        if (!summaryEl) {
          // fallback: meta description or og:description
          summary = (doc.querySelector('meta[name="description"]')?.content ||
                     doc.querySelector('meta[property="og:description"]')?.content || '').trim();
        } else {
          summary = summaryEl.textContent?.trim() || '';
        }

        // 3) author & tags (fallbacks)
        const authorAnchor = doc.querySelector('a[href^="/@"]');
        const authorName = authorAnchor?.textContent?.trim() || s.author || '';
        const tagNodes = doc.querySelectorAll('div[title] span') || doc.querySelectorAll('.gap-2 span');
        const extractedTags = Array.from(tagNodes).map(n => n.textContent?.trim()).filter(Boolean);
        const tagsJoined = extractedTags.length ? extractedTags.join(', ') : s.tags || '';

        // 4) audio src (if present)
        const audioEl = doc.querySelector('audio[src]') || doc.querySelector('meta[property="og:audio"]');
        let audioUrl = '';
        if (audioEl) {
          audioUrl = audioEl.src || audioEl.content || '';
        } else {
          // fallback pattern
          audioUrl = `https://cdn1.suno.ai/${s.id}.mp3`;
        }

        // attach to song object
        s.lyrics = lyrics;
        s.sidebarSummary = summary;
        s.detailAuthor = authorName;
        s.detailTags = tagsJoined;
        s.detailAudio = audioUrl;

        console.log(`   ✅ [${i+1}/${songs.length}] ${s.title} — lyrics ${lyrics ? 'found' : 'NOT found'}`);
      } catch (err) {
        console.warn(`   ! Error fetching/parsing ${s.url}:`, err);
      }
    }
  } else {
    console.log('?? EXTRACT_LYRICS disabled — skipping detail fetches');
  }

  // ---------- Step 4: prepare and download CSV / JSON / TXT ----------
  console.log('\n?? Step 4/4: creating download files...');
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

  // ensure stable keys and consistent columns
  const fields = [
    'id','title','url','imageUrl','duration','tags','author','authorLink','plays','likes',
    'detailAuthor','detailTags','detailAudio','sidebarSummary','lyrics','extractedAt'
  ];

  // CSV
  const csvRows = [
    fields.join(',')
  ];
  songs.forEach(s => {
    const row = fields.map(k => {
      const v = String(s[k] || '').replace(/"/g,'""');
      return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
    }).join(',');
    csvRows.push(row);
  });
  const csvContent = csvRows.join('\n');

  // JSON
  const jsonContent = JSON.stringify(songs, null, 2);

  // TXT summary
  const txtLines = [
    '?? SUNO COLLECTION EXPORT (with lyrics & sidebar)',
    '?'.repeat(70),
    `Exported: ${new Date().toLocaleString()}`,
    `Total Songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    '?'.repeat(70),
    ''
  ];
  songs.forEach((s, i) => {
    txtLines.push(`${String(i+1).padStart(3)}. ${s.title} ${s.duration ? '['+s.duration+']':''}`);
    if (s.author) txtLines.push(`     By: ${s.author}`);
    if (s.detailAuthor && s.detailAuthor !== s.author) txtLines.push(`     Detail Author: ${s.detailAuthor}`);
    if (s.tags) txtLines.push(`     Tags: ${s.tags}`);
    if (s.detailTags && s.detailTags !== s.tags) txtLines.push(`     Detail Tags: ${s.detailTags}`);
    if (s.sidebarSummary) txtLines.push(`     Summary: ${s.sidebarSummary.slice(0,200)}${s.sidebarSummary.length>200?'...':''}`);
    if (s.lyrics) txtLines.push(`     Lyrics:\n${s.lyrics.slice(0,800)}${s.lyrics.length>800?'...':''}`);
    if (s.detailAudio) txtLines.push(`     Audio: ${s.detailAudio}`);
    txtLines.push(`     URL: ${s.url}`);
    txtLines.push('');
  });
  const txtContent = txtLines.join('\n');

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   ? ${filename}`);
  }

  downloadFile(csvContent, `suno-export-${timestamp}.csv`, 'text/csv');
  downloadFile(jsonContent, `suno-export-${timestamp}.json`, 'application/json');
  downloadFile(txtContent, `suno-export-${timestamp}.txt`, 'text/plain');

  window.extractedSongs = songs;

  console.log('\n' + '?'.repeat(70));
  console.log('?? EXTRACTION COMPLETE!');
  console.log('?'.repeat(70));
  console.log(`   ?? Total songs: ${songs.length}`);
  console.log('   ?? Files saved to ~/Downloads/');
  console.table(songs.slice(0,10).map(s => ({Title: s.title, Duration: s.duration, Author: s.author, HasLyrics: !!s.lyrics})));
})();

// ULTIMATE SUNO EXTRACTOR v2.2 - CLICK & SCRAPE SIDE PANEL (resume, retries)
// Paste into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('🎛️ ULTIMATE SUNO EXTRACTOR v2.2 — Click & Scrape Side Panel');
  console.log('-'.repeat(70));

  // ---------- CONFIG ----------
  const CONFIG = {
    SCROLL_DELAY: 900,        // ms between auto-scroll steps
    MAX_SCROLLS: 1000,
    MIN_NO_CHANGE: 4,
    CLICK_DELAY: 450,        // ms after clicking a row before polling for panel
    PER_SONG_DELAY: 300,     // ms delay between each scraped song to avoid stress
    PANEL_TIMEOUT: 8000,     // ms to wait for side panel content to appear
    RETRIES: 2,              // number of retries if panel fails
    RESUME_KEY: 'suno_extractor_v2_progress', // sessionStorage key for resume
    SELECTORS: {
      // possible selectors for side-panel lyrics and summary (fallback chain)
      PANEL_CONTAINER: '.chakra-portal, [data-testid="song-detail"], .song-panel, aside',
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]'
    }
  };

  // ---------- helpers ----------
  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  async function waitFor(conditionFn, timeout = 6000, interval = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = conditionFn();
        if (res) return res;
      } catch (e) { /* ignore */ }
      await wait(interval);
    }
    return null;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log(`✅ Saved: ${filename}`);
  }

  function toCSV(rows, headers) {
    const lines = [];
    lines.push(headers.join(','));
    for (const r of rows) {
      const line = headers.map(h => {
        const v = String(r[h] ?? '').replace(/"/g, '""');
        return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
      }).join(',');
      lines.push(line);
    }
    return lines.join('\n');
  }

  // ---------- Step 1: auto-scroll to load all songs ----------
  console.log('▶ Step 1: Auto-scrolling to load all songs...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = document.querySelectorAll('a[href*="/song/"]');
      const unique = new Set(Array.from(anchors).map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        console.log(`   waiting... ${noChange}/${CONFIG.MIN_NO_CHANGE}`);
        if (noChange >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(`   loaded ${count} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChange = 0;
        scrollCount++;
        console.log(`   scroll ${scrollCount}: ${count} songs (+${count - lastCount})`);
        lastCount = count;
      }
      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.warn('   max scrolls reached');
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // ---------- Step 2: collect anchors ----------
  console.log('▶ Step 2: Collecting song anchors...');
  const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'))
    .map(a => ({ el: a, href: a.href }))
    .filter((v,i,self) => self.findIndex(x => x.href===v.href)===i);
  // Map ids
  const songsToProcess = anchors.map(a => {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m ? m[1] : null, el: a.el, href: a.href };
  }).filter(x => x.id);
  console.log(`   found ${songsToProcess.length} unique song anchors`);

  // Load progress/resume
  const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   processed so far: ${Object.keys(progress.processed).length}`);

  // ---------- Step 3: click each row, scrape side panel ----------
  console.log('▶ Step 3: Scrape each song by clicking rows (this may take a while)');
  const extracted = [];
  for (let idx = 0; idx < songsToProcess.length; idx++) {
    const { id, el, href } = songsToProcess[idx];
    if (progress.processed[id]) {
      // already done
      extracted.push(progress.processed[id]);
      console.log(`   ↳ [${idx+1}/${songsToProcess.length}] SKIP ${id} (already processed)`);
      continue;
    }

    let attempt = 0, success = false, lastError = null;
    while (attempt <= CONFIG.RETRIES && !success) {
      attempt++;
      try {
        // Scroll row into view & click
        el.scrollIntoView({ block: 'center', inline: 'center' });
        await wait(120);
        el.click();
        await wait(CONFIG.CLICK_DELAY);

        // Wait for PANEL container or LYRICS selector
        const panel = await waitFor(() => {
          return document.querySelector(CONFIG.SELECTORS.PANEL_CONTAINER);
        }, CONFIG.PANEL_TIMEOUT, 200);

        if (!panel) {
          throw new Error('Panel did not appear');
        }

        // Try to find lyrics and summary inside the panel
        const lyricsEl = panel.querySelector(CONFIG.SELECTORS.LYRICS) ||
                         panel.querySelector('div[role="document"] pre, div[role="document"] p, div[role="document"] span');

        const summaryEl = panel.querySelector(CONFIG.SELECTORS.SUMMARY) ||
                          panel.querySelector('.description, .summary, [data-testid="summary"]');

        const authorEl = panel.querySelector(CONFIG.SELECTORS.AUTHOR) || document.querySelector(CONFIG.SELECTORS.AUTHOR);
        const tagEls = panel.querySelectorAll(CONFIG.SELECTORS.TAGS) || [];

        // audio (in-panel) fallback
        const audioNode = panel.querySelector(CONFIG.SELECTORS.AUDIO_META) || document.querySelector(CONFIG.SELECTORS.AUDIO_META);
        let audioSrc = '';
        if (audioNode) {
          audioSrc = audioNode.src || audioNode.content || audioNode.getAttribute('src') || '';
        }

        // Title: panel header or anchor text
        const titleFromPanel = panel.querySelector('h1, h2, [data-testid="song-title"], .song-title, .chakra-heading')?.textContent?.trim();
        const titleFromAnchor = el.querySelector('[title]')?.getAttribute('title') || el.textContent?.trim();
        const title = titleFromPanel || titleFromAnchor || '';

        const lyrics = lyricsEl ? (lyricsEl.textContent || '').trim() : '';
        const summary = summaryEl ? (summaryEl.textContent || '').trim() : '';
        const author = authorEl ? (authorEl.textContent || '').trim() : '';
        const tags = Array.from(tagEls).map(n => (n.textContent||'').trim()).filter(Boolean).join(', ');

        // duration and image from anchor's container (best-effort)
        const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
        const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
        const img = container?.querySelector('img')?.src || '';
        const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

        // Save song object
        const songObj = {
          id, href, title, author, tags, duration, imageUrl,
          summary, lyrics, audio: audioSrc,
          scrapedAt: new Date().toISOString()
        };
        extracted.push(songObj);
        progress.processed[id] = songObj;
        sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));

        // Close the panel: try close button, overlay, or Escape
        let closed = false;
        const closeBtn = document.querySelector('button[aria-label="Close"], button[title="Close"], button[class*="close"], [data-testid="close-button"]');
        if (closeBtn) {
          closeBtn.click();
          closed = true;
        } else {
          // click overlay if present
          const overlay = document.querySelector('.chakra-portal ~ div, .modal-backdrop, .overlay');
          if (overlay) {
            overlay.click();
            closed = true;
          }
        }
        if (!closed) {
          // fallback: press Escape
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }

        // small pause for DOM to settle
        await wait(CONFIG.PER_SONG_DELAY);
        console.log(`   ✅ [${idx+1}/${songsToProcess.length}] ${title || id} — lyrics ${lyrics ? 'FOUND' : 'NO LYRICS'}`);
        success = true;
      } catch (err) {
        lastError = err;
        console.warn(`   ! [${idx+1}] attempt ${attempt} failed: ${err.message}`);
        // try to close any dangling panels and continue retry
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
        await wait(600 + attempt * 200);
      }
    } // retries

    if (!success) {
      console.error(`   ✖ [${idx+1}] FAILED to scrape ${id}:`, lastError?.message || lastError);
      // still mark as failed so resume won't loop infinitely
      progress.processed[id] = { id, href, error: String(lastError || 'unknown'), scrapedAt: new Date().toISOString() };
      sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
      extracted.push(progress.processed[id]);
    }
  } // for each song

  // ---------- Step 4: Export ----------
  console.log('▶ Step 4: Exporting results...');
  const all = extracted;
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
  const csv = toCSV(all, headers);
  downloadFile(csv, `suno-click-extract-${ts}.csv`, 'text/csv');
  downloadFile(JSON.stringify(all, null, 2), `suno-click-extract-${ts}.json`, 'application/json');

  // TXT summary
  const txt = [
    `Suno Click Extract - ${new Date().toLocaleString()}`,
    `Total: ${all.length}`,
    '',
    ...all.map((s,i)=> {
      const lines = [];
      lines.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration ? '['+s.duration+']': ''}`);
      if (s.author) lines.push(`     Author: ${s.author}`);
      if (s.tags) lines.push(`     Tags: ${s.tags}`);
      if (s.summary) lines.push(`     Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}`);
      if (s.lyrics) lines.push(`     Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}`);
      if (s.audio) lines.push(`     Audio: ${s.audio}`);
      lines.push(`     URL: ${s.href}`);
      lines.push('');
      return lines.join('\n');
    })
  ].join('\n');
  downloadFile(txt, `suno-click-extract-${ts}.txt`, 'text/plain');

  // make available for inspection
  window.extractedSongs = all;
  console.log('🎉 Extraction complete — check ~/Downloads/ for files and use window.extractedSongs to inspect data.');
  console.log('-'.repeat(70));

})();

// ULTIMATE SUNO EXTRACTOR v2.3 - CLICK + OBSERVER + FETCH FALLBACK + AUTOSAVE
// Paste into Console on a Suno page (library / playlist / profile)

(async function() {
  console.log('🛠️ ULTIMATE SUNO EXTRACTOR v2.3 — resilient click + observer + fallback');
  console.log('-'.repeat(70));

  // CONFIG
  const C = {
    SCROLL_DELAY: 900,
    MIN_NO_CHANGE: 4,
    MAX_SCROLLS: 1000,
    CLICK_DELAY: 350,
    PANEL_WAIT: 9000,
    PER_SONG_DELAY: 350,
    RETRIES: 2,
    RESUME_KEY: 'suno_extractor_v2_progress',
    SAVE_INTERVAL: 10, // autosave every N songs
    SELECTORS: {
      ANCHOR: 'a[href*="/song/"]',
      PANEL_CANDIDATES: '.chakra-portal, [data-testid="song-detail"], aside, .song-panel, [role="dialog"]',
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, .song-lyrics, pre',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, .song-summary',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], meta[property="og:audio"], source[src]',
      PANEL_CLOSE: 'button[aria-label="Close"], button[title="Close"], [data-testid="close-button"], button[class*="close"]'
    }
  };

  // util
  const wait = ms => new Promise(r=>setTimeout(r, ms));
  function now(){ return new Date().toISOString(); }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    console.log(`✅ Saved: ${filename}`);
  }
  function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h=>{
        const v = String(r[h]??'').replace(/"/g,'""');
        return (v.includes(',')||v.includes('\n')) ? `"${v}"` : v;
      }).join(','));
    }
    return lines.join('\n');
  }

  // auto-scroll to load all songs
  console.log('▶ Step 1: Auto-scrolling to load songs...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise(resolve => {
    const iv = setInterval(()=>{
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR));
      const unique = new Set(anchors.map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        console.log(`   waiting... ${noChange}/${C.MIN_NO_CHANGE}`);
        if (noChange >= C.MIN_NO_CHANGE) {
          clearInterval(iv);
          console.log(`   loaded ${count} songs after ${scrollCount} scroll(s)`);
          resolve();
        }
      } else {
        noChange = 0; scrollCount++; console.log(`   scroll ${scrollCount}: ${count} songs (+${count-lastCount})`); lastCount = count;
      }
      if (scrollCount >= C.MAX_SCROLLS) {
        clearInterval(iv); console.warn('   max scrolls reached'); resolve();
      }
    }, C.SCROLL_DELAY);
  });

  // collect anchors (unique)
  console.log('▶ Step 2: Collect anchors...');
  const anchorsRaw = Array.from(document.querySelectorAll(C.SELECTORS.ANCHOR));
  const anchors = anchorsRaw.map(a=>({el:a, href:a.href})).filter((v,i,self)=> self.findIndex(x=>x.href===v.href)===i);
  const items = anchors.map(a=>{
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m?m[1]:null, el: a.el, href: a.href };
  }).filter(x=>x.id);
  console.log(`   found ${items.length} unique song anchors`);

  // resume
  const saved = sessionStorage.getItem(C.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   previously processed: ${Object.keys(progress.processed).length}`);

  // MutationObserver helper to detect panel appearance
  function observePanel(timeout = C.PANEL_WAIT) {
    return new Promise((resolve) => {
      let timer = null;
      const observer = new MutationObserver((mutations) => {
        const panel = document.querySelector(C.SELECTORS.PANEL_CANDIDATES);
        if (panel) {
          clearTimeout(timer); observer.disconnect(); resolve(panel);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // also immediate check
      const immediate = document.querySelector(C.SELECTORS.PANEL_CANDIDATES);
      if (immediate) { observer.disconnect(); resolve(immediate); return; }
      timer = setTimeout(()=>{ observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // robust click strategies
  function syntheticClick(el) {
    try {
      el.scrollIntoView({block:'center', inline:'center'});
      // try native click
      el.click();
      return true;
    } catch(e) {}
    // try pointer events at element center
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top + rect.height/2;
      ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(name=>{
        el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerType: 'mouse'}));
      });
      return true;
    } catch(e){}
    // try finding a clickable child
    try {
      const clickable = el.querySelector('button, [role="button"], svg, img') || el;
      clickable.click();
      return true;
    } catch(e){}
    return false;
  }

  // fetch fallback (parses HTML)
  async function fetchDetailParse(id) {
    try {
      const url = `/song/${id}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch failed '+res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lyrics = (doc.querySelector(C.SELECTORS.LYRICS)?.textContent || '').trim();
      const summary = (doc.querySelector(C.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim();
      const author = (doc.querySelector(C.SELECTORS.AUTHOR)?.textContent || '').trim();
      const tags = Array.from(doc.querySelectorAll(C.SELECTORS.TAGS)).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      const audioNode = doc.querySelector(C.SELECTORS.AUDIO_META);
      const audio = audioNode?.src || audioNode?.content || '';
      return { lyrics, summary, author, tags, audio };
    } catch(e) {
      console.warn('   fetch-detail failed for', id, e.message);
      return {};
    }
  }

  // extraction loop
  console.log('▶ Step 3: Scrape items (click + observer, with fetch fallback)');
  const results = [];
  for (let idx=0; idx<items.length; idx++) {
    const {id, el, href} = items[idx];
    if (progress.processed[id]) {
      results.push(progress.processed[id]);
      console.log(`   ↳ [${idx+1}/${items.length}] SKIP ${id}`);
      continue;
    }
    let ok=false, attempt=0, lastErr=null;
    while (attempt <= C.RETRIES && !ok) {
      attempt++;
      try {
        // scroll & click via synthetic strategies
        syntheticClick(el);
        await wait(C.CLICK_DELAY);

        // observe panel
        const panel = await observePanel(C.PANEL_WAIT);
        let lyrics='', summary='', author='', tags='', audio='';

        if (panel) {
          // try to extract from panel (multiple fallbacks)
          const lyricNode = panel.querySelector(C.SELECTORS.LYRICS) || panel.querySelector('div[role="document"] pre, div[role="document"] p');
          const summaryNode = panel.querySelector(C.SELECTORS.SUMMARY) || panel.querySelector('.description, .summary');
          const authorNode = panel.querySelector(C.SELECTORS.AUTHOR) || document.querySelector(C.SELECTORS.AUTHOR);
          const tagNodes = panel.querySelectorAll(C.SELECTORS.TAGS) || [];
          const audioNode = panel.querySelector(C.SELECTORS.AUDIO_META) || document.querySelector(C.SELECTORS.AUDIO_META);

          lyrics = lyricNode ? (lyricNode.textContent||'').trim() : '';
          summary = summaryNode ? (summaryNode.textContent||'').trim() : '';
          author = authorNode ? (authorNode.textContent||'').trim() : '';
          tags = Array.from(tagNodes).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
          audio = audioNode ? (audioNode.src || audioNode.content || '') : '';
        } else {
          // fallback: fetch & parse
          const parsed = await fetchDetailParse(id);
          lyrics = parsed.lyrics || '';
          summary = parsed.summary || '';
          author = parsed.author || '';
          tags = parsed.tags || '';
          audio = parsed.audio || '';
        }

        // get title/duration/image best-effort from anchor container
        const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
        const title = (container?.querySelector('h3, h2, [title], [data-testid="song-title"]')?.textContent || el.getAttribute('title') || el.textContent || '').trim();
        const duration = container?.querySelector('time, .duration, .font-mono')?.textContent?.trim() || '';
        const img = container?.querySelector('img')?.src || '';
        const imageUrl = img ? img.replace('/image_','/image_large_').replace('?width=720','') : '';

        const songObj = { id, href, title, author, tags, duration, imageUrl, audio, summary, lyrics, scrapedAt: now() };
        results.push(songObj);
        progress.processed[id] = songObj;
        sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
        ok = true;

        // close panel (try close button or press Escape)
        const closeBtn = document.querySelector(C.SELECTORS.PANEL_CLOSE);
        if (closeBtn) closeBtn.click();
        else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));

        console.log(`   ✅ [${idx+1}/${items.length}] ${title || id} — lyrics ${lyrics? 'FOUND':'NO'}`);
        await wait(C.PER_SONG_DELAY);
      } catch (err) {
        lastErr = err;
        console.warn(`   ! [${idx+1}] attempt ${attempt} error:`, err.message || err);
        // try to close anything and wait before retry
        try { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); } catch(e){}
        await wait(500 + attempt*200);
      }
    } // attempts

    if (!ok) {
      console.error(`   ✖ [${idx+1}] FAILED ${id} — marking error`);
      const failObj = { id, href, error: String(lastErr || 'unknown'), scrapedAt: now() };
      results.push(failObj);
      progress.processed[id] = failObj;
      sessionStorage.setItem(C.RESUME_KEY, JSON.stringify(progress));
    }

    // autosave periodically
    if ((idx+1) % C.SAVE_INTERVAL === 0) {
      console.log(`   ⏺ Autosave at ${idx+1} items`);
      const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      const rows = Object.values(progress.processed);
      const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
      try {
        downloadFile(toCSV(rows, headers), `suno-partial-${ts}.csv`, 'text/csv');
        downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${ts}.json`, 'application/json');
      } catch(e){ console.warn('autosave failed', e); }
    }
  } // for

  // final export
  console.log('▶ Step 4: Final export');
  const all = Object.values(progress.processed);
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error'];
  try {
    downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, 'text/csv');
    downloadFile(JSON.stringify(all, null, 2), `suno-extract-${ts}.json`, 'application/json');
    // TXT summary
    const txt = ['Suno Extract', `Exported: ${new Date().toLocaleString()}`, `Total: ${all.length}`, ''].concat(
      all.map((s,i)=>{
        const L = [];
        L.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'} ${s.duration? '['+s.duration+']':''}`);
        if (s.author) L.push(`    Author: ${s.author}`);
        if (s.tags) L.push(`    Tags: ${s.tags}`);
        if (s.summary) L.push(`    Summary: ${s.summary.slice(0,200)}${s.summary.length>200?'...':''}`);
        if (s.lyrics) L.push(`    Lyrics: ${s.lyrics.slice(0,400)}${s.lyrics.length>400?'...':''}`);
        if (s.audio) L.push(`    Audio: ${s.audio}`);
        L.push(`    URL: ${s.href}`);
        return L.join('\n');
      })
    ).join('\n\n');
    downloadFile(txt, `suno-extract-${ts}.txt`, 'text/plain');
  } catch(e){ console.error('final export failed', e); }

  window.extractedSongs = all;
  console.log('🎉 Extraction complete. Use window.extractedSongs to inspect data. Session progress saved to sessionStorage.');
  console.log('-'.repeat(70));
})().catch(e=>console.error('Fatal error:', e));

// ULTIMATE SUNO EXTRACTOR v2.2 -- Simulate open + extract sidebar (paste into Console)
(async function() {
  console.log('🔭 ULTIMATE SUNO EXTRACTOR v2.2 (click-to-open sidebar)');
  const CFG = {
    SCROLL_DELAY: 900,
    MAX_SCROLLS: 400,
    MIN_NO_CHANGE: 4,
    PER_SONG_WAIT: 900,   // wait after opening sidebar for DOM to populate
    CLOSE_WAIT: 250,
    PER_SONG_DELAY: 200,  // polite delay between songs
    EXTRACT_LYRICS: true,
  };

  // helper wait
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // smart selector waiter
  async function waitForAny(parent = document, selectors = [], timeout = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const sel of selectors) {
        const el = parent.querySelector(sel);
        if (el) return el;
      }
      await wait(150);
    }
    return null;
  }

  // Step 1 - autoscroll to load items
  console.log('➡️ Step 1: autoscroll to load songs...');
  let lastCount=0, noChange=0, scrolls=0;
  await new Promise(resolve => {
    const intv = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const anchors = document.querySelectorAll('a[href*="/song/"]');
      // count unique ids
      const ids = new Set(Array.from(anchors).map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = ids.size;
      if (count === lastCount) {
        noChange++;
        if (noChange >= CFG.MIN_NO_CHANGE || scrolls >= CFG.MAX_SCROLLS) {
          clearInterval(intv);
          console.log(`   ✅ Loaded ≈ ${count} songs (scrolls: ${scrolls})`);
          resolve();
        }
      } else {
        noChange = 0;
        scrolls++;
        lastCount = count;
        console.log(`   🔁 scroll ${scrolls}: ${count} songs`);
      }
    }, CFG.SCROLL_DELAY);
  });

  // Step 2 - collect anchors
  console.log('➡️ Step 2: collecting song anchors...');
  const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'))
    .map(a => ({ el: a, id: (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1] }))
    .filter(x => x.id);
  console.log(`   ✅ Found ${anchors.length} anchors`);

  if (!anchors.length) { console.error('No song anchors found — make sure you are on a Suno list page.'); return; }

  // utilities to open & close side panel safely
  async function openViaClick(anchorEl) {
    try {
      // Try focused pointer events to mimic real user
      ['pointerdown','pointerup','mousedown','mouseup','click'].forEach(type=>{
        anchorEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      // give client time to open panel
      await wait(120);
      return true;
    } catch(e) {
      return false;
    }
  }

  async function closePanel() {
    // try Escape
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    // try clicking any close button
    const btn = document.querySelector('button[aria-label*="Close"], button[aria-label*="close"], button[title*="Close"]');
    if (btn) btn.click();
    await wait(CFG.CLOSE_WAIT);
  }

  // Step 3 - iterate and extract
  console.log('➡️ Step 3: extracting per-song detail (this will take a bit)...');
  const songs = [];
  for (let i=0;i<anchors.length;i++) {
    const {el, id} = anchors[i];
    try {
      // skip duplicates
      if (songs.find(s=>s.id===id)) continue;

      // open sidebar via click simulation
      let opened = await openViaClick(el);
      // wait for sidebar content DOM nodes that Suno typically uses (several fallbacks)
      const sidebarSelectors = [
        '.whitespace-pre-wrap',            // lyrics area
        '[data-testid="lyrics"]',          // test id
        '.song-sidebar',                   // hypothetical custom wrapper
        'div[role="dialog"] .whitespace-pre-wrap',
        '.mt-1.cursor-pointer',            // summary area seen in some markup
        'main .whitespace-pre-wrap'
      ];
      const sidebarEl = await waitForAny(document, sidebarSelectors, CFG.PER_SONG_WAIT);

      // If sidebar not visible, fallback: try fetching server page (v2.1 style)
      let lyrics = '', summary = '', author = '', audioUrl = '';
      if (sidebarEl) {
        // fetch content from the live DOM
        // lyrics
        const lySel = sidebarSelectors.join(',');
        const lyNode = document.querySelector(lySel);
        lyrics = lyNode ? (lyNode.textContent || '').trim() : '';

        // summary - several places
        const sumNode = document.querySelector('.mt-1.cursor-pointer') ||
                        document.querySelector('[data-testid="summary"]') ||
                        document.querySelector('meta[property="og:description"]') ||
                        null;
        summary = sumNode ? (sumNode.textContent || sumNode.content || '').trim() : '';

        // audio url - check audio element in page (sometimes injected)
        const audioEl = document.querySelector('audio[src]') || document.querySelector('audio');
        audioUrl = audioEl ? (audioEl.src || audioEl.getAttribute('src') || '') : `https://cdn1.suno.ai/${id}.mp3`;

        // author - sidebar or main page
        const authEl = document.querySelector('a[href^="/@"]') || document.querySelector('.author') || null;
        author = authEl ? (authEl.textContent || '').trim() : '';

        // keep the side-panel open long enough (optional)
        await wait(120);
      } else {
        // fallback: fetch detail URL (server HTML). Might miss client-inserted lyrics — but it often returns metadata.
        try {
          const res = await fetch(`/song/${id}`, { credentials: 'same-origin' });
          if (res.ok) {
            const html = await res.text();
            // quick parse
            const p = new DOMParser();
            const d = p.parseFromString(html, 'text/html');
            const textLy = d.querySelector('.whitespace-pre-wrap') || d.querySelector('[data-testid="lyrics"]') || d.querySelector('pre, p');
            lyrics = textLy ? (textLy.textContent || '').trim() : '';
            const metaDesc = d.querySelector('meta[property="og:description"]') || d.querySelector('meta[name="description"]');
            summary = metaDesc ? (metaDesc.content || '').trim() : '';
            const audioEl = d.querySelector('audio[src]') || d.querySelector('meta[property="og:audio"]');
            audioUrl = audioEl ? (audioEl.src || audioEl.content || `https://cdn1.suno.ai/${id}.mp3`) : `https://cdn1.suno.ai/${id}.mp3`;
          } else {
            audioUrl = `https://cdn1.suno.ai/${id}.mp3`;
          }
        } catch (err) {
          // final fallback
          audioUrl = `https://cdn1.suno.ai/${id}.mp3`;
        }
      }

      // find title/thumbnail/duration from the anchor/container
      const container = el.closest('[data-clip-id], [data-testid="song-row"], div') || el;
      const titleEl = el.querySelector('[title]') || el.querySelector('[class*="title"]') || el;
      const title = (titleEl?.getAttribute?.('title') || titleEl?.textContent || '').trim() || 'Untitled';
      const imgEl = el.querySelector('img') || container?.querySelector('img');
      let imageUrl = imgEl?.src || imgEl?.getAttribute?.('data-src') || '';
      if (imageUrl) imageUrl = imageUrl.replace('/image_','/image_large_').replace('?width=720','');
      const durationEl = container?.querySelector('[class*="duration"], time, .font-mono, span[title*=":"]');
      const duration = durationEl?.textContent?.trim() || '';

      // tags & author link
      const tagEls = container?.querySelectorAll('a[href*="/style/"], div[title] span') || [];
      const tags = Array.from(tagEls).map(t=>t.textContent?.trim()).filter(Boolean).join(', ');
      const authorAnchor = container?.querySelector('a[href^="/@"]') || document.querySelector('a[href^="/@"]');
      const authorLink = authorAnchor?.href || '';

      const songObj = {
        id, title, url: `https://suno.com/song/${id}`, imageUrl, duration, tags,
        author: author || (authorAnchor?.textContent || '').trim() || '',
        authorLink, plays:'', likes:'', detailAudio: audioUrl, sidebarSummary: summary, lyrics,
        extractedAt: new Date().toISOString()
      };

      songs.push(songObj);
      console.log(`   ✅ [${i+1}/${anchors.length}] ${title} (${id}) — lyrics ${lyrics? 'found':'NOT found (fallback maybe)'} `);

      // close the panel before moving on
      await closePanel();
      await wait(CFG.PER_SONG_DELAY);
    } catch (err) {
      console.warn(`   ⚠️ Error on song ${i+1}:`, err);
      try { await closePanel(); } catch(e) {}
    }
  }

  // Step 4 - prepare files and download (CSV / JSON / TXT)
  console.log('➡️ Step 4: packaging files...');
  if (!songs.length) { console.error('No songs extracted.'); return; }

  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const fields = Object.keys(songs[0]);
  const csv = [fields.join(',')].concat(songs.map(s => fields.map(k => {
    const v = String(s[k] || '').replace(/"/g,'""');
    return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
  }).join(','))).join('\n');
  const json = JSON.stringify(songs, null, 2);

  const txtLines = ['🔸 SUNO EXPORT (v2.2)', '?'.repeat(60), `Exported: ${new Date().toLocaleString()}`, `Total: ${songs.length}`, '?'.repeat(60), ''];
  songs.forEach((s, idx) => {
    txtLines.push(`${String(idx+1).padStart(3)}. ${s.title} ${s.duration? '['+s.duration+']':''}`);
    if (s.author) txtLines.push(`     By: ${s.author}`);
    if (s.sidebarSummary) txtLines.push(`     Summary: ${s.sidebarSummary.slice(0,200)}${s.sidebarSummary.length>200?'...':''}`);
    if (s.lyrics) txtLines.push(`     Lyrics:\n${s.lyrics.slice(0,800)}${s.lyrics.length>800?'...':''}`);
    txtLines.push(`     Audio: ${s.detailAudio}`);
    txtLines.push(`     URL: ${s.url}\n`);
  });
  const txt = txtLines.join('\n');

  function dl(content, name, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  dl(csv, `suno-export-${ts}.csv`, 'text/csv');
  dl(json, `suno-export-${ts}.json`, 'application/json');
  dl(txt, `suno-export-${ts}.txt`, 'text/plain');

  window.extractedSongs = songs;
  console.log('🎉 Extraction complete! Total songs:', songs.length);
  console.table(songs.slice(0,10).map(s=>({Title:s.title, Author:s.author, HasLyrics:!!s.lyrics})));
})();

// ULTIMATE SUNO EXTRACTOR v2.4 - NO CLICK: INLINE JSON -> FETCH -> HIDDEN IFRAME (resume + autosave)
// Paste into Console on https://suno.com/library (or any Suno list page)

(async function() {
  console.log('🔧 ULTIMATE SUNO EXTRACTOR v2.4 — NO-CLICK (json -> fetch -> iframe)');
  console.log('-'.repeat(70));

  const CONFIG = {
    SCROLL_DELAY: 900,
    MIN_NO_CHANGE: 4,
    MAX_SCROLLS: 1000,
    PER_SONG_DELAY: 350,
    PANEL_WAIT_IFRAME: 9000,
    RETRIES: 2,
    RESUME_KEY: 'suno_extractor_v2_progress',
    SAVE_INTERVAL: 15,
    SELECTORS: {
      LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, pre, .song-lyrics',
      SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description',
      AUTHOR: 'a[href^="/@"]',
      TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
      AUDIO_META: 'audio[src], source[src], meta[property="og:audio"]'
    }
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));
  function now(){ return new Date().toISOString(); }
  function downloadFile(content, filename, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      console.log(`✅ Saved: ${filename}`);
    } catch (e) { console.error('download failed', e); }
  }
  function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h=>{
        const v = String(r[h] ?? '').replace(/"/g,'""');
        return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
      }).join(','));
    }
    return lines.join('\n');
  }

  // Step 1: Auto-scroll
  console.log('▶ Step 1: Auto-scroll to load anchors...');
  let scrollCount = 0, lastCount = 0, noChange = 0;
  await new Promise(resolve => {
    const iv = setInterval(()=>{
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
      const unique = new Set(anchors.map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/)||[])[1]).filter(Boolean));
      const count = unique.size;
      if (count === lastCount) {
        noChange++;
        if (noChange >= CONFIG.MIN_NO_CHANGE) { clearInterval(iv); console.log(`   loaded ${count} songs`); resolve(); }
      } else { noChange = 0; scrollCount++; lastCount = count; console.log(`   scroll ${scrollCount}: ${count} songs`); }
      if (scrollCount >= CONFIG.MAX_SCROLLS) { clearInterval(iv); console.warn('max scrolls reached'); resolve(); }
    }, CONFIG.SCROLL_DELAY);
  });

  // Collect anchors -> unique song IDs
  console.log('▶ Step 2: collect song anchors...');
  const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'))
                         .filter((a,i,arr)=> arr.findIndex(x=>x.href===a.href)===i);
  const items = anchorEls.map(a => {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    return { id: m?m[1]:null, href: a.href, el: a };
  }).filter(x=>x.id);
  console.log(`   found ${items.length} unique anchors`);

  // resume state
  const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
  const progress = saved ? JSON.parse(saved) : { processed: {} };
  console.log(`   previously processed: ${Object.keys(progress.processed).length}`);

  // Helper: try to parse inline script JSONs / globals for the song id
  function tryInlineJSONForId(id) {
    // Search script tags for the id and some likely fields
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
    for (const txt of scripts) {
      if (!txt.includes(id)) continue;
      // Try to extract a JSON object that contains the id
      const jsonMatch = txt.match(/({[^}]{20,}"+?"+[\s\S]*?})/m);
      if (jsonMatch) {
        try {
          const candidate = JSON.parse(jsonMatch[1]);
          // heuristic: look for lyrics/description in object values
          const flat = JSON.stringify(candidate).toLowerCase();
          if (flat.includes('lyrics') || flat.includes('description') || flat.includes('verse')) {
            return candidate;
          }
        } catch(e){}
      }
    }
    // also try global window variables (common patterns)
    try {
      const winKeys = Object.keys(window).filter(k => /suno|Suno|__INITIAL__|__DATA__|__STATE__/.test(k));
      for (const k of winKeys) {
        try {
          const v = window[k];
          const s = JSON.stringify(v || {});
          if (s.includes(id) && (s.toLowerCase().includes('lyrics') || s.toLowerCase().includes('description'))) {
            return v;
          }
        } catch(e){}
      }
    } catch(e){}
    return null;
  }

  // Helper: fetch detail page HTML and parse
  async function fetchDetail(id) {
    try {
      const url = `/song/${id}`;
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('status ' + r.status);
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lyrics = (doc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim();
      const summary = (doc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || doc.querySelector('meta[name="description"]')?.content || '').trim();
      const author = (doc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim();
      const tags = Array.from(doc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
      const audioNode = doc.querySelector(CONFIG.SELECTORS.AUDIO_META);
      const audio = audioNode?.src || audioNode?.content || '';
      return { lyrics, summary, author, tags, audio };
    } catch (e) {
      console.warn('   fetchDetail error', id, e.message);
      return {};
    }
  }

  // Helper: load in hidden iframe and scrape iframe doc
  async function iframeDetail(id, href) {
    return new Promise(async (resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.width = '1200px';
      iframe.style.height = '800px';
      iframe.style.opacity = '0';
      iframe.src = href || `/song/${id}`;
      document.body.appendChild(iframe);

      let settled = false;
      const finish = (result) => { if (!settled) { settled=true; try{ iframe.remove(); }catch(e){} resolve(result); } };

      // timeout
      const to = setTimeout(()=> finish({}), CONFIG.PANEL_WAIT_IFRAME);

      iframe.onload = async () => {
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          if (!idoc) { finish({}); return; }
          // wait small bit for SPA render inside iframe
          await wait(600);
          const lyrics = (idoc.querySelector(CONFIG.SELECTORS.LYRICS)?.textContent || '').trim();
          const summary = (idoc.querySelector(CONFIG.SELECTORS.SUMMARY)?.textContent || idoc.querySelector('meta[name="description"]')?.content || '').trim();
          const author = (idoc.querySelector(CONFIG.SELECTORS.AUTHOR)?.textContent || '').trim();
          const tags = Array.from(idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n=>n.textContent.trim()).filter(Boolean).join(', ');
          const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
          const audio = audioNode?.src || audioNode?.content || '';
          clearTimeout(to);
          finish({ lyrics, summary, author, tags, audio });
        } catch (e) {
          clearTimeout(to);
          console.warn('iframe parse error', e);
          finish({});
        }
      };
    });
  }

  // Main loop: for each item try inline -> fetch -> iframe
  const results = [];
  for (let i=0;i<items.length;i++) {
    const { id, href, el } = items[i];
    if (progress.processed[id]) { results.push(progress.processed[id]); console.log(`↳ [${i+1}/${items.length}] SKIP ${id}`); continue; }
    let ok=false, attempt=0, lastErr=null;

    while (attempt <= CONFIG.RETRIES && !ok) {
      attempt++;
      try {
        // 1) Inline JSON/global
        const inline = tryInlineJSONForId(id);
        if (inline) {
          // heuristics: pull fields if present
          const lyrics = (inline.lyrics || inline.text || inline.transcript || '').toString().trim();
          const summary = (inline.summary || inline.description || inline.excerpt || '').toString().trim();
          const author = (inline.author || inline.artist || inline.uploader || '')?.toString().trim();
          const tags = (inline.tags || inline.style || inline.genres) ? (Array.isArray(inline.tags) ? inline.tags.join(', ') : inline.tags) : '';
          const obj = { id, href, title: inline.title || el.getAttribute('title') || el.textContent.trim(), author, tags, lyrics, summary, audio: inline.audio || '', scrapedAt: now(), source: 'inline' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${obj.title || id} — inline JSON FOUND`);
          ok=true; break;
        }

        // 2) Fetch detail page (fastest next)
        const fetched = await fetchDetail(id);
        if (fetched && (fetched.lyrics || fetched.summary)) {
          const title = el.getAttribute('title') || el.textContent.trim();
          const obj = { id, href, title, author: fetched.author, tags: fetched.tags, lyrics: fetched.lyrics, summary: fetched.summary, audio: fetched.audio, scrapedAt: now(), source: 'fetch' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${title || id} — fetched (lyrics: ${!!fetched.lyrics})`);
          ok=true; break;
        }

        // 3) hidden iframe fallback
        console.log(`   [${i+1}] fetch didn't return lyrics — trying hidden iframe...`);
        const iframeRes = await iframeDetail(id, href);
        if (iframeRes && (iframeRes.lyrics || iframeRes.summary)) {
          const title = el.getAttribute('title') || el.textContent.trim();
          const obj = { id, href, title, author: iframeRes.author, tags: iframeRes.tags, lyrics: iframeRes.lyrics, summary: iframeRes.summary, audio: iframeRes.audio, scrapedAt: now(), source: 'iframe' };
          results.push(obj); progress.processed[id]=obj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
          console.log(`✅ [${i+1}] ${title || id} — iframe (lyrics: ${!!iframeRes.lyrics})`);
          ok=true; break;
        }

        // nothing found
        lastErr = 'no content found via inline/fetch/iframe';
        throw new Error(lastErr);
      } catch (err) {
        lastErr = err;
        console.warn(`   ! [${i+1}] attempt ${attempt} failed:`, err.message || err);
        await wait(400 + attempt * 200);
      }
    } // retries

    if (!ok) {
      console.error(`✖ [${i+1}] FAILED ${id}: ${String(lastErr)}`);
      const failObj = { id, href, title: el.getAttribute('title') || el.textContent.trim(), error: String(lastErr), scrapedAt: now() };
      results.push(failObj); progress.processed[id]=failObj; sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
    }

    // autosave periodically
    if ((i+1) % CONFIG.SAVE_INTERVAL === 0) {
      console.log(`⏺ Autosave after ${i+1} items`);
      const rows = Object.values(progress.processed);
      const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source'];
      try {
        downloadFile(toCSV(rows, headers), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`, 'text/csv');
        downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`, 'application/json');
      } catch(e){ console.warn('autosave failed', e); }
    }

    await wait(CONFIG.PER_SONG_DELAY);
  } // for loop

  // final export
  console.log('▶ Final export — writing files');
  const all = Object.values(progress.processed);
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const headers = ['id','title','author','tags','duration','imageUrl','audio','summary','lyrics','href','scrapedAt','error','source'];
  try {
    downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, 'text/csv');
    downloadFile(JSON.stringify(all, null, 2), `suno-extract-${ts}.json`, 'application/json');
    const txt = ['Suno Extract (v2.4)', `Exported: ${new Date().toLocaleString()}`, `Total: ${all.length}`, ''].concat(all.map((s,i)=>{
      const lines=[]; lines.push(`${String(i+1).padStart(3)}. ${s.title || 'Untitled'}`); if (s.author) lines.push(`   Author: ${s.author}`); if (s.tags) lines.push(`   Tags: ${s.tags}`); if (s.summary) lines.push(`   Summary: ${s.summary?.slice(0,200)}`); if (s.lyrics) lines.push(`   Lyrics: ${s.lyrics?.slice(0,400)}`); if (s.audio) lines.push(`   Audio: ${s.audio}`); lines.push(`   URL: ${s.href}`); return lines.join('\n');
    })).join('\n\n');
    downloadFile(txt, `suno-extract-${ts}.txt`, 'text/plain');
  } catch (e) { console.error('final export failed', e); }

  window.extractedSongs = all;
  console.log('🎉 Done. Check ~/Downloads/ and window.extractedSongs. Session saved to sessionStorage.');
  console.log('-'.repeat(70));
})();
// 🎵 Suno Live Extractor v3.0
// Works on https://suno.com/library, playlists, or profile pages.
// 1. Open a page with your songs.
// 2. Open DevTools → Console.
// 3. Paste this entire script.
// 4. Hit Enter, wait. Files go to ~/Downloads.

(async () => {
  console.log("🎵 Suno Live Extractor v3.0");
  console.log("──────────────────────────────────────────────");

  // ===== CONFIG =====
  const CONFIG = {
    SCROLL_DELAY: 1500,      // ms between scrolls
    MAX_SCROLLS: 500,        // safety cap
    MIN_NO_CHANGE: 5,        // stop after N scrolls with no new songs
    FETCH_DETAILS: true,     // fetch /song/{id} pages to pull lyrics/summary
    PER_SONG_DELAY: 300,     // ms between detail fetches
  };

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  // -------------------------------------------------
  // 1. AUTO-SCROLL TO LOAD ALL SONGS
  // -------------------------------------------------
  console.log("\n▶ Step 1/4: Auto-scrolling to load songs...");

  let scrollCount = 0;
  let lastSongCount = 0;
  let noChangeCount = 0;

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);

      const anchors = Array.from(
        document.querySelectorAll('a[href*="/song/"]')
      );
      const uniqueIds = new Set();

      for (const a of anchors) {
        const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
        if (m) uniqueIds.add(m[1]);
      }

      const count = uniqueIds.size;

      if (count === lastSongCount) {
        noChangeCount++;
        console.log(
          `   ⏳ No new songs... (${noChangeCount}/${CONFIG.MIN_NO_CHANGE})`
        );
        if (noChangeCount >= CONFIG.MIN_NO_CHANGE) {
          clearInterval(interval);
          console.log(
            `✅ Finished scrolling with ${count} unique songs (scrolls: ${scrollCount})`
          );
          resolve();
        }
      } else {
        const diff = count - lastSongCount;
        lastSongCount = count;
        noChangeCount = 0;
        scrollCount++;
        console.log(
          `   🔁 Scroll ${scrollCount}: ${count} songs (+${diff})`
        );
      }

      if (scrollCount >= CONFIG.MAX_SCROLLS) {
        clearInterval(interval);
        console.warn("⚠️ Reached MAX_SCROLLS, stopping auto-scroll.");
        resolve();
      }
    }, CONFIG.SCROLL_DELAY);
  });

  // -------------------------------------------------
  // 2. COLLECT BASIC SONG DATA FROM DOM
  // -------------------------------------------------
  console.log("\n▶ Step 2/4: Collecting basic song data from DOM...");

  const songMap = new Map(); // id -> song object

  const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
  for (const a of anchors) {
    const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
    if (!m) continue;
    const id = m[1];
    if (songMap.has(id)) continue;

    // Try to find a reasonable container
    const container =
      a.closest('[data-clip-id]') ||
      a.closest('[data-testid="song-row"]') ||
      a.closest("div") ||
      a;

    // Title
    const titleEl =
      a.querySelector("[title]") ||
      container.querySelector("[title]") ||
      a;
    const rawTitle =
      (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
    const title = rawTitle || "Untitled";

    // Duration
    const durationEl =
      container.querySelector(".font-mono") ||
      container.querySelector('[class*="duration"]') ||
      container.querySelector("time");
    const duration = durationEl ? durationEl.textContent.trim() : "";

    // Image URL
    const imgEl =
      a.querySelector("img") ||
      container.querySelector("img");
    let imageUrl = imgEl ? imgEl.src || imgEl.getAttribute("data-src") : "";
    if (imageUrl) {
      imageUrl = imageUrl
        .replace("/image_", "/image_large_")
        .replace("?width=720", "");
    }

    // Tags / styles
    const tagEls =
      container.querySelectorAll('a[href*="/style/"]') || [];
    const tags = Array.from(tagEls)
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join(", ");

    // Author
    const authorEl =
      container.querySelector('a[href^="/@"]') ||
      document.querySelector('a[href^="/@"]');
    const author = authorEl ? authorEl.textContent.trim() : "";
    const authorLink = authorEl ? authorEl.href : "";

    // Plays/Likes (best-effort; may be blank)
    const playsEl =
      container.querySelector('[title*="play"]') ||
      container.querySelector('[class*="play-count"]');
    const likesEl =
      container.querySelector('[title*="like"]') ||
      container.querySelector('[class*="like"]');
    const plays = playsEl ? playsEl.textContent.trim() : "";
    const likes = likesEl ? likesEl.textContent.trim() : "";

    const song = {
      id,
      title,
      url: `https://suno.com/song/${id}`,
      shareUrl: `https://suno.com/s/${id.split("-")[0]}`,
      audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
      imageUrl,
      duration,
      tags,
      author,
      authorLink,
      plays,
      likes,
      detailAuthor: "",
      detailTags: "",
      detailAudio: "",
      sidebarSummary: "",
      lyrics: "",
      extractedAt: new Date().toISOString(),
    };

    songMap.set(id, song);
  }

  const songs = Array.from(songMap.values());
  console.log(`   ✅ Collected ${songs.length} unique songs from DOM.`);

  if (songs.length === 0) {
    console.error(
      "❌ No songs found. Make sure you're on a Suno page with visible songs."
    );
    return;
  }

  // -------------------------------------------------
  // 3. FETCH DETAIL PAGE FOR LYRICS & SUMMARY
  // -------------------------------------------------
  if (CONFIG.FETCH_DETAILS) {
    console.log(
      "\n▶ Step 3/4: Fetching each /song/{id} page for lyrics & summary..."
    );

    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      const detailUrl = `/song/${s.id}`;

      try {
        await wait(CONFIG.PER_SONG_DELAY);
        const res = await fetch(detailUrl, { credentials: "same-origin" });
        if (!res.ok) {
          console.warn(
            `   ⚠️ [${i + 1}/${songs.length}] ${s.title} — fetch failed (${res.status})`
          );
          continue;
        }

        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Lyrics
        const lyricsEl =
          doc.querySelector(".whitespace-pre-wrap") ||
          doc.querySelector('[data-testid="lyrics"]') ||
          Array.from(doc.querySelectorAll("pre, p, span")).find((el) =>
            /\[Verse|\[Chorus|\[Intro|Verse 1|Chorus/i.test(
              el.textContent || ""
            )
          );
        const lyrics = lyricsEl ? (lyricsEl.textContent || "").trim() : "";

        // Sidebar summary / description
        const summaryEl =
          doc.querySelector(".mt-1.cursor-pointer") ||
          doc.querySelector('[data-testid="summary"]') ||
          doc.querySelector('meta[name="description"]') ||
          doc.querySelector('meta[property="og:description"]');
        const sidebarSummary = summaryEl
          ? (summaryEl.content || summaryEl.textContent || "").trim()
          : "";

        // Detail author & tags
        const detailAuthorEl = doc.querySelector('a[href^="/@"]');
        const detailAuthor = detailAuthorEl
          ? detailAuthorEl.textContent.trim()
          : s.author;

        const detailTagEls =
          doc.querySelectorAll('a[href*="/style/"], div[title] span') || [];
        const detailTags = Array.from(detailTagEls)
          .map((el) => el.textContent.trim())
          .filter(Boolean)
          .join(", ");

        // Detail audio URL
        const audioEl =
          doc.querySelector("audio[src]") ||
          doc.querySelector('meta[property="og:audio"]') ||
          doc.querySelector("source[src]");
        const detailAudio =
          (audioEl && (audioEl.src || audioEl.content || audioEl.getAttribute("src"))) ||
          s.audioUrl;

        s.lyrics = lyrics;
        s.sidebarSummary = sidebarSummary;
        s.detailAuthor = detailAuthor || s.author;
        s.detailTags = detailTags || s.tags;
        s.detailAudio = detailAudio;

        console.log(
          `   ✅ [${i + 1}/${songs.length}] ${s.title} — lyrics ${
            lyrics ? "FOUND" : "not found"
          }`
        );
      } catch (err) {
        console.warn(
          `   ⚠️ [${i + 1}/${songs.length}] ${s.title} — error: ${err.message}`
        );
      }
    }
  } else {
    console.log(
      "\n▶ Step 3/4: FETCH_DETAILS = false, skipping /song/{id} fetch."
    );
  }

  // -------------------------------------------------
  // 4. EXPORT CSV + JSON + TXT
  // -------------------------------------------------
  console.log("\n▶ Step 4/4: Creating and downloading export files...");

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const fields = [
    "id",
    "title",
    "url",
    "shareUrl",
    "audioUrl",
    "imageUrl",
    "duration",
    "tags",
    "author",
    "authorLink",
    "plays",
    "likes",
    "detailAuthor",
    "detailTags",
    "detailAudio",
    "sidebarSummary",
    "lyrics",
    "extractedAt",
  ];

  const toCsv = (rows, headers) => {
    const lines = [];
    lines.push(headers.join(","));
    for (const row of rows) {
      const line = headers
        .map((key) => {
          const raw = String(row[key] ?? "");
          const escaped = raw.replace(/"/g, '""');
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(",");
      lines.push(line);
    }
    return lines.join("\n");
  };

  const csvContent = toCsv(songs, fields);
  const jsonContent = JSON.stringify(songs, null, 2);

  const txtContent = [
    "🎵 SUNO COLLECTION EXPORT",
    "──────────────────────────────────────────────",
    `Exported: ${new Date().toLocaleString()}`,
    `Total songs: ${songs.length}`,
    `Source: ${window.location.href}`,
    "──────────────────────────────────────────────",
    "",
    "Tracks:",
    "",
    ...songs.map((s, i) => {
      const lines = [];
      lines.push(`${String(i + 1).padStart(3, " ")}. ${s.title}`);
      if (s.duration) lines.push(`   Duration: ${s.duration}`);
      if (s.author || s.detailAuthor)
        lines.push(`   Author: ${s.detailAuthor || s.author}`);
      if (s.tags || s.detailTags)
        lines.push(`   Tags: ${s.detailTags || s.tags}`);
      if (s.sidebarSummary)
        lines.push(
          `   Summary: ${
            s.sidebarSummary.length > 200
              ? s.sidebarSummary.slice(0, 200) + "..."
              : s.sidebarSummary
          }`
        );
      if (s.lyrics)
        lines.push(
          `   Lyrics: ${
            s.lyrics.length > 400
              ? s.lyrics.slice(0, 400) + "..."
              : s.lyrics
          }`
        );
      lines.push(`   URL: ${s.url}`);
      lines.push("");
      return lines.join("\n");
    }),
  ].join("\n");

  const downloadFile = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`   💾 ${filename}`);
  };

  downloadFile(csvContent, `suno-export-${timestamp}.csv`, "text/csv");
  downloadFile(jsonContent, `suno-export-${timestamp}.json`, "application/json");
  downloadFile(txtContent, `suno-export-${timestamp}.txt`, "text/plain");

  window.extractedSongs = songs;

  console.log("\n✅ Export complete!");
  console.log(`   Files saved as suno-export-${timestamp}.* in your Downloads folder.`);
  console.log("   Use window.extractedSongs in console to inspect the data.");
  console.table(
    songs.slice(0, 5).map((s) => ({
      Title: s.title,
      Duration: s.duration,
      Author: s.detailAuthor || s.author,
      HasLyrics: !!s.lyrics,
    }))
  );
})();

// ?? AUTO-SCROLL SUNO EXTRACTOR - Paste into Dev Console
// =========================================================
// This will auto-scroll to load ALL songs, then extract them!

console.log('?? Starting AUTO-SCROLL Extractor...');
console.log('? This will scroll through the page to load all songs...');

// Configuration
const SCROLL_DELAY = 1500; // Wait 1.5 seconds between scrolls
const MAX_SCROLLS = 200;   // Maximum number of scrolls (safety limit)

let scrollCount = 0;
let lastHeight = 0;
let noChangeCount = 0;

// Auto-scroll function
function autoScroll() {
    return new Promise((resolve) => {
        const scrollInterval = setInterval(() => {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            
            const currentHeight = document.body.scrollHeight;
            
            // Check if page height changed
            if (currentHeight === lastHeight) {
                noChangeCount++;
                console.log(`   No new content loaded... (${noChangeCount}/3)`);
                
                // If no change for 3 scrolls, we're done
                if (noChangeCount >= 3) {
                    clearInterval(scrollInterval);
                    console.log('? Finished scrolling!');
                    resolve();
                }
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
                scrollCount++;
                
                // Count current songs
                const currentSongCount = document.querySelectorAll('[data-clip-id]').length;
                console.log(`   Scroll ${scrollCount}: Found ${currentSongCount} songs...`);
            }
            
            // Safety limit
            if (scrollCount >= MAX_SCROLLS) {
                clearInterval(scrollInterval);
                console.log('??  Reached max scrolls, stopping...');
                resolve();
            }
            
        }, SCROLL_DELAY);
    });
}

// Extract function
async function extractAllSongs() {
    // Step 1: Auto-scroll to load everything
    console.log('\n?? Step 1: Auto-scrolling to load all songs...');
    await autoScroll();
    
    // Step 2: Extract all songs
    console.log('\n?? Step 2: Extracting song data...');
    
    const songs = [];
    const songElements = document.querySelectorAll('[data-clip-id]');
    
    console.log(`   Found ${songElements.length} total songs!`);
    
    songElements.forEach((el, index) => {
        try {
            const song = {
                id: el.getAttribute('data-clip-id'),
                title: el.querySelector('[title]')?.getAttribute('title') || '',
                duration: el.querySelector('.font-mono')?.textContent?.trim() || '',
                url: 'https://suno.com/song/' + el.getAttribute('data-clip-id'),
                audio_url: 'https://cdn1.suno.ai/' + el.getAttribute('data-clip-id') + '.mp3',
                image_url: el.querySelector('img[src*="suno.ai"]')?.getAttribute('src') || '',
            };
            
            // Extract tags
            const tagElements = el.querySelectorAll('[href*="/style/"]');
            if (tagElements.length > 0) {
                song.tags = Array.from(tagElements).map(t => t.textContent.trim()).join(', ');
            }
            
            // Extract version
            const versionEl = el.querySelector('[style*="FD429C"]');
            if (versionEl) {
                song.version = versionEl.textContent.trim();
            }
            
            // Extract stats (plays, likes, comments)
            const statsElements = el.querySelectorAll('.text-\\[12px\\] .font-medium');
            if (statsElements.length >= 3) {
                song.plays = statsElements[0]?.textContent.trim() || '0';
                song.likes = statsElements[1]?.textContent.trim() || '0';
                song.comments = statsElements[2]?.textContent.trim() || '0';
            }
            
            if (song.title) {
                songs.push(song);
            }
        } catch (e) {
            console.error(`Error on song ${index}:`, e);
        }
    });
    
    console.log(`? Extracted ${songs.length} songs!`);
    
    // Step 3: Create CSV
    console.log('\n?? Step 3: Creating CSV...');
    
    const csv = [
        'id,title,duration,tags,version,plays,likes,comments,url,audio_url,image_url',
        ...songs.map(s => {
            const title = (s.title || '').replace(/"/g, '""');
            const tags = (s.tags || '').replace(/"/g, '""');
            return `${s.id},"${title}",${s.duration},"${tags}",${s.version || ''},${s.plays || '0'},${s.likes || '0'},${s.comments || '0'},${s.url},${s.audio_url},${s.image_url}`;
        })
    ].join('\n');
    
    // Step 4: Download CSV
    console.log('\n?? Step 4: Downloading CSV...');
    
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
    const filename = `suno-songs-${timestamp}.csv`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`? Downloaded: ${filename}`);
    console.log('?? Check your Downloads folder!');
    
    // Step 5: Copy to clipboard
    console.log('\n?? Step 5: Copying JSON to clipboard...');
    
    const jsonData = JSON.stringify(songs, null, 2);
    navigator.clipboard.writeText(jsonData).then(() => {
        console.log('? JSON copied to clipboard!');
    }).catch(() => {
        console.log('??  Could not copy to clipboard');
    });
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('?? EXTRACTION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n   Total songs: ${songs.length}`);
    console.log(`   CSV file: ${filename}`);
    console.log(`   Location: ~/Downloads/`);
    
    // Show samples
    console.log('\n?? First 10 songs:');
    songs.slice(0, 10).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.title} (${s.duration}) - ${s.version}`);
    });
    
    if (songs.length > 10) {
        console.log(`   ... and ${songs.length - 10} more!`);
    }
    
    console.log('\n?? To view all data in console, type: extractedSongs');
    
    // Return for inspection
    window.extractedSongs = songs;
    return songs;
}

// Run the extraction
extractAllSongs();