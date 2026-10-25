# -*- coding: utf-8 -*-
"""
agent.py — 把「角色设定.txt」变成会聊天的智能体（零依赖，只用标准库）

职责四件事：
  1. 读人设      → 角色素材/<角色>/角色设定.txt 变成 system prompt
  2. 拿对话      → POST {AI_API_BASE}/chat/completions
  3. 返回对话    → chat() 直接返回字符串
  4. 记下对话    → 追加到 角色素材/<角色>/对话记录.txt（纯文本，和原格式同风格）

环境变量（不写在代码里，避免 key 泄露）：
    AI_API_BASE   如 https://api.deepseek.com/v1
    AI_API_KEY    你的 key
    AI_MODEL      如 deepseek-chat

用法：
    python agent.py "你好"
    python agent.py --role 小中医 "我最近总失眠"
    python agent.py --export          # 打印对话记录，用于"反馈文件"
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROLE_ROOT = os.path.join(BASE_DIR, "角色素材")

# 匹配日志行：[2026-10-20 17:30] 用户：xxx
LINE_RE = re.compile(r"^\[([^\]]+)\]\s*([^：]+)：(.*)$")


def _stamp():
    return time.strftime("%Y-%m-%d %H:%M")


class CharacterAgent:
    """一个角色 = 一个实例；同角色多次对话共享历史并落盘。"""

    def __init__(self, role_name="小中医", base_url=None, api_key=None,
                 model=None, max_turns=12, timeout=60):
        self.role_name = role_name
        self.base_url = (base_url or os.environ.get("AI_API_BASE", "")).rstrip("/")
        self.api_key = api_key or os.environ.get("AI_API_KEY", "")
        self.model = model or os.environ.get("AI_MODEL", "")
        self.max_turns = max_turns
        self.timeout = timeout

        self.persona = self.load_persona()
        self.history = self._restore_history()

    # ---------------- 文件 ----------------

    @property
    def persona_path(self):
        return os.path.join(ROLE_ROOT, self.role_name, "角色设定.txt")

    @property
    def log_path(self):
        return os.path.join(ROLE_ROOT, self.role_name, "对话记录.txt")

    def load_persona(self):
        try:
            with open(self.persona_path, "r", encoding="utf-8") as f:
                text = f.read().strip()
            return text
        except FileNotFoundError:
            print(f"[agent] 没找到角色设定: {self.persona_path}")
            return ""
        except Exception as e:
            print(f"[agent] 读取角色设定失败: {e}")
            return ""

    def system_prompt(self):
        persona = self.persona or "你是一个友好、耐心的助手。"
        return (
            f"{persona}\n\n"
            "【对话规则】\n"
            "1. 始终以角色身份说话，不要提“我是AI”“语言模型”之类。\n"
            "2. 回复 1~3 句，口语化，像面对面聊天，不要长篇大论。\n"
            "3. 涉及身体健康时只做科普和生活方式建议，不做诊断、不开处方，"
            "情况严重就劝对方去医院。\n"
            "4. 不要编造角色设定里没有的身世和经历。"
        )

    def read_log(self):
        """读取完整对话记录（给前端/导出用）。"""
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def _append_log(self, user_text, reply):
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        prefix = ""
        if os.path.exists(self.log_path) and os.path.getsize(self.log_path) > 0:
            with open(self.log_path, "rb") as f:
                f.seek(-1, os.SEEK_END)
                if f.read(1) != b"\n":
                    prefix = "\n"
        ts = _stamp()
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(f"{prefix}[{ts}] 用户：{user_text}\n")
            f.write(f"[{ts}] {self.role_name}：{reply}\n")

    def _restore_history(self):
        """从记录文件恢复最近 max_turns 轮，重启服务也不失忆。"""
        history = []
        for line in self.read_log().splitlines():
            m = LINE_RE.match(line)
            if not m:
                continue
            who, text = m.group(2).strip(), m.group(3)
            if who == "用户":
                history.append({"role": "user", "content": text})
            elif who == self.role_name:
                history.append({"role": "assistant", "content": text})
        history = history[-(self.max_turns * 2):]
        return self._drop_leading_assistant(history)

    @staticmethod
    def _drop_leading_assistant(history):
        # 有的接口要求 messages 以 user 开头
        while history and history[0]["role"] != "user":
            history.pop(0)
        return history

    # ---------------- 接口 ----------------

    def _request(self, messages):
        if not (self.base_url and self.api_key and self.model):
            raise RuntimeError(
                "接口没配置好，需要设置环境变量 AI_API_BASE / AI_API_KEY / AI_MODEL"
            )

        url = self.base_url + "/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.8,
            "max_tokens": 800,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + self.api_key,
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "ignore")
            raise RuntimeError(f"接口返回 {e.code}：{detail[:300]}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"连不上接口：{e.reason}")

        try:
            return body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError):
            raise RuntimeError(f"接口返回格式不对：{json.dumps(body, ensure_ascii=False)[:300]}")

    # ---------------- 对话 ----------------

    def chat(self, user_text):
        """一轮对话：带上人设和历史去请求，返回回复并落盘。"""
        user_text = (user_text or "").strip()
        if not user_text:
            return "……你还没说话呢。"

        messages = [{"role": "system", "content": self.system_prompt()}]
        messages.extend(self.history)
        messages.append({"role": "user", "content": user_text})

        reply = self._request(messages)

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": reply})
        self.history = self._drop_leading_assistant(self.history[-(self.max_turns * 2):])

        self._append_log(user_text, reply)
        return reply


def main():
    args = sys.argv[1:]

    role = "小中医"
    if "--role" in args:
        i = args.index("--role")
        if i + 1 < len(args):
            role = args[i + 1]
            del args[i:i + 2]

    if "--export" in args:
        print(CharacterAgent(role).read_log() or "（还没有对话记录）")
        return

    text = " ".join(args).strip()
    if not text:
        print('用法: python agent.py "你好"  /  python agent.py --export')
        return

    try:
        print(CharacterAgent(role).chat(text))
    except RuntimeError as e:
        print(f"[agent] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
