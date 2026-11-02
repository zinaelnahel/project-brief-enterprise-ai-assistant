import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Index, UNKNOWN, retrievalQuery, validateAnswer} from '../lib/retrieval.mjs';

const corpus = JSON.parse(readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const index = new Index(corpus.chunks);
test('all 83 PDFs exported with page-aware stable passage IDs',()=>{
  assert.equal(corpus.inventory.length,83);
  assert.equal(corpus.chunks.length,2451);
  assert.equal(new Set(corpus.chunks.map(c=>c.id)).size,corpus.chunks.length);
  assert.ok(corpus.chunks.every(c=>c.text && c.page>=1));
});
test('finds the expected policy for representative employee questions',()=>{
  for (const [question,expected] of [
    ['How do I request expense reimbursement?','Expense_Reimbursement'],
    ['What is the remote work approval process?','Remote_Work'],
    ['What are the password and access requirements?','Password_and_Access'],
    ['How should I handle a customer refund request?','Refund_and_Complaint'],
    ['What are the shipping delivery SLAs?','Shipping_and_Delivery'],
  ]) assert.ok(index.search(question).some(c=>c.source.includes(expected)),question);
});
test('historical documents are opt-in',()=>{
  assert.ok(corpus.chunks.some(c=>c.historical));
  assert.ok(index.search('product catalog',{k:10000}).every(c=>!c.historical));
  assert.ok(index.search('product catalog',{includeHistorical:true,k:10000}).some(c=>c.historical));
});
test('department filtering precedes top-k selection',()=>{
  const hits=index.search('leave absence',{department:'HR_policies'});
  assert.ok(hits.length);
  assert.ok(hits.every(c=>c.department==='HR_policies'));
});
test('unknown terms have no evidence',()=>assert.deepEqual(index.search('zxqvzzzz'),[]));
test('unknown query terms cannot be normalized away into catalog matches',()=>{
  assert.deepEqual(index.search('zxqvzzzz blargh flibbertigibbet product'),[]);
});
test('Finance does not supply evidence for the remote work approval question',()=>{
  for(const includeHistorical of [false,true]) {
    assert.deepEqual(index.search('What is the remote work approval process?',{department:'Finance',includeHistorical}),[]);
  }
});

test('unrelated queries remain empty across departments and historical settings',()=>{
  for(const department of [null,...new Set(corpus.chunks.map(c=>c.department))]) {
    for(const includeHistorical of [false,true]) {
      for(const question of ['zxqvzzzz','zxqvzzzz blargh flibbertigibbet product']) {
        assert.deepEqual(index.search(question,{department,includeHistorical}),[],`${department}: ${question}`);
      }
    }
  }
});
test('follow-up retrieval carries prior user topic',()=>{
  assert.match(retrievalQuery('Who approves it?',[{role:'user',content:'remote work'}]),/remote work/);
  assert.equal(retrievalQuery('Expense policy',[{role:'user',content:'remote work'}]),'Expense policy');
});
test('rejects absent and fabricated model citations',()=>{
  const hits=index.search('remote work');
  for(const citations of [[],['fake']]) assert.throws(()=>validateAnswer({status:'answered',claims:[{text:'A claim',citations}],caveats:[]},hits));
  assert.throws(()=>validateAnswer({status:'bogus',claims:[],caveats:[]},hits));
  assert.equal(validateAnswer({status:'insufficient',claims:[],caveats:[]},hits),UNKNOWN);
  assert.match(validateAnswer({status:'answered',claims:[{text:'A claim',citations:[hits[0].id]}],caveats:[]},hits),new RegExp(hits[0].id));
});
test('rejects null claims and empty factual text',()=>{
  const hits=index.search('remote work');
  for(const claim of [null,{text:' ',citations:[hits[0].id]}]) {
    assert.throws(()=>validateAnswer({status:'answered',claims:[claim],caveats:[]},hits),/Invalid model citations/);
  }
});
