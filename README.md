# Drop-in History Timeline

A data-driven, responsive history timeline that renders from plain `data.js` into a Bootstrap layout.

- **Static (no build):** `static_timeline.html` + `timeline.js`
- **Django:** `django_timeline.html` template + static assets
- **Flask:** `flask_timeline.html` template + static assets
- **React/Vite:** `ReactTimeline.jsx` component

> **Important (read this first):** `styling.css` is a **full-page theme**. It styles `html`, `body`, links, and some Bootstrap components (e.g. offcanvas). This project is intended to run on a **dedicated page/route** so it won’t change the look of the rest of your site. Embedding inside an existing themed page requires **scoping the CSS** (advanced; not shipped).

---

## What it does

- **Data-driven:** Reads `title`, `subtitle`, `event_data`, and image info from `data.js` (or runtime overrides).
- **Century grouping:** Events are grouped by century (B.C. and A.D.).
- **Responsive layout:**
  - **Desktop:** Alternating left/right timeline + right-hand image gallery that sizes to match the timeline height.
  - **Mobile:** Single column; images are interleaved among entries.
- **Images:** Shuffled per page load; lazy-loaded thumbnails (`*_rs.jpg`) link to full-size images.
- **Navigation:** Century table of contents (desktop sidebar + mobile offcanvas drawer).
- **Optional Bootstrap JS:** Enables Offcanvas and ScrollSpy (TOC “active” updates on scroll).

---

## Dependencies (required vs optional)

### Required (all modes)
- **Bootstrap 5 CSS** (grid + utilities). The markup uses Bootstrap classes like `container-fluid`, `row`, `col-lg-*`, `nav`, spacing utilities, etc. Without Bootstrap CSS, layout/spacing will look broken.
- **Theme CSS:** `styling.css`

### Recommended (cosmetic)
- **Bootstrap Icons CSS** (menu icon + “Source” icon).
- **Fonts** (Inter, Poppins, Quintessential, Birthstone, Bokor) if you want the same typography.

### Optional (enables features)
- **Bootstrap JS bundle** (`bootstrap.bundle.min.js`)
  - Enables **Offcanvas** (mobile TOC drawer)
  - Enables **ScrollSpy** (TOC active item updates while scrolling)
  - If Bootstrap JS is missing:
    - The mobile TOC button is **disabled** (by design).
    - TOC active state falls back to **hash/click-based** updates (it will **not** track scroll position).

---

## Before you start (gotchas)

- **Serve over HTTP/HTTPS (not `file://`)**
  `timeline.js` is an ES module and dynamically imports `data.js`. Most browsers block ES module imports from `file:///...`.

- **Image naming is strict by default**
  - Thumbnail: **`${name}_rs.jpg`** (always `.jpg`)
  - Full image: **`${name}.${fullExt}`** (extension comes from `image_list`)

- **Links field supports multiple URLs**
  `event_data[].link` may contain multiple URLs separated by spaces and/or commas.

- **Required HTML IDs (DOM contract for `timeline.js`)**
  Your page/template must include these IDs:
  - `#timeline` (required)
  - `#tocNav` and `#mobileTocNav` (TOC containers)
  - `#galleryWrap` (desktop gallery container)
  - `#mobileToc` (offcanvas container)

---

## Quick start (choose one)

This setup works on static-hosted websites as well as those with Vue/Nuxt, Svelte/SvelteKit, and Angular.

### 1) Static (no build)

**Files you need in one folder:**

```text
your-folder/
├─ index.html                (rename static_timeline.html → index.html)
├─ timeline.js
├─ data.js
├─ styling.css
├─ images/
│  ├─ picture1.jpg
│  ├─ picture1_rs.jpg
│  ├─ picture2.jpg
│  ├─ picture2_rs.jpg
│  └─ ...
```

**Run locally (recommended):**

- Windows PowerShell:

```powershell
cd C:\path\to\your-folder
py -m http.server 8000
```

- macOS/Linux:

```bash
cd /path/to/your-folder
python -m http.server 8000
```

Open: `http://localhost:8000/static_timeline.html`

**Customize:** edit `data.js` and `styling.css`.

