import React, { useState, useEffect, useCallback } from "react";
import AuthScreen from "../components/AuthScreen.jsx";
import KbEditor, { KbReadView } from "../components/KbEditor.jsx";
import KnowledgeFeed from "../components/KnowledgeFeed.jsx";
import ShareSheet from "../components/ShareSheet.jsx";
import FileViewerOverlay from "../components/FileViewerOverlay.jsx";
import ToastHost from "../components/ToastHost.jsx";
import ConfirmHost from "../components/ConfirmHost.jsx";
import { api, loadToken, saveToken, clearToken, setToken, isAuthError } from "../api/client.js";
import { kbToUi, kbCategories } from "../mappers.js";
import { userPreferences } from "../preferences.js";
import { ERP_CSS } from "./erpStyles.js";
import { ERP_MODULES, ERP_ADMIN_MODULES } from "./config.js";
import { erpIcons as I } from "./icons.jsx";
import { MeetingNotesView, OkrView, SalesSyncView, PaymentRateView, SalesTrendView, SalesInquiryTrendView, SalesDashboardView, MarketingDashboardView, BrojDashboardView, RevenueView, SalesDailyView, TaxInvoiceView, ConstructionView, VendorsView, InstallScheduleView, ConsultDocsView, MembersView, DailyReportView } from "./modules.jsx";

function NavBtn({ on, icon, label, onClick, hidden, layout = "side" }) {
  const cls = layout === "side" ? "sidenavitem" : "sidenavitem";
  return (
    <button type="button" className={cls + (on ? " on" : "") + (hidden ? " sidenav-hide" : "")} title={label} onClick={onClick}>
      {icon({ width: 20, height: 20 })}<span>{label}</span>
    </button>
  );
}

const ERP_OWNER_EMAIL = "matthew@broj.company";
const ERP_EXEC_EMAILS = new Set(["david@broj.company", "matthew@broj.company"]);

function isErpExec(user) {
  return ERP_EXEC_EMAILS.has((user?.email || "").trim().toLowerCase());
}

function canAccessErpAdmin(user) {
  if (user?.erpAccess?.canManageMembers) return true;
  return (user?.email || "").trim().toLowerCase() === ERP_OWNER_EMAIL;
}

function erpModuleLabel(id) {
  return ERP_MODULES.find((m) => m.id === id)?.label
    || ERP_ADMIN_MODULES.find((m) => m.id === id)?.label
    || "ERP";
}

function ErpNav({ tab, kbView, onSelect, onLogout, user, hiddenIds, collapsedGroups, onToggleGroup }) {
  const showAdmin = canAccessErpAdmin(user);
  const items = ERP_MODULES.filter((m) => (!m.ownerOnly || user?.erpAccess?.isOwner) && (!m.execOnly || isErpExec(user)) && !(m.consultGate && !hiddenIds?.consultVisible));
  // 그룹 헤더가 있는 그룹만 접기 대상 (지식경영 등 헤더 없는 항목은 항상 표시)
  const collapsibleGroups = new Set(items.filter((m) => m.groupLabel).map((m) => m.group));
  const isClosed = (g) => collapsibleGroups.has(g) && (collapsedGroups || []).includes(g);
  return (
    <>
      <div className="sidenav-top">
        {items.map((m, i, arr) => {
          const prev = arr[i - 1];
          const showGroup = m.groupLabel && m.groupLabel !== prev?.groupLabel;
          const closed = isClosed(m.group);
          const groupHasActive = closed && arr.some((x) => x.group === m.group && x.id === tab && !kbView);
          return (
            <React.Fragment key={m.id}>
              {showGroup && (
                <button
                  type="button"
                  className={"sidenav-group sidenav-group-toggle" + (groupHasActive ? " has-on" : "")}
                  onClick={() => onToggleGroup?.(m.group)}
                  title={closed ? "펼치기" : "접기"}
                >
                  <span>{m.groupLabel}</span>
                  <span className="chev">{closed ? "▸" : "▾"}</span>
                </button>
              )}
              <NavBtn
                on={tab === m.id && !kbView}
                icon={I[m.icon] || I.book}
                label={m.label}
                hidden={closed}
                onClick={() => onSelect(m.id)}
              />
            </React.Fragment>
          );
        })}
      </div>
      {showAdmin && (
        <div className="sidenav-admin">
          <div className="sidenav-group">관리</div>
          {ERP_ADMIN_MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"sidenavitem sidenav-subitem" + (tab === m.id && !kbView ? " on" : "")}
              onClick={() => onSelect(m.id)}
            >
              {(I[m.icon] || I.gear)({ width: 18, height: 18 })}<span>{m.label}</span>
            </button>
          ))}
        </div>
      )}
      {onLogout && (
        <div className="mobile-drawer-foot" style={{ marginTop: 12, borderTop: "none", paddingTop: 0 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: 0, minHeight: 0, fontSize: 13 }}
            onClick={onLogout}
          >
            로그아웃
          </button>
        </div>
      )}
    </>
  );
}

