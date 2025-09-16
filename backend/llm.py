import openai

async def call_llm(heuristics_data: dict, api_key: str | None):
    if not api_key:
        # print("no api key provided, skipping llm analysis")  # debug
        return None
    
    # print("calling openai api for analysis...")  # debug
    openai_client = openai.OpenAI(api_key=api_key)

    analysis_prompt = f"""
You are a UX expert analyzing this product page data:

{heuristics_data}

Analyze these categories:
1. Content & Messaging: Value prop clarity, trust signals, CTA effectiveness
2. Visual & Layout: Image quality, heading structure, accessibility
3. Conversion Friction: Forms, popups, user flow issues
4. Trust & Social Proof: Testimonials, security, credibility

Return JSON:
- summary: 2-sentence overall assessment
- category_scores: {{"content": 0-10, "visual": 0-10, "conversion": 0-10, "trust": 0-10}}
- top_issues: [3 most critical problems]
- quick_wins: [easy fixes with high impact]
- strengths: [what's working well]
    """

    api_response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":analysis_prompt}],
        response_format={ "type": "json_object" }
    )
    
    llm_result = api_response.choices[0].message.content
    # print(f"llm response received: {llm_result[:100]}...")  # debug
    return llm_result