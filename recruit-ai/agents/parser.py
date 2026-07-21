"""Document parser agent — extracts structured profile from application text."""
import re
from lib.llm import call_llm

PARSER_SYSTEM = """You are a recruitment document parser. Extract ONLY information explicitly stated in the text.
Do not invent skills or experience. If a field is unknown, use empty array or null.
Return valid JSON:
full_name, email, phone, skills (array), education (array of {degree, institution, year}),
certifications (array), experience (array of {title, company, years, description}),
total_experience_years (number or null), raw_text (echo of input)"""

KEYWORDS = [
    "javascript", "typescript", "python", "java", "react", "angular", "vue", "node.js", "nodejs",
    "sql", "postgresql", "mongodb", "aws", "docker", "kubernetes", "sales", "marketing",
    "surgeon", "surgery", "medical", "healthcare", "accounting", "finance", "leadership",
    "communication", "management", "excel", "crm", "seo", "digital marketing",
]


def _extract_years(text: str):
    patterns = [
        r"(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)",
        r"(?:experience|exp)[:\s]+(\d+)\+?\s*(?:years?|yrs?)",
        r"(\d+)\+?\s*(?:years?|yrs?)\s+(?:in|working|professional)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return int(m.group(1))
    return None


def parse_document(text: str, fallback_name: str = "Candidate") -> dict:
    raw = (text or "").strip()
    if len(raw) < 20:
        return {
            "full_name": fallback_name,
            "skills": [],
            "education": [],
            "education_text": [],
            "certifications": [],
            "experience": [],
            "total_experience_years": None,
            "raw_text": raw,
        }

    result = call_llm(PARSER_SYSTEM, f"Parse this document:\n\n{raw[:8000]}")
    if result:
        result.setdefault("raw_text", raw)
        result.setdefault("education_text", [e.get("degree", "") for e in result.get("education", []) if isinstance(e, dict)])
        if result.get("total_experience_years") is None:
            result["total_experience_years"] = _extract_years(raw)
        return result

    lower = raw.lower()
    skills = []
    for kw in KEYWORDS:
        if kw in lower:
            skills.append(kw.title() if kw != "node.js" else "Node.js")

    years = _extract_years(raw)
    education = []
    edu_text = []
    for label, pattern in [
        ("PhD", r"ph\.?\s*d|doctorate"),
        ("Master's", r"master'?s?|mba|msc"),
        ("Bachelor's", r"bachelor'?s?|b\.sc|undergraduate|degree in"),
        ("Diploma", r"diploma"),
    ]:
        if re.search(pattern, lower):
            education.append({"degree": label, "institution": "", "year": None})
            edu_text.append(label)

    return {
        "full_name": fallback_name,
        "skills": skills,
        "education": education,
        "education_text": edu_text,
        "certifications": [],
        "experience": [],
        "total_experience_years": years,
        "raw_text": raw,
    }
