from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import json
import os
import time
import random
import base64
import subprocess
import json as json_lib
from dotenv import load_dotenv
from openai import OpenAI
import models
from database import SessionLocal, engine, get_db
from pydantic import BaseModel
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ============= FunASR Local Model (Lazy Load) =============
_funasr_model = None

def get_funasr_model():
    global _funasr_model
    if _funasr_model is None:
        from funasr import AutoModel
        _funasr_model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            vad_kwargs={"max_single_segment_time": 60000},
            punc_model="ct-punc",
        )
    return _funasr_model

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="根脉 API")

# 配置静态文件服务，使前端能够访问上传的音频
UPLOAD_DIR = "uploads/audio"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
    birthplace: Optional[str] = None
    family_id: Optional[str] = "default"
    relation_to_owner: Optional[str] = None
    is_owner: Optional[bool] = False


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    birthplace: Optional[str] = None
    family_id: Optional[str] = None
    relation_to_owner: Optional[str] = None
    is_owner: Optional[bool] = None

class Person(PersonBase):
    id: str
    created_at: Optional[datetime] = None
    relation_to_owner: Optional[str] = None
    is_owner: Optional[bool] = False
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
    transcription_status: Optional[str] = "pending"
    ai_tag_status: Optional[str] = "untagged"
    chapter_id: Optional[str] = None  # 关联的章节ID

class TagRequest(BaseModel):
    transcript: str


# ============= Interview Models =============

class InterviewStartResponse(BaseModel):
    """开始采访响应"""
    session_id: str
    question: str
    round_index: int
    topic_hint: str


class InterviewAnswerResponse(BaseModel):
    """回答问题响应"""
    round_id: str
    transcript_status: str


class InterviewRoundStatusResponse(BaseModel):
    """轮询转写状态响应"""
    transcript: Optional[str] = None
    status: str


class InterviewNextQuestionResponse(BaseModel):
    """下一问题响应"""
    question: str
    round_index: int
    should_end: bool


class InterviewCompleteResponse(BaseModel):
    """完成采访响应"""
    session_id: str
    story_id: Optional[str] = None
    status: str  # processing/completed/failed


class InterviewSessionBrief(BaseModel):
    """采访记录概要"""
    session_id: str
    created_at: Optional[datetime] = None
    round_count: int
    status: str
    topic_hint: Optional[str] = None
    story_id: Optional[str] = None
    story_title: Optional[str] = None
    generation_status: Optional[str] = None


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

class PersonBrief(BaseModel):
    """简短的人物信息"""
    id: str
    name: str
    avatar_url: Optional[str] = None
    class Config:
        from_attributes = True

class StoryWithPersons(BaseModel):
    """带人物列表的故事详情"""
    id: str
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    year: Optional[int] = None
    decade: Optional[str] = None
    theme: Optional[str] = None
    related_history_id: Optional[str] = None
    related_history: Optional[str] = None
    created_at: Optional[datetime] = None
    transcription_status: Optional[str] = "pending"
    ai_tag_status: Optional[str] = "untagged"
    persons: List[PersonBrief] = []
    # 采访生成的故事额外字段
    narrative_polish: Optional[str] = None
    structured_snippets: Optional[str] = None
    generation_status: Optional[str] = None
    source_session_id: Optional[str] = None
    time_range: Optional[str] = None
    tags: Optional[str] = None
    involved_people: Optional[str] = None
    key_events: Optional[str] = None
    title: Optional[str] = None
    class Config:
        from_attributes = True

class StoryFullCreate(BaseModel):
    """创建完整故事"""
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    year: Optional[int] = None
    decade: Optional[str] = None
    theme: Optional[str] = None
    person_ids: List[str] = []
    protagonist_id: Optional[str] = None

class StoryUpdate(BaseModel):
    """更新故事"""
    transcript: Optional[str] = None
    year: Optional[int] = None
    theme: Optional[str] = None
    person_ids: Optional[List[str]] = None
    related_history_id: Optional[str] = None
    related_history: Optional[str] = None

# ============= Migration Records =============

class MigrationRecordBase(BaseModel):
    place_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None
    source_story_id: Optional[str] = None
    chapter_id: Optional[str] = None


class MigrateExtractResponseItem(BaseModel):
    """AI 提取的迁徙建议（单项）"""
    place_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None
    confidence: str  # "故事中明确提到" / "推测" / "可能"


class MigrateExtractRequest(BaseModel):
    """提取迁徙记录的请求"""
    pass  # 空请求体，story_id 从路径获取


class MigrateConfirmItem(BaseModel):
    """确认的迁徙记录（单项）"""
    place_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None
    person_ids: List[str] = []


class MigrateConfirmRequest(BaseModel):
    """确认迁徙记录的请求"""
    migrations: List[MigrateConfirmItem]

class MigrationRecordCreate(MigrationRecordBase):
    pass

class MigrationRecordUpdate(BaseModel):
    place_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None
    sync_to_story: Optional[bool] = False  # 是否同步更新同故事的其他记录

class MigrationRecordResponse(MigrationRecordBase):
    id: str
    person_id: str
    chapter_id: Optional[str] = None
    class Config:
        from_attributes = True

class MigrationSuggestResponse(BaseModel):
    """AI 建议的迁徙节点"""
    place_name: str
    year: Optional[int] = None
    description: Optional[str] = None
    confidence: str  # "故事中明确提到" / "推测" / "可能"


class HistoricalEventResponse(BaseModel):
    """历史事件响应"""
    id: str
    year: int
    title: str
    description: Optional[str] = None
    category: str
    importance: int
    is_custom: Optional[bool] = False


class HistoricalEventUpdate(BaseModel):
    """更新自定义历史事件"""
    year: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    importance: Optional[int] = None


class CustomEventStoryLink(BaseModel):
    """自定义事件关联的故事"""
    story_ids: List[str] = []

    class Config:
        from_attributes = True


class EventMemoryCreate(BaseModel):
    """创建亲历记录"""
    content: str
    person_id: Optional[str] = None


class EventMemoryResponse(BaseModel):
    """亲历记录响应"""
    id: str
    event_id: str
    person_id: Optional[str] = None
    content: str

    class Config:
        from_attributes = True

# ============= Geocoding Helper =============

def geocode_place(place_name: str) -> Optional[dict]:
    """调用高德地图 API 获取地名坐标"""
    import requests as httpx_requests

    api_key = os.getenv("AMAP_API_KEY", "")
    if not api_key:
        return None

    try:
        url = "https://restapi.amap.com/v3/Geocode/geo"
        params = {
            "key": api_key,
            "address": place_name,
            "output": "json"
        }
        response = httpx_requests.get(url, params=params, timeout=5)
        data = response.json()

        if data.get("status") == "1" and data.get("geocodes"):
            geocode = data["geocodes"][0]
            location = geocode.get("location", "")
            if location:
                lng, lat = location.split(",")
                return {
                    "latitude": float(lat),
                    "longitude": float(lng)
                }
    except Exception as e:
        print(f"高德 API 调用失败: {str(e)}")
    return None

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


