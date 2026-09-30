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

/**
 * Noms des mois français, capitalisés et sans accent (index 0 = janvier),
 * dans la casse/orthographe utilisée par les segments d'URL des sites
 * gouvernementaux observés (ex. `Aout-2026`, jamais `Août-2026`) — partagé
 * par tout moteur ayant besoin de construire une URL ou un motif de
 * correspondance dépendant du mois courant (ex. `navigation` du moteur
 * `page_web`, contracts/connecteur-interface.md §2). Dérivé de `MOIS_FR`
 * ci-dessus pour ne pas dupliquer la liste des mois.
 */
export const NOMS_MOIS_FR: readonly string[] = Object.keys(MOIS_FR)
  .sort((a, b) => MOIS_FR[a] - MOIS_FR[b])
  .map((nom) => nom.charAt(0).toUpperCase() + nom.slice(1));

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

/** Échappe les caractères spéciaux d'une chaîne pour un usage littéral dans une regex. */
function echapperPourRegex(chaine: string): string {
  return chaine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construit la regex de recherche d'un mot-clé de `mots_cles_filtrage`.
 *
 * - Limites de mot Unicode-aware (lookaround sur `\p{L}`/`\p{N}`, pas `\b`
 *   natif qui ignore les lettres accentuées) : "rave" ne matche plus
 *   "traversée", "contraventions", "entrave", "grave"… (correctif du
 *   2026-09-20, étendu au moteur `rss` le 2026-09-30).
 * - Pluriel toléré mot par mot (`s?`) : le mot-clé "rassemblement festif à
 *   caractère musical" matche aussi "rassemblements festifs à caractère
 *   musical", formulation réelle des arrêtés (ex. prefecture-23).
 * - Espaces entre mots du mot-clé → `\s+` : un retour à la ligne du texte
 *   PDF au milieu d'une expression ne la casse plus.
 */
function motifMotCle(motCle: string): RegExp {
  const mots = motCle.toLowerCase().trim().split(/\s+/).filter((mot) => mot.length > 0);
  const corps = mots
    .map((mot) => `${echapperPourRegex(mot)}${/\p{L}$/u.test(mot) ? 's?' : ''}`)
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${corps}(?![\\p{L}\\p{N}_])`, 'u');
}

/**
 * Filtrage par pertinence (contrat §2 étape 3, §4), partagé par les moteurs
 * `page_web` et `rss` — voir {@link motifMotCle} pour les règles de
 * correspondance. Les mots accolés en CamelCase, fréquents dans les
 * intitulés issus de noms de fichiers (ex. "APinterdiction-RaveParty-4-aout-26",
 * prefecture-23), sont séparés avant recherche ("Rave Party").
 */
export function estPertinent(texte: string, motsCles: readonly string[]): boolean {
  const normalise = texte.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').toLowerCase();
  return motsCles.some((motCle) => motifMotCle(motCle).test(normalise));
}

/**
 * Un acte d'un recueil des actes administratifs (RAA) compilé, repéré par
 * son identifiant normalisé (ex. `58-2026-09-04-00011`).
 */
export interface ActeRecueil {
  reference: string;
  /** Intitulé de l'acte tel qu'imprimé dans son pied de page. */
  intitule: string;
  texte: string;
}

/**
 * Pied de page d'un RAA compilé, répété sur chaque page de chaque acte par
 * l'outil de publication commun aux préfectures :
 * `<service> - <identifiant de l'acte> - <intitulé>` (ex. « Préfecture de la
 * Nièvre - 58-2026-09-04-00011 - 2026 09 04 Arrêté Rave Party »). Les lignes
 * du sommaire commencent directement par l'identifiant et ne matchent donc
 * pas (rien avant le premier " - ").
 */
const MOTIF_PIED_DE_PAGE_ACTE = /^(.+?) - (\d{2}[0-9AB]?-\d{4}-\d{2}-\d{2}-\d{3,5}) - (.+)$/gm;

/**
 * Découpe le texte d'un RAA compilé en actes, à partir des pieds de page
 * (cf. {@link MOTIF_PIED_DE_PAGE_ACTE}). Retourne `[]` si le texte n'a pas
 * cette structure (arrêté isolé, PDF d'un autre gabarit) — l'appelant
 * traite alors le texte comme un tout.
 *
 * Chaque acte s'étend de la fin du dernier pied de page de l'acte précédent
 * jusqu'à la fin de son propre dernier pied de page. Le premier acte
 * commence à sa page de garde (ligne réduite à son identifiant) quand elle
 * existe, afin d'exclure le sommaire du recueil — qui liste les intitulés
 * (et parfois les dates) de TOUS les actes.
 */
export function decouperRecueilEnActes(texte: string): ActeRecueil[] {
  const pieds = [...texte.matchAll(MOTIF_PIED_DE_PAGE_ACTE)].map((m) => ({
    reference: m[2],
    intitule: m[3].trim(),
    debut: m.index ?? 0,
    fin: (m.index ?? 0) + m[0].length,
  }));
  if (pieds.length < 2) return [];

  const groupes: { reference: string; intitule: string; debut: number; fin: number }[] = [];
  for (const pied of pieds) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.reference === pied.reference) {
      dernier.fin = pied.fin;
    } else {
      groupes.push({ ...pied });
    }
  }

  const premier = groupes[0];
  const pageDeGarde = new RegExp(`^${echapperPourRegex(premier.reference)}\\s*$`, 'gm');
  let debutPremier = 0;
  for (const m of texte.slice(0, premier.debut).matchAll(pageDeGarde)) {
    debutPremier = m.index ?? 0;
  }

  return groupes.map((groupe, i) => ({
    reference: groupe.reference,
    intitule: groupe.intitule,
    texte: texte.slice(i === 0 ? debutPremier : groupes[i - 1].fin, groupe.fin),
  }));
}

