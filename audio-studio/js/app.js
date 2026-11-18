import { request, setCSRFToken, onAuthExpired, errorMessage, StudioError, API_BASE } from './api.js?v=20261117-2';
import { t, getLanguage, setLanguage, dateLabel, durationLabel } from './i18n.js?v=20261117-2';
import { setDraftOwner, readDrafts, saveDrafts } from './storage.js?v=20261117-2';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const uid = () => crypto.randomUUID();
const items = value => Array.isArray(value) ? value : value?.items || [];
const routes = ['clone', 'voices', 'vlog', 'dub', 'cover', 'music', 'assistant', 'creations', 'account'];
// Video pages need backend support; /config lists `dubbing` / `vlog` once it is deployed.
// Until /config has loaded they stay visible, so the nav does not jump on every visit.
const videoFeature = { dub:'dubbing', vlog:'vlog' };
const featureAvailable = route => !videoFeature[route] || !state.config || !!state.config[videoFeature[route]];
const activeStatuses = new Set(['queued', 'running', 'paused']);
// Same per-request cap as the iOS app's Pro tier; the textarea, its counter and the submit check all use it.
const SPEECH_MAX_CHARS = 500;
const navNames = () => ({ clone:t('Voice clone','声音克隆'), voices:t('AI voices','AI 声库'), vlog:t('AI narration','AI 旁白'), dub:t('Video dubbing','视频配音'), cover:t('Song cover','歌曲翻唱'), music:t('Music studio','音乐创作'), assistant:t('Creative assistant','创作助手'), creations:t('Creations','我的作品'), account:t('Account','账户') });
const vlogStyles = () => [['daily',t('Plain & casual','平实自然')],['slow_life',t('Calm & slow','舒缓安静')],['casual_funny',t('Light & funny','轻松幽默')],['travel',t('Curious','好奇观察')],['food',t('Sensory','感官细节')],['custom',t('My own tone','自定义')]];
const vlogGenres = () => [['auto',t('Detect automatically','自动识别')],['vlog',t('Life vlog','生活 vlog')],['promo',t('Product / ad','产品·广告')],['tutorial',t('Tutorial','教程')],['documentary',t('Scenery / documentary','风景·纪录')]];
const genreName = g => (vlogGenres().find(([v])=>v===g)||[g,g])[1];
// The brief stays one free field; these labels are what the backend's parse_brief reads as fields (its MAX_BRIEF_CHARS is 800).
const vlogBriefHint=()=>t('Title: …\nIntent: …\nPeople: me and my boyfriend K\nFacts: first time making tomato beef stew; third year working from home; picking up a parcel this afternoon','标题：…\n想表达：…\n出镜的人：我、男朋友小K\n事实：第一次做番茄牛腩；在家办公第三年；下午要去取快递');
const narratorVoices = () => [['coral',t('Coral · warm female','Coral · 温暖女声')],['nova',t('Nova · bright female','Nova · 明亮女声')],['shimmer',t('Shimmer · clear female','Shimmer · 清亮女声')],['sage',t('Sage · calm, neutral','Sage · 沉稳中性')],['ash',t('Ash · deep male','Ash · 低沉男声')],['echo',t('Echo · steady male','Echo · 稳重男声')],['verse',t('Verse · lively male','Verse · 活泼男声')],['ballad',t('Ballad · soft male','Ballad · 柔和男声')]];
const dubLanguages = () => [['en','English'],['zh','中文'],['ja',t('Japanese','日语')],['ko',t('Korean','韩语')],['es',t('Spanish','西班牙语')],['fr',t('French','法语')],['de',t('German','德语')],['it',t('Italian','意大利语')],['pt',t('Portuguese','葡萄牙语')],['ru',t('Russian','俄语')],['ar',t('Arabic','阿拉伯语')],['hi',t('Hindi','印地语')],['tr',t('Turkish','土耳其语')],['pl',t('Polish','波兰语')],['nl',t('Dutch','荷兰语')],['cs',t('Czech','捷克语')],['hu',t('Hungarian','匈牙利语')]];
const languageName = code => (dubLanguages().find(([value]) => value === code) || [code, code])[1];
const modeName = mode => ({ narration:t('Voiceover','一句话配音'), music:t('Music','音乐创作'), dialogue:t('Audio scene','多角色小剧场') }[mode] || mode);
const musicName = mode => ({ song:t('Song','歌曲'), rap:t('Rap','说唱'), instrumental:t('Instrumental','纯音乐') }[mode] || mode);
const kindName = kind => ({ speech:t('Voiceover','语音'), clone:t('Voice clone','声音克隆'), cover:t('Song cover','翻唱'), covers:t('Song cover','翻唱'), music:t('Music','音乐'), song:t('Song','歌曲'), rap:t('Rap','说唱'), instrumental:t('Instrumental','纯音乐'), stitch:t('Stitched audio','拼接音频'), dub:t('Video dubbing','视频配音'), video:t('Video','视频'), vlog:t('AI narration','AI 旁白'), vlog_script:t('Writing narration','撰写旁白脚本'), vlog_render:t('Creating narrated video','生成旁白视频'), assistant_plan:t('Preparing draft','创作草稿'), assistant_render:t('Creating project audio','生成项目音频'), project_plan:t('Preparing draft','创作草稿'), project_render:t('Creating project audio','生成项目音频'), plan:t('Preparing draft','创作草稿'), render:t('Creating project audio','生成项目音频') }[kind] || t('Creation','作品'));
const svg = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  clone:svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  voices:svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M17 6.5a4 4 0 0 1 0 6M19.5 4a7.5 7.5 0 0 1 0 11"/>'),
  vlog:svg('<rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/><path d="M7 10h5M7 14h3"/>'),
  dub:svg('<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="m10 8 4 2-4 2z"/><path d="M7 20h10"/>'),
  cover:svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>'),
  music:svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  assistant:svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  creations:svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  account:svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
};
const uploadIcons = {
  audio:svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  video:svg('<rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/>'),
};
// Object URLs for previews of files chosen in the upload zones; released once a file is no longer selected.
const previewURLs = new Map();
function filePreview(file,kind) {
  for(const [f,url] of previewURLs)if(![state.coverFile,state.dubFile,state.vlogFile].includes(f)){URL.revokeObjectURL(url);previewURLs.delete(f);}
  if(!file)return '';
  if(!previewURLs.has(file))previewURLs.set(file,URL.createObjectURL(file));
  const src=esc(previewURLs.get(file));
  return kind==='video'?`<video class="upload-preview" src="${src}" controls muted playsinline preload="metadata"></video>`:`<audio class="upload-preview" src="${src}" controls preload="metadata"></audio>`;
}
const emptyForms = () => ({
  clone:{ text:'', language:getLanguage(), voice_id:'', speed:1, pitch:0, volume:1 },
  music:{ lyrics:'', style:'', language:getLanguage(), bpm:100, duration:20, seed:Math.floor(Math.random()*2147483647), generation_mode:'song' },
  cover:{ voice_id:'', seconds:30 },
  dub:{ voice_id:'original', target_language:getLanguage()==='zh'?'en':'zh', source_language:'auto', background:'mute', title:'', consent:false },
  vlog:{ genre:'auto', brief:'', style:'daily', style_text:'', language:getLanguage(), title:'', consent:false, mode:'review', engine:'openai', narrator:'coral', narrator_style:'', voice_id:'', background:35 },
  assistant:{ mode:'narration', title:'', prompt:'', revision:'', target:'', consent:false, language:getLanguage() },
});
const state = { route:routes.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'clone', config:null, configError:null,
  session:{user:null,entitlements:{}}, catalog:[], voices:[], creations:[], projects:[], vlogs:[], currentVlogID:null, vlogDraft:null, vlogDirty:false, prices:[], jobs:new Map(), timers:new Map(), polling:new Set(), dismissedJobs:new Set(),
  forms:emptyForms(), currentProject:null, projectDirty:false, selected:[], voiceFilter:'all', voiceSearch:'', creationFilter:'all',
  coverFile:null, dubFile:null, vlogFile:null, voiceFile:null, voiceName:'', voiceLanguage:getLanguage(), voiceConsent:false, recorder:null, recording:false, recordingStart:0,
  busy:new Set(), requestIds:{}, voicesLoadedFor:null, returnRoute:null, audioObjectURL:null, videoObjectURL:null, transcript:null, noticeTimer:null, googlePromise:null, googleGeneration:0,
};
let draftTimer;
const workspace = $('#workspace');
const voiceName = voice => getLanguage() === 'zh' ? voice.name_zh || voice.name : voice.name_en || voice.name;
const allVoices = () => {
  const merged=new Map(state.catalog.map(v=>[v.id,v]));
  for(const voice of state.voices){const publicVoice=merged.get(voice.id);merged.set(voice.id,{...publicVoice,...voice,preview_url:publicVoice?.preview_url||voice.preview_url});}
  return [...merged.values()];
};
const ownVoices = () => state.voices.filter(v => v.kind === 'user');
const currentUserID = () => state.session.user?.id || null;
const projectHasActiveJob = id => !!id&&[...state.jobs.values()].some(job=>activeStatuses.has(job.status)&&job.project_id===id);
const busy = key => state.busy.has(key);
const disabled = condition => condition ? ' disabled' : '';
const option = (value,label,current) => `<option value="${esc(value)}"${String(value)===String(current)?' selected':''}>${esc(label)}</option>`;
const button = (action,label,{id='',tone='secondary',isDisabled=false,title='',extra=''}={}) => `<button type="button" class="button ${tone}" data-action="${action}"${id?` data-id="${esc(id)}"`:''}${title?` title="${esc(title)}" aria-label="${esc(title)}"`:''}${disabled(isDisabled)} ${extra}>${esc(label)}</button>`;
function formField(form,key,label,{type='text',min,max,step,placeholder='',rows=0,limit,choices=null,value,isDisabled=false}={}) {
  const current = value ?? state.forms[form]?.[key] ?? '';
  const attrs = `data-form="${form}" data-key="${key}" id="${form}-${key}"${disabled(isDisabled)}`;
  const control = choices ? `<select ${attrs}>${choices.map(([v,l])=>option(v,l,current)).join('')}</select>`
    : rows ? `<textarea ${attrs} rows="${rows}" placeholder="${esc(placeholder)}"${limit?` maxlength="${limit}"`:''}>${esc(current)}</textarea>`
    : `<input ${attrs} type="${type}" value="${esc(current)}"${min!==undefined?` min="${min}"`:''}${max!==undefined?` max="${max}"`:''}${step!==undefined?` step="${step}"`:''} placeholder="${esc(placeholder)}">`;
  return `<label class="field" for="${form}-${key}"><span>${esc(label)}</span>${control}${limit?`<small data-counter="${form}.${key}">${String(current).length} / ${limit}</small>`:''}</label>`;
}
function voiceSelect(form, value, label=t('Voice','音色'),extra='') {
  return `<label class="field"><span>${esc(label)}</span><select data-form="${form}" data-key="voice_id" ${extra}>${option('',t('Choose a voice','请选择音色'),value)}${allVoices().map(v=>option(v.id,`${voiceName(v)} · ${v.language==='zh'?'中文':'English'}${v.kind==='user'?t(' · My voice',' · 我的声音'):''}`,value)).join('')}</select></label>`;
}
function permissionNote(feature) {
  if (!state.session.user) return `<p class="field-note">${t('Browse and prepare your draft now. Sign in with Google to save voices and start creating.','可以先浏览和填写草稿；使用 Google 登录后，即可保存声音和开始创作。')}</p>`;
  if (state.session.entitlements?.[feature]) return '';
  return `<div class="access-note"><div><strong>${t('Membership access','会员权限')}</strong><p>${t('This account does not currently have access to this feature. View your plan in Account.','当前账号尚未获得此功能权限，请在账户中查看会员方案。')}</p></div>${button('account',t('View account','查看账户'))}</div>`;
}
function pageHeading(title,description,actions='') {
  const wave=`<div class="heading-wave" aria-hidden="true">${[14,30,46,26,58,38,64,32,50,22,42,60,28,48,18,36,54,24,40,16].map((h,i)=>`<i style="height:${h}px;animation-delay:${(i%7)*-0.17}s"></i>`).join('')}</div>`;
  return `<div class="page-heading"><div><p class="eyebrow">XSIMPLE AUDIO STUDIO</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:wave}</div>`;
}
function panel(title,body,subtitle='',className='') {
  return `<section class="panel ${className}"><div class="panel-heading"><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${body}</section>`;
}
function localNote() { return `<p class="local-note">${t('Unsubmitted drafts stay in this browser. Account creations are stored by the service.','未提交的草稿保留在此浏览器；账号中的作品由服务保存。')}</p>`; }
function saveLocal() {
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{
    const ok=saveDrafts({ forms:state.forms, projectDraft:state.projectDirty?state.currentProject:null,
      selectedProjectID:state.currentProject?.id || null, requestIds:state.requestIds,
      jobs:[...state.jobs.values()].filter(j=>activeStatuses.has(j.status)).map(j=>({id:j.id,kind:j.kind,request_key:j.request_key,project_id:j.project_id,request_id:j.request_id,vlog_id:j.vlog_id,auto:j.auto,render:j.render})) });
    if (!ok) notify(t('Your browser could not save the draft. Copy important text before leaving. (WEB_LOCAL_STORAGE)','浏览器无法保存草稿，离开前请复制重要文字。（WEB_LOCAL_STORAGE）'),true);
  },180);
}
function flushLocal() {
  clearTimeout(draftTimer);
  return saveDrafts({forms:state.forms,projectDraft:state.projectDirty?state.currentProject:null,selectedProjectID:state.currentProject?.id||null,
    requestIds:state.requestIds,jobs:[...state.jobs.values()].filter(j=>activeStatuses.has(j.status)).map(j=>({id:j.id,kind:j.kind,request_key:j.request_key,project_id:j.project_id,request_id:j.request_id,vlog_id:j.vlog_id,auto:j.auto,render:j.render}))});
}
function restoreLocal() {
  const saved=readDrafts(); state.forms=emptyForms(); state.currentProject=null; state.projectDirty=false; state.requestIds={};
  if (saved?.forms) for (const key of Object.keys(state.forms)) Object.assign(state.forms[key],saved.forms[key]||{});
  if (saved?.projectDraft && currentUserID()) { state.currentProject=saved.projectDraft; state.projectDirty=true; }
  state.selectedProjectID=saved?.selectedProjectID||null; state.requestIds=saved?.requestIds||{};
  return saved?.jobs||[];
}
function notify(message,isError=false) {
  clearTimeout(state.noticeTimer); const element=$('#notice'); element.textContent=message; element.classList.toggle('error',isError); element.hidden=false;
  state.noticeTimer=setTimeout(()=>{element.hidden=true;},isError?14000:6500);
}
function showError(error) { console.warn('Studio request failed:',error?.code||error?.name||'unknown'); notify(errorMessage(error),true); }
async function run(key,fn) {
  if (busy(key)) return; state.busy.add(key); render();if(key==='voice-upload'&&$('#voice-dialog').open)openVoiceDialog();
  try { await fn(); } catch(error) { showError(error); }
  finally {state.busy.delete(key); render();if(key==='voice-upload'&&$('#voice-dialog').open)openVoiceDialog();}
}
function navigate(route) { if(!routes.includes(route))return; location.hash=route; if(state.route===route)render(); }
function requireUser() {
  if (state.session.user) return true;
  flushLocal(); state.returnRoute=state.route; closeVoiceDialog(); navigate('account');
  notify(t('Sign in to continue. Your draft is kept here.','请登录后继续，草稿已保留。')); return false;
}
function requireAccess(feature) {
  if (!requireUser()) return false;
  if (state.session.entitlements?.[feature])return true;
  state.returnRoute=state.route; navigate('account'); notify(t('Check your membership access before creating.','请先查看账户会员权限。')); return false;
}
// A finished job frees its request ID only if that ID is still the one held for the key:
// a newer submission of the same kind (say, one whose POST timed out) keeps its ID, so retrying it
// cannot start and charge a second job.
function releaseRequestID(job) {
  if(!job?.request_key)return;
  const held=state.requestIds[job.request_key];
  if(!job.request_id||held?.id===job.request_id)delete state.requestIds[job.request_key];
}
// A saved voice can disappear (deleted here or on another device). Only judge once this account's
// voice list and the public catalog have both loaded, so a failed refresh never blanks a choice.
function voiceStillAvailable(id) {
  if(!id||id==='original')return true;
  if(allVoices().some(v=>v.id===id))return true;
  return !(state.voicesLoadedFor&&state.voicesLoadedFor===currentUserID()&&state.catalog.length);
}
// Render only voices parts that have no audio yet, so a deleted voice matters only for those parts' roles.
function projectNeedsMissingVoice(project) {
  const plan=project?.plan;if(!plan)return false;
  const done=new Set(project.completed_segment_ids||[]);
  const pending=new Set((plan.segments||[]).filter(s=>!done.has(s.id)).map(s=>s.role_id));
  return (plan.roles||[]).some(role=>pending.has(role.id)&&!voiceStillAvailable(role.voice_id));
}
function requireAvailableVoice(form,fallback='') {
  const id=state.forms[form]?.voice_id;
  if(voiceStillAvailable(id))return;
  state.forms[form].voice_id=fallback;saveLocal();
  throw new StudioError('WEB_VOICE_UNAVAILABLE');
}
function requestID(key,payload) {
  const signature=JSON.stringify(payload); const old=state.requestIds[key];
  if(old?.signature===signature)return old.id;
  const id=uid(); state.requestIds[key]={id,signature}; flushLocal();return id;
}

