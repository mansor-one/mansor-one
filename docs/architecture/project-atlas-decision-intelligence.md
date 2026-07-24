# Project Atlas: Decision Intelligence Architecture

Last updated: 2026-07-02

## Purpose

Project Atlas is the long-term vision for Mansor One as a decision intelligence
system.

Mansor One is no longer only a financial tracker. Its primary mission is:

> Help Manuel and Soraya make the best possible financial decision every day
> using all available information.

Atlas moves Mansor One from showing data to recommending actions. The system
should explain options, compare tradeoffs, identify risks and recommend the
safest strategy before Manuel or Soraya acts.

## ADR: Atlas Becomes The Decision Intelligence Layer

Status: accepted as long-term direction.

### Context

Mansor One already has core financial domains:

- Financial Engine
- Review Queue
- Planning
- Timeline
- Obligations
- Cards
- Plaid
- Robototina

These surfaces can show balances, obligations, payment lifecycle state,
planning pressure and transactions that need review. That is necessary, but it
is not the final product mission.

The household now needs a system that can answer practical financial questions:

- Should this payment happen today, on due date or during grace?
- Can Soraya front money temporarily?
- Should Manuel reimburse later?
- Does Vec Solutions cash belong to the household yet?
- What changes if GoGo pays tomorrow?
- What breaks if Marta delays one week?
- Is it safer to preserve cash, pay debt or fund a planning priority?

### Decision

Mansor One will introduce Atlas as the long-term decision intelligence
architecture.

Atlas sits above the Financial Engine and introduces the Household Engine as
the reasoning layer that understands people, entities, ownership,
availability, purpose, transfers, reimbursements and business boundaries.

The Financial Engine remains the source of financial truth. Atlas does not
replace it. Atlas consumes trusted engine outputs and turns them into
scenarios, options, recommendations and Robototina explanations.

### Consequences

- Pages remain windows, not independent decision models.
- Robototina becomes the daily decision companion, not a generic chat surface.
- Household and business ownership must become first-class domain data.
- Business income belongs to Vec Solutions first and only becomes household
  cash after a transfer, salary, distribution or reimbursement.
- Recommendations must show options, pros, cons, risks and a safest path.
- Atlas must ask for confirmation before using uncertain, pending or
  restricted money in recommendations.

## Vision Document

Atlas should make Mansor One feel like a household financial operating partner.

The system should know what is true, what is uncertain, what is available, what
is reserved and what is risky. Then it should help Manuel and Soraya choose.

The target experience is:

- Dashboard shows the current state and the next decision.
- Timeline shows timing and cash pressure.
- Planning shows priorities and funding tradeoffs.
- Review Queue protects the ledger from uncertain imports.
- Robototina explains what matters and recommends what to do.
- Scenarios let Manuel and Soraya test decisions before committing.

Atlas should not merely say:

```text
You have bills.
```

It should say:

```text
Option A: Pay Toyota today.
Pros: removes the obligation early.
Cons: lowers household cushion before payday.
Risk: medium.

Option B: Pay Toyota on the due date.
Pros: preserves cash now and stays on time.
Cons: requires remembering the payment.
Risk: low.

Option C: Use grace period.
Pros: maximizes cash cushion.
Cons: higher timing risk if posting is delayed.
Risk: medium.

Safest recommendation: pay on the due date, not today and not at the end of
grace.
```

## High-Level Architecture

```text
Data Sources
  Plaid
  Manual entries
  Manual accounts
  Cards
  Obligations
  Planning
  Business/client context
  Review Queue
        |
        v
Financial Engine
  Portfolio
  Liquidity
  Payment Lifecycle
  Planning
  Goals
  Ledger Summary
  Review Queue
  Financial Summary
        |
        v
Household Engine
  People
  Household
  Vec Solutions
  Ownership
  Availability
  Purpose
  Transfers
  Reimbursements
  Business restrictions
        |
        v
Atlas Decision Layer
  Scenario Engine
  Business Engine
  Recommendation Engine
  Learning Engine
  Risk Scoring
        |
        v
Robototina
  Options
  Tradeoffs
  Safest recommendation
  Clarifying questions
  Approval-gated actions
```

## Core Concepts

Atlas must permanently separate four concepts.

### Owner

Who owns the money, obligation or decision.

Supported owners:

- Manuel
- Soraya
- Andrea
- Household
- Vec Solutions
- Unknown

