# -*- coding: utf-8 -*-
"""
body.py — 角色对话处理模块

被 Flask 后端 server.py 作为模块 import 调用。
职责：
  1. 接收用户输入文本并记录
  2. 读取角色设定作为 system 提示词的一部分
  3. 注入当前全局好感度，引导 AI 以 <love:+N> / <love:-N> 格式输出变化
  4. 调用千问 MaaS（OpenAI 兼容接口）
  5. 解析回复中的 <love:±N> 标签，更新好感度并剥离标签返回给前端
"""

import os
import re
import json
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AFFECTION_FILE = os.path.join(BASE_DIR, ".affection")

# ================== AI 接口配置（千问 MaaS · OpenAI 兼容模式） ==================
API_BASE_URL = "https://maas.qianwenaiapi.com/compatible-mode/v1"
API_KEY = "sk-ws-H.YHEPRIM.O259.MEYCIQCY24YYxDuQuuCSPZ9XXHqhZ1sXx_rgmDmqvwzY7k3GtAIhAL5a-HDdISeBJ4yCmByPe1dP2-RlZMV47mD8l_rymV4x"  # 千问 MaaS API Key
API_MODEL = "qwen-plus" # 模型名，按控制台实际开通的模型修改
API_TIMEOUT = 60        # 请求超时（秒）

# 每个角色独立保留最近对话作为上下文（进程存活期间有效）
role_sessions = {}
MAX_SESSION_MESSAGES = 20  # 发送给模型的最大历史消息条数

# 内存中的对话历史（进程存活期间有效，仅用于记录/调试）
chat_history = []

# ================== 全局好感度（跨角色共享） ==================
AFFECTION_MIN = 0
AFFECTION_MAX = 100
AFFECTION_DEFAULT = 50

_reason_cache = None  # 避免每次 import 都读文件


def load_affection() -> int:
    """从文件读取好感度；文件不存在或损坏时返回默认值。"""
    try:
        with open(AFFECTION_FILE, "r", encoding="utf-8") as f:
            v = int(f.read().strip())
        return max(AFFECTION_MIN, min(AFFECTION_MAX, v))
    except Exception:
        return AFFECTION_DEFAULT


def save_affection(v: int) -> None:
    try:
        with open(AFFECTION_FILE, "w", encoding="utf-8") as f:
            f.write(str(v))
    except Exception as e:
        print(f"[body.py] 保存好感度失败: {e}")


def get_affection() -> int:
    """获取当前好感度。"""
    global _reason_cache
    if _reason_cache is None:
        _reason_cache = load_affection()
    return _reason_cache


def set_affection(v: int) -> int:
    """设置好感度（自动夹紧到 [0, 100]），并持久化。返回最终值。"""
    global _reason_cache
    v = max(AFFECTION_MIN, min(AFFECTION_MAX, int(v)))
    _reason_cache = v
    save_affection(v)
    return v


def change_affection(delta: int) -> int:
    """在当前好感度基础上增减 delta，返回新值。"""
    return set_affection(get_affection() + int(delta))


def reset_affection() -> int:
    """重置好感度为默认值 50。"""
    return set_affection(AFFECTION_DEFAULT)


# ================== AI 接口 ==================

