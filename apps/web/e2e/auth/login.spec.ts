import { test, expect } from '@playwright/test';
import { loginAs, USERS, SEED } from '../fixtures';

test.describe('Pantalla de login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('muestra el formulario con campos email y contraseña', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('muestra el branding GrupoMetalicoEMF', async ({ page }) => {
    await expect(page.getByText('GrupoMetalicoEMF')).toBeVisible();
    await expect(page.getByText('Sistema de Gestión Industrial')).toBeVisible();
  });

  test('muestra error de validación para email vacío', async ({ page }) => {
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Correo electrónico inválido')).toBeVisible();
  });

  test('muestra error de validación para contraseña vacía', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('test@test.com');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('La contraseña es requerida')).toBeVisible();
  });

  test('toggle de contraseña muestra y oculta el texto', async ({ page }) => {
    const passwordInput = page.getByLabel('Contraseña');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click en el ojo
    await page.locator('button[title]').or(page.locator('button:has(svg)')).last().click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click de nuevo para ocultar
    await page.locator('button:has(svg)').last().click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('muestra error al ingresar credenciales incorrectas', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('noexiste@test.com');
    await page.getByLabel('Contraseña').fill('WrongPass123!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(
      page.getByText(/Correo electrónico o contraseña incorrectos/i),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('login exitoso como admin redirige al dashboard o selección de contexto', async ({
    page,
  }) => {
    await loginAs(page, USERS.adminEmf);

    await page.waitForURL(/\/(dashboard|seleccionar-contexto)/, { timeout: 12_000 });
    expect(page.url()).toMatch(/\/(dashboard|seleccionar-contexto)/);
  });

  test('login exitoso como vendedor redirige al dashboard', async ({ page }) => {
    await loginAs(page, USERS.vendedor);
    await page.waitForURL(/\/(dashboard|seleccionar-contexto)/, { timeout: 12_000 });
    expect(page.url()).toMatch(/\/(dashboard|seleccionar-contexto)/);
  });
});
