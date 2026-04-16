# crawler_test.py  —  Web3 Release AI 抓取 + LLM 提取测试

import sys
import os
import json
import asyncio
import requests
from bs4 import BeautifulSoup
from prompt import WEB3_EXTRACTION_PROMPT


def fetch_page(url: str) -> str:
    """使用 requests + BeautifulSoup 抓取页面"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "head"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)[:15000]
    except Exception as e:
        return f"抓取失败: {str(e)}"


async def fetch_page_crawl4ai(url: str) -> str:
    """尝试 Crawl4AI JS 渲染，失败则回退 requests"""
    try:
        from crawl4ai import AsyncWebCrawler
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            content = result.markdown or result.cleaned_html or ""
            if content and len(content) > 200:
                return content[:15000]
    except Exception as e:
        print(f"⚠️  Crawl4AI 不可用 ({type(e).__name__})，切换到 requests 模式")
    return fetch_page(url)


def call_deepseek(page_text: str, url: str):
    """调用 DeepSeek LLM 提取（OpenAI 兼容接口）"""
    # 支持多种 Secret 命名方式
    api_key = (
        os.environ.get("DEEPSEEK_API_KEY", "") or
        os.environ.get("uijay10", "") or
        os.environ.get("DEEPSEEK_KEY", "")
    )
    base_url = "https://api.deepseek.com"
    if not api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url)
        prompt = WEB3_EXTRACTION_PROMPT.replace(
            "{{PAGE_CONTENT}}", f"URL: {url}\n\n{page_text}"
        )
        print(f"🔑 DeepSeek API Key 已检测，正在调用 deepseek-chat...")
        print("🤖 正在调用 DeepSeek LLM...")
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"❌ DeepSeek 调用失败: {e}")
        return None


def call_groq(page_text: str, url: str):
    """调用 Groq LLM 提取，无 Key 返回 None"""
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        return None
    try:
        from groq import Groq
        client = Groq(api_key=key)
        prompt = WEB3_EXTRACTION_PROMPT.replace(
            "{{PAGE_CONTENT}}", f"URL: {url}\n\n{page_text}"
        )
        print("🔑 GROQ_API_KEY 已检测，正在调用 Groq LLM...")
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"❌ Groq 调用失败: {e}")
        return None


async def main():
    print("=== Web3 Release AI 抓取 + LLM 提取测试 ===\n")
    url = sys.argv[1] if len(sys.argv) > 1 else "https://solana.com"
    print(f"🌐 目标 URL: {url}")
    print("📡 正在抓取网页内容...\n")

    page_text = await fetch_page_crawl4ai(url)
    print(f"✅ 抓取完成，内容长度: {len(page_text)} 字符")
    print(f"📄 内容预览（前300字）:\n{'-'*50}\n{page_text[:300]}\n{'-'*50}\n")

    print("🤖 正在提取事件...")

    # 优先 DeepSeek，其次 Groq，都没有则输出模拟结果
    events = call_deepseek(page_text, url)
    if events is None:
        events = call_groq(page_text, url)

    if events is None:
        print("💡 未检测到可用 API Key，输出模拟结果")
        events = [{
            "title": "示例事件（模拟）",
            "project_name": "示例项目",
            "description": f"已成功从 {url} 抓取 {len(page_text)} 字符。设置 AI_INTEGRATIONS_OPENAI_API_KEY 后将使用 DeepSeek 真实 AI 分析。",
            "category": ["测试网"],
            "start_time": None,
            "end_time": None,
            "source_url": url,
            "importance": "medium",
            "ai_confidence": 0.0,
            "tags": ["Web3"]
        }]

    print("\n📋 提取结果：")
    print(json.dumps(events, ensure_ascii=False, indent=2))

    with open("extraction_result.json", "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)

    print(f"\n💾 结果已保存到 extraction_result.json")
    print("🎉 测试完成！")


if __name__ == "__main__":
    asyncio.run(main())
