# Source of Truth

## Credit-card balances

1. Active linked Plaid account `current_balance`.
2. Manual `credit_cards.balance` only when no active linked Plaid balance exists.

Available credit follows the same rule: Plaid `available_balance`, then manual limit minus manual balance. Never sum linked manual and connected representations.

## Minimum payments

1. Plaid Liabilities `plaid_minimum_payment_amount`, when positive and available.
2. Linked manual card `minimum_payment`.
3. Linked recurring schedule amount.
4. Current Timeline payment instance amount.

Zero and null are treated as not configured; no percentage estimate is generated.

## Due dates

For a dated occurrence, `obligation_instances.effective_due_date`/the trusted payment occurrence is authoritative. Plaid’s next due date may enrich a card when no occurrence exists. A recurring schedule or manual card due day is a generation/configuration rule, not a substitute for an existing dated instance.

## Grace deadlines

`grace_until` or `grace_due_date` on the trusted occurrence is authoritative. Otherwise the deadline is generated from the obligation/schedule grace rule. Due date and grace deadline are two facts about one obligation, not two obligations.

Overdue status begins only after the applicable grace deadline. Financial Health, Cash Flow, and Timeline use the same effective deadline.

## Account spendability

- Active visible depository accounts are eligible when policy permits.
- Retirement and investment balances remain assets and contribute to Net Worth.
- Investment accounts contribute to usable cash only when explicitly `is_spendable = true`.
- Archived or hidden accounts are excluded from payment selectors and usable-cash totals.

## Confirmed spending

Confirmed spending comes from the confirmed `quick_entries` ledger. It excludes pending, superseded, removed, rejected, duplicate, transfer, debt-payment, and non-spending records according to canonical transaction type and lifecycle rules. Plaid staging rows awaiting Review Queue decisions do not count.

## Obligation status

The trusted lifecycle resolver combines instance state, dates, grace, manual confirmation, and reconciliation evidence. User-facing states are Programado, Próximo a vencer, Vencido, Pago detectado, Pagado esperando confirmación, Conciliado, and Cancelado.

## Payment reconciliation

1. A permanent existing reconciliation link is authoritative.
2. A manual confirmation creates/updates a `pending_settlement` link.
3. A unique confirmed transaction match at or above 90% may reconcile automatically.
4. Low-confidence or ambiguous candidates remain detected/reviewable and never auto-close.
5. Reconciliation events preserve the decision trail.

## Financial Health

Financial Health starts with usable cash and expected income, subtracts open actionable obligations, and excludes pending-settlement and reconciled obligations from unpaid risk. Its explanations and drill-down must enumerate the obligations behind each amount.

## Cash Flow

Cash Flow uses the shared liquidity summary and trusted payment collection. It subtracts only unpaid actionable commitments inside the horizon and does not subtract pending settlement, paid, reconciled, duplicate, or future-outside-horizon payments twice.

## Timeline

Timeline is a presentation of the same trusted payment and liquidity truth used by Dashboard and Cash Flow. It does not independently recalculate payment status. Calendar month and drill-down filters must survive opening and closing obligation details.

## Review Queue boundary

Review Queue is the decision boundary between imported/staged evidence and confirmed history. Categorization, financial-impact type, duplicate decision, owner, note, and planning-fund association are resolved before promotion to `quick_entries`.
