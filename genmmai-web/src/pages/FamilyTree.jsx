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
import { getPersons, getRelationships, createPerson } from '../api'

// 自定义人物节点组件
const PersonNode = ({ data }) => {
  const navigate = useNavigate()
  const { person } = data

  const handleClick = () => {
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
      onClick={handleClick}
      className="w-[120px] bg-white rounded-lg shadow-md border-2 border-[#D4C4B0] p-3 flex flex-col items-center cursor-pointer hover:border-[#C9A84C] hover:shadow-lg transition-all"
    >
      <Handle type="target" position={Position.Top} className="!bg-[#5C3D2E]" />

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
  const [newPerson, setNewPerson] = useState({
    name: '',
    birth_year: '',
    death_year: '',
    gender: '男',
    bio: ''
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
      setNodes(layoutedNodes)
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
    setShowAddModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await createPerson({
        ...newPerson,
        birth_date: newPerson.birth_year, // 后端模型用的是 birth_date
        death_date: newPerson.death_year
      })
      setShowAddModal(false)
      setNewPerson({ name: '', birth_year: '', death_year: '', gender: '男', bio: '' })
      fetchData() // 刷新数据
    } catch (err) {
      console.error("添加失败:", err)
      alert("添加失败，请检查后端服务")
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

      {/* 添加成员弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[10000]">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl border-2 border-[#D4C4B0]">
            <h2 className="text-2xl font-serif text-[#5C3D2E] mb-6 text-center">新增家族成员</h2>
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
                  rows="3"
                  value={newPerson.bio}
                  onChange={e => setNewPerson({...newPerson, bio: e.target.value})}
                  placeholder="简要描述生平..."
                ></textarea>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-[#8B7355] hover:text-[#5C3D2E]"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-[#5C3D2E] text-white rounded-md hover:bg-[#3D281E] transition-colors"
                >
                  确认添加
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