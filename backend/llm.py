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
    You are a senior CRO & UX specialist with 10+ years of hands-on experience auditing product pages for e-commerce and SaaS businesses. 
    You excel at identifying friction points, diagnosing why users drop off, and prescribing practical fixes that measurably improve conversion. 
    Analyze the PRODUCT PAGE SIGNALS below and return STRICT JSON only.
    
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
      "top_issues": [],                 // 3–6 items
      "quick_wins": [],                 // 3–6 items
      "prioritized_actions": [],        // 3–8 items; see schema below
      "copy_suggestions": []            // optional
    }}

    CONSTRAINTS:
    - Only include actions that are clearly justified by the provided signals/scores.
    - Reference the exact signals/scores in each action's "why" (e.g., "price_near_cta=false", "cta_effectiveness=3").
    - Do NOT suggest moving price near CTA unless price_near_cta=false.
    - Do NOT suggest moving CTA above the fold unless cta_above_fold=false.
    - Use concise fragments; no fluff.
    - Effort/Impact/Confidence must be integers in 1..3.
    - Output ONLY valid JSON (no markdown, no prose).

    ITEM SCHEMA for each entry in prioritized_actions:
    - action: string
    - why: string (must reference specific signals/scores)
    - impact: integer (1..3)
    - confidence: integer (1..3)
    - effort: integer (1..3)
    """

    api_response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":analysis_prompt}],
        response_format={ "type": "json_object" }
    )
    
    llm_result = api_response.choices[0].message.content
    # print(f"llm response received: {llm_result[:100]}...")  # debug
    return llm_result