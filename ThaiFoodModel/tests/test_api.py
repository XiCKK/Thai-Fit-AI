"""Real-checkpoint API checks. No training and no pretrained downloads."""

from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import torch
from fastapi.testclient import TestClient
from PIL import Image

from api import create_app
from inference import DEFAULT_CHECKPOINT, FoodPredictor
from model import image_transform, read_image


def image_bytes(mode="RGB", format="PNG", exif=None):
    handle = BytesIO()
    image = Image.new(mode, (48, 32))
    options = {"exif": exif} if exif is not None else {}
    image.save(handle, format=format, **options)
    return handle.getvalue()


@unittest.skipUnless(DEFAULT_CHECKPOINT.exists(), "Local trained checkpoint is required")
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.app = create_app(device="cpu")
        cls.client = TestClient(cls.app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def upload(self, content, mime="image/png"):
        return self.client.post("/predict", files={"file": ("meal", content, mime)})

    def test_real_sample_and_legacy_prediction_parity(self):
        samples = sorted((ROOT / "test/51").glob("*.jpg"))
        if not samples:
            self.skipTest("No real sample available")
        response = self.upload(samples[0].read_bytes(), "image/jpeg")
        self.assertEqual(response.status_code, 200)
        actual = response.json()
        # Compare with the pre-existing CLI, not a made-up expected prediction.
        result = subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "predict.py"), str(samples[0]),
                                 "--checkpoint", str(DEFAULT_CHECKPOINT), "--device", "cpu"],
                                capture_output=True, text=True, encoding="utf-8", check=True, timeout=60)
        expected = json.loads(result.stdout)["predictions"]
        self.assertEqual(len(actual["candidates"]), 3)
        for row, legacy in zip(actual["candidates"], expected):
            self.assertEqual((row["dish_id"], row["label_th"], row["label_en"]),
                             (legacy["directory"], legacy["thai"], legacy["english"]))
            self.assertAlmostEqual(row["score"], legacy["probability"], places=5)
        self.assertEqual(actual["model_version"], self.app.state.predictor.model_version)

    def test_loaded_once_eval_cpu_and_class_order(self):
        predictor = self.app.state.predictor
        self.assertFalse(predictor.model.training)
        self.assertEqual(str(predictor.device), "cpu")
        self.assertEqual([row["directory"] for row in predictor.labels], ["51", "55", "83", "86"])
        with patch("api.FoodPredictor", side_effect=AssertionError("Reloaded during a request")):
            for _ in range(2):
                self.assertEqual(self.upload(image_bytes()).status_code, 200)
                self.assertEqual(self.client.get("/health").json()["class_count"], 4)
        self.assertIs(self.app.state.predictor, predictor)

    def test_upload_validation(self):
        self.assertEqual(self.client.post("/predict").status_code, 422)
        self.assertEqual(self.upload(b"text", "text/plain").status_code, 415)
        self.assertEqual(self.upload(b"not pixels").status_code, 400)
        self.assertEqual(self.upload(b"").status_code, 400)
        self.assertEqual(self.upload(image_bytes(format="GIF"), "image/png").status_code, 415)
        self.assertEqual(self.upload(image_bytes()[:30]).status_code, 400)
        with patch("api.MAX_UPLOAD_BYTES", 20):
            self.assertEqual(self.upload(image_bytes()).status_code, 413)
        with patch("api.MAX_PIXELS", 10):
            self.assertEqual(self.upload(image_bytes()).status_code, 413)

    def test_rgb_grayscale_alpha_exif_and_heic(self):
        for mode in ("RGB", "L", "RGBA"):
            with self.subTest(mode=mode):
                self.assertEqual(self.upload(image_bytes(mode)).status_code, 200)
        exif = Image.Exif()
        exif[274] = 6  # 90-degree phone orientation.
        photo = image_bytes(format="JPEG", exif=exif)
        decoded = read_image(BytesIO(photo))
        self.assertEqual(decoded.size, (32, 48))
        self.assertEqual(decoded.mode, "RGB")
        tensor = image_transform()(decoded)
        self.assertEqual(tuple(tensor.shape), (3, 224, 224))
        self.assertEqual(self.upload(photo, "image/jpeg").status_code, 200)
        self.assertEqual(self.upload(image_bytes(format="HEIF"), "image/heic").status_code, 200)

    def test_inference_failure_is_explicit(self):
        with patch.object(self.app.state.predictor, "predict", side_effect=RuntimeError("test failure")):
            with self.assertLogs("api", level="ERROR"):
                result = self.upload(image_bytes())
            self.assertEqual(result.status_code, 500)
            self.assertEqual(result.json(), {"detail": "Model inference failed. Try again or search manually."})

    def test_phone_multipicture_jpeg_uses_primary_photo(self):
        photo = BytesIO()
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (48, 32), "red").save(
            photo, format="MPO", save_all=True, exif=exif,
            append_images=[Image.new("RGB", (48, 32), "blue")])
        content = photo.getvalue()
        with Image.open(BytesIO(content)) as decoded:
            self.assertEqual(decoded.format, "MPO")
            self.assertEqual(decoded.n_frames, 2)
        primary = read_image(BytesIO(content))
        self.assertEqual(primary.size, (32, 48))  # EXIF orientation retained.
        self.assertGreater(primary.getpixel((0, 0))[0], 240)  # Red primary, not blue auxiliary.
        response = self.client.post("/predict", files={"file": ("phone.jpg", content, "image/jpeg")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), self.app.state.predictor.predict(BytesIO(content)))

        # Continue rejecting animated images; accepting MPO is not a blanket
        # exception for all multi-frame formats.
        animated = BytesIO()
        Image.new("RGB", (48, 32), "red").save(
            animated, format="WEBP", save_all=True,
            append_images=[Image.new("RGB", (48, 32), "blue")], duration=100, loop=0)
        self.assertEqual(self.upload(animated.getvalue(), "image/webp").status_code, 415)
        unsupported = self.upload(image_bytes(format="TIFF"), "image/jpeg")
        self.assertEqual(unsupported.status_code, 415)
        self.assertIn("Detected image format: TIFF", unsupported.json()["detail"])

    def test_invalid_checkpoint_metadata_is_rejected(self):
        checkpoint = torch.load(DEFAULT_CHECKPOINT, map_location="cpu", weights_only=True)
        bad_cases = [
            {**checkpoint, "format_version": 99},
            {**checkpoint, "architecture": "some_other_network"},
            {**checkpoint, "preprocessing": {}},
            {**checkpoint, "partial_debug_run": True},
            {**checkpoint, "labels": list(reversed(checkpoint["labels"]))},
            {**checkpoint, "model_state_dict": {**checkpoint["model_state_dict"],
                "classifier.1.weight": torch.zeros(3, 1280)}},
        ]
        for invalid in bad_cases:
            with patch("inference.torch.load", return_value=invalid), self.assertRaises(ValueError):
                FoodPredictor()


if __name__ == "__main__":
    unittest.main()
