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

// 简单的手动布局：按关系层级 horizontal 排列
const getLayoutedElements = (persons, relationships) => {
  if (!persons.length) return { nodes: [], edges: [] }

  const nodeWidth = 140
  const nodeHeight = 100
  const horizontalGap = 60
  const verticalGap = 80

  // 构建父子关系图，找最老的一辈
  const childToParents = {}
  const parentToChildren = {}

  relationships.forEach(rel => {
    if (rel.relation_type === 'father' || rel.relation_type === 'mother') {
      childToParents[rel.person_b_id] = rel.person_a_id
      if (!parentToChildren[rel.person_a_id]) parentToChildren[rel.person_a_id] = []
      parentToChildren[rel.person_a_id].push(rel.person_b_id)
    }
  })

  // 找祖先（是父母但不是子女的人）
  const roots = persons.filter(p => !childToParents[p.id]).map(p => p.id)

  // BFS 分层
  const levels = {}
  const visited = new Set()

  const bfs = (startId, level) => {
    const queue = [[startId, level]]
    while (queue.length > 0) {
      const [id, gen] = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)

      if (!levels[gen]) levels[gen] = []
      levels[gen].push(id)

      // 添加子女
      if (parentToChildren[id]) {
        parentToChildren[id].forEach(childId => {
          queue.push([childId, gen + 1])
        })
      }
    }
  }

  // 从每个根开始遍历
  roots.forEach(rootId => bfs(rootId, 0))

  // 处理未分配的（如配偶关系连接的）
  persons.forEach(p => {
    if (!visited.has(p.id)) {
      const gen = Object.keys(levels).length
      if (!levels[gen]) levels[gen] = []
      levels[gen].push(p.id)
    }
  })

  // 生成节点
  const nodes = []
  Object.entries(levels).forEach(([level, personIds]) => {
    const totalWidth = personIds.length * nodeWidth + (personIds.length - 1) * horizontalGap
    const startX = -totalWidth / 2

    personIds.forEach((personId, idx) => {
      const person = persons.find(p => p.id === personId)
      if (!person) return

      nodes.push({
        id: person.id,
        type: 'person',
        position: {
          x: startX + idx * (nodeWidth + horizontalGap),
          y: parseInt(level) * (nodeHeight + verticalGap),
        },
        data: { person },
      })
    })
  })

  // 生成边
  const edges = relationships.map(rel => ({
    id: `${rel.id}`,
    source: rel.person_a_id,
    target: rel.person_b_id,
    label: relationLabels[rel.relation_type] || rel.relation_type,
    type: 'smoothstep',
    animated: rel.relation_type === 'father' || rel.relation_type === 'mother',
    style: { stroke: '#C9A84C', strokeWidth: 2 },
    labelStyle: { fill: '#5C3D2E', fontWeight: 600 },
    labelBgStyle: { fill: '#FAF7F2', fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }))

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
            setNewPerson({
              name: p.name,
              birth_year: p.birth_year || '',
              death_year: p.death_year || '',
              gender: p.gender || '男',
              bio: p.bio || '',
              father_id: '', mother_id: '', spouse_id: '' // 编辑模式暂不处理初始关系修改
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
      
      if (editingPerson) {
        await updatePerson(editingPerson.id, payload)
      } else {
        const res = await createPerson(payload)
        const createdPerson = res.data

        // 建立多重关系
        const relPromises = []
        if (newPerson.father_id) {
          relPromises.push(createRelationship({ person_a_id: newPerson.father_id, person_b_id: createdPerson.id, relation_type: 'father' }))
        }
        if (newPerson.mother_id) {
          relPromises.push(createRelationship({ person_a_id: newPerson.mother_id, person_b_id: createdPerson.id, relation_type: 'mother' }))
        }
        if (newPerson.spouse_id) {
          relPromises.push(createRelationship({ person_a_id: newPerson.spouse_id, person_b_id: createdPerson.id, relation_type: 'spouse' }))
        }
        await Promise.all(relPromises)
      }

      setShowAddModal(false)
      setEditingPerson(null)
      fetchData() // 刷新数据
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

              {/* 初始关系建立 - 仅在新增时显示 */}
              {!editingPerson && persons.length > 0 && (
                <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#D4C4B0] space-y-2">
                  <label className="block text-xs font-bold text-[#8B7355] uppercase mb-1">建立初始关系</label>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">父亲:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none"
                        value={newPerson.father_id}
                        onChange={e => setNewPerson({...newPerson, father_id: e.target.value})}
                      >
                        <option value="">(空)</option>
                        {persons.filter(p => p.gender === '男').map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">母亲:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none"
                        value={newPerson.mother_id}
                        onChange={e => setNewPerson({...newPerson, mother_id: e.target.value})}
                      >
                        <option value="">(空)</option>
                        {persons.filter(p => p.gender === '女').map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12 text-right">配偶:</span>
                      <select 
                        className="flex-1 border-[#D4C4B0] border rounded p-1 text-xs outline-none"
                        value={newPerson.spouse_id}
                        onChange={e => setNewPerson({...newPerson, spouse_id: e.target.value})}
                      >
                        <option value="">(无)</option>
                        {persons.map(p => (
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