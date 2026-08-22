import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';

/**
 * (2026-08-15, lot 37-41) — test de DÉRIVE STRUCTURELLE pour
 * `prefecture-40`, jamais exécuté automatiquement (`npm run test:live-drift`
 * uniquement). De vrais appels réseau vers le site de la préfecture des
 * Landes.
 *
 * IMPORTANT : déployé SANS capture live cette session — l'usage même de
 * `page_detail` et l'absence du préfixe `/index.php/` (cf. SOURCE.md) sont
 * des hypothèses non confirmées. Ce test est la PREMIÈRE vérification
 * réelle.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-40.yaml');
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

describe('Dérive structurelle — prefecture-40 (manuel uniquement)', () => {
  it('la navigation à 1 seul niveau (racine → année) résout une page finale exposant au moins une publication, dont la page de détail expose un lien PDF', async () => {
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

    const reponseFinale = await fetch(urlCourante);
    expect(reponseFinale.ok, `Page finale "${urlCourante}" inaccessible (HTTP ${reponseFinale.status}).`).toBe(true);
    const htmlFinal = await reponseFinale.text();
    const $final = cheerio.load(htmlFinal);
    const publications = $final(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'page_detail attendu pour prefecture-40 (hypothèse à confirmer).').not.toBeNull();

    const premierePublication = publications.first();
    const lienDetail = premierePublication.attr(config.page_detail!.attribut_lien);
    expect(lienDetail, `Le premier élément publication ne porte pas d'attribut "${config.page_detail!.attribut_lien}".`).toBeTruthy();

    const urlDetail = resoudreUrl(lienDetail!, urlCourante);
    const reponseDetail = await fetch(urlDetail);
    expect(reponseDetail.ok, `Page de détail "${urlDetail}" inaccessible (HTTP ${reponseDetail.status}).`).toBe(true);
    const htmlDetail = await reponseDetail.text();
    const $detail = cheerio.load(htmlDetail);
    const lienPdf = $detail(config.selecteur_lien_pdf ?? '').first().attr('href');
    expect(lienPdf && lienPdf.toLowerCase().includes('.pdf'), `Aucun lien PDF via "${config.selecteur_lien_pdf}" sur la page de détail "${urlDetail}".`).toBeTruthy();
  });
});