function render() {
  const focused=document.activeElement;
  const focusID=focused?.id, selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
  document.documentElement.lang=getLanguage()==='zh'?'zh-Hans':'en';
  $('#app-header').innerHTML=`<a class="studio-brand" href="./"><span class="brand-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>Xsimple<span class="brand-sub">Audio Studio</span></span></a><div class="header-actions"><a class="website-link" href="../index.html#products">${t('Company apps','公司产品')}</a><button class="language-button" type="button" data-action="language" aria-label="${t('Switch to Chinese','切换为英文')}">${getLanguage()==='zh'?'EN':'中文'}</button><button class="account-button" type="button" data-action="account"><span class="account-dot" aria-hidden="true">${esc(state.session.user?.name?.[0]?.toUpperCase()||'G')}</span><span>${esc(state.session.user?.name||t('Sign in','登录'))}</span></button></div>`;
  $('#sidebar').innerHTML=`<p class="nav-caption">${t('YOUR WORKSPACE','你的工作台')}</p><div class="nav-items">${routes.filter(featureAvailable).map(route=>`<a class="nav-item${state.route===route?' active':''}" href="#${route}"${state.route===route?' aria-current="page"':''}><span aria-hidden="true">${icons[route]}</span>${navNames()[route]}</a>`).join('')}</div><div class="sidebar-bottom"><span class="small-brand">XM LLC</span><a href="privacy.html">${t('Privacy & data','隐私与数据')}</a><a href="../index.html#contact">${t('Contact support','联系支持')}</a><p>${t('A little idea. A new sound.','让每一个想法，都有声音。')}</p></div>`;
  const views={clone:renderClone,voices:renderVoices,vlog:renderVlog,dub:renderDub,cover:renderCover,music:renderMusic,assistant:renderAssistant,creations:renderCreations,account:renderAccount};
  workspace.innerHTML=featureAvailable(state.route)?views[state.route]():renderComingSoon(state.route); workspace.setAttribute('aria-busy','false');
  renderJobs();
  if(state.route!==state.navShownRoute){state.navShownRoute=state.route;const active=$('#sidebar .nav-item.active');if(active?.scrollIntoView&&window.innerWidth<=700)active.scrollIntoView({block:'nearest',inline:'center'});}
  if(focusID) {const input=document.getElementById(focusID); if(input&&!input.disabled){input.focus({preventScroll:true});if(selection&&input.setSelectionRange)try{input.setSelectionRange(...selection);}catch{}}}
  if(state.route==='account'&&!state.session.user&&!busy('auth'))prepareGoogleSignIn();
}

