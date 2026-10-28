-- =============================================================================
-- Deduplicate 11 Cooperative Groups (2026-10-28)
-- Reassigns any supplier_id references in sbfp_data, mfp_program_procurement,
-- and mfp_data to the active/canonical cooperative ID before deleting the
-- 12 duplicate rows from public.cooperatives.
-- Safe to run multiple times (idempotent).
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- (keep_id, delete_id)
      ('1dc35969-c63b-454f-b1a5-e254a227c13a'::uuid, '6017aed1-6f75-4a07-a5bd-0b2bae68759d'::uuid), -- Llano
      ('8f04ba70-0f9a-4033-916b-5f7779911139'::uuid, 'f023ef35-7f32-4d2b-a696-1bcd9c66303e'::uuid), -- Pandan
      ('477868eb-07f5-42a0-8564-b7bd291fcb2e'::uuid, '976240ff-7cd2-4023-bb0e-87dd5073098d'::uuid), -- Tapulao
      ('0e7cf3ee-36f2-40dd-a99b-36426a0e1c8d'::uuid, '8eb08128-9578-4af4-a479-be99c45a201e'::uuid), -- Catmon
      ('ba8eacaa-9032-468e-b81a-aeaa5548168e'::uuid, '3d00372a-3c63-4c37-9e0d-a9e3fc40b3d0'::uuid), -- Gubat
      ('94f69bb9-35c7-448f-bc3d-1d49149f287e'::uuid, '78fe3b86-bb98-482d-a8ee-05f861912e1b'::uuid), -- Hamtic (HMPC)
      ('94f69bb9-35c7-448f-bc3d-1d49149f287e'::uuid, '5b5fcf3c-ae02-4626-8888-a63114efa9f6'::uuid), -- Hamtic (Hamtic MPC)
      ('1de4caf3-f329-4af4-95aa-eeeeeb58e09b'::uuid, '159ee9d9-e4df-49e9-ab8a-df57fa91576d'::uuid), -- PGA-Albay Dairy Plant
      ('a766db09-0e9c-47c5-98be-df9575184d64'::uuid, '29c1379c-6e7c-4803-b258-0a2e9b206a6d'::uuid), -- Quenscup
      ('54333dc6-6a26-42dc-a94f-da08f4a75771'::uuid, 'f51a59af-a163-49b0-b6c8-4ee67adfe75d'::uuid), -- Romings
      ('3567e21f-5fec-4d1d-bf20-f453099c0bb6'::uuid, 'c1d20931-dcc9-40c4-848f-74944dd409cc'::uuid), -- Sta. Catalina
      ('c0452c77-80bc-4d49-a7eb-5efe7f0fff56'::uuid, 'a2c38e36-d344-4302-802b-ebe1f8752cc3'::uuid)  -- The Rosario
    ) AS pairs(keep_id, delete_id)
  LOOP
    IF EXISTS (SELECT 1 FROM public.cooperatives WHERE id = rec.keep_id)
       AND EXISTS (SELECT 1 FROM public.cooperatives WHERE id = rec.delete_id) THEN

      UPDATE public.sbfp_data
      SET supplier_id = rec.keep_id
      WHERE supplier_id = rec.delete_id;

      UPDATE public.mfp_program_procurement
      SET supplier_id = rec.keep_id
      WHERE supplier_id = rec.delete_id;

      UPDATE public.mfp_data
      SET supplier_id = rec.keep_id
      WHERE supplier_id = rec.delete_id;

      DELETE FROM public.cooperatives
      WHERE id = rec.delete_id;
    END IF;
  END LOOP;
END $$;

