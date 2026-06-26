import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import AuthScreen from "./components/AuthScreen.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import KbEditor, { KbReadView, kbSearchText } from "./components/KbEditor.jsx";
import NestedTodoList, { isTodoDone, todoProgressCounts } from "./components/NestedTodoList.jsx";
import MeetingInsights from "./components/MeetingInsights.jsx";
import CategoryTagSettings from "./components/CategoryTagSettings.jsx";
import CalendarSyncSettings from "./components/CalendarSyncSettings.jsx";
import FileViewerOverlay from "./components/FileViewerOverlay.jsx";
import ContactGroupTagPanel from "./components/ContactGroupTagPanel.jsx";
import MeetingAskPanel from "./components/MeetingAskPanel.jsx";
import CardScanView from "./components/CardScanView.jsx";
import FriendsView from "./components/FriendsView.jsx";
import ShareSheet from "./components/ShareSheet.jsx";
import PlacesView from "./components/PlacesView.jsx";
import CalendarView from "./components/CalendarView.jsx";
import PhotoGallery from "./components/PhotoGallery.jsx";
import { api, loadToken, saveToken, clearToken, setToken, isAuthError, isAccessError } from "./api/client.js";
import { uploadBlob, uploadFile, pickImageFile, pickImportAudioFile, audioDurationSec, pickAnyFile, fileToBase64, mediaUrl, openMediaFile, AudioRecorder, isPickCancelled, isNativeRecordingResult, isNativeShell } from "./api/upload.js";
import { setClients, getClients, setPlaces, getPlaces } from "./store.js";
import { contactToUi, todoToUi, todoSearchText, contactSearchText, dealAmounts, totalToSupplyAmount, formatWon, formatWhen, eventToUi, kbToUi, meetingToUi, meetingPeopleLabel, meetingAttendeeIds, isAudioMediaKey, isImageMediaKey, kbCategories, kbTags, KB_SECTIONS, kbSectionLabel, kbCoverKey, haversineKm, formatDistanceKm, kakaoDirectionsUrl, kbExcerpt, kbReadMinutes, kbFileCount, kbThumbMeta, placeToUi, contactRoleLine, formatDurationHm } from "./mappers.js";
import { useSwipeBack } from "./useSwipeBack.js";
import ContactIntroSheet from "./components/ContactIntroSheet.jsx";
import { confirmDelete, confirmAction } from "./confirmDelete.js";
import { formatEventWhen } from "./calendarUtils.js";
import ToastHost from "./components/ToastHost.jsx";
import ConfirmHost from "./components/ConfirmHost.jsx";
import { toastError, toastSuccess, notifyError } from "./toast.js";
import { addPendingMeeting, removePendingMeeting, getPendingMeetingIds } from "./pendingMeetings.js";
import { userPreferences, tagColor, mergedContactGroups, mergedContactCompanies, layoutContactsByIdentity } from "./preferences.js";
import { hasOpenTodoGroups, countOpenTodoItems, openTodoPreviewTexts, listOpenFollowupItems } from "./todoGroups.js";
import { syncPhoneContacts, isDeviceContactsAvailable } from "./contactSync.js";

/* ------------------------------------------------------------------
   Storyahub — 비서앱 UI
   미니멀 / 페이퍼톤 / 단일 액센트(테라코타)
   핵심 루프: 녹음 → 요약 → 투두·일정 자동 분기
------------------------------------------------------------------- */

/** 베타 기간: 요금제·결제 화면 및 진입점 숨김 */
const BETA_HIDE_PRICING = true;

const CSS = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');

