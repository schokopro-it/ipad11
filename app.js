import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

/*
 * PDF Kiosk pour iPad
 * - zéro barre / zéro bouton pendant la présentation
 * - swipe horizontal pour changer de page
 * - liens internes du PDF cliquables
 * - cache PWA pour utilisation hors ligne
 *
 * Sécurité kiosque : les liens web externes sont désactivés par défaut, car ils
 * pourraient faire sortir l'utilisateur de la présentation. Passe cette valeur à
 * true uniquement si tu veux autoriser l'ouverture de sites web.
 */
const ALLOW_EXTERNAL_LINKS = false;

const PDF_URL = "./deck.pdf";

const els = {
  stage: document.getElementById("stage"),
  pageWrap: document.getElementById("page-wrap"),
  canvas: document.getElementById("canvas"),
  linkLayer: document.getElementById("link-layer"),
  loader: document.getElementById("loader"),
  loaderText: document.getElementById("loader-text"),
  error: document.getElementById("error"),
  errorText: document.getElementById("error-text"),
  retry: document.getElementById("retry"),
};

const ctx = els.canvas.getContext("2d", { alpha: false });

let pdfDoc = null;
let pageCount = 0;
let current = 1;
let renderToken = 0;
let renderTask = null;
let suppressClickUntil = 0;
const pageCache = new Map();

function clampDpr() {
  return Math.min(window.devicePixelRatio || 1, 2.5);
}

function pageFromHash() {
  const n = parseInt((location.hash || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function updateHash(n) {
  const target = "#" + n;
  if (location.hash !== target) history.replaceState(null, "", target);
}

async function getPage(num) {
  if (pageCache.has(num)) return pageCache.get(num);
  const page = await pdfDoc.getPage(num);
  pageCache.set(num, page);
  return page;
}

function clearLinks() {
  els.linkLayer.replaceChildren();
}

function normalizeRect(rect) {
  const x = Math.min(rect[0], rect[2]);
  const y = Math.min(rect[1], rect[3]);
  const w = Math.abs(rect[2] - rect[0]);
  const h = Math.abs(rect[3] - rect[1]);
  return { x, y, w, h };
}

async function destinationToPage(dest) {
  try {
    let explicitDest = dest;
    if (typeof dest === "string") explicitDest = await pdfDoc.getDestination(dest);
    if (!Array.isArray(explicitDest) || explicitDest.length === 0) return null;

    const ref = explicitDest[0];
    if (typeof ref === "number" && Number.isFinite(ref)) return ref + 1;
    if (ref && typeof ref === "object") {
      const index = await pdfDoc.getPageIndex(ref);
      return index + 1;
    }
  } catch (e) {
    console.warn("Destination PDF non résolue", e);
  }
  return null;
}

function handleNamedAction(action) {
  switch (action) {
    case "NextPage":
      goTo(current + 1);
      return true;
    case "PrevPage":
      goTo(current - 1);
      return true;
    case "FirstPage":
      goTo(1);
      return true;
    case "LastPage":
      goTo(pageCount);
      return true;
    case "GoBack":
      history.back();
      return true;
    case "GoForward":
      history.forward();
      return true;
    default:
      return false;
  }
}

function safeExternalUrl(raw) {
  try {
    const url = new URL(raw, location.href);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return url.href;
  } catch {}
  return null;
}

async function activatePdfLink(annotation) {
  if (performance.now() < suppressClickUntil) return;

  if (annotation.action && handleNamedAction(annotation.action)) return;

  if (annotation.dest) {
    const pageNum = await destinationToPage(annotation.dest);
    if (pageNum) await goTo(pageNum);
    return;
  }

  if (annotation.url && ALLOW_EXTERNAL_LINKS) {
    const url = safeExternalUrl(annotation.url);
    if (url) window.location.assign(url);
  }
}

async function renderLinks(page, displayViewport, token) {
  clearLinks();

  let annotations = [];
  try {
    annotations = await page.getAnnotations({ intent: "display" });
  } catch (e) {
    console.warn("Impossible de lire les liens PDF", e);
    return;
  }
  if (token !== renderToken) return;

  for (const annotation of annotations) {
    if (annotation.subtype !== "Link" || !Array.isArray(annotation.rect)) continue;

    const isInternal = Boolean(annotation.dest || annotation.action);
    const isExternal = Boolean(annotation.url);
    if (!isInternal && !(ALLOW_EXTERNAL_LINKS && isExternal)) continue;

    const viewportRect = displayViewport.convertToViewportRectangle(annotation.rect);
    const { x, y, w, h } = normalizeRect(viewportRect);
    if (w < 1 || h < 1) continue;

    const link = document.createElement("button");
    link.type = "button";
    link.className = "pdf-link";
    link.style.left = `${x}px`;
    link.style.top = `${y}px`;
    link.style.width = `${w}px`;
    link.style.height = `${h}px`;
    link.setAttribute("aria-label", isExternal ? "Lien externe" : "Lien dans le document");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activatePdfLink(annotation);
    });
    els.linkLayer.appendChild(link);
  }
}

async function renderPage(num) {
  const token = ++renderToken;

  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }
  clearLinks();

  const page = await getPage(num);
  if (token !== renderToken) return;

  const dpr = clampDpr();
  const baseViewport = page.getViewport({ scale: 1 });
  const stageRect = els.stage.getBoundingClientRect();
  const availW = Math.max(64, stageRect.width);
  const availH = Math.max(64, stageRect.height);
  const fit = Math.min(availW / baseViewport.width, availH / baseViewport.height);

  const displayViewport = page.getViewport({ scale: fit });
  const renderViewport = page.getViewport({ scale: fit * dpr });

  const cssW = Math.max(1, Math.floor(displayViewport.width));
  const cssH = Math.max(1, Math.floor(displayViewport.height));
  els.pageWrap.style.width = `${cssW}px`;
  els.pageWrap.style.height = `${cssH}px`;

  els.canvas.width = Math.max(1, Math.floor(renderViewport.width));
  els.canvas.height = Math.max(1, Math.floor(renderViewport.height));
  els.canvas.setAttribute("aria-label", `Page ${num} sur ${pageCount}`);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

  const task = page.render({
    canvasContext: ctx,
    viewport: renderViewport,
    background: "#ffffff",
  });
  renderTask = task;

  try {
    await task.promise;
  } catch (e) {
    if (e?.name === "RenderingCancelledException") return;
    throw e;
  } finally {
    if (renderTask === task) renderTask = null;
  }

  if (token !== renderToken) return;
  els.canvas.classList.add("ready");
  await renderLinks(page, displayViewport, token);
}

