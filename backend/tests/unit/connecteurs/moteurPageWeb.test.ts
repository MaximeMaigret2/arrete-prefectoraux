import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerConnecteur } from '../../../src/connecteurs/moteurs/pageWeb/moteur.js';
import { PageWebConfigSchema } from '../../../src/connecteurs/moteurs/pageWeb/config.schema.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

/**
 * T043 (US3) — tests du moteur `page_web` contre les fixtures réelles sur
 * disque (T036/T042), `pdf-parse` NON mocké : `pdf-parse` est appelé pour de
 * bon sur les octets réels de `piece-jointe.pdf`, comme le ferait le moteur
 * en production.
 *
 * `pdf-parse` était mocké dans toute cette suite jusqu'à T043 (cf. note de
 * T028). En construisant les fixtures PDF réelles de T042, il est apparu
 * que passer un `Buffer` Node directement à `pdf-parse` (pdf.js v1.10.100
 * embarqué) lève systématiquement `bad XRef entry`, y compris sur un PDF
 * parfaitement valide (constaté avec 3 PDF de provenances différentes,
 * y compris un fichier regénéré par `pikepdf`) — un `Uint8Array` brut ne
 * pose aucun problème. C'était un bug latent de `backend/src/connecteurs/moteurs/pdf/moteur.ts`
 * (`telechargerEtExtraireTextePdf`), jamais détecté faute de test exerçant
 * le vrai `pdf-parse` : corrigé à cette occasion (`new Uint8Array(buffer)`).
 * Ce test l'exerce donc directement, sans mock, ce qui n'aurait pas été
 * possible avant ce correctif.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');
const FIXTURE_PDF_LISTE_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-avec-pdf.html');
const FIXTURE_PDF_PATH = path.join(__dirname, '../../fixtures/connecteurs/pdf/piece-jointe.pdf');

const URL_LISTE = 'https://exemple.gouv.fr/Publications/RAA';
const URL_LISTE_AVEC_PDF = 'https://exemple.gouv.fr/Publications/RAA-avec-pdf';
const URL_PDF_JOINT = 'https://exemple.gouv.fr/pieces-jointes/piece-jointe.pdf';

const ENTREE: ConnecteurEntree = {
  id: 'test-page-web',
  nom: 'Connecteur de test page_web',
  departements_couverts: ['77'],
  actif: true,
  derniere_collecte: null,
  type_connecteur: 'page_web',
};

const CONFIG_BASE = {
  url_liste: URL_LISTE,
  selecteur_publications: '.raa-item',
  selecteur_titre: '.raa-item__titre',
  selecteur_lien_pdf: '.raa-item__piece-jointe' as string | null,
  autorite_signataire: 'Le Préfet de Seine-et-Marne',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
};

let html: string;

beforeEach(async () => {
  html = await readFile(FIXTURE_PATH, 'utf-8');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) {
        return { ok: true, status: 200, text: async () => html } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('moteur page_web — collecter()', () => {
  it('filtre les publications non pertinentes (aucun mot-clé)', async () => {
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null });
    const resultat = await connecteur.collecter();
    const references = resultat.candidats.map((c) => c.reference_arrete);
    expect(references).not.toContain('2026-77-0498');
  });

  it('extrait un candidat complet depuis le titre seul (sans pièce jointe) — texte propre (T036)', async () => {
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null });
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-77-0512');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 12)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 15)).toISOString());
    expect(candidat?.autorite_signataire).toBe('Le Préfet de Seine-et-Marne');
    expect(candidat?.departement_code).toBe('77');
    expect(candidat?.type_evenement).toBe('interdiction');
    expect(candidat?.source.type).toBe('page_web');
    expect(candidat?.source.url).toBe(URL_LISTE);
  });

  it("suit le lien PDF joint et extrait depuis le texte réel du PDF quand le titre seul ne suffit pas (T042, pdf-parse non mocké)", async () => {
    const htmlAvecPdf = await readFile(FIXTURE_PDF_LISTE_PATH, 'utf-8');
    const pdfBuffer = await readFile(FIXTURE_PDF_PATH);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE_AVEC_PDF) {
          return { ok: true, status: 200, text: async () => htmlAvecPdf } as unknown as Response;
        }
        if (url === URL_PDF_JOINT) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength),
          } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, url_liste: URL_LISTE_AVEC_PDF });
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-77-0520');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat?.autorite_signataire).toBe('Le Préfet de Seine-et-Marne');
    expect(candidat?.source.type).toBe('pdf');
    expect(candidat?.source.url).toBe(URL_PDF_JOINT);
  });

  it('signale un échec_global si la page liste est inaccessible (page liste illisible)', async () => {
    const connecteur = creerConnecteur(ENTREE, {
      ...CONFIG_BASE,
      url_liste: 'https://exemple.gouv.fr/introuvable',
      selecteur_lien_pdf: null,
    });
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });
});

/**
 * V001c (Phase 5bis, 2026-08-13) — extension du moteur `page_web` pour
 * `prefecture-33`/`prefecture-77` : résolution dynamique de `url_liste` via
 * `navigation` (année → mois, contrats/connecteur-interface.md §2bis), et
 * résolution du PDF via une page de détail intermédiaire (`page_detail`,
 * ex. `<option>` d'une liste déroulante dont l'attribut porteur de l'URL
 * n'est pas `href`).
 */
