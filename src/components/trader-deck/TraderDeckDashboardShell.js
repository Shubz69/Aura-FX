import React from 'react';

/**
 * Outer frame and title for Trader Desk.
 * Optionally shows Edit/Save/Cancel when canEdit (admin/super_admin).
 */
export default function TraderDeckDashboardShell({ title = 'Trader Desk', children, canEdit, editMode, onEditToggle, onSave, onCancel }) {
  return (
    <div className="td-mi-shell">
      <div className="td-mi-shell-glow" aria-hidden />
      <div className="td-mi-shell-inner">
        {title && (
          <header className="td-mi-shell-header">
            <h1 className="td-mi-shell-title">{title}</h1>
            {canEdit && (
              <div className="td-mi-shell-actions">
                {!editMode ? (
                  <button type="button" className="td-mi-btn td-mi-btn-edit" onClick={onEditToggle} aria-label="Edit content">Edit</button>
                ) : (
                  <>
                    <button type="button" className="td-mi-btn td-mi-btn-save" onClick={onSave}>Save</button>
                    <button type="button" className="td-mi-btn td-mi-btn-cancel" onClick={onCancel}>Cancel</button>
                  </>
                )}
              </div>
            )}
          </header>
        )}
        <div className="td-mi-grid">
          {children}
        </div>
      </div>
    </div>
  );
}
