# 캠페인 자동화 Task

- [x] Convex 초기화 및 연동 (`npx convex dev`)
- [x] shadcn/ui 기반 컴포넌트 세팅 (Button, Input, Table, Layout)
- [x] UI 및 기능 고도화
    - [x] 캘린더 네비게이션 버튼 상단 이동 (`calendar.tsx`)
    - [x] GA4 API 시간 단위(Day/Week/Month) 지원 (`ga4-report/route.ts`)
    - [x] 페이지 UI 반영 (단위 선택 버튼, Property ID 제거, 차트 점 추가)
- [x] 유입 상세 페이지 (`conversion/page.tsx`) 로직 개편
    - [x] 전역 `dateRange` 상태 도입
    - [x] 자동 데이터 페칭 (`useEffect`) 구현
    - [x] 수동 GA4 연동 및 엑셀 붙여넣기 기능 제거 (완료)
