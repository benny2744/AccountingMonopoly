# PRD: Accounting Monopoly Classroom Game

## 1. Product Summary

Build a browser-based multiplayer classroom game inspired by Monopoly, designed to teach beginner accounting concepts through property ownership, rent payments, event cards, journal entries, T-accounts, and financial statements.

The game should support two difficulty modes:

1. **Cash Basis Mode**
   Students record revenue and expenses only when cash changes hands.

2. **Accrual Basis Mode**
   Students record simple timing differences, including player-to-player credit, accounts receivable, accounts payable, prepaid services, and year-end settlement.

The first version should be a **LAN-friendly web app** with a teacher dashboard, student/team dashboards, shared board state, accounting entry validation, T-account views, and automatic financial statement generation.

The app should prioritize accounting clarity over visual polish. Board animations and advanced Monopoly mechanics are secondary.

---

# 2. Recommended Tech Stack

Use a standard web app stack, not a game engine.

## Recommended MVP Stack

### Frontend

* React + Vite + TypeScript
* Basic CSS or Tailwind
* Zustand or React Context for client-side state
* Socket.IO client for live updates

### Backend

* Node.js + Express + TypeScript
* Socket.IO for multiplayer rooms
* SQLite for persistence
* Drizzle ORM or Prisma; use whichever is faster to implement reliably
* Zod for validation

### Deployment

* Runs on a local school server or teacher laptop
* Students join by LAN IP and room code
* No external login required for MVP

Example local access:

```txt
Teacher opens: http://10.0.5.137:5000
Students join: http://10.0.5.137:5000/join
```

---

# 3. Core Product Goals

## Primary Goal

Help high school students understand how business transactions become accounting records and financial statements.

## Learning Objectives

Students should be able to:

1. Identify whether an event is revenue, expense, asset, liability, or equity.
2. Choose correct debit and credit accounts for basic transactions.
3. Understand how rent payments affect both payer and receiver.
4. Understand the difference between cash basis and accrual basis accounting.
5. Read simple T-accounts.
6. Understand how journal entries feed into financial statements.
7. Compare cash, profit, assets, liabilities, and equity.
8. In accrual mode, understand:

   * Accounts receivable
   * Accounts payable
   * Prepaid services
   * Credit settlement
   * Loan rollover

---

# 4. Design Principles

## 4.1 Server-authoritative game state

The backend must be the source of truth.

Do not allow clients to independently decide official game outcomes. Clients may request actions, but the server validates and applies them.

## 4.2 Event-sourced structure

The system should store game actions as events.

Example:

```txt
Player A landed on Player B's property and owed $100 rent.
Player A paid cash.
Player A submitted journal entry.
System validated journal entry.
Ledger posted entry.
```

This makes it easier to reconstruct the game, audit entries, export reports, and debug student mistakes.

## 4.3 Separate game events from accounting entries

A game event is what happened in the game.

An accounting entry is how it is recorded.

Example game event:

```txt
Team Red lands on Team Blue's property and owes $120 rent.
```

Accounting entries in cash basis:

Team Red:

```txt
Dr Rent Expense 120
Cr Cash 120
```

Team Blue:

```txt
Dr Cash 120
Cr Rent Revenue 120
```

This separation is essential.

## 4.4 Keep MVP simple

Do not implement the following in the first version:

* Auctions
* Houses/hotels
* Complex mortgages
* Depreciation
* Bad debt
* Inventory
* Taxes
* Trading properties
* AI opponent
* Full authentication
* Advanced animations
* Real Monopoly board replication

---

# 5. User Roles

## 5.1 Teacher

The teacher can:

* Create a game room
* Choose difficulty mode
* Set property allocation percentage
* Set number of teams
* Start game
* Pause/resume game
* Advance turn manually if needed
* View all teams’ ledgers
* View all teams’ financial statements
* Reveal correct journal entries
* Override or correct student entries
* Trigger year-end manually
* End game
* Export game summary

## 5.2 Student / Team

Students can:

* Join a game room
* Select or be assigned a team
* View their team dashboard
* Roll dice when it is their turn
* Resolve property and event transactions
* Choose payment method where allowed
* Submit journal entries
* View their journal, T-accounts, and statements
* View required year-end tasks

## 5.3 Shared Display

A projected/shared display can show:

* Board
* Current turn
* Current player/team
* Recent transactions
* Event card drawn
* Leaderboard
* Year-end summaries

---

# 6. Game Modes

## 6.1 Cash Basis Mode

### Core Rule

Record revenue when cash is received.
Record expenses when cash is paid.

### Enabled Concepts

* Cash
* Property
* Rent revenue
* Rent expense
* Event revenue
* Event expense
* Repair expense
* Charity expense
* Road closure expense
* Loans
* Interest expense
* Owner capital
* Retained earnings

### Disabled Concepts

* Accounts receivable
* Accounts payable
* Prepaid services
* Credit payments between players
* Year-end accruals
* Unearned revenue
* Depreciation
* Bad debt

---

## 6.2 Accrual Basis Mode

### Core Rule

Record revenue when earned.
Record expense when incurred.
Cash may move now, later, or not yet.

### Enabled Concepts

Everything from Cash Basis Mode, plus:

* Accounts Receivable
* Accounts Payable
* Player-to-player credit
* Bank credit line
* Prepaid Services
* Internet Expense
* Maintenance Expense
* Year-end credit settlement
* Credit rollover into Loan Payable

