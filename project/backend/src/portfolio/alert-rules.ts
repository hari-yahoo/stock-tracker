export type AlertType = 'TARGET_HIT' | 'OVERDUE' | 'DUE_TODAY' | 'APPROACHING';

export type AlertSeverity = 'CRITICAL' | 'WARNING';

export interface PlanAlert {
  type: AlertType;
  severity: AlertSeverity;
  daysUntilTarget?: number;
}

const DAY_MS = 86_400_000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function evaluatePlanAlerts(input: {
  asOf: Date;
  targetDate: Date;
  currentPriceMicros?: bigint;
  targetPriceMicros: bigint;
}): PlanAlert[] {
  const alerts: PlanAlert[] = [];

  if (
    input.currentPriceMicros !== undefined &&
    input.currentPriceMicros >= input.targetPriceMicros
  ) {
    alerts.push({ type: 'TARGET_HIT', severity: 'CRITICAL' });
  }

  const daysUntilTarget = Math.round(
    (utcDay(input.targetDate) - utcDay(input.asOf)) / DAY_MS,
  );
  if (daysUntilTarget < 0) {
    alerts.push({
      type: 'OVERDUE',
      severity: 'CRITICAL',
      daysUntilTarget,
    });
  } else if (daysUntilTarget === 0) {
    alerts.push({
      type: 'DUE_TODAY',
      severity: 'CRITICAL',
      daysUntilTarget,
    });
  } else if (daysUntilTarget <= 7) {
    alerts.push({
      type: 'APPROACHING',
      severity: 'WARNING',
      daysUntilTarget,
    });
  }

  return alerts;
}
