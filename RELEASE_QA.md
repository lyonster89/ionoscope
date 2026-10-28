# IONOSCOPE v2.4 release verification — 2026-10-28

Repository: https://github.com/lyonster89/ionoscope
Website: https://lyonster89.github.io/ionoscope/

## Release gate

The GitHub Actions workflow requires Node regression tests, JavaScript syntax checks,
and real HTTP acceptance tests in Chromium, Firefox and WebKit before publishing.
Each engine exercises desktop (1440x900), tablet (768x1024), phone (390x844) and
small phone (320x700). Browser JSON results and screenshots are retained as an
Actions artifact. Only website assets are published; tests and reports stay in Git.

Publication is followed by separate testing of the actual HTTPS website. A successful
build alone is not a declaration that the published site has been verified.

## Fixes from this audit

- Correct UTC startup minutes, including a 23:59 regression scenario.
- Validate shared URL scenarios atomically, including date, bounds and integer hops.
- Reject invalid calendar dates and dates outside the supported 1900–2100 range.
- Reject missing/empty/implausible terrain measurements and empty geocoding coordinates.
- Normalize zone-less NOAA observation timestamps to UTC before age checks.
- Normalize monthly observation dates consistently across browser engines.
- Use SVG for online Leaflet geometry to avoid repainting a disposed canvas during fallback.
- Remove the Open Topo Data backup from selectable providers after live browser CORS
  failures in all three engines. Open-Meteo terrain remains available. Failure retains
  prior values with explicit stale/unavailable status; no observation is invented.
- Correct the older WebKit browser test to scroll the canvas into view before clicking.
- Expand repeatable browser coverage to all antenna types, map placement and swap,
  keyboard grid and geocoding search, RF power changes, sliders and bounds, import
  provenance, malformed responses, automatic and approved fallback, scenario files,
  saved snapshots, themes, missing CDNs and invalid shared scenarios.

## Verification commands

    npm test
    python -m playwright install chromium firefox webkit
    python -m http.server 8000 --bind 127.0.0.1
    python tests/http_e2e.py
    python tests/release_browser.py
    python tests/live_services.py

Repeat with IONOSCOPE_BROWSER set to firefox and webkit. Set IONOSCOPE_TEST_URL to
https://lyonster89.github.io/ionoscope/ for published-site verification; set
IONOSCOPE_RESULTS to an evidence directory. The deterministic suite blocks external
CDNs and supplies explicit service fixtures. The live suite uses actual browser
fetches, parses every configured endpoint, imports current SFI/Kp/terrain and a
completed historical month's SSN through the UI, loads each online basemap, and
blocks both tile hosts in a fresh browser context to verify automatic offline recovery.

## Product scope

This is an educational heuristic, not an operationally validated HF prediction model.
Planetary A-index, TEC and D-RAP assimilation remain explicitly unsupported, with
manual/simulation values clearly distinguished from observations. The current month's
monthly sunspot mean may not yet exist; select a completed month or retain a manual
scenario. Terrain is contextual and does not alter modeled HF skywave attenuation.
Browser viewport emulation does not replace physical-device or assistive-technology testing.

The final testing report supplied with this deployment records the actual published
revision, completed run, live provider results and remaining limitations.
