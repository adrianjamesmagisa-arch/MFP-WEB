import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { loadProgramYearCards, loadProgramMonthCards } = load('src/lib/program-dropoff-sync.ts')
const { computeSbfpAccomplishment } = load('src/lib/sbfp-accomplishment.ts')

function database(procurement, program = 'lds') {
  const tables = {
    mfp_program_months: [{ center: 'CLSU', program, year: 2026, month: 1 }],
    mfp_program_procurement: procurement.map(row => ({ center: 'CLSU', program, year: 2026, month: 10, ...row })),
    mfp_program_dropoffs: [439,730,310,157,301,191,1643].map(beneficiaries => ({ center: 'CLSU', program, year: 2026, month: 10, beneficiaries })),
  }
  return { from(table) {
    let columns = []
    const filters = []
    const query = {
      select(value) { columns = value.split(','); return query },
      eq(key,value) { filters.push(row => row[key] === value); return query },
      then(resolve,reject) {
        return Promise.resolve({ data: tables[table].filter(row => filters.every(filter => filter(row)))
          .map(row => Object.fromEntries(columns.map(column => [column,row[column]]))), error: null }).then(resolve,reject)
      },
    }
    return query
  } }
}

test('LDS year card agrees with the workspace for the 113,130-pack dated delivery', async () => {
  const procurement = [{ packs_to_deliver: 113130, packs_delivered: 0, procurement_status: 'Completed',
    delivery_snapshots: [{ date: 'Oct. 21, 2026', packs: 113130 }] }]
  const [card] = await loadProgramYearCards(database(procurement),'lds','CLSU')
  assert.equal(card.deliveredPacks,113130)
  assert.equal(card.deliveredPacks,computeSbfpAccomplishment(procurement).delivered)
  assert.equal(card.targetPacks,113130)
  assert.equal(card.beneficiaries,3771)
  assert.equal(card.municipalityCount,7)
  assert.equal(card.areaCount,1)
})

test('shared program cards use monthly tracking and completed legacy totals without double counting', async () => {
  for (const program of ['lds','dswd','lgu','others']) {
    const procurement = [
      { packs_to_deliver:100,procurement_status:'Ongoing',packs_delivered:0,monthly_packs_delivered:{'9':30,'10':40} },
      { packs_to_deliver:100,procurement_status:'Completed',packs_delivered:25 },
      { packs_to_deliver:100,procurement_status:'Ongoing',packs_delivered:999,delivery_snapshots:[{date:'Oct. 21, 2026',packs:50}] },
    ]
    const [card] = await loadProgramYearCards(database(procurement,program),program,'CLSU')
    assert.equal(card.deliveredPacks,145,program)
    assert.equal(card.targetPacks,300,program)
  }
})

test('failed and excluded contracts follow the workspace reporting rules and empty years remain visible', async () => {
  const procurement = [
    { packs_to_deliver:100,procurement_status:'Failed',delivery_snapshots:[{date:'Oct. 21, 2026',packs:100}] },
    { packs_to_deliver:100,include_in_report:false,procurement_status:'Completed',packs_delivered:100 },
    { packs_to_deliver:100,procurement_status:'Ongoing',packs_delivered:100 },
  ]
  const [card] = await loadProgramYearCards(database(procurement),'lds','CLSU')
  assert.equal(card.targetPacks,computeSbfpAccomplishment(procurement).target)
  assert.equal(card.deliveredPacks,0)
  const months = await loadProgramMonthCards(database(procurement),'lds','CLSU')
  assert.equal(months.reduce((sum,row) => sum+row.deliveredPacks,0),card.deliveredPacks)
  const [empty] = await loadProgramYearCards(database([]),'lds','CLSU')
  assert.equal(empty.year,2026)
  assert.equal(empty.deliveredPacks,0)
})
