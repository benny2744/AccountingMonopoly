import type { ExpectedEntry, Game, Property, Team } from "@amono/shared";
import { accounting, game as gameData, getEventCardTitleKey } from "@amono/shared";
import { getDb } from "../db/client.js";
import { queries } from "../db/queries.js";
import { logEvent } from "./eventLog.js";
import { postEntry, postExpectedAsSystem, balanceOf } from "./accountingService.js";
import { GameError } from "./gameService.js";
import { now, uuid } from "../util/ids.js";
import { drawEventCard } from "./gameService.js";
import { activateYearEnd } from "./yearEndService.js";

const { calculateInterestCharge } = gameData;
const {
  interestPaidCash,
  interestAddedToLoan,
  propertyPurchase,
  buildingPurchase,
  rentPaidCash,
  rentPaidCredit,
  rentPaidCreditLine,
  ownerCapitalContribution,
  cashEventRevenue,
  cashEventExpense,
  multiTeamEventPay,
  multiTeamEventCollect,
  revenueReceivable,
  expensePayable,
  prepaidPurchase,
  loanTaken,
  loanPrincipalRepaid,
  propertySaleSeller,
  propertyTradeBuyer,
} = accounting;

export interface PendingCreate {
  kind: string;
  payload: unknown;
  expectedEntries: ExpectedEntry[];
  status: "awaiting_choice" | "awaiting_journal" | "done";
}

function openPending(gameId: string): PendingCreate | null {
  const p = queries.pendingByGame(gameId);
  if (!p) return null;
  return {
    kind: p.kind,
    payload: p.payload,
    expectedEntries: p.expectedEntries as ExpectedEntry[],
    status: p.status as "awaiting_choice" | "awaiting_journal",
  };
}

function createPending(gameId: string, teamId: string, p: PendingCreate): void {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO pending_actions (id, game_id, team_id, kind, payload, expected_entries, status, attempts, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, gameId, teamId, p.kind, JSON.stringify(p.payload), JSON.stringify(p.expectedEntries), p.status, 0, now());
}

function markPendingDone(gameId: string): void {
  const pending = queries.pendingByGame(gameId);
  if (pending) {
    getDb().prepare("UPDATE pending_actions SET status = 'done' WHERE id = ?").run(pending.id);
  }
  setAwaitingEnd(gameId);
}

function setAwaitingEnd(gameId: string): void {
  queries.setTurnPhase(gameId, "awaiting_end", now());
}

function setResolving(gameId: string): void {
  queries.setTurnPhase(gameId, "resolving", now());
}

function bumpAttempts(gameId: string): void {
  getDb().prepare("UPDATE pending_actions SET attempts = attempts + 1 WHERE game_id = ? AND status = 'awaiting_journal'").run(
    gameId,
  );
}

export function roll(gameId: string, teamId: string): { dice: [number, number]; newPosition: number; space: string } {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  if (game.currentTeamId !== teamId) throw new GameError("NOT_YOUR_TURN", "It's not your turn");
  if (game.turnPhase !== "awaiting_roll") {
    throw new GameError("INVALID_STATE", "Already rolled this turn — resolve the action or end your turn");
  }
  if (openPending(gameId)) throw new GameError("PENDING_ACTION", "Resolve the pending action first");
  if (queries.yearEndPendingByTeam(teamId)) {
    throw new GameError("YEAR_END_OPEN", "Finish your year-end checklist before rolling again");
  }

  setResolving(gameId);

  const teams = queries.teamsByGame(gameId);
  const team = teams.find((t) => t.id === teamId)!;

  // Interest charge first (PRD §13.3), auto-posted for pacing.
  const loanBal = balanceOf(teamId, "Loan Payable");
  if (loanBal > 0) {
    const interest = calculateInterestCharge(loanBal);
    const cashBal = balanceOf(teamId, "Cash");
    const expected = cashBal >= interest ? interestPaidCash(teamId, interest) : interestAddedToLoan(teamId, interest);
    postExpectedAsSystem(gameId, teamId, "interest", expected, team.currentYear);
    logEvent(gameId, String(game.currentTurnNumber), "interest_charged", { teamId, amount: interest, rolledToLoan: cashBal < interest });
  }

  // Roll 2d6.
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const total = d1 + d2;
  const prevPosition = team.position;
  const newPosition = (team.position + total) % gameData.BOARD_SIZE;
  const passedGo = newPosition <= prevPosition && total > 0;
  getDb().prepare("UPDATE teams SET position = ? WHERE id = ?").run(newPosition, teamId);
  logEvent(gameId, String(game.currentTurnNumber), "roll", { teamId, dice: [d1, d2], total, from: prevPosition, to: newPosition });
  logEvent(gameId, String(game.currentTurnNumber), "move", { teamId, position: newPosition, passedGo });

  // Dispatch on landed space (needed before GO year check for landing-on-GO case).
  const spaces = queries.spacesByGame(gameId);
  const space = spaces.find((s) => s.index === newPosition)!;

  // Year-end triggers only when passing GO (single GO tile at index 0).
  const goToYearEnd = passedGo;

  dispatchLanding(game, team, { ...space, index: space.index });
  if (goToYearEnd) {
    activateYearEnd(game.id, team.id, String(game.currentTurnNumber));
  }
  return { dice: [d1, d2], newPosition, space: space.name };
}

