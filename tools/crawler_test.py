"""
Web3 页面抓取与 LLM 事件提取（本地/CLI 测试脚本）。

优先使用 DeepSeek，其次 Groq；若均未配置 API 密钥，则输出占位示例结果。
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

import requests
from bs4 import BeautifulSoup

from prompt import WEB3_EXTRACTION_PROMPT

MAX_PAGE_TEXT_LENGTH = 15_000
DEFAULT_PREVIEW_CHARS = 300
REQUEST_TIMEOUT_SEC = 20
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def _deepseek_api_key() -> str:
    """Resolve DeepSeek API key from standard environment variables."""
    return (os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("DEEPSEEK_KEY") or "").strip()


def _strip_json_from_markdown(raw: str) -> str:
    """Remove optional ```json ... ``` fences from model output."""
    text = raw.strip()
    if "```" not in text:
        return text
    parts = text.split("```")
    if len(parts) < 2:
        return text
    inner = parts[1].strip()
    if inner.lower().startswith("json"):
        inner = inner[4:].lstrip()
    return inner


def fetch_page(url: str) -> str:
    """
    Fetch page text via HTTP and strip common boilerplate tags.

    Returns a short error string on failure so callers can still proceed.
    """
    try:
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SEC)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "head"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)[:MAX_PAGE_TEXT_LENGTH]
    except Exception as exc:  # noqa: BLE001 — surface failure as text for debugging
        return f"抓取失败: {exc}"


async def fetch_page_crawl4ai(url: str) -> str:
    """Prefer Crawl4AI for JS-rendered pages; fall back to ``fetch_page``."""
    try:
        from crawl4ai import AsyncWebCrawler

        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            content = result.markdown or result.cleaned_html or ""
            if content and len(content) > 200:
                return content[:MAX_PAGE_TEXT_LENGTH]
    except Exception as exc:
        print(f"Crawl4AI 不可用 ({type(exc).__name__})，使用 requests 回退")
    return fetch_page(url)


def _build_prompt(page_text: str, url: str) -> str:
    return WEB3_EXTRACTION_PROMPT.replace(
        "{{PAGE_CONTENT}}",
        f"URL: {url}\n\n{page_text}",
    )


def call_deepseek(page_text: str, url: str) -> list[dict[str, Any]] | None:
    """Call DeepSeek chat API (OpenAI-compatible). Returns None if unconfigured or on error."""
    api_key = _deepseek_api_key()
    if not api_key:
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        prompt = _build_prompt(page_text, url)
        print("已检测到 DEEPSEEK_API_KEY（或 DEEPSEEK_KEY），正在调用 deepseek-chat...")
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content
        if raw is None:
            return None
        parsed = json.loads(_strip_json_from_markdown(raw))
        if isinstance(parsed, list):
            return parsed
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"DeepSeek 调用失败: {exc}")
        return None


def call_groq(page_text: str, url: str) -> list[dict[str, Any]] | None:
    """Call Groq chat API. Returns None if unconfigured or on error."""
    key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        return None

    try:
        from groq import Groq

        client = Groq(api_key=key)
        prompt = _build_prompt(page_text, url)
        print("已检测到 GROQ_API_KEY，正在调用 Groq LLM...")
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content
        if raw is None:
            return None
        parsed = json.loads(_strip_json_from_markdown(raw))
        if isinstance(parsed, list):
            return parsed
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"Groq 调用失败: {exc}")
        return None


def _mock_events(url: str, page_text: str) -> list[dict[str, Any]]:
    """Placeholder events when no LLM backend is available."""
    return [
        {
            "title": "示例事件（模拟）",
            "project_name": "示例项目",
            "description": (
                f"已从 {url} 抓取 {len(page_text)} 字符。设置环境变量 "
                "DEEPSEEK_API_KEY（或 DEEPSEEK_KEY）或 GROQ_API_KEY 后将使用真实 LLM 分析。"
            ),
            "category": ["测试网"],
            "start_time": None,
            "end_time": None,
            "source_url": url,
            "importance": "medium",
            "ai_confidence": 0.0,
            "tags": ["Web3"],
        }
    ]


async def main() -> None:
    print("=== Web3 Release AI 抓取 + LLM 提取测试 ===\n")
    url = sys.argv[1] if len(sys.argv) > 1 else "https://solana.com"
    print(f"目标 URL: {url}")
    print("正在抓取网页内容...\n")

    page_text = await fetch_page_crawl4ai(url)
    print(f"抓取完成，内容长度: {len(page_text)} 字符")
    sep = "-" * 50
    print(f"内容预览（前 {DEFAULT_PREVIEW_CHARS} 字）:\n{sep}\n{page_text[:DEFAULT_PREVIEW_CHARS]}\n{sep}\n")

    print("正在提取事件...")

    events = call_deepseek(page_text, url)
    if events is None:
        events = call_groq(page_text, url)

    if events is None:
        print("未检测到可用的 DeepSeek / Groq API 密钥，输出模拟结果")
        events = _mock_events(url, page_text)

    print("\n提取结果：")
    print(json.dumps(events, ensure_ascii=False, indent=2))

    out_path = "extraction_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)

    print(f"\n结果已保存到 {out_path}")
    print("测试完成。")


if __name__ == "__main__":
    asyncio.run(main())
