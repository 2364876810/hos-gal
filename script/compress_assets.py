# -*- coding: utf-8 -*-
"""
批量压缩角色素材和背景图，解决页面加载卡顿。

用法:
    python script/compress_assets.py            # 压缩所有角色图 + 背景图
    python script/compress_assets.py --max-w 1200 --quality 75

策略:
  - 宽度 > MAX_WIDTH 时等比缩放到 MAX_WIDTH
  - 透明 PNG 保留 PNG（用 optimize=True），不透明的转 JPEG（质量 QUALITY）
  - 保留原文件名（覆盖）；备份原文件到 .bak/ 目录
"""

import os
import sys
import shutil
import argparse
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROLES_DIR = os.path.join(BASE_DIR, "角色素材")
BG_DIR = os.path.join(BASE_DIR, "image", "背景图选择")
KANBAN_DIR = os.path.join(BASE_DIR, "image", "看板娘")
IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def compress_file(path: str, max_w: int, quality: int) -> tuple:
    """压缩单张图片。返回 (原大小KB, 新大小KB)。"""
    original_size = os.path.getsize(path)
    try:
        with Image.open(path) as img:
            img.load()
            w, h = img.size
            alpha = has_alpha(img)

            # 缩放
            if w > max_w:
                new_h = int(h * max_w / w)
                img = img.resize((max_w, new_h), Image.LANCZOS)
                w, h = img.size

            # 根据是否有透明通道决定输出格式
            if alpha:
                # 透明图保留 PNG
                out_path = os.path.splitext(path)[0] + ".png"
                img.save(out_path, "PNG", optimize=True)
            else:
                # 不透明转 JPEG（质量 quality）
                out_path = os.path.splitext(path)[0] + ".jpg"
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(out_path, "JPEG", quality=quality, optimize=True, progressive=True)

            # 如果扩展名变了，删除原文件
            if os.path.normcase(out_path) != os.path.normcase(path):
                if os.path.exists(path):
                    os.remove(path)

            new_size = os.path.getsize(out_path)
            # 压缩后反而更大 → 还原原文件
            if new_size >= original_size:
                os.remove(out_path)
                shutil.copy2(os.path.join(bak_root, os.path.relpath(path, BASE_DIR)), path)
                new_size = original_size
            return original_size / 1024, new_size / 1024
    except Exception as e:
        print(f"  [跳过] {os.path.basename(path)}: {e}")
        return original_size / 1024, original_size / 1024


def backup(path: str, bak_root: str) -> str:
    """把原文件备份到 .bak/ 目录（保持相对路径结构）。"""
    rel = os.path.relpath(path, BASE_DIR)
    bak_path = os.path.join(bak_root, rel)
    os.makedirs(os.path.dirname(bak_path), exist_ok=True)
    if not os.path.exists(bak_path):
        shutil.copy2(path, bak_path)
    return bak_path


def compress_dir(dir_path: str, max_w: int, quality: int, bak_root: str):
    if not os.path.isdir(dir_path):
        print(f"[跳过] 目录不存在: {dir_path}")
        return
    total_old = total_new = 0
    file_count = 0
    for root, _, files in os.walk(dir_path):
        for fn in files:
            if os.path.splitext(fn)[1].lower() not in IMG_EXTS:
                continue
            full = os.path.join(root, fn)
            backup(full, bak_root)
            old_kb, new_kb = compress_file(full, max_w, quality)
            ratio = (1 - new_kb / old_kb) * 100 if old_kb > 0 else 0
            print(f"  {fn}: {old_kb:.1f}KB → {new_kb:.1f}KB (-{ratio:.0f}%)")
            total_old += old_kb
            total_new += new_kb
            file_count += 1
    print(f"  小计: {file_count} 个文件, {total_old:.1f}KB → {total_new:.1f}KB "
          f"(-{(1 - total_new/total_old)*100:.0f}%)\n" if total_old else "")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-w", type=int, default=1200, help="最大宽度(px)")
    parser.add_argument("--quality", type=int, default=78, help="JPEG 质量(1-100)")
    args = parser.parse_args()

    bak_root = os.path.join(BASE_DIR, ".bak")
    print(f"备份目录: {bak_root}")
    print(f"参数: max_w={args.max_w}, quality={args.quality}\n")

    for label, d in [("角色素材", ROLES_DIR), ("背景图", BG_DIR), ("看板娘", KANBAN_DIR)]:
        print(f"=== {label} ===")
        compress_dir(d, args.max_w, args.quality, bak_root)

    print("压缩完成！原文件已备份到 .bak/")


if __name__ == "__main__":
    main()
