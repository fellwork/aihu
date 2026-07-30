/**
 * `useOperatingSystem` — best-effort OS detection
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters. Unlike most
 * sensors here there is no signal underneath — the OS a page is running on
 * cannot change mid-session, so `os()` is a constant computed once at call
 * time (mirrors {@link useSupported}'s "no reactivity needed" shape).
 * Readers in .aihu templates MUST still call it with parens: `{os()}`,
 * never bare `{os}` (consistency with every other composable getter).
 *
 * **THIS IS A HEURISTIC, NOT A CONTRACT.** Prefers the modern
 * `navigator.userAgentData.platform` (Client Hints) when the browser
 * exposes it; falls back to parsing `navigator.userAgent` — a string
 * browsers are free to lie in (compatibility spoofing, privacy-hardened
 * browsers, embedded webviews) and are actively moving away from exposing
 * in detail (User-Agent Reduction). Never gate CORRECTNESS-sensitive logic
 * on this value — use CSS/feature detection (`useSupported`,
 * `@media (pointer: coarse)`, etc.) for anything that must be right.
 * `os()` is for presentation-layer decisions only (e.g. "show ⌘ vs Ctrl in
 * a shortcut hint").
 *
 * SSR (`isClient === false`): returns a static `'unknown'` getter — no
 * `navigator` to inspect — the `isClient` no-op invariant.
 */

import { defaultNavigator, isClient } from '../shared/index.ts'

/** Best-effort OS classification. `'unknown'` covers every OS this
 * heuristic doesn't recognize (BSD, ChromeOS-as-Linux edge cases, etc.) —
 * NOT the same claim as "detection failed"; treat it as "unclassified". */
export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

export type UseOperatingSystemOptions = Record<string, never>

export interface UseOperatingSystemReturn {
  /** Best-effort getter — read as `{os()}` in templates (parens required).
   * `'unknown'` under SSR. See the module doc's heuristic caveat before
   * using this for anything but presentation. */
  readonly os: () => OperatingSystem
}

/** Navigator's optional Client Hints `userAgentData.platform` — the modern,
 * less-spoofable signal where a browser exposes it (Chromium family; not
 * Safari/Firefox as of this writing). */
interface NavigatorUAData {
  platform?: string
}

function classifyPlatformString(platform: string): OperatingSystem {
  const p = platform.toLowerCase()
  if (p.includes('win')) return 'windows'
  if (p.includes('android')) return 'android'
  if (p.includes('iphone') || p.includes('ipad') || p.includes('ios')) return 'ios'
  if (p.includes('mac')) return 'macos'
  if (p.includes('linux')) return 'linux'
  return 'unknown'
}

function detectFromUserAgentData(nav: Navigator): OperatingSystem | undefined {
  const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData
  const platform = uaData?.platform
  return platform ? classifyPlatformString(platform) : undefined
}

function detectFromUserAgent(nav: Navigator): OperatingSystem {
  const ua = nav.userAgent.toLowerCase()
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipod/.test(ua)) return 'ios'
  // iPadOS 13+ reports as "Macintosh"/"MacIntel" in the UA string but with
  // real multi-touch support — a well-documented heuristic gap between real
  // Macs (mouse/trackpad, maxTouchPoints <= 1) and iPads masquerading as
  // desktop Safari. Disambiguate before falling through to macOS.
  if (/ipad/.test(ua) || (/macintosh|mac os/.test(ua) && nav.maxTouchPoints > 1)) return 'ios'
  if (/macintosh|mac os/.test(ua)) return 'macos'
  if (/win/.test(ua)) return 'windows'
  if (/linux/.test(ua)) return 'linux'
  return 'unknown'
}

/**
 * Best-effort detection of the OS the page is running on. Computed once
 * (no signal, no listener — the OS cannot change mid-session). See the
 * module doc: this is a heuristic for presentation decisions, never a
 * correctness gate.
 */
export function useOperatingSystem(
  _options: UseOperatingSystemOptions = {},
): UseOperatingSystemReturn {
  // SSR: static 'unknown', no navigator to inspect.
  if (!isClient || defaultNavigator === undefined) {
    const os = (): OperatingSystem => 'unknown'
    return { os }
  }

  const nav = defaultNavigator
  const value = detectFromUserAgentData(nav) ?? detectFromUserAgent(nav)
  const os = (): OperatingSystem => value
  return { os }
}
