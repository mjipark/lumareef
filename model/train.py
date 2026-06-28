"""
train.py - Trains a lightweight sentiment classifier on hand-labeled
journal-style entries for the LumaReef project.

Pipeline: TF-IDF vectorizer -> Logistic Regression (multiclass: positive/neutral/negative)

This is intentionally a small, classical ML model (not a neural net / LLM).
It's meant as a from-scratch-trained complement to the Claude/Ollama-based
sentiment analysis already used in sentiment.js, not a replacement for it --
115 hand-written examples is enough to demonstrate a real training pipeline,
not enough to outperform an LLM on open-ended journal text.

Usage:
    python3 train.py
Outputs:
    sentiment_model.joblib   - the trained pipeline (vectorizer + classifier bundled)
    training_report.txt      - accuracy + classification report on the held-out test split
"""

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

DATA_PATH = "journal_dataset.csv"
MODEL_OUT = "sentiment_model.joblib"
REPORT_OUT = "training_report.txt"
RANDOM_STATE = 42

def main():
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} labeled examples")
    print(df["sentiment"].value_counts())

    X = df["text"]
    y = df["sentiment"]

    # Stratified split keeps class proportions consistent between train/test
    # even with a small dataset like this.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    # Pipeline bundles the vectorizer + classifier into one object so we only
    # need to save/load a single file and never have to remember to apply
    # the same vectorizer manually at inference time.
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),   # unigrams + bigrams ("really good", "so stressed")
            min_df=1,
            max_features=2000,
            stop_words="english"
        )),
        ("clf", LogisticRegression(
            max_iter=1000,
            class_weight="balanced",  # guards against the slight class imbalance
            random_state=RANDOM_STATE
        ))
    ])

    print("\nTraining...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred)

    print(f"\nTest accuracy: {acc:.3f}")
    print(report)

    joblib.dump(pipeline, MODEL_OUT)
    print(f"\nSaved trained model to {MODEL_OUT}")

    with open(REPORT_OUT, "w") as f:
        f.write(f"Test accuracy: {acc:.3f}\n\n")
        f.write(report)
        f.write(f"\nTrain size: {len(X_train)}, Test size: {len(X_test)}\n")
    print(f"Saved training report to {REPORT_OUT}")

if __name__ == "__main__":
    main()
