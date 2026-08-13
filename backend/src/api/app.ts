import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import { registerAdminAuth } from './routes/admin/auth.js';
import { registerDepartementsRoutes } from './routes/departements.js';
import { registerEvenementsRoutes } from './routes/evenements.js';

/**
 * Construit l'application Fastify. API strictement en lecture seule,
 * publique, sans authentification, CORS ouvert (Constraints du plan.md).
 */
export async function buildApp(): Promise<FastifyInstance> {
  // `strict: false` : les schémas de route utilisent le mot-clé OpenAPI
  // `example` (cf. routes/departements.ts, routes/evenements.ts) pour la
  // génération de la doc via @fastify/swagger. Ajv en mode strict (défaut
  // Fastify v4) rejette ce mot-clé inconnu au boot ("unknown keyword:
  // example") ; on le désactive pour ne valider que les mots-clés JSON
  // Schema réellement utilisés (type, format, required, properties).
  const app = Fastify({ logger: true, ajv: { customOptions: { strict: false } } });

  // CORS ouvert : l'API est publique et consommée par des tiers (FR-008, FR-011).
  await app.register(cors, { origin: true, methods: ['GET'] });

  // Schéma OpenAPI généré depuis les schémas de route, exposé publiquement
  // (FR-009). Aligné sur contracts/openapi.yaml.
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: "API Carte des arrêtés d'interdiction de rassemblements musicaux non déclarés",
        description:
          "API publique en lecture seule exposant l'état des départements français " +
          '(vert / rouge / gris) et l\'historique complet des arrêtés préfectoraux ' +
          "d'interdiction des rassemblements musicaux non déclarés (rave party, " +
          'teknival). Cet outil est un service d\'information et ne remplace pas une ' +
          "vérification officielle auprès de la préfecture ou du Recueil des Actes " +
          'Administratifs (RAA) concerné.',
        version: '1.0.0',
      },
      servers: [
        { url: '/api/v1', description: 'Version 1 de l\'API (lecture seule, publique, sans authentification)' },
      ],
    },
  });

  app.get('/documentation/json', async () => app.swagger());

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (v1) => {
      await registerDepartementsRoutes(v1);
      await registerEvenementsRoutes(v1);

      // Sous-ensemble authentifié (HTTP Basic Auth, FR-015, research.md §7),
      // strictement distinct de l'API publique ci-dessus. `registerAdminAuth`
      // protège tout ce qui est enregistré dans ce même contexte `admin` —
      // les routes elles-mêmes (anomalies : T051-T054, connecteurs :
      // T035/T063) s'y ajouteront sans dupliquer la protection.
      await v1.register(
        async (admin) => {
          await registerAdminAuth(admin);
        },
        { prefix: '/admin' },
      );
    },
    { prefix: '/api/v1' },
  );

  return app;
}
