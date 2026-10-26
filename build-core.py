"""Extract the original transport verbatim; never execute the vendor UI."""
from pathlib import Path
import hashlib, json
root = Path(__file__).resolve().parent
source = (root/'site/js/chunk-v1003.js').read_text(encoding='utf-8')
start = source.index('class RetObj')
end = source.index('async function _nfmekzxlqota', start)
core = source[start:end]
target = root/'site/core'
target.mkdir(exist_ok=True)
(target/'incott-original.js').write_text('// Extracted verbatim from js/chunk-v1003.js. See core-provenance.json.\n'+core+'\n', encoding='utf-8')
(root/'core-provenance.json').write_text(json.dumps({'source':'site/js/chunk-v1003.js','source_sha256':hashlib.sha256((root/'site/js/chunk-v1003.js').read_bytes()).hexdigest(),'extracted_sha256':hashlib.sha256(core.encode()).hexdigest(),'upstream_commit':'7b8a4387df20cb7c038b0d2901e7cad72e5873a9','changes_to_extracted_code':[]},indent=2),encoding='utf-8')
print('Extracted original hardware class:',len(core),'characters')
