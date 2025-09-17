import json
import openai

async def call_llm(heuristics_data: dict, api_key: str | None):
    if not api_key:
        # print("no api key provided, skipping llm analysis")  # debug
        return None
    
    # print("calling openai api for analysis...")  # debug
    openai_client = openai.OpenAI(api_key=api_key)

    analysis_prompt = f"""
You are a senior CRO/UX specialist. Analyze the PRODUCT PAGE SIGNALS below and return STRICT JSON only.

PRODUCT PAGE SIGNALS:
{json.dumps(heuristics_data, ensure_ascii=False, separators=(',', ':'))}

SCORING CATEGORIES (0–10):
- clarity (value prop, product info clarity)
- cta (visibility, above-the-fold, price proximity)
- trust (reviews, guarantees, badges, reassurance near CTA)
- imagery (image count/quality proxy, alt coverage)
- findability (breadcrumbs, related items, on-site search)
- mobile (viewport, basic mobile readiness)
- performance (very rough proxies: html_bytes, script counts)
- accessibility (unlabeled buttons/links, alt coverage proxy)
- friction (popups/forms—if known; otherwise infer from signals)
- seo (title/description ranges, OG, canonical)

RETURN JSON WITH EXACT KEYS:
{{
  "summary": "1–2 sentence diagnosis focused on conversion risks and quick upside.",
  "category_scores": {{
    "clarity": 0, "cta": 0, "trust": 0, "imagery": 0, "findability": 0,
    "mobile": 0, "performance": 0, "accessibility": 0, "friction": 0, "seo": 0
  }},
  "top_issues": ["short, specific issue", "..."],                // 3–6 items
  "quick_wins": ["short fix likely high impact/low effort", "..."], // 3–6 items
  "prioritized_actions": [                                        // 3–8 items
    {{"action":"Move price next to CTA","why":"price_near_cta=false","impact":3,"confidence":2,"effort":1}}
  ],
  "copy_suggestions": [                                           // optional
    {{"area":"hero","text":"Free 30-day returns • Ships in 24h"}}
  ]
}}
    
CONSTRAINTS:
- Be concrete and map advice to the provided signals (e.g., if price_near_cta=false, address it).
- Use 1–3 sentence fragments per item; no fluff.
- Effort/Impact/Confidence must be integers in 1..3.
- Output ONLY valid JSON (no markdown, no prose).
"""

    api_response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":analysis_prompt}],
        response_format={ "type": "json_object" }
    )
    
    llm_result = api_response.choices[0].message.content
    # print(f"llm response received: {llm_result[:100]}...")  # debug
    return llm_result