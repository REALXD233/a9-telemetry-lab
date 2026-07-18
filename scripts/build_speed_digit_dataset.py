import csv, hashlib, json, shutil
from pathlib import Path
from PIL import Image

ROOT = Path('speed-dataset')
ROWS = json.loads((ROOT / 'roi-labels.30fps.json').read_text(encoding='utf-8'))
SOURCE = ROOT / 'tight-roi-30fps'

for folder in ('train', 'validation', 'review-roi'):
    target = ROOT / folder
    if target.exists(): shutil.rmtree(target)
for split in ('train', 'validation'):
    for digit in range(10): (ROOT / split / str(digit)).mkdir(parents=True, exist_ok=True)
(ROOT / 'review-roi').mkdir(parents=True, exist_ok=True)

def nearest(index, direction):
    cursor = index + direction
    while 0 <= cursor < len(ROWS):
        row = ROWS[cursor]
        if row['value'] is not None and row['confidence'] >= 80: return cursor, row
        cursor += direction
    return None, None

accepted, review = [], []
for index, row in enumerate(ROWS):
    value = row['value']
    reason = ''
    if value is None: reason = 'no-label'
    elif row['confidence'] < 80: reason = 'low-confidence'
    elif not 0 <= value <= 600: reason = 'out-of-range'
    else:
        li, left = nearest(index, -1); ri, right = nearest(index, 1)
        if left and right:
            ratio = (index - li) / (ri - li)
            expected = left['value'] + (right['value'] - left['value']) * ratio
            tolerance = max(15, abs(right['value'] - left['value']) * 1.5 + 5)
            if abs(value - expected) > tolerance: reason = 'temporal-outlier'
    if reason:
        review.append({**row, 'reason': reason})
        guess = value if value is not None else 'none'
        shutil.copy2(SOURCE / row['file'], ROOT / 'review-roi' / f"{index:04d}_guess-{guess}_conf-{row['confidence']:.0f}_{reason}.png")
    else:
        accepted.append((index, row))

manifest = []
seen_digit_images = set()
for sequence, (index, row) in enumerate(accepted):
    label = str(row['value'])
    # 常规数字每 3 帧保留一张；容易混淆且数量较少的 7/9 保留全部真实帧。
    if sequence % 3 and '7' not in label and '9' not in label: continue
    image = Image.open(SOURCE / row['file']).convert('RGB')
    count = len(label)
    right_edge, slot = 134, 44
    left_edge = right_edge - count * slot
    if left_edge < 0 or count not in (1, 2, 3):
        review.append({**row, 'reason': 'layout'})
        continue
    # 按完整时间块划分，避免相邻视频帧分别落入训练集和验证集造成数据泄漏。
    split = 'validation' if int(row['videoTime']) in {7, 12, 17, 22, 27} else 'train'
    for position, digit in enumerate(label):
        x0 = left_edge + position * slot
        crop = image.crop((x0, 0, x0 + slot, 72))
        digest = hashlib.sha256(crop.tobytes()).hexdigest()
        key = (digit, digest)
        if key in seen_digit_images: continue
        seen_digit_images.add(key)
        name = f"frame-{row['frame']:04d}_t-{row['videoTime']:.1f}_p-{position}_speed-{label}.png"
        relative = Path(split) / digit / name
        crop.save(ROOT / relative)
        manifest.append({
            'path': relative.as_posix(), 'label': digit, 'speed': label,
            'source_frame': row['frame'], 'video_time': row['videoTime'],
            'position': position, 'ocr_confidence': round(row['confidence'], 2)
        })

with (ROOT / 'manifest.csv').open('w', newline='', encoding='utf-8-sig') as file:
    writer = csv.DictWriter(file, fieldnames=manifest[0].keys())
    writer.writeheader(); writer.writerows(manifest)
(ROOT / 'review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding='utf-8')

counts = {str(d): sum(1 for row in manifest if row['label'] == str(d)) for d in range(10)}
summary = {'video': 'testvideo.mp4', 'accepted_roi': len(accepted), 'review_roi': len(review), 'digit_samples': len(manifest), 'counts': counts}
(ROOT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