### For Vue/Nuxt, Svelte/SvelteKit, and Angular

* use `timeline.js` in a dedicated route/page, because these frameworks can all serve static assets and output HTML containers.
* If you want to go further yourself, you can create a thin wrapper, but it’s not required for broad compatibility.

### For Static site generators (Astro, Eleventy, Hugo, Jekyll, Gatsby)

* These behave just like Static mode, with one extra gotcha: **subpath hosting** (which is already documented later in this document).
* To convert to an SSG create an "SSG-ready `index.html` that uses only `./` relative paths everywhere". ChatGPT can do this for you based on `static_timeline.html`.

---

## 2) Django

### A) Install Python (Windows)

- Download Python 3.11+ from <https://www.python.org/downloads/>.
- During install, check **"Add Python to PATH"**.

### B) Create virtual environment & install Django

```powershell
# In PowerShell
cd C:\CodeFolder
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install django
```

### C) Start a Django project/app

```powershell
django-admin startproject timeline_site
cd timeline_site
python manage.py startapp timeline
```

### D) Project layout

```
timeline_site/
├─ manage.py
├─ timeline_site/
│  ├─ settings.py
│  ├─ urls.py
│  ├─ asgi.py
│  └─ wsgi.py
├─ timeline/
│  ├─ views.py
│  ├─ urls.py (create)
│  ├─ templates/ (create)
│  │  ├─ base.html (create)
│  │  └─ django_timeline.html  (copy)
│  └─ static/ (create)
│     ├─ images   (copy over images you use - for development only)
│     ├─ css/styling.css   (copy)
│     └─ js/
│        ├─ timeline.js    (copy)
│        └─ data.js        (copy)
└─ manage.py
```

### E) Configure `settings.py`

Add the app, templates dir, and static dirs:

`timeline_site/settings.py`

```python
# Add `os` import to top
import os

# Add 'timeline` app
INSTALLED_APPS = [
    # ...
    "timeline",  # add
]

# Add timeline templates
TEMPLATES = [
    {
        "DIRS": [BASE_DIR / "timeline" / "templates"],  # add
    }
]

# This is for development, use a static file host in Production.
STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, "timeline_site", "static")
STATICFILES_DIRS = [
    BASE_DIR / "timeline" / "static",
]
```

### F) Minimal `base.html`

Create `timeline/templates/base.html`:

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{% block title %}History Timeline{% endblock %}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Quintessential&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Birthstone&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Fleur+De+Leah&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Bokor&display=swap" rel="stylesheet">
    {% block extra_css %}{% endblock %}
</head>

<body>
    {% block content %}{% endblock %}
    <script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    {% block extra_js %}{% endblock %}
</body>

</html>
```

### G) Timeline template

Copy **`django_timeline.html`** to `timeline/templates/`. It already extends `base.html` and wires up `styling.css`, `timeline.js`, and `data.js`.

That template:
- Loads `styling.css` via `{% static %}`
- Sets a Django-safe image base URL: `window.image_base_url = "{% static 'images/' %}";`
- Prevents JS from overriding the server `<title>`: `window.timeline_set_document_title = false;`
- Points the data module loader at Django’s static URL for `data.js`: `window.timeline_data_url = "{% static 'js/data.js' %}";`
- Loads `timeline.js` as an ES module.

### H) Views & URLs

`timeline/views.py`:

```python
from django.shortcuts import render

def timeline_page(request):
    return render(request, "django_timeline.html", {"page_title": "History Timeline"})
```

`timeline/urls.py`:

```python
from django.urls import path
from .views import timeline_page

urlpatterns = [
    path("", timeline_page, name="timeline"),
]
```

