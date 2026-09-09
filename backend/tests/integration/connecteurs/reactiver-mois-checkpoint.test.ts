import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reactiverMoisCheckpoint } from '../../../src/scripts/reactiver-mois-checkpoint.js';
import { lireCheckpoint, ecrireCheckpoint, type CheckpointBackfill } from '../../../src/scripts/backfill-historique.js';

/**
 * feature 007 (US4, T017) : `reactiverMoisCheckpoint` réinsère un périmètre
 * explicite dans le checkpoint réel de `backfill-historique.ts` (mêmes
 * `lireCheckpoint`/`ecrireCheckpoint`, pointés vers un fichier temporaire
 * jetable) — aucun réseau réel, aucune collecte déclenchée par ce script.
 */

const MAINTENANT = new Date(Date.UTC(2026, 7, 13, 10, 0, 0)); // 13 août 2026

describe('reactiverMoisCheckpoint (US4, FR-014/FR-015)', () => {
  let tempDir: string;
  let cheminCheckpoint: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-reactivation-'));
    cheminCheckpoint = path.join(tempDir, 'checkpoint.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  function deps() {
    return { lireCheckpoint, ecrireCheckpoint, maintenant: () => MAINTENANT };
  }

  it("réinjecte, pour un connecteur connu, les mois de sa profondeur cible qui ne sont plus dans moisRestants", async () => {
    const initial: CheckpointBackfill = {
      version: 1,
      connecteurs: {
        'conn-a': {
          profondeurCibleMois: 3,
          // Les 3 mois cibles (M-1..M-3 depuis août 2026 = juillet/juin/mai) ont déjà tous été retirés (traités "avant correctif").
          moisRestants: [],
          archivesEpuisees: false,
        },
      },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    const rapport = await reactiverMoisCheckpoint({ connecteurIds: ['conn-a'], cheminCheckpoint }, deps());

    expect(rapport).toEqual([{ connecteurId: 'conn-a', connecteurConnu: true, moisAjoutes: expect.any(Array) }]);
    expect(rapport[0]!.moisAjoutes).toHaveLength(3);

    const checkpointApres = await lireCheckpoint(cheminCheckpoint);
    expect(checkpointApres.connecteurs['conn-a']?.moisRestants).toHaveLength(3);
  });

  it("union avec l'existant : ne perd jamais un mois déjà en attente, ne produit jamais de doublon", async () => {
    const moisDejaEnAttente = { annee: '2026', moisNumero: '06' }; // juin, déjà en attente de reprise
    const initial: CheckpointBackfill = {
      version: 1,
      connecteurs: {
        'conn-a': { profondeurCibleMois: 3, moisRestants: [moisDejaEnAttente], archivesEpuisees: false },
      },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    const rapport = await reactiverMoisCheckpoint({ connecteurIds: ['conn-a'], cheminCheckpoint }, deps());

    // juillet et mai réinjectés (absents), juin déjà présent — jamais dupliqué.
    expect(rapport[0]!.moisAjoutes).toHaveLength(2);
    const checkpointApres = await lireCheckpoint(cheminCheckpoint);
    const restants = checkpointApres.connecteurs['conn-a']!.moisRestants;
    expect(restants).toHaveLength(3);
    expect(restants.filter((m) => m.annee === '2026' && m.moisNumero === '06')).toHaveLength(1);
  });

  it(
    'CORRECTIF (2026-09-09, demande utilisateur) : moisRestants reste trié du plus récent au plus ancien après réinjection, ' +
      'même quand un mois ancien restait déjà en tête avant la réactivation',
    async () => {
      // Mois ancien déjà en attente AVANT les mois récents qui seront
      // réinjectés — reproduit exactement le scénario observé en
      // production (prefecture-56) : un simple append plaçait les mois
      // récemment réactivés APRÈS un reliquat ancien, alors que
      // `executerBackfill` consomme la file par le début (`shift()`) et
      // doit donc traiter le plus récent en premier.
      const moisAncienDejaEnAttente = { annee: '2023', moisNumero: '09' };
      const initial: CheckpointBackfill = {
        version: 1,
        connecteurs: {
          'conn-a': { profondeurCibleMois: 3, moisRestants: [moisAncienDejaEnAttente], archivesEpuisees: false },
        },
      };
      await ecrireCheckpoint(cheminCheckpoint, initial);

      // Les 3 mois cibles (M-1..M-3 depuis août 2026) sont juillet/juin/mai 2026 — tous plus récents que 2023-09.
      await reactiverMoisCheckpoint({ connecteurIds: ['conn-a'], cheminCheckpoint }, deps());

      const checkpointApres = await lireCheckpoint(cheminCheckpoint);
      const restants = checkpointApres.connecteurs['conn-a']!.moisRestants;
      expect(restants).toEqual([
        { annee: '2026', moisNumero: '07' },
        { annee: '2026', moisNumero: '06' },
        { annee: '2026', moisNumero: '05' },
        { annee: '2023', moisNumero: '09' },
      ]);
    },
  );

  it('un connecteur jamais vu par le backfill (aucun état dans le checkpoint) ne bloque pas les autres du périmètre', async () => {
    const initial: CheckpointBackfill = {
      version: 1,
      connecteurs: { 'conn-b': { profondeurCibleMois: 1, moisRestants: [], archivesEpuisees: false } },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    const rapport = await reactiverMoisCheckpoint({ connecteurIds: ['conn-jamais-vu', 'conn-b'], cheminCheckpoint }, deps());

    expect(rapport).toEqual([
      { connecteurId: 'conn-jamais-vu', connecteurConnu: false, moisAjoutes: [] },
      { connecteurId: 'conn-b', connecteurConnu: true, moisAjoutes: expect.any(Array) },
    ]);
    expect(rapport[1]!.moisAjoutes).toHaveLength(1);
  });

  it('une plage --mois-debut/--mois-fin restreint les mois candidats à la réinjection', async () => {
    const initial: CheckpointBackfill = {
      version: 1,
      connecteurs: { 'conn-a': { profondeurCibleMois: 3, moisRestants: [], archivesEpuisees: false } },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    // Les 3 mois cibles sont juillet/juin/mai 2026 — restreint à juin uniquement.
    const rapport = await reactiverMoisCheckpoint(
      {
        connecteurIds: ['conn-a'],
        cheminCheckpoint,
        moisDebut: { annee: '2026', moisNumero: '06' },
        moisFin: { annee: '2026', moisNumero: '06' },
      },
      deps(),
    );

    expect(rapport[0]!.moisAjoutes).toEqual([{ annee: '2026', moisNumero: '06' }]);
  });

  it('lève à nouveau l’éligibilité (archivesEpuisees) d’un connecteur dès qu’au moins un mois lui est réinjecté', async () => {
    const initial: CheckpointBackfill = {
      version: 1,
      connecteurs: { 'conn-a': { profondeurCibleMois: 3, moisRestants: [], archivesEpuisees: true } },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    await reactiverMoisCheckpoint({ connecteurIds: ['conn-a'], cheminCheckpoint }, deps());

    const checkpointApres = await lireCheckpoint(cheminCheckpoint);
    expect(checkpointApres.connecteurs['conn-a']?.archivesEpuisees).toBe(false);
  });

  it("n'écrit rien sur disque quand aucun mois n'a été ajouté pour aucun connecteur du périmètre", async () => {
    const initial: CheckpointBackfill = {
      version: 1,
      // Les 3 mois cibles sont déjà tous en attente : aucune réinjection possible.
      connecteurs: {
        'conn-a': {
          profondeurCibleMois: 3,
          moisRestants: [
            { annee: '2026', moisNumero: '07' },
            { annee: '2026', moisNumero: '06' },
            { annee: '2026', moisNumero: '05' },
          ],
          archivesEpuisees: false,
        },
      },
    };
    await ecrireCheckpoint(cheminCheckpoint, initial);

    const rapport = await reactiverMoisCheckpoint({ connecteurIds: ['conn-a'], cheminCheckpoint }, deps());

    expect(rapport[0]!.moisAjoutes).toEqual([]);
    const checkpointApres = await lireCheckpoint(cheminCheckpoint);
    expect(checkpointApres.connecteurs['conn-a']?.moisRestants).toHaveLength(3);
  });
});