function dispatchLanding(
  game: Game,
  team: Team,
  space: { type: string; id: string; propertyId?: string; name: string; index: number },
): void {
  const db = getDb();
  const turnId = String(game.currentTurnNumber);
  switch (space.type) {
    case "go":
    case "rest": {
      createPending(game.id, team.id, { kind: "noop", payload: { space: space.name }, expectedEntries: [], status: "done" });
      logEvent(game.id, turnId, "event_resolved", { teamId: team.id, note: `Landed on ${space.name} (no action)` });
      setAwaitingEnd(game.id);
      break;
    }
    case "property": {
      const prop = queries.propertiesByGame(game.id).find((p) => p.id === space.propertyId)!;
      const allProps = queries.propertiesByGame(game.id);
      if (!prop.ownerTeamId) {
        createPending(game.id, team.id, {
          kind: "buy_or_skip",
          payload: { propertyId: prop.id, name: prop.name, price: prop.purchasePrice, rent: prop.rent },
          expectedEntries: [propertyPurchase(team.id, prop.purchasePrice, prop.name)],
          status: "awaiting_choice",
        });
      } else if (prop.ownerTeamId === team.id) {
        createPending(game.id, team.id, { kind: "noop", payload: { note: "Own property" }, expectedEntries: [], status: "done" });
        setAwaitingEnd(game.id);
      } else {
        const owner = queries.teamsByGame(game.id).find((t) => t.id === prop.ownerTeamId)!;
        const rentAmount = gameData.effectiveRent(prop, gameData.countOwnedRailroads(allProps, owner.id));
        const choices = game.difficulty === "cash" ? ["cash"] : ["cash", "player_credit", "credit_line"];
        createPending(game.id, team.id, {
          kind: "rent_due",
          payload: {
            propertyId: prop.id,
            name: prop.name,
            rent: rentAmount,
            ownerTeamId: owner.id,
            ownerName: owner.name,
            choices,
            houses: prop.houses,
          },
          expectedEntries: [],
          status: "awaiting_choice",
        });
        logEvent(game.id, turnId, "rent_due", { payer: team.id, owner: owner.id, rent: rentAmount, houses: prop.houses });
      }
      break;
    }
    case "event": {
      const card = drawEventCard(game.id, game.difficulty);
      if (card.kind === "credit_method_modifier") {
        createPending(game.id, team.id, {
          kind: "noop",
          payload: { card, note: card.title },
          expectedEntries: [],
          status: "done",
        });
        logEvent(game.id, turnId, "draw_event_card", {
          teamId: team.id,
          cardId: card.id,
          title: card.title,
          note: "Payment method modifier (no journal entry)",
        });
        setAwaitingEnd(game.id);
        break;
      }
      const expected = expectedEntriesForEventCard(card, team, queries.teamsByGame(game.id));
      createPending(game.id, team.id, {
        kind: "event_card",
        payload: { card, cashShort: card.kind === "cash_expense" && balanceOf(team.id, "Cash") < card.amount },
        expectedEntries: expected,
        status: "awaiting_journal",
      });
      logEvent(game.id, turnId, "draw_event_card", { teamId: team.id, cardId: card.id, title: card.title });
      break;
    }
    case "tax": {
      const fee = gameData.taxFeeForSpace(space.index);
      createPending(game.id, team.id, {
        kind: "space_fee",
        payload: { space: space.type, amount: fee, account: "Event Expense", title: space.name, cashShort: balanceOf(team.id, "Cash") < fee },
        expectedEntries: [cashEventExpense(team.id, fee, "Event Expense", space.name)],
        status: "awaiting_journal",
      });
      break;
    }
    case "bank": {
      createPending(game.id, team.id, {
        kind: "bank_stop",
        payload: {},
        expectedEntries: [],
        status: "awaiting_choice",
      });
      break;
    }
    default: {
      createPending(game.id, team.id, { kind: "noop", payload: {}, expectedEntries: [], status: "done" });
      setAwaitingEnd(game.id);
    }
  }
  void db;
}

