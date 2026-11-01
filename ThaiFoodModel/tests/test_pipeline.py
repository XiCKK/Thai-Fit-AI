"""Small offline regression checks; no pretrained weight downloads."""

# unittest runs the checks; tempfile creates disposable data; subprocess launches
# the real training and prediction commands to test the complete workflow.
import csv
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

# Allow the test file to import scripts from the ThaiFoodModel parent directory.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data import load_labels, scan_split, select_labels


class DatasetFixture(unittest.TestCase):
    """Provide a tiny temporary dataset for each test, leaving real photos alone."""

    def setUp(self):
        """Create a fresh folder and two-class CSV before each individual test."""
        self.temp = tempfile.TemporaryDirectory()
        # unittest runs cleanup even if an assertion fails.
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # Intentionally use nonalphabetic CSV order to catch label remapping bugs.
        self.csv = self.root / "class_labels.csv"
        with self.csv.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["Directory_Name", "Dish_Name_English", "Dish_Name_Thai"])
            writer.writerows([("09", "Dish Nine", "เก้า"), ("00", "Dish Zero", "ศูนย์")])

    def make_split(self, split):
        """Create both class folders; placeholder files suffice for path-only checks."""
        # Tests that actually load images replace these bytes with valid JPEG data.
        for directory in ("00", "09"):
            folder = self.root / split / directory
            folder.mkdir(parents=True)
            (folder / "image.jpg").write_bytes(b"placeholder")


class DataTests(DatasetFixture):
    """Check that labels and folder contents are interpreted consistently."""

    def test_subset_remaps_outputs_and_leaves_other_folders_alone(self):
        """Skipping a class must not leave gaps or load its images."""
        with self.csv.open("a", encoding="utf-8") as handle:
            handle.write("77,Other Dish,อื่น\n")
        all_labels = load_labels(self.csv)
        selected = select_labels(all_labels, ["77", "00"])
        self.make_split("train")
        extra = self.root / "train" / "77"
        extra.mkdir()
        (extra / "image.jpg").write_bytes(b"placeholder")
        samples, counts = scan_split(self.root, "train", selected, known_labels=all_labels)
        self.assertEqual([(label["directory"], label["index"]) for label in selected], [("00", 0), ("77", 1)])
        self.assertEqual({path.parent.name for path, _ in samples}, {"00", "77"})
        self.assertEqual(counts, {"00": 1, "77": 1})
        self.assertEqual(all_labels[2]["index"], 2)  # Original mapping was not mutated.
        (self.root / "train" / "unknown").mkdir()
        with self.assertRaisesRegex(ValueError, "missing from CSV"):
            scan_split(self.root, "train", selected, known_labels=all_labels)

    def test_subset_rejects_invalid_selections(self):
        """Require distinct known IDs and at least two dishes."""
        labels = load_labels(self.csv)
        for ids in (["00"], ["00", "missing"], ["00", "00"], []):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                select_labels(labels, ids)
        self.assertEqual(select_labels(labels), labels)

    def test_mapping_uses_csv_order_and_keeps_leading_zeros(self):
        """Output zero must mean CSV row zero, even when folders sort differently."""
        labels = load_labels(self.csv)
        self.make_split("train")
        samples, counts = scan_split(self.root, "train", labels)
        # Check both the label list and the image targets, not just class counts.
        self.assertEqual([label["directory"] for label in labels], ["09", "00"])
        self.assertEqual([(path.parent.name, target) for path, target in samples], [("09", 0), ("00", 1)])
        self.assertEqual(counts, {"09": 1, "00": 1})

    def test_unknown_or_empty_classes_fail(self):
        """Invalid class folders should stop a run instead of silently losing data."""
        labels = load_labels(self.csv)
        self.make_split("val")
        (self.root / "val" / "extra").mkdir()
        with self.assertRaisesRegex(ValueError, "missing from CSV"):
            scan_split(self.root, "val", labels)
        # Remove the unknown folder, then make a known class empty to check the
        # second failure independently. Only temporary test files are removed.
        (self.root / "val" / "extra").rmdir()
        (self.root / "val" / "00" / "image.jpg").unlink()
        with self.assertRaisesRegex(ValueError, "empty class"):
            scan_split(self.root, "val", labels)

    def test_duplicate_csv_directories_fail(self):
        """One folder must not be assigned to two different CSV output positions."""
        with self.csv.open("a", encoding="utf-8") as handle:
            handle.write("00,Duplicate,ซ้ำ\n")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            load_labels(self.csv)


