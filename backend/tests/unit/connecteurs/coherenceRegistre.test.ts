import { describe, expect, it } from 'vitest';
import { loadDataStore } from '../../../src/data/loader.js';

/**
 * Q-002 (lot Qualité — Durcissement, 2026-08-22).
 *
 * À chaque lot de connecteurs, un script Python `yaml.safe_load` ad hoc
 * revérifiait manuellement, à la main, la cohérence entre
 * `registre-sources.yaml` et `connecteurs.json` ("pas de manquant ni de
 * doublon") avant transfert — jamais formalisé en test permanent
 * (cf. `etat-connecteurs.md`, note ajoutée à chaque lot depuis 47-51).
 * Cette suite remplace ce script ad hoc par une vérification automatique,
 * exécutée à chaque run de la suite `tests/unit`.
 */
describe('Cohérence registre-sources.yaml ↔ connecteurs.json (Q-002)', () => {
  it('tout code connecteur_developpe du registre a une entrée active correspondante dans connecteurs.json', async () => {
    const store = await loadDataStore();
    const connecteursById = new Map(store.connecteurs.map((c) => [c.id, c]));

    const developpes = store.registreSources.filter((e) => e.statut === 'connecteur_developpe');
    expect(developpes.length).toBeGreaterThan(0);

    for (const entree of developpes) {
      expect(entree.connecteur_id).toBeTruthy();
      const connecteurId = entree.connecteur_id as string;

      const connecteur = connecteursById.get(connecteurId);
      expect(
        connecteur,
        `registre-sources.yaml : ${entree.departement_code} référence connecteur_id "${connecteurId}", absent de connecteurs.json`,
      ).toBeDefined();
      expect(
        connecteur?.actif,
        `connecteurs.json : "${connecteurId}" (${entree.departement_code}) devrait être actif: true puisque le registre le marque connecteur_developpe`,
      ).toBe(true);
      expect(
        connecteur?.departements_couverts,
        `connecteurs.json : "${connecteurId}" ne couvre pas le département ${entree.departement_code} qu'il est censé desservir selon le registre`,
      ).toContain(entree.departement_code);
    }
  });

  it("inversement, tout connecteur actif de connecteurs.json a une entrée connecteur_developpe correspondante dans le registre pour chacun de ses départements couverts", async () => {
    const store = await loadDataStore();
    const registreParCode = new Map(store.registreSources.map((e) => [e.departement_code, e]));

    for (const connecteur of store.connecteurs) {
      if (!connecteur.actif) continue;
      for (const code of connecteur.departements_couverts) {
        const entree = registreParCode.get(code);
        expect(
          entree,
          `connecteurs.json : "${connecteur.id}" couvre ${code}, absent de registre-sources.yaml`,
        ).toBeDefined();
        expect(
          entree?.statut,
          `registre-sources.yaml : ${code} devrait être connecteur_developpe puisque "${connecteur.id}" (actif) le couvre`,
        ).toBe('connecteur_developpe');
        expect(
          entree?.connecteur_id,
          `registre-sources.yaml : ${code} devrait référencer connecteur_id "${connecteur.id}"`,
        ).toBe(connecteur.id);
      }
    }
  });

  it('aucun doublon de code département dans registre-sources.yaml, ni de doublon d’id dans connecteurs.json', async () => {
    const store = await loadDataStore();

    const codesRegistre = store.registreSources.map((e) => e.departement_code);
    expect(codesRegistre.length).toBe(new Set(codesRegistre).size);

    const idsConnecteurs = store.connecteurs.map((c) => c.id);
    expect(idsConnecteurs.length).toBe(new Set(idsConnecteurs).size);
  });

  it('le registre couvre exactement les 96 départements du périmètre (métropole + Corse, DOM-TOM exclus)', async () => {
    const store = await loadDataStore();
    expect(store.registreSources.length).toBe(96);
    expect(store.departements.length).toBe(96);
  });
});
