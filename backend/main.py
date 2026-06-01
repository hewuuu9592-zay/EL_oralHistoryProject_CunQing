from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import json
import models
from database import SessionLocal, engine, get_db
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="根脉 API")

# CORS - 允许开发环境跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= Pydantic Models =============

class PersonBase(BaseModel):
    name: str
    gender: Optional[str] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    family_id: Optional[str] = "default"

class PersonCreate(PersonBase):
    pass

class Person(PersonBase):
    id: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class RelationshipCreate(BaseModel):
    person_a_id: str
    person_b_id: str
    relation_type: str  # father/mother/spouse/sibling/child/other
    label: Optional[str] = None

class RelationshipResponse(BaseModel):
    id: str
    person_a_id: str
    person_b_id: str
    relation_type: str
    label: Optional[str] = None
    class Config:
        from_attributes = True

class StoryBase(BaseModel):
    person_ids: Optional[str] = None  # JSON string
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    year: Optional[int] = None
    decade: Optional[str] = None
    theme: Optional[str] = None

class StoryCreate(StoryBase):
    pass

class Story(StoryBase):
    id: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class StoryPersonCreate(BaseModel):
    story_id: str
    person_id: str
    is_protagonist: Optional[bool] = False

class StoryPersonResponse(BaseModel):
    id: str
    story_id: str
    person_id: str
    is_protagonist: bool
    class Config:
        from_attributes = True

# ============= API Endpoints =============

@app.get("/persons", response_model=List[Person])
def read_persons(db: Session = Depends(get_db)):
    """返回所有人物列表"""
    return db.query(models.Person).order_by(models.Person.created_at.desc()).all()

@app.post("/persons", response_model=Person)
def create_person(person: PersonCreate, db: Session = Depends(get_db)):
    """新增人物"""
    db_person = models.Person(**person.model_dump())
    db.add(db_person)
    db.commit()
    db.refresh(db_person)
    return db_person

@app.get("/persons/{person_id}", response_model=Person)
def read_person(person_id: str, db: Session = Depends(get_db)):
    """返回单个人物详情"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")
    return db_person

@app.put("/persons/{person_id}", response_model=Person)
def update_person(person_id: str, person: PersonCreate, db: Session = Depends(get_db)):
    """更新人物信息"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")
    
    for key, value in person.model_dump().items():
        setattr(db_person, key, value)
    
    db.commit()
    db.refresh(db_person)
    return db_person