### Keep Accrual Simple

The accrual mode should focus on familiar examples:

* A player owes another player rent but pays later.
* A player pays now for a one-year internet plan.
* A player pays now for a one-year maintenance contract.
* A repair bill is received now but paid at year-end.
* A major conference uses a property now but pays at year-end.

Do not add advanced accounting unless explicitly requested later.

---

# 7. Game Setup

## 7.1 Create Room

Teacher creates a room with:

```ts
{
  roomName: string;
  teacherPin: string;
  difficulty: "cash" | "accrual";
  numberOfTeams: number;
  propertyAllocationRatio: 0 | 0.25 | 0.5 | 0.75;
  startingCash: number;
  startingLoanLimit: number;
  boardPreset: "simple";
}
```

Default settings:

```ts
difficulty: "cash"
numberOfTeams: 4
propertyAllocationRatio: 0.5
startingCash: 1500
startingLoanLimit: 500
boardPreset: "simple"
```

---

## 7.2 Initial Property Allocation Slider

At game start, the teacher chooses how many properties are randomly assigned to teams.

Options:

```txt
0% assigned
25% assigned
50% assigned
75% assigned
```

The purpose is to speed up gameplay so that rent transactions happen earlier.

When properties are assigned at setup, create opening journal entries for the receiving team.

Simple MVP treatment:

```txt
Dr Property
Cr Owner Capital
```

The assigned property value should use purchase price.

Example:

```txt
Team Blue receives Reading Railroad worth $200.

Dr Property 200
Cr Owner Capital 200
```

---

# 8. Board Design

Use a simplified Monopoly-style board.

Do not recreate the exact original Monopoly board for MVP. Use generic property names or configurable names.

## 8.1 Suggested Simple Board

Use 24 spaces instead of 40 for faster classroom play.

Suggested layout:

1. GO / Year Start
2. Property A
3. Cash Event
4. Property B
5. Bank
6. Property C
7. Cash/Accrual Event
8. Property D
9. Repair Space
10. Property E
11. Charity / Community Space
12. Free Parking / Rest
13. Property F
14. Event
15. Property G
16. Bank
17. Property H
18. Road Closure
19. Property I
20. Event
21. Property J
22. Tax / Fee Space
23. Property K
24. Year-End Checkpoint / GO

For MVP, passing or landing on GO triggers year-end for that team.

---

# 9. Turn Flow

## 9.1 Normal Turn

1. Server confirms current team.
2. Team clicks “Roll Dice.”
3. Server generates dice result.
4. Server moves team token.
5. Server checks landed space.
6. Server creates a pending game event.
7. Student resolves the event:

   * Pay rent
   * Receive rent
   * Draw card
   * Pay fee
   * Take loan
   * Buy property
8. System asks for journal entry.
9. Student submits debit account, credit account, and amount.
10. System validates.
11. If correct, post to ledger.
12. If incorrect, allow retry or teacher reveal.
13. End turn.
14. Server advances to next team.

---

## 9.2 Rent Transaction Flow

When a team lands on another team’s property:

### Cash Basis Mode

Only cash payment is allowed.

Owner records:

```txt
Dr Cash
Cr Rent Revenue
```

Visitor records:

```txt
Dr Rent Expense
Cr Cash
```

### Accrual Basis Mode

Visitor may choose:

1. Pay cash now
2. Pay on player credit
3. Use bank credit line

#### Pay cash now

Owner:

```txt
Dr Cash
Cr Rent Revenue
```

Visitor:

```txt
Dr Rent Expense
Cr Cash
```

#### Pay on player credit

Owner:

```txt
Dr Accounts Receivable
Cr Rent Revenue
```

Visitor:

```txt
Dr Rent Expense
Cr Accounts Payable
```

#### Use bank credit line

Owner:

```txt
Dr Cash
Cr Rent Revenue
```

Visitor:

```txt
Dr Rent Expense
Cr Credit Line Payable
```

---

# 10. Accounts

## 10.1 Cash Basis Chart of Accounts

```ts
const CASH_BASIS_ACCOUNTS = [
  { name: "Cash", type: "asset" },
  { name: "Property", type: "asset" },

  { name: "Loan Payable", type: "liability" },

  { name: "Owner Capital", type: "equity" },
  { name: "Retained Earnings", type: "equity" },

  { name: "Rent Revenue", type: "revenue" },
  { name: "Event Revenue", type: "revenue" },

  { name: "Rent Expense", type: "expense" },
  { name: "Repair Expense", type: "expense" },
  { name: "Charity Expense", type: "expense" },
  { name: "Road Closure Expense", type: "expense" },
  { name: "Interest Expense", type: "expense" },
  { name: "Event Expense", type: "expense" }
];
```

---

## 10.2 Accrual Basis Additional Accounts

```ts
const ACCRUAL_EXTRA_ACCOUNTS = [
  { name: "Accounts Receivable", type: "asset" },
  { name: "Prepaid Services", type: "asset" },

  { name: "Accounts Payable", type: "liability" },
  { name: "Credit Line Payable", type: "liability" },
  { name: "Interest Payable", type: "liability" },

  { name: "Internet Expense", type: "expense" },
  { name: "Maintenance Expense", type: "expense" }
];
```

For accrual mode, use:

```ts
const ACCRUAL_BASIS_ACCOUNTS = [
  ...CASH_BASIS_ACCOUNTS,
  ...ACCRUAL_EXTRA_ACCOUNTS
];
```

