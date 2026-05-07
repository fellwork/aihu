import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  enumerateFiles,
  type FileSystem,
  type FileTuple,
  mergeOptions,
  printNextSteps,
  readSubstituteWrite,
  resolveTemplate,
  runPostInstall,
  type Spawner,
} from '../src/scaffold-pipeline.ts'
import type { TemplateManifest } from '../src/template-manifest.ts'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function manifestFixture(): TemplateManifest {
  return {
    name: '@aihu/templates-cf-team',
    displayName: 'Cloudflare · team-ready',
    description: 'CF Workers + monorepo',
    contractVersion: 1,
    cliRange: '^0.2.0',
    fixed: {
      vendor: 'cloudflare',
      persona: 'team',
    },
    overridable: {
      starter: { choices: ['live-counter', 'empty'], default: 'live-counter' },
      agentSurface: { choices: ['minimal', 'none'], default: 'minimal' },
      auth: {
        choices: ['better-auth', 'kinde', 'supabase'],
        default: 'better-auth',
      },
      initGit: { choices: [true, false], default: true },
    },
    conditionalFiles: [
      { path: 'src/components/live-counter.aihu', when: 'starter === "live-counter"' },
      { path: '.mcp.json', when: 'agentSurface !== "none"' },
      { path: 'src/auth/better-auth.ts', when: 'auth === "better-auth"' },
      { path: 'src/auth/kinde.ts', when: 'auth === "kinde"' },
    ],
    placeholders: ['APP_NAME', 'APP_VERSION', 'AIHU_VERSION', 'TEMPLATE_NAME'],
    postInstall: [
      { kind: 'pm-install' },
      { kind: 'git-init', when: 'initGit' },
      { kind: 'lint-fix', allowFailure: true },
    ],
    appPeerDeps: {
      '@aihu/runtime': '^1.0.0',
    },
  }
}

function fakeFs(
  initialReadable: Record<string, string>,
): FileSystem & { writes: Map<string, string> } {
  const writes = new Map<string, string>()
  const dirs = new Set<string>()
  return {
    writes,
    exists(p: string) {
      return writes.has(p) || dirs.has(p)
    },
    read(p: string) {
      const norm = p.replace(/\\/g, '/')
      const v = initialReadable[norm] ?? initialReadable[p]
      if (v === undefined) throw new Error(`fakeFs: no source for ${p}`)
      return v
    },
    write(p, c) {
      writes.set(p, c)
    },
    mkdirp(p) {
      dirs.add(p)
    },
  }
}

function fakeSpawner(): Spawner & {
  calls: Array<{ command: string; args: string[]; cwd: string }>
} {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = []
  return {
    calls,
    run(command, args, cwd) {
      calls.push({ command, args: [...args], cwd })
      return { status: 0, stdout: '', stderr: '' }
    },
  }
}

// ─── resolveTemplate ─────────────────────────────────────────────────────────

describe('resolveTemplate', () => {
  it('returns the validated manifest when given an inline object', async () => {
    const m = await resolveTemplate({ manifest: manifestFixture() })
    expect(m.name).toBe('@aihu/templates-cf-team')
  })

  it('uses the loader when manifest is not provided', async () => {
    const m = await resolveTemplate({ loader: async () => manifestFixture() })
    expect(m.contractVersion).toBe(1)
  })

  it('throws when neither manifest nor loader is provided', async () => {
    await expect(resolveTemplate({})).rejects.toThrow(/manifest.*loader/)
  })

  it('throws on an invalid manifest', async () => {
    await expect(resolveTemplate({ manifest: { name: 'x' } })).rejects.toThrow(
      /Invalid TemplateManifest/,
    )
  })
})

// ─── mergeOptions ────────────────────────────────────────────────────────────

