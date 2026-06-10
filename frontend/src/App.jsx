import React, { useState, useEffect, useRef, useCallback } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import KbEditor, { KbReadView, kbSearchText } from "./components/KbEditor.jsx";
import { api, loadToken, saveToken, clearToken, setToken } from "./api/client.js";
import { uploadBlob, uploadFile, pickImageFile, fileToBase64, AudioRecorder } from "./api/upload.js";
import { setClients, getClients } from "./store.js";
import { contactToUi, todoToUi, eventToUi, kbToUi, meetingToUi, contactGroups, kbCategories } from "./mappers.js";

/* ------------------------------------------------------------------
   Storyahub — 비서앱 UI
   미니멀 / 페이퍼톤 / 단일 액센트(테라코타)
   핵심 루프: 녹음 → 요약 → 투두·일정 자동 분기
------------------------------------------------------------------- */

const CSS = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');

:root{
  --paper:#F7F4EE; --card:#FFFFFF; --ink:#1B1A17; --muted:#8C857A;
  --line:#ECE7DD; --accent:#DD5E39; --accent-deep:#C2491F; --accent-soft:#FBEAE1;
  --green:#3E7C5A; --green-soft:#E7F0EA;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.sa-root{
  min-height:100vh;width:100%;
  background:
    radial-gradient(1200px 600px at 70% -10%, #3a342c 0%, #211e19 60%, #18150f 100%);
  display:flex;align-items:center;justify-content:center;
  padding:16px 14px;
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif;
  color:var(--ink);
}
.phone{
  position:relative;width:380px;max-width:100%;height:min(812px, calc(100vh - 32px));
  background:var(--paper);border-radius:46px;
  box-shadow:0 40px 90px -20px rgba(0,0,0,.6), 0 0 0 10px #0d0b08, 0 0 0 11px #2c2820;
  overflow:hidden;display:flex;flex-direction:column;
}
.notch{position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:130px;height:30px;background:#0d0b08;border-radius:0 0 18px 18px;z-index:50;}
.statusbar{height:50px;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:space-between;
  padding:0 26px 6px;font-size:13px;font-weight:600;color:var(--ink);}
.screen{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 0 96px;scroll-behavior:smooth;}
.screen::-webkit-scrollbar{display:none;}
.pad{padding:0 20px;}

.h-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;}
.h-title{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:2px 0 0;}
.section-h{font-size:13px;font-weight:700;color:var(--muted);margin:22px 0 10px;letter-spacing:.02em;}

.card{background:var(--card);border:1px solid var(--line);border-radius:20px;
  box-shadow:0 8px 24px -18px rgba(60,50,30,.5);}
.row{display:flex;align-items:center;}
.between{justify-content:space-between;}
.chip{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:999px;
  font-size:13px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--ink);
  cursor:pointer;white-space:nowrap;transition:.15s;}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.tag{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;
  font-size:11px;font-weight:700;background:var(--accent-soft);color:var(--accent-deep);}
.tag.green{background:var(--green-soft);color:var(--green);}
.tag.gray{background:#F0ECE3;color:var(--muted);}
.tag.amber{background:#FBEFD6;color:#9A6B1A;}
.tag.blue{background:#E5EEFB;color:#2D5B9E;}

.btn{border:none;border-radius:14px;font-family:inherit;font-weight:700;cursor:pointer;transition:.15s;}
.btn-accent{background:var(--accent);color:#fff;}
.btn-accent:active{background:var(--accent-deep);}
.btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink);}
.iconbtn{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;
  background:#fff;border:1px solid var(--line);cursor:pointer;}

.avatar{width:42px;height:42px;border-radius:14px;background:var(--accent-soft);color:var(--accent-deep);
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex:0 0 auto;}

/* bottom nav */
.nav{position:absolute;left:0;right:0;bottom:0;height:84px;background:rgba(247,244,238,.86);
  backdrop-filter:blur(14px);border-top:1px solid var(--line);
  display:flex;align-items:flex-start;justify-content:space-around;padding:11px 14px 0;z-index:40;}
.navitem{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;font-weight:600;
  color:var(--muted);background:none;border:none;cursor:pointer;width:54px;transition:.15s;}
.navitem.on{color:var(--accent-deep);}
.fab{width:60px;height:60px;border-radius:22px;background:var(--accent);
  display:flex;align-items:center;justify-content:center;margin-top:-22px;
  box-shadow:0 12px 24px -6px rgba(221,94,57,.6);border:none;cursor:pointer;transition:.15s;}
.fab:active{transform:scale(.94);}

.list-item{padding:15px 0;border-bottom:1px solid var(--line);cursor:pointer;}
.list-item:last-child{border-bottom:none;}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.fade{animation:fadeUp .4s ease both;}
@keyframes pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.8);opacity:0}100%{opacity:0}}
@keyframes bars{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);
  border-top-color:var(--accent);animation:spin .8s linear infinite;}
.divider{height:1px;background:var(--line);margin:14px 0;}
.small{font-size:12.5px;color:var(--muted);}

