import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { calculateSchoolMilkPacks,parseSchoolCount } = load('src/lib/sbfp-dropoff-packs.ts')
const { buildMasterlistIdentity } = load('src/lib/sbfp-dropoff-sync.ts')
const { projectSbfpSchools } = load('src/lib/mfp-sbfp-source.ts')

test('school packs use beneficiaries times school feeding days and ignore old manual packs', () => {
  for (const [beneficiaries,expected] of [[1333,33325],[1303,32575],[2314,57850],[159,3975]]) {
    assert.equal(calculateSchoolMilkPacks({ beneficiaries,feeding_days:25,milk_packs:999 }),expected)
  }
  assert.equal(calculateSchoolMilkPacks({ beneficiaries:1333,feeding_days:0 }),0)
  assert.equal(calculateSchoolMilkPacks({ beneficiaries:0,feeding_days:25 }),0)
})

test('count validation rejects negative, fractional, malformed and overflowing pack inputs', () => {
  for (const value of [-1,1.5,'-1','1.5','NaN',Infinity,true,{},'1e3','1,333',2147483648]) {
    assert.equal(parseSchoolCount(value),null,String(value))
  }
  assert.equal(parseSchoolCount('1333'),1333)
  assert.equal(parseSchoolCount(null),0)
  assert.equal(calculateSchoolMilkPacks({ beneficiaries:2147483647,feeding_days:2 }),null)
  assert.equal(calculateSchoolMilkPacks({ beneficiaries:2147483647,feeding_days:1 }),2147483647)
})

test('source projection and sync agree on packs, money, formulas and explicit zero days', () => {
  const school = { id:'school',sbfp_data_id:'sdo',year:2026,center:'NHQ',sdo:'SDO - SM',dropoff_name:'School',
    beneficiaries:1333,feeding_days:25,milk_packs:0,service_fee:500,include_in_masterlist:true }
  const parent = { id:'sdo',year:2026,center:'NHQ',milk_type:'SM',feeding_days:99 }
  const sync = buildMasterlistIdentity(school,parent)
  const [view] = projectSbfpSchools([school],[parent],[])
  for (const row of [sync,view]) {
    assert.equal(row.milk_packs,33325)
    assert.equal(row.total_volume_requirements,5998.5)
    assert.equal(row.raw_milk_liters,1199.7)
    assert.equal(row.milk_cost,999750)
    assert.equal(row.total_funds_transferred,1000250)
  }
  for (const row of [buildMasterlistIdentity({ ...school,feeding_days:0 },parent),projectSbfpSchools([{ ...school,feeding_days:0 }],[parent],[])[0]]) {
    assert.equal(row.feeding_days,0)
    assert.equal(row.milk_packs,0)
    assert.equal(row.milk_cost,0)
    assert.equal(row.total_funds_transferred,500)
  }
})