### Availability

Whether money can be used today.

Examples:

- household available
- business restricted
- reserved for purpose
- pending
- stale
- historical
- unknown

### Purpose

What money is already intended for.

Examples:

- house
- Honda
- Toyota
- school
- planning
- taxes
- emergency fund
- vacation
- business operations
- girls' bedrooms
- back to school

### Counterparty

Who paid, received, owes or is the customer.

Examples:

- GoGo
- Marta
- Ulises as GoGo contact
- Amazon
- Banco Popular
- LUMA
- AAA
- FirstBank
- service providers

## Household Engine Architecture

The Household Engine is the reasoning layer above the Financial Engine.

It should understand:

- Manuel, Soraya and Andrea are household members.
- Household is the shared family entity.
- Vec Solutions is a business entity related to the household, but not the
  same as household cash.
- FirstBank Soraya daily-use checking/current account belongs to Soraya and
  counts toward household available cash.
- FirstBank Vec Solutions pocket/account belongs to Vec Solutions and does not
  count toward household available cash.
- Cooperativa is a manual/historical Soraya account with a current balance
  policy until replaced by FirstBank Soraya.
- Honda belongs to Soraya.
- Toyota belongs to Manuel.
- Mortgage, utilities, grama, fumigador and shared household services belong to
  Household unless explicitly assigned otherwise.
- Business income belongs to Vec Solutions first.

The Household Engine should produce a normalized context object for Atlas:

```text
owners
accounts by owner
availability by account
obligations by owner
planning priorities
reserved funds
business cash
household cash
pending reimbursements
pending client receivables
restricted money
unknowns requiring review
```

## Business Engine Architecture

The Business Engine models Vec Solutions.

It should support:

- business entity: Vec Solutions
- clients: GoGo, Marta and future clients
- contacts: Ulises for GoGo
- invoices or expected payments
- pending receivables
- cleared receivables
- gross income
- withheld or removed amount
- net income
- business operating cash
- salary assignments
- owner distributions
- reimbursements between business and household

Business rule:

Business income belongs to Vec Solutions first. It should not immediately be
treated as household cash.

Example:

```text
GoGo pays Vec Solutions.
The deposit enters the Vec Solutions pocket.
Household Disponible Hoy does not increase.

Soraya assigns herself salary or distribution.
Money transfers from Vec Solutions pocket to Soraya daily-use account.
Household Disponible Hoy increases.
The transfer is not new external income.
```

## Scenario Engine Architecture

The Scenario Engine simulates possible futures without changing real data.

Scenario inputs:

- payment date changes
- grace period usage
- expected income changes
- client delay
- temporary household advance
- reimbursement date
- new expense
- salary change
- bonus received
- new client
- lost client
- planning priority change
- business distribution

Scenario outputs:

- projected household cash
- projected business cash
- obligation risk
- card risk
- emergency fund impact
- planning impact
- reimbursement impact
- confidence
- assumptions
- safest recommendation

Required scenario examples:

- Use Soraya money temporarily.
- Manuel reimburses July 20.
- GoGo pays Friday.
- Marta delays one week.
- Unexpected medical expense.
- Unexpected car repair.
- Vacation added.
- Bonus received.
- Salary changes.
- New client.
- Lost client.

## Decision Engine Architecture

The Decision Engine turns interpreted state into decisions.

It should not calculate balances directly. It should consume Financial Engine
and Household Engine outputs.

Decision inputs:

- available household cash
- restricted business cash
- due dates
- grace dates
- payment lifecycle state
- planning priorities
- income confidence
- Review Queue confidence
- reimbursement obligations
- historical behavior
- current risk tolerance

Decision outputs:

- decision question
- ranked options
- pros
- cons
- risks
- required assumptions
- confidence
- recommended safest option
- what needs Manuel/Soraya approval

The Decision Engine should support questions such as:

- Can Manuel temporarily use Soraya's money?
- Should Honda wait until Soraya gets paid?
- Can US Bank safely be paid after payday without interest?
- Should Toyota be paid on due date or grace date?
- Is it better to preserve emergency funds?
- Should money remain inside Vec Solutions?
- Would paying Popular first improve liquidity?
- If GoGo pays tomorrow, what changes?
- If Marta delays payment one week, what changes?
- Should Soraya assign herself salary this week?
- Is there a safer strategy?

