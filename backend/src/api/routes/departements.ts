import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadDataStore } from '../../data/loader.js';
import { computeAllDepartementsState, computeDepartementStateSegments } from '../../services/computeDepartementState.js';
import { assertValidDateParam, InvalidDateError, parisDayStartUTC } from '../../services/parisDate.js';

const dateQuerySchema = z.object({
  date: z.string(),
});

const etatsRangeQuerySchema = z.object({
  debut: z.string(),
  fin: z.string(),
});

/**
 * Limite de taille d'intervalle pour `GET /departements/etats` (feature 006,
 * FR-010) : protège le temps de réponse, la boucle interne de
 * `computeDepartementStateSegments` parcourant chaque jour de l'intervalle
 * sans optimisation analytique. ~3 ans, cohérent avec la cible de profondeur
 * retenue par la feature 005 du backlog produit (cf. spec.md, Assumptions) —
 * aucun besoin réel dépassant cette taille observé à ce jour.
 */
const LIMITE_INTERVALLE_ETATS_JOURS = 1096;

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
        departements: results.map(({ code, nom, state }) => {
          // Résolution unique du connecteur pour ce département (feature 004) :
          // priorité au connecteur ayant produit evenement_applicable (rouge),
          // sinon celui qui couvre déclarativement ce code (vert) — jamais de
          // logique parallèle entre connecteur_id et derniere_collecte.
          const connecteur =
            state.etat === 'gris'
              ? null
              : (store.connecteurs.find((c) => c.id === state.evenement_applicable?.connecteur_id) ??
                store.connecteurs.find((c) => c.departements_couverts.includes(code)) ??
                null);
          return {
            code,
            nom,
            etat: state.etat,
            evenement_applicable: state.etat === 'rouge' ? state.evenement_applicable : null,
            connecteur_id: connecteur?.id ?? null,
            // Date de dernière collecte de la source pour ce département
            // (FR-001/FR-002, feature 004) — null si gris ou si le connecteur
            // n'a jamais encore collecté avec succès.
            derniere_collecte: connecteur?.derniere_collecte ?? null,
            // Dernier arrêté connu déjà terminé (idée n°2 du backlog
            // produit, 2026-09-01) — uniquement pour les départements verts
            // (pas d'arrêté en cours) ; jamais pour rouge (l'infobulle
            // affiche déjà l'arrêté en cours via evenement_applicable) ni
            // gris (aucune donnée). computeDepartementState ne le renseigne
            // de toute façon que pour 'vert' — ce garde-fou explicite reste
            // cohérent avec le traitement déjà appliqué à evenement_applicable.
            dernier_arrete_connu: state.etat === 'vert' ? state.dernier_arrete_connu : null,
          };
        }),
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

  app.get('/departements/etats', {
    schema: {
      summary: "États de tous les départements précalculés sur un intervalle (segments contigus)",
      querystring: {
        type: 'object',
        required: ['debut', 'fin'],
        properties: {
          debut: { type: 'string', format: 'date', example: '2026-05-01' },
          fin: { type: 'string', format: 'date', example: '2026-05-31' },
        },
      },
    },
    handler: async (request, reply) => {
      const parsedQuery = etatsRangeQuerySchema.safeParse(request.query);
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
      const finUTC = parisDayStartUTC(fin);
      if (finUTC.getTime() < debutUTC.getTime()) {
        return reply.status(400).send({
          error: 'invalid_range',
          message: "Le paramètre 'fin' doit être postérieur ou égal à 'debut'.",
        });
      }

      const nbJours = Math.round((finUTC.getTime() - debutUTC.getTime()) / 86400000) + 1;
      if (nbJours > LIMITE_INTERVALLE_ETATS_JOURS) {
        return reply.status(400).send({
          error: 'invalid_range',
          message: `L'intervalle demandé dépasse la limite de ${LIMITE_INTERVALLE_ETATS_JOURS} jours.`,
        });
      }

      const store = await loadDataStore();

      // Résolution département -> connecteur déclarative (feature 006,
      // FR-009) : contrairement à `GET /departements?date=...`, ne dépend
      // jamais de l'état d'un jour particulier (evenement_applicable) —
      // connecteur_id/derniere_collecte sont portés une seule fois par
      // département dans la réponse, jamais dupliqués par segment.
      const departements = store.departements.map((d) => {
        const connecteur = store.connecteurs.find((c) => c.departements_couverts.includes(d.code)) ?? null;
        return {
          code: d.code,
          nom: d.nom,
          connecteur_id: connecteur?.id ?? null,
          derniere_collecte: connecteur?.derniere_collecte ?? null,
          segments: computeDepartementStateSegments(store, d.code, debut, fin),
        };
      });

      return reply.status(200).send({
        debut,
        fin,
        derniere_mise_a_jour: store.derniereMiseAJour,
        departements,
      });
    },
  });
}
