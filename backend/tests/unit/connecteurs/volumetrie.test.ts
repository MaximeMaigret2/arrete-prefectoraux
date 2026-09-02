import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataStore, definirRepertoireDonnees, resetDataStoreCache } from '../../../src/data/loader.js';
import { chargerConfigConnecteur, definirRepertoireConfigs } from '../../../src/connecteurs/registry.js';
import {
  auditerProfondeurs,
  classifierPageDetail,
  estimerVolumeMoyenParMois,
  CIBLE_MOIS_SANS_PAGE_DETAIL,
  CIBLE_MOIS_PAGE_DETAIL_ETENDUE,
  PLANCHER_MOIS_PAGE_DETAIL,
  SEUIL_VOLUME_RAISONNABLE_PAR_MOIS,
} from '../../../src/connecteurs/volumetrie.js';

/**
 * Feature 005 (US2, T010).
 *
 * Premier bloc : classification statique (gratuite, sans réseau) sur les 96
 * connecteurs RÉELS du dépôt (mêmes chiffres que documentés dans
 * `claude/etat-connecteurs.md` : 77 sans `page_detail`, 18 avec, 1 sans
 * `navigation` — `prefecture-13`).
 *
 * Second bloc : décision de profondeur par échantillon, sur deux
 * connecteurs `page_detail` SIMULÉS (fetch entièrement mocké, aucun réseau
 * réel) — l'un à fort volume (reste au plancher), l'autre à faible volume
 * (étendu).
 */
describe('classifierPageDetail — sur les 96 connecteurs réels actifs (US2)', () => {
  it('classe chaque connecteur actif dans exactement une famille (sans page_detail / avec page_detail / sans navigation, FR-020), total 96', async () => {
    const store = await loadDataStore();
    const actifs = store.connecteurs.filter((c) => c.actif);
    expect(actifs.length).toBe(96);

    let sansPageDetail = 0;
    let avecPageDetail = 0;
    let sansNavigation = 0;

    for (const entree of actifs) {
      const configBrute = await chargerConfigConnecteur(entree.id);
      const { aPageDetail, sansNavigation: pasDeNavigation } = classifierPageDetail(configBrute);
      // FR-020 : un connecteur sans étape de `navigation` (page déjà plate,
      // ou navigation explicitement vide) est hors périmètre du mécanisme
      // de collecte historique, qu'il ait ou non `page_detail` par ailleurs
      // (ex. prefecture-70/71 : page_detail actif MAIS liste déjà plate).
      if (pasDeNavigation) {
        sansNavigation += 1;
        continue;
      }
      if (aPageDetail) avecPageDetail += 1;
      else sansPageDetail += 1;
    }

    // Chiffres réels du dépôt (vérifiés programmatiquement plutôt que
    // recopiés de spec.md, dont les chiffres illustratifs — 77/18/1 —
    // datent du 2026-08-29 et ne tiennent pas compte des connecteurs dont
    // la navigation est explicitement vide, ex. prefecture-70/71/86, en
    // plus de prefecture-13/57) : la somme des trois DOIT rester 96, et
    // aucun connecteur n'appartient à plus d'une famille.
    expect(sansNavigation + avecPageDetail + sansPageDetail).toBe(96);
    expect(sansNavigation).toBeGreaterThanOrEqual(1); // au moins prefecture-13
    expect(avecPageDetail).toBeGreaterThan(0);
    expect(sansPageDetail).toBeGreaterThan(0);
  });

  it("prefecture-13 (page plate, sans navigation) est bien exclu (FR-020)", async () => {
    const configBrute = await chargerConfigConnecteur('prefecture-13');
    expect(classifierPageDetail(configBrute).sansNavigation).toBe(true);
  });
});

const CONFIG_BASE = {
  selecteur_titre: '.titre',
  selecteur_lien_pdf: '.pdf' as string | null,
  autorite_signataire: 'Le Préfet de test',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: null as string | null,
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
  page_detail: { attribut_lien: 'href' },
};

