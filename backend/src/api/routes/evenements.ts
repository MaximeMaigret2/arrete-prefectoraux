import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadDataStore } from '../../data/loader.js';
import { assertValidDateParam, InvalidDateError, parisDayStartUTC } from '../../services/parisDate.js';

const rangeQuerySchema = z.object({
  debut: z.string(),
  fin: z.string(),
});

/**
 * Route `/evenements` (US4, FR-010c) : tous les événements sur un intervalle
 * de dates, tous départements confondus. Conforme à contracts/openapi.yaml.
 */
export async function registerEvenementsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/evenements', {
    schema: {
      summary: 'Tous les événements sur un intervalle de dates',
      querystring: {
        type: 'object',
        required: ['debut', 'fin'],
        properties: {
          debut: { type: 'string', format: 'date', example: '2026-01-01' },
          fin: { type: 'string', format: 'date', example: '2026-12-31' },
        },
      },
    },
    handler: async (request, reply) => {
      const parsedQuery = rangeQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          error: 'invalid_parameter',
          message: "Les paramètres 'debut' et 'fin' sont requis.",
        });
      }

      const { debut, fin } = parsedQuery.data;
      try {
        assertValidDateParam(debut, 'debut');
        assertValidDateParam(fin, 'fin');
      } catch (err) {
        if (err instanceof InvalidDateError) {
          return reply.status(400).send({ error: 'invalid_parameter', message: err.message });
        }
        throw err;
      }

      const debutUTC = parisDayStartUTC(debut);
      const finExclusiveUTC = new Date(parisDayStartUTC(fin).getTime() + 24 * 60 * 60 * 1000);

      if (finExclusiveUTC.getTime() <= debutUTC.getTime()) {
        return reply.status(400).send({
          error: 'invalid_range',
          message: "Le paramètre 'fin' doit être postérieur ou égal à 'debut'.",
        });
      }

      const store = await loadDataStore();
      const evenements = [...store.evenementsByDepartement.values()]
        .flat()
        .filter((e) => {
          const startUTC = new Date(e.date_debut).getTime();
          const endUTC = e.date_fin ? new Date(e.date_fin).getTime() : Infinity;
          // L'intervalle de l'événement recoupe la période demandée.
          return startUTC < finExclusiveUTC.getTime() && endUTC >= debutUTC.getTime();
        })
        .sort((a, b) => a.date_debut.localeCompare(b.date_debut));

      return reply.status(200).send({
        derniere_mise_a_jour: store.derniereMiseAJour,
        evenements,
      });
    },
  });
}
