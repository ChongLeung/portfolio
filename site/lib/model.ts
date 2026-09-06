export type Language = 'en' | 'yue' | 'both';
export type Settings = {
 language: Language; theme: 'light' | 'dark'; density: 'comfortable' | 'compact';
 englishHumour: number; cantoneseHumour: number; emojis: boolean;
 textScale: number; accent: string; reducedMotion: boolean;
 focus: boolean; lowStimulation: boolean; timeAwareness: boolean; oneThing: boolean; momentum: boolean;
 narrator: boolean; narrationLanguage: Language; rate: number; pitch: number;
};
export const defaults: Settings = {
 language: 'en', theme: 'light', density: 'comfortable', englishHumour: 5, cantoneseHumour: 5,
 emojis: true, textScale: 100, accent: '#006b60', reducedMotion: true, focus: false,
 lowStimulation: false, timeAwareness: false, oneThing: false, momentum: false,
 narrator: false, narrationLanguage: 'en', rate: 1, pitch: 1,
};
export type Revision = { id: string; at: string; action: string; settings: Settings };
export type Notice = { id: string; at: string; message: string };
export const settingsKey = 'harbour.settings.v1';
export const historyKey = 'harbour.history.v1';
export const vocabularyKey = 'harbour.private-vocabulary.v1';
export function validateSettings(value: unknown): Settings {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a settings object.');
 const input = value as Record<string, unknown>;
 if (Object.keys(input).some(key => !Object.hasOwn(defaults, key))) throw new Error('Unknown settings field.');
 if (Object.keys(defaults).some(key => !Object.hasOwn(input, key))) throw new Error('The settings file is incomplete.');
 const result = { ...defaults, ...input };
 if (!['en', 'yue', 'both'].includes(result.language) || !['en', 'yue', 'both'].includes(result.narrationLanguage)) throw new Error('Unsupported language.');
 if (!['light', 'dark'].includes(result.theme) || !['comfortable', 'compact'].includes(result.density)) throw new Error('Unsupported appearance.');
 for (const [key, min, max] of [['englishHumour', 1, 5], ['cantoneseHumour', 1, 5], ['textScale', 85, 160], ['rate', 0.5, 2], ['pitch', 0, 2]] as const) {
  if (typeof result[key] !== 'number' || !Number.isFinite(result[key]) || result[key] < min || result[key] > max) throw new Error(`Invalid ${key}.`);
 }
 for (const key of Object.keys(defaults) as (keyof Settings)[]) if (typeof defaults[key] === 'boolean' && typeof result[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
 if (typeof result.accent !== 'string' || !/^#[a-f\d]{6}$/i.test(result.accent)) throw new Error('Use a six-digit hexadecimal colour.');
 return result as Settings;
}
export function validatePreferences(text: string): Settings {
 const value = parseUniqueJson(text) as Record<string, unknown>;
 if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || !Object.hasOwn(value, 'settings')) throw new Error('Invalid preferences envelope.');
 if (Object.keys(value).some(key => !['schemaVersion', 'settings', 'omission'].includes(key))) throw new Error('Unknown preferences envelope field.');
 if (value.omission !== undefined && value.omission !== 'Private vocabulary and file metadata are omitted.') throw new Error('Invalid omission statement.');
 return validateSettings(value.settings);
}
export function recoverHistory(value: unknown): { entries: Revision[]; skipped: number } {
 if (!Array.isArray(value)) throw new Error('History must be a list.');
 const entries: Revision[] = []; let skipped = 0;
 for (const item of value.slice(0, 200)) {
  try {
   if (!item || typeof item.id !== 'string' || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at)) || typeof item.action !== 'string') throw new Error();
   entries.push({ id: item.id, at: item.at, action: item.action, settings: validateSettings(item.settings) });
  } catch { skipped++; }
 }
 return { entries, skipped };
}
export function parseUniqueJson(text: string, maxBytes = 1048576): unknown {
 if (new TextEncoder().encode(text).length > maxBytes) throw new Error('The file exceeds the 1 MiB limit.');
 const stack: (Set<string> | null)[] = [];
 for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (ch === '{' || ch === '[') { stack.push(ch === '{' ? new Set() : null); if (stack.length > 8) throw new Error('Maximum nesting depth is 8.'); }
  else if (ch === '}' || ch === ']') stack.pop();
  else if (ch === '"') {
   const start = i++;
   while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i] === '"') break; else i++; }
   let next = i + 1; while (next < text.length && /\s/.test(text[next])) next++;
   if (text[next] === ':' && stack.at(-1) instanceof Set) {
    const key = JSON.parse(text.slice(start, i + 1)); const keys = stack.at(-1)!;
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe object key.');
    if (keys.has(key)) throw new Error('Duplicate object keys are not supported.'); keys.add(key);
   }
  }
 }
 return JSON.parse(text);
}
export function validateVocabulary(text: string): Record<string, string> {
 const value = parseUniqueJson(text) as Record<string, unknown>;
 if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || Object.keys(value).sort().join(',') !== 'entries,schemaVersion') throw new Error('Expected schemaVersion 1 and entries.');
 const entries = value.entries;
 if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Entries must be an object.');
 const pairs = Object.entries(entries);
 if (pairs.length > 4096) throw new Error('Maximum entry count is 4,096.');
 for (const [key, val] of pairs) if (!key.length || key.length > 160 || typeof val !== 'string' || val.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(val)) throw new Error('Invalid replacement entry.');
 return Object.fromEntries(pairs);
}
export const projects = [
 { id: 'garden', name: 'Pocket Garden', category: ['Everyday care', '日常照顧'], short: ['A little room for things to grow.', '留一點空間，讓生活慢慢生長。'], description: ['A plant-care planner concept that makes a growing collection feel manageable, one small task at a time.', '植物照顧記事簿概念，將日常工作分成小步驟，慢慢照顧每一盆植物。'], tags: ['Product thinking', 'Gentle routines'], detail: ['Replace a crowded calendar with a short, forgiving list of what a plant needs today. The concept explores clear priorities and a calm visual rhythm.', 'Group plants by care needs, make skipped tasks easy to reschedule, and keep progress encouraging without invented streaks. This is a design concept, not a deployed product.'], detailYue: ['將擠滿行程的月曆，變成簡短、容易跟上的每日照顧清單。這個概念著重清晰次序與平靜節奏。', '按照顧需要整理植物，方便重新安排未完成的工作。不設虛構的連續紀錄；這是設計概念，並非已推出的產品。'] },
 { id: 'city', name: 'City Notes', category: ['Places & stories', '地方與故事'], short: ['Notice more. Keep the good bits.', '多留意一點，記住生活的小發現。'], description: ['A neighbourhood journal concept for the places, details, and small discoveries worth remembering.', '社區手記概念，記錄值得回味的地方、細節與小發現。'], tags: ['Editorial design', 'Local stories'], detail: ['A personal notebook for the corner café, a favourite route, or the colour of a doorway. The concept is about attention rather than ratings.', 'Start with a short note, add context only when useful, and keep personal observations separate from factual place information. No real location data is collected here.'], detailYue: ['用私人筆記記住街角咖啡店、喜歡的路線，或者一道門的顏色。這個概念重視觀察，而非評分。', '由簡短筆記開始，有需要才補充背景，將個人感受與地點資料分開。這裏不收集真實位置資料。'] },
 { id: 'desk', name: 'Quiet Desk', category: ['Space to focus', '專注空間'], short: ['Less noise. A clearer next step.', '少一點雜訊，下一步更清楚。'], description: ['A focused-workspace concept that brings one intention, useful notes, and a little breathing room together.', '專注工作空間概念，放下眼前目標與實用筆記，留一點呼吸空間。'], tags: ['Interaction design', 'Accessible tools'], detail: ['Let a workspace support attention without demanding more of it. The concept explores one clear task and secondary information that stays within reach.', 'Use progressive disclosure, readable type, and explicit controls. Quiet should remain a choice, with a straightforward path back to the whole picture.'], detailYue: ['讓工作空間支持專注，而不是再分走注意力。這個概念以一項清晰任務為中心，其餘資料仍然隨手可及。', '逐步顯示資訊，配合清楚字體與明確操作。安靜是一種選擇，隨時都可以回到完整畫面。'] },
];
