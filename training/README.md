# 速度数字模型训练流程

## 1. 准备 Python

推荐使用 64 位 Python 3.11 或 3.12。在项目根目录打开 PowerShell：

```powershell
cd D:\A9videoanalyze
py -3.11 -m venv .venv-speed
.\.venv-speed\Scripts\python.exe -m pip install --upgrade pip
.\.venv-speed\Scripts\python.exe -m pip install --retries 10 --timeout 120 --no-cache-dir -r training\requirements.txt
```

TensorFlow 安装包较大，首次安装可能需要数分钟。Windows 原生环境使用 CPU 训练即可；这个模型很小，不需要显卡。

数据校验脚本使用 Pillow 检查 PNG 图片；它已经包含在 `requirements.txt` 中。

## 2. 确认数据

数据应位于：

```text
speed-dataset/train/0 ... 9/
speed-dataset/validation/0 ... 9/
```

可再次校验：

```powershell
.\.venv-speed\Scripts\python.exe scripts\validate_speed_dataset.py
```

输出中的 `status` 必须为 `pass`。

## 3. 开始训练

```powershell
.\.venv-speed\Scripts\python.exe training\train_speed_digits.py
```

脚本会自动完成数据加载、轻量增强、类别权重、训练、提前停止和混淆矩阵统计。模型很小，普通 CPU 通常数分钟内完成。

## 4. 检查结果

查看：

```text
speed-model/output/metrics.json
```

重点检查：

- `validation_accuracy`：建议至少 0.97。
- `five_predicted_as_nine`：目标为 0。
- `nine_predicted_as_five`：目标为 0。
- `per_class_accuracy` 中数字 5 和 9：建议均不低于 0.95。

每张验证图片的预测结果会写入 `validation-predictions.csv`，所有错分图片会复制到 `speed-model/output/misclassified/`，文件名中包含正确标签、预测标签和置信度。

如果整体准确率很高，但 5/9 仍有混淆，不要只增加训练轮数；应优先审核 `speed-dataset/contact-sheets/digit-5.jpg` 和 `digit-9.jpg`，或补充新视频中的 5/9 样本。

## 5. 转换为网页模型（训练完成后再做）

不要直接执行 `pip install tensorflowjs`。TensorFlow.js 4.22.0 的间接依赖 TensorFlow Decision Forests 没有原生 Windows 安装包，会导致 `ResolutionImpossible`。

项目已经内置 Windows 兼容转换脚本和官方 TensorFlow.js 4.22.0 转换器 wheel。训练完成后保留：

```text
speed-model/output/speed_digit_model.keras
speed-model/output/speed_digit_model.h5
speed-model/output/metrics.json
speed-model/output/model-contract.json
```

直接使用当前训练环境执行：

```powershell
.\.venv-speed\Scripts\python.exe training\convert_speed_model_to_tfjs.py
```

脚本只加载 Keras H5 转换所需的核心代码，不会安装或加载 Decision Forests，也不会修改训练环境。转换成功后应存在：

```text
public/models/speed-digits/model.json
public/models/speed-digits/group1-shard1of1.bin
```

脚本还会自动规范化 Keras 3 与 TensorFlow.js 之间不兼容的模型配置字段。分片数量可能多于一个，这是正常的。

## 6. 交给网页接入

保留并提供以下内容：

```text
public/models/speed-digits/
speed-model/output/metrics.json
speed-model/output/model-contract.json
```

模型输入为 44×72 RGB 单数字图像，类别顺序固定为 `0,1,2,3,4,5,6,7,8,9`。归一化已经包含在模型内部，网页应输入 0–255 RGB 像素。
