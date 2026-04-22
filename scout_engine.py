import asyncio
import os
import time
import logging
import json
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from thefuzz import fuzz
from dotenv import load_dotenv
import aiohttp
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import yt_dlp
import vimeo
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS


# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ScoutEngine")

@dataclass
class ScoutResult:
    platform: str
    title: str
    url: str
    thumbnail: str
    uploader: str
    duration: str
    match_score: int
    description: str = ""

class ScoutEngine:
    def __init__(self):
        self.yt_api_key = os.getenv("YOUTUBE_API_KEY")
        self.vimeo_token = os.getenv("VIMEO_ACCESS_TOKEN")
        self.quota_exceeded = False
        
        # Initialize Vimeo Client
        if self.vimeo_token:
            self.vimeo_client = vimeo.VimeoClient(token=self.vimeo_token)
        else:
            self.vimeo_client = None

    def format_duration_sec(self, seconds: Any) -> str:
        """Convert seconds to MM:SS, ensuring integer format."""
        try:
            total_sec = int(float(seconds))
            if total_sec <= 0: return "0:00"
            m, s = divmod(total_sec, 60)
            h, m = divmod(m, 60)
            if h > 0:
                return f"{int(h)}:{int(m):02d}:{int(s):02d}"
            return f"{int(m)}:{int(s):02d}"
        except:
            return "0:00"

    def parse_yt_duration(self, duration_str: str) -> str:
        """Parse YouTube's ISO 8601 duration (e.g., PT4M13S) to clean MM:SS."""
        match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
        if not match: return "0:00"
        h, m, s = match.groups()
        h = int(h) if h else 0
        m = int(m) if m else 0
        s = int(s) if s else 0
        if h > 0:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"

    async def scout_query(self, query: str, search_limit: int = 15, match_algo: str = "balanced") -> List[ScoutResult]:
        """Direct search aggregator for a raw query string."""
        results = []
        try:
            # Run tasks and swallow individual errors to ensure partial results work
            yt_res, vimeo_res, web_res = await asyncio.gather(
                self.search_youtube(query),
                self.search_vimeo(query),
                self.search_web(query, search_limit=search_limit),
                return_exceptions=True
            )
            
            # Handle results (filtering out exceptions)
            for res in [yt_res, vimeo_res, web_res]:
                if isinstance(res, list):
                    results.extend(res)
                elif isinstance(res, Exception):
                    logger.error(f"Search engine component failed: {res}")

        except Exception as e:
            logger.error(f"Global scout failed for '{query}': {e}")
            return []

        # Deduplication and Scoring
        unique_results = []
        seen_ids = set()
        
        # Select fuzzy algorithm
        algo_funcs = {
            "strict": fuzz.ratio,
            "balanced": fuzz.token_sort_ratio,
            "loose": fuzz.token_set_ratio
        }
        fuzz_func = algo_funcs.get(match_algo, fuzz.token_sort_ratio)

        for r in results:
            # Skip Teasers and Trailers as requested
            title_lower = r.title.lower()
            if "teaser" in title_lower or "trailer" in title_lower:
                logger.debug(f"Filtering out promo/teaser: {r.title}")
                continue

            url = r.url.lower()
            norm_id = None
            
            # Universal YouTube ID Extraction (handles m. youtube. music. youtu.be, etc.)
            yt_match = re.search(r'(?:v=|\/|embed\/|v\/|shorts\/)([a-zA-Z0-9_-]{11})', r.url)
            if yt_match:
                norm_id = f"yt:{yt_match.group(1)}"
            
            # Universal Vimeo ID Extraction (handles vimeo.com, ondemand, etc.)
            elif "vimeo.com" in url:
                v_match = re.search(r'\/(\d+)(?:\/|\?|$)', r.url)
                if v_match:
                    norm_id = f"vi:{v_match.group(1)}"
                elif "/ondemand/" in r.url or "/ondemand/" in url:
                    # For ondemand, if no numeric ID, use the slug
                    slug_match = re.search(r'\/ondemand\/([^\/\?]+)', r.url)
                    if slug_match: norm_id = f"vi:od:{slug_match.group(1)}"
            
            # Fallback to sanitized URL
            if not norm_id:
                norm_id = url.split('?')[0].replace('https://', '').replace('http://', '').replace('www.', '').replace('m.', '').rstrip('/')
            
            if norm_id not in seen_ids:
                seen_ids.add(norm_id)
                # Dynamic Relevance Scoring
                r.match_score = fuzz_func(query.lower(), r.title.lower())
                unique_results.append(r)
            else:
                logger.debug(f"Deduplicated result: {r.url} (ID: {norm_id})")
            
        unique_results.sort(key=lambda x: x.match_score, reverse=True)
        return unique_results

    async def search_youtube(self, query: str) -> List[ScoutResult]:
        """Attempt official API, fallback to yt-dlp scraper."""
        if self.quota_exceeded or not self.yt_api_key:
            return await self.search_youtube_scraper(query)

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._sync_youtube_api_search, query)
        except HttpError as e:
            if e.resp.status == 403 and "quotaExceeded" in str(e):
                logger.warning("YouTube Quota Exceeded. Switching to yt-dlp Scraper.")
                self.quota_exceeded = True
                return await self.search_youtube_scraper(query)
            return []
        except Exception as e:
            logger.error(f"YouTube API failed: {e}")
            return await self.search_youtube_scraper(query)

    def _sync_youtube_api_search(self, query: str) -> List[ScoutResult]:
        youtube = build('youtube', 'v3', developerKey=self.yt_api_key, cache_discovery=False)
        request = youtube.search().list(q=query, part='snippet', type='video', maxResults=5)
        response = request.execute()
        
        video_ids = [item['id']['videoId'] for item in response.get('items', [])]
        if not video_ids: return []

        details_req = youtube.videos().list(id=','.join(video_ids), part='contentDetails,snippet')
        details_resp = details_req.execute()
        
        duration_map = {}
        for item in details_resp.get('items', []):
            duration_map[item['id']] = self.parse_yt_duration(item['contentDetails']['duration'])

        results = []
        for item in response.get('items', []):
            vid_id = item['id']['videoId']
            snippet = item['snippet']
            results.append(ScoutResult(
                platform="YouTube",
                title=snippet['title'],
                url=f"https://www.youtube.com/watch?v={vid_id}",
                thumbnail=snippet['thumbnails']['default']['url'],
                uploader=snippet['channelTitle'],
                duration=duration_map.get(vid_id, "0:00"),
                match_score=0,
                description=snippet.get('description', '')
            ))
        return results

    async def search_vimeo(self, query: str) -> List[ScoutResult]:
        """Vimeo search using official Federated Search API."""
        if not self.vimeo_client:
            return []
            
        logger.info(f"Running Vimeo Federated Search (/search) for: {query}")
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, self._sync_vimeo_federated_search, query)
            return results
        except Exception as e:
            logger.error(f"Vimeo Federated Search failed: {e}")
            return []

    def _sync_vimeo_federated_search(self, query: str) -> List[ScoutResult]:
        # Using the Federated Search endpoint
        params = {
            'query': query,
            'type': 'video',
            'per_page': 5
        }
        
        response = self.vimeo_client.get('/search', params=params)
        
        # DEEP DEBUG LOGGING
        logger.info(f"VIMEO STATUS: {response.status_code}")
        try:
            raw_data = response.json()
            # Log a pretty version for easier reading in terminal
            logger.info("--- START RAW VIMEO DEBUG DATA ---")
            logger.info(json.dumps(raw_data, indent=2)[:2000]) # First 2k chars to avoid flooding
            logger.info("--- END RAW VIMEO DEBUG DATA ---")
        except:
            logger.error(f"Failed to parse Vimeo JSON. Text: {response.text[:500]}")
            return []

        if response.status_code != 200:
            return []
            
        scout_results = []
        # Federated search results are usually under 'data' but the structure might 
        # differ from /videos. Standard /search returns a list of objects under 'data'.
        for item in raw_data.get('data', []):
            # In Federated search, the object often contains the entity (video)
            video = item.get('video') if 'video' in item else item
            
            # Extract basic info
            title = video.get('name', 'Unknown Title')
            url = video.get('link', '')
            
            # Extract Thumbnail
            thumb = ""
            pictures = video.get('pictures', {})
            if pictures and 'sizes' in pictures and len(pictures['sizes']) > 0:
                thumb = pictures['sizes'][0]['link']
                
            # Extract Uploader
            uploader = "Unknown"
            user = video.get('user', {})
            if user: uploader = user.get('name', 'Unknown')

            scout_results.append(ScoutResult(
                platform="Vimeo",
                title=title,
                url=url,
                thumbnail=thumb,
                uploader=uploader,
                duration=self.format_duration_sec(video.get('duration', 0)),
                match_score=0,
                description=video.get('description', '')
            ))
            
        return scout_results

    async def search_youtube_scraper(self, query: str) -> List[ScoutResult]:
        """YouTube yt-dlp fallback."""
        logger.info(f"Running yt-dlp YouTube search for: {query}")
        ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'max_downloads': 5}
        search_str = f"ytsearch5:{query}"
            
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, self._sync_youtube_scraper, search_str, ydl_opts)
            return results
        except Exception as e:
            logger.error(f"yt-dlp YouTube search failed: {e}")
            return []

    def _sync_youtube_scraper(self, search_str: str, opts: dict) -> List[ScoutResult]:
        with yt_dlp.YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(search_str, download=False)
                scout_results = []
                if 'entries' in info:
                    for entry in info['entries'][:5]:
                        entry_id = entry.get('id')
                        video_url = f"https://www.youtube.com/watch?v={entry_id}"
                        thumb = entry['thumbnails'][0]['url'] if entry.get('thumbnails') else ""

                        scout_results.append(ScoutResult(
                            platform="YouTube",
                            title=entry.get('title', 'Unknown'),
                            url=video_url,
                            thumbnail=thumb,
                            uploader=entry.get('uploader', 'Unknown'),
                            duration=self.format_duration_sec(entry.get('duration', 0)),
                            match_score=0,
                            description=entry.get('description', '')
                        ))
                return scout_results
            except Exception as e:
                logger.error(f"yt-dlp YouTube scraper failed: {e}")
                return []
    async def search_web(self, query: str, search_limit: int = 15) -> List[ScoutResult]:
        """Deep scout for Vimeo/YouTube links with loosened matching to ensure 'whole videos' are found."""
        logger.info(f"Deep Scouting for: {query} (Limit: {search_limit})")
        
        # Aggressive variations (no quotes to handle special characters better)
        queries = [
            f'{query} vimeo',
            f'{query} youtube',
            f'{query} vimeo short film',
            f'{query} youtube short film',
            f'"{query}" site:vimeo.com',
            f'"{query}" site:youtube.com'
        ]
        
        all_raw_results = []
        loop = asyncio.get_event_loop()
        
        # Run diversified queries in parallel
        search_tasks = [loop.run_in_executor(None, self._sync_ddg_search_with_retry, q, 3, search_limit) for q in queries]
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        for res in search_results:
            if isinstance(res, list):
                all_raw_results.extend(res)
            else:
                logger.debug(f"A search variation failed: {res}")

        # Normalize and filter URLs (Strictly YouTube/Vimeo)
        unique_urls = {}
        for item in all_raw_results:
            url = item.get('href')
            if not url: continue
            
            title = item.get('title', '')
            title_lower = title.lower()
            if "teaser" in title_lower or "trailer" in title_lower:
                continue

            # Basic normalization
            norm_url = url.split('?')[0].replace('https://', '').replace('www.', '').rstrip('/')
            
            if "youtube.com" in norm_url or "youtu.be" in norm_url or "vimeo.com" in norm_url:
                if norm_url not in unique_urls:
                    # Collect cached data from search engine results if available (especially from videos() method)
                    unique_urls[norm_url] = {
                        "url": url,
                        "title": item.get('title', ''),
                        "thumb": item.get('image', item.get('thumbnail', '')),
                        "duration": item.get('duration', '0:00')
                    }

        # Enrich in parallel (passing cached data as fallbacks)
        results = []
        enrich_tasks = [self.enrich_video_metadata(
            data["url"], 
            data["title"], 
            fallback_thumb=data["thumb"], 
            fallback_duration=data["duration"]
        ) for data in unique_urls.values()]
        
        if enrich_tasks:
            enriched_results = await asyncio.gather(*enrich_tasks, return_exceptions=True)
            for res in enriched_results:
                if isinstance(res, ScoutResult):
                    results.append(res)
                        
        return results

    def _sync_ddg_search_with_retry(self, query: str, retries: int = 3, max_results: int = 15) -> List[Dict]:
        """Synchronous DDG search with aggressive retry logic."""
        for attempt in range(retries):
            try:
                with DDGS() as ddgs:
                    # Try text search first
                    res = list(ddgs.text(query, max_results=max_results))
                    if not res and attempt == 0:
                        # If first attempt yields nothing, try video search
                        res = list(ddgs.videos(query, max_results=max(10, max_results // 2)))
                    return res
            except Exception as e:
                logger.warning(f"DDG attempt {attempt+1} failed for '{query}': {e}")
                if attempt < retries - 1:
                    time.sleep(1) # Brief pause before retry
        return []

    def _sync_ddg_search(self, query: str) -> List[Dict]:
        """Keep for backward compatibility if needed, but use _with_retry mostly."""
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=10))
        except:
            return []

    async def enrich_video_metadata(self, url: str, fallback_title: str, fallback_thumb: str = "", fallback_duration: str = "0:00") -> ScoutResult:
        """Use yt-dlp to get rich metadata, fallback to basic data if it fails."""
        # Determine platform first
        platform = "Web (Other)"
        if "youtube.com" in url or "youtu.be" in url: platform = "Web (YouTube)"
        elif "vimeo.com" in url: platform = "Web (Vimeo)"

        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, self._sync_extract_info, url)
            
            if not info: raise ValueError("yt-dlp returned no info")
            
            thumb = info.get('thumbnail', '')
            if not thumb and info.get('thumbnails'):
                thumb = info['thumbnails'][0]['url']
            
            if not thumb: thumb = fallback_thumb

            return ScoutResult(
                platform=platform,
                title=info.get('title', fallback_title),
                url=url,
                thumbnail=thumb,
                uploader=info.get('uploader', 'Unknown'),
                duration=self.format_duration_sec(info.get('duration', 0)) if info.get('duration') else fallback_duration,
                match_score=0,
                description=info.get('description', '')
            )
        except Exception as e:
            logger.debug(f"Deep enrichment failed for {url}: {e}. Falling back to basic data.")
            # PRESERVE THE LINK: Return a result even if enrichment fails
            return ScoutResult(
                platform=platform,
                title=fallback_title,
                url=url,
                thumbnail=fallback_thumb,
                uploader="See Link",
                duration=fallback_duration,
                match_score=0,
                description=""
            )

    def _sync_extract_info(self, url: str) -> Dict:
        """Synchronous yt-dlp extraction."""
        ydl_opts = {
            'quiet': True, 
            'no_warnings': True, 
            'extract_flat': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)
