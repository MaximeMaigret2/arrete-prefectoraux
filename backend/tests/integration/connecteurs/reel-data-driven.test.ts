import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Q-004 (lot Qualité — Durcissement, 2026-08-22).
 *
 * Remplace 94 des 95 fichiers `reel-prefecture-XX.test.ts` quasi
 * identiques (même gabarit à chaque lot : résolution navigation/liste +
 * extraction de pertinence, `fetch` entièrement mocké contre les fixtures
 * réelles de `tests/fixtures/connecteurs/reel/prefecture-XX/`) par une
 * suite unique data-driven, pilotée par un manifeste JSON généré une fois
 * par département (`reel.manifest.json`, dans chaque dossier de fixtures)
 * — mêmes assertions appliquées génériquement à tous.
 *
 * Corrige au passage le trou de couverture du test figé "43 connecteurs
 * réels" de `configsSchema.test.ts` (resté bloqué sur 37-41 depuis le lot
 * 47-51, jamais étendu — cf. Q-005) : cette suite couvre la totalité des
 * connecteurs réels développés, vérifiée par assertion `toHaveLength` en
 * fin de fichier.
 *
 * EXCEPTION VOLONTAIRE — prefecture-50 (Manche) : son test original
 * (`reel-prefecture-50.test.ts`, conservé tel quel, PAS remplacé) couvre
 * DEUX scénarios de date système distincts (août/novembre) pour exercer
 * les deux branches d'une pagination conditionnelle par `periodes` — un
 * seul manifeste (un seul `systemDate`) ne peut pas représenter les deux
 * sans perdre cette couverture.
 *
 * SECONDE EXCEPTION VOLONTAIRE — prefecture-57 (Moselle, chantier 57,
 * 2026-08-27) : son test dédié (`reel-prefecture-57.test.ts`) vérifie
 * explicitement le threading du cookie de session (`session_cookie`) sur
 * les appels `fetch()` successifs — une assertion sur les arguments reçus
 * par le mock, hors du schéma `ReponseFixture`/`ManifestReel` ci-dessous
 * (simple table URL → fichier, sans notion d'en-têtes de requête attendus).
 * Généraliser le schéma pour un unique connecteur n'apportait rien face à
 * un test dédié, même esprit que l'exception prefecture-50 ci-dessus.
 *
 * Les 94 autres connecteurs développés (96 au total, moins ces 2
 * exceptions), à scénario unique, sont entièrement couverts ici.
 *
 * Les manifestes ont été générés automatiquement à partir des 94 fichiers
 * `reel-prefecture-XX.test.ts` d'origine (mêmes URLs, mêmes fixtures,
 * mêmes valeurs attendues) par un script d'extraction ponctuel, puis
 * revérifiés par un run comparatif : mêmes résultats (verts) que la suite
 * d'origine avant son archivage dans `_archive/` (cf. `etat-connecteurs.md`,
 * section "Lot Qualité").
 */

interface ReponseFixture {
  url: string;
  file: string;
  type: 'html' | 'pdf';
}

interface ManifestReel {
  connecteurId: string;
  systemDate: string | null;
  responses: ReponseFixture[];
  expected: {
    candidatsLength: number;
    candidat: {
      departement_code: string;
      type_evenement: string;
      reference_arrete: string;
      date_debut: string | null;
      date_fin: string | null;
      autorite_signataire: string;
      source_type: string;
      source_url: string;
    };
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(__dirname, '../../fixtures/connecteurs/reel');

async function chargerManifests(): Promise<Array<{ dir: string; manifest: ManifestReel }>> {
  const entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const resultats: Array<{ dir: string; manifest: ManifestReel }> = [];
  for (const dir of dirs) {
    const manifestPath = path.join(FIXTURES_ROOT, dir, 'reel.manifest.json');
    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as ManifestReel | { invalide: true };
      // Un manifeste "invalide" (placeholder écrit par le script
      // d'extraction pour tout département non (re)confirmé lors du
      // dernier run, cf. son en-tête) est traité comme une absence de
      // manifeste — jamais silencieusement exécuté avec des données
      // périmées ou incomplètes.
      if ('invalide' in parsed || !Array.isArray((parsed as ManifestReel).responses)) continue;
      resultats.push({ dir, manifest: parsed as ManifestReel });
    } catch {
      // Pas de manifeste dans ce dossier de fixtures (ex. prefecture-50,
      // exception volontaire ci-dessus) — ignoré plutôt que de faire
      // échouer toute la suite.
    }
  }
  return resultats;
}

// Chargé une seule fois au niveau module : vitest (Vite/ESM) supporte le
// top-level await dans les fichiers de test.
const manifests = await chargerManifests();

describe.each(manifests)('connecteur réel $dir (Q-004, données pilotées par manifeste)', ({ dir, manifest }) => {
  const FIXTURES_DIR = path.join(FIXTURES_ROOT, dir);
  let contenuParFichier: Map<string, string | Buffer>;

  beforeEach(async () => {
    if (manifest.systemDate) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(manifest.systemDate));
    }

    contenuParFichier = new Map();
    for (const reponse of manifest.responses) {
      const contenu =
        reponse.type === 'html'
          ? await readFile(path.join(FIXTURES_DIR, reponse.file), 'utf-8')
          : await readFile(path.join(FIXTURES_DIR, reponse.file));
      contenuParFichier.set(reponse.file, contenu);
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const reponse = manifest.responses.find((r) => r.url === url);
        if (!reponse) return { ok: false, status: 404, text: async () => '' } as unknown as Response;

        const contenu = contenuParFichier.get(reponse.file)!;
        if (reponse.type === 'html') {
          return { ok: true, status: 200, text: async () => contenu as string } as unknown as Response;
        }
        const buf = contenu as Buffer;
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (manifest.systemDate) vi.useRealTimers();
  });

  it(`résout la navigation/liste et retient ${manifest.expected.candidatsLength} candidat(s)`, async () => {
    const connecteur = await obtenirConnecteur(manifest.connecteurId);
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(manifest.expected.candidatsLength);
  });

  it('extrait correctement le candidat retenu (référence, dates, signataire, source)', async () => {
    const connecteur = await obtenirConnecteur(manifest.connecteurId);
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];
    const attendu = manifest.expected.candidat;

    expect(candidat.departement_code).toBe(attendu.departement_code);
    expect(candidat.type_evenement).toBe(attendu.type_evenement);
    expect(candidat.reference_arrete).toBe(attendu.reference_arrete);
    expect(candidat.date_debut).toBe(attendu.date_debut);
    expect(candidat.date_fin).toBe(attendu.date_fin);
    expect(candidat.autorite_signataire).toBe(attendu.autorite_signataire);
    expect(candidat.source.type).toBe(attendu.source_type);
    expect(candidat.source.url).toBe(attendu.source_url);
  });
});

describe('couverture de la suite data-driven (Q-004/Q-005, chantier 57)', () => {
  it('couvre 94 des 96 connecteurs réels développés (prefecture-50 et prefecture-57 gardent chacun un test dédié)', () => {
    expect(manifests).toHaveLength(94);
    expect(manifests.some((m) => m.dir === 'prefecture-50')).toBe(false);
    expect(manifests.some((m) => m.dir === 'prefecture-57')).toBe(false);
  });
});