---

# 11. Event Cards

There should be two event decks:

1. Cash Basis Event Deck
2. Accrual Basis Event Deck

The event deck should be selected automatically based on difficulty mode.

---

## 11.1 Cash Basis Event Deck

These events should use immediate cash movement.

### Card: Inherit Money

Description:

```txt
You inherit $200 and invest it into your property business.
```

Entry:

```txt
Dr Cash 200
Cr Owner Capital 200
```

Teaching point:

```txt
Owner investment is not revenue.
```

---

### Card: Emergency Repairs

Description:

```txt
One of your properties needs urgent repairs. Pay $150.
```

Entry:

```txt
Dr Repair Expense 150
Cr Cash 150
```

---

### Card: Charity Event Invitation

Description:

```txt
You sponsor a local charity event. Pay $100.
```

Entry:

```txt
Dr Charity Expense 100
Cr Cash 100
```

---

### Card: Major Conference Booking

Description:

```txt
A major conference uses one of your properties. Receive $250 special rent.
```

Entry:

```txt
Dr Cash 250
Cr Event Revenue 250
```

---

### Card: Emergency Road Closure

Description:

```txt
Road repairs block access to one of your properties. Pay $120 in operating costs.
```

Entry:

```txt
Dr Road Closure Expense 120
Cr Cash 120
```

---

### Card: Neighborhood Promotion

Description:

```txt
You host a neighborhood promotion. Pay each other team $50.
```

Paying team entry:

```txt
Dr Event Expense totalAmount
Cr Cash totalAmount
```

Receiving team entry:

```txt
Dr Cash 50
Cr Event Revenue 50
```

---

### Card: Local Festival Boost

Description:

```txt
A local festival increases visitors. Collect $40 from each other team.
```

Receiving team entry:

```txt
Dr Cash totalAmount
Cr Event Revenue totalAmount
```

Each paying team entry:

```txt
Dr Event Expense 40
Cr Cash 40
```

---

### Card: Utility Bill

Description:

```txt
Pay $80 in utility fees for your properties.
```

Entry:

```txt
Dr Event Expense 80
Cr Cash 80
```

---

### Card: Cleaning Fee

Description:

```txt
Pay $60 to clean one of your rental properties.
```

Entry:

```txt
Dr Repair Expense 60
Cr Cash 60
```

---

### Card: Investor Contribution

Description:

```txt
Your investors contribute $100 to support your business.
```

Entry:

```txt
Dr Cash 100
Cr Owner Capital 100
```

Teaching point:

```txt
Cash received from owners increases equity, not revenue.
```

---

## 11.2 Accrual Basis Event Deck

These events should use similar real-world stories but introduce timing differences.

### Card: Conference Booking — Collect Later

Description:

```txt
A major conference books one of your properties. You earn $250 now, but payment will arrive at year-end.
```

Entry now:

```txt
Dr Accounts Receivable 250
Cr Event Revenue 250
```

Year-end settlement:

```txt
Dr Cash 250
Cr Accounts Receivable 250
```

---

### Card: Emergency Repair Bill — Pay Later

Description:

```txt
One of your properties needs urgent repairs. The contractor sends a $150 bill due at year-end.
```

Entry now:

```txt
Dr Repair Expense 150
Cr Accounts Payable 150
```

Year-end settlement:

```txt
Dr Accounts Payable 150
Cr Cash 150
```

---

### Card: Annual Internet Plan

Description:

```txt
Pay $120 now for one year of internet service for your rental business.
```

Entry when paid:

```txt
Dr Prepaid Services 120
Cr Cash 120
```

Year-end adjustment:

```txt
Dr Internet Expense 120
Cr Prepaid Services 120
```

Optional gameplay effect:

```txt
Your next rent receipt this year increases by $20.
```

---

### Card: Maintenance Contract

Description:

```txt
Pay $200 now for a one-year maintenance contract. Your next repair this year is free or reduced by $100.
```

Entry when paid:

```txt
Dr Prepaid Services 200
Cr Cash 200
```

Year-end adjustment:

```txt
Dr Maintenance Expense 200
Cr Prepaid Services 200
```

---

### Card: Charity Pledge

Description:

```txt
You promise to donate $100 to a charity event. Payment is due at year-end.
```

Entry now:

```txt
Dr Charity Expense 100
Cr Accounts Payable 100
```

Year-end settlement:

```txt
Dr Accounts Payable 100
Cr Cash 100
```

---

### Card: Road Closure Fee — Pay Later

Description:

```txt
Emergency road repairs affect one of your properties. You owe $120 in road access fees, due at year-end.
```

Entry now:

```txt
Dr Road Closure Expense 120
Cr Accounts Payable 120
```

Year-end settlement:

```txt
Dr Accounts Payable 120
Cr Cash 120
```

---

### Card: Player Rent on Credit

Description:

```txt
The next rent payment you owe to another team may be paid on credit instead of cash.
```

Owner entry:

```txt
Dr Accounts Receivable
Cr Rent Revenue
```

Visitor entry:

```txt
Dr Rent Expense
Cr Accounts Payable
```

---

### Card: Credit Line Payment

Description:

```txt
Use your bank credit line to pay one required expense or rent payment.
```

Paying team entry:

```txt
Dr Rent Expense or Event Expense
Cr Credit Line Payable
```

Receiving team, if another player receives payment:

```txt
Dr Cash
Cr Rent Revenue or Event Revenue
```

---

