"""
Official Kaggle Dataset Downloader for AI Smart Pantry ML Pipeline
Handles secure Kaggle authentication, disk space validation, and organized
download of target produce, freshness, pantry staples, barcodes, and expiry label datasets into `ml_data/raw/`.
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

# Complete Multi-Pillar Kaggle Dataset Registry for Smart Pantry
DATASET_REGISTRY = {
    # -------------------------------------------------------------------------
    # PILLAR 1: FRESH PRODUCE & BIOLOGICAL QUALITY (Vegetables, Fruits, Tubers)
    # -------------------------------------------------------------------------
    "vegetable_image_dataset": {
        "title": "Vegetable Image Dataset",
        "slug": "misrakahmed/vegetable-image-dataset",
        "reference_id": "2965251",
        "license": "CC0: Public Domain / Open Research",
        "approx_size_mb": 450,
        "pillar": "produce",
        "classes_count": 15,
        "description": "21,000 images across 15 vegetables (Capsicum, Potato, Tomato, Cucumber, Carrot, Brinjal, etc.)",
        "suitability": "Primary dataset for multi-class vegetable identity classification (Stage 1).",
        "category": "produce_identity"
    },
    "fruits_360": {
        "title": "Fruits-360",
        "slug": "moltean/fruits",
        "reference_id": "moltean/fruits",
        "license": "CC BY-SA 4.0",
        "approx_size_mb": 760,
        "pillar": "produce",
        "classes_count": 131,
        "description": "High-resolution rotating fruit images on clean white background (Apples, Bananas, Mangoes, etc.)",
        "suitability": "Clean baseline produce identity recognition for fruits.",
        "category": "produce_identity"
    },
    "fruit_veg_disease_healthy_rotten": {
        "title": "Fruit and Vegetable Disease (Healthy vs Rotten)",
        "slug": "muhammadsubhan/fruit-and-vegetable-disease-healthy-vs-rotten",
        "reference_id": "dogukantabak notebook reference",
        "license": "Open Data / Academic Research",
        "approx_size_mb": 2500,
        "pillar": "produce",
        "classes_count": 28,
        "description": "14 produce classes (Apple, Banana, Bellpepper, Carrot, Cucumber, Mango, Potato, Tomato, etc.) paired with Healthy and Rotten subfolders.",
        "suitability": "CRITICAL for decoupling Produce Identity (e.g., Capsicum) from Condition (Rotten vs Healthy).",
        "category": "freshness_and_spoilage"
    },
    "fresh_and_rotten_fruits": {
        "title": "Fresh and Rotten Fruits for Classification",
        "slug": "sriramr/fruits-fresh-and-rotten-for-classification",
        "reference_id": "sriramr/fruits-fresh-and-rotten-for-classification",
        "license": "Open Community (Kaggle)",
        "approx_size_mb": 2100,
        "pillar": "produce",
        "classes_count": 6,
        "description": "13,000+ images of Apples, Bananas, and Oranges in Fresh vs. Rotten states.",
        "suitability": "Dedicated post-harvest spoilage markers (mold, fungal rot, dehydration) on fruits.",
        "category": "freshness_and_spoilage"
    },
    "ripe_and_unripe_tomatoes": {
        "title": "Ripe and Unripe Tomatoes Dataset",
        "slug": "sumn2u/ripe-and-unripe-tomatoes-dataset",
        "reference_id": "16069779",
        "license": "CC BY-SA 4.0",
        "approx_size_mb": 210,
        "pillar": "produce",
        "classes_count": 2,
        "description": "Annotated images distinguishing Ripe (red) vs. Unripe (green) tomatoes.",
        "suitability": "Biological Ripeness / Maturity staging (Unripe != Rotten / Spoiled).",
        "category": "ripeness_maturity"
    },

    # -------------------------------------------------------------------------
    # PILLAR 2: PANTRY STAPLES, DAIRY, BAKERY & PACKAGED GOODS
    # -------------------------------------------------------------------------
    "grocery_store_dataset": {
        "title": "Grocery Store Dataset (Marcus Klasson)",
        "slug": "validmodel/grocery-store-dataset",
        "reference_id": "marcusklasson/GroceryStoreDataset",
        "license": "GNU General Public License v3.0 / Academic",
        "approx_size_mb": 230,
        "pillar": "pantry_staples",
        "classes_count": 81,
        "description": "5,125 natural photos taken in supermarkets spanning produce, dairy cartons (Milk, Oat Milk, Soy Milk, Yogurt, Sour Cream), juices, and packaged staples.",
        "suitability": "Expands pantry coverage to dairy cartons, packaged grocery products, and refrigerated goods.",
        "category": "packaged_and_dairy"
    },
    "food_101": {
        "title": "Food-101 / Prepared & Cooked Pantry Items",
        "slug": "kmader/food41",
        "reference_id": "food-101",
        "license": "Open Academic Dataset",
        "approx_size_mb": 4900,
        "pillar": "pantry_staples",
        "classes_count": 101,
        "description": "101,000 images covering bread, bakery items, cooked rice, pasta, dal, cheese dishes, and common meal staples.",
        "suitability": "Classification of cooked food leftovers, breads, baked goods, and pantry meal components.",
        "category": "prepared_and_bakery"
    },

    # -------------------------------------------------------------------------
    # PILLAR 3: BARCODE DETECTION & LOCALIZATION ON GROCERY PRODUCTS
    # -------------------------------------------------------------------------
    "barcode_detection_dataset": {
        "title": "Barcode Detection Dataset (Product Packages)",
        "slug": "tapakah68/barcode-detection",
        "reference_id": "barcode-detection",
        "license": "CC BY 4.0",
        "approx_size_mb": 620,
        "pillar": "barcodes",
        "classes_count": 2,
        "description": "Product packaging images with 1D/2D barcode bounding box annotations in YOLO/COCO format.",
        "suitability": "Localizes barcodes on cereal boxes, cans, milk cartons, and snack packaging.",
        "category": "barcode_localization"
    },
    "barcode_recognition_ocr": {
        "title": "Barcode Recognition Dataset (OCR)",
        "slug": "3782205/6543487",
        "reference_id": "barcode-ocr-retail",
        "license": "Open Data",
        "approx_size_mb": 310,
        "pillar": "barcodes",
        "classes_count": 1,
        "description": "Photos of retail grocery goods with polygon labels and text ground truth for underlying barcode numbers.",
        "suitability": "Extracts and decodes EAN-13 / UPC-A numbers to trigger Open Food Facts lookups.",
        "category": "barcode_decoding"
    },

    # -------------------------------------------------------------------------
    # PILLAR 4: EXPIRY DATE & PACKAGING LABEL OCR
    # -------------------------------------------------------------------------
    "expiry_date_digits": {
        "title": "Expiry Date Digits Dataset",
        "slug": "tareqkhan/expiry-date-digits",
        "reference_id": "expiry-digits",
        "license": "Open Research / Tareq Khan",
        "approx_size_mb": 45,
        "pillar": "expiry_labels",
        "classes_count": 10,
        "description": "Cropped images of expiry date digits (0-9) printed on food and grocery containers.",
        "suitability": "Deep learning OCR digit classifier for printed expiration stamps on cans, cartons, and plastic wrappers.",
        "category": "expiry_digit_ocr"
    },
    "retail_food_package_expiry": {
        "title": "Retail Food Package Expiration OCR Dataset",
        "slug": "saksham1201/expiration-date-ocr",
        "reference_id": "expiry-date-detection",
        "license": "Open Academic",
        "approx_size_mb": 350,
        "pillar": "expiry_labels",
        "classes_count": 2,
        "description": "High-resolution photos of food packaging containing stamped expiry dates (Best Before, EXP, USE BY) under diverse lighting and camera angles.",
        "suitability": "Detection and text-localization of expiration date labels on milk pouches, bread bags, and canned goods.",
        "category": "expiry_label_detection"
    }
}

REQUIRED_FREE_SPACE_GB = 15.0


def check_disk_space(target_path: Path) -> dict:
    target_path.mkdir(parents=True, exist_ok=True)
    total, used, free = shutil.disk_usage(str(target_path))
    free_gb = free / (1024 ** 3)
    total_gb = total / (1024 ** 3)
    is_sufficient = free_gb >= REQUIRED_FREE_SPACE_GB

    return {
        "is_sufficient": is_sufficient,
        "free_gb": round(free_gb, 2),
        "total_gb": round(total_gb, 2),
        "required_gb": REQUIRED_FREE_SPACE_GB
    }


def verify_kaggle_auth() -> dict:
    """
    Checks Kaggle credentials presence without ever logging secret tokens.
    """
    has_env_key = bool(os.environ.get("KAGGLE_KEY") or os.environ.get("KAGGLE_API_TOKEN"))
    has_env_user = bool(os.environ.get("KAGGLE_USERNAME"))

    home_kaggle = Path.home() / ".kaggle" / "kaggle.json"
    local_kaggle = Path.cwd() / ".kaggle" / "kaggle.json"
    has_file = home_kaggle.exists() or local_kaggle.exists()

    authenticated = (has_env_key and has_env_user) or bool(os.environ.get("KAGGLE_API_TOKEN")) or has_file

    return {
        "authenticated": authenticated,
        "has_env_vars": has_env_key and has_env_user,
        "has_token_env": bool(os.environ.get("KAGGLE_API_TOKEN")),
        "has_credential_file": has_file,
        "credential_path": str(home_kaggle) if home_kaggle.exists() else (str(local_kaggle) if local_kaggle.exists() else None)
    }


def download_dataset(dataset_key: str, dest_base_dir: Path, force: bool = False) -> bool:
    info = DATASET_REGISTRY.get(dataset_key)
    if not info:
        print(f"[Error] Unknown dataset key: '{dataset_key}'")
        return False

    slug = info["slug"]
    target_dir = dest_base_dir / dataset_key

    if target_dir.exists() and any(target_dir.iterdir()) and not force:
        print(f"[Skip] Dataset '{info['title']}' already exists in: {target_dir}")
        return True

    print(f"\n[Kaggle API] Downloading: {info['title']} ({slug})...")
    print(f"  Pillar: {info['pillar']} | Size: ~{info['approx_size_mb']} MB")
    print(f"  Target directory: {target_dir}")
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
        api.dataset_download_files(slug, path=str(target_dir), unzip=True, quiet=False)
        print(f"[Success] Downloaded and unzipped '{info['title']}' to: {target_dir}")
        return True
    except Exception as e:
        print(f"[Error] Failed to download dataset '{slug}': {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download verified Kaggle datasets for food ML pipeline.")
    parser.add_argument("--dataset", choices=list(DATASET_REGISTRY.keys()) + ["all"], default="all",
                        help="Specific dataset key to download, or 'all'.")
    parser.add_argument("--pillar", choices=["produce", "pantry_staples", "barcodes", "expiry_labels", "all"], default="all",
                        help="Filter datasets by functional pillar.")
    parser.add_argument("--dest", type=str, default="ml_data/raw",
                        help="Target base directory for raw dataset downloads.")
    parser.add_argument("--check-only", action="store_true",
                        help="Only verify credentials, disk space, and dataset metadata without downloading.")
    parser.add_argument("--force", action="store_true",
                        help="Force re-download even if folder exists.")

    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    dest_path = (project_root / args.dest).resolve()

    print("=" * 75)
    print("AI SMART PANTRY - MULTI-PILLAR KAGGLE DATASET SUITE INITIALIZER")
    print("=" * 75)

    # 1. Disk Space Check
    space_status = check_disk_space(dest_path)
    print(f"[*] Destination Directory: {dest_path}")
    print(f"[*] Available Disk Space: {space_status['free_gb']} GB (Required: {space_status['required_gb']} GB)")

    if not space_status["is_sufficient"]:
        print(f"[Warning] Free disk space ({space_status['free_gb']} GB) is below recommended threshold ({space_status['required_gb']} GB).")
    else:
        print("[OK] Disk space check passed.")

    # 2. Kaggle Authentication Check
    auth_status = verify_kaggle_auth()
    print(f"[*] Kaggle Authentication Configured: {auth_status['authenticated']}")

    if not auth_status["authenticated"]:
        print("\n" + "!" * 75)
        print("ACTION REQUIRED: KAGGLE AUTHENTICATION NEEDED")
        print("!" * 75)
        print("To download the full datasets using the official Kaggle API:")
        print("1. Go to https://www.kaggle.com/settings -> Click 'Create New Token'")
        print("2. Save the downloaded 'kaggle.json' to either:")
        print(f"   - {Path.home() / '.kaggle' / 'kaggle.json'}")
        print(f"   - Or project root: {project_root / '.kaggle' / 'kaggle.json'}")
        print("3. Alternatively, export environment variables:")
        print("   $env:KAGGLE_USERNAME = '<your_kaggle_username>'")
        print("   $env:KAGGLE_KEY = '<your_kaggle_api_key>'")
        print("!" * 75)

    # 3. Dataset Registry Summary by Pillar
    print("\n[Target Multi-Pillar Datasets for Complete Smart Pantry Pipeline]:")
    pillars = ["produce", "pantry_staples", "barcodes", "expiry_labels"]
    for p in pillars:
        print(f"\n--- PILLAR: {p.upper()} ---")
        for key, item in DATASET_REGISTRY.items():
            if item["pillar"] == p:
                print(f"  * [{key}] {item['title']}")
                print(f"    Slug: {item['slug']} | Size: ~{item['approx_size_mb']} MB | License: {item['license']}")
                print(f"    Role: {item['suitability']}")

    if args.check_only or not auth_status["authenticated"]:
        print("\n[Info] Finished check mode. Set Kaggle credentials to proceed with automated download.")
        return

    # 4. Filter Targets
    targets = []
    for key, item in DATASET_REGISTRY.items():
        if args.dataset != "all" and key != args.dataset:
            continue
        if args.pillar != "all" and item["pillar"] != args.pillar:
            continue
        targets.append(key)

    print(f"\n[*] Selected {len(targets)} dataset(s) for download.")
    success_count = 0
    for target in targets:
        success = download_dataset(target, dest_path, force=args.force)
        if success:
            success_count += 1

    print(f"\n[Completed] {success_count}/{len(targets)} dataset(s) processed.")


if __name__ == "__main__":
    main()
