# IronStore Enterprise AI Assistant

A chat app that helps employees find answers in company documents. Ask about expenses, remote work, customer refunds, security, or products, then check the document passages used for the answer.

**The main app uses Next.js with TF-IDF retrieval for the Vercel deployment.** ChromaDB with OpenAI `text-embedding-3-small` remains an optional local or hosted retrieval provider. The document-inspection notebook is included.

![Original project introduction](./project-intro.png)

## 1. What the lab asked us to build

The original task was to build a conversational assistant that uses internal company knowledge to answer questions, explain procedures, and help with everyday work. Answers should be accurate and trustworthy, and the assistant should acknowledge when it does not have enough information.

The task also asked us to inspect the supplied documents and account for duplicated, inconsistent, or outdated information. It did **not** require a particular frontend framework or prohibit Next.js.

The documents are synthetic: they resemble internal company information but were generated for this lab.

## 2. What we built

We started with a Python prototype, then migrated the app to Next.js, built a research workspace, and added optional Chroma semantic retrieval. During the final cleanup, we removed the retired Streamlit app, duplicate Python assistant implementation, obsolete tests, and unused theme. Python now only handles PDF preparation and the inspection walkthrough.

The current app includes:

- **Conversational questions:** type your own question or choose a suggested topic.
- **Two answer modes:** retrieve source passages, or generate an AI answer using OpenAI. With Chroma enabled, both modes use OpenAI to embed the question; the TF-IDF option works without a key.
- **Source references:** expand the sources to read the passages, filenames, page numbers, and citation IDs.
- **Department filters:** search all documents or focus on HR, Finance, IT, Sales, Legal, Customer Support, Deliveries, or the product catalog.
- **Historical-document control:** the explicitly old catalog is excluded unless you choose to include historical documents.
- **Recent conversation context:** follow-up questions can use the previous topic.
- **Clear conversation:** start over without reloading the app.
- **A research workspace:** compact navigation, department controls, a focused conversation area, clickable citations, and a dedicated source panel with a passage reader. The layout adapts to smaller screens.
- **More useful errors:** separate messages for network problems, timeouts, rejected API keys, unavailable models, usage limits, and answer-validation failures.

## 3. Start the Next.js app

### Requirements

- Node.js **22 or newer**, with `node` and `npm` available in your terminal.
- An OpenAI API key for Chroma semantic search and AI-generated answers. The optional TF-IDF search works without a key.
- A running local Chroma server or Chroma Cloud configuration for semantic retrieval. See the Chroma setup below.

Python is needed for document preparation, the inspection notebook, or the optional local Chroma server. Vercel itself uses Node.js and connects to an external Chroma service.

### Install and run

Open a terminal in this project folder:

```powershell
npm install
npm run dev
```

Open the **Local URL printed in the terminal**. The default is usually http://localhost:3000.

