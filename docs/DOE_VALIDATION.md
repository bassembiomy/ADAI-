# DOE Validation and Canonical Model Specification

## 1. Overview and Core Philosophy

This document defines the mathematical models, numerical tolerances, serialization schemas, visualization contracts, and execution runtimes for the Design of Experiments (DOE) module in ADIA.

### Core Principles
1. **Separation of Presentation and Math**: The UI layer formats equations for human readability (e.g. Unicode exponents $X_1^2$, multiplication symbols), but simulation consumers (**X-Bridges** and **V-Lab**) evaluate structured coefficients, layers, and level response tables directly from `DOEDeploymentModel`.
2. **Deterministic Validation**: Every model fit computes diagnostics for degree of freedom, rank-deficiency, and numerical stability. Non-finite values are never silently substituted with zero.
3. **Structured Deployment Payload**:
   - `schemaVersion: 1`
   - Preserves ordered factor names (`factorOrder`), response name, factor ranges, training row counts, and fit metrics ($R^2$, adjusted $R^2$, RMSE).
   - Discriminated union for `RSM`, `GMDH`, and `Taguchi`.

---

## 2. Canonical Model Formulations

### 2.1 Response Surface Methodology (RSM)
Full quadratic response surface model for $k$ continuous factors:

$$\hat{y}(\mathbf{x}) = \beta_0 + \sum_{i=1}^k \beta_i x_i + \sum_{i=1}^k \beta_{ii} x_i^2 + \sum_{i=1}^{k-1} \sum_{j=i+1}^k \beta_{ij} x_i x_j$$

- **Least Squares Solution**: $\mathbf{\beta} = (\mathbf{X}^T \mathbf{X})^{-1} \mathbf{X}^T \mathbf{y}$
- **Rank & Degrees of Freedom**:
  - Requires $N \ge p$, where $p = 1 + 2k + \frac{k(k-1)}{2}$.
  - If $\det(\mathbf{X}^T \mathbf{X}) \approx 0$ or condition number exceeds $10^{12}$, rank deficiency diagnostic `RANK_DEFICIENT_DESIGN` is emitted.
- **Tolerances**:
  - Analytical coefficient tolerance: $\epsilon \le 10^{-6}$ against known standard fixtures.
  - Residual sum of squares tolerance: $|SS_{res} - \sum (y_i - \hat{y}_i)^2| \le 10^{-7}$.

### 2.2 Group Method of Data Handling (GMDH)
Iterative polynomial network using Ivakhnenko's polynomial neurons:

$$y = a_0 + a_1 x_i + a_2 x_j + a_3 x_i^2 + a_4 x_j^2 + a_5 x_i x_j$$

- **Layers**: Successive layers combine top performing neuron outputs from the preceding layer.
- **Evaluation**: Forward propagation through evaluated layers using deterministic coefficient vectors per neuron.
- **Tolerances**:
  - Evaluation parity between DOE engine and X-Bridges/V-Lab execution: $\epsilon \le 10^{-9}$.

### 2.3 Taguchi Analysis
Orthogonal array analysis based on factor level means and Signal-to-Noise Ratio (SNR):

$$\bar{y}_i = \frac{1}{n_i} \sum_{k=1}^{n_i} y_{ik}$$
$$\hat{y}(\mathbf{x}) = \bar{y}_{grand} + \sum_{j=1}^k \left( \bar{y}_{j, level(x_j)} - \bar{y}_{grand} \right)$$

- **SNR Metrics**:
  - **Larger is Better (LTB)**: $\text{SNR} = -10 \log_{10}\left( \frac{1}{n} \sum \frac{1}{y^2} \right)$
  - **Smaller is Better (STB)**: $\text{SNR} = -10 \log_{10}\left( \frac{1}{n} \sum y^2 \right)$
  - **Nominal is Best (NTB)**: $\text{SNR} = 10 \log_{10}\left( \frac{\bar{y}^2}{s^2} \right)$
- **Evaluation**: Inputs are mapped to the nearest calibrated factor level to look up level effect $\Delta \bar{y}_j$.

---

## 3. Deployment Serialization Schema

```typescript
export interface BaseDeploymentModel {
  schemaVersion: 1;
  factorOrder: string[];
  responseName: string;
  trainingRowCount: number;
  metrics: DOEMetricSummary;
  factorRanges?: Record<string, { min: number; max: number }>;
}

export type DOEDeploymentModel = 
  | (BaseDeploymentModel & { modelType: 'RSM'; rsm: RSMDeployment })
  | (BaseDeploymentModel & { modelType: 'GMDH'; gmdh: GMDHDeployment })
  | (BaseDeploymentModel & { modelType: 'Taguchi'; taguchi: TaguchiDeployment });
```

---

## 4. Integration Factories & Port Mapping

1. **X-Bridges Block (`DOE_MODEL`)**:
   - `data.inputs`: Derived from `factorOrder` ($in_1, in_2, \dots, in_k$).
   - `data.outputs`: `out` carrying `responseName`.
   - `data.deploymentModel`: Structured canonical model payload.
2. **V-Lab Block (`doe_custom`)**:
   - Signal ports: Input ports for each factor in `factorOrder`, output port for `responseName`.
   - Parameters: `deploymentModel` serialized as string, preserving full fidelity.

---

## 5. Visualizations & Chart Acceptance Criteria

- **Surface / Contour Plot**:
  - Grid domain strictly bounded by min/max of active factor ranges.
  - Non-active factors held constant at their midpoint or specified hold values.
  - Trace matrices must be rectangular, non-empty, and free of `NaN`/`Infinity`.
- **Pareto Plot**:
  - Standardized effects $|t_i| = |\beta_i / SE(\beta_i)|$ sorted in descending order.
  - Reference Bonferroni/significance threshold line rendered at $\alpha = 0.05$.
- **Residual Diagnostics**:
  - Normal probability plot (Q-Q) against theoretical normal quantiles.
  - Residuals vs Run / Residuals vs Predicted scatter plot centered around zero.
- **Predicted vs Actual**:
  - $45^\circ$ reference line ($y = x$) spanning min/max of actual and predicted values.
