import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appDefaultLayout,
  appIndexScribe,
  appPackageJson,
  appRolldownConfig,
  appScribeConfig,
  appViteConfig,
  componentScribe,
  pageScribe,
  pluginIndex,
  pluginPackageJson,
  scaffoldApp,
  scaffoldComponent,
  scaffoldPage,
  scaffoldPlugin,
  toKebab,
  toSafe,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Template generators (pure — no I/O)
// ---------------------------------------------------------------------------

describe('appPackageJson', () => {
  it('includes the app name', () => {
    const pkg = JSON.parse(appPackageJson('my-app')) as Record<string, unknown>
    expect(pkg.name).toBe('my-app')
  })

  it('lists core scribe runtime dependencies', () => {
    const pkg = JSON.parse(appPackageJson('demo')) as { dependencies: Record<string, string> }
    const deps = pkg.dependencies
    expect(deps).toHaveProperty('@scribe/arbor')
    expect(deps).toHaveProperty('@scribe/runtime')
    expect(deps).toHaveProperty('@scribe/signals')
  })

  it('lists @scribe/cli and rolldown as devDependencies', () => {
    const pkg = JSON.parse(appPackageJson('demo')) as {
      devDependencies: Record<string, string>
    }
    expect(pkg.devDependencies).toHaveProperty('@scribe/cli')
    expect(pkg.devDependencies).toHaveProperty('rolldown')
  })

  it('sets type to module', () => {
    const pkg = JSON.parse(appPackageJson('demo')) as { type: string }
    expect(pkg.type).toBe('module')
  })
})

describe('appRolldownConfig', () => {
  it('references scribeCompilerPlugin', () => {
    expect(appRolldownConfig('my-app')).toContain('scribeCompilerPlugin')
  })

  it('sets moduleTypes for .scribe files', () => {
    expect(appRolldownConfig('my-app')).toContain('.scribe')
  })

  it('outputs to dist/', () => {
    expect(appRolldownConfig('my-app')).toContain("dir: 'dist'")
  })
})

describe('appViteConfig (deprecated alias)', () => {
  it('still returns a rolldown config (backward compat)', () => {
    expect(appViteConfig()).toContain('rolldown')
  })
})

describe('appScribeConfig', () => {
  it('references defineScribeConfig', () => {
    expect(appScribeConfig()).toContain('defineScribeConfig')
  })

  it('sets build.target to universal', () => {
    expect(appScribeConfig()).toContain("target: 'universal'")
  })
})

describe('appIndexScribe', () => {
  it('has a @state block with signal import', () => {
    expect(appIndexScribe()).toContain('@state')
    expect(appIndexScribe()).toContain("from '@scribe/signals'")
  })

  it('has a @template block', () => {
    expect(appIndexScribe()).toContain('@template')
  })

  it('uses v1 signal pattern', () => {
    expect(appIndexScribe()).toContain('signal(')
  })
})

describe('appDefaultLayout', () => {
  it('has a @template block with <slot />', () => {
    expect(appDefaultLayout()).toContain('<slot />')
  })
})

describe('pageScribe', () => {
  it('sets route name from path', () => {
    expect(pageScribe('/about')).toContain("name: 'about'")
  })

  it('converts nested path to kebab name', () => {
    expect(pageScribe('/admin/users')).toContain("name: 'admin-users'")
  })

  it('falls back to "page" for root path', () => {
    expect(pageScribe('/')).toContain("name: 'page'")
  })
})

describe('componentScribe', () => {
  it('produces a @template block', () => {
    expect(componentScribe('MyCard')).toContain('@template')
  })

  it('uses kebab-case class name', () => {
    expect(componentScribe('MyCard')).toContain('my-card')
  })
})

describe('pluginPackageJson', () => {
  it('names the package scribe-plugin-<kebab>', () => {
    const pkg = JSON.parse(pluginPackageJson('MyForms')) as { name: string }
    expect(pkg.name).toBe('scribe-plugin-my-forms')
  })

  it('has @scribe/plugin as peerDependency', () => {
    const pkg = JSON.parse(pluginPackageJson('forms')) as {
      peerDependencies: Record<string, string>
    }
    expect(pkg.peerDependencies).toHaveProperty('@scribe/plugin')
  })
})

