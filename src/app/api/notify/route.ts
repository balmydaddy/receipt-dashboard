import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
    }

    const { email, items } = await req.json();
    if (!email || !items || items.length === 0) {
      return NextResponse.json({ error: "email과 items 필요" }, { status: 400 });
    }

    const resend = new Resend(apiKey);

    const rows = items
      .map(
        (i: { name: string; target: number; current: number; store: string; date: string }) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;"><strong>${i.name}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#3B6D11;"><strong>${i.current.toLocaleString()}원</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#888;">목표 ${i.target.toLocaleString()}원 이하</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${i.store}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#888;">${i.date}</td>
      </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#3B6D11;">🎯 목표가 도달 알림</h2>
        <p>설정하신 목표가 이하로 떨어진 품목이 ${items.length}건 있습니다!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#f8f8f8;">
              <th style="padding:8px;text-align:left;">품목</th>
              <th style="padding:8px;text-align:left;">현재가</th>
              <th style="padding:8px;text-align:left;">목표</th>
              <th style="padding:8px;text-align:left;">구매처</th>
              <th style="padding:8px;text-align:left;">일자</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">스마트 재구매 대시보드에서 발송된 알림입니다.</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: `🎯 목표가 도달 - ${items.length}건 알림`,
      html,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error("Notify 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}