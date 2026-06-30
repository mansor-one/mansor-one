import { normalizeMerchantAlias } from './merchant-normalization'

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
  { id: 'food_fast_food', parentId: 'food', code: 'food_fast_food', displayName: 'Fast Food', kind: 'expense', isSystem: true, sortOrder: 104 },

  { id: 'transportation', parentId: null, code: 'transportation', displayName: 'Transportation', kind: 'expense', isSystem: true, sortOrder: 200 },
  { id: 'transportation_gas', parentId: 'transportation', code: 'transportation_gas', displayName: 'Gas', kind: 'expense', isSystem: true, sortOrder: 201 },
  { id: 'transportation_parking', parentId: 'transportation', code: 'transportation_parking', displayName: 'Parking', kind: 'expense', isSystem: true, sortOrder: 202 },
  { id: 'transportation_tolls', parentId: 'transportation', code: 'transportation_tolls', displayName: 'Tolls / AutoExpreso', kind: 'expense', isSystem: true, sortOrder: 203 },
  { id: 'transportation_vehicle_registration', parentId: 'transportation', code: 'transportation_vehicle_registration', displayName: 'Vehicle Registration', kind: 'expense', isSystem: true, sortOrder: 204 },
  { id: 'transportation_auto_maintenance', parentId: 'transportation', code: 'transportation_auto_maintenance', displayName: 'Auto Maintenance', kind: 'expense', isSystem: true, sortOrder: 205 },
  { id: 'transportation_car_wash', parentId: 'transportation', code: 'transportation_car_wash', displayName: 'Car Wash', kind: 'expense', isSystem: true, sortOrder: 206 },

  { id: 'housing', parentId: null, code: 'housing', displayName: 'Housing', kind: 'expense', isSystem: true, sortOrder: 300 },
  { id: 'housing_mortgage', parentId: 'housing', code: 'housing_mortgage', displayName: 'Mortgage', kind: 'expense', isSystem: true, sortOrder: 301 },
  { id: 'housing_repairs', parentId: 'housing', code: 'housing_repairs', displayName: 'Repairs', kind: 'expense', isSystem: true, sortOrder: 303 },

  { id: 'finance', parentId: null, code: 'finance', displayName: 'Finance', kind: 'expense', isSystem: true, sortOrder: 400 },
  { id: 'finance_bank_fees', parentId: 'finance', code: 'finance_bank_fees', displayName: 'Bank Fee', kind: 'expense', isSystem: true, sortOrder: 401 },
  { id: 'finance_interest', parentId: 'finance', code: 'finance_interest', displayName: 'Interest', kind: 'expense', isSystem: true, sortOrder: 402 },

  { id: 'health', parentId: null, code: 'health', displayName: 'Health', kind: 'expense', isSystem: true, sortOrder: 500 },
  { id: 'health_pharmacy', parentId: 'health', code: 'health_pharmacy', displayName: 'Pharmacy', kind: 'expense', isSystem: true, sortOrder: 501 },
  { id: 'health_medical', parentId: 'health', code: 'health_medical', displayName: 'Medical', kind: 'expense', isSystem: true, sortOrder: 502 },
  { id: 'health_dental', parentId: 'health', code: 'health_dental', displayName: 'Dental', kind: 'expense', isSystem: true, sortOrder: 503 },
  { id: 'health_beauty_personal_care', parentId: 'health', code: 'health_beauty_personal_care', displayName: 'Beauty & Personal Care', kind: 'expense', isSystem: true, sortOrder: 504 },

  { id: 'family', parentId: null, code: 'family', displayName: 'Family', kind: 'expense', isSystem: true, sortOrder: 600 },
  { id: 'family_andrea', parentId: 'family', code: 'family_andrea', displayName: 'Andrea', kind: 'expense', isSystem: true, sortOrder: 601 },
  { id: 'family_gaby', parentId: 'family', code: 'family_gaby', displayName: 'Gaby', kind: 'expense', isSystem: true, sortOrder: 602 },
  { id: 'family_soraya', parentId: 'family', code: 'family_soraya', displayName: 'Soraya', kind: 'expense', isSystem: true, sortOrder: 603 },

  { id: 'shopping', parentId: null, code: 'shopping', displayName: 'Shopping', kind: 'expense', isSystem: true, sortOrder: 700 },
  { id: 'shopping_home', parentId: 'shopping', code: 'shopping_home', displayName: 'Home Goods', kind: 'expense', isSystem: true, sortOrder: 701 },
  { id: 'shopping_clothing', parentId: 'shopping', code: 'shopping_clothing', displayName: 'Clothing', kind: 'expense', isSystem: true, sortOrder: 702 },
  { id: 'shopping_general', parentId: 'shopping', code: 'shopping_general', displayName: 'General Shopping', kind: 'expense', isSystem: true, sortOrder: 703 },
  { id: 'shopping_gifts', parentId: 'shopping', code: 'shopping_gifts', displayName: 'Gifts', kind: 'expense', isSystem: true, sortOrder: 704 },

  { id: 'software', parentId: null, code: 'software', displayName: 'Software', kind: 'expense', isSystem: true, sortOrder: 800 },
  { id: 'software_tools', parentId: 'software', code: 'software_tools', displayName: 'Tools', kind: 'expense', isSystem: true, sortOrder: 801 },

  { id: 'subscriptions', parentId: null, code: 'subscriptions', displayName: 'Subscriptions', kind: 'expense', isSystem: true, sortOrder: 900 },

  { id: 'travel', parentId: null, code: 'travel', displayName: 'Travel', kind: 'expense', isSystem: true, sortOrder: 1000 },
  { id: 'travel_flights', parentId: 'travel', code: 'travel_flights', displayName: 'Flights', kind: 'expense', isSystem: true, sortOrder: 1001 },

  { id: 'income', parentId: null, code: 'income', displayName: 'Income', kind: 'income', isSystem: true, sortOrder: 1100 },
  { id: 'income_salary', parentId: 'income', code: 'income_salary', displayName: 'Salary', kind: 'income', isSystem: true, sortOrder: 1101 },
  { id: 'income_bonus', parentId: 'income', code: 'income_bonus', displayName: 'Bonus', kind: 'income', isSystem: true, sortOrder: 1102 },
  { id: 'income_deposit', parentId: 'income', code: 'income_deposit', displayName: 'Deposit', kind: 'income', isSystem: true, sortOrder: 1103 },
  { id: 'income_refund', parentId: 'income', code: 'income_refund', displayName: 'Refund', kind: 'income', isSystem: true, sortOrder: 1104 },
  { id: 'income_reimbursement', parentId: 'income', code: 'income_reimbursement', displayName: 'Reimbursement', kind: 'income', isSystem: true, sortOrder: 1105 },
  { id: 'income_interest', parentId: 'income', code: 'income_interest', displayName: 'Interest Income', kind: 'income', isSystem: true, sortOrder: 1106 },

  { id: 'taxes', parentId: null, code: 'taxes', displayName: 'Taxes', kind: 'expense', isSystem: true, sortOrder: 1200 },
  { id: 'taxes_income', parentId: 'taxes', code: 'taxes_income', displayName: 'Income Tax', kind: 'expense', isSystem: true, sortOrder: 1201 },

  { id: 'insurance', parentId: null, code: 'insurance', displayName: 'Insurance', kind: 'expense', isSystem: true, sortOrder: 1300 },
  { id: 'insurance_auto', parentId: 'insurance', code: 'insurance_auto', displayName: 'Auto Insurance', kind: 'expense', isSystem: true, sortOrder: 1301 },
  { id: 'insurance_health', parentId: 'insurance', code: 'insurance_health', displayName: 'Health Insurance', kind: 'expense', isSystem: true, sortOrder: 1303 },

  { id: 'education', parentId: null, code: 'education', displayName: 'Education', kind: 'expense', isSystem: true, sortOrder: 1400 },
  { id: 'education_tuition', parentId: 'education', code: 'education_tuition', displayName: 'Tuition', kind: 'expense', isSystem: true, sortOrder: 1401 },
  { id: 'education_school', parentId: 'education', code: 'education_school', displayName: 'School / Education', kind: 'expense', isSystem: true, sortOrder: 1402 },
  { id: 'education_tutoring', parentId: 'education', code: 'education_tutoring', displayName: 'Tutoring', kind: 'expense', isSystem: true, sortOrder: 1403 },
  { id: 'education_books_supplies', parentId: 'education', code: 'education_books_supplies', displayName: 'Books & Supplies', kind: 'expense', isSystem: true, sortOrder: 1404 },

  { id: 'entertainment', parentId: null, code: 'entertainment', displayName: 'Entertainment', kind: 'expense', isSystem: true, sortOrder: 1500 },
  { id: 'entertainment_events', parentId: 'entertainment', code: 'entertainment_events', displayName: 'Events', kind: 'expense', isSystem: true, sortOrder: 1501 },
  { id: 'entertainment_streaming', parentId: 'entertainment', code: 'entertainment_streaming', displayName: 'Streaming', kind: 'expense', isSystem: true, sortOrder: 1502 },

  { id: 'savings', parentId: null, code: 'savings', displayName: 'Savings', kind: 'transfer', isSystem: true, sortOrder: 1600 },
  { id: 'savings_emergency', parentId: 'savings', code: 'savings_emergency', displayName: 'Emergency Fund', kind: 'transfer', isSystem: true, sortOrder: 1601 },
  { id: 'savings_goals', parentId: 'savings', code: 'savings_goals', displayName: 'Goals', kind: 'transfer', isSystem: true, sortOrder: 1602 },

  { id: 'investments', parentId: null, code: 'investments', displayName: 'Investments', kind: 'transfer', isSystem: true, sortOrder: 1700 },
  { id: 'investments_brokerage', parentId: 'investments', code: 'investments_brokerage', displayName: 'Brokerage', kind: 'transfer', isSystem: true, sortOrder: 1701 },
  { id: 'investments_retirement', parentId: 'investments', code: 'investments_retirement', displayName: 'Retirement', kind: 'transfer', isSystem: true, sortOrder: 1702 },

  { id: 'transfers', parentId: null, code: 'transfers', displayName: 'Transfers', kind: 'transfer', isSystem: true, sortOrder: 1800 },
  { id: 'transfers_internal', parentId: 'transfers', code: 'transfers_internal', displayName: 'Internal Transfer', kind: 'transfer', isSystem: true, sortOrder: 1801 },
  { id: 'transfers_ath_movil', parentId: 'transfers', code: 'transfers_ath_movil', displayName: 'ATH Movil', kind: 'transfer', isSystem: true, sortOrder: 1802 },
  { id: 'transfers_card_payment', parentId: 'transfers', code: 'transfers_card_payment', displayName: 'Credit Card Payment', kind: 'payment', isSystem: true, sortOrder: 1803 },
  { id: 'transfers_person', parentId: 'transfers', code: 'transfers_person', displayName: 'Person Transfer', kind: 'transfer', isSystem: true, sortOrder: 1804 },
  { id: 'transfers_loan_payment', parentId: 'transfers', code: 'transfers_loan_payment', displayName: 'Loan Payment', kind: 'payment', isSystem: true, sortOrder: 1805 },
  { id: 'transfers_savings', parentId: 'transfers', code: 'transfers_savings', displayName: 'Savings Transfer', kind: 'transfer', isSystem: true, sortOrder: 1806 },

  { id: 'utilities', parentId: null, code: 'utilities', displayName: 'Utilities', kind: 'expense', isSystem: true, sortOrder: 1900 },
  { id: 'utilities_electricity', parentId: 'utilities', code: 'utilities_electricity', displayName: 'Electricity', kind: 'expense', isSystem: true, sortOrder: 1901 },
  { id: 'utilities_water', parentId: 'utilities', code: 'utilities_water', displayName: 'Water', kind: 'expense', isSystem: true, sortOrder: 1902 },
  { id: 'utilities_internet', parentId: 'utilities', code: 'utilities_internet', displayName: 'Internet', kind: 'expense', isSystem: true, sortOrder: 1903 },
  { id: 'utilities_phone', parentId: 'utilities', code: 'utilities_phone', displayName: 'Phone', kind: 'expense', isSystem: true, sortOrder: 1904 },

  { id: 'debt', parentId: null, code: 'debt', displayName: 'Debt / Payment', kind: 'payment', isSystem: true, sortOrder: 1950 },
  { id: 'debt_auto_loan', parentId: 'debt', code: 'debt_auto_loan', displayName: 'Auto Loan', kind: 'payment', isSystem: true, sortOrder: 1951 },
  { id: 'debt_credit_card_payment', parentId: 'debt', code: 'debt_credit_card_payment', displayName: 'Credit Card Payment', kind: 'payment', isSystem: true, sortOrder: 1952 },
  { id: 'debt_personal_loan', parentId: 'debt', code: 'debt_personal_loan', displayName: 'Personal Loan', kind: 'payment', isSystem: true, sortOrder: 1953 },
  { id: 'debt_insurance', parentId: 'debt', code: 'debt_insurance', displayName: 'Insurance', kind: 'payment', isSystem: true, sortOrder: 1954 },
  { id: 'debt_tax_planilla', parentId: 'debt', code: 'debt_tax_planilla', displayName: 'Tax / Planilla', kind: 'payment', isSystem: true, sortOrder: 1955 },

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

