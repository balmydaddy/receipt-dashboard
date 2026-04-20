import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  "식품·음료", "주류", "생활용품", "의약품·건강",
  "화장품·뷰티", "의류·패션", "전자·가전", "문구·완구",
  "반려동물", "스포츠·레저", "도서·음반", "외식·배달",
  "교통·주유", "기타",
] as const;

type Category = (typeof CATEGORIES)[number];

function classifyCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/우유|요거트|치즈|계란|두부|콩나물|쌀|밀가루|설탕|소금|간장|된장|고추장|참기름|식용유|과자|라면|햄|소시지|냉동|캔|주스|음료|물|커피|차|초코|아이스크림|빵|케이크|과일|채소|정육|수산/.test(n)) return "식품·음료";
  if (/맥주|소주|막걸리|와인|위스키|양주|술/.test(n)) return "주류";
  if (/세제|샴푸|린스|치약|칫솔|비누|화장지|휴지|키친타월|청소|세탁|방향제|모기|살충|쓰레기봉투/.test(n)) return "생활용품";
  if (/약|영양제|비타민|마스크|밴드|소독|체온계|혈압|건강/.test(n)) return "의약품·건강";
  if (/크림|로션|선크림|립|마스카라|파운데이션|향수|화장|스킨|에센스|팩/.test(n)) return "화장품·뷰티";
  if (/티셔츠|바지|치마|원피스|재킷|코트|양말|속옷|신발|가방|벨트|모자/.test(n)) return "의류·패션";
  if (/폰|핸드폰|충전|이어폰|케이블|배터리|노트북|태블릿|마우스|키보드|usb|hdmi/.test(n)) return "전자·가전";
  if (/볼펜|노트|스케치북|색연필|장난감|블록|인형/.test(n)) return "문구·완구";
  if (/사료|간식|모래|케이지|목줄|펫|강아지|고양이/.test(n)) return "반려동물";
  if (/헬스|운동|요가|등산|낚시|캠핑|자전거|수영/.test(n)) return "스포츠·레저";
  if (/책|도서|잡지|만화|음반|dvd/.test(n)) return "도서·음반";
  if (/배달|치킨|피자|햄버거|짜장|짬뽕|족발|보쌈|김밥|도시락/.test(n)) return "외식·배달";
  if (/주유|휘발유|경유|톨게이트|주차|택시|버스|지하철/.test(n)) return "교통·주유";
  return "기타";
}

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();

    if (!image || !mediaType) {
      return NextResponse.json({ error: "image와 mediaType이 필요합니다." }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json({ error: "지원하지 않는 이미지 형식입니다." }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: `You are a receipt OCR assistant. Extract the store name and ALL line items from the receipt image.
Return ONLY valid JSON, no markdown, no explanation.
Format:
{
  "store": "구매처명 (한국어 우선, 없으면 알 수 없음)",
  "date": "YYYY-MM-DD (영수증 전체 날짜, 없으면 unknown)",
  "items": [
    {
      "name": "품목명 (한국어 우선)",
      "qty": 1,
      "unit_price": 0,
      "total": 0
    }
  ]
}
unit_price와 total은 숫자만 (쉼표·기호 없이).
날짜가 품목마다 다르면 각 items에 date 필드를 추가.`,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: image,
            },
          },
          { type: "text", text: "이 영수증에서 구매처와 모든 품목을 JSON으로 추출해주세요." },
        ],
      }],
    });

    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    // 카테고리 자동 분류 (서버에서 처리)
    parsed.items = (parsed.items || []).map((item: { name: string; [key: string]: unknown }) => ({
      ...item,
      category: classifyCategory(item.name),
    }));

    return NextResponse.json({ success: true, data: parsed });
  } catch (err: unknown) {
    console.error("OCR API 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
