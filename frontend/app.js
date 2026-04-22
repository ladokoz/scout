const API_BASE = window.location.origin + "/api";

// UI Elements
const filmList = document.getElementById("film-list");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusText = document.getElementById("status-text");
const resultsContainer = document.getElementById("results-container");
const floatingSaveBtn = document.getElementById("floating-save-btn");
const openLibBtn = document.getElementById("open-lib-btn");
const closeLibBtn = document.getElementById("close-lib-btn");
const libraryModal = document.getElementById("library-modal");
const libraryContainer = document.getElementById("library-container");
const downloadAllBtn = document.getElementById("download-all-btn");
const clearLibBtn = document.getElementById("clear-lib-btn");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const percentText = document.getElementById("percent-text");

// Filter Elements
const filterMinRelevance = document.getElementById("filter-min-relevance");
const settingSearchLimit = document.getElementById("setting-search-limit");
const filterHideShort = document.getElementById("filter-hide-short");
const filterShortDuration = document.getElementById("filter-short-duration");
const filterShortOverride = document.getElementById("filter-short-override");
const filterHideNoThumb = document.getElementById("filter-hide-no-thumb");
const filterThumbOverride = document.getElementById("filter-thumb-override");
const resetFiltersBtn = document.getElementById("reset-filters-btn");

// Labels
const labelMinRelevance = document.getElementById("label-min-relevance");
const labelShortDuration = document.getElementById("label-short-duration");
const labelShortOverride = document.getElementById("label-short-override");
const labelThumbOverride = document.getElementById("label-thumb-override");

const settingMatchAlgo = document.getElementById("setting-match-algo");

// App State
let currentJobId = null;
let pollInterval = null;
let latestResults = {}; // Store raw results for reactive filtering
let filters = {
    minRelevance: 20,
    searchLimit: 15,
    matchAlgo: "loose",
    hideShort: false,
    shortDuration: 60,
    shortOverride: 20,
    hideNoThumb: false,
    thumbOverride: 20
};
let selectedUrls = new Set();
let renderedQueries = new Set(); // For additive rendering

const appVersionSpan = document.getElementById("app-version");
const checkUpdateBtn = document.getElementById("check-update-btn");
const updateStatus = document.getElementById("update-status");

let localVersion = "1.0.0";
const REMOTE_VERSION_URL = "https://raw.githubusercontent.com/ladokoz/scout/main/VERSION";

// --- Initialization & LocalStorage ---

function loadSettings() {
    const saved = localStorage.getItem("scout_filters");
    if (saved) {
        try {
            filters = { ...filters, ...JSON.parse(saved) };
            syncUIWithFilters();
        } catch (e) { console.error("Failed to load settings", e); }
    }
}

function saveSettings() {
    localStorage.setItem("scout_filters", JSON.stringify(filters));
}

function syncUIWithFilters() {
    filterMinRelevance.value = filters.minRelevance;
    labelMinRelevance.innerText = `${filters.minRelevance}%`;
    
    settingSearchLimit.value = filters.searchLimit;
    settingMatchAlgo.value = filters.matchAlgo;
    
    filterHideShort.checked = filters.hideShort;
    filterShortDuration.value = filters.shortDuration;
    labelShortDuration.innerText = `${filters.shortDuration}s`;
    filterShortOverride.value = filters.shortOverride;
    labelShortOverride.innerText = `${filters.shortOverride}%`;
    
    filterHideNoThumb.checked = filters.hideNoThumb;
    filterThumbOverride.value = filters.thumbOverride;
    labelThumbOverride.innerText = `${filters.thumbOverride}%`;

    // Toggle control availability
    document.getElementById("short-video-controls").style.opacity = filters.hideShort ? "1" : "0.5";
    document.getElementById("short-video-controls").style.pointerEvents = filters.hideShort ? "auto" : "none";
    document.getElementById("no-thumb-controls").style.opacity = filters.hideNoThumb ? "1" : "0.5";
    document.getElementById("no-thumb-controls").style.pointerEvents = filters.hideNoThumb ? "auto" : "none";
}

