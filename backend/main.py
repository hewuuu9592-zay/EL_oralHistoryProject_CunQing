from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
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
    transcription_status: Optional[str] = "pending"
    ai_tag_status: Optional[str] = "untagged"

class TagRequest(BaseModel):
    transcript: str

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
    created_at: Optional[datetime] = None
    transcription_status: Optional[str] = "pending"
    ai_tag_status: Optional[str] = "untagged"
    persons: List[PersonBrief] = []
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

# ============= Migration Records =============

class MigrationRecordBase(BaseModel):
    place_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None

class MigrationRecordCreate(MigrationRecordBase):
    pass

class MigrationRecordUpdate(BaseModel):
    place_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year: Optional[int] = None
    description: Optional[str] = None

class MigrationRecordResponse(MigrationRecordBase):
    id: str
    person_id: str
    class Config:
        from_attributes = True

class MigrationSuggestResponse(BaseModel):
    """AI 建议的迁徙节点"""
    place_name: str
    year: Optional[int] = None
    description: Optional[str] = None
    confidence: str  # "故事中明确提到" / "推测" / "可能"

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

@app.delete("/persons/{person_id}")
def delete_person(person_id: str, force: bool = False, db: Session = Depends(get_db)):
    """删除人物及其相关关系"""
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="人物不存在")

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

    existing_str = "、".join(existing_themes) if existing_themes else "暂无"

    # 3. 调用豆包模型生成引导问题
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

            prompt = f"""你是一个温柔的家族记忆整理师。这位长辈名叫{person.name}，{pronoun}，生于{person.birth_year or '未知'}年。{pronoun}已经讲述了这些方面的故事：{existing_str}。请为'{suggested_theme}'这个主题，生成一个温暖具体的引导问题。要求：口语化，像晚辈在问长辈，不超过30字，直接返回问题本身，不要任何前缀。"""

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

    # 4. 回退逻辑
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
        description=migration.description
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@app.delete("/persons/{person_id}/migrations/{mid}")
def delete_migration_record(person_id: str, mid: str, db: Session = Depends(get_db)):
    """删除一条迁徙记录"""
    record = db.query(models.MigrationRecord).filter(
        models.MigrationRecord.id == mid,
        models.MigrationRecord.person_id == person_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="迁徙记录不存在")

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

    # 如果修改了地名且没有提供坐标，重新获取坐标
    if "place_name" in update_data and ("latitude" not in update_data or not update_data.get("latitude")):
        geo_result = geocode_place(update_data["place_name"])
        if geo_result:
            update_data["latitude"] = geo_result["latitude"]
            update_data["longitude"] = geo_result["longitude"]

    for key, value in update_data.items():
        if value is not None:
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
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

@app.post("/stories", response_model=Story)
def create_story(story: StoryCreate, db: Session = Depends(get_db)):
    """新增故事"""
    db_story = models.Story(**story.model_dump())
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    return db_story

@app.post("/stories/full")
def create_story_full(story: StoryFullCreate, db: Session = Depends(get_db)):
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
    return db_story

