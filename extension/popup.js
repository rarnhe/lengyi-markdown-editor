// Local diagnostic UI only: inspect the current active tab and file:// permission.
// No network requests, no page text collection, and no changes to browser settings.
(async function diagnose() {
  const status = document.getElementById("status");
  const details = document.getElementById("details");
  function show(title, detail) {
    status.textContent = title;
    details.textContent = detail;
  }
  try {
    const tabs = await chrome.tabs.query({active:true,currentWindow:true});
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      show("未识别当前页面", "请切换到 markdown-editor.html 后重新打开扩展图标。");
      return;
    }
    let url;
    try { url = new URL(tab.url); }
    catch { show("当前标签页不是编辑器", "请打开 markdown-editor.html。"); return; }
    if (!/\/markdown-editor\.html$/i.test(url.pathname)) {
      show("当前标签页不是编辑器", "请打开 markdown-editor.html，然后在同一浏览器中重新点击扩展图标。");
      return;
    }
    const supported = url.protocol === "file:" ||
      (url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname)) ||
      (url.protocol === "https:" && url.hostname === "rarnhe.github.io");
    if (!supported) {
      show("编辑器地址未被扩展授权",
        "当前页面来源不在 manifest.json 的 content_scripts.matches 中。请添加受信任来源并重新加载扩展。");
      return;
    }
    if (url.protocol === "file:") {
      const allowed = await new Promise(resolve =>
        chrome.extension.isAllowedFileSchemeAccess(resolve));
      if (!allowed) {
        show("尚未允许访问本地文件",
          "打开扩展管理页 → 当前扩展详情 → 开启「允许访问文件网址」，再刷新编辑器。");
        return;
      }
    }
    try {
      const injected = await chrome.scripting.executeScript({
        target:{tabId:tab.id},
        func:()=>Boolean(document.documentElement &&
          document.documentElement.hasAttribute("data-lengyi-extension-ready"))
      });
      if (!injected || !injected[0] || !injected[0].result) {
        show("扩展已安装，但桥接脚本未注入",
          "请确保网站访问权限未被限制，然后刷新编辑器。扩展更新后也必须刷新原页面。");
      } else {
        show("扩展桥接已注入编辑器",
          "现在可以在编辑器中点击「网页转 MD」。若仍提示通信失败，请打开 F12 控制台查看错误。");
      }
    } catch (error) {
      show("无法检查编辑器注入状态",
        "请检查扩展的网站访问权限和文件网址权限，并刷新编辑器。" +
        (error && error.message ? " (" + error.message + ")" : ""));
    }
  } catch (error) {
    show("连接诊断失败",
      "请检查扩展是否启用，或重新加载扩展并刷新编辑器。" +
      (error && error.message ? " (" + error.message + ")" : ""));
  }
})();
