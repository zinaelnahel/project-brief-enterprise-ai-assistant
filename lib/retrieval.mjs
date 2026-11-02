const stop = new Set('a an the is are was were i we you they it that this how what when where can do does to of and or for in on with my me our company ironstore should would could please tell about request process requirements'.split(' '));
export const UNKNOWN = "I couldn't find enough reliable information in the supplied documents. Please check with the relevant department.";
export function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !stop.has(t));
}
function count(text) {
  const counts = new Map();
  for (const t of tokens(text)) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}
export class Index {
  constructor(chunks) {
    this.chunks = chunks;
    const counts = chunks.map(c => count(c.source.split('/').pop().replace(/\.pdf$/i, '').replaceAll('_', ' ') + ' ' + c.text));
    const df = new Map();
    for (const c of counts) for (const t of c.keys()) df.set(t, (df.get(t) || 0) + 1);
    this.idf = new Map([...df].map(([t, n]) => [t, Math.log((1 + chunks.length) / (1 + n)) + 1]));
    this.vectors = counts.map(c => this.vector(c));
    this.terms = counts.map(c => new Set(c.keys()));
  }
  vector(counts) {
    const weights = [...counts].filter(([t]) => this.idf.has(t)).map(([t, n]) => [t, (1 + Math.log(n)) * this.idf.get(t)]);
    const norm = Math.sqrt(weights.reduce((s, [,w]) => s + w*w, 0)) || 1;
    return new Map(weights.map(([t,w]) => [t, w/norm]));
  }
  /** @param {string} question @param {{department?:string|null,includeHistorical?:boolean,k?:number}} options */
  search(question, {department = null, includeHistorical = false, k = 6} = {}) {
    const terms = [...new Set(tokens(question))];
    const query = this.vector(count(question));
    // Include unknown terms in coverage: a known word must not make an
    // otherwise unrelated question look like a strong match after normalization.
    const weight = t => this.idf.get(t) || Math.log(1 + this.chunks.length) + 1;
    const total = terms.reduce((sum,t) => sum + weight(t),0);
    return this.chunks.flatMap((c,i) => total > 0 && terms.reduce((sum,t) => sum + (this.terms[i].has(t) ? weight(t) : 0),0) / total >= .65
      ? [{...c, score: [...query].reduce((s,[t,w]) => s + (this.vectors[i].get(t) || 0)*w, 0)}] : [])
      .filter(c => c.score >= .075 && (!department || c.department === department) && (!c.historical || includeHistorical))
      .sort((a,b) => b.score - a.score).slice(0,k);
  }
}
export function retrievalQuery(question, history) {
  const prior = history.filter(m => m.role === 'user').at(-1);
  return question + (/\b(it|that|this|they|those|also)\b/i.test(question) && prior ? ' ' + prior.content.slice(0,1000) : '');
}
export function validateAnswer(answer, hits) {
  if (!answer || !['answered','insufficient','conflict'].includes(answer.status) || !Array.isArray(answer.claims) || !Array.isArray(answer.caveats)) throw new Error('Invalid model answer');
  if (answer.status === 'insufficient') return UNKNOWN;
  const ids = new Set(hits.map(h => h.id));
  if (!answer.claims.length || answer.claims.some(c => !c || typeof c.text !== 'string' || !c.text.trim() || !Array.isArray(c.citations) || !c.citations.length || c.citations.some(id => !ids.has(id))) || answer.caveats.some(c => typeof c !== 'string')) throw new Error('Invalid model citations');
  const claims = answer.claims.map(c => {
    const text = cleanAnswerText(c.text);
    if (!text) throw new Error('Invalid model text');
    return `${text} ${[...new Set(c.citations)].map(id => `[${id}]`).join(' ')}`;
  });
  return [...claims, ...answer.caveats.map(cleanAnswerText).filter(Boolean)].join('\n\n');
}

// Passage IDs belong only in the citations array, never in generated prose.
export function cleanAnswerText(text) {
  return text.replace(/\[?\b[a-f0-9]{12}\b\]?/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function preferredSource(answer, hits) {
  for (const match of answer.matchAll(/\[([a-f0-9]{12})\]/g)) {
    if (hits.some(hit => hit.id === match[1])) return match[1];
  }
  return hits[0]?.id ?? null;
}
