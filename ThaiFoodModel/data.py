"""Read THFOOD-100 labels and existing splits without renumbering folder IDs."""

# csv reads the spreadsheet-like label file; Path handles Windows and Colab paths.
import csv
from pathlib import Path

# Use this script's folder as the default dataset location, regardless of where
# the terminal was opened. Only files with these image extensions are included.
ROOT = Path(__file__).resolve().parent
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_labels(path):
    """Turn CSV rows into the ordered dish list used by the model's outputs."""
    # UTF-8 preserves Thai text; utf-8-sig also accepts a CSV saved with a BOM
    # (an optional encoding marker that spreadsheet programs sometimes add).
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        # DictReader lets us read named columns instead of guessing their positions.
        reader = csv.DictReader(handle)
        # Reject missing columns before attempting to read any dish names.
        required = {"Directory_Name", "Dish_Name_English", "Dish_Name_Thai"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{path}: expected CSV columns {sorted(required)}")
        # Keep the ordered results and separately track folder IDs already encountered.
        labels = []
        seen = set()
        for row in reader:
            # Keep folder IDs as strings: converting "00" to a number would lose
            # its leading zero. Reject IDs that could point outside a class folder.
            directory = row["Directory_Name"].strip()
            if not directory or directory in {".", ".."} or "/" in directory or "\\" in directory or ":" in directory:
                raise ValueError(f"Invalid class directory: {directory!r}")
            if directory in seen:
                raise ValueError(f"Duplicate class directory in CSV: {directory}")
            # Both display names are required so predictions can support both languages.
            english = row["Dish_Name_English"].strip()
            thai = row["Dish_Name_Thai"].strip()
            if not english or not thai:
                raise ValueError(f"Missing dish name for {directory}")
            seen.add(directory)
            # Neural networks output numbered positions (0, 1, ...). Save which
            # original folder and dish names belong to each position, in CSV order.
            labels.append({"index": len(labels), "directory": directory,
                           "english": english, "thai": thai})
    # A classifier needs at least two possible dishes to choose between.
    if len(labels) < 2:
        raise ValueError("Classification requires at least two classes.")
    return labels


def select_labels(labels, directories=None):
    """Choose folder IDs and give the selected dishes consecutive model outputs."""
    if directories is None:
        return labels
    # Reject typos and repeated IDs instead of silently training on the wrong set.
    if len(set(directories)) != len(directories):
        raise ValueError("Selected class IDs must not contain duplicates.")
    unknown = set(directories) - {label["directory"] for label in labels}
    if unknown:
        raise ValueError(f"Selected class IDs missing from CSV: {sorted(unknown)}")
    if len(directories) < 2:
        raise ValueError("Select at least two classes for classification.")
    # Preserve CSV order even if terminal arguments use a different order. The
    # original folder ID and bilingual names stay intact in the saved checkpoint.
    return [{**label, "index": index} for index, label in enumerate(
        label for label in labels if label["directory"] in directories)]


def scan_split(root, split, labels, *, known_labels=None):
    """Use CSV row order as output order, identical across every split."""
    # A split is one of the train, val, or test directories.
    folder = Path(root) / split
    if not folder.is_dir():
        raise ValueError(f"Missing split directory: {folder}")
    # During subset training, other CSV-listed folders can stay on disk. Still
    # reject folders absent from the full CSV, so dataset typos remain visible.
    expected = {label["directory"] for label in (known_labels if known_labels is not None else labels)}
    unexpected = {p.name for p in folder.iterdir() if p.is_dir()} - expected
    if unexpected:
        raise ValueError(f"{split}: folders missing from CSV: {sorted(unexpected)}")
    # samples contains (image_path, output_index) pairs. counts records how many
    # photos each dish has so the training configuration can document the data.
    samples, counts = [], {}
    for label in labels:
        directory = folder / label["directory"]
        # Search inside each class folder, including subfolders. Sorting makes
        # the initial file order stable across repeated scans of the same data.
        paths = sorted(p for p in directory.rglob("*")
                       if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
        # Require every CSV class in every split to expose missing data early.
        if not paths:
            raise ValueError(f"Missing or empty class directory: {directory}")
        counts[label["directory"]] = len(paths)
        samples.extend((path, label["index"]) for path in paths)
    return samples, counts
