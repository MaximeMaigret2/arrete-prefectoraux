import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadDataStore } from '../../data/loader.js';
import { computeAllDepartementsState } from '../../services/computeDepartementState.js';
import { assertValidDateParam, InvalidDateError } from '../../services/parisDate.js';

const dateQuerySchema = z.object({
  date: z.string(),
});

/**
 * Routes `/departements` (US1, FR-010a) et `/departements/{code}/evenements`
 * (US4, FR-010b), conformes à contracts/openapi.yaml.
 */
export async function registerDepartementsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/departements', {
    schema: {
      summary: 'État de tous les départements à une date donnée',
      querystring: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', format: 'date', example: '2026-08-10' },
        },
      },
    },
    handler: async (request, reply) => {
      const parsedQuery = dateQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          error: 'invalid_parameter',
          message: "Le paramètre 'date' est requis.",
        });
      }

      try {
        assertValidDateParam(parsedQuery.data.date);
      } catch (err) {
        if (err instanceof InvalidDateError) {
          return reply.status(400).send({ error: 'invalid_parameter', message: err.message });
        }
        throw err;
      }

      const store = await loadDataStore();
      const results = computeAllDepartementsState(store, parsedQuery.data.date);

      return reply.status(200).send({
        date: parsedQuery.data.date,
        derniere_mise_a_jour: store.derniereMiseAJour,
        departements: results.map(({ code, nom, state }) => ({
          code,
          nom,
          etat: state.etat,
          evenement_applicable: state.etat === 'rouge' ? state.evenement_applicable : null,
          connecteur_id:
            state.etat === 'gris'
              ? null
              : (state.evenement_applicable?.connecteur_id ??
                store.connecteurs.find((c) => c.departements_couverts.includes(code))?.id ??
                null),
        })),
      });
    },
  });

  app.get('/departements/:code/evenements', {
    schema: {
      summary: "Historique complet des événements d'un département",
      params: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', example: '77' } },
      },
    },
    handler: async (request, reply) => {
      const { code } = request.params as { code: string };
      const store = await loadDataStore();
      const departement = store.departementsByCode.get(code);

      if (!departement) {
        return reply.status(404).send({
          error: 'departement_not_found',
          message: `Le code de département '${code}' ne correspond à aucun département français.`,
        });
      }

      const couvert = store.departementsCouverts.has(code);
      const evenements = store.evenementsByDepartement.get(code) ?? [];

      return reply.status(200).send({
        code: departement.code,
        nom: departement.nom,
        couvert,
        evenements,
      });
    },
  });
}
