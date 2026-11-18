import { t } from './i18n.js?v=20261117-2';

export const API_BASE = 'https://api-voiceclone.xmaillc.com/web-studio/api';
let csrfToken = null;
let sessionGeneration = 0;
let authExpired = () => {};
export function setCSRFToken(value) {
  const next = typeof value === 'string' ? value : null;
  if (next !== csrfToken) sessionGeneration++;
  csrfToken = next;
}
export function onAuthExpired(handler) { authExpired = handler; }

export class StudioError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'StudioError'; this.code = String(code || 'WEB_REQUEST_FAILED'); this.status = status; }
}

export function apiURL(path) {
  if (path.startsWith('https://')) {
    const url = new URL(path);
    if (url.origin !== new URL(API_BASE).origin || !url.pathname.startsWith('/web-studio/api/')) throw new StudioError('WEB_UNSAFE_AUDIO_URL');
    return url.href;
  }
  if (path.startsWith('/web-studio/api/')) return new URL(path, API_BASE).href;
  return API_BASE + '/' + path.replace(/^\/?(?:api\/)?/, '');
}

export async function request(path, { method = 'GET', body, signal, blob = false, allowAnonymous = false } = {}) {
  const generation = sessionGeneration;
  const headers = new Headers({ Accept: blob ? 'audio/*,application/octet-stream' : 'application/json' });
  const mutation = !['GET', 'HEAD'].includes(method.toUpperCase());
  if (mutation && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (body !== undefined && !(body instanceof FormData)) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, body instanceof FormData || blob ? 300000 : 45000);
  try {
  let response;
  try { response = await fetch(apiURL(path), { method, headers, body, credentials: 'include', signal: controller.signal, cache: 'no-store' }); }
  catch (error) { if (timedOut) throw new StudioError('WEB_TIMEOUT'); if (error.name === 'AbortError') throw error; throw new StudioError('WEB_CONNECTION'); }
  if (generation !== sessionGeneration && !allowAnonymous) throw new StudioError('WEB_SESSION_CHANGED');
  if (!response.ok) {
    let value = {}; try { value = await response.json(); } catch {}
    const code = value.error_code || value.error?.code || (typeof value.error === 'string' ? value.error : null) || value.code || (typeof value.detail === 'string' ? value.detail : value.detail?.code) || `WEB_HTTP_${response.status}`;
    if (response.status === 401 && !allowAnonymous) authExpired();
    throw new StudioError(code, response.status);
  }
  if (response.status === 204) return null;
  try { return blob ? await response.blob() : await response.json(); }
  catch (error) { if (timedOut) throw new StudioError('WEB_TIMEOUT'); throw error; }
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export function errorMessage(error) {
  const code = String(error?.code || (error?.name === 'NotAllowedError' ? 'WEB_MIC_PERMISSION' : 'WEB_REQUEST_FAILED')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const lower = code.toLowerCase();
  let message;
  if ((error?.status === 401 && !/google|credential|nonce|challenge/.test(lower)) || /unauth|session_expired|session_changed|login_required/.test(lower)) message = t('Your session ended or changed. Sign in again to continue; your account draft is kept in this browser.', '登录已失效或账号已切换，请重新登录后继续；该账号的草稿已保留在此浏览器。');
  else if (/csrf|origin/.test(lower)) message = t('The session could not be verified. Refresh this page and sign in again.', '无法验证当前会话，请刷新页面并重新登录。');
  else if (/subscription_already_active/.test(lower)) message = t('Your web membership is already active. Use Manage subscription to view or change it.', '网页会员已经生效，请通过“管理订阅”查看或修改。');
  else if (/billing_customer_missing/.test(lower)) message = t('This account has no web subscription to manage. If you paid with a different account, sign in to that account.', '当前账号没有可管理的网页订阅；如使用其他账号付款，请切换到付款账号。');
  else if (/billing|checkout/.test(lower)) message = t('The subscription service could not complete this step. Refresh Account or try again later; do not repeat payment if you were already charged.', '订阅服务暂未完成此操作，请刷新账户或稍后重试；如已扣款，请勿重复付款。');
  else if (/membership|entitlement|payment_required|subscription/.test(lower)) message = t('This account does not currently have access to this feature. Check Account for available access or contact support.', '当前账号尚未获得此功能权限，请查看“账户”中的使用权限或联系支持。');
  else if (/google.*config|auth_not_configured/.test(lower)) message = t('Google sign-in is not available yet. Your draft stays in this browser; please try again later.', 'Google 登录尚未就绪。草稿会保留在此浏览器，请稍后重试。');
  else if (/google|credential|nonce|challenge/.test(lower)) message = t('Google sign-in could not be verified. Close the sign-in window and try again.', '无法验证 Google 登录，请关闭登录窗口后重新尝试。');
  else if (/project_job_active/.test(lower)) message = t('A task is using this project. Continue or cancel the task before changing the project.', '当前有任务正在使用此项目，请先继续或取消任务，再修改项目。');
  else if (/asset_in_use/.test(lower)) message = t('A task is using this recording. Finish or cancel that task before deleting it.', '有任务正在使用此录音，请完成或取消任务后再删除。');
  else if (/storage|disk/.test(lower)) message = t('The service cannot safely save more audio right now. Keep your draft and contact support before retrying.', '服务目前无法安全保存更多音频，请保留草稿，联系支持后再试。');
  else if (/version|conflict|stale/.test(lower)) message = t('This project changed elsewhere. Reopen it before saving again; your unsaved draft is still shown here.', '项目已在其他位置更新。当前未保存内容仍显示在此，请重新打开项目后再保存。');
  else if (/speech_text_empty/.test(lower)) message = t('Write the script you want this voice to read.', '请先填写要朗读的文稿。');
  else if (/speech_text_too_long/.test(lower)) message = t('A voiceover can be up to 500 characters. Shorten the script or split it into parts.', '每段配音最多 500 字，请缩短文稿或分段生成。');
  else if (/voice_required/.test(lower)) message = t('Choose a voice before generating.', '请先选择音色再生成。');
  else if (/video_too_long/.test(lower)) message = t('This video is longer than the 10-minute dubbing limit. Trim it and upload the part you need.', '视频超过配音的 10 分钟上限，请剪短后上传需要的部分。');
  else if (/video_too_large/.test(lower)) message = t('This video is larger than 300 MB. Export a smaller file and try again.', '视频超过 300 MB，请导出较小的文件后重试。');
  else if (/video_audio_missing|dub_no_speech/.test(lower)) message = t('No speech was found in this video. Dubbing needs a soundtrack with clear spoken words.', '视频中没有检测到人声。配音需要包含清晰讲话的音轨。');
  else if (/dub_too_many_segments/.test(lower)) message = t('This video has too many spoken lines for one dubbing task. Split it into shorter parts.', '这段视频的台词太多，请拆成更短的片段分别配音。');
  else if (/video_consent/.test(lower)) message = t('Confirm that you have the rights to this video before starting the dub.', '开始配音前，请先确认你拥有此视频的使用权利。');
  else if (/invalid_dub/.test(lower)) message = t('Choose a video, a voice and a target language before starting the dub.', '请先选择视频、音色和配音语言。');
  else if (/invalid_vlog_style/.test(lower)) message = t('Describe the style you want, or pick one of the presets.', '请描述你想要的风格，或选择一个预设。');
  else if (/invalid_vlog/.test(lower)) message = t('Choose a video file before writing the narration.', '请先选择视频文件，再开始写旁白。');
  else if (/invalid_script|vlog_script_empty/.test(lower)) message = t('The script needs at least one line with text and a sensible time window.', '脚本至少需要一句有文字、时间合理的台词。');
  else if (/vlog_no_room/.test(lower)) message = t('People are talking through almost all of this video, so there is no room for a voice-over. Try footage with quieter stretches.', '这段视频几乎全程都有人说话，没有地方放旁白。可以换一段有空隙的素材。');
  else if (/vlog_script_ungrounded/.test(lower)) message = t('None of the narration could be matched to what the footage shows, so nothing was voiced. Add a brief that explains the video, or pick its type, and write it again.', '没有一句旁白能和画面内容对上，所以没有配音。请补充一句视频说明或手动指定类型后重新生成。');
  else if (/vlog_script_required/.test(lower)) message = t('Write the script first, then create the video.', '请先生成脚本，再生成视频。');
  else if (/vlog_script_changed|script_version/.test(lower)) message = t('This script changed elsewhere. Reopen the vlog and try again.', '脚本已在其他位置更新，请重新打开这条 vlog 后再试。');
  else if (/vlog_job_active/.test(lower)) message = t('A task is working on this vlog. Wait for it or cancel it before editing the script.', '当前有任务正在处理这条 vlog，请等待完成或取消后再修改脚本。');
  else if (/vlog_frames|vlog_no_frames/.test(lower)) message = t('The footage could not be sampled. Try a shorter or re-exported video.', '无法从素材中截取画面，请尝试更短或重新导出的视频。');
  else if (/vlog_writer_not_configured|vlog_writer_auth|narrator_not_configured|narrator_auth/.test(lower)) message = t('AI narration is not available on the service right now. Your footage is kept; try later or contact support.', 'AI 旁白服务当前不可用，素材已保留，请稍后重试或联系支持。');
  else if (/vlog_writer|vlog_script_invalid/.test(lower)) message = t('The script could not be written this time. Use Continue on the task or write it again.', '这次没能写出脚本，可在任务中点击“继续”或重新生成。');
  else if (/narrator/.test(lower)) message = t('The narrator voice did not finish. Use Continue on the task to retry without re-voicing finished lines.', '旁白配音未完成，可在任务中点击“继续”重试，已完成的句子不会重做。');
  else if (/video_format|video_invalid|video_required|video_encode|dub_alignment/.test(lower)) message = t('This video could not be processed. Use an MP4, MOV, WebM or MKV file with sound and try again.', '无法处理该视频，请使用含声音的 MP4、MOV、WebM 或 MKV 文件后重试。');
  else if (/transcription_unavailable/.test(lower)) message = t('Speech recognition is not available on the service right now. Keep your video and try again later or contact support.', '语音识别服务当前不可用，请保留视频，稍后重试或联系支持。');
  else if (/transcription/.test(lower)) message = t('The speech in this video could not be recognized. Try a clearer recording or a shorter clip.', '无法识别视频中的语音，请尝试更清晰的录音或更短的片段。');
  else if (/translation_not_configured|translation_auth/.test(lower)) message = t('Translation is not available on the service right now. Choose the same language to re-voice without translating, or try later.', '翻译服务当前不可用。可选择与原语言相同的配音语言仅换声，或稍后重试。');
  else if (/translation/.test(lower)) message = t('Translation did not complete. Use Continue on the task to retry without re-processing the video.', '翻译未完成。可在任务中点击“继续”重试，无需重新处理视频。');
  else if (/mic_permission/.test(lower)) message = t('Microphone access was declined. Allow it in browser settings or upload an audio file instead.', '麦克风权限被拒绝。请在浏览器设置中允许录音，或改为上传音频文件。');
  else if (/mic_unsupported/.test(lower)) message = t('This browser cannot record audio. Upload a recording or open this page in a current browser.', '此浏览器无法录音，请上传已有录音，或使用较新的浏览器打开此页面。');
  else if (/connection|network|timeout|upstream_unavailable/.test(lower)) message = t('The connection was interrupted. Check your connection and retry; a submitted task may still be running.', '连接中断，请检查网络后重试；已提交的任务可能仍在运行。');
  else if (/not_configured|configuration/.test(lower)) message = t('The creation service is not ready. Your draft is saved; please try later or contact support.', '创作服务尚未就绪。草稿已保留，请稍后重试或联系支持。');
  else if (/capacity|quota|rate_limit|queue_full/.test(lower) || error?.status === 429) message = t('The service is busy or its available allowance has been reached. Keep your draft and try again later.', '服务繁忙或可用额度不足。请保留草稿，稍后重试。');
  else if (/voice.*unavailable|voice.*not_found/.test(lower)) message = t('This voice is no longer available. Choose another voice and try again.', '此音色已不可用，请选择其他音色后重试。');
  else if (/audio|decode|format|file_type|file_invalid/.test(lower)) message = t('The audio file could not be read. Try a WAV, MP3 or M4A recording and submit it again.', '无法读取该音频文件，请换用 WAV、MP3 或 M4A 录音后重试。');
  else if (/too_large|file_size/.test(lower) || error?.status === 413) message = t('This file or request is too large. Use a shorter recording or a smaller request.', '文件或请求过大，请使用较短录音，或缩短创作要求。');
  else if (/consent|authorization/.test(lower)) message = t('Confirm that you have permission to use this voice before uploading it.', '上传前请确认你有权使用这个声音。');
  else if (/invalid|validation/.test(lower) || error?.status === 422) message = t('Some fields could not be used. Check the text, selected voice and settings, then try again.', '部分输入无法使用，请检查文稿、所选音色和参数后重试。');
  else if (/not_found/.test(lower) || error?.status === 404) message = t('This item or task is no longer available. Refresh your workspace and try again.', '此项目或任务已不可用，请刷新工作台后重试。');
  else message = t('The action could not finish. Your draft is kept; try again or contact support.', '操作未完成，草稿已保留。请重试或联系支持。');
  return `${message} (${code || 'WEB_REQUEST_FAILED'})`;
}