function construireConfigPageDetail(racine: string) {
  return {
    ...CONFIG_BASE,
    url_liste: `${racine}/RAA`,
    selecteur_publications: '.item',
    navigation: [{ selecteur_liens: 'a.mois', pattern_lien: '/{annee}-{mois_numero}$' }],
  };
}

/** Fabrique une réponse fetch simulée minimale, dans le même style que les autres tests du moteur page_web. */
function reponseHtml(html: string): Response {
  return { ok: true, status: 200, text: async () => html } as unknown as Response;
}
function reponse404(): Response {
  return { ok: false, status: 404, text: async () => '' } as unknown as Response;
}

describe('estimerVolumeMoyenParMois / auditerProfondeurs — décision par échantillon (US2, connecteurs simulés)', () => {
  const MAINTENANT = new Date(Date.UTC(2026, 7, 13, 10, 0, 0)); // août 2026 (Europe/Paris)
  const RACINE_HAUT = 'https://exemple.gouv.fr/haut-volume';
  const RACINE_BAS = 'https://exemple.gouv.fr/bas-volume';

  function htmlRacine(racine: string): string {
    return `
      <a class="mois" href="${racine}/RAA/2026-08">Août 2026</a>
      <a class="mois" href="${racine}/RAA/2026-07">Juillet 2026</a>
      <a class="mois" href="${racine}/RAA/2026-06">Juin 2026</a>
    `;
  }
  function htmlMois(nombreItems: number): string {
    return Array.from({ length: nombreItems }, (_, i) => `<div class="item">Publication ${i}</div>`).join('\n');
  }

  const VOLUME_HAUT = SEUIL_VOLUME_RAISONNABLE_PAR_MOIS + 10; // au-dessus du seuil sur les 3 mois échantillonnés
  const VOLUME_BAS = Math.max(1, SEUIL_VOLUME_RAISONNABLE_PAR_MOIS - 5); // en-dessous du seuil

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === `${RACINE_HAUT}/RAA`) return reponseHtml(htmlRacine(RACINE_HAUT));
        if (url === `${RACINE_BAS}/RAA`) return reponseHtml(htmlRacine(RACINE_BAS));
        if (url.startsWith(`${RACINE_HAUT}/RAA/2026-`)) return reponseHtml(htmlMois(VOLUME_HAUT));
        if (url.startsWith(`${RACINE_BAS}/RAA/2026-`)) return reponseHtml(htmlMois(VOLUME_BAS));
        return reponse404();
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un échantillon à fort volume ne modifie pas la moyenne mesurée (sanity check)', async () => {
    const moyenne = await estimerVolumeMoyenParMois(construireConfigPageDetail(RACINE_HAUT), MAINTENANT);
    expect(moyenne).toBe(VOLUME_HAUT);
  });

  it('un échantillon à fort volume reste au plancher de 3 mois (FR-007/FR-009 scenario 3)', async () => {
    const configId = 'test-volumetrie-haut';
    await avecConnecteursTemporaires([
      { id: configId, config: construireConfigPageDetail(RACINE_HAUT) },
    ], async () => {
      const profondeurs = await auditerProfondeurs(MAINTENANT);
      const resultat = profondeurs.find((p) => p.connecteurId === configId);
      expect(resultat).toBeDefined();
      expect(resultat?.aPageDetail).toBe(true);
      expect(resultat?.profondeurCibleMois).toBe(PLANCHER_MOIS_PAGE_DETAIL);
    });
  });

  it('un échantillon à faible volume peut être étendu au-delà du plancher (FR-007 scenario 2)', async () => {
    const configId = 'test-volumetrie-bas';
    await avecConnecteursTemporaires([
      { id: configId, config: construireConfigPageDetail(RACINE_BAS) },
    ], async () => {
      const profondeurs = await auditerProfondeurs(MAINTENANT);
      const resultat = profondeurs.find((p) => p.connecteurId === configId);
      expect(resultat).toBeDefined();
      expect(resultat?.aPageDetail).toBe(true);
      expect(resultat?.profondeurCibleMois).toBe(CIBLE_MOIS_PAGE_DETAIL_ETENDUE);
    });
  });

  it('un connecteur sans page_detail est classé à 3 ans sans aucun appel réseau', async () => {
    const configId = 'test-volumetrie-sans-page-detail';
    const config = {
      ...CONFIG_BASE,
      page_detail: null,
      url_liste: `${RACINE_HAUT}/RAA-simple`,
      selecteur_publications: '.item',
      navigation: [{ selecteur_liens: 'a.mois', pattern_lien: '/{annee}-{mois_numero}$' }],
    };
    const fetchEspion = vi.fn(async () => reponse404());
    await avecConnecteursTemporaires([{ id: configId, config }], async () => {
      vi.stubGlobal('fetch', fetchEspion);
      const profondeurs = await auditerProfondeurs(MAINTENANT);
      const resultat = profondeurs.find((p) => p.connecteurId === configId);
      expect(resultat?.profondeurCibleMois).toBe(CIBLE_MOIS_SANS_PAGE_DETAIL);
      expect(resultat?.volumeMoyenEchantillon).toBeNull();
      expect(fetchEspion).not.toHaveBeenCalled();
    });
  });

  it('exclut un connecteur page_web sans navigation (FR-020)', async () => {
    const configId = 'test-volumetrie-sans-navigation';
    const config = {
      ...CONFIG_BASE,
      page_detail: null,
      url_liste: `${RACINE_HAUT}/RAA-plate`,
      selecteur_publications: '.item',
      navigation: [],
    };
    await avecConnecteursTemporaires([{ id: configId, config }], async () => {
      const profondeurs = await auditerProfondeurs(MAINTENANT);
      expect(profondeurs.find((p) => p.connecteurId === configId)).toBeUndefined();
    });
  });

  /** Redirige loader.ts/registry.ts vers des répertoires temporaires jetables contenant UNIQUEMENT les connecteurs fournis (Q-006). */
  async function avecConnecteursTemporaires(
    connecteurs: Array<{ id: string; config: Record<string, unknown> }>,
    fn: () => Promise<void>,
  ): Promise<void> {
    const tempDataDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-volumetrie-data-'));
    const tempConfigsDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-volumetrie-configs-'));
    try {
      const connecteursJson = connecteurs.map((c) => ({
        id: c.id,
        nom: `Connecteur de test (${c.id})`,
        departements_couverts: ['99'],
        actif: true,
        derniere_collecte: null,
        type_connecteur: 'page_web',
      }));
      await writeFile(path.join(tempDataDir, 'connecteurs.json'), JSON.stringify(connecteursJson, null, 2), 'utf-8');
      await writeFile(path.join(tempDataDir, 'executions.json'), '[]', 'utf-8');
      await writeFile(path.join(tempDataDir, 'anomalies.json'), '[]', 'utf-8');
      await writeFile(path.join(tempDataDir, 'registre-sources.yaml'), '[]', 'utf-8');

      for (const c of connecteurs) {
        const yamlLines = objetVersYamlMinimal(c.config);
        await writeFile(path.join(tempConfigsDir, `${c.id}.yaml`), yamlLines, 'utf-8');
      }

      definirRepertoireDonnees(tempDataDir);
      definirRepertoireConfigs(tempConfigsDir);
      resetDataStoreCache();

      await fn();
    } finally {
      definirRepertoireDonnees(null);
      definirRepertoireConfigs(null);
      resetDataStoreCache();
      await rm(tempDataDir, { recursive: true, force: true });
      await rm(tempConfigsDir, { recursive: true, force: true });
    }
  }

  /** Sérialise l'objet de config en YAML — on passe par JSON (sous-ensemble valide de YAML) plutôt que par js-yaml pour ne dépendre d'aucune bibliothèque supplémentaire dans les tests. */
  function objetVersYamlMinimal(config: Record<string, unknown>): string {
    return JSON.stringify(config, null, 2);
  }
});
