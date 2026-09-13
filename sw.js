/* 港式粵語 · 每日一課 —— Service Worker
 * 缓存策略：核心资源 install 时预缓存；运行期网络优先、失败回退缓存。
 * 用于支持添加到主屏幕后的离线使用（华为手机浏览器 / HTTPS 环境）。
 */
const CACHE = "cantonese-daily-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/styles.css",
  "./assets/data.js",
  "./assets/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});