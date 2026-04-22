# Ahub Film Scout

**Ahub Film Scout** is an elegant, high-performance scouting engine designed for cinematic discovery. It performs deep, parallel sweeps across YouTube and Vimeo, synthesizing results into a unified, verified dashboard.

## Core Features

*   **Background Scout Execution**: The discovery engine runs in the background. You can close your browser tab and reopen it later; the scout will continue its work and restore your session automatically.
*   **Additive Rendering**: New results are added to the dashboard without refreshing the page or reloading existing video embeds. Watch found films while the search continues uninterrupted.
*   **Search Interruption (Stop Button)**: Full control over batch jobs. Interrupt any active search immediately to start a new one.
*   **Web-Based Auto-Updater**: Keep your system up-to-date with one click. Integrated version checking and automatic Git-based updates.
*   **Expert Relevance Engine**: Toggle between **Strict**, **Balanced**, and **Loose** matching algorithms to fine-tune your results in real-time.
*   **Rollout Details & Playback**: Expand any film entry to see rich metadata (descriptions, uploader details) and play films directly within the dashboard using integrated YouTube/Vimeo players.
*   **In-App Export Library**: Save your scouting results to a persistent server-side library. Manage, download, or clear your history via a focused modal interface.
*   **Advanced Discovery Filters**:
    *   **Min Relevance**: Instant noise reduction.
    *   **Duration Control**: Hide teasers/trailers while keeping full shorts.
    *   **Visual Logic**: Hide results without previews based on match confidence.

## Technology Stack

*   **Backend**: Python 3.9+, FastAPI (Asynchronous API), Uvicorn.
*   **Engines**: YouTube API v3, Vimeo API (Client Credentials), DuckDuckGo Deep Scouting.
*   **Logic**: `thefuzz` (Fuzzy string matching), `yt-dlp` (Metadata enrichment).
*   **Frontend**: Vanilla HTML5, CSS3 (Modern Grid/Flexbox), JavaScript (Native ES6+).

## Quick Start

### 1. Prerequisites
*   Python 3.9 or higher.
*   Git (required for the Auto-Updater).
*   YouTube Data API v3 Key.
*   Vimeo API ClientID/Secret/AccessToken.

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/ladokoz/scout.git
cd scout

# Launch using the automated script
# (On Windows)
./run.bat

# (On Linux/Debian)
chmod +x run.sh
./run.sh
```

### 3. Configuration
Create a `.env` file in the root directory. Below are the required and optional fields:

```env
# UI Credentials (for deployment security)
ADMIN_USERNAME=maros
ADMIN_PASSWORD=ahub123

# Gemini API (For future AI enhancements)
GEMINI_API_KEY=your_gemini_key

# YouTube API (Get from Google Cloud Console)
YOUTUBE_API_KEY=your_youtube_key

# Vimeo API (Get from Vimeo Developer Portal)
VIMEO_CLIENT_ID=your_vimeo_id
VIMEO_CLIENT_SECRET=your_vimeo_secret
VIMEO_ACCESS_TOKEN=your_vimeo_token

# Fallback/Legacy Vimeo Auth (Optional)
VIMEO_USERNAME=your_email
VIMEO_PASSWORD=your_password
```

## Deployment
The project is optimized for headless Debian/Ubuntu servers. For a detailed guide on Proxmox LXC and Cloudflare Tunnel integration, see [README_DEPLOY.md](README_DEPLOY.md).

## License
This project is licensed under the MIT License.

---
*Built with passion for cinematic discovery.*
