import { test, expect } from '@playwright/test';
import { hoverDepartement } from './helpers.js';

/**
 * US3 — Independent Test (spec.md) : survoler un département rouge, un vert
 * et un gris, et vérifier le contenu de chaque infobulle (FR-005/FR-006).
 * Départements de référence du jeu de test : 77 (rouge, sans date_fin),
 * 13 (vert, arrêté levé), 2A (gris, non couvert).
 */
test.describe('Infobulle au survol (US3)', () => {
  test('affiche le contenu attendu pour un département rouge, vert et gris', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('svg.map-svg')).toBeVisible();

    // Département rouge (77) : francilien, donc sur la carte principale il
    // partage désormais l'infobulle de région "Île-de-France" avec les 7
    // autres départements franciliens (2026-09-02, voir Map.tsx) — son
    // infobulle individuelle n'est accessible que dans la popin agrandie.
    await hoverDepartement(page, '77');
    await expect(page.getByTestId('idf-region-tooltip')).toBeVisible();
    await page.locator('svg.map-svg path[data-code="77"]').click();
    await expect(page.getByTestId('idf-zoom-modal')).toBeVisible();

    const tooltip = page.getByTestId('map-tooltip');
    await hoverDepartement(page, '77', 'svg.idf-modal-svg');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('data-etat', 'rouge');
    await expect(tooltip).toContainText('AP-2026-0842');
    await expect(tooltip).toContainText('Depuis le');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('idf-zoom-modal')).not.toBeVisible();

    // Département vert (13) : absence explicite d'interdiction en vigueur.
    await hoverDepartement(page, '13');
    await expect(tooltip).toHaveAttribute('data-etat', 'vert');
    await expect(tooltip).toContainText('Aucune interdiction en vigueur');

    // Département gris (2A) : mention explicite "non couvert".
    await hoverDepartement(page, '2A');
    await expect(tooltip).toHaveAttribute('data-etat', 'gris');
    await expect(tooltip).toContainText('Non couvert');
  });
});
