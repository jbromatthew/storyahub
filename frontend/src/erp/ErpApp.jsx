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
import { ERP_MODULES } from "./config.js";
import { erpIcons as I } from "./icons.jsx";
import { MeetingNotesView, OkrView, SalesSyncView, PaymentRateView } from "./modules.jsx";

function NavBtn({ on, icon, label, onClick, layout = "side" }) {
  const cls = layout === "side" ? "sidenavitem" : "sidenavitem";
  return (
    <button type="button" className={cls + (on ? " on" : "")} onClick={onClick}>
      {icon({ width: 20, height: 20 })}<span>{label}</span>
    </button>
  );
}

function ErpNav({ tab, kbView, onSelect, onLogout }) {
  return (
    <>
      {ERP_MODULES.map((m, i) => {
        const prev = ERP_MODULES[i - 1];
        const showGroup = m.groupLabel && m.groupLabel !== prev?.groupLabel;
        return (
          <React.Fragment key={m.id}>
            {showGroup && <div className="sidenav-group">{m.groupLabel}</div>}
            <NavBtn
              on={tab === m.id && !kbView}
              icon={I[m.icon] || I.book}
              label={m.label}
              onClick={() => onSelect(m.id)}
            />
          </React.Fragment>
        );
      })}
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

export default function ErpApp() {
  const [boot, setBoot] = useState("loading");
  const [bootError, setBootError] = useState("");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("kb");
  const [menuOpen, setMenuOpen] = useState(false);
  const [kbArticles, setKbArticles] = useState([]);
  const [kbView, setKbView] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [fileViewer, setFileViewer] = useState(null);

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
      const { user: u } = await api.me();
      setUser(u);
      if (!u.onboardingDone) {
        await api.completeOnboarding();
        const { user: u2 } = await api.me();
        setUser(u2);
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
    setUser(result.user);
    if (!result.user.onboardingDone) {
      await api.completeOnboarding();
      const { user: u } = await api.me();
      setUser(u);
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
  const currentModule = ERP_MODULES.find((m) => m.id === tab);
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
    if (kbView) {
      return kbView.mode === "edit"
        ? <KbEditor article={kbView.article} back={closeKbView} onSaved={loadKb} onDeleted={loadKb}
            prefs={prefs} categories={kbCategories(kbArticles, kbView.article?.section).filter((c) => c !== "전체")} />
        : <KbReadView article={kbView.article} back={closeKbView}
            canEdit={!kbView.article?.shareRole || kbView.article.shareRole === "owner" || kbView.article.shareRole === "editor"}
            onEdit={() => setKbView({ article: kbView.article, mode: "edit" })}
            onShare={kbView.article?.shareRole === "owner" ? () => setShareTarget({ type: "kb", id: kbView.article.id, title: kbView.article.t }) : undefined} />;
    }
    switch (tab) {
      case "kb": return <KnowledgeFeed articles={kbArticles} section="knowledge" openWrite={openKbWrite} erpMode />;
      case "meetings": return <MeetingNotesView />;
      case "okr": return <OkrView />;
      case "sales-sync": return <SalesSyncView />;
      case "sales-rate": return <PaymentRateView />;
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
          <aside className="app-sidebar">
            <div className="app-brand">ERP</div>
            <nav className="app-sidenav">
              <ErpNav tab={tab} kbView={kbView} onSelect={goTab} />
            </nav>
            <div className="app-sidebar-foot" style={{ fontSize: 12, color: "var(--muted)", padding: "12px 10px" }}>
              <div>지식경영 · 회의록 · OKR · 문의/결제</div>
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
              <div className="mobile-header-title">{kbView ? "지식경영" : (currentModule?.label || "ERP")}</div>
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
              <ErpNav tab={tab} kbView={kbView} onSelect={goTab} onLogout={handleLogout} />
            </nav>
          </aside>
        </>
      )}
      <FileViewerOverlay file={fileViewer} onClose={() => setFileViewer(null)} />
    </div>
  );
}
