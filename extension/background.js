/* Manifest V3 service worker. No local HTTP listener, no npm, no remote code.
 * Broad HTTP(S) host permissions are needed to capture arbitrary article URLs.
 * Content scripts are limited to the trusted editor pages configured in manifest.
 */
const MESSAGE_CHANNEL = "lengyi-extension-v1";
const MAX_HTML = 4 * 1024 * 1024;
const EXTRACT_TIMEOUT = 30000;

// Track browser main-frame navigation errors: a tab marked "complete" may
// actually be a chrome-error:// page, where scripting cannot execute.
const navigationErrors = new Map();
chrome.webNavigation.onBeforeNavigate.addListener(info => {
  if (info.frameId === 0) navigationErrors.delete(info.tabId);
});
chrome.webNavigation.onErrorOccurred.addListener(info => {
  if (info.frameId === 0) navigationErrors.set(info.tabId, String(info.error || "unknown navigation error"));
});

function navigationFailure(url, detail) {
  const error = String(detail || "unknown network error");
  return new Error("目标网页无法在 Chrome/Edge 打开（" + error +
    "）。请先在同一浏览器手动打开该网址，检查 VPN/代理、DNS、HTTPS 证书或网址有效性；" +
    "确认网页能正常显示后可选择「提取已打开的网页」。");
}
function sameArticleUrl(a, b) {
  try {
    const left = new URL(a), right = new URL(b);
    left.hash = ""; right.hash = "";
    return left.href === right.href;
  } catch { return false; }
}


function isEditorSender(sender) {
  if (!sender || !sender.tab || sender.frameId !== 0 || typeof sender.url !== "string") return false;
  let address;
  try { address = new URL(sender.url); } catch { return false; }
  if (!/\/markdown-editor\.html$/i.test(address.pathname)) return false;
  if (address.protocol === "file:") return true; // Requires explicitly enabled file URL access.
  if (address.protocol === "http:" &&
      (address.hostname === "localhost" || address.hostname === "127.0.0.1")) return true;
  return address.protocol === "https:" && address.hostname === "rarnhe.github.io";
}

function validateTarget(raw) {
  if (typeof raw !== "string" || raw.length > 4096 || /[\u0000-\u001f]/.test(raw)) {
    throw new Error("Invalid URL");
  }
  let target;
  try { target = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("Only public HTTP/HTTPS URLs without credentials are allowed");
  }
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      /\.(local|internal|test|invalid)$/.test(host) || !host.includes(".")) {
    throw new Error("Local or reserved destination is blocked");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".").map(Number);
    const a = parts[0], b = parts[1];
    if (parts.some(x => x < 0 || x > 255) || a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      throw new Error("Private or special-use IP destinations are blocked");
    }
  }
  if (host.includes(":") && (!host.startsWith("2") && !host.startsWith("3") ||
      /^2001:db8:/i.test(host))) {
    throw new Error("Private or special-use IPv6 destinations are blocked");
  }
  if (target.port && !["80", "443"].includes(target.port)) {
    throw new Error("Only HTTP/HTTPS standard ports are allowed");
  }
  return target.href;
}

// Executed in the target webpage's isolated world by chrome.scripting.
// Do not reference surrounding service-worker variables or remote scripts.
async function extractRenderedHtml(maxChars) {
  const selectors = [
    "#js_content", ".rich_media_content", "article", '[role="main"]',
    ".post-content", ".entry-content", ".article-content", "main"
  ];
  const findArticle = () => selectors.map(s => document.querySelector(s)).find(Boolean) || document.body;
  let previous = -1, stable = 0;
  const start = Date.now();
  while (Date.now() - start < 16000) {
    const current = findArticle();
    const size = current ? (current.innerText || current.textContent || "").trim().length : 0;
    if (size > 100 && size === previous) stable++;
    else stable = 0;
    if (stable >= 3) break;
    previous = size;
    await new Promise(resolve => setTimeout(resolve, 450));
  }
  const article = findArticle();
  if (!article) throw new Error("Target page has no document body");
  const copy = article.cloneNode(true);
  copy.querySelectorAll(
    "script,style,noscript,nav,aside,footer,form,iframe,svg,video,audio,canvas," +
    ".ads,.advertisement,.sidebar,.comments,#comments"
  ).forEach(el => el.remove());

  // Use absolute URLs and avoid serializing executable attributes or protocols.
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attr.name);
      if (name === "href" || name === "src") {
        try {
          const resolved = new URL(attr.value, document.baseURI);
          if (!["http:", "https:", "mailto:"].includes(resolved.protocol)) element.removeAttribute(attr.name);
          else element.setAttribute(attr.name, resolved.href);
        } catch { element.removeAttribute(attr.name); }
      }
    }
  }
  const text = (copy.innerText || copy.textContent || "").trim();
  if (text.length < 30) throw new Error("Rendered page has too little article content; check login, CAPTCHA or page loading");
  const title = document.title || "";
  const author = document.querySelector('meta[name="author"],meta[property="article:author"]')?.content || "";
  const date = document.querySelector('meta[property="article:published_time"],meta[name="date"]')?.content || "";
  const esc = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const html = "<!doctype html><html><head><title>" + esc(title) + "</title>" +
    '<meta name="author" content="' + esc(author) + '">' +
    '<meta property="article:published_time" content="' + esc(date) + '">' +
    "</head><body>" + copy.outerHTML + "</body></html>";
  if (html.length > maxChars) throw new Error("Extracted HTML exceeds 4 MB limit");
  return { success:true, html, title, finalUrl:location.href, mode:"browser" };
}

