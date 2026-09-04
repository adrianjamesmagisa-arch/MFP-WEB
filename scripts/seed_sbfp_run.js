// Plain JS seed script — no TypeScript, no ESM issues
const xlsx = require("xlsx");
const path = require("path");
const fs   = require("fs");
const { createClient } = require("@supabase/supabase-js");

// Load .env.local manually
const envFile = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf-8").split("\n").forEach(line => {
    line = line.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) return;
    const idx = line.indexOf("=");
    const k = line.slice(0, idx).trim(), v = line.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EXCEL = "C:/pcc folder/PCC/Data processing/SBFP FY 2026_Monitoring.xlsx";

function excelDateToISO(serial) {
  // Only accept Excel date serials in a plausible FY range (not pack counts).
  if (serial == null || typeof serial !== "number" || !Number.isFinite(serial)) return null;
  if (serial < 45300 || serial > 47500) return null;
  const d = xlsx.SSF.parse_date_code(serial);
  if (!d || d.y < 2024 || d.y > 2030) return null;
  return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
}

const CENTERS = { UPLB:"UPLB", DMMMSU:"DMMMSU", CSU:"CSU", MMSU:"MMSU", CLSU:"CLSU", LCSF:"LCSF", WVSU:"WVSU", USF:"USF", VSU:"VSU", MLPC:"MLPC", CMU:"CMU", USM:"USM" };

const JUNK = ["SUPPLIES","RELOCATION","EXPENSES","TRAINING","FURNITURE","TRAVEL","EQUIPMENT","AIRCON","OFFICE","ICT","PROFESSIONAL FEE","FUEL","JANITORIAL","SECURITY","REPAIRS","MAINTENANCE","TOTAL","SUB-TOTAL","LEGEND","STATUS"];

function isJunk(sdo, status) {
  const su = (sdo||"").toUpperCase(), st = (status||"").toUpperCase().trim();
  if (st==="STATUS"||st==="STATUTS"||st==="PROCUREMENT STATUS") return true;
  return JUNK.some(k => su.includes(k));
}

function deriveStatus(raw, row) {
  const s = (raw||"").toUpperCase().trim();
  if (s==="DONE"||s==="COMPLETED") return "Completed";
  const hasPO = !!row[7] && String(row[7]).trim()!=="";
  const hasContract = (Number(row[11])||0) > 0;
  const hasDelivered = [row[15],row[16],row[17],row[18]].some(v=>Number(v)>0);
  if ((hasPO||hasContract) && hasDelivered) return "Awarded (Ongoing Delivery)";
  if ((hasPO||hasContract) && !hasDelivered) return "Awarded (For Delivery)";
  if (s==="ONGOING (FOR AWARD)") return "Ongoing (For Award)";
  if (s==="ONGOING") return "Ongoing Procurement";
  return "For Preparation";
}

function deriveStatusNHQ(raw, row) {
  const s = (raw||"").toUpperCase().trim();
  if (s==="DONE"||s==="COMPLETED") return "Completed";
  const hasPO = !!row[6] && String(row[6]).trim()!=="";
  const hasContract = (Number(row[10])||0) > 0;
  const hasDelivered = [row[14],row[15],row[16],row[17]].some(v=>Number(v)>0);
  if ((hasPO||hasContract) && hasDelivered) return "Awarded (Ongoing Delivery)";
  if ((hasPO||hasContract) && !hasDelivered) return "Awarded (For Delivery)";
  if (s==="ONGOING (FOR AWARD)") return "Ongoing (For Award)";
  if (s==="ONGOING") return "Ongoing Procurement";
  return "For Preparation";
}

async function seedSummary(wb) {
  console.log("\n=== sbfp_summary ===");
  const sh = wb.Sheets["SUMMARY TARGET MILK PROD"]; if(!sh){console.log("SKIPPED");return;}
  const rows = xlsx.utils.sheet_to_json(sh, {header:1});
  const recs = [];
  for (let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]||String(r[0]).toLowerCase().includes("total")) continue;
    recs.push({year:2026,center:String(r[0]).trim(),jan_dec_target_milk_volume:Number(r[1])||0,target_milk_packs:Number(r[2])||0,equivalent_volume:Number(r[3])||0,shortage_surplus:Number(r[4])||0,pct_covered:Number(r[5])||0,jul_dec_projected_volume:Number(r[6])||0,milk_packs_can_produce:Number(r[7])||0,shortage_surplus_packs:Number(r[8])||0});
  }
  await supabase.from("sbfp_summary").delete().eq("year",2026);
  const {error} = await supabase.from("sbfp_summary").insert(recs);
  if(error) console.log("ERROR:",error.message); else console.log(`OK — ${recs.length} rows`);
}

