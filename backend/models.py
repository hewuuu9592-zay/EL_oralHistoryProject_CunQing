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
    year = Column(Integer, nullable=True)
    decade = Column(String, nullable=True)
    theme = Column(String, nullable=True)
    transcription_status = Column(String, default="pending")  # pending, processing, done, failed
    ai_tag_status = Column(String, default="untagged")  # untagged, processing, done, failed
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