import {createHash} from 'node:crypto';
import {ChromaClient, CloudClient} from 'chromadb';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const DIMENSIONS = 1536;
export class RetrievalError extends Error {
  constructor(message) { super(message); this.name = 'RetrievalError'; }
}
export function retrievalProvider(env = process.env) {
  const provider = env.RETRIEVAL_PROVIDER || 'tfidf';
  if (!['tfidf','chroma'].includes(provider)) throw new RetrievalError('Set RETRIEVAL_PROVIDER to chroma or tfidf.');
  return provider;
}
export function collectionIdentity(chunks, env = process.env) {
  const fingerprint = createHash('sha256').update(JSON.stringify({model:EMBEDDING_MODEL, dimensions:DIMENSIONS, chunks})).digest('hex');
  const prefix = env.CHROMA_COLLECTION || 'ironstore';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,80}$/.test(prefix)) throw new RetrievalError('CHROMA_COLLECTION must be a 3-81 character collection prefix starting with a letter.');
  return {name:`${prefix}-${fingerprint.slice(0,16)}`,fingerprint};
}
export function createChromaClient(env = process.env) {
  if (env.CHROMA_API_KEY) {
    if (!env.CHROMA_TENANT || !env.CHROMA_DATABASE) throw new RetrievalError('Chroma Cloud needs CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE.');
    return new CloudClient({apiKey:env.CHROMA_API_KEY,tenant:env.CHROMA_TENANT,database:env.CHROMA_DATABASE});
  }
  const url = new URL(env.CHROMA_URL || 'http://127.0.0.1:8000');
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') throw new RetrievalError('CHROMA_URL must be an HTTP(S) server origin without credentials or a path.');
  return new ChromaClient({host:url.hostname,port:Number(url.port || (url.protocol==='https:'?443:80)),ssl:url.protocol==='https:',
    tenant:env.CHROMA_TENANT || 'default_tenant',database:env.CHROMA_DATABASE || 'default_database'});
}
async function deadline(operation) {
  let timer;
  try {return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Chroma timeout')),10000);})]);}
  finally {clearTimeout(timer);}
}
export async function embedTexts(texts, {env=process.env, fetchImpl=fetch}={}) {
  if (!env.OPENAI_API_KEY) throw new RetrievalError('Semantic search requires OPENAI_API_KEY to embed the question.');
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/embeddings', {
      method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:EMBEDDING_MODEL,dimensions:DIMENSIONS,input:texts,encoding_format:'float'}),
      signal:AbortSignal.timeout(20000),
    });
  } catch { throw new RetrievalError('Could not reach OpenAI for embeddings. Check server network access and retry.'); }
  if (!response.ok) {
    if (response.status===401) throw new RetrievalError('OpenAI rejected the embedding API key. Check OPENAI_API_KEY.');
    if (response.status===429) throw new RetrievalError('OpenAI embeddings reached a usage limit. Check API credits and rate limits.');
    throw new RetrievalError('OpenAI could not generate embeddings. Check your API project model permissions.');
  }
  const body = await response.json();
  const rows = body.data?.slice().sort((a,b)=>a.index-b.index);
  if (!Array.isArray(rows) || rows.length!==texts.length || rows.some((r,i)=>r.index!==i || !Array.isArray(r.embedding) || r.embedding.length!==DIMENSIONS || r.embedding.some(v=>!Number.isFinite(v)))) throw new RetrievalError('OpenAI returned invalid embedding vectors.');
  return rows.map(r=>r.embedding);
}
export function metadataFilter({department=null,includeHistorical=false}={}) {
  const filters=[];
  if (department) filters.push({department:{$eq:department}});
  if (!includeHistorical) filters.push({historical:{$eq:false}});
  return filters.length>1?{$and:filters}:filters[0];
}
export async function semanticSearch(chunks, question, options={}, dependencies={}) {
  const env=dependencies.env || process.env;
  const {name,fingerprint}=collectionIdentity(chunks,env);
  const threshold=Number(env.CHROMA_MIN_SIMILARITY || '.25');
  if (!Number.isFinite(threshold) || threshold<0 || threshold>1) throw new RetrievalError('CHROMA_MIN_SIMILARITY must be between 0 and 1.');
  let collection;
  try {
    const client=dependencies.client || createChromaClient(env);
    collection=await deadline(client.getCollection({name,embeddingFunction:null}));
  } catch(error) {
    if(error instanceof RetrievalError) throw error;
    throw new RetrievalError('Chroma collection is unavailable. Start Chroma and run npm run index:chroma with the same environment.');
  }
  if (collection.metadata?.fingerprint!==fingerprint || collection.metadata?.embedding_model!==EMBEDDING_MODEL || collection.metadata?.index_complete!==true) throw new RetrievalError('The Chroma index is incomplete or incompatible. Run npm run index:chroma before searching.');
  const embeddings=await (dependencies.embed || embedTexts)([question],{env});
  let result;
  try {
    result=await deadline(collection.query({queryEmbeddings:embeddings,nResults:options.k || 6,
      where:metadataFilter(options),include:['distances']}));
  } catch {throw new RetrievalError('Chroma could not search the collection. Check the server connection and index configuration.');}
  // Resolve IDs against the deployed corpus: never return stale/unknown DB text.
  const byId=new Map(chunks.map(c=>[c.id,c]));
  return (result.ids?.[0] || []).flatMap((id,i)=>{
    const c=byId.get(id), distance=result.distances?.[0]?.[i];
    if (!c || typeof distance!=='number' || !Number.isFinite(distance)) return [];
    const score=1-distance;
    if(score<threshold || (options.department && c.department!==options.department) || (!options.includeHistorical && c.historical)) return [];
    return [{...c,score}];
  });
}
