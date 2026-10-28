> Deployment and current verification: see [RELEASE_QA.md](RELEASE_QA.md). The historical feature notes below predate the final release audit. Open Topo Data was removed because its browser requests fail CORS; Open-Meteo supplies terrain.

# IONOSCOPE 2.4 — HF Propagation Learning Hub & Interactive RF Path Lab

**A static, GitHub Pages-compatible HF radio propagation laboratory.** Version 2 extends the original Academy, Ray Lab, Link Budget and Band Planner with an interactive world map, independent transmitter/receiver antennas, date-aware solar geometry, dual slider/number controls, scenario comparison, and browser-based data-provider selection with fallback. **No server-side runtime, API keys, or compilation is required; a GitHub Actions verification gate is included for safe publication.**

> **IMPORTANT:** The propagation model is **educational and heuristic**, not a validated ITU-R P.533, VOACAP, IRI or real-ionogram prediction. A successful modeled link is not evidence of an actual radio opening. External *observed global solar indices* do not make the underlying skywave model an operational forecast. Always use licensed frequencies and regulatory permissions for radio transmission.

## Quick start: GitHub Pages

1. Create a GitHub repository named `ionoscope` (or any name).
2. Upload the **contents** of this folder to the repository root. `index.html`, `css/`, `js/`, and `assets/` must be at the root.
3. In GitHub, visit **Settings → Pages → Build and deployment**.
4. Select **GitHub Actions** as the Pages source (not branch publishing), then push to `main`. The included workflow tests and deploys the site after all checks succeed.
5. Open `https://YOUR-USERNAME.github.io/ionoscope/` once deployed.

No `npm build`, database, or application server is needed. GitHub Actions runs release tests before publishing. Optional dependencies (Leaflet, Chart.js, and Lucide) are loaded through CDNs. The **default map uses embedded public-domain Natural Earth geometry** and continues working without map tiles or Leaflet. Raster tiles can be selected manually through the map view dropdown. Tailwind Play CDN has been removed because it interfered with map styling and was unnecessary for production.

**Local preview:** Browsers restrict ES modules on `file://` pages. In the project directory run `python3 -m http.server 8000`, then visit `http://localhost:8000`.

**Tests:** Install Node.js 18+ and run `npm test` (no `npm install`). There are **53** automated calculation, import/fallback and map-geometry tests.


## Version 2.4 — deployment-gated release candidate

This release fixes the remaining offline and data-integrity defects found during the
production-preparation review: stale requests cannot overwrite a scenario after TX/RX
coordinates, simulation date, or imported data have changed; cancel stops all tracked
requests; overlapping imports cannot apply out of order; providers in saved preferences
are deduplicated; an online basemap that does not load returns to a functional local
vector map; and map action buttons have an explicit, readable visual treatment.
Station-search inputs support Enter, and coordinate edits update the change explanation.

**Release gate:** `.github/workflows/deploy.yml` runs Node calculation/regression
checks, JavaScript syntax validation, and browser tests on the **actual HTTP-served
repository files** in Chromium, Firefox, and WebKit, with offline failure injection.
It deploys to Pages **only after validation succeeds**. Set repository
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
Do **not** simultaneously use branch-based Pages publishing, as that bypasses
the validation gate. First run must succeed before considering the live site released.

**What has been verified in the authoring environment:** 59 Node tests and 37
offline Chromium interaction checks at 320/390/768/1440px, including map, data
controls, and source fallback. Direct HTTP browser navigation is blocked in this
authoring environment; live GitHub Actions results, Safari/Firefox/WebKit execution,
CDN/tile delivery and live NOAA/geocoding CORS are **not yet verified**. The
application falls back to offline map/chart/manual simulation, but these constraints
must not be described as live integrations that have passed field acceptance.
The predictor remains a physics-inspired **educational heuristic**, not validated
operational HF forecasting software.

To run local verification:

```bash
npm test
python -m http.server 8000
# In a second terminal (requires Playwright + browsers):
python tests/http_e2e.py
IONOSCOPE_BROWSER=firefox python tests/http_e2e.py
IONOSCOPE_BROWSER=webkit python tests/http_e2e.py
```

See `RELEASE_QA.md` for the scope, limitations, and release decision.

## Map reliability update (2.2 and 2.3)

**Verified cause of one earlier failure:** Leaflet's CSS was served with an incorrect Subresource Integrity (SRI) hash. Browsers reject files when the actual bytes do not match the declared SHA-256. The stylesheet hash now matches the official Leaflet 1.9.4 download documentation. Tile images no longer request unnecessary cross-origin canvas permissions. The updated offline renderer is bundled as JavaScript geometry (so its continents do not depend on a JSON fetch), and redraw work is cached while station markers are dragged.