function renderClone() {
  const form=state.forms.clone; const voice=allVoices().find(v=>v.id===form.voice_id);
  return pageHeading(t('Your words, your voice.','把文字变成你的声音。'),t('Choose a reference, write a few lines, and create a voiceover.','选择参考声音，写下文稿，生成属于你的配音。'))+
  `<div class="editor-grid"><div>${panel(t('Write your script','填写文稿'),
    formField('clone','text',t('Script','文稿'),{rows:9,limit:SPEECH_MAX_CHARS,placeholder:t('Write what you would like your voice to say…','写下你希望这个声音说的话…')})+
    `<div class="form-row">${formField('clone','language',t('Spoken language','朗读语言'),{choices:[['en','English'],['zh','中文']]})}</div>`+
    `<details class="settings"><summary>${t('Voice settings','声音参数')}</summary><div class="three-columns">${formField('clone','speed',t('Speed','语速'),{type:'number',min:.5,max:1.5,step:.05})}${formField('clone','pitch',t('Pitch · semitones','音高 · 半音'),{type:'number',min:-12,max:12,step:1})}${formField('clone','volume',t('Volume','音量'),{type:'number',min:.5,max:1.5,step:.05})}</div></details>`+
    permissionNote('speech')+`<div class="panel-actions">${button('speech',busy('speech')?t('Submitting…','正在提交…'):t('Generate voiceover','生成配音'),{tone:'primary',isDisabled:busy('speech')})}</div>`)}${localNote()}</div><div>${panel(t('Choose a voice','选择声音'),
      voiceSelect('clone',form.voice_id)+`${voice?`<div class="chosen-voice"><span class="voice-avatar">${esc(voiceName(voice).slice(0,1))}</span><div><strong>${esc(voiceName(voice))}</strong><small>${esc(voice.language==='zh'?'中文':'English')}</small></div>${button('preview-voice','▶',{id:voice.id,title:t('Preview voice','试听音色')})}</div>`:''}`+
      `<div class="stack-actions">${button('add-voice',t('Record or upload my voice','录制或上传我的声音'))}${button('voices',t('Explore AI voices','浏览 AI 声库'))}</div>`)+
      panel(t('A good reference','好的参考录音'),`<p class="muted">${t('Use one clear voice with little background noise. You must own the recording or have permission to use it.','选择单人说话、背景安静的清晰录音。请使用你拥有或已获授权的声音。')}</p>`, '', 'subtle')}</div></div>`;
}
function renderVoices() {
  const list=allVoices().filter(v=>(state.voiceFilter==='all'||(state.voiceFilter==='mine'?v.kind==='user':v.language===state.voiceFilter))&&`${voiceName(v)} ${v.role_en||''} ${v.role_zh||''}`.toLowerCase().includes(state.voiceSearch.toLowerCase()));
  return pageHeading(t('Find your sound.','找到合适的声音。'),t('Preview the real recordings, then use a voice in your next creation.','试听真实录音，为下一份作品挑选音色。'),button('add-voice',t('Add my voice','添加我的声音'),{tone:'primary'}))+
    `<div class="filter-bar"><div class="segmented">${[['all',t('All voices','全部')],['zh','中文'],['en','English'],['mine',t('My voices','我的声音')]].map(([v,l])=>`<button type="button" data-action="voice-filter" data-id="${v}" aria-pressed="${state.voiceFilter===v}">${l}</button>`).join('')}</div><label class="search-field"><span class="sr-only">${t('Search voices','搜索音色')}</span><input id="voice-search" data-search="voices" value="${esc(state.voiceSearch)}" placeholder="${t('Search voices…','搜索音色…')}"></label></div>`+
    `<div class="voice-grid">${list.map(v=>`<article class="voice-card"><div class="voice-card-top"><span class="voice-avatar ${v.language==='zh'?'warm':''}">${esc(voiceName(v).slice(0,1))}</span><span class="pill">${v.kind==='user'?t('MY VOICE','我的声音'):v.language==='zh'?'中文':'ENGLISH'}</span></div><h2>${esc(voiceName(v))}</h2><p>${esc(getLanguage()==='zh'?v.role_zh||t('Saved reference voice','已保存的参考声音'):v.role_en||t('Saved reference voice','已保存的参考声音'))}</p><div class="voice-card-actions">${button('preview-voice',t('▶ Listen','▶ 试听'),{id:v.id})}${button('use-voice',t('Use voice','使用音色'),{id:v.id,tone:'primary'})}</div>${v.kind==='user'?button('delete-voice',t('Delete voice','删除声音'),{id:v.id,tone:'text danger'}):''}</article>`).join('')}</div>${!list.length?emptyState(t('No voices here yet','这里还没有声音'),t('Try another filter, or add a recording of your own.','试试其他筛选条件，或添加自己的录音。')):''}`;
}
function renderCover() {
  const form=state.forms.cover; const max=Number(state.session.entitlements?.cover_max_seconds||30);
  return pageHeading(t('Give a song a new voice.','让歌曲换一种声音。'),t('Upload your song and choose an authorized voice reference.','上传歌曲，再选择你有权使用的参考声音。'))+
    `<div class="editor-grid"><div>${panel(t('Your song','导入歌曲'),`<label class="upload-zone"><span class="upload-symbol" aria-hidden="true">${uploadIcons.audio}</span><strong>${esc(state.coverFile?.name||t('Choose a song file','选择歌曲文件'))}</strong><span>${t('WAV, MP3, M4A and other supported audio files','WAV、MP3、M4A 等支持的音频文件')}</span><input id="cover-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" data-file="cover"></label>${filePreview(state.coverFile,'audio')}<p class="field-note">${t('Only upload a song you own or have permission to use. The selected song and voice are sent to the audio service when you generate.','请仅上传你拥有或已获授权的歌曲。点击生成后，所选歌曲与声音会发送到音频服务。')}</p>`+
    `<div class="form-row">${formField('cover','seconds',t('Cover length · seconds','翻唱长度 · 秒'),{type:'number',min:5,max,step:1})}<p class="field-note">${t(`Your account supports up to ${max} seconds.`,`当前账号最长支持 ${max} 秒。`)}</p></div>`+
    `<div class="panel-actions">${button('generate-cover',busy('cover')?t('Uploading…','正在上传…'):t('Create song cover','生成歌曲翻唱'),{tone:'primary',isDisabled:busy('cover')})}</div>`)}${localNote()}</div><div>${panel(t('Reference voice','参考声音'),voiceSelect('cover',form.voice_id)+`<div class="stack-actions">${button('add-voice',t('Record or upload my voice','录制或上传我的声音'))}${button('preview-voice',t('Preview selected voice','试听所选声音'),{id:form.voice_id,isDisabled:!form.voice_id})}</div>`)}<p class="field-note">${t('You can move between tools while a task runs. Closing this page may leave the server task running.','任务运行期间可以切换工具；关闭网页后，服务端任务可能继续。')}</p></div></div>`;
}
function renderComingSoon(route) {
  const title=route==='dub'?t('Video dubbing is on its way.','视频配音即将上线。'):t('AI narration is on its way.','AI 旁白即将上线。');
  return pageHeading(title,t('This part of the studio is being switched on. Voice clone, AI voices, song covers and music are ready now.','这部分功能正在开通中。声音克隆、AI 声库、歌曲翻唱和音乐创作现在就能使用。'))+
    panel(t('Meanwhile','在此之前'),`<p class="muted">${t('Your drafts on this page are kept in this browser and will be here when it opens.','此页面的草稿会保留在浏览器中，开通后可继续使用。')}</p><div class="panel-actions">${button('clone',t('Go to voice clone','前往声音克隆'),{tone:'primary'})}${button('voices',t('Explore AI voices','浏览 AI 声库'))}</div>`);
}
function renderDub() {
  const form=state.forms.dub; const limits=state.config?.dubbing||{}; const maxMinutes=Math.round((Number(limits.max_seconds)||600)/60); const maxMB=Math.round((Number(limits.max_bytes)||300*1024*1024)/1048576);
  const voice=form.voice_id&&form.voice_id!=='original'?allVoices().find(v=>v.id===form.voice_id):null;
  const consent=`<label class="consent-box"><input type="checkbox" data-form="dub" data-key="consent"${form.consent?' checked':''}><span><strong>${t('I have the rights to this video and allow processing','我拥有此视频的权利并同意处理')}</strong>${t('The video stays private in your account. Its speech is transcribed by our audio service; when the target language differs, the transcript text is sent to OpenAI for translation. Voices use our audio services.','视频仅保存在你的账号中。语音由我们的音频服务识别；目标语言与原语言不同时，识别出的文字会发送给 OpenAI 翻译。配音由我们的音频服务生成。')}</span></label>`;
  return pageHeading(t('Give your video a new voice.','让视频开口说另一种语言。'),t('Upload a video, pick a language and a voice. We transcribe, translate, re-voice and mix it back in one task.','上传视频，选择语言和音色。识别、翻译、配音、混流一次完成。'))+
    `<div class="editor-grid"><div>${panel(t('Your video','导入视频'),`<label class="upload-zone"><span class="upload-symbol" aria-hidden="true">${uploadIcons.video}</span><strong>${esc(state.dubFile?.name||t('Choose a video file','选择视频文件'))}</strong><span>${t(`MP4, MOV, WebM or MKV with sound · up to ${maxMinutes} minutes and ${maxMB} MB`,`MP4、MOV、WebM 或 MKV，需含声音 · 最长 ${maxMinutes} 分钟、${maxMB} MB`)}</span><input id="dub-file" type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv" data-file="dub"></label>${filePreview(state.dubFile,'video')}`+
    `<div class="form-row">${formField('dub','source_language',t('Spoken language in the video','视频原语言'),{choices:[['auto',t('Detect automatically','自动识别')],...dubLanguages()]})}${formField('dub','target_language',t('Dub into','配音语言'),{choices:dubLanguages()})}</div>`+
    `<p class="field-note">${form.source_language!=='auto'&&form.source_language===form.target_language?t('Same language: the video is re-voiced without translation.','原语言与配音语言相同：只换声音，不翻译。'):t('A different target language adds a translation step. Lines that run long are gently sped up to stay in sync.','目标语言不同时会先翻译。较长的句子会适度加速以保持同步。')}</p>`+
    `<div class="form-row">${formField('dub','background',t('Original soundtrack','原视频声音'),{choices:[['mute',t('Replace completely','完全替换')],['quiet',t('Keep softly in the background','以较低音量保留')]]})}${formField('dub','title',t('Title','作品名称'),{placeholder:t('Optional name for this creation','可选，为作品命名'),limit:200})}</div>`+
    consent+permissionNote('speech')+`<div class="panel-actions">${button('generate-dub',busy('dub')?t('Uploading…','正在上传…'):t('Dub this video','开始配音'),{tone:'primary',isDisabled:busy('dub')})}</div>`)}${localNote()}</div><div>${panel(t('Voice for the dub','配音声音'),
      `<label class="field"><span>${t('Voice','音色')}</span><select data-form="dub" data-key="voice_id">${option('original',t('The speaker in this video (cloned)','视频中的说话人（克隆原声）'),form.voice_id)}${allVoices().map(v=>option(v.id,`${voiceName(v)} · ${v.language==='zh'?'中文':'English'}${v.kind==='user'?t(' · My voice',' · 我的声音'):''}`,form.voice_id)).join('')}</select></label>`+
      (form.voice_id==='original'?`<p class="field-note">${t('Works best with one clear speaker and little background music. Choose a studio voice if the video is noisy.','适合单人清晰讲话、背景音乐少的视频。噪音较大时建议改选声库音色。')}</p>`:voice?`<div class="chosen-voice"><span class="voice-avatar">${esc(voiceName(voice).slice(0,1))}</span><div><strong>${esc(voiceName(voice))}</strong><small>${esc(voice.language==='zh'?'中文':'English')}</small></div>${button('preview-voice','▶',{id:voice.id,title:t('Preview voice','试听音色')})}</div>`:'')+
      `<div class="stack-actions">${button('add-voice',t('Record or upload my voice','录制或上传我的声音'))}${button('voices',t('Explore AI voices','浏览 AI 声库'))}</div>`)+
      panel(t('What to expect','处理说明'),`<p class="muted">${t('A one-minute video usually takes a few minutes. The task keeps running if you leave this page; the finished video appears in Creations with its script.','一分钟视频通常需要几分钟。离开页面后任务继续运行，完成后可在“我的作品”播放、下载并查看文稿。')}</p>`,'','subtle')}</div></div>`;
}
const currentVlog = () => state.vlogs.find(v=>v.id===state.currentVlogID)||null;
const vlogHasActiveJob = id => !!id&&([...state.jobs.values()].some(job=>activeStatuses.has(job.status)&&job.vlog_id===id)||['writing','rendering'].includes(state.vlogs.find(v=>v.id===id)?.status));
const vlogStatusLabel = status => ({uploaded:t('Uploaded','已上传'),writing:t('Writing script','正在撰写脚本'),ready:t('Script ready','脚本已就绪'),rendering:t('Creating video','正在生成视频')}[status]||status);
function vlogVoicePanel(locked=false) {
  const form=state.forms.vlog; const own=form.voice_id&&allVoices().find(v=>v.id===form.voice_id);
  return panel(t('Narration voice','旁白声音'),`<div class="segmented">${[['openai',t('Natural narrator','自然旁白音色')],['clone',t('My cloned voice','克隆我的声音')]].map(([v,l])=>`<button type="button" data-action="vlog-engine" data-id="${v}" aria-pressed="${form.engine===v}"${disabled(locked)}>${l}</button>`).join('')}</div>`+
    (form.engine==='openai'?formField('vlog','narrator',t('Voice','音色'),{choices:narratorVoices(),isDisabled:locked})+formField('vlog','narrator_style',t('Delivery · optional','语气 · 可选'),{placeholder:t('e.g. sleepy and slow, a little amused','例如：有点困、慢一点、带点笑意'),limit:300,isDisabled:locked})+`<p class="field-note">${t('Hosted natural voices read with a relaxed, conversational delivery. They cannot imitate a specific person.','托管的自然音色以放松、聊天的方式朗读，但不能模仿特定的人。')}</p>`
      :`<label class="field"><span>${t('Voice','音色')}</span><select data-form="vlog" data-key="voice_id"${disabled(locked)}>${option('',t('Choose a voice','请选择音色'),form.voice_id)}${allVoices().map(v=>option(v.id,`${voiceName(v)} · ${v.language==='zh'?'中文':'English'}${v.kind==='user'?t(' · My voice',' · 我的声音'):''}`,form.voice_id)).join('')}</select></label>${own?`<div class="chosen-voice"><span class="voice-avatar">${esc(voiceName(own).slice(0,1))}</span><div><strong>${esc(voiceName(own))}</strong><small>${esc(own.language==='zh'?'中文':'English')}</small></div>${button('preview-voice','▶',{id:own.id,title:t('Preview voice','试听音色')})}</div>`:''}<div class="stack-actions">${button('add-voice',t('Record or upload my voice','录制或上传我的声音'),{isDisabled:locked})}</div>`)+
    `<label class="field"><span>${t('Original sound under the narration','旁白下的原声音量')}</span><input id="vlog-background" data-form="vlog" data-key="background" type="range" min="0" max="100" step="5" value="${esc(form.background)}"${disabled(locked)}><small>${Number(form.background)===0?t('Muted','完全静音'):t(`${form.background}% of the original`,`原声 ${form.background}%`)}</small></label>`);
}
function listeningNotes(heard){
  if(!heard)return '';
  const speed=(heard.max_speedup>1?t(` · fastest line sped up ${esc(heard.max_speedup)}×`,` · 最快一句加速 ${esc(heard.max_speedup)} 倍`):'')+(heard.lost_seconds>0?t(` · the last ${esc(heard.lost_seconds)} s of narration ran past the end of the video and are lost`,` · 最后 ${esc(heard.lost_seconds)} 秒旁白超出视频结尾，已被截掉`):'');
  if(!heard.available)return `<p class="listening-note muted">${t('Listening check did not run (speech recognition unavailable).','试听没有运行（语音识别不可用）。')}${speed}</p>`;
  const label=code=>({words:t('wrong or missing words','读错或漏字'),rushed:t('rushed','太赶'),flat:t('flat intonation','语调太平'),loud:t('too loud','声音偏大'),quiet:t('too quiet','声音偏小'),breathy:t('breathy or whispered','气声太重'),clipped:t('distorted peaks','爆音'),pause:t('long gap inside the line','句中停顿过长'),long:t('too long for its moment','放不进这段时间'),late:t('late','偏晚'),unheard:t('retake not checked','重录未能复查')}[code]||esc(code));
  const line=id=>{const n=String(id||'').replace(/^line-/,'');return /^\d+$/.test(n)?t(`Line ${n}`,`第 ${n} 句`):esc(id);};
  const detail=(l,p)=>p.code==='late'?(l.cut_off>0.05?t(`pushed past the end of the video by earlier lines, so ${esc(l.cut_off)} s are lost; shorten those`,`被前面的句子挤出视频结尾，有 ${esc(l.cut_off)} 秒被截掉，请改短前面的句子`):l.shift>0?t(`${esc(l.shift)} s after its moment because earlier lines ran long; shorten those`,`比画面晚 ${esc(l.shift)} 秒，因为前面的句子太长，改短前面的句子`):''):p.code==='words'?t('give this line a listen: it may be misread, or a sound-alike the recognizer misheard','听一下这句：可能是读错了，也可能是同音字被听岔了'):p.code!=='long'?'':l.cut_off>0.05?t(`its last ${esc(l.cut_off)} s ran past the end of the video and are lost; shorten this line`,`最后 ${esc(l.cut_off)} 秒超出视频结尾，已被截掉，请改短这句`):l.speedup>1?t(`sped up ${esc(l.speedup)}×; shorten this line if it sounds hurried`,`加速了 ${esc(l.speedup)} 倍，听着赶可以改短这句`):t('shorten this line so it lands on time','改短这句才能准时');
  const kept=(heard.lines||[]).filter(l=>l.kept==='retake').length;
  const summary=(heard.open_problems?t(`Listening check: ${esc(heard.open_problems)} line(s) still have problems`,`试听：${esc(heard.open_problems)} 句仍有问题`):kept?t(`Listening check: ${kept} line(s) re-voiced, all pass`,`试听：重录 ${kept} 句，全部通过`):t('Listening check: every line passes','试听：每句都通过'))+speed;
  if(!heard.lines?.length)return `<p class="listening-note muted">${summary}</p>`;
  return `<details class="listening-note"><summary>${summary}</summary><ul class="studio-notes">${heard.lines.map(l=>`<li><strong>${line(l.id)}</strong> · ${l.kept==='retake'?t('re-voiced','已重录')+(l.first_problems?.length?`（${l.first_problems.map(p=>label(p.code)).join('、')}）`:''):''}${l.problems?.length?`${l.kept==='retake'?' · ':''}${l.kept?t('still ','仍然'):''}${l.problems.map(p=>label(p.code)).join(t(', ','、'))} <span class="muted">${l.problems.map(p=>detail(l,p)).join('；')}</span>`:''}${l.heard?`<br><span class="muted">${t('Heard:','听到：')} “${esc(l.heard)}”</span>`:''}</li>`).join('')}</ul></details>`;
}

function renderVlog() {
  const form=state.forms.vlog; const limits=state.config?.vlog||{}; const maxMinutes=Math.round((Number(limits.max_seconds)||600)/60); const maxMB=Math.round((Number(limits.max_bytes)||300*1024*1024)/1048576);
  const vlog=currentVlog(); const locked=!!vlog&&(vlogHasActiveJob(vlog.id)||['vlog-script','vlog-render','vlog-save'].some(busy));
  const consent=`<label class="consent-box"><input type="checkbox" data-form="vlog" data-key="consent"${form.consent?' checked':''}><span><strong>${t('I have the rights to this footage and allow AI drafting','我拥有此素材的权利并允许 AI 起稿')}</strong>${t('A few dozen downscaled frames, any speech heard in the footage, your brief and style are sent to OpenAI to write the script; natural narrator voices are also generated by OpenAI. The video itself stays private in your account.','会把几十张缩小的画面截图、素材中听到的对话、你的说明和风格发送给 OpenAI 撰写脚本；自然旁白音色也由 OpenAI 生成。视频本身仅保存在你的账号中。')}</span></label>`;
  const toolbar=`<div class="project-toolbar"><label class="field"><span>${t('Account vlogs','账号中的 vlog')}</span><select id="vlog-select" data-vlog-select${disabled(['vlog-script','vlog-render','vlog-save'].some(busy))}>${option('',t('New upload','新上传'),vlog?.id)}${state.vlogs.map(v=>option(v.id,`${v.title||v.name} · ${dateLabel(v.created_at)} · ${vlogStatusLabel(v.status)}`,vlog?.id)).join('')}</select></label>${vlog?`<span class="pill ${state.vlogDirty?'pending':vlog.status==='ready'?'ready':''}">${state.vlogDirty?t('Unsaved script edits','脚本有未保存修改'):vlogStatusLabel(vlog.status)}</span>${button('delete-vlog',t('Delete vlog','删除 vlog'),{id:vlog.id,tone:'text danger',isDisabled:locked})}`:''}</div>`;
  let body=pageHeading(t('Let your footage tell the story.','让素材自己开口说话。'),t('Upload a video without voice-over: a life vlog, a product promo, a tutorial or scenery. We work out what kind of video it is, write narration that only says what the footage shows, check every line against the frames, then voice and mix it.','上传没有旁白的视频：生活 vlog、产品广告、教程或风景都可以。先识别视频类型，再写只说画面里有的内容的旁白，每句都对照画面核查，最后配音混流。'),vlog?button('new-vlog',t('New vlog','新建 vlog'),{isDisabled:['vlog-script','vlog-render','vlog-save'].some(busy)}):'')+toolbar;
  if(!vlog){
    body+=`<div class="editor-grid"><div>${panel(t('Your footage','导入素材'),`<label class="upload-zone"><span class="upload-symbol" aria-hidden="true">${uploadIcons.video}</span><strong>${esc(state.vlogFile?.name||t('Choose a video file','选择视频文件'))}</strong><span>${t(`MP4, MOV, WebM or MKV · up to ${maxMinutes} minutes and ${maxMB} MB · sound optional`,`MP4、MOV、WebM 或 MKV · 最长 ${maxMinutes} 分钟、${maxMB} MB · 可以没有声音`)}</span><input id="vlog-file" type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv" data-file="vlog"></label>${filePreview(state.vlogFile,'video')}`+
      formField('vlog','brief',t('What is this video about? · optional','这个视频是关于什么的？· 可选'),{rows:5,limit:800,placeholder:vlogBriefHint()})+
      `<div class="field"><span>${t('What kind of video is it?','视频类型')}</span><div class="segmented">${vlogGenres().map(([v,l])=>`<button type="button" data-action="vlog-genre" data-id="${v}" aria-pressed="${form.genre===v}">${l}</button>`).join('')}</div><small class="field-note">${t('Automatic detection weighs product shots, app screens, on-screen captions and presenters against casual everyday footage. Pick a type to override it.','自动识别会根据产品镜头、App 界面、屏幕文案、讲解人与日常随手拍等画面线索判断；也可以手动指定。')}</small></div>`+
      `<div class="field"><span>${t('Tone','语气')}</span><div class="segmented">${vlogStyles().map(([v,l])=>`<button type="button" data-action="vlog-style" data-id="${v}" aria-pressed="${form.style===v}">${l}</button>`).join('')}</div></div>`+
      (form.style==='custom'?formField('vlog','style_text',t('Describe the style','描述你想要的风格'),{rows:2,limit:300,placeholder:t('Dry humour, short sentences, a bit tired but happy…','冷幽默、短句、有点累但开心…')}):formField('vlog','style_text',t('Extra direction · optional','补充要求 · 可选'),{placeholder:t('e.g. mention the dog, keep it short','例如：提一下那只狗，少说一点'),limit:300}))+
      `<div class="form-row">${formField('vlog','language',t('Narration language','旁白语言'),{choices:[['zh','中文'],['en','English']]})}${formField('vlog','title',t('Title · optional','标题 · 可选'),{limit:120,placeholder:t('Name this vlog','给这条 vlog 起个名字')})}</div>`+
      `<div class="segmented">${[['review',t('Show me the script first (recommended)','先看脚本再出片（推荐）')],['auto',t('Go straight to the video','直接出片')]].map(([v,l])=>`<button type="button" data-action="vlog-mode" data-id="${v}" aria-pressed="${form.mode===v}">${l}</button>`).join('')}</div><p class="field-note">${form.mode==='review'?t('You will be able to edit every line before any voice is generated.','配音之前可以逐句修改脚本。'):t('The script is voiced as soon as it is written. You can still edit lines and re-create the video afterwards.','脚本写好后立即配音；之后仍可修改台词并重新生成视频。')}</p>`+
      consent+permissionNote('speech')+`<div class="panel-actions">${button('generate-vlog-script',busy('vlog-script')?t('Uploading…','正在上传…'):t('Write my narration','开始写旁白'),{tone:'primary',isDisabled:busy('vlog-script')})}</div>`)}${localNote()}</div><div>${vlogVoicePanel()}${panel(t('How it works','处理说明'),`<ol class="workflow-list"><li><span>1</span><div><strong>${t('Watch & classify','看片并识别类型')}</strong><p>${t('Frames from every shot are read; the video is classified (vlog, promo, tutorial, scenery) from visible evidence, and a ledger of checkable facts is written.','逐镜抽帧看片，按画面证据判断是 vlog、广告、教程还是风景，并整理一份可核查的事实清单。')}</p></div></li><li><span>2</span><div><strong>${t('Plan & write','规划并写稿')}</strong><p>${t('Narration windows are planned for that genre, and every line must cite the facts it uses.','按该类型的结构规划说话的位置，每句旁白都必须标明依据哪条事实。')}</p></div></li><li><span>3</span><div><strong>${t('Fact-check & edit','核查与审稿')}</strong><p>${t('Each line is checked against the frames in its own time window; invented claims and lines that miss their picture go back for repair, and whatever still fails is cut.','每句都对照它所在时间段的画面核查，编造的内容和对不上画面的句子会退回重写，仍不合格的直接删掉。')}</p></div></li><li><span>4</span><div><strong>${t('Voice & mix','配音混流')}</strong><p>${t('Each line is voiced with its delivery note, placed on the timeline and mixed over the original sound.','按语气提示逐句配音，摆上时间轴并与原声混合。')}</p></div></li></ol>`,'','subtle')}</div></div>`;
    return body;
  }
  const draft=state.vlogDraft; const outputs=state.creations.filter(c=>vlog.creation_ids?.includes(c.id));
  body+=`<div class="editor-grid assistant-grid"><div>`;
  if(!draft)body+=panel(t('Script','旁白脚本'),`<p class="muted">${vlog.status==='writing'?t('The script is being written. This usually takes a minute or two.','正在撰写脚本，通常需要一两分钟。'):t('No script yet. Write one below.','还没有脚本，可以在下方生成。')}</p>`);
  else body+=panel(t('Review the script','审阅脚本'),`<fieldset class="plain-fieldset"${disabled(locked)}><label class="field"><span>${t('Title','标题')}</span><input id="vlog-title" data-vlog-title value="${esc(draft.title)}" maxlength="120"></label><div class="segment-list">${draft.lines.map((line,i)=>`<article class="segment"><div class="segment-heading"><h3>${t(`Line ${i+1}`,`第 ${i+1} 句`)}</h3><div class="line-times"><label><span class="sr-only">${t('Start','开始')}</span><input data-vlog-line="${i}" data-line-key="start" type="number" min="0" max="${esc(vlog.duration||600)}" step="0.1" value="${esc(line.start)}"></label><span>→</span><label><span class="sr-only">${t('End','结束')}</span><input data-vlog-line="${i}" data-line-key="end" type="number" min="0" max="${esc(vlog.duration||600)}" step="0.1" value="${esc(line.end)}"></label><span class="muted">${t('s','秒')}</span></div></div><label class="field"><span class="sr-only">${t('Line text','台词')}</span><textarea id="vlog-line-${i}" data-vlog-line="${i}" data-line-key="text" rows="2" maxlength="400">${esc(line.text)}</textarea><small>${(line.text||'').length} / 400</small></label><label class="field delivery-field"><span>${t('Delivery note · optional','语气提示 · 可选')}</span><input data-vlog-line="${i}" data-line-key="delivery" maxlength="200" value="${esc(line.delivery||'')}" placeholder="${t('e.g. quiet, a bit tired, smile on the last word','例如：轻一点、有点累、最后一个词带笑')}"></label><div class="segment-actions">${button('delete-line',t('Remove line','删除这句'),{id:String(i),tone:'text danger'})}</div></article>`).join('')}</div>${button('add-line',t('+ Add a line','+ 添加一句'),{tone:'secondary'})}</fieldset><p class="field-note">${t('Keep lines short enough to say in their time window; long lines are gently sped up and may drift. Changed lines are voiced again; unchanged lines are reused.','每句尽量能在时间窗内说完，过长会被加速或顺延。修改过的句子会重新配音，没改的直接复用。')}</p><div class="panel-actions">${button('save-script',busy('vlog-save')?t('Saving…','正在保存…'):t('Save script','保存脚本'),{isDisabled:locked||!state.vlogDirty})}${button('render-vlog',busy('vlog-render')?t('Submitting…','正在提交…'):t('Create the video','生成旁白视频'),{tone:'primary',isDisabled:locked})}</div>`);
  if(vlog.studio)body+=studioNotesPanel(vlog.studio);
  body+=panel(t('Write it again','重新写一版'),`<p class="muted">${t('Change the type, brief or tone and write a new script. The current script is replaced; your voice settings stay.','修改类型、说明或语气后重新生成脚本，会替换当前脚本，声音设置保留。')}</p>${formField('vlog','brief',t('What is this video about?','这个视频是关于什么的？'),{rows:4,limit:800,placeholder:vlogBriefHint(),isDisabled:locked})}${`<div class="field"><span>${t('What kind of video is it?','视频类型')}</span><div class="segmented">${vlogGenres().map(([v,l])=>`<button type="button" data-action="vlog-genre" data-id="${v}" aria-pressed="${form.genre===v}"${disabled(locked)}>${l}</button>`).join('')}</div><small class="field-note">${t('Automatic detection weighs product shots, app screens, on-screen captions and presenters against casual everyday footage. Pick a type to override it.','自动识别会根据产品镜头、App 界面、屏幕文案、讲解人与日常随手拍等画面线索判断；也可以手动指定。')}</small></div>`}<div class="segmented">${vlogStyles().map(([v,l])=>`<button type="button" data-action="vlog-style" data-id="${v}" aria-pressed="${form.style===v}"${disabled(locked)}>${l}</button>`).join('')}</div>${formField('vlog','style_text',form.style==='custom'?t('Describe the style','描述你想要的风格'):t('Extra direction · optional','补充要求 · 可选'),{limit:300,isDisabled:locked})}${consent}<div class="panel-actions">${button('rewrite-script',t('Write a new script','重新生成脚本'),{isDisabled:locked})}</div>`);
  body+=`${localNote()}</div><div>${vlogVoicePanel(locked)}${panel(t('Finished videos','已生成的视频'),outputs.length?`<div class="creation-list compact">${outputs.map(c=>`<article class="creation-row"><div class="creation-info"><h2>${esc(c.title)}</h2><p><span>${durationLabel(c.duration)}</span><span>${dateLabel(c.created_at)}</span></p></div><div class="creation-actions">${button('play-creation','▶',{id:c.id,tone:'play-button',title:t('Play video','播放视频')})}${button('download-creation','↓',{id:c.id,tone:'icon-button',title:t('Download video','下载视频')})}</div>${listeningNotes(c.listening)}</article>`).join('')}</div>`:`<p class="muted">${t('Videos you create from this script appear here and in Creations.','用这份脚本生成的视频会出现在这里和“我的作品”。')}</p>`)}${panel(t('Footage','素材信息'),`<p class="field-note">${esc(vlog.name)} · ${durationLabel(vlog.duration)} · ${vlog.language==='zh'?'中文':'English'}${vlog.dialogue_available===false?' · '+t('speech recognition was unavailable','语音识别当时不可用'):''}</p>`,'','subtle')}</div></div>`;
  return body;
}
function studioNotesPanel(studio){
  const lineLabel=id=>{const n=String(id||'').replace(/^line-/,'');return /^\d+$/.test(n)?t(`Line ${n}`,`第 ${n} 句`):t('Whole script','整体');};
  const criterion=c=>({genre_fit:t('Fits the genre','符合类型'),grounded:t('Grounded','有画面依据'),specific:t('Specific','具体不空泛'),adds_meaning:t('Adds meaning','不复述画面'),hook:t('Opening hook','开头抓人'),spoken:t('Sounds spoken','口语自然'),rhythm:t('Rhythm & silence','节奏留白'),structure:t('Structure & timing','结构与卡点')}[c]||c);
  const confidence=c=>({high:t('high confidence','把握高'),medium:t('medium confidence','把握中等'),low:t('low confidence','把握低')}[c]||c);
  const head=`<p><strong>${t('Video type','视频类型')}</strong> · ${esc(genreName(studio.genre))}${studio.requested_genre==='auto'?` <span class="muted">(${t('detected','自动识别')}, ${esc(confidence(studio.genre_confidence))})</span>`:` <span class="muted">(${t('chosen by you','你指定的')})</span>`}</p>`+
    (studio.genre_mismatch?`<p class="job-error">${esc(t(`The footage looks like ${genreName(studio.detected_genre)}, not the type you chose. The script follows your choice.`,`画面看起来更像「${genreName(studio.detected_genre)}」，与你指定的类型不同；脚本按你的选择写。`))}</p>`:'')+
    (studio.genre_evidence?.length?`<ul class="studio-notes">${studio.genre_evidence.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:'')+
    (studio.analysis?.subject?`<p class="muted">${esc(studio.analysis.subject)}${studio.analysis.product_promise?' · '+esc(studio.analysis.product_promise):''}</p>`:'');
  const facts=studio.facts?.length?`<details class="studio-round"><summary>${t(`Fact ledger · ${studio.facts.length} facts`,`事实清单 · ${studio.facts.length} 条`)}</summary><ul class="studio-notes">${studio.facts.map(f=>`<li><strong>${esc(f.id)}</strong> ${esc(Number(f.start).toFixed(1))}–${esc(Number(f.end).toFixed(1))}s · ${esc(f.text)}${f.certainty==='likely'?` <span class="muted">(${t('likely','可能')})</span>`:''}</li>`).join('')}</ul></details>`:'';
  const pitchCriterion=c=>c==='flow'?t('Flow','连贯'):criterion(c);
  const pitch=studio.pitch?.length>1?`<details class="studio-round"><summary>${t(`Table read · ${studio.pitch.length} drafts`,`试读 · ${studio.pitch.length} 版草稿`)}</summary>${studio.pitch.map(d=>`<p><span class="pill ${d.chosen?'ready':'pending'}">${d.chosen?t('Chosen','选用'):t(`Draft ${d.draft}`,`第 ${d.draft} 版`)}</span> ${esc(d.angle||'')}${d.must?` <span class="muted">· ${t(`${d.must} rule problems`,`${d.must} 处规则问题`)}</span>`:''}</p><div class="score-grid">${Object.entries(d.scores||{}).map(([k,v])=>`<span class="score ${v<=3?'low':''}">${esc(pitchCriterion(k))} <strong>${esc(v)}</strong></span>`).join('')}</div><ul class="studio-notes">${(d.lines||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${d.note?`<p class="muted">${esc(d.note)}</p>`:''}`).join('')}</details>`:'';
  const rounds=(studio.rounds||[]).map(r=>{
    const label=r.final_check?t('Final check','最终核查'):t(`Round ${r.round}`,`第 ${r.round} 轮`);
    const checks=(r.validation||[]).slice().sort((a,b)=>(a.severity==='must'?0:1)-(b.severity==='must'?0:1));
    const scores=r.editor?.scores?.length?`<div class="score-grid">${r.editor.scores.map(sc=>`<span class="score ${sc.score<=3?'low':''}" title="${esc(sc.note||'')}">${esc(criterion(sc.criterion))} <strong>${esc(sc.score)}</strong></span>`).join('')}</div>`:'';
    return `<details class="studio-round"><summary><span class="pill ${r.verdict==='approve'?'ready':'pending'}">${r.verdict==='approve'?t('Passed','通过'):r.final_check?t('Not signed off','未签发'):t('Sent back','退回')}</span> ${label} · ${t(`${r.supported}/${r.claims} checkable claims backed by the frames`,`${r.supported}/${r.claims} 条可核查内容有画面依据`)}</summary>`+
      (r.line_problems?.length?`<p><strong>${t('Frame check','画面核查')}</strong></p><ul class="studio-notes">${r.line_problems.map(l=>`<li><strong>${lineLabel(l.id)}</strong> “${esc(l.text)}”<br>${l.problems.map(esc).join('<br>')}</li>`).join('')}</ul>`:'')+
      (checks.length?`<p><strong>${t('Measured checks','规则检查')}</strong></p><ul class="studio-notes">${checks.map(v=>`<li>${v.severity==='must'?`<span class="pill pending">${t('must fix','必须改')}</span> `:''}<strong>${lineLabel(v.id)}</strong> · ${esc(v.detail)}</li>`).join('')}</ul>`:'')+
      (r.editor?`<p><strong>${t('Editor','主编')}</strong>${r.editor.overall?` · ${esc(r.editor.overall)}`:''}</p>${scores}${r.editor.lines?.length?`<ul class="studio-notes">${r.editor.lines.map(n=>`<li><strong>${lineLabel(n.id)}</strong> · ${n.action==='cut'?t('cut','删掉'):t('rewrite','重写')}${n.note?`：${esc(n.note)}`:''}</li>`).join('')}</ul>`:''}${r.editor.flagged_phrases?.length?`<p class="muted">${t('Flagged phrases:','被标记的用词：')} ${r.editor.flagged_phrases.map(esc).join(' · ')}</p>`:''}`:'')+`</details>`;}).join('');
  // cut_lines holds three kinds of cut. The writer cut a line while revising (reason editor, repetition or measured, or an ungrounded line cut in a round before the chosen one); the editor marked a line cut in the chosen version itself, which goes after that version is chosen (reason editor, round the chosen round); the gate removed a line that still failed in the chosen version (reason rule or ungrounded; records without a reason are older gate cuts).
  const editorCut=l=>l.reason==='editor'&&Number(l.round)===Number(studio.chosen_round);
  const revisionCut=l=>!editorCut(l)&&(l.reason==='editor'||l.reason==='repetition'||l.reason==='measured'||(l.reason==='ungrounded'&&Number(l.round)<Number(studio.chosen_round)));
  const gateCuts=(studio.cut_lines||[]).filter(l=>!revisionCut(l)&&!editorCut(l)),revisionCuts=(studio.cut_lines||[]).filter(revisionCut),editorCuts=(studio.cut_lines||[]).filter(editorCut);
  const cutList=(title,lines)=>lines.length?`<p><strong>${title}</strong></p><ul class="studio-notes">${lines.map(l=>`<li>“${esc(l.text)}”<br><span class="muted">${(l.problems||[]).map(esc).join('<br>')}</span></li>`).join('')}</ul>`:'';
  const cut=cutList(t('Removed before voicing','配音前已删除'),gateCuts)+cutList(t("Cut on the editor's note before voicing",'配音前按主编意见删掉'),editorCuts)+cutList(t('Cut during revision','修改时删掉'),revisionCuts);
  // The sentences speak of the version that is voiced, which may be an earlier one than the last round. A version the editor had no low score on is only unapproved because of a measured problem, should or must.
  const chosenRound=(studio.rounds||[]).find(r=>r.round===studio.chosen_round)||(studio.rounds||[]).slice(-1)[0];
  const lowScores=chosenRound?.editor?.scores?.some(sc=>sc.score<=3);
  const checksOpen=chosenRound?.validation?.some(v=>v.severity==='must')||(chosenRound?.validation?.length&&!lowScores);
  // A version is approved with low scores only when those scores' notes all reopened lines the editor had signed off earlier: that is no sign-off of this version.
  const summary=studio.approved?(lowScores?t("Every line passed the frame check and no measured check is left blocking this version. The editor's low scores below only went back to lines it had signed off earlier, so they do not hold it back.",'这一版每句都通过了画面核查，规则检查也没有必须改的问题。下方的低分只针对主编之前已签发的句子，不影响这一版。'):t('The editor signed off this version, every line passed the frame check, and no measured check is left blocking it.','这一版主编已签发，每句都通过了画面核查，规则检查也没有必须改的问题。')):gateCuts.length?t('Lines that still failed in this version were removed before voicing.','这一版仍不合格的句子已在配音前删除。'):checksOpen?t('Some measured checks are still open on this version, for example a line too long for its moment. See the rounds below.','这一版还有规则检查没通过，比如句子放不进它的时间段，详情见下方各轮记录。'):t('The editor did not sign this version off, though every line passed the frame check. See the rounds below for what the editor would still change.','这一版主编没有签发，但每句都通过了画面核查。主编还想改什么，见下方各轮记录。');
  const lastRound=(studio.rounds||[]).at(-1)?.round;
  const chosen=studio.chosen_round&&lastRound&&studio.chosen_round!==lastRound?`<p class="field-note">${esc(t(`The script uses the version from round ${studio.chosen_round}, which ranked first on the frame check, then the measured checks, then the editor's scores.`,`脚本采用了第 ${studio.chosen_round} 轮的版本：按画面核查、规则检查、主编评分依次比较，它排在最前。`))}</p>`:'';
  return panel(t('Studio notes','工作室审稿记录'),`<p class="field-note">${esc(summary)}</p>${chosen}${head}${facts}${pitch}${rounds}${cut}`,'','subtle');
}
function setCurrentVlog(id){const vlog=state.vlogs.find(v=>v.id===id)||null;state.currentVlogID=vlog?.id||null;state.vlogDraft=vlog?.script?structuredClone({title:vlog.script.title||vlog.title,lines:vlog.script.lines}):null;state.vlogDirty=false;if(vlog){if(vlog.brief!==undefined&&vlog.brief!==null)state.forms.vlog.brief=vlog.brief;if(vlog.style)state.forms.vlog.style=vlog.style;if(vlog.genre)state.forms.vlog.genre=vlog.genre;if(vlog.style_text!==undefined&&vlog.style_text!==null)state.forms.vlog.style_text=vlog.style_text;if(vlog.language)state.forms.vlog.language=vlog.language;}saveLocal();}
function syncVlogDraft(){const vlog=currentVlog();if(!vlog){if(state.currentVlogID){state.currentVlogID=null;state.vlogDraft=null;state.vlogDirty=false;}return;}if(!state.vlogDirty)state.vlogDraft=vlog.script?structuredClone({title:vlog.script.title||vlog.title,lines:vlog.script.lines}):null;}
function vlogVoiceSpec(){const f=state.forms.vlog;return f.engine==='clone'?{engine:'clone',voice_id:f.voice_id}:{engine:'openai',voice:f.narrator,...(f.narrator_style.trim()?{style:f.narrator_style.trim()}:{})};}
async function saveVlogScript(){const vlog=currentVlog();if(!vlog||!state.vlogDraft)return null;if(!state.vlogDirty)return vlog;const lines=state.vlogDraft.lines.map(l=>({id:l.id,start:Number(l.start),end:Number(l.end),text:String(l.text||'').trim(),...(String(l.delivery||'').trim()?{delivery:String(l.delivery).trim()}:{})})).filter(l=>l.text);if(!lines.length)throw new StudioError('WEB_INVALID_SCRIPT');const result=await request(`/vlogs/${encodeURIComponent(vlog.id)}/script`,{method:'PUT',body:{version:vlog.script_version,title:(state.vlogDraft.title||'').trim()||vlog.title||'Vlog',lines}});state.vlogs=state.vlogs.map(v=>v.id===result.id?result:v);state.vlogDirty=false;setCurrentVlog(result.id);return result;}
async function renderVlog_(){const vlog=currentVlog();if(!vlog)return;if(!requireAccess('speech'))return;const f=state.forms.vlog;if(f.engine==='clone'&&!f.voice_id)throw new StudioError('WEB_INVALID_VOICE');if(f.engine==='clone')requireAvailableVoice('vlog');const saved=await saveVlogScript();if(!saved?.script)throw new StudioError('WEB_INVALID_SCRIPT');const job=await submitJob('vlog-render:'+vlog.id,`/vlogs/${encodeURIComponent(vlog.id)}/render`,{voice:vlogVoiceSpec(),background_volume:Number(f.background)/100,version:saved.script_version});if(job){job.vlog_id=vlog.id;flushLocal();await refreshData();}}
async function autoRenderVlog(job){const vlogID=job.result?.video_id;if(!vlogID||!job.render)return;const vlog=state.vlogs.find(v=>v.id===vlogID);if(!vlog?.script)return;const started=await submitJob('vlog-render:'+vlogID,`/vlogs/${encodeURIComponent(vlogID)}/render`,{voice:job.render.voice,background_volume:job.render.background_volume,version:vlog.script_version});if(started){started.vlog_id=vlogID;flushLocal();}}
function musicFields(form,music,isProject=false) {
  const attr=(key)=>isProject?`data-music="${key}"`:`data-form="${form}" data-key="${key}"`;
  const control=(key,label,type='text',more='')=>`<label class="field"><span>${label}</span><input id="${form}-${key}" ${attr(key)} type="${type}" value="${esc(music[key])}" ${more}></label>`;
  return `<div class="segmented music-modes">${['song','rap','instrumental'].map(mode=>`<button type="button" data-action="${isProject?'project-music-mode':'music-mode'}" data-id="${mode}" aria-pressed="${music.generation_mode===mode}">${musicName(mode)}</button>`).join('')}</div>`+
    (music.generation_mode!=='instrumental'?`<label class="field"><span>${t('Lyrics','歌词')}</span><textarea id="${form}-lyrics" ${attr('lyrics')} rows="7" maxlength="1200" placeholder="${t('Write your lyrics, or start with the creative assistant…','填写歌词，或让创作助手帮你起稿…')}">${esc(music.lyrics)}</textarea><small data-counter="${form}.lyrics">${(music.lyrics||'').length} / 1200</small></label>`:`<div class="inline-note">${t('Instrumental mode creates music without lyrics or vocals.','纯音乐模式不发送歌词，生成不含演唱的音乐。')}</div>`)+
    `<label class="field"><span>${t('Sound and style','音乐风格')}</span><textarea id="${form}-style" ${attr('style')} rows="3" maxlength="500" placeholder="${t('Genre, instruments, atmosphere…','曲风、乐器、氛围…')}">${esc(music.style)}</textarea></label>`+
    `<div class="three-columns">${control('bpm',t('Tempo · BPM','节奏 · BPM'),'number','min="60" max="180" step="1"')}<label class="field"><span>${t('Target length','目标时长')}</span><select id="${form}-duration" ${attr('duration')}>${[...new Set([12,20,30,Number(music.duration)||20])].sort((a,b)=>a-b).map(n=>option(n,t(`${n} seconds`,`${n} 秒`),music.duration)).join('')}</select></label><label class="field"><span>${t('Language','语言')}</span><select ${isProject?'disabled aria-label="'+t('Project language','项目语言')+'"':'data-form="music" data-key="language"'}>${option('en','English',isProject?state.currentProject?.language:music.language)}${option('zh','中文',isProject?state.currentProject?.language:music.language)}</select></label></div>`+
    (!isProject?`<details class="settings"><summary>${t('Reproducibility settings','复现设置')}</summary>${control('seed',t('Seed','随机种子'),'number','min="0" max="2147483647" step="1"')}<p class="field-note">${t('The same seed helps compare changes; it does not guarantee identical output.','相同种子便于比较修改效果，但不保证每次音频完全一致。')}</p></details>`:'')+
    `<p class="field-note">${t('Target length is a guide. Final duration depends on the generated audio.','目标时长仅供参考，最终长度以实际音频为准。')}</p>`;
}
function renderMusic() {
  const presets=[['Acoustic folk, warm guitar, gentle percussion','木吉他民谣，温暖轻柔的打击乐'],['Melodic pop, bright piano, steady drums','旋律流行，明亮钢琴，稳定鼓点'],['Hip hop, punchy drums, rhythmic bass','嘻哈，强劲鼓点，节奏贝斯'],['Ambient electronic, soft synths, spacious texture','氛围电子，柔和合成器，空灵质感']];
  return pageHeading(t('Make something only you imagined.','把脑海中的旋律做出来。'),t('Shape a song, a rap, or an instrumental from your words and musical direction.','从歌词和音乐方向出发，创作歌曲、说唱或纯音乐。'))+
    `<div class="editor-grid"><div>${panel(t('Music direction','音乐方向'),musicFields('music',state.forms.music)+permissionNote('music')+`<div class="panel-actions">${button('generate-music',busy('music')?t('Submitting…','正在提交…'):t('Generate music','生成音乐'),{tone:'primary',isDisabled:busy('music')})}</div>`)}${localNote()}</div><div>${panel(t('A starting point','选一个开始'),`<div class="preset-list">${presets.map(([en,zh],i)=>`<button type="button" data-action="music-preset" data-id="${i}"><span>${['♫','♪','≋','◌'][i]}</span><strong>${t(en.split(',')[0],zh.split('，')[0])}</strong><small>${t(en,zh)}</small></button>`).join('')}</div>`)+panel(t('Need words for the music?','需要一点创作灵感？'),`<p class="muted">${t('The creative assistant can turn an idea into lyrics and a music brief. Review every draft before generating audio.','创作助手可以把想法整理成歌词与音乐方案，审阅后再开始生成。')}</p>${button('assistant-music',t('Open creative assistant','打开创作助手'),{tone:'secondary full-width'})}`,'','subtle')}</div></div>`;
}

function renderAssistant() {
  const project=state.currentProject, form=state.forms.assistant, plan=project?.plan;
  const requestPending=['project-plan','project-render','project-save'].some(busy);
  const locked=projectHasActiveJob(project?.id)||requestPending;
  const consent=`<label class="consent-box"><input type="checkbox" data-form="assistant" data-key="consent"${form.consent?' checked':''}${disabled(locked)}><span><strong>${t('Allow AI drafting','允许 AI 辅助创作')}</strong>${t('Your brief, script, creative settings and voice names are sent to OpenAI for drafting and revisions. Voice recordings use our audio services.','生成与修改草稿时，需求、文稿、创作设置及音色名称会发送给 OpenAI；声音录音由我们的音频服务处理。')}</span></label>`;
  const projectOptions=state.projects.map(p=>option(p.id,p.title||modeName(p.mode),project?.id)).join('');
  let body=pageHeading(t('An idea is enough to begin.','从一个想法开始。'),t('Draft together, edit every detail, then turn the project into audio.','共同起稿，逐段调整，再把整个项目变成声音。'),button('new-project',t('New project','新建项目'),{isDisabled:requestPending}))+
    `<div class="project-toolbar"><label class="field"><span>${t('Account projects','账号项目')}</span><select id="project-select" data-project-select${disabled(requestPending)}>${option('',t('New browser draft','新的浏览器草稿'),project?.id)}${projectOptions}</select></label>${project?`<span class="pill ${state.projectDirty?'pending':''}">${state.projectDirty?t('Unsaved edits','有未保存修改'):t('Saved to account','已保存到账号')}</span>${button('save-project',t('Save changes','保存修改'),{isDisabled:locked||busy('project-save')})}${button('delete-project',t('Delete project','删除项目'),{id:project.id,tone:'text danger',isDisabled:locked})}`:''}</div>`;
  body+=`<div class="editor-grid assistant-grid"><div>${panel(t('Your brief','创作需求'),
    `<div class="segmented">${['narration','music','dialogue'].map(mode=>`<button type="button" data-action="assistant-mode" data-id="${mode}" aria-pressed="${(project?.mode||form.mode)===mode}"${disabled(locked)}>${modeName(mode)}</button>`).join('')}</div>`+
    `<label class="field"><span>${t('Title','标题')}</span><input id="assistant-title" ${project?'data-project="title"':'data-form="assistant" data-key="title"'} value="${esc(project?.title||form.title)}" placeholder="${t('A name for this project','给项目起个名字')}"${disabled(locked)}></label>`+
    `<label class="field"><span>${t('What would you like to create?','你想创作什么？')}</span><textarea id="assistant-prompt" ${project?'data-project="prompt"':'data-form="assistant" data-key="prompt"'} rows="4" placeholder="${t('A warm 20-second welcome for a neighborhood coffee shop…','给街角咖啡店写一段约 20 秒的温暖欢迎词…')}"${disabled(locked)}>${esc(project?.prompt||form.prompt)}</textarea></label>`+
    (!plan?(project?'':formField('assistant','language',t('Content language','内容语言'),{choices:[['en','English'],['zh','中文']],isDisabled:locked}))+consent+permissionNote('assistant')+`<div class="panel-actions">${button('plan-project',busy('project-plan')?t('Submitting…','正在提交…'):t('Create AI draft','生成 AI 草稿'),{tone:'primary',isDisabled:locked||busy('project-plan')})}${!project?button('save-project',t('Save project first','先保存项目'),{isDisabled:locked||busy('project-save')}):''}</div>`:`<p class="field-note">${t('Use the revision box below for your next change.','继续修改时，请填写下方的修改要求。')}</p>`))}`;
  if(plan) {
    let editor='';
    if(project.mode==='music'&&plan.music)editor=musicFields('project-music',plan.music,true);
    else {
      editor=`<div class="role-list">${(plan.roles||[]).map((role,i)=>`<div class="role-row"><label class="field"><span>${t('Role','角色')} ${i+1}</span><input data-role="${i}" data-role-key="name" id="role-${i}-name" value="${esc(role.name)}"></label><label class="field"><span>${t('Voice','音色')}</span><select data-role="${i}" data-role-key="voice_id">${option('',t('Choose voice','选择音色'),role.voice_id)}${allVoices().map(v=>option(v.id,voiceName(v),role.voice_id)).join('')}</select></label></div>`).join('')}</div>`;
      editor+=`<div class="segment-list">${(plan.segments||[]).map((segment,i)=>{
        const ready=(project.completed_segment_ids||[]).includes(segment.id);
        return `<article class="segment"><div class="segment-heading"><h3>${t(`Part ${i+1}`,`第 ${i+1} 段`)}</h3><span class="pill${ready?' ready':''}">${ready?t('Audio ready','音频已完成'):t('Needs audio','待生成音频')}</span></div><label class="field"><span>${t('Speaker','角色')}</span><select data-segment="${i}" data-segment-key="role_id">${(plan.roles||[]).map(r=>option(r.id,r.name,segment.role_id)).join('')}</select></label><label class="field"><span class="sr-only">${t('Part script','片段文稿')}</span><textarea id="segment-${i}-text" data-segment="${i}" data-segment-key="text" rows="3" maxlength="500">${esc(segment.text)}</textarea><small>${(segment.text||'').length} / 500</small></label><details class="settings"><summary>${t('Voice settings','声音参数')}</summary><div class="three-columns">${[['speed',t('Speed','语速'),.5,1.5,.05],['pitch',t('Pitch','音高'),-12,12,1],['volume',t('Volume','音量'),.5,1.5,.05]].map(([k,l,min,max,step])=>`<label class="field"><span>${l}</span><input data-segment="${i}" data-segment-key="${k}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(segment[k]??(k==='pitch'?0:1))}"></label>`).join('')}</div></details><div class="segment-actions">${ready?button('preview-segment',t('▶ Listen','▶ 试听'),{id:segment.id}):''}${button('revise-segment',t('Revise this part','修改此段'),{id:segment.id})}</div></article>`;
      }).join('')}</div>`;
    }
    body+=panel(t('Review your draft','审阅草稿'),`<fieldset class="plain-fieldset"${disabled(locked)}>${editor}</fieldset><p class="field-note">${t('Changed words or voice settings invalidate only the affected audio. Duration is approximate.','修改文稿或声音参数后，仅对应片段需要重做；目标时长为估计值。')}</p><div class="panel-actions">${button('render-project',busy('project-render')?t('Submitting…','正在提交…'):t('Generate missing audio','生成／补全音频'),{tone:'primary',isDisabled:locked||busy('project-render')})}</div>`);
    body+=panel(t('Keep shaping it','继续打磨'),`<div id="revision-box">${formField('assistant','target',t('Apply revision to','修改范围'),{choices:[['',t('Whole project','整个项目')],...(plan.segments||[]).map((s,i)=>[s.id,t(`Part ${i+1}`,`第 ${i+1} 段`)])]})}${formField('assistant','revision',t('What should change?','想怎么修改？'),{rows:3,placeholder:t('Shorten the opening and make it more conversational…','缩短开头，语气更口语化一些…')})}${consent}<div class="panel-actions">${button('revise-project',t('Revise draft','修改草稿'),{isDisabled:locked||busy('project-plan')})}</div></div>`);
  }
  body+=`${localNote()}</div><div>${panel(t('A considered workflow','一步一步，完成作品'),`<ol class="workflow-list"><li><span>1</span><div><strong>${t('Brief','描述需求')}</strong><p>${t('Start with a topic, audience, characters or musical feeling.','从主题、听众、角色或音乐氛围说起。')}</p></div></li><li><span>2</span><div><strong>${t('Review','审阅修改')}</strong><p>${t('Read the draft, choose voices, and adjust the details.','审阅草稿、分配音色，再调整细节。')}</p></div></li><li><span>3</span><div><strong>${t('Create','生成作品')}</strong><p>${t('Generate audio and find the finished result in Creations.','生成音频，完成后可在“我的作品”找到结果。')}</p></div></li></ol>`,'','subtle')}${project?panel(t('Project status','项目状态'),`<p>${esc(projectStatus(project.status))}</p><p class="field-note">${t(`${(project.completed_segment_ids||[]).length} completed parts`, `已完成 ${(project.completed_segment_ids||[]).length} 段`)}</p><p class="field-note">${t('Project and finished parts are stored in your account. Your Apple app library is separate.','项目与已完成片段保存在当前账号中，与 Apple App 作品库相互独立。')}</p>`):''}</div></div>`;
  return body;
}
function projectStatus(status) {return ({draft:t('Draft','草稿'),ready:t('Ready to generate','可以开始生成'),planning:t('Preparing a draft','正在生成草稿'),rendering:t('Generating audio','正在生成音频'),paused:t('Paused; finished parts are kept','已暂停，已完成片段会保留'),completed:t('Completed','已完成'),failed:t('Needs attention','需要重试'),cancelled:t('Cancelled; project is kept','任务已取消，项目已保留')}[status]||t('Draft','草稿'));}
function renderCreations() {
  if(!state.session.user)return pageHeading(t('Your creations, all together.','把作品收在一起。'),t('Sign in to open the creations saved in your account.','登录后查看保存在账号中的作品。'))+emptyState(t('Your account library','账号作品库'),t('Local drafts and account audio are separate. Google sign-in does not sync your Apple app library.','浏览器草稿与账号音频分别保存，Google 登录不会同步 Apple App 的作品库。'),button('account',t('Sign in with Google','使用 Google 登录'),{tone:'primary'}));
  const list=state.creations.filter(c=>state.creationFilter==='all'||(state.creationFilter==='favorites'?c.favorite:c.kind===state.creationFilter||c.request?.generation_mode===state.creationFilter));
  const selected=state.selected.map(id=>state.creations.find(c=>c.id===id)).filter(Boolean);
  return pageHeading(t('Made by you.','你的每一份创作。'),t('Listen, download, revisit, or bring several takes together.','试听、下载、重听，也可以把多段音频接在一起。'),button('refresh',t('Refresh','刷新')))+
    `<div class="filter-bar"><div class="segmented">${[['all',t('All','全部')],['favorites',t('Favorites','收藏')],['speech',t('Voice','语音')],['dub',t('Dubbed videos','视频配音')],['cover',t('Covers','翻唱')],['song',t('Songs','歌曲')],['rap',t('Rap','说唱')],['instrumental',t('Instrumentals','纯音乐')]].map(([v,l])=>`<button type="button" data-action="creation-filter" data-id="${v}" aria-pressed="${state.creationFilter===v}">${l}</button>`).join('')}</div></div>`+
    (selected.length?panel(t('Stitch selected audio','拼接已选音频'),`<ol class="stitch-order">${selected.map((c,i)=>`<li><span class="number-badge">${i+1}</span><strong>${esc(c.title)}</strong>${button('move-up','↑',{id:c.id,isDisabled:i===0,title:t('Move earlier','向前移动')})}${button('move-down','↓',{id:c.id,isDisabled:i===selected.length-1,title:t('Move later','向后移动')})}${button('select-creation','×',{id:c.id,title:t('Remove from selection','取消选择')})}</li>`).join('')}</ol><div class="panel-actions">${button('stitch',t('Stitch in this order','按此顺序拼接'),{tone:'primary',isDisabled:selected.length<2||busy('stitch')})}${button('clear-selection',t('Clear selection','清空选择'))}</div>`):'')+
    `<div class="creation-list">${list.map(c=>{const isVideo=c.media==='video'||c.kind==='dub';return `<article class="creation-row"><label class="selection-box"><input type="checkbox" data-select-creation="${esc(c.id)}"${state.selected.includes(c.id)?' checked':''}${disabled(isVideo)}><span class="sr-only">${t('Select','选择')} ${esc(c.title)}</span></label>${button('play-creation','▶',{id:c.id,tone:'play-button',title:isVideo?t('Play video','播放视频'):t('Play creation','播放作品')})}<div class="creation-info"><h2>${esc(c.title||kindName(c.kind))}</h2><p><span>${kindName(c.request?.generation_mode||c.kind)}</span>${isVideo&&c.source_language&&c.language?`<span>${esc(languageName(c.source_language))} → ${esc(languageName(c.language))}</span>`:''}<span>${durationLabel(c.duration)}</span><span>${dateLabel(c.created_at)}</span>${isVideo&&c.overrun_seconds>0.05?`<span>${t(`The last ${esc(c.overrun_seconds)} s of speech ran past the end of the video and are lost`,`最后 ${esc(c.overrun_seconds)} 秒配音超出视频结尾，已被截掉`)}</span>`:''}</p></div><div class="creation-actions">${button('favorite',c.favorite?'★':'☆',{id:c.id,tone:'icon-button'+(c.favorite?' gold':''),title:t('Toggle favorite','切换收藏')})}${button('download-creation','↓',{id:c.id,tone:'icon-button',title:isVideo?t('Download video','下载视频'):t('Download audio','下载音频')})}<details class="row-menu"><summary aria-label="${t('More actions','更多操作')}">•••</summary><div>${button('rename-creation',t('Rename','重命名'),{id:c.id,tone:'text'})}${isVideo?button('view-transcript',t('View script','查看文稿'),{id:c.id,tone:'text'}):''}${c.request?button('reuse-creation',t('Use settings again','复用创作设置'),{id:c.id,tone:'text'}):''}${button('delete-creation',t('Delete','删除'),{id:c.id,tone:'text danger'})}</div></details></div></article>`;}).join('')}</div>${!list.length?emptyState(t('Room for your next idea','等待下一份灵感'),t('Finished audio appears here after a task succeeds. Try another filter or start a new creation.','任务完成后的音频会出现在这里。也可以切换筛选条件，或开始一份新创作。'),button('clone',t('Create audio','开始创作'),{tone:'primary'})):''}`;
}
function renderAccount() {
  const user=state.session.user, ent=state.session.entitlements||{};
  const enabled=!!state.config?.billing_enabled;
  const pricing=enabled&&state.prices.length?state.prices.map(price=>`<article class="price-card"><span class="pill">${t('MONTHLY MEMBERSHIP','月会员')}</span><h3>${esc(priceLabel(price))}<small> / ${price.interval==='year'?t('year','年'):t('month','月')}</small></h3><p>${t('Voice generation and the cover access listed for your account. Final price and renewal terms appear at checkout.','包含账户列出的语音生成和翻唱权限。最终价格及续费条款以付款页面为准。')}</p>${button('checkout',ent.speech?t('Access is active','使用权限已生效'):t('Subscribe securely','订阅月会员'),{id:price.id,tone:'primary',isDisabled:busy('billing')||!!ent.speech})}</article>`).join(''):`<div class="inline-note">${enabled?(user?t('Membership pricing is temporarily unavailable. Refresh Account or contact support.','会员价格暂不可用，请刷新账户或联系支持。'):t('Sign in to view the current subscription price.','登录后查看当前订阅价格。')):t('Web subscriptions are not available yet. Your current account permissions are shown above.','网页订阅尚未开放，当前账号权限以此页面显示为准。')} ${user||!enabled?'<span class="support-code">(WEB_BILLING_UNAVAILABLE)</span>':''}</div>`;
  return pageHeading(t('Your studio account.','你的创作账号。'),t('Use Google to sign in. Your first successful sign-in creates your studio account.','使用 Google 登录，首次成功登录会自动创建创作账号。'))+
    `<div class="account-grid">${panel(user?t('Signed in','已登录'):t('Continue with Google','使用 Google 继续'),user?
      `<div class="profile-summary"><span class="profile-avatar">${esc(user.name?.[0]?.toUpperCase()||'G')}</span><div><h2>${esc(user.name||t('Studio member','创作用户'))}</h2><p>${esc(user.email||'')}</p></div></div><p class="field-note">${t('This Google account owns the projects, voices and creations saved here. It does not automatically link an Apple account.','此 Google 账号拥有在此保存的项目、声音和作品，不会自动关联 Apple 账号。')}</p><div class="stack-actions">${button('refresh-session',t('Refresh account status','刷新账户状态'))}${button('logout',t('Sign out','退出登录'),{tone:'text danger',isDisabled:busy('auth')})}</div>`:
      `<p>${t('We use your Google name, email and basic profile to create and secure your account. A session cookie keeps you signed in.','我们使用 Google 姓名、邮箱及基本资料创建和保护账号，并通过会话 Cookie 维持登录。')}</p><div id="google-signin" class="google-signin" aria-live="polite">${state.config?.google_configured?t('Preparing Google sign-in…','正在准备 Google 登录…'):t('Google sign-in is not configured yet. Your draft stays in this browser.','Google 登录尚未配置完成，草稿会保留在此浏览器。')}</div>${!state.config?.google_configured?`<span class="support-code">WEB_GOOGLE_NOT_CONFIGURED</span>`:''}<p class="field-note"><a href="privacy.html">${t('Read how your data is used','查看数据使用说明')}</a></p>`)}
      ${panel(t('Access and membership','权限与会员'),`<ul class="access-list">${[['speech',t('Voice generation','语音生成')],['full_cover',t('Full song covers','完整歌曲翻唱')],['music',t('Music generation','音乐生成')],['assistant',t('AI drafting','AI 辅助创作')]].map(([key,label])=>`<li><span>${label}</span><strong class="${ent[key]?'access-active':''}">${ent[key]?t('Available','可使用'):t('Not active','未开通')}</strong></li>`).join('')}</ul><p class="field-note">${t(`Cover length: up to ${ent.cover_max_seconds||30} seconds.`,`翻唱最长 ${ent.cover_max_seconds||30} 秒。`)} ${t('App Store purchases are not automatically linked to this Google account.','App Store 购买不会自动关联到此 Google 账号。')}</p>${pricing}<div class="panel-actions">${button('billing-portal',t('Manage subscription','管理订阅'),{isDisabled:!user||!enabled||busy('billing')})}</div>`)}
    </div><p class="local-note">${t('Signing out clears account content from this page. Unsubmitted drafts remain separated by account in this browser.','退出后会清除此页面中的账号内容；未提交的草稿按账号分别保留在此浏览器。')}</p>`;
}
function priceLabel(price) {
  if(price.display_price)return price.display_price;
  try {const formatter=new Intl.NumberFormat(getLanguage()==='zh'?'zh-CN':'en-US',{style:'currency',currency:price.currency.toUpperCase()}); const digits=formatter.resolvedOptions().maximumFractionDigits; return formatter.format(Number(price.unit_amount)/10**digits);} catch{return t('See checkout','以付款页面为准');}
}
function emptyState(title,message,action='') { return `<section class="empty-state"><span aria-hidden="true">〰</span><h2>${esc(title)}</h2><p>${esc(message)}</p>${action}</section>`; }

function stageLabel(stage) {
  const map={queued:t('Waiting in queue','排队中'),running:t('Processing','处理中'),recovering:t('Resuming','正在恢复'),preparing:t('Preparing','准备中'),listening:t('Listening for speech','听取对话'),detecting_shots:t('Finding the shots','识别镜头'),sampling_frames:t('Looking at the footage','查看画面'),writing_script:t('Writing the narration','撰写旁白'),analyzing:t('Working out what the video is','识别视频类型与内容'),planning:t('Planning where to speak','规划旁白位置'),fact_checking:t('Checking lines against the frames','逐句对照画面核查'),observing:t('Logging the footage','看片记录画面'),drafting:t('Writing three drafts','写三版草稿'),table_read:t('Picking the strongest draft','挑选最好的一版'),reviewing:t('Editor reviewing','主编审稿'),revising:t('Revising from notes','按意见修改'),voice_directing:t('Marking delivery','标注语气'),listening:t('Listening to every line','逐句试听'),retaking:t('Re-voicing lines that failed','重录没通过的句子'),uploading:t('Uploading audio','上传音频'),uploading_reference:t('Preparing the voice','准备音色'),downloading:t('Receiving audio','接收音频'),planning:t('Preparing draft','生成草稿'),rendering:t('Generating audio','生成音频'),synthesizing:t('Generating voice','生成语音'),stitching:t('Joining audio','拼接音频'),separating:t('Separating vocals','分离人声'),converting:t('Creating cover','制作翻唱'),mixing:t('Mixing audio','混合音频'),extracting_audio:t('Reading the video','读取视频'),transcribing:t('Recognizing speech','识别语音'),translating:t('Translating lines','翻译台词'),aligning:t('Syncing to the picture','对齐画面'),succeeded:t('Finished','已完成'),completed:t('Finished','已完成'),failed:t('Could not finish','未完成'),cancelled:t('Cancelled','已取消'),paused:t('Paused','已暂停')};
  return map[stage]||t('Working on your creation','正在处理你的创作');
}
function renderJobs() {
  const panelElement=$('#jobs-panel');const sorted=[...state.jobs.values()].sort((a,b)=>Number(b.created_at||0)-Number(a.created_at||0));
  const active=sorted.filter(job=>activeStatuses.has(job.status));
  const list=[...active,...sorted.filter(job=>!activeStatuses.has(job.status)).slice(0,Math.max(0,12-active.length))];
  panelElement.hidden=!list.length;if(!list.length)return;
  const wasOpen=$('details',panelElement)?.open??true;
  const count=list.filter(j=>activeStatuses.has(j.status)).length;
  panelElement.innerHTML=`<details${wasOpen?' open':''}><summary><span>${t('Tasks','创作任务')} <b>${count||list.length}</b></span><span aria-hidden="true">⌃</span></summary><div class="jobs-content">${list.map(j=>{
    const progress=typeof j.progress==='object'?j.progress:{};const total=Number(progress.total)||0,current=Number(progress.current)||0;
    return `<article class="job"><div class="job-heading"><strong>${kindName(j.kind)}</strong><span class="pill ${j.status==='succeeded'?'ready':''}">${stageLabel(j.status)}</span></div><p>${stageLabel(['queued','running'].includes(j.status)?(progress.stage||j.status):j.status)}${total?` · ${Math.min(current,total)} / ${total}`:''}</p>${total?`<progress max="${total}" value="${current}"></progress>`:''}${j.error_code||j.connection_error?`<p class="job-error">${esc(errorMessage(new StudioError(j.error_code||j.connection_error)))}</p>`:''}<div class="job-actions">${['queued','running'].includes(j.status)?`${j.kind.includes('render')||j.kind==='dub'||j.kind==='vlog_script'?button('pause-job',t('Pause','暂停'),{id:j.id,tone:'text'}):''}${button('cancel-job',t('Cancel','取消'),{id:j.id,tone:'text'})}`:''}${j.status==='paused'?`${button('resume-job',t('Continue','继续'),{id:j.id,tone:'text'})}${button('cancel-job',t('Cancel','取消'),{id:j.id,tone:'text'})}`:''}${activeStatuses.has(j.status)&&j.project_id?button('open-job-project',t('Open project','打开项目'),{id:j.project_id,tone:'text'}):''}${(j.vlog_id||j.result?.video_id)&&(j.kind==='vlog_script'||activeStatuses.has(j.status))?button('open-job-vlog',t('Open vlog','打开 vlog'),{id:j.result?.video_id||j.vlog_id,tone:'text'}):''}${j.status==='succeeded'&&j.kind!=='vlog_script'?button(j.result?.project_id?'open-job-project':'creations',j.result?.project_id?t('Open project','打开项目'):t('View creation','查看作品'),{id:j.result?.project_id||'',tone:'text'}):''}${!activeStatuses.has(j.status)?button('dismiss-job','×',{id:j.id,tone:'text',title:t('Dismiss task','关闭任务状态')}):''}</div></article>`;
  }).join('')}<p class="field-note">${t('Server tasks may continue after this page closes.','关闭网页后，服务端任务可能继续。')}</p></div></details>`;
}

function restoreJobHints(jobs) {
  for(const job of jobs)if(job?.id&&!state.jobs.has(job.id))state.jobs.set(job.id,{...job,status:'queued',local_hint:true,progress:{stage:'queued'}});
}
function ensureJobPolling(job) {
  if(!currentUserID())return;
  if(!['queued','running'].includes(job.status)) {clearTimeout(state.timers.get(job.id));state.timers.delete(job.id);return;}
  const key=`${currentUserID()}:${job.id}`;
  if(!state.timers.has(job.id)&&!state.polling.has(key))state.timers.set(job.id,setTimeout(()=>pollJob(job.id),50));
}
function mergeCloudJobs(jobs,owner) {
  if(!owner||currentUserID()!==owner)return false;
  for(const incoming of jobs){
    if(!incoming?.id)continue;
    if(!activeStatuses.has(incoming.status)&&state.dismissedJobs.has(incoming.id))continue;
    const old=state.jobs.get(incoming.id)||{};
    const job={...old,...incoming,project_id:incoming.project_id||incoming.result?.project_id||old.project_id};
    delete job.local_hint;delete job.connection_error;state.jobs.set(job.id,job);
    if(!activeStatuses.has(job.status))releaseRequestID(job);
  }
  // The account's list is authoritative. Local hints only recover older IDs omitted
  // from that bounded recent list; they never replace server status or project IDs.
  for(const job of state.jobs.values())ensureJobPolling(job);
  renderJobs();flushLocal();return true;
}
async function syncCloudJobs() {
  const owner=currentUserID();if(!owner)return false;
  const result=await request('/jobs');return mergeCloudJobs(items(result),owner);
}
async function refreshData({replaceProject=false}={}) {
  if(!state.session.user)return;
  const owner=currentUserID();
  const results=await Promise.allSettled([request('/voices'),request('/creations'),request('/projects'),request('/jobs'),state.config?.vlog?request('/vlogs'):Promise.resolve({items:[]})]);
  if(currentUserID()!==owner)return;
  const keys=['voices','creations','projects',null,'vlogs'];results.forEach((r,i)=>{if(r.status==='fulfilled'){if(i===3)mergeCloudJobs(items(r.value),owner);else state[keys[i]]=items(r.value);if(i===0)state.voicesLoadedFor=owner;}else{if(i===0)state.voicesLoadedFor=null;if(r.reason.status!==401)showError(r.reason);}});
  syncVlogDraft();
  const selectedID=state.currentProject?.id||state.selectedProjectID;
  if(selectedID&&(!state.projectDirty||replaceProject)) {state.currentProject=state.projects.find(p=>p.id===selectedID)||null;state.projectDirty=false;}
  state.selected=state.selected.filter(id=>state.creations.some(c=>c.id===id));
  if(state.config?.billing_enabled)try{const prices=items(await request('/billing/prices'));if(currentUserID()===owner)state.prices=prices;}catch(error){if(error.status!==401&&currentUserID()===owner)state.prices=[];}
}
async function loadSession() {
  const before=currentUserID();const session=await request('/session',{allowAnonymous:true});const next=session?.user?.id||null;
  if(before!==next){
    const guestDraft=!before?structuredClone(state.forms):null;
    if(before)clearAccount();else flushLocal();
    state.session=session||{user:null,entitlements:{}};setCSRFToken(session?.csrf_token);
    setDraftOwner(next);const existing=readDrafts();const jobs=restoreLocal();
    if(next&&!existing&&guestDraft)state.forms=guestDraft;
    if(next)restoreJobHints(jobs);
  }else{setCSRFToken(session?.csrf_token);state.session=session||{user:null,entitlements:{}};}
  return state.session;
}
async function initialize() {
  restoreLocal();render();
  const responses=await Promise.allSettled([
    request('/config',{allowAnonymous:true}),request('/session',{allowAnonymous:true}),
    fetch(new URL('../voices/catalog.json',import.meta.url),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('catalog');return r.json();})
  ]);
  if(responses[0].status==='fulfilled')state.config=responses[0].value;else state.configError=responses[0].reason;
  if(responses[2].status==='fulfilled')state.catalog=items(responses[2].value);
  if(responses[1].status==='fulfilled') {state.session=responses[1].value;setCSRFToken(state.session?.csrf_token);}
  if(state.session.user) {
    setDraftOwner(currentUserID());restoreJobHints(restoreLocal());await refreshData();
  }
  if(state.config?.billing_enabled&&!state.prices.length)try{state.prices=items(await request('/billing/prices',{allowAnonymous:true}));}catch{}
  render();if(state.configError)showError(state.configError);
  if(new URLSearchParams(location.search).has('checkout')||new URLSearchParams(location.search).has('billing'))verifyPaymentReturn();
}
function clearAccount() {
  flushLocal();state.googleGeneration++;for(const timer of state.timers.values())clearTimeout(timer);state.timers.clear();state.polling.clear();state.dismissedJobs.clear();
  state.session={user:null,entitlements:{}};setCSRFToken(null);state.voices=[];state.voicesLoadedFor=null;state.creations=[];state.projects=[];state.jobs.clear();state.selected=[];
  state.coverFile=null;state.dubFile=null;state.vlogFile=null;state.vlogs=[];state.currentVlogID=null;state.vlogDraft=null;state.vlogDirty=false;state.voiceFile=null;state.voiceConsent=false;state.transcript=null;state.busy.clear();stopPlayer();closeVoiceDialog();closeVideoDialog();
  setDraftOwner(null);restoreLocal();state.currentProject=null;state.projectDirty=false;
}
onAuthExpired(()=>{clearAccount();navigate('account');});

