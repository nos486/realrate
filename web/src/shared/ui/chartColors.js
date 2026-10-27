/**
 * chartColors.js — Chart hues shared by the donut, bar and line charts
 *
 * CHART_COLORS is the categorical palette: fixed order, each hue ≥4.7:1 on the card surface and
 * every pair still apart under deuteranopia and protanopia (ΔE ≥ 9). It keeps away from the
 * semantic green / red / amber and the brand gold, so a slice never reads as profit, loss or debt.
 * Series take the hues in order; anything past the last folds into a neutral "Other".
 * The same values are the CSS tokens --cat-1 … --cat-8 and --cat-other (styles/tokens.css).
 *
 * CHART_SEMANTIC is for charts whose series mean money in / out (income vs expense, gain vs loss);
 * they match the semantic color tokens.
 */

export const CHART_COLORS = ['#3d7fe0', '#f08ac4', '#22b5c4', '#b58cf5', '#c9a978', '#93d5f5', '#9a6bc4', '#dcc49c'];
export const CHART_OTHER_COLOR = '#8190a5';

export const CHART_SEMANTIC = {
  positive: '#10b981',
  negative: '#f43f5e',
};
