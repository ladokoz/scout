const API_BASE = "http://localhost:8001/api";

// UI Elements
const filmList = document.getElementById("film-list");
const startBtn = document.getElementById("start-btn");
const exportBtn = document.getElementById("export-btn");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const percentText = document.getElementById("percent-text");
const statusText = document.getElementById("status-text");
const resultsContainer = document.getElementById("results-container");

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
    // 1. Global Min relevance
    if (entry.match_score < filters.minRelevance) return false;

    // 2. Short Video Filter
    if (filters.hideShort) {
        const sec = parseDurationToSeconds(entry.duration);
        if (sec < filters.shortDuration && entry.match_score < filters.shortOverride) {
            return false;
        }
    }

    // 3. No Thumbnail Filter
    if (filters.hideNoThumb) {
        // Only hide if the thumbnail is truly missing, empty, or an error placeholder
        const isMissing = !entry.thumbnail || 
                         entry.thumbnail === "" || 
                         entry.thumbnail === NO_THUMB_SVG || 
                         entry.thumbnail.includes("placeholder");
                         
        if (isMissing && entry.match_score < filters.thumbOverride) {
            return false;
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
        if (Object.keys(latestResults).length > 0) renderResults(latestResults);
    });
});

[filterHideShort, filterHideNoThumb].forEach(el => {
    el.addEventListener("change", (e) => {
        if (e.target.id === "filter-hide-short") filters.hideShort = e.target.checked;
        if (e.target.id === "filter-hide-no-thumb") filters.hideNoThumb = e.target.checked;
        
        syncUIWithFilters();
        saveSettings();
        if (Object.keys(latestResults).length > 0) renderResults(latestResults);
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
    if (Object.keys(latestResults).length > 0) renderResults(latestResults);
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
        const data = await response.json();
        currentJobId = data.job_id;
        startPolling();
    } catch (err) {
        console.error(err);
        alert("Failed to start scouting.");
        startBtn.disabled = false;
        startBtn.innerHTML = "<span>🚀</span> Start Scouting Batch";
    }
});

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const resp = await fetch(`${API_BASE}/scout/status/${currentJobId}`);
            const job = await resp.json();
            
            updateUI(job);

            if (job.status === "completed") {
                clearInterval(pollInterval);
                startBtn.disabled = false;
                startBtn.innerHTML = "<span>🚀</span> Start Scouting Batch";
                exportBtn.disabled = false;
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

    if (completed > 0) {
        latestResults = job.results;
        renderResults(job.results);
    }
}

// Visual Helpers
const NO_THUMB_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='102' viewBox='0 0 180 102'%3E%3Crect width='180' height='102' fill='%231a1d24'/%3E%3Cpath d='M90 35a15 15 0 1 0 15 15 15 15 0 0 0-15-15zm0 25a10 10 0 1 1 10-10 10 10 0 0 1-10 10z' fill='%234a5568'/%3E%3Ctext x='90' y='75' font-family='sans-serif' font-size='10' fill='%234a5568' text-anchor='middle'%3ENo Preview%3C/text%3E%3C/svg%3E`;

function renderResults(results) {
    let html = `
        <table class="results-table">
            <thead>
                <tr>
                    <th>Platform</th>
                    <th>Preview</th>
                    <th>Result Title</th>
                    <th>Uploader</th>
                    <th>Length</th>
                    <th>Relevance</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    let totalShown = 0;
    let totalHidden = 0;

    for (const [query, entries] of Object.entries(results)) {
        if (!entries || entries.length === 0) continue;
        
        let queryRows = [];
        for (const entry of entries) {
            if (entry.error) continue;
            if (shouldShow(entry)) {
                queryRows.push(entry);
                totalShown++;
            } else {
                totalHidden++;
            }
        }

        if (queryRows.length === 0) continue;

        // Group Header
        html += `
            <tr class="group-header">
                <td colspan="7">
                    <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">Query: ${query}</div>
                </td>
            </tr>
        `;

        for (const entry of queryRows) {
            const scoreClass = entry.match_score > 85 ? 'match-high' : 'match-mid';
            const platformClass = entry.platform === 'YouTube' ? 'platform-youtube' : 'platform-vimeo';
            
            // Use local SVG placeholder for instant loading
            const thumbUrl = (entry.thumbnail && entry.thumbnail.startsWith('http')) ? entry.thumbnail : NO_THUMB_SVG;

            html += `
                <tr class="result-row">
                    <td><span class="platform-chip ${platformClass}">${entry.platform}</span></td>
                    <td>
                        <img src="${thumbUrl}" class="thumb-img" alt="thumb" onerror="this.src='${NO_THUMB_SVG}'">
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
                        <a href="${entry.url}" target="_blank" class="link-btn">Open Link</a>
                    </td>
                </tr>
            `;
        }
    }

    html += `</tbody></table>`;
    
    if (totalShown === 0) {
        html = `<div class="empty-state">All ${totalHidden} results are currently hidden by your filters.</div>`;
    } else if (totalHidden > 0) {
        html += `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; margin-top: 1rem;">${totalHidden} results hidden by filters.</div>`;
    }

    resultsContainer.innerHTML = html;
}

exportBtn.addEventListener("click", () => {
    const rows = [["Query", "Platform", "Result Title", "Uploader", "URL", "Score", "Duration"]];
    
    // Only export what is currently shown based on filters
    for (const [query, entries] of Object.entries(latestResults)) {
        entries.forEach(e => {
            if (!e.error && shouldShow(e)) {
                rows.push([query, e.platform, e.title, e.uploader, e.url, e.match_score, e.duration]);
            }
        });
    }
    
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ahub_scout_filtered_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Run on boot
loadSettings();
