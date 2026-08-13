import type { FastifyInstance } from 'fastify';
import { executerConnecteur } from '../../../connecteurs/runner.js';
import { obtenirConnecteur, trouverConnecteurEntree } from '../../../connecteurs/registry.js';

/**
 * Routes `/connecteurs/{id}` de l'espace admin (FR-012, FR-014,
 * contracts/admin-api.yaml). T035 : déclenchement manuel uniquement
 * (`POST /collecter`) — `PATCH /connecteurs/{id}` (activation, T063) sera
 * ajouté dans ce même fichier.
 */
export async function registerAdminConnecteursRoutes(app: FastifyInstance): Promise<void> {
  app.post('/connecteurs/:id/collecter', {
    schema: {
      summary: 'Déclencher manuellement la collecte d\'un connecteur (FR-014)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', example: 'prefecture-77' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      // Vérifie l'existence et l'état `actif` avant d'instancier le
      // connecteur runtime (registry.ts) — un connecteur désactivé ne doit
      // jamais être exécuté, même manuellement (FR-012).
      const entree = await trouverConnecteurEntree(id);
      if (!entree) {
        return reply.status(404).send({
          error: 'connecteur_not_found',
          message: `Aucun connecteur ne correspond à l'identifiant '${id}'.`,
        });
      }

      if (!entree.actif) {
        return reply.status(409).send({
          error: 'connecteur_desactive',
          message: `Le connecteur '${id}' est désactivé et ne peut pas être déclenché.`,
        });
      }

      // `obtenirConnecteur` ne peut pas retourner null ici (l'entrée existe
      // déjà, cf. ci-dessus) : seule une configuration absente/invalide
      // pourrait faire lever une exception, propagée telle quelle (500).
      const connecteur = await obtenirConnecteur(id);
      const execution = await executerConnecteur(connecteur!, 'manuel');

      return reply.status(200).send(execution);
    },
  });
}
