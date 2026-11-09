// TranscriptKit Official Website — Interactive Behaviors & Demo Sandbox

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Interactive Demo Sandbox State & Data
  // ==========================================
  const demoData = {
    title: "How Large Language Models Work (In Simple Terms)",
    channel: "Computer Science Explained · 1.2M views",
    chapters: [
      { timeMs: 0, title: "Introduction to Neural Networks" },
      { timeMs: 45000, title: "Tokenization & Embeddings" },
      { timeMs: 110000, title: "Self-Attention Mechanism" }
    ],
    segments: [
      { start: 0, dur: 3200, text: "Welcome to this deep dive into how modern AI actually processes language." },
      { start: 3300, dur: 2800, text: "[Music] In this video we will break down the transformer architecture." },
      { start: 6200, dur: 4100, text: "You have probably used tools like ChatGPT, Gemini, or Claude in your daily workflow." },
      { start: 10400, dur: 3900, text: "At their core, these models do not actually read words like human beings do." },
      { start: 14400, dur: 3100, text: "Instead, they see numbers—thousands of floating-point vectors." },
      { start: 17600, dur: 2500, text: "[Applause] Let's look at how text turns into tokens." },
      { start: 45000, dur: 4200, text: "First, raw text is passed into a tokenizer which slices words into smaller tokens." },
      { start: 49300, dur: 3800, text: "Each token is assigned an ID and projected into a multi-dimensional embedding space." },
      { start: 53200, dur: 4000, text: "Words with similar semantic meanings end up mathematically close to each other." },
      { start: 110000, dur: 4500, text: "Now comes the magic of self-attention introduced in the seminal Attention Is All You Need paper." },
      { start: 114600, dur: 3900, text: "Self-attention calculates dynamic relationship weights between every pair of words in a sentence." },
      { start: 118600, dur: 3400, text: "This allows the model to understand context, pronoun references, and nuanced intent." }
    ]
  };

  const state = {
    fmt: 'txt', // txt | srt | md
    ts: true,
    removeFiller: true,
    merge: true,
    groupByChapters: false,
    searchQuery: ''
  };

  // UI Elements
  const previewArea = document.getElementById('demoPreview');
  const searchInput = document.getElementById('demoSearch');
  const tabButtons = document.querySelectorAll('.mockup-tab-btn');
  const chkTs = document.getElementById('chkTs');
  const chkFiller = document.getElementById('chkFiller');
  const chkMerge = document.getElementById('chkMerge');
  const chkChapters = document.getElementById('chkChapters');
  const btnCopy = document.getElementById('btnMockCopy');
  const btnDownload = document.getElementById('btnMockDownload');
  const toast = document.getElementById('toastNotice');

  // Formatting Utilities
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  
  function clock(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${pad(m)}:${pad(s % 60)}`;
  }

  function srtTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
  }

  const FILLER_REGEX = /^\s*\[(?:music|applause|laughter|cheering|cheers|silence|whispering)\]\s*$/i;

  function generateText() {
    let segs = state.removeFiller 
      ? demoData.segments.filter(s => !FILLER_REGEX.test(s.text))
      : demoData.segments;

    if (state.fmt === 'srt') {
      return segs.map((s, i) => 
        `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.start + s.dur)}\n${s.text}\n`
      ).join('\n');
    }

    if (state.groupByChapters && state.fmt === 'md') {
      let chapIdx = 0;
      let blocks = [];
      let currentChapter = demoData.chapters[0];
      let currentSegs = [];

      for (const seg of segs) {
        while (chapIdx + 1 < demoData.chapters.length && seg.start >= demoData.chapters[chapIdx + 1].timeMs) {
          if (currentSegs.length > 0) {
            blocks.push(`### ${currentChapter.title} (${clock(currentChapter.timeMs)})\n\n` + formatParagraphs(currentSegs));
            currentSegs = [];
          }
          chapIdx++;
          currentChapter = demoData.chapters[chapIdx];
        }
        currentSegs.push(seg);
      }
      if (currentSegs.length > 0) {
        blocks.push(`### ${currentChapter.title} (${clock(currentChapter.timeMs)})\n\n` + formatParagraphs(currentSegs));
      }
      return `# ${demoData.title}\n\n${blocks.join('\n\n')}`;
    }

    const body = formatParagraphs(segs);
    if (state.fmt === 'md') {
      return `# ${demoData.title}\nSource: https://www.youtube.com/watch?v=demo123\n\n## Transcript\n\n${body}`;
    }
    return body;
  }

  function formatParagraphs(segs) {
    if (!state.merge) {
      return segs.map(s => (state.ts ? `[${clock(s.start)}] ` : '') + s.text).join('\n');
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
    return out.map(([t, txt]) => (state.ts ? `[${clock(t)}] ` : '') + txt).join('\n\n');
  }

  function renderDemo() {
    let fullText = generateText();

    // Check search query
    const q = state.searchQuery.trim();
    if (q) {
      const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
      const safeEscaped = escapeHtml(fullText);
      const highlighted = safeEscaped.replace(regex, '<mark>$1</mark>');
      previewArea.innerHTML = highlighted;
    } else {
      previewArea.textContent = fullText;
    }
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(string) {
    return string
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Event Listeners for Demo Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.fmt = btn.getAttribute('data-fmt');
      renderDemo();
    });
  });

  // Checkboxes
  if (chkTs) chkTs.addEventListener('change', (e) => { state.ts = e.target.checked; renderDemo(); });
  if (chkFiller) chkFiller.addEventListener('change', (e) => { state.removeFiller = e.target.checked; renderDemo(); });
  if (chkMerge) chkMerge.addEventListener('change', (e) => { state.merge = e.target.checked; renderDemo(); });
  if (chkChapters) chkChapters.addEventListener('change', (e) => { 
    state.groupByChapters = e.target.checked;
    if (e.target.checked && state.fmt !== 'md') {
      // Auto-switch to Markdown for chapters demo
      state.fmt = 'md';
      tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-fmt') === 'md'));
    }
    renderDemo(); 
  });

  // Search Input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderDemo();
    });
  }

  // Copy Action
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const textToCopy = generateText();
      try {
        await navigator.clipboard.writeText(textToCopy);
        showToast('Transcript copied to clipboard!');
      } catch (err) {
        showToast('Copied to clipboard!');
      }
    });
  }

  // Download Action
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      const text = generateText();
      const ext = state.fmt === 'srt' ? 'srt' : (state.fmt === 'md' ? 'md' : 'txt');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-demo.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded transcript-demo.${ext}!`);
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Initialize Demo
  renderDemo();

  // ==========================================
  // 2. Screenshots Carousel & Switcher
  // ==========================================
  const shotPills = document.querySelectorAll('.shot-pill-btn');
  const shotImage = document.getElementById('featuredShot');

  const shotSources = {
    '1': 'assets/screenshots/screenshot-1.png',
    '2': 'assets/screenshots/screenshot-2.png',
    '3': 'assets/screenshots/screenshot-3.png',
    '4': 'assets/screenshots/screenshot-4.png',
    '5': 'assets/screenshots/screenshot-5.png'
  };

  shotPills.forEach(pill => {
    pill.addEventListener('click', () => {
      shotPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const id = pill.getAttribute('data-shot');
      if (shotImage && shotSources[id]) {
        shotImage.style.opacity = '0.3';
        setTimeout(() => {
          shotImage.src = shotSources[id];
          shotImage.style.opacity = '1';
        }, 150);
      }
    });
  });

  // ==========================================
  // 3. FAQ Accordion
  // ==========================================
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
});