@app.patch("/persons/{person_id}", response_model=Person)
def patch_person(person_id: str, person: PersonUpdate, db: Session = Depends(get_db)):
    """部分更新人物信息"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")

    # Only update fields that are explicitly provided (not None)
    update_data = person.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_person, key, value)

    db.commit()
    db.refresh(db_person)
    return db_person

@app.delete("/persons/{person_id}")
def delete_person(person_id: str, force: bool = False, db: Session = Depends(get_db)):
    """删除人物及其相关关系"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 保护：不能删除主用户
    if db_person.is_owner:
        raise HTTPException(status_code=403, detail="无法删除主用户")

    # 检查 story_persons 表中是否有该人物的关联记录
    sp_records = db.query(models.StoryPerson).filter(models.StoryPerson.person_id == person_id).all()
    if sp_records:
        if not force:
            story_ids = [sp.story_id for sp in sp_records]
            raise HTTPException(
                status_code=409,
                detail=f"该人物关联了 {len(sp_records)} 个故事（story_id: {story_ids}），请使用 force=true 参数强制删除"
            )
        # force=True 时，先删除 story_persons 中的关联记录
        db.query(models.StoryPerson).filter(models.StoryPerson.person_id == person_id).delete()

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
        return {"question": "您有什么想留给后代的故事吗？", "suggested_theme": "其他"}

    # 1. 查询该人物已有故事的主题分布
    sp_records = db.query(models.StoryPerson).filter(models.StoryPerson.person_id == person_id).all()
    story_ids = [sp.story_id for sp in sp_records]

    existing_themes = []
    missing_themes = []

    if story_ids:
        stories = db.query(models.Story.theme).filter(models.Story.id.in_(story_ids)).all()
        existing_themes = [s.theme for s in stories if s.theme]
        # 找出没有讲述过的主题
        missing_themes = [t for t in THEMES if t not in existing_themes]

    # 2. 确定要提问的主题
    if missing_themes:
        suggested_theme = missing_themes[0]
    elif existing_themes:
        # 所有主题都有了，随机深挖一个
        suggested_theme = random.choice(existing_themes)
    else:
        # 没有任何故事，随机选一个
        suggested_theme = random.choice(THEMES)

    existing_str = "、" .join(existing_themes) if existing_themes else "暂无"

    # 3. 查询该人物生命跨度内的重大历史事件
    birth_year = person.birth_year or 1950
    current_year = datetime.now().year

    # 先查 importance=3 的
    major_events = db.query(models.HistoricalEvent).filter(
        models.HistoricalEvent.year >= birth_year,
        models.HistoricalEvent.year <= current_year,
        models.HistoricalEvent.importance == 3
    ).order_by(models.HistoricalEvent.year.asc()).all()

    # 如果太少，补充一些 importance=2 的
    if len(major_events) < 3:
        more_events = db.query(models.HistoricalEvent).filter(
            models.HistoricalEvent.year >= birth_year,
            models.HistoricalEvent.year <= current_year,
            models.HistoricalEvent.importance >= 2
        ).order_by(models.HistoricalEvent.year.asc()).all()

        # 合并去重
        existing_ids = {e.id for e in major_events}
        for e in more_events:
            if e.id not in existing_ids and len(major_events) < 8:
                major_events.append(e)

    events_list = [f"{e.year}年{e.title}" for e in major_events]
    events_str = "、".join(events_list) if events_list else "暂无重大历史事件"

    # 4. 调用豆包模型生成引导问题
    api_key = os.getenv("ARK_API_KEY", "")
    question = None

    # 根据性别确定代词
    if person.gender == "女":
        pronoun = "她"
        younger_pronoun = "她"
    else:
        pronoun = "他"
        younger_pronoun = "他"

    if api_key:
        try:
            client = OpenAI(
                api_key=api_key,
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            )

            prompt = f"""你是一位温柔、耐心、善于倾听的家庭回忆助手，正在陪伴一位老年人回忆往事。这位长辈名叫{person.name}，生于{birth_year}年。{pronoun}经历的重大历史事件包括：。{pronoun}已经讲述了这些主题的故事：{existing_str}。请为'{suggested_theme}'这个主题，生成一个温暖具体的引导问题。可以结合{pronoun}亲历的历史背景，例如可以问'{pronoun}经历某事件时在做什么'或'某事件后{pronoun}的生活发生了什么变化'。要求口语化，像晚辈在问长辈，不超过35字，直接返回问题本身，不要任何前缀。"""

            response = client.chat.completions.create(
                model="ep-20260521233914-gllp4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )

            question = response.choices[0].message.content.strip()

            # 去除可能的引号
            if question.startswith('"') and question.endswith('"'):
                question = question[1:-1]

        except Exception as e:
            print(f"豆包 API 调用失败: {str(e)}")
            question = None

    # 5. 回退逻辑
    if not question:
        fallback_questions = {
            "家乡记忆": f"{person.name}小时候住在哪儿，那边有什么好玩的事？",
            "工作岁月": f"{person.name}年轻时做什么工作？有什么难忘的事？",
            "爱情婚姻": f"{person.name}是怎么认识家人的？",
            "历史亲历": f"{person.name}经历过什么特别的时代？",
            "家族传承": f"{person.name}家里有什么传统或手艺？",
            "童年往事": f"{person.name}小时候最喜欢玩什么？",
            "其他": "您有什么想留给后代的故事吗？",
        }
        question = fallback_questions.get(suggested_theme, "您有什么想留给后代的故事吗？")

    return {"question": question, "suggested_theme": suggested_theme}


# ============= Interview APIs =============

@app.post("/persons/{person_id}/interviews/start", response_model=InterviewStartResponse)
def start_interview(person_id: str, request: dict = {}, db: Session = Depends(get_db)):
    """开始一次采访会话"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 清理：删除该人物的空记录（status='active' 且 round_count=0）
    empty_sessions = db.query(models.InterviewSession).filter(
        models.InterviewSession.person_id == person_id,
        models.InterviewSession.status == "active",
        models.InterviewSession.round_count == 0,
    ).all()
    for es in empty_sessions:
        # 删除关联的 rounds
        db.query(models.InterviewRound).filter(models.InterviewRound.session_id == es.id).delete()
        db.delete(es)
    db.commit()

    # 获取 chapter_id
    chapter_id = request.get("chapter_id")

    question = None
    topic_hint = None

    # 如果有 chapter_id，使用章节预设问题
    if chapter_id:
        chapter = db.query(models.AutobiographyChapter).filter(
            models.AutobiographyChapter.id == chapter_id
        ).first()
        if not chapter:
            raise HTTPException(status_code=404, detail="章节不存在")

        # 读取章节的 opening_questions
        opening_questions = json.loads(chapter.opening_questions) if chapter.opening_questions else []
        print(f"chapter found: {chapter.title}, opening_questions: {opening_questions}")  # 加这行
        if opening_questions:
            question = opening_questions[0]
        else:
            question = f"{person.name}给我们讲讲{chapter.title}的故事吧？"

        topic_hint = chapter.title
    else:
        # 原有逻辑：AI生成第一问
        # 获取用户偏好的主题
        preferred_themes = request.get("preferred_themes", [])
        preferred_str = "、".join(preferred_themes) if preferred_themes else ""

        # 分析该人物已有故事的空白主题
        sp_records = db.query(models.StoryPerson).filter(
            models.StoryPerson.person_id == person_id
        ).all()
        story_ids = [sp.story_id for sp in sp_records]

        existing_themes = []
        missing_themes = []
        if story_ids:
            stories = db.query(models.Story.theme).filter(
                models.Story.id.in_(story_ids)
            ).all()
            existing_themes = [s.theme for s in stories if s.theme]
            missing_themes = [t for t in THEMES if t not in existing_themes]

        # 确定本次采访的主题方向：优先从用户选择的主题中选
        if preferred_themes:
            candidate_themes = [t for t in preferred_themes if t in missing_themes] or preferred_themes
            suggested_theme = candidate_themes[0]
        elif missing_themes:
            suggested_theme = missing_themes[0]
        elif existing_themes:
            suggested_theme = random.choice(existing_themes)
        else:
            suggested_theme = random.choice(THEMES)
        topic_hint = suggested_theme

        # 生成第一个引导问题（结合历史语境）
        api_key = os.getenv("ARK_API_KEY", "")
        birth_year = person.birth_year or 1950

        # 查询生命跨度内的重大历史事件
        current_year = datetime.now().year
        major_events = db.query(models.HistoricalEvent).filter(
            models.HistoricalEvent.year >= birth_year,
            models.HistoricalEvent.year <= current_year,
            models.HistoricalEvent.importance >= 2
        ).order_by(models.HistoricalEvent.year.asc()).all()
        events_list = [f"{e.year}年{e.title}" for e in major_events][:8]
        events_str = "、".join(events_list) if events_list else "暂无重大历史事件"

        existing_str = "、".join(existing_themes) if existing_themes else "暂无"
        pronoun = "她" if person.gender == "女" else "他"

        # 生成 prompt 时加入用户偏好主题-prompt1
        theme_constraint = f"今天用户希望聊的主题是：{preferred_str}，请优先围绕这些主题生成引导问题。" if preferred_str else ""

        if api_key:
            try:
                client = OpenAI(
                    api_key=api_key,
                    base_url="https://ark.cn-beijing.volces.com/api/v3",
                )

                prompt = f"""你是一位温柔的擅长层层递进地、以令人舒服的方式提问的家族口述史采访者。这位长辈名叫{person.name}，生于{birth_year}年。{pronoun}经历的重大历史事件包括：{events_str}。{pronoun}已经讲述了这些主题的��事��{existing_str}。{theme_constraint}请为'{suggested_theme}'这个主题，生成第一个温暖具体的引导问题。要求口语化，像晚辈在问长辈，不超过35字，直接返回问题本身。"""

                response = client.chat.completions.create(
                    model="ep-20260521233914-gllp4",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                )

                question = response.choices[0].message.content.strip()
                if question.startswith('"') and question.endswith('"'):
                    question = question[1:-1]

            except Exception as e:
                print(f"豆包 API 调用失败: {str(e)}")
                question = None

        if not question:
            fallback_qs = {
                "家乡记忆": f"{person.name}给我们讲讲您小时候的故事吧？",
                "工作岁月": f"{person.name}您年轻时候有什么难忘的工作经历？",
                "爱情婚姻": f"{person.name}您是怎么认识家人的？",
                "历史亲历": f"{person.name}您还记得那些年经历过的特别的事吗？",
                "家族传承": f"{person.name}家里有什么传统想传给我们的？",
                "童年往事": f"{person.name}您小时候有什么有趣的故事？",
                "其他": f"{person.name}您有什么想留给后代的故事吗？",
            }
            question = fallback_qs.get(suggested_theme, f"{person.name}给我们讲讲您的故事吧？")

    # 创建采访会话
    session = models.InterviewSession(
        person_id=person_id,
        status="active",
        topic_hint=topic_hint,
        chapter_id=chapter_id,
        round_count=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 创建第一轮记录（问题）
    round_record = models.InterviewRound(
        session_id=session.id,
        round_index=1,
        question=question,
    )
    db.add(round_record)
    db.commit()

    return InterviewStartResponse(
        session_id=session.id,
        question=question,
        round_index=1,
        topic_hint=topic_hint,
    )


@app.post("/interviews/{session_id}/answer", response_model=InterviewAnswerResponse)
async def submit_answer(
    session_id: str,
    audio_file: UploadFile,
    background_tasks: BackgroundTasks,   # 移到前面
    db: Session = Depends(get_db),       # 有默认值（依赖）
    question: str = Form(None)           # 有默认值（表单字段）
):
    """接收音频回答，创建轮次记录"""
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="采访会话不存在")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="采访会话已结束")

    # 获取下一轮次（问答为一轮，所以+1）
    current_round_index = session.round_count + 1

    # 保存音频文件
    audio_dir = Path("static/audio/interviews")
    audio_dir.mkdir(parents=True, exist_ok=True)

    audio_filename = f"{session_id}_{current_round_index}.webm"
    audio_path = audio_dir / audio_filename
    content = await audio_file.read()
    with open(audio_path, "wb") as f:
        f.write(content)

    audio_url = f"/static/audio/interviews/{audio_filename}"

    # 创建轮次记录
    round_record = models.InterviewRound(
        session_id=session_id,
        round_index=current_round_index,
        question=question,
        audio_url=audio_url,
        transcript_status="processing",
    )
    db.add(round_record)

    # 更新会话轮次+1
    session.round_count = current_round_index

    db.commit()
    db.refresh(round_record)

    # 后台转写
    background_tasks.add_task(transcribe_audio_task, str(audio_path), round_record.id)

    return InterviewAnswerResponse(
        round_id=round_record.id,
        transcript_status="processing",
    )


async def transcribe_audio_task(audio_path: str, round_id: str):
    """后台转写音频"""
    db = SessionLocal()
    try:
        round_record = db.query(models.InterviewRound).filter(
            models.InterviewRound.id == round_id
        ).first()
        if not round_record:
            return

        # 调用 FunASR 转写
        transcript = transcribe_local(audio_path)
        round_record.transcript = transcript
        round_record.transcript_status = "done"
        db.commit()

    except Exception as e:
        print(f"转写失败: {e}")
        round_record.transcript_status = "failed"
        db.commit()
    finally:
        db.close()


@app.get("/interviews/{session_id}/rounds/{round_id}/status", response_model=InterviewRoundStatusResponse)
def get_round_status(session_id: str, round_id: str, db: Session = Depends(get_db)):
    """轮询转写状态"""
    round_record = db.query(models.InterviewRound).filter(
        models.InterviewRound.id == round_id
    ).first()
    if not round_record:
        raise HTTPException(status_code=404, detail="轮次不存在")

    return InterviewRoundStatusResponse(
        transcript=round_record.transcript,
        status=round_record.transcript_status,
    )


@app.get("/interviews/{session_id}/rounds")
def get_session_rounds(session_id: str, db: Session = Depends(get_db)):
    """获取采访会话的所有轮次（只返回有回答的轮次）"""
    rounds = db.query(models.InterviewRound).filter(
        models.InterviewRound.session_id == session_id,
        models.InterviewRound.transcript.isnot(None),
        models.InterviewRound.transcript != "",
    ).order_by(models.InterviewRound.round_index.asc()).all()

    return [
        {
            "id": r.id,
            "round_index": r.round_index,
            "question": r.question,
            "transcript": r.transcript,
            "transcript_status": r.transcript_status,
            "audio_url": r.audio_url,
        }
        for r in rounds
    ]


@app.post("/interviews/{session_id}/next-question", response_model=InterviewNextQuestionResponse)
def get_next_question(session_id: str, request: dict, db: Session = Depends(get_db)):
    """生成追问"""
    round_id = request.get("round_id")
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="采访会话不存在")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="采访会话已结束")

    # 获取上一轮的记录（不一定有 transcript）
    last_round = None
    latest_transcript = None
    if round_id:
        last_round = db.query(models.InterviewRound).filter(
            models.InterviewRound.id == round_id
        ).first()
        if last_round:
            latest_transcript = last_round.transcript

    # 获取本会话所有历史轮次（包括没有 transcript 的）
    all_rounds = db.query(models.InterviewRound).filter(
        models.InterviewRound.session_id == session_id,
    ).order_by(models.InterviewRound.round_index.asc()).all()

    # 构建对话历史
    history_parts = []
    for r in all_rounds:
        if r.question:
            history_parts.append(f"问：{r.question}")
        if r.transcript:
            history_parts.append(f"答：{r.transcript[:100]}...")
        else:
            history_parts.append(f"答：（未录音，跳过）")
    history = "\n".join(history_parts)

    current_index = session.round_count
    should_end = current_index >= 5

    # 调用豆包生成追问-prompt2
    api_key = os.getenv("ARK_API_KEY", "")
    question = None

    person = db.query(models.Person).filter(
        models.Person.id == session.person_id
    ).first()
    pronoun = "她" if person and person.gender == "女" else "他"

    # 如果有 chapter_id，获取章节标题作为上下文
    chapter_context = ""
    if session.chapter_id:
        chapter = db.query(models.AutobiographyChapter).filter(
            models.AutobiographyChapter.id == session.chapter_id
        ).first()
        if chapter:
            chapter_context = f"本次采访的主题是'{chapter.title}'，请围绕这个主题生成追问，不要偏离太远。"

    if api_key:
        try:
            client = OpenAI(
                api_key=api_key,
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            )

            prompt = f"""你是一位温柔的、擅长层层递进地、以令人舒服的方式提问的家族口述史采访者，正在陪伴一位老年人回忆往事。
                【核心原则】
                1. 像邻居家懂事的孩子一样聊天，绝不是记者采访。
                2. 优先顺着老人刚讲的内容，自然追问细节和感受，让对话像流水一样自然。
                3. 永远不要连续抛出多个问题，一次只问一个。
                4. 察觉到老人情绪低落或明确表示不想说时，绝不追问，转而安抚或自然岔开话题。
                5. 偶尔可以分享一点自己的“感受”（比如“听起来那一定很不容易”），让老人感觉你在认真听。

                【你需要做的事情】
                根据当前对话历史，判断现在应该：
                - 顺着故事追问一个细节（主线程）
                - 还是在老人沉默、卡壳、情绪回避时，温和地接上话（守护线程）

                {chapter_context}

                以下是对话历史：
                {history}

                {pronoun}刚才说：{latest_transcript}

                请根据他/她的回答，生成一个有针对性的追问。要求：抓住回答中最有价值的细节深挖，要理解老人的讲述偏好，口语化，像晚辈在追问长辈，不超过35字。如果话题已经充分展开（超过3轮），可以温和地引向新角度并设置should_end=true。
                直接返回JSON格式：{{"question": "追问内容", "should_end": true/false}}，不要任何前缀。"""

            response = client.chat.completions.create(
                model="ep-20260521233914-gllp4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )

            result_text = response.choices[0].message.content.strip()
            # 尝试解析 JSON
            import json as json_lib
            try:
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0]
                result = json_lib.loads(result_text.strip())
                question = result.get("question", "")
                # should_end 已经从上面判断了
            except:
                question = result_text

            if question.startswith('"') and question.endswith('"'):
                question = question[1:-1]

        except Exception as e:
            print(f"豆包 API 调用失败: {str(e)}")
            question = None

    if not question:
        question = "您能再多讲讲当时的情形吗？"

    # 创建新一轮问题记录
    new_round = models.InterviewRound(
        session_id=session_id,
        round_index=current_index,
        question=question,
    )
    db.add(new_round)
    # round_count 在 submit_answer 时已经更新了，这里不再重复+1
    db.commit()

    return InterviewNextQuestionResponse(
        question=question,
        round_index=current_index,
        should_end=should_end,
    )


@app.post("/interviews/{session_id}/complete", response_model=InterviewCompleteResponse)
def complete_interview(
    session_id: str,
    request: dict = {},
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """完成采访，生成唯一的故事并触发三层异步处理"""
    import json as json_lib

    chapter_id = request.get("chapter_id") if request else None

    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="采访会话不存在")

    if session.status != "active":
        raise HTTPException(status_code=400, detail="采访会话已结束")

    # 收集所有轮次的转写文字（保留轮次标记）
    rounds = db.query(models.InterviewRound).filter(
        models.InterviewRound.session_id == session_id,
        models.InterviewRound.transcript.isnot(None),
        models.InterviewRound.transcript_status == "done"
    ).order_by(models.InterviewRound.round_index.asc()).all()

    # ��果没有有效转写，标记为废弃
    if not rounds:
        session.status = "abandoned"
        db.commit()
        return InterviewCompleteResponse(
            session_id=session_id,
            story_id=None,
            status="failed",
        )

    combined_transcript = ""
    for r in rounds:
        if r.question:
            combined_transcript += f"【问】{r.question}\n"
        combined_transcript += f"【答-第{r.round_index}轮】{r.transcript}\n\n"

    # 创建唯一的故事记录
    story = models.Story(
        transcript=combined_transcript.strip(),
        source_session_id=session_id,
        person_ids=json_lib.dumps([session.person_id]),
        generation_status="pending",
        transcription_status="done",
    )
    db.add(story)
    db.flush()

    # 关联人物
    sp = models.StoryPerson(
        story_id=story.id,
        person_id=session.person_id,
        is_protagonist=True,
    )
    db.add(sp)

    # 如果有 chapter_id，关联章节并更新状态
    if chapter_id:
        print(f"[DEBUG] chapter_stories: chapter_id={chapter_id}, story_id={story.id}, person_id={session.person_id}")
        cs = models.ChapterStory(
            person_id=session.person_id,
            chapter_id=chapter_id,
            story_id=story.id,
        )
        db.add(cs)

        # 更新人物章节状态为 completed
        pc = db.query(models.PersonChapter).filter(
            models.PersonChapter.person_id == session.person_id,
            models.PersonChapter.chapter_id == chapter_id,
        ).first()
        if pc:
            pc.status = "completed"
            pc.updated_at = datetime.utcnow()
        else:
            pc = models.PersonChapter(
                person_id=session.person_id,
                chapter_id=chapter_id,
                status="completed",
            )
            db.add(pc)

    # 标记完成并关联故事
    session.status = "completed"
    session.story_id = story.id
    session.completed_at = datetime.now()
    db.commit()

    # 后台三层异步处理
    if background_tasks:
        background_tasks.add_task(compile_interview_stories_task, session_id)

    return InterviewCompleteResponse(
        session_id=session_id,
        story_id=story.id,
        status="processing",
    )


async def compile_interview_stories_task(session_id: str):
    """后台三层异步处理：提取信息 -> 结构化摘录 -> 叙事润色"""
    import json as json_lib

    db = SessionLocal()
    try:
        session = db.query(models.InterviewSession).filter(
            models.InterviewSession.id == session_id
        ).first()
        if not session or not session.story_id:
            return

        story = db.query(models.Story).filter(
            models.Story.id == session.story_id
        ).first()
        if not story:
            return

        # 获取转写内容
        transcript = story.transcript
        if not transcript:
            story.generation_status = "failed"
            db.commit()
            return

        # 调用豆包 API
        api_key = os.getenv("ARK_API_KEY", "")
        if not api_key:
            story.generation_status = "failed"
            db.commit()
            return

        try:
            client = OpenAI(
                api_key=api_key,
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            )

            theme_options = "/".join(THEMES)

            # ========== Layer 1: 提取基本信息 (summary, year, theme) ==========
            try:
                prompt_layer1 = f"""从以下采访内容中提取故事的基本信息：
- summary：一句话故事摘要
- year：故事发生的大致年份（如果没有明确年份，估算一个）
- theme：从以下主题选择其一：{theme_options}

只返回JSON格式，不要任何其他内容：
{{"summary": "xxx", "year": 1990, "theme": "工作岁月"}}

采访内容：
{transcript[:3000]}"""

                response = client.chat.completions.create(
                    model="ep-20260521233914-gllp4",
                    messages=[{"role": "user", "content": prompt_layer1}],
                    temperature=0.3,
                )

                result_text = response.choices[0].message.content.strip()

                try:
                    if "```json" in result_text:
                        result_text = result_text.split("```json")[1].split("```")[0]
                    layer1_data = json_lib.loads(result_text.strip())
                    story.summary = layer1_data.get("summary", "")[:100]
                    story.year = layer1_data.get("year")
                    story.theme = layer1_data.get("theme", "其他")
                except json_lib.JSONDecodeError as e:
                    print(f"解析Layer1失败: {e}")
            except Exception as e:
                print(f"Layer1调用失败: {e}")

            story.generation_status = "generating_layer2"
            db.commit()

            # ========== Layer 2: 结构化摘录 ==========
            try:
                prompt_layer2 = f"""以下是一段口述采访的完整对话记录：
{transcript[:4000]}

请提取结构化信息，只返回JSON：
{{
  "title": "故事标题（10字以内）",
  "summary": "一句话摘要（20字以内）",
  "year": 故事发生年份（整数或null）,
  "decade": "年代描述",
  "theme": "主题（从现有主题库选）",
  "time_range": "时间范围描述（如1958年冬天）",
  "tags": ["标签1", "标签2"],
  "involved_people": ["提到的人名"],
  "key_events": ["核心事件1", "核心事件2"]
}}"""

                response = client.chat.completions.create(
                    model="ep-20260521233914-gllp4",
                    messages=[{"role": "user", "content": prompt_layer2}],
                    temperature=0.5,
                )

                result_text = response.choices[0].message.content.strip()

                try:
                    if "```json" in result_text:
                        result_text = result_text.split("```json")[1].split("```")[0]
                    layer2_data = json_lib.loads(result_text.strip())
                    # 更新 story 表各个字段
                    story.title = layer2_data.get("title", "")[:10] if layer2_data.get("title") else None
                    story.summary = layer2_data.get("summary", "")[:20] if layer2_data.get("summary") else None
                    story.year = layer2_data.get("year")
                    story.decade = layer2_data.get("decade")
                    story.theme = layer2_data.get("theme")
                    story.time_range = layer2_data.get("time_range")
                    story.tags = json_lib.dumps(layer2_data.get("tags", [])) if layer2_data.get("tags") else "[]"
                    story.involved_people = json_lib.dumps(layer2_data.get("involved_people", [])) if layer2_data.get("involved_people") else "[]"
                    story.key_events = json_lib.dumps(layer2_data.get("key_events", [])) if layer2_data.get("key_events") else "[]"
                    # structured_snippets 存完整JSON字符串
                    story.structured_snippets = json_lib.dumps(layer2_data)
                except json_lib.JSONDecodeError as e:
                    print(f"解析Layer2失败: {e}")
                    story.structured_snippets = "{}"
            except Exception as e:
                print(f"Layer2调用失败: {e}")

            story.generation_status = "generating_layer3"
            db.commit()

            # ========== Layer 3: 叙事润色 ==========
            try:
                # 获取结构化信息作为上下文
                layer2_info = ""
                if story.structured_snippets:
                    try:
                        snippets = json_lib.loads(story.structured_snippets)
                        layer2_info = f"故事概要：{snippets.get('summary', '')}\n关键事件：{', '.join(snippets.get('key_events', []))}\n"
                    except:
                        pass

                prompt_layer3 = f"""以下是一位老人接受采访时的口述记录：
{transcript[:4000]}

{layer2_info}
请根据以上内容，为这位老人撰写一篇第一人称的自述文章。
要求：口语化，保留老人的语言风格，像她亲笔写的那样。
不必严格按时间顺序，让故事自然流淌。
篇幅200-400字，有温度，有细节，能打动人。
直接返回文章正文，不要任何前缀。"""

                response = client.chat.completions.create(
                    model="ep-20260521233914-gllp4",
                    messages=[{"role": "user", "content": prompt_layer3}],
                    temperature=0.7,
                )

                story.narrative_polish = response.choices[0].message.content.strip()
                story.generation_status = "done"
                story.ai_tag_status = "done"
                db.commit()
            except Exception as e:
                print(f"Layer3调用失败: {e}")
                # 即使Layer3失败，也确保状态不是卡在中间
                story.generation_status = "done"
                db.commit()

        except Exception as e:
            print(f"三层处理失败: {str(e)}")
            story.generation_status = "failed"
            db.commit()

    finally:
        db.close()


@app.post("/interviews/{session_id}/abandon")
def abandon_interview(session_id: str, db: Session = Depends(get_db)):
    """放弃采访"""
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="采访会话不存在")

    session.status = "abandoned"
    db.commit()

    return {"message": "采访已放弃"}


@app.delete("/interviews/{session_id}")
def delete_interview(session_id: str, db: Session = Depends(get_db)):
    """删除采访记录及关联故事"""
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="采访会话不存在")

    # 删除关联的故事（如果有）
    if session.story_id:
        # 删除 story_persons 关联
        db.query(models.StoryPerson).filter(
            models.StoryPerson.story_id == session.story_id
        ).delete()
        # 删除故事
        db.query(models.Story).filter(
            models.Story.id == session.story_id
        ).delete()

    # 删除所有轮次
    db.query(models.InterviewRound).filter(
        models.InterviewRound.session_id == session_id
    ).delete()

    # 删除会话
    db.delete(session)
    db.commit()

    return {"message": "采访记录已删除"}


@app.get("/persons/{person_id}/interviews", response_model=List[InterviewSessionBrief])
def get_person_interviews(person_id: str, db: Session = Depends(get_db)):
    """获取该人物的所有采访记录"""
    # 过滤：排除无效记录（0轮、非active、abandoned）
    sessions = db.query(models.InterviewSession).filter(
        models.InterviewSession.person_id == person_id,
        models.InterviewSession.status != "abandoned",
        ~(
            (models.InterviewSession.round_count == 0) & (models.InterviewSession.status != "active")
        )
    ).order_by(models.InterviewSession.created_at.desc()).all()

    result = []
    for session in sessions:
        # 获取关联的故事信息
        story_title = None
        generation_status = None
        if session.story_id:
            story = db.query(models.Story).filter(models.Story.id == session.story_id).first()
            if story:
                story_title = story.title
                generation_status = story.generation_status

        # 计算有实际回答的轮次（transcript 不为空的轮次）
        answered_rounds = db.query(models.InterviewRound).filter(
            models.InterviewRound.session_id == session.id,
            models.InterviewRound.transcript.isnot(None),
            models.InterviewRound.transcript != "",
        ).count()

        result.append(InterviewSessionBrief(
            session_id=session.id,
            created_at=session.created_at,
            round_count=answered_rounds,
            status=session.status,
            topic_hint=session.topic_hint,
            story_id=session.story_id,
            story_title=story_title,
            generation_status=generation_status,
        ))

    return result


@app.get("/persons/{person_id}/relations")
def get_person_relations(person_id: str, db: Session = Depends(get_db)):
    """从故事(person_ids)中自动推导关联关系"""
    import json
    from collections import defaultdict

    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 查找包含该人物的所有故事
    all_stories = db.query(models.Story).all()
    stories_with_person = [
        s for s in all_stories
        if s.person_ids and person_id in json.loads(s.person_ids)
    ]

    # 统计共现次数
    cooccur = defaultdict(int)
    for story in stories_with_person:
        person_ids = json.loads(story.person_ids)
        for pid in person_ids:
            if pid != person_id:
                cooccur[pid] += 1

    # 构建返回结果
    result = []
    for pid, count in cooccur.items():
        other_person = db.query(models.Person).filter(models.Person.id == pid).first()
        if other_person:
            result.append({
                "person": {
                    "id": other_person.id,
                    "name": other_person.name,
                    "avatar_url": other_person.avatar_url
                },
                "story_count": count,
                "relation_type": ""
            })

    # 按共同故事数量倒序
    result.sort(key=lambda x: x["story_count"], reverse=True)
    return result


# ============= Migration Records API =============

@app.get("/persons/{person_id}/migrations", response_model=List[MigrationRecordResponse])
def read_person_migrations(person_id: str, db: Session = Depends(get_db)):
    """返回该人物所有迁徙记录，按 year 升序"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    records = db.query(models.MigrationRecord).filter(
        models.MigrationRecord.person_id == person_id
    ).order_by(
        models.MigrationRecord.year.is_(None),
        models.MigrationRecord.year.asc()
    ).all()
    return records