// Build expected entries for an event card based on its kind.
function expectedEntriesForEventCard(
  card: gameData.EventCardBase,
  team: Team,
  allTeams: Team[],
): ExpectedEntry[] {
  const others = allTeams.filter((t) => t.id !== team.id);
  switch (card.kind) {
    case "owner_capital":
      return [ownerCapitalContribution(team.id, card.amount, getEventCardTitleKey(card.id))];
    case "cash_revenue":
      return [cashEventRevenue(team.id, card.amount, getEventCardTitleKey(card.id))];
    case "cash_expense":
      return [cashEventExpense(team.id, card.amount, card.expenseAccount ?? "Event Expense", getEventCardTitleKey(card.id))];
    case "multi_team_pay":
      return multiTeamEventPay(team.id, others.map((t) => t.id), card.perTeamAmount ?? card.amount, getEventCardTitleKey(card.id));
    case "multi_team_collect":
      return multiTeamEventCollect(team.id, others.map((t) => t.id), card.perTeamAmount ?? card.amount, getEventCardTitleKey(card.id));
    // Accrual kinds handled in Phase 4.
    case "accrual_revenue_receivable":
      return [revenueReceivable(team.id, card.amount, card.revenueAccount ?? "Event Revenue", getEventCardTitleKey(card.id))];
    case "accrual_expense_payable":
      return [expensePayable(team.id, card.amount, card.expenseAccount ?? "Event Expense", getEventCardTitleKey(card.id))];
    case "accrual_prepaid":
      return [prepaidPurchase(team.id, card.amount, getEventCardTitleKey(card.id))];
    case "credit_method_modifier":
      // No accounting now; sets a flag for the next payment (Phase 4).
      return [];
    default:
      return [];
  }
}

export interface ResolveChoiceInput {
  choice: string;
  amount?: number;
}

