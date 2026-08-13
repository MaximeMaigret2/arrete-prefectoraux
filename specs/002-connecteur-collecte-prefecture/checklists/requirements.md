# Specification Quality Checklist: Connecteurs de collecte automatique des arrêtés préfectoraux

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Les 3 marqueurs [NEEDS CLARIFICATION] initiaux ont été résolus avec l'utilisateur :
  - FR-005 : PDF scanné/image sans texte extractible → hors périmètre (pas d'OCR), département reste "non couvert".
  - FR-013 : fréquence de collecte automatique → quotidienne, avec déclenchement manuel possible (FR-014).
  - FR-015 : espace de relecture protégé par une authentification dédiée (connexion admin), un seul compte (l'opérateur du projet) dans cette première version.
- Checklist entièrement validée. Spec prête pour `/speckit-clarify` (optionnel) ou `/speckit-plan`.
- **Mise à jour (2026-08-12)** : à la demande de l'utilisateur, suppression de l'étape de relecture systématique. Par défaut, un connecteur publie directement l'événement extrait ; une "anomalie de collecte" n'est créée que sur erreur/ambiguïté/difficulté d'extraction (US4, FR-007 à FR-010, FR-016 revus). Ce changement a nécessité un amendement de la constitution (règle "toute donnée doit être relue avant fusion" assouplie pour les connecteurs, voir `.specify/memory/constitution.md` v2.3.0).
- **Mise à jour (2026-08-12, bis)** : ajout d'une nouvelle User Story 1 (P1) "Constituer un registre des sources par département", livrable préalable au développement de tout connecteur (FR-017, FR-018, entité "Entrée du registre des sources", SC-007). Les autres user stories renumérotées en conséquence (P2 à P5). Le découpage technique par type de connecteur (API / scraping+PDF) et la généricité/configuration au sein d'un même type sont volontairement laissés hors de la spec (détail d'architecture) et seront traités lors de `/speckit-plan`.
