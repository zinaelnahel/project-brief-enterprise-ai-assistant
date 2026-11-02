import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

// Run against a started production build. Mocked responses exercise the browser
// state transitions without spending API credits.
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const hits=[
    {id:'111111111111',source:'Password.pdf',department:'IT',page:6,text:'Revision history',score:.9},
    {id:'88f4391e22c7',source:'Password.pdf',department:'IT',page:2,text:'Use MFA.',score:.8},
  ];
  let events=[
    {type:'sources',answer:'Matching passages are ready.',hits},
    {type:'answer',answer:'Past changes. [111111111111]',hits},
    {type:'done',answer:'Use MFA. [88f4391e22c7]',hits},
  ];
  await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'application/x-ndjson',body:events.map(e=>JSON.stringify(e)).join('\n')+'\n'}));
  await page.goto(process.env.BASE_URL || 'http://localhost:3100');
  async function send(question) {
    await page.getByLabel('Your question').fill(question);
    await page.getByRole('button',{name:'Send question'}).click();
  }
  await send('Security requirements');
  await page.waitForFunction(()=>document.querySelector('.response-mode')?.textContent==='AI response');
  assert.match(await page.locator('.reader-toolbar').innerText(),/PAGE 2/);
  await page.locator('.source-item').first().click();
  assert.match(await page.locator('.reader-toolbar').innerText(),/PAGE 6/);
  await page.locator('.citation').click();
  assert.match(await page.locator('.reader-toolbar').innerText(),/PAGE 2/);
  console.log('PASS: final citation updates automatic source; manual choices and citation navigation work.');

  events=[{type:'done',answer:'No close matches were found.',hits:[],status:'no_matches'}];
  await send('Unrelated question');
  await page.getByText('No close matches were found.',{exact:true}).waitFor();
  assert.equal(await page.locator('.source-item').count(),0);
  assert.ok(await page.getByText('Evidence appears here',{exact:true}).isVisible());
  console.log('PASS: no-match answer clears evidence from the previous response.');

  events=[{type:'sources',answer:'Matching passages are ready.',hits},{type:'error',error:'The response was interrupted. Please retry.'}];
  await send('Retry this question');
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Your question').inputValue(),'Retry this question');
  assert.equal(await page.locator('.source-item').count(),0);
  assert.equal(await page.getByText('Matching passages are ready.',{exact:true}).count(),0);
  console.log('PASS: interrupted response removes provisional sources and restores the question.');
} finally { await browser.close(); }
