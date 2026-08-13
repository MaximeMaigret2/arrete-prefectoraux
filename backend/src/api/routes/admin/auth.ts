import { timingSafeEqual } from 'node:crypto';
import basicAuth from '@fastify/basic-auth';
import type { FastifyInstance } from 'fastify';

/**
 * Enregistre `@fastify/basic-auth` et le hook `onRequest` qui protège
 * toute route enregistrée dans CE contexte Fastify encapsulé (research.md
 * §7, FR-015). Compte unique — pas de gestion multi-utilisateurs (cf.
 * Assumptions du spec) — identifiants fournis exclusivement par variables
 * d'environnement (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), jamais en dur dans
 * le code. Échoue explicitement au démarrage si ces variables sont
 * absentes plutôt que de retomber sur des identifiants par défaut non
 * sécurisés — cohérent avec le fait que cet espace protège les seules
 * mutations de l'application (résolution d'anomalies, activation des
 * connecteurs), à l'inverse de l'API publique en lecture seule (FR-015)
 * qui reste, elle, entièrement inchangée et sans authentification.
 *
 * N'importe quelle route ajoutée plus tard à l'intérieur de ce même
 * contexte `admin` (ex. `routes/admin/anomalies.ts` en T051-T054,
 * `routes/admin/connecteurs.ts` en T035/T063) hérite automatiquement de
 * cette protection, sans rien à répéter dans ces fichiers.
 */
export async function registerAdminAuth(admin: FastifyInstance): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Authentification admin non configurée : les variables d'environnement " +
        'ADMIN_USERNAME et ADMIN_PASSWORD sont requises (research.md §7, FR-015).',
    );
  }

  await admin.register(basicAuth, {
    validate: async (candidateUsername, candidatePassword) => {
      if (!comparaisonSure(candidateUsername, username) || !comparaisonSure(candidatePassword, password)) {
        return new Error('Identifiants invalides.');
      }
    },
    // Le tiret est volontairement un simple trait d'union (ASCII/Latin-1) et
    // non un tiret cadratin : la valeur de `realm` finit dans l'en-tête HTTP
    // `WWW-Authenticate`, dont le contenu doit être encodable en Latin-1
    // (RFC 7230 §3.2) — un tiret cadratin (U+2014) fait échouer silencieusement
    // l'envoi de l'en-tête (constaté en écrivant le test de contrat T020).
    authenticate: { realm: 'Espace de résolution - Arrêtés préfectoraux' },
  });

  admin.addHook('onRequest', admin.basicAuth);
}

/** Comparaison à temps constant, pour ne pas exposer la longueur/le préfixe correct d'un identifiant via le temps de réponse. */
function comparaisonSure(saisi: string, attendu: string): boolean {
  const bufSaisi = Buffer.from(saisi);
  const bufAttendu = Buffer.from(attendu);
  if (bufSaisi.length !== bufAttendu.length) return false;
  return timingSafeEqual(bufSaisi, bufAttendu);
}
