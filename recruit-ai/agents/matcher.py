"""Job-candidate matcher agent — evidence-based scoring."""
from lib.llm import call_llm

MATCHER_SYSTEM = """You are an expert recruitment analyst. Score candidates ONLY based on evidence in their profile text.
Rules:
- Never invent skills, degrees, or years of experience not present in the candidate profile.
- If information is missing, score that dimension low and say what is missing.
- Percentages must reflect actual overlap: skills score = (matched required skills / total required) * 100, allowing partial credit for related skills.
- overall_score = weighted average: skills 45%, experience 30%, education 15%, certifications 10%.
- Be conservative when data is sparse; do not assume qualifications.
Return JSON with:
overall_score (0-100), skills_match {score, matched[], missing[], partial[]},
education_match {score, meets_requirement, details},
experience_match {score, candidate_years (null if unknown), required_years, details},
strengths[] (evidence-based), weaknesses[] (evidence-based),
recommendation (strong_yes|yes|maybe|no), summary (2-4 factual sentences)"""


def _normalize(s: str) -> str:
    return (s or "").lower().strip()


def _skill_status(required: str, text: str) -> str:
    r = _normalize(required)
    if not r:
        return "missing"
    if r in text:
        return "matched"
    tokens = [t for t in r.replace("/", " ").split() if len(t) > 2]
    hits = sum(1 for t in tokens if t in text)
    if hits == len(tokens) and tokens:
        return "matched"
    if hits:
        return "partial"
    return "missing"


def local_match(job: dict, profile: dict) -> dict:
    text = _normalize(
        " ".join(
            filter(
                None,
                [
                    str(profile.get("full_name", "")),
                    " ".join(profile.get("skills") or []),
                    " ".join(profile.get("education_text") or []),
                    " ".join(
                        f"{e.get('title', '')} {e.get('company', '')} {e.get('description', '')}"
                        for e in (profile.get("experience") or [])
                    ),
                    profile.get("raw_text", ""),
                ],
            )
        )
    )

    req_skills = job.get("required_skills") or job.get("requiredSkills") or []
    matched, partial, missing = [], [], []
    for skill in req_skills:
        status = _skill_status(str(skill), text)
        if status == "matched":
            matched.append(skill)
        elif status == "partial":
            partial.append(skill)
        else:
            missing.append(skill)

    if req_skills:
        points = len(matched) + len(partial) * 0.45
        skill_score = round((points / len(req_skills)) * 100)
    else:
        skill_score = None

    req_exp = int(job.get("experience_years") or job.get("minExperience") or 0)
    cand_exp = profile.get("total_experience_years")
    if cand_exp is None:
        exp_score = 20 if req_exp else None
        exp_details = f"Job requires {req_exp} year(s). Candidate did not state experience." if req_exp else "No minimum experience required."
    elif cand_exp >= req_exp:
        exp_score = min(100, 75 + min(20, (cand_exp - req_exp) * 5))
        exp_details = f"Candidate: ~{cand_exp} year(s). Required: {req_exp} year(s)."
    else:
        exp_score = max(10, 75 - (req_exp - cand_exp) * 15)
        exp_details = f"Candidate: ~{cand_exp} year(s) — below required {req_exp} year(s)."

    req_edu = job.get("required_education") or job.get("requiredEducation")
    edu_text = " ".join(profile.get("education_text") or []) or text
    if not req_edu:
        edu_score, meets, edu_details = None, True, "No specific education requirement."
    elif any(k in edu_text for k in ["bachelor", "master", "phd", "degree", "diploma", "b.sc", "mba"]):
        edu_score, meets, edu_details = 88, True, f"Education credentials found; role requires: {req_edu}."
    else:
        edu_score, meets, edu_details = 25, False, f"No education matching '{req_edu}' found in application."

    req_certs = job.get("required_certifications") or job.get("requiredCertifications") or []
    cert_matched = [c for c in req_certs if _normalize(str(c)) in text]
    cert_score = round((len(cert_matched) / len(req_certs)) * 100) if req_certs else None

    components = []
    if skill_score is not None:
        components.append((skill_score, 0.45))
    if exp_score is not None:
        components.append((exp_score, 0.30))
    if edu_score is not None:
        components.append((edu_score, 0.15))
    if cert_score is not None:
        components.append((cert_score, 0.10))

    if components:
        total_w = sum(w for _, w in components)
        overall = round(sum(s * (w / total_w) for s, w in components))
    else:
        overall = 30

    data_len = len(text.strip())
    if data_len < 30:
        overall = min(overall, 35)
    elif data_len < 120:
        overall = min(overall, max(overall - 10, 45))

    overall = max(0, min(100, overall))
    rec = "strong_yes" if overall >= 82 else "yes" if overall >= 68 else "maybe" if overall >= 48 else "no"

    name = profile.get("full_name", "Candidate")
    summary_parts = [f"{name} scored {overall}% for {job.get('title', 'this role')}."]
    if skill_score is not None:
        summary_parts.append(
            f"Skills {skill_score}%: {len(matched)}/{len(req_skills)} confirmed"
            + (f", partial: {', '.join(partial)}" if partial else "")
            + (f"; missing: {', '.join(missing)}" if missing else "") + "."
        )
    if exp_score is not None:
        summary_parts.append(exp_details)
    if edu_score is not None:
        summary_parts.append(edu_details)

    strengths = []
    if matched:
        strengths.append(f"Demonstrates: {', '.join(matched[:4])}")
    if partial:
        strengths.append(f"Related skills: {', '.join(partial[:3])}")
    if exp_score and exp_score >= 70 and cand_exp is not None:
        strengths.append(f"Experience aligns (~{cand_exp} years)")
    if meets and edu_score and edu_score >= 70:
        strengths.append("Education appears sufficient")

    weaknesses = []
    if missing:
        weaknesses.append(f"Not evidenced: {', '.join(missing[:4])}")
    if exp_score and exp_score < 60:
        weaknesses.append(exp_details)
    if not meets:
        weaknesses.append(edu_details)
    if data_len < 30:
        weaknesses.append("Very limited application text — scores are conservative")

    return {
        "overall_score": overall,
        "skills_match": {"score": skill_score or 0, "matched": matched, "missing": missing, "partial": partial},
        "education_match": {"score": edu_score or 0, "meets_requirement": meets, "details": edu_details},
        "experience_match": {
            "score": exp_score or 0,
            "candidate_years": cand_exp,
            "required_years": req_exp,
            "details": exp_details,
        },
        "strengths": strengths or ["Manual review recommended"],
        "weaknesses": weaknesses or ["No major gaps from available text"],
        "recommendation": rec,
        "summary": " ".join(summary_parts),
        "model_version": "evidence-based-v2",
    }


def match_candidate(job: dict, profile: dict) -> dict:
    user_prompt = f"""Job Requirements:
Title: {job.get('title')}
Description: {(job.get('description') or '')[:1500]}
Skills: {job.get('required_skills') or job.get('requiredSkills')}
Education: {job.get('required_education') or job.get('requiredEducation')}
Experience years: {job.get('experience_years') or job.get('minExperience')}
Certifications: {job.get('required_certifications') or job.get('requiredCertifications')}

Candidate Profile (ONLY use facts from this text):
Name: {profile.get('full_name')}
Skills mentioned: {profile.get('skills')}
Education: {profile.get('education')}
Experience: {profile.get('experience')}
Total years: {profile.get('total_experience_years')}
Raw text: {(profile.get('raw_text') or '')[:6000]}"""

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
