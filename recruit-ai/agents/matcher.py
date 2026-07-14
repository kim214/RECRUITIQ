"""Job-candidate matcher agent."""
from lib.llm import call_llm

MATCHER_SYSTEM = """You are an expert recruitment AI. Compare candidate profile against job requirements.
Return JSON with:
overall_score (0-100), skills_match {score, matched[], missing[], partial[]},
education_match {score, meets_requirement, details},
experience_match {score, candidate_years, required_years, details},
strengths[], weaknesses[], recommendation (strong_yes|yes|maybe|no), summary (string)"""


def local_match(job: dict, profile: dict) -> dict:
    req_skills = [s.lower() for s in (job.get("required_skills") or job.get("requiredSkills") or [])]
    cand_skills = [s.lower() for s in profile.get("skills", [])]
    matched = [s for s in req_skills if any(s in c or c in s for c in cand_skills)]
    missing = [s for s in req_skills if s not in matched]
    skill_score = round((len(matched) / len(req_skills)) * 100) if req_skills else 70

    req_exp = job.get("experience_years") or job.get("minExperience") or 0
    cand_exp = profile.get("total_experience_years", 0)
    exp_score = min(100, 70 + (cand_exp - req_exp) * 10) if cand_exp >= req_exp else max(30, 50 + cand_exp * 10)

    edu_score = 85 if job.get("required_education") or job.get("requiredEducation") else 90
    overall = round(skill_score * 0.5 + exp_score * 0.3 + edu_score * 0.2)
    rec = "strong_yes" if overall >= 85 else "yes" if overall >= 70 else "maybe" if overall >= 50 else "no"

    return {
        "overall_score": overall,
        "skills_match": {"score": skill_score, "matched": matched, "missing": missing, "partial": []},
        "education_match": {"score": edu_score, "meets_requirement": True, "details": "Evaluated locally"},
        "experience_match": {"score": exp_score, "candidate_years": cand_exp, "required_years": req_exp, "details": f"{cand_exp}y vs {req_exp}y required"},
        "strengths": [f"Matches {len(matched)} required skills"] if matched else ["General fit"],
        "weaknesses": [f"Missing: {', '.join(missing[:3])}"] if missing else [],
        "recommendation": rec,
        "summary": f"{profile.get('full_name', 'Candidate')} scores {overall}% — {rec.replace('_', ' ')} recommendation.",
        "model_version": "local-fallback",
    }


def match_candidate(job: dict, profile: dict) -> dict:
    user_prompt = f"""Job Requirements:
Title: {job.get('title')}
Skills: {job.get('required_skills') or job.get('requiredSkills')}
Education: {job.get('required_education') or job.get('requiredEducation')}
Experience years: {job.get('experience_years') or job.get('minExperience')}
Certifications: {job.get('required_certifications') or job.get('requiredCertifications')}

Candidate Profile:
{profile}"""

    result = call_llm(MATCHER_SYSTEM, user_prompt)
    if result:
        result["model_version"] = "gpt-4o-mini"
        if "summary" not in result and "ai_summary" in result:
            result["summary"] = result["ai_summary"]
        result["ai_summary"] = result.get("summary", "")
        return result

    result = local_match(job, profile)
    result["ai_summary"] = result["summary"]
    return result
