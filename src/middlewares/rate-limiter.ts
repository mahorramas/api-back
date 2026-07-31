/**
 * Rate limiter middleware
 * 
 * In-memory rate limiter that limits the number of requests per IP address
 * within a configurable time window.
 * 
 * Usage in route config:
 *   config: {
 *     middlewares: ['global::rate-limiter'],
 *   }
 * 
 * Global configuration in config/middlewares.ts:
 *   {
 *     name: 'global::rate-limiter',
 *     config: {
 *       windowMs: 60000,      // 1 minute window
 *       max: 30,              // 30 requests per window
 *     },
 *   }
 */

interface RateLimiterConfig {
  windowMs: number;
  max: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export default (config: RateLimiterConfig, { strapi }: { strapi: any }) => {
  const windowMs = config.windowMs || 60 * 1000; // default 1 minute
  const max = config.max || 30; // default 30 requests per window

  return async (ctx: any, next: () => Promise<void>) => {
    const ip = ctx.request.ip || ctx.ip || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetTime) {
      // First request or window has expired
      store.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      ctx.set('X-RateLimit-Limit', String(max));
      ctx.set('X-RateLimit-Remaining', String(max - 1));
      ctx.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    if (entry.count >= max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      ctx.set('Retry-After', String(retryAfter));
      ctx.set('X-RateLimit-Limit', String(max));
      ctx.set('X-RateLimit-Remaining', '0');
      ctx.set('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));
      ctx.status = 429;
      ctx.body = {
        data: null,
        error: {
          status: 429,
          name: 'TooManyRequests',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
          details: {},
        },
      };
      return;
    }

    // Increment count
    entry.count++;
    ctx.set('X-RateLimit-Limit', String(max));
    ctx.set('X-RateLimit-Remaining', String(max - entry.count));
    ctx.set('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));
    return next();
  };
};