`timeline_site/urls.py`:

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("timeline.urls")),
]
```

### I) Setup Static Files (For Development)

Collect Static Files
```powershell
python manage.py migrate
python manage.py collectstatic
```

### J) Run it

```powershell
python manage.py runserver
```

Open <http://127.0.0.1:8000/>.

### K) Production Notes
1. For production, put static files under an app/static folder, set `STATIC_ROOT`, and use `collectstatic` with a static web server (Nginx/Whitenoise/CDN/etc.).
2. You will need to handle how the images are stored and configured to display in the `settings.py` file.
3. If your site blocks inline scripts (strict CSP), configure via `timeline.js?data=...&images=...` or use an external `timeline.config.js`.

---

## 3) Flask

### A) Install Python (Windows)

- Download Python 3.11+ from <https://www.python.org/downloads/>.
- During install, check **"Add Python to PATH"**.

### B) Create virtual environment & install Flask

```powershell
# In PowerShell
cd C:\CodeFolder
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install flask
```

### C) Project layout

Create this folder structure:

```
timeline_flask/
├─ app.py
├─ templates/
│  ├─ base.html
│  └─ flask_timeline.html   (copy from this repo)
└─ static/
   ├─ images/               (copy your images)
   ├─ css/
   │  └─ styling.css        (copy)
   └─ js/
      ├─ timeline.js        (copy)
      └─ data.js            (copy)
```

### D) Minimal `base.html`

Create `templates/base.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{% block title %}History Timeline{% endblock %}</title>

  <!-- Required -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />

  <!-- Recommended (icons + fonts, for matching the demo look) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Quintessential&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Birthstone&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Bokor&display=swap" rel="stylesheet">

  {% block extra_css %}{% endblock %}
</head>

<body>
  {% block content %}{% endblock %}

  <!-- Optional: enables Offcanvas + ScrollSpy -->
  <script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>

  {% block extra_js %}{% endblock %}
</body>
</html>
```

### E) Flask route (`app.py`)

Create `app.py`:

```python
from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def timeline_page():
    return render_template("flask_timeline.html", page_title="History Timeline")

if __name__ == "__main__":
    app.run(debug=True)
```

### F) Template wiring

Copy **`flask_timeline.html`** into `templates/`. It:

* Loads `styling.css` via `url_for('static', ...)`
* Sets a Flask-safe image base URL: `window.image_base_url = "/static/images/"`
* Prevents JS from overriding the server `<title>`: `window.timeline_set_document_title = false;`
* Points the data module loader at Flask’s static URL for `data.js`: `window.timeline_data_url = "/static/js/data.js";`
* Loads `timeline.js` as an ES module.

### G) Run it

From the `timeline_flask/` folder:

```powershell
python app.py
```

Open: [http://127.0.0.1:5000/](http://127.0.0.1:5000/)

### H) Production Notes

1. In production, serve `/static/` through your reverse proxy / host (Nginx, CDN, etc.).
2. If you ever fingerprint static filenames (hashed assets), set:
   * `window.timeline_data_url` to the final `data.js` URL your pipeline generates.
3. If your site blocks inline scripts (strict CSP), configure via `timeline.js?data=...&images=...` or use an external `timeline.config.js`.

---

## 4) Rails, Laravel, ASP.NET, Express, FastAPI, etc.
Django + Flask already demonstrate the only thing that changes:

how to output static URLs for:
* `styling.css`
* `timeline.js`
* `data.js`
* image base path

So the “framework support” here is mostly a template snippet pattern:
* set `window.timeline_data_url`
* set `window.image_base_url`
* decide `window.timeline_set_document_title`

If you document that pattern clearly, Rails/Laravel/etc. are automatically covered. Ask ChatGPT or another AI for how to setup the template.

---

## 5) React (Vite)

### A) Install Node.js

- Windows/macOS: <https://nodejs.org/> (LTS). On Windows, you can also use nvm-windows: <https://github.com/coreybutler/nvm-windows>.

Confirm versions:

```bash
node -v
npm -v
```

### B) Create a Vite React app

```bash
# Choose a parent folder where you keep projects
npm create vite@latest timeline-react -- --template react
# Use rolldown-vite (Experimental)?: No
# Install with npm and start now?: No
cd timeline-react
npm install
```

### C) Bring in your files

Copy into the Vite project:

- `ReactTimeline.jsx` → `src/ReactTimeline.jsx`
- `styling.css` → `src/styling.css`
- `data.js` → `src/data.js`
- Images → `public/images/`

In `src/data.js` set:

```js
export const image_base_url = import.meta.env.BASE_URL + "images/"; // served from Vite public dir
```

### D) Bootstrap & Icons (optional but recommended for offcanvas/scrollspy)

Install Bootstrap + Icons via npm and import the CSS (unless you use CDN).

```bash
npm i bootstrap bootstrap-icons
```

In `src/main.jsx` before :

```js
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <App />
    </StrictMode>
);
```

### E) Use the component

`src/App.jsx`:

```jsx
import * as bootstrap from "bootstrap";
import ReactTimeline from "./ReactTimeline.jsx";

