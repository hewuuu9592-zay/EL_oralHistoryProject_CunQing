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
import { getPersons, getRelationships } from '../api'

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

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [personsRes, relsRes] = await Promise.all([
          getPersons(),
          getRelationships(),
        ])
        setPersons(personsRes.data || [])
        setRelationships(relsRes.data || [])

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          personsRes.data || [],
          relsRes.data || []
        )
        setNodes(layoutedNodes)
        setEdges(layoutedEdges)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleAddPerson = () => {
    alert('添加人物')
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
            onClick={handleAddPerson}
            className="px-6 py-2 bg-[#5C3D2E] text-white rounded-full hover:bg-[#4A3124] transition-colors"
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
          onClick={handleAddPerson}
          className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-[#5C3D2E] text-white text-2xl flex items-center justify-center shadow-lg hover:bg-[#4A3124] hover:scale-110 transition-all z-10"
        >
          +
        </button>
      )}
    </div>
  )
}

export default FamilyTree