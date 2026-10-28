"""Live browser CORS/provider checks; records service failures without fabricating data.
Checks core UI and fallback while probing every configured public provider.
"""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
URL=os.environ.get('IONOSCOPE_TEST_URL','http://127.0.0.1:8000/')
ENGINE=os.environ.get('IONOSCOPE_BROWSER','chromium')
OUT=Path(os.environ.get('IONOSCOPE_RESULTS','test-results'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    b=getattr(p,ENGINE).launch(); page=b.new_page(viewport={'width':1440,'height':900})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL,wait_until='networkidle',timeout=60000)
    expect(page.locator('#worldMap canvas')).to_be_visible()
    print('DEPENDENCIES',page.evaluate('({leaflet:!!window.L,chart:!!window.Chart,icons:!!window.lucide})'),flush=True)
    probes=page.evaluate('''async () => {
      const m=await import('./js/source-manager.js?v=2.4');
      const state={txLat:47.6062,txLon:-122.3321,rxLat:39.7392,rxLon:-104.9903};
      const out=[];
      // Sequential geocoding requests avoid bursts to public services.
      for(const [category,providers] of Object.entries(m.SOURCE_PROVIDERS))for(const provider of providers){
        const url=m.providerUrl(provider,category,state,'London');
        try {
          const r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store'});
          if(!r.ok)throw Error('HTTP '+r.status);
          const parsed=m.parseMeasurements(category,provider.id,await r.json());
          out.push({category,id:provider.id,url,ok:true,...parsed});
        } catch(e) {out.push({category,id:provider.id,url,ok:false,error:String(e)});}
      }
      return out;
    }''')
    for probe in probes: print(json.dumps(probe),flush=True)
    ui_imports=[]
    for label,field in [('10.7 cm solar flux','sfi'),('Planetary Kp','k'),('Station terrain',None)]:
        card=page.locator('#sourceRows .source-card').filter(has_text=label).first
        card.get_by_role('button',name='IMPORT',exact=True).click()
        expect(card.locator('.source-badge')).not_to_have_text('CONNECTING',timeout=25000)
        record={'category':label,'status':card.locator('.source-badge').inner_text(),'message':card.locator('.source-note').inner_text()}
        if field: record['value']=page.locator(f'input[data-field="{field}"][type="number"]').input_value()
        ui_imports.append(record);print('LIVE IMPORT',json.dumps(record),flush=True)
        assert record['status']=='IMPORTED',record
    # A current month's monthly mean is not yet published. Request an existing
    # completed month explicitly rather than relabeling September as October.
    monthly=next(x for x in probes if x['category']=='ssn' and x['ok'])
    page.locator('#dateISO').fill(monthly['timestamp'][:7]+'-15')
    ssn=page.locator('#sourceRows .source-card').filter(has_text='Sunspot number').first
    ssn.get_by_role('button',name='IMPORT',exact=True).click()
    expect(ssn.locator('.source-badge')).to_have_text('IMPORTED',timeout=25000)
    ui_imports.append({'category':'historical monthly SSN','status':'IMPORTED','message':ssn.locator('.source-note').inner_text()})
    maps=[]
    for mode in ['osm','topo','auto']:
        page.locator('#mapBasemap').select_option(mode)
        page.wait_for_timeout(11000 if mode!='auto' else 19000)
        result={'requested':mode,'active':page.locator('#mapBasemap').input_value(),'status':page.locator('#mapEngineStatus').inner_text(),'loadedTiles':page.locator('#worldMap img.leaflet-tile-loaded').count(),'offlineCanvas':page.locator('#worldMap canvas.offline-world-canvas').count()}
        maps.append(result); print('MAP',json.dumps(result),flush=True)
        assert result['loadedTiles']>0 or result['offlineCanvas']==1
    # Real Leaflet with tile requests failing must also restore a usable map.
    page.route('**/*tile.openstreetmap.org/**',lambda r:r.abort())
    page.route('**/*tile.opentopomap.org/**',lambda r:r.abort())
    page.locator('#mapBasemap').select_option('vector')
    page.locator('#mapBasemap').select_option('auto')
    expect(page.locator('#worldMap canvas.offline-world-canvas')).to_be_visible(timeout=25000)
    expect(page.locator('#mapBasemap')).to_have_value('vector')
    maps.append({'requested':'auto with both tile hosts blocked','active':'vector','status':page.locator('#mapEngineStatus').inner_text()})
    page.locator('#map').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{ENGINE}-live-map.png'))
    assert not errors,errors
    (OUT/f'{ENGINE}-live.json').write_text(json.dumps({'engine':ENGINE,'url':URL,'providers':probes,'imports':ui_imports,'maps':maps,'errors':errors},indent=2))
    b.close()
