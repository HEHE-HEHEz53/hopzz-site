"""从鲸鱼娘插画生成头像/图标，并提取主色调。"""
import json
import os
from collections import Counter

from PIL import Image, ImageDraw, ImageFilter

SRC = r"C:\Users\HeHep\.dsh\attachments\v1\objects\97\97fb591137f99628ed1582ede1f3f14ec279364c9086408c7cb63be0ecce4ac6"
OUT = r"D:\DSH\work\art"
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert("RGB")
w, h = img.size
print("原图尺寸:", w, h)

# ---------- 1. 头像：裁头部+肩部 ----------
# 人物脸大约在画面偏左上的位置，裁一个正方形
side = int(min(w, h) * 0.60)
cx = int(w * 0.42)
cy = int(h * 0.30)
left = max(0, min(w - side, cx - side // 2))
top = max(0, min(h - side, cy - side // 2))
crop = img.crop((left, top, left + side, top + side))
print("头像裁剪框:", (left, top, left + side, top + side))

crop.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "avatar-512.jpg"), quality=92, optimize=True)
crop.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "avatar-256.jpg"), quality=90, optimize=True)
crop.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "avatar-256.webp"), quality=90, method=6)
print("已生成 avatar-512.jpg / avatar-256.jpg / avatar-256.webp")

# ---------- 2. 图标 ----------
for size in (180, 64, 32):
    crop.resize((size, size), Image.LANCZOS).save(
        os.path.join(OUT, f"icon-{size}.png"), optimize=True
    )
# 多尺寸 ico
ico_src = crop.resize((256, 256), Image.LANCZOS)
ico_src.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("已生成 icon-180/64/32.png 与 favicon.ico")

# ---------- 3. 首页用的艺术照：右下角柔化、整体偏冷色 ----------
hero = img.copy()
hero = hero.resize((1400, 1400), Image.LANCZOS)
# 轻微提亮 + 降饱和一点，作为背景更耐看
from PIL import ImageEnhance

hero = ImageEnhance.Brightness(hero).enhance(1.04)
hero = ImageEnhance.Color(hero).enhance(0.95)
hero.save(os.path.join(OUT, "hero-1400.jpg"), quality=88, optimize=True)

# 方形的柔和版（给首页卡片用）
soft = img.resize((900, 900), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
soft.save(os.path.join(OUT, "art-soft-900.jpg"), quality=86, optimize=True)
print("已生成 hero-1400.jpg / art-soft-900.jpg")

# ---------- 4. 提取主色调 ----------
small = img.resize((160, 160), Image.LANCZOS)
q = small.quantize(colors=12, method=Image.MEDIANCUT).convert("RGB")
counts = Counter(q.getdata())
print("\n=== 主色（按占比）===")
palette = []
for color, count in counts.most_common(12):
    pct = count / (160 * 160) * 100
    hexv = "#%02x%02x%02x" % color
    palette.append((hexv, round(pct, 1)))
    print(f"  {hexv}  {pct:5.1f}%")

# 区分亮色/暗色，挑几个代表性颜色
lums = [(0.299 * r + 0.587 * g + 0.114 * b, (r, g, b), p)
        for (r, g, b), p in counts.most_common(12)]
lums.sort()
print("\n最暗三个:", ["#%02x%02x%02x" % c for _, c, _ in lums[:3]])
print("最亮三个:", ["#%02x%02x%02x" % c for _, c, _ in lums[-3:]])

with open(os.path.join(OUT, "palette.json"), "w", encoding="utf-8") as fh:
    json.dump({"palette": palette}, fh, ensure_ascii=False, indent=2)
print("\n已保存 palette.json")
