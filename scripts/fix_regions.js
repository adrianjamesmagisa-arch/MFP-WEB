const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

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

async function fixRegions() {
  const { data: rows, error } = await supabase.from("sbfp_data").select("*");
  if (error) {
    console.error("Error fetching rows:", error);
    return;
  }
  console.log("Total rows in DB:", rows.length);

  const regionRules = [
    { match: /abra/i, region: "CAR" },
    { match: /apayao/i, region: "CAR" },
    { match: /benguet|baguio/i, region: "CAR" },
    { match: /ifugao/i, region: "CAR" },
    { match: /kalinga/i, region: "CAR" },
    { match: /mt\.?\s*province|mountain\s*province/i, region: "CAR" },
    { match: /tabuk/i, region: "CAR" },
    
    { match: /ilocos\s*norte|laoag|batac/i, region: "I" },
    { match: /ilocos\s*sur|vigan|candon/i, region: "I" },
    { match: /la\s*union|san\s*fernando\s*city/i, region: "I" },
    { match: /pangasinan|alaminos|dagupan|urdanet/i, region: "I" },
    
    { match: /batanes/i, region: "II" },
    { match: /cagayan|tuguegarao/i, region: "II" },
    { match: /isabela|cauayan|ilagan|santiago/i, region: "II" },
    { match: /nueva\s*vizcaya/i, region: "II" },
    { match: /quirino/i, region: "II" },
    
    { match: /aurora/i, region: "III" },
    { match: /bataan|balanga/i, region: "III" },
    { match: /bulacan|malolos|meycauayan|san\s*jose\s*del\s*monte/i, region: "III" },
    { match: /nueva\s*ecija|cabanatuan|gapan|mu[nñ]oz|palayan/i, region: "III" },
    { match: /san\s*jose\s*city/i, region: "III" },
    { match: /pampanga|angeles|mabalacat/i, region: "III" },
    { match: /tarlac/i, region: "III" },
    { match: /zambales|olongapo/i, region: "III" },
    
    { match: /batangas|lipa|tanauan/i, region: "IV-A" },
    { match: /cavite|bacoor|dasma|imus|general\s*trias/i, region: "IV-A" },
    { match: /laguna|bi[nñ]an|cabuyao|calamba|san\s*pablo|santa\s*rosa/i, region: "IV-A" },
    { match: /quezon|lucena|tayabas/i, region: "IV-A" },
    { match: /rizal|antipolo/i, region: "IV-A" },
    
    { match: /marinduque/i, region: "IV-B" },
    { match: /occidental\s*mindoro|mamburao/i, region: "IV-B" },
    { match: /oriental\s*mindoro|calapan/i, region: "IV-B" },
    { match: /palawan|puerto\s*princesa/i, region: "IV-B" },
    { match: /romblon/i, region: "IV-B" },
    
    { match: /albay|legaspi|legazpi|ligao|tabaco/i, region: "V" },
    { match: /camarines/i, region: "V" },
    { match: /catanduanes/i, region: "V" },
    { match: /masbate/i, region: "V" },
    { match: /sorsogon/i, region: "V" },
    
    { match: /las\s*pi[nñ]as|makati|malabon|mandaluyong|manila|marikina|muntinlupa|navotas|para[nñ]aque|pasay|pasig|quezon\s*city|san\s*juan|taguig|pateros|valenzuela/i, region: "NCR" },
    
    { match: /aklan|antique|capiz|roxas|guimaras|iloilo|passi/i, region: "VI" },
    
    { match: /bohol|tagbilaran/i, region: "VII" },
    { match: /cebu|carcar|naga|mandaue|lapu|toledo|talisay/i, region: "VII" },
    { match: /siquijor/i, region: "VII" },
    
    { match: /bais|bayawan|canlaon|dumaguete|guihulngan|tanjay|la\s*carlota|sipalay|victorias/i, region: "NIR" },
    { match: /negros/i, region: "NIR" },
    
    { match: /biliran|leyte|baybay|ormoc|tacloban|samar|calbayog|catbalogan|maasin/i, region: "VIII" },
    
    { match: /zamboanga|dapitan|dipolog|pagadian|isabela\s*city/i, region: "IX" },
    
    { match: /bukidnon|malaybalay|valencia|camiguin|lanao\s*del\s*norte|iligan|misamis|oroquieta|ozami[sz]|tangub|cagayan\s*de\s*oro|gingoog|el\s*salvador/i, region: "X" },
    
    { match: /davao|mati|tagum|panabo|samal|digos/i, region: "XI" },
    
    { match: /cotabato|kidapawan|sarangani|general\s*santos|koronadal|sultan\s*kudarat|tacurong/i, region: "XII" },
    
    { match: /agusan|butuan|cabadbaran|bayugan|dinagat|surigao|bislig|tandag/i, region: "CARAGA" },
    
    { match: /basilan|lamitan|lanao\s*del\s*sur|marawi|maguindanao|sulu|tawi/i, region: "BARMM" }
  ];

  let updatedCount = 0;
  for (const row of rows) {
    if (!row.region || row.region.trim() === "") {
      let foundRegion = null;
      for (const rule of regionRules) {
        if (rule.match.test(row.sdo)) {
          if (/san\s*carlos/i.test(row.sdo)) {
            if (row.center === "DMMMSU" || row.center === "MMSU" || row.center === "CLSU") {
              foundRegion = "I";
            } else if (row.center === "LCSF" || row.center === "WVSU") {
              foundRegion = "NIR";
            } else {
              foundRegion = rule.region;
            }
          } else {
            foundRegion = rule.region;
          }
          break;
        }
      }
      if (foundRegion) {
        await supabase.from("sbfp_data").update({ region: foundRegion }).eq("id", row.id);
        updatedCount++;
        console.log(`Updated [${row.sdo}] (Center: ${row.center}) -> Region: ${foundRegion}`);
      } else {
        console.log(`Unmatched SDO: [${row.sdo}] (Center: ${row.center})`);
      }
    }
  }

  console.log(`Total regions updated: ${updatedCount}`);
}

fixRegions();
