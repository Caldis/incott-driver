from pathlib import Path
import shutil
root=Path(__file__).resolve().parent
site=root/'site'
if not (site/'original.html').exists():
    shutil.copyfile(site/'index.html',site/'original.html')
shutil.copyfile(site/'studio.html',site/'index.html')
print('Default entry synchronized; original.html preserved.')
