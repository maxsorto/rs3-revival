import { startViewer } from './viewer';
import { startGame } from './game';
import { startCarParts, startCarShots } from './carparts';
import { startMenu } from './menu';
import { showIntro } from './intro';
const q = new URLSearchParams(location.search);
const track = q.get('track') ?? '0';
const showMenu = !q.has('track') && !q.has('view') && !q.has('carparts') && !q.has('carshots');
document.body.style.margin = '0'; document.body.style.overflow = 'hidden'; document.body.style.touchAction = 'none';
const app = document.getElementById('app')!;
const hud = document.createElement('pre');
hud.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;font:12px ui-monospace;color:#fff;background:rgba(0,0,0,.5);padding:6px 8px;border-radius:6px;z-index:2;pointer-events:none';
if (!showMenu && (q.has('debug') || q.has('view') || q.has('carparts'))) document.body.appendChild(hud);   // drive mode keeps the log in the console unless ?debug
const log = (s: string) => { hud.textContent += s + '\n'; console.log(s); };
if (showMenu) {
  document.title = 'Racing Simulation 3';
  let seen = false; try { seen = sessionStorage.getItem('rs3.seenIntro') === '1'; } catch { /* ignore */ }
  if (seen && !q.has('intro')) startMenu(app); else showIntro(app).then(() => { try { sessionStorage.setItem('rs3.seenIntro', '1'); } catch { /* ignore */ } startMenu(app); });
}
else log(`RS3 track ${track}`);
if (!showMenu) (q.has('carshots') ? startCarShots(app, log) : q.has('carparts') ? startCarParts(app, log) : q.has('view') ? startViewer(track, app, log) : startGame(track, app, log)).catch(e => log('ERROR ' + e));
