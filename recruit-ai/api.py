"""
Reqruit IQ AI Service
Run: uvicorn api:app --reload --port 8000
"""
import os
from dotenv import load_dotenv

load_dotenv()  # load recruit-ai/.env before agents read OPENAI_API_KEY

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx

from agents.parser import parse_document
from agents.matcher import match_candidate
from agents.ranker import rank_applications

app = FastAPI(title="Reqruit IQ AI Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")
INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "reqruit-internal")


class AnalyzeRequest(BaseModel):
    job: dict
    application: dict
    profile_text: Optional[str] = None


class RankRequest(BaseModel):
    job: dict
    applications: list


@app.get("/health")
def health():
    return {"status": "ok", "service": "recruit-ai"}


@app.post("/analyze/{application_id}")
async def analyze_application(application_id: str, body: AnalyzeRequest):
    profile = parse_document(
        body.profile_text or body.application.get("coverLetter") or body.application.get("cover_letter") or "",
        fallback_name=body.application.get("applicantName", "Candidate"),
    )
    analysis = match_candidate(body.job, profile)
    return {"application_id": application_id, "analysis": analysis}


@app.post("/rank/{job_id}")
async def rank_job(job_id: str, body: RankRequest):
    rankings = rank_applications(body.job, body.applications)
    return {"job_id": job_id, "rankings": rankings}


@app.post("/parse")
def parse_doc(body: dict):
    text = body.get("text", "")
    return parse_document(text, body.get("name", "Candidate"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
