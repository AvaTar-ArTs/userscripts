// Yes, this is one entire code block. It defines utility functions and the advanced extraction function
// for the Suno Data Extractor, and all of this is wrapped in an IIFE (Immediately Invoked Function Expression).

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
        const blob = new Blob([content], { type });
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
            let ok = false, attempt = 0, lastErr = null;
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
                    const res = await fetch(`/song/${id}`, { credentials: 'same-origin' });
                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const lyrics = clean((doc.querySelector(CONFIG.SELECTORS.LYRICS) || {}).textContent || '');
                        const summary = clean((doc.querySelector(CONFIG.SELECTORS.SUMMARY) || {}).textContent || (doc.querySelector('meta[name="description"]') || {}).content || '');
                        const author = clean((doc.querySelector(CONFIG.SELECTORS.AUTHOR) || {}).textContent || '');
                        const tags = Array.from(doc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n => n.textContent.trim()).filter(Boolean).join(', ');
                        const audioNode = doc.querySelector(CONFIG.SELECTORS.AUDIO_META);
                        let audio = '';
                        if (audioNode) {
                            audio = audioNode.src || audioNode.content || '';
                        }
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
                        lyrics = clean((idoc.querySelector(CONFIG.SELECTORS.LYRICS) || {}).textContent || '');
                        summary = clean((idoc.querySelector(CONFIG.SELECTORS.SUMMARY) || {}).textContent || (idoc.querySelector('meta[name="description"]') || {}).content || '');
                        author = clean((idoc.querySelector(CONFIG.SELECTORS.AUTHOR) || {}).textContent || '');
                        tags = Array.from(idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || '')).map(n => n.textContent.trim()).filter(Boolean).join(', ');
                        const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
                        if (audioNode) {
                            audio = audioNode.src || audioNode.content || '';
                        }
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
    window.extractedSongs = all; console.log('🎉 Extraction done. Inspect window.extractedSongs and check your Downloads folder.');
    return all;
}
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
window.extractedSongs = all;
console.log('🎉 Extraction done. Inspect window.extractedSongs and check your Downloads folder.');
return all;
}
return all;
}
return all;
}

// Universal Song Extractor (handles most pages)
async function extractSunoSongsUniversal({
    autoScroll = true,
    minNoChange = 4,
    maxScrolls = 500
}) {
    console.log('🎵 Suno Universal Extractor Booting Up...');
    // Step 1: (Optional) Scroll to load all content
    if (autoScroll) {
        let scrolls = 0,
            noChange = 0,
            lastCount = 0;
        while (scrolls < maxScrolls && noChange < minNoChange) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            await wait(900);
            const anchors = document.querySelectorAll('a[href*="/song/"]');
            const ids = new Set(Array.from(anchors).map(a => (a.href.match(/\/song\/([a-f0-9-]{36})/) || [])[1]).filter(Boolean));
            const count = ids.size;
            if (count === lastCount) {
                noChange++;
            } else {
                noChange = 0;
                lastCount = count;
            }
            scrolls++;
        }
        console.log(`🔄 Finished auto-scrolling: ${lastCount} songs loaded.`);
    }
    // Step 2: Extract song containers and IDs
    const songMap = new Map();
    const anchors = document.querySelectorAll('a[href*="/song/"]');
    anchors.forEach(a => {
        const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
        if (m && m[1] && !songMap.has(m[1])) {
            songMap.set(m[1], a);
        }
    });
    const ids = Array.from(songMap.keys());
    if (!ids.length) {
        console.error('❌ No song links found. Are you on a valid Suno page?');
        return [];
    }
    console.log(`📝 Found ${ids.length} unique song IDs.`);
    // Step 3: Extract details for each anchor
    const songs = [];
    ids.forEach((id, i) => {
        try {
            const a = songMap.get(id);
            let container = a.closest('[data-clip-id], [data-testid="song-row"], div') || a;
            // Title
            let titleEl = a.querySelector('[title]') || a.querySelector('[class*="title"]') || a;
            let title = clean(titleEl ? .getAttribute('title') || titleEl ? .textContent || 'Untitled');
            // Duration
            let durationEl = container.querySelector('time, .font-mono, [class*="duration"], span[title*=":"], span[class*="font-mono"]');
            let duration = clean(durationEl ? .textContent || '');
            // Tags
            let tagEls = container.querySelectorAll('a[href*="/style/"], div[title] span');
            let tags = Array.from(tagEls).map(t => clean(t.textContent)).filter(Boolean).join(', ');
            // Author
            let authorAnchor = container.querySelector('a[href^="/@"]');
            let author = clean(authorAnchor ? .textContent || '');
            // Image
            let imgEl = a.querySelector('img') || container.querySelector('img');
            let imageUrl = imgEl ? .src || imgEl ? .getAttribute ? .('data-src') || '';
            if (imageUrl) imageUrl = imageUrl.replace('/image_', '/image_large_').replace('?width=720', '');
            // URLs
            let url = `https://suno.com/song/${id}`;
            let shareUrl = `https://suno.com/s/${id.split('-')[0]}`;
            let audioUrl = `https://cdn1.suno.ai/${id}.mp3`;
            // Plays, Likes (best effort)
            let plays = clean(container.querySelector('[title*="play"], [class*="play-count"]') ? .textContent || '');
            let likes = clean(container.querySelector('[title*="like"], [class*="like"]') ? .textContent || '');
            // Compose
            songs.push({
                id,
                title,
                duration,
                tags,
                author,
                url,
                shareUrl,
                audioUrl,
                imageUrl,
                plays,
                likes,
                extractedAt: new Date().toISOString()
            });
            if ((i + 1) % 50 === 0) {
                console.log(`   ...processed ${i + 1}/${ids.length}`);
            }
        } catch (e) {
            console.error(`❗ Error extracting song at index ${i}`, e);
        }
    });
    window.extractedSongs = songs;
    return songs;
}

