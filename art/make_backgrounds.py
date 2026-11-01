"""处理桌面/手机背景图：降到合适尺寸、轻微降低对比，便于做半透明底图。"""
import os

from PIL import Image, ImageEnhance

SRC_DESKTOP = r"C:\Users\HeHep\.dsh\attachments\v1\objects\7f\7f30eb9f4ea14497eb8af1d4465d8d28a199d2cf9aa345afa9a4ebf6ff608e5e"
SRC_MOBILE = r"C:\Users\HeHep\.dsh\attachments\v1\objects\18\18b3246d36583ccc99d7d2f9222beb77ad3056221920e91f29458b1e9f9b16ca"


def prep(src, out_paths, size, quality=80, brightness=1.0, color=1.0):
    img = Image.open(src).convert("RGB")
    print(f"  {os.path.basename(out_paths[0])}: 原图 {img.size}")
    img = img.resize(size, Image.LANCZOS)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if color != 1.0:
        img = ImageEnhance.Color(img).enhance(color)
    for path in out_paths:
        img.save(path, quality=quality, optimize=True, progressive=True)
        print(f"    写出 {path}  {os.path.getsize(path)//1024} KB")


for base in (r"D:\DSH\work\deploy\site\assets", r"D:\DSH\work\chat\static"):
    os.makedirs(base, exist_ok=True)
    print(f"==> {base}")
    # 桌面：1920x1080 足够，压小一点
    prep(
        SRC_DESKTOP,
        [os.path.join(base, "bg-desktop.jpg")],
        (1920, 1080),
        quality=78,
        brightness=1.06,
        color=0.96,
    )
    # 手机：竖版 1080x1920
    prep(
        SRC_MOBILE,
        [os.path.join(base, "bg-mobile.jpg")],
        (1080, 1920),
        quality=78,
        brightness=1.06,
        color=0.96,
    )

print("\n完成")
