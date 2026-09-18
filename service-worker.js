"use strict";

const CACHE_NAME = "pure-invisibility-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

let isolationActive = false;
let isolationExpiresAt = 0;

function isIsolationActive() {
  if (isolationActive && isolationExpiresAt && Date.now() >= isolationExpiresAt) {
    isolationActive = false;
    isolationExpiresAt = 0;
  }
  return isolationActive;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_ISOLATION") {
    isolationActive = Boolean(event.data.active);
    isolationExpiresAt = Number(event.data.expiresAt) || 0;
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    if (isIsolationActive()) event.respondWith(new Response("Blocked by Pure Invisibility internal isolation", { status: 423 }));
    return;
  }

  const url = new URL(event.request.url);
  const syntheticTest = url.pathname.endsWith("/__pure-invisibility-network-test__");
  if (syntheticTest) {
    const body = isIsolationActive()
      ? { status: "ISOLATION ACTIVE", message: "The Service Worker blocked this PWA's synthetic network action." }
      : { status: "NORMAL MODE", message: "Internal requests are available. This response was generated locally by the Service Worker." };
    event.respondWith(new Response(JSON.stringify(body), { status: isIsolationActive() ? 423 : 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
    return;
  }

  if (isIsolationActive()) {
    if (url.origin !== self.location.origin) {
      event.respondWith(new Response("External request blocked during Pure Invisibility session", { status: 423 }));
      return;
    }
    event.respondWith(caches.match(event.request).then((cached) => cached || caches.match("./index.html")));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match("./index.html")))
    );
  }
});
