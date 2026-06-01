import { HealthPanel } from "../components/health-panel";

export default function HomePage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">系统状态</p>
        <h1>工作台</h1>
      </div>
      <HealthPanel />
      <div className="placeholder-grid">
        <div className="placeholder-panel">
          <h2>知识库</h2>
          <p>公开、部门、受限知识库入口已预留。</p>
        </div>
        <div className="placeholder-panel">
          <h2>文档处理</h2>
          <p>上传、解析、分段、向量化流程入口已预留。</p>
        </div>
        <div className="placeholder-panel">
          <h2>专家 Agent</h2>
          <p>官方 Agent、个人 Agent 和全局助手入口已预留。</p>
        </div>
      </div>
    </section>
  );
}