// --- Filtering Logic ---

function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

function shouldShow(entry) {
    const score = parseFloat(entry.match_score) || 0;
    const minRel = parseFloat(filters.minRelevance) || 0;

    // 1. Global Min relevance
    if (score < minRel) return false;

    // 2. Short Video Filter
    if (filters.hideShort) {
        const sec = parseDurationToSeconds(entry.duration);
        const durationThreshold = parseFloat(filters.shortDuration) || 0;
        const scoreOverride = parseFloat(filters.shortOverride) || 0;

        // Logic: Hide if (is short) AND (score <= override)
        // If override is 100, we hide all short videos regardless of score
        if (sec < durationThreshold) {
            if (scoreOverride >= 100 || score <= scoreOverride) {
                return false;
            }
        }
    }

    // 3. No Thumbnail Filter
    if (filters.hideNoThumb) {
        const thumb = entry.thumbnail;
        const isMissing = !thumb || 
                          thumb === "" || 
                          thumb === "None" ||
                          thumb === "null" ||
                          thumb === NO_THUMB_SVG || 
                          thumb.includes("placeholder");
                          
        const scoreOverride = parseFloat(filters.thumbOverride) || 0;
        if (isMissing) {
            if (scoreOverride >= 100 || score <= scoreOverride) {
                return false;
            }
        }
    }

    return true;
}

// --- Event Listeners ---

[filterMinRelevance, filterShortDuration, filterShortOverride, filterThumbOverride].forEach(el => {
    el.addEventListener("input", (e) => {
        const id = e.target.id;
        const val = parseInt(e.target.value);
        
        if (id === "filter-min-relevance") {
            filters.minRelevance = val;
            labelMinRelevance.innerText = `${val}%`;
        } else if (id === "filter-short-duration") {
            filters.shortDuration = val;
            labelShortDuration.innerText = `${val}s`;
        } else if (id === "filter-short-override") {
            filters.shortOverride = val;
            labelShortOverride.innerText = `${val}%`;
        } else if (id === "filter-thumb-override") {
            filters.thumbOverride = val;
            labelThumbOverride.innerText = `${val}%`;
        }
        
        saveSettings();
        if (Object.keys(latestResults).length > 0) renderResults(latestResults, true);
    });
});

[filterHideShort, filterHideNoThumb].forEach(el => {
    el.addEventListener("change", (e) => {
        if (e.target.id === "filter-hide-short") filters.hideShort = e.target.checked;
        if (e.target.id === "filter-hide-no-thumb") filters.hideNoThumb = e.target.checked;
        
        syncUIWithFilters();
        saveSettings();
        if (Object.keys(latestResults).length > 0) renderResults(latestResults, true);
    });
});

settingSearchLimit.addEventListener("change", (e) => {
    filters.searchLimit = parseInt(e.target.value);
    saveSettings();
});

settingMatchAlgo.addEventListener("change", (e) => {
    filters.matchAlgo = e.target.value;
    saveSettings();
});

resetFiltersBtn.addEventListener("click", () => {
    filters = {
        minRelevance: 20,
        searchLimit: 15,
        matchAlgo: "loose",
        hideShort: false,
        shortDuration: 60,
        shortOverride: 20,
        hideNoThumb: false,
        thumbOverride: 20
    };
    syncUIWithFilters();
    saveSettings();
    if (Object.keys(latestResults).length > 0) renderResults(latestResults, true);
});

// --- core functionality ---

