/* Score bug (2026-11-10): see scorebug.css. The goal plays as: the scorer's colour sweeps over the bug from his side, his mascot crosses
 * it (the blue side's seagull — İzmir's — flying left to right, the red side's fireball streaking right to left) with GOOOOL appearing
 * behind it, the scorer and minute in a strip below; the colour pulls back and the new number rolls in (3–1 → 3–2). */
import './scorebug.css';

const GULL = `<svg class="sbx-gull" viewBox="0 0 84 60" aria-hidden="true">
  <path class="wing back" d="M42 32C36 16 24 8 8 9c13 6 22 14 31 25z" fill="#dfe4ea"/><path class="wing back" d="M8 9c5 1 9 3 12 6l-8-1z" fill="#2a2e35"/>
  <path d="M28 32l-11-5 3 9z" fill="#e8ecf0"/><ellipse cx="46" cy="34" rx="18" ry="7" fill="#fff"/><circle cx="64" cy="30" r="6.2" fill="#fff"/>
  <path d="M69.5 28.6l8.8 2.2-8.8 2.2z" fill="#f4a623"/><circle cx="66.2" cy="28.6" r="1.2" fill="#111"/>
  <path class="wing" d="M44 32C38 15 27 6 10 6c14 7 23 15 32 27z" fill="#fff"/><path class="wing" d="M10 6c5 1 9 3 13 7l-9-2z" fill="#2a2e35"/></svg>`;
const FIRE = `<svg class="sbx-fire" viewBox="0 0 84 60" aria-hidden="true"><defs>
  <linearGradient id="sbx-fg" x1="0" x2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".35" stop-color="#ff9f1c"/><stop offset=".75" stop-color="#e8452c" stop-opacity=".85"/><stop offset="1" stop-color="#e8452c" stop-opacity="0"/></linearGradient>
  <linearGradient id="sbx-fi" x1="0" x2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></linearGradient></defs>
  <g class="flame"><path d="M24 30C40 12 58 20 84 7c-12 14-4 20 0 23-4 2-12 8 0 23C58 40 40 48 24 30z" fill="url(#sbx-fg)"/><path d="M26 30c12-9 24-6 38-11-6 6-3 9 0 11-3 2-6 5 0 11-14-5-26-2-38-11z" fill="url(#sbx-fi)"/></g>
  <g class="ball"><circle cx="22" cy="30" r="13" fill="#fff" stroke="#1d1f24" stroke-width="1.6"/><path d="M22 24.5l5 3.6-1.9 5.9h-6.2l-1.9-5.9z" fill="#1d1f24"/>
  <path d="M22 24.5V17.2M27 28.1l6.6-2.6M25.1 34l3.9 5.6M18.9 34l-3.9 5.6M17 28.1l-6.6-2.6" stroke="#1d1f24" stroke-width="1.3"/></g></svg>`;
const WORD = 'GOOOOL';

