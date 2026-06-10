import { geminiJson, geminiText } from "./gemini.js";

export interface CardFields {
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  address: string;
}

const CARD_SCHEMA = `명함 이미지에서 연락처 정보를 추출해 JSON만 출력.
스키마: {"name":"","title":"","company":"","phone":"","email":"","address":""}
없는 필드는 빈 문자열. 한국어·영어 명함 모두 지원.`;

export async function ocrBusinessCard(imageBase64: string, mimeType: string): Promise<CardFields> {
  const raw = await geminiJson<Partial<CardFields>>(
    [
      { text: CARD_SCHEMA },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    "당신은 OCR 전문가다. JSON만 출력한다."
  );
  return {
    name: raw.name?.trim() ?? "",
    title: raw.title?.trim() ?? "",
    company: raw.company?.trim() ?? "",
    phone: raw.phone?.trim() ?? "",
    email: raw.email?.trim() ?? "",
    address: raw.address?.trim() ?? "",
  };
}

export async function ocrDocumentText(imageBase64: string, mimeType: string): Promise<string> {
  return geminiText(
    [
      { text: "이미지 속 글자를 빠짐없이 텍스트로 전사해줘. 설명 없이 본문만." },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    "문서·화이트보드·회의 메모 OCR"
  );
}
