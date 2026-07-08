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
.sales-table tr:hover td{background:#FAFCFF;}
.sidenav-group{font-size:11px;font-weight:800;color:var(--muted);padding:14px 12px 6px;letter-spacing:.02em;}
.sidenav-top{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;}
.sidenav-admin{margin-top:auto;padding-top:12px;border-top:1px solid var(--line);}
.sidenav-admin .sidenav-group{padding-top:0;}
.sidenav-subitem{padding-left:22px;font-size:13px;gap:10px;}
.rate-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;}
.rate-filters select,.rate-filters input{min-width:140px;}
.rate-page{max-width:100%;}
.rate-groups{display:flex;flex-direction:row;flex-wrap:nowrap;gap:10px;margin:12px 0;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;}
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
.rate-plan-block{margin-top:20px;}
.rate-plan-title{font-size:14px;font-weight:800;margin:0 0 8px;color:var(--accent-deep);}
.rate-plan-compare th.plan-col,.rate-plan-compare td.plan-col{text-align:left;font-weight:800;min-width:120px;position:sticky;left:0;background:#FFF3E8;z-index:2;}
.rate-plan-compare th.plan-col{z-index:3;background:#F8F9FA;}
.rate-plan-cell{text-align:left;font-size:11px;line-height:1.5;min-width:108px;vertical-align:top;}
.rate-plan-cell.empty{text-align:center;vertical-align:middle;}
.rate-plan-cell div{display:flex;justify-content:space-between;gap:8px;}
.rate-plan-cell .lbl{color:var(--muted);flex-shrink:0;}
.rate-plan-cell .pct{font-weight:700;color:var(--accent-deep);}
.rate-assignee-filter{border-top:1px solid var(--line);padding-top:12px;}
.rate-assignee-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}
.rate-assignee-hd label{font-size:12px;font-weight:800;color:var(--muted);}
.rate-assignee-search{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;margin-bottom:8px;}
.rate-assignee-picks{display:flex;flex-wrap:wrap;gap:6px;max-height:120px;overflow:auto;padding-bottom:2px;}
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
.rate-simple-filters{display:grid;gap:12px;margin:14px 0;}
.rate-simple-row{display:grid;gap:10px;}
.rate-compare-seg{display:flex;flex-wrap:wrap;gap:6px;}
.rate-compare-seg button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--muted);}
.rate-compare-seg button.on{background:var(--accent-deep);color:#fff;border-color:var(--accent-deep);}
@media(min-width:600px){
  .rate-simple-row{grid-template-columns:1fr 1fr;}
}
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
${CALENDAR_CSS}
${KB_CSS}
`;