function waitForTabReady(tabId, targetUrl, timeout = 25000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdate);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (error) reject(error); else resolve();
    };
    const check = async () => {
      if (navigationErrors.has(tabId)) {
        finish(navigationFailure(targetUrl, navigationErrors.get(tabId)));
        return;
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        if (navigationErrors.has(tabId)) {
          finish(navigationFailure(targetUrl, navigationErrors.get(tabId)));
        } else if (tab.status === "complete") {
          finish();
        }
      } catch (error) { finish(error); }
    };
    const onUpdate = (id, change) => {
      if (id === tabId && change.status === "complete") void check();
    };
    const onRemoved = id => {
      if (id === tabId) finish(new Error("目标标签页已关闭"));
    };
    const timer = setTimeout(() => finish(navigationFailure(targetUrl, "页面加载超时")), timeout);
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void check();
  });
}

async function captureTab(tab, url) {
  if (navigationErrors.has(tab.id)) {
    throw navigationFailure(url, navigationErrors.get(tab.id));
  }
  try {
    const results = await chrome.scripting.executeScript({
      target:{tabId:tab.id}, func:extractRenderedHtml, args:[MAX_HTML]
    });
    if (!results.length || !results[0].result || !results[0].result.html) {
      throw new Error("目标页面未提取到有效正文，请检查网站是否需要登录或验证码");
    }
    return results[0].result;
  } catch (error) {
    const message = String(error && error.message || error);
    if (navigationErrors.has(tab.id)) {
      throw navigationFailure(url, navigationErrors.get(tab.id));
    }
    if (/showing error page|chrome-error|cannot access contents of (?:the )?page|cannot access a chrome/i.test(message)) {
      throw navigationFailure(url, message);
    }
    throw error;
  }
}

async function browserFetch(url, reuseOnly) {
  // Prefer an existing, fully loaded tab for this exact URL: this preserves
  // the user's browser session and avoids navigating through a broken VPN.
  const tabs = await chrome.tabs.query({});
  const matching = tabs.find(tab => tab.id >= 0 && tab.status === "complete" &&
    typeof tab.url === "string" && sameArticleUrl(tab.url, url) &&
    !navigationErrors.has(tab.id));
  if (matching) return captureTab(matching, url);
  if (reuseOnly) {
    throw new Error("尚未找到已打开且加载完成的对应网页。请在同一浏览器中手动打开准确的网址并等待加载完成，再重试「提取已打开的网页」。");
  }
  // Leave new tabs visible on both success and failure so that connection
  // errors, login prompts and CAPTCHA are not hidden from the user.
  const tab = await chrome.tabs.create({url, active:true});
  await waitForTabReady(tab.id, url);
  return captureTab(tab, url);
}

async function staticFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT);
  try {
    const res = await fetch(url, { credentials:"omit", redirect:"follow", signal:controller.signal });
    if (!res.ok) throw new Error("Target server HTTP " + res.status);
    const type = res.headers.get("content-type") || "";
    if (type && !/html|text\/plain/i.test(type)) throw new Error("Target did not return HTML");
    const length = Number(res.headers.get("content-length"));
    if (length > MAX_HTML) throw new Error("HTML response exceeds 4 MB limit");
    const html = await res.text();
    if (html.length > MAX_HTML) throw new Error("HTML response exceeds 4 MB limit");
    if (html.trim().length < 30) throw new Error("HTML response is empty");
    return { success:true, html, finalUrl:res.url, mode:"static" };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!isEditorSender(sender) || !message || message.channel !== MESSAGE_CHANNEL ||
      message.type !== "FETCH" || typeof message.requestId !== "string") return false;
  Promise.resolve().then(async () => {
    const url = validateTarget(message.url);
    if (!["browser", "existing", "static"].includes(message.mode)) throw new Error("Unsupported fetch mode");
    return message.mode === "static" ? await staticFetch(url) :
      await browserFetch(url, message.mode === "existing");
  }).then(result => respond(result)).catch(error => {
    respond({success:false,error:String(error && error.message || error)});
  });
  return true;
});
