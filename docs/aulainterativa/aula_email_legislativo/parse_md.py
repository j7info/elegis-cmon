import re
import os
import json
import glob

# Paths
base_dir = "/Users/jeferson/Projetos/elegiscmon/docs/aulainterativa/aula_email_legislativo"
md_file = os.path.join(base_dir, "aulaemail.md")
assets_dir = os.path.join(base_dir, "simulacao", "assets")
output_js = os.path.join(base_dir, "simulacao", "data.js")

# Create assets dir
os.makedirs(assets_dir, exist_ok=True)

# Read markdown
with open(md_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

steps = []
current_image = None
image_map = {}

# Map screenshots
for filepath in glob.glob(os.path.join(base_dir, "Captura de Tela *.png")):
    filename = os.path.basename(filepath)
    # Extract time like "07.49.31"
    match = re.search(r'(\d{2}\.\d{2}\.\d{2})', filename)
    if match:
        time_str = match.group(1)
        image_map[time_str] = filename
        # Copy file to assets
        dest_path = os.path.join(assets_dir, filename)
        if not os.path.exists(dest_path):
            with open(filepath, "rb") as src, open(dest_path, "wb") as dst:
                dst.write(src.read())

for line in lines:
    line = line.strip()
    if line.startswith("## Tela"):
        # Match e.g. "## Tela 01 — 07.49.31 — Página de login..."
        match = re.search(r'## Tela \d+ — (\d{2}\.\d{2}\.\d{2})', line)
        if match:
            time_str = match.group(1)
            current_image = image_map.get(time_str, None)
    elif line and not line.startswith("#") and not line.startswith("---"):
        if current_image:
            # Paragraph text
            steps.append({
                "text": line,
                "image": current_image,
                "x": 50, # default 50%
                "y": 50  # default 50%
            })

# Save as data.js
js_content = f"const lessonData = {json.dumps(steps, indent=2, ensure_ascii=False)};"
with open(output_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Generated data.js with {len(steps)} steps.")
