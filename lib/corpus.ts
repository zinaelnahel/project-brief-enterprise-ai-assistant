import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Index } from './retrieval.mjs';
import type {Chunk} from './types';

type Corpus = {chunks: Chunk[]; inventory: {source: string; department?: string}[]};
let cached: {chunks: Chunk[]; documentCount: number; departments: string[]} | undefined;
let lexicalIndex: Index | undefined;
export function getLexicalIndex() {
  return lexicalIndex ??= new Index(getCorpus().chunks);
}
export function getCorpus() {
  if (!cached) {
    const corpus: Corpus = JSON.parse(readFileSync(path.join(process.cwd(), 'data/corpus.json'), 'utf8'));
    cached = {chunks: corpus.chunks, documentCount: corpus.inventory.length,
      departments: [...new Set(corpus.chunks.map(c => c.department))].sort()};
  }
  return cached;
}
