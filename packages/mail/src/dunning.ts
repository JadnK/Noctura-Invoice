/**
 * Mahnwesen. Die Anwendung schlaegt vor, sie verschickt nie von selbst.
 * Ohne ausdrueckliche Aktivierung durch den Nutzer bleibt jede Mahnung ein
 * Entwurf mit Vorschau.
 */

export interface DunningLevel {
  readonly step: number;
  readonly name: string;
  readonly daysAfterDue: number;
  readonly feeCents: number;
  readonly interestRateBp: number;
}

export const DEFAULT_LEVELS: readonly DunningLevel[] = [
  { step: 0, name: 'Zahlungserinnerung', daysAfterDue: 3, feeCents: 0, interestRateBp: 0 },
  { step: 1, name: 'Erste Mahnung', daysAfterDue: 10, feeCents: 0, interestRateBp: 0 },
  { step: 2, name: 'Zweite Mahnung', daysAfterDue: 20, feeCents: 500, interestRateBp: 0 },
  { step: 3, name: 'Letzte Mahnung', daysAfterDue: 30, feeCents: 1000, interestRateBp: 0 },
];

export interface DunningCandidate {
  readonly invoiceId: string;
  readonly dueDate: string;
  readonly openCents: number;
  readonly status: string;
  readonly lastStepSent: number | null;
}

export interface DunningProposal {
  readonly invoiceId: string;
  readonly level: DunningLevel;
  readonly daysOverdue: number;
  readonly feeCents: number;
  readonly interestCents: number;
  readonly totalCents: number;
}

const DAY = 86_400_000;

function interest(openCents: number, days: number, rateBp: number): number {
  if (rateBp === 0 || days <= 0) return 0;
  const numerator = openCents * rateBp * days;
  const denominator = 10_000 * 365;
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/**
 * Vorschlaege fuer faellige Mahnungen. Es wird immer nur die naechste Stufe
 * vorgeschlagen — niemals zwei auf einmal, auch wenn der Rueckstand alt ist.
 */
export function proposeDunning(
  candidates: readonly DunningCandidate[],
  todayIso: string,
  levels: readonly DunningLevel[] = DEFAULT_LEVELS,
): DunningProposal[] {
  const today = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  const sorted = [...levels].sort((a, b) => a.step - b.step);
  const proposals: DunningProposal[] = [];

  for (const candidate of candidates) {
    if (candidate.openCents <= 0) continue;
    if (['paid', 'cancelled', 'draft', 'uncollectible'].includes(candidate.status)) continue;

    const daysOverdue = Math.round((today - Date.parse(`${candidate.dueDate.slice(0, 10)}T00:00:00Z`)) / DAY);
    if (daysOverdue <= 0) continue;

    const nextStep = candidate.lastStepSent === null ? sorted[0].step : candidate.lastStepSent + 1;
    const level = sorted.find((l) => l.step === nextStep);
    if (!level || daysOverdue < level.daysAfterDue) continue;

    const interestCents = interest(candidate.openCents, daysOverdue, level.interestRateBp);
    proposals.push({
      invoiceId: candidate.invoiceId,
      level,
      daysOverdue,
      feeCents: level.feeCents,
      interestCents,
      totalCents: candidate.openCents + level.feeCents + interestCents,
    });
  }

  return proposals.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
