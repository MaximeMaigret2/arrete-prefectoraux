import { defineConfig } from 'vitest/config';

/**
 * Config Vitest séparée pour les tests de dérive (Phase 5bis, V006) —
 * `backend/tests/live/**`. Ces tests font un VRAI appel réseau vers les
 * sites des préfectures pour vérifier que leur structure HTML n'a pas
 * changé depuis la fixture capturée (cf. `tests/fixtures/connecteurs/reel/`).
 *
 * Jamais inclus dans `vitest.config.ts` (voir son `exclude`), jamais lancé
 * par `npm test`/`test:unit`/`test:contract`/`test:integration`, jamais par
 * une CI — uniquement via `npm run test:live-drift`, déclenché à la main
 * par un opérateur (cf. backend/README.md). Ils n'affirment RIEN sur le
 * contenu réel (qui change en permanence et n'est pas sous notre contrôle),
 * seulement sur des propriétés structurelles (sélecteurs présents, lien PDF
 * toujours au bon format, page toujours accessible) — un échec signale une
 * dérive à investiguer, pas un contenu inattendu.
 *
 * `fileParallelism: false` (2026-08-28, complétion de la suite à 96/96
 * connecteurs) — même réglage que `vitest.config.ts` (Q-006/chantier 57),
 * mais absent ici jusqu'à présent car jamais nécessaire à 43 fichiers.
 * Passé à 96 fichiers, l'exécution parallèle par défaut de Vitest (plusieurs
 * workers, chacun lançant ses propres `fetch()`) a bombardé de connexions
 * concurrentes l'hébergeur mutualisé `77.159.252.140` (plusieurs dizaines de
 * sites préfecture derrière la même IP, cf. section "Historique détaillé"
 * plus bas dans `claude/etat-connecteurs.md`) — 64/96 échecs observés
 * (`SocketError: other side closed`, plus un blocage Cloudflare ponctuel sur
 * `prefecture-75` cohérent avec une détection de rafale), alors que les
 * MÊMES 43 fichiers d'origine avaient tous été verts quelques heures plus
 * tôt dans la même session. Aucune dérive réelle : purement un problème de
 * concurrence réseau côté suite de test, pas côté connecteur. Fichiers
 * exécutés séquentiellement (un seul à la fois) pour rester poli envers
 * l'hébergeur mutualisé, comme le fait déjà `vitest.config.ts`.
 *
 * `globalSetup` (2026-08-30) — un run réel du 2026-08-30 a montré qu'un
 * throttle de 2s entre requêtes (`reseauLive.ts`) ne suffit pas à éviter ce
 * même type de blocage (18/96 fichiers verts puis blocage total des 78
 * suivants, motif quasiment identique à un run sans throttle) : le seuil de
 * l'hébergeur ressemble à un compteur de requêtes sur une fenêtre de
 * l'ordre de la minute, pas à une détection de rafale instantanée. Un
 * circuit-breaker a été ajouté à `reseauLive.ts` pour arrêter d'envoyer des
 * requêtes dès que le blocage est détecté (au lieu de marteler l'hôte déjà
 * bloqué pour tous les fichiers restants) — ce `globalSetup` réinitialise
 * son état à chaque run pour ne jamais faire échouer un run ultérieur sur
 * la base d'un blocage déjà résolu. Cf. `claude/etat-connecteurs.md` du
 * projet Cowork associé, section "Quatrième run réel", pour le détail
 * complet du raisonnement.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
    // Circuit-breaker (2026-08-30, cf. `tests/live/support/reseauLive.ts` et
    // `globalSetupLive.ts`) : réinitialise l'état de throttle/circuit sur
    // disque au début de CHAQUE run, pour qu'un blocage constaté un jour ne
    // fasse jamais échouer silencieusement un run ultérieur une fois le
    // blocage réel levé côté hébergeur.
    globalSetup: ['./tests/live/support/globalSetupLive.ts'],
    env: {
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-admin-password-not-for-production',
    },
  },
});
