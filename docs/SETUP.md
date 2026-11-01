# ThaiFit AI / JungNub Macro

Current stage: **trained-model inference connected to the Expo mobile prototype**.
Updated 1 November 2026.

Choose or take a meal photo → preview → analyze with the existing model →
select a suggested dish (or reject all and search manually) → review ingredients
and portions → confirm → see estimated nutrition.

The existing training scripts, dataset, checkpoint and original exported mobile
files are retained. No replacement model was trained. The existing pipeline tests
do run tiny synthetic training fixtures in temporary folders; they do not change
your trained checkpoint. Meal-history storage and workout tracking remain future
work.

## Project structure

```text
Thai-Fit-AI/
  Mobile/                          Existing Expo + React Native + TypeScript app
    App.tsx                        Photo, loading, retry and result flow
    .env.example                   Public backend address template
    src/services/recognitionApi.ts Typed multipart API client, 30-second timeout
    src/services/mockRecognitionService.ts  Explicit demo mode only
    src/screens/                   Existing screens updated for real inference
    src/data/dishes.json           100 manual-search labels exported from CSV
    src/data/nutritionRecords.ts   Separate, editable draft recipe records
    src/utils/nutrition.ts         Ingredient/portion arithmetic only
    tests/integration.test.cjs     API client and nutrition checks
  ThaiFoodModel/
    model.py                       Existing architecture and image preprocessing
    data.py, train.py, predict.py   Existing label, training and CLI inference code
    class_labels.csv               Original THFOOD-100 IDs and bilingual names
    artifacts/20261101-152629-882861/
      best.pt                      Existing trained checkpoint
      labels.json, config.json     Saved output order and training settings
    inference.py                   Validated checkpoint loader and top-3 inference
    api.py                         FastAPI /predict, /health and /docs
    requirements-api.txt           API dependencies, including existing model deps
    export_dish_catalog.py          Refresh offline mobile search labels
    tests/                         Existing pipeline checks plus real-model API tests
```

No AGENTS.md repository instructions or existing inference API were found.
The app uses its existing Expo 58 / React Native 0.88 / TypeScript setup.

## Exact model contract

The architecture was established from `model.py`, `train.py`, and the actual
checkpoint, not selected as a new architecture:

- PyTorch / torchvision EfficientNet-B0 with a four-output linear classifier.
- Checkpoint format version 1: dictionary with `model_state_dict`, `labels`,
  `architecture`, `preprocessing`, epoch and validation metadata.
- Checkpoint: `ThaiFoodModel/artifacts/20261101-152629-882861/best.pt`,
  best epoch 5, `partial_debug_run=false`.
- Version: `efficientnet_b0-07459e85d696`, derived from the checkpoint SHA-256.
- Full SHA-256: `07459e85d696741886426bedf992bc4158adce15c900361f62447c7400371d08`.

| Output index | Stable dish ID | Thai label | English label |
| --- | --- | --- | --- |
| 0 | 51 | ผัดกะเพรา | Phat Kaprao |
| 1 | 55 | ข้าวขาหมู | Khao Kha Mu |
| 2 | 83 | ผัดไทย | Phat Thai |
| 3 | 86 | ข้าวมันไก่ | Khao Man Kai |

Startup checks the checkpoint labels against the CSV subset in training order,
the adjacent `labels.json` if present, and the classifier's output dimensions.
It strictly restores the state dictionary without downloading pretrained weights.
Incompatible metadata or partial-debug checkpoints stop startup.

Inference calls the original evaluation preprocessing:

1. Open the image, apply EXIF orientation, convert to RGB.
2. Bicubic resize of the shorter side to 256 pixels, preserving aspect ratio.
3. Center crop to 224 × 224.
4. Convert pixels to a tensor in 0–1.
5. Normalize RGB using mean `[0.485, 0.456, 0.406]` and standard deviation
   `[0.229, 0.224, 0.225]`.

Random training augmentation is not used for inference. The model loads once per
server process during startup, runs in `eval()` and `torch.inference_mode()`,
and defaults to CPU. Run one server worker to keep one model copy.
HEIC support is supplied by Pillow HEIF; decoded photos follow the same RGB path.