describe('mergeOptions', () => {
  it('fills overridable cells from defaults when not provided', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'my-app', userOverrides: {} })
    expect(o.appName).toBe('my-app')
    expect(o.pm).toBe('bun')
    expect(o.overrides.starter).toBe('live-counter')
    expect(o.overrides.agentSurface).toBe('minimal')
    expect(o.overrides.auth).toBe('better-auth')
    expect(o.overrides.initGit).toBe(true)
  })

  it('honors user overrides that match allowed choices', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, {
      appName: 'demo',
      userOverrides: { agentSurface: 'none', auth: 'kinde' },
    })
    expect(o.overrides.agentSurface).toBe('none')
    expect(o.overrides.auth).toBe('kinde')
    expect(o.overrides.starter).toBe('live-counter') // default fills the rest
  })

  it('rejects user override of a fixed cell', () => {
    const m = manifestFixture()
    expect(() => mergeOptions(m, { appName: 'demo', userOverrides: { vendor: 'vercel' } })).toThrow(
      /fixed/,
    )
  })

  it('rejects unknown override key', () => {
    const m = manifestFixture()
    expect(() => mergeOptions(m, { appName: 'demo', userOverrides: { tailwind: true } })).toThrow(
      /unknown override/,
    )
  })

  it('rejects out-of-choice value', () => {
    const m = manifestFixture()
    expect(() => mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'lucia' } })).toThrow(
      /not in allowed choices/,
    )
  })

  it('rejects invalid appName', () => {
    const m = manifestFixture()
    expect(() => mergeOptions(m, { appName: '9bad', userOverrides: {} })).toThrow()
    expect(() => mergeOptions(m, { appName: 'BadCase', userOverrides: {} })).toThrow()
    expect(() => mergeOptions(m, { appName: '', userOverrides: {} })).toThrow()
  })

  it('passes through pm and noGit', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, {
      appName: 'demo',
      pm: 'pnpm',
      noGit: true,
      userOverrides: {},
    })
    expect(o.pm).toBe('pnpm')
    expect(o.noGit).toBe(true)
  })
})

// ─── enumerateFiles ──────────────────────────────────────────────────────────

describe('enumerateFiles', () => {
  it('includes all unconditional files', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'a', userOverrides: {} })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['package.json.tmpl', 'tsconfig.json'],
    })
    const targets = tuples.map((t) => t.targetRelPath).sort()
    expect(targets).toEqual(['package.json', 'tsconfig.json'])
  })

  it('drops conditional files whose when is false', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, {
      appName: 'a',
      userOverrides: { agentSurface: 'none', auth: 'better-auth' },
    })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['.mcp.json', 'src/auth/better-auth.ts', 'src/auth/kinde.ts'],
    })
    const targets = tuples.map((t) => t.targetRelPath)
    expect(targets).toContain('src/auth/better-auth.ts')
    expect(targets).not.toContain('.mcp.json') // agentSurface=none
    expect(targets).not.toContain('src/auth/kinde.ts') // auth=better-auth
  })

  it('marks `.tmpl` files as templates and strips suffix', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'a', userOverrides: {} })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['package.json.tmpl', '.gitignore'],
    })
    const pkg = tuples.find((t) => t.targetRelPath === 'package.json')!
    expect(pkg.isTemplate).toBe(true)
    expect(pkg.sourcePath).toBe('package.json.tmpl')
    const ignore = tuples.find((t) => t.targetRelPath === '.gitignore')!
    expect(ignore.isTemplate).toBe(false)
  })

  it('uses fixed cells in when context (e.g. vendor)', () => {
    const m = manifestFixture()
    // Add a conditional that depends on `vendor` (a fixed cell):
    const m2: TemplateManifest = {
      ...m,
      conditionalFiles: [
        ...m.conditionalFiles,
        { path: 'wrangler.toml.tmpl', when: 'vendor === "cloudflare"' },
      ],
    }
    const o = mergeOptions(m2, { appName: 'a', userOverrides: {} })
    const tuples = enumerateFiles(m2, o, { templateFiles: ['wrangler.toml.tmpl'] })
    expect(tuples).toHaveLength(1)
    expect(tuples[0]?.targetRelPath).toBe('wrangler.toml')
  })

  it('does no I/O — pure given inputs', () => {
    // Sanity: the function is callable without a filesystem or spawner.
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'a', userOverrides: {} })
    const tuples1 = enumerateFiles(m, o, { templateFiles: ['a.txt'] })
    const tuples2 = enumerateFiles(m, o, { templateFiles: ['a.txt'] })
    expect(tuples1).toEqual(tuples2)
  })
})

