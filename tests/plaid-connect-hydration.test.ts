import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../app/plaid/ConnectPlaidButton.tsx', import.meta.url),
  'utf8'
)

test('Plaid connect button has identical disabled state before hydration', () => {
  assert.match(source, /useState<string \| null>\(null\)/)
  assert.match(source, /useState\(false\)/)
  assert.match(
    source,
    /const canOpenPlaid =\s*Boolean\(linkToken\) && ready === true && loading === false/
  )
  assert.match(source, /disabled=\{canOpenPlaid === false\}/)
  assert.doesNotMatch(source, /suppressHydrationWarning/)
  assert.doesNotMatch(source, /dynamic\(|ssr:\s*false/)
  assert.doesNotMatch(source, /typeof window/)
})
