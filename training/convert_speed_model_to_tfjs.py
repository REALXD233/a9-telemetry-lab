"""Convert the trained Keras speed-digit model to TensorFlow.js on Windows.

TensorFlow.js 4.22 declares TensorFlow Decision Forests as a dependency, but
that optional package has no native Windows wheel.  The Keras H5 Layers
converter itself does not require Decision Forests, so this script loads only
the official converter's H5 core from the vendored wheel.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "speed-model" / "output" / "speed_digit_model.h5"
DEFAULT_OUTPUT = PROJECT_ROOT / "public" / "models" / "speed-digits"
DEFAULT_WHEEL = (
    PROJECT_ROOT
    / "training"
    / "vendor"
    / "tensorflowjs-4.22.0-py3-none-any.whl"
)


def clean_serialized_config(value: Any) -> Any:
    if isinstance(value, list):
        return [clean_serialized_config(item) for item in value]
    if not isinstance(value, dict):
        return value
    if value.get("class_name") == "DTypePolicy":
        return value.get("config", {}).get("name", "float32")

    return {
        key: clean_serialized_config(child)
        for key, child in value.items()
        if key not in {"input_axes", "quantization_config"}
    }


def old_style_inbound_nodes(inbound_nodes: Any) -> list[Any]:
    if not isinstance(inbound_nodes, list) or not inbound_nodes:
        return []
    if isinstance(inbound_nodes[0], list):
        return inbound_nodes

    converted = []
    for node in inbound_nodes:
        connections = []
        for argument in node.get("args", []):
            if argument.get("class_name") != "__keras_tensor__":
                continue
            history = argument.get("config", {}).get("keras_history")
            if not isinstance(history, list) or len(history) < 3:
                raise ValueError("Unsupported Keras 3 inbound-node structure")
            connections.append([history[0], history[1], history[2], {}])
        converted.append(connections)
    return converted


def normalize_keras3_topology(document: dict[str, Any]) -> None:
    model_config = document.get("modelTopology", {}).get("model_config", {}).get("config")
    if not model_config or not model_config.get("layers"):
        raise ValueError("Converted file does not contain a Keras Layers topology")

    removable_layer_keys = {
        "optional",
        "ragged",
        "synchronized",
        "renorm",
        "renorm_clipping",
        "renorm_momentum",
    }

    for layer in model_config["layers"]:
        config = clean_serialized_config(layer.get("config", {}))
        if "batch_shape" in config:
            config["batch_input_shape"] = config.pop("batch_shape")
        for key in removable_layer_keys:
            config.pop(key, None)
        layer["config"] = config
        layer.pop("build_config", None)
        layer["inbound_nodes"] = old_style_inbound_nodes(layer.get("inbound_nodes"))

    for key in ("input_layers", "output_layers"):
        value = model_config.get(key)
        if isinstance(value, list) and value and isinstance(value[0], str):
            model_config[key] = [value]


def load_converter_from_wheel(wheel_path: Path, extraction_root: Path):
    with zipfile.ZipFile(wheel_path) as archive:
        archive.extractall(extraction_root)

    package_root = extraction_root / "tensorflowjs"
    (package_root / "__init__.py").write_text(
        "from tensorflowjs import version\n__version__ = version.version\n",
        encoding="utf-8",
    )
    (package_root / "converters" / "__init__.py").write_text("", encoding="utf-8")
    sys.path.insert(0, str(extraction_root))

    from tensorflowjs.converters import keras_h5_conversion  # type: ignore

    return keras_h5_conversion


def convert(input_path: Path, output_path: Path, wheel_path: Path) -> None:
    if not input_path.is_file():
        raise FileNotFoundError(f"Model not found: {input_path}")
    if not wheel_path.is_file():
        raise FileNotFoundError(f"Vendored TensorFlow.js converter not found: {wheel_path}")

    output_path.mkdir(parents=True, exist_ok=True)
    for stale_file in [output_path / "model.json", *output_path.glob("group*-shard*.bin")]:
        stale_file.unlink(missing_ok=True)

    with tempfile.TemporaryDirectory(prefix="a9-tfjs-converter-") as temporary:
        converter = load_converter_from_wheel(wheel_path, Path(temporary))
        topology, groups = converter.h5_merged_saved_model_to_tfjs_format(str(input_path))
        converter.write_artifacts(topology, groups, str(output_path))

    model_json_path = output_path / "model.json"
    document = json.loads(model_json_path.read_text(encoding="utf-8"))
    normalize_keras3_topology(document)
    model_json_path.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    manifest_names = [
        weight["name"]
        for group in document.get("weightsManifest", [])
        for weight in group.get("weights", [])
    ]
    if not manifest_names or any(name.startswith("optimizer/") for name in manifest_names):
        raise ValueError("Unexpected TensorFlow.js weight manifest")

    generated = sorted(path.name for path in output_path.iterdir() if path.is_file())
    print(f"TensorFlow.js speed model written to: {output_path}")
    print("Generated files:", ", ".join(generated))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--wheel", type=Path, default=DEFAULT_WHEEL)
    args = parser.parse_args()
    convert(args.input.resolve(), args.output.resolve(), args.wheel.resolve())


if __name__ == "__main__":
    main()
