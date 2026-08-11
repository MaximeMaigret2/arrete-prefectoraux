import type { Page } from '@playwright/test';

/**
 * Survole le département `code` en un point vérifié à l'intérieur de sa
 * géométrie réelle, plutôt qu'au centre de la bounding box du `<path>`
 * (ce que fait `.hover()` par défaut).
 *
 * Pourquoi : pour un département concave (ex. Seine-et-Marne, 77) ou une
 * géométrie mal recentrée par la projection cartographique, ni le centre de
 * la bounding box ni le centroïde géométrique projeté ne tombent forcément
 * à l'intérieur du tracé — l'un peut atterrir sur un département voisin,
 * l'autre dans le vide (aucun tracé sous le curseur, aucune infobulle).
 *
 * Approche : on attend d'abord que le `<path data-code="...">` soit rendu
 * (le TopoJSON réel est chargé de façon asynchrone après le premier rendu
 * de `<ComposableMap>`, contrairement à l'ancien placeholder synchrone), puis
 * on échantillonne une grille de points dans sa bounding box et on retient
 * le premier pour lequel `document.elementFromPoint` — le hit-test réel du
 * navigateur, qui respecte nativement le tracé peint (pas d'approximation
 * géométrique de notre côté) — désigne effectivement ce `<path>`.
 */
export async function hoverDepartement(page: Page, code: string): Promise<void> {
  const path = page.locator(`path[data-code="${code}"]`);
  await path.waitFor({ state: 'visible' });
  // Nécessaire car les coordonnées ci-dessous sont ensuite testées via
  // `document.elementFromPoint`, qui n'opère que sur le viewport actuellement
  // visible (contrairement à `.click()`/`.hover()`, qui scrollent
  // automatiquement l'élément en vue) — sans ça, un département situé sous
  // la ligne de flottaison (page plus haute que le viewport par défaut,
  // p. ex. avec le calendrier déployé) ne renvoie que des points `null`.
  await path.scrollIntoViewIfNeeded();

  const point = await path.evaluate((pathEl: SVGPathElement) => {
    const rect = pathEl.getBoundingClientRect();
    const steps = 16;
    // Le centre est essayé en premier (cas le plus fréquent), puis une
    // grille régulière en repli pour les formes concaves.
    const candidates: Array<[number, number]> = [[rect.x + rect.width / 2, rect.y + rect.height / 2]];
    for (let iy = 0; iy <= steps; iy++) {
      for (let ix = 0; ix <= steps; ix++) {
        candidates.push([rect.x + (rect.width * ix) / steps, rect.y + (rect.height * iy) / steps]);
      }
    }

    for (const [x, y] of candidates) {
      if (document.elementFromPoint(x, y) === pathEl) return { x, y };
    }
    return null;
  });

  if (!point) {
    throw new Error(
      `Aucun point survolable trouvé pour le département ${code} (tracé introuvable, dégénéré, ou entièrement masqué).`,
    );
  }
  await page.mouse.move(point.x, point.y);
}
