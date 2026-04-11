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
