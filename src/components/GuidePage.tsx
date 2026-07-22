import { BookOpen, CheckCircle2, Clock3, FileSpreadsheet, Focus, Gauge, PlayCircle } from 'lucide-react'

const STEPS = [
  ['准备视频', '可直接选择 MP4 或 WebM。若 MP4 内部是浏览器不支持的 HEVC/H.265，系统会在本机自动转换为 H.264 后重新载入；转换期间请保持页面开启。'],
  ['校准识别区域', '速度框只覆盖黑色底板上的白色速度数字；计时框只覆盖红色底板上的白色局内计时。避免纳入图标、排名和赛道画面。'],
  ['选择分析范围', '整段分析适合完整比赛；指定区间适合排除开场动画和结算画面。采样间隔以帧为单位，30 FPS 视频每 3 帧约为 0.1 秒。'],
  ['当前帧与手动真值', '点击“识别当前帧”后可直接在提取页检查、修改并添加；手动记录会永久锁定，自动分析不会覆盖，并作为相邻自动帧的可靠锚点。'],
  ['开始与停止', '点击开始后可随时停止。停止会终止当前 OCR，并保留已经完成的记录。手机端速度使用轻量识别，计时器仍使用高精度多路投票，并为视频跳帧增加解码兜底。'],
  ['审核与导出', '使用左右方向键逐帧检查；曲线和记录会同时显示原始 OCR 与修正值。导出前可选择主列优先保留哪一组数据，表格仍会保留两组对照列。'],
]

export function GuidePage() {
  return <main className="subpage-main guide-page">
    <section className="subpage-hero"><div><span className="eyebrow">OPERATOR MANUAL</span><h1>使用指南</h1><p>从视频准备、区域校准到数据复核与多组对比的完整操作流程。</p></div><BookOpen size={42} /></section>
    <section className="guide-grid">
      <article className="panel guide-steps"><header className="panel-header"><div><span className="eyebrow">QUICK START</span><strong>标准操作流程</strong></div><PlayCircle size={18} /></header><ol>{STEPS.map(([title, body], index) => <li key={title}><i>{index + 1}</i><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol></article>
      <div className="guide-side">
        <article className="panel guide-card"><Gauge /><div><strong>速度模型</strong><p>专用数字模型仅识别速度表。低置信度或模型加载失败时，系统才会回退到 OCR。</p></div></article>
        <article className="panel guide-card"><Clock3 /><div><strong>时间、锚点与卡顿帧</strong><p>计时 OCR 使用多路投票，并按置信度寻找最稳定的时间偏移簇；手动记录是绝对锚点。单帧误识别不会向后传播，重复帧会被跳过。</p></div></article>
        <article className="panel guide-card"><Focus /><div><strong>自动定位特征</strong><p>速度区域偏黑、数字高亮；计时区域偏红。自动定位后仍应检查右侧放大预览。</p></div></article>
        <article className="panel guide-card"><Gauge /><div><strong>速度检查阈值</strong><p>相邻帧变化限制只处理同时远离前后两帧的孤立点；局部偏差越小，自动修正越积极。所有检查都是轻量后处理，OCR 本身仍是主要耗时。</p></div></article>
        <article className="panel guide-card"><FileSpreadsheet /><div><strong>对比与媒体导出</strong><p>导入 CSV/XLSX 后可分别裁剪曲线。动态 MP4 在 1× 时严格对应数据时间，当前节点仅显示时间与放大的速度；也可选择 0.5×–8× 倍率。</p></div></article>
      </div>
    </section>
    <section className="panel guide-checklist"><header className="panel-header"><div><span className="eyebrow">BEFORE ANALYSIS</span><strong>开始前检查</strong></div></header><div><span><CheckCircle2 />视频有清晰画面且可以播放</span><span><CheckCircle2 />速度框为黑底速度数字</span><span><CheckCircle2 />计时框为红底局内时间</span><span><CheckCircle2 />分析范围不含菜单和结算画面</span></div></section>
  </main>
}