## Recommendation Engine

The Recommendation Engine converts decisions into user-facing options.

Every recommendation should include:

- Option A
- Option B
- Option C when useful
- pros
- cons
- risk
- confidence
- assumptions
- safest recommendation
- what action is required

Recommendation ranking should favor:

- avoiding late fees and interest
- preserving household cash runway
- preserving emergency funds
- respecting business/household separation
- reducing risk from stale or pending balances
- honoring planning priorities
- avoiding double-counted income
- avoiding irreversible actions

Atlas should prefer safe, boring, resilient choices over aggressive
optimization.

## Learning Engine

The Learning Engine should remember confirmed behavior and preferences.

It can learn from:

- confirmed ledger entries
- explicit Review Queue decisions
- confirmed category changes
- confirmed owner/entity assignments
- repeated payment decisions
- repeated reimbursement behavior
- planning priority changes
- confirmed business income events

It should learn:

- recurring merchants
- preferred payment strategies
- risk tolerance
- typical reimbursement behavior
- preferred order of paying obligations
- historical household decisions
- preferred planning priorities
- business cash habits
- posting delays
- income reliability

It must not learn truth from raw Plaid imports, unconfirmed Review Queue items
or speculative scenarios.

## Knowledge Robototina Needs

Robototina needs:

- household members
- business entities
- clients and contacts
- account owner
- account availability
- account purpose
- obligation owner
- obligation due date
- grace until date
- payment status
- posting delay expectations
- income owner/entity
- income gross amount
- income net amount
- withheld amount or percentage
- pending receivables
- transfers
- temporary advances
- reimbursements
- business distributions
- salary assignments
- planning priorities
- reserved funds
- emergency fund policy
- Review Queue confidence
- historical spending behavior
- historical decision behavior

## Knowledge Robototina Should Never Infer Alone

Robototina should not infer without confirmation:

- Vec Solutions cash can be used for household expenses.
- A business deposit is household income.
- A transfer is external income.
- Soraya agreed to front money.
- Manuel agreed to reimburse by a specific date.
- GoGo or Marta money has cleared.
- A pending Plaid transaction is confirmed history.
- A Review Queue duplicate is truly the same transaction.
- Emergency funds should be spent.
- A grace period makes a payment harmless to delay.
- Account owner from account name alone.
- A client contact is the payer entity.

## Roadmap

### Phase 0: Documentation And Alignment

- Define Atlas as the long-term decision intelligence vision.
- Keep Financial Engine as source of financial truth.
- Define Household Engine as the reasoning layer.
- Preserve existing architecture until implementation phases are approved.

### Phase 1: Deterministic Foundations

- Make owner/entity/account availability explicit.
- Ensure Disponible Hoy understands household vs business cash.
- Ensure Review Queue shows owner/account/entity confidence.
- Keep recommendations rule-based and explainable.

### Phase 2: Household And Business Model

- Add durable household members and financial entities.
- Model Vec Solutions separately from household cash.
- Model GoGo, Marta and client contacts.
- Model gross/net/withheld business income.
- Model account replacement for Cooperativa and FirstBank Soraya.

### Phase 3: Transfer And Reimbursement Intelligence

- Model internal transfers.
- Model temporary advances.
- Model Manuel/Soraya reimbursements.
- Model Vec Solutions distributions and salary assignments.
- Prevent double-counting of money crossing entities.

### Phase 4: Scenario Planner

- Add read-only scenario simulations.
- Compare payment timing, grace usage, client delays, income changes and
  planning priority changes.
- Show projected cash and risk under each option.

### Phase 5: Recommendation Engine

- Produce ranked options with pros, cons and risk.
- Always recommend the safest strategy.
- Ask for approval before treating uncertain or restricted money as usable.

### Phase 6: Learning Engine

- Learn from confirmed choices and ledger history.
- Remember household preferences.
- Detect repeated payment strategies and reimbursement behavior.
- Improve recommendations without hiding assumptions.

### Phase 7: Approval-Gated Actions

- Prepare suggested actions.
- Draft planning changes.
- Draft reminders.
- Draft transfer/reimbursement plans.
- Require explicit Manuel/Soraya confirmation before any write or action.

## Long-Term Milestones

### Milestone 1: Atlas Readiness

Atlas documentation is accepted, existing engines remain stable and all future
decision work uses the same vocabulary: owner, availability, purpose and
counterparty.

