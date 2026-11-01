"""Fine-tune EfficientNet-B0 on the existing THFOOD-100 train/val/test splits."""

# Standard-library tools handle terminal options, report files, validation,
# random seeds, timing, and paths. No training happens while these are imported.
import argparse
import csv
import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path

# PyTorch performs the learning. Dataset supplies individual examples and
# DataLoader groups them into batches that the model can process together.
import torch
import torchvision
from torch import nn
from torch.utils.data import DataLoader, Dataset

# Reuse the label mapping and model preparation in the other scripts so training,
# validation, and prediction all agree on what each output position represents.
from data import ROOT, load_labels, scan_split, select_labels
from model import PREPROCESS, build_model, choose_device, image_transform, read_image


class FoodDataset(Dataset):
    """Let PyTorch request one prepared photo and its correct dish index at a time."""

    def __init__(self, samples, training=False):
        # Store paths instead of all image pixels to avoid filling RAM. Choose
        # random augmentation for training or fixed preparation for evaluation.
        self.samples = samples
        self.transform = image_transform(training)

    def __len__(self):
        """Tell DataLoader how many images this dataset contains."""
        return len(self.samples)

    def __getitem__(self, index):
        """Open the requested photo and pair it with its numeric training label."""
        path, target = self.samples[index]
        try:
            return self.transform(read_image(path)), target
        except Exception as exc:
            # Include the file path in the error so a damaged image can be found.
            raise RuntimeError(f"Cannot read image {path}; run validate_data.py --verify-images") from exc


def seed_worker(worker_id):
    """Give each image-loading worker a repeatable Python random seed."""
    # DataLoader already assigns each worker its own PyTorch seed. Derive the
    # Python seed from it; worker_id is required by DataLoader's callback interface.
    random.seed(torch.initial_seed() % (2**32))


def run_epoch(model, loader, criterion, device, optimizer=None, scaler=None,
              frozen=False, report=False, num_classes=0, max_batches=None):
    """Process one pass through a split, learning only if an optimizer is supplied.

    criterion measures prediction error (loss); optimizer changes learned weights.
    scaler supports GPU mixed precision. report requests a confusion matrix, and
    max_batches limits the pass for a quick debug run.
    """
    # Training mode enables training-only behavior such as dropout. Evaluation
    # mode uses fixed BatchNorm statistics and disables dropout randomness.
    training = optimizer is not None
    model.train(training)
    if training and frozen:
        # The backbone extracts visual features. During head warmup, keep both
        # its weights and its behavior fixed: BatchNorm statistics must not drift.
        model.features.eval()
    # Accumulate results across batches. The confusion matrix counts actual dish
    # indices in rows and predicted indices in columns; only the test pass needs it.
    total, loss_sum, top1, top3 = 0, 0.0, 0, 0
    confusion = torch.zeros(num_classes, num_classes, dtype=torch.int64) if report else None
    # Automatic mixed precision uses lower-precision calculations where suitable
    # on the GPU to reduce memory use. CPU runs use the usual full precision.
    amp = device.type == "cuda"
    started = time.monotonic()
    # Gradients describe how weights should change. Evaluation does not update
    # weights, so skipping gradient tracking saves memory and calculations.
    with torch.set_grad_enabled(training):
        for batch, (images, targets) in enumerate(loader, start=1):
            # Move this batch of photos and correct labels onto the chosen device.
            # Nonblocking copies can help overlap transfers when using pinned GPU input.
            images, targets = images.to(device, non_blocking=True), targets.to(device, non_blocking=True)
            if training:
                # Remove the previous batch's gradients before learning this batch.
                optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, enabled=amp):
                # Forward pass: produce one raw score (logit) per dish per image.
                # Cross-entropy compares these scores with the correct dish indices.
                logits = model(images)
                loss = criterion(logits, targets)
            # Stop on NaN/infinity instead of continuing with unusable model weights.
            if not torch.isfinite(loss).item():
                raise RuntimeError("Non-finite loss. Check images and lower the learning rate.")
            if training:
                # Backward pass computes gradients; the optimizer uses them to
                # update weights. Scaling helps avoid tiny GPU gradients rounding
                # to zero in mixed precision and is disabled for the CPU path.
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            # Metrics do not need gradients. Find up to three highest-scoring
            # classes for each image, including models with fewer than three classes.
            predictions = logits.detach().topk(min(3, logits.shape[1]), dim=1).indices
            size = targets.size(0)
            total += size
            # Weight each batch's average loss by its size, so a smaller final
            # batch does not count as much as a full one in the epoch average.
            loss_sum += loss.item() * size
            # Top-1: first suggestion is correct. Top-3: any of the three is correct.
            top1 += (predictions[:, 0] == targets).sum().item()
            top3 += (predictions == targets[:, None]).any(dim=1).sum().item()
            if report:
                # Encode each (actual, predicted) pair as one number, count the
                # occurrences, then reshape the counts into a square matrix.
                flat = (targets * num_classes + predictions[:, 0]).cpu()
                confusion += torch.bincount(flat, minlength=num_classes**2).reshape(num_classes, num_classes)
            # Show progress during long passes; allow short partial runs for debugging.
            if batch % 100 == 0:
                print(f"  batch {batch}/{len(loader)} loss={loss_sum / total:.4f}", flush=True)
            if max_batches is not None and batch >= max_batches:
                break
    # Return accuracy as a fraction (0..1), average loss, count, and elapsed time.
    metrics = {"loss": loss_sum / total, "top1": top1 / total,
               "top3": top3 / total, "images": total,
               "seconds": round(time.monotonic() - started, 2)}
    return metrics, confusion


