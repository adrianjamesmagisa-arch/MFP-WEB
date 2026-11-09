// Disposable, in-memory PostgreSQL only. Never reads env files or connects to Supabase.
// Optional test runtime, isolated from the application's dependencies:
// npm install --prefix node_modules/.cache/sbfp-sql-test --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.15
// node tests/sql/sbfp-dropoff-automatic-finances.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { load } from '../helpers/load-typescript.mjs'

const require = createRequire(import.meta.url)
const { PGlite } = require('../../node_modules/.cache/sbfp-sql-test/node_modules/@electric-sql/pglite')
const sql = fs.readFileSync(new URL('../../supabase/pending/sbfp_dropoff_automatic_finances.sql', import.meta.url), 'utf8')
const oldSql = fs.readFileSync(new URL('../../supabase/pending/sbfp_dropoff_finances.sql', import.meta.url), 'utf8')
const lookupFix = fs.readFileSync(new URL('../../supabase/pending/sbfp_profile_lookup_search_path_fix.sql', import.meta.url), 'utf8')
const automaticPacks = fs.readFileSync(new URL('../../supabase/pending/sbfp_dropoff_automatic_milk_packs.sql', import.meta.url), 'utf8')
const finance = load('src/lib/sbfp-dropoff-finance.ts')
const parentId = '00000000-0000-0000-0000-000000000001'
const schoolId = '00000000-0000-0000-0000-000000000002'
const otherSchoolId = '00000000-0000-0000-0000-000000000003'
const encoderId = '00000000-0000-0000-0000-000000000004'

// Minimum relevant schema from repository definitions, not a claim about live schema.
const fixture = `
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, center text);
-- Production lookup helpers/policy as inspected read-only: the unqualified
-- profiles reference inherits a caller's empty search_path until corrected.
CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT role::text FROM profiles WHERE id=auth.uid() LIMIT 1';
CREATE FUNCTION public.get_my_center() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  'SELECT center FROM profiles WHERE id=auth.uid() LIMIT 1';
CREATE TABLE public.sbfp_data (id uuid PRIMARY KEY, year integer, center text, sdo text,
  milk_type text, pack_unit_price numeric, remarks text);
CREATE TABLE public.sbfp_dropoff_points (id uuid PRIMARY KEY, sbfp_data_id uuid REFERENCES sbfp_data(id) ON DELETE SET NULL,
  year integer, center text, sdo text, milk_packs integer NOT NULL DEFAULT 0,
  beneficiaries integer NOT NULL DEFAULT 0,feeding_days integer NOT NULL DEFAULT 0,
  include_in_masterlist boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TYPE public.milk_type AS ENUM ('PM','SM','CM','SMP','Karabao');
CREATE TABLE public.mfp_data (id uuid PRIMARY KEY, source_dropoff_id uuid UNIQUE REFERENCES sbfp_dropoff_points(id),
  year integer, funded_by text, center text, milk_cost numeric(14,2), service_fee numeric(14,2),
  total_funds_transferred numeric(14,2),milk_packs numeric,beneficiaries integer,feeding_days integer,
  milk_type public.milk_type,total_volume_requirements numeric,raw_milk_liters numeric,
  whole_milk_kg numeric,skimmed_milk_kg numeric,sugar numeric, updated_at timestamptz DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
INSERT INTO profiles VALUES ('${encoderId}', 'encoder', 'NHQ');
INSERT INTO sbfp_data VALUES ('${parentId}',2026,'NHQ','SDO - PM','PM',null,null);
INSERT INTO sbfp_dropoff_points (id,sbfp_data_id,year,center,sdo,milk_packs)
  VALUES ('${schoolId}','${parentId}',2026,'NHQ','SDO - PM',10),
         ('${otherSchoolId}',null,2026,'CLSU','Other school',1);
INSERT INTO mfp_data (id,source_dropoff_id,year,funded_by,center,milk_cost,service_fee,total_funds_transferred)
  VALUES ('${schoolId}','${schoolId}',2026,'DepEd','NHQ',777,20,797);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_self ON profiles FOR SELECT TO authenticated USING (id=auth.uid() OR get_my_role()='super_admin');
ALTER TABLE sbfp_dropoff_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_select ON sbfp_dropoff_points FOR SELECT TO authenticated USING (true);
CREATE POLICY school_insert ON sbfp_dropoff_points FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY school_update ON sbfp_dropoff_points FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE sbfp_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY parent_select ON sbfp_data FOR SELECT TO authenticated USING (center='NHQ');
CREATE POLICY parent_update ON sbfp_data FOR UPDATE TO authenticated USING (center='NHQ') WITH CHECK (center='NHQ');
ALTER TABLE mfp_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfp_select ON mfp_data FOR SELECT TO authenticated USING (center='NHQ');
CREATE POLICY mfp_update ON mfp_data FOR UPDATE TO authenticated USING (center='NHQ') WITH CHECK (center='NHQ');
`

