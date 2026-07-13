import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { erpIcons as I } from "./icons.jsx";
import { APPROVAL_BOXES, LEAVE_TYPES, LEAVE_POLICY, APPROVAL_CHAINS, FORM_CHAIN_HINT, EMPLOYEE_ROLES, REFUND_TYPES, PAYMENT_METHODS, REFUND_METHODS, EMPTY_REFUND_FORM } from "./config.js";
import { notifyError, toastSuccess } from "../toast.js";
import { confirmAction } from "../confirm.js";
import { StatViz, seriesColor } from "./charts.jsx";
import { BROJ_SEAL, BROJ_LOGO } from "./brojSeal.js";

const STATUS_LABEL = {
  draft: "임시저장", submitted: "상신", in_progress: "진행중",
  approved: "완료", rejected: "반려", pending: "결재중", waiting: "대기",
};

function StatusPill({ status }) {
  const cls = status === "approved" || status === "done" ? "done"
    : status === "rejected" ? "reject" : "wait";
  return <span className={`status-pill ${cls}`}>{STATUS_LABEL[status] || status}</span>;
}

export function DashboardView({ user, onNavigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.erpDashboard().then(setData).catch(notifyError);
  }, []);
  if (!data) return <div className="spinner" />;
  const name = (user?.name || "회원").split(" ")[0];
  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="h-eyebrow">{today}</div>
      <div className="h-title">안녕하세요, {name}님</div>
      <div className="widget-grid">
        <div className="widget" onClick={() => onNavigate("approval")}>
          <h3>결재 대기</h3>
          <div className="num">{data.pendingApprovals}</div>
          <div className="sub">내 차례인 문서</div>
        </div>
        <div className="widget" onClick={() => onNavigate("leave")}>
          <h3>내 휴가</h3>
          <div className="num">{data.leave?.totalLeft ?? 0}일</div>
          <div className="sub">정기 {data.leave?.regularLeft} · 포상 {data.leave?.rewardLeft}</div>
        </div>
        <div className="widget" onClick={() => onNavigate("calendar")}>
          <h3>오늘 일정</h3>
          <div className="num">{data.todayEvents?.length ?? 0}</div>
          <div className="sub">오늘·내일 일정</div>
        </div>
        <div className="widget" onClick={() => onNavigate("notifications")}>
          <h3>알림</h3>
          <div className="num">{data.unreadNotifs}</div>
          <div className="sub">읽지 않은 알림</div>
        </div>
        <div className="widget" onClick={() => onNavigate("okr")}>
          <h3>내 OKR</h3>
          <div className="num">{data.okrObjectives?.length ?? 0}</div>
          <div className="sub">담당 Objective</div>
        </div>
        <div className="widget" onClick={() => onNavigate("events")}>
          <h3>공지·행사</h3>
          <div className="num">{data.recentEvents?.length ?? 0}</div>
          <div className="sub">다가오는 행사</div>
        </div>
      </div>
      {data.recentApprovals?.length > 0 && (
        <>
          <div className="h-title" style={{ fontSize: 17, marginTop: 24 }}>결재 대기 문서</div>
          {data.recentApprovals.map((d) => (
            <div key={d.id} className="list-item" onClick={() => onNavigate("approval", d.id)}>
              <div>
                <div className="ttl">{d.title}</div>
                <div className="meta">{d.formName} · {d.author}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function labelOf(list, id) {
  return list.find((x) => x.id === id)?.label || id || "-";
}

function formatAmount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("ko-KR") + "원";
}

function RefundDetail({ body }) {
  if (!body || body.content) return null;
  return (
    <div className="refund-detail">
      <div className="refund-row"><span className="lbl">고객사</span><span className="val">{body.clientName || "-"}</span></div>
      <div className="refund-row"><span className="lbl">환불 종류</span><span className="val">{labelOf(REFUND_TYPES, body.refundType)}</span></div>
      <div className="refund-row"><span className="lbl">결제일</span><span className="val">{body.paymentDate ? new Date(body.paymentDate).toLocaleDateString("ko-KR") : "-"}</span></div>
      {body.paymentTime && <div className="refund-row"><span className="lbl">결제시각</span><span className="val">{body.paymentTime}</span></div>}
      <div className="refund-row"><span className="lbl">결제방식</span><span className="val">{labelOf(PAYMENT_METHODS, body.paymentMethod)}</span></div>
      {body.cardAccountInfo && <div className="refund-row"><span className="lbl">카드/계좌</span><span className="val">{body.cardAccountInfo}</span></div>}
      <div className="refund-row"><span className="lbl">금액</span><span className="val refund-amount">{formatAmount(body.amount)}</span></div>
      <div className="refund-row"><span className="lbl">환불방식</span><span className="val">{labelOf(REFUND_METHODS, body.refundMethod)}</span></div>
      <div className="refund-row"><span className="lbl">사유</span><span className="val">{body.reason || "-"}</span></div>
      {body.agreement && <div className="refund-row"><span className="lbl">합의</span><span className="val">{body.agreement}</span></div>}
      {body.taxInvoice && <div className="refund-row"><span className="lbl">세금계산서</span><span className="val">발행</span></div>}
      {body.depositorName && <div className="refund-row"><span className="lbl">입금자명</span><span className="val">{body.depositorName}</span></div>}
      {body.email && <div className="refund-row"><span className="lbl">이메일</span><span className="val">{body.email}</span></div>}
      {body.remarks && <div className="refund-row"><span className="lbl">비고</span><span className="val">{body.remarks}</span></div>}
    </div>
  );
}

export function ApprovalView({ docId, onBack, onOpenDoc }) {
  const [box, setBox] = useState("approve");
  const [docs, setDocs] = useState([]);
  const [forms, setForms] = useState([]);
  const [detail, setDetail] = useState(null);
  const [writing, setWriting] = useState(false);
  const [chainPreview, setChainPreview] = useState(null);
  const [form, setForm] = useState({ formId: "", title: "", body: "", approvalChain: "team_leader", submit: false });
  const [refundForm, setRefundForm] = useState({ ...EMPTY_REFUND_FORM });
  const [rejectComment, setRejectComment] = useState("");

  const selectedForm = forms.find((f) => f.id === form.formId);

  const load = () => api.erpApprovalDocs(box).then(setDocs).catch(notifyError);
  useEffect(() => { load(); }, [box]);
  useEffect(() => { api.erpApprovalForms().then(setForms).catch(() => {}); }, []);
  useEffect(() => {
    if (docId) api.erpApprovalDoc(docId).then(setDetail).catch(notifyError);
  }, [docId]);

  useEffect(() => {
    if (!form.formId || !selectedForm) { setChainPreview(null); return; }
    const chain = selectedForm.code === "general" ? form.approvalChain : undefined;
    api.erpPreviewApprovalChain(selectedForm.code, chain).then(setChainPreview).catch(() => setChainPreview(null));
  }, [form.formId, form.approvalChain, selectedForm?.code]);

  const saveDoc = async (submit = false) => {
    if (!form.formId) return notifyError(new Error("양식을 선택하세요"));
    const isRefund = selectedForm?.code === "refund";

    if (isRefund) {
      if (!refundForm.clientName?.trim()) return notifyError(new Error("고객사명을 입력하세요"));
      if (!refundForm.paymentDate) return notifyError(new Error("결제일을 입력하세요"));
      if (!refundForm.amount || Number(refundForm.amount) <= 0) return notifyError(new Error("금액을 입력하세요"));
      if (!refundForm.reason?.trim()) return notifyError(new Error("환불 사유를 입력하세요"));
    } else if (!form.title?.trim()) {
      return notifyError(new Error("제목을 입력하세요"));
    }

    const title = isRefund
      ? `${refundForm.clientName.trim()} 환불요청`
      : form.title;
    const body = isRefund
      ? {
          ...refundForm,
          amount: Number(refundForm.amount),
          requestDate: new Date().toISOString(),
        }
      : { content: form.body };

    try {
      await api.erpSaveApprovalDoc({
        formId: form.formId,
        title,
        body,
        approvalChain: selectedForm?.code === "general" ? form.approvalChain : undefined,
        submit,
      });
      toastSuccess(submit ? "상신했습니다" : "저장했습니다");
      setWriting(false);
      setForm({ formId: "", title: "", body: "", approvalChain: "team_leader", submit: false });
      setRefundForm({ ...EMPTY_REFUND_FORM });
      load();
    } catch (e) { notifyError(e); }
  };

  const act = async (action) => {
    try {
      if (action === "approve") await api.erpApproveDoc(detail.id);
      else await api.erpRejectDoc(detail.id, rejectComment);
      toastSuccess(action === "approve" ? "승인했습니다" : "반려했습니다");
      setDetail(null);
      onBack?.();
      load();
    } catch (e) { notifyError(e); }
  };

  const stepLabel = (s) => {
    if (s.approverRole === "경영지원") return `${s.stepOrder}. 경영지원 (담당자 확인)`;
    if (s.approverRole === "COO_OR_CEO") return `${s.stepOrder}. COO 또는 CEO`;
    return `${s.stepOrder}. ${s.approverRole || "결재"}${s.approver?.name ? ` (${s.approver.name})` : ""}`;
  };

  if (writing) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => setWriting(false)}>{I.back({})}</button>
        <strong>기안 작성</strong>
      </div>
      <div className="field">
        <label>문서 양식 [필수]</label>
        <select value={form.formId} onChange={(e) => setForm((f) => ({ ...f, formId: e.target.value }))}>
          <option value="">선택</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      {selectedForm && (
        <div className="approval-chain-hint">
          <strong>결재선:</strong> {FORM_CHAIN_HINT[selectedForm.code] || "자동 설정"}
        </div>
      )}
      {selectedForm?.code === "general" && (
        <div className="field">
          <label>결재 단계 [필수]</label>
          <select value={form.approvalChain} onChange={(e) => setForm((f) => ({ ...f, approvalChain: e.target.value }))}>
            {APPROVAL_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}
      {chainPreview?.steps?.length > 0 && (
        <div className="approval-step-line">
          {chainPreview.steps.map((s, i) => (
            <div key={i} className="approval-step-item">{s.label}</div>
          ))}
        </div>
      )}
      {selectedForm?.code === "refund" ? (
        <>
          <div className="field">
            <label>고객사명 [필수]</label>
            <input value={refundForm.clientName} onChange={(e) => setRefundForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="예: 플로우짐 헬스&PT 하남미사점" />
          </div>
          <div className="field">
            <label>환불 종류 [필수]</label>
            <select value={refundForm.refundType} onChange={(e) => setRefundForm((f) => ({ ...f, refundType: e.target.value }))}>
              {REFUND_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>결제일 [필수]</label>
            <input type="date" value={refundForm.paymentDate} onChange={(e) => setRefundForm((f) => ({ ...f, paymentDate: e.target.value }))} />
          </div>
          <div className="field">
            <label>결제시각</label>
            <input type="datetime-local" value={refundForm.paymentTime} onChange={(e) => setRefundForm((f) => ({ ...f, paymentTime: e.target.value }))} />
          </div>
          <div className="field">
            <label>결제방식 [필수]</label>
            <select value={refundForm.paymentMethod} onChange={(e) => setRefundForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
              {PAYMENT_METHODS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>카드/계좌정보</label>
            <input value={refundForm.cardAccountInfo} onChange={(e) => setRefundForm((f) => ({ ...f, cardAccountInfo: e.target.value }))} placeholder="예: 하나 5531" />
          </div>
          <div className="field">
            <label>금액 [필수]</label>
            <input type="number" min="1" value={refundForm.amount} onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))} placeholder="131132" />
          </div>
          <div className="field">
            <label>환불방식 [필수]</label>
            <select value={refundForm.refundMethod} onChange={(e) => setRefundForm((f) => ({ ...f, refundMethod: e.target.value }))}>
              {REFUND_METHODS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>사유 [필수]</label>
            <textarea value={refundForm.reason} onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))} rows={3} placeholder="폐업으로 인한 남은 기간 일할 환불" />
          </div>
          <div className="field">
            <label>합의자</label>
            <input value={refundForm.agreement} onChange={(e) => setRefundForm((f) => ({ ...f, agreement: e.target.value }))} placeholder="홍길동, 김철수 (쉼표 구분)" />
          </div>
          <div className="field">
            <label>입금자명</label>
            <input value={refundForm.depositorName} onChange={(e) => setRefundForm((f) => ({ ...f, depositorName: e.target.value }))} />
          </div>
          <div className="field">
            <label>이메일</label>
            <input type="email" value={refundForm.email} onChange={(e) => setRefundForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <label className="row" style={{ gap: 8, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={refundForm.taxInvoice} onChange={(e) => setRefundForm((f) => ({ ...f, taxInvoice: e.target.checked }))} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>세금계산서 발행</span>
          </label>
          <div className="field">
            <label>비고</label>
            <textarea value={refundForm.remarks} onChange={(e) => setRefundForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>제목 [필수]</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={selectedForm ? `${selectedForm.name} 제목` : ""} />
          </div>
          <div className="field">
            <label>본문 [필수]</label>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={6} />
          </div>
        </>
      )}
      <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={() => saveDoc(false)}>임시저장</button>
      <button className="btn btn-accent" style={{ width: "100%" }} onClick={() => saveDoc(true)}>상신</button>
    </div>
  );

  if (detail) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => { setDetail(null); onBack?.(); }}>{I.back({})}</button>
        <strong>문서 상세</strong>
      </div>
      <div className="card">
        <div className="small">{detail.docNo}</div>
        <div className="h-title" style={{ fontSize: 18 }}>{detail.title}</div>
        <div className="small" style={{ marginTop: 8 }}>
          {detail.author?.name} · {detail.form?.name} · <StatusPill status={detail.status} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>결재 진행</div>
        {detail.steps?.map((s) => (
          <div key={s.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span>{stepLabel(s)}</span>
            <StatusPill status={s.status} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        {detail.form?.code === "refund" && !detail.body?.content ? (
          <RefundDetail body={detail.body} />
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14 }}>
            {typeof detail.body === "string"
              ? detail.body
              : detail.body?.content || JSON.stringify(detail.body, null, 2)}
          </pre>
        )}
      </div>
      {detail.status === "in_progress" && detail.canApprove && (
        <div style={{ marginTop: 16 }}>
          <div className="field">
            <label>의견 (반려 시 필수)</label>
            <textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => act("approve")}>승인</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => act("reject")}>반려</button>
          </div>
        </div>
      )}
      {detail.status === "in_progress" && !detail.canApprove && (
        <div className="small" style={{ marginTop: 12, textAlign: "center", color: "var(--muted)" }}>현재 결재 대기 중입니다</div>
      )}
    </div>
  );

  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="h-eyebrow">M1</div>
          <div className="h-title">전자결재</div>
        </div>
        <button type="button" className="btn btn-accent btn-sm approval-draft-btn" onClick={() => setWriting(true)}>
          <span className="approval-draft-icon">+</span>
          <span>기안</span>
        </button>
      </div>
      <div className="kbh-cats" style={{ marginTop: 14 }}>
        {APPROVAL_BOXES.map((b) => (
          <button key={b.id} type="button" className={"kbh-cat" + (box === b.id ? " on" : "")} onClick={() => setBox(b.id)}>{b.label}</button>
        ))}
      </div>
      {docs.length === 0 ? <div className="small" style={{ textAlign: "center", padding: 40 }}>문서가 없습니다</div>
        : docs.map((d) => (
          <div key={d.id} className="list-item" onClick={() => { setDetail(d); onOpenDoc?.(d.id); api.erpApprovalDoc(d.id).then(setDetail); }}>
            <div style={{ flex: 1 }}>
              <div className="ttl">{d.title}</div>
              <div className="meta">{d.docNo} · {d.form?.name} · {d.author?.name}</div>
            </div>
            <StatusPill status={d.status} />
          </div>
        ))}
    </div>
  );
}

function leaveTypeMeta(id) {
  return LEAVE_TYPES.find((t) => t.id === id) || { label: id, color: "#E0E0E0" };
}

function fmtDays(n) {
  if (n == null) return "-";
  return Number.isInteger(n) ? `${n}` : `${n}`;
}

function LeaveCalendar({ year, month, onPrev, onNext }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api.erpLeaveCalendar(year, month).then((r) => setEvents(r.events || [])).catch(notifyError);
  }, [year, month]);

  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const startPad = first.getDay();
  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  const byDate = events.reduce((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push({ off: true, key: `pad-${i}` });
  for (let d = 1; d <= lastDay; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key, events: byDate[key] || [], today: key === todayKey });
  }

  return (
    <div>
      <div className="leave-cal-nav">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPrev}>‹</button>
        <strong>{year}년 {month}월</strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onNext}>›</button>
      </div>
      <div className="leave-cal-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d} className="leave-cal-hd">{d}</div>)}
        {cells.map((c) => (
          <div key={c.key} className={"leave-cal-cell" + (c.off ? " off" : "")}>
            {c.day && <div className={"leave-cal-daynum" + (c.today ? " today" : "")}>{c.day}</div>}
            {c.events?.map((e, i) => (
              <div key={i} className="leave-chip" style={{ background: e.color, color: "#333" }} title={`${e.userName} · ${e.label}`}>
                {e.userName?.split(" ")[0]} {e.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeaveView({ isAdmin }) {
  const [tab, setTab] = useState("mine");
  const [year, setYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [form, setForm] = useState({ leaveType: "annual", startDate: "", endDate: "", reason: "" });
  const [rewardForm, setRewardForm] = useState({ title: "", grantType: "paid", days: "1", userIds: [], remarks: "" });

  const selectedType = leaveTypeMeta(form.leaveType);
  const singleDay = selectedType.singleDay;

  const loadMine = () => {
    api.erpLeaveBalance(year).then(setBalance).catch(notifyError);
    api.erpLeaveRequests().then(setRequests).catch(notifyError);
  };

  const loadAdmin = () => {
    if (!isAdmin) return;
    api.erpLeaveStatus(year).then(setStatus).catch(notifyError);
    api.erpLeaveRewards(year).then(setRewards).catch(notifyError);
    api.erpEmployees().then((emps) => setEmployees(emps.filter((e) => e.userId && e.status === "active"))).catch(() => {});
  };

  useEffect(() => { loadMine(); }, [year]);
  useEffect(() => { loadAdmin(); }, [year, isAdmin]);

  const submit = async () => {
    try {
      const payload = { ...form, submit: true };
      if (singleDay) {
        payload.endDate = form.startDate;
        if (!form.startDate) return notifyError(new Error("날짜를 선택하세요"));
      } else if (!form.startDate || !form.endDate) {
        return notifyError(new Error("기간을 선택하세요"));
      }
      await api.erpSaveLeaveRequest(payload);
      toastSuccess("휴가를 신청했습니다");
      setShowForm(false);
      setForm({ leaveType: "annual", startDate: "", endDate: "", reason: "" });
      loadMine();
    } catch (e) { notifyError(e); }
  };

  const grantReward = async () => {
    try {
      if (!rewardForm.title.trim()) return notifyError(new Error("제목을 입력하세요"));
      if (!rewardForm.userIds.length) return notifyError(new Error("대상자를 선택하세요"));
      await api.erpGrantLeaveReward({ ...rewardForm, days: Number(rewardForm.days), year });
      toastSuccess("포상 휴가를 지급했습니다");
      setShowRewardForm(false);
      setRewardForm({ title: "", grantType: "paid", days: "1", userIds: [], remarks: "" });
      loadAdmin();
      loadMine();
    } catch (e) { notifyError(e); }
  };

  const toggleRewardUser = (uid) => {
    setRewardForm((f) => ({
      ...f,
      userIds: f.userIds.includes(uid) ? f.userIds.filter((id) => id !== uid) : [...f.userIds, uid],
    }));
  };

  const shiftMonth = (delta) => {
    let m = calMonth + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalMonth(m);
    setYear(y);
  };

  if (showForm) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => setShowForm(false)}>{I.back({})}</button>
        <strong>휴가 신청</strong>
      </div>
      <div className="leave-policy">
        {LEAVE_POLICY.map((line, i) => <div key={i}>· {line}</div>)}
      </div>
      <div className="field">
        <label>휴가 종류 [필수]</label>
        <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}>
          {LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {selectedType.hint && <div className="small" style={{ marginTop: 6 }}>{selectedType.hint}</div>}
        {selectedType.advance && <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>{selectedType.advance}</div>}
      </div>
      <div className="field">
        <label>{singleDay ? "날짜 [필수]" : "시작일 [필수]"}</label>
        <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
      </div>
      {!singleDay && (
        <div className="field">
          <label>종료일 [필수]</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
      )}
      <div className="field">
        <label>사유</label>
        <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
      </div>
      <div className="small" style={{ marginBottom: 12 }}>
        잔여: {balance?.remaining ?? 0}일
        {selectedType.noDeduct ? " (차감 없음)" : selectedType.days ? ` · 신청 시 ${selectedType.days}일 차감` : ""}
      </div>
      <button className="btn btn-accent" style={{ width: "100%" }} onClick={submit}>신청(팀장 결재)</button>
    </div>
  );

  if (showRewardForm && isAdmin) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => setShowRewardForm(false)}>{I.back({})}</button>
        <strong>포상 휴가 지급</strong>
      </div>
      <div className="field">
        <label>제목 [필수]</label>
        <input value={rewardForm.title} onChange={(e) => setRewardForm((f) => ({ ...f, title: e.target.value }))} placeholder="2026 SPOEX 주말근무 보상연차" />
      </div>
      <div className="field">
        <label>종류</label>
        <select value={rewardForm.grantType} onChange={(e) => setRewardForm((f) => ({ ...f, grantType: e.target.value }))}>
          <option value="paid">유급</option>
          <option value="half">반차</option>
        </select>
      </div>
      <div className="field">
        <label>일수 [필수]</label>
        <input type="number" step="0.5" min="0.5" value={rewardForm.days} onChange={(e) => setRewardForm((f) => ({ ...f, days: e.target.value }))} />
      </div>
      <div className="field">
        <label>대상자 [필수]</label>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", maxHeight: 200, overflow: "auto" }}>
          {employees.map((e) => (
            <button
              key={e.userId}
              type="button"
              className={"kbh-cat" + (rewardForm.userIds.includes(e.userId) ? " on" : "")}
              style={{ padding: "4px 8px", fontSize: 11 }}
              onClick={() => toggleRewardUser(e.userId)}
            >
              {e.name}
            </button>
          ))}
        </div>
        <div className="small" style={{ marginTop: 6 }}>{rewardForm.userIds.length}명 선택</div>
      </div>
      <div className="field">
        <label>비고</label>
        <textarea value={rewardForm.remarks} onChange={(e) => setRewardForm((f) => ({ ...f, remarks: e.target.value }))} />
      </div>
      <button className="btn btn-accent" style={{ width: "100%" }} onClick={grantReward}>지급</button>
    </div>
  );

  const tabs = [
    ["mine", "내 연차"],
    ["calendar", "연차 달력"],
    ...(isAdmin ? [["status", "팀 현황"], ["rewards", "포상 휴가"]] : []),
  ];

  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="row between">
        <div>
          <div className="h-eyebrow">M2</div>
          <div className="h-title">{year} 연차 관리</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {isAdmin && tab === "rewards" && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRewardForm(true)}>포상 지급</button>
          )}
          <button className="btn btn-accent btn-sm" onClick={() => setShowForm(true)}>휴가 신청</button>
        </div>
      </div>

      <div className="leave-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={"kbh-cat" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "mine" && (
        <>
          <div className="widget-grid" style={{ marginTop: 4 }}>
            <div className="card"><div className="small">발생</div><div className="num" style={{ fontSize: 22 }}>{fmtDays(balance?.accrued)}일</div></div>
            <div className="card"><div className="small">포상</div><div className="num" style={{ fontSize: 22 }}>{fmtDays(balance?.reward)}일</div></div>
            <div className="card"><div className="small">사용</div><div className="num" style={{ fontSize: 22 }}>{fmtDays(balance?.used)}일</div></div>
            <div className="card"><div className="small">잔여</div><div className="num" style={{ fontSize: 22, color: "var(--accent-deep)" }}>{fmtDays(balance?.remaining)}일</div></div>
          </div>
          {balance?.remarks && <div className="small" style={{ marginTop: 10 }}>비고: {balance.remarks}</div>}
          <div className="h-title" style={{ fontSize: 17, marginTop: 20 }}>신청 내역</div>
          {requests.map((r) => {
            const meta = leaveTypeMeta(r.leaveType);
            return (
              <div key={r.id} className="list-item">
                <div>
                  <div className="ttl">
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: meta.color, marginRight: 6 }} />
                    {meta.label}{r.days > 0 ? ` · ${r.days}일` : ""}
                  </div>
                  <div className="meta">
                    {new Date(r.startDate).toLocaleDateString("ko-KR")}
                    {r.startDate !== r.endDate ? ` ~ ${new Date(r.endDate).toLocaleDateString("ko-KR")}` : ""}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            );
          })}
          {!requests.length && <div className="small" style={{ textAlign: "center", padding: 30 }}>신청 내역이 없습니다</div>}
        </>
      )}

      {tab === "calendar" && (
        <LeaveCalendar year={year} month={calMonth} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
      )}

      {tab === "status" && isAdmin && status && (
        <div style={{ marginTop: 8 }}>
          {Object.entries(status.grouped || {}).map(([dept, rows]) => (
            <div key={dept}>
              <div className="leave-dept-hd">{dept}</div>
              <table className="leave-status-table">
                <thead>
                  <tr><th>이름</th><th>발생</th><th>포상</th><th>사용</th><th>잔여</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.name}</td>
                      <td>{fmtDays(r.accrued)}</td>
                      <td>{fmtDays(r.reward)}</td>
                      <td>{fmtDays(r.used)}</td>
                      <td style={{ fontWeight: 700 }}>{fmtDays(r.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.some((r) => r.remarks) && (
                <div className="small" style={{ marginTop: 6, marginBottom: 12 }}>
                  {rows.filter((r) => r.remarks).map((r) => (
                    <div key={r.userId}>{r.name}: {r.remarks}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "rewards" && isAdmin && (
        <div style={{ marginTop: 8 }}>
          {rewards.map((g) => (
            <div key={g.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div className="ttl">{g.title}</div>
              <div className="meta">
                {new Date(g.createdAt).toLocaleDateString("ko-KR")} · {g.grantType === "half" ? "반차" : "유급"} · {g.days}일 · {g.userIds?.length || 0}명
              </div>
              {g.remarks && <div className="small">{g.remarks}</div>}
            </div>
          ))}
          {!rewards.length && <div className="small" style={{ textAlign: "center", padding: 30 }}>포상 휴가 지급 내역이 없습니다</div>}
        </div>
      )}
    </div>
  );
}

export function NotificationsView() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.erpNotifications().then(setItems).catch(notifyError); }, []);
  const markAll = async () => {
    await api.erpReadAllNotifications();
    setItems((p) => p.map((n) => ({ ...n, read: true })));
  };
  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="row between">
        <div><div className="h-eyebrow">알림</div><div className="h-title">알림 센터</div></div>
        <button className="btn btn-ghost btn-sm" onClick={markAll}>전체 읽음</button>
      </div>
      {items.map((n) => (
        <div key={n.id} className="list-item" style={{ opacity: n.read ? 0.6 : 1 }}>
          <div>
            <div className="ttl">{n.title}</div>
            <div className="meta">{n.module} · {new Date(n.createdAt).toLocaleString("ko-KR")}</div>
            {n.body && <div className="small" style={{ marginTop: 4 }}>{n.body}</div>}
          </div>
        </div>
      ))}
      {!items.length && <div className="small" style={{ textAlign: "center", padding: 40 }}>알림이 없습니다</div>}
    </div>
  );
}

export function ProfileView({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState("");
  useEffect(() => {
    api.erpProfile().then((p) => { setProfile(p); setPhone(p.employee?.phone || ""); }).catch(notifyError);
  }, []);
  const save = async () => {
    try {
      await api.erpUpdateProfile({ phone });
      toastSuccess("저장했습니다");
    } catch (e) { notifyError(e); }
  };
  if (!profile) return <div className="spinner" />;
  const emp = profile.employee;
  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="h-eyebrow">마이페이지</div>
      <div className="h-title">{user?.name}</div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="small">사번</div><div style={{ fontWeight: 700 }}>{emp?.employeeNo || "-"}</div>
        <div className="small" style={{ marginTop: 12 }}>소속</div><div style={{ fontWeight: 700 }}>{emp?.department?.name || "미배치"}</div>
        <div className="small" style={{ marginTop: 12 }}>직급/직책</div><div style={{ fontWeight: 700 }}>{emp?.jobRank || "-"} / {emp?.jobTitle || "-"}</div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>연락처</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <button className="btn btn-accent" style={{ width: "100%", marginBottom: 8 }} onClick={save}>저장</button>
      <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onLogout}>로그아웃</button>
    </div>
  );
}

export function AdminView() {
  const [depts, setDepts] = useState([]);
  const [emps, setEmps] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [deptName, setDeptName] = useState("");
  const [tab, setTab] = useState("employees");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [issuedPw, setIssuedPw] = useState(null);
  const [filter, setFilter] = useState("all");
  const emptyForm = {
    name: "", email: "", employeeNo: "", departmentId: "", jobTitle: "", jobRank: "사원",
    phone: "", roles: [], status: "active", issueAccount: true, password: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    api.erpDepartments().then(setDepts).catch(notifyError);
    api.erpEmployees().then(setEmps).catch(notifyError);
    api.erpRanks().then(setRanks).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const addDept = async () => {
    if (!deptName.trim()) return;
    await api.erpCreateDepartment({ name: deptName });
    setDeptName("");
    load();
    toastSuccess("부서를 추가했습니다");
  };

  const saveEmployee = async () => {
    try {
      const res = await api.erpCreateEmployee({
        name: form.name,
        email: form.email,
        employeeNo: form.employeeNo || undefined,
        departmentId: form.departmentId || undefined,
        jobTitle: form.jobTitle || undefined,
        jobRank: form.jobRank,
        phone: form.phone || undefined,
        roles: form.roles,
        status: form.status,
        issueAccount: form.issueAccount,
        password: form.password || undefined,
      });
      if (res.tempPassword) setIssuedPw({ name: form.name, email: form.email, password: res.tempPassword });
      toastSuccess(form.issueAccount ? "직원 등록 및 계정 발부 완료" : "직원 등록 완료");
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e) { notifyError(e); }
  };

  const parseBulk = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(/[\t,]/).map((p) => p.trim());
      return {
        name: parts[0],
        email: parts[1],
        employeeNo: parts[2] || undefined,
        jobRank: parts[3] || "사원",
      };
    });
  };

  const saveBulk = async () => {
    try {
      const employees = parseBulk();
      if (!employees.length) return notifyError(new Error("한 줄 이상 입력하세요"));
      const res = await api.erpBulkEmployees(employees);
      toastSuccess(`${res.created?.length || 0}명 등록 (${res.errors?.length || 0}건 실패)`);
      setShowBulk(false);
      setBulkText("");
      load();
    } catch (e) { notifyError(e); }
  };

  const issueAccount = async (emp) => {
    try {
      const res = await api.erpIssueAccount(emp.id);
      setIssuedPw({ name: emp.name, email: emp.email, password: res.tempPassword });
      toastSuccess("계정을 발부했습니다");
      load();
    } catch (e) { notifyError(e); }
  };

  const resetPassword = async (emp) => {
    try {
      const res = await api.erpResetPassword(emp.id);
      setIssuedPw({ name: emp.name, email: emp.email, password: res.tempPassword });
      toastSuccess("비밀번호를 재설정했습니다");
    } catch (e) { notifyError(e); }
  };

  const setStatus = async (emp, status) => {
    try {
      await api.erpUpdateEmployee(emp.id, { status });
      toastSuccess(status === "resigned" ? "퇴사 처리했습니다" : "상태를 변경했습니다");
      load();
    } catch (e) { notifyError(e); }
  };

  const toggleRole = async (emp, role) => {
    const roles = emp.roles?.includes(role)
      ? emp.roles.filter((r) => r !== role)
      : [...(emp.roles || []), role];
    try {
      await api.erpUpdateEmployee(emp.id, { roles });
      toastSuccess("역할을 변경했습니다");
      load();
    } catch (e) { notifyError(e); }
  };

  const toggleFormRole = (role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

  const filtered = emps.filter((e) => filter === "all" || e.status === filter);
  const STATUS = { active: "재직", leave: "휴직", resigned: "퇴사" };

  if (showForm) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => setShowForm(false)}>{I.back({})}</button>
        <strong>직원 등록</strong>
      </div>
      <div className="field"><label>이름 [필수]</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
      <div className="field"><label>이메일 [필수]</label><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="로그인 ID" /></div>
      <div className="field"><label>사번</label><input value={form.employeeNo} onChange={(e) => setForm((f) => ({ ...f, employeeNo: e.target.value }))} /></div>
      <div className="field">
        <label>소속 부서</label>
        <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
          <option value="">미배치</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>직급</label>
        <select value={form.jobRank} onChange={(e) => setForm((f) => ({ ...f, jobRank: e.target.value }))}>
          {(ranks.length ? ranks : [{ name: "사원" }, { name: "대리" }, { name: "과장" }, { name: "부장" }]).map((r) => (
            <option key={r.id || r.name} value={r.name}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="field"><label>직책</label><input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="팀장, 본부장 등" /></div>
      <div className="field"><label>연락처</label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
      <div className="field">
        <label>결재 역할</label>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {EMPLOYEE_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={"kbh-cat" + (form.roles.includes(role) ? " on" : "")}
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => toggleFormRole(role)}
            >
              {role}
            </button>
          ))}
        </div>
        <div className="small" style={{ marginTop: 6 }}>팀장·COO·CEO·경영지원 역할을 지정해야 결재선이 동작합니다</div>
      </div>
      <label className="row" style={{ gap: 8, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.issueAccount} onChange={(e) => setForm((f) => ({ ...f, issueAccount: e.target.checked }))} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>등록과 함께 계정 발부</span>
      </label>
      {form.issueAccount && (
        <div className="field">
          <label>초기 비밀번호 (비우면 자동 생성)</label>
          <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="6자 이상" />
        </div>
      )}
      <button className="btn btn-accent" style={{ width: "100%" }} onClick={saveEmployee}>등록</button>
    </div>
  );

  if (showBulk) return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
        <button onClick={() => setShowBulk(false)}>{I.back({})}</button>
        <strong>일괄 등록</strong>
      </div>
      <div className="small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
        한 줄에 한 명 · <code>이름, 이메일, 사번, 직급</code> (탭 또는 쉼표 구분)<br />
        계정은 나중에 개별 발부할 수 있습니다.
      </div>
      <div className="field">
        <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10}
          placeholder={"홍길동, hong@company.com, E001, 사원\n김영희, kim@company.com, E002, 대리"} />
      </div>
      <button className="btn btn-accent" style={{ width: "100%" }} onClick={saveBulk}>일괄 등록</button>
    </div>
  );

  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="row between">
        <div>
          <div className="h-eyebrow">관리자</div>
          <div className="h-title">구성원 관리</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(true)}>일괄</button>
          <button className="btn btn-accent btn-sm" onClick={() => setShowForm(true)}>{I.plus({ width: 14, height: 14 })} 등록</button>
        </div>
      </div>

      {issuedPw && (
        <div className="card" style={{ marginTop: 14, background: "#FFF8E1", borderColor: "#FFE082" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>계정 정보 (한 번만 표시)</div>
          <div className="small">이름: <strong>{issuedPw.name}</strong></div>
          <div className="small">이메일: <strong>{issuedPw.email}</strong></div>
          <div className="small">임시 비밀번호: <strong style={{ fontSize: 16, color: "var(--accent-deep)" }}>{issuedPw.password}</strong></div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setIssuedPw(null)}>확인</button>
        </div>
      )}

      <div className="seg" style={{ marginTop: 16, marginBottom: 8 }}>
        <button type="button" className={tab === "employees" ? "on" : ""} onClick={() => setTab("employees")}>구성원</button>
        <button type="button" className={tab === "depts" ? "on" : ""} onClick={() => setTab("depts")}>조직</button>
      </div>

      {tab === "depts" ? (
        <>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <input style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 12, padding: 10 }} value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="부서명" />
              <button className="btn btn-accent btn-sm" onClick={addDept}>추가</button>
            </div>
          </div>
          {depts.map((d) => <div key={d.id} className="list-item"><div className="ttl">{d.name}</div></div>)}
        </>
      ) : (
        <>
          <div className="kbh-cats">
            {[["all", "전체"], ["active", "재직"], ["leave", "휴직"], ["resigned", "퇴사"]].map(([id, label]) => (
              <button key={id} type="button" className={"kbh-cat" + (filter === id ? " on" : "")} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          {filtered.map((e) => (
            <div key={e.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              <div className="row between">
                <div>
                  <div className="ttl">{e.name}</div>
                  <div className="meta">
                    {e.employeeNo || "사번없음"} · {e.department?.name || "미배치"} · {e.jobRank}
                    {e.jobTitle ? ` · ${e.jobTitle}` : ""}
                  </div>
                  <div className="meta">{e.email}</div>
                  {e.roles?.length > 0 && (
                    <div className="meta" style={{ marginTop: 4 }}>역할: {e.roles.join(", ")}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <span className={`status-pill ${e.status === "active" ? "done" : e.status === "resigned" ? "reject" : "wait"}`}>
                    {STATUS[e.status] || e.status}
                  </span>
                  <span className="small">{e.hasAccount ? "계정 있음" : "계정 없음"}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {EMPLOYEE_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={"kbh-cat" + (e.roles?.includes(role) ? " on" : "")}
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => toggleRole(e, role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {!e.hasAccount && e.status !== "resigned" && (
                  <button className="btn btn-accent btn-sm" onClick={() => issueAccount(e)}>계정 발부</button>
                )}
                {e.hasAccount && (
                  <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(e)}>비밀번호 재설정</button>
                )}
                {e.status !== "resigned" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(e, "resigned")}>퇴사 처리</button>
                )}
              </div>
            </div>
          ))}
          {!filtered.length && <div className="small" style={{ textAlign: "center", padding: 40 }}>등록된 직원이 없습니다</div>}
        </>
      )}
    </div>
  );
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_MEETING_FORM = { id: null, title: "", startsAt: "", place: "", agenda: "", discussion: "", decisions: "" };

export function MeetingNotesView() {
  const [notes, setNotes] = useState([]);
  const [mode, setMode] = useState("list"); // list | view | edit
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_MEETING_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => api.erpMeetingNotes().then(setNotes).catch(notifyError);
  useEffect(() => { load(); }, []);

  const openView = (note) => {
    setSelected(note);
    setMode("view");
  };

  const openCreate = () => {
    setSelected(null);
    setForm({ ...EMPTY_MEETING_FORM });
    setMode("edit");
  };

  const openEdit = (note) => {
    const n = note || selected;
    if (!n) return;
    setSelected(n);
    setForm({
      id: n.id,
      title: n.title || "",
      startsAt: toDatetimeLocalValue(n.startsAt),
      place: n.place || "",
      agenda: n.agenda || "",
      discussion: n.discussion || "",
      decisions: n.decisions || "",
    });
    setMode("edit");
  };

  const backToList = () => {
    setMode("list");
    setSelected(null);
    setForm(EMPTY_MEETING_FORM);
  };

  const save = async () => {
    if (!form.title.trim() || !form.startsAt || !form.agenda.trim()) {
      notifyError(new Error("제목, 일시, 안건은 필수입니다"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        place: form.place.trim() || null,
        agenda: form.agenda,
        discussion: form.discussion,
        decisions: form.decisions.trim() || null,
      };
      const saved = await api.erpSaveMeetingNote(payload);
      toastSuccess("저장했습니다");
      await load();
      setSelected(saved);
      setMode("view");
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected?.id) return;
    if (!window.confirm("이 회의록을 삭제할까요?")) return;
    try {
      await api.erpDeleteMeetingNote(selected.id);
      toastSuccess("삭제했습니다");
      backToList();
      load();
    } catch (e) {
      notifyError(e);
    }
  };

  if (mode === "edit") {
    return (
      <div className="fade pad" style={{ marginTop: 8, paddingBottom: 80 }}>
        <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
          <button type="button" onClick={() => (selected ? setMode("view") : backToList())}>{I.back({})}</button>
          <strong>{form.id ? "회의록 수정" : "회의록 작성"}</strong>
        </div>
        <div className="field"><label>제목</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
        <div className="field"><label>일시</label><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></div>
        <div className="field"><label>장소</label><input value={form.place} onChange={(e) => setForm((f) => ({ ...f, place: e.target.value }))} placeholder="선택" /></div>
        <div className="field"><label>안건</label><textarea value={form.agenda} rows={4} onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))} /></div>
        <div className="field"><label>논의 내용</label><textarea value={form.discussion} rows={8} onChange={(e) => setForm((f) => ({ ...f, discussion: e.target.value }))} /></div>
        <div className="field"><label>결정 사항</label><textarea value={form.decisions} rows={4} onChange={(e) => setForm((f) => ({ ...f, decisions: e.target.value }))} /></div>
        <button className="btn btn-accent" style={{ width: "100%" }} disabled={saving} onClick={save}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    );
  }

  if (mode === "view" && selected) {
    return (
      <div className="fade pad" style={{ marginTop: 8, paddingBottom: 80 }}>
        <div className="detail-bar" style={{ margin: "0 -16px 16px" }}>
          <button type="button" onClick={backToList}>{I.back({})}</button>
          <strong>회의록</strong>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)}>수정</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>삭제</button>
          </div>
        </div>
        <div className="h-title" style={{ fontSize: 22 }}>{selected.title}</div>
        <div className="meta" style={{ marginTop: 6 }}>
          {new Date(selected.startsAt).toLocaleString("ko-KR")}
          {selected.place ? ` · ${selected.place}` : ""}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="small" style={{ fontWeight: 700, color: "var(--muted)" }}>안건</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.6 }}>{selected.agenda || "-"}</div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="small" style={{ fontWeight: 700, color: "var(--muted)" }}>논의 내용</div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.6 }}>{selected.discussion || "-"}</div>
        </div>
        {(selected.decisions != null && selected.decisions !== "") && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="small" style={{ fontWeight: 700, color: "var(--muted)" }}>결정 사항</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.6 }}>{selected.decisions}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fade pad" style={{ marginTop: 8, paddingBottom: 80 }}>
      <div className="row between">
        <div><div className="h-eyebrow">M5</div><div className="h-title">회의록</div></div>
        <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>작성</button>
      </div>
      {notes.length > 0 && (
        <div className="erp-tbl-cap"><span className="cnt">회의록 {notes.length}개</span></div>
      )}
      <div className="erp-tbl-wrap">
        <table className="erp-tbl">
          <thead>
            <tr>
              <th>제목</th>
              <th className="shrink">일시</th>
              <th className="shrink">장소</th>
              <th className="shrink"></th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="clickable" onClick={() => openView(n)}>
                <td><div className="cell-ttl">{n.title}</div></td>
                <td className="shrink"><span className="cell-sub" style={{ margin: 0 }}>{new Date(n.startsAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</span></td>
                <td className="shrink">{n.place || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td className="shrink ctr">{I.chevron({})}</td>
              </tr>
            ))}
            {!notes.length && <tr><td colSpan={4} className="erp-tbl-empty">회의록이 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EventsView() {
  const [events, setEvents] = useState([]);
  useEffect(() => { api.erpCompanyEvents().then(setEvents).catch(notifyError); }, []);
  const rsvp = async (id, response) => {
    await api.erpEventRsvp(id, response);
    toastSuccess("응답했습니다");
    api.erpCompanyEvents().then(setEvents);
  };
  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="h-eyebrow">M6</div>
      <div className="h-title">회사 행사</div>
      {events.map((ev) => (
        <div key={ev.id} className="card" style={{ marginTop: 12 }}>
          <div className="ttl" style={{ fontWeight: 800 }}>{ev.title}</div>
          <div className="meta">{new Date(ev.startsAt).toLocaleString("ko-KR")} {ev.place && `· ${ev.place}`}</div>
          {ev.description && <div className="small" style={{ marginTop: 8 }}>{ev.description}</div>}
          {ev.requireRsvp && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-accent btn-sm" onClick={() => rsvp(ev.id, "attend")}>참석</button>
              <button className="btn btn-ghost btn-sm" onClick={() => rsvp(ev.id, "decline")}>불참</button>
            </div>
          )}
        </div>
      ))}
      {!events.length && <div className="small" style={{ textAlign: "center", padding: 40 }}>행사가 없습니다</div>}
    </div>
  );
}

