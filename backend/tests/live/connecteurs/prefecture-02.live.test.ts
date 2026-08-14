import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';

/**
 * Phase 5bis élargie (2026-08-14) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-02`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture de
 * l'Aisne — `navigation` (année → dernière page de pagination, cette 2e
 * étape `optionnelle` : sautée silencieusement si le lien "dernière page"
 * est absent, cf. V010) PUIS `page_detail` (chaque `.fr-card__link` mène à
 * une page de détail, pas directement à un PDF).
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-02.yaml`
 * tient encore. N'affirme RIEN sur le CONTENU (titres, dates, nombre exact
 * de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-02.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

function substituerPlaceholders(pattern: string, maintenant: Date): string {
  const annee = String(maintenant.getFullYear());
  return pattern.replaceAll('{annee}', annee);
}

function resoudreUrl(lien: string, base: string): string {
  const normalise = /^https?:\/\//i.test(lien) || lien.startsWith('/') ? lien : `/${lien}`;
  return new URL(normalise, base).toString();
}

describe('Dérive structurelle — prefecture-02 (manuel uniquement)', () => {
  it("la navigation (racine → [dernière page]) résout une page exposant des publications, et au moins une mène à une page de détail avec un lien PDF", async () => {
    const config = await chargerConfigReelle();
    const maintenant = new Date();

    let urlCourante = config.url_liste;
    for (const [i, etape] of config.navigation.entries()) {
      const reponse = await fetch(urlCourante);
      expect(reponse.ok, `Navigation étape ${i} : "${urlCourante}" inaccessible (HTTP ${reponse.status}).`).toBe(true);
      const html = await reponse.text();
      const $ = cheerio.load(html);
      const motif = substituerPlaceholders(etape.pattern_lien!, maintenant);
      const regex = new RegExp(motif, 'i');
      let trouve: string | null = null;
      $(etape.selecteur_liens).each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const resolue = resoudreUrl(href, urlCourante);
        if (!trouve && regex.test(resolue)) trouve = resolue;
      });
      if (trouve === null) {
        // Étape optionnelle (V010) : lien absent (ex. année tenant sur une
        // seule page) traité comme "rien à faire", pas comme une dérive.
        expect(etape.optionnelle, `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" ne correspond à "${motif}" sur "${urlCourante}", et cette étape n'est pas "optionnelle" — structure probablement modifiée.`).toBe(true);
        continue;
      }
      urlCourante = trouve;
    }

    const reponseListe = await fetch(urlCourante);
    expect(reponseListe.ok, `Page liste "${urlCourante}" inaccessible (HTTP ${reponseListe.status}).`).toBe(true);
    const htmlListe = await reponseListe.text();
    const $liste = cheerio.load(htmlListe);
    const publications = $liste(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'page_detail attendu pour prefecture-02 (pas de PDF direct dans la liste).').not.toBeNull();
    const attribut = config.page_detail!.attribut_lien;

    let auMoinsUnePublicationResolue = 0;
    for (const element of publications.toArray()) {
      const lienPublication = $liste(element).attr(attribut);
      if (!lienPublication) continue;

      const urlDetail = resoudreUrl(lienPublication, urlCourante);
      const reponseDetail = await fetch(urlDetail);
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
  });
});
