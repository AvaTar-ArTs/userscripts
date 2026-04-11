#!/usr/bin/env node

/**
 * Compare different suno export files to analyze differences
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const csvDir = '/Users/steven/Music/nocTurneMeLoDieS/csv';

// Find all export files
const files = execSync(`find "${csvDir}" -maxdepth 1 -name "suno-export*COMBINED*.csv" -o -name "suno-export*MERGED*.csv" 2>/dev/null`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(f => f && fs.existsSync(f))
  .sort();

console.log('📊 Comparing Suno Export Files\n');
console.log('═'.repeat(80));

// Parse CSV line
function parseCSVLine(line) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j + 1] === '"') {
        currentValue += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  return values;
}

// Extract UUID
function extractUUID(str) {
  const match = str.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return match ? match[0] : null;
}

// Find ID column
function findIdColumn(headers) {
  const idPatterns = ['id', 'clip_id', 'song_id', 'suno_id', 'uuid'];
  for (const pattern of idPatterns) {
    const index = headers.findIndex(h => h.toLowerCase() === pattern);
    if (index !== -1) return index;
  }
  return -1;
}

// Get song IDs from file
function getSongIds(file) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length < 2) return new Set();

    const headers = parseCSVLine(lines[0]);
    const idIndex = findIdColumn(headers);
    const ids = new Set();

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      let songId = null;

      if (idIndex !== -1 && values[idIndex]) {
        songId = values[idIndex].trim();
      } else {
        for (const val of values) {
          const uuid = extractUUID(val);
          if (uuid) {
            songId = uuid;
            break;
          }
        }
      }

      if (songId) ids.add(songId);
    }

    return ids;
  } catch (err) {
    return new Set();
  }
}

// Analyze each file
const fileData = [];
for (const file of files) {
  const basename = path.basename(file);
  const stats = fs.statSync(file);
  const lineCount = fs.readFileSync(file, 'utf-8').split('\n').length;
  const songCount = lineCount - 1;
  const ids = getSongIds(file);

  fileData.push({
    file,
    basename,
    size: stats.size,
    lineCount,
    songCount,
    ids,
    uniqueIds: ids.size
  });
}

// Sort by song count
fileData.sort((a, b) => b.songCount - a.songCount);

// Print comparison table
console.log('\n📋 File Comparison:\n');
console.log('File'.padEnd(60) + 'Songs'.padStart(10) + 'Unique IDs'.padStart(12) + 'Size'.padStart(12));
console.log('-'.repeat(94));

for (const data of fileData) {
  const sizeMB = (data.size / 1024 / 1024).toFixed(1) + ' MB';
  console.log(
    data.basename.padEnd(60) +
    data.songCount.toString().padStart(10) +
    data.uniqueIds.toString().padStart(12) +
    sizeMB.padStart(12)
  );
}

// Compare with latest (first/largest)
if (fileData.length > 1) {
  const latest = fileData[0];
  console.log('\n\n🔍 Detailed Comparison (vs Latest - ' + latest.basename + '):\n');
  console.log('═'.repeat(80));

  for (let i = 1; i < fileData.length; i++) {
    const other = fileData[i];
    const inLatest = new Set([...other.ids].filter(id => latest.ids.has(id)));
    const onlyInOther = new Set([...other.ids].filter(id => !latest.ids.has(id)));
    const onlyInLatest = new Set([...latest.ids].filter(id => !other.ids.has(id)));

    console.log(`\n📁 ${other.basename}`);
    console.log(`   Total songs: ${other.songCount}`);
    console.log(`   Unique IDs: ${other.uniqueIds}`);
    console.log(`   In latest: ${inLatest.size} (${((inLatest.size / other.uniqueIds) * 100).toFixed(1)}%)`);
    console.log(`   Only in this file: ${onlyInOther.size}`);
    console.log(`   Missing from this file: ${onlyInLatest.size} (vs latest)`);

    if (onlyInOther.size > 0 && onlyInOther.size <= 10) {
      console.log(`   Sample unique IDs: ${Array.from(onlyInOther).slice(0, 5).join(', ')}`);
    }
  }
}

// Summary statistics
console.log('\n\n📊 Summary Statistics:\n');
console.log('═'.repeat(80));
console.log(`Total files compared: ${fileData.length}`);
console.log(`Largest file: ${fileData[0].basename} (${fileData[0].songCount} songs, ${fileData[0].uniqueIds} unique IDs)`);
console.log(`Smallest file: ${fileData[fileData.length - 1].basename} (${fileData[fileData.length - 1].songCount} songs)`);

// Find all unique IDs across all files
const allIds = new Set();
for (const data of fileData) {
  for (const id of data.ids) {
    allIds.add(id);
  }
}

console.log(`\n🎵 Total unique songs across ALL files: ${allIds.size}`);

// Find IDs only in latest
if (fileData.length > 1) {
  const latestIds = fileData[0].ids;
  const otherIds = new Set();
  for (let i = 1; i < fileData.length; i++) {
    for (const id of fileData[i].ids) {
      otherIds.add(id);
    }
  }

  const onlyInLatest = new Set([...latestIds].filter(id => !otherIds.has(id)));
  const inOthersNotLatest = new Set([...otherIds].filter(id => !latestIds.has(id)));

  console.log(`\n✨ Latest file has ${onlyInLatest.size} songs not in any other file`);
  console.log(`⚠️  Other files have ${inOthersNotLatest.size} songs not in latest file`);

  if (inOthersNotLatest.size > 0 && inOthersNotLatest.size <= 20) {
    console.log(`   Sample: ${Array.from(inOthersNotLatest).slice(0, 10).join(', ')}`);
  }
}

console.log('\n');

