from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Person(Base):
    __tablename__ = "persons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    birth_date = Column(String, nullable=True)
    death_date = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    bio = Column(Text, nullable=True)

    stories = relationship("Story", secondary="story_persons", back_populates="tagged_persons")

class Relationship(Base):
    __tablename__ = "relationships"
    id = Column(Integer, primary_key=True, index=True)
    person1_id = Column(Integer, ForeignKey("persons.id"))
    person2_id = Column(Integer, ForeignKey("persons.id"))
    relationship_type = Column(String) # e.g., 'parent', 'spouse'

class Story(Base):
    __tablename__ = "stories"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    tagged_persons = relationship("Person", secondary="story_persons", back_populates="stories")

class StoryPerson(Base):
    __tablename__ = "story_persons"
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"))
    person_id = Column(Integer, ForeignKey("persons.id"))
