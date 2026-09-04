// ==UserScript==
// @name         Claude Chat Extractor
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Download/extract all files from a Claude project as a single ZIP
// @author       sharmanhall
// @match        https://claude.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=claude.ai
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/541467/Claude%20Project%20Files%20Extractor.user.js
// @updateURL    https://update.greasyfork.org/scripts/541467/Claude%20Project%20Files%20Extractor.meta.js
// ==/UserScript==

(function() {
    "use strict";

    /*** CONFIGURATION & SELECTORS ***/
    const CONFIG = {
        jsZipCdn: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
        minContentLength: 50,
        modalSelectors: ['[role="dialog"]'],
        closeSelectors: [
            'button[aria-label*="close"]',
            'button[aria-label*="Close"]',
            '[data-testid*="close"]',
            'button[title*="close"]',
            'button[title*="Close"]',
            ".modal button:last-child",
            '[role="dialog"] button:first-child',
            '[role="dialog"] button[type="button"]'
        ],
        contentSelectors: [
            "pre code",
            "pre",
            ".whitespace-pre-wrap",
            ".font-mono",
            ".overflow-auto pre",
            ".text-sm.whitespace-pre-wrap",
            '[class*="content"]',
            ".modal-body",
            ".dialog-content"
        ],
        fileElementSelectors: [
            'button[class*="cursor-pointer"]',
            'div[class*="cursor-pointer"]',
            '[role="button"]',
            ".clickable",
            'button[type="button"]'
        ],
        projectTitleSelectors: [
            "h1",
            '[data-testid*="title"]',
            ".text-xl",
            ".text-2xl",
            ".font-bold",
            "title"
        ]
    };

    /*** UTILITY FUNCTIONS ***/
    function logStep(message) {
        console.log(`📦 Claude Export: ${message}`);
    }

    function sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    /*** JSZip LOADER ***/
    function loadJSZip() {
        return new Promise((resolve, reject) => {
            if (typeof JSZip !== "undefined") {
                logStep("JSZip already available");
                resolve();
                return;
            }
            logStep("Loading JSZip from CDN...");
            const script = document.createElement("script");
            script.src = CONFIG.jsZipCdn;
            script.onload = () => {
                setTimeout(() => {
                    if (typeof JSZip !== "undefined") {
                        logStep("JSZip loaded");
                        resolve();
                    } else {
                        reject(new Error("JSZip loaded but not available"));
                    }
                }, 500);
            };
            script.onerror = () => reject(new Error("Failed to load JSZip"));
            document.head.appendChild(script);
        });
    }

    /*** MODAL HELPERS ***/
    async function waitForModal(timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const modal = document.querySelector(CONFIG.modalSelectors[0]);
            if (modal && modal.offsetHeight > 0) {
                await sleep(1000);
                return modal;
            }
            await sleep(100);
        }
        return null;
    }

    async function waitForModalClose(timeout = 3000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const modal = document.querySelector(CONFIG.modalSelectors[0]);
            if (!modal || modal.offsetHeight === 0) return true;
            await sleep(100);
        }
        return false;
    }

    function dispatchEscape() {
        document.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true
            })
        );
        document.dispatchEvent(
            new KeyboardEvent("keyup", {
                key: "Escape",
                bubbles: true
            })
        );
    }

    async function closeModal() {
        logStep("Attempting to close modal...");
        for (const selector of CONFIG.closeSelectors) {
            const buttons = document.querySelectorAll(selector);
            for (const btn of buttons) {
                try {
                    btn.click();
                    await sleep(300);
                    if (await waitForModalClose(1000)) {
                        logStep("Modal closed via button");
                        return true;
                    }
                } catch (e) {
                    logStep("Close button failed: " + e);
                }
            }
        }
        // Fallbacks: try Escape and click outside modal
        for (let i = 0; i < 3; i++) {
            dispatchEscape();
            await sleep(200);
        }
        const modal = document.querySelector(CONFIG.modalSelectors[0]);
        if (modal) {
            const rect = modal.getBoundingClientRect();
            const outside = document.elementFromPoint(rect.left - 10, rect.top);
            if (outside) outside.click();
        }
        const closed = await waitForModalClose();
        logStep(closed ? "Modal closed" : "Failed to close modal");
        return closed;
    }

    /*** FILE NAME/TYPE/CONTENT EXTRACTION ***/
    function extractFileName(element) {
        // Try match by different patterns for filenames
        const text = element.textContent.trim();
        const patterns = [
            /^(.+\.(?:pdf|txt|md|json|xml|csv|doc|docx|xlsx?))\s*\d+\s*lines?/i,
            /^(.+?)\s*\d+\s*lines?\s*(pdf|txt|text|md|json|xml|csv)/i,
            /^([^0-9]+?)(?:\s*\d+\s*lines?|$)/i
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1].trim();
        }
        // Fallback: Compose from first meaningful words
        const words = text.split(/\s+/).filter(word =>
            word.length > 2 &&
            !/^\d+$/.test(word) &&
            !/^(lines?|pdf|txt|text|md|json|xml|csv)$/i.test(word)
        );
        if (words.length > 0) return words.slice(0, 3).join("_");
        return "Unknown_File";
    }

    function detectFileType(filename, content) {
        // Detect by file extension
        const lower = filename.toLowerCase();
        if (lower.includes(".pdf")) return "pdf.txt";
        if (lower.includes(".json")) return "json";
        if (lower.includes(".xml")) return "xml";
        if (lower.includes(".md")) return "md";
        if (lower.includes(".csv")) return "csv";
        if (lower.includes(".xlsx") || lower.includes(".xls")) return "xlsx.txt";
        if (lower.includes(".doc")) return "doc.txt";
        if (lower.includes(".eml")) return "eml.txt";
        // Detect by content
        if (content.includes("{") && content.includes("}") && content.includes('"')) return "json";
        if (content.includes("<") && content.includes(">")) return "xml";
        if (content.includes("##") || content.includes("**")) return "md";
        if (content.includes(",") && content.split("\n").length > 1) return "csv";
        return "txt";
    }

    function extractContentFromModal(modal) {
        for (const selector of CONFIG.contentSelectors) {
            const el = modal.querySelector(selector);
            if (el && el.textContent.trim().length >= CONFIG.minContentLength) {
                return el.textContent.trim();
            }
        }
        // Fallback heuristic: filter out UI text
        const lines = modal.textContent
            .split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 3)
            .filter(l => !/^(Close|Download|Export|PDF|TEXT|Select|Cancel|OK|\d+\s*lines?|View|Edit)$/i.test(l))
            .filter(l => !l.includes("claude.ai"))
            .filter(l => l.length < 200);
        return lines.join("\n").trim();
    }

    /*** FILE ELEMENT DISCOVERY ***/
    function findFileElements() {
        // Search file-like elements inside the likely project/knowledge panel, fallback is whole document
        const panel = document.querySelector('[class*="project"], [class*="knowledge"]') || document;
        const foundEls = [];
        for (const sel of CONFIG.fileElementSelectors) {
            const found = panel.querySelectorAll(sel);
            for (const el of found) {
                const text = el.textContent.trim();
                if (
                    text.includes("lines") ||
                    /\.(pdf|txt|md|json|xml|csv|doc|docx|xlsx|eml)/i.test(text) ||
                    (text.length > 10 &&
                        text.length < 200 &&
                        !text.includes("claude.ai") &&
                        !/^(Export|Download|Close|Cancel|OK|Edit|View|Settings)$/i.test(text)
                    )
                ) {
                    foundEls.push(el);
                }
            }
        }
        return foundEls;
    }

    /*** EXTRACTION & EXPORT PIPELINE ***/
    async function extractProjectFiles() {
        const files = [];
        const fileElements = findFileElements();
        logStep(`Found ${fileElements.length} clickable candidates`);
        for (let i = 0; i < fileElements.length; i++) {
            const element = fileElements[i];
            try {
                const rawFilename = extractFileName(element);
                element.scrollIntoView();
                await sleep(500);
                element.click();
                const modal = await waitForModal();
                if (!modal) continue;
                const content = extractContentFromModal(modal);
                if (content.length < CONFIG.minContentLength) {
                    await closeModal();
                    continue;
                }
                const fileType = detectFileType(rawFilename, content);
                const cleanFilename = rawFilename
                    .replace(/[^a-zA-Z0-9\s\-_.]/g, "_")
                    .replace(/\s+/g, "_")
                    .replace(/_+/g, "_")
                    .trim();
                const finalFilename = `${cleanFilename}.${fileType}`;
                files.push({
                    filename: finalFilename,
                    content: content,
                    originalName: rawFilename
                });
                await closeModal();
                await sleep(1000);
            } catch (err) {
                await closeModal();
                await sleep(500);
            }
        }
        return files;
    }

    async function createZIP(files, projectName) {
        try {
            if (typeof JSZip === "undefined") throw new Error("JSZip not available");
            const zip = new JSZip();
            files.forEach(file => zip.file(file.filename, file.content));
            // metadata file for provenance
            const meta = {
                exportDate: new Date().toISOString(),
                projectTitle: projectName,
                url: window.location.href,
                fileCount: files.length,
                files: files.map(f => ({
                    filename: f.filename,
                    originalName: f.originalName,
                    size: f.content.length
                }))
            };
            zip.file("_export_metadata.json", JSON.stringify(meta, null, 2));
            // Generate ZIP
            const zipBlob = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: {
                    level: 6
                }
            });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 16);
            const zipFileName = `${projectName.replace(/[^a-zA-Z0-9]/g, "_")}_export_${timestamp}.zip`;
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = zipFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error("❌ ZIP creation failed:", error);
            return false;
        }
    }

    function downloadIndividualFiles(files) {
        // Download fallback, one file every 500ms for UX/compat.
        files.forEach((file, index) => {
            setTimeout(() => {
                const blob = new Blob([file.content], {
                    type: "text/plain"
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = file.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, index * 500);
        });
    }

    /*** GET PROJECT TITLE ***/
    function getProjectTitle() {
        for (const sel of CONFIG.projectTitleSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim() && el.textContent.trim() !== "Claude") {
                return el.textContent.trim();
            }
        }
        // Fallback from URL
        const urlMatch = window.location.pathname.match(/\/([^\/]+)$/);
        return urlMatch ? urlMatch[1].replace(/[-_]/g, " ") : "Claude_Project";
    }

    /*** EXPORT PROJECT BUTTON & PIPELINE ***/
    async function exportProject() {
        const button = document.querySelector("#claude-export-btn");

        function setStatus(msg) {
            if (button) button.textContent = `🔄 ${msg}`;
        }
        try {
            setStatus("Loading ZIP library...");
            await loadJSZip();
            setStatus("Scanning for files...");
            const files = await extractProjectFiles();
            if (files.length === 0) {
                setStatus("❌ No files found");
                setTimeout(() => {
                    if (button) button.textContent = "📁 Export Project Files";
                }, 3000);
                return;
            }
            const projectName = getProjectTitle();
            setStatus(`Creating ZIP (${files.length} files)...`);
            const zipSuccess = await createZIP(files, projectName);
            if (zipSuccess) {
                setStatus(`✅ ZIP exported! (${files.length} files)`);
            } else {
                setStatus("ZIP failed - downloading individually...");
                downloadIndividualFiles(files);
            }
        } catch (err) {
            if (button) button.textContent = "❌ Export Failed";
        }
        setTimeout(() => {
            if (button) button.textContent = "📁 Export Project Files";
        }, 3000);
    }

    /*** BUTTON UI & INITIALIZATION ***/
    function addExportButton() {
        // Remove old button if present
        const existing = document.querySelector("#claude-export-btn");
        if (existing) existing.remove();

        // Create styled button
        const btn = document.createElement("button");
        btn.id = "claude-export-btn";
        btn.textContent = "📁 Export Project Files";
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            z-index: 10000;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s;
            min-width: 200px;
            text-align: center;
        `;
        btn.addEventListener("mouseenter", () => {
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.transform = "translateY(0)";
            btn.style.boxShadow = "0 4px 15px rgba(0,0,0,0.2)";
        });
        btn.addEventListener("click", exportProject);
        document.body.appendChild(btn);
    }

    function init() {
        // Add button on DOM ready
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", addExportButton);
        } else {
            addExportButton();
        }
        // Observe URL changes (SPA) to re-add button after navigation
        let currentUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== currentUrl) {
                currentUrl = location.href;
                setTimeout(addExportButton, 1000);
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // --- ENTRY POINT ---
    init();

})();