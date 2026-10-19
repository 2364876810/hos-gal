# -*- coding: utf-8 -*-
"""
body.py — 角色对话处理模块

被 Flask 后端 server.py 作为模块 import 调用。
职责：
  1. 读取角色设定（角色素材/<角色名>/角色设定.txt）
  2. 接收用户输入文本并记录
  3. 返回处理结果（后续可在此接入大模型 / NLP 等能力）
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 内存中的对话历史（进程存活期间有效）
chat_history = []


def load_role_config(role_name: str) -> str:
    """
    读取指定角色的角色设定文本。
    找不到文件或为空时返回空字符串，不抛异常。
    """
    if not role_name:
        return ""
    txt_path = os.path.join(BASE_DIR, "角色素材", role_name, "角色设定.txt")
    try:
        with open(txt_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        return content
    except FileNotFoundError:
        print(f"[body.py] 角色设定文件不存在: {txt_path}")
        return ""
    except Exception as e:
        print(f"[body.py] 读取角色设定失败: {e}")
        return ""


def process_user_input(user_text: str, role_name: str = None) -> dict:
    """
    核心入口：接收用户输入，返回一个结果 dict。
    后续在此接入 LLM / 知识库即可。

    返回结构:
    {
        "reply": str,          # 角色回复文本
        "role_config": str,    # 当前角色设定（调试用）
        "history_len": int,    # 历史轮数
        "echo_input": str      # 原样回显用户输入（便于前端校验链路）
    }
    """
    # 1) 记录到内存变量
    chat_history.append({
        "role": "user",
        "text": user_text,
        "role_name": role_name,
    })
    print(f"[body.py] 收到用户输入: {user_text}  (当前角色: {role_name})")

    # 2) 读取角色设定
    role_config = load_role_config(role_name)

    # 3) 暂时用一个占位回复，后续替换为真实模型调用
    reply = f"（角色「{role_name or '未选择'}」收到）{user_text}"

    chat_history.append({
        "role": "assistant",
        "text": reply,
        "role_name": role_name,
    })

    return {
        "reply": reply,
        "role_config": role_config,
        "history_len": len(chat_history) // 2,
        "echo_input": user_text,
    }


if __name__ == "__main__":
    # 直接运行脚本时的自测入口
    import sys
    test_input = sys.argv[1] if len(sys.argv) > 1 else "你好"
    test_role = sys.argv[2] if len(sys.argv) > 2 else "小中医"
    result = process_user_input(test_input, test_role)
    print(json.dumps(result, ensure_ascii=False, indent=2))
