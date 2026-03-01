# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight, single-page barcode generator web app. Pure vanilla JavaScript/HTML/CSS with no build system, no package manager, and no frameworks. Files are served directly to the browser.

## Architecture

Three source files make up the entire app:

- **index.html** - Entry point, loads CSS then JS (jsBarcode.js and main.js)
- **main.js** - All application logic: barcode generation, history management, drag-and-drop reordering, fullscreen mode, secret barcodes, modal system
- **main.css** - Tokyonight dark theme styling, layout via flexbox
- **jsBarcode.js** - Vendored third-party library (JsBarcode v3.11.0, minified), generates CODE128 SVG barcodes

## Key Concepts

- **History**: Saved barcodes persist in `localStorage` under key `barcodeHistory` as an array of `{ text, displayName }` objects. `displayName` is null for normal items, a string for "secret" barcodes.
- **Secret barcodes**: Created via long-press (500ms) on the save button. Prompts for a display name and hides the encoded value.
- **Fullscreen mode**: Clicking the barcode container toggles fullscreen with scaled barcode options (wider bars, taller height, larger font).
- **Drag-and-drop reorder**: Desktop uses HTML5 drag API; mobile uses touch events with a 200ms drag threshold.

## Layout Structure

The `.layout` is a flex row: a fixed 80px `.barcode-container` sidebar on the left (barcode SVG rotated -90deg) and `.controls` on the right (input, history list, instructions).
