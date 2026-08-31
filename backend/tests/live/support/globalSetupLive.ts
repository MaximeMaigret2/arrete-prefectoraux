import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Global setup Vitest pour `test:live-drift` (2026-08-30) — exécuté UNE
 * SEULE fois avant tous les fichiers du run (indépendamment de
 * `fileParallelism`), référencé par `vitest.live.config.ts`.
 *
 * Réinitialise l'état partagé sur disque de `reseauLive.ts` (verrou de
 * throttle + compteur de circuit-breaker, cf. son en-tête pour le détail)
 * au début de CHAQUE invocation de `npm run test:live-drift`. Sans ce
 * reset, un run précédent qui aurait ouvert le circuit (blocage réseau
 * détecté) laisserait un état "ouvert" sur disque qui ferait échouer
 * instantanément TOUS les tests d'un run ultérieur, même des jours plus
 * tard une fois le blocage réel levé côté hébergeur — un faux négatif que
 * rien ne viendrait jamais corriger silencieusement. Le fichier de verrou
 * de throttle n'a pas besoin d'être réinitialisé pour la même raison (un
 * horodatage passé ne fait jamais attendre plus longtemps qu'il ne faut),
 * mais il est supprimé ici aussi par simplicité/cohérence.
 */
export default async function setup(): Promise<void> {
  const fichiers = [
    path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-throttle.json'),
    path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-circuit.json'),
  ];
  await Promise.all(fichiers.map((fichier) => rm(fichier, { force: true })));
}