// ─── readSubstituteWrite ─────────────────────────────────────────────────────

describe('readSubstituteWrite', () => {
  it('writes verbatim files unchanged', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const fs = fakeFs({ 'tpl-root/.gitignore': 'node_modules\n' })
    const tuples: FileTuple[] = [
      { sourcePath: '.gitignore', targetRelPath: '.gitignore', isTemplate: false },
    ]
    const res = readSubstituteWrite(tuples, {
      templateRoot: 'tpl-root',
      targetDir: 'demo',
      manifest: m,
      options: o,
      fs,
    })
    expect(res.written).toHaveLength(1)
    const written = [...fs.writes.values()]
    expect(written[0]).toBe('node_modules\n')
  })

  it('substitutes placeholders in `.tmpl` files', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const fs = fakeFs({
      'tpl-root/package.json.tmpl':
        '{"name":"__APP_NAME__","description":"__APP_DESCRIPTION__","version":"__APP_VERSION__","aihu":"__AIHU_VERSION__","template":"__TEMPLATE_NAME__"}',
    })
    const tuples: FileTuple[] = [
      {
        sourcePath: 'package.json.tmpl',
        targetRelPath: 'package.json',
        isTemplate: true,
      },
    ]
    const res = readSubstituteWrite(tuples, {
      templateRoot: 'tpl-root',
      targetDir: 'demo',
      manifest: m,
      options: o,
      fs,
      now: () => '2026-05-05',
    })
    const out = [...fs.writes.values()][0]!
    const pkg = JSON.parse(out)
    expect(pkg.name).toBe('demo')
    expect(pkg.description).toBe('Cloudflare · team-ready') // default from displayName
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.aihu).toBe('^1.0.0')
    expect(pkg.template).toBe('@aihu/templates-cf-team')
    expect(res.skipped).toEqual([])
  })

  it('skips files that already exist on disk', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const fs = fakeFs({ 'tpl-root/x.txt': 'fresh' })
    // Use path.join so the pre-seeded key matches whatever
    // separator the platform's path.join produces inside readSubstituteWrite.
    const dst = join('demo', 'x.txt')
    fs.writes.set(dst, 'pre-existing')
    const res = readSubstituteWrite(
      [{ sourcePath: 'x.txt', targetRelPath: 'x.txt', isTemplate: false }],
      { templateRoot: 'tpl-root', targetDir: 'demo', manifest: m, options: o, fs },
    )
    expect(res.skipped).toContain(dst)
    expect(res.written).toHaveLength(0)
    expect(fs.writes.get(dst)).toBe('pre-existing') // unchanged
  })

  it('honors APP_DESCRIPTION override when supplied', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, {
      appName: 'demo',
      appDescription: 'My great app',
      userOverrides: {},
    })
    const fs = fakeFs({ 'tpl-root/r.md.tmpl': 'desc=__APP_DESCRIPTION__' })
    readSubstituteWrite([{ sourcePath: 'r.md.tmpl', targetRelPath: 'r.md', isTemplate: true }], {
      templateRoot: 'tpl-root',
      targetDir: 'demo',
      manifest: m,
      options: o,
      fs,
    })
    expect([...fs.writes.values()][0]).toBe('desc=My great app')
  })
})

// ─── runPostInstall ──────────────────────────────────────────────────────────

