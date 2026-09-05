import { z } from 'zod';

/**
 * Une période nommée au sein d'une étape de navigation par période (V009,
 * Phase 5bis élargie, 2026-08-14, cf. `EtapeNavigationSchema` ci-dessous) :
 * `motif` (mêmes placeholders/règles qu'un `pattern_lien` simple) est
 * utilisé pour cette étape uniquement quand le mois courant (Europe/Paris)
 * tombe dans `[mois_debut, mois_fin]` (inclusif ; wraparound autorisé si
 * `mois_debut > mois_fin`, ex. une période novembre→février).
 */
const EtapePeriodeSchema = z.object({
  motif: z.string().min(1),
  mois_debut: z.number().int().min(1).max(12),
  mois_fin: z.number().int().min(1).max(12),
});

/**
 * Une étape de navigation pré-liste (V001/V001c, Phase 5bis) : depuis la
 * page courante, trouve le premier lien via `selecteur_liens` dont l'URL
 * résolue correspond au motif de cette étape, et en fait la page courante
 * de l'étape suivante. Sert à résoudre dynamiquement un `url_liste` que le
 * site ne publie pas à une adresse fixe (ex. Gironde : racine → carte de
 * l'année courante → carte du mois courant).
 *
 * Le motif est testé contre l'URL résolue (jamais le texte du lien, sujet
 * aux accents/variations d'affichage) et peut contenir les placeholders
 * `{annee}` (AAAA), `{mois_numero}` (MM) et `{mois_fr}` / `{mois_fr_minuscule}`
 * (nom du mois français sans accent, capitalisé ou non — ex. `Aout`),
 * substitués à l'exécution avec la date courante (Europe/Paris) — jamais une
 * année/un mois codé en dur dans la configuration (contrat §5, règle 8 :
 * uniquement des données déclaratives). Deux formes mutuellement exclusives
 * pour désigner ce motif (cf. `superRefine` ci-dessous) :
 * - `pattern_lien` (forme historique) : un motif unique, valide pour toute
 *   date d'exécution — suffisant dès que le nom/numéro du mois courant
 *   apparaît toujours dans l'URL de la page à atteindre (ex. `/Aout-2026`).
 * - `periodes` (V009, Phase 5bis élargie, 2026-08-14, découvert sur
 *   prefecture-04/Alpes-de-Haute-Provence) : une liste de motifs
 *   alternatifs, chacun associé à une plage de mois — nécessaire quand la
 *   source archive par période irrégulière (ex. semestre inégal
 *   janvier-à-juillet / août-à-décembre) plutôt que par mois calendaire,
 *   auquel cas le nom du mois courant n'apparaît pas forcément dans l'URL
 *   de la période qui le contient (`{mois_fr}` seul ne suffit plus).
 *
 * `optionnelle` (V010, Phase 5bis élargie, 2026-08-14, découvert sur
 * prefecture-02/05) : par défaut (`false`), une étape dont aucun lien ne
 * correspond au motif est un échec de résolution (dérive de structure,
 * cf. `resoudreNavigation`). Mettre `optionnelle: true` quand l'ABSENCE de
 * lien correspondant a une signification légitime — ex. un lien de
 * pagination « dernière page » qui n'existe tout simplement pas quand tout
 * tient déjà sur la page courante (mois/année avec peu de publications,
 * notamment en tout début de période) : l'étape est alors sautée (la page
 * courante devient directement la page suivante) plutôt que de produire un
 * `echec_global` pour une situation parfaitement normale.
 *
 * `attribut_lien` (V011, Phase 5bis élargie 4, 2026-08-14, découvert sur
 * prefecture-17/Charente-Maritime) : attribut de l'élément trouvé via
 * `selecteur_liens` qui porte l'URL à suivre — `href` par défaut (forme
 * historique, un `<a>`). Certaines sources n'exposent le lien suivant que
 * comme la `value` d'un `<option>` de `<select>` DÈS la première étape de
 * navigation (ex. un sélecteur d'année en racine, sans aucun `<a>`
 * équivalent ailleurs dans la page) — jusqu'ici cette situation n'était
 * rencontrée que pour la résolution du PDF depuis une page de détail
 * (`page_detail.attribut_lien`, ci-dessous). Même idiome, même défaut,
 * réutilisé ici pour la cohérence du schéma plutôt que d'introduire un
 * concept différent.
 */
const EtapeNavigationSchema = z
  .object({
    selecteur_liens: z.string().min(1),
    pattern_lien: z.string().min(1).optional(),
    periodes: z.array(EtapePeriodeSchema).min(1).optional(),
    optionnelle: z.boolean().default(false),
    attribut_lien: z.string().min(1).default('href'),
  })
  .superRefine((etape, ctx) => {
    const nbFormes = Number(etape.pattern_lien !== undefined) + Number(etape.periodes !== undefined);
    if (nbFormes !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Une étape de navigation doit définir exactement une forme de motif : pattern_lien OU periodes, jamais les deux ni aucune des deux.',
      });
    }
  });

