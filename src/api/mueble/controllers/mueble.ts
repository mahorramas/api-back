/**
 * mueble controller
 */

import { factories } from '@strapi/strapi';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN_LENGTH = 3;
const SLUG_MAX_LENGTH = 100;

export default factories.createCoreController('api::mueble.mueble', ({ strapi }) => ({
  async findOneBySlug(ctx: any) {
    const { slug } = ctx.params;

    // Validate slug presence
    if (!slug) {
      return ctx.badRequest('Slug is required', {
        slug: 'El slug es obligatorio',
      });
    }

    // Validate slug is a string
    if (typeof slug !== 'string') {
      return ctx.badRequest('Invalid slug format', {
        slug: 'El slug debe ser un texto',
      });
    }

    // Validate slug length
    if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
      return ctx.badRequest('Invalid slug length', {
        slug: `El slug debe tener entre ${SLUG_MIN_LENGTH} y ${SLUG_MAX_LENGTH} caracteres`,
      });
    }

    // Validate slug format (only lowercase alphanumeric and hyphens)
    if (!SLUG_REGEX.test(slug)) {
      return ctx.badRequest('Invalid slug format', {
        slug: 'El slug solo puede contener letras minúsculas, números y guiones medios',
      });
    }

    const entity = await strapi.db.query('api::mueble.mueble').findOne({
      where: { slug },
      populate: { categoria: true, imagen_producto: true, comentarios: { fields: ['autor', 'puntuacion', 'titulo', 'comentario', 'ubicacion', 'id', 'createdAt', 'publishedAt'] } },
    });

    if (!entity) {
      return ctx.notFound('Mueble not found');
    }

    return this.transformResponse(entity);
  },

  async findFeatured(ctx: any) {
    const entities = await strapi.db.query('api::mueble.mueble').findMany({
      where: { destacado: true, activo: true },
      populate: { categoria: true, imagen_producto: true, comentarios: { fields: ['autor', 'puntuacion', 'titulo', 'comentario', 'ubicacion', 'id', 'createdAt', 'publishedAt'] } },
      orderBy: { createdAt: 'desc' },
    });

    return this.transformResponse(entities);
  },
}));
