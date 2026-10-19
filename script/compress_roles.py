# -*- coding: utf-8 -*-
# 批量压缩"角色素材"里的角色图片，并生成静态角色清单：
#   1. 遍历 角色素材/ 下所有角色文件夹里的 png/jpg/bmp
#   2. 缩小到 480px 以内并转成 webp（封面卡片足够清晰）
#   3. 压缩版放回原角色文件夹；原图移动到 image/素材原图备份/（不删，可找回）
#   4. 重新扫描所有角色文件夹，生成 角色素材/roles.js 清单
#      （双击打开 index.html 时，面板靠这份清单显示角色，无需选文件夹）
# 用法：python script/compress_roles.py
import json
import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
SRC = os.path.join(ROOT, '角色素材')
BAK = os.path.join(ROOT, 'image', '素材原图备份')
MAX_SIDE = 480   # 压缩后最长边，面板封面显示约 200px，480 足够 2 倍清晰度
QUALITY = 85     # webp 质量
EXTS = ('.png', '.jpg', '.jpeg', '.bmp')  # gif 可能是动图，保持原样不处理
IMG_EXTS = ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif')  # 可作封面的格式


def compress_images():
    total = 0
    for dirpath, _, filenames in os.walk(SRC):
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in EXTS:
                continue
            src = os.path.join(dirpath, fn)
            img = Image.open(src)
            w, h = img.size
            if max(w, h) <= MAX_SIDE:
                print(f'跳过（已足够小）: {fn} {w}x{h}')
                continue

            # 压缩并保存回角色文件夹
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            out = os.path.join(dirpath, os.path.splitext(fn)[0] + '.webp')
            img.save(out, 'WEBP', quality=QUALITY)

            # 原图移到备份目录，保持相对文件夹结构
            rel_dir = os.path.relpath(dirpath, SRC)
            bak_dir = os.path.join(BAK, rel_dir)
            os.makedirs(bak_dir, exist_ok=True)
            shutil.move(src, os.path.join(bak_dir, fn))

            print(f'{rel_dir}/{fn}: {w}x{h} -> {img.size[0]}x{img.size[1]} webp, '
                  f'{os.path.getsize(out) / 1024:.1f} KB')
            total += 1
    print(f'图片压缩完成，共 {total} 张')


def generate_manifest():
    """扫描所有角色文件夹生成 ROLE_LIST，扫描 image 文件夹生成 BG_LIST（供 file:// 模式使用）"""
    roles = []
    for name in sorted(os.listdir(SRC)):
        role_dir = os.path.join(SRC, name)
        if not os.path.isdir(role_dir):
            continue
        cover = None
        for fn in sorted(os.listdir(role_dir)):
            if os.path.splitext(fn)[1].lower() in IMG_EXTS:
                # 用 / 拼接相对路径，网页里直接可用
                cover = f'角色素材/{name}/{fn}'.replace(os.sep, '/')
                break
        roles.append({'name': name, 'cover': cover})

    # 背景素材：只扫描 image/背景图选择/ 文件夹
    bgs = []
    img_root = os.path.join(ROOT, 'image', '背景图选择')
    if os.path.isdir(img_root):
        for fn in sorted(os.listdir(img_root)):
            if os.path.splitext(fn)[1].lower() in IMG_EXTS:
                rel = os.path.relpath(os.path.join(img_root, fn), ROOT).replace(os.sep, '/')
                bgs.append(rel)

    out = os.path.join(SRC, 'roles.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// 由 script/compress_roles.py 自动生成，新增素材后重新运行脚本即可更新\n')
        f.write('window.ROLE_LIST = ')
        f.write(json.dumps(roles, ensure_ascii=False))
        f.write(';\n')
        f.write('window.BG_LIST = ')
        f.write(json.dumps(bgs, ensure_ascii=False))
        f.write(';\n')
    print(f'角色清单已生成: {out}，共 {len(roles)} 个角色、{len(bgs)} 张背景图')


def main():
    compress_images()
    generate_manifest()


if __name__ == '__main__':
    main()