describe('runPostInstall', () => {
  it('runs pm-install + git-init + lint-fix in order with bun pm', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const sp = fakeSpawner()
    const res = runPostInstall({
      manifest: m,
      options: o,
      targetDir: '/tmp/demo',
      spawner: sp,
    })
    expect(res.failures).toEqual([])
    expect(res.ran).toHaveLength(3)
    expect(sp.calls.map((c) => `${c.command} ${c.args.join(' ')}`)).toEqual([
      'bun install',
      'git init',
      'bun run check',
    ])
  })

  it('skips git-init when initGit override is false', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, {
      appName: 'demo',
      userOverrides: { initGit: false },
    })
    const sp = fakeSpawner()
    const res = runPostInstall({
      manifest: m,
      options: o,
      targetDir: '/tmp/demo',
      spawner: sp,
    })
    expect(res.skipped.some((s) => s.kind === 'git-init')).toBe(true)
    expect(sp.calls.find((c) => c.command === 'git')).toBeUndefined()
  })

  it('skips git-init when --no-git is passed (top-level option)', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', noGit: true, userOverrides: {} })
    const sp = fakeSpawner()
    const res = runPostInstall({
      manifest: m,
      options: o,
      targetDir: '/tmp/demo',
      spawner: sp,
    })
    expect(res.skipped.some((s) => s.kind === 'git-init')).toBe(true)
  })

  it('records failures for non-allowFailure steps with non-zero exit', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const sp: Spawner = {
      run(command) {
        if (command === 'bun') return { status: 1, stdout: '', stderr: 'install failed' }
        return { status: 0, stdout: '', stderr: '' }
      },
    }
    const res = runPostInstall({
      manifest: m,
      options: o,
      targetDir: '/tmp/demo',
      spawner: sp,
    })
    expect(res.failures.some((f) => f.step.kind === 'pm-install')).toBe(true)
  })

  it('treats allowFailure steps as successful even on non-zero exit', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    let calls = 0
    const sp: Spawner = {
      run() {
        calls++
        // pm-install (1) succeeds; git-init (2) succeeds; lint-fix (3) fails
        return calls >= 3
          ? { status: 1, stdout: '', stderr: 'lint blew up' }
          : { status: 0, stdout: '', stderr: '' }
      },
    }
    const res = runPostInstall({
      manifest: m,
      options: o,
      targetDir: '/tmp/demo',
      spawner: sp,
    })
    expect(res.failures).toEqual([])
    expect(res.ran.some((s) => s.kind === 'lint-fix')).toBe(true)
  })

  it('uses the pm field from options for pm-install + lint-fix', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', pm: 'pnpm', userOverrides: {} })
    const sp = fakeSpawner()
    runPostInstall({ manifest: m, options: o, targetDir: '/tmp/demo', spawner: sp })
    expect(sp.calls[0]?.command).toBe('pnpm')
    expect(sp.calls[2]?.command).toBe('pnpm')
  })
})

// ─── printNextSteps ──────────────────────────────────────────────────────────

describe('printNextSteps', () => {
  it('prints the cd + dev command using the resolved pm', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', pm: 'bun', userOverrides: {} })
    let buf = ''
    printNextSteps({ options: o, targetDir: '/tmp/demo', output: (s) => (buf += s) })
    expect(buf).toContain('cd demo')
    expect(buf).toContain('bun run dev')
  })
})

// ─── F-3b: appPeerDepsConditional substitution ───────────────────────────────

