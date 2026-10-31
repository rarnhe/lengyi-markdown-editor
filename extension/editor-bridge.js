/* Isolated content script on the trusted Markdown editor page.
 * file:// requires "Allow access to file URLs" in Chrome/Edge extension details.
 */
(() => {
  "use strict";
  const CHANNEL = "lengyi-extension-v1";
  if (!/\/markdown-editor\.html$/i.test(location.pathname) ||
      !document.getElementById("editor") || !document.getElementById("url-modal")) return;
  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.channel !== CHANNEL ||
        event.data.from !== "editor" || typeof event.data.requestId !== "string" ||
        event.data.requestId.length > 120) return;
    const { command, requestId, payload } = event.data;
    const reply = result => {
      window.postMessage({channel:CHANNEL,from:"extension",requestId,...result}, "*");
    };
    if (command === "PING") {
      reply({success:true, installed:true});
      return;
    }
    if (command !== "FETCH" || !payload || typeof payload.url !== "string" ||
        !["browser","static"].includes(payload.mode)) return;
    chrome.runtime.sendMessage({
      channel:CHANNEL,type:"FETCH",requestId,url:payload.url,mode:payload.mode
    }).then(reply).catch(error => {
      reply({success:false,error:String(error && error.message || error)});
    });
  });
})();
