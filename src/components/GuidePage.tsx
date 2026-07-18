import { BookOpen, CheckCircle2, Clock3, FileSpreadsheet, Focus, Gauge, PlayCircle } from 'lucide-react'

const STEPS = [
  ['准备视频', '可直接选择 MP4 或 WebM。若 MP4 内部是浏览器不支持的 HEVC/H.265，系统会在本机自动转换为 H.264 后重新载入；转换期间请保持页面开启。'],
  ['校准识别区域', '速度框只覆盖黑色底板上的白色速度数字；计时框只覆盖红色底板上的白色局内计时。避免纳入图标、排名和赛道画面。'],
  ['选择分析范围', '整段分析适合完整比赛；指定区间适合排除开场动画和结算画面。采样间隔以帧为单位，30 FPS 视频每 3 帧约为 0.1 秒。'],
  ['开始与停止', '点击开始后可随时停止。停止会终止当前 OCR，并保留已经完成的记录。分析期间不要切换视频文件。'],
  ['审核与导出', '使用左右方向键逐帧检查；被修正的数据会显示标记。表格导出前可修改文件名；对比图支持数据点显隐以及 PNG/SVG 图片导出。'],
]

export function GuidePage() {
  return <main className="subpage-main guide-page">
    <section className="subpage-hero"><div><span className="eyebrow">OPERATOR MANUAL</span><h1>使用指南</h1><p>从视频准备、区域校准到数据复核与多组对比的完整操作流程。</p></div><BookOpen size={42} /></section>
    <section className="guide-grid">
      <article className="panel guide-steps"><header className="panel-header"><div><span className="eyebrow">QUICK START</span><strong>标准操作流程</strong></div><PlayCircle size={18} /></header><ol>{STEPS.map(([title, body], index) => <li key={title}><i>{index + 1}</i><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol></article>
      <div className="guide-side">
        <article className="panel guide-card"><Gauge /><div><strong>速度模型</strong><p>专用数字模型仅识别速度表。低置信度或模型加载失败时，系统才会回退到 OCR。</p></div></article>
        <article className="panel guide-card"><Clock3 /><div><strong>时间与卡顿帧</strong><p>系统使用整段视频的稳定时间偏移校正异常帧。画面完全相同的卡顿重复帧会被跳过，不会强制增加局内时间。</p></div></article>
        <article className="panel guide-card"><Focus /><div><strong>自动定位特征</strong><p>速度区域偏黑、数字高亮；计时区域偏红。自动定位后仍应检查右侧放大预览。</p></div></article>
        <article className="panel guide-card"><FileSpreadsheet /><div><strong>对比与图片导出</strong><p>导入 CSV/XLSX 后可分别裁剪曲线。可隐藏数据点获得简洁曲线，并导出高清 PNG 或可编辑 SVG。</p></div></article>
      </div>
    </section>
    <section className="panel guide-checklist"><header className="panel-header"><div><span className="eyebrow">BEFORE ANALYSIS</span><strong>开始前检查</strong></div></header><div><span><CheckCircle2 />视频有清晰画面且可以播放</span><span><CheckCircle2 />速度框为黑底速度数字</span><span><CheckCircle2 />计时框为红底局内时间</span><span><CheckCircle2 />分析范围不含菜单和结算画面</span></div></section>
  </main>
}
