# Thai food classifier training

Train an **EfficientNet-B0 image classifier** using PyTorch and the THFOOD-100
images already in this folder. The default run uses all 100 dishes. It recognizes
one main dish per photo and can return the top three suggestions for the app.

## Dataset layout and labels

```text
ThaiFoodModel/
  class_labels.csv
  train/00/*.jpg ... train/99/*.jpg
  val/00/*.jpg   ... val/99/*.jpg
  test/00/*.jpg  ... test/99/*.jpg
  train.py
  predict.py
  validate_data.py
  data.py
  model.py
  requirements.txt
```

There are 29,387 training images, 10,696 validation images, and 13,376 test
images. The CSV columns are `Directory_Name`, `Dish_Name_English`, and
`Dish_Name_Thai`. For example, folder `00` contains Khao Phat Amerikan /
ข้าวผัดอเมริกัน. Folder IDs stay strings, so the leading zeros are preserved.
Output indices follow **CSV row order**, and that mapping is saved with the model.
All classes must have images in all three splits. The scripts preserve the
provided splits; they do not randomly redistribute your photos.

## Windows setup

Install Python 3.11 or 3.12 if `py` is unavailable. From the repository root:

```powershell
cd ThaiFoodModel
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

For your NVIDIA RTX 3060, install a CUDA-enabled PyTorch/torchvision pair using
the [official installation selector](https://pytorch.org/get-started/locally/).
One supported CUDA 12.6 installation command is:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu126
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -c "import torch; print('GPU available:', torch.cuda.is_available())"
```

