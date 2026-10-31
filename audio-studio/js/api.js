import { t } from './i18n.js?v=20261030-6';

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
