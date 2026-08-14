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
