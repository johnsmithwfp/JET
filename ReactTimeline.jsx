/*
How to use the React component
1. Put ReactTimeline.jsx next to styling.css and data.js.
2. Import and render it in your app:

import React from "react";
import ReactDOM from "react-dom/client";
import TimelinePage from "./ReactTimeline.jsx";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TimelinePage />);
*/

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import "./styling.css";
import {
    title as defaultTitle,
    subtitle as defaultSubtitle,
    event_data as defaultData,
    image_list as defaultImages,
    image_base_url as defaultBase,
} from "./data";

// Bootstrap JS is optional; if you include it globally you can enable scrollspy/offcanvas behavior.
// import "bootstrap/dist/js/bootstrap.bundle.min.js";

const BREAKPOINT_LG = 992;

const isMobile = () =>
    typeof window !== "undefined" ? window.innerWidth < BREAKPOINT_LG : false;

const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

const fmtNum = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? "");
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

function centuryKeyForYear(y) {
    if (y < 0) {
        const abs = Math.abs(y);
        const bucket = abs < 100 ? 100 : Math.floor(abs / 100) * 100;
        return -bucket;
    }
    // Avoid a "0's A.D." bucket; treat 0..99 as the 100's A.D.
    if (y >= 0 && y < 100) return 100;
    return Math.floor(y / 100) * 100;
}

function labelForCenturyKey(key) {
    return key < 0
        ? `${fmtNum(Math.abs(key))}’s B.C.`
        : `${fmtNum(key)}’s A.D.`;
}

function groupByCentury(events) {
    const map = new Map();
    for (const ev of events) {
        const k = centuryKeyForYear(ev.year);
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

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function imgInfo(entry) {
    if (typeof entry === "string") return { name: entry, fullExt: "jpg" };
    if (entry && typeof entry === "object") {
        const name = String(entry.name ?? "").trim();
        const fullExt = String(entry.fullExt ?? "jpg").trim() || "jpg";
        return { name, fullExt };
    }
    return { name: "", fullExt: "jpg" };
}

function safeHref(u) {
    // SSR-safe: do not touch window/document. Only allow http(s) or relative URLs.
    if (typeof u !== "string") return null;
    const s = u.trim();
    if (!s) return null;
    if (s.startsWith("//")) return null; // scheme-relative URLs are ambiguous; reject

    const m = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (m) {
        const scheme = m[1].toLowerCase();
        return scheme === "http" || scheme === "https" ? s : null;
    }
    // Relative URL (e.g. "images/pic.jpg", "/images/pic.jpg", "./x"): allowed.
    return s;
}

function getRuntimeBootstrap(bootstrapProp) {
    if (bootstrapProp) return bootstrapProp;
    if (typeof window !== "undefined") return window.bootstrap ?? null;
    return null;
}

function sourceAriaLabel(href, idx) {
    try {
        const host =
            typeof window !== "undefined"
                ? new URL(href, window.location.href).hostname
                : new URL(href).hostname;
        return host ? `Source ${idx + 1}: ${host}` : `Source ${idx + 1}`;
    } catch {
        return `Source ${idx + 1}`;
    }
}

function imgPaths(entry, base) {
    const { name, fullExt } = imgInfo(entry);
    if (!name) return { thumb: "", full: "" };

    const baseStr = String(base ?? "");
    const b =
        baseStr && baseStr.endsWith("/")
            ? baseStr
            : baseStr
            ? baseStr + "/"
            : "";
    return { thumb: `${b}${name}_rs.jpg`, full: `${b}${name}.${fullExt}` };
}

function useReveal(containerRef, deps = []) {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const rootEl = containerRef.current;
        if (!rootEl) return;

        const nodes = Array.from(rootEl.querySelectorAll(".reveal-on-scroll"));
        if (!nodes.length) return;

        if (
            prefersReducedMotion() ||
            typeof IntersectionObserver === "undefined"
        ) {
            nodes.forEach((el) => el.classList.add("in-view"));
            return;
        }

        // Initial reveal for currently visible nodes
        const vh = window.innerHeight;
        nodes.forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.top < vh && r.bottom > 0) el.classList.add("in-view");
        });

        const revealObserver = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("in-view");
                        obs.unobserve(e.target);
                    }
                });
            },
            {
                root: null,
                rootMargin: "0px 0px -20% 0px",
                threshold: 0.01,
            }
        );

        rootEl
            .querySelectorAll(".reveal-on-scroll:not(.in-view)")
            .forEach((el) => revealObserver.observe(el));

        return () => {
            revealObserver.disconnect();
        };
    }, [containerRef, ...deps]);
}

