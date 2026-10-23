// Intro splash: hero car, slamming title, speed streaks. Resolves on tap / key. Skipped when coming back from the game (sessionStorage).
export function showIntro(host: HTMLElement): Promise<void> {
  const root = document.createElement('div');
  root.id = 'rs3-intro';
  root.style.cssText = 'position:fixed;inset:0;z-index:30;overflow:hidden;background:#06101f;color:#fff;font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;user-select:none;-webkit-user-select:none;cursor:pointer';
  root.innerHTML = `
    <style>
      #rs3-intro .bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 75% 65%,#1b3f8a 0%,#0c224f 40%,#06101f 75%,#03080f 100%)}
      #rs3-intro .streaks{position:absolute;inset:-20% -40%;pointer-events:none}
      #rs3-intro .streak{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.7) 45%,rgba(255,255,255,0));transform:rotate(-7deg);opacity:0;animation:rs3-streak 2.6s linear infinite}
      @keyframes rs3-streak{0%{transform:translateX(-30%) rotate(-7deg);opacity:0}15%{opacity:.5}60%{opacity:.25}100%{transform:translateX(30%) rotate(-7deg);opacity:0}}
      #rs3-intro .glow{position:absolute;right:-20vw;bottom:-30vh;width:80vw;height:70vh;border-radius:50%;background:radial-gradient(closest-side,rgba(255,68,40,.4),rgba(255,68,40,0));filter:blur(14px);animation:rs3-glow 4s ease-in-out infinite alternate}
      @keyframes rs3-glow{from{opacity:.6}to{opacity:1}}
      #rs3-intro .car{position:absolute;right:-6vw;bottom:8vh;width:min(78vw,1100px);max-height:70vh;object-fit:contain;filter:drop-shadow(0 30px 40px rgba(0,0,0,.75));opacity:0;transform:translateX(12vw) scale(.96);animation:rs3-car 1.1s cubic-bezier(.2,.8,.2,1) .25s forwards, rs3-drift 7s ease-in-out 1.4s infinite alternate}
      @keyframes rs3-car{to{opacity:1;transform:translateX(0) scale(1)}}
      @keyframes rs3-drift{from{transform:translateX(0) scale(1)}to{transform:translateX(-1.5vw) scale(1.02)}}
      #rs3-intro .title{position:absolute;left:max(6vw,env(safe-area-inset-left));top:max(8vh,env(safe-area-inset-top));line-height:.86;font-weight:900;letter-spacing:-.035em;text-transform:uppercase;text-shadow:0 8px 30px rgba(0,0,0,.6)}
      #rs3-intro .t{display:block;font-size:clamp(34px,9vw,110px);opacity:0;transform:scale(1.6);filter:blur(6px);animation:rs3-slam .55s cubic-bezier(.2,.9,.2,1) forwards}
      #rs3-intro .t2{animation-delay:.12s}
      #rs3-intro .t3{display:inline-block;color:#ffcc33;font-size:clamp(60px,15vw,180px);line-height:.8;margin-top:.06em;letter-spacing:-.05em;animation-delay:.28s}
      @keyframes rs3-slam{60%{filter:blur(0)}to{opacity:1;transform:scale(1);filter:blur(0)}}
      #rs3-intro .rev{position:absolute;left:max(6vw,env(safe-area-inset-left));bottom:max(16vh,calc(env(safe-area-inset-bottom) + 14vh));background:#e8321e;font-weight:900;font-size:clamp(18px,4vw,46px);letter-spacing:.14em;text-transform:uppercase;padding:.25em .65em .2em;border-radius:.18em;transform:skewX(-8deg) translateX(-120%);box-shadow:0 10px 30px rgba(232,50,30,.35);animation:rs3-rev .6s cubic-bezier(.2,.9,.2,1) .7s forwards}
      #rs3-intro .rev span{display:inline-block;transform:skewX(8deg)}
      @keyframes rs3-rev{to{transform:skewX(-8deg) translateX(0)}}
      #rs3-intro .cta{position:absolute;left:max(6vw,env(safe-area-inset-left));bottom:max(7vh,calc(env(safe-area-inset-bottom) + 5vh));font-weight:700;font-size:clamp(13px,2.2vw,18px);letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);opacity:0;animation:rs3-cta 1.6s ease-in-out 1.3s infinite alternate}
      @keyframes rs3-cta{from{opacity:.35}to{opacity:1}}
      #rs3-intro .bar{position:absolute;left:0;bottom:0;height:6px;width:0;background:linear-gradient(90deg,#e8321e 0 34%,#ffcc33 34% 50%,#fff 50% 100%);animation:rs3-bar 1.2s cubic-bezier(.2,.9,.2,1) .5s forwards}
      @keyframes rs3-bar{to{width:100%}}
      @media (orientation: portrait){
        #rs3-intro .car{width:150vw;max-height:none;right:-52vw;bottom:24vh}
        #rs3-intro .t{font-size:clamp(34px,13vw,110px)}
        #rs3-intro .t3{font-size:clamp(60px,22vw,180px)}
        #rs3-intro .rev{bottom:max(13vh,calc(env(safe-area-inset-bottom) + 11vh))}
      }
      #rs3-intro.out{animation:rs3-out .5s ease forwards}
      @keyframes rs3-out{to{opacity:0;transform:scale(1.04)}}
    </style>
    <div class="bg"></div>
    <div class="streaks">${[18, 31, 47, 58, 72, 86].map((t, i) => `<div class="streak" style="top:${t}%;animation-delay:${-i * 0.45}s"></div>`).join('')}</div>
    <div class="glow"></div>
    <img class="car" src="/hero.png" alt="" draggable="false">
    <div class="title"><span class="t t1">Racing</span><span class="t t2">Simulation</span><span class="t t3">3</span></div>
    <div class="rev"><span>Revival</span></div>
    <div class="cta">${('ontouchstart' in window) ? 'Tap to continue' : 'Press any key'}</div>
    <div class="bar"></div>`;
  host.appendChild(root);
  return new Promise(res => {
    let done = false;
    const fin = (e: Event) => { if (done) return; done = true; e.preventDefault?.(); removeEventListener('keydown', fin); root.classList.add('out'); setTimeout(() => { root.remove(); res(); }, 480); };
    setTimeout(() => { root.addEventListener('pointerdown', fin); root.addEventListener('touchend', fin, { passive: false }); addEventListener('keydown', fin); }, 600);
  });
}
