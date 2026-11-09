// TranscriptKit - Main World Bridge
// Runs in world: "MAIN" at document_start.
// Has direct access to window.ytInitialPlayerResponse, window.ytcfg, and movie_player.

(function () {
  'use strict';

  // Cached timedtext responses intercepted from YouTube's player
  const timedtextCache = new Map(); // videoId -> text

  // 1. Intercept fetch & XMLHttpRequest to capture timedtext requests with valid tokens
  try {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const resp = await origFetch.apply(this, args);
      if (url.includes('timedtext') && resp.ok) {
        try {
          const clone = resp.clone();
          const txt = await clone.text();
          if (txt && txt.length > 50) {
            const vMatch = url.match(/[?&]v=([^&]+)/);
            const vid = vMatch ? vMatch[1] : getCurrentVideoId();
            if (vid) {
              timedtextCache.set(vid, { url, text: txt, time: Date.now() });
            }
          }
        } catch (_) {}
      }
      return resp;
    };
  } catch (_) {}

  // 2. Video ID helper
  function getCurrentVideoId() {
    try {
      const path = location.pathname;
      if (path === '/watch') {
        return new URLSearchParams(location.search).get('v');
      }
      const m = path.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
      return new URLSearchParams(location.search).get('v') || null;
    } catch (_) {
      return null;
    }
  }

  // 3. Extract chapters from description or player data
  function extractChapters(description, durationSec) {
    const chapters = [];
    if (!description) return chapters;

    // Match lines like "01:23 Introduction" or "0:00 Intro" or "1:23:45 Chapter 1"
    const lines = description.split('\n');
    const regex = /(?:^|\s)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\s+[-–—]?\s*)(.+)$/;

    for (const line of lines) {
      const m = line.match(regex);
      if (m) {
        const hours = m[1] ? parseInt(m[1], 10) : 0;
        const mins = parseInt(m[2], 10);
        const secs = parseInt(m[3], 10);
        const title = m[4].trim();
        const timeMs = (hours * 3600 + mins * 60 + secs) * 1000;
        chapters.push({ timeMs, title });
      }
    }

    // Ensure sorted by time
    chapters.sort((a, b) => a.timeMs - b.timeMs);
    return chapters;
  }

  // 4. Get active video info from in-memory objects
  function getActiveVideoInfo() {
    const videoId = getCurrentVideoId();
    if (!videoId) return { ok: false, error: 'Open a YouTube video (/watch, /shorts, or /live) first.' };

    // Check player component first (always current on SPA navigation)
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const playerData = watchFlexy?.playerData || window.ytInitialPlayerResponse || null;

    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const videoDetails = playerData?.videoDetails || {};
    const title = videoDetails.title || document.title.replace(/ - YouTube$/, '');
    const author = videoDetails.author || '';
    const description = videoDetails.shortDescription || '';
    const lengthSeconds = parseInt(videoDetails.lengthSeconds || '0', 10);
    const chapters = extractChapters(description, lengthSeconds);

    return {
      ok: true,
      videoId,
      title,
      author,
      chapters,
      tracks: tracks.map((t) => ({
        name: t.name?.simpleText || t.languageCode,
        lang: t.languageCode,
        auto: t.kind === 'asr',
        url: t.baseUrl,
      })),
    };
  }

  // 5. Open and scrape the native on-page "Show transcript" panel
  async function scrapeDomTranscript() {
    // 1. Check if panel is already open and populated
    let segs = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segs.length > 0) {
      return extractSegmentsFromElements(segs);
    }

    // 2. Expand description if needed
    const expandBtn = document.querySelector(
      '#expand, #description-inline-expander, tp-yt-paper-button#expand, ytd-text-inline-expander #expand'
    );
    if (expandBtn) expandBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    // 3. Find and click "Show transcript" button
    let transcriptBtn = document.querySelector('ytd-video-description-transcript-section-renderer button');
    if (!transcriptBtn) {
      const allButtons = Array.from(document.querySelectorAll('button, tp-yt-paper-button, ytd-button-renderer'));
      transcriptBtn = allButtons.find((b) => (b.innerText || '').toLowerCase().includes('transcript'));
    }

    if (transcriptBtn) {
      transcriptBtn.click();
    } else {
      // Try the three-dots action menu near like/share
      const moreMenuBtn = document.querySelector(
        'ytd-watch-metadata #actions button[aria-label*="More" i], #top-level-buttons-computed + ytd-menu-renderer button'
      );
      if (moreMenuBtn) {
        moreMenuBtn.click();
        await new Promise((r) => setTimeout(r, 300));
        const menuItems = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item'));
        const transcriptItem = menuItems.find((it) => (it.innerText || '').toLowerCase().includes('transcript'));
        if (transcriptItem) {
          transcriptItem.click();
        }
      }
    }

    // 4. Poll for segments to render (up to 4.5 seconds)
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 300));
      segs = document.querySelectorAll('ytd-transcript-segment-renderer');
      if (segs.length > 0) {
        return extractSegmentsFromElements(segs);
      }
    }

    return null;
  }

  function parseTimeStringToMs(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1000;
    }
    return 0;
  }

  function extractSegmentsFromElements(elements) {
    const list = [];
    elements.forEach((el) => {
      const timeStr = el.querySelector('.segment-timestamp, #timestamp')?.innerText?.trim() || '0:00';
      const text = el.querySelector('.segment-text, #segment-text')?.innerText?.trim() || '';
      if (text) {
        list.push({
          start: parseTimeStringToMs(timeStr),
          dur: 2000,
          text,
        });
      }
    });
    return list;
  }

  // 6. Seek video helper
  function seekVideo(seconds) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = Math.max(0, seconds);
      video.play().catch(() => {});
      return true;
    }
    return false;
  }

  // 7. Message listener for requests from content.js (ISOLATED world)
  window.addEventListener('transcriptkit-req', async (ev) => {
    const { id, type, payload } = ev.detail || {};
    if (!id) return;

    let response = { ok: false, error: 'Unknown request type' };

    try {
      if (type === 'GET_INFO') {
        response = getActiveVideoInfo();
      } else if (type === 'GET_CACHED_TIMEDTEXT') {
        const vid = payload?.videoId || getCurrentVideoId();
        const cached = timedtextCache.get(vid);
        if (cached) {
          response = { ok: true, text: cached.text, url: cached.url };
        } else {
          response = { ok: false, error: 'No cached timedtext' };
        }
      } else if (type === 'SCRAPE_DOM') {
        const segs = await scrapeDomTranscript();
        if (segs && segs.length > 0) {
          response = { ok: true, segments: segs };
        } else {
          response = { ok: false, error: 'Could not extract transcript from page DOM' };
        }
      } else if (type === 'SEEK') {
        const ok = seekVideo(payload?.seconds || 0);
        response = { ok };
      }
    } catch (e) {
      response = { ok: false, error: e.message || String(e) };
    }

    // Reply to ISOLATED world
    window.dispatchEvent(
      new CustomEvent('transcriptkit-res', {
        detail: { id, response },
      })
    );
  });
})();
