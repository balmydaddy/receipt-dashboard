# 스마트 재구매 대시보드

영수증 사진 → AI OCR → 구매처·가격이력 추적 → 최저가 재구매 타이밍 분석

## 구조 (CORS 근본 해결)

```
브라우저 → /api/ocr (Next.js 서버) → Anthropic API
```

브라우저가 Anthropic API를 직접 호출하지 않으므로 CORS 문제 없음.

## 실행 방법

### 1. API 키 설정
```bash
# .env.local 파일 열어서 API 키 입력
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```
API 키 발급: https://console.anthropic.com

### 2. 패키지 설치 & 실행
```bash
npm install
npm run dev
```

### 3. 브라우저에서 접속
```
http://localhost:3000
```

## 주요 기능

| 탭 | 기능 |
|---|---|
| 개요 | 총 지출·품목·구매처 요약, 막대 차트 |
| 재구매 추천 | 최저가/근접/고가 3단계 판정 + 최저가 구매처 표시 |
| 가격 변동 | 품목별 구매처별 시계열 차트 + 최저가 기준선 |
| 구매처 | 구매처별 지출·횟수·품목 수 + 비율 차트 |
| 전체 이력 | 검색·필터·정렬, 최저가 항목 하이라이트 |

## 배포 (선택)

```bash
# Vercel 배포 (무료)
npx vercel

# 환경변수 설정
vercel env add ANTHROPIC_API_KEY
```
