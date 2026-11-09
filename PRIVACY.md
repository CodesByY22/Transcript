# Privacy Policy for TranscriptKit

**Last Updated:** November 2026

TranscriptKit ("we", "our", or "the extension") is a 100% free, open-source productivity Chrome extension designed to help students, researchers, and creators copy and export YouTube video transcripts.

### 1. No Data Collection
TranscriptKit **does not collect, store, transmit, or share** any personal information, browsing history, user data, or analytics.

### 2. 100% Local Execution
All transcript processing, formatting, timestamp calculations, and text generation run **strictly locally** inside your web browser. 

- No external API calls are made to third-party servers.
- All text cleaning, deduplication, and file generation happen in-memory on your machine.

### 3. Network Requests
TranscriptKit only communicates with `https://www.youtube.com/*`—the website you are currently browsing—to request the video transcript data you explicitly ask for. No network requests are made to any other domain.

### 4. Permissions Justification
- **Storage (`storage`):** Used strictly to save your preferred export format, language preference, and formatting options locally on your machine.
- **Host Permissions (`https://www.youtube.com/*`):** Required solely to read video captions and inject the optional "Transcript" button on YouTube watch pages.

### 5. Contact
If you have any questions or feedback, please open an issue on the project's repository.
