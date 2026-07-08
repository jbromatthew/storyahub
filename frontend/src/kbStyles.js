/** 지식경영 / KB — 네이버 블로그형 에디터·읽기·피드 스타일 (ERP + 공용) */
export const KB_CSS = `
.iconbtn{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--line);cursor:pointer;font-size:18px;color:var(--ink);}
.divider{height:1px;background:var(--line);margin:14px 0;}

/* feed — blog list */
.kb-feed{background:#F4F5F7;min-height:100%;}
.kb-feed .pad.kb-feed-inner{max-width:720px;padding:0 16px 88px;}
.kb-feed-hd{padding:20px 0 8px;}
.kb-feed-hd .h-title{font-size:22px;font-weight:800;}
.kb-feed-hd .small{line-height:1.55;}
.kbh-blog-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 4px;}
.kbh-blog-toolbar .count{font-size:12px;font-weight:700;color:var(--muted);}
.kbh-blog-list{display:flex;flex-direction:column;gap:14px;}
.kbh-blog-card{background:#fff;border:1px solid #E8EAED;border-radius:14px;overflow:hidden;cursor:pointer;transition:box-shadow .15s,transform .15s;}
.kbh-blog-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.07);}
.kbh-blog-card:active{transform:scale(.995);}
.kbh-blog-cover{width:100%;height:148px;background:#ECE8E0;overflow:hidden;position:relative;}
.kbh-blog-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.kbh-blog-cover .kbh-cover-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;}
.kbh-blog-body{padding:16px 18px 18px;}
.kbh-blog-body .ttl{font-size:17px;font-weight:800;line-height:1.4;letter-spacing:-.02em;color:#111;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.kbh-blog-body .ex{margin-top:8px;font-size:14px;line-height:1.65;color:#666;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.kbh-blog-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #F0F0F0;flex-wrap:wrap;}
.kbh-blog-foot .meta{font-size:12px;color:#999;font-weight:600;}
.kbh-blog-foot .tags{display:flex;gap:5px;flex-wrap:wrap;}
.kbh-blog-foot .tag{font-size:11px;padding:3px 8px;border-radius:6px;background:#F4F5F7;color:#555;font-weight:700;}
.kbh-blog-feat{margin-bottom:6px;}
.kbh-blog-feat .kbh-blog-cover{height:180px;}
.kbh-blog-feat .kbh-blog-body .ttl{font-size:19px;-webkit-line-clamp:3;}
.kbh-compact-list{display:flex;flex-direction:column;gap:10px;}
.kbh-compact-list .kbh-item{margin-bottom:0;border-color:#E8EAED;}
.kbh-compact-list .kbh-item .ex{-webkit-line-clamp:2;}
.kbh-compact-list .kbh-dot{color:#999;}

/* kb blog editor */
.kbe-wrap,.kbe-read{display:flex;flex-direction:column;height:100%;width:100%;min-height:0;background:#F4F5F7;}
.kbe-inner{width:100%;max-width:100%;margin:0 auto;}
.kbe-bar{flex:0 0 auto;background:#fff;z-index:6;border-bottom:1px solid #E8EAED;padding:10px 16px;}
.kbe-bar-inner{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;}
.kbe-bar-title{flex:1;min-width:0;font-size:15px;font-weight:700;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kbe-actions{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.kbe-settings{border:none;background:transparent;color:#666;font-size:18px;line-height:1;cursor:pointer;padding:8px;border-radius:10px;font-family:inherit;}
.kbe-settings.on,.kbe-settings:hover{background:#F4F5F7;color:#111;}
.kbe-pub{border:none;background:#03C75A;color:#fff;font-weight:700;font-size:14px;font-family:inherit;padding:9px 16px;border-radius:8px;cursor:pointer;white-space:nowrap;}
.kbe-pub:disabled{opacity:.55;cursor:wait;}
.kbe-draft{border:none;background:transparent;color:#888;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;padding:8px 10px;white-space:nowrap;}
.kbe-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 16px 24px;}
.kbe-scroll::-webkit-scrollbar{width:6px;}
.kbe-scroll::-webkit-scrollbar-thumb{background:#D8D0C4;border-radius:3px;}
.kbe-sheet{background:#fff;border:1px solid #E8EAED;border-radius:12px;min-height:min(72vh,680px);padding:28px 24px 40px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
.kbe-meta-panel{border-top:1px solid #E8EAED;background:#FAFAFA;padding:16px 20px calc(16px + env(safe-area-inset-bottom,0px));flex:0 0 auto;max-height:min(46vh,420px);overflow-y:auto;}
.kbe-meta-panel .kbe-meta{margin-top:0;}
.kbe-meta-h{font-size:12px;font-weight:700;color:#888;margin:0 0 10px;letter-spacing:.02em;}
.kbe-cover{height:120px;border-radius:10px;border:1px dashed #DADCE0;background:#FAFAFA;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#888;cursor:pointer;overflow:hidden;}
.kbe-cover.compact{height:88px;flex-direction:row;gap:12px;padding:12px;text-align:left;}
.kbe-cover img{width:100%;height:100%;object-fit:cover;}
.kbe-cover.compact img{width:64px;height:64px;border-radius:8px;flex:0 0 auto;}
.kbe-sheet-meta .kbe-meta{margin-top:0;margin-bottom:4px;}
.kbe-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center;}
.kbe-title{display:block;width:100%;min-height:40px;font-size:28px;font-weight:700;letter-spacing:-.025em;line-height:1.35;margin:0 0 20px;outline:none;word-break:break-word;color:#111;}
.kbe-title:empty::before{content:attr(data-ph);color:#B0B8C1;display:block;pointer-events:none;font-weight:700;}
.kbe-titleline{display:none;}
.kbe-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.kbe-body{min-height:240px;}
.kbe-insert{position:relative;display:flex;align-items:center;justify-content:center;height:0;margin:0;opacity:0;transition:opacity .15s;z-index:2;}
.kbe-insert.open,.kbe-blk-wrap:hover .kbe-insert{opacity:1;height:28px;margin:2px 0;}
.kbe-insert-line{position:absolute;left:0;right:0;top:50%;height:1px;background:#E8EAED;}
.kbe-insert-btn{position:relative;width:24px;height:24px;border-radius:50%;border:1px solid #DADCE0;background:#fff;color:#666;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08);}
.kbe-insert-btn:hover{border-color:#03C75A;color:#03C75A;}
.kbe-menu{background:#fff;border:1px solid #E8EAED;border-radius:12px;padding:8px;margin:4px 0 8px;box-shadow:0 8px 24px rgba(0,0,0,.10);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;}
.kbe-mi{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:8px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;color:#333;}
.kbe-mi:hover{background:#F4F5F7;color:#03C75A;}
.kbe-blk-wrap{position:relative;}
.kbe-blk{position:relative;padding:2px 0;}
.kbe-blk .del{position:absolute;top:2px;right:-4px;width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:#AAA;cursor:pointer;opacity:0;transition:.12s;display:flex;align-items:center;justify-content:center;font-size:14px;}
.kbe-blk-wrap:hover .del{opacity:1;}
.kbe-blk .del:hover{background:#FFF0F0;color:#E03E3E;}
.kbe-toolbar{flex:0 0 auto;background:#fff;border-top:1px solid #E8EAED;padding:6px 8px calc(8px + env(safe-area-inset-bottom,0px));box-shadow:0 -2px 12px rgba(0,0,0,.05);}
.kbe-toolbar-inner{display:flex;align-items:flex-end;justify-content:flex-start;gap:0;overflow-x:auto;max-width:760px;margin:0 auto;}
.kbe-toolbar-inner::-webkit-scrollbar{display:none;}
.kbe-toolbar::-webkit-scrollbar{display:none;}
.kbe-tool{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;border:none;background:transparent;font-family:inherit;font-size:11px;font-weight:600;color:#444;cursor:pointer;padding:8px 12px;border-radius:8px;min-width:52px;}
.kbe-tool-ic{font-size:20px;line-height:1;}
.kbe-tool:hover{background:#F4F5F7;color:#111;}
.kbe-tool.on{background:#E8F8EF;color:#03A84D;}
.kbe-tdiv{width:1px;height:32px;background:#E8EAED;margin:0 2px;flex:0 0 auto;align-self:center;}
.kbe-read{overflow:hidden;}
.kbe-read-top{padding:10px 20px;border-bottom:1px solid #E8EAED;flex:0 0 auto;background:#fff;}
.kbe-read-top-inner{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.kbe-read-body{flex:1;overflow-y:auto;padding:16px 20px calc(76px + env(safe-area-inset-bottom,0px));background:#fff;}
.kbe-read-body .h-title{font-size:26px;line-height:1.35;letter-spacing:-.03em;}
.kbe-read-body .h-eyebrow{font-size:12px;color:#888;}
.kbe-cover-read{width:100%;height:200px;overflow:hidden;flex:0 0 auto;background:#ECE8E0;}
.kbe-cover-read img{width:100%;height:100%;object-fit:cover;display:block;}
@media (hover:none){
  .kbe-insert{opacity:.4;height:24px;margin:2px 0;}
  .kbe-blk .del{opacity:.5;}
}
@media (max-width:520px){
  .kbe-bar-title{display:none;}
  .kbe-draft{font-size:12px;padding:8px 6px;}
  .kbe-pub{font-size:13px;padding:8px 12px;}
  .kbe-sheet{padding:20px 16px 32px;border-radius:0;border-left:none;border-right:none;}
  .kbe-scroll{padding:0 0 16px;}
}
@media(min-width:900px){
  .kb-feed .pad.kb-feed-inner{max-width:720px;padding:0 24px 96px;}
  .kbe-inner{max-width:720px;margin:0 auto;width:100%;}
  .kbe-bar{padding:12px 24px;}
  .kbe-scroll{padding:20px 24px 28px;}
  .kbe-sheet{padding:36px 40px 48px;}
  .kbe-title{font-size:32px;}
  .kbe-toolbar{padding:8px 24px;}
  .kbe-toolbar-inner{justify-content:center;}
  .kbe-read-top{padding:14px 32px;}
  .kbe-read .kbe-cover-read{height:280px;}
  .kbe-read-body{max-width:720px;margin:0 auto;padding:24px 32px 48px;}
}
@media(min-width:1200px){
  .kbe-inner{max-width:760px;}
  .kbe-read-body{max-width:760px;padding:28px 48px 56px;}
}
`;