export function normalizeCategoryText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
}

const categoryAliases: Record<string, string> = {
  auto: 'transportation',
  'auto maintenance': 'transportation_auto_maintenance',
  autoexpreso: 'transportation_tolls',
  barber: 'health_beauty_personal_care',
  barberia: 'health_beauty_personal_care',
  belleza: 'health_beauty_personal_care',
  beauty: 'health_beauty_personal_care',
  'beauty and personal care': 'health_beauty_personal_care',
  'bank fee': 'finance_bank_fees',
  'bank fees': 'finance_bank_fees',
  books: 'education_books_supplies',
  'books and supplies': 'education_books_supplies',
  cafeteria: 'food_work_cafeteria',
  'cafeteria trabajo': 'food_work_cafeteria',
  'car wash': 'transportation_car_wash',
  carro: 'transportation',
  casa: 'housing',
  cesco: 'transportation_vehicle_registration',
  colegio: 'education',
  comida: 'food',
  'comida fuera': 'food_restaurants',
  'credit card': 'transfers_card_payment',
  'credit card payment': 'transfers_card_payment',
  'credit card payments': 'transfers_card_payment',
  dental: 'health_dental',
  deposit: 'income_deposit',
  deposits: 'income_deposit',
  dmv: 'transportation_vehicle_registration',
  entretenimiento: 'entertainment',
  farmacia: 'health_pharmacy',
  'fast food': 'food_fast_food',
  fastfood: 'food_fast_food',
  fee: 'finance_bank_fees',
  food: 'food',
  gifts: 'shopping_gifts',
  goals: 'savings_goals',
  gasolina: 'transportation_gas',
  gas: 'transportation_gas',
  groceries: 'food_groceries',
  health: 'health',
  ingreso: 'income',
  'interest income': 'income_interest',
  insurance: 'insurance',
  'internal transfer': 'transfers_internal',
  lab: 'health_medical',
  laboratorio: 'health_medical',
  loan: 'transfers_loan_payment',
  'loan payment': 'transfers_loan_payment',
  marbet: 'transportation_vehicle_registration',
  marbete: 'transportation_vehicle_registration',
  medical: 'health_medical',
  nails: 'health_beauty_personal_care',
  'online payment': 'transfers_card_payment',
  otros: 'miscellaneous_other',
  parking: 'transportation_parking',
  'pago de tarjeta': 'transfers_card_payment',
  peajes: 'transportation_tolls',
  'person transfer': 'transfers_person',
  'personal care': 'health_beauty_personal_care',
  pharmacy: 'health_pharmacy',
  reimbursement: 'income_reimbursement',
  refund: 'income_refund',
  refunds: 'income_refund',
  restaurantes: 'food_restaurants',
  restaurants: 'food_restaurants',
  salary: 'income_salary',
  salon: 'health_beauty_personal_care',
  savings: 'transfers_savings',
  'savings transfer': 'transfers_savings',
  salud: 'health',
  school: 'education_school',
  'school education': 'education_school',
  shopping: 'shopping',
  clothing: 'shopping_clothing',
  clothes: 'shopping_clothing',
  ropa: 'shopping_clothing',
  spa: 'health_beauty_personal_care',
  streaming: 'entertainment_streaming',
  supermercado: 'food_groceries',
  supermarket: 'food_groceries',
  supplies: 'education_books_supplies',
  subscriptions: 'subscriptions',
  suscripciones: 'subscriptions',
  tolls: 'transportation_tolls',
  tutoring: 'education_tutoring',
  tutoria: 'education_tutoring',
  tutorias: 'education_tutoring',
  transferencia: 'transfers_internal',
  transfer: 'transfers_internal',
  travel: 'travel',
  unas: 'health_beauty_personal_care',
  utilities: 'utilities',
  'vehicle registration': 'transportation_vehicle_registration',
}

