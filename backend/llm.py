import openai

async def call_llm(heuristics_data: dict, api_key: str | None):
    if not api_key:
        # print("no api key provided, skipping llm analysis")  # debug
        return None
    
    # print("calling openai api for analysis...")  # debug
    openai_client = openai.OpenAI(api_key=api_key)

    analysis_prompt = f"""
You are a product page UX reviewer. Analyze this page:
{heuristics_data}

Return JSON with keys:
- summary: string
- top_findings: [string]
- actions: [{{action, why, impact, effort}}]
    """

    api_response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":analysis_prompt}],
        response_format={ "type": "json_object" }
    )
    
    llm_result = api_response.choices[0].message.content
    # print(f"llm response received: {llm_result[:100]}...")  # debug
    return llm_result