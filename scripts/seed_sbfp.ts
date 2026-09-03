import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXCEL_FILE = "C:/pcc folder/PCC/SIDEBARS/sbfp/SBFP FY 2026_Monitoring.xlsx";

function excelDateToISO(serial: any): string | null {
  if (!serial || typeof serial !== "number") return null;
  const date = xlsx.SSF.parse_date_code(serial);
  if (!date) return null;
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

const CENTER_SHEETS: Record<string, string> = {
  UPLB: "UPLB", DMMMSU: "DMMMSU", CSU: "CSU", MMSU: "MMSU",
  CLSU: "CLSU", LCSF: "LCSF", WVSU: "WVSU", USF: "USF",
  VSU: "VSU", MLPC: "MLPC", CMU: "CMU", USM: "USM",
};

const JUNK_KEYWORDS = [
  "SUPPLIES", "RELOCATION", "EXPENSES", "TRAINING", "FURNITURE",
  "TRAVEL", "EQUIPMENT", "AIRCON", "OFFICE", "ICT", "PROFESSIONAL FEE",
  "FUEL", "JANITORIAL", "SECURITY", "REPAIRS", "MAINTENANCE",
  "TOTAL", "SUB-TOTAL", "LEGEND", "STATUS",
];

function isJunkRow(sdo: string, status: string): boolean {
  const sdoUpper = sdo.toUpperCase();
  const statUpper = status.toUpperCase().trim();
  if (statUpper === "STATUS" || statUpper === "STATUTS" || statUpper === "PROCUREMENT STATUS") return true;
  if (JUNK_KEYWORDS.some((k) => sdoUpper.includes(k))) return true;
  return false;
}

function deriveStatus(rawStatus: string, row: any[]): string {
  const s = (rawStatus || "").trim().toUpperCase();
  if (s === "DONE" || s === "COMPLETED") return "Completed";
  const hasPO = !!row[7] && String(row[7]).trim() !== "";
  const hasContract = (Number(row[11]) || 0) > 0;
  const hasDelivered = [row[15], row[16], row[17], row[18]].some((v) => Number(v) > 0);
  if ((hasPO || hasContract) && hasDelivered) return "Awarded (Ongoing Delivery)";
  if ((hasPO || hasContract) && !hasDelivered) return "Awarded (For Delivery)";
  if (s === "ONGOING (FOR AWARD)") return "Ongoing (For Award)";
  if (s === "ONGOING") return "Ongoing Procurement";
  return "For Preparation";
}

function deriveStatusNHQ(rawStatus: string, row: any[]): string {
  const s = (rawStatus || "").trim().toUpperCase();
  if (s === "DONE" || s === "COMPLETED") return "Completed";
  const hasPO = !!row[6] && String(row[6]).trim() !== "";
  const hasContract = (Number(row[10]) || 0) > 0;
  const hasDelivered = [row[14], row[15], row[16], row[17]].some((v) => Number(v) > 0);
  if ((hasPO || hasContract) && hasDelivered) return "Awarded (Ongoing Delivery)";
  if ((hasPO || hasContract) && !hasDelivered) return "Awarded (For Delivery)";
  if (s === "ONGOING (FOR AWARD)") return "Ongoing (For Award)";
  if (s === "ONGOING") return "Ongoing Procurement";
  return "For Preparation";
}

async function seedSummary(wb: any) {
  console.log("\n=== Seeding sbfp_summary ===");
  const sheet = wb.Sheets["SUMMARY TARGET MILK PROD"];
  if (!sheet) { console.log("  SKIPPED — sheet not found"); return; }
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const records: any[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || String(row[0]).toLowerCase().includes("total")) continue;
    records.push({
      year: 2026, center: String(row[0]).trim(),
      jan_dec_target_milk_volume: Number(row[1]) || 0,
      target_milk_packs: Number(row[2]) || 0,
      equivalent_volume: Number(row[3]) || 0,
      shortage_surplus: Number(row[4]) || 0,
      pct_covered: Number(row[5]) || 0,
      jul_dec_projected_volume: Number(row[6]) || 0,
      milk_packs_can_produce: Number(row[7]) || 0,
      shortage_surplus_packs: Number(row[8]) || 0,
    });
  }
  await supabase.from("sbfp_summary").delete().eq("year", 2026);
  const { error } = await supabase.from("sbfp_summary").insert(records);
  if (error) console.error("  ERROR:", error.message);
  else console.log(`  OK — ${records.length} rows`);
}

async function seedBudget(wb: any) {
  console.log("\n=== Seeding sbfp_budget ===");
  const sheet = wb.Sheets["BUDGET BREAKDOWN"];
  if (!sheet) { console.log("  SKIPPED"); return; }
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const records: any[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || String(row[0]).toUpperCase().includes("TOTAL")) continue;
    records.push({
      year: 2026, center: String(row[0]).trim(),
      milk_supplies: Number(row[1]) || 0,
      office_professional: Number(row[2]) || 0,
      traveling_expenses: Number(row[3]) || 0,
      office_supplies: Number(row[4]) || 0,
      training_expenses: Number(row[5]) || 0,
      furniture_fixtures: Number(row[6]) || 0,
      total: Number(row[7]) || 0,
    });
  }
  await supabase.from("sbfp_budget").delete().eq("year", 2026);
  const { error } = await supabase.from("sbfp_budget").insert(records);
  if (error) console.error("  ERROR:", error.message);
  else console.log(`  OK — ${records.length} rows`);
}

async function seedActivities(wb: any) {
  console.log("\n=== Seeding sbfp_activities ===");
  const sheet = wb.Sheets["STATUS OF ACTIVITIES"];
  if (!sheet) { console.log("  SKIPPED"); return; }
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  await supabase.from("sbfp_activities").delete().eq("year", 2026);
  const records: any[] = [];
  let order = 0;
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || String(row[0]).trim() === "") continue;
    records.push({
      year: 2026,
      activity: String(row[0]).trim(),
      status: row[1] || "Not Started",
      remarks: typeof row[2] === "number" ? excelDateToISO(row[2]) : (row[2] || null),
      sort_order: order++,
    });
  }
  const { error } = await supabase.from("sbfp_activities").insert(records);
  if (error) console.error("  ERROR:", error.message);
  else console.log(`  OK — ${records.length} rows`);
}

async function main() {
  console.log("Reading:", EXCEL_FILE);
  if (!fs.existsSync(EXCEL_FILE)) { console.error("File not found!"); process.exit(1); }
  const wb = xlsx.readFile(EXCEL_FILE);
  await seedSummary(wb);
  await seedBudget(wb);
  await seedActivities(wb);
  console.log("\nALL DONE");
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
}