async function seedBudget(wb) {
  console.log("\n=== sbfp_budget ===");
  const sh = wb.Sheets["BUDGET BREAKDOWN"]; if(!sh){console.log("SKIPPED");return;}
  const rows = xlsx.utils.sheet_to_json(sh, {header:1});
  const recs = [];
  for (let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]||String(r[0]).toUpperCase().includes("TOTAL")) continue;
    recs.push({year:2026,center:String(r[0]).trim(),milk_supplies:Number(r[1])||0,office_professional:Number(r[2])||0,traveling_expenses:Number(r[3])||0,office_supplies:Number(r[4])||0,training_expenses:Number(r[5])||0,furniture_fixtures:Number(r[6])||0,total:Number(r[7])||0});
  }
  await supabase.from("sbfp_budget").delete().eq("year",2026);
  const {error} = await supabase.from("sbfp_budget").insert(recs);
  if(error) console.log("ERROR:",error.message); else console.log(`OK — ${recs.length} rows`);
}

async function seedActivities(wb) {
  console.log("\n=== sbfp_activities ===");
  const sh = wb.Sheets["STATUS OF ACTIVITIES"]; if(!sh){console.log("SKIPPED");return;}
  const rows = xlsx.utils.sheet_to_json(sh, {header:1});
  await supabase.from("sbfp_activities").delete().eq("year",2026);
  const recs = []; let ord=0;
  for (let i=2;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]||!String(r[0]).trim()) continue;
    recs.push({year:2026,activity:String(r[0]).trim(),status:r[1]||"Not Started",remarks:typeof r[2]==="number"?excelDateToISO(r[2]):(r[2]||null),sort_order:ord++});
  }
  const {error} = await supabase.from("sbfp_activities").insert(recs);
  if(error) console.log("ERROR:",error.message); else console.log(`OK — ${recs.length} rows`);
}

