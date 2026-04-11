#!/usr/bin/env node

/**
 * Merge all suno CSV sources including files listed in all-suno.txt
 * Handles duplicates, differences, and creates comprehensive merged file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outputDir = '/Users/steven/Music/nocTurneMeLoDieS/csv';
const allSunoFile = path.join(outputDir, 'all-suno.txt');

// Get CSV files from all-suno.txt
let csvFilesFromList = [];
if (fs.existsSync(allSunoFile)) {
  const content = fs.readFileSync(allSunoFile, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);

  csvFilesFromList = lines
    .filter(line => line.toLowerCase().includes('suno') && line.toLowerCase().endsWith('.csv'))
    .filter(file => fs.existsSync(file));

  console.log(`📄 Found ${csvFilesFromList.length} CSV files in all-suno.txt\n`);
}

// Get all CSV files from our previous search
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

let allFiles = [];
for (const dir of searchDirs) {
  try {
    const findCmd = `find "${dir}" -name "suno-export-*.csv" -type f 2>/dev/null`;
    const files = execSync(findCmd, { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f && fs.existsSync(f));
    allFiles = allFiles.concat(files);
  } catch (err) {
    // Directory might not exist, skip
  }
}

// Combine and deduplicate file paths
const allCsvFiles = [...new Set([...allFiles, ...csvFilesFromList])]
  .filter(f => !f.includes('ALL-COMBINED') && !f.includes('combined-all') && !f.includes('combined.csv'))
  .filter(f => fs.existsSync(f))
  .sort();

console.log(`🎵 Found ${allCsvFiles.length} total suno CSV files to process\n`);

// Track unique songs by ID with metadata
const songsMap = new Map(); // id -> { row, source, fields }
const fieldSets = new Set();
let totalRows = 0;
let skippedDuplicates = 0;
let processedFiles = 0;
let errorFiles = [];

// Parse CSV line with proper quote handling
function parseCSVLine(line) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j + 1] === '"') {
        // Escaped quote
        currentValue += '"';
        j++; // Skip next quote
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
  values.push(currentValue); // Last value
  return values;
}

// Process each file
for (const file of allCsvFiles) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      console.log(`   ⚠️  ${path.basename(file)}: Empty or header-only, skipping`);
      continue;
    }

    const headers = parseCSVLine(lines[0]);
    fieldSets.add(headers.join('|'));
    const idIndex = headers.findIndex(h => h.toLowerCase() === 'id');

    if (idIndex === -1) {
      console.log(`   ⚠️  ${path.basename(file)}: No 'id' column found, skipping`);
      continue;
    }

    const fileSongs = lines.length - 1;
    let fileAdded = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);

      if (values.length <= idIndex) continue;

      const songId = values[idIndex].trim();
      if (!songId) continue;

      if (!songsMap.has(songId)) {
        songsMap.set(songId, {
          row: lines[i],
          source: file,
          headers: headers,
          values: values
        });
        fileAdded++;
      } else {
        // Check if this version has more complete data (more non-empty fields)
        const existing = songsMap.get(songId);
        const existingNonEmpty = existing.values.filter(v => v && v.trim()).length;
        const newNonEmpty = values.filter(v => v && v.trim()).length;

        // Prefer version with more data, or prefer longer row if same
        if (newNonEmpty > existingNonEmpty ||
            (newNonEmpty === existingNonEmpty && lines[i].length > existing.row.length)) {
          songsMap.set(songId, {
            row: lines[i],
            source: file,
            headers: headers,
            values: values
          });
        }
        skippedDuplicates++;
      }
    }

    console.log(`   ✅ ${path.basename(file)}: ${fileSongs} songs (added ${fileAdded} new, ${fileSongs - fileAdded} duplicates)`);
    totalRows += fileSongs;
    processedFiles++;
  } catch (err) {
    console.error(`   ❌ Error processing ${file}: ${err.message}`);
    errorFiles.push(file);
  }
}

// Get the most complete header set
const allHeaders = Array.from(fieldSets)
  .map(s => s.split('|'))
  .sort((a, b) => b.length - a.length)[0]; // Use the header with most fields

console.log(`\n📊 Summary:`);
console.log(`   Processed ${processedFiles} files`);
console.log(`   Total rows: ${totalRows}`);
console.log(`   Unique songs: ${songsMap.size}`);
console.log(`   Duplicates skipped: ${skippedDuplicates}`);
console.log(`   Errors: ${errorFiles.length}`);
if (errorFiles.length > 0) {
  console.log(`   Error files: ${errorFiles.map(f => path.basename(f)).join(', ')}`);
}

// Create merged CSV
const uniqueSongs = Array.from(songsMap.values()).map(s => s.row);
const combinedCsv = [allHeaders.join(','), ...uniqueSongs].join('\n');

// Write output
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputFile = path.join(outputDir, `suno-export-ULTIMATE-MERGED-${timestamp}.csv`);
fs.writeFileSync(outputFile, combinedCsv, 'utf-8');

console.log(`\n💾 Ultimate merged file saved: ${outputFile}`);
console.log(`   Total unique songs: ${songsMap.size}`);
console.log(`   Header fields: ${allHeaders.length}\n`);

