import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "스마트 재구매 대시보드",
  description: "영수증 OCR 기반 구매 이력 및 최저가 분석",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8f9fa" }}>
        {children}
      </body>
    </html>
  );
}
