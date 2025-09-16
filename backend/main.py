import os, re
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

from heuristic import run_heuristics
from llm import call_llm

load_dotenv()
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

class AnalyzeRequest(BaseModel):
    url: str

app = FastAPI()
templates = Jinja2Templates(directory="../frontend/")
app.mount("/static", StaticFiles(directory="../frontend/"), name="static")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    try:
        # print(f"starting analysis for url: {request.url}")  # debug
        heuristics_data = run_heuristics(request.url)
        # print(f"heuristics completed: {heuristics_data}")  # debug
        
        llm_analysis = await call_llm(heuristics_data, OPENAI_KEY)
        # print(f"llm analysis: {llm_analysis}")  # debug

        return {
            "url": request.url,
            "heuristics": heuristics_data,
            "llm_report": llm_analysis or "LLM not configured"
        }
    except Exception as error:
        # print(f"error in analysis: {error}")  # debug
        return JSONResponse(status_code=400, content={"error": str(error)})

@app.get("/health")
def health():
    return {"ok": True}