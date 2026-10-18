/**
 * DashScroll.jsx — The scrolling part of a widget that has no list of its own: the widget's card
 * keeps its size and only this content scrolls when it does not fit. A widget with nothing to
 * show leaves it empty, and the page hides the widget.
 */

import React from 'react';

/** @param {{ children?: React.ReactNode }} props */
export default function DashScroll({ children }) {
  return <div className="dash-scroll">{children}</div>;
}
