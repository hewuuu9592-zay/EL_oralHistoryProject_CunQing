import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPersons, getRelationships, createPerson, createRelationship, updatePerson, deletePerson, deletePersonForce, deleteRelationship, getPersonInterviews, startInterview, uploadAndProcessAudio } from '../api'
import FamilyTimeline from './FamilyTimeline'
import FamilyMigrationMap from './FamilyMigrationMap'

// 渲染单个人物卡片 
const PersonCard = ({ person, onEdit, onDelete, navigate }) => { 
  const lifeSpan = person.death_year 
    ? `${person.birth_year || '?'}-${person.death_year}` 
    : person.birth_year ? `${person.birth_year}` : '' 
  
  return ( 
    <div 
      className={`person-card ${person.gender === '男' ? 'male' : person.gender === '女' ? 'female' : ''}`} 
      onClick={(e) => { e.stopPropagation(); navigate(`/person/${person.id}`) }} 
    > 
      <div className="avatar"> 
        {person.avatar_url 
          ? <img src={person.avatar_url} alt={person.name} style={{width:'100%',height:'100%',objectFit:'cover'}} /> 
          : person.name.charAt(0) 
        } 
      </div> 
      <div className="name">{person.name}</div> 
      {lifeSpan && <div className="years">{lifeSpan}</div>} 
      <div className="card-actions" style={{display:'flex',gap:2,marginTop:2}}> 
        <button onClick={e=>{e.stopPropagation();onEdit(person)}} 
          style={{fontSize:10,padding:'1px 4px',border:'1px solid #D4C4B0',borderRadius:3,background:'white',cursor:'pointer'}}>✎</button> 
        <button onClick={e=>{e.stopPropagation();onDelete(person.id)}} 
          style={{fontSize:10,padding:'1px 4px',border:'1px solid #D4C4B0',borderRadius:3,background:'white',color:'red',cursor:'pointer'}}>✕</button> 
      </div> 
    </div> 
  ) 
} 

// 渲染一个家庭单元（血缘节点 + 配偶 + 子女） 
const FamilyNode = ({ node, personsMap, onEdit, onDelete, navigate }) => { 
  const blood = personsMap[node.bloodId] 
  const spouse = node.spouseId ? personsMap[node.spouseId] : null 
  if (!blood) return null 
  
  return ( 
    <li> 
      <div className="family-unit"> 
        <PersonCard person={blood} onEdit={onEdit} onDelete={onDelete} navigate={navigate} /> 
        {spouse && <> 
          <div className="spouse-divider" /> 
          <PersonCard person={spouse} onEdit={onEdit} onDelete={onDelete} navigate={navigate} /> 
        </>} 
      </div> 
      {node.children && node.children.length > 0 && ( 
        <ul> 
          {node.children.map(child => ( 
            <FamilyNode 
              key={child.bloodId} 
              node={child} 
              personsMap={personsMap} 
              onEdit={onEdit} 
              onDelete={onDelete} 
              navigate={navigate} 
            /> 
          ))} 
        </ul> 
      )} 
    </li> 
  ) 
} 

// 数据转换函数
const buildTree = (persons, relationships) => { 
  const parentsOf = {} 
  const spouseOf = {} 
  const familyChildren = {} 
  
  relationships.forEach(rel => { 
    if (rel.relation_type === 'father' || rel.relation_type === 'mother') { 
      if (!parentsOf[rel.person_b_id]) parentsOf[rel.person_b_id] = [] 
      parentsOf[rel.person_b_id].push(rel.person_a_id) 
    } 
    if (rel.relation_type === 'spouse') { 
      spouseOf[rel.person_a_id] = rel.person_b_id 
      spouseOf[rel.person_b_id] = rel.person_a_id 
    } 
  }) 
  
  persons.forEach(p => { 
    const parents = parentsOf[p.id] 
    if (parents && parents.length > 0) { 
      const key = [...parents].sort().join('_') 
      if (!familyChildren[key]) familyChildren[key] = [] 
      if (!familyChildren[key].includes(p.id)) familyChildren[key].push(p.id) 
    } 
  }) 
  
  const roots = persons.filter(p => !parentsOf[p.id] || parentsOf[p.id].length === 0) 
  const trueRoots = roots.filter(r => { 
    const sid = spouseOf[r.id] 
    if (!sid) return true 
    // 如果配偶有父母，那么配偶不是根节点，该节点应作为配偶被拉入树中，而不是作为根节点
    if (parentsOf[sid] && parentsOf[sid].length > 0) return false
    // 如果双方都没有父母，则按 ID 排序选一个作为主根，避免重复
    return !roots.some(ro => ro.id === sid) || r.id < sid 
  }) 
  
  const placed = new Set() 
  const buildNode = (personId) => { 
    if (placed.has(personId)) return null 
    placed.add(personId) 
    
    const spouseId = spouseOf[personId] 
    if (spouseId) placed.add(spouseId) 
    
    // 查找子嗣：
    // 1. 匹配双亲 (personId + spouseId)
    // 2. 匹配单亲 (只有 personId)
    const pairKey = [personId, spouseId].filter(Boolean).sort().join('_') 
    const singleKey = String(personId)
    
    const childrenIds = [
      ...(familyChildren[pairKey] || []),
      ...(spouseId ? [] : (familyChildren[singleKey] || [])) 
    ]
    // 去重
    const uniqueChildrenIds = Array.from(new Set(childrenIds))
    
    return { 
      bloodId: personId, 
      spouseId: spouseId || null, 
      children: uniqueChildrenIds.map(buildNode).filter(Boolean) 
    } 
  } 
  
  return trueRoots.map(r => buildNode(r.id)).filter(Boolean) 
}

