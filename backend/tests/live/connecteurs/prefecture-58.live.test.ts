import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { fetchAvecSession, substituerPlaceholders, resoudreUrl } from '../support/reseauLive.js';

/**
 * Généré le 2026-08-27 (session Cowork — complétion de la suite `test:live-drift`
 * à 96/96 connecteurs, cf. claude/etat-connecteurs.md) — test de DÉRIVE
 * STRUCTURELLE pour `prefecture-58` (Le préfet de la Nièvre), jamais
 * exécuté automatiquement (cf. `backend/vitest.live.config.ts` / `README.md`,
 * `npm run test:live-drift` uniquement). De vrais appels réseau vers le site
 * réel de la préfecture.
 *
 * D'après `configs/prefecture-58.yaml` (config déjà validée par capture
 * live au moment du développement de ce connecteur) : 1 niveau de navigation, page de détail intermédiaire (`page_detail`, attribut_lien: "href") avant d'atteindre le PDF réel.
 *
 * Vérifie UNIQUEMENT que la structure attendue par la config tient encore.
 * N'affirme RIEN sur le CONTENU (titres, dates, nombre exact de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-58.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-58 (manuel uniquement)', () => {
  it('la navigation (1 niveau de navigation) résout une page exposant des publications, et au moins une mène à une page de détail avec un lien PDF', async () => {
    const config = await chargerConfigReelle();
    const maintenant = new Date();
    const moisCourant = maintenant.getMonth() + 1;

    

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
        expect(
          etape.optionnelle,
          `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" (attribut "${etape.attribut_lien}") ne correspond à "${motif}" sur "${urlCourante}", et cette étape n'est pas "optionnelle" — structure probablement modifiée.`,
        ).toBe(true);
        continue;
      }
      urlCourante = trouve;
    }

    const reponseListe = await fetchAvecSession(urlCourante);
    expect(reponseListe.ok, `Page liste "${urlCourante}" inaccessible (HTTP ${reponseListe.status}).`).toBe(true);
    const htmlListe = await reponseListe.text();
    const $liste = cheerio.load(htmlListe);
    const publications = $liste(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    if (config.page_detail === null) {
      expect(config.page_detail, 'aucun page_detail attendu pour prefecture-58 (PDF direct dans la publication).').toBeNull();
      let auMoinsUnLienPdf = 0;
      publications.each((_, element) => {
        const href = $liste(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
        if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
      });
      expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
    } else {
      expect(config.page_detail, 'page_detail attendu pour prefecture-58 (pas de PDF direct dans la liste).').not.toBeNull();
      const attribut = config.page_detail.attribut_lien;

      let auMoinsUnePublicationResolue = 0;
      for (const element of publications.toArray()) {
        const lienPublication = $liste(element).attr(attribut);
        if (!lienPublication) continue; // ex. option placeholder value=""

        const urlDetail = resoudreUrl(lienPublication, urlCourante);
        const reponseDetail = await fetchAvecSession(urlDetail);
        if (!reponseDetail.ok) continue;
        const htmlDetail = await reponseDetail.text();
        const $detail = cheerio.load(htmlDetail);
        const href = $detail(config.selecteur_lien_pdf ?? '').first().attr('href');
        if (href && href.toLowerCase().includes('.pdf')) {
          auMoinsUnePublicationResolue += 1;
          break; // une seule suffit à confirmer la structure — éviter de marteler le site.
        }
      }

      expect(
        auMoinsUnePublicationResolue,
        `Aucune publication testée n'a mené à une page de détail exposant un lien PDF via "${config.selecteur_lien_pdf}" (attribut "${attribut}").`,
      ).toBeGreaterThan(0);
    }
  });
});