async function seedCenterData(wb) {
  console.log("\n=== sbfp_data ===");

  // Build region map from OVERALL sheet
  const overSh = wb.Sheets["OVERALL"];
  const overRows = xlsx.utils.sheet_to_json(overSh, {header:1});
  const regionMap = {};
  for (let i=2;i<overRows.length;i++) {
    const r=overRows[i];
    if(r[1]&&r[2]) regionMap[String(r[2]).toLowerCase().trim()] = String(r[1]).trim();
  }
  console.log(`Region map: ${Object.keys(regionMap).length} entries`);

  const all = [];

  // Center sheets
  for (const [name, code] of Object.entries(CENTERS)) {
    const sh = wb.Sheets[name]; if(!sh){console.log(`SKIP ${name}`); continue;}
    const rows = xlsx.utils.sheet_to_json(sh, {header:1});
    let hr=-1;
    for(let i=0;i<Math.min(20,rows.length);i++){if(String(rows[i][0]||"").trim().toUpperCase()==="STATUS"){hr=i;break;}}
    if(hr===-1){console.log(`SKIP ${name} — no header`);continue;}

    const hcols = rows[hr];
    // Detect columns by header label (Excel has no Batch column on most center sheets)
    const labels = hcols.map(h => String(h || '').toLowerCase().trim());
    const findCol = (...parts) => labels.findIndex(h => parts.every(p => h.includes(p)));
    const colBeni = findCol('beneficiar') >= 0 ? findCol('beneficiar') : 9;
    const colContract = findCol('contract') >= 0 ? findCol('contract') : 10;
    const colStart = findCol('start', 'delivery') >= 0 ? findCol('start', 'delivery') : 11;
    const colEnd = findCol('end', 'delivery') >= 0 ? findCol('end', 'delivery') : 12;
    const colPacks = findCol('packs to be delivered') >= 0
      ? findCol('packs to be delivered')
      : (findCol('packs to be') >= 0 ? findCol('packs to be') : 13);
    const colBatch = findCol('batch');

    const snaps = [];
    for (let c = 0; c < hcols.length; c++) {
      const h = String(hcols[c] || '').toLowerCase();
      if (h.includes('packs delivered as of') || h.includes('no. of packs delivered')) {
        snaps.push({ colIndex: c, label: String(hcols[c]).replace(/total no\. of packs delivered as of/i, '').trim() });
      }
    }

    let count = 0;
    for (let i = hr + 1; i < rows.length; i++) {
      const row = rows[i];
      const raw = String(row[0] || '').trim(), sdo = String(row[1] || '').trim();
      if (!sdo) continue;
      if (isJunk(sdo, raw)) continue;
      const packs = Math.round(Number(row[colPacks])) || 0;
      const amt = Math.round(Number(row[2])) || 0;
      const beni = Math.round(Number(row[colBeni])) || 0;
      if (packs === 0 && amt === 0 && beni === 0) continue;

      const delSnaps = snaps.map(s => ({ date: s.label, packs: Math.round(Number(row[s.colIndex])) || 0 })).filter(s => s.packs > 0);
      const lastSnap = delSnaps.length > 0 ? delSnaps[delSnaps.length - 1].packs : 0;
      const status = deriveStatus(raw, row);
      const sdoKey = sdo.toLowerCase().replace(/ -(pm|sm|smp|cm)$/i, '').trim();
      const region = regionMap[sdoKey] || regionMap[sdo.toLowerCase().trim()] || '';
      const contractRaw = row[colContract];
      const contractAmt = typeof contractRaw === 'number' ? Math.round(contractRaw) || 0 : 0;

      all.push({
        year: 2026, center: code, region, sdo, procurement_status: status, include_in_report: true,
        amount: amt,
        mode_of_procurement: row[3] ? String(row[3]).trim() : 'Sagip Saka',
        pr_date_received: excelDateToISO(row[4]),
        pr_number: row[5] ? String(row[5]).trim() : null,
        ors_date: excelDateToISO(row[6]),
        po_number: row[7] ? String(row[7]).trim() : null,
        remarks: row[8] ? String(row[8]).trim() : null,
        batch: colBatch >= 0 && row[colBatch] != null ? String(row[colBatch]).trim() : null,
        beneficiaries_pm: beni,
        contract_amount: contractAmt,
        delivery_start: excelDateToISO(row[colStart]),
        delivery_end: excelDateToISO(row[colEnd]),
        packs_to_deliver: packs,
        packs_delivered: lastSnap,
        delivery_snapshots: delSnaps,
        milk_type: 'Pasteurized',
        delivery_schedule: '',
      });
      count++;
    }
    console.log(`  ${name}: ${count} valid rows`);
  }

  // NHQ sheet
  const nhqSh = wb.Sheets["NHQ PROCUREMENT ACTIVITIES"];
  if(nhqSh){
    const rows=xlsx.utils.sheet_to_json(nhqSh,{header:1});
    let hr=-1;
    for(let i=0;i<20;i++){if(rows[i]&&String(rows[i][0]||"").trim().toUpperCase()==="STATUS"){hr=i;break;}}
    if(hr!==-1){
      let count=0;
      for(let i=hr+1;i<rows.length;i++){
        const row=rows[i];
        const raw=String(row[0]||"").trim(),sdo=String(row[1]||"").trim();
        if(!sdo) continue; if(isJunk(sdo,raw)) continue;
        const packs=Math.round(Number(row[13]))||0,amt=Math.round(Number(row[2]))||0;
        if(packs===0&&amt===0) continue;
        const snps=[];
        for(let c=14;c<=17;c++){if(Number(row[c])>0)snps.push({date:`Col${c}`,packs:Math.round(Number(row[c]))});}
        const region=regionMap[sdo.toLowerCase().trim()]||"";
        all.push({year:2026,center:"NHQ",region,sdo,procurement_status:deriveStatusNHQ(raw,row),include_in_report:true,amount:amt,mode_of_procurement:row[3]?String(row[3]).trim():"Sagip Saka",pr_date_received:excelDateToISO(row[4]),pr_number:row[5]?String(row[5]).trim():null,po_number:row[6]?String(row[6]).trim():null,remarks:row[7]?String(row[7]).trim():null,batch:row[8]?String(row[8]).trim():null,beneficiaries_pm:Math.round(Number(row[9]))||0,contract_amount:Math.round(Number(row[10]))||0,delivery_start:null,delivery_end:null,packs_to_deliver:packs,packs_delivered:snps.length>0?snps[snps.length-1].packs:0,delivery_snapshots:snps,milk_type:"Pasteurized",delivery_schedule:""});
        count++;
      }
      console.log(`  NHQ: ${count} valid rows`);
    }
  }

  // Status breakdown
  const counts = {};
  for(const r of all) counts[r.procurement_status]=(counts[r.procurement_status]||0)+1;
  console.log("\nStatus breakdown:", JSON.stringify(counts,null,2));
  console.log("Total:", all.length);

  // Wipe and insert
  const {error:de}=await supabase.from("sbfp_data").delete().neq("id","00000000-0000-0000-0000-000000000000");
  if(de){console.log("DELETE ERROR:",de.message);return;}

  let inserted=0;
  for(let i=0;i<all.length;i+=50){
    const {error}=await supabase.from("sbfp_data").insert(all.slice(i,i+50));
    if(error) console.log(`Batch ${i} ERROR:`,error.message);
    else{inserted+=Math.min(50,all.length-i);process.stdout.write(".");}
  }
  console.log(`\nInserted: ${inserted}`);
}

async function main() {
  console.log("Reading:", EXCEL);
  if(!fs.existsSync(EXCEL)){console.log("FILE NOT FOUND");process.exit(1);}
  const wb = xlsx.readFile(EXCEL);
  console.log("Sheets:", wb.SheetNames.join(", "));
  await seedSummary(wb);
  await seedBudget(wb);
  await seedActivities(wb);
  await seedCenterData(wb);
  console.log("\n✅ ALL DONE");
  process.exit(0);
}

main().catch(e=>{console.error("FATAL:",e);process.exit(1);});

