# 公开发布指南

推荐使用 GitHub Pages。网站是纯静态 Vite 应用，视频、OCR 和表格处理均在访问者浏览器中完成，不需要单独购买服务器。

## 第一次发布

1. 在 GitHub 创建一个新的公开仓库，例如 `a9-telemetry-lab`。
2. 将本目录中的代码提交并推送到仓库的 `main` 分支。
3. 打开仓库的 `Settings` → `Pages`。
4. 在 `Build and deployment` 的 `Source` 中选择 `GitHub Actions`。
5. 打开 `Actions` 页面。本项目附带的 `Deploy A9 Telemetry Lab to GitHub Pages` 工作流会自动构建并发布 `dist`。
6. 部署完成后，网址通常为 `https://你的用户名.github.io/仓库名/`。

## 后续更新

修改代码并推送到 `main` 后，GitHub Actions 会自动重新构建和发布。也可以在 Actions 页面手动运行工作流。

## 发布前本地检查

```bash
npm ci
npm run build
npm run preview
```

打开终端显示的 `http://localhost:4173`，检查视频上传、速度模型、表格导入和图片导出。

## 浏览器兼容性

- 推荐 Chrome 或 Edge 111 及以上版本。
- H.264/AAC MP4 可直接预览。
- HEVC/H.265 是否可直接播放取决于浏览器和系统解码器；不支持时网站会启用浏览器内兼容转换，首次需要加载约 32 MB 转码核心。
- 所有处理均在浏览器本地完成；部署服务器不会接收用户选择的视频或表格。
