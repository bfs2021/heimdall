#!/usr/bin/env node
// Checks that the consumer skills in agent-skills/ cover the public API in src/index.ts.
//
// Fails when:
//   - an exported component has no `## ComponentName` section in any skill
//   - a component's section is not in the skill the category table assigns it to
//     (.claude/commands/refine-component-skills.md)
//   - a component is missing from its skill's frontmatter description
//   - a non-component export (hook, function, constant) is never named in any skill
//   - a skill has a `## ComponentName` section for something src/index.ts does not export
//   - a props table names a prop the component's type does not accept
//   - a props table leaves out a prop the component declares in src/ (tag a prop `@internal`
//     in its JSDoc to keep it out of the skills)
//
// Usage: npm run check:skills

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = path.join(ROOT, 'src/index.ts')
const SKILLS_DIR = path.join(ROOT, 'agent-skills')
const COMMAND = path.join(ROOT, '.claude/commands/refine-component-skills.md')

const problems = []
const fail = (msg) => problems.push(msg)
const rel = (p) => path.relative(ROOT, p)

// ---------------------------------------------------------------------------
// Public value exports from src/index.ts (type-only exports are skipped)

function readValueExports() {
  const sf = ts.createSourceFile(INDEX, fs.readFileSync(INDEX, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = []
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || stmt.isTypeOnly) continue
    const clause = stmt.exportClause
    if (!clause || !ts.isNamedExports(clause)) continue
    for (const el of clause.elements) {
      if (!el.isTypeOnly) names.push(el.name.text)
    }
  }
  return names
}

const isConstantName = (n) => /^[A-Z][A-Z0-9_]*$/.test(n)
const isComponentName = (n) => /^[A-Z]/.test(n) && !isConstantName(n)

// ---------------------------------------------------------------------------
// Category table from the generator command

function readCategoryTable() {
  const text = fs.readFileSync(COMMAND, 'utf8')
  const categories = new Map() // slug -> component names
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*`(heimdall-[a-z-]+)`\s*\|[^|]*\|([^|]*)\|/)
    if (!m) continue
    const components = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    categories.set(m[1], components)
  }
  if (categories.size === 0) fail(`${rel(COMMAND)}: no category table rows found`)
  return categories
}

// ---------------------------------------------------------------------------
// Skill files

function readSkills() {
  const skills = new Map() // slug -> { file, text, lines }
  for (const dir of fs.readdirSync(SKILLS_DIR).sort()) {
    const file = path.join(SKILLS_DIR, dir, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    skills.set(dir, { file, text, lines: text.split('\n') })
  }
  return skills
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const fields = {}
  if (!m) return fields
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) fields[kv[1]] = kv[2]
  }
  return fields
}

