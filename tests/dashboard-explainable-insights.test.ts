import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboard = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../app/components/ExplainableInsight.tsx', import.meta.url), 'utf8')

test('dashboard insights open an accessible drawer instead of navigating', () => {
  assert.match(dashboard, /<ExplainableInsight/)
  assert.match(drawer, /aria-haspopup="dialog"/)
  assert.match(drawer, /aria-modal="true"/)
  assert.match(drawer, /event\.key === 'Escape'/)
  assert.doesNotMatch(drawer, /from 'next\/link'/)
})

test('drawer explains evidence, classification, related records and Robototina recommendations', () => {
  assert.match(drawer, /¿Por qué apareció\?/)
  assert.match(drawer, /Datos usados/)
  assert.match(drawer, /Movimientos u obligaciones relacionadas/)
  assert.match(drawer, /Tipo de insight/)
  assert.match(drawer, /Recomendaciones de Robototina/)
  assert.match(drawer, /Ver contexto estructurado/)
  assert.match(dashboard, /getRobototinaContext\(supabase, user\.id\)/)
})

test('risk and informational insights retain icons and text labels', () => {
  assert.match(drawer, /classification === 'riesgo' \? '⚠' : 'ⓘ'/)
  assert.match(drawer, /classification === 'riesgo' \? 'Riesgo' : 'Informativo'/)
})
