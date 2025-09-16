import os, re
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

from heuristics import run_heuristics
from llm import call_llm

load_dotenv()
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI()
templates = Jinja2Templates(directory="../frontend/index.html")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/analyze")
async def analyze(url: str = Form(...)):
    try:
        heuristics = run_heuristics(url)
        llm_report = await call_llm(heuristics, OPENAI_KEY)

        return {
            "url": url,
            "heuristics": heuristics,
            "llm_report": llm_report or "LLM not configured"
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.get("/health")
def health():
    return {"ok": True}