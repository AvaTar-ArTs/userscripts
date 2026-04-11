// --- Suno Advanced Extractor ---
// Advanced extraction with lyrics, side panel, retry logic, and iframe fallback
// Supports: Live site, saved HTML, side-panel, and advanced retry/lyrics extraction workflows
// Outputs: CSV, JSON, TXT summary, with global preview and robust error handling

(function() {
    if (!window.sunoUtils) {
        console.error("❌ suno-utils.js must be loaded first!");
        return;
    }

    const {
        clean,
        downloadFile,
        toCSV,
        wait
    } = window.sunoUtils;

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
                RESUME_KEY: "suno_extractor_v2_progress",
                SELECTORS: {
                    LYRICS: '.whitespace-pre-wrap, [data-testid="lyrics"], .lyrics, pre, .song-lyrics, div[class*="lyrics"], div[class*="text"]',
                    SUMMARY: '.mt-1.cursor-pointer, [data-testid="summary"], .summary, .description, meta[name="description"]',
                    AUTHOR: 'a[href^="/@"]',
                    TAGS: 'a[href*="/style/"], [data-testid="tags"] span, .tags span, div[class*="tag"]',
                    AUDIO_META: 'audio[src], source[src], meta[property="og:audio"]',
                    TITLE: 'a[href*="/song/"], [class*="title"], [class*="name"]',
                },
            },
            options
        );

        // STEP 1: AUTO-SCROLL TO LOAD CONTENT
        let nscroll = 0,
            lastCount = 0,
            noChange = 0;
        while (nscroll < CONFIG.MAX_SCROLLS && noChange < CONFIG.MIN_NO_CHANGE) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            await wait(CONFIG.SCROLL_DELAY);
            const anchors = Array.from(
                document.querySelectorAll('a[href*="/song/"]')
            );
            const unique = new Set(
                anchors
                .map((a) => (a.href.match(/\/song\/([a-f0-9-]{36})/) || [])[1])
                .filter(Boolean)
            );
            if (unique.size === lastCount) {
                noChange++;
            } else {
                noChange = 0;
                lastCount = unique.size;
            }
            nscroll++;
        }
        console.log(
            `🌊 Finished auto-scroll: ${lastCount} unique song links loaded.`
        );

        // STEP 2: Build ID list, resume if available
        const anchorEls = Array.from(
            document.querySelectorAll('a[href*="/song/"]')
        );
        const dedup = {};
        anchorEls.forEach((a) => {
            const m = a.href.match(/\/song\/([a-f0-9-]{36})/);
            if (m && m[1]) dedup[m[1]] = a;
        });
        const items = Object.keys(dedup).map((id) => ({
            id,
            href: dedup[id].href,
            el: dedup[id],
        }));
        const saved = sessionStorage.getItem(CONFIG.RESUME_KEY);
        const progress = saved ?
            JSON.parse(saved) :
            {
                processed: {},
            };

        // STEP 3: Main Loop
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const {
                id,
                href,
                el
            } = items[i];
            if (progress.processed[id]) {
                results.push(progress.processed[id]);
                console.log(`↳ [${i + 1}/${items.length}] SKIP ${id}`);
                continue;
            }
            // Detect if we're on a saved HTML file (once per song)
            const isSavedFile =
                window.location.protocol === "file:" ||
                window.location.href.startsWith("file://");

            let ok = false,
                attempt = 0,
                lastErr = null;
            while (attempt <= CONFIG.RETRIES && !ok) {
                attempt++;
                try {
                    // Attempt 1: Try inline JSON
                    const scripts = Array.from(document.querySelectorAll("script")).map(
                        (s) => s.textContent || ""
                    );
                    let inlineCandidate = null;
                    for (const txt of scripts) {
                        if (!txt.includes(id)) continue;
                        const m = txt.match(/({[^}]{20,}"+?"+[\s\S]*?})/m);
                        if (m) {
                            try {
                                const candidate = JSON.parse(m[1]);
                                const flat = JSON.stringify(candidate).toLowerCase();
                                if (
                                    flat.includes("lyrics") ||
                                    flat.includes("description") ||
                                    flat.includes("verse")
                                ) {
                                    inlineCandidate = candidate;
                                }
                            } catch (_) {}
                        }
                    }
                    if (inlineCandidate) {
                        const song = {
                            id,
                            href,
                            title: inlineCandidate.title ||
                                el.getAttribute("title") ||
                                el.textContent.trim(),
                            author: inlineCandidate.author ||
                                inlineCandidate.artist ||
                                inlineCandidate.uploader ||
                                "",
                            tags: Array.isArray(inlineCandidate.tags) ?
                                inlineCandidate.tags.join(", ") :
                                inlineCandidate.tags ||
                                inlineCandidate.style ||
                                inlineCandidate.genres ||
                                "",
                            lyrics: clean(
                                inlineCandidate.lyrics ||
                                inlineCandidate.text ||
                                inlineCandidate.transcript ||
                                ""
                            ),
                            summary: clean(
                                inlineCandidate.summary ||
                                inlineCandidate.description ||
                                inlineCandidate.excerpt ||
                                ""
                            ),
                            audio: inlineCandidate.audio || "",
                            scrapedAt: new Date().toISOString(),
                            source: "inline",
                        };
                        results.push(song);
                        progress.processed[id] = song;
                        sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
                        console.log(
                            `✅ [${i + 1}] ${song.title || id} — inline JSON FOUND`
                        );
                        ok = true;
                        break;
                    }
                    // Attempt 2: Fetch detail page (only on live site, not saved HTML)
                    if (!isSavedFile) {
                        try {
                            // Try relative URL first
                            let fetchUrl = `/song/${id}`;
                            // If that fails, try absolute URL
                            if (!fetchUrl.startsWith("http")) {
                                const baseUrl = window.location.origin;
                                fetchUrl = `${baseUrl}/song/${id}`;
                            }
                            const res = await fetch(fetchUrl, {
                                credentials: "same-origin",
                                headers: {
                                    Accept: "text/html",
                                },
                            });
                            if (res.ok) {
                                const html = await res.text();
                                const doc = new DOMParser().parseFromString(html, "text/html");
                                const lyricsEl = doc.querySelector(CONFIG.SELECTORS.LYRICS);
                                const lyrics = clean(lyricsEl ? lyricsEl.textContent : "");
                                const summaryEl = doc.querySelector(CONFIG.SELECTORS.SUMMARY);
                                const metaDesc = doc.querySelector('meta[name="description"]');
                                const summary = clean(
                                    summaryEl ?
                                    summaryEl.textContent :
                                    metaDesc ?
                                    metaDesc.content :
                                    ""
                                );
                                const authorEl = doc.querySelector(CONFIG.SELECTORS.AUTHOR);
                                const author = clean(authorEl ? authorEl.textContent : "");
                                const tagEls = doc.querySelectorAll(
                                    CONFIG.SELECTORS.TAGS || ""
                                );
                                const tags = Array.from(tagEls)
                                    .map((n) => n.textContent.trim())
                                    .filter(Boolean)
                                    .join(", ");
                                const audioNode = doc.querySelector(
                                    CONFIG.SELECTORS.AUDIO_META
                                );
                                const audio = audioNode ?
                                    audioNode.src || audioNode.content :
                                    "";
                                if (lyrics || summary) {
                                    const song = {
                                        id,
                                        href,
                                        title: el.getAttribute("title") || el.textContent.trim(),
                                        author,
                                        tags,
                                        lyrics,
                                        summary,
                                        audio,
                                        scrapedAt: new Date().toISOString(),
                                        source: "fetch",
                                    };
                                    results.push(song);
                                    progress.processed[id] = song;
                                    sessionStorage.setItem(
                                        CONFIG.RESUME_KEY,
                                        JSON.stringify(progress)
                                    );
                                    console.log(
                                        `✅ [${i + 1}] ${
                      song.title || id
                    } — fetched (lyrics: ${!!lyrics})`
                                    );
                                    ok = true;
                                    break;
                                }
                            }
                        } catch (fetchErr) {
                            // Fetch failed, continue to next attempt
                            console.debug(
                                `   Fetch attempt failed for ${id}:`,
                                fetchErr.message
                            );
                        }
                    }
                    // Attempt 3: Search current document for song data (works on saved HTML)
                    // Look for song data in the current page if it's a saved HTML file
                    if (isSavedFile) {
                        // Try to find the song in the current document
                        const songLink = document.querySelector(`a[href*="/song/${id}"]`);
                        if (songLink) {
                            // Find container with song info
                            let container = songLink.closest(
                                '[data-clip-id], [data-testid="song-row"], .clip-row, div'
                            );
                            if (!container) container = songLink.parentElement;

                            // Try multiple selector strategies for lyrics
                            let lyrics = "";
                            const lyricsSelectors = [
                                ".whitespace-pre-wrap",
                                '[data-testid="lyrics"]',
                                ".lyrics",
                                "pre",
                                ".song-lyrics",
                                'div[class*="lyrics"]',
                                'div[class*="text"]',
                                'div[class*="css"][class*="e"]', // CSS-in-JS classes like css-c3ey94
                            ];

                            // First try specific selectors
                            for (const selector of lyricsSelectors) {
                                const lyricsEl = container ?
                                    container.querySelector(selector) :
                                    null;
                                if (lyricsEl && lyricsEl.textContent.trim().length > 20) {
                                    lyrics = clean(lyricsEl.textContent);
                                    break;
                                }
                            }

                            // If no lyrics found, search for divs with substantial text content
                            // (lyrics are often in divs with long text near the song)
                            if (!lyrics && container) {
                                const allDivs = container.querySelectorAll("div");
                                for (const div of allDivs) {
                                    const text = div.textContent.trim();
                                    // Look for divs with substantial text that might be lyrics
                                    // (usually 50+ chars, contains line breaks or verse markers)
                                    if (
                                        text.length > 50 &&
                                        (text.includes("\n") ||
                                            text.includes("[Verse") ||
                                            text.includes("[Chorus") ||
                                            text.match(/^[A-Z][a-z]+/m)) // Starts with capitalized word
                                    ) {
                                        // Check if it's not just metadata (exclude short tags/descriptions)
                                        const lines = text
                                            .split("\n")
                                            .filter((l) => l.trim().length > 10);
                                        if (lines.length >= 3) {
                                            lyrics = clean(text);
                                            break;
                                        }
                                    }
                                }
                            }

                            // Last resort: search entire document for lyrics divs near song ID
                            if (!lyrics) {
                                const allDivs = document.querySelectorAll("div");
                                for (const div of allDivs) {
                                    const text = div.textContent.trim();
                                    // Check if this div contains the song ID in nearby context
                                    const parent = div.parentElement;
                                    const hasSongLink = parent ?
                                        parent.querySelector(`a[href*="/song/${id}"]`) :
                                        null;
                                    if (
                                        hasSongLink &&
                                        text.length > 50 &&
                                        text.split("\n").length >= 3
                                    ) {
                                        lyrics = clean(text);
                                        break;
                                    }
                                }
                            }

                            // Try to find summary/description
                            let summary = "";
                            const summarySelectors = [
                                ".mt-1.cursor-pointer",
                                '[data-testid="summary"]',
                                ".summary",
                                ".description",
                                'meta[name="description"]',
                            ];
                            for (const selector of summarySelectors) {
                                const summaryEl = container ?
                                    container.querySelector(selector) :
                                    null;
                                if (summaryEl) {
                                    summary = clean(
                                        summaryEl.textContent ||
                                        (summaryEl.content ? summaryEl.content : "") ||
                                        ""
                                    );
                                    if (summary) break;
                                }
                            }

                            // Get author
                            const authorEl = container ?
                                container.querySelector('a[href^="/@"]') ||
                                songLink.closest("div") ?
                                songLink.closest("div").querySelector('a[href^="/@"]') :
                                null :
                                null;
                            const author = clean(authorEl ? authorEl.textContent : "");

                            // Get tags
                            const tagEls = container ?
                                container.querySelectorAll(
                                    'a[href*="/style/"], [data-testid="tags"] span, .tags span'
                                ) :
                                [];
                            const tags = Array.from(tagEls)
                                .map((n) => clean(n.textContent))
                                .filter(Boolean)
                                .join(", ");

                            // Get title
                            const title = clean(
                                el.getAttribute("title") ||
                                el.textContent.trim() ||
                                songLink.textContent.trim()
                            );

                            if (lyrics || summary || title) {
                                const song = {
                                    id,
                                    href: href.startsWith("http") ?
                                        href :
                                        `https://suno.com${href}`,
                                    title,
                                    author,
                                    tags,
                                    lyrics,
                                    summary,
                                    audio: `https://cdn1.suno.ai/${id}.mp3`,
                                    scrapedAt: new Date().toISOString(),
                                    source: "saved-html",
                                };
                                results.push(song);
                                progress.processed[id] = song;
                                sessionStorage.setItem(
                                    CONFIG.RESUME_KEY,
                                    JSON.stringify(progress)
                                );
                                console.log(
                                    `✅ [${i + 1}] ${
                    song.title || id
                  } — saved HTML (lyrics: ${!!lyrics})`
                                );
                                ok = true;
                                break;
                            }
                        }
                    } else {
                        // Attempt 3b: hidden iframe fallback (only on live site)
                        const iframe = document.createElement("iframe");
                        iframe.style.position = "fixed";
                        iframe.style.left = "-9999px";
                        iframe.style.width = "1000px";
                        iframe.style.height = "800px";
                        iframe.style.opacity = "0";
                        iframe.src = href.startsWith("http") ?
                            href :
                            `https://suno.com${href}`;
                        document.body.appendChild(iframe);
                        await new Promise((resolve) =>
                            setTimeout(resolve, CONFIG.PANEL_WAIT_IFRAME / 10)
                        );
                        let idoc = null;
                        try {
                            idoc = iframe.contentDocument || iframe.contentWindow.document;
                        } catch (_) {}
                        let lyrics = "",
                            summary = "",
                            author = "",
                            tags = "",
                            audio = "";
                        if (idoc) {
                            const lyricsEl = idoc.querySelector(CONFIG.SELECTORS.LYRICS);
                            lyrics = clean(lyricsEl ? lyricsEl.textContent : "");
                            const summaryEl = idoc.querySelector(CONFIG.SELECTORS.SUMMARY);
                            const metaDesc = idoc.querySelector('meta[name="description"]');
                            summary = clean(
                                summaryEl ?
                                summaryEl.textContent :
                                metaDesc ?
                                metaDesc.content :
                                ""
                            );
                            const authorEl = idoc.querySelector(CONFIG.SELECTORS.AUTHOR);
                            author = clean(authorEl ? authorEl.textContent : "");
                            const tagEls = idoc.querySelectorAll(CONFIG.SELECTORS.TAGS || "");
                            tags = Array.from(tagEls)
                                .map((n) => n.textContent.trim())
                                .filter(Boolean)
                                .join(", ");
                            const audioNode = idoc.querySelector(CONFIG.SELECTORS.AUDIO_META);
                            audio = audioNode ? audioNode.src || audioNode.content : "";
                        }
                        document.body.removeChild(iframe);
                        if (lyrics || summary) {
                            const song = {
                                id,
                                href,
                                title: el.getAttribute("title") || el.textContent.trim(),
                                author,
                                tags,
                                lyrics,
                                summary,
                                audio,
                                scrapedAt: new Date().toISOString(),
                                source: "iframe",
                            };
                            results.push(song);
                            progress.processed[id] = song;
                            sessionStorage.setItem(
                                CONFIG.RESUME_KEY,
                                JSON.stringify(progress)
                            );
                            console.log(
                                `✅ [${i + 1}] ${
                  song.title || id
                } — iframe (lyrics: ${!!lyrics})`
                            );
                            ok = true;
                            break;
                        }
                    }
                    lastErr =
                        "No lyrics/summary found (inline/fetch/iframe fallback exhausted)";
                } catch (err) {
                    lastErr = err;
                    console.warn(
                        `   ! [${i + 1}] attempt ${attempt} failed:`,
                        err.message || err
                    );
                    await wait(400 + attempt * 200);
                }
            }
            if (!ok) {
                console.error(`✖ [${i + 1}] FAILED ${id}: ${String(lastErr)}`);
                const failObj = {
                    id,
                    href,
                    title: el.getAttribute("title") || el.textContent.trim(),
                    error: String(lastErr),
                    scrapedAt: new Date().toISOString(),
                };
                results.push(failObj);
                progress.processed[id] = failObj;
                sessionStorage.setItem(CONFIG.RESUME_KEY, JSON.stringify(progress));
            }
            // Autosave
            if ((i + 1) % CONFIG.SAVE_INTERVAL === 0) {
                console.log(`⏺ Autosave after ${i + 1} items`);
                const rows = Object.values(progress.processed);
                const headers = [
                    "id",
                    "title",
                    "author",
                    "tags",
                    "lyrics",
                    "summary",
                    "audio",
                    "scrapedAt",
                    "error",
                    "source",
                ];
                try {
                    downloadFile(
                        toCSV(rows, headers),
                        `suno-partial-${new Date()
              .toISOString()
              .replace(/[:.]/g, "-")
              .slice(0, 19)}.csv`,
                        "text/csv"
                    );
                    downloadFile(
                        JSON.stringify(rows, null, 2),
                        `suno-partial-${new Date()
              .toISOString()
              .replace(/[:.]/g, "-")
              .slice(0, 19)}.json`,
                        "application/json"
                    );
                } catch (e) {
                    console.warn("Autosave failed", e);
                }
            }
            await wait(CONFIG.PER_SONG_DELAY);
        }
        // FINAL EXPORT
        const all = Object.values(progress.processed);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const headers = [
            "id",
            "title",
            "author",
            "tags",
            "lyrics",
            "summary",
            "audio",
            "scrapedAt",
            "error",
            "source",
        ];
        try {
            downloadFile(toCSV(all, headers), `suno-extract-${ts}.csv`, "text/csv");
            downloadFile(
                JSON.stringify(all, null, 2),
                `suno-extract-${ts}.json`,
                "application/json"
            );
        } catch (e) {
            console.error("Final export failed", e);
        }
        window.extractedSongs = all;
        console.log(
            "🎉 Extraction done. Inspect window.extractedSongs and check your Downloads folder."
        );
        return all;
    }

    // Export function for advanced extraction
    function exportSunoSongsData(songs, prefix = "suno-adv") {
        if (!songs || !songs.length) {
            console.error("❌ No songs to export!");
            return;
        }
        // Order fields consistently
        const fields = [
            "id",
            "title",
            "author",
            "tags",
            "lyrics",
            "summary",
            "audio",
            "scrapedAt",
            "error",
            "source",
        ].filter((f) => songs[0][f] !== undefined);

        // Sort songs by title
        songs = songs
            .slice()
            .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

        // --- CSV Export ---
        const csv = toCSV(songs, fields);
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
        const csvFile = `${prefix}-${timestamp}.csv`;
        downloadFile(csv, csvFile, "text/csv");

        // --- JSON Export ---
        const jsonFile = `${prefix}-${timestamp}.json`;
        downloadFile(JSON.stringify(songs, null, 2), jsonFile, "application/json");

        // --- TXT Summary Export ---
        const txtSummary = [
            `🎵 SUNO ADVANCED EXTRACTION EXPORT`,
            "=".repeat(70),
            `Exported: ${new Date().toLocaleString()}`,
            `Total Songs: ${songs.length}`,
            `Source: ${window.location.href}`,
            "=".repeat(70),
            "",
            ...songs.slice(0, 30).map((s, i) => {
                let line = `${String(i + 1).padStart(3)}. ${s.title}`;
                if (s.author) line += ` | By: ${s.author}`;
                if (s.tags) line += `\n     Style: ${s.tags}`;
                if (s.lyrics) line += `\n     Lyrics: ${s.lyrics.substring(0, 100)}...`;
                if (s.summary)
                    line += `\n     Summary: ${s.summary.substring(0, 100)}...`;
                line += `\n     URL: ${s.href}`;
                if (s.error) line += `\n     ⚠️ Error: ${s.error}`;
                return line;
            }),
            songs.length > 30 ? `\n... and ${songs.length - 30} more!` : "",
            "",
        ].join("\n");

        const txtFile = `${prefix}-${timestamp}.txt`;
        downloadFile(txtSummary, txtFile, "text/plain");

        // --- Console Summary ---
        console.log("\n" + "=".repeat(70));
        console.log(`🎵 ADVANCED EXTRACTION COMPLETE!`);
        console.log("=".repeat(70));
        console.log(` - Total: ${songs.length} songs`);
        console.log(
            ` - Files in ~/Downloads/:\n    • ${csvFile}\n    • ${jsonFile}\n    • ${txtFile}`
        );
        console.log("\nFirst 10 songs:");
        songs.slice(0, 10).forEach((s, i) => {
            console.log(
                `   ${i + 1}. ${s.title}${s.author ? " - " + s.author : ""} ${
          s.tags ? "- " + s.tags : ""
        }`
            );
        });
        if (songs.length > 10) console.log(`   ... and ${songs.length - 10} more`);

        window.extractedSongs = songs;
        console.log(
            "\nType `extractedSongs` in the console to inspect your result."
        );
    }

    // Entry point
    window.sunoExtractAdvanced = async function() {
        const songs = await extractSunoAdvanced();
        exportSunoSongsData(songs, "suno-adv");
        return songs;
    };

    console.log("✅ Suno Advanced Extractor loaded");
    console.log("  > Run: await sunoExtractAdvanced()");
})();