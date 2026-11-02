import {validateAnswer} from './retrieval.mjs';

export class ModelStreamError extends Error {
  constructor(message) { super(message); this.name='ModelStreamError'; }
}

// Decode lines across arbitrary network and UTF-8 boundaries. Both our NDJSON
// transport and upstream SSE use this; readers are cancelled on early exit.
export async function* streamLines(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '', ended = false;
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        yield buffer.slice(0,newline).replace(/\r$/, '');
        buffer = buffer.slice(newline+1);
      }
      if (done) { ended = true; break; }
    }
    if (buffer) yield buffer;
  } finally {
    if (!ended) await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export async function* serverEvents(stream) {
  let data = [];
  for await (const line of streamLines(stream)) {
    if (!line) {
      if (data.length) yield JSON.parse(data.join('\n'));
      data = [];
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length) yield JSON.parse(data.join('\n'));
}

// Emit only complete claim objects. Partial JSON, incomplete citations, and
// insufficient answers must never become visible claims.
export function completedClaims(text) {
  const status = text.match(/^\s*\{\s*"status"\s*:\s*"(answered|conflict)"/);
  const start = text.match(/^\s*\{\s*"status"\s*:\s*"(?:answered|conflict)"\s*,\s*"claims"\s*:\s*\[/);
  if (!status || !start) return [];
  const claims = [];
  let depth = 0, quoted = false, escaped = false, beginning = -1;
  for (let i=start[0].length; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') { if (depth++ === 0) beginning = i; }
    else if (c === '}') {
      if (--depth === 0) claims.push(JSON.parse(text.slice(beginning,i+1)));
    } else if (c === ']' && depth === 0) break;
  }
  return claims;
}

export async function readModelResponse(stream, hits, onAnswer) {
  let text = '', previous = '';
  for await (const event of serverEvents(stream)) {
    if (event.type === 'response.output_text.delta') {
      text += event.delta;
      const claims = completedClaims(text);
      if (claims.length) {
        let answer;
        try { answer = validateAnswer({status:'answered',claims,caveats:[]},hits); }
        catch { throw new ModelStreamError('The AI answer did not pass source validation. Please retry or use document search.'); }
        if (answer !== previous) { onAnswer(answer); previous = answer; }
      }
    } else if (event.type === 'response.completed') {
      return event.response;
    } else if (['error','response.failed','response.incomplete'].includes(event.type)) {
      throw new ModelStreamError('Incomplete model stream. Please retry or use document search.');
    }
  }
  throw new ModelStreamError('Incomplete model stream. Please retry or use document search.');
}
