# UI Findings

## Expenses Page - Add Expense Dialog Issue

The Add Expense dialog on the Expenses page has a **single Category dropdown** instead of **multi-category checkboxes** like the Dashboard version.

Current implementation:
- Date field
- Amount field
- **Category field** (single select dropdown - "Select")
- Sub-Category field (optional)
- Allocation field
- Vendor field
- Notes field

**Required change:**
Update the Expenses page Add Expense dialog to use multi-category checkboxes (like Dashboard) instead of single category dropdown.

The multi-category checkbox implementation is already in AnimalWorkflows.tsx (lines 136-150) for the Dashboard version.

Need to find and update the Expenses page Add Expense dialog component to match this pattern.
