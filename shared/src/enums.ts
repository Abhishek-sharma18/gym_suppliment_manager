export const ROLES = ['admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const MOVEMENT_TYPES = [
  'PURCHASE_IN', 'PRODUCTION_CONSUME', 'PRODUCTION_OUT',
  'SALE_OUT', 'SALE_RETURN_IN', 'WASTAGE', 'ADJUSTMENT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ITEM_KINDS = ['RAW', 'FINISHED'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const EXPENSE_CATEGORIES = ['RENT', 'SALARY', 'ELECTRICITY', 'TRANSPORT', 'PACKAGING', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const REF_TYPES = ['PURCHASE', 'PRODUCTION', 'SALE', 'ADJUSTMENT'] as const;
export type RefType = (typeof REF_TYPES)[number];
