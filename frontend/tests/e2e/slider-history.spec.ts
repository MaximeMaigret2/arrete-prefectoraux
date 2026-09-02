import { test, expect } from '@playwright/test';

/**
 * US2 — Independent Test (spec.md) : choisir un intervalle couvrant la pose
 * et la levée d'un arrêté (département 13, cf. backend/src/data/events/13.json :
 * interdiction du 2026-05-01, levée le 2026-05-16), faire défiler la
 * réglette jour par jour, et vérifier le changement de couleur au bon jour.
 */
test.describe('Calendrier et réglette (US2)', () => {
  test('rejoue l’historique du département 13 et bascule rouge → vert au bon jour', async ({ page }) => {
    // Feature 006 : compte les appels réseau vers chacune des deux routes,
    // pour vérifier ensuite qu'un seul appel à /departements/etats a lieu à
    // la sélection de l'intervalle (SC-001), et qu'aucun appel à
    // /departements?date=... n'a lieu pendant le défilement de la réglette.
    let appelsEtatsPeriode = 0;
    let appelsDateUnique = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/v1/departements/etats')) {
        appelsEtatsPeriode += 1;
      } else if (url.includes('/api/v1/departements?date=')) {
        appelsDateUnique += 1;
      }
    });

    await page.goto('/');
    await expect(page.locator('svg.map-svg')).toBeVisible();

    // Le calendrier est replié derrière un menu déroulant (bouton résumant
    // la sélection courante) : on l'ouvre avant d'accéder au sélecteur de
    // mode et à la grille.
    await page.getByRole('button', { name: /date affichée sur la carte/i }).click();

    // Sélection du mode intervalle, puis navigation jusqu'à mai 2026
    // (react-day-picker affiche le mois courant par défaut, càd le mois de
    // la machine exécutant le test). Le nom accessible de la grille est le
    // mois affiché (ex. "May 2026" / "mai 2026" — cf. page snapshot des
    // exécutions précédentes) : on clique "mois précédent" jusqu'à ce qu'il
    // corresponde, plutôt qu'un nombre de clics fixe (dépendant de la date
    // du jour) ou qu'un libellé de bouton de jour (les jours sont exposés en
    // rôle "gridcell", pas "button" — cf. accessibility tree constaté).
    await page.getByLabel('Intervalle').check();
    const previousMonthButton = page.getByRole('button', { name: /mois précédent|previous month/i });
    // Le nom accessible de la grille est résolu par Playwright via
    // aria-labelledby (pas un attribut aria-label direct) — on laisse
    // `getByRole` faire cette résolution plutôt que de lire l'attribut
    // nous-mêmes.
    const targetGrid = page.getByRole('grid', { name: /^(mai|may)\s+2026$/i });
    const maxMonthsBack = 24;
    for (let i = 0; i < maxMonthsBack && (await targetGrid.count()) === 0; i++) {
      await previousMonthButton.click();
    }
    await expect(targetGrid).toBeVisible();

    // Sélectionne le 1er mai (juste avant l'interdiction) puis le 20 mai
    // 2026 (après la levée du 16 mai) — cf. backend/src/data/events/13.json.
    await page.getByRole('gridcell', { name: '1', exact: true }).click();
    await page.getByRole('gridcell', { name: '20', exact: true }).click();

    const slider = page.getByRole('slider', { name: 'Sélection de la date affichée sur la carte' });
    await expect(slider).toBeVisible();

    // La sélection de l'intervalle a déjà eu lieu (clics gridcell ci-dessus) :
    // exactement un appel à /departements/etats (feature 006, SC-001).
    expect(appelsEtatsPeriode).toBe(1);
    const appelsDateUniqueAvantDefilement = appelsDateUnique;

    // Département 13 rouge avant la levée (15 mai) : avance jusqu'au 16 mai.
    // Feature 006, SC-001/SC-002 : aucun appel réseau ni flash "Chargement
    // de la carte…" ne doit apparaître pendant tout le défilement — les
    // segments de l'intervalle ont déjà été chargés en un seul appel
    // ci-dessus, la réglette ne fait plus qu'une recherche locale de bornes.
    await slider.focus();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('p[aria-live="polite"]', { hasText: 'Chargement de la carte' })).toHaveCount(0);
    }

    // Aucun appel réseau supplémentaire déclenché par le défilement lui-même.
    expect(appelsEtatsPeriode).toBe(1);
    expect(appelsDateUnique).toBe(appelsDateUniqueAvantDefilement);

    // Aucun rechargement de page pendant tout le défilement (même URL).
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.slider-widget strong')).toContainText('2026-05-16');
    // Le 16 mai (jour de la levée), le département 13 est déjà vert.
    await expect(page.locator('[data-code="13"]')).toHaveAttribute('data-etat', 'vert');
  });
});
