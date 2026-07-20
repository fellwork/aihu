// Fixture: a hand-written agent artifact in config position. check:derived D2
// must report exactly ONE finding for this literal, regardless of how many
// comments describe it — the three comments below deliberately mimic the real
// scaffold, which carries three comments about one array.
//
// kept in sync with the $action entries in src/index.aihu
export default {
  plugins: [
    agentReadiness({
      name: 'demo',
      // mirrored into the component's $action block
      skills: [
        // keep in sync with the component
        { id: 'demo-root.increment', name: 'increment', description: 'Add 1' },
        { id: 'demo-root.reset', name: 'reset', description: 'Set to 0' },
      ],
    }),
  ],
}

declare function agentReadiness(config: unknown): unknown