@app.put("/stories/{story_id}", response_model=Story)
def update_story(story_id: str, story: StoryCreate, db: Session = Depends(get_db)):
    """更新故事信息"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")

    for key, value in story.model_dump().items():
        if value is not None:
            setattr(db_story, key, value)

    db.commit()
    db.refresh(db_story)
    return db_story

@app.patch("/stories/{story_id}", response_model=Story)
def patch_story(story_id: str, story_update: StoryUpdate, db: Session = Depends(get_db)):
    """更新故事（支持 partial update）"""
    db_story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if db_story is None:
        raise HTTPException(status_code=404, detail="故事不存在")

    update_data = story_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(db_story, key, value)

    db.commit()
    db.refresh(db_story)
    return db_story

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
        created_at=db_story.created_at,
        transcription_status=db_story.transcription_status,
        ai_tag_status=db_story.ai_tag_status,
        persons=persons
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
            "persons_mentioned": []
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
  "persons_mentioned": ["故事中提到的人名列表，没有则为空数组"]
}}故事内容：{transcript}"""

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
                "persons_mentioned": result.get("persons_mentioned", [])
            }
        except json_lib.JSONDecodeError as e:
            print(f"解析豆包返回JSON失败: {e}, 内容: {result_text}")
            return {
                "summary": transcript[:20] + "..." if transcript else "",
                "year": None,
                "decade": None,
                "theme": "其他",
                "persons_mentioned": []
            }

    except Exception as e:
        print(f"豆包 API 调用失败: {str(e)}")
        return {
            "summary": transcript[:20] + "..." if transcript else "",
            "year": None,
            "decade": None,
            "theme": "其他",
            "persons_mentioned": []
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
        story.ai_tag_status = "done"
        db.commit()

        return {
            "summary": story.summary,
            "year": story.year,
            "decade": story.decade,
            "theme": story.theme,
            "persons_mentioned": structured.get("persons_mentioned", [])
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


# ============= Themes API =============

class ThemeCreate(BaseModel):
    name: str
    emoji: Optional[str] = None
    color_bg: Optional[str] = None
    color_text: Optional[str] = None

class ThemeUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color_bg: Optional[str] = None
    color_text: Optional[str] = None

class ThemeResponse(BaseModel):
    id: str
    name: str
    emoji: Optional[str] = None
    color_bg: Optional[str] = None
    color_text: Optional[str] = None
    is_default: bool
    sort_order: int

    class Config:
        from_attributes = True


# 初始化预设主题
DEFAULT_THEMES = [
    {"name": "家乡记忆", "emoji": "🏡", "color_bg": "#DCFCE7", "color_text": "#166534", "sort_order": 1},
    {"name": "工作岁月", "emoji": "💼", "color_bg": "#DBEAFE", "color_text": "#1E40AF", "sort_order": 2},
    {"name": "爱情婚姻", "emoji": "❤️", "color_bg": "#FCE7F9", "color_text": "#9D174D", "sort_order": 3},
    {"name": "历史亲历", "emoji": "📜", "color_bg": "#FEF9C3", "color_text": "#854D0E", "sort_order": 4},
    {"name": "家族传承", "emoji": "🌳", "color_bg": "#166534", "color_text": "#FFFFFF", "sort_order": 5},
    {"name": "童年往事", "emoji": "🎈", "color_bg": "#FFEDD5", "color_text": "#9A3412", "sort_order": 6},
    {"name": "其他", "emoji": "📖", "color_bg": "#F3F4F6", "color_text": "#374151", "sort_order": 7},
]

@app.on_event("startup")
def init_themes():
    """应用启动时初始化预设主题"""
    db = SessionLocal()
    try:
        for theme_data in DEFAULT_THEMES:
            existing = db.query(models.Theme).filter(models.Theme.name == theme_data["name"]).first()
            if not existing:
                db_theme = models.Theme(
                    name=theme_data["name"],
                    emoji=theme_data["emoji"],
                    color_bg=theme_data["color_bg"],
                    color_text=theme_data["color_text"],
                    is_default=True,
                    sort_order=theme_data["sort_order"]
                )
                db.add(db_theme)
        db.commit()
    finally:
        db.close()


@app.get("/themes", response_model=List[ThemeResponse])
def read_themes(db: Session = Depends(get_db)):
    """获取所有主题列表，按 sort_order 排序"""
    return db.query(models.Theme).order_by(models.Theme.sort_order.asc()).all()


@app.post("/themes", response_model=ThemeResponse)
def create_theme(theme: ThemeCreate, db: Session = Depends(get_db)):
    """新增自定义主题"""
    # 检查是否已存在
    existing = db.query(models.Theme).filter(models.Theme.name == theme.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="主题已存在")

    # 获取最大 sort_order
    max_order = db.query(models.Theme).order_by(models.Theme.sort_order.desc()).first()
    new_sort_order = (max_order.sort_order + 1) if max_order else 1

    db_theme = models.Theme(
        name=theme.name,
        emoji=theme.emoji,
        color_bg=theme.color_bg,
        color_text=theme.color_text,
        is_default=False,
        sort_order=new_sort_order
    )
    db.add(db_theme)
    db.commit()
    db.refresh(db_theme)
    return db_theme


@app.delete("/themes/{theme_id}")
def delete_theme(theme_id: str, db: Session = Depends(get_db)):
    """删除主题（预设主题不允许删除）"""
    theme = db.query(models.Theme).filter(models.Theme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="主题不存在")

    if theme.is_default:
        raise HTTPException(status_code=403, detail="预设主题不可删除")

    # 把使用该主题的故事改为"其他"
    db.query(models.Story).filter(models.Story.theme == theme.name).update(
        {"theme": "其他"}
    )

    db.delete(theme)
    db.commit()
    return {"message": "主题已删除"}


@app.patch("/themes/{theme_id}", response_model=ThemeResponse)
def update_theme(theme_id: str, theme_update: ThemeUpdate, db: Session = Depends(get_db)):
    """编辑主题（仅限自定义主题）"""
    theme = db.query(models.Theme).filter(models.Theme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="主题不存在")

    if theme.is_default:
        raise HTTPException(status_code=403, detail="预设主题不可编辑")

    update_data = theme_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(theme, key, value)

    db.commit()
    db.refresh(theme)
    return theme


@app.get("/themes/with-count")
def read_themes_with_count(db: Session = Depends(get_db)):
    """获取主题列表（带故事数量）"""
    themes = db.query(models.Theme).order_by(models.Theme.sort_order.asc()).all()

    result = []
    for theme in themes:
        # 统计使用该主题的故事数量
        story_count = db.query(models.Story).filter(models.Story.theme == theme.name).count()
        result.append({
            "id": theme.id,
            "name": theme.name,
            "emoji": theme.emoji,
            "color_bg": theme.color_bg,
            "color_text": theme.color_text,
            "is_default": theme.is_default,
            "sort_order": theme.sort_order,
            "story_count": story_count
        })

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)