// POST a .docx or .csv file as multipart form-data; returns the ParsedPool
// preview JSON. The /admin/upload page calls this, lets Sofia rename any
// "Unknown_N" teams or fix mismatched reserves, then POSTs the confirmed
// payload to /api/admin/import.

import { NextResponse, type NextRequest } from "next/server";

import { parsePoolCsv } from "@/lib/parsers/csv";
import { parsePoolDocx } from "@/lib/parsers/docx";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // RLS enforces admin-only writes, but parsing also needs authentication
  // because the response can leak the in-laws' Word doc contents.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const filename = file.name;
  try {
    if (filename.toLowerCase().endsWith(".docx")) {
      const buf = Buffer.from(await file.arrayBuffer());
      const parsed = await parsePoolDocx(buf, filename);
      return NextResponse.json(parsed);
    }
    if (filename.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const parsed = parsePoolCsv(text, filename);
      return NextResponse.json(parsed);
    }
    return NextResponse.json(
      { error: `Unsupported file type: ${filename}. Use .docx or .csv.` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
