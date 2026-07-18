import csv
import json
import os
import random
import shutil
from collections import Counter
from pathlib import Path

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

import numpy as np
import tensorflow as tf

SEED = 20260717
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / 'speed-dataset'
TRAIN_ROOT = DATA_ROOT / 'train'
VALIDATION_ROOT = DATA_ROOT / 'validation'
OUTPUT_ROOT = PROJECT_ROOT / 'speed-model' / 'output'
IMAGE_SIZE = (72, 44)  # Keras 使用 (height, width)
CLASS_NAMES = [str(number) for number in range(10)]
BATCH_SIZE = 32
EPOCHS = 60

random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

if not TRAIN_ROOT.exists() or not VALIDATION_ROOT.exists():
    raise SystemExit('未找到 speed-dataset/train 或 validation，请先解压数据集。')

train_ds = tf.keras.utils.image_dataset_from_directory(
    TRAIN_ROOT,
    labels='inferred',
    label_mode='int',
    class_names=CLASS_NAMES,
    color_mode='rgb',
    batch_size=BATCH_SIZE,
    image_size=IMAGE_SIZE,
    shuffle=True,
    seed=SEED,
)
validation_ds = tf.keras.utils.image_dataset_from_directory(
    VALIDATION_ROOT,
    labels='inferred',
    label_mode='int',
    class_names=CLASS_NAMES,
    color_mode='rgb',
    batch_size=BATCH_SIZE,
    image_size=IMAGE_SIZE,
    shuffle=False,
)

train_counts = Counter()
for digit in CLASS_NAMES:
    train_counts[int(digit)] = len(list((TRAIN_ROOT / digit).glob('*.png')))
total_train = sum(train_counts.values())
class_weight = {
    digit: float(np.sqrt(total_train / (len(CLASS_NAMES) * count)))
    for digit, count in train_counts.items()
}

augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomBrightness(0.12, value_range=(0, 255), seed=SEED),
    tf.keras.layers.RandomContrast(0.14, seed=SEED + 1),
    tf.keras.layers.RandomTranslation(0.025, 0.025, fill_mode='nearest', seed=SEED + 2),
    tf.keras.layers.RandomRotation(0.025, fill_mode='nearest', seed=SEED + 3),
], name='training_augmentation')
augmented_train_ds = train_ds.map(
    lambda images, labels: (augmentation(images, training=True), labels),
    num_parallel_calls=tf.data.AUTOTUNE,
)

inputs = tf.keras.Input(shape=(IMAGE_SIZE[0], IMAGE_SIZE[1], 3), name='digit_rgb')
x = tf.keras.layers.Rescaling(1.0 / 255.0, name='normalize_0_1')(inputs)
x = tf.keras.layers.Conv2D(16, 3, padding='same', activation='relu')(x)
x = tf.keras.layers.BatchNormalization()(x)
x = tf.keras.layers.MaxPooling2D()(x)
x = tf.keras.layers.Conv2D(32, 3, padding='same', activation='relu')(x)
x = tf.keras.layers.BatchNormalization()(x)
x = tf.keras.layers.MaxPooling2D()(x)
x = tf.keras.layers.Conv2D(64, 3, padding='same', activation='relu')(x)
x = tf.keras.layers.BatchNormalization()(x)
x = tf.keras.layers.MaxPooling2D()(x)
x = tf.keras.layers.GlobalAveragePooling2D()(x)
x = tf.keras.layers.Dense(64, activation='relu')(x)
x = tf.keras.layers.Dropout(0.25)(x)
outputs = tf.keras.layers.Dense(10, activation='softmax', name='digit_probabilities')(x)
model = tf.keras.Model(inputs, outputs, name='a9_speed_digit_classifier')

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss=tf.keras.losses.SparseCategoricalCrossentropy(),
    metrics=[tf.keras.metrics.SparseCategoricalAccuracy(name='accuracy')],
)
model.summary()

callbacks = [
    tf.keras.callbacks.ModelCheckpoint(
        OUTPUT_ROOT / 'best_speed_digit_model.keras',
        monitor='val_accuracy',
        mode='max',
        save_best_only=True,
    ),
    tf.keras.callbacks.EarlyStopping(
        monitor='val_accuracy', mode='max', patience=10, restore_best_weights=True,
    ),
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss', factor=0.5, patience=4, min_lr=1e-5,
    ),
]

