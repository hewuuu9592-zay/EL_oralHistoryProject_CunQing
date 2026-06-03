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


def extract_structured_info(transcript: str) -> dict:
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

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
        )

        prompt = f"""请从以下口述故事中提取关键信息，只返回JSON格式，不要任何其他内容：{{
  "summary": "一句话摘要，20字以内，要有温度感",
  "year": 故事发生年份整数（不确定则返回null）,
  "decade": "年代描述，如1960年代（不确定则返回null）",
  "theme": "从以下选一个最合适的：家乡记忆/工作岁月/爱情婚姻/历史亲历/家族传承/童年往事/其他",
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
        # 调用豆包模型提取结构化信息
        structured = extract_structured_info(transcript)

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)