export function resolveChoice(gameId: string, teamId: string, input: ResolveChoiceInput): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  const pending = queries.pendingByGame(gameId);
  if (!pending) throw new GameError("NO_PENDING", "No pending action to resolve");
  if (pending.teamId !== teamId) throw new GameError("NOT_YOUR_TURN", "Not your pending action");
  if (pending.status !== "awaiting_choice") throw new GameError("WRONG_STATE", "Not awaiting a choice");

  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;
  const turnId = String(game.currentTurnNumber);

  switch (pending.kind) {
    case "buy_or_skip": {
      if (input.choice === "skip") {
        markPendingDone(gameId);
        logEvent(gameId, turnId, "event_resolved", { teamId, note: "Skipped buying property" });
        return;
      }
      const payload = pending.payload as { propertyId: string; name: string; price: number };
      const prop = queries.propertiesByGame(gameId).find((p) => p.id === payload.propertyId)!;
      const cash = balanceOf(teamId, "Cash");
      if (cash < prop.purchasePrice) {
        throw new GameError(
          "INSUFFICIENT_CASH",
          `Not enough cash ($${cash}) to buy ${prop.name} for $${prop.purchasePrice}. Take a loan at the bank or skip.`,
        );
      }
      // Transfer ownership immediately (consequence), then student journals.
      getDb().prepare("UPDATE properties SET owner_team_id = ? WHERE id = ?").run(teamId, prop.id);
      const expected = propertyPurchase(teamId, prop.purchasePrice, prop.name);
      updatePendingExpected(gameId, [expected], "awaiting_journal");
      logEvent(gameId, turnId, "buy_property", { teamId, propertyId: prop.id, price: prop.purchasePrice });
      return;
    }
    case "rent_due": {
      const payload = pending.payload as { propertyId: string; rent: number; ownerTeamId: string };
      const owner = queries.teamsByGame(gameId).find((t) => t.id === payload.ownerTeamId)!;
      let expected: ExpectedEntry[];
      if (input.choice === "cash") {
        const cash = balanceOf(teamId, "Cash");
        if (cash < payload.rent) {
          throw new GameError(
            "INSUFFICIENT_CASH",
            `Not enough cash ($${cash}) to pay rent $${payload.rent}. Take a loan at the bank first.`,
          );
        }
        expected = rentPaidCash(teamId, owner.id, payload.rent);
      } else if (input.choice === "player_credit") {
        // Credit limit enforcement (PRD §12.2): A/P exposure from open
        // credit_balances where this team is the debtor must not exceed limit.
        const openAP = queries
          .creditBalancesByGame(gameId)
          .filter((cb) => cb.debtorTeamId === teamId && cb.status === "open")
          .reduce((s, cb) => s + cb.amount, 0);
        if (openAP + payload.rent > team.creditLimit) {
          throw new GameError(
            "CREDIT_LIMIT",
            `Player credit would exceed limit $${team.creditLimit} (current A/P $${openAP}, rent $${payload.rent}). Pay cash or use the bank credit line.`,
          );
        }
        expected = rentPaidCredit(teamId, owner.id, payload.rent);
        // Track player credit balance (Phase 4 wires full flow; row created now).
        getDb()
          .prepare(
            `INSERT INTO credit_balances (id, game_id, debtor_team_id, creditor_team_id, amount, source_event_id, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(uuid(), gameId, teamId, owner.id, payload.rent, `rent-${turnId}`, "open", now());
      } else if (input.choice === "credit_line") {
        expected = rentPaidCreditLine(teamId, owner.id, payload.rent);
      } else {
        throw new GameError("BAD_CHOICE", "Unknown payment method");
      }
      updatePendingExpected(gameId, expected, "awaiting_journal");
      logEvent(gameId, turnId, `rent_paid_${input.choice}` as never, { teamId, owner: owner.id, rent: payload.rent });
      return;
    }
    case "bank_stop": {
      if (input.choice === "pass") {
        markPendingDone(gameId);
        logEvent(gameId, turnId, "event_resolved", { teamId, note: "Passed at bank" });
        return;
      }
      const amount = input.amount ?? 0;
      if (amount <= 0) throw new GameError("BAD_AMOUNT", "Amount must be positive");
      const team2 = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;
      const expected =
        input.choice === "loan"
          ? loanTaken(teamId, amount)
          : loanPrincipalRepaid(teamId, amount);
      // Consequence: actually move cash for repay, or create loan for take.
      // We let the journal entry reflect it; cap loan by limit.
    if (input.choice === "loan") {
      const loanBal = balanceOf(teamId, "Loan Payable");
      if (loanBal + amount > team2.creditLimit) {
        throw new GameError("LOAN_LIMIT", `Loan would exceed credit limit ${team2.creditLimit}`, { creditLimit: team2.creditLimit });
      }
    } else if (input.choice === "repay") {
        const cash = balanceOf(teamId, "Cash");
        if (cash < amount) throw new GameError("INSUFFICIENT_CASH", "Not enough cash to repay");
      } else {
        throw new GameError("BAD_CHOICE", "Unknown bank action");
      }
      updatePendingExpected(gameId, [expected], "awaiting_journal");
      logEvent(gameId, turnId, "loan_taken", { teamId, amount, kind: input.choice });
      return;
    }
    case "trade_offer": {
      const payload = pending.payload as {
        propertyId: string;
        name: string;
        price: number;
        buyerTeamId: string;
        sellerTeamId: string;
        proposerTeamId: string;
      };
      if (input.choice === "decline") {
        markPendingDone(gameId);
        logEvent(gameId, turnId, "trade_declined", {
          teamId,
          propertyId: payload.propertyId,
          propertyName: payload.name,
          proposerTeamId: payload.proposerTeamId,
        });
        return;
      }
      if (input.choice !== "accept") {
        throw new GameError("BAD_CHOICE", "Unknown trade response");
      }
      const buyerCash = balanceOf(payload.buyerTeamId, "Cash");
      if (buyerCash < payload.price) {
        throw new GameError(
          "INSUFFICIENT_CASH",
          `Buyer does not have enough cash ($${buyerCash}) for trade price $${payload.price}.`,
        );
      }
      const prop = queries.propertiesByGame(gameId).find((p) => p.id === payload.propertyId)!;
      assertPropertyTradeable(prop);
      if (prop.ownerTeamId !== payload.sellerTeamId) {
        throw new GameError("INVALID_STATE", "Property ownership changed — trade is no longer valid");
      }
      const bookValue = propertyBookValue(prop);
      queries.transferPropertyAfterTrade(prop.id, payload.buyerTeamId, payload.price);
      const sellerEntry = propertySaleSeller(payload.sellerTeamId, payload.price, bookValue, payload.name);
      const buyerEntry = propertyTradeBuyer(payload.buyerTeamId, payload.price, payload.name);
      const ordered =
        pending.teamId === payload.buyerTeamId
          ? [buyerEntry, sellerEntry]
          : [sellerEntry, buyerEntry];
      updatePendingExpected(gameId, ordered, "awaiting_journal");
      logEvent(gameId, turnId, "trade_accepted", {
        teamId,
        propertyId: payload.propertyId,
        propertyName: payload.name,
        price: payload.price,
        buyerTeamId: payload.buyerTeamId,
        sellerTeamId: payload.sellerTeamId,
        bookValue,
      });
      return;
    }
    default:
      throw new GameError("BAD_CHOICE", `Choice not expected for ${pending.kind}`);
  }
}

/**
 * Softlock-prevention flow (PRD §23, §27.3): if a team is stuck on a
 * `space_fee` or cash-expense `event_card` journal entry they cannot afford,
 * they can take a bank loan mid-pending. The loan is posted as a system
 * entry so the upcoming journal entry's debit-to-Cash clears the
 * negative-cash guard.
 */
export function takeLoanForPendingFee(gameId: string, teamId: string, amount: number): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  const pending = queries.pendingByGame(gameId);
  if (!pending) throw new GameError("NO_PENDING", "No pending action");
  if (pending.teamId !== teamId) throw new GameError("NOT_YOUR_TURN", "Not your pending action");
  if (pending.status !== "awaiting_journal") throw new GameError("WRONG_STATE", "Not awaiting a journal entry");
  if (pending.kind !== "space_fee" && pending.kind !== "event_card") {
    throw new GameError("BAD_CHOICE", "Loan-then-pay only applies to fee/expense cards");
  }
  if (amount <= 0) throw new GameError("BAD_AMOUNT", "Loan amount must be positive");
  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;
  const loanBal = balanceOf(teamId, "Loan Payable");
  if (loanBal + amount > team.creditLimit) {
    throw new GameError("LOAN_LIMIT", `Loan would exceed credit limit ${team.creditLimit}`, { creditLimit: team.creditLimit });
  }
  const turnId = String(game.currentTurnNumber);
  postExpectedAsSystem(gameId, teamId, turnId, loanTaken(teamId, amount), team.currentYear);
  logEvent(gameId, turnId, "loan_taken", { teamId, amount, kind: "cover_fee" });
}

function updatePendingExpected(gameId: string, expected: ExpectedEntry[], status: "awaiting_journal"): void {
  const pending = queries.pendingByGame(gameId)!;
  getDb()
    .prepare("UPDATE pending_actions SET expected_entries = ?, status = ? WHERE id = ?")
    .run(JSON.stringify(expected), status, pending.id);
}

/** PRD §11.2: accrual cards queue a year-end settlement item after the entry posts. */
function recordDeferredSettlementForCard(
  gameId: string,
  teamId: string,
  card: gameData.EventCardBase,
): void {
  const ts = now();
  const insert = (kind: "collect_ar" | "pay_ap" | "recognize_prepaid", amount: number, accountName: string, counterAccountName: string | null) => {
    getDb()
      .prepare(
        `INSERT INTO deferred_settlements (id, game_id, team_id, kind, amount, account_name, counter_account_name, source_event_id, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(uuid(), gameId, teamId, kind, amount, accountName, counterAccountName, `card-${card.id}-${ts}`, "open", ts);
  };
  switch (card.kind) {
    case "accrual_revenue_receivable":
      insert("collect_ar", card.amount, "Accounts Receivable", "Cash");
      break;
    case "accrual_expense_payable":
      insert("pay_ap", card.amount, card.expenseAccount ?? "Event Expense", null);
      break;
    case "accrual_prepaid":
      insert("recognize_prepaid", card.amount, "Prepaid Services", card.yearEndRecognitionAccount ?? "Internet Expense");
      break;
    default:
      break;
  }
}

function maybeRecordDeferredForEventCard(
  gameId: string,
  teamId: string,
  pending: { kind: string; payload: unknown },
  difficulty: Game["difficulty"],
): void {
  if (difficulty !== "accrual" || pending.kind !== "event_card") return;
  const card = (pending.payload as { card?: gameData.EventCardBase }).card;
  if (!card) return;
  recordDeferredSettlementForCard(gameId, teamId, card);
}

export interface BalanceChange {
  accountName: string;
  before: number;
  after: number;
}

export interface SubmitResult {
  correct: boolean;
  feedback: string;
  errors: string[];
  attempts: number;
  balanceChanges?: BalanceChange[];
  /** When the entry chains to a counterparty pending, the receiver's team id. */
  chainedTo?: string;
  chainedToName?: string;
}

function ownsFullColorGroup(properties: Property[], teamId: string, colorGroup: string): boolean {
  const groupProps = properties.filter((p) => p.colorGroup === colorGroup && p.kind === "street");
  if (groupProps.length === 0) return false;
  return groupProps.every((p) => p.ownerTeamId === teamId && !p.isMortgaged);
}

/** Build a house or hotel on an owned street (full color group required). */
function propertyBookValue(prop: Property): number {
  return prop.costBasis ?? prop.purchasePrice;
}

function assertTeamsNotInYearEnd(...teamIds: string[]): void {
  for (const id of teamIds) {
    if (queries.yearEndPendingByTeam(id)) {
      throw new GameError("YEAR_END_OPEN", "Finish year-end checklist before trading");
    }
  }
}

function assertPropertyTradeable(prop: Property): void {
  if (prop.isMortgaged) throw new GameError("PROPERTY_NOT_TRADEABLE", "Mortgaged properties cannot be traded");
  if (prop.houses > 0) throw new GameError("PROPERTY_NOT_TRADEABLE", "Properties with houses or hotels cannot be traded");
}

export interface ProposeTradeInput {
  propertyId: string;
  price: number;
  counterpartyTeamId?: string;
}

export function proposeTrade(gameId: string, teamId: string, input: ProposeTradeInput): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  if (game.currentTeamId !== teamId) throw new GameError("NOT_YOUR_TURN", "Only the active team can propose a trade");
  if (game.turnPhase !== "awaiting_end") {
    throw new GameError("INVALID_STATE", "Trades can only be proposed before ending your turn");
  }
  if (openPending(gameId)) throw new GameError("PENDING_ACTION", "Resolve the pending action first");
  if (!Number.isInteger(input.price) || input.price <= 0) {
    throw new GameError("BAD_AMOUNT", "Trade price must be a positive integer");
  }

  const prop = queries.propertiesByGame(gameId).find((p) => p.id === input.propertyId);
  if (!prop) throw new GameError("NOT_FOUND", "Property not found");
  assertPropertyTradeable(prop);

  const teams = queries.teamsByGame(gameId);
  let buyerTeamId: string;
  let sellerTeamId: string;

  if (prop.ownerTeamId === teamId) {
    if (!input.counterpartyTeamId) {
      throw new GameError("BAD_INPUT", "Select a buyer when selling a property");
    }
    if (input.counterpartyTeamId === teamId) {
      throw new GameError("BAD_INPUT", "Cannot trade with yourself");
    }
    if (!teams.some((t) => t.id === input.counterpartyTeamId)) {
      throw new GameError("NOT_FOUND", "Counterparty team not found");
    }
    sellerTeamId = teamId;
    buyerTeamId = input.counterpartyTeamId;
  } else if (prop.ownerTeamId) {
    sellerTeamId = prop.ownerTeamId;
    buyerTeamId = teamId;
    if (input.counterpartyTeamId && input.counterpartyTeamId !== sellerTeamId) {
      throw new GameError("BAD_INPUT", "Buy offers must target the current owner");
    }
  } else {
    throw new GameError("INVALID_STATE", "Unowned properties cannot be traded");
  }

  assertTeamsNotInYearEnd(teamId, buyerTeamId, sellerTeamId);

  const responderTeamId = prop.ownerTeamId === teamId ? buyerTeamId : sellerTeamId;
  setResolving(gameId);
  createPending(gameId, responderTeamId, {
    kind: "trade_offer",
    payload: {
      propertyId: prop.id,
      name: prop.name,
      price: input.price,
      buyerTeamId,
      sellerTeamId,
      proposerTeamId: teamId,
    },
    expectedEntries: [],
    status: "awaiting_choice",
  });
  logEvent(gameId, String(game.currentTurnNumber), "trade_proposed", {
    proposerTeamId: teamId,
    responderTeamId,
    propertyId: prop.id,
    propertyName: prop.name,
    price: input.price,
    buyerTeamId,
    sellerTeamId,
  });
}

export function cancelTrade(gameId: string, teamId: string): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  const pending = queries.pendingByGame(gameId);
  if (!pending || pending.kind !== "trade_offer") {
    throw new GameError("NO_PENDING", "No trade offer to cancel");
  }
  if (pending.status !== "awaiting_choice") {
    throw new GameError("WRONG_STATE", "Trade offer can no longer be cancelled");
  }
  const payload = pending.payload as { proposerTeamId: string; propertyId: string; name: string };
  if (payload.proposerTeamId !== teamId) {
    throw new GameError("NOT_TRADE_PROPOSER", "Only the proposer can cancel this trade offer");
  }
  markPendingDone(gameId);
  logEvent(gameId, String(game.currentTurnNumber), "trade_cancelled", {
    teamId,
    propertyId: payload.propertyId,
    propertyName: payload.name,
  });
}

export function buildHouse(gameId: string, teamId: string, propertyId: string): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  if (game.currentTeamId !== teamId) throw new GameError("NOT_YOUR_TURN", "It's not your turn");
  if (openPending(gameId)) throw new GameError("PENDING_ACTION", "Resolve the pending action first");
  if (queries.yearEndPendingByTeam(teamId)) {
    throw new GameError("YEAR_END_OPEN", "Finish your year-end checklist first");
  }
  const prop = queries.propertiesByGame(gameId).find((p) => p.id === propertyId);
  if (!prop) throw new GameError("NOT_FOUND", "Property not found");
  if (prop.kind !== "street") throw new GameError("INVALID_STATE", "Can only build on streets");
  if (prop.ownerTeamId !== teamId) throw new GameError("NOT_OWNER", "You do not own this property");
  if (prop.houses >= 5) throw new GameError("INVALID_STATE", "Property already has a hotel");
  if (!prop.colorGroup) throw new GameError("INVALID_STATE", "Property has no color group");
  const allProps = queries.propertiesByGame(gameId);
  if (!ownsFullColorGroup(allProps, teamId, prop.colorGroup)) {
    throw new GameError("INCOMPLETE_GROUP", "Own the full color group before building");
  }
  const cost = prop.houseCost ?? 100;
  const levelLabel = prop.houses === 4 ? "hotel" : "house";
  setResolving(gameId);
  createPending(gameId, teamId, {
    kind: "build_house",
    payload: { propertyId: prop.id, name: prop.name, cost, levelLabel, cashShort: balanceOf(teamId, "Cash") < cost },
    expectedEntries: [buildingPurchase(teamId, cost, prop.name, levelLabel)],
    status: "awaiting_journal",
  });
}

