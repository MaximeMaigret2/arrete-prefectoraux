import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EntreeRegistreSchema } from '../../../src/models/index.js';

function makeEntree(overrides: Partial<z.input<typeof EntreeRegistreSchema>> = {}) {
  return {
    departement_code: '77',
    statut: 'connecteur_developpe' as const,
    autorite: 'Préfecture de Seine-et-Marne',
    point_acces: 'https://www.seine-et-marne.gouv.fr/Publications/RAA',
    format_attendu: 'page_web' as const,
    connecteur_id: 'prefecture-77',
    notes: null,
    derniere_verification: '2026-08-01',
    ...overrides,
  };
}

describe('EntreeRegistreSchema — cas valides', () => {
  it('accepte une entrée connecteur_developpe complète', () => {
    expect(EntreeRegistreSchema.safeParse(makeEntree()).success).toBe(true);
  });

  it('accepte une entrée a_investiguer avec autorite/point_acces/connecteur_id à null', () => {
    const entree = makeEntree({
      statut: 'a_investiguer',
      autorite: null,
      point_acces: null,
      format_attendu: 'inconnu',
      connecteur_id: null,
      derniere_verification: null,
    });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(true);
  });

  it('accepte une entrée identifiee sans connecteur_id (source connue, connecteur pas encore développé)', () => {
    const entree = makeEntree({ statut: 'identifiee', connecteur_id: null });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(true);
  });
});

describe('EntreeRegistreSchema — combinaisons incohérentes rejetées', () => {
  it('rejette statut != a_investiguer sans autorite', () => {
    const entree = makeEntree({ statut: 'identifiee', autorite: null });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette statut != a_investiguer sans point_acces', () => {
    const entree = makeEntree({ statut: 'identifiee', point_acces: null });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette statut = a_investiguer avec une autorite renseignée', () => {
    const entree = makeEntree({
      statut: 'a_investiguer',
      autorite: 'Préfecture de test',
      point_acces: null,
      connecteur_id: null,
    });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette statut = a_investiguer avec un point_acces renseigné', () => {
    const entree = makeEntree({
      statut: 'a_investiguer',
      autorite: null,
      point_acces: 'https://example.org',
      connecteur_id: null,
    });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette statut = connecteur_developpe sans connecteur_id', () => {
    const entree = makeEntree({ connecteur_id: null });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });
});

describe('EntreeRegistreSchema — validation des champs', () => {
  it('rejette un point_acces qui n\'est pas une URL valide', () => {
    const entree = makeEntree({ point_acces: 'pas-une-url' });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette un departement_code trop court', () => {
    const entree = makeEntree({ departement_code: '7' });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('accepte un departement_code corse à 2 lettres (2A/2B)', () => {
    const entree = makeEntree({ departement_code: '2A' });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(true);
  });

  it('rejette un statut inconnu', () => {
    const entree = { ...makeEntree(), statut: 'en_cours' };
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette un format_attendu inconnu', () => {
    const entree = { ...makeEntree(), format_attendu: 'fax' };
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });

  it('rejette une derniere_verification qui n\'est pas une date ISO', () => {
    const entree = makeEntree({ derniere_verification: '01/08/2026' });
    expect(EntreeRegistreSchema.safeParse(entree).success).toBe(false);
  });
});
