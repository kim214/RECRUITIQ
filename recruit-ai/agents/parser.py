"""Document parser agent — extracts structured profile from text."""
from lib.llm import call_llm

PARSER_SYSTEM = """You are a recruitment document parser. Extract structured candidate data.
Always return valid JSON with these fields:
full_name, email, phone, skills (array), education (array of {degree, institution, year}),
certifications (array), experience (array of {title, company, years, description}),
total_experience_years (number)"""


def parse_document(text: str, fallback_name: str = "Candidate") -> dict:
    if not text or len(text.strip()) < 20:
        return {
            "full_name": fallback_name,
            "skills": ["JavaScript", "React", "Node.js"],
            "education": [],
            "certifications": [],
            "experience": [],
            "total_experience_years": 2,
        }

    result = call_llm(PARSER_SYSTEM, f"Parse this document:\n\n{text[:8000]}")
    if result:
        return result

    # Local fallback: extract skills from common keywords
    skills = []
    keywords = ["javascript", "python", "react", "node", "sql", "java", "aws", "docker", "typescript"]
    lower = text.lower()
    for kw in keywords:
        if kw in lower:
            skills.append(kw.title() if kw != "node" else "Node.js")
    return {
        "full_name": fallback_name,
        "skills": skills or ["General"],
        "education": [],
        "certifications": [],
        "experience": [],
        "total_experience_years": 2,
    }