export type JournalSubmitInput =
  | { debitAccount: string; creditAccount: string; amount: number }
  | { lines: Array<{ accountName: string; debit: number; credit: number }> };

export function submitJournalEntry(
  gameId: string,
  teamId: string,
  input: JournalSubmitInput,
): SubmitResult {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  const pending = queries.pendingByGame(gameId);
  if (!pending) throw new GameError("NO_PENDING", "No pending journal entry");
  if (pending.teamId !== teamId) throw new GameError("NOT_YOUR_TURN", "Not your turn to journal");
  if (pending.status !== "awaiting_journal") throw new GameError("WRONG_STATE", "Not awaiting a journal entry");

  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;
  const expectedEntries = pending.expectedEntries as ExpectedEntry[];
  if (expectedEntries.length === 0) {
    throw new GameError("NO_EXPECTED", "No journal entry expected for this action");
  }
  const studentExpected = expectedEntries.find((e) => e.teamId === teamId) ?? expectedEntries[0]!;
  const multiline = studentExpected.lines.length > 2;
  let result;
  let postedLines: Array<{ accountName: string; debit: number; credit: number }>;

  if (multiline) {
    if (!("lines" in input) || !input.lines) {
      throw new GameError("BAD_INPUT", "This entry requires multi-line submission");
    }
    result = accounting.validateJournalEntryLines(input, studentExpected, game.difficulty);
    postedLines = input.lines;
  } else {
    if ("lines" in input && input.lines) {
      throw new GameError("BAD_INPUT", "Use debitAccount, creditAccount, and amount for two-line entries");
    }
    const legacy = input as { debitAccount: string; creditAccount: string; amount: number };
    result = accounting.validateJournalEntry(legacy, studentExpected, game.difficulty);
    postedLines = [
      { accountName: legacy.debitAccount, debit: legacy.amount, credit: 0 },
      { accountName: legacy.creditAccount, debit: 0, credit: legacy.amount },
    ];
  }
  bumpAttempts(gameId);

  if (!result.correct) {
    return { correct: false, feedback: result.feedback, errors: result.errors, attempts: pending.attempts + 1 };
  }

  const balanceSnapshots = new Map<string, number>();
  for (const line of postedLines) {
    if (!balanceSnapshots.has(line.accountName)) {
      balanceSnapshots.set(line.accountName, balanceOf(teamId, line.accountName));
    }
  }

  postEntry({
    gameId,
    teamId,
    turnId: String(game.currentTurnNumber),
    description: studentExpected.description,
    descriptionParams: studentExpected.descriptionParams,
    sourceEventId: `journal-${pending.id}`,
    year: team.currentYear,
    isStudentSubmitted: true,
    isCorrect: true,
    attemptOutcome: pending.attempts === 0 ? "first_try" : "retry",
    lines: postedLines,
  });

  // Counterparty entries: instead of auto-posting, chain to the next
  // receiver so they record their own journal entry (PRD §17.1 "both teams"
  // semantics, now universal). The current pending is closed without
  // advancing the turn; a new pending is opened for the receiver.
  maybeRecordDeferredForEventCard(gameId, teamId, pending, game.difficulty);
  if (pending.kind === "build_house") {
    queries.incrementPropertyHouses((pending.payload as { propertyId: string }).propertyId);
  }

  const remainingReceivers = expectedEntries.filter((e) => e.teamId !== teamId);
  if (remainingReceivers.length > 0) {
    // Close the current pending without advancing to awaiting_end — the
    // turn stays in "resolving" until every receiver has journaled.
    getDb().prepare("UPDATE pending_actions SET status = 'done' WHERE id = ?").run(pending.id);
    const next = remainingReceivers[0]!;
    const receiverTeam = queries.teamsByGame(gameId).find((t) => t.id === next.teamId);
    const sourceLabel = pending.kind === "rent_due"
      ? "rent receipt"
      : pending.kind === "event_card"
        ? "event-card transfer"
        : pending.kind === "trade_offer"
          ? "property trade"
          : pending.kind;
    const priorPayload = pending.payload as { counterpartyOf?: string; counterpartyName?: string };
    // Preserve the original counterparty (card drawer / rent payer) across
    // multi-receiver chains so receiver N+1 still sees the true source.
    const counterpartyOf = priorPayload.counterpartyOf ?? teamId;
    const counterpartyName =
      priorPayload.counterpartyName ?? queries.teamsByGame(gameId).find((t) => t.id === teamId)?.name ?? "Another team";
    createPending(gameId, next.teamId, {
      kind: "counterparty_entry",
      payload: {
        sourceKind: pending.kind,
        sourceLabel,
        counterpartyOf,
        counterpartyName,
        description: next.description,
      },
      expectedEntries: remainingReceivers,
      status: "awaiting_journal",
    });
    logEvent(gameId, String(game.currentTurnNumber), "counterparty_pending", {
      teamId: next.teamId,
      sourceTeamId: teamId,
      sourceKind: pending.kind,
      description: next.description,
    });
    return {
      correct: true,
      feedback: result.feedback,
      errors: [],
      attempts: pending.attempts + 1,
      balanceChanges: [...balanceSnapshots.entries()].map(([accountName, before]) => ({
        accountName,
        before,
        after: balanceOf(teamId, accountName),
      })),
      chainedTo: next.teamId,
      chainedToName: receiverTeam?.name,
    };
  }

  markPendingDone(gameId);
  logEvent(gameId, String(game.currentTurnNumber), "event_resolved", {
    teamId,
    description: studentExpected.description,
    note: "Journal entry posted",
  });
  return {
    correct: true,
    feedback: result.feedback,
    errors: [],
    attempts: pending.attempts + 1,
    balanceChanges: [...balanceSnapshots.entries()].map(([accountName, before]) => ({
      accountName,
      before,
      after: balanceOf(teamId, accountName),
    })),
  };
}

