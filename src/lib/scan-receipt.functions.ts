import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const SYSTEM = `You read Japanese (and English) shop receipts. Extract a structured JSON object with:
- merchant (string, store name)
- purchase_date (YYYY-MM-DD if visible, else null)
- total_yen (integer yen, the final amount paid — 合計 / お会計 / 計)
- tax_yen (integer yen, consumption tax — 消費税 / 内税, null if not shown)
- items: array of { name (string, product name as printed, translate trivial katakana only when obvious), qty (number, default 1), price (integer yen), category (one of: groceries, dining, household, shopping, transit, entertainment, other), subcategory (short English label such as "chicken", "eggs", "vegetables", "fruit", "snacks", "drinks", "toiletries", etc.) }
Categorize each item: food ingredients (meat, fish, eggs, veggies, fruit, rice, bread, dairy) -> "groceries"; restaurant/cafe/prepared meal -> "dining"; cleaning, paper, kitchen, toiletries -> "household"; clothes, electronics, books -> "shopping"; train/bus/taxi/fuel -> "transit"; movies/games/events -> "entertainment"; otherwise "other".
Only output valid JSON, no commentary, no markdown. Numbers must be integers in yen.`;

const InputSchema = z.object({ receipt_id: z.string().uuid() });

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Fetch receipt row (user-scoped via admin + explicit check)
    const { data: receipt, error: rerr } = await supabaseAdmin
      .from("receipts").select("*").eq("id", data.receipt_id).eq("user_id", userId).maybeSingle();
    if (rerr) throw rerr;
    if (!receipt) throw new Error("Receipt not found");

    // Download image from storage
    const dl = await supabaseAdmin.storage.from("receipts").download(receipt.image_path);
    if (dl.error || !dl.data) throw new Error("Failed to read receipt image");
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const mime = dl.data.type || "image/jpeg";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

    // Call Lovable AI gateway (OpenAI-compatible) with vision
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the receipt as JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
    if (!res.ok) throw new Error(`AI gateway error ${res.status}: ${await res.text()}`);

    const body = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { /* fallthrough */ }

    const VALID_CATS = new Set(["groceries", "dining", "household", "shopping", "transit", "entertainment", "other"]);
    const items = Array.isArray(parsed.items) ? parsed.items.map((i: any) => {
      const cat = typeof i.category === "string" && VALID_CATS.has(i.category.toLowerCase()) ? i.category.toLowerCase() : "other";
      return {
        name: String(i.name ?? "Item"),
        qty: Number.isFinite(+i.qty) ? +i.qty : 1,
        price: Number.isFinite(+i.price) ? Math.round(+i.price) : 0,
        category: cat,
        subcategory: typeof i.subcategory === "string" ? i.subcategory.toLowerCase().trim() : "",
      };
    }) : [];

    const update = {
      merchant: parsed.merchant ?? null,
      purchase_date: typeof parsed.purchase_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.purchase_date) ? parsed.purchase_date : null,
      total_yen: Number.isFinite(+parsed.total_yen) ? Math.round(+parsed.total_yen) : null,
      tax_yen: Number.isFinite(+parsed.tax_yen) ? Math.round(+parsed.tax_yen) : null,
      items,
      raw_text: content,
      status: "scanned",
    };

    const { error: uerr } = await supabaseAdmin.from("receipts").update(update).eq("id", data.receipt_id).eq("user_id", userId);
    if (uerr) throw uerr;

    return { ok: true, ...update };
  });
