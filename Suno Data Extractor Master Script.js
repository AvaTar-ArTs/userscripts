// --- Suno Data Extractor Master Script ---
// Organizes, sorts, formats, and improves Suno extraction utilities.
// Supports: Live site, saved HTML, side-panel, and advanced retry/lyrics extraction workflows.
// Outputs: CSV, JSON, TXT summary, with global preview and robust error handling.

(function() {
    //
    // ===== SECTION 1: UTILITY FUNCTIONS (alphabetically sorted by function name) =====
    //

    // Helper: Escapes/cleans text for CSV/TXT
    function clean(text) {
        if (!text) return '';
        return String(text).replace(/"/g, '""').replace(/\r?\n|\r/g, ' ').trim();
    }

    // Helper: Downloads content as a file
    function downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], {
            type
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`✅ Saved: ${filename}`);
    }

    // Helper: Converts array of objects to CSV string
    function toCSV(rows, headers) {
        const lines = [];
        lines.push(headers.join(','));
        for (const r of rows) {
            const line = headers.map(h => {
                const v = String(r[h] || '').replace(/"/g, '""');
                return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
            }).join(',');
            lines.push(line);
        }
        return lines.join('\n');
    }

    // Helper: Waits for a number of ms
    const wait = ms => new Promise(res => setTimeout(res, ms));

    // --- Global state ---
    window.extractedSongs = [];

    //
    // ===== SECTION 2: EXTRACTION FUNCTIONS (alphabetically by function name) =====
    //

    // Advanced Extraction - Lyrics/Side Panel/Retry (v2+)
    async function extractSunoAdvanced(options = {}) {
        const CONFIG = Object.assign({
            SCROLL_DELAY: 900,
            MIN_NO_CHANGE: 4,
            MAX_SCROLLS: 700,
            PER_SONG_DELAY: 400,
            PANEL_WAIT_IFRAME: 7000,
            RETRIES: 3,
            SAVE_INTERVAL: 10,
            RESUME_KEY: 'suno_extractor_v2_progress',
            SELECTORS: {
                LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, pre, .song-lyrics',
                SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description',
                AUTHOR: 'a[href^="/@"]',
                TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span',
                AUDIO_META: 'audio[src], source[src], meta[property="og:audio"]'
            }
        }, options);

        // STEP 1: AUTO-SCROLL TO LOAD CONTENT
        let nscroll = 0, lastCount = 0, noChange = 0;
        while (nscroll < CONFIG.MAX_SCROLLS && noChange < CONFIG.MIN_NO_CHANGE) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            await wait(CONFIG.SCROLL_DELAY);
            const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
            const unique = new Set(anchors.map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/) || [])[1]).filter(Boolean));
            if (unique.size === lastCount) {
                noChange++;
            } else {
                noChange = 0;
                lastCount = unique.size;
            }
            nscroll++;
        }
        console.log(`🌊 Finished auto-scroll: ${lastCount} unique song links loaded.`);

        // STEP 2: Build ID list, resume if available
        const anchorEls = Array.from(document.querySelectorAll('a[href*="/song/"]'));
        const dedup = {};
        anchorEls.forEach(a => {
            const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
            if (m && m[1]) dedup[m[1]] = a;
        });
        const items = Object.keys(dedup).map(id => ({
            id,
            href: dedup[id].href,
            el: dedup[id]
        }));
        const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
        const progress = saved ? JSON.parse(saved) : { processed: {} };

        // STEP 3: Main Loop
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const { id, href, el } = items[i];
            if (progress.processed[id]) {
                results.push(progress.processed[id]);
                console.log(`↳ [${i + 1}/${items.length}] SKIP ${id}`);
                continue;
            }
            let ok = false,
                attempt = 0,
                lastErr = null;
            while (attempt <= CONFIG.RETRIES && !ok) {
                attempt++;
                try {
                    // Attempt 1: Try inline JSON
                    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
                    let inlineCandidate = null;
                    for (const txt of scripts) {
                        if (!txt.includes(id)) continue;
                        const m = txt.match(/({[^}]{20,}"+?"+[\s\S]*?})/m);
                        if (m) {
                            try {
                                const candidate = JSON.parse(m[1]);
                                const flat = JSON.stringify(candidate).toLowerCase();
                                if (flat.includes('lyrics') || flat.includes('description') || flat.includes('verse')) {
                                    inlineCandidate = candidate;
                                }
                            } catch (_) {}
                        }
                    }
                    if (inlineCandidate) {
                        const song = {
                            id,
                            href,
                            title: inlineCandidate.title || el.getAttribute('title') || el.textContent.trim(),
                            author: inlineCandidate.author || inlineCandidate.artist || inlineCandidate.uploader || '',
                            tags: (Array.isArray(inlineCandidate.tags) ? inlineCandidate.tags.join(', ') : (inlineCandidate.tags || inlineCandidate.style || inlineCandidate.genres || '')),
                            lyrics: clean(inlineCandidate.lyrics || inlineCandidate.text || inlineCandidate.transcript || ''),
                            summary: clean(inlineCandidate.summary || inlineCandidate.description || inlineCandidate.excerpt || ''),
                            audio: inlineCandidate.audio || '',
                            scrapedAt: new Date().toISOString(),
                            source: 'inline'
                        };
                        results.push(song);
                        progress.processed[id] = song;
                        sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
                        console.log(`✅ [${i+1}] ${song.title || id} — inline JSON FOUND`);
                        ok = true;
                        break;
                    }
                    // Attempt 2: Fetch detail page
                    const res = await fetch(`/song/${id}`, {
                        credentials: 'same-origin'
                    });
                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const lyrics = clean(doc.querySelector(CONFIG.SELECTORS.LYRICS) ?.textContent || '');
                        const summary = clean(doc.querySelector(CONFIG.SELECTORS.SUMMARY) ?.textContent || doc.querySelector('meta[name="description"]') ?.content || '');
                        const author = clean(doc.querySelector(CONFIG.SELECTORS.AUTHOR) ?.textContent || '');
                        const tags = Array.from(doc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n => n.textContent.trim()).filter(Boolean).join(', ');
                        const audioNode = doc.querySelector(CONFIG.SELECTORS.AUDIO_META);
                        const audio = audioNode ?.src || audioNode ?.content || '';
                        if (lyrics || summary) {
                            const song = {
                                id,
                                href,
                                title: el.getAttribute('title') || el.textContent.trim(),
                                author,
                                tags,
                                lyrics,
                                summary,
                                audio,
                                scrapedAt: new Date().toISOString(),
                                source: 'fetch'
                            };
                            results.push(song);
                            progress.processed[id] = song;
                            sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
                            console.log(`✅ [${i+1}] ${song.title || id} — fetched (lyrics: ${!!lyrics})`);
                            ok = true;
                            break;
                        }
                    }
                    // Attempt 3: hidden iframe fallback
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.left = '-9999px';
                    iframe.style.width = '1000px';
                    iframe.style.height = '800px';
                    iframe.style.opacity = '0';
                    iframe.src = href;
                    document.body.appendChild(iframe);
                    await new Promise(resolve => setTimeout(resolve, 600));
                    let idoc = null;
                    try {
                        idoc = iframe.contentDocument || iframe.contentWindow.document;
                    } catch (_) {}
                    let lyrics = '',
                        summary = '',
                        author = '',
                        tags = '',
                        audio = '';
                    if (idoc) {
                        lyrics = clean(idoc.querySelector(CONFIG.SELECTORS.LYRICS) ?.textContent || '');
                        summary = clean(idoc.querySelector(CONFIG.SELECTORS.SUMMARY) ?.textContent || idoc.querySelector('meta[name="description"]') ?.content || '');
                        author = clean(idoc.querySelector(CONFIG.SELECTORS.AUTHOR) ?.textContent || '');
                        tags = Array.from(idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n => n.textContent.trim()).filter(Boolean).join(', ');
                        const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
                        audio = audioNode ?.src || audioNode ?.content || '';
                    }
                    document.body.removeChild(iframe);
                    if (lyrics || summary) {
                        const song = {
                            id,
                            href,
                            title: el.getAttribute('title') || el.textContent.trim(),
                            author,
                            tags,
                            lyrics,
                            summary,
                            audio,
                            scrapedAt: new Date().toISOString(),
                            source: 'iframe'
                        };
                        results.push(song);
                        progress.processed[id] = song;
                        sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
                        console.log(`✅ [${i+1}] ${song.title || id} — iframe (lyrics: ${!!lyrics})`);
                        ok = true;
                        break;
                    }
                    lastErr = 'No lyrics/summary found (inline/fetch/iframe fallback exhausted)';
                } catch (err) {
                    lastErr = err;
                    console.warn(`   ! [${i+1}] attempt ${attempt} failed:`, err.message || err);
                    await wait(400 + attempt * 200);
                }
            }
            if (!ok) {
                console.error(`✖ [${i + 1}] FAILED ${id}: ${String(lastErr)}`);
                const failObj = {
                    id,
                    href,
                    title: el.getAttribute('title') || el.textContent.trim(),
                    error: String(lastErr),
                    scrapedAt: new Date().toISOString()
                };
                results.push(failObj);
                progress.processed[id] = failObj;
                sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
            }
            // Autosave
            if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
                console.log(`⏺ Autosave after ${i+1} items`);
                const rows = Object.values(progress.processed);
                const headers = ['id', 'title', 'author', 'tags', 'lyrics', 'summary', 'audio', 'scrapedAt', 'error', 'source'];
                try {
                    downloadFile(toCSV(rows, headers), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`, 'text/csv');
                    downloadFile(JSON.stringify(rows, null, 2), `suno-partial-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`, 'application/json');
                } catch (e) {
                    console.warn('Autosave failed', e);
                }
            }
            await wait(CONFIG.PER_SONG_DELAY);
        }
        // FINAL EXPORT
        const all = Object.values(progress.processed);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const headers = ['id', 'title', 'author', 'tags', 'lyrics', 'summary', 'audio', 'scrapedAt', 'error', 'source'];
        try {
            downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, 'text/csv');
            downloadFile(JSON.stringify(all, null, 2), `suno-extract-${ts}.json`, 'application/json');
        } catch (e) {
            console.error('Final export failed', e);
        }
        window.extractedSongs = all;
        console.log('🎉 Extraction done. Inspect window.extractedSongs and check your Downloads folder.');
        return all;
    }