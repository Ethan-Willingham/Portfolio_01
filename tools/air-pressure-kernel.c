/* Numeric kernels for the existing air-pressure MGPCG operator.
 * Arrays contain IEEE float64 values; pointers are byte offsets in WASM memory.
 * Compile without fast math or floating-point contraction. No runtime imports.
 */

void apply(int w, int h, const double *r, const double *t,
           const double *l, const double *b, const double *d,
           const double *x, double *out) {
    for (int y = 0; y < h; ++y) {
        for (int k = 0; k < w; ++k) {
            int i = y * w + k;
            out[i] = d[i] * x[i]
                - (k + 1 < w ? r[i] * x[i + 1] : 0.0)
                - (y + 1 < h ? t[i] * x[i + w] : 0.0)
                - (k ? l[i] * x[i - 1] : 0.0)
                - (y ? b[i] * x[i - w] : 0.0);
        }
    }
}

void smooth(int w, int h, const double *r, const double *t,
            const double *l, const double *b, const double *d,
            double *x, const double *rhs, int reverse) {
    for (int phase = 0; phase < 2; ++phase) {
        for (int y = 0; y < h; ++y) {
            int first = ((reverse ? 1 - phase : phase) + y) % 2;
            for (int k = first; k < w; k += 2) {
                int i = y * w + k;
                x[i] = d[i] > 0.0
                    ? (rhs[i]
                       + (k + 1 < w ? r[i] * x[i + 1] : 0.0)
                       + (y + 1 < h ? t[i] * x[i + w] : 0.0)
                       + (k ? l[i] * x[i - 1] : 0.0)
                       + (y ? b[i] * x[i - w] : 0.0)) / d[i]
                    : 0.0;
            }
        }
    }
}

void restrictResidual(int w, int h, int nw, int nh,
                      const double *rhs, const double *applied,
                      double *next_rhs) {
    for (int y = 0; y < nh; ++y) {
        for (int x = 0; x < nw; ++x) {
            int bx = x * 2, by = y * 2;
            double sum = 0.0;
            for (int yy = 0; yy < 2; ++yy) {
                for (int xx = 0; xx < 2; ++xx) {
                    if (bx + xx < w && by + yy < h) {
                        int i = (by + yy) * w + bx + xx;
                        sum += rhs[i] - applied[i];
                    }
                }
            }
            next_rhs[y * nw + x] = sum * 0.25;
        }
    }
}

void prolong(int w, int h, int nw, double *x,
             const double *next_x, const double *diag) {
    for (int y = 0; y < h; ++y) {
        for (int k = 0; k < w; ++k) {
            int i = y * w + k;
            if (diag[i] > 0.0) {
                x[i] += next_x[(y / 2) * nw + k / 2];
            }
        }
    }
}

double norm(int count, const double *x) {
    double maximum = 0.0;
    for (int i = 0; i < count; ++i) {
        double value = x[i] < 0.0 ? -x[i] : x[i];
        if (value != value) return value;
        if (value > maximum) maximum = value;
    }
    return maximum;
}

double dot(int count, const double *x, const double *y) {
    double sum = 0.0;
    for (int i = 0; i < count; ++i) sum += x[i] * y[i];
    return sum;
}

void updateXR(int count, double *x, double *residual,
              const double *direction, const double *applied, double alpha) {
    for (int i = 0; i < count; ++i) {
        x[i] += alpha * direction[i];
        residual[i] -= alpha * applied[i];
    }
}

void updateP(int count, double *p, const double *z, double beta) {
    for (int i = 0; i < count; ++i) p[i] = z[i] + beta * p[i];
}

void residual(int count, const double *rhs, const double *applied, double *r) {
    for (int i = 0; i < count; ++i) r[i] = rhs[i] - applied[i];
}

void scale(int count, double *x, double value) {
    for (int i = 0; i < count; ++i) x[i] *= value;
}
