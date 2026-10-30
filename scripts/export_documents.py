"""Prepare the server-only corpus; rerun when documents.zip changes."""
import json
from dataclasses import asdict

from pdf_documents import load_documents, ROOT

chunks, inventory = load_documents()
target = ROOT / 'data' / 'corpus.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps({'chunks': [asdict(c) for c in chunks], 'inventory': inventory},
                             ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Exported {len(inventory)} PDFs / {len(chunks)} passages to {target.name}')
