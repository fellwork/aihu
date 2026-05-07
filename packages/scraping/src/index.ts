/**
 * `@aihu/scraping` public surface.
 *
 * Value exports:
 *   `createRateLimiter`, `createRateLimitPlugin` — O(1) fixed-window rate limiter
 *   `createBotDetectionMiddleware` — Fetch-API bot-detection middleware
 *
 * Type exports:
 *   `RateLimiterOptions`, `RateLimitPlugin` — rate-limiter types
 *   `BotDetectionOptions` — bot-detection types
 */

export type { BotDetectionOptions } from './bot-detection.ts'
export { createBotDetectionMiddleware } from './bot-detection.ts'
export type { RateLimiterOptions, RateLimitPlugin } from './rate-limiter.ts'
export { createRateLimiter, createRateLimitPlugin } from './rate-limiter.ts'