### Card: Software Subscription

Description:

```txt
Pay $90 now for a one-year business software subscription.
```

Entry when paid:

```txt
Dr Prepaid Services 90
Cr Cash 90
```

Year-end adjustment:

```txt
Dr Internet Expense 90
Cr Prepaid Services 90
```

For MVP, group software and internet under Internet Expense to avoid too many accounts.

---

# 12. Credit System for Accrual Mode

## 12.1 Player-to-player credit

When rent or an event requires one team to pay another team, the paying team may use credit if accrual mode is enabled.

The creditor records:

```txt
Dr Accounts Receivable
Cr Revenue
```

The debtor records:

```txt
Dr Expense
Cr Accounts Payable
```

## 12.2 Credit limit

Each team starts with a credit limit.

Default:

```txt
Credit limit: 500
```

The app should prevent a team from taking on new Accounts Payable above this limit.

Teacher may override.

## 12.3 Year-end settlement

At year-end, all player-to-player credit should be settled.

For each payable, debtor chooses:

1. Pay with cash
2. Roll over into bank loan

### Option 1: Pay with cash

Debtor:

```txt
Dr Accounts Payable
Cr Cash
```

Creditor:

```txt
Dr Cash
Cr Accounts Receivable
```

### Option 2: Roll into bank loan

Debtor:

```txt
Dr Accounts Payable
Cr Loan Payable
```

Creditor:

```txt
Dr Cash
Cr Accounts Receivable
```

Assumption:

```txt
The bank pays the creditor immediately. The debtor now owes the bank instead of the other team.
```

This keeps A/R and A/P from carrying indefinitely.

---

# 13. Loan and Mortgage System

Keep loans simple in MVP.

## 13.1 Taking a loan

Entry:

```txt
Dr Cash
Cr Loan Payable
```

## 13.2 Repaying principal

Entry:

```txt
Dr Loan Payable
Cr Cash
```

## 13.3 Interest

Original feature request:

```txt
Mortgages and loans cost interest per dice roll.
```

MVP implementation:

Each time a team rolls dice, charge interest based on outstanding loan balance.

Simple formula:

```txt
interestCharge = ceil(loanBalance * 0.01)
```

Minimum interest charge:

```txt
If loanBalance > 0, minimum interest per roll = 10
```

Entry:

```txt
Dr Interest Expense
Cr Cash
```

If cash is insufficient:

```txt
Dr Interest Expense
Cr Loan Payable
```

This means unpaid interest gets added to the loan balance.

---

# 14. Year-End System

Passing GO counts as completing one year.

For MVP:

* Year-end is triggered individually when a team passes GO.
* The team completes its own year-end tasks.
* Teacher can also trigger year-end manually for all teams.

## 14.1 Cash Basis Year-End

Generate:

1. Income Statement
2. Balance Sheet
3. Cash Summary

No adjusting entries required except optional loan interest if not already charged.

## 14.2 Accrual Basis Year-End

Year-end tasks:

1. Settle Accounts Receivable / Accounts Payable
2. Convert unpaid player credit into Loan Payable if needed
3. Recognize prepaid service expenses
4. Pay or accrue interest if needed
5. Generate financial statements
6. Close revenue and expense accounts to Retained Earnings

---

# 15. Financial Statements

## 15.1 Income Statement

Show:

```txt
Revenue
- Rent Revenue
- Event Revenue

Expenses
- Rent Expense
- Repair Expense
- Charity Expense
- Road Closure Expense
- Interest Expense
- Event Expense
- Internet Expense, accrual mode
- Maintenance Expense, accrual mode

Net Income
```

Formula:

```txt
Net Income = Total Revenue - Total Expenses
```

## 15.2 Balance Sheet

Show:

```txt
Assets
- Cash
- Accounts Receivable, accrual mode
- Prepaid Services, accrual mode
- Property

Liabilities
- Accounts Payable, accrual mode
- Credit Line Payable, accrual mode
- Loan Payable
- Interest Payable, optional

Equity
- Owner Capital
- Retained Earnings
```

Formula:

```txt
Assets = Liabilities + Equity
```

The app should show whether the balance sheet balances.

## 15.3 Cash Summary / Simplified Cash Flow

For MVP, use a simplified cash flow report.

Show:

```txt
Beginning Cash
+ Cash Inflows
- Cash Outflows
= Ending Cash
```

Optional classification:

```txt
Operating Cash Flow
Investing Cash Flow
Financing Cash Flow
```

For beginner students, the cash summary is enough in version 1.

## 15.4 A/R and A/P Schedule

Accrual mode only.

Show:

```txt
Who owes this team money?
Who does this team owe money to?
Amount
Original transaction
Due date / year-end status
```

Example:

| Type       | Other Team | Amount | Source                  |
| ---------- | ---------: | -----: | ----------------------- |
| Receivable |   Team Red |    100 | Rent on credit          |
| Payable    |  Team Blue |     80 | Event payment on credit |

---

# 16. T-Account View

Each team should have a T-account page.

## 16.1 Account Display

For each account:

```txt
Account Name
Debit side entries
Credit side entries
Balance
```

Example:

```txt
Cash
--------------------------------
Debit              | Credit
Owner Capital 1500 | Property 200
Rent Revenue 100   | Repair Expense 50

Balance: 1350 debit
```

## 16.2 Filtering

Allow filters:

* Current year
* Whole game
* Account type
* Individual account

Teacher can view all teams.

Students can view their own team.

