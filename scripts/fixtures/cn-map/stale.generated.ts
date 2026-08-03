// FIXTURE — deliberately-stale `cn()` conflict map, for check-gate-wiring.ts's
// negative-fixture proof of check:cn-map (C-FEL-428). NOT the real generated
// target; gen-cn-conflict-map.ts --check is pointed here via CN_MAP_TARGET so
// its red path (this file mismatching the freshly-computed groups) is actually
// executed and observed, without touching the real committed output. Do not
// "fix" this file to match the real map — that would make the gate's own red
// input silently agree with reality and the proof would stop proving anything.

export const CONFLICT_GROUPS: Record<string, string> = {
  'gate-wiring-fixture-only': 'nonexistent-group',
}
