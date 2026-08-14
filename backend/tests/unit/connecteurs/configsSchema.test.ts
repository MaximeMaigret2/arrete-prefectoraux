import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import { PdfConfigSchema } from '../../../src/connecteurs/moteurs/pdf/config.schema.js';
import { RssConfigSchema } from '../../../src/connecteurs/moteurs/rss/config.schema.js';

/**
 * T047 (US3) — chaque configuration déclarative YAML sous
 * `connecteurs/configs/` (contracts/connecteur-interface.md §2-4) valide
 * contre le schéma zod de son `type_connecteur`, exactement comme
 * `registry.ts` (`creerConnecteur()`) le ferait au chargement réel — une
 * config cassée pour un connecteur réel (`prefecture-77/13/33`, T032-034)
 * ou un fixture de test mal formée serait ainsi détectée en CI plutôt qu'au
 * premier déclenchement (manuel ou planifié) de ce connecteur.
 *
 * `configs/` contient aussi des fixtures de test "inutilisées" —
 * `test-ajout-connecteur-2b.yaml`, `test-contract-connecteur-actif.yaml`,
 * `test-fake-registry-actif.yaml`, `test-fake-registry-invalide.yaml`
 * (créées en T004, réécrites par leurs suites respectives au moment du
 * test puis restaurées à un simple commentaire dans leur `afterEach`, cf.
 * `ajoutConnecteur.test.ts`/T038) — leur contenu YAML "au repos" (un seul
 * commentaire) n'est pas un objet de configuration et est explicitement
 * ignoré ci-dessous plutôt que traité comme une config invalide.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIGS_DIR = path.join(__dirname, '../../../src/connecteurs/configs');

const SCHEMAS_PAR_TYPE = {
  page_web: PageWebConfigSchema,
  pdf: PdfConfigSchema,
  rss: RssConfigSchema,
} as const;

async function chargerConfigsYaml(): Promise<Array<{ fichier: string; contenu: unknown }>> {
  const fichiers = (await readdir(CONFIGS_DIR)).filter((f) => f.endsWith('.yaml'));
  const resultats: Array<{ fichier: string; contenu: unknown }> = [];
  for (const fichier of fichiers) {
    const raw = await readFile(path.join(CONFIGS_DIR, fichier), 'utf-8');
    resultats.push({ fichier, contenu: yaml.load(raw) });
  }
  return resultats;
}

/** Vrai si `contenu` est un objet de configuration porteur d'un `type_connecteur` (par opposition à une fixture "au repos", simple commentaire YAML → `yaml.load` retourne `undefined`). */
function estUneConfigConnecteur(contenu: unknown): contenu is { type_connecteur: unknown } {
  return typeof contenu === 'object' && contenu !== null && 'type_connecteur' in contenu;
}

describe('configs/*.yaml — validation contre le schéma zod du type_connecteur (T047)', () => {
  it('au moins une configuration réelle est présente (le test ne passe pas vide silencieusement)', async () => {
    const configs = await chargerConfigsYaml();
    const reelles = configs.filter(({ contenu }) => estUneConfigConnecteur(contenu));
    expect(reelles.length).toBeGreaterThan(0);
  });

  it('les fixtures de test "au repos" (commentaire seul) sont ignorées, pas traitées comme invalides', async () => {
    const configs = await chargerConfigsYaml();
    const auRepos = configs.filter(({ contenu }) => !estUneConfigConnecteur(contenu));
    // Les 4 fixtures de test créées en T004/T038/T039/registry.test.ts.
    expect(auRepos.map((c) => c.fichier).sort()).toEqual(
      [
        'test-ajout-connecteur-2b.yaml',
        'test-contract-connecteur-actif.yaml',
        'test-fake-registry-actif.yaml',
        'test-fake-registry-invalide.yaml',
      ].sort(),
    );
  });

  it('chaque configuration réelle valide contre le schéma zod de son type_connecteur', async () => {
    const configs = await chargerConfigsYaml();

    for (const { fichier, contenu } of configs) {
      if (!estUneConfigConnecteur(contenu)) continue; // fixture au repos, cf. test précédent.

      const type = contenu.type_connecteur;
      const schema = (SCHEMAS_PAR_TYPE as Record<string, (typeof SCHEMAS_PAR_TYPE)[keyof typeof SCHEMAS_PAR_TYPE]>)[
        String(type)
      ];
      expect(schema, `${fichier} : type_connecteur "${String(type)}" inconnu (aucun schéma mappé dans ce test)`).toBeDefined();

      const resultat = schema!.safeParse(contenu);
      expect(resultat.success, `${fichier} : ${!resultat.success ? JSON.stringify(resultat.error.issues) : ''}`).toBe(
        true,
      );
    }
  });

  it('les 13 connecteurs réels (prefecture-77/13/33 + 01-05 + 06-10, Phase 5bis + élargie + élargie 2) sont bien de type page_web et présents', async () => {
    const configs = await chargerConfigsYaml();
    const ids = [
      'prefecture-77',
      'prefecture-13',
      'prefecture-33',
      'prefecture-01',
      'prefecture-02',
      'prefecture-03',
      'prefecture-04',
      'prefecture-05',
      'prefecture-06',
      'prefecture-07',
      'prefecture-08',
      'prefecture-09',
      'prefecture-10',
    ];
    for (const id of ids) {
      const config = configs.find((c) => c.fichier === `${id}.yaml`);
      expect(config, `${id}.yaml introuvable dans configs/`).toBeDefined();
      expect(estUneConfigConnecteur(config!.contenu) && config!.contenu.type_connecteur).toBe('page_web');
      const resultat = PageWebConfigSchema.safeParse(config!.contenu);
      expect(resultat.success).toBe(true);
    }
  });
});