// ---------------------------------------------------------------------------
// Extraction GÉNÉRIQUE de la période d'interdiction (évolution du 2026-09-30)
// ---------------------------------------------------------------------------
//
// 93 des 96 configurations utilisent le même `patterns_dates` générique
// (`à compter du JJ/MM/AAAA` / `jusqu'au JJ/MM/AAAA`), jamais vérifié contre
// de vrais arrêtés — et qui ne correspond à presque aucun d'entre eux. Les
// formulations réellement observées (docs d'intégration du projet) sont :
//
// - « du vendredi 14 août 2026 à 17h au lundi 17 août 2026 inclus » (23) ;
// - « du vendredi 6 février 2026 à partir de 18 h jusqu'au lundi 9 février
//   2026 à 20 h inclus » (03) ;
// - « applicables du vendredi 24 avril 2026 à 18h00 au lundi 27 avril 2026
//   à 8h00 » / « pendant la période du vendredi 29 mars 2024, 18 h00 au
//   mardi 2 avril 2024, 8 h00 » (14) ;
// - « entre le lundi 21 septembre 00h00 et le lundi 21 décembre 24h00
//   inclus » — SANS année (58) ;
// - « du 1er juillet au 6 septembre 2026 inclus » — année portée par la
//   seule date de fin (21) ;
// - « à compter du 01/09/2026 jusqu'au 30/09/2026 » (format historique).
//
// `extraireIntervalleGenerique` sert de REPLI commun à tous les connecteurs
// quand leur `patterns_dates` ne trouve rien : il ne remplace jamais une
// date trouvée par la configuration.

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const RE_JOUR_SEMAINE = `(?:${JOURS_SEMAINE.join('|')})`;
const RE_MOIS = '(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)';
/** Une date isolée : littérale (jour de semaine, « 1er » et année facultatifs) ou numérique complète. */
const RE_DATE = `(?:${RE_JOUR_SEMAINE}\\s+)?(?:\\d{1,2}\\s*(?:er|ᵉʳ)?\\s+${RE_MOIS}(?:\\s+\\d{4})?|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})`;
/** Un horaire facultatif après une date (« à 17h », « , 18 h00 », « à partir de 18 h », « 00h00 »), ignoré. */
const RE_HEURE = `(?:\\s*,?\\s*(?:à partir de|a partir de|à|a|dès|des)?\\s*\\d{1,2}\\s*h\\s*(?:\\d{2})?)?`;
const RE_JUSQU_AU = `jusqu['’]?\\s*au`;
/** Début de mot Unicode-aware (`\\b` natif ignore les lettres accentuées : il échouerait devant « à »). */
const RE_DEBUT_MOT = '(?<![\\p{L}\\p{N}_])';