def classification_report(confusion, labels):
    """Turn the test confusion matrix into scores for each named dish."""
    rows = []
    for label in labels:
        index = label["index"]
        # The diagonal counts correct predictions. The row total is the number
        # of real examples of this dish; the column total is how often it was predicted.
        true_positive = int(confusion[index, index])
        support = int(confusion[index].sum())
        predicted = int(confusion[:, index].sum())
        # Precision: when we predict this dish, how often are we right?
        # Recall: out of its real examples, how many do we recognize?
        # F1 combines precision and recall; empty denominators receive zero.
        precision = true_positive / predicted if predicted else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        rows.append({**label, "support": support, "precision": precision, "recall": recall, "f1": f1})
    # Macro F1 gives each dish equal weight, even when some have more test photos.
    return {"macro_f1": sum(row["f1"] for row in rows) / len(rows), "per_class": rows}


def write_json(path, value):
    """Save a readable report as UTF-8 JSON, preserving Thai dish names."""
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def arguments():
    """Read training settings from terminal options and reject invalid values."""
    parser = argparse.ArgumentParser(description=__doc__)
    # Locations: dataset root and the directory where this run's outputs are saved.
    parser.add_argument("--data-dir", type=Path, default=ROOT)
    # Select only these CSV folder IDs, e.g. --classes 86 51 55. Leave the
    # option out to train all dishes; no image folders need to be moved or copied.
    parser.add_argument("--classes", nargs="+", metavar="ID", help="Train only selected CSV folder IDs.")
    parser.add_argument("--output-dir", type=Path, help="New empty directory; defaults to artifacts/<timestamp>.")
    # One epoch is a pass through the training images. Warmup trains only the
    # final dish layer; subsequent epochs also update the pretrained backbone.
    parser.add_argument("--epochs", type=int, default=15, help="Total epochs, including the warmup.")
    parser.add_argument("--freeze-epochs", type=int, default=2)
    # Batch size is images processed together. More workers can prepare images
    # in parallel, but zero avoids multiprocessing setup issues on Windows.
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--workers", type=int, default=0, help="0 is reliable on Windows; try 2 or 4 for speed.")
    # Learning rate controls the size of weight updates. Use larger steps for
    # the new head, smaller steps when adapting the already-trained backbone.
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--fine-tune-lr", type=float, default=1e-4)
    # Weight decay discourages overly large weights. Patience controls when to
    # stop fine-tuning if validation loss has not beaten the best score so far.
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=5, help="Fine-tuning epochs without better validation loss.")
    # The seed makes random choices repeatable; device selects GPU or CPU.
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    # Debug options avoid downloads or shorten the run. Such a run is useful for
    # checking the pipeline, but does not establish real recognition accuracy.
    parser.add_argument("--no-pretrained", action="store_true", help="Offline/debug only; train with random weights.")
    parser.add_argument("--max-batches", type=int, help="Debug only: cap batches in each split; metrics are partial.")
    args = parser.parse_args()
    # Catch impossible settings before loading photos or starting expensive work.
    for name in ("epochs", "batch_size", "patience"):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if args.workers < 0 or not 0 <= args.freeze_epochs <= args.epochs:
        parser.error("workers must be nonnegative and freeze-epochs must be between 0 and epochs")
    if any(not math.isfinite(value) or value <= 0 for value in (args.head_lr, args.fine_tune_lr)):
        parser.error("learning rates must be finite and positive")
    if not math.isfinite(args.weight_decay) or args.weight_decay < 0:
        parser.error("weight-decay must be finite and nonnegative")
    if args.max_batches is not None and args.max_batches < 1:
        parser.error("max-batches must be positive")
    if args.no_pretrained and args.freeze_epochs:
        # Freezing a random backbone would prevent its feature extractor learning.
        parser.error("Use --freeze-epochs 0 with --no-pretrained; random features should not be frozen")
    return args