const commonMerchantCategoryDefaults: Array<{
  patterns: string[]
  canonicalCategoryCode: string
}> = [
  { patterns: ['STARBUCKS'], canonicalCategoryCode: 'food_restaurants' },
  {
    patterns: ['MCDONALDS', 'MC DONALDS', 'BURGER KING', "CHURCH'S", 'PAPA JOHNS', "PAPA JOHN'S"],
    canonicalCategoryCode: 'food_fast_food',
  },
  { patterns: ['ICHIBAN'], canonicalCategoryCode: 'food_restaurants' },
  { patterns: ['COOP LARES'], canonicalCategoryCode: 'transfers_loan_payment' },
  { patterns: ['WALGREENS', 'CVS', 'PHARMACY', 'FARMACIA'], canonicalCategoryCode: 'health_pharmacy' },
  { patterns: ['COSTCO', 'WALMART', 'ECONO'], canonicalCategoryCode: 'food_groceries' },
  { patterns: ['OPENAI', 'APPLE', 'NINTENDO'], canonicalCategoryCode: 'subscriptions' },
  { patterns: ['AMAZON PRIME VIDEO'], canonicalCategoryCode: 'entertainment_streaming' },
  { patterns: ['CARIBBEAN CINEMAS'], canonicalCategoryCode: 'entertainment' },
  { patterns: ['MSC CRUISES', 'MSC CRUISE'], canonicalCategoryCode: 'travel' },
  { patterns: ['CESCO', 'MARBETE', 'MARBET'], canonicalCategoryCode: 'transportation_vehicle_registration' },
  { patterns: ['AUTOEXPRESO'], canonicalCategoryCode: 'transportation_tolls' },
]

export function canonicalCategoryCodeForText(
  value: string | null | undefined
) {
  const normalized = normalizeCategoryText(value)

  if (
    !normalized ||
    normalized === 'revisar' ||
    normalized === 'uncategorized' ||
    normalized === 'sin categoria'
  ) {
    return null
  }

  const directCategory = systemCategories.find(
    (category) =>
      category.code.toLowerCase() === normalized ||
      category.id.toLowerCase() === normalized ||
      normalizeCategoryText(category.code) === normalized ||
      normalizeCategoryText(category.id) === normalized ||
      normalizeCategoryText(category.displayName) === normalized
  )
  if (directCategory) return directCategory.code

  return categoryAliases[normalized] || null
}

export function commonMerchantDefaultCategoryCode(
  merchantName: string | null | undefined
) {
  const normalizedMerchant = normalizeMerchantAlias(merchantName)
  if (!normalizedMerchant) return null

  return (
    commonMerchantCategoryDefaults.find((defaultCategory) =>
      defaultCategory.patterns.some((pattern) =>
        normalizedMerchant.includes(pattern)
      )
    )?.canonicalCategoryCode || null
  )
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