function normalizeEvents(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const ev = raw[i];
        if (!ev || typeof ev !== "object") continue;
        const year = Number(ev.year);
        if (!Number.isFinite(year)) continue;
        out.push({
            year,
            year_text: String(ev.year_text ?? year),
            location: String(ev.location ?? ""),
            details: String(ev.details ?? ""),
            link: String(ev.link ?? ""),
        });
    }
    return out;
}

function normalizeImages(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => imgInfo(x)).filter((x) => x.name);
}

// Fallback: if ScrollSpy isn't present, keep TOC "active" synced to hash changes/clicks.
function useTocActiveFallback(enabled, deps = []) {
    useEffect(() => {
        if (!enabled) return;
        if (typeof window === "undefined" || typeof document === "undefined")
            return;

        const navs = [
            document.getElementById("tocNav"),
            document.getElementById("mobileTocNav"),
        ].filter(Boolean);

        if (!navs.length) return;

        const update = () => {
            const hash = window.location.hash || "";
            for (const nav of navs) {
                const links = Array.from(nav.querySelectorAll("a.nav-link"));
                for (const a of links) {
                    const isActive =
                        hash && a.getAttribute("href") === hash && hash !== "";
                    a.classList.toggle("active", isActive);
                    if (isActive) a.setAttribute("aria-current", "true");
                    else a.removeAttribute("aria-current");
                }
            }
        };

        const onHashChange = () => update();
        const onClick = () => setTimeout(update, 0);

        window.addEventListener("hashchange", onHashChange);
        navs.forEach((n) => n.addEventListener("click", onClick));

        update();

        return () => {
            window.removeEventListener("hashchange", onHashChange);
            navs.forEach((n) => n.removeEventListener("click", onClick));
        };
    }, [enabled, ...deps]);
}

