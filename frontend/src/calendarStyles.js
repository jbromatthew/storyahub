/** Google Calendar 스타일 — ErpApp·App 공통 */
export const CALENDAR_CSS = `
.iconbtn{width:40px;height:40px;border:none;background:#fff;border:1px solid var(--line);border-radius:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:18px;color:var(--ink);flex-shrink:0;}
.iconbtn:active{background:#F4F1EA;}
.section-h{font-size:15px;font-weight:800;margin:16px 0 10px;letter-spacing:-.02em;}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.cal-wrap{height:100%;min-height:0;display:flex;flex-direction:column;background:#fff;}
.cal-layout{display:flex;flex:1;min-height:0;gap:0;}
.cal-sidebar{display:none;width:256px;flex-shrink:0;border-right:1px solid #DADCE0;padding:16px 14px;overflow-y:auto;background:#fff;}
@media(min-width:900px){.cal-sidebar{display:block;}}
.cal-mini-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.cal-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:20px;}
.cal-mini-dow{font-size:10px;font-weight:500;text-align:center;color:#70757a;padding:4px 0;}
.cal-mini-cell{border:none;background:none;font-family:inherit;font-size:11px;font-weight:500;border-radius:50%;width:28px;height:28px;margin:0 auto;padding:0;cursor:pointer;color:#3c4043;display:flex;align-items:center;justify-content:center;}
.cal-mini-cell.adjacent{color:#70757a;}
.cal-mini-cell.muted{color:transparent;cursor:default;}
.cal-mini-cell.sel{background:#1a73e8;color:#fff;}
.cal-mini-cell.today:not(.sel){color:#1a73e8;font-weight:700;}
.cal-cal-list{margin-top:8px;}
.cal-cal-item{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;padding:5px 0;cursor:pointer;color:#3c4043;}
.cal-cal-item input{accent-color:#1a73e8;}
.cal-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
.cal-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.cal-toolbar{padding:12px 16px!important;flex-wrap:wrap;gap:10px;border-bottom:1px solid #DADCE0;background:#fff;flex-shrink:0;}
.cal-toolbar-left{flex:1;min-width:0;}
.cal-toolbar-nav{flex-shrink:0;}
.cal-toolbar-add{display:inline-flex;}
.cal-toolbar .h-title{font-size:22px;font-weight:400;color:#3c4043;letter-spacing:-.02em;}
.cal-toolbar .chip{border-color:#DADCE0;color:#3c4043;font-weight:500;border-radius:4px;padding:6px 16px;}
.cal-toolbar .chip:hover{background:#f1f3f4;}
.cal-fab{display:none;position:fixed;right:20px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:45;
  padding:0 20px;height:48px;font-size:14px;font-weight:600;border-radius:24px;box-shadow:0 1px 3px rgba(60,64,67,.3),0 4px 8px rgba(60,64,67,.15);border:none;}
.cal-toolbar .btn-accent.cal-toolbar-add,.cal-fab.btn-accent{background:#1a73e8!important;box-shadow:0 1px 3px rgba(60,64,67,.3);}
.cal-month{flex:1;min-height:0;overflow-y:auto;padding:0 8px 16px!important;}
.cal-mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:0;}
.cal-mgrid.head{border-bottom:1px solid #DADCE0;margin:0 8px;}
.cal-dow{text-align:left;font-size:11px;font-weight:500;color:#70757a;padding:8px 8px 6px;letter-spacing:.02em;}
.cal-dow.sun{color:#D93025;}
.cal-dow.sat{color:#1A73E8;}
.cal-mgrid.body{border-top:1px solid #DADCE0;border-left:1px solid #DADCE0;margin:0 8px;}
.cal-cell{min-height:120px;background:#fff;padding:2px 0 4px;cursor:pointer;display:flex;flex-direction:column;border-right:1px solid #DADCE0;border-bottom:1px solid #DADCE0;position:relative;}
.cal-cell.adjacent{background:#fff;}
.cal-cell.sel{background:#E8F0FE;}
.cal-cell.today{background:#E8F0FE33;}
.cal-daynum{display:flex;justify-content:center;align-items:center;padding:4px 0 2px;min-height:28px;}
.cal-daybadge{font-size:12px;font-weight:500;color:#3c4043;line-height:28px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;}
.cal-daybadge.adjacent{color:#70757a;}
.cal-daybadge.sun:not(.is-today){color:#D93025;}
.cal-daybadge.sat:not(.is-today){color:#1A73E8;}
.cal-daybadge.is-today{background:#1a73e8;color:#fff!important;font-weight:500;}
.cal-daybadge.is-today-wide{background:#1a73e8;color:#fff!important;border-radius:14px;padding:0 8px;width:auto;min-width:28px;}
.cal-evlist{display:flex;flex-direction:column;gap:1px;flex:1;overflow:hidden;min-width:0;padding:0 4px;}
.cal-evitem{display:block;border:none;padding:1px 6px;cursor:pointer;min-width:0;width:100%;text-align:left;font-family:inherit;border-radius:4px;margin-bottom:1px;line-height:1.35;}
.cal-evitem:hover{filter:brightness(0.95);}
.cal-evbar{display:none;}
.cal-evtext{font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;letter-spacing:-.01em;}
.cal-evmore{font-size:11px;color:#70757a;padding:2px 6px;font-weight:500;cursor:pointer;}
.cal-evmore:hover{text-decoration:underline;}
.cal-daylist{padding:0 16px 24px;border-top:1px solid #DADCE0;margin-top:8px;}
@media(min-width:900px){.cal-daylist{display:none;}}
.cal-dayrow{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer;}
.cal-daybar{width:4px;align-self:stretch;border-radius:3px;flex-shrink:0;}
.cal-pop-bg{position:fixed;inset:0;background:rgba(32,33,36,.6);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:max(48px,6vh) 16px 24px;overflow-y:auto;}
.cal-pop{width:100%;max-width:448px;background:#fff;border-radius:8px;padding:16px 20px 20px;box-shadow:0 24px 38px rgba(0,0,0,.14),0 9px 46px rgba(0,0,0,.12);animation:fadeUp .2s ease both;max-height:calc(100vh - 48px);overflow-y:auto;}
.cal-pop-tabs{display:flex;gap:6px;margin-bottom:12px;}
.cal-pop-tabs .on{background:#1a73e8;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;border-radius:4px;}
.cal-pop-row.title-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;}
.cal-pop-title{flex:1;border:1px solid #DADCE0;background:#fff;border-radius:4px;padding:12px 14px;font-family:inherit;font-size:18px;font-weight:400;outline:none;}
.cal-pop-title:focus{border-color:#1a73e8;box-shadow:0 0 0 1px #1a73e8;}
.cal-color-pick{display:flex;gap:6px;flex-wrap:wrap;padding-top:4px;}
.cal-color-pick button{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;}
.cal-color-pick button.on{border-color:#3c4043;box-shadow:0 0 0 2px #fff inset;}
.cal-pop-field{margin-bottom:10px;}
.cal-pop-label{font-size:12px;font-weight:600;color:#70757a;margin-bottom:6px;}
.cal-pop-field input,.cal-pop-field textarea{width:100%;border:1px solid #DADCE0;background:#fff;border-radius:4px;padding:10px 12px;font-family:inherit;font-size:14px;outline:none;resize:vertical;}
.cal-pop-field input:focus,.cal-pop-field textarea:focus{border-color:#1a73e8;}
.cal-pop-field.time-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.cal-pop-field.time-row input{flex:1;min-width:0;}
.cal-pop-link{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #DADCE0;background:#fff;border-radius:4px;padding:10px 12px;font-family:inherit;font-size:14px;text-align:left;cursor:pointer;margin-bottom:8px;color:#3c4043;}
.cal-pop-link span{color:#70757a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;}
.cal-rem-chips,.cal-contact-pick{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 10px;}
.cal-kakao-pick{margin:-2px 0 10px;padding:10px;background:#f8f9fa;border-radius:4px;border:1px solid #DADCE0;}
.cal-pop-actions{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;}
.cal-pop-foot{margin-top:16px;padding-top:14px;border-top:1px solid #DADCE0;display:flex;flex-direction:column;gap:12px;}
.cal-pop-primary-row{display:flex;gap:10px;justify-content:flex-end;}
.cal-pop-cancel{padding:10px 24px;font-size:14px;border-radius:4px;}
.cal-pop-save{padding:10px 24px;font-size:14px;border-radius:4px;background:#1a73e8!important;}
.cal-pop-links{display:flex;justify-content:flex-start;gap:16px;}
.cal-pop-link-btn{border:none;background:none;font-family:inherit;font-size:14px;font-weight:500;color:#1a73e8;cursor:pointer;padding:4px 0;}
.cal-pop-link-btn.danger{color:#D93025;}
.screen-cal{padding:0!important;overflow:hidden!important;display:flex;flex-direction:column;flex:1;min-height:0;background:#fff;}
.screen-cal .cal-wrap{flex:1;}
@media(max-width:767px){
  .cal-toolbar .h-title{font-size:18px;}
  .cal-toolbar-add{display:none!important;}
  .cal-fab{display:inline-flex;align-items:center;justify-content:center;}
  .cal-cell{min-height:72px;}
  .cal-evtext{font-size:10px;}
  .cal-pop-bg{align-items:flex-end;padding:0;}
  .cal-pop{border-radius:16px 16px 0 0;max-height:min(92vh,720px);}
  .cal-month{padding-bottom:80px!important;}
}
@media(min-width:900px){
  .screen-cal{padding:0!important;}
  .cal-month .pad{max-width:none;margin:0;padding:0 8px 16px!important;}
  .cal-toolbar.pad{max-width:none;margin:0;}
}
`;
