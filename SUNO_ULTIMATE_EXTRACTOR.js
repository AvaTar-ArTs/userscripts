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
