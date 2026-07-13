import React, { useState, useEffect, useRef } from "react";
import { kbSearchText } from "./KbEditor.jsx";
import { mediaUrl } from "../api/upload.js";
import {
  kbCategories, kbTags, KB_SECTIONS, kbSectionLabel,
  kbCoverKey, kbExcerpt, kbReadMinutes, kbFileCount, kbThumbMeta,
} from "../mappers.js";

const I = {
  search: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>,
  book: (p) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 3z" /></svg>,
  file: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6" /></svg>,
  mic: (p) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /></svg>,
};

function useInView(rootMargin = "120px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

function KbThumb({ article }) {
  const { ref, inView } = useInView();
  const [url, setUrl] = useState(null);
  const coverKey = kbCoverKey(article);
  const meta = kbThumbMeta(article);
  const isBook = (article?.section || "knowledge") === "book";

  useEffect(() => {
    if (!inView || !coverKey) {
      if (!coverKey) setUrl(null);
      return undefined;
    }

    let alive = true;
    mediaUrl(coverKey).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [coverKey, inView]);

  const cls = "kbh-thumb" + (isBook ? " book" : "");
  if (url) {
    return (
      <div ref={ref} className={cls}>
        <img src={url} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }
  const icon = meta.icon === "file" ? I.file({ width: 22, height: 22 })
    : meta.icon === "mic" ? I.mic({ width: 22, height: 22, style: { color: "#fff" } })
    : I.book({ width: 22, height: 22 });
  return <div ref={ref} className={cls} style={{ background: meta.color }}>{icon}</div>;
}

function KbFeatCover({ article }) {
  const { ref, inView } = useInView("200px");
  const [url, setUrl] = useState(null);
  const coverKey = kbCoverKey(article);
  const meta = kbThumbMeta(article);

  useEffect(() => {
    if (!inView || !coverKey) return undefined;
    let alive = true;
    mediaUrl(coverKey).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [coverKey, inView]);

  if (url) {
    return (
      <div ref={ref} className="cover" style={{ background: "#ECE8E0" }}>
        <img src={url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="cover"
      style={{ background: `linear-gradient(135deg,${meta.color},var(--accent-deep))` }}
    />
  );
}

function KbBlogCover({ article }) {
  const { ref, inView } = useInView("80px");
  const [url, setUrl] = useState(null);
  const coverKey = kbCoverKey(article);
  const meta = kbThumbMeta(article);

  useEffect(() => {
    if (!inView || !coverKey) {
      if (!coverKey) setUrl(null);
      return undefined;
    }
    let alive = true;
    mediaUrl(coverKey).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [coverKey, inView]);

  if (url) {
    return (
      <div ref={ref} className="kbh-blog-cover">
        <img src={url} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }
  const icon = meta.icon === "file" ? I.file({ width: 28, height: 28 })
    : meta.icon === "mic" ? I.mic({ width: 28, height: 28 })
    : I.book({ width: 28, height: 28 });
  return (
    <div ref={ref} className="kbh-blog-cover">
      <div className="kbh-cover-ph" style={{ background: `linear-gradient(135deg,${meta.color},var(--accent-deep))` }}>
        {icon}
      </div>
    </div>
  );
}

function KbBlogCard({ article, onOpen, featured = false, erpMode = false }) {
  const isFormal = article.status === "formal" || article.status === "formal_pending";
  return (
    <article className={"kbh-blog-card" + (featured ? " kbh-blog-feat" : "")} onClick={() => onOpen(article)}>
      <KbBlogCover article={article} />
      <div className="kbh-blog-body">
        <div className="ttl">{article.t}</div>
        <div className="ex">{kbExcerpt(article) || "내용 미리보기가 없습니다."}</div>
        <div className="kbh-blog-foot">
          <span className="meta">{article.d} · {kbReadMinutes(article)}분 읽기{kbFileCount(article) > 0 ? ` · 📎${kbFileCount(article)}` : ""}</span>
          <div className="tags">
            {isFormal && <span className="tag" style={{ background: "#E8F5E9", color: "#2E7D32" }}>정식</span>}
            {erpMode && article.visibility === "private" && <span className="tag">비공개</span>}
            {erpMode && article.visibility === "company" && <span className="tag" style={{ background: "#E3F2FD", color: "#1565C0" }}>팀공개</span>}
            <span className="tag">{article.c}</span>
            {(article.tags || []).slice(0, 2).map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        </div>
      </div>
    </article>
  );
}

function KbVisibilityBadge({ article, erpMode }) {
  if (!erpMode) return null;
  const isPublic = article.visibility === "company";
  return (
    <span className={"kbh-vis-badge" + (isPublic ? " public" : " private")}>
      {isPublic ? "팀공개" : "비공개"}
    </span>
  );
}

function KbArticleRow({ article, onOpen }) {
  const isFormal = article.status === "formal" || article.status === "formal_pending";
  const isPublic = article.visibility === "company";
  const authorHint = article.isShared && article.sharedBy
    ? (article.sharedBy.name || article.sharedBy.email?.split("@")[0] || "팀원")
    : null;
  const tags = article.tags || [];
  const files = kbFileCount(article);
  return (
    <tr className="clickable" onClick={() => onOpen(article)}>
      <td>
        <div className="cell-ttl" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isFormal && <span className="erp-badge green">정식</span>}
          <span>{article.t}</span>
        </div>
        <div className="cell-sub clip">{kbExcerpt(article) || "내용 미리보기가 없습니다."}</div>
      </td>
      <td className="shrink"><span className="erp-badge">{article.c}</span></td>
      <td className="shrink">
        {tags.length ? tags.slice(0, 3).map((t) => <span key={t} className="erp-tag-chip">#{t}</span>) : <span style={{ color: "var(--muted)" }}>—</span>}
      </td>
      <td className="shrink ctr"><span className={"erp-badge " + (isPublic ? "blue" : "gray")}>{isPublic ? "팀공개" : "비공개"}</span></td>
      <td className="shrink num"><span className="cell-sub" style={{ margin: 0 }}>{article.d}<br />{authorHint ? `${authorHint} · ` : ""}{kbReadMinutes(article)}분{files > 0 ? ` · 📎${files}` : ""}</span></td>
    </tr>
  );
}

function KbArticleCard({ article, onOpen, pinned, erpMode = false }) {
  const isFormal = article.status === "formal" || article.status === "formal_pending";
  const isPublic = article.visibility === "company";
  const visClass = erpMode ? (isPublic ? " kbh-vis-public" : " kbh-vis-private") : "";
  const authorHint = erpMode && article.isShared && article.sharedBy
    ? (article.sharedBy.name || article.sharedBy.email?.split("@")[0] || "팀원")
    : null;
  return (
    <div className={"kbh-item" + visClass} onClick={() => onOpen(article)}>
      <KbThumb article={article} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="kbh-meta">
          <KbVisibilityBadge article={article} erpMode={erpMode} />
          {pinned && <span className="tag gray">📌 최신</span>}
          {isFormal && <span className="tag" style={{ background: "#E8F5E9", color: "#2E7D32" }}>정식지식</span>}
          <span className="tag gray">{article.c}</span>
          {(article.tags || []).slice(0, 2).map((t) => <span key={t} className="tag gray">#{t}</span>)}
        </div>
        <div className="ttl">{article.t}</div>
        <div className="ex">{kbExcerpt(article)}</div>
        <div className="kbh-info">
          <span className="kbh-dot">
            {authorHint ? `${authorHint} · ` : ""}{article.d} · {kbReadMinutes(article)}분
          </span>
          {kbFileCount(article) > 0 && <span className="kbh-attach">📎 {kbFileCount(article)}</span>}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeFeed({ articles, openWrite, section = "knowledge", onSectionChange, erpMode = false }) {
  const [viewMode, setViewMode] = useState(erpMode ? "list" : "board");
  const [visFilter, setVisFilter] = useState("전체");
  const [cat, setCat] = useState("전체");
  const [tagFilter, setTagFilter] = useState("전체");
  const [q, setQ] = useState("");
  const cats = kbCategories(articles, section);
  const tagList = kbTags(articles, section);
  const ql = q.trim().toLowerCase();
  let list = articles.filter((a) => (a.section || "knowledge") === section);
  if (cat !== "전체") list = list.filter((a) => a.c === cat);
  if (tagFilter !== "전체") list = list.filter((a) => (a.tags || []).includes(tagFilter));
  if (ql) list = list.filter((a) => kbSearchText(a).includes(ql));
  if (erpMode && visFilter === "비공개") list = list.filter((a) => a.visibility !== "company");
  if (erpMode && visFilter === "팀공개") list = list.filter((a) => a.visibility === "company");
  const feat = !erpMode && list[0] && cat === "전체" && !ql ? list[0] : null;
  const rest = feat ? list.slice(1) : list;
  const sectionInfo = KB_SECTIONS.find((s) => s.id === section);
  const emptyMsg = section === "book" ? "아직 책 기록이 없어요."
    : section === "lecture" ? "아직 강연 정리가 없어요." : "아직 지식 글이 없어요. 우측 하단 + 로 첫 글을 작성해 보세요.";
  const gridItems = erpMode ? list : (viewMode === "board" ? rest : list);
  const listClass = erpMode ? "kbh-listview" : (viewMode === "board" ? "kbh-board" : "kbh-listview");

  return (
    <div className={erpMode ? "kb-feed" : "fade"} style={{ position: "relative" }}>
      <div className={"pad" + (erpMode ? " kb-feed-inner" : "")} style={{ marginTop: erpMode ? 0 : 8 }}>
        <div className={erpMode ? "kb-feed-hd" : ""}>
          <div className="h-eyebrow">{erpMode ? "지식경영" : "Knowledge"}</div>
          <div className="h-title">{erpMode ? "팀 지식 블로그" : "지식백과"}</div>
          <div className="small" style={{ marginTop: 4 }}>
            {erpMode ? "업무 노하우와 정리 글을 검색하고 공유해요" : "책·강연·지식을 나눠 정리하고 검색해요"}
          </div>
        </div>

        {!erpMode && (
          <div className="kbh-seg">
            {KB_SECTIONS.map((s) => (
              <button key={s.id} type="button" className={section === s.id ? "on" : ""}
                onClick={() => { onSectionChange?.(s.id); setCat("전체"); setTagFilter("전체"); }}>
                <span>{s.icon} {s.label}</span>
                <span className="sub">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        <div className="kbh-search" style={{ marginTop: 16 }}>
          {I.search({ width: 18, height: 18 })}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={erpMode ? "제목 · 내용 · 태그 검색" : `${sectionInfo?.label || "지식"} · 제목 · 내용 검색`} />
          {q && <span onClick={() => setQ("")} style={{ cursor: "pointer", color: "var(--muted)" }}>✕</span>}
        </div>

        <div className="kbh-cats">
          {cats.map((c) => (
            <button key={c} type="button" className={"kbh-cat" + (cat === c ? " on" : "")} onClick={() => { setCat(c); setTagFilter("전체"); }}>{c}</button>
          ))}
        </div>

        {tagList.length > 0 && (
          <div className="kbh-cats" style={{ marginTop: 8 }}>
            <button type="button" className={"kbh-cat" + (tagFilter === "전체" ? " on" : "")} onClick={() => setTagFilter("전체")}>#전체</button>
            {tagList.map((t) => (
              <button key={t} type="button" className={"kbh-cat" + (tagFilter === t ? " on" : "")} onClick={() => setTagFilter(t)}>#{t}</button>
            ))}
          </div>
        )}

        {erpMode && (
          <div className="kbh-cats" style={{ marginTop: 8 }}>
            {["전체", "비공개", "팀공개"].map((v) => (
              <button key={v} type="button" className={"kbh-cat" + (visFilter === v ? " on" : "")} onClick={() => setVisFilter(v)}>{v}</button>
            ))}
          </div>
        )}

        {list.length > 0 && (
          <div className="kbh-blog-toolbar">
            <span className="count">글 {list.length}개</span>
            {erpMode ? (
              <div className="kbh-vis-legend">
                <span className="kbh-vis-badge private">비공개</span>
                <span className="kbh-vis-badge public">팀공개</span>
              </div>
            ) : (
              <div className="seg" style={{ width: 128 }}>
                <button type="button" className={viewMode === "board" ? "on" : ""} onClick={() => setViewMode("board")} style={{ padding: "6px 0", fontSize: 12.5 }}>보드</button>
                <button type="button" className={viewMode === "list" ? "on" : ""} onClick={() => setViewMode("list")} style={{ padding: "6px 0", fontSize: 12.5 }}>리스트</button>
              </div>
            )}
          </div>
        )}

        {list.length === 0 && (
          <div className="small" style={{ textAlign: "center", padding: "50px 0", lineHeight: 1.6 }}>
            {q ? `"${q}"에 대한 글이 없어요.` : emptyMsg}
          </div>
        )}

        {feat && viewMode === "board" && (
          <>
            <div className="kbh-sech">추천</div>
            <div className="kbh-feat" onClick={() => openWrite(feat)}>
              <KbFeatCover article={feat} />
              <span className="kbh-pin">📌 최신</span>
              <div className="body">
                <div className="kbh-meta"><span className="tag gray">{feat.c}</span></div>
                <div className="ttl">{feat.t}</div>
                <div className="ex">{kbExcerpt(feat)}</div>
              </div>
            </div>
          </>
        )}

        {gridItems.length > 0 && <div className="kbh-sech">{erpMode ? "지식 목록" : `${kbSectionLabel(section)} 목록`}</div>}
        {erpMode ? (
          gridItems.length > 0 && (
            <div className="erp-tbl-wrap">
              <table className="erp-tbl">
                <thead>
                  <tr>
                    <th>제목</th>
                    <th className="shrink">카테고리</th>
                    <th className="shrink">태그</th>
                    <th className="shrink ctr">공개</th>
                    <th className="shrink num">작성</th>
                  </tr>
                </thead>
                <tbody>
                  {gridItems.map((a) => (
                    <KbArticleRow key={a.id} article={a} onOpen={openWrite} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className={`kbh-list ${listClass}`}>
            {gridItems.map((a, i) => (
              <KbArticleCard key={a.id} article={a} onOpen={openWrite} pinned={viewMode === "list" && i === 0 && !!feat} erpMode={erpMode} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