def call_chat_api(messages: list) -> str:
    """
    调用千问 MaaS 的 /chat/completions 接口，返回模型回复文本。
    只用标准库 urllib 无需 pip 安装任何包。
    """
    url = API_BASE_URL.rstrip("/") + "/chat/completions"
    payload = json.dumps({"model": API_MODEL, "messages": messages}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


# ================== 角色设定 ==================

def load_role_config(role_name: str) -> str:
    """读取指定角色文件夹下的角色设定.txt，找不到或为空时返回空串。"""
    if not role_name:
        return ""
    txt_path = os.path.join(BASE_DIR, "角色素材", role_name, "角色设定.txt")
    try:
        with open(txt_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f"[body.py] 角色设定文件不存在: {txt_path}")
        return ""
    except Exception as e:
        print(f"[body.py] 读取角色设定失败: {e}")
        return ""


def get_session(role_name: str) -> list:
    """取（或初始化）某个角色的会话上下文列表。"""
    return role_sessions.setdefault(role_name or "default", [])


# ================== 好感度标签解析 ==================

# 匹配 AI 回复中的 <love:+5> / <love:-3> / <love:0>
_LOVE_TAG_RE = re.compile(r"<love\s*:\s*([+-]?\d+)\s*>")


def parse_love_tag(raw_reply: str) -> tuple:
    """
    从 AI 回复中剥离 <love:±N> 标签并解析变化值。

    返回 (clean_reply, delta)：
      clean_reply — 去掉所有 <love:...> 标签后的回复文本
      delta       — 累加的好感度变化（int），如果没输出标签则为 0
    """
    delta = 0
    def _sub(m):
        nonlocal delta
        try:
            delta += int(m.group(1))
        except ValueError:
            pass
        return ""
    clean = _LOVE_TAG_RE.sub(_sub, raw_reply)
    # 清理标签留下的多余空行
    clean = re.sub(r"\n{3,}", "\n\n", clean).strip()
    return clean, delta


# ================== 核心入口 ==================

def build_system_prompt(role_name: str, affection: int) -> str:
    """
    构建 system 提示词：角色设定 + 好感度规则。
    """
    parts = []
    b = load_role_config(role_name)
    if b:
        parts.append(f"【角色设定】\n{b}")

    parts.append(
        f"【好感度系统】\n"
        f"你与用户之间有一个好感度值，范围 0~100，当前好感度为 {affection}。\n"
        f"每次回复时，请在回复的**最后一行**单独写上好感度变化，格式为：<love:+N> 或 <love:-N> 或 <love:0>\n"
        f"规则：\n"
        f"- 让对方开心、亲密互动：+1~+8\n"
        f"- 普通对话、中性：<love:0>\n"
        f"- 对方冒犯你、让你不悦、或你刻意疏远：-1~-5\n"
        f"- 变化幅度要克制，单次绝对变化不超过 8\n"
        f"- 最终好感度由系统自动夹紧到 0~100，你只需输出变化量\n"
        f"- 变化标签必须单独占一行，不要包裹在任何标点或引号里"
    )

    return "\n\n".join(parts)


def process_user_input(user_text: str, role_name: str = None) -> dict:
    """
    核心入口：接收用户输入，调用 AI 生成角色回复，解析好感度变化。

    返回结构:
    {
        "reply": str,       # 已剥离 <love:...> 标签的 AI 回复文本
        "affection": int,   # 更新后的好感度（0~100）
        "delta": int,       # 本次好感度变化量（可正可负）
        "history_len": int, # 历史轮数
        "echo_input": str   # 原样回显用户输入
    }
    """
    # 1) 记录到内存变量
    chat_history.append({"role": "user", "text": user_text, "role_name": role_name})
    print(f"[body.py] 收到用户输入: {user_text}  (当前角色: {role_name}  好感度: {get_affection()})")

    # 2) 组装 messages：system 提示词 + 历史 + 本次输入
    system_content = build_system_prompt(role_name, get_affection())

    session = get_session(role_name)
    session.append({"role": "user", "content": user_text})

    messages = [{"role": "system", "content": system_content}]
    messages.extend(session[-MAX_SESSION_MESSAGES:])

    # 3) 调用 AI
    raw_reply = ""
    try:
        if not API_KEY:
            raise RuntimeError("API_KEY 未配置，请在 body.py 顶部填入完整 API Key")
        raw_reply = call_chat_api(messages).strip()
    except Exception as e:
        print(f"[body.py] AI 接口调用失败: {e}")
        session.pop()  # 回滚这条用户消息
        clean_reply = f"（角色「{role_name or '未选择'}」收到）{user_text}"
        delta = 0
        new_affection = get_affection()
    else:
        # 4) 解析好感度标签
        clean_reply, delta = parse_love_tag(raw_reply)
        # AI 没输出标签时按 0 处理，不会出错
        new_affection = change_affection(delta)
        session.append({"role": "assistant", "content": raw_reply})

    chat_history.append({"role": "assistant", "text": clean_reply, "role_name": role_name})

    print(f"[body.py] 好感度变化: {delta:+d}  →  {new_affection}")

    return {
        "reply": clean_reply,
        "affection": new_affection,
        "delta": delta,
        "history_len": len(chat_history) // 2,
        "echo_input": user_text,
    }


class Character:
    def __init__(self, name, love):
        self.name = name
        self.love = love


if __name__ == "__main__":
    # 直接运行脚本时的自测入口
    import sys
    user = Character("用户", 0)
    saying = sys.argv[1] if len(sys.argv) > 1 else "你好"
    test_role = sys.argv[2] if len(sys.argv) > 2 else "小中医"
    result = process_user_input(saying, test_role)
    print(json.dumps(result, ensure_ascii=False, indent=2))