async function loadGoogleScript() {
  if(window.google?.accounts?.id)return;
  if(state.googlePromise)return state.googlePromise;
  state.googlePromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
    script.onload=()=>resolve();script.onerror=()=>{state.googlePromise=null;reject(new StudioError('WEB_GOOGLE_CONNECTION'));};document.head.append(script);
  });return state.googlePromise;
}
async function prepareGoogleSignIn() {
  if(!state.config?.google_configured||!state.config.google_client_id)return;
  const generation=++state.googleGeneration;
  try {
    const [challenge]=await Promise.all([request('/auth/challenge',{allowAnonymous:true}),loadGoogleScript()]);
    if(generation!==state.googleGeneration||state.route!=='account'||state.session.user)return;
    const container=$('#google-signin');if(!container)return;container.textContent='';
    window.google.accounts.id.initialize({client_id:state.config.google_client_id,nonce:challenge.nonce,
      callback:response=>completeGoogleSignIn(response.credential,challenge.csrf_token)});
    window.google.accounts.id.renderButton(container,{theme:'outline',size:'large',type:'standard',text:'continue_with',shape:'rectangular',locale:getLanguage()==='zh'?'zh_CN':'en',width:Math.min(340,Math.max(200,container.clientWidth))});
  }catch(error){if(generation===state.googleGeneration&&$('#google-signin'))$('#google-signin').textContent=errorMessage(error);}
}
async function completeGoogleSignIn(credential,csrf) {
  if(!credential)return;
  await run('auth',async()=>{
    await request('/auth/google',{method:'POST',body:{credential,csrf_token:csrf},allowAnonymous:true});
    await loadSession();if(!state.session.user)throw new StudioError('WEB_GOOGLE_VERIFICATION');
    await refreshData();
    saveLocal();notify(t('You are signed in. Your studio is ready.','登录成功，可以继续创作。'));navigate(state.returnRoute||'clone');state.returnRoute=null;
  });
}

