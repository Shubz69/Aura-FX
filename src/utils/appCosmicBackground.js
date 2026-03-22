/**
 * Journal-style space background is applied on <main class="page-wrapper app-cosmic-bg">.
 * Excluded: marketing/public shells that keep their own look (canvas CosmicBackground, etc.).
 */
export function shouldUseAppCosmicBackground(pathname) {
  const p = (pathname || '').split('?')[0];
  if (p === '/' || p === '/journal') return false;
  const excluded = ['/explore', '/why-glitch', '/courses', '/leaderboard', '/contact'];
  return !excluded.some((pre) => p === pre || p.startsWith(`${pre}/`));
}
