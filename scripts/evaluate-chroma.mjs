import nextEnv from '@next/env';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {semanticSearch} from '../lib/chroma.mjs';
nextEnv.loadEnvConfig(process.cwd());
const {chunks}=JSON.parse(readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const cases=[
  ['Can I work from home and who needs to approve it?','Remote_Work',{}],
  ['How do I get paid back for a business trip?','Expense_Reimbursement',{}],
  ['A customer wants their money back. What should I do?','Refund_and_Complaint',{}],
  ['How do I keep my company login secure?','Password_and_Access',{}],
  ['How long should customers wait for their parcel?','Shipping_and_Delivery',{}],
  ['How do I request time off?','Leave_and_Absence',{department:'HR_policies'}],
];
let passed=0;
for(const [question,expected,options] of cases) {
  const hits=await semanticSearch(chunks,question,options);
  const match=hits.some(h=>h.source.includes(expected));
  if(match)passed++;
  assert.ok(hits.every(h=>!h.historical));
  if(options.department)assert.ok(hits.every(h=>h.department===options.department));
  console.log(`${match?'PASS':'MISS'}: ${question}`);
}
console.log(`Expected policy retrieved in top 6: ${passed}/${cases.length}. This small smoke set does not establish overall search quality.`);
if(passed!==cases.length)process.exitCode=1;