async function submitJob(key,path,payload,{formData=null,projectID=null}={}) {
  if(projectID){
    if(!await syncCloudJobs())return null;
    if(projectHasActiveJob(projectID))throw new StudioError('project_job_active');
  }
  // Plan/render payloads carry only a version, so two projects at the same version must not share an ID.
  const id=requestID(key,projectID?{...payload,project_id:projectID}:payload);let body;
  if(formData){formData.set('request_id',id);body=formData;}else body={...payload,request_id:id};
  let response;
  try{response=await request(path,{method:'POST',body});}
  catch(error){
    // A 4xx means the server refused and started nothing: a retry should get a fresh ID.
    // Timeouts, conflicts, rate limits and 5xx keep the ID, since the job may exist and must not be started twice.
    // request_id_conflict means the server already holds a different job under this ID, so it can never succeed.
    if(((error?.status>=400&&error.status<500&&![408,409,425,429].includes(error.status))||error?.code==='request_id_conflict')&&state.requestIds[key]?.id===id){delete state.requestIds[key];flushLocal();}
    throw error;
  }
  const job=response?.job||response;
  if(!job?.id)throw new StudioError('WEB_INVALID_JOB');
  job.request_key=key;job.request_id=id;if(projectID)job.project_id=projectID;state.jobs.set(job.id,job);flushLocal();renderJobs();pollJob(job.id);
  notify(t('Task started. You can keep working while it runs.','任务已提交，等待期间可以继续使用其他工具。'));return job;
}
async function pollJob(id) {
  if(!state.session.user||!state.jobs.has(id))return;
  const owner=currentUserID(),pollKey=`${owner}:${id}`;
  if(state.polling.has(pollKey))return;
  state.polling.add(pollKey);
  clearTimeout(state.timers.get(id));state.timers.delete(id);
  try {
    const latest=await request(`/jobs/${encodeURIComponent(id)}`);if(currentUserID()!==owner)return;
    const old=state.jobs.get(id)||{};const job={...old,...latest,project_id:latest.project_id||latest.result?.project_id||old.project_id};delete job.local_hint;delete job.connection_error;state.jobs.set(id,job);renderJobs();flushLocal();
    if(['queued','running'].includes(job.status)){state.timers.set(id,setTimeout(()=>pollJob(id),1800));return;}
    state.timers.delete(id);
    if(!activeStatuses.has(job.status)) {
      releaseRequestID(job);
      await refreshData({replaceProject:!!job.project_id&&state.currentProject?.id===job.project_id&&!state.projectDirty});
      if(currentUserID()!==owner)return;
      if(job.kind==='vlog_script'&&job.status==='succeeded'&&job.result?.video_id&&(!state.currentVlogID||state.currentVlogID===job.result.video_id||job.vlog_id===state.currentVlogID)&&!state.vlogDirty)setCurrentVlog(job.result.video_id);
      render();if(job.kind==='vlog_script'&&job.status==='succeeded')notify(job.auto?t('Script written. Creating the video now…','脚本已写好，正在生成视频…'):t('Your script is ready to review.','脚本已写好，可以审阅了。'));else if(job.status==='succeeded')notify(t('Your creation is ready.','创作已完成。'));else if(job.status==='failed')showError(new StudioError(job.error_code||'WEB_GENERATION_FAILED'));
      if(job.kind==='vlog_script'&&job.status==='succeeded'&&job.auto){try{await autoRenderVlog(job);}catch(error){showError(error);}}
    }
  }catch(error){if(currentUserID()!==owner)return;if(error.status===404){releaseRequestID(state.jobs.get(id));state.jobs.delete(id);renderJobs();showError(error);}else if(error.status!==401){const job=state.jobs.get(id);if(job)job.connection_error=error.code||'WEB_CONNECTION';renderJobs();state.timers.set(id,setTimeout(()=>pollJob(id),6000));}}
  finally{state.polling.delete(pollKey);}
}