describe('moteur page_web — navigation multi-niveaux (V001c)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-racine';
  const URL_ANNEE = 'https://exemple.gouv.fr/Publications/RAA-racine/annee-2026';
  const URL_MOIS = 'https://exemple.gouv.fr/Publications/RAA-racine/annee-2026/Aout-2026';

  const HTML_RACINE = `
    <div class="fr-card__title"><a href="/Publications/RAA-racine/annee-2026">Année 2026</a></div>
    <div class="fr-card__title"><a href="/Publications/RAA-racine/annee-2025">Année 2025</a></div>
  `;
  const HTML_ANNEE = `
    <div class="fr-card__title"><a href="/Publications/RAA-racine/annee-2026/Aout-2026">Août 2026</a></div>
    <div class="fr-card__title"><a href="/Publications/RAA-racine/annee-2026/Juillet-2026">Juillet 2026</a></div>
  `;
  const HTML_MOIS = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-33-0900 portant interdiction de rassemblement de type rave,
        à compter du 13/08/2026 jusqu'au 15/08/2026
      </div>
    </div>
  `;

  const CONFIG_NAVIGATION = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    navigation: [
      { selecteur_liens: '.fr-card__title a', pattern_lien: '/annee-{annee}$' },
      { selecteur_liens: '.fr-card__title a', pattern_lien: '/{mois_fr}-{annee}$' },
    ],
    selecteur_lien_pdf: null as string | null,
  };

  beforeEach(() => {
    // "Maintenant" figé au 13/08/2026 : les placeholders {annee}/{mois_fr}
    // dépendent de la date d'exécution — sans horloge figée, ce test
    // deviendrait faux dès septembre 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('résout url_liste via navigation (année → mois) avant de lister les publications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => HTML_ANNEE } as unknown as Response;
        if (url === URL_MOIS) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_NAVIGATION);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-33-0900');
    // La source du candidat pointe vers la page EFFECTIVEMENT résolue par la
    // navigation (le mois), pas la racine — SC-002 (source consultable).
    expect(resultat.candidats[0].source.url).toBe(URL_MOIS);
  });

  it("signale un échec_global si une étape de navigation ne trouve aucun lien correspondant au motif (dérive de structure du site)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) {
          return {
            ok: true,
            status: 200,
            text: async () => '<div class="fr-card__title"><a href="/Publications/RAA-racine/annee-2019">Année 2019</a></div>',
          } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_NAVIGATION);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });
});

/**
 * V009 (Phase 5bis élargie, 2026-08-14) — forme `periodes` d'une étape de
 * `navigation`, découverte sur prefecture-04 (Alpes-de-Haute-Provence) :
 * archivage par semestre irrégulier (janvier-à-juillet / août-à-décembre)
 * plutôt que par mois calendaire, où `{mois_fr}` seul ne suffit pas (le nom
 * du mois courant n'apparaît pas dans l'URL de la période qui le contient,
 * sauf aux mois de bornes).
 */
describe('moteur page_web — navigation par périodes (V009)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-racine';
  const URL_PERIODE_S2 = 'https://exemple.gouv.fr/Publications/RAA-racine/2026-de-aout-a-decembre';

  const HTML_RACINE = `
    <div class="fr-card__title"><a href="/Publications/RAA-racine/2026-de-janvier-a-juillet">2026 de janvier à juillet</a></div>
    <div class="fr-card__title"><a href="/Publications/RAA-racine/2026-de-aout-a-decembre">2026 de août à décembre</a></div>
  `;
  const HTML_PERIODE = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-04-0900 portant interdiction de rassemblement de type rave,
        à compter du 13/08/2026 jusqu'au 15/08/2026
      </div>
    </div>
  `;

  const CONFIG_PERIODES = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    navigation: [
      {
        selecteur_liens: '.fr-card__title a',
        periodes: [
          { motif: '/{annee}-de-janvier-a-juillet$', mois_debut: 1, mois_fin: 7 },
          { motif: '/{annee}-de-aout-a-decembre$', mois_debut: 8, mois_fin: 12 },
        ],
      },
    ],
    selecteur_lien_pdf: null as string | null,
  };

  beforeEach(() => {
    // "Maintenant" figé au 13/08/2026 (mois 8) : doit sélectionner la
    // période août-à-décembre, jamais janvier-à-juillet.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('résout url_liste via la période dont [mois_debut, mois_fin] contient le mois courant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        if (url === URL_PERIODE_S2) return { ok: true, status: 200, text: async () => HTML_PERIODE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_PERIODES);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-04-0900');
    expect(resultat.candidats[0].source.url).toBe(URL_PERIODE_S2);
  });

  it("signale un échec_global si aucune période déclarée ne couvre le mois courant (config incomplète)", async () => {
    const configIncomplete = {
      ...CONFIG_PERIODES,
      navigation: [
        {
          selecteur_liens: '.fr-card__title a',
          // Ne couvre que janvier-juin : le mois courant figé (août) n'est
          // couvert par aucune période — trou de configuration.
          periodes: [{ motif: '/{annee}-de-janvier-a-juin$', mois_debut: 1, mois_fin: 6 }],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, configIncomplete);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });

  it('rejette une étape de navigation qui déclare à la fois pattern_lien et periodes', () => {
    const resultat = PageWebConfigSchema.safeParse({
      ...CONFIG_PERIODES,
      navigation: [
        {
          selecteur_liens: '.fr-card__title a',
          pattern_lien: '/{annee}$',
          periodes: [{ motif: '/{annee}-de-janvier-a-juillet$', mois_debut: 1, mois_fin: 7 }],
        },
      ],
    });
    expect(resultat.success).toBe(false);
  });

  it('rejette une étape de navigation qui ne déclare ni pattern_lien ni periodes', () => {
    const resultat = PageWebConfigSchema.safeParse({
      ...CONFIG_PERIODES,
      navigation: [{ selecteur_liens: '.fr-card__title a' }],
    });
    expect(resultat.success).toBe(false);
  });
});

