'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {Hit} from '../../lib/types';

type Message = {role:'user'|'assistant'; content:string; hits?:Hit[]; mode?:string};
const labels: Record<string,string> = {HR_policies:'People & HR',IT:'IT & security',Finance:'Finance',Sales:'Sales',Legal_Terms:'Legal',Customer_support:'Customer support',Deliveries:'Delivery & logistics',product_catalog:'Product catalog'};
const examples = [
  ['01','Remote work','What is the remote work approval process?','People & HR'],
  ['02','Expense reimbursement','How do I request expense reimbursement?','Finance'],
  ['03','Customer refunds','How should I handle a customer refund request?','Customer support'],
  ['04','Account security','What are the password and access requirements?','IT & security'],
];
const documentName = (source:string) => source.split('/').pop()?.replace(/\.pdf$/i,'').replaceAll('_',' ').replace(/^IronStore /,'') || source;
function Icon({name}:{name:'add'|'document'|'arrow'|'close'|'chat'}) {
  const paths = {add:'M12 5v14M5 12h14',document:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',arrow:'M5 12h14m-6-6 6 6-6 6',close:'m6 6 12 12M6 18 18 6',chat:'M4 4h16v12H9l-5 4V4Z'};
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export default function Chat({documentCount,departments,aiAvailable,semanticSearchEnabled}:{documentCount:number; departments:string[]; aiAvailable:boolean; semanticSearchEnabled:boolean}) {
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState('');
  const [mode,setMode]=useState(aiAvailable?'ai':'search');
  const [department,setDepartment]=useState('');
  const [historical,setHistorical]=useState(false);
  const [busy,setBusy]=useState(false);
  const [slow,setSlow]=useState(false);
  const [error,setError]=useState('');
  const [sourceMessage,setSourceMessage]=useState<number|null>(null);
  const [activeSource,setActiveSource]=useState<string|null>(null);
  const [sourcesOpen,setSourcesOpen]=useState(false);
  const bottom=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLTextAreaElement>(null);
  const sourceToggle=useRef<HTMLButtonElement>(null);
  const sourcePanel=useRef<HTMLElement>(null);
  const controller=useRef<AbortController|null>(null);
  const hits=sourceMessage===null?[]:messages[sourceMessage]?.hits || [];
  const selected=hits.find(h=>h.id===activeSource) || hits[0];
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'end'});},[messages,busy]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{
    if(!sourcesOpen)return;
    sourcePanel.current?.focus();
    function escape(e:KeyboardEvent){if(e.key==='Escape'){setSourcesOpen(false);sourceToggle.current?.focus();}}
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[sourcesOpen]);

  async function send(text:string) {
    if(busy || !text.trim())return;
    const prior=messages;
    setBusy(true);setSlow(false);setError('');setQuestion('');
    setMessages([...prior,{role:'user',content:text.trim()}]);
    controller.current=new AbortController();
    const pending=controller.current;
    let timedOut=false;
    const slowTimer=setTimeout(()=>setSlow(true),8000);
    const timeout=setTimeout(()=>{timedOut=true;pending.abort();},90000);
    try {
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.current.signal,
        body:JSON.stringify({question:text.trim(),mode,department:department||null,includeHistorical:historical,
          history:prior.slice(-6).map(m=>({role:m.role,content:m.content.slice(0,4000)}))})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error || 'The request failed. Please try again.');
      setMessages([...prior,{role:'user',content:text.trim()},{role:'assistant',content:data.answer,hits:data.hits,mode}]);
      setSourceMessage(prior.length+1);setActiveSource(data.hits?.[0]?.id ?? null);
    } catch(e) {
      setMessages(prior);setQuestion(text);
      setError(pending.signal.aborted
        ? timedOut?'The request took too long. Retry or switch to document search.':'Request cancelled. Your question is ready to send again.'
        : e instanceof Error?e.message:'Connection failed. Please try again.');
    } finally {clearTimeout(slowTimer);clearTimeout(timeout);setBusy(false);setSlow(false);controller.current=null;}
  }
  function submit(e:FormEvent){e.preventDefault();void send(question);}
  function clear(){if(busy)return;setMessages([]);setQuestion('');setError('');setSourceMessage(null);setActiveSource(null);setSourcesOpen(false);input.current?.focus();}
  function inspect(index:number,id?:string){setSourceMessage(index);setActiveSource(id || messages[index].hits?.[0]?.id || null);setSourcesOpen(true);}
  function content(message:Message,index:number) {
    return message.content.split(/(\[[a-f0-9]{12}\])/g).map((part,i)=>{
      const id=part.slice(1,-1); const hit=message.hits?.find(h=>h.id===id);
      return hit?<button className="citation" key={i} title={`Open ${documentName(hit.source)}, page ${hit.page}`} onClick={()=>inspect(index,id)}>{(message.hits?.indexOf(hit) ?? 0)+1}</button>:part;
    });
  }
  return <div className="research-workspace">
    <header className="workspace-header">
      <a className="wordmark" href="/" aria-label="IronStore home"><span className="monogram">IS</span>IronStore<span className="wordmark-divider"/><span className="workspace-title">Knowledge workspace</span></a>
      <div className="header-actions"><span className="library-status"><i/>{documentCount} documents indexed</span><button ref={sourceToggle} className="text-button source-toggle" onClick={()=>setSourcesOpen(!sourcesOpen)} aria-expanded={sourcesOpen} aria-controls="source-panel"><Icon name="document"/> Sources{hits.length>0&&<span>{hits.length}</span>}</button></div>
    </header>
    <nav className="navigation-rail" aria-label="Workspace actions">
      <button className="rail-button" onClick={clear} disabled={busy} title="New conversation" aria-label="New conversation"><Icon name="add"/></button>
      <span className="rail-separator"/>
      <button className="rail-button current" onClick={()=>input.current?.focus()} title="Conversation" aria-label="Focus conversation"><Icon name="chat"/></button>
      <button className="rail-button" onClick={()=>setSourcesOpen(true)} title="Document sources" aria-label="View document sources" aria-controls="source-panel"><Icon name="document"/></button>
      <span className="rail-bottom" title="IronStore workspace">IS</span>
    </nav>
    <main className="conversation-panel">
      <div className="conversation-toolbar"><div><span className="section-index">01</span><h1>Conversation</h1></div><button className="text-button" onClick={clear} disabled={busy}><Icon name="add"/>New conversation</button></div>
      <div className="search-controls">
        <label>Mode<select value={mode} onChange={e=>setMode(e.target.value)} disabled={busy}><option value="ai" disabled={!aiAvailable}>AI assistant{!aiAvailable?' (key required)':''}</option><option value="search">Document search</option></select></label>
        <label>Scope<select value={department} onChange={e=>setDepartment(e.target.value)} disabled={busy}><option value="">All departments</option>{departments.map(d=><option key={d} value={d}>{labels[d]||d}</option>)}</select></label>
        <label className="history-filter"><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)} disabled={busy}/>Include historical</label>
      </div>
      <div className="conversation-scroll">
        {!messages.length?<section className="empty-conversation"><p className="overline">INTERNAL RESEARCH</p><h2>Search company knowledge.</h2><p className="intro-description">Ask about policies, procedures, or products.<br/>Review the supporting documents alongside each response.</p><div className="suggestion-header"><h3>Suggested questions</h3><span>DEPARTMENT</span></div><div className="suggestion-list">{examples.map(([number,topic,q,area])=><button key={number} className="suggestion-row" onClick={()=>void send(q)} disabled={busy}><span className="row-number">{number}</span><span className="suggestion-topic">{topic}<small>{q}</small></span><span className="suggestion-area">{area}</span><Icon name="arrow"/></button>)}</div><p className="collection-note"><Icon name="document"/>{documentCount} source documents across {departments.length} knowledge areas</p></section>:
        <section className="message-list" aria-label="Conversation" aria-live="polite">{messages.map((m,i)=><article className={`message ${m.role}`} key={i}><div className="message-meta"><span className={`author-mark ${m.role}`}>{m.role==='user'?'YOU':'IS'}</span><strong>{m.role==='assistant'?'IronStore assistant':'You'}</strong>{m.role==='assistant'&&<span className="response-mode">{m.mode==='ai'?'AI response':'Document search'}</span>}</div><div className="message-content">{content(m,i)}</div>{!!m.hits?.length&&<button className={`review-sources ${sourceMessage===i?'selected':''}`} onClick={()=>inspect(i)}><Icon name="document"/>Review {m.hits.length} supporting passages<Icon name="arrow"/></button>}</article>)}{busy&&<div className="request-status" role="status"><span className="loading-indicator"/>{slow?'This is taking longer than usual. You can cancel and try again.':mode==='ai'?'Reviewing documents and preparing a response...':'Searching the document library...'}<button className="text-button" onClick={()=>controller.current?.abort()}>Cancel</button></div>}<div ref={bottom}/></section>}
      </div>
      <div className="composer-container">{error&&<div className="error" role="alert"><span>{error}</span>{!!question.trim()&&<button className="text-button" onClick={()=>void send(question)} disabled={busy}>Retry</button>}<button onClick={()=>setError('')} aria-label="Dismiss error"><Icon name="close"/></button></div>}<form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="question">Your question</label><textarea ref={input} id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about company policies, procedures, or products" maxLength={3000} rows={2} disabled={busy} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(question);}}}/><div className="composer-footer"><span>{department?(labels[department]||department):'All departments'}<span className="keyboard-hint">Enter to send / Shift + Enter for a new line</span></span><button className="submit-question" type="submit" disabled={busy||!question.trim()} aria-label="Send question"><Icon name="arrow"/></button></div></form><p className="data-note">{mode==='ai'?'AI responses may contain errors. Verify important details against the sources. Questions and relevant excerpts are sent to OpenAI.':semanticSearchEnabled?'Semantic search sends your question to OpenAI for embedding and retrieves passages from Chroma.':'Document search retrieves source passages without sending them to an AI service.'}</p></div>
    </main>
    {sourcesOpen&&<button className="source-backdrop" onClick={()=>{setSourcesOpen(false);sourceToggle.current?.focus();}} aria-label="Close document sources"/>}
    <aside ref={sourcePanel} tabIndex={-1} id="source-panel" className={`source-panel ${sourcesOpen?'is-open':''}`} aria-label="Document sources">
      <header className="source-panel-header"><div><span className="section-index">02</span><h2>Source documents</h2></div><span className="source-count">{hits.length}</span><button className="close-sources" onClick={()=>{setSourcesOpen(false);sourceToggle.current?.focus();}} aria-label="Close sources"><Icon name="close"/></button></header>
      {!hits.length?<div className="source-empty"><div className="empty-document"><Icon name="document"/><span/><span/><span/></div><h3>Evidence appears here</h3><p>Submit a question to see relevant passages. Select a citation to inspect its source and page reference.</p><dl><div><dt>Collection</dt><dd>IronStore internal documents</dd></div><div><dt>Coverage</dt><dd>{departments.length} knowledge areas</dd></div><div><dt>Library</dt><dd>{documentCount} PDF documents</dd></div></dl></div>:
      <><div className="source-context"><span>EVIDENCE FOR</span><p>{sourceMessage!==null?messages[sourceMessage-1]?.content:''}</p></div><div className="source-list" aria-label="Supporting passages">{hits.map((h,i)=><button className={`source-item ${selected?.id===h.id?'active':''}`} aria-pressed={selected?.id===h.id} key={h.id} onClick={()=>setActiveSource(h.id)}><span className="passage-number">{i+1}</span><span>{documentName(h.source)}<small>{labels[h.department]||h.department} / Page {h.page}{h.historical?' / Historical':''}</small></span></button>)}</div>{selected&&<section key={selected.id} className="document-reader" aria-label="Selected source passage"><div className="reader-toolbar"><span>EXTRACTED PASSAGE</span><span>PAGE {selected.page}</span></div><div className="reader-content"><p className="reader-department">{labels[selected.department]||selected.department}</p><h3>{documentName(selected.source)}</h3>{selected.historical&&<p className="historical-label">Historical document</p>}<p className="document-text">{selected.text}</p><footer><code>[{selected.id}]</code><span>Source text / PDF excerpt</span></footer></div></section>}</>}
      <div className="source-panel-footer">References support review; verify policy authority and dates in the source text.</div>
    </aside>
  </div>;
}