:root{
  --paper:#F7F4EE; --card:#FFFFFF; --ink:#1B1A17; --muted:#8C857A;
  --line:#ECE7DD; --accent:#DD5E39; --accent-deep:#C2491F; --accent-soft:#FBEAE1;
  --green:#3E7C5A; --green-soft:#E7F0EA;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.sa-root{
  min-height:100vh;min-height:100dvh;width:100%;
  background:var(--paper);
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif;
  color:var(--ink);
}
.app-shell{display:flex;min-height:100vh;min-height:100dvh;width:100%;}
.app-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:100vh;min-height:100dvh;position:relative;background:var(--paper);}
.app-main-centered{display:flex;align-items:center;justify-content:center;padding:24px;}
.screen{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0 calc(76px + env(safe-area-inset-bottom,0px));scroll-behavior:smooth;}
.screen::-webkit-scrollbar{width:6px;}
.screen::-webkit-scrollbar-thumb{background:#D8D0C4;border-radius:3px;}
.screen-kb{overflow:hidden;padding:0;display:flex;flex-direction:column;flex:1;min-height:0;background:#F4F5F7;}
.screen-kb>.kbe-wrap,.screen-kb>.kbe-read{flex:1;min-height:0;}
.pad{padding:0 20px;}
.content-max{max-width:840px;margin:0 auto;width:100%;}

/* desktop sidebar */
.app-sidebar{display:none;}
.sidenavitem{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border-radius:12px;
  font-size:14px;font-weight:600;color:var(--muted);background:none;border:none;cursor:pointer;
  font-family:inherit;text-align:left;transition:.15s;}
.sidenavitem.on{background:var(--accent-soft);color:var(--accent-deep);}
.sidenavitem svg{flex:0 0 auto;}
.side-rec{width:100%;margin-top:8px;border:none;border-radius:14px;background:var(--accent);color:#fff;
  font-family:inherit;font-weight:800;font-size:14px;padding:14px 16px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:8px;
  box-shadow:0 8px 20px -6px rgba(221,94,57,.45);}
.side-rec:active{background:var(--accent-deep);}

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
.client-filter-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;}
.client-filter-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
.client-filter-top .small{font-weight:700;color:var(--muted);}
.class-mode-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
.class-mode-tabs button{
  padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:#FBFAF7;
  font-family:inherit;font-weight:700;font-size:14px;color:var(--muted);cursor:pointer;transition:.15s;
}
.class-mode-tabs button.on{background:var(--ink);color:#fff;border-color:var(--ink);box-shadow:0 4px 14px -8px rgba(20,16,12,.45);}
.filter-pick-btn{width:100%;text-align:left;border:1px solid transparent;border-radius:12px;padding:11px 13px;
  background:#F7F4EE;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s;}
.filter-pick-btn:active{background:#F0EBE2;}
.filter-pick-label{font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:3px;letter-spacing:.01em;}
.filter-pick-value{font-weight:700;font-size:14.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left;color:var(--ink);}
.filter-select-sheet{padding-top:8px;display:flex;flex-direction:column;overflow:hidden;max-height:min(88dvh,calc(100dvh - env(safe-area-inset-top,0px)));}
.filter-select-list{flex:1;min-height:120px;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.filter-select-search-wrap{flex-shrink:0;margin-top:8px;padding-bottom:max(4px,env(safe-area-inset-bottom,0px));}
.filter-pick-search{display:flex;align-items:center;gap:9px;background:#F4F1EA;border-radius:11px;padding:10px 12px;margin-bottom:12px;color:var(--muted);}
.filter-pick-search input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:14px;color:var(--ink);}
.filter-pick-count{font-size:12px;font-weight:600;color:var(--muted);}
.filter-pick-item{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:14px 2px;
  border:none;border-bottom:1px solid var(--line);background:none;font-family:inherit;font-size:15px;font-weight:600;
  cursor:pointer;text-align:left;color:var(--ink);}
.filter-pick-item:last-child{border-bottom:none;}
.filter-pick-item.on{color:var(--accent-deep);}
.filter-pick-item span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
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

/* bottom nav (mobile) — 핵심 4탭 + 햄버거 메뉴 */
.nav{position:fixed;left:0;right:0;bottom:0;height:calc(68px + env(safe-area-inset-bottom,0px));
  padding-bottom:env(safe-area-inset-bottom,0px);
  background:rgba(247,244,238,.92);backdrop-filter:blur(14px);border-top:1px solid var(--line);
  z-index:40;}
.nav-grid{display:grid;grid-template-columns:repeat(4,1fr);width:100%;align-items:end;padding:8px 4px 0;}
.navitem{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;font-weight:600;
  color:var(--muted);background:none;border:none;cursor:pointer;width:100%;padding:0 4px;transition:.15s;}
.navitem.on{color:var(--accent-deep);}

@media (max-width:767px){
  .mob-header{display:flex;align-items:center;justify-content:flex-end;
    position:fixed;top:0;left:0;right:0;z-index:45;
    height:calc(52px + env(safe-area-inset-top,0px));
    padding:env(safe-area-inset-top,0px) 12px 0;
    pointer-events:none;}
  .mob-header .mob-menu-btn{pointer-events:auto;}
  .screen.has-mob-header{padding-top:calc(52px + env(safe-area-inset-top,0px));}
  .today-top-actions{display:none;}
  .mob-menu-backdrop{position:fixed;inset:0;background:rgba(20,16,12,.38);z-index:60;animation:fadeIn .2s ease;}
  .mob-menu-sheet{position:fixed;top:0;right:0;bottom:0;width:min(300px,88vw);background:#fff;z-index:61;
    padding:calc(12px + env(safe-area-inset-top,0px)) 14px calc(20px + env(safe-area-inset-bottom,0px));
    box-shadow:-10px 0 40px rgba(20,16,12,.14);animation:slideInRight .24s ease;overflow-y:auto;}
  @keyframes slideInRight{from{transform:translateX(100%)}to{transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .mob-menu-item{display:flex;align-items:center;gap:12px;width:100%;padding:13px 12px;margin-bottom:2px;
    border:none;background:none;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;
    cursor:pointer;text-align:left;color:var(--ink);}
  .mob-menu-item.on{background:var(--accent-soft);color:var(--accent-deep);}
  .mob-menu-item svg{flex:0 0 auto;color:var(--muted);}
  .mob-menu-item.on svg{color:var(--accent-deep);}
}
@media (min-width:768px){
  .mob-header,.mob-menu-backdrop,.mob-menu-sheet{display:none!important;}
}

@media (min-width:768px){
  .app-shell{max-width:1440px;margin:0 auto;}
  .app-sidebar{display:flex;flex-direction:column;width:240px;flex-shrink:0;
    border-right:1px solid var(--line);background:#fff;padding:28px 16px 24px;
    position:sticky;top:0;height:100vh;height:100dvh;}
  .app-brand{font-size:20px;font-weight:800;letter-spacing:-.03em;color:var(--ink);padding:0 10px 24px;}
  .app-brand span{color:var(--accent-deep);}
  .app-sidenav{display:flex;flex-direction:column;gap:4px;flex:1;}
  .app-sidebar-foot{margin-top:auto;padding:10px;font-size:12px;color:var(--muted);line-height:1.5;}
  .nav{display:none;}
  .screen{padding:20px 32px 40px;}
  .pad{padding:0;}
  .h-title{font-size:30px;}
  .mapwrap{height:420px;margin-left:0;margin-right:0;}
  .kbh-list.kbh-board{gap:12px;}
  .kbh-fab{right:32px;bottom:32px;}
  .meet-fab{bottom:32px;right:32px;}
  .screen .pad{max-width:840px;margin-left:auto;margin-right:auto;}
  .kbe-inner{max-width:720px;margin:0 auto;width:100%;}
  .kbe-bar{padding:12px 24px;}
  .kbe-scroll{padding:20px 24px 28px;}
  .kbe-sheet{padding:36px 40px 48px;}
  .kbe-title{font-size:32px;}
  .kbe-toolbar{padding:8px 24px;}
  .kbe-toolbar-inner{justify-content:center;}
  .kbe-read-top{padding:14px 32px;}
  .kbe-read .kbe-cover-read{height:280px;margin:0;}
  .kbe-read-body{max-width:720px;margin:0 auto;padding:24px 32px 48px;}
}
@media (min-width:1024px){
  .screen{padding:24px 48px 48px;}
  .kbh-list.kbh-board{gap:16px;}
  .kbh-feat .cover{height:180px;}
  .kbe-inner{max-width:760px;}
  .kbe-scroll{padding:24px 32px 32px;}
  .kbe-bar{padding:14px 32px;}
  .kbe-toolbar{padding:8px 32px;}
  .kbe-title{font-size:34px;}
  .kbe-read-top{padding:16px 48px;}
  .kbe-read-body{padding:28px 48px 56px;max-width:760px;}
}
@media (min-width:1280px){
  .kbh-list.kbh-board{grid-template-columns:repeat(3,minmax(0,1fr));}
}

.list-item{padding:15px 0;border-bottom:1px solid var(--line);cursor:pointer;}
.list-item:last-child{border-bottom:none;}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.fade{animation:fadeUp .4s ease both;}
@keyframes pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(1.8);opacity:0}100%{opacity:0}}
@keyframes bars{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
.proc-bar{height:8px;border-radius:99px;background:#EFEBE2;overflow:hidden;margin:22px auto 0;max-width:280px;}
.proc-bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-deep));transition:width .4s ease;}
.proc-steps{margin-top:20px;text-align:left;max-width:280px;margin-left:auto;margin-right:auto;}
.proc-step{font-size:13px;padding:7px 0;color:var(--muted);display:flex;align-items:center;gap:8px;}
.proc-step.on{color:var(--ink);font-weight:700;}
.proc-step.done{color:var(--green);}
.proc-pct{font-size:13px;font-weight:700;color:var(--accent-deep);margin-top:14px;font-variant-numeric:tabular-nums;}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);
  border-top-color:var(--accent);animation:spin .8s linear infinite;}
.toast-host{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;
  display:flex;flex-direction:column;gap:8px;width:min(380px,calc(100vw - 28px));pointer-events:none;}
@media(min-width:900px){.toast-host{bottom:28px;}}
.toast{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;border-radius:14px;box-shadow:0 10px 32px rgba(20,16,12,.16);
  animation:fadeUp .28s ease both;pointer-events:auto;font-size:13.5px;line-height:1.45;font-weight:600;}
.toast-error{background:#FFF8F6;border:1px solid #F3D8CB;color:#8B3A22;}
.toast-success{background:#E7F0EA;border:1px solid #C5DCC9;color:#2D5A3D;}
.toast-info{background:#fff;border:1px solid var(--line);color:var(--ink);}
.toast-icon{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;}
.toast-error .toast-icon{background:#F3D8CB;color:#8B3A22;}
.toast-success .toast-icon{background:var(--green);color:#fff;}
.toast-info .toast-icon{background:#EFEBE2;color:var(--muted);}
.toast-msg{flex:1;word-break:keep-all;}
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
.blk{padding:5px 0;}
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

/* nested todo */
.nt-list{display:flex;flex-direction:column;gap:12px;}
.nt-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(20,16,12,.04);transition:.15s;}
.nt-card.done{background:#FBFAF7;}
.nt-phead{display:flex;align-items:center;gap:12px;padding:15px 16px;cursor:pointer;}
.nt-chev{color:var(--muted);transition:transform .2s;flex:0 0 auto;display:flex;}
.nt-chev.open{transform:rotate(90deg);}
.nt-ptitle{flex:1;min-width:0;font-weight:700;font-size:15px;letter-spacing:-.01em;}
.nt-ptitle.s{text-decoration:line-through;color:var(--muted);font-weight:600;}
.nt-count{font-size:12px;font-weight:800;color:var(--muted);flex:0 0 auto;}
.nt-count.full{color:var(--green);}
.nt-bar{height:5px;background:var(--line);border-radius:4px;margin:0 16px 14px;overflow:hidden;}
.nt-bar > i{display:block;height:100%;border-radius:4px;background:var(--accent);transition:width .25s ease;}
.nt-bar > i.full{background:var(--green);}
.nt-subs{padding:0 16px 6px;}
.nt-sitem{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:1px solid var(--line);}
.nt-stext{flex:1;font-size:14px;font-weight:500;}
.nt-stext.s{text-decoration:line-through;color:var(--muted);}
.nt-stext.editable{cursor:text;}
.nt-edit-input{flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:6px 9px;
  font-family:inherit;font-size:14px;font-weight:500;color:var(--ink);background:#fff;outline:none;}
.nt-del{border:none;background:transparent;color:var(--muted);cursor:pointer;padding:2px 6px;
  font-size:15px;line-height:1;flex:0 0 auto;font-family:inherit;}
.nt-del:hover{color:#E03E3E;}
.nt-cb{width:22px;height:22px;border-radius:7px;border:2px solid var(--line);background:#fff;cursor:pointer;
  flex:0 0 auto;display:flex;align-items:center;justify-content:center;transition:.12s;color:#fff;}
.nt-cb.on{background:var(--accent);border-color:var(--accent);}
.nt-cb.on.g{background:var(--green);border-color:var(--green);}
.nt-cb.big{width:24px;height:24px;border-radius:8px;}
.nt-addrow{display:flex;align-items:center;gap:9px;padding:11px 0 13px;border-top:1px solid var(--line);color:var(--accent-deep);}
.nt-addrow input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:14px;color:var(--ink);}
.nt-iadd{border:none;background:none;color:var(--accent-deep);cursor:pointer;padding:0;display:flex;}
.nt-newtask{display:flex;gap:9px;align-items:center;background:#fff;border:1px solid var(--line);
  border-radius:14px;padding:12px 14px;margin-top:4px;}
.nt-newtask input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:14.5px;color:var(--ink);}
.nt-send{border:none;background:var(--accent);color:#fff;border-radius:10px;width:34px;height:34px;cursor:pointer;
  font-size:18px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;touch-action:manipulation;
  position:relative;z-index:1;}
.nt-send:disabled{opacity:.55;cursor:wait;}
.nt-pridot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}
.nt-hint{font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.55;}
.nt-split{border:none;background:var(--accent-soft);color:var(--accent-deep);font-family:inherit;font-size:11px;font-weight:700;
  padding:5px 9px;border-radius:8px;cursor:pointer;flex:0 0 auto;white-space:nowrap;}
.nt-split:hover{background:#F3D8CB;}
.nt-card.nested{border:none;box-shadow:none;border-radius:0;border-top:1px solid var(--line);}
.nt-card.nested .nt-phead{padding:11px 16px;}
.nt-ptitle.nested{font-size:14px;font-weight:600;}
.nt-group > .nt-phead{cursor:pointer;}

/* kb home */
.kbh-search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);
  border-radius:14px;padding:12px 14px;margin-top:14px;color:var(--muted);}
.kbh-search input{flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:14.5px;color:var(--ink);}
.kbh-cats{display:flex;gap:8px;overflow-x:auto;margin-top:14px;padding-bottom:2px;}
.kbh-cats::-webkit-scrollbar{display:none;}
.kbh-cat{flex:0 0 auto;border:1px solid var(--line);background:#fff;border-radius:20px;padding:8px 14px;
  font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;font-family:inherit;}
.kbh-cat.on{background:var(--ink);color:#fff;border-color:var(--ink);}
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
.kbh-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;}
.kbh-seg button{border:1px solid var(--line);background:#fff;border-radius:14px;padding:14px 8px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer;color:var(--ink);display:flex;flex-direction:column;align-items:center;gap:6px;line-height:1.3;}
.kbh-seg button.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.kbh-seg .sub{font-size:11px;font-weight:500;opacity:.75;}
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
.kbh-fab{position:fixed;right:20px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:56px;height:56px;
  border-radius:50%;border:none;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:45;box-shadow:0 12px 28px -6px rgba(221,94,57,.55);font-family:inherit;padding:0;}
.kbh-fab:active{background:var(--accent-deep);}

.meet-fab{position:fixed;right:20px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:56px;height:56px;
  border-radius:50%;border:none;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:8;box-shadow:0 12px 28px -6px rgba(221,94,57,.55);font-family:inherit;}
.meet-fab:active{background:var(--accent-deep);}

/* kb blog editor — 네이버 블로그형 작성 */
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
.kbe-cover{height:120px;border-radius:10px;border:1px dashed #DADCE0;background:#FAFAFA;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#888;cursor:pointer;overflow:hidden;}
.kbe-cover.compact{height:88px;flex-direction:row;gap:12px;padding:12px;text-align:left;}
.kbe-cover img{width:100%;height:100%;object-fit:cover;}
.kbe-cover.compact img{width:64px;height:64px;border-radius:8px;flex:0 0 auto;}
.kbe-sheet-meta .kbe-meta{margin-top:0;margin-bottom:4px;}
.kbe-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center;}
.kbe-title{display:block;width:100%;min-height:40px;font-size:28px;font-weight:700;letter-spacing:-.025em;line-height:1.35;
  margin:0 0 20px;outline:none;word-break:break-word;color:#111;}
.kbe-title:empty::before{content:attr(data-ph);color:#B0B8C1;display:block;pointer-events:none;font-weight:700;}
.kbe-titleline{display:none;}
.kbe-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.kbe-body{min-height:240px;}
.kbe-insert{position:relative;display:flex;align-items:center;justify-content:center;height:0;margin:0;opacity:0;transition:opacity .15s;z-index:2;}
.kbe-insert.open,.kbe-blk-wrap:hover .kbe-insert{opacity:1;height:28px;margin:2px 0;}
.kbe-insert-line{position:absolute;left:0;right:0;top:50%;height:1px;background:#E8EAED;}
.kbe-insert-btn{position:relative;width:24px;height:24px;border-radius:50%;border:1px solid #DADCE0;background:#fff;color:#666;
  display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08);}
.kbe-insert-btn:hover{border-color:#03C75A;color:#03C75A;}
.kbe-menu{background:#fff;border:1px solid #E8EAED;border-radius:12px;padding:8px;margin:4px 0 8px;
  box-shadow:0 8px 24px rgba(0,0,0,.10);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;}
.kbe-mi{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:8px;
  border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;color:#333;}
.kbe-mi:hover{background:#F4F5F7;color:#03C75A;}
.kbe-blk-wrap{position:relative;}
.kbe-blk{position:relative;padding:2px 0;}
.kbe-blk .del{position:absolute;top:2px;right:-4px;width:24px;height:24px;border-radius:6px;border:none;
  background:transparent;color:#AAA;cursor:pointer;opacity:0;transition:.12s;display:flex;align-items:center;justify-content:center;font-size:14px;}
.kbe-blk-wrap:hover .del{opacity:1;}
.kbe-blk .del:hover{background:#FFF0F0;color:#E03E3E;}
.kbe-toolbar{flex:0 0 auto;background:#fff;border-top:1px solid #E8EAED;
  padding:6px 8px calc(8px + env(safe-area-inset-bottom,0px));box-shadow:0 -2px 12px rgba(0,0,0,.05);}
.kbe-toolbar-inner{display:flex;align-items:flex-end;justify-content:flex-start;gap:0;overflow-x:auto;max-width:760px;margin:0 auto;}
.kbe-toolbar-inner::-webkit-scrollbar{display:none;}
.kbe-toolbar::-webkit-scrollbar{display:none;}
.kbe-tool{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;border:none;background:transparent;
  font-family:inherit;font-size:11px;font-weight:600;color:#444;cursor:pointer;padding:8px 12px;border-radius:8px;min-width:52px;}
.kbe-tool-ic{font-size:20px;line-height:1;}
.kbe-tool:hover{background:#F4F5F7;color:#111;}
.kbe-tool.on{background:#E8F8EF;color:#03A84D;}
.kbe-tdiv{width:1px;height:32px;background:#E8EAED;margin:0 2px;flex:0 0 auto;align-self:center;}
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
.kbe-read{overflow:hidden;}
.kbe-read-top{padding:10px 20px;border-bottom:1px solid var(--line);flex:0 0 auto;}
.kbe-read-top-inner{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.kbe-read-body{flex:1;overflow-y:auto;padding:16px 20px calc(76px + env(safe-area-inset-bottom,0px));}
.kbe-cover-read{width:100%;height:200px;overflow:hidden;flex:0 0 auto;}
.kbe-cover-read img{width:100%;height:100%;object-fit:cover;display:block;}

/* month calendar */
.mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mcell{aspect-ratio:1/1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
  padding-top:6px;border-radius:11px;cursor:pointer;position:relative;font-size:13.5px;font-weight:600;transition:.12s;}
.mcell.muted{color:#C7C0B3;}
.mcell.today{background:var(--accent-soft);color:var(--accent-deep);}
.mcell.sel{background:var(--accent);color:#fff;}
.mdot{width:5px;height:5px;border-radius:50%;background:var(--accent);margin-top:3px;}
.mcell.sel .mdot{background:#fff;}

/* Apple-style calendar */
.cal-wrap{height:100%;min-height:0;display:flex;flex-direction:column;}
.cal-layout{display:flex;flex:1;min-height:0;gap:0;}
.cal-sidebar{display:none;width:220px;flex-shrink:0;border-right:1px solid var(--line);padding:14px 12px;overflow-y:auto;background:#FAF8F4;}
@media(min-width:900px){.cal-sidebar{display:block;}}
.cal-mini-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.cal-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:16px;}
.cal-mini-dow{font-size:10px;font-weight:700;text-align:center;color:var(--muted);padding:2px 0;}
.cal-mini-cell{border:none;background:none;font-family:inherit;font-size:11px;font-weight:600;border-radius:6px;padding:4px 0;cursor:pointer;color:var(--ink);}
.cal-mini-cell.adjacent{color:#70757a;font-weight:500;}
.cal-mini-cell.muted{color:transparent;cursor:default;}
.cal-mini-cell.sel{background:var(--accent);color:#fff;}
.cal-mini-cell.today{box-shadow:inset 0 0 0 1.5px var(--accent);}
.cal-cal-item{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:6px 0;cursor:pointer;}
.cal-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
.cal-main{flex:1;min-width:0;overflow-y:auto;}
.cal-toolbar{padding-top:8px!important;padding-bottom:8px!important;flex-wrap:wrap;gap:10px;}
.cal-toolbar-left{flex:1;min-width:0;}
.cal-toolbar-nav{flex-shrink:0;}
.cal-toolbar-add{display:inline-flex;}
.cal-fab{display:none;position:fixed;right:16px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:45;
  padding:14px 18px;font-size:14px;font-weight:800;border-radius:999px;box-shadow:0 8px 28px rgba(221,94,57,.35);border:none;}
.cal-month{margin-top:0;}
.cal-mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:0;background:#fff;border:1px solid #DADCE0;border-radius:8px;overflow:hidden;}
.cal-mgrid.head{background:#fff;border:none;margin-bottom:4px;border:1px solid transparent;}
.cal-dow{text-align:center;font-size:11px;font-weight:500;color:#70757a;padding:8px 0;letter-spacing:-.01em;}
.cal-dow.sun{color:#D93025;}
.cal-dow.sat{color:#1A73E8;}
.cal-mgrid.body{background:#DADCE0;gap:1px;border:1px solid #DADCE0;}
.cal-cell{min-height:108px;background:#fff;padding:4px 6px 6px;cursor:pointer;display:flex;flex-direction:column;gap:0;position:relative;}
@media(min-width:900px){.cal-cell{min-height:118px;padding:6px 8px 8px;}}
.cal-cell.adjacent{background:#fff;}
.cal-cell.sel{background:#E8F0FE;}
.cal-cell.today{background:#fff;}
.cal-daynum{display:flex;justify-content:flex-end;align-items:flex-start;padding:0 0 4px;min-height:26px;}
.cal-daybadge{font-size:12px;font-weight:500;color:#3c4043;line-height:26px;letter-spacing:-.02em;white-space:nowrap;}
.cal-daybadge.adjacent{color:#70757a;}
.cal-daybadge.sun{color:#D93025;}
.cal-daybadge.sat{color:#1A73E8;}
.cal-daybadge.is-today{width:26px;height:26px;border-radius:50%;background:#D93025;color:#fff!important;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;padding:0 2px;}
.cal-daybadge.is-today-wide{background:#D93025;color:#fff!important;border-radius:13px;padding:0 8px;font-size:11px;font-weight:700;line-height:26px;}
.cal-daybadge.is-today.adjacent,.cal-daybadge.is-today-wide.adjacent{color:#fff!important;}
.cal-evlist{display:flex;flex-direction:column;gap:1px;flex:1;overflow:hidden;min-width:0;}
.cal-evitem{display:flex;align-items:center;gap:6px;border:none;background:transparent;padding:2px 4px 2px 2px;cursor:pointer;min-width:0;width:100%;text-align:left;font-family:inherit;border-radius:4px;}
.cal-evitem:hover,.cal-evitem:focus-visible{background:rgba(60,64,67,.08);outline:none;}
.cal-evbar{width:4px;height:14px;border-radius:2px;flex-shrink:0;}
.cal-evtext{font-size:11px;font-weight:500;color:#3c4043;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35;letter-spacing:-.01em;}
.cal-cell.adjacent .cal-evtext{color:#5f6368;}
.cal-evmore{font-size:10px;color:#70757a;padding:2px 4px 0;font-weight:500;}
.cal-daylist{margin-bottom:20px;}
.cal-dayrow{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer;}
.cal-daybar{width:4px;align-self:stretch;border-radius:3px;flex-shrink:0;}
.cal-pop-bg{position:fixed;inset:0;background:rgba(20,16,12,.35);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:max(60px,8vh) 16px 24px;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.cal-pop{width:100%;max-width:420px;background:#F2F2F7;border-radius:14px;padding:14px 16px 16px;box-shadow:0 24px 60px rgba(0,0,0,.22);animation:fadeUp .22s ease both;max-height:calc(100vh - 48px);overflow-y:auto;-webkit-overflow-scrolling:touch;}
.cal-pop-tabs{display:flex;gap:6px;margin-bottom:12px;}
.cal-pop-tabs .on{background:#3A3A3C;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:8px;}
.cal-pop-row.title-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;}
.cal-pop-title{flex:1;border:none;background:#fff;border-radius:10px;padding:12px 13px;font-family:inherit;font-size:16px;font-weight:600;outline:none;}
.cal-color-pick{display:flex;gap:5px;flex-wrap:wrap;padding-top:6px;}
.cal-color-pick button{width:18px;height:18px;border-radius:4px;border:2px solid transparent;cursor:pointer;padding:0;}
.cal-color-pick button.on{border-color:var(--ink);box-shadow:0 0 0 1px #fff inset;}
.cal-pop-field{margin-bottom:8px;}
.cal-pop-label{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;}
.cal-pop-field input,.cal-pop-field textarea{width:100%;border:none;background:#fff;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:14px;outline:none;resize:vertical;}
.cal-pop-field.time-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.cal-pop-field.time-row input{flex:1;min-width:0;}
.cal-pop-link{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;border:none;background:#fff;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:13.5px;text-align:left;cursor:pointer;margin-bottom:8px;color:var(--ink);}
.cal-pop-link span{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;}
.cal-rem-chips,.cal-contact-pick{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 10px;}
.cal-kakao-pick{margin:-2px 0 10px;padding:10px;background:#fff;border-radius:10px;}
.kakao-place-pick .kakao-place-q{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;margin-bottom:8px;outline:none;}
.kakao-place-pick .kakao-place-q:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.kakao-place-results{max-height:200px;overflow-y:auto;}
.kakao-place-hit{display:block;width:100%;border:none;background:transparent;text-align:left;padding:10px 4px;border-bottom:1px solid var(--line);cursor:pointer;font-family:inherit;}
.kakao-place-hit:last-child{border-bottom:none;}
.kakao-place-hit:active{background:var(--accent-soft);}
.cal-pop-actions{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;}
.cal-pop-foot{margin-top:16px;padding-top:14px;border-top:1px solid rgba(0,0,0,.06);display:flex;flex-direction:column;gap:12px;}
.cal-pop-rec{width:100%;padding:12px 14px;font-size:14px;color:var(--accent-deep);border-color:#F3D8CB;background:#FFFBF8;}
.cal-pop-primary-row{display:grid;grid-template-columns:1fr 1.65fr;gap:10px;}
.cal-pop-cancel{padding:14px 12px;font-size:15px;border-radius:14px;}
.cal-pop-save{padding:14px 16px;font-size:15px;border-radius:14px;box-shadow:0 4px 14px rgba(221,94,57,.22);}
.cal-pop-save:disabled{opacity:.65;box-shadow:none;}
.cal-pop-links{display:flex;justify-content:center;align-items:center;gap:20px;padding:2px 0 4px;}
.cal-pop-link-btn{border:none;background:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--accent-deep);cursor:pointer;padding:6px 4px;}
.cal-pop-link-btn:disabled{opacity:.45;cursor:default;}
.cal-pop-link-btn.danger{color:#B85C4A;}
.cal-pop-sub{margin-top:4px;text-align:center;color:var(--muted);}
@media(max-width:767px){
  .cal-toolbar .h-title{font-size:18px;}
  .cal-toolbar-add{display:none!important;}
  .cal-fab{display:inline-flex;align-items:center;justify-content:center;}
  .cal-cell{min-height:78px;padding:3px 4px 5px;}
  .cal-daybadge{font-size:11px;}
  .cal-daybadge.is-today{width:24px;height:24px;font-size:10px;}
  .cal-evtext{font-size:10px;}
  .cal-evbar{height:12px;}
  .cal-pop-bg{align-items:flex-end;padding:0;overflow:hidden;}
  .cal-pop{border-radius:16px 16px 0 0;max-height:min(92vh,720px);padding-bottom:max(16px,env(safe-area-inset-bottom));}
  .cal-pop-row.title-row{flex-direction:column;}
  .cal-color-pick{padding-top:0;}
  .cal-pop-field.time-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .cal-pop-field.time-row input[type=date]{grid-column:1/-1;}
  .cal-time-sep{display:none;}
  .cal-daylist{padding-bottom:88px;}
}

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

/* modal sheet */
.sheetbg{position:fixed;inset:0;background:rgba(20,16,12,.45);z-index:200;display:flex;align-items:center;justify-content:center;
  padding:max(20px,env(safe-area-inset-top)) 20px max(20px,env(safe-area-inset-bottom));
  animation:fadeUp .25s ease both;}
.sheet-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);z-index:350;display:flex;align-items:center;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));}
.sheet-bottom{width:min(480px,calc(100% - 32px));background:var(--paper);border-radius:18px;padding:20px 20px max(20px,env(safe-area-inset-bottom));
  max-height:min(78vh,620px);overflow-y:auto;-webkit-overflow-scrolling:touch;box-shadow:0 20px 60px rgba(0,0,0,.22);animation:fadeUp .25s ease both;}
.sheet-handle{width:36px;height:4px;background:#D8D0C4;border-radius:2px;margin:0 auto 12px;}
.sheet{width:100%;max-width:400px;background:var(--paper);border-radius:20px;padding:20px 22px 24px;
  box-shadow:0 20px 60px rgba(0,0,0,.22);animation:fadeUp .28s ease both;}
.sheetbar{display:none;}
.sheet-form{padding:20px 22px 24px;}
.sheet-form .sheet-date{display:inline-block;font-size:12px;font-weight:700;color:var(--accent-deep);background:var(--accent-soft);padding:5px 11px;border-radius:8px;margin-bottom:10px;}
.sheet-form .sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;}
.sheet-form .sheet-head h3{margin:0;font-weight:800;font-size:18px;line-height:1.35;}
.sheet-field{margin-bottom:12px;}
.sheet-field label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;}
.sheet-input{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-family:inherit;font-size:15px;color:var(--ink);background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none;}
.sheet-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.sheet-input::placeholder{color:#C0B9AC;}
.sheet-row{display:grid;grid-template-columns:1fr 1.6fr;gap:10px;}
.sheet-actions{display:flex;gap:10px;margin-top:18px;}
.sheet-actions .btn{flex:1;padding:14px;font-size:15px;}
.sheet-x{display:flex;border:none;background:#EFEBE2;color:var(--muted);width:34px;height:34px;border-radius:11px;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;line-height:1;font-family:inherit;}
@media (max-width:380px){.sheet-row{grid-template-columns:1fr;}}
.stepnum{width:26px;height:26px;border-radius:9px;background:var(--accent-soft);color:var(--accent-deep);
  font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
.confirm-bg{z-index:500;}
.confirm-sheet{max-width:340px;text-align:center;padding:26px 22px 22px;}
.confirm-icon{width:52px;height:52px;border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:22px;background:#FFF0EB;color:#B85C4A;}
.confirm-title{margin:0;font-weight:800;font-size:18px;line-height:1.35;color:var(--ink);}
.confirm-msg{margin:10px 0 0;font-size:14px;line-height:1.5;color:var(--muted);}
.confirm-actions{display:flex;gap:10px;margin-top:22px;}
.confirm-actions .btn{flex:1;padding:14px;font-size:15px;}
.confirm-danger{background:#B85C4A;color:#fff;}
.confirm-danger:active{opacity:.92;}
.overflow-backdrop{position:fixed;inset:0;z-index:80;background:transparent;}
.overflow-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:90;min-width:148px;background:#fff;border:1px solid var(--line);
  border-radius:14px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.14);}
.overflow-item{display:block;width:100%;border:none;background:none;font-family:inherit;font-size:14.5px;font-weight:600;
  text-align:left;padding:12px 14px;border-radius:10px;cursor:pointer;color:var(--ink);}
.overflow-item:active{background:#F4F1EA;}
.overflow-item.danger{color:#B85C4A;}
.place-photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.place-photo-cell{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#EFEBE2;}
.place-photo-img{width:100%;height:100%;object-fit:cover;display:block;}
.place-photo-empty{background:linear-gradient(135deg,#EFEBE2,#E8E2D8);}
.place-photo-remove{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:8px;border:none;
  background:rgba(20,16,12,.55);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.place-photo-add{aspect-ratio:1;border-radius:12px;border:2px dashed var(--line);background:#FAF8F4;color:var(--muted);
  font-size:28px;font-weight:300;cursor:pointer;font-family:inherit;}
.place-photo-add:disabled{opacity:.5;cursor:default;}
.place-photo-view{width:100%;height:100%;padding:0;border:none;background:transparent;cursor:pointer;display:block;}
.photo-gallery{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.94);display:flex;flex-direction:column;}
.photo-gallery-top{display:flex;align-items:center;justify-content:space-between;padding:max(12px,env(safe-area-inset-top)) 16px 8px;color:#fff;}
.photo-gallery-close{border:none;background:rgba(255,255,255,.12);color:#fff;width:36px;height:36px;border-radius:10px;font-size:18px;cursor:pointer;}
.photo-gallery-count{font-size:13px;font-weight:700;opacity:.85;}
.photo-gallery-stage{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:0 4px;min-height:0;touch-action:pan-y;}
.photo-gallery-img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;}
.photo-gallery-nav{width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:28px;line-height:1;cursor:pointer;flex:0 0 auto;}
.photo-gallery-nav:disabled{opacity:.25;cursor:default;}
.photo-gallery-dots{display:flex;justify-content:center;gap:6px;padding:12px 0 max(16px,env(safe-area-inset-bottom));}
.photo-gallery-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.35);}
.photo-gallery-dot.on{background:#fff;width:8px;height:8px;}
.webview-overlay{position:fixed;inset:0;z-index:450;background:var(--paper);display:flex;flex-direction:column;
  padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);}
.webview-bar{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 8px;border-bottom:1px solid var(--line);background:var(--paper);flex-shrink:0;}
.webview-back{flex:0 0 auto;}
.webview-title{flex:1;font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 4px;}
.webview-ext{flex:0 0 auto;width:42px;height:42px;display:flex;align-items:center;justify-content:center;
  border-radius:13px;color:var(--muted);text-decoration:none;font-size:18px;font-weight:700;}
.webview-ext:active{background:#EFEBE2;}
.webview-frame{flex:1;width:100%;border:none;background:#fff;}
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
  list:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>,
  todo:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 2.5 2.5L16 9"/></svg>,
  meet:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 6h13M8 12h13M8 18h8"/><path d="M4 7v10"/><circle cx="4" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="17" r="1.5" fill="currentColor" stroke="none"/></svg>,
  place:(p)=> <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3c-4 0-7 2.5-7 6.5C5 14 12 21 12 21s7-7 7-11.5C19 5.5 16 3 12 3z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M8 21h8"/></svg>,
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
  menu:(p)=> <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>,
};

/* --------- data --------- */
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

function formatBytes(n){
  if(!n) return "0B";
  if(n>=1073741824) return `${(n/1073741824).toFixed(n>=10737418240?0:1)}GB`;
  if(n>=1048576) return `${(n/1048576).toFixed(1)}MB`;
  if(n>=1024) return `${Math.round(n/1024)}KB`;
  return `${n}B`;
}

const inputFieldStyle={
  width:"100%",padding:"13px 14px",borderRadius:12,border:"1px solid var(--line)",
  fontFamily:"inherit",fontSize:14,background:"#fff",outline:"none",marginBottom:10,
};

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

const MAX_RECORDING_SEC = 7200;

function recordingTooLong(sec) {
  if (!sec || sec <= MAX_RECORDING_SEC) return null;
  const mins = Math.ceil(sec / 60);
  return `녹음 길이가 2시간을 초과합니다 (${mins}분 · 최대 2시간)`;
}

function friendlyAiError(msg) {
  if (!msg) return "요약에 실패했습니다.";
  if (/Unterminated string in JSON|Unexpected end of JSON|JSON\.parse|잘렸습니다|AI 응답이 비어/i.test(msg))
    return "긴 녹음 변환 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.";
  if (/일시적으로 바쁩니다|high demand|503|UNAVAILABLE/i.test(msg))
    return "AI 서버가 일시적으로 바빠요. 녹음 파일은 저장됐으니 1~2분 후 다시 시도해주세요.";
  if (/429|quota|한도/i.test(msg))
    return "AI 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.";
  if (/Gemini \d+:/.test(msg)) return "AI 처리 중 오류가 났어요. 잠시 후 다시 시도해주세요.";
  return msg;
}

function App(){
  const [boot,setBoot] = useState("loading"); // loading | auth | reconnect | welcome | app
  const [bootError,setBootError] = useState("");
  const [user,setUser] = useState(null);
  const [tab,setTab] = useState("today");
  const [client,setClient] = useState(null);
  const [clientAddQuote,setClientAddQuote] = useState(false);
  const [group,setGroup] = useState("전체");
  const [phase,setPhase] = useState("idle");
  const [kbView,setKbView] = useState(null);
  const [kbSection,setKbSection] = useState("knowledge");
  const [pricing,setPricing] = useState(false);
  const [segment] = useState("business");
  const [cardScan,setCardScan] = useState(false);
  const [showInstall,setShowInstall] = useState(false);
  const [overlay,setOverlay] = useState(null);
  const [shareTarget,setShareTarget] = useState(null);
  const [detail,setDetail] = useState(null);
  const [secs,setSecs] = useState(0);
  const [hl,setHl] = useState(0);
  const [todos,setTodos] = useState([]);
  const [eventsToday,setEventsToday] = useState([]);
  const [meetings,setMeetings] = useState([]);
  const [kbArticles,setKbArticles] = useState([]);
  const [revenue,setRevenue] = useState({ supplyAmount:0, total:0, pipeline:0, wonCount:0, pipelineCount:0 });
  const [lastSummary,setLastSummary] = useState(null);
  const [lastMediaKey,setLastMediaKey] = useState(null);
  const [recordLink,setRecordLink] = useState(null);
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false);
  const [fileViewer,setFileViewer] = useState(null);
  const timer = useRef(null);
  const recStartedAtRef = useRef(null);

  const loadAppData = useCallback(async ()=>{
    const [data, kb] = await Promise.all([api.bootstrap(), api.listKb()]);
    setClients(data.contacts.map(contactToUi));
    setPlaces((data.places || []).map(placeToUi));
    setTodos(data.todos.map(todoToUi));
    setEventsToday((data.eventsToday||[]).map(eventToUi));
    setMeetings((data.meetings||[]).map(meetingToUi));
    for(const m of data.meetings||[]){
      if(m.processStatus==="processing") addPendingMeeting(m.id);
    }
    setKbArticles((kb||[]).map(kbToUi));
    setRevenue(data.revenue||{ supplyAmount:0, total:0, pipeline:0, wonCount:0, pipelineCount:0 });
  },[]);

  const restoreSession = useCallback(async ()=>{
    const t = loadToken();
    if (t) setToken(t);
    setBoot("loading");
    setBootError("");
    try{
      const { user:u } = await api.me();
      setUser(u);
      await loadAppData();
      setBoot(u.onboardingDone ? "app" : "welcome");
    }catch(e){
      if(isAuthError(e)){
        clearToken();
        setBootError("");
        setBoot("auth");
      }else{
        setBootError(e?.message||"서버에 연결할 수 없습니다");
        setBoot("reconnect");
      }
    }
  },[loadAppData]);

  useEffect(()=>{ restoreSession(); },[restoreSession]);

  useEffect(()=>{
    const onOpenFile=(e)=>setFileViewer(e.detail||null);
    window.addEventListener("storyahub-open-file", onOpenFile);
    return ()=>window.removeEventListener("storyahub-open-file", onOpenFile);
  },[]);

  useEffect(()=>{
    if(phase==="rec"){
      const tick=()=>{
        if(recStartedAtRef.current){
          setSecs(Math.max(0,Math.floor((Date.now()-recStartedAtRef.current)/1000)));
        }
      };
      tick();
      timer.current=setInterval(tick,1000);
    }else clearInterval(timer.current);
    return ()=>clearInterval(timer.current);
  },[phase]);

  useEffect(()=>{
    if(phase!=="rec") return;
    const sync=()=>{
      if(document.visibilityState==="visible"&&recStartedAtRef.current){
        setSecs(Math.max(0,Math.floor((Date.now()-recStartedAtRef.current)/1000)));
      }
    };
    document.addEventListener("visibilitychange",sync);
    return ()=>document.removeEventListener("visibilitychange",sync);
  },[phase]);

  const handleAuth = async (result)=>{
    if (result.token) setToken(result.token);
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

  const closeKbView=useCallback((sec)=>{
    if(sec) setKbSection(sec);
    setKbView(null);
  },[]);
  const openKbView=(article,mode,opts={})=>{
    const sec=article?.section||"knowledge";
    setKbSection(sec);
    setKbView({ article, mode, ...opts });
  };
  const openKbWrite=(a,section,opts={})=>{
    const sec=a?.section||section||"knowledge";
    setKbSection(sec);
    setKbView({
      article: a || {
        section: sec,
        blocks: sec === "book"
          ? [{ type: "h", val: "독후감" }, { type: "text", val: "" }]
          : sec === "lecture"
            ? [{ type: "h", val: "강연 정리" }, { type: "text", val: "" }]
            : [],
      },
      mode: a?.id ? "read" : "edit",
      openBookSearch: !!opts.openBookSearch,
    });
  };
  const openClient=(c,{addQuote=false}={})=>{ setClient(c); setClientAddQuote(!!addQuote); };
  const closeClient=()=>{ setClient(null); setClientAddQuote(false); };
  const goTab=(t)=>{ setMobileMenuOpen(false); closeClient(); setKbView(null); setPricing(false); setCardScan(false); setOverlay(null); setDetail(null); if(t!=="record"){ setTab(t);} };
  const startRec=(link=null)=>{
    if(user && user.hasAccess===false){
      toastError(BETA_HIDE_PRICING?"베타 기간이 종료되었습니다. 관리자에게 문의해 주세요.":"이용 기간이 만료되었습니다. 요금제를 선택해 주세요.");
      if(!BETA_HIDE_PRICING) setPricing(true);
      return;
    }
    if(user?.isTrial && user.recordingLimitSec && user.recordingUsedSec>=user.recordingLimitSec){
      toastError(BETA_HIDE_PRICING?"녹음 한도에 도달했습니다. 베타 기간에는 관리자에게 문의해 주세요.":"체험 녹음 한도(1시간)를 모두 사용했습니다.");
      if(!BETA_HIDE_PRICING) setPricing(true);
      return;
    }
    setRecordLink(link||null);
    setTab("record"); setPhase("setup"); setSecs(0); setHl(0); setLastSummary(null); setLastMediaKey(null);
  };
  const startImportRec=()=>startRec({ importAudio: true });
  const startRecFromEvent=(event)=>{
    if(!event?.id) return;
    const contactIds=event.contactIds?.length?event.contactIds:event.contactId?[event.contactId]:[];
    startRec({
      eventId:event.id,
      eventTitle:event.title||"일정",
      contactIds,
      contactId:contactIds[0]||null,
    });
  };
  const startLiveRec=useCallback(()=>{ recStartedAtRef.current=Date.now(); setSecs(0); setHl(0); setPhase("rec"); },[]);
  const cancelLiveRec=useCallback(()=>{ recStartedAtRef.current=null; setSecs(0); setHl(0); setPhase("setup"); },[]);
  const handleRecordComplete=useCallback(async (job)=>{
    setRecordLink(null);
    setPhase("setup");
    setSecs(0);
    toastSuccess("변환을 시작했어요.");
    try{
      const { mode, attendees, contactId, companyName, eventId, secs: recSecs, audioDur, audioFile, photos, blob, nativeMediaKey, nativeDurationSec }=job;
      const isPhoto=mode==="photo";
      let mediaKey;
      let imageKeys;
      let durationSec;
      if(mode==="rec"){
        if(nativeMediaKey){
          mediaKey=nativeMediaKey;
          durationSec=nativeDurationSec??recSecs;
        }else{
          const ext=blob.type.includes("webm")?"webm":"m4a";
          mediaKey=await uploadBlob(blob,`recording-${Date.now()}.${ext}`,blob.type||"audio/webm");
          durationSec=recSecs;
        }
        if(photos?.length){
          imageKeys=await Promise.all(photos.map(async (p)=>{
            if(p.mediaKey) return p.mediaKey;
            if(p.file) return uploadFile(p.file);
            throw new Error("사진 업로드에 실패했습니다");
          }));
        }
      }else if(mode==="upload"){
        mediaKey=await uploadFile(audioFile,{ audio:true });
        durationSec=audioDur||Math.max(1,Math.round(audioFile.size/(128*1024/8)));
      }else if(mode==="photo"){
        if(!photos?.length) throw new Error("사진을 추가해주세요");
        imageKeys=await Promise.all(photos.map((p)=>uploadFile(p.file)));
      }else{
        throw new Error("녹음 방식을 확인할 수 없습니다. 다시 시도해주세요.");
      }
      if(!isPhoto){
        const tooLong=recordingTooLong(durationSec);
        if(tooLong) throw new Error(tooLong);
      }
      const source=isPhoto?"photo":mode==="upload"?"upload":"live";
      const photoNotesPayload=(photos?.length&&imageKeys?.length)
        ? photos.map((p,i)=>({
            key:imageKeys[i],
            note:(p.note||"").trim()||undefined,
            ...(p.atSec!=null?{ atSec:p.atSec }:{}),
          }))
        : [];
      const { meetingId }=await api.enqueueSummary(mediaKey||null,{
        template:"영업",
        contactId: contactId??null,
        companyName,
        source,
        attendees,
        imageKeys: imageKeys??[],
        photoNotes: photoNotesPayload,
        durationSec: isPhoto?0:(durationSec??0),
        eventId: eventId??null,
      });
      addPendingMeeting(meetingId);
      const m=await api.getMeeting(meetingId);
      setDetail({ type:"meeting", data:meetingToUi(m) });
      await loadAppData();
      const { user:u }=await api.me().catch(()=>({}));
      if(u) setUser(u);
    }catch(e){
      if(isAccessError(e)){ if(!BETA_HIDE_PRICING) setPricing(true); setUser(u=>u?{...u,hasAccess:false}:u); }
      notifyError(e, friendlyAiError(e.message)||"업로드·변환 실패");
    }
  },[loadAppData]);
  const mmss=(n)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;

  const handleSwipeBack=useCallback(()=>{
    if(detail){ setDetail(null); return; }
    if(client){ closeClient(); return; }
    if(kbView){ closeKbView(kbView.article?.section); return; }
    if(overlay){ setOverlay(null); return; }
    if(pricing){ setPricing(false); return; }
    if(cardScan){ setCardScan(false); return; }
    if(tab==="record" && phase!=="rec"){
      setRecordLink(null);
      setTab("today");
      setPhase("idle");
    }
  },[detail,client,kbView,overlay,pricing,cardScan,tab,phase,closeKbView]);

  const swipeBackEnabled=boot==="app" && (
    !!detail || !!client || !!kbView || !!overlay || pricing || cardScan || (tab==="record" && phase!=="rec")
  );
  useSwipeBack(swipeBackEnabled, handleSwipeBack);

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

  useEffect(()=>{
    if(boot!=="app") return;
    let cancelled=false;
    const tick=async ()=>{
      const ids=getPendingMeetingIds();
      if(!ids.length) return;
      for(const id of ids){
        try{
          const m=await api.getMeeting(id);
          const status=m.processStatus||"done";
          if(status==="done"){
            removePendingMeeting(id);
            if(!cancelled){
              toastSuccess("녹음 변환이 완료됐어요");
              await loadAppData();
              const { user:u }=await api.me().catch(()=>({}));
              if(u) setUser(u);
            }
          }else if(status==="error"){
            removePendingMeeting(id);
            if(!cancelled){
              toastError(friendlyAiError(m.processError));
              await loadAppData();
            }
          }
        }catch{ /* ignore */ }
      }
    };
    tick();
    const iv=setInterval(tick,4000);
    const onVis=()=>{ if(document.visibilityState==="visible") tick(); };
    document.addEventListener("visibilitychange",onVis);
    return ()=>{ cancelled=true; clearInterval(iv); document.removeEventListener("visibilitychange",onVis); };
  },[boot,loadAppData]);

  if(boot==="loading"||boot==="reconnect") return (
    <div className="sa-root"><style>{CSS}</style><ToastHost/><ConfirmHost/>
      <div className="app-shell">
        <div className="app-main app-main-centered" style={{textAlign:"center"}}>
          {boot==="loading" ? <div className="spinner"/> : (
            <>
              <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>연결을 확인하고 있어요</div>
              <div className="small" style={{lineHeight:1.5,marginBottom:18}}>{bootError||"서버에 연결할 수 없습니다"}</div>
              <button className="btn btn-accent" style={{padding:"12px 20px"}} onClick={restoreSession}>다시 시도</button>
              <button className="btn btn-ghost" style={{padding:"12px 20px",marginTop:10}} onClick={()=>{ clearToken(); setBootError(""); setBoot("auth"); }}>다시 로그인</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const showMobileNav = boot==="app" && kbView?.mode!=="edit";
  const showMobileHeader = showMobileNav && !detail && !client && !overlay && !pricing && !cardScan && tab!=="record";
  const prefs = userPreferences(user);

  return (
    <div className="sa-root">
      <style>{CSS}</style>
      <ToastHost/>
      <ConfirmHost/>
      <ShareSheet
        open={!!shareTarget}
        onClose={()=>setShareTarget(null)}
        resourceType={shareTarget?.type}
        resourceId={shareTarget?.id}
        title={shareTarget?.title}
      />
      <div className="app-shell">
        {boot==="app" && (
          <aside className="app-sidebar">
            <div className="app-brand">Story<span>ahub</span></div>
            <nav className="app-sidenav">
              <NavBtn layout="side" on={tab==="today"&&!client} icon={I.home} label="투데이" onClick={()=>goTab("today")}/>
              <NavBtn layout="side" on={tab==="todos"} icon={I.todo} label="할 일" onClick={()=>goTab("todos")}/>
              <NavBtn layout="side" on={tab==="clients"||!!client} icon={I.users} label={T(segment,"contacts")} onClick={()=>goTab("clients")}/>
              <NavBtn layout="side" on={tab==="meetings"} icon={I.meet} label="미팅" onClick={()=>goTab("meetings")}/>
              <NavBtn layout="side" on={tab==="calendar"} icon={I.cal} label="캘린더" onClick={()=>goTab("calendar")}/>
              <NavBtn layout="side" on={tab==="places"} icon={I.place} label="맛집" onClick={()=>goTab("places")}/>
              <NavBtn layout="side" on={tab==="kb"} icon={I.book} label="지식백과" onClick={()=>goTab("kb")}/>
              <button type="button" className="side-rec" onClick={startRec}>{I.mic({width:18,height:18})} 미팅 기록</button>
            </nav>
            <div className="app-sidebar-foot">AI 비서 · 녹음·인맥·일정·지식</div>
          </aside>
        )}
        <div className="app-main">
        {showMobileHeader && (
          <div className="mob-header">
            <button type="button" className="iconbtn mob-menu-btn" onClick={()=>setMobileMenuOpen(true)} aria-label="메뉴 열기">
              {I.menu({width:20,height:20})}
            </button>
          </div>
        )}
        <MobileMenuSheet
          open={showMobileHeader && mobileMenuOpen}
          onClose={()=>setMobileMenuOpen(false)}
          tab={tab}
          client={client}
          onGoTab={goTab}
          onSearch={()=>setOverlay("search")}
          onSettings={()=>setOverlay("settings")}
          onRecord={startRec}
        />
        <div className={"screen"+(kbView?" screen-kb":"")+(showMobileHeader?" has-mob-header":"")} key={boot+tab+phase+(client?client.id:"")+(pricing?"P":"")+(overlay||"")+(detail?detail.type:"")+(kbView?.mode||"")}>
          {boot==="auth" ? <AuthScreen onSuccess={handleAuth}/>
          : boot==="welcome" ? <WelcomeScreen user={user} contactCount={getClients().length}
              onStartRec={async ()=>{ await completeWelcome(); startRec(); }}
              onAddContact={async ()=>{ await completeWelcome(); setTab("clients"); setCardScan(true); }}
              onDone={completeWelcome}/>
          : detail ? <Detail d={detail} todos={todos} back={()=>setDetail(null)} onTodoToggle={toggleTodo} onTodoUpdated={loadAppData} refreshTodos={loadAppData} onDeleted={()=>{ setDetail(null); loadAppData(); }} prefs={prefs}
              onAppRefresh={loadAppData}
              meetings={meetings}
              startRecFromEvent={(ev)=>{ setDetail(null); startRecFromEvent(ev); }}
              openMeeting={(m)=>setDetail({type:"meeting",data:m})}
              openEvent={(ev)=>setDetail({type:"event",data:ev})}/>
          : overlay==="search" ? <GlobalSearch back={()=>setOverlay(null)} openClient={(c)=>{setOverlay(null);setTab("clients");openClient(c);}}
              openPlace={(p)=>{setOverlay(null);goTab("places");}}
              openTask={(t)=>{setOverlay(null);setDetail({type:"task",data:t});}}
              openMeeting={(m)=>{setOverlay(null);setDetail({type:"meeting",data:m});}}
              meetings={meetings} kbArticles={kbArticles} todos={todos}/>
          : overlay==="mypage" ? <MyPage user={user} back={()=>setOverlay("settings")} onUserUpdated={setUser}/>
          : overlay==="settings" ? <Settings user={user} back={()=>setOverlay(null)} go={(o)=>setOverlay(o)}
              openPricing={()=>{ if(!BETA_HIDE_PRICING){ setOverlay(null); setPricing(true); } }}
              onLogout={async ()=>{ try{ await api.logout(); }catch{/* ignore */} clearToken(); setUser(null); setBoot("auth"); setOverlay(null); }}/>
          : overlay==="trash" ? <Trash back={()=>setOverlay("settings")}/>
          : overlay==="export" ? <ExportData back={()=>setOverlay("settings")}/>
          : overlay==="categorytags" ? <CategoryTagSettings user={user} back={()=>setOverlay("settings")} onUserUpdated={setUser}/>
          : overlay==="calendarsync" ? <CalendarSyncSettings back={()=>setOverlay("settings")}/>
          : overlay==="friends" ? <FriendsView back={()=>setOverlay("settings")} I={I}/>
          : pricing && !BETA_HIDE_PRICING ? <Pricing back={()=>setPricing(false)} segment={segment} user={user} onUserUpdated={setUser}/>
          : tab==="record" ? <RecordScreen phase={phase} secs={secs} mmss={mmss} hl={hl} setHl={setHl}
                              onRunInBackground={handleRecordComplete} todos={todos} toggleTodo={toggleTodo}
                              summary={lastSummary} mediaKey={lastMediaKey} user={user}
                              onStartLive={startLiveRec} onCancelLive={cancelLiveRec}
                              recordLink={recordLink}
                              onBack={()=>{ setRecordLink(null); setTab("today"); setPhase("idle"); }}
                              goClients={()=>{setTab("clients");setPhase("idle");}} />
          : client ? <ClientDetail c={client} back={closeClient} startRec={startRec} seg={segment} onRefresh={loadAppData}
              onDeleted={()=>{ closeClient(); loadAppData(); }}
              user={user} onUserUpdated={setUser}
              contactPresets={prefs.contacts}
              initialAddQuote={clientAddQuote}
              openMeeting={(m)=>setDetail({type:"meeting",data:m.mediaKey!==undefined?m:meetingToUi(m)})}/>
          : tab==="today" ? <Today user={user} startRec={startRec} todos={todos} toggleTodo={toggleTodo} setTodoStatus={setTodoStatus}
                              eventsToday={eventsToday} meetings={meetings} revenue={revenue}
                              openClient={openClient} seeSummary={(m)=>openDetail("meeting",m)}
                              openPricing={()=>{ if(!BETA_HIDE_PRICING) setPricing(true); }} segment={segment}
                              openSearch={()=>setOverlay("search")} openSettings={()=>setOverlay("settings")}
                              openMeetings={()=>goTab("meetings")}
                              openTodoArchive={()=>goTab("todos")}
                              kbArticles={kbArticles}
                              openKb={(a)=>openKbView(a,"read")}
                              openDetail={(t,data)=>setDetail({type:t,data})} onRefresh={loadAppData}/>
          : tab==="todos" ? <TodoArchive embedded meetings={meetings} todos={todos} onRefresh={loadAppData} openDetail={(t)=>setDetail({type:"task",data:t})}/>
          : tab==="clients" ? (cardScan ? <CardScan back={()=>setCardScan(false)} onSaved={refreshContacts} user={user} onUserUpdated={setUser} contactPresets={prefs.contacts}/> : <Clients group={group} setGroup={setGroup} open={openClient} onAdd={()=>setCardScan(true)} onRefresh={loadAppData} goTab={goTab} seg={segment} user={user} onUserUpdated={setUser} contactPresets={prefs.contacts}/>)
          : tab==="places" ? <PlacesView placePresets={prefs.places} onRefresh={loadAppData}/>
          : tab==="meetings" ? <MeetingsTab meetings={meetings} openDetail={(m)=>setDetail({type:"meeting",data:m})} startRec={startRec} startImportRec={startImportRec} onRefresh={loadAppData} meetingPresets={prefs.meeting}/>
          : tab==="calendar" ? <CalendarView openDetail={(t,data)=>setDetail({type:t,data})} organizePrefs={prefs} onStartRecFromEvent={startRecFromEvent} onRefresh={loadAppData}/>
          : kbView ? (
            kbView.mode==="edit"
              ? <KbEditor article={kbView.article} back={closeKbView} onSaved={loadAppData} onDeleted={loadAppData}
                  prefs={prefs}
                  onUserUpdated={setUser}
                  initialBookSearchOpen={!!kbView.openBookSearch}
                  categories={kbCategories(kbArticles, kbView.article?.section).filter((c)=>c!=="전체")}/>
              : <KbReadView article={kbView.article} back={()=>closeKbView(kbView.article?.section || "knowledge")}
                  canEdit={!kbView.article?.shareRole || kbView.article.shareRole==="owner" || kbView.article.shareRole==="editor"}
                  onEdit={()=>setKbView({article:kbView.article,mode:"edit"})}
                  onShare={kbView.article?.shareRole==="owner" ? ()=>setShareTarget({type:"kb",id:kbView.article.id,title:kbView.article.t}) : undefined}/>
          )
          : <Knowledge articles={kbArticles} section={kbSection} onSectionChange={setKbSection} openWrite={openKbWrite}/>}
        </div>

        {tab==="kb" && !kbView && (
          <button
            type="button"
            className="kbh-fab"
            aria-label={kbSection==="book"?"책 추가":kbSection==="lecture"?"강연 정리":"새 글"}
            onClick={()=>openKbWrite(null, kbSection)}
          >
            {I.plus({width:24,height:24})}
          </button>
        )}

        {showMobileNav && (
        <div className="nav">
          <div className="nav-grid">
            <NavBtn on={tab==="today"&&!client} icon={I.home} label="투데이" onClick={()=>goTab("today")}/>
            <NavBtn on={tab==="meetings"} icon={I.meet} label="미팅" onClick={()=>goTab("meetings")}/>
            <NavBtn on={tab==="clients"||client} icon={I.users} label={T(segment,"contacts")} onClick={()=>goTab("clients")}/>
            <NavBtn on={tab==="todos"} icon={I.todo} label="할 일" onClick={()=>goTab("todos")}/>
          </div>
        </div>
        )}

        {showInstall && <InstallSheet close={()=>setShowInstall(false)} onConfirm={()=>{ dismissInstall(); setShowInstall(false); }}/>}
        <FileViewerOverlay file={fileViewer} onClose={()=>setFileViewer(null)}/>
        </div>
      </div>
    </div>
  );
}

function NavBtn({on,icon,label,onClick,layout="bottom"}){
  if(layout==="side") return <button type="button" className={"sidenavitem"+(on?" on":"")} onClick={onClick}>{icon({width:20,height:20})}<span>{label}</span></button>;
  return <button type="button" className={"navitem"+(on?" on":"")} onClick={onClick}>{icon({})}<span>{label}</span></button>;
}

function MobileMenuSheet({open,onClose,tab,client,onGoTab,onSearch,onSettings,onRecord}){
  if(!open) return null;
  const pick=(fn)=>()=>{ onClose(); fn(); };
  const menuTabs=[
    {id:"calendar",icon:I.cal,label:"캘린더"},
    {id:"places",icon:I.place,label:"맛집"},
    {id:"kb",icon:I.book,label:"지식백과"},
  ];
  return createPortal(
    <>
      <div className="mob-menu-backdrop" onClick={onClose}/>
      <div className="mob-menu-sheet" role="dialog" aria-modal="true" aria-label="메뉴">
        <div className="row between" style={{marginBottom:4,paddingBottom:10,borderBottom:"1px solid var(--line)"}}>
          <div style={{fontWeight:800,fontSize:17}}>메뉴</div>
          <button type="button" className="iconbtn" style={{width:38,height:38}} onClick={onClose} aria-label="닫기">
            <span style={{fontSize:18,color:"var(--muted)",lineHeight:1}}>✕</span>
          </button>
        </div>
        <div className="small" style={{fontWeight:700,color:"var(--muted)",margin:"14px 0 6px",paddingLeft:4}}>바로가기</div>
        {menuTabs.map((item)=>(
          <button key={item.id} type="button" className={"mob-menu-item"+(tab===item.id&&!client?" on":"")}
            onClick={pick(()=>onGoTab(item.id))}>
            {item.icon({width:20,height:20})}
            <span>{item.label}</span>
          </button>
        ))}
        <div className="divider" style={{margin:"14px 0"}}/>
        <div className="small" style={{fontWeight:700,color:"var(--muted)",marginBottom:6,paddingLeft:4}}>기능</div>
        <button type="button" className="mob-menu-item" onClick={pick(onSearch)}>
          {I.search({width:20,height:20})}<span>검색</span>
        </button>
        <button type="button" className="mob-menu-item" onClick={pick(onSettings)}>
          {I.gear({width:20,height:20})}<span>설정</span>
        </button>
        <button type="button" className="mob-menu-item" style={{color:"var(--accent-deep)"}} onClick={pick(onRecord)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>
          </svg>
          <span>미팅 기록</span>
        </button>
      </div>
    </>,
    document.body
  );
}

/* ---------------- TODAY ---------------- */
function Today({user,startRec,todos,toggleTodo,setTodoStatus,openClient,seeSummary,openPricing,segment,openSearch,openSettings,openTodoArchive,openMeetings,openDetail,eventsToday,meetings,revenue,onRefresh,kbArticles=[],openKb}){
  const clients=getClients();
  const near=clients.filter(c=>c.group&&c.group!=="미분류").slice(0,3);
  const isBiz=segment==="business";
  const reviewItems=!isBiz ? [
    ...meetings.slice(0,2).map((m)=>({key:`m-${m.id}`,title:m.oneLine||m.t,sub:m.createdLabel||m.d,onClick:()=>seeSummary(m)})),
    ...kbArticles.slice(0,3).map((a)=>({key:`k-${a.id}`,title:a.t,sub:a.c||"지식백과",onClick:()=>openKb?.(a)})),
  ].slice(0,3) : [];
  const [todoView,setTodoView]=useState("check");
  const [focusTodoAdd,setFocusTodoAdd]=useState(false);
  const [todoPanelOpen,setTodoPanelOpen]=useState(true);
  const openTodoWork=hasOpenTodoGroups(todos,{meetings,contacts:clients});
  useEffect(()=>{ if(openTodoWork) setTodoPanelOpen(true); },[openTodoWork]);
  const openTodoCount=countOpenTodoItems(todos,{meetings,contacts:clients});
  const openTodoPreview=openTodoPreviewTexts(todos,{meetings,contacts:clients},2);
  const { done: doneCount, total: todoTotal }=todoProgressCounts(todos.filter(t=>!t.isCategory));
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
        <div className="row today-top-actions" style={{gap:8}}>
          <button className="iconbtn" onClick={openSearch} aria-label="검색">{I.search({width:19,height:19})}</button>
          <button className="iconbtn" onClick={openSettings} aria-label="설정">{I.gear({width:19,height:19})}</button>
        </div>
      </div>

      {trialLeft!=null && !BETA_HIDE_PRICING && (
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
      {trialLeft!=null && BETA_HIDE_PRICING && (
      <div className="pad" style={{marginTop:14}}>
        <div className="card" style={{padding:"13px 15px",background:"#FBF9F4",border:"1px solid var(--line)"}}>
          <div style={{fontWeight:700,fontSize:13.5}}>베타 체험 · {trialLeft}일 남음</div>
          <div className="small" style={{marginTop:4,lineHeight:1.5,color:"var(--muted)"}}>요금제는 정식 오픈 전까지 안내하지 않아요.</div>
        </div>
      </div>
      )}

      {empty && (
      <div className="pad" style={{marginTop:14}}>
        <div className="card" style={{padding:18,background:"var(--accent-soft)",border:"1px solid #F3D8CB"}}>
          <div style={{fontWeight:700,fontSize:15}}>첫 기록을 시작해보세요</div>
          <div className="small" style={{marginTop:6,lineHeight:1.55}}>녹음을 끄면 요약 · 할 일 · 다음 약속이 자동으로 정리돼요.</div>
          <button className="btn btn-accent" style={{width:"100%",padding:13,marginTop:14,fontSize:14}} onClick={startRec}>첫 미팅 기록</button>
        </div>
      </div>
      )}

      {/* 후속 챙기기(미완료 액션) */}
      {openTodoCount>0 && (
      <div className="pad" style={{marginTop:18}}>
        <div className="card" style={{padding:"13px 15px",borderLeft:"4px solid var(--accent)",cursor:"pointer"}} onClick={()=>openDetail("followup")}>
          <div className="row" style={{gap:9,alignItems:"flex-start"}}>
            <span style={{color:"var(--accent-deep)",marginTop:1}}>{I.bolt({})}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13.5}}>후속 챙기기 · {openTodoCount}건</div>
              <div className="small" style={{marginTop:4,lineHeight:1.5}}>
                {openTodoPreview.join(" · ")}
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
            <div className="small" style={{fontWeight:700}}>이번 달 매출 (부가세 포함)</div>
            <span className="small" style={{display:"flex",alignItems:"center",gap:3}}>{now.getMonth()+1}월 {I.chevron({width:15,height:15})}</span>
          </div>
          <div className="row between" style={{marginTop:8,alignItems:"flex-end"}}>
            <div>
              <div style={{fontWeight:800,fontSize:23}}>{formatWon(revenue?.total||0)}</div>
              <div className="small" style={{marginTop:2}}>공급가 {formatWon(revenue?.supplyAmount||0)} · VAT {formatWon(revenue?.vat||0)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="small">파이프라인(예상)</div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--accent-deep)"}}>{formatWon(dealAmounts(revenue?.pipeline||0).total)}</div>
            </div>
          </div>
          <div className="row between" style={{marginTop:12,alignItems:"center"}}>
            <div className="row" style={{gap:6}}>
              <span className="tag green">성사 {revenue?.wonCount||0}건</span>
              <span className="tag amber">진행 {revenue?.pipelineCount||0}건</span>
            </div>
            <button type="button" className="chip" style={{color:"var(--accent-deep)",fontWeight:700}}
              onClick={(e)=>{ e.stopPropagation(); openDetail("revenue",{addQuote:true}); }}>
              + 견적
            </button>
          </div>
        </div>
      </div>

      {/* 핵심 액션 */}
      <div className="pad" style={{marginTop:18}}>
        <button className="btn btn-accent" onClick={startRec}
          style={{width:"100%",padding:"16px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
          {I.mic({width:20,height:20})} {isBiz?"미팅 기록":"강의 기록"}
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

      {/* 할 일 — 대분류·소분류 / 보드 전환 */}
      {!openTodoWork && !todoPanelOpen ? (
      <div className="pad" style={{marginTop:18}}>
        <button type="button" className="chip" style={{color:"var(--accent-deep)"}} onClick={()=>setTodoPanelOpen(true)}>+ 할 일 추가</button>
      </div>
      ) : (
      <>
      <div className="pad row between" style={{alignItems:"flex-end",marginTop:18}}>
        <div>
          <div className="section-h" style={{marginBottom:2}}>오늘 할 일 {openTodoWork && <span className="small" style={{fontWeight:700}}>{doneCount}/{todoTotal}</span>}</div>
          <div className="small">대분류를 만들고 그 안에 소분류 할 일을 넣을 수 있어요</div>
        </div>
        <div className="row" style={{gap:8,alignItems:"center"}}>
          <button type="button" className="chip" style={{color:"var(--muted)"}} onClick={openTodoArchive}>목록</button>
          <button type="button" className="chip" style={{color:"var(--accent-deep)"}} onClick={()=>{
            const openAdd=()=>{
              setFocusTodoAdd(true);
              window.setTimeout(()=>setFocusTodoAdd(false), 700);
            };
            if(todoView==="board"){
              setTodoView("check");
              window.setTimeout(openAdd, 60);
            } else openAdd();
          }}>+ 할 일</button>
          <div className="seg" style={{width:128}}>
            <button type="button" className={todoView==="check"?"on":""} onClick={()=>setTodoView("check")} style={{padding:"6px 0",fontSize:12.5}}>체크</button>
            <button type="button" className={todoView==="board"?"on":""} onClick={()=>setTodoView("board")} style={{padding:"6px 0",fontSize:12.5}}>보드</button>
          </div>
        </div>
      </div>
      <div className="pad" style={{marginTop:10}}>
        {todoView==="check" ? (
          <NestedTodoList todos={todos} meetings={meetings} onRefresh={onRefresh} openDetail={(t)=>openDetail("task",t)} showAdd editable focusAdd={focusTodoAdd} hideCompletedGroups/>
        ) : (
          <TodoBoard todos={todos.filter(t=>!t.isCategory&&!isTodoDone(t))} setTodoStatus={setTodoStatus} openDetail={openDetail}/>
        )}
      </div>
      </>
      )}

      {/* 최근 요약 */}
      <div className="pad row between" style={{alignItems:"flex-end"}}>
        <div className="section-h" style={{marginBottom:0}}>{isBiz?"최근 기록":"최근 강의"}</div>
        <button className="chip" style={{color:"var(--muted)"}} onClick={openMeetings}>미팅 내역</button>
      </div>
      <div className="pad" style={{marginTop:10}}>
        {latestMeeting ? (
        <div className="card" style={{padding:16,cursor:"pointer"}} onClick={()=>seeSummary(latestMeeting)}>
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
          {latestMeeting.hasAudio && <div className="small" style={{marginTop:10,color:"var(--accent-deep)",fontWeight:600}}>🎧 녹음 듣기</div>}
        </div>
        ) : (
        <div className="card" style={{padding:18,textAlign:"center"}}>
          <div className="small">아직 기록이 없어요</div>
          <button className="btn btn-accent" style={{marginTop:12,padding:"11px 20px",fontSize:13}} onClick={startRec}>첫 기록하기</button>
        </div>
        )}
      </div>

      {/* 비즈니스: 인맥 (데이터 있을 때만) */}
      {isBiz && near.length>0 && <>
      <div className="pad row between"><div className="section-h">인맥</div></div>
      <div className="pad" style={{marginBottom:10}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {near.map((c)=>(
            <div key={c.id} className="list-item row between" onClick={()=>openClient(c)}>
              <div className="row" style={{gap:11}}>
                <div className="avatar">{c.init}</div>
                <div><div style={{fontWeight:600,fontSize:14}}>{c.person || c.co}</div>
                  <div className="small">{[contactRoleLine(c), c.person && c.co ? c.co : null].filter(Boolean).join(" · ")}</div></div>
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
      </>}

      {/* 학생 모드: 복습 추천 — 실제 기록·지식백과가 있을 때만 */}
      {!isBiz && reviewItems.length>0 && <>
      <div className="pad"><div className="section-h">오늘 복습 추천</div></div>
      <div className="pad" style={{marginBottom:10}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {reviewItems.map((r,i,a)=>(
            <div key={r.key} className="list-item row between" style={{padding:"14px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none",cursor:"pointer"}}
              onClick={r.onClick}>
              <div style={{fontWeight:600,fontSize:14}}>{r.title}<span className="small" style={{fontWeight:500}}> · {r.sub}</span></div>
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
  const c=tagColor(t);
  return <span className={"tag"+(c&&c!=="accent"?" "+c:"")}>{t}</span>;
}

function FilterSelectField({label,valueLabel,onClick}){
  return (
    <button type="button" className="filter-pick-btn" onClick={onClick}>
      <div className="filter-pick-label">{label}</div>
      <div className="row between" style={{gap:8,alignItems:"center"}}>
        <span className="filter-pick-value">{valueLabel}</span>
        <span style={{color:"var(--muted)",flex:"0 0 auto",display:"flex"}}>{I.chevron({width:16,height:16})}</span>
      </div>
    </button>
  );
}

function FilterSelectSheet({open,title,options,value,onSelect,onClose,searchPlaceholder="검색"}){
  const [q,setQ]=useState("");
  const [kbInset,setKbInset]=useState(0);
  useEffect(()=>{ if(open) setQ(""); },[open,title]);
  useEffect(()=>{
    if(!open) return;
    const vv=window.visualViewport;
    if(!vv) return;
    const sync=()=>setKbInset(Math.max(0,window.innerHeight-vv.height-vv.offsetTop));
    sync();
    vv.addEventListener("resize",sync);
    vv.addEventListener("scroll",sync);
    return ()=>{ vv.removeEventListener("resize",sync); vv.removeEventListener("scroll",sync); };
  },[open]);
  if(!open) return null;
  const ql=q.trim().toLowerCase();
  const filtered=ql
    ? options.filter((opt)=>{
        const hay=(opt.searchText||opt.label||"").toLowerCase();
        return hay.includes(ql);
      })
    : options;
  return createPortal(
    <div className="sheet-bg" style={{paddingBottom:kbInset}} onClick={onClose}>
      <div
        className="sheet-bottom filter-select-sheet"
        style={{maxHeight:kbInset?`min(calc(100dvh - ${kbInset}px - 12px),88dvh)`:undefined}}
        onClick={e=>e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={{fontWeight:800,fontSize:17,marginBottom:12,flexShrink:0}}>{title}</div>
        <div className="filter-select-list">
          {filtered.length===0 && (
            <div className="small" style={{textAlign:"center",padding:"28px 0",lineHeight:1.5}}>
              {ql ? `"${q.trim()}" 검색 결과가 없어요` : "항목이 없어요"}
            </div>
          )}
          {filtered.map((opt)=>(
            <button key={opt.value} type="button"
              className={"filter-pick-item"+(value===opt.value?" on":"")}
              onClick={()=>{ onSelect(opt.value); onClose(); }}>
              <span>{opt.label}</span>
              <span className="row" style={{gap:8,flex:"0 0 auto",alignItems:"center"}}>
                {opt.count!=null && <span className="filter-pick-count">{opt.count}명</span>}
                {value===opt.value && <span style={{color:"var(--accent-deep)",display:"flex"}}>{I.check({width:16,height:16})}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="filter-select-search-wrap">
          <div className="filter-pick-search" style={{marginBottom:0}}>
            {I.search({width:16,height:16})}
            <input
              autoFocus
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder={searchPlaceholder}
            />
            {q && <span onClick={()=>setQ("")} style={{cursor:"pointer",flex:"0 0 auto"}}>✕</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Clients({group,setGroup,open,onAdd,onRefresh,goTab,seg,contactPresets={},user,onUserUpdated}){
  const [syncing,setSyncing]=useState(false);
  const [listVersion,setListVersion]=useState(0);
  const CLIENTS=useMemo(()=>getClients(),[listVersion]);
  const handlePhoneSync=async ()=>{
    if(syncing) return;
    setSyncing(true);
    try{
      const r=await syncPhoneContacts();
      await onRefresh?.();
      setListVersion(v=>v+1);
      goTab?.("clients");
      const parts=[];
      if(r.importAdded) parts.push(`Storyahub ${r.importAdded}명 추가`);
      if(r.exportAdded) parts.push(`휴대폰 ${r.exportAdded}명 추가`);
      if(r.exportUpdated) parts.push(`휴대폰 ${r.exportUpdated}명 갱신`);
      const skipped=(r.importSkipped||0)+(r.exportSkipped||0);
      if(parts.length){
        toastSuccess(parts.join(" · ")+(skipped?` · ${skipped}명 건너뜀`:""));
      }else{
        toastSuccess(skipped?"새로 추가할 연락처가 없어요 · 이미 모두 있어요":"연락처가 최신 상태예요");
      }
    }catch(err){
      notifyError(err, err.message);
    }finally{
      setSyncing(false);
    }
  };
  const GROUPS=mergedContactGroups({ contacts: contactPresets }, CLIENTS);
  const COMPANIES=mergedContactCompanies(CLIENTS);
  const [view,setView]=useState("list");
  const [classBy,setClassBy]=useState("group");
  const [company,setCompany]=useState("전체");
  const [presetEdit,setPresetEdit]=useState(false);
  const [tag,setTag]=useState("전체");
  const [favs,setFavs]=useState(()=>new Set(CLIENTS.filter(c=>c.fav).map(c=>c.id)));
  const [onlyFav,setOnlyFav]=useState(false);
  const [sortGrade,setSortGrade]=useState(false);
  const [groupByPerson,setGroupByPerson]=useState(true);
  const [classPickerOpen,setClassPickerOpen]=useState(false);
  const [tagPickerOpen,setTagPickerOpen]=useState(false);
  const [q,setQ]=useState("");
  const toggleFav=async (id,e)=>{
    e&&e.stopPropagation();
    const c=CLIENTS.find(x=>x.id===id);
    if(!c) return;
    const next=!favs.has(id);
    setFavs(p=>{const n=new Set(p); next?n.add(id):n.delete(id); return n;});
    try{ await api.updateContact(id,{ favorite: next }); }
    catch(err){ setFavs(p=>{const n=new Set(p); next?n.delete(id):n.add(id); return n;}); notifyError(err, err.message); }
  };
  const term=T(seg,"contacts");
  const allTags=["전체",...Array.from(new Set(CLIENTS.flatMap(c=>c.tags||[])))];
  let list=classBy==="group"
    ? (group==="전체"?CLIENTS:CLIENTS.filter(c=>c.group===group))
    : (company==="전체"?CLIENTS:CLIENTS.filter(c=>(c.co||"").trim()===company));
  if(tag!=="전체") list=list.filter(c=>(c.tags||[]).includes(tag));
  if(onlyFav) list=list.filter(c=>favs.has(c.id));
  const ql=q.trim().toLowerCase();
  if(ql) list=list.filter(c=>contactSearchText(c).includes(ql));
  if(sortGrade) list=[...list].sort((a,b)=>totalInfluence(b)-totalInfluence(a));
  const listByCompany=classBy==="company"&&company==="전체"&&!sortGrade?(()=>{
    const map=new Map();
    for(const c of list){
      const key=(c.co||"").trim()||"회사 미입력";
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(c);
    }
    return [...map.entries()].sort((a,b)=>{
      if(a[0]==="회사 미입력") return 1;
      if(b[0]==="회사 미입력") return -1;
      return a[0].localeCompare(b[0],"ko");
    });
  })():null;
  const listRows=groupByPerson && !sortGrade && !listByCompany
    ? layoutContactsByIdentity(list)
    : list.map(c=>({ kind:"contact", contact:c }));
  const classOptions=(classBy==="group"?GROUPS:COMPANIES).map(v=>({
    value:v,
    label:v,
    searchText:v,
    count:v==="전체"?CLIENTS.length:classBy==="group"
      ? CLIENTS.filter(c=>c.group===v).length
      : CLIENTS.filter(c=>(c.co||"").trim()===v).length,
  }));
  const classValue=classBy==="group"?group:company;
  const classFieldLabel=classBy==="group"?"소속":"회사";
  const classSheetTitle=classBy==="group"?"소속 선택":"회사 선택";
  const classSearchPlaceholder=classBy==="group"?"소속 · 그룹 검색":"회사명 검색";
  const tagOptions=allTags.map(t=>({
    value:t,
    label:t,
    searchText:t,
    count:t==="전체"?CLIENTS.length:CLIENTS.filter(c=>(c.tags||[]).includes(t)).length,
  }));
  const renderRow=(c)=>{
    const g=grade(c);const fav=favs.has(c.id);const intro=introduced(c).length;
    return (
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
              <div style={{fontWeight:700,fontSize:14.5}}>{c.person || c.co}</div>
            </div>
            <div className="small">
                    {[contactRoleLine(c), c.person && c.co ? c.co : null, intro > 0 ? `소개 ${intro}명` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="row" style={{gap:5,marginTop:6,flexWrap:"wrap"}}>
              {classBy==="group" && <span className="tag gray" style={{fontSize:10.5}}>{c.group}</span>}
              {classBy==="company" && c.co && <span className="tag blue" style={{fontSize:10.5}}>{c.co}</span>}
              {(c.tags||[]).map(t=><TagChip key={t} t={t}/>)}
            </div>
          </div>
        </div>
        <button className="iconbtn" style={{width:38,height:38,flex:"0 0 auto",color:"var(--accent-deep)"}}
          onClick={(e)=>{ e.stopPropagation(); open(c,{ addQuote:true }); }} aria-label="견적 추가">{I.quote({width:16,height:16})}</button>
        <button className="iconbtn" style={{width:38,height:38,flex:"0 0 auto",color:fav?"var(--accent)":"#CFC8BB"}}
          onClick={(e)=>toggleFav(c.id,e)}>{I.star({})}</button>
      </div>
    );
  };
  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">CRM</div>
        <div className="row between"><div className="h-title">{term}</div>
          <button className="iconbtn" style={{color:"var(--accent-deep)"}} onClick={onAdd}>{I.plus({width:20,height:20})}</button></div>
        <div className="row" style={{gap:9,marginTop:14,background:"#F4F1EA",borderRadius:12,padding:"11px 13px",color:"var(--muted)"}}>
          {I.search({width:17,height:17})}
          <input
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="이름 · 회사 · 직함 · 전화 검색"
            aria-label="인맥 검색"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:14,color:"var(--ink)"}}
          />
          {q.trim() ? (
            <button type="button" className="iconbtn" style={{width:28,height:28,color:"var(--muted)"}} onClick={()=>setQ("")}
              aria-label="검색어 지우기">✕</button>
          ) : null}
        </div>
      </div>

      {isDeviceContactsAvailable() && (
        <div className="pad" style={{marginTop:12}}>
          <button type="button" className="card" style={{width:"100%",padding:"14px 16px",border:"1px solid var(--line)",
            background:"#fff",cursor:syncing?"wait":"pointer",textAlign:"left",fontFamily:"inherit"}}
            disabled={syncing} onClick={handlePhoneSync}>
            <div className="row between" style={{gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14.5}}>📱 휴대폰 연락처 동기화</div>
                <div className="small" style={{marginTop:4}}>이미 있는 연락처는 건너뛰고 새 연락처만 저장해요</div>
              </div>
              <span className="small" style={{color:"var(--accent-deep)",fontWeight:700,flex:"0 0 auto"}}>
                {syncing?"동기화 중…":"동기화"}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* 리스트 / 지도 토글 */}
      <div className="pad" style={{marginTop:14}}>
        <div className="seg">
          <button className={view==="list"?"on":""} onClick={()=>setView("list")}>리스트</button>
          <button className={view==="map"?"on":""} onClick={()=>setView("map")}>지도</button>
        </div>
      </div>

      {view==="map" ? <ClientMap open={open} onRefresh={onRefresh}/> : (
      <>
      {/* 소속 / 회사 · 태그 필터 */}
      <div className="pad" style={{marginTop:14}}>
        <div className="card client-filter-card">
          <div className="client-filter-top">
            <div className="small">분류</div>
            {classBy==="group" && (
              <button type="button" style={{border:"none",background:"none",padding:0,fontFamily:"inherit",fontSize:13,fontWeight:700,
                color:presetEdit?"var(--accent-deep)":"var(--muted)",cursor:"pointer"}}
                onClick={()=>setPresetEdit(v=>!v)}>
                {presetEdit?"완료":"그룹 편집"}
              </button>
            )}
          </div>
          <div className="class-mode-tabs">
            <button type="button" className={classBy==="group"?"on":""} onClick={()=>{ setClassBy("group"); setClassPickerOpen(false); }}>소속</button>
            <button type="button" className={classBy==="company"?"on":""} onClick={()=>{ setClassBy("company"); setClassPickerOpen(false); }}>회사</button>
          </div>
          <FilterSelectField
            label={classFieldLabel}
            valueLabel={classValue}
            onClick={()=>setClassPickerOpen(true)}
          />
          <div style={{height:8}}/>
          <FilterSelectField
            label="태그"
            valueLabel={tag}
            onClick={()=>setTagPickerOpen(true)}
          />
        </div>
      </div>
      <FilterSelectSheet
        open={classPickerOpen}
        title={classSheetTitle}
        options={classOptions}
        value={classValue}
        searchPlaceholder={classSearchPlaceholder}
        onSelect={(v)=>classBy==="group"?setGroup(v):setCompany(v)}
        onClose={()=>setClassPickerOpen(false)}
      />
      <FilterSelectSheet
        open={tagPickerOpen}
        title="태그 선택"
        options={tagOptions}
        value={tag}
        searchPlaceholder="태그 검색"
        onSelect={setTag}
        onClose={()=>setTagPickerOpen(false)}
      />
      {presetEdit && classBy==="group" && (
        <ContactGroupTagPanel
          user={user}
          onUserUpdated={onUserUpdated}
          contactPresets={contactPresets}
          contacts={CLIENTS}
          showAssignment={false}
          presetOnly
          compact
          onContactsRefresh={onRefresh}
        />
      )}
      {/* 즐겨찾기 · 정렬 */}
      <div className="pad row" style={{gap:8,marginTop:9,flexWrap:"wrap"}}>
        <button className={"chip"+(onlyFav?" on":"")} onClick={()=>setOnlyFav(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:5}}>{I.star({width:13,height:13})} 즐겨찾기</button>
        <button className={"chip"+(sortGrade?" on":"")} onClick={()=>setSortGrade(v=>!v)}>기여도순</button>
        <button className={"chip"+(groupByPerson?" on":"")} onClick={()=>setGroupByPerson(v=>!v)}>동일인 묶기</button>
      </div>
      <div className="pad" style={{marginTop:14}}>
        <div className="card" style={{padding:"4px 16px"}}>
          {listByCompany
            ? listByCompany.map(([coName,items],si)=>(
              <div key={coName} style={{borderTop:si>0?"1px solid var(--line)":"none",paddingTop:si>0?8:0}}>
                <div className="small row between" style={{padding:"10px 0 6px",fontWeight:800,color:"var(--muted)"}}>
                  <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{coName}</span>
                  <span style={{flex:"0 0 auto",marginLeft:8}}>{items.length}명</span>
                </div>
                {items.map(renderRow)}
              </div>
            ))
            : listRows.map((row,ri)=>{
              if(row.kind==="identityGroup"){
                const primary=row.members[0];
                return (
                  <div key={row.key} style={{borderTop:ri>0?"1px solid var(--line)":"none",paddingTop:ri>0?8:0}}>
                    <div className="small row between" style={{padding:"10px 0 6px",fontWeight:800,color:"var(--accent-deep)"}}>
                      <span>{primary.person}{primary.phone?` · ${primary.phone}`:""}</span>
                      <span>{row.members.length}개 소속</span>
                    </div>
                    {row.members.map(renderRow)}
                  </div>
                );
              }
              return renderRow(row.contact);
            })}
          {list.length===0 && <div className="small" style={{textAlign:"center",padding:"24px 0"}}>
            {ql ? `“${q.trim()}” 검색 결과가 없어요` : onlyFav ? "즐겨찾기한 인맥이 없어요" : "해당 조건의 인맥이 없어요"}
          </div>}
        </div>
        <div className="small" style={{textAlign:"center",marginTop:16}}>{list.length}개 {term}</div>
      </div>
      </>
      )}
    </div>
  );
}

function ClientMap({open,onRefresh}){
  const CLIENTS=getClients();
  const [myPos,setMyPos]=useState(null);
  const [geoErr,setGeoErr]=useState("");
  const [geocoding,setGeocoding]=useState(false);
  const [sel,setSel]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    setGeocoding(true);
    api.geocodePendingContacts()
      .then((res)=>{
        if(cancelled) return;
        if(res?.contacts?.length) setClients(res.contacts.map(contactToUi));
        onRefresh?.();
      })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setGeocoding(false); });
    return ()=>{ cancelled=true; };
  },[]);

  useEffect(()=>{
    if(!navigator.geolocation){ setGeoErr("이 기기에서는 위치를 사용할 수 없어요"); return; }
    navigator.geolocation.getCurrentPosition(
      (p)=>setMyPos({lat:p.coords.latitude,lng:p.coords.longitude}),
      ()=>setGeoErr("내 위치를 쓰려면 위치 권한을 허용해주세요"),
      {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
    );
  },[]);

  const located=CLIENTS.filter(c=>c.lat!=null&&c.lng!=null);
  const withDist=located.map(c=>{
    const km=myPos?haversineKm(myPos.lat,myPos.lng,c.lat,c.lng):null;
    return {...c,km};
  }).sort((a,b)=>(a.km??9999)-(b.km??9999));

  const near=myPos?withDist.filter(c=>c.km<=10):withDist;
  const mapCenter=myPos||(located[0]?{lat:located[0].lat,lng:located[0].lng}:null);
  const spanKm=2.5;

  useEffect(()=>{
    if(!sel && near[0]) setSel(near[0]);
    else if(sel && !near.find(c=>c.id===sel.id) && near[0]) setSel(near[0]);
  },[near.length,sel?.id]);

  const pinPos=(c)=>{
    if(!mapCenter) return {left:"50%",top:"50%"};
    const dx=(c.lng-mapCenter.lng)*111320*Math.cos((mapCenter.lat*Math.PI)/180);
    const dy=-(c.lat-mapCenter.lat)*110540;
    const pxPerM=140/spanKm/1000;
    const left=50+(dx*pxPerM/1.7);
    const top=50+(dy*pxPerM/1.7);
    return {left:`${Math.max(6,Math.min(94,left))}%`,top:`${Math.max(6,Math.min(94,top))}%`};
  };

  if(!CLIENTS.length) return (
    <div className="pad small" style={{textAlign:"center",padding:"40px 0"}}>인맥을 추가하면 지도에 표시돼요</div>
  );

  return (
    <div className="fade">
      <div className="pad row between" style={{gap:8,marginTop:14,color:"var(--muted)",fontSize:12.5,fontWeight:600}}>
        <span className="row" style={{gap:5}}>
          {I.pin({})} 위치 정보가 있는 인맥 {located.length}곳
          {geocoding && <span className="small"> · 변환 중…</span>}
        </span>
        {myPos && near[0]?.km!=null && <span className="tag green" style={{fontSize:11}}>반경 10km</span>}
      </div>
      {geoErr && <div className="pad small" style={{paddingTop:0,color:"var(--accent-deep)"}}>{geoErr}</div>}
      {located.length===0 && !geocoding && (
        <div className="pad small" style={{paddingTop:0,lineHeight:1.55}}>
          주소가 있는 인맥이 아직 좌표로 변환되지 않았어요. 명함 스캔 시 주소를 넣거나, 잠시 후 다시 열어보세요.
        </div>
      )}
      <div className="mapwrap">
        {[1,2].map(i=>(
          <div key={i} className="ring" style={{width:`${i*38}%`,height:`${i*38}%`}}>
            <span className="ringlbl" style={{top:-8}}>{i===1?"1km":"2km"}</span>
          </div>
        ))}
        {myPos && <><div className="mypulse"/><div className="mydot"/></>}
        {located.map(c=>{
          const pos=pinPos(c);
          const active=sel?.id===c.id;
          return (
            <div key={c.id} className="cpin" style={{left:pos.left,top:pos.top}} onClick={()=>setSel(c)}>
              <div className="cpinhead" style={{background:active?"var(--accent)":"#5C6BC0",width:active?38:34,height:active?38:34}}>
                <span>{(c.person||c.co||"?")[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
      {sel ? (
      <div className="pad" style={{marginTop:12,marginBottom:12}}>
        <div className="card" style={{padding:16}}>
          <div className="row between">
            <div className="row" style={{gap:12}}>
              <div className="avatar">{(sel.person||sel.co||"?")[0]}</div>
              <div>
                <div style={{fontWeight:700,fontSize:14.5}}>{sel.person||sel.co}</div>
                <div className="small">
                  {[sel.person&&sel.co?sel.co:null,contactRoleLine(sel)].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            <div className="row" style={{gap:6}}>
              {sel.km!=null && <span className="tag green">{formatDistanceKm(sel.km)}</span>}
              <span className="tag gray">{sel.group}</span>
            </div>
          </div>
          {sel.area && <div className="small" style={{marginTop:10,display:"flex",alignItems:"flex-start",gap:5,lineHeight:1.45}}>{I.pin({})} {sel.area}</div>}
          <div className="row" style={{gap:10,marginTop:14}}>
            <button className="btn btn-ghost" style={{flex:1,padding:12}} onClick={()=>open(sel)}>상세 보기</button>
            {sel.area && (
              <button className="btn btn-ghost" style={{flex:1,padding:12}}
                onClick={()=>{
                  const url=kakaoDirectionsUrl({ address:sel.area, lat:sel.lat, lng:sel.lng, label:sel.co||sel.person||"목적지" });
                  if(url) window.open(url,"_blank","noopener");
                }}>
                길찾기
              </button>
            )}
          </div>
        </div>
        {near.length>1 && (
          <div className="row" style={{gap:8,marginTop:12,overflowX:"auto"}}>
            {near.map(c=>(
              <button key={c.id} className={"chip"+(sel.id===c.id?" on":"")} onClick={()=>setSel(c)}>
                <span style={{fontWeight:600}}>{c.person||c.co}</span>
                {c.person&&c.co?<span style={{opacity:.75}}> · {c.co}</span>:null}
                {c.km!=null?` · ${formatDistanceKm(c.km)}`:""}
              </button>
            ))}
          </div>
        )}
      </div>
      ) : (
        <div className="pad small" style={{textAlign:"center",padding:"20px 0 28px",lineHeight:1.55}}>
          {located.length===0?"주소가 등록된 인맥을 추가해주세요":"지도에서 핀을 선택하세요"}
        </div>
      )}
    </div>
  );
}

function CardImageThumb({mediaKey}){
  const [url,setUrl]=useState(null);
  useEffect(()=>{
    if(!mediaKey){ setUrl(null); return; }
    let alive=true;
    mediaUrl(mediaKey).then(u=>{ if(alive) setUrl(u); }).catch(()=>{ if(alive) setUrl(null); });
    return ()=>{ alive=false; };
  },[mediaKey]);
  useEffect(()=>()=>{ if(url?.startsWith("blob:")) URL.revokeObjectURL(url); },[url]);
  if(!mediaKey||!url) return null;
  return <img src={url} alt="명함" style={{width:"100%",borderRadius:12,maxHeight:180,objectFit:"contain",background:"#f5f5f5",marginBottom:12}}/>;
}

function ClientDetail({c,back,startRec,seg,onRefresh,onDeleted,openMeeting,user,onUserUpdated,contactPresets={groups:[],tags:[]},initialAddQuote=false}){
  const mt=T(seg,"meeting");
  const CLIENTS=getClients();
  const [fav,setFav]=useState(!!c.fav);
  const [detail,setDetail]=useState(null);
  const [loading,setLoading]=useState(true);
  const [tags,setTags]=useState(c.tags||[]);
  const [grp,setGrp]=useState(c.group||"미분류");
  const [introSheet,setIntroSheet]=useState(false);
  const [addingDeal,setAddingDeal]=useState(!!initialAddQuote);
  const [dealSaving,setDealSaving]=useState(false);
  const [editingInfo,setEditingInfo]=useState(false);
  const [infoSaving,setInfoSaving]=useState(false);
  const [profile,setProfile]=useState({
    person:c.person||"", title:c.title||"", department:c.department||"", co:c.co||"", phone:c.phone||"", email:c.email||"", area:c.area||"",
  });
  const [draft,setDraft]=useState(profile);
  const reload=()=>api.getContact(c.id).then(setDetail).catch(()=>setDetail(null));
  useEffect(()=>{
    setLoading(true);
    reload().finally(()=>setLoading(false));
  },[c.id]);
  useEffect(()=>{ setAddingDeal(!!initialAddQuote); },[c.id, initialAddQuote]);
  useEffect(()=>{ setTags(c.tags||[]); setGrp(c.group||"미분류"); },[c.id,c.tags,c.group]);
  useEffect(()=>{
    const next={ person:c.person||"", title:c.title||"", department:c.department||"", co:c.co||"", phone:c.phone||"", email:c.email||"", area:c.area||"" };
    setProfile(next);
    if(!editingInfo) setDraft(next);
  },[c.id,c.person,c.title,c.department,c.co,c.phone,c.email,c.area,editingInfo]);
  const patchTags=async (next)=>{
    setTags(next);
    try{ await api.updateContact(c.id,{ tags: next }); onRefresh?.(); }
    catch(e){ notifyError(e, e.message); setTags(c.tags||[]); }
  };
  const patchGroup=async (next)=>{
    setGrp(next);
    try{
      await api.updateContact(c.id,{ group: next==="미분류"?null:next });
      onRefresh?.();
    }catch(e){ notifyError(e, e.message); setGrp(c.group||"미분류"); }
  };
  const cardKey=c._raw?.cardImageKey||detail?.cardImageKey;
  const profileInput=(k,label,placeholder="")=>(
    <div style={{marginBottom:12}}>
      <div className="small" style={{fontWeight:700,marginBottom:5}}>{label}</div>
      <input value={draft[k]} onChange={e=>setDraft(p=>({...p,[k]:e.target.value}))} placeholder={placeholder}
        style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",
          fontFamily:"inherit",fontSize:14,color:"var(--ink)",background:"#fff",outline:"none"}}/>
    </div>
  );
  const startEditInfo=()=>{ setDraft(profile); setEditingInfo(true); };
  const cancelEditInfo=()=>{ setDraft(profile); setEditingInfo(false); };
  const saveProfile=async ()=>{
    setInfoSaving(true);
    try{
      await api.updateContact(c.id,{
        person: draft.person.trim()||null,
        title: draft.title.trim()||null,
        department: draft.department.trim()||null,
        company: draft.co.trim()||null,
        phone: draft.phone.trim()||null,
        email: draft.email.trim()||null,
        address: draft.area.trim()||null,
      });
      const saved={
        person: draft.person.trim(),
        title: draft.title.trim(),
        department: draft.department.trim(),
        co: draft.co.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        area: draft.area.trim(),
      };
      setProfile(saved);
      setEditingInfo(false);
      toastSuccess("연락처 정보를 저장했어요");
      onRefresh?.();
      reload();
    }catch(e){ notifyError(e, e.message); }
    finally{ setInfoSaving(false); }
  };
  const attachQuoteToDeal=async (d)=>{
    try{
      const file=await pickAnyFile();
      setDealSaving(true);
      const quoteKey=await uploadFile(file);
      await api.saveDeal({
        id:d.id,
        quoteKey,
      });
      reload();
      onRefresh?.();
    }catch(e){
      if(!isPickCancelled(e) && e?.message!=="파일이 선택되지 않았습니다") notifyError(e, e.message||"첨부 실패");
    }finally{ setDealSaving(false); }
  };
  const toggleOpenTodo=async (t)=>{
    if(!t.id) return;
    const next=t.done?"todo":"done";
    await api.updateTodo(t.id,{ status: next });
    reload();
    onRefresh?.();
  };
  const unlinkIntro=async (target,label)=>{
    if(!(await confirmAction(
      `${label}과(와)의 소개 관계를 끊을까요?`,
      "연결만 해제되며 인맥 정보는 삭제되지 않아요."
    ))) return;
    try{
      await api.updateContact(target.id,{ referredById: null });
      toastSuccess("소개 관계를 해제했어요");
      reload();
      onRefresh?.();
    }catch(e){ notifyError(e, e.message); }
  };
  const ind=indirectWon(c);
  const total=totalInfluence(c);
  const g=grade(c);
  const by=introducedBy(c);
  const kids=introduced(c);
  const displayInit=(profile.co||profile.person||"?")[0];
  const deals=detail?.deals||[];
  const deal=deals[0];
  const upcoming=(detail?.upcomingEvents||[]).map(eventToUi);
  const openTodos=(detail?.openTodos||[]).map(todoToUi);
  const meetHistory=detail?.meetings||[];
  const deleteDeal=async (d)=>{
    if(!(await confirmDelete(d.title||"딜"))) return;
    try{
      await api.deleteDeal(d.id);
      reload();
      onRefresh?.();
    }catch(e){ notifyError(e, e.message); }
  };
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
            catch(e){ setFav(!next); notifyError(e, e.message); }
          }}>{I.star({})}</button>
        </div>
      </div>
      <div className="pad" style={{marginTop:14,textAlign:"center"}}>
        <div style={{position:"relative",width:64,margin:"0 auto"}}>
          <div className="avatar" style={{width:64,height:64,borderRadius:22,margin:"0 auto",fontSize:22}}>{displayInit}</div>
          {g!=="-"&&<span style={{position:"absolute",right:-6,bottom:-2,width:24,height:24,borderRadius:"50%",
            background:GRADE_COLOR[g],color:"#fff",fontSize:12,fontWeight:800,
            display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--paper)"}}>{g}</span>}
        </div>
        {!editingInfo ? (
          <>
            <div className="row" style={{justifyContent:"center",gap:8,marginTop:12,alignItems:"center"}}>
              <div className="h-title">{profile.person||"이름 없음"}</div>
              <button type="button" className="iconbtn" style={{width:32,height:32}} onClick={startEditInfo} aria-label="연락처 정보 수정">
                {I.edit({width:16,height:16})}
              </button>
            </div>
            {contactRoleLine(profile) && <div className="small" style={{marginTop:4,fontWeight:600}}>{contactRoleLine(profile)}</div>}
            <div className="small" style={{marginTop:2}}>{profile.co||"회사 미입력"}</div>
          </>
        ) : (
          <div style={{marginTop:12,textAlign:"left"}}>
            {profileInput("person","이름","이름")}
            {profileInput("title","직책","직책")}
            {profileInput("department","부서","부서 · 팀")}
            {profileInput("co","회사","회사명")}
          </div>
        )}
        {by && <div className="small" style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:4,
          background:"#fff",border:"1px solid var(--line)",borderRadius:20,padding:"4px 10px"}}>
          {I.users({width:13,height:13})} {by.person} 님의 소개</div>}
        <div className="row" style={{gap:10,marginTop:16}}>
          <button className="btn btn-accent" style={{flex:1,padding:13,display:"flex",justifyContent:"center",gap:7}}
            onClick={()=>profile.phone&&window.open(`tel:${profile.phone.replace(/\s/g,"")}`)} disabled={!profile.phone}>{I.phone({})} 전화</button>
          <button className="btn btn-ghost" style={{flex:1,padding:13}}
            onClick={()=>startRec({ contactIds: [c.id], contactId: c.id, companyName: profile.co || profile.person })}>{mt}</button>
        </div>
        <button type="button" className="btn" style={{width:"100%",marginTop:10,padding:13,background:"var(--ink)",color:"#fff",display:"flex",justifyContent:"center",gap:7}}
          onClick={()=>setAddingDeal(true)}>
          {I.quote({width:16,height:16})} 견적 추가
        </button>
      </div>

      <div className="pad">
        <div className="card" style={{padding:16}}>
          <div className="row between" style={{marginBottom:editingInfo?12:0}}>
            <div className="section-h" style={{marginTop:0}}>연락처 정보</div>
            {!editingInfo && (
              <button type="button" className="chip" style={{color:"var(--accent-deep)",fontSize:12}} onClick={startEditInfo}>
                {I.edit({width:13,height:13})} 수정
              </button>
            )}
          </div>
          {cardKey && !editingInfo && <CardImageThumb mediaKey={cardKey}/>}
          {editingInfo ? (
            <>
              {profileInput("phone","전화","010-0000-0000")}
              {profileInput("email","이메일","email@example.com")}
              {profileInput("area","주소","주소")}
              <div className="small" style={{display:"flex",alignItems:"center",gap:5,marginTop:-2,marginBottom:14,color:"var(--accent-deep)"}}>
                {I.pin({})} 주소를 바꾸면 위치 정보도 다시 맞춰요
              </div>
              <div className="row" style={{gap:10}}>
                <button type="button" className="btn btn-ghost" style={{flex:1,padding:12}} onClick={cancelEditInfo} disabled={infoSaving}>취소</button>
                <button type="button" className="btn btn-accent" style={{flex:1,padding:12}} onClick={saveProfile} disabled={infoSaving}>
                  {infoSaving?"저장 중…":"저장"}
                </button>
              </div>
            </>
          ) : (
            <>
              {profile.phone && <div className="brk"><span className="small">전화</span><span style={{fontWeight:600}}>{profile.phone}</span></div>}
              {profile.email && <div className="brk"><span className="small">이메일</span><span style={{fontWeight:600}}>{profile.email}</span></div>}
              {profile.area && <div className="brk"><span className="small">주소</span><span style={{fontWeight:600,textAlign:"right",maxWidth:"62%"}}>{profile.area}</span></div>}
              {!profile.phone && !profile.email && !profile.area && !cardKey && (
                <div className="small" style={{padding:"8px 0",lineHeight:1.5}}>전화·이메일·주소가 없어요. 수정 버튼으로 추가할 수 있어요.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 견적 · 매출 */}
      <div className="pad row between"><div className="section-h">견적 · 매출</div>
        <button type="button" className="chip" style={{color:"var(--accent-deep)",marginTop:22}} onClick={()=>setAddingDeal(v=>!v)}>
          {addingDeal ? "닫기" : "+ 견적"}
        </button></div>
      <div className="pad">
        {addingDeal && (
          <AddQuoteForm
            contactId={c.id}
            compact
            onCancel={()=>setAddingDeal(false)}
            onSaved={()=>{ setAddingDeal(false); reload(); onRefresh?.(); toastSuccess("견적을 등록했어요"); }}
          />
        )}
        {deals.length===0 && !deal && !addingDeal ? (
        <div className="card small" style={{padding:20,textAlign:"center",lineHeight:1.55}}>
          등록된 견적이 없어요.<br/>위 「견적 추가」로 금액과 견적서 파일을 넣을 수 있어요.
        </div>
        ) : (
        <>
        {(deal ? [deal] : deals).map(d=>{
          const { supply, vat, total } = dealAmounts(d.supplyAmount);
          return (
        <div key={d.id} className="card" style={{padding:16,marginBottom:10}}>
          <div className="row between" style={{marginBottom:4}}>
            <div className="small" style={{fontSize:11}}>{d.title}</div>
            <div className="row" style={{gap:6}}>
              <span className="tag amber">{d.stage}</span>
              <button type="button" className="iconbtn" style={{width:32,height:32}} onClick={()=>deleteDeal(d)} aria-label="딜 삭제">
                {I.trash({width:15,height:15,style:{color:"var(--muted)"}})}
              </button>
            </div>
          </div>
          <div className="row between" style={{padding:"6px 0 2px"}}>
            <span style={{fontWeight:700,fontSize:14}}>견적 금액 (VAT 포함)</span>
            <span style={{fontWeight:800,fontSize:18}}>{formatWon(total)}</span>
          </div>
          <div className="small" style={{lineHeight:1.5,color:"var(--muted)"}}>
            공급가 {formatWon(supply)} · 부가세 {formatWon(vat)}
          </div>
          {d.quoteKey ? (
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--line)"}}>
              <div className="small" style={{fontWeight:700,marginBottom:4}}>견적서</div>
              <TodoAttachmentRow att={{
                key:d.quoteKey,
                name:fileNameFromKey(d.quoteKey),
                kind:/\.(png|jpe?g|gif|webp)$/i.test(d.quoteKey)?"image":"file",
              }}/>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" style={{width:"100%",marginTop:12,padding:10,fontSize:13}}
              disabled={dealSaving} onClick={()=>attachQuoteToDeal(d)}>
              {I.plus({width:14,height:14})} 견적서 첨부
            </button>
          )}
        </div>
        );})}
        {deals.length>1 && deals.slice(1).map(d=>(
          <div key={d.id} className="card" style={{padding:14,marginBottom:8}}>
            <div className="row between">
              <div style={{minWidth:0}}>
                <span style={{fontWeight:600}}>{d.title}</span>
                <div style={{fontWeight:700,fontSize:15,marginTop:4}}>{formatWon(dealAmounts(d.supplyAmount).total)}</div>
              </div>
              <div className="row" style={{gap:6}}>
                <span className="tag amber">{d.stage}</span>
                <button type="button" className="iconbtn" style={{width:32,height:32}} onClick={()=>deleteDeal(d)} aria-label="딜 삭제">
                  {I.trash({width:15,height:15,style:{color:"var(--muted)"}})}
                </button>
              </div>
            </div>
            {d.quoteKey ? (
              <div style={{marginTop:10}}>
                <TodoAttachmentRow att={{
                  key:d.quoteKey,
                  name:fileNameFromKey(d.quoteKey),
                  kind:/\.(png|jpe?g|gif|webp)$/i.test(d.quoteKey)?"image":"file",
                }}/>
              </div>
            ) : (
              <button type="button" className="chip" style={{marginTop:10,color:"var(--accent-deep)",fontSize:12}}
                disabled={dealSaving} onClick={()=>attachQuoteToDeal(d)}>
                + 견적서
              </button>
            )}
          </div>
        ))}
        </>
        )}
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
          <div className="row between" style={{padding:"8px 0 0"}}><span className="small">미팅</span><span style={{fontWeight:600}}>{meetHistory.length||c.meets||0}회</span></div>
          {ind>0 && <div className="small" style={{marginTop:8,lineHeight:1.5}}>소개한 인맥의 성과가 1단계 50%·2단계 25%로 반영돼요.</div>}
        </div>
      </div>

      {/* 소개 관계 플로 */}
      <>
      <div className="pad"><div className="section-h">소개 관계</div></div>
      <div className="pad">
        <div className="card" style={{padding:16}}>
          {by && (
            <div className="row between" style={{gap:10,paddingBottom:12,borderBottom:kids.length?"1px solid var(--line)":"none"}}>
              <div className="row" style={{gap:10,minWidth:0}}>
                <div className="small" style={{width:64,flex:"0 0 auto"}}>소개해준</div>
                <div className="row" style={{gap:9,minWidth:0}}><div className="avatar" style={{width:32,height:32,borderRadius:10,fontSize:12}}>{by.init}</div>
                  <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{by.person}</div><div className="small" style={{fontSize:11}}>{by.co}</div></div></div>
              </div>
              <button type="button" className="chip" style={{fontSize:11,padding:"4px 10px",color:"var(--muted)",flexShrink:0}} onClick={()=>unlinkIntro(c, by.person)}>
                해제
              </button>
            </div>
          )}
          {kids.length>0 && (
            <div style={{paddingTop:by?12:0}}>
              <div className="small" style={{marginBottom:8}}>이 사람이 소개한 인맥 · {kids.length}명</div>
              {kids.map(k=>(
                <div key={k.id} className="row between" style={{padding:"8px 0",gap:8}}>
                  <div className="row" style={{gap:9,minWidth:0}}><div className="avatar" style={{width:32,height:32,borderRadius:10,fontSize:12}}>{k.init}</div>
                    <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{k.person}</div><div className="small" style={{fontSize:11}}>{k.co}</div></div></div>
                  <div className="row" style={{gap:6,flexShrink:0,alignItems:"center"}}>
                    <span className="small" style={{fontWeight:700,color:k.won?"var(--accent-deep)":"var(--muted)"}}>{wonShort(k.won||0)}</span>
                    <button type="button" className="chip" style={{fontSize:11,padding:"4px 10px",color:"var(--muted)"}} onClick={()=>unlinkIntro(k, k.person)}>
                      해제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {introSheet && (
            <ContactIntroSheet
              contact={c}
              contacts={CLIENTS}
              onClose={()=>setIntroSheet(false)}
              onSaved={()=>{ onRefresh?.(); reload(); }}
            />
          )}
          <button className="btn btn-ghost" style={{width:"100%",padding:11,marginTop:10,fontSize:13,color:"var(--accent-deep)",display:"flex",justifyContent:"center",gap:7}}
            onClick={()=>setIntroSheet(true)}>
            {I.plus({width:15,height:15})} 소개 관계 추가
          </button>
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

      <ContactGroupTagPanel
        user={user}
        onUserUpdated={onUserUpdated}
        contactPresets={contactPresets}
        contacts={CLIENTS}
        group={grp}
        tags={tags}
        onGroupChange={patchGroup}
        onTagsChange={patchTags}
        onContactsRefresh={onRefresh}
      />

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
          {meetHistory.length===0 && <div className="small" style={{textAlign:"center",padding:"20px 0"}}>{mt}이 없어요</div>}
          {meetHistory.map((m,i,a)=>{
            const d=m.createdAt?new Date(m.createdAt):null;
            const label=d?`${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`:"";
            return (
            <div key={m.id} className="row" style={{gap:13,padding:"15px 0",borderBottom:i<a.length-1?"1px solid var(--line)":"none",cursor:"pointer"}}
              onClick={()=>openMeeting?.(meetingToUi(m))}>
              <div style={{width:42,fontWeight:700,fontSize:13,color:"var(--accent-deep)"}}>{label}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13.5,lineHeight:1.5}}>{m.oneLine||"요약 없음"}</div>
                {m.mediaKey && isAudioMediaKey(m.mediaKey) && <span className="small" style={{marginTop:4,display:"inline-flex",alignItems:"center",gap:4}}>🎧 녹음 있음</span>}
              </div>
              <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
            </div>
          );})}
        </div>
      </div>
      <DeleteBar label={profile.person||profile.co||"인맥"} onDelete={()=>api.deleteContact(c.id)} afterDelete={onDeleted}/>
    </div>
  );
}

/* ---------------- MEDIA PLAYER (저장된 녹음·사진) ---------------- */
function MediaPlayer({mediaKey,compact}){
  const [url,setUrl]=useState(null);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(!!mediaKey);
  const load=useCallback(()=>{
    if(!mediaKey){ setUrl(null); setLoading(false); return; }
    setLoading(true); setErr("");
    mediaUrl(mediaKey).then(setUrl).catch((e)=>setErr(e.message||"로드 실패")).finally(()=>setLoading(false));
  },[mediaKey]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>()=>{ if(url?.startsWith("blob:")) URL.revokeObjectURL(url); },[url]);
  if(!mediaKey) return null;
  if(loading) return <div className="small" style={{padding:"12px 0"}}>녹음 불러오는 중…</div>;
  if(err) return (
    <div className="card" style={{padding:14,background:"#FFF8F6"}}>
      <div className="small" style={{color:"var(--accent-deep)",lineHeight:1.5}}>{err}</div>
      <button className="chip" style={{marginTop:10,color:"var(--accent-deep)"}} onClick={load}>다시 시도</button>
    </div>
  );
  if(isImageMediaKey(mediaKey) && url){
    return <img src={url} alt="" style={{width:"100%",borderRadius:12,maxHeight:compact?220:360,objectFit:"cover"}}/>;
  }
  if(url){
    return (
      <div className="card" style={{padding:"14px 16px",background:"#FBF9F4"}}>
        <div className="row" style={{gap:8,marginBottom:10,alignItems:"center"}}>
          {I.mic({width:16,height:16,style:{color:"var(--accent-deep)"}})}
          <span style={{fontWeight:700,fontSize:13}}>녹음 재생</span>
        </div>
        <audio controls preload="metadata" src={url} style={{width:"100%",height:44}}
          onError={()=>setErr("재생할 수 없는 형식이거나 파일이 손상됐어요")}/>
      </div>
    );
  }
  return null;
}

function MeetingAttendeesPanel({ meeting, onSave, disabled }) {
  const CLIENTS = getClients();
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState("");
  const [att, setAtt] = useState(() => meetingAttendeeIds(meeting));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setAtt(meetingAttendeeIds(meeting));
  }, [meeting.id, meeting.attendeeIds, meeting.contactId, editing]);

  const attContacts = att.map((id) => CLIENTS.find((c) => c.id === id)).filter(Boolean);
  const ql = q.trim().toLowerCase();
  const found = CLIENTS.filter((c) => {
    if (!ql) return true;
    return (c.person || "").toLowerCase().includes(ql) || (c.co || "").toLowerCase().includes(ql);
  }).slice(0, 40);

  const toggleAtt = (id) => setAtt((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(att, att[0] || null);
      setEditing(false);
      setPick(false);
      setQ("");
      toastSuccess("참석자를 저장했어요");
    } catch (e) {
      notifyError(e, e.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="card"
        style={{ padding: 14, marginBottom: 14, width: "100%", textAlign: "left", cursor: disabled ? "default" : "pointer" }}
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
      >
        <div className="row between" style={{ gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 8, color: "var(--muted)" }}>
              참석자{!disabled ? " · 탭해서 수정" : ""}
            </div>
            {attContacts.length === 0 ? (
              <div className="small" style={{ color: "var(--muted)" }}>참석자 없음</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {attContacts.map((c) => (
                  <div key={c.id} className="row" style={{ gap: 10 }}>
                    <div className="avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 13 }}>{c.init}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.person || c.co || "이름 없음"}</div>
                      {(contactRoleLine(c) || (c.person && c.co)) && (
                        <div className="small">{[contactRoleLine(c), c.person && c.co ? c.co : null].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                  </div>
                ))}
                {meeting.createdLabel && (
                  <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>{meeting.createdLabel}</div>
                )}
              </div>
            )}
            {attContacts.length === 0 && meeting.createdLabel && (
              <div className="small" style={{ marginTop: 6 }}>{meeting.createdLabel}</div>
            )}
          </div>
          {!disabled && <span style={{ color: "var(--muted)", flex: "0 0 auto", marginTop: 2 }}>{I.edit({})}</span>}
        </div>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>참석자 수정</div>
        <button type="button" className="chip" style={{ padding: "4px 10px", fontSize: 12, color: "var(--muted)" }}
          onClick={() => { setEditing(false); setPick(false); setQ(""); setAtt(meetingAttendeeIds(meeting)); }}>
          취소
        </button>
      </div>
      <div className="row" style={{ gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
        {att.map((id) => {
          const c = CLIENTS.find((x) => x.id === id);
          if (!c) return null;
          return (
            <span key={id} className="tag" style={{ padding: "7px 10px", fontSize: 12.5, gap: 6 }}>
              {c.person || c.co}
              <span onClick={() => toggleAtt(id)} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>
            </span>
          );
        })}
        <button type="button" className="chip" style={{ padding: "7px 11px", color: "var(--accent-deep)", borderColor: "#F3D8CB" }}
          onClick={() => setPick((p) => !p)}>+ 참석자</button>
      </div>
      {pick && (
        <div className="card fade" style={{ padding: "12px 14px 4px", marginBottom: 10, background: "#FBFAF7" }}>
          <div className="row" style={{ gap: 9, background: "#F4F1EA", borderRadius: 11, padding: "10px 12px", color: "var(--muted)" }}>
            {I.search({ width: 16, height: 16 })}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 회사 검색"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)" }}
            />
            {q && <span onClick={() => setQ("")} style={{ cursor: "pointer" }}>✕</span>}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 4 }}>
            {found.length === 0 && <div className="small" style={{ textAlign: "center", padding: "22px 0" }}>검색 결과 없음</div>}
            {found.map((c) => (
              <div key={c.id} className="list-item row between" style={{ padding: "11px 0", cursor: "pointer" }} onClick={() => toggleAtt(c.id)}>
                <div className="row" style={{ gap: 10 }}>
                  <div className="avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 13 }}>{c.init}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.person || c.co}</div>
                    <div className="small" style={{ fontSize: 11.5 }}>{[contactRoleLine(c), c.co].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <Checkbox on={att.includes(c.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="btn btn-accent" style={{ width: "100%", padding: 12 }} disabled={saving} onClick={save}>
        {saving ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}

function MeetingAttachmentsPanel({ meeting, disabled, onUpdated }) {
  const imageKeys = meeting.imageKeys || [];
  const photoNotes = meeting.photoNotes || [];
  const [urls, setUrls] = useState({});
  const [uploading, setUploading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [draftNotes, setDraftNotes] = useState({});
  const [galleryIdx, setGalleryIdx] = useState(null);

  useEffect(() => {
    let alive = true;
    imageKeys.forEach((key) => {
      mediaUrl(key)
        .then((u) => { if (alive) setUrls((p) => ({ ...p, [key]: u })); })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [imageKeys.join("|")]);

  useEffect(() => {
    const next = {};
    photoNotes.forEach((pn) => { if (pn.key) next[pn.key] = pn.note || ""; });
    setDraftNotes(next);
  }, [photoNotes.map((p) => `${p.key}:${p.note || ""}`).join("|")]);

  const noteFor = (key) => draftNotes[key] ?? photoNotes.find((p) => p.key === key)?.note ?? "";
  const galleryUrls = imageKeys.map((key) => urls[key]).filter(Boolean);

  const openGallery = (key) => {
    const url = urls[key];
    if (!url) return;
    const idx = galleryUrls.indexOf(url);
    if (idx >= 0) setGalleryIdx(idx);
  };

  const addPhoto = async () => {
    if (!meeting.id || uploading || disabled) return;
    try {
      const file = await pickImageFile(true);
      setUploading(true);
      const imageKey = await uploadFile(file);
      const m = await api.addMeetingAttachment(meeting.id, { imageKey });
      onUpdated?.(meetingToUi(m));
      toastSuccess("사진을 추가했어요");
    } catch (e) {
      if (!isPickCancelled(e)) notifyError(e, e.message || "사진 추가 실패");
    } finally {
      setUploading(false);
    }
  };

  const saveNote = async (key) => {
    if (!meeting.id || savingKey) return;
    const note = (draftNotes[key] ?? "").trim();
    setSavingKey(key);
    try {
      const m = await api.updateMeetingAttachmentNote(meeting.id, { key, note });
      onUpdated?.(meetingToUi(m));
    } catch (e) {
      notifyError(e, e.message || "메모 저장 실패");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {galleryIdx != null && galleryUrls.length > 0 && (
        <PhotoGallery urls={galleryUrls} initialIndex={galleryIdx} onClose={() => setGalleryIdx(null)} />
      )}
      <div className="section-h" style={{ marginTop: 0 }}>현장 사진 · 메모</div>
      <div className="card" style={{ padding: 14 }}>
        <div className="small" style={{ lineHeight: 1.55, color: "var(--muted)", marginBottom: 12 }}>
          {meeting.isProcessing
            ? "변환 중에도 사진과 캡션을 추가할 수 있어요."
            : "추가 사진·캡션이 필요하면 여기서 남길 수 있어요."}
        </div>
        {imageKeys.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {imageKeys.map((key) => (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => openGallery(key)}
                  disabled={!urls[key]}
                  aria-label="사진 크게 보기"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#ECE8E0",
                    border: "none",
                    padding: 0,
                    cursor: urls[key] ? "pointer" : "default",
                  }}
                >
                  {urls[key] ? (
                    <img src={urls[key]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div className="small" style={{ padding: 8, color: "var(--muted)" }}>…</div>
                  )}
                </button>
                <div style={{ minWidth: 0 }}>
                  <input
                    value={noteFor(key)}
                    onChange={(e) => setDraftNotes((p) => ({ ...p, [key]: e.target.value }))}
                    onBlur={() => saveNote(key)}
                    placeholder="캡션 (선택)"
                    disabled={disabled || savingKey === key}
                    style={{
                      width: "100%",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="chip"
          style={{ padding: "8px 12px", color: "var(--accent-deep)" }}
          onClick={addPhoto}
          disabled={disabled || uploading}
        >
          {uploading ? "업로드 중…" : (<>{I.plus({ width: 14, height: 14 })} 사진 추가</>)}
        </button>
      </div>
    </div>
  );
}

function MeetingTextMemoPanel({ meeting, disabled, onUpdated }) {
  const [draft, setDraft] = useState(meeting.textMemo || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(meeting.textMemo || "");
  }, [meeting.id, meeting.textMemo]);

  const saveMemo = async () => {
    if (!meeting.id || saving || disabled) return;
    const text = draft.trim();
    if (text === (meeting.textMemo || "").trim()) return;
    setSaving(true);
    try {
      const m = await api.updateMeetingTextMemo(meeting.id, text);
      onUpdated?.(meetingToUi(m));
    } catch (e) {
      notifyError(e, e.message || "메모 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="section-h">텍스트 메모</div>
      <div className="card" style={{ padding: 14 }}>
        <div className="small" style={{ lineHeight: 1.55, color: "var(--muted)", marginBottom: 10 }}>
          {meeting.isProcessing
            ? "변환 중에도 짧은 메모를 남길 수 있어요. 요약·전사에 반영됩니다."
            : "회의 중 적어둔 메모·메모장 내용을 그대로 붙여넣을 수 있어요."}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveMemo}
          placeholder="예: 다음 주 재연락 · 예산 5천만 검토 중 · A사 경쟁사 언급"
          disabled={disabled || saving}
          rows={4}
          style={{
            width: "100%",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "12px 13px",
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: 1.55,
            resize: "vertical",
            minHeight: 96,
            color: "var(--ink)",
            background: "#fff",
          }}
        />
        {saving && (
          <div className="small" style={{ marginTop: 8, color: "var(--muted)" }}>저장 중…</div>
        )}
      </div>
    </div>
  );
}

function MeetingDetailView({data,back,refreshTodos,onDeleted,meetingPresets={categories:[],tags:[]},openEvent}){
  const seed=data||{};
  const [meeting,setMeeting]=useState(seed);
  const [meetingTodos,setMeetingTodos]=useState([]);
  const [loading,setLoading]=useState(!!seed.id);
  const [retrying,setRetrying]=useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const [metaTags,setMetaTags]=useState(seed.tags||[]);
  const [category,setCategory]=useState(seed.category||"");
  const shareRole=meeting.shareRole||meeting._raw?.shareRole||"owner";
  const canEdit=shareRole==="owner"||shareRole==="editor";
  const isOwner=shareRole==="owner";
  const reloadMeeting=useCallback(()=>{
    if(!seed.id) return Promise.resolve();
    return api.getMeeting(seed.id).then((m)=>{
      const ui=meetingToUi(m);
      setMeeting(ui);
      setMetaTags(ui.tags||[]);
      setCategory(ui.category||"");
      setMeetingTodos((m.todos||[]).map(todoToUi));
      return ui;
    }).catch(()=>{});
  },[seed.id]);
  useEffect(()=>{
    if(!seed.id){ setLoading(false); return; }
    setLoading(true);
    reloadMeeting().finally(()=>setLoading(false));
  },[seed.id, reloadMeeting]);
  useEffect(()=>{
    if(!meeting.isProcessing || !meeting.id) return;
    let cancelled=false;
    const tick=async ()=>{
      const ui=await reloadMeeting();
      if(cancelled || !ui) return;
      if(ui.processStatus==="done"){
        removePendingMeeting(meeting.id);
        toastSuccess("녹음 변환이 완료됐어요");
        refreshTodos?.();
      }else if(ui.processStatus==="error"){
        removePendingMeeting(meeting.id);
        toastError(friendlyAiError(ui.processError));
      }
    };
    tick();
    const iv=setInterval(tick,4000);
    return ()=>{ cancelled=true; clearInterval(iv); };
  },[meeting.id, meeting.isProcessing, reloadMeeting, refreshTodos]);
  const retryConversion=async ()=>{
    if(!meeting.id || retrying) return;
    setRetrying(true);
    try{
      await api.retryMeeting(meeting.id);
      addPendingMeeting(meeting.id);
      setMeeting((p)=>({ ...p, isProcessing:true, isFailed:false, processError:"", oneLine:"녹음 변환 중…", t:"녹음 변환 중…" }));
      toastSuccess("다시 변환을 시작했어요");
      refreshTodos?.();
    }catch(e){
      notifyError(e, friendlyAiError(e.message)||"다시 시도 실패");
    }finally{ setRetrying(false); }
  };
  const patchMeeting=async (body)=>{
    if(!meeting.id || !canEdit) return;
    const m=await api.updateMeeting(meeting.id,body);
    const ui=meetingToUi(m);
    setMeeting(ui);
    setMetaTags(ui.tags||[]);
    setCategory(ui.category||"");
  };
  const toggleMetaTag=async (t)=>{
    const next=metaTags.includes(t)?metaTags.filter(x=>x!==t):[...metaTags,t];
    setMetaTags(next);
    try{ await patchMeeting({ tags: next }); }catch(e){ notifyError(e); setMetaTags(metaTags); }
  };
  const setMeetingCategory=async (c)=>{
    const next=category===c?"":c;
    setCategory(next);
    try{ await patchMeeting({ category: next||null }); }catch(e){ notifyError(e); setCategory(category); }
  };
  const s=meeting.summary||meeting._raw?.summary;
  const mediaKey=meeting.mediaKey||meeting._raw?.mediaKey;
  const peopleLabel=meetingPeopleLabel(meeting, getClients());
  const displayTodos=meetingTodos.length
    ? meetingTodos
    : (s?.actions||[]).map((a,i)=>({id:`action-${i}`,t:a.task,due:a.due?formatWhen(a.due):"-",status:"todo",done:false,pseudo:true}));
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="기록" title={peopleLabel||meeting.oneLine||"미팅 기록"}/>
      <div className="pad row between" style={{marginTop:-2,marginBottom:6}}>
        <div className="small" style={{lineHeight:1.5,color:"var(--muted)"}}>
          {meeting.isShared && meeting.sharedBy
            ? `${meeting.sharedBy.name||meeting.sharedBy.email}님과 공유 · ${shareRole==="editor"?"편집":"뷰어"}`
            : isOwner ? "나의 기록" : ""}
        </div>
        {isOwner && meeting.id && (
          <button type="button" className="chip" style={{color:"var(--accent-deep)"}} onClick={()=>setShareOpen(true)}>공유</button>
        )}
      </div>
      <ShareSheet open={shareOpen} onClose={()=>setShareOpen(false)} resourceType="meeting" resourceId={meeting.id} title={peopleLabel||meeting.oneLine||"미팅"} />
      <div className="pad" style={{marginTop:12,marginBottom:16}}>
        {meeting.isProcessing && (
          <div className="card small" style={{padding:14,marginBottom:14,lineHeight:1.55,background:"#E8F0FF",border:"1px solid #C5D8F5",color:"#3A6BB5"}}>
            ⏳ 변환 중이에요. 아래에서 사진·메모를 추가할 수 있어요.
          </div>
        )}
        {meeting.isFailed && (
          <div className="card small" style={{padding:14,marginBottom:14,lineHeight:1.55,background:"#FCEAE6",border:"1px solid #F0D4C8",color:"#B85C4A"}}>
            <div style={{fontWeight:700,marginBottom:6}}>변환에 실패했어요</div>
            <div>{friendlyAiError(meeting.processError) || "알 수 없는 오류"}</div>
            {meeting.hasAudio && <div style={{marginTop:8,color:"var(--muted)"}}>녹음 파일은 저장되어 있어요.</div>}
            {(meeting.hasAudio || meeting.mediaKey) && (
              <button
                type="button"
                className="btn btn-accent"
                style={{width:"100%",marginTop:14,padding:12,fontSize:14}}
                disabled={retrying}
                onClick={retryConversion}
              >
                {retrying ? "다시 시도 중…" : "다시 변환하기"}
              </button>
            )}
          </div>
        )}
        {loading && <div className="small" style={{textAlign:"center",padding:12}}>불러오는 중…</div>}
        {meeting.eventId && meeting.eventTitle && (
          <button type="button" className="card row between" style={{padding:14,marginBottom:14,width:"100%",textAlign:"left",cursor:"pointer"}}
            onClick={()=>{
              const rawEv=meeting._raw?.event;
              if(rawEv) openEvent?.(eventToUi({...rawEv,contactIds:rawEv.contactIds||[]}));
              else openEvent?.(eventToUi({id:meeting.eventId,title:meeting.eventTitle,startsAt:meeting.eventStartsAt||new Date().toISOString(),endsAt:null,place:"",category:"일정",contactIds:[]}));
            }}>
            <div>
              <div className="small" style={{fontWeight:700,marginBottom:4}}>연결된 일정</div>
              <div style={{fontWeight:700,fontSize:14.5}}>📅 {meeting.eventTitle}</div>
              {meeting.eventStartsAt && <div className="small" style={{marginTop:4}}>{formatWhen(meeting.eventStartsAt)}</div>}
            </div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </button>
        )}
        <MeetingAttendeesPanel
          meeting={meeting}
          disabled={loading || !meeting.id || !canEdit}
          onSave={async (attendees, contactId) => {
            await patchMeeting({ attendees, contactId });
          }}
        />
        <div className="section-h" style={{marginTop:0}}>분류 · 태그</div>
        <div className="card" style={{padding:14,marginBottom:14,opacity:canEdit?1:.75}}>
          <div className="small" style={{fontWeight:700,marginBottom:8}}>카테고리</div>
          <div className="row" style={{gap:7,flexWrap:"wrap",marginBottom:12}}>
            {(meetingPresets.categories||[]).map((c)=>(
              <button key={c} type="button" className={"chip"+(category===c?" on":"")} style={{padding:"6px 12px",fontSize:12}}
                disabled={!canEdit}
                onClick={()=>setMeetingCategory(c)}>{c}</button>
            ))}
            {!meetingPresets.categories?.length && <span className="small">설정 → 카테고리 · 태그에서 추가하세요</span>}
          </div>
          <div className="small" style={{fontWeight:700,marginBottom:8}}>태그</div>
          <div className="row" style={{gap:7,flexWrap:"wrap"}}>
            {(meetingPresets.tags||[]).map((t)=>(
              <button key={t} type="button" className={"chip"+(metaTags.includes(t)?" on":"")} style={{padding:"6px 12px",fontSize:12}}
                disabled={!canEdit}
                onClick={()=>toggleMetaTag(t)}>#{t}</button>
            ))}
          </div>
        </div>
        <div className="section-h" style={{marginTop:0}}>{mediaKey?(isAudioMediaKey(mediaKey)?"녹음 듣기":"첨부 미디어"):"녹음"}</div>
        {mediaKey ? (
          <div style={{marginBottom:14}}><MediaPlayer mediaKey={mediaKey}/></div>
        ) : (
          <div className="card small" style={{padding:16,marginBottom:14,lineHeight:1.55,color:"var(--muted)"}}>
            저장된 녹음 파일이 없어요. (요약만 저장된 기록이거나 사진 기록일 수 있어요)
          </div>
        )}
        {meeting.id && meeting.source !== "photo" && (
          <MeetingAttachmentsPanel
            meeting={meeting}
            disabled={loading || !meeting.id || !canEdit}
            onUpdated={(ui) => {
              setMeeting(ui);
              setMetaTags(ui.tags || []);
              setCategory(ui.category || "");
            }}
          />
        )}
        {meeting.id && meeting.source !== "photo" && (
          <MeetingTextMemoPanel
            meeting={meeting}
            disabled={loading || !meeting.id || !canEdit}
            onUpdated={(ui) => {
              setMeeting(ui);
              setMetaTags(ui.tags || []);
              setCategory(ui.category || "");
            }}
          />
        )}
        {!meeting.isFailed && !meeting.isProcessing && (
          <MeetingInsights summary={s} oneLine={meeting.oneLine||s?.one_line}/>
        )}
        {!meeting.isFailed && !meeting.isProcessing && meeting.id && (
          <MeetingAskPanel
            meetingId={meeting.id}
            disabled={loading}
            hasContext={!!(s?.utterances?.length || s?.key_points?.length || s?.one_line || meeting.oneLine)}
          />
        )}
        {!meeting.isFailed && !meeting.isProcessing && displayTodos.length>0 && (
          <>
            <div className="section-h" style={{marginTop:16}}>이 미팅에서 나온 할 일</div>
            {meetingTodos.length>0 ? (
              <div style={{marginBottom:14}}>
                <NestedTodoList
                  todos={meetingTodos}
                  meetings={[meeting]}
                  onRefresh={async ()=>{ await reloadMeeting(); refreshTodos?.(); }}
                  showAdd={false}
                  editable
                  compact
                  groupBySource={false}
                />
              </div>
            ) : (
              <div className="card" style={{padding:"4px 16px",marginBottom:14}}>
                {displayTodos.map((todo,i)=>(
                  <div key={todo.id||i} className="row between" style={{padding:"13px 0",borderBottom:i<displayTodos.length-1?"1px solid var(--line)":"none",gap:10,opacity:.85}}>
                    <span style={{fontWeight:600,fontSize:14,lineHeight:1.4}}>{todo.t}</span>
                    {todo.due&&todo.due!=="-" && <span className="tag gray" style={{flex:"0 0 auto",fontSize:11}}>{todo.due}</span>}
                  </div>
                ))}
                <div className="small" style={{padding:"10px 0 4px",lineHeight:1.5,color:"var(--muted)"}}>
                  할 일 목록에 저장되면 수정할 수 있어요. 잠시 후 새로고침해 보세요.
                </div>
              </div>
            )}
          </>
        )}
        {s?.next_meeting?.date && (
          <>
            <div className="section-h" style={{marginTop:16}}>다음 약속</div>
            <div className="card row between" style={{padding:16}}>
              <div className="row" style={{gap:13}}>
                <div style={{width:46,height:46,borderRadius:14,background:"var(--green-soft)",color:"var(--green)",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:"0 0 auto"}}>
                  <span style={{fontSize:10,fontWeight:700}}>{s.next_meeting.date.split("-")[1]}월</span>
                  <span style={{fontSize:18,fontWeight:800,lineHeight:1}}>{s.next_meeting.date.split("-")[2]}</span>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14.5}}>{meeting.contact?.company||peopleLabel||"다음 미팅"}</div>
                  <div className="small">{s.next_meeting.time||""}{s.next_meeting.place?` · ${s.next_meeting.place}`:""}</div>
                </div>
              </div>
              {I.cal({width:20,height:20,style:{color:"var(--muted)"}})}
            </div>
          </>
        )}
      </div>
      {meeting.id && isOwner && (
        <DeleteBar label={meeting.oneLine||"미팅 기록"} onDelete={()=>api.deleteMeeting(meeting.id)} afterDelete={onDeleted}/>
      )}
    </div>
  );
}

/* ---------------- RECORD + SUMMARY ---------------- */
function RecordScreen({phase,secs,mmss,hl,setHl,onRunInBackground,todos,toggleTodo,goClients,summary,mediaKey,user,onStartLive,onCancelLive,onBack,recordLink}){
  const CLIENTS=getClients();
  const [att,setAtt]=useState(()=>{
    if(recordLink?.contactIds?.length) return [...recordLink.contactIds];
    if(recordLink?.contactId) return [recordLink.contactId];
    return [];
  });
  const [pick,setPick]=useState(false);
  const [q,setQ]=useState("");
  /** null=선택 전 | rec | upload | photo */
  const [inputMode,setInputMode]=useState(null);
  const liveOn=phase==="rec";
  const [photos,setPhotos]=useState([]);
  const [audioFile,setAudioFile]=useState(null);
  const [audioDur,setAudioDur]=useState(0);
  const [finishing,setFinishing]=useState(false);
  const [interrupted,setInterrupted]=useState(false);
  const [photoGalleryIdx,setPhotoGalleryIdx]=useState(null);
  const recorderRef=useRef(null);
  const importTriggeredRef=useRef(false);
  const toggleAtt=(id)=>setAtt(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const found=CLIENTS.filter(c=>(c.person+c.co).toLowerCase().includes(q.trim().toLowerCase()));
  const primary=CLIENTS.find(c=>att.includes(c.id))||null;
  const finishLabel=finishing
    ? (inputMode==="upload" ? "변환 중…" : "종료 중…")
    : (inputMode==="upload" ? "가져와서 변환" : "미팅 종료");
  const photoPreviewUrls=photos.map(p=>p.preview).filter(Boolean);

  const resetChoose=()=>{
    setInputMode(null);
    setAudioFile(null);
    setAudioDur(0);
    setInterrupted(false);
    setPhotos([]);
  };

  const cancelLive=()=>{
    onCancelLive?.();
    resetChoose();
  };

  useEffect(()=>{ if(phase==="setup"||phase==="sum") setFinishing(false); },[phase]);

  useEffect(()=>{
    const ids=recordLink?.contactIds?.length
      ? [...recordLink.contactIds]
      : recordLink?.contactId
        ? [recordLink.contactId]
        : [];
    if(ids.length) setAtt(ids);
  },[recordLink]);

  useEffect(()=>{
    if(!recordLink?.importAudio || inputMode || liveOn || importTriggeredRef.current) return;
    importTriggeredRef.current=true;
    importAudio();
  },[recordLink?.importAudio, inputMode, liveOn]);

  useEffect(()=>{
    if(!recordLink?.importAudio) importTriggeredRef.current=false;
  },[recordLink?.importAudio]);

  useEffect(()=>{
    if(!liveOn) return;
    setInterrupted(false);
    const onInterruptedRef=()=>{
      setInterrupted(true);
      onCancelLive?.();
      setInputMode(null);
    };
    const rec=new AudioRecorder({
      onInterrupted: ()=>onInterruptedRef(),
    });
    recorderRef.current=rec;
    rec.start().catch(e=>toastError("마이크 권한이 필요합니다: "+e.message));
    return ()=>{ rec.dispose(); };
  },[liveOn]);

  const canAddPhotos=!(user?.isTrial||user?.allowFileUpload===false);

  const addPhoto=async ()=>{
    if(!canAddPhotos) return;
    try{
      const file=await pickImageFile(true);
      const preview=URL.createObjectURL(file);
      const atSec=liveOn?secs:undefined;
      setPhotos(p=>[...p,{file,preview,note:"",atSec,...(liveOn?{uploading:true}:{})}]);
      if(!liveOn) return;
      try{
        const mediaKey=await uploadFile(file);
        setPhotos(p=>p.map(x=>x.preview===preview?{...x,mediaKey,uploading:false}:x));
      }catch(e){
        setPhotos(p=>p.filter(x=>x.preview!==preview));
        URL.revokeObjectURL(preview);
        throw e;
      }
    }catch(e){ if(!isPickCancelled(e)) notifyError(e, e.message); }
  };

  const setPhotoNote=(i,note)=>setPhotos(p=>p.map((x,k)=>k===i?{...x,note}:x));
  const removePhoto=(i)=>setPhotos(p=>p.filter((_,k)=>k!==i));

  const importAudio=async ()=>{
    try{
      const file=await pickImportAudioFile();
      setAudioFile(file);
      setInputMode("upload");
      setAudioDur(0);
      const dur=await audioDurationSec(file);
      setAudioDur(dur);
    }catch(e){ if(!isPickCancelled(e)) notifyError(e, e.message); }
  };

  const startLive=()=>{
    setPhotos([]);
    setInputMode("rec");
    onStartLive?.();
  };

  const formatBytes=(n)=>{
    if(n<1024) return `${n}B`;
    if(n<1024*1024) return `${(n/1024).toFixed(1)}KB`;
    return `${(n/(1024*1024)).toFixed(1)}MB`;
  };

  const finish=async ()=>{
    if(finishing) return;
    setFinishing(true);
    const mode=liveOn?(inputMode||"rec"):inputMode;
    try{
      let blob;
      let nativeMediaKey;
      let nativeDurationSec;
      if(mode==="rec"){
        if(photos.some(p=>p.uploading)) throw new Error("사진 업로드가 끝날 때까지 잠시만 기다려주세요");
        if(!recorderRef.current) throw new Error("녹음이 준비되지 않았습니다");
        const recording=await recorderRef.current.stop();
        if(isNativeRecordingResult(recording)){
          nativeMediaKey=recording.mediaKey;
          nativeDurationSec=recording.durationSec??secs;
        }else{
          blob=recording;
        }
        const tooLong=recordingTooLong(nativeDurationSec??secs);
        if(tooLong) throw new Error(tooLong);
      }else if(mode==="upload"){
        if(!audioFile) throw new Error("녹음 파일을 선택해주세요");
        const maxAudio=150*1024*1024;
        if(audioFile.size>maxAudio){
          const mb=(audioFile.size/(1024*1024)).toFixed(1);
          throw new Error(`파일이 너무 큽니다 (${mb}MB · 최대 150MB)`);
        }
        const tooLong=recordingTooLong(audioDur);
        if(tooLong) throw new Error(tooLong);
      }else if(mode==="photo"){
        if(!photos.length) throw new Error("사진을 추가해주세요");
      }else{
        throw new Error("녹음 방식을 확인할 수 없습니다. 다시 시도해주세요.");
      }
      await onRunInBackground({
        mode,
        attendees: att.length ? att : (recordLink?.contactId ? [recordLink.contactId] : recordLink?.contactIds?.length ? [...recordLink.contactIds] : []),
        contactId: primary?.id || recordLink?.contactId || recordLink?.contactIds?.[0] || att[0] || null,
        companyName: primary?.co || recordLink?.companyName || null,
        eventId: recordLink?.eventId??null,
        secs,
        audioDur,
        audioFile,
        photos,
        blob,
        nativeMediaKey,
        nativeDurationSec,
      });
    }catch(e){
      notifyError(e, e.message||"업로드 실패");
      setFinishing(false);
    }
  };

  if(phase==="sum") return <Summary todos={todos} toggleTodo={toggleTodo} goClients={goClients} att={att} summary={summary} mediaKey={mediaKey}/>;
  // 입력 화면
  return (
    <div className="fade" style={{padding:"24px 24px 30px"}}>
      {photoGalleryIdx!=null && photoPreviewUrls.length>0 && (
        <PhotoGallery urls={photoPreviewUrls} initialIndex={photoGalleryIdx} onClose={()=>setPhotoGalleryIdx(null)}/>
      )}
      <div className="row between" style={{alignItems:"center"}}>
        <button type="button" className="chip" style={{color:"var(--muted)",padding:"6px 10px"}} onClick={onBack}>← 돌아가기</button>
        <div className="h-eyebrow" style={{textAlign:"center",flex:1}}>새 기록{primary?` · ${primary.co||primary.person}`:""}</div>
        <span style={{width:72}}/>
      </div>
      {recordLink?.eventTitle && (
        <div className="card fade" style={{padding:"12px 14px",marginTop:14,background:"#E8F0FF",border:"1px solid #C5D8F5"}}>
          <div className="small" style={{color:"#3A6BB5",lineHeight:1.55,fontWeight:600}}>
            📅 <span style={{fontWeight:700}}>{recordLink.eventTitle}</span> 일정에 연결됩니다
          </div>
        </div>
      )}
      {/* 참석자 태그 */}
      <div style={{marginTop:16}}>
        <div className="small" style={{fontWeight:700,marginBottom:8}}>참석자</div>
        {att.length===0 && !pick && (
          <div className="small" style={{marginBottom:8,color:"var(--muted)",lineHeight:1.5}}>+ 참석자로 미팅에 참여한 인맥만 선택하세요.</div>
        )}
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

      {!inputMode && !liveOn ? (
      <>
      {interrupted && (
        <div className="card fade" style={{padding:"12px 14px",marginTop:14,background:"#FFF8F6",border:"1px solid #F3D8CB"}}>
          <div className="small" style={{color:"var(--accent-deep)",lineHeight:1.55,fontWeight:600}}>
            녹음이 중단됐어요. 다시 시작하거나 파일을 올려주세요.
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:22}}>
        <button className="btn btn-accent" style={{padding:"22px 12px",fontSize:14,flexDirection:"column",gap:8,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={startLive}>
          {I.mic({width:24,height:24})}
          <span>녹음 시작</span>
        </button>
        <button className="btn" style={{padding:"22px 12px",fontSize:14,background:"var(--ink)",color:"#fff",flexDirection:"column",gap:8,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={importAudio}>
          {I.download({width:24,height:24})}
          <span>녹음 가져오기</span>
        </button>
      </div>
      <div className="card" style={{padding:"14px 16px",marginTop:14,background:"#FBF9F4",border:"1px solid var(--line)"}}>
        <div className="small" style={{lineHeight:1.6,color:"var(--muted)"}}>
          <b style={{color:"var(--ink)"}}>통화 녹음 · 보이스 메모</b> — 휴대폰에 저장된 m4a, mp3, wav 파일을 골라 전사·요약해요.
          {isNativeShell() ? " iPhone은 Files·통화 녹음에서, LG 등은 녹음 폴더에서 선택하세요." : " 파일 선택 창에서 가져올 녹음을 고르세요."}
        </div>
      </div>
      {!(user?.isTrial||user?.allowFileUpload===false) && (
        <button type="button" className="chip" style={{display:"block",width:"fit-content",margin:"16px auto 0",color:"var(--muted)"}}
          onClick={()=>setInputMode("photo")}>사진 · 문서로 기록</button>
      )}
      {user?.isTrial && <div className="small" style={{marginTop:12,textAlign:"center",color:"#8a6d3b"}}>
        체험 중: 녹음·음성 파일 1시간 한도
      </div>}
      </>
      ) : liveOn ? (
      <>
      {interrupted && !isNativeShell() && (
        <div className="card fade" style={{padding:"12px 14px",marginTop:14,background:"#FFF8F6",border:"1px solid #F3D8CB"}}>
          <div className="small" style={{color:"var(--accent-deep)",lineHeight:1.55,fontWeight:600}}>
            녹음이 중단됐어요. 폰을 잠그거나 다른 앱으로 나가면 녹음이 멈출 수 있어요.
          </div>
        </div>
      )}
      <div className="card" style={{padding:"11px 14px",marginTop:14,background:"#FBF9F4",border:"1px solid var(--line)"}}>
        <div className="small" style={{lineHeight:1.5,textAlign:"center"}}>
          {isNativeShell()
            ? "녹음 중 · 잠금 화면에서도 계속 녹음됩니다"
            : "녹음 중 · 화면을 켜 두거나 앱(WebView)에서는 백그라운드 녹음 가능"}
        </div>
      </div>
      <div style={{position:"relative",width:150,height:150,margin:"24px auto 0"}}>
        <span style={{position:"absolute",inset:0,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s ease-out infinite"}}/>
        <span style={{position:"absolute",inset:0,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s ease-out infinite",animationDelay:"1s"}}/>
        <div style={{position:"absolute",inset:32,borderRadius:"50%",background:"var(--accent)",
          display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 14px 30px -8px rgba(221,94,57,.6)"}}>
          {I.mic({width:32,height:32})}
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:38,fontWeight:700,letterSpacing:".02em",marginTop:26,fontVariantNumeric:"tabular-nums"}}>{mmss(secs)}</div>
      <div className="row" style={{justifyContent:"center",gap:4,height:34,marginTop:14}}>
        {Array.from({length:21}).map((_,i)=>(
          <span key={i} style={{width:4,height:"100%",borderRadius:3,background:"var(--accent)",opacity:.85,
            transformOrigin:"center",animation:`bars ${0.7+(i%5)*0.18}s ease-in-out infinite`,animationDelay:`${i*0.05}s`}}/>
        ))}
      </div>
      <div className="row" style={{gap:12,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1,padding:14,display:"flex",justifyContent:"center",gap:7,color:"var(--accent-deep)"}}
          onClick={()=>setHl(h=>h+1)}>{I.star({})} 하이라이트{hl>0?` ${hl}`:""}</button>
        <button className="btn btn-ghost" style={{flex:1,padding:14,color:"var(--muted)"}}
          onClick={()=>{ if(confirm("녹음을 취소할까요?")) cancelLive(); }}>취소</button>
      </div>
      {canAddPhotos && (
        <div style={{marginTop:18}}>
          <div className="row between" style={{alignItems:"center",marginBottom:4}}>
            <div className="small" style={{fontWeight:700}}>현장 사진 · 캡션{photos.length?` (${photos.length})`:""}</div>
            <button type="button" className="chip" style={{padding:"6px 10px",fontSize:12,color:"var(--accent-deep)"}}
              onClick={addPhoto}>📷 촬영</button>
          </div>
          {photos.length>0 && (
            <div className="small" style={{color:"var(--muted)",marginBottom:8}}>탭하면 크게 보기</div>
          )}
          {photos.length>0 && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {photos.map((p,i)=>(
                <div key={p.preview||i}>
                  <div style={{aspectRatio:"1/1",borderRadius:14,background:"#ECE8E0",position:"relative",overflow:"hidden"}}>
                    <button type="button" disabled={p.uploading} aria-label="사진 크게 보기"
                      onClick={()=>!p.uploading&&setPhotoGalleryIdx(i)}
                      style={{position:"absolute",inset:0,border:"none",padding:0,borderRadius:14,overflow:"hidden",
                        cursor:p.uploading?"default":"pointer",background:"transparent"}}>
                      <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover",opacity:p.uploading?0.6:1}}/>
                    </button>
                    {p.uploading && (
                      <div className="small" style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                        background:"rgba(255,255,255,.55)",color:"var(--accent-deep)",fontWeight:600,fontSize:11,pointerEvents:"none"}}>업로드 중…</div>
                    )}
                    {!p.uploading && (
                      <span onClick={()=>removePhoto(i)}
                        style={{position:"absolute",top:5,right:5,zIndex:2,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,.5)",
                          color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>✕</span>
                    )}
                    {p.atSec!=null && (
                      <span className="small" style={{position:"absolute",left:5,bottom:5,zIndex:2,padding:"2px 6px",borderRadius:6,
                        background:"rgba(0,0,0,.45)",color:"#fff",fontSize:10,fontVariantNumeric:"tabular-nums",pointerEvents:"none"}}>{mmss(p.atSec)}</span>
                    )}
                  </div>
                  <input value={p.note||""} onChange={e=>setPhotoNote(i,e.target.value)} placeholder="캡션 (선택)"
                    style={{width:"100%",marginTop:6,border:"1px solid var(--line)",borderRadius:10,padding:"7px 9px",fontFamily:"inherit",fontSize:12}}/>
                </div>
              ))}
            </div>
          )}
          {photos.length===0 && (
            <div className="small" style={{color:"var(--muted)",lineHeight:1.5}}>미팅 중 화이트보드·자료를 촬영해 두세요. 사진 없이 종료해도 돼요.</div>
          )}
        </div>
      )}
      <button className="btn" style={{width:"100%",marginTop:20,padding:16,background:"var(--ink)",color:"#fff",fontSize:15}}
        onClick={finish} disabled={finishing}>{finishLabel}</button>
      <div className="small" style={{marginTop:14,lineHeight:1.5,textAlign:"center"}}>
        종료하면 녹음 변환이 시작돼요. 사진은 선택 사항이에요.<br/>
        최대 2시간 · 150MB
      </div>
      </>
      ) : inputMode==="upload" && audioFile ? (
      <>
      <div className="card" style={{padding:"14px 16px",marginTop:22,background:"#FBF9F4"}}>
        <div className="row between" style={{gap:10,alignItems:"flex-start"}}>
          <div className="row" style={{gap:10,flex:1,minWidth:0}}>
            {I.mic({width:18,height:18,style:{color:"var(--accent-deep)",flexShrink:0,marginTop:2}})}
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14,wordBreak:"break-all"}}>{audioFile.name}</div>
              <div className="small" style={{marginTop:4}}>
                {formatBytes(audioFile.size)}{audioDur>0?` · ${mmss(audioDur)}`:""}
              </div>
            </div>
          </div>
          <span onClick={resetChoose} style={{cursor:"pointer",opacity:.55,fontSize:18,lineHeight:1,flexShrink:0}}>✕</span>
        </div>
      </div>
      <button className="chip" style={{width:"100%",marginTop:10,padding:12,color:"var(--accent-deep)"}} onClick={importAudio}>
        다른 파일 선택
      </button>
      <button className="btn" style={{width:"100%",marginTop:18,padding:16,background:"var(--ink)",color:"#fff",fontSize:15}}
        onClick={finish} disabled={finishing}>{finishLabel}</button>
      <div className="small" style={{marginTop:14,lineHeight:1.5,textAlign:"center"}}>
        가져오면 백그라운드에서 전사·요약이 진행돼요. 완료되면 알려드릴게요.<br/>
        최대 2시간 · 150MB
      </div>
      </>
      ) : inputMode==="photo" ? (
      <>
      <button type="button" className="chip" style={{marginTop:14,color:"var(--muted)"}} onClick={()=>setInputMode(null)}>← 녹음 · 파일로</button>
      <div className="small" style={{fontWeight:700,marginTop:14,marginBottom:4}}>사진 · 문서 ({photos.length})</div>
      {photos.length>0 && <div className="small" style={{color:"var(--muted)",marginBottom:8}}>탭하면 크게 보기</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {photos.map((p,i)=>(
          <div key={i} style={{gridColumn:photos.length%3===0||i<photos.length?"auto":"span 1"}}>
            <div style={{aspectRatio:"1/1",borderRadius:14,background:"#ECE8E0",position:"relative",overflow:"hidden"}}>
              <button type="button" aria-label="사진 크게 보기" onClick={()=>setPhotoGalleryIdx(i)}
                style={{position:"absolute",inset:0,border:"none",padding:0,borderRadius:14,overflow:"hidden",cursor:"pointer",background:"transparent"}}>
                <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </button>
              <span onClick={()=>removePhoto(i)}
                style={{position:"absolute",top:5,right:5,zIndex:2,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,.5)",
                  color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>✕</span>
            </div>
            <input value={p.note||""} onChange={e=>setPhotoNote(i,e.target.value)} placeholder="캡션 (선택)"
              style={{width:"100%",marginTop:6,border:"1px solid var(--line)",borderRadius:10,padding:"7px 9px",fontFamily:"inherit",fontSize:12}}/>
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
        onClick={finish}>{finishing?"업로드 중…":"사진 올리기"}</button>
      <div className="small" style={{marginTop:14,lineHeight:1.5,textAlign:"center"}}>올리면 백그라운드에서 자동 정리돼요.</div>
      </>
      ) : null}
    </div>
  );
}

function Summary({todos,toggleTodo,goClients,att=[],summary,mediaKey}){
  const CLIENTS=getClients();
  const s=summary?.summary;
  const oneLine=s?.one_line||"요약이 생성되었습니다";
  const primary=CLIENTS.find(c=>att.includes(c.id))||null;
  return (
    <div className="fade">
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">미팅 요약 · 자동 생성됨</div>
        <div className="row between"><div className="h-title">정리 완료</div>
          <span className="tag green">{I.check({})} 저장됨</span></div>
      </div>

      {mediaKey && (
        <div className="pad" style={{marginTop:14}}>
          <div className="section-h" style={{marginTop:0}}>녹음 듣기</div>
          <MediaPlayer mediaKey={mediaKey}/>
        </div>
      )}

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

      <div className="pad row between"><div className="section-h">참석자</div>
        {att.length>0 && <span className="tag green" style={{marginTop:20}}>→ 각 연락처에 기록</span>}</div>
      {att.length>0 ? (
      <div className="pad row" style={{gap:8,flexWrap:"wrap"}}>
        {att.map(id=>{const c=CLIENTS.find(x=>x.id===id);if(!c)return null;return(
          <div key={id} className="card row" style={{gap:9,padding:"8px 12px",cursor:"pointer"}} onClick={goClients}>
            <div className="avatar" style={{width:28,height:28,borderRadius:9,fontSize:12}}>{c.init}</div>
            <div style={{fontSize:13,fontWeight:600}}>{c.person}</div>
          </div>
        );})}
      </div>
      ) : (
      <div className="pad small" style={{color:"var(--muted)"}}>선택한 참석자가 없어요.</div>
      )}

      <div className="pad" style={{marginTop:8}}>
        <MeetingInsights summary={s} oneLine={oneLine}/>
      </div>

      {s?.actions?.length>0 && (
      <>
      <div className="pad row between"><div className="section-h">할 일 (자동 추가됨)</div></div>
      <div className="pad"><div className="card" style={{padding:"6px 16px"}}>
        {todos.slice(0, Math.max(s.actions.length, 2)).map((t,i)=>(
          <div key={i} className="list-item row" style={{gap:12,padding:"13px 0"}} onClick={()=>toggleTodo(i)}>
            <Checkbox on={t.done}/>
            <div style={{flex:1,fontSize:14,fontWeight:500,textDecoration:t.done?"line-through":"none",color:t.done?"var(--muted)":"var(--ink)"}}>{t.t}</div>
            <span className="tag gray">{t.due}</span>
          </div>
        ))}
      </div></div>
      </>
      )}

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


/* ---------------- KNOWLEDGE ---------------- */
function KbThumb({article}){
  const [url,setUrl]=useState(null);
  const coverKey=kbCoverKey(article);
  const meta=kbThumbMeta(article);
  const isBook=(article?.section||"knowledge")==="book";
  useEffect(()=>{
    if(!coverKey){ setUrl(null); return; }
    let alive=true;
    mediaUrl(coverKey).then((u)=>{ if(alive) setUrl(u); }).catch(()=>{});
    return ()=>{ alive=false; };
  },[coverKey]);
  const cls="kbh-thumb"+(isBook?" book":"");
  if(url) return <div className={cls}><img src={url} alt=""/></div>;
  const icon=meta.icon==="file"?I.file({width:22,height:22})
    :meta.icon==="mic"?I.mic({width:22,height:22,style:{color:"#fff"}})
    :meta.icon==="book"?I.book({width:22,height:22})
    :I.book({width:22,height:22});
  return <div className={cls} style={{background:meta.color}}>{icon}</div>;
}

function KbArticleCard({article,onOpen,pinned}){
  return (
    <div className="kbh-item" onClick={()=>onOpen(article)}>
      <KbThumb article={article}/>
      <div style={{minWidth:0,flex:1}}>
        <div className="kbh-meta">
          {pinned && <span className="tag gray">📌 최신</span>}
          <span className="tag gray">{article.c}</span>
          {(article.tags||[]).slice(0,2).map(t=><span key={t} className="tag gray">#{t}</span>)}
        </div>
        <div className="ttl">{article.t}</div>
        {article.section==="book" && article.bookMeta?.author && <div className="small" style={{marginTop:2,fontWeight:600}}>{article.bookMeta.author}</div>}
        {article.section==="lecture" && (article.lectureMeta?.speaker || article.bookMeta?.speaker || article.lectureMeta?.event || article.bookMeta?.event) && (
          <div className="small" style={{marginTop:2,fontWeight:600}}>
            {(article.lectureMeta?.event || article.bookMeta?.event) || (article.lectureMeta?.speaker || article.bookMeta?.speaker)}
          </div>
        )}
        <div className="ex">{kbExcerpt(article)}</div>
        <div className="kbh-info">
          <span className="kbh-dot">{article.d} · {kbReadMinutes(article)}분</span>
          {kbFileCount(article)>0 && <span className="kbh-attach">📎 {kbFileCount(article)}</span>}
        </div>
      </div>
    </div>
  );
}

function Knowledge({articles,openWrite,section,onSectionChange}){
  const [viewMode,setViewMode]=useState("board");
  const [cat,setCat]=useState("전체");
  const [tagFilter,setTagFilter]=useState("전체");
  const [q,setQ]=useState("");
  const cats=kbCategories(articles, section);
  const tagList=kbTags(articles, section);
  const ql=q.trim().toLowerCase();
  let list=articles.filter(a=>(a.section||"knowledge")===section);
  if(cat!=="전체") list=list.filter(a=>a.c===cat);
  if(tagFilter!=="전체") list=list.filter(a=>(a.tags||[]).includes(tagFilter));
  if(ql) list=list.filter(a=>kbSearchText(a).includes(ql));
  const feat=list[0] && cat==="전체" && !ql ? list[0] : null;
  const rest=feat ? list.slice(1) : list;
  const sectionInfo=KB_SECTIONS.find(s=>s.id===section);
  const emptyMsg=section==="book"?"아직 책 기록이 없어요. 독후감을 남겨보세요."
    :section==="lecture"?"아직 강연 정리가 없어요.":"아직 지식 글이 없어요.";
  const gridItems=viewMode==="board"?rest:list;

  return (
    <div className="fade" style={{position:"relative",minHeight:"100%"}}>
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">Knowledge</div>
        <div className="h-title">지식백과</div>
        <div className="small" style={{marginTop:4}}>책·강연·지식을 나눠 정리하고 검색해요</div>

        <div className="kbh-seg">
          {KB_SECTIONS.map(s=>(
            <button key={s.id} type="button" className={section===s.id?"on":""}
              onClick={()=>{ onSectionChange(s.id); setCat("전체"); setTagFilter("전체"); }}>
              <span>{s.icon} {s.label}</span>
              <span className="sub">{s.desc}</span>
            </button>
          ))}
        </div>

        <div className="kbh-search" style={{marginTop:16}}>
          {I.search({width:18,height:18})}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder={`${sectionInfo?.label || ""} · 제목 · 내용 검색`}/>
          {q && <span onClick={()=>setQ("")} style={{cursor:"pointer"}}>✕</span>}
        </div>

        {section==="book" && (
          <button
            type="button"
            className="chip"
            style={{width:"100%",marginTop:12,padding:"13px 14px",color:"#03A84D",borderColor:"#C5E8D4",fontWeight:700}}
            onClick={()=>openWrite(null, section, { openBookSearch: true })}
          >
            🔍 책 검색으로 추가
          </button>
        )}

        <div className="kbh-cats">
          {cats.map(c=>(
            <button key={c} type="button" className={"kbh-cat"+(cat===c?" on":"")} onClick={()=>{ setCat(c); setTagFilter("전체"); }}>{c}</button>
          ))}
        </div>

        {tagList.length>0 && (
          <div className="kbh-cats" style={{marginTop:8}}>
            <button type="button" className={"kbh-cat"+(tagFilter==="전체"?" on":"")} onClick={()=>setTagFilter("전체")}>#전체</button>
            {tagList.map(t=>(
              <button key={t} type="button" className={"kbh-cat"+(tagFilter===t?" on":"")} onClick={()=>setTagFilter(t)}>#{t}</button>
            ))}
          </div>
        )}

        {list.length>0 && (
          <div className="kbh-viewbar">
            <div className="seg" style={{width:128}}>
              <button type="button" className={viewMode==="board"?"on":""} onClick={()=>setViewMode("board")} style={{padding:"6px 0",fontSize:12.5}}>보드</button>
              <button type="button" className={viewMode==="list"?"on":""} onClick={()=>setViewMode("list")} style={{padding:"6px 0",fontSize:12.5}}>리스트</button>
            </div>
          </div>
        )}

        {list.length===0 && (
          <div className="small" style={{textAlign:"center",padding:"50px 0",lineHeight:1.6}}>
            {q?`"${q}"에 대한 글이 없어요.`:emptyMsg}
          </div>
        )}

        {feat && viewMode==="board" && (
          <>
            <div className="kbh-sech">추천</div>
            <div className="kbh-feat" onClick={()=>openWrite(feat)}>
              <KbFeatCover article={feat}/>
              <span className="kbh-pin">📌 최신</span>
              <div className="body">
                <div className="kbh-meta">
                  <span className="tag gray">{feat.c}</span>
                  {(feat.tags||[]).slice(0,3).map(t=><span key={t} className="tag gray">#{t}</span>)}
                </div>
                <div className="ttl">{feat.t}</div>
                {feat.section==="book" && feat.bookMeta?.author && <div className="small" style={{marginTop:4,fontWeight:600}}>{feat.bookMeta.author}</div>}
                {feat.section==="lecture" && (feat.lectureMeta?.event || feat.bookMeta?.event) && (
                  <div className="small" style={{marginTop:4,fontWeight:600}}>{feat.lectureMeta?.event || feat.bookMeta?.event}</div>
                )}
                <div className="ex">{kbExcerpt(feat)}</div>
                <div className="kbh-info">
                  <span className="kbh-dot">{feat.d} · {kbReadMinutes(feat)}분</span>
                  {kbFileCount(feat)>0 && <span className="kbh-attach">📎 {kbFileCount(feat)}</span>}
                </div>
              </div>
            </div>
          </>
        )}

        {gridItems.length>0 && <div className="kbh-sech">{kbSectionLabel(section)} 목록</div>}
        <div className={`kbh-list kbh-${viewMode}`}>
          {gridItems.map((a,i)=>(
            <KbArticleCard
              key={a.id}
              article={a}
              onOpen={openWrite}
              pinned={viewMode==="list" && i===0 && !!feat}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KbFeatCover({article}){
  const [url,setUrl]=useState(null);
  const coverKey=kbCoverKey(article);
  const meta=kbThumbMeta(article);
  useEffect(()=>{
    if(!coverKey) return;
    mediaUrl(coverKey).then(setUrl).catch(()=>{});
  },[coverKey]);
  if(url) return <div className="cover" style={{background:"#ECE8E0"}}><img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>;
  return <div className="cover" style={{background:`linear-gradient(135deg,${meta.color},var(--accent-deep))`}}/>;
}

/* ---------------- PRICING (3-트랙) ---------------- */
const won=(n)=>"₩"+Math.round(n).toLocaleString("ko-KR");
function Pricing({back,segment,user,onUserUpdated}){
  const [track,setTrack]=useState("통합");
  const [busy,setBusy]=useState(null);
  const [coupon,setCoupon]=useState("");
  const [couponMsg,setCouponMsg]=useState("");
  const isStu=segment==="student";
  const trialLeft=user?.trialDaysLeft;
  const planLabel=user?.lifetimeAccess?"무제한":user?.plan?`${user.plan.toUpperCase()} 플랜`:"";

  const subscribe=async (planId)=>{
    setBusy(planId);
    try{
      const { user:u }=await api.subscribe(planId);
      onUserUpdated?.(u);
      toastSuccess(`${planId.toUpperCase()} 플랜이 적용됐어요. (PG 연동 전 테스트 결제)`);
      back?.();
    }catch(e){ notifyError(e, e.message||"결제 처리 실패"); }
    finally{ setBusy(null); }
  };

  const redeem=async ()=>{
    const code=coupon.trim();
    if(!code){ setCouponMsg("쿠폰 코드를 입력하세요"); return; }
    setCouponMsg("");
    try{
      const { user:u }=await api.redeemCoupon(code);
      onUserUpdated?.(u);
      setCoupon("");
      setCouponMsg("쿠폰이 적용됐어요");
      toastSuccess("쿠폰이 적용됐어요");
      back?.();
    }catch(e){
      const msg=e.message||"쿠폰 적용 실패";
      setCouponMsg(msg);
      notifyError(e, msg);
    }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <span className="tag" style={{padding:"6px 11px"}}>
          {planLabel||(trialLeft!=null?`무료 체험 ${trialLeft}일 남음`:user?.hasAccess===false?"이용 만료":"무료 체험")}
        </span>
      </div>
      {user?.hasAccess===false && <div className="pad" style={{marginTop:4}}>
        <div className="card" style={{padding:14,background:"#FDEEEA",border:"1px solid #F0C9BE"}}>
          <div style={{fontWeight:700,fontSize:13.5}}>이용 기간이 만료됐어요</div>
          <div className="small" style={{marginTop:6,lineHeight:1.55}}>
            요금제를 선택하거나 쿠폰을 등록해 주세요.
            {user?.purgeAt && <> 미결제 시 {new Date(user.purgeAt).toLocaleDateString("ko-KR")}에 데이터가 삭제됩니다.</>}
          </div>
        </div>
      </div>}
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
        {track==="통합"&&<Bundles isStu={isStu} onSelect={subscribe} busy={busy}/>}
        {track==="선택"&&<Combos isStu={isStu} onSelect={()=>subscribe("pro")} busy={busy}/>}
        {track==="커스텀"&&<CustomPlan isStu={isStu} onSelect={()=>subscribe("custom")} busy={busy}/>}
      </div>

      <div className="pad" style={{marginBottom:14}}>
        <div className="card" style={{padding:16}}>
          <div style={{fontWeight:800,fontSize:13.5}}>쿠폰 코드</div>
          <div className="row" style={{gap:8,marginTop:10}}>
            <input value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())} placeholder="쿠폰 번호 입력"
              style={{flex:1,padding:"12px 14px",borderRadius:12,border:"1px solid var(--line)",fontFamily:"inherit"}}/>
            <button className="btn btn-accent" style={{padding:"12px 16px"}} onClick={redeem}>등록</button>
          </div>
          {couponMsg && <div className="small" style={{marginTop:8,color:couponMsg.includes("적용")?"var(--green)":"#B23B2E"}}>{couponMsg}</div>}
        </div>
      </div>

      {/* 체험 안내 */}
      <div className="pad" style={{marginBottom:14}}>
        <div className="card" style={{padding:16,background:"#FFF6E5",border:"1px solid #F2E3BE"}}>
          <div style={{fontWeight:800,fontSize:13.5}}>무료 체험 안내</div>
          <div style={{marginTop:8,fontSize:13,lineHeight:1.6,color:"#6b5e3a"}}>
            · 3일 무료 체험 · 녹음·음성 파일 1시간 한도 · 사진 업로드 불가<br/>
            · Lite 10h/50GB · Pro 30h/200GB · Ultra 100h/1TB (월)<br/>
            · 미결제 시 7일간 읽기 전용 보관 후 데이터 전체 삭제
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBtn({label="선택",onClick,disabled}){
  return <button className="btn btn-accent" style={{width:"100%",padding:13,marginTop:14}} onClick={onClick} disabled={disabled}>{disabled?"처리 중…":label}</button>;
}
function Inc({children}){
  return <div className="row" style={{gap:8,padding:"5px 0",fontSize:13.5}}>
    <span style={{color:"var(--green)"}}>{I.check({})}</span><span>{children}</span></div>;
}

function Bundles({isStu,onSelect,busy}){
  const plans = isStu ? [
    {id:"lite",n:"Lite", p:"₩9,900", day:"₩330", conv:"강의 녹음 10시간", stor:"자료 저장 50GB", f:["강의 자동 요약·필기","지식백과 정리","시험 전 검색"], hot:false},
    {id:"pro",n:"Pro",  p:"₩24,900", day:"₩830", conv:"강의 녹음 30시간", stor:"자료 저장 200GB", f:["전 기능","요약 템플릿(강의·개념·오답)","과목별 정리"], hot:true},
    {id:"ultra",n:"Ultra",p:"₩59,900", day:"₩1,997", conv:"강의 녹음 100시간", stor:"자료 저장 1TB", f:["전 기능","우선 처리","스터디 공유"], hot:false},
  ] : [
    {id:"lite",n:"Lite", p:"₩9,900", day:"₩330", conv:"변환 10시간", stor:"저장 50GB", f:["기본 CRM·캘린더","지식백과","통화 파일 업로드"], hot:false},
    {id:"pro",n:"Pro",  p:"₩24,900", day:"₩830", conv:"변환 30시간", stor:"저장 200GB", f:["전 기능","요약 템플릿 전체","공유"], hot:true},
    {id:"ultra",n:"Ultra",p:"₩59,900", day:"₩1,997", conv:"변환 100시간", stor:"저장 1TB", f:["전 기능","우선 처리","공유"], hot:false},
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
        <PlanBtn label={pl.hot?"시작하기":"선택"} onClick={()=>onSelect?.(pl.id)} disabled={!!busy}/>
      </div>
    ))}
  </>;
}

function Combos({isStu,onSelect,busy}){
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
        <PlanBtn onClick={onSelect} disabled={!!busy}/>
      </div>
    ))}
  </>;
}

function CustomPlan({isStu,onSelect,busy}){
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
        ) : <PlanBtn label="이 구성으로 변경" onClick={onSelect} disabled={!!busy}/>}
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

function SheetPortal({ children }) {
  return createPortal(children, document.body);
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
    <SheetPortal>
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
    </SheetPortal>
  );
}

/* ---------------- CARD SCAN (명함 스캔 → 항목 추출) ---------------- */

function CardScan(props){
  return <CardScanView {...props} I={I}/>;
}

/* ---------------- TODO BOARD (칸반: 할일/진행중/완료) ---------------- */
function TodoBoard({todos,setTodoStatus,openDetail}){
  const idx=(t)=>todos.indexOf(t);
  return (
    <div>
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

/* ---------------- MEETINGS TAB (미팅 내역 · 요약 · 할 일) ---------------- */
function MeetingsTab({meetings:bootMeetings=[],openDetail,startRec,startImportRec,onRefresh,meetingPresets={categories:[],tags:[]}}){
  const CLIENTS=getClients();
  const bootRef=useRef(bootMeetings);
  bootRef.current=bootMeetings;
  const [items,setItems]=useState(()=>(bootMeetings||[]).map(meetingToUi));
  const [loading,setLoading]=useState(!bootMeetings.length);
  const [loadErr,setLoadErr]=useState("");
  const [catFilter,setCatFilter]=useState("전체");
  const reload=()=>{
    setLoading(true);
    setLoadErr("");
    return api.listMeetings()
      .then((rows)=>setItems((rows||[]).map(meetingToUi)))
      .catch((e)=>{
        setLoadErr(e?.message||"미팅 목록을 불러오지 못했어요");
        setItems((prev)=>prev.length?prev:bootRef.current);
      })
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{ reload(); },[]);
  useEffect(()=>{
    if(bootMeetings.length) setItems((prev)=>(prev.length>=bootMeetings.length?prev:bootMeetings.map(meetingToUi)));
  },[bootMeetings]);
  const preview=(m)=>{
    const pts=m.summary?.key_points;
    if(Array.isArray(pts)&&pts.length) return pts[0];
    return m.oneLine||"";
  };
  const catFilters=["전체",...(meetingPresets.categories||[])];
  const shown=catFilter==="전체"?items:items.filter(m=>(m.category||"")===catFilter);
  return (
    <div className="fade" style={{position:"relative",minHeight:"100%"}}>
      <div className="pad" style={{marginTop:8}}>
        <div className="h-eyebrow">녹음 · 요약 · 후속 할 일</div>
        <div className="h-title">미팅 내역</div>
        <div className="small" style={{marginTop:6,lineHeight:1.55}}>
          {loading&&!items.length?"불러오는 중…":`${shown.length}건 · 항목을 누르면 요약과 할 일을 볼 수 있어요`}
        </div>
        <div className="row" style={{gap:8,marginTop:12,flexWrap:"wrap"}}>
          <button type="button" className="chip" style={{display:"flex",alignItems:"center",gap:6,color:"var(--accent-deep)"}}
            onClick={()=>startImportRec?.()}>
            {I.download({width:14,height:14})} 녹음 가져오기
          </button>
        </div>
        {catFilters.length>1 && (
          <div className="row" style={{gap:7,marginTop:12,flexWrap:"wrap"}}>
            {catFilters.map((c)=>(
              <button key={c} type="button" className={"chip"+(catFilter===c?" on":"")} onClick={()=>setCatFilter(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>
      {loadErr && (
        <div className="pad" style={{marginTop:4}}>
          <div className="card small" style={{padding:14,lineHeight:1.55,background:"var(--accent-soft)",border:"1px solid #F0D4C8",color:"var(--accent-deep)"}}>
            {loadErr}
            <button className="chip" style={{marginLeft:8,color:"var(--accent-deep)"}} onClick={()=>reload().then(()=>onRefresh?.())}>다시 시도</button>
          </div>
        </div>
      )}
      <div className="pad" style={{marginTop:8,marginBottom:88}}>
        {!loading && shown.length===0 && !loadErr && (
          <div className="card" style={{padding:36,textAlign:"center"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{catFilter!=="전체"?"해당 분류의 기록이 없어요":"아직 미팅 기록이 없어요"}</div>
            <div className="small" style={{lineHeight:1.6,marginBottom:18}}>녹음을 끝내면 요약·할 일·다음 약속이 자동으로 정리돼요.</div>
            <button className="btn btn-accent" style={{padding:"12px 24px"}} onClick={startRec}>첫 미팅 기록</button>
          </div>
        )}
        {shown.map((m)=>{
          const pts=m.summary?.key_points;
          const ptCount=Array.isArray(pts)?pts.length:0;
          const people=meetingPeopleLabel(m, CLIENTS);
          return (
            <div key={m.id} className="card list-item" style={{padding:16,marginBottom:10}} onClick={()=>openDetail?.(m)}>
              <div className="row between" style={{gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div className="row" style={{gap:6,marginBottom:8,flexWrap:"wrap"}}>
                    {m.category && <span className="tag" style={{background:"var(--accent-soft)",color:"var(--accent-deep)"}}>{m.category}</span>}
                    <span className="tag gray">{m.createdLabel||"기록"}</span>
                    {m.hasAudio && <span className="tag" style={{background:"var(--accent-soft)",color:"var(--accent-deep)"}}>🎧 녹음</span>}
                    {m.source==="photo" && <span className="tag" style={{background:"#E8EEF5",color:"#4A6FA5"}}>📷 사진</span>}
                    {m.source==="upload" && <span className="tag" style={{background:"#EDE8F5",color:"#6A4A9A"}}>📁 파일</span>}
                    {m.isProcessing && <span className="tag" style={{background:"#E8F0FF",color:"#3A6BB5"}}>⏳ 변환 중</span>}
                    {m.isFailed && <span className="tag" style={{background:"#FCEAE6",color:"#B85C4A"}}>⚠ 변환 실패</span>}
                    {m.eventTitle && <span className="tag" style={{background:"#E8F0FF",color:"#3A6BB5"}}>📅 {m.eventTitle}</span>}
                    {m.todoCount>0 && (
                      <span className="tag" style={{background:"var(--green-soft)",color:"var(--green)"}}>
                        할 일 {m.openTodoCount>0?`${m.openTodoCount}/${m.todoCount}`:m.todoCount}
                      </span>
                    )}
                  </div>
                  {people && (
                    <div className="small" style={{marginBottom:6,fontWeight:700,color:"var(--ink)",lineHeight:1.45}}>{people}</div>
                  )}
                  <div style={{fontWeight:700,fontSize:15,lineHeight:1.45}}>{m.oneLine||m.t}</div>
                  {preview(m) && preview(m)!==(m.oneLine||m.t) && (
                    <div className="small" style={{marginTop:8,lineHeight:1.5,color:"var(--muted)",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                      {preview(m)}
                    </div>
                  )}
                  {ptCount>1 && <div className="small" style={{marginTop:6,color:"var(--accent-deep)",fontWeight:600}}>핵심 {ptCount}건</div>}
                </div>
                <span style={{color:"var(--muted)",flex:"0 0 auto",alignSelf:"center"}}>{I.chevron({})}</span>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="meet-fab" aria-label="새 미팅 기록" onClick={()=>startRec?.()}>
        {I.plus({width:26,height:26})}
      </button>
    </div>
  );
}

/* ---------------- TODO ARCHIVE (전체 검색 · 히스토리 · 첨부) ---------------- */
function TodoArchive({back,embedded=false,openDetail,meetings=[],todos:bootTodos=[],onRefresh}){
  const [q,setQ]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [items,setItems]=useState(()=>bootTodos);
  const [loading,setLoading]=useState(!embedded);
  useEffect(()=>{
    const t=setTimeout(()=>setQuery(q),300);
    return ()=>clearTimeout(t);
  },[q]);
  const reload=useCallback(async ()=>{
    setLoading(true);
    try{
      const rows=await api.listTodos({ q: query.trim()||undefined, status: status||undefined });
      setItems(rows.map(todoToUi));
    }catch(e){ notifyError(e, e.message||"불러오기 실패"); }
    finally{ setLoading(false); }
  },[query,status]);
  useEffect(()=>{ reload(); },[reload]);
  useEffect(()=>{
    if(embedded && bootTodos.length && !query.trim() && !status) setItems(bootTodos);
  },[embedded,bootTodos,query,status]);
  const filters=[["","전체"],["todo","할 일"],["doing","진행 중"],["done","완료"]];
  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        {!embedded ? (
          <button className="iconbtn" onClick={back}>{I.back({})}</button>
        ) : (
          <div style={{width:42}}/>
        )}
        <div className="h-eyebrow" style={{marginTop:0}}>할 일 목록</div>
        <div style={{width:42}}/>
      </div>
      {embedded && (
        <div className="pad" style={{paddingTop:0}}>
          <div className="h-title" style={{fontSize:22}}>할 일 · 검색</div>
          <div className="small" style={{marginTop:6,lineHeight:1.55}}>
            완료된 할 일도 여기서 찾을 수 있어요. 투데이에서는 미완료만 보여요.
          </div>
        </div>
      )}
      <div className="pad" style={{marginTop:6}}>
        <div className="row" style={{gap:9,background:"#F4F1EA",borderRadius:12,padding:"11px 13px",color:"var(--muted)"}}>
          {I.search({width:17,height:17})}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="제목 · 상세 · 결과 · 히스토리 · 첨부 검색"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:14,color:"var(--ink)"}}/>
        </div>
        <div className="row" style={{gap:7,marginTop:12,flexWrap:"wrap"}}>
          {filters.map(([s,l])=>(
            <button key={s||"all"} className={"chip"+(status===s?" on":"")} onClick={()=>setStatus(s)}>{l}</button>
          ))}
        </div>
        <div className="small" style={{marginTop:10}}>
          {loading ? "불러오는 중…" : `${items.length}건 · 항목을 누르면 히스토리와 첨부를 볼 수 있어요`}
        </div>
      </div>
      <div className="pad" style={{marginTop:4,marginBottom:12}}>
        {!loading && items.length===0 && (
          <div className="small" style={{textAlign:"center",padding:"40px 0",lineHeight:1.6}}>
            {q.trim()||status ? "검색 결과가 없어요" : "등록된 할 일이 없어요"}
          </div>
        )}
        <NestedTodoList todos={items} meetings={meetings} onRefresh={()=>{ reload(); onRefresh?.(); }} openDetail={openDetail} showAdd editable groupBySource hideCompletedGroups={false}/>
      </div>
    </div>
  );
}

/* ---------------- GLOBAL SEARCH (인맥·기록·지식백과·할 일 통합) ---------------- */
function GlobalSearch({back,openClient,openPlace,openTask,openMeeting,meetings=[],kbArticles=[],todos=[]}){
  const CLIENTS=getClients();
  const PLACES=getPlaces();
  const [q,setQ]=useState("");
  const ql=q.trim().toLowerCase();
  const people=CLIENTS.filter(c=>(c.person+c.co).toLowerCase().includes(ql));
  const savedPlaces=PLACES.filter(p=>(p.name+p.area+p.category).toLowerCase().includes(ql));
  const recs=meetings.filter(r=>r.t.toLowerCase().includes(ql));
  const kb=kbArticles.filter(r=>kbSearchText(r).includes(ql));
  const taskItems=todos.filter(t=>todoSearchText(t._raw||t).includes(ql)||t.t.toLowerCase().includes(ql));
  const empty=ql && people.length+savedPlaces.length+recs.length+kb.length+taskItems.length===0;
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
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="인맥 · 맛집 · 할 일 · 기록 · 지식 검색"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:14,color:"var(--ink)"}}/>
        </div>
      </div>
      <div className="pad" style={{marginBottom:12}}>
        {!ql && <div className="small" style={{textAlign:"center",padding:"50px 0",lineHeight:1.6}}>이름·맛집·할 일·기록·지식을<br/>한 번에 검색해요</div>}
        {empty && <div className="small" style={{textAlign:"center",padding:"50px 0"}}>“{q}” 검색 결과가 없어요</div>}
        {Section("인맥", people, c=>(
          <div key={c.id} className="list-item row between" style={{cursor:"pointer"}} onClick={()=>openClient(c)}>
            <div className="row" style={{gap:11}}><div className="avatar">{c.init}</div>
              <div><div style={{fontWeight:700,fontSize:14}}>{c.person}</div><div className="small">{c.co}</div></div></div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </div>
        ))}
        {Section("맛집 · 장소", savedPlaces, p=>(
          <div key={p.id} className="list-item row between" style={{cursor:"pointer"}} onClick={()=>openPlace?.(p)}>
            <div className="row" style={{gap:11}}>
              <div className="avatar" style={{background:"#FFF0EB",color:"#C45C3E"}}>{p.init}</div>
              <div><div style={{fontWeight:700,fontSize:14}}>{p.name}</div><div className="small">{p.category} · {p.area}</div></div>
            </div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </div>
        ))}
        {Section("할 일", taskItems, (t)=>(
          <div key={t.id} className="list-item row between" style={{cursor:"pointer"}} onClick={()=>openTask?.(t)}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14}}>{t.t}</div>
              <div className="small">{t.statusLabel}{t.attachmentCount>0?` · 첨부 ${t.attachmentCount}`:""}{t.historyCount>0?` · 기록 ${t.historyCount}`:""}</div>
            </div>
            <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>
          </div>
        ))}
        {Section("기록", recs, (r)=>(
          <div key={r.id} className="list-item row between" style={{cursor:"pointer"}} onClick={()=>openMeeting?.(r)}>
            <div><div style={{fontWeight:600,fontSize:14}}>{r.t}</div>
              <div className="small">{r.d}{r.hasAudio?" · 🎧":""}</div></div>
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

/* ---------------- MY PAGE ---------------- */
function MyPage({user,back,onUserUpdated}){
  const [usage,setUsage]=useState(null);
  const [usageLoading,setUsageLoading]=useState(true);
  const [name,setName]=useState(user?.name||"");
  const [savingName,setSavingName]=useState(false);
  const [nameMsg,setNameMsg]=useState("");
  const [curPw,setCurPw]=useState("");
  const [newPw,setNewPw]=useState("");
  const [newPw2,setNewPw2]=useState("");
  const [savingPw,setSavingPw]=useState(false);
  const [pwMsg,setPwMsg]=useState("");
  const canChangePw=user?.provider==="email";

  useEffect(()=>{ setName(user?.name||""); },[user?.name]);

  useEffect(()=>{
    setUsageLoading(true);
    api.getUsage().then(setUsage).catch(()=>setUsage(null)).finally(()=>setUsageLoading(false));
  },[]);

  const trialLabel=user?.lifetimeAccess?"무제한":user?.plan?`${user.plan.toUpperCase()} 플랜`:user?.trialDaysLeft!=null?`체험 ${user.trialDaysLeft}일`:"체험 중";
  const joined=user?.createdAt?new Date(user.createdAt).toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}):"";
  const st=usage?.storage;
  const rec=usage?.access;
  const recStats=usage?.recording;
  const pct=st?.percent??0;
  const overLimit=st && st.usedBytes>st.limitBytes;

  const saveName=async ()=>{
    const trimmed=name.trim();
    if(!trimmed){ setNameMsg("이름을 입력하세요"); return; }
    setSavingName(true); setNameMsg("");
    try{
      const { user:u }=await api.updateMe({ name:trimmed });
      onUserUpdated?.(u);
      setNameMsg("저장됐어요");
    }catch(e){ setNameMsg(e.message||"저장 실패"); }
    finally{ setSavingName(false); }
  };

  const savePassword=async ()=>{
    if(newPw!==newPw2){ setPwMsg("새 비밀번호가 일치하지 않습니다"); return; }
    if(newPw.length<6){ setPwMsg("비밀번호는 6자 이상"); return; }
    setSavingPw(true); setPwMsg("");
    try{
      const { token } = await api.changePassword(curPw,newPw);
      if (token) { saveToken(token,{ remember:true }); setToken(token); }
      setCurPw(""); setNewPw(""); setNewPw2("");
      setPwMsg("비밀번호가 변경됐어요");
    }catch(e){ setPwMsg(e.message||"변경 실패"); }
    finally{ setSavingPw(false); }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{marginTop:8}}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{marginTop:0}}>마이페이지</div>
        <div style={{width:42}}/>
      </div>
      <div className="pad" style={{marginTop:10,marginBottom:16}}>
        <div className="card row" style={{padding:16,gap:13,marginBottom:16}}>
          <div className="avatar" style={{width:52,height:52,borderRadius:16,fontSize:20}}>{(user?.name||"?")[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:16}}>{user?.name||"회원"}</div>
            <div className="small" style={{marginTop:3}}>{user?.email}</div>
            {joined && <div className="small" style={{marginTop:4}}>가입 {joined}</div>}
          </div>
          <span className="tag green">{trialLabel}</span>
        </div>

        <div className="section-h" style={{marginTop:0}}>저장 용량</div>
        <div className="card" style={{padding:16,marginBottom:16}}>
          {usageLoading ? <div className="small">용량 불러오는 중…</div> : !st ? (
            <div className="small">용량 정보를 불러오지 못했어요</div>
          ) : (
            <>
              <div className="row between" style={{marginBottom:10}}>
                <span style={{fontWeight:700,fontSize:14}}>{formatBytes(st.usedBytes)} 사용 중</span>
                <span className="small">한도 {st.limitLabel}</span>
              </div>
              <div style={{height:10,borderRadius:99,background:"#EDE9E0",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,pct)}%`,borderRadius:99,
                  background:overLimit?"#DD5E39":pct>80?"#C9A23A":"var(--accent)",transition:"width .3s"}}/>
              </div>
              <div className="row between" style={{marginTop:8}}>
                <span className="small">{st.fileCount}개 파일</span>
                <span className="small" style={{fontWeight:700,color:overLimit?"#DD5E39":"var(--muted)"}}>{pct}%</span>
              </div>
              {overLimit && <div className="small" style={{marginTop:10,color:"#B23B2E",lineHeight:1.5}}>
                한도를 초과했어요. 오래된 파일을 정리해 주세요.{!BETA_HIDE_PRICING && " 플랜을 올릴 수도 있어요."}
              </div>}
              {st.breakdown?.length>0 && <>
                <div style={{height:1,background:"var(--line)",margin:"14px 0"}}/>
                {st.breakdown.map((b)=>(
                  <div key={b.key} className="row between" style={{padding:"7px 0"}}>
                    <span className="small">{b.label} · {b.count}개</span>
                    <span style={{fontWeight:600,fontSize:13}}>{formatBytes(b.bytes)}</span>
                  </div>
                ))}
              </>}
            </>
          )}
        </div>

        {rec && <><div className="section-h">녹음 · 변환</div>
        <div className="card" style={{padding:16,marginBottom:16}}>
          <div className="row between" style={{marginBottom:10}}>
            <span style={{fontWeight:700,fontSize:14}}>{formatDurationHm(rec.recordingUsedSec)} 사용</span>
            <span className="small">한도 {rec.recordingLimitLabel}</span>
          </div>
          {rec.recordingLimitSec>0 && (
            <div style={{height:10,borderRadius:99,background:"#EDE9E0",overflow:"hidden",marginBottom:10}}>
              <div style={{height:"100%",width:`${Math.min(100,Math.round(rec.recordingUsedSec/rec.recordingLimitSec*100))}%`,borderRadius:99,background:"var(--accent)"}}/>
            </div>
          )}
          {recStats && <>
            <div className="row between" style={{padding:"8px 0",borderTop:"1px solid var(--line)"}}>
              <span className="small">이번 달 변환</span>
              <span style={{fontWeight:700,fontSize:13}}>{formatDurationHm(recStats.thisMonthSec)}</span>
            </div>
            <div className="row between" style={{padding:"8px 0"}}>
              <span className="small">지난 달</span>
              <span style={{fontWeight:600,fontSize:13}}>{formatDurationHm(recStats.lastMonthSec)}</span>
            </div>
            <div className="row between" style={{padding:"8px 0"}}>
              <span className="small">누적 (전체 기록)</span>
              <span style={{fontWeight:600,fontSize:13}}>{formatDurationHm(recStats.lifetimeUsedSec)} · {recStats.lifetimeSessionCount}회</span>
            </div>
            {rec.periodResetAt && (
              <div className="small" style={{marginTop:6,color:"var(--muted)"}}>
                이번 기간 리셋: {new Date(rec.periodResetAt).toLocaleDateString("ko-KR")}
              </div>
            )}
          </>}
          {user?.lifetimeAccess && (
            <div className="small" style={{marginTop:8,lineHeight:1.5,color:"var(--green)"}}>무제한 플랜 — 변환 시간 제한 없음</div>
          )}
          {rec.isTrial && <div className="small" style={{marginTop:8,lineHeight:1.5}}>체험 중: 녹음·음성 1시간 · 사진·문서 업로드 불가</div>}
          <div className="small" style={{marginTop:10,lineHeight:1.5,color:"var(--muted)"}}>
            베타 통계는 DB에 저장돼요. 한 달 운영 후 요금제 설계에 활용할 수 있습니다.
          </div>
        </div></>}

        <div className="section-h">내 데이터</div>
        <div className="card" style={{padding:16,marginBottom:16}}>
          <div className="row" style={{gap:8,flexWrap:"wrap"}}>
            {[
              ["인맥",usage?.counts?.contacts],
              ["기록",usage?.counts?.meetings],
              ["할 일",usage?.counts?.todos],
              ["지식백과",usage?.counts?.kbArticles],
              ["딜",usage?.counts?.deals],
              ["맛집",usage?.counts?.savedPlaces],
            ].map(([l,n])=>(
              <div key={l} style={{flex:"1 1 30%",minWidth:88,textAlign:"center",padding:"10px 6px",background:"#FBF9F4",borderRadius:12}}>
                <div style={{fontWeight:800,fontSize:18}}>{usageLoading?"—":(n??0)}</div>
                <div className="small">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-h">프로필 수정</div>
        <div className="card" style={{padding:16,marginBottom:16}}>
          <div className="small" style={{marginBottom:8}}>이름</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="이름" style={inputFieldStyle}/>
          {nameMsg && <div className="small" style={{marginBottom:8,color:nameMsg.includes("실패")||nameMsg.includes("입력")?"var(--accent-deep)":"var(--green)"}}>{nameMsg}</div>}
          <button className="btn btn-accent" style={{width:"100%",padding:12}} disabled={savingName} onClick={saveName}>
            {savingName?"저장 중…":"이름 저장"}
          </button>
          <div className="small" style={{marginTop:12,lineHeight:1.5}}>이메일({user?.email})은 로그인 ID라 여기서는 변경할 수 없어요.</div>
        </div>

        {canChangePw && <>
          <div className="section-h">비밀번호 변경</div>
          <div className="card" style={{padding:16,marginBottom:16}}>
            <input type="password" value={curPw} onChange={e=>setCurPw(e.target.value)} placeholder="현재 비밀번호"
              autoComplete="current-password" style={inputFieldStyle}/>
            <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="새 비밀번호 (6자 이상)"
              autoComplete="new-password" style={inputFieldStyle}/>
            <input type="password" value={newPw2} onChange={e=>setNewPw2(e.target.value)} placeholder="새 비밀번호 확인"
              autoComplete="new-password" style={inputFieldStyle}/>
            {pwMsg && <div className="small" style={{marginBottom:8,color:pwMsg.includes("변경됐")?"var(--green)":"var(--accent-deep)"}}>{pwMsg}</div>}
            <button className="btn btn-accent" style={{width:"100%",padding:12}} disabled={savingPw||!curPw||!newPw||!newPw2} onClick={savePassword}>
              {savingPw?"변경 중…":"비밀번호 변경"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}

/* ---------------- SETTINGS ---------------- */
function Settings({back,go,user,onLogout,openPricing}){
  const trialLabel=user?.lifetimeAccess?"무제한":user?.plan?`${user.plan.toUpperCase()}`:user?.trialDaysLeft!=null?`체험 ${user.trialDaysLeft}일`:"체험 중";
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
        <div className="card row" style={{padding:16,gap:13,marginBottom:16,cursor:"pointer"}} onClick={()=>go("mypage")}>
          <div className="avatar" style={{width:48,height:48,borderRadius:16}}>{(user?.name||"?")[0]}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{user?.name||"회원"}</div><div className="small">{user?.email}</div></div>
          <span className="tag green">{trialLabel}</span>
        </div>

        <div className="section-h" style={{marginTop:0}}>계정 · 구독</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.gear({width:18,height:18}),"마이페이지","용량 · 프로필",()=>go("mypage"))}
          {!BETA_HIDE_PRICING && Row(I.bolt({width:18,height:18}),"플랜 · 결제",trialLabel,openPricing)}
          {Row(I.bell({width:18,height:18}),"알림","1시간 전",()=>{})}
          {Row(I.users({width:18,height:18}),"친구 · 공유",null,()=>go("friends"))}
        </div>

        <div className="section-h">데이터</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.download({width:18,height:18}),"내보내기 · 백업",null,()=>go("export"))}
          {Row(I.trash({width:18,height:18}),"휴지통",null,()=>go("trash"))}
        </div>

        <div className="section-h">앱</div>
        <div className="card" style={{padding:"4px 16px",marginBottom:16}}>
          {Row(I.book({width:18,height:18}),"분류 · 태그","인맥 · 캘린더 · 미팅 · 맛집 · 지식",()=>go("categorytags"))}
          {Row(I.meet({width:18,height:18}),"캘린더 연동","Google · Apple",()=>go("calendarsync"))}
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
    }catch(e){ notifyError(e, e.message||"내보내기 실패"); }
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

function DeleteBar({label,onDelete,afterDelete}){
  const [busy,setBusy]=useState(false);
  const go=async ()=>{
    if(!(await confirmDelete(label))) return;
    setBusy(true);
    try{
      await onDelete();
      afterDelete?.();
    }catch(e){ notifyError(e, e.message||"삭제 실패"); }
    finally{ setBusy(false); }
  };
  return (
    <div className="pad" style={{marginTop:4,marginBottom:24}}>
      <button type="button" className="btn btn-ghost" style={{width:"100%",padding:14,color:"#B85C4A",borderColor:"#E8D5D0",display:"flex",justifyContent:"center",gap:8}}
        disabled={busy} onClick={go}>
        {I.trash({width:16,height:16})} {busy?"삭제 중…":"삭제"}
      </button>
    </div>
  );
}

function fileNameFromKey(key){
  if(!key) return "첨부파일";
  const name=key.split("/").pop()||"첨부파일";
  try{ return decodeURIComponent(name); }catch{ return name; }
}

function TodoAttachmentRow({att}){
  const [url,setUrl]=useState(null);
  const [err,setErr]=useState(false);
  const [opening,setOpening]=useState(false);
  useEffect(()=>{
    if(!att?.key) return;
    mediaUrl(att.key).then(setUrl).catch(()=>setErr(true));
  },[att?.key]);
  const isImage=att?.kind==="image"||(att?.name||"").match(/\.(png|jpe?g|gif|webp)$/i);
  const open=async ()=>{
    if(!att?.key||opening) return;
    setOpening(true);
    try{
      await openMediaFile(att.key, att?.name || fileNameFromKey(att.key));
    }catch(e){
      notifyError(e, e.message||"파일을 열 수 없습니다");
    }finally{
      setOpening(false);
    }
  };
  return (
    <div className="row between" style={{padding:"12px 0",borderBottom:"1px solid var(--line)",cursor:att?.key?"pointer":"default"}} onClick={open}>
      <div className="row" style={{gap:10,flex:1,minWidth:0}}>
        {isImage && url ? (
          <img src={url} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",flex:"0 0 auto"}}/>
        ) : (
          <div style={{width:44,height:44,borderRadius:8,background:"var(--accent-soft)",display:"flex",alignItems:"center",justifyContent:"center",flex:"0 0 auto"}}>
            {I.download({width:18,height:18,style:{color:"var(--accent-deep)"}})}
          </div>
        )}
        <div style={{minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att?.name||"첨부파일"}</div>
          <div className="small">{err?"열기 실패":opening?"여는 중…":att?.key?"탭해서 열기":"불러오는 중…"}</div>
        </div>
      </div>
      {att?.key && <span style={{color:"var(--muted)"}}>{I.chevron({})}</span>}
    </div>
  );
}

const quoteFieldStyle={
  width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"12px 13px",
  fontFamily:"inherit",fontSize:14,color:"var(--ink)",background:"#fff",outline:"none",
};

function contactQuoteLabel(c){
  if(!c) return "";
  const person=c.person||"";
  const role=contactRoleLine(c);
  const co=c.co||c.company||"";
  const who=[person,role].filter(Boolean).join(" · ");
  if(co&&who) return `${co} · ${who}`;
  return who||co||"이름 없음";
}

function AddQuoteForm({contactId:lockedContactId,onSaved,onCancel,compact=false}){
  const CLIENTS=getClients();
  const [contactId,setContactId]=useState(lockedContactId||"");
  const [pick,setPick]=useState(false);
  const [q,setQ]=useState("");
  const [title,setTitle]=useState("");
  const [stage,setStage]=useState("견적");
  const [totalAmount,setTotalAmount]=useState("");
  const [quoteFile,setQuoteFile]=useState(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{ if(lockedContactId) setContactId(lockedContactId); },[lockedContactId]);

  const selected=CLIENTS.find(x=>x.id===contactId);
  const ql=q.trim().toLowerCase();
  const found=CLIENTS.filter(c=>!ql||(c.person+c.co+(c.title||"")+(c.department||"")).toLowerCase().includes(ql)).slice(0,40);

  const pickQuoteFile=async ()=>{
    try{
      const file=await pickAnyFile();
      setQuoteFile(file);
    }catch(e){
      if(!isPickCancelled(e) && e?.message!=="파일이 선택되지 않았습니다") notifyError(e, e.message);
    }
  };

  const save=async ()=>{
    if(!contactId){ toastError("인맥을 선택하세요"); return; }
    const amount=parseInt(String(totalAmount).replace(/\D/g,""),10);
    if(!amount){ toastError("견적 금액(부가세 포함)을 입력하세요"); return; }
    setSaving(true);
    try{
      let quoteKey;
      if(quoteFile) quoteKey=await uploadFile(quoteFile);
      const sel=CLIENTS.find(x=>x.id===contactId);
      const autoTitle=sel?`${sel.co||sel.person||"견적"} 견적`:"견적";
      await api.saveDeal({
        contactId,
        title:title.trim()||autoTitle,
        stage,
        supplyAmount:totalToSupplyAmount(amount),
        ...(quoteKey?{quoteKey}:{}),
      });
      onSaved?.();
    }catch(e){ notifyError(e, e.message); }
    finally{ setSaving(false); }
  };

  return (
    <div className="card" style={{padding:16,marginBottom:10}}>
      {lockedContactId && selected && (
        <div className="row" style={{gap:10,marginBottom:12,alignItems:"center"}}>
          <div className="avatar" style={{width:36,height:36,borderRadius:12,fontSize:14}}>{selected.init}</div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14}}>{contactQuoteLabel(selected)}</div>
            <div className="small">이 인맥에 견적을 등록해요</div>
          </div>
        </div>
      )}
      {!lockedContactId && (
        <div style={{marginBottom:12}}>
          <div className="small" style={{fontWeight:700,marginBottom:6}}>인맥</div>
          {selected&&!pick ? (
            <div className="row between card" style={{padding:"10px 12px",gap:8}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{contactQuoteLabel(selected)}</div>
              </div>
              <button type="button" className="chip" style={{padding:"5px 10px",fontSize:12,flex:"0 0 auto"}} onClick={()=>setPick(true)}>변경</button>
            </div>
          ) : (
            <>
              {!pick && (
                <button type="button" className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:13}}
                  onClick={()=>setPick(true)}>+ 인맥 선택</button>
              )}
              {pick && (
                <div className="card fade" style={{padding:"12px 14px 4px",background:"#FBFAF7"}}>
                  <div className="row" style={{gap:9,background:"#F4F1EA",borderRadius:11,padding:"10px 12px",color:"var(--muted)",marginBottom:4}}>
                    {I.search({width:16,height:16})}
                    <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="이름 · 회사 검색"
                      style={{flex:1,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:13.5,color:"var(--ink)"}}/>
                    {q && <span onClick={()=>setQ("")} style={{cursor:"pointer"}}>✕</span>}
                  </div>
                  <div style={{maxHeight:200,overflowY:"auto"}}>
                    {found.length===0 && <div className="small" style={{textAlign:"center",padding:"18px 0"}}>검색 결과 없음</div>}
                    {found.map(c=>(
                      <div key={c.id} className="list-item row between" style={{padding:"11px 0",cursor:"pointer"}}
                        onClick={()=>{ setContactId(c.id); setPick(false); setQ(""); }}>
                        <div className="row" style={{gap:10,minWidth:0}}>
                          <div className="avatar" style={{width:34,height:34,borderRadius:11,fontSize:13}}>{c.init}</div>
                          <div style={{minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13.5}}>{c.person||c.co}</div>
                            <div className="small" style={{fontSize:11.5}}>{[contactRoleLine(c),c.co].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                        <Checkbox on={contactId===c.id}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="견적 제목 (비우면 자동)"
        style={{...quoteFieldStyle,marginBottom:10,display:compact?"none":"block"}}/>

      <div className="row" style={{gap:10,marginBottom:10}}>
        {!compact && (
          <select value={stage} onChange={e=>setStage(e.target.value)}
            style={{flex:1,...quoteFieldStyle,padding:"12px"}}>
            {["리드","견적","협상","성사","실패"].map(s=><option key={s}>{s}</option>)}
          </select>
        )}
        <input value={totalAmount} onChange={e=>setTotalAmount(e.target.value)} placeholder="견적 금액 · 부가세 포함(원) *"
          inputMode="numeric" style={{flex:1,...quoteFieldStyle}}/>
      </div>

      <div style={{marginBottom:12}}>
        <div className="small" style={{fontWeight:700,marginBottom:6}}>견적서 파일</div>
        {quoteFile ? (
          <div className="row between card" style={{padding:"10px 12px",gap:8}}>
            <div className="row" style={{gap:8,minWidth:0,flex:1}}>
              {I.quote({style:{color:"var(--accent-deep)",flex:"0 0 auto"}})}
              <span style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{quoteFile.name}</span>
            </div>
            <button type="button" className="chip" style={{padding:"5px 10px",fontSize:12}} onClick={()=>setQuoteFile(null)}>제거</button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:13,display:"flex",justifyContent:"center",gap:7}}
            onClick={pickQuoteFile}>
            {I.plus({width:15,height:15})} PDF · 엑셀 · 이미지 첨부
          </button>
        )}
      </div>

      <div className="row" style={{gap:10}}>
        {onCancel && (
          <button type="button" className="btn btn-ghost" style={{flex:1,padding:12}} onClick={onCancel} disabled={saving}>취소</button>
        )}
        <button type="button" className="btn btn-accent" style={{flex:1,padding:12}} onClick={save} disabled={saving}>
          {saving?"저장 중…":"견적 저장"}
        </button>
      </div>
    </div>
  );
}

function DealListRow({d}){
  const c=d.contact;
  const total=dealAmounts(d.supplyAmount).total;
  return (
    <div style={{padding:"13px 0",borderBottom:"1px solid var(--line)"}}>
      <div className="row between" style={{gap:10,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14}}>{d.title||"견적"}</div>
          {c && <div className="small" style={{marginTop:4,fontWeight:600}}>{contactQuoteLabel(c)}</div>}
          <span className="tag amber" style={{marginTop:6,display:"inline-block"}}>{d.stage}</span>
        </div>
        <div style={{fontWeight:700,flex:"0 0 auto",textAlign:"right"}}>
          <div>{formatWon(total)}</div>
          <div className="small" style={{fontWeight:500,marginTop:2}}>VAT 포함</div>
        </div>
      </div>
      {d.quoteKey && (
        <div style={{marginTop:10}}>
          <TodoAttachmentRow att={{
            key:d.quoteKey,
            name:fileNameFromKey(d.quoteKey),
            kind:/\.(png|jpe?g|gif|webp)$/i.test(d.quoteKey)?"image":"file",
          }}/>
        </div>
      )}
    </div>
  );
}

function TaskDetailView({data,back,onUpdated,onDeleted}){
  const seed=data||{};
  const [task,setTask]=useState(seed);
  const [status,setStatus]=useState(seed.status||"todo");
  const [detail,setDetailText]=useState(seed._raw?.detail||"");
  const [result,setResult]=useState(seed._raw?.result||"");
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [loading,setLoading]=useState(!!seed.id);

  const applyTodo=(row)=>{
    const ui=todoToUi(row);
    setTask(ui);
    setStatus(ui.status);
    setDetailText(row.detail||"");
    setResult(row.result||"");
  };

  const reload=useCallback(async ()=>{
    if(!seed.id) return;
    setLoading(true);
    try{
      const row=await api.getTodo(seed.id);
      applyTodo(row);
      onUpdated?.();
    }catch(e){ notifyError(e, e.message||"불러오기 실패"); }
    finally{ setLoading(false); }
  },[seed.id,onUpdated]);

  const refreshSubs=useCallback(async ()=>{
    if(!task.id) return;
    try{
      const row=await api.getTodo(task.id);
      applyTodo(row);
      onUpdated?.();
    }catch(e){ notifyError(e, e.message||"불러오기 실패"); }
  },[task.id,onUpdated]);

  useEffect(()=>{ reload(); },[reload]);

  const history=Array.isArray(task.history)?task.history:[];
  const attachments=Array.isArray(task.attachments)?task.attachments:[];
  const stLabel={todo:"할 일",doing:"진행 중",done:"완료"}[status]||"할 일";
  const stColor=status==="done"?"green":status==="doing"?"amber":"gray";

  const patch=async (body)=>{
    if(!task.id) return null;
    setSaving(true);
    try{
      const row=await api.updateTodo(task.id,body);
      applyTodo(row);
      onUpdated?.();
      return row;
    }catch(e){ notifyError(e, e.message); return null; }
    finally{ setSaving(false); }
  };

  const patchStatus=(s)=>patch({ status:s });
  const saveDetail=()=>patch({ detail });
  const saveResult=()=>patch({ result });

  const addAttachment=async ()=>{
    if(!task.id) return;
    try{
      const file=await pickAnyFile();
      setUploading(true);
      const key=await uploadFile(file);
      const kind=file.type?.startsWith("image/")?"image":"file";
      await patch({
        attachment:{ key, name:file.name||"첨부파일", kind, uploadedAt:new Date().toISOString() },
      });
    }catch(e){
      if(e?.message!=="파일이 선택되지 않았습니다") notifyError(e, e.message||"첨부 실패");
    }finally{ setUploading(false); }
  };

  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="할 일" title={task.t||"할 일"}/>
      <div className="pad" style={{marginTop:12,marginBottom:12}}>
        {loading && <div className="small" style={{textAlign:"center",padding:"12px 0"}}>최신 정보 불러오는 중…</div>}
        <div className="card" style={{padding:16}}>
          <div className="row" style={{gap:8,flexWrap:"wrap"}}>
            <span className={"tag "+stColor}>{stLabel}</span>
            {task.due&&task.due!=="-"&&<span className="tag gray">기한 {task.due}</span>}
            {task.createdLabel&&<span className="tag gray">등록 {task.createdLabel}</span>}
          </div>
          <div className="row" style={{gap:7,marginTop:13}}>
            {[["todo","할 일"],["doing","진행 중"],["done","완료"]].map(([s,l])=>(
              <button key={s} disabled={saving||loading} className={"chip"+(status===s?" on":"")} style={{flex:1,justifyContent:"center",display:"flex"}}
                onClick={()=>patchStatus(s)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="section-h">세부 항목</div>
        <NestedTodoList todos={[task]} onRefresh={refreshSubs} showAdd editable compact onTaskDeleted={onDeleted}/>

        <div className="section-h">상세</div>
        <div className="card" style={{padding:16}}>
          <textarea value={detail} onChange={e=>setDetailText(e.target.value)} onBlur={saveDetail}
            placeholder="설명을 적어보세요…"
            style={{width:"100%",minHeight:80,border:"none",outline:"none",fontFamily:"inherit",fontSize:13.5,lineHeight:1.6,resize:"vertical"}}/>
        </div>

        <div className="section-h">처리 결과</div>
        <div className="card" style={{padding:16}}>
          <textarea value={result} onChange={e=>setResult(e.target.value)} onBlur={saveResult}
            placeholder="완료 후 결과·메모를 남겨보세요…"
            style={{width:"100%",minHeight:72,border:"none",outline:"none",fontFamily:"inherit",fontSize:13.5,lineHeight:1.6,resize:"vertical"}}/>
        </div>

        <div className="section-h row between" style={{alignItems:"center"}}>
          <span>첨부파일 {attachments.length>0&&<span className="small">({attachments.length})</span>}</span>
          <button className="chip" style={{color:"var(--accent-deep)"}} disabled={uploading||!task.id} onClick={addAttachment}>
            {uploading?"업로드 중…":"+ 추가"}
          </button>
        </div>
        <div className="card" style={{padding:"4px 16px"}}>
          {attachments.length===0 && <div className="small" style={{textAlign:"center",padding:"18px 0"}}>첨부파일이 없어요</div>}
          {attachments.map((a,i)=><TodoAttachmentRow key={a.key||i} att={a}/>)}
        </div>

        <div className="section-h">처리 히스토리 {history.length>0&&<span className="small">({history.length})</span>}</div>
        <div className="card" style={{padding:"4px 16px"}}>
          {history.length===0 && <div className="small" style={{textAlign:"center",padding:"18px 0"}}>변경 기록이 없어요</div>}
          {history.map((h,i)=>(
            <div key={i} style={{padding:"13px 0",borderBottom:i<history.length-1?"1px solid var(--line)":"none"}}>
              <div style={{fontWeight:600,fontSize:13.5}}>{h.what}</div>
              <div className="small">{formatWhen(h.when)} · {h.who||"나"}</div>
            </div>
          ))}
        </div>
      </div>
      {task.id && (
        <DeleteBar label={task.t||"할 일"} onDelete={()=>api.deleteTodo(task.id)} afterDelete={onDeleted}/>
      )}
    </div>
  );
}

function RevenueDetailView({back,onRefresh,startAdd}){
  const [dealsData,setDealsData]=useState(null);
  const [adding,setAdding]=useState(!!startAdd);
  const reload=()=>api.listDeals().then(setDealsData).catch(()=>setDealsData({deals:[],revenueThisMonth:{supplyAmount:0},pipeline:0}));
  useEffect(()=>{ reload(); },[]);
  const deals=dealsData?.deals||[];
  const rev=dealAmounts(dealsData?.revenueThisMonth?.supplyAmount||0);
  const pipeTotal=dealAmounts(dealsData?.pipeline||0).total;
  const month=new Date().getMonth()+1;
  const done=deals.filter(x=>x.stage==="성사");
  const active=deals.filter(x=>!["성사","실패"].includes(x.stage));
  const afterSave=()=>{ setAdding(false); reload(); onRefresh?.(); toastSuccess("견적을 등록했어요"); };
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow={`${month}월 매출`} title="이번 달 매출"/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        {!dealsData && <div className="small" style={{textAlign:"center",padding:20}}>불러오는 중…</div>}
        {dealsData && <>
          <div className="row between" style={{marginBottom:12,alignItems:"center"}}>
            <div className="small" style={{fontWeight:700,color:"var(--muted)"}}>견적 · 매출 관리</div>
            <button type="button" className="chip" style={{color:"var(--accent-deep)",fontWeight:700}}
              onClick={()=>setAdding(v=>!v)}>{adding?"닫기":"+ 견적 추가"}</button>
          </div>
          {adding && <AddQuoteForm onCancel={()=>setAdding(false)} onSaved={afterSave}/>}
          <div className="card" style={{padding:16}}>
            <div className="row between" style={{padding:"6px 0"}}>
              <span style={{fontWeight:700}}>이번 달 확정 (VAT 포함)</span>
              <span style={{fontWeight:800,fontSize:18}}>{formatWon(rev.total)}</span>
            </div>
            <div className="small" style={{lineHeight:1.5,color:"var(--muted)"}}>
              공급가 {formatWon(rev.supply)} · 부가세 {formatWon(rev.vat)}
            </div>
          </div>
          <div className="section-h">성사</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {done.length===0 && <div className="small" style={{textAlign:"center",padding:16}}>성사 견적 없음</div>}
            {done.map(x=><DealListRow key={x.id} d={x}/>)}
          </div>
          <div className="section-h">진행 중 (파이프라인 {formatWon(pipeTotal)})</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {active.length===0 && <div className="small" style={{textAlign:"center",padding:16}}>진행 중인 견적 없음</div>}
            {active.map(x=><DealListRow key={x.id} d={x}/>)}
          </div>
        </>}
      </div>
    </div>
  );
}

function FollowupDetailView({back,todos,meetings,onRefresh}){
  const clients=getClients();
  const items=listOpenFollowupItems(todos,{meetings,contacts:clients});
  const [editKey,setEditKey]=useState(null);
  const [draft,setDraft]=useState("");
  const [savingKey,setSavingKey]=useState(null);

  const startEdit=(item)=>{
    setEditKey(item.key);
    setDraft(item.text||"");
  };

  const saveEdit=async (item)=>{
    if(!item.parent?.id || savingKey) return;
    const next=draft.trim();
    setEditKey(null);
    if(!next || next===item.text) return;
    setSavingKey(item.key);
    try{
      if(item.subId){
        const subs=(item.parent.subs||[]).map((s)=>
          s.id===item.subId?{...s,text:next}:s
        );
        await api.updateTodo(item.parent.id,{subs});
      }else{
        await api.updateTodo(item.parent.id,{title:next});
      }
      await onRefresh?.();
    }catch(e){
      notifyError(e,e.message||"수정 실패");
    }finally{
      setSavingKey(null);
    }
  };

  const toggleItem=async (item)=>{
    if(!item.parent?.id || editKey===item.key) return;
    try{
      if(item.subId){
        const subs=(item.parent.subs||[]).map((s)=>
          s.id===item.subId?{...s,done:!s.done}:s
        );
        await api.updateTodo(item.parent.id,{subs});
      }else{
        const next=item.parent.done||item.parent.status==="done"?"todo":"done";
        await api.updateTodo(item.parent.id,{status:next});
      }
      await onRefresh?.();
    }catch(e){
      notifyError(e,e.message||"할 일 업데이트 실패");
    }
  };

  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="미완료 액션" title={`후속 챙기기 · ${items.length}건`}/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        {items.length>0 && (
          <div className="small" style={{marginBottom:10,lineHeight:1.5,color:"var(--muted)"}}>
            텍스트를 탭하면 내용을 수정할 수 있어요.
          </div>
        )}
        {items.length===0 && <div className="small" style={{textAlign:"center",padding:40}}>미완료 할 일이 없어요</div>}
        <div className="card" style={{padding:"4px 16px"}}>
          {items.map((it,i)=>(
            <div key={it.key} className="row between" style={{padding:"15px 0",borderBottom:i<items.length-1?"1px solid var(--line)":"none",gap:10}}>
              <div className="row" style={{gap:10,flex:1,minWidth:0}}>
                <span onClick={()=>toggleItem(it)} style={{cursor:"pointer",flex:"0 0 auto"}}>
                  <Checkbox on={false}/>
                </span>
                <div style={{minWidth:0,flex:1}}>
                  {editKey===it.key ? (
                    <input
                      className="nt-edit-input"
                      value={draft}
                      autoFocus
                      disabled={savingKey===it.key}
                      onChange={(e)=>setDraft(e.target.value)}
                      onBlur={()=>saveEdit(it)}
                      onKeyDown={(e)=>{
                        if(e.key==="Enter"){ e.preventDefault(); saveEdit(it); }
                        if(e.key==="Escape") setEditKey(null);
                      }}
                      style={{width:"100%"}}
                    />
                  ) : (
                    <span
                      style={{fontWeight:600,lineHeight:1.4,cursor:"text"}}
                      onClick={()=>startEdit(it)}
                    >
                      {it.text}
                    </span>
                  )}
                  {it.groupLabel && <div className="small" style={{marginTop:3,color:"var(--muted)"}}>{it.groupLabel}</div>}
                </div>
              </div>
              {it.due!=="-" && <span className="tag gray" style={{flex:"0 0 auto"}}>{it.due}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventDetailView({data,back,onDeleted,linkedMeetings=[],onStartRec,openMeeting}){
  const e=data||{};
  const contacts=getClients().filter(c=>(e.contactIds||[]).includes(c.id)||c.id===e.contactId);
  const linkedPlace=e.savedPlaceId?getPlaces().find(p=>p.id===e.savedPlaceId):null;
  const navLat=e.placeLat??linkedPlace?.lat;
  const navLng=e.placeLng??linkedPlace?.lng;
  const navLabel=(e.place||linkedPlace?.name||"목적지").split(" · ")[0];
  const directionsUrl=(navLat!=null&&navLng!=null)||e.place||linkedPlace?.area
    ? kakaoDirectionsUrl({ address:e.place||linkedPlace?.area, lat:navLat, lng:navLng, label:navLabel })
    : "";
  const share=async ()=>{
    if(!e.id) return;
    try{
      const {shareUrl}=await api.shareEvent(e.id);
      const text=`${e.title}\n${formatEventWhen(e)}${e.place?`\n${e.place}`:""}`;
      if(navigator.share){ await navigator.share({title:e.title,text,url:shareUrl}); return; }
      if(shareUrl&&navigator.clipboard){ await navigator.clipboard.writeText(shareUrl); toastSuccess("공유 링크를 복사했어요"); }
    }catch(err){ notifyError(err,"공유 실패"); }
  };
  return (
    <div className="fade">
      <DetailHead back={back} eyebrow="일정" title={e.title||"일정"}/>
      <div className="pad" style={{marginTop:14,marginBottom:12}}>
        <div className="card" style={{padding:16}}>
          <div className="brk"><span className="small">시간</span><span style={{fontWeight:700}}>{formatEventWhen(e)}</span></div>
          {e.repeatYearly && (
            <div className="brk"><span className="small">반복</span><span style={{fontWeight:600}}>매년</span></div>
          )}
          <div className="brk"><span className="small">분류</span><span style={{fontWeight:600}}>{e.category||"캘린더"}</span></div>
          <div className="brk"><span className="small">장소</span><span style={{fontWeight:600}}>{e.place||"-"}</span></div>
          {contacts.length>0 && (
            <div className="brk"><span className="small">함께할 인맥</span>
              <span style={{fontWeight:600}}>{contacts.map(c=>c.person||c.co).join(", ")}</span></div>
          )}
          {linkedPlace && (
            <div className="brk"><span className="small">맛집</span><span style={{fontWeight:600}}>{linkedPlace.category}</span></div>
          )}
          {e.notes && <div className="brk"><span className="small">메모</span><span style={{fontWeight:500,lineHeight:1.5}}>{e.notes}</span></div>}
        </div>
        {directionsUrl && (
          <button type="button" className="btn btn-accent" style={{width:"100%",padding:14,marginTop:10}}
            onClick={()=>window.open(directionsUrl,"_blank","noopener")}>
            카카오맵 길찾기
          </button>
        )}
        {e.id && onStartRec && (
          <button type="button" className="btn btn-accent" style={{width:"100%",padding:14,marginTop:10}}
            onClick={()=>onStartRec(e)}>
            🎙 이 일정 미팅 녹음
          </button>
        )}
        {linkedMeetings.length>0 && (
          <>
            <div className="section-h" style={{marginTop:18}}>연결된 미팅 기록</div>
            <div className="card" style={{padding:"4px 16px"}}>
              {linkedMeetings.map((m,i)=>(
                <div key={m.id} className="row between" style={{padding:"14px 0",borderBottom:i<linkedMeetings.length-1?"1px solid var(--line)":"none",cursor:"pointer",gap:10}}
                  onClick={()=>openMeeting?.(m)}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,lineHeight:1.45}}>{m.oneLine||m.t}</div>
                    <div className="small" style={{marginTop:4}}>{m.createdLabel||"기록"}
                      {m.isProcessing?" · 변환 중":m.isFailed?" · 변환 실패":""}</div>
                  </div>
                  <span style={{color:"var(--muted)",flex:"0 0 auto"}}>{I.chevron({})}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {e.id && (
          <button type="button" className="btn btn-ghost" style={{width:"100%",padding:13,marginTop:10}} onClick={share}>일정 공유</button>
        )}
      </div>
      {e.id && (
        <DeleteBar label={e.title||"일정"} onDelete={()=>api.deleteEvent(e.id)} afterDelete={onDeleted}/>
      )}
    </div>
  );
}

function Detail({d,back,todos=[],onTodoToggle,onTodoUpdated,refreshTodos,onDeleted,prefs,meetings=[],startRecFromEvent,openMeeting,openEvent,onAppRefresh}){
  if(d.type==="meeting") return <MeetingDetailView data={d.data} back={back} refreshTodos={refreshTodos} onDeleted={onDeleted} meetingPresets={prefs?.meeting} openEvent={openEvent}/>;
  if(d.type==="task") return <TaskDetailView data={d.data} back={back} onUpdated={onTodoUpdated} onDeleted={onDeleted}/>;
  if(d.type==="revenue") return <RevenueDetailView back={back} onRefresh={onAppRefresh} startAdd={!!d.data?.addQuote}/>;
  if(d.type==="followup") return <FollowupDetailView back={back} todos={todos} meetings={meetings} onRefresh={refreshTodos}/>;
  const linkedMeetings=(meetings||[]).filter(m=>m.eventId===d.data?.id);
  return <EventDetailView data={d.data} back={back} onDeleted={onDeleted} linkedMeetings={linkedMeetings} onStartRec={startRecFromEvent} openMeeting={openMeeting}/>;
}

export default App;
