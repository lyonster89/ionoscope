# IONOSCOPE v2.3 — Historical source and UX audit (prior release)

Review performed against the **v2.2 map rebuild** source as supplied, followed by repair and a second test cycle. Scope: static HTML/CSS/ES modules, calculation engine, data import/fallback, keyboard/map interactions, source provenance, viewport responsiveness, and GitHub Pages packaging. Source-derived findings are identified below. The HF predictor remains **educational and heuristic**.

## Confirmed issues found and addressed

| Priority | v2.2 finding | Change in v2.3 | Validation |
| --- | --- | --- | --- |
| High | At 390px, the fallback-mode select and map tool row extended outside the viewport, clipping controls and causing horizontal scrolling. | Reflowed map and provider controls into responsive grids, constrained select widths, and fixed horizontal layout overflow. | Chromium checks at 320, 390, 768, and 1440px; no document overflow. |
| High | Physics, antenna, and solar geometry modules depended on each other circularly, complicating loading and maintenance. | Extracted dependency-free numerical helpers into `js/math-utils.js`, removing the cycles. | ES module loading in Chromium and `node --test`. |
| High | Scenario imports accepted any correctly typed string such as unsupported modes/antenna names; also accepted absurd numerical settings. | Added atomic allowlist, date, bounds, integer-hop and coordinate validation in `js/scenario-validation.js`. | Rejection/restore tests and browser baseline test. |
| High | In manual/ask source mode, disabling the preferred provider silently allowed using the second enabled provider. | Disabled-preferred handling now blocks the fetch until users explicitly choose another primary. | Regression tests and browser failure scenario. |
| Medium | “Ask before switching” only showed an error rather than offering a replacement action. | Failure card now exposes a compatible alternative selector plus `SWITCH & RETRY`. | Browser simulated-outage check. |
| Medium | Cancel did not abort a standalone per-category import. | Track and abort individual source requests in addition to batch requests. | Asynchronous cancellation regression test. |
| Medium | Moving the TX/RX stations did not mark prior station-terrain observations stale. | Coordinate changes mark location-dependent imported information stale. | Code review and module regression run. |
| Medium | Changing date retained imported global measurements without a clear stale flag. | Date changes mark time-dependent imported categories stale without fabricating observations. | Code review and module regression run. |
| Medium | Typed numeric values could remain outside slider ranges after editing; fractional hop counts could be entered. | Clamp typed values on commit and round integer-only model settings. | Browser 999999 W test and hop-count regression. |
| Medium | UTC time slider stepped by 15 minutes while editable UTC time accepted one-minute precision, so the two could disagree. | Slider and number field support minute-level increments. | New control and syntax checks; browser smoke boot. |
| Medium | Map users had to scroll to Ray Lab to read exact station coordinates and could not quickly reverse the stations. | Added always-visible TX/RX coordinates, distance and bearing, plus `SWAP TX ↔ RX`. | Browser map placement and swap checks. |
| Medium | CDN icon failure left empty placeholder icons. | Added small local CSS glyph fallbacks for UI icons. | Chromium with external CDNs blocked. |
| Medium | Imports in updated releases still pointed to `?v=2.2`, risking stale browser-cached modules. | Every local JS import, app entry, and CSS URL uses `?v=2.3`. | Static regression test. |
| Low | Version/footer/disclaimer text contradicted the current product, including “no live solar feed”. | Updated product labels and clarified optional global-data imports. | Source review. |
| Low | Offline map status created a temporary toast overlay that obscured small screens. | Map-ready status stays in the inline status area without intrusive toast. | Browser mobile screenshots. |
| Low | Long bottom-map instructional line was truncated on phones. | Shortened mobile-specific map hint. | Browser mobile screenshots. |

## Re-review results

- **Automated Node suite:** 53 tests passing, including physics, great circles/date line, solar grayline, antenna directional effects, data compatibility, provider fallback, cancel handling, scenario validation, and release integrity.
- **Browser UI tests:** 29/29 checks passed using Chromium with locally injected ES modules and CSS. Screens tested at 1440 × 900, 768 × 1024, 390 × 844, and 320 × 700.
- **Browser actions tested:** canvas initialization; map placement; station swapping; Fit Path; slider-to-number and number-to-path updating; out-of-range input clamping; daylight theme; scenario baseline; manual approved-alternative action on provider failure; anchor integrity; and document overflow.
- **JavaScript runtime:** no uncaught page errors observed in this browser test harness.
- **Deployment:** all website resources are relative paths suitable for project GitHub Pages; verified generated ZIP structure and syntax.

## Remaining verification boundaries and known product limitations

1. **Live raster map tiles/Leaflet:** The offline map has been rendered and exercised in Chromium. The environment blocks network navigation, so live OpenStreetMap/OpenTopoMap tile delivery, optional Leaflet CDN loading, and provider-specific policies have **not** been verified against a published GitHub Pages URL. If they fail, the offline world map still works, but detailed street imagery requires provider access. This is an external dependency, not an offline rendering failure.
2. **External scientific/geocoding services:** Live NOAA/Open-Meteo/Nominatim requests and rate limiting were not network-tested here. Automated tests validate sample provider schemas, failure handling, and fallback policy. Source responses can change, and browser CORS restrictions remain outside the app's control.
3. **No operational HF prediction assurance:** These ray, absorption, radiation, and noise calculations are teaching approximations; no formal ITU-R P.533/VOACAP or 3D plasma ray tracer is supplied. Do not interpret “modeled open” as measured contact probability.
4. **Unsupported scientific categories:** TEC/foF2 assimilation, D-RAP numerical paths, and daily planetary A-index still lack verified browser-native adapters. The site labels these unsupported rather than inventing live observations.
5. **Offline basemap geographic detail:** Bundled Natural Earth geometry is coarse by design. It does not include streets/terrain/topographic layers without external tiles.
6. **Cross-browser coverage:** Chromium was tested at four viewport sizes. Safari, Firefox, screen-reader sessions, production CDN availability and live GitHub deployment require verification on those environments.

## How to complete the deployment acceptance test

1. Upload every file from the ZIP, preserving `assets/`, `css/`, `js/`, and `tests/` at repository root.
2. Confirm Settings → Pages publishes from the correct branch and root folder; use HTTPS.
3. In a normal network-enabled browser, open DevTools → Network, hard reload, and confirm every `./js/*?v=2.3` request completes successfully with JavaScript MIME type.
4. Use **Offline world map**. Select TX, click/drag to move it, then move RX; verify coordinates, distance and bearing. Swap and Fit Path.
5. Try **OpenStreetMap**; check whether Leaflet CSS/JS and map image tiles load. If not, check network errors, Content Security Policy, CORS, blockers, tile usage policy and provider availability. Restore the offline basemap.
6. Test changing antenna/frequency, UTC date, and power via both input methods. Compare baseline and current result.
7. In Sources, test SWPC/Open-Meteo requests, simulate a failure by blocking an endpoint, and verify the chosen automatic/manual/ask policy.
8. Run `npm test` to confirm local calculations and validation.

### Bottom line

The confirmed **source-code defects and browser-reproducible offline map/UI problems listed above have been corrected and re-tested**. A claim that every possible issue in every browser and live provider has been eliminated would be inaccurate without testing the actual deployed URL and external network conditions.
