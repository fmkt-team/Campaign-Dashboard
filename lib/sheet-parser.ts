/**
 * 구글 스프레드시트 🕒 TimeLine 시트 파서
 * 
 * 실제 시트 구조 (gid=598518381):
 *  - Row 1: 타이틀 (병합)
 *  - Row 2: 빈 행
 *  - Row 3: 헤더
 *    - A열: 대분류
 *    - B열: 업무 WIP
 *    - C열: 소분류 (워크플로우) → 업무명으로 사용
 *    - D열: 진척도 % (숫자)
 *    - E열: 담당 R&R 팀
 *    - F열~: 날짜 그리드 (형식: "화 4/14", "수 4/15" 등)
 *  - Row 4: 빈 행 또는 서브 헤더
 *  - Row 5~: 데이터 (A열은 병합, 공백이면 이전 행의 값을 계승)
 */

export interface ParsedGanttTask {
  category: string;   // 대분류 (A열)
  subTask: string;    // 소분류/워크플로우 (C열)
  assignee: string;   // 담당팀 (E열)
  progress: number;   // 진척도 0~100 (D열)
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  sortOrder: number;
  color: string;
}

// 시트 식별 정보
export const SHEET_ID = "1p6ILP4rv6NF4u6MaUfhkI4zZtATkuhsfOF0XWlz-DS8";
export const SHEET_GID = "598518381"; // 🕒 TimeLine 시트

export function getSheetCsvUrl(gid: string = SHEET_GID): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

/**
 * CSV 텍스트를 2D 배열로 파싱 (따옴표 내 쉼표 이스케이프 처리)
 */
export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let inQuote = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        row.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

// 카테고리별 색상 매핑
const CATEGORY_COLORS: Record<string, string> = {
  "계약": "#6366f1",
  "Branding": "#e50010",
  "브랜딩": "#e50010",
  "온라인": "#3b82f6",
  "디지털": "#3b82f6",
  "오프라인": "#8b5cf6",
  "SNS": "#10b981",
  "소셜": "#10b981",
  "미디어": "#f59e0b",
  "PR": "#f59e0b",
  "이벤트": "#ec4899",
};

function getCategoryColor(category: string): string {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (category.includes(key)) return CATEGORY_COLORS[key];
  }
  return "#6366f1";
}

/**
 * "화 4/14" 같은 날짜 헤더를 YYYY-MM-DD로 변환
 * 연도는 campaignYear에서 보완
 */
function parseDateHeader(raw: string, campaignYear: string): string {
  if (!raw) return "";
  
  // "화 4/14" → "4/14" 추출 (요일 제거)
  const cleaned = raw.replace(/^[월화수목금토일]\s*/, "").trim();
  
  // "M/D" 형식
  const slash = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const m = slash[1].padStart(2, "0");
    const d = slash[2].padStart(2, "0");
    return `${campaignYear}-${m}-${d}`;
  }
  
  // 이미 YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  
  return "";
}

/**
 * 파싱된 rows 배열을 GanttTask 배열로 변환
 * 
 * 헤더는 Row 3 (index 2)에 있고,
 * 데이터는 Row 5 (index 4)부터 시작합니다.
 */
export function parseTimelineSheet(
  rows: string[][],
  campaignStartDate: string
): ParsedGanttTask[] {
  if (rows.length < 4) return [];

  const campaignYear = campaignStartDate
    ? campaignStartDate.substring(0, 4)
    : new Date().getFullYear().toString();

  // Row 3 (index 2)에서 헤더 파싱: F열(index 5)부터 날짜
  const headerRow = rows[2] ?? [];
  const DATE_COL_START = 5; // F열 = index 5

  // 날짜 헤더 배열 생성 (F열 이후)
  const dateHeaders: string[] = [];
  for (let i = DATE_COL_START; i < headerRow.length; i++) {
    const parsed = parseDateHeader(headerRow[i] ?? "", campaignYear);
    dateHeaders.push(parsed);
  }

  const tasks: ParsedGanttTask[] = [];
  let lastCategory = "";
  let sortOrder = 0;

  // Row 5부터 (index 4) 데이터 파싱
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    // A열: 대분류 (병합 셀이면 빈 문자열 → 이전 값 계승)
    const rawCategory = (row[0] ?? "").trim();
    if (rawCategory) lastCategory = rawCategory;
    const category = lastCategory;

    // C열: 소분류/워크플로우 (업무명)
    const subTask = (row[2] ?? "").trim();
    if (!subTask) continue; // 업무명이 없는 행 스킵

    // D열: 진척도 (숫자 or 백분율 문자열)
    const progressRaw = (row[3] ?? "").trim().replace(/[%\s]/g, "");
    const progress = progressRaw
      ? Math.min(100, Math.max(0, Math.round(parseFloat(progressRaw) || 0)))
      : 0;

    // E열: 담당 팀
    const assignee = (row[4] ?? "").trim();

    // F열 이후: 비어있지 않은 셀의 날짜 범위 탐색
    // (배경색이 있는 셀 = 기간. CSV에서는 값이 있거나 특정 마커로 표시)
    let startDate = "";
    let endDate = "";

    for (let j = 0; j < dateHeaders.length; j++) {
      const cellVal = (row[DATE_COL_START + j] ?? "").trim();
      const dateStr = dateHeaders[j];
      if (!dateStr) continue;

      // 비어있지 않은 셀이 있으면 해당 날짜가 기간에 포함된 것으로 간주
      if (cellVal !== "" && cellVal !== "0") {
        if (!startDate) startDate = dateStr;
        endDate = dateStr;
      }
    }

    // 날짜를 찾지 못한 경우: 캠페인 시작일 기준 기본값
    if (!startDate) {
      startDate = campaignStartDate;
      endDate = campaignStartDate;
    }

    tasks.push({
      category,
      subTask,
      assignee,
      progress,
      startDate,
      endDate,
      sortOrder: sortOrder++,
      color: getCategoryColor(category),
    });
  }

  return tasks;
}
