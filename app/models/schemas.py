from __future__ import annotations

from pydantic import BaseModel, Field


class WordIn(BaseModel):
    japanese: str = Field(min_length=1)
    reading: str = Field(default="")
    meaning_en: str = Field(min_length=1)
    meaning_ko: str = ""
    part_of_speech: str = ""
    jlpt_level: str = "N2"
    difficulty: int = Field(default=3, ge=1, le=5)
    tags: list[str] = []
    example_jp: str = ""
    example_en: str = ""
    example_ko: str = ""
    note: str = ""
    source: str = "manual"


class ReviewPayload(BaseModel):
    result: str = Field(pattern="^(forgot|hard|good|easy)$")
    mode: str = "jp_en"