export function OkrView() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.erpOkr().then(setItems).catch(notifyError); }, []);
  return (
    <div className="fade pad" style={{ marginTop: 8 }}>
      <div className="h-eyebrow">M7</div>
      <div className="h-title">팀별 OKR</div>
      {items.map((o) => (
        <div key={o.id} className="card" style={{ marginTop: 12 }}>
          <div className="row between">
            <div className="ttl" style={{ fontWeight: 800 }}>{o.title}</div>
            <span className="status-pill done">{Math.round(o.progress)}%</span>
          </div>
          <div className="meta">{o.quarter} · {o.owner?.name}</div>
          {o.keyResults?.map((kr) => (
            <div key={kr.id} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <div className="small" style={{ fontWeight: 700 }}>KR: {kr.title}</div>
              <div className="small">{kr.current} / {kr.target} {kr.unit}</div>
            </div>
          ))}
        </div>
      ))}
      {!items.length && <div className="small" style={{ textAlign: "center", padding: 40 }}>OKR이 없습니다</div>}
    </div>
  );
}

function formatSyncTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR");
}

function monthLabel(sheetName) {
  if (/2023\.03\s*~\s*Raw/i.test(sheetName || "")) {
    return "과거 Raw (~2025.09)";
  }
  if (/2022\.06\s*~\s*Raw/i.test(sheetName || "")) {
    return "과거 Raw (~2025.12)";
  }
  const m = String(sheetName || "").match(/^(\d{4})\.(\d{2})/);
  if (!m) return sheetName;
  return `${m[1]}년 ${Number(m[2])}월`;
}