/**
 * Teacher reveal: auto-post the correct entry on behalf of the active team
 * (PRD §17.3, §24). Marks the entry as not student-submitted with the
 * "revealed" outcome so Phase 5 scoring can apply the no-bonus rule.
 */
export function revealAnswer(gameId: string): void {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active" && game.status !== "paused") {
    throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  }
  const pending = queries.pendingByGame(gameId);
  if (!pending) throw new GameError("NO_PENDING", "No pending action to reveal");
  if (pending.status !== "awaiting_journal") throw new GameError("WRONG_STATE", "Not awaiting a journal entry");
  const teamId = pending.teamId;
  const team = queries.teamsByGame(gameId).find((t) => t.id === teamId)!;
  const expectedEntries = pending.expectedEntries as ExpectedEntry[];
  if (expectedEntries.length === 0) {
    throw new GameError("NO_EXPECTED", "No journal entry to reveal");
  }
  const studentExpected = expectedEntries.find((e) => e.teamId === teamId) ?? expectedEntries[0]!;
  if (studentExpected.lines.length > 0) {
    postEntry({
      gameId,
      teamId,
      turnId: String(game.currentTurnNumber),
      description: studentExpected.description,
      descriptionParams: studentExpected.descriptionParams,
      sourceEventId: `reveal-${pending.id}`,
      year: team.currentYear,
      isStudentSubmitted: false,
      isCorrect: true,
      attemptOutcome: "revealed",
      lines: studentExpected.lines.map((l) => ({
        accountName: l.accountName,
        debit: l.debit,
        credit: l.credit,
      })),
    });
  }
  // Teacher reveal always auto-posts every remaining counterparty so the
  // teacher can unblock the game without each receiver acting individually.
  for (const e of expectedEntries) {
    if (e.teamId === teamId) continue;
    postExpectedAsSystem(gameId, e.teamId, String(game.currentTurnNumber), e, team.currentYear);
  }
  maybeRecordDeferredForEventCard(gameId, teamId, pending, game.difficulty);
  if (pending.kind === "build_house") {
    queries.incrementPropertyHouses((pending.payload as { propertyId: string }).propertyId);
  }
  markPendingDone(gameId);
  const firstDebit = studentExpected.lines.find((l) => l.debit > 0);
  const firstCredit = studentExpected.lines.find((l) => l.credit > 0);
  logEvent(gameId, null, "teacher_override", {
    action: "reveal_answer",
    teamId,
    description: studentExpected.description,
    debitAccount: firstDebit?.accountName,
    creditAccount: firstCredit?.accountName,
    amount: firstDebit?.debit,
    lineCount: studentExpected.lines.length,
  });
}