// Returns the `## Name` sections whose heading is a single PascalCase word, plus every props
// table row: { component, sub, prop, line } where `sub` is the compound part of `#### A.B`.
function parseSkill(lines) {
  const sections = []
  const propRows = []
  let component = null
  let tableOwner = null // { component, sub } while inside `### Props` or `#### A.B`
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (inFence) return
    const h2 = line.match(/^## (.+?)\s*$/)
    if (h2) {
      component = /^[A-Z][A-Za-z0-9]*$/.test(h2[1]) ? h2[1] : null
      if (component) sections.push({ name: component, line: i + 1 })
      tableOwner = null
      return
    }
    const h3 = line.match(/^### (.+?)\s*$/)
    if (h3) {
      tableOwner = component && h3[1] === 'Props' ? { component, sub: null } : null
      return
    }
    const h4 = line.match(/^#### ([A-Z][A-Za-z0-9]*)\.([A-Z][A-Za-z0-9]*)\s*$/)
    if (h4) {
      tableOwner = { component: h4[1], sub: h4[2] }
      return
    }
    if (/^#{1,6} /.test(line)) {
      tableOwner = null
      return
    }
    if (!tableOwner || !line.startsWith('|')) return
    const firstCell = line.split('|')[1]?.trim() ?? ''
    const m = firstCell.match(/^`([A-Za-z_$][\w$-]*)/)
    if (!m) return // header, separator, or spread row (`...rest`)
    propRows.push({ ...tableOwner, prop: m[1], line: i + 1 })
  })
  return { sections, propRows }
}

// ---------------------------------------------------------------------------
// Prop names each component accepts, resolved with the TypeScript checker

function resolvePropNames(targets) {
  // targets: array of "Component" or "Component.Sub"
  const configPath = path.join(ROOT, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
  const virtualFile = path.join(ROOT, 'src/__skill_props_check__.ts')
  const aliases = targets.map((t, i) => [t, `__P${i}`])
  const source = [
    `import type { ComponentProps } from 'react'`,
    `import * as H from './index'`,
    `type Keys<T> = T extends unknown ? keyof T : never`,
    ...aliases.map(([t, alias]) => `export type ${alias} = Keys<ComponentProps<typeof H.${t}>>`),
    ...aliases.map(([t, alias]) => `export type ${alias.replace('P', 'Q')} = ComponentProps<typeof H.${t}>`),
  ].join('\n')

  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, lang, ...rest) =>
    path.resolve(fileName) === virtualFile
      ? ts.createSourceFile(fileName, source, lang, true)
      : getSourceFile(fileName, lang, ...rest)
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (f) => path.resolve(f) === virtualFile || fileExists(f)

  const program = ts.createProgram([virtualFile], { ...options, noUnusedLocals: false }, host)
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(virtualFile)

  const broken = new Set()
  for (const d of program.getSemanticDiagnostics(sf)) {
    const lineNo = sf.getLineAndCharacterOfPosition(d.start ?? 0).line
    const idx = (lineNo - 3) % targets.length
    if (lineNo >= 3) broken.add(targets[idx])
  }

  const srcDir = path.join(ROOT, 'src') + path.sep
  const result = new Map() // target -> { names: Set<string>, open: boolean, own: Set<string> } | 'missing'
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) || !stmt.name.text.startsWith('__P')) continue
    const target = targets[Number(stmt.name.text.slice(3))]
    if (broken.has(target)) {
      result.set(target, 'missing')
      continue
    }
    const info = { names: new Set(), open: false, own: new Set() }
    const keys = checker.getTypeAtLocation(stmt.name)
    for (const m of keys.isUnion() ? keys.types : [keys]) {
      if (m.isStringLiteral()) info.names.add(m.value)
      else if (m.flags & (ts.TypeFlags.String | ts.TypeFlags.Any)) info.open = true
    }
    // Props declared in src/ (not inherited from React's DOM attribute types), minus @internal ones
    const propsAlias = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === `__Q${stmt.name.text.slice(3)}`)
    const propsType = checker.getTypeAtLocation(propsAlias.name)
    for (const member of propsType.isUnion() ? propsType.types : [propsType]) {
      for (const sym of checker.getPropertiesOfType(member)) {
        const decls = sym.declarations ?? []
        if (!decls.length || !decls.every((d) => d.getSourceFile().fileName.startsWith(srcDir))) continue
        if (ts.getJSDocTags(decls[0]).some((t) => t.tagName.text === 'internal')) continue
        if (sym.name === 'key' || sym.name === 'ref') continue
        info.own.add(sym.name)
      }
    }
    result.set(target, info)
  }
  return result
}

// ---------------------------------------------------------------------------

const exportsList = readValueExports()
const exported = new Set(exportsList)
const components = exportsList.filter(isComponentName)
const others = exportsList.filter((n) => !isComponentName(n))
const categories = readCategoryTable()
const skills = readSkills()

// Category table <-> exports
const assigned = new Map() // component -> slug
for (const [slug, list] of categories) {
  for (const c of list) {
    if (assigned.has(c)) fail(`${rel(COMMAND)}: ${c} is listed under both ${assigned.get(c)} and ${slug}`)
    assigned.set(c, slug)
    if (!exported.has(c)) fail(`${rel(COMMAND)}: ${slug} lists ${c}, which src/index.ts does not export`)
  }
  if (!skills.has(slug)) fail(`${rel(COMMAND)}: ${slug} has no agent-skills/${slug}/SKILL.md`)
}
for (const c of components) {
  if (!assigned.has(c)) fail(`src/index.ts exports ${c}, but no row of the category table in ${rel(COMMAND)} lists it`)
}

// Skills <-> exports
const documentedIn = new Map() // component -> slug
const allPropRows = []
for (const [slug, skill] of skills) {
  const fm = frontmatter(skill.text)
  if (fm.name !== slug) fail(`${rel(skill.file)}: frontmatter name is "${fm.name ?? ''}", expected "${slug}"`)
  if (!categories.has(slug)) fail(`${rel(skill.file)}: ${slug} is not in the category table in ${rel(COMMAND)}`)

  const { sections, propRows } = parseSkill(skill.lines)
  for (const s of sections) {
    if (!exported.has(s.name)) {
      fail(`${rel(skill.file)}:${s.line}: section "## ${s.name}" documents something src/index.ts does not export`)
      continue
    }
    if (documentedIn.has(s.name)) fail(`${rel(skill.file)}:${s.line}: ${s.name} also has a section in ${documentedIn.get(s.name)}`)
    documentedIn.set(s.name, slug)
    const expected = assigned.get(s.name)
    if (expected && expected !== slug) fail(`${rel(skill.file)}:${s.line}: ${s.name} belongs in ${expected} per the category table`)
  }
  for (const c of categories.get(slug) ?? []) {
    if (!new RegExp(`\\b${c}\\b`).test(fm.description ?? '')) {
      fail(`${rel(skill.file)}: frontmatter description does not name ${c}`)
    }
  }
  for (const row of propRows) allPropRows.push({ ...row, file: skill.file })
}
for (const c of components) {
  if (!documentedIn.has(c)) fail(`${c} is exported but has no "## ${c}" section in any agent-skills/*/SKILL.md`)
}

const allText = [...skills.values()].map((s) => s.text).join('\n')
for (const n of others) {
  if (!new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(allText)) {
    fail(`${n} is exported from src/index.ts but no skill names it`)
  }
}

// Props tables <-> component types
const rowsByTarget = new Map() // "Component" or "Component.Sub" -> rows
for (const row of allPropRows) {
  if (!exported.has(row.component)) {
    fail(`${rel(row.file)}:${row.line}: props table for ${row.component}, which src/index.ts does not export`)
    continue
  }
  const target = row.sub ? `${row.component}.${row.sub}` : row.component
  if (!rowsByTarget.has(target)) rowsByTarget.set(target, [])
  rowsByTarget.get(target).push(row)
}
const targets = [...new Set([...components.filter((c) => documentedIn.has(c)), ...rowsByTarget.keys()])]
const propInfo = resolvePropNames(targets)
for (const target of targets) {
  const info = propInfo.get(target)
  const rows = rowsByTarget.get(target) ?? []
  if (info === 'missing') {
    for (const row of rows) fail(`${rel(row.file)}:${row.line}: ${target} is not a component the package exports`)
    continue
  }
  if (!info) continue
  for (const row of rows) {
    if (!info.open && !info.names.has(row.prop)) fail(`${rel(row.file)}:${row.line}: ${target} has no prop "${row.prop}"`)
  }
  const documented = new Set(rows.map((r) => r.prop))
  const undocumented = [...info.own].filter((p) => !documented.has(p))
  if (undocumented.length) {
    const component = target.split('.')[0]
    const file = skills.get(documentedIn.get(component))?.file
    const heading = target.includes('.') ? `#### ${target}` : `## ${target} > ### Props`
    fail(`${file ? rel(file) : target}: ${heading} table is missing ${undocumented.map((p) => `"${p}"`).join(', ')}`)
  }
}

if (problems.length) {
  console.error(`check-skill-coverage: ${problems.length} problem(s)\n`)
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(
  `check-skill-coverage: ${components.length} components and ${others.length} other exports covered across ${skills.size} skills; ${allPropRows.length} documented props checked`,
)
