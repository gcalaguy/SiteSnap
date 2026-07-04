ALTER TABLE "expenses" ADD COLUMN "vendor_name" text;
ALTER TABLE "expenses" ADD COLUMN "tax_amount" numeric(12, 2);
ALTER TABLE "expenses" ADD COLUMN "expense_date" date;
