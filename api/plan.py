"""Vercel text planning endpoint, using the same conservative local planner."""
from api.transcribe import handler as TranscriptionHandler


class handler(TranscriptionHandler):
    """Expose the shared planner through an explicit hosting entry class."""
    pass
