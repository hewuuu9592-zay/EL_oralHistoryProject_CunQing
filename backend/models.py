from sqlalchemy import Column, String, Integer, Float, Text, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Theme(Base):
    __tablename__ = "themes"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    emoji = Column(String, nullable=True)
    color_bg = Column(String, nullable=True)
    color_text = Column(String, nullable=True)
    is_default = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Person(Base):
    __tablename__ = "persons"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, index=True)
    gender = Column(String, nullable=True)
    birth_year = Column(Integer, nullable=True)
    death_year = Column(Integer, nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String, nullable=True)
    birthplace = Column(String, nullable=True)  # 出生地
    family_id = Column(String, default="default")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    stories = relationship("StoryPerson", back_populates="person")


class MigrationRecord(Base):
    __tablename__ = "migration_records"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    place_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    year = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    source_story_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class HistoricalEvent(Base):
    __tablename__ = "historical_events"
    id = Column(String, primary_key=True, default=generate_uuid)
    year = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False)  # 政治/经济/社会/文化/战争
    importance = Column(Integer, default=1)  # 1-3，决定卡片大小
    is_custom = Column(Boolean, default=False)  # 是否自定义
    created_by = Column(String, nullable=True)  # 创建者ID
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class EventMemory(Base):
    __tablename__ = "event_memories"
    id = Column(String, primary_key=True, default=generate_uuid)
    event_id = Column(String, ForeignKey("historical_events.id"), nullable=False)
    person_id = Column(String, ForeignKey("persons.id"), nullable=True)  # 可空，表示通用回忆
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class StoryHistoryRelation(Base):
    __tablename__ = "story_history_relations"
    id = Column(String, primary_key=True, default=generate_uuid)
    story_id = Column(String, ForeignKey("stories.id"), nullable=False)
    event_id = Column(String, ForeignKey("historical_events.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Relationship(Base):
    __tablename__ = "relationships"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_a_id = Column(String, ForeignKey("persons.id"), nullable=False)
    person_b_id = Column(String, ForeignKey("persons.id"), nullable=False)
    relation_type = Column(String, nullable=False)  # father/mother/spouse/sibling/child/other
    label = Column(String, nullable=True)

class Story(Base):
    __tablename__ = "stories"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_ids = Column(String, nullable=True)  # JSON array stored as string
    audio_url = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    summary = Column(String, nullable=True)
    title = Column(String, nullable=True)  # 故事标题（10字以内）
    year = Column(Integer, nullable=True)
    decade = Column(String, nullable=True)
    theme = Column(String, nullable=True)
    time_range = Column(String, nullable=True)  # 时间范围描述（如1958年冬天）
    tags = Column(String, nullable=True)  # JSON 数组标签
    involved_people = Column(String, nullable=True)  # JSON 数组涉及人物
    key_events = Column(String, nullable=True)  # JSON 数组核心事件
    related_history_id = Column(String, nullable=True)  # 外键关联 historical_events.id
    related_history = Column(String, nullable=True)  # 冗余存储事件标题
    transcription_status = Column(String, default="pending")  # pending, processing, done, failed
    ai_tag_status = Column(String, default="untagged")  # untagged, processing, done, failed
    source_session_id = Column(String, nullable=True)  # 来源采访session的id
    structured_snippets = Column(Text, nullable=True)  # 第二层结构化摘录，JSON字符串
    narrative_polish = Column(Text, nullable=True)  # 第三层叙事化润色文章
    generation_status = Column(String, default="pending")  # pending/generating_layer2/generating_layer3/done/failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    story_persons = relationship("StoryPerson", back_populates="story")

class StoryPerson(Base):
    __tablename__ = "story_persons"
    id = Column(String, primary_key=True, default=generate_uuid)
    story_id = Column(String, ForeignKey("stories.id"), nullable=False)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    is_protagonist = Column(Boolean, default=False)

    story = relationship("Story", back_populates="story_persons")
    person = relationship("Person", back_populates="stories")


class InterviewSession(Base):
    """采访会话"""
    __tablename__ = "interview_sessions"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    status = Column(String, default="active")  # active/completed/abandoned
    topic_hint = Column(String, nullable=True)  # 本次采访的主题方向（用户输入）
    topic = Column(String, nullable=True)  # 本次采访的主题（AI生成）
    chapter_id = Column(String, nullable=True)  # 关联的章节ID
    story_id = Column(String, nullable=True)  # 采访完成后关联生成的故事id
    round_count = Column(Integer, default=0)  # 实际轮次数
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class InterviewRound(Base):
    """采访轮次"""
    __tablename__ = "interview_rounds"
    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("interview_sessions.id"), nullable=False)
    round_index = Column(Integer, nullable=False)  # 第几轮，从1开始
    question = Column(Text, nullable=True)  # AI生成的问题文字
    audio_url = Column(String, nullable=True)  # 老人回答的语音文件路径
    transcript = Column(Text, nullable=True)  # 转写文字
    transcript_status = Column(String, default="pending")  # pending/processing/done/failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AutobiographyChapter(Base):
    """预设章节库"""
    __tablename__ = "autobiography_chapters"
    id = Column(String, primary_key=True, default=generate_uuid)
    order_index = Column(Integer, nullable=False, unique=True)  # 章节顺序 1-11
    title = Column(String, nullable=False)  # 章节名
    description = Column(Text, nullable=True)  # 一句引导语
    opening_questions = Column(Text, nullable=True)  # JSON数组，初始问题
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PersonChapter(Base):
    """人物章节进度"""
    __tablename__ = "person_chapters"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    chapter_id = Column(String, ForeignKey("autobiography_chapters.id"), nullable=False)
    status = Column(String, default="not_started")  # not_started/in_progress/completed/skipped
    skip_reason = Column(Text, nullable=True)  # 跳过原因
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChapterStory(Base):
    """章节与故事关联"""
    __tablename__ = "chapter_stories"
    id = Column(String, primary_key=True, default=generate_uuid)
    person_id = Column(String, ForeignKey("persons.id"), nullable=False)
    chapter_id = Column(String, ForeignKey("autobiography_chapters.id"), nullable=False)
    story_id = Column(String, ForeignKey("stories.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)