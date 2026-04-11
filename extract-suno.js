#!/usr/bin/env node

/**
 * 🎵 Suno HTML Extractor - Offline Edition
 * Extracts song metadata from saved suno1.html file
 *
 * Usage: node extract-suno.js [suno1.html]
 */

const fs = require('fs');
const path = require('path');

// Simple HTML parser using regex (no dependencies needed)
function parseHTML(html) {
  const songs = new Map();

  // Find all song links
  const songLinkRegex = /<a[^>]+href="\/song\/([a-f0-9-]{36})"[^>]*>([^<]*)<\/a>/gi;
  let match;
  const allMatches = [];

  while ((match = songLinkRegex.exec(html)) !== null) {
    allMatches.push({
      id: match[1],
      title: match[2].trim() || 'Untitled',
      fullMatch: match[0],
      index: match.index
    });
  }

  console.log(`📍 Found ${allMatches.length} song links`);

  // For each song, extract surrounding context
  for (let i = 0; i < allMatches.length; i++) {
    const songMatch = allMatches[i];
    const id = songMatch.id;

    if (songs.has(id)) continue;

    // Find the container block (look backwards and forwards from the link)
    const startIdx = Math.max(0, songMatch.index - 5000);
    const endIdx = Math.min(html.length, songMatch.index + 5000);
    const context = html.substring(startIdx, endIdx);

    // Extract duration (look for pattern like "2:56" or "3:14")
    const durationMatch = context.match(/<div[^>]*class="[^"]*421ta7[^"]*"[^>]*>([\d:]+)<\/div>/i) ||
                         context.match(/(\d+:\d+)/);
    const duration = durationMatch ? durationMatch[1] : '';

    // Extract image URL
    const imgMatch = context.match(/<img[^>]*(?:src|data-src)="([^"]*)"[^>]*alt="[^"]*artwork[^"]*"/i) ||
                    context.match(/<img[^>]*(?:src|data-src)="([^"]*cdn[^"]*suno[^"]*\.(?:jpeg|jpg|png))"/i);
    let imageUrl = imgMatch ? imgMatch[1] : '';
    if (imageUrl) {
      imageUrl = imageUrl
        .replace('/image_', '/image_large_')
        .replace('?width=720', '')
        .replace('?width=100', '');
    }

    // Extract tags/description (look for the description div)
    const descMatch = context.match(/<div[^>]*class="[^"]*ingj1g[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let tags = '';
    if (descMatch) {
      // Clean HTML tags from description
      tags = descMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Extract author (look for profile links)
    const authorMatch = context.match(/<a[^>]+href="\/@([^"]+)"[^>]*>([^<]+)<\/a>/i) ||
                       html.match(/<a[^>]+href="\/@([^"]+)"[^>]*>([^<]+)<\/a>/i);
    const author = authorMatch ? authorMatch[2].trim() : '';
    const authorLink = authorMatch ? `https://suno.com/@${authorMatch[1]}` : '';

    // Extract play count (look for numbers near play button aria-label)
    const playMatch = context.match(/aria-label="[^"]*play[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i);
    const plays = playMatch ? playMatch[1] : '';

    // Extract likes (similar)
    const likeMatch = context.match(/aria-label="[^"]*like[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/i);
    const likes = likeMatch ? likeMatch[1] : '';

    songs.set(id, {
      id,
      title: songMatch.title,
      url: `https://suno.com/song/${id}`,
      shareUrl: `https://suno.com/s/${id.split('-')[0]}`,
      audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
      imageUrl,
      duration,
      tags,
      author,
      authorLink,
      plays,
      likes,
      detailAuthor: author,
      detailTags: tags,
      detailAudio: `https://cdn1.suno.ai/${id}.mp3`,
      sidebarSummary: tags.length > 200 ? tags.substring(0, 200) + '...' : tags,
      lyrics: '',
      extractedAt: new Date().toISOString(),
    });
  }

  return Array.from(songs.values());
}

function toCsv(rows, headers) {
  const lines = [];
  lines.push(headers.join(','));
  for (const row of rows) {
    const line = headers.map(key => {
      const raw = String(row[key] ?? '');
      const escaped = raw.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

// Main execution
const htmlFile = process.argv[2] || path.join(__dirname, 'suno1.html');

if (!fs.existsSync(htmlFile)) {
  console.error(`❌ File not found: ${htmlFile}`);
  process.exit(1);
}

console.log(`🎵 Suno HTML Extractor - Offline Edition`);
console.log(`──────────────────────────────────────────────`);
console.log(`📂 Reading: ${htmlFile}\n`);

const html = fs.readFileSync(htmlFile, 'utf-8');
const songs = parseHTML(html);

console.log(`✅ Extracted ${songs.length} unique songs!\n`);

if (songs.length === 0) {
  console.error('❌ No songs found in the HTML file.');
  process.exit(1);
}

// Generate exports
console.log('📝 Generating export files...\n');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const fields = [
  'id', 'title', 'url', 'shareUrl', 'audioUrl', 'imageUrl', 'duration',
  'tags', 'author', 'authorLink', 'plays', 'likes',
  'detailAuthor', 'detailTags', 'detailAudio', 'sidebarSummary', 'lyrics', 'extractedAt'
];

const csvContent = toCsv(songs, fields);
const jsonContent = JSON.stringify(songs, null, 2);

const txtContent = [
  '🎵 SUNO COLLECTION EXPORT',
  '──────────────────────────────────────────────',
  `Exported: ${new Date().toLocaleString()}`,
  `Total songs: ${songs.length}`,
  '──────────────────────────────────────────────',
  '',
  'Tracks:',
  '',
  ...songs.map((s, i) => {
    const lines = [];
    lines.push(`${String(i + 1).padStart(3, ' ')}. ${s.title}`);
    if (s.duration) lines.push(`   Duration: ${s.duration}`);
    if (s.author || s.detailAuthor) lines.push(`   Author: ${s.detailAuthor || s.author}`);
    if (s.tags || s.detailTags) {
      const tagText = (s.detailTags || s.tags).substring(0, 200);
      lines.push(`   Tags: ${tagText}${(s.detailTags || s.tags).length > 200 ? '...' : ''}`);
    }
    lines.push(`   URL: ${s.url}`);
    lines.push('');
    return lines.join('\n');
  })
].join('\n');

// Write files
const outputDir = path.dirname(htmlFile);
fs.writeFileSync(path.join(outputDir, `suno-export-${timestamp}.csv`), csvContent, 'utf-8');
fs.writeFileSync(path.join(outputDir, `suno-export-${timestamp}.json`), jsonContent, 'utf-8');
fs.writeFileSync(path.join(outputDir, `suno-export-${timestamp}.txt`), txtContent, 'utf-8');

console.log(`💾 Files saved:`);
console.log(`   - suno-export-${timestamp}.csv`);
console.log(`   - suno-export-${timestamp}.json`);
console.log(`   - suno-export-${timestamp}.txt`);
console.log(`\n✅ Export complete!\n`);

// Show preview
console.log('Preview (first 10 songs):');
console.table(songs.slice(0, 10).map(s => ({
  '#': songs.indexOf(s) + 1,
  'Title': s.title,
  'Duration': s.duration,
  'Author': s.detailAuthor || s.author || '',
})));

