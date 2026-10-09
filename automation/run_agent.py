#!/usr/bin/env python3
"""用 Claude Agent SDK 生成日报 / 周报。

用法：python automation/run_agent.py daily|weekly
认证：环境变量 ANTHROPIC_API_KEY（已关联月度 API 额度的 Console 组织的密钥）。
"""
import asyncio
import os
import sys
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

ROOT = Path(__file__).resolve().parent.parent

# 每种任务的配置：模型、最大轮数、单次花费上限（美元，超过就停，双保险）
CONFIGS = {
    "daily": {"model": "claude-sonnet-5-5", "max_turns": 60, "max_budget_usd": 5.0},
    "weekly": {"model": "claude-opus-5-5", "max_turns": 150, "max_budget_usd": 20.0},
}

TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebSearch", "WebFetch"]
SUMMARY_FILE = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "agent_summary.txt"


def log(msg: str) -> None:
    print(msg, flush=True)


def pick_summary(lines: list[str], kind: str) -> list[str]:
    """从 agent 最后的输出里找那三行总结。

    指令要求第三行是网站地址，所以以带 :8800 的那一行为锚点，取它和前两行。
    agent 有时会在总结后面再补几句备注，所以不能简单取最后三行。
    找不到锚点时，用写入的数据文件里的 headline 兜底。
    """
    for i in range(len(lines) - 1, -1, -1):
        if "120.55.51.34:8800" in lines[i]:
            return lines[max(0, i - 2): i + 1]
    import json
    from datetime import datetime, timedelta, timezone
    today = (datetime.now(timezone.utc) + timedelta(hours=8)).strftime("%Y-%m-%d")
    f = ROOT / "data" / kind / f"{today}.json"
    try:
        headline = json.loads(f.read_text(encoding="utf-8")).get("headline")
        if headline:
            return [str(headline)]
    except Exception:
        pass
    return lines[:3] if lines else ["（agent 没有输出总结）"]


async def run(kind: str) -> int:
    cfg = CONFIGS[kind]
    prompt = (ROOT / "automation" / "prompts" / f"{kind}.md").read_text(encoding="utf-8")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        log("错误：没有设置 ANTHROPIC_API_KEY")
        return 1

    options = ClaudeAgentOptions(
        cwd=str(ROOT),
        model=cfg["model"],
        max_turns=cfg["max_turns"],
        max_budget_usd=cfg["max_budget_usd"],
        allowed_tools=TOOLS,
        tools=TOOLS,
        permission_mode="bypassPermissions",
        setting_sources=[],  # 不读仓库或机器上的其它 Claude 配置，行为只由指令决定
        env={"ANTHROPIC_API_KEY": os.environ["ANTHROPIC_API_KEY"]},
    )

    last_text = ""
    result: ResultMessage | None = None

    async for msg in query(prompt=prompt, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    last_text = block.text.strip()
                    log(f"[说明] {last_text[:300]}")
                elif isinstance(block, ToolUseBlock):
                    arg = block.input.get("command") or block.input.get("url") \
                        or block.input.get("query") or block.input.get("file_path") \
                        or block.input.get("pattern") or ""
                    log(f"[工具] {block.name} {str(arg)[:200]}")
        elif isinstance(msg, ResultMessage):
            result = msg

    # 最后几行文字：优先用结果消息里的 result，没有就用最后一段说明
    final = ((result.result if result and result.result else "") or last_text).strip()
    lines = [l.strip(" -*") for l in final.splitlines() if l.strip()]
    tail = pick_summary(lines, kind)
    SUMMARY_FILE.write_text("\n".join(tail) + "\n", encoding="utf-8")

    # 用量和费用
    usage_lines = []
    if result:
        u = result.usage or {}
        usage_lines = [
            f"结果：{'失败' if result.is_error else '成功'}（{result.subtype}）",
            f"轮数：{result.num_turns}，耗时：{result.duration_ms / 1000:.0f} 秒",
            f"输入 token：{u.get('input_tokens', 0)}，"
            f"缓存写入：{u.get('cache_creation_input_tokens', 0)}，"
            f"缓存读取：{u.get('cache_read_input_tokens', 0)}，"
            f"输出 token：{u.get('output_tokens', 0)}",
            f"本次费用：约 US${(result.total_cost_usd or 0):.4f}",
        ]
    else:
        usage_lines = ["没有收到结果消息，无法统计用量"]

    log("\n===== 用量 =====")
    for l in usage_lines:
        log(l)
    log("===== agent 总结 =====")
    for l in tail:
        log(l)

    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as f:
            f.write(f"## {'日报' if kind == 'daily' else '周报'}（{cfg['model']}）\n\n")
            f.write("\n".join(f"- {l}" for l in tail) + "\n\n")
            f.write("### 用量\n\n" + "\n".join(f"- {l}" for l in usage_lines) + "\n")

    # 超过轮数/预算时 SDK 也会给 is_error；文件可能已经写好，交给后面的校验步骤判断
    if result is None:
        return 1
    if result.is_error and result.subtype not in ("error_max_turns", "error_max_budget_usd"):
        return 1
    return 0


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in CONFIGS:
        print("用法：python automation/run_agent.py daily|weekly")
        sys.exit(2)
    sys.exit(asyncio.run(run(sys.argv[1])))


if __name__ == "__main__":
    main()
