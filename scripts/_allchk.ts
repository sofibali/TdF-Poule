import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data: pools } = await sb.from("pools").select("id, year").order("year");
  console.log("year stages totalRows gcRows teams status");
  for (const p of pools ?? []) {
    const { data: stageList } = await sb.from("stage_results").select("stage").eq("pool_id",p.id);
    const stages=new Set((stageList??[]).map(r=>r.stage));
    const rows=(stageList??[]).length;
    const { count: gcRows } = await sb.from("final_gc").select("*",{count:"exact",head:true}).eq("pool_id",p.id);
    const { count: teams } = await sb.from("teams").select("*",{count:"exact",head:true}).eq("pool_id",p.id);
    let bad=[];
    if(stages.size<20) bad.push(`STAGES=${stages.size}`);
    else if(rows<900) bad.push(`rows=${rows}`);
    if((gcRows??0)<10) bad.push(`GC=${gcRows}`);
    console.log(`${p.year} ${String(stages.size).padStart(2)}/21 ${String(rows).padStart(4)} ${String(gcRows).padStart(3)} ${String(teams).padStart(2)} ${bad.length?"!! "+bad.join(" "):"ok"}`);
  }
  console.log("SCANDONE");
})();
