const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const system = matchMedia('(prefers-color-scheme: dark)');
const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>';
const moon = '<path d="M20.3 15.5A8.8 8.8 0 0 1 8.5 3.7a8.8 8.8 0 1 0 11.8 11.8Z"/>';
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${p}</svg>`;
export function themeToggle() {
 const dark = root.dataset.theme === 'dark';
 return `<button class="theme-toggle" type="button" data-theme-toggle aria-label="${dark ? 'Включить светлую тему' : 'Включить тёмную тему'}" aria-pressed="${dark}" title="Сменить тему"><span class="theme-track"><span class="theme-sun">${svg(sun)}</span><span class="theme-moon">${svg(moon)}</span><span class="theme-thumb"></span></span><span class="theme-name">${dark ? 'Тёмная' : 'Светлая'}</span></button>`;
}
let timer;
function setTheme(theme, persist = true) {
 if (!reduced.matches) { root.classList.add('theme-switching'); clearTimeout(timer); timer = setTimeout(() => root.classList.remove('theme-switching'), 650); }
 root.dataset.theme = theme;
 root.style.colorScheme = theme;
 if (persist) { try { localStorage.setItem('orbit-appearance', theme); } catch {} }
 document.querySelectorAll('[data-theme-toggle]').forEach(button => {
  button.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  button.setAttribute('aria-pressed', String(theme === 'dark'));
  button.querySelector('.theme-name').textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
 });
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111019' : '#f6f7f9');
}
document.addEventListener('click', event => { if (event.target.closest('[data-theme-toggle]')) setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); });
system.addEventListener('change', () => { let saved; try { saved = localStorage.getItem('orbit-appearance'); } catch {} if (!saved) setTheme(system.matches ? 'dark' : 'light', false); });
window.addEventListener('storage', event => { if (event.key === 'orbit-appearance') setTheme(event.newValue === 'dark' ? 'dark' : event.newValue === 'light' ? 'light' : system.matches ? 'dark' : 'light', false); });
let lastView;
export function enhanceScene(view) {
 const main = document.querySelector('#main-content');
 if (main && lastView !== view) main.classList.add('scene-enter');
 lastView = view;
}
// A subtle light follows the pointer without moving controls or text.
let frame, banner, position;
if (matchMedia('(pointer: fine)').matches) document.addEventListener('pointermove', event => {
 if (reduced.matches) return;
 const target = event.target.closest('.agent-banner');
 if (!target) return;
 banner = target; const box = target.getBoundingClientRect(); position = [event.clientX - box.left, event.clientY - box.top];
 if (!frame) frame = requestAnimationFrame(() => { frame = null; if (!banner.isConnected) return; banner.style.setProperty('--light-x', position[0] + 'px'); banner.style.setProperty('--light-y', position[1] + 'px'); });
}, {passive:true});
document.addEventListener('visibilitychange', () => { root.toggleAttribute('data-motion-paused', document.hidden); });
setTheme(root.dataset.theme || 'light', false);
