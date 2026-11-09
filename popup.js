// TranscriptKit - Popup Controller
// Manages UI states, user preferences, formatting, search, and export actions.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    info: null,
    segments: [],
    tabId: null,
    fmt: 'txt',
    ts: false,
    removeFiller: true,
    merge: true,
    includeHeader: false,
    groupByChapters: false,
    searchQuery: '',
    fullText: '',
  };

  // ---------- Helpers ----------
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  function clock(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60);
  }

  function srtTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
  }

  const FILLER_REGEX = /^\s*\[(?:music|applause|laughter|cheering|cheers|silence|whispering)\]\s*$/i;

  function filterFiller(segs) {
    return segs.filter((s) => !FILLER_REGEX.test(s.text));
  }

  // ---------- Formatting ----------
  function paragraphs(segs, withTs, shouldMerge) {
    if (!shouldMerge) {
      return segs.map((s) => (withTs ? `[${clock(s.start)}] ` : '') + s.text).join('\n');
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

    return out.map(([t, txt]) => (withTs ? `[${clock(t)}] ` : '') + txt).join('\n\n');
  }

  function groupWithChapters(segs, chapters, withTs, shouldMerge) {
    if (!chapters || !chapters.length) return paragraphs(segs, withTs, shouldMerge);

    let chapIdx = 0;
    const blocks = [];
    let currentChapter = chapters[0];
    let currentSegs = [];

    for (const seg of segs) {
      while (chapIdx + 1 < chapters.length && seg.start >= chapters[chapIdx + 1].timeMs) {
        if (currentSegs.length > 0) {
          blocks.push(
            `### ${currentChapter.title} (${clock(currentChapter.timeMs)})\n\n` +
              paragraphs(currentSegs, withTs, shouldMerge)
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
        `### ${currentChapter.title} (${clock(currentChapter.timeMs)})\n\n` +
          paragraphs(currentSegs, withTs, shouldMerge)
      );
    }

    return blocks.join('\n\n');
  }

  function buildFullText() {
    const { info, segments, fmt, ts, removeFiller, merge, includeHeader, groupByChapters } = state;
    if (!segments.length || !info) return '';

    let segs = removeFiller ? filterFiller(segments) : segments;
    if (!segs.length) segs = segments;

    const url = 'https://www.youtube.com/watch?v=' + info.videoId;

    if (fmt === 'srt') {
      return segs
        .map(
          (s, i) =>
            `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.start + (s.dur || 2000))}\n${s.text}\n`
        )
        .join('\n');
    }

    const body =
      groupByChapters && info.chapters?.length
        ? groupWithChapters(segs, info.chapters, ts, merge)
        : paragraphs(segs, ts, merge);

    const header = includeHeader
      ? `# ${info.title}\n${info.author ? 'Channel: ' + info.author + '\n' : ''}Source: ${url}\n\n`
      : '';

    if (fmt === 'md') {
      return `${header}## Transcript\n\n${body}\n`;
    }

    return (header ? `${info.title}\n${url}\n\n` : '') + body;
  }

  function updateStats(text) {
    if (!text) {
      $('stats').hidden = true;
      return;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    $('stats').textContent = `${words.toLocaleString()} words · ~${mins} min`;
    $('stats').hidden = false;
  }

  function refresh() {
    state.fullText = buildFullText();
    updateStats(state.fullText);

    $('ts').disabled = state.fmt === 'srt';

    // Handle search filtering
    let displayText = state.fullText;
    const q = state.searchQuery.trim().toLowerCase();

    if (q) {
      const lines = state.fullText.split('\n');
      const matches = lines.filter((line) => line.toLowerCase().includes(q));
      $('searchMatchCount').textContent = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;
      $('searchMatchCount').hidden = false;
      $('searchClear').hidden = false;

      if (matches.length > 0) {
        displayText = matches.join('\n\n');
      } else {
        displayText = `No matches found for "${state.searchQuery}".`;
      }
    } else {
      $('searchMatchCount').hidden = true;
      $('searchClear').hidden = true;
    }

    // Keep popup fast: truncate preview if very long
    const MAX_PREVIEW_LEN = 4000;
    if (displayText.length > MAX_PREVIEW_LEN && !q) {
      $('preview').value = displayText.slice(0, MAX_PREVIEW_LEN) + '\n\n... [Preview truncated for display speed. Copy or Download will include the entire transcript.]';
      $('truncationNotice').hidden = false;
    } else {
      $('preview').value = displayText;
      $('truncationNotice').hidden = true;
    }

    savePreferences();
  }

  // ---------- Storage / Preferences ----------
  function loadPreferences() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['fmt', 'ts', 'removeFiller', 'merge', 'includeHeader', 'groupByChapters'],
        (res) => {
          if (res) {
            if (res.fmt && res.fmt !== 'ai') state.fmt = res.fmt;
            if (res.ts !== undefined) state.ts = res.ts;
            if (res.removeFiller !== undefined) state.removeFiller = res.removeFiller;
            if (res.merge !== undefined) state.merge = res.merge;
            if (res.includeHeader !== undefined) state.includeHeader = res.includeHeader;
            if (res.groupByChapters !== undefined) state.groupByChapters = res.groupByChapters;
          }
          // Sync to UI controls
          $('ts').checked = state.ts;
          $('removeFiller').checked = state.removeFiller;
          $('merge').checked = state.merge;
          $('includeHeader').checked = state.includeHeader;
          $('groupByChapters').checked = state.groupByChapters;

          document.querySelectorAll('.fmt-btn').forEach((b) => {
            const active = b.dataset.fmt === state.fmt;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
          });

          resolve();
        }
      );
    });
  }

  function savePreferences() {
    chrome.storage.local.set({
      fmt: state.fmt,
      ts: state.ts,
      removeFiller: state.removeFiller,
      merge: state.merge,
      includeHeader: state.includeHeader,
      groupByChapters: state.groupByChapters,
    });
  }

  // ---------- Content Script Communication ----------
  function ask(msg) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(state.tabId, msg, (res) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error:
              'Could not connect to this YouTube tab. Please refresh the YouTube page, then click TranscriptKit again.',
          });
        } else {
          resolve(res || { ok: false, error: 'No answer from YouTube page.' });
        }
      });
    });
  }

  function showMsg(text, isError = true) {
    $('msgText').textContent = text;
    $('msg').hidden = false;
    $('main').hidden = true;
    $('stats').hidden = true;
  }

  async function loadSegments() {
    const idx = $('lang').selectedIndex;
    if (idx < 0 || !state.info?.tracks?.[idx]) return;

    $('preview').value = 'Loading transcript...';
    $('truncationNotice').hidden = true;

    const track = state.info.tracks[idx];
    const r = await ask({ type: 'SEGMENTS', url: track.url, auto: track.auto });

    if (!r.ok) {
      $('preview').value = '';
      return showMsg(r.error || 'Failed to load captions.');
    }

    state.segments = r.segments || [];
    refresh();
  }

  // ---------- Initialization ----------
  async function init() {
    await loadPreferences();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/www\.youtube\.com\/(watch|shorts|live)/.test(tab.url || '')) {
      return showMsg('Open a YouTube video, Short, or Live stream, then open TranscriptKit.');
    }

    state.tabId = tab.id;
    showMsg('Reading video transcript...');

    const info = await ask({ type: 'INFO' });
    if (!info.ok) return showMsg(info.error || 'Could not read video data.');

    if (!info.tracks || !info.tracks.length) {
      return showMsg('This video has no captions or transcripts available. Try a video with CC or auto-generated captions.');
    }

    state.info = info;
    $('title').textContent = info.title;
    $('author').textContent = info.author || '';

    // Chapters availability
    if (info.chapters && info.chapters.length > 0) {
      $('chapRow').hidden = false;
    } else {
      $('chapRow').hidden = true;
      state.groupByChapters = false;
      $('groupByChapters').checked = false;
    }

    // Populate languages
    $('lang').innerHTML = '';
    info.tracks.forEach((t) => {
      const o = document.createElement('option');
      o.textContent = t.name + (t.auto ? ' (auto-generated)' : '');
      o.value = t.lang;
      $('lang').appendChild(o);
    });

    $('msg').hidden = true;
    $('main').hidden = false;

    await loadSegments();
  }

  // ---------- Events ----------
  $('lang').addEventListener('change', loadSegments);

  $('ts').addEventListener('change', (e) => {
    state.ts = e.target.checked;
    refresh();
  });

  $('removeFiller').addEventListener('change', (e) => {
    state.removeFiller = e.target.checked;
    refresh();
  });

  $('merge').addEventListener('change', (e) => {
    state.merge = e.target.checked;
    refresh();
  });

  $('includeHeader').addEventListener('change', (e) => {
    state.includeHeader = e.target.checked;
    refresh();
  });

  $('groupByChapters').addEventListener('change', (e) => {
    state.groupByChapters = e.target.checked;
    refresh();
  });

  document.querySelectorAll('.fmt-btn').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.fmt-btn').forEach((x) => {
        x.classList.remove('active');
        x.setAttribute('aria-selected', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
      state.fmt = b.dataset.fmt;
      refresh();
    })
  );

  $('search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    refresh();
  });

  $('searchClear').addEventListener('click', () => {
    $('search').value = '';
    state.searchQuery = '';
    refresh();
  });

  // Clicking timestamps inside the preview to seek video
  $('preview').addEventListener('click', (e) => {
    const pos = e.target.selectionStart;
    const text = e.target.value;
    // Look around clicked position for a timestamp like [01:23] or [1:23:45]
    const before = text.slice(Math.max(0, pos - 15), pos);
    const after = text.slice(pos, Math.min(text.length, pos + 15));
    const combined = before + after;
    const m = combined.match(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/);
    if (m) {
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const mins = parseInt(m[2], 10);
      const secs = parseInt(m[3], 10);
      const totalSec = h * 3600 + mins * 60 + secs;
      ask({ type: 'SEEK', seconds: totalSec });
    }
  });

  $('copy').addEventListener('click', async () => {
    if (!state.fullText) return;
    await navigator.clipboard.writeText(state.fullText);
    const copyText = $('copyText');
    copyText.textContent = 'Copied!';
    setTimeout(() => (copyText.textContent = 'Copy'), 1400);
  });

  $('download').addEventListener('click', () => {
    if (!state.fullText) return;
    const ext = { txt: 'txt', srt: 'srt', md: 'md' }[state.fmt] || 'txt';
    const safeTitle = (state.info?.title || 'transcript').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'transcript';
    const blob = new Blob([state.fullText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeTitle}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  init();
})();