/**
 * V010 (Phase 5bis élargie, 2026-08-14) — étape de navigation `optionnelle`,
 * découverte sur prefecture-02/05 : un lien de pagination « dernière page »
 * absent quand tout tient déjà sur une seule page (peu de publications en
 * tout début de mois/année) doit être traité comme « rien à faire », pas
 * comme une dérive de structure.
 */
describe('moteur page_web — étape de navigation optionnelle (V010)', () => {
  const URL_MOIS = 'https://exemple.gouv.fr/Publications/RAA-racine/Aout-2026';
  const URL_DERNIERE_PAGE = 'https://exemple.gouv.fr/Publications/RAA-racine/Aout-2026/(offset)/10';

  const HTML_MOIS_SANS_PAGINATION = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-05-0900 portant interdiction de rassemblement de type rave,
        à compter du 13/08/2026 jusqu'au 15/08/2026
      </div>
    </div>
  `;
  const HTML_MOIS_AVEC_PAGINATION = `<a class="fr-pagination__link--last" href="/Publications/RAA-racine/Aout-2026/(offset)/10">Dernière page</a>`;
  const HTML_DERNIERE_PAGE = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-05-0999 portant interdiction de rassemblement de type rave,
        à compter du 20/08/2026 jusqu'au 22/08/2026
      </div>
    </div>
  `;

  const CONFIG_OPTIONNELLE = {
    ...CONFIG_BASE,
    url_liste: URL_MOIS,
    navigation: [
      {
        selecteur_liens: '.fr-pagination__link--last',
        pattern_lien: '\\(offset\\)/\\d+$',
        optionnelle: true,
      },
    ],
    selecteur_lien_pdf: null as string | null,
  };

  it("utilise la page courante telle quelle quand le lien de pagination n'existe pas (mois avec peu de publications)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_MOIS) return { ok: true, status: 200, text: async () => HTML_MOIS_SANS_PAGINATION } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_OPTIONNELLE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-05-0900');
    expect(resultat.candidats[0].source.url).toBe(URL_MOIS);
  });

  it('suit quand même le lien de pagination optionnelle vers la dernière page quand il existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_MOIS) return { ok: true, status: 200, text: async () => HTML_MOIS_AVEC_PAGINATION } as unknown as Response;
        if (url === URL_DERNIERE_PAGE) return { ok: true, status: 200, text: async () => HTML_DERNIERE_PAGE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_OPTIONNELLE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-05-0999');
    expect(resultat.candidats[0].source.url).toBe(URL_DERNIERE_PAGE);
  });
});

describe('moteur page_web — page_detail (V001c)', () => {
  const URL_LISTE_SELECT = 'https://exemple.gouv.fr/Publications/RAA-2026';
  const URL_DETAIL = 'https://exemple.gouv.fr/Publications/RAA-2026/RAA-n-D77-20-08-2026';
  const URL_PDF_JOINT = 'https://exemple.gouv.fr/pieces-jointes/piece-jointe.pdf';

  const HTML_LISTE = `
    <select id="jours">
      <option value="">Liste</option>
      <option value="Publications/RAA-2026/RAA-n-D77-20-08-2026" title="RAA n° D77-20-08-2026">RAA n° D77-20-08-2026</option>
    </select>
  `;
  const HTML_DETAIL = `<a class="fr-link--download" href="/pieces-jointes/piece-jointe.pdf">Télécharger</a>`;

  const CONFIG_PAGE_DETAIL = {
    ...CONFIG_BASE,
    url_liste: URL_LISTE_SELECT,
    selecteur_publications: '#jours option',
    // Sélecteur volontairement sans correspondance (aucun descendant dans
    // un <option>) : force le repli sur $publication.text() (comportement
    // documenté dans prefecture-77.yaml).
    selecteur_titre: '.jamais-de-descendant-dans-une-option',
    selecteur_lien_pdf: 'a.fr-link--download',
    page_detail: { attribut_lien: 'value' },
  };

  it("résout la page de détail d'une publication via l'attribut `value` puis le PDF qui y est lié (attribut ≠ href, comme un <option>)", async () => {
    const pdfBuffer = await readFile(FIXTURE_PDF_PATH);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE_SELECT) return { ok: true, status: 200, text: async () => HTML_LISTE } as unknown as Response;
        if (url === URL_DETAIL) return { ok: true, status: 200, text: async () => HTML_DETAIL } as unknown as Response;
        if (url === URL_PDF_JOINT) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength),
          } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_PAGE_DETAIL);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat : l'<option> placeholder (value="") n'a pas d'URL à
    // résoudre et n'est jamais pertinente sur son seul titre (une date).
    expect(resultat.candidats).toHaveLength(1);
    const candidat = resultat.candidats[0];
    expect(candidat.reference_arrete).toBe('2026-77-0520');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_JOINT);
  });

  it('isole un échec de page de détail à cette seule publication (jamais un échec_global)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE_SELECT) return { ok: true, status: 200, text: async () => HTML_LISTE } as unknown as Response;
        // Page de détail inaccessible.
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_PAGE_DETAIL);
    const resultat = await connecteur.collecter();

    // Page liste bien lue (pas d'échec_global) ; le seul candidat possible
    // n'a jamais pu être confirmé pertinent (titre = une date, PDF
    // inatteignable) — liste vide, pas une erreur de run.
    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toEqual([]);
  });
});

