import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { fetchAvecSession, substituerPlaceholders, resoudreUrl } from '../support/reseauLive.js';

/**
 * (2026-08-15, lot 37-41 — corrigé 2026-08-20 après capture live du
 * 2026-08-18) — test de DÉRIVE STRUCTURELLE pour `prefecture-38`, jamais
 * exécuté automatiquement (`npm run test:live-drift` uniquement). De vrais
 * appels réseau vers le site de la préfecture de l'Isère.
 *
 * CORRIGÉ : la version initiale de ce test (écrite le 2026-08-15, AVANT
 * toute capture live) supposait un PDF direct sans `page_detail`. La
 * capture live du 2026-08-18 a infirmé cette hypothèse (cf.
 * `configs/prefecture-38.yaml`) : la page de l'année expose un unique
 * `<select class="fr-select">` (327 `<option>` constatés) dont chaque
 * `value` pointe vers une page de détail (pas directement le PDF) — même
 * famille que prefecture-77. Ce test n'avait jamais été mis à jour en
 * conséquence, d'où l'échec `aucun page_detail attendu ... expected {
 * attribut_lien: 'value' } to be null` observé le 2026-08-19/20 (faux
 * positif : dérive du TEST, pas du site).
 *
 * Navigation à 1 niveau (racine → année) PUIS `page_detail` (chaque
 * `<option>` → une page de détail → le PDF réel).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-38.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-38 (manuel uniquement)', () => {
  it("la navigation à 1 seul niveau (racine → année) résout une page exposant le <select> attendu, et au moins une option mène à une page de détail avec un lien PDF", async () => {
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

    const reponseAnnee = await fetchAvecSession(urlCourante);
    expect(reponseAnnee.ok, `Page de l'année "${urlCourante}" inaccessible (HTTP ${reponseAnnee.status}).`).toBe(true);
    const htmlAnnee = await reponseAnnee.text();
    const $annee = cheerio.load(htmlAnnee);
    const publications = $annee(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'page_detail attendu pour prefecture-38 (pas de PDF direct dans le <select>, confirmé en live 2026-08-18).').not.toBeNull();
    const attribut = config.page_detail!.attribut_lien;

    let auMoinsUneOptionResolue = 0;
    for (const element of publications.toArray()) {
      const lienPublication = $annee(element).attr(attribut);
      if (!lienPublication) continue; // option placeholder (value="")

      const urlDetail = resoudreUrl(lienPublication, urlCourante);
      const reponseDetail = await fetchAvecSession(urlDetail);
      if (!reponseDetail.ok) continue;
      const htmlDetail = await reponseDetail.text();
      const $detail = cheerio.load(htmlDetail);
      const href = $detail(config.selecteur_lien_pdf ?? '').first().attr('href');
      if (href && href.toLowerCase().includes('.pdf')) {
        auMoinsUneOptionResolue += 1;
        break; // une seule suffit à confirmer la structure — éviter de marteler le site.
      }
    }

    expect(
      auMoinsUneOptionResolue,
      `Aucune option testée n'a mené à une page de détail exposant un lien PDF via "${config.selecteur_lien_pdf}" (attribut "${attribut}").`,
    ).toBeGreaterThan(0);
  });
});