/**
 * Résolution d'une page de détail intermédiaire, par publication, avant
 * d'y chercher le lien PDF réel (V001/V001c, Phase 5bis — ex.
 * Seine-et-Marne : chaque `<option>` d'une liste déroulante ne pointe pas
 * directement vers un PDF mais vers une page HTML qui, elle, contient le
 * lien PDF). `attribut_lien` est l'attribut de l'élément publication
 * (trouvé via `selecteur_publications`) qui porte l'URL de cette page de
 * détail — `href` pour un `<a>`, `value` pour un `<option>` de
 * `<select>` (dont l'attribut n'est pas nommé `href`).
 *
 * Quand `page_detail` est renseigné, `selecteur_lien_pdf` est appliqué à
 * la page de détail récupérée plutôt qu'à l'intérieur de l'élément
 * publication lui-même — c'est pourquoi `selecteur_lien_pdf` DOIT alors
 * être non nul (cf. `superRefine` ci-dessous).
 */
const PageDetailSchema = z.object({
  attribut_lien: z.string().min(1).default('href'),
});

/**
 * Amorçage de session (V0xx, 2026-08-27, découvert sur prefecture-57/Moselle,
 * `mc.moselle.gouv.fr`, CMS legacy « DIMS ») : certains sites conditionnent
 * le contenu réellement retourné par une URL à un cookie de session PHP
 * obtenu lors d'une requête préalable — un `fetch()` direct et sans état sur
 * `url_liste` (ou toute étape de `navigation`) échoue silencieusement (la
 * requête aboutit, HTTP 200, mais redirige côté serveur vers une page par
 * défaut sans rapport avec celle demandée, faute de session). Quand
 * renseigné, le moteur effectue une requête GET préalable vers
 * `url_amorcage`, capture les cookies de session retournés (`Set-Cookie`),
 * et les réinjecte (en-tête `Cookie`) sur toutes les requêtes HTTP restantes
 * de CETTE collecte (résolution de `navigation`, page liste, page de
 * détail) — jamais partagé entre connecteurs ni entre exécutions (contrat
 * §5, règle 7 : aucun état de session persisté au-delà d'une collecte).
 * `null` par défaut, sans impact sur les connecteurs `page_web` existants
 * (tous stateless).
 */
const SessionCookieSchema = z.object({
  url_amorcage: z.string().url(),
});

/**
 * Résolution du libellé/objet réel d'une publication depuis un élément
 * FRÈRE suivant plutôt que depuis un descendant de l'élément publication
 * lui-même (V0xx, 2026-08-27, prefecture-57/Moselle) : certains CMS legacy
 * (DIMS) affichent le résumé de l'acte dans une ligne de détail masquée
 * (`display:none`), SŒUR de la ligne visible portant la référence/le PDF,
 * plutôt que son enfant — hors de portée de `selecteur_titre`/`$publication.find()`
 * (recherche uniquement descendante, cf. `moteur.ts`). Le libellé trouvé
 * COMPLÈTE (par concaténation) plutôt que ne remplace `selecteur_titre` : la
 * référence de l'acte, seule information portée par l'élément publication
 * lui-même sur ce type de site, reste nécessaire à `pattern_reference`.
 *
 * `selecteur_conteneur` cible l'élément frère porteur du libellé parmi TOUS
 * les frères suivants de la publication (recherche non bornée à l'élément
 * immédiatement suivant : robuste à du balisage frère intercalaire, ex. une
 * balise `<tr>` vide malformée, déjà rencontrée sur prefecture-57). Une fois
 * ce conteneur trouvé, `etiquette_libelle` est le texte exact (hors « : »
 * final) de la cellule-étiquette qui précède, dans une paire libellé/valeur
 * en tableau, la cellule dont le texte est recherché (ex. « Libellé »).
 * Générique par construction : ne dépend d'aucune structure propre à un
 * connecteur particulier, seulement du motif « paire étiquette/valeur au
 * sein d'un conteneur frère », commun à ce type de CMS.
 */
const TitreFrereSchema = z.object({
  selecteur_conteneur: z.string().min(1),
  etiquette_libelle: z.string().min(1),
});