During our local debugging session, we used **http://localhost:3020**. To use that same port yourself:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3020
```

Keep the terminal running while using the app. Press **Ctrl + C** to stop it. If a port is already in use, stop the process using it or choose another port.

### Set up AI answers

Create a file named `.env` in the project root, next to `package.json`. If you already have one, edit that file. You can use [.env.example](.env.example) as a template.

```env
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-6-luna
```

The key must be called **`OPENAI_API_KEY`**. Do not prefix it with `NEXT_PUBLIC_`: it belongs on the server and must not be sent to the browser. Never commit your real `.env` file.

`OPENAI_MODEL` selects the model. The example follows the lesson setting; the selected model must be available to your API project and support Responses API structured outputs.

Restart the app after changing `.env`, then select **AI assistant** in the sidebar. API use may incur charges through your OpenAI account.

## ChromaDB and OpenAI embeddings setup

Chroma stores and searches vectors; OpenAI `text-embedding-3-small` generates them. The embedding model is separate from `OPENAI_MODEL`, which writes the final answer. Both document and question embeddings use the same fixed model and 1,536 dimensions.

### Local Chroma server (Windows PowerShell)

We installed Chroma in an isolated `.chroma-venv` so its dependencies do not conflict with the Python lab environment. To recreate that setup:

```powershell
python -m venv .chroma-venv
.chroma-venv\Scripts\python -m pip install -r requirements-chroma.txt
.chroma-venv\Scripts\chroma run --path .chroma --host 127.0.0.1 --port 8000
```

Keep this terminal running. Chroma persists its local database in `.chroma/`, which is excluded from Git and Vercel uploads.

Add these settings to your existing `.env`, keeping your OpenAI key and chat model:

```env
RETRIEVAL_PROVIDER=chroma
CHROMA_URL=http://127.0.0.1:8000
CHROMA_COLLECTION=ironstore
CHROMA_MIN_SIMILARITY=0.4
```

In another terminal:

```powershell
npm run index:chroma
npm run dev -- --port 3020
```

Indexing sends the prepared document passages to OpenAI and incurs embedding usage. It runs separately from the website build. Completed batches are retained: rerun the command after a failure to resume without embedding those batches again. Our local index contains all 2,451 passages.

Collection names include a hash of the corpus and embedding configuration. Changing documents creates a new collection instead of mixing old and new records. Old collections remain until you deliberately remove them. Searches reject incomplete collections and do not silently switch to TF-IDF.

`CHROMA_MIN_SIMILARITY` is a cosine-similarity cutoff, not a confidence probability. Its default of `0.4` is a starting heuristic; tune it against realistic questions and unknown-answer examples.

### Chroma Cloud for Vercel

Create a Chroma Cloud database, then set the following server environment variables locally for indexing and in Vercel for queries:

```env
RETRIEVAL_PROVIDER=chroma
CHROMA_API_KEY=your-chroma-api-key
CHROMA_TENANT=your-tenant
CHROMA_DATABASE=your-database
CHROMA_COLLECTION=ironstore
CHROMA_MIN_SIMILARITY=0.4
```

Keep `OPENAI_API_KEY` and `OPENAI_MODEL` configured too. When `CHROMA_API_KEY` is set, the client uses Chroma Cloud and ignores `CHROMA_URL`. Run `npm run index:chroma` with those Cloud settings to populate the database before deploying. Use the same corpus and collection prefix for indexing and the deployed app. No Chroma Cloud database has been provisioned in this session.

Alternatively, set `CHROMA_URL` to a separately hosted Chroma server reachable from Vercel. Cloud and server credentials must stay server-side; never use a `NEXT_PUBLIC_` prefix.

### Check semantic retrieval

```powershell
npm test
npm run evaluate:chroma
```

`npm test` runs offline. `evaluate:chroma` requires a running, indexed database and a working OpenAI key; it tests six paraphrased policy questions and incurs a few embedding calls. These smoke checks do not replace a full evaluation of retrieval quality or answer accuracy.

To use the original search without Chroma, set `RETRIEVAL_PROVIDER=tfidf` and restart. The frontend and source references work with either retrieval provider.

References: [Chroma client/server mode](https://docs.trychroma.com/docs/run-chroma/client-server), [Chroma collection configuration](https://docs.trychroma.com/docs/collections/configure), and [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings).

## 4. How to use it

1. Choose **Document search** or **AI assistant** in the sidebar.
2. Leave the knowledge area set to **All departments**, or select a department.
3. Ask a question or click a suggested topic card.
4. Expand the sources under the reply to check the original text and page references.
5. Ask a follow-up, or click **New conversation** to start again.

Example questions:

- “How do I request expense reimbursement?”
- “What is the remote work approval process?”
- “What are the password and access requirements?”
- “How should I handle a customer refund request?”
- “What are the shipping delivery SLAs?”

| Mode | What happens | API key needed? |
| --- | --- | --- |
| Document search | Returns relevant document passages for you to read. | Yes with Chroma; no with TF-IDF |
| AI assistant | Sends relevant passages and recent conversation to OpenAI to produce an answer with citations. | Yes |

## 5. How answers work

The archive contains **83 PDFs**, prepared as **2,451 searchable passages**. The original archive is at `documents/documents.zip`; the prepared text is in `data/corpus.json`.

The request follows this path:

```text
Your question + recent conversation + search preferences
                         |
                         v
