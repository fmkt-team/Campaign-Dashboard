import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { base64Image } = await req.json();

    if (!base64Image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = "AIzaSyBogkDbzmrI0h_sAwtUZyTmvMnH2P2PZkw";
    if (!apiKey) {
      return NextResponse.json(
        { error: "API KEY가 설정되어 있지 않습니다." },
        { status: 401 }
      );
    }

    const base64Data = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
    const mimeTypeStr = base64Image.includes(";") ? base64Image.split(";")[0].split(":")[1] : "image/jpeg";

    const promptText = `
You are an expert marketing structural parser. Your job is to extract campaign phases from the provided structure image.
Pay extremely close attention to the visual groupings (boxes, columns) and hierarchical relationships.

Output STRICTLY valid JSON ONLY in the following exact format:
{
  "phases": [
    {
      "title": "Phase 1",
      "subtitle": "캠페인 흥미 유도 및 확산",
      "items": [
        { "name": "박수트로피 이벤트", "description": "캠페인 체험" },
        { "name": "오프라인 팝업", "description": "브랜드 공간 경험" }
      ]
    }
  ]
}

Ensure all Korean text is precisely identical to the image. 
Match the Title with the "Phase X" text. 
Match the Subtitle with the text underneath the "Phase X" text.
Match the Item "name" with the bold/colored title of each box.
Match the Item "description" with the smaller text inside that box. 
`;

    // Google Gemini REST API (gemini-2.5-flash)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeTypeStr, data: base64Data } }
              ],
            },
          ],
          system_instruction: { 
            parts: [{ text: "You must always output only perfectly valid JSON without any markdown code block wrappers or comments. Only JSON." }] 
          },
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini Error:", errText);
      return NextResponse.json({ error: "Gemini API Error" }, { status: 500 });
    }

    const data = await response.json();
    let resultJsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultJsonStr) {
      return NextResponse.json({ error: "No output generated" }, { status: 500 });
    }

    // Clean markdown wrappers if returned despite responseMimeType
    resultJsonStr = resultJsonStr.replace(/^```json/g, "").replace(/^```/g, "").replace(/```$/g, "").trim();

    const parsed = JSON.parse(resultJsonStr);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Extract API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
