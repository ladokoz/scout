# Changelog

All notable changes to the **Ahub Film Scout** project will be documented in this file.

## [1.2.1] - 2026-04-22

### Added
- **Background Scout Persistence**: Implemented a job-based background system that allows the scouting process to continue after the browser is closed.
- **Session Reconnection**: Frontend now uses `localStorage` to reconnect to active scouting sessions upon page refresh.
- **Search Interruption Control**: Added a "Stop" button to the UI to safely abort active batch jobs.
- **Additive Rendering Logic**: Refactored the dashboard to append new results dynamically, preventing video embeds from reloading during ongoing searches.
- **Integrated Auto-Updater**: Added a version tracking system and a web-based UI to pull updates from GitHub directly via the dashboard.

### Improved
- **Robust API Detection**: Enhanced the frontend to automatically detect the correct backend origin, even across different ports.
- **State Reconciliation**: Improved the sync logic between backend job states and frontend UI components.

## [1.2.0] - 2026-04-22

### Added
- **Rollout Menu**: Each film entry now has an expansion panel showing the full description and uploader handles.
- **Embedded Player**: Integrated YouTube and Vimeo iframe players for instant cinematic playback within the dashboard.
- **In-App CSV Library**: Persistent server-side storage for CSV exports, allowing users to save and manage their discovery history.
- **Selective Export**: Added a checkmarking system to cherry-pick specific film links for export.
- **Floating Action Buttons (FAB)**: Modern, stacked floating buttons in the bottom-right corner for "Save to Library" and "Open Library" actions.
- **Library Modal**: Transitioned the CSV management interface into a focused, modal-based popup with background blur.

### Improved
- **UI Refactor**: Cleaned up the results header by removing redundant export buttons.
- **Premium Aesthetics**: Enhanced the dashboard with glassmorphism effects, smooth animations, and custom scrollbars.
- **Metadata Enrichment**: The backend now fetches full descriptions and detailed uploader data from all discovery engines.

---

## [1.1.0] - 2026-04-21

### Added
- **Fuzzy Search Logic**: Implemented Strict, Balanced, and Loose matching algorithms.
- **Vimeo Federated Search**: Transitioned to Client Credentials authentication for more robust Vimeo discovery.
- **DuckDuckGo Deep Scouting**: Added web-based scraping to find films that are hidden from the official APIs.

### Improved
- **Deduplication**: Universal ID extraction for YouTube (v=, shorts/, etc.) and Vimeo.
- **Visual Feedback**: Added instant SVG placeholders for faster perceived loading times.

---

## [1.0.0] - 2026-04-20

### Added
- Initial release of the Ahub Film Scout.
- Batch processing engine for YouTube discovery.
- Basic CSV export functionality.
- Real-time progress tracking with a unified status dashboard.
