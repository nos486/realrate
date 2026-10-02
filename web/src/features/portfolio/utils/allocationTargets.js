/**
 * allocationTargets.js — How a portfolio's categories compare with the shares the user aims for
 *
 * The user gives some categories a target share (%, `layout.targets`, utils/portfolioLayout.js);
 * the targets of a portfolio add up to 100. Each category's current share is its value today over
 * the portfolio's value. A category whose share is more than DRIFT_THRESHOLD points away from its
 * target has drifted (a category without a target aims for 0%, once targets are set). Drift is
 * only judged once the targets add up to 100 — before that the plan is not complete.
 *
 * Pure: the targets card (AllocationTargetsCard.jsx), the drift banner and the alerts
 * (shared/alerts) read it.
 */

/** Points (of 100) a category may be away from its target before it is flagged */
export const DRIFT_THRESHOLD = 5;
const COMPLETE_TOLERANCE = 0.5;

/** The key a category's target is stored under (see utils/portfolioLayout.js) */
export function targetKeyOf(group) {
  const id = String(group?.id || group?.key || '');
  if (id.startsWith('g_')) return id;
  return `g_${group?.key === 'other' ? 'other' : group?.key || id}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** The sum of the targets (one decimal) */
export function targetsTotal(targets = {}) {
  return round1(Object.values(targets || {}).reduce((sum, v) => sum + (Number(v) || 0), 0));
}

/**
 * @param {Array<object>} groups category groups (buildCustomCategoryGroups, with keepEmpty so a
 *   targeted category holding nothing still shows)
 * @param {Record<string, number>} [targets]
 * @param {{ threshold?: number }} [options]
 * @returns {{
 *   rows: Array<{ key: string, targetKey: string, name: string, icon: string, value: number,
 *     currentPct: number, targetPct: number|null, diff: number|null, drifted: boolean }>,
 *   total: number, targetsTotal: number, hasTargets: boolean, complete: boolean,
 *   drifted: object[]
 * }}
 */
export function buildAllocation(groups = [], targets = {}, { threshold = DRIFT_THRESHOLD } = {}) {
  const total = groups.reduce((sum, g) => sum + (Number(g.totalRealValue) || 0), 0);
  const sum = targetsTotal(targets);
  const hasTargets = sum > 0;
  const complete = hasTargets && Math.abs(sum - 100) <= COMPLETE_TOLERANCE;

  const rows = groups
    .map((g) => {
      const targetKey = targetKeyOf(g);
      const value = Number(g.totalRealValue) || 0;
      const currentPct = total > 0 ? round1((value / total) * 100) : 0;
      const target = Number(targets?.[targetKey]) || 0;
      const targetPct = hasTargets ? target : null;
      const diff = targetPct === null ? null : round1(currentPct - targetPct);
      return {
        key: g.key || g.id,
        targetKey,
        name: g.name || g.title,
        icon: g.icon || g.key,
        value,
        currentPct,
        targetPct,
        diff,
        drifted: complete && total > 0 && Math.abs(diff) > threshold,
      };
    })
    .filter((r) => r.value > 0 || (r.targetPct || 0) > 0);

  return {
    rows,
    total,
    targetsTotal: sum,
    hasTargets,
    complete,
    drifted: rows.filter((r) => r.drifted),
  };
}

const pct = (n) => `${Math.abs(n).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;

/** «طلا ۸٪ بیشتر از هدف» */
export function describeDrift(row) {
  return `${row.name} ${pct(row.diff)} ${row.diff > 0 ? 'بیشتر' : 'کمتر'} از هدف`;
}
