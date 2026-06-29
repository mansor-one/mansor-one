export type CanonicalCategoryKind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'payment'
  | 'adjustment'

export type CanonicalCategory = {
  id: string
  parentId: string | null
  code: string
  displayName: string
  kind: CanonicalCategoryKind
  isSystem: boolean
  sortOrder: number
}

const systemCategories = [
  { id: 'food', parentId: null, code: 'food', displayName: 'Food', kind: 'expense', isSystem: true, sortOrder: 100 },
  { id: 'food_restaurants', parentId: 'food', code: 'food_restaurants', displayName: 'Restaurants', kind: 'expense', isSystem: true, sortOrder: 101 },
  { id: 'food_groceries', parentId: 'food', code: 'food_groceries', displayName: 'Groceries', kind: 'expense', isSystem: true, sortOrder: 102 },
  { id: 'food_work_cafeteria', parentId: 'food', code: 'food_work_cafeteria', displayName: 'Work Cafeteria', kind: 'expense', isSystem: true, sortOrder: 103 },

  { id: 'transportation', parentId: null, code: 'transportation', displayName: 'Transportation', kind: 'expense', isSystem: true, sortOrder: 200 },
  { id: 'transportation_gas', parentId: 'transportation', code: 'transportation_gas', displayName: 'Gas', kind: 'expense', isSystem: true, sortOrder: 201 },
  { id: 'transportation_parking', parentId: 'transportation', code: 'transportation_parking', displayName: 'Parking', kind: 'expense', isSystem: true, sortOrder: 202 },
  { id: 'transportation_tolls', parentId: 'transportation', code: 'transportation_tolls', displayName: 'Tolls', kind: 'expense', isSystem: true, sortOrder: 203 },

  { id: 'housing', parentId: null, code: 'housing', displayName: 'Housing', kind: 'expense', isSystem: true, sortOrder: 300 },
  { id: 'housing_mortgage', parentId: 'housing', code: 'housing_mortgage', displayName: 'Mortgage', kind: 'expense', isSystem: true, sortOrder: 301 },
  { id: 'housing_repairs', parentId: 'housing', code: 'housing_repairs', displayName: 'Repairs', kind: 'expense', isSystem: true, sortOrder: 303 },

  { id: 'finance', parentId: null, code: 'finance', displayName: 'Finance', kind: 'expense', isSystem: true, sortOrder: 400 },
  { id: 'finance_bank_fees', parentId: 'finance', code: 'finance_bank_fees', displayName: 'Bank Fees', kind: 'expense', isSystem: true, sortOrder: 401 },
  { id: 'finance_interest', parentId: 'finance', code: 'finance_interest', displayName: 'Interest', kind: 'expense', isSystem: true, sortOrder: 402 },

  { id: 'health', parentId: null, code: 'health', displayName: 'Health', kind: 'expense', isSystem: true, sortOrder: 500 },
  { id: 'health_pharmacy', parentId: 'health', code: 'health_pharmacy', displayName: 'Pharmacy', kind: 'expense', isSystem: true, sortOrder: 501 },
  { id: 'health_medical', parentId: 'health', code: 'health_medical', displayName: 'Medical', kind: 'expense', isSystem: true, sortOrder: 502 },

  { id: 'family', parentId: null, code: 'family', displayName: 'Family', kind: 'expense', isSystem: true, sortOrder: 600 },
  { id: 'family_andrea', parentId: 'family', code: 'family_andrea', displayName: 'Andrea', kind: 'expense', isSystem: true, sortOrder: 601 },
  { id: 'family_gaby', parentId: 'family', code: 'family_gaby', displayName: 'Gaby', kind: 'expense', isSystem: true, sortOrder: 602 },
  { id: 'family_soraya', parentId: 'family', code: 'family_soraya', displayName: 'Soraya', kind: 'expense', isSystem: true, sortOrder: 603 },

  { id: 'shopping', parentId: null, code: 'shopping', displayName: 'Shopping', kind: 'expense', isSystem: true, sortOrder: 700 },
  { id: 'shopping_home', parentId: 'shopping', code: 'shopping_home', displayName: 'Home Goods', kind: 'expense', isSystem: true, sortOrder: 701 },
  { id: 'shopping_general', parentId: 'shopping', code: 'shopping_general', displayName: 'General Shopping', kind: 'expense', isSystem: true, sortOrder: 703 },

  { id: 'software', parentId: null, code: 'software', displayName: 'Software', kind: 'expense', isSystem: true, sortOrder: 800 },
  { id: 'software_tools', parentId: 'software', code: 'software_tools', displayName: 'Tools', kind: 'expense', isSystem: true, sortOrder: 801 },

  { id: 'subscriptions', parentId: null, code: 'subscriptions', displayName: 'Subscriptions', kind: 'expense', isSystem: true, sortOrder: 900 },
  { id: 'subscriptions_streaming', parentId: 'subscriptions', code: 'subscriptions_streaming', displayName: 'Streaming', kind: 'expense', isSystem: true, sortOrder: 901 },

  { id: 'travel', parentId: null, code: 'travel', displayName: 'Travel', kind: 'expense', isSystem: true, sortOrder: 1000 },
  { id: 'travel_flights', parentId: 'travel', code: 'travel_flights', displayName: 'Flights', kind: 'expense', isSystem: true, sortOrder: 1001 },

  { id: 'income', parentId: null, code: 'income', displayName: 'Income', kind: 'income', isSystem: true, sortOrder: 1100 },
  { id: 'income_salary', parentId: 'income', code: 'income_salary', displayName: 'Salary', kind: 'income', isSystem: true, sortOrder: 1101 },
  { id: 'income_bonus', parentId: 'income', code: 'income_bonus', displayName: 'Bonus', kind: 'income', isSystem: true, sortOrder: 1102 },

  { id: 'taxes', parentId: null, code: 'taxes', displayName: 'Taxes', kind: 'expense', isSystem: true, sortOrder: 1200 },
  { id: 'taxes_income', parentId: 'taxes', code: 'taxes_income', displayName: 'Income Tax', kind: 'expense', isSystem: true, sortOrder: 1201 },

  { id: 'insurance', parentId: null, code: 'insurance', displayName: 'Insurance', kind: 'expense', isSystem: true, sortOrder: 1300 },
  { id: 'insurance_auto', parentId: 'insurance', code: 'insurance_auto', displayName: 'Auto Insurance', kind: 'expense', isSystem: true, sortOrder: 1301 },
  { id: 'insurance_health', parentId: 'insurance', code: 'insurance_health', displayName: 'Health Insurance', kind: 'expense', isSystem: true, sortOrder: 1303 },

  { id: 'education', parentId: null, code: 'education', displayName: 'Education', kind: 'expense', isSystem: true, sortOrder: 1400 },
  { id: 'education_tuition', parentId: 'education', code: 'education_tuition', displayName: 'Tuition', kind: 'expense', isSystem: true, sortOrder: 1401 },

  { id: 'entertainment', parentId: null, code: 'entertainment', displayName: 'Entertainment', kind: 'expense', isSystem: true, sortOrder: 1500 },
  { id: 'entertainment_events', parentId: 'entertainment', code: 'entertainment_events', displayName: 'Events', kind: 'expense', isSystem: true, sortOrder: 1501 },

  { id: 'savings', parentId: null, code: 'savings', displayName: 'Savings', kind: 'transfer', isSystem: true, sortOrder: 1600 },
  { id: 'savings_emergency', parentId: 'savings', code: 'savings_emergency', displayName: 'Emergency Fund', kind: 'transfer', isSystem: true, sortOrder: 1601 },
  { id: 'savings_goals', parentId: 'savings', code: 'savings_goals', displayName: 'Goals', kind: 'transfer', isSystem: true, sortOrder: 1602 },

  { id: 'investments', parentId: null, code: 'investments', displayName: 'Investments', kind: 'transfer', isSystem: true, sortOrder: 1700 },
  { id: 'investments_brokerage', parentId: 'investments', code: 'investments_brokerage', displayName: 'Brokerage', kind: 'transfer', isSystem: true, sortOrder: 1701 },
  { id: 'investments_retirement', parentId: 'investments', code: 'investments_retirement', displayName: 'Retirement', kind: 'transfer', isSystem: true, sortOrder: 1702 },

  { id: 'transfers', parentId: null, code: 'transfers', displayName: 'Transfers', kind: 'transfer', isSystem: true, sortOrder: 1800 },
  { id: 'transfers_internal', parentId: 'transfers', code: 'transfers_internal', displayName: 'Internal Transfer', kind: 'transfer', isSystem: true, sortOrder: 1801 },
  { id: 'transfers_ath_movil', parentId: 'transfers', code: 'transfers_ath_movil', displayName: 'ATH Movil', kind: 'transfer', isSystem: true, sortOrder: 1802 },
  { id: 'transfers_card_payment', parentId: 'transfers', code: 'transfers_card_payment', displayName: 'Card Payment', kind: 'payment', isSystem: true, sortOrder: 1803 },

  { id: 'utilities', parentId: null, code: 'utilities', displayName: 'Utilities', kind: 'expense', isSystem: true, sortOrder: 1900 },
  { id: 'utilities_electricity', parentId: 'utilities', code: 'utilities_electricity', displayName: 'Electricity', kind: 'expense', isSystem: true, sortOrder: 1901 },
  { id: 'utilities_water', parentId: 'utilities', code: 'utilities_water', displayName: 'Water', kind: 'expense', isSystem: true, sortOrder: 1902 },
  { id: 'utilities_internet', parentId: 'utilities', code: 'utilities_internet', displayName: 'Internet', kind: 'expense', isSystem: true, sortOrder: 1903 },
  { id: 'utilities_phone', parentId: 'utilities', code: 'utilities_phone', displayName: 'Phone', kind: 'expense', isSystem: true, sortOrder: 1904 },

  { id: 'miscellaneous', parentId: null, code: 'miscellaneous', displayName: 'Miscellaneous', kind: 'expense', isSystem: true, sortOrder: 2000 },
  { id: 'miscellaneous_other', parentId: 'miscellaneous', code: 'miscellaneous_other', displayName: 'Other', kind: 'expense', isSystem: true, sortOrder: 2001 },
  { id: 'miscellaneous_uncategorized', parentId: 'miscellaneous', code: 'miscellaneous_uncategorized', displayName: 'Uncategorized', kind: 'expense', isSystem: true, sortOrder: 2002 },
] satisfies CanonicalCategory[]

function bySortOrder(a: CanonicalCategory, b: CanonicalCategory) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.displayName.localeCompare(b.displayName)
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

export function getSystemCategories() {
  return [...systemCategories].sort(bySortOrder)
}

export function getCategoryByCode(code: string) {
  const normalizedCode = normalizeSearch(code)
  return (
    systemCategories.find(
      (category) => category.code.toLowerCase() === normalizedCode
    ) || null
  )
}

export function getChildren(code: string) {
  const parent = getCategoryByCode(code)
  if (!parent) return []

  return systemCategories
    .filter((category) => category.parentId === parent.id)
    .sort(bySortOrder)
}

export function getParent(code: string) {
  const category = getCategoryByCode(code)
  if (!category?.parentId) return null

  return (
    systemCategories.find((candidate) => candidate.id === category.parentId) ||
    null
  )
}

export function searchCategories(query: string) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return getSystemCategories()

  return systemCategories
    .filter(
      (category) =>
        category.code.toLowerCase().includes(normalizedQuery) ||
        category.displayName.toLowerCase().includes(normalizedQuery)
    )
    .sort(bySortOrder)
}
