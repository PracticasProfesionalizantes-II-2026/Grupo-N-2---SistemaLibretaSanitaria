/**
 * Service Worker de PetCloud.
 *
 * Existe por un solo motivo: Chrome/Android exige uno registrado, con un
 * manejador de `fetch`, para considerar el sitio instalable. No es una capa
 * de cacheo general — cachear de más es exactamente el riesgo que hay que
 * evitar acá (ver más abajo).
 *
 * Solo intercepta navegaciones (`request.mode === "navigate"`, es decir,
 * cuando el navegador pide una página HTML completa). Todo lo demás —RSC
 * payloads, Server Actions, las rutas de API, imágenes, JS/CSS— pasa
 * derecho a la red sin que este archivo lo toque ni lo guarde: ninguna
 * sesión, ninguna mascota, ningún dato de dueño o de veterinaria pasa nunca
 * por acá.
 *
 * Para las navegaciones, es network-first: intenta la red primero (para no
 * mostrar nunca una versión vieja de una pantalla que sí puede tener datos
 * de sesión), y solo si la red falla —sin conexión— cae al shell público
 * guardado en el `install`. Ese shell es `/`, la home de marketing: es
 * exactamente la misma página para cualquiera, sin sesión ni datos
 * personales, así que guardarla no expone nada.
 */

const CACHE_VERSION = "petcloud-shell-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Si el shell público no se pudo guardar (por ejemplo, sin red al
      // instalar), no tiene sentido que eso bloquee la instalación del
      // service worker en sí — simplemente no habrá fallback offline hasta
      // la próxima vez que ande la red.
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const shell = await caches.match("/");
      return shell ?? Response.error();
    }),
  );
});
