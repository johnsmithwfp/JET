// `timeline.js` is an ES module. It will still run even if `data.js` is missing,
// as long as you provide overrides via `window.timeline_*` (or legacy `window.*`) before init.
//
// Optional override:
//   window.timeline_data_url = "/path/to/data.js"  (defaults to "./data.js")
//
// CSP-friendly config (no inline <script> needed):
//   <script type="module" src="/static/js/timeline.js?data=/static/js/data.js&images=/static/images/"></script>
// Query params are *lower precedence* than window overrides.

let pageTitle, pageSubtitle, baseUrl, listFromWindow, setDocTitle;

const LOG_PREFIX = "[Timeline]";

const isMobile = () => window.innerWidth < 992;
let lastIsMobile = null;
let imagesForSession = [];
let _revealObserver = null;
let _onResize = null;
let _cleanup = null;
let _onHashChange = null;
let _onTocClick = null;
let _onImgError = null;
let _initPromise = null;
let _prevDocumentTitle = null;
let _gallerySizerCleanup = null;
let _defaultsPromise = null;
let _defaultsUrl = null;
let _scriptParams = null;

function getScriptParams() {
    if (_scriptParams) return _scriptParams;
    try {
        _scriptParams = new URL(import.meta.url).searchParams;
    } catch {
        _scriptParams = new URLSearchParams();
    }
    return _scriptParams;
}

function getScriptParam(name) {
    const v = getScriptParams().get(name);
    const s = String(v ?? "").trim();
    return s ? s : null;
}

function getDataUrl() {
    const qp = getScriptParam("data");
    const u =
        window.timeline_data_url ??
        window.timeline_data_module_url ??
        qp ??
        "./data.js";
    return String(u ?? "").trim() || "./data.js";
}

function loadDefaults() {
    // Evaluate timeline_data_url at init-time (not module-eval time),
    // so late overrides work when auto-init is disabled.
    const url = getDataUrl();
    if (_defaultsPromise && _defaultsUrl === url) return _defaultsPromise;
    _defaultsUrl = url;
    _defaultsPromise = (async () => {
        try {
            const resolved = new URL(url, import.meta.url).href;
            return await import(/* @vite-ignore */ resolved);
        } catch (err) {
            // Intentionally a warning: the page can still work with window overrides.
            console.warn(
                `${LOG_PREFIX} Could not import data module (${url}). Provide window.timeline_* overrides or ensure data.js exists.`,
                err
            );
            return null;
        }
    })();
    return _defaultsPromise;
}

const formatThousandsPlace = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? "");
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

function parseBool(v, fallback = true) {
    if (v === undefined || v === null) return fallback;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (["true", "1", "yes", "y", "on"].includes(s)) return true;
        if (["false", "0", "no", "n", "off"].includes(s)) return false;
        return fallback;
    }
    return fallback;
}