### Milestone 2: Household-Aware Cash

Disponible Hoy can explain exactly which accounts are included, why they are
included, who owns them and whether each balance is fresh.

### Milestone 3: Business Separation

Vec Solutions income and cash are tracked separately from household cash.
Business deposits do not inflate household availability.

### Milestone 4: Scenario Preview

Robototina can answer "what changes if..." questions without writing data.

### Milestone 5: Daily Decision Briefing

Robototina gives Manuel and Soraya the most important decision of the day, the
safest option and the risk of alternatives.

### Milestone 6: Learning Memory

Robototina remembers confirmed household decisions, recurring preferences and
typical behavior while keeping raw imports out of durable truth.

### Milestone 7: Controlled Execution

Mansor One can prepare actions, but still requires explicit approval before
changing financial records or triggering external effects.

## Deferred Features

These are important, but not first.

- Autonomous bill payment.
- Bank transfer initiation.
- Full invoice management.
- Full business accounting.
- Tax filing automation.
- Payroll automation.
- Multi-household support.
- Multi-business support.
- External accountant portal.
- Formal credit optimization engine.
- Automated investment management.
- OCR bill parsing.
- Gmail-driven automatic ledger writes.
- Predictive AI without deterministic guardrails.

## Out Of Scope

Atlas should not:

- Move money.
- Pay bills automatically.
- Create confirmed ledger entries without review.
- Treat Plaid imports as confirmed financial history.
- Replace a CPA, attorney, banker or financial advisor.
- Optimize for aggressive returns.
- Mix Vec Solutions money with household money.
- Use business cash for household recommendations unless a transfer,
  distribution, salary assignment or reimbursement is explicitly modeled.
- Hide assumptions behind AI language.
- Create irreversible actions from a chat response.

## Dependencies

Atlas depends on:

- Financial Engine as source of calculations.
- Payment Lifecycle as shared payment state.
- Review Queue as ingestion gate.
- Ledger Summary as normalized movement view.
- Account Resolver for account identity.
- Household ownership model.
- Business/client model.
- Planning priorities.
- Goal Engine for goal balances.
- Merchant Knowledge for recurring behavior.
- Category System for financial meaning.
- Financial Reconciliation for payment confirmation.
- RLS and authenticated owner-scoped data access.

Atlas also depends on product discipline:

- no duplicated calculations in pages
- no unreviewed writes from AI
- no hidden business/household mixing
- no learning from unconfirmed candidates as truth

## Success Criteria

Atlas is successful when Mansor One can reliably answer:

- What money is available today?
- Whose money is it?
- What money is reserved?
- What money is business-restricted?
- What payments are urgent?
- Which payments can safely wait?
- What happens if expected income is delayed?
- What happens if a client pays early?
- Can Soraya front money temporarily?
- What should Manuel reimburse and when?
- Should Vec Solutions distribute cash or keep it inside the business?
- Which planning priority should be funded next?
- What is the safest action today?

Measurable success criteria:

- Dashboard and Robototina agree on cash and lifecycle numbers.
- Disponible Hoy can explain included and excluded accounts.
- Review Queue shows owner/entity/account confidence before promotion.
- Vec Solutions deposits do not count as household cash.
- Transfers from Vec Solutions to Soraya are not double-counted as external
  income.
- Scenario results list assumptions and do not mutate real data.
- Recommendations include options, pros, cons, risk and a safest path.
- Robototina asks for confirmation before using pending or restricted money.
- Historical decisions improve future recommendations only after confirmation.

## Concrete Decisions Atlas Enables

Atlas should eventually let Robototina answer practical questions that today's
Mansor One cannot answer safely:

- Pay Toyota today, on due date or during grace?
- Let Honda wait until Soraya gets paid?
- Use Soraya's money temporarily and track Manuel's reimbursement?
- Treat GoGo money as business cash or household cash?
- Decide whether Marta's delay creates a household cash problem.
- Decide whether Vec Solutions should keep operating cash or distribute salary.
- Decide whether Popular or US Bank should be paid first.
- Decide whether girls' bedrooms can be funded before back to school.
- Decide whether emergency funds should be preserved this week.
- Decide whether a card can be paid after payday without interest or late risk.

This is the intended Atlas shift: from reporting facts to helping Manuel and
Soraya choose the safest real-world action.
