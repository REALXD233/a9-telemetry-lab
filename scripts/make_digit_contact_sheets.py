from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path('speed-dataset')
OUTPUT = ROOT / 'contact-sheets'
OUTPUT.mkdir(parents=True, exist_ok=True)

for digit in map(str, range(10)):
    files = sorted((ROOT / 'train' / digit).glob('*.png')) + sorted((ROOT / 'validation' / digit).glob('*.png'))
    step = max(1, len(files) // 60)
    selected = files[::step][:60]
    sheet = Image.new('RGB', (10 * 88, 6 * 120), '#17191b')
    draw = ImageDraw.Draw(sheet)
    for index, file in enumerate(selected):
        image = Image.open(file).convert('RGB').resize((66, 108))
        x = (index % 10) * 88 + 11
        y = (index // 10) * 120
        sheet.paste(image, (x, y))
        frame = file.name.split('_')[0].replace('frame-', '')
        draw.text((x, y + 108), frame, fill='#d6dadb')
    sheet.save(OUTPUT / f'digit-{digit}.jpg', quality=92)

