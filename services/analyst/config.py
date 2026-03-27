import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"
MIN_SEVERITY = "medium"
SEVERITY_ORDER = ["low", "medium", "high", "critical"]
