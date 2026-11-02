import assert from 'node:assert/strict';
import {streamLines} from '../lib/streaming.mjs';
import {preferredSource} from '../lib/retrieval.mjs';

const base=process.env.BASE_URL || 'http://localhost:3100';
const question='What are the password and access requirements?';
async function query(body) {
  const started=performance.now();
  const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({...body,history:[]})});
  assert.equal(response.status,200,`HTTP ${response.status}: check deployment access and API configuration`);
  let firstClaimMs, sourcesMs, done;
  for await(const line of streamLines(response.body)) {
    const event=JSON.parse(line);
    if(event.type==='error')throw new Error(event.error);
    if(event.type==='sources')sourcesMs??=Math.round(performance.now()-started);
    if(event.type==='answer')firstClaimMs??=Math.round(performance.now()-started);
    if(event.type==='done')done=event;
  }
  assert.ok(done,'Stream must complete');
  return {...done,sourcesMs,firstClaimMs,totalMs:Math.round(performance.now()-started)};
}
let expected;
for(let run=1;run<=3;run++)for(const department of [null,'IT']) {
  const result=await query({question,department,mode:'search'});
  assert.equal(result.hits.length,6);
  const ids=result.hits.map(h=>h.id);
  expected??=ids;
  assert.deepEqual(ids,expected,'All departments and IT must return the same password evidence');
}
for(const body of [
  {question:'zxqvzzzz blargh flibbertigibbet product',mode:'search'},
  {question:'What is the remote work approval process?',mode:'ai',department:'Finance'},
]) {
  const result=await query(body);
  assert.equal(result.hits.length,0);
  assert.equal(result.status,'no_matches');
}
console.log('PASS: repeated all-department/scoped retrieval and no-match API checks.');

// Opt in explicitly: this section calls the configured model and incurs API cost.
if(process.env.LIVE_AI==='1')for(let run=1;run<=3;run++)for(const department of [null,'IT']) {
  const result=await query({question,department,mode:'ai'});
  assert.equal(result.status,'answered');
  assert.ok(result.firstClaimMs!==undefined && result.sourcesMs!==undefined);
  const page=result.hits.find(h=>h.id===preferredSource(result.answer,result.hits))?.page;
  assert.ok([1,2,3].includes(page),'Password answer must open a substantive cited page');
  console.log(JSON.stringify({run,department:department||'all',sourcesMs:result.sourcesMs,firstClaimMs:result.firstClaimMs,totalMs:result.totalMs,selectedPage:page}));
}
