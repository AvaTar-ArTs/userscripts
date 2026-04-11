#!/usr/bin/env node

/**
 * Intelligent merge of all suno CSV files with flexible ID detection
 */

const fs = require("fs");
const path = require("path");
const {
    execSync
} = require("child_process");

const outputDir = "/Users/steven/Music/nocTurneMeLoDieS/csv";
const allSunoFile = path.join(outputDir, "all-suno.txt");

// Get CSV files from all-suno.txt
let csvFilesFromList = [];
if (fs.existsSync(allSunoFile)) {
    const content = fs.readFileSync(allSunoFile, "utf-8");
    const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l);

    csvFilesFromList = lines
        .filter((line) => line.toLowerCase().endsWith(".csv"))
        .filter((file) => fs.existsSync(file));
}

// Get all CSV files from directory search
const searchDirs = [
    "/Users/steven/Google Drive",
    "/Users/steven/claude",
    "/Users/steven/csv_outputs",
    "/Users/steven/cursor",
    "/Users/steven/docs_mkdocs",
    "/Users/steven/Documents",
    "/Users/steven/Downloads",
    "/Users/steven/Downloads_Analysis",
    "/Users/steven/Music",
    "/Users/steven/n8n-local",
    "/Users/steven/Pictures",
    "/Users/steven/pydocs",
    "/Users/steven/pythons",
    "/Users/steven/pythons-sort",
    "/Users/steven/scripts",
    "/Users/steven/workspace",
    "/Users/steven/Desktop",
];

let allFiles = [];
for (const dir of searchDirs) {
    try {
        const findCmd = `find "${dir}" -name "*suno*.csv" -type f 2>/dev/null`;
        const files = execSync(findCmd, {
                encoding: "utf-8"
            })
            .trim()
            .split("\n")
            .filter((f) => f && fs.existsSync(f));
        allFiles = allFiles.concat(files);
    } catch (err) {}
}

// Combine and filter for suno-related files - must have suno.com URLs or suno.ai CDN URLs
const allCsvFiles = [...new Set([...allFiles, ...csvFilesFromList])]
    .filter((f) => {
        try {
            const content = fs
                .readFileSync(f, "utf-8")
                .substring(0, 10000)
                .toLowerCase();
            // Must have actual suno.com URLs or CDN URLs, not just UUIDs
            const hasSunoUrl =
                content.includes("suno.com/song/") ||
                content.includes("cdn1.suno.ai/") ||
                content.includes("cdn2.suno.ai/") ||
                content.includes("suno.com/@");

            // Also check if filename suggests it's suno-related
            const basename = path.basename(f).toLowerCase();
            const filenameSuggestsSuno =
                basename.includes("suno") &&
                !basename.includes("inventory") &&
                !basename.includes("scan") &&
                !basename.includes("files") &&
                !basename.includes("transcripts");

            return hasSunoUrl || filenameSuggestsSuno;
        } catch (e) {
            return false;
        }
    })
    .filter(
        (f) =>
        !f.includes("ALL-COMBINED") &&
        !f.includes("ULTIMATE-MERGED") &&
        !f.includes("combined-all")
    )
    .filter((f) => {
        const basename = path.basename(f).toLowerCase();
        // Exclude obvious non-suno files
        return (
            !basename.includes("inventory_report") &&
            !basename.includes("file_inventory") &&
            !basename.includes("transcripts") &&
            !basename.includes("vidiq") &&
            !basename.includes("fragments") &&
            !basename.includes("steven-scan") &&
            !basename.includes("downloads_multi") &&
            !basename.includes("volumes_image") &&
            !basename.includes("organized") &&
            !basename.includes("archive_") &&
            !basename.includes("dir_") &&
            !basename.includes("type_") &&
            !basename.includes("out_of_place") &&
            !basename.includes("docs_latest") &&
            !basename.includes("complete_file_inventory") &&
            !basename.includes("portfolio_markdown")
        );
    })
    .sort();

