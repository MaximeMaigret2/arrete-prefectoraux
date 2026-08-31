import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { fetchAvecSession, substituerPlaceholders, resoudreUrl } from '../support/reseauLive.js';

/**
 * Phase 5bis élargie 4 (2026-08-14) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-17`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture de la
 * Charente-Maritime.
 *
 * Préfecture de la Charente-Maritime — 1 seul niveau de `navigation`
 * (racine → année), dont la particularité (V011) est de lire `value`
 * (jamais `href`) sur l'unique `<option>` du `<select>` d'archives de la
 * page racine — aucun `<a>` équivalent n'existe sur cette page (cf.
 * SOURCE.md). Liste finale `.fr-card` avec lien PDF DIRECT (pas de
 * `page_detail`, contrairement à prefecture-16/77).
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-17.yaml`
 * tient encore. N'affirme RIEN sur le CONTENU (titres, dates, nombre exact
 * de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-17.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

describe('Dérive structurelle — prefecture-17 (manuel uniquement)', () => {
  it('la navigation (racine → année, via `value` d’un `<option>`) résout une page finale exposant au moins un lien PDF direct', async () => {
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
      // V011 : lit l'attribut configuré (`attribut_lien`, `value` pour ce
      // connecteur), jamais `href` en dur — cf. moteur.ts `resoudreNavigation`.
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

    expect(config.page_detail, 'aucun page_detail attendu pour prefecture-17 (PDF direct dans la liste).').toBeNull();

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $final(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });
    expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
  });
});