/**
 * Q-001 (lot Qualité — Durcissement, 2026-08-22) — verrouille par un test le
 * piège `page_detail` rencontré et corrigé APRÈS COUP sur 58, 60, 70, 71 et
 * 81 : `selecteur_publications` pointant sur le conteneur englobant de la
 * carte DSFR (`.fr-card`) plutôt que sur l'élément porteur du `href`/`value`
 * lui-même (`.fr-card__title a`) produisait un échec entièrement silencieux
 * (`candidats: []`, aucune erreur, aucun signal exploitable). Avant Q-001,
 * ce cas n'était détecté qu'en observant "aucun candidat retenu" en bout de
 * chaîne — désormais un `echec_global` explicite et actionnable est renvoyé.
 */
describe('moteur page_web — piège page_detail sur un conteneur englobant (Q-001)', () => {
  const URL_LISTE_CARTES = 'https://exemple.gouv.fr/Publications/RAA-2026';

  // Reproduction fidèle du piège historique (58/60/70/71/81) : `.fr-card`
  // est le conteneur de la carte DSFR, mais seul son descendant
  // `.fr-card__title a` porte réellement le `href`.
  const HTML_LISTE_CARTES = `
    <div class="fr-card">
      <div class="fr-card__title"><a href="/Publications/RAA-2026/RAA-n-2026-0900">RAA n° 2026-0900</a></div>
    </div>
    <div class="fr-card">
      <div class="fr-card__title"><a href="/Publications/RAA-2026/RAA-n-2026-0901">RAA n° 2026-0901</a></div>
    </div>
  `;

  const CONFIG_PIEGE = {
    ...CONFIG_BASE,
    url_liste: URL_LISTE_CARTES,
    // Le piège : le conteneur, pas l'ancre elle-même.
    selecteur_publications: '.fr-card',
    selecteur_lien_pdf: 'a.fr-link--download',
    page_detail: { attribut_lien: 'href' },
  };

  it('signale un échec_global explicite (pas un candidats: [] silencieux) quand aucun élément matché ne porte l’attribut page_detail attendu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE_CARTES) return { ok: true, status: 200, text: async () => HTML_LISTE_CARTES } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_PIEGE);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
    // Message actionnable : mentionne l'attribut, le nombre d'éléments
    // concernés, le selecteur_publications fautif, et la règle à appliquer.
    expect(resultat.echec_global?.message).toContain('page_detail');
    expect(resultat.echec_global?.message).toContain('href');
    expect(resultat.echec_global?.message).toContain('.fr-card');
    expect(resultat.echec_global?.message).toMatch(/2 élément/);
  });

  it('ne déclenche PAS ce garde-fou quand selecteur_publications pointe correctement sur l’élément porteur du href (cas corrigé, non-régression)', async () => {
    const CONFIG_CORRIGEE = {
      ...CONFIG_PIEGE,
      selecteur_publications: '.fr-card__title a',
      mots_cles_filtrage: ['rave', 'teknival'],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE_CARTES) return { ok: true, status: 200, text: async () => HTML_LISTE_CARTES } as unknown as Response;
        // Aucune page de détail/PDF accessible ici : seul le comportement du
        // garde-fou Q-001 est sous test (il ne doit pas se déclencher), pas
        // l'extraction elle-même.
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CORRIGEE);
    const resultat = await connecteur.collecter();

    // Pas d'échec_global : les deux éléments matchés portent bien `href`
    // (attribut présent, même si sa page de détail est ici inaccessible —
    // un échec réseau isolé par publication, jamais confondu avec le piège
    // de configuration Q-001).
    expect(resultat.echec_global).toBeUndefined();
  });
});

