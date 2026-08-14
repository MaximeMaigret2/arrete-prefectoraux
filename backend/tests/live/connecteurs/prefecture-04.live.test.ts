import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';

/**
 * Phase 5bis élargie (2026-08-14) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-04`, jamais exécuté automatiquement (cf.
 * `backend/vitest.live.config.ts` / `README.md`, `npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture des
 * Alpes-de-Haute-Provence — un seul niveau de `navigation`, mais sous forme
 * `periodes` (V009) plutôt que `pattern_lien` : le motif à utiliser dépend du
 * mois courant (Europe/Paris), pas d'un simple gabarit `{mois_fr}`.
 *
 * Vérifie UNIQUEMENT que la structure attendue par `configs/prefecture-04.yaml`
 * tient encore. N'affirme RIEN sur le CONTENU (titres, dates, nombre exact
 * de bulletins).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-04.yaml');
  const raw = await readFile(configPath, 'utf-8');
  return PageWebConfigSchema.parse(yaml.load(raw));
}

function moisDansPlage(mois: number, debut: number, fin: number): boolean {
  return debut <= fin ? mois >= debut && mois <= fin : mois >= debut || mois <= fin;
}

function substituerPlaceholders(pattern: string, maintenant: Date): string {
  const annee = String(maintenant.getFullYear());
  return pattern.replaceAll('{annee}', annee);
}

describe('Dérive structurelle — prefecture-04 (manuel uniquement)', () => {
  it('la navigation par périodes résout, pour le mois courant, une page finale exposant au moins un lien PDF', async () => {
    const config = await chargerConfigReelle();
    const maintenant = new Date();
    const moisCourant = maintenant.getMonth() + 1;

    let urlCourante = config.url_liste;
    for (const [i, etape] of config.navigation.entries()) {
      const reponse = await fetch(urlCourante);
      expect(reponse.ok, `Navigation étape ${i} : "${urlCourante}" inaccessible (HTTP ${reponse.status}).`).toBe(true);
      const html = await reponse.text();
      const $ = cheerio.load(html);

      const periode = etape.periodes!.find((p) => moisDansPlage(moisCourant, p.mois_debut, p.mois_fin));
      expect(periode, `Étape ${i} : aucune période de "${config.url_liste}" ne couvre le mois courant (${moisCourant}) — config incomplète.`).toBeDefined();
      const motif = substituerPlaceholders(periode!.motif, maintenant);
      const regex = new RegExp(motif, 'i');

      let trouve: string | null = null;
      $(etape.selecteur_liens).each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const resolue = new URL(href, urlCourante).toString();
        if (!trouve && regex.test(resolue)) trouve = resolue;
      });
      expect(
        trouve,
        `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" ne correspond à "${motif}" sur "${urlCourante}" — structure probablement modifiée.`,
      ).not.toBeNull();
      urlCourante = trouve!;
    }

    const reponseFinale = await fetch(urlCourante);
    expect(reponseFinale.ok, `Page finale "${urlCourante}" inaccessible (HTTP ${reponseFinale.status}).`).toBe(true);
    const htmlFinal = await reponseFinale.text();
    const $final = cheerio.load(htmlFinal);
    const publications = $final(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $final(element).find(config.selecteur_lien_pdf ?? '').attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });
    expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
  });
});
