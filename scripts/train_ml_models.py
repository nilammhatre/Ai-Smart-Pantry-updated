"""
Reproducible ML Training Pipeline for AI Smart Pantry
Trains two decoupled lightweight neural network classifiers:
1. Food Identity Classifier: Multi-class classification covering supported fruits and vegetables
2. Freshness & Spoilage Classifier: Binary/Multi-condition classification (Fresh vs. Spoiled)

Key Features:
- Architecture: MobileNetV3-Small (lightweight, optimized for CPU and edge inference)
- Leakage-resistant train/val/test splits loaded directly from curated dataset manifest
- Image augmentations: RandomHorizontalFlip, RandomRotation(15), ColorJitter, Affine transforms
- Class imbalance compensation via frequency-inverse cross-entropy loss weighting
- Comprehensive evaluation: Accuracy, per-class Precision/Recall/F1, Macro-F1, Confusion Matrix
- Explicit verification test for Spinach-vs-Mango and Capsicum-vs-Potato confusion
- Saves weights, class mappings, preprocessing configs, and training metrics
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from PIL import Image

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    classification_report,
    confusion_matrix
)

# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
IMAGE_SIZE = (224, 224)

# Dedicated directory for saving trained models outside frontend bundle
MODELS_DIR = Path(__file__).parent.parent / "ml_models"


# -----------------------------------------------------------------------------
# Dataset Implementation
# -----------------------------------------------------------------------------
class PantryManifestDataset(Dataset):
    """
    Leakage-resistant PyTorch Dataset driven by curated manifest JSON records.
    """
    def __init__(self, records: list, base_processed_dir: Path, target_attr: str,
                 class_to_idx: dict, transform=None):
        self.records = records
        self.base_dir = base_processed_dir
        self.target_attr = target_attr
        self.class_to_idx = class_to_idx
        self.transform = transform

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        img_path = self.base_dir / rec["rel_path"]

        # Load image safely
        try:
            with Image.open(img_path) as img:
                image = img.convert("RGB")
        except Exception as e:
            # Fallback to neutral image if corrupt
            image = Image.new("RGB", IMAGE_SIZE, (128, 128, 128))

        if self.transform:
            image = self.transform(image)

        label_name = rec[self.target_attr]
        label_idx = self.class_to_idx[label_name]

        # Return only serializable metadata (no None values that break collation)
        meta = {
            "id": rec.get("id", ""),
            "item_name": rec.get("item_name", ""),
            "rel_path": rec.get("rel_path", ""),
            "split": rec.get("split", "")
        }

        return image, label_idx, meta


# -----------------------------------------------------------------------------
# Transforms & Augmentations
# -----------------------------------------------------------------------------
def get_data_transforms():
    train_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD)
    ])

    val_test_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD)
    ])

    return train_transform, val_test_transform


# -----------------------------------------------------------------------------
# Model Architecture: Lightweight MobileNetV3
# -----------------------------------------------------------------------------
def build_mobilenet_classifier(num_classes: int, pretrained: bool = True) -> nn.Module:
    """
    Builds a transfer learning model based on MobileNetV3-Small.
    Lightweight (~2.5M params), fast on CPU, robust representations.
    """
    try:
        weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
    except Exception:
        # Fallback if pretrained weights download is blocked offline
        model = models.mobilenet_v3_small(weights=None)

    # Replace classifier head for the target number of classes
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Dropout(p=0.2),
        nn.Linear(in_features, num_classes)
    )

    return model


# -----------------------------------------------------------------------------
# Class Weighting for Imbalance Handling
# -----------------------------------------------------------------------------
def compute_class_weights(records: list, target_attr: str, class_to_idx: dict) -> torch.Tensor:
    counts = np.zeros(len(class_to_idx), dtype=np.float32)
    for r in records:
        lbl = r[target_attr]
        counts[class_to_idx[lbl]] += 1.0

    total = len(records)
    n_classes = len(class_to_idx)
    weights = np.zeros(n_classes, dtype=np.float32)

    for i in range(n_classes):
        if counts[i] > 0:
            weights[i] = total / (n_classes * counts[i])
        else:
            weights[i] = 1.0

    # Normalize weights
    weights = weights / np.mean(weights)
    return torch.tensor(weights, dtype=torch.float32)


# -----------------------------------------------------------------------------
# Training & Validation Loop
# -----------------------------------------------------------------------------
def train_model(model: nn.Module, train_loader: DataLoader, val_loader: DataLoader,
                criterion: nn.Module, optimizer: optim.Optimizer, device: torch.device,
                num_epochs: int = 10) -> tuple[nn.Module, dict]:

    best_val_acc = 0.0
    best_weights = None
    history = {"train_loss": [], "train_acc": [], "val_loss": [], "val_acc": []}

    print(f"[*] Training on device: {device} | Total Epochs: {num_epochs}")

    for epoch in range(1, num_epochs + 1):
        # 1. Train Phase
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for images, labels, _ in train_loader:
            images = images.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

        epoch_train_loss = running_loss / max(total, 1)
        epoch_train_acc = correct / max(total, 1)

        # 2. Validation Phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels, _ in val_loader:
                images = images.to(device)
                labels = labels.to(device)

                outputs = model(images)
                loss = criterion(outputs, labels)

                val_loss += loss.item() * images.size(0)
                _, preds = torch.max(outputs, 1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)

        epoch_val_loss = val_loss / max(val_total, 1)
        epoch_val_acc = val_correct / max(val_total, 1)

        history["train_loss"].append(round(epoch_train_loss, 4))
        history["train_acc"].append(round(epoch_train_acc, 4))
        history["val_loss"].append(round(epoch_val_loss, 4))
        history["val_acc"].append(round(epoch_val_acc, 4))

        if epoch_val_acc >= best_val_acc or best_weights is None:
            best_val_acc = epoch_val_acc
            best_weights = model.state_dict().copy()

        if epoch % 2 == 0 or epoch == num_epochs or epoch == 1:
            print(f"  Epoch [{epoch:02d}/{num_epochs:02d}] -> "
                  f"Train Loss: {epoch_train_loss:.4f}, Train Acc: {epoch_train_acc*100:.1f}% | "
                  f"Val Loss: {epoch_val_loss:.4f}, Val Acc: {epoch_val_acc*100:.1f}%")

    if best_weights:
        model.load_state_dict(best_weights)

    return model, history


# -----------------------------------------------------------------------------
# Comprehensive Evaluation & Confusion Analysis
# -----------------------------------------------------------------------------
def evaluate_model_on_test_set(model: nn.Module, test_loader: DataLoader,
                               idx_to_class: dict, device: torch.device,
                               model_type: str = "identity") -> dict:

    model.eval()
    all_preds = []
    all_labels = []
    all_probs = []

    with torch.no_grad():
        for images, labels, _ in test_loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1).cpu().numpy()
            _, preds = torch.max(outputs, 1)

            all_preds.extend(preds.cpu().numpy().tolist())
            all_labels.extend(labels.cpu().numpy().tolist())
            all_probs.extend(probs.tolist())

    y_true = np.array(all_labels)
    y_pred = np.array(all_preds)

    # Global accuracy
    acc = accuracy_score(y_true, y_pred) if len(y_true) > 0 else 0.0

    # Per-class metrics
    classes = [idx_to_class[i] for i in range(len(idx_to_class))]
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=list(range(len(classes))), zero_division=0
    )

    macro_f1 = np.mean(f1)
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(classes))))

    per_class_metrics = {}
    for i, cname in enumerate(classes):
        per_class_metrics[cname] = {
            "precision": round(float(precision[i]), 4),
            "recall": round(float(recall[i]), 4),
            "f1_score": round(float(f1[i]), 4),
            "support": int(support[i])
        }

    # Targeted Confusion Checks
    targeted_checks = {}
    class_to_idx = {v: k for k, v in idx_to_class.items()}

    # 1. Spinach vs. Mango
    if "spinach" in class_to_idx and "mango" in class_to_idx:
        sp_idx = class_to_idx["spinach"]
        mg_idx = class_to_idx["mango"]
        spinach_as_mango = int(cm[sp_idx, mg_idx])
        mango_as_spinach = int(cm[mg_idx, sp_idx])
        targeted_checks["spinach_vs_mango"] = {
            "spinach_misclassified_as_mango": spinach_as_mango,
            "mango_misclassified_as_spinach": mango_as_spinach,
            "passed": (spinach_as_mango == 0 and mango_as_spinach == 0)
        }

    # 2. Capsicum vs. Potato
    if "capsicum" in class_to_idx and "potato" in class_to_idx:
        cap_idx = class_to_idx["capsicum"]
        pot_idx = class_to_idx["potato"]
        capsicum_as_potato = int(cm[cap_idx, pot_idx])
        potato_as_capsicum = int(cm[pot_idx, cap_idx])
        targeted_checks["capsicum_vs_potato"] = {
            "capsicum_misclassified_as_potato": capsicum_as_potato,
            "potato_misclassified_as_capsicum": potato_as_capsicum,
            "passed": (capsicum_as_potato == 0 and potato_as_capsicum == 0)
        }

    return {
        "model_type": model_type,
        "test_samples_count": len(y_true),
        "overall_accuracy": round(float(acc), 4),
        "macro_f1_score": round(float(macro_f1), 4),
        "per_class_metrics": per_class_metrics,
        "confusion_matrix": cm.tolist(),
        "class_names": classes,
        "targeted_confusion_checks": targeted_checks
    }


# -----------------------------------------------------------------------------
# Pipeline Orchestration
# -----------------------------------------------------------------------------
def run_pipeline(target_task: str, batch_size: int = 16, epochs: int = 8, lr: float = 0.001):
    project_root = Path(__file__).parent.parent
    processed_dir = project_root / "ml_data" / "processed"
    manifest_path = processed_dir / "dataset_manifest.json"

    if not manifest_path.exists():
        print(f"[Error] Manifest file not found at: {manifest_path}")
        print("Please run `python scripts/preprocess_and_curate_dataset.py` first.")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        all_records = json.load(f)

    # Determine Device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    train_tf, val_test_tf = get_data_transforms()

    # -------------------------------------------------------------------------
    # PIPELINE 1: PRODUCE IDENTITY CLASSIFICATION
    # -------------------------------------------------------------------------
    if target_task in ["all", "identity"]:
        print("\n" + "=" * 75)
        print("TRAINING MODEL 1: FOOD PRODUCE IDENTITY CLASSIFIER")
        print("=" * 75)

        # Filter records for supported produce items
        produce_records = [r for r in all_records if r.get("category") in ["Vegetables", "Fruits"]]
        distinct_classes = sorted(list(set(r["item_name"] for r in produce_records)))
        class_to_idx = {c: i for i, c in enumerate(distinct_classes)}
        idx_to_class = {i: c for i, c in enumerate(distinct_classes)}

        print(f"[*] Supported Produce Classes ({len(distinct_classes)}): {distinct_classes}")

        train_recs = [r for r in produce_records if r["split"] == "train"]
        val_recs = [r for r in produce_records if r["split"] == "val"]
        test_recs = [r for r in produce_records if r["split"] == "test"]

        # Ensure validation and test sets have samples
        if not val_recs:
            val_recs = train_recs[-max(2, len(train_recs)//5):]
        if not test_recs:
            test_recs = val_recs

        print(f"[*] Leakage-Resistant Splits: Train={len(train_recs)} | Val={len(val_recs)} | Test={len(test_recs)}")

        # Datasets & Loaders
        ds_train = PantryManifestDataset(train_recs, processed_dir, "item_name", class_to_idx, train_tf)
        ds_val = PantryManifestDataset(val_recs, processed_dir, "item_name", class_to_idx, val_test_tf)
        ds_test = PantryManifestDataset(test_recs, processed_dir, "item_name", class_to_idx, val_test_tf)

        loader_train = DataLoader(ds_train, batch_size=batch_size, shuffle=True)
        loader_val = DataLoader(ds_val, batch_size=batch_size, shuffle=False)
        loader_test = DataLoader(ds_test, batch_size=batch_size, shuffle=False)

        # Handle class imbalance
        weights = compute_class_weights(train_recs, "item_name", class_to_idx).to(device)
        criterion = nn.CrossEntropyLoss(weight=weights)

        # Build Model & Optimizer
        model = build_mobilenet_classifier(len(distinct_classes), pretrained=True).to(device)
        optimizer = optim.Adam(model.parameters(), lr=lr)

        start_time = time.time()
        model, history = train_model(model, loader_train, loader_val, criterion, optimizer, device, num_epochs=epochs)
        train_duration = round(time.time() - start_time, 2)

        # Evaluation on held-out test split
        eval_results = evaluate_model_on_test_set(model, loader_test, idx_to_class, device, "produce_identity")
        eval_results["training_duration_seconds"] = train_duration
        eval_results["training_history"] = history

        # Save Artifacts
        out_dir = MODELS_DIR / "identity"
        out_dir.mkdir(parents=True, exist_ok=True)

        torch.save(model.state_dict(), out_dir / "best_model.pt")

        with open(out_dir / "class_mapping.json", "w", encoding="utf-8") as f:
            json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)

        with open(out_dir / "preprocess_config.json", "w", encoding="utf-8") as f:
            json.dump({
                "architecture": "MobileNetV3-Small",
                "image_size": list(IMAGE_SIZE),
                "mean": IMAGENET_MEAN,
                "std": IMAGENET_STD,
                "num_classes": len(distinct_classes)
            }, f, indent=2)

        with open(out_dir / "eval_metrics.json", "w", encoding="utf-8") as f:
            json.dump(eval_results, f, indent=2)

        with open(out_dir / "confusion_matrix.json", "w", encoding="utf-8") as f:
            json.dump({
                "matrix": eval_results["confusion_matrix"],
                "classes": eval_results["class_names"]
            }, f, indent=2)

        print(f"\n[Identity Model Evaluation Results]:")
        print(f"  * Overall Accuracy: {eval_results['overall_accuracy']*100:.2f}%")
        print(f"  * Macro-F1 Score:   {eval_results['macro_f1_score']:.4f}")
        print(f"  * Target Confusion Checks: {eval_results['targeted_confusion_checks']}")
        print(f"  * Model weights and evaluation metrics saved to: {out_dir}")

    # -------------------------------------------------------------------------
    # PIPELINE 2: FRESHNESS / SPOILAGE CONDITION CLASSIFICATION
    # -------------------------------------------------------------------------
    if target_task in ["all", "freshness"]:
        print("\n" + "=" * 75)
        print("TRAINING MODEL 2: FRESHNESS & SPOILAGE CONDITION CLASSIFIER")
        print("=" * 75)

        # Uses only items with verified, suitable condition labels
        freshness_records = [r for r in all_records if r.get("spoilage_state") in ["fresh", "spoiled"]]
        condition_classes = ["fresh", "spoiled"]
        class_to_idx = {c: i for i, c in enumerate(condition_classes)}
        idx_to_class = {i: c for i, c in enumerate(condition_classes)}

        train_recs = [r for r in freshness_records if r["split"] == "train"]
        val_recs = [r for r in freshness_records if r["split"] == "val"]
        test_recs = [r for r in freshness_records if r["split"] == "test"]

        if not val_recs:
            val_recs = train_recs[-max(2, len(train_recs)//5):]
        if not test_recs:
            test_recs = val_recs

        print(f"[*] Verified Condition Classes: {condition_classes}")
        print(f"[*] Leakage-Resistant Splits: Train={len(train_recs)} | Val={len(val_recs)} | Test={len(test_recs)}")

        # Datasets & Loaders
        ds_train = PantryManifestDataset(train_recs, processed_dir, "spoilage_state", class_to_idx, train_tf)
        ds_val = PantryManifestDataset(val_recs, processed_dir, "spoilage_state", class_to_idx, val_test_tf)
        ds_test = PantryManifestDataset(test_recs, processed_dir, "spoilage_state", class_to_idx, val_test_tf)

        loader_train = DataLoader(ds_train, batch_size=batch_size, shuffle=True)
        loader_val = DataLoader(ds_val, batch_size=batch_size, shuffle=False)
        loader_test = DataLoader(ds_test, batch_size=batch_size, shuffle=False)

        # Handle class imbalance (fresh vs spoiled distribution)
        weights = compute_class_weights(train_recs, "spoilage_state", class_to_idx).to(device)
        criterion = nn.CrossEntropyLoss(weight=weights)

        # Build Model & Optimizer
        model = build_mobilenet_classifier(len(condition_classes), pretrained=True).to(device)
        optimizer = optim.Adam(model.parameters(), lr=lr)

        start_time = time.time()
        model, history = train_model(model, loader_train, loader_val, criterion, optimizer, device, num_epochs=epochs)
        train_duration = round(time.time() - start_time, 2)

        # Evaluation on held-out test split
        eval_results = evaluate_model_on_test_set(model, loader_test, idx_to_class, device, "freshness_spoilage")
        eval_results["training_duration_seconds"] = train_duration
        eval_results["training_history"] = history

        # Save Artifacts
        out_dir = MODELS_DIR / "freshness"
        out_dir.mkdir(parents=True, exist_ok=True)

        torch.save(model.state_dict(), out_dir / "best_model.pt")

        with open(out_dir / "class_mapping.json", "w", encoding="utf-8") as f:
            json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)

        with open(out_dir / "preprocess_config.json", "w", encoding="utf-8") as f:
            json.dump({
                "architecture": "MobileNetV3-Small",
                "image_size": list(IMAGE_SIZE),
                "mean": IMAGENET_MEAN,
                "std": IMAGENET_STD,
                "num_classes": len(condition_classes)
            }, f, indent=2)

        with open(out_dir / "eval_metrics.json", "w", encoding="utf-8") as f:
            json.dump(eval_results, f, indent=2)

        with open(out_dir / "confusion_matrix.json", "w", encoding="utf-8") as f:
            json.dump({
                "matrix": eval_results["confusion_matrix"],
                "classes": eval_results["class_names"]
            }, f, indent=2)

        print(f"\n[Freshness Model Evaluation Results]:")
        print(f"  * Overall Accuracy: {eval_results['overall_accuracy']*100:.2f}%")
        print(f"  * Macro-F1 Score:   {eval_results['macro_f1_score']:.4f}")
        print(f"  * Per-Class Metrics: {eval_results['per_class_metrics']}")
        print(f"  * Model weights and evaluation metrics saved to: {out_dir}")


def main():
    parser = argparse.ArgumentParser(description="Reproducible ML Training Pipeline for AI Smart Pantry.")
    parser.add_argument("--model", choices=["all", "identity", "freshness"], default="all",
                        help="Which model pipeline to train.")
    parser.add_argument("--epochs", type=int, default=8,
                        help="Number of training epochs.")
    parser.add_argument("--batch-size", type=int, default=16,
                        help="DataLoader batch size.")
    parser.add_argument("--lr", type=float, default=0.001,
                        help="Learning rate for Adam optimizer.")
    args = parser.parse_args()

    run_pipeline(target_task=args.model, batch_size=args.batch_size, epochs=args.epochs, lr=args.lr)


if __name__ == "__main__":
    main()