Next.js embeds the question and searches Chroma
                         |
              Up to 6 matching passages
                         |
          +--------------+--------------+
          |                             |
   Document search                 AI assistant
   returns passages          OpenAI writes a grounded reply
                                        |
                             Server checks citation IDs
          |                             |
          +--------------+--------------+
                         |
                 Reply + source passages
```

**Document preparation:** Python reads the PDFs directly from the ZIP, ignores macOS metadata files, and splits text into passages of up to 250 words with 40-word overlap. Each passage keeps its source, page, department, historical flag, and stable citation ID. Exact duplicate files and normalized passage text are suppressed.

**Search:** with `RETRIEVAL_PROVIDER=chroma`, the server embeds the question using OpenAI `text-embedding-3-small` (1,536 dimensions), then queries Chroma for similar passage vectors. Department and historical filters apply before retrieval, and result IDs are checked against the deployed corpus to preserve trustworthy filenames, text, and page references. Only hits above the configured minimum cosine similarity are returned.

The production TF-IDF/cosine search is selected with `RETRIEVAL_PROVIDER=tfidf`. This is an explicit alternative, not a silent fallback when Chroma fails. Neural embeddings can handle paraphrases, but improved overall accuracy needs a broader labeled evaluation.

**AI answers:** the server sends the question, up to six recent conversation messages, and the retrieved evidence to the OpenAI Responses API. It asks the model to answer from that evidence, acknowledge missing information, and explain disagreements between sources.

**Validation:** the model must return a structured answer. The server rejects factual claims with missing citation IDs or IDs outside the retrieved evidence. This checks that the cited passages exist; it does not prove every claim is supported, so important details still need review.

**Streaming and source review:** the interface requests an NDJSON stream with retrieval progress, followed by complete claims as they are generated. Each claim's citations are checked before display; the final answer is validated again. Responses remain marked in progress until completion. Interrupted or invalid responses are removed and the question is restored for retry. The source pane starts at the first cited passage rather than the highest retrieval score. Raw passage IDs are stripped from generated prose; citation controls are built from validated IDs. Clients without the streaming Accept header still receive JSON. The upstream protocol follows [OpenAI's streaming documentation](https://developers.openai.com/api/docs/guides/streaming-responses).

If no passages pass the search threshold, the assistant says it cannot find enough reliable information. That threshold is a search heuristic, not a confidence percentage.

## 6. Old, duplicated, and conflicting documents

- The original ZIP is kept intact as the source of truth.
- Exact duplicates are suppressed during preparation. Similar passages with different wording remain available.
- `IronStore_Old_Product_Catalog_2021.pdf` is explicitly marked historical and excluded by default.
- Other documents are not automatically declared current just because they are not marked old.
- The AI is instructed to cite disagreements and refer the employee to the responsible department rather than silently choose a policy.

This does not guarantee that every conflict will be found: the model only sees the retrieved passages. Dates, authority, and policy ownership still need to be checked against the source documents.

## 7. Project files

| File or folder | Purpose |
| --- | --- |
| `app/page.tsx` | Loads the main Next.js page. |
| `app/components/chat.tsx` | Chat interface, settings, suggested questions, and source panels. |
| `app/globals.css` | Current research workspace layout and responsive styles. |
| `app/api/chat/route.ts` | Server endpoint for search, OpenAI requests, validation, and errors. |
| `lib/corpus.ts` | Loads and caches the server-only document library. |
| `lib/retrieval.mjs` | TF-IDF search, follow-up context, and citation checks. |
| `lib/streaming.mjs` | Incremental response decoding and citation-checked claim streaming. |
| `lib/chroma.mjs` | OpenAI embeddings, Chroma connection, collection identity, and semantic retrieval. |
| `scripts/index-chroma.mjs` | Resumable document embedding and Chroma indexing. |
| `scripts/evaluate-chroma.mjs` | Live paraphrase-retrieval checks (uses embedding API calls). |
| `tests/chroma.test.mjs` | Offline tests for embeddings, metadata filters, and semantic results. |
| `data/corpus.json` | Prepared passages bundled with the deployed server. |
| `documents/documents.zip` | Original synthetic PDF collection. |
| `scripts/export_documents.py` | Regenerates the prepared document data. |
| `scripts/pdf_documents.py` | Single Python PDF ingestion implementation. |
| `lib/types.ts` | Shared source and passage types for server and frontend. |
| `tests/retrieval.test.mjs` | Tests for the Next.js app's retrieval logic. |
| `tests/streaming.test.mjs` | Stream fragmentation, early claims, interrupted responses, source selection, and citation formatting. |
| `next.config.mjs` | Includes the document data in the server function bundle. |
| `vercel.json` / `.vercelignore` | Vercel build settings and upload exclusions. |
| `.env.example` | Example server environment variables. |
| `IronStore_Lab_Solution.ipynb` | Step-by-step lab walkthrough. |

**To change the website, edit the files inside `app/`.** The retired Streamlit version has been removed.

## 8. Deploy to Vercel

1. Commit the Next.js app, `package-lock.json`, and `data/corpus.json` to your GitHub repository. Keep `.env` out of Git.
2. In Vercel, select **Add New → Project** and import the repository.
3. Use the repository root as the project directory, choose **Next.js**, and select Node.js 22 or newer.
4. Add `OPENAI_API_KEY` and `OPENAI_MODEL` under **Settings → Environment Variables** for the environments you need.
5. Deploy. The included configuration runs `npm ci` and `npm run build`.

The Vercel app uses the prepared JSON data. Only the optional Chroma provider needs an external Chroma database. It does not need to install Python, run a local Chroma server or Streamlit, or extract PDFs during deployment. A Vercel function cannot connect to the Chroma server on your laptop through `localhost`. The corpus stays outside `public/` and is read on the server; only retrieved excerpts are returned to the browser.

After changing code, deploy the new version to see it on Vercel. After changing Vercel environment variables, redeploy as well. A local `.env` file does not automatically configure Vercel.

**Production deployment:** [ironstore-assistant-sigma.vercel.app](https://ironstore-assistant-sigma.vercel.app). This deployment uses TF-IDF retrieval with OpenAI-generated answers, and Vercel authentication protection is enabled. Sign in with your authorized Vercel account if prompted. Chroma remains available as an optional provider. See [VERCEL.md](VERCEL.md) for deployment details.

## 9. Update the document library

If you replace or update `documents/documents.zip`, regenerate the prepared data before deploying:

```powershell
python -m pip install -r requirements.txt
python scripts/export_documents.py
```

Run `npm run index:chroma` against your target Chroma database after updating the corpus. Commit the updated `data/corpus.json`, restart the local server, and redeploy. Python 3.11 or newer is recommended for the preparation and original lab tools.

## 10. Checks we ran

```powershell
npm test
npm run typecheck
npm run build
```

The 27 JavaScript tests passed. They cover embedding request formatting, filter preservation, corpus-version checks, incomplete-index rejection, similarity filtering, safe error messages, exported document counts and IDs, representative policy questions, historical exclusion, department filtering, unrelated queries across scopes, follow-up context, and rejection of missing or fabricated citations. Streaming tests also cover fragmented UTF-8 and SSE, early claim delivery, cancellation, interrupted responses, citation artifact removal, and selection of the first cited passage.

We also verified the running homepage and API: document search returns page references, unknown questions produce an acknowledgment of missing information, and invalid requests are rejected. The server function's file trace includes the corpus for deployment. With Chroma enabled, all six live paraphrase checks retrieved the expected policy in the top six results, and both document-search and AI endpoints returned successful responses with HR filtering preserved.

After fixing the local network restriction, a live AI request returned HTTP 200 with an answer and six source passages. This confirms that the configured integration worked for that request; it is not a full evaluation of answer accuracy. Those earlier Python prototype checks were superseded by the current Next.js suite. After extracting PDF ingestion, regeneration produced a byte-for-byte identical corpus.

To build and run the production app locally:

```powershell
npm run build
npm start
```

## 11. Troubleshooting

| Problem | What to check |
| --- | --- |
| You still see the old interface | Open the current Next.js terminal URL or the latest Vercel deployment and hard-refresh. |
| Local design changes are not visible | Hard-refresh with **Ctrl + Shift + R**. If using `npm start`, rebuild first. If viewing Vercel, deploy the updated code. |
| `npm` or `node` is not recognized | Install Node.js 22 or newer and open a new terminal so PATH updates take effect. |
| AI mode is unavailable | Set `OPENAI_API_KEY` in the root `.env` and restart, or set it in Vercel and redeploy. |
| The server cannot connect to OpenAI | Check outbound network access, firewall, proxy, or execution restrictions. TF-IDF search can be used by setting `RETRIEVAL_PROVIDER=tfidf` and restarting. |
| OpenAI rejects the API key | Check the key in the server environment and restart or redeploy. |
| The configured model is unavailable | Check `OPENAI_MODEL` and your API project's model access. |
| Usage-limit error | Check API credits and rate limits; retry later or use document search. |
| Answer does not pass source validation | The reply had an invalid structure or citation references. Retry or inspect the document-search results. |
| Document library cannot be loaded | Ensure `data/corpus.json` exists and is included in the deployment. |
| `ModuleNotFoundError: No module named 'pypdf'` | This concerns the Python tools. Install `requirements.txt` using the same Python environment that runs them. |

During our debugging session, the generic “Unable to produce a validated answer” message was caused by the local server running in a restricted process. Its OpenAI connection failed with `EACCES`. Restarting the server with approved network access fixed the request. We then separated connection errors from validation errors so the interface explains the problem more clearly.

## 12. Privacy and practical limits

The API key is read only on the server. Conversation history lives in the current browser session's memory and is cleared by **New conversation** or a page reload; it is not saved to a chat database.

In AI mode, the question, recent conversation, and retrieved text are sent to OpenAI with `store: false`. This setting is not a promise of zero retention across every part of the service. With Chroma enabled, document-search mode sends the question to OpenAI for embedding, but makes no answer-generation request. Initial indexing sends the document text to OpenAI to generate embeddings and stores text, vectors, and metadata in Chroma. With TF-IDF selected, document-search mode makes no OpenAI request. Error logs record failure categories rather than API keys, question text, or evidence.

This is a lab prototype with synthetic documents. It does not yet have employee sign-in, per-document permissions, persistent usage limits, or a full answer-quality evaluation. Department selection is a search filter, not an access-control boundary. An unprotected deployment lets its visitors query the library and use the configured AI service; use deployment protection for a private lab.

The AI has no tools for submitting claims, changing accounts, or performing company actions. Documents are treated as untrusted evidence, with instructions to ignore embedded commands. These measures reduce risk but do not guarantee protection against prompt injection or unsupported answers.

## 13. Learning materials and cleanup

The work draws on the [AI engineering lesson templates](https://github.com/zinaelnahel/ai_eng_lesson_templates): vector similarity, LLM API requests, prompting, conversation history, structured outputs, and prompt-injection awareness.

The [document-inspection notebook](IronStore_Lab_Solution.ipynb) uses `scripts/pdf_documents.py`, the same loader used by the exporter. There is one current web app and one answer-generation endpoint. The retired Streamlit interface, its separate Python retrieval/generation code, old Python tests, obsolete solution guide, and unused colorful theme were removed. TF-IDF and Chroma remain intentional alternative retrieval providers.

- [Vercel setup guide](VERCEL.md)
- [OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs)