/* segmented toggle */
.seg{display:flex;background:#EFEBE2;border-radius:13px;padding:4px;gap:4px;}
.seg button{flex:1;border:none;background:none;font-family:inherit;font-weight:700;font-size:13.5px;
  padding:9px 0;border-radius:10px;cursor:pointer;color:var(--muted);transition:.15s;}
.seg button.on{background:#fff;color:var(--ink);box-shadow:0 2px 6px -2px rgba(0,0,0,.15);}

/* map */
.mapwrap{position:relative;margin:14px 20px 0;height:340px;border-radius:22px;overflow:hidden;
  border:1px solid var(--line);
  background:
    repeating-linear-gradient(0deg,#E9EBE1 0 1px,transparent 1px 48px),
    repeating-linear-gradient(90deg,#E9EBE1 0 1px,transparent 1px 48px),
    linear-gradient(135deg,#F2F3EC,#ECEEE4);}
.ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;
  border:1px dashed #C9CEBE;}
.ringlbl{position:absolute;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:#A9AD9C;background:rgba(242,243,236,.8);padding:0 5px;border-radius:4px;}
.mydot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;
  background:#2D6CDF;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:5;}
.mypulse{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;
  background:#2D6CDF;animation:pulse 2.6s ease-out infinite;}
.cpin{position:absolute;transform:translate(-50%,-100%);cursor:pointer;z-index:6;
  display:flex;flex-direction:column;align-items:center;}
.cpinhead{width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(45deg);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 10px -2px rgba(0,0,0,.35);border:2px solid #fff;}
.cpinhead span{transform:rotate(-45deg);font-size:13px;font-weight:800;color:#fff;}

/* block editor */
.editable{outline:none;}
.editable:empty:before{content:attr(data-ph);color:#B9B2A5;}
.blk{position:relative;padding:5px 0 5px 24px;}
.blk .grip{position:absolute;left:-2px;top:8px;color:#CFC9BD;opacity:.4;cursor:grab;}
.addrow{display:flex;align-items:center;gap:8px;width:100%;border:1px dashed var(--line);
  background:#fff;border-radius:14px;padding:13px 15px;cursor:pointer;color:var(--muted);
  font-weight:600;font-size:13.5px;font-family:inherit;transition:.15s;}
.addrow:active{background:#FBF9F4;}
.addmenu .mi{display:flex;align-items:center;gap:13px;padding:12px 6px;border-bottom:1px solid var(--line);cursor:pointer;}
.addmenu .mi:last-child{border-bottom:none;}
.addmenu .mi-ic{width:36px;height:36px;border-radius:10px;background:#F4F1EA;display:flex;align-items:center;justify-content:center;color:var(--ink);flex:0 0 auto;}
.fileblk{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:14px;padding:13px;background:#fff;}
.fileic{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:#fff;}
.imgblk{border:1px dashed var(--line);border-radius:14px;padding:26px;text-align:center;background:#FBFAF6;color:var(--muted);}
.ftoolbar{display:flex;gap:5px;flex-wrap:wrap;}
.ftoolbar span{padding:6px 10px;border-radius:9px;background:#F4F1EA;font-size:13px;font-weight:700;cursor:pointer;color:var(--ink);}

/* month calendar */
.mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mcell{aspect-ratio:1/1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
  padding-top:6px;border-radius:11px;cursor:pointer;position:relative;font-size:13.5px;font-weight:600;transition:.12s;}
.mcell.muted{color:#C7C0B3;}
.mcell.today{background:var(--accent-soft);color:var(--accent-deep);}
.mcell.sel{background:var(--accent);color:#fff;}
.mdot{width:5px;height:5px;border-radius:50%;background:var(--accent);margin-top:3px;}
.mcell.sel .mdot{background:#fff;}

/* pricing */
.plancard{border:1px solid var(--line);border-radius:18px;padding:16px;background:#fff;position:relative;}
.plancard.hot{border:2px solid var(--accent);box-shadow:0 10px 26px -16px rgba(221,94,57,.6);}
.ribbon{position:absolute;top:-10px;right:16px;background:var(--accent);color:#fff;font-size:11px;font-weight:800;
  padding:3px 10px;border-radius:8px;}
.rng{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E7E1D5;outline:none;margin:6px 0;}
.rng::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;
  background:var(--accent);border:3px solid #fff;box-shadow:0 2px 7px rgba(0,0,0,.3);cursor:pointer;}
.rng::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--accent);border:3px solid #fff;cursor:pointer;}
.brk{display:flex;justify-content:space-between;font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--line);}

/* auth / language */
.langsw{display:inline-flex;gap:2px;background:#EFEBE2;border-radius:10px;padding:3px;}
.langsw button{border:none;background:none;font-family:inherit;font-weight:700;font-size:12px;padding:6px 10px;border-radius:8px;color:var(--muted);cursor:pointer;}
.langsw button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12);}
.prov{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:14px;border-radius:13px;
  font-weight:700;font-size:14.5px;font-family:inherit;cursor:pointer;border:none;margin-bottom:10px;transition:.12s;}
.prov:active{transform:scale(.99);opacity:.92;}
.orline{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;margin:10px 0;}
.orline:before,.orline:after{content:"";flex:1;height:1px;background:var(--line);}

/* bottom sheet */
.sheetbg{position:absolute;inset:0;background:rgba(20,16,12,.45);z-index:60;display:flex;align-items:flex-end;
  animation:fadeUp .25s ease both;}
.sheet{width:100%;background:var(--paper);border-radius:26px 26px 0 0;padding:10px 22px calc(env(safe-area-inset-bottom) + 26px);
  box-shadow:0 -10px 40px rgba(0,0,0,.25);animation:sheetup .32s cubic-bezier(.2,.8,.2,1) both;}
@keyframes sheetup{from{transform:translateY(100%)}to{transform:none}}
.sheetbar{width:40px;height:4px;border-radius:4px;background:#D8D2C6;margin:0 auto 14px;}
.stepnum{width:26px;height:26px;border-radius:9px;background:var(--accent-soft);color:var(--accent-deep);
  font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
.segpill{display:inline-flex;background:#EFEBE2;border-radius:10px;padding:3px;gap:3px;}
.segpill button{border:none;background:none;font-family:inherit;font-weight:700;font-size:12px;padding:6px 11px;border-radius:8px;color:var(--muted);cursor:pointer;}
.segpill button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12);}
`;

/* --------- icons (inline svg) --------- */
const I = {
  home:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>,
  users:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.5-3.5 3-5.5 5.5-5.5s5 2 5.5 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6"/><path d="M17 14.7c2 .6 3.6 2.5 4 5.3"/></svg>,
  mic:(p)=> <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>,
  cal:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>,
  book:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 3z" transform="translate(0 -1)"/><path d="M5 3.5h11a3 3 0 0 1 3 3V19H8a3 3 0 0 0-3 1.5z"/></svg>,
  phone:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>,
  pin:(p)=> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>,
  chevron:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6"/></svg>,
  back:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 6-6 6 6 6"/></svg>,
  check:(p)=> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m5 12 5 5L20 6"/></svg>,
  search:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>,
  star:(p)=> <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z"/></svg>,
  plus:(p)=> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  text:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 6h14M5 12h14M5 18h9"/></svg>,
  heading:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 4v16M18 4v16M6 12h12"/></svg>,
  list:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>,
  quote:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 7c-2 0-3 1.5-3 3.5S5 14 7 14c0 2-1 3-3 3M18 7c-2 0-3 1.5-3 3.5S16 14 18 14c0 2-1 3-3 3"/></svg>,
  table:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 5v14M16 5v14"/></svg>,
  divider:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M4 12h16"/></svg>,
  code:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg>,
  image:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m5 18 5-5 4 3 3-2 3 3"/></svg>,
  file:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/></svg>,
  video:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10 5-3v10l-5-3z"/></svg>,
  grip:(p)=> <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>,
  bell:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>,
  gear:(p)=> <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5.6 9.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  trash:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>,
  download:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg>,
  refresh:(p)=> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>,
  bolt:(p)=> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></svg>,
  edit:(p)=> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 5l4 4"/></svg>,
  chevR:(p)=> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6"/></svg>,
};

/* --------- data --------- */
const TAG_COLORS={ "결제완료":"green", "결제대기":"amber", "핫리드":"accent", "신규":"blue", "VIP":"accent", "보류":"gray" };
const PRESET_TAGS=["결제완료","결제대기","핫리드","신규","VIP","보류"];
const INSTALL_DISMISS_KEY="storyahub_install_dismissed";
const isInstallDismissed=()=>localStorage.getItem(INSTALL_DISMISS_KEY)==="1";
const dismissInstall=()=>localStorage.setItem(INSTALL_DISMISS_KEY,"1");

// 소개 관계 헬퍼 (API 로드 후 store 참조)
const findC=(id)=>getClients().find(c=>c.id===id);
const introducedBy=(c)=> c.refBy?findC(c.refBy):null;
const introduced=(c)=> getClients().filter(x=>x.refBy===c.id);

// 영향력 = 직접 매출 + 소개로 발생한 간접 매출(1단계 50% · 2단계 25% 감쇠)
function indirectWon(c){
  const lvl1=introduced(c);
  const sum1=lvl1.reduce((s,k)=>s+(k.won||0),0);
  const sum2=lvl1.flatMap(k=>introduced(k)).reduce((s,k)=>s+(k.won||0),0);
  return Math.round(sum1*0.5 + sum2*0.25);
}
function totalInfluence(c){ return (c.won||0) + indirectWon(c); }

// 기여도 등급 — 영향력(직접+간접) 기준 자동 산출(AI 미사용·계산만)
function grade(c){ const v = typeof c==="number"?c:totalInfluence(c); return v>=20000000?"A":v>=5000000?"B":v>0?"C":"-"; }
const GRADE_COLOR={ A:"#C2491F", B:"#C9A23A", C:"#8C857A", "-":"#C0B9AC" };
const wonShort=(n)=> n>=10000?`₩${Math.round(n/10000).toLocaleString("ko-KR")}만`:n>0?`₩${n.toLocaleString("ko-KR")}`:"—";

/* 중립 용어(세그먼트 구분 없이 공통) */
const TERMS = {
  business:{ contacts:"인맥", contact:"인맥", meeting:"기록", attendees:"참석자" },
  student: { contacts:"인맥", contact:"인맥", meeting:"기록", attendees:"참석자" },
};
const T=(seg,key)=> (TERMS[seg]||TERMS.business)[key];
/* 중요도 */
const PRI = { high:{l:"● 높음", c:"#DD5E39"}, mid:{l:"● 보통", c:"#C9A23A"}, low:{l:"● 낮음", c:"#8C857A"} };
const STAGES = [["todo","할 일"],["doing","진행 중"],["done","완료"]];

/* ---- i18n (진입 플로우: 로그인 · 온보딩) ---- */
const LANG = {
  ko:{ label:"한", tagline:"녹음하면, 알아서 정리되는 비서",
    sub:"미팅 · 통화 · 강의를 자동으로 요약하고 정리해요", or:"또는",
    email:"이메일로 계속하기",
    terms:"계속하면 이용약관 및 개인정보처리방침에 동의하게 됩니다.",
    providers:[
      {k:"kakao", label:"카카오로 시작", bg:"#FEE500", fg:"#191600"},
      {k:"naver", label:"네이버로 시작", bg:"#03C75A", fg:"#fff"},
      {k:"google",label:"Google로 시작", bg:"#fff", fg:"#1f1f1f", bd:true},
      {k:"apple", label:"Apple로 시작", bg:"#000", fg:"#fff"},
    ],
    onb:{ title:"어떻게 쓰실 건가요?", sub:"용도에 맞게 화면을 맞춰드릴게요. 언제든 바꿀 수 있어요.",
      biz:["비즈니스 · 영업","거래처 관리 · 미팅/통화 요약 · 위치 기반 · 팀 공유"],
      stu:["학생 · 수험생","강의 녹음 요약 · 지식백과 · 시험 전 검색"],
      foot:"가입 후 7일 무료 체험 · 하루 ₩330부터" } },
  en:{ label:"EN", tagline:"Record once. It organizes itself.",
    sub:"Auto-summaries for meetings, calls and lectures", or:"or",
    email:"Continue with email",
    terms:"By continuing you agree to the Terms and Privacy Policy.",
    providers:[
      {k:"google",label:"Continue with Google", bg:"#fff", fg:"#1f1f1f", bd:true},
      {k:"apple", label:"Continue with Apple", bg:"#000", fg:"#fff"},
    ],
    onb:{ title:"How will you use it?", sub:"We'll tailor the app to your needs. Change anytime.",
      biz:["Business · Sales","Clients · meeting/call summaries · nearby · team sharing"],
      stu:["Student · Exam prep","Lecture summaries · knowledge base · exam search"],
      foot:"7-day free trial · from $0.30/day" } },
  ja:{ label:"日", tagline:"録音すれば、自動で整理。",
    sub:"会議・通話・講義を自動で要約・整理します", or:"または",
    email:"メールで続ける",
    terms:"続行すると利用規約とプライバシーポリシーに同意したものとみなされます。",
    providers:[
      {k:"line", label:"LINEで始める", bg:"#06C755", fg:"#fff"},
      {k:"yahoo",label:"Yahoo! JAPANで始める", bg:"#FF0033", fg:"#fff"},
      {k:"google",label:"Googleで始める", bg:"#fff", fg:"#1f1f1f", bd:true},
      {k:"apple", label:"Appleで始める", bg:"#000", fg:"#fff"},
    ],
    onb:{ title:"どのように使いますか？", sub:"用途に合わせて画面を調整します。いつでも変更できます。",
      biz:["ビジネス · 営業","取引先管理 · 会議/通話要約 · 位置情報 · チーム共有"],
      stu:["学生 · 受験生","講義の録音要約 · ナレッジ · 試験前検索"],
      foot:"登録後7日間無料体験 · 1日¥33〜" } },
};

function App(){
  const [boot,setBoot] = useState("loading"); // loading | auth | welcome | app
  const [user,setUser] = useState(null);
  const [tab,setTab] = useState("today");
  const [client,setClient] = useState(null);
  const [group,setGroup] = useState("전체");
  const [phase,setPhase] = useState("idle");
  const [kbView,setKbView] = useState(null);
  const [pricing,setPricing] = useState(false);
  const [segment] = useState("business");
  const [cardScan,setCardScan] = useState(false);
  const [showInstall,setShowInstall] = useState(false);
  const [overlay,setOverlay] = useState(null);
  const [detail,setDetail] = useState(null);
  const [secs,setSecs] = useState(0);
  const [hl,setHl] = useState(0);
  const [todos,setTodos] = useState([]);
  const [eventsToday,setEventsToday] = useState([]);
  const [meetings,setMeetings] = useState([]);
  const [kbArticles,setKbArticles] = useState([]);
  const [revenue,setRevenue] = useState({ supplyAmount:0, total:0, pipeline:0, wonCount:0, pipelineCount:0 });
  const [lastSummary,setLastSummary] = useState(null);
  const timer = useRef(null);

  const loadAppData = useCallback(async ()=>{
    const [data, kb] = await Promise.all([api.bootstrap(), api.listKb()]);
    setClients(data.contacts.map(contactToUi));
    setTodos(data.todos.map(todoToUi));
    setEventsToday((data.eventsToday||[]).map(eventToUi));
    setMeetings((data.meetings||[]).map(meetingToUi));
    setKbArticles((kb||[]).map(kbToUi));
    setRevenue(data.revenue||{ supplyAmount:0, total:0, pipeline:0, wonCount:0, pipelineCount:0 });
  },[]);

  useEffect(()=>{
    (async()=>{
      const t = loadToken();
      if(!t){ setBoot("auth"); return; }
      setToken(t);
      try{
        const { user:u } = await api.me();
        setUser(u);
        await loadAppData();
        setBoot(u.onboardingDone ? "app" : "welcome");
      }catch{
        clearToken();
        setBoot("auth");
      }
    })();
  },[loadAppData]);

  useEffect(()=>{
    if(phase==="rec"){ timer.current=setInterval(()=>setSecs(s=>s+1),1000); }
    else clearInterval(timer.current);
    return ()=>clearInterval(timer.current);
  },[phase]);

  const handleAuth = async (result)=>{
    saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
    await loadAppData();
    setBoot(result.user.onboardingDone ? "app" : "welcome");
    if(result.user.onboardingDone && !isInstallDismissed()) setShowInstall(true);
  };

  const completeWelcome = useCallback(async ()=>{
    if(user?.onboardingDone){ setBoot("app"); return; }
    const { user:u } = await api.completeOnboarding();
    setUser(u);
    setBoot("app");
    if(!isInstallDismissed()) setShowInstall(true);
  },[user]);

  const goTab=(t)=>{ setClient(null); setKbView(null); setPricing(false); setCardScan(false); setOverlay(null); setDetail(null); if(t!=="record"){ setTab(t);} };
  const startRec=()=>{ setTab("record"); setPhase("rec"); setSecs(0); setHl(0); setLastSummary(null); };
  const handleRecordComplete=async ({ mode, mediaKey, imageKeys, attendees, contactId, companyName })=>{
    setPhase("proc");
    try{
      const { jobId } = await api.enqueueSummary(mediaKey||null,{
        template:"영업",
        contactId: contactId??null,
        companyName,
        source: mode==="photo"?"photo":"live",
        attendees,
        imageKeys: imageKeys??[],
      });
      let job;
      for(let i=0;i<60;i++){
        await new Promise(r=>setTimeout(r,500));
        job = await api.getJob(jobId);
        if(job?.status==="done"||job?.status==="error") break;
      }
      if(job?.status==="done") setLastSummary(job.result);
      else if(job?.status==="error") alert(job.error||"요약 실패");
      await loadAppData();
    }catch(e){ alert(e.message||"처리 실패"); console.warn("record",e); }
    setPhase("sum");
  };
  const mmss=(n)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
  const toggleTodo=async (i)=>{
    const t = todos[i];
    if(!t?.id) return setTodos(p=>p.map((x,k)=>k===i?{...x,done:!x.done,status:!x.done?"done":"todo"}:x));
    const next = t.done ? "todo" : "done";
    await api.updateTodo(t.id,{ status: next });
    setTodos(p=>p.map((x,k)=>k===i?{...x,done:next==="done",status:next}:x));
  };
  const setTodoStatus=async (i,s)=>{
    const t = todos[i];
    if(t?.id) await api.updateTodo(t.id,{ status:s });
    setTodos(p=>p.map((x,k)=>k===i?{...x,status:s,done:s==="done"}:x));
  };
  const refreshContacts = async ()=>{ await loadAppData(); };

  if(boot==="loading") return (
    <div className="sa-root"><style>{CSS}</style>
      <div className="phone" style={{alignItems:"center",justifyContent:"center"}}>
        <div className="spinner"/>
      </div>
    </div>
  );

  return (
    <div className="sa-root">
      <style>{CSS}</style>
      <div className="phone">
        <div className="notch"/>
        <div className="statusbar">
          <span>9:41</span>
          <span style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11}}>5G</span>
            <span style={{width:22,height:11,border:"1.5px solid var(--ink)",borderRadius:3,position:"relative",display:"inline-block"}}>
              <span style={{position:"absolute",inset:1.5,right:6,background:"var(--ink)",borderRadius:1}}/>
            </span>
          </span>
        </div>

        <div className="screen" key={boot+tab+phase+(client?client.id:"")+(pricing?"P":"")+(overlay||"")+(detail?detail.type:"")}>
          {boot==="auth" ? <AuthScreen onSuccess={handleAuth}/>
          : boot==="welcome" ? <WelcomeScreen user={user} contactCount={getClients().length}
              onStartRec={async ()=>{ await completeWelcome(); startRec(); }}
              onAddContact={async ()=>{ await completeWelcome(); setTab("clients"); setCardScan(true); }}
              onDone={completeWelcome}/>
          : detail ? <Detail d={detail} todos={todos} back={()=>setDetail(null)} onTodoToggle={toggleTodo}/>
          : overlay==="search" ? <GlobalSearch back={()=>setOverlay(null)} openClient={(c)=>{setOverlay(null);setTab("clients");setClient(c);}}
              meetings={meetings} kbArticles={kbArticles}/>
          : overlay==="settings" ? <Settings user={user} back={()=>setOverlay(null)} go={(o)=>setOverlay(o)}
              openPricing={()=>{setOverlay(null);setPricing(true);}}
              onLogout={()=>{ clearToken(); setUser(null); setBoot("auth"); setOverlay(null); }}/>
          : overlay==="trash" ? <Trash back={()=>setOverlay("settings")}/>
          : overlay==="export" ? <ExportData back={()=>setOverlay("settings")}/>
          : pricing ? <Pricing back={()=>setPricing(false)} segment={segment} trialLeft={user?.trialDaysLeft}/>
          : tab==="record" ? <RecordScreen phase={phase} secs={secs} mmss={mmss} hl={hl} setHl={setHl}
                              onComplete={handleRecordComplete} todos={todos} toggleTodo={toggleTodo}
                              summary={lastSummary}
                              goClients={()=>{setTab("clients");setPhase("idle");}} />
          : client ? <ClientDetail c={client} back={()=>setClient(null)} startRec={startRec} seg={segment} onRefresh={loadAppData}/>
          : tab==="today" ? <Today user={user} startRec={startRec} todos={todos} toggleTodo={toggleTodo} setTodoStatus={setTodoStatus}
                              eventsToday={eventsToday} meetings={meetings} revenue={revenue}
                              openClient={(c)=>setClient(c)} seeSummary={()=>{setTab("record");setPhase("sum");}}
                              openPricing={()=>setPricing(true)} segment={segment}
                              openSearch={()=>setOverlay("search")} openSettings={()=>setOverlay("settings")}
                              openDetail={(t,data)=>setDetail({type:t,data})} onRefresh={loadAppData}/>
          : tab==="clients" ? (cardScan ? <CardScan back={()=>setCardScan(false)} onSaved={refreshContacts} seg={segment}/> : <Clients group={group} setGroup={setGroup} open={(c)=>setClient(c)} onAdd={()=>setCardScan(true)} seg={segment}/>)
          : tab==="calendar" ? <Calendar openDetail={(t,data)=>setDetail({type:t,data})}/>
          : kbView ? (
            kbView.mode==="edit"
              ? <KbEditor article={kbView.article} back={()=>setKbView(null)} onSaved={loadAppData} onDeleted={loadAppData}/>
              : <KbReadView article={kbView.article} back={()=>setKbView(null)} onEdit={()=>setKbView({article:kbView.article,mode:"edit"})}/>
          )
          : <Knowledge articles={kbArticles} openWrite={(a)=>setKbView({article:a||{blocks:[]},mode:a?.id?"read":"edit"})}/>}
        </div>

        {/* bottom nav */}
        {boot==="app" && (
        <div className="nav">
          <NavBtn on={tab==="today"&&!client} icon={I.home} label="투데이" onClick={()=>goTab("today")}/>
          <NavBtn on={tab==="clients"||client} icon={I.users} label={T(segment,"contacts")} onClick={()=>goTab("clients")}/>
          <button className="fab" onClick={startRec} aria-label="녹음">{I.mic()}</button>
          <NavBtn on={tab==="calendar"} icon={I.cal} label="캘린더" onClick={()=>goTab("calendar")}/>
          <NavBtn on={tab==="kb"} icon={I.book} label="지식백과" onClick={()=>goTab("kb")}/>
        </div>
        )}

        {showInstall && <InstallSheet close={()=>setShowInstall(false)} onConfirm={()=>{ dismissInstall(); setShowInstall(false); }}/>}
      </div>
    </div>
  );
}

function NavBtn({on,icon,label,onClick}){
  return <button className={"navitem"+(on?" on":"")} onClick={onClick}>{icon({})}<span>{label}</span></button>;
}

/* ---------------- TODAY ---------------- */
function Today({user,startRec,todos,toggleTodo,setTodoStatus,openClient,seeSummary,openPricing,segment,openSearch,openSettings,openDetail,eventsToday,meetings,revenue,onRefresh}){
  const clients=getClients();
  const near=clients.filter(c=>c.group&&c.group!=="미분류").slice(0,3);
  const doneCount=todos.filter(t=>t.done).length;
  const isBiz=segment==="business";
  const [todoView,setTodoView]=useState("check");
  const now=new Date();
  const dateLabel=now.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"long"});
  const greetName=(user?.name||"회원").split(" ")[0];
  const trialLeft=user?.trialDaysLeft;
  const latestMeeting=meetings?.[0];
  const empty=clients.length===0 && todos.length===0;
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <div>
          <div className="h-eyebrow">{dateLabel}</div>
          <div className="h-title">안녕하세요, {greetName}님</div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="iconbtn" onClick={openSearch}>{I.search({width:19,height:19})}</button>
          <button className="iconbtn" onClick={openSettings}>{I.gear({width:19,height:19})}</button>
        </div>
      </div>

      {trialLeft!=null && (
      <div className="pad" style={{marginTop:14}}>
        <div className="card row between" style={{padding:"13px 15px",cursor:"pointer",
          background:"var(--ink)",border:"none"}} onClick={openPricing}>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:13.5}}>무료 체험 {trialLeft}일 남음</div>
            <div style={{color:"#C9C2B4",fontSize:12,marginTop:2}}>하루 ₩330 · 커피 두 잔이면 한 달</div>
          </div>
          <span style={{color:"#fff",background:"var(--accent)",padding:"7px 13px",borderRadius:10,fontWeight:700,fontSize:13}}>요금제 보기</span>
        </div>
      </div>
      )}

      {empty && (
      <div className="pad" style={{marginTop:14}}>
        <div className="card" style={{padding:18,background:"var(--accent-soft)",border:"1px solid #F3D8CB"}}>
          <div style={{fontWeight:700,fontSize:15}}>첫 기록을 시작해보세요</div>
          <div className="small" style={{marginTop:6,lineHeight:1.55}}>녹음을 끄면 요약 · 할 일 · 다음 약속이 자동으로 정리돼요.</div>
          <button className="btn btn-accent" style={{width:"100%",padding:13,marginTop:14,fontSize:14}} onClick={startRec}>첫 녹음 시작</button>
        </div>
      </div>
      )}

      {/* 후속 챙기기(미완료 액션) */}
      {todos.filter(t=>!t.done).length>0 && (
      <div className="pad" style={{marginTop:18}}>
        <div className="card" style={{padding:"13px 15px",borderLeft:"4px solid var(--accent)",cursor:"pointer"}} onClick={()=>openDetail("followup")}>
          <div className="row" style={{gap:9,alignItems:"flex-start"}}>
            <span style={{color:"var(--accent-deep)",marginTop:1}}>{I.bolt({})}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13.5}}>후속 챙기기 · {todos.filter(t=>!t.done).length}건</div>
              <div className="small" style={{marginTop:4,lineHeight:1.5}}>
                {todos.filter(t=>!t.done).slice(0,2).map(t=>t.t).join(" · ")}
              </div>
            </div>
            <span style={{color:"var(--muted)"}}>{I.chevR({})}</span>
          </div>
        </div>
      </div>
      )}

      {/* 이번 달 매출 */}
      <div className="pad" style={{marginTop:18}}>
        <div className="card" style={{padding:16,cursor:"pointer"}} onClick={()=>openDetail("revenue")}>
          <div className="row between">
            <div className="small" style={{fontWeight:700}}>이번 달 매출 (공급가액)</div>
            <span className="small" style={{display:"flex",alignItems:"center",gap:3}}>{now.getMonth()+1}월 {I.chevron({width:15,height:15})}</span>
          </div>
          <div className="row between" style={{marginTop:8,alignItems:"flex-end"}}>
            <div>
              <div style={{fontWeight:800,fontSize:23}}>₩ {(revenue?.supplyAmount||0).toLocaleString("ko-KR")}</div>
              <div className="small" style={{marginTop:2}}>합계 ₩ {(revenue?.total||0).toLocaleString("ko-KR")} (부가세 포함)</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="small">파이프라인(예상)</div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--accent-deep)"}}>₩ {(revenue?.pipeline||0).toLocaleString("ko-KR")}</div>
            </div>
          </div>
          <div className="row" style={{gap:6,marginTop:12}}>
            <span className="tag green">성사 {revenue?.wonCount||0}건</span><span className="tag amber">진행 {revenue?.pipelineCount||0}건</span>
          </div>
        </div>
      </div>

      {/* 핵심 액션 */}
      <div className="pad" style={{marginTop:18}}>
        <button className="btn btn-accent" onClick={startRec}
          style={{width:"100%",padding:"16px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
          {I.mic({width:20,height:20})} {isBiz?"녹음 · 사진으로 기록":"강의 녹음 시작"}
        </button>
      </div>

      {/* 오늘 일정 */}
      <div className="pad"><div className="section-h">오늘 일정</div></div>
      <div className="pad">
        <div className="card" style={{padding:"4px 16px"}}>
          {eventsToday.length===0 ? (
            <div className="small" style={{padding:"18px 0",textAlign:"center"}}>오늘 일정이 없어요</div>
          ) : eventsToday.map((e,i)=>(
            <EventRow key={e.id||i} time={e.time} title={e.title} place={e.place} accent={i===0}
              last={i===eventsToday.length-1} onClick={()=>openDetail("event",e)}/>
          ))}
        </div>
      </div>

      {/* 할 일 — 체크 / 보드 전환 */}
      <div className="pad row between" style={{alignItems:"flex-end"}}>
        <div className="section-h" style={{marginBottom:0}}>할 일 <span className="small" style={{fontWeight:700}}>{doneCount}/{todos.length}</span></div>
        <div className="seg" style={{width:128}}>
          <button className={todoView==="check"?"on":""} onClick={()=>setTodoView("check")} style={{padding:"6px 0",fontSize:12.5}}>체크</button>
          <button className={todoView==="board"?"on":""} onClick={()=>setTodoView("board")} style={{padding:"6px 0",fontSize:12.5}}>보드</button>
        </div>
      </div>
      <div className="pad" style={{marginTop:10}}>
        {todoView==="check" ? (
          <div className="card" style={{padding:"6px 16px"}}>
            {todos.map((t,i)=>(
              <div key={i} className="list-item row" style={{gap:11,padding:"13px 0"}}>
                <span style={{width:4,alignSelf:"stretch",borderRadius:3,background:PRI[t.pri].c,flex:"0 0 auto"}}/>
                <span onClick={()=>toggleTodo(i)} style={{cursor:"pointer"}}><Checkbox on={t.done}/></span>
                <div style={{flex:1,cursor:"pointer"}} onClick={()=>openDetail("task",{...t,i})}>
                  <div style={{textDecoration:t.done?"line-through":"none",color:t.done?"var(--muted)":"var(--ink)",fontWeight:500,fontSize:14.5}}>{t.t}</div>
                  <div className="row" style={{gap:6,marginTop:4}}>
                    <span style={{fontSize:10.5,fontWeight:700,color:PRI[t.pri].c}}>{PRI[t.pri].l}</span>
                    {t.due!=="-"&&<span className="small" style={{fontSize:11}}>· {t.due}</span>}
                  </div>
                </div>
                <span style={{color:"var(--muted)"}} onClick={()=>openDetail("task",{...t,i})}>{I.chevron({})}</span>
              </div>
            ))}
          </div>
        ) : (
          <TodoBoard todos={todos} setTodoStatus={setTodoStatus} openDetail={openDetail} onRefresh={onRefresh}/>
        )}
      </div>

      {/* 최근 요약 */}
      <div className="pad"><div className="section-h">{isBiz?"최근 기록 요약":"최근 강의 요약"}</div></div>
      <div className="pad">
        {latestMeeting ? (
        <div className="card" style={{padding:16,cursor:"pointer"}} onClick={seeSummary}>
          <div className="row between">
            <div className="row" style={{gap:10}}>
              <div className="avatar">{(latestMeeting.contact?.company||latestMeeting.oneLine||"?")[0]}</div>
              <div><div style={{fontWeight:700,fontSize:14.5}}>{latestMeeting.contact?.company||"기록"}</div>
                <div className="small">{latestMeeting.contact?.person||""}</div></div>
            </div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </div>
          <div style={{marginTop:12,fontSize:13.5,lineHeight:1.55,color:"#4a463f"}}>
            {latestMeeting.oneLine||"요약 없음"}
          </div>
        </div>
        ) : (
        <div className="card" style={{padding:18,textAlign:"center"}}>
          <div className="small">아직 기록이 없어요</div>
          <button className="btn btn-accent" style={{marginTop:12,padding:"11px 20px",fontSize:13}} onClick={startRec}>첫 녹음하기</button>
        </div>
        )}
      </div>

      {/* 비즈니스: 내 주변 거래처 / 학생: 복습 추천 */}
      {isBiz && near.length>0 ? <>
      <div className="pad row between"><div className="section-h">인맥</div></div>
      <div className="pad" style={{marginBottom:10}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {near.map((c)=>(
            <div key={c.id} className="list-item row between" onClick={()=>openClient(c)}>
              <div className="row" style={{gap:11}}>
                <div className="avatar">{c.init}</div>
                <div><div style={{fontWeight:600,fontSize:14}}>{c.co}</div>
                  <div className="small">{c.person}</div></div>
              </div>
              <div className="row" style={{gap:10}}>
                <span className="tag green" style={{fontWeight:700}}>{c.dist}</span>
                <button className="iconbtn" style={{width:36,height:36,color:"var(--accent-deep)"}}
                  onClick={(e)=>e.stopPropagation()}>{I.phone({})}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </> : <>
      <div className="pad"><div className="section-h">오늘 복습 추천</div></div>
      <div className="pad" style={{marginBottom:10}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {[["영어 단어 50개 ","오답 노트"],["물리 2단원 ","요약 카드"],["수학 미적분 ","개념 정리"]].map((r,i,a)=>(
            <div key={i} className="list-item row between" style={{padding:"14px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none"}}>
              <div style={{fontWeight:600,fontSize:14}}>{r[0]}<span className="small" style={{fontWeight:500}}>· {r[1]}</span></div>
              <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
            </div>
          ))}
        </div>
      </div>
      </>}
    </div>
  );
}

function EventRow({time,title,place,accent,last,onClick}){
  return (
    <div className="row" style={{gap:13,padding:"13px 0",borderBottom:last?"none":"1px solid var(--line)",cursor:onClick?"pointer":"default"}} onClick={onClick}>
      <div style={{width:46,flex:"0 0 auto"}}>
        <div style={{fontWeight:700,fontSize:14,color:accent?"var(--accent-deep)":"var(--ink)"}}>{time}</div>
      </div>
      <div style={{width:3,alignSelf:"stretch",borderRadius:3,background:accent?"var(--accent)":"var(--line)"}}/>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:14}}>{title}</div>
        <div className="small">{place}</div>
      </div>
      {onClick&&<span style={{color:"var(--muted)"}}>{I.chevron({})}</span>}
    </div>
  );
}
function Checkbox({on}){
  return <span style={{width:22,height:22,borderRadius:7,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
    border:on?"none":"2px solid var(--line)",background:on?"var(--green)":"transparent",color:"#fff"}}>{on&&I.check({})}</span>;
}

/* ---------------- CLIENTS ---------------- */
function TagChip({t}){
  const c=TAG_COLORS[t];
  return <span className={"tag"+(c&&c!=="accent"?" "+c:"")}>{t}</span>;
}

function Clients({group,setGroup,open,onAdd,seg}){
  const CLIENTS=getClients();
  const GROUPS=contactGroups(CLIENTS);
  const [view,setView]=useState("list");
  const [tag,setTag]=useState("전체");
  const [favs,setFavs]=useState(()=>new Set(CLIENTS.filter(c=>c.fav).map(c=>c.id)));
  const [onlyFav,setOnlyFav]=useState(false);
  const [sortGrade,setSortGrade]=useState(false);
  const toggleFav=async (id,e)=>{
    e&&e.stopPropagation();
    const c=CLIENTS.find(x=>x.id===id);
    if(!c) return;
    const next=!favs.has(id);
    setFavs(p=>{const n=new Set(p); next?n.add(id):n.delete(id); return n;});
    try{ await api.updateContact(id,{ favorite: next }); }
    catch(err){ setFavs(p=>{const n=new Set(p); next?n.delete(id):n.add(id); return n;}); alert(err.message); }
  };
  const term=T(seg,"contacts");
  const allTags=["전체",...Array.from(new Set(CLIENTS.flatMap(c=>c.tags||[])))];
  let list=group==="전체"?CLIENTS:CLIENTS.filter(c=>c.group===group);
  if(tag!=="전체") list=list.filter(c=>(c.tags||[]).includes(tag));
  if(onlyFav) list=list.filter(c=>favs.has(c.id));
  if(sortGrade) list=[...list].sort((a,b)=>totalInfluence(b)-totalInfluence(a));
  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">CRM</div>
        <div className="row between"><div className="h-title">{term}</div>
          <button className="iconbtn" style={{color:"var(--accent-deep)"}} onClick={onAdd}>{I.plus({width:20,height:20})}</button></div>
      </div>

      {/* 리스트 / 지도 토글 */}
      <div className="pad" style={{marginTop:14}}>
        <div className="seg">
          <button className={view==="list"?"on":""} onClick={()=>setView("list")}>리스트</button>
          <button className={view==="map"?"on":""} onClick={()=>setView("map")}>지도</button>
        </div>
      </div>

      {view==="map" ? <ClientMap open={open}/> : (
      <>
      {/* 그룹(소속) 필터 */}
      <div className="pad row" style={{gap:8,marginTop:14,overflowX:"auto"}}>
        {GROUPS.map(g=><button key={g} className={"chip"+(group===g?" on":"")} onClick={()=>setGroup(g)}>{g}</button>)}
        <button className="chip" style={{color:"var(--muted)"}}>+ 그룹</button>
      </div>
      {/* 태그(상태) 필터 */}
      <div className="pad row" style={{gap:7,marginTop:9,overflowX:"auto",alignItems:"center"}}>
        <span className="small" style={{flex:"0 0 auto",fontWeight:700}}>태그</span>
        {allTags.map(t=>(
          <button key={t} onClick={()=>setTag(t)}
            style={{flex:"0 0 auto",border:"none",background:"none",cursor:"pointer",padding:0,opacity:tag===t?1:.5}}>
            {t==="전체"?<span className={"chip"+(tag==="전체"?" on":"")}>전체</span>:<TagChip t={t}/>}
          </button>
        ))}
      </div>
      {/* 즐겨찾기 · 정렬 */}
      <div className="pad row" style={{gap:8,marginTop:9}}>
        <button className={"chip"+(onlyFav?" on":"")} onClick={()=>setOnlyFav(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:5}}>{I.star({width:13,height:13})} 즐겨찾기</button>
        <button className={"chip"+(sortGrade?" on":"")} onClick={()=>setSortGrade(v=>!v)}>기여도순</button>
      </div>
      <div className="pad" style={{marginTop:14}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {list.map(c=>{const g=grade(c);const fav=favs.has(c.id);const intro=introduced(c).length;return (
            <div key={c.id} className="list-item row between" onClick={()=>open(c)}>
              <div className="row" style={{gap:11,minWidth:0}}>
                <div style={{position:"relative",flex:"0 0 auto"}}>
                  <div className="avatar">{c.init}</div>
                  {g!=="-"&&<span style={{position:"absolute",right:-4,bottom:-4,width:18,height:18,borderRadius:"50%",
                    background:GRADE_COLOR[g],color:"#fff",fontSize:10,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #fff"}}>{g}</span>}
                </div>
                <div style={{minWidth:0}}>
                  <div className="row" style={{gap:5}}>
                    <div style={{fontWeight:700,fontSize:14.5}}>{c.co}</div>
                  </div>
                  <div className="small">{c.person} · 성사 {wonShort(c.won)}{intro>0?` · 소개 ${intro}명`:""}</div>
                  <div className="row" style={{gap:5,marginTop:6,flexWrap:"wrap"}}>
                    <span className="tag gray" style={{fontSize:10.5}}>{c.group}</span>
                    {(c.tags||[]).map(t=><TagChip key={t} t={t}/>)}
                  </div>
                </div>
              </div>
              <button className="iconbtn" style={{width:38,height:38,flex:"0 0 auto",color:fav?"var(--accent)":"#CFC8BB"}}
                onClick={(e)=>toggleFav(c.id,e)}>{I.star({})}</button>
            </div>
          );})}
          {list.length===0 && <div className="small" style={{textAlign:"center",padding:"24px 0"}}>{onlyFav?"즐겨찾기한 인맥이 없어요":"해당 조건의 인맥이 없어요"}</div>}
        </div>
        <div className="small" style={{textAlign:"center",marginTop:16}}>{list.length}개 {term}</div>
      </div>
      </>
      )}
    </div>
  );
}

function ClientMap({open}){
  const CLIENTS=getClients();
  const near=CLIENTS.filter(c=>c.group&&c.group!=="미분류");
  const [sel,setSel]=useState(near[0]||CLIENTS[0]);
  if(!CLIENTS.length) return (
    <div className="pad small" style={{textAlign:"center",padding:"40px 0"}}>인맥을 추가하면 지도에 표시돼요</div>
  );
  if(!sel) return null;
  return (
    <div className="fade">
      <div className="pad row" style={{gap:5,marginTop:14,color:"var(--muted)",fontSize:12.5,fontWeight:600}}>
        {I.pin({})} 위치 정보가 있는 인맥 {near.length}곳
      </div>
      <div className="mapwrap">
        <div className="mypulse"/>
        <div className="mydot"/>
      </div>
      <div className="pad" style={{marginTop:12,marginBottom:12}}>
        <div className="card" style={{padding:16}}>
          <div className="row between">
            <div className="row" style={{gap:12}}>
              <div className="avatar">{sel.init}</div>
              <div><div style={{fontWeight:700,fontSize:14.5}}>{sel.co}</div>
                <div className="small">{sel.person}</div></div>
            </div>
            <span className="tag gray">{sel.group}</span>
          </div>
          {sel.area && <div className="small" style={{marginTop:10,display:"flex",alignItems:"center",gap:5}}>{I.pin({})} {sel.area}</div>}
          <div className="row" style={{gap:10,marginTop:14}}>
            <button className="btn btn-ghost" style={{flex:1,padding:12}} onClick={()=>open(sel)}>상세 보기</button>
          </div>
        </div>
        {near.length>1 && (
          <div className="row" style={{gap:8,marginTop:12,overflowX:"auto"}}>
            {near.map(c=>(
              <button key={c.id} className={"chip"+(sel.id===c.id?" on":"")} onClick={()=>setSel(c)}>{c.co||c.person}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientDetail({c,back,startRec,seg,onRefresh}){
  const mt=T(seg,"meeting");
  const CLIENTS=getClients();
  const [fav,setFav]=useState(!!c.fav);
  const [detail,setDetail]=useState(null);
  const [loading,setLoading]=useState(true);
  const [tags,setTags]=useState(c.tags||[]);
  const [pickReferrer,setPickReferrer]=useState(false);
  const [addingDeal,setAddingDeal]=useState(false);
  const [dealForm,setDealForm]=useState({title:"",stage:"리드",supplyAmount:""});
  const reload=()=>api.getContact(c.id).then(setDetail).catch(()=>setDetail(null));
  useEffect(()=>{
    setLoading(true);
    reload().finally(()=>setLoading(false));
  },[c.id]);
  useEffect(()=>{ setTags(c.tags||[]); },[c.id,c.tags]);
  const patchTags=async (next)=>{
    setTags(next);
    try{ await api.updateContact(c.id,{ tags: next }); onRefresh?.(); }
    catch(e){ alert(e.message); setTags(c.tags||[]); }
  };
  const setReferrer=async (refId)=>{
    try{
      await api.updateContact(c.id,{ referredById: refId });
      setPickReferrer(false);
      onRefresh?.();
      reload();
    }catch(e){ alert(e.message); }
  };
  const saveDeal=async ()=>{
    if(!dealForm.title.trim()) return alert("딜 제목을 입력하세요");
    try{
      await api.saveDeal({
        contactId: c.id,
        title: dealForm.title.trim(),
        stage: dealForm.stage,
        supplyAmount: parseInt(String(dealForm.supplyAmount).replace(/\D/g,""),10)||0,
      });
      setAddingDeal(false);
      setDealForm({title:"",stage:"리드",supplyAmount:""});
      reload();
      onRefresh?.();
    }catch(e){ alert(e.message); }
  };
  const toggleOpenTodo=async (t)=>{
    if(!t.id) return;
    const next=t.done?"todo":"done";
    await api.updateTodo(t.id,{ status: next });
    reload();
    onRefresh?.();
  };
  const ind=indirectWon(c);
  const total=totalInfluence(c);
  const g=grade(c);
  const by=introducedBy(c);
  const kids=introduced(c);
  const deals=detail?.deals||[];
  const deal=deals[0];
  const upcoming=(detail?.upcomingEvents||[]).map(eventToUi);
  const openTodos=(detail?.openTodos||[]).map(todoToUi);
  const meetHistory=detail?.meetings||[];
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="row" style={{gap:6}}>
          <span className="tag gray">{c.group}</span>
          <button className="iconbtn" style={{color:fav?"var(--accent)":"#CFC8BB"}} onClick={async ()=>{
            const next=!fav;
            setFav(next);
            try{ await api.updateContact(c.id,{ favorite: next }); }
            catch(e){ setFav(!next); alert(e.message); }
          }}>{I.star({})}</button>
        </div>
      </div>
      <div className="pad" style={{marginTop:14,textAlign:"center"}}>
        <div style={{position:"relative",width:64,margin:"0 auto"}}>
          <div className="avatar" style={{width:64,height:64,borderRadius:22,margin:"0 auto",fontSize:22}}>{c.init}</div>
          {g!=="-"&&<span style={{position:"absolute",right:-6,bottom:-2,width:24,height:24,borderRadius:"50%",
            background:GRADE_COLOR[g],color:"#fff",fontSize:12,fontWeight:800,
            display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--paper)"}}>{g}</span>}
        </div>
        <div className="h-title" style={{marginTop:12}}>{c.person}</div>
        <div className="small" style={{marginTop:2}}>{c.co}</div>
        {by && <div className="small" style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:4,
          background:"#fff",border:"1px solid var(--line)",borderRadius:20,padding:"4px 10px"}}>
          {I.users({width:13,height:13})} {by.person} 님의 소개</div>}
        <div className="row" style={{gap:10,marginTop:16}}>
          <button className="btn btn-accent" style={{flex:1,padding:13,display:"flex",justifyContent:"center",gap:7}}
            onClick={()=>c.phone&&window.open(`tel:${c.phone.replace(/\s/g,"")}`)} disabled={!c.phone}>{I.phone({})} 전화</button>
          <button className="btn btn-ghost" style={{flex:1,padding:13}} onClick={startRec}>{mt} 녹음</button>
        </div>
      </div>

      {/* 영향력 (직접 + 소개) */}
      <div className="pad"><div className="section-h">영향력 · 기여도</div></div>
      <div className="pad">
        <div className="card" style={{padding:16}}>
          <div className="row between" style={{alignItems:"flex-end"}}>
            <div><div className="small">총 영향력</div>
              <div style={{fontWeight:800,fontSize:22}}>{wonShort(total)}</div></div>
            <span className="tag" style={{background:GRADE_COLOR[g],color:"#fff",fontWeight:800}}>{g}급</span>
          </div>
          <div className="brk" style={{marginTop:10}}><span className="small">직접 성사</span><span style={{fontWeight:700}}>{wonShort(c.won||0)}</span></div>
          <div className="brk"><span className="small">소개로 발생(간접)</span><span style={{fontWeight:700,color:"var(--accent-deep)"}}>{wonShort(ind)}</span></div>
          <div className="row between" style={{padding:"8px 0 0"}}><span className="small">미팅</span><span style={{fontWeight:600}}>{c.meets||0}회</span></div>
          {ind>0 && <div className="small" style={{marginTop:8,lineHeight:1.5}}>소개한 인맥의 성과가 1단계 50%·2단계 25%로 반영돼요.</div>}
        </div>
      </div>

      {/* 소개 관계 플로 */}
      <>
      <div className="pad"><div className="section-h">소개 관계</div></div>
      <div className="pad">
        <div className="card" style={{padding:16}}>
          {by && (
            <div className="row" style={{gap:10,paddingBottom:12,borderBottom:kids.length?"1px solid var(--line)":"none"}}>
              <div className="small" style={{width:64,flex:"0 0 auto"}}>소개해준</div>
              <div className="row" style={{gap:9}}><div className="avatar" style={{width:32,height:32,borderRadius:10,fontSize:12}}>{by.init}</div>
                <div><div style={{fontWeight:600,fontSize:13.5}}>{by.person}</div><div className="small" style={{fontSize:11}}>{by.co}</div></div></div>
            </div>
          )}
          {kids.length>0 && (
            <div style={{paddingTop:by?12:0}}>
              <div className="small" style={{marginBottom:8}}>이 사람이 소개한 인맥 · {kids.length}명</div>
              {kids.map(k=>(
                <div key={k.id} className="row between" style={{padding:"8px 0"}}>
                  <div className="row" style={{gap:9}}><div className="avatar" style={{width:32,height:32,borderRadius:10,fontSize:12}}>{k.init}</div>
                    <div><div style={{fontWeight:600,fontSize:13.5}}>{k.person}</div><div className="small" style={{fontSize:11}}>{k.co}</div></div></div>
                  <span className="small" style={{fontWeight:700,color:k.won?"var(--accent-deep)":"var(--muted)"}}>{wonShort(k.won||0)}</span>
                </div>
              ))}
            </div>
          )}
          {pickReferrer ? (
            <div style={{marginTop:10,maxHeight:200,overflowY:"auto"}}>
              {CLIENTS.filter(x=>x.id!==c.id).map(x=>(
                <div key={x.id} className="list-item row between" style={{cursor:"pointer",padding:"10px 0"}} onClick={()=>setReferrer(x.id)}>
                  <span style={{fontWeight:600,fontSize:13.5}}>{x.person} · {x.co}</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{width:"100%",padding:10,marginTop:6,fontSize:13}} onClick={()=>setPickReferrer(false)}>취소</button>
            </div>
          ) : (
          <button className="btn btn-ghost" style={{width:"100%",padding:11,marginTop:10,fontSize:13,color:"var(--accent-deep)",display:"flex",justifyContent:"center",gap:7}}
            onClick={()=>setPickReferrer(true)}>
            {I.plus({width:15,height:15})} 소개 관계 추가
          </button>
          )}
        </div>
      </div>
      </>

      {/* 미팅 전 준비 카드 */}
      {meetHistory[0] && (
      <div className="pad" style={{marginTop:18}}>
        <div className="card" style={{padding:16,background:"var(--accent-soft)",border:"1px solid #F3D8CB"}}>
          <div className="row" style={{gap:8,marginBottom:10}}>
            <span style={{color:"var(--accent-deep)"}}>{I.bolt({})}</span>
            <div style={{fontWeight:800,fontSize:13.5,color:"var(--accent-deep)"}}>최근 {mt}</div>
          </div>
          <div style={{fontSize:13,lineHeight:1.6,color:"#5a4a40"}}>
            {meetHistory[0].oneLine || meetHistory[0].summary?.one_line || "요약 없음"}
          </div>
        </div>
      </div>
      )}

      {/* 딜 / 견적 */}
      <div className="pad row between"><div className="section-h">딜 · 견적</div>
        <button className="chip" style={{color:"var(--accent-deep)",marginTop:22}} onClick={()=>setAddingDeal(v=>!v)}>+ 딜</button></div>
      <div className="pad">
        {addingDeal && (
          <div className="card" style={{padding:16,marginBottom:10}}>
            <input value={dealForm.title} onChange={e=>setDealForm(p=>({...p,title:e.target.value}))} placeholder="딜 제목"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"12px",fontFamily:"inherit",fontSize:14,marginBottom:10}}/>
            <div className="row" style={{gap:10,marginBottom:10}}>
              <select value={dealForm.stage} onChange={e=>setDealForm(p=>({...p,stage:e.target.value}))}
                style={{flex:1,border:"1px solid var(--line)",borderRadius:12,padding:"12px",fontFamily:"inherit",fontSize:14}}>
                {["리드","견적","협상","성사","실패"].map(s=><option key={s}>{s}</option>)}
              </select>
              <input value={dealForm.supplyAmount} onChange={e=>setDealForm(p=>({...p,supplyAmount:e.target.value}))} placeholder="공급가액(원)"
                style={{flex:1,border:"1px solid var(--line)",borderRadius:12,padding:"12px",fontFamily:"inherit",fontSize:14}}/>
            </div>
            <button className="btn btn-accent" style={{width:"100%",padding:12}} onClick={saveDeal}>저장</button>
          </div>
        )}
        {deals.length===0 && !deal && !addingDeal ? (
        <div className="card small" style={{padding:20,textAlign:"center"}}>등록된 딜이 없어요</div>
        ) : (
        <>
        {(deal ? [deal] : deals).map(d=>{
          const sup=d.supplyAmount||0;
          const vat=Math.round(sup*0.1);
          return (
        <div key={d.id} className="card" style={{padding:16,marginBottom:10}}>
          <div className="row between" style={{marginBottom:4}}>
            <div className="small" style={{fontSize:11}}>{d.title}</div>
            <span className="tag amber">{d.stage}</span>
          </div>
          <div className="brk"><span className="small">공급가액</span><span style={{fontWeight:700}}>₩ {sup.toLocaleString()}</span></div>
          <div className="brk"><span className="small">부가세 (10%)</span><span style={{fontWeight:600}}>₩ {vat.toLocaleString()}</span></div>
          <div className="row between" style={{padding:"10px 0 2px"}}>
            <span style={{fontWeight:700,fontSize:14}}>합계 (×1.1)</span>
            <span style={{fontWeight:800,fontSize:18}}>₩ {(sup+vat).toLocaleString()}</span>
          </div>
        </div>
        );})}
        {deals.length>1 && deals.slice(1).map(d=>(
          <div key={d.id} className="card row between" style={{padding:14,marginBottom:8}}>
            <span style={{fontWeight:600}}>{d.title}</span>
            <span className="tag amber">{d.stage}</span>
          </div>
        ))}
        </>
        )}
      </div>

      {/* 태그 (자유·복수) */}
      <div className="pad row between"><div className="section-h">태그</div>
        <span className="small" style={{marginTop:22}}>그룹 {c.group}</span></div>
      <div className="pad row" style={{gap:7,flexWrap:"wrap",marginBottom:8}}>
        {tags.map(t=>{const col=TAG_COLORS[t];return(
          <span key={t} className={"tag"+(col&&col!=="accent"?" "+col:"")} style={{padding:"7px 11px",gap:6,cursor:"pointer"}}
            onClick={()=>patchTags(tags.filter(x=>x!==t))}>
            {t} ✕
          </span>
        );})}
        {PRESET_TAGS.filter(t=>!tags.includes(t)).map(t=>(
          <button key={t} type="button" className="chip" style={{padding:"7px 12px",fontSize:12}} onClick={()=>patchTags([...tags,t])}>+ {t}</button>
        ))}
      </div>

      {/* 이 사람과의 예정 일정 */}
      <div className="pad"><div className="section-h">예정 일정</div></div>
      <div className="pad">
        <div className="card" style={{padding:"4px 16px"}}>
          {loading && <div className="small" style={{textAlign:"center",padding:"20px 0"}}>불러오는 중…</div>}
          {!loading && upcoming.length===0 && <div className="small" style={{textAlign:"center",padding:"20px 0"}}>예정 일정이 없어요</div>}
          {upcoming.map((e,i,a)=>(
            <div key={e.id} className="row" style={{gap:13,padding:"14px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none"}}>
              <div style={{width:46,height:46,borderRadius:13,flex:"0 0 auto",background:"var(--accent-soft)",color:"var(--accent-deep)",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:9,fontWeight:700}}>{e.month}월</span>
                <span style={{fontSize:17,fontWeight:800,lineHeight:1}}>{e.day}</span>
              </div>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{e.title}</div><div className="small">{e.time}{e.place?` · ${e.place}`:""}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="pad"><div className="section-h">진행 중 액션</div></div>
      <div className="pad">
        <div className="card" style={{padding:"6px 16px"}}>
          {openTodos.length===0 && <div className="small" style={{textAlign:"center",padding:"20px 0"}}>진행 중 할 일이 없어요</div>}
          {openTodos.map((t,i)=>(
            <div key={t.id||i} className="list-item row" style={{gap:12,cursor:"pointer"}} onClick={()=>toggleOpenTodo(t)}>
              <Checkbox on={t.done}/>
              <div style={{flex:1,fontSize:14,fontWeight:500,textDecoration:t.done?"line-through":"none"}}>{t.t}</div>
              {t.due!=="-" && <span className="tag">{t.due}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="pad"><div className="section-h">함께한 {mt} 이력</div></div>
      <div className="pad" style={{marginBottom:10}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {meetHistory.length===0 && <div className="small" style={{textAlign:"center",padding:"20px 0"}}>{mt} 기록이 없어요</div>}
          {meetHistory.map((m,i,a)=>{
            const d=m.createdAt?new Date(m.createdAt):null;
            const label=d?`${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`:"";
            return (
            <div key={m.id} className="row" style={{gap:13,padding:"15px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none"}}>
              <div style={{width:42,fontWeight:700,fontSize:13,color:"var(--accent-deep)"}}>{label}</div>
              <div style={{flex:1,fontSize:13.5,lineHeight:1.5}}>{m.oneLine||"요약 없음"}</div>
              <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

/* ---------------- RECORD + SUMMARY ---------------- */
function RecordScreen({phase,secs,mmss,hl,setHl,onComplete,todos,toggleTodo,goClients,summary}){
  const CLIENTS=getClients();
  const [att,setAtt]=useState(()=>CLIENTS.slice(0,2).map(c=>c.id));
  const [pick,setPick]=useState(false);
  const [q,setQ]=useState("");
  const [mode,setMode]=useState("rec");
  const [photos,setPhotos]=useState([]);
  const [finishing,setFinishing]=useState(false);
  const recorderRef=useRef(null);
  const toggleAtt=(id)=>setAtt(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const found=CLIENTS.filter(c=>(c.person+c.co).toLowerCase().includes(q.trim().toLowerCase()));
  const primary=CLIENTS.find(c=>att.includes(c.id))||CLIENTS[0];

  useEffect(()=>{
    if(phase!=="rec"||mode!=="rec") return;
    const rec=new AudioRecorder();
    recorderRef.current=rec;
    rec.start().catch(e=>alert("마이크 권한이 필요합니다: "+e.message));
    return ()=>{ rec.stream?.getTracks().forEach(t=>t.stop()); };
  },[phase,mode]);

  const addPhoto=async ()=>{
    try{
      const file=await pickImageFile(true);
      const preview=URL.createObjectURL(file);
      setPhotos(p=>[...p,{file,preview}]);
    }catch(e){ if(e.message!=="파일이 선택되지 않았습니다") alert(e.message); }
  };

  const finish=async ()=>{
    if(finishing) return;
    setFinishing(true);
    try{
      const payload={
        mode,
        attendees: att,
        contactId: primary?.id,
        companyName: primary?.co,
      };
      if(mode==="rec"){
        if(!recorderRef.current) throw new Error("녹음이 준비되지 않았습니다");
        const blob=await recorderRef.current.stop();
        const ext=blob.type.includes("webm")?"webm":"m4a";
        payload.mediaKey=await uploadBlob(blob,`recording-${Date.now()}.${ext}`,blob.type);
      }else{
        if(!photos.length) throw new Error("사진을 추가해주세요");
        payload.imageKeys=await Promise.all(photos.map((p,i)=>uploadFile(p.file)));
      }
      await onComplete(payload);
    }catch(e){ alert(e.message||"업로드 실패"); setFinishing(false); }
  };

  if(phase==="sum") return <Summary todos={todos} toggleTodo={toggleTodo} goClients={goClients} att={att} summary={summary}/>;
  if(phase==="proc") return (
    <div className="fade" style={{padding:"120px 30px",textAlign:"center"}}>
      <div className="spinner" style={{margin:"0 auto"}}/>
      <div style={{marginTop:22,fontWeight:700,fontSize:17}}>정리하는 중…</div>
      <div className="small" style={{marginTop:8,lineHeight:1.6}}>
        {mode==="photo" ? <>사진 속 글자를 읽고(OCR)<br/>요약·액션·다음 약속을 추출하고 있어요</>
                        : <>음성을 텍스트로 변환하고<br/>요약·액션·다음 약속을 추출하고 있어요</>}
      </div>
    </div>
  );
  // 입력 화면
  return (
    <div className="fade" style={{padding:"24px 24px 30px"}}>
      <div className="h-eyebrow" style={{textAlign:"center"}}>새 기록{primary?` · ${primary.co||primary.person}`:""}</div>

      {/* 녹음 / 사진 모드 */}
      <div className="seg" style={{marginTop:14}}>
        <button className={mode==="rec"?"on":""} onClick={()=>setMode("rec")}>녹음</button>
        <button className={mode==="photo"?"on":""} onClick={()=>setMode("photo")}>사진 · 문서</button>
      </div>

      {/* 참석자 태그 */}
      <div style={{marginTop:16}}>
        <div className="small" style={{fontWeight:700,marginBottom:8}}>참석자</div>
        <div className="row" style={{gap:7,flexWrap:"wrap"}}>
          {att.map(id=>{const c=CLIENTS.find(x=>x.id===id);if(!c)return null;return(
            <span key={id} className="tag" style={{padding:"7px 10px",fontSize:12.5,gap:6}}>
              {c.person}<span onClick={()=>toggleAtt(id)} style={{cursor:"pointer",opacity:.6}}>✕</span>
            </span>
          );})}
          <button className="chip" style={{padding:"7px 11px",color:"var(--accent-deep)",borderColor:"#F3D8CB"}}
            onClick={()=>setPick(p=>!p)}>+ 참석자</button>
        </div>
        {pick && (
          <div className="card fade" style={{padding:"12px 14px 4px",marginTop:10}}>
            <div className="row" style={{gap:9,background:"#F4F1EA",borderRadius:11,padding:"10px 12px",color:"var(--muted)"}}>
              {I.search({width:16,height:16})}
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="이름 · 회사 검색"
                style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:13.5,color:"var(--ink)"}}/>
              {q && <span onClick={()=>setQ("")} style={{cursor:"pointer"}}>✕</span>}
            </div>
            <div style={{maxHeight:230,overflowY:"auto",marginTop:4}}>
              {found.length===0 && <div className="small" style={{textAlign:"center",padding:"22px 0"}}>“{q}” 검색 결과 없음</div>}
              {found.map(c=>(
                <div key={c.id} className="list-item row between" style={{padding:"11px 0",cursor:"pointer"}} onClick={()=>toggleAtt(c.id)}>
                  <div className="row" style={{gap:10}}>
                    <div className="avatar" style={{width:34,height:34,borderRadius:11,fontSize:13}}>{c.init}</div>
                    <div><div style={{fontWeight:600,fontSize:13.5}}>{c.person}</div><div className="small" style={{fontSize:11.5}}>{c.co}</div></div>
                  </div>
                  <Checkbox on={att.includes(c.id)}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {mode==="rec" ? (
      <>
      <div style={{position:"relative",width:150,height:150,margin:"30px auto 0"}}>
        <span style={{position:"absolute",inset:0,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s ease-out infinite"}}/>
        <span style={{position:"absolute",inset:0,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s ease-out infinite",animationDelay:"1s"}}/>
        <div style={{position:"absolute",inset:32,borderRadius:"50%",background:"var(--accent)",
          display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 14px 30px -8px rgba(221,94,57,.6)"}}>
          {I.mic({width:32,height:32})}
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:38,fontWeight:700,letterSpacing:".02em",marginTop:26,fontVariantNumeric:"tabular-nums"}}>{mmss(secs)}</div>
      {/* waveform */}
      <div className="row" style={{justifyContent:"center",gap:4,height:34,marginTop:14}}>
        {Array.from({length:21}).map((_,i)=>(
          <span key={i} style={{width:4,height:"100%",borderRadius:3,background:"var(--accent)",opacity:.85,
            transformOrigin:"center",animation:`bars ${0.7+(i%5)*0.18}s ease-in-out infinite`,animationDelay:`${i*0.05}s`}}/>
        ))}
      </div>
      <div className="row" style={{gap:12,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1,padding:14,display:"flex",justifyContent:"center",gap:7,color:"var(--accent-deep)"}}
          onClick={()=>setHl(h=>h+1)}>{I.star({})} 하이라이트{hl>0?` ${hl}`:""}</button>
      </div>
      <button className="btn" style={{width:"100%",marginTop:12,padding:16,background:"var(--ink)",color:"#fff",fontSize:15}}
        onClick={finish} disabled={finishing}>{finishing?"업로드 중…":"녹음 종료 · 요약하기"}</button>
      <div className="small" style={{marginTop:14,lineHeight:1.5,textAlign:"center"}}>참석자를 태그하면 요약이 각 연락처 이력에 쌓여요.</div>
      </>
      ) : (
      <>
      {/* 사진 · 문서 모드 */}
      <div className="small" style={{fontWeight:700,marginTop:22,marginBottom:8}}>사진 · 문서 ({photos.length})</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {photos.map((p,i)=>(
          <div key={i} style={{aspectRatio:"1/1",borderRadius:14,background:"#ECE8E0",position:"relative",overflow:"hidden"}}>
            <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <span onClick={()=>setPhotos(s=>s.filter((_,k)=>k!==i))}
              style={{position:"absolute",top:5,right:5,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,.5)",
                color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>✕</span>
          </div>
        ))}
        <button onClick={addPhoto}
          style={{aspectRatio:"1/1",borderRadius:14,border:"1px dashed var(--line)",background:"#FBFAF6",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,color:"var(--accent-deep)"}}>
          {I.plus({width:20,height:20})}<span style={{fontSize:11,fontWeight:700}}>추가</span>
        </button>
      </div>
      <div className="card" style={{padding:14,marginTop:14,background:"var(--accent-soft)",border:"1px solid #F3D8CB"}}>
        <div className="row" style={{gap:9}}>
          <span style={{color:"var(--accent-deep)"}}>{I.star({})}</span>
          <div style={{fontSize:13,lineHeight:1.5,color:"var(--accent-deep)"}}>
            명함·화이트보드·문서를 찍어 올리면 <b>글자를 읽어(OCR) 자동 정리</b>해요. 명함은 연락처로 등록도 제안해요.
          </div>
        </div>
      </div>
      <button className="btn" disabled={photos.length===0||finishing} style={{width:"100%",marginTop:14,padding:16,fontSize:15,
        background:photos.length===0?"#EDE9E0":"var(--ink)",color:photos.length===0?"#B7B0A3":"#fff",cursor:photos.length===0?"not-allowed":"pointer"}}
        onClick={finish}>{finishing?"업로드 중…":"사진으로 정리하기"}</button>
      <div className="small" style={{marginTop:14,lineHeight:1.5,textAlign:"center"}}>녹음 없이 사진만으로도 미팅을 기록할 수 있어요.</div>
      </>
      )}
    </div>
  );
}

function Summary({todos,toggleTodo,goClients,att=[],summary}){
  const CLIENTS=getClients();
  const s=summary?.summary;
  const oneLine=s?.one_line||"요약이 생성되었습니다";
  const keyPoints=s?.key_points||[];
  const primary=CLIENTS.find(c=>att.includes(c.id))||CLIENTS[0];
  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">미팅 요약 · 자동 생성됨</div>
        <div className="row between"><div className="h-title">정리 완료</div>
          <span className="tag green">{I.check({})} 저장됨</span></div>
      </div>

      {primary && (
      <div className="pad" style={{marginTop:14}}>
        <div className="card row between" style={{padding:14,cursor:"pointer"}} onClick={goClients}>
          <div className="row" style={{gap:11}}>
            <div className="avatar">{primary.init}</div>
            <div><div style={{fontWeight:700,fontSize:14.5}}>{primary.co||primary.person}</div>
              <div className="small">{primary.person}</div></div>
          </div>
          <span className="tag green">자동 연결됨</span>
        </div>
      </div>
      )}

      {/* 참석자 */}
      <div className="pad row between"><div className="section-h">참석자</div>
        <span className="tag green" style={{marginTop:20}}>→ 각 연락처에 기록</span></div>
      <div className="pad row" style={{gap:8,flexWrap:"wrap"}}>
        {att.map(id=>{const c=CLIENTS.find(x=>x.id===id);if(!c)return null;return(
          <div key={id} className="card row" style={{gap:9,padding:"8px 12px",cursor:"pointer"}} onClick={goClients}>
            <div className="avatar" style={{width:28,height:28,borderRadius:9,fontSize:12}}>{c.init}</div>
            <div style={{fontSize:13,fontWeight:600}}>{c.person}</div>
          </div>
        );})}
      </div>

      {/* 한줄요약 */}
      <div className="pad" style={{marginTop:16}}>
        <div className="card" style={{padding:16,background:"var(--accent-soft)",border:"1px solid #F3D8CB"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"var(--accent-deep)"}}>한 줄 요약</div>
          <div style={{marginTop:7,fontSize:15,fontWeight:600,lineHeight:1.55}}>{oneLine}</div>
        </div>
      </div>

      {/* 핵심 논의 */}
      <div className="pad"><div className="section-h">핵심 논의</div></div>
      <div className="pad"><div className="card" style={{padding:"4px 16px"}}>
        {(keyPoints.length?keyPoints:["핵심 논의 항목이 여기 표시됩니다"]).map((t,i,a)=>(
          <div key={i} className="row" style={{gap:11,padding:"13px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",flex:"0 0 auto",marginTop:7}}/>
            <div style={{fontSize:14,lineHeight:1.5}}>{t}</div>
          </div>
        ))}
      </div></div>

      {/* 액션플랜 → 투두 */}
      <div className="pad row between"><div className="section-h">액션플랜</div>
        <span className="tag" style={{marginTop:20}}>→ 할 일에 자동 추가</span></div>
      <div className="pad"><div className="card" style={{padding:"6px 16px"}}>
        {todos.slice(0,2).map((t,i)=>(
          <div key={i} className="list-item row" style={{gap:12,padding:"13px 0"}} onClick={()=>toggleTodo(i)}>
            <Checkbox on={t.done}/>
            <div style={{flex:1,fontSize:14,fontWeight:500,textDecoration:t.done?"line-through":"none",color:t.done?"var(--muted)":"var(--ink)"}}>{t.t}</div>
            <span className="tag gray">{t.due}</span>
          </div>
        ))}
      </div></div>

      {/* 다음 약속 → 일정 */}
      {s?.next_meeting?.date && (
      <>
      <div className="pad row between"><div className="section-h">다음 약속</div>
        <span className="tag green" style={{marginTop:20}}>→ 캘린더 등록됨</span></div>
      <div className="pad">
        <div className="card row between" style={{padding:16}}>
          <div className="row" style={{gap:13}}>
            <div style={{width:46,height:46,borderRadius:14,background:"var(--green-soft)",color:"var(--green)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:"0 0 auto"}}>
              <span style={{fontSize:10,fontWeight:700}}>{s.next_meeting.date.split("-")[1]}월</span>
              <span style={{fontSize:18,fontWeight:800,lineHeight:1}}>{s.next_meeting.date.split("-")[2]}</span>
            </div>
            <div><div style={{fontWeight:700,fontSize:14.5}}>{primary?.co||"다음 미팅"}</div>
              <div className="small">{s.next_meeting.time||""}{s.next_meeting.place?` · ${s.next_meeting.place}`:""}</div></div>
          </div>
          {I.cal({width:20,height:20,style:{color:"var(--muted)"}})}
        </div>
      </div>
      </>
      )}

      {/* 첨부 */}
      <div className="pad"><div className="section-h">첨부 · 멀티모달</div></div>
      <div className="pad row" style={{gap:10,marginBottom:14}}>
        {["명함","현장 사진","메모"].map((a,i)=>(
          <div key={i} className="card" style={{flex:1,padding:"18px 0",textAlign:"center",fontSize:12.5,fontWeight:600,color:"var(--muted)"}}>{a}</div>
        ))}
      </div>

      <div className="pad row" style={{gap:10,marginBottom:8,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1,padding:13,display:"flex",justifyContent:"center",gap:7}}>{I.edit({})} 요약 수정</button>
        <button className="btn btn-ghost" style={{flex:1,padding:13,display:"flex",justifyContent:"center",gap:7}}>{I.refresh({})} 다시 생성</button>
      </div>
      <div className="pad" style={{marginBottom:10}}>
        <button className="btn btn-ghost" style={{width:"100%",padding:14}}>요약 템플릿 변경 · 공유</button>
      </div>
    </div>
  );
}

/* ---------------- CALENDAR ---------------- */
const REM_OPTS=["없음","10분 전","30분 전","1시간 전","1일 전"];
function monthStart(d){ const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function Calendar({openDetail}){
  const [mode,setMode]=useState("month");
  const [viewMonth,setViewMonth]=useState(()=>monthStart(new Date()));
  const [selDay,setSelDay]=useState(()=>new Date().getDate());
  const [events,setEvents]=useState([]);
  const [defRem,setDefRem]=useState(["1시간 전"]);
  const [rem,setRem]=useState({});
  const [sheet,setSheet]=useState(null);
  const [adding,setAdding]=useState(false);
  const [newEv,setNewEv]=useState({title:"",time:"10:00",place:""});
  const [savingEv,setSavingEv]=useState(false);
  const days=["일","월","화","수","목","금","토"];
  const year=viewMonth.getFullYear();
  const month=viewMonth.getMonth();
  const monthLabel=`${year}년 ${month+1}월`;
  const today=new Date();

  useEffect(()=>{
    const from=monthStart(viewMonth);
    const to=new Date(year, month+1, 0, 23, 59, 59);
    api.listEvents(from.toISOString(), to.toISOString())
      .then(list=>setEvents((list||[]).map(eventToUi)))
      .catch(()=>setEvents([]));
  },[viewMonth, year, month]);

  const eventsOnDay=(day)=>events.filter(e=>e.year===year&&e.month===month+1&&e.day===day);
  const evRows=eventsOnDay(selDay);
  const remFor=(key)=> rem[key]!==undefined ? rem[key] : defRem;
  const remLabel=(arr)=> (!arr||arr.length===0||arr.includes("없음")) ? "알림 없음" : arr[0]+(arr.length>1?` 외 ${arr.length-1}`:"");
  const applyRem=async (val)=>{
    if(!sheet) return;
    if(sheet.type==="default") setDefRem(val);
    else {
      setRem(p=>({...p,[sheet.key]:val}));
      if(sheet.eventId){
        try{ await api.updateEvent(sheet.eventId,{ reminders: val }); reloadEvents(); }
        catch(e){ alert(e.message); }
      }
    }
  };
  const reloadEvents=()=>{
    const from=monthStart(viewMonth);
    const to=new Date(year, month+1, 0, 23, 59, 59);
    api.listEvents(from.toISOString(), to.toISOString())
      .then(list=>setEvents((list||[]).map(eventToUi)))
      .catch(()=>setEvents([]));
  };
  const saveNewEvent=async ()=>{
    if(!newEv.title.trim()) return alert("제목을 입력하세요");
    setSavingEv(true);
    try{
      const [hh,mm]=(newEv.time||"10:00").split(":").map(Number);
      const startsAt=new Date(year, month, selDay, hh||10, mm||0);
      await api.createEvent({
        title: newEv.title.trim(),
        startsAt: startsAt.toISOString(),
        place: newEv.place.trim()||undefined,
        reminders: defRem,
      });
      setAdding(false);
      setNewEv({title:"",time:"10:00",place:""});
      reloadEvents();
    }catch(e){ alert(e.message||"일정 저장 실패"); }
    finally{ setSavingEv(false); }
  };

  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">{monthLabel}</div>
        <div className="row between"><div className="h-title">캘린더</div>
          <div className="seg" style={{width:130}}>
            <button className={mode==="week"?"on":""} onClick={()=>setMode("week")}>주</button>
            <button className={mode==="month"?"on":""} onClick={()=>setMode("month")}>월</button>
          </div>
        </div>
      </div>

      <div className="pad" style={{marginTop:12}}>
        <div className="card row between" style={{padding:"12px 15px",cursor:"pointer"}} onClick={()=>setSheet({type:"default"})}>
          <div className="row" style={{gap:9}}>{I.bell({width:17,height:17,style:{color:"var(--accent-deep)"}})}
            <span style={{fontWeight:600,fontSize:13.5}}>기본 알림</span></div>
          <div className="row" style={{gap:6,color:"var(--muted)"}}>
            <span style={{fontWeight:700,fontSize:13,color:"var(--ink)"}}>{remLabel(defRem)}</span>{I.chevron({width:16,height:16})}
          </div>
        </div>
      </div>

      {mode==="week" ? <WeekStrip days={days} year={year} month={month} selDay={selDay} setSelDay={setSelDay} events={events}/>
        : <MonthGrid days={days} year={year} month={month} selDay={selDay} setSelDay={setSelDay} events={events} today={today}/>}

      <div className="divider" style={{margin:"16px 20px 0"}}/>
      <div className="pad" style={{marginTop:16,marginBottom:10}}>
        <div className="row between" style={{marginBottom:10}}>
          <div className="section-h" style={{marginTop:0}}>{month+1}월 {selDay}일 일정</div>
          <button className="chip" style={{color:"var(--accent-deep)"}} onClick={()=>setAdding(true)}>+ 일정 추가</button>
        </div>
        {evRows.length===0 && !adding && <div className="small" style={{textAlign:"center",padding:"30px 0"}}>일정이 없습니다</div>}
        {adding && (
          <div className="card fade" style={{padding:16,marginBottom:12}}>
            <input value={newEv.title} onChange={e=>setNewEv(p=>({...p,title:e.target.value}))} placeholder="일정 제목"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",fontFamily:"inherit",fontSize:14,marginBottom:10}}/>
            <div className="row" style={{gap:10,marginBottom:10}}>
              <input type="time" value={newEv.time} onChange={e=>setNewEv(p=>({...p,time:e.target.value}))}
                style={{flex:1,border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",fontFamily:"inherit",fontSize:14}}/>
              <input value={newEv.place} onChange={e=>setNewEv(p=>({...p,place:e.target.value}))} placeholder="장소"
                style={{flex:2,border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",fontFamily:"inherit",fontSize:14}}/>
            </div>
            <div className="row" style={{gap:8}}>
              <button className="btn btn-accent" style={{flex:1,padding:12}} onClick={saveNewEvent} disabled={savingEv}>{savingEv?"저장 중…":"저장"}</button>
              <button className="btn btn-ghost" style={{flex:1,padding:12}} onClick={()=>setAdding(false)}>취소</button>
            </div>
          </div>
        )}
        {evRows.map((e,i)=>{
          const key=selDay+"-"+e.id; const r=remFor(key); const on=r&&r.length&&!r.includes("없음");
          return (
            <div key={e.id} className="card" style={{padding:15,marginBottom:10}}>
              <div className="row" style={{gap:13,cursor:"pointer"}}
                onClick={()=>openDetail&&openDetail("event",e)}>
                <div style={{width:48,flex:"0 0 auto"}}><div style={{fontWeight:700,fontSize:14,color:"var(--accent-deep)"}}>{e.time}</div></div>
                <div style={{width:3,alignSelf:"stretch",borderRadius:3,background:"var(--accent)"}}/>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14.5}}>{e.title}</div><div className="small">{e.place}</div></div>
                <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
              </div>
              <div className="row between" style={{marginTop:11,paddingTop:11,borderTop:"1px solid var(--line)"}}
                onClick={()=>setSheet({type:"event",key,title:e.title,eventId:e.id})} >
                <div className="row" style={{gap:7,color:on?"var(--accent-deep)":"var(--muted)",cursor:"pointer"}}>
                  {I.bell({width:15,height:15})}<span style={{fontSize:12.5,fontWeight:600}}>{remLabel(r)}</span>
                </div>
                <span className="small" style={{cursor:"pointer"}}>변경</span>
              </div>
            </div>
          );
        })}
      </div>

      {sheet && <ReminderSheet title={sheet.type==="default"?"기본 알림":"일정 알림"}
        subtitle={sheet.type==="event"?sheet.title:"새 일정에 자동 적용돼요"}
        value={sheet.type==="default"?defRem:remFor(sheet.key)}
        onApply={applyRem} close={()=>setSheet(null)}/>}
    </div>
  );
}

function ReminderSheet({title,subtitle,value,onApply,close}){
  const [val,setVal]=useState(value||["없음"]);
  const toggle=(opt)=>{
    if(opt==="없음"){ setVal(["없음"]); return; }
    let a=val.filter(x=>x!=="없음");
    a = a.includes(opt) ? a.filter(x=>x!==opt) : [...a,opt];
    setVal(a.length?a:["없음"]);
  };
  const save=()=>{ onApply(val); close(); };
  return (
    <div className="sheetbg" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheetbar"/>
        <div className="h-eyebrow">{title}</div>
        <div style={{fontWeight:800,fontSize:18,marginTop:4}}>알림 시점</div>
        <div className="small" style={{marginTop:4}}>{subtitle} · 여러 개 선택할 수 있어요</div>
        <div style={{marginTop:14}}>
          {REM_OPTS.map(o=>{
            const on=val.includes(o);
            return (
              <div key={o} className="row between" style={{padding:"13px 2px",borderBottom:"1px solid var(--line)",cursor:"pointer"}} onClick={()=>toggle(o)}>
                <span style={{fontWeight:on?700:500,fontSize:14.5,color:on?"var(--ink)":"var(--muted)"}}>{o}</span>
                <span style={{width:22,height:22,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",
                  border:on?"none":"2px solid var(--line)",background:on?"var(--accent)":"transparent",color:"#fff"}}>{on&&I.check({})}</span>
              </div>
            );
          })}
        </div>
        <button className="btn btn-accent" style={{width:"100%",padding:15,marginTop:18,fontSize:15}} onClick={save}>적용</button>
        <div className="small" style={{textAlign:"center",marginTop:12,lineHeight:1.5}}>알림을 받으려면 홈 화면 추가 시 푸시 권한을 허용해 주세요.</div>
      </div>
    </div>
  );
}

function WeekStrip({days,year,month,selDay,setSelDay,events}){
  const start=new Date(year,month,Math.max(1,selDay-3));
  const nums=Array.from({length:7},(_,i)=>{
    const d=new Date(start); d.setDate(start.getDate()+i);
    return {day:d.getDate(), month:d.getMonth(), year:d.getFullYear(), dow:d.getDay()};
  });
  return (
    <div className="pad row between" style={{marginTop:18,gap:4}}>
      {nums.map((n,i)=>{
        const has=events.some(e=>e.year===n.year&&e.month===n.month+1&&e.day===n.day);
        const on=n.year===year&&n.month===month&&n.day===selDay;
        return (
        <button key={i} onClick={()=>setSelDay(n.day)} style={{flex:1,border:"none",background:"none",cursor:"pointer",padding:"6px 0"}}>
          <div className="small" style={{fontWeight:600}}>{days[n.dow]}</div>
          <div style={{margin:"7px auto 0",width:36,height:36,borderRadius:13,display:"flex",alignItems:"center",justifyContent:"center",
            fontWeight:700,fontSize:15,background:on?"var(--accent)":"transparent",color:on?"#fff":"var(--ink)"}}>{n.day}</div>
          {has&&!on && <div style={{width:4,height:4,borderRadius:"50%",background:"var(--accent)",margin:"3px auto 0"}}/>}
        </button>
      );})}
    </div>
  );
}

function MonthGrid({days,year,month,selDay,setSelDay,events,today}){
  const firstDow=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push({n:null,muted:true});
  for(let d=1;d<=daysInMonth;d++) cells.push({n:d,muted:false});
  while(cells.length%7!==0) cells.push({n:null,muted:true});
  const isToday=(d)=>today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d;
  return (
    <div className="pad" style={{marginTop:16}}>
      <div className="mgrid" style={{marginBottom:6}}>
        {days.map((d,i)=><div key={d} className="small" style={{textAlign:"center",fontWeight:700,
          color:i===0?"var(--accent-deep)":"var(--muted)",paddingBottom:4}}>{d}</div>)}
      </div>
      <div className="mgrid">
        {cells.map((c,idx)=>{
          const has=!c.muted && events.some(e=>e.year===year&&e.month===month+1&&e.day===c.n);
          const cls="mcell"+(c.muted?" muted":"")+(!c.muted&&c.n===selDay?" sel":(!c.muted&&isToday(c.n)?" today":""));
          return (
            <div key={idx} className={cls} onClick={()=>!c.muted&&c.n&&setSelDay(c.n)}>
              <span>{c.n||""}</span>
              {has && <span className="mdot"/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- KNOWLEDGE ---------------- */
function Knowledge({articles,openWrite}){
  const [cat,setCat]=useState("전체");
  const [q,setQ]=useState("");
  const cats=kbCategories(articles);
  const ql=q.trim().toLowerCase();
  let list=cat==="전체"?articles:articles.filter(a=>a.c===cat);
  if(ql) list=list.filter(a=>kbSearchText(a).includes(ql));
  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">Knowledge Base</div>
        <div className="row between"><div className="h-title">지식백과</div>
          <button className="iconbtn" style={{color:"var(--accent-deep)"}} onClick={()=>openWrite(null)}>{I.plus({width:20,height:20})}</button></div>
      </div>
      <div className="pad" style={{marginTop:14}}>
        <div className="card row" style={{padding:"10px 14px",gap:10}}>
          {I.search({})}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="제목 · 내용 검색"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:14}}/>
          {q && <span onClick={()=>setQ("")} style={{cursor:"pointer",color:"var(--muted)"}}>✕</span>}
        </div>
      </div>
      <div className="pad row" style={{gap:8,marginTop:14,overflowX:"auto"}}>
        {cats.map(c=><button key={c} className={"chip"+(cat===c?" on":"")} onClick={()=>setCat(c)}>{c}</button>)}
      </div>
      <div className="pad" style={{marginTop:16,marginBottom:10}}>
        {list.length===0 && (
          <div className="card small" style={{padding:28,textAlign:"center",lineHeight:1.6}}>
            아직 글이 없어요.<br/>+ 버튼으로 첫 글을 작성해 보세요.
          </div>
        )}
        {list.map((a)=>(
          <div key={a.id} className="card" style={{padding:16,marginBottom:10,cursor:"pointer"}} onClick={()=>openWrite(a)}>
            <div className="row between">
              <span className="tag gray">{a.c}</span><span className="small">{a.d}</span>
            </div>
            <div style={{fontWeight:700,fontSize:15,marginTop:10,lineHeight:1.4}}>{a.t}</div>
            <div className="row" style={{gap:6,marginTop:11,flexWrap:"wrap"}}>
              {a.tags.map(t=><span key={t} className="tag" style={{background:"#F0ECE3",color:"var(--muted)"}}>#{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- PRICING (3-트랙) ---------------- */
const won=(n)=>"₩"+Math.round(n).toLocaleString("ko-KR");
function Pricing({back,segment,trialLeft}){
  const [track,setTrack]=useState("통합");
  const isStu=segment==="student";
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <span className="tag" style={{padding:"6px 11px"}}>{trialLeft!=null?`무료 체험 ${trialLeft}일 남음`:"무료 체험"}</span>
      </div>
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">Plans</div>
        <div className="h-title">요금제 선택</div>
        <div className="small" style={{marginTop:4}}>{isStu?"강의 녹음(변환)과 자료 저장을 원하는 방식으로":"변환(AI)과 저장(스토리지)을 원하는 방식으로"}</div>
      </div>
      <div className="pad" style={{marginTop:14}}>
        <div className="seg">
          {["통합","선택","커스텀"].map(t=>(
            <button key={t} className={track===t?"on":""} onClick={()=>setTrack(t)}>{t}</button>
          ))}
        </div>
        <div className="small" style={{marginTop:8,textAlign:"center"}}>
          {track==="통합"&&"가장 간단 · 묶음 3종에서 바로 선택"}
          {track==="선택"&&"내 패턴에 맞춘 추천 조합"}
          {track==="커스텀"&&(isStu?"강의 녹음·자료를 직접 조절":"변환·저장을 직접 조절")}
        </div>
        <div style={{textAlign:"center",marginTop:10}}>
          <span className="tag green" style={{fontSize:11.5,padding:"5px 11px"}}>모든 플랜 · 명함 무제한 스캔 무료</span>
        </div>
      </div>
      <div className="pad" style={{marginTop:16,marginBottom:12}}>
        {track==="통합"&&<Bundles isStu={isStu}/>}
        {track==="선택"&&<Combos isStu={isStu}/>}
        {track==="커스텀"&&<CustomPlan isStu={isStu}/>}
      </div>

      {/* 체험 안내 */}
      <div className="pad" style={{marginBottom:14}}>
        <div className="card" style={{padding:16,background:"#FFF6E5",border:"1px solid #F2E3BE"}}>
          <div style={{fontWeight:800,fontSize:13.5}}>무료 체험 안내</div>
          <div style={{marginTop:8,fontSize:13,lineHeight:1.6,color:"#6b5e3a"}}>
            · 체험 중 저장 최대 5GB · {isStu?"강의 녹음":"변환"} 최대 5시간<br/>
            · 7일 무료, 종료 전 알림 후 결제<br/>
            · 미결제 시 7일간 읽기 전용 보관 후 데이터 삭제
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBtn({label="선택"}){
  return <button className="btn btn-accent" style={{width:"100%",padding:13,marginTop:14}}>{label}</button>;
}
function Inc({children}){
  return <div className="row" style={{gap:8,padding:"5px 0",fontSize:13.5}}>
    <span style={{color:"var(--green)"}}>{I.check({})}</span><span>{children}</span></div>;
}

function Bundles({isStu}){
  const plans = isStu ? [
    {n:"Lite", p:"₩9,900", day:"₩330", conv:"강의 녹음 10시간", stor:"자료 저장 50GB", f:["강의 자동 요약·필기","지식백과 정리","시험 전 검색"], hot:false},
    {n:"Pro",  p:"₩24,900", day:"₩830", conv:"강의 녹음 30시간", stor:"자료 저장 200GB", f:["전 기능","요약 템플릿(강의·개념·오답)","과목별 정리"], hot:true},
    {n:"Ultra",p:"₩59,900", day:"₩1,997", conv:"강의 녹음 100시간", stor:"자료 저장 1TB", f:["전 기능","우선 처리","스터디 공유"], hot:false},
  ] : [
    {n:"Lite", p:"₩9,900", day:"₩330", conv:"변환 10시간", stor:"저장 50GB", f:["기본 CRM·캘린더","지식백과","통화 파일 업로드"], hot:false},
    {n:"Pro",  p:"₩24,900", day:"₩830", conv:"변환 30시간", stor:"저장 200GB", f:["전 기능","요약 템플릿 전체","공유"], hot:true},
    {n:"Ultra",p:"₩59,900", day:"₩1,997", conv:"변환 100시간", stor:"저장 1TB", f:["전 기능","우선 처리","공유"], hot:false},
  ];
  return <>
    {plans.map(pl=>(
      <div key={pl.n} className={"plancard"+(pl.hot?" hot":"")} style={{marginBottom:12}}>
        {pl.hot&&<span className="ribbon">추천</span>}
        <div className="row between">
          <div style={{fontWeight:800,fontSize:17}}>{pl.n}</div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:800,fontSize:19}}>{pl.p}<span className="small" style={{fontWeight:600}}>/월</span></div>
            <div className="small" style={{fontSize:11}}>하루 {pl.day}</div>
          </div>
        </div>
        <div className="row" style={{gap:6,marginTop:10}}>
          <span className="tag">{pl.conv}</span><span className="tag green">{pl.stor}</span>
        </div>
        <div style={{marginTop:10}}>{pl.f.map(x=><Inc key={x}>{x}</Inc>)}</div>
        <PlanBtn label={pl.hot?"7일 무료로 시작":"선택"}/>
      </div>
    ))}
  </>;
}

function Combos({isStu}){
  const combos = isStu ? [
    {n:"인강 집중형", d:"강의 녹음 L(100h) + 저장 50GB", p:"₩42,900", ic:"mic"},
    {n:"자료 아카이브형", d:"강의 녹음 S(10h) + 저장 1TB", p:"₩29,900", ic:"video"},
    {n:"균형형", d:"강의 녹음 M(30h) + 저장 500GB", p:"₩27,900", ic:"book"},
  ] : [
    {n:"녹음 많은 영업러", d:"변환 L(100h) + 저장 50GB", p:"₩42,900", ic:"mic"},
    {n:"영상 아카이브형", d:"변환 S(10h) + 저장 1TB", p:"₩29,900", ic:"video"},
    {n:"균형형", d:"변환 M(30h) + 저장 500GB", p:"₩27,900", ic:"book"},
  ];
  return <>
    <div className="small" style={{marginBottom:12}}>{isStu?"공부 패턴에 맞는 조합을 골라 시작하고, 나중에 팩 단위로 조절할 수 있어요.":"자주 쓰는 조합을 골라 시작하고, 나중에 팩 단위로 조절할 수 있어요."}</div>
    {combos.map(c=>(
      <div key={c.n} className="plancard" style={{marginBottom:12}}>
        <div className="row between">
          <div className="row" style={{gap:11}}>
            <div className="avatar" style={{background:"var(--accent-soft)",color:"var(--accent-deep)"}}>{I[c.ic]({width:20,height:20})}</div>
            <div><div style={{fontWeight:700,fontSize:15}}>{c.n}</div><div className="small">{c.d}</div></div>
          </div>
          <div style={{fontWeight:800,fontSize:16}}>{c.p}</div>
        </div>
        <PlanBtn/>
      </div>
    ))}
  </>;
}

function CustomPlan({isStu}){
  const usedGB=320; // 현재 사용 중(데모)
  const [conv,setConv]=useState(30);   // 시간/월
  const [stor,setStor]=useState(500);  // GB
  const base=4900;
  const convCost=conv*450, storCost=stor*30;
  const price=Math.round((base+convCost+storCost)/100)*100;
  const overGB=Math.max(0, usedGB-stor);
  const fmt=(g)=> g>=1000?(g/1000)+"TB":g+"GB";
  return (
    <div>
      <div className="plancard">
        {/* 변환 슬라이더 */}
        <div className="row between"><div style={{fontWeight:700,fontSize:14}}>{isStu?"강의 녹음 시간":"변환 시간 (AI)"}</div>
          <div style={{fontWeight:800,color:"var(--accent-deep)"}}>{conv}시간/월</div></div>
        <input className="rng" type="range" min="0" max="300" step="10" value={conv} onChange={e=>setConv(+e.target.value)}/>
        <div className="row between small"><span>0h</span><span>300h</span></div>

        <div style={{height:14}}/>
        {/* 저장 슬라이더 */}
        <div className="row between"><div style={{fontWeight:700,fontSize:14}}>저장 용량</div>
          <div style={{fontWeight:800,color:"var(--accent-deep)"}}>{fmt(stor)}</div></div>
        <input className="rng" type="range" min="0" max="2000" step="50" value={stor} onChange={e=>setStor(+e.target.value)}/>
        <div className="row between small"><span>0GB</span><span>2TB</span></div>
        <div className="small" style={{marginTop:6}}>현재 사용 중 {fmt(usedGB)}</div>
      </div>

      {/* 실시간 견적 */}
      <div className="plancard" style={{marginTop:12}}>
        <div className="brk"><span className="small">기본료</span><span style={{fontWeight:600}}>{won(base)}</span></div>
        <div className="brk"><span className="small">{isStu?"강의 녹음":"변환"} {conv}시간</span><span style={{fontWeight:600}}>{won(convCost)}</span></div>
        <div className="brk"><span className="small">{isStu?"자료 저장":"저장"} {fmt(stor)}</span><span style={{fontWeight:600}}>{won(storCost)}</span></div>
        <div className="row between" style={{marginTop:12}}>
          <div><div className="small">월 합계</div><div style={{fontWeight:800,fontSize:24}}>{won(price)}</div></div>
          <span className="tag green" style={{padding:"7px 12px",fontWeight:700}}>7일 무료 체험</span>
        </div>

        {overGB>0 ? (
          <div style={{marginTop:14}}>
            <div className="card" style={{padding:13,background:"#FFF3F3",border:"1px solid #F3CFC9"}}>
              <div style={{fontWeight:800,fontSize:13,color:"#B23B2E"}}>저장 용량 정리 필요</div>
              <div style={{fontSize:12.5,lineHeight:1.55,color:"#7a4a44",marginTop:6}}>
                현재 {fmt(usedGB)} 사용 중 · {fmt(stor)} 플랜은 <b>{fmt(overGB)} 초과</b>예요.<br/>
                초과분을 삭제하거나 내보내면 플랜을 낮출 수 있어요.
              </div>
              <button className="btn btn-ghost" style={{width:"100%",padding:11,marginTop:11,color:"#B23B2E",fontSize:13.5}}>
                오래된 항목부터 정리하기
              </button>
            </div>
            <button className="btn" disabled style={{width:"100%",padding:13,marginTop:10,
              background:"#EDE9E0",color:"#B7B0A3",cursor:"not-allowed"}}>
              {fmt(overGB)} 정리 후 변경 가능
            </button>
          </div>
        ) : <PlanBtn label="이 구성으로 변경"/>}
      </div>
      <div className="small" style={{marginTop:10,textAlign:"center",lineHeight:1.5}}>
        올릴 땐 즉시 적용, 내릴 땐 한도 이하로 정리 후 변경돼요.<br/>데이터를 임의로 삭제하지 않아요.
      </div>
    </div>
  );
}

/* ---------------- ONBOARDING (세그먼트) ---------------- */
function Onboarding({choose,lang}){
  const o=LANG[lang].onb;
  const opts=[
    {key:"business", ic:"users", t:o.biz[0], d:o.biz[1]},
    {key:"student",  ic:"book",  t:o.stu[0], d:o.stu[1]},
  ];
  return (
    <div className="fade" style={{padding:"48px 24px"}}>
      <div style={{width:50,height:50,borderRadius:16,background:"var(--accent)",display:"flex",
        alignItems:"center",justifyContent:"center"}}>{I.mic({width:26,height:26})}</div>
      <div className="h-eyebrow" style={{marginTop:22}}>Storyahub</div>
      <div className="h-title" style={{fontSize:27,marginTop:6,lineHeight:1.3}}>{o.title}</div>
      <div className="small" style={{marginTop:8,lineHeight:1.5}}>{o.sub}</div>

      <div style={{marginTop:28}}>
        {opts.map(op=>(
          <div key={op.key} className="card" style={{padding:18,marginBottom:14,cursor:"pointer"}} onClick={()=>choose(op.key)}>
            <div className="row" style={{gap:14}}>
              <div className="avatar" style={{width:48,height:48,borderRadius:15,background:"var(--accent-soft)",color:"var(--accent-deep)"}}>
                {I[op.ic]({width:22,height:22})}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:16}}>{op.t}</div>
                <div className="small" style={{marginTop:3,lineHeight:1.5}}>{op.d}</div>
              </div>
              <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="small" style={{textAlign:"center",marginTop:10}}>{o.foot}</div>
    </div>
  );
}

/* ---------------- LOGIN (지역별 간편 로그인 + 언어) ---------------- */
function Login({lang,setLang,onLogin}){
  const t=LANG[lang];
  return (
    <div className="fade" style={{padding:"30px 24px",minHeight:"100%",display:"flex",flexDirection:"column"}}>
      {/* 언어 전환 — 국내 출시 단계에서는 숨김 (추후 영어·일본어 오픈 시 노출) */}
      {false && (
      <div className="row" style={{justifyContent:"flex-end"}}>
        <div className="langsw">
          {Object.keys(LANG).map(k=>(
            <button key={k} className={lang===k?"on":""} onClick={()=>setLang(k)}>{LANG[k].label}</button>
          ))}
        </div>
      </div>
      )}

      {/* 브랜드 + 카피 */}
      <div style={{marginTop:48}}>
        <div style={{width:56,height:56,borderRadius:18,background:"var(--accent)",display:"flex",
          alignItems:"center",justifyContent:"center"}}>{I.mic({width:28,height:28})}</div>
        <div style={{fontWeight:800,fontSize:22,marginTop:20,letterSpacing:"-.01em"}}>Storyahub</div>
        <div style={{fontWeight:700,fontSize:24,marginTop:14,lineHeight:1.3,letterSpacing:"-.02em"}}>{t.tagline}</div>
        <div className="small" style={{marginTop:10,lineHeight:1.55}}>{t.sub}</div>
      </div>

      {/* 로그인 버튼들 */}
      <div style={{marginTop:"auto",paddingTop:36}}>
        {t.providers.map(p=>(
          <button key={p.k} className="prov" onClick={onLogin}
            style={{background:p.bg,color:p.fg,border:p.bd?"1px solid var(--line)":"none"}}>
            {p.label}
          </button>
        ))}
        <div className="orline">{t.or}</div>
        <button className="prov" onClick={onLogin} style={{background:"transparent",color:"var(--ink)",border:"1px solid var(--line)"}}>
          {t.email}
        </button>
        <div className="small" style={{textAlign:"center",marginTop:12,lineHeight:1.5}}>{t.terms}</div>
      </div>
    </div>
  );
}

/* ---------------- INSTALL GUIDE (PWA 홈 화면 추가) ---------------- */
function InstallSheet({close,onConfirm}){
  const [os,setOs]=useState(()=>{
    const u=(navigator.userAgent||"").toLowerCase();
    if(/android/.test(u)) return "android";
    if(/iphone|ipad|ipod/.test(u)) return "ios";
    return "desktop";
  });
  const guides={
    ios:[
      ["1","사파리 하단의 공유 버튼을 누르세요","화면 아래 가운데 ↑ 모양 아이콘"],
      ["2","‘홈 화면에 추가’를 선택","목록을 아래로 내리면 있어요"],
      ["3","오른쪽 위 ‘추가’를 누르면 끝","홈 화면에 앱 아이콘이 생겨요"],
    ],
    android:[
      ["1","크롬 우측 상단 ⋮ 메뉴를 누르세요",""],
      ["2","‘앱 설치’ 또는 ‘홈 화면에 추가’ 선택",""],
      ["3","‘설치’를 누르면 끝","홈 화면·앱 서랍에 추가돼요"],
    ],
    desktop:[
      ["1","주소창 오른쪽의 설치 아이콘을 클릭","⊕ 모양 또는 모니터 아이콘"],
      ["2","‘설치’를 누르면 끝","독/작업표시줄에 앱으로 추가돼요"],
    ],
  };
  return (
    <div className="sheetbg" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheetbar"/>
        <div className="row between">
          <div>
            <div className="h-eyebrow">설치 없이 앱처럼</div>
            <div style={{fontWeight:800,fontSize:19,marginTop:4}}>홈 화면에 추가하기</div>
          </div>
          <button className="iconbtn" onClick={close}><span style={{fontSize:18,color:"var(--muted)"}}>✕</span></button>
        </div>
        <div className="small" style={{marginTop:6,lineHeight:1.5}}>한 번 추가하면 아이콘을 눌러 바로 실행돼요. 알림도 받을 수 있어요.</div>

        {/* OS 선택 */}
        <div style={{marginTop:14}}>
          <div className="segpill">
            {[["ios","아이폰"],["android","안드로이드"],["desktop","PC"]].map(([k,l])=>(
              <button key={k} className={os===k?"on":""} onClick={()=>setOs(k)}>{l}</button>
            ))}
          </div>
        </div>

        {/* 단계 */}
        <div style={{marginTop:16}}>
          {guides[os].map((g,i,a)=>(
            <div key={i} className="row" style={{gap:13,alignItems:"flex-start",padding:"11px 0",
              borderBottom:i<a.length-1?"1px solid var(--line)":"none"}}>
              <span className="stepnum">{g[0]}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,lineHeight:1.45}}>{g[1]}</div>
                {g[2] && <div className="small" style={{marginTop:2}}>{g[2]}</div>}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-accent" style={{width:"100%",padding:15,marginTop:18,fontSize:15}} onClick={onConfirm}>확인했어요</button>
        <button className="btn" style={{width:"100%",padding:12,marginTop:8,background:"transparent",color:"var(--muted)"}} onClick={close}>나중에 하기</button>
      </div>
    </div>
  );
}

/* ---------------- CARD SCAN (명함 스캔 → 항목 추출) ---------------- */
function CardScan({back,onSaved}){
  const [step,setStep]=useState("capture");
  const [fields,setFields]=useState({
    name:"", title:"", co:"",
    phone:"", email:"", addr:"",
  });
  const [group,setGroup]=useState("미분류");
  const [tags,setTags]=useState([]);
  const [cardImageKey,setCardImageKey]=useState(null);
  const [ocrError,setOcrError]=useState("");
  const GROUPS=contactGroups(getClients());
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setFields(p=>({...p,[k]:v}));
  const scan=async ()=>{
    setOcrError("");
    try{
      const file=await pickImageFile(true);
      setStep("scanning");
      const mime=file.type||"image/jpeg";
      let result;
      try{
        const mediaKey=await uploadFile(file);
        setCardImageKey(mediaKey);
        result=await api.ocrCard({ mediaKey, mimeType: mime });
      }catch(uploadErr){
        console.warn("upload fallback to base64 OCR", uploadErr);
        const imageBase64=await fileToBase64(file);
        result=await api.ocrCard({ imageBase64, mimeType: mime });
      }
      setFields({
        name: result.name||"",
        title: result.title||"",
        co: result.company||"",
        phone: result.phone||"",
        email: result.email||"",
        addr: result.address||"",
      });
      if(!result.name&&!result.company) setOcrError("글자를 읽지 못했습니다. 직접 입력해주세요.");
      setStep("review");
    }catch(e){
      const msg=e.message||"OCR 실패";
      setOcrError(msg);
      setStep("capture");
      alert(msg.includes("fetch")?"서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해주세요.":msg);
    }
  };
  const save=async ()=>{
    setSaving(true);
    try{
      await api.createContact({
        person: [fields.name, fields.title].filter(Boolean).join(" "),
        company: fields.co,
        phone: fields.phone,
        email: fields.email,
        address: fields.addr,
        group: group==="미분류"?null:group,
        tags,
        cardImageKey,
      });
      onSaved?.();
      setStep("done");
      setTimeout(back,1100);
    }catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };

  const field=(k,label)=>(
    <div style={{marginBottom:12}}>
      <div className="small" style={{fontWeight:700,marginBottom:5}}>{label}</div>
      <input value={fields[k]} onChange={e=>set(k,e.target.value)}
        style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",
          fontFamily:"inherit",fontSize:14,color:"var(--ink)",background:"#fff",outline:"none"}}/>
    </div>
  );

  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{marginTop:0}}>명함 스캔</div>
        <div style={{width:42}}/>
      </div>

      {step==="capture" && (
        <div className="pad fade" style={{marginTop:10}}>
          <div style={{borderRadius:18,border:"2px dashed var(--line)",background:"#FBFAF6",
            padding:"50px 20px",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",color:"var(--accent-deep)"}}>{I.image({width:34,height:34})}</div>
            <div style={{fontWeight:800,fontSize:16,marginTop:14}}>명함을 촬영하세요</div>
            <div className="small" style={{marginTop:6,lineHeight:1.5}}>한 장씩 또는 여러 장 연속 촬영<br/>글자가 선명하게 보이도록</div>
          </div>
          <button className="btn btn-accent" style={{width:"100%",padding:16,marginTop:16,fontSize:15}} onClick={scan}>촬영 / 사진 선택</button>
          {ocrError && <div className="small" style={{color:"var(--accent-deep)",textAlign:"center",marginTop:10}}>{ocrError}</div>}
          <div className="small" style={{textAlign:"center",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <span className="tag green" style={{fontSize:11}}>무제한 무료</span> 명함 스캔은 모든 플랜에서 무료예요</div>
        </div>
      )}

      {step==="scanning" && (
        <div className="fade" style={{padding:"110px 30px",textAlign:"center"}}>
          <div className="spinner" style={{margin:"0 auto"}}/>
          <div style={{marginTop:22,fontWeight:700,fontSize:17}}>명함 인식 중…</div>
          <div className="small" style={{marginTop:8,lineHeight:1.6}}>글자를 읽고(OCR)<br/>이름·회사·연락처를 분류하고 있어요</div>
        </div>
      )}

      {step==="review" && (
        <div className="pad fade" style={{marginTop:10,marginBottom:12}}>
          <div className="card row" style={{padding:12,gap:12,marginBottom:14,background:"var(--green-soft)",border:"1px solid #CDE5D6"}}>
            <span style={{color:"var(--green)"}}>{I.check({})}</span>
            <div style={{fontSize:13,fontWeight:600,color:"var(--green)"}}>인식 완료 · 내용을 확인하고 저장하세요</div>
          </div>
          {field("name","이름")}
          {field("title","직책")}
          {field("co","회사")}
          {field("phone","전화")}
          {field("email","이메일")}
          {field("addr","주소")}
          <div className="small" style={{display:"flex",alignItems:"center",gap:5,marginTop:-2,marginBottom:14,color:"var(--accent-deep)"}}>
            {I.pin({})} 주소를 위치로 변환해 ‘내 주변 거래처’에 자동 연결돼요
          </div>

          <div className="small" style={{fontWeight:700,marginBottom:8}}>그룹</div>
          <div className="row" style={{gap:8,marginBottom:14,overflowX:"auto"}}>
            {GROUPS.filter(g=>g!=="전체").map(g=><button key={g} className={"chip"+(group===g?" on":"")} onClick={()=>setGroup(g)}>{g}</button>)}
          </div>
          <div className="small" style={{fontWeight:700,marginBottom:8}}>태그</div>
          <div className="row" style={{gap:7,marginBottom:18,flexWrap:"wrap"}}>
            {tags.map(t=>{const col=TAG_COLORS[t];return (
              <span key={t} className={"tag"+(col&&col!=="accent"?" "+col:"")} style={{padding:"7px 11px",cursor:"pointer"}}
                onClick={()=>setTags(p=>p.filter(x=>x!==t))}>{t} ✕</span>
            );})}
            {PRESET_TAGS.filter(t=>!tags.includes(t)).map(t=>(
              <button key={t} type="button" className="chip" style={{padding:"7px 12px",fontSize:12}}
                onClick={()=>setTags(p=>[...p,t])}>+ {t}</button>
            ))}
          </div>

          <button className="btn btn-accent" style={{width:"100%",padding:16,fontSize:15}} onClick={save} disabled={saving}>{saving?"저장 중…":"연락처로 저장"}</button>
          <button className="btn" style={{width:"100%",padding:12,marginTop:8,background:"transparent",color:"var(--muted)"}} onClick={()=>setStep("capture")}>다시 촬영</button>
        </div>
      )}

      {step==="done" && (
        <div className="fade" style={{padding:"110px 30px",textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"var(--green-soft)",color:"var(--green)",
            display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>{I.check({width:28,height:28})}</div>
          <div style={{marginTop:18,fontWeight:800,fontSize:18}}>저장 완료</div>
          <div className="small" style={{marginTop:8}}>{fields.name} · {fields.co}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- TODO BOARD (칸반: 할일/진행중/완료) ---------------- */
function TodoBoard({todos,setTodoStatus,openDetail,onRefresh}){
  const idx=(t)=>todos.indexOf(t);
  const addTodo=async ()=>{
    const title=prompt("할 일 제목을 입력하세요");
    if(!title?.trim()) return;
    try{
      await api.createTodo({ title: title.trim() });
      onRefresh?.();
    }catch(e){ alert(e.message); }
  };
  return (
    <div>
      <button className="addrow" style={{marginBottom:14}} onClick={addTodo}>+ 할 일 추가</button>
      {STAGES.map(([s,label],si)=>{
        const items=todos.filter(t=>t.status===s);
        return (
          <div key={s} style={{marginBottom:14}}>
            <div className="row between" style={{marginBottom:8}}>
              <div className="row" style={{gap:7,alignItems:"center"}}>
                <span style={{width:8,height:8,borderRadius:"50%",
                  background:s==="done"?"var(--green)":s==="doing"?"var(--accent)":"#C9C2B4"}}/>
                <span style={{fontWeight:700,fontSize:13.5}}>{label}</span>
                <span className="small">{items.length}</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {items.length===0 && <div className="small" style={{padding:"4px 2px",color:"#C0B9AC"}}>없음</div>}
              {items.map((t)=>{
                const i=idx(t);
                return (
                  <div key={i} className="card" style={{padding:"12px 13px",borderLeft:`4px solid ${PRI[t.pri].c}`}}>
                    <div style={{fontWeight:600,fontSize:14,lineHeight:1.4,cursor:"pointer",
                      textDecoration:s==="done"?"line-through":"none",color:s==="done"?"var(--muted)":"var(--ink)"}}
                      onClick={()=>openDetail&&openDetail("task",{...t,i})}>{t.t}</div>
                    <div className="row between" style={{marginTop:9}}>
                      <div className="row" style={{gap:8}}>
                        <span style={{fontSize:10.5,fontWeight:700,color:PRI[t.pri].c}}>{PRI[t.pri].l}</span>
                        {t.due!=="-"&&<span className="small" style={{fontSize:11}}>{t.due}</span>}
                      </div>
                      {/* 이동 버튼 */}
                      <div className="row" style={{gap:6}}>
                        {si>0 && <button onClick={()=>setTodoStatus(i,STAGES[si-1][0])}
                          style={{border:"1px solid var(--line)",background:"#fff",borderRadius:8,padding:"3px 8px",
                            fontSize:11,fontWeight:700,cursor:"pointer",color:"var(--muted)"}}>←</button>}
                        {si<2 && <button onClick={()=>setTodoStatus(i,STAGES[si+1][0])}
                          style={{border:"none",background:"var(--accent-soft)",color:"var(--accent-deep)",borderRadius:8,
                            padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {si===0?"시작 →":"완료 →"}</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- GLOBAL SEARCH (인맥·기록·지식백과 통합) ---------------- */
function GlobalSearch({back,openClient,meetings=[],kbArticles=[]}){
  const CLIENTS=getClients();
  const [q,setQ]=useState("");
  const ql=q.trim().toLowerCase();
  const people=CLIENTS.filter(c=>(c.person+c.co).toLowerCase().includes(ql));
  const recs=meetings.filter(r=>r.t.toLowerCase().includes(ql));
  const kb=kbArticles.filter(r=>kbSearchText(r).includes(ql));
  const empty=ql && people.length+recs.length+kb.length===0;
  const Section=(title,items,render)=> items.length>0 && (
    <div style={{marginTop:18}}>
      <div className="section-h" style={{marginTop:0}}>{title}</div>
      <div className="card" style={{padding:"4px 16px"}}>{items.map(render)}</div>
    </div>
  );
  return (
    <div className="fade">
      <div className="pad row" style={{gap:10,marginTop:8,alignItems:"center"}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="row" style={{flex:1,gap:9,background:"#F4F1EA",borderRadius:12,padding:"11px 13px",color:"var(--muted)"}}>
          {I.search({width:17,height:17})}
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="인맥 · 기록 · 지식백과 검색"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:14,color:"var(--ink)"}}/>
        </div>
      </div>
      <div className="pad" style={{marginBottom:12}}>
        {!ql && <div className="small" style={{textAlign:"center",padding:"50px 0",lineHeight:1.6}}>이름·회사·기록·지식백과를<br/>한 번에 검색해요</div>}
        {empty && <div className="small" style={{textAlign:"center",padding:"50px 0"}}>“{q}” 검색 결과가 없어요</div>}
        {Section("인맥", people, c=>(
          <div key={c.id} className="list-item row between" style={{cursor:"pointer"}} onClick={()=>openClient(c)}>
            <div className="row" style={{gap:11}}><div className="avatar">{c.init}</div>
              <div><div style={{fontWeight:700,fontSize:14}}>{c.person}</div><div className="small">{c.co}</div></div></div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </div>
        ))}
        {Section("기록", recs, (r)=>(
          <div key={r.id} className="list-item row between"><div><div style={{fontWeight:600,fontSize:14}}>{r.t}</div><div className="small">{r.d}</div></div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span></div>
        ))}
        {Section("지식백과", kb, (r)=>(
          <div key={r.id} className="list-item row between"><div><div style={{fontWeight:600,fontSize:14}}>{r.t}</div><div className="small">{r.c||"지식백과"}</div></div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- SETTINGS ---------------- */
function Settings({back,go,user,onLogout,openPricing}){
  const trialLabel=user?.trialDaysLeft!=null?`체험 ${user.trialDaysLeft}일`:"체험 중";
  const Row=(icon,label,val,onClick)=>(
    <div className="list-item row between" style={{cursor:"pointer"}} onClick={onClick}>
      <div className="row" style={{gap:12}}><span style={{color:"var(--muted)"}}>{icon}</span><span style={{fontWeight:600,fontSize:14.5}}>{label}</span></div>
      <div className="row" style={{gap:8,color:"var(--muted)"}}>{val&&<span className="small">{val}</span>}{I.chevron({})}</div>
    </div>
  );
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{marginTop:0}}>설정</div><div style={{width:42}}/>
      </div>
      <div className="pad" style={{marginTop:10}}>
        <div className="card row" style={{padding:16,gap:13,marginBottom:16}}>
          <div className="avatar" style={{width:48,height:48,borderRadius:16}}>{(user?.name||"?")[0]}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{user?.name||"회원"}</div><div className="small">{user?.email}</div></div>
          <span className="tag green">{trialLabel}</span>
        </div>

        <div className="section-h" style={{marginTop:0}}>계정 · 구독</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.bolt({width:18,height:18}),"플랜 · 결제",trialLabel,openPricing)}
          {Row(I.bell({width:18,height:18}),"알림","1시간 전",()=>{})}
          {Row(I.users({width:18,height:18}),"공유 · 초대 관리",null,()=>{})}
        </div>

        <div className="section-h">데이터</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.download({width:18,height:18}),"내보내기 · 백업",null,()=>go("export"))}
          {Row(I.trash({width:18,height:18}),"휴지통",null,()=>go("trash"))}
        </div>

        <div className="section-h">앱</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.book({width:18,height:18}),"언어","한국어",()=>{})}
          {Row(I.download({width:18,height:18}),"홈 화면에 추가",null,()=>{})}
        </div>
        <button className="btn btn-ghost" style={{width:"100%",padding:13,color:"var(--muted)"}} onClick={onLogout}>로그아웃</button>
      </div>
    </div>
  );
}

/* ---------------- TRASH (소프트 삭제 복구) ---------------- */
function Trash({back}){
  const [items,setItems]=useState([]);
  const restore=(i)=>setItems(p=>p.filter((_,k)=>k!==i));
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{marginTop:0}}>휴지통</div><div style={{width:42}}/>
      </div>
      <div className="pad" style={{marginTop:10,marginBottom:12}}>
        <div className="small" style={{lineHeight:1.5,marginBottom:14}}>삭제한 항목은 30일간 보관 후 영구 삭제돼요. 그 전엔 언제든 복구할 수 있어요.</div>
        {items.length===0 && <div className="small" style={{textAlign:"center",padding:"50px 0"}}>휴지통이 비어 있어요</div>}
        <div className="card" style={{padding:"4px 16px"}}>
          {items.map((it,i)=>(
            <div key={i} className="list-item row between">
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{it.t}</div><div className="small">{it.d}</div></div>
              <button className="btn btn-ghost" style={{padding:"7px 13px",fontSize:13,color:"var(--accent-deep)"}} onClick={()=>restore(i)}>복구</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- EXPORT ---------------- */
function ExportData({back}){
  const [exporting,setExporting]=useState(false);
  const doExport=async ()=>{
    setExporting(true);
    try{
      const [contacts,todos,kb,dealsRes]=await Promise.all([
        api.listContacts(),
        api.listTodos(),
        api.listKb(),
        api.listDeals(),
      ]);
      const payload={ exportedAt:new Date().toISOString(), contacts, todos, kb, deals:dealsRes?.deals||[] };
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=`storyahub-backup-${Date.now()}.json`;
      a.click();
    }catch(e){ alert(e.message||"내보내기 실패"); }
    finally{ setExporting(false); }
  };
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{marginTop:0}}>내보내기 · 백업</div><div style={{width:42}}/>
      </div>
      <div className="pad" style={{marginTop:10,marginBottom:12}}>
        <div className="small" style={{lineHeight:1.5,marginBottom:14}}>인맥·할 일·지식백과·딜 데이터를 JSON 파일로 내려받아요.</div>
        <button className="btn btn-accent" style={{width:"100%",padding:15,fontSize:15,display:"flex",justifyContent:"center",gap:8}}
          disabled={exporting} onClick={doExport}>{I.download({width:18,height:18})} {exporting?"내보내는 중…":"전체 데이터 내보내기"}</button>
      </div>
    </div>
  );
}

function DetailHead({back,eyebrow,title}){
  return (
    <div className="pad" style={{marginTop:2}}>
      <div className="row between"><button className="iconbtn" onClick={back}>{I.back({})}</button><div style={{width:42}}/></div>
      <div className="h-eyebrow" style={{marginTop:10}}>{eyebrow}</div>
      <div className="h-title" style={{marginTop:4}}>{title}</div>
    </div>
  );
}

function TaskDetailView({data,back}){
  const t=data||{};
  const raw=t._raw||{};
  const [status,setStatus]=useState(t.status||"todo");
  const [detail,setDetailText]=useState(raw.detail||"");
  const [saving,setSaving]=useState(false);
  const history=Array.isArray(raw.history)?raw.history:[];
  const stLabel={todo:"할 일",doing:"진행 중",done:"완료"}[status]||"할 일";
  const stColor=status==="done"?"green":status==="doing"?"amber":"gray";
  const patchStatus=async (s)=>{
    if(!t.id) return;
    setSaving(true);
    try{ await api.updateTodo(t.id,{ status:s }); setStatus(s); }
    catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };
  const saveDetail=async ()=>{
    if(!t.id) return;
    try{ await api.updateTodo(t.id,{ detail }); }catch(e){ alert(e.message); }
  };
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="할 일" title={t.t||"할 일"}/>
      <div className="pad" style={{marginTop:12}}>
        <div className="card" style={{padding:16}}>
          <div className="row" style={{gap:8,flexWrap:"wrap"}}>
            <span className={"tag "+stColor}>{stLabel}</span>
            {t.due&&t.due!=="-"&&<span className="tag gray">기한 {t.due}</span>}
          </div>
          <div className="row" style={{gap:7,marginTop:13}}>
            {[["todo","할 일"],["doing","진행 중"],["done","완료"]].map(([s,l])=>(
              <button key={s} disabled={saving} className={"chip"+(status===s?" on":"")} style={{flex:1,justifyContent:"center",display:"flex"}}
                onClick={()=>patchStatus(s)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="section-h">상세</div>
        <div className="card" style={{padding:16}}>
          <textarea value={detail} onChange={e=>setDetailText(e.target.value)} onBlur={saveDetail}
            placeholder="설명을 적어보세요…"
            style={{width:"100%",minHeight:80,border:"none",outline:"none",fontFamily:"inherit",fontSize:13.5,lineHeight:1.6,resize:"vertical"}}/>
        </div>
        {history.length>0 && <>
          <div className="section-h">처리 히스토리</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {history.map((h,i)=>(
              <div key={i} style={{padding:"13px 0",borderBottom:i<history.length-1?"1px solid var(--line)":"none"}}>
                <div style={{fontWeight:600,fontSize:13.5}}>{h.what}</div>
                <div className="small">{h.when} · {h.who}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

function RevenueDetailView({back}){
  const [dealsData,setDealsData]=useState(null);
  useEffect(()=>{ api.listDeals().then(setDealsData).catch(()=>setDealsData({deals:[],revenueThisMonth:{supplyAmount:0},pipeline:0})); },[]);
  const deals=dealsData?.deals||[];
  const sup=dealsData?.revenueThisMonth?.supplyAmount||0;
  const pipe=dealsData?.pipeline||0;
  const won=(n)=>"₩ "+Number(n).toLocaleString("ko-KR");
  const month=new Date().getMonth()+1;
  const done=deals.filter(x=>x.stage==="성사");
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow={`${month}월 매출`} title="이번 달 매출"/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        {!dealsData && <div className="small" style={{textAlign:"center",padding:20}}>불러오는 중…</div>}
        {dealsData && <>
          <div className="card" style={{padding:16}}>
            <div className="brk"><span className="small">확정 공급가액</span><span style={{fontWeight:700}}>{won(sup)}</span></div>
            <div className="brk"><span className="small">부가세 (10%)</span><span style={{fontWeight:600}}>{won(sup*0.1)}</span></div>
            <div className="row between" style={{padding:"10px 0"}}><span style={{fontWeight:700}}>합계</span><span style={{fontWeight:800,fontSize:18}}>{won(sup*1.1)}</span></div>
          </div>
          <div className="section-h">성사 딜</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {done.length===0 && <div className="small" style={{textAlign:"center",padding:16}}>성사 딜 없음</div>}
            {done.map(x=><div key={x.id} className="row between" style={{padding:"13px 0",borderBottom:"1px solid var(--line)"}}>
              <span style={{fontWeight:600}}>{x.title||"딜"}</span><span style={{fontWeight:700}}>{won(x.supplyAmount)}</span>
            </div>)}
          </div>
          <div className="section-h">진행 중 (파이프라인 {won(pipe)})</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {deals.filter(x=>x.stage!=="성사").map(x=><div key={x.id} className="row between" style={{padding:"13px 0",borderBottom:"1px solid var(--line)"}}>
              <span style={{fontWeight:600}}>{x.title||"딜"} <span className="tag amber">{x.stage}</span></span>
              <span>{won(x.supplyAmount)}</span>
            </div>)}
          </div>
        </>}
      </div>
    </div>
  );
}

function FollowupDetailView({back,todos,onTodoToggle}){
  const items=todos.filter(x=>!x.done);
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="미완료 액션" title="후속 챙기기"/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        {items.length===0 && <div className="small" style={{textAlign:"center",padding:40}}>미완료 할 일이 없어요</div>}
        <div className="card" style={{padding:"4px 16px"}}>
          {items.map(it=><div key={it.id} className="row between" style={{padding:"15px 0",borderBottom:"1px solid var(--line)",cursor:"pointer"}}
            onClick={()=>onTodoToggle?.(todos.indexOf(it))}>
            <div className="row" style={{gap:10}}><Checkbox on={false}/><span style={{fontWeight:600}}>{it.t}</span></div>
            {it.due!=="-" && <span className="tag gray">{it.due}</span>}
          </div>)}
        </div>
      </div>
    </div>
  );
}

function EventDetailView({data,back}){
  const e=data||{};
  const label=e.month?`${e.month}월 ${e.day}일`:"";
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="일정" title={e.title||"일정"}/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        <div className="card" style={{padding:16}}>
          <div className="brk"><span className="small">시간</span><span style={{fontWeight:700}}>{label} · {e.time}</span></div>
          <div className="brk"><span className="small">장소</span><span style={{fontWeight:600}}>{e.place||"-"}</span></div>
        </div>
      </div>
    </div>
  );
}

function Detail({d,back,todos=[],onTodoToggle}){
  if(d.type==="task") return <TaskDetailView data={d.data} back={back}/>;
  if(d.type==="revenue") return <RevenueDetailView back={back}/>;
  if(d.type==="followup") return <FollowupDetailView back={back} todos={todos} onTodoToggle={onTodoToggle}/>;
  return <EventDetailView data={d.data} back={back}/>;
}

export default App;