function preload(num) {
  [num + 1, num - 1].forEach((n) => {
    if (n >= 1 && n <= pageCount && !pageCache.has(n)) getPage(n).catch(() => {});
  });
}

async function goTo(num, { push = true } = {}) {
  if (!pdfDoc) return;
  const target = Math.min(Math.max(1, num), pageCount);
  if (target === current && els.canvas.classList.contains("ready")) return;
  current = target;
  if (push) updateHash(target);
  await renderPage(target);
  preload(target);
}

const next = () => goTo(current + 1);
const prev = () => goTo(current - 1);

function showError(message) {
  els.loader.hidden = true;
  els.errorText.textContent = message || "Impossible de charger le document.";
  els.error.hidden = false;
}

async function load() {
  els.error.hidden = true;
  els.loader.hidden = false;
  els.canvas.classList.remove("ready");
  clearLinks();
  pageCache.clear();

  if (!PDF_URL) {
    showError("Aucune présentation à cette adresse.");
    return;
  }

  try {
    const task = pdfjsLib.getDocument({
      url: PDF_URL,
      disableRange: true,
      disableAutoFetch: false,
    });

    task.onProgress = ({ loaded, total }) => {
      if (total) {
        els.loaderText.textContent = `Chargement… ${Math.round((loaded / total) * 100)} %`;
      }
    };

    pdfDoc = await task.promise;
    pageCount = pdfDoc.numPages;
    current = Math.min(pageFromHash(), pageCount);
    els.loader.hidden = true;
    await renderPage(current);
    preload(current);
  } catch (e) {
    console.error(e);
    const missing = /404|not found/i.test(String(e?.message));
    showError(
      missing
        ? "PDF introuvable. Ajoute ton fichier à la racine du dépôt GitHub sous le nom deck.pdf."
        : "Impossible de charger la présentation. Connecte l’iPad une première fois puis réessaie."
    );
  }
}

/* Navigation clavier utile pendant les tests PC. Rien n'est affiché à l'écran. */
window.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      event.preventDefault();
      next();
      break;
    case "ArrowLeft":
    case "PageUp":
      event.preventDefault();
      prev();
      break;
    case "Home":
      event.preventDefault();
      goTo(1);
      break;
    case "End":
      event.preventDefault();
      goTo(pageCount);
      break;
  }
});

/* Swipe horizontal. Un simple tap sur une zone vide ne fait absolument rien. */
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

els.stage.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) {
      touchActive = false;
      return;
    }
    touchActive = true;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  },
  { passive: true }
);

els.stage.addEventListener(
  "touchend",
  (event) => {
    if (!touchActive || !event.changedTouches.length) return;
    touchActive = false;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const horizontalSwipe = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25;

    if (horizontalSwipe) {
      suppressClickUntil = performance.now() + 450;
      if (dx < 0) next();
      else prev();
    }
  },
  { passive: true }
);

/* Bloque les interactions qui pourraient faire apparaître une UI de navigateur. */
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("dragstart", (event) => event.preventDefault());
window.addEventListener("selectstart", (event) => event.preventDefault());
window.addEventListener("dblclick", (event) => event.preventDefault(), { passive: false });

/* Redimensionnement / rotation iPad. */
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (pdfDoc) renderPage(current);
  }, 140);
});

window.addEventListener("hashchange", () => {
  const n = pageFromHash();
  if (pdfDoc && n !== current) goTo(n, { push: false });
});

els.retry.addEventListener("click", load);

/* PWA / hors ligne.
 * On active le Service Worker AVANT de télécharger le PDF afin que même la première
 * ouverture mette deck.pdf en cache. L'utilisateur peut ensuite couper le Wi-Fi.
 */
async function prepareOfflineCache() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;

    // Au tout premier lancement, clients.claim() du SW prend le contrôle de cette page.
    // Attend brièvement controllerchange pour que le GET deck.pdf soit intercepté et mis en cache.
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          navigator.serviceWorker.removeEventListener("controllerchange", done);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, 4000);
        navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
      });
    }
  } catch (e) {
    console.warn("Service Worker indisponible", e);
  }
}

(async () => {
  await prepareOfflineCache();
  await load();
})();
