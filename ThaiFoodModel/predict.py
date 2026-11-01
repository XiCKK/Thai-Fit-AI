"""Return top dish suggestions as JSON, including the original folder ID and Thai name."""

# argparse reads terminal options; json formats predictions; Path handles paths.
import argparse
import json
from pathlib import Path

# Use the same model and photo preparation as training to keep outputs consistent.
import torch

from model import PREPROCESS, build_model, choose_device, image_transform, read_image


def main():
    """Load a trained model and print its highest-scoring dish suggestions."""
    # Read the photo path, saved checkpoint, number of suggestions, and device.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    args = parser.parse_args()
    if args.top_k < 1:
        parser.error("top-k must be positive")
    device = choose_device(args.device)
    # First load the saved data onto the CPU, so GPU memory is only used after
    # the model is built. weights_only uses PyTorch's restricted checkpoint loader.
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    # Reject a checkpoint that requires a different network or image preparation.
    if checkpoint.get("architecture") != "efficientnet_b0" or checkpoint.get("preprocessing") != PREPROCESS:
        raise ValueError("Unsupported model architecture or preprocessing in checkpoint")
    # Read the checkpoint's own labels: their order must match its learned outputs.
    labels = checkpoint["labels"]
    # Build the architecture without downloading ImageNet weights, then replace
    # its initial values with the Thai-food weights from the saved checkpoint.
    model = build_model(len(labels), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    # eval disables training-only randomness such as dropout.
    model.to(device).eval()
    # A single image has shape [channels, height, width]. unsqueeze(0) adds the
    # batch dimension, giving [1, 3, 224, 224], which the model expects.
    image = image_transform()(read_image(args.image)).unsqueeze(0).to(device)
    # No learning happens here, so skip gradient tracking to save time and memory.
    with torch.inference_mode():
        # Softmax converts raw scores into probabilities summing to 1 across
        # the known classes. [0] selects the only photo in this batch.
        probabilities = model(image).softmax(dim=1)[0]
        # Return the highest scores and their label positions. Clamp k so it
        # cannot exceed the number of classes in a small experimental model.
        scores, indices = probabilities.topk(min(args.top_k, len(labels)))
    # Attach the original folder ID and bilingual names to each selected score.
    # Move results to CPU lists so they can be serialized as ordinary JSON.
    predictions = [{**labels[index], "probability": score}
                   for score, index in zip(scores.cpu().tolist(), indices.cpu().tolist())]
    # Preserve readable Thai text and identify checkpoints from partial debug runs.
    print(json.dumps({"predictions": predictions,
                      "partial_debug_model": checkpoint.get("partial_debug_run", False)},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    # Run only when launched directly, not when another Python file imports it.
    main()
