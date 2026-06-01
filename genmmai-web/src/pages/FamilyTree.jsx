import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getPersons, getRelationships, createPerson, createRelationship, updatePerson, deletePerson } from '../api'

// 自定义人物节点组件
const PersonNode = ({ data }) => {
  const navigate = useNavigate()
  const { person, onEdit, onDelete } = data

  const handleClick = (e) => {
    e.stopPropagation()
    navigate(`/person/${person.id}`)
  }

  // 格式化生卒年
  const lifeSpan = person.death_year
    ? `${person.birth_year || '?'} - ${person.death_year}`
    : person.birth_year
      ? `${person.birth_year}+`
      : ''

  return (
    <div
      className="group relative w-[130px] bg-white rounded-lg shadow-md border-2 border-[#D4C4B0] p-3 flex flex-col items-center cursor-pointer hover:border-[#C9A84C] hover:shadow-lg transition-all"
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#5C3D2E]" />

      {/* 操作按钮 - 悬浮显示 */}
      <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1 z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(person); }}
          className="p-1 bg-white border border-[#D4C4B0] rounded shadow-sm hover:bg-[#FAF7F2] text-blue-600 text-[10px]"
        >
          ✎
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(person.id); }}
          className="p-1 bg-white border border-[#D4C4B0] rounded shadow-sm hover:bg-red-50 text-red-600 text-[10px]"
        >
          ✕
        </button>
      </div>

      {/* 头像 */}
      <div className="w-10 h-10 rounded-full bg-[#C9A84C] flex items-center justify-center mb-2 overflow-hidden">
        {person.avatar_url ? (
          <img src={person.avatar_url} alt={person.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg font-serif text-white">{person.name.charAt(0)}</span>
        )}
      </div>

      {/* 姓名 */}
      <div className="text-sm font-bold text-[#5C3D2E] text-center truncate w-full">
        {person.name}
      </div>

      {/* 生卒年 */}
      <div className="text-xs text-gray-500 mt-1">
        {lifeSpan}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-[#5C3D2E]" />
    </div>
  )
}

const nodeTypes = { person: PersonNode }

// 关系类型标签映射
const relationLabels = {
  father: '父亲',
  mother: '母亲',
  spouse: '配偶',
  sibling: '兄弟姐妹',
  child: '子女',
  other: '其他',
}

