import { t, format, isValidKey, type I18nKey } from "./index.js";
import { TEAM_NAMES } from "../game/rules.js";

const ACCOUNT_KEY_MAP: Record<string, I18nKey> = {
  Cash: "accounts.cash",
  Property: "accounts.property",
  Buildings: "accounts.buildings",
  "Loan Payable": "accounts.loanPayable",
  "Owner Capital": "accounts.ownerCapital",
  "Retained Earnings": "accounts.retainedEarnings",
  "Rent Revenue": "accounts.rentRevenue",
  "Event Revenue": "accounts.eventRevenue",
  "Rent Expense": "accounts.rentExpense",
  "Repair Expense": "accounts.repairExpense",
  "Interest Expense": "accounts.interestExpense",
  "Event Expense": "accounts.eventExpense",
  "Accounts Receivable": "accounts.accountsReceivable",
  "Prepaid Services": "accounts.prepaidServices",
  "Accounts Payable": "accounts.accountsPayable",
  "Credit Line Payable": "accounts.creditLinePayable",
  "Interest Payable": "accounts.interestPayable",
  "Internet Expense": "accounts.internetExpense",
  "Maintenance Expense": "accounts.maintenanceExpense",
  "Gain on Sale": "accounts.gainOnSale",
  "Loss on Sale": "accounts.lossOnSale",
};

export function getAccountKey(name: string): I18nKey {
  return ACCOUNT_KEY_MAP[name] ?? (name as I18nKey);
}

export function getAccountLabel(name: string): string {
  return t(getAccountKey(name));
}

const SPACE_KEY_MAP: Record<string, I18nKey> = {
  GO: "boardSpaces.go",
  "Community Chest": "boardSpaces.communityChest",
  Chance: "boardSpaces.chance",
  "Income Tax": "boardSpaces.incomeTax",
  "Reading Railroad": "boardSpaces.readingRailroad",
  "Oriental Avenue": "boardSpaces.orientalAvenue",
  "Vermont Avenue": "boardSpaces.vermontAvenue",
  "Connecticut Avenue": "boardSpaces.connecticutAvenue",
  Bank: "boardSpaces.bank",
  "St. Charles Place": "boardSpaces.stCharlesPlace",
  "Schiller Place": "boardSpaces.schillerPlace",
  "States Avenue": "boardSpaces.statesAvenue",
  "Virginia Avenue": "boardSpaces.virginiaAvenue",
  "Pennsylvania Railroad": "boardSpaces.pennsylvaniaRailroad",
  "St. James Place": "boardSpaces.stJamesPlace",
  "Tennessee Avenue": "boardSpaces.tennesseeAvenue",
  "New York Avenue": "boardSpaces.newYorkAvenue",
  "Free Parking": "boardSpaces.freeParking",
  "Kentucky Avenue": "boardSpaces.kentuckyAvenue",
  "Indiana Avenue": "boardSpaces.indianaAvenue",
  "Illinois Avenue": "boardSpaces.illinoisAvenue",
  "B&O Railroad": "boardSpaces.bAndORailroad",
  "Atlantic Avenue": "boardSpaces.atlanticAvenue",
  "Ventnor Avenue": "boardSpaces.ventnorAvenue",
  "Waterfront Avenue": "boardSpaces.waterfrontAvenue",
  "Marvin Gardens": "boardSpaces.marvinGardens",
  "Pacific Avenue": "boardSpaces.pacificAvenue",
  "North Carolina Avenue": "boardSpaces.northCarolinaAvenue",
  "Pennsylvania Avenue": "boardSpaces.pennsylvaniaAvenue",
  "Short Line Railroad": "boardSpaces.shortLineRailroad",
  "Park Place": "boardSpaces.parkPlace",
  "Luxury Tax": "boardSpaces.luxuryTax",
  Boardwalk: "boardSpaces.boardwalk",
};

export function getSpaceKey(name: string): I18nKey {
  return SPACE_KEY_MAP[name] ?? (name as I18nKey);
}

export function getSpaceLabel(name: string): string {
  return t(getSpaceKey(name));
}

