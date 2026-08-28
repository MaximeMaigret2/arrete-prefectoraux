import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';

/**
 * Généré le 2026-08-27 (session Cowork — complétion de la suite `test:live-drift`
 * à 96/96 connecteurs, cf. claude/etat-connecteurs.md) — test de DÉRIVE
 * STRUCTURELLE pour `prefecture-42` (Le préfet de la Loire), jamais
 * exécuté automatiquement (cf. `backend/vitest.live.config.ts` / `README.md`,
 * `npm run test:live-drift` uniquement). De vrais appels réseau vers le site
 * réel de la préfecture.
 *
 * D'après `configs/prefecture-42.yaml` (config déjà validée par capture
 * live au moment du développement de ce connecteur) : 1 niveau de navigation.
 *
 * Vérifie UNIQUEMENT que la structure attendue par la config tient encore.
 * N'affirme RIEN sur le CONTENU (titres, dates, nombre exact de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-42.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

function substituerPlaceholders(pattern: string, maintenant: Date): string {
  const annee = String(maintenant.getFullYear());
  const moisNumero = String(maintenant.getMonth() + 1).padStart(2, '0');
  const noms = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  const moisFr = noms[maintenant.getMonth()];
  return pattern
    .replaceAll('{annee}', annee)
    .replaceAll('{mois_numero}', moisNumero)
    .replaceAll('{mois_fr_minuscule}', moisFr.toLowerCase())
    .replaceAll('{mois_fr}', moisFr);
}

function resoudreUrl(lien: string, base: string): string {
  const normalise = /^https?:\/\//i.test(lien) || lien.startsWith('/') ? lien : `/${lien}`;
  return new URL(normalise, base).toString();
}

// Même en-tête que EN_TETES_HTTP_DEFAUT (src/connecteurs/httpClient.ts) —
// cf. son commentaire : une rafale de `fetch()` sans User-Agent via
// `test:live-drift` a déjà provoqué un blocage IP temporaire de
// l'hébergeur mutualisé de plusieurs sites préfecture (2026-08-20).
const EN_TETES_COURTOISIE: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; ArretesRaveTeknivalBot/1.0; +mailto:maxime.maigret2@gmail.com)',
};

describe('Dérive structurelle — prefecture-42 (manuel uniquement)', () => {
  it('la navigation (1 niveau de navigation) résout une page finale exposant au moins un lien PDF direct', async () => {
    const config = await chargerConfigReelle();
    const maintenant = new Date();
    const moisCourant = maintenant.getMonth() + 1;

    async function fetchAvecSession(url: string): Promise<Response> {
      return fetch(url, { headers: EN_TETES_COURTOISIE });
    }

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
      expect(config.page_detail, 'aucun page_detail attendu pour prefecture-42 (PDF direct dans la publication).').toBeNull();
      let auMoinsUnLienPdf = 0;
      publications.each((_, element) => {
        const href = $liste(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
        if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
      });
      expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
    } else {
      expect(config.page_detail, 'page_detail attendu pour prefecture-42 (pas de PDF direct dans la liste).').not.toBeNull();
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
