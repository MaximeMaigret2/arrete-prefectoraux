import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { fetchAvecSession, substituerPlaceholders, resoudreUrl } from '../support/reseauLive.js';

/**
 * (2026-08-14, lot 31-36) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-31`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture de la
 * Haute-Garonne.
 *
 * Préfecture de la Haute-Garonne — navigation à DEUX niveaux (racine →
 * Haute-Garonne (vs Occitanie) → mois). Page du mois liste des VRAIES
 * cartes DSFR (`.fr-card`, lien PDF direct en `.fr-card__title a`, cf.
 * SOURCE.md).
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-31.yaml`
 * tient encore. N'affirme RIEN sur le CONTENU (titres, dates, nombre exact
 * de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-31.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-31 (manuel uniquement)', () => {
  it('la navigation à 2 niveaux (racine → Haute-Garonne → mois) résout une page finale exposant au moins un lien PDF direct', async () => {
    const config = await chargerConfigReelle();
    const maintenant = new Date();

    let urlCourante = config.url_liste;
    for (const [i, etape] of config.navigation.entries()) {
      const reponse = await fetchAvecSession(urlCourante);
      expect(reponse.ok, `Navigation étape ${i} : "${urlCourante}" inaccessible (HTTP ${reponse.status}).`).toBe(true);
      const html = await reponse.text();
      const $ = cheerio.load(html);
      const motif = substituerPlaceholders(etape.pattern_lien!, maintenant);
      const regex = new RegExp(motif, 'i');
      let trouve: string | null = null;
      $(etape.selecteur_liens).each((_, el) => {
        const lien = $(el).attr(etape.attribut_lien);
        if (!lien) return;
        const resolue = resoudreUrl(lien, urlCourante);
        if (!trouve && regex.test(resolue)) trouve = resolue;
      });
      expect(
        trouve,
        `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" (attribut "${etape.attribut_lien}") ne correspond à "${motif}" sur "${urlCourante}" — structure probablement modifiée.`,
      ).not.toBeNull();
      urlCourante = trouve!;
    }

    const reponseFinale = await fetchAvecSession(urlCourante);
    expect(reponseFinale.ok, `Page finale "${urlCourante}" inaccessible (HTTP ${reponseFinale.status}).`).toBe(true);
    const htmlFinal = await reponseFinale.text();
    const $final = cheerio.load(htmlFinal);
    const publications = $final(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'aucun page_detail attendu pour prefecture-31 (PDF direct dans la carte).').toBeNull();

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $final(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });
    expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
  });
});