history = model.fit(
    augmented_train_ds.prefetch(tf.data.AUTOTUNE),
    validation_data=validation_ds.prefetch(tf.data.AUTOTUNE),
    epochs=EPOCHS,
    class_weight=class_weight,
    callbacks=callbacks,
)

model.save(OUTPUT_ROOT / 'speed_digit_model.keras')
model.save(OUTPUT_ROOT / 'speed_digit_model.h5')

y_true = np.concatenate([labels.numpy() for _, labels in validation_ds]).astype(int)
probabilities = model.predict(validation_ds, verbose=0)
y_pred = probabilities.argmax(axis=1)
confusion = tf.math.confusion_matrix(y_true, y_pred, num_classes=10).numpy().astype(int)
per_class_accuracy = {
    str(digit): float(confusion[digit, digit] / max(1, confusion[digit].sum()))
    for digit in range(10)
}
validation_accuracy = float((y_true == y_pred).mean())

metrics = {
    'validation_accuracy': validation_accuracy,
    'validation_samples': int(len(y_true)),
    'train_counts': {str(key): value for key, value in train_counts.items()},
    'class_weight': {str(key): value for key, value in class_weight.items()},
    'per_class_accuracy': per_class_accuracy,
    'confusion_matrix': confusion.tolist(),
    'five_predicted_as_nine': int(confusion[5, 9]),
    'nine_predicted_as_five': int(confusion[9, 5]),
}
(OUTPUT_ROOT / 'validation-predictions.csv').unlink(missing_ok=True)
misclassified_root = OUTPUT_ROOT / 'misclassified'
if misclassified_root.exists(): shutil.rmtree(misclassified_root)
misclassified_root.mkdir(parents=True, exist_ok=True)
validation_files = [
    path for digit in CLASS_NAMES
    for path in sorted((VALIDATION_ROOT / digit).glob('*.png'))
]
prediction_rows = []
for path, expected, predicted, probability in zip(validation_files, y_true, y_pred, probabilities):
    confidence = float(probability[predicted])
    prediction_rows.append({
        'path': path.relative_to(PROJECT_ROOT).as_posix(),
        'expected': int(expected),
        'predicted': int(predicted),
        'confidence': round(confidence, 6),
        'correct': 'yes' if expected == predicted else 'no',
    })
    if expected != predicted:
        target = misclassified_root / f"true-{expected}_pred-{predicted}_conf-{confidence:.3f}_{path.name}"
        shutil.copy2(path, target)
with (OUTPUT_ROOT / 'validation-predictions.csv').open('w', newline='', encoding='utf-8-sig') as file:
    writer = csv.DictWriter(file, fieldnames=prediction_rows[0].keys())
    writer.writeheader()
    writer.writerows(prediction_rows)

(OUTPUT_ROOT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
(OUTPUT_ROOT / 'history.json').write_text(
    json.dumps({key: [float(value) for value in values] for key, values in history.history.items()}, indent=2),
    encoding='utf-8',
)
(OUTPUT_ROOT / 'labels.json').write_text(json.dumps(CLASS_NAMES, indent=2), encoding='utf-8')
(OUTPUT_ROOT / 'model-contract.json').write_text(json.dumps({
    'task': 'A9 speedometer single-digit classification',
    'input_name': 'digit_rgb',
    'input_shape_nhwc': [None, 72, 44, 3],
    'input_color': 'RGB',
    'input_value_range': [0, 255],
    'normalization': 'inside model: divide by 255',
    'output_name': 'digit_probabilities',
    'class_order': CLASS_NAMES,
}, ensure_ascii=False, indent=2), encoding='utf-8')

print('\n训练完成')
print(f'验证准确率: {validation_accuracy:.2%}')
print(f'5 被识别为 9: {confusion[5, 9]} 次')
print(f'9 被识别为 5: {confusion[9, 5]} 次')
print(f'模型与报告: {OUTPUT_ROOT}')
