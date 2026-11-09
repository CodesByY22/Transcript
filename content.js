// TranscriptKit - Content Script
// Runs in world: "ISOLATED" on YouTube pages.
// Handles popup messages, layered transcript fetching, cleaning, and in-page UI injection.

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__transcriptkit_content_injected) return;
  window.__transcriptkit_content_injected = true;

  // ---------- 1. Video ID & URL Helpers ----------
  function currentVideoId() {
    try {
      const url = new URL(location.href);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
      const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
      return url.searchParams.get('v') || null;
    } catch (_) {
      return null;
    }
  }

  // ---------- 2. Bridge Communication (with MAIN world) ----------
  function callBridge(type, payload = {}) {
    return new Promise((resolve) => {
      const id = 'tk_' + Math.random().toString(36).slice(2) + Date.now();
      const timer = setTimeout(() => {
        window.removeEventListener('transcriptkit-res', handler);
        resolve({ ok: false, error: 'Bridge request timed out' });
      }, 5000);

      function handler(ev) {
        if (ev.detail?.id === id) {
          clearTimeout(timer);
          window.removeEventListener('transcriptkit-res', handler);
          resolve(ev.detail.response || { ok: false, error: 'Empty bridge response' });
        }
      }

      window.addEventListener('transcriptkit-res', handler);
      window.dispatchEvent(
        new CustomEvent('transcriptkit-req', {
          detail: { id, type, payload },
        })
      );
    });
  }

  // ---------- 3. Text Cleaning, Decoding & Deduplication ----------
  function decodeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;|&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#9834;|&musical_note;|♪/g, '');
  }

  function cleanLine(raw) {
    if (!raw) return '';
    // Strip HTML tags like <c>, </c>, <font>, <b>, etc.
    let text = raw.replace(/<\/?[^>]+(>|$)/g, '');
    text = decodeHtml(text);
    return text.replace(/\s+/g, ' ').trim();
  }

  // De-duplicate overlapping words between consecutive segments (common in auto captions)
  function deduplicateSegments(segments) {
    if (!segments || segments.length <= 1) return segments || [];

    const result = [segments[0]];
    for (let i = 1; i < segments.length; i++) {
      const prev = result[result.length - 1];
      const curr = segments[i];

      const prevWords = prev.text.split(' ');
      const currWords = curr.text.split(' ');

      // Check overlap from longest possible down to 1
      const maxOverlap = Math.min(prevWords.length, currWords.length);
      let overlapCount = 0;

      for (let k = maxOverlap; k >= 1; k--) {
        const prevEnd = prevWords.slice(-k).join(' ').toLowerCase();
        const currStart = currWords.slice(0, k).join(' ').toLowerCase();
        if (prevEnd === currStart) {
          overlapCount = k;
          break;
        }
      }

      if (overlapCount > 0) {
        const remaining = currWords.slice(overlapCount).join(' ').trim();
        if (remaining) {
          result.push({
            start: curr.start,
            dur: curr.dur,
            text: remaining,
          });
        }
      } else {
        result.push(curr);
      }
    }
    return result;
  }

  // ---------- 4. Chapters Helper ----------
  function extractChapters(description) {
    const chapters = [];
    if (!description) return chapters;
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
    chapters.sort((a, b) => a.timeMs - b.timeMs);
    return chapters;
  }

  // ---------- 5. Layered Transcript Fetching ----------
  // Strategy:
  // a. Cached timedtext from player
  // b. Fetch baseUrl + &fmt=json3
  // c. Fetch baseUrl raw XML (parse <text> / <p>)
  // d. Last resort: Scrape on-page DOM transcript panel
  async function getSegments(trackUrl, isAuto = false) {
    const vid = currentVideoId();

    // Layer 1: Check bridge cache
    try {
      const cached = await callBridge('GET_CACHED_TIMEDTEXT', { videoId: vid });
      if (cached.ok && cached.text) {
        const parsed = parseTimedtextResponse(cached.text);
        if (parsed && parsed.length > 0) {
          return isAuto ? deduplicateSegments(parsed) : parsed;
        }
      }
    } catch (_) {}

    // Layer 2: Fetch fmt=json3
    if (trackUrl) {
      try {
        const res = await fetch(trackUrl + '&fmt=json3', { credentials: 'include' });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().startsWith('{')) {
            const data = JSON.parse(text);
            const segments = [];
            for (const ev of data.events || []) {
              if (!ev.segs) continue;
              const line = cleanLine(ev.segs.map((s) => s.utf8).join(''));
              if (!line) continue;
              segments.push({
                start: ev.tStartMs || 0,
                dur: ev.dDurationMs || 2000,
                text: line,
              });
            }
            if (segments.length > 0) {
              return isAuto ? deduplicateSegments(segments) : segments;
            }
          }
        }
      } catch (_) {}

      // Layer 3: Fetch XML (without fmt=json3)
      try {
        const res = await fetch(trackUrl, { credentials: 'include' });
        if (res.ok) {
          const text = await res.text();
          if (text && (text.includes('<timedtext') || text.includes('<transcript'))) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const nodes = xml.querySelectorAll('text, p');
            const segments = [];
            nodes.forEach((node) => {
              const startSec = parseFloat(node.getAttribute('start') || node.getAttribute('t') || '0');
              const durSec = parseFloat(node.getAttribute('dur') || node.getAttribute('d') || '2');
              const line = cleanLine(node.textContent);
              if (line) {
                const isMs = node.hasAttribute('t') && !node.getAttribute('t').includes('.');
                const startMs = isMs ? Math.round(startSec) : Math.round(startSec * 1000);
                const durMs = isMs ? Math.round(durSec) : Math.round(durSec * 1000);
                segments.push({ start: startMs, dur: durMs, text: line });
              }
            });
            if (segments.length > 0) {
              return isAuto ? deduplicateSegments(segments) : segments;
            }
          }
        }
      } catch (_) {}
    }

    // Layer 4: Fallback to on-page DOM scraping
    try {
      const domResult = await callBridge('SCRAPE_DOM');
      if (domResult.ok && domResult.segments?.length > 0) {
        return isAuto ? deduplicateSegments(domResult.segments) : domResult.segments;
      }
    } catch (_) {}

    throw new Error(
      'YouTube did not return captions for this track. The video may require CC to be clicked in the player, or captions may be unavailable.'
    );
  }

  function parseTimedtextResponse(text) {
    if (!text) return null;
    try {
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        const segments = [];
        for (const ev of data.events || []) {
          if (!ev.segs) continue;
          const line = cleanLine(ev.segs.map((s) => s.utf8).join(''));
          if (!line) continue;
          segments.push({
            start: ev.tStartMs || 0,
            dur: ev.dDurationMs || 2000,
            text: line,
          });
        }
        return segments;
      }
    } catch (_) {}
    return null;
  }

  // ---------- 6. Video Info Retrieval ----------
  async function getVideoInfo() {
    const id = currentVideoId();
    if (!id) {
      return { ok: false, error: 'Open a YouTube video (/watch, /shorts, or /live) first.' };
    }

    // 1. Ask bridge (has direct access to current in-memory player state)
    const bridgeInfo = await callBridge('GET_INFO');
    if (bridgeInfo.ok && bridgeInfo.tracks?.length > 0 && bridgeInfo.videoId === id) {
      return bridgeInfo;
    }

    // 2. Fallback: try fetching watch page HTML (for standalone shorts/live when bridge is settling)
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${id}`, { credentials: 'include' });
      const html = await res.text();
      const m = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s|<\/script>)/s);
      if (m) {
        const pr = JSON.parse(m[1]);
        const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const description = pr?.videoDetails?.shortDescription || '';
        return {
          ok: true,
          videoId: id,
          title: pr?.videoDetails?.title || document.title.replace(/ - YouTube$/, ''),
          author: pr?.videoDetails?.author || '',
          chapters: bridgeInfo.chapters?.length ? bridgeInfo.chapters : extractChapters(description),
          tracks: tracks.map((t) => ({
            name: t.name?.simpleText || t.languageCode,
            lang: t.languageCode,
            auto: t.kind === 'asr',
            url: t.baseUrl,
          })),
        };
      }
    } catch (_) {}

    if (bridgeInfo.ok) {
      return bridgeInfo;
    }

    return {
      ok: false,
      error: 'Could not read video information from YouTube. Please refresh the page and try again.',
    };
  }

  // ---------- 7. Toast Notification ----------
  function showToast(text, duration = 2500) {
    const id = 'transcriptkit-toast';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.style.cssText = `
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #f8fafc;
        padding: 10px 18px;
        border-radius: 8px;
        font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        z-index: 9999999;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        pointer-events: none;
        transition: opacity 0.2s, transform 0.2s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(8px)';
      }
    }, duration);
  }

  // ---------- 8. Formatting Helpers (for Instant Copy) ----------
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function formatClock(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60);
  }

  function formatSrtTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
  }

  const FILLER_REGEX = /^\s*\[(?:music|applause|laughter|cheering|cheers|silence|whispering)\]\s*$/i;

  function filterFiller(segments) {
    return segments.filter((s) => !FILLER_REGEX.test(s.text));
  }

  function formatParagraphs(segs, withTs, merge = true) {
    if (!merge) {
      return segs.map((s) => (withTs ? `[${formatClock(s.start)}] ` : '') + s.text).join('\n');
    }
    const out = [];
    let cur = [];
    let curStart = 0;
    let lastEnd = 0;

    for (const s of segs) {
      if (cur.length && s.start - lastEnd > 2500) {
        out.push([curStart, cur.join(' ')]);
        cur = [];
      }
      if (!cur.length) curStart = s.start;
      cur.push(s.text);
      lastEnd = s.start + s.dur;
    }
    if (cur.length) out.push([curStart, cur.join(' ')]);
    return out.map(([t, txt]) => (withTs ? `[${formatClock(t)}] ` : '') + txt).join('\n\n');
  }

  function groupWithChapters(segments, chapters, withTs, merge) {
    if (!chapters || !chapters.length) return formatParagraphs(segments, withTs, merge);

    let chapIdx = 0;
    const blocks = [];
    let currentChapter = chapters[0];
    let currentSegs = [];

    for (const seg of segments) {
      while (chapIdx + 1 < chapters.length && seg.start >= chapters[chapIdx + 1].timeMs) {
        if (currentSegs.length > 0) {
          blocks.push(
            `### ${currentChapter.title} (${formatClock(currentChapter.timeMs)})\n\n` +
              formatParagraphs(currentSegs, withTs, merge)
          );
          currentSegs = [];
        }
        chapIdx++;
        currentChapter = chapters[chapIdx];
      }
      currentSegs.push(seg);
    }

    if (currentSegs.length > 0) {
      blocks.push(
        `### ${currentChapter.title} (${formatClock(currentChapter.timeMs)})\n\n` +
          formatParagraphs(currentSegs, withTs, merge)
      );
    }

    return blocks.join('\n\n');
  }

  function buildTranscriptText({ info, segments, fmt, ts, removeFiller, merge, includeHeader, groupByChapters }) {
    if (!segments.length) return '';
    let segs = removeFiller ? filterFiller(segments) : segments;
    if (!segs.length) segs = segments;

    const url = 'https://www.youtube.com/watch?v=' + info.videoId;

    if (fmt === 'srt') {
      return segs
        .map(
          (s, i) =>
            `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.start + (s.dur || 2000))}\n${s.text}\n`
        )
        .join('\n');
    }

    const body =
      groupByChapters && info.chapters?.length
        ? groupWithChapters(segs, info.chapters, ts, merge)
        : formatParagraphs(segs, ts, merge);

    const header = includeHeader
      ? `# ${info.title}\n${info.author ? 'Channel: ' + info.author + '\n' : ''}Source: ${url}\n\n`
      : '';

    if (fmt === 'md') {
      return `${header}## Transcript\n\n${body}\n`;
    }

    return (header ? `${info.title}\n${url}\n\n` : '') + body;
  }

  // ---------- 9. Handle Instant Shortcut Copy ----------
  async function handleShortcutCopy() {
    try {
      showToast('Reading transcript...');
      const info = await getVideoInfo();
      if (!info.ok || !info.tracks?.length) {
        showToast(info.error || 'No captions found for this video.');
        return;
      }

      // Read stored user preferences
      const prefs = await new Promise((r) => {
        chrome.storage.local.get(
          ['fmt', 'ts', 'removeFiller', 'merge', 'includeHeader', 'groupByChapters'],
          r
        );
      });

      const segments = await getSegments(info.tracks[0].url, info.tracks[0].auto);
      const text = buildTranscriptText({
        info,
        segments,
        fmt: prefs.fmt || 'txt',
        ts: prefs.ts || false,
        removeFiller: prefs.removeFiller !== false,
        merge: prefs.merge !== false,
        includeHeader: prefs.includeHeader || false,
        groupByChapters: prefs.groupByChapters || false,
      });

      await navigator.clipboard.writeText(text);
      showToast('Transcript copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy: ' + (err.message || String(err)));
    }
  }

  // ---------- 10. Native "Transcript" Button & In-Page Tool Injection ----------
  function injectNativeButton() {
    if (document.getElementById('transcriptkit-btn')) return;

    // Look for YouTube's action buttons container near Like / Share / Download
    const container = document.querySelector(
      '#actions-inner #menu, #actions-inner, #actions #top-level-buttons-computed, #top-level-buttons-computed, ytd-watch-metadata #actions, ytd-reel-player-overlay-renderer #actions'
    );
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = 'transcriptkit-btn';
    btn.type = 'button';
    btn.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      padding: 0 14px;
      height: 36px;
      border-radius: 18px;
      font: 500 13px system-ui, -apple-system, sans-serif;
      cursor: pointer;
      border: none;
      background: rgba(0, 0, 0, 0.05);
      color: inherit;
      transition: background 0.15s;
      vertical-align: middle;
    `;

    // Detect dark theme
    const isDark = document.documentElement.hasAttribute('dark') || document.querySelector('html[dark]');
    if (isDark) {
      btn.style.background = 'rgba(255, 255, 255, 0.1)';
      btn.style.color = '#fff';
    }

    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <path d="M4 6h16M4 12h10M4 18h14"/>
      </svg>
      <span>Transcript</span>
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.background = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    });

    btn.addEventListener('click', () => {
      toggleInPageModal();
    });

    container.appendChild(btn);
  }

  // In-page modal viewer
  async function toggleInPageModal() {
    let modal = document.getElementById('transcriptkit-modal');
    if (modal) {
      modal.remove();
      return;
    }

    const isDark = document.documentElement.hasAttribute('dark') || document.querySelector('html[dark]');

    modal = document.createElement('div');
    modal.id = 'transcriptkit-modal';
    modal.style.cssText = `
      position: fixed;
      top: 72px;
      right: 24px;
      width: 420px;
      max-height: calc(100vh - 96px);
      background: ${isDark ? '#0f172a' : '#ffffff'};
      color: ${isDark ? '#f8fafc' : '#0f172a'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 12px;
      box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.35);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font: 13px/1.45 system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
      overflow: hidden;
    `;

    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid ${isDark ? '#1e293b' : '#e2e8f0'};">
        <div style="font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px;">
          <span>TranscriptKit</span>
        </div>
        <button id="tk-close" style="background:none;border:none;cursor:pointer;color:inherit;font-size:18px;line-height:1;padding:4px 6px;border-radius:4px;">✕</button>
      </div>
      <div id="tk-content" style="padding:14px;overflow-y:auto;flex:1;">
        <div id="tk-status" style="color:${isDark ? '#94a3b8' : '#64748b'};">Loading transcript...</div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#tk-close').addEventListener('click', () => modal.remove());

    const contentDiv = modal.querySelector('#tk-content');

    try {
      const info = await getVideoInfo();
      if (!info.ok || !info.tracks?.length) {
        contentDiv.innerHTML = `<div style="color:#ef4444;padding:8px 0;">${info.error || 'This video has no captions.'}</div>`;
        return;
      }

      const segments = await getSegments(info.tracks[0].url, info.tracks[0].auto);

      let fmt = 'txt';
      let ts = true;
      let searchQuery = '';

      function render() {
        const fullText = buildTranscriptText({
          info,
          segments,
          fmt,
          ts,
          removeFiller: true,
          merge: true,
          includeHeader: false,
          groupByChapters: false,
        });

        const wordCount = fullText.split(/\s+/).filter(Boolean).length;
        const readTime = Math.ceil(wordCount / 200);

        let filtered = segments;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = segments.filter((s) => s.text.toLowerCase().includes(q));
        }

        contentDiv.innerHTML = `
          <div style="margin-bottom:10px;">
            <div style="font-weight:600;font-size:13px;line-height:1.3;max-height:2.6em;overflow:hidden;">${info.title}</div>
            <div style="font-size:11px;color:${isDark ? '#94a3b8' : '#64748b'};margin-top:2px;">${wordCount.toLocaleString()} words · ~${readTime} min read</div>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:10px;">
            <input type="text" id="tk-search" placeholder="Search transcript..." value="${searchQuery}" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid ${isDark ? '#334155' : '#cbd5e1'};background:${isDark ? '#1e293b' : '#f8fafc'};color:inherit;font:inherit;">
            <button id="tk-ts-toggle" style="padding:6px 10px;border-radius:6px;border:1px solid ${isDark ? '#334155' : '#cbd5e1'};background:${ts ? (isDark ? '#334155' : '#e2e8f0') : 'transparent'};color:inherit;cursor:pointer;">${ts ? 'Timestamps: ON' : 'Timestamps: OFF'}</button>
          </div>
          <div id="tk-segments-list" style="max-height:280px;overflow-y:auto;border:1px solid ${isDark ? '#334155' : '#e2e8f0'};border-radius:6px;padding:8px;font-size:12px;line-height:1.5;">
            ${
              filtered.length
                ? filtered
                    .map(
                      (s) => `
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                  <button class="tk-seek" data-time="${s.start / 1000}" style="flex-shrink:0;color:#2563eb;background:none;border:none;cursor:pointer;padding:0;font-family:monospace;font-size:11px;font-weight:600;">[${formatClock(s.start)}]</button>
                  <span style="flex:1;">${s.text}</span>
                </div>
              `
                    )
                    .join('')
                : '<div style="color:#94a3b8;text-align:center;padding:12px;">No matches found</div>'
            }
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button id="tk-copy" style="flex:1;padding:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Copy Full Transcript</button>
            <button id="tk-dl" style="padding:8px 14px;background:${isDark ? '#1e293b' : '#f1f5f9'};color:inherit;border:1px solid ${isDark ? '#334155' : '#cbd5e1'};border-radius:6px;cursor:pointer;">Download</button>
          </div>
        `;

        // Event listeners
        const sInput = contentDiv.querySelector('#tk-search');
        sInput.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          render();
          const nextInput = contentDiv.querySelector('#tk-search');
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        });

        contentDiv.querySelector('#tk-ts-toggle').addEventListener('click', () => {
          ts = !ts;
          render();
        });

        contentDiv.querySelectorAll('.tk-seek').forEach((b) =>
          b.addEventListener('click', () => {
            const sec = parseFloat(b.dataset.time);
            callBridge('SEEK', { seconds: sec });
          })
        );

        contentDiv.querySelector('#tk-copy').addEventListener('click', async () => {
          await navigator.clipboard.writeText(fullText);
          const cpBtn = contentDiv.querySelector('#tk-copy');
          cpBtn.textContent = 'Copied!';
          setTimeout(() => (cpBtn.textContent = 'Copy Full Transcript'), 1500);
          showToast('Transcript copied to clipboard!');
        });

        contentDiv.querySelector('#tk-dl').addEventListener('click', () => {
          const safe = info.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'transcript';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([fullText], { type: 'text/plain' }));
          a.download = `${safe}.txt`;
          a.click();
        });
      }

      render();
    } catch (err) {
      contentDiv.innerHTML = `<div style="color:#ef4444;padding:8px 0;">Failed to load transcript: ${err.message}</div>`;
    }
  }

  // MutationObserver to safely re-inject button when YouTube navigates or changes layout
  const observer = new MutationObserver(() => {
    if (location.pathname === '/watch' || location.pathname.startsWith('/shorts/')) {
      injectNativeButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectNativeButton, 1000);

  // ---------- 11. Message Listener for Extension Popup & Background ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg.type === 'INFO') {
          const info = await getVideoInfo();
          sendResponse(info);
        } else if (msg.type === 'SEGMENTS') {
          const segments = await getSegments(msg.url, msg.auto);
          sendResponse({ ok: true, segments });
        } else if (msg.type === 'SEEK') {
          const ok = await callBridge('SEEK', { seconds: msg.seconds || 0 });
          sendResponse({ ok });
        } else if (msg.type === 'SHORTCUT_COPY') {
          await handleShortcutCopy();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Unknown message type' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true; // Keep message channel open for async response
  });
})();
