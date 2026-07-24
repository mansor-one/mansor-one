import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const history = readFileSync(new URL('../app/history/HistoryClient.tsx', import.meta.url), 'utf8')

test('resolved duplicates use the dark Mansor One warning treatment', () => {
  assert.match(history, /bg-\[#0b1730\]/)
  assert.match(history, /border-amber-400\/35/)
  assert.match(history, /Advertencia de auditoría/)
  assert.match(history, /text-slate-300/)
  assert.doesNotMatch(history, /border-amber-200 bg-amber-50/)
})

test('resolved duplicate rows preserve accessible responsive labels and pills', () => {
  assert.match(history, /md:grid-cols-\[0\.9fr_1\.5fr_0\.7fr_1fr_1\.5fr\]/)
  assert.match(history, /md:hidden">Fecha/)
  assert.match(history, /md:hidden">Comercio \/ Persona/)
  assert.match(history, /categoryPillClasses\(movement\.categoryKind\)/)
  assert.match(history, /border-sky-400\/25 bg-sky-400\/10/)
  assert.match(history, /href="\/dev\/confirmed-ledger-duplicates"/)
})
