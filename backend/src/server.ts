import { buildApp } from './api/app.js';
import { demarrerScheduler } from './connecteurs/scheduler.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

buildApp()
  .then(async (app) => {
    await app.listen({ port: PORT, host: HOST });
    // Démarre la collecte quotidienne (T040, FR-013) une fois le serveur
    // prêt à répondre — le déclenchement manuel (FR-014) reste disponible
    // dès le boot indépendamment de ce cycle planifié.
    demarrerScheduler();
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
