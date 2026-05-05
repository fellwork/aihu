/**
 * Kinde auth client configuration for __APP_NAME__.
 *
 * Scaffolded per arch-6 §13 Q3 RESOLVED. The CLI emits this file only when
 * the user picks `auth: 'kinde'`. Pair it with the matching
 * `.env.example.kinde` for the env-var contract.
 *
 * Docs: https://kinde.com/docs/developer-tools/typescript-sdk
 */

import { createKindeServerClient, GrantType } from '@kinde-oss/kinde-typescript-sdk'

const clientId = process.env.KINDE_CLIENT_ID
const clientSecret = process.env.KINDE_CLIENT_SECRET
const issuerBaseUrl = process.env.KINDE_ISSUER_URL
const redirectURL = process.env.KINDE_REDIRECT_URL

if (!clientId || !clientSecret || !issuerBaseUrl || !redirectURL) {
  throw new Error(
    '[__APP_NAME__/auth/kinde] Missing required env: ' +
      'KINDE_CLIENT_ID, KINDE_CLIENT_SECRET, KINDE_ISSUER_URL, KINDE_REDIRECT_URL.',
  )
}

export const kindeClient = createKindeServerClient(GrantType.AUTHORIZATION_CODE, {
  authDomain: issuerBaseUrl,
  clientId,
  clientSecret,
  redirectURL,
  logoutRedirectURL: redirectURL,
})

export type KindeClient = typeof kindeClient
