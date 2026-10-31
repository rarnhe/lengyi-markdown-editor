/* Isolated content script on a trusted Lengyi editor page.
 * file:// requires explicitly granting the extension "Allow access to file URLs".
 * In extension contexts MessageEvent.source can be null; verify origin + protocol
 * rather than requiring source === window.
 */
(() => {
  "use strict";
  const CHANNEL = "lengyi-extension-v1";
  if (!/\/markdown-editor\.html$/i.test(location.pathname) ||
      !document.getElementById("editor") || !document.getElementById("url-modal")) return;

  // A DOM diagnostic marker is visible to the normal editor page even when
  // isolated worlds cannot exchange window.postMessage responses.
  document.documentElement.setAttribute("data-lengyi-extension-ready", "1");

  function isOwnPageMessage(event) {
    if (event.source !== null && event.source !== window) return false;
    if (location.protocol === "file:") return event.origin === "null" || event.origin === "file://";
    return event.origin === location.origin;
  }

  window.addEventListener("message", event => {
    if (!isOwnPageMessage(event) || !event.data || event.data.channel !== CHANNEL ||
        event.data.from !== "editor" || typeof event.data.requestId !== "string" ||
        event.data.requestId.length < 1 || event.data.requestId.length > 120) return;
    const { command, requestId, payload } = event.data;
    const reply = result => {
      window.postMessage({channel:CHANNEL,from:"extension",requestId,...result}, "*");
    };
    if (command === "PING") {
      reply({success:true,installed:true});
      return;
    }
    if (command !== "FETCH" || !payload || typeof payload.url !== "string" ||
        !["browser","existing","static"].includes(payload.mode)) return;
    chrome.runtime.sendMessage({
      channel:CHANNEL,type:"FETCH",requestId,url:payload.url,mode:payload.mode
    }).then(reply).catch(error => {
      reply({success:false,error:String(error && error.message || error)});
    });
  });
})();