## Start the backend on Windows

Open PowerShell:

```powershell
Set-Location C:\Users\supha\Thai-Fit-AI\ThaiFoodModel

# Reuse the existing environment. Only create it if .venv is absent:
# py -3.12 -m venv .venv

.\.venv\Scripts\python.exe -m pip install -r requirements-api.txt
.\.venv\Scripts\python.exe -m uvicorn api:app --host 0.0.0.0 --port 8000
```

Wait for “Application startup complete”. Keep this terminal open. On the computer,
open [health](http://127.0.0.1:8000/health) or
[interactive API docs](http://127.0.0.1:8000/docs).
The health response should report CPU, four classes, and the model version above.

The default checkpoint path is resolved from the source folder, so it does not
depend on the terminal's working directory. To deliberately choose another
compatible checkpoint, set this **before** starting the server:

```powershell
$env:THAIFIT_CHECKPOINT = "C:\path\to\your\best.pt"
$env:THAIFIT_DEVICE = "cpu"
```

Restart the server after changing its settings. Checkpoints and datasets stay
local and are ignored by the existing model-folder .gitignore. If copying this
project to another computer, copy the trained checkpoint and its labels alongside
the code. You do not need the image dataset to serve predictions.

## Connect a physical phone

1. Connect the phone and computer to the same trusted Wi-Fi network. Avoid a
   guest network that isolates devices. Set this Windows network to **Private**.
2. Run `ipconfig` in PowerShell. Find the **IPv4 Address** under the active Wi-Fi
   adapter, for example `192.168.1.100`. Use your actual address.
3. In a second terminal, prepare the mobile app:

```powershell
Set-Location C:\Users\supha\Thai-Fit-AI\Mobile
npm ci
Copy-Item .env.example .env
notepad .env
```

Set the file to your computer's address, for example:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

Use this address from the phone. `localhost` or `127.0.0.1` on a phone means the
phone itself; `0.0.0.0` is the server's listening address, not a destination.
If the computer's IP changes, update .env and restart Expo.

4. If Windows Firewall blocks the connection, open a separate PowerShell **as
   Administrator** and add rules scoped to the Private local network:

```powershell
New-NetFirewallRule -DisplayName "ThaiFit API 8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -Profile Private -RemoteAddress LocalSubnet
New-NetFirewallRule -DisplayName "ThaiFit Expo 8081" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -Profile Private -RemoteAddress LocalSubnet
```

These commands are instructions for you; no firewall rules were changed during
implementation. If Expo selects a different port, allow that port instead of
8081. Do not disable the whole firewall.

5. On the phone browser, open `http://YOUR_COMPUTER_IP:8000/health`. Confirm this
   works before opening the app. If it fails, check the IP, server terminal,
   Private network profile, firewall, VPN and Wi-Fi device isolation.
6. Start Expo from the mobile terminal:

```powershell
npx expo start --lan --clear
```

Install an Expo Go version compatible with SDK 58, scan the QR code, and grant
camera/photo permissions. On iOS, allow Local Network access when asked.
An Expo tunnel only tunnels Expo's development server; it does not automatically
expose this Python API. The phone must still reach the configured backend.

This setup targets native Expo Go on a trusted LAN. Standalone Android/iOS builds,
app-store signing, HTTPS hosting and browser/CORS support have not been configured
or tested. Use an authenticated HTTPS backend for a public deployment. No API key
or secret is required by this local server. EXPO_PUBLIC_ values are visible in the
app bundle and must never contain secrets.

## API

`POST /predict` accepts multipart form field **file** with one still image.
It returns one to three candidates, sorted by descending softmax model score.
Scores are over all four model classes; the returned top three need not sum to 1.
They are not calibrated accuracy guarantees.

The following is an actual CPU response for
`ThaiFoodModel/test/51/R0134_00001.jpg`:

```json
{
  "model_version": "efficientnet_b0-07459e85d696",
  "candidates": [
    { "dish_id": "51", "label_th": "ผัดกะเพรา", "label_en": "Phat Kaprao", "score": 0.9984049201011658 },
    { "dish_id": "55", "label_th": "ข้าวขาหมู", "label_en": "Khao Kha Mu", "score": 0.0008407523855566978 },
    { "dish_id": "83", "label_th": "ผัดไทย", "label_en": "Phat Thai", "score": 0.0003838829870801419 }
  ]
}
```

Test from PowerShell (use curl.exe, not PowerShell's curl alias):

```powershell
curl.exe -F "file=@C:\Users\supha\Thai-Fit-AI\ThaiFoodModel\test\51\R0134_00001.jpg" http://127.0.0.1:8000/predict
```

Accepted formats: JPEG, PNG, WebP, BMP, HEIC/HEIF; maximum 10 MiB and 25 million
decoded pixels. Animated images are rejected. The server validates decoded
content, not just the supplied extension.

| Status | Meaning |
| --- | --- |
| 400 | Empty, corrupt or unreadable image |
| 413 | File or decoded image exceeds the limit |
| 415 | Unsupported media type, format or animation |
| 422 | Missing multipart file field |
| 500 | Inference failed; clear error, no fabricated results |

Images are processed for the request and are not saved to an application photo
library. UploadFile may temporarily spool uploads to the computer's temporary
directory and closes the temporary file when the request finishes.
`GET /health` reports readiness, device, class count and model version.

## Confirmation, manual search and mock mode

- The normal analyze button always calls the Python API. There is no automatic
  fallback to mock data.
- Photo preview, retake/replace, loading, a 30-second request timeout, retry of
  the same photo and connection errors are available.
- Leaving the loading screen prevents a late response from replacing the newer
  screen. The request may finish in the background until its timeout.
- No dish is automatically confirmed. Choose a candidate, review its ingredients
  and portions, then tap the confirmation button to show nutrition.
- “None of these” opens offline search over the original 100 CSV dish labels.
  Search also works from Home and API-error screens without a server.
- The model recognizes only four classes. Manual search having 100 labels does
  not make this a 100-class recognition model.
- A four-class classifier can give unfamiliar foods or non-food photos high
  scores. It does not reliably detect unknown food. There is no score threshold
  pretending to solve this.
- Home's separate **MOCK** buttons demonstrate success, error and no-candidate
  states. All screens in that flow label the mode. The empty-result demo does
  not imply that the real classifier detects unsupported food.

To refresh manual labels after a deliberate CSV change:

```powershell
Set-Location C:\Users\supha\Thai-Fit-AI\ThaiFoodModel
.\.venv\Scripts\python.exe export_dish_catalog.py
```

## Nutrition is separate from recognition

Stable dish IDs map to recipe records in `Mobile/src/data/nutritionRecords.ts`.
The four model dishes have **draft estimates**, not validated nutrition records.
Rice, pork, oil and egg inputs preserve the earlier prototype's values; additional
chicken, noodle, sauce and vegetable values are explicit draft assumptions.
No authoritative nutrition dataset was supplied or imported.

Users can add/remove ingredients, choose a different available protein, adjust
ingredient units and set servings. For example, 1.25 × 100 grams means 125 grams.
The amounts describe one recipe serving; the serving multiplier describes how
much of that recipe the user ate. Nutrition is hidden until confirmation and
hidden again after edits until reconfirmed.

A manually selected dish without a recipe has no fallback recipe: add ingredients
before calculating. The small ingredient library does not cover every recipe.
Replace the draft ingredient values and dish recipes with your chosen verified
food-composition data to make the estimates dependable. It is maintained in one
plain TypeScript data file.

`calculateNutrition` uses only ingredient nutrition, user-entered amounts and
servings. The classifier does not measure food weight, ingredients, hidden oil,
or calories. Restaurant recipes and actual portions can vary substantially.
The original prototype's shared pork assumption is no longer applied to chicken
or noodle recipes.

## Checks and current verification

Run the checks:

```powershell
Set-Location C:\Users\supha\Thai-Fit-AI\ThaiFoodModel
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check

Set-Location C:\Users\supha\Thai-Fit-AI\Mobile
npm run typecheck
npm test
npx expo export --platform android --platform ios --output-dir .expo/integration-check --max-workers 2
```

Verified on this Windows computer on 1 November 2026:

- **13 Python tests passed:** existing pipeline tests plus real-checkpoint API
  tests, strict class/metadata checks, load-once/eval/CPU checks, parity with the
  original prediction CLI, errors, EXIF/RGB/grayscale/alpha and generated HEIC.
- **8 mobile tests passed:** multipart request contract, URL/error handling,
  timeout abort, response validation, nutrition calculations, exact CSV catalog,
  local-file validation and the installed Expo multipart serializer.
  These are service-level tests, not tests on a native phone.
- **TypeScript check passed.**
- **Android and iOS Expo production bundles exported successfully**, using a
  separate .expo output folder; the pre-existing dist folder was retained.
- **pip check passed** with no broken requirements.
- **Actual Uvicorn HTTP smoke check passed** on localhost: health, docs, four real
  sample uploads (HTTP 200), and invalid-image rejection (HTTP 400).
- Checkpoint SHA-256 matches the version above.

Real HTTP sample results, using the first filename in each listed test folder:

| Sample | Dataset label ID | Top candidate ID | Top model score |
| --- | --- | --- | --- |
| test/51/R0134_00001.jpg | 51 | 51 | 0.998405 |
| test/55/R0066_00001.jpg | 55 | 86 | 0.761377 |
| test/83/R0037_00001.jpg | 83 | 83 | 0.995140 |
| test/86/R0152_00001.jpg | 86 | 86 | 0.999596 |

The second sample was misclassified at rank one (correct ID 55 was rank two).
These four integration samples do not establish model accuracy. Confirmation
and manual correction remain necessary.

The installed Starlette test client emits an httpx deprecation warning; the tests
pass and the running API is unaffected.

**Still unverified / setup for you:** configure Mobile/.env with your actual
computer IP; allow the scoped firewall ports if needed; test Expo Go on your
physical Android/iPhone, camera/library permissions, LAN access, real phone HEIC
photos, retry after stopping the server, and recipe/portion edits. No device was
connected, no firewall rules were changed, and no new real-world accuracy or
nutrition validation was performed. Automated HEIC checks use a generated image.
The temporary HTTP smoke-test server is stopped after verification; start the
backend with the command above when using the app.

Tested environment: Python 3.12.14, torch 2.14.1+cu126, torchvision 0.29.1+cu126,
Pillow 12.3.0, FastAPI 0.162.0, Uvicorn 0.54.0, pillow-heif 1.8.1,
Expo 58.0.21, React Native 0.88.1. CPU inference works with this existing CUDA-capable
PyTorch installation; CUDA is not required for serving.

## Official setup references

- [FastAPI startup/lifespan model loading](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI multipart uploads](https://fastapi.tiangolo.com/tutorial/request-files/)
- [Expo public environment variables](https://docs.expo.dev/guides/environment-variables/)
- [Expo image picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Windows firewall rule parameters](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule)
- Dataset attribution and usage terms remain in [ThaiFoodModel/README.md](../ThaiFoodModel/README.md).


### Expo 58 photo-upload compatibility

The API client appends an `expo-file-system` File directly to FormData and sends
it with `expo/fetch`, following the [Expo file-upload guide](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/).
Expo 58 rejects URI-only descriptors with 'Unsupported FormDataPart implementation'.
React Native also cannot construct a Blob from ArrayBuffer/typed-array contents.
Passing the File directly avoids both incompatible conversions.

On 2 November 2026, TypeScript and all eight mobile service tests passed. The
upload regression test uses the installed Expo FormData patch and multipart
serializer with a File substitute and a Blob constructor that rejects byte arrays.
This verifies serialization in a simulated runtime; physical-phone upload still
needs verification.

Run `npm ci` after updating dependencies and restart Expo with
`npx expo start --lan --clear` before retrying on your phone.

### Phone JPEGs containing auxiliary images

On 2 November 2026, backend validation was updated to accept JPEG photos that
Pillow identifies as MPO (Multi-Picture Object). Only the primary photo is used,
with the same EXIF, RGB and evaluation preprocessing as the existing model.
Animated WebP and other unsupported formats remain rejected. Format errors now
include the detected format to help diagnose other files. Restart the Python
backend after updating. The regression check uses a generated multi-image JPEG;
the user's original phone image has not been inspected.