export default function TimelinePage({
    title = defaultTitle,
    subtitle = defaultSubtitle,
    timelineData = defaultData,
    imageList = defaultImages,
    imageBaseUrl = defaultBase,
    bootstrap = null, // optional: pass `import * as bootstrap from "bootstrap"`
    setDocumentTitle = true,
}) {
    const runtimeBootstrap = useMemo(
        () => getRuntimeBootstrap(bootstrap),
        [bootstrap]
    );
    const [mobile, setMobile] = useState(() => isMobile());

    const normalizedData = useMemo(
        () => normalizeEvents(timelineData),
        [timelineData]
    );
    const normalizedImages = useMemo(
        () => normalizeImages(imageList),
        [imageList]
    );

    const [shuffledImages, setShuffledImages] = useState(() =>
        shuffle(normalizedImages)
    );

    const containerRef = useRef(null);
    const timelineElRef = useRef(null);
    const galleryWrapRef = useRef(null);

    const handleImgError = useCallback((e) => {
        const img = e?.currentTarget;
        const card = img?.closest?.(".gallery-card");
        if (card) card.style.display = "none";
    }, []);

    useEffect(() => {
        setShuffledImages(shuffle(normalizedImages));
    }, [normalizedImages]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        setMobile(isMobile());

        let raf = 0;
        const onResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setMobile(isMobile()));
        };

        window.addEventListener("resize", onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (mobile) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [mobile]);

    // Parity with vanilla: set document title by default, restore on unmount.
    useEffect(() => {
        if (typeof document === "undefined") return;
        if (!setDocumentTitle) return;
        const prev = document.title;
        if (title) document.title = title;
        return () => {
            document.title = prev;
        };
    }, [title, setDocumentTitle]);

    const grouped = useMemo(
        () => groupByCentury(normalizedData),
        [normalizedData]
    );

    const groupedKeySig = useMemo(
        () => grouped.map(([k]) => k).join(","),
        [grouped]
    );

    useEffect(() => {
        if (typeof document === "undefined") return;

        const bs = runtimeBootstrap;
        if (!bs?.ScrollSpy) return;

        const el = document.body;

        // Save prior values so a host app isn't permanently mutated.
        const prev = {
            spy: el.dataset.bsSpy,
            target: el.dataset.bsTarget,
            offset: el.dataset.bsOffset,
            tabindex: el.getAttribute("tabindex"), // string or null
        };

        el.dataset.bsSpy = "scroll";
        el.dataset.bsTarget = "#tocNav";
        el.dataset.bsOffset = "110";
        if (!el.hasAttribute("tabindex")) el.tabIndex = 0;

        bs.ScrollSpy.getInstance(el)?.dispose();
        const spy = new bs.ScrollSpy(el, { target: "#tocNav", offset: 110 });

        const t = setTimeout(() => spy.refresh(), 0);
        return () => {
            clearTimeout(t);
            spy.dispose();

            // Restore previous attributes.
            if (prev.spy === undefined) delete el.dataset.bsSpy;
            else el.dataset.bsSpy = prev.spy;

            if (prev.target === undefined) delete el.dataset.bsTarget;
            else el.dataset.bsTarget = prev.target;

            if (prev.offset === undefined) delete el.dataset.bsOffset;
            else el.dataset.bsOffset = prev.offset;

            if (prev.tabindex === null) el.removeAttribute("tabindex");
            else el.setAttribute("tabindex", prev.tabindex);
        };
    }, [runtimeBootstrap, groupedKeySig]);

    const hasScrollSpy = !!runtimeBootstrap?.ScrollSpy;
    const hasOffcanvas = !!runtimeBootstrap?.Offcanvas;
    useTocActiveFallback(!hasScrollSpy, [groupedKeySig]);

    useReveal(containerRef, [mobile, grouped.length, shuffledImages.length]);

    // Parity with vanilla: keep the desktop gallery from exceeding the timeline height.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const timelineEl = timelineElRef.current;
        const galleryEl = galleryWrapRef.current;
        if (!timelineEl || !galleryEl) return;

        if (mobile) {
            galleryEl.style.maxHeight = "";
            galleryEl.style.overflow = "";
            return;
        }

        const apply = () => {
            galleryEl.style.maxHeight = `${timelineEl.scrollHeight}px`;
            galleryEl.style.overflow = "hidden";
        };

        apply();

        // React to layout changes (fonts, content updates, image loads).
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
        galleryEl.addEventListener("load", onLoad, true);
        timelineEl.addEventListener("load", onLoad, true);

        return () => {
            ro?.disconnect?.();
            if (onResize) window.removeEventListener("resize", onResize);
            galleryEl.removeEventListener("load", onLoad, true);
            timelineEl.removeEventListener("load", onLoad, true);
        };
    }, [mobile, groupedKeySig, shuffledImages.length]);

    const galleryBlocks = useMemo(() => {
        if (mobile || shuffledImages.length === 0) return [];

        const totalEvents = grouped.reduce((s, [, arr]) => s + arr.length, 0);
        const repeats = Math.min(200, Math.max(8, Math.ceil(totalEvents / 3)));

        const blocks = [];
        for (let i = 0; i < repeats; i++) {
            const entry = shuffledImages[i % shuffledImages.length];
            const { thumb, full } = imgPaths(entry, imageBaseUrl);

            const safeFull = safeHref(full);
            const safeThumb = safeHref(thumb);
            if (!safeThumb) continue;

            const label = imgInfo(entry).name.replace(/[-_]/g, " ");
            const Wrapper = safeFull ? "a" : "div";
            const wrapperProps = safeFull
                ? {
                      href: safeFull,
                      target: "_blank",
                      rel: "noopener noreferrer",
                  }
                : {};

            blocks.push(
                <div
                    className="gallery-card p-2 mb-3 reveal-on-scroll"
                    key={`g-${i}`}
                >
                    <Wrapper
                        {...wrapperProps}
                        className="d-flex justify-content-center"
                    >
                        <img
                            className="img-fluid"
                            src={safeThumb}
                            loading="lazy"
                            alt={label}
                            onError={handleImgError}
                        />
                    </Wrapper>
                </div>
            );
        }

        return blocks;
    }, [mobile, shuffledImages, grouped, imageBaseUrl, handleImgError]);

    const tocItemsDesktop = useMemo(
        () =>
            grouped.map(([key]) => (
                <a
                    className="nav-link"
                    href={`#century-${key}`}
                    key={`d-${key}`}
                >
                    {labelForCenturyKey(key)}
                </a>
            )),
        [grouped]
    );

    const tocItemsMobile = useMemo(
        () =>
            grouped.map(([key]) => (
                <a
                    className="nav-link"
                    href={`#century-${key}`}
                    key={`m-${key}`}
                    data-bs-dismiss="offcanvas"
                    onClick={() => {
                        if (typeof document === "undefined") return;
                        const bs = runtimeBootstrap;
                        const el = document.getElementById("mobileToc");
                        if (!el) return;
                        bs?.Offcanvas?.getOrCreateInstance(el)?.hide();
                    }}
                >
                    {labelForCenturyKey(key)}
                </a>
            )),
        [grouped, runtimeBootstrap]
    );

    const timelineSections = useMemo(() => {
        const totalEvents = grouped.reduce(
            (sum, [, evs]) => sum + evs.length,
            0
        );
        const imgCount = shuffledImages.length;
        const injectOnMobile = mobile && imgCount > 0 && totalEvents > 0;
        const interval = injectOnMobile
            ? Math.max(1, Math.floor(totalEvents / imgCount))
            : null;

        let globalEventIdx = 0;
        let imgCursor = 0;

        const sections = [];

        for (const [key, events] of grouped) {
            const items = [];

            items.push(
                <div className="century-node" key={`c-${key}`}>
                    <div className="century-dot"></div>
                    <h2 className="century-label">{labelForCenturyKey(key)}</h2>
                </div>
            );

            for (const ev of events) {
                const sideClass =
                    globalEventIdx % 2 === 0 ? "tl-left" : "tl-right";

                items.push(
                    <article
                        className={`tl-item ${sideClass} reveal-on-scroll`}
                        key={`${key}-${ev.year_text}-${globalEventIdx}`}
                    >
                        <div className="tl-tag">
                            <span className="year">{ev.year_text}</span>
                            {ev.location ? (
                                <span className="loc">• {ev.location}</span>
                            ) : null}
                        </div>

                        <p className="tl-details">{ev.details}</p>

                        {ev.link && (
                            <div className="mt-2 d-flex flex-wrap gap-2">
                                {ev.link
                                    .split(/[\s,]+/)
                                    .filter(Boolean)
                                    .map((u, i) => {
                                        const href = safeHref(u);
                                        if (!href) return null;
                                        return (
                                            <a
                                                className="link-chip text-decoration-none"
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={sourceAriaLabel(
                                                    href,
                                                    i
                                                )}
                                                key={`${href}-${i}`}
                                            >
                                                <i
                                                    className="bi bi-box-arrow-up-right"
                                                    aria-hidden="true"
                                                ></i>
                                                <span>Source</span>
                                            </a>
                                        );
                                    })}
                            </div>
                        )}
                    </article>
                );

                globalEventIdx++;

                if (
                    injectOnMobile &&
                    interval &&
                    globalEventIdx % interval === 0 &&
                    imgCursor < imgCount
                ) {
                    const entry = shuffledImages[imgCursor++];
                    const { thumb, full } = imgPaths(entry, imageBaseUrl);
                    const safeFull = safeHref(full);
                    const safeThumb = safeHref(thumb);
                    if (!safeThumb) continue;

                    const label = imgInfo(entry).name.replace(/[-_]/g, " ");
                    const Wrapper = safeFull ? "a" : "div";
                    const wrapperProps = safeFull
                        ? {
                              href: safeFull,
                              target: "_blank",
                              rel: "noopener noreferrer",
                          }
                        : {};

                    items.push(
                        <div
                            className="tl-span-full reveal-on-scroll"
                            key={`img-${key}-${globalEventIdx}`}
                        >
                            <div className="gallery-card p-2 d-flex justify-content-center my-2">
                                <Wrapper
                                    {...wrapperProps}
                                    className="d-inline-block"
                                >
                                    <img
                                        className="img-fluid"
                                        src={safeThumb}
                                        loading="lazy"
                                        alt={label}
                                        onError={handleImgError}
                                    />
                                </Wrapper>
                            </div>
                        </div>
                    );
                }
            }

            sections.push(
                <section
                    id={`century-${key}`}
                    className="timeline-section reveal-on-scroll"
                    key={`sec-${key}`}
                >
                    <div className="timeline-wrap">{items}</div>
                </section>
            );
        }

        return sections;
    }, [grouped, shuffledImages, imageBaseUrl, mobile, handleImgError]);

    return (
        <div ref={containerRef} tabIndex={0}>
            {/* Mobile header */}
            <header className="app-header d-lg-none">
                <div className="container-fluid">
                    <div className="d-flex align-items-center gap-2 py-2">
                        <button
                            type="button"
                            className="btn btn-outline-primary border-0"
                            data-bs-toggle="offcanvas"
                            data-bs-target="#mobileToc"
                            aria-controls="mobileToc"
                            aria-label="Open table of contents"
                            disabled={!hasOffcanvas}
                            aria-disabled={!hasOffcanvas}
                            title={
                                !hasOffcanvas
                                    ? "Requires Bootstrap JS for offcanvas"
                                    : undefined
                            }
                        >
                            <i
                                className="bi bi-list"
                                style={{ fontSize: "1.5rem" }}
                                aria-hidden="true"
                            ></i>
                        </button>

                        <h1 className="h5 m-0 fw-semibold text-primary quintessential-regular">
                            {title}
                        </h1>
                    </div>
                </div>
            </header>

            <div className="container-fluid">
                <div className="row g-0">
                    {/* TOC */}
                    <aside
                        id="toc-col"
                        className="col-lg-2 d-none d-lg-block px-3"
                    >
                        <div
                            className="position-sticky"
                            style={{ top: "1rem" }}
                        >
                            <div className="toc-panel">
                                <div className="label bokor-regular">
                                    Century
                                </div>
                                <nav
                                    id="tocNav"
                                    className="nav nav-pills flex-column gap-2"
                                    aria-label="Century table of contents"
                                >
                                    {tocItemsDesktop}
                                </nav>
                            </div>
                        </div>
                    </aside>

                    {/* Timeline */}
                    <main
                        id="timeline"
                        ref={timelineElRef}
                        className="col-lg-7 px-3 px-lg-4 py-3 py-lg-4"
                    >
                        {!mobile && (
                            <section className="page-hero reveal-on-scroll">
                                <h1 className="page-title quintessential-regular">
                                    {title}
                                </h1>
                                <p className="page-subtitle birthstone-regular fw-bold">
                                    {subtitle}
                                </p>
                            </section>
                        )}
                        {mobile && (
                            <section className="page-hero reveal-on-scroll">
                                <p className="page-subtitle birthstone-regular fw-bold">
                                    {subtitle}
                                </p>
                            </section>
                        )}

                        {timelineSections}
                    </main>

                    {/* Gallery (desktop) */}
                    <aside
                        id="gallery-col"
                        className="col-lg-3 d-none d-lg-block px-3"
                    >
                        <div
                            id="galleryWrap"
                            ref={galleryWrapRef}
                            className="pt-3 pb-4"
                        >
                            {galleryBlocks}
                        </div>
                    </aside>
                </div>
            </div>

            {/* Mobile TOC offcanvas */}
            <div
                className="offcanvas offcanvas-start"
                tabIndex={-1}
                id="mobileToc"
                aria-labelledby="mobileTocLabel"
            >
                <div className="offcanvas-header">
                    <h5
                        className="offcanvas-title bokor-regular"
                        id="mobileTocLabel"
                    >
                        Century
                    </h5>
                    <button
                        type="button"
                        className="btn-close"
                        data-bs-dismiss="offcanvas"
                        aria-label="Close"
                    ></button>
                </div>

                <div className="offcanvas-body">
                    <nav
                        id="mobileTocNav"
                        className="nav nav-pills flex-column gap-1"
                        aria-label="Century table of contents"
                    >
                        {tocItemsMobile}
                    </nav>
                </div>
            </div>
        </div>
    );
}
