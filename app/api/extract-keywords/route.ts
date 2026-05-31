import { NextResponse } from "next/server";

const GEMINI_API_KEY = "AIzaSyBogkDbzmrI0h_sAwtUZyTmvMnH2P2PZkw";

const SYSTEM_PROMPT = `당신은 마케팅 인사이트 추출 전문가입니다.
리뷰·댓글에서 마케터가 실제로 활용할 수 있는 핵심 키워드만 추출합니다.

━━━ 단 하나의 판단 기준 ━━━
"이 키워드를 보고 마케터가 인사이트를 얻을 수 있는가?"
→ YES 예시: 퍼시스, 감동이에요, 뭉클하네요, 묵묵히, 메시지, 파이팅, 재택도입하고싶어요
→ NO  예시: 보이지, 않는, 아닌, 갑니다, 사람들, 이렇게, 그래서

━━━ [최우선] 절대 추출 금지 패턴 ━━━
아래 패턴에 해당하면 반드시 제외 — 예외 없음:

1. 부정형 어미로 끝나는 단어
   ~지 (보이지, 느껴지지, 알지)
   ~않는, ~않아, ~않고 (부족하지않는, 나쁘지않아)
   ~아닌, ~아니고 (광고아닌, 끝이아닌)
   ~없는, ~없어, ~없고 (문제없는, 걱정없어)
   ~못한, ~못해, ~못하고 (기대못한)

2. 단독 이동·방향 동사 (목적어/수식어 없이 혼자)
   갑니다, 옵니다, 됩니다, 떠납니다, 나옵니다

3. 형용사 없는 단독 상태동사
   보이지, 느껴지지, 들리지, 되어지지

4. 대명사 전체
   나는, 나도, 우리, 누구, 모두, 저는, 이분, 본인, 저희, 당신

5. 지시어·관계어
   이것, 이렇게, 이런, 저런, 그런, 이게, 뭔가, 뭔지

6. 단순 접속어
   그리고, 하지만, 그래서, 때문에, 그러나, 그런데

7. 강조 부사 단독 (수식어와 결합 시 허용)
   너무, 정말, 진짜, 매우, 아주 — 단독일 때만 금지
   ※ "진짜감동" "너무좋아" 처럼 뒤에 내용이 붙으면 허용

━━━ 반드시 포함할 유형 ━━━
1. 브랜드·제품·기능명: 퍼시스, 모션데스크, 스탠딩 등 고유명사
2. 공간·환경 경험어: 쾌적, 조용, 집중, 편안, 아늑, 탁트인
3. 감정·반응어: 감동이에요, 뭉클하네요, 위로받아, 힘이돼요, 울컥했어요
4. 행동 의도어: 또올것같아요, 추천해요, 재택도입하고싶어요
5. 콘텐츠 메시지 반응어: 메시지전달, 광고인데공감, 묵묵히, 파이팅

━━━ 형식 규칙 ━━━
- 의미 단위 구절은 띄어쓰기 없이 붙여서 추출
  예: "외부 소음이 없어요" → 외부소음없어요   (단, "소음없어" 처럼 긍정 맥락이면 허용)
  예: "또 올 것 같아요" → 또올것같아요
  예: "재택 도입 하고 싶다" → 재택도입하고싶다
- 단독 감성어는 원형 그대로: 쾌적, 편안, 조용
- 브랜드·제품명 원형 그대로: 모션데스크, 퍼시스
- 텍스트당 3~6개 (짧은 댓글 2~3개, 긴 댓글 최대 6개)
- 텍스트에 없는 단어 절대 생성 금지

━━━ 추출 후 self-check (출력 전 필수) ━━━
추출한 키워드 목록을 다시 보고:
□ 부정형 어미(~지, ~않는, ~아닌, ~없는, ~못한)로 끝나는 것이 있는가?
□ 문법적 기능어(조사, 접속사, 대명사)가 섞여 있는가?
□ 혼자 쓰인 이동동사/상태동사가 있는가?
→ 하나라도 YES이면 해당 키워드 제거 후 출력

출력은 반드시 아래 JSON 형식만 반환 (마크다운·설명 없음):
{"results": [["kw1","kw2",...], ["kw1","kw2",...], ...]}`;

export async function POST(req: Request) {
  try {
    const { texts } = await req.json() as { texts: string[] };

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: "texts 배열이 필요합니다." }, { status: 400 });
    }

    // 너무 긴 텍스트는 앞 200자로 자름
    const trimmed = texts.map(t => String(t || "").slice(0, 200).trim()).filter(Boolean);
    if (trimmed.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const userPrompt = `아래 ${trimmed.length}개의 텍스트 각각에서 규칙에 맞는 키워드를 추출하세요.\n\n${
      trimmed.map((t, i) => `[${i + 1}] ${t}`).join("\n")
    }`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini error:", errText);
      return NextResponse.json({ error: "Gemini API 오류" }, { status: 500 });
    }

    const data = await response.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    raw = raw.replace(/^```json\s*/g, "").replace(/^```\s*/g, "").replace(/\s*```$/g, "").trim();

    const parsed = JSON.parse(raw) as { results: string[][] };

    // 결과 배열 길이 맞추기 (텍스트 수와 동일하게)
    const results: string[][] = trimmed.map((_, i) => parsed.results?.[i] ?? []);

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error("extract-keywords error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
