import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = "gpt-5"
MIN_SEVERITY = "medium"
SEVERITY_ORDER = ["low", "medium", "high", "critical"]
