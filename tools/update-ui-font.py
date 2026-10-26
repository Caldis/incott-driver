"""Download a self-hosted variable UI subset; runtime never contacts Google.

Run after adding Chinese interface copy. No Python packages are required.
The unmodified font is served by Google Fonts under OFL-1.1.
"""
from pathlib import Path
import hashlib
import json
import re
import urllib.parse
import urllib.request

root = Path(__file__).resolve().parents[1]
sources = ['site/studio.html', 'site/studio.js', 'site/core/adapter.js']
text = ''.join((root / name).read_text(encoding='utf-8') for name in sources)
characters = ''.join(sorted(set(
    re.findall(r'[\u2000-\u27ff\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]', text)
    + [chr(code) for code in range(32, 127)]
)))
css_url = 'https://fonts.googleapis.com/css2?' + urllib.parse.urlencode({
    'family': 'Noto Sans SC:wght@100..900', 'display': 'swap', 'text': characters
})
request = urllib.request.Request(css_url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
})
with urllib.request.urlopen(request, timeout=30) as response:
    css = response.read().decode()
font_url = re.search(r'url\(([^)]+)\)', css)[1]
with urllib.request.urlopen(font_url, timeout=30) as response:
    data = response.read()
assert data[:4] == b'wOF2', 'Expected WOFF2'
font_dir = root / 'site/fonts'
font_dir.mkdir(exist_ok=True)
(font_dir / 'incott-ui-v1.woff2').write_bytes(data)
(font_dir / 'source.json').write_text(json.dumps({
    'family': 'Noto Sans SC', 'kind': 'variable subset for UI strings and ASCII',
    'source': 'https://fonts.google.com/noto/specimen/Noto+Sans+SC',
    'license': 'OFL-1.1', 'download_url': font_url,
    'sha256': hashlib.sha256(data).hexdigest(), 'characters': characters,
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Saved {len(data)} bytes for {len(characters)} characters; weights 100–900.')
