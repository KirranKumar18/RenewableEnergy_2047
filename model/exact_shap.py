"""
Exact SHAP values with an independent (interventional) masker, in plain numpy.

Gives the same numbers as shap.Explainer(f, shap.maskers.Independent(bg), algorithm="exact") but without the
shap/numba/llvmlite dependency, so the API fits in a small serverless bundle. With d features it evaluates the
model on every one of the 2^d coalitions, each averaged over the background rows.
"""
from __future__ import annotations

from math import factorial

import numpy as np


class ExactShap:
    def __init__(self, f, background):
        """f maps an (n, d) feature matrix to (n, k) outputs; background is an (m, d) matrix."""
        self.f = f
        self.bg = np.asarray(background, float)
        self.d = d = self.bg.shape[1]
        idx = np.arange(2 ** d)
        self.masks = ((idx[:, None] >> np.arange(d)) & 1).astype(bool)        # coalition i <-> bit pattern of i
        sizes = self.masks.sum(1)
        self.weights = np.array([factorial(s) * factorial(d - s - 1) / factorial(d) if s < d else 0.0 for s in sizes])
        self.base = np.asarray(f(self.bg), float).mean(0)                     # E[f(X)] over the background

    def __call__(self, X):
        """Returns (values, base): values (n, d, k) per feature and output, base (n, k)."""
        X = np.atleast_2d(np.asarray(X, float))
        M, B, d = self.masks, self.bg, self.d
        idx = np.arange(len(M))
        out = []
        for x in X:
            Z = np.where(M[:, None, :], x[None, None, :], B[None, :, :])        # (2^d, m, d)
            v = np.asarray(self.f(Z.reshape(-1, d)), float).reshape(len(M), len(B), -1).mean(1)  # (2^d, k)
            phi = np.empty((d, v.shape[1]))
            for i in range(d):
                S = idx[~M[:, i]]                                              # coalitions without feature i
                phi[i] = (self.weights[S][:, None] * (v[S | (1 << i)] - v[S])).sum(0)
            out.append(phi)
        return np.array(out), np.tile(self.base, (len(X), 1))
