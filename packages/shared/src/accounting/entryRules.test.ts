import { describe, expect, it } from "vitest";
import {
  apPaidCash,
  apRolledToLoan,
  cashEventExpense,
  cashEventRevenue,
  interestAddedToLoan,
  interestPaidCash,
  loanTaken,
  multiTeamEventCollect,
  multiTeamEventPay,
  ownerCapitalContribution,
  prepaidPurchase,
  prepaidRecognition,
  propertyAssignedAtSetup,
  propertyPurchase,
  buildingPurchase,
  propertySaleSeller,
  propertyTradeBuyer,
  repairBillPayable,
  rentPaidCash,
  rentPaidCredit,
  rentPaidCreditLine,
} from "./entryRules.js";

const PAYER = "t-red";
const OWNER = "t-blue";

describe("entryRules — PRD §22", () => {
  it("propertyAssignedAtSetup: Dr Property / Cr Owner Capital", () => {
    const e = propertyAssignedAtSetup(PAYER, 200, "Property A");
    expect(e.lines).toEqual([
      { accountName: "Property", debit: 200, credit: 0 },
      { accountName: "Owner Capital", debit: 0, credit: 200 },
    ]);
  });

  it("propertyPurchase: Dr Property / Cr Cash", () => {
    const e = propertyPurchase(PAYER, 150, "Property B");
    expect(e.lines[0]).toMatchObject({ accountName: "Property", debit: 150 });
    expect(e.lines[1]).toMatchObject({ accountName: "Cash", credit: 150 });
  });

  it("rentPaidCash: both teams", () => {
    const [payer, owner] = rentPaidCash(PAYER, OWNER, 120);
    expect(payer.lines).toEqual([
      { accountName: "Rent Expense", debit: 120, credit: 0 },
      { accountName: "Cash", debit: 0, credit: 120 },
    ]);
    expect(owner.lines).toEqual([
      { accountName: "Cash", debit: 120, credit: 0 },
      { accountName: "Rent Revenue", debit: 0, credit: 120 },
    ]);
  });

  it("rentPaidCredit: A/P and A/R", () => {
    const [payer, owner] = rentPaidCredit(PAYER, OWNER, 80);
    expect(payer.lines).toContainEqual({ accountName: "Accounts Payable", debit: 0, credit: 80 });
    expect(owner.lines).toContainEqual({ accountName: "Accounts Receivable", debit: 80, credit: 0 });
  });

  it("rentPaidCreditLine: Credit Line Payable for payer, cash for owner", () => {
    const [payer, owner] = rentPaidCreditLine(PAYER, OWNER, 60);
    expect(payer.lines).toContainEqual({ accountName: "Credit Line Payable", debit: 0, credit: 60 });
    expect(owner.lines).toContainEqual({ accountName: "Cash", debit: 60, credit: 0 });
  });

  it("cashEventRevenue / cashEventExpense", () => {
    const rev = cashEventRevenue(PAYER, 250, "conference");
    expect(rev.lines[0]).toMatchObject({ accountName: "Cash", debit: 250 });
    expect(rev.lines[1]).toMatchObject({ accountName: "Event Revenue", credit: 250 });

    const exp = cashEventExpense(PAYER, 80, "Event Expense", "utility bill");
    expect(exp.lines[0]).toMatchObject({ accountName: "Event Expense", debit: 80 });
    expect(exp.lines[1]).toMatchObject({ accountName: "Cash", credit: 80 });
  });

  it("ownerCapitalContribution: Dr Cash / Cr Owner Capital", () => {
    const e = ownerCapitalContribution(PAYER, 200, "inheritance");
    expect(e.lines[1]).toMatchObject({ accountName: "Owner Capital", credit: 200 });
  });

  it("repairBillPayable: Dr Repair Expense / Cr Accounts Payable", () => {
    const e = repairBillPayable(PAYER, 150);
    expect(e.lines).toContainEqual({ accountName: "Accounts Payable", debit: 0, credit: 150 });
  });

  it("prepaidPurchase + recognition clear Prepaid Services", () => {
    const p = prepaidPurchase(PAYER, 120, "internet");
    expect(p.lines[0]).toMatchObject({ accountName: "Prepaid Services", debit: 120 });
    const r = prepaidRecognition(PAYER, 120, "Internet Expense");
    expect(r.lines[0]).toMatchObject({ accountName: "Internet Expense", debit: 120 });
    expect(r.lines[1]).toMatchObject({ accountName: "Prepaid Services", credit: 120 });
  });

  it("loanTaken, interestPaidCash, interestAddedToLoan", () => {
    expect(loanTaken(PAYER, 500).lines[1]).toMatchObject({ accountName: "Loan Payable", credit: 500 });
    expect(interestPaidCash(PAYER, 20).lines[0]).toMatchObject({ accountName: "Interest Expense", debit: 20 });
    expect(interestAddedToLoan(PAYER, 15).lines[1]).toMatchObject({ accountName: "Loan Payable", credit: 15 });
  });

  it("apPaidCash both sides", () => {
    const [debtor, creditor] = apPaidCash(PAYER, OWNER, 100);
    expect(debtor.lines).toContainEqual({ accountName: "Cash", debit: 0, credit: 100 });
    expect(creditor.lines).toContainEqual({ accountName: "Cash", debit: 100, credit: 0 });
  });

  it("apRolledToLoan: debtor gets Loan Payable credit", () => {
    const [debtor, creditor] = apRolledToLoan(PAYER, OWNER, 100);
    expect(debtor.lines).toContainEqual({ accountName: "Loan Payable", debit: 0, credit: 100 });
    expect(creditor.lines).toContainEqual({ accountName: "Cash", debit: 100, credit: 0 });
  });

  it("multiTeamEventPay: payer total = perTeam * count", () => {
    const others = ["t-blue", "t-green"];
    const entries = multiTeamEventPay(PAYER, others, 50, "promotion");
    const payer = entries.find((e) => e.teamId === PAYER)!;
    expect(payer.lines[0]).toMatchObject({ accountName: "Event Expense", debit: 100 });
    const recip = entries.find((e) => e.teamId === "t-blue")!;
    expect(recip.lines[1]).toMatchObject({ accountName: "Event Revenue", credit: 50 });
  });

  it("multiTeamEventCollect: collector total = perTeam * count", () => {
    const others = ["t-blue", "t-green", "t-yellow"];
    const entries = multiTeamEventCollect(PAYER, others, 40, "festival");
    const collector = entries.find((e) => e.teamId === PAYER)!;
    expect(collector.lines[0]).toMatchObject({ accountName: "Cash", debit: 120 });
  });

  it("buildingPurchase: Dr Buildings / Cr Cash", () => {
    const e = buildingPurchase(PAYER, 100, "Boardwalk", "house");
    expect(e.lines[0]).toMatchObject({ accountName: "Buildings", debit: 100 });
    expect(e.lines[1]).toMatchObject({ accountName: "Cash", credit: 100 });
  });

  it("propertySaleSeller: gain case (3 lines)", () => {
    const e = propertySaleSeller(PAYER, 300, 200, "Boardwalk");
    expect(e.lines).toEqual([
      { accountName: "Cash", debit: 300, credit: 0 },
      { accountName: "Property", debit: 0, credit: 200 },
      { accountName: "Gain on Sale", debit: 0, credit: 100 },
    ]);
  });

  it("propertySaleSeller: loss case (3 lines)", () => {
    const e = propertySaleSeller(PAYER, 150, 200, "Park Place");
    expect(e.lines).toEqual([
      { accountName: "Cash", debit: 150, credit: 0 },
      { accountName: "Loss on Sale", debit: 50, credit: 0 },
      { accountName: "Property", debit: 0, credit: 200 },
    ]);
  });

  it("propertySaleSeller: equal price and book (2 lines)", () => {
    const e = propertySaleSeller(PAYER, 200, 200, "Mediterranean Avenue");
    expect(e.lines).toEqual([
      { accountName: "Cash", debit: 200, credit: 0 },
      { accountName: "Property", debit: 0, credit: 200 },
    ]);
  });

  it("propertyTradeBuyer: Dr Property / Cr Cash", () => {
    const e = propertyTradeBuyer(PAYER, 250, "Baltic Avenue");
    expect(e.lines).toEqual([
      { accountName: "Property", debit: 250, credit: 0 },
      { accountName: "Cash", debit: 0, credit: 250 },
    ]);
  });
});