describe('pluginIndex', () => {
  it('calls definePlugin with the given name', () => {
    expect(pluginIndex('forms')).toContain("name: 'forms'")
  })

  it('uses kebab namespace', () => {
    expect(pluginIndex('MyForms')).toContain("namespace: 'my-forms'")
  })
})

describe('toKebab', () => {
  it('converts CamelCase to kebab-case', () => {
    expect(toKebab('MyComponent')).toBe('my-component')
  })

  it('leaves lowercase unchanged', () => {
    expect(toKebab('foo')).toBe('foo')
  })

  it('replaces spaces with hyphens', () => {
    expect(toKebab('foo bar')).toBe('foo-bar')
  })

  it('collapses multiple hyphens', () => {
    expect(toKebab('foo--bar')).toBe('foo-bar')
  })
})

describe('toSafe', () => {
  it('lowercases the name', () => {
    expect(toSafe('MyApp')).toBe('myapp')
  })

  it('replaces non-alphanumeric with hyphens', () => {
    expect(toSafe('my app!')).toBe('my-app')
  })

  it('removes leading non-alpha', () => {
    expect(toSafe('123app')).toBe('app')
  })

  it('falls back to "app" for empty input', () => {
    expect(toSafe('')).toBe('app')
  })
})

// ---------------------------------------------------------------------------
// Scaffold functions (with temp directory)
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'scribe-cli-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('scaffoldApp', () => {
  it('creates all 6 expected files', () => {
    const result = scaffoldApp('demo', tmpDir)
    expect(result.created).toHaveLength(6)
    expect(result.skipped).toHaveLength(0)
  })

  it('writes package.json with the correct name', () => {
    scaffoldApp('my-app', tmpDir)
    const raw = readFileSync(join(tmpDir, 'my-app', 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { name: string }
    expect(pkg.name).toBe('my-app')
  })

  it('writes rolldown.config.ts', () => {
    scaffoldApp('demo', tmpDir)
    expect(existsSync(join(tmpDir, 'demo', 'rolldown.config.ts'))).toBe(true)
  })

  it('writes src/pages/index.scribe', () => {
    scaffoldApp('demo', tmpDir)
    expect(existsSync(join(tmpDir, 'demo', 'src', 'pages', 'index.scribe'))).toBe(true)
  })

  it('writes index.html', () => {
    scaffoldApp('demo', tmpDir)
    expect(existsSync(join(tmpDir, 'demo', 'index.html'))).toBe(true)
  })

  it('writes src/main.ts', () => {
    scaffoldApp('demo', tmpDir)
    expect(existsSync(join(tmpDir, 'demo', 'src', 'main.ts'))).toBe(true)
  })

  it('skips existing files on re-run', () => {
    scaffoldApp('demo', tmpDir)
    const second = scaffoldApp('demo', tmpDir)
    expect(second.created).toHaveLength(0)
    expect(second.skipped).toHaveLength(6)
  })
})

describe('scaffoldPage', () => {
  it('creates a page file at the correct path', () => {
    scaffoldPage('/about', tmpDir)
    expect(existsSync(join(tmpDir, 'src', 'pages', 'about.scribe'))).toBe(true)
  })

  it('handles nested routes', () => {
    scaffoldPage('/admin/users', tmpDir)
    expect(existsSync(join(tmpDir, 'src', 'pages', 'admin', 'users.scribe'))).toBe(true)
  })

  it('falls back to index.scribe for root path', () => {
    scaffoldPage('/', tmpDir)
    expect(existsSync(join(tmpDir, 'src', 'pages', 'index.scribe'))).toBe(true)
  })
})

describe('scaffoldComponent', () => {
  it('creates a component file with kebab name', () => {
    scaffoldComponent('MyCard', tmpDir)
    expect(existsSync(join(tmpDir, 'src', 'components', 'my-card.scribe'))).toBe(true)
  })
})

describe('scaffoldPlugin', () => {
  it('creates package.json and src/index.ts', () => {
    const result = scaffoldPlugin('forms', tmpDir)
    expect(result.created).toHaveLength(2)
  })

  it('writes the plugin directory as scribe-plugin-<kebab>', () => {
    scaffoldPlugin('my-forms', tmpDir)
    expect(existsSync(join(tmpDir, 'scribe-plugin-my-forms', 'package.json'))).toBe(true)
    expect(existsSync(join(tmpDir, 'scribe-plugin-my-forms', 'src', 'index.ts'))).toBe(true)
  })
})