for (const previousManualSetup of [false, true]) {
  const db = new PGlite()
  try {
    await db.exec(fixture)
    if (previousManualSetup) {
      await db.exec(oldSql)
      await db.exec(`UPDATE sbfp_dropoff_points SET contract_amount=111,service_fee=3 WHERE id='${schoolId}'`)
      await assert.rejects(db.exec(automaticPacks),/Apply automatic school finances/)
      await db.exec('ROLLBACK')
    }
    const previousHelpers = (await db.query("SELECT oid,proowner,proacl,prosecdef,provolatile FROM pg_proc WHERE oid IN ('public.get_my_role()'::regprocedure,'public.get_my_center()'::regprocedure) ORDER BY oid")).rows
    if (!process.argv.includes('--without-lookup-fix')) await db.exec(lookupFix)
    const currentHelpers = (await db.query("SELECT oid,proowner,proacl,prosecdef,provolatile FROM pg_proc WHERE oid IN ('public.get_my_role()'::regprocedure,'public.get_my_center()'::regprocedure) ORDER BY oid")).rows
    assert.deepEqual(currentHelpers,previousHelpers)
    await db.exec(sql)
    const state = async () => (await db.query(`SELECT d.contract_amount::float8 amount,d.contract_unit_price::float8 price,
      d.service_fee::float8 shipping,m.milk_cost::float8 milk,m.service_fee::float8 mirror_shipping,
      m.total_funds_transferred::float8 total FROM sbfp_dropoff_points d JOIN mfp_data m ON m.source_dropoff_id=d.id WHERE d.id=$1`, [schoolId])).rows[0]
    assert.deepEqual(await state(), { amount:250, price:25, shipping:previousManualSetup?3:null,
      milk:250, mirror_shipping:previousManualSetup?3:20, total:previousManualSetup?253:null })

    await db.exec(`SET ROLE service_role; UPDATE sbfp_dropoff_points SET service_fee=5 WHERE id='${schoolId}'; RESET ROLE;`)
    assert.equal((await state()).total,255)
    await db.exec(`SET request.jwt.claim.sub='${encoderId}'; SET ROLE authenticated;`)
    // A finance trigger has search_path=''. The policy helpers must still resolve
    // public.profiles when called from that context, regardless of planner OR order.
    await db.exec("SET search_path=''")
    const helperResult = (await db.query('SELECT public.get_my_role() role,public.get_my_center() center')).rows[0]
    assert.deepEqual(helperResult,{ role:'encoder', center:'NHQ' })
    await db.exec('SET search_path=public')
    // Same DB path as Add school: authenticated INSERT, financial guard, profile RLS.
    const addedId = '00000000-0000-0000-0000-000000000099'
    await db.exec(`INSERT INTO sbfp_dropoff_points(id,sbfp_data_id,year,center,sdo,milk_packs)
      VALUES('${addedId}','${parentId}',2026,'NHQ','New school',0)`)
    assert.equal((await db.query('SELECT contract_amount::float8 amount FROM sbfp_dropoff_points WHERE id=$1',[addedId])).rows[0].amount,0)
    await db.exec(`RESET ROLE; DELETE FROM sbfp_dropoff_points WHERE id='${addedId}'; SET ROLE authenticated;`)
    await db.exec(`UPDATE sbfp_dropoff_points SET milk_packs=20 WHERE id='${schoolId}'`)
    assert.equal((await state()).total,505)
    await db.exec(`UPDATE sbfp_dropoff_points SET contract_amount=999,contract_unit_price=999 WHERE id='${schoolId}'`)
    assert.equal((await state()).amount,500)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET service_fee=99 WHERE id='${schoolId}'`), /financial editor/)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET milk_packs=99 WHERE id='${otherSchoolId}'`), /assigned center/)
    await db.exec(`UPDATE sbfp_data SET milk_type='SM' WHERE id='${parentId}'`)
    assert.equal((await state()).total,605)
    await db.exec(`UPDATE sbfp_data SET milk_type='CM',pack_unit_price=1.005 WHERE id='${parentId}'`)
    await db.exec(`UPDATE sbfp_dropoff_points SET milk_packs=1 WHERE id='${schoolId}'`)
    assert.equal((await state()).amount,1.01)
    assert.equal((await state()).total,6.01)
    await db.exec(`UPDATE sbfp_data SET pack_unit_price=null WHERE id='${parentId}'`)
    assert.equal((await state()).amount,null)
    assert.equal((await state()).milk,null)
    assert.equal((await state()).total,null)
    assert.equal((await state()).shipping,5)
    await db.exec(`UPDATE sbfp_data SET pack_unit_price=12.5 WHERE id='${parentId}'`)
    assert.equal((await state()).total,17.5)
    await db.exec(`UPDATE mfp_data SET milk_cost=999,service_fee=999,total_funds_transferred=999 WHERE source_dropoff_id='${schoolId}'`)
    assert.equal((await state()).total,17.5)
    assert.equal((await state()).mirror_shipping,5)
    await db.exec(`UPDATE sbfp_dropoff_points SET sbfp_data_id=null WHERE id='${schoolId}'`)
    assert.equal((await state()).milk,null)
    await db.exec(`UPDATE sbfp_dropoff_points SET sbfp_data_id='${parentId}' WHERE id='${schoolId}'; RESET ROLE;`)
    await db.exec(`UPDATE profiles SET role='viewer' WHERE id='${encoderId}'; SET ROLE authenticated;`)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET milk_packs=10 WHERE id='${schoolId}'`), /assigned center/)
    await db.exec('RESET ROLE')

    // A mirror failure must roll back the school amount too.
    await db.exec(`ALTER TABLE mfp_data ADD CONSTRAINT test_cost_limit CHECK(milk_cost<100)`)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET milk_packs=100 WHERE id='${schoolId}'`), /test_cost_limit/)
    assert.equal((await state()).amount,12.5)
    await db.exec('ALTER TABLE mfp_data DROP CONSTRAINT test_cost_limit')
    await db.exec(lookupFix)
    await db.exec(sql) // Deliberately repeatable setup: no duplicate triggers or records.
    assert.equal((await state()).amount,12.5)
    assert.equal((await db.query('SELECT count(*)::int schools FROM sbfp_dropoff_points')).rows[0].schools,2)
    assert.equal((await db.query('SELECT count(*)::int mirrors FROM mfp_data')).rows[0].mirrors,1)

    for (const [milkType, price, label, packs] of [['PM',null,'SDO',2125],['SM',99,'SDO',2125],
      ['CM',1.005,'SDO',1],['CM',0.335,'SDO',3],['CM',null,'SDO',10],
      ['',20,'SDO - CM',10],['Karabao',12.5,'SDO',10],['SMP',null,'SDO',10],['CM',10,'SDO',0]]) {
      const result = await db.query('SELECT sbfp_school_milk_cost($1,sbfp_school_pack_price($2,$3,$4,null))::float8 amount', [packs,milkType,price,label])
      const expected = finance.calculateSchoolContract({ sbfp_data_id:parentId, milk_packs:packs }, { id:parentId, milk_type:milkType, pack_unit_price:price, sdo:label }).contractAmount
      assert.equal(result.rows[0].amount,expected)
    }
    console.log(`${previousManualSetup?'Previous manual setup upgrade':'Fresh setup'}: calculation, sync, roles/RLS, atomic rollback, rerun, parity and membership checks passed.`)

    await db.exec(automaticPacks)
    const packState = async () => (await db.query(`SELECT d.milk_packs packs,d.beneficiaries,d.feeding_days,
      m.milk_packs::float8 mirror_packs,m.total_volume_requirements::float8 volume,
      m.raw_milk_liters::float8 raw,m.milk_type::text milk_type FROM sbfp_dropoff_points d
      JOIN mfp_data m ON m.source_dropoff_id=d.id WHERE d.id=$1`,[schoolId])).rows[0]
    assert.equal((await packState()).packs,0)
    await db.exec(`UPDATE profiles SET role='encoder' WHERE id='${encoderId}'; SET ROLE authenticated;`)
    await db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=1333,feeding_days=25,milk_packs=999 WHERE id='${schoolId}'`)
    assert.equal((await packState()).packs,33325)
    assert.equal((await packState()).mirror_packs,33325)
    assert.equal((await state()).amount,416562.5)
    assert.equal((await packState()).volume,6665)
    await db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=1303 WHERE id='${schoolId}'`)
    assert.equal((await packState()).packs,32575)
    await db.exec(`UPDATE sbfp_dropoff_points SET feeding_days=0 WHERE id='${schoolId}'`)
    assert.equal((await packState()).packs,0)
    assert.equal((await state()).amount,0)
    await db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=1,feeding_days=25 WHERE id='${schoolId}'`)
    await db.exec(`UPDATE sbfp_data SET milk_type='SM',pack_unit_price=null WHERE id='${parentId}'`)
    assert.equal((await packState()).volume,4.5)
    assert.equal((await packState()).milk_type,'SM')
    assert.equal((await state()).amount,750)
    await db.exec(`UPDATE sbfp_data SET milk_type='CM',pack_unit_price=30 WHERE id='${parentId}'`)
    assert.equal((await state()).amount,750) // Same price/amount, different volume still refreshes.
    assert.equal((await packState()).volume,5)
    await db.exec(`UPDATE mfp_data SET milk_packs=999,beneficiaries=999,feeding_days=999,total_volume_requirements=999 WHERE source_dropoff_id='${schoolId}'`)
    assert.equal((await packState()).mirror_packs,25)
    assert.equal((await packState()).volume,5)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=-1 WHERE id='${schoolId}'`),/nonnegative/)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=2147483647,feeding_days=2 WHERE id='${schoolId}'`),/2147483647/)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=10 WHERE id='${otherSchoolId}'`),/assigned center/)
    await db.exec('RESET ROLE')
    await db.exec(`ALTER TABLE mfp_data ADD CONSTRAINT test_pack_limit CHECK(milk_packs<100)`)
    await assert.rejects(db.exec(`UPDATE sbfp_dropoff_points SET beneficiaries=100 WHERE id='${schoolId}'`),/test_pack_limit/)
    assert.equal((await packState()).beneficiaries,1)
    assert.equal((await packState()).packs,25)
    await db.exec('ALTER TABLE mfp_data DROP CONSTRAINT test_pack_limit')
    await db.exec(automaticPacks)
    assert.equal((await state()).shipping,5)
    assert.equal((await packState()).packs,25)
    assert.equal((await db.query('SELECT count(*)::int schools FROM sbfp_dropoff_points')).rows[0].schools,2)
    console.log('Automatic packs: recalculation, input changes, zero, tamper resistance, enum/formulas, role checks, atomic rollback and rerun passed.')
  } finally {
    await db.close()
  }
}
