// ==UserScript==
// @name         Suno Extractor v8.0 (Ultimate Integrator)
// @namespace    userscript://suno-extractor-v8-0
// @version      8.0.2
// @description  Precision v5.8 Scrolling Engine + Instant Google Sheets "Copy-Paste" + Cover Art Downloader.
// @author       AvaTarArTs
// @match        https://suno.com/*
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log("🚀 Suno Extractor v8.0 Ready");

    // --- STATE ---
    const collectedSongs = new Map();
    let isScrolling = false;
    let scrollInterval = null;
    let targetContainer = null;

    // --- CONFIGURATION ---
    const CONFIG = {
        FETCH_DETAILS: true,
        CONCURRENCY: 3,
        DELAY_MS: 300,
        SCROLL_STEP: 600,        // v5.8 Optimized
        SCROLL_INTERVAL: 1500,   // v5.8 Optimized
        MAX_RETRIES: 25
    };

    // --- UTILS ---
    const Utils = {
        wait: ms => new Promise(r => setTimeout(r, ms)),
        safeText: el => (el?.textContent || "").replace(/\s+/g, " ").trim(),
        cleanId: url => (url.match(/\/song\/([a-f0-9-]{36})/) || [])[1],
        
        // FANCY TRICK: Format data for instant Google Sheets / Excel Paste
        toTSV: (songs) => {
            const headers = ["Title", "Tags", "Duration", "Audio URL", "Cover URL", "Suno Link", "ID"];
            const rows = songs.map(s => [
                s.title,
                s.tags,
                s.duration,
                s.audioUrl,
                s.imageUrl,
                s.url,
                s.id
            ].map(val => String(val || "").replace(/\t/g, " ")).join("\t"));
            
            return [headers.join("\t"), ...rows].join("\n");
        },

        download: (content, name, mime) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([content], { type: mime }));
            a.download = name;
            a.click();
        }
    };

    // Tags / description: Suno uses several Emotion class pairs (see suno-cell.html samples).
    const TAG_DIV_SELECTORS = [
        "div.css-ingj1g.elulw0l14",
        "div.css-19e6g0z.elulw0l8",
        "div.css-1d74pf0.elulw0l21",
        "div.css-1r3k5k6.elulw0l16",
        "div.css-8yp4m0.elulw0l5",
        "div.block-clip-focus.css-8yp4m0.elulw0l5",
        "div.elulw0l14",
        "div.elulw0l8"
    ];

    function extractTagsFromRow(row, titleHint) {
        if (!row) return "";
        const badExact = /^(Publish|Remix\/Edit)$/i;
        const durationOnly = /^\d:\d{2}$/;
        const minWords = 8;
        const minLen = 40;

        const normalizeChunk = (raw) => String(raw || "").replace(/\s+/g, " ").trim();

        const scoreText = (raw) => {
            let t = normalizeChunk(raw);
            t = t.replace(/^\d{1,2}:\d{2}\s+/, "");
            if (titleHint && t.startsWith(titleHint)) {
                let rest = t.slice(titleHint.length).trim();
                rest = rest.replace(/^v[\d.]+-all\s+/i, "").trim();
                if (rest.length >= minLen) t = rest;
            }
            return t;
        };

        const isGood = (t) =>
            t.length >= minLen &&
            t.split(/\s+/).length >= minWords &&
            !badExact.test(t) &&
            !durationOnly.test(t);

        for (const sel of TAG_DIV_SELECTORS) {
            for (const el of row.querySelectorAll(sel)) {
                const t = scoreText(el.textContent);
                if (isGood(t)) return t;
            }
        }

        const divs = row.querySelectorAll("div[class*='elulw0l']");
        let best = "";
        for (const el of divs) {
            const c = el.getAttribute("class") || "";
            if (!/\bcss-[a-z0-9]+\b/.test(c)) continue;
            if (/\belulw0l4\b/.test(c) && durationOnly.test(Utils.safeText(el))) continue;
            const t = scoreText(el.textContent);
            if (!isGood(t)) continue;
            if (t.length > best.length) best = t;
        }
        return best;
    }

    // --- UI SETUP ---
    function createPanel() {
        if (document.getElementById('suno-panel-v8')) return;

        const panel = document.createElement('div');
        panel.id = 'suno-panel-v8';
        
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
            backgroundColor: '#0a0a0a', color: '#fff', padding: '18px',
            borderRadius: '12px', boxShadow: '0 0 30px rgba(138, 43, 226, 0.5)',
            fontFamily: 'sans-serif', width: '320px', border: '2px solid #8a2be2'
        });

        panel.innerHTML = `
            <h3 style="margin: 0 0 12px 0; color: #a855f7; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                <span>🚀</span> Suno Integrator v8.0
            </h3>
            
            <div style="background: #1a1a1a; padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333;">
                <div id="suno-counter" style="font-size: 20px; font-weight: bold; color: #fff;">0 Songs Found</div>
                <div id="suno-status" style="font-size: 12px; color: #888; margin-top: 4px; font-weight: 500;">Ready to hunt.</div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="suno-start-btn" style="padding: 12px; background: #262626; color: white; border: 1px solid #555; borderRadius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                    🎯 Target & Scroll
                </button>
                
                <div style="display: flex; gap: 8px;">
                    <button id="suno-copy-btn" title="Paste directly into Google Sheets" style="flex: 1.2; padding: 12px; background: #8a2be2; color: white; border: none; borderRadius: 8px; font-weight: bold; cursor: pointer;">
                        📋 Copy for Sheets
                    </button>
                    <button id="suno-dl-btn" title="Download CSV, JSON, and Cover script" style="flex: 0.8; padding: 12px; background: #333; color: white; border: none; borderRadius: 8px; font-weight: bold; cursor: pointer;">
                        ⬇️ Files
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // --- BUTTON LOGIC ---
        const startBtn = document.getElementById('suno-start-btn');
        const copyBtn = document.getElementById('suno-copy-btn');
        const dlBtn = document.getElementById('suno-dl-btn');
        const status = document.getElementById('suno-status');

        startBtn.onclick = toggleAutoScroll;
        
        copyBtn.onclick = async function() {
            if (collectedSongs.size === 0) return alert("Collect songs first!");
            stopAutoScroll();
            copyBtn.disabled = true;
            copyBtn.innerText = "⏳ Processing...";
            
            const tsvData = Utils.toTSV(Array.from(collectedSongs.values()));
            if (typeof GM_setClipboard !== 'undefined') GM_setClipboard(tsvData);
            else navigator.clipboard.writeText(tsvData);

            copyBtn.innerText = "✅ Ready to Paste!";
            copyBtn.style.background = "#22c55e";
            status.innerText = "Go to Google Sheets and hit Ctrl+V (Paste).";
            status.style.color = "#22c55e";
            
            setTimeout(() => { 
                copyBtn.disabled = false; 
                copyBtn.innerText = "📋 Copy for Sheets";
                copyBtn.style.background = "#8a2be2";
            }, 5000);
        };

        dlBtn.onclick = async function() {
            if (collectedSongs.size === 0) return alert("Collect songs first!");
            stopAutoScroll();
            dlBtn.disabled = true;
            await runExport(dlBtn, status);
        };
    }

    // --- ACCUMULATOR ENGINE (v5.8) ---
    function startAccumulator() {
        setInterval(() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/song/"]'));
            anchors.forEach(a => {
                const id = Utils.cleanId(a.href);
                if (!id) return;

                const row = a.closest('div[role="row"]') || a.closest('div.clip-row') || a.closest('div.relative');

                if (collectedSongs.has(id)) {
                    const existing = collectedSongs.get(id);
                    if (row && !existing.tags) {
                        const t = extractTagsFromRow(row, existing.title);
                        if (t) existing.tags = t;
                    }
                    return;
                }
                const title = (a.getAttribute('title') || a.innerText || "Untitled").trim();
                
                let imageUrl = "";
                const img = row ? row.querySelector('img') : null;
                if (img) {
                    imageUrl = img.src || img.getAttribute('data-src') || "";
                    if(imageUrl) imageUrl = imageUrl.replace("/image_", "/image_large_").replace(/\?width=\d+/, "");
                }

                let duration = "";
                if (row) {
                    const durEl = Array.from(row.querySelectorAll('*')).find(e => /^\d:\d{2}$/.test(e.innerText));
                    if (durEl) duration = durEl.innerText;
                }

                const tags = row ? extractTagsFromRow(row, title) : "";

                collectedSongs.set(id, {
                    id, title, imageUrl, duration, tags,
                    url: `https://suno.com/song/${id}`,
                    audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
                    source: 'dom',
                    extractedAt: new Date().toISOString()
                });
            });

            const counter = document.getElementById('suno-counter');
            if (counter) counter.innerText = `${collectedSongs.size} Songs Found`;
        }, 300);
    }

    // --- PRECISION SCROLLER ENGINE (v5.8) ---
    function findTargetContainer() {
        let el = document.querySelector('.clip-browser-list-scroller');
        if (el) return el;
        const imitator = document.querySelector('.scroll-margin-imitator');
        if (imitator && imitator.parentElement && imitator.parentElement.parentElement) {
            return imitator.parentElement.parentElement;
        }
        return window;
    }

    function toggleAutoScroll() {
        const btn = document.getElementById('suno-start-btn');
        const status = document.getElementById('suno-status');
        
        if (isScrolling) { stopAutoScroll(); return; }

        targetContainer = findTargetContainer();
        if (targetContainer && targetContainer !== window) {
            targetContainer.style.border = "4px solid #8a2be2"; 
            status.style.color = "#a855f7";
            status.innerText = "🎯 Locked on Scroller. Moving...";
        } else {
            status.innerText = "Scrolling Window (Fallback)...";
        }

        isScrolling = true;
        btn.innerText = "🛑 Stop Scrolling";
        btn.style.background = "#7f1d1d";
        
        let noChangeCount = 0;
        let lastSize = 0;

        scrollInterval = setInterval(() => {
            if (targetContainer.scrollBy) {
                targetContainer.scrollBy({ top: CONFIG.SCROLL_STEP, behavior: 'smooth' });
            } else {
                window.scrollBy({ top: CONFIG.SCROLL_STEP, behavior: 'smooth' });
            }
            
            const currentSize = collectedSongs.size;
            if (currentSize === lastSize) {
                noChangeCount++;
                status.style.color = "#f59e0b";
                status.innerText = `Waiting for load... (${noChangeCount}/${CONFIG.MAX_RETRIES})`;
                if (noChangeCount % 5 === 0 && targetContainer.scrollBy) {
                     targetContainer.scrollBy({ top: -50, behavior: 'auto' });
                }
                if (noChangeCount >= CONFIG.MAX_RETRIES) {
                    status.style.color = "#ef4444";
                    status.innerText = "Reached end of list.";
                    stopAutoScroll();
                }
            } else {
                noChangeCount = 0;
                lastSize = currentSize;
                status.style.color = "#a855f7";
                status.innerText = `Found +${currentSize} songs...`;
            }
        }, CONFIG.SCROLL_INTERVAL);
    }

    function stopAutoScroll() {
        if (scrollInterval) clearInterval(scrollInterval);
        if (targetContainer && targetContainer.style) targetContainer.style.border = "";
        isScrolling = false;
        const btn = document.getElementById('suno-start-btn');
        if (btn) {
            btn.innerText = "🎯 Target & Scroll";
            btn.style.background = "#262626";
        }
    }

    // --- COVER ART SCRIPT GENERATOR ---
    function generatePythonScript(songs) {
        const songsJson = JSON.stringify(songs.map(s => ({ title: s.title, id: s.id, imageUrl: s.imageUrl })));
        return `
import os, requests, json, time
songs = ${songsJson}
FOLDER = "Suno_Covers"
def main():
    if not os.path.exists(FOLDER): os.makedirs(FOLDER)
    print(f"🚀 Downloading {len(songs)} covers...")
    for song in songs:
        url = song.get('imageUrl')
        if not url: continue
        name = song.get('title', 'Untitled').replace('/', '_').replace('\\\\', '_').replace(':', '-')
        path = f"{FOLDER}/{name} - {song.get('id', '')[:5]}.jpeg"
        if not os.path.exists(path):
            try:
                r = requests.get(url, timeout=10)
                if r.status_code == 200:
                    with open(path, 'wb') as f: f.write(r.content)
                    print(f"✅ {name}")
                time.sleep(0.1)
            except: print(f"❌ Error: {name}")
    print("\\n🎉 All Done!")
    input("Press Enter to exit...")
if __name__ == "__main__": main()
`;
    }

    // --- DATA FETCHING ---
    async function fetchDetails(songs, statusEl) {
        let completed = 0;
        const pool = async (song) => {
            try {
                await Utils.wait(CONFIG.DELAY_MS);
                const res = await fetch(song.url);
                if (res.ok) {
                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, "text/html");
                    const ly = doc.querySelector(".whitespace-pre-wrap") || doc.querySelector('[data-testid="lyrics"]');
                    song.lyrics = ly ? Utils.safeText(ly) : "";
                    const sum = doc.querySelector('[data-testid="summary"]') || doc.querySelector('meta[name="description"]');
                    song.summary = sum ? (sum.content || Utils.safeText(sum)) : "";
                }
            } catch (e) {}
            completed++;
            statusEl.innerText = `Deep Scanning Lyrics: ${completed}/${songs.length}`;
        };
        const workers = [];
        const queue = [...songs];
        for (let i = 0; i < CONFIG.CONCURRENCY; i++) {
            workers.push((async () => { while (queue.length) await pool(queue.shift()); })());
        }
        await Promise.all(workers);
    }

    async function runExport(btn, statusEl) {
        let songs = Array.from(collectedSongs.values());
        await fetchDetails(songs, statusEl);
        
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const prefix = `suno-full-backup-${songs.length}`;
        
        const csvHeaders = ["Title", "Tags", "Duration", "Audio URL", "Cover URL", "Suno Link", "ID"];
        const csvKeys = ["title", "tags", "duration", "audioUrl", "imageUrl", "url", "id"];
        const csv = [csvHeaders.join(","), ...songs.map(s => csvKeys.map(k => `"${String(s[k]||"").replace(/"/g,'""')}"`).join(","))].join("\n");
        
        Utils.download(csv, `${prefix}.csv`, "text/csv");
        Utils.download(JSON.stringify(songs, null, 2), `${prefix}.json`, "application/json");
        Utils.download(generatePythonScript(songs), `download_covers.py`, "text/x-python");

        statusEl.innerText = "✅ All files saved!";
        statusEl.style.color = "#22c55e";
        btn.disabled = false;
    }

    // --- START ---
    window.addEventListener('load', () => setTimeout(createPanel, 1500));
    startAccumulator();

})();