@app.delete("/persons/{person_id}")
def delete_person(person_id: str, db: Session = Depends(get_db)):
    """删除人物及其相关关系"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")
    
    # 删除关联的关系
    db.query(models.Relationship).filter(
        (models.Relationship.person_a_id == person_id) | 
        (models.Relationship.person_b_id == person_id)
    ).delete()
    
    db.delete(db_person)
    db.commit()
    return {"message": "人物已删除"}

@app.get("/relationships", response_model=List[RelationshipResponse])
def read_relationships(db: Session = Depends(get_db)):
    """返回所有关系"""
    return db.query(models.Relationship).all()

@app.post("/relationships", response_model=RelationshipResponse)
def create_relationship(rel: RelationshipCreate, db: Session = Depends(get_db)):
    """新增关系"""
    db_rel = models.Relationship(**rel.model_dump())
    db.add(db_rel)
    db.commit()
    db.refresh(db_rel)
    return db_rel

@app.delete("/relationships/{rel_id}")
def delete_relationship(rel_id: str, db: Session = Depends(get_db)):
    """删除关系"""
    db_rel = db.query(models.Relationship).filter(models.Relationship.id == rel_id).first()
    if db_rel is None:
        raise HTTPException(status_code=404, detail="关系不存在")
    db.delete(db_rel)
    db.commit()
    return {"message": "关系已删除"}

THEMES = [
    "家乡记忆", "工作岁月", "爱情婚姻", "历史亲历",
    "家族传承", "童年往事", "其他"
]

# 引导问题库
SUGGEST_QUESTIONS = [
    "您小时候最难忘的一件事是什么？",
    "您是怎么认识现在的家人的？",
    "您最喜欢的工作是什么？有什么回忆？",
    "您搬过几次家？最怀念哪里？",
    "您吃过最难忘的一顿饭是什么？",
    "您有什么传给后代的话想说？",
    "您年轻时的梦想是什么？实现了吗？",
    "您这辈子最骄傲的事情是什么？",
    "有什么让您大笑的趣事吗？",
    "您最想给子孙后代讲什么故事？",
]

import random

def get_suggest_question(person_name: str = None) -> str:
    """根据人物信息生成引导问题"""
    base_questions = SUGGEST_QUESTIONS.copy()
    # 根据人物年龄和时代可以定制问题，暂时随机返回
    random.shuffle(base_questions)
    return base_questions[0]


@app.get("/persons/{person_id}/stories", response_model=List[Story])
def read_person_stories(person_id: str, db: Session = Depends(get_db)):
    """返回该人物相关的所有故事，按 year 升序排列"""
    # 先找到该人物参与的所有 story_persons 记录
    sp_records = db.query(models.StoryPerson).filter(models.StoryPerson.person_id == person_id).all()
    story_ids = [sp.story_id for sp in sp_records]

    if not story_ids:
        return []

    # 按 year 升序排列，null 值排最后
    stories = db.query(models.Story).filter(models.Story.id.in_(story_ids)).order_by(
        models.Story.year.is_(None),
        models.Story.year.asc()
    ).all()
    return stories


@app.get("/persons/{person_id}/stories/themes")
def get_person_story_themes(person_id: str, db: Session = Depends(get_db)):
    """返回该人物所有故事的主题分布"""
    # 获取该人物所有故事的主题
    sp_records = db.query(models.StoryPerson).filter(models.StoryPerson.person_id == person_id).all()
    story_ids = [sp.story_id for sp in sp_records]

    if not story_ids:
        # 没有故事时，所有主题 count 都为 0
        return [{"theme": theme, "count": 0} for theme in THEMES]

    stories = db.query(models.Story.theme, models.Story.id).filter(models.Story.id.in_(story_ids)).all()

    # 统计各主题数量
    theme_counts = {}
    for theme in THEMES:
        theme_counts[theme] = 0

    for story in stories:
        theme = story.theme or "其他"
        if theme in theme_counts:
            theme_counts[theme] += 1
        else:
            theme_counts["其他"] += 1

    return [{"theme": theme, "count": count} for theme, count in theme_counts.items()]


@app.get("/persons/{person_id}/suggest-question")
def suggest_question(person_id: str, db: Session = Depends(get_db)):
    """返回引导问题"""
    # 获取人物信息
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if person is None:
        return {"question": "您有什么想留给后代的故事吗？"}

    # 生成引导问题
    question = get_suggest_question(person.name)
    return {"question": question}


# ============= Stories API =============

@app.get("/stories", response_model=List[Story])
def read_stories(db: Session = Depends(get_db)):
    """返回所有故事"""
    return db.query(models.Story).order_by(models.Story.created_at.desc()).all()

@app.post("/stories", response_model=Story)
def create_story(story: StoryCreate, db: Session = Depends(get_db)):
    """新增故事"""
    db_story = models.Story(**story.model_dump())
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    return db_story

@app.get("/stories/{story_id}", response_model=Story)
def read_story(story_id: str, db: Session = Depends(get_db)):
    """返回单个故事详情"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")
    return db_story

@app.post("/story-persons", response_model=StoryPersonResponse)
def create_story_person(sp: StoryPersonCreate, db: Session = Depends(get_db)):
    """将人物关联到故事"""
    db_sp = models.StoryPerson(**sp.model_dump())
    db.add(db_sp)
    db.commit()
    db.refresh(db_sp)
    return db_sp

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)