// 改进的布局算法：以血缘为核心，合并关系线，居中对齐
const getLayoutedElements = (persons, relationships) => {
  if (!persons.length) return { nodes: [], edges: [] }

  const nodeWidth = 140
  const horizontalGap = 100
  const verticalGap = 200 // 增加高度给合并线留空间

  const nodes = []
  const edges = []
  const personDepth = {}
  const processed = new Set()

  // 1. 构建索引
  const childrenOf = {} // "p1_id,p2_id" -> [child_ids]
  const spouseOf = {} // p_id -> spouse_id
  const parentsOf = {} // p_id -> [p1, p2]

  relationships.forEach(rel => {
    if (rel.relation_type === 'father' || rel.relation_type === 'mother') {
      if (!parentsOf[rel.person_b_id]) parentsOf[rel.person_b_id] = []
      parentsOf[rel.person_b_id].push(rel.person_a_id)
    } else if (rel.relation_type === 'spouse') {
      spouseOf[rel.person_a_id] = rel.person_b_id
      spouseOf[rel.person_b_id] = rel.person_a_id
    }
  })

  // 归一化父母对索引，确保 (A,B) 和 (B,A) 指向同一个家庭
  persons.forEach(p => {
    const parents = parentsOf[p.id] || []
    if (parents.length > 0) {
      // 只要有任何父母关系，就计入索引
      const pairKey = parents.sort().join(',')
      if (!childrenOf[pairKey]) childrenOf[pairKey] = []
      childrenOf[pairKey].push(p.id)
    }
  })

  // 2. 计算深度（辈分）
  const roots = persons.filter(p => !(parentsOf[p.id] && parentsOf[p.id].length > 0))
  const computeDepth = (id, d, visited = new Set()) => {
    if (visited.has(id)) return
    visited.add(id)
    personDepth[id] = Math.max(personDepth[id] || 0, d)
    const spouseId = spouseOf[id]
    if (spouseId) personDepth[spouseId] = personDepth[id]

    // 找到所有以该人为父母的孩子
    persons.forEach(child => {
      const parents = parentsOf[child.id] || []
      if (parents.includes(id) || (spouseId && parents.includes(spouseId))) {
        computeDepth(child.id, d + 1, visited)
      }
    })
  }
  roots.forEach(r => computeDepth(r.id, 0))

  // 3. 递归布局函数：返回该子树占用的总宽度
  const layoutSubtree = (personId, startX, depth) => {
    if (processed.has(personId)) return 0
    processed.add(personId)

    const person = persons.find(p => p.id === personId)
    const spouseId = spouseOf[personId]
    const hasSpouse = spouseId && !processed.has(spouseId)
    if (hasSpouse) processed.add(spouseId)

    // 找到家庭的所有孩子
    const pairKey = [personId, spouseId].filter(Boolean).sort().join(',')
    const childrenIds = childrenOf[pairKey] || []

    // 递归布局所有子树
    let childrenTotalWidth = 0
    if (childrenIds.length > 0) {
      childrenIds.forEach((childId, idx) => {
        childrenTotalWidth += layoutSubtree(childId, startX + childrenTotalWidth, depth + 1)
        if (idx < childrenIds.length - 1) childrenTotalWidth += horizontalGap
      })
    }

    // 确定本级宽度：血缘节点是核心，配偶靠边站
    const selfWidth = nodeWidth 
    const subtreeWidth = Math.max(selfWidth, childrenTotalWidth)

    // 核心逻辑：血缘节点居中对齐其所有子嗣的中轴
    const bloodlineX = startX + (subtreeWidth - selfWidth) / 2
    
    // 放置血缘节点
    nodes.push({
      id: personId,
      type: 'person',
      position: { x: bloodlineX, y: depth * verticalGap },
      data: { person }
    })

    // 放置配偶（放在血缘节点右侧，不参与中轴计算，保证垂直对齐）
    if (hasSpouse) {
      const spouse = persons.find(p => p.id === spouseId)
      nodes.push({
        id: spouseId,
        type: 'person',
        position: { x: bloodlineX + nodeWidth + 30, y: depth * verticalGap },
        data: { person: spouse }
      })
      // 夫妻连线
      edges.push({
        id: `spouse-${personId}-${spouseId}`,
        source: personId,
        target: spouseId,
        label: '配偶',
        style: { stroke: '#FF6B6B', strokeDasharray: '5,5' },
        type: 'straight'
      })
    }

    // 绘制合并的关系线（Junction 模式）
    if (childrenIds.length > 0) {
      // 家族交汇点（Junction）：位于父母和孩子之间
      const junctionId = `junction-${pairKey}`
      // 交汇点位于父母（血缘+配偶）的中点下方
      const parentMidX = hasSpouse ? (bloodlineX + nodeWidth + 15) : (bloodlineX + nodeWidth / 2)
      const junctionY = depth * verticalGap + 120

      nodes.push({
        id: junctionId,
        position: { x: parentMidX, y: junctionY },
        data: {},
        style: { width: 0, height: 0, opacity: 0 },
        hidden: false // 改为不隐藏，但设置 opacity 0
      })

      // 父母 -> 交汇点
      edges.push({
        id: `p1-j-${personId}`,
        source: personId,
        target: junctionId,
        type: 'smoothstep',
        style: { stroke: '#C9A84C', strokeWidth: 2 }
      })
      if (hasSpouse) {
        edges.push({
          id: `p2-j-${spouseId}`,
          source: spouseId,
          target: junctionId,
          type: 'smoothstep',
          style: { stroke: '#C9A84C', strokeWidth: 2 }
        })
      }

      // 交汇点 -> 所有孩子
      childrenIds.forEach(childId => {
        edges.push({
          id: `j-c-${childId}`,
          source: junctionId,
          target: childId,
          type: 'smoothstep',
          style: { stroke: '#C9A84C', strokeWidth: 2 }
        })
      })
    }

    return subtreeWidth
  }

  // 4. 执行布局
  let currentX = 0
  roots.forEach(root => {
    if (!processed.has(root.id)) {
      currentX += layoutSubtree(root.id, currentX, 0) + horizontalGap * 2
    }
  })

  return { nodes, edges }
}

