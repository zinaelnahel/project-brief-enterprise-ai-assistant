import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionIdentity,metadataFilter,embedTexts,semanticSearch,retrievalProvider,EMBEDDING_MODEL,DIMENSIONS} from '../lib/chroma.mjs';

const chunks=[
  {id:'a',text:'Remote work requires approval.',source:'hr.pdf',page:2,department:'HR_policies',historical:false},
  {id:'b',text:'Previous rules.',source:'old.pdf',page:1,department:'HR_policies',historical:true},
  {id:'c',text:'Expense policy.',source:'finance.pdf',page:3,department:'Finance',historical:false},
];
test('collection identity changes with corpus content and retains the small model',()=>{
  const first=collectionIdentity(chunks,{});
  assert.equal(first.name,collectionIdentity(chunks,{}).name);
  assert.notEqual(first.name,collectionIdentity([{...chunks[0],text:'Updated'}],{}).name);
  assert.equal(EMBEDDING_MODEL,'text-embedding-3-small');
  assert.throws(()=>collectionIdentity(chunks,{CHROMA_COLLECTION:'bad prefix'}));
});
test('Chroma filters preserve department and historical constraints',()=>{
  assert.deepEqual(metadataFilter({department:'HR_policies'}),{$and:[{department:{$eq:'HR_policies'}},{historical:{$eq:false}}]});
  assert.equal(metadataFilter({includeHistorical:true}),undefined);
  assert.deepEqual(metadataFilter(),{historical:{$eq:false}});
});
test('embedding requests use the small model, order results, and check dimensions',async()=>{
  let request;
  const vector=new Array(DIMENSIONS).fill(0);
  const result=await embedTexts(['one','two'],{env:{OPENAI_API_KEY:'test-only'},fetchImpl:async(url,init)=>{
    request=JSON.parse(init.body);
    return {ok:true,json:async()=>({data:[{index:1,embedding:vector},{index:0,embedding:vector}]})};
  }});
  assert.equal(request.model,EMBEDDING_MODEL);assert.equal(result.length,2);
  await assert.rejects(()=>embedTexts(['test'],{env:{}}),/requires OPENAI_API_KEY/);
  await assert.rejects(()=>embedTexts(['test'],{env:{OPENAI_API_KEY:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>({data:[{index:0,embedding:[1]}]})})}),/invalid embedding/);
});
test('embedding failures provide safe authentication and rate-limit messages',async()=>{
  for(const [status,pattern] of [[401,/rejected/],[429,/usage limit/]]) {
    await assert.rejects(()=>embedTexts(['test'],{env:{OPENAI_API_KEY:'test-only'},fetchImpl:async()=>({ok:false,status})}),pattern);
  }
});
function dependencies({complete=true}={}) {
  const {fingerprint}=collectionIdentity(chunks,{});
  const collection={metadata:{fingerprint,embedding_model:EMBEDDING_MODEL,index_complete:complete},
    query:async args=>{assert.deepEqual(args.where,metadataFilter({department:'HR_policies'}));
      return {ids:[['a','b','c','unknown']],distances:[[.2,.1,.1,.1]]};}};
  return {env:{},client:{getCollection:async()=>collection},embed:async()=>[[1,2]]};
}
test('semantic results use canonical source text and defend metadata constraints',async()=>{
  const hits=await semanticSearch(chunks,'Can I work from home?',{department:'HR_policies'},dependencies());
  assert.equal(hits.length,1);assert.equal(hits[0].id,'a');assert.equal(hits[0].score,.8);
  assert.equal(hits[0].page,2);assert.equal(hits[0].text,chunks[0].text);
});
test('incomplete indexes fail explicitly rather than silently using lexical retrieval',async()=>{
  await assert.rejects(()=>semanticSearch(chunks,'work',{},dependencies({complete:false})),/incomplete/);
  assert.equal(retrievalProvider({}),'tfidf');assert.equal(retrievalProvider({RETRIEVAL_PROVIDER:'chroma'}),'chroma');
  assert.throws(()=>retrievalProvider({RETRIEVAL_PROVIDER:'typo'}));
});
test('semantic similarity threshold discards unrelated results',async()=>{
  const deps=dependencies();deps.env={CHROMA_MIN_SIMILARITY:'.95'};
  assert.deepEqual(await semanticSearch(chunks,'unrelated',{department:'HR_policies'},deps),[]);
});
test('default semantic threshold rejects weak nearest neighbors',async()=>{
  const deps=dependencies();
  const get=deps.client.getCollection;
  deps.client.getCollection=async()=>({...await get(),query:async()=>({ids:[['a']],distances:[[.65]]})});
  assert.deepEqual(await semanticSearch(chunks,'unrelated',{department:'HR_policies'},deps),[]);
});
