// Sales-tax rate applied to new quotes/invoices when the caller doesn't
// specify one. quotesTable.taxRate/invoicesTable.taxRate carry this same
// value as their column default, so existing rows are unaffected — this
// constant only governs new-row creation.
export const DEFAULT_TAX_RATE = 0.13;