async function playURL(path,title,detail='',isPublic=false) {
  let url=path;
  if(isPublic){const parsed=new URL(path,location.href);if(parsed.pathname.startsWith('/audio-studio/voices/'))url=new URL(parsed.pathname,location.origin).href;else throw new StudioError('WEB_UNSAFE_AUDIO_URL');}
  else {const blob=await request(path,{blob:true});if(state.audioObjectURL)URL.revokeObjectURL(state.audioObjectURL);state.audioObjectURL=URL.createObjectURL(blob);url=state.audioObjectURL;}
  const player=$('#player');player.pause();player.src=url;$('#player-title').textContent=title;$('#player-detail').textContent=detail;$('#audio-player').hidden=false;document.body.classList.add('has-player');
  try{await player.play();}catch{notify(t('Press Play in the audio player to listen.','点击底部播放器的播放按钮即可试听。'));}
}
function stopPlayer(){const player=$('#player');player.pause();player.removeAttribute('src');player.load();if(state.audioObjectURL)URL.revokeObjectURL(state.audioObjectURL);state.audioObjectURL=null;$('#audio-player').hidden=true;document.body.classList.remove('has-player');}
function transcriptHTML(items,creation){
  if(!items)return `<p class="muted">${t('Loading script…','正在加载文稿…')}</p>`;
  if(!items.length)return `<p class="muted">${t('No script lines were stored for this video.','此视频没有保存文稿。')}</p>`;
  const translated=items.some(line=>line.translation&&line.translation!==line.text);
  return `<ol class="transcript">${items.map(line=>`<li><span class="transcript-time">${durationLabel(line.start)}</span><div>${translated?`<small>${esc(line.text)}</small>`:''}<p>${esc(line.translation||line.text)}</p></div></li>`).join('')}</ol><p class="field-note">${translated?t(`Original ${languageName(creation.source_language||'')} above each ${languageName(creation.language||'')} line.`,`每行上方为${languageName(creation.source_language||'')}原文，下方为${languageName(creation.language||'')}配音文稿。`):t('Lines as spoken in the dub.','配音所用文稿。')}</p>`;
}
function videoDialogHTML(creation,{withVideo=true}={}){
  return `<div class="dialog-heading"><div><p class="eyebrow">${kindName(creation.kind)}</p><h2>${esc(creation.title||kindName(creation.kind))}</h2></div>${button('close-video','×',{tone:'icon-button',title:t('Close','关闭')})}</div>${withVideo?`<video id="video-player" controls playsinline preload="metadata"${state.videoObjectURL?` src="${state.videoObjectURL}"`:''}></video>`:''}<div class="transcript-wrap">${transcriptHTML(state.transcript?.id===creation.id?state.transcript.items:null,creation)}</div><div class="panel-actions">${button('download-creation',t('Download video','下载视频'),{id:creation.id,tone:'secondary'})}</div>`;
}
function closeVideoDialog(){const dialog=$('#video-dialog');const player=dialog.querySelector('video');if(player){player.pause();player.removeAttribute('src');player.load();}if(state.videoObjectURL)URL.revokeObjectURL(state.videoObjectURL);state.videoObjectURL=null;if(dialog.open)dialog.close();}
async function openVideoDialog(id,{withVideo=true}={}){
  const creation=state.creations.find(v=>v.id===id);if(!creation)throw new StudioError('WEB_CREATION_UNAVAILABLE');
  closeVideoDialog();stopPlayer();const dialog=$('#video-dialog');
  if(withVideo){const blob=await request(`/creations/${encodeURIComponent(id)}/audio`,{blob:true});state.videoObjectURL=URL.createObjectURL(blob);}
  dialog.innerHTML=videoDialogHTML(creation,{withVideo});if(!dialog.open)dialog.showModal();
  if(withVideo){const player=dialog.querySelector('video');if(player)try{await player.play();}catch{}}
  if(state.transcript?.id!==id){try{const transcript=await request(`/creations/${encodeURIComponent(id)}/transcript`);state.transcript={id,items:items(transcript)};}catch(error){state.transcript={id,items:[]};if(error.status!==404)showError(error);}}
  const wrap=dialog.querySelector('.transcript-wrap');if(wrap&&dialog.open)wrap.innerHTML=transcriptHTML(state.transcript.items,creation);
}
async function previewVoice(id){const voice=allVoices().find(v=>v.id===id);if(!voice)throw new StudioError('WEB_VOICE_UNAVAILABLE');const publicVoice=state.catalog.find(v=>v.id===id);await playURL(publicVoice?.preview_url||`/voices/${encodeURIComponent(id)}/audio`,voiceName(voice),t('Voice preview','音色试听'),!!publicVoice?.preview_url);}
async function downloadCreation(id){const c=state.creations.find(v=>v.id===id);if(!c)return;const blob=await request(`/creations/${encodeURIComponent(id)}/audio`,{blob:true});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${(c.title||'xsimple-audio').replace(/[\\/:*?"<>|]/g,'-').slice(0,100)}.${blob.type.includes('mp4')||c.media==='video'?'mp4':blob.type.includes('mpeg')?'mp3':'wav'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

function voiceDialogHTML() {
  return `<div class="dialog-heading"><div><p class="eyebrow">${t('MY VOICE','我的声音')}</p><h2>${t('A voice to create with.','保存一个创作声音。')}</h2></div>${button('close-voice','×',{tone:'icon-button',title:t('Close','关闭')})}</div><p class="muted">${t('Record a clear voice or upload a recording. You can use saved voices for both voiceovers and song covers.','录制清晰人声或上传已有录音。保存后可用于配音与歌曲翻唱。')}</p><div class="recording-tools">${button(state.recording?'stop-recording':'start-recording',state.recording?t('■ Stop recording','■ 停止录音'):t('● Record voice','● 开始录音'),{tone:state.recording?'danger primary':'secondary'})}<label class="button secondary">${t('Upload audio','上传音频')}<input type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4" data-file="voice" hidden></label></div>${state.recording?`<p class="recording-status" role="status"><span></span>${t('Recording…','正在录音…')}</p>`:''}<div class="selected-file">${esc(state.voiceFile?.name||t('No recording selected','尚未选择录音'))}${state.voiceFile?button('preview-upload',t('▶ Preview','▶ 试听'),{tone:'text'}):''}</div><label class="field"><span>${t('Voice name','声音名称')}</span><input id="voice-name" data-voice-name value="${esc(state.voiceName)}" maxlength="80" placeholder="${t('For example, My narrator voice','例如：我的旁白声音')}"></label><label class="field"><span>${t('Reference language','录音语言')}</span><select id="voice-language" data-voice-language>${option('en','English',state.voiceLanguage)}${option('zh','中文',state.voiceLanguage)}</select></label><label class="consent-box"><input type="checkbox" data-voice-consent${state.voiceConsent?' checked':''}><span>${t('I own this voice or have permission from the speaker to upload and use it for audio generation.','我拥有此声音，或已获说话者授权，可上传并用于音频生成。')}</span></label><p class="field-note">${t('Saving uploads this reference to your account. Deleting a browser draft does not delete the saved voice.','保存时会将参考录音上传到你的账号。删除浏览器草稿不会删除已保存的声音。')}</p><div class="panel-actions">${button('upload-voice',busy('voice-upload')?t('Uploading…','正在上传…'):t('Save voice','保存声音'),{tone:'primary',isDisabled:busy('voice-upload')||state.recording})}</div>`;
}
function openVoiceDialog(){const dialog=$('#voice-dialog');dialog.innerHTML=voiceDialogHTML();if(!dialog.open)dialog.showModal();}
function closeVoiceDialog(){const dialog=$('#voice-dialog');if(state.recording)stopRecording();if(dialog.open)dialog.close();}
async function startRecording(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new StudioError('WEB_MIC_UNSUPPORTED');
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch{throw new StudioError('WEB_MIC_PERMISSION');}
  if(!$('#voice-dialog').open){stream.getTracks().forEach(track=>track.stop());return;}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(v=>MediaRecorder.isTypeSupported(v));
  let recorder;try{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);}catch(error){stream.getTracks().forEach(track=>track.stop());throw new StudioError('WEB_MIC_UNSUPPORTED');}
  const chunks=[];recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const type=recorder.mimeType||'audio/webm';state.voiceFile=new File(chunks,`voice-${new Date().toISOString().slice(0,10)}.${type.includes('mp4')?'m4a':'webm'}`,{type});state.recording=false;state.recorder=null;if($('#voice-dialog').open)openVoiceDialog();};
  state.recorder=recorder;state.recording=true;state.recordingStart=Date.now();recorder.start();openVoiceDialog();
}
function stopRecording(){if(state.recorder&&state.recorder.state!=='inactive')state.recorder.stop();state.recording=false;}

function validMusic(music){return (music.generation_mode==='instrumental'||(music.lyrics||'').trim())&&(music.lyrics||'').length<=1200&&(music.style||'').trim()&&(music.style||'').length<=500&&Number(music.bpm)>=60&&Number(music.bpm)<=180&&Number(music.duration)>=8&&Number(music.duration)<=30;}
async function saveProject() {
  if(!requireUser())return null;
  if(state.currentProject&&state.projectDirty){
    if(!await syncCloudJobs())return null;
    if(projectHasActiveJob(state.currentProject.id))throw new StudioError('project_job_active');
  }
  if(!state.currentProject){const form=state.forms.assistant;const result=await request('/projects',{method:'POST',body:{mode:form.mode,language:form.language||getLanguage(),title:form.title.trim()||modeName(form.mode),prompt:form.prompt}});state.currentProject=result.project||result;state.projectDirty=false;state.selectedProjectID=state.currentProject.id;}
  else if(state.projectDirty){const project=state.currentProject;const result=await request(`/projects/${encodeURIComponent(project.id)}`,{method:'PUT',body:{version:project.version,title:project.title,prompt:project.prompt,plan:project.plan}});state.currentProject=result.project||result;state.projectDirty=false;}
  await refreshData();saveLocal();return state.currentProject;
}
async function planProject(revision=false) {
  if(!requireAccess('assistant'))return;
  const form=state.forms.assistant;
  if(!form.consent){notify(t('Please allow AI drafting before sending this brief to OpenAI.','发送给 OpenAI 前，请先勾选允许 AI 辅助创作。'),true);return;}
  const prompt=(revision?form.revision:state.currentProject?.prompt||form.prompt).trim();if(!prompt)throw new StudioError('WEB_INVALID_BRIEF');
  const project=await saveProject();if(!project)return;
  await submitJob('project-plan',`/projects/${encodeURIComponent(project.id)}/plan`,{prompt,target_segment_id:revision?form.target||null:null,version:project.version},{projectID:project.id});
}
async function renderProject(){if(!requireUser())return;if(projectNeedsMissingVoice(state.currentProject))throw new StudioError('WEB_VOICE_UNAVAILABLE');const project=await saveProject();if(!project?.plan)throw new StudioError('WEB_INVALID_PLAN');if(!requireAccess(project.mode==='music'?'music':'speech'))return;await submitJob('project-render',`/projects/${encodeURIComponent(project.id)}/render`,{version:project.version}, {projectID:project.id});}
function chooseProject(id){if(state.projectDirty&&!confirm(t('Discard unsaved edits and open another project?','放弃当前未保存修改并打开其他项目？')))return;state.currentProject=state.projects.find(p=>p.id===id)||null;state.selectedProjectID=id||null;state.projectDirty=false;state.forms.assistant.revision='';state.forms.assistant.target='';saveLocal();render();}
function newProject(mode=state.forms.assistant.mode){if(state.projectDirty&&!confirm(t('Keep the saved project and discard these unsaved edits?','保留已保存的项目，并放弃当前未保存修改？')))return;state.currentProject=null;state.selectedProjectID=null;state.projectDirty=false;state.forms.assistant={...state.forms.assistant,mode,title:'',prompt:'',revision:'',target:''};saveLocal();render();}

async function billingRedirect(path,body={}){
  if(!requireUser())return;
  if(!state.config?.billing_enabled)throw new StudioError('WEB_BILLING_NOT_CONFIGURED');
  const response=await request(path,{method:'POST',body});let url;try{url=new URL(response.url);}catch{throw new StudioError('WEB_BILLING_URL');}
  if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new StudioError('WEB_BILLING_URL');
  flushLocal();location.assign(url.href);
}
async function verifyPaymentReturn(){
  const params=new URLSearchParams(location.search),outcome=params.get('checkout')||params.get('billing');
  params.delete('checkout');params.delete('billing');history.replaceState(null,'',`${location.pathname}${params.toString()?'?'+params:''}${location.hash}`);
  if(outcome==='cancelled'||outcome==='cancel'){notify(t('Checkout was closed. Your account access has not been changed by this page.','付款页面已关闭，本页面不会自行更改账户权限。'));return;}
  if(outcome!=='success')return;
  navigate('account');notify(t('Checking your payment with the service…','正在向服务核对付款状态…'));
  for(let attempt=0;attempt<6;attempt++){
    try{await loadSession();render();if(state.session.user&&state.session.entitlements?.speech){notify(t('Your membership access is active.','会员权限已生效。'));return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  notify(t('Payment confirmation is still pending. Refresh Account shortly; do not pay again to retry. (WEB_PAYMENT_PENDING)','付款确认仍在处理中，请稍后刷新账户；无需重复付款。（WEB_PAYMENT_PENDING）'),true);
}

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const {action,id}=target.dataset;event.preventDefault();
  if(routes.includes(action)){navigate(action);return;}
  const immediate={language:()=>{setLanguage(getLanguage()==='zh'?'en':'zh');render();},'voice-filter':()=>{state.voiceFilter=id;render();},'creation-filter':()=>{state.creationFilter=id;render();},'add-voice':openVoiceDialog,'close-voice':closeVoiceDialog,
    'use-voice':()=>{state.forms.clone.voice_id=id;saveLocal();navigate('clone');},'close-video':closeVideoDialog,
    'vlog-style':()=>{state.forms.vlog.style=id;saveLocal();render();},'vlog-genre':()=>{state.forms.vlog.genre=id;saveLocal();render();},'vlog-mode':()=>{state.forms.vlog.mode=id;saveLocal();render();},'vlog-engine':()=>{state.forms.vlog.engine=id;saveLocal();render();},
    'new-vlog':()=>{if(state.vlogDirty&&!confirm(t('Discard unsaved script edits?','放弃未保存的脚本修改？')))return;state.currentVlogID=null;state.vlogDraft=null;state.vlogDirty=false;saveLocal();render();},
    'open-job-vlog':()=>{if(state.vlogDirty&&state.currentVlogID!==id&&!confirm(t('Discard unsaved script edits?','放弃未保存的脚本修改？')))return;setCurrentVlog(id);navigate('vlog');},
    'add-line':()=>{if(!state.vlogDraft)return;const last=state.vlogDraft.lines.at(-1);const start=last?Math.round((Number(last.end)+0.5)*10)/10:1;state.vlogDraft.lines.push({id:'line-'+(state.vlogDraft.lines.length+1)+'-new',start,end:Math.round((start+3)*10)/10,text:''});state.vlogDirty=true;render();},
    'delete-line':()=>{if(!state.vlogDraft)return;state.vlogDraft.lines.splice(Number(id),1);state.vlogDirty=true;render();},'music-mode':()=>{state.forms.music.generation_mode=id;if(id==='instrumental')state.forms.music.lyrics='';saveLocal();render();},
    'assistant-music':()=>{newProject('music');navigate('assistant');},'assistant-mode':()=>{if((state.currentProject?.mode||state.forms.assistant.mode)!==id)newProject(id);},'new-project':()=>newProject(),
    'project-music-mode':()=>{if(!state.currentProject?.plan?.music)return;state.currentProject.plan.music.generation_mode=id;if(id==='instrumental')state.currentProject.plan.music.lyrics='';state.projectDirty=true;saveLocal();render();},
    'revise-segment':()=>{state.forms.assistant.target=id;render();$('#revision-box')?.scrollIntoView({behavior:'smooth',block:'center'});},
    'select-creation':()=>{state.selected=state.selected.includes(id)?state.selected.filter(v=>v!==id):[...state.selected,id];render();},'clear-selection':()=>{state.selected=[];render();},
    'move-up':()=>moveSelection(id,-1),'move-down':()=>moveSelection(id,1),'dismiss-job':()=>{state.dismissedJobs.add(id);state.jobs.delete(id);renderJobs();saveLocal();},'stop-recording':stopRecording,
    'music-preset':()=>{state.forms.music.style=['Acoustic folk, warm guitar, gentle percussion','Melodic pop, bright piano, steady drums','Hip hop, punchy drums, rhythmic bass','Ambient electronic, soft synths, spacious texture'][Number(id)]||'';saveLocal();render();},
    'open-job-project':()=>{chooseProject(id);navigate('assistant');},
  };
  if(immediate[action]){immediate[action]();return;}
  const handlers={
    speech:async()=>{if(!requireAccess('speech'))return;const f=state.forms.clone;const text=f.text.trim();if(!text)throw new StudioError('WEB_SPEECH_TEXT_EMPTY');if(text.length>SPEECH_MAX_CHARS)throw new StudioError('WEB_SPEECH_TEXT_TOO_LONG');if(!f.voice_id)throw new StudioError('WEB_VOICE_REQUIRED');requireAvailableVoice('clone');const legacyRetry=state.requestIds.speech?.signature===JSON.stringify(f);await submitJob('speech','/speech',legacyRetry?f:{...f,text});},
    'generate-music':async()=>{if(!requireAccess('music'))return;const f=state.forms.music;if(!validMusic(f))throw new StudioError('WEB_INVALID_MUSIC');await submitJob('music','/music',{...f,lyrics:f.generation_mode==='instrumental'?'':f.lyrics});},
    'generate-dub':async()=>{if(!requireAccess('speech'))return;const f=state.forms.dub;if(!state.dubFile||!f.voice_id||!f.target_language)throw new StudioError('WEB_INVALID_DUB');if(!f.consent)throw new StudioError('WEB_VIDEO_CONSENT');requireAvailableVoice('dub','original');const limits=state.config?.dubbing||{};if(state.dubFile.size>(Number(limits.max_bytes)||300*1024*1024))throw new StudioError('studio_video_too_large');const data=new FormData();data.set('video',state.dubFile);data.set('voice_id',f.voice_id);data.set('target_language',f.target_language);data.set('source_language',f.source_language||'auto');data.set('background',f.background||'mute');data.set('consent','true');if(f.title.trim())data.set('title',f.title.trim());const job=await submitJob('dub','/dubs',{...f,file:[state.dubFile.name,state.dubFile.size,state.dubFile.lastModified]},{formData:data});if(job)state.dubFile=null;},
    'view-transcript':()=>openVideoDialog(id,{withVideo:false}),
    'generate-vlog-script':async()=>{if(!requireAccess('speech'))return;const f=state.forms.vlog;if(!state.vlogFile)throw new StudioError('WEB_INVALID_VLOG');if(!f.consent)throw new StudioError('WEB_VIDEO_CONSENT');if(f.style==='custom'&&!f.style_text.trim())throw new StudioError('WEB_INVALID_VLOG_STYLE');if(f.mode==='auto'&&f.engine==='clone'&&!f.voice_id)throw new StudioError('WEB_INVALID_VOICE');if(f.mode==='auto'&&f.engine==='clone')requireAvailableVoice('vlog');const limits=state.config?.vlog||{};if(state.vlogFile.size>(Number(limits.max_bytes)||300*1024*1024))throw new StudioError('studio_video_too_large');const data=new FormData();data.set('video',state.vlogFile);data.set('language',f.language);data.set('style',f.style);data.set('genre',f.genre||'auto');if(f.style_text.trim())data.set('style_text',f.style_text.trim());if(f.brief.trim())data.set('brief',f.brief.trim());if(f.title.trim())data.set('title',f.title.trim());data.set('consent','true');const job=await submitJob('vlog-script','/vlogs',{brief:f.brief,style:f.style,genre:f.genre||'auto',style_text:f.style_text,language:f.language,title:f.title,file:[state.vlogFile.name,state.vlogFile.size,state.vlogFile.lastModified]},{formData:data});if(job){if(f.mode==='auto'){job.auto=true;job.render={voice:vlogVoiceSpec(),background_volume:Number(f.background)/100};}state.vlogFile=null;flushLocal();await refreshData();}},
    'rewrite-script':async()=>{const vlog=currentVlog();if(!vlog)return;if(!requireAccess('speech'))return;const f=state.forms.vlog;if(!f.consent)throw new StudioError('WEB_VIDEO_CONSENT');if(f.style==='custom'&&!f.style_text.trim())throw new StudioError('WEB_INVALID_VLOG_STYLE');if(state.vlogDirty&&!confirm(t('Replace the current script, including unsaved edits?','重新生成会替换当前脚本（含未保存修改），继续？')))return;const job=await submitJob('vlog-script:'+vlog.id+':'+Date.now(),`/vlogs/${encodeURIComponent(vlog.id)}/script`,{language:vlog.language||f.language,style:f.style,genre:f.genre||'auto',style_text:f.style_text.trim(),brief:f.brief.trim()});if(job){job.vlog_id=vlog.id;state.vlogDirty=false;flushLocal();await refreshData();}},
    'save-script':saveVlogScript,'render-vlog':renderVlog_,
    'delete-vlog':async()=>{if(!confirm(t('Delete this vlog and its script? Finished videos stay in Creations.','删除这条 vlog 及其脚本？已生成的视频会保留在“我的作品”。')))return;await request(`/vlogs/${encodeURIComponent(id)}`,{method:'DELETE'});state.currentVlogID=null;state.vlogDraft=null;state.vlogDirty=false;await refreshData();saveLocal();},
    'generate-cover':async()=>{if(!requireUser())return;const f=state.forms.cover;if(!state.coverFile||!f.voice_id||Number(f.seconds)<5)throw new StudioError('WEB_INVALID_COVER');const maxSeconds=Number(state.session.entitlements?.cover_max_seconds||30);if(Number(f.seconds)>maxSeconds){notify(t(`Your account supports covers up to ${maxSeconds} seconds. Shorten the cover or check your membership.`,`当前账号翻唱最长 ${maxSeconds} 秒，请缩短时长或查看会员权限。`),true);navigate('account');return;}requireAvailableVoice('cover');const data=new FormData();data.set('song',state.coverFile);data.set('voice_id',f.voice_id);data.set('seconds',f.seconds);await submitJob('cover','/covers',{...f,file:[state.coverFile.name,state.coverFile.size,state.coverFile.lastModified]},{formData:data});},
    'preview-voice':()=>previewVoice(id),'start-recording':startRecording,
    'preview-upload':async()=>{if(!state.voiceFile)return;const url=URL.createObjectURL(state.voiceFile);if(state.audioObjectURL)URL.revokeObjectURL(state.audioObjectURL);state.audioObjectURL=url;const player=$('#player');player.src=url;$('#player-title').textContent=state.voiceName||state.voiceFile.name;$('#player-detail').textContent=t('Local recording','本地录音');$('#audio-player').hidden=false;document.body.classList.add('has-player');try{await player.play();}catch{}},
    'upload-voice':async()=>{if(!requireUser())return;if(!state.voiceFile||!state.voiceName.trim())throw new StudioError('WEB_INVALID_VOICE');if(!state.voiceConsent)throw new StudioError('WEB_VOICE_CONSENT');const data=new FormData();data.set('file',state.voiceFile);data.set('name',state.voiceName.trim());data.set('consent','true');data.set('language',state.voiceLanguage);const result=await request('/voices',{method:'POST',body:data});const voice=result.voice||result;await refreshData();if(voice.id&&!state.voices.some(v=>v.id===voice.id))state.voices=[...state.voices,voice];if(voice.id){state.forms.clone.voice_id=voice.id;state.forms.cover.voice_id=voice.id;}state.voiceFile=null;state.voiceName='';state.voiceConsent=false;closeVoiceDialog();saveLocal();notify(t('Your voice has been saved to your account.','声音已保存到账号。'));},
    'delete-voice':async()=>{if(!confirm(t('Delete this saved voice? Existing creations stay in your library.','删除这个已保存的声音？已生成作品会保留。')))return;await request(`/voices/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshData();if(state.forms.clone.voice_id===id)state.forms.clone.voice_id='';if(state.forms.cover.voice_id===id)state.forms.cover.voice_id='';if(state.forms.dub.voice_id===id)state.forms.dub.voice_id='original';if(state.forms.vlog.voice_id===id)state.forms.vlog.voice_id='';saveLocal();},
    'save-project':saveProject,'plan-project':()=>planProject(false),'revise-project':()=>planProject(true),'render-project':renderProject,
    'delete-project':async()=>{if(!confirm(t('Delete this project and its working parts?','删除这个项目及其工作片段？')))return;await request(`/projects/${encodeURIComponent(id)}`,{method:'DELETE'});state.currentProject=null;state.projectDirty=false;state.selectedProjectID=null;await refreshData();saveLocal();},
    'preview-segment':()=>playURL(`/projects/${encodeURIComponent(state.currentProject.id)}/segments/${encodeURIComponent(id)}/audio`,state.currentProject.title,t('Project part','项目片段')),
    'play-creation':()=>{const c=state.creations.find(v=>v.id===id);if(!c)return null;return c.media==='video'||c.kind==='dub'?openVideoDialog(id):playURL(`/creations/${encodeURIComponent(id)}/audio`,c.title,kindName(c.kind));},
    'download-creation':()=>downloadCreation(id),
    favorite:async()=>{const c=state.creations.find(v=>v.id===id);if(!c)return;await request(`/creations/${encodeURIComponent(id)}`,{method:'PATCH',body:{favorite:!c.favorite}});await refreshData();},
    'rename-creation':async()=>{const c=state.creations.find(v=>v.id===id);const title=prompt(t('Name this creation','为作品命名'),c?.title||'');if(title===null||!title.trim())return;await request(`/creations/${encodeURIComponent(id)}`,{method:'PATCH',body:{title:title.trim()}});await refreshData();},
    'delete-creation':async()=>{if(!confirm(t('Delete this creation from your account? Download a copy first if you want to keep it.','从账号删除这份作品？如需保留，请先下载副本。')))return;await request(`/creations/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshData();},
    'reuse-creation':async()=>{const c=state.creations.find(v=>v.id===id);if(!c?.request)return;const r=c.request;if(c.kind==='dub'||r.target_language){for(const key of ['voice_id','target_language','source_language','background'])if(r[key]!==undefined&&r[key]!==null)state.forms.dub[key]=r[key];navigate('dub');}else if(r.generation_mode||r.style){for(const key of Object.keys(state.forms.music))if(r[key]!==undefined)state.forms.music[key]=r[key];navigate('music');}else if(r.text){for(const key of Object.keys(state.forms.clone))if(r[key]!==undefined)state.forms.clone[key]=r[key];navigate('clone');}saveLocal();},
    stitch:async()=>{if(!requireUser())return;if(state.selected.length<2)return;await submitJob('stitch','/stitch',{creation_ids:state.selected});},
    'pause-job':async()=>{const job=await request(`/jobs/${encodeURIComponent(id)}/pause`,{method:'POST',body:{}});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job)});saveLocal();},
    'resume-job':async()=>{const job=await request(`/jobs/${encodeURIComponent(id)}/resume`,{method:'POST',body:{}});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job)});pollJob(id);saveLocal();},
    'cancel-job':async()=>{if(!confirm(t('Cancel this task? Finished project parts will be kept.','取消此任务？项目中已完成的片段会保留。')))return;const job=await request(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job),status:job?.status||'cancelled'});await refreshData();saveLocal();},
    refresh:()=>refreshData(),'refresh-session':async()=>{await loadSession();await refreshData();notify(t('Account status refreshed.','账户状态已刷新。'));},
    logout:async()=>{await request('/auth/logout',{method:'POST',body:{}});window.google?.accounts?.id?.disableAutoSelect();clearAccount();navigate('account');},
    checkout:()=>billingRedirect('/billing/checkout',{price_id:id}),'billing-portal':()=>billingRedirect('/billing/portal'),
  };
  if(handlers[action])return run(({ 'generate-music':'music','generate-cover':'cover','generate-dub':'dub','view-transcript':'transcript','generate-vlog-script':'vlog-script','rewrite-script':'vlog-script','save-script':'vlog-save','render-vlog':'vlog-render','delete-vlog':'vlog-save','plan-project':'project-plan','revise-project':'project-plan','render-project':'project-render','save-project':'project-save','upload-voice':'voice-upload',checkout:'billing','billing-portal':'billing',logout:'auth'}[action]||action),handlers[action]);
});
function moveSelection(id,delta){const at=state.selected.indexOf(id),to=at+delta;if(at<0||to<0||to>=state.selected.length)return;[state.selected[at],state.selected[to]]=[state.selected[to],state.selected[at]];render();}