**How to test your own deployment:** Open the site with the `Offline world map` option selected. You should see North America, colored TX/RX dots, a line between them and +/- zoom buttons. Press **PLACE TX**, then click somewhere on the map; the TX coordinates below and path distance should change. Switch to **OpenStreetMap** to try detailed street tiles. If CDN access or tiles are blocked, the offline map remains usable. The web host must serve files over HTTP(S); double-clicking `index.html` via `file://` blocks the site's ES modules. A visible message now explains this if that is the problem.


The original map could render confusing solar lines and produce a stretched route when TX/RX straddled the international date line. The new implementation uses an ordered solar terminator great circle and continuous, unwrapped route coordinates. The default **Offline world map** embeds Natural Earth geographic geometry in `js/world-data.js` and does not require runtime fetches, Leaflet, an external map server, or a network connection. The offline map includes labeled landmarks, click-to-place TX/RX, draggable stations, zoom/pan, and a live coordinate readout. The static coastline map is deliberately not street-level imagery. Clicking and dragging stations works on this map, including the Fit Path control. The optional **OpenStreetMap** and **OpenTopoMap** map views require an internet connection and availability under their usage policies; **Automatic tiles / fallback** tries them in that order and switches to the local vector map if requests fail. Some providers can return a blocked tile image with HTTP 200, which cannot reliably be identified as an error in ordinary browser-only JavaScript. If map images show blocks, choose Vector map immediately.

**Map permissions:** Some hosted tile services require an API key and may watermark keyless requests. Those providers are not offered as keyless defaults. The built-in Natural Earth coastlines are public domain; no third-party raster tiles are distributed or preloaded for offline use.

## Professional audit and repair release (v2.3)

The v2.3 audit reviewed runtime map behavior, narrow-screen layout, radio-control synchronization, saved scenario handling, simulated data imports, provider fallback, engineering calculation boundaries, date/time UI, unavailable optional CDNs, and release deployment. See [AUDIT_REPORT.md](AUDIT_REPORT.md) for reproducible findings, repairs, and remaining limitations.

Specific updates: self-contained math utilities eliminate circular imports; the offline map now exposes TX and RX coordinates and a swap action; mobile panel controls no longer widen the viewport; icon placeholders have a local fallback; user-entered numerical values clamp on commit; scenario imports are validated before changing state; date/location changes mark affected observations stale; manual/approval-based provider modes never silently switch, and failed sources display a selectable retry action; individual import cancellation works; minute-level UTC controls now synchronize; all local ES modules and styles use release-specific cache-busting queries.

A restricted Chromium browser harness verified map rendering and interactive controls at 1440, 768, 390, and 320 pixel widths. It cannot verify live third-party tile/CDN/API access. For actual network-enabled deployment verification, open the published GitHub Pages URL with DevTools and use the steps in the audit report.

## Features

| Module | What it does |
| --- | --- |
| World path map | Reliable offline vector map by default, optional Leaflet/OpenStreetMap/OpenTopoMap tile views, click-to-place or drag TX/RX markers, location search, Maidenhead 4/6/8-character locator entry, great-circle bearing, physically ordered solar terminator and solar elevation |
| Antenna studio | Independent TX/RX antenna selection; dipole, inverted V, quarter-wave vertical, end-fed, random wire, loops, Yagi, trap dipole, NVIS, ground plane, Beverage RX, custom gain; orientation, height, efficiency, and ground-loss model; azimuth/elevation plots |
| Synchronized controls | Every adjustable **numeric** input has both a slider and a typed value; date has native date picker and UTC-time slider + time field; each active field changes a displayed physical quantity or explanation |
| Physics academy | Original D/E/F1/F2 educational SVG, skip zone, MUF/LUF/FOT and solar/geomagnetic indices |
| Ray visualizer | Spherical virtual-hop model, takeoff angle, 1–3 hops, signal/antenna gain annotation, reception status, geometric failure diagnoses |
| Link budget | Antenna-directional gains on both ends, user gain corrections, TX power, losses, polarization allowance, noise/SNR, communication-mode margin, waterfall dB ledger |
| Band planner | 160 m–10 m model compatibility and 24-hour MUF/FOT/LUF curves |
| Data source manager | Independently selectable compatible sources by category; **Automatic / Manual / Ask before switching** modes, reorderable fallback priority, per-provider disable, source test/import actions, timestamps, status messages, cancellation, partial imports |
| Compare | Capture a baseline, compare current gains/SNR/status, save/load up to eight local scenarios, export/import JSON, share URL |