export default function App() {
    return (
        <ReactTimeline
            bootstrap={bootstrap}
            imageBaseUrl={import.meta.env.BASE_URL + "images/"}
        />
    );
}
```

Copy the `<link>` tags into `index.html` (in the Vite project root) inside `<head>`.

`timeline-react\index.html`:

```html
<!doctype html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>timeline-react</title>
    <!-- ADDING THIS PORTION -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Quintessential&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Birthstone&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Fleur+De+Leah&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Bokor&display=swap" rel="stylesheet">
    <!-- ADDING THIS PORTION -->
</head>

<body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
</body>

</html>
```

### F) Run

```bash
npm run dev
```

Open the printed local URL (e.g., <http://localhost:5173/>).

### G) Build for production

```bash
npm run build
# optional local preview
npm run preview
```

Deploy the contents of `dist/` to any static host.


### H) Next.js Notes (App Router)

**What changes vs Vite:**

* **Client-only rendering:** `ReactTimeline.jsx` uses browser APIs (`window`, `document`, `ResizeObserver`, etc.). In Next App Router it must be rendered from a **Client Component** (`"use client"`).
* **Global CSS import rule (important):** Next App Router requires global CSS to be imported in **`app/layout.(js|tsx)`** (or another allowed global entry), not inside arbitrary components.

  * Your `ReactTimeline.jsx` currently does `import "./styling.css";`.
  * For Next: **remove that import from `ReactTimeline.jsx`** and import the CSS in `app/layout.(js|tsx)` instead.
* **Bootstrap JS (optional):** If you want Offcanvas + ScrollSpy, load Bootstrap JS on the client and pass it into the component.

**Minimal usage example (App Router):**

```jsx
// app/timeline/page.jsx (or any client component that renders the timeline)
"use client";

import * as bootstrap from "bootstrap";
import ReactTimeline from "@/components/ReactTimeline";

export default function TimelinePage() {
  return (
    <ReactTimeline
      bootstrap={bootstrap}          // enables Offcanvas + ScrollSpy
      setDocumentTitle={false}       // recommended if Next owns <title>
      imageBaseUrl="/images/"        // images in /public/images
    />
  );
}
```

**CSS + images placement (App Router):**

* Put images in: `public/images/`
* Import global CSS in: `app/layout.(js|tsx)` (example)

```js
// app/layout.js
import "./globals.css";
import "../components/styling.css"; // wherever you place styling.css
```

> If you use Next `basePath` / `assetPrefix`, make sure `imageBaseUrl` includes it (e.g. `"/my-base/images/"`).

---

### I) Next.js Notes (Pages Router)

**What changes vs Vite:**

* **Disable SSR for this page/component:** use `next/dynamic` with `{ ssr: false }`, because the timeline relies on browser-only APIs.
* **Global CSS import rule (important):** Pages Router requires global CSS to be imported in **`pages/_app.(js|tsx)`**.

  * For Next: **remove** `import "./styling.css";` from `ReactTimeline.jsx`
  * Import it in `pages/_app.(js|tsx)` instead.
* **Bootstrap JS (optional):** Load it on the client and pass it in.

**Minimal usage example (Pages Router):**

```jsx
// pages/timeline.jsx
import dynamic from "next/dynamic";
import * as bootstrap from "bootstrap";

const ReactTimeline = dynamic(() => import("../components/ReactTimeline"), {
  ssr: false,
});

export default function TimelinePage() {
  return (
    <ReactTimeline
      bootstrap={bootstrap}
      setDocumentTitle={false}
      imageBaseUrl="/images/"
    />
  );
}
```

**CSS + images placement (Pages Router):**

* Put images in: `public/images/`
* Import global CSS in: `pages/_app.(js|tsx)`

```js
// pages/_app.js
import "../components/styling.css";
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

