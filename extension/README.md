# Lengyi Markdown — Chrome / Edge browser extension

Manifest V3 extension using browser-managed HTTP(S) permissions and real tabs.
**No local HTTP server, Python, Node.js, cscript, DLL, PowerShell or npm runtime.**
It works alongside the existing standalone `markdown-editor.html` (the editor is
**not** itself an extension page, so its existing CDN libraries remain compatible
with Manifest V3's remote-code restrictions).

## Install

1. Chrome: `chrome://extensions`; Edge: `edge://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select this `extension/` folder.
3. Open `markdown-editor.html`. For a local `file://` editor, enable
   **Allow access to file URLs** on the extension's details page, then reload.
   Alternatively, serve the existing HTML at `http://localhost:8080/markdown-editor.html`
   (this preview server is optional; there is **no** port 8765 capture service).
4. **Web to MD** → enter an HTTP(S) URL → select **Render in browser** or
   **Fetch raw HTML** → **Fetch** → **Convert & Insert**.

Content scripts are installed only on `file:///*`, `http://localhost/*`,
`http://127.0.0.1/*` and `https://rarnhe.github.io/*`, and do nothing unless
the document ends in `/markdown-editor.html` and contains the editor DOM.
If hosted elsewhere, explicitly add the trusted editor origin to
`content_scripts.matches` and reload the extension. Do **not** use `<all_urls>`
for the editor message bridge.

## Modes

- **Browser render (default)**: opens a visible target tab and waits for article
  DOM to settle. Runs an extension-owned extractor via `chrome.scripting.executeScript`
  in its isolated world. Leaves the target tab open so you can log in or complete
  interactive checks, then try again. It cannot bypass login/CAPTCHA.
- **Static HTML**: the extension service worker calls `fetch()`, using the
  extension host permission rather than any public CORS proxy. Does not include
  session cookies and does not execute target JavaScript.

Extracted HTML is returned only to the requesting editor tab through a
content-script `window.postMessage` bridge. The extension does not store
article content, export cookies, or send articles to a third-party proxy.
Existing HTML→Markdown and manual HTML fallback remain in the editor.

## Permissions and boundaries

The extension requests `tabs`, `scripting` and access to all HTTP(S) origins
because arbitrary article sites are user-provided. Review the browser's
permission warning before installation. No extension ID, native messaging,
backend service or external connection URL is required.

The target URL validator rejects obvious localhost, reserved names, nonstandard
ports and common private IP ranges, but this does not substitute for DNS-level
SSRF hardening or content trust. Do not install from unknown sources.
Remote HTML is never evaluated by the extension's service worker.
The editor retains its existing CDN-based rendering libraries because it runs
as a normal page, **not** as a Manifest V3 extension page.

## Tests

From repository root (Node.js is used only for test tooling):
```sh
node tests/run_tests.mjs
```
Windows/macOS/Linux browsers all support Manifest V3, but full real-site
behavior depends on each site's login, anti-bot and browser policies.
