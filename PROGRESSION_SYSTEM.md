# LIFE RPG — Progression System

## XP formula

```
XP_required(L) = 500 + 0.98 × (L − 1)²
```

This is the XP required to advance **from level L to level L+1**. The formula is
configurable via `settings` (`progressionBaseXp`, `progressionQuadratic`,
`progressionLinear`) and validated to support ≥1,000 levels.

## Level calculation

Total lifetime XP → level via binary search on the cumulative XP curve:

| Level | XP required for this level | Cumulative XP to reach |
|-------|---------------------------|------------------------|
| 1 | — | 0 |
| 2 | 500 | 500 |
| 3 | 500 + 0.98×1² ≈ 501 | 1,001 |
| 4 | 500 + 0.98×2² ≈ 504 | 1,505 |
| 10 | 500 + 0.98×9² ≈ 579 | ~5,000 |
| 100 | 500 + 0.98×99² ≈ 10,102 | ~325,000 |

## WPF-parity rule (2:1 attribute XP)

**Attribute XP = 2 × player XP.** This is a hard invariant:

- When an activity awards `P` player XP, the total attribute XP allocated across
  all targets must equal `2 × P`.
- Enforced at the validation gate (`packages/domain/src/validation.ts`): after
  all allocations are resolved, they are proportionally scaled so their sum equals
  `2 × playerXp`.
- Re-enforced at activity creation time (`apps/server/src/services/activities.ts`):
  the same diminishing multiplier is applied to player XP and attribute/skill
  allocations, then allocations are re-balanced to sum to `2 × diminishedPlayerXp`.
- Applies to heuristic, AI, and manual suggestions equally.
- When `playerXp = 0` (pure practice with no leveling), allocations are left
  untouched — the rule only couples attribute progression to leveling.

## Diminishing returns

Applied to repeated similar activities within a 24-hour window:

```
multiplier = max(floor, 1 − step × priorSimilarCount)
```

Default: step = 0.35, floor = 0.25, window = 24h.

- Applied to **player XP** and **attribute/skill allocations** equally, preserving
  the 2:1 ratio after diminishing.
- Identical activity is never erased — the floor ensures a minimum multiplier.
- Activity grouping by `fingerprint(normalizedTitle + category)`.

## Skill → sub-attribute spillover (35%)

When XP is awarded to a skill, 35% of that XP (floored) also flows to the skill's
parent sub-attribute:

```
spillover = floor(skillXp × 0.35)
```

- Applied on award and exactly reversed on reversal.
- Matches the original WPF design.

## Decay

- **Lifetime XP and player level never decay.** Proficiency decays as debt below a
  capacity ceiling derived from lifetime XP.
- **Proficiency may decay; certifications never decay** (`is_certification = 1`
  excludes skills from decay).
- **Idempotent:** anchor timestamp + applied interval count prevent restart
  compounding. Re-evaluating at the same time changes nothing.
- **Grace period** before decay begins; intervals measured after grace.
- **Minimum proficiency floor** prevents decay below a configurable threshold.
- **Recovery:** earning XP on a decayed target recovers debt at a configurable
  rate per XP.

## Reversal

Reversing an activity exactly undoes every original award:

- Player XP: `−activity.player_xp`
- Each allocation: `−allocation.xp` (stored post-diminishing value)
- Skill spillover: `−floor(allocation.xp × 0.35)`
- Status changes to `reversed` with `reversed_at` and `reversal_reason`
- The reversal is itself recorded as a `reversal` kind transaction in the ledger

## Deterministic rounding

- XP values are integers. `Math.round()` for diminishing, `Math.floor()` for
  allocation scaling and spillover.
- Any rounding gap after proportional scaling is applied to the largest allocation
  to ensure the sum exactly equals the target.

## Implementation files

| File | Responsibility |
|------|---------------|
| `packages/domain/src/progression.ts` | XP formula, level lookup |
| `packages/domain/src/proficiency.ts` | Capacity, decay debt, applyXp, evaluateDecay |
| `packages/domain/src/diminishing.ts` | Multiplier, fingerprint |
| `packages/domain/src/validation.ts` | WPF-parity enforcement gate |
| `apps/server/src/services/activities.ts` | Award + reversal with diminishing + spillover |
| `apps/server/src/services/xp.ts` | Player delta, target delta, ledger |
| `apps/server/src/services/taxonomy.ts` | Lazy decay application |
