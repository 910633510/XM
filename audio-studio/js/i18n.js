const KEY = 'xsimple-studio-language';
let language = (() => {
  try { const saved = localStorage.getItem(KEY); if (saved === 'en' || saved === 'zh') return saved; } catch {}
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

export const getLanguage = () => language;
export function setLanguage(value) {
  language = value === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(KEY, language); } catch {}
  document.documentElement.lang = language === 'zh' ? 'zh-Hans' : 'en';
}
export const t = (english, chinese) => language === 'zh' ? chinese : english;
export function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
export function durationLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
}
setLanguage(language);
