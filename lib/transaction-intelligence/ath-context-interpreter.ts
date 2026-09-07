import { getCategoryByCode } from '../financial-engine/categories.ts'
import type {
  CanonicalCategoryCandidate,
  TransactionContextInterpretation,
  TransactionContextPerson,
  TransactionContextReason,
} from './context-types.ts'

export const ATH_CONTEXT_EXTRACTOR_VERSION = 'ath-context-extractor-v1'
export const ATH_CONTEXT_INTERPRETER_VERSION = 'ath-context-interpreter-v1'
export const ATH_CONTEXT_HIGH_CONFIDENCE = 0.8
export const ATH_CONTEXT_MEDIUM_CONFIDENCE = 0.55

type ConceptRule = {
  code: string
  categoryCode: string
  purpose: string
  terms: string[]
  phrases?: string[]
  confidence: number
}

// General bilingual concepts only. Household people and category labels are
// supplied at runtime; neither family names nor family-specific rules live here.
const CONCEPT_RULES: ConceptRule[] = [
  { code: 'sports', categoryCode: 'sports', purpose: 'deporte', terms: ['tenis', 'tennis', 'volley', 'volleyball', 'deporte', 'sports'], confidence: 0.9 },
  { code: 'fuel', categoryCode: 'transportation_gas', purpose: 'gasolina / combustible', terms: ['gas', 'gasolina', 'fuel', 'combustible'], confidence: 0.9 },
  { code: 'restaurants', categoryCode: 'food_restaurants', purpose: 'comida fuera', terms: ['restaurante', 'restaurant', 'almuerzo', 'lunch', 'cena', 'dinner'], confidence: 0.86 },
  { code: 'groceries', categoryCode: 'food_groceries', purpose: 'supermercado / alimentos', terms: ['supermercado', 'grocery', 'groceries', 'market'], confidence: 0.88 },
  { code: 'tuition', categoryCode: 'education_tuition', purpose: 'matrícula / tuition', terms: ['matricula', 'tuition', 'enrollment'], confidence: 0.92 },
  { code: 'school_supplies', categoryCode: 'education_school_supplies', purpose: 'útiles escolares', terms: ['utiles'], phrases: ['school supplies', 'materiales escolares'], confidence: 0.9 },
  { code: 'school', categoryCode: 'education_school', purpose: 'escuela / educación', terms: ['escuela', 'school', 'colegio', 'grade', 'grado'], confidence: 0.72 },
  { code: 'clothing', categoryCode: 'shopping_clothing', purpose: 'ropa', terms: ['ropa', 'clothing', 'uniforme', 'uniform', 'zapatos', 'shoes'], confidence: 0.86 },
  { code: 'food', categoryCode: 'food', purpose: 'comida', terms: ['comida', 'food'], confidence: 0.72 },
]

export function normalizeContextText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return new Set(value.split(' ').filter(Boolean))
}

function findRelatedPerson(text: string, people: TransactionContextPerson[]) {
  const normalizedText = ` ${text} `
  return people
    .map((person) => ({ person, normalizedName: normalizeContextText(person.name) }))
    .filter((item) => item.normalizedName && normalizedText.includes(` ${item.normalizedName} `))
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length)[0]?.person || null
}

function matchesForRule(rule: ConceptRule, normalized: string, tokenSet: Set<string>) {
  return [
    ...rule.terms.filter((term) => tokenSet.has(term)),
    ...(rule.phrases || []).filter((phrase) => normalized.includes(phrase)),
  ]
}

function reasonForRule(rule: ConceptRule, matchedTerms: string[]): TransactionContextReason {
  return {
    code: `concept_${rule.code}`,
    message: `El contexto contiene ${matchedTerms.map((term) => `“${term}”`).join(', ')} y coincide con el concepto general ${rule.purpose}.`,
    matchedTerms,
  }
}

