import {AGENT_PLAYBOOK_VERSION} from '../js/agent-recipes.js';
export function hasCurrentAgentTrial(agent,runs=[]){
 const v=agent?.versions?.at(-1);
 return Boolean(v&&runs.some(r=>r.agentId===agent.id&&r.version===v.number&&r.playbookVersion===AGENT_PLAYBOOK_VERSION&&r.knowledgeHash===v.knowledgeHash&&!r.knowledgeChanged&&['completed','limited'].includes(r.status)&&r.output?.decision!=='hold'&&typeof r.output?.draft==='string'&&r.output.draft.trim()));
}
export function requireCurrentAgentTrial(agent,runs){
 if(!hasCurrentAgentTrial(agent,runs))throw new Error('请先对当前工作流完成一次生成有效草稿的试运行；停止营销示例不能替代生成验收');
}
