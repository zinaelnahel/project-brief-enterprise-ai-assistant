# IronStore on Next.js and Vercel

**Live:** https://ironstore-assistant-sigma.vercel.app

The production deployment uses TF-IDF retrieval and OpenAI answers. Vercel authentication protection is enabled; an authorized Vercel sign-in may be required. Local Chroma data is not needed by this deployment.

The main application is now Next.js: React frontend, server-side document retrieval, and a `/api/chat` route. Python is used only for PDF preparation and the document-inspection notebook. Vercel runs the Next.js app; it does not run Streamlit or Python.

For semantic retrieval, the app now supports **ChromaDB + OpenAI `text-embedding-3-small`**. See the [Chroma setup in README.md](README.md#chromadb-and-openai-embeddings-setup) for indexing and Cloud configuration. Vercel must connect to a hosted Chroma database; it cannot use your laptop's localhost server.

## Run locally

Install Node.js 22 or newer, then open a new terminal in this folder:

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Your existing root `.env` works with Next.js:

```env
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-6-luna
```

Do not add `NEXT_PUBLIC_` to the API key. Only the server reads it. Restart the dev server after editing environment variables. AI mode is enabled when a server key is present; TF-IDF document search (`RETRIEVAL_PROVIDER=tfidf`) works without one; Chroma semantic search needs the key to embed questions. The model must support Responses API structured outputs and be available to your account.

## Deploy to Vercel

1. Commit the new app files, including `package-lock.json` and `data/corpus.json`, to your GitHub repository. Never commit `.env`.
2. In Vercel, select **Add New → Project**, import the repository, and use the repository root as the project directory.
3. Select the **Next.js** framework and Node.js 22 or newer. The included configuration uses `npm ci` and `npm run build`.
4. For the selected deployment, set `RETRIEVAL_PROVIDER=tfidf`. Add `OPENAI_API_KEY` and `OPENAI_MODEL` to production. If switching to Chroma later, index the hosted database first and add `RETRIEVAL_PROVIDER=chroma`, `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, `CHROMA_COLLECTION`, and optionally `CHROMA_MIN_SIMILARITY`. Also add `OPENAI_API_KEY` and `OPENAI_MODEL` to the desired Vercel environments in **Settings → Environment Variables**.
5. Deploy. Environment-variable changes require a redeployment.

The corpus is bundled into the server function using Next.js file tracing. It is outside `public/`, and is never imported by a client component. Only retrieved excerpts are returned to the browser. There is no Python install or PDF extraction in the Vercel build.

This lab uses synthetic company documents. The application has no employee authentication or per-document access controls; anyone with access to an unprotected deployment can query its documents and use its configured AI service. Use Vercel deployment protection for a private lab. A real enterprise rollout needs authentication, authorization before retrieval, and persistent usage limits.

## Update documents

When `documents/documents.zip` changes, regenerate and commit the server corpus, then run `npm run index:chroma` against the deployment database before deploying:

```powershell
python -m pip install -r requirements.txt
python scripts/export_documents.py
```

`data/corpus.json` contains all 83 source PDFs as 2,451 text passages with department, filename, page, history flag, and stable citation IDs. The archive remains the source of truth. Text is preprocessed once. Chroma retrieval uses the external vector index; the optional TF-IDF mode builds an in-memory index per server instance. The TF-IDF option preserves the Python lab's baseline, department filtering, explicit historical opt-in, and unknown-question behavior.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```

Tests verify real-corpus retrieval, filtering, unknown questions, follow-ups, and citation validation. AI output is schema-constrained and checked against retrieved passage IDs; this does not prove that each claim is supported. Live model quality requires a separate check with a working key.

The UI keeps conversation history in browser memory only and sends at most six recent messages for AI answers. Clear conversation resets that memory. AI mode sends the question, recent history, and retrieved excerpts to OpenAI with `store: false`; TF-IDF document search makes no model request. Chroma document search sends the question to OpenAI for embedding; indexing sends document text for embedding.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [server file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