console.log(`🎵 Found ${allCsvFiles.length} suno-related CSV files\n`);

// Parse CSV line with proper quote handling
function parseCSVLine(line) {
    const values = [];
    let currentValue = "";
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
        } else if (char === "," && !inQuotes) {
            values.push(currentValue);
            currentValue = "";
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue);
    return values;
}

// Extract UUID from a string (could be in any column)
function extractUUID(str) {
    const match = str.match(
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
    );
    return match ? match[0] : null;
}

// Find ID column index
function findIdColumn(headers) {
    const idPatterns = [
        "id",
        "clip_id",
        "song_id",
        "suno_id",
        "uuid",
        "song_uuid",
    ];

    for (const pattern of idPatterns) {
        const index = headers.findIndex((h) => h.toLowerCase() === pattern);
        if (index !== -1) return index;
    }

    // Try to find column that contains UUIDs
    return -1;
}

const songsMap = new Map();
let totalRows = 0;
let skippedDuplicates = 0;
let processedFiles = 0;
let errorFiles = [];

for (const file of allCsvFiles) {
    try {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.trim().split("\n");

        if (lines.length < 2) continue;

        const headers = parseCSVLine(lines[0]);
        const idIndex = findIdColumn(headers);

        const fileSongs = lines.length - 1;
        let fileAdded = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            let songId = null;

            // Try to get ID from the ID column
            if (idIndex !== -1 && values[idIndex]) {
                songId = values[idIndex].trim();
            } else {
                // Try to extract UUID from any column
                for (const val of values) {
                    const uuid = extractUUID(val);
                    if (uuid) {
                        songId = uuid;
                        break;
                    }
                }
            }

            if (!songId) continue;

            // Count non-empty fields
            const nonEmptyCount = values.filter((v) => v && v.trim()).length;

            if (!songsMap.has(songId)) {
                songsMap.set(songId, {
                    row: lines[i],
                    headers: headers,
                    nonEmptyCount: nonEmptyCount,
                });
                fileAdded++;
            } else {
                // Prefer version with more complete data
                const existing = songsMap.get(songId);
                if (
                    nonEmptyCount > existing.nonEmptyCount ||
                    (nonEmptyCount === existing.nonEmptyCount &&
                        lines[i].length > existing.row.length)
                ) {
                    songsMap.set(songId, {
                        row: lines[i],
                        headers: headers,
                        nonEmptyCount: nonEmptyCount,
                    });
                }
                skippedDuplicates++;
            }
        }

        console.log(
            `   ✅ ${path.basename(
        file
      )}: ${fileSongs} songs (added ${fileAdded} new, ${
        fileSongs - fileAdded
      } duplicates)`
        );
        totalRows += fileSongs;
        processedFiles++;
    } catch (err) {
        console.error(`   ❌ Error processing ${file}: ${err.message}`);
        errorFiles.push(file);
    }
}

// Get the most complete header set
const allHeaders = Array.from(songsMap.values())
    .map((s) => s.headers)
    .sort((a, b) => b.length - a.length)[0];

console.log(`\n📊 Summary:`);
console.log(`   Processed ${processedFiles} files`);
console.log(`   Total rows: ${totalRows}`);
console.log(`   Unique songs: ${songsMap.size}`);
console.log(`   Duplicates skipped: ${skippedDuplicates}`);

// Create merged CSV
const uniqueSongs = Array.from(songsMap.values()).map((s) => s.row);
const combinedCsv = [allHeaders.join(","), ...uniqueSongs].join("\n");

// Write output
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outputFile = path.join(
    outputDir,
    `suno-export-ULTIMATE-MERGED-${timestamp}.csv`
);
fs.writeFileSync(outputFile, combinedCsv, "utf-8");

console.log(`\n💾 Ultimate merged file saved: ${outputFile}`);
console.log(`   Total unique songs: ${songsMap.size}`);
console.log(`   Header fields: ${allHeaders.length}\n`);