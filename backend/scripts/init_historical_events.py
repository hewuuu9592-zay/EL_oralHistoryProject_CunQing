#!/usr/bin/env python3
"""初始化中国重大历史事件数据"""

import sys
sys.path.insert(0, '.')

from database import SessionLocal
import models


# 中国1900-2024年重大历史事件
EVENTS = [
    # 清末民初 (1900-1919) - importance 3
    {"year": 1911, "title": "辛亥革命", "description": "武昌起义推翻清朝统治，建立中华民国", "category": "政治", "importance": 3},
    {"year": 1915, "title": "新文化运动", "description": "倡导民主与科学，开启思想启蒙", "category": "文化", "importance": 2},
    {"year": 1919, "title": "五四运动", "description": "北京学生抗议巴黎和会不公，中国新民主主义革命开端", "category": "政治", "importance": 3},

    # 北洋政府时期 (1920-1929)
    {"year": 1921, "title": "中国共产党成立", "description": "中共一大召开，中国工人阶级政党诞生", "category": "政治", "importance": 3},
    {"year": 1924, "title": "国共第一次合作", "description": "国民党一大召开，国民革命统一战线形成", "category": "政治", "importance": 2},
    {"year": 1927, "title": "南昌起义", "description": "八月一日武装反抗国民党政权，军队建设开端", "category": "战争", "importance": 2},

    # 国共内战时期 (1930-1939)
    {"year": 1931, "title": "九一八事变", "description": "日军侵占东三省，抗日战争起点", "category": "战争", "importance": 3},
    {"year": 1934, "title": "长征", "description": "红军战略转移至陕北，革命火种延续", "category": "战争", "importance": 2},
    {"year": 1936, "title": "西安事变", "description": "张学良杨虎城扣蒋，国共第二次合作", "category": "政治", "importance": 2},
    {"year": 1937, "title": "七七事变", "description": "卢沟桥事变，全面抗战爆发", "category": "战争", "importance": 3},
    {"year": 1937, "title": "南京大屠杀", "description": "日军攻占南京，三十万同胞遇难", "category": "战争", "importance": 3},
    {"year": 1938, "title": "台儿庄战役", "description": "抗战正面战场首次重大胜利", "category": "战争", "importance": 1},
    {"year": 1939, "title": "皖南事变", "description": "国共摩擦加剧，抗战团结受挫", "category": "政治", "importance": 1},

    # 抗日战争后期 (1940-1949)
    {"year": 1940, "title": "百团大战", "description": "八路军主动出击，粉碎日军囚笼政策", "category": "战争", "importance": 1},
    {"year": 1945, "title": "日本投降", "description": " WWII结束，中国抗战胜利", "category": "战争", "importance": 3},
    {"year": 1946, "title": "解放战争爆发", "description": "国共内战全面爆发", "category": "战争", "importance": 2},
    {"year": 1947, "title": "刘邓大军挺进大别山", "description": "战略反攻开始", "category": "战争", "importance": 1},
    {"year": 1948, "title": "辽沈战役", "description": "解放战争三大战役之始", "category": "战争", "importance": 2},
    {"year": 1949, "title": "新中国成立", "description": "十月一日开国大典，人民当家作主", "category": "政治", "importance": 3},

    # 新中国建设初期 (1950-1959)
    {"year": 1950, "title": "抗美援朝", "description": "志愿军赴朝作战，保家卫国", "category": "战争", "importance": 3},
    {"year": 1951, "title": "西藏和平解放", "description": "祖国大陆完全统一", "category": "政治", "importance": 2},
    {"year": 1953, "title": "第一个五年计划", "description": "工业化建设起步", "category": "经济", "importance": 2},
    {"year": 1954, "title": "第一届全国人大", "description": "人民代表大会制度正式建立", "category": "政治", "importance": 1},
    {"year": 1955, "title": "四大军区撤销", "description": "军队精简化", "category": "军事", "importance": 1},
    {"year": 1956, "title": "社会主义改造完成", "description": "从新民主主义进入社会主义", "category": "经济", "importance": 2},
    {"year": 1958, "title": "大跃进", "description": "超英赶美的经济建设运动", "category": "经济", "importance": 2},
    {"year": 1958, "title": "人民公社化", "description": "农村组织形式变革", "category": "社会", "importance": 1},
    {"year": 1959, "title": "西藏叛乱平定", "description": "维护国家统一", "category": "政治", "importance": 1},

    # 60年代 (1960-1969)
    {"year": 1960, "title": "三年困难时期", "description": "自然灾害导致经济困难", "category": "社会", "importance": 2},
    {"year": 1964, "title": "第一颗原子弹", "description": "中国核技术突破，打破核垄断", "category": "科技", "importance": 3},
    {"year": 1966, "title": "文化大革命", "description": "十年动乱，社会秩序受冲击", "category": "政治", "importance": 3},
    {"year": 1967, "title": "武汉七二零事件", "description": "文革时期重要武斗事件", "category": "社会", "importance": 1},
    {"year": 1968, "title": "上山下乡", "description": "知青大规模下乡", "category": "社会", "importance": 2},
    {"year": 1969, "title": "中苏珍宝岛冲突", "description": "边境武装冲突", "category": "战争", "importance": 1},

    # 70年代 (1970-1979)
    {"year": 1970, "title": "东方红一号发射", "description": "第一颗人造卫星", "category": "科技", "importance": 2},
    {"year": 1971, "title": "九一三事件", "description": "林彪叛逃坠机", "category": "政治", "importance": 2},
    {"year": 1972, "title": "尼克松访华", "description": "中美关系破冰", "category": "外交", "importance": 2},
    {"year": 1973, "title": "八个样板戏", "description": "文革时期文艺政策", "category": "文化", "importance": 1},
    {"year": 1976, "title": "四五运动", "description": "天安门悼念周总理", "category": "政治", "importance": 2},
    {"year": 1976, "title": "毛泽东逝世", "description": "一代伟人辞世", "category": "政治", "importance": 3},
    {"year": 1976, "title": "文革结束", "description": "十年动乱终止", "category": "政治", "importance": 3},
    {"year": 1977, "title": "恢复高考", "description": "高考制度恢复，公平选才", "category": "教育", "importance": 2},
    {"year": 1978, "title": "改革开放", "description": "十一届三中全会，经济建设为中心", "category": "经济", "importance": 3},
    {"year": 1979, "title": "对越自卫反击战", "description": "边境战事", "category": "战争", "importance": 1},

    # 80年代 (1980-1989)
    {"year": 1980, "title": "深圳经济特区", "description": "改革开放试验田", "category": "经济", "importance": 3},
    {"year": 1982, "title": "计划生育确立", "description": "基本国策", "category": "社会", "importance": 2},
    {"year": 1984, "title": "邓小平南方谈话", "description": "深化改革", "category": "政治", "importance": 2},
    {"year": 1984, "title": "中国女排奥运夺冠", "description": "洛杉矶奥运会", "category": "体育", "importance": 1},
    {"year": 1987, "title": "十三大", "description": "社会主义初级阶段理论", "category": "政治", "importance": 1},
    {"year": 1989, "title": "建国四十周年", "description": "国庆庆典", "category": "政治", "importance": 1},
    {"year": 1989, "title": "亚运会", "description": "北京办亚运", "category": "体育", "importance": 1},

    # 90年代 (1990-1999)
    {"year": 1990, "title": "上海浦东开发", "description": "改革开放新阶段", "category": "经济", "importance": 2},
    {"year": 1992, "title": "邓小平南方谈话", "description": "市场经济改革方向", "category": "政治", "importance": 3},
    {"year": 1997, "title": "香港回归", "description": "一国两制实践", "category": "政治", "importance": 3},
    {"year": 1997, "title": "十五大", "description": "邓小平理论确立", "category": "政治", "importance": 1},
    {"year": 1998, "title": "抗洪救灾", "description": "长江流域特大洪水", "category": "社会", "importance": 1},
    {"year": 1999, "title": "澳门回归", "description": "祖国统一进程", "category": "政治", "importance": 2},
    {"year": 1999, "title": "国庆五十周年", "description": "改革开放成就展", "category": "政治", "importance": 1},

    # 21世纪 (2000-2009)
    {"year": 2001, "title": "加入WTO", "description": "融入全球经济体系", "category": "经济", "importance": 3},
    {"year": 2001, "title": "北京申奥成功", "description": "获得2008奥运举办权", "category": "体育", "importance": 2},
    {"year": 2001, "title": "911事件", "description": "美国恐怖袭击", "category": "国际", "importance": 1},
    {"year": 2003, "title": "非典疫情", "description": "公共卫生事件", "category": "社会", "importance": 2},
    {"year": 2003, "title": "神舟五号", "description": "首次载人航天", "category": "科技", "importance": 2},
    {"year": 2005, "title": "取消农业税", "description": "两千年轻徭薄赋", "category": "经济", "importance": 2},
    {"year": 2006, "title": "三峡大坝竣工", "description": "世界最大水电工程", "category": "经济", "importance": 1},
    {"year": 2008, "title": "汶川地震", "description": "八级大地震", "category": "社会", "importance": 3},
    {"year": 2008, "title": "北京奥运会", "description": "百年奥运梦想实现", "category": "体育", "importance": 3},
    {"year": 2009, "title": "国庆六十周年", "description": "新中国伟大成就", "category": "政治", "importance": 1},

    # 2010-2019
    {"year": 2010, "title": "上海世博会", "description": "城市让生活更美好", "category": "文化", "importance": 1},
    {"year": 2011, "title": "辛亥革命百年", "description": "纪念历史", "category": "政治", "importance": 1},
    {"year": 2012, "title": "十八大", "description": "习近平当选", "category": "政治", "importance": 2},
    {"year": 2013, "title": "一带一路", "description": "对外开放新战略", "category": "经济", "importance": 2},
    {"year": 2014, "title": "APEC北京峰会", "description": "亚太合作", "category": "外交", "importance": 1},
    {"year": 2015, "title": "抗战胜利七十周年", "description": "大阅兵", "category": "政治", "importance": 1},
    {"year": 2016, "title": "G20杭州峰会", "description": "全球经济治理", "category": "外交", "importance": 1},
    {"year": 2017, "title": "十九大", "description": "新时代开启", "category": "政治", "importance": 2},
    {"year": 2018, "title": "改革开放四十周年", "description": "伟大飞跃", "category": "政治", "importance": 1},
    {"year": 2019, "title": "国庆七十周年", "description": "盛世华诞", "category": "政治", "importance": 2},

    # 2020-2024
    {"year": 2020, "title": "新冠疫情", "description": "全民抗疫", "category": "社会", "importance": 3},
    {"year": 2020, "title": "全面建成小康社会", "description": "脱贫攻坚", "category": "社会", "importance": 2},
    {"year": 2021, "title": "建党百年", "description": "百年华章", "category": "政治", "importance": 3},
    {"year": 2022, "title": "北京冬奥会", "description": "双奥之城", "category": "体育", "importance": 2},
    {"year": 2022, "title": "二十大", "description": "新征程", "category": "政治", "importance": 2},
    {"year": 2023, "title": "杭州亚运会", "description": "亚洲体育盛会", "category": "体育", "importance": 1},
    {"year": 2024, "title": "新中国成立七十五周年", "description": "继往开来", "category": "政治", "importance": 1},
]


def main():
    """初始化历史事件"""
    db = SessionLocal()
    try:
        # 检查是否已有数据
        existing = db.query(models.HistoricalEvent).count()
        if existing > 0:
            print(f"数据库中已有 {existing} 条历史事件，跳过初始化")
            return

        # 插入数据
        for event in EVENTS:
            db_event = models.HistoricalEvent(
                year=event["year"],
                title=event["title"],
                description=event["description"],
                category=event["category"],
                importance=event["importance"]
            )
            db.add(db_event)

        db.commit()
        print(f"成功插入 {len(EVENTS)} 条历史事件")

        # 统计各类别数量
        categories = {}
        for event in EVENTS:
            cat = event["category"]
            categories[cat] = categories.get(cat, 0) + 1

        print("\n各类别数量:")
        for cat, count in categories.items():
            print(f"  {cat}: {count}")

    except Exception as e:
        print(f"初始化失败: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == '__main__':
    main()