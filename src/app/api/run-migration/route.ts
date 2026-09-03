import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MONTHLY_RAW_MILK_SQL = `ALTER TABLE public.sbfp_data
  ADD COLUMN IF NOT EXISTS monthly_packs_delivered JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_milk_prices JSONB DEFAULT '{}'::jsonb;`;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "public" } }
  );

  const { error: testErr } = await supabase
    .from("sbfp_data")
    .select("monthly_packs_delivered,raw_milk_prices")
    .limit(1);

  const colMissing =
    !!testErr?.message &&
    (testErr.message.includes("monthly_packs_delivered") ||
      testErr.message.includes("raw_milk_prices") ||
      testErr.message.includes("column"));

  if (colMissing) {
    return NextResponse.json({
      status: "ACTION_REQUIRED",
      message:
        "Please run this SQL in your Supabase Dashboard > SQL Editor:",
      sql: MONTHLY_RAW_MILK_SQL,
    });
  }

  return NextResponse.json({
    status: "OK",
    message: "monthly_packs_delivered and raw_milk_prices columns are ready.",
  });
}
