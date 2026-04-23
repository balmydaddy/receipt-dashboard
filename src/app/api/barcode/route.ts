import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { barcode } = await req.json();
    if (!barcode) return NextResponse.json({ error: "barcode 필요" }, { status: 400 });

    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const data = await resp.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      return NextResponse.json({
        success: true,
        data: {
          barcode,
          name: p.product_name_ko || p.product_name || `상품 (${barcode})`,
          brand: p.brands || "", category: p.categories || "", image: p.image_url || "",
        },
      });
    }
    return NextResponse.json({
      success: true,
      data: { barcode, name: `미등록 상품 (${barcode})`, brand: "", category: "", image: "" },
    });
  } catch (err: unknown) {
    console.error("Barcode 오류:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "오류" }, { status: 500 });
  }
}
