<div align="center">

# Markdown Editor

A Markdown writing tool that works right out of the box in your browser.
**No installation. No account. No subscription. Your words belong to you.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)[![Pure Frontend](https://img.shields.io/badge/Architecture-Pure%20Frontend-success)](./markdown-editor.html)[![I18N](https://img.shields.io/badge/I18N-10%20Languages-orange)](./i18n.js)

<p align="center">
  <a href="./README.md" style="display:inline-block;padding:6px 18px;background:#4f46e5;color:#fff;border-radius:6px 0 0 6px;text-decoration:none;font-weight:600;">English</a>  |  <a href="./README.zh.md" style="display:inline-block;padding:6px 18px;background:#f3f4f6;color:#4b5563;border-radius:0 6px 6px 0;text-decoration:none;font-weight:600;">简体中文</a>
</p>

</div>


---

## 🌟 Why This Tool?

In the age of AI, Markdown should be simple enough.

As a Vibe Coding developer obsessed with Prompts, Agents, and Skills, I’ve used too many Markdown tools: some are too heavy, some charge subscriptions, and some sync your content to the cloud without asking. I just wanted to open a browser, type, see the layout, and take it away.

So I built this editor.

It is **just one HTML file**. Double-click to write. Everything is stored locally, and it works offline. It supports nearly all mainstream Agents — Codex, Claude Code, Openclaw, and more. Whether you’re designing an AGENTS.md or a Skill.md, you can do it here.

> If you also believe that in the age of AI, Markdown is the first language — welcome to use it, fork it, and star it.

---

## ✨ Features

### 🚀 Out-of-the-Box, Minimalist

- Single-file `markdown-editor.html`: double-click to run in the browser.
- All core styles, structure, and logic are inlined; works offline.

### 🖊️ Complete Markdown Experience

- **Drag-and-drop import**: drop files directly into the window.
- **Link dialog**: click Link or press Ctrl+K to open a modal matching the image-insertion dialog. The selected text is prefilled (or defaults to “Link”), with a separate URL input.
- **Live preview**: write on the left, preview on the right in real time.
- **Width-aware single-row toolbar**: formatting and Mermaid tools, then **Import → Export → Web to Markdown → View → Help → Night/Day**. It measures actual available width and moves actions into ⋮ only as needed; formatting controls and ⋮ remain on one row, including narrow screens. Ctrl+S and Ctrl+F are preserved.
- **Standard and Reading modes**: Standard shows the editor, live preview, and outline. An accented, icon-only book button in the bottom-right enters Reading mode. Reading mode hides editing controls and floats a draggable outline over a full-width preview; next to Exit Reading Mode is an independent Night/Day toggle that updates the shared theme preference. Escape still returns to Standard.
- **Preview filename and footer status**: the editable filename is centered in the preview header **without its .md/.markdown suffix** and displays in black in the light theme (contrasting text in dark mode). The footer shows the visible-bottom reading progress (100% at bottom), rendered word count, and full selected language name (e.g., 简体中文). The browser tab shows `filename-imported time` for imported Markdown, or `filename-opened time` otherwise; saving does not change it.
- **Read-only Base64 state**: When embedded Base64 images exist, a non-clickable “Base64 images folded” label appears after Edit. The expand/hide button is removed. Full Base64 remains in exported Markdown, and the same image keeps its marker number after Ctrl+Z/Ctrl+Y.
- **Compare-style image links**: A Markdown image row and its corresponding rendered preview image are linked by a subtle green source highlight, a green image outline and a translucent funnel-shaped SVG bridge. The overlay updates on scrolling, image load and pane resizing. It is purely visual, ignores pointer events, and hides offscreen links and all links in reading or stacked mobile modes.
- **Paste PowerPoint images**: When a clipboard item exposes PNG/JPEG/WebP/GIF/BMP pixels, press `Ctrl+V` in the editor to embed an image as Base64 Markdown. Ordinary text paste remains unchanged. Images above 2 MiB require confirmation; above 5 MiB are rejected. EMF/WMF/TIFF-only clipboards cannot be decoded through the browser's native paste event; export or copy the image as PNG/JPEG first. Large Base64 images may exceed browser localStorage limits.
- **Draggable split and independent scrolling**: resize the panes while keeping each pane's scroll position independent. Collapsing the editor hides its scrollable textarea completely, just as collapsing the outline hides its list. Wheel, trackpad and scrollbar movements are mirrored proportionally; clicking an outline heading aligns the corresponding heading at the top of each pane.

### 🛠️ Rich Editing Tools

| Feature | Description |
|---------|-------------|
| Headings | Quick H1-H6 insertion |
| Text styles | Bold, italic, underline, strikethrough, superscript, subscript |
| Lists | Unordered, ordered, and task lists |
| Quotes & code | Blockquotes, inline code, fenced code blocks; fenced language tags appear at the upper right when provided (empty by default) |
| Links & images | URL insertion and local image Base64 embedding |
| Tables | Visual 8×8 table picker |
| Find & replace | Find next, replace, replace all |

### 🌐 Multi-Language Support (10 Languages)

Powered by `i18n.js`: **Simplified Chinese, Traditional Chinese, English, Japanese, Korean, Spanish, French, German, Russian, Portuguese**.

Language preference is persisted to `localStorage`.

### 🎨 Dark / Light Theme

- One-click theme switching with automatic persistence.
- All colors use CSS variables, making customization easy.

### 💾 Local Auto-Save

- The editor auto-backs up content to browser `localStorage` every 500ms. In supported Chrome/Edge versions, **Ctrl/Cmd+S** (while the editor has focus) invokes a native save picker only on the first save, then overwrites that same authorized `.md` file. **Ctrl/Cmd+Shift+S** always asks for a new destination. Using the native Open picker to import `.md` also associates that file for subsequent saves. Dropped or legacy file-input documents do not grant disk-write access, so the first save asks where to write them. Unsupported browsers fall back to downloading a Markdown file.
- Content, full filename (including `.md`), split ratio, collapsed states, theme, and language survive refresh; the authorized file handle does **not** persist between page sessions. Renaming the preview title no longer causes an automatic download and clears the old file association to prevent accidental overwrites. The separate Export Markdown menu action remains a download-copy operation.

### 📤 Multi-Format Export

| Format | Description |
|--------|-------------|
| `.md` | Raw Markdown file |
| `.html` | Standalone HTML file |
| `.doc` | Word-compatible HTML saved as `.doc`: images are set to the full A4 text-area width (15.92cm with 2.54cm side margins), and height follows the original aspect ratio without a fixed height cap. Exceptionally tall images may exceed one page. |
| `.pdf` | Browser print-to-PDF |
| `.png` | Long-image export with 9:16, 4:5, 3:4, 1:1, 16:9 ratios for social sharing |

### ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + S` / `Cmd + S` | Save to authorized `.md` file, choosing a destination on first use; fallback to download if unsupported |
| `Ctrl + Shift + S` / `Cmd + Shift + S` | Save As Markdown to a newly selected file |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |
| `Ctrl + B` | Bold |
| `Ctrl + I` | Italic |
| `Ctrl + U` | Underline |
| `Ctrl + K` | Insert link |
| `Ctrl + Shift + K` | Insert image |
| `Ctrl + F` | Find & replace |
| `Tab` | Insert 4-space indent |

---

## 🛠️ Technical Architecture

### Stack

- **Pure native frontend**: HTML5 + CSS3 + Vanilla JavaScript, no framework.
- **Markdown rendering**: `marked.js`
- **Math**: `KaTeX` (`$...$` inline, `$$...$$` block)
- **Diagrams**: `Mermaid 10` (mind maps and flowcharts)
- **Image export**: `dom-to-image-more`
- **Local proxy**: `Python 3` + `http.server` (optional, for webpage-to-Markdown)

### Core Design

```
┌─────────────────────────────────────────────────────────────┐
│                    markdown-editor.html                      │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  Editor      │  sync   │  Preview     │                  │
│  │  (textarea)  │ ──────▶ │  (marked.js) │                  │
│  └──────────────┘         └──────────────┘                  │
│         │                         │                         │
│         ▼                         ▼                         │
│   localStorage               KaTeX / Mermaid               │
│         │                         │                         │
│         ▼                         ▼                         │
│   auto-save / state restore  formula / diagram render      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   web-to-md-proxy.py (optional)
                    web fetching + anti-bot bypass
```

---

## 📁 Project Structure

```
.
├── markdown-editor.html    # Main editor (single-file app)
├── i18n.js                 # i18n dictionary (10 languages)
├── web-to-md-proxy.py      # Optional local proxy script
└── README.md               # This file
```

---

## 🚀 Quick Start

### Option 1: Open Directly

```bash
# Clone the repo
git clone https://github.com/woyin2024/lengyi-markdown-editor.git

# Double-click to open
markdown-editor.html
```

### Option 2: Local Server (Recommended)

```bash
cd markdown-editor

# Python 3
python -m http.server 8080

# Or Node.js
npx serve .

# Open in browser
open http://localhost:8080/markdown-editor.html
```

### Option 3: Use the Local Proxy (Webpage to Markdown)

```bash
# Install requests (optional, recommended)
pip install requests

# Start the proxy
python web-to-md-proxy.py

# Default port 8765
# Check "Use local proxy" in the editor
```

---

## 🤝 Contributing

This project started from my own need for a simple writing tool, but I believe it can be better.

New features, bug fixes, UI improvements, language additions, and documentation improvements are all welcome:

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/AmazingFeature`
3. Commit your changes: `git commit -m 'Add some AmazingFeature'`
4. Push to the branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

You are free to use, modify, and distribute. For commercial use, please obtain authorization. I only hope that one quiet afternoon, when you write something you are truly satisfied with, you might remember where this little tool began.

---

## 👤 About the Author

**Leng Yi (冷逸)**, founder of Chinese top AI media "**沃垠AI**", a Vibe Coding developer who can’t really code but loves to dive deep into Prompts, Skills, and Agents.

- **Unified account across platforms**: 沃垠AI
- **Content matrix**: WeChat Official Account, Xiaohongshu, Zhihu, GitHub, Bilibili, X, etc.


---

<div align="center">

### If this helps you, please give it a ⭐.

**Writing well is what matters most.**

</div>