/**
 * Configuration déclarative d'un connecteur `page_web` (contracts/connecteur-interface.md
 * §2). Aucune valeur codée en dur : toute variation entre deux connecteurs
 * `page_web` passe exclusivement par ce schéma (contrat §5, règle 7).
 *
 * `type_evenement_par_defaut` : même extension et même justification que
 * pour `PdfConfigSchema` (voir son commentaire) — sans valeur fixe par
 * connecteur, `CandidatEvenement.type_evenement` resterait toujours `null`,
 * ce qui déclencherait systématiquement une anomalie `champ_manquant` même
 * pour une extraction propre, contredisant FR-007/US3.
 *
 * `navigation`/`page_detail` (V001c, Phase 5bis, 2026-08-13) : extension
 * générique pour les sources nécessitant une navigation multi-niveaux
 * avant d'atteindre la liste de publications elle-même, ou une page de
 * détail par publication avant d'atteindre le PDF — toutes deux optionnelles
 * et vides par défaut, sans impact sur les connecteurs `page_web` existants
 * à liste plate (ex. prefecture-13). La forme `periodes` d'une étape de
 * `navigation` (V009, Phase 5bis élargie, 2026-08-14) est elle aussi
 * optionnelle (alternative à `pattern_lien`, jamais utilisée par défaut) —
 * aucun impact sur les connecteurs existants qui n'en ont pas besoin.
 *
 * `granularite_liste` (feature 005, backfill historique, 2026-09-04) :
 * certaines sources (ex. prefecture-08/-10, cf. `registre-sources.yaml`)
 * publient une liste DÉJÀ annuelle — la `navigation` s'arrête au niveau de
 * l'année, sans étape dépendant du mois cible (`{mois_numero}`/`{mois_fr}`/
 * `periodes`). Pour ces connecteurs, une collecte visant n'importe quel mois
 * d'une année donnée récupère systématiquement la MÊME page — le mois cible
 * n'a aucune influence sur l'URL résolue. `granularite_liste: 'annuelle'`
 * le signale explicitement : le moteur (`moteur.ts`) marque alors le
 * résultat comme couvrant l'année entière (`ResultatCollecte.anneesCouvertes`),
 * ce que `backfill-historique.ts` utilise pour considérer TOUS les mois
 * cibles restants de cette même année comme traités par ce seul succès,
 * sans jamais raffraîchir cette même page une fois par mois cible (charge
 * inutile sur un hébergeur déjà fragile, cf. `etat-connecteurs.md`).
 * Purement déclaratif (contrat §5, règle 7) : aucune branche par connecteur
 * dans le moteur, seulement une lecture de ce champ de configuration.
 * Défaut `'mensuelle'` : comportement rigoureusement inchangé pour tout
 * connecteur qui ne déclare pas ce champ. Volontairement absent pour les
 * connecteurs dont la liste ne dépend d'AUCUN placeholder de date, y
 * compris `{annee}` (ex. prefecture-13/-57 : liste réellement invariante,
 * pas seulement annuelle — la portée exacte de ce qu'une telle page couvre
 * dans le temps n'a jamais été vérifiée en profondeur, donc jamais
 * présumée automatiquement ici) — laissés en 'mensuelle' par prudence.
 */
export const PageWebConfigSchema = z
  .object({
    url_liste: z.string().url(),
    // Sélecteur CSS listant chaque publication (ligne/lien).
    selecteur_publications: z.string().min(1),
    // Sélecteur CSS du libellé/titre de la publication.
    selecteur_titre: z.string().min(1),
    // Sélecteur CSS du lien PDF joint ; `null` si le titre seul suffit à l'extraction.
    // Interprété relativement à l'élément publication lui-même, sauf si
    // `page_detail` est renseigné (auquel cas il est appliqué à la page de
    // détail résolue pour cette publication).
    selecteur_lien_pdf: z.string().min(1).nullable(),
    autorite_signataire: z.string().min(1),
    type_evenement_par_defaut: z.enum(['interdiction', 'levee', 'prolongation']),
    // Filtrage par pertinence (rave/teknival), insensible à la casse.
    mots_cles_filtrage: z.array(z.string().min(1)).min(1),
    patterns_dates: z.object({
      debut: z.string().min(1),
      fin: z.string().min(1).nullable(),
    }),
    pattern_reference: z.string().min(1),
    // Navigation pré-liste optionnelle (défaut : aucune, url_liste utilisée telle quelle).
    navigation: z.array(EtapeNavigationSchema).default([]),
    // Page de détail par publication optionnelle (défaut : aucune, selecteur_lien_pdf cherché dans la publication elle-même).
    page_detail: PageDetailSchema.nullable().default(null),
    // Amorçage de session optionnel (défaut : aucun, connecteur stateless comme tous les existants).
    session_cookie: SessionCookieSchema.nullable().default(null),
    // Libellé via élément frère optionnel (défaut : aucun, selecteur_titre seul comme tous les connecteurs existants).
    titre_frere: TitreFrereSchema.nullable().default(null),
    // Granularité de la liste de publications résolue par `navigation` (feature 005, backfill — cf. commentaire ci-dessous). Défaut 'mensuelle' : inchangé pour tout connecteur existant.
    granularite_liste: z.enum(['mensuelle', 'annuelle']).default('mensuelle'),
  })
  .superRefine((config, ctx) => {
    if (config.page_detail !== null && config.selecteur_lien_pdf === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selecteur_lien_pdf'],
        message: 'selecteur_lien_pdf est obligatoire quand page_detail est renseigné (il est appliqué à la page de détail).',
      });
    }
  });

export type PageWebConfig = z.infer<typeof PageWebConfigSchema>;
