import { CALENDAR_CSS } from "../calendarStyles.js";
import { KB_CSS } from "../kbStyles.js";

export const ERP_CSS = `
:root{
  --paper:#F7F4EE;--card:#FFFFFF;--ink:#1B1A17;--muted:#8C857A;
  --line:#ECE7DD;--accent:#DD5E39;--accent-deep:#C2491F;--accent-soft:#FBEAE1;
  --ok:#2E7D32;--warn:#C9A23A;
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;overflow:hidden;}
body{font-family:Pretendard,-apple-system,sans-serif;background:var(--paper);color:var(--ink);}
.sa-root,.erp-root{height:100dvh;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.app-shell{display:flex;flex:1;min-height:0;}
.app-sidebar{width:240px;background:#fff;border-right:1px solid var(--line);padding:20px 14px;display:none;flex-direction:column;}
.app-brand{font-size:20px;font-weight:900;letter-spacing:-.03em;padding:4px 10px 18px;}
.app-brand span{color:var(--accent-deep);}
.app-sidenav{display:flex;flex-direction:column;gap:4px;flex:1;}
.sidenavitem{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border-radius:12px;border:none;background:transparent;font:inherit;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;text-align:left;}
.sidenavitem.on{background:var(--accent-soft);color:var(--accent-deep);}
.app-main{flex:1;display:flex;flex-direction:column;min-width:0;position:relative;}
.screen{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;padding:8px 0 calc(16px + env(safe-area-inset-bottom,0px));}
.mobile-header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:40;}
.mobile-header-title{font-size:16px;font-weight:800;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mobile-menu-btn{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:none;background:transparent;border-radius:10px;cursor:pointer;color:var(--ink);}
.mobile-menu-btn:active{background:var(--accent-soft);}
.menu-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;}
.mobile-drawer{position:fixed;top:0;left:0;bottom:0;width:min(280px,86vw);background:#fff;z-index:90;display:flex;flex-direction:column;padding:16px 14px;box-shadow:4px 0 24px rgba(0,0,0,.12);animation:drawerIn .2s ease;}
@keyframes drawerIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
.mobile-drawer-hd{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 16px;}
.mobile-drawer-brand{font-size:18px;font-weight:900;}
.mobile-drawer-nav{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;}
.mobile-drawer-foot{padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);}
.kbh-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));width:56px;height:56px;border-radius:50%;border:none;background:var(--accent);color:#fff;box-shadow:0 8px 24px -8px rgba(221,94,57,.6);cursor:pointer;z-index:40;display:flex;align-items:center;justify-content:center;}
.screen-kb{overflow:hidden;padding:0;display:flex;flex-direction:column;flex:1;min-height:0;background:#F4F5F7;}
.screen-kb>.kbe-wrap,.screen-kb>.kbe-read{flex:1;min-height:0;}
.pad{padding:0 16px;}
.h-eyebrow{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.h-title{font-size:24px;font-weight:800;letter-spacing:-.03em;margin-top:4px;}
.small{font-size:13px;color:var(--muted);}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;}
.row{display:flex;align-items:center;}
.between{justify-content:space-between;}
.btn{border:none;border-radius:12px;padding:12px 16px;font:inherit;font-weight:700;cursor:pointer;}
.btn-accent{background:var(--accent);color:#fff;}
.btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink);}
.btn-sm{padding:8px 12px;font-size:13px;}
.tag{display:inline-flex;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;}
.tag.gray{background:#F3F0EA;color:var(--muted);}
.chip{border:1px solid var(--line);background:#fff;border-radius:20px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.seg{display:flex;background:#EFEBE3;border-radius:10px;padding:3px;gap:2px;}
.seg button{flex:1;border:none;background:transparent;border-radius:8px;padding:8px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--muted);}
.seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.nav{display:none;}
.widget-grid{display:grid;gap:12px;margin-top:16px;}
.widget{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;cursor:pointer;}
.widget h3{font-size:14px;font-weight:800;margin-bottom:8px;}
.widget .num{font-size:28px;font-weight:900;color:var(--accent-deep);}
.widget .sub{font-size:12px;color:var(--muted);margin-top:4px;}
.list-item{display:flex;gap:12px;padding:14px;background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:10px;cursor:pointer;}
.list-item .ttl{font-weight:700;font-size:15px;}
.list-item .meta{font-size:12px;color:var(--muted);margin-top:4px;}
.field{margin-bottom:14px;}
.field label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;}
.field input,.field select,.field textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font:inherit;font-size:14px;}
.field textarea{min-height:100px;resize:vertical;}
/* 공용 인풋 */
.input{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font:inherit;font-size:13.5px;color:var(--ink);background:#fff;transition:border-color .12s,box-shadow .12s;box-sizing:border-box;}
.input::placeholder{color:#B8B1A6;}
.input:hover{border-color:#DAD3C7;}
.input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
select.input{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:30px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2.5 4.5l3.5 3.5 3.5-3.5' stroke='%238C857A' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 11px center;}
textarea.input{resize:vertical;min-height:58px;line-height:1.5;}
/* 설치일정 편집 폼 */
.isf-modal{width:min(900px,100%);max-height:90vh;display:flex;flex-direction:column;border-radius:18px;padding:0;overflow:hidden;background:var(--card);box-shadow:0 24px 60px -18px rgba(20,16,12,.4);}
.isf-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:17px 22px;border-bottom:1px solid var(--line);flex:0 0 auto;}
.isf-body{padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;}
.isf-foot{display:flex;justify-content:flex-end;gap:8px;padding:13px 22px;border-top:1px solid var(--line);background:var(--paper);flex:0 0 auto;}
.isf-sec-hd{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.02em;color:var(--accent-deep);margin-bottom:11px;}
.isf-sec-hd::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--accent);display:inline-block;}
.isf-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px 14px;}
.isf-f{display:flex;flex-direction:column;gap:5px;min-width:0;grid-column:span 6;}
.isf-f.c3{grid-column:span 3;}
.isf-f.c4{grid-column:span 4;}
.isf-f.c8{grid-column:span 8;}
.isf-f.full{grid-column:1/-1;}
.isf-f > span{font-size:11.5px;font-weight:700;color:var(--muted);}
@media(max-width:640px){.isf-f,.isf-f.c3,.isf-f.c4,.isf-f.c8{grid-column:1/-1;}}
/* 확인 다이얼로그 (confirmAction) — ERP 모드에도 필요 */
.sheetbg{position:fixed;inset:0;background:rgba(20,16,12,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeUp .2s ease both;}
.sheet{width:100%;max-width:400px;background:var(--card);border-radius:20px;padding:20px 22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.22);animation:fadeUp .22s ease both;}
.confirm-bg{z-index:500;}
.confirm-sheet{max-width:340px;text-align:center;padding:26px 22px 22px;}
.confirm-icon{width:52px;height:52px;border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;background:#FFF0EB;color:#B85C4A;}
.confirm-title{margin:0;font-weight:800;font-size:18px;line-height:1.35;color:var(--ink);}
.confirm-msg{margin:10px 0 0;font-size:14px;line-height:1.5;color:var(--muted);}
.confirm-actions{display:flex;gap:10px;margin-top:22px;}
.confirm-actions .btn{flex:1;padding:14px;font-size:15px;}
.confirm-danger{background:#B85C4A;color:#fff;}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.status-pill{display:inline-flex;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;}
.status-pill.wait{background:#FFF3E0;color:#E65100;}
.status-pill.done{background:#E8F5E9;color:var(--ok);}
.status-pill.reject{background:#FFEBEE;color:#C62828;}
.kbh-search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;}
.kbh-search input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:14.5px;}
.kbh-cats{display:flex;gap:8px;overflow-x:auto;margin-top:14px;padding-bottom:2px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;}
.kbh-cats::-webkit-scrollbar{display:none;}
.kbh-cat{flex:0 0 auto;border:1px solid var(--line);background:#fff;border-radius:20px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
.kbh-cat.on{background:var(--ink);color:#fff;}
.kbh-sech{font-size:12px;font-weight:800;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin:22px 0 10px;}
.kbh-feat{position:relative;border-radius:20px;overflow:hidden;border:1px solid var(--line);cursor:pointer;margin-bottom:4px;}
.kbh-feat .cover{height:130px;background:linear-gradient(135deg,#DD5E39,#C2491F);}
.kbh-feat .body{padding:15px 16px 17px;background:#fff;}
.kbh-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;}
.kbh-feat .kbh-meta{margin-bottom:8px;}
.kbh-feat .ttl{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.3;}
.kbh-feat .ex{color:var(--muted);font-size:13px;line-height:1.55;margin-top:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.kbh-pin{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.35);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;}
.kbh-item{display:flex;gap:14px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:10px;cursor:pointer;}
.kbh-thumb{width:66px;height:66px;border-radius:12px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#fff;overflow:hidden;}
.kbh-thumb img{width:100%;height:100%;object-fit:cover;}
.kbh-thumb.book{width:52px;height:72px;border-radius:8px;}
.kbh-item .ttl{font-weight:700;font-size:15px;letter-spacing:-.01em;line-height:1.35;}
.kbh-item .ex{color:var(--muted);font-size:12.5px;line-height:1.5;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.kbh-info{display:flex;align-items:center;gap:7px;margin-top:8px;flex-wrap:wrap;}
.kbh-dot{font-size:11.5px;color:#C0B9AC;}
.kbh-attach{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--accent-deep);font-weight:700;}
.kbh-list.kbh-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.kbh-list.kbh-board .kbh-item{flex-direction:column;margin-bottom:0;padding:12px;align-items:stretch;}
.kbh-list.kbh-board .kbh-thumb{width:100%;height:80px;border-radius:10px;}
.kbh-list.kbh-board .kbh-thumb.book{width:100%;height:104px;}
.kbh-list.kbh-listview{display:flex;flex-direction:column;gap:8px;}
.kbh-list.kbh-listview .kbh-item{margin-bottom:0;padding:12px 14px;}
.kbh-list.kbh-listview .kbh-thumb{width:52px;height:52px;}
.kbh-list.kbh-listview .kbh-thumb.book{width:44px;height:58px;}
.kbh-list.kbh-listview .kbh-item .ex{-webkit-line-clamp:1;}
.kbh-viewbar{display:flex;align-items:center;justify-content:flex-end;margin-top:14px;}
.spinner{width:32px;height:32px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:40px auto;}
@keyframes spin{to{transform:rotate(360deg)}}
.fade{animation:fadeIn .25s ease;}
.screen>.fade,.kb-feed{animation:none;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.detail-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:#fff;}
.detail-bar button{border:none;background:transparent;cursor:pointer;padding:4px;}
.approval-draft-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;flex-shrink:0;padding:8px 14px!important;}
.approval-draft-icon{font-size:18px;line-height:1;font-weight:700;display:inline-block;}
.approval-chain-hint{background:#E8F0FE;border:1px solid #AECBFA;border-radius:12px;padding:12px 14px;margin:12px 0;font-size:13px;color:#174EA6;line-height:1.5;}
.approval-step-line{display:flex;flex-direction:column;gap:6px;margin-top:8px;}
.approval-step-item{font-size:13px;padding:8px 12px;background:#F8F9FA;border-radius:8px;border:1px solid var(--line);}
.refund-detail{display:grid;gap:10px;}
.refund-row{display:grid;grid-template-columns:110px 1fr;gap:8px;font-size:14px;align-items:start;}
.refund-row .lbl{color:var(--muted);font-weight:600;}
.refund-row .val{word-break:break-word;}
.refund-amount{font-size:20px;font-weight:800;color:var(--accent-deep);}
.leave-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0;}
.leave-policy{background:#F8F9FA;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0;font-size:12px;color:var(--muted);line-height:1.7;}
.leave-cal-nav{display:flex;align-items:center;justify-content:space-between;margin:12px 0;}
.leave-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.leave-cal-hd{text-align:center;font-size:11px;font-weight:700;color:var(--muted);padding:6px 0;}
.leave-cal-cell{min-height:72px;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff;}
.leave-cal-cell.off{background:#FAFAFA;}
.leave-cal-daynum{font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;}
.leave-cal-daynum.today{color:var(--accent-deep);}
.leave-chip{font-size:10px;padding:2px 5px;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;}
.leave-status-table{width:100%;border-collapse:collapse;font-size:13px;}
.leave-status-table th,.leave-status-table td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right;}
.leave-status-table th:first-child,.leave-status-table td:first-child{text-align:left;}
.leave-status-table th{font-size:11px;color:var(--muted);font-weight:700;}
.leave-dept-hd{font-size:13px;font-weight:800;margin:16px 0 8px;color:var(--accent-deep);}
.sales-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 8px;}
.sales-tab{border:1px solid var(--line);background:#fff;color:var(--text);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;}
.sales-tab.on{background:var(--accent-deep);color:#fff;border-color:var(--accent-deep);}
.sales-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0;}
.sales-progress{background:#F3F8FF;border:1px solid #BBDEFB;border-radius:12px;padding:10px 12px;margin:12px 0;font-size:13px;line-height:1.5;}
.sales-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;max-height:70vh;}
.sales-table{width:max-content;min-width:100%;border-collapse:collapse;font-size:12px;}
.sales-table th,.sales-table td{padding:8px 10px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;vertical-align:top;}
.sales-table th{position:sticky;top:0;background:#F8F9FA;z-index:1;font-weight:700;color:var(--muted);text-align:left;}
@media(hover:hover){.sales-table tr:hover td{background:#FAFCFF;}}
.trend-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:12px 0;}
.trend-industry-picker{min-width:220px;max-width:360px;}
.trend-industry-chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;background:#F1F1EF;font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;}
.trend-industry-chip.muted{color:#777;background:#F8F9FA;}
.trend-selection-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 14px;margin-bottom:8px;border:1px solid #F0C4A8;background:#FFF7F2;border-radius:10px;font-size:13px;min-height:42px;transition:border-color .15s,background .15s;}
.trend-selection-bar.empty{border-color:var(--line);background:var(--card);}
.trend-selection-empty{color:var(--muted);}
.trend-selection-bar strong{font-size:15px;color:var(--accent);}
.trend-selection-label{font-weight:700;}
.trend-selection-hint{margin:-4px 0 10px;color:var(--muted);}
.trend-table-wrap{overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;border:1px solid var(--line);border-radius:12px;background:#fff;max-height:min(68vh,560px);}
.trend-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12px;}
.trend-table th,.trend-table td{padding:8px 10px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);white-space:nowrap;vertical-align:top;}
.trend-table th{position:sticky;top:0;background:#F8F9FA;z-index:2;font-weight:700;color:var(--muted);text-align:right;}
.trend-table th.trend-month-hd,.trend-table td.trend-month{position:sticky;left:0;z-index:1;background:#fff;text-align:left;font-weight:700;min-width:88px;}
.trend-table th.trend-month-hd{z-index:3;background:#F8F9FA;}
.trend-table td.num{text-align:right;font-variant-numeric:tabular-nums;}
.trend-table td.zero{color:#C5C8CC;}
@media(hover:hover){.trend-table tr:hover td{background:#FAFCFF;}}
@media(hover:hover){.trend-table tr:hover td.trend-month{background:#FAFCFF;}}
.trend-table .trend-selectable{cursor:pointer;user-select:none;}
.trend-table .trend-selectable.selected{background:#FFE8DC !important;color:#8A3B12;}
.trend-table th.trend-selectable.selected{color:#8A3B12;}
.trend-table td.trend-month.trend-selectable.selected{font-weight:800;}
@media(min-width:900px){
.trend-table-wrap{max-height:72vh;}
}
.dash-summary{display:grid;grid-template-columns:1fr;gap:14px;margin:16px 0;}
.dash-summary-card{border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;}
.dash-gauge-wrap{display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dash-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex:1;min-width:200px;}
.dash-stat{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#FAFAF8;}
.dash-stat .lbl{font-size:11px;font-weight:700;color:var(--muted);}
.dash-stat .val{font-size:20px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;}
.dash-stat .val.pos{color:#0D7A3E;}
.dash-stat .val.neg{color:#C5221F;}
.dash-month-picks{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0;}
.dash-month-chip{border:1px solid var(--line);background:#F8F9FA;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;}
.dash-month-chip.on{background:var(--accent-deep);color:#fff;border-color:var(--accent-deep);}
.dash-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;margin-top:10px;}
.dash-table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px;}
.dash-table th,.dash-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle;}
.dash-table th{background:#F8F9FA;font-weight:700;color:var(--muted);white-space:nowrap;}
.dash-table td.label{text-align:left;font-weight:700;min-width:120px;position:sticky;left:0;background:#fff;z-index:1;}
.dash-table th.label{text-align:left;min-width:120px;position:sticky;left:0;z-index:2;background:#F8F9FA;}
.dash-table td.num{font-variant-numeric:tabular-nums;}
.dash-table td.gap-pos{color:#0D7A3E;font-weight:700;}
.dash-table td.gap-neg{color:#C5221F;font-weight:700;}
.dash-bar-cell{min-width:140px;}
.dash-bar{height:8px;background:#ECEEF0;border-radius:999px;overflow:hidden;}
.dash-bar-fill{height:100%;border-radius:999px;transition:width .3s ease;}
.dash-goal-hint{margin:8px 0 0;color:var(--muted);line-height:1.5;}
.dash-goal-warn{margin:8px 0 0;padding:10px 12px;border-radius:10px;background:#FFF4E5;color:#8A3B12;line-height:1.5;}
.dash-goal-input{width:72px;min-height:32px;padding:4px 8px;border:1px solid var(--line);border-radius:8px;font-family:inherit;font-size:13px;text-align:right;}
.dash-goal-mismatch td{background:#FFF8F5;}
.dash-matrix-table td.dash-matrix-cell{min-width:72px;}
.dash-weekly-table td.dash-weekly-cell{min-width:64px;}
.dash-weekly-cell .actual{font-weight:700;}
.dash-drill-hd{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0 4px;}
.dash-drill-hd strong{font-size:16px;}
.dash-drill-link{border:none;background:none;padding:0;font:inherit;font-weight:700;color:var(--accent-deep);cursor:pointer;text-align:left;}
.dash-drill-link:hover{text-decoration:underline;}
.dash-drill-row .label .dash-drill-link{width:100%;}
.dash-drill-row:hover td{background:#FFF8F5;}
.daily-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0;}
.daily-stat{border:1px solid var(--line);border-radius:12px;background:#fff;padding:14px 16px;}
.daily-stat .lbl{font-size:12px;font-weight:700;color:var(--muted);}
.daily-stat .val{font-size:28px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums;}
.daily-stat.inquiry .val{color:#2383E2;}
.daily-stat.order .val{color:#0D7A3E;}
.daily-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;margin-top:10px;}
.daily-table{width:100%;border-collapse:collapse;font-size:13px;min-width:360px;}
.daily-table th,.daily-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle;}
.daily-table th{background:#F8F9FA;font-weight:700;color:var(--muted);}
.daily-table td.industry{text-align:left;font-weight:700;position:sticky;left:0;background:#fff;z-index:1;}
.daily-table th.industry{z-index:2;background:#F8F9FA;text-align:left;}
.daily-table td.num{font-variant-numeric:tabular-nums;}
.daily-table td.zero{color:#C5C8CC;}
.daily-table tr.total td{background:#FFF8F0;font-weight:800;}
.daily-table tr.total td.industry{background:#FFF8F0;}
.daily-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:12px 0;}
.daily-toolbar .field{margin:0;min-width:0;}
.daily-date-nav{display:flex;align-items:center;gap:6px;}
.daily-date-nav button{width:40px;height:40px;padding:0;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:18px;line-height:1;cursor:pointer;color:var(--text);}
.daily-date-nav button:hover{background:#F8F9FA;}
.daily-date-nav input[type=date]{min-height:40px;min-width:150px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-size:14px;}
.daily-period-tabs{display:flex;gap:6px;flex-wrap:wrap;}
.daily-period-tab{border:1px solid var(--line);background:#F8F9FA;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;}
.daily-period-tab.on{background:var(--accent-deep);color:#fff;border-color:var(--accent-deep);}
@media(min-width:700px){
.dash-summary{grid-template-columns:1fr;}
.dash-stats{grid-template-columns:repeat(4,minmax(0,1fr));}
}
.sidenav-group{font-size:11px;font-weight:800;color:var(--muted);padding:14px 12px 6px;letter-spacing:.02em;}
.sidenav-top{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;}
.sidenav-admin{margin-top:auto;padding-top:12px;border-top:1px solid var(--line);}
.sidenav-admin .sidenav-group{padding-top:0;}
.sidenav-subitem{padding-left:22px;font-size:13px;gap:10px;}
.rate-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;}
.rate-filters select,.rate-filters input{min-width:140px;}
.rate-page{max-width:100%;}
/* 결제율 분석은 표가 넓어 기본 .pad 840px 제한을 풀어 남는 폭을 씀 (반응형: 넘칠 때만 가로 스크롤) */
.pad.rate-page{max-width:1280px;}
.rate-filter-panel{padding:0;overflow:visible;margin:14px 0;}
.rate-filter-panel-hd{padding:12px 14px;font-size:12px;font-weight:800;color:var(--muted);border-bottom:1px solid var(--line);background:#FAFAF8;border-radius:16px 16px 0 0;}
.rate-filter-panel-body{padding:14px;display:grid;gap:14px;overflow:visible;position:relative;}
.rate-filter-industry{margin-bottom:0;}
.rate-filter-panel .trend-industry-picker{min-width:0;}
.rate-groups-section{margin:12px 0;}
.rate-groups-top{border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px 14px;margin-bottom:10px;}
.rate-groups-top-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}
.rate-groups-top-hd strong{font-size:14px;}
.rate-groups-presets{display:flex;flex-wrap:wrap;gap:6px;margin-top:0;}
.rate-groups{display:flex;flex-direction:row;flex-wrap:nowrap;gap:10px;margin:0;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;}
.rate-group-card{flex:0 0 min(300px,78vw);min-width:260px;scroll-snap-align:start;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;}
.rate-group-hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;}
.rate-group-actions{display:flex;gap:4px;flex-wrap:wrap;}
.rate-month-picks{display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow:auto;padding:4px 0;}
.rate-month-chip{border:1px solid var(--line);background:#F8F9FA;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;}
.rate-month-chip.on{background:var(--accent-deep);color:#fff;border-color:var(--accent-deep);}
.rate-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;margin-top:12px;}
.rate-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.rate-table{width:100%;border-collapse:collapse;font-size:13px;}
.rate-table th,.rate-table td{padding:10px 12px;border:1px solid var(--line);text-align:center;}
.rate-table th{background:#F8F9FA;font-weight:700;white-space:nowrap;}
.rate-table td.metric-label{background:#FFF3E8;font-weight:800;text-align:left;min-width:160px;position:sticky;left:0;z-index:1;}
.rate-table tr.metric-pct td.metric-label{background:#FFE8D6;}
.rate-table td.num{font-variant-numeric:tabular-nums;}
.rate-table td.num .rate-avg-sub{font-size:11px;font-weight:500;color:var(--muted);margin-top:2px;white-space:nowrap;}
/* 비교군 클릭 강조: 헤더 클릭 → 그 비교군 열(과 해당 월 행) 하이라이트 */
.rate-table th.grp-click{cursor:pointer;user-select:none;}
@media(hover:hover){.rate-table th.grp-click:hover{background:#F3EFE8;}}
.rate-table th.grp-sel,.rate-table th.grp-click.grp-sel:hover{background:var(--accent-soft);color:var(--accent-deep);}
/* 떨어진 지표 자동 점검 패널 */
.rate-alerts{margin-top:12px;border:1px solid #F3C4B5;background:#FFF9F7;border-radius:12px;padding:12px 14px;}
.rate-alerts.ok{border-color:#CFE4CF;background:#F6FBF6;}
.rate-alerts-hd{font-size:13.5px;font-weight:800;margin-bottom:6px;line-height:1.5;}
.rate-alerts.ok .rate-alerts-hd{margin-bottom:0;}
.rate-alert-row{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;padding:6px 0;border-bottom:1px dashed #F0E0D6;font-size:13px;}
.rate-alert-row:last-of-type{border-bottom:none;}
.ra-dim{font-weight:800;}
.ra-seg{font-size:11px;font-weight:700;background:#F3F0EA;color:var(--muted);border-radius:6px;padding:2px 6px;}
.ra-metric{color:var(--muted);font-weight:600;}
.ra-now{font-weight:800;font-variant-numeric:tabular-nums;}
.ra-delta{font-weight:800;color:#C0392B;font-variant-numeric:tabular-nums;}
/* 비교군 2개 선택 시 왼쪽 비교군 셀: 오른쪽보다 떨어지면 분홍, 올라가면 파랑 */
.rate-table td.num.rate-down{background:#FBE3E4;box-shadow:inset 0 0 0 1px #F3B5BC;}
.rate-table td.num.rate-up{background:#E2EEFB;box-shadow:inset 0 0 0 1px #B7D3F0;}
.rate-group-card.sel{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);cursor:pointer;}
.rate-group-card{cursor:pointer;}
.rate-plan-block{margin-top:20px;}
.rate-plan-title{font-size:14px;font-weight:800;margin:0 0 8px;color:var(--accent-deep);}
.rate-plan-compare th.plan-col,.rate-plan-compare td.plan-col{text-align:left;font-weight:800;min-width:120px;position:sticky;left:0;background:#FFF3E8;z-index:2;}
.rate-plan-compare th.plan-col{z-index:3;background:#F8F9FA;}
.rate-plan-cell{text-align:left;font-size:11px;line-height:1.5;min-width:108px;vertical-align:top;}
.rate-plan-cell.empty{text-align:center;vertical-align:middle;}
.rate-plan-cell div{display:flex;justify-content:space-between;gap:8px;}
.rate-plan-cell .lbl{color:var(--muted);flex-shrink:0;}
.rate-plan-cell .pct{font-weight:700;color:var(--accent-deep);}

.assignee-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:600;line-height:1.3;white-space:nowrap;}
.assignee-badge.compact{font-size:12px;padding:3px 8px;}
.assignee-badge.all{background:#F1F1EF;color:#55534E;}
.assignee-picker{position:relative;margin-top:0;z-index:1;}
.assignee-picker.open{z-index:50;}
.assignee-picker-label{display:block;font-size:12px;font-weight:800;color:var(--muted);margin-bottom:6px;}
.assignee-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:42px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-family:inherit;cursor:pointer;text-align:left;position:relative;z-index:1;}
.assignee-picker-trigger.open{border-color:#2383E2;box-shadow:0 0 0 3px rgba(35,131,226,.12);z-index:2;}
.assignee-picker-value{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0;}
.assignee-picker-chev{font-size:10px;color:var(--muted);flex-shrink:0;}
.assignee-picker-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:60;background:#fff;border:1px solid #E8EAED;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.12);overflow:hidden;}
.assignee-picker-search{width:100%;border:none;border-bottom:1px solid #F0F0F0;padding:12px 14px;font-family:inherit;font-size:14px;outline:none;}
.assignee-picker-list{max-height:280px;overflow-y:auto;padding:6px 0;}
.assignee-picker-row{display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 12px;border:none;background:transparent;font-family:inherit;cursor:pointer;text-align:left;}
.assignee-picker-row:hover,.assignee-picker-row.on{background:#F7F6F3;}
.assignee-picker-check{font-size:13px;font-weight:800;color:#2383E2;}
.assignee-picker-foot{padding:8px 10px;border-top:1px solid #F0F0F0;display:flex;justify-content:flex-end;}
.rate-plan-compare td.plan-col .assignee-badge{vertical-align:middle;}
.rate-stats-panel{margin-top:4px;}
.rate-stats-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px;}
.rate-stats-controls select{min-width:180px;min-height:40px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-size:14px;}
.rate-chart-wrap{border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px 8px 8px;overflow-x:auto;}
.rate-chart{display:block;width:100%;min-width:520px;height:auto;}
.rate-chart-empty{padding:32px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:12px;}
.rate-chart-legend{display:flex;flex-wrap:wrap;gap:12px;padding:8px 4px 0;font-size:12px;font-weight:600;}
.rate-chart-legend-item{display:inline-flex;align-items:center;gap:6px;}
.rate-chart-swatch{width:14px;height:3px;border-radius:2px;display:inline-block;}
.rate-chart-swatch.dashed{height:0;border-top:3px dashed;border-radius:0;}
.ch-filter{border:1px solid var(--line);border-radius:12px;background:#fff;margin:12px 0;overflow:hidden;}
.ch-filter-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;user-select:none;}
.ch-filter-hd strong{font-size:14px;flex:1;}
.ch-filter-body{padding:0 14px 12px;border-top:1px solid var(--line);}
.ch-filter-search{width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;margin-bottom:10px;}
.ch-filter-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
.ch-group{margin-bottom:10px;}
.ch-group-title{font-size:12px;font-weight:800;color:var(--accent-deep);margin-bottom:6px;}
.ch-node{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;cursor:pointer;}
.ch-node input{width:16px;height:16px;flex-shrink:0;cursor:pointer;}
.ch-node.depth-1{padding-left:16px;}
.ch-node.depth-2{padding-left:32px;font-size:12px;color:var(--muted);}
.ch-node label{cursor:pointer;flex:1;}
@media(min-width:900px){
  .mobile-header{display:none;}
  .app-sidebar{display:flex;}
  .screen{padding:20px 32px 40px;}
  .pad{max-width:840px;margin:0 auto;}
  .widget-grid{grid-template-columns:repeat(2,1fr);}
  .kbh-list.kbh-board{gap:12px;}
  .kbh-fab{right:32px;bottom:32px;}
}
@media(min-width:1200px){
  .widget-grid{grid-template-columns:repeat(3,1fr);}
  .kbh-list.kbh-board{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
  .kbh-feat .cover{height:180px;}
}

/* ===== 공용 통계 시각화 (표/막대/꺾은선/도넛 전환) ===== */
.viz-block{margin:10px 0;}
.viz-block-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;}
.viz-block-title{font-size:14px;font-weight:800;color:var(--ink);letter-spacing:-.01em;}
.viz-block-right{display:flex;align-items:center;gap:8px;margin-left:auto;}
.viz-switch{display:inline-flex;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px;}
.viz-switch-btn{display:inline-flex;align-items:center;gap:5px;border:none;background:transparent;font:inherit;font-size:12.5px;font-weight:700;color:var(--muted);padding:6px 11px;border-radius:8px;cursor:pointer;white-space:nowrap;}
.viz-switch-btn.on{background:var(--card);color:var(--accent-deep);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.viz-switch-ic{font-size:12px;line-height:1;}
.viz-block-body{min-height:40px;}
@media(max-width:560px){.viz-switch-lbl{display:none;}.viz-switch-btn{padding:7px 9px;}}

.viz-wrap{width:100%;position:relative;}
.viz-svg{width:100%;height:auto;display:block;overflow:visible;}
.viz-grid{stroke:var(--line);stroke-width:1;}
.viz-axis{fill:var(--muted);font-size:10.5px;font-family:inherit;}
.viz-bar{transition:opacity .12s;cursor:pointer;}
.viz-bar:hover{opacity:.82;}
.viz-donut-seg{cursor:pointer;transition:opacity .12s;}
.viz-donut-seg:hover{opacity:.85;}

/* hover 값 툴팁 */
.viz-tip{position:absolute;z-index:20;pointer-events:none;transform:translate(-50%,calc(-100% - 12px));background:#232019;color:#F5F2EC;border-radius:9px;padding:7px 10px;box-shadow:0 6px 20px rgba(0,0,0,.28);white-space:nowrap;font-size:12px;min-width:70px;}
.viz-tip-title{font-weight:800;font-size:11.5px;margin-bottom:4px;color:#fff;letter-spacing:-.01em;}
.viz-tip-row{display:flex;align-items:center;gap:7px;line-height:1.5;}
.viz-tip-dot{width:9px;height:9px;border-radius:2px;flex:0 0 auto;}
.viz-tip-label{color:#CFC9BE;font-weight:600;}
.viz-tip-val{margin-left:auto;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;}
.viz-empty{padding:40px 12px;text-align:center;color:var(--muted);font-size:13px;background:var(--paper);border-radius:12px;}
.viz-legend{display:flex;flex-wrap:wrap;gap:10px 16px;justify-content:center;margin-top:10px;}
.viz-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ink);}
.viz-swatch{width:11px;height:11px;border-radius:3px;flex:0 0 auto;border:1px solid transparent;}

.viz-donut-wrap{display:flex;align-items:center;gap:22px;flex-wrap:wrap;justify-content:center;padding:8px 0;position:relative;}
.viz-donut-legend-item{cursor:default;}
.viz-donut{flex:0 0 auto;}
.viz-donut-total{font-size:22px;font-weight:800;fill:var(--ink);}
.viz-donut-sub{font-size:11px;fill:var(--muted);font-weight:700;letter-spacing:.05em;}
.viz-donut-legend{display:flex;flex-direction:column;gap:8px;min-width:180px;}
.viz-donut-legend-item{display:flex;align-items:center;gap:8px;font-size:13px;}
.viz-donut-legend-label{font-weight:700;color:var(--ink);flex:1;min-width:0;}
.viz-donut-legend-val{color:var(--muted);font-weight:600;font-size:12px;white-space:nowrap;}

/* ===== UI/UX 리파인 (카드·버튼·통계표 정리, 모두 가산 스타일) ===== */
.card,.widget{box-shadow:0 1px 2px rgba(27,26,23,.05);}
.widget{transition:box-shadow .15s,transform .12s;}
.widget:hover{box-shadow:0 8px 20px -10px rgba(27,26,23,.22);transform:translateY(-1px);}
.btn{transition:filter .12s,transform .06s;}
.btn:active{transform:translateY(.5px);}
.btn-accent:hover{filter:brightness(1.05);}
.btn-ghost:hover{background:var(--paper);}
.chip{transition:background .12s,border-color .12s,color .12s;}
.chip:hover:not(.on){border-color:var(--muted);color:var(--ink);}
.list-item{transition:box-shadow .15s,transform .1s;}
.list-item:hover{box-shadow:0 6px 16px -10px rgba(27,26,23,.2);}
.sidenavitem{transition:background .12s,color .12s;}
.sidenavitem:hover:not(.on){background:var(--paper);color:var(--ink);}
/* 통계표: 숫자 tabular-nums + 행 hover */
.dash-table .num,.trend-table .num,.daily-table .num,.rate-table .num,.sales-table td{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";}
.dash-table tbody tr,.daily-table tbody tr{transition:background .12s;}
/* 행 hover는 마우스 기기에서만 — 터치(폰/패드)에서는 탭한 행이 칠해진 채 남는 문제 방지. rate-table은 배경색이 '뒤처진 지표' 전용이라 행 hover 제외 */
@media(hover:hover){.dash-table tbody tr:hover,.daily-table tbody tr:hover{background:var(--accent-soft);}}

/* ===== 문의/결제 대시보드 드릴다운 ===== */
.daily-summary .daily-stat{border:none;font-family:inherit;text-align:left;cursor:pointer;width:100%;transition:box-shadow .15s,transform .12s;}
.daily-summary .daily-stat:hover{box-shadow:0 8px 20px -10px rgba(27,26,23,.25);transform:translateY(-1px);}
.daily-stat-hint{margin-top:6px;font-size:11.5px;font-weight:700;color:var(--muted);}
.daily-cell-btn{border:none;background:transparent;font:inherit;font-size:inherit;font-weight:inherit;color:var(--accent-deep);cursor:pointer;padding:2px 8px;border-radius:8px;font-variant-numeric:tabular-nums;text-decoration:underline;text-underline-offset:3px;text-decoration-color:color-mix(in srgb,var(--accent) 40%,transparent);}
.daily-cell-btn:hover{background:var(--accent-soft);}

.daily-drill-back{position:fixed;inset:0;z-index:360;background:rgba(20,16,12,.42);display:flex;align-items:flex-end;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));}
.daily-drill{width:min(460px,100%);max-height:min(78vh,620px);overflow-y:auto;background:var(--card);border-radius:20px 20px 0 0;
  padding:18px 18px max(18px,env(safe-area-inset-bottom));box-shadow:0 -8px 40px rgba(0,0,0,.28);animation:drillUp .22s ease;}
@keyframes drillUp{from{transform:translateY(24px);opacity:.4}to{transform:translateY(0);opacity:1}}
.daily-drill-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px;}
.daily-drill-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-deep);}
.daily-drill-title{font-size:16px;font-weight:800;letter-spacing:-.01em;margin-top:3px;}
.daily-drill-x{border:none;background:var(--paper);width:32px;height:32px;border-radius:10px;cursor:pointer;color:var(--muted);font-size:14px;flex:0 0 auto;}
.daily-drill-x:hover{background:var(--line);color:var(--ink);}
.daily-drill-list{display:flex;flex-direction:column;gap:2px;}
.daily-drill-row{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid var(--line-soft,#F3EFE9);}
.daily-drill-row:last-child{border-bottom:none;}
.daily-drill-label{flex:0 0 40%;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.daily-drill-bar{flex:1;height:8px;background:var(--paper);border-radius:5px;overflow:hidden;}
.daily-drill-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--accent),var(--accent-deep));min-width:3px;}
.daily-drill-count{flex:0 0 auto;font-weight:800;font-variant-numeric:tabular-nums;min-width:28px;text-align:right;}
@media(min-width:640px){.daily-drill-back{align-items:center;}.daily-drill{border-radius:20px;}}

/* ===== 공사 견적 관리 ===== */
.cst-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch;}
.cst-quote-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:640px;}
.cst-quote-table th,.cst-quote-table td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:center;vertical-align:middle;white-space:nowrap;}
.cst-quote-table th{background:#F8F9FA;font-weight:800;color:var(--muted);font-size:12px;}
.cst-quote-table td.cst-num{font-variant-numeric:tabular-nums;text-align:right;}
.cst-quote-table tr:last-child td{border-bottom:none;}
.cst-total-row td{background:#FFF8F0;}
.cst-inp{width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:13px;background:#fff;}
.cst-inp-num{text-align:right;font-variant-numeric:tabular-nums;}
.cst-x{border:none;background:transparent;color:#B0ABA1;cursor:pointer;font-size:13px;width:26px;height:26px;border-radius:6px;}
.cst-x:hover{background:#FBECEC;color:#C0392B;}
.cst-flow{display:flex;gap:6px;flex-wrap:wrap;}
.cst-flow-btn{border:1px solid var(--line);background:#fff;border-radius:20px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;}
.cst-flow-btn.on{background:var(--accent);border-color:var(--accent);color:#fff;}
.cst-badge{display:inline-flex;align-items:center;font-size:11.5px;font-weight:800;padding:5px 10px;border-radius:20px;white-space:nowrap;flex:0 0 auto;}
.cst-badge-before{background:#F1F1EF;color:#6B665C;}
.cst-badge-ongoing{background:#E7F1F9;color:#1F6FB2;}
.cst-badge-done{background:#EAF6EE;color:#1E7A46;}
.cst-badge-settle{background:#FBEDE0;color:#B96A16;}
.cst-badge-settled{background:#E6F3EC;color:#0D7A3E;}
.cst-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
.cst-sum-card{border:1px solid var(--line);border-radius:12px;background:#fff;padding:13px 15px;}
.cst-sum-card .lbl{font-size:12px;font-weight:700;color:var(--muted);}
.cst-sum-card .val{font-size:19px;font-weight:800;margin-top:5px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}
.cst-sum-card.unsettled{border-color:#F0C4A8;background:#FFF7F2;}
.cst-sum-card.unsettled .val{color:var(--accent-deep);}
.cst-sum-card.settled{border-color:#BFE3CC;background:#EFF8F2;}
.cst-sum-card.settled .val{color:#0D7A3E;}
@media(max-width:560px){.cst-summary{grid-template-columns:1fr;}}

/* ── 공용 리스트 테이블 ── */
.erp-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:16px;background:var(--card);margin-top:14px;box-shadow:0 1px 2px rgba(20,16,12,.03);}
.erp-tbl{width:100%;border-collapse:collapse;font-size:13.5px;min-width:520px;}
.erp-tbl thead th{position:sticky;top:0;background:#FBFAF7;color:var(--muted);font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:11px 16px;border-bottom:1px solid var(--line);white-space:nowrap;z-index:1;}
.erp-tbl tbody td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink);line-height:1.4;}
.erp-tbl tbody tr:last-child td{border-bottom:none;}
.erp-tbl tbody tr.clickable{cursor:pointer;transition:background .12s;}
.erp-tbl tbody tr.clickable:hover td{background:#FBF7F3;}
.erp-tbl th.num,.erp-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.erp-tbl th.ctr,.erp-tbl td.ctr{text-align:center;}
.erp-tbl th.shrink,.erp-tbl td.shrink{width:1%;white-space:nowrap;}
.erp-tbl .cell-ttl{font-weight:700;color:var(--ink);}
.erp-tbl .cell-sub{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.35;}
.erp-tbl .cell-sub.clip{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;max-width:420px;}
.erp-tbl .row-actions{display:flex;gap:6px;justify-content:flex-end;white-space:nowrap;}
.erp-tbl-empty{text-align:center;padding:46px 16px;color:var(--muted);font-size:13px;line-height:1.6;}
.erp-tbl-cap{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:18px 0 0;}
.erp-tbl-cap .cnt{font-size:12.5px;font-weight:700;color:var(--muted);}
.erp-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#F1EDE5;color:#6B665C;white-space:nowrap;line-height:1.5;}
.erp-badge.green{background:#E7F5EC;color:#1B7A43;}
.erp-badge.blue{background:#E7F0FB;color:#1560C0;}
.erp-badge.orange{background:var(--accent-soft);color:var(--accent-deep);}
.erp-badge.gray{background:#F1EDE5;color:#8C857A;}
.erp-tag-chip{display:inline-block;font-size:11px;color:var(--muted);background:#F5F1EA;border-radius:6px;padding:2px 7px;margin-right:4px;white-space:nowrap;}
.erp-btn-x{border:1px solid var(--line);background:#fff;color:#C0392B;border-radius:8px;width:28px;height:28px;font:inherit;font-size:13px;cursor:pointer;line-height:1;}
.erp-btn-x:hover{background:#FDECEA;border-color:#F3B8AE;}
@media(max-width:560px){.erp-tbl{font-size:13px;}.erp-tbl thead th,.erp-tbl tbody td{padding:10px 12px;}}

/* 카카오맵 장소검색 드롭다운 */
.kakao-pop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 28px -14px rgba(20,16,12,.4);max-height:300px;overflow-y:auto;}
.kakao-pop button{display:block;width:100%;text-align:left;border:none;background:none;padding:10px 14px;cursor:pointer;font-family:inherit;border-bottom:1px solid var(--line-soft,#F3EFE9);}
.kakao-pop button:last-child{border-bottom:none;}
.kakao-pop button:hover{background:var(--paper);}

${CALENDAR_CSS}
${KB_CSS}
`;
