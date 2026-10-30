import nextEnv from '@next/env';
import {readFileSync} from 'node:fs';
import {collectionIdentity, createChromaClient, embedTexts, EMBEDDING_MODEL, DIMENSIONS} from '../lib/chroma.mjs';

nextEnv.loadEnvConfig(process.cwd());
const {chunks}=JSON.parse(readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const {name,fingerprint}=collectionIdentity(chunks);
try {
  const client=createChromaClient();
  const collection=await client.getOrCreateCollection({name,embeddingFunction:null,
    configuration:process.env.CHROMA_API_KEY?{spann:{space:'cosine'}}:{hnsw:{space:'cosine'}},
    metadata:{fingerprint,embedding_model:EMBEDDING_MODEL,dimensions:DIMENSIONS,index_complete:false}});
  if(collection.metadata?.fingerprint!==fingerprint || collection.metadata?.embedding_model!==EMBEDDING_MODEL) throw new Error('Collection identity mismatch; use a different CHROMA_COLLECTION prefix.');
  console.log(`Indexing ${chunks.length} passages with ${EMBEDDING_MODEL} into ${name}`);
  for(let offset=0;offset<chunks.length;offset+=64) {
    const batch=chunks.slice(offset,offset+64);
    const existing=await collection.get({ids:batch.map(c=>c.id),include:[]});
    const ids=new Set(existing.ids);
    const pending=batch.filter(c=>!ids.has(c.id));
    if(pending.length) {
      const embeddings=await embedTexts(pending.map(c=>`${c.source.split('/').pop().replaceAll('_',' ')}\n${c.text}`));
      await collection.upsert({ids:pending.map(c=>c.id),embeddings,documents:pending.map(c=>c.text),
        metadatas:pending.map(({id,text,...metadata})=>metadata)});
    }
    console.log(`${Math.min(offset+64,chunks.length)}/${chunks.length} passages ready`);
  }
  if(await collection.count()!==chunks.length) throw new Error('Unexpected collection size; choose a new CHROMA_COLLECTION prefix.');
  await collection.modify({metadata:{...collection.metadata,index_complete:true}});
  console.log('Index complete. Set RETRIEVAL_PROVIDER=chroma and restart the Next.js app.');
} catch(error) {
  // SDK errors can contain HTTP details; don't print credentials or document payloads.
  console.error('Indexing failed. Check Chroma connectivity, OpenAI credits, and configuration. Completed batches are retained; rerun to resume.');
  console.error('Error category:',error instanceof Error?error.name:'UnknownError');
  if(error?.name==='RetrievalError') console.error(error.message);
  process.exitCode=1;
}