function enrichErpUser(user) {
  if (!user) return user;
  if (user.erpAccess) return user;
  if (canAccessErpAdmin(user)) {
    return { ...user, erpAccess: { status: "approved", isOwner: true, isSuperAdmin: true, canManageMembers: true } };
  }
  return user;
}

export default function ErpApp() {
  const [boot, setBoot] = useState("loading");
  const [bootError, setBootError] = useState("");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("kb");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try { return localStorage.getItem("erp_side_collapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => setSideCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem("erp_side_collapsed", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem("erp_groups_collapsed") || "[]"); } catch { return []; }
  });
  const toggleGroup = (g) => setCollapsedGroups((prev) => {
    const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
    try { localStorage.setItem("erp_groups_collapsed", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [kbArticles, setKbArticles] = useState([]);
  const [kbView, setKbView] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [fileViewer, setFileViewer] = useState(null);
  const [consultVisible, setConsultVisible] = useState(false); // 상담자료 컨펌 메뉴 노출 (세일즈팀·CEO·COO)

  useEffect(() => {
    if (boot !== "app") return;
    api.erpConsultAccess().then((a) => setConsultVisible(!!a?.visible)).catch(() => setConsultVisible(false));
  }, [boot]);

  const loadKb = useCallback(async () => {
    const kb = await api.listKb();
    setKbArticles((kb || []).map(kbToUi));
  }, []);

  const loadAppData = useCallback(async () => {
    await loadKb();
  }, [loadKb]);

  const restoreSession = useCallback(async () => {
    const t = loadToken();
    if (t) setToken(t);
    setBoot("loading");
    setBootError("");
    try {
      const { user: raw } = await api.me();
      const u = enrichErpUser(raw);
      setUser(u);
      if (u.erpAccess?.status === "pending") {
        setBoot("pending");
        return;
      }
      if (u.erpAccess?.status === "rejected" || u.erpAccess?.status === "none") {
        clearToken();
        setBoot("auth");
        setBootError("접근 권한이 없습니다. 관리자에게 초대를 요청하세요.");
        return;
      }
      if (!u.onboardingDone) {
        await api.completeOnboarding();
        const { user: u2raw } = await api.me();
        setUser(enrichErpUser(u2raw));
      }
      await loadAppData();
      setBoot("app");
    } catch (e) {
      if (isAuthError(e)) {
        clearToken();
        setBoot("auth");
      } else {
        setBootError(e?.message || "서버에 연결할 수 없습니다");
        setBoot("reconnect");
      }
    }
  }, [loadAppData]);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  useEffect(() => {
    if (boot === "app" || boot === "auth") {
      document.title = "ERP";
    }
  }, [boot]);

  useEffect(() => {
    const onOpenFile = (e) => setFileViewer(e.detail || null);
    window.addEventListener("storyahub-open-file", onOpenFile);
    return () => window.removeEventListener("storyahub-open-file", onOpenFile);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleAuth = async (result) => {
    if (result.token) setToken(result.token);
    const u = enrichErpUser(result.user);
    setUser(u);
    if (u?.erpAccess?.status === "pending") {
      setBoot("pending");
      return;
    }
    if (u?.erpAccess?.status === "rejected" || u?.erpAccess?.status === "none") {
      clearToken();
      setBoot("auth");
      setBootError("접근 권한이 없습니다.");
      return;
    }
    if (!u.onboardingDone) {
      await api.completeOnboarding();
      const { user: u2raw } = await api.me();
      setUser(enrichErpUser(u2raw));
    }
    await loadAppData();
    setBoot("app");
  };

  const goTab = (t) => {
    setKbView(null);
    setTab(t);
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* */ }
    clearToken();
    setUser(null);
    setMenuOpen(false);
    setBoot("auth");
  };

  const closeKbView = useCallback(() => setKbView(null), []);
  const openKbWrite = (a) => {
    setKbView({
      article: a || { section: "knowledge", blocks: [{ type: "h", val: "" }, { type: "text", val: "" }] },
      mode: a?.id ? "read" : "edit",
    });
  };

  const prefs = userPreferences(user);
  const showMobileHeader = boot === "app" && kbView?.mode !== "edit";

  if (boot === "loading" || boot === "reconnect") {
    return (
      <div className="erp-root">
        <style>{ERP_CSS}</style>
        <ToastHost /><ConfirmHost />
        <div className="app-main app-main-centered" style={{ textAlign: "center", padding: 40 }}>
          {boot === "loading" ? <div className="spinner" /> : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>연결을 확인하고 있어요</div>
              <div className="small" style={{ marginBottom: 18 }}>{bootError}</div>
              <button className="btn btn-accent" onClick={restoreSession}>다시 시도</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const renderContent = () => {
  if (boot === "auth") return <AuthScreen onSuccess={handleAuth} erpMode />;
  if (boot === "pending") {
    return (
      <div className="erp-root">
        <style>{ERP_CSS}</style>
        <div className="app-main app-main-centered" style={{ textAlign: "center", padding: 40, maxWidth: 420, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>승인 대기 중</div>
          <div className="small" style={{ lineHeight: 1.6, marginBottom: 20 }}>
            {user?.email} 계정은 관리자 승인 후 이용할 수 있습니다.<br />승인되면 자동으로 접속됩니다.
          </div>
          <button type="button" className="btn btn-ghost" onClick={restoreSession}>새로고침</button>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={handleLogout}>로그아웃</button>
        </div>
      </div>
    );
  }
  if (kbView) {
      return kbView.mode === "edit"
        ? <KbEditor article={kbView.article} back={closeKbView} onSaved={loadKb} onDeleted={loadKb}
            prefs={prefs} erpMode
            categories={kbCategories(kbArticles, kbView.article?.section).filter((c) => c !== "전체")} />
        : <KbReadView article={kbView.article} back={closeKbView} erpMode
            canEdit={!kbView.article?.shareRole || kbView.article.shareRole === "owner" || kbView.article.shareRole === "editor"}
            onEdit={() => setKbView({ article: kbView.article, mode: "edit" })}
            onArticleUpdated={(saved) => {
              const ui = kbToUi(saved);
              setKbView({ article: { ...kbView.article, ...ui }, mode: "read" });
              loadKb();
            }} />;
    }
    switch (tab) {
      case "kb": return <KnowledgeFeed articles={kbArticles} section="knowledge" openWrite={openKbWrite} erpMode />;
      case "members":
        if (!canAccessErpAdmin(user)) return <KnowledgeFeed articles={kbArticles} section="knowledge" openWrite={openKbWrite} erpMode />;
        return <MembersView />;
      case "meetings": return <MeetingNotesView />;
      case "okr": return <OkrView />;
      case "sales-sync": return <SalesSyncView />;
      case "sales-rate": return <PaymentRateView />;
      case "sales-trend": return <SalesTrendView />;
      case "sales-inquiry-trend": return <SalesInquiryTrendView />;
      case "sales-dashboard": return <SalesDashboardView />;
      case "marketing-dashboard": return <MarketingDashboardView />;
      case "daily-report": return <DailyReportView />;
      case "broj-dashboard": return <BrojDashboardView />;
      case "sales-revenue": return <RevenueView />;
      case "sales-tax-invoice": return <TaxInvoiceView />;
      case "construction": return <ConstructionView orderType="아파트너" />;
      case "construction-broj": return <ConstructionView orderType="브로제이" />;
      case "vendors": return <VendorsView />;
      case "install-schedule": return <InstallScheduleView />;
      case "consult-docs": return <ConsultDocsView />;
      case "sales-daily": return <SalesDailyView />;
      default: return <KnowledgeFeed articles={kbArticles} section="knowledge" openWrite={openKbWrite} erpMode />;
    }
  };

  return (
    <div className="erp-root">
      <style>{ERP_CSS}</style>
      <ToastHost /><ConfirmHost />
      <ShareSheet open={!!shareTarget} onClose={() => setShareTarget(null)}
        resourceType={shareTarget?.type} resourceId={shareTarget?.id} title={shareTarget?.title} />
      <div className="app-shell">
        {boot === "app" && (
          <aside className={"app-sidebar" + (sideCollapsed ? " collapsed" : "")}>
            <div className="app-sidebar-hd">
              <div className="app-brand">ERP</div>
              <button type="button" className="side-toggle" title={sideCollapsed ? "메뉴 펼치기" : "메뉴 접기"} aria-label={sideCollapsed ? "메뉴 펼치기" : "메뉴 접기"} onClick={toggleSidebar}>
                {sideCollapsed ? "»" : "«"}
              </button>
            </div>
            <nav className="app-sidenav">
              <ErpNav tab={tab} kbView={kbView} onSelect={goTab} user={user} hiddenIds={{ consultVisible }} collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup} />
            </nav>
            <div className="app-sidebar-foot" style={{ fontSize: 12, color: "var(--muted)", padding: "12px 10px" }}>
              <div>지식경영 · 회의록 · OKR · 문의/결제</div>
              {user?.erpAccess?.isOwner && (
                <div style={{ marginTop: 6, fontWeight: 700, color: "var(--accent-deep)" }}>슈퍼어드민</div>
              )}
              {user && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 10, padding: 0, minHeight: 0, fontSize: 12 }}
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
              )}
            </div>
          </aside>
        )}
        <div className="app-main">
          {showMobileHeader && (
            <header className="mobile-header">
              <button type="button" className="mobile-menu-btn" aria-label="메뉴" onClick={() => setMenuOpen(true)}>
                {I.menu({})}
              </button>
              <div className="mobile-header-title">{kbView ? "지식경영" : erpModuleLabel(tab)}</div>
            </header>
          )}
          <div className={"screen" + (kbView ? " screen-kb" : "")}>
            {renderContent()}
          </div>
          {tab === "kb" && !kbView && (
            <button type="button" className="kbh-fab" aria-label="새 글" onClick={() => openKbWrite(null)}>
              {I.plus({ width: 24, height: 24 })}
            </button>
          )}
        </div>
      </div>
      {menuOpen && boot === "app" && (
        <>
          <div className="menu-overlay" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="mobile-drawer" role="dialog" aria-label="메뉴">
            <div className="mobile-drawer-hd">
              <div className="mobile-drawer-brand">ERP</div>
              <button type="button" className="mobile-menu-btn" aria-label="닫기" onClick={() => setMenuOpen(false)}>
                {I.close({})}
              </button>
            </div>
            <nav className="mobile-drawer-nav">
              <ErpNav tab={tab} kbView={kbView} onSelect={goTab} onLogout={handleLogout} user={user} hiddenIds={{ consultVisible }} collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup} />
            </nav>
          </aside>
        </>
      )}
      <FileViewerOverlay file={fileViewer} onClose={() => setFileViewer(null)} />
    </div>
  );
}