type FormeIntervalle = 'debut_fin' | 'debut' | 'fin';
const FORMES_INTERVALLE: { forme: FormeIntervalle; motif: RegExp }[] = [
  { forme: 'debut_fin', motif: new RegExp(`${RE_DEBUT_MOT}du\\s+(${RE_DATE})${RE_HEURE}\\s*,?\\s*(?:${RE_JUSQU_AU}|au|à)\\s+(${RE_DATE})`, 'giu') },
  { forme: 'debut_fin', motif: new RegExp(`${RE_DEBUT_MOT}entre\\s+le\\s+(${RE_DATE})${RE_HEURE}\\s*,?\\s*et\\s+le\\s+(${RE_DATE})`, 'giu') },
  { forme: 'debut_fin', motif: new RegExp(`${RE_DEBUT_MOT}à\\s+(?:compter|partir)\\s+du\\s+(${RE_DATE})${RE_HEURE}\\s*,?\\s*(?:et\\s+)?${RE_JUSQU_AU}\\s+(${RE_DATE})`, 'giu') },
  { forme: 'debut', motif: new RegExp(`${RE_DEBUT_MOT}à\\s+(?:compter|partir)\\s+du\\s+(${RE_DATE})`, 'giu') },
  { forme: 'fin', motif: new RegExp(`${RE_DEBUT_MOT}${RE_JUSQU_AU}\\s+(${RE_DATE})`, 'giu') },
];

/** Début du dispositif d'un arrêté (ligne « ARRÊTE : », « Arrête », « A R R Ê T E »). */
const RE_DISPOSITIF = /^\s*a\s*r\s*r\s*[êe]\s*t\s*e\s*:?\s*$/imu;

/** Durée maximale plausible d'une interdiction : au-delà, l'intervalle capté est rejeté (ex. une validité d'agrément de 5 ans). */
const DUREE_MAX_JOURS = 400;

interface DateAnnoncee {
  jour: number;
  mois: number;
  annee: number | null;
  jourSemaine: number | null;
}

/** Décompose une date captée par `RE_DATE` (année éventuellement absente). */
function decomposerDate(brut: string): DateAnnoncee | null {
  const valeur = sansAccents(brut.toLowerCase()).replace(/\s+/g, ' ').trim();
  const numerique = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(valeur);
  if (numerique) {
    return { jour: Number(numerique[1]), mois: Number(numerique[2]) - 1, annee: Number(numerique[3]), jourSemaine: null };
  }
  const litteral = /^(?:([a-z]+)\s+)?(\d{1,2})\s*(?:er|ᵉʳ)?\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(valeur);
  if (!litteral) return null;
  const mois = MOIS_FR[litteral[3]];
  if (mois === undefined) return null;
  const jourSemaine = litteral[1] ? JOURS_SEMAINE.indexOf(litteral[1]) : -1;
  return {
    jour: Number(litteral[2]),
    mois,
    annee: litteral[4] ? Number(litteral[4]) : null,
    jourSemaine: jourSemaine >= 0 ? jourSemaine : null,
  };
}

function versDate(d: DateAnnoncee, annee: number): Date | null {
  const date = new Date(Date.UTC(annee, d.mois, d.jour));
  return date.getUTCMonth() === d.mois && date.getUTCDate() === d.jour ? date : null;
}

/** Année la plus plausible pour une date sans année : celle qui respecte le jour de semaine annoncé, autour de `anneeReference`. */
function choisirAnnee(d: DateAnnoncee, anneeReference: number): number {
  if (d.jourSemaine === null) return anneeReference;
  for (const annee of [anneeReference, anneeReference + 1, anneeReference - 1]) {
    if (versDate(d, annee)?.getUTCDay() === d.jourSemaine) return annee;
  }
  return anneeReference;
}

/**
 * Résout un intervalle (bornes éventuellement sans année) en dates ISO.
 * L'année manquante d'une borne est reprise de l'autre (en franchissant le
 * 31 décembre si nécessaire), sinon de `anneeReference`. Retourne `null`
 * pour un intervalle incohérent (fin avant début, durée implausible).
 */