Controls that **do not have a meaningful effect under the selected antenna model are disabled** (e.g., beam azimuth for an omnidirectional vertical, custom gain for a preset antenna). Each disabled control explains that limitation. This is preferable to visualizing fake physics.

## External data sources and what is actually imported

The manager uses **real browser fetches** and validates required fields and observation timestamps. Each category can use a different source simultaneously. Users can choose a preferred provider and reorder or disable fallback options.

| Category | Implemented adapters | Notes |
| --- | --- | --- |
| F10.7 solar flux | [NOAA SWPC F107 archive JSON](https://services.swpc.noaa.gov/json/f107_cm_flux.json), [NOAA SWPC 30-day solar flux](https://services.swpc.noaa.gov/products/10cm-flux-30-day.json) | Two real NOAA product endpoints; same institution; observations only, **not independent scientific confirmations** |
| Planetary Kp | [SWPC minute-updated Kp](https://services.swpc.noaa.gov/json/planetary_k_index_1m.json), [SWPC 3-hour planetary Kp](https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json) | Alternate cadence/endpoints; values are global indices, not path-local Kp |
| Sunspot number | [SWPC monthly observed solar-cycle indices](https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json) | **Monthly mean**. The requested month must be present. Does not substitute a later month's value. |
| TX/RX terrain elevation | [Open-Meteo Copernicus DEM](https://open-meteo.com/en/docs/elevation-api), [Open Topo Data SRTM90m](https://www.opentopodata.org/) | Elevations for both station coordinates; **context-only** (not used as invented skywave-loss terms). Sources have distinct coverage, licensing and rate limits. |
| Daily A-index | No verified browser adapter in this release | Adjustable manually; never pretends predicted/local A is observed planetary A. |
| TEC / electron density | [NOAA GloTEC](https://www.swpc.noaa.gov/products/glotec) product link, **no validated numerical browser adapter** | The GloTEC map is a separate ionospheric product and cannot be treated as measured foF2 without a supported mapping and model. |
| D-region absorption | [NOAA D-RAP](https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap) product link, **no validated numerical browser adapter** | Event-specific D-RAP absorption is not interchangeable with normal daylit absorption. |
| Location search | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api), [OSM Nominatim](https://nominatim.org/release-docs/latest/api/Search/) | User-triggered city searches; separate provider choice and fallback. Nominatim public API maximum **1 request/second**, requires identifying HTTP referrer and attribution; avoid high-volume use. |

**Source behavior:** A status of `IMPORTED` means a validated record was accepted and applied; `AVAILABLE` means a test fetch was validated but not applied. `UNAVAILABLE`, `STALE`, `ACTION-NEEDED`, or `UNSUPPORTED` are shown without silently claiming imported readings. Every record includes its provider and original timestamp when available. Already-imported values can be retained as clearly labeled stale scenario values on a later failure. Manually moving a source-controlled slider changes that input to a manual scenario, not a measured live value.

**Historical, current, future:** Live F10.7/Kp adapters only import for the selected current UTC date; the monthly SSN adapter searches the selected month in the historical observations, and terrain elevation is independent of short-term time. The app does not invent a future forecast, substitute today's observations for historical dates, or present simulated skywave MUF as an observation. Historical A, TEC and absorption feeds are not automatically imported. A failed browser CORS request or provider outage cannot be repaired from a static web page; users can manually switch sources or configure an optional third-party proxy **outside this repository**. Never embed secret API keys in GitHub Pages scripts.

**Source license/usage:** Bundled country outlines come from the Natural Earth public-domain world dataset. Leaflet map tile services require attribution; OpenTopoMap tiles are CC-BY-SA attributed to OpenTopoMap and OpenStreetMap. Attribute data providers. OpenStreetMap public tile services are subject to [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/); heavy or commercial traffic should use an appropriately provisioned tile provider. Open-Meteo, Open Topo Data and other providers have their own API limits/terms. Browser requests require internet access. The source settings and snapshots are stored only in local browser storage.

### Fallback modes

- **Automatic:** Try the preferred enabled compatible provider first, then other enabled providers in order if its endpoint fails or returns an invalid/outdated observation.
- **Manual:** Try **only** the selected preferred provider. Choose another from the dropdown and click Import to retry.
- **Ask:** Attempt the preferred provider. On failure, show the error and compatible alternatives; the user chooses another provider and retries. Nothing changes silently.

The source manager supports **Test** (fetch and validate without applying), **Import** per category, **Import Data** for all supported categories, **Cancel**, priority up/down, and provider enable toggles. Preferences persist across reloads via localStorage.

## Repository layout

```text
ionoscope/
├── index.html
├── css/style.css
├── js/
│   ├── app.js                # UI state, existing academy, budget, band charts, compare
│   ├── propagation-engine.js # great circle, hop and link equations, antenna gain
│   ├── antenna-models.js      # educational TX/RX directional radiation models
│   ├── solar-geometry.js      # calendar-aware solar position, terminator, bearing, grid
│   ├── map-controller.js      # Map view selection, Leaflet tiles, search/drag and route
│   ├── vector-map.js          # Offline canvas vector basemap and TX/RX interaction
│   ├── visualizers.js        # Canvas wave, hop and antenna visualizers
│   ├── source-manager.js     # provider registry, parsers and compatibility checks
│   ├── data-import.js        # fetch, validate, fallback, status, manual override
│   └── ui-controls.js        # synced interactive numeric controls, education tooltips
├── tests/
│   ├── propagation-engine.test.js
│   ├── v2-features.test.js
│   └── map-reliability.test.js
├── assets/favicon.svg
├── assets/world-lowres.geojson # original public-domain source geometry
├── js/world-data.js         # embedded geometry; no fetch needed at runtime
├── package.json
└── README.md
```

## What the physics model means

- **Ray geometry:** Straight-line *virtual rays* on a spherical Earth with a virtual reflection shell. This draws hops, not magnetoionic curved-path ray tracing. MUF is approximately `fo/sin(elevation)` and LUF is a simple noise/daylight proxy.
- **Solar:** Actual astronomical solar position uses the selected UTC date/time, coordinates and an approximate equation of time. A heuristic links daylight, SFI, SSN and geomagnetic indices to F2/E behavior. Those indices are *proxies*, not measured layer critical frequencies for each hop.
- **Antennas:** Pattern models estimate normalized directional gain given antenna class, azimuth, elevation, height in wavelengths (for applicable horizontal antennas), efficiency and ground-loss index for verticals. **These are not NEC measurements, imported pattern files or site-engineered guarantees**. Feedline/gain-correction fields remain independent.
- **Loss:** Uses FSPL for an approximate full ray path plus heuristic per-hop absorption, residual losses, ground reflections and a 6-dB polarization mismatch allowance between modeled horizontal/vertical designs. HF skywave loss can be substantially different in real conditions.
- **Receiver:** Received power uses TX dBm − feedline loss + **modeled TX directional gain** + TX gain correction + **modeled RX directional gain** + RX gain correction − path/absorption/ground/polarization losses. The local noise examples assume a 2.5-kHz reference bandwidth; thresholds/S-units are indicative.
- **Comparison:** Side-by-side scenarios and change explanations are deterministic results of the same *heuristic* engine, not statistically calibrated contact probabilities.

### Important restrictions

The app is a **pure static website**. It cannot guarantee live upstream availability or CORS. External indices are optional and the manual simulator remains available when APIs or mapping tiles fail. The date control does not magically obtain historical ionograms. Some measurements require specialized authenticated services or scientific model conversions and are explicitly marked unsupported here. The site does not supply a real-time band-opening probability.

## Engineering validation

Run `npm test` and `python tests/browser_ui.py` (with Playwright/Chromium installed). The suite covers great circles, hop equations, MUF, FSPL, link-budget sensitivity, solar geometry, Maidenhead conversion, antenna bearing/height effects, source parsing/compatibility, and fallback-vs-manual behavior. Browser CDN rendering and live calls require a normal network-enabled browser; endpoints may impose CORS/rate limits. The HTML includes relative module paths suitable for project-hosted GitHub Pages.

## References

- [ITU-R P.533 — HF circuit performance prediction](https://www.itu.int/rec/R-REC-P.533/en)
- [NOAA SWPC Data Access](https://www.swpc.noaa.gov/content/data-access)
- [NOAA Space Weather scales](https://www.swpc.noaa.gov/noaa-scales-explanation)
- [Open-Meteo elevation](https://open-meteo.com/en/docs/elevation-api)
- [OpenStreetMap attribution and tile policies](https://operations.osmfoundation.org/policies/tiles/)
- [Natural Earth public-domain geographic data](https://www.naturalearthdata.com/about/terms-of-use/)

MIT licensed (see LICENSE). This app is designed for education and experimentation, not safety-critical communication planning.