function coerceText(v, fallback = "") {
    if (v === undefined || v === null) return fallback;
    if (typeof v === "string") return v;
    return String(v);
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function imageInfo(entry) {
    if (typeof entry === "string") return { name: entry, fullExt: "jpg" };
    if (entry && typeof entry === "object") {
        const name = coerceText(entry.name, "").trim();
        const fullExt = coerceText(entry.fullExt, "jpg").trim() || "jpg";
        return { name, fullExt };
    }
    return { name: "", fullExt: "jpg" };
}

function imagePath(entry) {
    const { name, fullExt } = imageInfo(entry);
    if (!name) return { thumb: "", full: "" };
    const b =
        baseUrl && baseUrl.endsWith("/")
            ? baseUrl
            : baseUrl
            ? baseUrl + "/"
            : "";
    return {
        thumb: `${b}${name}_rs.jpg`,
        full: `${b}${name}.${fullExt}`,
    };
}

function setCentury(y) {
    if (y < 0) {
        const abs = Math.abs(y);
        const bucket = abs < 100 ? 100 : Math.floor(abs / 100) * 100;
        return -bucket;
    }
    // Avoid a "0's A.D." bucket; treat 0..99 as the 100's A.D.
    if (y >= 0 && y < 100) return 100;
    return Math.floor(y / 100) * 100;
}

function labelCentury(key) {
    return key < 0
        ? `${formatThousandsPlace(Math.abs(key))}’s B.C.`
        : `${formatThousandsPlace(key)}’s A.D.`;
}

function groupCentury(events) {
    const map = new Map();
    for (const ev of events) {
        const k = setCentury(ev.year);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(ev);
    }
    for (const [, arr] of map) {
        arr.sort(
            (a, b) =>
                a.year - b.year ||
                String(a.year_text).localeCompare(String(b.year_text))
        );
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

function safeHref(u) {
    if (typeof u !== "string") return null;
    const s = u.trim();
    if (!s) return null;
    // Block scheme-relative URLs (//evil.com/...) for parity with React + clearer intent.
    if (s.startsWith("//")) return null;
    try {
        const url = new URL(s, window.location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function sourceAriaLabel(href, idx) {
    try {
        const host = new URL(href).hostname;
        return host ? `Source ${idx + 1}: ${host}` : `Source ${idx + 1}`;
    } catch {
        return `Source ${idx + 1}`;
    }
}

function createSourceLinks(linkField) {
    if (!linkField || typeof linkField !== "string") return "";
    // Match React behavior: allow commas as separators too.
    const urls = linkField.split(/[\s,]+/).filter(Boolean);
    const links = [];
    for (let i = 0; i < urls.length; i++) {
        const href = safeHref(urls[i]);
        if (!href) continue;
        const aria = sourceAriaLabel(href, links.length);
        links.push(
            `<a class="link-chip text-decoration-none" href="${escapeHtml(
                href
            )}" aria-label="${escapeHtml(
                aria
            )}" target="_blank" rel="noopener noreferrer">` +
                `<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>` +
                `<span>Source</span>` +
                `</a>`
        );
    }
    if (!links.length) return "";
    return `<div class="mt-2 d-flex flex-wrap gap-2">${links.join("")}</div>`;
}

function scrollTopMobile() {
    if (!isMobile()) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function normalizeEvents(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const ev = raw[i];
        if (!ev || typeof ev !== "object") continue;
        const year = Number(ev.year);
        if (!Number.isFinite(year)) continue; // hard requirement
        const year_text = coerceText(ev.year_text, String(year));
        const location = coerceText(ev.location, "");
        const details = coerceText(ev.details, "");
        const link = coerceText(ev.link, "");
        out.push({ year, year_text, location, details, link });
    }
    return out;
}

function normalizeImages(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
        const info = imageInfo(entry);
        if (!info.name) continue;
        out.push(info);
    }
    return out;
}

async function _initTimeline() {
    if (window.__timelineInitialized) return;

    if (window.location?.protocol === "file:") {
        console.error(
            `${LOG_PREFIX} This page is running from file://. ES modules usually require a local web server.`
        );
    }

    const timelineRoot = document.getElementById("timeline");
    if (!timelineRoot) {
        console.error(`${LOG_PREFIX} Missing #timeline container.`);
        return;
    }

    const defaults = (await loadDefaults()) || {};

    // Only mark initialized after required DOM exists (avoids "init lock" on failure).
    window.__timelineInitialized = true;

    // Prefer namespaced overrides; keep legacy keys for backward compatibility.
    const raw =
        window.timeline_event_data ??
        window.event_data ??
        defaults.event_data ??
        [];
    const data = normalizeEvents(raw);

    pageTitle = coerceText(
        window.timeline_title ?? window.title ?? defaults.title,
        ""
    );
    pageSubtitle = coerceText(
        window.timeline_subtitle ?? window.subtitle ?? defaults.subtitle,
        ""
    );

    baseUrl =
        window.timeline_image_base_url ??
        window.image_base_url ??
        getScriptParam("images") ??
        defaults.image_base_url ??
        "";
    baseUrl = String(baseUrl ?? "").trim();

    listFromWindow =
        window.timeline_image_list ??
        window.image_list ??
        defaults.image_list ??
        [];
    listFromWindow = normalizeImages(listFromWindow);

    setDocTitle = parseBool(
        window.timeline_set_document_title ??
            window.set_document_title ??
            defaults.set_document_title,
        true
    );

    // Inject the page <title> and mobile header <h1>
    if (setDocTitle && pageTitle) {
        if (_prevDocumentTitle === null) _prevDocumentTitle = document.title;
        document.title = pageTitle;
    }
    const mobileHeaderH1 = document.querySelector(".app-header h1");
    if (mobileHeaderH1 && pageTitle) mobileHeaderH1.textContent = pageTitle;

    imagesForSession = shuffleArray(listFromWindow);

    // If Bootstrap Offcanvas isn't present, disable the mobile TOC button
    // (prevents "button does nothing" support reports).
    try {
        const btn = document.querySelector(
            '.app-header button[data-bs-toggle="offcanvas"][data-bs-target="#mobileToc"]'
        );
        if (btn) {
            const canOffcanvas = !!window.bootstrap?.Offcanvas;
            btn.disabled = !canOffcanvas;
            if (!canOffcanvas) {
                btn.setAttribute("aria-disabled", "true");
                btn.setAttribute(
                    "title",
                    "Requires Bootstrap JS for offcanvas"
                );
            } else {
                btn.removeAttribute("aria-disabled");
                btn.removeAttribute("title");
            }
        }
    } catch {}

    // If Bootstrap ScrollSpy exists, ensure expected attrs exist (template mistakes are common)
    if (window.bootstrap?.ScrollSpy) {
        const el = document.body;
        el.dataset.bsSpy = el.dataset.bsSpy || "scroll";
        el.dataset.bsTarget = el.dataset.bsTarget || "#tocNav";
        el.dataset.bsOffset = el.dataset.bsOffset || "110";
        if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    }

    render(data);
    scrollTopMobile();

    lastIsMobile = isMobile();
    _onResize = debounce(() => {
        const now = isMobile();
        if (now !== lastIsMobile) {
            lastIsMobile = now;
            render(data);
            scrollTopMobile();
        }
    }, 150);

    window.addEventListener("resize", _onResize);

    _cleanup = () => {
        try {
            _gallerySizerCleanup?.();
        } catch {}
        _gallerySizerCleanup = null;

        try {
            if (_onResize) window.removeEventListener("resize", _onResize);
        } catch {}
        _onResize = null;

        try {
            if (_onHashChange)
                window.removeEventListener("hashchange", _onHashChange);
        } catch {}
        _onHashChange = null;

        try {
            const tocNav = document.getElementById("tocNav");
            const mobileTocNav = document.getElementById("mobileTocNav");
            tocNav?.removeEventListener("click", _onTocClick);
            mobileTocNav?.removeEventListener("click", _onTocClick);
        } catch {}
        _onTocClick = null;

        try {
            const t = document.getElementById("timeline");
            const g = document.getElementById("galleryWrap");
            t?.removeEventListener("error", _onImgError, true);
            g?.removeEventListener("error", _onImgError, true);
        } catch {}
        _onImgError = null;

        try {
            _revealObserver?.disconnect();
        } catch {}
        _revealObserver = null;

        // Dispose any active ScrollSpy instances on this page.
        try {
            if (window.bootstrap?.ScrollSpy) {
                document
                    .querySelectorAll('[data-bs-spy="scroll"]')
                    .forEach((el) => {
                        if ((el.dataset.bsTarget || "") !== "#tocNav") return;
                        window.bootstrap.ScrollSpy.getInstance(el)?.dispose();
                    });
            }
        } catch {}

        // Restore document.title if we changed it (SPA / embedded usage).
        try {
            if (_prevDocumentTitle !== null)
                document.title = _prevDocumentTitle;
        } catch {}
        _prevDocumentTitle = null;

        window.__timelineInitialized = false;
        _initPromise = null;
    };
}

export function initTimeline() {
    if (_initPromise) return _initPromise;
    _initPromise = _initTimeline();
    return _initPromise;
}

export function destroyTimeline() {
    _cleanup?.();
    _cleanup = null;
}

function render(data) {
    const grouped = groupCentury(data);
    const totalEvents = grouped.reduce((sum, [, evs]) => sum + evs.length, 0);
    createTOC(grouped);
    createTimeline(grouped, totalEvents);
    createImages(totalEvents);
    installGallerySizer();
    installTocActiveFallback();
    installImgErrorHandler();
    setupScrollReveal();
    refreshScroll();
}

function createTOC(grouped) {
    const desktop = grouped
        .map(
            ([key]) =>
                `<a class="nav-link" href="#century-${key}">${escapeHtml(
                    labelCentury(key)
                )}</a>`
        )
        .join("");

    const mobile = grouped
        .map(
            ([key]) =>
                `<a class="nav-link" href="#century-${key}" data-bs-dismiss="offcanvas">${escapeHtml(
                    labelCentury(key)
                )}</a>`
        )
        .join("");

    const tocNav = document.getElementById("tocNav");
    if (tocNav) {
        tocNav.setAttribute("aria-label", "Century table of contents");
        tocNav.innerHTML = desktop;
    }

    const mobileTocNav = document.getElementById("mobileTocNav");
    if (mobileTocNav) {
        mobileTocNav.setAttribute("aria-label", "Century table of contents");
        mobileTocNav.innerHTML = mobile;
    }
}

function escapeHtml(s) {
    // Avoid String.prototype.replaceAll (older browser support).
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function createTimeline(grouped, totalEvents) {
    const root = document.getElementById("timeline");
    if (!root) return;

    const showDesktopTitle = !isMobile();

    let html =
        `<section class="page-hero reveal-on-scroll">` +
        (showDesktopTitle
            ? `<h1 class="page-title quintessential-regular">${escapeHtml(
                  pageTitle
              )}</h1>`
            : ``) +
        `<p class="page-subtitle birthstone-regular fw-bold">${escapeHtml(
            pageSubtitle
        )}</p>` +
        `</section>`;

    const imgCount = imagesForSession.length;

    const injectOnMobile = isMobile() && imgCount > 0 && totalEvents > 0;
    const interval = injectOnMobile
        ? Math.max(1, Math.floor(totalEvents / imgCount))
        : null;

    let globalEventIdx = 0;
    let imgCursor = 0;

    for (const [key, events] of grouped) {
        html +=
            `<section id="century-${key}" class="timeline-section reveal-on-scroll">` +
            `<div class="timeline-wrap">` +
            `<div class="century-node">` +
            `<div class="century-dot"></div>` +
            `<h2 class="century-label">${escapeHtml(labelCentury(key))}</h2>` +
            `</div>`;

        for (const ev of events) {
            const sideClass = globalEventIdx % 2 === 0 ? "tl-left" : "tl-right";
            const locHtml = ev.location
                ? `<span class="loc">• ${escapeHtml(ev.location)}</span>`
                : ``;

            html +=
                `<article class="tl-item ${sideClass} reveal-on-scroll">` +
                `<div class="tl-tag">` +
                `<span class="year">${escapeHtml(ev.year_text)}</span>` +
                locHtml +
                `</div>` +
                `<p class="tl-details">${escapeHtml(ev.details)}</p>` +
                `${createSourceLinks(ev.link)}` +
                `</article>`;

            globalEventIdx++;

            if (
                injectOnMobile &&
                interval &&
                globalEventIdx % interval === 0 &&
                imgCursor < imgCount
            ) {
                const entry = imagesForSession[imgCursor++];
                const { thumb, full } = imagePath(entry);
                const safeFull = safeHref(full);
                const safeThumb = safeHref(thumb);
                if (!safeThumb) continue;

                const label = imageInfo(entry).name.replace(/[-_]/g, " ");
                const openA = safeFull
                    ? `<a href="${escapeHtml(
                          safeFull
                      )}" target="_blank" rel="noopener noreferrer" class="d-inline-block">`
                    : `<div class="d-inline-block">`;
                const closeA = safeFull ? `</a>` : `</div>`;

                html +=
                    `<div class="tl-span-full reveal-on-scroll">` +
                    `<div class="gallery-card p-2 d-flex justify-content-center my-2">` +
                    `${openA}` +
                    `<img class="img-fluid" src="${escapeHtml(
                        safeThumb
                    )}" loading="lazy" alt="${escapeHtml(label)}">` +
                    `${closeA}` +
                    `</div>` +
                    `</div>`;
            }
        }

        html += `</div></section>`;
    }

    root.innerHTML = html;
}

function createImages(totalEvents) {
    const gallery = document.getElementById("galleryWrap");
    if (!gallery) return;

    const timelineEl = document.getElementById("timeline");
    if (!timelineEl) return;

    if (isMobile()) {
        gallery.innerHTML = "";
        gallery.style.maxHeight = "";
        gallery.style.overflow = "";
        return;
    }

    gallery.innerHTML = "";

    if (!imagesForSession.length) {
        gallery.style.maxHeight = "";
        gallery.style.overflow = "";
        return;
    }

    const target = timelineEl.scrollHeight;

    const makeBlockHtml = (entry) => {
        const { thumb, full } = imagePath(entry);
        const safeFull = safeHref(full);
        const safeThumb = safeHref(thumb);
        if (!safeThumb) return "";

        const label = imageInfo(entry).name.replace(/[-_]/g, " ");
        const openA = safeFull
            ? `<a href="${escapeHtml(
                  safeFull
              )}" target="_blank" rel="noopener noreferrer" class="d-flex justify-content-center">`
            : `<div class="d-flex justify-content-center">`;
        const closeA = safeFull ? `</a>` : `</div>`;

        return (
            `<div class="gallery-card p-2 mb-3 reveal-on-scroll">` +
            `${openA}` +
            `<img class="img-fluid" src="${escapeHtml(
                safeThumb
            )}" loading="lazy" alt="${escapeHtml(label)}">` +
            `${closeA}` +
            `</div>`
        );
    };

    const repeats = Math.min(
        200,
        Math.max(8, Math.ceil((Number(totalEvents) || 0) / 3))
    );

    const blocks = [];
    for (let i = 0; i < repeats; i++) {
        const entry = imagesForSession[i % imagesForSession.length];
        const h = makeBlockHtml(entry);
        if (h) blocks.push(h);
    }

    gallery.innerHTML = blocks.join("");
    gallery.style.maxHeight = `${target}px`;
    gallery.style.overflow = "hidden";
}

function installGallerySizer() {
    // Keep desktop gallery height synced to timeline height (fonts, images, reflow).
    _gallerySizerCleanup?.();
    _gallerySizerCleanup = null;

    const timelineEl = document.getElementById("timeline");
    const galleryEl = document.getElementById("galleryWrap");
    if (!timelineEl || !galleryEl) return;

    if (isMobile() || !imagesForSession.length) {
        galleryEl.style.maxHeight = "";
        galleryEl.style.overflow = "";
        return;
    }

    const apply = () => {
        galleryEl.style.maxHeight = `${timelineEl.scrollHeight}px`;
        galleryEl.style.overflow = "hidden";
    };

    apply();

    let ro = null;
    let onResize = null;
    if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => apply());
        ro.observe(timelineEl);
    } else {
        onResize = () => apply();
        window.addEventListener("resize", onResize);
    }

    const onLoad = (e) => {
        if (e?.target?.tagName === "IMG") apply();
    };
    timelineEl.addEventListener("load", onLoad, true);
    galleryEl.addEventListener("load", onLoad, true);

    _gallerySizerCleanup = () => {
        ro?.disconnect?.();
        if (onResize) window.removeEventListener("resize", onResize);
        timelineEl.removeEventListener("load", onLoad, true);
        galleryEl.removeEventListener("load", onLoad, true);
    };
}

function installTocActiveFallback() {
    if (window.bootstrap?.ScrollSpy) return;

    const tocNav = document.getElementById("tocNav");
    const mobileTocNav = document.getElementById("mobileTocNav");
    const navs = [tocNav, mobileTocNav].filter(Boolean);
    if (!navs.length) return;

    const update = () => {
        const hash = window.location.hash || "";
        for (const nav of navs) {
            const links = Array.from(nav.querySelectorAll("a.nav-link"));
            for (const a of links) {
                const isActive = a.getAttribute("href") === hash && hash !== "";
                a.classList.toggle("active", isActive);
                if (isActive) a.setAttribute("aria-current", "true");
                else a.removeAttribute("aria-current");
            }
        }
    };

    if (_onHashChange) window.removeEventListener("hashchange", _onHashChange);
    _onHashChange = update;
    window.addEventListener("hashchange", _onHashChange);

    if (_onTocClick) {
        tocNav?.removeEventListener("click", _onTocClick);
        mobileTocNav?.removeEventListener("click", _onTocClick);
    }
    _onTocClick = () => setTimeout(update, 0);
    tocNav?.addEventListener("click", _onTocClick);
    mobileTocNav?.addEventListener("click", _onTocClick);

    update();
}

function installImgErrorHandler() {
    const t = document.getElementById("timeline");
    const g = document.getElementById("galleryWrap");
    if (!t && !g) return;

    if (_onImgError) {
        t?.removeEventListener("error", _onImgError, true);
        g?.removeEventListener("error", _onImgError, true);
    }

    _onImgError = (e) => {
        const el = e?.target;
        if (!el || el.tagName !== "IMG") return;
        const card = el.closest?.(".gallery-card");
        if (card) card.style.display = "none";
    };

    t?.addEventListener("error", _onImgError, true);
    g?.addEventListener("error", _onImgError, true);
}

function getRevealNodes() {
    const roots = [];
    const t = document.getElementById("timeline");
    const g = document.getElementById("galleryWrap");
    if (t) roots.push(t);
    if (g) roots.push(g);

    const nodes = [];
    for (const r of roots) {
        nodes.push(...Array.from(r.querySelectorAll(".reveal-on-scroll")));
    }
    return nodes;
}

function setupScrollReveal() {
    _revealObserver?.disconnect();

    const reduce =
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ===
        true;

    const nodes = getRevealNodes();
    if (!nodes.length) return;

    if (reduce || typeof IntersectionObserver === "undefined") {
        nodes.forEach((el) => el.classList.add("in-view"));
        return;
    }

    const vh = window.innerHeight;
    nodes.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) el.classList.add("in-view");
    });

    _revealObserver = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add("in-view");
                    obs.unobserve(e.target);
                }
            });
        },
        { root: null, rootMargin: "0px 0px -20% 0px", threshold: 0.01 }
    );

    nodes
        .filter((el) => !el.classList.contains("in-view"))
        .forEach((el) => _revealObserver.observe(el));
}

function refreshScroll() {
    if (!window.bootstrap?.ScrollSpy) return;

    // Only manage ScrollSpy instances that target this timeline TOC.
    const dataSpyList = Array.from(
        document.querySelectorAll('[data-bs-spy="scroll"]')
    ).filter((el) => (el.dataset.bsTarget || "") === "#tocNav");

    dataSpyList.forEach((dataSpyEl) => {
        window.bootstrap.ScrollSpy.getInstance(dataSpyEl)?.dispose();
        const target = dataSpyEl.dataset.bsTarget || "#tocNav";
        const offset = Number(dataSpyEl.dataset.bsOffset) || 110;
        new window.bootstrap.ScrollSpy(dataSpyEl, { target, offset });
    });

    setTimeout(() => {
        dataSpyList.forEach((el) => {
            window.bootstrap.ScrollSpy.getInstance(el)?.refresh?.();
        });
    }, 0);
}

function debounce(fn, delay = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), delay);
    };
}

const _autoInit = parseBool(window.timeline_auto_init, true);
if (_autoInit) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTimeline, {
            once: true,
        });
    } else {
        initTimeline();
    }
}

export {};
