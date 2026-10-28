# IONOSCOPE v2.4 — production-preparation verification

## Release decision

**Code quality gate: PASS locally. Public deployment gate: PENDING.**
This is a GitHub Pages deployment candidate, not a certification that live third-party
services or every target browser have been tested. The included GitHub Actions workflow
blocks publication until the served-file browser tests pass in three browser engines.
The authoring environment restricts browser navigation and internet connections,
so the actual Pages run is required to establish deployment readiness.

## Source audit: identified fixes

| Finding | Action | Verification |
|---|---|---|
| Old HTTP/UI checks used injected Blob modules instead of actual Pages-style module URLs | Added a real-HTTP browser acceptance test and GitHub Actions deployment gate | Test script and workflow checked into repository; run on push |
| Async scientific import could overwrite a changed station/date or a later manual edit | Abort per-category requests and reject results whose scenario context or generation has changed | New race-condition regression tests |
| Overlapping imports could apply stale results in the wrong order | Unique generation IDs and per-category controllers | Out-of-order completion test |
| Cancel did not always cover all in-progress category requests | Abort all tracked controllers and batch signal | Existing cancel test and additional logic review |
| Online tile providers could leave a partly blank map in manual mode | Restore offline vector map when online basemap is unusable | Browser missing-Leaftlet fallback test |
| Map actions appeared disabled due to native browser button styling | Explicit colors, contrast and backgrounds for buttons | Visual review at desktop and phone sizes |
| Preferred source settings could contain duplicate entries after corrupted storage | Normalize and deduplicate permitted source IDs | Settings regression test |
| City and Maidenhead grid search did not respond to Enter | Add Enter-to-submit keyboard handling | Source/keyboard implementation review |
| Coordinate field edits updated the path but not explanatory change telemetry | Capture previous path and changed field before re-render | Source review and existing control behavior tests |
| Importing or loading saved scenarios could leave old import status/provenance visible | Reset import status on scenario replacement | Source review |

## Local results

- **59/59** automated Node tests passed (physics, geometry, providers, validation, race safety, local file integrity).
- **37/37** Chromium UI checks passed using repository module text loaded as browser Blob modules; checks at 1440, 768, 390 and 320px.
- All JavaScript modules pass `node --check`.
- Reviewed actual desktop and phone screenshots of the offline map.
- No browser JavaScript exceptions observed in the offline UI checks.
- All relative references to local website resources resolve in static integrity tests.

## Production gate, still required

1. Enable **GitHub Actions** (not branch publishing) for GitHub Pages.
2. Confirm workflow success: Node tests, static HTTP serving, Chromium, Firefox and WebKit browser checks, successful Pages publish.
3. On the actual public HTTPS URL, manually confirm tile providers, NOAA and geocoding availability and attribution; if a provider denies browser access, use manual/offline modes or a correctly configured provider/proxy.
4. Verify keyboard/tab interactions and contrast with assistive technology on target devices. Full screen-reader audit has not been completed here.
5. For operating decisions involving safety or mission-critical communications, use a validated HF prediction product or measurements rather than this educational heuristic.

**No blanket production-ready claim is made until the public deployment and its external integrations have passed these checks.**
