import { test, expect } from '@playwright/test';

/**
 * US1 — Independent Test (spec.md) : charger l'application sans interaction
 * et vérifier que les départements affichent chacun l'un des 3 états, avec
 * un indicateur non fondé sur la seule couleur (FR-002, SC-002).
 */
test.describe('Chargement de la carte (US1)', () => {
  test('affiche la carte avec les 3 états possibles et un indicateur non-couleur', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Carte des arrêtés');

    // Le mention légale FR-014 doit être visible.
    await expect(page.locator('.app-disclaimer')).toContainText('ne remplace pas une vérification officielle');

    // La carte doit être rendue (rôle "img" avec libellé, cf. Map.tsx).
    const mapSvg = page.locator('svg.map-svg');
    await expect(mapSvg).toBeVisible();

    // Au moins un département de chaque état visible parmi les classes CSS
    // (couleur ET classe distincte servent d'indicateur non-couleur via le
    // symbole textuel superposé — cf. Legend.tsx / Map.tsx SYMBOL_BY_ETAT).
    await expect(page.locator('.map-departement--rouge').first()).toBeVisible();
    await expect(page.locator('.map-departement--vert').first()).toBeVisible();
    await expect(page.locator('.map-departement--gris').first()).toBeVisible();

    // La légende expose un symbole + un libellé textuel pour chaque état (SC-002).
    await expect(page.getByText('Aucun arrêté en vigueur')).toBeVisible();
    await expect(page.getByText("Arrêté d'interdiction en vigueur")).toBeVisible();
    await expect(page.getByText('Non couvert')).toBeVisible();

    // Date de dernière mise à jour affichée (FR-012).
    await expect(page.locator('.app-freshness')).toContainText('Dernière mise à jour');
  });
});