const FamilyTree = () => {
  const navigate = useNavigate()
  const [persons, setPersons] = useState([])
  const [relationships, setRelationships] = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
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
    spouse_id: ''
  })

  // 加载数据
  const fetchData = async () => {
    try {
      const [personsRes, relsRes] = await Promise.all([
        getPersons(),
        getRelationships(),
      ])
      const personsData = personsRes.data || []
      const relsData = relsRes.data || []
      setPersons(personsData)
      setRelationships(relsData)

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        personsData,
        relsData
      )

      // 注入操作回调
      const nodesWithActions = layoutedNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onEdit: (p) => {
            setEditingPerson(p)
            // 查找该人现有的关系
            const father = relsData.find(r => r.person_b_id === p.id && r.relation_type === 'father')?.person_a_id || ''
            const mother = relsData.find(r => r.person_b_id === p.id && r.relation_type === 'mother')?.person_a_id || ''
            const spouseRel = relsData.find(r => (r.person_a_id === p.id || r.person_b_id === p.id) && r.relation_type === 'spouse')
            const spouse = spouseRel ? (spouseRel.person_a_id === p.id ? spouseRel.person_b_id : spouseRel.person_a_id) : ''

            setNewPerson({
              name: p.name,
              birth_year: p.birth_year || '',
              death_year: p.death_year || '',
              gender: p.gender || '男',
              bio: p.bio || '',
              father_id: father,
              mother_id: mother,
              spouse_id: spouse
            })
            setShowAddModal(true)
          },
          onDelete: (id) => handleDeletePerson(id)
        }
      }))

      setNodes(nodesWithActions)
      setEdges(layoutedEdges)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAddPerson = (e) => {
    e?.stopPropagation()
    setEditingPerson(null)
    setNewPerson({ name: '', birth_year: '', death_year: '', gender: '男', bio: '', father_id: '', mother_id: '', spouse_id: '' })
    setShowAddModal(true)
  }

  const handleDeletePerson = async (id) => {
    if (!window.confirm("确定要删除这位成员吗？相关的家族关系也会被一并删除。")) return
    try {
      await deletePerson(id)
      fetchData()
    } catch (err) {
      alert("删除失败")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: newPerson.name,
        gender: newPerson.gender,
        birth_year: newPerson.birth_year ? parseInt(newPerson.birth_year) : null,
        death_year: newPerson.death_year ? parseInt(newPerson.death_year) : null,
        bio: newPerson.bio
      }
      
      let targetPersonId;
      if (editingPerson) {
        await updatePerson(editingPerson.id, payload)
        targetPersonId = editingPerson.id
        
        // 编辑模式：清理旧关系以重新建立
        const oldRels = relationships.filter(r => 
          r.person_b_id === targetPersonId || 
          (r.relation_type === 'spouse' && (r.person_a_id === targetPersonId || r.person_b_id === targetPersonId))
        )
        await Promise.all(oldRels.map(r => deleteRelationship(r.id)))
      } else {
        const res = await createPerson(payload)
        targetPersonId = res.data.id
      }

      // 建立/更新关系
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

  return (
    <div className="relative" style={{ width: '100%', height: '100vh', background: '#FAF7F2' }}>
      {/* 左上角 Logo */}
      <div className="absolute top-6 left-6 z-10">
        <h1 className="text-4xl font-serif text-[#5C3D2E]">根脉</h1>
      </div>

      {/* 右上角成员数 */}
      <div className="absolute top-6 right-6 z-10 text-[#5C3D2E]">
        成员数：{persons.length}人
      </div>

      {/* React Flow 画布 */}
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#E5DFD3" gap={20} />
          <Controls className="!bg-white !border-[#D4C4B0]" />
        </ReactFlow>
      )}

      {/* 右下角添加按钮 */}
      {persons.length > 0 && (
        <button
          type="button"
          onClick={(e) => handleAddPerson(e)}
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#5C3D2E',
            color: 'white',
            fontSize: '24px',
            border: 'none',
            cursor: 'pointer',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
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
  )
}

export default FamilyTree