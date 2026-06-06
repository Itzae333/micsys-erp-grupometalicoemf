import { test as base, expect, type Page } from '@playwright/test';

// Credenciales del seed — sync con packages/database/prisma/seed.ts
export const USERS = {
  super: { email: 'super@grupometálicoemf.com', password: 'SuperPass2026!' },
  adminEmf: { email: 'admin@emfimifar.com', password: 'AdminEmf2026!' },
  vendedor: { email: 'vendedor@emfimifar.com', password: 'Vendedor2026!' },
} as const;

export const SEED = {
  empresas: {
    emfimifar: 'EMFIMIFAR',
    lyeva: 'Metálicos Lyeva',
    laminas: 'Láminas Monterrey',
  },
  ubicaciones: {
    matriz: 'Matriz Monterrey',
    fabrica: 'Fábrica Norte',
    pv: 'Punto de Venta Centro',
  },
} as const;

// Helper reutilizable: lleva el browser a login y hace submit
export async function loginAs(
  page: Page,
  user: { email: string; password: string },
) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

// Helper: selecciona el primer contexto disponible en /seleccionar-contexto
export async function selectFirstContexto(page: Page) {
  // Si ya hay empresa seleccionada (usuario no-super), directamente seleccionar primera ubicacion
  const ubicaciones = page.getByTestId('ubicaciones-list');
  if (await ubicaciones.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByTestId('ubicaciones-list').locator('button').first().click();
  }
}

// Fixture personalizado para tests autenticados sin archivo de estado
type AuthFixtures = {
  authedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await loginAs(page, USERS.adminEmf);
    // Esperar redirección a seleccionar-contexto o dashboard
    await page.waitForURL(/\/(dashboard|seleccionar-contexto)/, { timeout: 10_000 });
    if (page.url().includes('seleccionar-contexto')) {
      await selectFirstContexto(page);
      await page.waitForURL('/dashboard', { timeout: 5_000 });
    }
    await use(page);
  },
});

export { expect };