The CUDA command also replaces an existing CPU-only PyTorch installation. It
downloads large packages. The supported build options are listed in the
[official PyTorch release installation commands](https://pytorch.org/get-started/previous-versions/).

For a computer without an NVIDIA GPU, install a CPU build instead:

```powershell
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The commands use the environment's Python directly; PowerShell activation is
optional. CPU training on the full dataset will be slow.

## Validate and train

```powershell
# Quick check: CSV, folders, and counts (no PyTorch needed).
.\.venv\Scripts\python.exe validate_data.py

# Optional full image decoding and exact duplicate check. May take several minutes.
.\.venv\Scripts\python.exe validate_data.py --verify-images --check-duplicates

# Full training on your GPU.
.\.venv\Scripts\python.exe train.py --device cuda --epochs 15 --batch-size 32
```

The first normal training run downloads ImageNet pretrained weights (about
21 MB). Training first updates the classifier head for two epochs while keeping
the backbone and its BatchNorm statistics frozen. It then fine-tunes the full
model at a lower learning rate. Augmentation is applied only to training images.
Evaluation uses the pretrained model's 256-pixel resize, 224-pixel center crop,
and ImageNet normalization, following the
[torchvision EfficientNet-B0 documentation](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.efficientnet_b0.html).

Validation loss selects `best.pt`, reduces the learning rate when progress slows,
and triggers early stopping after five fine-tuning epochs without improvement.
The test split is evaluated once after training using the best checkpoint.
Random seeds are saved, although different hardware and library versions can
still produce numerical differences.

Useful options:

```powershell
# Smaller batches if GPU memory runs out.
.\.venv\Scripts\python.exe train.py --device cuda --batch-size 16

# More image-loading workers; the safe Windows default is zero.
.\.venv\Scripts\python.exe train.py --device cuda --workers 2

# Quick offline pipeline check with random weights, NOT a useful trained model.
.\.venv\Scripts\python.exe train.py --device cpu --no-pretrained --freeze-epochs 0 --epochs 1 --batch-size 2 --max-batches 1

# See all options, including a custom dataset or output directory.
.\.venv\Scripts\python.exe train.py --help
```

`--max-batches` produces explicitly marked partial debug results. Do not use
those scores as dataset accuracy. Each run gets a separate timestamped directory;
an explicitly chosen output directory must be empty. This version starts fresh
on each run and does not resume an interrupted optimizer state.

## Train only a few dishes

Use `--classes` followed by folder IDs from `class_labels.csv` to train a
smaller experiment. Other image folders can stay in place; only the selected
classes are loaded in training, validation, and testing.

| Folder ID | Dish | Thai name |
| --- | --- | --- |
| `86` | Khao Man Kai | ข้าวมันไก่ |
| `51` | Phat Kaprao | ผัดกะเพรา |
| `55` | Khao Kha Mu | ข้าวขาหมู |

```powershell
# Check only these three dishes, then run a shorter five-epoch experiment.
.\.venv\Scripts\python.exe validate_data.py --classes 86 51 55
.\.venv\Scripts\python.exe train.py --device cuda --classes 86 51 55 --epochs 5 --batch-size 32
```

The five epochs include two head-warmup epochs and three fine-tuning epochs.
This is a starting experiment; use validation loss and top-1 accuracy to decide
whether it needs more training. Fewer selected photos reduce work per epoch;
the EfficientNet-B0 backbone remains the same size.

Select at least two distinct folder IDs, preserving leading zeros (e.g. `00`).
The code rejects unknown IDs. Outputs are renumbered consecutively in CSV order,
and the original IDs and dish names are saved with the checkpoint. Prediction
automatically uses that saved mapping. Leave out `--classes` to train all dishes.

A three-class model only distinguishes these three dishes. It cannot recognize
other foods as separate categories. Its top-3 accuracy is always 100% on these
three-class splits, so use **top-1 accuracy and per-dish scores** to judge it.

## Outputs and prediction

Each run writes into `artifacts/<timestamp>/`:

| File | Contents |
| --- | --- |
| `best.pt` | Best model weights, bilingual labels, preprocessing, best epoch |
| `labels.json` | Output index → original folder ID, English name, Thai name |
| `config.json` | Options, seed, versions, preprocessing, per-class split counts |
| `history.json` | Training/validation loss, top-1 and top-3 accuracy by epoch |
| `test_metrics.json` | Test accuracy, macro F1, precision/recall/F1 per dish |
| `confusion_matrix.csv` | Actual class in each row, predicted class in each column |

Use the checkpoint path printed by training:

```powershell
.\.venv\Scripts\python.exe predict.py "C:\path\to\meal.jpg" --checkpoint "artifacts\YOUR_RUN\best.pt" --top-k 3
```

The result is JSON with `index`, `directory`, `english`, `thai`, and
`probability` for each suggestion. Inference loads the architecture without
downloading pretrained weights. These probabilities are model scores, not
calibrated guarantees. Unfamiliar food or non-food images can still receive high
scores; keep confirmation, manual search, and “none of these” in the app.
Nutrition and portion estimation need separate data and user input.

## Google Colab alternative

Copy this entire folder (including the images) to Google Drive, enable a GPU
runtime in Colab, then run the following cells. Adjust the path to your folder:

```python
from google.colab import drive
drive.mount('/content/drive')
```

```python
%cd /content/drive/MyDrive/ThaiFoodModel
%pip install -r requirements.txt
!python validate_data.py
!python train.py --device cuda --workers 2 --epochs 15 --batch-size 32
```

Drive can be slow for many small files; copying the dataset to `/content` can
improve loading speed. If you do that, use `--data-dir /content/ThaiFoodModel`
and keep `--output-dir` in Drive to retain checkpoints when the runtime ends.
Avoid repeatedly choosing model changes based on test scores; use validation
for development and reserve new meals/restaurants for a real-world evaluation.
The optional duplicate check catches byte-identical copies; it cannot establish
that near-duplicate photos or the same restaurant session stay within one split.

## Code checks

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The tests cover CSV mapping, invalid splits, metrics, and a tiny offline
training → checkpoint → prediction round trip. They do not measure model quality.

---

# THFOOD-100 Thai Food Image Dataset
Dataset of Thai food images for the food recognition task
https://github.com/NawanolT/THFOOD-100

THFOOD-100 is a dataset of Thai food images for the food recognition task. It contains 53,459 images organized into 100 classes. Each image has a single label corresponding to the dish's name. The images were taken by users and manually labeled by domain experts. Only images of restaurant-prepared food are included, and stringent criteria are imposed to ensure high image quality and accurate labels.

## Citation
If you use this dataset in your work, please appropriately cite our work.

N. Theera-Ampornpunt and P. Treepong, "Thai Food Recognition using Deep Learning with Cyclical Learning Rates," IEEE Access, vol. 12, pp. 174204-174221, 2024, doi: 10.1109/ACCESS.2024.3503672.
```bibtex
@article{theera2024thai,
  title={Thai Food Recognition using Deep Learning with Cyclical Learning Rates},
  author={Theera-Ampornpunt, Nawanol and Treepong, Panisa},
  journal={IEEE Access},
  volume={12},
  year={2024},
  pages={174204--174221},
  publisher={IEEE},
  doi={10.1109/ACCESS.2024.3503672}
}
```

## License
The dataset is provided for non-commercial research and educational use only.
