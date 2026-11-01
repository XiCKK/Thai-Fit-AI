# ThaiFit AI 🍛

**A Thai-first fitness app that helps people track meals, starting with Thai food recognition.**

I'm building ThaiFit AI to connect food recognition with a practical meal-tracking experience. The idea is simple: take a photo of a Thai meal, review the suggested dish, adjust the ingredients and portions, and see an estimated nutrition breakdown.

The mobile prototype currently runs under the name **JungNub Macro**.

> 🚧 Work in progress — the trained model is connected to the mobile app through a local inference API. Physical-phone testing and nutrition data validation are the next steps.

## Why this project?

Thai dishes can vary widely between recipes, restaurants, and serving sizes. A dish name alone doesn't tell the whole nutritional story.

With this project, I'm exploring how image classification can make food logging easier while keeping the user involved in confirming what they actually ate. Longer term, I want to bring meal tracking and workout logging together in one app.

## How it works

```text
Take or select a meal photo
           ↓
Preview the photo
           ↓
Get up to three dish suggestions
           ↓
Confirm a dish or search manually
           ↓
Adjust ingredients and portions
           ↓
View estimated nutrition
```

## What's working now

- **Meal photo capture and selection** with preview and retake/replace controls.
- **Real model inference** through a Python FastAPI backend.
- **Up to three dish suggestions** with Thai and English labels.
- **Manual dish search** when none of the suggestions match.
- **Editable ingredients and portions** before confirming a meal.
- **Estimated calories, protein, carbohydrates, and fat** from separate recipe records.
- **Loading, timeout, retry, and connection-error states.**
- **Clearly labeled demo mode** for exploring the prototype screens.

## Food recognition

The current model uses **PyTorch and torchvision EfficientNet-B0**, trained on a four-class subset of THFOOD-100.

| Dish | Thai name |
| --- | --- |
| Phat Kaprao | ผัดกะเพรา |
| Khao Kha Mu | ข้าวขาหมู |
| Phat Thai | ผัดไทย |
| Khao Man Kai | ข้าวมันไก่ |

The backend loads the trained checkpoint once at startup and supports CPU inference. It uses the saved class order and the same evaluation preprocessing as the training pipeline.

Manual search includes the original dataset's 100 dish labels. **The current image classifier recognizes only the four dishes listed above.**

## What I'm working on

The project has moved from a UI prototype with mock results to an app connected to a trained model. My current focus is testing the full photo-to-prediction flow on a physical phone and improving the nutrition records behind the estimates.

### Roadmap

- [x] Build the React Native + Expo mobile prototype
- [x] Train an initial Thai food classifier
- [x] Create a FastAPI inference backend
- [x] Connect real predictions to the mobile app
- [x] Add dish confirmation and manual search
- [x] Separate nutrition calculations from food recognition
- [ ] Test the complete flow on physical Android and iOS devices
- [ ] Replace draft nutrition values with verified food-composition data
- [ ] Evaluate recognition on new meal photos
- [ ] Save meal history and daily nutrition totals
- [ ] Add workout logging
- [ ] Expand food coverage after further evaluation

## Tech stack

| Area | Technologies |
| --- | --- |
| Mobile app | React Native, Expo, TypeScript |
| Inference API | Python, FastAPI, Uvicorn |
| Machine learning | PyTorch, torchvision, EfficientNet-B0 |
| Image processing | Pillow, pillow-heif |
| Checks | Python unittest, Node.js test runner, TypeScript |

## Project structure

```text
Thai-Fit-AI/
├── Mobile/          # Expo mobile app, API client, and nutrition UI
├── ThaiFoodModel/   # Training pipeline, model inference, and FastAPI backend
├── docs/
│   └── SETUP.md     # Installation, local networking, and testing guide
└── README.md
```

## Running the project

The app currently uses a backend running on a computer on the same local network as the phone.

See the **[setup and testing guide](docs/SETUP.md)** for dependency installation, backend and Expo startup commands, Windows firewall configuration, and physical-phone testing.

For model training and dataset details, see **[ThaiFoodModel](ThaiFoodModel/README.md)**.

## Progress checks

The integration has passed:

- 14 Python tests covering the model pipeline and inference API.
- 8 mobile service tests covering API handling, nutrition arithmetic, and label mapping.
- TypeScript checks and Android/iOS bundle exports.
- Local HTTP inference checks using four existing food images.

These checks verify the integration, rather than real-world recognition accuracy. One of the four sample images had the correct dish ranked second, which is why user confirmation remains part of the flow. Physical-device testing is still pending.

## Current limitations

- The classifier can give unfamiliar foods high scores; model scores are not guarantees of correctness.
- Nutrition values are **draft recipe estimates** that still need validation.
- The model does not measure food weight, hidden oil, ingredients, or calories from a photo.
- Meal history, daily totals, and workout tracking are planned features.

## Dataset acknowledgment

This project uses a subset of **THFOOD-100** for Thai food recognition. Dataset attribution and its non-commercial research and educational usage terms are documented in the [model README](ThaiFoodModel/README.md#thfood-100-thai-food-image-dataset).

