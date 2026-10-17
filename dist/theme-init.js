// Apply the saved appearance before styles paint to avoid a light flash.
(() => {
 let saved;
 try { saved = localStorage.getItem('orbit-appearance'); } catch {}
 const theme = saved === 'dark' || saved === 'light' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
 document.documentElement.dataset.theme = theme;
 document.documentElement.style.colorScheme = theme;
})();