> If you use Next `basePath`, update `imageBaseUrl` accordingly (e.g. `"/my-base/images/"`).

### K) One small (but important) code note

Because `Next` enforces global CSS rules, you’ll want a tiny comment in the README (already implied above) that **Vite can keep `import "./styling.css";` inside `ReactTimeline.jsx`, but Next should move it** to the framework’s global entry.
If you want, I can also give you the *exact* minimal diff for `ReactTimeline.jsx` to make that “CSS import optional” without affecting Vite behavior (so you don’t have to maintain a separate Next version).

---

## Data format (`data.js`) + images

`data.js` exports:

- `title` (string)
- `subtitle` (string)
- `image_base_url` (string; e.g. `"images/"`)
- `image_list` (array):
  - `{ name: "picture1", fullExt: "jpg" }`
- `event_data` (array):
  - `{ year_text, year, location, details, link }`

### Images

- Full image: `${name}.${fullExt}` (e.g. `picture1.jpg`)
- Thumbnail: `${name}_rs.jpg` (e.g. `picture1_rs.jpg`)

Place images in:
- Static/Django: `images/`
- Vite: `public/images/`

---

## Configuration overrides

### Static/Django/Flask (`timeline.js` runtime overrides)

`timeline.js` loads `data.js` at runtime.

**CSP-friendly option (no inline `<script>`):**
You can pass config via query parameters on the `timeline.js` URL:

```html
<script
  type="module"
  src="/static/js/timeline.js?data=/static/js/data.js&images=/static/images/">
</script>
```

Query params are lower precedence than `window.timeline_*` overrides.

- Default: it tries to import `./data.js`
- **Flask:** use `url_for('static', filename=...)` to set `window.timeline_data_url` and `window.image_base_url` (see Flask section).
- Override the module URL by setting this **before** loading `timeline.js`:

```html
<script>
  window.timeline_data_url = "./data.js";
</script>
<script type="module" src="./timeline.js"></script>
```

You can also override values directly (no need to edit `data.js`):

```html
<script>
  window.timeline_title = "My Title";
  window.timeline_subtitle = "My Subtitle";
  window.timeline_event_data = [/* events */];
  window.timeline_image_list = [/* images */];
  window.timeline_image_base_url = "images/";
  window.timeline_set_document_title = true;

  // Optional: disable auto-init and call initTimeline() yourself
  window.timeline_auto_init = false;
</script>
<script type="module" src="./timeline.js"></script>
```

Legacy aliases also work (`window.title`, `window.subtitle`, `window.event_data`, `window.image_list`, `window.image_base_url`), but `window.timeline_*` is preferred.

### React props (`ReactTimeline.jsx`)

`ReactTimeline.jsx` supports these props:

- `title`, `subtitle`
- `timelineData` (events array)
- `imageList` (images array)
- `imageBaseUrl` (string)
- `bootstrap` (optional: pass `import * as bootstrap from "bootstrap"`)
- `setDocumentTitle` (default `true`; set `false` if your host app controls `<title>`)

---

## Subpath hosting (GitHub Pages, `/my-repo/`)

### Static mode
Use **relative paths** so the app works under a subpath:
- In HTML: `./timeline.js`, `./styling.css`
- In `data.js`: `image_base_url = "images/"` (NOT `"/images/"`)

### React/Vite mode
Set Vite’s base path and use `BASE_URL` for images:

- `vite.config.js`:

```js
export default {
  base: "/my-repo/",
};
```

- Use `import.meta.env.BASE_URL + "images/"` (prop or `src/data.js`)

If you forget this, images often work in `npm run dev` but 404 after deploying to `/my-repo/`.

---

### CMS / page builders (WordPress, Drupal, Shopify themes, etc.)

These platforms can run the timeline, but there are two common constraints:

1) **`type="module"` must be preserved**
   `timeline.js` is an ES module. If your CMS/theme/plugin strips or rewrites `<script type="module">`, the timeline won’t load.
   Use whatever mechanism your platform provides for “raw HTML” / “custom code blocks” / “theme templates” that allows a true module script tag.

