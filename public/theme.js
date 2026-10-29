// Apply the saved look before first paint so the theme never flashes.
// A file, not an inline script: the API's CSP allows scripts from its own origin only.
(function (root) {
  try {
    var look = JSON.parse(localStorage.getItem('pane:look') || '{}');
    var theme = look.theme || 'dark';
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.dataset.theme = theme;
    if (look.wall) root.dataset.wall = look.wall;
    if (look.accent) root.dataset.accent = look.accent;
    if (look.glass) root.dataset.glass = look.glass;
    if (look.solid) root.classList.add('is-solid');
  } catch (e) {}
})(document.documentElement);
