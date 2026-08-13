import { describe, expect, it } from 'vitest';
import {
  extraireChampsCommuns,
  extraireDate,
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
