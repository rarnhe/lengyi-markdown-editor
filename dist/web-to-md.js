"use strict";
(function() {
  function jsonParse(source) {
    var index = 0;
    function spaces() {
      while (index < source.length && /\s/.test(source.charAt(index)))
        index++;
    }
    function fail() {
      throw new Error("Invalid JSON at character " + index);
    }
    function str() {
      if (source.charAt(index) !== '"')
        fail();
      index++;
      var out = "";
      while (index < source.length) {
        var c = source.charAt(index++);
        if (c === '"')
          return out;
        if (c === "\\") {
          if (index >= source.length)
            fail();
          c = source.charAt(index++);
          if (c === "u") {
            var digits = source.substr(index, 4);
            if (!/^[0-9a-fA-F]{4}$/.test(digits))
              fail();
            out += String.fromCharCode(parseInt(digits, 16));
            index += 4;
          } else {
            var escapes = {
              '"': '"',
              "\\": "\\",
              "/": "/",
              b: "\b",
              f: "\f",
              n: "\n",
              r: "\r",
              t: "	"
            };
            if (!Object.prototype.hasOwnProperty.call(escapes, c))
              fail();
            out += escapes[c];
          }
        } else {
          if (c.charCodeAt(0) < 32)
            fail();
          out += c;
        }
      }
      return fail();
    }
    function value() {
      spaces();
      var c = source.charAt(index);
      if (c === '"')
        return str();
      if (c === "{") {
        index++;
        spaces();
        var obj = {};
        if (source.charAt(index) === "}") {
          index++;
          return obj;
        }
        while (true) {
          spaces();
          var key = str();
          if (key === "__proto__" || key === "constructor" || key === "prototype")
            fail();
          spaces();
          if (source.charAt(index++) !== ":")
            fail();
          obj[key] = value();
          spaces();
          if (source.charAt(index) === "}") {
            index++;
            return obj;
          }
          if (source.charAt(index++) !== ",")
            fail();
        }
      }
      if (c === "[") {
        index++;
        spaces();
        var arr = [];
        if (source.charAt(index) === "]") {
          index++;
          return arr;
        }
        while (true) {
          arr.push(value());
          spaces();
          if (source.charAt(index) === "]") {
            index++;
            return arr;
          }
          if (source.charAt(index++) !== ",")
            fail();
        }
      }
      var literal;
      if (source.substr(index, 4) === "true") {
        index += 4;
        return true;
      }
      if (source.substr(index, 5) === "false") {
        index += 5;
        return false;
      }
      if (source.substr(index, 4) === "null") {
        index += 4;
        return null;
      }
      var match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.substr(index));
      if (!match)
        fail();
      index += match[0].length;
      var number = Number(match[0]);
      if (!isFinite(number))
        fail();
      return number;
    }
    var result = value();
    spaces();
    if (index !== source.length)
      fail();
    return result;
  }
  function jsonStringify(input) {
    function quote(s) {
      return '"' + s.replace(/[\u0000-\u001f\\"]/g, function(c) {
        var replacements = {
          '"': '\\"',
          "\\": "\\\\",
          "\b": "\\b",
          "\f": "\\f",
          "\n": "\\n",
          "\r": "\\r",
          "	": "\\t"
        };
        if (Object.prototype.hasOwnProperty.call(replacements, c))
          return replacements[c];
        var hex = c.charCodeAt(0).toString(16);
        return "\\u" + ("0000" + hex).slice(-4);
      }) + '"';
    }
    function encode(v, depth) {
      if (depth > 30)
        throw new Error("JSON nesting too deep");
      if (v === null)
        return "null";
      if (typeof v === "string")
        return quote(v);
      if (typeof v === "boolean")
        return v ? "true" : "false";
      if (typeof v === "number")
        return isFinite(v) ? String(v) : "null";
      if (Object.prototype.toString.call(v) === "[object Array]") {
        var elements = [];
        for (var j = 0; j < v.length; j++)
          elements.push(encode(v[j], depth + 1));
        return "[" + elements.join(",") + "]";
      }
      if (typeof v === "object") {
        var keys = [];
        var key;
        for (key in v) {
          if (Object.prototype.hasOwnProperty.call(v, key) && v[key] !== void 0) {
            keys.push(quote(key) + ":" + encode(v[key], depth + 1));
          }
        }
        return "{" + keys.join(",") + "}";
      }
      throw new Error("Unsupported JSON value");
    }
    return encode(input, 0);
  }
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var shell = new ActiveXObject("WScript.Shell");
  var ROOT = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName));
  var QUEUE = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), "lengyi-md-proxy");
  var SERVICE_PORT = 8765;
  var DRIVER_PORT = 9515;
  function joinPath(a, b) {
    return fso.BuildPath(a, b);
  }
  function ensureFolder(p) {
    if (!fso.FolderExists(p))
      fso.CreateFolder(p);
  }
  function utf8Read(p) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2;
    stream.Charset = "utf-8";
    stream.Open();
    try {
      stream.LoadFromFile(p);
      return String(stream.ReadText(-1));
    } finally {
      stream.Close();
    }
  }
  function utf8Write(p, value) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2;
    stream.Charset = "utf-8";
    stream.Open();
    try {
      stream.WriteText(value);
      stream.SaveToFile(p, 2);
    } finally {
      stream.Close();
    }
  }
  function checkUrl(raw) {
    if (!/^https?:\/\/[^\s]+$/i.test(raw) || raw.length > 4096 || /[\u0000-\u001f]/.test(raw))
      throw new Error("Invalid HTTP/HTTPS URL");
    var m = /^https?:\/\/([^\/?#]+)/i.exec(raw);
    if (!m)
      throw new Error("Invalid URL host");
    var authority = m[1].toLowerCase();
    if (authority.indexOf("@") >= 0 || authority.indexOf("\\") >= 0 || authority.indexOf("%") >= 0)
      throw new Error("Invalid URL authority");
    var hm = /^([a-z0-9][a-z0-9.-]*)(?::(80|443))?$/.exec(authority);
    if (!hm)
      throw new Error("Unsupported URL hostname or port");
    var host = hm[1];
    if (host.indexOf(".") < 0 || host.charAt(host.length - 1) === "." || /(^|\.)((localhost)|(local)|(internal)|(test)|(invalid))(\.|$)/.test(host) || /^\d+(\.\d+){3}$/.test(host) || /^0x/i.test(host)) {
      throw new Error("Private or untrusted hostname is blocked");
    }
    return raw;
  }
  function fetchRaw(url) {
    var current = checkUrl(url);
    var attempt;
    for (attempt = 0; attempt <= 2; attempt++) {
      try {
        var redirects;
        for (redirects = 0; redirects <= 5; redirects++) {
          var req = new ActiveXObject("WinHttp.WinHttpRequest.5.1");
          req.SetTimeouts(5e3, 5e3, 25e3, 25e3);
          req.Open("GET", current, false);
          req.SetRequestHeader("User-Agent", attempt % 2 === 0 ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0");
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
          var status = Number(req.Status);
          if (status >= 300 && status < 400) {
            var location = String(req.GetResponseHeader("Location"));
            if (location.indexOf("/") === 0 && location.indexOf("//") !== 0) {
              var base = /^(https?:\/\/[^\/]+)/i.exec(current);
              location = base ? base[1] + location : location;
            }
            current = checkUrl(location);
            continue;
          }
          if (status !== 200) {
            if (status === 401 || status === 403 || status === 404) {
              throw new Error("HTTP " + status + " (requires login or blocked)");
            }
            throw new Error("HTTP " + status);
          }
          var html = String(req.ResponseText);
          if (html.length > 8 * 1024 * 1024)
            throw new Error("HTML response too large");
          return html;
        }
        throw new Error("Too many redirects");
      } catch (e) {
        var message = String(e.message || e);
        if (attempt === 2 || /blocked|invalid|untrusted|too large|redirects|HTTP 40[134]/i.test(message))
          throw e;
        WScript.Sleep(1e3 * (attempt + 1));
      }
    }
    throw new Error("Fetch failed");
  }
  function driverRequest(method, endpoint, body) {
    var req = new ActiveXObject("MSXML2.ServerXMLHTTP.6.0");
    req.setTimeouts(5e3, 5e3, 25e3, 25e3);
    req.open(method, "http://127.0.0.1:" + DRIVER_PORT + endpoint, false);
    req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    req.send(body === null ? "" : jsonStringify(body));
    var response = jsonParse(String(req.responseText));
    if (req.status >= 400 || response.value && response.value.error) {
      throw new Error("WebDriver: " + (response.value ? response.value.message || response.value.error : req.status));
    }
    return response;
  }
  function driverEval(id, script) {
    return driverRequest("POST", "/session/" + id + "/execute/sync", {
      script: script,
      args: []
    }).value;
  }
  function browserHtml(url) {
    checkUrl(url);
    var driverName = shell.ExpandEnvironmentStrings("%MD_EDITOR_WEBDRIVER%");
    if (!driverName || driverName === "%MD_EDITOR_WEBDRIVER%")
      driverName = "msedgedriver.exe";
    var proc = shell.Exec('"' + driverName + '" --port=' + DRIVER_PORT);
    var session = "";
    try {
      var ready = false;
      var i;
      for (i = 0; i < 40; i++) {
        WScript.Sleep(250);
        try {
          var probe = driverRequest("GET", "/status", null);
          if (probe.value && probe.value.ready) {
            ready = true;
            break;
          }
        } catch (ignore) {
        }
      }
      if (!ready)
        throw new Error("WebDriver did not become ready");
      var profile = joinPath(QUEUE, "edge-profile");
      ensureFolder(profile);
      var created = driverRequest("POST", "/session", {
        capabilities: { alwaysMatch: {
          browserName: "MicrosoftEdge",
          "ms:edgeOptions": { args: ["--user-data-dir=" + profile] }
        } }
      });
      session = String(created.value.sessionId || created.sessionId);
      if (!session || session === "undefined")
        throw new Error("Missing WebDriver session ID");
      driverRequest("POST", "/session/" + session + "/url", { url: url });
      var previous = 0;
      var stable = 0;
      for (i = 0; i < 75; i++) {
        WScript.Sleep(400);
        var size = Number(driverEval(session, "return document.body ? document.body.innerText.length : 0;"));
        if (size > 100 && size === previous)
          stable++;
        else
          stable = 0;
        previous = size;
        if (stable >= 3)
          break;
      }
      var html = String(driverEval(session, "return document.documentElement.outerHTML;"));
      if (html.length > 8 * 1024 * 1024)
        throw new Error("Rendered HTML too large");
      return html;
    } finally {
      if (session) {
        try {
          driverRequest("DELETE", "/session/" + session, null);
        } catch (ignore) {
        }
      }
      try {
        proc.Terminate();
      } catch (ignore) {
      }
    }
  }
  function fetchTarget(url, mode) {
    if (mode === "browser")
      return browserHtml(url);
    if (mode !== "static")
      throw new Error("Unsupported mode");
    return fetchRaw(url);
  }
  function processQueue() {
    var folder = fso.GetFolder(QUEUE);
    var entries = new Enumerator(folder.Files);
    for (; !entries.atEnd(); entries.moveNext()) {
      var file = entries.item();
      var name = String(file.Name);
      if (!/^[0-9a-f-]{36}\.req$/i.test(name))
        continue;
      var requestPath = joinPath(QUEUE, name);
      var responsePath = joinPath(QUEUE, name.replace(/\.req$/i, ".res"));
      var data;
      try {
        data = jsonParse(utf8Read(requestPath));
        var html = fetchTarget(String(data.url), String(data.mode || "static"));
        utf8Write(responsePath, jsonStringify({ success: true, html: html, length: html.length }));
      } catch (e) {
        var error = String(e.message || e);
        utf8Write(responsePath, jsonStringify({
          success: false,
          error: error,
          hint: "For login-required or dynamically rendered pages, use browser mode with Edge WebDriver."
        }));
      }
      try {
        fso.DeleteFile(requestPath, true);
      } catch (ignore) {
      }
    }
  }
  function serve() {
    ensureFolder(QUEUE);
    var bridge = joinPath(ROOT, "scripts\\wsh-http-bridge.ps1");
    if (!fso.FileExists(bridge))
      throw new Error("HTTP bridge script not found");
    var command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + bridge + '" -QueueDir "' + QUEUE + '" -Port ' + SERVICE_PORT;
    shell.Run(command, 0, false);
    WScript.Echo("WSH proxy: http://127.0.0.1:" + SERVICE_PORT + "/fetch");
    while (true) {
      utf8Write(joinPath(QUEUE, "heartbeat"), String((/* @__PURE__ */ new Date()).getTime()));
      processQueue();
      WScript.Sleep(200);
    }
  }
  function selfTest() {
    ensureFolder(QUEUE);
    var sample = joinPath(QUEUE, "wsh-self-test.txt");
    utf8Write(sample, "JScript COM test");
    if (utf8Read(sample).replace(/^\uFEFF/, "") !== "JScript COM test") {
      throw new Error("UTF-8 COM file round-trip failed");
    }
    fso.DeleteFile(sample, true);
    if (jsonParse('{"ok":true}').ok !== true)
      throw new Error("Native JSON missing");
    var client = new ActiveXObject("MSXML2.ServerXMLHTTP.6.0");
    if (!client)
      throw new Error("HTTP COM client unavailable");
    var blocked = false;
    try {
      checkUrl("http://127.0.0.1:8765/secret");
    } catch (e) {
      blocked = true;
    }
    if (!blocked)
      throw new Error("Loopback URL should be blocked");
    checkUrl("https://example.com/article");
    WScript.Echo("WSH_SELF_TEST_OK");
  }
  function bookmark() {
    var js = "javascript:(function(){var n=document.querySelector('article,main')||document.body;var t=(document.title||'')+'\\n\\n'+n.innerText;if(navigator.clipboard){navigator.clipboard.writeText(t).catch(function(){prompt('Copy text',t);});}else{prompt('Copy text',t);}})();";
    WScript.Echo(js);
  }
  function main() {
    var arg = WScript.Arguments.length ? String(WScript.Arguments.Item(0)) : "--serve";
    if (arg === "--self-test") {
      selfTest();
      return;
    }
    if (arg === "--bookmark") {
      bookmark();
      return;
    }
    if (arg === "--once") {
      if (WScript.Arguments.length < 2)
        throw new Error("Usage: --once URL [static|browser]");
      var url = String(WScript.Arguments.Item(1));
      var mode = WScript.Arguments.length > 2 ? String(WScript.Arguments.Item(2)) : "static";
      WScript.Echo(fetchTarget(url, mode));
      return;
    }
    if (arg === "--serve") {
      serve();
      return;
    }
    throw new Error("Unknown argument: " + arg);
  }
  try {
    main();
  } catch (e) {
    WScript.Echo("WSH_ERROR: " + String(e.message || e));
    WScript.Quit(1);
  }
})();
