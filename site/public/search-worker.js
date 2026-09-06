self.onmessage = ({ data }) => {
 const started = performance.now();
 try {
  const { query, regex, flags, items } = data;
  if (typeof query !== 'string' || query.length > 2048 || !Array.isArray(items) || items.length > 10000 || JSON.stringify(items).length > 1048576) throw new Error('Search exceeds the supported limits.');
  if (typeof flags !== 'string' || !/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length || (flags.includes('u') && flags.includes('v'))) throw new Error('Invalid or incompatible flags.');
  const expression = regex && query ? new RegExp(query, flags) : null;
  const ids = []; const matches = [];
  for (const item of items) {
   if (typeof item.id !== 'string' || typeof item.text !== 'string') throw new Error('Invalid search record.');
   if (item.text.length > 65536) throw new Error('A search record is too long.');
   if (!query) { ids.push(item.id); continue; }
   if (!expression) { if (item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ids.push(item.id); continue; }
   expression.lastIndex = 0; const match = expression.exec(item.text);
   if (match) { ids.push(item.id); if (matches.length < 100) matches.push({ id: item.id, index: match.index, value: match[0].slice(0, 200), groups: match.slice(1).map(x => x?.slice(0, 200) ?? null) }); }
  }
  self.postMessage({ ok: true, ids, matches, elapsedMs: performance.now() - started });
 } catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Search could not be evaluated.' }); }
};