describe('F-3b: __APP_CONDITIONAL_DEPS__ substitution', () => {
  function manifestWithConditionalDeps(): TemplateManifest {
    return {
      ...manifestFixture(),
      appPeerDepsConditional: {
        'better-auth': { version: '^1.0.0', when: 'auth === "better-auth"' },
        '@kinde-oss/kinde-typescript-sdk': { version: '^2.0.0', when: 'auth === "kinde"' },
        '@supabase/supabase-js': { version: '^2.0.0', when: 'auth === "supabase"' },
      },
    }
  }

  it('expands __APP_CONDITIONAL_DEPS__ with better-auth dep when auth=better-auth', () => {
    const m = manifestWithConditionalDeps()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'better-auth' } })
    const tmplContent = '{"dependencies":{"@aihu/runtime":"^0.2.0"__APP_CONDITIONAL_DEPS__}}'
    const fs = fakeFs({ 'tpl-root/package.json.tmpl': tmplContent })
    readSubstituteWrite(
      [{ sourcePath: 'package.json.tmpl', targetRelPath: 'package.json', isTemplate: true }],
      { templateRoot: 'tpl-root', targetDir: 'demo', manifest: m, options: o, fs },
    )
    const out = [...fs.writes.values()][0]!
    expect(out).toContain('"better-auth"')
    expect(out).toContain('^1.0.0')
    expect(out).not.toContain('@kinde-oss')
    expect(out).not.toContain('@supabase')
  })

  it('expands __APP_CONDITIONAL_DEPS__ with kinde dep when auth=kinde', () => {
    const m = manifestWithConditionalDeps()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'kinde' } })
    const tmplContent = '{"dependencies":{"@aihu/runtime":"^0.2.0"__APP_CONDITIONAL_DEPS__}}'
    const fs = fakeFs({ 'tpl-root/package.json.tmpl': tmplContent })
    readSubstituteWrite(
      [{ sourcePath: 'package.json.tmpl', targetRelPath: 'package.json', isTemplate: true }],
      { templateRoot: 'tpl-root', targetDir: 'demo', manifest: m, options: o, fs },
    )
    const out = [...fs.writes.values()][0]!
    expect(out).toContain('@kinde-oss/kinde-typescript-sdk')
    expect(out).toContain('^2.0.0')
    expect(out).not.toContain('better-auth')
    expect(out).not.toContain('@supabase')
  })

  it('__APP_CONDITIONAL_DEPS__ is empty string when no conditional deps match', () => {
    const m: TemplateManifest = {
      ...manifestFixture(),
      // No appPeerDepsConditional field.
    }
    const o = mergeOptions(m, { appName: 'demo', userOverrides: {} })
    const tmplContent = '"last":"dep"__APP_CONDITIONAL_DEPS__}'
    const fs = fakeFs({ 'tpl-root/pkg.json.tmpl': tmplContent })
    readSubstituteWrite(
      [{ sourcePath: 'pkg.json.tmpl', targetRelPath: 'pkg.json', isTemplate: true }],
      { templateRoot: 'tpl-root', targetDir: 'demo', manifest: m, options: o, fs },
    )
    const out = [...fs.writes.values()][0]!
    // The placeholder expands to '' leaving the JSON intact.
    expect(out).toBe('"last":"dep"}')
  })
})

// ─── F-5b: conditionalFiles rename field ─────────────────────────────────────

describe('F-5b: conditionalFiles rename field', () => {
  function manifestWithRename(): TemplateManifest {
    return {
      ...manifestFixture(),
      conditionalFiles: [
        ...manifestFixture().conditionalFiles,
        {
          path: 'apps/web/.env.example.better-auth',
          when: 'auth === "better-auth"',
          rename: '.env.example',
        },
        {
          path: 'apps/web/.env.example.kinde',
          when: 'auth === "kinde"',
          rename: '.env.example',
        },
      ],
    }
  }

  it('renames .env.example.better-auth → apps/web/.env.example when auth=better-auth', () => {
    const m = manifestWithRename()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'better-auth' } })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['apps/web/.env.example.better-auth', 'apps/web/.env.example.kinde'],
    })
    const targets = tuples.map((t) => t.targetRelPath)
    // better-auth file included and renamed.
    expect(targets).toContain('apps/web/.env.example')
    // kinde file excluded (wrong auth).
    expect(targets).not.toContain('apps/web/.env.example.kinde')
    expect(targets).not.toContain('apps/web/.env.example.better-auth')
  })

  it('excludes .env.example.better-auth entirely when auth=kinde', () => {
    const m = manifestWithRename()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'kinde' } })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['apps/web/.env.example.better-auth', 'apps/web/.env.example.kinde'],
    })
    const targets = tuples.map((t) => t.targetRelPath)
    // kinde file included and renamed.
    expect(targets).toContain('apps/web/.env.example')
    // better-auth file excluded.
    expect(targets).not.toContain('apps/web/.env.example.better-auth')
  })

  it('preserves original filename when no rename is set', () => {
    const m = manifestFixture()
    const o = mergeOptions(m, { appName: 'demo', userOverrides: { auth: 'better-auth' } })
    const tuples = enumerateFiles(m, o, {
      templateFiles: ['src/auth/better-auth.ts'],
    })
    const targets = tuples.map((t) => t.targetRelPath)
    // No rename → filename unchanged.
    expect(targets).toContain('src/auth/better-auth.ts')
  })
})
