"""Restore the existing training checkpoint; never train or download weights."""

import hashlib
import json
from pathlib import Path
from threading import Lock

import torch

from data import ROOT, load_labels, select_labels
from model import PREPROCESS, build_model, choose_device, image_transform, read_image

DEFAULT_CHECKPOINT = ROOT / "artifacts/20261101-152629-882861/best.pt"


class FoodPredictor:
    def __init__(self, checkpoint_path=DEFAULT_CHECKPOINT, device="cpu"):
        path = Path(checkpoint_path).resolve()
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        if checkpoint.get("format_version") != 1:
            raise ValueError("Expected training checkpoint format_version 1.")
        if checkpoint.get("architecture") != "efficientnet_b0":
            raise ValueError("Checkpoint architecture does not match model.py.")
        if checkpoint.get("preprocessing") != PREPROCESS:
            raise ValueError("Checkpoint preprocessing does not match model.py.")
        if checkpoint.get("partial_debug_run", False):
            raise ValueError("Refusing a partial debug checkpoint. Select the trained best.pt.")
        labels = checkpoint.get("labels")
        if not isinstance(labels, list) or len(labels) < 2:
            raise ValueError("Checkpoint needs its ordered training labels.")
        # Training preserves CSV order when selecting a subset. Check the exact
        # bilingual mapping, consecutive output indices, and original folder IDs.
        expected = select_labels(load_labels(ROOT / "class_labels.csv"),
                                 [label["directory"] for label in labels])
        if labels != expected:
            raise ValueError("Checkpoint labels/order differ from the training CSV.")
        sidecar = path.with_name("labels.json")
        if sidecar.exists() and json.loads(sidecar.read_text(encoding="utf-8")) != labels:
            raise ValueError("labels.json differs from the checkpoint's output order.")
        head = checkpoint["model_state_dict"]["classifier.1.weight"]
        if tuple(head.shape) != (len(labels), 1280):
            raise ValueError("Checkpoint output layer does not match its labels.")
        self.device = choose_device(device)
        self.labels = labels
        self.model = build_model(len(labels), pretrained=False)
        self.model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        self.model.to(self.device).eval()
        self.transform = image_transform(training=False)
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        self.model_version = f"efficientnet_b0-{digest[:12]}"
        # Serializing model work avoids concurrent CPU oversubscription.
        self.lock = Lock()

    def predict(self, image_file):
        # Reuse the evaluation path verbatim: EXIF transpose -> RGB -> bicubic
        # shorter-side 256 -> center crop 224 -> tensor -> saved normalization.
        image = self.transform(read_image(image_file)).unsqueeze(0).to(self.device)
        with self.lock, torch.inference_mode():
            probabilities = self.model(image).softmax(dim=1)[0]
            if not torch.isfinite(probabilities).all():
                raise RuntimeError("Model returned non-finite scores.")
            scores, indices = probabilities.topk(min(3, len(self.labels)))
        return {"model_version": self.model_version, "candidates": [
            {"dish_id": self.labels[index]["directory"],
             "label_th": self.labels[index]["thai"],
             "label_en": self.labels[index]["english"], "score": score}
            for score, index in zip(scores.cpu().tolist(), indices.cpu().tolist())
        ]}
