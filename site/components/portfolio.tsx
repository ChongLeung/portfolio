'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, ArrowRight, Leaf, Map, Layout, SlidersHorizontal, Search, X, Sun, Moon, Command, Check, Download, Volume2, Bell, History, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button, MaterialRuntime, Md } from './material';
import { SearchField } from './search-field';
import { defaults, historyKey, parseUniqueJson, projects, recoverHistory, settingsKey, validatePreferences, validateSettings, validateVocabulary, vocabularyKey, type Settings, type Revision, type Notice } from '../lib/model';
import provenance from '../lib/provenance.json';

const tabs = [['portfolio', 'Portfolio', '作品集'], ['settings', 'Settings', '設定'], ['history', 'History', '歷程'], ['help', 'About this demo', '關於示範']] as const;
const intro = ['Alex Harbour is a fictional creative developer exploring useful tools, playful interactions, and quieter ways to navigate the web. This demonstration portfolio brings together three imagined projects.', 'Alex Harbour 是虛構的創意開發者，探索實用工具、有趣互動，以及更平靜的網頁體驗。本示範作品集集合三個想像中的專案。'];

function download(name: string, content: string, type = 'application/json') {
 const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
 const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Illustration({ kind }: { kind: string }) {
 return <div className={`project-art art-${kind}`} role="img" aria-label={`${kind === 'garden' ? 'Abstract leaves and sunlight' : kind === 'city' ? 'Abstract map with a winding path' : 'Abstract stacked shapes and a circle'}. Static illustration.`}>
  {kind === 'garden' ? <svg viewBox="0 0 480 280" aria-hidden="true"><circle cx="349" cy="63" r="47" fill="#efcd7d"/><path d="M227 241C211 174 224 104 281 39" fill="none" stroke="#305d42" strokeWidth="3"/><path d="M239 158C141 169 116 118 121 87C181 75 230 103 239 158Z" fill="#71977b"/><path d="M250 128C247 66 290 42 331 41C333 94 302 129 250 128Z" fill="#315f49"/><path d="M223 214C160 219 135 184 131 157C185 149 220 174 223 214Z" fill="#b2bea0"/><path d="M231 181C252 133 295 131 325 147C309 185 275 200 231 181Z" fill="#547f60"/><ellipse cx="235" cy="253" rx="100" ry="6" fill="#cad1ba"/></svg> : kind === 'city' ? <svg viewBox="0 0 480 280" aria-hidden="true"><g fill="#c7b9a9"><rect x="51" y="45" width="90" height="68" rx="12"/><rect x="166" y="25" width="102" height="88" rx="12"/><rect x="292" y="42" width="130" height="71" rx="12"/><rect x="66" y="139" width="126" height="94" rx="12"/><rect x="214" y="139" width="90" height="113" rx="12"/><rect x="330" y="139" width="88" height="65" rx="12"/></g><path d="M38 129H323Q356 129 356 99V30" fill="none" stroke="#fbf6ee" strokeWidth="10"/><path d="M108 269V137Q108 127 123 127H256Q279 127 279 99V18" fill="none" stroke="#986a50" strokeWidth="3" strokeDasharray="6 7"/><circle cx="279" cy="70" r="20" fill="#a96044"/><circle cx="279" cy="70" r="6" fill="#fff8ef"/></svg> : <svg viewBox="0 0 480 280" aria-hidden="true"><rect x="100" y="56" width="247" height="176" rx="16" fill="#b5b5d1" transform="rotate(-9 220 140)"/><rect x="135" y="48" width="247" height="176" rx="16" fill="#efedf5" transform="rotate(5 255 140)"/><path d="M172 92H271M172 113H305M172 134H248" stroke="#b7b4c7" strokeWidth="7" strokeLinecap="round"/><circle cx="345" cy="204" r="39" fill="#6d698d"/><path d="M332 204l9 9 19-21" fill="none" stroke="#f3f0f8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
 </div>;
}

export default function Portfolio() {
 const [settings, setSettings] = useState<Settings>(defaults);
 const [ready, setReady] = useState(false);
 const [tab, setTab] = useState('portfolio');
 const [expanded, setExpanded] = useState<string[]>([]);
 const [history, setHistory] = useState<Revision[]>([]);
 const [notices, setNotices] = useState<Notice[]>([]);
 const [notificationOpen, setNotificationOpen] = useState(false);
 const [query, setQuery] = useState('');
 const [projectMatches, setProjectMatches] = useState(projects.map(p => p.id));
 const [historyMatches, setHistoryMatches] = useState<string[]>([]);
 const [palette, setPalette] = useState(false);
 const [paletteQuery, setPaletteQuery] = useState('');
 const [vocabulary, setVocabulary] = useState<Record<string, string>>({});
 const [vocabularyLoaded, setVocabularyLoaded] = useState(false);
 const [toast, setToast] = useState('');
 const [restore, setRestore] = useState<Settings | null>(null);
 const [confirmA, setConfirmA] = useState(false);
 const [confirmB, setConfirmB] = useState(false);
 const [confirmProgress, setConfirmProgress] = useState(0);
 const [elapsed, setElapsed] = useState(0);
 const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const paletteRef = useRef<HTMLDialogElement>(null);
 const confirmRef = useRef<HTMLDialogElement>(null);
 const lastFocus = useRef<HTMLElement | null>(null);
 const notify = useCallback((message: string) => {
  setToast(message); setNotices(items => [{ id: crypto.randomUUID(), at: new Date().toISOString(), message }, ...items].slice(0, 100));
  if (toastTimer.current) clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => setToast(''), 5000);
 }, []);
 const t = (en: string, yue = en) => {
  const raw = settings.language === 'both' ? `${en} · ${yue}` : settings.language === 'yue' ? yue : en;
  return vocabulary[raw] ?? raw;
 };
 useEffect(() => {
  try {
   const saved = localStorage.getItem(settingsKey); if (saved) setSettings(validateSettings(parseUniqueJson(saved)));
   const storedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
   const recovered = recoverHistory(storedHistory); setHistory(recovered.entries); if (recovered.skipped) notify('Some history entries were invalid. Valid entries remain available.');
  } catch { notify('Stored preferences could not be read. Defaults are active; the original storage has been retained.'); }
  try { const cache = localStorage.getItem(vocabularyKey); if (cache) { setVocabulary(validateVocabulary(cache)); setVocabularyLoaded(true); } } catch { notify('The private wording cache is invalid. Original wording is active.'); }
  setReady(true);
  const start = Date.now(); const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 60000)), 30000);
  return () => { clearInterval(timer); if (toastTimer.current) clearTimeout(toastTimer.current); };
 }, [notify]);
 useEffect(() => {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.density = settings.density;
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'normal';
  document.documentElement.lang = settings.language === 'yue' ? 'yue-Hant' : 'en';
  document.documentElement.style.fontSize = `${settings.textScale}%`;
 }, [settings]);
 useEffect(() => {
  const handler = (event: KeyboardEvent) => {
   if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); lastFocus.current = document.activeElement as HTMLElement; setPalette(open => !open); }
  }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
 }, []);
 useEffect(() => { if (palette) paletteRef.current?.showModal(); else if (paletteRef.current?.open) { paletteRef.current.close(); lastFocus.current?.focus(); } }, [palette]);
 useEffect(() => { if (restore) confirmRef.current?.showModal(); else confirmRef.current?.close(); }, [restore]);
 const apply = (next: Settings, action: string) => {
  try {
   const valid = validateSettings(next); if (JSON.stringify(valid) === JSON.stringify(settings)) return true;
   const revisions = [{ id: crypto.randomUUID(), at: new Date().toISOString(), action, settings: valid }, ...history].slice(0, 200);
   localStorage.setItem(settingsKey, JSON.stringify(valid)); setSettings(valid);
   try { localStorage.setItem(historyKey, JSON.stringify(revisions)); setHistory(revisions); } catch { notify(t('Preferences saved, but history storage is full.', '設定已儲存，但歷程儲存空間已滿。')); }
  return true;
  } catch { notify(t('Preferences could not be saved. Your previous settings remain active.', '無法儲存設定，現有設定保持不變。')); return false; }
 };
 const change = (key: keyof Settings, value: unknown) => apply({ ...settings, [key]: value }, `Changed ${key}`);
 const navigate = (id: string) => { setTab(id); setQuery(''); setPalette(false); requestAnimationFrame(() => document.getElementById('page-heading')?.focus()); };
 const requestRestore = (next: Settings) => { setConfirmA(false); setConfirmB(false); setConfirmProgress(0); lastFocus.current = document.activeElement as HTMLElement; setRestore(next); };
 const cancelRestore = () => { setRestore(null); lastFocus.current?.focus(); };
 const readAloud = () => {
  if (!('speechSynthesis' in window)) { notify(t('This browser has no speech service.', '這個瀏覽器未提供語音服務。')); return; }
  speechSynthesis.cancel(); const language = settings.narrationLanguage;
  for (const lang of language === 'both' ? ['en', 'yue'] : [language]) {
   const utterance = new SpeechSynthesisUtterance(intro[lang === 'yue' ? 1 : 0]);
   utterance.lang = lang === 'yue' ? 'zh-HK' : 'en-GB'; utterance.rate = settings.rate; utterance.pitch = settings.pitch;
   speechSynthesis.speak(utterance);
  }
 };
 const exportPreferences = () => { download('harbour-preferences.json', JSON.stringify({ schemaVersion: 1, settings, omission: 'Private vocabulary and file metadata are omitted.' }, null, 2)); notify(t('Preferences exported. Private wording is omitted.', '設定已匯出，私人用語不會包含在內。')); };
 const visibleProjects = projects.filter(project => projectMatches.includes(project.id));
 const heading = tabs.find(item => item[0] === tab);

 return <div className={`app ${settings.lowStimulation ? 'low-stimulation' : ''} ${settings.focus ? 'focus-mode' : ''}`}>
  <MaterialRuntime />
  <a className="skip-link" href="#main">{t('Skip to content', '跳至內容')}</a>
  <header className="site-header">
   <Button variant="text" className="brand" onClick={() => navigate('portfolio')} aria-label={t('Alex Harbour, home', 'Alex Harbour，首頁')}><span className="monogram" aria-hidden="true">ah<span>·</span></span><span>Alex Harbour</span></Button>
   <nav className="header-nav" aria-label={t('Main navigation', '主導覽')}>
    <Button variant="text" onClick={() => { navigate('portfolio'); setTimeout(() => document.getElementById('projects')?.scrollIntoView({ behavior: 'instant' }), 0); }}>{t('Selected work', '精選作品')}</Button>
    <Button variant="text" onClick={() => navigate('help')}>{t('About', '關於')}</Button>
   </nav>
   <div className="header-actions">
    <Button variant="text" aria-label={t('Command palette', '指令搜尋')} title="Ctrl+Shift+F" onClick={() => { lastFocus.current = document.activeElement as HTMLElement; setPalette(true); }}><Search size={19} aria-hidden="true" /></Button>
    <Button variant="text" aria-label={t('Settings', '設定')} onClick={() => navigate('settings')}><SlidersHorizontal size={19} aria-hidden="true" /></Button>
    <Button variant="outlined" href="https://github.com/ChongLeung" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={17} aria-hidden="true" /></Button>
   </div>
  </header>
  <div className="build-line"><span>{t('Fictional portfolio / demonstration content', '虛構作品集／示範內容')}</span><span>v{provenance.version} <span aria-hidden="true">·</span> {provenance.builtAt ? t('Updated', '更新') + ' ' + new Date(provenance.builtAt).toLocaleString(undefined, { timeZoneName: 'short', second: '2-digit', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('Build date unavailable', '建置日期未提供')}</span></div>

  <main id="main">
   {tab === 'portfolio' ? <>
    <section className="hero" aria-labelledby="page-heading">
     <div className="hero-copy"><p className="eyebrow"><span className="small-line" />{t('A fictional creative practice', '虛構創意練習')}</p>
      <h1 id="page-heading" tabIndex={-1}>{settings.language === 'yue' ? <>細心設計，<br />讓好奇心<br /><em>帶路。</em></> : <>Thoughtful digital<br />experiences, built<br />with <em>curiosity.</em></>}</h1>
      {settings.language === 'both' && <p className="bilingual-headline">細心設計，讓好奇心帶路。</p>}
      <p className="hero-description">{t(intro[0], intro[1])}</p>
      <div className="hero-actions"><Button variant="filled" onClick={() => document.getElementById('projects')?.scrollIntoView({ behavior: settings.reducedMotion ? 'instant' : 'smooth' })}>{t('Explore the concepts', '探索設計概念')}<ArrowDown size={17} aria-hidden="true" /></Button><span>{t('Three ideas. Room to explore.', '三個概念，慢慢探索。')}</span></div>
     </div>
     <div className="hero-art" role="img" aria-label={t('Static abstract illustration: overlapping arches, a circle, and a small leaf.', '靜態抽象插圖：重疊的拱形、圓形與一片小葉。')}>
      <svg viewBox="0 0 430 470" aria-hidden="true"><defs><pattern id="grid" width="27" height="27" patternUnits="userSpaceOnUse"><path d="M27 0H0V27" fill="none" stroke="#627970" strokeWidth=".4" opacity=".25"/></pattern></defs><rect x="0" y="0" width="430" height="470" fill="url(#grid)"/><circle cx="335" cy="103" r="65" fill="#e8b971"/><path d="M58 399V201a115 115 0 01230 0v198z" fill="#bdccc1"/><path d="M148 399V251a94 94 0 01188 0v148z" fill="#376c5d"/><path d="M216 399V302a60 60 0 01120 0v97z" fill="#e2e5d4"/><path d="M179 87c15-35 42-42 63-32-6 30-25 45-63 32z" fill="#477862"/><path d="M172 108l34-45" stroke="#477862" strokeWidth="2"/><path d="M33 401h367" stroke="#69887a" strokeWidth="1"/><circle cx="88" cy="75" r="4" fill="#376c5d"/><path d="M362 330v30m-15-15h30" stroke="#b07b53" strokeWidth="2"/></svg>
      <div className="art-caption"><span>FORM / FUNCTION / FEELING</span><span>01 — 03</span></div>
     </div>
    </section>
    <section className="work-section" id="projects" aria-labelledby="work-heading">
     <div className="section-top"><div><p className="eyebrow">{t('Selected explorations', '精選探索')}</p><h2 id="work-heading">{t('Small ideas, considered carefully.', '小概念，用心想。')}</h2></div><span className="section-note">{t('03 fictional concepts', '03 個虛構概念')}</span></div>
     <div className="work-search"><SearchField id="concept-search" label={t('Find a concept', '搜尋概念')} records={projects.map(project => ({ id: project.id, text: [project.name, ...project.category, ...project.short, ...project.description, ...project.detail, ...project.detailYue].join(' ') }))} onResults={setProjectMatches} t={t} /></div>
     <div className={`project-grid ${settings.oneThing ? 'one-thing' : ''}`}>
      {visibleProjects.map((project, index) => <article className={`project-card ${expanded.includes(project.id) ? 'expanded' : ''}`} key={project.id}>
       <Illustration kind={project.id} />
       <div className="project-copy"><div className="project-meta"><span>{t(project.category[0], project.category[1])}</span><span>0{index + 1}</span></div><h3>{project.name}</h3><p className="project-short">{t(project.short[0], project.short[1])}</p><p className="project-description">{t(project.description[0], project.description[1])}</p>
        <div className="project-bottom"><span className="concept-label">{t('Fictional concept', '虛構概念')}</span><Button variant="text" aria-expanded={expanded.includes(project.id)} aria-controls={`${project.id}-details`} aria-label={t(`${expanded.includes(project.id) ? 'Close' : 'Read'} ${project.name} concept`, `${expanded.includes(project.id) ? '收起' : '閱讀'} ${project.name} 概念`)} onClick={() => setExpanded(items => items.includes(project.id) ? items.filter(id => id !== project.id) : settings.oneThing ? [project.id] : [...items, project.id])}>{expanded.includes(project.id) ? <X size={20} /> : <ArrowUpRight size={20} />}</Button></div>
        <div id={`${project.id}-details`} hidden={!expanded.includes(project.id)} className="project-details"><h4>{t('The idea', '概念')}</h4><p>{t(project.detail[0], project.detailYue[0])}</p><h4>{t('The approach', '方向')}</h4><p>{t(project.detail[1], project.detailYue[1])}</p></div>
       </div>
      </article>)}
     </div>
     {!visibleProjects.length && <p className="empty-state">{t('No concepts match. Try another phrase.', '未有符合的概念，請試試其他字句。')}</p>}
    </section>
    {!settings.focus && <section className="closing-note"><span className="note-mark" aria-hidden="true">✳</span><div><h2>{t('Useful can be beautiful.', '實用，也可以好看。')}</h2><p>{t('These imagined projects share a simple thread: make the next step a little clearer, and the experience a little more human.', '這些想像中的專案有同一個方向：讓下一步更清楚，讓體驗更貼近人。')}</p></div><Button variant="outlined" onClick={() => navigate('help')}>{t('About this demonstration', '關於本示範')}<ArrowRight size={18} /></Button></section>}
   </> : <section className="utility-page"><p className="eyebrow">{t('Your space', '你的空間')}</p><h1 id="page-heading" tabIndex={-1}>{heading ? t(heading[1], heading[2]) : tab}</h1>
    <div className="utility-tabs" role="navigation" aria-label={t('Portfolio tools', '作品集工具')}>{tabs.map(item => <Button key={item[0]} variant={tab === item[0] ? 'filled' : 'text'} aria-current={tab === item[0] ? 'page' : undefined} onClick={() => navigate(item[0])}>{t(item[1], item[2])}</Button>)}</div>
    {tab === 'settings' && <>
     <p className="page-intro">{t('Make this visit your own. Preferences stay in this browser.', '讓這次瀏覽更合心意。設定只儲存在這個瀏覽器。')}</p>
     <div className="settings-grid">
      <section className="settings-card"><h2>{t('Language & tone', '語言與語氣')}</h2><div className="segmented">{[['en', 'English'], ['yue', '廣東話'], ['both', 'English + 廣東話']].map(([value, label]) => <Button key={value} variant={settings.language === value ? 'filled' : 'outlined'} aria-pressed={settings.language === value} onClick={() => change('language', value)}>{label}</Button>)}</div>
       {(['englishHumour', 'cantoneseHumour'] as const).map((key, index) => <label className="setting-row" key={key}><span>{t(index ? 'Cantonese playfulness' : 'English playfulness', index ? '廣東話趣味程度' : '英文趣味程度')}<small>{settings[key]} / 5</small></span><Md tag="md-slider" min="1" max="5" step="1" value={settings[key]} labeled ticks aria-label={index ? 'Cantonese playfulness' : 'English playfulness'} onInput={(e: Event) => change(key, Number((e.target as HTMLInputElement).value))} /></label>)}
       <label className="setting-row"><span>{t('Emojis in messages', '訊息表情符號')}</span><Md tag="md-switch" selected={settings.emojis} aria-label={t('Emojis in messages', '訊息表情符號')} onChange={(e: Event) => change('emojis', (e.target as HTMLInputElement & { selected: boolean }).selected)} /></label>
       <p className="setting-preview">{t(settings.englishHumour > 3 ? 'A little personality, without turning every sentence into a circus.' : 'Clear language, with a light touch.', settings.cantoneseHumour > 3 ? '有點趣味就好，每句都開鑼會很忙。' : '清楚直接，帶一點輕鬆。')}</p>
      </section>
      <section className="settings-card"><h2>{t('Appearance', '外觀')}</h2><div className="segmented"><Button variant={settings.theme === 'light' ? 'filled' : 'outlined'} onClick={() => change('theme', 'light')}><Sun size={16} />{t('Light', '淺色')}</Button><Button variant={settings.theme === 'dark' ? 'filled' : 'outlined'} onClick={() => change('theme', 'dark')}><Moon size={16} />{t('Dark', '深色')}</Button></div>
       <label className="setting-row"><span>{t('Text size', '字體大小')}<small>{settings.textScale}%</small></span><Md tag="md-slider" min="85" max="160" step="5" value={settings.textScale} labeled aria-label={t('Text size', '字體大小')} onInput={(e: Event) => change('textScale', Number((e.target as HTMLInputElement).value))} /></label>
       <label className="setting-row"><span>{t('Compact spacing', '緊密間距')}</span><Md tag="md-switch" selected={settings.density === 'compact'} aria-label={t('Compact spacing', '緊密間距')} onChange={(e: Event) => change('density', (e.target as HTMLInputElement & { selected: boolean }).selected ? 'compact' : 'comfortable')} /></label>
       <label className="setting-row"><span>{t('Reduce motion', '減少動態效果')}</span><Md tag="md-switch" selected={settings.reducedMotion} aria-label={t('Reduce motion', '減少動態效果')} onChange={(e: Event) => change('reducedMotion', (e.target as HTMLInputElement & { selected: boolean }).selected)} /></label>
      </section>
      <section className="settings-card"><h2>{t('Attention & comfort', '專注與舒適')}</h2>{([
       ['focus', 'Focus', '專注', 'Hide the closing note while keeping navigation available.', '收起結語，保留導覽。'],
       ['lowStimulation', 'Low stimulation', '低刺激', 'Use quieter artwork and fewer visual accents.', '降低插圖與裝飾的視覺刺激。'],
       ['timeAwareness', 'Time awareness', '時間提示', 'Show elapsed visit time without alerts.', '顯示瀏覽時間，不發出提示聲。'],
       ['oneThing', 'One thing at a time', '逐件處理', 'Use a single-column view and open one concept at a time.', '使用單欄畫面，每次打開一個概念。'],
       ['momentum', 'Momentum', '保持步伐', 'Keep a gentle next-step link in the footer.', '在頁尾保留下一步連結。'],
      ] as const).map(([key, en, yue, detail, detailYue]) => <label className="setting-row" key={key}><span>{t(en, yue)}<small>{t(detail, detailYue)}</small></span><Md tag="md-switch" selected={settings[key]} aria-label={t(en, yue)} onChange={(e: Event) => change(key, (e.target as HTMLInputElement & { selected: boolean }).selected)} /></label>)}</section>
      <section className="settings-card"><h2>{t('Read aloud', '朗讀')}</h2><p>{t('Use this browser’s installed speech service. Playback starts only when you choose it.', '使用瀏覽器的語音服務，只有按下朗讀才開始。')}</p><label className="setting-row"><span>{t('Enable narration controls', '啟用朗讀控制')}</span><Md tag="md-switch" selected={settings.narrator} aria-label={t('Enable narration controls', '啟用朗讀控制')} onChange={(e: Event) => { const selected = (e.target as HTMLInputElement & { selected: boolean }).selected; change('narrator', selected); if (!selected && 'speechSynthesis' in window) speechSynthesis.cancel(); }} /></label>
       {settings.narrator && <><div className="segmented">{[['en', 'English'], ['yue', '廣東話'], ['both', 'Both / 兩者']].map(([value, label]) => <Button key={value} variant={settings.narrationLanguage === value ? 'filled' : 'outlined'} onClick={() => change('narrationLanguage', value)}>{label}</Button>)}</div>{(['rate', 'pitch'] as const).map(key => <label className="setting-row" key={key}><span>{t(key === 'rate' ? 'Speed' : 'Pitch', key === 'rate' ? '速度' : '音調')}<small>{settings[key]}</small></span><Md tag="md-slider" min={key === 'rate' ? '.5' : '0'} max="2" step=".1" value={settings[key]} aria-label={key} onInput={(e: Event) => change(key, Number((e.target as HTMLInputElement).value))} /></label>)}<Button onClick={readAloud}><Volume2 size={16} />{t('Read introduction', '朗讀簡介')}</Button><Button variant="text" onClick={() => { if ('speechSynthesis' in window) speechSynthesis.cancel(); }}>{t('Stop', '停止')}</Button></>}
      </section>
      <section className="settings-card"><h2>{t('Personal wording', '個人用語')}</h2><p>{t('Load your own versioned JSON. Processing and storage stay local. Private wording is excluded from exports and history.', '載入你自己的版本化 JSON。處理及儲存只在本機進行，匯出與歷程不包含私人用語。')}</p><label className="file-control"><span>{t(vocabularyLoaded ? 'Replace vocabulary JSON' : 'Upload vocabulary JSON', vocabularyLoaded ? '更換用語 JSON' : '上載用語 JSON')}</span><input type="file" accept="application/json,.json" aria-label={t('Upload vocabulary JSON', '上載用語 JSON')} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 1048576) throw new Error(); const text = await file.text(); const entries = validateVocabulary(text); localStorage.setItem(vocabularyKey, JSON.stringify({ schemaVersion: 1, entries })); setVocabulary(entries); setVocabularyLoaded(true); notify('Personal wording loaded locally.'); } catch { notify('Invalid vocabulary file or unavailable storage. Previous wording is unchanged.'); } }} /></label><p role="status">{t(vocabularyLoaded ? 'A validated local file is active.' : 'No file loaded. Original wording is active.', vocabularyLoaded ? '已啟用通過驗證的本機檔案。' : '未載入檔案，正使用原有用語。')}</p>{vocabularyLoaded && <Button variant="outlined" onClick={() => { try { localStorage.removeItem(vocabularyKey); setVocabulary({}); setVocabularyLoaded(false); notify('Private wording cleared. Original wording restored.'); } catch { notify('The local cache could not be cleared.'); } }}>{t('Clear private wording', '清除私人用語')}</Button>}</section>
      <section className="settings-card"><h2>{t('Your data', '你的資料')}</h2><p>{t('Export preferences or restore a validated file. Private wording is always separate.', '匯出設定或還原已驗證檔案。私人用語一律分開處理。')}</p><Button onClick={exportPreferences}><Download size={16} />{t('Export preferences', '匯出設定')}</Button><label className="file-control"><span>{t('Import preferences', '匯入設定')}</span><input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 1048576) throw new Error(); requestRestore(validatePreferences(await file.text())); } catch { notify(t('Invalid settings file. Nothing changed.', '設定檔案無效，沒有改動。')); } }} /></label><Button variant="outlined" onClick={() => requestRestore(defaults)}><RotateCcw size={16} />{t('Reset preferences', '重設設定')}</Button></section>
     </div>
    </>}
    {tab === 'history' && <><p className="page-intro">{t('Recent preference changes in this browser. Restoring creates a new entry. Private wording is never recorded.', '這個瀏覽器最近的設定改動。還原會新增紀錄，私人用語不會被記錄。')}</p><SearchField id="history-search" label={t('Search history', '搜尋歷程')} records={history.map(item => ({ id: item.id, text: item.action + ' ' + item.at }))} onResults={setHistoryMatches} t={t} /><div className="history-list">{history.filter(item => historyMatches.includes(item.id)).map(item => <article className="history-row" key={item.id}><History size={20} aria-hidden="true" /><div><h3>{item.action}</h3><time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></div><Button variant="outlined" onClick={() => requestRestore(item.settings)}>{t('Restore', '還原')}</Button></article>)}</div>{!historyMatches.length && <p className="empty-state">{history.length ? t('No history entries match this search.', '未有符合搜尋的歷程紀錄。') : t('No preference changes yet.', '暫時未有設定改動。')}</p>}</>}
    {tab === 'help' && <div className="help-content"><section className="settings-card"><ShieldCheck size={32} aria-hidden="true" /><h2>{t('An honest demonstration', '如實展示')}</h2><p>{t('Alex Harbour is a fictional persona. Pocket Garden, City Notes, and Quiet Desk are imagined design concepts. They are not live products, client engagements, or evidence of professional experience.', 'Alex Harbour 是虛構人物。Pocket Garden、City Notes 及 Quiet Desk 均為想像中的設計概念，並非已推出產品、客戶委託或工作經驗證明。')}</p><p>{t('The GitHub link opens the real owner profile. No contact details, testimonials, or credentials have been invented.', 'GitHub 連結通往真正的擁有人帳戶，沒有虛構聯絡資料、推薦或資歷。')}</p></section><section className="settings-card"><h2>{t('Local preferences, clear boundaries', '本機設定，界線清楚')}</h2><p>{t('Settings and recent settings history are stored in this browser. Clearing browser data resets them. Personal vocabulary has a separate private cache and is omitted from ordinary exports and history. No analytics or contact form is included.', '設定及最近歷程儲存在這個瀏覽器，清除瀏覽器資料會將它們重設。個人用語使用獨立私人快取，不會包含在一般匯出與歷程中。這裏沒有追蹤分析或聯絡表格。')}</p><p>{t('Use Ctrl+Shift+F to open the command palette. Escape closes a dialog. Every concept can be opened by keyboard.', '按 Ctrl+Shift+F 開啟指令搜尋。Escape 可關閉對話框，每個概念都能以鍵盤開啟。')}</p></section></div>}
   </section>}
  </main>
  <footer className="site-footer"><div><span className="footer-brand">Alex Harbour<span>·</span></span><p>{t('An imagined practice. A real curiosity.', '想像中的創作，真實的好奇心。')}</p></div><div className="footer-links"><Button variant="text" onClick={() => navigate('settings')}>{t('Preferences', '偏好設定')}</Button><Button variant="text" onClick={() => { setNotificationOpen(open => !open); }} aria-expanded={notificationOpen}><Bell size={16} />{t('Notifications', '通知')}</Button><Button variant="text" onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })}>{t('Back to top', '返回頁首')}<ArrowUpRight size={16} /></Button></div>{settings.timeAwareness && <p className="visit-timer">{t(`${elapsed} minutes in this visit`, `本次瀏覽 ${elapsed} 分鐘`)}</p>}{settings.momentum && <Button variant="outlined" onClick={() => { navigate('portfolio'); setExpanded(['garden']); }}>{t('Next small step: explore Pocket Garden', '下一小步：探索 Pocket Garden')}</Button>}</footer>
  {notificationOpen && <section className="notification-panel" aria-label={t('Notification centre', '通知中心')}><div className="panel-heading"><h2>{t('Notifications', '通知')}</h2><Button variant="text" aria-label={t('Close notifications', '關閉通知')} onClick={() => setNotificationOpen(false)}><X size={20} /></Button></div>{notices.length ? notices.map(item => <article key={item.id}><p>{item.message}</p><time>{new Date(item.at).toLocaleTimeString()}</time></article>) : <p>{t('Nothing to report.', '暫時沒有通知。')}</p>}</section>}
  <div className="toast" role="status" aria-live="polite" hidden={!toast}>{settings.emojis && <Check size={17} aria-hidden="true" />}{toast}</div>
  <dialog ref={paletteRef} className="material-dialog" onCancel={() => setPalette(false)} onClose={() => setPalette(false)}><div className="panel-heading"><h2>{t('Go somewhere', '前往')}</h2><Button variant="text" aria-label={t('Close command palette', '關閉指令搜尋')} onClick={() => setPalette(false)}><X size={20} /></Button></div><Md tag="md-outlined-text-field" label={t('Find a page', '搜尋頁面')} value={paletteQuery} onInput={(e: Event) => setPaletteQuery((e.target as HTMLInputElement).value)} /><div className="palette-results">{tabs.filter(item => item.join(' ').toLowerCase().includes(paletteQuery.toLowerCase())).map(item => <Button key={item[0]} variant="text" onClick={() => navigate(item[0])}>{t(item[1], item[2])}<ArrowRight size={16} /></Button>)}</div><p className="muted">Ctrl+Shift+F <span aria-hidden="true">·</span> Escape</p></dialog>
  <dialog ref={confirmRef} className="material-dialog" onCancel={cancelRestore} onClose={() => { if (restore) cancelRestore(); }}><div className="panel-heading"><h2>{t('Replace current preferences?', '取代現有設定？')}</h2><Button variant="text" aria-label={t('Cancel', '取消')} onClick={cancelRestore}><X size={20} /></Button></div><p>{t('Your current preferences will be replaced. This creates a new history entry. Private wording is unaffected.', '現有設定會被取代，並新增歷程紀錄。私人用語不受影響。')}</p><label className="setting-row"><span>{t('I have reviewed this change.', '我已檢視這項改動。')}</span><Md tag="md-checkbox" checked={confirmA} aria-label={t('I have reviewed this change', '我已檢視這項改動')} onChange={(e: Event) => { setConfirmA((e.target as HTMLInputElement).checked); setConfirmProgress(0); }} /></label><label className="setting-row"><span>{t('I want to replace my preferences.', '我要取代現有設定。')}</span><Md tag="md-checkbox" checked={confirmB} aria-label={t('I want to replace my preferences', '我要取代現有設定')} onChange={(e: Event) => { setConfirmB((e.target as HTMLInputElement).checked); setConfirmProgress(0); }} /></label><label className="confirmation-slider">{t('Move from 0 to 100 to confirm', '由 0 移至 100 確認')}<Md tag="md-slider" min="0" max="100" step="1" value={confirmProgress} disabled={!confirmA || !confirmB} aria-label={t('Confirmation progress', '確認進度')} onInput={(e: Event) => setConfirmProgress(Number((e.target as HTMLInputElement).value))} /></label><div className="dialog-actions"><Button variant="text" onClick={cancelRestore}>{t('Emergency exit', '立即退出')}</Button><Button variant="filled" disabled={!confirmA || !confirmB || confirmProgress !== 100} onClick={() => { if (restore && confirmA && confirmB && confirmProgress === 100) { if (apply(restore, 'Restored preferences')) { cancelRestore(); notify(t('Preferences restored.', '設定已還原。')); } } }}>{t('Replace preferences', '取代設定')}</Button></div></dialog>
  {!ready && <span className="sr-only" role="status">Loading local preferences.</span>}
 </div>;
}
