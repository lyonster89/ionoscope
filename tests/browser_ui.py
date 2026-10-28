"""Chromium offline browser validation. In restricted test environments
navigation is blocked; this harness loads exact repository modules via Blob URLs.
It does NOT validate HTTPS hosting, CDN delivery, network requests or Safari.
Run: python tests/browser_ui.py (requires playwright and Chromium installed).
"""
from pathlib import Path
import re,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S|re.I)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*/?>','',html,flags=re.I)
html=html.replace('</head>','<style>'+ (ROOT/'css/style.css').read_text()+'</style></head>')
sources={p.name:p.read_text() for p in (ROOT/'js').glob('*.js')}
loader='''async (sources)=> {const links={};const build=(name)=>{if(links[name])return links[name];let code=sources[name];if(!code)throw Error('Missing module '+name);code=code.replace(/from ['"]\\.\\/([^'"?]+)(?:\\?[^'" ]+)?['"]/g,(m,dep)=>'from "'+build(dep)+'"');const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));links[name]=url;return url;};return await import(build('app.js'));}'''
results=[]
def check(width,condition,description):
    passed=bool(condition)
    results.append({'width':width,'check':description,'passed':passed})
    print(('PASS' if passed else 'FAIL'),width,description)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,900),(768,1024),(390,844),(320,700)]:
  page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded');page.evaluate(loader,sources)
  page.wait_for_timeout(400)
  check(width,not errors,'no uncaught JavaScript errors')
  check(width,page.locator('#worldMap canvas.offline-world-canvas').count()==1,'offline world map renders')
  check(width,page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'no horizontal viewport overflow')
  check(width,page.locator('#metricDistance').inner_text()!='—','path calculations populated')
  check(width,page.locator('#windowChart').count()==1,'24h chart canvas exists')
  check(width,page.evaluate("() => [...document.querySelectorAll('a[href^=\"#\"]')].every(a=>!!document.getElementById(a.getAttribute('href').slice(1)))"),'all anchor targets exist')
  page.locator('#map').scroll_into_view_if_needed();page.wait_for_timeout(120)
  (Path('/mnt/data')/f'ionoscope-v24-map-{width}.png').parent.mkdir(parents=True,exist_ok=True)
  page.screenshot(path=str(Path('/mnt/data')/f'ionoscope-v24-map-{width}.png'))
  if width==1440:
   tx=page.locator('input[data-field="txLat"][type="number"]');rx=page.locator('input[data-field="rxLat"][type="number"]')
   before=tx.input_value();page.locator('[data-map-target="tx"]').click()
   canvas=page.locator('#worldMap canvas');rect=canvas.bounding_box()
   page.mouse.click(rect['x']+rect['width']*.58,rect['y']+rect['height']*.42)
   check(width,tx.input_value()!=before,'map click updates TX latitude')
   txNow=tx.input_value();rxNow=rx.input_value()
   page.locator('#swapStationsBtn').click()
   check(width,tx.input_value()==rxNow and rx.input_value()==txNow,'swap exchanges TX and RX')
   page.locator('#zoomPathBtn').click()
   check(width,page.locator('#worldMap canvas').count()==1,'fit path retains functioning map')
   beforeRx=page.locator('#metricRx').inner_text()
   page.locator('input[data-field="txPower"][type="number"]').fill('250')
   page.wait_for_timeout(180)
   check(width,page.locator('#metricRx').inner_text()!=beforeRx,'power typing changes RX estimate')
   page.locator('input[data-field="txPower"][type="range"]').fill('320')
   check(width,page.locator('input[data-field="txPower"][type="number"]').input_value()=='320','power slider updates typed field')
   page.locator('input[data-field="txPower"][type="number"]').fill('50000')
   page.locator('#map-title').click()
   check(width,float(page.locator('input[data-field="txPower"][type="number"]').input_value())<=1000,'typed power clamps at valid maximum')
   page.locator('#themeBtn').click()
   check(width,page.locator('body').get_attribute('data-theme')=='light','daylight theme operates')
   page.locator('#baselineBtn').click()
   check(width,'BASELINE' in page.locator('#comparisonPanel').inner_text(),'baseline comparison operates')
   page.locator('#sourceMode').select_option('ask')
   page.evaluate('() => {window.fetch=async () => {throw new Error("offline test")};}')
   kp=page.locator('#sourceRows .source-card').filter(has_text='Planetary Kp').first
   kp.locator('button',has_text='IMPORT').click()
   page.wait_for_timeout(170)
   check(width,kp.locator('button',has_text='SWITCH & RETRY').count()==1,'ask source fallback presents alternative')
   page.locator('#mapBasemap').select_option('osm')
   page.wait_for_timeout(90)
   check(width,page.locator('#worldMap canvas').count()==1,'missing Leaflet gracefully falls back to offline map')
   check(width,page.locator('#mapBasemap').input_value()=='vector','fallback selector reports the active offline map')
   page.locator('#todayBtn').click()
   check(width,bool(page.locator('input[data-field="dateISO"]').input_value()),'date control operational')
   check(width,not errors,'no errors after interactions')
  page.close()
 b.close()
print('RESULTS',sum(x['passed'] for x in results),'/',len(results))
Path('/mnt/data/ionoscope-v24-browser-results.json').write_text(json.dumps(results,indent=2))
if not all(x['passed'] for x in results):raise SystemExit(1)
