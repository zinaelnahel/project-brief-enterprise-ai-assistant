"""PDF ingestion shared by the corpus exporter and lab walkthrough."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import io
from pathlib import Path
import re
import zipfile

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'documents' / 'documents.zip'


@dataclass(frozen=True)
class Chunk:
    id: str
    source: str
    page: int
    department: str
    historical: bool
    text: str


def load_documents(archive: Path = ARCHIVE):
    """Read PDF bytes directly; never extract untrusted ZIP paths."""
    chunks, inventory, seen = [], [], {}
    with zipfile.ZipFile(archive) as z:
        for name in sorted(z.namelist()):
            if not name.lower().endswith('.pdf') or '__MACOSX' in name:
                continue
            data = z.read(name)
            digest = hashlib.sha256(data).hexdigest()
            if digest in seen:
                inventory.append({'source': name, 'duplicate_of': seen[digest]})
                continue
            seen[digest] = name
            pages = PdfReader(io.BytesIO(data)).pages
            historical = bool(re.search(r'old|archive|deprecated|obsolete', name, re.I))
            department = Path(name).parent.name
            texts = [re.sub(r'[ \t]+', ' ', p.extract_text() or '').strip() for p in pages]
            inventory.append({'source': name, 'pages': len(pages), 'characters': sum(map(len, texts)),
                              'department': department, 'historical': historical,
                              'empty_pages': [i+1 for i,t in enumerate(texts) if not t]})
            for page, text in enumerate(texts, 1):
                # Keep page provenance and 40-word overlap for boundary context.
                words = text.split()
                for start in range(0, len(words), 210):
                    part = ' '.join(words[start:start+250])
                    normalized = hashlib.sha256(part.lower().encode()).hexdigest()
                    # Include page/source in IDs; suppress exact repeated text globally.
                    if normalized in seen:
                        continue
                    seen[normalized] = name
                    cid = hashlib.sha256(f'{name}:{page}:{start}'.encode()).hexdigest()[:12]
                    chunks.append(Chunk(cid, name, page, department, historical, part))
    if not chunks:
        raise ValueError('No extractable PDF text found. Scanned PDFs need OCR.')
    return chunks, inventory