const FamilyTree = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [persons, setPersons] = useState([])
  const [relationships, setRelationships] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSessions, setActiveSessions] = useState({}); // personId -> session info
  const [totalStories, setTotalStories] = useState(0)
  const [activeTab, setActiveTab] = useState('today') // today | tree | history | map
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [uploading, setUploading] = useState(false)

  // 从 URL 参数切换到历史时间轴标签并高亮事件
  useEffect(() => {
    const eventId = searchParams.get('highlight_event')
    if (eventId) {
      setActiveTab('history')
    }
  }, [searchParams])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPerson, setEditingPerson] = useState(null)
  const [newPerson, setNewPerson] = useState({
    name: '',
    birth_year: '',
    death_year: '',
    gender: '男',
    bio: '',
    father_id: '',
    mother_id: '',
    spouse_id: '',
    isDeceased: false
  })

  const personsMap = useMemo(() => Object.fromEntries(persons.map(p => [p.id, p])), [persons])
  const tree = useMemo(() => buildTree(persons, relationships), [persons, relationships])

  // 加载数据
  const fetchData = async () => {
    try {
      const [personsRes, relsRes] = await Promise.all([
        getPersons(),
        getRelationships(),
      ])
      setPersons(personsRes.data || [])
      setRelationships(relsRes.data || [])

      // 查询每个成员的采访状态
      const allPersons = personsRes.data || []
      const sessionsMap = {}
      let total = 0
      for (const p of allPersons) {
        try {
          const intRes = await getPersonInterviews(p.id)
          const sessions = intRes.data || []
          // 找 active 的session
          const active = sessions.find(s => s.status === 'active')
          if (active) {
            sessionsMap[p.id] = active
          }
          total += sessions.reduce((sum, s) => sum + (s.stories_created || 0), 0)
        } catch (e) {
          console.error('获取采访记录失败:', e)
        }
      }
      setActiveSessions(sessionsMap)
      setTotalStories(total)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 开始采访
  const handleInterview = (person) => {
    navigate(`/interview?personId=${person.id}`)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleEditPerson = (p) => {
    setEditingPerson(p)
    const father = relationships.find(r => r.person_b_id === p.id && r.relation_type === 'father')?.person_a_id || ''
    const mother = relationships.find(r => r.person_b_id === p.id && r.relation_type === 'mother')?.person_a_id || ''
    const spouseRel = relationships.find(r => (r.person_a_id === p.id || r.person_b_id === p.id) && r.relation_type === 'spouse')
    const spouse = spouseRel ? (spouseRel.person_a_id === p.id ? spouseRel.person_b_id : spouseRel.person_a_id) : ''
  
    // 根据 death_year 是否有值来决定 isDeceased
    const isDeceased = !!(p.death_year && p.death_year !== '')
  
    setNewPerson({
      name: p.name,
      birth_year: p.birth_year || '',
      death_year: p.death_year || '',
      gender: p.gender || '男',
      bio: p.bio || '',
      father_id: father,
      mother_id: mother,
      spouse_id: spouse,
      isDeceased: isDeceased   // 新增
    })
    setShowAddModal(true)
  }

  const handleAddPerson = (e) => {
    e?.stopPropagation()
    setEditingPerson(null)
    setNewPerson({ 
      name: '', birth_year: '', death_year: '', gender: '男', bio: '', 
      father_id: '', mother_id: '', spouse_id: '',
      isDeceased: false   // 新增
    })
    setShowAddModal(true)
  }

  const handleDeletePerson = async (id) => {
    if (!window.confirm("确定要删除这位成员吗？相关的家族关系也会被一并删除。")) return
    try {
      await deletePerson(id)
      fetchData()
    } catch (err) {
      if (err.response?.status === 409) {
        // 有关联的故事，询问用户是否强制删除
        const msg = err.response?.data?.detail || "该人物关联了故事，是否强制删除？（关联的故事记录也会被删除）"
        if (window.confirm(msg)) {
          await deletePersonForce(id)
          fetchData()
        }
      } else {
        alert("删除失败")
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: newPerson.name,
        gender: newPerson.gender,
        birth_year: newPerson.birth_year ? parseInt(newPerson.birth_year) : null,
        death_year: newPerson.isDeceased && newPerson.death_year ? parseInt(newPerson.death_year) : null,
        bio: newPerson.bio
      }
      
      let targetPersonId;
      if (editingPerson) {
        await updatePerson(editingPerson.id, payload)
        targetPersonId = editingPerson.id
        const oldRels = relationships.filter(r => 
          r.person_b_id === targetPersonId || 
          (r.relation_type === 'spouse' && (r.person_a_id === targetPersonId || r.person_b_id === targetPersonId))
        )
        await Promise.all(oldRels.map(r => deleteRelationship(r.id)))
      } else {
        const res = await createPerson(payload)
        targetPersonId = res.data.id
      }

      const relPromises = []
      if (newPerson.father_id) {
        relPromises.push(createRelationship({ person_a_id: newPerson.father_id, person_b_id: targetPersonId, relation_type: 'father' }))
      }
      if (newPerson.mother_id) {
        relPromises.push(createRelationship({ person_a_id: newPerson.mother_id, person_b_id: targetPersonId, relation_type: 'mother' }))
      }
      if (newPerson.spouse_id) {
        relPromises.push(createRelationship({ person_a_id: newPerson.spouse_id, person_b_id: targetPersonId, relation_type: 'spouse' }))
      }
      await Promise.all(relPromises)

      setShowAddModal(false)
      setEditingPerson(null)
      fetchData()
    } catch (err) {
      console.error("提交失败:", err)
      alert("提交失败，请检查数据格式或后端服务")
    }
  }

  // 今日录入组件
  const TodayInterview = () => {
    const fileInputRef = React.useRef(null)

    const handleFileSelect = async (e) => {
      const file = e.target.files?.[0]
      if (!file || !selectedPerson) return

      const ext = file.name.split('.').pop().toLowerCase()
      if (!['mp3', 'wav', 'm4a', 'webm'].includes(ext)) {
        alert('请选择 mp3/wav/m4a/webm 格式的音频文件')
        return
      }

      setUploading(true)
      try {
        await uploadAndProcessAudio(file, selectedPerson.id)
        navigate(`/record?personId=${selectedPerson.id}&uploaded=true`)
      } catch (err) {
        console.error('上传失败:', err)
        alert('上传失败，请重试')
      } finally {
        setUploading(false)
      }
    }

    return (
      <div className="p-6 max-w-2xl mx-auto">
        {/* 第一部分：选择人物 */}
        <div className="mb-8">
          <h2 className="text-xl font-medium text-[#4A3728] mb-4">今天想和谁聊聊？</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {persons.map((p) => {
              const active = activeSessions[p.id]
              const isActive = active && active.status === 'active'
              const isSelected = selectedPerson?.id === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPerson(p)}
                  className={`flex flex-col items-center flex-shrink-0 cursor-pointer ${
                    isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-[60px] h-[60px] rounded-full flex items-center justify-center overflow-hidden border-2 shadow-sm ${
                        isSelected ? 'border-[#5C3D2E] border-4' : 'border-white'
                      }`}
                      style={{ backgroundColor: '#D4A574' }}
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xl font-medium">{p.name?.charAt(0)}</span>
                      )}
                    </div>
                    {isActive && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-orange-400 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <span className="text-sm text-[#4A3728] mt-2 truncate max-w-[60px]">
                    {p.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 第二部分：选择录入方式 */}
        {selectedPerson && (
          <div>
            <h3 className="text-lg font-medium text-[#4A3728] mb-4">
              与 {selectedPerson.name} 的今日对话
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {/* AI 采访卡片 */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5DED3] flex flex-col">
                <div className="font-medium text-[#4A3728] mb-2 text-lg">AI采访</div>
                <div className="text-sm text-gray-500 mb-4 flex-1">
                  由 AI 引导，层层追问，生成结构化故事
                </div>
                <button
                  onClick={() => navigate(`/interview?personId=${selectedPerson.id}`)}
                  className="w-full py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
                >
                  开始采访
                </button>
              </div>

              {/* 自由录入卡片 */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5DED3] flex flex-col">
                <div className="font-medium text-[#4A3728] mb-2 text-lg">自由录入</div>
                <div className="text-sm text-gray-500 mb-4 flex-1">
                  自己说，自己定主题，上传或即时录音都可以
                </div>
                <button
                  onClick={() => navigate(`/record?personId=${selectedPerson.id}`)}
                  className="w-full py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3125]"
                >
                  开始录入
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.m4a,.webm"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>
          </div>
        )}

        {/* 统计 */}
        <div className="mt-8 text-center text-sm text-gray-400">
          已记录 {totalStories} 个故事 · {persons.length} 位成员 ·{' '}
          {Object.keys(activeSessions).length} 次采访
        </div>
      </div>
    )
  }

  // 侧边栏导航项
  const navItems = [
    { key: 'today', label: '今日录入' },
    { key: 'tree', label: '家族树' },
    { key: 'history', label: '家族变迁史' },
    { key: 'map', label: '家族迁徙地图' },
  ]

  return (
    <div className="flex min-h-screen bg-[#FAF7F2]">
      {/* 侧边栏 */}
      <div
        className={`flex flex-col bg-[#FAF7F2] border-r border-[#E5DED3] transition-all duration-300 ${
          sidebarExpanded ? 'w-[180px]' : 'w-12'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-[#E5DED3]">
          {sidebarExpanded ? (
            <h1 className="text-2xl font-serif text-[#5C3D2E]">根脉</h1>
          ) : (
            <h1 className="text-xl font-serif text-[#5C3D2E]">根</h1>
          )}
        </div>

        {/* 导航项 */}
        <div className="flex-1 py-4">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full px-4 py-3 transition-colors ${
                activeTab === item.key
                  ? 'bg-[#5C3D2E] text-white'
                  : 'text-[#4A3728] hover:bg-[#E8DFD0]'
              }`}
            >
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </div>

        {/* 收起/展开按钮 */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="h-12 border-t border-[#E5DED3] flex items-center justify-center text-[#5C3D2E] hover:bg-[#E8DFD0]"
        >
          {sidebarExpanded ? '«' : '»'}
        </button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="h-16 bg-white border-b border-[#E5DED3] flex items-center justify-between px-6">
          <div className="text-[#5C3D2E] font-medium">
            {navItems.find(n => n.key === activeTab)?.label}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {persons.length}位成员 · {totalStories}个故事
            </span>
            <button
              onClick={() => navigate('/settings')}
              className="text-sm text-[#8B7355] hover:text-[#5C3D2E]"
            >
              设置
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
          {/* 今日录入 */}
          <div style={{ display: activeTab === 'today' ? 'block' : 'none' }}>
            <TodayInterview />
          </div>

      {/* 内容区域 - 仅在家族树 tab 显示 */}
      <div className="pt-0 pb-20" style={{ display: activeTab === 'tree' ? 'block' : 'none' }}>
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-[#5C3D2E]">加载中...</div>
        </div>
      ) : persons.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen">
          <p className="text-[#5C3D2E] text-lg mb-4">从第一位家族成员开始</p>
          <button
            type="button"
            onClick={(e) => handleAddPerson(e)}
            style={{
              padding: '8px 24px',
              backgroundColor: '#5C3D2E',
              color: 'white',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            添加成员
          </button>
        </div>
      ) : (
        <div className="family-tree-container pt-8 pb-32 overflow-auto">
          <div className="family-tree">
            <ul>
              {tree.map(node => (
                <FamilyNode 
                  key={node.bloodId} 
                  node={node} 
                  personsMap={personsMap} 
                  onEdit={handleEditPerson} 
                  onDelete={handleDeletePerson} 
                  navigate={navigate} 
                />
              ))}
            </ul>
          </div>
        </div>
      )}
      </div>

      {/* 家族树 */}
          <div style={{ display: activeTab === 'tree' ? 'block' : 'none' }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-[#5C3D2E]">加载中...</div>
              </div>
            ) : persons.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[#5C3D2E] text-lg mb-4">从第一位家族成员开始</p>
                <button
                  type="button"
                  onClick={(e) => handleAddPerson(e)}
                  className="px-6 py-2 bg-[#5C3D2E] text-white rounded-full hover:bg-[#4A3125]"
                >
                  添加成员
                </button>
              </div>
            ) : (
              <div className="family-tree-container p-4 overflow-auto">
                <div className="family-tree">
                  <ul>
                    {tree.map(node => (
                      <FamilyNode
                        key={node.bloodId}
                        node={node}
                        personsMap={personsMap}
                        onEdit={handleEditPerson}
                        onDelete={handleDeletePerson}
                        navigate={navigate}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* 家族变迁史 */}
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
            <FamilyTimeline searchParams={searchParams} />
          </div>

          {/* 家族迁徙地图 */}
          <div style={{ display: activeTab === 'map' ? 'block' : 'none' }}>
            <FamilyMigrationMap />
          </div>
        </div>

        {/* 右下角添加按钮 - 仅在家族树 tab 且有成员时显示 */}
        {activeTab === 'tree' && persons.length > 0 && (
          <button
            type="button"
            onClick={(e) => handleAddPerson(e)}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#5C3D2E] text-white text-2xl hover:bg-[#4A3125] shadow-lg z-50"
          >
            +
          </button>
        )}

      {/* 添加/编辑成员弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[10000]">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl border-2 border-[#D4C4B0]">
            <h2 className="text-2xl font-serif text-[#5C3D2E] mb-6 text-center">
              {editingPerson ? '编辑成员' : '新增家族成员'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#6B5344] mb-1">姓名</label>
                <input 
                  required
                  className="w-full border-[#D4C4B0] border rounded-md p-2 focus:ring-[#C9A84C] focus:border-[#C9A84C] outline-none"
                  value={newPerson.name}
                  onChange={e => setNewPerson({...newPerson, name: e.target.value})}
                  placeholder="请输入姓名"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B5344] mb-1">出生年份</label>
                  <input 
                    className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                    value={newPerson.birth_year}
                    onChange={e => setNewPerson({...newPerson, birth_year: e.target.value})}
                    placeholder="如：1950"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B5344] mb-1">性别</label>
                  <select 
                    className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                    value={newPerson.gender}
                    onChange={e => setNewPerson({...newPerson, gender: e.target.value})}
                  >
                    <option>男</option>
                    <option>女</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPerson.isDeceased}
                    onChange={e => {
                      const checked = e.target.checked;
                      setNewPerson({
                        ...newPerson,
                        isDeceased: checked,
                        // 如果取消勾选，清空逝世年份
                        death_year: checked ? newPerson.death_year : ''
                      });
                    }}
                    className="w-4 h-4 text-[#5C3D2E] rounded border-[#D4C4B0] focus:ring-[#C9A84C]"
                  />
                  <span className="text-sm text-[#6B5344]">已逝世</span>
                </label>

                {newPerson.isDeceased && (
                  <div>
                    <label className="block text-sm font-medium text-[#6B5344] mb-1">逝世年份</label>
                    <input 
                      className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                      value={newPerson.death_year}
                      onChange={e => setNewPerson({...newPerson, death_year: e.target.value})}
                      placeholder="如：2020"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B5344] mb-1">简介</label>
                <textarea 
                  className="w-full border-[#D4C4B0] border rounded-md p-2 outline-none"
                  rows="2"
                  value={newPerson.bio}
                  onChange={e => setNewPerson({...newPerson, bio: e.target.value})}
                  placeholder="简要描述生平..."
                ></textarea>
              </div>

              {/* 关系设置 */}
              {persons.length > 0 && (
                <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#D4C4B0] space-y-2">
                  <label className="block text-xs font-bold text-[#8B7355] uppercase mb-1">家族关系设置</label>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">父亲:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                        value={newPerson.father_id}
                        onChange={e => setNewPerson({...newPerson, father_id: e.target.value})}
                      >
                        <option value="">(空)</option>
                        {persons.filter(p => p.gender === '男' && p.id !== (editingPerson?.id)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">母亲:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                        value={newPerson.mother_id}
                        onChange={e => setNewPerson({...newPerson, mother_id: e.target.value})}
                      >
                        <option value="">(空)</option>
                        {persons.filter(p => p.gender === '女' && p.id !== (editingPerson?.id)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">配偶:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none bg-white"
                        value={newPerson.spouse_id}
                        onChange={e => setNewPerson({...newPerson, spouse_id: e.target.value})}
                      >
                        <option value="">(无)</option>
                        {persons.filter(p => p.id !== (editingPerson?.id)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingPerson(null); }}
                  className="px-4 py-2 text-[#8B7355] hover:text-[#5C3D2E]"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md hover:bg-[#3D281E] transition-colors"
                >
                  {editingPerson ? '保存修改' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default FamilyTree
