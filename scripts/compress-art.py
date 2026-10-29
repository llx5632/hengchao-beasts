# 将卡面原图压缩为 WebP，供静态部署使用（原图保留不动）。
# 用法: python scripts/compress-art.py [宽度] [质量]
from PIL import Image
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
dist = os.path.join(here, '..', 'dist')
src = os.path.join(here, '..', '..', '卡牌')
out = os.path.join(here, '..', 'deploy-art')
width = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
quality = int(sys.argv[2]) if len(sys.argv) > 2 else 85

text = open(os.path.join(dist, 'card-art.js'), encoding='utf-8').read()
pairs = re.findall(r'"([A-Za-z0-9_]+)":\s*"([^"]+)"', text)
if not pairs:
    raise SystemExit('未能解析 card-art.js')

os.makedirs(out, exist_ok=True)
for cid, rel in pairs:
    name = rel
    im = Image.open(os.path.join(src, name)).convert('RGBA')
    w, h = im.size
    if w > width:
        im = im.resize((width, round(h * width / w)), Image.LANCZOS)
    flat = Image.new('RGB', im.size, (16, 43, 41))
    flat.paste(im, mask=im.split()[3])
    target = os.path.join(out, cid + '.webp')
    flat.save(target, 'WEBP', quality=quality, method=6)
    print(f'{cid}: {round(os.path.getsize(os.path.join(src, name)) / 1024)}KB -> {round(os.path.getsize(target) / 1024)}KB')
