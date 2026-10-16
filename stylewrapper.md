AI Agent Directive: UI/UX Framework
Goal: Build the module set in the prompt while maintaining strict adherence to the "Green Safaris" Design System check dashboard.php or index.php files to see the aesthetics style.

1. Layout Architecture (No-Scroll Principle)
Viewports: The main page must be max-h-screen and overflow-hidden.

Scrolling: Only the inner Data Table or Modal body should scroll. The Header and Table Headers must remain Sticky (top-0).

Master-Detail View: Use a 25/75 split for data-heavy pages. Summary stats/filters on the left, interactive tables on the right.

2. Wide Modal Standards (The Audit View)
Dimensions: Use max-w-6xl or 90vw for complex tasks like "PO Approval."

Staff View: Implement a Side-by-Side layout inside the modal.

Left Side: Current Document/Form.

Right Side: Reference Data (e.g., Stock Levels, Supplier Quotations, or Par Levels).

Logic: Users must be able to compare data without closing the modal or switching tabs.

3. Data Table & Flow Logic
High Density: Use compact rows to handle 300+ items.
Bulk select items, bulk actions, pagination.

Virtualization: If the list exceeds 50 items, implement lazy loading or category-based filtering to maintain 60fps animations.

Traffic Light Indicators: >     * RED (bg-red-50 / text-red-700): Critical (Below Par / Urgent).

AMBER (bg-amber-50 / text-amber-700): Warning (Over-ordered / Potential Waste).

GREEN (bg-green-50 / text-green-700): Verified/Healthy.

Inputs: Use select-search for dropdowns and inline numeric inputs for quantities to reduce click-depth.

4. Aesthetics & Branding
Reference: Pull color variables and border-radius from the project's index.css or existing Layout.tsx.

Visuals: Maintain a "Glassmorphism" feel with soft shadows and rounded-xl corners on all cards and modals.