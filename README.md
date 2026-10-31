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
- **Preview filename and footer status**: the editable filename is centered in the preview header and displays in black in the light theme (contrasting text in dark mode). The footer shows the visible-bottom reading progress (100% at bottom), rendered word count, and full selected language name (e.g., 简体中文). The browser tab shows `filename-imported time` for imported Markdown, or `filename-opened time` otherwise; saving does not change it.
- **Base64 folding**: the Show/Hide Base64 button appears and is enabled only if the Markdown contains an embedded Base64 image; it disappears again when the image is removed, without affecting the preview.
- **Draggable split and independent scrolling**: resize the panes while keeping each pane's scroll position independent. Outline clicks align both panes' headings to the top in **folded and expanded Base64 modes**. The expanded mode measures exact native textarea line wraps to avoid drift after multiple embedded images. Collapsing the editor hides its scrollable textarea completely, just as collapsing the outline hides its list. Mouse-wheel, trackpad, and direct scrollbar dragging all mirror the movement to the other pane. The amount is scaled by each pane's remaining distance to the top or bottom, so both can reach that edge together while retaining independent intermediate positions; selecting an outline heading aligns both headings to the top.

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

- Auto-saves content to browser `localStorage` every 500ms. When the editor has keyboard focus, Ctrl/Cmd+S downloads the current Markdown; outside the editor this shortcut is not intercepted. Browser download settings decide how to handle a duplicate filename or Save As prompt; automatic overwriting is not guaranteed.
- Content, filename, split ratio, collapsed states, theme, and language all survive page refresh.

### 📤 Multi-Format Export

| Format | Description |
|--------|-------------|
| `.md` | Raw Markdown file |
| `.html` | Standalone HTML file |
| `.doc` | Word document (opens directly in Office) |
| `.pdf` | Browser print-to-PDF |
| `.png` | Long-image export with 9:16, 4:5, 3:4, 1:1, 16:9 ratios for social sharing |

### ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + S` / `Cmd + S` | Download the current Markdown file while focused in the editor (same filename; browser controls overwrite/renaming) |
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
- **Web-to-Markdown extension**: optional Chrome/Edge Manifest V3 extension; no local fetch server, Python or Node.js runtime

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
├── extension/             # Optional Chrome/Edge MV3 extension, no local fetch server
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

### Option 2: Browser extension (Web to Markdown)

No local HTTP fetch server, Python, Node.js, cscript or PowerShell is required.

1. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
2. **Load unpacked** and select the repository's `extension` folder.
3. If opening `markdown-editor.html` as a local `file://` page, enable
   **Allow access to file URLs** for the extension, then reload the editor.
4. In **Web to MD**, enter the URL and choose **Render in browser** (JavaScript and
   login-aware) or **Fetch raw HTML** (static pages). Click Fetch then Convert & Insert.

The editor can also be served using a web preview server like
`http://localhost:8080/markdown-editor.html`; this is optional and is **not**
a fetch proxy. The extension editor bridge is limited to `file://`,
`http://localhost`, `http://127.0.0.1`, and `https://rarnhe.github.io`.
For other editor hosts, update `extension/manifest.json` accordingly.

Browser mode opens a new visible tab, waits for rendering, and captures the article.
If login or CAPTCHA is required, complete it in the new tab and retry.
Static mode uses extension-side `fetch` without authentication cookies.
The extension requests access to HTTP(S) sites and does not circumvent authentication,
CAPTCHA or site policies. No content is sent to public CORS proxy services.
### Troubleshooting extension connectivity

When "extension not connected" is shown, keep the editor tab active and click
the Lengyi extension toolbar icon. The popup diagnoses the current URL,
`file://` access and whether the bridge script was injected. Make sure the
editor and extension are in the **same browser profile**, check site access,
then reload the extension and **refresh the editor**. Messages from privileged
extension worlds may have a null source; the new bridge accepts these while
checking origin and request correlation. Missing injection and bridge timeouts
now produce different messages.

Without the extension, the editor's manual HTML paste and Markdown tools still work.

Run checks using only built-in Node.js test tools (for development, not runtime):

```bash
node tests/run_tests.mjs
```

See [extension/README.md](extension/README.md) for installation and security notes.

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
