from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models
from database import SessionLocal, engine, get_db
from typing import Optional
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="根脉 API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class PersonBase(BaseModel):
    name: str
    birth_date: Optional[str] = None
    death_date: Optional[str] = None
    gender: Optional[str] = None
    bio: Optional[str] = None

class PersonCreate(PersonBase):
    pass

class Person(PersonBase):
    id: int
    class Config:
        orm_mode = True

class RelationshipCreate(BaseModel):
    person1_id: int
    person2_id: int
    relationship_type: str

class StoryBase(BaseModel):
    title: str
    content: str
    audio_url: Optional[str] = None

class StoryCreate(StoryBase):
    person_ids: List[int] = []

class Story(StoryBase):
    id: int
    class Config:
        orm_mode = True

# API Endpoints

@app.get("/persons", response_model=List[Person])
def read_persons(db: Session = Depends(get_db)):
    return db.query(models.Person).all()

@app.post("/persons", response_model=Person)
def create_person(person: PersonCreate, db: Session = Depends(get_db)):
    db_person = models.Person(**person.dict())
    db.add(db_person)
    db.commit()
    db.refresh(db_person)
    return db_person

@app.get("/persons/{id}", response_model=Person)
def read_person(id: int, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return db_person

@app.get("/relationships", response_model=List[dict])
def read_relationships(db: Session = Depends(get_db)):
    rels = db.query(models.Relationship).all()
    return [{"id": r.id, "person1_id": r.person1_id, "person2_id": r.person2_id, "relationship_type": r.relationship_type} for r in rels]

@app.post("/relationships")
def create_relationship(rel: RelationshipCreate, db: Session = Depends(get_db)):
    db_rel = models.Relationship(**rel.dict())
    db.add(db_rel)
    db.commit()
    db.refresh(db_rel)
    return db_rel

@app.get("/persons/{id}/stories", response_model=List[Story])
def read_person_stories(id: int, db: Session = Depends(get_db)):
    person = db.query(models.Person).filter(models.Person.id == id).first()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return person.stories

@app.post("/stories", response_model=Story)
def create_story(story: StoryCreate, db: Session = Depends(get_db)):
    # Create story
    db_story = models.Story(
        title=story.title,
        content=story.content,
        audio_url=story.audio_url
    )
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    
    # Link to persons
    for p_id in story.person_ids:
        db_sp = models.StoryPerson(story_id=db_story.id, person_id=p_id)
        db.add(db_sp)
    
    db.commit()
    db.refresh(db_story)
    return db_story

@app.get("/stories/{id}", response_model=Story)
def read_story(id: int, db: Session = Depends(get_db)):
    db_story = db.query(models.Story).filter(models.Story.id == id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="Story not found")
    return db_story

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
