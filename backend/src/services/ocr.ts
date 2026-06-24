import { geminiJson, geminiText } from "./gemini.js";

export interface CardFields {
  name: string;
  title: string;
  department: string;
  company: string;
  phone: string;
  email: string;
  address: string;
}

const TITLE_SUFFIX =
  /^(?<name>.+?)\s+(?<title>매니저|팀장|부장|차장|과장|대리|주임|사원|선임|책임|수석|이사|상무|전무|부사장|사장|대표|원장|교수|연구원|컨설턴트|Manager|Director|CEO|CTO|CFO|CPO|COO|VP|Principal|Senior|Lead)$/iu;

const CARD_SCHEMA = `명함 이미지에서 연락처 정보를 추출해 JSON만 출력.
스키마: {"name":"","title":"","department":"","company":"","phone":"","email":"","address":""}
규칙:
- name: 사람 이름만 (성+이름). 직책·부서·회사명 넣지 말 것
- title: 직책/직함만 (매니저, 부장, CEO 등)
- department: 부서·팀·파트만 (예: 기술지원 파트 / 컨설팅팀). | 로 구분된 부서는 department에
- company: 회사·기관명
없는 필드는 빈 문자열. 한국어·영어 명함 모두 지원.`;

export function normalizeCardFields(raw: Partial<CardFields>): CardFields {
  let name = raw.name?.trim() ?? "";
  let title = raw.title?.trim() ?? "";
  let department = raw.department?.trim() ?? "";
  const company = raw.company?.trim() ?? "";
  const phone = raw.phone?.trim() ?? "";
  const email = raw.email?.trim() ?? "";
  const address = raw.address?.trim() ?? "";

  if (!department && name.includes("|")) {
    const pipeIdx = name.indexOf("|");
    const left = name.slice(0, pipeIdx).trim();
    const right = name.slice(pipeIdx + 1).trim();
    if (right) {
      department = right;
      name = left;
    }
  }

  if (!title && name) {
    const m = name.match(TITLE_SUFFIX);
    if (m?.groups?.name && m.groups.title) {
      name = m.groups.name.trim();
      title = m.groups.title.trim();
    }
  }

  if (!department && title && (title.includes("|") || title.includes("/"))) {
    const pipeIdx = title.indexOf("|");
    if (pipeIdx >= 0) {
      const left = title.slice(0, pipeIdx).trim();
      const right = title.slice(pipeIdx + 1).trim();
      if (right) {
        department = right;
        title = left;
      }
    } else if (title.includes("/")) {
      department = title;
      title = "";
    }
  }

  return { name, title, department, company, phone, email, address };
}

export async function ocrBusinessCard(imageBase64: string, mimeType: string): Promise<CardFields> {
  const raw = await geminiJson<Partial<CardFields>>(
    [
      { text: CARD_SCHEMA },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    "당신은 OCR 전문가다. JSON만 출력한다."
  );
  return normalizeCardFields(raw);
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
