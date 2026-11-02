import test from 'node:test';
import assert from 'node:assert/strict';
import {completedClaims, serverEvents, streamLines, readModelResponse} from '../lib/streaming.mjs';
import {validateAnswer, preferredSource, UNKNOWN} from '../lib/retrieval.mjs';

const hits=[{id:'111111111111',text:'Revision history',page:6},{id:'88f4391e22c7',text:'Use MFA.',page:2}];
const claim={text:'Use MFA. 88f4391e22c7 [111111111111]',citations:['88f4391e22c7']};
const answer={status:'answered',claims:[claim],caveats:[]};
function bytes(text) {
  const data=new TextEncoder().encode(text);
  return new ReadableStream({start(controller){for(const byte of data)controller.enqueue(Uint8Array.of(byte));controller.close();}});
}

test('UTF-8 and NDJSON lines survive arbitrary network boundaries',async()=>{
  const lines=[];
  for await(const line of streamLines(bytes('one\r\n{"message":"café €"}\nlast')))lines.push(line);
  assert.deepEqual(lines,['one','{"message":"café €"}','last']);
});

test('SSE handles comments, event names, CRLF, and fragmented data',async()=>{
  const events=[];
  for await(const event of serverEvents(bytes(': keepalive\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_text.delta",\r\ndata: "delta":"café"}\r\n\r\ndata: {"type":"response.completed"}\n\n')))events.push(event);
  assert.deepEqual(events,[{type:'response.output_text.delta',delta:'café'},{type:'response.completed'}]);
});

test('claims appear before the final JSON completes, only after citations complete',()=>{
  const text=JSON.stringify(answer);
  for(let i=0;i<text.indexOf(']}')+2;i++)assert.deepEqual(completedClaims(text.slice(0,i)),[]);
  const partial=text.slice(0,text.indexOf(',"caveats"'));
  assert.deepEqual(completedClaims(partial),[claim]);
  assert.deepEqual(completedClaims('{"status":"insufficient","claims":['+JSON.stringify(claim)+']'),[]);
});

test('quoted braces, escaped quotes, and arrays do not terminate claims',()=>{
  const tricky={text:'The array "]}" and quote " and slash \\ are text.',citations:['88f4391e22c7']};
  assert.deepEqual(completedClaims(JSON.stringify({...answer,claims:[tricky,claim]})),[tricky,claim]);
});

test('streamed and final claims remove raw IDs and keep canonical citations',()=>{
  const formatted=validateAnswer({...answer,caveats:['Check with IT. [88f4391e22c7]']},hits);
  assert.equal(formatted,'Use MFA. [88f4391e22c7]\n\nCheck with IT.');
  assert.equal(preferredSource(formatted,hits),'88f4391e22c7');
  assert.equal(preferredSource('No citations',hits),'111111111111');
  assert.equal(preferredSource(UNKNOWN,[]),null);
  assert.throws(()=>validateAnswer({...answer,claims:[{text:'88f4391e22c7',citations:['88f4391e22c7']}]},hits));
  assert.throws(()=>validateAnswer({...answer,claims:[{text:'Use MFA.',citations:['fake']}]},hits));
});

test('closing a consumer cancels upstream reads',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('one\ntwo\n'));},cancel(){cancelled=true;}});
  for await(const line of streamLines(stream)){assert.equal(line,'one');break;}
  assert.equal(cancelled,true);
});

const event = data => new TextEncoder().encode('data: '+JSON.stringify(data)+'\n\n');
test('first cited claim arrives while the model is still generating',async()=>{
  let writer, first;
  const received=new Promise(resolve=>{first=resolve;});
  const stream=new ReadableStream({start(controller){writer=controller;}});
  let finished=false;
  const result=readModelResponse(stream,hits,first).then(value=>{finished=true;return value;});
  writer.enqueue(event({type:'response.output_text.delta',delta:JSON.stringify(answer).slice(0,-1)}));
  assert.equal(await received,'Use MFA. [88f4391e22c7]');
  assert.equal(finished,false);
  writer.enqueue(event({type:'response.completed',response:{status:'completed'}}));
  assert.deepEqual(await result,{status:'completed'});
});

test('truncated, failed, and invalid-citation streams cannot finish successfully',async()=>{
  const delta={type:'response.output_text.delta',delta:JSON.stringify(answer)};
  for(const events of [[delta],[{type:'response.failed'}],[{type:'response.incomplete'}],[{type:'error'}]]) {
    const stream=new ReadableStream({start(c){events.forEach(e=>c.enqueue(event(e)));c.close();}});
    await assert.rejects(()=>readModelResponse(stream,hits,()=>{}),/Incomplete/);
  }
  const bad={...answer,claims:[{text:'Use MFA.',citations:['fake']}]};
  let shown=false;
  await assert.rejects(()=>readModelResponse(bytes('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(bad)})+'\n\n'),hits,()=>{shown=true;}),/source validation/);
  assert.equal(shown,false);
});