---

# 17. Journal Entry Input

After a transaction, students should be asked to submit journal entries.

## 17.1 Basic input form

Fields:

```txt
Debit Account dropdown
Credit Account dropdown
Amount
Submit
```

For transactions involving two teams, each team may need its own entry.

MVP option:

* The active team submits its own entry.
* The receiving team’s entry can be auto-posted or also submitted depending on teacher setting.

Teacher setting:

```ts
journalEntryMode: "activeTeamOnly" | "bothTeams" | "autoPostCounterparty"
```

Default:

```txt
activeTeamOnly
```

For classroom pace, auto-post the counterparty entry in the first version.

## 17.2 Validation

The system should validate:

1. Debit account is correct.
2. Credit account is correct.
3. Amount is correct.
4. Debit and credit are not the same account.
5. Account is available in the selected game mode.

## 17.3 Feedback

On correct answer:

```txt
Correct. This records rent expense because your team used another team's property and paid cash.
```

On incorrect answer:

```txt
Not quite. Think about whether cash increased or decreased, and whether this is revenue, expense, asset, liability, or equity.
```

Allow:

* Retry
* Hint
* Reveal answer, teacher-controlled

## 17.4 Hints

Hint levels:

1. Statement effect
2. Account type
3. Debit/credit direction
4. Full answer

Example:

Transaction:

```txt
You paid $100 rent in cash.
```

Hints:

1. This affects an expense and an asset.
2. Rent Expense increases. Cash decreases.
3. Expenses increase with debits. Assets decrease with credits.
4. Dr Rent Expense 100, Cr Cash 100.

---

# 18. Game State Objects

Use these TypeScript-style interfaces.

## 18.1 Game

```ts
type Difficulty = "cash" | "accrual";
type GameStatus = "lobby" | "active" | "paused" | "ended";

interface Game {
  id: string;
  roomCode: string;
  teacherPinHash: string;
  difficulty: Difficulty;
  status: GameStatus;
  currentTeamId: string | null;
  currentTurnNumber: number;
  createdAt: string;
  updatedAt: string;

  settings: {
    propertyAllocationRatio: 0 | 0.25 | 0.5 | 0.75;
    startingCash: number;
    startingLoanLimit: number;
    boardPreset: "simple";
    journalEntryMode: "activeTeamOnly" | "bothTeams" | "autoPostCounterparty";
  };
}
```

## 18.2 Team

```ts
interface Team {
  id: string;
  gameId: string;
  name: string;
  color: string;
  position: number;
  currentYear: number;
  creditLimit: number;
  isActive: boolean;
}
```

## 18.3 Board Space

```ts
type BoardSpaceType =
  | "go"
  | "property"
  | "event"
  | "bank"
  | "repair"
  | "charity"
  | "road_closure"
  | "rest"
  | "tax";

interface BoardSpace {
  id: string;
  index: number;
  name: string;
  type: BoardSpaceType;
  propertyId?: string;
  deckType?: "cash" | "accrual";
}
```

## 18.4 Property

```ts
interface Property {
  id: string;
  gameId: string;
  boardSpaceId: string;
  name: string;
  purchasePrice: number;
  rent: number;
  ownerTeamId: string | null;
  isMortgaged: boolean;
}
```

## 18.5 Account

```ts
type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface Account {
  id: string;
  gameId: string;
  teamId: string;
  name: string;
  type: AccountType;
  normalBalance: "debit" | "credit";
}
```

## 18.6 Journal Entry

```ts
interface JournalEntry {
  id: string;
  gameId: string;
  teamId: string;
  turnId: string;
  description: string;
  sourceEventId: string;
  createdAt: string;
  isStudentSubmitted: boolean;
  isCorrect: boolean | null;
  lines: JournalEntryLine[];
}
```

## 18.7 Journal Entry Line

```ts
interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
}
```

## 18.8 Game Event

```ts
type GameEventType =
  | "roll"
  | "move"
  | "land_property"
  | "rent_due"
  | "rent_paid_cash"
  | "rent_paid_credit"
  | "rent_paid_credit_line"
  | "buy_property"
  | "draw_event_card"
  | "event_resolved"
  | "loan_taken"
  | "interest_charged"
  | "year_end_started"
  | "year_end_completed"
  | "teacher_override";

interface GameEvent {
  id: string;
  gameId: string;
  turnId: string | null;
  type: GameEventType;
  payload: unknown;
  createdAt: string;
}
```

## 18.9 Receivable/Payable Link

Needed in accrual mode to track who owes whom.

```ts
interface CreditBalance {
  id: string;
  gameId: string;
  debtorTeamId: string;
  creditorTeamId: string;
  amount: number;
  sourceEventId: string;
  status: "open" | "paid" | "rolled_to_loan";
  createdAt: string;
  settledAt?: string;
}
```

---

# 19. Backend API

Use REST for setup and normal queries. Use Socket.IO for live game updates.

## 19.1 REST endpoints

```txt
POST /api/games
Create game room.

GET /api/games/:gameId
Get game state.

POST /api/games/:gameId/join
Join as team/student.

POST /api/games/:gameId/start
Teacher starts game.

POST /api/games/:gameId/pause
Teacher pauses game.

POST /api/games/:gameId/resume
Teacher resumes game.

POST /api/games/:gameId/roll
Current team rolls dice.

POST /api/games/:gameId/resolve-event
Resolve pending event.

POST /api/games/:gameId/submit-journal-entry
Submit student journal entry.

POST /api/games/:gameId/reveal-answer
Teacher reveals answer.

POST /api/games/:gameId/year-end
Trigger year-end.

GET /api/games/:gameId/teams/:teamId/ledger
Get journal entries and account balances.

GET /api/games/:gameId/teams/:teamId/t-accounts
Get T-account view.

GET /api/games/:gameId/teams/:teamId/statements
Get financial statements.

GET /api/games/:gameId/export
Export game summary as JSON or CSV.
```