function categoryCandidates(normalized: string) {
  const tokenSet = tokens(normalized)
  const candidates = CONCEPT_RULES.flatMap((rule) => {
    const matchedTerms = matchesForRule(rule, normalized, tokenSet)
    const category = getCategoryByCode(rule.categoryCode)
    if (!matchedTerms.length || !category) return []
    return [{
      categoryCode: category.code,
      displayName: category.displayName,
      purpose: rule.purpose,
      confidence: rule.confidence,
      rank: 0,
      reasons: [reasonForRule(rule, matchedTerms)],
    } satisfies CanonicalCategoryCandidate]
  })

  // Prefer a specific child over its generic parent when both came from the
  // same food context, while preserving truly distinct concepts as alternatives.
  const categoryCodes = new Set(candidates.map((candidate) => candidate.categoryCode))
  const filtered = candidates.filter((candidate) => !(
    candidate.categoryCode === 'food' &&
    (categoryCodes.has('food_restaurants') || categoryCodes.has('food_groceries'))
  ) && !(
    candidate.categoryCode === 'education_school' &&
    (categoryCodes.has('education_school_supplies') || categoryCodes.has('education_tuition'))
  ))
  const byCategory = new Map<string, CanonicalCategoryCandidate>()
  for (const candidate of filtered) {
    const current = byCategory.get(candidate.categoryCode)
    if (!current || candidate.confidence > current.confidence) byCategory.set(candidate.categoryCode, candidate)
  }
  return [...byCategory.values()]
    .sort((left, right) => right.confidence - left.confidence || left.categoryCode.localeCompare(right.categoryCode))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}

export function interpretAthTransactionContext({
  message,
  counterparty,
  people,
}: {
  message: string | null
  counterparty: string | null
  people: TransactionContextPerson[]
}): TransactionContextInterpretation {
  const normalizedMessage = normalizeContextText(message)
  const normalizedCounterparty = normalizeContextText(counterparty)
  const combined = [normalizedCounterparty, normalizedMessage].filter(Boolean).join(' ')
  const relatedPerson = findRelatedPerson(combined, people)
  const candidates = categoryCandidates(normalizedMessage)
  const ambiguous = candidates.length > 1
  const personReason: TransactionContextReason | null = relatedPerson ? {
    code: 'related_person_household_match',
    message: `“${relatedPerson.name}” coincide con una persona configurada en este hogar.`,
    matchedTerms: [relatedPerson.name],
  } : null
  const ambiguityReason: TransactionContextReason | null = ambiguous ? {
    code: 'multiple_concepts',
    message: 'El mensaje contiene conceptos de categorías distintas; no se selecciona una automáticamente.',
    matchedTerms: candidates.map((candidate) => candidate.purpose),
  } : null
  const reasons = [
    ...(personReason ? [personReason] : []),
    ...candidates.flatMap((candidate) => candidate.reasons),
    ...(ambiguityReason ? [ambiguityReason] : []),
  ]
  const confidence = ambiguous
    ? Math.min(0.65, candidates[0]?.confidence || 0.55)
    : candidates[0]?.confidence || (relatedPerson ? 0.45 : 0.3)

  return {
    evidence: { message, counterparty },
    relatedPersonId: relatedPerson?.id || null,
    relatedPersonName: relatedPerson?.name || null,
    purpose: ambiguous ? 'múltiples conceptos' : candidates[0]?.purpose || null,
    categoryCandidates: candidates,
    confidence,
    reasons,
    ambiguous,
    extractorVersion: ATH_CONTEXT_EXTRACTOR_VERSION,
    interpreterVersion: ATH_CONTEXT_INTERPRETER_VERSION,
  }
}

export function contextConfidenceLabel(confidence: number) {
  if (confidence >= ATH_CONTEXT_HIGH_CONFIDENCE) return 'Alta'
  if (confidence >= ATH_CONTEXT_MEDIUM_CONFIDENCE) return 'Media'
  return 'Baja'
}