/**
 * Q-003 (lot Qualité — Durcissement, 2026-08-22) — verrouille par un test
 * l'insensibilité à la casse du matching de `{mois_fr}` : elle a "sauvé"
 * la config 93 (Seine-Saint-Denis, cartes de mois en MAJUSCULES SANS ACCENT
 * dans le href, ex. "AOUT") sans jamais avoir été testée intentionnellement
 * jusqu'ici — un futur refactor du moteur de résolution de pattern pourrait
 * casser ce comportement sans qu'aucun test ne le révèle avant un connecteur
 * en production.
 */
describe('moteur page_web — insensibilité à la casse de {mois_fr} (Q-003, 93)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-racine';
  const URL_MOIS_MAJUSCULES = 'https://exemple.gouv.fr/Publications/RAA-racine/AOUT-2026';

  const HTML_RACINE = `<div class="fr-card__title"><a href="/Publications/RAA-racine/AOUT-2026">AOUT 2026</a></div>`;
  const HTML_MOIS = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-93-0900 portant interdiction de rassemblement de type rave,
        à compter du 13/08/2026 jusqu'au 15/08/2026
      </div>
    </div>
  `;

  const CONFIG_CASSE = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    // {mois_fr} substitue "Aout" (NOMS_MOIS_FR) — le href réel du site est
    // en MAJUSCULES SANS ACCENT ("AOUT"), jamais testé intentionnellement
    // avant Q-003.
    navigation: [{ selecteur_liens: '.fr-card__title a', pattern_lien: '{mois_fr}-{annee}$' }],
    selecteur_lien_pdf: null as string | null,
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0))); // 13 août 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('résout {mois_fr} ("Aout") contre un href tout en majuscules et sans accent ("AOUT")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        if (url === URL_MOIS_MAJUSCULES) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CASSE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-93-0900');
    expect(resultat.candidats[0].source.url).toBe(URL_MOIS_MAJUSCULES);
  });
});

/**
 * Q-003 (lot Qualité — Durcissement, 2026-08-22) — verrouille par un test
 * le motif d'élision `d(e)?` (69/Rhône, 82/Tarn-et-Garonne) : "RAA-d-Aout"
 * (mois à voyelle initiale, élidé) et "RAA-de-Septembre" (mois à consonne
 * initiale, non élidé) doivent tous deux matcher le même motif alterné —
 * jamais testé en régression jusqu'ici.
 */
describe('moteur page_web — élision grammaticale d/de sur {mois_fr} (Q-003, 69/82)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-racine';

  const CONFIG_ELISION = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    navigation: [{ selecteur_liens: '.fr-card__title a', pattern_lien: "RAA-d(e)?-{mois_fr}-{annee}$" }],
    selecteur_lien_pdf: null as string | null,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('résout la forme élidée "RAA-d-Aout-2026" (mois à voyelle initiale)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0))); // 13 août 2026

    const URL_MOIS = 'https://exemple.gouv.fr/Publications/RAA-racine/RAA-d-Aout-2026';
    const HTML_RACINE = `<div class="fr-card__title"><a href="/Publications/RAA-racine/RAA-d-Aout-2026">RAA d'Août 2026</a></div>`;
    const HTML_MOIS = `
      <div class="raa-item">
        <div class="raa-item__titre">
          Arrêté n° 2026-69-0900 portant interdiction de rassemblement de type rave,
          à compter du 13/08/2026 jusqu'au 15/08/2026
        </div>
      </div>
    `;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        if (url === URL_MOIS) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_ELISION);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-69-0900');
    expect(resultat.candidats[0].source.url).toBe(URL_MOIS);
  });

  it('résout la forme non élidée "RAA-de-Septembre-2026" (mois à consonne initiale)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 13, 10, 0, 0))); // 13 septembre 2026

    const URL_MOIS = 'https://exemple.gouv.fr/Publications/RAA-racine/RAA-de-Septembre-2026';
    const HTML_RACINE = `<div class="fr-card__title"><a href="/Publications/RAA-racine/RAA-de-Septembre-2026">RAA de Septembre 2026</a></div>`;
    const HTML_MOIS = `
      <div class="raa-item">
        <div class="raa-item__titre">
          Arrêté n° 2026-82-0900 portant interdiction de rassemblement de type rave,
          à compter du 13/09/2026 jusqu'au 15/09/2026
        </div>
      </div>
    `;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => HTML_RACINE } as unknown as Response;
        if (url === URL_MOIS) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_ELISION);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2026-82-0900');
    expect(resultat.candidats[0].source.url).toBe(URL_MOIS);
  });
});

/**
 * `session_cookie` (V0xx, 2026-08-27, découvert sur prefecture-57/Moselle,
 * `mc.moselle.gouv.fr`, CMS legacy « DIMS ») — cf. `config.schema.ts` pour
 * la justification complète. Un `fetch()` direct et sans état sur `url_liste`
 * échoue silencieusement sur ce type de site ; le moteur doit amorcer une
 * session (requête préalable vers `url_amorcage`) et réinjecter le cookie
 * obtenu sur toutes les requêtes restantes de la collecte.
 */
