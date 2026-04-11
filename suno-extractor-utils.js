// --- Suno Data Extractor - Shared Utilities ---
// Common functions used by all extraction versions

(function() {
    // Helper: Escapes/cleans text for CSV/TXT
    function clean(text) {
        if (!text) return '';
        return String(text).replace(/"/g, '""').replace(/\r?\n|\r/g, ' ').trim();
    }

    // Helper: Downloads content as a file
    function downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`✅ Saved: ${filename}`);
    }

    // Helper: Converts array of objects to CSV string
    function toCSV(rows, headers) {
        const lines = [];
        lines.push(headers.join(','));
        for (const r of rows) {
            const line = headers.map(h => {
                const v = String(r[h] || '').replace(/"/g, '""');
                return (v.includes(',') || v.includes('\n')) ? `"${v}"` : v;
            }).join(',');
            lines.push(line);
        }
        return lines.join('\n');
    }

    // Helper: Waits for a number of ms
    const wait = ms => new Promise(res => setTimeout(res, ms));

    // Export utilities to window
    window.sunoUtils = {
        clean,
        downloadFile,
        toCSV,
        wait
    };

    console.log('✅ Suno utilities loaded');
})();

