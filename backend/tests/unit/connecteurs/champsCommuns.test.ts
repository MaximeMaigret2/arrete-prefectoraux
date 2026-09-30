import { describe, expect, it } from 'vitest';
import {
  decouperRecueilEnActes,
  estPertinent,
  extraireChampsCibles,
  extraireChampsCommuns,
  extraireDate,
  extraireIntervalleGenerique,
  extraireReference,
  parserDateFrancaise,
} from '../../../src/connecteurs/extraction/champsCommuns.js';

describe('parserDateFrancaise', () => {
  it('reconnaît une date numérique JJ/MM/AAAA', () => {
    expect(parserDateFrancaise('12/08/2026')).toBe('2026-08-12T00:00:00.000Z');
  });

  it('reconnaît une date numérique avec séparateurs - ou .', () => {
    expect(parserDateFrancaise('12-08-2026')).toBe('2026-08-12T00:00:00.000Z');
    expect(parserDateFrancaise('12.08.2026')).toBe('2026-08-12T00:00:00.000Z');
  });

  it('reconnaît une date littérale française avec accent', () => {
    expect(parserDateFrancaise('12 août 2026')).toBe('2026-08-12T00:00:00.000Z');
  });

  it('reconnaît une date littérale sans accent (résilience à la casse/normalisation source)', () => {
    expect(parserDateFrancaise('12 aout 2026')).toBe('2026-08-12T00:00:00.000Z');
    expect(parserDateFrancaise('12 AOUT 2026')).toBe('2026-08-12T00:00:00.000Z');
  });

  it('reconnaît le suffixe "er" pour le 1er du mois', () => {
    expect(parserDateFrancaise('1er janvier 2026')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('retourne null pour une date calendairement invalide (31 avril)', () => {
    expect(parserDateFrancaise('31/04/2026')).toBeNull();
    expect(parserDateFrancaise('31 avril 2026')).toBeNull();
  });

  it('retourne null pour un mois français inconnu', () => {
    expect(parserDateFrancaise('12 smarch 2026')).toBeNull();
  });

  it('retourne null pour une formulation non reconnue', () => {
    expect(parserDateFrancaise('à une date ultérieure')).toBeNull();
    expect(parserDateFrancaise('')).toBeNull();
  });
});

describe('extraireReference', () => {
  it("extrait la référence via le groupe nommé 'reference'", () => {
    const texte = 'Arrêté n° 2026-77-0142 portant interdiction de rassemblement.';
    expect(extraireReference(texte, 'Arrêté n°\\s*(?<reference>[0-9A-Z-]+)')).toBe('2026-77-0142');
  });

  it('retourne null si le pattern ne matche pas', () => {
    expect(extraireReference('texte sans référence', 'Arrêté n°\\s*(?<reference>[0-9A-Z-]+)')).toBeNull();
  });
});

describe('extraireDate', () => {
  const texte = "L'interdiction prend effet à compter du 12/08/2026 jusqu'au 15 août 2026.";

  it('extrait et convertit une date via un pattern', () => {
    expect(extraireDate(texte, 'à compter du (?<date>\\d{2}/\\d{2}/\\d{4})')).toBe(
      '2026-08-12T00:00:00.000Z',
    );
    expect(extraireDate(texte, "jusqu'au (?<date>\\d{1,2} [a-zéû]+ \\d{4})")).toBe(
      '2026-08-15T00:00:00.000Z',
    );
  });

  it('retourne null sans tenter d’extraction quand le pattern est null (ex. patterns_dates.fin absent)', () => {
    expect(extraireDate(texte, null)).toBeNull();
  });

  it('retourne null si le pattern ne matche pas dans le texte', () => {
    expect(extraireDate('texte sans date', 'à compter du (?<date>\\d{2}/\\d{2}/\\d{4})')).toBeNull();
  });
});

describe('extraireChampsCommuns', () => {
  it('produit reference_arrete/date_debut/date_fin à partir des patterns de configuration', () => {
    const texte =
      "Arrêté n° 2026-77-0142 portant interdiction à compter du 12/08/2026 jusqu'au 15 août 2026.";
    const resultat = extraireChampsCommuns(texte, {
      patternReference: 'Arrêté n°\\s*(?<reference>[0-9A-Z-]+)',
      patternsDates: {
        debut: 'à compter du (?<date>\\d{2}/\\d{2}/\\d{4})',
        fin: "jusqu'au (?<date>\\d{1,2} [a-zéû]+ \\d{4})",
      },
    });
    expect(resultat).toEqual({
      reference_arrete: '2026-77-0142',
      date_debut: '2026-08-12T00:00:00.000Z',
      date_fin: '2026-08-15T00:00:00.000Z',
    });
  });

  it('porte les champs à null explicitement (jamais omis) quand rien ne matche', () => {
    const resultat = extraireChampsCommuns('texte sans aucun champ reconnaissable', {
      patternReference: 'Arrêté n°\\s*(?<reference>[0-9A-Z-]+)',
      patternsDates: {
        debut: 'à compter du (?<date>\\d{2}/\\d{2}/\\d{4})',
        fin: null,
      },
    });
    expect(resultat).toEqual({
      reference_arrete: null,
      date_debut: null,
      date_fin: null,
    });
  });
});

describe('estPertinent', () => {
  const MOTS_CLES = ['rave', 'teknival', 'rassemblement festif à caractère musical'];

  it('ne matche pas un mot-clé inclus dans un autre mot (faux positifs réels 29/30/38/55)', () => {
    expect(estPertinent('foncier agricole au travers de structures sociétaires', MOTS_CLES)).toBe(false);
    expect(estPertinent('contraventions de 5e classe', MOTS_CLES)).toBe(false);
    expect(estPertinent('5 Traverse de la Pivolière', MOTS_CLES)).toBe(false);
    expect(estPertinent('menottes ou entraves ; troubles graves', MOTS_CLES)).toBe(false);
  });

  it('matche le mot-clé isolé, au pluriel ou suivi d\'un tiret', () => {
    expect(estPertinent('type teknival ou rave-party', MOTS_CLES)).toBe(true);
    expect(estPertinent('des raves non déclarées', MOTS_CLES)).toBe(true);
    expect(estPertinent('Arrêté Rave Party', MOTS_CLES)).toBe(true);
  });

  it('sépare les mots accolés en CamelCase (intitulés issus de noms de fichiers)', () => {
    expect(estPertinent('APinterdiction-RaveParty-4-aout-26', MOTS_CLES)).toBe(true);
  });

  it('tolère le pluriel et un retour à la ligne dans un mot-clé de plusieurs mots', () => {
    expect(estPertinent('les rassemblements festifs à caractère\nmusical sont interdits', MOTS_CLES)).toBe(true);
  });
});

/**
 * RAA compilé synthétique reproduisant la structure réelle observée
 * (prefecture-23/29/30/38/55/58) : sommaire, page de garde par acte
 * (identifiant seul sur sa ligne), pied de page « service - identifiant -
 * intitulé » suivi du numéro de page.
 */
const PATTERNS = {
  patternReference: 'Arrêté\\s+n°\\s*(?<reference>[A-Z0-9-]+)',
  patternsDates: {
    debut: 'à compter du\\s+(?<date>\\d{2}/\\d{2}/\\d{4})',
    fin: "jusqu'au\\s+(?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  motsCles: ['rave', 'teknival'],
};

function pied(reference: string, intitule: string, page: number): string {
  return `Préfecture de Test - ${reference} - ${intitule}\n${page}\n`;
}

const RECUEIL = [
  'RECUEIL DES ACTES ADMINISTRATIFS N°99-2026-001',
  'Sommaire',
  '99-2026-09-01-00001 - Convention à compter du 01/09/2026 (1 page)',
  '99-2026-09-04-00002 - Arrêté Rave Party (2 pages)',
  '2',
  'Préfecture de Test',
  '99-2026-09-01-00001',
  'Convention',
  pied('99-2026-09-01-00001', 'Convention', 3),
  'Arrêté n° 99-2026-09-01-00001 portant agrément à compter du 21/10/2026.',
  pied('99-2026-09-01-00001', 'Convention', 4),
  'Préfecture de Test',
  '99-2026-09-04-00002',
  'Arrêté Rave Party',
  pied('99-2026-09-04-00002', 'Arrêté Rave Party', 5),
  'Arrêté n° 99-2026-09-04-00002 portant interdiction des rave-parties',
  'à compter du 21/09/2026 jusqu\'au 21/12/2026.',
  pied('99-2026-09-04-00002', 'Arrêté Rave Party', 6),
].join('\n');

describe('decouperRecueilEnActes', () => {
  it('découpe un RAA compilé selon les pieds de page, sommaire exclu', () => {
    const actes = decouperRecueilEnActes(RECUEIL);
    expect(actes.map((a) => a.reference)).toEqual(['99-2026-09-01-00001', '99-2026-09-04-00002']);
    expect(actes[0].texte).not.toContain('Sommaire');
    expect(actes[0].texte).toContain('21/10/2026');
    expect(actes[1].texte).toContain('21/09/2026');
    expect(actes[1].texte).not.toContain('21/10/2026');
  });

  it("retourne [] pour un texte sans structure de recueil (arrêté isolé)", () => {
    expect(decouperRecueilEnActes('Arrêté n° 2026-1 portant interdiction des rave-parties à compter du 01/08/2026')).toEqual([]);
  });
});

describe('extraireChampsCibles', () => {
  it("extrait les champs de l'acte pertinent, pas de la première correspondance du recueil", () => {
    expect(extraireChampsCommuns(RECUEIL, PATTERNS).date_debut).toBe('2026-09-01T00:00:00.000Z');
    expect(extraireChampsCibles(RECUEIL, PATTERNS)).toEqual({
      reference_arrete: '99-2026-09-04-00002',
      date_debut: '2026-09-21T00:00:00.000Z',
      date_fin: '2026-12-21T00:00:00.000Z',
      date_fin_ambigue: false,
    });
  });

  it("acte pertinent scanné (pieds de page seuls) : identifiant de l'acte en référence, dates null", () => {
    const recueil = RECUEIL.replace(
      "Arrêté n° 99-2026-09-04-00002 portant interdiction des rave-parties\nà compter du 21/09/2026 jusqu'au 21/12/2026.",
      '',
    );
    expect(extraireChampsCibles(recueil, PATTERNS)).toEqual({
      reference_arrete: '99-2026-09-04-00002',
      date_debut: null,
      date_fin: null,
      date_fin_ambigue: false,
    });
  });

  it('mot-clé seulement dans le sommaire : aucun champ, jamais ceux d\'un autre acte', () => {
    const recueil = RECUEIL.replace(/Arrêté Rave Party/g, 'Arrêté circulation').replace('rave-parties', 'poids lourds');
    expect(extraireChampsCibles(recueil.replace('(2 pages)', 'rave (2 pages)'), PATTERNS)).toEqual({
      reference_arrete: null,
      date_debut: null,
      date_fin: null,
      date_fin_ambigue: false,
    });
  });

  it('texte sans structure de recueil, ou sans mots-clés : extraction sur le texte entier (inchangé)', () => {
    const texte = "Arrêté n° 2026-1 portant interdiction des rave-parties à compter du 01/08/2026 jusqu'au 03/08/2026";
    const attendu = {
      reference_arrete: '2026-1',
      date_debut: '2026-08-01T00:00:00.000Z',
      date_fin: '2026-08-03T00:00:00.000Z',
      date_fin_ambigue: false,
    };
    expect(extraireChampsCibles(texte, PATTERNS)).toEqual(attendu);
    expect(extraireChampsCibles(RECUEIL, { ...PATTERNS, motsCles: [] }).date_debut).toBe('2026-09-01T00:00:00.000Z');
  });
});

/** Dates ISO attendues (minuit UTC), écrites en abrégé. */
const iso = (jour: string | null) => (jour ? `${jour}T00:00:00.000Z` : null);

describe('extraireIntervalleGenerique — formulations réelles des arrêtés anti-rave', () => {
  it.each([
    [
      'prefecture-23 : du <jour> JJ mois AAAA à HHh au <jour> JJ mois AAAA inclus (coupé par un retour à la ligne)',
      "Article 1er : ... est interdite, du vendredi 14\naoût 2026 à 17h au lundi 17 août 2026 inclus , sur l'ensemble",
      null,
      '2026-08-14',
      '2026-08-17',
    ],
    [
      'prefecture-03 : « à partir de 18 h jusqu’au »',
      'ARRÊTE\nArticle 1 : Tout rassemblement de type rave-party est interdit du vendredi 6 février 2026 à partir de 18 h jusqu’au lundi 9 février 2026 à 20 h inclus.',
      null,
      '2026-02-06',
      '2026-02-09',
    ],
    [
      'prefecture-14 (2026+) : applicables du … à 18h00 au … à 8h00',
      'ARRETE :\nArt. 5 : Ces mesures sont applicables du vendredi 24 avril 2026 à 18h00 au lundi 27 avril 2026 à 8h00.',
      null,
      '2026-04-24',
      '2026-04-27',
    ],
    [
      'prefecture-14 (2024) : pendant la période du …, 18 h00 au …, 8 h00',
      'pendant la période du vendredi 29 mars 2024, 18 h00 au mardi 2 avril 2024, 8 h00.',
      null,
      '2024-03-29',
      '2024-04-02',
    ],
    [
      "prefecture-58 : entre le … et le …, sans année (année de l'identifiant de l'acte)",
      'A R R Ê T E\nArticle 1er : ... entre le lundi 21 septembre 00h00 et le lundi 21 décembre 24h00 inclus.',
      '58-2026-09-04-00011',
      '2026-09-21',
      '2026-12-21',
    ],
    [
      'prefecture-21 : « 1er » et année portée par la seule date de fin',
      'est interdit du 1er juillet au 6 septembre 2026 inclus.',
      null,
      '2026-07-01',
      '2026-09-06',
    ],
    ['intervalle franchissant le 31 décembre', 'du 28 décembre au 3 janvier 2027', null, '2026-12-28', '2027-01-03'],
    ['format numérique historique', "à compter du 01/09/2026 jusqu'au 30/09/2026", null, '2026-09-01', '2026-09-30'],
    ['borne de fin seule (prefecture-14, 2024)', "Ces mesures sont applicables jusqu'au 8 septembre 2024 inclus.", null, null, '2024-09-08'],
  ])('%s', (_cas, texte, referenceActe, debut, fin) => {
    expect(extraireIntervalleGenerique(texte, referenceActe)).toEqual({ debut: iso(debut), fin: iso(fin) });
  });

  it("préfère l'intervalle du dispositif (après « ARRÊTE ») à celui d'un considérant", () => {
    const texte =
      "Considérant qu'un rassemblement s'est tenu du 5 au 6 avril 2025 ;\nARRÊTE\nArticle 1 : interdit du samedi 3 mai 2025 au dimanche 4 mai 2025.";
    expect(extraireIntervalleGenerique(texte)).toEqual({ debut: iso('2025-05-03'), fin: iso('2025-05-04') });
  });

  it('sans année ni identifiant : année de la signature (« Fait à …, le … »)', () => {
    const texte = 'Fait à Nevers, le 4 septembre 2026\nentre le lundi 21 septembre et le lundi 21 décembre';
    expect(extraireIntervalleGenerique(texte)).toEqual({ debut: iso('2026-09-21'), fin: iso('2026-12-21') });
  });

  it('rejette un intervalle implausible (validité pluriannuelle) et les mentions sans date', () => {
    expect(extraireIntervalleGenerique('agrément valable du 14/12/2021 au 13/12/2026')).toBeNull();
    expect(extraireIntervalleGenerique('recours dans un délai de deux mois à compter de sa notification')).toBeNull();
    expect(extraireIntervalleGenerique('entre le lundi 21 septembre et le lundi 21 décembre')).toBeNull();
  });
});

describe('extraireChampsCibles — repli générique des dates', () => {
  it('complète les dates que patterns_dates (format JJ/MM/AAAA) ne trouve pas', () => {
    const texte =
      'Arrêté n° 2026-42 portant interdiction des rave-parties\nARRÊTE\nArticle 1 : interdit du vendredi 14 août 2026 à 17h au lundi 17 août 2026 inclus.';
    expect(extraireChampsCibles(texte, PATTERNS)).toEqual({
      reference_arrete: '2026-42',
      date_debut: iso('2026-08-14'),
      date_fin: iso('2026-08-17'),
      date_fin_ambigue: false,
    });
  });

  it('ne remplace jamais une date trouvée par la configuration', () => {
    const texte =
      "Arrêté n° 2026-42 portant interdiction des rave-parties à compter du 01/08/2026 jusqu'au 03/08/2026 (rappel : du 5 au 9 août 2026).";
    const champs = extraireChampsCibles(texte, PATTERNS);
    expect([champs.date_debut, champs.date_fin]).toEqual([iso('2026-08-01'), iso('2026-08-03')]);
  });

  it("recueil compilé : dates de l'acte anti-rave, année tirée de son identifiant", () => {
    const recueil = RECUEIL.replace(
      "à compter du 21/09/2026 jusqu'au 21/12/2026.",
      'ARRÊTE\nArticle 1er : interdit entre le lundi 21 septembre 00h00 et le lundi 21 décembre 24h00 inclus.',
    );
    expect(extraireChampsCibles(recueil, PATTERNS)).toEqual({
      reference_arrete: '99-2026-09-04-00002',
      date_debut: iso('2026-09-21'),
      date_fin: iso('2026-12-21'),
      date_fin_ambigue: false,
    });
  });
});
