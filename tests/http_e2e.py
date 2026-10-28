"""Gated real HTTP static-site acceptance test used in GitHub Actions.
Run `python -m http.server 8000` in the repository root, then
`python tests/http_e2e.py`. Install playwright and Chromium first.
Tests local HTTP delivery, ES modules, offline fallbacks and representative UI.
External data integrations are mocked; this does not certify live providers.
"""
import json,os,re
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('IONOSCOPE_TEST_URL','http://127.0.0.1:8000/')


def require(cond, message):
    if not cond: raise AssertionError(message)
    print('PASS', message)

with sync_playwright() as p:
    engine=os.environ.get('IONOSCOPE_BROWSER','chromium')
    browser_type=getattr(p,engine)
    browser=browser_type.launch(headless=True, args=['--no-sandbox'] if engine=='chromium' else [])
    print('Browser:',engine)
    for width,height in [(1440,900),(768,1024),(390,844),(320,700)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[];failed_local=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('response',lambda response: failed_local.append((response.status,response.url)) if response.status>=400 and response.url.startswith(URL) else None)
        def mock_external(route):
            u=route.request.url
            if 'f107_cm_flux.json' in u:
                from datetime import datetime, timezone
                route.fulfill(status=200, content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps([{'time_tag':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'flux':181}]))
            else:
                route.abort()
        # Required core UI must work without third-party scripts, fonts, and tiles.
        page.route('https://**/*',mock_external)
        page.goto(URL,wait_until='domcontentloaded',timeout=20000)
        page.locator('#worldMap canvas.offline-world-canvas').wait_for(timeout=12000)
        page.locator('#metricDistance').wait_for(state='visible')
        expect(page.locator('#metricDistance')).to_have_text(re.compile(r'^[\d,]+$'),timeout=12000)
        page.wait_for_timeout(200)
        require(not errors,f'{width}px: no uncaught JS errors')
        require(not failed_local,f'{width}px: local HTTP resources served without 4xx/5xx')
        require(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}px: no horizontal overflow')
        require(float(page.locator('#metricDistance').inner_text().replace(',',''))>0,f'{width}px: real calculation loaded')
        require(page.locator('#worldMap canvas').count()==1,f'{width}px: offline map rendered')
        require(page.locator('#windowChart').count()==1,f'{width}px: 24h chart available')
        if width==1440:
            tx=page.locator('input[data-field="txLat"][type="number"]')
            before=tx.input_value();page.locator('[data-map-target="tx"]').click()
            bbox=page.locator('#worldMap canvas').bounding_box()
            page.locator('#worldMap canvas').click(position={'x':bbox['width']*.58,'y':bbox['height']*.4})
            require(tx.input_value()!=before,'map changes selected TX coordinates')
            power=page.locator('input[data-field="txPower"][type="number"]')
            previous=page.locator('#metricRx').inner_text();power.fill('400')
            expect(page.locator('#metricRx')).not_to_have_text(previous,timeout=10000)
            require(previous!=page.locator('#metricRx').inner_text(),'typed power changes link budget')
            page.locator('input[data-field="txPower"][type="range"]').fill('300')
            require(power.input_value()=='300','slider is synchronized with typed value')
            page.locator('#sourceMode').select_option('automatic')
            sfi=page.locator('#sourceRows .source-card').filter(has_text='10.7 cm solar flux').first
            sfi.get_by_role('button',name='IMPORT',exact=True).click()
            page.wait_for_timeout(300)
            require(page.locator('input[data-field="sfi"][type="number"]').input_value()=='181','mock scientific import updates control')
            require('IMPORTED' in sfi.inner_text(),'import shows measurement provenance/status')
            page.locator('#mapBasemap').select_option('osm');page.wait_for_timeout(100)
            require(page.locator('#worldMap canvas.offline-world-canvas').count()==1,'offline map survives unavailable Leaflet')
            page.locator('#baselineBtn').click()
            expect(page.locator('#comparisonPanel')).to_contain_text('BASELINE')
            require('BASELINE' in page.locator('#comparisonPanel').inner_text(),'scenario baseline works')
        page.close()
    browser.close()
print('PASS all HTTP acceptance scenarios')
