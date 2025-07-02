import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '@chatapp/shared';

export const rateLimiter = rateLimit({
  windowMs: RATE_LIMITS.API.GENERAL.windowMs,
  max: RATE_LIMITS.API.GENERAL.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.LOGIN.windowMs,
  max: RATE_LIMITS.AUTH.LOGIN.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.API.UPLOADS.windowMs,
  max: RATE_LIMITS.API.UPLOADS.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many upload attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
