"""Shared architecture and preprocessing for training and prediction."""

# torch performs model calculations; Pillow opens photos; torchvision supplies
# EfficientNet and the operations that prepare images for the network.
import torch
from PIL import Image, ImageOps
from torch import nn
from torchvision import models, transforms
from torchvision.transforms import InterpolationMode

# These settings match the ImageNet weights used below. Save them in each
# checkpoint so prediction can verify it prepares photos the same way as training.
# mean/std normalize the red, green, and blue channels after scaling to 0..1.
PREPROCESS = {
    "resize": 256, "crop": 224, "interpolation": "bicubic",
    "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225],
    "color_mode": "RGB", "exif_transpose": True,
}


def build_model(num_classes, pretrained=True):
    """Create EfficientNet-B0 with one output score per dish in our CSV."""
    # Pretrained weights already recognize useful visual patterns from ImageNet.
    # Reuse them for training; prediction instead restores our saved checkpoint.
    weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    model = models.efficientnet_b0(weights=weights)
    # Replace the original 1,000-class ImageNet output layer with our dish layer.
    # The backbone (model.features) still extracts the learned visual features.
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model


def image_transform(training=False):
    """Use random variations for training and fixed preparation for evaluation."""
    # Training augmentation shows slightly different versions of each photo.
    # This helps the model learn dishes across changes in framing and lighting.
    operations = [
        # Take a random crop covering 65%-100% of image area, then resize to 224x224.
        transforms.RandomResizedCrop(224, scale=(0.65, 1.0), interpolation=InterpolationMode.BICUBIC),
        # Flip left/right with the default 50% probability.
        transforms.RandomHorizontalFlip(),
        # Rotate by a randomly chosen angle between -15 and +15 degrees.
        transforms.RandomRotation(15, interpolation=InterpolationMode.BILINEAR),
        # Make small random changes to brightness, contrast, and color intensity.
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
    ] if training else [
        # Validation, test, and prediction must use consistent preparation:
        # resize the shorter side to 256, then take a 224x224 crop from the center.
        transforms.Resize(PREPROCESS["resize"], interpolation=InterpolationMode.BICUBIC),
        transforms.CenterCrop(PREPROCESS["crop"]),
    ]
    # Compose applies each operation in sequence. ToTensor converts a photo into
    # channel/height/width numbers in 0..1; Normalize applies the saved mean/std.
    return transforms.Compose(operations + [transforms.ToTensor(),
        transforms.Normalize(PREPROCESS["mean"], PREPROCESS["std"])])


def read_image(path):
    """Open a photo, correct camera orientation, and return three RGB channels."""
    # The context manager closes the source file. EXIF orientation handles phone
    # photos stored sideways; RGB also standardizes grayscale and RGBA images.
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def choose_device(requested="auto"):
    """Choose an NVIDIA GPU (CUDA) or the CPU for model calculations."""
    # Auto prefers an available GPU. An explicitly requested unavailable GPU is
    # an error, so a long training job does not unexpectedly run on the CPU.
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    if requested == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA is unavailable. Install a CUDA-enabled PyTorch build or use --device cpu.")
    return torch.device(requested)
