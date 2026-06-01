from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Person(Base):
    __tablename__ = "persons"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, index=True)
    gender = Column(String, nullable=True)
    birth_year = Column(Integer, nullable=True)
    death_year = Column(Integer, nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String, nullable=True)
    family_id = Column(String, default="default")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    stories = relationship("StoryPerson", back_populates="person")

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