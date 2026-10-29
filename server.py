# -*- coding: utf-8 -*-
"""
极简后端 — 只用 Python 标准库，无需 pip install

启动:
    python server.py
然后浏览器访问:  http://127.0.0.1:8080/
"""

import os
import sys
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import body


MIME_MAP = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".mp4":  "video/mp4",
    ".txt":  "text/plain; charset=utf-8",
    ".svg":  "image/svg+xml",
}

ROLES_DIR = os.path.join(BASE_DIR, "角色素材")
BG_DIR = os.path.join(BASE_DIR, "image", "背景图选择")
IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")


def scan_assets():
    """实时扫描角色素材和背景图，新增文件后刷新页面即可生效。"""
    roles = []
    if os.path.isdir(ROLES_DIR):
        for name in sorted(os.listdir(ROLES_DIR)):
            role_dir = os.path.join(ROLES_DIR, name)
            if not os.path.isdir(role_dir):
                continue
            images = []  # 角色文件夹下所有图片的相对路径
            for fn in sorted(os.listdir(role_dir)):
                if os.path.splitext(fn)[1].lower() in IMG_EXTS:
                    images.append(f"角色素材/{name}/{fn}")
            cover = images[0] if images else None  # 角色选择面板封面：排序第一张
            roles.append({"name": name, "cover": cover, "images": images})

    backgrounds = []
    if os.path.isdir(BG_DIR):
        for fn in sorted(os.listdir(BG_DIR)):
            if os.path.splitext(fn)[1].lower() in IMG_EXTS:
                backgrounds.append(f"image/背景图选择/{fn}")

    return {"roles": roles, "backgrounds": backgrounds}


class Handler(BaseHTTPRequestHandler):
    # ---------- 静态文件 ----------
    def do_GET(self):
        path = self.path.split("?")[0]  # 去掉 query string
        if path == "/":
            path = "/index.html"

        # ---------- /api/roles：实时扫描素材目录 ----------
        if path == "/api/roles":
            self._json(200, scan_assets())
            return

        # ---------- /api/affection：取当前全局好感度 ----------
        if path == "/api/affection":
            self._json(200, {"affection": body.get_affection()})
            return

        # 安全：禁止 .. 穿越
        safe_path = os.path.normpath(path.lstrip("/"))
        if safe_path.startswith(".."):
            self.send_error(403); return

        full = os.path.join(BASE_DIR, safe_path)
        if not os.path.isfile(full):
            self.send_error(404, "Not Found: " + path); return

        ext = os.path.splitext(full)[1].lower()
        mime = MIME_MAP.get(ext, "application/octet-stream")

        try:
            with open(full, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            # 禁用缓存：文件更新后浏览器刷新即可拿到最新版
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, str(e))

    # ---------- /api/chat & /api/affection ----------
    def do_POST(self):
        path = self.path.split("?")[0]

        # ---------- /api/affection：自定义好感度 ----------
        if path == "/api/affection":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b""
            try:
                data = json.loads(raw.decode("utf-8")) if raw else {}
            except Exception:
                self._json(400, {"error": "请求体不是合法 JSON"}); return

            action = (data.get("action") or "set").strip()
            try:
                if action == "reset":
                    v = body.reset_affection()
                elif action == "change":
                    delta = int(data.get("delta", 0))
                    v = body.change_affection(delta)
                else:  # set 或其他
                    v = body.set_affection(int(data.get("value", body.get_affection())))
                self._json(200, {"affection": v})
            except ValueError as e:
                self._json(400, {"error": "参数错误: " + str(e)})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return

        if path != "/api/chat":
            self.send_error(404); return

        # 读取 body
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._json(400, {"error": "请求体不是合法 JSON"})
            return

        user_text = (data.get("user_text") or "").strip()
        role_name = (data.get("role_name") or "").strip() or None

        if not user_text:
            self._json(400, {"error": "user_text 不能为空"})
            return

        result = body.process_user_input(user_text, role_name)
        self._json(200, result)

    # 工具：返回 JSON
    def _json(self, code, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # 让终端日志更清爽
    def log_message(self, fmt, *args):
        print(f"[{self.command}] {args[0]}")


if __name__ == "__main__":
    HOST, PORT = "0.0.0.0", 8080
    server = HTTPServer((HOST, PORT), Handler)
    print(f"后端已启动 →  http://127.0.0.1:{PORT}/  (Ctrl+C 退出)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
        server.server_close()
