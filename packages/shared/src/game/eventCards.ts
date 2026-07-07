// PRD §11 — event card decks as data objects (PRD §30.4 data-driven).
import type { Difficulty } from "../types.js";

export type EventCardKind =
  | "cash_revenue"
  | "cash_expense"
  | "owner_capital"
  | "multi_team_pay"
  | "multi_team_collect"
  | "accrual_revenue_receivable"
  | "accrual_expense_payable"
  | "accrual_prepaid"
  | "credit_method_modifier";

export interface EventCardBase {
  id: string;
  mode: Difficulty;
  title: string;
  description: string;
  amount: number;
  kind: EventCardKind;
  /** Account for cash_expense / accrual_expense_payable / prepaid recognition. */
  expenseAccount?: string;
  /** Account for revenue side (defaults to Event Revenue). */
  revenueAccount?: string;
  /** Per-team amount for multi_team_* cards. */
  perTeamAmount?: number;
  /** For accrual cards: the year-end follow-up recognition expense account. */
  yearEndRecognitionAccount?: string;
  teachingPoint?: string;
}

export const CASH_EVENT_DECK: readonly EventCardBase[] = [
  {
    id: "cash_inherit_money",
    mode: "cash",
    title: "Inherit Money",
    description: "You inherit $200 and invest it into your property business.",
    amount: 200,
    kind: "owner_capital",
    teachingPoint: "Owner investment is not revenue.",
  },
  {
    id: "cash_emergency_repairs",
    mode: "cash",
    title: "Emergency Repairs",
    description: "One of your properties needs urgent repairs. Pay $150.",
    amount: 150,
    kind: "cash_expense",
  },
  {
    id: "cash_charity_event",
    mode: "cash",
    title: "Charity Event Invitation",
    description: "You sponsor a local charity event. Pay $100.",
    amount: 100,
    kind: "cash_expense",
  },
  {
    id: "cash_major_conference",
    mode: "cash",
    title: "Major Conference Booking",
    description: "A major conference uses one of your properties. Receive $250 special rent.",
    amount: 250,
    kind: "cash_revenue",
  },
  {
    id: "cash_road_closure",
    mode: "cash",
    title: "Emergency Road Closure",
    description: "Road repairs block access to one of your properties. Pay $120 in operating costs.",
    amount: 120,
    kind: "cash_expense",
  },
  {
    id: "cash_neighborhood_promotion",
    mode: "cash",
    title: "Neighborhood Promotion",
    description: "You host a neighborhood promotion. Pay each other team $50.",
    amount: 50,
    perTeamAmount: 50,
    kind: "multi_team_pay",
  },
  {
    id: "cash_local_festival",
    mode: "cash",
    title: "Local Festival Boost",
    description: "A local festival increases visitors. Collect $40 from each other team.",
    amount: 40,
    perTeamAmount: 40,
    kind: "multi_team_collect",
  },
  {
    id: "cash_utility_bill",
    mode: "cash",
    title: "Utility Bill",
    description: "Pay $80 in utility fees for your properties.",
    amount: 80,
    kind: "cash_expense",
  },
  {
    id: "cash_cleaning_fee",
    mode: "cash",
    title: "Cleaning Fee",
    description: "Pay $60 to clean one of your rental properties.",
    amount: 60,
    kind: "cash_expense",
  },
  {
    id: "cash_investor_contribution",
    mode: "cash",
    title: "Investor Contribution",
    description: "Your investors contribute $100 to support your business.",
    amount: 100,
    kind: "owner_capital",
    teachingPoint: "Cash received from owners increases equity, not revenue.",
  },
];

export const ACCRUAL_EVENT_DECK: readonly EventCardBase[] = [
  {
    id: "accrual_conference_collect_later",
    mode: "accrual",
    title: "Conference Booking — Collect Later",
    description: "A major conference books one of your properties. You earn $250 now, but payment arrives at year-end.",
    amount: 250,
    kind: "accrual_revenue_receivable",
    revenueAccount: "Event Revenue",
  },
  {
    id: "accrual_repair_bill_pay_later",
    mode: "accrual",
    title: "Emergency Repair Bill — Pay Later",
    description: "One of your properties needs urgent repairs. The contractor sends a $150 bill due at year-end.",
    amount: 150,
    kind: "accrual_expense_payable",
  },
  {
    id: "accrual_internet_plan",
    mode: "accrual",
    title: "Annual Internet Plan",
    description: "Pay $120 now for one year of internet service for your rental business.",
    amount: 120,
    kind: "accrual_prepaid",
    yearEndRecognitionAccount: "Internet Expense",
  },
  {
    id: "accrual_maintenance_contract",
    mode: "accrual",
    title: "Maintenance Contract",
    description: "Pay $200 now for a one-year maintenance contract.",
    amount: 200,
    kind: "accrual_prepaid",
    yearEndRecognitionAccount: "Maintenance Expense",
  },
  {
    id: "accrual_charity_pledge",
    mode: "accrual",
    title: "Charity Pledge",
    description: "You promise to donate $100 to a charity event. Payment is due at year-end.",
    amount: 100,
    kind: "accrual_expense_payable",
  },
  {
    id: "accrual_road_closure_fee",
    mode: "accrual",
    title: "Road Closure Fee — Pay Later",
    description: "Emergency road repairs affect one of your properties. You owe $120 in road access fees, due at year-end.",
    amount: 120,
    kind: "accrual_expense_payable",
  },
  {
    id: "accrual_player_rent_credit",
    mode: "accrual",
    title: "Player Rent on Credit",
    description: "The next rent payment you owe to another team may be paid on credit instead of cash.",
    amount: 0,
    kind: "credit_method_modifier",
  },
  {
    id: "accrual_credit_line_payment",
    mode: "accrual",
    title: "Credit Line Payment",
    description: "Use your bank credit line to pay one required expense or rent payment.",
    amount: 0,
    kind: "credit_method_modifier",
  },
  {
    id: "accrual_software_subscription",
    mode: "accrual",
    title: "Software Subscription",
    description: "Pay $90 now for a one-year business software subscription.",
    amount: 90,
    kind: "accrual_prepaid",
    yearEndRecognitionAccount: "Internet Expense",
  },
];

export function getDeck(difficulty: Difficulty): readonly EventCardBase[] {
  return difficulty === "cash" ? CASH_EVENT_DECK : ACCRUAL_EVENT_DECK;
}
