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