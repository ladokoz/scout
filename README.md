# Ahub Film Scout

**Ahub Film Scout** is an elegant, high-performance scouting engine designed for cinematic discovery. It performs deep, parallel sweeps across YouTube and Vimeo, synthesizing results into a unified, verified dashboard.

## Core Features

*   **Deep Scouting Resilience**: Uses a multi-layered search strategy to find "hard-to-reach" films, even when they have restricted metadata or special characters in the title.
*   **Expert Relevance Engine**: Toggle between **Strict**, **Balanced**, and **Loose** matching algorithms to fine-tune your results in real-time.
*   **Rollout Details & Playback**: Expand any film entry to see rich metadata (descriptions, uploader details) and play films directly within the dashboard using integrated YouTube/Vimeo players.
*   **The Cinematic Dashboard**: A premium, dark-mode workspace featuring 180px thumbnails, instant SVG placeholders, and smooth CSS transitions.
*   **In-App Export Library**: Save your scouting results to a persistent server-side library. Manage, download, or clear your history via a focused modal interface.
*   **Selective Export**: Cherry-pick specific films using the checkmarking system to export only the results that matter most to you.
*   **Advanced Discovery Filters**:
    *   **Min Relevance**: Instant noise reduction.
    *   **Duration Control**: Hide teasers/trailers while keeping full shorts.
    *   **Visual Logic**: Hide results without previews based on match confidence.
*   **Floating Action Logic**: Quick-access floating buttons for saving results and opening the library, keeping primary controls accessible at all times.

## Technology Stack

*   **Backend**: Python 3.9+, FastAPI (Asynchronous API), Uvicorn.
*   **Engines**: YouTube API v3, Vimeo API (Client Credentials), DuckDuckGo Deep Scouting.
*   **Logic**: `thefuzz` (Fuzzy string matching), `yt-dlp` (Metadata enrichment).
*   **Frontend**: Vanilla HTML5, CSS3 (Modern Grid/Flexbox), JavaScript (Native ES6+).

## Quick Start

### 1. Prerequisites
*   Python 3.9 or higher.
*   YouTube Data API v3 Key.
*   Vimeo API ClientID/Secret.

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/ahub-film-scout.git
cd ahub-film-scout

# Launch using the automated script
# (On Windows)
./run.bat

# (On Linux/Debian)
chmod +x run.sh
./run.sh
```

### 3. Configuration
Create a `.env` file in the root directory and add your keys:
```env
YOUTUBE_API_KEY=your_youtube_key
VIMEO_CLIENT_ID=your_vimeo_id
VIMEO_CLIENT_SECRET=your_vimeo_secret
```

## Deployment
The project is optimized for headless Debian/Ubuntu servers. For a detailed guide on Proxmox LXC and Cloudflare Tunnel integration, see [README_DEPLOY.md](README_DEPLOY.md).

## License
This project is licensed under the MIT License.

---
*Built with passion for cinematic discovery.*