document.addEventListener('input',event=>{
  const input=event.target;if(input.dataset.voiceName!==undefined){state.voiceName=input.value;return;}
  if(input.dataset.search){state.voiceSearch=input.value;render();return;}
  if(input.dataset.form){const {form,key}=input.dataset;const value=input.type==='checkbox'?input.checked:['speed','pitch','volume','bpm','duration','seed','seconds','background'].includes(key)?Number(input.value):input.value;state.forms[form][key]=value;const count=$(`[data-counter="${form}.${key}"]`);if(count)count.textContent=`${input.value.length} / ${input.maxLength}`;if(input.type==='range'){const label=input.parentElement?.querySelector('small');if(label)label.textContent=Number(value)===0?t('Muted','完全静音'):t(`${value}% of the original`,`原声 ${value}%`);}saveLocal();return;}
  if(input.dataset.vlogTitle!==undefined&&state.vlogDraft){state.vlogDraft.title=input.value;state.vlogDirty=true;const pill=$('.project-toolbar .pill');if(pill){pill.textContent=t('Unsaved script edits','脚本有未保存修改');pill.classList.add('pending');}const save=$('[data-action="save-script"]');if(save)save.disabled=false;return;}
  if(input.dataset.vlogLine!==undefined&&state.vlogDraft){const line=state.vlogDraft.lines[Number(input.dataset.vlogLine)];if(!line)return;const key=input.dataset.lineKey;line[key]=key==='text'||key==='delivery'?input.value:Number(input.value);state.vlogDirty=true;const counter=input.parentElement?.querySelector('small');if(counter&&key==='text')counter.textContent=`${input.value.length} / 400`;const pill=$('.project-toolbar .pill');if(pill){pill.textContent=t('Unsaved script edits','脚本有未保存修改');pill.classList.add('pending');}const save=$('[data-action="save-script"]');if(save)save.disabled=false;return;}
  if(!state.currentProject)return;
  const project=state.currentProject;let changed=false;
  if(input.dataset.project){const key=input.dataset.project;project[key]=input.value;if(project.plan&&['title','language'].includes(key))project.plan[key]=input.value;if(key==='language')project.completed_segment_ids=[];changed=true;}
  if(input.dataset.role!==undefined){const role=project.plan.roles[Number(input.dataset.role)];role[input.dataset.roleKey]=input.value;if(input.dataset.roleKey==='voice_id'){const affected=project.plan.segments.filter(s=>s.role_id===role.id).map(s=>s.id);project.completed_segment_ids=(project.completed_segment_ids||[]).filter(id=>!affected.includes(id));}changed=true;}
  if(input.dataset.segment!==undefined){const key=input.dataset.segmentKey;const segment=project.plan.segments[Number(input.dataset.segment)];segment[key]=['speed','pitch','volume'].includes(key)?Number(input.value):input.value;project.completed_segment_ids=(project.completed_segment_ids||[]).filter(id=>id!==segment.id);const card=input.closest('.segment');const badge=card?.querySelector('.pill');if(badge){badge.textContent=t('Needs audio','待生成音频');badge.classList.remove('ready');}card?.querySelector('[data-action="preview-segment"]')?.remove();changed=true;}
  if(input.dataset.music){const key=input.dataset.music;project.plan.music[key]=['bpm','duration'].includes(key)?Number(input.value):input.value;changed=true;}
  if(changed){state.projectDirty=true;saveLocal();const pill=$('.project-toolbar .pill');if(pill){pill.textContent=t('Unsaved edits','有未保存修改');pill.classList.add('pending');}}
});
document.addEventListener('change',event=>{
  const input=event.target;if(input.dataset.file==='cover'){state.coverFile=input.files?.[0]||null;render();}
  if(input.dataset.file==='dub'){state.dubFile=input.files?.[0]||null;render();}
  if(input.dataset.file==='vlog'){state.vlogFile=input.files?.[0]||null;render();}
  if(input.dataset.vlogSelect!==undefined){if(state.vlogDirty&&!confirm(t('Discard unsaved script edits?','放弃未保存的脚本修改？'))){input.value=state.currentVlogID||'';return;}setCurrentVlog(input.value);render();}
  if(input.dataset.file==='voice'){state.voiceFile=input.files?.[0]||null;openVoiceDialog();}
  if(input.dataset.voiceConsent!==undefined)state.voiceConsent=input.checked;
  if(input.dataset.voiceLanguage!==undefined)state.voiceLanguage=input.value;
  if(input.dataset.selectCreation){const id=input.dataset.selectCreation;state.selected=input.checked?[...new Set([...state.selected,id])]:state.selected.filter(v=>v!==id);render();}
  if(input.dataset.projectSelect!==undefined)chooseProject(input.value);
  if(input.tagName==='SELECT'&&(input.dataset.key==='voice_id'||input.dataset.role!==undefined||input.dataset.form==='dub'||(input.dataset.form==='vlog'&&input.dataset.key!=='narrator')))render();
});
$('#player-close').addEventListener('click',stopPlayer);
$('#voice-dialog').addEventListener('cancel',()=>{if(state.recording)stopRecording();});
$('#video-dialog').addEventListener('close',()=>{const player=$('#video-dialog').querySelector('video');if(player){player.pause();player.removeAttribute('src');player.load();}if(state.videoObjectURL)URL.revokeObjectURL(state.videoObjectURL);state.videoObjectURL=null;});
$('#player').addEventListener('error',()=>notify(t('This audio could not be played. Try downloading it or refresh the item. (WEB_AUDIO_PLAYBACK)','无法播放此音频，请尝试下载，或刷新后重试。（WEB_AUDIO_PLAYBACK）'),true));
window.addEventListener('hashchange',()=>{state.route=routes.includes(location.hash.slice(1))?location.hash.slice(1):'clone';render();window.scrollTo({top:0});});
window.addEventListener('pagehide',()=>{flushLocal();if(state.recording)stopRecording();});
initialize().catch(showError);
