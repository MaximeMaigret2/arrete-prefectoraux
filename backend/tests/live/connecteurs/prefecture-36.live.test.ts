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
 * `prefecture-36`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture de
 * l'Indre.
 *
 * Préfecture de l'Indre — navigation à TROIS niveaux (racine → année →
 * mois → « Dernière page », cette 3e étape `optionnelle: true`). Page
 * finale liste des `.fr-card` avec lien PDF DIRECT en `.fr-card__title a`
 * (cf. SOURCE.md).
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-36.yaml`
 * tient encore. N'affirme RIEN sur le CONTENU (titres, dates, nombre exact
 * de bulletins). À la différence des autres tests de dérive du lot, une
 * étape `optionnelle` sans lien correspondant N'EST PAS une dérive (même
 * sémantique que `resoudreNavigation` en production) — la page courante
 * reste alors inchangée pour l'étape suivante.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-36.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-36 (manuel uniquement)', () => {
  it('la navigation à 3 niveaux (racine → année → mois → Dernière page, optionnelle) résout une page finale exposant au moins un lien PDF direct', async () => {
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
      if (trouve === null) {
        // Une étape `optionnelle` (V010) sans lien correspondant n'est PAS
        // une dérive de structure — même sémantique que `resoudreNavigation`
        // en production (ex. le mois courant tient déjà sur une seule page,
        // le lien "Dernière page" est alors légitimement absent du DOM).
        expect(
          etape.optionnelle,
          `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" (attribut "${etape.attribut_lien}") ne correspond à "${motif}" sur "${urlCourante}" — structure probablement modifiée (étape non optionnelle).`,
        ).toBe(true);
        continue;
      }
      urlCourante = trouve;
    }

    const reponseFinale = await fetchAvecSession(urlCourante);
    expect(reponseFinale.ok, `Page finale "${urlCourante}" inaccessible (HTTP ${reponseFinale.status}).`).toBe(true);
    const htmlFinal = await reponseFinale.text();
    const $final = cheerio.load(htmlFinal);
    const publications = $final(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'aucun page_detail attendu pour prefecture-36 (PDF direct dans la carte).').toBeNull();

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $final(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });
    expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
  });
});
