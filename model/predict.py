"""
predict.py - Loads the trained sentiment_model.joblib and predicts sentiment
for new journal-style text. Used to demo the from-scratch-trained model
separately from the Claude/Ollama-based sentiment.js pipeline.

Usage:
    python3 predict.py "Today I felt really proud of myself"
    python3 predict.py   (no args -> runs a few built-in demo examples)
"""

import sys
import joblib

MODEL_PATH = "sentiment_model.joblib"

DEMO_EXAMPLES = [
    "I finally got some good news today and I feel so relieved",
    "Just did chores and ran errands, nothing special happened",
    "I've been feeling really anxious and overwhelmed lately",
]

def predict(pipeline, text):
    pred = pipeline.predict([text])[0]
    proba = pipeline.predict_proba([text])[0]
    classes = pipeline.classes_
    confidence = dict(zip(classes, proba))
    return pred, confidence

def main():
    pipeline = joblib.load(MODEL_PATH)

    texts = sys.argv[1:] if len(sys.argv) > 1 else DEMO_EXAMPLES

    for text in texts:
        pred, confidence = predict(pipeline, text)
        print(f"\nText: {text!r}")
        print(f"Predicted sentiment: {pred}")
        print("Confidence breakdown:")
        for label, score in sorted(confidence.items(), key=lambda x: -x[1]):
            print(f"  {label:10s} {score:.2f}")

if __name__ == "__main__":
    main()