describe('moteur page_web — amorçage de session (session_cookie, V0xx, prefecture-57)', () => {
  const URL_AMORCAGE = 'https://exemple-legacy.gouv.fr/raa.html';
  const URL_LISTE_SESSION = 'https://exemple-legacy.gouv.fr/liste.html';

  const CONFIG_SESSION = {
    ...CONFIG_BASE,
    url_liste: URL_LISTE_SESSION,
    session_cookie: { url_amorcage: URL_AMORCAGE },
    selecteur_lien_pdf: null as string | null,
  };

  it('amorce la session puis réinjecte le cookie obtenu sur la requête de la page liste', async () => {
    const HTML_LISTE = `
      <div class="raa-item">
        <div class="raa-item__titre">
          Arrêté n° 2026-57-0900 portant interdiction de rassemblement de type rave,
          à compter du 13/08/2026 jusqu'au 15/08/2026
        </div>
      </div>
    `;
    const appels: Array<{ url: string; cookie: string | undefined }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        appels.push({ url, cookie: init?.headers?.Cookie });
        if (url === URL_AMORCAGE) {
          return {
            ok: true,
            status: 200,
            text: async () => '',
            headers: { getSetCookie: () => ['DIMSPHPSESSID=abc123; path=/; HttpOnly', 'nocache=1'] },
          } as unknown as Response;
        }
        if (url === URL_LISTE_SESSION) {
          return { ok: true, status: 200, text: async () => HTML_LISTE } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_SESSION);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    // L'amorçage a bien eu lieu (sans cookie, puisque c'est lui qui l'établit)...
    expect(appels[0]).toEqual({ url: URL_AMORCAGE, cookie: undefined });
    // ...et le cookie qu'il retourne est bien réinjecté sur la requête suivante.
    expect(appels[1]).toEqual({ url: URL_LISTE_SESSION, cookie: 'DIMSPHPSESSID=abc123; nocache=1' });
  });

  it("un connecteur sans session_cookie n'effectue aucune requête d'amorçage (comportement inchangé, défaut null)", async () => {
    const appels: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        appels.push(url);
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null });
    await connecteur.collecter();

    expect(appels).toEqual([URL_LISTE]);
  });

  it("un échec de l'amorçage de session produit un echec_global explicite plutôt qu'une exception non gérée", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_AMORCAGE) return { ok: false, status: 503, text: async () => '' } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_SESSION);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toHaveLength(0);
    expect(resultat.echec_global?.message).toContain('Amorçage de session');
    expect(resultat.echec_global?.source.url).toBe(URL_AMORCAGE);
  });
});

/**
 * `titre_frere` (V0xx, 2026-08-27, découvert sur prefecture-57/Moselle) —
 * cf. `config.schema.ts` pour la justification complète. Le CMS legacy
 * « DIMS » affiche le libellé/objet réel de l'acte dans une ligne de détail
 * masquée, SŒUR de la ligne visible (pas un descendant) — hors de portée de
 * `selecteur_titre` seul.
 */
describe('moteur page_web — libellé via élément frère (titre_frere, V0xx, prefecture-57)', () => {
  const CONFIG_FRERE = {
    ...CONFIG_BASE,
    selecteur_lien_pdf: null as string | null,
    selecteur_titre: '.ref',
    titre_frere: { selecteur_conteneur: 'tr.info', etiquette_libelle: 'Libellé' },
    mots_cles_filtrage: ['rave', 'teknival'],
    patterns_dates: {
      debut: "du\\s+\\S+\\s+(?<date>\\d{1,2}\\s+[a-zéèêûôîàâïç]+\\s+\\d{4})",
      fin: "au\\s+\\S+\\s+(?<date>\\d{1,2}\\s+[a-zéèêûôîàâïç]+\\s+\\d{4})",
    },
    pattern_reference: '^(?<reference>.+?)\\s+du\\s+',
  };

  it("complète le titre (référence seule, sans mot-clé) avec le libellé trouvé sur l'élément frère — y compris à travers un frère intercalaire vide (balisage malformé réel de prefecture-57)", async () => {
    const HTML_LISTE = `
      <table>
        <tr class="pub"><td class="ref">CAB/DS/PSI n°222 du 07 août 2026</td></tr>
        <tr></tr>
        <tr class="info">
          <td>
            <table>
              <tr><td>Libellé : </td><td>portant interdiction de rassemblement festifs à caractère musical de type "rave party" du vendredi 07 août 2026 à 18h00 au lundi 10 août 2026 à 08h00</td></tr>
            </table>
          </td>
        </tr>
      </table>
    `;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => HTML_LISTE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_FRERE, selecteur_publications: 'tr.pub' });
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('CAB/DS/PSI n°222');
    expect(resultat.candidats[0].date_debut).toBe(new Date(Date.UTC(2026, 7, 7)).toISOString());
    expect(resultat.candidats[0].date_fin).toBe(new Date(Date.UTC(2026, 7, 10)).toISOString());
  });

  it("sans conteneur frère correspondant, retombe sur le titre seul (pas de libellé trouvé — jamais d'exception)", async () => {
    const HTML_LISTE = `
      <table>
        <tr class="pub"><td class="ref">CAB/DS/PSI n°223 du 08 août 2026</td></tr>
      </table>
    `;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => HTML_LISTE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_FRERE, selecteur_publications: 'tr.pub' });
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Aucun mot-clé dans la seule référence : pas pertinent, aucun candidat — mais surtout, aucune exception.
    expect(resultat.candidats).toHaveLength(0);
  });
});


