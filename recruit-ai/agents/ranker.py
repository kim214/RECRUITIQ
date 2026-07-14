"""Batch ranker agent."""
import os
import httpx
from agents.parser import parse_document
from agents.matcher import match_candidate

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")


async def fetch_job_and_applications(job_id: str) -> tuple:
    async with httpx.AsyncClient() as client:
        # AI service is called from backend with auth; we use internal data endpoint
        pass
    return None, []


def rank_applications(job: dict, applications: list) -> list:
    """Rank a list of applications with embedded applicant info."""
    results = []
    for app in applications:
        profile = parse_document(
            app.get("cover_letter") or app.get("coverLetter") or "",
            fallback_name=app.get("applicantName") or app.get("applicant_name") or "Candidate",
        )
        if app.get("skills"):
            profile["skills"] = app["skills"]
        analysis = match_candidate(job, profile)
        results.append({
            "application_id": app.get("id"),
            "id": app.get("id"),
            "applicantName": app.get("applicantName"),
            "applicantEmail": app.get("applicantEmail"),
            "aiScore": analysis["overall_score"],
            "analysis": analysis,
        })
    results.sort(key=lambda x: x["aiScore"], reverse=True)
    return results
