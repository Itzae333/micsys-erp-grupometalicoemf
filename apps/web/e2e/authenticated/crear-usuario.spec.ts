import { test, expect } from '../fixtures';

const NUEVO_USUARIO = {
  nombre: 'María',
  apellidos: 'Prueba E2E',
  email: `e2e.test.${Date.now()}@emfimifar.com`,
  password: 'TestPass2026!',
};

test.describe('Crear usuario (flujo completo)', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/configuracion/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible({ timeout: 8_000 });
  });

  test('muestra la lista de usuarios existentes', async ({ authedPage: page }) => {
    // Debe haber al menos la tabla o el empty state
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.getByText('Sin usuarios').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('abre el dialog de nuevo usuario al hacer click en el botón', async ({
    authedPage: page,
  }) => {
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible({ timeout: 3_000 });
  });

  test('muestra errores de validación al hacer submit vacío', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();

    await page.getByRole('button', { name: 'Crear usuario' }).click();

    // Al menos un mensaje de error de validación
    await expect(page.getByText('Requerido').first()).toBeVisible({ timeout: 3_000 });
  });

  test('crea un usuario nuevo con datos válidos', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();

    // Llenar el formulario
    await page.getByLabel('Nombre').fill(NUEVO_USUARIO.nombre);
    await page.getByLabel('Apellidos').fill(NUEVO_USUARIO.apellidos);
    await page.getByLabel('Correo electrónico').fill(NUEVO_USUARIO.email);
    await page.getByLabel('Contraseña inicial').fill(NUEVO_USUARIO.password);

    // Seleccionar rol Vendedor
    await page.getByLabel('Rol').selectOption('VENDEDOR');

    // Asignar primera ubicación disponible si hay checkboxes
    const firstUbicacionCheck = page.locator('input[type="checkbox"]').first();
    if (await firstUbicacionCheck.isVisible().catch(() => false)) {
      await firstUbicacionCheck.check();
    }

    // Enviar
    await page.getByRole('button', { name: 'Crear usuario' }).click();

    // El dialog debe cerrarse (indicando éxito)
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).not.toBeVisible({
      timeout: 10_000,
    });

    // El nuevo usuario debe aparecer en la tabla
    await expect(page.getByText(NUEVO_USUARIO.nombre)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(NUEVO_USUARIO.email)).toBeVisible();
  });

  test('cancela la creación y cierra el dialog', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test('muestra el botón de resetear contraseña en usuarios existentes', async ({
    authedPage: page,
  }) => {
    // Si hay usuarios en la tabla, debe haber botón de KeyRound
    const hasTable = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (hasTable) {
      // Al menos un botón de KeyRound (resetear contraseña)
      await expect(page.locator('table tbody tr').first().locator('button').nth(1)).toBeVisible();
    }
  });

  test('abre el dialog de resetear contraseña', async ({ authedPage: page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // El segundo botón de la fila es KeyRound (resetear contraseña)
    await firstRow.locator('button').nth(1).click();
    await expect(page.getByRole('heading', { name: 'Resetear contraseña' })).toBeVisible({
      timeout: 3_000,
    });

    // Cierra el dialog
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Resetear contraseña' })).not.toBeVisible();
  });
});

test.describe('Navegación de configuración', () => {
  test('la sub-nav muestra tabs Empresas y Usuarios', async ({ authedPage: page }) => {
    await page.goto('/configuracion/usuarios');

    await expect(page.getByRole('link', { name: 'Empresas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuarios' })).toBeVisible();
  });

  test('navegar a Empresas desde la sub-nav', async ({ authedPage: page }) => {
    await page.goto('/configuracion/usuarios');
    await page.getByRole('link', { name: 'Empresas' }).click();

    await expect(page).toHaveURL('/configuracion/empresas');
    await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
  });

  test('la lista de empresas muestra EMFIMIFAR', async ({ authedPage: page }) => {
    await page.goto('/configuracion/empresas');
    await expect(page.getByText('EMFIMIFAR')).toBeVisible({ timeout: 8_000 });
  });

  test('navegar al detalle de EMFIMIFAR muestra sus ubicaciones', async ({
    authedPage: page,
  }) => {
    await page.goto('/configuracion/empresas');
    await page.getByText('EMFIMIFAR').click();

    await expect(page).toHaveURL(/\/configuracion\/empresas\/.+/);
    await expect(page.getByText('Ubicaciones')).toBeVisible({ timeout: 5_000 });
    // Al menos una ubicación de EMFIMIFAR
    await expect(page.getByText(/Monterrey|Norte|Centro/).first()).toBeVisible({ timeout: 8_000 });
  });
});
