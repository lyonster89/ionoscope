"""Tutorial navigation, real delivery, responsive layout and print checks."""
import json,os
from pathlib import Path
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('IONOSCOPE_TEST_URL','http://127.0.0.1:8000/')
ENGINE=os.environ.get('IONOSCOPE_BROWSER','chromium')
OUT=Path(os.environ.get('IONOSCOPE_RESULTS','test-results'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(ok,label):
    checks.append({'check':label,'passed':bool(ok)})
    assert ok,label
    print('PASS',label,flush=True)
with sync_playwright() as p:
    b=getattr(p,ENGINE).launch()
    for width,height in [(1440,900),(768,1024),(390,844),(320,700)]:
        page=b.new_page(viewport={'width':width,'height':height})
        errors=[];failed=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append(r.url) if r.status>=400 and r.url.startswith(URL) else None)
        page.route('https://**/*',lambda r:r.abort())
        if URL.startswith('https://'):page.route(URL+'**',lambda r:r.continue_())
        page.goto(URL,wait_until='domcontentloaded')
        expect(page.locator('#metricDistance')).not_to_have_text('—')
        ids=page.locator('[id]').evaluate_all('(els)=>els.map(e=>e.id)')
        page.get_by_role('link',name='Open practical tutorial',exact=True).click()
        expect(page).to_have_url(urljoin(URL,'tutorial.html'))
        check(page.locator('main section').count()==9,f'{width}: nine tutorial sections delivered')
        check(page.locator('.contents nav a').count()==9,f'{width}: complete contents navigation')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: no horizontal overflow')
        check(page.locator('h1').evaluate('(e)=>getComputedStyle(e).fontSize')!='32px',f'{width}: tutorial stylesheet applied')
        links=page.locator('a[href^="./index.html#"]').evaluate_all('(els)=>els.map(e=>e.getAttribute("href").split("#")[1])')
        check(len(links)==9 and all(x in ids for x in links),f'{width}: all simulator section links resolve')
        for anchor in page.locator('.contents nav a').all():
            target=anchor.get_attribute('href')
            anchor.click()
            expect(page.locator(target)).to_be_in_viewport()
        check(True,f'{width}: every contents link navigates')
        page.locator('footer a[href="#tutorial"]').click()
        page.locator('.contents summary').click()
        check(not page.locator('.contents nav').is_visible(),f'{width}: contents collapses')
        page.locator('.contents summary').click()
        expect(page.locator('.contents nav')).to_be_visible()
        page.locator('h1').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'tutorial-{ENGINE}-{width}.png'))
        page.emulate_media(media='print')
        check(not page.locator('.contents').is_visible(),f'{width}: print hides navigation')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: print layout fits')
        page.emulate_media(media='screen')
        page.get_by_role('link',name='Return to simulator',exact=False).click()
        expect(page.locator('#worldMap canvas')).to_be_visible()
        check(not errors and not failed,f'{width}: return to simulator; no runtime or delivery errors')
        page.close()
    b.close()
(OUT/f'tutorial-{ENGINE}.json').write_text(json.dumps({'engine':ENGINE,'url':URL,'checks':checks},indent=2))
print(f'PASS {len(checks)} tutorial checks in {ENGINE}',flush=True)