class TrainingTests(DatasetFixture):
    """Check metric calculations, warmup behavior, and the saved-model workflow."""

    def test_report_and_frozen_backbone(self):
        """Verify known metric values and prove warmup updates only the head."""
        import torch
        from train import classification_report, FoodDataset, run_epoch
        from model import build_model
        from torch.utils.data import DataLoader
        from PIL import Image

        # Keep a tiny CPU test from starting more computation threads than needed.
        torch.set_num_threads(2)
        labels = load_labels(self.csv)
        # For class zero: 3 correct, 1 missed, and 2 false predictions of zero.
        # These hand-calculated values test precision, recall, and mean class F1.
        report = classification_report(torch.tensor([[3, 1], [2, 4]]), labels)
        self.assertAlmostEqual(report["per_class"][0]["precision"], 3 / 5)
        self.assertAlmostEqual(report["per_class"][0]["recall"], 3 / 4)
        self.assertAlmostEqual(report["macro_f1"], (6 / 9 + 8 / 11) / 2)
        # Generate actual pixels for a small training batch without using real photos.
        self.make_split("train")
        samples, _ = scan_split(self.root, "train", labels)
        for path, _ in samples:
            Image.new("RGB", (256, 256), (100, 150, 50)).save(path)
        # Random initial weights avoid downloading ImageNet weights during tests.
        model = build_model(2, pretrained=False)
        for parameter in model.features.parameters():
            parameter.requires_grad = False
        # Snapshot backbone weights AND stored BatchNorm statistics, plus head weights.
        original = {name: tensor.clone() for name, tensor in model.features.state_dict().items()}
        head_before = model.classifier[1].weight.detach().clone()
        optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=1e-3)
        # Simulate a warmup batch with GPU mixed precision disabled on the CPU.
        run_epoch(model, DataLoader(FoodDataset(samples, True), batch_size=2),
                  torch.nn.CrossEntropyLoss(), torch.device("cpu"), optimizer,
                  torch.amp.GradScaler("cuda", enabled=False), frozen=True)
        # The backbone must stay identical while the classifier head must learn.
        self.assertTrue(all(torch.equal(original[name], tensor)
                            for name, tensor in model.features.state_dict().items()))
        self.assertFalse(torch.equal(head_before, model.classifier[1].weight))

    def test_offline_train_and_predict(self):
        """Train briefly, save a checkpoint, reload it, and check prediction JSON."""
        from PIL import Image

        # Include a third dish on disk, but train on only the first two. Its invalid
        # image proves that unselected files never enter training or evaluation.
        with self.csv.open("a", encoding="utf-8") as handle:
            handle.write("77,Unused Dish,อื่น\n")

        # Synthetic colored squares exercise the pipeline, not recognition quality.
        # Each split gets one valid image per class, in an isolated temporary folder.
        for split in ("train", "val", "test"):
            self.make_split(split)
            unused = self.root / split / "77"
            unused.mkdir()
            (unused / "unreadable.jpg").write_bytes(b"not an image")
            for directory, color in (("09", (180, 20, 30)), ("00", (20, 180, 30))):
                Image.new("RGB", (256, 256), color).save(self.root / split / directory / "image.jpg")
        output = self.root / "output"
        # Limit CPU thread use in subprocesses and preserve Thai text in captured output.
        env = {**os.environ, "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2", "PYTHONUTF8": "1"}
        command = [sys.executable, str(ROOT / "train.py"), "--data-dir", str(self.root),
                   "--output-dir", str(output), "--no-pretrained", "--freeze-epochs", "0",
                   "--epochs", "2", "--batch-size", "2", "--max-batches", "1", "--device", "cpu",
                   "--classes", "00", "09"]
        # Launch the actual training script. check=True fails this test if the
        # command fails; timeout prevents a broken run from hanging indefinitely.
        subprocess.run(command, env=env, check=True, capture_output=True, text=True, timeout=180)
        metrics = json.loads((output / "test_metrics.json").read_text(encoding="utf-8"))
        self.assertEqual(metrics["test"]["images"], 2)
        self.assertTrue(metrics["partial_debug_run"])
        # A fresh process must be able to restore the saved model independently.
        result = subprocess.run([sys.executable, str(ROOT / "predict.py"),
            str(self.root / "test" / "09" / "image.jpg"), "--checkpoint", str(output / "best.pt")],
            env=env, check=True, capture_output=True, text=True, encoding="utf-8", timeout=60)
        # Confirm both labels survive the checkpoint, Thai text is intact, the
        # two-class probabilities sum to one, and the debug marker is preserved.
        prediction = json.loads(result.stdout)
        self.assertEqual({row["directory"] for row in prediction["predictions"]}, {"09", "00"})
        self.assertEqual({row["thai"] for row in prediction["predictions"]}, {"เก้า", "ศูนย์"})
        self.assertAlmostEqual(sum(row["probability"] for row in prediction["predictions"]), 1, places=5)
        self.assertTrue(prediction["partial_debug_model"])


if __name__ == "__main__":
    # Support direct execution as well as unittest's discovery command.
    unittest.main()
