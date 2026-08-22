import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';

/**
 * (2026-08-15, lot 37-41 — corrigé 2026-08-19 après capture live du
 * 2026-08-18) — test de DÉRIVE STRUCTURELLE pour `prefecture-39`, jamais
 * exécuté automatiquement (`npm run test:live-drift` uniquement). De vrais
 * appels réseau vers le site de la préfecture du Jura.
 *
 * CORRIGÉ : la version initiale de ce test (écrite le 2026-08-15, AVANT
 * toute capture live) supposait un `page_detail` — hypothèse la moins
 * étayée du lot 37-41 à l'époque. La capture live du 2026-08-18 a infirmé
 * cette hypothèse (cf. `configs/prefecture-39.yaml`) : le lien
 * `.fr-card__link` pointe DIRECTEMENT vers le PDF, pas de page de détail
 * intermédiaire — même famille que prefecture-36/Indre. Ce test n'avait
 * jamais été mis à jour en conséquence, d'où l'échec `page_detail attendu
 * ... expected null not to be null` observé le 2026-08-19 (faux positif :
 * dérive du TEST, pas du site).
 *
 * Navigation à 1 ou 2 niveaux (racine → année → « Dernière page »,
 * cette 2e étape `optionnelle: true` pour les années avec ≤10 bulletins).
 * Page finale liste des `.fr-card` avec lien PDF DIRECT en
 * `.fr-card__title a` / `a.fr-card__link`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function chargerConfigReelle(): Promise<ReturnType<typeof PageWebConfigSchema.parse>> {
  const configPath = path.join(__dirname, '../../../src/connecteurs/configs/prefecture-39.yaml');
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

describe('Dérive structurelle — prefecture-39 (manuel uniquement)', () => {
  it('la navigation à 1 ou 2 niveaux (racine → année → Dernière page, optionnelle) résout une page finale exposant au moins un lien PDF direct', async () => {
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
      if (trouve === null) {
        // Une étape `optionnelle` (V010) sans lien correspondant n'est PAS
        // une dérive de structure — même sémantique que `resoudreNavigation`
        // en production (ex. l'année courante tient déjà sur une seule page,
        // le lien "Dernière page" est alors légitimement absent du DOM).
        expect(
          etape.optionnelle,
          `Navigation étape ${i} : aucun lien via "${etape.selecteur_liens}" (attribut "${etape.attribut_lien}") ne correspond à "${motif}" sur "${urlCourante}" — structure probablement modifiée (étape non optionnelle).`,
        ).toBe(true);
        continue;
      }
      urlCourante = trouve;
    }

    const reponseFinale = await fetch(urlCourante);
    expect(reponseFinale.ok, `Page finale "${urlCourante}" inaccessible (HTTP ${reponseFinale.status}).`).toBe(true);
    const htmlFinal = await reponseFinale.text();
    const $final = cheerio.load(htmlFinal);
    const publications = $final(config.selecteur_publications);
    expect(publications.length, `Sélecteur "${config.selecteur_publications}" ne matche plus aucun élément sur "${urlCourante}".`).toBeGreaterThan(0);

    expect(config.page_detail, 'aucun page_detail attendu pour prefecture-39 (PDF direct dans la carte, confirmé en live 2026-08-18).').toBeNull();

    let auMoinsUnLienPdf = 0;
    publications.each((_, element) => {
      const href = $final(element).find(config.selecteur_lien_pdf ?? '').first().attr('href');
      if (href && href.toLowerCase().includes('.pdf')) auMoinsUnLienPdf += 1;
    });
    expect(auMoinsUnLienPdf, `Aucun élément ne fournit de lien PDF via "${config.selecteur_lien_pdf}" sur "${urlCourante}".`).toBeGreaterThan(0);
  });
});
