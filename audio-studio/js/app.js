import { request, setCSRFToken, onAuthExpired, errorMessage, StudioError, API_BASE } from './api.js';
import { t, getLanguage, setLanguage, dateLabel, durationLabel } from './i18n.js';
import { setDraftOwner, readDrafts, saveDrafts } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const uid = () => crypto.randomUUID();
const items = value => Array.isArray(value) ? value : value?.items || [];
const routes = ['clone', 'voices', 'cover', 'music', 'assistant', 'creations', 'account'];
const activeStatuses = new Set(['queued', 'running', 'paused']);
const navNames = () => ({ clone:t('Voice clone','声音克隆'), voices:t('AI voices','AI 声库'), cover:t('Song cover','歌曲翻唱'), music:t('Music studio','音乐创作'), assistant:t('Creative assistant','创作助手'), creations:t('Creations','我的作品'), account:t('Account','账户') });
const modeName = mode => ({ narration:t('Voiceover','一句话配音'), music:t('Music','音乐创作'), dialogue:t('Audio scene','多角色小剧场') }[mode] || mode);
const musicName = mode => ({ song:t('Song','歌曲'), rap:t('Rap','说唱'), instrumental:t('Instrumental','纯音乐') }[mode] || mode);
const kindName = kind => ({ speech:t('Voiceover','语音'), clone:t('Voice clone','声音克隆'), cover:t('Song cover','翻唱'), covers:t('Song cover','翻唱'), music:t('Music','音乐'), song:t('Song','歌曲'), rap:t('Rap','说唱'), instrumental:t('Instrumental','纯音乐'), stitch:t('Stitched audio','拼接音频'), assistant_plan:t('Preparing draft','创作草稿'), assistant_render:t('Creating project audio','生成项目音频'), project_plan:t('Preparing draft','创作草稿'), project_render:t('Creating project audio','生成项目音频'), plan:t('Preparing draft','创作草稿'), render:t('Creating project audio','生成项目音频') }[kind] || t('Creation','作品'));
const icons = { clone:'〰', voices:'◉', cover:'♫', music:'♪', assistant:'✦', creations:'▤', account:'◎' };
const emptyForms = () => ({
  clone:{ text:'', language:getLanguage(), voice_id:'', speed:1, pitch:0, volume:1 },
  music:{ lyrics:'', style:'', language:getLanguage(), bpm:100, duration:20, seed:Math.floor(Math.random()*2147483647), generation_mode:'song' },
  cover:{ voice_id:'', seconds:30 },
  assistant:{ mode:'narration', title:'', prompt:'', revision:'', target:'', consent:false, language:getLanguage() },
});
const state = { route:routes.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'clone', config:null, configError:null,
  session:{user:null,entitlements:{}}, catalog:[], voices:[], creations:[], projects:[], prices:[], jobs:new Map(), timers:new Map(), polling:new Set(), dismissedJobs:new Set(),
  forms:emptyForms(), currentProject:null, projectDirty:false, selected:[], voiceFilter:'all', voiceSearch:'', creationFilter:'all',
  coverFile:null, voiceFile:null, voiceName:'', voiceLanguage:getLanguage(), voiceConsent:false, recorder:null, recording:false, recordingStart:0,
  busy:new Set(), requestIds:{}, returnRoute:null, audioObjectURL:null, noticeTimer:null, googlePromise:null, googleGeneration:0,
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
  return `<div class="page-heading"><div><p class="eyebrow">XSIMPLE AUDIO STUDIO</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="heading-actions">${actions}</div></div>`;
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
      jobs:[...state.jobs.values()].filter(j=>activeStatuses.has(j.status)).map(j=>({id:j.id,kind:j.kind,request_key:j.request_key,project_id:j.project_id})) });
    if (!ok) notify(t('Your browser could not save the draft. Copy important text before leaving. (WEB_LOCAL_STORAGE)','浏览器无法保存草稿，离开前请复制重要文字。（WEB_LOCAL_STORAGE）'),true);
  },180);
}
function flushLocal() {
  clearTimeout(draftTimer);
  return saveDrafts({forms:state.forms,projectDraft:state.projectDirty?state.currentProject:null,selectedProjectID:state.currentProject?.id||null,
    requestIds:state.requestIds,jobs:[...state.jobs.values()].filter(j=>activeStatuses.has(j.status)).map(j=>({id:j.id,kind:j.kind,request_key:j.request_key,project_id:j.project_id}))});
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
function requestID(key,payload) {
  const signature=JSON.stringify(payload); const old=state.requestIds[key];
  if(old?.signature===signature)return old.id;
  const id=uid(); state.requestIds[key]={id,signature}; flushLocal();return id;
}

function render() {
  const focused=document.activeElement;
  const focusID=focused?.id, selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
  document.documentElement.lang=getLanguage()==='zh'?'zh-Hans':'en';
  $('#app-header').innerHTML=`<a class="studio-brand" href="./"><span class="brand-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>Xsimple<span class="brand-sub">Audio Studio</span></span></a><div class="header-actions"><a class="website-link" href="../xvoice.html">${t('Get the app','下载 App')}</a><button class="language-button" type="button" data-action="language" aria-label="${t('Switch to Chinese','切换为英文')}">${getLanguage()==='zh'?'EN':'中文'}</button><button class="account-button" type="button" data-action="account"><span class="account-dot" aria-hidden="true">${esc(state.session.user?.name?.[0]?.toUpperCase()||'G')}</span><span>${esc(state.session.user?.name||t('Sign in','登录'))}</span></button></div>`;
  $('#sidebar').innerHTML=`<p class="nav-caption">${t('YOUR WORKSPACE','你的工作台')}</p><div class="nav-items">${routes.map(route=>`<a class="nav-item${state.route===route?' active':''}" href="#${route}"${state.route===route?' aria-current="page"':''}><span aria-hidden="true">${icons[route]}</span>${navNames()[route]}</a>`).join('')}</div><div class="sidebar-bottom"><span class="small-brand">XM LLC</span><a href="privacy.html">${t('Privacy & data','隐私与数据')}</a><a href="../index.html#contact">${t('Contact support','联系支持')}</a><p>${t('A little idea. A new sound.','让每一个想法，都有声音。')}</p></div>`;
  const views={clone:renderClone,voices:renderVoices,cover:renderCover,music:renderMusic,assistant:renderAssistant,creations:renderCreations,account:renderAccount};
  workspace.innerHTML=views[state.route](); workspace.setAttribute('aria-busy','false');
  renderJobs();
  if(focusID) {const input=document.getElementById(focusID); if(input&&!input.disabled){input.focus({preventScroll:true});if(selection&&input.setSelectionRange)try{input.setSelectionRange(...selection);}catch{}}}
  if(state.route==='account'&&!state.session.user&&!busy('auth'))prepareGoogleSignIn();
}

function renderClone() {
  const form=state.forms.clone; const voice=allVoices().find(v=>v.id===form.voice_id);
  return pageHeading(t('Your words, your voice.','把文字变成你的声音。'),t('Choose a reference, write a few lines, and create a voiceover.','选择参考声音，写下文稿，生成属于你的配音。'))+
  `<div class="editor-grid"><div>${panel(t('Write your script','填写文稿'),
    formField('clone','text',t('Script','文稿'),{rows:9,limit:500,placeholder:t('Write what you would like your voice to say…','写下你希望这个声音说的话…')})+
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
    `<div class="editor-grid"><div>${panel(t('Your song','导入歌曲'),`<label class="upload-zone"><span class="upload-symbol" aria-hidden="true">↥</span><strong>${esc(state.coverFile?.name||t('Choose a song file','选择歌曲文件'))}</strong><span>${t('WAV, MP3, M4A and other supported audio files','WAV、MP3、M4A 等支持的音频文件')}</span><input id="cover-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" data-file="cover"></label><p class="field-note">${t('Only upload a song you own or have permission to use. The selected song and voice are sent to the audio service when you generate.','请仅上传你拥有或已获授权的歌曲。点击生成后，所选歌曲与声音会发送到音频服务。')}</p>`+
    `<div class="form-row">${formField('cover','seconds',t('Cover length · seconds','翻唱长度 · 秒'),{type:'number',min:5,max,step:1})}<p class="field-note">${t(`Your account supports up to ${max} seconds.`,`当前账号最长支持 ${max} 秒。`)}</p></div>`+
    `<div class="panel-actions">${button('generate-cover',busy('cover')?t('Uploading…','正在上传…'):t('Create song cover','生成歌曲翻唱'),{tone:'primary',isDisabled:busy('cover')})}</div>`)}${localNote()}</div><div>${panel(t('Reference voice','参考声音'),voiceSelect('cover',form.voice_id)+`<div class="stack-actions">${button('add-voice',t('Record or upload my voice','录制或上传我的声音'))}${button('preview-voice',t('Preview selected voice','试听所选声音'),{id:form.voice_id,isDisabled:!form.voice_id})}</div>`)}<p class="field-note">${t('You can move between tools while a task runs. Closing this page may leave the server task running.','任务运行期间可以切换工具；关闭网页后，服务端任务可能继续。')}</p></div></div>`;
}
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
    `<div class="filter-bar"><div class="segmented">${[['all',t('All','全部')],['favorites',t('Favorites','收藏')],['speech',t('Voice','语音')],['cover',t('Covers','翻唱')],['song',t('Songs','歌曲')],['rap',t('Rap','说唱')],['instrumental',t('Instrumentals','纯音乐')]].map(([v,l])=>`<button type="button" data-action="creation-filter" data-id="${v}" aria-pressed="${state.creationFilter===v}">${l}</button>`).join('')}</div></div>`+
    (selected.length?panel(t('Stitch selected audio','拼接已选音频'),`<ol class="stitch-order">${selected.map((c,i)=>`<li><span class="number-badge">${i+1}</span><strong>${esc(c.title)}</strong>${button('move-up','↑',{id:c.id,isDisabled:i===0,title:t('Move earlier','向前移动')})}${button('move-down','↓',{id:c.id,isDisabled:i===selected.length-1,title:t('Move later','向后移动')})}${button('select-creation','×',{id:c.id,title:t('Remove from selection','取消选择')})}</li>`).join('')}</ol><div class="panel-actions">${button('stitch',t('Stitch in this order','按此顺序拼接'),{tone:'primary',isDisabled:selected.length<2||busy('stitch')})}${button('clear-selection',t('Clear selection','清空选择'))}</div>`):'')+
    `<div class="creation-list">${list.map(c=>`<article class="creation-row"><label class="selection-box"><input type="checkbox" data-select-creation="${esc(c.id)}"${state.selected.includes(c.id)?' checked':''}><span class="sr-only">${t('Select','选择')} ${esc(c.title)}</span></label>${button('play-creation','▶',{id:c.id,tone:'play-button',title:t('Play creation','播放作品')})}<div class="creation-info"><h2>${esc(c.title||kindName(c.kind))}</h2><p><span>${kindName(c.request?.generation_mode||c.kind)}</span><span>${durationLabel(c.duration)}</span><span>${dateLabel(c.created_at)}</span></p></div><div class="creation-actions">${button('favorite',c.favorite?'★':'☆',{id:c.id,tone:'icon-button'+(c.favorite?' gold':''),title:t('Toggle favorite','切换收藏')})}${button('download-creation','↓',{id:c.id,tone:'icon-button',title:t('Download audio','下载音频')})}<details class="row-menu"><summary aria-label="${t('More actions','更多操作')}">•••</summary><div>${button('rename-creation',t('Rename','重命名'),{id:c.id,tone:'text'})}${c.request?button('reuse-creation',t('Use settings again','复用创作设置'),{id:c.id,tone:'text'}):''}${button('delete-creation',t('Delete','删除'),{id:c.id,tone:'text danger'})}</div></details></div></article>`).join('')}</div>${!list.length?emptyState(t('Room for your next idea','等待下一份灵感'),t('Finished audio appears here after a task succeeds. Try another filter or start a new creation.','任务完成后的音频会出现在这里。也可以切换筛选条件，或开始一份新创作。'),button('clone',t('Create audio','开始创作'),{tone:'primary'})):''}`;
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
  const map={queued:t('Waiting in queue','排队中'),running:t('Processing','处理中'),uploading:t('Uploading audio','上传音频'),downloading:t('Receiving audio','接收音频'),planning:t('Preparing draft','生成草稿'),rendering:t('Generating audio','生成音频'),synthesizing:t('Generating voice','生成语音'),stitching:t('Joining audio','拼接音频'),separating:t('Separating vocals','分离人声'),converting:t('Creating cover','制作翻唱'),mixing:t('Mixing audio','混合音频'),succeeded:t('Finished','已完成'),completed:t('Finished','已完成'),failed:t('Could not finish','未完成'),cancelled:t('Cancelled','已取消'),paused:t('Paused','已暂停')};
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
    return `<article class="job"><div class="job-heading"><strong>${kindName(j.kind)}</strong><span class="pill ${j.status==='succeeded'?'ready':''}">${stageLabel(j.status)}</span></div><p>${stageLabel(progress.stage||j.status)}${total?` · ${Math.min(current,total)} / ${total}`:''}</p>${total?`<progress max="${total}" value="${current}"></progress>`:''}${j.error_code||j.connection_error?`<p class="job-error">${esc(errorMessage(new StudioError(j.error_code||j.connection_error)))}</p>`:''}<div class="job-actions">${['queued','running'].includes(j.status)?`${j.kind.includes('render')?button('pause-job',t('Pause','暂停'),{id:j.id,tone:'text'}):''}${button('cancel-job',t('Cancel','取消'),{id:j.id,tone:'text'})}`:''}${j.status==='paused'?`${button('resume-job',t('Continue','继续'),{id:j.id,tone:'text'})}${button('cancel-job',t('Cancel','取消'),{id:j.id,tone:'text'})}`:''}${activeStatuses.has(j.status)&&j.project_id?button('open-job-project',t('Open project','打开项目'),{id:j.project_id,tone:'text'}):''}${j.status==='succeeded'?button(j.result?.project_id?'open-job-project':'creations',j.result?.project_id?t('Open project','打开项目'):t('View creation','查看作品'),{id:j.result?.project_id||'',tone:'text'}):''}${!activeStatuses.has(j.status)?button('dismiss-job','×',{id:j.id,tone:'text',title:t('Dismiss task','关闭任务状态')}):''}</div></article>`;
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
    if(!activeStatuses.has(job.status)&&job.request_key)delete state.requestIds[job.request_key];
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
  const results=await Promise.allSettled([request('/voices'),request('/creations'),request('/projects'),request('/jobs')]);
  if(currentUserID()!==owner)return;
  const keys=['voices','creations','projects'];results.forEach((r,i)=>{if(r.status==='fulfilled'){if(i===3)mergeCloudJobs(items(r.value),owner);else state[keys[i]]=items(r.value);}else if(r.reason.status!==401)showError(r.reason);});
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
  state.session={user:null,entitlements:{}};setCSRFToken(null);state.voices=[];state.creations=[];state.projects=[];state.jobs.clear();state.selected=[];
  state.coverFile=null;state.voiceFile=null;state.voiceConsent=false;state.busy.clear();stopPlayer();closeVoiceDialog();
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
  const id=requestID(key,payload);let body;
  if(formData){formData.set('request_id',id);body=formData;}else body={...payload,request_id:id};
  const response=await request(path,{method:'POST',body});const job=response?.job||response;
  if(!job?.id)throw new StudioError('WEB_INVALID_JOB');
  job.request_key=key;if(projectID)job.project_id=projectID;state.jobs.set(job.id,job);flushLocal();renderJobs();pollJob(job.id);
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
      if(job.request_key)delete state.requestIds[job.request_key];
      await refreshData({replaceProject:!!job.project_id&&state.currentProject?.id===job.project_id&&!state.projectDirty});
      if(currentUserID()!==owner)return;
      render();if(job.status==='succeeded')notify(t('Your creation is ready.','创作已完成。'));else if(job.status==='failed')showError(new StudioError(job.error_code||'WEB_GENERATION_FAILED'));
    }
  }catch(error){if(currentUserID()!==owner)return;if(error.status===404){state.jobs.delete(id);renderJobs();showError(error);}else if(error.status!==401){const job=state.jobs.get(id);if(job)job.connection_error=error.code||'WEB_CONNECTION';renderJobs();state.timers.set(id,setTimeout(()=>pollJob(id),6000));}}
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
async function previewVoice(id){const voice=allVoices().find(v=>v.id===id);if(!voice)throw new StudioError('WEB_VOICE_UNAVAILABLE');const publicVoice=state.catalog.find(v=>v.id===id);await playURL(publicVoice?.preview_url||`/voices/${encodeURIComponent(id)}/audio`,voiceName(voice),t('Voice preview','音色试听'),!!publicVoice?.preview_url);}
async function downloadCreation(id){const c=state.creations.find(v=>v.id===id);if(!c)return;const blob=await request(`/creations/${encodeURIComponent(id)}/audio`,{blob:true});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${(c.title||'xsimple-audio').replace(/[\\/:*?"<>|]/g,'-').slice(0,100)}.${blob.type.includes('mpeg')?'mp3':'wav'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

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
async function renderProject(){if(!requireUser())return;const project=await saveProject();if(!project?.plan)throw new StudioError('WEB_INVALID_PLAN');if(!requireAccess(project.mode==='music'?'music':'speech'))return;await submitJob('project-render',`/projects/${encodeURIComponent(project.id)}/render`,{version:project.version}, {projectID:project.id});}
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
    'use-voice':()=>{state.forms.clone.voice_id=id;saveLocal();navigate('clone');},'music-mode':()=>{state.forms.music.generation_mode=id;if(id==='instrumental')state.forms.music.lyrics='';saveLocal();render();},
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
    speech:async()=>{if(!requireAccess('speech'))return;const f=state.forms.clone;if(!f.text.trim()||f.text.length>500||!f.voice_id)throw new StudioError('WEB_INVALID_SCRIPT');await submitJob('speech','/speech',f);},
    'generate-music':async()=>{if(!requireAccess('music'))return;const f=state.forms.music;if(!validMusic(f))throw new StudioError('WEB_INVALID_MUSIC');await submitJob('music','/music',{...f,lyrics:f.generation_mode==='instrumental'?'':f.lyrics});},
    'generate-cover':async()=>{if(!requireUser())return;const f=state.forms.cover;if(!state.coverFile||!f.voice_id||Number(f.seconds)<5)throw new StudioError('WEB_INVALID_COVER');if(Number(f.seconds)>Number(state.session.entitlements?.cover_max_seconds||30)){navigate('account');return;}const data=new FormData();data.set('song',state.coverFile);data.set('voice_id',f.voice_id);data.set('seconds',f.seconds);await submitJob('cover','/covers',{...f,file:[state.coverFile.name,state.coverFile.size,state.coverFile.lastModified]},{formData:data});},
    'preview-voice':()=>previewVoice(id),'start-recording':startRecording,
    'preview-upload':async()=>{if(!state.voiceFile)return;const url=URL.createObjectURL(state.voiceFile);if(state.audioObjectURL)URL.revokeObjectURL(state.audioObjectURL);state.audioObjectURL=url;const player=$('#player');player.src=url;$('#player-title').textContent=state.voiceName||state.voiceFile.name;$('#player-detail').textContent=t('Local recording','本地录音');$('#audio-player').hidden=false;document.body.classList.add('has-player');try{await player.play();}catch{}},
    'upload-voice':async()=>{if(!requireUser())return;if(!state.voiceFile||!state.voiceName.trim())throw new StudioError('WEB_INVALID_VOICE');if(!state.voiceConsent)throw new StudioError('WEB_VOICE_CONSENT');const data=new FormData();data.set('file',state.voiceFile);data.set('name',state.voiceName.trim());data.set('consent','true');data.set('language',state.voiceLanguage);const result=await request('/voices',{method:'POST',body:data});const voice=result.voice||result;await refreshData();if(voice.id){state.forms.clone.voice_id=voice.id;state.forms.cover.voice_id=voice.id;}state.voiceFile=null;state.voiceName='';state.voiceConsent=false;closeVoiceDialog();saveLocal();notify(t('Your voice has been saved to your account.','声音已保存到账号。'));},
    'delete-voice':async()=>{if(!confirm(t('Delete this saved voice? Existing creations stay in your library.','删除这个已保存的声音？已生成作品会保留。')))return;await request(`/voices/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshData();if(state.forms.clone.voice_id===id)state.forms.clone.voice_id='';if(state.forms.cover.voice_id===id)state.forms.cover.voice_id='';saveLocal();},
    'save-project':saveProject,'plan-project':()=>planProject(false),'revise-project':()=>planProject(true),'render-project':renderProject,
    'delete-project':async()=>{if(!confirm(t('Delete this project and its working parts?','删除这个项目及其工作片段？')))return;await request(`/projects/${encodeURIComponent(id)}`,{method:'DELETE'});state.currentProject=null;state.projectDirty=false;state.selectedProjectID=null;await refreshData();saveLocal();},
    'preview-segment':()=>playURL(`/projects/${encodeURIComponent(state.currentProject.id)}/segments/${encodeURIComponent(id)}/audio`,state.currentProject.title,t('Project part','项目片段')),
    'play-creation':()=>{const c=state.creations.find(v=>v.id===id);return c?playURL(`/creations/${encodeURIComponent(id)}/audio`,c.title,kindName(c.kind)):null;},
    'download-creation':()=>downloadCreation(id),
    favorite:async()=>{const c=state.creations.find(v=>v.id===id);if(!c)return;await request(`/creations/${encodeURIComponent(id)}`,{method:'PATCH',body:{favorite:!c.favorite}});await refreshData();},
    'rename-creation':async()=>{const c=state.creations.find(v=>v.id===id);const title=prompt(t('Name this creation','为作品命名'),c?.title||'');if(title===null||!title.trim())return;await request(`/creations/${encodeURIComponent(id)}`,{method:'PATCH',body:{title:title.trim()}});await refreshData();},
    'delete-creation':async()=>{if(!confirm(t('Delete this creation from your account? Download a copy first if you want to keep it.','从账号删除这份作品？如需保留，请先下载副本。')))return;await request(`/creations/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshData();},
    'reuse-creation':async()=>{const c=state.creations.find(v=>v.id===id);if(!c?.request)return;const r=c.request;if(r.generation_mode||r.style){for(const key of Object.keys(state.forms.music))if(r[key]!==undefined)state.forms.music[key]=r[key];navigate('music');}else if(r.text){for(const key of Object.keys(state.forms.clone))if(r[key]!==undefined)state.forms.clone[key]=r[key];navigate('clone');}saveLocal();},
    stitch:async()=>{if(!requireUser())return;if(state.selected.length<2)return;await submitJob('stitch','/stitch',{creation_ids:state.selected});},
    'pause-job':async()=>{const job=await request(`/jobs/${encodeURIComponent(id)}/pause`,{method:'POST',body:{}});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job)});saveLocal();},
    'resume-job':async()=>{const job=await request(`/jobs/${encodeURIComponent(id)}/resume`,{method:'POST',body:{}});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job)});pollJob(id);saveLocal();},
    'cancel-job':async()=>{if(!confirm(t('Cancel this task? Finished project parts will be kept.','取消此任务？项目中已完成的片段会保留。')))return;const job=await request(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});state.jobs.set(id,{...state.jobs.get(id),...(job?.job||job),status:job?.status||'cancelled'});await refreshData();saveLocal();},
    refresh:()=>refreshData(),'refresh-session':async()=>{await loadSession();await refreshData();notify(t('Account status refreshed.','账户状态已刷新。'));},
    logout:async()=>{await request('/auth/logout',{method:'POST',body:{}});window.google?.accounts?.id?.disableAutoSelect();clearAccount();navigate('account');},
    checkout:()=>billingRedirect('/billing/checkout',{price_id:id}),'billing-portal':()=>billingRedirect('/billing/portal'),
  };
  if(handlers[action])return run(({ 'generate-music':'music','generate-cover':'cover','plan-project':'project-plan','revise-project':'project-plan','render-project':'project-render','save-project':'project-save','upload-voice':'voice-upload',checkout:'billing','billing-portal':'billing',logout:'auth'}[action]||action),handlers[action]);
});
function moveSelection(id,delta){const at=state.selected.indexOf(id),to=at+delta;if(at<0||to<0||to>=state.selected.length)return;[state.selected[at],state.selected[to]]=[state.selected[to],state.selected[at]];render();}

document.addEventListener('input',event=>{
  const input=event.target;if(input.dataset.voiceName!==undefined){state.voiceName=input.value;return;}
  if(input.dataset.search){state.voiceSearch=input.value;render();return;}
  if(input.dataset.form){const {form,key}=input.dataset;const value=input.type==='checkbox'?input.checked:['speed','pitch','volume','bpm','duration','seed','seconds'].includes(key)?Number(input.value):input.value;state.forms[form][key]=value;const count=$(`[data-counter="${form}.${key}"]`);if(count)count.textContent=`${input.value.length} / ${input.maxLength}`;saveLocal();return;}
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
  if(input.dataset.file==='voice'){state.voiceFile=input.files?.[0]||null;openVoiceDialog();}
  if(input.dataset.voiceConsent!==undefined)state.voiceConsent=input.checked;
  if(input.dataset.voiceLanguage!==undefined)state.voiceLanguage=input.value;
  if(input.dataset.selectCreation){const id=input.dataset.selectCreation;state.selected=input.checked?[...new Set([...state.selected,id])]:state.selected.filter(v=>v!==id);render();}
  if(input.dataset.projectSelect!==undefined)chooseProject(input.value);
  if(input.tagName==='SELECT'&&(input.dataset.key==='voice_id'||input.dataset.role!==undefined))render();
});
$('#player-close').addEventListener('click',stopPlayer);
$('#voice-dialog').addEventListener('cancel',()=>{if(state.recording)stopRecording();});
$('#player').addEventListener('error',()=>notify(t('This audio could not be played. Try downloading it or refresh the item. (WEB_AUDIO_PLAYBACK)','无法播放此音频，请尝试下载，或刷新后重试。（WEB_AUDIO_PLAYBACK）'),true));
window.addEventListener('hashchange',()=>{state.route=routes.includes(location.hash.slice(1))?location.hash.slice(1):'clone';render();window.scrollTo({top:0});});
window.addEventListener('pagehide',()=>{flushLocal();if(state.recording)stopRecording();});
initialize().catch(showError);
