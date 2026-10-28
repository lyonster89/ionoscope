"""Release acceptance against real HTTP/HTTPS files, with deterministic outages.
Run with IONOSCOPE_BROWSER and optional IONOSCOPE_TEST_URL / IONOSCOPE_RESULTS.
Live external checks are separate: python tests/live_services.py.
"""
import json, os
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

URL=os.environ.get('IONOSCOPE_TEST_URL','http://127.0.0.1:8000/')
ENGINE=os.environ.get('IONOSCOPE_BROWSER','chromium')
OUT=Path(os.environ.get('IONOSCOPE_RESULTS','test-results')); OUT.mkdir(parents=True,exist_ok=True)
results=[]
def check(ok, label):
    results.append({'check':label,'passed':bool(ok)})
    print(('PASS ' if ok else 'FAIL ')+label,flush=True)
    if not ok: raise AssertionError(label)

def number(page,key): return page.locator(f'input[data-field="{key}"][type="number"]')
def card(page,text): return page.locator('#sourceRows .source-card').filter(has_text=text).first
def imp(page,text): card(page,text).get_by_role('button',name='IMPORT',exact=True).click()

with sync_playwright() as p:
    browser=getattr(p,ENGINE).launch()
    for width,height in [(1440,900),(768,1024),(390,844),(320,700)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<800)
        page.set_default_timeout(10000)
        errors=[]; local_fail=[]; calls=[]; mode={'kp':'fallback','terrain':'good'}
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:local_fail.append((r.status,r.url)) if r.status>=400 and r.url.startswith(URL) else None)
        def route(req):
            u=req.request.url; calls.append(u)
            now=datetime.now(timezone.utc).isoformat()
            body=None
            if 'f107_cm_flux.json' in u: body=[{'time_tag':now,'flux':181}]
            elif 'planetary_k_index_1m' in u:
                if mode['kp']=='fallback': req.fulfill(status=503,body='outage'); return
                if mode['kp']=='bad': body=[{'time_tag':now,'kp_index':99}]
                else: body=[{'time_tag':now,'kp_index':3}]
            elif 'noaa-planetary-k-index' in u:
                body=[['time_tag','Kp'],[now,'4']] if mode['kp']!='bad' else []
            elif '/v1/elevation' in u: body={'elevation':[110,220] if mode['terrain']=='good' else [None,20]}
            elif 'opentopodata' in u: body={'results':[{'elevation':120},{'elevation':230}]}
            elif 'geocoding-api' in u: body={'results':[{'latitude':51.5072,'longitude':-.1276,'name':'London','country':'UK'}]}
            if body is None: req.abort()
            else: req.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(body))
        # Block third-party dependencies and substitute explicit service fixtures.
        page.route('https://**/*',route)
        # The public site itself must remain real when running this suite on Pages.
        if URL.startswith('https://'): page.route(URL+'**',lambda r:r.continue_())
        page.goto(URL,wait_until='domcontentloaded')
        expect(page.locator('#worldMap canvas.offline-world-canvas')).to_be_visible()
        check(not errors,f'{width}: boot without runtime errors')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: viewport fits')
        check(page.evaluate('''() => [...document.querySelectorAll('a[href^="#"]')].every(a=>document.getElementById(a.hash.slice(1)))'''),f'{width}: navigation targets exist')
        check(float(page.locator('#metricDistance').inner_text().replace(',',''))>0,f'{width}: RF geometry populated')
        tx=number(page,'txLat'); rx=number(page,'rxLat'); before=tx.input_value()
        page.locator('[data-map-target="tx"]').click()
        box=page.locator('#worldMap canvas').bounding_box()
        page.locator('#worldMap canvas').click(position={'x':box['width']*.58,'y':box['height']*.4})
        check(tx.input_value()!=before,f'{width}: map placement changes TX')
        oldtx=tx.input_value(); oldrx=rx.input_value(); page.locator('#swapStationsBtn').click()
        check(tx.input_value()==oldrx and rx.input_value()==oldtx,f'{width}: TX/RX swap')
        page.locator('#zoomPathBtn').click()
        page.locator('#txGrid').fill('IO91wm'); page.locator('#txGrid').press('Enter')
        check(51<float(tx.input_value())<52,f'{width}: keyboard grid search')
        page.locator('#rxSearch').fill('London'); page.locator('#rxSearch').press('Enter')
        expect(rx).to_have_value('51.5072')
        check(True,f'{width}: geocoding moves RX')
        page.locator('#baselineBtn').click(); expect(page.locator('#comparisonPanel')).to_contain_text('BASELINE')
        number(page,'txPower').fill('100'); page.locator('#map-title').click()
        expect(page.locator('#budgetEquation')).to_contain_text('50.0 dBm TX')
        a=float(page.locator('#budgetRx').inner_text())
        number(page,'txPower').fill('1000'); page.locator('#map-title').click()
        expect(page.locator('#budgetEquation')).to_contain_text('60.0 dBm TX')
        expect(page.locator('#budgetRx')).not_to_have_text(f'{a:.1f}')
        b=float(page.locator('#budgetRx').inner_text())
        check(abs(b-a-10)<.15,f'{width}: power decade adds 10 dB')
        slider=page.locator('input[data-field="txPower"][type="range"]'); slider.fill('300')
        expect(number(page,'txPower')).to_have_value('300')
        check(True,f'{width}: slider synchronizes number')
        number(page,'txPower').fill('999999'); page.locator('#map-title').click()
        expect(number(page,'txPower')).to_have_value('1000')
        check(True,f'{width}: numeric limits enforced')
        # Exercise every selectable TX/RX antenna and the associated render paths.
        for side in ['tx','rx']:
            select=page.locator('#'+side+'Antenna')
            for value in select.locator('option').evaluate_all('(xs)=>xs.map(x=>x.value)'):
                select.select_option(value)
                page.wait_for_timeout(35)
                check('NaN' not in page.locator('#budgetEquation').inner_text(),f'{width}: {side} antenna {value} finite')
        page.locator('#txAntenna').select_option('yagi')
        number(page,'txAzimuth').fill('120'); page.locator('#map-title').click()
        check(number(page,'txAzimuth').is_enabled(),f'{width}: directional controls enabled')
        page.locator('#sourceMode').select_option('automatic')
        imp(page,'10.7 cm solar flux'); expect(number(page,'sfi')).to_have_value('181')
        check('IMPORTED' in card(page,'10.7 cm solar flux').inner_text(),f'{width}: SFI import and provenance')
        imp(page,'Planetary Kp'); expect(number(page,'k')).to_have_value('4')
        check(any('noaa-planetary-k-index' in u for u in calls),f'{width}: automatic secondary after HTTP 503')
        mode['kp']='bad'; imp(page,'Planetary Kp'); expect(card(page,'Planetary Kp')).to_contain_text('STALE')
        check(number(page,'k').input_value()=='4',f'{width}: malformed providers preserve prior value')
        number(page,'k').fill('2'); page.locator('#map-title').click()
        expect(card(page,'Planetary Kp')).to_contain_text('MANUAL')
        page.locator('#sourceMode').select_option('ask'); mode['kp']='fallback'
        imp(page,'Planetary Kp'); expect(card(page,'Planetary Kp')).to_contain_text('ACTION-NEEDED')
        card(page,'Planetary Kp').get_by_role('button',name='SWITCH & RETRY').click()
        expect(number(page,'k')).to_have_value('4')
        check(True,f'{width}: ask fallback requires explicit switch')
        page.locator('#sourceMode').select_option('automatic'); imp(page,'Station terrain')
        expect(card(page,'Station terrain')).to_contain_text('IMPORTED')
        check(True,f'{width}: terrain import')
        mode['terrain']='bad'; imp(page,'Station terrain')
        expect(card(page,'Station terrain')).to_contain_text('STALE')
        check(True,f'{width}: invalid terrain preserves previous data with stale warning')
        # Export/download and import are real browser file operations.
        with page.expect_download() as download:
            page.locator('#exportScenarioBtn').click()
        exported=Path(download.value.path()).read_text(); data=json.loads(exported)
        check(data['schema']=='ionoscope-v2',f'{width}: scenario exports valid JSON')
        data['state']['frequency']=7.15
        page.locator('#scenarioFile').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
        expect(number(page,'frequency')).to_have_value('7.15')
        data['state']['frequency']=999
        page.locator('#scenarioFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
        check(number(page,'frequency').input_value()=='7.15',f'{width}: invalid scenario rejected atomically')
        page.locator('#saveScenarioBtn').click()
        number(page,'frequency').fill('14.2'); page.locator('#map-title').click()
        page.locator('#savedScenarios button').last.click(); expect(number(page,'frequency')).to_have_value('7.15')
        check(True,f'{width}: saved scenario restores')
        page.locator('#themeBtn').click(); check(page.locator('body').get_attribute('data-theme')=='light',f'{width}: light theme')
        page.locator('#mapBasemap').select_option('osm'); expect(page.locator('#mapBasemap')).to_have_value('vector')
        check(page.locator('#worldMap canvas').count()==1,f'{width}: missing CDN falls back offline')
        page.locator('#map').scroll_into_view_if_needed(); page.screenshot(path=str(OUT/f'{ENGINE}-{width}-map.png'))
        check(not errors,f'{width}: no runtime errors after interactions: {errors}')
        check(not local_fail,f'{width}: no failed local resources: {local_fail}')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: layout fits after interactions')
        page.close()
    # Reproduce the near-midnight initialization error and hostile share inputs.
    for query in ['', '?utcHour=100&hops=1.5', '?dateISO=2026-02-30', '?txHeightM=99999']:
        page=browser.new_page(); page.route('https://**/*',lambda r:r.abort())
        if URL.startswith('https://'): page.route(URL+'**',lambda r:r.continue_())
        page.clock.install(time=datetime(2026,10,28,23,59,tzinfo=timezone.utc))
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL+query); expect(page.locator('#worldMap canvas')).to_be_visible()
        check(not errors,'23:59 UTC / invalid share boots safely '+query)
        check(float(number(page,'utcHour').input_value())<24,'UTC remains in range '+query)
        page.close()
    browser.close()
(OUT/f'{ENGINE}-release.json').write_text(json.dumps({'engine':ENGINE,'url':URL,'checks':results},indent=2))
print(f'PASS {len(results)} release checks in {ENGINE}',flush=True)