## 19.2 Socket.IO events

Client listens:

```txt
game:state_updated
game:turn_changed
game:event_created
game:journal_entry_posted
game:year_end_started
game:year_end_completed
game:error
```

Client emits:

```txt
join_room
teacher_join
request_roll
request_resolve_event
submit_journal_entry
request_year_end
```

The server should validate every emitted action.

---

# 20. Screens

## 20.1 Landing Page

Buttons:

```txt
Create Teacher Room
Join Game
```

## 20.2 Teacher Create Room

Fields:

```txt
Room name
Teacher PIN
Difficulty: Cash Basis / Accrual Basis
Number of teams
Property allocation: 0%, 25%, 50%, 75%
Starting cash
Credit limit
Create Room
```

## 20.3 Lobby

Teacher sees:

* Room code
* Join URL
* Team list
* Difficulty
* Settings
* Start game button

Students see:

* Room code
* Team selection / team assignment
* Waiting for teacher

## 20.4 Shared Board

Show:

* Board spaces
* Team positions
* Property ownership
* Current turn
* Dice result
* Recent event
* Current pending action

## 20.5 Team Dashboard

Show:

* Team name
* Cash balance
* Property list
* Loan balance
* A/R and A/P summary, accrual mode only
* Current turn action
* Roll button if current team
* Pending journal entry form

## 20.6 Journal Entry Screen

Show:

* Transaction description
* Debit account dropdown
* Credit account dropdown
* Amount field
* Submit button
* Hint button
* Feedback area

## 20.7 T-Accounts Screen

Show all team accounts with:

* Debit side
* Credit side
* Balance

## 20.8 Financial Statements Screen

Tabs:

```txt
Income Statement
Balance Sheet
Cash Summary
A/R and A/P Schedule, accrual only
```

## 20.9 Teacher Dashboard

Show:

* All teams
* Current turn
* Pause/resume
* Force next turn
* Reveal answer
* Override transaction
* Trigger year-end
* View team ledgers
* Export data

---

# 21. Accounting Engine Requirements

Implement a pure TypeScript accounting engine in a separate module.

The accounting engine should not depend on React or Express.

Suggested folder:

```txt
src/shared/accounting/
```

## 21.1 Accounting functions

```ts
getNormalBalance(accountType: AccountType): "debit" | "credit"

validateJournalEntry(input, expectedEntry): ValidationResult

postJournalEntry(entry): LedgerUpdate

calculateAccountBalance(account, journalLines): AccountBalance

generateIncomeStatement(teamId, period): IncomeStatement

generateBalanceSheet(teamId, asOfDate): BalanceSheet

generateCashSummary(teamId, period): CashSummary

generateARAPSchedule(teamId): ARAPSchedule
```

## 21.2 Normal balances

```txt
Assets: Debit
Expenses: Debit
Liabilities: Credit
Equity: Credit
Revenue: Credit
```

## 21.3 Balance calculation

For debit-normal accounts:

```txt
Balance = totalDebits - totalCredits
```

For credit-normal accounts:

```txt
Balance = totalCredits - totalDebits
```

---

# 22. Expected Journal Entry Library

Create a rule library that maps game event types to expected entries.

Suggested folder:

```txt
src/shared/accounting/entryRules.ts
```

Example:

```ts
function getExpectedEntriesForRentCash({
  payerTeamId,
  ownerTeamId,
  amount
}): ExpectedEntry[] {
  return [
    {
      teamId: payerTeamId,
      description: "Paid rent in cash",
      lines: [
        { accountName: "Rent Expense", debit: amount, credit: 0 },
        { accountName: "Cash", debit: 0, credit: amount }
      ]
    },
    {
      teamId: ownerTeamId,
      description: "Received rent in cash",
      lines: [
        { accountName: "Cash", debit: amount, credit: 0 },
        { accountName: "Rent Revenue", debit: 0, credit: amount }
      ]
    }
  ];
}
```

Need equivalent functions for:

* Property assigned at setup
* Property purchase
* Rent paid cash
* Rent paid on credit
* Rent paid with credit line
* Cash event revenue
* Cash event expense
* Owner capital contribution
* Repair paid cash
* Repair bill payable
* Prepaid internet
* Prepaid maintenance
* Year-end prepaid expense recognition
* Loan taken
* Loan principal repaid
* Interest paid cash
* Interest added to loan
* A/P paid cash
* A/P rolled to loan
* A/R collected

---

# 23. MVP Rules for Buying Property

When a team lands on unowned property:

Options:

1. Buy property
2. Skip property

No auction in MVP.

If buying:

```txt
Dr Property
Cr Cash
```

If insufficient cash:

* Cash mode: cannot buy unless teacher allows loan.
* Accrual mode: may use credit line or loan.

For MVP, keep it simple:

```txt
If insufficient cash, offer bank loan.
```

Loan entry:

```txt
Dr Cash
Cr Loan Payable
```

Then purchase entry:

```txt
Dr Property
Cr Cash
```

---

# 24. Teacher Override

Teacher should be able to correct problems.

Minimum override actions:

1. Adjust team cash through journal entry
2. Transfer property ownership
3. Delete or reverse latest transaction
4. Force next turn
5. Mark student entry correct
6. Reveal correct answer

For audit trail, every override should create a GameEvent:

```ts
{
  type: "teacher_override",
  payload: {
    action: string,
    reason?: string,
    oldValue?: unknown,
    newValue?: unknown
  }
}
```

---

# 25. Scoring

Do not overbuild scoring in MVP.

Simple scoring after each year:

```txt
Net Income Score
Cash Balance Score
Low Debt Bonus
Clean Books Bonus
```

Suggested formula:

```txt
score =
  netIncome
  + cashBalance * 0.1
  - loanPayable * 0.1
  + cleanBooksBonus
```

Clean books bonus:

```txt
+100 if all required journal entries were correct on first try.
+50 if corrected after one retry.
0 if teacher reveal was needed.
```

The teacher should be able to hide/show score.

---

# 26. Development Phases

## Phase 1: Accounting Engine Prototype

Goal:

Create accounting logic without multiplayer or board.

Build:

* Account types
* Journal entry posting
* T-account generation
* Income statement
* Balance sheet
* Cash summary
* Basic expected entry validation

Test with hardcoded transactions:

1. Owner contributes cash.
2. Buy property.
3. Receive rent.
4. Pay rent.
5. Pay repair expense.
6. Take loan.
7. Pay interest.

Acceptance criteria:

* Debits equal credits.
* Account balances are correct.
* Income statement shows correct revenue/expense.
* Balance sheet balances.
* T-account view displays entries.

---

## Phase 2: Single-Game Local Board

Goal:

Make a playable local game with multiple teams on one browser/server.

Build:

* Game creation
* Team creation
* Simple 24-space board
* Dice rolling
* Movement
* Property ownership
* Rent events
* Cash event cards
* Journal entry input
* Correct/incorrect validation

Acceptance criteria:

* Teacher can start a game.
* Teams can take turns.
* Teams can buy property.
* Rent is triggered.
* Cash event cards work.
* Journal entries update ledgers.
* Statements update correctly.

---

## Phase 3: Multiplayer Classroom Room

Goal:

Allow students to join from separate devices.

Build:

* Room code
* Student join page
* Socket.IO live updates
* Teacher dashboard
* Team dashboard
* Shared board display

Acceptance criteria:

* Multiple browsers stay synchronized.
* Only current team can roll.
* Teacher can pause/resume.
* Game state persists in SQLite.

---

## Phase 4: Accrual Mode

Goal:

Add beginner accrual concepts.

Build:

* Accrual chart of accounts
* Player credit payment option
* A/R and A/P schedule
* Prepaid services
* Accrual event deck
* Year-end credit settlement
* Rollover to Loan Payable

Acceptance criteria:

* Rent can be paid on credit.
* Creditor gets A/R.
* Debtor gets A/P.
* A/P can be paid or rolled into loan at year-end.
* Prepaid internet and maintenance adjust at year-end.
* Accrual financial statements balance.

---

## Phase 5: Classroom Polish

Goal:

Make it usable by teachers.

Build:

* Better UI
* Hints
* Teacher reveal answer
* Export CSV/JSON
* Game reset
* Projector-friendly shared display
* Basic leaderboard
* Better event card editor, optional

Acceptance criteria:

* A teacher can run a 40–80 minute classroom session.
* Students can understand what to do without developer help.
* Teacher can recover from mistakes.

---

# 27. Testing Requirements

## 27.1 Unit tests

Write unit tests for:

* Normal balance calculation
* Journal entry validation
* Rent paid cash
* Rent paid credit
* Prepaid services
* Loan interest
* Income statement
* Balance sheet
* Cash summary
* A/R and A/P schedule

## 27.2 Game flow tests

Test:

* Create room
* Join teams
* Start game
* Roll dice
* Land on unowned property
* Buy property
* Land on owned property
* Pay rent
* Submit journal entry
* Trigger year-end
* Generate statements

## 27.3 Edge cases

Test:

* Insufficient cash
* Negative cash prevention
* Loan interest when cash is insufficient
* Credit limit exceeded
* Attempt to use accrual accounts in cash mode
* Student submits wrong debit/credit
* Teacher override
* Browser refresh
* Reconnect after disconnect

---

# 28. UX Requirements

## 28.1 Student experience

Students should always know:

* Whose turn it is
* What happened
* What they need to record
* Which accounts are available
* Whether their answer was correct
* How the transaction affected their accounts

## 28.2 Teacher experience

Teacher should always know:

* Current game status
* Which team is active
* Which team is stuck
* Which journal entries were incorrect
* Whether statements balance
* How to pause, reveal, override, or advance

## 28.3 Visual priorities

High priority:

* Clear transaction card
* Clear debit/credit form
* Clear feedback
* Clear T-accounts
* Clear statements

Low priority:

* Animated dice
* Animated player tokens
* Fancy board graphics
* Sound effects

---

# 29. Suggested Folder Structure

