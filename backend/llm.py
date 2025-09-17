import json
import openai

async def call_llm(heuristics_data: dict, api_key: str | None):
    if not api_key:
        # print("no api key provided, skipping llm analysis")  # debug
        return None
    
    # print("calling openai api for analysis...")  # debug
    openai_client = openai.OpenAI(api_key=api_key)

    conversion_scores = heuristics_data.get('conversion_scores', {})
    
    analysis_prompt = f"""
You are a senior CRO/UX specialist. Analyze the PRODUCT PAGE SIGNALS below and return STRICT JSON only.

PRODUCT PAGE SIGNALS:
{json.dumps(heuristics_data, ensure_ascii=False, separators=(',', ':'))}

CONVERSION SCORES (already calculated):
{json.dumps(conversion_scores, ensure_ascii=False, separators=(',', ':'))}

Your task is to provide actionable recommendations based on these scores and signals. Focus on:
1. Explaining WHY scores are low/high based on the specific heuristics
2. Providing concrete, implementable fixes
3. Prioritizing by conversion impact

RETURN JSON WITH EXACT KEYS:
{{
  "summary": "1–2 sentence diagnosis focused on conversion risks and quick upside.",
  "score_analysis": {{
    "strengths": ["what's working well based on high scores", "..."],
    "weaknesses": ["what's hurting conversion based on low scores", "..."]
  }},
  "top_issues": ["short, specific issue with score context", "..."],                // 3–6 items
  "quick_wins": ["short fix likely high impact/low effort", "..."], // 3–6 items
  "prioritized_actions": [                                        // 3–8 items
    {{"action":"Move price next to CTA","why":"price_near_cta=false, CTA score: {conversion_scores.get('cta_effectiveness', 'N/A')}","impact":3,"confidence":2,"effort":1}}
  ],
  "copy_suggestions": [                                           // optional
    {{"area":"hero","text":"Free 30-day returns • Ships in 24h"}}
  ]
}}
    
CONSTRAINTS:
- Reference specific scores and heuristics in your analysis
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