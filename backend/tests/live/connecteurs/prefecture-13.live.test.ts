import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { fetchAvecSession } from '../support/reseauLive.js';

/**
 * V007 (Phase 5bis, 2026-08-13) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-13`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). Un vrai appel réseau vers le site de la préfecture des
 * Bouches-du-Rhône.
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-13.yaml`
 * tient encore : sélecteurs qui matchent au moins un élément, lien PDF au
 * format attendu, page toujours joignable (200 OK). N'affirme RIEN sur le
 * CONTENU (titres, dates, nombre exact de bulletins) : ce contenu change
 * quotidiennement et n'est pas sous le contrôle de ce projet — un test qui
 * y serait sensible produirait des échecs permanents sans rapport avec une
 * vraie régression du connecteur (cf. la demande initiale de ne pas coupler
 * les tests automatisés à des données que l'on ne maîtrise pas).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-13.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-13 (V007, manuel uniquement)', () => {
  it('la page liste réelle répond 200 et expose au moins un lien PDF via les sélecteurs de la config', async () => {
    const config = await chargerConfigReelle();

    const reponse = await fetchAvecSession(config.url_liste);
    expect(reponse.ok, `Page liste "${config.url_liste}" inaccessible (HTTP ${reponse.status}) — URL peut-être obsolète.`).toBe(
      true,
    );

    const html = await reponse.text();
    const $ = cheerio.load(html);
    const publications = $(config.selecteur_publications);

    expect(
      publications.length,
      `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément — structure HTML probablement modifiée.`,
    ).toBeGreaterThan(0);

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $(element).find(config.selecteur_lien_pdf ?? '').attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });

    expect(
      auMoinsUnLienPdf,
      `Aucun élément ne fournit de lien PDF via le sélecteur "${config.selecteur_lien_pdf}" — le format des bulletins a peut-être changé.`,
    ).toBeGreaterThan(0);
  });
});
