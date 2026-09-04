/**
 * mueble router
 */

import { factories } from '@strapi/strapi';

export default ({ strapi }: { strapi: any }) => {
  const coreRouter = factories.createCoreRouter('api::mueble.mueble');

  const coreRoutes =
    typeof coreRouter.routes === 'function'
      ? coreRouter.routes()
      : coreRouter.routes;

  return {
    routes: [
      ...coreRoutes,
      {
        method: 'POST',
        path: '/muebles/importar-precios',
        handler: 'mueble.importPrices',
        config: {
          auth: false,
        },
      },
      {
        method: 'GET',
        path: '/muebles/destacados',
        handler: 'mueble.findFeatured',
        config: {
          auth: false,
          middlewares: ['global::rate-limiter'],
        },
      },
      {
        method: 'GET',
        path: '/muebles/:slug',
        handler: 'mueble.findOneBySlug',
        config: {
          auth: false,
          middlewares: ['global::rate-limiter'],
        },
      },
    ],
  };
};