def main():
    """Prepare the data, train with validation, and evaluate the best saved model."""
    args = arguments()
    # Seed weight initialization, shuffling, and random augmentation. The same
    # seed helps comparisons, but does not guarantee identical results on all hardware.
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    # Inspect all three splits before training, using the same CSV output mapping.
    device = choose_device(args.device)
    all_labels = load_labels(args.data_dir / "class_labels.csv")
    labels = select_labels(all_labels, args.classes)
    split_data = {split: scan_split(args.data_dir, split, labels, known_labels=all_labels)
                  for split in ("train", "val", "test")}
    # Give each run a separate output folder, named using UTC time. Refuse to
    # overwrite earlier checkpoints when an explicit nonempty folder is supplied.
    output = args.output_dir or ROOT / "artifacts" / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory must be empty to protect earlier runs: {output}")
    output.mkdir(parents=True, exist_ok=True)
    # Record settings, library versions, and per-dish image counts for later
    # comparison. Paths become strings because JSON cannot directly store Path objects.
    config = {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()}
    config.update({"architecture": "efficientnet_b0", "device": str(device),
                   "torch_version": str(torch.__version__),
                   "torchvision_version": str(torchvision.__version__), "preprocessing": PREPROCESS,
                   "partial_debug_run": args.max_batches is not None,
                   "splits": {split: {"images": len(samples), "per_class": counts}
                              for split, (samples, counts) in split_data.items()}})
    write_json(output / "config.json", config)
    write_json(output / "labels.json", labels)
    print(f"Device: {device}; classes: {len(labels)}; output: {output}", flush=True)
    if args.classes:
        # English names keep this status line readable in Windows terminal encodings.
        print("Selected dishes: " + "; ".join(f"{label['directory']} {label['english']}" for label in labels), flush=True)
        for split, (samples, _) in split_data.items():
            print(f"  {split}: {len(samples):,} selected images", flush=True)
    if args.max_batches:
        print("DEBUG RUN: only part of each split is evaluated; do not report these as full dataset scores.")
    if device.type == "cpu":
        print("Running on CPU. Full training will be slow; use CUDA or Colab for the full dataset.")
    # DataLoaders read photos on demand and group them into batches. Only training
    # gets random augmentation and shuffling; validation/test keep a stable order.
    loaders = {}
    for split, (samples, _) in split_data.items():
        loaders[split] = DataLoader(
            FoodDataset(samples, training=split == "train"), batch_size=args.batch_size,
            shuffle=split == "train", num_workers=args.workers,
            # Pinned input memory can speed GPU transfers. Seed workers and keep
            # them alive between epochs when multiprocessing is enabled.
            pin_memory=device.type == "cuda", worker_init_fn=seed_worker,
            generator=torch.Generator().manual_seed(args.seed),
            persistent_workers=args.workers > 0,
        )
    # Build one output per CSV dish and move the network to the selected device.
    # Cross-entropy learns a single correct class for each photo. GradScaler
    # supports the mixed-precision GPU updates performed inside run_epoch.
    model = build_model(len(labels), pretrained=not args.no_pretrained).to(device)
    criterion = nn.CrossEntropyLoss()
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    # Lower validation loss is better. Infinity ensures the first successful
    # epoch becomes the initial best checkpoint; bad_epochs tracks lack of progress.
    history, best_loss, bad_epochs = [], float("inf"), 0
    optimizer = None
    for epoch in range(args.epochs):
        # Epoch numbers are zero-based internally; printed reports start at one.
        frozen = epoch < args.freeze_epochs
        if optimizer is None or epoch == args.freeze_epochs:
            # Set up the first phase, or switch from head warmup to full fine-tuning.
            # requires_grad=False prevents backbone weight updates during warmup.
            for parameter in model.features.parameters():
                parameter.requires_grad = not frozen
            # AdamW adjusts the trainable weights using gradients and weight decay.
            # Rebuild it at the phase change so the backbone can start learning.
            optimizer = torch.optim.AdamW(
                [p for p in model.parameters() if p.requires_grad],
                lr=args.head_lr if frozen else args.fine_tune_lr, weight_decay=args.weight_decay)
            # Halve the learning rate after the scheduler's patience is exceeded
            # without better validation loss. Reset its tracking for the new phase.
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=2, factor=0.5)
            bad_epochs = 0
        print(f"Epoch {epoch + 1}/{args.epochs} ({'head warmup' if frozen else 'fine-tuning'})", flush=True)
        # Train on the training split, then measure validation performance without
        # changing weights. The underscore discards the unneeded confusion matrix.
        train_metrics, _ = run_epoch(model, loaders["train"], criterion, device,
            optimizer, scaler, frozen=frozen, max_batches=args.max_batches)
        val_metrics, _ = run_epoch(model, loaders["val"], criterion, device, max_batches=args.max_batches)
        # Save progress every epoch so completed results remain available even
        # if a later epoch is interrupted. Validation loss also guides the scheduler.
        history.append({"epoch": epoch + 1, "phase": "warmup" if frozen else "fine_tune",
                        "learning_rate": optimizer.param_groups[0]["lr"],
                        "train": train_metrics, "val": val_metrics})
        write_json(output / "history.json", history)
        scheduler.step(val_metrics["loss"])
        print(f"  train loss={train_metrics['loss']:.4f} top1={train_metrics['top1']:.2%}; "
              f"val loss={val_metrics['loss']:.4f} top1={val_metrics['top1']:.2%} "
              f"top3={val_metrics['top3']:.2%}", flush=True)
        # Keep only the model with the lowest validation loss, rather than simply
        # the last epoch. Include its label order and preprocessing for prediction.
        if val_metrics["loss"] < best_loss:
            best_loss, bad_epochs = val_metrics["loss"], 0
            torch.save({"format_version": 1, "architecture": "efficientnet_b0",
                        "model_state_dict": model.state_dict(), "labels": labels,
                        "preprocessing": PREPROCESS, "epoch": epoch + 1,
                        "val_metrics": val_metrics, "partial_debug_run": args.max_batches is not None},
                       output / "best.pt")
        else:
            bad_epochs += 1
        # Early stopping applies during fine-tuning, allowing warmup to finish.
        if not frozen and bad_epochs >= args.patience:
            print("Early stopping: validation loss stopped improving.")
            break
    # Restore the best validation-selected weights before testing. The test split
    # has not guided updates, checkpoint selection, learning rates, or early stopping.
    checkpoint = torch.load(output / "best.pt", map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])
    test_metrics, confusion = run_epoch(model, loaders["test"], criterion, device,
        report=True, num_classes=len(labels), max_batches=args.max_batches)
    # Combine overall test results with per-dish scores and mark any partial run.
    report = {"best_epoch": checkpoint["epoch"], "partial_debug_run": args.max_batches is not None,
              "test": test_metrics, **classification_report(confusion, labels)}
    write_json(output / "test_metrics.json", report)
    # Save a spreadsheet-friendly table of mistakes. Row IDs are the actual dish;
    # column IDs are the predicted dish. Correct predictions lie on the diagonal.
    with (output / "confusion_matrix.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["actual/predicted"] + [label["directory"] for label in labels])
        for label, row in zip(labels, confusion.tolist()):
            writer.writerow([label["directory"]] + row)
    # Show final scores and the checkpoint path needed by predict.py.
    print(f"Test top1={test_metrics['top1']:.2%}, top3={test_metrics['top3']:.2%}, "
          f"macro F1={report['macro_f1']:.4f}")
    print(f"Best model: {output / 'best.pt'}")


if __name__ == "__main__":
    # The entry-point guard also prevents Windows data-loading workers from
    # accidentally starting another training run when importing this module.
    main()
