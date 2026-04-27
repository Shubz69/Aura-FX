import { test, expect } from '@playwright/test';

test.describe('language support', () => {
  test('login selector updates text and sets RTL for Arabic', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.selectOption('#site-language-select', 'zh-CN');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.selectOption('#site-language-select', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('Urdu sets RTL on login', async ({ page }) => {
    await page.goto('/login');
    await page.selectOption('#site-language-select', 'ur');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  });

  test('French keeps LTR', async ({ page }) => {
    await page.goto('/login');
    await page.selectOption('#site-language-select', 'fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('signup selector updates text and preference persists after reload', async ({ page }) => {
    await page.goto('/signup');
    await page.selectOption('#site-language-select', 'zh-CN');
    await expect(page.getByRole('heading', { name: '注册' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });

  test('unsupported language falls back safely', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aura_site_language_pref', 'xx-unsupported');
    });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const pref = await page.evaluate(() => localStorage.getItem('aura_site_language_pref'));
    expect(pref === null || pref === 'en').toBeTruthy();
  });

  test('guest home loads in Spanish without i18n console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.addInitScript(() => {
      localStorage.setItem('aura_site_language_pref', 'es');
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(errors.filter((e) => /i18n|missing key|not found/i.test(e))).toEqual([]);
  });
});