function salesMonthTitle(m) {
  if (m.isHistorical) {
    return `${monthLabel(m.sheetName)} · 과거 데이터`;
  }
  return monthLabel(m.sheetName);
}

const SALES_JOB_KEY = "erp.sales.sync.jobIds";

function loadPersistedJobIds() {
  try {
    const raw = localStorage.getItem(SALES_JOB_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistJobIds(ids) {
  localStorage.setItem(SALES_JOB_KEY, JSON.stringify([...new Set(ids.filter(Boolean))]));
}

function SalesMonthList({ kind, months, busySheet, disabled, onSync }) {
  const syncMonths = (months || []).filter((m) => m.syncable !== false);
  if (!syncMonths.length) {
    return <div className="small" style={{ padding: "20px 0", textAlign: "center" }}>월별 시트가 없습니다</div>;
  }
  return (
    <div>
      {syncMonths.map((m) => {
        const busy = busySheet === m.sheetName;
        const last = m.lastSync;
        return (
          <div key={m.sheetName} className="list-item" style={{ alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="ttl">
                {salesMonthTitle(m)}{" "}
                <span className="small">({m.sheetName})</span>
              </div>
              <div className="meta">
                DB {m.dbCount}건
                {m.isHistorical ? " · 동기화 대상 아님 (조회 전용)" : ""}
                {m.inSheet ? "" : " · 시트 없음"}
                {last ? ` · 마지막 동기화 ${formatSyncTime(last.at)}` : ""}
              </div>
              {last?.status === "success" && (
                <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
                  덮어쓰기 완료 · 시트 {last.rowCount}건 (이전 {last.deleted}건 삭제)
                </div>
              )}
              {last?.status === "error" && (
                <div className="small" style={{ marginTop: 4, color: "var(--danger, #c62828)" }}>
                  {last.errorMessage || "동기화 실패"}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-accent btn-sm"
              disabled={disabled || !m.inSheet}
              onClick={() => onSync(m.sheetName)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 88 }}
            >
              {busy ? <span className="spinner" style={{ width: 16, height: 16 }} /> : I.sync({ width: 16, height: 16 })}
              {busy ? "진행 중" : "동기화"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SalesDataTable({ kind, sheetFilter }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = () => {
    setLoading(true);
    api.erpSalesRows({ kind, sheetName: sheetFilter || undefined, q: q || undefined, page, pageSize: 50 })
      .then(setData)
      .catch(notifyError)
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); }, [kind, sheetFilter]);
  useEffect(() => { load(); }, [kind, sheetFilter, page]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 50)));
  const columns = data?.columns || [];

  return (
    <div style={{ marginTop: 16 }}>
      <div className="sales-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색 (센터명, 연락처, 이메일 등)"
          style={{ flex: 1, minWidth: 180 }}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); load(); } }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPage(1); load(); }}>검색</button>
        <div className="small">총 {data?.total ?? 0}건</div>
      </div>

      {loading && !data ? <div className="spinner" /> : (
        <div className="sales-table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>월</th>
                <th>행</th>
                {columns.map((c) => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.sheetName}</td>
                  <td>{row.sheetRow}</td>
                  {columns.map((c) => (
                    <td key={c} title={row.data?.[c] || ""}>{row.data?.[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
              {!data?.rows?.length && (
                <tr>
                  <td colSpan={Math.max(2, columns.length + 2)} style={{ textAlign: "center", padding: 24 }}>
                    데이터가 없습니다. 위에서 동기화를 실행해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="row between" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button>
        <div className="small">{page} / {totalPages}</div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>다음</button>
      </div>
    </div>
  );
}

export function SalesSyncView() {
  const [tab, setTab] = useState("inquiry");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [sheetFilter, setSheetFilter] = useState("");
  const [showData, setShowData] = useState(false);

  const loadStatus = () => {
    setLoading(true);
    api.erpSalesSyncStatus()
      .then((s) => {
        setStatus(s);
        const active = s.activeJobs || [];
        setJobs((prev) => {
          const map = new Map(prev.map((j) => [j.id, j]));
          for (const j of active) map.set(j.id, j);
          return [...map.values()];
        });
      })
      .catch(notifyError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
    const ids = loadPersistedJobIds();
    if (ids.length) {
      Promise.all(ids.map((id) => api.erpSalesJob(id).catch(() => null))).then((list) => {
        const valid = list.filter(Boolean);
        setJobs((prev) => {
          const map = new Map(prev.map((j) => [j.id, j]));
          for (const j of valid) map.set(j.id, j);
          return [...map.values()];
        });
        persistJobIds(valid.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id));
      });
    }
  }, []);

  useEffect(() => {
    const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
    persistJobIds(active.map((j) => j.id));
    if (!active.length) return undefined;
    const timer = setInterval(async () => {
      const list = await Promise.all(active.map((j) => api.erpSalesJob(j.id).catch(() => null)));
      setJobs((prev) => {
        const map = new Map(prev.map((x) => [x.id, x]));
        for (const j of list) {
          if (!j) continue;
          const prevJ = map.get(j.id);
          map.set(j.id, j);
          if (prevJ && (prevJ.status === "queued" || prevJ.status === "running") && (j.status === "success" || j.status === "error")) {
            if (j.status === "success") {
              const n = j.progress?.results?.length || 0;
              toastSuccess(`${j.kind === "inquiry" ? "문의" : "결제"} 동기화 완료 (${n}개월)`);
            } else {
              notifyError(new Error(j.errorMessage || "동기화 실패"));
            }
            loadStatus();
          }
        }
        return [...map.values()];
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs.map((j) => `${j.id}:${j.status}:${j.progress?.completedSheets || 0}`).join("|")]);

  const activeForTab = jobs.find((j) => j.kind === tab && (j.status === "queued" || j.status === "running"));
  const months = tab === "inquiry" ? status?.inquiry?.months : status?.order?.months;
  const syncBusy = !!activeForTab;
  const busySheet =
    activeForTab?.mode === "all"
      ? activeForTab?.progress?.currentSheet
      : activeForTab?.sheetName;

  const trackJob = (job) => {
    if (!job?.id) return;
    setJobs((prev) => {
      const map = new Map(prev.map((j) => [j.id, j]));
      map.set(job.id, job);
      return [...map.values()];
    });
    persistJobIds([...loadPersistedJobIds(), job.id]);
    toastSuccess("백그라운드 동기화를 시작했습니다. 다른 화면으로 이동해도 계속됩니다.");
  };

  const handleSyncMonth = async (sheetName) => {
    try {
      const res = await api.erpSalesSync(tab, sheetName, { mode: "one", background: true });
      trackJob(res.job || res);
    } catch (e) {
      if (e?.data?.job) trackJob(e.data.job);
      notifyError(e);
    }
  };

  const handleSyncAll = async () => {
    try {
      const res = await api.erpSalesSyncAll(tab);
      trackJob(res.job || res);
    } catch (e) {
      if (e?.data?.job) trackJob(e.data.job);
      notifyError(e);
    }
  };

  if (loading && !status) return <div className="spinner" />;

  return (
    <div className="fade pad" style={{ marginTop: 8, paddingBottom: 80, maxWidth: 1100 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">세일즈 동기화</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        Google Sheets <strong>YYYY.MM.</strong> 월별 시트를 동기화합니다.
        동기화 시 <strong>해당 월 DB를 비운 뒤</strong> 시트 내용으로 다시 넣습니다.
        {tab === "inquiry" && (
          <>
            {" "}
            2025.09. 이전 과거 문의는 DB에 1회 반영되어 있으며, <strong>데이터 보기</strong>에서만 확인할 수 있습니다.
          </>
        )}
        {tab === "order" && (
          <>
            {" "}
            결제 주문은 <strong>2026.01.</strong>부터 월별 동기화합니다. 2025.12. 이전 과거 데이터는 DB에 1회 반영되어 있으며, <strong>데이터 보기</strong>에서만 확인할 수 있습니다.
          </>
        )}
      </div>

      <div className="sales-tabs">
        <button type="button" className={"sales-tab" + (tab === "inquiry" ? " on" : "")} onClick={() => { setTab("inquiry"); setSheetFilter(""); }}>
          상품 문의 관리
        </button>
        <button type="button" className={"sales-tab" + (tab === "order" ? " on" : "")} onClick={() => { setTab("order"); setSheetFilter(""); }}>
          결제 주문 내역
        </button>
      </div>

      {!status?.configured && (
        <div className="card" style={{ marginTop: 8, borderColor: "var(--warn, #f9a825)" }}>
          <div className="ttl" style={{ fontWeight: 700 }}>Google Sheets 연동 미설정</div>
          <div className="small" style={{ marginTop: 8 }}>
            서버에 서비스 계정 파일/<code>GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE</code>을 설정하고 시트를 공유해 주세요.
          </div>
        </div>
      )}

      {activeForTab && (
        <div className="sales-progress">
          <strong>백그라운드 동기화 진행 중</strong>
          <div>
            {activeForTab.mode === "all" ? "전체 월" : monthLabel(activeForTab.sheetName)} ·{" "}
            {activeForTab.progress.completedSheets}/{activeForTab.progress.totalSheets}
            {activeForTab.progress.currentSheet ? ` · 현재 ${activeForTab.progress.currentSheet}` : ""}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="sales-toolbar" style={{ marginTop: 0 }}>
          <div>
            <div className="ttl" style={{ fontWeight: 800 }}>
              {tab === "inquiry" ? "상품 문의 관리" : "결제 주문 내역"} · 월별 동기화
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              {tab === "inquiry"
                ? "실제 리드 데이터 · 문의 시트 전체 컬럼 저장"
                : "실결제 상세 · 결제일·주문 정보 전체 컬럼 저장"}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={syncBusy || !status?.configured}
            onClick={handleSyncAll}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {I.sync({ width: 16, height: 16 })}
            전체 동기화
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadStatus} disabled={syncBusy}>
            새로고침
          </button>
        </div>

        <SalesMonthList
          kind={tab}
          months={months}
          busySheet={busySheet}
          disabled={syncBusy}
          onSync={handleSyncMonth}
        />
      </div>

      <div className="sales-toolbar" style={{ marginTop: 16 }}>
        <button
          type="button"
          className={"btn btn-sm" + (showData ? " btn-accent" : " btn-ghost")}
          onClick={() => setShowData((v) => !v)}
        >
          {showData ? "데이터 숨기기" : "데이터 보기"}
        </button>
        {showData && (
          <select value={sheetFilter} onChange={(e) => setSheetFilter(e.target.value)}>
            <option value="">전체 월</option>
            {(months || []).map((m) => (
              <option key={m.sheetName} value={m.sheetName}>
                {monthLabel(m.sheetName)}
                {m.isHistorical ? " (과거)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {showData && <SalesDataTable kind={tab} sheetFilter={sheetFilter} />}
    </div>
  );
}

const RATE_STORAGE_KEY = "erp.sales.paymentRate.v5";

function formatWon(n) {
  return "₩" + Math.round(n || 0).toLocaleString();
}

const CST_STATUS = {
  requested: { label: "견적요청", cls: "cst-badge-before" },
  confirmed: { label: "공사 확정", cls: "cst-badge-ongoing" },
  ongoing: { label: "공사중", cls: "cst-badge-ongoing" },
  done: { label: "공사완료", cls: "cst-badge-done" },
  billing: { label: "청구 단계", cls: "cst-badge-settle" },
  settled: { label: "정산완료", cls: "cst-badge-settled" },
  // 레거시 호환
  before: { label: "견적요청", cls: "cst-badge-before" },
  settle_requested: { label: "청구 단계", cls: "cst-badge-settle" },
};
const CST_FLOW = ["requested", "confirmed", "ongoing", "done", "billing", "settled"];
const cstNum = (v) => Math.max(0, Math.round(Number(String(v).replace(/[^\d]/g, "")) || 0));
const lineSupply = (l) => cstNum(l.unitPrice) * cstNum(l.qty);
const lineVat = (l) => Math.round(lineSupply(l) * 0.1);
const quoteTotals = (lines) => (lines || []).reduce(
  (a, l) => { const s = lineSupply(l); const v = lineVat(l); return { supply: a.supply + s, vat: a.vat + v, total: a.total + s + v }; },
  { supply: 0, vat: 0, total: 0 },
);

const QUOTE_SUPPLIER = {
  bizNo: "456-81-02350",
  company: "브로제이",
  ceo: "조민규",
  address: "서울 금천구 가산디지털 2로 166 424호",
  manager: "조민규",
  phone: "010-4807-5864",
  account: "우리은행 1005-704-322242 (주)브로제이",
};

function quoteDateStr(quote) {
  const d = quote?.createdAt ? new Date(quote.createdAt) : new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, ".");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function printConstructionQuote(quote, apartment) {
  const lines = quote?.lines || [];
  const t = quoteTotals(lines);
  const s = QUOTE_SUPPLIER;
  const rowsHtml = lines.map((l, i) => {
    const supply = lineSupply(l), vat = lineVat(l);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${esc(l.name)}</td>
      <td class="c">${cstNum(l.qty).toLocaleString()}</td>
      <td class="r">${cstNum(l.unitPrice).toLocaleString()}</td>
      <td class="r">${supply.toLocaleString()}</td>
      <td class="r">${vat.toLocaleString()}</td>
      <td class="r b">${(supply + vat).toLocaleString()}</td>
    </tr>`;
  }).join("");

  const period = quote?.startDate ? `${esc(quote.startDate)} ~ ${esc(quote.endDate || "미정")}` : "";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>견적서 - ${esc(apartment?.name || "")}</title>
  <style>
    :root{ --ink:#141414; --muted:#8a8a8a; --line:#E6E4E0; --accent:#F26522; --soft:#FBF4EE; }
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:var(--ink);padding:40px 44px;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px;line-height:1.5;}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid var(--ink);padding-bottom:16px;}
    .hd .logo{height:34px;display:block;}
    .hd .rt{text-align:right;}
    .hd .rt .t{font-size:30px;font-weight:800;letter-spacing:14px;line-height:1;padding-left:14px;}
    .hd .rt .d{font-size:12px;color:var(--muted);margin-top:8px;letter-spacing:.02em;}
    .apt{display:flex;align-items:center;gap:12px;margin:24px 0 20px;}
    .apt .bar{width:5px;height:26px;background:var(--accent);border-radius:3px;}
    .apt .nm{font-size:19px;font-weight:800;letter-spacing:-.01em;}
    .apt .lb{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-left:auto;}
    .sup{position:relative;display:grid;grid-template-columns:auto auto;gap:0 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;width:fit-content;margin-left:auto;}
    .sup .cell{display:flex;border-top:1px solid var(--line);}
    .sup .cell:nth-child(-n+2){border-top:none;}
    .sup .k{background:#FAF9F7;font-weight:700;color:#555;padding:8px 12px;font-size:12px;min-width:78px;border-right:1px solid var(--line);}
    .sup .v{padding:8px 14px;font-size:12.5px;min-width:150px;}
    .seal{position:absolute;right:10px;bottom:10px;width:66px;height:66px;opacity:.9;}
    table.items{width:100%;border-collapse:collapse;margin-top:6px;}
    table.items th{background:var(--ink);color:#fff;font-weight:700;font-size:12px;padding:11px 10px;text-align:center;letter-spacing:.01em;}
    table.items td{border-bottom:1px solid var(--line);padding:11px 10px;font-size:12.5px;}
    table.items td.c{text-align:center;color:var(--muted);}
    table.items td.l{text-align:left;font-weight:600;}
    table.items td.r{text-align:right;font-variant-numeric:tabular-nums;}
    table.items td.b{font-weight:800;}
    table.items tbody tr:nth-child(even) td{background:#FCFBFA;}
    .sum td{background:var(--soft)!important;font-weight:800;font-size:13.5px;border-top:2px solid var(--accent);border-bottom:none;}
    .sum td.big{color:var(--accent);font-size:16px;font-weight:900;}
    .foot{margin-top:22px;display:flex;justify-content:space-between;gap:24px;align-items:flex-start;}
    .note{font-size:12px;color:#444;line-height:1.8;flex:1;}
    .note .h{font-weight:800;color:var(--ink);margin-bottom:4px;letter-spacing:.04em;}
    .stamp-name{text-align:right;font-size:12px;color:var(--muted);}
    .stamp-name b{color:var(--ink);font-size:14px;}
    @media print{ body{padding:14mm;} @page{size:A4;margin:0;} }
  </style></head><body>
    <div class="hd">
      <img class="logo" src="${BROJ_LOGO}" alt="BROJ" />
      <div class="rt"><div class="t">견 적 서</div><div class="d">견적일 ${quoteDateStr(quote)}</div></div>
    </div>

    <div class="apt">
      <span class="bar"></span>
      <span class="nm">${esc(apartment?.name || quote?.title || "무제 견적")}</span>
      <span class="lb">Quotation</span>
    </div>

    <div class="sup">
      <div class="cell"><div class="k">사업자번호</div><div class="v">${esc(s.bizNo)}</div></div>
      <div class="cell"><div class="k">상호</div><div class="v">${esc(s.company)}</div></div>
      <div class="cell"><div class="k">대표자</div><div class="v">${esc(s.ceo)}</div></div>
      <div class="cell"><div class="k">담당자</div><div class="v">${esc(s.manager)}</div></div>
      <div class="cell"><div class="k">소재지</div><div class="v" style="min-width:220px">${esc(s.address)}</div></div>
      <div class="cell"><div class="k">전화번호</div><div class="v">${esc(s.phone)}</div></div>
      <img class="seal" src="${BROJ_SEAL}" alt="직인" />
    </div>

    <table class="items">
      <thead><tr>
        <th style="width:42px">순번</th><th>품명</th><th style="width:56px">개수</th>
        <th style="width:96px">단가</th><th style="width:110px">공급가</th>
        <th style="width:92px">부가세</th><th style="width:120px">금액(VAT포함)</th>
      </tr></thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="7" class="c" style="padding:22px">품목이 없습니다</td></tr>`}
        <tr class="sum">
          <td colspan="4" class="r">합계 (VAT포함)</td>
          <td class="r">${t.supply.toLocaleString()}</td>
          <td class="r">${t.vat.toLocaleString()}</td>
          <td class="r big">${t.total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>

    <div class="foot">
      <div class="note">
        <div class="h">적요</div>
        입금 계좌 : ${esc(s.account)}${period ? `<br/>공사 기간 : ${period}` : ""}${quote?.note ? `<br/>${esc(quote.note)}` : ""}
      </div>
      <div class="stamp-name">위와 같이 견적합니다.<br/><b>${esc(s.company)}</b> (인)</div>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print();},150);};</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) { notifyError(new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.")); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function ConstructionView() {
  const [tab, setTab] = useState("quotes");
  const [items, setItems] = useState([]);
  const [apts, setApts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [stockForm, setStockForm] = useState({ name: "", unit: "개" });
  const [moveFor, setMoveFor] = useState(null); // {stockId, kind} 입출고 입력 대상
  const [moveForm, setMoveForm] = useState({ date: "", qty: "", unitPrice: "", vatSeparate: true, memo: "" });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null=목록, {…}=편집중 견적
  const [busy, setBusy] = useState(false);
  // 폼 입력값
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [aptForm, setAptForm] = useState({ name: "", partner: "", address: "", note: "" });
  const [teamForm, setTeamForm] = useState({ name: "", contact: "", note: "" });
  const [newApt, setNewApt] = useState(null); // 견적 화면 인라인 새 단지 입력
  const [qStatus, setQStatus] = useState("all");
  const [qFrom, setQFrom] = useState("");
  const [qTo, setQTo] = useState("");

  const load = () => {
    Promise.all([api.erpConstructionItems(), api.erpConstructionApartments(), api.erpConstructionQuotes(), api.erpConstructionTeams().catch(() => []), api.erpConstructionStocks().catch(() => [])])
      .then(([i, a, q, tm, st]) => { setItems(i); setApts(a); setQuotes(q); setTeams(tm); setStocks(st); })
      .catch(notifyError)
      .finally(() => setLoading(false));
  };

  // ---- 재고 ----
  const addStock = async () => {
    if (!stockForm.name.trim()) return notifyError(new Error("품목명을 입력하세요"));
    try { await api.erpConstructionCreateStock({ name: stockForm.name.trim(), unit: stockForm.unit.trim() || "개" }); setStockForm({ name: "", unit: "개" }); load(); } catch (e) { notifyError(e); }
  };
  const deleteStock = async (s) => {
    if (!(await confirmAction(`'${s.name}' 재고 품목을 삭제할까요? 입출고 기록도 함께 삭제됩니다.`))) return;
    try { await api.erpConstructionDeleteStock(s.id); load(); } catch (e) { notifyError(e); }
  };
  const openMove = (stockId, kind) => {
    setMoveFor({ stockId, kind });
    setMoveForm({ date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()), qty: "", unitPrice: "", vatSeparate: true, memo: "" });
  };
  const submitMove = async () => {
    if (!moveFor) return;
    if (!cstNum(moveForm.qty)) return notifyError(new Error("수량을 입력하세요"));
    try {
      await api.erpConstructionAddStockMove(moveFor.stockId, {
        date: moveForm.date, kind: moveFor.kind, qty: cstNum(moveForm.qty),
        unitPrice: moveFor.kind === "in" ? cstNum(moveForm.unitPrice) : undefined,
        vatSeparate: moveForm.vatSeparate, memo: moveForm.memo,
      });
      setMoveFor(null); load();
    } catch (e) { notifyError(e); }
  };
  const deleteMove = async (id) => {
    try { await api.erpConstructionDeleteStockMove(id); load(); } catch (e) { notifyError(e); }
  };

  // ---- 협력업체(공사팀) ----
  const addTeam = async () => {
    if (!teamForm.name.trim()) return notifyError(new Error("팀명을 입력하세요"));
    try { await api.erpConstructionCreateTeam(teamForm); setTeamForm({ name: "", contact: "", note: "" }); load(); } catch (e) { notifyError(e); }
  };
  const deleteTeam = async (tm) => {
    if (!(await confirmAction(`'${tm.name}' 팀을 삭제할까요?`))) return;
    try { await api.erpConstructionDeleteTeam(tm.id); load(); } catch (e) { notifyError(e); }
  };
  // 팀별 재정산 집계 (전체 견적의 payouts)
  const teamPayoutSummary = useMemo(() => {
    const map = new Map();
    for (const q of quotes) {
      for (const p of (q.payouts || [])) {
        const key = p.teamId || p.teamName;
        const cur = map.get(key) || { name: p.teamName || "(이름없음)", total: 0, paid: 0, unpaid: 0 };
        cur.total += p.amount || 0;
        if (p.paid) cur.paid += p.amount || 0; else cur.unpaid += p.amount || 0;
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.unpaid - a.unpaid);
  }, [quotes]);
  useEffect(() => { load(); }, []);

  // ---- 품목 단가 ----
  const addItem = async () => {
    if (!itemName.trim()) return notifyError(new Error("품명을 입력하세요"));
    try {
      await api.erpConstructionCreateItem({ name: itemName.trim(), unitPrice: cstNum(itemPrice), sortOrder: items.length });
      setItemName(""); setItemPrice(""); load();
    } catch (e) { notifyError(e); }
  };
  const updateItemPrice = async (it, price) => {
    try { await api.erpConstructionUpdateItem(it.id, { unitPrice: cstNum(price) }); setItems((p) => p.map((x) => x.id === it.id ? { ...x, unitPrice: cstNum(price) } : x)); } catch (e) { notifyError(e); }
  };
  const deleteItem = async (it) => {
    if (!(await confirmAction(`'${it.name}' 품목을 삭제할까요?`))) return;
    try { await api.erpConstructionDeleteItem(it.id); load(); } catch (e) { notifyError(e); }
  };

  // ---- 아파트 단지 ----
  const addApt = async () => {
    if (!aptForm.name.trim()) return notifyError(new Error("아파트명을 입력하세요"));
    try { await api.erpConstructionCreateApartment(aptForm); setAptForm({ name: "", partner: "", address: "", note: "" }); load(); } catch (e) { notifyError(e); }
  };
  const deleteApt = async (a) => {
    if (!(await confirmAction(`'${a.name}' 단지를 삭제할까요? 연결된 견적의 단지 표시가 사라집니다.`))) return;
    try { await api.erpConstructionDeleteApartment(a.id); load(); } catch (e) { notifyError(e); }
  };

  // ---- 견적 ----
  const newQuote = () => { setNewApt(null); setEditing({ apartmentId: apts[0]?.id || "", title: "", lines: [], payouts: [], status: "requested", taxInvoiceIssued: false, note: "", startDate: "", endDate: "" }); };
  const saveNewApt = async () => {
    if (!newApt?.name.trim()) return notifyError(new Error("단지명을 입력하세요"));
    try {
      const created = await api.erpConstructionCreateApartment({ name: newApt.name.trim(), address: (newApt.address || "").trim() });
      setApts((prev) => [created, ...prev]);
      setEditing((ed) => ({ ...ed, apartmentId: created.id }));
      setNewApt(null);
      toastSuccess("단지를 추가했어요");
    } catch (e) { notifyError(e); }
  };
  const editQuote = (q) => { setNewApt(null); setEditing({ ...q, apartmentId: q.apartmentId || "", startDate: q.startDate || "", endDate: q.endDate || "", lines: (q.lines || []).map((l) => ({ ...l })), payouts: (q.payouts || []).map((p) => ({ ...p })) }); };
  const addLineFromItem = (itemId) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    setEditing((e) => ({ ...e, lines: [...e.lines, { name: it.name, unitPrice: it.unitPrice, qty: 1 }] }));
  };
  const addBlankLine = () => setEditing((e) => ({ ...e, lines: [...e.lines, { name: "", unitPrice: 0, qty: 1 }] }));
  const patchLine = (i, patch) => setEditing((e) => ({ ...e, lines: e.lines.map((l, k) => k === i ? { ...l, ...patch } : l) }));
  const removeLine = (i) => setEditing((e) => ({ ...e, lines: e.lines.filter((_, k) => k !== i) }));
  const addPayout = () => setEditing((e) => ({ ...e, payouts: [...(e.payouts || []), { teamId: "", teamName: "", amount: 0, paid: false, memo: "" }] }));
  const setPayout = (i, patch) => setEditing((e) => ({ ...e, payouts: (e.payouts || []).map((p, k) => k === i ? { ...p, ...patch } : p) }));
  const removePayout = (i) => setEditing((e) => ({ ...e, payouts: (e.payouts || []).filter((_, k) => k !== i) }));

  const saveQuote = async () => {
    setBusy(true);
    // 단지명을 입력했지만 "추가"를 안 누른 경우 자동으로 만들어 연결 (단지 미지정 방지)
    let apartmentId = editing.apartmentId || null;
    if (!apartmentId && newApt?.name?.trim()) {
      try {
        const created = await api.erpConstructionCreateApartment({ name: newApt.name.trim(), address: (newApt.address || "").trim() });
        setApts((prev) => [created, ...prev]);
        setNewApt(null);
        apartmentId = created.id;
      } catch (e) { setBusy(false); return notifyError(e); }
    }
    const payload = {
      apartmentId,
      title: editing.title || null,
      lines: editing.lines.map((l) => ({ name: l.name, unitPrice: cstNum(l.unitPrice), qty: cstNum(l.qty) })).filter((l) => l.name),
      status: editing.status,
      taxInvoiceIssued: !!editing.taxInvoiceIssued,
      note: editing.note || null,
      startDate: editing.startDate || null,
      endDate: editing.endDate || null,
      payouts: (editing.payouts || []).map((p) => ({ teamId: p.teamId || null, teamName: p.teamName || "", amount: cstNum(p.amount), paid: !!p.paid, memo: p.memo || null })).filter((p) => p.teamName || p.amount > 0),
    };
    try {
      if (editing.id) await api.erpConstructionUpdateQuote(editing.id, payload);
      else await api.erpConstructionCreateQuote(payload);
      toastSuccess("저장했어요");
      setEditing(null); load();
    } catch (e) { notifyError(e); } finally { setBusy(false); }
  };
  const deleteQuote = async () => {
    if (!editing?.id) { setEditing(null); return; }
    if (!(await confirmAction("이 견적을 삭제할까요?"))) return;
    try { await api.erpConstructionDeleteQuote(editing.id); setEditing(null); load(); } catch (e) { notifyError(e); }
  };

  // 견적 목록 필터 (상태 + 견적일 기간) & 정산/미정산 집계
  const quoteDateKey = (q) => (q.createdAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(q.createdAt))
    : "");
  const filteredQuotes = useMemo(() => quotes.filter((q) => {
    if (qStatus !== "all" && q.status !== qStatus) return false;
    const dk = quoteDateKey(q);
    if (qFrom && dk && dk < qFrom) return false;
    if (qTo && dk && dk > qTo) return false;
    return true;
  }), [quotes, qStatus, qFrom, qTo]);
  const quoteSummary = useMemo(() => {
    let total = 0, settled = 0, unsettled = 0;
    for (const q of filteredQuotes) {
      const amt = quoteTotals(q.lines).total;
      total += amt;
      if (q.status === "settled") settled += amt; else unsettled += amt;
    }
    return { count: filteredQuotes.length, total, settled, unsettled };
  }, [filteredQuotes]);

  if (loading) return <div className="spinner" />;

  // ===== 견적 편집 화면 =====
  if (editing) {
    const totals = quoteTotals(editing.lines);
    return (
      <div className="fade pad" style={{ marginTop: 8, paddingBottom: 40, maxWidth: 900 }}>
        <div className="row between" style={{ alignItems: "center", marginBottom: 4 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>← 견적 목록</button>
          <div className="row" style={{ gap: 6 }}>
            {editing.id && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#C0392B" }} onClick={deleteQuote}>삭제</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => printConstructionQuote(editing, apts.find((a) => a.id === editing.apartmentId))}>PDF / 인쇄</button>
            <button type="button" className="btn btn-accent btn-sm" onClick={saveQuote} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
        <div className="h-title" style={{ fontSize: 20 }}>{editing.id ? "견적 수정" : "새 견적"}</div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
              <label>아파트 단지</label>
              {newApt ? (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <input autoFocus value={newApt.name} onChange={(e) => setNewApt((n) => ({ ...n, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") saveNewApt(); }} placeholder="단지명 *" style={{ flex: "1 1 120px", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }} />
                  <input value={newApt.address} onChange={(e) => setNewApt((n) => ({ ...n, address: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") saveNewApt(); }} placeholder="주소 (선택)" style={{ flex: "1 1 140px", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }} />
                  <button type="button" className="btn btn-accent btn-sm" onClick={saveNewApt}>추가</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewApt(null)}>취소</button>
                </div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  <select style={{ flex: 1 }} value={editing.apartmentId} onChange={(e) => setEditing((ed) => ({ ...ed, apartmentId: e.target.value }))}>
                    <option value="">(미지정)</option>
                    {apts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.partner ? ` · ${a.partner}` : ""}</option>)}
                  </select>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }} onClick={() => setNewApt({ name: "", address: "" })}>+ 새 단지</button>
                </div>
              )}
            </div>
            <div className="field" style={{ flex: "2 1 260px", marginBottom: 0 }}>
              <label>제목 (선택)</label>
              <input value={editing.title || ""} onChange={(e) => setEditing((ed) => ({ ...ed, title: e.target.value }))} placeholder="예: 화상 출입기 설치 견적" />
            </div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
              <label>공사 예정 시작일</label>
              <input type="date" value={editing.startDate || ""} onChange={(e) => setEditing((ed) => ({ ...ed, startDate: e.target.value }))} />
            </div>
            <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
              <label>공사 종료일 (나중에 입력 가능)</label>
              <input type="date" value={editing.endDate || ""} onChange={(e) => setEditing((ed) => ({ ...ed, endDate: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* 품목 라인 */}
        <div className="cst-table-wrap" style={{ marginTop: 14 }}>
          <table className="cst-quote-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>순번</th>
                <th style={{ textAlign: "left" }}>품명</th>
                <th style={{ width: 70 }}>개수</th>
                <th style={{ width: 120 }}>1개 단가</th>
                <th style={{ width: 120 }}>총 공급가</th>
                <th style={{ width: 100 }}>부가세</th>
                <th style={{ width: 130 }}>금액(VAT포함)</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {editing.lines.map((l, i) => (
                <tr key={i}>
                  <td className="cst-num">{i + 1}</td>
                  <td><input className="cst-inp" value={l.name} onChange={(e) => patchLine(i, { name: e.target.value })} placeholder="품명" /></td>
                  <td><input className="cst-inp cst-inp-num" value={l.qty} onChange={(e) => patchLine(i, { qty: cstNum(e.target.value) })} inputMode="numeric" /></td>
                  <td><input className="cst-inp cst-inp-num" value={Number(l.unitPrice).toLocaleString()} onChange={(e) => patchLine(i, { unitPrice: cstNum(e.target.value) })} inputMode="numeric" /></td>
                  <td className="cst-num">{lineSupply(l).toLocaleString()}</td>
                  <td className="cst-num">{lineVat(l).toLocaleString()}</td>
                  <td className="cst-num" style={{ fontWeight: 700 }}>{(lineSupply(l) + lineVat(l)).toLocaleString()}</td>
                  <td><button type="button" className="cst-x" onClick={() => removeLine(i)}>✕</button></td>
                </tr>
              ))}
              {!editing.lines.length && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 18 }}>아래에서 품목을 추가하세요</td></tr>
              )}
              <tr className="cst-total-row">
                <td className="cst-num" colSpan={4} style={{ textAlign: "right", fontWeight: 800 }}>합계</td>
                <td className="cst-num" style={{ fontWeight: 800 }}>{totals.supply.toLocaleString()}</td>
                <td className="cst-num" style={{ fontWeight: 800 }}>{totals.vat.toLocaleString()}</td>
                <td className="cst-num" style={{ fontWeight: 900, color: "var(--accent-deep)" }}>{totals.total.toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select className="cst-inp" style={{ maxWidth: 240 }} value="" onChange={(e) => { if (e.target.value) addLineFromItem(e.target.value); e.target.value = ""; }}>
            <option value="">+ 품목 단가에서 추가…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unitPrice.toLocaleString()})</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addBlankLine}>+ 직접 입력</button>
        </div>

        {/* 상태 / 세금계산서 */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="kbe-meta-h" style={{ marginTop: 0 }}>진행 상태</div>
          <div className="cst-flow">
            {CST_FLOW.map((s) => (
              <button key={s} type="button" className={"cst-flow-btn" + (editing.status === s ? " on" : "")} onClick={() => setEditing((ed) => ({ ...ed, status: s }))}>
                {CST_STATUS[s].label}
              </button>
            ))}
          </div>
          <label className="row" style={{ gap: 8, marginTop: 14, cursor: "pointer", alignItems: "center" }}>
            <input type="checkbox" checked={!!editing.taxInvoiceIssued} onChange={(e) => setEditing((ed) => ({ ...ed, taxInvoiceIssued: e.target.checked }))} />
            <span style={{ fontWeight: 700 }}>세금계산서 발행 완료</span>
          </label>
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label>메모</label>
            <textarea value={editing.note || ""} onChange={(e) => setEditing((ed) => ({ ...ed, note: e.target.value }))} placeholder="정산 요청일, 특이사항 등" style={{ minHeight: 70 }} />
          </div>
        </div>

        {/* 협력업체 재정산 (공사팀 지급) */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between" style={{ alignItems: "center" }}>
            <div className="kbe-meta-h" style={{ margin: 0 }}>협력업체 재정산 (공사팀 지급)</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addPayout}>+ 팀 지급 추가</button>
          </div>
          <div className="small" style={{ color: "var(--muted)", margin: "6px 0 12px" }}>이 공사를 맡긴 공사팀에게 줄 금액을 팀별로 기록하세요. 지급 완료는 체크.</div>
          {!(editing.payouts || []).length ? (
            <div className="small" style={{ color: "var(--muted)" }}>아직 지급 항목이 없습니다. “팀 지급 추가”로 넣으세요.</div>
          ) : (
            <>
              {editing.payouts.map((p, i) => (
                <div key={i} className="row" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={p.teamId || ""} onChange={(e) => setPayout(i, { teamId: e.target.value, teamName: teams.find((t) => t.id === e.target.value)?.name || "" })} style={{ flex: "1 1 130px", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, background: "#fff" }}>
                    <option value="">팀 선택</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input inputMode="numeric" value={p.amount ? p.amount.toLocaleString() : ""} onChange={(e) => setPayout(i, { amount: cstNum(e.target.value) })} placeholder="지급액" style={{ flex: "1 1 100px", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, textAlign: "right" }} />
                  <label className="row" style={{ gap: 4, alignItems: "center", flex: "0 0 auto" }}>
                    <input type="checkbox" checked={!!p.paid} onChange={(e) => setPayout(i, { paid: e.target.checked })} />
                    <span className="small">지급완료</span>
                  </label>
                  <button type="button" className="cst-x" onClick={() => removePayout(i)}>✕</button>
                </div>
              ))}
              {(() => {
                const sum = editing.payouts.reduce((a, p) => a + cstNum(p.amount), 0);
                const unpaid = editing.payouts.reduce((a, p) => a + (p.paid ? 0 : cstNum(p.amount)), 0);
                const margin = quoteTotals(editing.lines).total - sum;
                return (
                  <div className="small" style={{ marginTop: 8, fontWeight: 700 }}>
                    지급 합계 <strong>{formatWon(sum)}</strong> · 미지급 <strong style={{ color: "var(--accent-deep)" }}>{formatWon(unpaid)}</strong> · 견적가 대비 마진 <strong style={{ color: margin >= 0 ? "#0D7A3E" : "#C5221F" }}>{formatWon(margin)}</strong>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== 목록 화면 (탭) =====
  return (
    <div className="fade pad" style={{ marginTop: 8, paddingBottom: 40, maxWidth: 900 }}>
      <div className="h-eyebrow">Owner</div>
      <div className="h-title">아파트너 공사관리</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        아파트너 공사 수주 건을 견적·진행·정산·재고까지 관리합니다. <strong>나(소유자)만 볼 수 있습니다.</strong> (공사팀 풀은 다른 공사에도 공유)
      </div>

      <div className="sales-tabs" style={{ marginTop: 14 }}>
        {[["quotes", "견적"], ["teams", "공사팀 정산"], ["stock", "재고"], ["apartments", "아파트 단지"], ["items", "품목 단가"]].map(([id, label]) => (
          <button key={id} type="button" className={"sales-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "quotes" && (
        <>
          <div className="row between" style={{ margin: "16px 0 10px", alignItems: "center" }}>
            <span className="h-eyebrow">견적 {filteredQuotes.length}건 {filteredQuotes.length !== quotes.length ? `/ 전체 ${quotes.length}` : ""}</span>
            <button type="button" className="btn btn-accent btn-sm" onClick={newQuote}>+ 새 견적</button>
          </div>

          {/* 상태 필터 */}
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" className={"chip" + (qStatus === "all" ? " on" : "")} onClick={() => setQStatus("all")}>전체</button>
            {CST_FLOW.map((s) => (
              <button key={s} type="button" className={"chip" + (qStatus === s ? " on" : "")} onClick={() => setQStatus(s)}>{CST_STATUS[s].label}</button>
            ))}
          </div>

          {/* 기간 필터 (견적일) */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <span className="small" style={{ fontWeight: 700 }}>기간(견적일)</span>
            <input type="date" value={qFrom} onChange={(e) => setQFrom(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", fontFamily: "inherit", fontSize: 13 }} />
            <span className="small">~</span>
            <input type="date" value={qTo} onChange={(e) => setQTo(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", fontFamily: "inherit", fontSize: 13 }} />
            {(qFrom || qTo || qStatus !== "all") && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQFrom(""); setQTo(""); setQStatus("all"); }}>초기화</button>
            )}
          </div>

          {/* 정산/미정산 요약 */}
          <div className="cst-summary">
            <div className="cst-sum-card"><div className="lbl">총 {quoteSummary.count}건 합계</div><div className="val">{formatWon(quoteSummary.total)}</div></div>
            <div className="cst-sum-card unsettled"><div className="lbl">미정산 금액</div><div className="val">{formatWon(quoteSummary.unsettled)}</div></div>
            <div className="cst-sum-card settled"><div className="lbl">정산 완료 금액</div><div className="val">{formatWon(quoteSummary.settled)}</div></div>
          </div>

          {!filteredQuotes.length ? (
            <div className="small" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>{quotes.length ? "조건에 맞는 견적이 없습니다." : "아직 견적이 없습니다. “새 견적”으로 시작하세요."}</div>
          ) : filteredQuotes.map((q) => {
            const t = quoteTotals(q.lines);
            const st = CST_STATUS[q.status] || CST_STATUS.before;
            return (
              <div key={q.id} className="list-item between" style={{ alignItems: "center", cursor: "pointer" }} onClick={() => editQuote(q)}>
                <div style={{ minWidth: 0 }}>
                  <div className="ttl">{q.apartment?.name || "(단지 미지정)"} {q.title ? <span className="small">· {q.title}</span> : null}</div>
                  <div className="meta">
                    합계 <strong>{formatWon(t.total)}</strong> · {(q.lines || []).length}개 품목 · {q.taxInvoiceIssued ? "세금계산서 발행됨" : "세금계산서 미발행"}
                    {q.startDate ? ` · 공사 ${q.startDate}${q.endDate ? ` ~ ${q.endDate}` : " ~"}` : ""}
                  </div>
                </div>
                <span className={"cst-badge " + st.cls}>{st.label}</span>
              </div>
            );
          })}
        </>
      )}

      {tab === "teams" && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="kbe-meta-h" style={{ marginTop: 0 }}>공사팀(협력업체) 등록</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "1 1 140px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="팀명 * (예: A설치팀)" />
              <input style={{ flex: "1 1 130px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={teamForm.contact} onChange={(e) => setTeamForm({ ...teamForm, contact: e.target.value })} placeholder="연락처/계좌 (선택)" />
              <button type="button" className="btn btn-accent" onClick={addTeam}>팀 추가</button>
            </div>
          </div>

          <div className="cst-summary" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="cst-sum-card unsettled"><div className="lbl">팀에 줄 미지급 총액</div><div className="val">{formatWon(teamPayoutSummary.reduce((a, t) => a + t.unpaid, 0))}</div></div>
            <div className="cst-sum-card settled"><div className="lbl">지급 완료 총액</div><div className="val">{formatWon(teamPayoutSummary.reduce((a, t) => a + t.paid, 0))}</div></div>
          </div>

          {teamPayoutSummary.length > 0 && (
            <>
              <div className="h-eyebrow" style={{ marginTop: 18 }}>팀별 지급 현황</div>
              {teamPayoutSummary.map((t, i) => (
                <div key={i} className="list-item between" style={{ alignItems: "center" }}>
                  <div><div className="ttl">{t.name}</div><div className="meta">총 {formatWon(t.total)} · 지급완료 {formatWon(t.paid)}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: t.unpaid > 0 ? "var(--accent-deep)" : "#0D7A3E" }}>{t.unpaid > 0 ? `미지급 ${formatWon(t.unpaid)}` : "완료"}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="h-eyebrow" style={{ marginTop: 18 }}>등록된 공사팀 {teams.length}팀</div>
          {!teams.length ? (
            <div className="small" style={{ color: "var(--muted)", padding: "10px 0" }}>아직 등록된 팀이 없습니다.</div>
          ) : teams.map((tm) => (
            <div key={tm.id} className="list-item between" style={{ alignItems: "center" }}>
              <div><div className="ttl">{tm.name}</div>{tm.contact ? <div className="meta">{tm.contact}</div> : null}</div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#C0392B" }} onClick={() => deleteTeam(tm)}>삭제</button>
            </div>
          ))}
        </>
      )}

      {tab === "stock" && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="kbe-meta-h" style={{ marginTop: 0 }}>재고 품목 등록</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "1 1 160px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={stockForm.name} onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })} placeholder="품목명 * (예: 엘리베이터 모듈)" />
              <input style={{ flex: "0 0 90px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={stockForm.unit} onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })} placeholder="단위" />
              <button type="button" className="btn btn-accent" onClick={addStock}>품목 추가</button>
            </div>
          </div>

          <div className="cst-summary" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="cst-sum-card"><div className="lbl">품목 수</div><div className="val">{stocks.length}</div></div>
            <div className="cst-sum-card settled"><div className="lbl">총 매입액 (VAT포함)</div><div className="val">{formatWon(stocks.reduce((a, s) => a + (s.purchaseTotal || 0), 0))}</div></div>
          </div>

          {!stocks.length ? (
            <div className="small" style={{ color: "var(--muted)", padding: "10px 0" }}>등록된 재고 품목이 없습니다.</div>
          ) : stocks.map((s) => (
            <div key={s.id} className="card" style={{ marginTop: 12 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{s.name} <span className="small" style={{ color: (s.balance || 0) > 0 ? "#0D7A3E" : "var(--accent-deep)" }}>· 재고 {(s.balance || 0).toLocaleString()}{s.unit}</span></div>
                  <div className="meta small" style={{ marginTop: 3 }}>매입 {formatWon(s.purchaseSupply || 0)} + VAT {formatWon(s.purchaseVat || 0)} = <strong>{formatWon(s.purchaseTotal || 0)}</strong></div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-accent btn-sm" onClick={() => openMove(s.id, "in")}>입고</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMove(s.id, "out")}>출고</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#C0392B" }} onClick={() => deleteStock(s)}>삭제</button>
                </div>
              </div>

              {moveFor?.stockId === s.id && (
                <div className="card" style={{ marginTop: 10, background: "var(--paper)" }}>
                  <div className="kbe-meta-h" style={{ marginTop: 0 }}>{moveFor.kind === "in" ? "입고(매입)" : "출고(사용)"} 입력</div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input type="date" value={moveForm.date} onChange={(e) => setMoveForm({ ...moveForm, date: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }} />
                    <input inputMode="numeric" value={moveForm.qty} onChange={(e) => setMoveForm({ ...moveForm, qty: e.target.value })} placeholder="수량" style={{ flex: "0 0 80px", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, textAlign: "right" }} />
                    {moveFor.kind === "in" && (
                      <>
                        <input inputMode="numeric" value={moveForm.unitPrice} onChange={(e) => setMoveForm({ ...moveForm, unitPrice: e.target.value })} placeholder="단가" style={{ flex: "0 0 100px", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, textAlign: "right" }} />
                        <label className="row small" style={{ gap: 4, alignItems: "center" }}><input type="checkbox" checked={moveForm.vatSeparate} onChange={(e) => setMoveForm({ ...moveForm, vatSeparate: e.target.checked })} /> 부가세 별도</label>
                      </>
                    )}
                    <button type="button" className="btn btn-accent btn-sm" onClick={submitMove}>저장</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoveFor(null)}>취소</button>
                  </div>
                  {moveFor.kind === "in" && cstNum(moveForm.qty) > 0 && cstNum(moveForm.unitPrice) > 0 && (
                    <div className="small" style={{ marginTop: 8, fontWeight: 700 }}>
                      공급가 {formatWon(cstNum(moveForm.qty) * cstNum(moveForm.unitPrice))}{moveForm.vatSeparate ? ` + VAT ${formatWon(Math.round(cstNum(moveForm.qty) * cstNum(moveForm.unitPrice) * 0.1))} = ${formatWon(Math.round(cstNum(moveForm.qty) * cstNum(moveForm.unitPrice) * 1.1))}` : ""}
                    </div>
                  )}
                </div>
              )}

              {(s.moves || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {s.moves.map((m) => (
                    <div key={m.id} className="row between" style={{ padding: "7px 2px", borderTop: "1px solid var(--line-soft,#F3EFE9)", fontSize: 13 }}>
                      <span>{m.date} · <strong style={{ color: m.kind === "in" ? "#0D7A3E" : "var(--accent-deep)" }}>{m.kind === "in" ? "입고" : "출고"} {m.qty.toLocaleString()}{s.unit}</strong>{m.unitPrice ? ` · 단가 ${m.unitPrice.toLocaleString()}${m.vatSeparate ? " (VAT별도)" : ""}` : ""}</span>
                      <button type="button" className="cst-x" onClick={() => deleteMove(m.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === "apartments" && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "1 1 160px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={aptForm.name} onChange={(e) => setAptForm({ ...aptForm, name: e.target.value })} placeholder="아파트명 *" />
              <input style={{ flex: "1 1 140px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={aptForm.partner} onChange={(e) => setAptForm({ ...aptForm, partner: e.target.value })} placeholder="아파트너 (수주처)" />
              <input style={{ flex: "2 1 200px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={aptForm.address} onChange={(e) => setAptForm({ ...aptForm, address: e.target.value })} placeholder="주소 (선택)" />
              <button type="button" className="btn btn-accent" onClick={addApt}>추가</button>
            </div>
          </div>
          <div className="erp-tbl-wrap">
            <table className="erp-tbl">
              <thead>
                <tr><th>단지명</th><th className="shrink">아파트너</th><th>주소</th><th className="shrink ctr"></th></tr>
              </thead>
              <tbody>
                {apts.map((a) => (
                  <tr key={a.id}>
                    <td><div className="cell-ttl">{a.name}</div></td>
                    <td className="shrink">{a.partner || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td><span className="cell-sub" style={{ margin: 0 }}>{a.address || "—"}</span></td>
                    <td className="shrink ctr"><button type="button" className="erp-btn-x" title="삭제" onClick={() => deleteApt(a)}>✕</button></td>
                  </tr>
                ))}
                {!apts.length && <tr><td colSpan={4} className="erp-tbl-empty">등록된 단지가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "items" && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input style={{ flex: "2 1 200px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }} value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="품명 (예: 화상출입기 설치비)" />
              <input style={{ flex: "1 1 120px", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14, textAlign: "right" }} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="단가" inputMode="numeric" />
              <button type="button" className="btn btn-accent" onClick={addItem}>추가</button>
            </div>
          </div>
          <div className="cst-table-wrap" style={{ marginTop: 14 }}>
            <table className="cst-quote-table">
              <thead><tr><th style={{ textAlign: "left" }}>품명</th><th style={{ width: 160 }}>단가</th><th style={{ width: 50 }}></th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ textAlign: "left", fontWeight: 600 }}>{it.name}</td>
                    <td><input className="cst-inp cst-inp-num" defaultValue={it.unitPrice.toLocaleString()} onBlur={(e) => updateItemPrice(it, e.target.value)} inputMode="numeric" /></td>
                    <td><button type="button" className="cst-x" onClick={() => deleteItem(it)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small" style={{ marginTop: 8, color: "var(--muted)" }}>단가는 칸을 클릭해 수정 후 다른 곳을 누르면 저장됩니다.</div>
        </>
      )}
    </div>
  );
}

export function TaxInvoiceView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.erpSalesTaxInvoices()
      .then(setData)
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo(
    () => (data?.items || []).filter((it) => month === "all" || it.month === month),
    [data, month],
  );
  const totalAmount = useMemo(() => items.reduce((s, it) => s + (it.amount || 0), 0), [items]);

  const copyList = async () => {
    if (!items.length) return;
    const header = ["월", "결제일", "센터명", "사업자번호", "대표자", "이메일", "연락처", "요금제", "금액", "담당자", "영수/청구", "비고"];
    const lines = [header.join("\t")];
    for (const it of items) {
      lines.push([it.month, it.date || "", it.center, it.bizNo, it.rep, it.email, it.phone, it.plan, it.amount || 0, it.manager, it.receiptType, it.memo].join("\t"));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toastSuccess(`${items.length}건을 복사했어요 (엑셀·홈택스에 붙여넣기)`);
    } catch {
      notifyError(new Error("복사에 실패했습니다"));
    }
  };

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">세금계산서 미발행</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        결제 주문(신규센터) 중 <strong>세금계산서 “필요”</strong>인데 아직 <strong>발행(처리)되지 않은</strong> 건입니다.
        세일즈 동기화로 결제 데이터를 갱신하면 바로 반영됩니다.
        {data?.spreadsheetUrl && (
          <>{" "}<a href={data.spreadsheetUrl} target="_blank" rel="noreferrer">결제 주문 시트</a></>
        )}
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "16px 0 4px", alignItems: "center" }}>
            <button type="button" className={"chip" + (month === "all" ? " on" : "")} onClick={() => setMonth("all")}>전체</button>
            {(data?.months || []).map((m) => (
              <button key={m} type="button" className={"chip" + (month === m ? " on" : "")} onClick={() => setMonth(m)}>{m}</button>
            ))}
            <span style={{ marginLeft: "auto" }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyList} disabled={!items.length}>목록 복사</button>
          </div>

          <div className="trend-selection-bar" style={{ borderColor: items.length ? "#F0C4A8" : "var(--line)", background: items.length ? "#FFF7F2" : "var(--card)" }}>
            <span className="trend-selection-label">미발행 {items.length}건</span>
            <span>합계 <strong>{formatWon(totalAmount)}</strong></span>
            {data?.syncedThrough && <span className="small">동기화: {data.syncedThrough}</span>}
          </div>

          {!items.length ? (
            <div className="small" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
              미발행 세금계산서 대상이 없습니다.
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th className="label">센터명</th>
                    <th style={{ textAlign: "left" }}>결제일</th>
                    <th style={{ textAlign: "left" }}>사업자번호</th>
                    <th style={{ textAlign: "left" }}>대표자</th>
                    <th style={{ textAlign: "left" }}>이메일</th>
                    <th style={{ textAlign: "left" }}>연락처</th>
                    <th style={{ textAlign: "left" }}>요금제</th>
                    <th>금액</th>
                    <th style={{ textAlign: "left" }}>담당자</th>
                    <th style={{ textAlign: "left" }}>영수/청구</th>
                    <th style={{ textAlign: "left" }}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="label">{it.center}</td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{it.date || "-"}</td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{it.bizNo || "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.rep || "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.email || "-"}</td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{it.phone || "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.plan || "-"}</td>
                      <td className="num">{it.amount ? formatWon(it.amount) : "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.manager || "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.receiptType || "-"}</td>
                      <td style={{ textAlign: "left" }}>{it.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MembersView() {
  const [members, setMembers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const load = () => {
    Promise.all([api.erpMembers(), api.erpDepartments().catch(() => [])])
      .then(([ms, ds]) => { setMembers(ms); setDepts(ds); })
      .catch(notifyError)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!email.trim()) return notifyError(new Error("이메일을 입력하세요"));
    try {
      await api.erpInviteMember({ email: email.trim(), name: name.trim() || undefined });
      setEmail("");
      setName("");
      toastSuccess("초대했습니다. 상대방이 가입하면 승인해 주세요.");
      load();
    } catch (e) { notifyError(e); }
  };

  const createTeam = async () => {
    const nm = teamName.trim();
    if (!nm) return notifyError(new Error("팀 이름을 입력하세요"));
    try {
      await api.erpCreateDepartment({ name: nm });
      setTeamName("");
      toastSuccess(`'${nm}' 팀을 만들었어요`);
      load();
    } catch (e) { notifyError(e); }
  };

  const deleteTeam = async (d) => {
    if (!(await confirmAction(`'${d.name}' 팀을 삭제할까요? 소속 멤버는 미배정으로 돌아갑니다.`))) return;
    try {
      await api.erpDeleteDepartment(d.id);
      toastSuccess("팀을 삭제했어요");
      load();
    } catch (e) { notifyError(e); }
  };

  const assignTeam = async (m, deptId) => {
    setBusyId(m.id);
    try {
      await api.erpUpdateEmployee(m.id, { departmentId: deptId || null });
      setMembers((prev) => prev.map((x) => (x.id === m.id
        ? { ...x, department: deptId ? depts.find((d) => d.id === deptId) || null : null }
        : x)));
    } catch (e) { notifyError(e); } finally { setBusyId(""); }
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setEditName(m.name || "");
    setEditEmail(m.email || "");
  };
  const cancelEdit = () => { setEditId(""); setEditName(""); setEditEmail(""); };
  const saveEdit = async (m) => {
    const em = editEmail.trim().toLowerCase();
    if (!em || !em.includes("@")) return notifyError(new Error("올바른 이메일을 입력하세요"));
    setBusyId(m.id);
    try {
      await api.erpUpdateEmployee(m.id, { name: editName.trim() || m.name, email: em });
      toastSuccess("멤버 정보를 수정했어요");
      cancelEdit();
      load();
    } catch (e) { notifyError(e); } finally { setBusyId(""); }
  };

  const statusLabel = (s) => ({ pending: "승인 대기", approved: "승인됨", rejected: "거절" }[s] || s);

  if (loading) return <div className="spinner" />;

  const pending = members.filter((m) => m.memberStatus === "pending");
  const teamCount = (id) => members.filter((m) => m.department?.id === id).length;

  return (
    <div className="fade pad" style={{ marginTop: 8, paddingBottom: 40, maxWidth: 900 }}>
      <div className="h-eyebrow">Access</div>
      <div className="h-title">멤버 관리</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        슈퍼어드민 계정으로 초대·승인하고, 팀을 만들어 멤버를 배정합니다. 승인된 멤버만 ERP를 이용할 수 있습니다.
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field"><label>이메일 초대</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        <div className="field"><label>이름 (선택)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        <button type="button" className="btn btn-accent" onClick={invite}>초대하기</button>
      </div>

      {/* 팀 관리 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="h-eyebrow" style={{ marginBottom: 10 }}>팀 {depts.length}개</div>
        <div className="row" style={{ gap: 8, marginBottom: depts.length ? 12 : 0 }}>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createTeam(); }}
            placeholder="새 팀 이름 (예: 세일즈팀)"
            style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", fontFamily: "inherit", fontSize: 14 }}
          />
          <button type="button" className="btn btn-accent" onClick={createTeam}>팀 만들기</button>
        </div>
        {depts.map((d) => (
          <div key={d.id} className="row between" style={{ padding: "8px 2px", borderTop: "1px solid var(--line)" }}>
            <div><span style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</span> <span className="small">· {teamCount(d.id)}명</span></div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#C0392B" }} onClick={() => deleteTeam(d)}>삭제</button>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="h-eyebrow">승인 대기 {pending.length}명</div>
          <div className="erp-tbl-wrap">
            <table className="erp-tbl">
              <thead>
                <tr><th>멤버</th><th className="shrink ctr">가입</th><th className="shrink"></th></tr>
              </thead>
              <tbody>
                {pending.map((m) => (
                  <tr key={m.id}>
                    <td><div className="cell-ttl">{m.name || m.email}</div><div className="cell-sub">{m.email}</div></td>
                    <td className="shrink ctr"><span className={"erp-badge " + (m.hasAccount ? "green" : "gray")}>{m.hasAccount ? "가입 완료" : "가입 전"}</span></td>
                    <td className="shrink">
                      <div className="row-actions">
                        <button type="button" className="btn btn-accent btn-sm" onClick={() => api.erpApproveMember(m.id).then(load).catch(notifyError)}>승인</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.erpRejectMember(m.id).then(load).catch(notifyError)}>거절</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="h-eyebrow">전체 멤버 {members.length}명</div>
        <div className="erp-tbl-wrap">
          <table className="erp-tbl">
            <thead>
              <tr>
                <th>멤버</th>
                <th className="shrink ctr">상태</th>
                <th className="shrink ctr">계정</th>
                <th className="shrink">팀</th>
                <th className="shrink"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                editId === m.id ? (
                  <tr key={m.id}>
                    <td colSpan={5}>
                      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="이름"
                          style={{ flex: "1 1 120px", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", fontFamily: "inherit", fontSize: 14 }}
                        />
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m); }}
                          placeholder="name@broj.company"
                          style={{ flex: "2 1 200px", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", fontFamily: "inherit", fontSize: 14 }}
                        />
                        <div className="row" style={{ gap: 6 }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={busyId === m.id}>취소</button>
                          <button type="button" className="btn btn-accent btn-sm" onClick={() => saveEdit(m)} disabled={busyId === m.id}>{busyId === m.id ? "저장 중…" : "저장"}</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-ttl">{m.name || m.email}</div>
                      <div className="cell-sub">{m.email}</div>
                    </td>
                    <td className="shrink ctr"><span className="erp-badge">{statusLabel(m.memberStatus)}</span></td>
                    <td className="shrink ctr"><span className={"erp-badge " + (m.hasAccount ? "green" : "orange")}>{m.hasAccount ? "계정 있음" : "미가입"}</span></td>
                    <td className="shrink">
                      <select
                        value={m.department?.id || ""}
                        disabled={busyId === m.id}
                        onChange={(e) => assignTeam(m, e.target.value)}
                        style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "7px 10px", fontFamily: "inherit", fontSize: 13, background: "#fff", maxWidth: 140 }}
                      >
                        <option value="">팀 미배정</option>
                        {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="shrink">
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(m)}>수정</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {!members.length && <tr><td colSpan={5} className="erp-tbl-empty">멤버가 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const ASSIGNEE_PALETTE = [
  { bg: "#E8DEFF", fg: "#5B3E96" },
  { bg: "#D3F8DF", fg: "#1F6B3A" },
  { bg: "#2383E2", fg: "#FFFFFF" },
  { bg: "#FFE2DD", fg: "#B85C3A" },
  { bg: "#6B38C0", fg: "#FFFFFF" },
  { bg: "#5D4037", fg: "#FFFFFF" },
  { bg: "#9B2C2C", fg: "#FFFFFF" },
  { bg: "#F1F1EF", fg: "#55534E" },
  { bg: "#FAEBDD", fg: "#C45500" },
  { bg: "#2E4A4F", fg: "#FFFFFF" },
  { bg: "#D6EAF8", fg: "#1A5276" },
  { bg: "#FADBD8", fg: "#922B21" },
  { bg: "#E8DAEF", fg: "#6C3483" },
  { bg: "#D5F5E3", fg: "#196F3D" },
  { bg: "#FDEBD0", fg: "#935116" },
  { bg: "#D7BDE2", fg: "#512E5F" },
];

const ASSIGNEE_SPECIAL = {
  "미지정": { bg: "#F1F1EF", fg: "#55534E" },
  "미반영": { bg: "#F1F1EF", fg: "#55534E" },
  "대기": { bg: "#FAEBDD", fg: "#C45500" },
  Jay: { bg: "#E8DEFF", fg: "#5B3E96" },
  Owen: { bg: "#D3F8DF", fg: "#1F6B3A" },
  Tae: { bg: "#2383E2", fg: "#FFFFFF" },
  Sofia: { bg: "#FFE2DD", fg: "#B85C3A" },
  Hailey: { bg: "#6B38C0", fg: "#FFFFFF" },
  Dorosi: { bg: "#D7BDE2", fg: "#512E5F" },
  Heum: { bg: "#5D4037", fg: "#FFFFFF" },
  David: { bg: "#9B2C2C", fg: "#FFFFFF" },
  Matthew: { bg: "#D6EAF8", fg: "#1A5276" },
  Luke: { bg: "#D5F5E3", fg: "#196F3D" },
  Jeff: { bg: "#2E4A4F", fg: "#FFFFFF" },
  Jo: { bg: "#FDEBD0", fg: "#935116" },
  Dinah: { bg: "#E8DAEF", fg: "#6C3483" },
  Foy: { bg: "#B2DFDB", fg: "#004D40" },
};

function assigneeBadgeColors(name, colorMap) {
  if (colorMap?.[name]) return colorMap[name];
  if (ASSIGNEE_SPECIAL[name]) return ASSIGNEE_SPECIAL[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length];
}

function AssigneeBadge({ name, compact = false, colorMap }) {
  const { bg, fg } = assigneeBadgeColors(name, colorMap);
  return (
    <span
      className={"assignee-badge" + (compact ? " compact" : "")}
      style={{ background: bg, color: fg }}
    >
      {name}
    </span>
  );
}

function IndustryPicker({ industries, selected, onChange, fallback }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return (industries || []).filter((name) => !lower || name.toLowerCase().includes(lower));
  }, [industries, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  const summary = selected.length ? (
    selected.map((name) => <span key={name} className="trend-industry-chip">{name}</span>)
  ) : fallback ? (
    <span className="trend-industry-chip muted">{fallback}</span>
  ) : (
    <span className="trend-industry-chip muted">업종 선택</span>
  );

  return (
    <div className={"assignee-picker trend-industry-picker" + (open ? " open" : "")} ref={rootRef}>
      <label className="assignee-picker-label">업종</label>
      <button type="button" className={"assignee-picker-trigger" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)}>
        <div className="assignee-picker-value">{summary}</div>
        <span className="assignee-picker-chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="assignee-picker-menu">
          <input
            className="assignee-picker-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="업종 검색"
            autoFocus
          />
          <div className="assignee-picker-list">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                className={"assignee-picker-row" + (selected.includes(name) ? " on" : "")}
                onClick={() => toggle(name)}
              >
                <span>{name}</span>
                {selected.includes(name) && <span className="assignee-picker-check">✓</span>}
              </button>
            ))}
            {!filtered.length && (
              <div className="small" style={{ padding: "12px 10px", color: "var(--muted)" }}>검색 결과 없음</div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="assignee-picker-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>선택 해제</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssigneePicker({ assignees, selected, onChange, colorMap }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return (assignees || []).filter((a) => !lower || a.toLowerCase().includes(lower));
  }, [assignees, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter((a) => a !== name) : [...selected, name]);
  };

  const summary = selected.length
    ? selected.map((name) => <AssigneeBadge key={name} name={name} compact colorMap={colorMap} />)
    : <span className="assignee-badge all">전체</span>;

  return (
    <div className={"assignee-picker" + (open ? " open" : "")} ref={rootRef}>
      <label className="assignee-picker-label">담당자</label>
      <button type="button" className={"assignee-picker-trigger" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)}>
        <div className="assignee-picker-value">{summary}</div>
        <span className="assignee-picker-chev">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="assignee-picker-menu">
          <input
            className="assignee-picker-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색"
            autoFocus
          />
          <div className="assignee-picker-list">
            <button
              type="button"
              className={"assignee-picker-row" + (!selected.length ? " on" : "")}
              onClick={() => onChange([])}
            >
              <span className="assignee-badge all">전체</span>
            </button>
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                className={"assignee-picker-row" + (selected.includes(name) ? " on" : "")}
                onClick={() => toggle(name)}
              >
                <AssigneeBadge name={name} colorMap={colorMap} />
                {selected.includes(name) && <span className="assignee-picker-check">✓</span>}
              </button>
            ))}
            {!filtered.length && (
              <div className="small" style={{ padding: "12px 10px", color: "var(--muted)" }}>검색 결과 없음</div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="assignee-picker-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>선택 해제</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const GROUP_PRESETS = [
  { id: "current", label: "당월", pick: (months, current) => (current ? [current] : []) },
  { id: "prev", label: "지난달", pick: (months, current) => {
    const idx = months.indexOf(current);
    return idx >= 0 && idx < months.length - 1 ? [months[idx + 1]] : [];
  }},
  { id: "last3", label: "직전 3개월", pick: (months, current) => months.filter((m) => m !== current).slice(0, 3) },
  { id: "y2025", label: "2025년", pick: (months) => months.filter((m) => m.startsWith("2025.")) },
];

function monthShortLabel(sheetName) {
  const m = String(sheetName || "").match(/^(\d{4})\.(\d{2})/);
  if (!m) return sheetName;
  return `${m[1]}.${m[2]}`;
}

function formatRateValue(value, format) {
  if (value == null || Number.isNaN(value)) return "-";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return String(value);
}

const PLAN_CELL_METRICS = [
  { key: "inquiries", label: "문의", format: "number" },
  { key: "consulting", label: "상담", format: "number" },
  { key: "openBefore", label: "오픈전", format: "number" },
  { key: "absences", label: "부재", format: "number" },
  { key: "absenceRate", label: "부재%", format: "percent" },
  { key: "monthlyPayment", label: "당월결제", format: "number" },
  { key: "actualPayment", label: "실결제", format: "number" },
  { key: "monthlyRate", label: "당월%", format: "percent" },
  { key: "actualRate", label: "실%", format: "percent" },
];

function buildPlanCompareRows(planTables) {
  if (!planTables?.length) return [];
  const planOrder = [];
  const seen = new Set();
  for (const block of planTables) {
    for (const p of block.plans ?? []) {
      if (!seen.has(p.plan)) {
        seen.add(p.plan);
        planOrder.push(p.plan);
      }
    }
  }
  return planOrder.map((plan) => ({
    plan,
    byGroup: planTables.map((block) => block.plans?.find((p) => p.plan === plan)?.metrics ?? null),
  }));
}

function buildAssigneeCompareRows(assigneeTables, names, onlyWithData = true) {
  if (!assigneeTables?.length || !names?.length) return [];
  return names
    .map((assignee) => ({
      assignee,
      byGroup: assigneeTables.map((block) => block.assignees?.find((a) => a.assignee === assignee)?.metrics ?? null),
    }))
    .filter((row) => !onlyWithData || row.byGroup.some((m) => (m?.inquiries ?? 0) > 0));
}

function PlanMetricsCell({ metrics }) {
  if (!metrics) return <td className="num rate-plan-cell empty">-</td>;
  return (
    <td className="rate-plan-cell">
      {PLAN_CELL_METRICS.map((m) => (
        <div key={m.key} className={m.format === "percent" ? "pct" : ""}>
          <span className="lbl">{m.label}</span>
          <span>{formatRateValue(metrics[m.key], m.format)}</span>
        </div>
      ))}
    </td>
  );
}

function newGroupId() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultGroups(months, currentMonth) {
  const cur = currentMonth || months[0];
  const g1 = { id: newGroupId(), label: "당월", months: cur ? [cur] : [] };
  const last3 = months.filter((m) => m !== cur).slice(0, 3);
  if (last3.length > 0) {
    return [g1, { id: newGroupId(), label: "직전 3개월", months: last3 }];
  }
  return [g1];
}

function loadSavedGroups(months, currentMonth) {
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr) || !arr.length) return null;
    const valid = arr
      .filter((g) => g?.id && g?.months?.length)
      .map((g) => ({
        id: g.id,
        label: g.label || "비교군",
        months: g.months.filter((m) => months.includes(m)),
      }))
      .filter((g) => g.months.length);
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

function saveGroups(groups, selectedIndustries, selectedChannels, selectedAssignees) {
  localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify({ groups, selectedIndustries, selectedChannels, selectedAssignees }));
}

function collectDescendantIds(node) {
  const ids = [node.id];
  for (const c of node.children ?? []) ids.push(...collectDescendantIds(c));
  return ids;
}

function nodeMatchesSearch(node, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  if (node.label.toLowerCase().includes(lower)) return true;
  return (node.children ?? []).some((c) => nodeMatchesSearch(c, q));
}

function ChannelTreeFilter({ tree, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isAll = !selected.length;
  const selectedLabels = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (selected.includes(n.id)) selectedLabels.push(n.label);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  const summary = isAll
    ? "전체 채널"
    : selectedLabels.length <= 3
      ? selectedLabels.join(", ")
      : `${selectedLabels.slice(0, 2).join(", ")} 외 ${selectedLabels.length - 2}`;

  const isNodeFullySelected = (node) => {
    const ids = collectDescendantIds(node);
    return ids.every((id) => selected.includes(id));
  };

  const isNodePartial = (node) => {
    const ids = collectDescendantIds(node);
    const n = ids.filter((id) => selected.includes(id)).length;
    return n > 0 && n < ids.length;
  };

  const toggleNode = (node, checked) => {
    const ids = collectDescendantIds(node);
    if (checked) {
      onChange([...new Set([...selected, ...ids])]);
    } else {
      onChange(selected.filter((id) => !ids.includes(id)));
    }
  };

  const renderNode = (node, depth = 0) => {
    if (!nodeMatchesSearch(node, search.trim())) return null;
    const showChildren = !search.trim() || (node.children ?? []).some((c) => nodeMatchesSearch(c, search.trim()));
    return (
      <div key={node.id}>
        <div className={`ch-node depth-${depth}`}>
          <input
            type="checkbox"
            checked={isNodeFullySelected(node)}
            ref={(el) => { if (el) el.indeterminate = isNodePartial(node); }}
            onChange={(e) => toggleNode(node, e.target.checked)}
          />
          <label onClick={() => toggleNode(node, !isNodeFullySelected(node))}>{node.label}</label>
        </div>
        {showChildren && (node.children ?? []).map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="ch-filter">
      <div className="ch-filter-hd" onClick={() => setOpen((v) => !v)}>
        <strong>문의 채널</strong>
        <span className="small">{summary}</span>
        <span className="small">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="ch-filter-body">
          <input
            className="ch-filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="채널 검색 (예: 네이버, Instagram)"
          />
          <div className="ch-filter-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>전체</button>
            {tree.map((g) => (
              <button key={g.id} type="button" className="btn btn-ghost btn-sm" onClick={() => toggleNode(g, true)}>
                {g.label}
              </button>
            ))}
            {selected.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>선택 해제</button>
            )}
          </div>
          {tree.map((g) => (
            <div key={g.id} className="ch-group">
              {!search.trim() && <div className="ch-group-title">{g.label}</div>}
              {renderNode(g, 0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RATE_CHART_COLORS = ["#E37400", "#2383E2", "#0D7A3E", "#C5221F", "#9334E6", "#B06000"];

const RATE_CHART_METRICS = [
  { key: "monthlyRate", label: "당월 결제전환율", format: "percent" },
  { key: "actualRate", label: "실 결제전환율", format: "percent" },
  { key: "absenceRate", label: "부재율", format: "percent" },
  { key: "inquiries", label: "문의수", format: "number" },
  { key: "consulting", label: "상담진행&운영중", format: "number" },
  { key: "monthlyPayment", label: "당월 결제", format: "number" },
  { key: "actualPayment", label: "실결제", format: "number" },
];

function rateChartScalar(value, format) {
  if (value == null || Number.isNaN(value)) return null;
  return format === "percent" ? value * 100 : value;
}

function buildRateChartSeries(result, metricKey, format) {
  const series = [];
  if (result?.timeline?.length) {
    series.push({
      id: "timeline",
      label: "월별 전체",
      color: "#9AA0A6",
      dashed: true,
      points: result.timeline.map((t) => ({
        month: t.month,
        value: rateChartScalar(t.metrics?.[metricKey], format),
      })),
    });
  }
  for (const [i, g] of (result?.groups || []).entries()) {
    if (!g.byMonth?.length) continue;
    series.push({
      id: g.id,
      label: g.label,
      color: RATE_CHART_COLORS[i % RATE_CHART_COLORS.length],
      points: g.byMonth.map((m) => ({
        month: m.month,
        value: rateChartScalar(m.metrics?.[metricKey], format),
      })),
    });
  }
  const months = [...new Set(series.flatMap((s) => s.points.map((p) => p.month)))].sort((a, b) => a.localeCompare(b));
  return { months, series };
}

function buildGroupMonthCompareRows(groups) {
  const monthSet = new Set();
  for (const g of groups || []) {
    for (const m of g.byMonth || []) monthSet.add(m.month);
  }
  return [...monthSet].sort((a, b) => a.localeCompare(b)).map((month) => ({
    month,
    byGroup: (groups || []).map((g) => g.byMonth?.find((m) => m.month === month)?.metrics ?? null),
  }));
}


function RateStatsPanel({ result, groupLabels, statsMetric, onMetricChange }) {
  const metricDef = RATE_CHART_METRICS.find((m) => m.key === statsMetric) || RATE_CHART_METRICS[0];
  const chartSeries = useMemo(
    () => buildRateChartSeries(result, metricDef.key, metricDef.format),
    [result, metricDef],
  );
  const groupMonthRows = useMemo(() => buildGroupMonthCompareRows(result?.groups), [result]);
  const timeline = result?.timeline || [];
  const rateVizMonths = useMemo(
    () => [...new Set(chartSeries.series.flatMap((s) => s.points.map((p) => p.month)))].sort((a, b) => a.localeCompare(b)),
    [chartSeries],
  );

  return (
    <div className="rate-stats-panel">
      <div className="rate-stats-controls">
        <div className="field" style={{ margin: 0 }}>
          <label>그래프 지표</label>
          <select value={statsMetric} onChange={(e) => onMetricChange(e.target.value)}>
            {RATE_CHART_METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rate-plan-block">
        <StatViz
          title={`${metricDef.label} 추이`}
          views={["line", "bar"]}
          format={metricDef.format}
          categories={rateVizMonths.map(monthShortLabel)}
          series={chartSeries.series.map((s) => ({
            label: s.label,
            color: s.color,
            dashed: s.dashed,
            values: rateVizMonths.map((mm) => s.points.find((p) => p.month === mm)?.value ?? null),
          }))}
        />
      </div>

      <div className="rate-plan-block">
        <div className="rate-plan-title">비교군 × 월 ({metricDef.label})</div>
        <div className="rate-table-wrap rate-table-scroll">
          <table className="rate-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>월</th>
                {groupLabels.map((label) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {groupMonthRows.map((row) => (
                <tr key={row.month}>
                  <td className="metric-label">{monthShortLabel(row.month)}</td>
                  {row.byGroup.map((metrics, i) => (
                    <td key={i} className="num">
                      {formatRateValue(metrics?.[metricDef.key], metricDef.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rate-plan-block">
        <div className="rate-plan-title">월별 지표 비교표</div>
        <div className="rate-table-wrap rate-table-scroll">
          <table className="rate-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>월</th>
                {RATE_CHART_METRICS.map((m) => <th key={m.key}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) => (
                <tr key={row.month}>
                  <td className="metric-label">{monthShortLabel(row.month)}</td>
                  {RATE_CHART_METRICS.map((m) => (
                    <td key={m.key} className={"num" + (m.format === "percent" ? " metric-pct" : "")}>
                      {formatRateValue(row.metrics?.[m.key], m.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rate-plan-block">
        <div className="rate-plan-title">비교군 요약</div>
        <div className="rate-table-wrap rate-table-scroll">
          <table className="rate-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>지표</th>
                {groupLabels.map((label) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(result?.rows || []).map((row) => (
                <tr key={row.key} className={row.format === "percent" ? "metric-pct" : ""}>
                  <td className="metric-label">{row.label}</td>
                  {row.values.map((val, i) => (
                    <td key={i} className="num">{formatRateValue(val, row.format)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PaymentRateView() {
  const [meta, setMeta] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showAssignees, setShowAssignees] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsMetric, setStatsMetric] = useState("monthlyRate");

  const currentMonthSheet = useMemo(() => {
    const now = new Date();
    const sheet = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
    return meta?.months?.includes(sheet) ? sheet : meta?.months?.[0] || "";
  }, [meta]);

  const months = meta?.months || [];

  useEffect(() => {
    api.erpPaymentRateMeta()
      .then((m) => {
        setMeta(m);
        const now = new Date();
        const curSheet = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
        const cur = m.months?.includes(curSheet) ? curSheet : m.months?.[0] || "";
        const saved = loadSavedGroups(m.months || [], cur);
        setGroups(saved || defaultGroups(m.months || [], cur));
        try {
          const raw = localStorage.getItem(RATE_STORAGE_KEY);
          const prefs = raw ? JSON.parse(raw) : null;
          if (Array.isArray(prefs?.selectedIndustries)) {
            setSelectedIndustries(prefs.selectedIndustries);
          } else if (prefs?.industry) {
            setSelectedIndustries([prefs.industry]);
          }
          if (Array.isArray(prefs?.selectedChannels)) setSelectedChannels(prefs.selectedChannels);
          if (Array.isArray(prefs?.selectedAssignees)) setSelectedAssignees(prefs.selectedAssignees);
        } catch { /* */ }
      })
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, []);

  const runCompute = useCallback(() => {
    const valid = groups.filter((g) => g.months.length > 0);
    if (!valid.length) return notifyError(new Error("비교군에 월을 1개 이상 선택하세요"));
    setComputing(true);
    saveGroups(groups, selectedIndustries, selectedChannels, selectedAssignees);
    api.erpPaymentRate({
      industries: selectedIndustries.length ? selectedIndustries : undefined,
      channels: selectedChannels.length ? selectedChannels : undefined,
      assignees: selectedAssignees.length ? selectedAssignees : undefined,
      groups: valid.map((g) => ({ id: g.id, label: g.label, months: g.months })),
    })
      .then((res) => {
        setResult(res);
        setShowAssignees(true);
        setShowStats(false);
      })
      .catch(notifyError)
      .finally(() => setComputing(false));
  }, [groups, selectedIndustries, selectedChannels, selectedAssignees]);

  const addGroup = (preset) => {
    const months = meta?.months || [];
    const picked = preset?.pick(months, currentMonthSheet) || (currentMonthSheet ? [currentMonthSheet] : []);
    setGroups((prev) => [
      ...prev,
      {
        id: newGroupId(),
        label: preset?.label || `비교군 ${prev.length + 1}`,
        months: [...picked],
      },
    ]);
  };

  const removeGroup = (id) => {
    setGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.id !== id)));
  };

  const updateGroup = (id, patch) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const toggleMonth = (groupId, month) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      const has = g.months.includes(month);
      return {
        ...g,
        months: has ? g.months.filter((m) => m !== month) : [...g.months, month].sort((a, b) => b.localeCompare(a)),
      };
    }));
  };

  const applyPresetToGroup = (groupId, preset) => {
    const picked = preset.pick(meta?.months || [], currentMonthSheet);
    if (!picked.length) return notifyError(new Error("선택 가능한 월이 없습니다"));
    updateGroup(groupId, { label: preset.label, months: picked });
  };

  const groupLabels = result?.groups?.map((g) => g.label) || groups.filter((g) => g.months.length).map((g) => g.label);
  const planCompareRows = useMemo(() => buildPlanCompareRows(result?.planTables), [result]);
  const compareAssigneeNames = selectedAssignees.length ? selectedAssignees : (meta?.assignees || []);
  const assigneeCompareRows = useMemo(
    () => buildAssigneeCompareRows(result?.assigneeTables, compareAssigneeNames, !selectedAssignees.length),
    [result, compareAssigneeNames, selectedAssignees.length],
  );
  const noData = result?.rows?.find((r) => r.key === "inquiries")?.values?.every((v) => !v);
  const hasEmpty = groups.some((g) => !g.months.length);

  if (loading) return <div className="spinner" />;

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">결제율 분석</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        비교군을 1개 이상 추가하고 월을 선택한 뒤 <strong>조회</strong>하세요.
        업종은 <strong>1개 또는 여러 개</strong> 선택해 종합 집계할 수 있습니다.
        부재율은 상품문의 시트 <strong>부재율</strong> 컬럼 기준(완전부재·부재1차·부재2차)입니다.
        상담진행&운영중은 <strong>상담완료</strong>·<strong>부재 상담완료</strong> 기준이며, <strong>오픈전</strong> 체크 건은 제외합니다.
      </div>

      <div className="card rate-filter-panel">
        <div className="rate-filter-panel-hd">조회 조건</div>
        <div className="rate-filter-panel-body">
          <IndustryPicker
            industries={meta?.industries || []}
            selected={selectedIndustries}
            onChange={setSelectedIndustries}
            fallback="전체"
          />
          <AssigneePicker
            assignees={meta?.assignees || []}
            selected={selectedAssignees}
            onChange={setSelectedAssignees}
            colorMap={meta?.assigneeColors}
          />
        </div>
      </div>

      {meta?.channelTree && (
        <ChannelTreeFilter
          tree={meta.channelTree}
          selected={selectedChannels}
          onChange={setSelectedChannels}
        />
      )}

      <div className="rate-groups-section">
        <div className="rate-groups-top">
          <div className="rate-groups-top-hd">
            <strong>비교군 · 월 선택</strong>
            <span className="small">{groups.length}개 비교군</span>
          </div>
          <div className="rate-groups-presets">
            {GROUP_PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => addGroup(p)}>+ {p.label}</button>
            ))}
            <button type="button" className="btn btn-accent btn-sm" onClick={() => addGroup(null)}>+ 빈 비교군</button>
          </div>
        </div>

      <div className="rate-groups">
        {groups.map((g, i) => (
          <div key={g.id} className="rate-group-card">
            <div className="rate-group-hd">
              <input
                value={g.label}
                onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                placeholder={`비교군 ${i + 1}`}
                style={{ fontWeight: 800, flex: 1, minWidth: 100 }}
              />
              <span className="small">{g.months.length}개월</span>
              {groups.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeGroup(g.id)}>삭제</button>
              )}
            </div>
            <div className="rate-group-actions" style={{ marginBottom: 8 }}>
              {GROUP_PRESETS.map((p) => (
                <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => applyPresetToGroup(g.id, p)}>
                  {p.label}
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateGroup(g.id, { months: [] })}>해제</button>
            </div>
            <div className="rate-month-picks">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={"rate-month-chip" + (g.months.includes(m) ? " on" : "")}
                  onClick={() => toggleMonth(g.id, m)}
                >
                  {monthShortLabel(m)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>

      {hasEmpty && (
        <div className="small" style={{ color: "#B06000", marginBottom: 8 }}>
          월이 비어 있는 비교군이 있습니다. 월을 선택하거나 삭제하세요.
        </div>
      )}

      <button type="button" className="btn btn-accent" style={{ width: "100%", marginTop: 8 }} onClick={runCompute} disabled={computing || hasEmpty}>
        {computing ? "조회 중…" : "조회"}
      </button>

      {computing && !result ? <div className="spinner" /> : result && (
        <>
          {noData && (
            <div className="small" style={{ marginTop: 12, padding: 12, background: "#FFF8E1", borderRadius: 8 }}>
              선택한 기간에 데이터가 없습니다. <strong>세일즈 동기화</strong>에서 해당 월을 먼저 동기화하세요.
            </div>
          )}

          <div className="sales-toolbar" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={"btn btn-sm" + (!showStats ? " btn-accent" : " btn-ghost")}
              onClick={() => setShowStats(false)}
            >
              요약
            </button>
            <button
              type="button"
              className={"btn btn-sm" + (showStats ? " btn-accent" : " btn-ghost")}
              onClick={() => setShowStats(true)}
            >
              통계
            </button>
          </div>

          {showStats ? (
            <RateStatsPanel
              result={result}
              groupLabels={groupLabels}
              statsMetric={statsMetric}
              onMetricChange={setStatsMetric}
            />
          ) : (
        <>
          <div className="rate-table-wrap rate-table-scroll">
            <table className="rate-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>지표</th>
                  {groupLabels.map((label) => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {(result.rows || []).map((row) => (
                  <tr key={row.key} className={row.format === "percent" ? "metric-pct" : ""}>
                    <td className="metric-label">{row.label}</td>
                    {row.values.map((val, i) => (
                      <td key={i} className="num">{formatRateValue(val, row.format)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sales-toolbar" style={{ marginTop: 16 }}>
            <button
              type="button"
              className={"btn btn-sm" + (showAssignees ? " btn-accent" : " btn-ghost")}
              onClick={() => setShowAssignees((v) => !v)}
            >
              {showAssignees ? "담당자별 숨기기" : "담당자별 비교"}
            </button>
            <button
              type="button"
              className={"btn btn-sm" + (showPlans ? " btn-accent" : " btn-ghost")}
              onClick={() => setShowPlans((v) => !v)}
            >
              {showPlans ? "요금제별 숨기기" : "요금제별 상세"}
            </button>
          </div>

          {showAssignees && (
            <div className="rate-plan-block">
              <div className="rate-plan-title">담당자별 비교</div>
              {assigneeCompareRows.length === 0 ? (
                <div className="small" style={{ padding: "12px 0", color: "var(--muted)", lineHeight: 1.6 }}>
                  선택한 기간·필터에 담당자별 집계 데이터가 없습니다. 비교군 월을 확인하거나 필터를 해제해 보세요.
                </div>
              ) : (
              <div className="rate-table-wrap rate-table-scroll">
                <table className="rate-table rate-plan-compare">
                  <thead>
                    <tr>
                      <th className="plan-col">담당자</th>
                      {groupLabels.map((label) => <th key={label}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {assigneeCompareRows.map((row) => (
                      <tr key={row.assignee}>
                        <td className="plan-col"><AssigneeBadge name={row.assignee} colorMap={meta?.assigneeColors} /></td>
                        {row.byGroup.map((metrics, i) => (
                          <PlanMetricsCell key={i} metrics={metrics} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

          {showPlans && planCompareRows.length > 0 && (
            <div className="rate-plan-block">
              <div className="rate-plan-title">요금제별 비교</div>
              <div className="rate-table-wrap rate-table-scroll">
                <table className="rate-table rate-plan-compare">
                  <thead>
                    <tr>
                      <th className="plan-col">요금제</th>
                      {groupLabels.map((label) => <th key={label}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {planCompareRows.map((row) => (
                      <tr key={row.plan}>
                        <td className="plan-col">{row.plan}</td>
                        {row.byGroup.map((metrics, i) => (
                          <PlanMetricsCell key={i} metrics={metrics} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
          )}
        </>
      )}
    </div>
  );
}

const TREND_TABS = [
  { id: "industry-plan", label: "업종X요금제" },
  { id: "industry-channel", label: "업종X채널" },
  { id: "industry", label: "업종" },
  { id: "plan", label: "요금제" },
];

const INQUIRY_TREND_TABS = [
  { id: "industry", label: "업종별" },
  { id: "industry-plan", label: "업종X요금제" },
  { id: "industry-prev", label: "업종X직전서비스" },
  { id: "industry-feature", label: "업종X문의기능" },
  { id: "industry-channel-plan", label: "업종X문의채널X요금제" },
];

const INQUIRY_TREND_CROSS_TABS = new Set([
  "industry-plan",
  "industry-prev",
  "industry-feature",
  "industry-channel-plan",
]);

function formatTrendCell(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return String(value);
}

function trendCellKey(month, colKey) {
  return `${month}|${colKey}`;
}

function parseTrendCellKey(key) {
  const sep = key.indexOf("|");
  return { month: key.slice(0, sep), colKey: key.slice(sep + 1) };
}

function toggleTrendCell(selected, month, colKey) {
  const key = trendCellKey(month, colKey);
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function toggleTrendColumn(selected, colKey, rows) {
  const keys = rows.map((row) => trendCellKey(row.month, colKey));
  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
  const next = new Set(selected);
  for (const key of keys) {
    if (allSelected) next.delete(key);
    else next.add(key);
  }
  return next;
}

function toggleTrendRow(selected, month, columns) {
  const keys = columns.map((col) => trendCellKey(month, col.key));
  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
  const next = new Set(selected);
  for (const key of keys) {
    if (allSelected) next.delete(key);
    else next.add(key);
  }
  return next;
}

function isTrendColumnFullySelected(selected, colKey, rows) {
  if (!rows.length) return false;
  return rows.every((row) => selected.has(trendCellKey(row.month, colKey)));
}

function isTrendRowFullySelected(selected, month, columns) {
  if (!columns.length) return false;
  return columns.every((col) => selected.has(trendCellKey(month, col.key)));
}

function TrendMatrixView({ title, subtitle, tabs, crossTabIds, fetchTrend, countLabel, sheetLinkLabel, emptyHint, allowAll = false }) {
  const [tab, setTab] = useState(tabs[0].id);
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [allIndustries, setAllIndustries] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hideZero, setHideZero] = useState(true);
  const [recentOnly, setRecentOnly] = useState(false);
  const [selectedCells, setSelectedCells] = useState(() => new Set());

  const isCross = crossTabIds ? crossTabIds.has(tab) : true;
  const allActive = allowAll && isCross && allIndustries;

  useEffect(() => {
    setSelectedCells(new Set());
  }, [tab, selectedIndustries, hideZero, recentOnly, allIndustries]);

  useEffect(() => {
    setLoading(true);
    fetchTrend({
      tab,
      industries: isCross && !allActive ? selectedIndustries : undefined,
      all: allActive || undefined,
    })
      .then(setData)
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [tab, selectedIndustries, isCross, fetchTrend, allActive]);

  const visibleColumns = useMemo(() => {
    if (!data?.columns?.length) return [];
    if (!hideZero) return data.columns;
    const keysWithData = new Set();
    for (const row of data.rows || []) {
      for (const col of data.columns) {
        const v = row.values?.[col.key];
        if (v != null && v !== 0) keysWithData.add(col.key);
      }
    }
    return data.columns.filter((col) => col.kind === "total" || keysWithData.has(col.key));
  }, [data, hideZero]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    if (!recentOnly) return rows;
    return rows.slice(-12);
  }, [data, recentOnly]);

  // 드래그로 칠하듯 셀 선택 (마우스). 시작 셀의 상태로 add/remove 모드 결정.
  const dragRef = useRef(null);
  useEffect(() => {
    const end = () => { dragRef.current = null; };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, []);

  const applyCell = useCallback((month, colKey, mode) => {
    setSelectedCells((prev) => {
      const key = trendCellKey(month, colKey);
      const next = new Set(prev);
      if (mode === "remove") next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const onCellDown = useCallback((e, month, colKey) => {
    const mode = selectedCells.has(trendCellKey(month, colKey)) ? "remove" : "add";
    if (e.pointerType === "mouse") {
      e.preventDefault();
      dragRef.current = { mode };
    }
    applyCell(month, colKey, mode);
  }, [selectedCells, applyCell]);

  const onCellEnter = useCallback((month, colKey) => {
    if (dragRef.current) applyCell(month, colKey, dragRef.current.mode);
  }, [applyCell]);

  const selectionStats = useMemo(() => {
    if (!selectedCells.size) return null;
    const nums = [];
    for (const key of selectedCells) {
      const { month, colKey } = parseTrendCellKey(key);
      const row = visibleRows.find((r) => r.month === month);
      const val = row?.values?.[colKey];
      if (val != null && !Number.isNaN(val)) nums.push(val);
    }
    if (!nums.length) {
      return { cellCount: selectedCells.size, valueCount: 0, sum: null, avg: null, min: null, max: null };
    }
    const sum = nums.reduce((acc, n) => acc + n, 0);
    return {
      cellCount: selectedCells.size,
      valueCount: nums.length,
      sum,
      avg: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    };
  }, [selectedCells, visibleRows]);

  const fmtStat = (n) => (n == null ? "-" : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

  const tabLabel = tabs.find((t) => t.id === tab)?.label || "";
  const activeIndustries = selectedIndustries.length
    ? selectedIndustries
    : (data?.selectedIndustries || []);
  const industrySummary = allActive
    ? "전체 업종 (종합)"
    : activeIndustries.length > 1
      ? `${activeIndustries.join(" · ")} (종합)`
      : activeIndustries[0] || "";

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">{title}</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        {subtitle}
        {data?.spreadsheetUrl && (
          <>{" "}<a href={data.spreadsheetUrl} target="_blank" rel="noreferrer">{sheetLinkLabel}</a></>
        )}
      </div>

      <div className="sales-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"sales-tab" + (tab === t.id ? " on" : "")}
            onClick={() => { setTab(t.id); setSelectedIndustries([]); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="trend-toolbar">
        <span className="small" style={{ fontWeight: 700 }}>
          {tabLabel}
          {isCross && industrySummary ? ` · ${industrySummary}` : ""}
          {" · "}{countLabel} {data?.rowCount ?? 0}건
        </span>
        {allowAll && isCross && (
          <button
            type="button"
            className={"btn btn-sm" + (allActive ? " btn-accent" : " btn-ghost")}
            onClick={() => setAllIndustries((v) => !v)}
          >
            전체 종합
          </button>
        )}
        {isCross && !allActive && (data?.industries?.length > 0) && (
          <IndustryPicker
            industries={data.industries}
            selected={selectedIndustries}
            onChange={(next) => { setSelectedIndustries(next); setAllIndustries(false); }}
            fallback={data?.selectedIndustries?.[0] ? `${data.selectedIndustries[0]} (기본)` : undefined}
          />
        )}
        <button
          type="button"
          className={"btn btn-sm" + (hideZero ? " btn-accent" : " btn-ghost")}
          onClick={() => setHideZero((v) => !v)}
        >
          {hideZero ? "0 숨김" : "0 표시"}
        </button>
        <button
          type="button"
          className={"btn btn-sm" + (recentOnly ? " btn-accent" : " btn-ghost")}
          onClick={() => setRecentOnly((v) => !v)}
        >
          {recentOnly ? "최근 12개월" : "전체 기간"}
        </button>
        {data?.months?.length > 0 && (
          <span className="small">{visibleRows.length}개월 · {visibleColumns.length}열</span>
        )}
        {selectedCells.size > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedCells(new Set())}>
            선택 해제
          </button>
        )}
      </div>

      <div className={"trend-selection-bar" + (selectionStats ? "" : " empty")}>
        {selectionStats ? (
          <>
            <span className="trend-selection-label">선택 {selectionStats.cellCount}칸</span>
            {selectionStats.valueCount > 0 ? (
              <>
                <span>합계 <strong>{fmtStat(selectionStats.sum)}</strong></span>
                <span>평균 <strong>{fmtStat(selectionStats.avg)}</strong></span>
                <span>최소 <strong>{fmtStat(selectionStats.min)}</strong></span>
                <span>최대 <strong>{fmtStat(selectionStats.max)}</strong></span>
                <span>개수 <strong>{selectionStats.valueCount}</strong></span>
                {selectionStats.valueCount < selectionStats.cellCount && (
                  <span className="small">({selectionStats.valueCount}개 숫자 기준)</span>
                )}
              </>
            ) : (
              <span className="small">선택한 칸에 집계할 숫자가 없습니다</span>
            )}
          </>
        ) : (
          <span className="trend-selection-empty">칸을 선택하면 합계·평균·최소·최대·개수가 표시됩니다</span>
        )}
      </div>

      <div className="small trend-selection-hint">
        칸을 클릭하거나 <strong>드래그해서 여러 칸을 한 번에 선택</strong>하세요. 선택된 칸 위로 드래그하면 해제됩니다. 월·열 헤더 클릭 시 해당 행·열 전체 선택.
      </div>

      {!loading && data?.rowCount === 0 && (
        <div className="small" style={{ marginBottom: 8, color: "#B06000", lineHeight: 1.6 }}>
          {emptyHint}
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : !data?.rows?.length ? (
        <div className="small" style={{ textAlign: "center", padding: 40 }}>데이터가 없습니다</div>
      ) : (
        <StatViz
          views={["table", "line", "bar"]}
          format="number"
          categories={visibleRows.map((r) => r.month)}
          series={visibleColumns.map((col, i) => ({
            label: col.label,
            color: seriesColor(i),
            values: visibleRows.map((r) => r.values?.[col.key] ?? null),
          }))}
          tableNode={
        <div className="trend-table-wrap">
          <table className="trend-table" style={{ userSelect: "none" }}>
            <thead>
              <tr>
                <th className="trend-month-hd">월</th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={"trend-selectable" + (isTrendColumnFullySelected(selectedCells, col.key, visibleRows) ? " selected" : "")}
                    onClick={() => setSelectedCells((prev) => toggleTrendColumn(prev, col.key, visibleRows))}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.month}>
                  <td
                    className={"trend-month trend-selectable" + (isTrendRowFullySelected(selectedCells, row.month, visibleColumns) ? " selected" : "")}
                    onClick={() => setSelectedCells((prev) => toggleTrendRow(prev, row.month, visibleColumns))}
                  >
                    {row.month}
                  </td>
                  {visibleColumns.map((col) => {
                    const val = row.values?.[col.key];
                    const isZero = val === 0;
                    const cellKey = trendCellKey(row.month, col.key);
                    const isSelected = selectedCells.has(cellKey);
                    return (
                      <td
                        key={col.key}
                        className={"num trend-selectable" + (isZero ? " zero" : "") + (isSelected ? " selected" : "")}
                        onPointerDown={(e) => onCellDown(e, row.month, col.key)}
                        onPointerEnter={() => onCellEnter(row.month, col.key)}
                      >
                        {formatTrendCell(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          }
        />
      )}
    </div>
  );
}

const ORDER_TREND_CROSS_TABS = new Set(["industry-plan", "industry-channel"]);

export function SalesTrendView() {
  return (
    <TrendMatrixView
      title="세일즈 월간추이"
      subtitle={
        <>
          업종X요금제·업종X채널 탭에서는 업종을 <strong>1개 또는 여러 개</strong> 선택해 종합 데이터를 볼 수 있습니다.
          2025.12. 이전은 Raw 아카이브, 2026.01. 이후는 월별 동기화 데이터를 사용합니다.
        </>
      }
      tabs={TREND_TABS}
      crossTabIds={ORDER_TREND_CROSS_TABS}
      fetchTrend={api.erpSalesTrend}
      countLabel="신규센터"
      sheetLinkLabel="결제 주문 시트"
      emptyHint={
        <>신규센터 데이터가 없습니다. <strong>세일즈 동기화 → 결제 주문 내역</strong>에서 2026.01. 이후 월을 동기화하거나, 과거 Raw 데이터 적재가 필요합니다.</>
      }
    />
  );
}

export function SalesInquiryTrendView() {
  return (
    <TrendMatrixView
      title="문의 월간추이"
      subtitle={
        <>
          상품문의 DB(구분=신규문의) 기준 실시간 집계입니다. 모든 탭에서 업종을 <strong>1개 또는 여러 개</strong> 선택해 종합 데이터를 볼 수 있습니다.
          세일즈 동기화에서 문의 데이터를 갱신하면 바로 반영됩니다.
        </>
      }
      tabs={INQUIRY_TREND_TABS}
      crossTabIds={INQUIRY_TREND_CROSS_TABS}
      fetchTrend={api.erpSalesInquiryTrend}
      allowAll
      countLabel="신규문의"
      sheetLinkLabel="상품 문의 시트"
      emptyHint={
        <>신규문의 데이터가 없습니다. <strong>세일즈 동기화 → 상품 문의 관리</strong>에서 월 시트를 동기화해 주세요.</>
      }
    />
  );
}

const DASHBOARD_TABS = [
  { id: "channel", label: "채널별" },
  { id: "industry", label: "업종별" },
  { id: "industry-plan", label: "업종×요금제" },
  { id: "plan", label: "요금제별" },
  { id: "weekly", label: "주차별" },
];

function DashboardWeeklyMatrix({ title, rows, weekLabels, onRowClick }) {
  if (!rows?.length) return null;
  return (
    <div className="rate-plan-block">
      <div className="rate-plan-title">{title}</div>
      <div className="dash-table-wrap">
        <table className="dash-table dash-weekly-table">
          <thead>
            <tr>
              <th className="label">항목</th>
              {weekLabels.map((w) => <th key={w}>{w}</th>)}
              <th>월합</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={onRowClick ? "dash-drill-row" : ""}>
                <td className="label">
                  {onRowClick ? (
                    <button type="button" className="dash-drill-link" onClick={() => onRowClick(row.label)}>
                      {row.label}
                    </button>
                  ) : row.label}
                </td>
                {weekLabels.map((w, i) => (
                  <td key={w} className="num dash-weekly-cell">
                    <div className="actual">{row.actuals[i] ?? 0}</div>
                    {(row.goals[i] ?? 0) > 0 && (
                      <div className="goal small">목표 {row.goals[i]}</div>
                    )}
                  </td>
                ))}
                <td className="num">
                  <div>{row.monthActual}</div>
                  {row.monthGoal > 0 && <div className="small" style={{ color: "var(--muted)" }}>목표 {row.monthGoal}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardItemsTable({ title, labelHeader, items, showGoal = true }) {
  if (!items?.length) {
    return (
      <div className="rate-plan-block">
        <div className="rate-plan-title">{title}</div>
        <div className="small" style={{ padding: "12px 0", color: "var(--muted)" }}>데이터가 없습니다</div>
      </div>
    );
  }
  const totalGoal = items.reduce((s, r) => s + r.goal, 0);
  const totalActual = items.reduce((s, r) => s + r.actual, 0);
  const totalRate = totalGoal > 0 ? Math.round((totalActual / totalGoal) * 1000) / 10 : null;
  const totalGap = totalActual - totalGoal;
  const vizSeries = showGoal
    ? [
        { label: "목표", color: seriesColor(3), values: items.map((r) => r.goal) },
        { label: "현황", color: seriesColor(0), values: items.map((r) => r.actual) },
      ]
    : [{ label: "현황", color: seriesColor(0), values: items.map((r) => r.actual) }];
  const table = (
    <div className="rate-plan-block">
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th className="label">{labelHeader}</th>
              {showGoal && <th>목표</th>}
              <th>현황</th>
              {showGoal && <th>달성률</th>}
              <th>미달</th>
              <th>진행</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.key}>
                <td className="label">{row.label}</td>
                {showGoal && <td className="num">{row.goal || "-"}</td>}
                <td className="num">{row.actual}</td>
                {showGoal && (
                  <td className="num" style={{ color: dashRateColor(row.rate), fontWeight: 700 }}>
                    {formatDashRate(row.rate)}
                  </td>
                )}
                <td className={"num" + (showGoal && row.gap >= 0 ? " gap-pos" : showGoal ? " gap-neg" : "")}>
                  {showGoal ? formatDashGap(row.gap) : "-"}
                </td>
                <td className="dash-bar-cell">
                  <div className="dash-bar">
                    <div
                      className="dash-bar-fill"
                      style={{
                        width: `${Math.min(Math.max((showGoal ? row.rate : (row.actual > 0 ? 100 : 0)) ?? 0, 0), 100)}%`,
                        background: dashRateColor(showGoal ? row.rate : (row.actual > 0 ? 100 : null)),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            <tr style={{ background: "#FFF8F0" }}>
              <td className="label">합계</td>
              {showGoal && <td className="num">{totalGoal || "-"}</td>}
              <td className="num">{totalActual}</td>
              {showGoal && (
                <td className="num" style={{ color: dashRateColor(totalRate), fontWeight: 800 }}>
                  {formatDashRate(totalRate)}
                </td>
              )}
              <td className={"num" + (showGoal && totalGap >= 0 ? " gap-pos" : showGoal ? " gap-neg" : "")}>
                {showGoal ? formatDashGap(totalGap) : "-"}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <StatViz
      title={title}
      views={["table", "bar", "donut"]}
      format="number"
      categories={items.map((r) => r.label)}
      series={vizSeries}
      donutItems={items.map((r) => ({ label: r.label, value: r.actual }))}
      tableNode={table}
    />
  );
}

function DrillGoalTable({ title, labelHeader, items, editable, draft, onChange, industryGoal }) {
  const list = items || [];
  const sum = editable
    ? Object.values(draft).reduce((a, b) => a + (Number(b) || 0), 0)
    : list.reduce((a, r) => a + (r.goal || 0), 0);
  const remaining = industryGoal - sum;
  const over = industryGoal > 0 && sum > industryGoal;
  return (
    <div className="rate-plan-block">
      <div className="rate-plan-title">{title}</div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th className="label">{labelHeader}</th>
              <th>목표</th>
              <th>현황</th>
              <th>달성률</th>
              <th>미달</th>
              <th>진행</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => {
              const goal = editable ? (draft[row.label] ?? 0) : row.goal;
              const rate = goal > 0 ? Math.round((row.actual / goal) * 1000) / 10 : row.rate;
              const gap = row.actual - goal;
              const pct = goal > 0 ? Math.min(Math.max((row.actual / goal) * 100, 0), 100) : (row.actual > 0 ? 100 : 0);
              return (
                <tr key={row.label}>
                  <td className="label">{row.label}</td>
                  <td className="num">
                    {editable ? (
                      <input
                        className="dash-goal-input"
                        inputMode="numeric"
                        value={goalInputValue(draft[row.label] ?? 0)}
                        onChange={(e) => onChange(row.label, e.target.value)}
                      />
                    ) : (row.goal || "-")}
                  </td>
                  <td className="num">{row.actual}</td>
                  <td className="num" style={{ color: dashRateColor(goal > 0 ? rate : null), fontWeight: 700 }}>
                    {goal > 0 ? formatDashRate(rate) : "-"}
                  </td>
                  <td className={"num" + (goal > 0 ? (gap >= 0 ? " gap-pos" : " gap-neg") : "")}>
                    {goal > 0 ? formatDashGap(gap) : "-"}
                  </td>
                  <td className="dash-bar-cell">
                    <div className="dash-bar">
                      <div className="dash-bar-fill" style={{ width: `${pct}%`, background: dashRateColor(goal > 0 ? rate : (row.actual > 0 ? 100 : null)) }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className={"dash-goal-hint" + (over ? " dash-goal-mismatch" : "")}>
          {title} 목표 합계 <strong>{sum}</strong> / 업종 목표 {industryGoal}
          {industryGoal > 0 && (over ? ` · ${-remaining}개 초과` : ` · 남은 ${remaining}개`)}
        </div>
      )}
    </div>
  );
}

export function DashboardIndustryDrill({ industry, detail, onBack, currentPlanGoals, currentChannelGoals, onSaveGoals, saving }) {
  const summary = detail?.summary;
  const industryGoal = summary?.goal || 0;
  const [editing, setEditing] = useState(false);
  const [planDraft, setPlanDraft] = useState({});
  const [channelDraft, setChannelDraft] = useState({});

  const startEdit = () => {
    const pd = {};
    (detail?.plans || []).forEach((p) => { pd[p.label] = currentPlanGoals?.[p.label] ?? p.goal ?? 0; });
    const cd = {};
    (detail?.channels || []).forEach((c) => { cd[c.label] = currentChannelGoals?.[c.label] ?? c.goal ?? 0; });
    setPlanDraft(pd);
    setChannelDraft(cd);
    setEditing(true);
  };

  const cleanGoals = (o) => {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Math.max(0, Math.round(Number(v) || 0));
      if (n > 0) r[k] = n;
    }
    return r;
  };

  const save = () => {
    Promise.resolve(onSaveGoals(industry, cleanGoals(planDraft), cleanGoals(channelDraft))).then(() => setEditing(false));
  };

  return (
    <div className="dash-drill">
      <div className="dash-drill-hd">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← 업종 목록</button>
        <strong>{industry}</strong>
        {summary && (
          <span className="small">
            목표 {summary.goal} · 현황 {summary.actual} · {formatDashRate(summary.rate)}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {editing ? (
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>취소</button>
              <button type="button" className="btn btn-accent btn-sm" onClick={save} disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>목표 편집</button>
          )}
        </div>
      </div>
      {editing && (
        <div className="small" style={{ margin: "2px 0 10px", color: "var(--muted)", lineHeight: 1.5 }}>
          <strong>{industry}</strong> 업종 목표 <strong>{industryGoal}개</strong> 범위 안에서 요금제별·채널별 목표를 나눠 설정하세요.
        </div>
      )}
      <DrillGoalTable title="요금제별" labelHeader="요금제" items={detail?.plans} editable={editing} draft={planDraft} onChange={(label, v) => setPlanDraft((p) => ({ ...p, [label]: parseGoalInput(v) }))} industryGoal={industryGoal} />
      <DrillGoalTable title="채널별" labelHeader="채널" items={detail?.channels} editable={editing} draft={channelDraft} onChange={(label, v) => setChannelDraft((p) => ({ ...p, [label]: parseGoalInput(v) }))} industryGoal={industryGoal} />
      <DashboardItemsTable title="주차별" labelHeader="주차" items={detail?.weekly} />
    </div>
  );
}

function cloneGoalOverrides(data) {
  const src = data?.goalOverrides || {};
  const clone2 = (obj) => {
    const out = {};
    for (const [k, row] of Object.entries(obj || {})) out[k] = { ...row };
    return out;
  };
  return {
    industryGoals: { ...(src.industryGoals || {}) },
    industryPlanGoals: clone2(src.industryPlanGoals),
    industryChannelGoals: clone2(src.industryChannelGoals),
  };
}

function goalInputValue(value) {
  return value > 0 ? String(value) : "";
}

function parseGoalInput(value) {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function resolveIndustryGoal(draft, label, fallback = 0) {
  if (draft.industryGoals[label] != null) return draft.industryGoals[label];
  return fallback;
}

function sumDraftInboundGoal(draft, industryItems) {
  const labels = new Set([
    ...industryItems.map((it) => it.label),
    ...Object.keys(draft.industryGoals),
  ]);
  let sum = 0;
  for (const label of labels) {
    const item = industryItems.find((it) => it.label === label);
    sum += resolveIndustryGoal(draft, label, item?.goal ?? 0);
  }
  return sum;
}

function sumIndustryPlanRow(draft, industry) {
  const row = draft.industryPlanGoals[industry];
  if (!row) return 0;
  return Object.values(row).reduce((s, n) => s + (n || 0), 0);
}

function buildDraftWarnings(draft) {
  const warnings = [];
  const industries = new Set([
    ...Object.keys(draft.industryGoals),
    ...Object.keys(draft.industryPlanGoals),
  ]);
  for (const industry of industries) {
    const industryGoal = draft.industryGoals[industry] ?? 0;
    const planSum = sumIndustryPlanRow(draft, industry);
    if (planSum > 0 && industryGoal > 0 && planSum !== industryGoal) {
      warnings.push(`${industry}: 요금제 합계 ${planSum} ≠ 업종 목표 ${industryGoal}`);
    }
  }
  return warnings;
}

function dashRateColor(rate) {
  if (rate == null) return "#9AA0A6";
  if (rate >= 100) return "#0D7A3E";
  if (rate >= 70) return "#E37400";
  return "#C5221F";
}

function formatDashRate(rate) {
  if (rate == null) return "-";
  return `${rate}%`;
}

function formatDashGap(gap) {
  if (gap > 0) return `+${gap}`;
  return String(gap);
}

function GaugeRing({ rate, size = 132 }) {
  const pct = Math.min(Math.max(rate ?? 0, 0), 100);
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = dashRateColor(rate);
  return (
    <svg className="dash-gauge" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECEEF0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="46%" textAnchor="middle" fontSize="22" fontWeight="800" fill="currentColor">
        {rate != null ? `${Math.round(rate)}%` : "-"}
      </text>
      <text x="50%" y="60%" textAnchor="middle" fontSize="11" fill="#787774">
        달성률
      </text>
    </svg>
  );
}

export function SalesDashboardView() {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [tab, setTab] = useState("industry");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [draftGoals, setDraftGoals] = useState({ industryGoals: {}, industryPlanGoals: {} });
  const [savingGoals, setSavingGoals] = useState(false);
  const [drillIndustry, setDrillIndustry] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api.erpSalesDashboard({ month: selectedMonth || undefined })
      .then((res) => {
        setData(res);
        setDraftGoals(cloneGoalOverrides(res));
        setDrillIndustry(null);
      })
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const industrySection = useMemo(
    () => data?.sections?.find((s) => s.id === "industry"),
    [data]
  );

  const section = useMemo(() => {
    if (tab === "industry-plan" || tab === "weekly") return null;
    return data?.sections?.find((s) => s.id === tab) || data?.sections?.[0];
  }, [data, tab]);

  const draftWarnings = useMemo(() => buildDraftWarnings(draftGoals), [draftGoals]);
  const inboundGoal = useMemo(() => {
    if (editMode) return sumDraftInboundGoal(draftGoals, industrySection?.items || []);
    return data?.summary?.inboundGoal ?? data?.summary?.totalGoal ?? 0;
  }, [editMode, draftGoals, industrySection, data]);

  const startEdit = () => {
    setDraftGoals(cloneGoalOverrides(data));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setDraftGoals(cloneGoalOverrides(data));
    setEditMode(false);
  };

  const saveGoals = () => {
    if (!data?.month) return;
    setSavingGoals(true);
    api.erpSalesDashboardGoals({
      month: data.month,
      industryGoals: draftGoals.industryGoals,
      industryPlanGoals: draftGoals.industryPlanGoals,
      industryChannelGoals: draftGoals.industryChannelGoals,
    })
      .then((res) => {
        setData(res);
        setDraftGoals(cloneGoalOverrides(res));
        setEditMode(false);
      })
      .catch(notifyError)
      .finally(() => setSavingGoals(false));
  };

  // 드릴다운(업종 내부)에서 요금제별·채널별 목표를 그 업종 총 목표 범위 내에서 저장
  const saveDrillGoals = (industry, planGoals, channelGoals) => {
    if (!data?.month) return Promise.resolve();
    const base = cloneGoalOverrides(data);
    base.industryPlanGoals[industry] = planGoals;
    base.industryChannelGoals[industry] = channelGoals;
    setSavingGoals(true);
    return api.erpSalesDashboardGoals({
      month: data.month,
      industryGoals: base.industryGoals,
      industryPlanGoals: base.industryPlanGoals,
      industryChannelGoals: base.industryChannelGoals,
    })
      .then((res) => {
        setData(res);
        setDraftGoals(cloneGoalOverrides(res));
        toastSuccess("목표를 저장했어요");
      })
      .catch(notifyError)
      .finally(() => setSavingGoals(false));
  };

  const setIndustryGoal = (label, value) => {
    setDraftGoals((prev) => ({
      ...prev,
      industryGoals: { ...prev.industryGoals, [label]: parseGoalInput(value) },
    }));
  };

  const setIndustryPlanGoal = (industry, plan, value) => {
    const goal = parseGoalInput(value);
    setDraftGoals((prev) => {
      const row = { ...(prev.industryPlanGoals[industry] || {}) };
      if (goal > 0) row[plan] = goal;
      else delete row[plan];
      return {
        ...prev,
        industryPlanGoals: { ...prev.industryPlanGoals, [industry]: row },
      };
    });
  };

  const drillDetail = drillIndustry ? data?.industryDrilldowns?.[drillIndustry] : null;

  const openIndustryDrill = (industry) => {
    if (editMode || !data?.industryDrilldowns?.[industry]) return;
    setDrillIndustry(industry);
  };

  const months = data?.months || [];

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">세일즈 계기판</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        월별 목표는 <strong>대시보드 시트</strong>에서 불러오며, 앱에서 수정한 목표는 <strong>DB에 저장</strong>됩니다. (시트에는 아직 자동 반영되지 않음)
        현황은 결제 주문 DB의 <strong>신규센터</strong> 건수입니다. <strong>업종</strong>을 누르면 요금제·채널·주차별 상세를 볼 수 있습니다.
        {data?.spreadsheetUrl && (
          <>{" "}<a href={data.spreadsheetUrl} target="_blank" rel="noreferrer">목표 시트</a></>
        )}
        {data?.goalsCustomized && !editMode && (
          <> · <strong>앱 수정 목표 적용 중</strong></>
        )}
        {data?.syncedThrough && (
          <> · 주문 동기화: <strong>{data.syncedThrough}</strong></>
        )}
      </div>

      {months.length > 0 && (
        <div className="dash-month-picks">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              className={"dash-month-chip" + (data?.month === m ? " on" : "")}
              onClick={() => setSelectedMonth(m)}
            >
              {m.replace(/\.$/, "")}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : !data ? (
        <div className="small" style={{ textAlign: "center", padding: 40 }}>데이터가 없습니다</div>
      ) : (
        <>
          <div className="dash-summary">
            <div className="dash-summary-card">
              <div className="dash-gauge-wrap">
                <GaugeRing rate={data.summary.rate} />
              </div>
              <div className="dash-stats">
                <div className="dash-stat">
                  <div className="lbl">월</div>
                  <div className="val">{data.monthLabel}</div>
                </div>
                <div className="dash-stat">
                  <div className="lbl">인바운드 목표</div>
                  <div className="val">{inboundGoal}</div>
                </div>
                <div className="dash-stat">
                  <div className="lbl">전체 목표</div>
                  <div className="val">{data.summary.totalGoal}</div>
                </div>
                <div className="dash-stat">
                  <div className="lbl">현황 (DB)</div>
                  <div className={"val" + (data.summary.gap >= 0 ? " pos" : " neg")}>{data.summary.actual}</div>
                </div>
                <div className="dash-stat">
                  <div className="lbl">미달</div>
                  <div className={"val" + (data.summary.gap >= 0 ? " pos" : " neg")}>
                    {formatDashGap(data.summary.gap)}
                  </div>
                </div>
                {(data.summary.remainingDays != null || data.summary.remainingBusinessDays != null) && (
                  <>
                    <div className="dash-stat">
                      <div className="lbl">잔여일</div>
                      <div className="val">{data.summary.remainingDays ?? "-"}</div>
                    </div>
                    <div className="dash-stat">
                      <div className="lbl">잔여 영업일</div>
                      <div className="val">{data.summary.remainingBusinessDays ?? "-"}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="sales-toolbar" style={{ marginTop: 0 }}>
            {!editMode ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={startEdit}>목표 편집</button>
            ) : (
              <>
                <button type="button" className="btn btn-sm btn-accent" onClick={saveGoals} disabled={savingGoals}>
                  {savingGoals ? "저장 중…" : "목표 저장"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={cancelEdit} disabled={savingGoals}>취소</button>
              </>
            )}
          </div>

          {(editMode ? draftWarnings : data.goalWarnings)?.length > 0 && (
            <div className="dash-goal-warn small">
              {(editMode ? draftWarnings : data.goalWarnings).map((w) => <div key={w}>{w}</div>)}
            </div>
          )}

          {editMode && (
            <div className="small dash-goal-hint">
              1) <strong>업종별</strong>에서 업종 목표를 정하고 → 2) <strong>업종×요금제</strong>에서 요금제별로 나눠 합계가 맞게 세팅하세요.
            </div>
          )}

          {drillIndustry && drillDetail ? (
            <DashboardIndustryDrill
              industry={drillIndustry}
              detail={drillDetail}
              onBack={() => setDrillIndustry(null)}
              currentPlanGoals={data?.goalOverrides?.industryPlanGoals?.[drillIndustry]}
              currentChannelGoals={data?.goalOverrides?.industryChannelGoals?.[drillIndustry]}
              onSaveGoals={saveDrillGoals}
              saving={savingGoals}
            />
          ) : (
          <>
          <div className="sales-tabs">
            {DASHBOARD_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"sales-tab" + (tab === t.id ? " on" : "")}
                onClick={() => { setTab(t.id); setDrillIndustry(null); }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!section?.items?.length && tab !== "industry-plan" && tab !== "weekly" ? (
            <div className="small" style={{ textAlign: "center", padding: 32 }}>표시할 항목이 없습니다</div>
          ) : tab === "weekly" ? (
            <>
              {!data.weekly?.weekLabels?.length ? (
                <div className="small" style={{ textAlign: "center", padding: 32 }}>주차별 데이터가 없습니다</div>
              ) : (
                <>
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th className="label">주차</th>
                          <th>목표</th>
                          <th>현황</th>
                          <th>달성률</th>
                          <th>미달</th>
                          <th>진행</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.weekly.summary || []).map((row) => (
                          <tr key={row.key}>
                            <td className="label">{row.label}</td>
                            <td className="num">{row.goal}</td>
                            <td className="num">{row.actual}</td>
                            <td className="num" style={{ color: dashRateColor(row.rate), fontWeight: 700 }}>
                              {formatDashRate(row.rate)}
                            </td>
                            <td className={"num" + (row.gap >= 0 ? " gap-pos" : " gap-neg")}>
                              {formatDashGap(row.gap)}
                            </td>
                            <td className="dash-bar-cell">
                              <div className="dash-bar">
                                <div
                                  className="dash-bar-fill"
                                  style={{
                                    width: `${Math.min(Math.max(row.rate ?? 0, 0), 100)}%`,
                                    background: dashRateColor(row.rate),
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background: "#FFF8F0" }}>
                          <td className="label">월합</td>
                          <td className="num">
                            {(data.weekly.summary || []).reduce((s, r) => s + r.goal, 0)}
                          </td>
                          <td className="num">{data.summary.actual}</td>
                          <td className="num" colSpan={3} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <DashboardWeeklyMatrix title="채널별 주차 현황" rows={data.weekly.channel} weekLabels={data.weekly.weekLabels} />
                  <DashboardWeeklyMatrix
                    title="업종별 주차 현황"
                    rows={data.weekly.industry}
                    weekLabels={data.weekly.weekLabels}
                    onRowClick={(industry) => openIndustryDrill(industry)}
                  />
                  <DashboardWeeklyMatrix title="요금제별 주차 현황" rows={data.weekly.plan} weekLabels={data.weekly.weekLabels} />
                </>
              )}
            </>
          ) : tab === "industry-plan" ? (
            <div className="dash-table-wrap">
              <table className="dash-table dash-matrix-table">
                <thead>
                  <tr>
                    <th className="label">업종</th>
                    <th>업종목표</th>
                    <th>요금제합</th>
                    <th>현황</th>
                    {(data.industryPlan?.plans || []).map((plan) => (
                      <th key={plan}>{plan}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.industryPlan?.rows || []).map((row) => {
                    const industryGoal = editMode
                      ? resolveIndustryGoal(draftGoals, row.industry, row.industryGoal)
                      : row.industryGoal;
                    const planSum = editMode
                      ? sumIndustryPlanRow(draftGoals, row.industry)
                      : row.planGoalSum;
                    const mismatch = industryGoal > 0 && planSum > 0 && industryGoal !== planSum;
                    return (
                      <tr key={row.industry} className={mismatch ? "dash-goal-mismatch" : ""}>
                        <td className="label">
                          {!editMode && data?.industryDrilldowns?.[row.industry] ? (
                            <button type="button" className="dash-drill-link" onClick={() => openIndustryDrill(row.industry)}>
                              {row.industry}
                            </button>
                          ) : row.industry}
                        </td>
                        <td className="num">
                          {editMode ? (
                            <input
                              className="dash-goal-input"
                              type="number"
                              min="0"
                              value={goalInputValue(industryGoal)}
                              onChange={(e) => setIndustryGoal(row.industry, e.target.value)}
                            />
                          ) : industryGoal}
                        </td>
                        <td className={"num" + (mismatch ? " gap-neg" : "")}>{planSum}</td>
                        <td className="num">{row.actual}</td>
                        {(data.industryPlan?.plans || []).map((plan) => {
                          const cell = row.cells.find((c) => c.plan === plan);
                          const goal = editMode
                            ? (draftGoals.industryPlanGoals[row.industry]?.[plan] ?? 0)
                            : (cell?.goal ?? 0);
                          return (
                            <td key={plan} className="num dash-matrix-cell">
                              {editMode ? (
                                <input
                                  className="dash-goal-input"
                                  type="number"
                                  min="0"
                                  value={goalInputValue(goal)}
                                  onChange={(e) => setIndustryPlanGoal(row.industry, plan, e.target.value)}
                                />
                              ) : (
                                <>
                                  <div>{goal || "-"}</div>
                                  <div className="small" style={{ color: "var(--muted)" }}>{cell?.actual ?? 0}</div>
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#FFF8F0" }}>
                    <td className="label">합계</td>
                    <td className="num">{inboundGoal}</td>
                    <td className="num">
                      {(data.industryPlan?.rows || []).reduce((s, row) => s + (editMode ? sumIndustryPlanRow(draftGoals, row.industry) : row.planGoalSum), 0)}
                    </td>
                    <td className="num">{data.industryPlan?.total?.actual ?? 0}</td>
                    {(data.industryPlan?.plans || []).map((plan) => (
                      <td key={plan} className="num">
                        {(data.industryPlan?.rows || []).reduce((s, row) => {
                          const cell = row.cells.find((c) => c.plan === plan);
                          const goal = editMode
                            ? (draftGoals.industryPlanGoals[row.industry]?.[plan] ?? 0)
                            : (cell?.goal ?? 0);
                          return s + goal;
                        }, 0) || "-"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th className="label">{section.label}</th>
                    <th>목표</th>
                    <th>현황</th>
                    <th>달성률</th>
                    <th>미달</th>
                    <th>진행</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((row) => {
                    const goal = editMode && tab === "industry"
                      ? resolveIndustryGoal(draftGoals, row.label, row.goal)
                      : row.goal;
                    const rate = goal > 0 ? Math.round((row.actual / goal) * 1000) / 10 : null;
                    const gap = row.actual - goal;
                    return (
                    <tr key={row.key} className={tab === "industry" && !editMode && data?.industryDrilldowns?.[row.label] ? "dash-drill-row" : ""}>
                      <td className="label">
                        {tab === "industry" && !editMode && data?.industryDrilldowns?.[row.label] ? (
                          <button type="button" className="dash-drill-link" onClick={() => openIndustryDrill(row.label)}>
                            {row.label}
                          </button>
                        ) : row.label}
                      </td>
                      <td className="num">
                        {editMode && tab === "industry" ? (
                          <input
                            className="dash-goal-input"
                            type="number"
                            min="0"
                            value={goalInputValue(goal)}
                            onChange={(e) => setIndustryGoal(row.label, e.target.value)}
                          />
                        ) : goal}
                      </td>
                      <td className="num">{row.actual}</td>
                      <td className="num" style={{ color: dashRateColor(rate), fontWeight: 700 }}>
                        {formatDashRate(rate)}
                      </td>
                      <td className={"num" + (gap >= 0 ? " gap-pos" : " gap-neg")}>
                        {formatDashGap(gap)}
                      </td>
                      <td className="dash-bar-cell">
                        <div className="dash-bar" title={formatDashRate(rate)}>
                          <div
                            className="dash-bar-fill"
                            style={{
                              width: `${Math.min(Math.max(rate ?? 0, 0), 100)}%`,
                              background: dashRateColor(rate),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  <tr style={{ background: "#FFF8F0" }}>
                    <td className="label">합계</td>
                    <td className="num">{tab === "industry" && editMode ? inboundGoal : section.total.goal}</td>
                    <td className="num">{section.total.actual}</td>
                    <td className="num" style={{ color: dashRateColor(section.total.rate), fontWeight: 800 }}>
                      {formatDashRate(section.total.rate)}
                    </td>
                    <td className={"num" + (section.total.gap >= 0 ? " gap-pos" : " gap-neg")}>
                      {formatDashGap(section.total.gap)}
                    </td>
                    <td className="dash-bar-cell">
                      <div className="dash-bar">
                        <div
                          className="dash-bar-fill"
                          style={{
                            width: `${Math.min(Math.max(section.total.rate ?? 0, 0), 100)}%`,
                            background: dashRateColor(section.total.rate),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}

function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function todayDateKeyKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function SalesDailyView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hideZero, setHideZero] = useState(true);
  const [period, setPeriod] = useState("day");
  const [anchorDate, setAnchorDate] = useState(todayDateKeyKst);
  const [drill, setDrill] = useState(null);

  const openDrill = (title, kind, items) => {
    if (!items || !items.length) return;
    setDrill({
      title,
      kindLabel: kind === "inquiry" ? "문의 요금제 분포" : "실결제 상품 분포",
      total: items.reduce((a, b) => a + b.count, 0),
      items,
    });
  };

  const load = useCallback(() => {
    setLoading(true);
    api.erpSalesDaily({ date: anchorDate, period })
      .then(setData)
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [anchorDate, period]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    if (!hideZero) return rows;
    return rows.filter((r) => r.inquiries > 0 || r.orders > 0);
  }, [data, hideZero]);

  const periodLabel = period === "day" ? "금일" : period === "week" ? "주간" : "월간";
  const countLabel = period === "day" ? "금일" : "기간";

  const goToday = () => {
    setPeriod("day");
    setAnchorDate(todayDateKeyKst());
  };

  const shiftAnchorDate = (days) => {
    setAnchorDate((prev) => addDaysToDateKey(prev, days));
  };

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">문의/결제 대시보드</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        업종별 문의·결제 건수입니다. 기본은 <strong>금일</strong>이며 일/주/월 단위로 조회할 수 있습니다. 주간은 <strong>일요일~토요일</strong> 기준입니다.
        문의는 <strong>{data?.inquirySource || "상품 문의 관리"}</strong> ({data?.inquiryFilter || "신규문의"}),
        결제는 <strong>{data?.orderSource || "결제 주문 내역"}</strong> ({data?.orderFilter || "신규센터"}) 기준입니다.
      </div>

      <div className="daily-toolbar">
        <div className="daily-period-tabs">
          {[
            { id: "day", label: "일" },
            { id: "week", label: "주" },
            { id: "month", label: "월" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={"daily-period-tab" + (period === t.id ? " on" : "")}
              onClick={() => setPeriod(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>기준일</label>
          <div className="daily-date-nav">
            <button type="button" aria-label="이전 날" onClick={() => shiftAnchorDate(-1)}>‹</button>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
            <button type="button" aria-label="다음 날" onClick={() => shiftAnchorDate(1)}>›</button>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>오늘</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>새로고침</button>
        <button
          type="button"
          className={"btn btn-sm" + (hideZero ? " btn-accent" : " btn-ghost")}
          onClick={() => setHideZero((v) => !v)}
        >
          {hideZero ? "0 숨김" : "0 표시"}
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : !data ? (
        <div className="small" style={{ textAlign: "center", padding: 40 }}>데이터가 없습니다</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <span className="small" style={{ fontWeight: 800, fontSize: 15 }}>{data.rangeLabel}</span>
            {data.period !== "day" && (
              <span className="small" style={{ marginLeft: 8, color: "var(--muted)" }}>
                ({periodLabel} · 일~토 · {data.startDate} ~ {data.endDate})
              </span>
            )}
            {(data.syncedInquiryThrough || data.syncedOrderThrough) && (
              <span className="small" style={{ display: "block", marginTop: 4, color: "var(--muted)" }}>
                동기화: 문의 {data.syncedInquiryThrough || "-"} · 결제 {data.syncedOrderThrough || "-"}
              </span>
            )}
          </div>

          <div className="daily-summary">
            <button
              type="button"
              className="daily-stat inquiry"
              onClick={() => openDrill(`전체 · ${countLabel} 문의`, "inquiry", data.totals.inquiryPlans)}
            >
              <div className="lbl">{countLabel} 문의</div>
              <div className="val">{data.totals.inquiries}</div>
              {data.totals.inquiryPlans?.length > 0 && <div className="daily-stat-hint">요금제 보기 →</div>}
            </button>
            <button
              type="button"
              className="daily-stat order"
              onClick={() => openDrill(`전체 · ${countLabel} 결제`, "order", data.totals.orderProducts)}
            >
              <div className="lbl">{countLabel} 결제</div>
              <div className="val">{data.totals.orders}</div>
              {data.totals.orderProducts?.length > 0 && <div className="daily-stat-hint">상품 보기 →</div>}
            </button>
          </div>

          {!visibleRows.length ? (
            <div className="small" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
              선택한 기간에 집계된 업종별 데이터가 없습니다. 세일즈 동기화에서 해당 월 시트를 확인해 주세요.
            </div>
          ) : (
            <StatViz
              views={["table", "bar", "donut"]}
              format="number"
              categories={visibleRows.map((r) => r.industry)}
              series={[
                { label: "문의", color: seriesColor(1), values: visibleRows.map((r) => r.inquiries) },
                { label: "결제", color: seriesColor(0), values: visibleRows.map((r) => r.orders) },
              ]}
              donutItems={visibleRows.map((r) => ({ label: r.industry, value: r.orders }))}
              tableNode={
                <div className="daily-table-wrap">
                  <table className="daily-table">
                    <thead>
                      <tr>
                        <th className="industry">업종</th>
                        <th>문의</th>
                        <th>결제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.industry}>
                          <td className="industry">{row.industry}</td>
                          <td className={"num" + (row.inquiries === 0 ? " zero" : "")}>
                            {row.inquiries > 0 ? (
                              <button type="button" className="daily-cell-btn" onClick={() => openDrill(`${row.industry} · 문의`, "inquiry", row.inquiryPlans)}>{row.inquiries}</button>
                            ) : row.inquiries}
                          </td>
                          <td className={"num" + (row.orders === 0 ? " zero" : "")}>
                            {row.orders > 0 ? (
                              <button type="button" className="daily-cell-btn" onClick={() => openDrill(`${row.industry} · 결제`, "order", row.orderProducts)}>{row.orders}</button>
                            ) : row.orders}
                          </td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td className="industry">합계</td>
                        <td className="num">
                          {data.totals.inquiries > 0 ? (
                            <button type="button" className="daily-cell-btn" onClick={() => openDrill("전체 · 문의", "inquiry", data.totals.inquiryPlans)}>{data.totals.inquiries}</button>
                          ) : data.totals.inquiries}
                        </td>
                        <td className="num">
                          {data.totals.orders > 0 ? (
                            <button type="button" className="daily-cell-btn" onClick={() => openDrill("전체 · 결제", "order", data.totals.orderProducts)}>{data.totals.orders}</button>
                          ) : data.totals.orders}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              }
            />
          )}
        </>
      )}

      {drill && (
        <div className="daily-drill-back" onClick={() => setDrill(null)}>
          <div className="daily-drill" onClick={(e) => e.stopPropagation()}>
            <div className="daily-drill-hd">
              <div style={{ minWidth: 0 }}>
                <div className="daily-drill-eyebrow">{drill.kindLabel}</div>
                <div className="daily-drill-title">{drill.title} · 총 {drill.total}건</div>
              </div>
              <button type="button" className="daily-drill-x" aria-label="닫기" onClick={() => setDrill(null)}>✕</button>
            </div>
            <div className="daily-drill-list">
              {drill.items.map((it) => (
                <div key={it.label} className="daily-drill-row">
                  <span className="daily-drill-label">{it.label}</span>
                  <div className="daily-drill-bar">
                    <div className="daily-drill-fill" style={{ width: `${Math.round((it.count / (drill.items[0]?.count || 1)) * 100)}%` }} />
                  </div>
                  <span className="daily-drill-count">{it.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