@app.get("/persons/{person_id}/migrations/by-chapter")
def get_migrations_by_chapter(person_id: str, db: Session = Depends(get_db)):
    """返回该人物的迁徙记录，按章节分组"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 获取所有迁徙记录
    records = db.query(models.MigrationRecord).filter(
        models.MigrationRecord.person_id == person_id
    ).order_by(
        models.MigrationRecord.year.is_(None),
        models.MigrationRecord.year.asc()
    ).all()

    # 获取章节信息
    chapters = db.query(models.AutobiographyChapter).all()
    chapter_info = {c.id: {"title": c.title, "order_index": c.order_index} for c in chapters}

    # 按章节分组
    grouped = {}
    for r in records:
        cid = r.chapter_id or "other"
        if cid not in grouped:
            grouped[cid] = {
                "chapter_id": cid if cid != "other" else None,
                "chapter_title": chapter_info.get(cid, {}).get("title", "其他") if cid != "other" else "其他",
                "order_index": chapter_info.get(cid, {}).get("order_index", 999) if cid != "other" else 999,
                "migrations": []
            }
        grouped[cid]["migrations"].append({
            "id": r.id,
            "place_name": r.place_name,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "year": r.year,
            "description": r.description
        })

    # 按 order_index 排序
    result = sorted(grouped.values(), key=lambda x: x["order_index"])
    return result


@app.post("/persons/{person_id}/migrations", response_model=MigrationRecordResponse)
def create_migration_record(person_id: str, migration: MigrationRecordCreate, db: Session = Depends(get_db)):
    """新增一条迁徙记录"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 如果没有提供坐标，尝试调用高德 API 获取
    latitude = migration.latitude
    longitude = migration.longitude
    if not latitude or not longitude:
        geo_result = geocode_place(migration.place_name)
        if geo_result:
            latitude = geo_result["latitude"]
            longitude = geo_result["longitude"]

    db_record = models.MigrationRecord(
        person_id=person_id,
        place_name=migration.place_name,
        latitude=latitude,
        longitude=longitude,
        year=migration.year,
        description=migration.description,
        chapter_id=migration.chapter_id
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.delete("/persons/{person_id}/migrations/{mid}")
def delete_migration_record(person_id: str, mid: str, sync_to_story: bool = False, db: Session = Depends(get_db)):
    """删除一条迁徙记录"""
    record = db.query(models.MigrationRecord).filter(
        models.MigrationRecord.id == mid,
        models.MigrationRecord.person_id == person_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="迁徙记录不存在")

    # 如果 sync_to_story=true 且有 source_story_id，删除所有相同 source_story_id 的记录
    if sync_to_story and record.source_story_id:
        db.query(models.MigrationRecord).filter(
            models.MigrationRecord.source_story_id == record.source_story_id
        ).delete()
    else:
        db.delete(record)

    db.commit()
    return {"message": "迁徙记录已删除"}


@app.patch("/persons/{person_id}/migrations/{mid}", response_model=MigrationRecordResponse)
def update_migration_record(person_id: str, mid: str, migration_update: MigrationRecordUpdate, db: Session = Depends(get_db)):
    """编辑一条迁徙记录"""
    record = db.query(models.MigrationRecord).filter(
        models.MigrationRecord.id == mid,
        models.MigrationRecord.person_id == person_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="迁徙记录不存在")

    update_data = migration_update.model_dump(exclude_unset=True)

    # 提取 sync_to_story 参数
    sync_to_story = update_data.pop("sync_to_story", False)

    # 如果修改了地名且没有提供坐标，重新获取坐标
    if "place_name" in update_data and ("latitude" not in update_data or not update_data.get("latitude")):
        geo_result = geocode_place(update_data["place_name"])
        if geo_result:
            update_data["latitude"] = geo_result["latitude"]
            update_data["longitude"] = geo_result["longitude"]

    # 如果 sync_to_story=true 且有 source_story_id，同步更新所有相同 source_story_id 的记录
    if sync_to_story and record.source_story_id:
        related_records = db.query(models.MigrationRecord).filter(
            models.MigrationRecord.source_story_id == record.source_story_id
        ).all()
        for r in related_records:
            for key, value in update_data.items():
                if value is not None:
                    setattr(r, key, value)
    else:
        # 普通更新只更新当前记录
        for key, value in update_data.items():
            if value is not None:
                setattr(record, key, value)

    db.commit()
    return record


def extract_locations_from_transcripts(person_id: str, db: Session) -> List[dict]:
    """从该人物所有故事的 transcript 中提取地名和年份"""
    import requests as httpx_requests

    api_key = os.getenv("ARK_API_KEY", "")
    if not api_key:
        return []

    # 获取该人物所有故事
    sp_records = db.query(models.StoryPerson).filter(
        models.StoryPerson.person_id == person_id
    ).all()
    story_ids = [sp.story_id for sp in sp_records]
    if not story_ids:
        return []

    stories = db.query(models.Story).filter(
        models.Story.id.in_(story_ids),
        models.Story.transcript.isnot(None),
        models.Story.transcript != ""
    ).all()

    # 拼接所有 transcript
    all_transcripts = []
    for story in stories:
        if story.transcript:
            year_info = f"（{story.year}年）" if story.year else ""
            all_transcripts.append(f"故事{year_info}：{story.transcript}")

    if not all_transcripts:
        return []

    combined_text = "\n\n".join(all_transcripts)

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
        )

        prompt = f"""从以下口述故事中提取可能的地名和时间信息。

要求：
- 只提取明确的地点移动/迁徙相关事件
- 如果提到的是模糊地址（如"村里"、"镇上"），请转换为标准地名（如 xx省xx市xx县xx镇）
- 年份必须是 4 位数字整数

只返回 JSON 数组格式，不要任何其他内容。格式示例：
[
  {{"place_name": "xx省xx市", "year": 1990, "description": "迁到这个地方", "confidence": "故事中明确提到"}},
  {{"place_name": "xx省xx市", "year": 2000, "description": "搬到这里定居", "confidence": "推测"}},
  {{"place_name": "xx省xx市", "year": null, "description": "来此地探亲", "confidence": "可能"}}
]

注意：
- confidence 取值："故事中明确提到"（文本直接说了时间地点）/ "推测"（根据上下文推断）/ "可能"（不太确定）
- 如果没有提取到任何迁徙相关地点，返回空数组 []

故事内容：
{combined_text}"""

        response = client.chat.completions.create(
            model="ep-20260521233914-gllp4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )

        result_text = response.choices[0].message.content.strip()

        # 尝试解析 JSON
        try:
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            return json_lib.loads(result_text.strip())
        except json_lib.JSONDecodeError:
            print(f"解析 AI 返回 JSON 失败: {result_text}")
            return []

    except Exception as e:
        print(f"豆包 API 调用失败: {str(e)}")
        return []


@app.get("/persons/{person_id}/migrations/suggest", response_model=List[MigrationSuggestResponse])
def suggest_migrations(person_id: str, db: Session = Depends(get_db)):
    """从故事 transcript 中提取建议的迁徙节点"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    suggestions = extract_locations_from_transcripts(person_id, db)
    return suggestions


def extract_locations_from_single_story(story_id: str, db: Session) -> List[dict]:
    """从单个故事的 transcript 中提取地名和年份"""
    import requests as httpx_requests

    api_key = os.getenv("ARK_API_KEY", "")
    if not api_key:
        return []

    # 获取故事
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story or not story.transcript:
        return []

    transcript = story.transcript

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
        )

        prompt = f"""从以下口述故事中提取所有明确提到的地名。

要求：
- 只提取与地点/迁徙相关的提及
- 如果提到的是模糊地址（如"村里"、"镇上"），请转换为标准地名（如 xx省xx市xx县xx镇）
- 年份必须是 4 位数字整数

只返回 JSON 数组格式，不要任何其他内容。格式示例：
[
  {{"place_name": "xx省xx市", "year": 1990, "description": "在这里发生过...", "confidence": "故事中明确提到"}},
  {{"place_name": "xx省xx市", "year": 2000, "description": "搬到这里定居", "confidence": "推测"}},
  {{"place_name": "xx省xx市", "year": null, "description": "来此地探亲", "confidence": "可能"}}
]

注意：
- confidence 取值："故事中明确提到"（文本直接说了时间地点）/ "推测"（根据上下文推断）/ "可能"（不太确定）
- 如果没有提取到任何地名，返回空数组 []

故事内容：
{transcript}"""

        response = client.chat.completions.create(
            model="ep-20260521233914-gllp4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )

        result_text = response.choices[0].message.content.strip()

        # 尝试解析 JSON
        try:
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            return json_lib.loads(result_text.strip())
        except json_lib.JSONDecodeError:
            print(f"解析 AI 返回 JSON 失败: {result_text}")
            return []

    except Exception as e:
        print(f"豆包 API 调用失败: {str(e)}")
        return []


def geocode_place_nominatim(place_name: str) -> Optional[dict]:
    """调用 Nominatim API 获取地名坐标"""
    import requests as httpx_requests

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": place_name,
            "format": "json",
            "limit": 1,
        }
        headers = {
            "User-Agent": "FamilyTreeApp/1.0"
        }
        response = httpx_requests.get(url, params=params, headers=headers, timeout=5)
        data = response.json()

        if data and len(data) > 0:
            return {
                "latitude": float(data[0]["lat"]),
                "longitude": float(data[0]["lon"])
            }
    except Exception as e:
        print(f"Nominatim API 调用失败: {str(e)}")
    return None


@app.post("/stories/{story_id}/extract-migrations", response_model=List[MigrateExtractResponseItem])
def extract_story_migrations(story_id: str, db: Session = Depends(get_db)):
    """从故事中提取迁徙记录建议（不写入数据库）"""
    # 检查故事是否存在
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    # 调用 AI 提取地名
    extracted = extract_locations_from_single_story(story_id, db)

    # 为每个地名调用 Nominatim 获取坐标
    result = []
    for item in extracted:
        place_name = item.get("place_name")
        latitude = None
        longitude = None

        if place_name:
            geo_result = geocode_place_nominatim(place_name)
            if geo_result:
                latitude = geo_result["latitude"]
                longitude = geo_result["longitude"]

        result.append(MigrateExtractResponseItem(
            place_name=place_name,
            latitude=latitude,
            longitude=longitude,
            year=item.get("year"),
            description=item.get("description"),
            confidence=item.get("confidence", "可能")
        ))

    return result


@app.post("/stories/{story_id}/confirm-migrations")
def confirm_story_migrations(story_id: str, request: MigrateConfirmRequest, db: Session = Depends(get_db)):
    """确认并写入迁徙记录"""
    # 检查故事是否存在
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    # 查询该故事关联的章节ID
    chapter_id = None
    cs_record = db.query(models.ChapterStory).filter(
        models.ChapterStory.story_id == story_id
    ).first()
    if cs_record:
        chapter_id = cs_record.chapter_id

    written_count = 0
    for migration in request.migrations:
        # 为每个人物写入一条记录
        for person_id in migration.person_ids:
            db_record = models.MigrationRecord(
                person_id=person_id,
                place_name=migration.place_name,
                latitude=migration.latitude,
                longitude=migration.longitude,
                year=migration.year,
                description=migration.description,
                source_story_id=story_id,
                chapter_id=chapter_id
            )
            db.add(db_record)
            written_count += 1

    db.commit()
    return {"written_count": written_count}


@app.get("/persons/{person_id}/unextracted-stories")
def get_unextracted_stories(person_id: str, db: Session = Depends(get_db)):
    """获取该人物尚未提取过迁徙记录的故事"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 获取该人物关联的所有故事
    sp_records = db.query(models.StoryPerson).filter(
        models.StoryPerson.person_id == person_id
    ).all()
    story_ids = [sp.story_id for sp in sp_records]

    if not story_ids:
        return []

    # 找出已有迁徙记录来源的故事 ID
    extracted_story_ids = db.query(models.MigrationRecord.source_story_id).filter(
        models.MigrationRecord.source_story_id.in_(story_ids),
        models.MigrationRecord.source_story_id.isnot(None)
    ).distinct().all()
    extracted_story_ids = [s[0] for s in extracted_story_ids]

    # 过滤掉已提取的故事
    unextracted_ids = [sid for sid in story_ids if sid not in extracted_story_ids]

    if not unextracted_ids:
        return []

    # 获取故事列表
    stories = db.query(models.Story).filter(
        models.Story.id.in_(unextracted_ids),
        models.Story.transcript.isnot(None),
        models.Story.transcript != ""
    ).all()

    return [
        {
            "id": s.id,
            "transcript": s.transcript,
            "year": s.year,
            "theme": s.theme
        }
        for s in stories
    ]


@app.post("/persons/{person_id}/batch-extract-migrations")
def batch_extract_migrations(person_id: str, db: Session = Depends(get_db)):
    """一键提取并写入该人物所有故事的迁徙记录"""
    # 检查人物是否存在
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人物不存在")

    # 获取未提取的故事
    sp_records = db.query(models.StoryPerson).filter(
        models.StoryPerson.person_id == person_id
    ).all()
    story_ids = [sp.story_id for sp in sp_records]

    if not story_ids:
        return {"written_count": 0, "stories_count": 0}

    # 找出已有迁徙记录来源的故事 ID
    extracted_story_ids = db.query(models.MigrationRecord.source_story_id).filter(
        models.MigrationRecord.source_story_id.in_(story_ids),
        models.MigrationRecord.source_story_id.isnot(None)
    ).distinct().all()
    extracted_story_ids = [s[0] for s in extracted_story_ids]

    # 过滤掉已提取的故事
    unextracted_ids = [sid for sid in story_ids if sid not in extracted_story_ids]

    if not unextracted_ids:
        return {"written_count": 0, "stories_count": 0}

    written_count = 0
    target_stories = db.query(models.Story).filter(
        models.Story.id.in_(unextracted_ids),
        models.Story.transcript.isnot(None),
        models.Story.transcript != ""
    ).all()

    for story in target_stories:
        # 获取该故事关联的人物列表
        story_persons = db.query(models.StoryPerson).filter(
            models.StoryPerson.story_id == story.id
        ).all()
        story_person_ids = [sp.person_id for sp in story_persons]

        # 查询该故事关联的章节ID
        chapter_id = None
        cs_record = db.query(models.ChapterStory).filter(
            models.ChapterStory.story_id == story.id
        ).first()
        if cs_record:
            chapter_id = cs_record.chapter_id

        # 调用 AI 提取地名
        extracted = extract_locations_from_single_story(story.id, db)

        if not extracted:
            continue

        # 为每个地点获取坐标
        for item in extracted:
            place_name = item.get("place_name")
            latitude = None
            longitude = None

            if place_name:
                geo_result = geocode_place_nominatim(place_name)
                if geo_result:
                    latitude = geo_result["latitude"]
                    longitude = geo_result["longitude"]

            # 为该故事关联的每个人物写入记录
            for pid in story_person_ids:
                db_record = models.MigrationRecord(
                    person_id=pid,
                    place_name=place_name,
                    latitude=latitude,
                    longitude=longitude,
                    year=item.get("year"),
                    description=item.get("description"),
                    source_story_id=story.id,
                    chapter_id=chapter_id
                )
                db.add(db_record)
                written_count += 1

    db.commit()
    return {"written_count": written_count, "stories_count": len(target_stories)}


# ============= FunASR Local Transcription Helper =============

def convert_to_wav(input_path: str) -> str:
    """把任意格式音频转为 wav，供 FunASR 使用"""
    output_path = input_path.rsplit(".", 1)[0] + ".wav"
    result = subprocess.run(
        ["ffmpeg", "-i", input_path, "-ar", "16000", "-ac", "1", output_path, "-y"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        # 转换失败就直接用原文件试试
        return input_path
    return output_path

def transcribe_local(audio_path: str) -> str:
    """用 FunASR 本地转写音频文件，返回纯文字"""
    try:
        wav_path = convert_to_wav(audio_path)
        model = get_funasr_model()
        res = model.generate(
            input=wav_path,
            batch_size_s=300,
        )
        
        # 转换后的临时文件清理
        if wav_path != audio_path and os.path.exists(wav_path):
            os.remove(wav_path)
            
        if res and len(res) > 0:
            return res[0].get("text", "").strip()
        return "（转写结果为空）"
    except Exception as e:
        raise Exception(f"FunASR 转写失败: {str(e)}")

# ============= Stories API =============

@app.get("/stories", response_model=List[Story])
def read_stories(db: Session = Depends(get_db)):
    """返回所有故事"""
    return db.query(models.Story).order_by(models.Story.created_at.desc()).all()

@app.get("/stories/count")
def get_stories_count(db: Session = Depends(get_db)):
    """返回故事总数"""
    count = db.query(models.Story).count()
    return {"count": count}

# ============= Autobiography Chapters API =============

@app.get("/chapters")
def get_chapters(db: Session = Depends(get_db)):
    """返回所有章节定义，按 order_index 排序"""
    chapters = db.query(models.AutobiographyChapter).order_by(models.AutobiographyChapter.order_index).all()
    return [{
        "id": c.id,
        "order_index": c.order_index,
        "title": c.title,
        "description": c.description,
        "opening_questions": json.loads(c.opening_questions) if c.opening_questions else [],
    } for c in chapters]

@app.post("/chapters/init")
def init_chapters(db: Session = Depends(get_db)):
    """初始化11个预设章节到数据库"""
    existing = db.query(models.AutobiographyChapter).first()
    if existing:
        return {"message": "章节已初始化"}

    chapters_data = [
        {"order_index": 1, "title": "我是谁", "description": "", "opening_questions": '["您叫什么名字？今年多大了？请您做一个简单的自我介绍", "您的名字有什么特殊的含义吗？是谁给您取的？小时候有绰号吗？", "您出生在哪个年代、哪个地方？", "您觉得自己是个怎样的人？" ]'},
        {"order_index": 2, "title": "我的来处", "description": "", "opening_questions": "[]"},
        {"order_index": 3, "title": "童年岁月", "description": "", "opening_questions": "[]"},
        {"order_index": 4, "title": "求学时代", "description": "", "opening_questions": "[]"},
        {"order_index": 5, "title": "工作与理想", "description": "", "opening_questions": "[]"},
        {"order_index": 6, "title": "爱情与婚姻", "description": "", "opening_questions": "[]"},
        {"order_index": 7, "title": "为人亲长", "description": "", "opening_questions": "[]"},
        {"order_index": 8, "title": "坎坷与选择", "description": "", "opening_questions": "[]"},
        {"order_index": 9, "title": "高光与遗憾", "description": "", "opening_questions": "[]"},
        {"order_index": 10, "title": "现在的日子", "description": "", "opening_questions": "[]"},
        {"order_index": 11, "title": "寄语", "description": "", "opening_questions": "[]"},
    ]
    for data in chapters_data:
        chapter = models.AutobiographyChapter(**data)
        db.add(chapter)
    db.commit()
    return {"message": "章节初始化完成"}

@app.get("/persons/{person_id}/chapters")
def get_person_chapters(person_id: str, db: Session = Depends(get_db)):
    """返回该人物所有章节的状态列表"""
    # 获取该人物的章节进度记录
    person_chapters = db.query(models.PersonChapter).filter(
        models.PersonChapter.person_id == person_id
    ).all()
    chapter_status_map = {pc.chapter_id: pc for pc in person_chapters}

    # 获取所有预设章节
    all_chapters = db.query(models.AutobiographyChapter).order_by(
        models.AutobiographyChapter.order_index
    ).all()

    result = []
    for c in all_chapters:
        pc = chapter_status_map.get(c.id)
        status = pc.status if pc else "not_started"
        skip_reason = pc.skip_reason if pc else None

        # 统计该章节关联的故事数量（通过 chapter_stories 关联）
        chapter_stories = db.query(models.ChapterStory).filter(
            models.ChapterStory.person_id == person_id,
            models.ChapterStory.chapter_id == c.id,
        ).all()
        stories_count = len(chapter_stories)

        result.append({
            "chapter_id": c.id,
            "order_index": c.order_index,
            "title": c.title,
            "description": c.description,
            "opening_questions": json.loads(c.opening_questions) if c.opening_questions else [],
            "status": status,
            "skip_reason": skip_reason,
            "stories_count": stories_count,
        })

    return result

@app.post("/persons/{person_id}/chapters/{chapter_id}/status")
def update_chapter_status(
    person_id: str,
    chapter_id: str,
    request: dict,
    db: Session = Depends(get_db)
):
    """更新章节状态"""
    status = request.get("status")
    skip_reason = request.get("skip_reason")

    if status not in ["not_started", "in_progress", "completed"]:
        raise HTTPException(status_code=400, detail="无效状态")

    # 查找或创建人物章节记录
    pc = db.query(models.PersonChapter).filter(
        models.PersonChapter.person_id == person_id,
        models.PersonChapter.chapter_id == chapter_id,
    ).first()

    if not pc:
        pc = models.PersonChapter(
            person_id=person_id,
            chapter_id=chapter_id,
        )
        db.add(pc)

    pc.status = status
    if skip_reason:
        pc.skip_reason = skip_reason
    pc.updated_at = datetime.utcnow()

    db.commit()
    return {"message": "状态更新成功"}

@app.get("/persons/{person_id}/chapters/{chapter_id}/stories")
def get_chapter_stories(person_id: str, chapter_id: str, db: Session = Depends(get_db)):
    """返回该人物该章节关联的所有故事列表"""
    chapter_stories = db.query(models.ChapterStory).filter(
        models.ChapterStory.person_id == person_id,
        models.ChapterStory.chapter_id == chapter_id,
    ).all()

    story_ids = [cs.story_id for cs in chapter_stories]
    stories = db.query(models.Story).filter(models.Story.id.in_(story_ids)).all()

    return [{
        "id": s.id,
        "title": s.title,
        "transcript": s.transcript[:200] if s.transcript else None,
        "year": s.year,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    } for s in stories]

@app.get("/chapters/next/{person_id}")
def get_next_chapter(person_id: str, db: Session = Depends(get_db)):
    """返回该人物下一个待完成的章节"""
    # 获取该人物的章节进度
    person_chapters = db.query(models.PersonChapter).filter(
        models.PersonChapter.person_id == person_id,
        models.PersonChapter.status == "not_started",
    ).all()

    if person_chapters:
        # 找到第一个 not_started 的章节
        pc = person_chapters[0]
        chapter = db.query(models.AutobiographyChapter).filter(
            models.AutobiographyChapter.id == pc.chapter_id,
        ).first()
        if chapter:
            return {
                "chapter_id": chapter.id,
                "order_index": chapter.order_index,
                "title": chapter.title,
                "description": chapter.description,
                "opening_questions": json.loads(chapter.opening_questions) if chapter.opening_questions else [],
            }

    # 检查是否有未创建的章节记录
    all_chapters = db.query(models.AutobiographyChapter).order_by(
        models.AutobiographyChapter.order_index
    ).all()

    for c in all_chapters:
        exists = db.query(models.PersonChapter).filter(
            models.PersonChapter.person_id == person_id,
            models.PersonChapter.chapter_id == c.id,
        ).first()
        if not exists:
            return {
                "chapter_id": c.id,
                "order_index": c.order_index,
                "title": c.title,
                "description": c.description,
                "opening_questions": json.loads(c.opening_questions) if c.opening_questions else [],
            }

    return None

@app.post("/stories", response_model=Story)
def create_story(story: StoryCreate, db: Session = Depends(get_db)):
    """新增故事"""
    story_data = story.model_dump()
    chapter_id = story_data.pop("chapter_id", None)

    db_story = models.Story(**story_data)
    db.add(db_story)
    db.commit()
    db.refresh(db_story)

    # 如果有 chapter_id，关联章节并更新状态
    if chapter_id and db_story.person_ids:
        # 获取关联的人物ID
        person_ids = json.loads(db_story.person_ids) if db_story.person_ids else []
        if person_ids:
            person_id = person_ids[0]

            # 创建章节故事关联
            cs = models.ChapterStory(
                person_id=person_id,
                chapter_id=chapter_id,
                story_id=db_story.id,
            )
            db.add(cs)

            # 更新人物章节状态为 completed
            pc = db.query(models.PersonChapter).filter(
                models.PersonChapter.person_id == person_id,
                models.PersonChapter.chapter_id == chapter_id,
            ).first()
            if pc:
                pc.status = "completed"
                pc.updated_at = datetime.utcnow()
            else:
                pc = models.PersonChapter(
                    person_id=person_id,
                    chapter_id=chapter_id,
                    status="completed",
                )
                db.add(pc)

            db.commit()

    return db_story

@app.post("/stories/full")
def create_story_full(story: StoryFullCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """创建完整故事（含人物关联）"""
    # 1. 创建故事记录
    db_story = models.Story(
        audio_url=story.audio_url,
        transcript=story.transcript,
        summary=story.summary,
        year=story.year,
        decade=story.decade,
        theme=story.theme,
    )
    db.add(db_story)
    db.commit()
    db.refresh(db_story)

    # 2. 创建人物关联
    protagonist_id = story.protagonist_id or (story.person_ids[0] if story.person_ids else None)
    for pid in story.person_ids:
        db_sp = models.StoryPerson(
            story_id=db_story.id,
            person_id=pid,
            is_protagonist=(pid == protagonist_id)
        )
        db.add(db_sp)

    db.commit()

    # 异步检测历史事件关联
    background_tasks.add_task(detect_story_history_task, db_story.id)

    return db_story


def detect_story_history_task(story_id: str):
    """后台检测故事与历史事件的关联"""
    db = SessionLocal()
    try:
        story = db.query(models.Story).filter(models.Story.id == story_id).first()
        if not story or not story.transcript:
            return

        events = db.query(models.HistoricalEvent).all()
        if not events:
            return

        events_list = "\n".join([f"- {e.id}: {e.title} ({e.year}年)" for e in events])
        api_key = os.getenv("ARK_API_KEY", "")
        if not api_key:
            return

        try:
            client = OpenAI(
                api_key=api_key,
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            )

            prompt = f"""以下是一段口述故事，请判断其中是否涉及到以下历史事件，返回相关事件的id列表（JSON数组格式）。如果没有关联的事件，返回空数组[]。

历史事件列表：
{events_list}

故事内容：
{story.transcript}

请直接返回JSON数组，不要其他内容："""

            response = client.chat.completions.create(
                model="ep-20260521233914-gllp4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )

            result_text = response.choices[0].message.content.strip()
            try:
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0]
                elif "```" in result_text:
                    result_text = result_text.split("```")[1].split("```")[0]
                event_ids = json_lib.loads(result_text.strip())
                if not isinstance(event_ids, list):
                    event_ids = []
            except:
                event_ids = []

            # 删除旧关联
            db.query(models.StoryHistoryRelation).filter(
                models.StoryHistoryRelation.story_id == story_id
            ).delete()

            # 插入新关联
            for event_id in event_ids:
                db_rel = models.StoryHistoryRelation(
                    story_id=story_id,
                    event_id=event_id
                )
                db.add(db_rel)

            db.commit()
        except Exception as e:
            print(f"AI 检测失败: {str(e)}")
    finally:
        db.close()


@app.put("/stories/{story_id}", response_model=Story)
def update_story(story_id: str, story: StoryCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """更新故事信息"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")

    for key, value in story.model_dump().items():
        if value is not None:
            setattr(db_story, key, value)

    db.commit()
    db.refresh(db_story)

    # 异步检测历史事件关联
    background_tasks.add_task(detect_story_history_task, story_id)

    return db_story

@app.patch("/stories/{story_id}", response_model=Story)
def patch_story(story_id: str, story_update: StoryUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """更新故事（支持 partial update）"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")

    update_data = story_update.model_dump(exclude_unset=True)

    # 处理 person_ids 更新：先删除旧的 story_persons 记录，再插入新的
    if "person_ids" in update_data and update_data["person_ids"] is not None:
        new_person_ids = update_data.pop("person_ids")
        # 删除该故事原有的所有 story_persons 记录
        db.query(models.StoryPerson).filter(
            models.StoryPerson.story_id == story_id
        ).delete()
        # 插入新的人物关联记录
        for pid in new_person_ids:
            db_sp = models.StoryPerson(
                story_id=story_id,
                person_id=pid,
                is_protagonist=False
            )
            db.add(db_sp)

    for key, value in update_data.items():
        if value is not None:
            setattr(db_story, key, value)

    db.commit()
    db.refresh(db_story)

    # 异步检测历史事件关联（如果有transcript变更）
    if story_update.transcript:
        background_tasks.add_task(detect_story_history_task, story_id)

    return db_story

@app.delete("/stories/{story_id}")
def delete_story(story_id: str, db: Session = Depends(get_db)):
    """删除故事（级联删除关联记录）"""
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    # 删除关联的 audio 文件
    if story.audio_url:
        audio_path = story.audio_url.lstrip('/')
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"已删除音频文件: {audio_path}")
            except Exception as e:
                print(f"删除音频文件失败: {e}")

    # 删除 chapter_stories 关联记录
    db.query(models.ChapterStory).filter(
        models.ChapterStory.story_id == story_id
    ).delete()

    # 删除 story_persons 关联记录
    db.query(models.StoryPerson).filter(
        models.StoryPerson.story_id == story_id
    ).delete()

    # 删除 story_history_relations 关联记录
    db.query(models.StoryHistoryRelation).filter(
        models.StoryHistoryRelation.story_id == story_id
    ).delete()

    # 删除故事
    db.delete(story)
    db.commit()

    return {"success": True}

@app.get("/stories/{story_id}", response_model=StoryWithPersons)
def read_story(story_id: str, db: Session = Depends(get_db)):
    """返回单个故事详情（含人物列表）"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")

    # 查询关联的人物
    sp_records = db.query(models.StoryPerson).filter(
        models.StoryPerson.story_id == story_id
    ).all()
    person_ids = [sp.person_id for sp in sp_records]

    persons = []
    if person_ids:
        db_persons = db.query(models.Person).filter(models.Person.id.in_(person_ids)).all()
        persons = [
            PersonBrief(id=p.id, name=p.name, avatar_url=p.avatar_url)
            for p in db_persons
        ]

    return StoryWithPersons(
        id=db_story.id,
        audio_url=db_story.audio_url,
        transcript=db_story.transcript,
        summary=db_story.summary,
        year=db_story.year,
        decade=db_story.decade,
        theme=db_story.theme,
        related_history_id=db_story.related_history_id,
        related_history=db_story.related_history,
        created_at=db_story.created_at,
        transcription_status=db_story.transcription_status,
        ai_tag_status=db_story.ai_tag_status,
        persons=persons,
        # 采访生成的故事额外字段
        narrative_polish=db_story.narrative_polish,
        structured_snippets=db_story.structured_snippets,
        generation_status=db_story.generation_status,
        source_session_id=db_story.source_session_id,
        time_range=db_story.time_range,
        tags=db_story.tags,
        involved_people=db_story.involved_people,
        key_events=db_story.key_events,
        title=db_story.title,
    )


class GenerationStatusResponse(BaseModel):
    """生成状态响应"""
    status: str  # pending/generating_layer2/generating_layer3/done/failed
    has_layer2: bool
    has_layer3: bool


@app.get("/stories/{story_id}/generation-status", response_model=GenerationStatusResponse)
def get_story_generation_status(story_id: str, db: Session = Depends(get_db)):
    """返回故事的生成进度"""
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    # 没有 source_session_id 的是旧故事（手动录入），直接返回完成状态
    if not story.source_session_id:
        return GenerationStatusResponse(
            status="done",
            has_layer2=True,
            has_layer3=True,
        )

    status = story.generation_status or "pending"

    return GenerationStatusResponse(
        status=status,
        has_layer2=bool(story.structured_snippets),
        has_layer3=bool(story.narrative_polish),
    )


@app.post("/story-persons", response_model=StoryPersonResponse)
def create_story_person(sp: StoryPersonCreate, db: Session = Depends(get_db)):
    """将人物关联到故事"""
    db_sp = models.StoryPerson(**sp.model_dump())
    db.add(db_sp)
    db.commit()
    db.refresh(db_sp)
    return db_sp


def extract_structured_info(transcript: str, db=None) -> dict:
    """调用豆包模型提取结构化信息"""
    api_key = os.getenv("ARK_API_KEY", "")
    if not api_key:
        return {
            "summary": transcript[:20] + "..." if transcript else "",
            "year": None,
            "decade": None,
            "theme": "其他",
            "persons_mentioned": [],
            "related_history": None
        }

    # 动态获取主题列表
    theme_options = "其他"
    try:
        if db:
            themes = db.query(models.Theme).order_by(models.Theme.sort_order.asc()).all()
            theme_options = "/".join([t.name for t in themes])
        else:
            from database import SessionLocal
            db_temp = SessionLocal()
            try:
                themes = db_temp.query(models.Theme).order_by(models.Theme.sort_order.asc()).all()
                theme_options = "/".join([t.name for t in themes])
            finally:
                db_temp.close()
    except Exception as e:
        print(f"获取主题列表失败: {e}")
        theme_options = "其他"

    # 动态获取历史事件列表
    events_title_list = ""
    try:
        if db:
            events = db.query(models.HistoricalEvent).order_by(models.HistoricalEvent.year.asc()).all()
            events_title_list = ", ".join([f"{e.year}年{e.title}" for e in events])
        else:
            from database import SessionLocal
            db_temp = SessionLocal()
            try:
                events = db_temp.query(models.HistoricalEvent).order_by(models.HistoricalEvent.year.asc()).all()
                events_title_list = ", ".join([f"{e.year}年{e.title}" for e in events])
            finally:
                db_temp.close()
    except Exception as e:
        print(f"获取历史事件列表失败: {e}")

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
        )

        prompt = f"""请从以下口述故事中提取关键信息，只返回JSON格式，不要任何其他内容：{{
  "summary": "一句话摘要，20字以内，要有温度感",
  "year": 故事发生年份整数（不确定则返回null）,
  "decade": "年代描述，如1960年代（不确定则返回null）",
  "theme": "从以下选一个最合适的：{theme_options}",
  "persons_mentioned": ["故事中提到的人名列表，没有则为空数组"],
  "related_history": "推测该故事与哪个历史事件相关，从以下事件列表中选择最匹配的一个，返回格式如「1997年香港回归」，如果是童年趣事、家庭日常等与宏观历史无关的内容返回null"
}}故事内容：{transcript}

可选历史事件列表：{events_title_list}"""

        response = client.chat.completions.create(
            model="ep-20260521233914-gllp4",
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
        )

        result_text = response.choices[0].message.content.strip()

        # 尝试解析 JSON
        try:
            # 去掉可能的 ```json 和 ``` 标记
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json_lib.loads(result_text.strip())
            return {
                "summary": result.get("summary", ""),
                "year": result.get("year"),
                "decade": result.get("decade"),
                "theme": result.get("theme", "其他"),
                "persons_mentioned": result.get("persons_mentioned", []),
                "related_history": result.get("related_history")
            }
        except json_lib.JSONDecodeError as e:
            print(f"解析豆包返回JSON失败: {e}, 内容: {result_text}")
            return {
                "summary": transcript[:20] + "..." if transcript else "",
                "year": None,
                "decade": None,
                "theme": "其他",
                "persons_mentioned": [],
                "related_history": None
            }

    except Exception as e:
        print(f"豆包 API 调用失败: {str(e)}")
        return {
            "summary": transcript[:20] + "..." if transcript else "",
            "year": None,
            "decade": None,
            "theme": "其他",
            "persons_mentioned": [],
            "related_history": None
        }


async def process_audio_task(audio_path: str, story_id: str):
    """后台处理音频转写（仅转写，不做 AI 标注）"""
    db = SessionLocal()
    try:
        # 1. 使用本地 FunASR 转写
        transcript = transcribe_local(audio_path)

        # 2. 更新数据库
        story = db.query(models.Story).filter(models.Story.id == story_id).first()
        if story:
            story.transcript = transcript
            story.transcription_status = "done"
            db.commit()

    except Exception as e:
        print(f"Transcription error: {str(e)}")
        story = db.query(models.Story).filter(models.Story.id == story_id).first()
        if story:
            story.transcription_status = "failed"
            story.transcript = f"转写失败：{str(e)}"
            db.commit()
    finally:
        db.close()

@app.post("/stories/process")
async def process_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    person_id: str = "",
    db: Session = Depends(get_db)
):
    """
    上传音频并进行处理：保存音频、异步转录
    """
    # 保存音频文件
    timestamp = int(time.time() * 1000)
    filename = f"audio_{timestamp}.webm"
    filepath = os.path.join(UPLOAD_DIR, filename)

    # 写入文件
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    audio_url = f"/uploads/audio/{filename}"

    # 1. 创建 Story 记录
    db_story = models.Story(
        audio_url=audio_url,
        transcription_status="processing",
        transcript="正在转写中...",
        person_ids=json.dumps([person_id]) if person_id else "[]"
    )
    db.add(db_story)
    db.commit()
    db.refresh(db_story)

    # 2. 如果有 person_id，创建关联记录
    if person_id:
        db_sp = models.StoryPerson(
            story_id=db_story.id,
            person_id=person_id,
            is_protagonist=True
        )
        db.add(db_sp)
        db.commit()

    # 3. 启动后台任务
    background_tasks.add_task(process_audio_task, filepath, db_story.id)

    return {
        "id": db_story.id,
        "audio_url": audio_url,
        "transcription_status": "processing",
        "message": "音频已上传，后台转写中"
    }


@app.post("/stories/{story_id}/tag")
def tag_story(story_id: str, request: TagRequest, db: Session = Depends(get_db)):
    """手动触发 AI 标注（使用前端传来的 transcript）"""
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    transcript = request.transcript
    if not transcript:
        raise HTTPException(status_code=400, detail="转写内容为空，无法标注")

    # 更新标注状态
    story.ai_tag_status = "processing"
    db.commit()

    try:
        # 调用豆包模型提取结构化信息（传入 db 获取主题列表）
        structured = extract_structured_info(transcript, db)

        # 更新数据库
        story.summary = structured.get("summary", "")
        story.year = structured.get("year")
        story.decade = structured.get("decade")
        story.theme = structured.get("theme", "其他")
        story.person_ids = json_lib.dumps(structured.get("persons_mentioned", []))

        # 处理历史事件关联：只当用户没有手动选择时才覆盖
        related_history = structured.get("related_history")
        if related_history and not story.related_history:
            # 根据标题查询历史事件获取id
            # 支持 "1997年香港回归" 格式解析
            import re
            match = re.match(r"(\d{4})年(.+)", related_history)
            if match:
                year_str, title = match.groups()
                event = db.query(models.HistoricalEvent).filter(
                    models.HistoricalEvent.year == int(year_str),
                    models.HistoricalEvent.title == title
                ).first()
                if event:
                    story.related_history_id = event.id
                    story.related_history = related_history
                else:
                    story.related_history = related_history
            else:
                # 尝试精确匹配标题
                event = db.query(models.HistoricalEvent).filter(
                    models.HistoricalEvent.title == related_history
                ).first()
                if event:
                    story.related_history_id = event.id
                    story.related_history = related_history
                else:
                    story.related_history = related_history

        story.ai_tag_status = "done"
        db.commit()

        return {
            "summary": story.summary,
            "year": story.year,
            "decade": story.decade,
            "theme": story.theme,
            "persons_mentioned": structured.get("persons_mentioned", []),
            "related_history": story.related_history
        }

    except Exception as e:
        print(f"AI 标注失败: {str(e)}")
        story.ai_tag_status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"AI 标注失败：{str(e)}")


# ============= Family Timeline API =============

class FamilyTimelineStory(BaseModel):
    """家族时间轴中的故事"""
    id: str
    summary: Optional[str] = None
    year: Optional[int] = None
    decade: Optional[str] = None
    theme: Optional[str] = None
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    related_history_id: Optional[str] = None
    related_history: Optional[str] = None
    persons: List[dict] = []

    class Config:
        from_attributes = True


@app.get("/family/timeline", response_model=List[FamilyTimelineStory])
def read_family_timeline(
    theme: Optional[str] = None,
    person_id: Optional[str] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """家族总时间轴 - 查询所有故事，支持主题/人物/年代过滤"""
    query = db.query(models.Story)

    # 按主题过滤
    if theme:
        query = query.filter(models.Story.theme == theme)

    # 按人物过滤
    if person_id:
        sp_records = db.query(models.StoryPerson).filter(
            models.StoryPerson.person_id == person_id
        ).all()
        story_ids = [sp.story_id for sp in sp_records]
        query = query.filter(models.Story.id.in_(story_ids))

    # 按年代范围过滤
    if year_from is not None:
        query = query.filter(models.Story.year >= year_from)
    if year_to is not None:
        query = query.filter(models.Story.year <= year_to)

    # 按 year 升序，year 为空的放最后
    stories = query.order_by(
        models.Story.year.is_(None),
        models.Story.year.asc()
    ).all()

    # 构建返回结果，为每条故事附加人物列表
    result = []
    for story in stories:
        # 获取关联的人物列表
        sp_records = db.query(models.StoryPerson).filter(
            models.StoryPerson.story_id == story.id
        ).all()

        persons = []
        for sp in sp_records:
            person = db.query(models.Person).filter(
                models.Person.id == sp.person_id
            ).first()
            if person:
                persons.append({
                    "id": person.id,
                    "name": person.name,
                    "avatar_url": person.avatar_url
                })

        result.append(FamilyTimelineStory(
            id=story.id,
            summary=story.summary,
            year=story.year,
            decade=story.decade,
            theme=story.theme,
            audio_url=story.audio_url,
            transcript=story.transcript,
            persons=persons
        ))

    return result


# ============= Family Migrations API =============

@app.get("/family/migrations")
def read_family_migrations(db: Session = Depends(get_db)):
    """家族总迁徙地图 - 查询所有人物的所有迁徙记录"""
    records = db.query(models.MigrationRecord).join(
        models.Person,
        models.MigrationRecord.person_id == models.Person.id
    ).order_by(
        models.MigrationRecord.year.is_(None),
        models.MigrationRecord.year.asc()
    ).all()

    result = []
    for record in records:
        # 重新查询人物信息
        person = db.query(models.Person).filter(models.Person.id == record.person_id).first()
        result.append({
            "id": record.id,
            "person_id": record.person_id,
            "person_name": person.name if person else None,
            "person_avatar": person.avatar_url if person else None,
            "place_name": record.place_name,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "year": record.year,
            "description": record.description
        })

    return result


@app.get("/family/migrations/persons")
def read_family_migrations_persons(db: Session = Depends(get_db)):
    """返回有迁徙记录的人物列表（用于前端按人物过滤）"""
    # 找出有迁徙记录的人物
    person_ids = db.query(models.MigrationRecord.person_id).distinct().all()
    person_ids = [p[0] for p in person_ids]

    if not person_ids:
        return []

    persons = db.query(models.Person).filter(models.Person.id.in_(person_ids)).all()

    return [{"id": p.id, "name": p.name, "avatar_url": p.avatar_url} for p in persons]


# ============= Family Members API =============

@app.get("/family-members")
def get_family_members(db: Session = Depends(get_db)):
    """返回所有非主用户的人物，按关系分组"""
    members = db.query(models.Person).filter(
        (models.Person.is_owner == False) | (models.Person.is_owner.is_(None))
    ).all()

    groups = {
        "父母": [],
        "兄弟姐妹": [],
        "伴侣": [],
        "子女": [],
        "其他": [],
    }

    for m in members:
        member_data = {
            "id": m.id,
            "name": m.name,
            "relation_to_owner": m.relation_to_owner,
            "bio": m.bio,
            "avatar_url": m.avatar_url,
        }
        rel = m.relation_to_owner or ""
        if rel in ["父亲", "母亲"]:
            groups["父母"].append(member_data)
        elif rel in ["兄", "弟", "姐", "妹", "哥哥", "弟弟", "姐姐", "妹妹", "兄长"]:
            groups["兄弟姐妹"].append(member_data)
        elif rel in ["丈夫", "妻子", "老伴", "伴侣"]:
            groups["伴侣"].append(member_data)
        elif rel in ["儿子", "女儿", "孩子"]:
            groups["子女"].append(member_data)
        else:
            groups["其他"].append(member_data)

    return groups


@app.get("/family-members/{person_id}/stories")
def get_person_stories_in_chapters(person_id: str, db: Session = Depends(get_db)):
    """返回该人物关联的故事列表，包含章节信息"""
    story_persons = db.query(models.StoryPerson).filter(
        models.StoryPerson.person_id == person_id
    ).all()

    story_ids = [sp.story_id for sp in story_persons]
    if not story_ids:
        return []

    stories = db.query(models.Story).filter(models.Story.id.in_(story_ids)).all()

    # 获取章节信息
    chapter_stories = db.query(models.ChapterStory).filter(
        models.ChapterStory.person_id == person_id,
        models.ChapterStory.story_id.in_(story_ids)
    ).all()
    story_chapter_map = {cs.story_id: cs.chapter_id for cs in chapter_stories}

    result = []
    for s in stories:
        result.append({
            "id": s.id,
            "summary": s.summary,
            "year": s.year,
            "theme": s.theme,
            "chapter_id": story_chapter_map.get(s.id),
        })

    return result


# ============= Historical Events API =============

@app.get("/historical-events", response_model=List[HistoricalEventResponse])
def read_historical_events(
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """获取历史事件列表，支持按年份过滤"""
    query = db.query(models.HistoricalEvent)

    if year_from is not None:
        query = query.filter(models.HistoricalEvent.year >= year_from)
    if year_to is not None:
        query = query.filter(models.HistoricalEvent.year <= year_to)

    return query.order_by(models.HistoricalEvent.year.asc()).all()


@app.post("/historical-events/custom", response_model=HistoricalEventResponse)
def create_custom_event(
    request: HistoricalEventUpdate,
    linked_stories: CustomEventStoryLink = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """创建自定义历史事件"""
    if not request.year:
        raise HTTPException(status_code=400, detail="年份必填")
    if not request.title:
        raise HTTPException(status_code=400, detail="标题必填")

    category = request.category or "其他"

    db_event = models.HistoricalEvent(
        year=request.year,
        title=request.title,
        description=request.description,
        category=category,
        importance=request.importance or 1,
        is_custom=True,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    # 如果有关联故事，批量创建关联
    if linked_stories and linked_stories.story_ids:
        for story_id in linked_stories.story_ids:
            db_rel = models.StoryHistoryRelation(
                story_id=story_id,
                event_id=db_event.id
            )
            db.add(db_rel)
        db.commit()

    return db_event


@app.patch("/historical-events/{event_id}/custom", response_model=HistoricalEventResponse)
def update_custom_event(
    event_id: str,
    request: HistoricalEventUpdate,
    linked_stories: CustomEventStoryLink = None,
    db: Session = Depends(get_db)
):
    """更新自定义历史事件（仅限自定义事件）"""
    event = db.query(models.HistoricalEvent).filter(
        models.HistoricalEvent.id == event_id
    ).first()

    if not event:
        raise HTTPException(status_code=404, detail="历史事件不存在")

    if not event.is_custom:
        raise HTTPException(status_code=403, detail="预设事件不可编辑")

    # 更新字段
    if request.year is not None:
        event.year = request.year
    if request.title is not None:
        event.title = request.title
    if request.description is not None:
        event.description = request.description
    if request.category is not None:
        event.category = request.category
    if request.importance is not None:
        event.importance = request.importance

    db.commit()
    db.refresh(event)

    # 更新关联故事
    if linked_stories and linked_stories.story_ids:
        # 删除旧关联
        db.query(models.StoryHistoryRelation).filter(
            models.StoryHistoryRelation.event_id == event_id
        ).delete()
        # 插入新关联
        for story_id in linked_stories.story_ids:
            db_rel = models.StoryHistoryRelation(
                story_id=story_id,
                event_id=event_id
            )
            db.add(db_rel)
        db.commit()

    return event


@app.delete("/historical-events/{event_id}/custom")
def delete_custom_event(event_id: str, db: Session = Depends(get_db)):
    """删除自定义历史事件（仅限自定义事件）"""
    event = db.query(models.HistoricalEvent).filter(
        models.HistoricalEvent.id == event_id
    ).first()

    if not event:
        raise HTTPException(status_code=404, detail="历史事件不存在")

    if not event.is_custom:
        raise HTTPException(status_code=403, detail="预设事件不可删除")

    # 删除关联
    db.query(models.StoryHistoryRelation).filter(
        models.StoryHistoryRelation.event_id == event_id
    ).delete()

    # 删除事件
    db.delete(event)
    db.commit()

    return {"message": "自定义事件已删除"}


@app.post("/historical-events/{event_id}/memories", response_model=EventMemoryResponse)
def create_event_memory(event_id: str, memory: EventMemoryCreate, db: Session = Depends(get_db)):
    """新增亲历记录"""
    # 检查事件是否存在
    event = db.query(models.HistoricalEvent).filter(models.HistoricalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="历史事件不存在")

    # 检查人物是否存在（非空时）
    if memory.person_id:
        person = db.query(models.Person).filter(models.Person.id == memory.person_id).first()
        if not person:
            raise HTTPException(status_code=404, detail="人物不存在")

    db_memory = models.EventMemory(
        event_id=event_id,
        person_id=memory.person_id,
        content=memory.content
    )
    db.add(db_memory)
    db.commit()
    db.refresh(db_memory)
    return db_memory


@app.get("/historical-events/{event_id}/memories", response_model=List[EventMemoryResponse])
def read_event_memories(event_id: str, db: Session = Depends(get_db)):
    """获取该事件的所有亲历记录"""
    # 检查事件是否存在
    event = db.query(models.HistoricalEvent).filter(models.HistoricalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="历史事件不存在")

    memories = db.query(models.EventMemory).filter(
        models.EventMemory.event_id == event_id
    ).order_by(models.EventMemory.created_at.desc()).all()

    return memories


@app.delete("/historical-events/{event_id}/memories/{mid}")
def delete_event_memory(event_id: str, mid: str, db: Session = Depends(get_db)):
    """删除亲历记录"""
    memory = db.query(models.EventMemory).filter(
        models.EventMemory.id == mid,
        models.EventMemory.event_id == event_id
    ).first()
    if not memory:
        raise HTTPException(status_code=404, detail="亲历记录不存在")

    db.delete(memory)
    db.commit()
    return {"message": "亲历记录已删除"}


@app.post("/stories/{story_id}/detect-history")
def detect_story_history(story_id: str, db: Session = Depends(get_db)):
    """AI 检测故事与历史事件的关联"""
    # 获取故事
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="故事不存在")

    if not story.transcript:
        return {"event_ids": []}

    # 获取所有历史事件
    events = db.query(models.HistoricalEvent).all()
    if not events:
        return {"event_ids": []}

    # 构建事件列表
    events_list = "\n".join([f"- {e.id}: {e.title} ({e.year}年)" for e in events])

    # 调用 AI 检测
    api_key = os.getenv("ARK_API_KEY", "")
    if not api_key:
        return {"event_ids": []}

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
        )

        prompt = f"""以下是一段口述故事，请判断其中是否涉及到以下历史事件，返回相关事件的id列表（JSON数组格式），比如["id1","id2"]。如果没有关联的事件，返回空数组[]。

历史事件列表：
{events_list}

故事内容：
{story.transcript}

请直接返回JSON数组，不要其他内容："""

        response = client.chat.completions.create(
            model="ep-20260521233914-gllp4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )

        result_text = response.choices[0].message.content.strip()

        # 解析 JSON
        try:
            # 去掉可能的 ```json 和 ```
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            event_ids = json_lib.loads(result_text.strip())
            if not isinstance(event_ids, list):
                event_ids = []
        except:
            event_ids = []

        # 删除旧的关联
        db.query(models.StoryHistoryRelation).filter(
            models.StoryHistoryRelation.story_id == story_id
        ).delete()

        # 插入新的关联
        for event_id in event_ids:
            db_rel = models.StoryHistoryRelation(
                story_id=story_id,
                event_id=event_id
            )
            db.add(db_rel)

        db.commit()
        return {"event_ids": event_ids}

    except Exception as e:
        print(f"AI 检测失败: {str(e)}")
        return {"event_ids": []}


@app.get("/historical-events/{event_id}/stories")
def get_event_stories(event_id: str, db: Session = Depends(get_db)):
    """获取与该历史事件关联的家族故事"""
    # 检查事件是否存在
    event = db.query(models.HistoricalEvent).filter(models.HistoricalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="历史事件不存在")

    # 获取关联的故事
    relations = db.query(models.StoryHistoryRelation).filter(
        models.StoryHistoryRelation.event_id == event_id
    ).all()
    story_ids = [r.story_id for r in relations]

    if not story_ids:
        return []

    stories = db.query(models.Story).filter(
        models.Story.id.in_(story_ids)
    ).all()

    # 为每个故事获取关联人物
    result = []
    for story in stories:
        sp_records = db.query(models.StoryPerson).filter(
            models.StoryPerson.story_id == story.id
        ).all()
        person_ids = [sp.person_id for sp in sp_records]
        persons = []
        if person_ids:
            db_persons = db.query(models.Person).filter(
                models.Person.id.in_(person_ids)
            ).all()
            persons = [
                {"id": p.id, "name": p.name, "avatar_url": p.avatar_url}
                for p in db_persons
            ]

        result.append({
            "id": story.id,
            "transcript": story.transcript,
            "summary": story.summary,
            "year": story.year,
            "theme": story.theme,
            "persons": persons
        })

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)