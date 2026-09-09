-- Cooperative supplier per SDO on SBFP procurement (source of truth → masterlist)

ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.cooperatives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sbfp_data_supplier_id_idx
  ON public.sbfp_data (supplier_id);