```txt
accounting-monopoly/
  package.json
  README.md

  apps/
    client/
      src/
        main.tsx
        App.tsx
        routes/
          LandingPage.tsx
          CreateRoomPage.tsx
          JoinPage.tsx
          TeacherDashboard.tsx
          SharedBoardPage.tsx
          TeamDashboard.tsx
          LedgerPage.tsx
          StatementsPage.tsx
        components/
          Board/
          JournalEntryForm/
          TAccounts/
          FinancialStatements/
          EventCard/
          TeamPanel/
        socket/
          socketClient.ts
        styles/

    server/
      src/
        index.ts
        app.ts
        socket.ts
        routes/
          games.ts
          teams.ts
          ledger.ts
        services/
          gameService.ts
          turnService.ts
          eventService.ts
          accountingService.ts
          yearEndService.ts
        db/
          schema.ts
          client.ts
          migrations/
        tests/

  packages/
    shared/
      src/
        types.ts
        accounting/
          accounts.ts
          normalBalances.ts
          journal.ts
          entryRules.ts
          statements.ts
          validation.ts
        game/
          boardPresets.ts
          eventCards.ts
          rules.ts
```

---

# 30. Coding Agent Instructions

## 30.1 Main instruction

Build this project incrementally. Do not attempt to implement every feature at once.

Start with the shared accounting engine and tests. Then build a local playable version. Then add multiplayer. Then add accrual mode.

## 30.2 Do not overbuild

Avoid:

* Complex auth
* Complex animations
* Exact Monopoly clone mechanics
* Property auctions
* Houses/hotels
* AI-generated event cards
* Advanced accounting
* Cloud deployment assumptions

## 30.3 Prioritize correctness

Accounting correctness matters more than UI polish.

For every transaction rule, implement:

1. Game event
2. Expected journal entry
3. Student validation
4. Ledger posting
5. Statement effect

## 30.4 Make rules data-driven

Board spaces, accounts, and event cards should be defined as data objects where possible.

Example:

```ts
const eventCards = [
  {
    id: "cash_emergency_repair",
    mode: "cash",
    title: "Emergency Repairs",
    description: "One of your properties needs urgent repairs. Pay $150.",
    amount: 150,
    eventType: "cash_expense",
    expenseAccount: "Repair Expense"
  }
];
```

Do not hardcode every card inside UI components.

## 30.5 Create a useful README

The README should include:

* How to install
* How to run dev server
* How to create a room
* How students join
* How to reset database
* Current implemented features
* Known limitations

---

# 31. MVP Acceptance Criteria

The MVP is acceptable when:

1. Teacher can create a game room.
2. Students can join teams.
3. Teacher can choose Cash Basis or Accrual Basis.
4. Teacher can set property allocation to 0%, 25%, 50%, or 75%.
5. Properties can be assigned at game start.
6. Teams can roll dice and move around the board.
7. Teams can buy properties.
8. Teams can pay and receive rent.
9. Cash event deck works in Cash Basis Mode.
10. Accrual event deck works in Accrual Basis Mode.
11. Students must submit debit and credit accounts after transactions.
12. System validates journal entries.
13. Journal entries post to T-accounts.
14. Income statement and balance sheet generate correctly.
15. Cash summary generates correctly.
16. In Accrual Mode, A/R and A/P are tracked.
17. In Accrual Mode, players can pay rent on credit.
18. In Accrual Mode, prepaids adjust at year-end.
19. Passing GO triggers year-end.
20. Loans charge interest per dice roll.
21. Teacher can pause, reveal answer, and force next turn.

---

# 32. First Coding Task

Start by creating the shared accounting engine.

Implement:

```txt
packages/shared/src/accounting/accounts.ts
packages/shared/src/accounting/normalBalances.ts
packages/shared/src/accounting/journal.ts
packages/shared/src/accounting/statements.ts
packages/shared/src/accounting/validation.ts
packages/shared/src/accounting/entryRules.ts
```

Then write tests for these sample transactions:

## Scenario A: Cash Basis

1. Team starts with owner capital of 1500 cash.
2. Team receives property worth 200 at setup.
3. Team receives rent of 100 cash.
4. Team pays rent of 80 cash.
5. Team pays repair expense of 150 cash.
6. Team takes loan of 500.
7. Team pays interest of 20.

Expected results:

* Cash balance should be correct.
* Property should be 200.
* Loan Payable should be 500.
* Rent Revenue should be 100.
* Rent Expense should be 80.
* Repair Expense should be 150.
* Interest Expense should be 20.
* Balance sheet should balance.
* Income statement should show correct net income.

## Scenario B: Accrual Basis

1. Team starts with 1500 cash.
2. Team earns 250 event revenue but will collect later.
3. Team receives 150 repair bill due at year-end.
4. Team pays 120 for prepaid internet.
5. At year-end, team collects A/R.
6. At year-end, team pays A/P.
7. At year-end, team recognizes internet expense.

Expected results:

* Accounts Receivable should eventually clear to 0.
* Accounts Payable should eventually clear to 0.
* Prepaid Services should eventually clear to 0.
* Event Revenue should be 250.
* Repair Expense should be 150.
* Internet Expense should be 120.
* Cash should reflect actual cash movements.
* Balance sheet should balance.

---

# 33. Future Features After MVP

Only after the core game is stable, consider adding:

* House/hotel improvements
* Depreciation
* Taxes
* Bad debt
* Property trades
* Team audit mode
* Student role rotation: CEO, accountant, auditor
* Export to PDF
* Teacher-created custom cards
* Bilingual English/Chinese interface
* QR code room joining
* Class leaderboard
* Post-game reflection worksheet
* Single-player practice mode
* AI tutor hints

Do not implement these before the MVP.
