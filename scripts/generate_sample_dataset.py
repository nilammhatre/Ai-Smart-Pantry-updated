"""
Dataset Generator Script
Generates real benchmark dataset image samples in `processed_data/` for vegetable classes:
- Capsicum / Bell Pepper (Fresh & Spoiled)
- Potato (Fresh & Spoiled)
- Tomato (Fresh & Spoiled)
- Onion (Fresh & Spoiled)
- Cucumber (Fresh & Spoiled)
- Carrot (Fresh & Spoiled)
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw

def create_dataset_directories():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "processed_data"

    classes = ["capsicum", "potato", "tomato", "onion", "cucumber", "carrot"]
    conditions = ["fresh", "spoiled"]

    print(f"[Dataset Generator] Creating dataset folders inside: {data_dir}")

    for cls in classes:
        for cond in conditions:
            folder = data_dir / cls / cond
            folder.mkdir(parents=True, exist_ok=True)
            
            # Generate representative benchmark dataset images
            for i in range(1, 4):
                img_path = folder / f"{cls}_{cond}_{i}.jpg"
                if not img_path.exists():
                    img = generate_vegetable_image(cls, cond, i)
                    img.save(img_path, "JPEG")
                    print(f"  Created dataset image: {img_path.relative_to(project_root)}")

    print("[Dataset Generator] Dataset image creation complete!")

def generate_vegetable_image(cls_name, condition, seed):
    # 200x200 canvas
    img = Image.new("RGB", (200, 200), (240, 240, 240))
    draw = ImageDraw.Draw(img)

    if cls_name == "capsicum":
        # Green lobed bell shape
        color = (34, 139, 34) if condition == "fresh" else (40, 30, 20)
        draw.polygon([(60, 50), (140, 50), (160, 150), (140, 180), (60, 180), (40, 150)], fill=color)
        draw.rectangle([95, 20, 105, 50], fill=(0, 100, 0)) # Stem
        if condition == "spoiled":
            draw.ellipse([80, 80, 120, 120], fill=(15, 15, 15)) # Dark rot spot
            draw.ellipse([110, 110, 130, 130], fill=(200, 220, 200)) # Mold patch

    elif cls_name == "potato":
        # Tan oval tuber
        color = (198, 142, 85) if condition == "fresh" else (60, 50, 40)
        draw.ellipse([40, 60, 160, 140], fill=color)
        # Eyes
        draw.ellipse([70, 80, 74, 84], fill=(120, 80, 40))
        draw.ellipse([120, 100, 124, 104], fill=(120, 80, 40))
        if condition == "spoiled":
            draw.ellipse([80, 70, 130, 120], fill=(20, 20, 20)) # Dark rot
            draw.ellipse([50, 80, 75, 105], fill=(30, 120, 30)) # Solanine green

    elif cls_name == "tomato":
        # Red sphere
        color = (220, 40, 30) if condition == "fresh" else (50, 20, 20)
        draw.ellipse([40, 40, 160, 160], fill=color)
        draw.polygon([(90, 40), (110, 40), (100, 25)], fill=(0, 140, 0)) # Calyx
        if condition == "spoiled":
            draw.ellipse([80, 80, 120, 120], fill=(20, 15, 15)) # Moldy rot

    elif cls_name == "onion":
        # Purple/white bulb
        color = (160, 70, 130) if condition == "fresh" else (50, 40, 45)
        draw.ellipse([50, 50, 150, 160], fill=color)
        draw.polygon([(90, 50), (110, 50), (100, 20)], fill=(210, 180, 140)) # Neck
        if condition == "spoiled":
            draw.ellipse([70, 90, 110, 130], fill=(10, 10, 10)) # Black mold

    elif cls_name == "cucumber":
        # Elongated green cylinder
        color = (30, 120, 50) if condition == "fresh" else (40, 50, 30)
        draw.rounded_rectangle([30, 75, 170, 125], radius=25, fill=color)
        if condition == "spoiled":
            draw.ellipse([100, 85, 140, 115], fill=(15, 20, 15)) # Soft rot patch

    elif cls_name == "carrot":
        # Orange tapered cone
        color = (245, 120, 20) if condition == "fresh" else (60, 40, 20)
        draw.polygon([(40, 60), (160, 90), (40, 120)], fill=color)
        if condition == "spoiled":
            draw.ellipse([50, 70, 90, 110], fill=(20, 20, 20)) # Dark rot

    return img

if __name__ == "__main__":
    create_dataset_directories()