2) **Some sites use strict CSP (no inline `<script>`)**
   Django/Flask examples set `window.timeline_*` via an inline `<script>`, which is blocked on many CSP-hardened sites.

#### CSP-friendly setup (no inline script)
You can configure the timeline using query parameters on the `timeline.js` URL:

```html
<script type="module"
  src="/static/js/timeline.js?data=/static/js/data.js&images=/static/images/">
</script>
```

* `data=` sets the module URL for `data.js`
* `images=` sets the base URL for images (same meaning as `image_base_url`)

> Precedence: `window.timeline_*` overrides still win if you set them elsewhere.

#### If your optimizer strips query strings

Some CMS optimization/minification plugins remove query parameters from asset URLs. If that happens, use a small **external** config file instead of inline script:

```html
<script src="/static/js/timeline.config.js"></script>
<script type="module" src="/static/js/timeline.js"></script>
```

Where `timeline.config.js` sets:

```js
window.timeline_data_url = "/static/js/data.js";
window.timeline_image_base_url = "/static/images/";
window.timeline_set_document_title = false;
```

(External scripts typically work with CSP as long as the script source is allowed.)

---

## Troubleshooting (common failure modes)

### Blank page
- Open DevTools Console.
- If you see: **`[Timeline] Missing #timeline container.`**
  - Your HTML/template is missing `<main id="timeline"></main>` (required).

### ES module / CORS errors
- Don’t run from `file:///...`. Use a local server:
  - `python3 -m http.server 8000`
  - open `http://localhost:8000/`

### Offcanvas menu doesn’t open (mobile TOC button is disabled)
- You are missing **Bootstrap JS bundle**.
  - Static/Django: include `bootstrap.bundle.min.js`
  - React: import it (global) or pass `bootstrap={bootstrap}`
- Without Bootstrap JS, the project intentionally disables the offcanvas button to avoid “button does nothing” confusion.

### TOC highlight doesn’t follow scrolling
- ScrollSpy requires **Bootstrap JS**.
- Without Bootstrap JS, TOC “active” state only updates on hash changes (clicking a TOC item), not on scroll.

### Data not loading
- `timeline.js` imports `data.js` at runtime (default `./data.js`).
- Override the module URL if needed:

```html
<script>window.timeline_data_url = "./data.js";</script>
```

- Or skip importing `data.js` and provide `window.timeline_event_data`, etc. (see “Configuration overrides”).

### Images not showing (404s)
- Check naming:
  - Thumb: `${name}_rs.jpg` (always jpg)
  - Full: `${name}.${fullExt}`
- Confirm `image_base_url` ends with `/` or is a folder like `"images/"`.
- For Vite subpaths, use `import.meta.env.BASE_URL + "images/"`.

---

## Advanced: embedding without global styling

If you need to embed the timeline inside a page that already has its own theme, you must scope the CSS.

A common approach:
- Wrap the timeline in a container like `.timeline-page`
- Prefix all selectors in `styling.css` with `.timeline-page`

This repo does not ship a scoped CSS build.

---

## One-liner local servers

- Python (Windows): `py -m http.server 8000`
- Python (macOS/Linux): `python3 -m http.server 8000`
- Node: `npx http-server -p 8000`

---

## Usage Summary (GitHub description)

A drop-in, data-driven history timeline that renders from `data.js` into a responsive Bootstrap layout (desktop alternating timeline + synced image gallery, mobile single-column with interleaved images). Works as pure static HTML/ESM, a Django template, or a React/Vite component, with optional Bootstrap JS enabling ScrollSpy + offcanvas navigation.

---

## FAQ

**Why doesn’t it work when I double-click the HTML file?**
ES modules usually can’t import from `file://`. Use a local server (`python -m http.server`).

**Why are my images 404 on GitHub Pages?**
If you’re hosted at `/my-repo/`, use relative paths (static) or Vite `base` + `import.meta.env.BASE_URL` (React).

**What image filenames are expected?**
Thumbs must be `*_rs.jpg`. Full images are `${name}.${fullExt}`.