/** teams: [{code, color, light}, {code, color, light}] — home (left), away (right). */
export function createScorebug(container, { teams }) {
  const el = document.createElement('section');el.className = 'sbx';el.setAttribute('aria-live', 'polite');
  el.style.setProperty('--home', teams[0].color);el.style.setProperty('--home-2', teams[0].light);el.style.setProperty('--away', teams[1].color);el.style.setProperty('--away-2', teams[1].light);
  el.innerHTML = `<div class="sbx-row"><div class="sbx-code home">${teams[0].code}</div><div class="sbx-digit home"><span class="cur">0</span><i class="flash"></i></div>
    <div class="sbx-emblem" aria-hidden="true"><i>A</i></div><div class="sbx-digit away"><span class="cur">0</span><i class="flash"></i></div><div class="sbx-code away">${teams[1].code}</div>
    <div class="sbx-goal" aria-hidden="true"></div></div><div class="sbx-clock"><span data-sbx-clock>00:00</span><small data-sbx-period>1Y</small></div><i class="sbx-poss" aria-hidden="true"></i>
    <div class="sbx-scorer" aria-hidden="true"></div>`;
  container.append(el);
  const $ = s => el.querySelector(s), digits = [$('.sbx-digit.home'), $('.sbx-digit.away')], codes = [$('.sbx-code.home'), $('.sbx-code.away')];
  let shown = [0, 0], queue = Promise.resolve(), playing = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const label = () => el.setAttribute('aria-label', `${teams[0].code} ${shown[0]}, ${teams[1].code} ${shown[1]}`);
  function setDigit(i, n) { digits[i].classList.remove('roll'); digits[i].querySelector('.old')?.remove(); const c = digits[i].querySelector('.cur, .new'); c.className = 'cur'; c.textContent = String(n); c.style.transform = ''; }
  function rollDigit(i, n) {
    const d = digits[i], cur = d.querySelector('.cur, .new');cur.className = 'old';
    const nu = document.createElement('span');nu.className = 'new';nu.textContent = String(n);d.insertBefore(nu, d.querySelector('.flash'));
    d.classList.remove('roll');void d.offsetWidth;d.classList.add('roll');
    codes[i].classList.remove('thump');void codes[i].offsetWidth;codes[i].classList.add('thump');
    setTimeout(() => { if (nu.isConnected && nu.className === 'new') { d.querySelector('.old')?.remove(); nu.className = 'cur'; d.classList.remove('roll'); } }, 700);
  }
  async function playGoal({ team, scorer, minute, score }) {
    playing = true;
    const side = team === 0 ? 'home' : 'away', g = $('.sbx-goal'), strip = $('.sbx-scorer');
    g.className = `sbx-goal ${side}`;g.innerHTML = `<div class="bar"></div><div class="word">${[...WORD].map(c => `<b>${c}</b>`).join('')}</div><div class="mascot">${team === 0 ? GULL : FIRE}</div>`;
    strip.className = `sbx-scorer ${side}`;strip.innerHTML = `<b>${scorer ?? ''}</b><span>${minute ?? ''}</span>`;strip.hidden = !scorer;
    el.classList.add('is-goal');
    // Letters appear as the mascot passes them: left to right for the home side, right to left for the away side.
    const letters = [...g.querySelectorAll('.word b')], order = team === 0 ? letters : [...letters].reverse();
    await wait(430);for (const b of order) { b.classList.add('on'); await wait(105); }
    await wait(260);g.classList.add('is-cheer');strip.classList.add('is-in');
    await wait(1450);strip.classList.remove('is-in');strip.classList.add('is-out');g.classList.add('is-out');
    await wait(320);el.classList.remove('is-goal');g.className = 'sbx-goal';g.innerHTML = '';strip.className = 'sbx-scorer';
    // The new score: the scorer's number rolls; the other is set (an own goal or a correction may change it too).
    for (const i of [0, 1]) if (score[i] !== shown[i]) { if (i === team) rollDigit(i, score[i]); else setDigit(i, score[i]); }
    shown = [...score];label();
    await wait(650);playing = false;
  }
  label();
  return {
    el,
    /** Entrance animation (match start, coming back from a card). */
    intro() { el.classList.remove('is-intro');void el.offsetWidth;el.classList.add('is-intro');setTimeout(() => el.classList.remove('is-intro'), 1400); },
    /** Every frame: the clock, the period, who has the ball (0, 1 or -1), and the score unless a goal is playing (then the goal sets it). */
    set({ clock, period, possession = -1, score }) {
      $('[data-sbx-clock]').textContent = clock;$('[data-sbx-period]').textContent = period ?? '';
      const p = $('.sbx-poss');el.classList.toggle('has-poss', possession === 0 || possession === 1);
      if (possession === 0 || possession === 1) { const c = codes[possession];p.style.left = `${c.offsetLeft + c.offsetWidth / 2 - 22 + (possession === 0 ? -6 : 6)}px`; }
      if (score && !playing) for (const i of [0, 1]) if (score[i] !== shown[i]) { setDigit(i, score[i]); shown[i] = score[i]; label(); }
    },
    /** The goal sequence; resolves when the bug is back with the new score. Goals queue. */
    goal(g) { queue = queue.then(() => playGoal(g));return queue; },
    get busy() { return playing; },
    dispose() { el.remove(); },
  };
}
