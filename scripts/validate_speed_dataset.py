import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from PIL import Image

ROOT = Path('speed-dataset')
rows = list(csv.DictReader((ROOT / 'manifest.csv').open(encoding='utf-8-sig')))
errors = []
counts = Counter()
hashes = {}

for row in rows:
    path = ROOT / row['path']
    label = row['label']
    counts[label] += 1
    if not path.exists():
        errors.append(f"缺少文件: {row['path']}")
        continue
    if path.parent.name != label:
        errors.append(f"目录标签不匹配: {row['path']} -> {label}")
    with Image.open(path) as image:
        if image.size != (44, 72): errors.append(f"尺寸错误: {row['path']} {image.size}")
        if image.mode != 'RGB': errors.append(f"颜色模式错误: {row['path']} {image.mode}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    hashes.setdefault(digest, []).append(row['path'])

duplicate_groups = [paths for paths in hashes.values() if len(paths) > 1]
report = {
    'status': 'pass' if not errors else 'fail',
    'manifest_rows': len(rows),
    'counts': {str(digit): counts[str(digit)] for digit in range(10)},
    'exact_duplicate_groups': len(duplicate_groups),
    'errors': errors,
}
(ROOT / 'validation-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