/**
 * Feature 005 (US1, T003) : `collecter(cible)` accepte un mois calendaire
 * arbitrairement passé, transmis à la résolution de `navigation` — sans
 * régression du comportement par défaut (FR-002), et avec une distinction
 * exploitable entre page introuvable (archives épuisées) et échec réseau
 * bas niveau (FR-004).
 */
describe('moteur page_web — mois cible arbitraire (feature 005, US1)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-historique';

  const CONFIG_CIBLE = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    selecteur_lien_pdf: null as string | null,
    navigation: [
      { selecteur_liens: '.fr-card__title a', pattern_lien: '/annee-{annee}$' },
      { selecteur_liens: '.fr-card__title a', pattern_lien: '/{mois_fr}-{annee}$' },
    ],
  };

  function pageAnnee(annee: string, urlMois: string, moisLabel: string): string {
    return `<div class="fr-card__title"><a href="${urlMois}">${moisLabel} ${annee}</a></div>`;
  }

  beforeEach(() => {
    // "Maintenant" figé en août 2026 — un mois cible explicite et éloigné
    // (ex. février 2023) doit primer sur cette horloge (FR-001), jamais
    // l'inverse.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un mois cible explicite résout navigation contre CE mois, jamais le mois courant (FR-001)', async () => {
    const URL_ANNEE_2023 = `${URL_RACINE}/annee-2023`;
    const URL_FEVRIER_2023 = `${URL_RACINE}/annee-2023/Fevrier-2023`;
    const HTML_MOIS = `
      <div class="raa-item">
        <div class="raa-item__titre">
          Arrêté n° 2023-13-0100 portant interdiction de rassemblement de type rave,
          à compter du 05/02/2023 jusqu'au 07/02/2023
        </div>
      </div>
    `;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => pageAnnee('2023', URL_ANNEE_2023, 'Année') } as unknown as Response;
        if (url === URL_ANNEE_2023) return { ok: true, status: 200, text: async () => pageAnnee('2023', URL_FEVRIER_2023, 'Fevrier') } as unknown as Response;
        if (url === URL_FEVRIER_2023) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CIBLE);
    const resultat = await connecteur.collecter({ annee: '2023', moisNumero: '02' });

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('2023-13-0100');
    expect(resultat.candidats[0].source.url).toBe(URL_FEVRIER_2023);
  });

  it('sans cible, résout toujours contre le mois courant Europe/Paris — comportement inchangé (FR-002)', async () => {
    const URL_ANNEE_2026 = `${URL_RACINE}/annee-2026`;
    const URL_AOUT_2026 = `${URL_RACINE}/annee-2026/Aout-2026`;
    const HTML_MOIS = `
      <div class="raa-item">
        <div class="raa-item__titre">
          Arrêté n° 2026-13-0900 portant interdiction de rassemblement de type rave,
          à compter du 13/08/2026 jusqu'au 15/08/2026
        </div>
      </div>
    `;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => pageAnnee('2026', URL_ANNEE_2026, 'Année') } as unknown as Response;
        if (url === URL_ANNEE_2026) return { ok: true, status: 200, text: async () => pageAnnee('2026', URL_AOUT_2026, 'Aout') } as unknown as Response;
        if (url === URL_AOUT_2026) return { ok: true, status: 200, text: async () => HTML_MOIS } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CIBLE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].source.url).toBe(URL_AOUT_2026);
  });

  it("un connecteur sans étape de navigation (ex. prefecture-13) ignore silencieusement le mois cible (FR-020)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null, navigation: [] });
    const resultat = await connecteur.collecter({ annee: '2010', moisNumero: '01' });

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats[0]?.source.url).toBe(URL_LISTE);
  });

  it('une page introuvable pour un mois cible trop ancien (archives épuisées) est classée causeReseau: false, jamais un échec réseau (FR-004)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) {
          // Aucune carte d'année 2010 sur la racine : la navigation ne trouve aucun lien correspondant.
          return { ok: true, status: 200, text: async () => pageAnnee('2026', `${URL_RACINE}/annee-2026`, 'Année') } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CIBLE);
    const resultat = await connecteur.collecter({ annee: '2010', moisNumero: '01' });

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.causeReseau).toBe(false);
  });

  it('un échec réseau bas niveau (fetch qui rejette) est classé causeReseau: true (FR-004)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) throw new Error('SocketError: other side closed');
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CIBLE);
    const resultat = await connecteur.collecter({ annee: '2023', moisNumero: '02' });

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.causeReseau).toBe(true);
  }, 10_000);

  it('une page liste introuvable (HTTP 404, sans navigation) est classée causeReseau: false (FR-004)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null, navigation: [] });
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.causeReseau).toBe(false);
  });

  it('un HTTP 503 (indisponibilité serveur transitoire) sur la navigation est classé causeReseau: true, jamais "archives épuisées" (correctif 2026-09-02, campagne réelle backfill)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) {
          // Racine accessible, mais la page de la carte d'année cible répond 503 (hébergement surchargé) —
          // avant correctif, n'importe quel statut non-2xx (dont 503) était classé comme "page introuvable".
          return { ok: false, status: 503, text: async () => '' } as unknown as Response;
        }
        return { ok: true, status: 200, text: async () => pageAnnee('2026', `${URL_RACINE}/annee-2026`, 'Année') } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_CIBLE);
    const resultat = await connecteur.collecter({ annee: '2026', moisNumero: '01' });

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.causeReseau).toBe(true);
  });

  it('un HTTP 503 sur la page liste elle-même (sans navigation) est classé causeReseau: true, jamais "archives épuisées" (correctif 2026-09-02)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => '' }) as unknown as Response),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null, navigation: [] });
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.causeReseau).toBe(true);
  });
});

