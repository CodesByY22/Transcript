# TranscriptKit — Official Website & Deployment Guide

This directory contains the complete, high-converting, responsive landing page and support portal for **TranscriptKit**.

---

## 📁 Website Structure

```
website/
├── index.html          # High-converting main landing page (Interactive demo, features, comparison, FAQ)
├── support.html        # Dedicated Support & Troubleshooting center (For Chrome Store Support URL)
├── privacy.html        # Dedicated Privacy Policy page (Zero tracking, 100% local execution)
├── style.css           # Modern ink navy / electric blue theme with responsive layout
├── script.js           # Interactive demo sandbox, live search filter, and FAQ accordion
└── assets/
    ├── icons/          # Extension brand icons (16px, 48px, 128px)
    ├── screenshots/    # High-resolution store screenshots (1 to 5)
    └── og-image.png    # Social share card (1400x560 banner)
```

---

## 🚀 How to Host Your Website (100% Free, 1-Click)

Choose whichever method you prefer:

### Method 1: Vercel (Fastest — 30 Seconds, No Command Line)
1. Go to [vercel.com](https://vercel.com/) and log in (with GitHub or email).
2. Click **"Add New"** → **"Project"**.
3. Drag and drop the `website` folder directly into Vercel.
4. Click **Deploy**.
5. You instantly get a live, lightning-fast HTTPS URL (e.g., `https://transcriptkit.vercel.app`).

---

### Method 2: GitHub Pages (Free forever under your GitHub name)
1. Create a new public repository on GitHub (e.g. `transcriptkit-web`).
2. Upload the contents of the `website/` folder to the repository.
3. On GitHub, go to **Settings** → **Pages**.
4. Under **Branch**, select `main` and folder `/ (root)`, then click **Save**.
5. Within 60 seconds, your site is live at:
   `https://<your-username>.github.io/transcriptkit-web/`

---

### Method 3: Netlify Drop (Drag & Drop)
1. Open [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop the `website` folder into the browser.
3. You immediately get a live URL (e.g., `https://transcriptkit.netlify.app`).

---

## 📋 What to Paste in the Chrome Web Store Dashboard

Referring to your Developer Dashboard screen (**"Additional fields"** section):

| Field | URL to Enter | Purpose |
|---|---|---|
| **Official URL** | Leave as `None` (or select your verified domain if added in Google Search Console) | Verifies web domain ownership with Google |
| **Homepage URL** | `https://<your-site-url>/` | Shows as the official homepage link on your store listing to boost reach & SEO |
| **Support URL** | `https://<your-site-url>/support.html` | Provides users and Google reviewers with quick troubleshooting and contact email |

---

## ✨ Features Included on the Website

1. **Direct Chrome Web Store Link**: Big "Add to Chrome" CTA buttons pointing straight to your extension ID (`jhkhpmmaiandgkfmlpcneilpmohngiod`).
2. **Interactive Live Demo Sandbox**: Visitors can test Text, SRT, and Markdown exports, toggle timestamps, remove filler, and test search directly on the webpage.
3. **SEO Optimization**: Pre-configured meta tags, OpenGraph cards, Twitter cards, and Schema.org `SoftwareApplication` structured data.
4. **Dedicated Support Page**: Includes FAQs, troubleshooting steps, and support contact details to ensure swift Chrome Web Store review approval.
5. **Dedicated Privacy Page**: Transparent, clear statement confirming zero data collection, no telemetry, and local execution.

