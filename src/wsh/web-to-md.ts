/* Windows Script Host implementation. Compiled via tsc ES5 -> esbuild ES5.
 * Runtime: cscript.exe + Windows COM only (plus optional PowerShell HTTP listener
 * and msedgedriver.exe for browser rendering); Node.js is BUILD-TIME only.
 */
declare var WScript: any;
declare var ActiveXObject: any;
declare var Enumerator: any;

var fso: any = new ActiveXObject("Scripting.FileSystemObject");
var shell: any = new ActiveXObject("WScript.Shell");
var ROOT: string = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName));
var QUEUE: string = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), "lengyi-md-proxy");
var SERVICE_PORT: number = 8765;
var DRIVER_PORT: number = 9515;

function joinPath(a: string, b: string): string { return fso.BuildPath(a, b); }
function ensureFolder(p: string): void { if (!fso.FolderExists(p)) fso.CreateFolder(p); }
function utf8Read(p: string): string {
  var stream: any = new ActiveXObject("ADODB.Stream");
  stream.Type = 2; stream.Charset = "utf-8"; stream.Open();
  try { stream.LoadFromFile(p); return String(stream.ReadText(-1)); }
  finally { stream.Close(); }
}
function utf8Write(p: string, value: string): void {
  var stream: any = new ActiveXObject("ADODB.Stream");
  stream.Type = 2; stream.Charset = "utf-8"; stream.Open();
  try { stream.WriteText(value); stream.SaveToFile(p, 2); }
  finally { stream.Close(); }
}
function checkUrl(raw: string): string {
  if (!/^https?:\/\/[^\s]+$/i.test(raw) || raw.length > 4096 ||
      /[\u0000-\u001f]/.test(raw)) throw new Error("Invalid HTTP/HTTPS URL");
  var m: RegExpExecArray | null = /^https?:\/\/([^\/?#]+)/i.exec(raw);
  if (!m) throw new Error("Invalid URL host");
  var authority: string = m[1].toLowerCase();
  if (authority.indexOf("@") >= 0 || authority.indexOf("\\") >= 0 ||
      authority.indexOf("%") >= 0) throw new Error("Invalid URL authority");
  // Accept normal DNS names only, and no non-default ports. Intentionally
  // reject numeric hosts to reduce local-network/metadata SSRF.
  var hm: RegExpExecArray | null = /^([a-z0-9][a-z0-9.-]*)(?::(80|443))?$/.exec(authority);
  if (!hm) throw new Error("Unsupported URL hostname or port");
  var host: string = hm[1];
  if (host.indexOf(".") < 0 || host.charAt(host.length - 1) === "." ||
      /(^|\.)((localhost)|(local)|(internal)|(test)|(invalid))(\.|$)/.test(host) ||
      /^\d+(\.\d+){3}$/.test(host) || /^0x/i.test(host)) {
    throw new Error("Private or untrusted hostname is blocked");
  }
  return raw;
}
function fetchRaw(url: string): string {
  var current: string = checkUrl(url);
  var attempt: number;
  for (attempt = 0; attempt <= 2; attempt++) {
    try {
      var redirects: number;
      for (redirects = 0; redirects <= 5; redirects++) {
        var req: any = new ActiveXObject("WinHttp.WinHttpRequest.5.1");
        req.SetTimeouts(5000, 5000, 25000, 25000);
        // WinHTTP can follow redirects automatically; never expose this helper outside loopback.
        req.Open("GET", current, false);
        req.SetRequestHeader("User-Agent",
          attempt % 2 === 0 ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" :
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0");
        req.SetRequestHeader("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
        req.SetRequestHeader("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
        if (/^https?:\/\/([^.\/]+\.)*zhihu\.com\//i.test(current)) {
          req.SetRequestHeader("Referer", "https://www.zhihu.com/");
        } else if (/^https?:\/\/([^.\/]+\.)*weixin\.qq\.com\//i.test(current)) {
          req.SetRequestHeader("Referer", "https://mp.weixin.qq.com/");
        } else if (/^https?:\/\/([^.\/]+\.)*jianshu\.com\//i.test(current)) {
          req.SetRequestHeader("Referer", "https://www.jianshu.com/");
        }
        req.Send();
        var status: number = Number(req.Status);
        if (status >= 300 && status < 400) {
          var location: string = String(req.GetResponseHeader("Location"));
          if (location.indexOf("/") === 0 && location.indexOf("//") !== 0) {
            var base: RegExpExecArray | null = /^(https?:\/\/[^\/]+)/i.exec(current);
            location = base ? base[1] + location : location;
          }
          current = checkUrl(location);
          continue;
        }
        if (status !== 200) {
          // Authentication and access-denied responses are not transient.
          if (status === 401 || status === 403 || status === 404) {
            throw new Error("HTTP " + status + " (requires login or blocked)");
          }
          throw new Error("HTTP " + status);
        }
        var html: string = String(req.ResponseText);
        if (html.length > 8 * 1024 * 1024) throw new Error("HTML response too large");
        return html;
      }
      throw new Error("Too many redirects");
    } catch (e) {
      var message: string = String((e as any).message || e);
      if (attempt === 2 || /blocked|invalid|untrusted|too large|redirects|HTTP 40[134]/i.test(message)) throw e;
      WScript.Sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Fetch failed");
}
function driverRequest(method: string, endpoint: string, body: any): any {
  var req: any = new ActiveXObject("MSXML2.ServerXMLHTTP.6.0");
  req.setTimeouts(5000, 5000, 25000, 25000);
  req.open(method, "http://127.0.0.1:" + DRIVER_PORT + endpoint, false);
  req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
  req.send(body === null ? "" : jsonStringify(body));
  var response: any = jsonParse(String(req.responseText));
  if (req.status >= 400 || (response.value && response.value.error)) {
    throw new Error("WebDriver: " + (response.value ? response.value.message || response.value.error : req.status));
  }
  return response;
}
function driverEval(id: string, script: string): any {
  return driverRequest("POST", "/session/" + id + "/execute/sync", {
    script: script, args: []
  }).value;
}
function browserHtml(url: string): string {
  checkUrl(url);
  var driverName: string = shell.ExpandEnvironmentStrings("%MD_EDITOR_WEBDRIVER%");
  if (!driverName || driverName === "%MD_EDITOR_WEBDRIVER%") driverName = "msedgedriver.exe";
  var proc: any = shell.Exec('"' + driverName + '" --port=' + DRIVER_PORT);
  var session: string = "";
  try {
    var ready: boolean = false;
    var i: number;
    for (i = 0; i < 40; i++) {
      WScript.Sleep(250);
      try {
        var probe: any = driverRequest("GET", "/status", null);
        if (probe.value && probe.value.ready) { ready = true; break; }
      } catch (ignore) {}
    }
    if (!ready) throw new Error("WebDriver did not become ready");
    // The dedicated browser profile may retain user login, not the regular
    // Edge profile. A user can log in manually in the opened browser window.
    var profile: string = joinPath(QUEUE, "edge-profile");
    ensureFolder(profile);
    var created: any = driverRequest("POST", "/session", {
      capabilities: { alwaysMatch: {
        browserName: "MicrosoftEdge",
        "ms:edgeOptions": { args: ["--user-data-dir=" + profile] }
      } }
    });
    session = String(created.value.sessionId || created.sessionId);
    if (!session || session === "undefined") throw new Error("Missing WebDriver session ID");
    driverRequest("POST", "/session/" + session + "/url", { url: url });
    var previous: number = 0;
    var stable: number = 0;
    for (i = 0; i < 75; i++) {
      WScript.Sleep(400);
      var size: number = Number(driverEval(session,
        "return document.body ? document.body.innerText.length : 0;"));
      if (size > 100 && size === previous) stable++; else stable = 0;
      previous = size;
      if (stable >= 3) break;
    }
    var html: string = String(driverEval(session, "return document.documentElement.outerHTML;"));
    if (html.length > 8 * 1024 * 1024) throw new Error("Rendered HTML too large");
    return html;
  } finally {
    if (session) {
      try { driverRequest("DELETE", "/session/" + session, null); } catch (ignore) {}
    }
    try { proc.Terminate(); } catch (ignore) {}
  }
}
function fetchTarget(url: string, mode: string): string {
  if (mode === "browser") return browserHtml(url);
  if (mode !== "static") throw new Error("Unsupported mode");
  return fetchRaw(url);
}
function processQueue(): void {
  var folder: any = fso.GetFolder(QUEUE);
  var entries: any = new Enumerator(folder.Files);
  for (; !entries.atEnd(); entries.moveNext()) {
    var file: any = entries.item();
    var name: string = String(file.Name);
    if (!/^[0-9a-f-]{36}\.req$/i.test(name)) continue;
    var requestPath: string = joinPath(QUEUE, name);
    var responsePath: string = joinPath(QUEUE, name.replace(/\.req$/i, ".res"));
    var data: any;
    try {
      data = jsonParse(utf8Read(requestPath));
      var html: string = fetchTarget(String(data.url), String(data.mode || "static"));
      utf8Write(responsePath, jsonStringify({ success: true, html: html, length: html.length }));
    } catch (e) {
      var error: string = String((e as any).message || e);
      utf8Write(responsePath, jsonStringify({ success: false, error: error,
        hint: "For login-required or dynamically rendered pages, use browser mode with Edge WebDriver." }));
    }
    try { fso.DeleteFile(requestPath, true); } catch (ignore) {}
  }
}
function serve(): void {
  ensureFolder(QUEUE);
  var bridge: string = joinPath(ROOT, "scripts\\wsh-http-bridge.ps1");
  if (!fso.FileExists(bridge)) throw new Error("HTTP bridge script not found");
  var command: string = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' +
    bridge + '" -QueueDir "' + QUEUE + '" -Port ' + SERVICE_PORT;
  shell.Run(command, 0, false);
  WScript.Echo("WSH proxy: http://127.0.0.1:" + SERVICE_PORT + "/fetch");
  while (true) {
    utf8Write(joinPath(QUEUE, "heartbeat"), String(new Date().getTime()));
    processQueue();
    WScript.Sleep(200);
  }
}
function selfTest(): void {
  ensureFolder(QUEUE);
  var sample: string = joinPath(QUEUE, "wsh-self-test.txt");
  utf8Write(sample, "JScript COM test");
  if (utf8Read(sample).replace(/^\uFEFF/, "") !== "JScript COM test") {
    throw new Error("UTF-8 COM file round-trip failed");
  }
  fso.DeleteFile(sample, true);
  if (jsonParse('{"ok":true}').ok !== true) throw new Error("Native JSON missing");
  var client: any = new ActiveXObject("MSXML2.ServerXMLHTTP.6.0");
  if (!client) throw new Error("HTTP COM client unavailable");
  var blocked: boolean = false;
  try { checkUrl("http://127.0.0.1:8765/secret"); }
  catch (e) { blocked = true; }
  if (!blocked) throw new Error("Loopback URL should be blocked");
  checkUrl("https://example.com/article");
  WScript.Echo("WSH_SELF_TEST_OK");
}
function bookmark(): void {
  var js: string = "javascript:(function(){var n=document.querySelector('article,main')||document.body;" +
    "var t=(document.title||'')+'\\n\\n'+n.innerText;" +
    "if(navigator.clipboard){navigator.clipboard.writeText(t).catch(function(){prompt('Copy text',t);});}" +
    "else{prompt('Copy text',t);}})();";
  WScript.Echo(js);
}
function main(): void {
  var arg: string = WScript.Arguments.length ? String(WScript.Arguments.Item(0)) : "--serve";
  if (arg === "--self-test") { selfTest(); return; }
  if (arg === "--bookmark") { bookmark(); return; }
  if (arg === "--once") {
    if (WScript.Arguments.length < 2) throw new Error("Usage: --once URL [static|browser]");
    var url: string = String(WScript.Arguments.Item(1));
    var mode: string = WScript.Arguments.length > 2 ? String(WScript.Arguments.Item(2)) : "static";
    WScript.Echo(fetchTarget(url, mode)); return;
  }
  if (arg === "--serve") { serve(); return; }
  throw new Error("Unknown argument: " + arg);
}
try { main(); } catch (e) {
  WScript.Echo("WSH_ERROR: " + String((e as any).message || e));
  WScript.Quit(1);
}
