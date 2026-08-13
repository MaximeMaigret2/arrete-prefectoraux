# Registre des sources Checklist: Connecteurs de collecte automatique des arrêtés préfectoraux

**Purpose**: Valider la qualité des exigences portant sur le registre des sources par département (US1, FR-017, FR-018, SC-007) — un préalable au développement de tout connecteur, distinct de l'automatisation elle-même.
**Created**: 2026-08-12
**Feature**: [spec.md](../spec.md)
**Depth**: Standard
**Audience**: Auteur (auto-revue avant `/speckit-plan` déjà réalisé — revue complémentaire ciblée sur US1)

**Note**: Ce fichier est généré par `/speckit-checklist`. Chaque item teste la qualité d'une exigence (complétude, clarté, cohérence, mesurabilité, couverture) — pas le comportement du système une fois implémenté.

## Complétude des exigences

- [ ] CHK001 Est-il précisé ce qui distingue explicitement "aucune source identifiée" (`statut = a_investiguer`) d'une simple absence d'entrée dans le registre ? [Completeness, Spec §FR-017]
- [ ] CHK002 Les règles de transition entre les statuts `a_investiguer`, `identifiee` et `connecteur_developpe` sont-elles documentées (déclencheur, ordre autorisé, retour arrière possible ou non) ? [Gap]
- [ ] CHK003 Est-il spécifié qui est responsable de la mise à jour du registre et à quelle fréquence une entrée doit être revue ? [Gap]
- [ ] CHK004 Le format exact attendu pour `point_acces` (URL absolue, règles de validation de forme) est-il précisé au-delà du type "string (URL)" ? [Completeness, Spec §data-model Entrée du registre]
- [ ] CHK005 Une exigence couvre-t-elle la notion de fraîcheur du champ `derniere_verification` (à partir de quand une entrée est-elle considérée périmée et à revérifier) ? [Gap]
- [ ] CHK006 Le comportement attendu est-il défini si la liste de référence des départements elle-même change (fusion, création, département disparu) ? [Gap, Edge Case]

## Clarté des exigences

- [ ] CHK007 Le critère "reste cohérente avec la source réellement utilisée" (US1, scénario d'acceptation 3) est-il précisé par un critère vérifiable, plutôt que laissé à l'appréciation de l'opérateur ? [Clarity, Spec §US1 Acceptance Scenario 3]
- [ ] CHK008 La distinction entre `format_attendu = autre` et `format_attendu = inconnu` est-elle assez claire pour être appliquée de façon homogène par différents opérateurs ? [Clarity, Spec §data-model]
- [ ] CHK009 Le terme "point d'accès connu" est-il précisé quant au nombre de points d'accès admis par département (un seul, ou plusieurs sources possibles pour un même département) ? [Clarity, Spec §US1]

## Cohérence des exigences

- [ ] CHK010 FR-018 ("mise à jour indépendante du code") est-il cohérent avec l'invariant FR-017 (une entrée par département) sans mécanisme automatique décrit garantissant cette invariance sur un fichier édité manuellement ? [Consistency, Spec §FR-017/FR-018]
- [ ] CHK011 La règle "`connecteur_id` DOIT correspondre à un Connecteur existant" est-elle cohérente avec la possibilité de modifier le registre indépendamment du déploiement d'un connecteur (FR-018) — le cas de désynchronisation (connecteur supprimé/renommé) est-il traité ? [Consistency, Spec §data-model / FR-018]
- [x] CHK012 Les exigences sur le registre sont-elles alignées avec US5 (désactivation d'un connecteur) : le `statut` de l'entrée correspondante est-il censé changer automatiquement, ou rester `connecteur_developpe` après désactivation ? [Consistency, Gap] — **Résolu (2026-08-12, /speckit-analyze)** : spec.md Assumptions précise désormais explicitement que le registre n'est pas synchronisé automatiquement avec la désactivation d'un connecteur (mise à jour manuelle uniquement, cohérent avec FR-018).

## Critères d'acceptation et mesurabilité

- [ ] CHK013 SC-007 ("100% des départements disposent d'une entrée") est-il assorti d'un mécanisme de vérification objectif et automatisable, plutôt que d'une revue manuelle ponctuelle ? [Measurability, Spec §SC-007]
- [ ] CHK014 Le critère "reste cohérente avec la source réellement utilisée" (US1 scénario 3) peut-il être vérifié objectivement (ex. comparaison automatique registre/connecteur), ou repose-t-il uniquement sur un jugement humain non outillé ? [Measurability, Spec §US1]

## Couverture des scénarios et cas limites

- [ ] CHK015 Le cas limite "une source répertoriée change d'adresse ou disparaît avant même qu'un connecteur n'ait été développé" (listé en Edge Cases) est-il traduit en exigence fonctionnelle explicite, plutôt que laissé comme simple question ouverte ? [Gap, Spec §Edge Cases]
- [ ] CHK016 Est-il spécifié ce qui doit se produire si deux entrées du registre (deux départements) pointent vers le même `point_acces` (portail régional partagé par plusieurs départements) ? [Coverage, Gap]
- [ ] CHK017 Les exigences couvrent-elles le cas d'une entrée `identifiee` restant sans connecteur développé pendant une longue période (mécanisme de priorisation ou de relance) ? [Coverage, Gap]
- [ ] CHK018 Le cas où l'entrée d'un département est `connecteur_developpe` mais que `format_attendu` ne correspond plus au format réellement traité par le connecteur (dérive non détectée) est-il couvert ? [Coverage, Gap]

## Dépendances et hypothèses

- [ ] CHK019 L'hypothèse selon laquelle la liste de référence compte "~101 départements" est-elle documentée avec sa source (`departements.json`) plutôt que supposée implicitement par le registre ? [Assumption, Spec §Scale/Scope]
- [ ] CHK020 La dépendance du registre à une mise à jour humaine manuelle (FR-018) est-elle documentée comme un risque opérationnel explicite (registre non maintenu à jour, informations obsolètes) ? [Assumption, Gap]

## Traçabilité

- [ ] CHK021 Existe-t-il, au-delà de `departement_code`, un identifiant ou une clé stable par entrée permettant de la référencer explicitement depuis un connecteur, une anomalie ou un rapport de couverture ? [Traceability, Spec §data-model]

## Notes

- Domaine : Registre des sources (US1, FR-017, FR-018, SC-007, entité "Entrée du registre des sources").
- Profondeur : Standard. Audience : auteur (auto-revue).
- Ce fichier teste la qualité des *exigences* relatives au registre (complétude, clarté, cohérence, mesurabilité, couverture, hypothèses) — pas l'implémentation du fichier `registre-sources.yaml` ni son contenu réel.
- Distinct de `checklists/requirements.md` (checklist de qualité générale de la spec, déjà validée) : ce fichier approfondit spécifiquement US1.
