"""Refresh the app's offline manual-search labels from the training CSV."""
import json
from pathlib import Path

from data import ROOT, load_labels


if __name__ == "__main__":
    target = ROOT.parent / "Mobile/src/data/dishes.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    dishes = [{"id": row["directory"], "nameTh": row["thai"], "nameEn": row["english"]}
              for row in load_labels(ROOT / "class_labels.csv")]
    target.write_text(json.dumps(dishes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(dishes)} training CSV labels to {target}")
