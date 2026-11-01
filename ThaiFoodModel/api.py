"""Local meal-photo API. Start from this folder with python -m uvicorn api:app."""

from contextlib import asynccontextmanager
import logging
import os
import warnings

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from inference import DEFAULT_CHECKPOINT, FoodPredictor

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 25_000_000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp",
                 "image/x-ms-bmp", "image/heic", "image/heif"}
ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "BMP", "HEIF"}
logger = logging.getLogger(__name__)


class Candidate(BaseModel):
    dish_id: str
    label_th: str
    label_en: str
    score: float = Field(ge=0, le=1)


class Prediction(BaseModel):
    model_version: str
    candidates: list[Candidate] = Field(min_length=1, max_length=3)


def validate_image(file):
    """Check decoded content, dimensions and integrity before preprocessing."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(file) as image:
                if image.format not in ALLOWED_FORMATS:
                    logger.warning("Rejected decoded image format: %s", image.format)
                    raise HTTPException(415, f"Detected image format: {image.format or 'unknown'}. Use a JPEG, PNG, WebP, BMP, or HEIC photo.")
                if image.width * image.height > MAX_PIXELS:
                    raise HTTPException(413, "Photo exceeds 25 megapixels. Choose a smaller photo.")
                # Some JPEG photos contain MPF auxiliary images and Pillow
                # reports them as MPO. Use the primary image (frame zero), as
                # the existing read_image() does; do not treat it as animation.
                if image.format != "MPO" and getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(415, "Use a still image, not an animated image.")
                image.verify()
        file.seek(0)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(413, "Photo dimensions are too large.") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(400, "Cannot decode this photo. Choose a valid JPEG, PNG, or HEIC image.") from exc


def create_app(checkpoint_path=None, device=None):
    @asynccontextmanager
    async def lifespan(app):
        # Register phone HEIC support without changing the trained RGB pipeline.
        from pillow_heif import register_heif_opener
        register_heif_opener()
        app.state.predictor = FoodPredictor(
            checkpoint_path or os.environ.get("THAIFIT_CHECKPOINT", str(DEFAULT_CHECKPOINT)),
            device or os.environ.get("THAIFIT_DEVICE", "cpu"))
        logger.info("Loaded %s on %s", app.state.predictor.model_version, app.state.predictor.device)
        yield
        del app.state.predictor

    app = FastAPI(title="ThaiFit food recognition", version="1.0.0", lifespan=lifespan)

    @app.get("/health")
    def health():
        predictor = app.state.predictor
        return {"status": "ok", "model_version": predictor.model_version,
                "device": str(predictor.device), "class_count": len(predictor.labels)}

    @app.post("/predict", response_model=Prediction)
    async def predict(file: UploadFile = File(...)):
        try:
            if file.content_type not in ALLOWED_TYPES:
                raise HTTPException(415, "Upload an image as multipart field 'file' (JPEG, PNG, WebP, BMP, HEIC).")
            # UploadFile spools large bodies to disk; read in bounded chunks and
            # reject oversized uploads before decoding any pixels.
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Photo exceeds 10 MB. Choose a smaller photo.")
            if size == 0:
                raise HTTPException(400, "The uploaded image is empty.")
            await file.seek(0)
            await run_in_threadpool(validate_image, file.file)
            try:
                return await run_in_threadpool(app.state.predictor.predict, file.file)
            except (OSError, ValueError, SyntaxError) as exc:
                raise HTTPException(400, "Photo could not be processed. Try another image.") from exc
            except Exception as exc:
                logger.exception("Inference failed")
                raise HTTPException(500, "Model inference failed. Try again or search manually.") from exc
        finally:
            await file.close()

    return app


app = create_app()
