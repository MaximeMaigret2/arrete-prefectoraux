import { test, expect } from '@playwright/test';

/**
 * Île-de-France (2026-09-02, troisième itération) : plus d'encart séparé —
 * les 8 départements franciliens sont rendus à leur place réelle sur la
 * carte principale, traités comme une seule région cliquable puisqu'ils
 * restent trop petits pour être des cibles de clic individuelles fiables :
 * survoler l'un d'eux les met tous en surbrillance, cliquer l'un d'eux
 * ouvre une popin avec une carte agrandie où la sélection précise d'un
 * département a lieu.
 */
test.describe('Île-de-France', () => {
  test('survoler un département francilien met les 8 en surbrillance', async ({ page }) => {
    await page.goto('/');
    const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
    for (const code of IDF) {
      await expect(page.locator(`svg.map-svg path[data-code="${code}"]`)).toHaveCount(1);
    }
    // Attend la fin du chargement initial (fetch async, MapPage.tsx) avant
    // de survoler : sinon sa résolution en cours de test peut faire
    // disparaître le message "Chargement de la carte…", provoquant un léger
    // reflow qui, si la souris est restée immobile, fait perdre le survol
    // avant que les assertions ci-dessous ne s'exécutent (même patron que
    // slider-history.spec.ts).
    await expect(page.locator('p[aria-live="polite"]', { hasText: 'Chargement de la carte' })).toHaveCount(0);

    await page.locator('svg.map-svg path[data-code="75"]').hover();
    await expect(page.getByTestId('idf-region-tooltip')).toBeVisible();
    for (const code of IDF) {
      await expect(page.locator(`svg.map-svg path[data-code="${code}"]`)).toHaveClass(/map-departement--idf-hover/);
    }
    // Un département non francilien ne doit pas être affecté.
    await expect(page.locator('svg.map-svg path[data-code="13"]')).not.toHaveClass(/map-departement--idf-hover/);
  });

  test('cliquer un département francilien ouvre la popin agrandie, la sélection y ferme la popin et ouvre l’historique', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('svg.map-svg')).toBeVisible();

    await page.locator('svg.map-svg path[data-code="75"]').click();
    const modal = page.getByTestId('idf-zoom-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('svg.idf-modal-svg')).toBeVisible();

    const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
    for (const code of IDF) {
      await expect(page.locator(`svg.idf-modal-svg path[data-code="${code}"]`)).toHaveCount(1);
    }

    await page.locator('svg.idf-modal-svg path[data-code="75"]').click();
    await expect(modal).not.toBeVisible();
    const panel = page.getByTestId('departement-history-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Paris');

    // La carte principale reste cliquable pendant que le panneau est ouvert.
    await expect(page.locator('svg.map-svg path[data-code="13"]')).toBeVisible();
  });

  test("la popin se ferme via Échap et via le bouton dédié", async ({ page }) => {
    await page.goto('/');
    await page.locator('svg.map-svg path[data-code="92"]').click();
    const modal = page.getByTestId('idf-zoom-modal');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    await page.locator('svg.map-svg path[data-code="92"]').click();
    await expect(modal).toBeVisible();
    await page.getByLabel('Fermer la carte agrandie').click();
    await expect(modal).not.toBeVisible();
  });
});
