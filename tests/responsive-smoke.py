#!/usr/bin/env python3
"""Browser smoke test: python3 tests/responsive-smoke.py (requires Python Playwright + Chromium).
Runs against a temporary static server; DB-backed /api/img uses a local fixture.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse, parse_qs
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path.startswith('/api/img?'):
            data = (ROOT / 'assets/img/work-1.jpg').read_bytes()
            self.send_response(200); self.send_header('Content-Type','image/jpeg'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        return super().do_GET()

def check(condition, message):
    if not condition: raise AssertionError(message)

def overflow(page, label):
    widths = page.evaluate('''() => [window.innerWidth, document.documentElement.scrollWidth, document.body.scrollWidth]''')
    check(max(widths[1:]) <= widths[0] + 1, f'{label}: горизонтальное переполнение {widths}')

def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    captures = Path(os.environ.get('RESPONSIVE_SCREENSHOTS', '/tmp/pamyat-responsive'))
    captures.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/local/bin/chromium'), args=['--no-sandbox'])
        for width, height in [(320,568),(375,812),(390,844),(768,1024),(1440,900)]:
            for route in ('/', '/catalog.html'):
                label = f'{width} {route}'
                context = browser.new_context(viewport={'width':width,'height':height}, has_touch=width<981, device_scale_factor=1)
                page = context.new_page(); page.set_default_timeout(10000)
                errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
                # Offline/CI: external fonts and Lenis are optional; also exercises native-scroll fallback.
                page.route('https://**/*', lambda r:r.abort())
                page.goto(base+route, wait_until='domcontentloaded'); page.wait_for_timeout(1000)
                overflow(page, label+' initial')
                if width <= 980:
                    check(page.locator('#burger').get_attribute('aria-controls') == 'site-menu', label+' controls')
                    page.wait_for_timeout(300)
                    check(page.locator('.menu').evaluate("e=>getComputedStyle(e).visibility") == 'hidden',label+' hidden menu')
                    page.locator('#burger').click(); check(page.locator('#burger').get_attribute('aria-expanded')=='true',label+' menu open')
                    page.wait_for_timeout(400); page.screenshot(path=str(captures / f'{width}-{ "home" if route=="/" else "catalog" }-menu.png'))
                    page.keyboard.press('Escape'); check(page.locator('#burger').get_attribute('aria-expanded')=='false',label+' menu escape')
                    check(page.evaluate("document.activeElement.id")=='burger',label+' menu focus')
                    page.locator('#burger').click(); page.mouse.click(2, height - 2)
                    check(page.locator('#burger').get_attribute('aria-expanded')=='false',label+' menu outside')
                    page.wait_for_timeout(300)
                page.screenshot(path=str(captures / f'{width}-{ "home" if route=="/" else "catalog" }.png'))
                if route == '/':
                    page.locator('#works').scroll_into_view_if_needed(); page.wait_for_timeout(400)
                    check(page.locator('#worksPagination .works-dot').count() > 1,label+' pagination')
                    dot=page.locator('#worksPagination .works-dot').first.bounding_box()
                    check(dot['width'] >= 44 and dot['height'] >= 44,label+' dot touch target')
                    page.screenshot(path=str(captures / f'{width}-works.png'))
                    page.locator('#worksGrid').focus(); page.keyboard.press('Enter')
                    check(page.locator('#lbx').is_visible(),label+' work modal open')
                    page.wait_for_function("document.querySelector('#lbimg').complete && document.querySelector('#lbimg').naturalWidth > 0")
                    parsed=urlparse(page.locator('#lbimg').get_attribute('src'))
                    check(parsed.path == '/api/img' and 'w' not in parse_qs(parsed.query),label+' full photo')
                    check(page.evaluate('document.activeElement.id')=='lbxClose',label+' modal focus')
                    overflow(page,label+' work modal');page.screenshot(path=str(captures / f'{width}-work-modal.png'))
                    page.keyboard.press('Escape');check(not page.locator('#lbx').is_visible(),label+' work modal escape')
                    check(page.evaluate('document.activeElement.id')=='worksGrid',label+' modal focus restored')
                    page.locator('#worksGrid').focus();page.keyboard.press('Enter');page.locator('#lbxClose').click();check(not page.locator('#lbx').is_visible(),label+' close button')
                    page.locator('#calc').scroll_into_view_if_needed();page.wait_for_timeout(400);overflow(page,label+' calculator');page.screenshot(path=str(captures / f'{width}-calc.png'))
                else:
                    check(page.locator('.cc').count() > 0,label+' categories')
                    page.locator('.cc').first.click();page.wait_for_selector('.mc');overflow(page,label+' category')
                    page.locator('.mc').first.click();page.wait_for_selector('#clb.on');check(page.evaluate('document.activeElement.id')=='clbX',label+' model focus')
                    page.wait_for_timeout(400); overflow(page,label+' model');page.screenshot(path=str(captures / f'{width}-model.png')); page.keyboard.press('Shift+Tab'); check(page.evaluate("document.activeElement.closest('#clb') !== null"),label+' model focus trap')
                    title=page.locator('#clbT').inner_text();page.locator('#clbN').click();check(page.locator('#clbT').inner_text()!=title,label+' next model')
                    page.locator('#clbPic .sv').first.click();page.wait_for_selector('.czoom.on');page.wait_for_timeout(400);page.keyboard.press('Tab');check(page.evaluate("document.activeElement.closest('.czoom.on') !== null"),label+' zoom focus trap');overflow(page,label+' zoom');page.screenshot(path=str(captures / f'{width}-zoom.png'))
                    page.keyboard.press('Escape');check(not page.locator('.czoom.on').count(),label+' zoom escape');check(page.locator('#clb').is_visible(),label+' model preserved')
                    page.keyboard.press('Escape');check(not page.locator('#clb').is_visible(),label+' model escape')
                check(not errors, f'{label}: JS exceptions {errors}')
                print('PASS',label,flush=True);context.close()
        # Short viewport: scrolling menu and reduced motion must remain usable.
        page=browser.new_page(viewport={'width':320,'height':400},reduced_motion='reduce')
        page.route('https://**/*',lambda r:r.abort()); page.goto(base+'/',wait_until='domcontentloaded');page.locator('#burger').click()
        check(page.locator('.menu').evaluate('e=>e.scrollHeight>e.clientHeight'),'short menu scroll')
        check(page.evaluate('!window.PAMYAT_LENIS'),'reduced motion native scrolling')
        page.keyboard.press('Escape');check(page.locator('#burger').get_attribute('aria-expanded')=='false','reduced motion menu');overflow(page,'320x400');page.close()
        # Simulate Lenis explicitly as CI may be offline. Verify overlay stop/start pairing.
        page=browser.new_page(viewport={'width':390,'height':844})
        page.add_init_script("""window.Lenis = class { constructor(){this.stops=0;this.starts=0} stop(){this.stops++} start(){this.starts++} on(){} scrollTo(){} };""")
        page.route('https://**/*',lambda r:r.abort());page.goto(base+'/',wait_until='domcontentloaded')
        page.locator('#worksGrid').focus();page.keyboard.press('Enter')
        check(page.evaluate('window.PAMYAT_LENIS.stops')==1,'Lenis stop');page.keyboard.press('Escape');check(page.evaluate('window.PAMYAT_LENIS.starts')==1,'Lenis resume');page.close()
        # Jump deep into the full-resolution 893-frame story, then verify it catches up.
        page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
        story_errors=[];page.on('pageerror',lambda e:story_errors.append(str(e)))
        page.route('https://**/*',lambda r:r.abort()); frames=[]
        page.on('request',lambda r:frames.append(r.url) if '/assets/story-m/' in r.url and '.webp' in r.url else None)
        page.goto(base+'/',wait_until='domcontentloaded'); page.locator('#story').scroll_into_view_if_needed()
        page.wait_for_function('window.PAMYAT_STORY && PAMYAT_STORY.frame() >= 0',timeout=15000)
        page.evaluate("""()=>{let s=document.querySelector('#story'), stick=s.querySelector('.story-sticky');window.scrollTo(0,s.offsetTop+(s.offsetHeight-stick.offsetHeight)*.75)}""")
        page.wait_for_function('window.PAMYAT_STORY && PAMYAT_STORY.target() > 600 && Math.abs(PAMYAT_STORY.frame()-PAMYAT_STORY.target()) < 3',timeout=20000)
        check(len(frames)<500,'mobile story should not prefetch the entire sequence'); check(not story_errors,f'story JS exceptions {story_errors}')
        print('PASS story jump; fetched',len(frames),'frames',flush=True);page.close()
        # Optional real Lenis build; fetch CDN separately and pass LENIS_FILE for offline replay.
        lenis_file=os.environ.get('LENIS_FILE')
        if lenis_file:
            page=browser.new_page(viewport={'width':390,'height':844})
            page.route('https://**/*',lambda r:r.abort())
            page.route('https://cdn.jsdelivr.net/npm/lenis@1.3.27/dist/lenis.min.js',lambda r:r.fulfill(path=lenis_file,content_type='application/javascript'))
            page.goto(base+'/',wait_until='load');check(page.evaluate('!!window.PAMYAT_LENIS'),'real Lenis loaded')
            page.locator('#worksGrid').focus();page.keyboard.press('Enter');check(page.evaluate('window.PAMYAT_LENIS.isStopped'),'real Lenis stopped')
            page.keyboard.press('Escape');check(not page.evaluate('window.PAMYAT_LENIS.isStopped'),'real Lenis resumed');page.close();print('PASS real Lenis',flush=True)
        browser.close()
    server.shutdown();print('PASS reduced motion / short viewport / Lenis',flush=True)
if __name__=='__main__':
    try: main()
    except Exception as e: print('FAIL:',e,file=sys.stderr);raise
