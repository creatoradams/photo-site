# generator
from pathlib import Path
import json

ROOT = Path(__file__).parent

def write(rel, content):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote", rel)

print("gen loaded")
