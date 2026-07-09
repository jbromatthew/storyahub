import React, { useMemo, useRef, useState } from "react";

/** 공용 통계 시각화 — 표/막대/꺾은선/도넛 전환. 차트 라이브러리 없이 SVG 직접 렌더.
 *  데이터 형태:
 *    categories: string[]                     // x축 라벨
 *    series: [{ label, color?, values:number[] }]  // values 는 categories 와 정렬
 */

export const VIZ_PALETTE = [
  "#DD5E39", "#2383E2", "#0D7A3E", "#C9A23A",
  "#9334E6", "#0E9AA7", "#C5221F", "#6B7280",
];

export const seriesColor = (i) => VIZ_PALETTE[i % VIZ_PALETTE.length];

function fmtVal(v, format) {
  if (v == null || Number.isNaN(v)) return "-";
  if (format === "percent") return `${Math.round(v)}%`;
  if (format === "won") return `₩${Math.round(v).toLocaleString()}`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

function niceTicks(min, max, count = 4) {
  if (max === min) return [min];
  const span = max - min;
  const step = span / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

/* 마우스 hover 값 툴팁 */
function useTip() {
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, ...content });
  };
  const hide = () => setTip(null);
  return { wrapRef, tip, show, hide };
}

function VizTip({ tip }) {
  if (!tip) return null;
  const clampedLeft = Math.max(4, tip.x);
  return (
    <div className="viz-tip" style={{ left: clampedLeft, top: Math.max(0, tip.y) }}>
      {tip.title != null && <div className="viz-tip-title">{tip.title}</div>}
      {(tip.rows || []).map((r, i) => (
        <div key={i} className="viz-tip-row">
          {r.color && <span className="viz-tip-dot" style={{ background: r.color }} />}
          <span className="viz-tip-label">{r.label}</span>
          <span className="viz-tip-val">{r.val}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Bar (단일/그룹) ---------------- */
export function BarChart({ categories, series, format, height = 280 }) {
  const { wrapRef, tip, show, hide } = useTip();
  const values = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!categories.length || !values.length) return <div className="viz-empty">표시할 데이터가 없습니다</div>;

  const pad = { top: 16, right: 14, bottom: 46, left: 46 };
  const w = 720;
  const h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const minV = Math.min(0, ...values);
  const maxV = Math.max(...values, format === "percent" ? 100 : 1);
  const range = maxV - minV || 1;
  const yAt = (v) => pad.top + plotH - ((v - minV) / range) * plotH;
  const ticks = niceTicks(minV, maxV);

  const groupW = plotW / categories.length;
  const inner = Math.min(groupW * 0.7, 64);
  const barW = Math.max(4, inner / series.length - 2);
  const showCatLabels = categories.length <= 16;

  return (
    <div className="viz-wrap" ref={wrapRef} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${w} ${h}`} className="viz-svg" role="img" preserveAspectRatio="xMidYMid meet">
        {ticks.map((v, i) => (
          <g key={i}>
            <line className="viz-grid" x1={pad.left} y1={yAt(v)} x2={w - pad.right} y2={yAt(v)} />
            <text className="viz-axis" x={pad.left - 8} y={yAt(v) + 3.5} textAnchor="end">{fmtVal(v, format)}</text>
          </g>
        ))}
        {categories.map((cat, ci) => {
          const gx = pad.left + groupW * ci + (groupW - inner) / 2;
          return (
            <g key={ci}>
              {series.map((s, si) => {
                const v = s.values[ci];
                if (v == null) return null;
                const x = gx + si * (barW + 2);
                const y0 = yAt(0);
                const y = yAt(v);
                const color = s.color || seriesColor(si);
                return (
                  <rect
                    key={si}
                    className="viz-bar"
                    x={x}
                    y={Math.min(y, y0)}
                    width={barW}
                    height={Math.max(1, Math.abs(y0 - y))}
                    rx={3}
                    fill={color}
                    onMouseMove={(e) => show(e, { title: cat, rows: [{ color, label: s.label, val: fmtVal(v, format) }] })}
                    onMouseLeave={hide}
                  />
                );
              })}
              {showCatLabels && (
                <text className="viz-axis" x={pad.left + groupW * ci + groupW / 2} y={h - 24} textAnchor="middle">
                  {cat}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <VizTip tip={tip} />
      <VizLegend series={series} />
    </div>
  );
}

/* ---------------- Line (다중 시리즈) ---------------- */
export function LineChart({ categories, series, format, height = 280 }) {
  const { wrapRef, tip, show, hide } = useTip();
  const values = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!categories.length || !values.length) return <div className="viz-empty">표시할 데이터가 없습니다</div>;

  const pad = { top: 18, right: 16, bottom: 42, left: 48 };
  const w = 720;
  const h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const minV = Math.min(0, ...values);
  const maxV = Math.max(...values, format === "percent" ? 5 : 1);
  const range = maxV - minV || 1;
  const xAt = (i) => pad.left + (categories.length <= 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);
  const yAt = (v) => pad.top + plotH - ((v - minV) / range) * plotH;
  const ticks = niceTicks(minV, maxV);
  const showCatLabels = categories.length <= 18;

  const colOf = (i) => series
    .map((s, si) => ({ color: s.color || seriesColor(si), label: s.label, v: s.values[i] }))
    .filter((r) => r.v != null)
    .map((r) => ({ color: r.color, label: r.label, val: fmtVal(r.v, format) }));
  const hoverW = categories.length > 1 ? plotW / (categories.length - 1) : plotW;

  return (
    <div className="viz-wrap" ref={wrapRef} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${w} ${h}`} className="viz-svg" role="img" preserveAspectRatio="xMidYMid meet">
        {ticks.map((v, i) => (
          <g key={i}>
            <line className="viz-grid" x1={pad.left} y1={yAt(v)} x2={w - pad.right} y2={yAt(v)} />
            <text className="viz-axis" x={pad.left - 8} y={yAt(v) + 3.5} textAnchor="end">{fmtVal(v, format)}</text>
          </g>
        ))}
        {showCatLabels && categories.map((cat, i) => (
          <text key={i} className="viz-axis" x={xAt(i)} y={h - 12} textAnchor="middle">{cat}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
          if (!pts.length) return null;
          const color = s.color || seriesColor(si);
          const d = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${xAt(p.i)} ${yAt(p.v)}`).join(" ");
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => <circle key={p.i} cx={xAt(p.i)} cy={yAt(p.v)} r={3.4} fill={color} />)}
            </g>
          );
        })}
        {categories.map((cat, i) => (
          <rect
            key={i}
            x={xAt(i) - hoverW / 2}
            y={pad.top}
            width={hoverW}
            height={plotH}
            fill="transparent"
            onMouseMove={(e) => show(e, { title: cat, rows: colOf(i) })}
            onMouseLeave={hide}
          />
        ))}
      </svg>
      <VizTip tip={tip} />
      <VizLegend series={series} />
    </div>
  );
}

/* ---------------- Donut (구성비) ---------------- */
export function DonutChart({ items, format, size = 200, centerLabel }) {
  const { wrapRef, tip, show, hide } = useTip();
  const clean = (items || []).filter((it) => it && it.value > 0);
  const total = clean.reduce((a, b) => a + b.value, 0);
  if (!total) return <div className="viz-empty">표시할 데이터가 없습니다</div>;

  const r = 70;
  const c = 2 * Math.PI * r;
  const stroke = 26;
  let acc = 0;
  const segs = clean.map((it, i) => {
    const frac = it.value / total;
    const seg = { ...it, color: it.color || seriesColor(i), dash: frac * c, offset: -acc * c, pct: frac * 100 };
    acc += frac;
    return seg;
  });

  const tipFor = (e, s) => show(e, { title: s.label, rows: [{ color: s.color, label: fmtVal(s.value, format), val: `${Math.round(s.pct)}%` }] });

  return (
    <div className="viz-donut-wrap" ref={wrapRef} onMouseLeave={hide}>
      <svg viewBox="0 0 200 200" className="viz-donut" width={size} height={size} role="img">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {segs.map((s, i) => (
          <circle
            key={i}
            className="viz-donut-seg"
            cx="100" cy="100" r={r} fill="none"
            stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={s.offset}
            transform="rotate(-90 100 100)"
            onMouseMove={(e) => tipFor(e, s)}
            onMouseLeave={hide}
          />
        ))}
        <text x="100" y="96" textAnchor="middle" className="viz-donut-total">{centerLabel ?? total.toLocaleString()}</text>
        <text x="100" y="116" textAnchor="middle" className="viz-donut-sub">합계</text>
      </svg>
      <VizTip tip={tip} />
      <div className="viz-donut-legend">
        {segs.map((s, i) => (
          <div
            key={i}
            className="viz-donut-legend-item"
            onMouseMove={(e) => tipFor(e, s)}
            onMouseLeave={hide}
          >
            <span className="viz-swatch" style={{ background: s.color }} />
            <span className="viz-donut-legend-label">{s.label}</span>
            <span className="viz-donut-legend-val">{fmtVal(s.value, format)} · {Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VizLegend({ series }) {
  if (!series || series.length <= 1) return null;
  return (
    <div className="viz-legend">
      {series.map((s, i) => (
        <span key={i} className="viz-legend-item">
          <span className="viz-swatch" style={{ background: s.color || seriesColor(i), borderColor: s.color || seriesColor(i) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------- 전환 래퍼 ---------------- */
const VIEW_META = {
  table: { label: "표", icon: "▦" },
  bar: { label: "막대", icon: "▮" },
  line: { label: "꺾은선", icon: "📈" },
  donut: { label: "도넛", icon: "◕" },
};

export function StatViz({
  title,
  views = ["table", "bar", "line"],
  initial,
  format = "number",
  categories = [],
  series = [],
  donutItems,
  tableNode,
  height,
  right,
}) {
  const [view, setView] = useState(initial || views[0]);
  const active = views.includes(view) ? view : views[0];

  return (
    <div className="viz-block">
      <div className="viz-block-head">
        {title ? <div className="viz-block-title">{title}</div> : <span />}
        <div className="viz-block-right">
          {right}
          <div className="viz-switch" role="tablist">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active === v}
                className={"viz-switch-btn" + (active === v ? " on" : "")}
                onClick={() => setView(v)}
              >
                <span className="viz-switch-ic">{VIEW_META[v]?.icon}</span>
                <span className="viz-switch-lbl">{VIEW_META[v]?.label || v}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="viz-block-body">
        {active === "table" && tableNode}
        {active === "bar" && <BarChart categories={categories} series={series} format={format} height={height} />}
        {active === "line" && <LineChart categories={categories} series={series} format={format} height={height} />}
        {active === "donut" && <DonutChart items={donutItems || []} format={format} />}
      </div>
    </div>
  );
}
