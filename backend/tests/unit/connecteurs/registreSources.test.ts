import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';

const CONNECTEURS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/data/connecteurs.json',
);

let snapshotConnecteurs: string;

// `connecteurs.json` réel n'a pas encore `type_connecteur` (bug préexistant,
// T005A/T032-034, hors périmètre de US1) : `loadDataStore()` échoue sinon à
// le parser. Patché temporairement pour ce fichier de test, comme le fait
// déjà `registry.test.ts`.
beforeEach(async () => {
  snapshotConnecteurs = await readFile(CONNECTEURS_PATH, 'utf-8');
  const reels = JSON.parse(snapshotConnecteurs) as Array<Record<string, unknown>>;
  const patches = reels.map((c) => ({ ...c, type_connecteur: c.type_connecteur ?? 'page_web' }));
  await writeFile(CONNECTEURS_PATH, `${JSON.stringify(patches, null, 2)}\n`, 'utf-8');
  resetDataStoreCache();
});

afterEach(async () => {
  await writeFile(CONNECTEURS_PATH, snapshotConnecteurs, 'utf-8');
  resetDataStoreCache();
});

describe('registre-sources.yaml — complétude (SC-007, FR-017)', () => {
  it('contient exactement une entrée par code de département, sans manquant ni doublon', async () => {
    const store = await loadDataStore();

    const codesDepartements = new Set(store.departements.map((d) => d.code));
    const codesRegistre = store.registreSources.map((e) => e.departement_code);

    // Aucun doublon dans le registre.
    expect(codesRegistre.length).toBe(new Set(codesRegistre).size);

    // Même ensemble de codes que departements.json, dans les deux sens.
    const codesRegistreSet = new Set(codesRegistre);
    const manquants = [...codesDepartements].filter((c) => !codesRegistreSet.has(c));
    const enTrop = [...codesRegistreSet].filter((c) => !codesDepartements.has(c));

    expect(manquants).toEqual([]);
    expect(enTrop).toEqual([]);
    expect(store.registreSources.length).toBe(store.departements.length);
  });

  it('marque les départements avec connecteur développé (77, 13, 33 + 01-05 + 06-10, Phase 5bis élargie 2) en statut connecteur_developpe', async () => {
    const store = await loadDataStore();
    const byCode = new Map(store.registreSources.map((e) => [e.departement_code, e]));

    for (const code of ['77', '13', '33', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']) {
      const entree = byCode.get(code);
      expect(entree?.statut).toBe('connecteur_developpe');
      expect(entree?.connecteur_id).toBeTruthy();
      expect(entree?.autorite).toBeTruthy();
      expect(entree?.point_acces).toBeTruthy();
    }
  });

  it('marque tous les autres départements en identifiee ou a_investiguer, jamais connecteur_developpe', async () => {
    const store = await loadDataStore();
    const developpes = new Set(['77', '13', '33', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);

    for (const entree of store.registreSources) {
      if (developpes.has(entree.departement_code)) continue;
      expect(entree.statut).not.toBe('connecteur_developpe');
      expect(entree.connecteur_id).toBeNull();

      if (entree.statut === 'identifiee') {
        // Source identifiée par recherche web (2026-08-13) : autorite/point_acces
        // renseignés, en attente de développement d'un connecteur (US2).
        expect(entree.autorite).toBeTruthy();
        expect(entree.point_acces).toBeTruthy();
      } else {
        expect(entree.statut).toBe('a_investiguer');
        expect(entree.autorite).toBeNull();
        expect(entree.point_acces).toBeNull();
      }
    }
  });
});
