"""Check labels, splits, and optionally corrupt images / exact duplicate leakage."""

# argparse handles options; hashlib identifies byte-identical image files;
# json prints a small summary; Path handles dataset locations.
import argparse
import hashlib
import json
from pathlib import Path

from data import ROOT, load_labels, scan_split, select_labels


def main():
    """Check the existing dataset without training or changing any images."""
    # The default check needs only Python's standard library. The optional
    # --verify-images check imports Pillow only when image decoding is requested.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT)
    # Use the same class selection as training to check just that experiment's data.
    parser.add_argument("--classes", nargs="+", metavar="ID", help="Check only selected CSV folder IDs.")
    parser.add_argument("--verify-images", action="store_true", help="Decode every image with Pillow.")
    parser.add_argument("--check-duplicates", action="store_true", help="Hash image bytes across splits (slower).")
    args = parser.parse_args()
    # Load the expected class mapping, then apply it to each existing split.
    all_labels = load_labels(args.data_dir / "class_labels.csv")
    labels = select_labels(all_labels, args.classes)
    # seen maps file fingerprints to their first split, path, and class index.
    # errors collects problems so a full scan can report more than one bad file.
    seen, errors = {}, []
    for split in ("train", "val", "test"):
        # scan_split checks folder names, missing classes, and image counts.
        samples, counts = scan_split(args.data_dir, split, labels, known_labels=all_labels)
        for path, target in samples:
            if args.verify_images:
                # Actually decode the pixels, rather than trusting the extension
                # or just reading the header. This can reveal damaged image data.
                from PIL import Image, ImageOps
                try:
                    with Image.open(path) as image:
                        ImageOps.exif_transpose(image).convert("RGB").load()
                except Exception as exc:
                    errors.append(f"Unreadable image {path}: {exc}")
            if args.check_duplicates:
                # SHA-256 gives a fingerprint of the file's exact bytes. This
                # catches copied files, but not resized or re-encoded duplicates.
                digest = hashlib.sha256(path.read_bytes()).digest()
                # setdefault remembers the first occurrence and returns it again
                # when the same fingerprint appears later in the scan.
                previous = seen.setdefault(digest, (split, path, target))
                # Copies across splits can inflate evaluation scores. Copies
                # assigned to different classes indicate conflicting labels.
                if previous[0] != split or previous[2] != target:
                    errors.append(f"Duplicate across splits or labels: {previous[1]} <-> {path}")
        # Flush progress immediately because a complete image scan can be slow.
        print(f"{split}: {len(samples):,} images, {len(counts)} classes", flush=True)
    # Limit the displayed errors so a problematic dataset does not flood the terminal.
    print(json.dumps({"classes": len(labels), "errors": len(errors)}, indent=2))
    for error in errors[:30]:
        print(error)
    if len(errors) > 30:
        print(f"... and {len(errors) - 30} more errors")
    if errors:
        # A nonzero exit status tells the terminal or another script validation failed.
        raise SystemExit(1)


if __name__ == "__main__":
    # Importing helpers must not start a full dataset scan automatically.
    main()