function resoudreIntervalle(
  debut: DateAnnoncee | null,
  fin: DateAnnoncee | null,
  anneeReference: number | null,
): { debut: string | null; fin: string | null } | null {
  let anneeDebut = debut?.annee ?? null;
  let anneeFin = fin?.annee ?? null;
  const avant = (a: DateAnnoncee, b: DateAnnoncee) => a.mois < b.mois || (a.mois === b.mois && a.jour < b.jour);

  if (debut && fin) {
    if (anneeDebut === null && anneeFin !== null) anneeDebut = avant(fin, debut) ? anneeFin - 1 : anneeFin;
    if (anneeFin === null && anneeDebut !== null) anneeFin = avant(fin, debut) ? anneeDebut + 1 : anneeDebut;
    if (anneeDebut === null && anneeReference !== null) {
      anneeDebut = choisirAnnee(debut, anneeReference);
      anneeFin = avant(fin, debut) ? anneeDebut + 1 : anneeDebut;
    }
  } else if (debut && anneeDebut === null && anneeReference !== null) {
    anneeDebut = choisirAnnee(debut, anneeReference);
  } else if (fin && anneeFin === null && anneeReference !== null) {
    anneeFin = choisirAnnee(fin, anneeReference);
  }

  const dateDebut = debut && anneeDebut !== null ? versDate(debut, anneeDebut) : null;
  const dateFin = fin && anneeFin !== null ? versDate(fin, anneeFin) : null;
  if ((debut && !dateDebut) || (fin && !dateFin)) return null;
  if (dateDebut && dateFin) {
    const jours = (dateFin.getTime() - dateDebut.getTime()) / 86_400_000;
    if (jours < 0 || jours > DUREE_MAX_JOURS) return null;
  }
  return { debut: dateDebut?.toISOString() ?? null, fin: dateFin?.toISOString() ?? null };
}

/** Année de référence d'un acte : son identifiant normalisé (`58-2026-09-04-00011`), sinon la date de signature (« Fait à …, le 4 septembre 2026 »). */
function anneeDeReference(texte: string, referenceActe: string | null): number | null {
  const depuisReference = referenceActe ? /^\d{2}[0-9AB]?-(\d{4})-/.exec(referenceActe) : null;
  if (depuisReference) return Number(depuisReference[1]);
  const signature = /\bfait\s+à\s+[^,\n]{1,60},?\s+le\s+(?:\d{1,2}\s*(?:er)?\s+\S+\s+|\d{1,2}[/.-]\d{1,2}[/.-])(\d{4})/iu.exec(texte);
  return signature ? Number(signature[1]) : null;
}

/**
 * Repli générique : cherche dans `texte` la période d'interdiction sous
 * l'une des formulations réelles connues (cf. en-tête de section) et la
 * convertit en dates ISO (minuit UTC, comme `parserDateFrancaise` — les
 * horaires sont ignorés).
 *
 * Choix parmi plusieurs correspondances (considérants citant des
 * rassemblements passés, dispositif, voies de recours…) : d'abord les
 * intervalles complets situés APRÈS la ligne « ARRÊTE » (le dispositif),
 * puis n'importe où ; ensuite seulement une borne isolée (« à compter
 * du … », « jusqu'au … »), selon le même ordre. Retourne `null` si rien
 * de cohérent n'est trouvé.
 */
export function extraireIntervalleGenerique(
  texte: string,
  referenceActe: string | null = null,
): { debut: string | null; fin: string | null } | null {
  const normalise = texte.normalize('NFC').replace(/\s+/g, ' ');
  const dispositif = RE_DISPOSITIF.exec(texte.normalize('NFC'));
  // Position du dispositif ramenée dans le texte normalisé (espaces compactés).
  const debutDispositif = dispositif ? texte.normalize('NFC').slice(0, dispositif.index).replace(/\s+/g, ' ').length : 0;
  const anneeReference = anneeDeReference(normalise, referenceActe);

  const candidats: { rang: number; position: number; resultat: { debut: string | null; fin: string | null } }[] = [];
  for (const { forme, motif } of FORMES_INTERVALLE) {
    for (const m of normalise.matchAll(motif)) {
      const position = m.index ?? 0;
      const debut = forme === 'fin' ? null : decomposerDate(m[1]);
      const fin = forme === 'debut' ? null : decomposerDate(forme === 'fin' ? m[1] : m[2]);
      if ((forme !== 'fin' && !debut) || (forme !== 'debut' && !fin)) continue;
      const resultat = resoudreIntervalle(debut, fin, anneeReference);
      if (!resultat) continue;
      const dansDispositif = position >= debutDispositif;
      const rang = (forme === 'debut_fin' ? 0 : 2) + (dansDispositif ? 0 : 1);
      candidats.push({ rang, position, resultat });
    }
  }
  candidats.sort((a, b) => a.rang - b.rang || a.position - b.position);
  return candidats[0]?.resultat ?? null;
}

/**
 * Complète des dates extraites par la configuration avec le repli
 * générique : une date trouvée par `patterns_dates` n'est jamais remplacée ;
 * la date de fin générique n'est reprise que si la date de début générique
 * coïncide avec celle de la configuration (même intervalle).
 */