const PROPERTY_KEY_MAP: Record<string, I18nKey> = {
  "Mediterranean Avenue": "boardProperties.mediterraneanAvenue",
  "Baltic Avenue": "boardProperties.balticAvenue",
  "Oriental Avenue": "boardProperties.orientalAvenue",
  "Vermont Avenue": "boardProperties.vermontAvenue",
  "Connecticut Avenue": "boardProperties.connecticutAvenue",
  "Reading Railroad": "boardProperties.readingRailroad",
  "St. Charles Place": "boardProperties.stCharlesPlace",
  "Schiller Place": "boardProperties.schillerPlace",
  "States Avenue": "boardProperties.statesAvenue",
  "Virginia Avenue": "boardProperties.virginiaAvenue",
  "Pennsylvania Railroad": "boardProperties.pennsylvaniaRailroad",
  "St. James Place": "boardProperties.stJamesPlace",
  "Tennessee Avenue": "boardProperties.tennesseeAvenue",
  "New York Avenue": "boardProperties.newYorkAvenue",
  "Kentucky Avenue": "boardProperties.kentuckyAvenue",
  "Indiana Avenue": "boardProperties.indianaAvenue",
  "Illinois Avenue": "boardProperties.illinoisAvenue",
  "B&O Railroad": "boardProperties.bAndORailroad",
  "Atlantic Avenue": "boardProperties.atlanticAvenue",
  "Ventnor Avenue": "boardProperties.ventnorAvenue",
  "Waterfront Avenue": "boardProperties.waterfrontAvenue",
  "Marvin Gardens": "boardProperties.marvinGardens",
  "Pacific Avenue": "boardProperties.pacificAvenue",
  "North Carolina Avenue": "boardProperties.northCarolinaAvenue",
  "Pennsylvania Avenue": "boardProperties.pennsylvaniaAvenue",
  "Short Line Railroad": "boardProperties.shortLineRailroad",
  "Park Place": "boardProperties.parkPlace",
  Boardwalk: "boardProperties.boardwalk",
};

export function getPropertyKey(name: string): I18nKey {
  return PROPERTY_KEY_MAP[name] ?? (name as I18nKey);
}

export function getPropertyLabel(name: string): string {
  return t(getPropertyKey(name));
}

const COLOR_GROUP_KEY_MAP: Record<string, I18nKey> = {
  brown: "colorGroups.brown",
  light_blue: "colorGroups.lightBlue",
  pink: "colorGroups.pink",
  orange: "colorGroups.orange",
  red: "colorGroups.red",
  yellow: "colorGroups.yellow",
  green: "colorGroups.green",
  dark_blue: "colorGroups.darkBlue",
};

export function getColorGroupLabel(name: string | undefined): string {
  if (!name) return "";
  return t(COLOR_GROUP_KEY_MAP[name] ?? (name as I18nKey));
}

const TEAM_NAME_KEY_MAP: Record<string, I18nKey> = {
  Red: "teamNames.red",
  Blue: "teamNames.blue",
  Green: "teamNames.green",
  Yellow: "teamNames.yellow",
  Purple: "teamNames.purple",
  Pink: "teamNames.pink",
  Orange: "teamNames.orange",
  Teal: "teamNames.teal",
};

export function getTeamNameKey(name: string): I18nKey {
  return TEAM_NAME_KEY_MAP[name] ?? (name as I18nKey);
}

export function getTeamNameLabel(name: string): string {
  return t(getTeamNameKey(name));
}

export function getTeamNameByIndex(index: number): string {
  return t(getTeamNameKey(TEAM_NAMES[index % TEAM_NAMES.length]!));
}

export function getDifficultyLabel(difficulty: "cash" | "accrual"): string {
  return t(difficulty === "cash" ? "difficulty.cash" : "difficulty.accrual");
}

export function getGameStatusLabel(status: string): string {
  const key = `gameStatus.${status}` as I18nKey;
  return isValidKey(key) ? t(key) : status;
}

export function getPaymentMethodLabel(method: string): string {
  const key = `paymentMethod.${method}` as I18nKey;
  return isValidKey(key) ? t(key) : method;
}

export function getNormalBalanceLabel(side: "debit" | "credit"): string {
  return t(side === "debit" ? "normalBalance.debit" : "normalBalance.credit");
}

export function getAccountTypeLabel(type: string): string {
  const key = `accountTypes.${type}` as I18nKey;
  return isValidKey(key) ? t(key) : type;
}

export function getEventCardTitleKey(cardId: string): I18nKey {
  return `eventCards.${cardId}.title` as I18nKey;
}

export function getEventCardTitle(cardId: string): string {
  return t(`eventCards.${cardId}.title` as I18nKey);
}

export function getEventCardDescription(
  cardId: string,
  params?: Record<string, string | number>,
): string {
  return t(`eventCards.${cardId}.description` as I18nKey, params);
}

export function getEventCardTeachingPoint(cardId: string): string | undefined {
  const key = `eventCards.${cardId}.teachingPoint` as I18nKey;
  return isValidKey(key) ? t(key) : undefined;
}

export function getJournalDescription(entry: {
  description: string;
  descriptionParams?: Record<string, unknown> | null;
}): string {
  if (isValidKey(entry.description)) {
    const params = (entry.descriptionParams ?? undefined) as
      | Record<string, string | number>
      | undefined;
    return format(entry.description as I18nKey, params);
  }
  return entry.description;
}

export function getEntryDescription(
  key: string,
  params?: Record<string, string | number>,
): string {
  return isValidKey(key) ? format(key as I18nKey, params) : key;
}
