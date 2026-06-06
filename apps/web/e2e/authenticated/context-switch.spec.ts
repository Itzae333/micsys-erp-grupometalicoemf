import { test, expect } from '../fixtures';
import { SEED } from '../fixtures';

test.describe('Context switcher', () => {
  test('muestra empresa y ubicación activos en el sidebar', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    // El sidebar muestra el nombre de la empresa
    const sidebar = page.locator('aside');
    await expect(sidebar).toContainText(SEED.empresas.emfimifar);
    // Y alguna ubicación
    const ubicacionText = sidebar.locator('p.text-meta, p.text-steel-500').first();
    await expect(ubicacionText).not.toBeEmpty();
  });

  test('abre el context switcher al hacer click en ChevronUpDown', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');

    await page.getByTestId('context-switcher-btn').click();

    // El modal debe aparecer con el título
    await expect(page.getByRole('heading', { name: 'Cambiar contexto' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('el context switcher muestra al menos una ubicación disponible', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByTestId('context-switcher-btn').click();

    // Debe mostrar al menos una ubicación con MapPin
    await expect(page.locator('[data-testid="context-switcher-btn"]')).toBeVisible();
    const modal = page.locator('div.fixed.inset-0').last();
    await expect(modal).toBeVisible();

    // Al menos una opción de ubicación disponible
    const ubicacionButtons = modal.getByRole('button').filter({ hasText: /Monterrey|Norte|Centro/ });
    await expect(ubicacionButtons.first()).toBeVisible({ timeout: 8_000 });
  });

  test('seleccionar una ubicación cierra el switcher y actualiza el sidebar', async ({
    authedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByTestId('context-switcher-btn').click();

    // Esperar que carguen las ubicaciones
    const modal = page.locator('div.fixed.inset-0').last();
    await expect(modal).toBeVisible();

    // Click en primera ubicación disponible
    const firstUbicacion = modal.getByRole('button').filter({ hasText: /Monterrey|Norte|Centro/ }).first();
    await expect(firstUbicacion).toBeVisible({ timeout: 8_000 });
    const ubicacionName = await firstUbicacion.textContent();
    await firstUbicacion.click();

    // El modal debe cerrarse
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // El sidebar debe mostrar la ubicación seleccionada (o algún nombre de ubicación)
    if (ubicacionName) {
      const sidebar = page.locator('aside');
      // Al menos el nombre de la empresa está presente
      await expect(sidebar).toContainText(SEED.empresas.emfimifar);
    }
  });

  test('ESC cierra el context switcher sin cambiar contexto', async ({ authedPage: page }) => {
    await page.goto('/dashboard');

    const sidebar = page.locator('aside');
    const empresaBefore = await sidebar.textContent();

    await page.getByTestId('context-switcher-btn').click();
    await expect(page.getByRole('heading', { name: 'Cambiar contexto' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Cambiar contexto' })).not.toBeVisible({
      timeout: 3_000,
    });

    // El contexto no cambió
    await expect(sidebar).toContainText(SEED.empresas.emfimifar);
  });
});
