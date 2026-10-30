import { getCorpus } from '../lib/corpus';
import Chat from './components/chat';

export const runtime = 'nodejs';
export default function Home() {
  const {documentCount, departments} = getCorpus();
  return <Chat documentCount={documentCount} departments={departments} aiAvailable={Boolean(process.env.OPENAI_API_KEY)} semanticSearchEnabled={process.env.RETRIEVAL_PROVIDER === 'chroma'} />;
}
export const dynamic = 'force-dynamic';