startBtn.addEventListener("click", async () => {
    const text = filmList.value.trim();
    if (!text) return alert("Please enter at least one search query.");

    const queries = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);

    startBtn.disabled = true;
    startBtn.innerHTML = "<span>⏳</span> Scouting...";
    progressContainer.style.display = "block";
    resultsContainer.innerHTML = '<div class="empty-state">Synthesizing deep discovery sweep...</div>';
    latestResults = {};
    selectedUrls.clear();
    renderedQueries.clear();
    floatingSaveBtn.disabled = true;
    resultsContainer.innerHTML = ''; // Clear everything for new batch

    try {
        const response = await fetch(`${API_BASE}/scout/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                queries,
                search_limit: filters.searchLimit,
                match_algo: filters.matchAlgo
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
            throw new Error(errorData.detail || `Server returned ${response.status}`);
        }

        const data = await response.json();
        if (data.job_id) {
            currentJobId = data.job_id;
            console.log("Started job:", currentJobId);
            localStorage.setItem("scout_current_job_id", currentJobId); // Persist Job ID
            document.getElementById("job-id-display").innerText = `Job ID: ${currentJobId}`;
            
            startBtn.style.display = "none";
            stopBtn.style.display = "inline-flex";
            stopBtn.innerHTML = "<span>🛑</span> Stop";
            stopBtn.disabled = false;
            
            startPolling();
        } else {
            throw new Error("No job ID received from server.");
        }
    } catch (err) {
        console.error(err);
        alert(`Failed to start scouting: ${err.message}`);
        startBtn.disabled = false;
        startBtn.innerHTML = "<span>🚀</span> Start Scouting Batch";
    }
});

function startPolling() {
    if (!currentJobId) return;
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const resp = await fetch(`${API_BASE}/scout/status/${currentJobId}`);
            if (!resp.ok) {
                if (resp.status === 401) {
                    alert("Session expired or unauthorized. Please refresh the page.");
                    clearInterval(pollInterval);
                    return;
                }
                throw new Error(`Status check failed: ${resp.status}`);
            }
            const job = await resp.json();
            
            updateUI(job);

            if (job.status === "completed" || job.status === "stopped") {
                clearInterval(pollInterval);
                pollInterval = null;
                startBtn.style.display = "inline-flex";
                startBtn.disabled = false;
                startBtn.innerHTML = "<span>🚀</span> Start Scouting Batch";
                stopBtn.style.display = "none";
                floatingSaveBtn.disabled = false;
                
                if (job.status === "stopped") {
                    localStorage.removeItem("scout_current_job_id");
                }
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }, 2000);
}

function updateUI(job) {
    statusText.innerText = job.progress || "Scouting...";
    
    const total = job.total || 1;
    const completed = Object.keys(job.results).length;
    const percent = Math.round((completed / total) * 100);
    progressFill.style.width = `${percent}%`;
    percentText.innerText = `${percent}%`;

    if (completed >= 0) { // Call even if 0 to clear loading states
        latestResults = job.results || {};
        renderResults(latestResults, false); // Additive during polling
    }
}

// Visual Helpers
const NO_THUMB_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22180%22 height=%22102%22 viewBox=%220 0 180 102%22%3E%3Crect width=%22180%22 height=%22102%22 fill=%22%231a1d24%22/%3E%3Cpath d=%22M90 35a15 15 0 1 0 15 15 15 15 0 0 0-15-15zm0 25a10 10 0 1 1 10-10 10 10 0 0 1-10 10z%22 fill=%22%234a5568%22/%3E%3Ctext x=%2290%22 y=%2275%22 font-family=%22sans-serif%22 font-size=%2210%22 fill=%22%234a5568%22 text-anchor=%22middle%22%3ENo Preview%3C/text%3E%3C/svg%3E";

function renderResults(results, isFullReset = false) {
    if (isFullReset) {
        resultsContainer.innerHTML = '';
        renderedQueries.clear();
    }

    // Ensure table structure exists
    let table = resultsContainer.querySelector('.results-table');
    let tbody;
    if (!table) {
        resultsContainer.innerHTML = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" id="select-all-checkbox" onclick="toggleSelectAll(event)"></th>
                        <th>Platform</th>
                        <th>Preview</th>
                        <th>Result Title</th>
                        <th>Uploader</th>
                        <th>Length</th>
                        <th>Relevance</th>
                        <th>Action</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="results-body"></tbody>
            </table>
            <div id="results-summary" style="margin-top: 1rem;"></div>
        `;
        table = resultsContainer.querySelector('.results-table');
        tbody = resultsContainer.querySelector('#results-body');
    } else {
        tbody = table.querySelector('#results-body');
    }

    let totalShown = 0;
    let totalHidden = 0;
    let anyNewQueries = false;

    // First, calculate totals for the summary (needs full results pass)
    for (const [query, entries] of Object.entries(results)) {
        if (!entries) continue;
        for (const entry of entries) {
            if (entry.error) continue;
            if (shouldShow(entry)) totalShown++;
            else totalHidden++;
        }
    }

    // Additive render: only add queries we haven't seen yet
    for (const [query, entries] of Object.entries(results)) {
        if (!entries || entries.length === 0) continue;
        if (renderedQueries.has(query)) continue; // Skip already rendered in additive mode

        let queryRows = [];
        for (const entry of entries) {
            if (entry.error) continue;
            if (shouldShow(entry)) {
                queryRows.push(entry);
            }
        }

        if (queryRows.length === 0) continue;
        
        anyNewQueries = true;
        renderedQueries.add(query);

        // Group Header
        let groupHtml = `
            <tr class="group-header">
                <td colspan="9">
                    <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">Query: ${query}</div>
                </td>
            </tr>
        `;

        for (const entry of queryRows) {
            const scoreClass = entry.match_score > 85 ? 'match-high' : 'match-mid';
            const platformClass = entry.platform === 'YouTube' ? 'platform-youtube' : 'platform-vimeo';
            const safeId = btoa(entry.url).replace(/[^a-z0-9]/gi, '');
            const thumbUrl = (entry.thumbnail && entry.thumbnail.startsWith('http')) ? entry.thumbnail : NO_THUMB_SVG;

            groupHtml += `
                <tr class="result-row" id="row-${safeId}" onclick="toggleDetails('${safeId}')" style="cursor: pointer;">
                    <td onclick="event.stopPropagation()">
                        <input type="checkbox" class="entry-checkbox" data-url="${entry.url}" ${selectedUrls.has(entry.url) ? 'checked' : ''} onchange="toggleSelect('${entry.url}')">
                    </td>
                    <td><span class="platform-chip ${platformClass}">${entry.platform}</span></td>
                    <td>
                        <img src="${thumbUrl}" class="thumb-img" alt="thumb" onerror="if(this.src != '${NO_THUMB_SVG}') this.src='${NO_THUMB_SVG}';">
                    </td>
                    <td class="source-cell">
                        <div style="font-weight: 600;">${entry.title}</div>
                    </td>
                    <td>${entry.uploader || 'Unknown'}</td>
                    <td style="font-family: 'Courier New', monospace; color: var(--text-dim);">${entry.duration || '0:00'}</td>
                    <td>
                        <div class="match-score ${scoreClass}">${entry.match_score}%</div>
                    </td>
                    <td>
                        <a href="${entry.url}" target="_blank" class="link-btn" onclick="event.stopPropagation()">Open Link</a>
                    </td>
                    <td>
                        <div class="expand-toggle">▼</div>
                    </td>
                </tr>
                <tr id="details-${safeId}" class="detail-row">
                    <td colspan="9">
                        <div class="detail-content">
                            <div class="player-wrapper">
                                ${getEmbedHtml(entry)}
                            </div>
                            <div class="meta-details">
                                <h3 style="margin-bottom: 0.5rem; color: var(--text-main);">${entry.title}</h3>
                                <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                                    <span style="font-size: 0.8rem; color: var(--secondary); font-weight: 600;">@${entry.uploader}</span>
                                    <span style="font-size: 0.8rem; color: var(--text-dim);">${entry.platform} • ${entry.duration}</span>
                                </div>
                                <div class="description-text">${entry.description || 'No description available.'}</div>
                                <div style="margin-top: auto; display: flex; gap: 1rem;">
                                    <a href="${entry.url}" target="_blank" class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="event.stopPropagation()">
                                        🔗 Visit Original Page
                                    </a>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }
        tbody.insertAdjacentHTML('beforeend', groupHtml);
    }

    // Update Summary/Empty State
    const summaryDiv = resultsContainer.querySelector('#results-summary');
    if (totalShown === 0) {
        table.style.display = 'none';
        if (currentJobId && startBtn.style.display === "none") {
             summaryDiv.innerHTML = `<div class="empty-state">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                Scouting for films... No links found yet.
             </div>`;
        } else {
            summaryDiv.innerHTML = `<div class="empty-state">All ${totalHidden} results are currently hidden by your filters.</div>`;
        }
    } else {
        table.style.display = 'table';
        summaryDiv.innerHTML = totalHidden > 0 ? 
            `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; margin-top: 1rem;">${totalHidden} results hidden by filters.</div>` : '';
    }
}

function toggleDetails(id) {
    const detailRow = document.getElementById(`details-${id}`);
    const mainRow = document.getElementById(`row-${id}`);
    
    if (detailRow.classList.contains('expanded')) {
        detailRow.classList.remove('expanded');
        mainRow.classList.remove('active');
    } else {
        // Close other expanded rows if desired (optional)
        // document.querySelectorAll('.detail-row.expanded').forEach(el => el.classList.remove('expanded'));
        // document.querySelectorAll('.result-row.active').forEach(el => el.classList.remove('active'));

        detailRow.classList.add('expanded');
        mainRow.classList.add('active');
    }
}

function getEmbedHtml(entry) {
    let url = entry.url;
    if (entry.platform.includes('YouTube')) {
        const ytMatch = url.match(/(?:v=|\/|embed\/|v\/|shorts\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
            return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        }
    } else if (entry.platform.includes('Vimeo')) {
        const vMatch = url.match(/\/(\d+)(?:\/|\?|$)/);
        if (vMatch) {
            return `<iframe src="https://player.vimeo.com/video/${vMatch[1]}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
        }
    }
    return `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim);">Embedding not supported for this link.</div>`;
}

function toggleSelect(url) {
    if (selectedUrls.has(url)) {
        selectedUrls.delete(url);
    } else {
        selectedUrls.add(url);
    }
}

function toggleSelectAll(event) {
    event.stopPropagation();
    const checked = event.target.checked;
    const checkboxes = document.querySelectorAll('.entry-checkbox');
    
    checkboxes.forEach(cb => {
        cb.checked = checked;
        const url = cb.getAttribute('data-url');
        if (checked) selectedUrls.add(url);
        else selectedUrls.delete(url);
    });
}

// --- Library Management ---

async function fetchExports() {
    try {
        const resp = await fetch(`${API_BASE}/exports`);
        const exports = await resp.json();
        renderLibrary(exports);
    } catch (err) {
        console.error("Failed to fetch exports", err);
    }
}

function renderLibrary(exports) {
    if (!exports || exports.length === 0) {
        libraryContainer.innerHTML = '<div class="empty-state" style="padding: 2rem;">Library is empty.</div>';
        return;
    }

    let html = `
        <table class="results-table" style="margin-top: 0;">
            <thead>
                <tr>
                    <th>Filename</th>
                    <th>Saved Date</th>
                    <th>Size</th>
                    <th style="text-align: right;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    exports.forEach(exp => {
        const date = new Date(exp.created * 1000).toLocaleString();
        const size = (exp.size / 1024).toFixed(1) + " KB";
        html += `
            <tr class="result-row">
                <td style="font-weight: 600;">${exp.name}</td>
                <td style="color: var(--text-dim); font-size: 0.85rem;">${date}</td>
                <td style="color: var(--text-dim); font-size: 0.85rem;">${size}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button onclick="downloadSavedExport('${exp.name}')" class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: var(--border);">
                            📥
                        </button>
                        <button onclick="deleteSavedExport('${exp.name}')" class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    libraryContainer.innerHTML = html;
}

floatingSaveBtn.addEventListener("click", async () => {
    const csvData = generateCsvContent();
    if (!csvData) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `scout_export_${timestamp}.csv`;

    floatingSaveBtn.disabled = true;
    floatingSaveBtn.innerText = "⏳";

    try {
        const resp = await fetch(`${API_BASE}/exports/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, csv_data: csvData })
        });

        if (resp.ok) {
            fetchExports();
            alert(`Saved to library: ${filename}`);
        } else {
            alert("Failed to save to library.");
        }
    } catch (err) {
        console.error(err);
        alert("Error saving to library.");
    } finally {
        floatingSaveBtn.disabled = false;
        floatingSaveBtn.innerText = "💾";
    }
});

openLibBtn.addEventListener("click", () => {
    libraryModal.classList.add("active");
    fetchExports();
});

closeLibBtn.addEventListener("click", () => {
    libraryModal.classList.remove("active");
});

// Close modal when clicking outside
window.addEventListener("click", (e) => {
    if (e.target === libraryModal) {
        libraryModal.classList.remove("active");
    }
});

function generateCsvContent() {
    const rows = [["Query", "Platform", "Result Title", "Uploader", "URL", "Score", "Duration"]];
    const useSelection = selectedUrls.size > 0;
    
    let count = 0;
    for (const [query, entries] of Object.entries(latestResults)) {
        entries.forEach(e => {
            if (e.error) return;
            const isSelected = selectedUrls.has(e.url);
            const isVisible = shouldShow(e);
            
            if (useSelection) {
                if (isSelected) {
                    rows.push([query, e.platform, e.title, e.uploader, e.url, e.match_score, e.duration]);
                    count++;
                }
            } else if (isVisible) {
                rows.push([query, e.platform, e.title, e.uploader, e.url, e.match_score, e.duration]);
                count++;
            }
        });
    }
    
    if (count === 0) {
        alert("No results to export.");
        return null;
    }

    return rows.map(e => e.join(",")).join("\n");
}

async function downloadSavedExport(filename) {
    window.open(`${API_BASE}/exports/download/${filename}`, '_blank');
}

async function deleteSavedExport(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
        const resp = await fetch(`${API_BASE}/exports/${filename}`, { method: "DELETE" });
        if (resp.ok) fetchExports();
    } catch (err) {
        console.error(err);
    }
}

clearLibBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete ALL saved exports?")) return;
    try {
        const resp = await fetch(`${API_BASE}/exports-all`, { method: "DELETE" });
        if (resp.ok) fetchExports();
    } catch (err) {
        console.error(err);
    }
});

downloadAllBtn.addEventListener("click", async () => {
    const resp = await fetch(`${API_BASE}/exports`);
    const exports = await resp.json();
    if (exports.length === 0) return alert("Library is empty.");
    
    // Batch download (browser might block popups, so we do it with delays or just inform)
    for (let i = 0; i < exports.length; i++) {
        setTimeout(() => {
            downloadSavedExport(exports[i].name);
        }, i * 500);
    }
});

stopBtn.addEventListener("click", async () => {
    if (!currentJobId) return;
    if (!confirm("Stop current search and discard remaining queries?")) return;

    try {
        stopBtn.disabled = true;
        stopBtn.innerText = "Stopping...";
        const resp = await fetch(`${API_BASE}/scout/stop/${currentJobId}`, { method: "POST" });
        if (resp.ok) {
            console.log("Job stopped successfully.");
            localStorage.removeItem("scout_current_job_id");
        }
    } catch (err) {
        console.error("Failed to stop job:", err);
    } finally {
        stopBtn.disabled = false;
        stopBtn.innerHTML = "<span>🛑</span> Stop";
    }
});

async function reconnectToJob() {
    const savedJobId = localStorage.getItem("scout_current_job_id");
    if (!savedJobId || savedJobId === "null" || savedJobId === "undefined") {
        console.log("No valid saved job ID found.");
        return;
    }

    console.log("Attempting to reconnect to job:", savedJobId);
    statusText.innerText = "Attempting to resume session...";
    resultsContainer.innerHTML = `<div class="empty-state">🔄 Reconnecting to scout session...<br><small style="color:var(--text-dim)">${savedJobId}</small></div>`;
    
    const idDisplay = document.getElementById("job-id-display");
    if (idDisplay) idDisplay.innerText = `ID: ${savedJobId}`;

    try {
        const resp = await fetch(`${API_BASE}/scout/status/${savedJobId}`);
        if (resp.ok) {
            const job = await resp.json();
            console.log("Reconnection successful:", job.status);
            currentJobId = savedJobId;
            
            // Restore queries to textarea
            if (job.queries && job.queries.length > 0) {
                filmList.value = job.queries.join("\n");
            }

            // Sync UI with current job state
            updateUI(job);

            if (job.status === "processing" || job.status === "pending") {
                startBtn.style.display = "none";
                stopBtn.style.display = "inline-flex";
                startBtn.disabled = true;
                startBtn.innerHTML = "<span>⏳</span> Scouting in progress...";
                progressContainer.style.display = "block";
                startPolling();
            } else if (job.status === "completed") {
                startBtn.style.display = "inline-flex";
                startBtn.disabled = false;
                startBtn.innerHTML = "<span>🚀</span> Start Scouting Batch";
                stopBtn.style.display = "none";
                floatingSaveBtn.disabled = false;
            }
        } else {
            console.warn("Session not found on server, clearing.");
            resultsContainer.innerHTML = `<div class="empty-state">Session ${savedJobId} not found.<br>The server might have been restarted.</div>`;
            localStorage.removeItem("scout_current_job_id");
        }
    } catch (e) {
        console.error("Reconnection failed:", e);
        statusText.innerText = "Offline - server unreachable";
        resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--error);">
            Failed to connect to server.<br>
            <small>If the server is running on a different port (like 8001), ensure you are visiting that exact URL.</small>
        </div>`;
    }
}

async function fetchVersion() {
    try {
        const resp = await fetch(`${API_BASE}/version`);
        const data = await resp.json();
        localVersion = data.version;
        if (appVersionSpan) appVersionSpan.innerText = localVersion;
    } catch (e) {
        console.error("Failed to fetch version:", e);
    }
}

async function checkForUpdates() {
    if (!updateStatus) return;
    updateStatus.style.display = "block";
    updateStatus.innerText = "Checking for updates...";
    updateStatus.style.color = "var(--text-dim)";

    try {
        // In a real scenario, you'd fetch from GitHub. 
        // For now, we simulate or try the fetch.
        const resp = await fetch(REMOTE_VERSION_URL);
        if (!resp.ok) throw new Error("Could not reach update server.");
        
        const remoteVersion = (await resp.text()).trim();
        console.log(`Local: ${localVersion}, Remote: ${remoteVersion}`);

        if (remoteVersion !== localVersion) {
            updateStatus.innerHTML = `
                <span style="color: var(--primary);">Update Available: ${remoteVersion}</span><br>
                <button id="apply-update-btn" class="btn" style="margin-top:0.5rem; padding: 0.3rem 0.6rem; font-size:0.6rem; background: var(--primary);">
                    Apply Update Now
                </button>
            `;
            document.getElementById("apply-update-btn").addEventListener("click", applyUpdate);
        } else {
            updateStatus.innerText = "You are on the latest version.";
            updateStatus.style.color = "#10b981";
        }
    } catch (e) {
        updateStatus.innerText = "Check failed. Ensure Git repo is set up.";
        updateStatus.style.color = "var(--error)";
    }
}

async function applyUpdate() {
    const btn = document.getElementById("apply-update-btn");
    btn.disabled = true;
    btn.innerText = "Updating...";
    updateStatus.innerText = "Pulling latest changes from GitHub...";

    try {
        const resp = await fetch(`${API_BASE}/update`, { method: "POST" });
        const data = await resp.json();

        if (data.status === "success") {
            updateStatus.innerText = "Update successful! Reloading...";
            updateStatus.style.color = "#10b981";
            setTimeout(() => window.location.reload(), 2000);
        } else {
            throw new Error(data.message || "Git pull failed.");
        }
    } catch (e) {
        updateStatus.innerText = `Update failed: ${e.message}`;
        updateStatus.style.color = "var(--error)";
        btn.disabled = false;
        btn.innerText = "Retry Update";
    }
}

checkUpdateBtn.addEventListener("click", checkForUpdates);

// Run on boot
loadSettings();
fetchExports();
reconnectToJob();
fetchVersion();
