"""Offline regression: preserved Classic API and scoring against an owned product fixture."""
import os
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from heuristic import run_heuristics
import main

html = (Path(__file__).parent.parent / 'frontend/public/reviewer/samples/strong.html').read_text()
class Page:
    text = html
    content = html.encode()
    status_code = 200
    headers = {'content-type':'text/html'}
    url = 'https://fixture.example/product'
    def raise_for_status(self): pass
with patch('heuristic.requests.get', return_value=Page()):
    result = run_heuristics(Page.url)
    assert result['conversion_scores']['overall_score'] > 0
    assert result['cta']
    assert result['price']
    main.OPENAI_KEY = None
    client = TestClient(main.app)
    assert client.get('/health').json() == {'ok': True}
    response = client.post('/api/analyze', json={'url':Page.url})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) == {'url','heuristics','llm_report'}
    assert payload['heuristics']['conversion_scores'] == result['conversion_scores']
    assert payload['llm_report'] == 'LLM not configured'
    assert client.post('/api/analyze', json={}).status_code == 422
print('PASS: Classic local fixture scoring, API response shape, missing-key fallback, validation, health')
