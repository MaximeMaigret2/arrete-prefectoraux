/**
 * Extraction de champs communs (référence d'arrêté, dates) à partir d'un
 * texte brut (titre de publication ou texte PDF), partagée par les moteurs
 * `page_web` et `pdf` (contracts/connecteur-interface.md §2-3, research.md
 * §3-4). Ne dépend d'aucun moteur particulier — prend en entrée un texte
 * déjà récupéré et des patterns déclaratifs (`pattern_reference`,
 * `patterns_dates`) issus de la configuration du connecteur.
 *
 * Règle 2 du contrat (§5) : un champ indéterminable est retourné à `null`
 * explicitement, jamais en levant une exception — c'est au `runner` de
 * décider si ce `null` déclenche une anomalie (data-model.md, "Logique de
 * décision").
 */

const MOIS_FR: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

/** Retire les accents pour normaliser un nom de mois avant recherche dans MOIS_FR. */
function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Applique une regex (fournie sous forme de chaîne, issue d'une
 * configuration déclarative) à un texte et retourne le contenu du groupe
 * nommé demandé, ou `null` si la regex ne matche pas ou si le groupe est
 * vide. Une regex syntaxiquement invalide n'est PAS interceptée ici — elle
 * remonte comme une exception, traitée par le `runner` comme un
 * `echec_global` propre à ce connecteur (contrat §5, règle 6), signe d'une
 * configuration mal formée plutôt que d'une ambiguïté d'extraction.
 */
function extraireGroupeNomme(texte: string, pattern: string, nomGroupe: string): string | null {
  const regex = new RegExp(pattern, 'i');
  const match = regex.exec(texte);
  const brut = match?.groups?.[nomGroupe];
  if (!brut) return null;
  const valeur = brut.trim();
  return valeur.length > 0 ? valeur : null;
}

/**
 * Extrait la référence d'un arrêté depuis `texte` via `pattern` (regex
 * capturant un groupe nommé `reference`, ex.
 * `"Arrêté n°\\s*(?<reference>[A-Z0-9-]+)"` — contracts/connecteur-interface.md).
 * Retourne `null` si `pattern` ne matche pas — signal d'un champ manquant
 * pour le `runner` (FR-008).
 */
export function extraireReference(texte: string, pattern: string): string | null {
  return extraireGroupeNomme(texte, pattern, 'reference');
}

/**
 * Convertit une date française captée dans un texte source vers une date
 * ISO 8601 UTC (minuit). Reconnaît deux formats couramment rencontrés dans
 * les arrêtés préfectoraux :
 * - numérique : `JJ/MM/AAAA`, `JJ-MM-AAAA` ou `JJ.MM.AAAA` ;
 * - littéral : `JJ mois AAAA`, avec ou sans « er » après un 1er du mois
 *   (ex. `1er janvier 2026`, `12 août 2026`), insensible à la casse et aux
 *   accents.
 *
 * Retourne `null` si le format n'est reconnu par aucun des deux cas, ou si
 * la date obtenue n'est pas calendairement valide (ex. 31 avril) — dans
 * les deux cas, c'est une date ambiguë au sens de FR-008/data-model.md
 * (« formulation non résolvable en date ISO »), pas une erreur technique.
 */
export function parserDateFrancaise(brut: string): string | null {
  const valeur = brut.trim();

  const numerique = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(valeur);
  if (numerique) {
    const jour = Number(numerique[1]);
    const mois = Number(numerique[2]);
    const annee = Number(numerique[3]);
    return construireDateIso(annee, mois - 1, jour);
  }

  const litteral = /^(\d{1,2})(?:er)?\s+([a-zéèêûôîàâï]+)\s+(\d{4})$/i.exec(valeur);
  if (litteral) {
    const jour = Number(litteral[1]);
    const nomMois = sansAccents(litteral[2].toLowerCase());
    const annee = Number(litteral[3]);
    const mois = MOIS_FR[nomMois];
    if (mois === undefined) return null;
    return construireDateIso(annee, mois, jour);
  }

  return null;
}

/** Construit une date ISO UTC à partir de composantes, en rejetant tout débordement de calendrier (ex. 31 avril → 1er mai). */
function construireDateIso(annee: number, moisIndex: number, jour: number): string | null {
  const date = new Date(Date.UTC(annee, moisIndex, jour));
  const valide =
    date.getUTCFullYear() === annee && date.getUTCMonth() === moisIndex && date.getUTCDate() === jour;
  return valide ? date.toISOString() : null;
}

/**
 * Extrait puis convertit une date depuis `texte` via `pattern` (regex
 * capturant un groupe nommé `date`). `pattern` peut être `null` (ex.
 * `patterns_dates.fin` absent de la configuration — aucune tentative
 * d'extraction, pas un échec) auquel cas le résultat est directement
 * `null`, sans confondre ce cas avec une date présente mais illisible.
 */
export function extraireDate(texte: string, pattern: string | null): string | null {
  if (pattern === null) return null;
  const brut = extraireGroupeNomme(texte, pattern, 'date');
  if (brut === null) return null;
  return parserDateFrancaise(brut);
}

/** Résultat d'une extraction de date distinguant absence totale de mention et mention non résolvable (data-model.md, "Logique de décision", étape 3). */
export interface ExtractionDate {
  date: string | null;
  /** `true` si `pattern` a matché mais que la valeur captée n'a pas pu être résolue en date ISO. */
  ambigue: boolean;
}

/**
 * Variante de `extraireDate` qui conserve la distinction entre « aucune
 * mention » (`pattern` ne matche pas, ou `pattern` est `null`) et
 * « mention présente mais illisible » (`pattern` matche, mais
 * `parserDateFrancaise` ne parvient pas à la résoudre) — perdue par
 * `extraireDate` qui renvoie `null` dans les deux cas. Destinée aux
 * moteurs qui alimentent `CandidatEvenement.date_fin_ambigue`
 * (`connecteurs/types.ts`), seul signal permettant au `runner` de
 * distinguer une date de fin absente (légitime) d'une date de fin
 * ambiguë (anomalie `date_ambigue`, FR-008).
 */
export function extraireDateAvecAmbiguite(texte: string, pattern: string | null): ExtractionDate {
  if (pattern === null) return { date: null, ambigue: false };
  const brut = extraireGroupeNomme(texte, pattern, 'date');
  if (brut === null) return { date: null, ambigue: false };
  const date = parserDateFrancaise(brut);
  return { date, ambigue: date === null };
}

/** Sous-ensemble des champs d'un `CandidatEvenement` produit par l'extraction commune. */
export interface ChampsExtraitsCommuns {
  reference_arrete: string | null;
  date_debut: string | null;
  date_fin: string | null;
}

/**
 * Applique `pattern_reference` et `patterns_dates` (contracts/connecteur-interface.md
 * §2-3) à un texte pour produire les champs communs d'un candidat,
 * partagée telle quelle entre les moteurs `page_web` et `pdf` (research.md
 * §3-4) — ni l'un ni l'autre ne réimplémente cette logique.
 */
export function extraireChampsCommuns(
  texte: string,
  patterns: {
    patternReference: string;
    patternsDates: { debut: string; fin: string | null };
  },
): ChampsExtraitsCommuns {
  return {
    reference_arrete: extraireReference(texte, patterns.patternReference),
    date_debut: extraireDate(texte, patterns.patternsDates.debut),
    date_fin: extraireDate(texte, patterns.patternsDates.fin),
  };
}
