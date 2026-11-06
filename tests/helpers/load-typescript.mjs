import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const nodeRequire = createRequire(import.meta.url)

/** Run actual local TS modules using the installed compiler, with explicit boundary mocks. */
export function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const compiledModule = { exports: {} }
  const requireModule = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name)
      const resolved = ['.ts', '.tsx'].map(extension => base + extension).find(fs.existsSync)
      if (!resolved) throw new Error(`Unresolved module: ${name}`)
      return load(path.relative(root, resolved), mocks)
    }
    return nodeRequire(name)
  }
  vm.runInThisContext(`(function(require, module, exports) { ${output}\n})`, { filename })(requireModule, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
