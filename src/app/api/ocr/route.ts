import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

function classifyCategory(name: string): string {
  const n = name.toLowerCase();
  if (/우유|요거트|치즈|계란|두부|쌀|밀가루|과자|라면|음료|물|커피|빵|과일|채소/.test(n)) return "식품·음료";
  if (/맥주|소주|막걸리|와인|술/.test(n)) return "주류";
  if (/세제|샴푸|치약|칫솔|비누|화장지|휴지|청소|세탁/.test(n)) return "생활용품";
  if (/약|영양제|비타민|마스크|밴드|건강/.test(n)) return "의약품·건강";
  if (/크림|로션|립|향수|화장|스킨/.test(n)) return "화장품·뷰티";
  if (/티셔츠|바지|치마|재킷|코트|양말|신발|가방/.test(n)) return "의류·패션";
  if (/폰|충전|이어폰|케이블|노트북|태블릿|마우스|키보드/.test(n)) return "전자·가전";
  if (/볼펜|노트|장난감|블록|인형/.test(n)) return "문구·완구";
  if (/사료|펫|강아지|고양이/.test(n)) return "반려동물";
  if (/헬스|운동|등산|캠핑|자전거/.test(n)) return "스포츠·레저";
  if (/책|도서|잡지|음반/.test(n)) return "도서·음반";
  if (/배달|치킨|피자|햄버거|족발|김밥/.test(n)) return "외식·배달";
  if (/주유|휘발유|주차|택시|버스/.test(n)) return "교통·주유";
  return "기타";
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("API KEY EXISTS:", !!apiKey);
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
    }
    const { image, mediaType } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ error: "image and mediaType required" }, { status: 400 });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    let result;
for (let i = 0; i < 3; i++) {
  try {
    result = await model.generateContent([
      'Return ONLY valid JSON, no markdown. Format: {"store":"name","date":"YYYY-MM-DD or unknown","items":[{"name":"item","qty":1,"unit_price":0,"total":0}]}',
      { inlineData: { mimeType: mediaType, data: image } },
    ]);
 break;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if ((msg.includes("503") || msg.includes("429")) && i < 2) {
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    } else throw e;
  }
}
    const text = result.response.text();
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    parsed.items = (parsed.items || []).map((item: { name: string }) => ({
      ...item,
      category: classifyCategory(item.name),
    }));
    return NextResponse.json({ success: true, data: parsed });
  } catch (err: unknown) {
    console.error("OCR error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}