/**
 * `granularite_liste: 'annuelle'` (feature 005, backfill historique,
 * 2026-09-04) — cf. le commentaire de `PageWebConfigSchema` dans
 * `config.schema.ts` : une source dont la `navigation` s'arrête au niveau
 * de l'année (jamais de mois) retourne, pour n'importe quel mois cible
 * d'une même année, rigoureusement la même page. Le moteur doit alors
 * signaler `anneesCouvertes: [cible.annee]`, que `backfill-historique.ts`
 * utilise pour éviter de la refaire une fois par mois cible.
 */
describe('moteur page_web — granularite_liste: annuelle (feature 005, backfill historique)', () => {
  const URL_RACINE = 'https://exemple.gouv.fr/Publications/RAA-annuel';

  const CONFIG_ANNUELLE = {
    ...CONFIG_BASE,
    url_liste: URL_RACINE,
    selecteur_lien_pdf: null as string | null,
    granularite_liste: 'annuelle' as const,
    navigation: [{ selecteur_liens: '.fr-card__title a', pattern_lien: '/annee-{annee}$' }],
  };

  function pageAnnee(annee: string, urlAnnee: string): string {
    return `<div class="fr-card__title"><a href="${urlAnnee}">Année ${annee}</a></div>`;
  }

  const HTML_ANNEE = `
    <div class="raa-item">
      <div class="raa-item__titre">
        Arrêté n° 2026-13-0700 portant interdiction de rassemblement de type rave,
        à compter du 05/03/2026 jusqu'au 07/03/2026
      </div>
    </div>
  `;

  it("signale anneesCouvertes: [cible.annee] sur un succès (mais jamais l'inverse pour un connecteur mensuel ordinaire, comportement par défaut inchangé)", async () => {
    const URL_ANNEE = `${URL_RACINE}/annee-2026`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => pageAnnee('2026', URL_ANNEE) } as unknown as Response;
        if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => HTML_ANNEE } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteurAnnuel = creerConnecteur(ENTREE, CONFIG_ANNUELLE);
    const resultatAnnuel = await connecteurAnnuel.collecter({ annee: '2026', moisNumero: '08' });
    expect(resultatAnnuel.echec_global).toBeUndefined();
    expect(resultatAnnuel.candidats).toHaveLength(1);
    expect(resultatAnnuel.anneesCouvertes).toEqual(['2026']);

    // Même config mais 'mensuelle' (défaut) : même page, mais AUCUNE couverture annuelle signalée — chaque mois reste traité individuellement.
    const connecteurMensuel = creerConnecteur(ENTREE, { ...CONFIG_ANNUELLE, granularite_liste: 'mensuelle' as const });
    const resultatMensuel = await connecteurMensuel.collecter({ annee: '2026', moisNumero: '08' });
    expect(resultatMensuel.anneesCouvertes).toBeUndefined();
  });

  it("deux mois cibles distincts de la même année résolvent bien la même page (justifie le batching, sans le tester ici)", async () => {
    const URL_ANNEE = `${URL_RACINE}/annee-2026`;
    const appelsPageAnnee: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_RACINE) return { ok: true, status: 200, text: async () => pageAnnee('2026', URL_ANNEE) } as unknown as Response;
        if (url === URL_ANNEE) {
          appelsPageAnnee.push(url);
          return { ok: true, status: 200, text: async () => HTML_ANNEE } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_ANNUELLE);
    const resultatAout = await connecteur.collecter({ annee: '2026', moisNumero: '08' });
    const resultatJanvier = await connecteur.collecter({ annee: '2026', moisNumero: '01' });

    expect(resultatAout.candidats).toEqual(resultatJanvier.candidats.map((c) => ({ ...c, source: resultatAout.candidats[0]!.source })));
    expect(appelsPageAnnee).toHaveLength(2); // le moteur lui-même ne met rien en cache — c'est backfill-historique.ts qui évite le second appel via anneesCouvertes.
  });

  it("n'a aucun effet sur echec_global (pas de anneesCouvertes sur un échec, ni réseau ni page introuvable)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => '' }) as unknown as Response),
    );
    const connecteur = creerConnecteur(ENTREE, CONFIG_ANNUELLE);
    const resultat = await connecteur.collecter({ annee: '2026', moisNumero: '08' });
    expect(resultat.echec_global).toBeDefined();
    expect(resultat.anneesCouvertes).toBeUndefined();
  });
});
