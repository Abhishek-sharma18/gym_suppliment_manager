// Derived money TOTALS use round2; per-useUnit COSTS use round4 (Rs-per-gram scale).
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;
