export const ERP_MODULES = [
  { id: "kb", label: "지식경영", icon: "book", group: "main" },
  { id: "meetings", label: "회의록", icon: "meet", group: "work" },
  { id: "okr", label: "OKR", icon: "okr", group: "work" },
  { id: "sales-daily", label: "문의/결제 대시보드", icon: "board", group: "sales", groupLabel: "문의/결제" },
  { id: "sales-sync", label: "세일즈 동기화", icon: "sales", group: "sales" },
  { id: "sales-rate", label: "당월 결제율", icon: "chart", group: "sales" },
  { id: "sales-trend", label: "월간 추이", icon: "trend", group: "sales" },
  { id: "sales-dashboard", label: "세일즈 계기판", icon: "gauge", group: "sales" },
];

export const ERP_ADMIN_MODULES = [
  { id: "members", label: "멤버 초대", icon: "admin" },
];

export const LEAVE_TYPES = [
  { id: "annual", label: "유급(연차)", days: 1, color: "#F8BBD9", singleDay: false, advance: "2주 전 권장" },
  { id: "half_am", label: "오전 반차", days: 0.5, color: "#FFF176", singleDay: true, advance: "2주 전 권장", hint: "출근 14:00·14:30·15:00 / 근무 4시간" },
  { id: "half_pm", label: "오후 반차", days: 0.5, color: "#81D4FA", singleDay: true, advance: "2주 전 권장", hint: "출근 08:00·08:30 / 점심 전 퇴근" },
  { id: "quarter_am", label: "오전 반반차", days: 0.25, color: "#FFE082", singleDay: true, advance: "1주 전 권장", hint: "출근 10:00~11:30 / 2시간 휴가" },
  { id: "quarter_pm", label: "오후 반반차", days: 0.25, color: "#B3E5FC", singleDay: true, advance: "1주 전 권장", hint: "출근 08:00~10:00 / 2시간 휴가" },
  { id: "wfh", label: "재택근무", days: 0, color: "#CE93D8", singleDay: true, advance: "1주 전 권장", noDeduct: true },
  { id: "other", label: "기타", days: 0, color: "#BCAAA4", singleDay: true, noDeduct: true },
];

export const LEAVE_POLICY = [
  "출근 가능: 08:00 ~ 10:00 (자율 출근)",
  "점심시간: 12:30 ~ 13:55",
  "연차는 회계연도(1/1) 기준 일괄 부여",
  "휴가 신청은 사전에 팀장 결재 필요",
  "반차·반반차는 30분 단위 고정 시간대 기준",
];

export const APPROVAL_BOXES = [
  { id: "draft", label: "기안함" },
  { id: "submitted", label: "상신함" },
  { id: "approve", label: "결재함" },
  { id: "done", label: "완료함" },
  { id: "rejected", label: "반려함" },
];

export const APPROVAL_CHAINS = [
  { id: "team_leader", label: "팀장만" },
  { id: "to_coo", label: "팀장 → COO" },
  { id: "to_ceo", label: "팀장 → COO → CEO" },
];

export const FORM_CHAIN_HINT = {
  leave: "팀장 결재",
  expense: "경영지원팀 확인",
  purchase: "경영지원팀 → COO 또는 CEO",
  refund: "경영지원팀 확인 → COO 승인",
  general: "일반품의 결재선 선택",
};

export const REFUND_TYPES = [
  { id: "plan", label: "요금제" },
  { id: "cancel", label: "해지환불" },
  { id: "kiosk", label: "키오스크" },
  { id: "wired_terminal", label: "유선카드단말기" },
  { id: "partial", label: "부분환불" },
  { id: "terminal_sub_cancel", label: "단말기 구독 취소" },
];

export const PAYMENT_METHODS = [
  { id: "card", label: "카드결제" },
  { id: "transfer", label: "계좌이체" },
];

export const REFUND_METHODS = [
  { id: "partial", label: "부분환불" },
  { id: "full", label: "전액환불" },
  { id: "card_cancel", label: "카드취소" },
  { id: "transfer_refund", label: "계좌이체환불" },
];

export const EMPTY_REFUND_FORM = {
  clientName: "",
  refundType: "plan",
  paymentDate: "",
  paymentTime: "",
  paymentMethod: "card",
  cardAccountInfo: "",
  amount: "",
  refundMethod: "partial",
  reason: "",
  taxInvoice: false,
  remarks: "",
  depositorName: "",
  email: "",
  agreement: "",
};

export const EMPLOYEE_ROLES = ["팀장", "COO", "CEO", "경영지원", "인사", "시스템관리자"];