export function endTurn(gameId: string): Game {
  const game = queries.gameById(gameId);
  if (!game) throw new GameError("NOT_FOUND", "Game not found");
  if (game.status !== "active") throw new GameError("INVALID_STATE", `Game is ${game.status}`, { status: game.status });
  if (game.turnPhase === "awaiting_roll") {
    throw new GameError("INVALID_STATE", "Roll the dice before ending your turn");
  }
  if (game.turnPhase === "resolving") {
    const pending = openPending(gameId);
    if (pending) throw new GameError("PENDING_OPEN", "A pending action is still open");
  }
  if (game.turnPhase !== "awaiting_end") {
    throw new GameError("INVALID_STATE", "Finish resolving this turn before ending");
  }
  const teams = queries.teamsByGame(gameId);
  const idx = teams.findIndex((t) => t.id === game.currentTeamId);
  const next = teams[(idx + 1) % teams.length]!;
  const ts = now();
  getDb()
    .prepare("UPDATE games SET current_team_id = ?, current_turn_number = current_turn_number + 1, turn_phase = ?, updated_at = ? WHERE id = ?")
    .run(next.id, "awaiting_roll", ts, gameId);
  logEvent(gameId, String(game.currentTurnNumber + 1), "move", { note: "Turn advanced", nextTeamId: next.id });
  return queries.gameById(gameId)!;
}

export { type Property };
