import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { erpIcons as I } from "./icons.jsx";
import { APPROVAL_BOXES, LEAVE_TYPES, LEAVE_POLICY, APPROVAL_CHAINS, FORM_CHAIN_HINT, EMPLOYEE_ROLES, REFUND_TYPES, PAYMENT_METHODS, REFUND_METHODS, EMPTY_REFUND_FORM } from "./config.js";
import { notifyError, toastSuccess } from "../toast.js";

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
      {notes.map((n) => (
        <div key={n.id} className="list-item" role="button" tabIndex={0} onClick={() => openView(n)} onKeyDown={(e) => { if (e.key === "Enter") openView(n); }} style={{ cursor: "pointer" }}>
          <div style={{ flex: 1 }}>
            <div className="ttl">{n.title}</div>
            <div className="meta">
              {new Date(n.startsAt).toLocaleString("ko-KR")}
              {n.place ? ` · ${n.place}` : ""}
            </div>
          </div>
          {I.chevron({})}
        </div>
      ))}
      {!notes.length && <div className="small" style={{ textAlign: "center", padding: 40 }}>회의록이 없습니다</div>}
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

const RATE_STORAGE_KEY = "erp.sales.paymentRate.v3";

export function MembersView() {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.erpMembers().then(setMembers).catch(notifyError).finally(() => setLoading(false));
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

  const statusLabel = (s) => ({ pending: "승인 대기", approved: "승인됨", rejected: "거절" }[s] || s);

  if (loading) return <div className="spinner" />;

  const pending = members.filter((m) => m.memberStatus === "pending");

  return (
    <div className="fade pad" style={{ marginTop: 8, paddingBottom: 40, maxWidth: 720 }}>
      <div className="h-eyebrow">Access</div>
      <div className="h-title">멤버 관리</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        초대한 사람만 가입할 수 있고, 승인한 멤버만 ERP를 이용합니다.
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field"><label>이메일 초대</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        <div className="field"><label>이름 (선택)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        <button type="button" className="btn btn-accent" onClick={invite}>초대하기</button>
      </div>

      {pending.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="h-eyebrow">승인 대기 {pending.length}명</div>
          {pending.map((m) => (
            <div key={m.id} className="list-item between" style={{ alignItems: "center" }}>
              <div>
                <div className="ttl">{m.name || m.email}</div>
                <div className="meta">{m.email}{m.hasAccount ? " · 가입 완료" : " · 가입 전"}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-accent btn-sm" onClick={() => api.erpApproveMember(m.id).then(load).catch(notifyError)}>승인</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.erpRejectMember(m.id).then(load).catch(notifyError)}>거절</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="h-eyebrow">전체 멤버 {members.length}명</div>
        {members.map((m) => (
          <div key={m.id} className="list-item">
            <div className="ttl">{m.name || m.email}</div>
            <div className="meta">{m.email} · {statusLabel(m.memberStatus)} · {m.hasAccount ? "계정 있음" : "미가입"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const GROUP_PRESETS = [
  { id: "current", label: "당월", pick: (months, current) => (current ? [current] : []) },
  { id: "prev", label: "지난달", pick: (months, current) => {
    const idx = months.indexOf(current);
    return idx >= 0 && idx < months.length - 1 ? [months[idx + 1]] : [];
  }},
  { id: "last3", label: "직전 3개월", pick: (months) => months.slice(0, 3) },
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
  const last3 = months.slice(0, 3);
  if (last3.length > 1) {
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

function saveGroups(groups, industry, selectedChannels) {
  localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify({ groups, industry, selectedChannels }));
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

export function PaymentRateView() {
  const [meta, setMeta] = useState(null);
  const [groups, setGroups] = useState([]);
  const [industry, setIndustry] = useState("");
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [monthQ, setMonthQ] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  const currentMonthSheet = useMemo(() => {
    const now = new Date();
    const sheet = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
    return meta?.months?.includes(sheet) ? sheet : meta?.months?.[0] || "";
  }, [meta]);

  const filteredMonths = useMemo(() => {
    const q = monthQ.trim();
    return (meta?.months || []).filter((m) => !q || m.includes(q) || monthShortLabel(m).includes(q));
  }, [meta, monthQ]);

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
          if (prefs?.industry) setIndustry(prefs.industry);
          if (Array.isArray(prefs?.selectedChannels)) setSelectedChannels(prefs.selectedChannels);
        } catch { /* */ }
      })
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, []);

  const runCompute = useCallback(() => {
    const valid = groups.filter((g) => g.months.length > 0);
    if (!valid.length) return notifyError(new Error("비교군에 월을 1개 이상 선택하세요"));
    setComputing(true);
    saveGroups(groups, industry, selectedChannels);
    api.erpPaymentRate({
      industry: industry || undefined,
      channels: selectedChannels.length ? selectedChannels : undefined,
      groups: valid.map((g) => ({ id: g.id, label: g.label, months: g.months })),
    })
      .then(setResult)
      .catch(notifyError)
      .finally(() => setComputing(false));
  }, [groups, industry, selectedChannels]);

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
  const noData = result?.rows?.find((r) => r.key === "inquiries")?.values?.every((v) => !v);
  const hasEmpty = groups.some((g) => !g.months.length);

  if (loading) return <div className="spinner" />;

  return (
    <div className="fade pad rate-page" style={{ marginTop: 8, paddingBottom: 40 }}>
      <div className="h-eyebrow">Sales</div>
      <div className="h-title">당월 결제율</div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        비교군을 1개 이상 추가하고 월을 선택한 뒤 <strong>조회</strong>하세요.
      </div>

      <div className="card rate-simple-filters">
        <div className="rate-simple-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>업종</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">전체</option>
              {(meta?.industries || []).map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>월 검색</label>
            <input value={monthQ} onChange={(e) => setMonthQ(e.target.value)} placeholder="2026.07" />
          </div>
        </div>
      </div>

      {meta?.channelTree && (
        <ChannelTreeFilter
          tree={meta.channelTree}
          selected={selectedChannels}
          onChange={setSelectedChannels}
        />
      )}

      <div className="sales-toolbar" style={{ marginTop: 10 }}>
        <span className="small" style={{ fontWeight: 700 }}>비교군 {groups.length}개</span>
        {GROUP_PRESETS.map((p) => (
          <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => addGroup(p)}>+ {p.label}</button>
        ))}
        <button type="button" className="btn btn-accent btn-sm" onClick={() => addGroup(null)}>+ 빈 비교군</button>
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
              {filteredMonths.map((m) => (
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
              className={"btn btn-sm" + (showPlans ? " btn-accent" : " btn-ghost")}
              onClick={() => setShowPlans((v) => !v)}
            >
              {showPlans ? "요금제별 숨기기" : "요금제별 상세"}
            </button>
          </div>

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
    </div>
  );
}
