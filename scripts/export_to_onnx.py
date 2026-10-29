"""
Export trained PyTorch MobileNetV3-Small models to ONNX format for browser inference.
Outputs:
  public/models/identity_model.onnx       - Food identity classifier
  public/models/freshness_model.onnx      - Freshness/spoilage classifier
  public/models/identity_class_mapping.json
  public/models/freshness_class_mapping.json
  public/models/preprocess_config.json
"""

import os
import sys
import json
import shutil
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).parent.parent
ML_MODELS_DIR = PROJECT_ROOT / "ml_models"
PUBLIC_MODELS_DIR = PROJECT_ROOT / "public" / "models"


def build_mobilenet_classifier(num_classes: int) -> nn.Module:
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Dropout(p=0.2),
        nn.Linear(in_features, num_classes)
    )
    return model


def export_model(model_dir: str, model_name: str, num_classes: int):
    model_path = ML_MODELS_DIR / model_dir / "best_model.pt"
    class_mapping_path = ML_MODELS_DIR / model_dir / "class_mapping.json"
    preprocess_config_path = ML_MODELS_DIR / model_dir / "preprocess_config.json"

    if not model_path.exists():
        print(f"[SKIP] Model not found: {model_path}")
        return False

    with open(class_mapping_path, "r") as f:
        class_mapping = json.load(f)

    with open(preprocess_config_path, "r") as f:
        preprocess_config = json.load(f)

    actual_num_classes = preprocess_config.get("num_classes", num_classes)

    # Build model and load weights
    model = build_mobilenet_classifier(actual_num_classes)
    state_dict = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()

    # Create dummy input
    dummy_input = torch.randn(1, 3, 224, 224)

    # Export to ONNX
    PUBLIC_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = PUBLIC_MODELS_DIR / f"{model_name}.onnx"

    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        export_params=True,
        # Keep each browser model self-contained. The models are small enough
        # to avoid ONNX external-data loading, which is not supported by all
        # ONNX Runtime Web hosting/runtime combinations.
        external_data=False,
        # MobileNetV3 exports cleanly with the current torch exporter at opset 18.
        opset_version=18,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"}
        }
    )

    # Remove a sidecar left by older exporter versions that used external data.
    stale_external_data = Path(f"{onnx_path}.data")
    if stale_external_data.exists():
        stale_external_data.unlink()

    # Copy class mapping and preprocess config to public/models/
    shutil.copy2(class_mapping_path, PUBLIC_MODELS_DIR / f"{model_name}_class_mapping.json")
    shutil.copy2(preprocess_config_path, PUBLIC_MODELS_DIR / f"{model_name}_preprocess_config.json")

    # Also copy eval metrics if available
    eval_path = ML_MODELS_DIR / model_dir / "eval_metrics.json"
    if eval_path.exists():
        shutil.copy2(eval_path, PUBLIC_MODELS_DIR / f"{model_name}_eval_metrics.json")

    file_size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"[OK] Exported {model_name}.onnx ({file_size_mb:.2f} MB) -> {onnx_path}")
    print(f"     Classes: {actual_num_classes}, Mapping: {PUBLIC_MODELS_DIR / f'{model_name}_class_mapping.json'}")
    return True


def main():
    print("=" * 60)
    print("EXPORTING TRAINED MODELS TO ONNX FOR BROWSER INFERENCE")
    print("=" * 60)

    success_count = 0

    # Export identity model
    if export_model("identity", "identity_model", 16):
        success_count += 1

    # Export freshness model
    if export_model("freshness", "freshness_model", 2):
        success_count += 1

    # Write combined preprocess config for the browser runtime
    combined_config = {
        "image_size": [224, 224],
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225],
        "models": {
            "identity": {
                "path": "/models/identity_model.onnx",
                "class_mapping": "/models/identity_model_class_mapping.json",
                "confidence_threshold": 0.45
            },
            "freshness": {
                "path": "/models/freshness_model.onnx",
                "class_mapping": "/models/freshness_model_class_mapping.json",
                "confidence_threshold": 0.50
            }
        }
    }

    config_path = PUBLIC_MODELS_DIR / "model_config.json"
    with open(config_path, "w") as f:
        json.dump(combined_config, f, indent=2)

    print(f"\n[OK] Combined config -> {config_path}")
    print(f"\n{'=' * 60}")
    print(f"EXPORT COMPLETE: {success_count}/2 models exported successfully")
    print(f"{'=' * 60}")

    if success_count == 0:
        print("\n[ERROR] No models were exported. Train models first with:")
        print("  python scripts/train_ml_models.py --model all")
        sys.exit(1)


if __name__ == "__main__":
    main()

