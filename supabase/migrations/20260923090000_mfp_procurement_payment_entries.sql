-- Replace free-text status_of_payment with structured payment_entries JSONB.
-- Each entry: { "date": "Sep. 23, 2026", "amount": 50000 }
-- Supports partial payments (multiple entries, one per installment).

-- mfp_program_procurement (DSWD / LDS / LGU / Others workspaces)
ALTER TABLE public.mfp_program_procurement
  ADD COLUMN IF NOT EXISTS payment_entries JSONB NOT NULL DEFAULT '[]'::jsonb;

-- sbfp_data (SBFP center workspaces, including NHQ)
ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS payment_entries JSONB NOT NULL DEFAULT '[]'::jsonb;
