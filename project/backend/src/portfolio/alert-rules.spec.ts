import { evaluatePlanAlerts } from './alert-rules';

describe('portfolio alert rules', () => {
  const asOf = new Date('2026-07-07T18:00:00.000Z');

  it('emits independent target and date alerts', () => {
    expect(
      evaluatePlanAlerts({
        asOf,
        targetDate: new Date('2026-07-06T00:00:00.000Z'),
        currentPriceMicros: 120n,
        targetPriceMicros: 100n,
      }),
    ).toEqual([
      { type: 'TARGET_HIT', severity: 'CRITICAL' },
      { type: 'OVERDUE', severity: 'CRITICAL', daysUntilTarget: -1 },
    ]);
  });

  it('warns seven calendar days before the target date', () => {
    expect(
      evaluatePlanAlerts({
        asOf,
        targetDate: new Date('2026-07-14T23:59:00.000Z'),
        targetPriceMicros: 100n,
      }),
    ).toEqual([
      { type: 'APPROACHING', severity: 'WARNING', daysUntilTarget: 7 },
    ]);
  });

  it('does not emit an alert outside the warning window', () => {
    expect(
      evaluatePlanAlerts({
        asOf,
        targetDate: new Date('2026-07-15T00:00:00.000Z'),
        currentPriceMicros: 99n,
        targetPriceMicros: 100n,
      }),
    ).toEqual([]);
  });
});