function completerDates(
  champs: ChampsExtraitsCommuns,
  passage: string,
  referenceActe: string | null,
): ChampsExtraitsCommuns {
  if (champs.date_debut && champs.date_fin) return champs;
  const generique = extraireIntervalleGenerique(passage, referenceActe);
  if (!generique) return champs;
  if (!champs.date_debut) {
    return { ...champs, date_debut: generique.debut, date_fin: champs.date_fin ?? generique.fin };
  }
  return generique.debut === champs.date_debut ? { ...champs, date_fin: generique.fin } : champs;
}

/** Champs communs + signal de date de fin ambiguë, extraits d'un même passage du texte. */
export interface ChampsExtraitsCibles extends ChampsExtraitsCommuns {
  date_fin_ambigue: boolean;
}

/**
 * Extraction des champs communs CIBLÉE sur l'acte pertinent (correctif du
 * 2026-09-30).
 *
 * Problème corrigé : sur un RAA compilé (des dizaines d'actes sans rapport
 * dans un même PDF), `pattern_reference`/`patterns_dates` étaient appliqués
 * au texte ENTIER et renvoyaient la première correspondance du recueil —
 * souvent celle d'un tout autre acte (ex. prefecture-29 : l'agrément d'un
 * service à domicile « à compter du 21/10/2026 » ; prefecture-58 : la
 * référence « portant » et la date d'une convention France Services, alors
 * que le vrai arrêté anti-rave du même recueil était scanné).
 *
 * Règles :
 * 1. Sans `motsCles`, ou si le texte n'a pas la structure d'un RAA compilé
 *    ({@link decouperRecueilEnActes} → `[]`), extraction sur le texte entier
 *    (comportement historique, arrêté isolé).
 * 2. Sinon, seuls les actes contenant un mot-clé ({@link estPertinent})
 *    sont examinés, chacun isolément. Si aucun ne l'est (mot-clé présent
 *    seulement dans le sommaire, ou pertinence décidée sur le seul titre de
 *    la publication), tous les champs restent `null` : le `runner` en fera
 *    une anomalie à revoir plutôt qu'un événement fabriqué.
 * 3. Parmi les actes pertinents, on retient celui qui fournit le plus de
 *    champs (date de début d'abord, puis référence via `pattern_reference`) ;
 *    à égalité, celui dont l'INTITULÉ contient un mot-clé (l'arrêté
 *    anti-rave lui-même plutôt qu'un acte connexe qui le cite, ex. une
 *    interdiction de circulation des poids lourds — prefecture-23), puis le
 *    premier dans l'ordre du document.
 * 4. Si `pattern_reference` ne trouve rien dans l'acte retenu, l'identifiant
 *    normalisé de l'acte (pied de page) sert de référence.
 * 5. Si `patterns_dates` ne trouve pas les dates, le repli générique
 *    {@link extraireIntervalleGenerique} est tenté sur le même passage
 *    (évolution du 2026-09-30).
 */
export function extraireChampsCibles(
  texte: string,
  patterns: {
    patternReference: string;
    patternsDates: { debut: string; fin: string | null };
    motsCles?: readonly string[];
  },
): ChampsExtraitsCibles {
  const extraireSur = (passage: string, referenceActe: string | null = null) => ({
    champs: completerDates(extraireChampsCommuns(passage, patterns), passage, referenceActe),
    fin: extraireDateAvecAmbiguite(passage, patterns.patternsDates.fin),
  });

  const motsCles = patterns.motsCles ?? [];
  const actes = motsCles.length > 0 ? decouperRecueilEnActes(texte) : [];

  if (actes.length === 0) {
    const { champs, fin } = extraireSur(texte);
    // Une date de fin illisible pour `patterns_dates` mais résolue par le
    // repli générique n'est plus ambiguë.
    return { ...champs, date_fin_ambigue: fin.ambigue && champs.date_fin === null };
  }

  let meilleur: { score: number; resultat: ChampsExtraitsCibles } | null = null;
  for (const acte of actes) {
    if (!estPertinent(acte.texte, motsCles)) continue;
    const { champs, fin } = extraireSur(acte.texte, acte.reference);
    const score =
      (champs.date_debut ? 4 : 0) + (champs.reference_arrete ? 2 : 0) + (estPertinent(acte.intitule, motsCles) ? 1 : 0);
    if (!meilleur || score > meilleur.score) {
      meilleur = {
        score,
        resultat: {
          ...champs,
          reference_arrete: champs.reference_arrete ?? acte.reference,
          date_fin_ambigue: fin.ambigue && champs.date_fin === null,
        },
      };
    }
  }

  return meilleur?.resultat ?? { reference_arrete: null, date_debut: null, date_fin: null, date_fin_ambigue: false };
}