//
// ===== SECTION 3: EXPORT & SUMMARY FUNCTION (kept as single block) =====
//

function exportSunoSongsData(songs, prefix = 'suno-export') {
    if (!songs || !songs.length) {
        console.error('❌ No songs to export!');
        return;
    }
    // Order fields consistently
    const fields = [
        'id', 'title', 'duration', 'tags', 'author', 'url', 'shareUrl', 'audioUrl', 'imageUrl',
        'plays', 'likes', 'extractedAt', 'lyrics', 'summary'
    ].filter(f => songs[0][f] !== undefined);

    // Sort songs by title
    songs = songs.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    // --- CSV Export ---
    const csv = toCSV(songs, fields);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvFile = `${prefix}-${timestamp}.csv`;
    downloadFile(csv, csvFile, 'text/csv');

    // --- JSON Export ---
    const jsonFile = `${prefix}-${timestamp}.json`;
    downloadFile(JSON.stringify(songs, null, 2), jsonFile, 'application/json');

    // --- TXT Summary Export ---
    const txtSummary = [
        `🎵 SUNO COLLECTION EXPORT`,
        '='.repeat(70),
        `Exported: ${new Date().toLocaleString()}`,
        `Total Songs: ${songs.length}`,
        `Source: ${window.location.href}`,
        '='.repeat(70),
        '',
        ...songs.slice(0, 30).map((s, i) => {
            let line = `${String(i + 1).padStart(3)}. ${s.title}`;
            if (s.duration) line += ` [${s.duration}]`;
            if (s.author) line += ` | By: ${s.author}`;
            if (s.tags) line += `\n     Style: ${s.tags}`;
            line += `\n     URL: ${s.url}`;
            line += `\n     Audio: ${s.audioUrl}`;
            return line;
        }),
        (songs.length > 30 ? `\n... and ${songs.length - 30} more!` : ''),
        ''
    ].join('\n');

    const txtFile = `${prefix}-${timestamp}.txt`;
    downloadFile(txtSummary, txtFile, 'text/plain');

    // --- Console Summary ---
    console.log('\n' + '='.repeat(70));
    console.log(`🎵 EXPORT COMPLETE!`);
    console.log('='.repeat(70));
    console.log(` - Total: ${songs.length} songs`);
    console.log(` - Files in ~/Downloads/:\n    • ${csvFile}\n    • ${jsonFile}\n    • ${txtFile}`);
    console.log('\nFirst 10 songs:');
    songs.slice(0, 10).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.title}${s.duration ? ' (' + s.duration + ')' : ''} ${s.tags ? '- ' + s.tags : ''}`);
    });
    if (songs.length > 10) console.log(`   ... and ${songs.length - 10} more`);

    window.extractedSongs = songs;
    console.log('\nType `extractedSongs` in the console to inspect your result.');
}

//
// ===== SECTION 4: ENTRY POINTS (alphabetically by global property name) =====
//

// To run advanced lyrics/resilient extraction
window.sunoExtractAdvanced = async function() {
    const songs = await extractSunoAdvanced();
    exportSunoSongsData(songs, "suno-adv");
    return songs;
};

// To run standard universal extraction and export
window.sunoExtract = async function() {
    const songs = await extractSunoSongsUniversal({});
    exportSunoSongsData(songs);
    return songs;
};

// --- User Shortcuts / Instructions ---
console.log('🎼 Suno Extractor:');
console.log('  > To run universal extraction: await sunoExtract()');
console.log('  > To run advanced (lyrics/fallback/retry): await sunoExtractAdvanced()');
console.log('  > After extraction, see data in window.extractedSongs.');

// Optionally, auto-run basic extraction if desired:
// window.sunoExtract();
})();