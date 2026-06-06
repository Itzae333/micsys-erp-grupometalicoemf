import { test as setup, expect } from '@playwright/test';
import { loginAs, selectFirstContexto, USERS } from '../fixtures';
import path from 'path';

// Guarda el estado de autenticación del admin para que los tests autenticados
// no tengan que hacer login en cada spec.
const authFile = path.join(__dirname, '../.auth/admin.json');

setup('autenticar admin EMFIMIFAR', async ({ page }) => {
  await loginAs(page, USERS.adminEmf);

  await page.waitForURL(/\/(dashboard|seleccionar-contexto)/, { timeout: 10_000 });

  if (page.url().includes('seleccionar-contexto')) {
    await selectFirstContexto(page);
    await page.waitForURL('/dashboard', { timeout: 5_000 });
  }

  await expect(page).toHaveURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
