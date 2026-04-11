#!/usr/bin/env node

/**
 * Combine all suno export CSV files, deduplicating by song ID
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const searchDirs = [
  '/Users/steven/Google Drive',
  '/Users/steven/claude',
  '/Users/steven/csv_outputs',
  '/Users/steven/cursor',
  '/Users/steven/docs_mkdocs',
  '/Users/steven/Documents',
  '/Users/steven/Downloads',
  '/Users/steven/Downloads_Analysis',
  '/Users/steven/Music',
  '/Users/steven/n8n-local',
  '/Users/steven/Pictures',
  '/Users/steven/pydocs',
  '/Users/steven/pythons',
  '/Users/steven/pythons-sort',
  '/Users/steven/scripts',
  '/Users/steven/workspace',
  '/Users/steven/Desktop'
];

const outputDir = '/Users/steven/Music/nocTurneMeLoDieS/csv';

// Find all CSV files in all search directories
let allFiles = [];
for (const dir of searchDirs) {
  try {
    const findCmd = `find "${dir}" -name "suno-export-*.csv" -type f 2>/dev/null`;
    const files = execSync(findCmd, { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f);
    allFiles = allFiles.concat(files);
  } catch (err) {
    // Directory might not exist, skip
  }
}

// Remove duplicates, exclude combined files, and sort
const files = [...new Set(allFiles)]
  .filter(f => !f.includes('ALL-COMBINED') && !f.includes('combined-all') && !f.includes('combined.csv'))
  .sort();

console.log(`🎵 Found ${files.length} suno export CSV files\n`);

// Track unique songs by ID
const songsMap = new Map();
let totalRows = 0;
let skippedDuplicates = 0;

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) continue; // Skip files with only header

    const headers = lines[0].split(',');
    const idIndex = headers.findIndex(h => h.toLowerCase() === 'id');

    if (idIndex === -1) {
      console.warn(`⚠️  No 'id' column found in ${file}`);
      continue;
    }

    const fileSongs = lines.length - 1; // Exclude header
    let fileAdded = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let currentValue = '';
      let inQuotes = false;

      // Parse CSV line (handling quoted fields)
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue);
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue); // Last value

      if (values.length <= idIndex) continue;

      const songId = values[idIndex].trim();
      if (!songId) continue;

      if (!songsMap.has(songId)) {
        songsMap.set(songId, lines[i]);
        fileAdded++;
      } else {
        skippedDuplicates++;
      }
    }

    console.log(`   ${path.basename(file)}: ${fileSongs} songs (added ${fileAdded} new, ${fileSongs - fileAdded} duplicates)`);
    totalRows += fileSongs;
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

const uniqueSongs = Array.from(songsMap.values());
console.log(`\n✅ Total unique songs: ${uniqueSongs.length}`);
console.log(`   Processed ${totalRows} total rows`);
console.log(`   Skipped ${skippedDuplicates} duplicates\n`);

// Read headers from the first file
const firstFile = files[0];
const firstContent = fs.readFileSync(firstFile, 'utf-8');
const headers = firstContent.split('\n')[0];

// Combine into final CSV
const combinedCsv = [headers, ...uniqueSongs].join('\n');

// Write output
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputFile = path.join(outputDir, `suno-export-ALL-COMBINED-${timestamp}.csv`);
fs.writeFileSync(outputFile, combinedCsv, 'utf-8');

console.log(`💾 Combined file saved: ${outputFile}`);
console.log(`   Total unique songs: ${uniqueSongs.length}\n`);

