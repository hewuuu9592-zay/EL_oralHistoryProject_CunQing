import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getPersons, getRelationships, createPerson, createRelationship } from '../api';

// 自定义人物节点组件
const PersonNode = ({ data }) => {
  const { person, onClick } = data;

  return (
    <div
      onClick={() => onClick(person.id)}
      className="flex flex-col items-center p-3 bg-white border-2 border-[#D4C4B0] rounded-lg shadow-md cursor-pointer hover:shadow-lg hover:border-[#C9A84C] transition-all min-w-[120px]"
    >
      <Handle type="target" position={Position.Top} className="!bg-[#5C3D2E]" />

      {/* 头像或首字 */}
      <div className="w-14 h-14 rounded-full bg-[#F5EDE3] border-2 border-[#C9A84C] flex items-center justify-center mb-2">
        {person.avatar ? (
          <img src={person.avatar} alt={person.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <span className="text-2xl font-serif text-[#5C3D2E]">{person.name.charAt(0)}</span>
        )}
      </div>

      {/* 姓名 */}
      <div className="text-base font-serif text-[#5C3D2E] font-medium text-center">
        {person.name}
      </div>

      {/* 生卒年 */}
      <div className="text-xs text-[#8B7355] mt-1">
        {person.birth_date || '?'} - {person.death_date || (person.birth_date ? '在世' : '')}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-[#5C3D2E]" />
    </div>
  );
};

const nodeTypes = { person: PersonNode };

// 关系标签映射
const relationshipLabels = {
  parent: '父子',
  spouse: '夫妻',
  sibling: '兄弟',
};

// 计算代际（辈分）
const calculateGenerations = (persons, relationships) => {
  const generations = [];
  const assigned = new Set();

  // 建立父子关系图
  const childrenMap = {};
  relationships.forEach(rel => {
    if (rel.relationship_type === 'parent') {
      if (!childrenMap[rel.person2_id]) childrenMap[rel.person2_id] = [];
      childrenMap[rel.person2_id].push(rel.person1_id);
    }
  });

  // 从最老一辈开始找（没有父母的人）
  const parentIds = new Set();
  relationships.forEach(rel => {
    if (rel.relationship_type === 'parent') {
      parentIds.add(rel.person2_id);
    }
  });

  // 找到祖先（是父母但不是子女的人）
  const ancestorIds = [];
  persons.forEach(p => {
    const isChild = relationships.some(r => r.relationship_type === 'parent' && r.person2_id === p.id);
    const isParent = relationships.some(r => r.relationship_type === 'parent' && r.person1_id === p.id);
    if (isParent && !isChild) {
      ancestorIds.push(p.id);
    }
  });

  // 如果没有明确关系，按加入顺序分配世代
  if (ancestorIds.length === 0) {
    persons.forEach((p, idx) => {
      if (!assigned.has(p.id)) {
        const gen = Math.floor(generations.length);
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(p.id);
        assigned.add(p.id);
      }
    });
  } else {
    // BFS 分配世代
    let queue = ancestorIds.map(id => ({ id, gen: 0 }));
    while (queue.length > 0) {
      const { id, gen } = queue.shift();
      if (assigned.has(id)) continue;
      assigned.add(id);

      if (!generations[gen]) generations[gen] = [];
      generations[gen].push(id);

      // 加入子女
      if (childrenMap[id]) {
        childrenMap[id].forEach(childId => {
          queue.push({ id: childId, gen: gen + 1 });
        });
      }
    }

    // 处理未分配的人
    persons.forEach(p => {
      if (!assigned.has(p.id)) {
        const gen = Math.max(generations.length, 0);
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(p.id);
        assigned.add(p.id);
      }
    });
  }

  return generations;
};

// 自动布局计算
const getLayoutedElements = (persons, relationships) => {
  const generations = calculateGenerations(persons, relationships);

  const nodes = [];
  const edges = [];

  const nodeWidth = 150;
  const nodeHeight = 120;
  const horizontalGap = 40;
  const verticalGap = 100;

  generations.forEach((genPersons, genIndex) => {
    const totalWidth = genPersons.length * nodeWidth + (genPersons.length - 1) * horizontalGap;
    const startX = -totalWidth / 2;

    genPersons.forEach((personId, idx) => {
      const person = persons.find(p => p.id === personId);
      if (!person) return;

      nodes.push({
        id: String(person.id),
        type: 'person',
        position: {
          x: startX + idx * (nodeWidth + horizontalGap),
          y: genIndex * (nodeHeight + verticalGap),
        },
        data: { person, onClick: (id) => window.location.href = `/person/${id}` },
      });
    });
  });

  // 创建边
  relationships.forEach(rel => {
    const sourceExists = nodes.some(n => n.id === String(rel.person1_id));
    const targetExists = nodes.some(n => n.id === String(rel.person2_id));

    if (sourceExists && targetExists) {
      edges.push({
        id: String(rel.id),
        source: String(rel.person1_id),
        target: String(rel.person2_id),
        label: relationshipLabels[rel.relationship_type] || rel.relationship_type,
        type: 'smoothstep',
        animated: rel.relationship_type === 'parent',
        style: { stroke: '#C9A84C', strokeWidth: 2 },
        labelStyle: { fill: '#5C3D2E', fontWeight: 600 },
        labelBgStyle: { fill: '#FAF7F2', fillOpacity: 0.9 },
      });
    }
  });

  return { nodes, edges };
};

// 添加人物Modal
const AddPersonModal = ({ isOpen, onClose, onSubmit, persons }) => {
  const [formData, setFormData] = useState({
    name: '',
    gender: '男',
    birth_date: '',
    death_date: '',
    bio: '',
    relatedPersonId: '',
    relationshipType: 'parent',
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#FAF7F2] rounded-xl p-6 w-full max-w-md shadow-xl border border-[#D4C4B0]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-serif text-[#5C3D2E] mb-6">添加家族成员</h2>

        <div className="space-y-4">
          {/* 姓名 */}
          <div>
            <label className="block text-sm text-[#6B5344] mb-1">姓名 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              placeholder="请输入姓名"
            />
          </div>

          {/* 性别 */}
          <div>
            <label className="block text-sm text-[#6B5344] mb-1">性别</label>
            <div className="flex gap-4">
              {['男', '女'].map((g) => (
                <label key={g} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={formData.gender === g}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="accent-[#C9A84C]"
                  />
                  <span className="text-[#5C3D2E]">{g}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 出生年份 */}
          <div>
            <label className="block text-sm text-[#6B5344] mb-1">出生年份</label>
            <input
              type="text"
              value={formData.birth_date}
              onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              className="w-full px-4 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              placeholder="如：1950"
            />
          </div>

          {/* 去世年份 */}
          <div>
            <label className="block text-sm text-[#6B5344] mb-1">去世年份</label>
            <input
              type="text"
              value={formData.death_date}
              onChange={(e) => setFormData({ ...formData, death_date: e.target.value })}
              className="w-full px-4 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              placeholder="在世请留空"
            />
          </div>

          {/* 一句话简介 */}
          <div>
            <label className="block text-sm text-[#6B5344] mb-1">一句话简介</label>
            <input
              type="text"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="w-full px-4 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              placeholder="一句话介绍这个人"
            />
          </div>

          {/* 与已有人物的关系 */}
          <div className="pt-2 border-t border-[#D4C4B0]">
            <label className="block text-sm text-[#6B5344] mb-2">与已有成员的关系（可选）</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={formData.relatedPersonId}
                onChange={(e) => setFormData({ ...formData, relatedPersonId: e.target.value })}
                className="px-3 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              >
                <option value="">选择成员</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={formData.relationshipType}
                onChange={(e) => setFormData({ ...formData, relationshipType: e.target.value })}
                className="px-3 py-2 border border-[#D4C4B0] rounded-lg focus:border-[#C9A84C] focus:outline-none bg-white"
              >
                <option value="parent">是Ta的子女</option>
                <option value="spouse">是Ta的配偶</option>
                <option value="sibling">是Ta的兄弟姐妹</option>
              </select>
            </div>
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[#D4C4B0] text-[#5C3D2E] rounded-lg hover:bg-[#F5EDE3] transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit(formData)}
            disabled={!formData.name.trim()}
            className="flex-1 px-4 py-2 bg-[#5C3D2E] text-white rounded-lg hover:bg-[#4A3124] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
};

const FamilyTree = () => {
  const navigate = useNavigate();
  const [persons, setPersons] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [personsRes, relsRes] = await Promise.all([
          getPersons(),
          getRelationships(),
        ]);
        setPersons(personsRes.data);
        const rels = relsRes.data || [];
        setRelationships(rels);

        if (personsRes.data.length > 0) {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            personsRes.data,
            rels
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
      } catch (error) {
        console.error('Failed to load family data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 处理节点点击
  const onNodeClick = useCallback((event, node) => {
    navigate(`/person/${node.id}`);
  }, [navigate]);

  // 处理连接受击
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep', style: { stroke: '#C9A84C' } }, eds));
  }, [setEdges]);

  // 提交新人物
  const handleAddPerson = async (formData) => {
    try {
      const personData = {
        name: formData.name,
        gender: formData.gender,
        birth_date: formData.birth_date || null,
        death_date: formData.death_date || null,
        bio: formData.bio || null,
      };

      const personRes = await createPerson(personData);
      const newPerson = personRes.data;
      setPersons([...persons, newPerson]);

      // 如果选择了关联关系
      if (formData.relatedPersonId && formData.relationshipType) {
        await createRelationship({
          person1_id: Number(formData.relatedPersonId),
          person2_id: newPerson.id,
          relationship_type: formData.relationshipType,
        });
      }

      // 重新布局
      const allRels = [...relationships];
      if (formData.relatedPersonId) {
        allRels.push({
          id: Date.now(),
          person1_id: Number(formData.relatedPersonId),
          person2_id: newPerson.id,
          relationship_type: formData.relationshipType,
        });
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        [...persons, newPerson],
        allRels
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add person:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAF7F2]">
      {/* 顶部 header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#D4C4B0] shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-serif text-[#5C3D2E]">根脉</h1>
          <span className="text-lg text-[#8B7355] font-serif">家族</span>
        </div>
        <div className="flex items-center gap-6 text-[#6B5344]">
          <span>{persons.length} 位成员</span>
          <span>0 个故事</span>
        </div>
      </header>

      {/* React Flow 画布 */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#5C3D2E] text-lg">加载中...</div>
          </div>
        ) : persons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-2xl font-serif text-[#5C3D2E] mb-4">欢迎来到根脉</div>
            <div className="text-[#8B7355] mb-6">点击右下角添加第一位家族成员</div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#D4C4B0" gap={20} />
            <Controls className="!bg-white !border-[#D4C4B0] !shadow-md" />
            <MiniMap
              nodeColor="#C9A84C"
              maskColor="rgba(250, 247, 242, 0.8)"
              className="!bg-white !border-[#D4C4B0]"
            />
          </ReactFlow>
        )}
      </div>

      {/* 右下角添加按钮 */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#5C3D2E] text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-[#4A3124] hover:scale-110 transition-all cursor-pointer"
        style={{ boxShadow: '0 4px 12px rgba(92, 61, 46, 0.3)' }}
      >
        +
      </button>

      {/* 添加人物 Modal */}
      <AddPersonModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddPerson}
        persons={persons}
      />
    </div>
  );
};

export default FamilyTree;